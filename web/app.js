(() => {
  const cfg = window.VM_CONFIG;
  const $ = (id) => document.getElementById(id);

  // ---------- Outils : code d'accès ----------
  const HASH_KEY = "vm-project:code-hash";

  async function sha256(text) {
    const data = new TextEncoder().encode("vm-project:" + text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function readHash() {
    try { return localStorage.getItem(HASH_KEY); } catch { return null; }
  }
  function writeHash(h) {
    try { localStorage.setItem(HASH_KEY, h); return true; } catch { return false; }
  }

  // ---------- Outils : sauvegarde dans IndexedDB ----------
  const DB_NAME = "vm-project";
  const STORE = "state";
  const KEY = "last";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      // espace de stockage insuffisant, navigation privée, etc.
      tx.onabort = () => reject(tx.error || new Error("stockage refusé par le navigateur (espace insuffisant ?)"));
    });
  }

  async function dbHas() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).count(KEY);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => reject(req.error);
    });
  }

  // L'état de la machine est surtout de la mémoire vide : compressé, il est 3 à 10 fois plus petit.
  async function pack(buf) {
    if (typeof CompressionStream === "undefined") return { gz: false, data: buf };
    const data = await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
    return { gz: true, data };
  }

  async function unpack(rec) {
    if (!rec) return null;
    if (rec instanceof ArrayBuffer) return rec;           // ancien format (non compressé)
    if (!rec.gz) return rec.data;
    return new Response(new Blob([rec.data]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  }

  // ---------- Écrans ----------
  function show(id) {
    for (const s of ["lock", "boot", "machine"]) $(s).hidden = s !== id;
  }

  // ---------- Verrouillage ----------
  // Après "Éteindre", la page se recharge (machine toute neuve) sans redemander le code, une seule fois.
  const SKIP_KEY = "vm-project:skip-lock-once";
  function consumeSkipLock() {
    try {
      const v = sessionStorage.getItem(SKIP_KEY) === "1";
      sessionStorage.removeItem(SKIP_KEY);
      return v;
    } catch { return false; }
  }

  async function initLock() {
    const stored = readHash();
    if (stored && consumeSkipLock()) {
      await initBoot();
      return;
    }
    if (stored) {
      $("lock-text").textContent = "Entre ton code d'accès.";
      $("lock-button").textContent = "Entrer";
    }

    $("lock-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = $("lock-input").value;
      const hash = await sha256(code);
      const err = $("lock-error");
      err.hidden = true;

      const current = readHash();
      if (!current) {
        if (code.length < 4) {
          err.textContent = "Le code doit faire au moins 4 caractères.";
          err.hidden = false;
          return;
        }
        if (!writeHash(hash)) {
          err.textContent = "Impossible d'enregistrer le code dans ce navigateur.";
          err.hidden = false;
          return;
        }
      } else if (current !== hash) {
        err.textContent = "Code incorrect.";
        err.hidden = false;
        $("lock-input").value = "";
        return;
      }

      $("lock-input").value = "";
      await initBoot();
    });
  }

  // ---------- Démarrage ----------
  let emulator = null;
  let hasSaved = false;

  async function initBoot() {
    show("boot");
    try { hasSaved = await dbHas(); } catch { hasSaved = false; }
    $("btn-resume").hidden = !hasSaved;
    $("boot-status").textContent = hasSaved
      ? "Une session sauvegardée existe sur cet appareil."
      : "";
  }

  function emulatorClass() {
    return window.V86 || window.V86Starter;
  }

  function startMachine(restore) {
    const Ctor = emulatorClass();
    if (!Ctor) {
      $("boot-status").textContent =
        "L'émulateur n'est pas chargé (build/libv86.js manquant). Regarde le déploiement sur GitHub.";
      return;
    }

    $("btn-resume").disabled = true;
    $("btn-fresh").disabled = true;
    $("boot-status").textContent = "Démarrage…";

    const params = new URLSearchParams(location.search);
    const wantDesktop = params.get("desktop") ? params.get("desktop") === "1" : cfg.desktop;
    const options = {
      wasm_path: "build/v86.wasm",
      memory_size: cfg.memoryMB * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      screen_container: $("screen_container"),
      bios: { url: "bios/seabios.bin" },
      vga_bios: { url: "bios/vgabios.bin" },
      bzimage_initrd_from_filesystem: true,
      cmdline: (params.get("rawcmd") || cfg.cmdline) + (wantDesktop ? " desktop=1" : "") + (params.get("cmd") ? " " + params.get("cmd") : ""),
      filesystem: { baseurl: cfg.fsBase, basefs: cfg.fsJson },
      autostart: !restore
    };
    // Options de mise au point : ?net=0 coupe le réseau, ?mac=1 garde la même adresse MAC à la reprise
    const q = new URLSearchParams(location.search);
    if (cfg.networkRelay && q.get("net") !== "0") {
      options.net_device = { type: "virtio", relay_url: cfg.networkRelay };
    }
    if (q.get("mac") === "1") options.preserve_mac_from_state_image = true;

    try {
      emulator = new Ctor(options);
      window.__vm = emulator; // utilisé par les tests automatiques
    } catch (e) {
      $("boot-status").textContent = "Erreur au démarrage : " + e.message;
      $("btn-resume").disabled = false;
      $("btn-fresh").disabled = false;
      return;
    }

    emulator.add_listener("emulator-ready", async () => {
      let resumed = false;
      if (restore) {
        try {
          const state = await unpack(await dbGet());
          if (!state) throw new Error("aucune sauvegarde trouvée");
          await emulator.restore_state(state);
          resumed = true;
        } catch (e) {
          // Ne jamais lancer une machine à moitié restaurée : on revient à l'écran de démarrage
          console.error("Reprise impossible :", e);
          try { await emulator.destroy(); } catch {}
          emulator = null;
          show("boot");
          $("boot-status").textContent =
            "Impossible de reprendre la session sauvegardée (" + (e && e.message ? e.message : e) + "). Tu peux démarrer à neuf.";
          $("btn-resume").disabled = false;
          $("btn-fresh").disabled = false;
          return;
        }
        emulator.run();
      }
      show("machine");
      window.VMKeyboard.attach(emulator);
      fitScreen();
      emulator.add_listener("screen-set-size", () => setTimeout(fitScreen, 50));
      setLabel(resumed ? "Session reprise." : "Linux démarre…");
      $("btn-resume").disabled = false;
      $("btn-fresh").disabled = false;
    });
  }

  function setLabel(text) {
    $("state-label").textContent = text;
  }

  // ---------- Actions de la machine ----------
  function saveState() {
    return new Promise((resolve, reject) => {
      try {
        // Selon la version de v86, la sauvegarde passe par une promesse ou un callback.
        const r = emulator.save_state((err, state) => (err ? reject(err) : resolve(state)));
        if (r && typeof r.then === "function") r.then(resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function onSave() {
    if (!emulator) return;
    $("btn-save").disabled = true;
    setLabel("Sauvegarde en cours…");
    try {
      const state = await saveState();
      setLabel("Compression…");
      const rec = await pack(state);
      setLabel("Enregistrement…");
      await dbPut(rec);
      const mb = (rec.data.byteLength / 1048576).toFixed(1);
      setLabel("Sauvegardé (" + mb + " Mo) à " + new Date().toLocaleTimeString("fr-FR"));
    } catch (e) {
      setLabel("Échec de la sauvegarde : " + e.message);
    }
    $("btn-save").disabled = false;
  }

  async function onStop() {
    if (!emulator) return;
    if (!confirm("Éteindre la machine ? Ce qui n'est pas sauvegardé sera perdu.")) return;
    window.VMKeyboard.detach();
    try { await emulator.destroy(); } catch {}
    emulator = null;
    // On repart d'une page propre : recréer une machine dans la même page rendait la reprise instable
    try { sessionStorage.setItem(SKIP_KEY, "1"); } catch {}
    location.reload();
  }

  // Adapte la taille de l'écran de la machine à la fenêtre (la souris suit : v86 gère l'échelle)
  function fitScreen() {
    if (!emulator) return;
    const box = $("screen_container");
    const c = box.querySelector("canvas");
    const d = box.querySelector("div");
    const native = c && c.width && c.style.display !== "none" ? [c.width, c.height] : [720, 400];
    const fs = !!document.fullscreenElement;
    const bar = document.querySelector(".bar");
    const availW = fs ? window.innerWidth : window.innerWidth - 24;
    const availH = fs ? window.innerHeight : window.innerHeight - (bar ? bar.offsetHeight : 0) - 70;
    let s = Math.min(availW / native[0], availH / native[1]);
    s = Math.max(0.4, Math.min(2.5, s));
    try { emulator.screen_set_scale(s, s); } catch {}
  }
  window.addEventListener("resize", fitScreen);
  document.addEventListener("fullscreenchange", fitScreen);

  function onFullscreen() {
    const el = $("screen_container");
    if (el.requestFullscreen) el.requestFullscreen();
  }

  // ---------- Branchements ----------
  $("btn-fresh").addEventListener("click", () => startMachine(false));
  $("btn-resume").addEventListener("click", () => startMachine(true));
  $("btn-save").addEventListener("click", onSave);
  $("btn-stop").addEventListener("click", onStop);
  $("btn-fullscreen").addEventListener("click", onFullscreen);

  initLock();
})();
