/* Atelier Touch : cœur de l'appli (données, sauvegarde locale, navigation, recherche, utilitaires).
   Les autres fichiers js/*.js déclarent leurs pages avec page("nom", {...}). */
"use strict";

const APP = { version: "touch-v1" };
const IMG = ""; // (ancienne adresse des images, remplacée par itemImg() / monUrl())
const D = { core: null };          // données du jeu (data/*.json)
const LOADED = {};                 // promesses de chargement des fichiers de données
let S;                             // état sauvegardé sur l'appareil

/* ---------- Utilitaires ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/\s+/g, " ").trim();
const fmt = (n, d = 0) => n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: 0 });
const kam = n => n == null || !isFinite(n) ? "—" : fmt(Math.round(n)) + " ₭";
const pct = (n, d = 0) => n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + fmt(n, d) + " %";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const today = () => new Date().toISOString().slice(0, 10);
const dayFr = d => new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const dateFr = ts => new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const ago = ts => { const m = (Date.now() - ts) / 6e4; return m < 60 ? `il y a ${Math.max(1, Math.round(m))} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const plural = (n, s, p) => `${fmt(n)} ${n > 1 ? (p || s + "s") : s}`;
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function papyLink(url, label = "Guide Papycha") { return url ? `<a class="papy" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : ""; }

/* ---------- Données ---------- */
function load(name) {
  if (!LOADED[name]) LOADED[name] = fetch(`data/${name}.json`).then(r => { if (!r.ok) throw new Error(name); return r.json(); }).then(j => (D[name] = j));
  return LOADED[name];
}
function need(...names) { return Promise.all(names.map(load)); }

const ITEM_CACHE = {};
function item(id) {
  id = String(id);
  if (ITEM_CACHE[id]) return ITEM_CACHE[id];
  const r = D.core.items[id];
  if (!r) return null;
  const t = D.core.types[r[1]] || ["?", 0];
  return (ITEM_CACHE[id] = { id: +id, name: r[0], type: r[1], typeName: t[0], sup: t[1], lvl: r[2], icon: r[3], set: r[4], fx: r[5], crit: r[6], w: r[7], flags: r[8], wp: r[9], npc: r[10] });
}
const itemName = id => item(id)?.name || `Objet ${id}`;
// Catégorie de couleur d'un objet
function catOf(it) {
  if (!it) return "other";
  if ([1, 2, 3, 4, 5, 7, 10, 11, 12, 13, 21, 22, 23, 24, 26, 27, 28].includes(it.sup)) return it.sup === 13 ? "rare" : "equip";
  if (it.sup === 9) return "res";
  if (it.sup === 6) return "cons";
  return "other";
}
const CATV = { equip: "--k-equip", rare: "--k-rare", res: "--k-res", cons: "--k-cons", other: "--k-other" };
function icon(id, cls = "") {
  const it = item(id);
  const c = CATV[catOf(it)];
  return `<img class="ico ${cls}" style="--cat:var(${c})" src="${itemImg(it ? it.icon : 0)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
}
function monImg(id, cls = "") { return `<img class="ico ${cls}" style="--cat:var(--bad)" src="${monUrl(id)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`; }
function asset(path) { return (D.core?.assets || "") + "/" + path; }
// Images du jeu : CDN officiel de Dofus Touch (static.ankama.com refuse les images affichées sur d'autres sites)
function itemImg(iconId) { return asset(`gfx/items/${iconId}.png`); }
function monUrl(id) { return asset(`gfx/monsters/${id}.png`); }
function spellImg(iconId, cls = "") { return `<img class="${cls}" src="${asset(`gfx/spells/sort_${iconId}.png`)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`; }
function jobImg(jobId, cls = "ico s") { const j = D.core.jobs[jobId]; return `<img class="${cls}" src="${asset(`gfx/jobs/${j ? j[1] : 0}.png`)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`; }
// Ligne objet cliquable (ouvre la fiche)
function itemLine(id, sub = "", cls = "") {
  const it = item(id);
  if (!it) return `<span class="muted">Objet ${esc(id)}</span>`;
  return `<button type="button" class="link itemline" data-item="${it.id}">${icon(it.id, cls)}<span class="t"><span class="nm">${esc(it.name)}</span><small>${sub || `${esc(it.typeName)} · niv. ${it.lvl}`}</small></span></button>`;
}
function monLine(id, sub = "") {
  const m = D.monsters?.monsters[id];
  if (!m) return `<span class="muted">Monstre ${esc(id)}</span>`;
  return `<button type="button" class="link itemline" data-mon="${id}">${monImg(id, "s")}<span class="t"><span class="nm">${esc(m[0])}</span><small>${sub || monLvl(m)}</small></span></button>`;
}
function monLvl(m) { const g = m[3]; if (!g.length) return ""; const a = g[0][0], b = g[g.length - 1][0]; return a === b ? `niv. ${a}` : `niv. ${a} à ${b}`; }

/* ---------- Effets ---------- */
// Texte d'un effet [effet, min, max, valeur] à partir du modèle du jeu (#1{~1~2 à }#2 Force)
function fxText(e, opts = {}) {
  const [id, a = 0, b = 0, v = 0] = e;
  const E = D.core.effects[id];
  if (!E) return `Effet ${id}`;
  let t = E[0] || "";
  let p1 = a, p2 = b, p3 = v;
  if (opts.roll != null) { p1 = opts.roll; p2 = 0; }
  if ([10, 795, 724, 1151, 1175].includes(id)) {
    if (id === 795 || id === 724) return t.replace(/#\d/g, "").trim();
  }
  if (/#1/.test(t) && E[1] === 0 && !/[0-9]/.test(String(a)) && v) p1 = v;
  t = t.replace(/\{~1~2([^}]*)\}/g, (_, mid) => (p2 && p2 !== p1 ? mid : ""));
  t = t.replace(/\{~1([^}]*)\}/g, (_, mid) => (p1 ? mid : ""));
  t = t.replace(/\{~2([^}]*)\}/g, (_, mid) => (p2 ? mid : ""));
  t = t.replace(/\{~[^}]*\}/g, "");
  t = t.replace(/#1/g, p1 || (p3 ? p3 : 0)).replace(/#2/g, p2 && p2 !== p1 ? p2 : "").replace(/#3/g, p3 || "");
  // Noms d'objets, de monstres ou d'états désignés par la valeur
  t = t.replace(/%[0-9]/g, "");
  return t.replace(/\s+/g, " ").replace(/ à $/, "").trim();
}
function fxIsNeg(e) { const E = D.core.effects[e[0]]; return E && (E[4] === "-" || /^-/.test(E[0])); }
// Liste HTML des effets d'un objet (sans les effets techniques masqués)
const HIDDEN_FX = new Set([2826, 2861, 981, 982, 983, 984, 985, 988, 806, 807, 808, 1, 2, 3, 4, 5]);
function fxList(fx, opts = {}) {
  const li = (fx || []).filter(e => !HIDDEN_FX.has(e[0]) && D.core.effects[e[0]] && D.core.effects[e[0]][0]).map(e => {
    const isDmg = (e[0] >= 91 && e[0] <= 100) || e[0] === 108;
    return `<li class="${fxIsNeg(e) ? "neg" : isDmg ? "dmg" : ""}">${esc(fxText(e, opts))}</li>`;
  });
  return li.length ? `<ul class="fx">${li.join("")}</ul>` : `<p class="muted small">Aucun effet.</p>`;
}

/* ---------- Sauvegarde sur l'appareil ---------- */
const KEY = "atelier-touch";
const DEFAULT = () => ({
  v: 1,
  settings: { server: "Kelerog", tax: 2, lvl: 200, bonusPack: false, almOffset: 0, breed: 1, sex: 0 },
  prices: {},     // id -> [[horodatage, prix à l'unité, prix du lot de 10, prix du lot de 100]]
  watch: [],      // objets suivis
  stock: {},      // inventaire id -> quantité
  plan: [],       // plan de craft [{id, n}]
  bought: {},     // liste d'achat cochée
  jobs: {},       // métier -> niveau
  jobxp: {},      // métier -> XP actuelle
  builds: [],     // builds
  quests: {},     // quêtes faites id -> 1
  ach: {},        // succès faits
  dung: {},       // donjons faits
  ui: {},         // filtres mémorisés
});
function loadState() {
  try { S = Object.assign(DEFAULT(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = DEFAULT(); }
  S.settings = Object.assign(DEFAULT().settings, S.settings || {});
}
const save = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast("Sauvegarde impossible : espace du navigateur plein."); } }, 300);
function ui(key, def) { return key in S.ui ? S.ui[key] : def; }
function setUi(key, v) { S.ui[key] = v; save(); }

/* ---------- Prix (relevés de l'HDV, sur l'appareil) ---------- */
// Prix unitaire le plus bas parmi les lots d'un relevé
function unitOf(r) { const c = [r[1], r[2] ? r[2] / 10 : 0, r[3] ? r[3] / 100 : 0].filter(x => x > 0); return c.length ? Math.min(...c) : null; }
function priceRec(id) { const h = S.prices[id]; return h && h.length ? h[h.length - 1] : null; }
function price(id) { const r = priceRec(id); return r ? unitOf(r) : null; }
function setPrice(id, p1, p10, p100) {
  p1 = +p1 || 0; p10 = +p10 || 0; p100 = +p100 || 0;
  if (!p1 && !p10 && !p100) return;
  const h = S.prices[id] || (S.prices[id] = []);
  const now = Date.now(), last = h[h.length - 1];
  if (last && new Date(last[0]).toDateString() === new Date(now).toDateString()) h[h.length - 1] = [now, p1, p10, p100];
  else h.push([now, p1, p10, p100]);
  if (h.length > 400) h.splice(0, h.length - 400);
  save();
  emit("prices");
}
// Variation du prix unitaire depuis N jours (en %)
function trend(id, days = 7) {
  const h = S.prices[id]; if (!h || h.length < 2) return null;
  const last = h[h.length - 1], lim = last[0] - days * 864e5;
  let ref = null; for (const r of h) { if (r[0] <= lim) ref = r; }
  ref = ref || h[0]; if (ref === last) return null;
  const a = unitOf(ref), b = unitOf(last); return a && b ? (b / a - 1) * 100 : null;
}
function trendChip(id, days = 7) { const t = trend(id, days); if (t == null || Math.abs(t) < .5) return ""; return `<span class="chip ${t > 0 ? "up" : "down"}">${t > 0 ? "▲" : "▼"} ${pct(t)}</span>`; }

/* ---------- Recettes ---------- */
const recipe = id => D.core.recipes[id] || null;
let USED_IN = null; // ingrédient -> [objets fabriqués]
function usedIn(id) {
  if (!USED_IN) { USED_IN = {}; for (const [res, r] of Object.entries(D.core.recipes)) for (const i of r[1]) (USED_IN[i] = USED_IN[i] || []).push(+res); }
  return USED_IN[id] || [];
}
// Coût d'un objet : prix relevé, ou coût de ses ingrédients s'il est fabricable et moins cher (profondeur limitée)
function costOf(id, depth = 3, seen = new Set()) {
  const p = price(id);
  const r = recipe(id);
  if (!r || depth <= 0 || seen.has(id)) return p == null ? null : { v: p, how: "hdv" };
  seen.add(id);
  let sum = 0, ok = true;
  r[1].forEach((ing, i) => { const c = costOf(ing, depth - 1, seen); if (c == null) ok = false; else sum += c.v * r[2][i]; });
  seen.delete(id);
  if (ok && (p == null || sum < p)) return { v: sum, how: "craft" };
  return p == null ? null : { v: p, how: "hdv" };
}
// Coût des ingrédients d'une recette (au prix d'achat de chaque ingrédient, ou en le fabriquant si c'est moins cher)
function recipeCost(id, deep = true) {
  const r = recipe(id); if (!r) return null;
  let sum = 0, missing = 0;
  r[1].forEach((ing, i) => { const c = deep ? costOf(ing, 2) : (price(ing) != null ? { v: price(ing) } : null); if (c == null) missing++; else sum += c.v * r[2][i]; });
  return { v: sum, missing, n: r[1].length };
}
const taxRate = () => (+S.settings.tax || 0) / 100;

/* ---------- Recherche ---------- */
let SEARCH = null;
function buildSearch() {
  SEARCH = Object.entries(D.core.items).map(([id, r]) => [+id, norm(r[0]), r[2]]);
}
// Objets dont le nom contient tous les mots cherchés ; les noms qui commencent par la recherche d'abord
function find(q, opts = {}) {
  if (!SEARCH) buildSearch();
  const n = norm(q); if (!n) return [];
  const words = n.split(" ");
  const out = [];
  for (const [id, nm, lvl] of SEARCH) {
    if (!words.every(w => nm.includes(w))) continue;
    if (opts.filter && !opts.filter(item(id))) continue;
    out.push([nm === n ? 0 : nm.startsWith(n) ? 1 : 2, nm.length, id]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return out.slice(0, opts.limit || 30).map(x => x[2]);
}
// Champ de recherche avec liste de résultats ; onPick(id) à la sélection
function searchBox(input, onPick, opts = {}) {
  const box = document.createElement("div"); box.className = "results"; box.hidden = true;
  input.parentElement.appendChild(box);
  let sel = -1, ids = [];
  const render = () => {
    const q = input.value;
    ids = q.length >= 2 ? (opts.source ? opts.source(q) : find(q, opts).map(id => ({ id, html: itemLine(id) }))) : [];
    sel = -1;
    box.innerHTML = ids.map((r, i) => `<button type="button" data-i="${i}">${r.html.replace(/^<button[^>]*>|<\/button>$/g, "")}</button>`).join("") || (q.length >= 2 ? `<p class="muted small" style="padding:8px">Aucun résultat.</p>` : "");
    box.hidden = q.length < 2;
  };
  input.addEventListener("input", debounce(render, 120));
  input.addEventListener("focus", () => { if (input.value.length >= 2) render(); });
  input.addEventListener("keydown", e => {
    const bs = $$("button", box);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = clamp(sel + (e.key === "ArrowDown" ? 1 : -1), 0, bs.length - 1); bs.forEach((b, i) => b.classList.toggle("on", i === sel)); bs[sel]?.scrollIntoView({ block: "nearest" }); }
    if (e.key === "Enter" && ids.length) { e.preventDefault(); pick(ids[Math.max(0, sel)]); }
    if (e.key === "Escape") box.hidden = true;
  });
  box.addEventListener("mousedown", e => e.preventDefault());
  box.addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (b) pick(ids[+b.dataset.i]); });
  input.addEventListener("blur", () => setTimeout(() => box.hidden = true, 150));
  function pick(r) { box.hidden = true; if (opts.keep !== true) input.value = ""; onPick(r.id, r); }
}

/* ---------- Événements internes ---------- */
const LISTENERS = {};
function on(ev, fn) { (LISTENERS[ev] = LISTENERS[ev] || []).push(fn); }
function emit(ev, x) { (LISTENERS[ev] || []).forEach(fn => { try { fn(x); } catch (e) { console.error(e); } }); }

/* ---------- Navigation ---------- */
const GROUPS = [
  { id: "home", name: "Accueil", icon: 23003, pages: ["accueil", "almanax"] },
  { id: "ency", name: "Encyclopédie", short: "Encyclo", icon: 16041, pages: ["objets", "panoplies", "monstres"] },
  { id: "market", name: "Marché", icon: 100056, pages: ["prix", "crafts", "brisage"] },
  { id: "prod", name: "Production", icon: 8001, pages: ["plan", "inventaire", "metiers", "farm"] },
  { id: "adv", name: "Aventure", icon: 84226, pages: ["donjons", "quetes", "succes", "carte"] },
  { id: "perso", name: "Perso", icon: 23002, pages: ["builds", "sorts", "guides", "reglages"] },
];
const PAGES = {};
function page(name, def) { PAGES[name] = def; }
let VIEW = null, ARGS = [];
function groupOf(name) { return GROUPS.find(g => g.pages.includes(name)) || GROUPS[0]; }
function menuIcon(ic) { return typeof ic === "string" && ic.startsWith("m:") ? `<img src="${monUrl(ic.slice(2))}" alt="">` : `<img src="${itemImg(ic)}" alt="">`; }
function renderNav() {
  const cur = VIEW, g = groupOf(cur);
  document.body.dataset.g = g.id;
  $("#sidenav").innerHTML = GROUPS.map(gr => `<div class="g">${esc(gr.name)}</div>` + gr.pages.filter(p => PAGES[p]).map(p =>
    `<a href="#${p}" ${p === cur ? 'aria-current="page"' : ""} data-g="${gr.id}">${menuIcon(PAGES[p].icon)}<span>${esc(PAGES[p].title)}</span></a>`).join("")).join("");
  $("#bottom").innerHTML = GROUPS.map(gr => `<a href="#${gr.pages[0] === "accueil" ? "accueil" : (S.ui["last-" + gr.id] || gr.pages[0])}" ${gr === g ? 'aria-current="page"' : ""} data-g="${gr.id}">${menuIcon(gr.icon)}<span>${esc(gr.short || gr.name)}</span></a>`).join("");
  $("#subnav").innerHTML = g.pages.length > 1 ? g.pages.filter(p => PAGES[p]).map(p => `<a href="#${p}" ${p === cur ? 'aria-current="page"' : ""}>${menuIcon(PAGES[p].icon)}${esc(PAGES[p].title)}</a>`).join("") : "";
}
function hero(name, extra = "") {
  const p = PAGES[name];
  return `<section class="hero"><div class="hi">${menuIcon(p.icon)}</div><div class="txt"><h1>${esc(p.title)}</h1><p>${p.intro || ""}</p>${extra}</div></section>`;
}
async function route() {
  const [name, ...args] = (location.hash.slice(1) || "accueil").split("/").map(decodeURIComponent);
  const p = PAGES[name] ? name : "accueil";
  VIEW = p; ARGS = args;
  const g = groupOf(p);
  if (g.id !== "home") { S.ui["last-" + g.id] = p; save(); }
  renderNav();
  const el = $("#view");
  el.innerHTML = `<div class="loading">Chargement…</div>`;
  try {
    if (PAGES[p].needs) await need(...PAGES[p].needs);
    if (VIEW !== p) return;
    el.innerHTML = "";
    await PAGES[p].render(el, args);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="empty"><strong>Oups, cette page n'a pas pu s'afficher.</strong><span>${esc(e.message || e)}</span><button class="btn" onclick="location.reload()">Recharger</button></div>`;
  }
  if (!args.length) window.scrollTo(0, 0);
}
function go(hash) { if (location.hash === "#" + hash) route(); else location.hash = hash; }
function rerender() { const y = scrollY; route().then(() => scrollTo(0, y)); }

/* ---------- Fiches (panneau latéral) ---------- */
const SHEETS = {}; // type -> fonction(id) qui remplit la fiche
function sheet(type, fn) { SHEETS[type] = fn; }
const HISTORY = [];
async function openSheet(type, id, push = true) {
  const dlg = $("#sheet"), inn = $("#sheet-in");
  if (push && dlg.open && HISTORY.length) HISTORY.push([type, id]); else if (push) HISTORY.splice(0, HISTORY.length, [type, id]);
  inn.innerHTML = `<div class="loading">Chargement…</div>`;
  if (!dlg.open) dlg.showModal();
  try { await SHEETS[type](inn, id); } catch (e) { console.error(e); inn.innerHTML = `<div class="empty" style="margin:16px"><strong>Fiche indisponible</strong><span>${esc(e.message || e)}</span></div>`; }
  inn.scrollTop = 0; dlg.scrollTop = 0;
}
function closeSheet() { const dlg = $("#sheet"); if (dlg.open) dlg.close(); HISTORY.length = 0; }
function sheetHead(img, title, chips = "", cat = "var(--sec)") {
  const back = HISTORY.length > 1 ? `<button class="x" data-back aria-label="Retour">←</button>` : "";
  return `<header class="sheet-head" style="--cat:${cat}">${img}<div><h2>${esc(title)}</h2><div class="chips">${chips}</div></div><div class="row">${back}<button class="x" data-close aria-label="Fermer">✕</button></div></header>`;
}
const openItem = id => openSheet("item", id);
const openMon = id => openSheet("mon", id);

/* ---------- Démarrage ---------- */
function bindGlobal() {
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-item]"); if (a) { e.preventDefault(); openItem(+a.dataset.item); return; }
    const m = e.target.closest("[data-mon]"); if (m) { e.preventDefault(); need("monsters").then(() => openMon(+m.dataset.mon)); return; }
    const s = e.target.closest("[data-sheet]"); if (s) { e.preventDefault(); const [t, i] = s.dataset.sheet.split(":"); openSheet(t, i); return; }
    if (e.target.closest("[data-close]")) { closeSheet(); return; }
    if (e.target.closest("[data-back]")) { HISTORY.pop(); const [t, i] = HISTORY[HISTORY.length - 1]; openSheet(t, i, false); return; }
    const l = e.target.closest("#sheet a[href^='#']"); if (l) closeSheet();
  });
  $("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
  $("#sheet").addEventListener("close", () => { HISTORY.length = 0; });
  addEventListener("hashchange", () => { closeSheet(); route(); });
  // Recherche globale : objets, puis monstres, quêtes, donjons
  searchBox($("#q-global"), (id, r) => {
    if (r.kind === "mon") openMon(id); else if (r.kind === "dj") openSheet("dungeon", id); else if (r.kind === "quest") openSheet("quest", id); else openItem(id);
  }, { source: q => globalSource(q) });
  need("monsters", "world", "quests").catch(() => {});
}
function globalSource(q) {
  const n = norm(q), out = find(q, { limit: 14 }).map(id => ({ id, html: itemLine(id), kind: "item" }));
  const ws = n.split(" ");
  const match = s => ws.every(w => norm(s).includes(w));
  if (D.monsters) for (const [id, m] of Object.entries(D.monsters.monsters)) { if (!(m[2] & 8) && match(m[0])) out.push({ id: +id, html: monLine(id, "Monstre · " + monLvl(m)), kind: "mon" }); if (out.length > 24) break; }
  if (D.world) for (const [id, d] of Object.entries(D.world.dungeons)) if (match(d[0])) out.push({ id: +id, kind: "dj", html: `<button class="link itemline">${monImg(d[4].find(m => D.monsters?.monsters[m]?.[2] & 1) || d[4][0] || 0, "s")}<span class="t"><span class="nm">${esc(d[0])}</span><small>Donjon · niv. ${d[1]}</small></span></button>` });
  if (D.quests) { let n2 = 0; for (const [id, x] of Object.entries(D.quests.quests)) if (match(x[0]) && n2++ < 8) out.push({ id: +id, kind: "quest", html: `<button class="link itemline"><img class="ico s" src="${itemImg(87001)}" alt=""><span class="t"><span class="nm">${esc(x[0])}</span><small>Quête · niv. ${x[2]}</small></span></button>` }); }
  return out.slice(0, 40);
}
async function start() {
  loadState();
  bindGlobal();
  try { await need("core"); }
  catch (e) { $("#view").innerHTML = `<div class="empty"><strong>Impossible de charger les données.</strong><span>Vérifie la connexion puis recharge la page.</span></div>`; return; }
  $("#ver").textContent = D.core.client;
  $$(".srv").forEach(s => s.textContent = S.settings.server || "Kelerog");
  caches?.keys?.().then(k => { const v = k.find(x => x.startsWith("touch-v")); if (v) $("#appver").textContent = "· appli " + v.replace("touch-", ""); }).catch(() => {});
  route();
}
document.addEventListener("DOMContentLoaded", start);
