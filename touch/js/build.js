/* Atelier Touch : builds (équipement, points de caractéristiques, totaux, panoplies) et sorts des classes
   (rangs, effets, calcul de dégâts estimé). Fiche « spell » : tous les rangs d'un sort. */
"use strict";

/* ---------- Données fixes ---------- */
// Cases de la poupée : [clé, intitulé, super-types acceptés]
const BLD_SLOTS = [
  ["hat", "Chapeau", [10]], ["cape", "Cape", [11]], ["amu", "Amulette", [1]], ["ring1", "Anneau 1", [3]], ["ring2", "Anneau 2", [3]],
  ["belt", "Ceinture", [4]], ["boots", "Bottes", [5]], ["weapon", "Arme", [2]], ["shield", "Bouclier", [7]], ["pet", "Familier / montilier", [12]],
  ["d1", "Dofus 1", [13]], ["d2", "Dofus 2", [13]], ["d3", "Dofus 3", [13]], ["d4", "Dofus 4", [13]], ["d5", "Dofus 5", [13]], ["d6", "Dofus 6", [13]],
];
const BLD_SLOT_NOUN = { hat: "un chapeau", cape: "une cape", amu: "une amulette", ring1: "un anneau", ring2: "un anneau", belt: "une ceinture", boots: "des bottes", weapon: "une arme", shield: "un bouclier", pet: "un familier", d1: "un Dofus ou trophée" };
// Caractéristiques à points : [clé, nom, clé des coûts de la classe, clé de stat]
const BLD_CARS = [["vit", "Vitalité", "Vitality", "c11"], ["sag", "Sagesse", "Wisdom", "c12"], ["str", "Force", "Strength", "c10"],
  ["int", "Intelligence", "Intelligence", "c15"], ["cha", "Chance", "Chance", "c13"], ["agi", "Agilité", "Agility", "c14"]];
// Clé de stat = "c" + caractéristique du jeu, ou "t:" + intitulé pour les effets sans caractéristique (Pods, % dommages…)
const BLD_LBL = {
  c1: "PA", c23: "PM", c19: "PO", c10: "Force", c15: "Intelligence", c13: "Chance", c14: "Agilité", c11: "Vitalité", c12: "Sagesse",
  c17: "Puissance", c16: "Dommages", c18: "% Critique", c44: "Initiative", c48: "Prospection", c49: "Soins", c26: "Invocations",
  c27: "Esquive PA", c28: "Esquive PM", c82: "Retrait PA", c83: "Retrait PM", c78: "Fuite", c79: "Tacle",
  c84: "Do poussée", c85: "Rés. poussée", c86: "Do critiques", c87: "Rés. critiques",
  c88: "Do Terre", c89: "Do Feu", c90: "Do Eau", c91: "Do Air", c92: "Do Neutre",
  c33: "% Rés. Terre", c34: "% Rés. Feu", c35: "% Rés. Eau", c36: "% Rés. Air", c37: "% Rés. Neutre",
  c54: "Rés. Terre", c55: "Rés. Feu", c56: "Rés. Eau", c57: "Rés. Air", c58: "Rés. Neutre",
  c59: "% Rés. Terre JcJ", c60: "% Rés. Feu JcJ", c61: "% Rés. Eau JcJ", c62: "% Rés. Air JcJ", c63: "% Rés. Neutre JcJ",
  c64: "Rés. Terre JcJ", c65: "Rés. Feu JcJ", c66: "Rés. Eau JcJ", c67: "Rés. Air JcJ", c68: "Rés. Neutre JcJ",
  c69: "Puissance pièges", c70: "Do pièges", c75: "% Érosion", c93: "Bombes",
  pv: "Points de vie", pods: "Pods",
};
// Éléments : clé, nom, caractéristique qui les augmente, do élémentaires, % rés, rés fixe
const BLD_EL = [["t", "Terre", "str", "c88", "c33", "c54"], ["f", "Feu", "int", "c89", "c34", "c55"], ["e", "Eau", "cha", "c90", "c35", "c56"],
  ["a", "Air", "agi", "c91", "c36", "c57"], ["n", "Neutre", "str", "c92", "c37", "c58"]];
// Effets de dégâts (sorts et armes) -> élément ; v = vol de vie ; h = soins ; b = meilleur élément
const BLD_DMG = { 96: "e", 97: "t", 98: "a", 99: "f", 100: "n", 91: "e", 92: "t", 93: "a", 94: "f", 95: "n", 1200: "b", 108: "h", 3007: "h" };
const BLD_STEAL = new Set([91, 92, 93, 94, 95]);
// Conditions d'objets : code -> caractéristique
const BLD_CRIT = { CS: ["Force", "str"], CI: ["Intelligence", "int"], CC: ["Chance", "cha"], CA: ["Agilité", "agi"], CV: ["Vitalité", "vit"], CW: ["Sagesse", "sag"],
  PL: ["Niveau", "lvl"], CP: ["PA", "pa"], CM: ["PM", "pm"] };

let BLD_SLOT = null;      // case de la poupée ouverte
let BLD_BYSUP = null;     // super-type -> objets
const BLD_FXC = {};       // effet -> [clé, signe] ou null
const SP_RANK = {};       // sort -> rang choisi (sinon le plus haut accessible)

/* ---------- Effets -> caractéristiques ---------- */
const bldLblOf = t => String(t || "").replace(/^-?#1\{~1~2 à -?\}#2\s*/, "").trim();
function bldFxKey(id) {
  if (id in BLD_FXC) return BLD_FXC[id];
  const E = D.core.effects[id]; let r = null;
  if (E && E[2] !== 2 && E[2] !== 3) {
    const t = E[0] || "", isNum = /^-?#1\{~1~2 à -?\}#2/.test(t), neg = E[4] === "-" || /^-/.test(t);
    if (E[1] > 0 && isNum && (E[3] !== 0 || E[4] === "-")) r = ["c" + E[1], neg ? -1 : 1];
    else if (E[1] === 0 && isNum && E[2] === 0 && E[4] !== "null" && id !== 646) {
      const l = bldLblOf(t);
      r = [l === "Pods" ? "pods" : l === "Vie" ? "vie" : "t:" + l, neg ? -1 : 1];
    }
  }
  return (BLD_FXC[id] = r);
}
const bldKey = id => bldFxKey(id)?.[0] || "x" + id;
function bldLabel(k) {
  if (BLD_LBL[k]) return BLD_LBL[k];
  if (k.startsWith("t:")) return k.slice(2);
  if (k === "vie") return "Vie";
  const ch = +k.slice(1);
  for (const E of Object.values(D.core.effects)) if (E[1] === ch && /^#1/.test(E[0])) return bldLblOf(E[0]) || k;
  return k;
}
// Jet retenu : le maximum s'il existe, sinon la valeur fixe
const bldRoll = e => (e[2] > 0 ? e[2] : e[1]) || 0;

/* ---------- Builds ---------- */
const bldBreeds = () => Object.entries(D.spells.breeds).map(([id, b]) => [+id, b[0]]).sort((a, b) => a[0] - b[0]);
const bldBreedName = id => D.spells?.breeds[id]?.[0] || "Classe " + id;
function bldNew(o = {}) {
  const breed = +o.breed || +S.settings.breed || 8, lvl = clamp(+o.lvl || +S.settings.lvl || 200, 1, 200);
  return {
    id: "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: o.name || `${bldBreedName(breed)} ${lvl}`, breed, sex: +o.sex || 0, lvl,
    items: Object.assign({}, o.items || {}), pts: Object.assign({}, o.pts || {}), scr: Object.assign({}, o.scr || {}), extra: Object.assign({}, o.extra || {}),
  };
}
function bldFix(b) {
  b.items = b.items || {}; b.pts = b.pts || {}; b.scr = b.scr || {}; b.extra = b.extra || {};
  if (!D.spells.breeds[b.breed]) b.breed = 8;
  b.lvl = clamp(Math.round(+b.lvl || 1), 1, 200);
  for (const k of Object.keys(b.items)) if (!item(b.items[k]) || !BLD_SLOTS.some(s => s[0] === k)) delete b.items[k];
  return b;
}
function bldCur() {
  if (!Array.isArray(S.builds)) S.builds = [];
  let b = S.builds.find(x => x.id === S.ui.bld);
  if (!b && S.builds.length) { b = S.builds[0]; S.ui.bld = b.id; }
  return b ? bldFix(b) : null;
}

// Coût en capital pour passer une caractéristique de « from » à « to » points (paliers de la classe)
function bldCost(costs, from, to) {
  costs = costs && costs.length ? costs : [[0, 1]];
  let c = 0;
  for (let i = from; i < to; i++) { let k = costs[0][1]; for (const [thr, v] of costs) if (i >= thr) k = v; c += k; }
  return c;
}
function bldCapital(b) {
  const costs = D.spells.breeds[b.breed][2] || {};
  const used = BLD_CARS.reduce((s, c) => s + bldCost(costs[c[2]], 0, +b.pts[c[0]] || 0), 0);
  return { total: 5 * (b.lvl - 1), used, left: 5 * (b.lvl - 1) - used };
}
// Points qu'on peut encore ajouter à une caractéristique avec le capital restant
function bldMaxAdd(b, car) {
  const costs = (D.spells.breeds[b.breed][2] || {})[car[2]];
  let left = bldCapital(b).left, cur = +b.pts[car[0]] || 0, n = 0;
  while (left > 0) { const c = bldCost(costs, cur + n, cur + n + 1); if (c > left) break; left -= c; n++; }
  return n;
}

/* ---------- Calcul des totaux ---------- */
function bldCalc(b) {
  const t = {}, other = [], warns = [], sets = [];
  const add = (k, v) => { t[k] = (t[k] || 0) + v; };
  const addFx = (fx, src) => {
    for (const e of fx || []) {
      const c = bldFxKey(e[0]);
      if (c) { add(c[0], c[1] * bldRoll(e)); continue; }
      if (HIDDEN_FX.has(e[0]) || [717, 983, 984, 800, 808, 807, 806].includes(e[0])) continue;
      const E = D.core.effects[e[0]];
      if (!E || !E[0] || E[2] === 2 || BLD_DMG[e[0]] || e[0] === 101) continue;
      other.push([src, fxText(e)]);
    }
  };
  const ids = [];
  for (const [k, lbl] of BLD_SLOTS) {
    const id = b.items[k]; if (!id) continue;
    const it = item(id); if (!it) continue;
    ids.push(id);
    addFx(it.fx, it.name);
    if (it.lvl > b.lvl) warns.push(`${it.name} demande le niveau ${it.lvl} (ton perso : ${b.lvl}).`);
  }
  // Doublons (même Dofus, ou même objet de panoplie deux fois)
  const seen = {};
  for (const id of ids) { if (seen[id] && (item(id).sup === 13 || item(id).set)) warns.push(`${item(id).name} est équipé deux fois : le jeu ne le permet pas.`); seen[id] = 1; }
  const wp = b.items.weapon && item(b.items.weapon);
  if (wp && (wp.flags & 8) && b.items.shield) warns.push(`${wp.name} se tient à deux mains : pas de bouclier possible.`);
  // Panoplies : nombre de pièces différentes équipées -> bonus[n - 1]
  const bySet = {};
  for (const id of new Set(ids)) { const s = item(id).set; if (s && D.core.sets[s]) (bySet[s] = bySet[s] || []).push(id); }
  for (const [s, list] of Object.entries(bySet)) {
    const S_ = D.core.sets[s], n = list.length, fx = S_[2][n - 1] || [];
    if (n < 2 && !fx.length) continue;
    sets.push({ id: +s, name: S_[0], n, max: S_[1].length, fx });
    addFx(fx, S_[0]);
  }
  for (const [k, v] of Object.entries(b.extra || {})) add(k, +v || 0);

  // Caractéristiques : points + parchemins + équipement
  const car = {};
  for (const [k, , , key] of BLD_CARS) {
    const base = +b.pts[k] || 0, scr = +b.scr[k] || 0, eq = t[key] || 0;
    car[k] = { base, scr, eq, tot: base + scr + eq };
  }
  const V = Object.assign({}, t), C = k => car[k].tot;
  for (const [k, , , key] of BLD_CARS) V[key] = C(k);
  V.c1 = 6 + (b.lvl >= 100 ? 1 : 0) + (t.c1 || 0);
  V.c23 = 3 + (t.c23 || 0);
  V.c19 = t.c19 || 0;
  V.pv = 50 + 5 * b.lvl + C("vit") + (t.vie || 0); delete V.vie;
  V.c44 = Math.max(0, C("str") + C("int") + C("cha") + C("agi") + (t.c44 || 0));
  V.c48 = 100 + (b.breed === 3 ? 20 : 0) + Math.floor(Math.max(0, C("cha")) / 10) + (t.c48 || 0);
  V.pods = 1000 + 5 * Math.max(0, C("str")) + (t.pods || 0);
  V.c26 = 1 + (t.c26 || 0);
  V.c79 = Math.floor(Math.max(0, C("agi")) / 10) + (t.c79 || 0);
  V.c78 = Math.floor(Math.max(0, C("agi")) / 10) + (t.c78 || 0);
  const w10 = Math.floor(Math.max(0, C("sag")) / 10);
  V.c27 = w10 + (t.c27 || 0); V.c28 = w10 + (t.c28 || 0); V.c82 = w10 + (t.c82 || 0); V.c83 = w10 + (t.c83 || 0);
  V.c18 = t.c18 || 0;
  return { t, V, car, sets, other, warns, ids };
}
// Stats utiles au calcul de dégâts, depuis un build calculé
function bldCS(V) {
  const g = id => V[bldKey(id)] || 0;
  return { str: V.c10 || 0, int: V.c15 || 0, cha: V.c13 || 0, agi: V.c14 || 0, pui: V.c17 || 0, dmg: V.c16 || 0, docrit: V.c86 || 0, crit: V.c18 || 0, soin: V.c49 || 0,
    del: { t: V.c88 || 0, f: V.c89 || 0, e: V.c90 || 0, a: V.c91 || 0, n: V.c92 || 0 },
    psort: g(2812), parme: g(2808), pmel: g(2800), pdist: g(2804) };
}

/* ---------- Dégâts (estimation) ---------- */
// Un coup : base -> ⌊base × (100 + carac + puissance) / 100⌋ + do + do élément (+ do crit), × % do sorts/armes, × % mêlée/distance, puis cible
function bldHit(base, el, cs, o) {
  if (el === "h") return Math.floor(base * Math.max(0, 100 + cs.int) / 100) + cs.soin;
  const E = BLD_EL.find(x => x[0] === el);
  let v = Math.floor(base * Math.max(0, 100 + cs[E[2]] + cs.pui) / 100) + cs.dmg + cs.del[el] + (o.crit ? cs.docrit : 0);
  v = Math.floor(v * Math.max(0, 100 + (o.kind === "arme" ? cs.parme : cs.psort)) / 100);
  v = Math.floor(v * Math.max(0, 100 + (o.mel ? cs.pmel : cs.pdist)) / 100);
  if (o.tgt) {
    v -= (+o.tgt.f?.[el] || 0) + (o.crit ? (+o.tgt.c || 0) : 0);
    v = Math.floor(v * (100 - (+o.tgt.p?.[el] || 0)) / 100);
  }
  return Math.max(0, v);
}
const bldBest = cs => BLD_EL.reduce((best, E) => (cs[E[2]] + cs.del[E[0]] > cs[best[2]] + cs.del[best[0]] ? E : best), BLD_EL[0])[0];
const bldRange = (a, b) => (a === b ? fmt(a) : `${fmt(a)} à ${fmt(b)}`);
const bldElName = el => el === "h" ? "Soins" : (BLD_EL.find(x => x[0] === el) || [0, "?"])[1];

/* ---------- Page Builds ---------- */
page("builds", {
  title: "Builds", icon: 23002, needs: ["spells"],
  intro: "Équipe ton perso, répartis tes points et vois tes totaux : PA, PM, PV, caractéristiques, dommages, résistances et panoplies.",
  render(el) { bldDraw(bldRoot(el)); },
});

// Conteneur propre à la page (les gestionnaires d'événements ne restent pas sur #view)
function bldRoot(el) { const r = document.createElement("div"); r.className = "stack"; el.appendChild(r); return r; }

function bldDraw(el) {
  const b = bldCur();
  const list = S.builds.map(x => `<button type="button" class="card" data-act="pick" data-id="${esc(x.id)}" ${x.id === b?.id ? 'style="border-color:var(--sec);background:var(--sec-soft)"' : ""}>
      ${icon(Object.values(x.items || {})[0] || 0, "s")}<span class="t"><span class="nm">${esc(x.name)}</span><small>${esc(bldBreedName(x.breed))} · niv. ${+x.lvl || 1} · ${plural(Object.keys(x.items || {}).length, "pièce")}</small></span></button>`).join("");
  let html = hero("builds") + `<section class="panel"><div class="row between"><h2>Mes builds</h2><div class="row">
      <button class="btn primary sm" data-act="new">＋ Nouveau build</button>${b ? `<button class="btn sm" data-act="dup">Dupliquer</button><button class="btn sm" data-act="del">Supprimer</button>` : ""}</div></div>
    ${S.builds.length ? `<div class="cards">${list}</div>` : `<div class="empty"><strong>Aucun build pour l'instant</strong><span>Crée ton premier build : choisis ta classe, ton niveau, puis équipe chaque case.</span><button class="btn primary" data-act="new">Créer un build</button></div>`}
  </section>`;
  if (b) html += bldEditor(b);
  el.innerHTML = html;
  bldBind(el);
}

function bldEditor(b) {
  const R = bldCalc(b), cap = bldCapital(b);
  const breeds = bldBreeds().map(([id, n]) => `<option value="${id}" ${id === b.breed ? "selected" : ""}>${esc(n)}</option>`).join("");
  const perso = `<section class="panel"><h2>Personnage</h2>
    <div class="filters">
      <label class="fld grow" style="flex:1 1 200px">Nom du build<input type="text" data-f="name" value="${esc(b.name)}" maxlength="60"></label>
      <label class="fld">Classe<select data-f="breed">${breeds}</select></label>
      <label class="fld">Niveau<input type="number" class="sm" data-f="lvl" min="1" max="200" value="${b.lvl}"></label>
    </div>
    <div class="seg" role="group" aria-label="Sexe"><button type="button" data-act="sex" data-v="0" aria-pressed="${!b.sex}">Homme</button><button type="button" data-act="sex" data-v="1" aria-pressed="${!!b.sex}">Femme</button></div>
    ${R.warns.length ? `<div class="chips">${R.warns.map(w => `<span class="chip warn">⚠ ${esc(w)}</span>`).join("")}</div>` : ""}
  </section>`;

  // Poupée
  const doll = BLD_SLOTS.map(([k, lbl]) => {
    const it = b.items[k] && item(b.items[k]);
    const on = BLD_SLOT === k ? ' style="outline:2.5px solid var(--sec);outline-offset:1px"' : "";
    if (!it) return `<button type="button" class="slot" data-act="slot" data-slot="${k}"${on}><span style="font-size:1.6rem;line-height:40px;color:var(--muted)">＋</span><small>${esc(lbl)}</small></button>`;
    const warn = it.lvl > b.lvl ? `<small class="neg">⚠ niv. ${it.lvl}</small>` : `<small>niv. ${it.lvl}</small>`;
    return `<button type="button" class="slot full" data-act="slot" data-slot="${k}"${on} title="${esc(lbl)}">${icon(it.id)}<span class="nm">${esc(it.name)}</span>${warn}</button>`;
  }).join("");
  const equip = `<section class="panel"><div class="row between"><h2>Équipement</h2>${Object.keys(b.items).length ? `<button class="btn sm" data-act="clear">Tout retirer</button>` : ""}</div>
    <p class="muted small">Touche une case pour choisir ou retirer un objet. Jets comptés au maximum.</p>
    <div class="doll">${doll}</div>${BLD_SLOT ? bldPicker(b) : ""}</section>`;

  // Points de caractéristiques
  const costs = D.spells.breeds[b.breed][2] || {};
  const pts = BLD_CARS.map(car => {
    const [k, name, ck] = car, v = +b.pts[k] || 0, c = R.car[k];
    const next = bldCost(costs[ck], v, v + 1);
    return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--sunk)"><div style="flex:1 1 150px;min-width:0"><b>${esc(name)}</b> <span class="num">${fmt(c.tot)}</span><br><small class="muted">${fmt(bldCost(costs[ck], 0, v))} capital investi · point suivant : ${next}</small></div>
      <div class="row" style="gap:4px"><button class="btn sm" data-act="pt" data-k="${k}" data-d="-1" aria-label="Retirer un point en ${esc(name)}">−</button>
        <input type="number" class="sm" data-f="pt" data-k="${k}" min="0" value="${v}" aria-label="Points en ${esc(name)}">
        <button class="btn sm" data-act="pt" data-k="${k}" data-d="1" aria-label="Ajouter un point en ${esc(name)}">＋</button>
        <button class="btn sm" data-act="ptmax" data-k="${k}" title="Mettre tout le capital restant">Max</button></div>
      <label class="fld">Parcho<input type="number" class="sm" data-f="scr" data-k="${k}" min="0" max="100" value="${+b.scr[k] || 0}"></label></div>`;
  }).join("");
  const capCls = cap.left < 0 ? "chip warn" : cap.left > 0 ? "chip sec" : "chip up";
  const ptsPanel = `<section class="panel"><div class="row between"><h2>Caractéristiques</h2><button class="btn sm" data-act="ptreset">Remettre à zéro</button></div>
    <div class="chips"><span class="${capCls}">Capital : ${fmt(cap.used)} / ${fmt(cap.total)} · reste ${fmt(cap.left)}</span><span class="chip">5 points par niveau</span></div>
    ${cap.left < 0 ? `<p class="neg small">Tu dépasses ton capital de ${fmt(-cap.left)} points.</p>` : ""}
    <div style="display:grid">${pts}</div>
    <p class="muted small">Les paliers de coût dépendent des points déjà investis dans la caractéristique. Les parchemins (0 à 100) s'ajoutent gratuitement.</p></section>`;

  return `<div class="grid2"><div class="stack">${perso}${equip}${ptsPanel}${bldExtraPanel(b)}</div>
    <div class="stack">${bldStatsPanel(b, R)}${bldSetsPanel(R)}${bldWeaponPanel(b, R)}${bldCondPanel(b, R)}${bldExportPanel(b)}</div></div>`;
}

// Sélecteur d'objet pour la case ouverte
function bldPicker(b) {
  const slot = BLD_SLOTS.find(s => s[0] === BLD_SLOT); if (!slot) return "";
  const [k, lbl, sups] = slot, cur = b.items[k] && item(b.items[k]);
  if (!BLD_BYSUP) { BLD_BYSUP = {}; for (const id of Object.keys(D.core.items)) { const it = item(id); if (it && it.name) (BLD_BYSUP[it.sup] = BLD_BYSUP[it.sup] || []).push(it.id); } }
  const sugg = sups.flatMap(s => BLD_BYSUP[s] || []).map(item).filter(it => it.lvl <= b.lvl && it.type !== 99)
    .sort((x, y) => y.lvl - x.lvl || x.name.localeCompare(y.name)).slice(0, 20);
  const noun = BLD_SLOT_NOUN[k] || BLD_SLOT_NOUN[k.replace(/\d$/, "1")] || "un objet";
  return `<div class="panel" style="box-shadow:none;background:var(--bg);margin-top:4px">
    <div class="row between"><h3>${esc(lbl)}</h3><button class="x" data-act="close" aria-label="Fermer">✕</button></div>
    ${cur ? `<div class="li">${itemLine(cur.id)}<div class="r">${cur.lvl > b.lvl ? `<span class="chip warn">⚠ niveau ${cur.lvl}</span>` : ""}<button class="btn sm" data-act="unequip">Retirer</button></div></div>` : ""}
    <div class="search"><input type="search" id="bld-q" placeholder="Chercher ${esc(noun)}…" autocomplete="off" aria-label="Chercher ${esc(noun)}"></div>
    <div class="label">Jusqu'au niveau ${b.lvl}, du plus haut au plus bas</div>
    <div class="list">${sugg.map(it => `<div class="li">${itemLine(it.id)}<div class="r"><button class="btn sm" data-act="equip" data-id="${it.id}">Équiper</button></div></div>`).join("") || `<p class="muted small">Aucun objet de ce type à ce niveau.</p>`}</div>
  </div>`;
}

function bldStatsPanel(b, R) {
  const V = R.V, car = R.car, shown = new Set();
  const st = (k, alwaysShow, title = "") => {
    shown.add(k);
    const v = V[k] || 0;
    if (!v && !alwaysShow) return "";
    return `<div class="stat"${title ? ` title="${esc(title)}"` : ""}><span>${esc(bldLabel(k))}</span><b class="${v < 0 ? "neg" : ""}">${fmt(v)}</b></div>`;
  };
  const carT = k => { const c = car[k]; return `${fmt(c.base)} points + ${fmt(c.scr)} parcho + ${fmt(c.eq)} équipement`; };
  const tkeys = Object.keys(V).filter(k => k.startsWith("t:"));
  const grp = (name, html) => html ? `<div class="label">${esc(name)}</div><div class="stats">${html}</div>` : "";
  const prim = ["pv", "c1", "c23", "c19", "c44", "c48", "c26", "c18", "pods"].map(k => st(k, true)).join("");
  const cars = BLD_CARS.map(([k, , , key]) => st(key, true, carT(k))).join("") + st("c17", true);
  const dmg = ["c16", "c88", "c89", "c90", "c91", "c92", "c86", "c84", "c49", "c69", "c70"].map(k => st(k)).join("") + tkeys.filter(k => /Dommages/.test(k)).map(k => st(k)).join("");
  const res = ["c33", "c34", "c35", "c36", "c37", "c54", "c55", "c56", "c57", "c58", "c87", "c85", "c59", "c60", "c61", "c62", "c63", "c64", "c65", "c66", "c67", "c68"].map(k => st(k)).join("")
    + tkeys.filter(k => /Résistance/.test(k)).map(k => st(k)).join("");
  const misc = ["c79", "c78", "c27", "c28", "c82", "c83"].map(k => st(k, true)).join("")
    + Object.keys(V).filter(k => !shown.has(k)).map(k => st(k)).join("");
  return `<section class="panel"><h2>Totaux</h2>
    <p class="muted small">Équipement (jets max), panoplies, points, parchemins et bonus en plus. Bases : ${b.lvl >= 100 ? 7 : 6} PA, 3 PM, PV = 50 + 5 × niveau + Vitalité, Tacle et Fuite = Agilité ÷ 10, Esquive et Retrait = Sagesse ÷ 10.</p>
    ${grp("Primaires", prim)}${grp("Caractéristiques", cars)}${grp("Dommages", dmg)}${grp("Résistances", res)}${grp("Divers", misc)}</section>`;
}

function bldSetsPanel(R) {
  if (!R.sets.length) return "";
  return `<section class="panel"><h2>Panoplies</h2><div class="list">${R.sets.map(s => `<div style="display:grid;gap:6px;padding:6px 0;border-bottom:1px solid var(--sunk)">
      <div class="row between"><b>${esc(s.name)}</b><span class="chip ${s.n >= s.max ? "up" : "sec"}">${s.n} / ${s.max} pièces</span></div>
      ${s.fx.length ? fxList(s.fx) : `<p class="muted small">Pas de bonus avec ${s.n} pièce${s.n > 1 ? "s" : ""}.</p>`}</div>`).join("")}</div></section>`;
}

function bldWeaponPanel(b, R) {
  const it = b.items.weapon && item(b.items.weapon);
  if (!it) return "";
  const w = it.wp || [], cs = bldCS(R.V), mel = !(w[2] > 1);
  const chips = [w[0] && `${w[0]} PA`, w[2] != null && `Portée ${w[1] || 0}${w[2] !== w[1] ? "–" + w[2] : ""}`, w[3] && `Critique ${w[3]} %`, w[4] && `+${w[4]} en critique`,
    w[5] && `${w[5]} par tour`, w[6] && "En ligne", (it.flags & 8) && "Deux mains"].filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join("");
  const lines = (it.fx || []).filter(e => BLD_DMG[e[0]] || e[0] === 101).map(e => {
    let el = BLD_DMG[e[0]];
    if (!el) return `<li>${esc(fxText(e))}</li>`;
    if (el === "b") el = bldBest(cs);
    const lo = e[1] || 0, hi = e[2] || lo, cb = el === "h" ? 0 : (w[4] || 0);
    const n = [bldHit(lo, el, cs, { kind: "arme", mel }), bldHit(hi, el, cs, { kind: "arme", mel })];
    const c = [bldHit(lo + cb, el, cs, { kind: "arme", mel, crit: 1 }), bldHit(hi + cb, el, cs, { kind: "arme", mel, crit: 1 })];
    return `<li class="dmg">${esc(fxText(e))} <span class="muted">→</span> <b class="dmg">${bldRange(...n)}</b>${w[3] ? ` <span class="muted">· critique</span> <b class="dmg">${bldRange(...c)}</b>` : ""}${BLD_STEAL.has(e[0]) ? ` <span class="muted small">(soigne la moitié)</span>` : ""}</li>`;
  }).join("");
  return `<section class="panel"><h2>Arme</h2>${itemLine(it.id)}<div class="chips">${chips}</div>
    ${lines ? `<ul class="fx">${lines}</ul>` : `<p class="muted small">Pas de ligne de dégâts.</p>`}
    <p class="muted small">Estimation avec tes totaux, sans résistances de la cible (${mel ? "corps à corps" : "à distance"}).</p></section>`;
}

// Conditions des objets : traduction simple et vérification des conditions sans « ou »
function bldCondTxt(raw) {
  return String(raw).replace(/\s+/g, "").replace(/([A-Za-z]{2})([<>=!~])([^&|()]+)/g, (m, c, op, v) => {
    const C = BLD_CRIT[c.toUpperCase()], o = { ">": ">", "<": "<", "=": "=", "!": "≠", "~": "≈" }[op];
    if (!C || !/^\d+$/.test(v)) return m;
    return `${C[0]}${c !== c.toUpperCase() && C[1] !== "lvl" ? " de base" : ""} ${o} ${v}`;
  }).replace(/&/g, " et ").replace(/\|/g, " ou ");
}
function bldCondCheck(raw, b, R) {
  if (!raw || /\|/.test(raw)) return null;
  const bad = [];
  for (const m of String(raw).matchAll(/([A-Za-z]{2})([<>=!])(\d+)/g)) {
    const C = BLD_CRIT[m[1].toUpperCase()]; if (!C) continue;
    const lower = m[1] !== m[1].toUpperCase();
    const val = C[1] === "lvl" ? b.lvl : C[1] === "pa" ? R.V.c1 : C[1] === "pm" ? R.V.c23 : lower ? R.car[C[1]].base + R.car[C[1]].scr : R.car[C[1]].tot;
    const n = +m[3], ok = m[2] === ">" ? val > n : m[2] === "<" ? val < n : m[2] === "=" ? val === n : val !== n;
    if (!ok) bad.push(`${C[0]} : ${fmt(val)}`);
  }
  return bad;
}
function bldCondPanel(b, R) {
  const rows = [];
  for (const [k, lbl] of BLD_SLOTS) {
    const it = b.items[k] && item(b.items[k]);
    if (!it || !it.crit) continue;
    const bad = bldCondCheck(it.crit, b, R);
    rows.push(`<div class="li"><div style="min-width:0">${itemLine(it.id, esc(lbl))}<div class="small" style="overflow-wrap:anywhere">${esc(bldCondTxt(it.crit))}</div></div>
      <div class="r">${bad == null ? `<span class="chip">à vérifier en jeu</span>` : bad.length ? `<span class="chip warn">⚠ non remplie (${esc(bad.join(", "))})</span>` : `<span class="chip up">remplie</span>`}</div></div>`);
  }
  const other = R.other.length ? `<div class="label">Effets particuliers</div><ul class="fx">${R.other.map(([src, t]) => `<li>${esc(t)} <span class="muted small">· ${esc(src)}</span></li>`).join("")}</ul>` : "";
  if (!rows.length && !other) return "";
  return `<section class="panel"><h2>Conditions et effets particuliers</h2>
    ${rows.length ? `<details ${rows.length < 4 ? "open" : ""}><summary class="label" style="cursor:pointer">Conditions d'équipement (${rows.length})</summary><div class="list">${rows.join("")}</div>
      <p class="muted small">Vérification simple (caractéristiques, niveau) ; les conditions avec « ou » ou d'autres critères sont à vérifier en jeu.</p></details>` : ""}
    ${other}</section>`;
}

// Bonus saisis à la main : familier nourri, exos, forgemagie…
function bldExtraKeys() {
  const ks = ["c1", "c23", "c19", "c11", "c12", "c10", "c15", "c13", "c14", "c17", "c16", "c18", "c44", "c48", "c49", "c26", "c88", "c89", "c90", "c91", "c92", "c86", "c84",
    "c33", "c34", "c35", "c36", "c37", "c54", "c55", "c56", "c57", "c58", "c87", "c85", "c79", "c78", "c27", "c28", "c82", "c83", "pods", "vie"];
  for (const id of [2812, 2808, 2804, 2800, 2807, 2803]) { const k = bldFxKey(id)?.[0]; if (k) ks.push(k); }
  return ks;
}
function bldExtraPanel(b) {
  const ex = Object.entries(b.extra || {});
  const opts = bldExtraKeys().map(k => `<option value="${esc(k)}">${esc(bldLabel(k))}</option>`).join("");
  return `<section class="panel"><h2>Bonus en plus</h2>
    <p class="muted small">Pour ce que l'atelier ne connaît pas : familier nourri, exos et forgemagie, bonus de classe…</p>
    ${ex.length ? `<div class="chips">${ex.map(([k, v]) => `<span class="chip sec">${+v > 0 ? "+" : ""}${fmt(+v)} ${esc(bldLabel(k))} <button class="link" data-act="exdel" data-k="${esc(k)}" aria-label="Retirer ce bonus">✕</button></span>`).join("")}</div>` : ""}
    <div class="filters"><label class="fld">Caractéristique<select id="bld-exk">${opts}</select></label>
      <label class="fld">Valeur<input type="number" class="sm" id="bld-exv" value="1"></label>
      <button class="btn sm" data-act="exadd" style="align-self:end">Ajouter</button></div></section>`;
}

function bldExportPanel(b) {
  return `<details class="panel"><summary>Exporter, importer, copier</summary>
    <p class="muted small">Copie ce texte pour sauvegarder ou partager ce build ; colle un texte de build plus bas pour l'importer.</p>
    <textarea readonly id="bld-out" aria-label="Build au format texte">${esc(JSON.stringify(bldExport(b)))}</textarea>
    <div class="row"><button class="btn sm" data-act="copyjson">Copier le build</button><button class="btn sm" data-act="copysum">Copier le résumé</button></div>
    <label class="fld">Importer un build<textarea id="bld-in" placeholder='{"name":"…","breed":8,"lvl":200,"items":{…}}'></textarea></label>
    <div class="row"><button class="btn sm primary" data-act="import">Importer comme nouveau build</button></div></details>`;
}
const bldExport = b => ({ app: "atelier-touch", name: b.name, breed: b.breed, sex: b.sex, lvl: b.lvl, items: b.items, pts: b.pts, scr: b.scr, extra: b.extra });
function bldSummary(b) {
  const R = bldCalc(b), V = R.V, L = [];
  L.push(`${b.name} — ${bldBreedName(b.breed)} niveau ${b.lvl}`);
  L.push(`PA ${V.c1} · PM ${V.c23} · PO ${V.c19} · PV ${fmt(V.pv)} · Initiative ${fmt(V.c44)} · Prospection ${fmt(V.c48)} · Critique ${fmt(V.c18)} %`);
  L.push(BLD_CARS.map(([k, n]) => `${n} ${fmt(R.car[k].tot)}`).join(" · ") + ` · Puissance ${fmt(V.c17 || 0)} · Dommages ${fmt(V.c16 || 0)}`);
  const res = BLD_EL.map(E => `${E[1]} ${fmt(V[E[4]] || 0)} %`).join(", ");
  L.push(`Résistances : ${res}`);
  L.push("", "Équipement :");
  for (const [k, lbl] of BLD_SLOTS) { const it = b.items[k] && item(b.items[k]); if (it) L.push(`- ${lbl} : ${it.name} (niv. ${it.lvl})`); }
  if (R.sets.length) L.push("", "Panoplies : " + R.sets.map(s => `${s.name} (${s.n}/${s.max})`).join(", "));
  L.push("", "Fait avec l'Atelier Touch");
  return L.join("\n");
}
async function bldCopy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { toast("Copie impossible : sélectionne le texte et copie-le à la main."); }
}

function bldBind(el) {
  const b = bldCur();
  const redraw = () => { save(); const y = scrollY; bldDraw(el); scrollTo(0, y); };
  el.onclick = e => {
    const a = e.target.closest("[data-act]"); if (!a || !el.contains(a)) return;
    const act = a.dataset.act;
    if (act === "new") { const n = bldNew(b ? { breed: b.breed, lvl: b.lvl, sex: b.sex } : {}); S.builds.push(n); S.ui.bld = n.id; BLD_SLOT = null; redraw(); toast("Build créé"); return; }
    if (act === "pick") { S.ui.bld = a.dataset.id; BLD_SLOT = null; redraw(); return; }
    if (!b) return;
    if (act === "dup") { const n = bldNew(JSON.parse(JSON.stringify(b))); n.name = b.name + " (copie)"; S.builds.push(n); S.ui.bld = n.id; redraw(); toast("Build dupliqué"); }
    else if (act === "del") { if (!confirm(`Supprimer le build « ${b.name} » ?`)) return; S.builds = S.builds.filter(x => x !== b); S.ui.bld = S.builds[0]?.id; BLD_SLOT = null; redraw(); }
    else if (act === "sex") { b.sex = +a.dataset.v; redraw(); }
    else if (act === "slot") { BLD_SLOT = BLD_SLOT === a.dataset.slot ? null : a.dataset.slot; redraw(); if (BLD_SLOT && matchMedia("(pointer: fine)").matches) $("#bld-q", el)?.focus({ preventScroll: true }); }
    else if (act === "close") { BLD_SLOT = null; redraw(); }
    else if (act === "equip") { bldEquip(b, BLD_SLOT, +a.dataset.id); redraw(); }
    else if (act === "unequip") { delete b.items[BLD_SLOT]; BLD_SLOT = null; redraw(); }
    else if (act === "clear") { if (confirm("Retirer tout l'équipement de ce build ?")) { b.items = {}; BLD_SLOT = null; redraw(); } }
    else if (act === "pt") { const k = a.dataset.k; b.pts[k] = Math.max(0, (+b.pts[k] || 0) + +a.dataset.d); redraw(); }
    else if (act === "ptmax") { const car = BLD_CARS.find(c => c[0] === a.dataset.k); const n = bldMaxAdd(b, car); if (!n) { toast("Plus assez de capital."); return; } b.pts[car[0]] = (+b.pts[car[0]] || 0) + n; redraw(); }
    else if (act === "ptreset") { b.pts = {}; redraw(); }
    else if (act === "exadd") { const k = $("#bld-exk", el).value, v = +$("#bld-exv", el).value || 0; if (!v) return; b.extra[k] = (+b.extra[k] || 0) + v; if (!b.extra[k]) delete b.extra[k]; redraw(); }
    else if (act === "exdel") { delete b.extra[a.dataset.k]; redraw(); }
    else if (act === "copyjson") bldCopy(JSON.stringify(bldExport(b)), "Build copié");
    else if (act === "copysum") bldCopy(bldSummary(b), "Résumé copié");
    else if (act === "import") {
      let o; try { o = JSON.parse($("#bld-in", el).value); } catch { toast("Texte illisible : colle le texte complet d'un build."); return; }
      if (!o || typeof o !== "object" || !o.items) { toast("Ce texte ne contient pas de build."); return; }
      const n = bldFix(bldNew({ name: String(o.name || "Build importé").slice(0, 60), breed: o.breed, lvl: o.lvl, sex: o.sex, items: o.items, pts: o.pts, scr: o.scr, extra: o.extra }));
      S.builds.push(n); S.ui.bld = n.id; redraw(); toast("Build importé");
    }
  };
  el.onchange = e => {
    const f = e.target.closest("[data-f]"); if (!f || !b) return;
    const v = f.value, k = f.dataset.k;
    if (f.dataset.f === "name") b.name = v.trim().slice(0, 60) || b.name;
    else if (f.dataset.f === "breed") { const old = bldBreedName(b.breed); b.breed = +v; if (b.name.startsWith(old)) b.name = bldBreedName(b.breed) + b.name.slice(old.length); S.settings.breed = b.breed; }
    else if (f.dataset.f === "lvl") b.lvl = clamp(Math.round(+v || 1), 1, 200);
    else if (f.dataset.f === "pt") b.pts[k] = Math.max(0, Math.round(+v || 0));
    else if (f.dataset.f === "scr") b.scr[k] = clamp(Math.round(+v || 0), 0, 100);
    redraw();
  };
  const q = $("#bld-q", el);
  if (q && b && BLD_SLOT) {
    const sups = BLD_SLOTS.find(s => s[0] === BLD_SLOT)[2];
    searchBox(q, id => { bldEquip(b, BLD_SLOT, id); redraw(); }, { filter: it => it && sups.includes(it.sup) && it.type !== 99 });
  }
}
function bldEquip(b, slot, id) {
  const it = item(id); if (!it || !slot) return;
  // Un anneau ou un Dofus va dans la première case libre du même genre si la case ouverte est occupée par un autre
  b.items[slot] = id;
  if ((it.flags & 8) && slot === "weapon" && b.items.shield) toast(`${it.name} se tient à deux mains : retire le bouclier.`);
  else toast(`${it.name} équipé`);
  BLD_SLOT = null;
}

/* ---------- Page Sorts ---------- */
page("sorts", {
  title: "Sorts", icon: 23006, needs: ["spells"],
  intro: "Les sorts de chaque classe au rang accessible à ton niveau, avec une estimation des dégâts selon ton build et la cible.",
  render(el) { spDraw(bldRoot(el)); },
});

function spState() {
  const cur = bldCur();
  if (S.ui.spBreed == null || !D.spells.breeds[S.ui.spBreed]) S.ui.spBreed = cur ? cur.breed : (+S.settings.breed || 8);
  if (!D.spells.breeds[S.ui.spBreed]) S.ui.spBreed = 8;
  if (S.ui.spLvl == null) S.ui.spLvl = cur ? cur.lvl : (+S.settings.lvl || 200);
  if (S.ui.spSrc == null) S.ui.spSrc = cur ? cur.id : "m";
  if (S.ui.spSrc !== "m" && !S.builds.find(x => x.id === S.ui.spSrc)) S.ui.spSrc = "m";
  S.ui.spMan = Object.assign({ str: 0, int: 0, cha: 0, agi: 0, pui: 0, dmg: 0, del: 0, docrit: 0, crit: 0, psort: 0, soin: 0 }, S.ui.spMan || {});
  S.ui.spTgt = Object.assign({ on: false, p: {}, f: {}, c: 0 }, S.ui.spTgt || {});
  S.ui.spTgt.p = S.ui.spTgt.p || {}; S.ui.spTgt.f = S.ui.spTgt.f || {};
  if (!S.ui.spRng) S.ui.spRng = "auto";
}
// Stats du calcul : build choisi ou saisie à la main
function spCS() {
  if (S.ui.spSrc !== "m") { const b = S.builds.find(x => x.id === S.ui.spSrc); if (b) return bldCS(bldCalc(bldFix(b)).V); }
  const m = S.ui.spMan, d = +m.del || 0;
  return { str: +m.str || 0, int: +m.int || 0, cha: +m.cha || 0, agi: +m.agi || 0, pui: +m.pui || 0, dmg: +m.dmg || 0, docrit: +m.docrit || 0, crit: +m.crit || 0,
    soin: +m.soin || 0, del: { t: d, f: d, e: d, a: d, n: d }, psort: +m.psort || 0, parme: 0, pmel: 0, pdist: 0 };
}

const SP_MAN = [["str", "Force"], ["int", "Intelligence"], ["cha", "Chance"], ["agi", "Agilité"], ["pui", "Puissance"], ["dmg", "Dommages"],
  ["del", "Do élémentaires"], ["docrit", "Do critiques"], ["crit", "% Critique"], ["psort", "% do sorts"], ["soin", "Soins"]];

function spDraw(el) {
  spState();
  const bid = S.ui.spBreed, br = D.spells.breeds[bid], lvl = clamp(+S.ui.spLvl || 1, 1, 200);
  const q = norm(S.ui.spQ || "");
  const breeds = bldBreeds().map(([id, n]) => `<option value="${id}" ${id === +bid ? "selected" : ""}>${esc(n)}</option>`).join("");
  const srcs = `<option value="m" ${S.ui.spSrc === "m" ? "selected" : ""}>Saisie à la main</option>` + S.builds.map(x => `<option value="${esc(x.id)}" ${x.id === S.ui.spSrc ? "selected" : ""}>Build : ${esc(x.name)}</option>`).join("");
  const man = S.ui.spSrc === "m" ? `<div class="filters">${SP_MAN.map(([k, n]) => `<label class="fld">${esc(n)}<input type="number" class="sm" data-man="${k}" value="${+S.ui.spMan[k] || 0}"></label>`).join("")}</div>` : spBuildChips();
  const T = S.ui.spTgt;
  const tgt = `<label class="check"><input type="checkbox" data-sp="tgton" ${T.on ? "checked" : ""}> Tenir compte des résistances de la cible</label>
    ${T.on ? `<div class="filters">${BLD_EL.map(E => `<label class="fld">% rés. ${esc(E[1])}<input type="number" class="sm" data-tp="${E[0]}" value="${+T.p[E[0]] || 0}"></label>`).join("")}</div>
      <div class="filters">${BLD_EL.map(E => `<label class="fld">Rés. fixe ${esc(E[1])}<input type="number" class="sm" data-tf="${E[0]}" value="${+T.f[E[0]] || 0}"></label>`).join("")}
      <label class="fld">Rés. critiques<input type="number" class="sm" data-tc="1" value="${+T.c || 0}"></label></div>` : ""}`;
  const rng = `<div class="seg" role="group" aria-label="Portée de l'attaque">${[["auto", "Selon le sort"], ["mel", "Corps à corps"], ["dist", "À distance"]].map(([k, n]) =>
    `<button type="button" data-rng="${k}" aria-pressed="${S.ui.spRng === k}">${n}</button>`).join("")}</div>`;

  const cs = spCS(), ids = (br[3] || []).filter(id => D.spells.spells[id]);
  const cards = ids.filter(id => !q || norm(D.spells.spells[id][0]).includes(q)).map(id => spCard(id, lvl, cs)).join("");
  el.innerHTML = hero("sorts") + `<section class="panel"><h2>Classe</h2>
      <div class="filters"><label class="fld">Classe<select data-sp="breed">${breeds}</select></label>
        <label class="fld">Niveau<input type="number" class="sm" data-sp="lvl" min="1" max="200" value="${lvl}"></label>
        <div class="search" style="flex:1 1 200px;align-self:end"><input type="search" data-sp="q" placeholder="Filtrer les sorts…" value="${esc(S.ui.spQ || "")}" aria-label="Filtrer les sorts"></div></div>
      <p class="muted small">${esc(br[1] || "")}</p></section>
    <details class="panel" ${S.ui.spCalcOpen !== false ? "open" : ""} data-sp="calc"><summary>Calcul des dégâts</summary>
      <p class="muted small">Estimation : ⌊base × (100 + caractéristique + puissance) ÷ 100⌋ + dommages + do de l'élément (+ do critiques en critique), × (100 + % do sorts) ÷ 100, × % do mêlée ou distance, puis résistances fixes et en % de la cible. Les effets propres aux sorts (cumuls, états, érosion, boucliers) ne sont pas simulés.</p>
      <div class="filters"><label class="fld" style="flex:1 1 220px">Stats utilisées<select data-sp="src">${srcs}</select></label></div>
      ${man}${rng}${tgt}</details>
    <section class="panel"><div class="row between"><h2>Sorts ${esc(br[0])}</h2><span class="chip">${plural(ids.length, "sort")}</span></div>
      <div class="stack" style="gap:10px">${cards || `<p class="muted">Aucun sort ne correspond.</p>`}</div></section>`;
  spBind(el);
}
function spBuildChips() {
  const b = S.builds.find(x => x.id === S.ui.spSrc); if (!b) return "";
  const cs = spCS();
  const c = [["Force", cs.str], ["Intelligence", cs.int], ["Chance", cs.cha], ["Agilité", cs.agi], ["Puissance", cs.pui], ["Dommages", cs.dmg], ["Do critiques", cs.docrit], ["% Critique", cs.crit],
    ["% do sorts", cs.psort], ["Soins", cs.soin], ...BLD_EL.map(E => ["Do " + E[1], cs.del[E[0]]])].filter(x => x[1]);
  return `<div class="chips">${c.map(([n, v]) => `<span class="chip sec">${esc(n)} ${fmt(v)}</span>`).join("") || `<span class="chip">Build sans bonus</span>`}<a class="chip" href="#builds">Modifier le build</a></div>`;
}

// Rang accessible : le plus haut dont le niveau requis est atteint
function spRankAt(sp, lvl) { let r = -1; sp[3].forEach((L, i) => { if (L[0] <= lvl) r = i; }); return r; }
const spRangeTxt = L => `${L[2] !== L[3] ? `${L[2]}–${L[3]}` : L[3]} PO${L[8] ? " (modifiable)" : ""}`;
function spChips(L) {
  return [`${L[1]} PA`, spRangeTxt(L), L[4] ? `Critique ${L[4]} %` : "Pas de critique", L[5] ? `Relance ${plural(L[5], "tour")}` : "", L[13] ? `1er lancer après ${plural(L[13], "tour")}` : "",
    L[6] ? `${L[6]} par tour` : "", L[7] ? `${L[7]} par cible` : "", L[9] ? "En ligne" : "", L[10] ? "Ligne de vue" : "Sans ligne de vue", L[14] ? "Case libre" : ""]
    .filter(Boolean).map(x => `<span class="chip">${esc(x)}</span>`).join("");
}
// Texte d'un effet de sort : états, sorts et invocations nommés, durée, zone
const SP_ZONE = { C: "cercle", X: "croix", L: "ligne", T: "ligne perpendiculaire", G: "carré", O: "anneau", D: "damier", "+": "croix en diagonale" };
function spFxTxt(e) {
  const E = D.core.effects[e[0]];
  if (!E || !E[0]) return "";
  const tpl = E[0];
  let t;
  if (e[0] === 950 || e[0] === 951) t = (e[0] === 950 ? "État " : "Enlève l'état ") + String(D.spells.states[e[3]] || e[3]).replace(/<[^>]+>/g, "");
  else if (tpl.trim() === "#1") { const s = D.spells.spells[e[1]]; if (!s) return ""; t = `Lance « ${s[0]} »`; }
  else t = fxText(e);
  const sid = /sort #1/.test(tpl) ? e[1] : /sort #3/.test(tpl) ? e[3] : 0;
  if (sid && D.spells.spells[sid]) t = t.replace(new RegExp("\\b" + sid + "\\b"), `« ${D.spells.spells[sid][0]} »`);
  if (/^Invoque : #1/.test(tpl)) { const m = D.monsters?.monsters[e[1]]; if (m) t = "Invoque : " + m[0]; }
  if (e[4] > 0) t += ` (${plural(e[4], "tour")})`; else if (e[4] < 0) t += " (tout le combat)";
  const z = /^([CXLTGOD+])(\d+)/.exec(e[5] || "");
  if (z && +z[2] > 0) t += +z[2] >= 63 ? " · zone : tout le terrain" : ` · zone : ${SP_ZONE[z[1]]} de taille ${z[2]}`;
  if (/(^|,)\*?[eE]\d/.test(e[6] || "")) t += " · sous condition";
  return t;
}
function spFxList(fx) {
  const li = (fx || []).filter(e => !e[8]).map(e => [e, spFxTxt(e)]).filter(x => x[1]).map(([e, t]) => {
    const cls = BLD_DMG[e[0]] ? "dmg" : fxIsNeg(e) ? "neg" : "";
    return `<li class="${cls}">${esc(t)}</li>`;
  });
  return li.length ? `<ul class="fx">${li.join("")}</ul>` : `<p class="muted small">Aucun effet visible.</p>`;
}
// Lignes de dégâts estimés d'un rang de sort
function spDmgLines(L, cs) {
  const tgt = S.ui.spTgt.on ? S.ui.spTgt : null;
  const mel = S.ui.spRng === "mel" || (S.ui.spRng === "auto" && !(L[3] > 1));
  const pc = L[4] > 0 ? Math.min(100, L[4] + cs.crit) / 100 : 0;
  const used = {};
  return L[11].filter(e => BLD_DMG[e[0]] && !e[8]).map(e => {
    used[e[0]] = (used[e[0]] || 0) + 1;
    const ce = L[12].filter(x => x[0] === e[0])[used[e[0]] - 1];
    let el = BLD_DMG[e[0]];
    if (el === "b") el = bldBest(cs);
    const o = { kind: "sort", mel, tgt }, oc = Object.assign({ crit: 1 }, o);
    const lo = e[1] || 0, hi = e[2] || lo;
    const n = [bldHit(lo, el, cs, o), bldHit(hi, el, cs, o)];
    const c = ce ? [bldHit(ce[1] || 0, el, cs, oc), bldHit(ce[2] || ce[1] || 0, el, cs, oc)] : null;
    const avg = (1 - (c ? pc : 0)) * (n[0] + n[1]) / 2 + (c ? pc * (c[0] + c[1]) / 2 : 0);
    const cond = /(^|,)\*?[eE]\d/.test(e[6] || "");
    const what = el === "h" ? "Soins" : (BLD_STEAL.has(e[0]) ? "Vol " : "") + bldElName(el) + (BLD_DMG[e[0]] === "b" ? " (meilleur élément)" : "");
    return `<div class="small" style="overflow-wrap:anywhere"><span class="chip ${el === "h" ? "up" : "kamas"}">${esc(what)}</span> <span class="dmg muted">${bldRange(lo, hi)}</span> → <b class="dmg">${bldRange(...n)}</b>${c ? ` · critique <b class="dmg">${bldRange(...c)}</b>` : ""} · moyenne <b class="dmg">${fmt(avg)}</b>${cond ? ` <span class="muted">(sous condition)</span>` : ""}${BLD_STEAL.has(e[0]) ? ` <span class="muted">(soigne la moitié)</span>` : ""}</div>`;
  }).join("");
}
function spCard(id, lvl, cs) {
  const sp = D.spells.spells[id], acc = spRankAt(sp, lvl);
  let r = SP_RANK[id] != null ? SP_RANK[id] : acc;
  const head = `<div class="row between" style="gap:6px"><button type="button" class="link" data-sheet="spell:${id}"><span class="nm" style="font-size:1.05rem">${esc(sp[0])}</span></button>
    ${sp[3].length > 1 ? `<div class="seg" role="group" aria-label="Rang de ${esc(sp[0])}">${sp[3].map((L, i) => `<button type="button" data-rank="${i}" data-id="${id}" aria-pressed="${i === r}" title="Niveau ${L[0]}"${L[0] > lvl ? ' style="opacity:.55"' : ""}>${i + 1}</button>`).join("")}</div>` : ""}</div>`;
  if (r < 0) return `<article class="spell">${spellImg(sp[2])}<div style="display:grid;gap:6px;min-width:0">${head}<span class="chip warn" style="justify-self:start">À partir du niveau ${sp[3][0]?.[0] ?? "?"}</span><p class="muted small">${esc(sp[1])}</p></div></article>`;
  const L = sp[3][r];
  const dmg = spDmgLines(L, cs);
  const crit = L[12] && L[12].length ? `<details><summary class="small" style="cursor:pointer;font-weight:800">Effets en coup critique</summary>${spFxList(L[12])}</details>` : "";
  return `<article class="spell">${spellImg(sp[2])}<div style="display:grid;gap:6px;min-width:0">${head}
    <div class="chips"><span class="chip sec">Rang ${r + 1} · niv. ${L[0]}</span>${L[0] > lvl ? `<span class="chip warn">⚠ pas encore accessible</span>` : ""}${spChips(L)}</div>
    <p class="muted small">${esc(sp[1])}</p>${spFxList(L[11])}${crit}
    ${dmg ? `<div style="display:grid;gap:4px;padding:8px;border-radius:12px;background:var(--surface)"><div class="label">Dégâts estimés</div>${dmg}</div>` : ""}</div></article>`;
}

function spBind(el) {
  const redraw = () => { save(); const y = scrollY; spDraw(el); scrollTo(0, y); };
  el.onclick = e => {
    const r = e.target.closest("[data-rank]");
    if (r) { SP_RANK[r.dataset.id] = +r.dataset.rank; redraw(); return; }
    const g = e.target.closest("[data-rng]");
    if (g) { S.ui.spRng = g.dataset.rng; redraw(); }
  };
  el.onchange = e => {
    const t = e.target, d = t.dataset;
    if (d.sp === "breed") { S.ui.spBreed = +t.value; for (const k in SP_RANK) delete SP_RANK[k]; }
    else if (d.sp === "lvl") { S.ui.spLvl = clamp(Math.round(+t.value || 1), 1, 200); for (const k in SP_RANK) delete SP_RANK[k]; }
    else if (d.sp === "src") {
      S.ui.spSrc = t.value;
      const b = S.builds.find(x => x.id === t.value);
      if (b) { S.ui.spBreed = b.breed; S.ui.spLvl = b.lvl; }
    }
    else if (d.sp === "tgton") S.ui.spTgt.on = t.checked;
    else if (d.man) S.ui.spMan[d.man] = +t.value || 0;
    else if (d.tp) S.ui.spTgt.p[d.tp] = +t.value || 0;
    else if (d.tf) S.ui.spTgt.f[d.tf] = +t.value || 0;
    else if (d.tc) S.ui.spTgt.c = +t.value || 0;
    else return;
    redraw();
  };
  const q = $('[data-sp="q"]', el);
  q.addEventListener("input", debounce(() => {
    S.ui.spQ = q.value; save();
    const pos = q.selectionStart; spDraw(el);
    const n = $('[data-sp="q"]', el); n.focus({ preventScroll: true }); try { n.setSelectionRange(pos, pos); } catch {}
  }, 250));
  $('[data-sp="calc"]', el)?.addEventListener("toggle", e => { S.ui.spCalcOpen = e.target.open; save(); });
}

/* ---------- Fiche d'un sort : tous les rangs ---------- */
sheet("spell", async (inn, id) => {
  await need("spells");
  const sp = D.spells.spells[id];
  if (!sp) throw new Error("Sort inconnu");
  const br = Object.entries(D.spells.breeds).find(([, b]) => (b[3] || []).includes(+id));
  const chips = (br ? `<span class="chip">${esc(br[1][0])}</span>` : "") + `<span class="chip">${plural(sp[3].length, "rang")}</span>`;
  const rows = sp[3].map((L, i) => `<tr>
    <td data-label="Rang"><b>${i + 1}</b></td><td data-label="Niveau" class="n">${L[0]}</td><td data-label="PA" class="n">${L[1]}</td>
    <td data-label="Portée">${esc(spRangeTxt(L))}</td><td data-label="Critique" class="n">${L[4] ? L[4] + " %" : "—"}</td>
    <td data-label="Relance" class="n">${L[5] || "—"}</td><td data-label="Par tour / cible">${L[6] || "—"} / ${L[7] || "—"}</td>
    <td data-label="Effets" class="mc">${spFxList(L[11])}</td><td data-label="Critique" class="mc">${L[12] && L[12].length ? spFxList(L[12]) : "—"}</td></tr>`).join("");
  inn.innerHTML = sheetHead(spellImg(sp[2], "ico xl"), sp[0], chips, "var(--c-perso)") + `
    <p class="desc">${esc(sp[1])}</p>
    <section class="panel"><h2>Rangs</h2><div class="tablewrap"><table><thead><tr><th>Rang</th><th class="n">Niveau</th><th class="n">PA</th><th>Portée</th><th class="n">Crit.</th><th class="n">Relance</th><th>Tour / cible</th><th>Effets</th><th>Critique</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="muted small">Niveau = niveau du personnage requis pour ce rang. Les effets marqués « sous condition » dépendent d'un état.</p></section>
    ${br ? `<a class="btn" style="justify-self:start" href="#sorts" onclick="S.ui.spBreed=${+br[0]};save();if(location.hash==='#sorts')setTimeout(rerender,0)">Tous les sorts ${esc(br[1][0])}</a>` : ""}`;
});
