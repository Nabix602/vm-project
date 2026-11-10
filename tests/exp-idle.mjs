// Expérience : quels réglages rendent le bureau plus fluide ? Mesure sur le même scénario.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:8080/";
const BASECMD = "rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable";
const VARIANTS = (process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : [{ name: "bureau actuel, CPU au repos", cmd: "mitigations=off" }]);
const _unused = ([
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

    const cpu = async (label) => {
      const o = await sh(`for n in Xorg openbox tint2 pcmanfm dbus-daemon lxterminal; do for p in $(pidof $n); do echo $n $p $(awk '{print $14+$15}' /proc/$p/stat); done; done`, 30000);
      return o.split("\n").map((l) => l.trim().split(/\s+/)).filter((x) => x.length === 3 && /^\d+$/.test(x[2]));
    };
    const bench = async () => { const t = Date.now(); await sh("python3 -c \"s=0\nfor i in range(1000000): s+=i\nprint(s)\"", 180000); return ((Date.now() - t) / 1000).toFixed(1); };
    await sh("sleep 15", 40000);
    const c0 = await cpu();
    await sh("sleep 30", 60000);
    const c1 = await cpu();
    const byName = {};
    for (const [n, p, t1] of c1) { const f = c0.find((x) => x[1] === p); if (f) byName[n] = (byName[n] || 0) + (Number(t1) - Number(f[2])); }
    res.cpu_au_repos_30s = Object.entries(byName).map(([k, v]) => `${k}=${(v / 100).toFixed(1)}s`).join(" ");
    res.calcul_avec_bureau = await bench() + " s (1 M additions)";
    await sh("pkill tint2; pkill -f 'pcmanfm --desktop'; sleep 3", 30000).catch(() => {});
    res.calcul_sans_tint2_ni_pcmanfm = await bench() + " s (1 M additions)";
    await sh("pkill openbox; sleep 2", 30000).catch(() => {});
    res.calcul_sans_openbox = await bench() + " s (1 M additions)";
    await sh("DISPLAY=:0 pkill Xorg; sleep 3", 30000).catch(() => {});
    res.calcul_sans_X = await bench() + " s (1 M additions)";
  } catch (e) {
    res.erreur = e.message.slice(0, 200);
  }
  summary.push(res);
  log("  résultat :", JSON.stringify(res));
  await ctx.close();
}
console.log("\n==================== RÉSUMÉ ====================");
for (const r of summary) console.log(JSON.stringify(r, null, 1));
