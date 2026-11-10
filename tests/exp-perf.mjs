// Expérience : quels réglages rendent le bureau plus fluide ? Mesure sur le même scénario.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:8080/";
const BASECMD = "rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable";
const VARIANTS = (process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : [
  { name: "référence actuelle", cmd: "" },
  { name: "sans init_on_free, mitigations=off", cmd: "noinit", raw: BASECMD + " mitigations=off" },
  { name: "1024x576", cmd: "mitigations=off video=Virtual-1:1024x576" },
  { name: "1024x576 en 16 bits", cmd: "mitigations=off video=Virtual-1:1024x576-16" },
  { name: "800x450 en 16 bits", cmd: "mitigations=off video=Virtual-1:800x450-16" }
]);

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const summary = [];

for (const v of VARIANTS) {
  log("=== Variante :", v.name);
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync("/tmp/perf-"), { args: ["--no-sandbox"], viewport: { width: 1400, height: 900 } });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.setDefaultTimeout(60000);
  const res = { name: v.name };
  try {
    const q = v.raw ? `?desktop=1&rawcmd=${encodeURIComponent(v.raw)}` : (v.cmd ? `?cmd=${encodeURIComponent(v.cmd)}` : "");
    await page.goto(BASE + q);
    await page.waitForSelector("#lock:not([hidden])");
    await page.fill("#lock-input", "1234");
    await page.click("#lock-button");
    await page.waitForSelector("#boot:not([hidden])");
    await page.click("#btn-fresh");
    await page.waitForSelector("#machine:not([hidden])", { timeout: 120000 });
    await page.waitForFunction(() => window.__vm, null, { polling: 50 });
    await page.evaluate(() => {
      window.__serial = ""; window.__frames = 0; window.__area = 0;
      window.__vm.add_listener("serial0-output-byte", (b) => { window.__serial += String.fromCharCode(b); });
      const o = CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData = function (...a) { window.__frames++; window.__area += (a[5] || this.canvas.width) * (a[6] || this.canvas.height); return o.apply(this, a); };
    });
    const ser = () => page.evaluate(() => window.__serial);
    let n = 3000;
    const sh = async (cmd, ms = 60000) => {
      n++;
      const start = (await ser()).length;
      await page.evaluate(([c, k]) => window.__vm.serial0_send(`${c}\necho "__END_$((${k}*1))__"\n`), [cmd, n]);
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const s = await ser();
        const i = s.indexOf(`__END_${n}__`, start);
        if (i >= 0) return s.slice(start, i);
        await page.waitForTimeout(200);
      }
      throw new Error("délai : " + cmd);
    };
    const bootStart = Date.now();
    for (let i = 0; i < 200; i++) {
      if ((await ser()).includes("localhost:~# ")) break;
      if (i % 40 === 39) await page.evaluate(() => window.__vm.serial0_send("\n"));
      await page.waitForTimeout(1500);
    }
    res.boot = ((Date.now() - bootStart) / 1000).toFixed(0) + " s";
    // bureau prêt
    let xs = "";
    const xStart = Date.now();
    for (let i = 0; i < 120; i++) {
      xs = await sh("DISPLAY=:0 xdotool getdisplaygeometry 2>&1", 30000).catch(() => "");
      if (/^\d+ \d+/m.test(xs)) break;
      await page.waitForTimeout(3000);
    }
    res.bureau = ((Date.now() - xStart) / 1000).toFixed(0) + " s après le prompt";
    res.ecran = (xs.match(/^\d+ \d+/m) || ["?"])[0];
    await sh("sleep 20", 40000);
    const fb = await sh("cat /sys/class/graphics/fb0/bits_per_pixel /sys/class/graphics/fb0/virtual_size 2>&1 | tr '\\n' ' '; grep -o 'video=[^ ]*' /proc/cmdline", 20000).catch(() => "?");
    res.fb = fb.replace(/\s+/g, " ").trim().slice(0, 120);

    // 1) lancement à froid puis à chaud du terminal
    const launch = async () => {
      const t = Date.now();
      await sh("cd /root; (DISPLAY=:0 lxterminal >/tmp/a.log 2>&1 &); sleep 1", 30000);
      for (let i = 0; i < 100; i++) {
        const o = await sh("DISPLAY=:0 xdotool search --onlyvisible --class '[Ll]xterminal' 2>&1 | head -1", 30000);
        const m = o.match(/^(\d+)\s*$/m);
        if (m) return { s: (Date.now() - t) / 1000, id: m[1] };
        await page.waitForTimeout(1000);
      }
      return { s: -1, id: "" };
    };
    const cold = await launch();
    res.terminal_froid = cold.s.toFixed(1) + " s";
    await sh(`DISPLAY=:0 xdotool windowclose ${cold.id}; sleep 2`, 20000).catch(() => {});
    const warm = await launch();
    res.terminal_chaud = warm.s.toFixed(1) + " s";

    // 2) fluidité : 60 déplacements de fenêtre
    const f0 = await page.evaluate(() => [window.__frames, window.__area]);
    const tb = Date.now();
    await sh(`W=$(DISPLAY=:0 xdotool search --onlyvisible --class '[Ll]xterminal' | head -1); i=0; while [ $i -lt 60 ]; do DISPLAY=:0 xdotool windowmove $W $((i*6)) $((i*3)); i=$((i+1)); done`, 180000);
    const dt = (Date.now() - tb) / 1000;
    const f1 = await page.evaluate(() => [window.__frames, window.__area]);
    res.deplacements = `${dt.toFixed(1)} s (${(60 / dt).toFixed(1)} déplacements/s), ${((f1[1] - f0[1]) / 1e6).toFixed(1)} Mpixels`;

    // 3) calcul pur (pour séparer le processeur de l'affichage)
    const tc = Date.now();
    await sh("python3 -c \"s=0\nfor i in range(2000000): s+=i\nprint(s)\"", 120000);
    res.calcul = ((Date.now() - tc) / 1000).toFixed(1) + " s (python, 2 M additions)";
  } catch (e) {
    res.erreur = e.message.slice(0, 200);
  }
  summary.push(res);
  log("  résultat :", JSON.stringify(res));
  await ctx.close();
}
console.log("\n==================== RÉSUMÉ ====================");
for (const r of summary) console.log(JSON.stringify(r, null, 1));
