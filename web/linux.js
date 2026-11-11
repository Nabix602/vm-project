// Pont entre le bureau Windows 11 et la vraie machine Linux (v86) qui tourne en arrière-plan.
// - terminal : les touches vont à la console série, la sortie revient telle quelle (xterm.js)
// - run(cmd) : exécute une commande dans le même Linux et renvoie son texte (explorateur, installation…)
window.LinuxVM = (() => {
  const cfg = window.VM_CONFIG;
  let emu = null, state = "off"; // off | boot | ready | error
  let muted = true;              // la sortie n'est montrée au terminal qu'une fois la machine prête
  let capture = null;            // commande en cours de capture
  let seq = 100;
  const queue = [];
  const subs = new Set(), stateSubs = new Set();
  const dec = new TextDecoder();

  const setState = (s, info) => { state = s; stateSubs.forEach((f) => f(s, info)); };

  // ---------- Sauvegarde (même base que la page « Machine ») ----------
  const DB = "vm-project", STORE = "state", KEY = "last";
  const openDB = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  async function dbGet() {
    const db = await openDB();
    return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
  }
  async function dbPut(v) {
    const db = await openDB();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(v, KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error("stockage refusé")); });
  }
  async function hasSaved() { try { return !!(await dbGet()); } catch { return false; } }
  async function gz(buf, mode) {
    const s = new Blob([buf]).stream().pipeThrough(mode === "z" ? new CompressionStream("gzip") : new DecompressionStream("gzip"));
    return new Response(s).arrayBuffer();
  }
  async function unpack(rec) {
    if (!rec) return null;
    if (rec.gz) return gz(rec.data, "u");
    return rec.data || rec;
  }

  // ---------- Démarrage ----------
  function start({ restore = false } = {}) {
    const Ctor = window.V86 || window.V86Starter;
    if (!Ctor) { setState("error", "émulateur absent"); return; }
    setState("boot");
    const params = new URLSearchParams(location.search);
    const opt = {
      wasm_path: "build/v86.wasm",
      memory_size: cfg.memoryMB * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      screen_container: document.getElementById("vmhidden"),
      bios: { url: "bios/seabios.bin" },
      vga_bios: { url: "bios/vgabios.bin" },
      bzimage_initrd_from_filesystem: true,
      // Console seule (pas de bureau Linux) : le plus rapide
      cmdline: cfg.cmdline + " video=Virtual-1:640x400",
      filesystem: { baseurl: cfg.fsBase, basefs: cfg.fsJson },
      autostart: !restore
    };
    if (cfg.networkRelay && params.get("net") !== "0") opt.net_device = { type: "virtio", relay_url: cfg.networkRelay };
    try { emu = new Ctor(opt); } catch (e) { setState("error", e.message); return; }
    window.__vm = emu;
    emu.add_listener("serial0-output-byte", onByte);
    emu.add_listener("emulator-ready", async () => {
      if (restore) {
        try { await emu.restore_state(await unpack(await dbGet())); } catch (e) { setState("error", "reprise impossible : " + (e.message || e)); return; }
        emu.run();
      }
      waitReady(restore);
    });
  }

  // On attend que le shell réponde (sans rien afficher), puis on libère le terminal
  function waitReady(restored) {
    let tries = 0;
    const probe = () => {
      if (state === "ready") return;
      if (++tries > 400) { setState("error", "le shell ne répond pas"); return; }
      const id = ++seq;
      capture = { id, probe: true, bytes: [], done: () => { capture = null; muted = false; setState("ready", restored ? "reprise" : "neuf"); pump(); setTimeout(() => send("\n"), 100); } };
      emu.serial0_send(`echo "__S_$((${id}*1))__"; echo "__E_$((${id}*1))__"\n`);
      setTimeout(() => { if (capture && capture.probe && capture.id === id) { capture = null; setTimeout(probe, 1500); } }, 4000);
    };
    setTimeout(probe, restored ? 500 : 8000);
  }

  // ---------- Octets de la console ----------
  function onByte(b) {
    if (capture) {
      capture.bytes.push(b);
      if (b === 10 || b === 13 || b === 95) {
        const tail = String.fromCharCode(...capture.bytes.slice(-40));
        if (tail.includes(`__E_${capture.id}__`)) { const c = capture; if (c.probe) c.done(); else finish(c); }
      }
      return;
    }
    if (muted) return;
    if (subs.size) { const u = Uint8Array.of(b); subs.forEach((f) => f(u)); }
  }
  function finish(c) {
    const txt = dec.decode(Uint8Array.from(c.bytes)).replace(/\r/g, "");
    const m = txt.split(`__S_${c.id}__\n`);
    let out = m.length > 1 ? m[m.length - 1] : "";
    out = out.split(`__E_${c.id}__`)[0];
    capture = null;
    c.resolve(out.replace(/\n$/, ""));
    pump();
  }
  function pump() {
    if (capture || state !== "ready" || !queue.length) return;
    const q = queue.shift();
    const id = ++seq;
    capture = { id, bytes: [], resolve: q.resolve };
    emu.serial0_send(`echo "__S_$((${id}*1))__"; { ${q.cmd} ; } 2>&1; echo "__E_$((${id}*1))__"\n`);
    if (q.ms) setTimeout(() => { if (capture && capture.id === id) { const c = capture; capture = null; c.resolve("(délai dépassé)"); pump(); } }, q.ms);
  }

  const send = (s) => { if (emu && state === "ready") emu.serial0_send(s); };
  const run = (cmd, ms = 60000) => new Promise((resolve) => { queue.push({ cmd, resolve, ms }); pump(); });
  const quote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

  // ---------- Fichiers Linux ----------
  async function list(dir) {
    const out = await run(`cd ${quote(dir)} 2>/dev/null && ls -1Ap || echo __ERR__`);
    if (out.trim() === "__ERR__") return null;
    return out.split("\n").filter(Boolean).map((n) => (n.endsWith("/") ? { name: n.slice(0, -1), dir: true } : { name: n.replace(/[*@=|]$/, ""), dir: false }));
  }
  async function readFile(path) { return run(`head -c 200000 ${quote(path)}`); }
  async function writeFile(path, text) {
    const b64 = btoa(unescape(encodeURIComponent(text)));
    await run(`rm -f /tmp/up.b64`);
    for (let i = 0; i < b64.length; i += 900) await run(`printf %s '${b64.slice(i, i + 900)}' >> /tmp/up.b64`);
    return run(`base64 -d /tmp/up.b64 > ${quote(path)} && echo ok`);
  }

  async function save(onStep) {
    if (!emu || state !== "ready") throw new Error("la machine n'est pas prête");
    onStep && onStep("Sauvegarde…");
    await run("sync");
    const raw = await emu.save_state();
    onStep && onStep("Compression…");
    const data = await gz(raw, "z");
    onStep && onStep("Enregistrement…");
    await dbPut({ gz: true, data });
    return data.byteLength;
  }

  return {
    start, send, run, list, readFile, writeFile, save, hasSaved, quote,
    get state() { return state; },
    onOutput: (f) => { subs.add(f); return () => subs.delete(f); },
    onState: (f) => { stateSubs.add(f); return () => stateSubs.delete(f); },
    mute(ms) { muted = true; setTimeout(() => { if (state === "ready") muted = false; }, ms); }
  };
})();
