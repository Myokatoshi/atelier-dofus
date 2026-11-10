(() => {
"use strict";
// =====================================================================
// Données du jeu
// =====================================================================
let D = null;                 // core.json
let INDEX = [];               // recherche
let USED_IN = {};             // ingrédient -> [recettes]
let SET_ITEMS = {};           // panoplie -> [objets]
const DET = {};               // détails chargés par paquet
const PATH = { farm: "data/farm.json", core: "data/core.json", det: n => "data/det/" + String(n).padStart(2, "0") + ".json", icon: n => "data/icons/" + String(n).padStart(2, "0") + ".webp" };

// État de l'utilisateur
const S = {
  stock: {},                  // id -> quantité
  prices: {},                 // id -> [{d:"AAAA-MM-JJ", lo, hi}] trié par date
  targets: [],                // [{id, qty}]
  expand: {},                 // ingrédients que l'on fabrique soi-même dans le plan
  farm: {},                   // ressources que l'on farme au lieu de les acheter
  builds: [],                 // [{id, name, items:[ids], at}]
  alerts: [],                 // [{id, kind:"buy"|"sell"|"craft", item, price, notified}]
  settings: { tax: 2, basis: "mid" },
};

const fmt = new Intl.NumberFormat("fr-FR");
const k = n => n == null || isNaN(n) ? "—" : fmt.format(Math.round(n));
const kk = n => { if (n == null || isNaN(n)) return "—"; const a = Math.abs(n); return a >= 1e6 ? (n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M" : a >= 1e4 ? (n / 1e3).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " k" : fmt.format(Math.round(n)); };
const range = (lo, hi) => lo == null ? "—" : Math.round(lo) === Math.round(hi) ? k(lo) : k(lo) + " – " + k(hi);
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’\-,.()]/g, " ").replace(/\s+/g, " ").trim();
const item = id => D.items[id] || ["Objet #" + id, 0, 0, -1, -1];
const typeName = id => (D.types[item(id)[2]] || [""])[0];
const recipe = id => D.recipes[id];
const jobName = j => D.jobs[j] || "Métier";
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const JOURS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => iso(new Date());
const parseD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
function parseKamas(v) {
  // « 1 200 », « 1.200 », « 1,200 », « 1200 » = 1 200 kamas ; « 1,5k » = 1 500 ; « 2,5m » = 2 500 000
  let s = String(v).trim().toLowerCase().replace(/[\s\u202f\u00a0'’₭]/g, "").replace(/kamas$|kama$/, "");
  if (!s) return null;
  let mult = 1;
  if (s.endsWith("m")) { mult = 1e6; s = s.slice(0, -1); } else if (s.endsWith("k")) { mult = 1e3; s = s.slice(0, -1); }
  // Sans suffixe, les kamas sont entiers : le point et la virgule séparent les milliers
  s = mult === 1 ? s.replace(/[.,]/g, "") : s.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * mult);
}

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [a, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (a.startsWith("on")) el.addEventListener(a.slice(2), v);
    else if (a === "class") el.className = v;
    else if (a === "text") el.textContent = v;
    else el.setAttribute(a, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [a, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(a, v);
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

function icon(id, px = 32, cls = "") {
  const p = item(id)[3];
  const el = h("span", { class: "ico " + cls, "aria-hidden": "true" });
  el.style.width = el.style.height = px + "px";
  if (D && D.types) el.style.setProperty("--cat", catVar(id));
  if (p >= 0 && D.icons) {
    const I = D.icons, n = p % I.per;
    el.style.backgroundImage = "url(" + PATH.icon(Math.floor(p / I.per)) + ")";
    el.style.backgroundSize = I.cols * px + "px";
    el.style.backgroundPosition = -(n % I.cols) * px + "px " + -Math.floor(n / I.cols) * px + "px";
  }
  return el;
}
// Nom d'objet cliquable qui ouvre sa fiche
function itemLink(id, sub, px = 28) {
  return h("button", { type: "button", class: "link itemline", onclick: () => openSheet(id) },
    icon(id, px), h("span", { class: "t" }, h("span", { class: "nm", text: item(id)[0] }), sub ? h("small", { text: sub }) : null));
}

// =====================================================================
// Sauvegarde : serveur Supabase (prix communs + données de chaque membre)
// et copie locale pour l'usage hors connexion
// =====================================================================
const CFG = window.ATELIER_CONFIG || {};
const saveEl = document.getElementById("save");
const saveState = (st, txt) => { document.querySelectorAll(".save").forEach(el => { el.dataset.s = st; el.lastElementChild.textContent = txt; el.title = txt; }); };
const LS = "atelier-dofus3-v2", LS_PRICES = "atelier-dofus3-prix";
function lsLoad() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch { return null; } }
function lsSave() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch {} }
function lsSavePrices() { try { localStorage.setItem(LS_PRICES, JSON.stringify(RAW)); } catch {} }
function lsLoadPrices() { try { return JSON.parse(localStorage.getItem(LS_PRICES) || "null"); } catch { return null; } }

let SB = null;                 // client Supabase
let NEED_LOGIN = false;
const pending = new Set(); let timer = null; let writing = false;
function persist(...keys) {
  lsSave();
  if (!SB || !ME) return;
  keys.forEach(x => pending.add(["inventaire", "plan", "builds"].includes(x) ? "state" : x));
  saveState("busy", "Enregistrement…");
  clearTimeout(timer); timer = setTimeout(flush, 700);
}
async function flush() {
  if (writing) { timer = setTimeout(flush, 300); return; }
  writing = true;
  try {
    for (const key of [...pending]) {
      pending.delete(key);
      if (key === "state") {
        const { error } = await SB.from("user_state").upsert({ user_id: ME, stock: S.stock, plan: { targets: S.targets, expand: S.expand, farm: S.farm, settings: S.settings, alerts: S.alerts }, builds: S.builds, updated_at: new Date().toISOString() });
        if (error) throw error;
      } else if (key.startsWith("s:")) {
        // Synchronise MES relevés d'un objet : ajoute/modifie, puis supprime les jours retirés
        const id = +key.slice(2), mine = (RAW[id] || {})[ME] || [];
        if (mine.length) {
          const { error } = await SB.from("price_obs").upsert(mine.map(o => ({ item_id: id, user_id: ME, d: o.d, lo: Math.round(o.lo), hi: Math.round(o.hi) })));
          if (error) throw error;
        }
        let del = SB.from("price_obs").delete().eq("item_id", id).eq("user_id", ME);
        if (mine.length) del = del.not("d", "in", "(" + mine.map(o => o.d).join(",") + ")");
        const { error } = await del;
        if (error) throw error;
      }
    }
    lsSavePrices();
    saveState("ok", "Enregistré pour le groupe");
  } catch (e) {
    saveState("err", navigator.onLine ? "Échec de l'enregistrement" : "Hors connexion : réessaie plus tard");
    console.error(e);
  } finally { writing = false; }
}

// Convertit les anciens formats (v1 : prix unique {p,t}) vers les fourchettes
function fromAnyBackup(o) {
  const out = { stock: o.stock || {}, prices: {}, targets: (o.targets || []).map(t => ({ id: +t.id, qty: Math.max(1, +t.qty || 1) })), expand: o.expand || {}, farm: o.farm || {},
    alerts: Array.isArray(o.alerts) ? o.alerts.filter(a => a && a.item && a.kind && a.price != null) : [],
    builds: Array.isArray(o.builds) ? o.builds.filter(b => b && Array.isArray(b.items)).map(b => ({ id: String(b.id || Math.random().toString(36).slice(2)), name: String(b.name || "Build"), items: b.items.map(Number), perso: b.perso && typeof b.perso === "object" ? b.perso : undefined, at: b.at || Date.now() })) : [],
    settings: { tax: 2, basis: "mid", ...(o.settings || {}) } };
  for (const [id, v] of Object.entries(o.prices || {})) {
    if (Array.isArray(v)) out.prices[id] = v.filter(x => x && x.d && x.lo != null).map(x => ({ d: x.d, lo: +x.lo, hi: +(x.hi ?? x.lo) }));
    else if (v && typeof v.p === "number") out.prices[id] = [{ d: iso(new Date(v.t || Date.now())), lo: v.p, hi: v.p }];
  }
  return out;
}

async function connect() {
  const local = lsLoad();
  if (local) Object.assign(S, local);
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey || !window.supabase) {
    saveState("local", "Mode local : serveur non configuré");
    render(); return;
  }
  // Prix en cache : l'appli reste utilisable hors connexion
  const cached = lsLoadPrices();
  if (cached) { RAW = cached; for (const id in RAW) aggregate(id); SH = { cached: true }; }
  SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  SB.auth.onAuthStateChange((ev, session) => {
    if (session && !ME) startOnline(session);
    if (ev === "SIGNED_OUT") { try { localStorage.removeItem(LS); localStorage.removeItem(LS_PRICES); localStorage.removeItem("atelier-journal"); } catch {} location.hash = ""; location.reload(); }
  });
  const { data } = await SB.auth.getSession();
  if (data && data.session) startOnline(data.session);
  else { NEED_LOGIN = true; saveState("local", "Non connecté"); render(); }
}
async function startOnline(session) {
  if (ME) return;
  ME = session.user.id; EMAIL = session.user.email || "";
  NEED_LOGIN = false;
  if (/access_token|type=magiclink/.test(location.hash)) history.replaceState(null, "", location.pathname + "#accueil");
  saveState("busy", "Connexion au groupe…");
  try {
    const { data: st, error } = await SB.from("user_state").select("*").eq("user_id", ME).maybeSingle();
    if (error) throw error;
    if (st) {
      const p = st.plan || {};
      S.stock = st.stock || {};
      S.targets = (p.targets || []).map(x => ({ id: +x.id, qty: +x.qty || 1 }));
      S.expand = p.expand || {}; S.farm = p.farm || {}; S.alerts = Array.isArray(p.alerts) ? p.alerts : [];
      S.settings = { tax: 2, basis: "mid", ...(p.settings || {}) };
      S.builds = fromAnyBackup({ builds: st.builds || [] }).builds;
      lsSave();
    } else persist("state"); // première connexion : on remonte la copie locale
    await loadAllPrices();
    subscribePrices();
    await loadProfiles();
    await loadTrades();
    saveState("ok", "Synchronisé avec le groupe");
  } catch (e) {
    console.error(e);
    saveState("err", navigator.onLine ? "Serveur injoignable" : "Hors connexion : prix en cache");
  }
  render();
}
async function loadAllPrices() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await SB.from("price_obs").select("item_id,user_id,d,lo,hi").order("item_id").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  RAW = {}; AGG = {};
  for (const r of rows) addRaw(r);
  for (const id in RAW) aggregate(id);
  SH = { live: true };
  lsSavePrices();
}
function addRaw(r) {
  const by = RAW[r.item_id] || (RAW[r.item_id] = {});
  const list = (by[r.user_id] || []).filter(o => o.d !== r.d);
  list.push({ d: r.d, lo: r.lo, hi: r.hi }); list.sort((a, b) => a.d < b.d ? -1 : 1);
  by[r.user_id] = list;
}
function delRaw(r) {
  const by = RAW[r.item_id]; if (!by || !by[r.user_id]) return;
  by[r.user_id] = by[r.user_id].filter(o => o.d !== r.d);
}
// Temps réel : chaque relevé d'un membre arrive chez tous les autres
function subscribePrices() {
  SB.channel("prix-groupe")
    .on("postgres_changes", { event: "*", schema: "public", table: "price_obs" }, p => {
      if (p.eventType === "DELETE") delRaw(p.old); else addRaw(p.new);
      const id = (p.new && p.new.item_id) || (p.old && p.old.item_id);
      if (id != null) aggregate(String(id));
      lsSavePrices();
      if (p.new && p.new.user_id && !(p.new.user_id in NAMES)) loadProfiles();
      softRender();
    })
    .subscribe();
}
async function loadProfiles() {
  const { data } = await SB.from("profiles").select("id,pseudo");
  for (const p of data || []) NAMES[p.id] = p.pseudo || "";
  softRender();
}
async function setPseudo(v) {
  v = String(v || "").trim().slice(0, 30);
  if (!v) return;
  const { error } = await SB.from("profiles").upsert({ id: ME, pseudo: v });
  if (error) { toast("Ce pseudo n'a pas pu être enregistré"); return; }
  NAMES[ME] = v; toast("Pseudo enregistré"); render();
}
// Écran de connexion : e-mail + mot de passe (comptes créés par l'administrateur du groupe)
let loginMsg = "";
function viewLogin() {
  const email = h("input", { type: "text", inputmode: "email", autocomplete: "username", id: "login-email", placeholder: "ton.adresse@mail.com", style: "width:100%" });
  const pass = h("input", { type: "password", autocomplete: "current-password", id: "login-pass", placeholder: "Mot de passe", style: "width:100%;font:600 1rem var(--f-body);padding:10px 13px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg)" });
  const go = async () => {
    const e = email.value.trim(), p = pass.value;
    if (!e || !p) { loginMsg = "Saisis ton adresse e-mail et ton mot de passe."; render(); return; }
    btn.disabled = true; btn.textContent = "Connexion…";
    const { error } = await SB.auth.signInWithPassword({ email: e, password: p });
    if (error) { loginMsg = /invalid/i.test(error.message) ? "Adresse ou mot de passe incorrect." : "Connexion impossible : " + error.message; render(); }
  };
  const btn = h("button", { type: "button", class: "btn primary", onclick: go }, "Se connecter");
  [email, pass].forEach(x => x.addEventListener("keydown", ev => { if (ev.key === "Enter") go(); }));
  return h("section", { class: "panel", style: "max-width:460px;margin:24px auto;width:100%" },
    h("h2", { text: "Connexion" }),
    h("p", { class: "muted", text: "L'Atelier est réservé au groupe. Connecte-toi avec l'adresse e-mail et le mot de passe que l'administrateur t'a donnés." }),
    email, pass, h("div", { class: "row" }, btn),
    loginMsg ? h("p", { class: "neg small", text: loginMsg }) : null,
    h("p", { class: "note", text: "Mot de passe oublié : demande à l'administrateur du groupe de le réinitialiser." }));
}
function accountPanel() {
  if (!SB) return h("section", { class: "panel" }, h("h2", { text: "Compte" }), h("p", { class: "muted", text: "Mode local : aucun serveur n'est configuré (fichier config.js). Tes données restent dans ce navigateur." }));
  if (!ME) return null;
  const ps = h("input", { type: "text", id: "pseudo", value: NAMES[ME] || "", placeholder: "Ton pseudo en jeu", maxlength: 30 });
  const np = h("input", { type: "password", id: "new-pass", autocomplete: "new-password", placeholder: "Nouveau mot de passe (8 caractères min.)", style: "font:600 1rem var(--f-body);padding:10px 13px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);color:var(--fg);min-width:0;flex:1 1 220px" });
  const changePass = async () => {
    if (np.value.length < 8) { toast("Le mot de passe doit faire au moins 8 caractères"); return; }
    const { error } = await SB.auth.updateUser({ password: np.value });
    np.value = "";
    toast(error ? "Le mot de passe n'a pas pu être changé" : "Mot de passe changé");
  };
  return h("section", { class: "panel" },
    h("h2", { text: "Compte" }),
    h("p", { class: "muted", text: "Connecté avec " + EMAIL + ". Ton pseudo s'affiche à côté de tes relevés de prix." }),
    h("div", { class: "row" }, ps, h("button", { type: "button", class: "btn primary", onclick: () => setPseudo(ps.value) }, "Enregistrer le pseudo")),
    h("div", { class: "row" }, np, h("button", { type: "button", class: "btn", onclick: changePass }, "Changer mon mot de passe")),
    h("div", { class: "row" }, h("button", { type: "button", class: "btn", onclick: () => SB.auth.signOut() }, "Se déconnecter")));
}

// =====================================================================
// Prix partagés par le groupe
// =====================================================================
let ME = null, EMAIL = "";
let SH = null;            // prix du groupe chargés (live ou cache)
let RAW = {};             // prix du groupe : id -> {uid: [{d, lo, hi}]}
let AGG = {};             // vue agrégée : id -> [{d, lo, hi, n, by}]
const NAMES = {};
const prices = () => SH ? AGG : S.prices;
// Moyenne des relevés d'un même jour (plusieurs membres peuvent relever le même objet)
function aggregate(id) {
  const days = new Map();
  for (const [u, list] of Object.entries(RAW[id] || {})) for (const o of (Array.isArray(list) ? list : [])) {
    if (!o || !o.d || o.lo == null) continue;
    const x = days.get(o.d) || { d: o.d, lo: 0, hi: 0, n: 0, by: [] };
    x.lo += +o.lo; x.hi += +(o.hi ?? o.lo); x.n++; x.by.push(u); days.set(o.d, x);
  }
  const arr = [...days.values()].map(x => ({ d: x.d, lo: x.lo / x.n, hi: x.hi / x.n, n: x.n, by: x.by })).sort((a, b) => a.d < b.d ? -1 : 1);
  if (arr.length) AGG[id] = arr; else delete AGG[id];
}
const whoName = u => u === ME ? "toi" : (NAMES[u] || "un membre");
// Ne pas effacer une saisie en cours quand un autre membre met un prix à jour
let needRender = false;
const editing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== "checkbox"; };
function softRender() { if (editing()) { needRender = true; return; } render(); }
document.addEventListener("focusout", () => setTimeout(() => { if (needRender && !editing()) { needRender = false; render(); } }, 80));
// Relevés personnels (importés d'une sauvegarde) pas encore versés dans les prix du groupe
function pendingShare() {
  if (!SH || !ME) return [];
  return Object.keys(S.prices).filter(id => { const mine = new Set(((RAW[id] || {})[ME] || []).map(o => o.d)); return (S.prices[id] || []).some(o => !mine.has(o.d)); });
}
function shareMine() {
  const ids = pendingShare();
  for (const id of ids) {
    const mine = [...((RAW[id] || {})[ME] || [])], have = new Set(mine.map(o => o.d));
    for (const o of S.prices[id]) if (!have.has(o.d)) mine.push({ d: o.d, lo: o.lo, hi: o.hi });
    mine.sort((a, b) => a.d < b.d ? -1 : 1);
    RAW[id] = { ...(RAW[id] || {}), [ME]: mine }; aggregate(id);
  }
  persist(...ids.map(id => "s:" + id));
  toast(ids.length + " objet" + (ids.length > 1 ? "s" : "") + " partagé" + (ids.length > 1 ? "s" : "") + " avec le groupe");
  render();
}

// =====================================================================
// Prix et calculs
// =====================================================================
const obsOf = id => prices()[id] || [];
function priceAt(id, at) { const o = obsOf(id); for (let i = o.length - 1; i >= 0; i--) if (!at || o[i].d <= at) return o[i]; return null; }
const midOf = o => (o.lo + o.hi) / 2;
const pick = (o, basis) => !o ? null : basis === "lo" ? o.lo : basis === "hi" ? o.hi : midOf(o);
function myObs(id, d) { return ((SH && ME ? (RAW[id] || {})[ME] : S.prices[id]) || []).find(o => o.d === d) || null; }
function addObs(id, lo, hi, d = today()) {
  if (lo == null && hi == null) return false;
  if (CFG.supabaseUrl && SB && !ME) { toast("Connexion au groupe en cours : réessaie dans un instant"); return false; }
  if (lo == null) lo = hi; if (hi == null) hi = lo;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (SH && ME) {
    const mine = [...((RAW[id] || {})[ME] || [])].filter(o => o.d !== d);
    mine.push({ d, lo, hi }); mine.sort((a, b) => a.d < b.d ? -1 : 1);
    RAW[id] = { ...(RAW[id] || {}), [ME]: mine }; aggregate(id);
    persist("s:" + id);
    return;
  }
  const list = (S.prices[id] || []).filter(o => o.d !== d);
  list.push({ d, lo, hi }); list.sort((a, b) => a.d < b.d ? -1 : 1);
  S.prices[id] = list;
  persist("p:" + id);
}
function delObs(id, d) {
  if (SH && ME) {
    const mine = ((RAW[id] || {})[ME] || []).filter(o => o.d !== d);
    RAW[id] = { ...(RAW[id] || {}), [ME]: mine }; aggregate(id);
    persist("s:" + id);
    return;
  }
  S.prices[id] = (S.prices[id] || []).filter(o => o.d !== d); if (!S.prices[id].length) delete S.prices[id]; persist("p:" + id);
}

// Coût de fabrication en fourchette, à une date donnée.
// Pour chaque ingrédient on retient la voie la moins chère : l'acheter à l'HDV ou le fabriquer.
function coster(at) {
  const memo = new Map();
  function best(id, depth, stack) {
    if (memo.has(id)) return memo.get(id);
    const p = priceAt(id, at);
    const buy = p ? { lo: p.lo, hi: p.hi, missing: 0, route: "buy" } : null;
    let craft = null;
    if (recipe(id) && depth < 6 && !stack.has(id)) { stack.add(id); craft = craftOf(id, depth, stack); stack.delete(id); }
    let res;
    if (buy && craft && !craft.missing) res = (craft.lo + craft.hi) < (buy.lo + buy.hi) ? { ...craft, route: "craft" } : buy;
    else res = buy || (craft ? { ...craft, route: "craft" } : { lo: 0, hi: 0, missing: 1, route: "none" });
    memo.set(id, res);
    return res;
  }
  function craftOf(id, depth = 0, stack = new Set([id])) {
    let lo = 0, hi = 0, missing = 0;
    for (const [ing, q] of recipe(id)[1]) { const c = best(ing, depth + 1, stack); lo += q * c.lo; hi += q * c.hi; missing += c.missing; }
    return { lo, hi, missing };
  }
  return { best: id => best(id, 1, new Set()), craft: id => craftOf(id) };
}
function verdict(craft, hdv) {
  const tax = (S.settings.tax || 0) / 100;
  if (!hdv) return { c: "none", t: "Pas de prix HDV" };
  if (!craft || craft.missing) return { c: "none", t: "Prix manquants" };
  const nlo = hdv.lo * (1 - tax), nhi = hdv.hi * (1 - tax);
  if (nlo > craft.hi) return { c: "good", t: "Crafter et vendre", sub: "rentable même dans le pire cas" };
  if ((nlo + nhi) > (craft.lo + craft.hi)) return { c: "ok", t: "Crafter et vendre", sub: "rentable en moyenne" };
  if (hdv.hi < craft.lo) return { c: "bad", t: "Acheter à l'HDV", sub: "toujours moins cher que le craft" };
  return { c: "bad", t: "Plutôt acheter", sub: "craft plus cher en moyenne" };
}
const netMargin = (craft, hdv) => (!hdv || !craft || craft.missing) ? null : midOf(hdv) * (1 - (S.settings.tax || 0) / 100) - (craft.lo + craft.hi) / 2;
const verdictEl = v => h("span", { class: "verdict " + v.c, title: v.sub || "", text: v.t });

// Liste de courses du plan (consomme le stock, suit les choix "je fabrique")
function computePlan() { return computeNeeds(S.targets); }
function computeNeeds(targets) {
  const left = { ...S.stock }, buy = {}, used = {}, crafted = {};
  const need = (id, qty, d) => {
    const have = Math.min(left[id] || 0, qty);
    if (have > 0) { left[id] -= have; used[id] = (used[id] || 0) + have; }
    const rem = qty - have;
    if (rem <= 0) return;
    const r = recipe(id);
    if (S.expand[id] && r && d < 8) { crafted[id] = (crafted[id] || 0) + rem; for (const [ing, q] of r[1]) need(ing, q * rem, d + 1); }
    else buy[id] = (buy[id] || 0) + rem;
  };
  for (const t of targets) { const r = recipe(t.id); if (r) for (const [ing, q] of r[1]) need(ing, q * t.qty, 1); else if (t.raw) need(t.id, t.qty, 1); }
  const basis = S.settings.basis;
  const ids = [...new Set([...Object.keys(used), ...Object.keys(buy)])].map(Number);
  const rows = ids.map(id => {
    const o = priceAt(id), p = pick(o, basis);
    return { id, used: used[id] || 0, buy: buy[id] || 0, crafted: crafted[id] || 0, total: (used[id] || 0) + (buy[id] || 0), o, p, farm: !!S.farm[id], cost: p == null ? null : p * (buy[id] || 0) };
  }).sort((a, b) => (b.buy > 0) - (a.buy > 0) || item(a.id)[0].localeCompare(item(b.id)[0], "fr"));
  return { rows, crafted };
}
// Coût unitaire en fourchette selon les choix du plan (sans le stock)
function planUnitCost(id, d = 0, seen = new Set()) {
  const r = recipe(id);
  if (d > 0 && !(S.expand[id] && r)) { const o = priceAt(id); return o ? { lo: o.lo, hi: o.hi, missing: 0 } : { lo: 0, hi: 0, missing: 1 }; }
  if (!r || seen.has(id) || d > 8) return { lo: 0, hi: 0, missing: 1 };
  seen.add(id);
  let lo = 0, hi = 0, missing = 0;
  for (const [ing, q] of r[1]) { const u = planUnitCost(ing, d + 1, seen); lo += q * u.lo; hi += q * u.hi; missing += u.missing; }
  seen.delete(id);
  return { lo, hi, missing };
}

// =====================================================================
// Recherche
// =====================================================================
function buildIndex() {
  INDEX = Object.entries(D.items).map(([id, it]) => ({ id: +id, key: norm(it[0]), craft: !!D.recipes[id], lvl: it[1], type: it[2] }));
  USED_IN = {}; SET_ITEMS = {};
  for (const [id, r] of Object.entries(D.recipes)) for (const [ing] of r[1]) (USED_IN[ing] = USED_IN[ing] || []).push(+id);
  for (const [id, it] of Object.entries(D.items)) if (it[4] > 0) (SET_ITEMS[it[4]] = SET_ITEMS[it[4]] || []).push(+id);
}
function find(q, opts = {}) {
  const n = norm(q || ""); const words = n ? n.split(" ") : [];
  if (!words.length && !opts.type && !opts.all) return [];
  const out = [];
  for (const e of INDEX) {
    if (opts.craftOnly && !e.craft) continue;
    if (opts.type && e.type !== opts.type) continue;
    if (opts.min != null && e.lvl < opts.min) continue;
    if (opts.max != null && e.lvl > opts.max) continue;
    if (words.every(w => e.key.includes(w))) out.push({ ...e, score: e.key === n ? 0 : e.key.startsWith(n) ? 1 : 2 });
  }
  return out.sort((a, b) => a.score - b.score || b.lvl - a.lvl || a.key.localeCompare(b.key)).slice(0, opts.limit || 40);
}
function searchBox(placeholder, opts, onPick, id) {
  const input = h("input", { id, type: "search", placeholder, autocomplete: "off", "aria-label": placeholder });
  const box = h("div", { class: "results", hidden: true, role: "listbox" });
  let res = [], on = -1;
  const draw = () => {
    box.replaceChildren(...res.map((e, i) => {
      const r = recipe(e.id);
      return h("button", { type: "button", class: i === on ? "on" : "", onmousedown: ev => { ev.preventDefault(); choose(e.id); } },
        icon(e.id, 28), h("span", {}, h("span", { class: "nm", text: item(e.id)[0] }),
          h("span", { class: "meta", text: [typeName(e.id), "niv. " + item(e.id)[1], r ? jobName(r[0]) : null].filter(Boolean).join(" · ") })));
    }));
    box.hidden = !res.length;
  };
  const choose = id => { onPick(id); input.value = ""; res = []; draw(); input.focus(); };
  input.addEventListener("input", () => { res = find(input.value, opts); on = res.length ? 0 : -1; draw(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { on = Math.min(on + 1, res.length - 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { on = Math.max(on - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && res[on]) { choose(res[on].id); e.preventDefault(); }
    else if (e.key === "Escape") { res = []; draw(); }
  });
  input.addEventListener("blur", () => setTimeout(() => { box.hidden = true; }, 150));
  input.addEventListener("focus", () => { if (res.length) box.hidden = false; });
  return h("div", { class: "search" }, input, box);
}

// =====================================================================
// Petits composants
// =====================================================================
function numInput(value, onCommit, o = {}) {
  const el = h("input", { class: "cell" + (o.sm ? " sm" : "") + (o.missing ? " missing" : ""), inputmode: "decimal", value: value ?? "", placeholder: o.ph || "—", "aria-label": o.label || "", id: o.id });
  el.addEventListener("change", () => { onCommit(el.value); if (!o.noRender) render(); });
  el.addEventListener("keydown", e => { if (e.key === "Enter") el.blur(); });
  return el;
}
function qtyCtrl(v, set) {
  const inp = h("input", { inputmode: "numeric", value: v, "aria-label": "Quantité" });
  inp.addEventListener("change", () => set(Math.max(1, Math.floor(+inp.value || 1))));
  return h("span", { class: "qty" },
    h("button", { type: "button", "aria-label": "Moins", onclick: () => set(Math.max(1, v - 1)) }, "−"), inp,
    h("button", { type: "button", "aria-label": "Plus", onclick: () => set(v + 1) }, "+"));
}
function setStock(id, v) { v = Math.max(0, Math.floor(+v || 0)); if (v) S.stock[id] = v; else delete S.stock[id]; persist("inventaire"); }
function ago(d) {
  if (!d) return "";
  const n = Math.round((parseD(today()) - parseD(d)) / 86400000);
  return n <= 0 ? "aujourd'hui" : n === 1 ? "hier" : "il y a " + n + " j";
}
const ageDays = d => Math.round((parseD(today()) - parseD(d)) / 86400000);
// Saisie rapide d'un relevé : basse + haute
function quickObs(id, after) {
  const lo = h("input", { class: "cell sm", inputmode: "decimal", placeholder: "basse", "aria-label": "Moyenne basse" });
  const hi = h("input", { class: "cell sm", inputmode: "decimal", placeholder: "haute", "aria-label": "Moyenne haute" });
  const go = () => { const a = parseKamas(lo.value), b = parseKamas(hi.value); if (a == null && b == null) { lo.focus(); return; } if (addObs(id, a, b) === false) return; toast("Relevé enregistré pour " + item(id)[0]); after ? after() : render(); };
  [lo, hi].forEach(x => x.addEventListener("keydown", e => { if (e.key === "Enter") go(); }));
  return h("span", { class: "row", style: "gap:6px" }, lo, hi, h("button", { type: "button", class: "btn sm", onclick: go }, "Ajouter"));
}
let toastT = null;
function toast(msg, undo, label = "Annuler") {
  document.querySelector(".toast")?.remove();
  const el = h("div", { class: "toast", role: "status" }, h("span", { text: msg }),
    undo ? h("button", { type: "button", onclick: () => { undo(); el.remove(); } }, label) : null);
  document.body.append(el);
  clearTimeout(toastT); toastT = setTimeout(() => el.remove(), undo ? 7000 : 2600);
}

// Sparkline : moyenne de la fourchette par semaine sur 12 semaines
function sparkline(id) {
  const b = buckets("week", 12).map(p => { const o = obsOf(id).filter(x => x.d >= p.s && x.d <= p.e); return o.length ? o.reduce((t, x) => t + midOf(x), 0) / o.length : null; });
  const vals = b.filter(v => v != null);
  const W = 96, H = 26;
  const svg = s("svg", { class: "spark", width: W, height: H, viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
  if (vals.length < 1) return svg;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const x = i => 3 + i * (W - 6) / 11, y = v => H - 4 - (v - mn) / sp * (H - 8);
  let d = "", last = null;
  b.forEach((v, i) => { if (v == null) return; d += (d && last === i - 1 ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); last = i; });
  svg.append(s("path", { d }));
  const li = b.map((v, i) => v == null ? -1 : i).filter(i => i >= 0).pop();
  svg.append(s("circle", { cx: x(li), cy: y(b[li]), r: 2.5 }));
  return svg;
}

// =====================================================================
// Graphique d'évolution (semaine / mois)
// =====================================================================
function buckets(mode, n) {
  const out = [], now = new Date();
  if (mode === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
    for (let i = n - 1; i >= 0; i--) {
      const a = new Date(start); a.setDate(start.getDate() - 7 * i);
      const b = new Date(a); b.setDate(a.getDate() + 6);
      out.push({ s: iso(a), e: iso(b), label: a.getDate() + " " + MOIS[a.getMonth()], long: "Semaine du " + a.getDate() + " " + MOIS[a.getMonth()] });
    }
  } else {
    for (let i = n - 1; i >= 0; i--) {
      const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      out.push({ s: iso(a), e: iso(b), label: MOIS[a.getMonth()] + (a.getMonth() === 0 || i === n - 1 ? " " + String(a.getFullYear()).slice(2) : ""), long: MOIS[a.getMonth()] + " " + a.getFullYear() });
    }
  }
  return out;
}
function chartData(id, mode) {
  const bs = buckets(mode, 12), r = recipe(id);
  return bs.map(p => {
    const o = obsOf(id).filter(x => x.d >= p.s && x.d <= p.e);
    const row = { ...p, n: o.length, lo: null, hi: null, c: null };
    if (o.length) { row.lo = o.reduce((t, x) => t + x.lo, 0) / o.length; row.hi = o.reduce((t, x) => t + x.hi, 0) / o.length; }
    if (r) { const c = coster(p.e).craft(id); if (!c.missing) row.c = (c.lo + c.hi) / 2; }
    return row;
  });
}
function niceMax(v) { if (v <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
function chart(id, mode) {
  const data = chartData(id, mode);
  const hasHdv = data.some(d => d.lo != null), hasC = data.some(d => d.c != null);
  const box = h("div", { class: "chart" });
  if (!hasHdv && !hasC) {
    box.append(h("div", { class: "empty" }, h("strong", { text: "Pas encore de courbe" }), h("span", { text: "Ajoute un relevé de prix ci-dessus. Chaque relevé alimente la courbe de la " + (mode === "week" ? "semaine" : "du mois") + " correspondante." })));
    return box;
  }
  const W = 640, H = 230, L = 52, R = 12, T = 12, B = 28;
  const max = niceMax(Math.max(...data.flatMap(d => [d.hi, d.c]).filter(v => v != null)) * 1.08);
  const x = i => L + (i + .5) * (W - L - R) / data.length;
  const y = v => T + (1 - v / max) * (H - T - B);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Évolution du prix de " + item(id)[0] });
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4;
    svg.append(s("line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }), s("text", { class: "axis", x: L - 6, y: y(v) + 4, "text-anchor": "end" }, kk(v)));
  }
  data.forEach((d, i) => { if ((data.length - 1 - i) % 2 === 0) svg.append(s("text", { class: "axis", x: x(i), y: H - 8, "text-anchor": "middle" }, d.label)); });
  // Segments continus (une période sans relevé coupe la courbe)
  const segs = key => { const out = []; let cur = []; data.forEach((d, i) => { if (d[key] != null) cur.push(i); else if (cur.length) { out.push(cur); cur = []; } }); if (cur.length) out.push(cur); return out; };
  for (const seg of segs("lo")) {
    const top = seg.map(i => `${x(i)},${y(data[i].hi)}`), bot = seg.slice().reverse().map(i => `${x(i)},${y(data[i].lo)}`);
    if (seg.length > 1) svg.append(s("polygon", { class: "band", points: top.concat(bot).join(" ") }));
    else svg.append(s("rect", { class: "band", x: x(seg[0]) - 5, width: 10, y: y(data[seg[0]].hi), height: Math.max(2, y(data[seg[0]].lo) - y(data[seg[0]].hi)), rx: 3 }));
    svg.append(s("path", { class: "l-hdv", d: seg.map((i, j) => (j ? "L" : "M") + x(i) + " " + y((data[i].lo + data[i].hi) / 2)).join("") }));
  }
  for (const seg of segs("c")) svg.append(s("path", { class: "l-craft", d: seg.map((i, j) => (j ? "L" : "M") + x(i) + " " + y(data[i].c)).join("") }));
  data.forEach((d, i) => {
    if (d.c != null) svg.append(s("circle", { class: "m-craft", cx: x(i), cy: y(d.c), r: 4 }));
    if (d.lo != null) svg.append(s("circle", { class: "m-hdv", cx: x(i), cy: y((d.lo + d.hi) / 2), r: 4.5 }));
  });
  // Survol : réticule + infobulle
  const cross = s("line", { class: "cross", y1: T, y2: H - B, visibility: "hidden" });
  svg.append(cross);
  const tip = h("div", { class: "tip", hidden: true });
  data.forEach((d, i) => {
    const hit = s("rect", { x: x(i) - (W - L - R) / data.length / 2, y: 0, width: (W - L - R) / data.length, height: H, fill: "transparent" });
    const show = () => {
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      tip.replaceChildren(h("strong", { text: d.long }),
        h("span", {}, h("i", { class: "k", style: "background:var(--s-hdv)" }), "HDV : " + (d.lo == null ? "aucun relevé" : range(d.lo, d.hi) + " ₭" + (d.n > 1 ? " (" + d.n + " relevés)" : ""))),
        recipe(id) ? h("span", {}, h("i", { class: "k", style: "background:var(--s-craft)" }), "Coût du craft : " + (d.c == null ? "prix manquants" : k(d.c) + " ₭")) : null);
      tip.hidden = false;
      const pct = x(i) / W * 100;
      tip.style.left = pct > 60 ? "auto" : `calc(${pct}% + 12px)`;
      tip.style.right = pct > 60 ? `calc(${100 - pct}% + 12px)` : "auto";
    };
    hit.addEventListener("mouseenter", show); hit.addEventListener("click", show);
    svg.append(hit);
  });
  svg.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  box.append(svg, tip);
  // Vue tableau (accessibilité)
  const tbl = h("details", {}, h("summary", { class: "note", text: "Voir les valeurs en tableau" }),
    h("div", { class: "tablewrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: mode === "week" ? "Semaine" : "Mois" }), h("th", { class: "n", text: "HDV basse" }), h("th", { class: "n", text: "HDV haute" }), recipe(id) ? h("th", { class: "n", text: "Coût craft" }) : null)),
      h("tbody", {}, data.map(d => h("tr", {}, h("td", { text: d.long }), h("td", { class: "n", text: k(d.lo) }), h("td", { class: "n", text: k(d.hi) }), recipe(id) ? h("td", { class: "n", text: k(d.c) }) : null))))));
  return h("div", { style: "display:grid;gap:8px" },
    h("div", { class: "legend" }, h("span", { class: "lh", text: "Prix HDV (fourchette basse – haute, ligne = milieu)" }), recipe(id) ? h("span", { class: "lc", text: "Coût du craft (milieu)" }) : null),
    box, tbl);
}

// =====================================================================
// Fiche objet (panneau latéral)
// =====================================================================
const sheet = document.getElementById("sheet"), sheetIn = document.getElementById("sheet-in");
let sheetStack = [], chartMode = "week", obsEditDate = null;
try { chartMode = localStorage.getItem(LS + "-chart") || "week"; } catch {}
async function loadChunk(n) {
  if (!DET[n]) { try { DET[n] = await (await fetch(PATH.det(n))).json(); } catch { DET[n] = {}; } }
  return DET[n];
}
async function loadDet(id) { return (await loadChunk(id % 32))[id] || {}; }
function openSheet(id, push = true) {
  obsEditDate = null;
  if (push && sheet.open && sheetStack[sheetStack.length - 1] !== id) sheetStack.push(id);
  else if (!sheet.open) sheetStack = [id];
  renderSheet();
  if (!sheet.open) sheet.showModal();
  sheetIn.scrollTop = 0; sheet.scrollTop = 0;
}
sheet.addEventListener("close", () => { sheetStack = []; render(); });
sheet.addEventListener("click", e => { if (e.target === sheet) sheet.close(); });
async function renderSheet() {
  const id = sheetStack[sheetStack.length - 1]; if (id == null) return;
  const it = item(id), r = recipe(id);
  const head = h("div", { class: "sheet-head" }, icon(id, 64, "big"),
    h("div", { style: "display:grid;gap:6px;min-width:0" },
      h("h2", { text: it[0] }),
      h("div", { class: "chips" }, h("span", { class: "chip", text: typeName(id) }), h("span", { class: "chip", text: "Niveau " + it[1] }),
        r ? h("span", { class: "chip job", text: jobName(r[0]) }) : null, it[4] > 0 && D.sets[it[4]] ? h("span", { class: "chip", text: "Panoplie : " + D.sets[it[4]] }) : null)),
    h("div", { class: "row", style: "gap:4px" },
      sheetStack.length > 1 ? h("button", { type: "button", class: "btn sm", onclick: () => { sheetStack.pop(); renderSheet(); } }, "← Retour") : null,
      h("button", { type: "button", class: "x", "aria-label": "Fermer", onclick: () => sheet.close() }, "×")));

  const actions = h("div", { class: "row" },
    r ? h("button", { type: "button", class: "btn primary", onclick: () => { addTarget(id); toast(it[0] + " ajouté au plan"); } }, "Ajouter au plan de craft") : null,
    h("button", { type: "button", class: "btn", onclick: () => { JF = { ...JF, kind: "vente", item: id }; sheet.close(); location.hash = "#journal"; } }, "J'ai vendu"),
    h("button", { type: "button", class: "btn", onclick: () => { AF = { kind: "buy", item: id, price: "" }; sheet.close(); location.hash = "#alertes"; } }, "🔔 Alerte"),
    h("button", { type: "button", class: "btn", onclick: () => { JF = { ...JF, kind: "achat", item: id }; sheet.close(); location.hash = "#journal"; } }, "J'ai acheté"),
    h("label", { class: "row", style: "gap:6px" }, h("span", { class: "label", text: "En stock" }), numInput(S.stock[id] || "", v => setStock(id, v), { ph: "0", label: "Quantité en stock", noRender: true, sm: true })));

  // Prix
  const last = priceAt(id), o = obsOf(id);
  const dateIn = h("input", { type: "date", value: obsEditDate || today(), max: today(), "aria-label": "Date du relevé" });
  const loIn = h("input", { class: "cell", inputmode: "decimal", placeholder: "ex. 1 200", id: "obs-lo" });
  const hiIn = h("input", { class: "cell", inputmode: "decimal", placeholder: "ex. 1 500", id: "obs-hi" });
  const saveBtn = h("button", { type: "button", class: "btn primary" });
  const mineNote = h("p", { class: "small", style: "color:var(--kamas);font-weight:700" });
  // Pré-remplit avec ton relevé de la date choisie : le modifier remplace l'ancien
  const fill = () => {
    const m = myObs(id, dateIn.value || today());
    loIn.value = m ? fmt.format(m.lo) : ""; hiIn.value = m ? fmt.format(m.hi) : "";
    saveBtn.textContent = m ? "Modifier mon relevé" : "Enregistrer le relevé";
    mineNote.textContent = m ? "Ton relevé du " + parseD(m.d).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " : " + range(m.lo, m.hi) + " ₭. Modifie les valeurs puis enregistre." : "";
  };
  dateIn.addEventListener("change", fill);
  fill();
  const save = () => {
    const a = parseKamas(loIn.value), b = parseKamas(hiIn.value);
    if ((loIn.value.trim() && a == null) || (hiIn.value.trim() && b == null)) { toast("Prix illisible : écris par exemple 1200, 1 200, 12k ou 1,5m"); return; }
    if (a == null && b == null) { loIn.focus(); return; }
    const was = myObs(id, dateIn.value || today());
    if (addObs(id, a, b, dateIn.value || today()) === false) return;
    toast(was ? "Relevé modifié" : "Relevé enregistré"); obsEditDate = null; renderSheet();
  };
  saveBtn.addEventListener("click", save);
  [loIn, hiIn].forEach(x => x.addEventListener("keydown", e => { if (e.key === "Enter") save(); }));
  const seg = h("span", { class: "seg", role: "group", "aria-label": "Période" }, ["week", "month"].map(m =>
    h("button", { type: "button", "aria-pressed": chartMode === m ? "true" : "false", onclick: () => { chartMode = m; try { localStorage.setItem(LS + "-chart", m); } catch {} renderSheet(); } }, m === "week" ? "Par semaine" : "Par mois")));
  const prices = h("section", { class: "panel" },
    h("div", { class: "row between" }, h("h3", { text: "Prix à l'HDV" }), last ? h("span", { class: "chip kamas", text: range(last.lo, last.hi) + " ₭ · " + ago(last.d) + (last.n > 1 ? " · moyenne de " + last.n : "") }) : h("span", { class: "chip", text: "aucun relevé" })),
    h("div", { class: "form-row" },
      h("label", {}, "Moyenne basse", loIn), h("label", {}, "Moyenne haute", hiIn), h("label", {}, "Date", dateIn), saveBtn),
    mineNote,
    h("p", { class: "note", text: "Prix à l'unité, en kamas : 1200, 1 200, 1.200, 12k ou 1,5m. Un relevé par jour et par personne, modifiable à tout moment (choisis sa date ou clique sur « Modifier » dans l'historique)." + (SH ? " Partagé avec tout le groupe ; si plusieurs membres relèvent le même jour, l'atelier prend la moyenne." : "") }),
    h("div", { class: "row between" }, h("span", { class: "label", text: "Évolution sur 12 " + (chartMode === "week" ? "semaines" : "mois") }), seg),
    chart(id, chartMode),
    o.length ? h("details", {}, h("summary", { class: "note", text: o.length + " relevé" + (o.length > 1 ? "s" : "") + " enregistré" + (o.length > 1 ? "s" : "") }),
      h("div", { class: "tablewrap" }, h("table", {}, h("tbody", {}, o.slice().reverse().slice(0, 60).map(x => h("tr", {},
        h("td", { text: parseD(x.d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) }),
        h("td", { class: "n", text: range(x.lo, x.hi) + " ₭" }),
        h("td", { class: "small muted", text: SH && x.by ? (x.n > 1 ? "moyenne de " + x.n + " : " : "par ") + x.by.map(whoName).join(", ") : "" }),
        h("td", {}, myObs(id, x.d) ? h("span", { class: "row", style: "gap:4px;flex-wrap:nowrap" },
          h("button", { type: "button", class: "btn sm", title: "Modifier mon relevé de ce jour", onclick: () => { obsEditDate = x.d; renderSheet(); setTimeout(() => { const el = document.getElementById("obs-lo"); el?.scrollIntoView({ block: "center" }); el?.select(); }, 40); } }, "Modifier"),
          h("button", { type: "button", class: "x", "aria-label": "Supprimer mon relevé", title: "Supprimer mon relevé de ce jour", onclick: () => { delObs(id, x.d); renderSheet(); } }, "×")) : null))))))) : null);

  // Rentabilité du craft
  let craftSec = null;
  if (r) {
    const C = coster(), c = C.craft(id), v = verdict(c, last), m = netMargin(c, last);
    craftSec = h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h3", { text: "Crafter ou acheter ?" }), verdictEl(v)),
      h("div", { class: "econ" },
        h("div", {}, h("span", { class: "label", text: "Coût du craft" }), h("span", { class: "v", text: c.missing ? "incomplet" : range(c.lo, c.hi) + " ₭" }), c.missing ? h("span", { class: "chip warn", text: c.missing + " prix manquant" + (c.missing > 1 ? "s" : "") }) : null),
        h("div", {}, h("span", { class: "label", text: "Prix HDV" }), h("span", { class: "v", text: last ? range(last.lo, last.hi) + " ₭" : "—" })),
        h("div", {}, h("span", { class: "label", text: "Marge nette / unité" }), h("span", { class: "v " + (m == null ? "muted" : m >= 0 ? "pos" : "neg"), text: m == null ? "—" : (m >= 0 ? "+" : "") + k(m) + " ₭" }), h("span", { class: "note", text: "après " + S.settings.tax + " % de taxe HDV" }))),
      h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Ingrédient" }), h("th", { class: "n", text: "Qté" }), h("th", { class: "n", text: "Prix unit." }), h("th", { text: "Voie" }), h("th", { class: "n", text: "Sous-total" }))),
        h("tbody", {}, r[1].map(([ing, q]) => {
          const b = C.best(ing);
          return h("tr", {},
            h("td", {}, itemLink(ing, null, 24)),
            h("td", { class: "n", text: "×" + q }),
            h("td", { class: "n", text: b.missing ? "?" : range(b.lo, b.hi) }),
            h("td", {}, b.route === "craft" ? h("span", { class: "chip job", text: "à crafter" }) : b.route === "buy" ? h("span", { class: "chip", text: "à acheter" }) : h("span", { class: "chip warn", text: "sans prix" })),
            h("td", { class: "n", text: b.missing ? "?" : range(b.lo * q, b.hi * q) }));
        })))),
      h("p", { class: "note", text: "Pour chaque ingrédient craftable, l'atelier retient la voie la moins chère entre l'acheter et le fabriquer, d'après tes derniers relevés." }));
  }

  sheetIn.style.setProperty("--cat", catVar(id));
  sheetIn.dataset.sec = "sheet";
  sheetIn.style.setProperty("--sec", catVar(id));
  sheetIn.replaceChildren(head, actions, prices, craftSec || "", h("div", { class: "loading", text: "Chargement de la fiche…" }));

  // Encyclopédie (chargée à la demande)
  const det = await loadDet(id);
  if (sheetStack[sheetStack.length - 1] !== id) return;
  const used = (USED_IN[id] || []).slice().sort((a, b) => item(a)[1] - item(b)[1]);
  const almDays = D.almanax.filter(a => a[1] === id);
  const setItems = it[4] > 0 ? (SET_ITEMS[it[4]] || []) : [];
  const enc = h("section", { class: "panel" }, h("h3", { text: "Encyclopédie" }),
    det.d ? h("p", { class: "muted", text: det.d }) : null,
    det.fx ? h("div", {}, h("span", { class: "label", text: "Effets" }), h("ul", { class: "fx" }, det.fx.map(f => h("li", { text: f })))) : null,
    almDays.length ? h("div", {}, h("span", { class: "label", text: "Offrande d'Almanax" }), h("p", { text: almDays.map(a => almDate(a[0]) + " (×" + a[2] + ")").join(", ") })) : null,
    setItems.length ? h("div", { style: "display:grid;gap:6px" }, h("span", { class: "label", text: "Panoplie " + (D.sets[it[4]] || "") }), h("div", { class: "chips" }, setItems.map(x => h("button", { type: "button", class: "chip", onclick: () => openSheet(x) }, item(x)[0])))) : null,
    used.length ? h("div", { style: "display:grid;gap:6px" }, h("span", { class: "label", text: "Utilisé dans " + used.length + " recette" + (used.length > 1 ? "s" : "") }),
      h("div", { class: "chips" }, used.slice(0, 40).map(x => h("button", { type: "button", class: "chip", onclick: () => openSheet(x) }, item(x)[0] + " · " + item(x)[1])), used.length > 40 ? h("span", { class: "chip", text: "+" + (used.length - 40) }) : null)) : null);
  sheetIn.lastElementChild.replaceWith(enc);
  await ensureFarm();
  if (sheetStack[sheetStack.length - 1] !== id || !F) return;
  const src = sourcesEl(id, true);
  if (src) sheetIn.append(h("section", { class: "panel" }, h("h3", { text: "Où l'obtenir" }), src));
}

// =====================================================================
// Actions
// =====================================================================
function addTarget(id) {
  const t = S.targets.find(t => t.id === id);
  if (t) t.qty += 1; else S.targets.push({ id, qty: 1 });
  persist("plan"); render();
}
// "J'ai crafté" : retire les ingrédients du stock et ajoute l'objet fabriqué
function markCrafted(t) {
  const before = { stock: { ...S.stock }, targets: S.targets.map(x => ({ ...x })) };
  const consume = (id, qty, d) => {
    const have = Math.min(S.stock[id] || 0, qty);
    if (have) { S.stock[id] -= have; if (!S.stock[id]) delete S.stock[id]; }
    const rem = qty - have, r = recipe(id);
    if (rem > 0 && S.expand[id] && r && d < 8) for (const [ing, q] of r[1]) consume(ing, q * rem, d + 1);
  };
  for (const [ing, q] of recipe(t.id)[1]) consume(ing, q * t.qty, 1);
  S.stock[t.id] = (S.stock[t.id] || 0) + t.qty;
  S.targets = S.targets.filter(x => x !== t);
  persist("inventaire", "plan"); render();
  toast(t.qty + " × " + item(t.id)[0] + " ajouté au stock, ingrédients retirés", () => { S.stock = before.stock; S.targets = before.targets; persist("inventaire", "plan"); render(); });
}

// =====================================================================
// Almanax
// =====================================================================
const almKey = d => pad(d.getDate()) + "/" + pad(d.getMonth() + 1);
const almDate = key => { const [dd, mm] = key.split("/").map(Number); return dd + " " + MOIS[mm - 1]; };
function almanaxFor(d) { const key = almKey(d); return D.almanax.find(a => a[0] === key); }
function almanaxCard() {
  const now = new Date(), a = almanaxFor(now);
  if (!a) return h("section", { class: "panel" }, h("h2", { text: "Almanax" }), h("p", { class: "muted", text: "Pas d'entrée pour aujourd'hui." }));
  const o = priceAt(a[1]), have = S.stock[a[1]] || 0;
  const days = []; for (let i = 0; i < 7; i++) { const d = new Date(now); d.setDate(now.getDate() + i); const x = almanaxFor(d); if (x) days.push([d, x]); }
  let weekCost = 0, weekMissing = 0;
  for (const [, x] of days) { const p = priceAt(x[1]); const need = Math.max(0, x[2] - (S.stock[x[1]] || 0)); if (need) { if (p) weekCost += need * midOf(p); else weekMissing++; } }
  return h("section", { class: "panel alm-card" },
    h("div", { class: "row between" }, h("h2", { text: "Almanax du " + now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) })),
    h("div", { class: "alm" }, h("span", { class: "halo" }, icon(a[1], 72, "big")),
      h("div", { style: "display:grid;gap:6px;min-width:0" },
        h("button", { type: "button", class: "link", onclick: () => openSheet(a[1]) }, h("h3", {}, h("span", { class: "nm", text: a[2] + " × " + item(a[1])[0] }))),
        h("div", { class: "chips" },
          h("span", { class: "chip " + (have >= a[2] ? "job" : "warn"), text: have >= a[2] ? "En stock (" + have + ")" : "En stock : " + have + " / " + a[2] }),
          h("span", { class: "chip kamas", text: o ? "≈ " + k(midOf(o) * a[2]) + " ₭ à l'HDV" : "prix inconnu" })),
        h("p", {}, h("strong", { text: a[3] + ". " }), h("span", { class: "muted", text: a[4] })))),
    h("div", { class: "row between" }, h("span", { class: "label", text: "Les 7 prochains jours" }),
      h("span", { class: "chip kamas", text: "À acheter : ≈ " + k(weekCost) + " ₭" + (weekMissing ? " (+ " + weekMissing + " sans prix)" : "") })),
    h("div", { class: "almlist" }, days.map(([d, x], i) => {
      const st = S.stock[x[1]] || 0, p = priceAt(x[1]);
      return h("div", { class: "r" + (i === 0 ? " today" : "") },
        h("span", { class: "day", text: JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()] }),
        itemLink(x[1], "×" + x[2] + (x[3] ? " · " + x[3] : ""), 26),
        h("span", { class: "num small " + (st >= x[2] ? "pos" : ""), text: st >= x[2] ? "✓ en stock" : p ? "≈ " + kk(midOf(p) * (x[2] - st)) : "?" }));
    })));
}

// =====================================================================
// Vues
// =====================================================================
let view = "accueil";
function profitRows() {
  const C = coster();
  const out = [];
  for (const id of Object.keys(D.recipes).map(Number)) {
    const hdv = priceAt(id), c = C.craft(id);
    if (!hdv && c.missing) continue;
    out.push({ id, hdv, c, v: verdict(c, hdv), m: netMargin(c, hdv) });
  }
  return out;
}

function viewAccueil() {
  const rows = profitRows().filter(r => r.m != null);
  const best = rows.filter(r => r.m > 0).sort((a, b) => b.m - a.m).slice(0, 6);
  const stale = Object.keys(prices()).map(Number).map(id => ({ id, o: priceAt(id) })).filter(x => x.o && ageDays(x.o.d) >= 7).sort((a, b) => a.o.d < b.o.d ? -1 : 1);
  const stockVal = Object.entries(S.stock).reduce((t, [id, q]) => { const o = priceAt(id); return t + (o ? midOf(o) * q : 0); }, 0);
  const recent = [];
  if (SH) for (const [id, by] of Object.entries(RAW)) for (const [u, list] of Object.entries(by)) for (const o of (Array.isArray(list) ? list : [])) recent.push({ id: +id, u, o });
  recent.sort((a, b) => a.o.d < b.o.d ? 1 : a.o.d > b.o.d ? -1 : 0);
  const fired = triggeredAlerts();
  return h("div", { class: "stack" },
    fired.length ? h("section", { class: "panel alert-panel" },
      h("div", { class: "row between" }, h("h2", { text: "🔔 " + fired.length + " alerte" + (fired.length > 1 ? "s" : "") + " déclenchée" + (fired.length > 1 ? "s" : "") }), h("a", { href: "#alertes", class: "small", text: "Toutes les alertes" })),
      h("div", { style: "display:grid;gap:6px" }, fired.slice(0, 5).map(({ a, st }) => h("div", { class: "row between" }, itemLink(a.item, alertText(a, st), 28), h("span", { class: "verdict good", text: ALERT_KIND[a.kind][0] }))))) : null,
    h("div", { class: "tiles" },
      h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Valeur du stock" }), h("span", { class: "v", text: kk(stockVal) }), h("span", { class: "small muted", text: Object.keys(S.stock).length + " objets, au prix moyen" })),
      h("div", { class: "tile" }, h("span", { class: "label", text: "Prix suivis" }), h("span", { class: "v", text: Object.keys(prices()).length }), h("span", { class: "small muted", text: Object.values(prices()).reduce((t, o) => t + o.reduce((u, x) => u + (x.n || 1), 0), 0) + " relevés" + (SH ? " du groupe" : "") })),
      h("div", { class: "tile" }, h("span", { class: "label", text: "Crafts rentables" }), h("span", { class: "v", text: rows.filter(r => r.m > 0).length }), h("span", { class: "small muted", text: "sur " + rows.length + " chiffrés" })),
      h("div", { class: "tile" }, h("span", { class: "label", text: "À revérifier" }), h("span", { class: "v", text: stale.length }), h("span", { class: "small muted", text: "relevés de plus de 7 jours" }))),
    h("div", { class: "grid2b" },
      almanaxCard(),
      h("div", { class: "stack" },
        h("section", { class: "panel" },
          h("div", { class: "row between" }, h("h2", { text: "Meilleurs crafts à revendre" }), h("a", { href: "#rentabilite", class: "small", text: "Tout voir" })),
          best.length ? h("div", { class: "tablewrap" }, h("table", {}, h("tbody", {}, best.map(r => h("tr", {},
            h("td", {}, itemLink(r.id, jobName(recipe(r.id)[0]) + " · niv. " + item(r.id)[1])),
            h("td", { class: "n pos", text: "+" + kk(r.m) }), h("td", {}, verdictEl(r.v))))))) :
            h("div", { class: "empty" }, h("strong", { text: "Aucun craft chiffré pour l'instant" }), h("span", { text: "Relève le prix HDV d'un objet et de ses ingrédients : sa marge apparaîtra ici. Commence par la fiche d'un objet que tu crafts souvent." }))),
        h("section", { class: "panel" },
          h("div", { class: "row between" }, h("h2", { text: "Prix à revérifier" }), h("a", { href: "#prix", class: "small", text: "Tous les prix" })),
          stale.length ? h("div", { class: "tablewrap" }, h("table", {}, h("tbody", {}, stale.slice(0, 6).map(x => h("tr", {},
            h("td", {}, itemLink(x.id, range(x.o.lo, x.o.hi) + " ₭")), h("td", {}, h("span", { class: "chip warn", text: ago(x.o.d) }))))))) :
            h("p", { class: "muted", text: "Tous tes relevés datent de moins d'une semaine." })),
        SH ? h("section", { class: "panel" },
          h("h2", { text: "Dernières mises à jour du groupe" }),
          recent.length ? h("div", { class: "tablewrap" }, h("table", {}, h("tbody", {}, recent.slice(0, 8).map(r => h("tr", {},
            h("td", {}, itemLink(r.id, range(r.o.lo, r.o.hi) + " ₭")),
            h("td", { class: "small muted", text: "par " + whoName(r.u) }),
            h("td", {}, h("span", { class: "chip", text: ago(r.o.d) }))))))) :
            h("p", { class: "muted", text: "Aucun prix partagé pour l'instant. Le premier relevé que tu saisis sera visible par tout le groupe." })) : null)));
}


function viewPlan() {
  const { rows } = computePlan();
  const basis = S.settings.basis;
  const C = coster();
  const left = h("section", { class: "panel" },
    h("h2", { text: "À fabriquer" }),
    searchBox("Chercher un objet à crafter (ex. Gelano, Coiffe Bouftou)", { craftOnly: true }, addTarget, "q-plan"));
  if (!S.targets.length) {
    left.append(h("div", { class: "empty" },
      h("strong", { text: "Ton plan est vide" }),
      h("span", { text: "Ajoute un objet avec la recherche ci-dessus, ou depuis l'onglet Rentabilité. Exemples pour tester :" }),
      h("div", { class: "chips" }, ["Coiffe du Bouftou", "Gelano", "Amulette du Bouftou", "Potion de Rappel"].map(n => {
        const e = find(n, { craftOnly: true })[0];
        return e ? h("button", { type: "button", class: "chip", onclick: () => addTarget(e.id) }, "+ " + item(e.id)[0]) : null;
      }))));
  }
  for (const t of S.targets) {
    const it = item(t.id), r = recipe(t.id);
    if (!r) continue;
    const uc = planUnitCost(t.id), hdv = priceAt(t.id), v = verdict(uc, hdv), m = netMargin(uc, hdv);
    const set = q => { t.qty = q; persist("plan"); render(); };
    const tree = (id, mult, d) => {
      const rr = recipe(id); if (!rr || d > 6) return null;
      return h("ul", {}, rr[1].map(([ing, q]) => {
        const sub = recipe(ing), exp = !!S.expand[ing];
        let hint = null;
        if (sub && !exp) { const b = C.best(ing); if (b.route === "craft" && priceAt(ing)) hint = h("span", { class: "hint", text: "▲ moins cher à crafter" }); }
        return h("li", {},
          h("span", { class: "q", text: "×" + k(q * mult) }), h("button", { type: "button", class: "link", onclick: () => openSheet(ing) }, h("span", { class: "nm", text: item(ing)[0] })),
          sub ? h("button", { type: "button", class: "toggle", "aria-pressed": exp ? "true" : "false", title: "Fabriquer cet ingrédient au lieu de l'acheter",
            onclick: () => { if (exp) delete S.expand[ing]; else S.expand[ing] = true; persist("plan"); render(); } }, exp ? "je fabrique" : "fabriquer ?") : null,
          hint, exp ? tree(ing, q * mult, d + 1) : null);
      }));
    };
    left.append(h("article", { class: "target" },
      h("div", { class: "head" },
        h("div", { style: "display:grid;gap:4px" }, itemLink(t.id, null, 36),
          h("div", { class: "chips" }, h("span", { class: "chip job", text: jobName(r[0]) + " · niv. " + it[1] }), verdictEl(v))),
        h("button", { type: "button", class: "x", title: "Retirer du plan", "aria-label": "Retirer " + it[0], onclick: () => { S.targets = S.targets.filter(x => x !== t); persist("plan"); render(); } }, "×")),
      h("div", { class: "row between" }, h("span", { class: "row", style: "gap:8px" }, h("span", { class: "label", text: "Quantité" }), qtyCtrl(t.qty, set)),
        h("button", { type: "button", class: "btn sm", title: "Retire les ingrédients du stock et ajoute l'objet fabriqué", onclick: () => markCrafted(t) }, "✓ J'ai crafté")),
      h("div", { class: "econ" },
        h("div", {}, h("span", { class: "label", text: "Coût / unité" }), h("span", { class: "v", text: range(uc.lo, uc.hi) + " ₭" }), uc.missing ? h("span", { class: "chip warn", text: uc.missing + " prix manquant" + (uc.missing > 1 ? "s" : "") }) : null),
        h("div", {}, h("span", { class: "label", text: "Prix HDV" }), hdv ? h("span", { class: "v", text: range(hdv.lo, hdv.hi) + " ₭" }) : quickObs(t.id)),
        h("div", {}, h("span", { class: "label", text: "Marge nette totale" }),
          m == null ? h("span", { class: "v muted", text: "—" }) : h("span", { class: "v " + (m >= 0 ? "pos" : "neg"), text: (m >= 0 ? "+" : "") + k(m * t.qty) + " ₭" }))),
      h("details", { class: "tree", open: S.targets.length <= 2 }, h("summary", { text: "Recette (" + r[1].length + " ingrédients)" }), tree(t.id, t.qty, 0))));
  }

  const toBuy = rows.filter(r => r.buy > 0 && !r.farm), toFarm = rows.filter(r => r.buy > 0 && r.farm);
  const totalNeed = rows.reduce((t, r) => t + r.total, 0), covered = rows.reduce((t, r) => t + r.used, 0);
  const cost = toBuy.reduce((t, r) => t + (r.cost || 0), 0), missing = toBuy.filter(r => r.p == null).length;
  const costLo = toBuy.reduce((t, r) => t + (r.o ? r.o.lo * r.buy : 0), 0), costHi = toBuy.reduce((t, r) => t + (r.o ? r.o.hi * r.buy : 0), 0);
  const pct = totalNeed ? Math.round(100 * covered / totalNeed) : 0;
  const basisSeg = h("span", { class: "seg", role: "group", "aria-label": "Prix utilisé" }, [["lo", "Bas"], ["mid", "Moyen"], ["hi", "Haut"]].map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": basis === v ? "true" : "false", onclick: () => { S.settings.basis = v; persist("plan"); render(); } }, l)));
  const right = h("section", { class: "panel" },
    h("div", { class: "row between" }, h("h2", { text: "Liste de courses" }),
      h("div", { class: "row", style: "gap:8px" }, h("span", { class: "label", text: "Prix" }), basisSeg,
        toBuy.length ? h("button", { type: "button", class: "btn sm", onclick: e => copyText(toBuy.map(r => r.buy + " × " + item(r.id)[0]).join("\n"), e.currentTarget) }, "Copier la liste") : null)),
    h("div", { class: "tiles" },
      h("div", { class: "tile kamas" }, h("span", { class: "label", text: "À dépenser" }), h("span", { class: "v", text: k(cost) + " ₭" }),
        missing ? h("span", { class: "chip warn", text: missing + " sans prix" }) : h("span", { class: "small muted", text: "fourchette " + range(costLo, costHi) })),
      h("div", { class: "tile" }, h("span", { class: "label", text: "Couvert par le stock" }), h("span", { class: "v", text: pct + " %" }), h("div", { class: "bar" }, h("span", { style: "width:" + pct + "%" }))),
      h("div", { class: "tile" }, h("span", { class: "label", text: "À acheter / à farmer" }), h("span", { class: "v", text: toBuy.length + " / " + toFarm.length }), h("a", { href: "#farm", class: "small", text: "Liste de farm" })),
      h("div", { class: "tile" }, h("span", { class: "label", text: "Taxe HDV" }), h("span", { class: "row", style: "gap:4px" }, numInput(S.settings.tax, v => { const n = parseFloat(String(v).replace(",", ".")); S.settings.tax = isNaN(n) ? 0 : Math.min(50, Math.max(0, n)); persist("plan"); }, { sm: true, label: "Taxe HDV en %" }), "%"), h("span", { class: "small muted", text: "retirée du prix de vente" }))));
  if (!rows.length) right.append(h("div", { class: "empty" }, h("strong", { text: "Rien à acheter pour l'instant" }), h("span", { text: "La liste se remplit dès que tu ajoutes un objet au plan." })));
  else right.append(h("div", { class: "tablewrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Ressource" }), h("th", { class: "n", text: "Besoin" }), h("th", { class: "n", text: "Stock" }), h("th", { class: "n", text: "À acheter" }), h("th", { class: "n", text: "Prix HDV" }), h("th", { class: "n", text: "Sous-total" }))),
    h("tbody", {}, rows.map(r => h("tr", { class: r.buy ? "" : "done" },
      h("td", {}, itemLink(r.id, typeName(r.id) + (r.crafted ? " · fabriqué ×" + k(r.crafted) : ""), 26)),
      h("td", { class: "n", text: k(r.total) }),
      h("td", { class: "n" }, numInput(S.stock[r.id] || "", v => setStock(r.id, v), { ph: "0", sm: true, label: "Stock de " + item(r.id)[0] })),
      h("td", { class: "n" }, r.buy ? (r.farm ? h("span", { class: "chip job", text: k(r.buy) + " à farmer" }) : k(r.buy)) : "✓"),
      h("td", { class: "n" }, r.o ? h("button", { type: "button", class: "link", title: "Ouvrir la fiche pour ajouter un relevé", onclick: () => openSheet(r.id) }, range(r.o.lo, r.o.hi)) : r.buy ? quickObs(r.id) : "—"),
      h("td", { class: "n", text: r.buy && !r.farm ? (r.p == null ? "?" : k(r.cost)) : "" })))),
    h("tfoot", {}, h("tr", {}, h("td", { colspan: 5, text: "Total à dépenser (prix " + ({ lo: "bas", mid: "moyen", hi: "haut" })[basis] + ")" }), h("td", { class: "n", text: k(cost) + " ₭" }))))));
  right.append(h("p", { class: "note", text: "Le stock est consommé en priorité. Un ingrédient marqué « je fabrique » est remplacé par sa recette ; « ▲ moins cher à crafter » signale qu'il reviendrait moins cher de le fabriquer d'après tes relevés." }));
  return h("div", { class: "grid2" }, left, right);
}

function copyText(txt, btn) {
  const ok = () => { if (btn) { const o = btn.textContent; btn.textContent = "Copié"; setTimeout(() => btn.textContent = o, 1400); } };
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => toast("Copie refusée par le navigateur"));
}

let rentF = { q: "", job: "", only: "", sort: "m" };
function viewRentabilite() {
  let rows = profitRows();
  const jobs = [...new Set(Object.values(D.recipes).map(r => r[0]))].sort((a, b) => jobName(a).localeCompare(jobName(b), "fr"));
  if (rentF.job) rows = rows.filter(r => recipe(r.id)[0] === +rentF.job);
  if (rentF.q) { const n = norm(rentF.q); rows = rows.filter(r => norm(item(r.id)[0]).includes(n)); }
  if (rentF.only === "craft") rows = rows.filter(r => r.v.c === "good" || r.v.c === "ok");
  if (rentF.only === "buy") rows = rows.filter(r => r.v.c === "bad");
  rows.sort((a, b) => rentF.sort === "lvl" ? item(b.id)[1] - item(a.id)[1] : rentF.sort === "pct"
    ? ((b.m ?? -1e15) / Math.max(1, b.c.lo + b.c.hi)) - ((a.m ?? -1e15) / Math.max(1, a.c.lo + a.c.hi)) : (b.m ?? -1e15) - (a.m ?? -1e15));
  const q = h("input", { type: "search", id: "q-rent", placeholder: "Filtrer par nom", value: rentF.q, "aria-label": "Filtrer par nom" });
  q.addEventListener("input", () => { rentF.q = q.value; clearTimeout(q._t); q._t = setTimeout(render, 200); });
  const sel = (id, val, opts, on) => { const el = h("select", { id, "aria-label": id }, opts.map(([v, l]) => h("option", { value: v, selected: String(v) === String(val) }, l))); el.addEventListener("change", () => on(el.value)); return el; };
  return h("section", { class: "panel" },
    h("div", { class: "row between" }, h("h2", { text: "Crafter ou acheter ?" }), h("span", { class: "chip", text: rows.length + " recettes chiffrées" })),
    h("p", { class: "note", text: "Pour chaque recette dont tu as relevé des prix : coût du craft en fourchette (ingrédients au prix bas puis haut, en prenant pour chacun la voie la moins chère), prix de revente à l'HDV, et marge nette après " + S.settings.tax + " % de taxe." }),
    h("div", { class: "filters" }, h("div", { class: "search" }, q),
      sel("Métier", rentF.job, [["", "Tous les métiers"], ...jobs.map(j => [j, jobName(j)])], v => { rentF.job = v; render(); }),
      sel("Verdict", rentF.only, [["", "Tous les verdicts"], ["craft", "À crafter et vendre"], ["buy", "À acheter"]], v => { rentF.only = v; render(); }),
      sel("Tri", rentF.sort, [["m", "Tri : marge en kamas"], ["pct", "Tri : marge en %"], ["lvl", "Tri : niveau"]], v => { rentF.sort = v; render(); })),
    rows.length ? h("div", { class: "tablewrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Objet" }), h("th", { class: "n", text: "Coût du craft" }), h("th", { class: "n", text: "Prix HDV" }), h("th", { class: "n", text: "Marge nette" }), h("th", { class: "n", text: "%" }), h("th", { text: "Verdict" }), h("th", {}))),
      h("tbody", {}, rows.slice(0, 200).map(r => {
        const pctv = r.m == null ? null : r.m / Math.max(1, (r.c.lo + r.c.hi) / 2) * 100;
        return h("tr", {},
          h("td", {}, itemLink(r.id, jobName(recipe(r.id)[0]) + " · niv. " + item(r.id)[1])),
          h("td", { class: "n" }, r.c.missing ? h("span", { class: "chip warn", text: r.c.missing + " sans prix" }) : range(r.c.lo, r.c.hi)),
          h("td", { class: "n" }, r.hdv ? range(r.hdv.lo, r.hdv.hi) : quickObs(r.id)),
          h("td", { class: "n " + (r.m == null ? "muted" : r.m >= 0 ? "pos" : "neg"), text: r.m == null ? "—" : (r.m >= 0 ? "+" : "") + k(r.m) }),
          h("td", { class: "n " + (pctv == null ? "muted" : pctv >= 0 ? "pos" : "neg"), text: pctv == null ? "—" : Math.round(pctv) + " %" }),
          h("td", {}, verdictEl(r.v)),
          h("td", {}, h("button", { type: "button", class: "btn sm", onclick: () => { addTarget(r.id); toast(item(r.id)[0] + " ajouté au plan"); } }, "+ Plan")));
      })))) :
      h("div", { class: "empty" }, h("strong", { text: "Aucune recette chiffrée" }), h("span", { text: "Une recette apparaît ici dès que tu as relevé le prix HDV de l'objet ou de tous ses ingrédients. Ouvre la fiche d'un objet (onglet Encyclopédie) pour saisir un relevé, ou importe une capture de l'HDV dans l'onglet Prix." })));
}

// ---- Prix HDV + import de capture ----
let importState = null; // {status, rows, error}
let sampleFn = null, canImages = false;
async function initSample() {
  if (!window.claude || !window.claude.use) return; // lecture de captures : seulement dans la version Claude
  try {
    sampleFn = await claude.use("sample");
    if (sampleFn) { const lim = await sampleFn.limits().catch(() => null); canImages = !!(lim && lim.images); }
  } catch { sampleFn = null; }
  if (view === "prix") render();
}
function matchName(name) {
  const n = norm(name);
  const exact = INDEX.filter(e => e.key === n);
  if (exact.length) return { id: exact.sort((a, b) => (b.craft - a.craft))[0].id, cands: exact.map(e => e.id) };
  const cands = find(name, { limit: 6 }).map(e => e.id);
  return { id: cands[0] || null, cands };
}
async function importCapture(file) {
  if (!sampleFn || !canImages) return;
  importState = { status: "busy", rows: [] }; render();
  const prompt = "Voici une capture d'écran de l'hôtel des ventes (HDV) du jeu Dofus 3, en français. "
    + "Relève chaque objet visible avec les prix affichés. Les prix sont en kamas, pour des lots de 1, 10, 100 ou 1000 unités. "
    + "Réponds uniquement avec un tableau JSON de la forme "
    + '[{"nom": "Nom exact tel qu\'affiché", "lots": {"1": 1200, "10": 11000, "100": null, "1000": null}}]. '
    + "Écris les prix comme des nombres entiers sans espace ni séparateur, et null quand un lot n'est pas affiché. "
    + "N'invente rien : si aucun objet n'est lisible, réponds [].";
  try {
    const data = await sampleFn.json(prompt, { images: [file] });
    const list = Array.isArray(data) ? data : [];
    importState = { status: "review", rows: list.map(x => {
      const units = Object.entries(x && x.lots || {}).map(([n, p]) => p == null || isNaN(+p) || !+n ? null : +p / +n).filter(v => v != null && v > 0);
      const m = matchName(String(x && x.nom || ""));
      return { nom: String(x && x.nom || ""), lots: x && x.lots || {}, id: m.id, cands: m.cands, lo: units.length ? Math.round(Math.min(...units)) : null, hi: units.length ? Math.round(Math.max(...units)) : null, on: !!m.id && units.length > 0 };
    }) };
    if (!importState.rows.length) importState = { status: "error", error: "Aucun objet lisible sur cette capture. Essaie une capture plus nette de la liste de l'HDV." };
  } catch (e) {
    const msg = { not_granted: "L'accès à Claude a été refusé pour cette page.", rate_limited: "Trop de demandes pour l'instant. Réessaie dans un moment.", image_rejected: "Cette image n'est pas acceptée. Utilise une capture PNG ou JPG.", invalid_json: "La lecture de la capture n'a rien donné d'exploitable. Réessaie avec une capture plus nette." }[e && e.code] || "La lecture de la capture a échoué. Réessaie.";
    importState = { status: "error", error: msg };
  }
  render();
}
function importPanel() {
  if (!sampleFn || !canImages) return null;
  const fileIn = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", id: "cap-file", hidden: true });
  fileIn.addEventListener("change", () => { if (fileIn.files[0]) importCapture(fileIn.files[0]); });
  const drop = h("div", { class: "drop", id: "drop" },
    h("strong", { text: "Importer une capture de l'HDV" }),
    h("span", { class: "note", text: "Fais une capture de la liste de l'HDV (Win + Maj + S), puis colle-la ici avec Ctrl + V, ou dépose le fichier. Claude lit les noms et les prix par lot ; tu valides avant l'enregistrement." }),
    h("button", { type: "button", class: "btn", onclick: () => fileIn.click() }, "Choisir une image"), fileIn);
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) importCapture(f); });
  const box = h("section", { class: "panel" }, drop);
  if (importState?.status === "busy") box.append(h("p", { class: "muted", text: "Lecture de la capture… (quelques secondes)" }));
  if (importState?.status === "error") box.append(h("p", { class: "neg", text: importState.error }));
  if (importState?.status === "review") {
    const rows = importState.rows;
    box.append(h("div", { class: "tablewrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}), h("th", { text: "Lu sur la capture" }), h("th", { text: "Objet reconnu" }), h("th", { class: "n", text: "Basse / u" }), h("th", { class: "n", text: "Haute / u" }))),
      h("tbody", {}, rows.map((r, i) => {
        const cb = h("input", { type: "checkbox", checked: r.on, "aria-label": "Importer " + r.nom, id: "imp-" + i });
        cb.addEventListener("change", () => { r.on = cb.checked; });
        const sel = h("select", { "aria-label": "Objet correspondant" }, h("option", { value: "" }, "— aucun —"), r.cands.map(c => h("option", { value: c, selected: c === r.id }, item(c)[0] + " (niv. " + item(c)[1] + ")")));
        sel.addEventListener("change", () => { r.id = +sel.value || null; });
        const lots = Object.entries(r.lots).filter(([, p]) => p != null).map(([n, p]) => "×" + n + " : " + k(p)).join(" · ");
        return h("tr", {}, h("td", {}, cb), h("td", {}, h("span", { class: "nm", text: r.nom }), h("small", { class: "muted", style: "display:block", text: lots })), h("td", {}, sel),
          h("td", { class: "n" }, numInput(r.lo, v => { r.lo = parseKamas(v); }, { sm: true, noRender: true, label: "Basse" })),
          h("td", { class: "n" }, numInput(r.hi, v => { r.hi = parseKamas(v); }, { sm: true, noRender: true, label: "Haute" })));
      })))),
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn primary", onclick: () => {
          let n = 0;
          for (const r of importState.rows) if (r.on && r.id && (r.lo != null || r.hi != null)) { addObs(r.id, r.lo, r.hi); n++; }
          importState = null; toast(n + " relevé" + (n > 1 ? "s" : "") + " enregistré" + (n > 1 ? "s" : "")); render();
        } }, "Enregistrer les relevés cochés"),
        h("button", { type: "button", class: "btn", onclick: () => { importState = null; render(); } }, "Annuler")),
      h("p", { class: "note", text: "La fourchette est calculée à partir du prix unitaire de chaque lot : la basse est le lot le moins cher à l'unité, la haute le plus cher. Vérifie les valeurs avant d'enregistrer." }));
  }
  return box;
}
document.addEventListener("paste", e => {
  if (view !== "prix" || !canImages) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/"));
  if (f) { e.preventDefault(); importCapture(f); }
});

function viewPrix() {
  const ids = Object.keys(prices()).map(Number).filter(id => obsOf(id).length);
  const rows = ids.map(id => {
    const o = obsOf(id), last = o[o.length - 1];
    const prev = [...o].reverse().find(x => ageDays(x.d) >= 7 && x.d < last.d);
    const varp = prev ? (midOf(last) - midOf(prev)) / midOf(prev) * 100 : null;
    return { id, last, n: o.length, varp };
  }).sort((a, b) => a.last.d < b.last.d ? -1 : a.last.d > b.last.d ? 1 : 0);
  const toShare = pendingShare();
  const tourN = tourCandidates().ids.length;
  return h("div", { class: "stack" },
    tourN ? h("section", { class: "panel" }, h("div", { class: "row between" },
      h("span", { text: tourN + " prix à relever pour ton plan, tes builds et l'Almanax." }),
      h("a", { href: "#tournee", class: "btn primary", style: "text-decoration:none" }, "Lancer la tournée HDV"))) : null,
    SH && toShare.length ? h("section", { class: "panel" },
      h("div", { class: "row between" }, h("span", { text: "Tu as des relevés personnels sur " + toShare.length + " objet" + (toShare.length > 1 ? "s" : "") + " qui ne sont pas encore dans les prix du groupe." }),
        h("button", { type: "button", class: "btn primary", onclick: shareMine }, "Les partager avec le groupe"))) : null,
    importPanel(),
    h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h2", { text: SH ? "Prix du groupe à l'HDV" : "Prix relevés à l'HDV" }), h("span", { class: "chip", text: ids.length + " objets suivis" })),
      searchBox("Ajouter un relevé pour un objet", {}, id => openSheet(id), "q-prix"),
      rows.length ? h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Objet" }), h("th", { class: "n", text: "Dernière fourchette" }), h("th", { text: "Relevé" }), h("th", { text: "12 semaines" }), h("th", { class: "n", text: "Var. 7 j+" }), h("th", { text: "Nouveau relevé" }))),
        h("tbody", {}, rows.map(r => h("tr", {},
          h("td", {}, itemLink(r.id, r.n + " relevé" + (r.n > 1 ? "s" : ""), 26)),
          h("td", { class: "n", text: range(r.last.lo, r.last.hi) }),
          h("td", {}, h("span", { class: "chip" + (ageDays(r.last.d) >= 7 ? " warn" : ""), text: ago(r.last.d) })),
          h("td", {}, sparkline(r.id)),
          h("td", { class: "n " + (r.varp == null ? "muted" : r.varp >= 0 ? "pos" : "neg"), text: r.varp == null ? "—" : (r.varp >= 0 ? "▲ +" : "▼ ") + Math.round(r.varp) + " %" }),
          h("td", {}, quickObs(r.id))))))) :
        h("div", { class: "empty" }, h("strong", { text: "Aucun prix relevé" }), h("span", { text: "Cherche un objet ci-dessus pour saisir sa moyenne basse et sa moyenne haute à l'HDV. Chaque relevé est daté : c'est ce qui construit les courbes par semaine et par mois." })),
      h("p", { class: "note", text: "Les relevés les plus anciens apparaissent en premier : ce sont ceux à revérifier. La variation compare le dernier relevé à celui d'au moins 7 jours plus tôt." })));
}

function viewStock() {
  const ids = Object.keys(S.stock).map(Number).sort((a, b) => item(a)[0].localeCompare(item(b)[0], "fr"));
  const total = ids.reduce((t, id) => { const o = priceAt(id); return t + (o ? midOf(o) * S.stock[id] : 0); }, 0);
  const unpriced = ids.filter(id => !priceAt(id)).length;
  const p = h("section", { class: "panel" },
    h("div", { class: "row between" }, h("h2", { text: "Inventaire" }),
      h("span", { class: "chips" }, h("span", { class: "chip", text: ids.length + " objets" }), h("span", { class: "chip kamas", text: "Valeur : " + k(total) + " ₭" }), unpriced ? h("span", { class: "chip warn", text: unpriced + " sans prix" }) : null)),
    searchBox("Ajouter un objet ou une ressource à l'inventaire", {}, id => { if (!S.stock[id]) setStock(id, 1); render(); setTimeout(() => document.getElementById("s-" + id)?.select(), 0); }, "q-stock"));
  if (!ids.length) p.append(h("div", { class: "empty" }, h("strong", { text: "Aucun objet en stock" }), h("span", { text: "Ajoute tes ressources avec la recherche, saisis-les dans la liste de courses du plan, ou utilise « J'ai crafté » pour mettre le stock à jour après un craft." })));
  else p.append(h("div", { class: "tablewrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Objet" }), h("th", { class: "n", text: "Quantité" }), h("th", { class: "n", text: "Prix HDV / u" }), h("th", { class: "n", text: "Valeur" }), h("th", {}))),
    h("tbody", {}, ids.map(id => {
      const o = priceAt(id);
      return h("tr", {},
        h("td", {}, itemLink(id, typeName(id) + " · niv. " + item(id)[1], 26)),
        h("td", { class: "n" }, numInput(S.stock[id], v => setStock(id, v), { label: "Quantité", id: "s-" + id, sm: true })),
        h("td", { class: "n" }, o ? range(o.lo, o.hi) : quickObs(id)),
        h("td", { class: "n", text: o ? k(midOf(o) * S.stock[id]) : "?" }),
        h("td", {}, h("button", { type: "button", class: "x", "aria-label": "Retirer", onclick: () => { setStock(id, 0); render(); } }, "×")));
    })))));
  return p;
}

let encF = { q: "", type: "", min: "", max: "", craft: false };
function viewEncyclopedie() {
  const typesSorted = Object.entries(D.types).filter(([, t]) => t[0]).sort((a, b) => a[1][0].localeCompare(b[1][0], "fr"));
  const q = h("input", { type: "search", id: "q-enc", placeholder: "Nom d'un objet, d'une ressource, d'un équipement…", value: encF.q, "aria-label": "Recherche" });
  q.addEventListener("input", () => { encF.q = q.value; clearTimeout(q._t); q._t = setTimeout(render, 200); });
  const type = h("select", { id: "enc-type", "aria-label": "Type" }, h("option", { value: "" }, "Tous les types"), typesSorted.map(([id, t]) => h("option", { value: id, selected: String(id) === encF.type }, t[0])));
  type.addEventListener("change", () => { encF.type = type.value; render(); });
  const lv = (key, ph) => { const el = h("input", { type: "number", id: "enc-" + key, min: 1, max: 200, placeholder: ph, value: encF[key], "aria-label": ph }); el.addEventListener("change", () => { encF[key] = el.value; render(); }); return el; };
  const cb = h("input", { type: "checkbox", id: "enc-craft", checked: encF.craft }); cb.addEventListener("change", () => { encF.craft = cb.checked; render(); });
  const res = find(encF.q, { type: encF.type ? +encF.type : null, min: encF.min ? +encF.min : null, max: encF.max ? +encF.max : null, craftOnly: encF.craft, all: !!(encF.type || encF.craft || encF.min || encF.max), limit: 120 });
  return h("section", { class: "panel" },
    h("div", { class: "row between" }, h("h2", { text: "Encyclopédie" }), h("span", { class: "chip", text: fmt.format(INDEX.length) + " objets · " + fmt.format(Object.keys(D.recipes).length) + " recettes" })),
    h("div", { class: "filters" }, h("div", { class: "search" }, q), type, lv("min", "Niv. min"), lv("max", "Niv. max"), h("label", { class: "check" }, cb, "Craftables")),
    res.length ? h("div", { class: "cards" }, res.map(e => h("button", { type: "button", class: "card", onclick: () => openSheet(e.id) },
      icon(e.id, 40), h("span", { class: "t" }, h("span", { class: "nm", text: item(e.id)[0] }), h("small", { text: typeName(e.id) + " · niv. " + e.lvl }))))) :
      h("div", { class: "empty" }, h("strong", { text: encF.q || encF.type ? "Aucun résultat" : "Cherche dans l'encyclopédie" }),
        h("span", { text: "Tape au moins deux lettres ou choisis un type. Chaque fiche donne les effets, la recette, les recettes qui utilisent l'objet, la panoplie, les jours d'Almanax et ta courbe de prix." }),
        h("div", { class: "chips" }, ["Gelano", "Coiffe du Bouftou", "Bois de Frêne", "Laine de Bouftou"].map(n => { const e = find(n)[0]; return e ? h("button", { type: "button", class: "chip", onclick: () => openSheet(e.id) }, item(e.id)[0]) : null; }))),
    res.length === 120 ? h("p", { class: "note", text: "Seuls les 120 premiers résultats sont affichés : précise ta recherche." }) : null);
}

function viewSauvegarde() { return h("div", { class: "stack" }, accountPanel(), viewBackup()); }
function viewBackup() {
  const ta = h("textarea", { id: "io", spellcheck: "false" });
  ta.value = JSON.stringify({ app: "atelier-dofus3", version: 3, stock: S.stock, prices: prices(), targets: S.targets, expand: S.expand, farm: S.farm, builds: S.builds, alerts: S.alerts, settings: S.settings, journal: TR }, null, 1);
  const msg = h("span", { class: "note" });
  return h("section", { class: "panel" },
    h("h2", { text: "Sauvegarde et import" }),
    h("p", { class: "note", text: "Ce JSON contient ton stock, tous tes relevés de prix datés, ton plan, tes choix de farm, tes builds et tes réglages. Copie-le pour garder une sauvegarde ou l'exploiter dans un autre outil. Pour importer, colle un JSON (version 1, 2 ou 3) puis clique sur Importer : il remplace les données actuelles." }),
    ta,
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn", onclick: () => { if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => msg.textContent = "Copié.", () => { ta.select(); msg.textContent = "Sélectionné : copie avec Ctrl+C."; }); } }, "Copier"),
      h("button", { type: "button", class: "btn primary", onclick: () => {
        try {
          const o = JSON.parse(ta.value); if (!o || typeof o !== "object") throw 0;
          const old = Object.keys(S.prices);
          Object.assign(S, fromAnyBackup(o));
          S.targets = S.targets.filter(t => recipe(t.id));
          if (Array.isArray(o.journal)) { const have = new Set(TR.map(t => t.id)); for (const t of o.journal) if (t && t.id && !have.has(t.id) && t.item_id && t.qty && t.total != null) addTrade({ id: t.id, d: t.d, kind: t.kind === "achat" ? "achat" : "vente", item_id: +t.item_id, qty: +t.qty, total: +t.total, fee: +t.fee || 0, cost: t.cost == null ? null : +t.cost, note: String(t.note || "").slice(0, 200) }); }
          persist("inventaire", "plan", "builds", ...new Set([...old, ...Object.keys(S.prices)].map(id => "p:" + id)));
          msg.textContent = "Importé."; renderCounts();
        } catch { msg.textContent = "Ce texte n'est pas un JSON valide de l'atelier."; }
      } }, "Importer"), msg));
}

// =====================================================================
// Farm : où obtenir chaque ressource (drops, récolte, zones, donjons)
// =====================================================================
let F = null, farmLoading = null;
function ensureFarm() {
  if (F) return Promise.resolve(F);
  if (!farmLoading) farmLoading = fetch(PATH.farm).then(r => r.json()).then(d => { F = d; return d; }).catch(() => null);
  return farmLoading;
}
const subName = sid => { const z = F.subs[sid]; return z ? z[0] : "Zone " + sid; };
const subLabel = sid => { const z = F.subs[sid]; if (!z) return "Zone " + sid; const a = F.areas[z[1]]; return z[0] + (a && a !== z[0] ? " (" + a + ")" : ""); };
const djName = id => (F.dungeons[id] || ["Donjon"])[0];
const pctTxt = (a, b) => { const f = v => v >= 10 ? Math.round(v) : v.toLocaleString("fr-FR", { maximumFractionDigits: 1 }); return a === b ? f(a) + " %" : f(a) + " – " + f(b) + " %"; };
// Résumé des sources d'un objet. full = liste détaillée (fiche objet)
function sourcesOf(id) {
  if (!F) return null;
  const hv = F.harvest[id], dr = (F.drops[id] || []).filter(d => F.mons[d[0]]);
  return { hv, dr };
}
// Chance de drop effective avec la prospection : taux × PP / 100, plafonnée à 100 %
const ppOf = () => Math.max(1, +S.settings.pp || 100);
const dropChance = pct => Math.min(1, pct / 100 * ppOf() / 100);
const killsFor = (qty, pct) => Math.ceil(qty / Math.max(dropChance(pct), 1e-6));
function sourcesEl(id, full, qty) {
  const src = sourcesOf(id); if (!src) return null;
  const { hv, dr } = src;
  if (!hv && !dr.length) return full ? h("p", { class: "muted", text: recipe(id) ? "Cet objet se fabrique : il ne se récolte pas et n'est lâché par aucun monstre." : "Aucun monstre ne lâche cet objet et il ne se récolte pas (quête, boutique ou échange)." }) : h("span", { class: "muted small", text: recipe(id) ? "se fabrique" : "ni drop ni récolte" });
  const parts = [];
  if (hv) parts.push(h("div", { style: "display:grid;gap:4px" },
    h("span", {}, h("span", { class: "chip job", text: "Récolte · " + jobName(hv[0]) + " niv. " + hv[1] }), " ", hv[2].length ? h("span", { class: "small muted", text: hv[2].length + " zone" + (hv[2].length > 1 ? "s" : "") }) : null),
    full ? h("div", { class: "chips" }, hv[2].slice().sort((a, b) => (F.subs[a]?.[2] || 0) - (F.subs[b]?.[2] || 0)).map(sid => h("span", { class: "chip", text: subLabel(sid) + " · niv. " + (F.subs[sid]?.[2] || "?") }))) : null));
  if (dr.length && full) {
    parts.push(h("div", { style: "display:grid;gap:4px" },
      h("span", { class: "label", text: "Lâché par " + dr.length + " monstre" + (dr.length > 1 ? "s" : "") }),
      h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Monstre" }), h("th", { class: "n", text: "Niveau" }), h("th", { class: "n", text: "Taux" }), h("th", { class: "n", text: "Avec " + ppOf() + " PP" }), h("th", { text: "Où" }))),
        h("tbody", {}, dr.map(([mid, a, b]) => {
          const m = F.mons[mid];
          const where = m[3].slice(0, 4).map(subLabel).join(", ") + (m[3].length > 4 ? " +" + (m[3].length - 4) : "");
          return h("tr", {},
            h("td", {}, h("span", { class: "nm", text: m[0] }), m[4] ? h("span", { class: "chip warn", style: "margin-left:6px", text: "Boss · " + djName(m[4]) }) : null),
            h("td", { class: "n", text: m[1] === m[2] ? m[1] : m[1] + "–" + m[2] }),
            h("td", { class: "n", text: pctTxt(a, b) }),
            h("td", { class: "n", text: pctTxt(dropChance((a + b) / 2) * 100, dropChance((a + b) / 2) * 100) }),
            h("td", { class: "small", text: where || "—" }));
        }))))));
  } else if (dr.length) {
    const bits = dr.slice(0, 3).map(([mid, a, b]) => {
      const m = F.mons[mid];
      return m[0] + " (niv. " + m[1] + (m[2] !== m[1] ? "–" + m[2] : "") + ", " + pctTxt(a, b) + (m[4] ? ", boss " + djName(m[4]) : "") + ")";
    });
    parts.push(h("span", { class: "small", text: "Drop : " + bits.join(", ") + (dr.length > 3 ? " + " + (dr.length - 3) + " autres" : "") }));
    if (qty) {
      // Le monstre le plus « rentable » : le moins de combats pour la quantité voulue
      const [mid, a, b] = dr.slice().sort((x, y) => (y[1] + y[2]) - (x[1] + x[2]))[0];
      const n = killsFor(qty, (a + b) / 2);
      parts.push(h("span", { class: "chip kamas", text: "≈ " + fmt.format(n) + " " + F.mons[mid][0] + " à vaincre pour " + fmt.format(qty) + " (avec " + ppOf() + " PP)" }));
    }
  }
  return h("div", { style: "display:grid;gap:8px" }, parts);
}
// Zones qui couvrent le plus de ressources à farmer
function zonesFor(ids) {
  const z = new Map();
  const add = (sid, rid, how) => { if (!F.subs[sid]) return; if (!z.has(sid)) z.set(sid, new Map()); const m = z.get(sid); if (!m.has(rid)) m.set(rid, how); };
  for (const id of ids) {
    const s_ = sourcesOf(id); if (!s_) continue;
    if (s_.hv) for (const sid of s_.hv[2]) add(sid, id, "récolte");
    for (const [mid, , b] of s_.dr) { if (b < 1) continue; const m = F.mons[mid]; for (const sid of m[3]) add(sid, id, m[0] + " " + pctTxt(b, b)); }
  }
  return [...z.entries()].map(([sid, m]) => ({ sid, res: [...m.entries()] })).sort((a, b) => b.res.length - a.res.length || (F.subs[a.sid][2] - F.subs[b.sid][2])).slice(0, 12);
}

let farmSrc = "plan";
function viewFarm() {
  if (!F) { ensureFarm().then(() => { if (view === "farm") render(); }); return h("div", { class: "loading", text: "Chargement des drops, zones et donjons…" }); }
  const b = S.builds.find(x => x.id === farmSrc);
  if (farmSrc !== "plan" && !b) farmSrc = "plan";
  const targets = farmSrc === "plan" ? S.targets : b.items.map(id => recipe(id) ? { id, qty: 1 } : { id, qty: 1, raw: true });
  const { rows } = computeNeeds(targets);
  const need = rows.filter(r => r.buy > 0);
  const farmed = need.filter(r => r.farm), bought = need.filter(r => !r.farm);
  const buyCost = bought.reduce((t, r) => t + (r.cost || 0), 0), saved = farmed.reduce((t, r) => t + (r.p != null ? r.p * r.buy : 0), 0);
  const srcSel = h("select", { id: "farm-src", "aria-label": "Source" }, h("option", { value: "plan", selected: farmSrc === "plan" }, "Plan de craft (" + S.targets.length + " objet" + (S.targets.length > 1 ? "s" : "") + ")"),
    S.builds.map(x => h("option", { value: x.id, selected: farmSrc === x.id }, "Build : " + x.name)));
  srcSel.addEventListener("change", () => { farmSrc = srcSel.value; render(); });
  const setAll = v => { for (const r of need) { if (v) S.farm[r.id] = true; else delete S.farm[r.id]; } persist("plan"); render(); };
  const zones = zonesFor(farmed.map(r => r.id));
  const djs = new Map();
  for (const r of farmed) for (const [mid, , pb] of (sourcesOf(r.id)?.dr || [])) { const m = F.mons[mid]; if (m[4] && pb >= 1) { if (!djs.has(m[4])) djs.set(m[4], new Set()); djs.get(m[4]).add(r.id); } }
  return h("div", { class: "stack" },
    h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h2", { text: "Liste de farm" }), h("div", { class: "row", style: "gap:8px" }, h("span", { class: "label", text: "Pour" }), srcSel,
        h("span", { class: "label", text: "Ta prospection" }), numInput(S.settings.pp || 100, v => { const n = Math.round(+String(v).replace(/\s/g, "")); S.settings.pp = n > 0 ? Math.min(1000, n) : 100; persist("plan"); }, { sm: true, label: "Prospection", id: "farm-pp" }))),
      h("p", { class: "note", text: "Les ressources qu'il te manque (après ton stock), avec pour chacune où la récolter ou quel monstre la lâche. Choisis ce que tu farmes : le reste part dans la liste de courses du plan." }),
      h("div", { class: "tiles" },
        h("div", { class: "tile" }, h("span", { class: "label", text: "À farmer" }), h("span", { class: "v", text: farmed.length }), h("span", { class: "small muted", text: k(farmed.reduce((t, r) => t + r.buy, 0)) + " unités" })),
        h("div", { class: "tile kamas" }, h("span", { class: "label", text: "À acheter" }), h("span", { class: "v", text: kk(buyCost) }), h("span", { class: "small muted", text: bought.length + " ressources" + (bought.some(r => r.p == null) ? ", prix incomplets" : "") })),
        h("div", { class: "tile" }, h("span", { class: "label", text: "Économie en farmant" }), h("span", { class: "v pos", text: kk(saved) }), h("span", { class: "small muted", text: "au prix HDV relevé" })),
        h("div", { class: "tile" }, h("span", { class: "label", text: "Zones utiles" }), h("span", { class: "v", text: zones.length }), h("span", { class: "small muted", text: djs.size + " donjon" + (djs.size > 1 ? "s" : "") })))),
    !need.length ? h("div", { class: "empty" }, h("strong", { text: "Rien à farmer" }), h("span", { text: farmSrc === "plan" ? "Ajoute des objets au plan de craft, ou choisis un build dans la liste ci-dessus." : "Ton stock couvre déjà toutes les ressources de ce build." })) :
    h("div", { class: "grid2" },
      h("section", { class: "panel" },
        h("div", { class: "row between" }, h("h2", { text: "Ressources" }), h("div", { class: "row", style: "gap:6px" }, h("button", { type: "button", class: "btn sm", onclick: () => setAll(true) }, "Tout farmer"), h("button", { type: "button", class: "btn sm", onclick: () => setAll(false) }, "Tout acheter"))),
        h("div", { style: "display:grid;gap:10px" }, need.map(r => h("article", { class: "target" },
          h("div", { class: "head" }, itemLink(r.id, "×" + k(r.buy) + " · " + (r.o ? range(r.o.lo, r.o.hi) + " ₭/u" : "prix inconnu"), 32),
            h("span", { class: "seg", role: "group", "aria-label": "Choix" }, [[false, "Acheter"], [true, "Farmer"]].map(([v, l]) =>
              h("button", { type: "button", "aria-pressed": !!r.farm === v ? "true" : "false", onclick: () => { if (v) S.farm[r.id] = true; else delete S.farm[r.id]; persist("plan"); render(); } }, l)))),
          sourcesEl(r.id, false, r.buy))))),
      h("div", { class: "stack" },
        h("section", { class: "panel" }, h("h2", { text: "Où farmer" }),
          zones.length ? h("div", { style: "display:grid;gap:10px" }, zones.map(z => { const sb = F.subs[z.sid]; return h("div", { class: "target" },
            h("div", { class: "row between" }, h("strong", { text: subLabel(z.sid) }), h("span", { class: "chips" }, h("span", { class: "chip", text: "niv. " + sb[2] }), sb[3] >= 0 ? h("span", { class: "chip warn", text: "Donjon" }) : null, h("span", { class: "chip job", text: z.res.length + " ressource" + (z.res.length > 1 ? "s" : "") }))),
            h("div", { class: "chips" }, z.res.map(([rid, how]) => h("button", { type: "button", class: "chip", onclick: () => openSheet(rid), title: how }, item(rid)[0] + " · " + how)))); })) :
            h("p", { class: "muted", text: "Choisis « Farmer » sur au moins une ressource : les zones qui en regroupent le plus s'afficheront ici." })),
        djs.size ? h("section", { class: "panel" }, h("h2", { text: "Donjons utiles" }),
          h("div", { style: "display:grid;gap:8px" }, [...djs.entries()].sort((a, b) => b[1].size - a[1].size).map(([dj, set]) => h("div", { class: "row between" },
            h("span", {}, h("strong", { text: djName(dj) }), h("span", { class: "muted small", text: " · niv. conseillé " + (F.dungeons[dj]?.[1] || "?") })),
            h("span", { class: "small", text: [...set].map(x => item(x)[0]).join(", ") }))))) : null)));
}

// =====================================================================
// Builds : import (Dofusbook, texte, capture), statistiques, coût
// =====================================================================
const SLOTS = { 10: ["Chapeau", 1], 11: ["Cape", 2], 1: ["Amulette", 3], 3: ["Anneau", 4], 4: ["Ceinture", 5], 5: ["Bottes", 6], 2: ["Arme", 7], 7: ["Bouclier", 8], 12: ["Familier / monture", 9], 13: ["Dofus / trophée", 10] };
const SLOT_MAX = { 3: 2, 13: 6 };
const superOf = id => (D.types[item(id)[2]] || [0, 0])[1];
const isEquip = id => !!SLOTS[superOf(id)];
let EQUIP_NAMES = null;
function equipNames() {
  if (EQUIP_NAMES) return EQUIP_NAMES;
  const m = new Map();
  for (const e of INDEX) if (isEquip(e.id) && (e.key.length >= 6 || e.key.includes(" "))) { const cur = m.get(e.key); if (!cur || item(e.id)[1] > item(cur)[1]) m.set(e.key, e.id); }
  EQUIP_NAMES = [...m.entries()].sort((a, b) => b[0].length - a[0].length);
  return EQUIP_NAMES;
}
// Repère les noms d'équipements dans un texte copié (page Dofusbook, DofusDB, message…)
function parseBuildText(text) {
  const t = " " + norm(text) + " ";
  const taken = [], found = [];
  for (const [name, id] of equipNames()) {
    let i = t.indexOf(" " + name + " ");
    while (i >= 0) {
      const a = i + 1, b = a + name.length;
      if (!taken.some(([x, y]) => a < y && b > x)) { taken.push([a, b]); if (!found.includes(id)) found.push(id); break; }
      i = t.indexOf(" " + name + " ", i + 1);
    }
  }
  return found;
}
const slotSort = (a, b) => (SLOTS[superOf(a)]?.[1] || 99) - (SLOTS[superOf(b)]?.[1] || 99) || item(b)[1] - item(a)[1];
function fxText(tpl, a, b) {
  let t = tpl.replace(/\{\{~1~2([^}]*)\}\}/g, (m, g) => b != null && b !== a ? g : "")
    .replace(/\{\{~p([^}]*)\}\}/g, (m, g) => Math.max(Math.abs(a), Math.abs(b ?? a)) > 1 ? g : "")
    .replace(/\{\{[^}]*\}\}/g, "");
  t = t.replace("#1", fmt.format(a)).replace("#2", b != null && b !== a ? fmt.format(b) : "").replace("#3", "");
  return t.replace(/\s+/g, " ").replace(/ %/g, "%").trim();
}
async function ensureDets(ids) { await Promise.all([...new Set(ids.map(id => id % 32))].map(n => loadChunk(n))); }
function detOf(id) { return (DET[id % 32] || {})[id] || {}; }
function buildStats(ids) {
  const tot = {};
  const add = (c, lo, hi) => { const x = tot[c] || (tot[c] = { lo: 0, hi: 0 }); x.lo += lo; x.hi += hi; };
  for (const id of ids) for (const [c, lo, hi] of (detOf(id).st || [])) add(c, lo, hi);
  const sets = {};
  for (const id of ids) { const st = item(id)[4]; if (st > 0) (sets[st] = sets[st] || []).push(id); }
  const setRows = [];
  for (const [st, list] of Object.entries(sets)) {
    const tiers = D.setfx[st] || [], n = Math.min(list.length, tiers.length - 1), bonus = tiers[n] || [];
    for (const [c, v] of bonus) add(c, v, v);
    setRows.push({ st: +st, n: list.length, of: (SET_ITEMS[st] || []).length, bonus });
  }
  return { tot, setRows };
}
function statsEl(tot) {
  const groups = { 0: "Caractéristiques", 1: "Résistances", 2: "Dommages et soins" };
  const ent = Object.entries(tot).filter(([, v]) => v.lo || v.hi).map(([c, v]) => ({ c: +c, v, ch: D.chars[c] })).filter(x => x.ch);
  if (!ent.length) return h("p", { class: "muted", text: "Aucune statistique chiffrée pour ces pièces." });
  const by = {};
  for (const x of ent) (by[x.ch[1]] = by[x.ch[1]] || []).push(x);
  return h("div", { class: "grid2b", style: "gap:14px" }, Object.entries(by).map(([cat, list]) => h("div", { style: "display:grid;gap:4px;align-content:start" },
    h("span", { class: "label", text: groups[cat] || "Autres" }),
    h("ul", { class: "fx" }, list.sort((a, b) => a.ch[2] - b.ch[2]).map(x => h("li", { class: x.v.hi < 0 ? "neg" : "" }, fxText(x.ch[0], x.v.lo, x.v.hi)))))));
}
function buildCost(ids) {
  const C = coster();
  let lo = 0, hi = 0, missing = 0;
  const rows = ids.map(id => {
    const hdv = priceAt(id), cr = recipe(id) ? C.craft(id) : null;
    const crOk = cr && !cr.missing;
    let best = null, how = null;
    if (hdv && crOk) { if (cr.lo + cr.hi < hdv.lo + hdv.hi) { best = cr; how = "craft"; } else { best = hdv; how = "buy"; } }
    else if (hdv) { best = hdv; how = "buy"; } else if (crOk) { best = cr; how = "craft"; }
    if (best) { lo += best.lo; hi += best.hi; } else missing++;
    return { id, hdv, cr, best, how };
  });
  return { rows, lo, hi, missing };
}
let buildSel = null, buildImport = null; // buildImport: {status, ids, error}
function newBuild(name, ids) {
  const b = { id: Math.random().toString(36).slice(2, 10), name: name || "Build " + (S.builds.length + 1), items: [...new Set(ids)].sort(slotSort), at: Date.now() };
  S.builds.push(b); buildSel = b.id; persist("builds"); return b;
}
async function importBuildCapture(file) {
  if (!sampleFn || !canImages) return;
  buildImport = { status: "busy" }; render();
  try {
    const names = await sampleFn.json("Voici une capture d'écran d'un build (équipement) du jeu Dofus 3, en français : page Dofusbook, DofusDB ou fenêtre d'inventaire du jeu. "
      + "Liste le nom exact de chaque pièce d'équipement visible (chapeau, cape, amulette, anneaux, ceinture, bottes, arme, bouclier, familier ou monture, dofus et trophées). "
      + 'Réponds uniquement avec un tableau JSON de chaînes, par exemple ["Coiffe du Bouftou", "Gelano"]. N\'invente rien : si aucun nom n\'est lisible, réponds [].', { images: [file] });
    const ids = (Array.isArray(names) ? names : []).map(n => { const n2 = norm(String(n)); const hit = equipNames().find(([k2]) => k2 === n2); return hit ? hit[1] : (find(String(n), { limit: 8 }).find(e => isEquip(e.id)) || {}).id; }).filter(Boolean);
    buildImport = ids.length ? { status: "review", ids: [...new Set(ids)] } : { status: "error", error: "Aucun équipement reconnu sur cette capture. Essaie une capture où les noms des pièces sont lisibles." };
  } catch (e) {
    buildImport = { status: "error", error: { not_granted: "L'accès à Claude a été refusé pour cette page.", rate_limited: "Trop de demandes pour l'instant. Réessaie dans un moment." }[e && e.code] || "La lecture de la capture a échoué. Réessaie." };
  }
  render();
}
function viewBuilds() {
  const b = S.builds.find(x => x.id === buildSel) || S.builds[S.builds.length - 1];
  if (b) buildSel = b.id;
  // Import
  const ta = h("textarea", { id: "build-txt", placeholder: "Sur Dofusbook, ouvre le build, fais Ctrl + A puis Ctrl + C, et colle ici (Ctrl + V). Ça marche aussi avec DofusDB ou une simple liste de noms.", style: "min-height:110px" });
  const nameIn = h("input", { type: "text", id: "build-name", placeholder: "Nom du build (ex. Cra Terre 200)", style: "flex:1 1 220px" });
  const analyze = () => {
    const txt = ta.value.trim();
    if (!txt) { ta.focus(); return; }
    if (/^https?:\/\/\S+$/i.test(txt)) { buildImport = { status: "error", error: "La page ne peut pas ouvrir de lien externe. Ouvre le build sur Dofusbook, copie tout son contenu (Ctrl + A, Ctrl + C) et colle-le ici." }; render(); return; }
    const ids = parseBuildText(txt);
    buildImport = ids.length ? { status: "review", ids, name: nameIn.value.trim() } : { status: "error", error: "Aucun nom d'équipement reconnu dans ce texte." };
    render();
  };
  const fileIn = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, id: "build-file" });
  fileIn.addEventListener("change", () => { if (fileIn.files[0]) importBuildCapture(fileIn.files[0]); });
  const importBox = h("section", { class: "panel" },
    h("h2", { text: "Importer un build" }),
    h("p", { class: "note", text: "La page ne peut pas se connecter à Dofusbook. Copie le contenu du build et colle-le ci-dessous : l'atelier y repère les noms des pièces." + (canImages ? " Tu peux aussi importer une capture d'écran du build." : "") }),
    ta, h("div", { class: "row" }, nameIn, h("button", { type: "button", class: "btn primary", onclick: analyze }, "Analyser le texte"),
      canImages ? h("button", { type: "button", class: "btn", onclick: () => fileIn.click() }, "Importer une capture") : null, fileIn,
      h("button", { type: "button", class: "btn", onclick: () => { newBuild(nameIn.value.trim(), []); render(); } }, "Build vide")));
  if (buildImport?.status === "busy") importBox.append(h("p", { class: "muted", text: "Lecture de la capture…" }));
  if (buildImport?.status === "error") importBox.append(h("p", { class: "neg", text: buildImport.error }));
  if (buildImport?.status === "review") {
    const keep = new Set(buildImport.ids);
    importBox.append(h("span", { class: "label", text: buildImport.ids.length + " pièce(s) reconnue(s) : décoche les erreurs" }),
      h("div", { class: "cards" }, buildImport.ids.slice().sort(slotSort).map(id => {
        const cb = h("input", { type: "checkbox", checked: true, "aria-label": item(id)[0] }); cb.addEventListener("change", () => cb.checked ? keep.add(id) : keep.delete(id));
        return h("label", { class: "card" }, cb, icon(id, 32), h("span", { class: "t" }, h("span", { class: "nm", text: item(id)[0] }), h("small", { text: (SLOTS[superOf(id)] || ["?"])[0] + " · niv. " + item(id)[1] })));
      })),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn primary", onclick: () => { newBuild(buildImport.name || nameIn.value.trim(), [...keep]); buildImport = null; render(); } }, "Créer le build"),
        h("button", { type: "button", class: "btn", onclick: () => { buildImport = null; render(); } }, "Annuler")));
  }
  const list = S.builds.length ? h("div", { class: "chips" }, S.builds.map(x => h("button", { type: "button", class: "chip" + (x.id === buildSel ? " job" : ""), onclick: () => { buildSel = x.id; render(); } }, x.name + " · " + x.items.length + " pièces"))) : null;
  if (!b) return h("div", { class: "stack" }, importBox, h("div", { class: "empty" }, h("strong", { text: "Aucun build" }), h("span", { text: "Importe un build depuis Dofusbook ci-dessus, ou crée un build vide et ajoute les pièces à la main." })));

  // Détail du build
  const missingDet = b.items.filter(id => !DET[id % 32]);
  if (missingDet.length) { ensureDets(missingDet).then(() => { if (view === "builds") render(); }); }
  const { tot, setRows } = buildStats(b.items);
  const cost = buildCost(b.items);
  const counts = {}; for (const id of b.items) { const sp = superOf(id); counts[sp] = (counts[sp] || 0) + 1; }
  const over = Object.entries(counts).filter(([sp, n]) => n > (SLOT_MAX[sp] || 1)).map(([sp]) => SLOTS[sp]?.[0]);
  const rename = h("input", { type: "text", id: "build-rename", value: b.name, "aria-label": "Nom du build", style: "font:800 1.15rem var(--f-display);flex:1 1 200px" });
  rename.addEventListener("change", () => { b.name = rename.value.trim() || b.name; persist("builds"); render(); });
  const crafts = b.items.filter(id => recipe(id));
  return h("div", { class: "stack" },
    list ? h("section", { class: "panel" }, h("div", { class: "row between" }, h("h2", { text: "Mes builds" }), list)) : null,
    h("div", { class: "grid2 wide-left" },
      h("div", { class: "stack" },
        h("section", { class: "panel" },
          h("div", { class: "row" }, rename,
            h("button", { type: "button", class: "btn sm", title: "Créer une variante de ce build", onclick: () => { const nb = { id: Math.random().toString(36).slice(2, 10), name: b.name + " (variante)", items: [...b.items], perso: b.perso ? JSON.parse(JSON.stringify(b.perso)) : undefined, at: Date.now() }; S.builds.push(nb); buildSel = nb.id; CMP = { ...CMP, a: b.id, b: nb.id }; persist("builds"); render(); toast("Variante créée : modifie-la puis compare-la dans « Comparer »"); } }, "Dupliquer"),
            S.builds.length > 1 ? h("button", { type: "button", class: "btn sm", onclick: () => { CMP = { ...CMP, a: b.id, b: (S.builds.find(x => x.id !== b.id) || {}).id }; location.hash = "#comparer"; } }, "Comparer") : null,
            h("button", { type: "button", class: "btn sm", onclick: () => { const i = S.builds.indexOf(b), copy = { ...b, items: [...b.items] }; S.builds = S.builds.filter(x => x !== b); buildSel = null; persist("builds"); render(); toast("Build supprimé", () => { S.builds.splice(i, 0, copy); buildSel = copy.id; persist("builds"); render(); }); } }, "Supprimer")),
          over.length ? h("p", { class: "neg small", text: "Trop de pièces pour : " + over.join(", ") + "." }) : null,
          searchBox("Ajouter une pièce (équipement, dofus, familier…)", {}, id => { if (!isEquip(id)) { toast(item(id)[0] + " n'est pas un équipement"); return; } if (!b.items.includes(id)) { b.items.push(id); b.items.sort(slotSort); persist("builds"); } render(); }, "q-build"),
          h("div", { class: "tablewrap" }, h("table", {},
            h("thead", {}, h("tr", {}, h("th", { text: "Pièce" }), h("th", { class: "n", text: "Prix HDV" }), h("th", { class: "n", text: "Coût craft" }), h("th", { class: "n", text: "Meilleur" }), h("th", {}))),
            h("tbody", {}, cost.rows.map(r => h("tr", {},
              h("td", {}, itemLink(r.id, (SLOTS[superOf(r.id)] || ["?"])[0] + " · niv. " + item(r.id)[1], 30)),
              h("td", { class: "n" }, r.hdv ? range(r.hdv.lo, r.hdv.hi) : h("button", { type: "button", class: "btn sm", onclick: () => openSheet(r.id) }, "+ prix")),
              h("td", { class: "n" }, !r.cr ? h("span", { class: "muted", text: "non craftable" }) : r.cr.missing ? h("span", { class: "chip warn", text: r.cr.missing + " sans prix" }) : range(r.cr.lo, r.cr.hi)),
              h("td", { class: "n" }, r.best ? h("span", { class: "chip " + (r.how === "craft" ? "job" : "kamas"), text: (r.how === "craft" ? "Crafter " : "Acheter ") + kk((r.best.lo + r.best.hi) / 2) }) : "—"),
              h("td", {}, h("button", { type: "button", class: "x", "aria-label": "Retirer " + item(r.id)[0], onclick: () => { b.items = b.items.filter(x => x !== r.id); persist("builds"); render(); } }, "×"))))),
            h("tfoot", {}, h("tr", {}, h("td", { colspan: 3, text: "Coût total du build (meilleure option par pièce)" }), h("td", { class: "n", text: range(cost.lo, cost.hi) + " ₭" }), h("td", {}))))),
          cost.missing ? h("p", { class: "note", text: cost.missing + " pièce(s) sans prix HDV ni coût de craft complet : elles ne sont pas comptées. Ajoute un relevé dans la colonne Prix HDV." }) : null,
          h("div", { class: "row" },
            crafts.length ? h("button", { type: "button", class: "btn primary", onclick: () => { for (const id of crafts) if (!S.targets.some(t => t.id === id)) S.targets.push({ id, qty: 1 }); persist("plan"); toast(crafts.length + " pièce(s) ajoutée(s) au plan de craft"); render(); } }, "Ajouter les " + crafts.length + " pièces craftables au plan") : null,
            h("button", { type: "button", class: "btn", onclick: () => { farmSrc = b.id; location.hash = "#farm"; } }, "Liste de farm du build")))),
      h("div", { class: "stack" },
        h("section", { class: "panel" },
          h("div", { class: "tiles", style: "grid-template-columns:repeat(2,minmax(0,1fr))" },
            h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Coût du build" }), h("span", { class: "v", text: kk((cost.lo + cost.hi) / 2) }), h("span", { class: "small muted", text: "fourchette " + range(cost.lo, cost.hi) })),
            h("div", { class: "tile" }, h("span", { class: "label", text: "Niveau requis" }), h("span", { class: "v", text: Math.max(0, ...b.items.map(id => item(id)[1])) }), h("span", { class: "small muted", text: b.items.length + " pièces" }))),
          h("div", { class: "row between" }, h("h2", { text: "Statistiques des équipements" }),
            h("span", { class: "seg", role: "group", "aria-label": "Jet" }, [["min", "Min"], ["mid", "Moyen"], ["max", "Max"]].map(([v, l]) =>
              h("button", { type: "button", "aria-pressed": (S.settings.jet || "max") === v ? "true" : "false", onclick: () => { S.settings.jet = v; persist("plan"); render(); } }, l)))),
          missingDet.length ? h("p", { class: "muted", text: "Chargement des effets…" }) : statsEl(tot),
          h("p", { class: "note", text: "Total des effets des pièces (jet minimum à jet maximum) et des bonus de panoplie. Les stats finales, avec niveau, points et parchemins, sont dans le panneau Personnage." })),
        missingDet.length ? null : persoPanel(b, S.settings.jet || "max"),
        setRows.length ? h("section", { class: "panel" }, h("h2", { text: "Panoplies" }),
          h("div", { style: "display:grid;gap:8px" }, setRows.map(sr => h("div", { style: "display:grid;gap:4px" },
            h("div", { class: "row between" }, h("strong", { text: D.sets[sr.st] || "Panoplie" }), h("span", { class: "chip job", text: sr.n + " / " + sr.of + " pièces" })),
            sr.bonus.length ? h("span", { class: "small muted", text: "Bonus : " + sr.bonus.map(([c, v]) => D.chars[c] ? fxText(D.chars[c][0], v, v) : "").filter(Boolean).join(", ") }) : h("span", { class: "small muted", text: "Pas de bonus avec " + sr.n + " pièce" + (sr.n > 1 ? "s" : "") }))))) : null)),
    importBox);
}

// =====================================================================
// Tournée HDV : relever à la chaîne les prix qui manquent ou qui ont vieilli
// =====================================================================
const TOUR_LS = "atelier-tournee";
let TOUR = null;      // {ids, i, saved, skipped:[], lots:{}, started}
let tourSetup = { plan: true, alm: true, builds: true, stale: true, age: 3, extra: [] };
try { const t = JSON.parse(localStorage.getItem(TOUR_LS) || "null"); if (t) { TOUR = t.tour || null; tourSetup = { ...tourSetup, ...(t.setup || {}) }; } } catch {}
function saveTour() { try { localStorage.setItem(TOUR_LS, JSON.stringify({ tour: TOUR, setup: tourSetup })); } catch {} }
// Hôtel des ventes où chercher l'objet, dans l'ordre de passage conseillé
const HDV = [["res", "Ressources"], ["cons", "Consommables"], ["equip", "Équipements"], ["arme", "Armes"], ["rare", "Dofus, familiers et montures"], ["autre", "Divers"]];
function hdvOf(id) {
  const sp = (D.types[item(id)[2]] || [0, 0])[1];
  if (sp === 9) return "res";
  if ([6, 16, 17, 18].includes(sp)) return "cons";
  if (sp === 2) return "arme";
  if ([1, 3, 4, 5, 7, 10, 11].includes(sp)) return "equip";
  if ([12, 13, 22, 23, 25].includes(sp)) return "rare";
  return "autre";
}
const hdvName = k => (HDV.find(x => x[0] === k) || ["", "Divers"])[1];
function needsCheck(id, age) { const o = priceAt(id); return !o || ageDays(o.d) >= age; }
// Liste des objets à relever, avec la raison (pour l'aperçu)
function tourCandidates(opt = tourSetup) {
  const why = new Map();
  const add = (id, r) => { id = +id; if (!D.items[id]) return; if (!why.has(id)) why.set(id, new Set()); why.get(id).add(r); };
  if (opt.plan) {
    for (const r of computePlan().rows) if (r.buy > 0 && !r.farm) add(r.id, "plan");
    for (const t of S.targets) add(t.id, "vente");
  }
  if (opt.alm) { const n = new Date(); for (let i = 0; i < 7; i++) { const d = new Date(n); d.setDate(n.getDate() + i); const a = almanaxFor(d); if (a) add(a[1], "almanax"); } }
  if (opt.builds) for (const b of S.builds) for (const id of b.items) add(id, "build");
  if (opt.stale) for (const id of Object.keys(prices())) add(id, "suivi");
  const ids = [...why.keys()].filter(id => needsCheck(id, opt.age));
  for (const id of opt.extra || []) if (!ids.includes(+id)) { ids.push(+id); if (!why.has(+id)) why.set(+id, new Set(["ajout"])); }
  const order = Object.fromEntries(HDV.map(([k], i) => [k, i]));
  ids.sort((a, b) => order[hdvOf(a)] - order[hdvOf(b)] || typeName(a).localeCompare(typeName(b), "fr") || item(a)[0].localeCompare(item(b)[0], "fr"));
  return { ids, why };
}
const WHY = { plan: "à acheter pour le plan", vente: "à revendre", almanax: "Almanax", build: "build", suivi: "prix suivi", ajout: "ajouté" };

function viewTournee() {
  if (TOUR && TOUR.i < TOUR.ids.length) return tourRun();
  if (TOUR && TOUR.i >= TOUR.ids.length) return tourEnd();
  return tourPrep();
}
function tourPrep() {
  const { ids, why } = tourCandidates();
  const cb = (key, label, sub) => {
    const el = h("input", { type: "checkbox", id: "tour-" + key, checked: tourSetup[key] });
    el.addEventListener("change", () => { tourSetup[key] = el.checked; saveTour(); render(); });
    return h("label", { class: "tour-opt" }, el, h("span", {}, h("strong", { text: label }), h("small", { text: sub })));
  };
  const age = h("span", { class: "seg seg-full", role: "group", "aria-label": "Ancienneté" }, [[1, "Pas relevé aujourd'hui"], [3, "Plus de 3 jours"], [7, "Plus de 7 jours"]].map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": tourSetup.age === v ? "true" : "false", onclick: () => { tourSetup.age = v; saveTour(); render(); } }, l)));
  const groups = HDV.map(([k, label]) => [label, ids.filter(id => hdvOf(id) === k)]).filter(g => g[1].length);
  return h("div", { class: "grid2" },
    h("section", { class: "panel" },
      h("h2", { text: "Préparer la tournée" }),
      h("p", { class: "note", text: "Choisis ce qu'il faut relever. L'atelier garde les objets sans prix ou dont le dernier relevé est trop ancien, puis les range par hôtel des ventes pour t'éviter les allers-retours." }),
      h("div", { class: "tour-opts" },
        cb("plan", "Plan de craft", "ingrédients à acheter et objets à revendre"),
        cb("alm", "Almanax", "offrandes des 7 prochains jours"),
        cb("builds", "Builds", "toutes les pièces de tes builds"),
        cb("stale", "Prix suivis", "tous les objets déjà relevés par le groupe")),
      h("div", { style: "display:grid;gap:6px" }, h("span", { class: "label", text: "Relever les prix" }), age),
      searchBox("Ajouter un objet à la tournée", {}, id => { if (!tourSetup.extra.includes(id)) tourSetup.extra.push(id); saveTour(); render(); }, "q-tour"),
      tourSetup.extra.length ? h("div", { class: "chips" }, tourSetup.extra.map(id => h("button", { type: "button", class: "chip", title: "Retirer", onclick: () => { tourSetup.extra = tourSetup.extra.filter(x => x !== id); saveTour(); render(); } }, item(id)[0] + " ×"))) : null,
      h("button", { type: "button", class: "btn primary big", disabled: !ids.length, onclick: () => { TOUR = { ids, i: 0, saved: 0, skipped: [], lots: {}, started: Date.now() }; saveTour(); render(); } },
        ids.length ? "Démarrer la tournée · " + ids.length + " objet" + (ids.length > 1 ? "s" : "") : "Rien à relever")),
    h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h2", { text: "Ordre de passage" }), h("span", { class: "chip job", text: ids.length + " objets" })),
      groups.length ? h("div", { style: "display:grid;gap:14px" }, groups.map(([label, list]) => h("div", { style: "display:grid;gap:6px" },
        h("div", { class: "row between" }, h("span", { class: "label", text: "HDV " + label }), h("span", { class: "small muted", text: list.length + " objet" + (list.length > 1 ? "s" : "") })),
        h("div", { class: "tour-list" }, list.map(id => { const o = priceAt(id); return h("div", { class: "tour-li" }, itemLink(id, [...why.get(id)].map(r => WHY[r]).join(", "), 28), h("span", { class: "small muted", text: o ? ago(o.d) : "jamais relevé" })); }))))) :
        h("div", { class: "empty" }, h("strong", { text: "Tout est à jour" }), h("span", { text: "Aucun objet de ta sélection n'a besoin d'un nouveau relevé. Élargis la sélection ou ajoute un objet à la main." }))));
}
function tourRun() {
  const id = TOUR.ids[TOUR.i], g = hdvOf(id), o = priceAt(id), r = recipe(id);
  const lot = TOUR.lots[g] || (g === "res" ? 1 : 1);
  const lo = h("input", { class: "tour-in", id: "tour-lo", inputmode: "decimal", autocomplete: "off", placeholder: "Basse", "aria-label": "Moyenne basse, prix du lot" });
  const hi = h("input", { class: "tour-in", id: "tour-hi", inputmode: "decimal", autocomplete: "off", placeholder: "Haute", "aria-label": "Moyenne haute, prix du lot" });
  const unit = h("p", { class: "tour-unit" });
  const showUnit = () => {
    const a = parseKamas(lo.value), b = parseKamas(hi.value);
    unit.textContent = lot > 1 && (a != null || b != null) ? "Soit " + range((a ?? b) / lot, (b ?? a) / lot) + " ₭ à l'unité" : "";
  };
  [lo, hi].forEach(x => x.addEventListener("input", showUnit));
  const next = () => { TOUR.i++; saveTour(); render(); setTimeout(() => document.getElementById("tour-lo")?.focus(), 30); };
  const save = () => {
    const a = parseKamas(lo.value), b = parseKamas(hi.value);
    if (a == null && b == null) { lo.focus(); return; }
    if (addObs(id, a == null ? null : Math.round(a / lot), b == null ? null : Math.round(b / lot)) === false) return;
    TOUR.saved++; next();
  };
  lo.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); if (hi.value) save(); else hi.focus(); } });
  hi.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  const lots = h("span", { class: "seg", role: "group", "aria-label": "Taille du lot" }, [1, 10, 100, 1000].map(n =>
    h("button", { type: "button", "aria-pressed": lot === n ? "true" : "false", onclick: () => { TOUR.lots[g] = n; saveTour(); render(); setTimeout(() => document.getElementById("tour-lo")?.focus(), 30); } }, "×" + n)));
  const pct = Math.round(100 * TOUR.i / TOUR.ids.length);
  const prevGroup = TOUR.i > 0 && hdvOf(TOUR.ids[TOUR.i - 1]) !== g;
  const left = TOUR.ids.slice(TOUR.i + 1);
  const card = h("section", { class: "panel tour-card" },
    h("div", { class: "row between" },
      h("span", { class: "chip job", text: "HDV " + hdvName(g) + (prevGroup ? " · nouvel HDV" : "") }),
      h("span", { class: "small muted num", text: (TOUR.i + 1) + " / " + TOUR.ids.length })),
    h("div", { class: "bar" }, h("span", { style: "width:" + pct + "%" })),
    h("div", { class: "tour-item" }, icon(id, 72, "big"),
      h("div", { style: "display:grid;gap:4px;min-width:0" },
        h("h2", { text: item(id)[0] }),
        h("span", { class: "muted small", text: typeName(id) + " · niveau " + item(id)[1] + (r ? " · " + jobName(r[0]) : "") }),
        h("span", { class: "chip kamas" }, o ? "Dernier relevé : " + range(o.lo, o.hi) + " ₭ · " + ago(o.d) : "Jamais relevé"))),
    h("div", { class: "row between" }, h("span", { class: "label", text: "Prix affichés pour un lot de" }), lots),
    h("div", { class: "tour-inputs" }, lo, hi),
    unit,
    h("div", { class: "tour-actions" },
      h("button", { type: "button", class: "btn primary big", onclick: save }, "Enregistrer et suivant"),
      h("button", { type: "button", class: "btn", onclick: () => { TOUR.skipped.push(id); next(); } }, "Pas en vente"),
      h("button", { type: "button", class: "btn", onclick: next }, "Passer")),
    h("div", { class: "row between" },
      TOUR.i > 0 ? h("button", { type: "button", class: "btn sm", onclick: () => { TOUR.i--; saveTour(); render(); } }, "← Précédent") : h("span"),
      h("button", { type: "button", class: "btn sm", onclick: () => { TOUR.ids = TOUR.ids.slice(0, TOUR.i); saveTour(); render(); } }, "Terminer la tournée")));
  setTimeout(() => { const el = document.getElementById("tour-lo"); if (el && document.activeElement === document.body && matchMedia("(pointer:fine)").matches) el.focus(); }, 30);
  return h("div", { class: "grid2 tour-grid" }, card,
    h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h2", { text: "Ensuite" }), h("span", { class: "small muted", text: TOUR.saved + " relevé" + (TOUR.saved > 1 ? "s" : "") + " enregistré" + (TOUR.saved > 1 ? "s" : "") })),
      left.length ? h("div", { class: "tour-list" }, left.slice(0, 12).map((x, j) => h("button", { type: "button", class: "tour-li link", onclick: () => { TOUR.i = TOUR.i + 1 + j; saveTour(); render(); } },
        h("span", { class: "itemline" }, icon(x, 28), h("span", { class: "t" }, h("span", { class: "nm", text: item(x)[0] }), h("small", { text: "HDV " + hdvName(hdvOf(x)) })))))) :
        h("p", { class: "muted", text: "C'est le dernier objet de la tournée." }),
      left.length > 12 ? h("p", { class: "note", text: "+ " + (left.length - 12) + " autres" }) : null));
}
function tourEnd() {
  const skipped = TOUR.skipped || [];
  return h("section", { class: "panel", style: "max-width:640px;margin:0 auto;width:100%" },
    h("h2", { text: "Tournée terminée" }),
    h("div", { class: "tiles", style: "grid-template-columns:repeat(2,minmax(0,1fr))" },
      h("div", { class: "tile" }, h("span", { class: "label", text: "Relevés enregistrés" }), h("span", { class: "v", text: TOUR.saved })),
      h("div", { class: "tile" }, h("span", { class: "label", text: "Durée" }), h("span", { class: "v", text: Math.max(1, Math.round((Date.now() - TOUR.started) / 60000)) + " min" }))),
    skipped.length ? h("div", { style: "display:grid;gap:6px" }, h("span", { class: "label", text: "Pas en vente" }), h("div", { class: "chips" }, skipped.map(x => h("button", { type: "button", class: "chip", onclick: () => openSheet(x) }, item(x)[0])))) : null,
    h("p", { class: "muted", text: SH && ME ? "Tes relevés sont déjà visibles par tout le groupe." : "Tes relevés sont enregistrés." }),
    h("div", { class: "row" },
      h("button", { type: "button", class: "btn primary", onclick: () => { TOUR = null; saveTour(); location.hash = "#rentabilite"; } }, "Voir la rentabilité"),
      h("button", { type: "button", class: "btn", onclick: () => { TOUR = null; saveTour(); render(); } }, "Nouvelle tournée")));
}

// =====================================================================
// Journal de ventes : achats et ventes réels, bilan par semaine ou par mois
// =====================================================================
let TR = [];               // opérations : {id, d, kind:"vente"|"achat", item_id, qty, total, fee, cost, note}
let TR_ERR = false;        // table absente côté serveur (migration à exécuter)
const LS_TR = "atelier-journal";
try { TR = JSON.parse(localStorage.getItem(LS_TR) || "[]"); } catch { TR = []; }
const lsSaveTr = () => { try { localStorage.setItem(LS_TR, JSON.stringify(TR)); } catch {} };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
async function loadTrades() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await SB.from("trades").select("id,d,kind,item_id,qty,total,fee,cost,note").order("d").range(from, from + 999);
    if (error) { TR_ERR = /trades|relation|schema cache|PGRST205|42P01/i.test((error.code || "") + " " + (error.message || "")); if (!TR_ERR) console.error(error); return; }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  TR = rows.map(r => ({ ...r, total: +r.total, fee: +r.fee, cost: r.cost == null ? null : +r.cost }));
  TR_ERR = false; lsSaveTr();
}
async function addTrade(t) {
  TR.push(t); TR.sort((a, b) => a.d < b.d ? -1 : 1); lsSaveTr();
  if (SB && ME) {
    saveState("busy", "Enregistrement…");
    const { error } = await SB.from("trades").insert({ ...t, user_id: ME });
    saveState(error ? "err" : "ok", error ? "Opération non enregistrée sur le serveur" : "Enregistré");
    if (error) console.error(error);
  }
}
async function delTrade(id) {
  const old = TR.find(t => t.id === id);
  TR = TR.filter(t => t.id !== id); lsSaveTr(); render();
  if (SB && ME) { const { error } = await SB.from("trades").delete().eq("id", id); if (error) { toast("Suppression impossible"); TR.push(old); lsSaveTr(); render(); return; } }
  toast("Opération supprimée", () => addTrade(old).then(render));
}
// Coût de revient proposé pour une vente
function costSuggestion(id, qty, d) {
  if (recipe(id)) { const c = coster(d).craft(id); if (!c.missing) return { v: Math.round((c.lo + c.hi) / 2 * qty), how: "coût du craft aux prix du groupe" }; }
  const buys = TR.filter(t => t.kind === "achat" && t.item_id === id && t.d <= d);
  const q = buys.reduce((s, t) => s + t.qty, 0);
  if (q) return { v: Math.round(buys.reduce((s, t) => s + t.total, 0) / q * qty), how: "prix moyen de tes achats" };
  return null;
}
// Ajoute le prix d'une transaction aux relevés, sans écraser le relevé du jour (on élargit la fourchette)
function obsFromTrade(id, unit, d) {
  const mine = SH && ME ? ((RAW[id] || {})[ME] || []) : (S.prices[id] || []);
  const cur = mine.find(o => o.d === d);
  addObs(id, cur ? Math.min(cur.lo, unit) : unit, cur ? Math.max(cur.hi, unit) : unit, d);
}

let JF = { kind: "vente", item: null, qty: 1, total: "", fee: "", cost: "", d: "", note: "", stock: true, obs: true, mode: "week", q: "" };
function journalForm() {
  const isV = JF.kind === "vente";
  const calc = () => {
    const total = parseKamas(JF.total), qty = Math.max(1, +JF.qty || 1);
    return { total, qty, autoFee: total != null ? Math.round(total * (S.settings.tax || 0) / 100) : null, sug: isV && JF.item ? costSuggestion(JF.item, qty, JF.d || today()) : null };
  };
  const field = (key, label, extra) => {
    const el = h("input", { class: "cell", id: "jf-" + key, inputmode: "decimal", value: JF[key], "aria-label": label, style: "width:100%" });
    el.addEventListener("input", () => { JF[key] = el.value; refresh(); });
    return [h("label", { class: "jf-field" }, h("span", { text: label }), el, extra || null), el];
  };
  const unitEl = h("small", { class: "jf-unit" }), sugEl = h("small", { class: "muted" });
  const [totalField, totalIn] = field("total", "Prix total (kamas)", unitEl);
  const [feeField, feeIn] = field("fee", "Taxe HDV");
  const [costField, costIn] = field("cost", "Coût de revient", sugEl);
  totalIn.placeholder = "ex. 150k";
  // Aides calculées en direct, sans redessiner le formulaire (la saisie en cours reste intacte)
  function refresh() {
    const c = calc();
    unitEl.textContent = c.total != null ? "Soit " + k(c.total / c.qty) + " ₭ à l'unité" : "";
    feeIn.placeholder = c.autoFee != null ? k(c.autoFee) + " (" + S.settings.tax + " %)" : S.settings.tax + " % du prix";
    costIn.placeholder = c.sug ? k(c.sug.v) : "inconnu";
    sugEl.textContent = c.sug ? "Proposé : " + c.sug.how : "Laisse vide si tu ne le connais pas";
  }
  const qtyIn = h("input", { class: "cell", id: "jf-qty", inputmode: "numeric", value: JF.qty, "aria-label": "Quantité", style: "width:100%" });
  qtyIn.addEventListener("input", () => { JF.qty = qtyIn.value; refresh(); });
  const dateIn = h("input", { type: "date", id: "jf-d", value: JF.d || today(), max: today(), "aria-label": "Date" });
  dateIn.addEventListener("change", () => { JF.d = dateIn.value; refresh(); });
  refresh();
  const chk = (key, label) => { const el = h("input", { type: "checkbox", id: "jf-" + key, checked: JF[key] }); el.addEventListener("change", () => { JF[key] = el.checked; }); return h("label", { class: "check" }, el, label); };
  const save = async () => {
    const t = parseKamas(JF.total), q = Math.max(1, Math.floor(+JF.qty || 1)), d = JF.d || today();
    if (!JF.item) { toast("Choisis d'abord un objet"); document.getElementById("q-journal")?.focus(); return; }
    if (t == null) { document.getElementById("jf-total")?.focus(); toast("Indique le prix total"); return; }
    const { autoFee, sug } = calc();
    const fee = isV ? (JF.fee !== "" ? parseKamas(JF.fee) || 0 : autoFee || 0) : 0;
    const cost = isV ? (JF.cost !== "" ? parseKamas(JF.cost) : (sug ? sug.v : null)) : null;
    await addTrade({ id: uuid(), d, kind: JF.kind, item_id: JF.item, qty: q, total: t, fee, cost, note: JF.note.slice(0, 200) });
    if (JF.stock) { if (isV) setStock(JF.item, Math.max(0, (S.stock[JF.item] || 0) - q)); else setStock(JF.item, (S.stock[JF.item] || 0) + q); }
    if (JF.obs) obsFromTrade(JF.item, Math.round(t / q), d);
    toast((isV ? "Vente" : "Achat") + " enregistré" + (isV ? "e" : "") + " : " + q + " × " + item(JF.item)[0]);
    JF = { ...JF, item: null, qty: 1, total: "", fee: "", cost: "", note: "" };
    render();
  };
  return h("section", { class: "panel jf", "data-kind": JF.kind },
    h("div", { class: "row between" }, h("h2", { text: "Nouvelle opération" }),
      h("span", { class: "seg", role: "group", "aria-label": "Type" }, [["vente", "Vente"], ["achat", "Achat"]].map(([v, l]) =>
        h("button", { type: "button", "aria-pressed": JF.kind === v ? "true" : "false", onclick: () => { JF.kind = v; JF.fee = ""; JF.cost = ""; render(); } }, l)))),
    JF.item ? h("div", { class: "row between jf-item" }, itemLink(JF.item, typeName(JF.item) + " · en stock : " + (S.stock[JF.item] || 0), 40),
      h("button", { type: "button", class: "btn sm", onclick: () => { JF.item = null; render(); } }, "Changer")) :
      searchBox(isV ? "Quel objet as-tu vendu ?" : "Quel objet as-tu acheté ?", {}, id => { JF.item = id; render(); setTimeout(() => document.getElementById("jf-qty")?.select(), 30); }, "q-journal"),
    h("div", { class: "jf-grid" },
      h("label", { class: "jf-field" }, h("span", { text: "Quantité" }), qtyIn),
      totalField,
      h("label", { class: "jf-field" }, h("span", { text: "Date" }), dateIn)),
    isV ? h("div", { class: "jf-grid" }, feeField, costField) : null,
    h("div", { class: "row" }, chk("stock", isV ? "Retirer de mon stock" : "Ajouter à mon stock"), chk("obs", "Ajouter ce prix aux relevés du groupe")),
    h("button", { type: "button", class: "btn primary big", onclick: save }, isV ? "Enregistrer la vente" : "Enregistrer l'achat"));
}
// Totaux d'une période
function periodSums(list) {
  const v = list.filter(t => t.kind === "vente"), a = list.filter(t => t.kind === "achat");
  const net = v.reduce((s, t) => s + t.total - (t.fee || 0), 0), buy = a.reduce((s, t) => s + t.total, 0);
  const withCost = v.filter(t => t.cost != null);
  return { net, buy, solde: net - buy, marge: withCost.length ? withCost.reduce((s, t) => s + t.total - (t.fee || 0) - t.cost, 0) : null, nV: v.length, nA: a.length, noCost: v.length - withCost.length };
}
function journalChart(mode) {
  const bs = buckets(mode, 12).map(p => ({ ...p, ...periodSums(TR.filter(t => t.d >= p.s && t.d <= p.e)) }));
  if (!TR.length) return h("div", { class: "empty" }, h("strong", { text: "Pas encore de bilan" }), h("span", { text: "Enregistre ta première vente ou ton premier achat : le graphique montrera tes ventes, tes achats et ton solde par " + (mode === "week" ? "semaine" : "mois") + "." }));
  const W = 640, H = 240, L = 56, R = 12, T = 12, B = 28;
  const top = niceMax(Math.max(1, ...bs.map(b => Math.max(b.net, b.solde)))), bot = niceMax(Math.max(1, ...bs.map(b => Math.max(b.buy, -b.solde))));
  const span = top + bot;
  const y = v => T + (top - v) / span * (H - T - B);
  const bw = (W - L - R) / bs.length, x = i => L + (i + .5) * bw;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Ventes, achats et solde par " + (mode === "week" ? "semaine" : "mois") });
  for (const v of [top, top / 2, 0, -bot / 2, -bot]) svg.append(s("line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v), style: v === 0 ? "stroke:var(--muted);stroke-width:1.2" : null }), s("text", { class: "axis", x: L - 6, y: y(v) + 4, "text-anchor": "end" }, (v < 0 ? "−" : "") + kk(Math.abs(v))));
  bs.forEach((b, i) => {
    const w = Math.min(26, bw * .55);
    if (b.net > 0) svg.append(s("path", { class: "b-sell", d: roundTop(x(i) - w / 2, y(b.net), w, y(0) - y(b.net)) }));
    if (b.buy > 0) svg.append(s("path", { class: "b-buy", d: roundBottom(x(i) - w / 2, y(0) + 1, w, y(-b.buy) - y(0) - 1) }));
    if ((bs.length - 1 - i) % 2 === 0) svg.append(s("text", { class: "axis", x: x(i), y: H - 8, "text-anchor": "middle" }, b.label));
  });
  const pts = bs.map((b, i) => (b.nV || b.nA) ? [x(i), y(b.solde)] : null);
  let d = "", prev = false; pts.forEach(p => { if (p) { d += (prev ? "L" : "M") + p[0] + " " + p[1]; prev = true; } else prev = false; });
  svg.append(s("path", { class: "l-solde", d }));
  pts.forEach(p => { if (p) svg.append(s("circle", { class: "m-solde", cx: p[0], cy: p[1], r: 4 })); });
  const tip = h("div", { class: "tip", hidden: true }), cross = s("line", { class: "cross", y1: T, y2: H - B, visibility: "hidden" });
  svg.append(cross);
  bs.forEach((b, i) => {
    const hit = s("rect", { x: x(i) - bw / 2, y: 0, width: bw, height: H, fill: "transparent" });
    const show = () => {
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      tip.replaceChildren(h("strong", { text: b.long }),
        h("span", {}, h("i", { class: "k", style: "background:var(--s-hdv)" }), "Ventes nettes : " + k(b.net) + " ₭ (" + b.nV + ")"),
        h("span", {}, h("i", { class: "k", style: "background:var(--s-craft)" }), "Achats : " + k(b.buy) + " ₭ (" + b.nA + ")"),
        h("span", {}, h("i", { class: "k", style: "background:var(--fg)" }), "Solde : " + (b.solde >= 0 ? "+" : "") + k(b.solde) + " ₭"));
      tip.hidden = false; const pct = x(i) / W * 100;
      tip.style.left = pct > 60 ? "auto" : `calc(${pct}% + 12px)`; tip.style.right = pct > 60 ? `calc(${100 - pct}% + 12px)` : "auto";
    };
    hit.addEventListener("mouseenter", show); hit.addEventListener("click", show); svg.append(hit);
  });
  svg.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  return h("div", { style: "display:grid;gap:8px" },
    h("div", { class: "legend" }, h("span", { class: "lsell", text: "Ventes nettes de taxe" }), h("span", { class: "lbuy", text: "Achats" }), h("span", { class: "lsolde", text: "Solde" })),
    h("div", { class: "chart" }, svg, tip),
    h("details", {}, h("summary", { class: "note", text: "Voir les valeurs en tableau" }), h("div", { class: "tablewrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: mode === "week" ? "Semaine" : "Mois" }), h("th", { class: "n", text: "Ventes nettes" }), h("th", { class: "n", text: "Achats" }), h("th", { class: "n", text: "Solde" }))),
      h("tbody", {}, bs.map(b => h("tr", {}, h("td", { text: b.long }), h("td", { class: "n", text: k(b.net) }), h("td", { class: "n", text: k(b.buy) }), h("td", { class: "n " + (b.solde >= 0 ? "pos" : "neg"), text: k(b.solde) }))))))));
}
const roundTop = (x0, y0, w, hh) => { const r = Math.min(4, hh, w / 2); return `M${x0} ${y0 + hh}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}H${x0 + w - r}Q${x0 + w} ${y0} ${x0 + w} ${y0 + r}V${y0 + hh}Z`; };
const roundBottom = (x0, y0, w, hh) => { const r = Math.min(4, hh, w / 2); return `M${x0} ${y0}V${y0 + hh - r}Q${x0} ${y0 + hh} ${x0 + r} ${y0 + hh}H${x0 + w - r}Q${x0 + w} ${y0 + hh} ${x0 + w} ${y0 + hh - r}V${y0}Z`; };

function viewJournal() {
  const mode = JF.mode;
  const [cur, prev] = buckets(mode, 2).reverse();
  const sc = periodSums(TR.filter(t => t.d >= cur.s && t.d <= cur.e)), sp = periodSums(TR.filter(t => t.d >= prev.s && t.d <= prev.e));
  const delta = (a, b) => b ? h("span", { class: "small " + (a >= b ? "pos" : "neg"), text: (a >= b ? "▲ " : "▼ ") + k(Math.abs(a - b)) + " vs " + (mode === "week" ? "sem. passée" : "mois dernier") }) : h("span", { class: "small muted", text: "période précédente : 0" });
  const seg = h("span", { class: "seg", role: "group", "aria-label": "Période" }, [["week", "Par semaine"], ["month", "Par mois"]].map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": mode === v ? "true" : "false", onclick: () => { JF.mode = v; render(); } }, l)));
  // Objets les plus rentables (ventes avec coût connu)
  const by = new Map();
  for (const t of TR) { if (t.kind !== "vente") continue; const x = by.get(t.item_id) || { id: t.item_id, qty: 0, net: 0, marge: 0, known: true }; x.qty += t.qty; x.net += t.total - (t.fee || 0); if (t.cost == null) x.known = false; else x.marge += t.total - (t.fee || 0) - t.cost; by.set(t.item_id, x); }
  const best = [...by.values()].sort((a, b) => b.marge - a.marge || b.net - a.net).slice(0, 8);
  const q = h("input", { type: "search", id: "q-jhist", placeholder: "Filtrer l'historique", value: JF.q, "aria-label": "Filtrer l'historique" });
  q.addEventListener("input", () => { JF.q = q.value; clearTimeout(q._t); q._t = setTimeout(render, 200); });
  const hist = TR.slice().reverse().filter(t => !JF.q || norm(item(t.item_id)[0]).includes(norm(JF.q))).slice(0, 60);
  return h("div", { class: "stack" },
    TR_ERR ? h("section", { class: "panel" }, h("h2", { text: "Une mise à jour du serveur est nécessaire" }),
      h("p", { class: "muted", text: "Le journal n'est pas encore disponible sur le serveur. En attendant, tes opérations restent sur cet appareil." })) : null,
    h("div", { class: "grid2" },
      journalForm(),
      h("div", { class: "stack" },
        h("section", { class: "panel" },
          h("div", { class: "row between" }, h("h2", { text: mode === "week" ? "Cette semaine" : "Ce mois-ci" }), seg),
          h("div", { class: "tiles", style: "grid-template-columns:repeat(2,minmax(0,1fr))" },
            h("div", { class: "tile" }, h("span", { class: "label", text: "Ventes nettes" }), h("span", { class: "v", text: kk(sc.net) }), delta(sc.net, sp.net)),
            h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Achats" }), h("span", { class: "v", text: kk(sc.buy) }), h("span", { class: "small muted", text: sc.nA + " achat" + (sc.nA > 1 ? "s" : "") })),
            h("div", { class: "tile" }, h("span", { class: "label", text: "Solde" }), h("span", { class: "v " + (sc.solde >= 0 ? "pos" : "neg"), text: (sc.solde >= 0 ? "+" : "") + kk(sc.solde) }), delta(sc.solde, sp.solde)),
            h("div", { class: "tile" }, h("span", { class: "label", text: "Marge sur les ventes" }), h("span", { class: "v " + (sc.marge == null ? "" : sc.marge >= 0 ? "pos" : "neg"), text: sc.marge == null ? "—" : (sc.marge >= 0 ? "+" : "") + kk(sc.marge) }),
              h("span", { class: "small muted", text: sc.noCost ? sc.noCost + " vente(s) sans coût de revient" : "après coût de revient et taxe" })))),
        h("section", { class: "panel" }, h("h2", { text: "Évolution sur 12 " + (mode === "week" ? "semaines" : "mois") }), journalChart(mode)))),
    h("div", { class: "grid2b" },
      h("section", { class: "panel" }, h("h2", { text: "Ce qui t'a le plus rapporté" }),
        best.length ? h("div", { class: "tablewrap" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", { text: "Objet" }), h("th", { class: "n", text: "Vendus" }), h("th", { class: "n", text: "Ventes nettes" }), h("th", { class: "n", text: "Marge" }))),
          h("tbody", {}, best.map(b => h("tr", {}, h("td", {}, itemLink(b.id, typeName(b.id), 26)), h("td", { class: "n", text: k(b.qty) }), h("td", { class: "n", text: k(b.net) }),
            h("td", { class: "n " + (b.marge >= 0 ? "pos" : "neg"), text: (b.marge >= 0 ? "+" : "") + k(b.marge) + (b.known ? "" : " *") })))))) :
          h("div", { class: "empty" }, h("strong", { text: "Aucune vente pour l'instant" }), h("span", { text: "Tes objets les plus rentables apparaîtront ici." })),
        best.some(b => !b.known) ? h("p", { class: "note", text: "* certaines ventes n'ont pas de coût de revient : leur marge n'est pas comptée." }) : null),
      h("section", { class: "panel" },
        h("div", { class: "row between" }, h("h2", { text: "Historique" }), h("span", { class: "chip", text: TR.length + " opération" + (TR.length > 1 ? "s" : "") })),
        TR.length ? h("div", { class: "search" }, q) : null,
        hist.length ? h("div", { class: "tablewrap" }, h("table", {}, h("tbody", {}, hist.map(t => h("tr", {},
          h("td", {}, h("span", { class: "chip " + (t.kind === "vente" ? "job" : "kamas"), text: t.kind === "vente" ? "Vente" : "Achat" })),
          h("td", {}, itemLink(t.item_id, t.qty + " × · " + parseD(t.d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), 26)),
          h("td", { class: "n " + (t.kind === "vente" ? "pos" : ""), text: (t.kind === "vente" ? "+" : "−") + k(t.kind === "vente" ? t.total - (t.fee || 0) : t.total) }),
          h("td", {}, h("button", { type: "button", class: "x", "aria-label": "Supprimer cette opération", onclick: () => delTrade(t.id) }, "×"))))))) :
          h("p", { class: "muted", text: TR.length ? "Aucune opération ne correspond." : "Tes ventes et achats apparaîtront ici." }))));
}

// =====================================================================
// Métiers : recettes accessibles, coût par craft et coût par XP
// =====================================================================
let metierF = { sort: "lvl", all: false };
function viewMetiers() {
  const jobs = [...new Set(Object.values(D.recipes).map(r => r[0]))].sort((a, b) => jobName(a).localeCompare(jobName(b), "fr"));
  const job = S.settings.job && jobs.includes(+S.settings.job) ? +S.settings.job : jobs[0];
  const lv = S.settings.jobs?.[job] ?? 1;
  const xp = S.settings.xp || {};
  const sel = h("select", { id: "metier-job", "aria-label": "Métier" }, jobs.map(j => h("option", { value: j, selected: j === job }, jobName(j))));
  sel.addEventListener("change", () => { S.settings.job = +sel.value; persist("plan"); render(); });
  const lvIn = numInput(lv, v => { const n = Math.max(1, Math.min(200, Math.round(+v) || 1)); S.settings.jobs = { ...(S.settings.jobs || {}), [job]: n }; persist("plan"); }, { sm: true, label: "Niveau du métier", id: "metier-lv" });
  const C = coster();
  let rows = Object.entries(D.recipes).filter(([id, r]) => r[0] === job && item(+id)[1] <= lv).map(([id]) => {
    id = +id; const c = C.craft(id), mid = c.missing ? null : (c.lo + c.hi) / 2, x = +xp[id] || null;
    return { id, lvl: item(id)[1], c, mid, x, perK: mid != null && x ? mid / x * 1000 : null };
  });
  const total = rows.length;
  if (!metierF.all) rows = rows.filter(r => r.lvl >= lv - 30);
  const by = { lvl: (a, b) => b.lvl - a.lvl || (a.mid ?? 1e15) - (b.mid ?? 1e15), cost: (a, b) => (a.mid ?? 1e15) - (b.mid ?? 1e15), xp: (a, b) => (a.perK ?? 1e15) - (b.perK ?? 1e15) || b.lvl - a.lvl };
  rows.sort(by[metierF.sort]);
  const best = rows.filter(r => r.perK != null).sort(by.xp)[0];
  const cheapest = rows.filter(r => r.mid != null && r.lvl >= lv - 10).sort(by.cost)[0];
  const missingIngs = [...new Set(rows.slice(0, 40).flatMap(r => recipe(r.id)[1].map(x => x[0])).filter(i => !priceAt(i)))];
  const sortSeg = h("span", { class: "seg", role: "group", "aria-label": "Tri" }, [["lvl", "Niveau"], ["cost", "Coût"], ["xp", "Coût / XP"]].map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": metierF.sort === v ? "true" : "false", onclick: () => { metierF.sort = v; render(); } }, l)));
  return h("div", { class: "stack" },
    h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h2", { text: "Monter un métier" }),
        h("div", { class: "row", style: "gap:8px" }, sel, h("span", { class: "label", text: "Niveau" }), lvIn)),
      h("div", { class: "tiles" },
        h("div", { class: "tile" }, h("span", { class: "label", text: "Recettes accessibles" }), h("span", { class: "v", text: total }), h("span", { class: "small muted", text: "jusqu'au niveau " + lv })),
        h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Craft le moins cher" }), h("span", { class: "v", text: cheapest ? kk(cheapest.mid) : "—" }), h("span", { class: "small muted", text: cheapest ? item(cheapest.id)[0] + " · niv. " + cheapest.lvl : "parmi les 10 derniers niveaux, prix requis" })),
        h("div", { class: "tile" }, h("span", { class: "label", text: "Meilleur coût par XP" }), h("span", { class: "v", text: best ? kk(best.perK) : "—" }), h("span", { class: "small muted", text: best ? "pour 1 000 XP · " + item(best.id)[0] : "note l'XP d'un craft pour le calculer" })),
        h("div", { class: "tile" }, h("span", { class: "label", text: "Ingrédients sans prix" }), h("span", { class: "v", text: missingIngs.length }),
          missingIngs.length ? h("button", { type: "button", class: "btn sm", onclick: () => { tourSetup.extra = [...new Set([...(tourSetup.extra || []), ...missingIngs])]; saveTour(); location.hash = "#tournee"; } }, "Les ajouter à la tournée") : h("span", { class: "small muted", text: "tout est chiffré" }))),
      h("p", { class: "note", text: "Dans Dofus, une recette proche de ton niveau rapporte plus d'XP. Le jeu ne publie pas la formule exacte : note l'XP qu'un craft t'a rapportée (visible en jeu après le craft) et l'atelier calcule le coût pour 1 000 XP. Ces notes restent sur ton compte." })),
    h("section", { class: "panel" },
      h("div", { class: "row between" }, h("h2", { text: jobName(job) + " · recettes" }),
        h("div", { class: "row", style: "gap:8px" }, h("label", { class: "check" }, (() => { const c = h("input", { type: "checkbox", id: "metier-all", checked: metierF.all }); c.addEventListener("change", () => { metierF.all = c.checked; render(); }); return c; })(), "Tous les niveaux"), sortSeg)),
      rows.length ? h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Recette" }), h("th", { class: "n", text: "Niv." }), h("th", { class: "n", text: "Coût / craft" }), h("th", { class: "n", text: "XP / craft" }), h("th", { class: "n", text: "Coût / 1 000 XP" }), h("th", {}))),
        h("tbody", {}, rows.slice(0, 80).map(r => h("tr", {},
          h("td", {}, itemLink(r.id, r.id === best?.id ? "★ meilleur coût par XP" : r.id === cheapest?.id ? "★ le moins cher près de ton niveau" : recipe(r.id)[1].length + " ingrédients", 28)),
          h("td", { class: "n", text: r.lvl }),
          h("td", { class: "n" }, r.c.missing ? h("span", { class: "chip warn", text: r.c.missing + " sans prix" }) : range(r.c.lo, r.c.hi)),
          h("td", { class: "n" }, numInput(r.x || "", v => { const n = Math.round(+String(v).replace(/\s/g, "")); S.settings.xp = { ...(S.settings.xp || {}) }; if (n > 0) S.settings.xp[r.id] = n; else delete S.settings.xp[r.id]; persist("plan"); }, { sm: true, ph: "XP", label: "XP gagnée par craft" })),
          h("td", { class: "n " + (r.id === best?.id ? "pos" : ""), text: r.perK != null ? k(r.perK) : "—" }),
          h("td", {}, h("button", { type: "button", class: "btn sm", onclick: () => { addTarget(r.id); toast(item(r.id)[0] + " ajouté au plan"); } }, "+ Plan")))))),
        ) : h("div", { class: "empty" }, h("strong", { text: "Aucune recette à ce niveau" }), h("span", { text: "Indique ton niveau dans ce métier, ou coche « Tous les niveaux »." })),
      rows.length > 80 ? h("p", { class: "note", text: "Seules les 80 premières recettes sont affichées." }) : null));
}

// =====================================================================
// Alertes de prix : achat sous un seuil, vente au-dessus, craft rentable
// =====================================================================
const ALERT_KIND = {
  buy: ["Acheter sous", "quand la moyenne basse passe sous"],
  sell: ["Vendre au-dessus", "quand la moyenne haute dépasse"],
  craft: ["Craft rentable", "quand la marge nette par craft atteint"],
};
// État d'une alerte d'après le dernier prix connu du groupe
function alertState(a, C) {
  const o = priceAt(a.item);
  if (a.kind === "craft") {
    if (!recipe(a.item)) return { ok: false, cur: null, o };
    const m = netMargin((C || coster()).craft(a.item), o);
    return { ok: m != null && m >= a.price, cur: m, o, key: m == null ? null : (o ? o.d : "") + ":" + Math.round(m) };
  }
  if (!o) return { ok: false, cur: null, o };
  const cur = a.kind === "buy" ? o.lo : o.hi;
  return { ok: a.kind === "buy" ? cur <= a.price : cur >= a.price, cur, o, key: o.d + ":" + Math.round(cur) };
}
function alertText(a, st) {
  const nm = item(a.item)[0];
  if (a.kind === "craft") return nm + " : marge de " + kk(st.cur) + " par craft (seuil " + kk(a.price) + ")";
  return nm + (a.kind === "buy" ? " à " + kk(st.cur) + ", sous ton prix d'achat de " : " à " + kk(st.cur) + ", au-dessus de ton prix de vente de ") + kk(a.price);
}
// Vérifie les alertes ; prévient une seule fois par nouveau prix déclencheur
let alertTimer = null;
function checkAlertsSoon() { clearTimeout(alertTimer); alertTimer = setTimeout(checkAlerts, 300); }
function checkAlerts() {
  if (!S.alerts || !S.alerts.length || NEED_LOGIN) return;
  const C = coster(); let changed = false; const msgs = [];
  for (const a of S.alerts) {
    const st = alertState(a, C);
    if (st.ok && st.key && a.notified !== st.key) {
      a.notified = st.key; changed = true;
      const by = st.o && st.o.by && st.o.by.filter(u => u !== ME).map(whoName);
      const msg = alertText(a, st) + (by && by.length ? " (relevé par " + by.join(", ") + ")" : "");
      msgs.push(msg);
      try { if ("Notification" in window && Notification.permission === "granted") navigator.serviceWorker?.ready.then(r => r.showNotification("Alerte de prix", { body: msg, icon: "icons/icon-192.png", tag: "alerte-" + a.id })).catch(() => new Notification("Alerte de prix", { body: msg })); } catch {}
    }
    if (!st.ok && a.notified) { a.notified = null; changed = true; }
  }
  if (msgs.length === 1) toast("🔔 " + msgs[0]);
  else if (msgs.length > 1) toast("🔔 " + msgs.length + " alertes déclenchées : " + msgs.map(m => m.split(" : ")[0].split(" à ")[0]).join(", "), () => { location.hash = "#alertes"; }, "Voir");
  if (changed) { persist("plan"); renderCounts(); }
}
const triggeredAlerts = () => { const C = coster(); return (S.alerts || []).map(a => ({ a, st: alertState(a, C) })).filter(x => x.st.ok); };

let AF = { kind: "buy", item: null, price: "" };
function viewAlertes() {
  const C = coster();
  const list = (S.alerts || []).map(a => ({ a, st: alertState(a, C) })).sort((x, y) => (y.st.ok - x.st.ok) || item(x.a.item)[0].localeCompare(item(y.a.item)[0], "fr"));
  const fired = list.filter(x => x.st.ok);
  // Valeur actuelle de l'objet choisi, pour proposer un seuil
  let hint = null, ph = "ex. 1 200";
  if (AF.item) {
    const st = alertState({ kind: AF.kind, item: AF.item, price: 0 }, C);
    if (AF.kind === "craft") { hint = !recipe(AF.item) ? "Cet objet ne se fabrique pas." : st.cur == null ? "Marge inconnue : il manque des prix." : "Marge actuelle : " + k(st.cur) + " ₭ par craft"; ph = "ex. 5k"; }
    else if (st.o) { hint = "Dernier relevé : " + range(st.o.lo, st.o.hi) + " ₭ (" + ago(st.o.d) + ")"; ph = k(AF.kind === "buy" ? st.o.lo * .9 : st.o.hi * 1.1); }
    else hint = "Pas encore de prix relevé pour cet objet.";
  }
  const priceIn = h("input", { class: "cell", id: "af-price", inputmode: "decimal", value: AF.price, placeholder: ph, "aria-label": "Seuil en kamas", style: "width:100%;text-align:left;font-size:1rem;padding:10px 12px;border-radius:12px" });
  priceIn.addEventListener("input", () => { AF.price = priceIn.value; });
  const create = () => {
    const p = parseKamas(AF.price);
    if (!AF.item) { toast("Choisis d'abord un objet"); document.getElementById("q-alert")?.focus(); return; }
    if (AF.kind === "craft" && !recipe(AF.item)) { toast("Cet objet ne se fabrique pas"); return; }
    if (p == null) { priceIn.focus(); toast("Indique un seuil en kamas"); return; }
    S.alerts = [...(S.alerts || []), { id: uuid(), kind: AF.kind, item: AF.item, price: p, at: Date.now(), notified: null }];
    persist("plan"); toast("Alerte créée : " + ALERT_KIND[AF.kind][0].toLowerCase() + " " + kk(p) + " pour " + item(AF.item)[0]);
    AF = { ...AF, item: null, price: "" }; render(); checkAlertsSoon();
  };
  priceIn.addEventListener("keydown", e => { if (e.key === "Enter") create(); });
  const notifState = "Notification" in window ? Notification.permission : "absent";
  return h("div", { class: "stack" },
    h("div", { class: "grid2" },
      h("section", { class: "panel" },
        h("div", { class: "row between" }, h("h2", { text: "Nouvelle alerte" }),
          h("span", { class: "seg", role: "group", "aria-label": "Type d'alerte" }, Object.entries(ALERT_KIND).map(([v, [l]]) =>
            h("button", { type: "button", "aria-pressed": AF.kind === v ? "true" : "false", onclick: () => { AF.kind = v; AF.price = ""; render(); } }, l)))),
        h("p", { class: "note", text: "Préviens-moi " + ALERT_KIND[AF.kind][1] + " ce seuil. Les alertes utilisent les prix relevés par tout le groupe." }),
        AF.item ? h("div", { class: "row between jf-item" }, itemLink(AF.item, typeName(AF.item), 40), h("button", { type: "button", class: "btn sm", onclick: () => { AF.item = null; render(); } }, "Changer")) :
          searchBox(AF.kind === "craft" ? "Quel objet veux-tu crafter ?" : "Quel objet surveiller ?", { craftOnly: AF.kind === "craft" }, id => { AF.item = id; render(); setTimeout(() => document.getElementById("af-price")?.focus(), 30); }, "q-alert"),
        h("label", { class: "jf-field" }, h("span", { text: AF.kind === "craft" ? "Marge minimale par craft (kamas)" : "Prix à l'unité (kamas)" }), priceIn, hint ? h("small", { class: "jf-unit", text: hint }) : null),
        h("button", { type: "button", class: "btn primary big", onclick: create }, "Créer l'alerte")),
      h("section", { class: "panel" },
        h("h2", { text: "Notifications" }),
        h("p", { class: "muted", text: "Quand une alerte se déclenche, l'appli affiche un message. Tu peux aussi recevoir une notification de ton téléphone ou de ton PC, tant que l'appli est ouverte (même en arrière-plan)." }),
        notifState === "granted" ? h("span", { class: "verdict good", text: "Notifications activées sur cet appareil" }) :
        notifState === "denied" ? h("p", { class: "note", text: "Les notifications sont bloquées pour ce site : réautorise-les dans les réglages du navigateur." }) :
        notifState === "absent" ? h("p", { class: "note", text: "Ce navigateur ne gère pas les notifications. Sur iPhone, installe d'abord l'appli sur l'écran d'accueil." }) :
        h("button", { type: "button", class: "btn primary", onclick: () => Notification.requestPermission().then(() => render()) }, "Activer les notifications"),
        h("div", { class: "tiles", style: "grid-template-columns:repeat(2,minmax(0,1fr))" },
          h("div", { class: "tile" }, h("span", { class: "label", text: "Alertes" }), h("span", { class: "v", text: list.length })),
          h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Déclenchées" }), h("span", { class: "v", text: fired.length }))))),
    h("section", { class: "panel" },
      h("h2", { text: "Mes alertes" }),
      list.length ? h("div", { class: "tablewrap" }, h("table", {},
        h("thead", {}, h("tr", {}, h("th", { text: "Objet" }), h("th", { text: "Condition" }), h("th", { class: "n", text: "Actuel" }), h("th", { text: "État" }), h("th", {}))),
        h("tbody", {}, list.map(({ a, st }) => {
          // Variation de prix qu'il reste pour atteindre le seuil
          const gap = st.cur != null && st.cur > 0 && a.kind !== "craft" ? Math.round((a.price - st.cur) / st.cur * 100) : null;
          const act = !st.ok ? null : a.kind === "craft"
            ? h("button", { type: "button", class: "btn sm", onclick: () => { addTarget(a.item); toast(item(a.item)[0] + " ajouté au plan"); } }, "+ Plan")
            : h("button", { type: "button", class: "btn sm", onclick: () => { JF = { ...JF, kind: a.kind === "buy" ? "achat" : "vente", item: a.item }; location.hash = "#journal"; } }, a.kind === "buy" ? "J'ai acheté" : "J'ai vendu");
          return h("tr", {},
            h("td", {}, itemLink(a.item, typeName(a.item), 28)),
            h("td", { class: "small", text: ALERT_KIND[a.kind][0] + " " + kk(a.price) }),
            h("td", { class: "n", text: st.cur == null ? "—" : kk(st.cur) }),
            h("td", {}, st.ok ? h("span", { class: "verdict good", text: "Déclenchée" + (st.o ? " · " + ago(st.o.d) : "") }) :
              h("span", { class: "verdict none", text: st.cur == null ? "Pas de prix" : gap != null ? "Il manque " + (gap > 0 ? "+" : "") + gap + " %" : "En attente" })),
            h("td", {}, h("div", { class: "row", style: "gap:6px;flex-wrap:nowrap" }, act,
              h("button", { type: "button", class: "x", "aria-label": "Supprimer l'alerte", onclick: () => { const old = S.alerts; S.alerts = S.alerts.filter(x => x.id !== a.id); persist("plan"); render(); toast("Alerte supprimée", () => { S.alerts = old; persist("plan"); render(); }); } }, "×"))));
        })))) :
        h("div", { class: "empty" }, h("strong", { text: "Aucune alerte" }), h("span", { text: "Crée une alerte ci-dessus, ou depuis la fiche d'un objet avec le bouton « Alerte »." }))));
}

// =====================================================================
// Personnage : niveau, points de caractéristiques, parchemins, stats finales
// Règles appliquées (Dofus, hypothèses vérifiables en jeu) :
//   capital = 5 points par niveau gagné ; Vitalité 1:1 ; Sagesse 3:1 ;
//   Force/Intelligence/Chance/Agilité : 1 point jusqu'à 100, 2 jusqu'à 200, 3 jusqu'à 300, puis 4 ;
//   base : 6 PA (7 dès le niveau 100), 3 PM, 1 invocation, PV = 50 + 5 × niveau + Vitalité,
//   Prospection = 100 + Chance/10, Initiative = Force + Intelligence + Chance + Agilité,
//   Tacle/Fuite = Agilité/10, Retrait/Esquive PA et PM = Sagesse/10.
// =====================================================================
const PRIM = [[11, "Vitalité"], [12, "Sagesse"], [10, "Force"], [15, "Intelligence"], [13, "Chance"], [14, "Agilité"]];
const PV = -1; // pseudo-caractéristique : points de vie
function persoOf(b) {
  const p = b.perso || {};
  return { lvl: p.lvl || Math.max(1, ...b.items.map(id => item(id)[1])), capital: p.capital ?? null,
    parcho: { 10: 100, 11: 100, 12: 100, 13: 100, 14: 100, 15: 100, ...(p.parcho || {}) }, base: { 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, ...(p.base || {}) } };
}
const capitalOf = p => p.capital != null ? p.capital : Math.max(0, (Math.min(200, p.lvl) - 1) * 5);
function pointsCost(c, v) {
  v = Math.max(0, Math.floor(v || 0));
  if (c === 11) return v;
  if (c === 12) return v * 3;
  let cost = 0;
  for (const [from, to, k] of [[0, 100, 1], [100, 200, 2], [200, 300, 3], [300, Infinity, 4]]) if (v > from) cost += (Math.min(v, to) - from) * k;
  return cost;
}
// Stats finales : équipement (jet choisi) + parchemins + points + base du personnage
function finalStats(b, jet) {
  const p = persoOf(b), eq = buildStats(b.items).tot;
  const val = x => !x ? 0 : jet === "min" ? x.lo : jet === "max" ? x.hi : (x.lo + x.hi) / 2;
  const out = {};
  for (const [c, x] of Object.entries(eq)) out[c] = val(x);
  const add = (c, v) => { out[c] = (out[c] || 0) + v; };
  for (const [c] of PRIM) add(c, (+p.parcho[c] || 0) + (+p.base[c] || 0));
  add(1, p.lvl >= 100 ? 7 : 6); add(23, 3); add(26, 1);
  const st = c => out[c] || 0;
  add(48, 100 + Math.floor(st(13) / 10));
  add(44, st(10) + st(15) + st(13) + st(14));
  add(79, Math.floor(st(14) / 10)); add(78, Math.floor(st(14) / 10));
  for (const c of [82, 83, 27, 28]) add(c, Math.floor(st(12) / 10));
  out[PV] = 50 + 5 * Math.min(200, p.lvl) + st(11);
  return out;
}
function persoPanel(b, jet) {
  const p = persoOf(b), cap = capitalOf(p);
  const used = PRIM.reduce((t, [c]) => t + pointsCost(c, p.base[c]), 0), left = cap - used;
  const save = patch => { b.perso = { ...persoOf(b), ...patch }; persist("builds"); render(); };
  const lvlIn = numInput(p.lvl, v => save({ lvl: Math.max(1, Math.min(200, Math.round(+v) || 1)) }), { sm: true, label: "Niveau du personnage", id: "perso-lvl" });
  const capIn = numInput(p.capital ?? "", v => save({ capital: String(v).trim() === "" ? null : Math.max(0, Math.round(+v) || 0) }), { sm: true, ph: String((Math.min(200, p.lvl) - 1) * 5), label: "Points de capital", id: "perso-cap" });
  const allParcho = PRIM.every(([c]) => +p.parcho[c] === 100);
  const fs = finalStats(b, jet);
  const line = (label, v, sub) => h("div", { class: "fs-row" }, h("span", { text: label }), h("strong", { class: "num", text: fmt.format(Math.round(v)) }), sub ? h("small", { class: "muted", text: sub }) : null);
  return h("section", { class: "panel" },
    h("div", { class: "row between" }, h("h2", { text: "Personnage" }),
      h("div", { class: "row", style: "gap:8px" }, h("span", { class: "label", text: "Niveau" }), lvlIn, h("span", { class: "label", text: "Capital" }), capIn)),
    h("div", { class: "row between" },
      h("span", { class: "chip " + (left < 0 ? "warn" : left === 0 ? "job" : "kamas"), text: left < 0 ? "Trop de points dépensés : " + fmt.format(-left) + " en trop" : fmt.format(left) + " point" + (left > 1 ? "s" : "") + " à répartir sur " + fmt.format(cap) }),
      h("button", { type: "button", class: "btn sm", onclick: () => save({ parcho: Object.fromEntries(PRIM.map(([c]) => [c, allParcho ? 0 : 100])) }) }, allParcho ? "Retirer les parchemins" : "Parchemins 100 partout")),
    h("div", { class: "tablewrap" }, h("table", { class: "perso-t" },
      h("thead", {}, h("tr", {}, h("th", { text: "Carac." }), h("th", { class: "n", text: "Parcho" }), h("th", { class: "n", text: "Points" }), h("th", { class: "n", text: "Total" }))),
      h("tbody", {}, PRIM.map(([c, label]) => h("tr", {},
        h("td", { text: label }),
        h("td", { class: "n" }, numInput(p.parcho[c], v => save({ parcho: { ...p.parcho, [c]: Math.max(0, Math.min(100, Math.round(+v) || 0)) } }), { sm: true, label: "Parchemins " + label })),
        h("td", { class: "n" }, numInput(p.base[c] || "", v => save({ base: { ...p.base, [c]: Math.max(0, Math.round(+v) || 0) } }), { sm: true, ph: "0", label: "Points en " + label }),
          pointsCost(c, p.base[c]) !== (+p.base[c] || 0) ? h("small", { class: "muted", style: "display:block", text: "coûte " + fmt.format(pointsCost(c, p.base[c])) }) : null),
        h("td", { class: "n" }, h("strong", { text: fmt.format(Math.round(fs[c] || 0)) }))))))),
    left > 0 ? h("div", { class: "row" }, h("span", { class: "small muted", text: "Mettre le reste en :" }), PRIM.map(([c, label]) => h("button", { type: "button", class: "chip", onclick: () => {
      // Ajoute autant de points que possible dans la caractéristique, selon son coût
      let v = +p.base[c] || 0; while (pointsCost(c, v + 1) - pointsCost(c, +p.base[c] || 0) <= left) v++;
      save({ base: { ...p.base, [c]: v } });
    } }, label))) : null,
    h("h3", { text: "Stats finales (" + ({ min: "jet minimum", mid: "jet moyen", max: "jet maximum" })[jet] + ")" }),
    h("div", { class: "fs-grid" },
      line("PA", fs[1] || 0), line("PM", fs[23] || 0), line("Points de vie", fs[PV]), line("Portée", fs[19] || 0),
      line("Initiative", fs[44] || 0), line("Prospection", fs[48] || 0), line("Invocations", fs[26] || 0), line("Critique (%)", fs[18] || 0),
      line("Tacle", fs[79] || 0), line("Fuite", fs[78] || 0), line("Retrait PA / PM", fs[82] || 0), line("Esquive PA / PM", fs[27] || 0)),
    h("p", { class: "note", text: "Hypothèses : 5 points de capital par niveau ; Vitalité 1 pour 1, Sagesse 3 pour 1, autres caractéristiques 1 / 2 / 3 / 4 points par paliers de 100 ; 6 PA (7 dès le niveau 100), 3 PM, PV = 50 + 5 × niveau + Vitalité. Si une règle diffère en jeu, corrige le capital à la main. Sans forgemagie, exos ni bonus de classe." }));
}

// =====================================================================
// Comparateur de builds : pièces, statistiques, coût, panoplies
// =====================================================================
let CMP = { a: null, b: null, jet: "max" };
function viewComparer() {
  if (S.builds.length < 2) return h("div", { class: "empty" }, h("strong", { text: "Il faut au moins deux builds" }),
    h("span", { text: "Crée ou importe un deuxième build dans l'onglet Builds. Astuce : le bouton « Dupliquer » crée une variante d'un build existant, idéale pour tester un changement de pièce." }),
    h("a", { href: "#builds", class: "btn primary", style: "text-decoration:none" }, "Aller aux builds"));
  const ids = S.builds.map(b => b.id);
  if (!ids.includes(CMP.a)) CMP.a = S.builds[S.builds.length - 2].id;
  if (!ids.includes(CMP.b) || CMP.b === CMP.a) CMP.b = S.builds.find(b => b.id !== CMP.a).id;
  const A = S.builds.find(b => b.id === CMP.a), B = S.builds.find(b => b.id === CMP.b);
  const missing = [...A.items, ...B.items].filter(id => !DET[id % 32]);
  if (missing.length) { ensureDets(missing).then(() => { if (view === "comparer") render(); }); return h("div", { class: "loading", text: "Chargement des effets…" }); }
  const pick = (key, other) => {
    const el = h("select", { id: "cmp-" + key, "aria-label": "Build " + key.toUpperCase() }, S.builds.map(b => h("option", { value: b.id, selected: b.id === CMP[key], disabled: b.id === CMP[other] }, b.name)));
    el.addEventListener("change", () => { CMP[key] = el.value; render(); });
    return el;
  };
  const jetSeg = h("span", { class: "seg", role: "group", "aria-label": "Jet comparé" }, [["min", "Jet minimum"], ["mid", "Jet moyen"], ["max", "Jet maximum"]].map(([v, l]) =>
    h("button", { type: "button", "aria-pressed": CMP.jet === v ? "true" : "false", onclick: () => { CMP.jet = v; render(); } }, l)));
  const val = x => !x ? 0 : CMP.jet === "min" ? x.lo : CMP.jet === "max" ? x.hi : (x.lo + x.hi) / 2;
  const sA = buildStats(A.items), sB = buildStats(B.items), cA = buildCost(A.items), cB = buildCost(B.items);
  // Stats finales du personnage (niveau, points, parchemins) ou seulement l'équipement
  if (CMP.full) { const fA = finalStats(A, CMP.jet), fB = finalStats(B, CMP.jet); sA.tot = {}; sB.tot = {}; for (const [c, v] of Object.entries(fA)) if (+c > 0) sA.tot[c] = { lo: v, hi: v }; for (const [c, v] of Object.entries(fB)) if (+c > 0) sB.tot[c] = { lo: v, hi: v }; }
  // Statistiques : union des caractéristiques, rangées par catégorie
  const chars = [...new Set([...Object.keys(sA.tot), ...Object.keys(sB.tot)])].map(Number).filter(c => D.chars[c] && (val(sA.tot[c]) || val(sB.tot[c])));
  chars.sort((x, y) => D.chars[x][1] - D.chars[y][1] || D.chars[x][2] - D.chars[y][2]);
  const groups = { 0: "Caractéristiques", 1: "Résistances", 2: "Dommages et soins" };
  // Nom lisible d'une caractéristique, d'après le texte de l'effet (« 0% Résistance Terre » → « Résistance Terre (%) »)
  const isPct = c => /^0\s*%/.test(fxText(D.chars[c][0], 0, 0));
  const statName = c => { const n = fxText(D.chars[c][0], 2, 2).replace(/^2\s*%?\s*/, "").trim() || D.chars[c][3]; return isPct(c) ? n + " (%)" : n; };
  const fmtV = (c, v) => (Number.isInteger(v) ? fmt.format(v) : v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })) + (isPct(c) ? " %" : "");
  let curCat = null;
  const statRows = [];
  for (const c of chars) {
    if (D.chars[c][1] !== curCat) { curCat = D.chars[c][1]; statRows.push(h("tr", { class: "cmp-cat" }, h("td", { colspan: 4, text: groups[curCat] || "Autres" }))); }
    const a = val(sA.tot[c]), b = val(sB.tot[c]), d = b - a;
    statRows.push(h("tr", { class: d ? "" : "same" },
      h("td", { text: statName(c) }), h("td", { class: "n", text: fmtV(c, a) }), h("td", { class: "n", text: fmtV(c, b) }),
      h("td", { class: "n " + (d > 0 ? "pos" : d < 0 ? "neg" : "muted"), text: d ? (d > 0 ? "▲ +" : "▼ −") + fmtV(c, Math.abs(d)) : "=" })));
  }
  // Pièces par emplacement
  const slotRows = Object.entries(SLOTS).sort((x, y) => x[1][1] - y[1][1]).map(([sp, [label]]) => {
    const ia = A.items.filter(id => superOf(id) === +sp), ib = B.items.filter(id => superOf(id) === +sp);
    if (!ia.length && !ib.length) return null;
    const cell = (list, other) => h("td", {}, list.length ? h("div", { style: "display:grid;gap:4px" }, list.map(id => h("div", { class: other.includes(id) ? "cmp-same" : "cmp-diff" }, itemLink(id, "niv. " + item(id)[1], 26)))) : h("span", { class: "muted small", text: "—" }));
    return h("tr", {}, h("td", { class: "label", text: label }), cell(ia, ib), cell(ib, ia));
  }).filter(Boolean);
  const tot = c => c.missing ? range(c.lo, c.hi) + " ₭ + " + c.missing + " sans prix" : range(c.lo, c.hi) + " ₭";
  const midA = (cA.lo + cA.hi) / 2, midB = (cB.lo + cB.hi) / 2, dCost = midB - midA;
  const lvl = b => Math.max(0, ...b.items.map(id => item(id)[1]));
  const setsTxt = st => st.setRows.length ? st.setRows.map(r => (D.sets[r.st] || "Panoplie") + " " + r.n + "/" + r.of).join(" · ") : "aucune";
  return h("div", { class: "stack" },
    h("section", { class: "panel" },
      h("div", { class: "cmp-head" },
        h("label", { class: "jf-field cmp-a" }, h("span", { text: "Build A" }), pick("a", "b")),
        h("button", { type: "button", class: "btn sm", title: "Inverser", onclick: () => { [CMP.a, CMP.b] = [CMP.b, CMP.a]; render(); } }, "⇄"),
        h("label", { class: "jf-field cmp-b" }, h("span", { text: "Build B" }), pick("b", "a"))),
      h("div", { class: "tiles" },
        h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Coût A" }), h("span", { class: "v", text: kk(midA) }), h("span", { class: "small muted", text: tot(cA) })),
        h("div", { class: "tile kamas" }, h("span", { class: "label", text: "Coût B" }), h("span", { class: "v", text: kk(midB) }), h("span", { class: "small muted", text: tot(cB) })),
        h("div", { class: "tile" }, h("span", { class: "label", text: "Écart de coût" }), h("span", { class: "v " + (dCost > 0 ? "neg" : dCost < 0 ? "pos" : ""), text: (dCost > 0 ? "+" : dCost < 0 ? "−" : "") + kk(Math.abs(dCost)) }), h("span", { class: "small muted", text: dCost > 0 ? "B coûte plus cher" : dCost < 0 ? "B coûte moins cher" : "même coût" })),
        h("div", { class: "tile" }, h("span", { class: "label", text: "Niveau requis" }), h("span", { class: "v", text: lvl(A) + " → " + lvl(B) }), h("span", { class: "small muted", text: A.items.length + " → " + B.items.length + " pièces" })))),
    h("div", { class: "grid2b" },
      h("section", { class: "panel" },
        h("div", { class: "row between" }, h("h2", { text: "Statistiques" }), jetSeg),
        h("span", { class: "seg", role: "group", "aria-label": "Périmètre" }, [[false, "Équipement seul"], [true, "Stats finales du personnage"]].map(([v, l]) =>
          h("button", { type: "button", "aria-pressed": !!CMP.full === v ? "true" : "false", onclick: () => { CMP.full = v; render(); } }, l))),
        chars.length ? h("div", { class: "tablewrap" }, h("table", { class: "cmp-table" },
          h("thead", {}, h("tr", {}, h("th", { text: "Caractéristique" }), h("th", { class: "n", text: "A" }), h("th", { class: "n", text: "B" }), h("th", { class: "n", text: "B − A" }))),
          h("tbody", {}, statRows))) : h("p", { class: "muted", text: "Aucune statistique chiffrée pour ces pièces." }),
        h("p", { class: "note", text: CMP.full ? "Stats finales : équipement, parchemins, points investis et base du personnage, réglés dans l'onglet Builds (panneau Personnage)." : "Effets des pièces et bonus de panoplie, sans points de caractéristiques, parchemins, forgemagie ni exos." })),
      h("div", { class: "stack" },
        h("section", { class: "panel" }, h("h2", { text: "Pièces" }),
          h("div", { class: "tablewrap" }, h("table", { class: "cmp-table" },
            h("thead", {}, h("tr", {}, h("th", { text: "Emplacement" }), h("th", { text: A.name }), h("th", { text: B.name }))),
            h("tbody", {}, slotRows))),
          h("p", { class: "note", text: "Les pièces communes aux deux builds sont grisées." })),
        h("section", { class: "panel" }, h("h2", { text: "Panoplies" }),
          h("p", {}, h("strong", { text: "A : " }), setsTxt(sA)), h("p", {}, h("strong", { text: "B : " }), setsTxt(sB))))));
}

// =====================================================================
// Habillage : icônes, onglets, bandeaux de section
// =====================================================================
const IC = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  hammer: "M14.5 3.5l6 6-2.5 2.5-6-6z M12 6l-9 9 3 3 9-9",
  trend: "M3 3v18h18 M7 15l4-4 3 3 6-6 M15 8h5v5",
  coins: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  leaf: "M5 21c0-9 5-15 15-16-1 10-7 15-15 16z M5 21l8-8",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  bag: "M6 9a6 6 0 0 1 12 0v11H6z M9 9V6a3 3 0 0 1 6 0v3 M6 14h12",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 21V5 M8 7h7 M8 11h5",
  save: "M12 3v12 M7 10l5 5 5-5 M4 17v3h16v-3",
  compare: "M8 3v18 M16 3v18 M3 8h5 M16 16h5 M3 3h18v18H3z",
  bell: "M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z M10 21a2 2 0 0 0 4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  up: "M12 20V5 M6 11l6-6 6 6 M5 20h14",
  ledger: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v2 M12 21v2 M1 12h2 M21 12h2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
};
const svgI = name => { const el = s("svg", { class: "i", viewBox: "0 0 24 24", "aria-hidden": "true" }); for (const d of IC[name].split(" M")) el.append(s("path", { d: d.startsWith("M") ? d : "M" + d })); return el; };
const TABS = [
  ["accueil", "Accueil", "home", "--c-home"], ["plan", "Plan de craft", "hammer", "--c-craft", "c-plan"], ["rentabilite", "Rentabilité", "trend", "--c-gold"],
  ["prix", "Prix HDV", "coins", "--c-gold", "c-prix"], ["tournee", "Tournée HDV", "route", "--c-gold", "c-tour"], ["journal", "Journal", "ledger", "--c-journal"], ["alertes", "Alertes", "bell", "--c-gold", "c-alert"], ["farm", "Farm", "leaf", "--c-farm"], ["metiers", "Métiers", "up", "--c-craft"], ["builds", "Builds", "shield", "--c-build", "c-builds"], ["comparer", "Comparer", "compare", "--c-build"],
  ["stock", "Inventaire", "bag", "--c-stock", "c-stock"], ["encyclopedie", "Encyclopédie", "book", "--c-ency"], ["compte", "Compte", "user", "--c-save"],
];
// Sections regroupées : menu latéral (bureau), barre du bas + sous-onglets (téléphone)
const GROUPS = [
  ["accueil", "Accueil", "home", "--c-home", ["accueil"]],
  ["marche", "Marché", "coins", "--c-gold", ["prix", "tournee", "rentabilite", "journal", "alertes"]],
  ["production", "Production", "hammer", "--c-craft", ["plan", "metiers", "farm", "stock"]],
  ["equipement", "Équipement", "shield", "--c-build", ["builds", "comparer", "encyclopedie"]],
  ["compte", "Compte", "user", "--c-save", ["compte"]],
];
const tabOf = v => TABS.find(t => t[0] === v);
const groupOf = v => GROUPS.find(g => g[4].includes(v)) || GROUPS[0];
let lastInGroup = {};
try { lastInGroup = JSON.parse(localStorage.getItem("atelier-nav") || "{}"); } catch {}
function navLink(v, cls) {
  const [, label, ic, c, cnt] = tabOf(v);
  const a = h("a", { href: "#" + v, "data-v": v, class: cls || null }, h("span", { class: "ib" }, svgI(ic)), h("span", { class: "lb", text: label }), cnt ? h("span", { class: "count", id: cnt, text: "" }) : null);
  a.style.setProperty("--c", "var(" + c + ")");
  return a;
}
function buildTabs() {
  document.getElementById("tabs").replaceChildren(...GROUPS.map(([g, label, , , tabs]) =>
    tabs.length === 1 ? h("div", { class: "grp" }, navLink(tabs[0])) : h("div", { class: "grp" }, h("span", { class: "gl", text: label }), tabs.map(v => navLink(v)))));
  document.getElementById("bottom").replaceChildren(...GROUPS.map(([g, label, ic, c, tabs]) => {
    const a = h("a", { href: "#" + (lastInGroup[g] && tabs.includes(lastInGroup[g]) ? lastInGroup[g] : tabs[0]), "data-g": g }, h("span", { class: "ib" }, svgI(ic)), h("span", { text: label }), g === "marche" ? h("span", { class: "dot", id: "dot-marche", hidden: true }) : null);
    a.style.setProperty("--c", "var(" + c + ")");
    return a;
  }));
}
function subTabs(v) {
  const g = groupOf(v);
  if (g[4].length < 2) return null;
  return h("nav", { class: "subtabs", "aria-label": g[1] }, g[4].map(x => {
    const [, label, ic, c] = tabOf(x);
    const a = h("a", { href: "#" + x, "aria-current": x === v ? "page" : null }, svgI(ic), label);
    a.style.setProperty("--c", "var(" + c + ")");
    return a;
  }));
}
// Couleur de catégorie d'un objet (équipement, Dofus/familier, ressource, consommable)
function catVar(id) {
  const sp = (D.types[item(id)[2]] || [0, 0])[1];
  if ([1, 2, 3, 4, 5, 7, 10, 11].includes(sp)) return "var(--k-equip)";
  if ([12, 13, 15, 22, 23, 25].includes(sp)) return "var(--k-rare)";
  if (sp === 9) return "var(--k-res)";
  if ([6, 16, 17, 18].includes(sp)) return "var(--k-cons)";
  return "var(--k-other)";
}
// Tirage stable (change chaque jour) pour les mosaïques décoratives
function sampleIds(pred, n, salt) {
  let seed = [...(today() + salt)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pool = INDEX.filter(e => item(e.id)[3] >= 0 && pred(e));
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n && pool.length; i++) { const e = pool[Math.floor(rnd() * pool.length)]; if (!out.includes(e.id)) out.push(e.id); }
  return out;
}
const supOfE = e => (D.types[e.type] || [0, 0])[1];
function heroFor(v) {
  const n = new Date();
  const alm = []; for (let i = 0; i < 8; i++) { const d = new Date(n); d.setDate(n.getDate() + i); const a = almanaxFor(d); if (a) alm.push(a[1]); }
  const bsel = S.builds.find(x => x.id === buildSel) || S.builds[S.builds.length - 1];
  const H = {
    accueil: ["Bienvenue dans l'atelier", n.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " · " + Object.keys(prices()).length + " prix suivis par le groupe", "home", alm],
    plan: ["Plan de craft", "Ce que tu veux fabriquer, et tout ce qu'il faut réunir pour y arriver.", "hammer", S.targets.flatMap(t => [t.id, ...(recipe(t.id)?.[1] || []).map(x => x[0])])],
    rentabilite: ["Crafter ou acheter ?", "Compare le coût de chaque craft au prix de l'HDV, marge nette après taxe.", "trend", Object.keys(prices()).map(Number).filter(id => recipe(id))],
    prix: ["Prix du groupe", SH ? "Chaque relevé est partagé en direct avec tout le groupe." : "Tes relevés de fourchettes de prix à l'HDV.", "coins", Object.keys(prices()).map(Number)],
    farm: ["Liste de farm", "Où récolter, quels monstres taper, quels donjons faire.", "leaf", []],
    comparer: ["Comparer deux builds", "Pièces, statistiques et coût côte à côte, pour choisir la meilleure variante.", "compare", [...new Set(S.builds.flatMap(b => b.items))]],
    builds: ["Builds", "Importe un build, vois ses stats, son coût et ce qu'il faut farmer.", "shield", bsel ? bsel.items : []],
    stock: ["Inventaire", "Ce que tu as sous la main, valorisé au prix du groupe.", "bag", Object.keys(S.stock).map(Number)],
    encyclopedie: ["Encyclopédie", fmt.format(INDEX.length) + " objets, " + fmt.format(Object.keys(D.recipes).length) + " recettes, effets, drops et panoplies.", "book", []],
    tournee: ["Tournée HDV", TOUR && TOUR.i < TOUR.ids.length ? "Objet " + (TOUR.i + 1) + " sur " + TOUR.ids.length + " · HDV " + hdvName(hdvOf(TOUR.ids[TOUR.i])) : "Relève à la chaîne les prix qui manquent, rangés par hôtel des ventes.", "route", TOUR && TOUR.i < TOUR.ids.length ? TOUR.ids.slice(TOUR.i, TOUR.i + 8) : tourCandidates().ids],
    alertes: ["Alertes de prix", "Sois prévenu quand un objet passe sous ton prix d'achat, dépasse ton prix de vente, ou quand un craft devient rentable.", "bell", (S.alerts || []).map(a => a.item)],
    metiers: ["Métiers", "Les recettes à ta portée, leur coût, et le craft le plus rentable pour monter.", "up", Object.entries(D.recipes).filter(([, r]) => r[0] === (+S.settings.job || r[0])).map(([id]) => +id).filter(id => item(id)[1] <= (S.settings.jobs?.[S.settings.job] ?? 200)).sort((a, b) => item(b)[1] - item(a)[1]).slice(0, 8)],
    journal: ["Journal de ventes", "Tes achats et ventes réels, et ce qu'ils t'ont vraiment rapporté.", "ledger", [...new Set(TR.slice().reverse().map(t => t.item_id))]],
    compte: ["Compte", "Ton pseudo, ton mot de passe et la sauvegarde de tes données.", "user", []],
  }[v];
  const fill = { farm: e => supOfE(e) === 9, builds: e => [1, 3, 10, 11].includes(supOfE(e)), encyclopedie: e => supOfE(e) === 13 || supOfE(e) === 12, compte: e => supOfE(e) === 13 };
  let ids = [...new Set(H[3])].filter(id => item(id)[3] >= 0).slice(0, 8);
  if (ids.length < 8) ids = ids.concat(sampleIds(fill[v] || (e => !!D.recipes[e.id]), 8 - ids.length, v).filter(x => !ids.includes(x)));
  return h("section", { class: "hero", "data-sec": v },
    h("div", { class: "mosaic", "aria-hidden": "true" }, ids.map(id => h("span", { class: "m" }, icon(id, 40)))),
    h("span", { class: "hi" }, svgI(H[2])),
    h("div", { class: "txt" }, h("h1", { text: H[0] }), h("p", { text: H[1] })));
}
function decorate(root, v) {
  const tab = TABS.find(t => t[0] === v);
  root.querySelectorAll(".empty").forEach(e => { if (!e.querySelector(".ei")) e.prepend(h("span", { class: "ei" }, svgI(tab ? tab[2] : "home"))); });
}

// =====================================================================
// Rendu et navigation
// =====================================================================
const VIEWS = { comparer: viewComparer, alertes: viewAlertes, metiers: viewMetiers, journal: viewJournal, tournee: viewTournee, farm: viewFarm, builds: viewBuilds, accueil: viewAccueil, plan: viewPlan, rentabilite: viewRentabilite, prix: viewPrix, stock: viewStock, encyclopedie: viewEncyclopedie, compte: viewSauvegarde };
function renderCounts() {
  const set = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n; el.dataset.z = n ? "0" : "1"; } };
  set("c-plan", S.targets.length);
  set("c-stock", Object.keys(S.stock).length);
  set("c-prix", Object.keys(prices()).length);
  set("c-builds", S.builds.length);
  const tour = TOUR && TOUR.i < TOUR.ids.length ? TOUR.ids.length - TOUR.i : tourCandidates().ids.length;
  set("c-tour", tour);
  const fired = triggeredAlerts().length;
  set("c-alert", fired);
  const dot = document.getElementById("dot-marche"); if (dot) { const n = fired || tour; dot.textContent = fired ? "🔔" + fired : (tour > 99 ? "99+" : tour); dot.hidden = !n; }
}
function render() {
  if (!D) return;
  document.getElementById("tabs").hidden = NEED_LOGIN;
  document.getElementById("bottom").hidden = NEED_LOGIN;
  if (NEED_LOGIN) { const root = document.getElementById("view"); root.dataset.sec = "accueil"; root.replaceChildren(h("div", { class: "stack" }, viewLogin())); return; }
  const a = document.activeElement, focusId = a && a.id, caret = a && a.selectionStart;
  document.querySelectorAll(".sidenav a").forEach(x => { if (x.dataset.v === view) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
  const grp = groupOf(view)[0];
  lastInGroup[grp] = view; try { localStorage.setItem("atelier-nav", JSON.stringify(lastInGroup)); } catch {}
  document.querySelectorAll(".bottom a").forEach(x => { if (x.dataset.g === grp) { x.setAttribute("aria-current", "page"); x.setAttribute("href", "#" + view); } else x.removeAttribute("aria-current"); });
  const root = document.getElementById("view");
  root.dataset.sec = view;
  root.replaceChildren(h("div", { class: "stack" }, subTabs(view), heroFor(view), VIEWS[view]()));
  decorate(root, view);
  renderCounts();
  if (focusId && /^(q-|enc-)/.test(focusId)) { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (caret != null) el.setSelectionRange(caret, caret); } catch {} } }
  if (sheet.open) renderSheet();
  checkAlertsSoon();
}
function route() { let v = location.hash.slice(1); if (v === "sauvegarde") v = "compte"; view = VIEWS[v] ? v : "accueil"; render(); window.scrollTo(0, 0); }
window.addEventListener("hashchange", route);

fetch(PATH.core).then(r => r.json()).then(d => {
  D = d; buildIndex(); buildTabs();
  document.getElementById("ver").textContent = "Dofus " + d.v;
  route();
  connect();
  initSample();
}).catch(() => {
  document.getElementById("view").replaceChildren(h("div", { class: "empty" }, h("strong", { text: "Les données du jeu n'ont pas pu être chargées" }), h("span", { text: "Recharge la page. Si le problème persiste, le fichier core.json est manquant." })));
});
})();
