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
    const msg = String(e && e.message ? e.message : e).split("\n")[0].slice(0, 300);
    results.push({ name, ok: false, critical, detail: msg });
    console.log(`[${secs()}] FAIL  ${critical ? "" : "(info) "}${name} — ${msg}`);
    return false;
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("  [console.error]", m.text()); });
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

const vgaText = () => page.evaluate(() => document.querySelector("#screen_container div")?.innerText || "");
async function typeKeys(codes, { shift = false } = {}) {
  for (const c of codes) {
    if (c === "Shift+") continue;
    await page.keyboard.press(c);
    await page.waitForTimeout(40);
  }
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
    const o = await sh(`printf '#include <stdio.h>\\nint main(){printf("c-%d\\\\n",6*7);return 0;}\\n' > /tmp/h.c && gcc /tmp/h.c -o /tmp/h && /tmp/h`, 120000);
    expect(o.includes("c-42"), o.slice(-200));
  });
  await check("git : init, commit, historique", async () => {
    const o = await sh(`cd /tmp && rm -rf r && git init -q r && cd r && git config user.email a@b.c && git config user.name t && echo x > f && git add f && git commit -qm premier && git log --oneline | wc -l`, 60000);
    expect(/(^|\n)\s*1\s*(\r|\n)/.test(o), o.slice(-200));
  });
  await check("Mémoire : free", async () => {
    const o = await sh("free -m | head -2");
    return o.split("\n").slice(1, 3).join(" | ");
  }, { critical: false });

  // =========================== 4. Clavier français (touches physiques) ===========================
  await page.mouse.click(640, 300);
  await check("Clavier : AZERTY (a est sur la touche Q)", async () => {
    // `echo azerty` tapé avec les touches physiques d'un clavier AZERTY
    await typeKeys(["KeyE", "KeyC", "KeyH", "KeyO", "Space", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "Enter"]);
    await page.waitForTimeout(1500);
    const v = await vgaText();
    const n = (v.match(/azerty/g) || []).length;
    expect(n >= 2, `"azerty" vu ${n} fois sur l'écran`);
  });
  await check("Clavier : chiffres avec Maj et é sans Maj", async () => {
    // echo é puis echo 1 (Maj + touche 1)
    await typeKeys(["KeyE", "KeyC", "KeyH", "KeyO", "Space", "Digit2", "Enter"]);
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.press("Digit1");
    await page.keyboard.up("ShiftLeft");
    await page.waitForTimeout(800);
    const v = await vgaText();
    expect((v.match(/é/g) || []).length >= 2, "é absent de l'écran : " + JSON.stringify(v.slice(-200)));
  }, { critical: false });
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
    await page.click("#btn-save");
    await page.waitForFunction(
      () => /Sauvegardé|Échec/.test(document.getElementById("state-label").textContent),
      null, { timeout: 240000 }
    );
    const label = await page.textContent("#state-label");
    expect(/Sauvegardé/.test(label), label);
    return label;
  });
  await check("Sauvegarde : éteindre ramène à l'écran de démarrage", async () => {
    await page.click("#btn-stop");
    await page.waitForSelector("#boot:not([hidden])");
    await page.waitForSelector("#btn-resume:not([hidden])");
  });
  await check("Sauvegarde : la session reprend avec le fichier", async () => {
    await page.click("#btn-resume");
    await page.waitForSelector("#machine:not([hidden])", { timeout: 240000 });
    await hookSerial();
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.__vm.serial0_send("\n"));
    await page.waitForTimeout(1500);
    const o = await sh("cat /root/persist.txt", 90000);
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
