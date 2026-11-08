// Clavier français (AZERTY) pour la machine.
//
// Le Linux de la machine croit avoir un clavier américain (QWERTY). Plutôt que de
// charger une disposition dans Linux, on lit le caractère que ton clavier produit
// (event.key) et on envoie à la machine la touche américaine qui donne ce même caractère.
// Résultat : ce que tu tapes est ce qui s'affiche, quelle que soit ta disposition.
(() => {
  // caractère -> [code de touche (scancode PS/2), Maj nécessaire ?]
  const CHARS = {};
  function add(chars, start, shift) {
    [...chars].forEach((c, i) => { CHARS[c] = [start + i, shift]; });
  }
  add("1234567890-=", 0x02, false);
  add("!@#$%^&*()_+", 0x02, true);
  add("qwertyuiop[]", 0x10, false);
  add("QWERTYUIOP{}", 0x10, true);
  add("asdfghjkl;'`", 0x1e, false);
  add('ASDFGHJKL:"~', 0x1e, true);
  CHARS["\\"] = [0x2b, false];
  CHARS["|"] = [0x2b, true];
  add("zxcvbnm,./", 0x2c, false);
  add("ZXCVBNM<>?", 0x2c, true);
  CHARS[" "] = [0x39, false];

  // touches spéciales : [codes] (E0 = touche étendue)
  const SPECIAL = {
    Enter: [0x1c],
    Backspace: [0x0e],
    Tab: [0x0f],
    Escape: [0x01],
    ArrowUp: [0xe0, 0x48],
    ArrowDown: [0xe0, 0x50],
    ArrowLeft: [0xe0, 0x4b],
    ArrowRight: [0xe0, 0x4d],
    Home: [0xe0, 0x47],
    End: [0xe0, 0x4f],
    PageUp: [0xe0, 0x49],
    PageDown: [0xe0, 0x51],
    Insert: [0xe0, 0x52],
    Delete: [0xe0, 0x53]
  };
  const IGNORED = ["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock", "Dead", "Unidentified"];
  const SHIFT = 0x2a, CTRL = 0x1d, ALT = 0x38;

  let emu = null;

  function press(codes) {
    // appui + relâchement d'une touche (les extensions E0 gardent leur préfixe)
    if (codes[0] === 0xe0) return [0xe0, codes[1], 0xe0, codes[1] | 0x80];
    return [codes[0], codes[0] | 0x80];
  }

  function onKeyDown(e) {
    if (!emu) return;
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.metaKey) return;

    const key = e.key;
    if (IGNORED.includes(key)) {
      if (key === "Dead") e.preventDefault();
      return;
    }
    // F5, F11, F12 restent au navigateur (actualiser, plein écran, outils)
    if (key === "F5" || key === "F11" || key === "F12") return;

    const altgr = e.getModifierState && e.getModifierState("AltGraph");
    const ctrlAlt = e.ctrlKey && e.altKey;           // AltGr sous Windows
    const ctrl = e.ctrlKey && !altgr && !ctrlAlt;
    const alt = e.altKey && !altgr && !e.ctrlKey;

    let body = null;
    let needShift = false;

    if (SPECIAL[key]) {
      body = press(SPECIAL[key]);
      needShift = e.shiftKey;
    } else if (/^F([1-9]|10)$/.test(key)) {
      body = press([0x3b + parseInt(key.slice(1), 10) - 1]);
      needShift = e.shiftKey;
    } else if (key.length === 1) {
      const entry = CHARS[ctrl ? key.toLowerCase() : key];
      if (!entry) { e.preventDefault(); return; }   // ex. é, è, à : pas de touche américaine
      body = press([entry[0]]);
      needShift = ctrl ? false : entry[1];
    } else {
      return;
    }

    const seq = [];
    if (ctrl) seq.push(CTRL);
    if (alt) seq.push(ALT);
    if (needShift) seq.push(SHIFT);
    seq.push(...body);
    if (needShift) seq.push(SHIFT | 0x80);
    if (alt) seq.push(ALT | 0x80);
    if (ctrl) seq.push(CTRL | 0x80);

    e.preventDefault();
    emu.keyboard_send_scancodes(seq);
  }

  function onKeyUp(e) {
    // le relâchement est déjà envoyé avec l'appui
    if (emu) e.preventDefault();
  }

  window.FrenchKeyboard = {
    attach(emulator) {
      emu = emulator;
      try { emu.keyboard_set_status(false); } catch {}   // coupe le clavier natif de v86
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("keyup", onKeyUp, true);
    },
    detach() {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      emu = null;
    }
  };
})();
