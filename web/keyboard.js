// Clavier : on envoie à la machine la TOUCHE PHYSIQUE appuyée (event.code), pas le caractère.
// C'est le Linux de la machine, réglé en français (voir image/Dockerfile), qui traduit
// la touche en caractère : accents, AltGr, touches mortes, tout fonctionne comme sur un vrai PC.
(() => {
  // Codes PS/2 "set 1". Les touches étendues sont préfixées par 0xE0.
  const MAP = {
    Escape: [0x01],
    Digit1: [0x02], Digit2: [0x03], Digit3: [0x04], Digit4: [0x05], Digit5: [0x06],
    Digit6: [0x07], Digit7: [0x08], Digit8: [0x09], Digit9: [0x0a], Digit0: [0x0b],
    Minus: [0x0c], Equal: [0x0d], Backspace: [0x0e], Tab: [0x0f],
    KeyQ: [0x10], KeyW: [0x11], KeyE: [0x12], KeyR: [0x13], KeyT: [0x14],
    KeyY: [0x15], KeyU: [0x16], KeyI: [0x17], KeyO: [0x18], KeyP: [0x19],
    BracketLeft: [0x1a], BracketRight: [0x1b], Enter: [0x1c], ControlLeft: [0x1d],
    KeyA: [0x1e], KeyS: [0x1f], KeyD: [0x20], KeyF: [0x21], KeyG: [0x22],
    KeyH: [0x23], KeyJ: [0x24], KeyK: [0x25], KeyL: [0x26],
    Semicolon: [0x27], Quote: [0x28], Backquote: [0x29], ShiftLeft: [0x2a], Backslash: [0x2b],
    KeyZ: [0x2c], KeyX: [0x2d], KeyC: [0x2e], KeyV: [0x2f], KeyB: [0x30],
    KeyN: [0x31], KeyM: [0x32], Comma: [0x33], Period: [0x34], Slash: [0x35],
    ShiftRight: [0x36], NumpadMultiply: [0x37], AltLeft: [0x38], Space: [0x39], CapsLock: [0x3a],
    F1: [0x3b], F2: [0x3c], F3: [0x3d], F4: [0x3e], F5: [0x3f],
    F6: [0x40], F7: [0x41], F8: [0x42], F9: [0x43], F10: [0x44],
    NumLock: [0x45], ScrollLock: [0x46],
    Numpad7: [0x47], Numpad8: [0x48], Numpad9: [0x49], NumpadSubtract: [0x4a],
    Numpad4: [0x4b], Numpad5: [0x4c], Numpad6: [0x4d], NumpadAdd: [0x4e],
    Numpad1: [0x4f], Numpad2: [0x50], Numpad3: [0x51], Numpad0: [0x52], NumpadDecimal: [0x53],
    IntlBackslash: [0x56], F11: [0x57], F12: [0x58],
    NumpadEnter: [0xe0, 0x1c], ControlRight: [0xe0, 0x1d], NumpadDivide: [0xe0, 0x35],
    AltRight: [0xe0, 0x38],
    Home: [0xe0, 0x47], ArrowUp: [0xe0, 0x48], PageUp: [0xe0, 0x49],
    ArrowLeft: [0xe0, 0x4b], ArrowRight: [0xe0, 0x4d],
    End: [0xe0, 0x4f], ArrowDown: [0xe0, 0x50], PageDown: [0xe0, 0x51],
    Insert: [0xe0, 0x52], Delete: [0xe0, 0x53]
  };
  // Ces touches restent au navigateur (actualiser, plein écran, outils)
  const BROWSER_KEYS = ["F5", "F11", "F12"];

  let emu = null;
  const down = new Set();

  function make(code) {
    const m = MAP[code];
    return m.length === 2 ? [m[0], m[1]] : [m[0]];
  }
  function brk(code) {
    const m = MAP[code];
    return m.length === 2 ? [m[0], m[1] | 0x80] : [m[0] | 0x80];
  }

  function onKeyDown(e) {
    if (!emu) return;
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.metaKey || BROWSER_KEYS.includes(e.code) || !MAP[e.code]) return;
    e.preventDefault();
    down.add(e.code);
    emu.keyboard_send_scancodes(make(e.code));
  }

  function onKeyUp(e) {
    if (!emu || !MAP[e.code]) return;
    e.preventDefault();
    if (down.delete(e.code)) emu.keyboard_send_scancodes(brk(e.code));
  }

  function releaseAll() {
    if (!emu) return;
    for (const code of down) emu.keyboard_send_scancodes(brk(code));
    down.clear();
  }

  window.VMKeyboard = {
    attach(emulator) {
      emu = emulator;
      // coupe le clavier intégré de v86, pour ne pas envoyer les touches deux fois
      try { emu.keyboard_set_enabled(false); } catch {}
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("keyup", onKeyUp, true);
      window.addEventListener("blur", releaseAll);
    },
    detach() {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", releaseAll);
      down.clear();
      emu = null;
    }
  };
})();
