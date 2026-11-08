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
    });
  }

  // ---------- Écrans ----------
  function show(id) {
    for (const s of ["lock", "boot", "machine"]) $(s).hidden = s !== id;
  }

  // ---------- Verrouillage ----------
  async function initLock() {
    const stored = readHash();
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
    try { hasSaved = !!(await dbGet()); } catch { hasSaved = false; }
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

    const options = {
      wasm_path: "build/v86.wasm",
      memory_size: cfg.memoryMB * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      screen_container: $("screen_container"),
      bios: { url: "bios/seabios.bin" },
      vga_bios: { url: "bios/vgabios.bin" },
      bzimage: { url: cfg.kernel },
      cmdline: cfg.cmdline,
      autostart: !restore
    };
    if (cfg.networkRelay) options.network_relay_url = cfg.networkRelay;

    try {
      emulator = new Ctor(options);
    } catch (e) {
      $("boot-status").textContent = "Erreur au démarrage : " + e.message;
      $("btn-resume").disabled = false;
      $("btn-fresh").disabled = false;
      return;
    }

    emulator.add_listener("emulator-ready", async () => {
      if (restore) {
        try {
          const state = await dbGet();
          if (state) {
            await emulator.restore_state(state);
          }
        } catch (e) {
          setLabel("Restauration impossible : " + e.message);
        }
        emulator.run();
      }
      show("machine");
      window.FrenchKeyboard.attach(emulator);
      setLabel(restore ? "Session reprise." : "Machine démarrée.");
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
      await dbPut(state);
      const mb = (state.byteLength / 1048576).toFixed(1);
      setLabel("Sauvegardé (" + mb + " Mo) à " + new Date().toLocaleTimeString("fr-FR"));
    } catch (e) {
      setLabel("Échec de la sauvegarde : " + e.message);
    }
    $("btn-save").disabled = false;
  }

  async function onStop() {
    if (!emulator) return;
    if (!confirm("Éteindre la machine ? Ce qui n'est pas sauvegardé sera perdu.")) return;
    window.FrenchKeyboard.detach();
    try { await emulator.destroy(); } catch {}
    emulator = null;
    $("screen_container").querySelector("div").textContent = "";
    await initBoot();
  }

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
