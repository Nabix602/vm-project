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
    await check("Bureau : barre, bureau et fenêtres (openbox, tint2, pcmanfm)", async () => {
      const end = Date.now() + 180000;
      let o = "";
      while (Date.now() < end) {
        o = await sh("for p in openbox tint2 pcmanfm; do pgrep -x $p >/dev/null && echo up-$p || echo down-$p; done", 30000);
        if (/up-openbox/.test(o) && /up-tint2/.test(o) && /up-pcmanfm/.test(o)) return "openbox, tint2, pcmanfm actifs";
        await page.waitForTimeout(4000);
      }
      const diag = await sh("echo '--- startx.log'; tail -30 /tmp/startx.log; echo '--- ps'; ps | grep -E 'openbox|tint2|pcmanfm|dbus' | grep -v grep; echo '--- bin'; ls /usr/bin | grep -i openbox; echo '--- essai'; DISPLAY=:0 timeout 8 openbox 2>&1 | head -20", 40000).catch((e) => e.message);
      console.log("  diagnostic openbox :\n" + diag);
      throw new Error(o.replace(/\s+/g, " ").slice(-60));
    });
    await page.waitForTimeout(5000);
    const ascii = await asciiScreen();
    console.log("  aperçu du bureau (luminosité) :\n" + ascii);
    await check("Bureau : l'écran affiche autre chose qu'un fond uni", async () => {
      const m = ascii.match(/(\d+) couleurs/);
      expect(m && Number(m[1]) >= 8, "pas assez de couleurs : " + ascii.split("\n")[0]);
      return ascii.split("\n")[0];
    });
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

    // Applications : on les lance et on vérifie qu'une fenêtre apparaît (le terminal reste ouvert pour la suite)
    for (const [label, cmd, search, keep] of [
      ["Gestionnaire de fichiers", "pcmanfm /root", "--name '^root$'", false],
      ["Éditeur de texte", "mousepad", "--class '[Mm]ousepad'", false],
      ["Navigateur", "$(command -v dillo || echo 'lxterminal -e links') http://example.com", "--class '[Dd]illo|[Ll]xterminal'", false],
      ["Terminal", "lxterminal", "--class '[Ll]xterminal'", true]
    ]) {
      await check(`Bureau : ${label} s'ouvre`, async () => {
        await sh(`(${X}${cmd} >/tmp/app.log 2>&1 &); sleep 1`, 30000);
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
    await sh(`${X}xdotool search --onlyvisible --class '[Ll]xterminal' | head -1 | xargs -r -I{} ${X}xdotool windowfocus {}`, 30000).catch(() => {});
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
