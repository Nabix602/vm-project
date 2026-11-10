// Test de bout en bout : un vrai Chromium ouvre le site, démarre la machine et l'utilise.
// Lancé par GitHub Actions. Les contrôles "critiques" bloquent la publication, les autres informent.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:8080/";
const OUT = process.env.OUT_DIR || "tests/out";
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0) + "s";

async function check(name, fn, { critical = true } = {}) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, critical, detail: detail || "" });
    console.log(`[${secs()}] OK    ${name}${detail ? " — " + String(detail).slice(0, 200) : ""}`);
    return true;
  } catch (e) {
    const msg = String(e && e.message ? e.message : e).replace(/\s*\n\s*/g, " ⏎ ").slice(0, 500);
    results.push({ name, ok: false, critical, detail: msg });
    console.log(`[${secs()}] FAIL  ${critical ? "" : "(info) "}${name} — ${msg}`);
    return false;
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

// Profil persistant (comme un vrai navigateur, pas une fenêtre privée : les quotas de stockage sont normaux)
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync("/tmp/profil-"), {
  args: ["--no-sandbox"],
  viewport: { width: 1280, height: 900 }
});
const browser = ctx;
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
let verbose = false;
page.on("console", (m) => { if (m.type() === "error" || verbose) console.log(`  [console.${m.type()}]`, m.text().slice(0, 300)); });
page.on("dialog", (d) => d.accept());

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});

// ---------- Aides pour parler à la machine par la console série ----------
async function hookSerial() {
  await page.waitForFunction(() => window.__vm, null, { polling: 50, timeout: 60000 });
  await page.evaluate(() => {
    window.__serial = "";
    window.__vm.add_listener("serial0-output-byte", (b) => { window.__serial += String.fromCharCode(b); });
  });
}
const serialText = () => page.evaluate(() => window.__serial);

async function waitPrompt(timeoutMs) {
  const end = Date.now() + timeoutMs;
  let lastNudge = 0;
  while (Date.now() < end) {
    const s = await serialText();
    if (/localhost:~# $/.test(s) || s.includes("localhost:~# ")) return;
    if (Date.now() - lastNudge > 15000) {
      lastNudge = Date.now();
      await page.evaluate(() => window.__vm.serial0_send("\n"));
    }
    await page.waitForTimeout(500);
  }
  throw new Error("pas de prompt après " + timeoutMs / 1000 + "s ; fin du journal : " + JSON.stringify((await serialText()).slice(-300)));
}

let counter = 1000;
async function sh(cmd, timeoutMs = 60000) {
  counter++;
  const marker = `__END_${counter}__`;
  const start = (await serialText()).length;
  await page.evaluate(([c, n]) => window.__vm.serial0_send(`${c}\necho "__END_$((${n}*1))__"\n`), [cmd, counter]);
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const s = await serialText();
    const i = s.indexOf(marker, start);
    if (i >= 0) return s.slice(start, i);
    await page.waitForTimeout(300);
  }
  throw new Error(`délai dépassé pour : ${cmd}`);
}

// Ce que Linux affiche à l'écran (console tty1), lu depuis le système lui-même
const screenText = async () => (await sh("fold -w 80 /dev/vcs1 | tr -d '\\000' | sed 's/ *$//' | grep -v '^$' | tail -12", 30000).catch((e) => "(écran illisible : " + e.message + ")"));

// Touches physiques d'un clavier AZERTY français : caractère -> [modificateur, touche]
const AZERTY = {
  a: [null, "KeyQ"], z: [null, "KeyW"], q: [null, "KeyA"], w: [null, "KeyZ"], m: [null, "Semicolon"],
  ",": [null, "KeyM"], ";": [null, "Comma"], ":": [null, "Period"], "!": [null, "Slash"],
  ".": ["ShiftLeft", "Comma"], "/": ["ShiftLeft", "Period"],
  "-": [null, "Digit6"], "_": [null, "Digit8"], " ": [null, "Space"],
  "<": [null, "IntlBackslash"], ">": ["ShiftLeft", "IntlBackslash"],
  "é": [null, "Digit2"], "è": [null, "Digit7"], "ç": [null, "Digit9"], "à": [null, "Digit0"],
  "|": ["AltRight", "Digit6"], "@": ["AltRight", "Digit0"], "#": ["AltRight", "Digit3"],
  "{": ["AltRight", "Digit4"], "[": ["AltRight", "Digit5"], "\\": ["AltRight", "Digit8"]
};
for (const c of "etyuiopdfghjklxcvbn") AZERTY[c] = [null, "Key" + c.toUpperCase()];
for (const c of "rs") AZERTY[c] = [null, "Key" + c.toUpperCase()];
for (const d of "1234567890") AZERTY[d] = ["ShiftLeft", d === "0" ? "Digit0" : "Digit" + d];

async function typeAzerty(text) {
  for (const ch of text) {
    const [mod, code] = AZERTY[ch] || (() => { throw new Error("touche inconnue : " + ch); })();
    if (mod) await page.keyboard.down(mod);
    await page.keyboard.press(code);
    if (mod) await page.keyboard.up(mod);
    await page.waitForTimeout(60);
  }
  await page.keyboard.press("Enter");
}

// =========================== 1. Écran de verrouillage ===========================
await page.goto(BASE);
await check("Verrouillage : l'écran de code s'affiche", async () => {
  await page.waitForSelector("#lock:not([hidden])");
  expect((await page.textContent("#lock-text")).includes("Choisis"), "texte inattendu");
});
await check("Verrouillage : un code trop court est refusé", async () => {
  await page.fill("#lock-input", "12");
  await page.click("#lock-button");
  await page.waitForSelector("#lock-error:not([hidden])");
});
await check("Verrouillage : un bon code ouvre l'écran de démarrage", async () => {
  await page.fill("#lock-input", "1234");
  await page.click("#lock-button");
  await page.waitForSelector("#boot:not([hidden])");
});
await check("Verrouillage : après rechargement, le code est redemandé", async () => {
  await page.reload();
  await page.waitForSelector("#lock:not([hidden])");
  expect((await page.textContent("#lock-text")).includes("Entre"), "devrait demander le code");
});
await check("Verrouillage : un mauvais code est refusé", async () => {
  await page.fill("#lock-input", "9999");
  await page.click("#lock-button");
  await page.waitForSelector("#lock-error:not([hidden])");
});
await check("Verrouillage : le bon code est accepté", async () => {
  await page.fill("#lock-input", "1234");
  await page.click("#lock-button");
  await page.waitForSelector("#boot:not([hidden])");
});

// =========================== 2. Démarrage ===========================
await page.click("#btn-fresh");
const bootStart = Date.now();
const booted = await check("Démarrage : l'écran de la machine apparaît", async () => {
  await page.waitForSelector("#machine:not([hidden])", { timeout: 120000 });
});
await hookSerial();
const prompted = booted && await check("Démarrage : Linux arrive jusqu'au prompt", async () => {
  await waitPrompt(420000);
  return `${((Date.now() - bootStart) / 1000).toFixed(0)} s`;
});
await shot("01-apres-demarrage");

if (prompted) {
  await check("Écran : la console de Linux est bien affichée", async () => {
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const c = document.querySelector("#screen_container canvas");
      const d = document.querySelector("#screen_container div");
      const textLen = (d?.innerText || "").trim().length;
      let lit = 0, shown = false, w = 0, h = 0;
      if (c) {
        shown = getComputedStyle(c).display !== "none";
        w = c.width; h = c.height;
        try {
          const data = c.getContext("2d").getImageData(0, 0, w, h).data;
          for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
        } catch (e) { /* canvas illisible */ }
      }
      return { canvasVisible: shown, w, h, pixelsClairs: lit, caracteres: textLen };
    });
    expect((r.canvasVisible && r.pixelsClairs > 500) || r.caracteres > 50, "écran vide : " + JSON.stringify(r));
    return JSON.stringify(r);
  });

  // =========================== 3. Système et outils ===========================
  await check("Linux : noyau et architecture", async () => {
    const o = await sh("uname -srm");
    expect(/Linux/.test(o) && /i[3-6]86/.test(o), o);
    return o.split("\n").find((l) => /Linux/.test(l) && !/uname/.test(l));
  });
  await check("Fichiers : écrire puis relire", async () => {
    const o = await sh("echo bonjour-$((40+2)) > /root/test.txt; cat /root/test.txt");
    expect(o.includes("bonjour-42"), o);
  });
  for (const [label, cmd, re] of [
    ["git", "git --version", /git version \d/],
    ["Python", "python3 --version", /Python 3\.\d+/],
    ["Node", "node --version", /v\d+\.\d+/],
    ["npm", "npm --version", /^\d+\.\d+/m],
    ["nano", "nano --version", /GNU nano/],
    ["gcc", "gcc --version", /gcc/i],
    ["make", "make --version", /GNU Make/],
    ["curl", "curl --version", /curl \d/]
  ]) {
    await check(`Outils : ${label}`, async () => {
      const o = await sh(cmd);
      expect(re.test(o), o.slice(0, 200));
      return o.split("\n").find((l) => re.test(l));
    });
  }
  await check("Python exécute du code", async () => {
    expect((await sh("python3 -c 'print(6*7)'")).includes("42"), "pas de 42");
  });
  await check("Node exécute du code", async () => {
    expect((await sh("node -e 'console.log(6*7)'")).includes("42"), "pas de 42");
  });
  await check("gcc compile et lance un programme C", async () => {
    const o = await sh(`printf '#include <stdio.h>\\nint main(){puts("c-" "4" "2");return 0;}\\n' > /tmp/h.c && gcc /tmp/h.c -o /tmp/h && /tmp/h`, 120000);
    expect(/^c-42/m.test(o), o.slice(-300));
  });
  await check("git : init, commit, historique", async () => {
    const o = await sh(`cd /tmp && rm -rf r && git init -q r && cd r && git config user.email a@b.c && git config user.name t && echo x > f && git add f && git commit -qm premier && git log --oneline | wc -l`, 60000);
    expect(/(^|\n)\s*1\s*(\r|\n)/.test(o), o.slice(-200));
  });
  await check("Mémoire : free", async () => {
    const o = await sh("free -m | head -2");
    return o.split("\n").slice(1, 3).join(" | ");
  }, { critical: false });

  // =========================== 3b. Bureau graphique ===========================
  const X = "DISPLAY=:0 ";
  const asciiScreen = () => page.evaluate(() => {
    const c = document.querySelector("#screen_container canvas");
    if (!c || !c.width) return "(pas de canvas)";
    const W = 96, H = 30, ramp = " .:-=+*#%@";
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    let out = "";
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = Math.floor((x + 0.5) * c.width / W), py = Math.floor((y + 0.5) * c.height / H);
        const i = (py * c.width + px) * 4;
        const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
        out += ramp[Math.min(9, Math.floor(l * 10))];
        colors.add((d[i] >> 4) + "," + (d[i + 1] >> 4) + "," + (d[i + 2] >> 4));
      }
      out += "\n";
    }
    return `${c.width}x${c.height}, ${colors.size} couleurs\n` + out;
  });

  const xUp = await check("Bureau : le serveur graphique (X11) démarre", async () => {
    const end = Date.now() + 420000;
    let last = "";
    while (Date.now() < end) {
      last = await sh(X + "xdotool getdisplaygeometry 2>&1", 30000).catch((e) => e.message);
      const m = last.match(/^(\d+) (\d+)\s*$/m);
      if (m) return `${m[1]}x${m[2]}`;
      await page.waitForTimeout(5000);
    }
    const diag = await sh("echo '--- startx.log'; tail -20 /tmp/startx.log; echo '--- Xorg'; grep -E '\\((EE|WW)\\)' /var/log/Xorg.0.log | tail -15; echo '--- fb'; ls -la /dev/fb* /dev/dri 2>&1; echo '--- ps'; ps | grep -E 'Xorg|startx|openbox|tint2' | head", 30000).catch(() => "");
    throw new Error("pas d'écran X : " + last.slice(-200) + " " + diag);
  });
  if (xUp) {
    await check("Bureau : barre, bureau et fenêtres (openbox, tint2)", async () => {
      const end = Date.now() + 180000;
      let o = "";
      while (Date.now() < end) {
        o = await sh("ps | grep -q '[/]usr/bin/openbox' && echo up-openbox || echo down-openbox; ps | grep -q '[t]int2' && echo up-tint2 || echo down-tint2", 30000);
        if (/up-openbox/.test(o) && /up-tint2/.test(o)) return "openbox, tint2 actifs";
        await page.waitForTimeout(4000);
      }
      const diag = await sh("echo '--- startx.log'; tail -30 /tmp/startx.log; echo '--- ps'; ps | grep -E 'openbox|tint2|dbus' | grep -v grep; echo '--- bin'; ls /usr/bin | grep -i openbox; echo '--- essai'; DISPLAY=:0 timeout 8 openbox 2>&1 | head -20", 40000).catch((e) => e.message);
      console.log("  diagnostic openbox :\n" + diag);
      throw new Error(o.replace(/\s+/g, " ").slice(-60));
    });
    await check("Bureau : thèmes d'icônes installés", async () => (await sh("ls /usr/share/icons", 20000)).replace(/\s+/g, " ").slice(0, 200), { critical: false });
    let ascii = "";
    await check("Bureau : l'écran affiche le bureau (barre, icônes, fond)", async () => {
      const end = Date.now() + 150000;
      while (Date.now() < end) {
        await page.waitForTimeout(4000);
        ascii = await asciiScreen();
        const m = ascii.match(/(\d+) couleurs/);
        if (m && Number(m[1]) >= 8) return ascii.split("\n")[0];
      }
      throw new Error("bureau pas dessiné : " + ascii.split("\n")[0]);
    });
    console.log("  aperçu du bureau (luminosité) :\n" + ascii);
    await check("Bureau : la souris déplace le pointeur", async () => {
      const loc = async () => {
        const o = await sh(X + "xdotool getmouselocation", 20000);
        const m = o.match(/x:(\d+) y:(\d+)/);
        expect(m, "position illisible : " + o.slice(-120));
        return [Number(m[1]), Number(m[2])];
      };
      const a = await loc();
      const box = await page.locator("#screen_container canvas").boundingBox();
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.move(box.x + 500, box.y + 350, { steps: 25 });
      await page.waitForTimeout(1500);
      const b = await loc();
      expect(a[0] !== b[0] || a[1] !== b[1], `le pointeur n'a pas bougé : ${a} -> ${b}`);
      return `${a} -> ${b}`;
    }, { critical: false });

    // L'écran s'adapte à la fenêtre et la souris reste exacte, même mis à l'échelle
    for (const [w, h] of [[1100, 760], [1500, 900]]) {
      await check(`Bureau : écran adapté à une fenêtre de ${w}x${h}, souris exacte`, async () => {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(1500);
        const box = await page.locator("#screen_container canvas").boundingBox();
        const nativeW = await page.evaluate(() => document.querySelector("#screen_container canvas").width);
        const scale = box.width / nativeW;
        expect(box.x >= 0 && box.x + box.width <= w + 1, `écran qui déborde : x=${box.x} largeur=${box.width} fenêtre=${w}`);
        const gx = 300, gy = 200;
        await page.mouse.move(box.x + 5, box.y + 5);
        await page.mouse.move(box.x + gx * scale, box.y + gy * scale, { steps: 15 });
        await page.waitForTimeout(1500);
        const o = await sh(X + "xdotool getmouselocation", 20000);
        const m = o.match(/x:(\d+) y:(\d+)/);
        expect(m, "position illisible : " + o.slice(-100));
        const dx = Math.abs(Number(m[1]) - gx), dy = Math.abs(Number(m[2]) - gy);
        expect(dx <= 8 && dy <= 8, `pointeur en ${m[1]},${m[2]} au lieu de ${gx},${gy} (échelle ${scale.toFixed(2)})`);
        return `échelle ${scale.toFixed(2)}, pointeur ${m[1]},${m[2]}`;
      });
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // Clics de souris réels sur les lanceurs de la barre des tâches (ce que fait un utilisateur)
    {
      const box0 = await page.locator("#screen_container canvas").boundingBox();
      const nat = await page.evaluate(() => { const c = document.querySelector("#screen_container canvas"); return [c.width, c.height]; });
      const sc = box0.width / nat[0];
      const panelY = nat[1] - 17;
      for (const [label, gx, search] of [
        ["Terminal", 20, "--class '[Xx]term'"],
        ["Fichiers", 50, "--class '[Xx]term'"],
        ["Éditeur", 80, "--class '[Xx]term'"],
        ["Navigateur", 110, "--class '[Dd]illo|[Xx]term'"]
      ]) {
        await check(`Souris : un clic sur l'icône « ${label} » de la barre ouvre l'application`, async () => {
          const b = await page.locator("#screen_container canvas").boundingBox();
          for (let attempt = 1; attempt <= 3; attempt++) {
            await page.waitForTimeout(1500);
            await page.mouse.move(b.x + 400 * sc, b.y + 300 * sc);
            await page.mouse.move(b.x + gx * sc, b.y + panelY * sc, { steps: 10 });
            await page.waitForTimeout(400);
            await page.mouse.down();
            await page.waitForTimeout(120);
            await page.mouse.up();
            const end = Date.now() + (attempt === 3 ? 90000 : 35000);
            while (Date.now() < end) {
              const o = await sh(`${X}xdotool search --onlyvisible ${search} 2>&1 | head -1`, 30000);
              const m = o.match(/^(\d+)\s*$/m);
              if (m) { await sh(`${X}xdotool windowclose ${m[1]}; true`, 15000).catch(() => {}); return "fenêtre " + m[1] + (attempt > 1 ? " (essai " + attempt + ")" : ""); }
              await page.waitForTimeout(2500);
            }
          }
          const tint = await sh(`${X}xdotool search --class tint2 | head -1 | xargs -r -I{} ${X}xdotool getwindowgeometry {}; tail -3 /tmp/startx.log`, 30000).catch(() => "");
          throw new Error("aucune fenêtre après le clic ; tint2 : " + tint.replace(/\s+/g, " ").slice(-200));
        });
      }
    }

    // Applications : on les lance et on vérifie qu'une fenêtre apparaît (le terminal reste ouvert pour la suite)
    for (const [label, cmd, search, keep] of [
      ["Gestionnaire de fichiers", "xterm -e mc", "--class '[Xx]term'", false],
      ["Éditeur de texte", "xterm -e nano", "--class '[Xx]term'", false],
      ["Navigateur", "$(command -v dillo || echo 'xterm -e links') http://example.com", "--class '[Dd]illo|[Xx]term'", false],
      ["Terminal", "xterm", "--class '[Xx]term'", true]
    ]) {
      await check(`Bureau : ${label} s'ouvre`, async () => {
        await sh(`cd /root; (${X}${cmd} >/tmp/app.log 2>&1 &); sleep 1`, 30000);
        const end = Date.now() + 150000;
        while (Date.now() < end) {
          const o = await sh(`${X}xdotool search --onlyvisible ${search} 2>&1 | head -1`, 30000);
          const m = o.match(/^(\d+)\s*$/m);
          if (m) {
            if (!keep) await sh(`${X}xdotool windowclose ${m[1]}; true`, 15000).catch(() => {});
            return "fenêtre " + m[1];
          }
          await page.waitForTimeout(3000);
        }
        throw new Error("pas de fenêtre ; journal : " + (await sh("tail -5 /tmp/app.log", 15000).catch(() => "")).slice(-200));
      }, { critical: label === "Terminal" });
    }
    console.log("  aperçu après ouverture du terminal :\n" + (await asciiScreen()));
    await check("Plein écran : l'écran de la machine remplit toute la fenêtre", async () => {
      await page.click("#btn-fullscreen");
      await page.waitForTimeout(2500);
      const r = await page.evaluate(() => {
        const b = document.querySelector("#screen_container canvas").getBoundingClientRect();
        return { cw: b.width, ch: b.height, w: innerWidth, h: innerHeight, fs: !!document.fullscreenElement, sw: screen.width, sh: screen.height };
      });
      await page.keyboard.press("Escape").catch(() => {});
      await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
      await page.waitForTimeout(800);
      const info = JSON.stringify(r);
      if (!r.fs) throw new Error("pas passé en plein écran " + info);
      if (r.cw < r.w * 0.97 || r.ch < r.h * 0.97) throw new Error("ne remplit pas " + info);
      return info;
    });
    await check("Fluidité : 60 déplacements de fenêtre (plus court = plus fluide)", async () => {
      await page.evaluate(() => {
        if (window.__fpsHooked) return;
        window.__fpsHooked = true;
        window.__frames = 0; window.__area = 0;
        const o = CanvasRenderingContext2D.prototype.putImageData;
        CanvasRenderingContext2D.prototype.putImageData = function (...a) {
          window.__frames++; window.__area += (a[5] || this.canvas.width) * (a[6] || this.canvas.height);
          return o.apply(this, a);
        };
      });
      const f0 = await page.evaluate(() => [window.__frames, window.__area]);
      const t = Date.now();
      await sh(`${X}W=$(DISPLAY=:0 xdotool search --onlyvisible --class '[Xx]term' | head -1); i=0; while [ $i -lt 60 ]; do DISPLAY=:0 xdotool windowmove $W $((i*6)) $((i*3)); i=$((i+1)); done`, 180000);
      const dt = (Date.now() - t) / 1000;
      const f1 = await page.evaluate(() => [window.__frames, window.__area]);
      return `${dt.toFixed(1)} s ; ${f1[0] - f0[0]} mises à jour d'écran (${((f1[0] - f0[0]) / dt).toFixed(1)}/s), ${((f1[1] - f0[1]) / 1e6).toFixed(1)} Mpixels`;
    }, { critical: false });
    await sh(`${X}xdotool search --onlyvisible --class '[Xx]term' | head -1 | xargs -r -I{} ${X}xdotool windowfocus {}`, 30000).catch(() => {});
  }

  // =========================== 4. Clavier français (touches physiques) ===========================
  // On tape sur la console de l'écran (tty1) avec les touches physiques d'un clavier AZERTY,
  // en redirigeant le résultat dans des fichiers qu'on relit ensuite par la console série.
  await page.waitForTimeout(1500);
  await check("Clavier : lettres et chiffres AZERTY", async () => {
    await typeAzerty("echo azerty-1234.m-q|tee k1.txt");
    await page.waitForTimeout(1500);
    const o = await sh("cat /root/k1.txt 2>&1; ls /root", 30000);
    expect(/^azerty-1234\.m-q\s*$/m.test(o), "reçu : " + JSON.stringify(o.slice(-200)) + " | écran : " + JSON.stringify(await screenText()));
  });
  await check("Clavier : accents et AltGr (é è à ç @ |)", async () => {
    await typeAzerty("echo é-è-à-ç-@|tee k2.txt");
    await page.waitForTimeout(1500);
    const o = await sh(`python3 -c "print(open('/root/k2.txt','rb').read())"`, 30000);
    expect(o.includes(String.raw`b'\xc3\xa9-\xc3\xa8-\xc3\xa0-\xc3\xa7-@\n'`), "reçu : " + o.slice(-200));
  }, { critical: false });
  console.log("  écran :\n" + (await screenText()));
  await shot("02-clavier");

  // =========================== 5. Internet ===========================
  const hasNet = await check("Réseau : la carte réseau est visible", async () => {
    const o = await sh("ls /sys/class/net", 30000);
    expect(/eth0/.test(o), o);
  }, { critical: false });
  if (hasNet) {
    await check("Réseau : adresse IP obtenue", async () => {
      let o = "";
      for (let i = 0; i < 6; i++) {
        o = await sh("ip -4 addr show eth0", 30000);
        if (/inet \d+\.\d+\.\d+\.\d+/.test(o)) return o.match(/inet [\d.]+/)[0];
        await sh("udhcpc -i eth0 -n -q -t 3 2>&1 | tail -2", 30000).catch(() => {});
        await page.waitForTimeout(3000);
      }
      throw new Error("pas d'IP : " + o.slice(-200));
    }, { critical: false });
    await check("Réseau : ping 1.1.1.1", async () => {
      const o = await sh("ping -c 2 -W 5 1.1.1.1 2>&1 | tail -3", 40000);
      expect(/[1-9]\d* packets received|[1-9]\d* received/.test(o), o.slice(-200));
    }, { critical: false });
    await check("Réseau : DNS et HTTP (wget example.com)", async () => {
      const o = await sh("wget -q -T 25 -O - http://example.com 2>&1 | head -c 300", 60000);
      expect(/Example Domain/i.test(o), o.slice(0, 200));
    }, { critical: false });
    await check("Réseau : HTTPS (curl github.com)", async () => {
      const o = await sh("curl -sS -m 40 -o /dev/null -w 'code=%{http_code}' https://github.com 2>&1", 60000);
      expect(/code=(200|301|302)/.test(o), o.slice(-200));
    }, { critical: false });
    await check("Réseau : git ls-remote sur GitHub", async () => {
      const o = await sh("git ls-remote https://github.com/Nabix602/vm-project HEAD 2>&1 | head -3", 90000);
      expect(/[0-9a-f]{40}\s+HEAD/.test(o), o.slice(-200));
    }, { critical: false });
    await check("Réseau : installer un logiciel (apk add htop) et le lancer", async () => {
      const o = await sh("logiciels htop >/tmp/apk.log 2>&1 </dev/null; htop --version 2>&1 | head -1; tail -3 /tmp/apk.log", 400000);
      expect(/htop [0-9]/.test(o), o.slice(-250));
    }, { critical: false });
  }

  // =========================== 6. Sauvegarde et reprise ===========================
  await check("Sauvegarde : écrire un fichier puis sauvegarder", async () => {
    await sh("echo persiste-$((40+2)) > /root/persist.txt; sync");
    verbose = true;
    await page.click("#btn-save");
    await page.waitForFunction(
      () => /Sauvegardé|Échec/.test(document.getElementById("state-label").textContent),
      null, { timeout: 120000 }
    ).catch(async (e) => {
      const running = await page.evaluate(() => window.__vm.is_running());
      const direct = await page.evaluate(() => Promise.race([
        window.__vm.save_state().then((b) => "ok " + b.byteLength),
        new Promise((r) => setTimeout(() => r("toujours bloqué après 60 s"), 60000))
      ]));
      throw new Error(`message : ${await page.textContent("#state-label")} | en marche : ${running} | save_state direct : ${direct}`);
    });
    verbose = false;
    const label = await page.textContent("#state-label");
    expect(/Sauvegardé/.test(label), label);
    return label;
  });
  await check("Sauvegarde : éteindre ramène à l'écran de démarrage", async () => {
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#btn-stop")]);
    await page.waitForSelector("#boot:not([hidden])");
    await page.waitForSelector("#btn-resume:not([hidden])");
  });
  await check("Sauvegarde : la session reprend avec le fichier", async () => {
    await page.click("#btn-resume");
    await page.waitForFunction(
      () => !document.getElementById("machine").hidden || /Impossible/.test(document.getElementById("boot-status").textContent),
      null, { timeout: 240000 }
    );
    if (await page.isHidden("#machine")) throw new Error("reprise refusée : " + (await page.textContent("#boot-status")));
    await hookSerial();
    const label = await page.textContent("#state-label");
    console.log("  après reprise, message de la page :", label, "| en marche :", await page.evaluate(() => window.__vm.is_running()));
    await page.waitForTimeout(3000);
    for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__vm.serial0_send("\n")); await page.waitForTimeout(1500); }
    console.log("  série après reprise :", JSON.stringify((await serialText()).slice(-300)));
    const o = await sh("cat /root/persist.txt", 90000).catch(async (e) => {
      throw new Error(e.message + " | série : " + JSON.stringify((await serialText()).slice(-300)) + " | message : " + (await page.textContent("#state-label")));
    });
    expect(o.includes("persiste-42"), o.slice(-200));
  });
  await shot("03-apres-reprise");
}

// =========================== Bilan ===========================
await shot("99-fin");
fs.writeFileSync(`${OUT}/serial.log`, await serialText().catch(() => ""));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();

const failedCritical = results.filter((r) => !r.ok && r.critical);
const failedInfo = results.filter((r) => !r.ok && !r.critical);
console.log("\n==================== BILAN ====================");
console.log(`${results.filter((r) => r.ok).length} réussis, ${failedCritical.length} échecs critiques, ${failedInfo.length} échecs non bloquants`);
for (const r of failedCritical) console.log("  CRITIQUE :", r.name, "—", r.detail);
for (const r of failedInfo) console.log("  info     :", r.name, "—", r.detail);
process.exit(failedCritical.length ? 1 : 0);
