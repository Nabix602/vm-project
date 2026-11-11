(() => {
"use strict";
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const L = window.LinuxVM;

// ---------- Accès : il faut avoir entré le code sur la page d'accueil ----------
try {
  if (sessionStorage.getItem("vm-project:unlocked") !== "1") { location.replace("index.html?next=win.html"); }
} catch {}

// ---------- Icônes (dessinées ici) ----------
const IC = {
  folder: '<svg class="ico" viewBox="0 0 32 32"><path d="M2 8a3 3 0 0 1 3-3h7l3 3h12a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="#e8a317"/><path d="M2 12h28v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3z" fill="#ffd45e"/></svg>',
  file: '<svg class="ico" viewBox="0 0 32 32"><path d="M7 3h13l6 6v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#d8dde6"/><path d="M20 3l6 6h-6z" fill="#9aa5b8"/><path d="M9 15h14M9 19h14M9 23h9" stroke="#7c8aa5" stroke-width="1.6"/></svg>',
  note: '<svg class="ico" viewBox="0 0 32 32"><rect x="5" y="3" width="22" height="26" rx="3" fill="#35a7ff"/><path d="M9 11h14M9 16h14M9 21h9" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  globe: '<svg class="ico" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="#1f8ad8"/><path d="M3 16h26M16 3c5 4 5 22 0 26M16 3c-5 4-5 22 0 26M6 9h20M6 23h20" stroke="#bfe6ff" stroke-width="1.5" fill="none"/></svg>',
  term: '<svg class="ico" viewBox="0 0 32 32"><rect x="2" y="4" width="28" height="24" rx="4" fill="#1b1b1b" stroke="#555"/><path d="M8 12l5 4-5 4" stroke="#6fe3a0" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 21h8" stroke="#ddd" stroke-width="2.4" stroke-linecap="round"/></svg>',
  calc: '<svg class="ico" viewBox="0 0 32 32"><rect x="5" y="2" width="22" height="28" rx="3" fill="#3b3f46"/><rect x="8" y="5" width="16" height="6" rx="1.5" fill="#9ad1ff"/><g fill="#e8eaf0"><circle cx="11" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/><circle cx="21" cy="16" r="1.8"/><circle cx="11" cy="21" r="1.8"/><circle cx="16" cy="21" r="1.8"/><circle cx="11" cy="26" r="1.8"/><circle cx="16" cy="26" r="1.8"/></g><circle cx="21" cy="23.5" r="2.6" fill="#35a7ff"/></svg>',
  gear: '<svg class="ico" viewBox="0 0 32 32"><circle cx="16" cy="16" r="9.5" fill="#8a93a6"/><g fill="#8a93a6"><rect x="14" y="2" width="4" height="6" rx="1"/><rect x="14" y="24" width="4" height="6" rx="1"/><rect x="2" y="14" width="6" height="4" rx="1"/><rect x="24" y="14" width="6" height="4" rx="1"/></g><circle cx="16" cy="16" r="4.5" fill="#fff"/></svg>',
  store: '<svg class="ico" viewBox="0 0 32 32"><path d="M5 11h22l-2 16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" fill="#2d7ff9"/><path d="M11 11V9a5 5 0 0 1 10 0v2" stroke="#2d7ff9" stroke-width="2.4" fill="none"/><g><rect x="11" y="15" width="4.5" height="4.5" fill="#ff7b9c"/><rect x="16.5" y="15" width="4.5" height="4.5" fill="#7ae0a0"/><rect x="11" y="20.5" width="4.5" height="4.5" fill="#ffd45e"/><rect x="16.5" y="20.5" width="4.5" height="4.5" fill="#9ad1ff"/></g></svg>',
  linux: '<svg class="ico" viewBox="0 0 32 32"><rect x="3" y="5" width="26" height="18" rx="2.5" fill="#222" stroke="#5a6070" stroke-width="1.5"/><rect x="10" y="25" width="12" height="3" rx="1.5" fill="#5a6070"/><circle cx="16" cy="14" r="5" fill="#fbbf24"/><circle cx="14.3" cy="13" r="1" fill="#222"/><circle cx="17.7" cy="13" r="1" fill="#222"/><path d="M14 16.5h4l-2 2z" fill="#f97316"/></svg>',
  start: '<svg class="ico" viewBox="0 0 24 24"><g fill="#4cc2ff"><rect x="2" y="2" width="9.2" height="9.2" rx="1"/><rect x="12.8" y="2" width="9.2" height="9.2" rx="1"/><rect x="2" y="12.8" width="9.2" height="9.2" rx="1"/><rect x="12.8" y="12.8" width="9.2" height="9.2" rx="1"/></g></svg>',
  search: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
  up: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
};
const cap = {
  min: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor"/></svg>',
  max: '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x=".5" y=".5" width="9" height="9" stroke="currentColor"/></svg>',
  x: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor"/></svg>'
};

// ---------- Réglages ----------
const SKEY = "vm-project:win-settings", FKEY = "vm-project:win-fs";
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const settings = Object.assign({ dark: true, wall: 0 }, load(SKEY, {}));
const WALLS = [
  "radial-gradient(circle at 70% 30%,#7fd1ff 0,#2f7be0 30%,#0b2a7a 65%,#050d2e 100%)",
  "radial-gradient(circle at 30% 30%,#ffb3e6 0,#a24cf2 35%,#2b0a5a 75%,#0a0220 100%)",
  "radial-gradient(circle at 60% 40%,#c8ffd9 0,#2fb86a 35%,#0b4a2a 75%,#02140a 100%)",
  "linear-gradient(135deg,#0f0f10,#2c2f36 55%,#6b7280)"
];
function applySettings() {
  document.body.classList.toggle("dark", settings.dark);
  $("#desk").style.setProperty("--wall", WALLS[settings.wall]);
  save(SKEY, settings);
}

// ---------- Fichiers du navigateur ----------
let fsv = load(FKEY, null) || {
  "/": { t: "d" }, "/Bureau": { t: "d" }, "/Documents": { t: "d" }, "/Téléchargements": { t: "d" },
  "/Documents/bienvenue.txt": { t: "f", c: "Bienvenue sur Bureau Web 11 !\nLes dossiers de la barre de gauche sont dans ton navigateur.\nLe dossier « Linux » est le vrai disque de la machine Linux." }
};
const persist = () => save(FKEY, fsv);
const parent = (p) => p.replace(/\/[^/]*$/, "") || "/";
const base = (p) => p.split("/").filter(Boolean).pop() || "/";
const children = (d) => Object.keys(fsv).filter((p) => p !== "/" && parent(p) === d).sort((a, b) => (fsv[a].t === fsv[b].t ? a.localeCompare(b) : fsv[a].t === "d" ? -1 : 1));
const joinp = (d, n) => (d === "/" ? "" : d) + "/" + n;
const rmTree = (p) => { for (const k of Object.keys(fsv)) if (k === p || k.startsWith(p + "/")) delete fsv[k]; };
const isL = (p) => p.startsWith("L:");
const lp = (p) => p.slice(2) || "/";

function toast(msg, ms = 3500) {
  const t = $("#toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), ms);
}

// ---------- Fenêtres ----------
const wins = [];
let zTop = 10, nOpen = 0;
function openWin(opt) {
  const w = el("div", "win opening");
  const W = Math.min(opt.w || 640, innerWidth - 16), H = Math.min(opt.h || 420, innerHeight - 64);
  w.style.cssText = `width:${W}px;height:${H}px;left:${Math.max(0, 50 + (nOpen % 8) * 30)}px;top:${24 + (nOpen % 8) * 30}px`;
  nOpen++;
  const bar = el("div", "tbar", `<span class="wi">${opt.icon}</span><span class="t">${esc(opt.title)}</span><button class="mn" aria-label="Réduire">${cap.min}</button><button class="mx" aria-label="Agrandir">${cap.max}</button><button class="x" aria-label="Fermer">${cap.x}</button>`);
  const body = el("div", "body"), rz = el("div", "rz");
  w.append(bar, body, rz); $("#desk").append(w);
  const o = { el: w, title: opt.title, icon: opt.icon, kind: opt.kind };
  wins.push(o);
  const focus = () => { w.style.zIndex = ++zTop; wins.forEach((x) => (x.active = x === o)); renderTask(); };
  w.addEventListener("pointerdown", focus);
  o.focus = focus;
  const close = () => { if (o.onClose) o.onClose(); w.remove(); wins.splice(wins.indexOf(o), 1); renderTask(); };
  o.close = close;
  $(".x", bar).onclick = close;
  $(".mn", bar).onclick = () => { w.classList.add("min"); o.active = false; renderTask(); };
  $(".mx", bar).onclick = () => { w.classList.toggle("max"); o.onResize && setTimeout(o.onResize, 50); };
  bar.ondblclick = (e) => { if (e.target.tagName !== "BUTTON") $(".mx", bar).onclick(); };
  o.setTitle = (t) => { o.title = t; $(".t", bar).textContent = t; renderTask(); };
  drag(bar, (dx, dy, s) => { if (w.classList.contains("max")) return; w.style.left = s.l + dx + "px"; w.style.top = Math.max(0, s.t + dy) + "px"; }, () => ({ l: w.offsetLeft, t: w.offsetTop }));
  drag(rz, (dx, dy, s) => { w.style.width = Math.max(280, s.w + dx) + "px"; w.style.height = Math.max(160, s.h + dy) + "px"; o.onResize && o.onResize(); }, () => ({ w: w.offsetWidth, h: w.offsetHeight }));
  focus();
  opt.build(body, o);
  return o;
}
function drag(handle, move, init) {
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    e.preventDefault();
    const s = init(), x0 = e.clientX, y0 = e.clientY;
    const shield = el("div"); shield.style.cssText = "position:fixed;inset:0;z-index:99998"; document.body.append(shield);
    const mv = (ev) => move(ev.clientX - x0, ev.clientY - y0, s);
    const up = () => { shield.remove(); removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });
}
function renderTask() {
  const box = $("#items");
  box.querySelectorAll(".dyn").forEach((n) => n.remove());
  const pinned = new Set(Array.from(box.querySelectorAll(".pin")).map((n) => n.dataset.k));
  for (const b of box.querySelectorAll(".pin")) { const run = wins.some((o) => o.kind === b.dataset.k); b.classList.toggle("run", run); b.classList.toggle("act", wins.some((o) => o.kind === b.dataset.k && o.active && !o.el.classList.contains("min"))); }
  for (const o of wins) {
    if (pinned.has(o.kind)) continue;
    const b = el("button", "tb dyn run" + (o.active && !o.el.classList.contains("min") ? " act" : ""), `<span class="g">${o.icon}</span>`);
    b.title = o.title; b.onclick = () => toggleWin(o); box.append(b);
  }
}
function toggleWin(o) {
  if (o.el.classList.contains("min")) { o.el.classList.remove("min"); o.focus(); }
  else if (o.active) { o.el.classList.add("min"); o.active = false; renderTask(); }
  else o.focus();
}

// ---------- Applications ----------
function notepad(path) {
  openWin({ kind: "note", title: path ? base(path) : "Sans titre - Bloc-notes", icon: IC.note, w: 580, h: 420, build(b, o) {
    const tool = el("div", "tool", `<button id="sv">💾 Enregistrer</button><span class="status" id="st" style="padding:0"></span>`);
    const ta = el("textarea", "np"); ta.spellcheck = false;
    b.append(tool, ta);
    if (path) { if (isL(path)) { ta.value = "Chargement…"; L.readFile(lp(path)).then((t) => (ta.value = t)); } else ta.value = fsv[path] ? fsv[path].c : ""; }
    $("#sv", tool).onclick = async () => {
      if (!path) { const n = prompt("Nom du fichier :", "note.txt"); if (!n) return; path = joinp("/Documents", n); }
      if (isL(path)) { $("#st", tool).textContent = "Enregistrement…"; await L.writeFile(lp(path), ta.value); }
      else { fsv[path] = { t: "f", c: ta.value }; persist(); }
      o.setTitle(base(path)); $("#st", tool).textContent = "Enregistré";
    };
  } });
}
function explorer(start) {
  openWin({ kind: "explorer", title: "Explorateur de fichiers", icon: IC.folder, w: 720, h: 470, build(b, o) {
    let cur = start || "/Documents", sel = null;
    const tool = el("div", "tool");
    const up = el("button", "", `<span style="display:inline-block;width:14px;height:14px;vertical-align:-2px">${IC.up}</span>`), path = el("input"), nf = el("button", "", "＋ Dossier"), nt = el("button", "", "＋ Fichier"), rn = el("button", "", "Renommer"), del = el("button", "", "Supprimer");
    tool.append(up, path, nf, nt, rn, del);
    const split = el("div", "split"), nav = el("div", "nav"), list = el("div", "list"), status = el("div", "status");
    split.append(nav, list); b.append(tool, split, status);
    const places = [["Bureau", "/Bureau", IC.folder], ["Documents", "/Documents", IC.folder], ["Téléchargements", "/Téléchargements", IC.folder]];
    const linux = [["Dossier personnel", "L:/root", IC.linux], ["Racine /", "L:/", IC.linux], ["Projets (/root/…)", "L:/root", IC.folder]];
    function drawNav() {
      nav.innerHTML = "<h5>Ce navigateur</h5>";
      for (const [n, p, i] of places) { const d = el("div", cur === p ? "on" : "", `<span style="width:18px;height:18px">${i}</span>${n}`); d.onclick = () => go(p); nav.append(d); }
      nav.append(el("h5", "", "Linux (vraie machine)"));
      for (const [n, p, i] of linux.slice(0, 2)) { const d = el("div", cur === p ? "on" : "", `<span style="width:18px;height:18px">${i}</span>${n}`); d.onclick = () => go(p); nav.append(d); }
    }
    async function go(p) { cur = p; sel = null; await draw(); }
    async function draw() {
      path.value = isL(cur) ? lp(cur) + "  (Linux)" : cur; drawNav(); list.innerHTML = "";
      let rows;
      if (isL(cur)) {
        if (L.state !== "ready") { list.append(el("div", "row", "<i style='color:var(--muted)'>Linux démarre… patiente un instant</i>")); return; }
        list.append(el("div", "row", "<i style='color:var(--muted)'>Chargement…</i>"));
        const items = await L.list(lp(cur));
        list.innerHTML = "";
        if (!items) { list.append(el("div", "row", "Dossier introuvable")); return; }
        rows = items.sort((a, b2) => (a.dir === b2.dir ? a.name.localeCompare(b2.name) : a.dir ? -1 : 1)).map((i) => ({ p: (cur === "L:/" ? "L:/" : cur + "/") + i.name, dir: i.dir }));
      } else rows = children(cur).map((p) => ({ p, dir: fsv[p].t === "d" }));
      for (const r of rows) {
        const row = el("div", "row" + (r.p === sel ? " sel" : ""), `<span class="g">${r.dir ? IC.folder : IC.file}</span><span>${esc(base(r.p))}</span>`);
        row.onclick = () => { sel = r.p; list.querySelectorAll(".sel").forEach((n) => n.classList.remove("sel")); row.classList.add("sel"); };
        row.ondblclick = () => (r.dir ? go(r.p) : notepad(r.p));
        list.append(row);
      }
      if (!rows.length) list.append(el("div", "row", "<i style='color:var(--muted)'>Ce dossier est vide.</i>"));
      status.textContent = rows.length + " élément(s)";
    }
    up.onclick = () => go(isL(cur) ? "L:" + parent(lp(cur)) : parent(cur));
    path.onkeydown = (e) => { if (e.key === "Enter") { const v = path.value.replace(/\s*\(Linux\)$/, "") || "/"; go(isL(cur) ? "L:" + v : v); } };
    const lcmd = async (c) => { await L.run(c); await draw(); };
    nf.onclick = async () => { const n = prompt("Nom du dossier :"); if (!n) return; if (isL(cur)) await lcmd(`mkdir -p ${L.quote(lp(cur) + "/" + n)}`); else { fsv[joinp(cur, n)] = { t: "d" }; persist(); await draw(); } };
    nt.onclick = async () => { const n = prompt("Nom du fichier :", "nouveau.txt"); if (!n) return; if (isL(cur)) await lcmd(`touch ${L.quote(lp(cur) + "/" + n)}`); else { fsv[joinp(cur, n)] = { t: "f", c: "" }; persist(); await draw(); } };
    rn.onclick = async () => { if (!sel) return; const n = prompt("Nouveau nom :", base(sel)); if (!n) return; if (isL(sel)) await lcmd(`mv ${L.quote(lp(sel))} ${L.quote(parent(lp(sel)) + "/" + n)}`); else { const np = joinp(parent(sel), n); for (const k of Object.keys(fsv)) if (k === sel || k.startsWith(sel + "/")) { fsv[np + k.slice(sel.length)] = fsv[k]; delete fsv[k]; } persist(); await draw(); } };
    del.onclick = async () => { if (!sel || !confirm("Supprimer " + base(sel) + " ?")) return; if (isL(sel)) await lcmd(`rm -rf ${L.quote(lp(sel))}`); else { rmTree(sel); persist(); await draw(); } };
    o.refresh = draw;
    const off = L.onState(() => { if (isL(cur)) draw(); });
    o.onClose = off;
    draw();
  } });
}

let termWin = null;
function terminal() {
  if (termWin && wins.includes(termWin)) { termWin.el.classList.remove("min"); termWin.focus(); return; }
  termWin = openWin({ kind: "term", title: "Terminal — Linux", icon: IC.term, w: 760, h: 440, build(b, o) {
    const box = el("div", "term"); b.append(box);
    if (!window.Terminal) { box.textContent = "Terminal indisponible (xterm.js manquant)."; return; }
    const term = new window.Terminal({ cols: 80, rows: 24, fontFamily: '"Cascadia Mono",Consolas,"DejaVu Sans Mono",monospace', fontSize: 14, cursorBlink: true, theme: { background: "#0c0c0c", foreground: "#cccccc" }, scrollback: 2000 });
    term.open(box);
    o.term = term;
    const offIn = term.onData((d) => L.send(d));
    const offOut = L.onOutput((u) => term.write(u));
    let lastSize = "";
    const fit = () => {
      try {
        const d = term._core._renderService.dimensions.css.cell;
        const cols = Math.max(20, Math.floor((box.clientWidth - 12) / d.width)), rows = Math.max(5, Math.floor((box.clientHeight - 4) / d.height));
        if (`${cols}x${rows}` === lastSize) return;
        lastSize = `${cols}x${rows}`; term.resize(cols, rows);
        if (L.state === "ready") { L.mute(600); L.send(`stty cols ${cols} rows ${rows}\n`); }
      } catch {}
    };
    o.onResize = () => { clearTimeout(o.rt); o.rt = setTimeout(fit, 120); };
    const offState = L.onState((s) => { if (s === "ready") { setTimeout(fit, 300); } });
    if (L.state !== "ready") term.write("\x1b[36mLa machine Linux démarre… (1 à 2 min la première fois)\x1b[0m\r\n");
    else setTimeout(() => { fit(); L.send("\n"); }, 200);
    setTimeout(fit, 100);
    o.onClose = () => { offIn.dispose(); offOut(); offState(); term.dispose(); };
    box.addEventListener("pointerdown", () => term.focus());
    term.focus();
  } });
}

const POP = [
  ["htop", "Moniteur de processus", "#2f9e44"], ["vim", "Éditeur de texte puissant", "#2b8a3e"], ["python3", "Langage Python", "#3b82f6"],
  ["nodejs", "JavaScript (Node)", "#16a34a"], ["git", "Gestion de versions", "#f97316"], ["gcc", "Compilateur C", "#6366f1"],
  ["neofetch", "Infos système", "#06b6d4"], ["mc", "Gestionnaire de fichiers", "#0ea5e9"], ["tmux", "Multi-terminaux", "#8b5cf6"], ["lynx", "Navigateur texte", "#e11d48"]
];
function store() {
  openWin({ kind: "store", title: "Logiciels (Linux)", icon: IC.store, w: 640, h: 480, build(b) {
    const tool = el("div", "tool"); const q = el("input"); q.placeholder = "Rechercher un logiciel Linux (apk)"; const go = el("button", "btn pri", "Rechercher"); tool.append(q, go);
    const body = el("div", "store"); const msg = el("div", "status"); b.append(tool, body, msg);
    const row = (name, desc, color) => {
      const r = el("div", "pkg", `<div class="g" style="background:${color || "#64748b"}">${esc(name[0].toUpperCase())}</div><div class="n"><b>${esc(name)}</b><small>${esc(desc)}</small></div>`);
      const bt = el("button", "btn pri", "Installer");
      bt.onclick = async () => {
        if (L.state !== "ready") { toast("Linux démarre encore, patiente un instant."); return; }
        bt.disabled = true; bt.textContent = "Installation…"; msg.textContent = "apk add " + name + " …";
        const out = await L.run(`apk update -q; apk add ${L.quote(name)} 2>&1 | tail -3`, 300000);
        const ok = !/ERROR|error:/.test(out); bt.textContent = ok ? "Installé ✓" : "Échec"; bt.disabled = false; msg.textContent = out.split("\n").pop();
        toast(ok ? name + " est installé. Lance-le dans le terminal." : "Échec : " + out.slice(-120));
      };
      r.append(bt); return r;
    };
    const showPop = () => { body.innerHTML = "<h3 style='margin-top:0'>Populaires</h3>"; POP.forEach(([n, d, c]) => body.append(row(n, d, c))); };
    go.onclick = async () => {
      const t = q.value.trim(); if (!t) return showPop();
      if (L.state !== "ready") { toast("Linux démarre encore, patiente un instant."); return; }
      body.innerHTML = "Recherche…";
      const out = await L.run(`apk update -q; apk search -v ${L.quote(t)} | head -25`, 120000);
      body.innerHTML = ""; for (const l of out.split("\n").filter(Boolean)) { const m = l.match(/^(.+?)-\d[^ ]*\s+-\s+(.*)$/) || [0, l, ""]; body.append(row(m[1], m[2])); }
      if (!body.children.length) body.textContent = "Aucun résultat.";
    };
    q.onkeydown = (e) => { if (e.key === "Enter") go.onclick(); };
    showPop();
  } });
}
function calculator() {
  openWin({ kind: "calc", title: "Calculatrice", icon: IC.calc, w: 320, h: 460, build(b) {
    const c = el("div", "calc"), scr = el("div", "scr", "0"); c.append(scr); let expr = "";
    for (const k of ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="]) {
      const bt = el("button", k === "=" ? "eq" : "", k);
      bt.onclick = () => {
        if (k === "C") expr = ""; else if (k === "⌫") expr = expr.slice(0, -1);
        else if (k === "=") { try { const e = expr.replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-"); if (!/^[0-9+\-*/().\s]*$/.test(e)) throw 0; expr = String(Function('"use strict";return (' + (e || "0") + ")")()); } catch { expr = "Erreur"; } }
        else { if (expr === "Erreur") expr = ""; expr += k; }
        scr.textContent = expr || "0";
      };
      c.append(bt);
    }
    b.append(c);
  } });
}
function browser() {
  openWin({ kind: "web", title: "Navigateur", icon: IC.globe, w: 800, h: 500, build(b) {
    const tool = el("div", "tool"), rl = el("button", "", "↻"), addr = el("input"), ext = el("button", "", "Ouvrir dans un onglet");
    tool.append(rl, addr, ext);
    const fr = el("iframe"); fr.referrerPolicy = "no-referrer";
    b.append(tool, el("div", "status", "Beaucoup de sites refusent d'être affichés dans une fenêtre (Google, YouTube, GitHub…). Utilise « Ouvrir dans un onglet » si la page reste blanche."), fr);
    const go = () => { let u = addr.value.trim(); if (!/^https?:/.test(u)) u = /\./.test(u) ? "https://" + u : "https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(u); addr.value = u; fr.src = u; };
    addr.onkeydown = (e) => { if (e.key === "Enter") go(); };
    rl.onclick = go; ext.onclick = () => window.open(addr.value, "_blank", "noopener");
    addr.value = "https://fr.wikipedia.org/wiki/Linux"; go();
  } });
}
function settingsApp() {
  openWin({ kind: "settings", title: "Paramètres", icon: IC.gear, w: 520, h: 460, build(b) {
    const s = el("div", "set", `<h3 style="margin-top:0">Personnalisation</h3><button class="btn" id="th"></button><h3>Fond d'écran</h3><div id="wl"></div><h3>Linux</h3><button class="btn" id="sv">Sauvegarder la session Linux</button><h3>Données</h3><button class="btn" id="rs">Effacer les fichiers du navigateur</button>`);
    b.append(s);
    const th = $("#th", s), lab = () => (th.textContent = settings.dark ? "Passer en mode clair" : "Passer en mode sombre"); lab();
    th.onclick = () => { settings.dark = !settings.dark; lab(); applySettings(); };
    WALLS.forEach((w, i) => { const d = el("span", "sw"); d.style.background = w; d.style.borderRadius = "8px"; d.style.width = "72px"; d.style.height = "44px"; d.onclick = () => { settings.wall = i; applySettings(); }; $("#wl", s).append(d); });
    $("#sv", s).onclick = saveLinux;
    $("#rs", s).onclick = () => { if (confirm("Effacer tous les fichiers du navigateur ?")) { localStorage.removeItem(FKEY); location.reload(); } };
  } });
}
async function saveLinux() {
  if (L.state !== "ready") { toast("Linux n'est pas prêt."); return; }
  try { toast("Sauvegarde de Linux…", 60000); const n = await L.save((s) => toast(s, 60000)); toast("Linux sauvegardé (" + (n / 1048576).toFixed(0) + " Mo)."); }
  catch (e) { toast("Échec de la sauvegarde : " + (e.message || e), 8000); }
}

const APPS = [
  { id: "explorateur", name: "Explorateur", ic: IC.folder, run: () => explorer() },
  { id: "navigateur", name: "Navigateur", ic: IC.globe, run: browser },
  { id: "terminal", name: "Terminal", ic: IC.term, run: terminal },
  { id: "logiciels", name: "Logiciels", ic: IC.store, run: store },
  { id: "bloc-notes", name: "Bloc-notes", ic: IC.note, run: () => notepad() },
  { id: "calculatrice", name: "Calculatrice", ic: IC.calc, run: calculator },
  { id: "parametres", name: "Paramètres", ic: IC.gear, run: settingsApp },
  { id: "linux", name: "Linux graphique", ic: IC.linux, run: () => window.open("index.html", "_blank") }
];

// ---------- Barre des tâches, Démarrer ----------
const items = $("#items");
const mkTb = (k, ic, title, fn, pin) => { const b = el("button", "tb" + (pin ? " pin" : ""), `<span class="g">${ic}</span>`); b.title = title; if (pin) b.dataset.k = k; b.onclick = fn; items.append(b); return b; };
const startMenu = $("#start");
const startBtn = mkTb("", IC.start, "Démarrer", (e) => { e.stopPropagation(); toggleStart(); });
const sb = el("button", "tb search", `<span class="g" style="width:16px;height:16px">${IC.search}</span>Rechercher`); sb.onclick = (e) => { e.stopPropagation(); toggleStart(true); }; items.append(sb);
mkTb("explorer", IC.folder, "Explorateur de fichiers", () => { const o = wins.find((x) => x.kind === "explorer"); o ? toggleWin(o) : explorer(); }, true);
mkTb("web", IC.globe, "Navigateur", () => { const o = wins.find((x) => x.kind === "web"); o ? toggleWin(o) : browser(); }, true);
mkTb("term", IC.term, "Terminal", () => { const o = wins.find((x) => x.kind === "term"); o ? toggleWin(o) : terminal(); }, true);
mkTb("store", IC.store, "Logiciels", () => { const o = wins.find((x) => x.kind === "store"); o ? toggleWin(o) : store(); }, true);

function drawApps(f = "") {
  const g = $("#apps"); g.innerHTML = "";
  for (const a of APPS.filter((x) => x.name.toLowerCase().includes(f.toLowerCase()))) { const d = el("div", "app", `<div class="g">${a.ic}</div>${a.name}`); d.onclick = () => { startMenu.classList.remove("open"); a.run(); }; g.append(d); }
  const r = $("#rec"); r.innerHTML = "";
  for (const p of children("/Documents").slice(0, 4)) { const d = el("div", "recrow", `<span class="g">${IC.file}</span><div>${esc(base(p))}<small>Documents</small></div>`); d.onclick = () => { startMenu.classList.remove("open"); notepad(p); }; r.append(d); }
}
function toggleStart(focusSearch) {
  startMenu.classList.toggle("open", focusSearch ? true : !startMenu.classList.contains("open"));
  $("#pm").classList.remove("open");
  if (startMenu.classList.contains("open")) { $("#q").value = ""; drawApps(); $("#q").focus(); }
}
$("#q").oninput = (e) => drawApps(e.target.value);
$("#q").onkeydown = (e) => { if (e.key === "Enter") { const a = APPS.find((x) => x.name.toLowerCase().includes(e.target.value.toLowerCase())); if (a) { startMenu.classList.remove("open"); a.run(); } } };
document.addEventListener("pointerdown", (e) => { if (!startMenu.contains(e.target) && !startBtn.contains(e.target) && !sb.contains(e.target)) startMenu.classList.remove("open"); $("#menu").style.display = "none"; });
$("#pbtn").onclick = (e) => { e.stopPropagation(); $("#pm").classList.toggle("open"); };
$("#p-save").onclick = () => { startMenu.classList.remove("open"); saveLinux(); };
$("#p-gui").onclick = () => window.open("index.html", "_blank");
$("#p-back").onclick = () => (location.href = "index.html");
for (const a of APPS) { const d = el("div", "dicon", `<div class="g">${a.ic}</div>${a.name}`); d.ondblclick = () => a.run(); $("#icons").append(d); }
$("#desk").addEventListener("contextmenu", (e) => {
  if (e.target !== $("#desk") && e.target !== $("#icons")) return;
  e.preventDefault(); const m = $("#menu"); m.innerHTML = "";
  for (const [n, f] of [["Personnaliser", settingsApp], ["Ouvrir dans le terminal", terminal], ["Actualiser", () => location.reload()]]) { const d = el("div", "", n); d.onclick = f; m.append(d); }
  m.style.left = Math.min(e.clientX, innerWidth - 220) + "px"; m.style.top = Math.min(e.clientY, innerHeight - 160) + "px"; m.style.display = "block";
});
function tick() { const d = new Date(); $("#clock").innerHTML = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) + "<br>" + d.toLocaleDateString("fr-FR"); }
tick(); setInterval(tick, 15000);

// ---------- État de la machine Linux ----------
L.onState((s, info) => {
  const dot = $("#vmdot"), txt = $("#vmtxt");
  dot.className = s === "ready" ? "ok" : s === "error" ? "err" : "";
  txt.textContent = s === "ready" ? "Linux prêt" : s === "error" ? "Linux : erreur" : "Linux démarre…";
  $("#vmpill").title = s === "error" ? "Erreur : " + info : "Machine Linux : " + s;
  if (s === "ready") toast("La machine Linux est prête.");
  if (s === "error") toast("Linux : " + info, 10000);
});
$("#vmpill").onclick = terminal;

applySettings();
drawApps();
window.__win = { open: (id) => APPS.find((a) => a.id === id).run(), wins, L };

// Démarrage de Linux en arrière-plan (reprise de la session sauvegardée si elle existe)
(async () => {
  if (new URLSearchParams(location.search).get("vm") === "0") return;
  if (await L.hasSaved()) {
    $("#boot").style.display = "grid";
    $("#b-res").onclick = () => { $("#boot").style.display = "none"; L.start({ restore: true }); };
    $("#b-new").onclick = () => { $("#boot").style.display = "none"; L.start(); };
  } else L.start();
})();
})();
