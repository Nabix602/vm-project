// Expérience : la reprise d'une session sauvegardée est-elle fiable ? Compare plusieurs réglages.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:8080/";
const TRIALS = Number(process.env.TRIALS || 4);
const CONFIGS = [
  { name: "actuel (réseau, MAC aléatoire)", q: "" },
  { name: "réseau + même MAC", q: "?mac=1" },
  { name: "sans réseau", q: "?net=0" },
  { name: "réseau coupé (rmmod) avant sauvegarde", q: "", pre: "rmmod virtio_net" }
];

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const summary = [];

for (const cfg of CONFIGS) {
  log("=== Configuration :", cfg.name);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync("/tmp/exp-"), { args: ["--no-sandbox"], viewport: { width: 1280, height: 900 } });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(60000);
  page.on("dialog", (d) => d.accept());
  page.on("console", (m) => { if (m.type() === "error") log("  [console.error]", m.text().slice(0, 200)); });

  const hook = async () => {
    await page.waitForFunction(() => window.__vm, null, { polling: 50 });
    await page.evaluate(() => { window.__serial = ""; window.__vm.add_listener("serial0-output-byte", (b) => { window.__serial += String.fromCharCode(b); }); });
  };
  const ser = () => page.evaluate(() => window.__serial);
  let n = 2000;
  const sh = async (cmd, ms = 60000) => {
    n++;
    const start = (await ser()).length;
    await page.evaluate(([c, k]) => window.__vm.serial0_send(`${c}\necho "__END_$((${k}*1))__"\n`), [cmd, n]);
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await ser();
      const i = s.indexOf(`__END_${n}__`, start);
      if (i >= 0) return s.slice(start, i);
      await page.waitForTimeout(250);
    }
    throw new Error("délai : " + cmd);
  };
  const unlock = async () => {
    await page.waitForSelector("#lock:not([hidden])");
    await page.fill("#lock-input", "1234");
    await page.click("#lock-button");
    await page.waitForSelector("#boot:not([hidden])");
  };

  const res = { name: cfg.name, ok: 0, fail: 0, details: [] };
  try {
    await page.goto(BASE + cfg.q);
    await unlock();
    await page.click("#btn-fresh");
    await page.waitForSelector("#machine:not([hidden])", { timeout: 120000 });
    await hook();
    for (let i = 0; i < 60; i++) {
      if ((await ser()).includes("localhost:~# ")) break;
      if (i % 20 === 19) await page.evaluate(() => window.__vm.serial0_send("\n"));
      await page.waitForTimeout(2000);
    }
    log("  prêt");
    if (!cfg.q.includes("net=0")) {
      await sh("ls /sys/class/net; ip -4 addr show eth0 | grep inet", 20000).catch(() => {});
      await sh("ping -c 2 -W 4 1.1.1.1 | tail -2", 30000).catch(() => {});
      await sh("wget -q -T 15 -O - http://example.com | head -c 80", 30000).catch(() => {});
    }
    if (cfg.pre) await sh(cfg.pre, 20000).catch((e) => log("  pre :", e.message));
    await sh("echo persiste-$((40+2)) > /root/persist.txt; sync");
    await page.click("#btn-save");
    await page.waitForFunction(() => /Sauvegardé|Échec/.test(document.getElementById("state-label").textContent), null, { timeout: 120000 });
    log("  sauvegarde :", await page.textContent("#state-label"));

    for (let t = 1; t <= TRIALS; t++) {
      await page.goto(BASE + cfg.q);
      await unlock();
      await page.click("#btn-resume");
      let verdict = "";
      try {
        await page.waitForFunction(() => !document.getElementById("machine").hidden || /Impossible/.test(document.getElementById("boot-status").textContent), null, { timeout: 120000 });
        if (await page.isHidden("#machine")) throw new Error("refusée : " + (await page.textContent("#boot-status")));
        await hook();
        await page.waitForTimeout(2000);
        for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__vm.serial0_send("\n")); await page.waitForTimeout(1000); }
        const o = await sh("cat /root/persist.txt", 25000);
        if (!o.includes("persiste-42")) throw new Error("fichier absent : " + JSON.stringify(o.slice(-100)));
        verdict = "OK";
        res.ok++;
      } catch (e) {
        verdict = "ÉCHEC : " + e.message + " | série : " + JSON.stringify((await ser().catch(() => "")).slice(-120));
        res.fail++;
      }
      res.details.push(`essai ${t} : ${verdict}`);
      log("  ", `essai ${t} : ${verdict}`);
    }
  } catch (e) {
    log("  ERREUR de l'expérience :", e.message);
    res.details.push("erreur : " + e.message);
  }
  summary.push(res);
  await ctx.close();
}

console.log("\n==================== RÉSUMÉ ====================");
for (const r of summary) console.log(`${r.name} : ${r.ok} réussites, ${r.fail} échecs`);
