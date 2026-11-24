/* Atelier Touch : Aventure (donjons, quêtes, succès, carte du Monde des Douze).
   Données du jeu : data/world.json, monsters.json, quests.json, core.json.
   Compléments : API publique de Papycha (autorisée, citée avec un lien direct), appelée en direct depuis le navigateur ;
   ses réponses restent en mémoire le temps de la session, jamais enregistrées sur l'appareil. */

const ADV = { onDone: null };
const ADV_API = "https://papycha.fr/wp-json/papycha-public/v1/";
const ADV_CACHE = {};
const advMe = () => +S.settings.lvl || 200;
const advPP = () => +S.settings.pp || 100;
const advQIcon = () => itemImg(87001); // icône des quêtes (parchemin)
const advQImg = (cls = "s") => `<img class="ico ${cls}" style="--cat:var(--c-adv)" src="${advQIcon()}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;

/* ---------- Petits utilitaires ---------- */
// Décode les entités HTML renvoyées par l'API (&rsquo; …) ; le texte est ensuite échappé par esc()
function advTxt(s) { const t = advTxt.el || (advTxt.el = document.createElement("textarea")); t.innerHTML = String(s ?? ""); return t.value; }
const ADV_STOP = new Set(["donjon", "le", "la", "les", "l", "des", "du", "de", "d", "chemin", "aller", "sur", "vers"]);
// Nom réduit à l'essentiel pour comparer les donjons (« [Donjon] Donjon des Bouftous » -> « bouftous »)
function advCore(s) {
  const w = norm(advTxt(s)).replace(/^\[[^\]]*\]\s*/, "").replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
  while (w.length > 1 && ADV_STOP.has(w[0])) w.shift();
  return w.join(" ");
}
const advWithin = (a, b) => (" " + a + " ").includes(" " + b + " ");
// Clé de comparaison des noms de quêtes (ponctuation et précisions entre parenthèses retirées)
const advQKey = s => norm(advTxt(s)).replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function advXY(s) { const m = String(s || "").match(/(-?\d+)\s*[,;]\s*(-?\d+)/); return m ? [+m[1], +m[2]] : null; }
const advPos = p => p ? `[${p[0]},${p[1]}]` : "—";
const advHint = s => String(s || "").replace(/\s*\\n\s*/g, " · ").replace(/\s+/g, " ").trim();
function advSeg(id, opts, cur) {
  return `<div class="seg" id="${id}" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(l)}</button>`).join("")}</div>`;
}
function advSegBind(seg, fn) {
  seg.addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    $$("button", seg).forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    fn(b.dataset.v);
  });
}
function advTile(label, v, sub = "", bar = null) {
  return `<div class="tile"><span class="label">${esc(label)}</span><span class="v">${v}</span>${sub ? `<small class="muted">${sub}</small>` : ""}${bar != null ? `<div class="bar"><span style="width:${clamp(bar, 0, 100).toFixed(1)}%"></span></div>` : ""}</div>`;
}
function advDoneBox(kind, id, label = "Fait") {
  return `<label class="check"><input type="checkbox" data-adv-done="${kind}:${id}" ${S[kind][id] ? "checked" : ""}> ${esc(label)}</label>`;
}
// La fiche affichée est-elle toujours celle-ci ? (réponses de Papycha arrivées après coup)
const advCur = (type, id) => { const h = HISTORY[HISTORY.length - 1]; return !!h && h[0] === type && String(h[1]) === String(id) && $("#sheet").open; };
const advPapySrc = () => `<p class="note">Source : <a href="https://papycha.fr" target="_blank" rel="noopener">Papycha</a> (API publique du Bazar de Papycha, informations citées avec leur lien).</p>`;
const advPapyOff = `<p class="muted small">Les compléments de Papycha ne sont pas disponibles pour l'instant (pas de connexion ou site injoignable) : les données du jeu restent complètes.</p>`;

// Case « fait » : un seul écouteur pour toute l'appli (pages et fiches)
document.addEventListener("change", e => {
  const c = e.target.closest?.("input[data-adv-done]"); if (!c) return;
  const [k, id] = c.dataset.advDone.split(":");
  if (!S[k]) S[k] = {};
  if (c.checked) S[k][id] = 1; else delete S[k][id];
  save();
  $$(`input[data-adv-done="${k}:${id}"]`).forEach(x => { x.checked = c.checked; x.closest(".li")?.classList.toggle("done", c.checked); });
  if (ADV.onDone && ADV.onDone.el?.isConnected) ADV.onDone(k);
  emit("adv-done", k);
});

/* ---------- Papycha : appels en direct ---------- */
// Une seule requête par jeu de données et par session ; nouvel essai possible une minute après un échec
function advOnce(key, fn) {
  const c = ADV_CACHE[key];
  if (c && !(c.err && Date.now() - c.t > 60e3)) return c.p;
  const e = { t: Date.now() };
  e.p = fn().catch(x => { e.err = 1; e.t = Date.now(); throw x; });
  ADV_CACHE[key] = e;
  return e.p;
}
async function advFetchAll(kind, maxPages = 20) {
  const out = []; let page = 1, total = 1;
  do {
    const r = await fetch(`${ADV_API}${kind}?per_page=100&page=${page}`, { credentials: "omit" });
    if (!r.ok) throw new Error(`Papycha ${r.status}`);
    const j = await r.json();
    out.push(...(j.items || []));
    total = Math.min(+j.total_pages || 1, maxPages);
  } while (++page <= total); // pages chargées l'une après l'autre
  return out;
}
const ADV_PKIND = { dungeon: "dungeon", den: "den", lair: "den", raid: "raid" };
// Donjons de Papycha rapprochés des donjons du jeu (nom, clef, boss, niveau)
function advPapyDj() {
  return advOnce("dungeons", async () => {
    const items = await advFetchAll("dungeons", 10);
    const P = items.filter(p => !/^\[(quete|chemin|guide)/.test(norm(advTxt(p.name)))).map(p => ({
      p, core: advCore(p.name), key: norm(advTxt(p.key?.name || "")), boss: norm(advTxt(p.boss || "")) }));
    const byGame = {}, M = D.monsters.monsters;
    for (const g of advDj().list) {
      const gc = advCore(g.name), gk = g.key ? norm(itemName(g.key)) : "", gb = g.bosses.map(m => norm(M[m][0]));
      let best = null, bs = 0;
      for (const x of P) {
        let s = 0;
        if (x.core === gc) s = 100;
        else if (gk && x.key && x.key === gk) s = 90;
        else if (x.core.length >= 4 && gc.length >= 4 && (advWithin(gc, x.core) || advWithin(x.core, gc))) s = 70;
        else if (x.boss && gb.includes(x.boss)) s = 60;
        if (!s) continue;
        if (x.boss && gb.includes(x.boss)) s += 8;
        if (x.p.level && g.lvl) s -= Math.min(20, Math.abs(x.p.level - g.lvl) / 5);
        if (s > bs) { bs = s; best = x.p; }
      }
      if (best && bs >= 55) byGame[g.id] = best;
    }
    return (ADV.pdj = { items, byGame });
  });
}
const advPapyPaths = () => advOnce("paths", () => advFetchAll("paths", 5));
// Quêtes de Papycha indexées par nom
function advPapyQ() {
  return advOnce("quests", async () => {
    const items = await advFetchAll("quests", 30);
    const byKey = {};
    for (const p of items) (byKey[advQKey(p.name)] = byKey[advQKey(p.name)] || []).push(p);
    return (ADV.pq = { items, byKey });
  });
}
function advQPapy(qid) {
  if (!ADV.pq) return null;
  const q = D.quests.quests[qid]; if (!q) return null;
  return ADV.pq.byKey[advQKey(q[0])]?.[0] || null;
}

/* ---------- Donjons : index des données du jeu ---------- */
const ADV_KIND = { dungeon: "Donjon", den: "Tanière", dedale: "Dédale", raid: "Raid" };
function advDj() {
  if (ADV.dj) return ADV.dj;
  const M = D.monsters.monsters, list = [], byId = {}, byName = {};
  const maxLv = m => Math.max(0, ...M[m][3].map(g => g[0]));
  for (const [id, d] of Object.entries(D.world.dungeons)) {
    const n = norm(d[0]);
    if (byName[n]) { byId[id] = byName[n]; continue; } // doublons du jeu (même donjon sous plusieurs numéros)
    const mons = d[4].filter(m => M[m]);
    let bosses = mons.filter(m => M[m][2] & 1);
    const boss = bosses.find(m => n.includes(norm(M[m][0]))) || bosses[0] || mons.slice().sort((a, b) => maxLv(b) - maxLv(a))[0] || 0;
    bosses = bosses.sort((a, b) => (b === boss) - (a === boss));
    const kind = /^palier \d/.test(n) ? "dedale" : /^taniere (du|de|des)\b/.test(n) ? "den" : "dungeon";
    const g = { id: +id, name: d[0], lvl: d[1], key: d[2], subs: d[3], mons, bosses, boss, ent: d[5], rooms: d[6], kind, n,
      s: norm([d[0], ...mons.map(m => M[m][0]), d[2] ? itemName(d[2]) : ""].join(" ")) };
    list.push(g); byId[id] = g; byName[n] = g;
  }
  list.sort((a, b) => a.lvl - b.lvl || a.name.localeCompare(b.name, "fr", { numeric: true }));
  return (ADV.dj = { list, byId });
}
function advDjKind(g) {
  const p = ADV.pdj?.byGame[g.id], k = p && ADV_PKIND[p.kind];
  return k && k !== "dungeon" ? k : g.kind;
}
const advMonName = id => D.monsters?.monsters[id]?.[0] || `Monstre ${id}`;
function advDjRow(g) {
  const me = advMe(), near = Math.abs(g.lvl - me) <= 20, k = advDjKind(g), p = ADV.pdj?.byGame[g.id];
  const chips = [
    k !== "dungeon" ? `<span class="chip sec">${ADV_KIND[k]}</span>` : "",
    g.rooms ? `<span class="chip">${plural(g.rooms, "salle")}</span>` : "",
    near ? `<span class="chip up">À ton niveau</span>` : g.lvl > me + 20 ? `<span class="chip down">+${g.lvl - me} niv.</span>` : "",
    p ? `<span class="chip" title="Fiche Papycha disponible">📜 Papycha</span>` : "",
  ].join("");
  const sub = [`Niv. ${g.lvl}`, g.boss ? advMonName(g.boss) : "", g.ent ? advPos(g.ent) : ""].filter(Boolean).map(esc).join(" · ");
  return `<div class="li ${S.dung[g.id] ? "done" : ""}">
    <button type="button" class="link itemline" data-sheet="dungeon:${g.id}">${monImg(g.boss || 0)}<span class="t"><span class="nm">${esc(g.name)}</span><small>${sub}</small></span></button>
    <div class="r">${g.key ? itemLine(g.key, "Clef du donjon", "s") : ""}<span class="chips">${chips}</span>${advDoneBox("dung", g.id)}</div>
  </div>`;
}

page("donjons", {
  title: "Donjons", icon: 84226, needs: ["world", "monsters"],
  intro: "Tous les donjons, tanières et paliers du Dédale : boss, clef, entrée, butin. Coche ceux que tu as faits ; les infos de Papycha complètent les fiches.",
  render: advDonjons,
});
function advDonjons(el) {
  const idx = advDj();
  const F = { q: "", lvl: ui("dj-lvl", "all"), min: ui("dj-min", 1), max: ui("dj-max", 200), hide: ui("dj-hide", false), kind: ui("dj-kind", "all") };
  el.innerHTML = `<div class="stack">` + hero("donjons") + `
  <div class="tiles" id="dj-tiles"></div>
  <section class="panel">
    <div class="filters">
      <div class="search"><input type="search" id="dj-q" placeholder="Donjon, boss, monstre ou clef…" aria-label="Chercher un donjon" autocomplete="off"></div>
      <label class="check"><input type="checkbox" id="dj-hide" ${F.hide ? "checked" : ""}> Masquer les donjons faits</label>
    </div>
    <div class="filters">
      ${advSeg("dj-lvl", [["all", "Tous les niveaux"], ["me", "Autour de mon niveau"], ["range", "Entre…"]], F.lvl)}
      <span class="row" id="dj-range" ${F.lvl === "range" ? "" : "hidden"}>
        <label class="fld">Min <input type="number" class="sm" id="dj-min" min="1" max="200" value="${F.min}"></label>
        <label class="fld">Max <input type="number" class="sm" id="dj-max" min="1" max="200" value="${F.max}"></label>
      </span>
      <label class="fld">Ton niveau <input type="number" class="sm" id="dj-me" min="1" max="200" value="${advMe()}"></label>
    </div>
    <div class="filters" id="dj-kinds"></div>
    <p class="note" id="dj-papy">Compléments de Papycha : chargement…</p>
    <div class="list" id="dj-list"></div>
  </section></div>`;

  const match = g => {
    if (F.hide && S.dung[g.id]) return false;
    if (F.kind !== "all" && advDjKind(g) !== F.kind) return false;
    if (F.lvl === "me" && Math.abs(g.lvl - advMe()) > 20) return false;
    if (F.lvl === "range" && (g.lvl < F.min || g.lvl > F.max)) return false;
    if (F.q) {
      const p = ADV.pdj?.byGame[g.id];
      const s = p ? g.s + " " + norm(advTxt(p.boss || "") + " " + advTxt(p.contact_npc || "")) : g.s;
      if (!norm(F.q).split(" ").every(w => s.includes(w))) return false;
    }
    return true;
  };
  const kinds = () => {
    const c = { all: idx.list.length };
    for (const g of idx.list) { const k = advDjKind(g); c[k] = (c[k] || 0) + 1; }
    if (F.kind !== "all" && !c[F.kind]) F.kind = "all";
    $("#dj-kinds", el).innerHTML = advSeg("dj-kind", [["all", `Tous (${c.all})`], ...["dungeon", "den", "raid", "dedale"].filter(k => c[k]).map(k => [k, `${ADV_KIND[k]}s (${c[k]})`])], F.kind);
    advSegBind($("#dj-kind", el), v => { F.kind = v; setUi("dj-kind", v); list(); });
  };
  const list = () => {
    const r = idx.list.filter(match);
    $("#dj-list", el).innerHTML = r.map(advDjRow).join("") || `<div class="empty"><strong>Aucun donjon</strong><span>Change les filtres ou la recherche.</span></div>`;
  };
  const tiles = () => {
    const me = advMe(), all = idx.list.filter(g => g.kind !== "dedale"), done = all.filter(g => S.dung[g.id]).length;
    const near = all.filter(g => Math.abs(g.lvl - me) <= 20), nearDone = near.filter(g => S.dung[g.id]).length;
    const next = all.filter(g => !S.dung[g.id] && g.lvl <= me + 5 && g.mons.length).sort((a, b) => b.lvl - a.lvl)[0];
    const pd = ADV.pdj ? Object.keys(ADV.pdj.byGame).length : null;
    $("#dj-tiles", el).innerHTML =
      advTile("Donjons faits", `${fmt(done)} / ${fmt(all.length)}`, "hors paliers du Dédale", all.length ? done / all.length * 100 : 0) +
      advTile("À ton niveau (±20)", `${fmt(nearDone)} / ${fmt(near.length)}`, `niveau ${me}`, near.length ? nearDone / near.length * 100 : 0) +
      advTile("Prochain à faire", next ? `<button type="button" class="link" data-sheet="dungeon:${next.id}" style="font:inherit"><span class="nm">${esc(next.name)}</span></button>` : "—", next ? `niv. ${next.lvl}` : "tout est fait à ton niveau") +
      advTile("Fiches Papycha", pd == null ? "…" : fmt(pd), pd == null ? "chargement" : "donjons reliés à un guide");
  };
  const all = () => { tiles(); list(); };
  ADV.onDone = () => { tiles(); if (F.hide) list(); };
  ADV.onDone.el = el.firstElementChild;

  const q = $("#dj-q", el);
  q.addEventListener("input", debounce(() => { F.q = q.value; list(); }, 120));
  $("#dj-hide", el).addEventListener("change", e => { F.hide = e.target.checked; setUi("dj-hide", F.hide); list(); });
  advSegBind($("#dj-lvl", el), v => { F.lvl = v; setUi("dj-lvl", v); $("#dj-range", el).hidden = v !== "range"; list(); });
  $("#dj-min", el).addEventListener("change", e => { F.min = clamp(+e.target.value || 1, 1, 200); setUi("dj-min", F.min); list(); });
  $("#dj-max", el).addEventListener("change", e => { F.max = clamp(+e.target.value || 200, 1, 200); setUi("dj-max", F.max); list(); });
  $("#dj-me", el).addEventListener("change", e => { S.settings.lvl = clamp(+e.target.value || 200, 1, 200); save(); all(); });
  kinds(); all();

  advPapyDj().then(pd => {
    if (!el.isConnected || VIEW !== "donjons") return;
    $("#dj-papy", el).innerHTML = `${fmt(Object.keys(pd.byGame).length)} donjons complétés par les fiches de <a href="https://papycha.fr" target="_blank" rel="noopener">Papycha</a> (entrée, PNJ, pierre d'âme…), source citée dans chaque fiche.`;
    kinds(); all();
  }).catch(() => {
    if (!el.isConnected) return;
    $("#dj-papy", el).textContent = "Compléments de Papycha indisponibles pour l'instant : la liste utilise les données du jeu.";
    tiles();
  });
}

/* ---------- Fiche donjon ---------- */
// Butin cumulé des monstres d'un donjon : meilleur taux de chaque objet
function advLoot(mons) {
  const M = D.monsters.monsters, L = {};
  for (const m of mons) for (const d of M[m]?.[5] || []) {
    const [id, p1 = 0, p5 = 0, cond = 0, lo = 0, hi = 0, noPP = 0, ceil = 0] = d;
    const best = Math.max(p1, p5);
    const x = L[id] || (L[id] = { id, best: -1, mons: [] });
    if (best > x.best) Object.assign(x, { best, cond, lo, hi, noPP, ceil });
    if (!x.mons.includes(m)) x.mons.push(m);
  }
  return Object.values(L).filter(x => item(x.id));
}
function advLootTable(loot, sort, limit) {
  const pp = advPP();
  const eff = x => x.noPP ? x.best : Math.min(100, x.best * pp / 100);
  const r = loot.slice();
  if (sort === "rare") r.sort((a, b) => a.best - b.best || item(b.id).lvl - item(a.id).lvl);
  else if (sort === "rate") r.sort((a, b) => b.best - a.best);
  else r.sort((a, b) => (price(b.id) ?? -1) - (price(a.id) ?? -1) || a.best - b.best);
  const rows = r.slice(0, limit).map(x => {
    const it = item(x.id), p = price(x.id);
    const cond = x.cond === 1 ? `<span class="chip">perso niv. ${x.lo || 1}–${x.hi || 200}</span>` : x.cond === 2 ? `<span class="chip warn">sous condition</span>` : "";
    const ceil = x.ceil ? `<span class="chip">seuil ${fmt(x.ceil)} PP</span>` : "";
    return `<tr><td class="mc">${itemLine(x.id, `${esc(it.typeName)} · niv. ${it.lvl}`, "s")}${cond || ceil ? `<div class="chips" style="margin-top:4px">${cond}${ceil}</div>` : ""}</td>
      <td class="n" data-label="Taux de base">${fmt(x.best, 2)} %</td>
      <td class="n" data-label="Avec ${fmt(pp)} PP">${fmt(eff(x), 2)} %</td>
      <td data-label="Lâché par">${x.mons.slice(0, 3).map(m => `<button type="button" class="link" data-mon="${m}"><span class="nm" style="font-weight:600">${esc(advMonName(m))}</span></button>`).join(", ")}${x.mons.length > 3 ? ` <span class="muted small">+${x.mons.length - 3}</span>` : ""}</td>
      <td class="n" data-label="Prix relevé">${p != null ? `<span class="gold">${kam(p)}</span>` : `<span class="muted">—</span>`}</td></tr>`;
  }).join("");
  return `<div class="tablewrap"><table><thead><tr><th>Objet</th><th class="n">Taux</th><th class="n">${fmt(pp)} PP</th><th>Lâché par</th><th class="n">Prix</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function advPapyDjBlock(p, paths) {
  const kv = [];
  const add = (k, v) => { if (v != null && v !== "") kv.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`); };
  const xy = advXY(p.entrance_coordinates);
  add("Type", esc(ADV_KIND[ADV_PKIND[p.kind]] || p.kind || ""));
  add("Niveau", p.level ? esc(p.level) : "");
  add("Entrée", xy ? `${advPos(xy)} · <a href="#carte/pos/${xy[0]}/${xy[1]}">voir sur la carte</a>` : esc(advTxt(p.entrance_coordinates || "")));
  add("PNJ", esc(advTxt(p.contact_npc || "")));
  add("Clef", esc(advTxt(p.key?.name || "")));
  add("Pierre d'âme", p.soul_stone_size ? `taille ${esc(p.soul_stone_size)}` : "");
  add("Zone", esc((p.zone || []).map(z => advTxt(z.name)).join(", ")));
  add("Boss", esc(advTxt(p.boss || "")));
  return `<dl class="kv">${kv.join("")}</dl>
    <div class="row">${papyLink(p.url, "Guide du donjon sur Papycha")}${paths.map(x => papyLink(x.url, advTxt(x.name).replace(/^\[[^\]]*\]\s*/, "Chemin : "))).join("")}</div>
    ${advPapySrc()}`;
}
sheet("dungeon", async (el, id) => {
  await need("world", "monsters");
  const g = advDj().byId[id];
  if (!g) throw new Error("Donjon introuvable");
  const M = D.monsters.monsters, me = advMe(), k = advDjKind(g);
  const chips = [`Niv. ${g.lvl}`, ADV_KIND[k], g.rooms ? plural(g.rooms, "salle") : "", S.dung[g.id] ? "✓ Fait" : ""].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join("");
  const subs = g.subs.map(s => D.world.subareas[s]?.[0]).filter(Boolean);
  const keyRec = g.key && recipe(g.key);
  const keySub = g.key ? `Clef${keyRec ? ` · se fabrique (${esc(D.core.jobs[keyRec[0]]?.[0] || "recette")}, ${plural(keyRec[1].length, "ingrédient")})` : ""}${price(g.key) != null ? ` · ${kam(price(g.key))}` : ""}` : "";
  const order = m => (g.bosses.includes(m) ? 0 : M[m][2] & 2 ? 1 : 2);
  const mons = g.mons.slice().sort((a, b) => order(a) - order(b) || (M[a][3][0]?.[0] || 0) - (M[b][3][0]?.[0] || 0));
  const loot = advLoot(g.mons);
  const diff = g.lvl - me;
  el.innerHTML = sheetHead(monImg(g.boss || 0, "xl"), g.name, chips, "var(--c-adv)") + `
  <section class="panel">
    <h2>Ta progression</h2>
    <div class="row between">${advDoneBox("dung", g.id, "J'ai fait ce donjon")}<span class="chip ${Math.abs(diff) <= 20 ? "up" : diff > 0 ? "down" : ""}">${diff > 20 ? `${diff} niveaux au-dessus de toi` : diff < -20 ? "Bien en dessous de ton niveau" : "Adapté à ton niveau"} (${me})</span></div>
  </section>
  <section class="panel">
    <h2>Accès</h2>
    <dl class="kv">
      <dt>Entrée</dt><dd>${g.ent ? `${advPos(g.ent)} · <a href="#carte/pos/${g.ent[0]}/${g.ent[1]}">voir sur la carte</a>` : "—"}</dd>
      <dt>Niveau conseillé</dt><dd>${g.lvl}</dd>
      ${g.rooms ? `<dt>Salles</dt><dd>${fmt(g.rooms)}</dd>` : ""}
      ${subs.length ? `<dt>Zone${subs.length > 1 ? "s" : ""}</dt><dd>${esc(subs.join(", "))}</dd>` : ""}
    </dl>
    ${g.key ? `<div><p class="label">Clef</p>${itemLine(g.key, keySub)}</div>` : `<p class="muted small">Pas de clef indiquée dans les données du jeu pour ce donjon.</p>`}
  </section>
  ${mons.length ? `<section class="panel">
    <h2>Boss et monstres</h2>
    <div class="list">${mons.map(m => {
      const gr = M[m][3], last = gr[gr.length - 1] || [];
      return `<div class="li"><span>${monLine(m)}</span><div class="r">${g.bosses.includes(m) ? `<span class="chip warn">Boss</span>` : M[m][2] & 2 ? `<span class="chip sec">Mini-boss</span>` : ""}${last[1] ? `<span class="chip">${fmt(last[1])} PV</span>` : ""}${last[4] ? `<span class="chip">${fmt(last[4])} XP</span>` : ""}</div></div>`;
    }).join("")}</div>
  </section>` : ""}
  ${loot.length ? `<section class="panel">
    <div class="row between"><h2>Butin du donjon</h2>${advSeg("dj-lsort", [["rare", "Plus rares"], ["rate", "Plus fréquents"], ["price", "Plus chers"]], ui("dj-lsort", "rare"))}</div>
    <p class="note">${plural(loot.length, "objet")} lâchés par les monstres du donjon, meilleur taux (grade 5). Taux avec ta prospection (${fmt(advPP())} PP) quand le drop en dépend ; prix = tes relevés de l'HDV.</p>
    <div id="dj-loot"></div>
  </section>` : ""}
  <section class="panel" id="dj-papybox"><h2>Infos Papycha</h2><p class="muted small">Chargement…</p></section>
  <section class="panel" id="dj-rel" hidden></section>`;

  // Butin : tri et « voir tout »
  let lim = 40;
  const lootDraw = () => {
    const box = $("#dj-loot", el); if (!box) return;
    box.innerHTML = advLootTable(loot, ui("dj-lsort", "rare"), lim) + (loot.length > lim ? `<button type="button" class="btn more" id="dj-lmore">Voir tout (${fmt(loot.length)})</button>` : "");
    $("#dj-lmore", el)?.addEventListener("click", () => { lim = 1e9; lootDraw(); });
  };
  if (loot.length) { lootDraw(); advSegBind($("#dj-lsort", el), v => { setUi("dj-lsort", v); lootDraw(); }); }

  // Papycha (en direct)
  const sid = String(id);
  Promise.all([advPapyDj(), advPapyPaths().catch(() => [])]).then(([pd, paths]) => {
    const box = $("#dj-papybox", el); if (!box || !advCur("dungeon", sid)) return;
    const p = pd.byGame[g.id];
    const gc = advCore(g.name);
    const ps = (paths || []).filter(x => {
      const d = x.destination?.dungeon;
      if (d && p && (d === p.id || d.id === p.id)) return true;
      const c = advCore(x.destination?.label || x.name);
      return c.length >= 4 && (c === gc || advWithin(gc, c) || advWithin(c, gc));
    });
    box.innerHTML = `<h2>Infos Papycha</h2>` + (p ? advPapyDjBlock(p, ps)
      : `<p class="muted small">Pas de fiche Papycha reliée à ce donjon.</p><div class="row">${papyLink("https://papycha.fr/?s=" + encodeURIComponent(g.name), "Chercher sur Papycha")}</div>`);
  }).catch(() => { const box = $("#dj-papybox", el); if (box) box.innerHTML = `<h2>Infos Papycha</h2>` + advPapyOff; });

  // Quêtes et succès liés (boss du donjon)
  need("quests").then(() => {
    const box = $("#dj-rel", el); if (!box || !advCur("dungeon", sid)) return;
    const bossN = g.bosses.map(m => norm(M[m][0]));
    const qs = Object.entries(D.quests.quests).filter(([, q]) => q[9].some(m => g.bosses.includes(m))).slice(0, 12);
    const A = D.quests.achievements, AC = D.quests.acats;
    const isDjCat = c => { const x = AC[c]; return x && ([3, 87].includes(+c) || [3, 87].includes(x[1])); };
    const as = Object.entries(A).filter(([, a]) => isDjCat(a[1]) && (norm(a[0]) === g.n || a[6].some(o => bossN.includes(norm(o))))).slice(0, 16);
    if (!qs.length && !as.length) return;
    box.hidden = false;
    box.innerHTML = `<h2>Quêtes et succès liés</h2>
      ${qs.length ? `<div class="list">${qs.map(([qid, q]) => `<div class="li ${S.quests[qid] ? "done" : ""}"><button type="button" class="link itemline" data-sheet="quest:${qid}">${advQImg()}<span class="t"><span class="nm">${esc(q[0])}</span><small>Quête · ${q[2] ? "niv. " + q[2] : "niveau libre"}</small></span></button><div class="r">${advDoneBox("quests", qid)}</div></div>`).join("")}</div>` : ""}
      ${as.length ? `<div class="list">${as.map(([aid, a]) => advAchRow(+aid, a)).join("")}</div>` : ""}`;
  }).catch(() => {});
});

/* ---------- Quêtes ---------- */
function advQ() {
  if (ADV.q) return ADV.q;
  const Q = D.quests.quests, C = D.quests.qcats, list = [], cats = {}, byKey = {};
  for (const [id, q] of Object.entries(Q)) {
    const cn = C[q[1]]?.[0] || "Autres";
    list.push({ id: +id, name: q[0], n: norm(q[0] + " " + cn), cat: cn, lmin: q[2], lmax: q[3], lvl: q[2] || q[3], flags: q[4], steps: q[5], rew: q[8].length, mons: q[9].length });
    (cats[cn] = cats[cn] || { name: cn, n: 0, done: 0 }).n++;
    const k = advQKey(q[0]); (byKey[k] = byKey[k] || []).push(+id);
  }
  const catList = Object.values(cats).sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  return (ADV.q = { list, cats: catList, byKey });
}
const advQLvl = x => x.lmin && x.lmax && x.lmax !== x.lmin ? `niv. ${x.lmin} à ${x.lmax}` : x.lvl ? `niv. ${x.lvl}` : "niveau libre";
function advQRow(x) {
  const chips = [
    x.flags & 4 ? `<span class="chip sec">Principale</span>` : "",
    x.flags & 1 ? `<span class="chip">Répétable</span>` : "",
    x.flags & 2 ? `<span class="chip warn">Donjon</span>` : "",
    x.rew ? `<span class="chip kamas" title="Objets en récompense">🎁 ${fmt(x.rew)}</span>` : "",
    advQPapy(x.id) ? `<span class="chip" title="Fiche Papycha disponible">📜 Papycha</span>` : "",
  ].join("");
  return `<div class="li ${S.quests[x.id] ? "done" : ""}">
    <button type="button" class="link itemline" data-sheet="quest:${x.id}">${advQImg()}<span class="t"><span class="nm">${esc(x.name)}</span><small>${esc(x.cat)} · ${advQLvl(x)} · ${plural(x.steps, "étape")}</small></span></button>
    <div class="r"><span class="chips">${chips}</span>${advDoneBox("quests", x.id)}</div>
  </div>`;
}
page("quetes", {
  title: "Quêtes", icon: 87001, needs: ["quests"],
  intro: "Toutes les quêtes du jeu par catégorie et niveau, avec récompenses et monstres à vaincre. Coche celles que tu as terminées ; Papycha indique où les commencer et leur suite.",
  render: advQuetes,
});
function advQuetes(el) {
  const idx = advQ();
  const F = { q: "", cat: ui("q-cat", ""), lvl: ui("q-lvl", "all"), min: ui("q-min", 1), max: ui("q-max", 200), type: ui("q-type", "all"), hide: ui("q-hide", false), papy: false, sort: ui("q-sort", "lvl") };
  let shown = 60, R = [];
  if (F.cat && !idx.cats.some(c => c.name === F.cat)) F.cat = "";
  el.innerHTML = `<div class="stack">` + hero("quetes") + `
  <div class="tiles" id="q-tiles"></div>
  <section class="panel">
    <div class="filters">
      <div class="search"><input type="search" id="q-q" placeholder="Nom de la quête…" aria-label="Chercher une quête" autocomplete="off"></div>
      <label class="fld">Catégorie <select id="q-cat"><option value="">Toutes les catégories</option>${idx.cats.map(c => `<option value="${esc(c.name)}" ${c.name === F.cat ? "selected" : ""}>${esc(c.name)} (${fmt(c.n)})</option>`).join("")}</select></label>
      <label class="fld">Trier <select id="q-sort">${[["lvl", "Par niveau"], ["name", "Par nom"], ["cat", "Par catégorie"], ["rew", "Récompenses d'abord"]].map(([v, l]) => `<option value="${v}" ${v === F.sort ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <div class="filters">
      ${advSeg("q-type", [["all", "Toutes"], ["main", "Principales"], ["rep", "Répétables"], ["dj", "Donjon"], ["once", "Non répétables"]], F.type)}
    </div>
    <div class="filters">
      ${advSeg("q-lvl", [["all", "Tous les niveaux"], ["me", "Autour de mon niveau"], ["range", "Entre…"]], F.lvl)}
      <span class="row" id="q-range" ${F.lvl === "range" ? "" : "hidden"}>
        <label class="fld">Min <input type="number" class="sm" id="q-min" min="1" max="200" value="${F.min}"></label>
        <label class="fld">Max <input type="number" class="sm" id="q-max" min="1" max="200" value="${F.max}"></label>
      </span>
      <label class="fld">Ton niveau <input type="number" class="sm" id="q-me" min="1" max="200" value="${advMe()}"></label>
      <label class="check"><input type="checkbox" id="q-hide" ${F.hide ? "checked" : ""}> Masquer les quêtes faites</label>
      <label class="check"><input type="checkbox" id="q-papy" disabled> Avec un guide Papycha</label>
    </div>
    <p class="note" id="q-note"></p>
    <div class="list" id="q-list"></div>
    <button type="button" class="btn more" id="q-more" hidden>Voir plus</button>
  </section></div>`;

  const filter = () => {
    const ws = F.q ? norm(F.q).split(" ") : null, me = advMe();
    R = idx.list.filter(x => {
      if (F.hide && S.quests[x.id]) return false;
      if (F.cat && x.cat !== F.cat) return false;
      if (F.type === "main" && !(x.flags & 4)) return false;
      if (F.type === "rep" && !(x.flags & 1)) return false;
      if (F.type === "dj" && !(x.flags & 2)) return false;
      if (F.type === "once" && x.flags & 1) return false;
      if (F.lvl === "me" && (!x.lvl || Math.abs(x.lvl - me) > 20)) return false;
      if (F.lvl === "range" && (!x.lvl || x.lvl < F.min || x.lvl > F.max)) return false;
      if (F.papy && !advQPapy(x.id)) return false;
      if (ws && !ws.every(w => x.n.includes(w))) return false;
      return true;
    });
    const byName = (a, b) => a.name.localeCompare(b.name, "fr", { numeric: true });
    const lv = x => x.lvl || 999;
    if (F.sort === "name") R.sort(byName);
    else if (F.sort === "cat") R.sort((a, b) => a.cat.localeCompare(b.cat, "fr", { numeric: true }) || lv(a) - lv(b) || byName(a, b));
    else if (F.sort === "rew") R.sort((a, b) => b.rew - a.rew || lv(a) - lv(b) || byName(a, b));
    else R.sort((a, b) => lv(a) - lv(b) || byName(a, b));
  };
  const list = () => {
    $("#q-list", el).innerHTML = R.slice(0, shown).map(advQRow).join("") || `<div class="empty"><strong>Aucune quête</strong><span>Change les filtres ou la recherche.</span></div>`;
    const more = $("#q-more", el);
    more.hidden = R.length <= shown;
    more.textContent = `Voir plus (${fmt(R.length - shown)} de plus)`;
    $("#q-note", el).textContent = `${plural(R.length, "quête")}${R.length > shown ? `, ${fmt(shown)} affichées` : ""}.`;
  };
  const tiles = () => {
    const all = idx.list.length, done = idx.list.filter(x => S.quests[x.id]).length;
    const main = idx.list.filter(x => x.flags & 4), mainDone = main.filter(x => S.quests[x.id]).length;
    const inCat = F.cat ? idx.list.filter(x => x.cat === F.cat) : null, catDone = inCat ? inCat.filter(x => S.quests[x.id]).length : 0;
    const resDone = R.filter(x => S.quests[x.id]).length;
    const pq = ADV.pq ? idx.list.filter(x => advQPapy(x.id)).length : null;
    $("#q-tiles", el).innerHTML =
      advTile("Quêtes faites", `${fmt(done)} / ${fmt(all)}`, "", done / all * 100) +
      (inCat ? advTile(F.cat, `${fmt(catDone)} / ${fmt(inCat.length)}`, "dans la catégorie", catDone / inCat.length * 100)
        : advTile("Quêtes principales", `${fmt(mainDone)} / ${fmt(main.length)}`, "", main.length ? mainDone / main.length * 100 : 0)) +
      advTile("Sélection", `${fmt(resDone)} / ${fmt(R.length)}`, "faites parmi les quêtes filtrées", R.length ? resDone / R.length * 100 : 0) +
      advTile("Guides Papycha", pq == null ? "…" : fmt(pq), pq == null ? "chargement" : "quêtes reliées à une fiche");
  };
  const all = (keep) => { if (!keep) shown = 60; filter(); list(); tiles(); };
  ADV.onDone = () => { tiles(); if (F.hide) { filter(); list(); } };
  ADV.onDone.el = el.firstElementChild;

  const q = $("#q-q", el);
  q.addEventListener("input", debounce(() => { F.q = q.value; all(); }, 150));
  $("#q-cat", el).addEventListener("change", e => { F.cat = e.target.value; setUi("q-cat", F.cat); all(); });
  $("#q-sort", el).addEventListener("change", e => { F.sort = e.target.value; setUi("q-sort", F.sort); all(); });
  advSegBind($("#q-type", el), v => { F.type = v; setUi("q-type", v); all(); });
  advSegBind($("#q-lvl", el), v => { F.lvl = v; setUi("q-lvl", v); $("#q-range", el).hidden = v !== "range"; all(); });
  $("#q-min", el).addEventListener("change", e => { F.min = clamp(+e.target.value || 1, 1, 200); setUi("q-min", F.min); all(); });
  $("#q-max", el).addEventListener("change", e => { F.max = clamp(+e.target.value || 200, 1, 200); setUi("q-max", F.max); all(); });
  $("#q-me", el).addEventListener("change", e => { S.settings.lvl = clamp(+e.target.value || 200, 1, 200); save(); all(); });
  $("#q-hide", el).addEventListener("change", e => { F.hide = e.target.checked; setUi("q-hide", F.hide); all(); });
  $("#q-papy", el).addEventListener("change", e => { F.papy = e.target.checked; all(); });
  $("#q-more", el).addEventListener("click", () => { shown += 60; list(); });
  all();

  // Papycha : chargé seulement quand la page des quêtes est ouverte
  advPapyQ().then(() => {
    if (!el.isConnected || VIEW !== "quetes") return;
    $("#q-papy", el).disabled = false;
    all(true);
  }).catch(() => {
    if (!el.isConnected) return;
    $("#q-papy", el).closest("label").hidden = true;
    tiles();
    $("#q-tiles", el).lastElementChild.outerHTML = advTile("Guides Papycha", "—", "indisponibles pour l'instant");
  });
}

/* ---------- Fiche quête ---------- */
const ADV_REC = { repeatable: "Répétable", daily: "Quotidienne", weekly: "Hebdomadaire", monthly: "Mensuelle", once: "Unique" };
function advPapyQLink(x) {
  const ids = ADV.q?.byKey[advQKey(x.name)];
  if (ids?.length) return `<span class="row" style="gap:4px 8px"><button type="button" class="link" data-sheet="quest:${ids[0]}"><span class="nm">${esc(advTxt(x.name))}</span></button>${papyLink(x.url, "Papycha")}</span>`;
  return papyLink(x.url, advTxt(x.name));
}
function advPapyQBlock(p) {
  const kv = [];
  const add = (k, v) => { if (v != null && v !== "") kv.push(`<dt>${esc(k)}</dt><dd>${v}</dd>`); };
  const xy = advXY(p.start_coordinates);
  add("Départ", xy ? `${advPos(xy)} · <a href="#carte/pos/${xy[0]}/${xy[1]}">voir sur la carte</a>` : "");
  add("PNJ", esc(advTxt(p.start_npc || "")));
  add("Niveau", p.level ? esc(p.level) : "");
  add("Zone", esc((p.zone || []).map(z => advTxt(z.name)).join(", ")));
  add("Rubrique", esc((p.section || []).map(z => advTxt(z.name)).filter(n => !/^\[(Quêtes|A classer)\]$/i.test(n)).join(", ")));
  add("Type", esc(advTxt(p.type || "")));
  add("Fréquence", esc(ADV_REC[p.recurrence] || advTxt(p.recurrence || "")));
  const acc = (p.access_conditions || []).map(a => `<li>${esc(advTxt(typeof a === "string" ? a : a?.name || ""))}</li>`).join("");
  const prev = (p.previous_quests || []).map(advPapyQLink), next = (p.next_quests || []).map(advPapyQLink);
  return `<dl class="kv">${kv.join("")}</dl>
    ${acc ? `<div><p class="label">Conditions d'accès</p><ul class="fx">${acc}</ul></div>` : ""}
    ${prev.length ? `<div><p class="label">Quêtes précédentes</p><div class="list">${prev.map(x => `<div class="li"><span>${x}</span></div>`).join("")}</div></div>` : ""}
    ${next.length ? `<div><p class="label">Quêtes suivantes</p><div class="list">${next.map(x => `<div class="li"><span>${x}</span></div>`).join("")}</div></div>` : ""}
    <div class="row">${papyLink(p.url, "Guide de la quête sur Papycha")}</div>
    ${advPapySrc()}`;
}
sheet("quest", async (el, id) => {
  await need("quests", "monsters", "world");
  const q = D.quests.quests[id];
  if (!q) throw new Error("Quête introuvable");
  advQ();
  const [name, cat, lmin, lmax, flags, steps, xp, kamas, rew, mons] = q;
  const cn = D.quests.qcats[cat]?.[0] || "Autres";
  const x = { lmin, lmax, lvl: lmin || lmax };
  const chips = [cn, advQLvl(x), plural(steps, "étape"), flags & 4 ? "Principale" : "", flags & 1 ? "Répétable" : "", flags & 2 ? "Donjon" : "", S.quests[id] ? "✓ Faite" : ""]
    .filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join("");
  el.innerHTML = sheetHead(`${advQImg("xl")}`, name, chips, "var(--c-adv)") + `
  <section class="panel">
    <h2>Ta progression</h2>
    <div class="row">${advDoneBox("quests", id, "J'ai terminé cette quête")}</div>
  </section>
  <section class="panel">
    <h2>Détails</h2>
    <dl class="kv">
      <dt>Catégorie</dt><dd>${esc(cn)}</dd>
      <dt>Niveau</dt><dd>${advQLvl(x)}</dd>
      <dt>Étapes</dt><dd>${fmt(steps)}</dd>
      <dt>Type</dt><dd>${[flags & 4 ? "quête principale" : "", flags & 1 ? "répétable" : "à faire une fois", flags & 2 ? "quête de donjon" : ""].filter(Boolean).join(", ")}</dd>
      ${xp ? `<dt>Expérience</dt><dd>coefficient × ${fmt(xp, 2)}</dd>` : ""}
      ${kamas ? `<dt>Kamas</dt><dd>coefficient × ${fmt(kamas, 2)}</dd>` : ""}
    </dl>
    ${xp || kamas ? `<p class="note">Les gains d'XP et de kamas sont donnés par le jeu sous forme de coefficients (cumulés sur toutes les étapes) : le montant réel dépend de ton niveau au moment de rendre la quête.</p>` : ""}
  </section>
  ${rew.length ? `<section class="panel"><h2>Objets en récompense</h2><div class="list">${rew.map(([i, n]) => {
    const it = item(i), p = price(i);
    return `<div class="li"><span>${itemLine(i, it ? `× ${fmt(n)} · ${esc(it.typeName)} · niv. ${it.lvl}` : "")}</span><div class="r">${p != null ? `<span class="chip kamas">${kam(p * n)}</span>` : ""}</div></div>`;
  }).join("")}</div></section>` : ""}
  ${mons.length ? `<section class="panel"><h2>Monstres à vaincre</h2><div class="list">${mons.map(m => `<div class="li"><span>${monLine(m)}</span><div class="r">${D.monsters.monsters[m]?.[4]?.length ? `<a class="btn sm" href="#carte/mon/${m}">Où le trouver</a>` : ""}</div></div>`).join("")}</div></section>` : ""}
  <section class="panel" id="q-papybox"><h2>Infos Papycha</h2><p class="muted small">Chargement des fiches de Papycha…</p></section>`;
  const sid = String(id);
  advPapyQ().then(() => {
    const box = $("#q-papybox", el); if (!box || !advCur("quest", sid)) return;
    const p = advQPapy(id);
    box.innerHTML = `<h2>Infos Papycha</h2>` + (p ? advPapyQBlock(p)
      : `<p class="muted small">Pas de fiche Papycha reliée à cette quête.</p><div class="row">${papyLink("https://papycha.fr/?s=" + encodeURIComponent(name), "Chercher sur Papycha")}</div>`);
  }).catch(() => { const box = $("#q-papybox", el); if (box) box.innerHTML = `<h2>Infos Papycha</h2>` + advPapyOff; });
});

/* ---------- Succès ---------- */
function advA() {
  if (ADV.a) return ADV.a;
  const A = D.quests.achievements, AC = D.quests.acats, list = [], byName = {};
  const topOf = c => { let x = +c, n = 0; while (AC[x] && AC[x][1] && AC[AC[x][1]] && n++ < 5) x = AC[x][1]; return x; };
  for (const [id, a] of Object.entries(A)) {
    list.push({ id: +id, name: a[0], n: norm(a[0] + " " + a[2] + " " + a[6].join(" ")), cat: a[1], top: topOf(a[1]), desc: a[2], pts: a[3], lvl: a[4], icon: a[5], rew: a[7].length });
    byName[norm(a[0])] = +id;
  }
  const ord = (a, b) => AC[a][2] - AC[b][2] || AC[a][0].localeCompare(AC[b][0], "fr");
  const tops = Object.keys(AC).filter(k => !AC[k][1] || !AC[AC[k][1]]).sort(ord).map(Number);
  const kids = {};
  for (const k of Object.keys(AC)) if (AC[k][1] && AC[AC[k][1]]) (kids[AC[k][1]] = kids[AC[k][1]] || []).push(+k);
  for (const k in kids) kids[k].sort(ord);
  const catOrder = {};
  let i = 0;
  const walk = c => { catOrder[c] = i++; (kids[c] || []).forEach(walk); };
  tops.forEach(walk);
  list.sort((a, b) => (catOrder[a.cat] ?? 999) - (catOrder[b.cat] ?? 999) || a.lvl - b.lvl || a.id - b.id);
  return (ADV.a = { list, tops, kids, byName, catOrder });
}
const advAchImg = (icon, cls = "") => `<img class="ico ${cls}" style="--cat:var(--kamas)" src="${asset(`gfx/achievements/${icon}.png`)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
function advAchRow(id, a) {
  a = a || D.quests.achievements[id];
  return `<div class="li ${S.ach[id] ? "done" : ""}">
    <button type="button" class="link itemline" data-sheet="achievement:${id}">${advAchImg(a[5])}<span class="t"><span class="nm">${esc(a[0])}</span><small>${esc(a[2])}</small></span></button>
    <div class="r"><span class="chips"><span class="chip kamas">${fmt(a[3])} pts</span>${a[4] ? `<span class="chip">niv. ${a[4]}</span>` : ""}${a[7].length ? `<span class="chip" title="Objets en récompense">🎁 ${fmt(a[7].length)}</span>` : ""}</span>${advDoneBox("ach", id)}</div>
  </div>`;
}
page("succes", {
  title: "Succès", icon: 23012, needs: ["quests"],
  intro: "Les succès du jeu par catégorie, avec leurs objectifs, points et récompenses. Coche ceux que tu as obtenus pour suivre tes points.",
  render: advSucces,
});
function advSucces(el) {
  const idx = advA(), AC = D.quests.acats;
  const F = { q: "", top: ui("a-top", "all"), sub: ui("a-sub", "all"), hide: ui("a-hide", false), sort: ui("a-sort", "cat") };
  let shown = 60, R = [];
  el.innerHTML = `<div class="stack">` + hero("succes") + `
  <div class="tiles" id="a-tiles"></div>
  <section class="panel">
    <div class="chips" id="a-tops"></div>
    <div class="chips" id="a-subs"></div>
    <div class="filters">
      <div class="search"><input type="search" id="a-q" placeholder="Succès, objectif, boss…" aria-label="Chercher un succès" autocomplete="off"></div>
      <label class="fld">Trier <select id="a-sort">${[["cat", "Par catégorie"], ["lvl", "Par niveau"], ["pts", "Plus de points"], ["name", "Par nom"]].map(([v, l]) => `<option value="${v}" ${v === F.sort ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" id="a-hide" ${F.hide ? "checked" : ""}> Masquer les succès obtenus</label>
    </div>
    <p class="note" id="a-note"></p>
    <div class="list" id="a-list"></div>
    <button type="button" class="btn more" id="a-more" hidden>Voir plus</button>
  </section></div>`;
  const inSel = x => (F.top === "all" || x.top === +F.top) && (F.sub === "all" || x.cat === +F.sub);
  const sumPts = arr => arr.reduce((s, x) => s + x.pts, 0);
  const chipsDraw = () => {
    const stat = c => { const arr = idx.list.filter(x => x.top === c); const d = arr.filter(x => S.ach[x.id]); return `${fmt(sumPts(d))}/${fmt(sumPts(arr))} pts`; };
    $("#a-tops", el).innerHTML = `<button type="button" class="chip ${F.top === "all" ? "on" : ""}" data-top="all">Toutes</button>` +
      idx.tops.filter(c => idx.list.some(x => x.top === c)).map(c => `<button type="button" class="chip ${String(c) === String(F.top) ? "on" : ""}" data-top="${c}">${esc(AC[c][0])} · ${stat(c)}</button>`).join("");
    const kids = F.top !== "all" ? (idx.kids[F.top] || []).filter(k => idx.list.some(x => x.cat === k)) : [];
    $("#a-subs", el).hidden = !kids.length;
    $("#a-subs", el).innerHTML = kids.length ? `<button type="button" class="chip ${F.sub === "all" ? "on" : ""}" data-sub="all">Toutes les sous-catégories</button>` +
      (idx.list.some(x => x.cat === +F.top) ? `<button type="button" class="chip ${String(F.sub) === String(F.top) ? "on" : ""}" data-sub="${F.top}">${esc(AC[F.top][0])} (général)</button>` : "") +
      kids.map(k => `<button type="button" class="chip ${String(k) === String(F.sub) ? "on" : ""}" data-sub="${k}">${esc(AC[k][0])}</button>`).join("") : "";
  };
  const filter = () => {
    const ws = F.q ? norm(F.q).split(" ") : null;
    R = idx.list.filter(x => inSel(x) && !(F.hide && S.ach[x.id]) && (!ws || ws.every(w => x.n.includes(w))));
    if (F.sort === "lvl") R.sort((a, b) => a.lvl - b.lvl || a.id - b.id);
    else if (F.sort === "pts") R.sort((a, b) => b.pts - a.pts || a.lvl - b.lvl);
    else if (F.sort === "name") R.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  };
  const list = () => {
    $("#a-list", el).innerHTML = R.slice(0, shown).map(x => advAchRow(x.id)).join("") || `<div class="empty"><strong>Aucun succès</strong><span>Change la catégorie ou la recherche.</span></div>`;
    const more = $("#a-more", el);
    more.hidden = R.length <= shown;
    more.textContent = `Voir plus (${fmt(R.length - shown)} de plus)`;
    $("#a-note", el).textContent = `${plural(R.length, "succès", "succès")} · ${fmt(sumPts(R))} points${R.length > shown ? ` · ${fmt(shown)} affichés` : ""}.`;
  };
  const tiles = () => {
    const done = idx.list.filter(x => S.ach[x.id]), tot = sumPts(idx.list), dp = sumPts(done);
    const sel = idx.list.filter(inSel), sd = sel.filter(x => S.ach[x.id]), st = sumPts(sel), sdp = sumPts(sd);
    $("#a-tiles", el).innerHTML =
      advTile("Points de succès", `${fmt(dp)} / ${fmt(tot)}`, "", tot ? dp / tot * 100 : 0) +
      advTile("Succès obtenus", `${fmt(done.length)} / ${fmt(idx.list.length)}`, "", done.length / idx.list.length * 100) +
      advTile("Catégorie choisie", `${fmt(sdp)} / ${fmt(st)}`, F.top === "all" ? "toutes catégories (points)" : esc(AC[F.sub !== "all" ? F.sub : F.top]?.[0] || "") + " (points)", st ? sdp / st * 100 : 0) +
      advTile("Sélection", `${fmt(sd.length)} / ${fmt(sel.length)}`, "succès obtenus dans la catégorie", sel.length ? sd.length / sel.length * 100 : 0);
  };
  const all = () => { shown = 60; filter(); list(); tiles(); };
  ADV.onDone = () => { tiles(); chipsDraw(); if (F.hide) { filter(); list(); } };
  ADV.onDone.el = el.firstElementChild;
  $("#a-tops", el).addEventListener("click", e => {
    const b = e.target.closest("[data-top]"); if (!b) return;
    F.top = b.dataset.top; F.sub = "all"; setUi("a-top", F.top); setUi("a-sub", "all"); chipsDraw(); all();
  });
  $("#a-subs", el).addEventListener("click", e => {
    const b = e.target.closest("[data-sub]"); if (!b) return;
    F.sub = b.dataset.sub; setUi("a-sub", F.sub); chipsDraw(); all();
  });
  const q = $("#a-q", el);
  q.addEventListener("input", debounce(() => { F.q = q.value; all(); }, 150));
  $("#a-sort", el).addEventListener("change", e => { F.sort = e.target.value; setUi("a-sort", F.sort); all(); });
  $("#a-hide", el).addEventListener("change", e => { F.hide = e.target.checked; setUi("a-hide", F.hide); all(); });
  $("#a-more", el).addEventListener("click", () => { shown += 60; list(); });
  if (F.top !== "all" && !idx.tops.includes(+F.top)) { F.top = "all"; F.sub = "all"; }
  chipsDraw(); all();
}
sheet("achievement", async (el, id) => {
  await need("quests", "monsters");
  const a = D.quests.achievements[id];
  if (!a) throw new Error("Succès introuvable");
  const idx = advA(), AC = D.quests.acats;
  const [name, cat, desc, pts, lvl, iconId, objs, rew, kamas, xp] = a;
  const catName = [AC[AC[cat]?.[1]]?.[0], AC[cat]?.[0]].filter(Boolean).join(" › ");
  const chips = [`${fmt(pts)} points`, lvl ? `niv. ${lvl}` : "", catName, S.ach[id] ? "✓ Obtenu" : ""].filter(Boolean).map(c => `<span class="chip">${esc(c)}</span>`).join("");
  // Objectifs : un autre succès, un monstre, ou un texte
  if (!ADV.monByName) { ADV.monByName = {}; for (const [mid, m] of Object.entries(D.monsters.monsters)) if (!(m[2] & 8)) ADV.monByName[norm(m[0])] = ADV.monByName[norm(m[0])] || +mid; }
  const obj = o => {
    const n = norm(o), aid = idx.byName[n], mid = ADV.monByName[n];
    if (aid && aid !== +id) return `<div class="li ${S.ach[aid] ? "done" : ""}"><button type="button" class="link itemline" data-sheet="achievement:${aid}">${advAchImg(D.quests.achievements[aid][5], "s")}<span class="t"><span class="nm">${esc(o)}</span><small>Succès · ${fmt(D.quests.achievements[aid][3])} pts</small></span></button><div class="r">${advDoneBox("ach", aid)}</div></div>`;
    if (mid) return `<div class="li"><span>${monLine(mid, "Monstre à vaincre · " + monLvl(D.monsters.monsters[mid]))}</span></div>`;
    return `<div class="li"><span class="nm">${esc(o)}</span></div>`;
  };
  const parents = Object.entries(D.quests.achievements).filter(([k, x]) => +k !== +id && x[6].some(o => norm(o) === norm(name))).slice(0, 8);
  el.innerHTML = sheetHead(advAchImg(iconId, "xl"), name, chips, "var(--kamas)") + `
  <section class="panel">
    <h2>Ta progression</h2>
    <div class="row">${advDoneBox("ach", id, "J'ai obtenu ce succès")}</div>
    ${desc ? `<p>${esc(desc)}</p>` : ""}
  </section>
  ${objs.length ? `<section class="panel"><h2>Objectifs</h2><div class="list">${objs.map(obj).join("")}</div></section>` : ""}
  <section class="panel">
    <h2>Récompenses</h2>
    <dl class="kv"><dt>Points</dt><dd>${fmt(pts)}</dd>${kamas ? `<dt>Kamas</dt><dd>coefficient × ${fmt(kamas, 2)}</dd>` : ""}${xp ? `<dt>Expérience</dt><dd>coefficient × ${fmt(xp, 2)}</dd>` : ""}</dl>
    ${kamas || xp ? `<p class="note">Les kamas et l'XP sont donnés par le jeu sous forme de coefficients : le montant réel dépend de ton niveau.</p>` : ""}
    ${rew.length ? `<div class="list">${rew.map(([i, n]) => `<div class="li"><span>${itemLine(i, item(i) ? `× ${fmt(n)} · ${esc(item(i).typeName)}` : "")}</span></div>`).join("")}</div>` : `<p class="muted small">Pas d'objet en récompense.</p>`}
  </section>
  ${parents.length ? `<section class="panel"><h2>Compte pour</h2><div class="list">${parents.map(([k, x]) => advAchRow(+k, x)).join("")}</div></section>` : ""}`;
});

/* ---------- Carte du Monde des Douze ---------- */
const ADV_LAYERS = [
  ["z", "Zaaps", "#46b8f0", true],
  ["dj", "Donjons", "#f05a5a", true],
  ["9", "Tanières", "#a888f0", false],
  ["2", "Hôtels de vente", "#e2b54a", false],
  ["3", "Ateliers", "#f08a4b", false],
  ["1", "Temples", "#ee7aa0", false],
  ["q", "Quêtes", "#8fd16a", false],
  ["4", "Divers (banques, transports…)", "#cfd8e3", false],
  ["lbl", "Noms des zones", "#ffffff", true],
];
const advLayerOf = h => h[1] === "Zaap" ? "z" : h[0] === 6 ? "dj" : h[0] === 10 || h[0] === 11 ? "q" : h[0] === 7 || h[0] === 8 || h[0] === 5 ? "4" : String(h[0]);
function advMapIdx() {
  if (ADV.map) return ADV.map;
  const W = D.world, MO = D.monsters.monsters;
  const cells = [], subCells = {}, marks = new Map(), hintsAt = {}, djAt = {}, djBySub = {}, hintsBySub = {};
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [k, sid] of Object.entries(W.grid)) {
    const [x, y] = k.split(",").map(Number);
    cells.push([x, y, sid, k]);
    (subCells[sid] = subCells[sid] || []).push([x, y]);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const mark = (k, l) => { const s = marks.get(k) || []; if (!s.includes(l)) s.push(l); marks.set(k, s); };
  for (const h of W.hints) {
    const k = `${h[2]},${h[3]}`, l = advLayerOf(h);
    (hintsAt[k] = hintsAt[k] || []).push(h);
    const sid = W.grid[k] || h[4];
    (hintsBySub[sid] = hintsBySub[sid] || []).push(h);
    mark(k, l);
  }
  for (const g of advDj().list) if (g.ent && g.ent[0] != null) {
    const k = `${g.ent[0]},${g.ent[1]}`;
    (djAt[k] = djAt[k] || []).push(g);
    if (W.grid[k]) (djBySub[W.grid[k]] = djBySub[W.grid[k]] || []).push(g);
    mark(k, g.kind === "den" ? "9" : "dj");
  }
  // Monstres par sous-zone (données des sous-zones + zones des monstres)
  const subMons = {}, monSubs = {};
  const link = (m, s) => { if (!MO[m] || MO[m][2] & 8) return; (subMons[s] = subMons[s] || new Set()).add(+m); (monSubs[m] = monSubs[m] || new Set()).add(+s); };
  for (const [s, sa] of Object.entries(W.subareas)) for (const m of sa[3]) link(m, +s);
  for (const [m, x] of Object.entries(MO)) for (const s of x[4] || []) link(m, s);
  // Récoltes
  const harvBySub = {}, harvSubs = {};
  for (const [job, res, lvl, subs, skill] of D.core.harvest) for (const s of subs) {
    const arr = harvBySub[s] = harvBySub[s] || [];
    if (!arr.some(h => h[1] === res)) arr.push([job, res, lvl, skill]);
    (harvSubs[res] = harvSubs[res] || new Set()).add(s);
  }
  // Centres des zones et sous-zones (noms sur la carte)
  const cen = (groups) => Object.entries(groups).map(([id, pts]) => {
    let sx = 0, sy = 0; for (const [x, y] of pts) { sx += x; sy += y; }
    const cx = sx / pts.length, cy = sy / pts.length;
    let best = pts[0], bd = 1e9; for (const p of pts) { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (d < bd) { bd = d; best = p; } }
    return { id: +id, x: best[0], y: best[1], n: pts.length };
  });
  const areaPts = {};
  for (const [sid, pts] of Object.entries(subCells)) { const a = W.subareas[sid]?.[1]; if (a != null) (areaPts[a] = areaPts[a] || []).push(...pts); }
  // Couleurs : teinte stable par zone, nuance par sous-zone
  const col = {};
  for (const sid of Object.keys(subCells)) {
    const a = W.subareas[sid]?.[1] ?? 0, h = (a * 137.508 + 190) % 360, l = 27 + (sid * 37 % 5) * 3;
    col[sid] = [`hsl(${h.toFixed(0)} 40% ${l}%)`, `hsl(${h.toFixed(0)} 62% ${l + 22}%)`, `hsl(${h.toFixed(0)} 14% ${Math.max(12, l - 12)}%)`];
  }
  return (ADV.map = { cells, subCells, marks, hintsAt, djAt, djBySub, hintsBySub, subMons, monSubs, harvBySub, harvSubs, col,
    areaC: cen(areaPts), subC: cen(subCells), bounds: [x0, y0, x1, y1], areaPts });
}
// Objet -> monstres qui le lâchent (pour la recherche sur la carte), construit à la demande
function advDropIdx() {
  if (ADV.drops) return ADV.drops;
  const out = {}, MS = ADV.map.monSubs;
  for (const [m, x] of Object.entries(D.monsters.monsters)) if (MS[m]) for (const d of x[5] || []) (out[d[0]] = out[d[0]] || []).push([+m, Math.max(d[1] || 0, d[2] || 0)]);
  return (ADV.drops = out);
}
const advSubName = sid => D.world.subareas[sid]?.[0] || `Sous-zone ${sid}`;
const advAreaName = sid => D.world.areas[D.world.subareas[sid]?.[1]]?.[0] || "";
const advSubBtn = sid => `<button type="button" class="chip" data-map-sub="${sid}">${esc(advSubName(sid))}${D.world.subareas[sid]?.[2] ? ` · niv. ${D.world.subareas[sid][2]}` : ""}</button>`;

page("carte", {
  title: "Carte", icon: 24006, needs: ["world", "monsters"],
  intro: "Le Monde des Douze case par case : zones, zaaps, donjons, ateliers. Touche une case pour voir ses monstres et ses ressources, ou cherche une ressource pour voir où la trouver.",
  render: advCarte,
});
function advCarte(el, args) {
  const MP = advMapIdx();
  const LAY = ui("map-layers", null) || Object.fromEntries(ADV_LAYERS.map(l => [l[0], l[3]]));
  const st = { cx: 0, cy: 0, s: 8, w: 0, h: 0, hl: null, sel: null, init: false };
  el.innerHTML = `<div class="stack" id="map-root">` + hero("carte") + `
  <section class="panel">
    <div class="filters">
      <div class="search"><input type="search" id="map-q" placeholder="Zone, monstre, ressource, donjon, zaap…" aria-label="Chercher sur la carte" autocomplete="off"></div>
      <span class="chips" id="map-hl"></span>
    </div>
    <div class="mapwrap" id="map-wrap">
      <canvas id="map-cv" role="img" aria-label="Carte du Monde des Douze"></canvas>
      <div class="mapzoom"><button type="button" data-z="in" aria-label="Zoomer">+</button><button type="button" data-z="out" aria-label="Dézoomer">−</button><button type="button" data-z="fit" aria-label="Voir tout le monde">⌂</button></div>
      <div id="map-xy" style="position:absolute;left:8px;bottom:8px;max-width:calc(100% - 16px);padding:3px 9px;border-radius:9px;background:rgb(11 17 27 / .85);color:var(--fg);font:700 .8rem var(--f-body);pointer-events:none;overflow-wrap:anywhere">Touche une case</div>
    </div>
    <div class="legend" id="map-layers">${ADV_LAYERS.map(([k, n, c]) => `<button type="button" class="chip ${LAY[k] ? "on" : ""}" data-layer="${k}" aria-pressed="${!!LAY[k]}"><i style="background:${c}"></i>${esc(n)}</button>`).join("")}</div>
    <p class="note">Glisse pour te déplacer, molette ou deux doigts pour zoomer. Les couleurs distinguent les zones (une nuance par sous-zone).</p>
  </section>
  <section class="panel" id="map-info"><h2>Informations</h2><p class="muted">Touche une case de la carte, ou cherche une zone, un monstre, une ressource ou un donjon.</p></section></div>`;
  const cv = $("#map-cv", el), ctx = cv.getContext("2d"), xy = $("#map-xy", el), info = $("#map-info", el);

  /* Vue */
  const toWorld = (px, py) => [st.cx + (px - st.w / 2) / st.s, st.cy + (py - st.h / 2) / st.s];
  const cellAt = (px, py) => { const [wx, wy] = toWorld(px, py); return [Math.round(wx), Math.round(wy)]; };
  const persist = debounce(() => setUi("map-view", [st.cx, st.cy, st.s]), 400);
  const fit = (pts, max = 40) => {
    if (!pts.length || !st.w) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    st.cx = (x0 + x1) / 2; st.cy = (y0 + y1) / 2;
    st.s = clamp(Math.min(st.w / (x1 - x0 + 4), st.h / (y1 - y0 + 4)), 1.5, max);
    draw(); persist();
  };
  const fitAll = () => { const b = MP.bounds; fit([[b[0], b[1]], [b[2], b[3]]]); };
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(paint); }
  function paint() {
    raf = 0;
    if (!cv.isConnected || !st.w) return;
    const { w, h, s, hl } = st, dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b111b"; ctx.fillRect(0, 0, w, h);
    const ox = w / 2 - st.cx * s, oy = h / 2 - st.cy * s, gap = s >= 9 ? 1 : 0, half = s / 2;
    for (const [x, y, sid, k] of MP.cells) {
      const X = x * s + ox - half, Y = y * s + oy - half;
      if (X > w || Y > h || X + s < 0 || Y + s < 0) continue;
      const c = MP.col[sid];
      const on = hl && (hl.subs.has(sid) || hl.cells.has(k));
      ctx.fillStyle = hl ? (on ? c[1] : c[2]) : c[0];
      ctx.fillRect(X, Y, s - gap, s - gap);
    }
    // Contour des cases en surbrillance
    if (hl && s >= 3) {
      ctx.strokeStyle = "#e2b54a"; ctx.lineWidth = s >= 10 ? 2 : 1;
      for (const [x, y, sid, k] of MP.cells) if (hl.cells.has(k)) ctx.strokeRect(x * s + ox - half + 1, y * s + oy - half + 1, s - 2, s - 2);
    }
    // Repères
    const r = clamp(s * 0.2, 2.2, 6), colOf = Object.fromEntries(ADV_LAYERS.map(l => [l[0], l[2]]));
    for (const [k, ls] of MP.marks) {
      const act = ls.filter(l => LAY[l]); if (!act.length) continue;
      const [x, y] = k.split(",").map(Number), X = x * s + ox, Y = y * s + oy;
      if (X < -10 || Y < -10 || X > w + 10 || Y > h + 10) continue;
      act.forEach((l, i) => {
        const dx = (i - (act.length - 1) / 2) * r * 2.3;
        ctx.beginPath();
        if (l === "dj" || l === "9") { ctx.moveTo(X + dx, Y - r * 1.3); ctx.lineTo(X + dx + r * 1.3, Y); ctx.lineTo(X + dx, Y + r * 1.3); ctx.lineTo(X + dx - r * 1.3, Y); ctx.closePath(); }
        else ctx.arc(X + dx, Y, r, 0, Math.PI * 2);
        ctx.fillStyle = colOf[l]; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "rgb(0 0 0 / .7)"; ctx.stroke();
      });
    }
    // Case choisie
    if (st.sel) {
      const [x, y] = st.sel;
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.strokeRect(x * s + ox - half - 1, y * s + oy - half - 1, s + 2, s + 2);
    }
    // Noms des zones (zones quand on est loin, sous-zones de près)
    if (LAY.lbl) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      const subs = s >= 14, list = subs ? MP.subC : MP.areaC;
      ctx.font = `800 ${subs ? 11 : 12}px Nunito, system-ui, sans-serif`;
      const placed = [];
      for (const c of list.slice().sort((a, b) => b.n - a.n)) {
        if (!subs && c.n * s * s < 900) continue;
        const X = c.x * s + ox, Y = c.y * s + oy;
        if (X < 0 || Y < 0 || X > w || Y > h) continue;
        const t = subs ? advSubName(c.id) : D.world.areas[c.id]?.[0] || "";
        const tw = ctx.measureText(t).width;
        if (placed.some(p => Math.abs(p[0] - X) < (p[2] + tw) / 2 + 4 && Math.abs(p[1] - Y) < 15)) continue;
        placed.push([X, Y, tw]);
        ctx.strokeStyle = "rgb(5 9 16 / .85)"; ctx.lineWidth = 3.5; ctx.strokeText(t, X, Y);
        ctx.fillStyle = hl ? "#f3f6fb" : "rgb(255 255 255 / .92)"; ctx.fillText(t, X, Y);
      }
    }
  }
  function resize() {
    if (!cv.isConnected) { ro.disconnect(); return; }
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    st.w = r.width; st.h = r.height;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    if (!st.init) { st.init = true; start(); }
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(cv);

  /* Survol et sélection */
  const label = (x, y) => { const sid = D.world.grid[`${x},${y}`]; return sid ? `[${x},${y}] ${advSubName(sid)} · ${advAreaName(sid)}` : `[${x},${y}]`; };
  function select(x, y, show = true) {
    st.sel = [x, y]; xy.textContent = label(x, y); draw();
    if (show) info.innerHTML = cellInfo(x, y);
  }
  function cellInfo(x, y) {
    const k = `${x},${y}`, sid = D.world.grid[k];
    const hints = MP.hintsAt[k] || [], djs = MP.djAt[k] || [];
    let html = `<h2>Case ${advPos([x, y])}</h2>`;
    if (!sid && !hints.length && !djs.length) return html + `<p class="muted">Pas de carte connue à cette position.</p>`;
    if (hints.length) html += `<div><p class="label">Sur cette case</p><div class="chips">${hints.map(h => `<span class="chip sec">${esc(advHint(h[1]))}</span>`).join("")}</div></div>`;
    if (djs.length) html += `<div><p class="label">Entrée de donjon</p><div class="list">${djs.map(g => `<div class="li ${S.dung[g.id] ? "done" : ""}"><button type="button" class="link itemline" data-sheet="dungeon:${g.id}">${monImg(g.boss || 0, "s")}<span class="t"><span class="nm">${esc(g.name)}</span><small>Niv. ${g.lvl}</small></span></button></div>`).join("")}</div></div>`;
    return html + (sid ? subInfo(sid, k) : "");
  }
  function subInfo(sid, k = "") {
    const sa = D.world.subareas[sid] || ["?", 0, 0, [], 0];
    const mons = [...(MP.subMons[sid] || [])].sort((a, b) => (D.monsters.monsters[a][3][0]?.[0] || 0) - (D.monsters.monsters[b][3][0]?.[0] || 0));
    const harv = (MP.harvBySub[sid] || []).slice().sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    const hints = (MP.hintsBySub[sid] || []).filter(h => `${h[2]},${h[3]}` !== k);
    const djs = (MP.djBySub[sid] || []).filter(g => `${g.ent[0]},${g.ent[1]}` !== k);
    const nCells = (MP.subCells[sid] || []).length;
    return `<div class="row between"><div><h3>${esc(sa[0])}</h3><p class="muted small">${esc(D.world.areas[sa[1]]?.[0] || "")}${sa[2] ? ` · niv. ${sa[2]}` : ""} · ${plural(nCells, "case")}${sa[4] ? " · capture possible" : ""}</p></div>
      <div class="row">${nCells ? `<button type="button" class="btn sm" data-map-hlsub="${sid}">Surligner la sous-zone</button>` : ""}</div></div>
      ${hints.length ? `<div><p class="label">Repères de la sous-zone</p><div class="chips">${hints.map(h => `<button type="button" class="chip" data-map-pos="${h[2]},${h[3]}">${esc(advHint(h[1]))} ${advPos([h[2], h[3]])}</button>`).join("")}</div></div>` : ""}
      ${djs.length ? `<div><p class="label">Donjons de la sous-zone</p><div class="chips">${djs.map(g => `<button type="button" class="chip" data-sheet="dungeon:${g.id}">${esc(g.name)} · niv. ${g.lvl}</button>`).join("")}</div></div>` : ""}
      <div><p class="label">Monstres (${fmt(mons.length)})</p>${mons.length ? `<div class="list">${mons.slice(0, 30).map(m => `<div class="li"><span>${monLine(m)}</span>${D.monsters.monsters[m][2] & 16 ? `<div class="r"><span class="chip kamas">Archimonstre</span></div>` : ""}</div>`).join("")}</div>${mons.length > 30 ? `<p class="muted small">… et ${fmt(mons.length - 30)} autres.</p>` : ""}` : `<p class="muted small">Aucun monstre connu ici.</p>`}</div>
      <div><p class="label">Ressources à récolter (${fmt(harv.length)})</p>${harv.length ? `<div class="list">${harv.map(([job, res, lvl, skill]) => `<div class="li"><span>${itemLine(res, `${esc(D.core.jobs[job]?.[0] || "Métier")} niv. ${lvl}${skill ? " · " + esc(skill) : ""}`)}</span><div class="r">${jobImg(job)}${price(res) != null ? `<span class="chip kamas">${kam(price(res))}</span>` : ""}</div></div>`).join("")}</div>` : `<p class="muted small">Aucune ressource récoltable connue ici.</p>`}</div>`;
  }

  /* Surbrillance */
  function setHl(lbl, subs = [], cells = [], doFit = true) {
    st.hl = { subs: new Set(subs.map(Number)), cells: new Set(cells) };
    $("#map-hl", el).innerHTML = `<span class="chip on">${esc(lbl)}</span><button type="button" class="chip" data-map-clear>✕ Effacer</button>`;
    const pts = [...st.hl.subs].flatMap(s => MP.subCells[s] || []).concat(cells.map(k => k.split(",").map(Number)));
    if (doFit && pts.length) fit(pts, 26); else draw();
    return pts.length;
  }
  function clearHl() { st.hl = null; $("#map-hl", el).innerHTML = ""; draw(); }
  function showSub(sid) {
    const pts = MP.subCells[sid] || [];
    setHl(advSubName(sid), [sid]);
    if (pts.length) {
      const c = MP.subC.find(c => c.id === +sid);
      st.sel = c ? [c.x, c.y] : pts[0];
      xy.textContent = label(...st.sel);
    }
    info.innerHTML = `<h2>Sous-zone</h2>` + subInfo(+sid) + (pts.length ? "" : `<p class="note">Cette sous-zone n'apparaît pas sur la carte du Monde des Douze (intérieur, donjon ou autre carte).</p>`);
    draw();
  }
  function showRes(id) {
    const subs = [...(MP.harvSubs[id] || [])];
    const drops = (advDropIdx()[id] || []).sort((a, b) => b[1] - a[1]);
    const dsubs = [...new Set(drops.slice(0, 12).flatMap(([m]) => [...(MP.monSubs[m] || [])]))];
    const n = setHl(itemName(id), subs.length ? subs : dsubs);
    const harvJobs = D.core.harvest.filter(h => h[1] === +id);
    info.innerHTML = `<h2>${esc(itemName(id))}</h2><div>${itemLine(id)}</div>
      ${harvJobs.length ? `<p class="muted small">Récolte : ${harvJobs.map(h => `${esc(D.core.jobs[h[0]]?.[0] || "")} niv. ${h[2]}`).join(", ")}</p>` : ""}
      ${subs.length ? `<div><p class="label">Où le récolter (${fmt(subs.length)} sous-zones)</p><div class="chips">${subs.sort((a, b) => (D.world.subareas[a]?.[2] || 0) - (D.world.subareas[b]?.[2] || 0)).map(advSubBtn).join("")}</div></div>` : ""}
      ${drops.length ? `<div><p class="label">Lâché par</p><div class="list">${drops.slice(0, 12).map(([m, p]) => `<div class="li"><span>${monLine(m)}</span><div class="r"><span class="chip">${fmt(p, 2)} %</span><button type="button" class="btn sm" data-map-mon="${m}">Où le trouver</button></div></div>`).join("")}</div></div>` : ""}
      ${!n ? `<p class="muted">Aucun emplacement connu sur la carte du Monde des Douze.</p>` : ""}`;
  }
  function showMon(m) {
    const subs = [...(MP.monSubs[m] || [])];
    const n = setHl(advMonName(m), subs);
    info.innerHTML = `<h2>${esc(advMonName(m))}</h2><div>${monLine(m)}</div>
      ${subs.length ? `<div><p class="label">Zones (${fmt(subs.length)})</p><div class="chips">${subs.map(advSubBtn).join("")}</div></div>` : ""}
      ${!n ? `<p class="muted">Ce monstre ne vit pas sur la carte du Monde des Douze (donjon ou autre carte).</p>` : ""}`;
  }
  function showArea(a) {
    const subs = Object.keys(MP.subCells).filter(s => D.world.subareas[s]?.[1] === +a).map(Number);
    setHl(D.world.areas[a]?.[0] || "Zone", subs);
    info.innerHTML = `<h2>${esc(D.world.areas[a]?.[0] || "Zone")}</h2><p class="muted small">${plural(subs.length, "sous-zone")}</p><div class="chips">${subs.sort((x, y) => (D.world.subareas[x][2] || 0) - (D.world.subareas[y][2] || 0)).map(advSubBtn).join("")}</div>`;
  }
  function showPos(x, y, lbl) {
    setHl(lbl || advPos([x, y]), [], [`${x},${y}`], false);
    st.cx = x; st.cy = y; st.s = Math.max(st.s, 22);
    select(x, y); persist();
  }
  function showHint(name) {
    const hs = D.world.hints.filter(h => advHint(h[1]) === name);
    setHl(name, [], hs.map(h => `${h[2]},${h[3]}`));
    info.innerHTML = `<h2>${esc(name)}</h2><div class="chips">${hs.map(h => `<button type="button" class="chip" data-map-pos="${h[2]},${h[3]}">${advPos([h[2], h[3]])} · ${esc(advSubName(D.world.grid[`${h[2]},${h[3]}`] || h[4]))}</button>`).join("")}</div>`;
  }
  function showDj(id) { const g = advDj().byId[id]; if (g?.ent) { showPos(g.ent[0], g.ent[1], g.name); } }

  /* Démarrage (une fois la taille connue) : adresse #carte/… ou dernière vue */
  function start() {
    const [kind, a, b] = args || [];
    const v = ui("map-view", null);
    if (v && v.length === 3) { st.cx = v[0]; st.cy = v[1]; st.s = v[2]; } else fitAll();
    if (kind === "pos" && a != null && b != null) showPos(+a, +b);
    else if (kind === "sub" && a) showSub(+a);
    else if (kind === "res" && a) showRes(+a);
    else if (kind === "mon" && a) showMon(+a);
    else if (kind === "dj" && a) showDj(a);
    else if (kind === "area" && a) showArea(+a);
    draw();
  }

  /* Déplacement, zoom (souris, doigts) */
  const P = new Map();
  let drag = null, pinch = null, moved = 0, downT = 0;
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const zoomAt = (px, py, f) => {
    const [wx, wy] = toWorld(px, py);
    st.s = clamp(st.s * f, 1.2, 64);
    st.cx = wx - (px - st.w / 2) / st.s; st.cy = wy - (py - st.h / 2) / st.s;
    draw(); persist();
  };
  cv.addEventListener("pointerdown", e => {
    cv.setPointerCapture(e.pointerId);
    P.set(e.pointerId, local(e));
    if (P.size === 1) { const [x, y] = local(e); drag = { x, y, cx: st.cx, cy: st.cy }; moved = 0; downT = Date.now(); cv.style.cursor = "grabbing"; }
    else if (P.size === 2) {
      const [a, b] = [...P.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, s: st.s, w: toWorld(mx, my) };
      moved = 99;
    }
  });
  cv.addEventListener("pointermove", e => {
    const p = local(e);
    if (!P.has(e.pointerId)) { if (e.pointerType === "mouse") xy.textContent = label(...cellAt(...p)); return; }
    P.set(e.pointerId, p);
    if (P.size >= 2 && pinch) {
      const [a, b] = [...P.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      st.s = clamp(pinch.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 1.2, 64);
      st.cx = pinch.w[0] - (mx - st.w / 2) / st.s; st.cy = pinch.w[1] - (my - st.h / 2) / st.s;
      draw(); persist();
    } else if (drag) {
      moved = Math.max(moved, Math.hypot(p[0] - drag.x, p[1] - drag.y));
      st.cx = drag.cx - (p[0] - drag.x) / st.s; st.cy = drag.cy - (p[1] - drag.y) / st.s;
      if (e.pointerType === "mouse") xy.textContent = label(...cellAt(...p));
      draw(); persist();
    }
  });
  const up = e => {
    if (!P.has(e.pointerId)) return;
    const p = P.get(e.pointerId);
    P.delete(e.pointerId);
    if (P.size === 1) { const [q] = [...P.values()]; drag = { x: q[0], y: q[1], cx: st.cx, cy: st.cy }; pinch = null; return; }
    if (P.size === 0) {
      cv.style.cursor = "";
      if (e.type === "pointerup" && moved < 7 && Date.now() - downT < 600) select(...cellAt(...p));
      drag = pinch = null;
    }
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", e => { e.preventDefault(); const [px, py] = local(e); zoomAt(px, py, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0016))); }, { passive: false });
  $(".mapzoom", el).addEventListener("click", e => {
    const b = e.target.closest("[data-z]"); if (!b) return;
    if (b.dataset.z === "fit") fitAll(); else zoomAt(st.w / 2, st.h / 2, b.dataset.z === "in" ? 1.5 : 1 / 1.5);
  });
  $("#map-layers", el).addEventListener("click", e => {
    const b = e.target.closest("[data-layer]"); if (!b) return;
    LAY[b.dataset.layer] = !LAY[b.dataset.layer];
    b.classList.toggle("on", LAY[b.dataset.layer]); b.setAttribute("aria-pressed", String(LAY[b.dataset.layer]));
    setUi("map-layers", { ...LAY }); draw();
  });
  // Boutons des panneaux (sous-zones, positions, monstres)
  $("#map-root", el).addEventListener("click", e => {
    const t = e.target.closest("[data-map-sub],[data-map-hlsub],[data-map-pos],[data-map-mon],[data-map-clear]"); if (!t) return;
    if (t.dataset.mapSub) showSub(+t.dataset.mapSub);
    else if (t.dataset.mapHlsub) setHl(advSubName(+t.dataset.mapHlsub), [+t.dataset.mapHlsub]);
    else if (t.dataset.mapPos) { const [x, y] = t.dataset.mapPos.split(",").map(Number); st.cx = x; st.cy = y; st.s = Math.max(st.s, 22); select(x, y, false); setHl(advPos([x, y]), [], [`${x},${y}`], false); }
    else if (t.dataset.mapMon) showMon(+t.dataset.mapMon);
    else if ("mapClear" in t.dataset) clearHl();
    $("#map-wrap", el).scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  /* Recherche sur la carte */
  const ent = (img, nm, meta) => `${img}<span class="t"><span class="nm">${esc(nm)}</span><span class="meta">${esc(meta)}</span></span>`;
  const pin = c => `<span style="width:30px;height:30px;flex:none;border-radius:8px;display:grid;place-items:center;background:${c};color:#0b111b;font-weight:800">⌖</span>`;
  searchBox($("#map-q", el), id => {
    const [t, v] = [id.slice(0, 1), id.slice(2)];
    if (t === "a") showArea(+v); else if (t === "s") showSub(+v); else if (t === "m") showMon(+v);
    else if (t === "i") showRes(+v); else if (t === "d") showDj(v); else if (t === "h") showHint(v);
  }, { source: q => {
    const ws = norm(q).split(" "), ok = s => ws.every(w => norm(s).includes(w)), out = [];
    for (const [a, x] of Object.entries(D.world.areas)) if (MP.areaPts[a] && ok(x[0])) out.push({ id: "a:" + a, html: ent(pin("#46b8f0"), x[0], "Zone") });
    for (const sid of Object.keys(MP.subCells)) { const sa = D.world.subareas[sid]; if (sa && ok(sa[0])) out.push({ id: "s:" + sid, html: ent(pin("#8fd16a"), sa[0], `Sous-zone · ${advAreaName(sid)}${sa[2] ? " · niv. " + sa[2] : ""}`) }); }
    for (const g of advDj().list) if (g.ent && ok(g.name)) out.push({ id: "d:" + g.id, html: ent(monImg(g.boss || 0, "s"), g.name, `Donjon · niv. ${g.lvl} · ${advPos(g.ent)}`) });
    const hn = new Set(); for (const h of D.world.hints) { const n = advHint(h[1]); if (!hn.has(n) && ok(n)) { hn.add(n); out.push({ id: "h:" + n, html: ent(pin("#e2b54a"), n, "Repère") }); } }
    let nm = 0; for (const m of Object.keys(MP.monSubs)) if (nm < 12 && ok(advMonName(m))) { nm++; out.push({ id: "m:" + m, html: ent(monImg(m, "s"), advMonName(m), "Monstre · " + monLvl(D.monsters.monsters[m])) }); }
    const drops = advDropIdx();
    for (const i of find(q, { limit: 12, filter: it => it && (MP.harvSubs[it.id] || drops[it.id]) })) out.push({ id: "i:" + i, html: ent(icon(i, "s"), itemName(i), MP.harvSubs[i] ? "Ressource à récolter" : "Objet lâché par des monstres") });
    return out.slice(0, 40);
  } });
}
