/* Encyclopédie : objets, panoplies, monstres et leurs fiches. */

/* ---------- Index inverses ---------- */
let DROPS_OF = null; // objet -> [[monstre, % grade 1, % grade 5, condition, niv. min, niv. max]]
function dropsOf(id) {
  if (!DROPS_OF) {
    DROPS_OF = {};
    for (const [mid, m] of Object.entries(D.monsters.monsters)) for (const d of m[5]) (DROPS_OF[d[0]] = DROPS_OF[d[0]] || []).push([+mid, d[1] || 0, d[2] || 0, d[3] || 0, d[4] || 0, d[5] || 0]);
  }
  return DROPS_OF[id] || [];
}
function harvestOf(id) { return D.core.harvest.filter(h => h[1] === +id); }
function setOfItem(id) { const it = item(id); return it && it.set ? D.core.sets[it.set] : null; }
function subName(id) { return D.world?.subareas[id]?.[0] || `Zone ${id}`; }
function areaOfSub(id) { const s = D.world?.subareas[id]; return s ? D.world.areas[s[1]]?.[0] || "" : ""; }

/* ---------- Catégories d'objets ---------- */
const FAMS = [
  ["all", "Tout", () => true],
  ["equip", "Équipements", it => [1, 3, 4, 5, 10, 11, 7].includes(it.sup)],
  ["weapon", "Armes", it => it.sup === 2],
  ["dofus", "Dofus et trophées", it => it.sup === 13],
  ["pet", "Familiers et montures", it => [12, 21, 22].includes(it.sup)],
  ["res", "Ressources", it => it.sup === 9],
  ["cons", "Consommables", it => it.sup === 6],
  ["cosm", "Apparats", it => it.sup >= 23 && it.sup <= 28],
  ["other", "Autres", it => ![1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 21, 22, 23, 24, 25, 26, 27, 28].includes(it.sup)],
];

/* ---------- Conditions (critères) lisibles ---------- */
const CRIT = { PL: "Niveau", CS: "Force", Cs: "Force de base", CI: "Intelligence", Ci: "Intelligence de base", CC: "Chance", Cc: "Chance de base", CA: "Agilité", Ca: "Agilité de base", CV: "Vitalité", Cv: "Vitalité de base", CW: "Sagesse", Cw: "Sagesse de base", CM: "PM", CP: "PA", Ps: "Alignement", Pa: "Niveau d'alignement", PP: "Grade d'alignement", PG: "Classe", PS: "Sexe", PJ: "Métier", Pj: "Métier", PO: "Objet possédé", Qf: "Quête terminée", Qa: "Quête en cours", Pk: "Bonus de panoplie", PX: "Abonnement", Sc: "Saison", PB: "Zone", Pm: "Monture", SI: "Carte" };
const OPS = { ">": "≥", "<": "≤", "=": "=", "!": "≠" };
function critText(c) {
  if (!c) return "";
  return c.split("&").map(p => p.replace(/[()]/g, "")).filter(Boolean).map(p => p.split("|").map(q => {
    const m = q.match(/^([A-Za-z]{2})([<>=!~])(.*)$/); if (!m) return q;
    let [, k, op, v] = m;
    if (op === ">") v = +v + 1; if (op === "<") v = +v - 1;
    let label = CRIT[k] || k;
    if (k === "PG") v = D.spells?.breeds[v]?.[0] || `classe ${v}`;
    if (k === "PS") v = v === "0" ? "masculin" : "féminin";
    if (k === "PO") v = itemName(String(v).split(",")[0]);
    if (k === "PJ" || k === "Pj") { const [j, l] = String(v).split(","); v = (D.core.jobs[j]?.[0] || j) + (l ? ` niv. ${l}` : ""); }
    if (k === "Qf" || k === "Qa") v = D.quests?.quests[v]?.[0] || v;
    return `${label} ${OPS[op] || op} ${v}`;
  }).join(" ou ")).join(" · ");
}

/* ---------- Petite courbe de prix ---------- */
function priceChart(id, w = 600, hgt = 150) {
  const h = (S.prices[id] || []).map(r => [r[0], unitOf(r)]).filter(r => r[1]);
  if (h.length < 2) return "";
  const xs = h.map(r => r[0]), ys = h.map(r => r[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = t => 40 + (x1 === x0 ? 0 : (t - x0) / (x1 - x0)) * (w - 50), Y = v => 10 + (y1 === y0 ? .5 : 1 - (v - y0) / (y1 - y0)) * (hgt - 30);
  const pts = h.map(r => `${X(r[0]).toFixed(1)},${Y(r[1]).toFixed(1)}`).join(" ");
  const cls = ys[ys.length - 1] > ys[0] ? "up" : ys[ys.length - 1] < ys[0] ? "down" : "flat";
  return `<div class="chart ${cls}"><svg viewBox="0 0 ${w} ${hgt}" role="img" aria-label="Évolution du prix">
    <line class="grid" x1="40" x2="${w - 10}" y1="${Y(y1)}" y2="${Y(y1)}"/><line class="grid" x1="40" x2="${w - 10}" y1="${Y(y0)}" y2="${Y(y0)}"/>
    <text class="axis" x="0" y="${Y(y1) + 4}">${fmt(y1)}</text><text class="axis" x="0" y="${Y(y0) + 4}">${fmt(y0)}</text>
    <text class="axis" x="40" y="${hgt - 2}">${dateFr(x0)}</text><text class="axis" x="${w - 10}" y="${hgt - 2}" text-anchor="end">${dateFr(x1)}</text>
    <polyline class="l" points="${pts}"/>${h.map(r => `<circle class="dot" r="3" cx="${X(r[0]).toFixed(1)}" cy="${Y(r[1]).toFixed(1)}"/>`).join("")}</svg></div>`;
}

/* ---------- Saisie d'un relevé de prix ---------- */
function priceForm(id) {
  const r = priceRec(id) || [0, 0, 0, 0];
  return `<form class="row" data-price-form="${id}">
    <label class="fld">Prix × 1<input type="number" min="0" inputmode="numeric" name="p1" value="${r[1] || ""}" placeholder="—"></label>
    <label class="fld">Lot de 10<input type="number" min="0" inputmode="numeric" name="p10" value="${r[2] || ""}" placeholder="—"></label>
    <label class="fld">Lot de 100<input type="number" min="0" inputmode="numeric" name="p100" value="${r[3] || ""}" placeholder="—"></label>
    <button class="btn primary">Enregistrer</button></form>`;
}
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-price-form]"); if (!f) return;
  e.preventDefault();
  const id = +f.dataset.priceForm, fd = new FormData(f);
  setPrice(id, fd.get("p1"), fd.get("p10"), fd.get("p100"));
  toast(`Prix de ${itemName(id)} enregistré.`);
  if ($("#sheet").open && HISTORY.length && HISTORY[HISTORY.length - 1][0] === "item") openSheet("item", id, false);
  else rerender();
});

/* ---------- Fiche objet ---------- */
sheet("item", async (el, id) => {
  await need("monsters", "world", "desc", "quests");
  const it = item(id); if (!it) throw new Error("Objet inconnu");
  const set = setOfItem(id), r = recipe(id), p = price(id), rec = priceRec(id);
  const chips = [`<span class="chip">${esc(it.typeName)}</span>`, `<span class="chip">Niveau ${it.lvl}</span>`, it.w ? `<span class="chip">${fmt(it.w)} pod${it.w > 1 ? "s" : ""}</span>` : "",
    it.flags & 1 ? `<span class="chip">Non échangeable</span>` : "", it.flags & 2 ? `<span class="chip">Éthéré</span>` : "", it.flags & 8 ? `<span class="chip">Deux mains</span>` : ""].join("");
  let html = sheetHead(icon(id, "xl"), it.name, chips, `var(${CATV[catOf(it)]})`);
  if (D.desc[id]) html += `<p class="desc">${esc(D.desc[id])}</p>`;
  // Prix
  const watched = S.watch.includes(it.id);
  html += `<section class="panel"><div class="row between"><h2>Prix à l'HDV</h2><label class="check"><input type="checkbox" data-watch="${id}" ${watched ? "checked" : ""}> Suivre</label></div>
    ${p != null ? `<div class="row"><span class="num gold" style="font-size:1.4rem;font-weight:700">${kam(p)}</span><span class="muted small">l'unité · ${ago(rec[0])}</span>${trendChip(id, 7)}</div>` : `<p class="muted small">Pas encore de prix relevé sur ${esc(S.settings.server)}. Note-le ici :</p>`}
    ${priceForm(id)}${priceChart(id)}
    ${it.npc >= 10 ? `<p class="muted small">Revente au PNJ : ${kam(it.npc / 10)} environ.</p>` : ""}</section>`;
  // Effets
  if (it.fx.length || it.wp?.length) {
    html += `<section class="panel"><h2>Effets</h2>${fxList(it.fx)}`;
    if (it.wp?.length) html += `<div class="chips"><span class="chip">${it.wp[0]} PA</span><span class="chip">Portée ${it.wp[1]}–${it.wp[2]}</span><span class="chip">Critique 1/${it.wp[3] ? Math.round(100 / it.wp[3]) : "—"} (${it.wp[3]} %, +${it.wp[4]})</span>${it.wp[5] ? `<span class="chip">${it.wp[5]} par tour</span>` : ""}</div>`;
    if (it.crit) html += `<p class="small"><span class="label">Conditions</span><br>${esc(critText(it.crit))}</p>`;
    html += `</section>`;
  } else if (it.crit) html += `<section class="panel"><h2>Conditions</h2><p>${esc(critText(it.crit))}</p></section>`;
  // Recette
  if (r) {
    const job = D.core.jobs[r[0]];
    let total = 0, missing = 0;
    const rows = r[1].map((ing, i) => { const c = costOf(ing, 2); const q = r[2][i]; if (c) total += c.v * q; else missing++;
      return `<div class="li"><div>${itemLine(ing, `× ${q}${S.stock[ing] ? ` · en stock : ${fmt(S.stock[ing])}` : ""}`, "s")}</div><div class="r num">${c ? `${kam(c.v)} × ${q} = <b>${kam(c.v * q)}</b>${c.how === "craft" ? ' <span class="chip">fabriqué</span>' : ""}` : '<span class="muted">prix ?</span>'}</div></div>`; }).join("");
    const net = p != null ? p * (1 - taxRate()) : null;
    html += `<section class="panel"><div class="row between"><h2>Recette</h2><span class="chips">${jobImg(r[0])}<span class="chip sec">${esc(job ? job[0] : "Sans métier")} · niv. ${it.lvl}</span><span class="chip">${r[1].length} cases</span></span></div>
      <div class="list">${rows}</div>
      <div class="tiles"><div class="tile kamas"><span class="label">Coût du craft</span><span class="v">${missing === r[1].length ? "—" : (missing ? "≥ " : "") + kam(total)}</span></div>
      <div class="tile"><span class="label">Vente nette</span><span class="v">${kam(net)}</span></div>
      <div class="tile"><span class="label">Marge</span><span class="v ${net != null && !missing ? (net - total >= 0 ? "pos" : "neg") : ""}">${net != null && !missing ? kam(net - total) : "—"}</span></div></div>
      ${missing ? `<p class="muted small">${plural(missing, "ingrédient")} sans prix : note leur prix pour un coût exact.</p>` : ""}
      <div class="row"><button class="btn" data-plan-add="${id}">＋ Ajouter au plan de craft</button></div></section>`;
  }
  // Obtention : récolte, butin
  const hv = harvestOf(id), drops = dropsOf(id);
  if (hv.length || drops.length) {
    html += `<section class="panel"><h2>Où l'obtenir</h2>`;
    for (const h of hv) html += `<p><span class="chip sec">${esc(D.core.jobs[h[0]]?.[0] || "")} niv. ${h[2]}</span> ${esc(h[4])} · ${h[3].slice(0, 12).map(s => `<a href="#carte/sub/${s}">${esc(subName(s))}</a>`).join(", ")}${h[3].length > 12 ? "…" : ""}</p>`;
    if (drops.length) {
      const ds = drops.slice().sort((a, b) => b[2] - a[2]);
      html += `<div class="list">${ds.slice(0, 40).map(d => { const m = D.monsters.monsters[d[0]];
        return `<div class="li"><div>${monLine(d[0], `${monLvl(m)}${m[2] & 1 ? " · boss" : ""}${m[2] & 16 ? " · archimonstre" : ""}`)}</div><div class="r"><span class="num">${fmt(d[1], 2)}${d[2] !== d[1] ? ` à ${fmt(d[2], 2)}` : ""} %</span>${d[3] === 1 ? `<span class="chip">perso niv. ${d[4] || 1}–${d[5] || 200}</span>` : d[3] === 2 ? '<span class="chip">sous condition</span>' : ""}</div></div>`; }).join("")}</div>
        ${ds.length > 40 ? `<p class="muted small">… et ${ds.length - 40} autres monstres.</p>` : ""}`;
    }
    html += `</section>`;
  }
  // Panoplie
  if (set) {
    html += `<section class="panel"><div class="row between"><h2>${esc(set[0])}</h2><button class="btn sm" data-sheet="set:${it.set}">Voir la panoplie</button></div><div class="cards">${set[1].map(i => `<div class="card" data-item="${i}">${icon(i, "s")}<span class="t"><span class="nm">${esc(itemName(i))}</span><small>niv. ${item(i)?.lvl ?? "?"}</small></span></div>`).join("")}</div></section>`;
  }
  // Sert à fabriquer
  const used = usedIn(id);
  if (used.length) {
    html += `<section class="panel"><h2>Sert à fabriquer (${used.length})</h2><div class="list">${used.slice().sort((a, b) => item(a).lvl - item(b).lvl).slice(0, 60).map(u => {
      const rr = recipe(u); const q = rr[2][rr[1].indexOf(+id)];
      return `<div class="li"><div>${itemLine(u, `${esc(D.core.jobs[rr[0]]?.[0] || "")} niv. ${item(u).lvl} · × ${q}`, "s")}</div><div class="r">${price(u) != null ? `<span class="num gold">${kam(price(u))}</span>` : ""}</div></div>`; }).join("")}</div>${used.length > 60 ? `<p class="muted small">… et ${used.length - 60} autres.</p>` : ""}</section>`;
  }
  // Almanax, quêtes
  if (typeof almOfferDays === "function") {
    const days = almOfferDays(id, 365);
    if (days.length) html += `<section class="panel"><h2>Offrande de l'Almanax</h2><p>${days.slice(0, 6).map(d => `<a href="#almanax/${d[0]}">${esc(dayFr(d[0]))}</a> (× ${d[1]})`).join(" · ")}</p></section>`;
  }
  const qrew = Object.entries(D.quests.quests).filter(([, q]) => q[8].some(x => x[0] === +id));
  if (qrew.length) html += `<section class="panel"><h2>Récompense de quête</h2><div class="chips">${qrew.slice(0, 20).map(([qid, q]) => `<button class="chip" data-sheet="quest:${qid}">${esc(q[0])}</button>`).join("")}</div></section>`;
  // Inventaire
  html += `<section class="panel"><div class="row between"><h2>Inventaire</h2><label class="fld">Quantité possédée<input type="number" min="0" data-stock="${id}" value="${S.stock[id] || ""}" placeholder="0"></label></div></section>`;
  el.innerHTML = html;
});
document.addEventListener("change", e => {
  const w = e.target.closest("[data-watch]");
  if (w) { const id = +w.dataset.watch; S.watch = S.watch.filter(x => x !== id); if (w.checked) S.watch.push(id); save(); toast(w.checked ? "Objet suivi." : "Objet retiré du suivi."); }
  const s = e.target.closest("[data-stock]");
  if (s) { const id = +s.dataset.stock, v = Math.max(0, +s.value || 0); if (v) S.stock[id] = v; else delete S.stock[id]; save(); toast("Inventaire mis à jour."); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-plan-add]"); if (!b) return;
  const id = +b.dataset.planAdd, ex = S.plan.find(p => p.id === id);
  if (ex) ex.n++; else S.plan.push({ id, n: 1 });
  save(); toast(`${itemName(id)} ajouté au plan de craft.`);
});

/* ---------- Fiche panoplie ---------- */
sheet("set", async (el, id) => {
  const s = D.core.sets[id]; if (!s) throw new Error("Panoplie inconnue");
  const lvl = Math.max(...s[1].map(i => item(i)?.lvl || 0));
  let html = sheetHead(icon(s[1][0], "xl"), s[0], `<span class="chip">${s[1].length} objets</span><span class="chip">Niveau ${lvl}</span>`);
  html += `<section class="panel"><h2>Objets</h2><div class="list">${s[1].map(i => `<div class="li"><div>${itemLine(i)}</div><div class="r">${price(i) != null ? `<span class="num gold">${kam(price(i))}</span>` : ""}</div></div>`).join("")}</div></section>`;
  html += `<section class="panel"><h2>Bonus de panoplie</h2>${s[2].map((b, k) => b.length ? `<div><span class="label">${k + 1} objets</span>${fxList(b)}</div>` : "").join("") || '<p class="muted">Aucun bonus.</p>'}</section>`;
  el.innerHTML = html;
});

/* ---------- Fiche monstre ---------- */
sheet("mon", async (el, id) => {
  await need("monsters", "world");
  const m = D.monsters.monsters[id]; if (!m) throw new Error("Monstre inconnu");
  const race = D.monsters.races[m[1]];
  const chips = [race ? `<span class="chip">${esc(race[0])}</span>` : "", `<span class="chip">${monLvl(m)}</span>`, m[2] & 1 ? '<span class="chip">Boss</span>' : "", m[2] & 2 ? '<span class="chip">Miniboss</span>' : "", m[2] & 16 ? '<span class="chip">Archimonstre</span>' : ""].join("");
  let html = sheetHead(monImg(id, "xl"), m[0], chips, "var(--bad)");
  if (m[3].length) html += `<section class="panel"><h2>Caractéristiques</h2><div class="tablewrap"><table><thead><tr><th>Grade</th><th class="n">Niv.</th><th class="n">PV</th><th class="n">PA</th><th class="n">PM</th><th class="n">XP</th><th class="n">Terre</th><th class="n">Eau</th><th class="n">Air</th><th class="n">Feu</th><th class="n">Neutre</th></tr></thead><tbody>
    ${m[3].map((g, i) => `<tr><td class="mc" data-label="Grade">${i + 1}</td><td class="n" data-label="Niveau">${g[0]}</td><td class="n" data-label="PV">${fmt(g[1])}</td><td class="n" data-label="PA">${g[2]}</td><td class="n" data-label="PM">${g[3]}</td><td class="n" data-label="XP">${fmt(g[4])}</td>${[6, 7, 8, 9, 10].map((k, j) => `<td class="n" data-label="Rés. ${["Terre", "Eau", "Air", "Feu", "Neutre"][j]}">${g[k]} %</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  const subs = m[4].filter(s => D.world.subareas[s]);
  if (subs.length) html += `<section class="panel"><h2>Où le trouver</h2><div class="chips">${subs.map(s => `<a class="chip" href="#carte/sub/${s}">${esc(subName(s))}${D.world.subareas[s][2] ? ` · niv. ${D.world.subareas[s][2]}` : ""}</a>`).join("")}</div></section>`;
  const djs = Object.entries(D.world.dungeons).filter(([, d]) => d[4].includes(+id));
  if (djs.length) html += `<section class="panel"><h2>Donjons</h2><div class="chips">${djs.map(([k, d]) => `<button class="chip sec" data-sheet="dungeon:${k}">${esc(d[0])} · niv. ${d[1]}</button>`).join("")}</div></section>`;
  if (m[5].length) {
    const pp = (S.settings.pp || 100) / 100;
    const ds = m[5].slice().sort((a, b) => (b[2] || 0) - (a[2] || 0));
    let ev = 0;
    html += `<section class="panel"><h2>Butin</h2><div class="list">${ds.map(d => { const v = price(d[0]); const ch = Math.min(1, (d[2] || 0) / 100 * pp); if (v && d[3] !== 2) ev += v * ch;
      return `<div class="li"><div>${itemLine(d[0], "", "s")}</div><div class="r"><span class="num">${fmt(d[1], 2)}${d[2] !== d[1] ? ` à ${fmt(d[2], 2)}` : ""} %</span>${d[3] === 1 ? `<span class="chip">perso niv. ${d[4] || 1}–${d[5] || 200}</span>` : d[3] === 2 ? '<span class="chip">sous condition</span>' : ""}${d[6] ? '<span class="chip">sans prospection</span>' : ""}${v ? `<span class="num gold">${kam(v)}</span>` : ""}</div></div>`; }).join("")}</div>
      <p class="muted small">Valeur moyenne d'un combat contre lui (grade 5, prospection ${fmt(pp * 100)}, objets dont le prix est relevé) : <b class="gold">${kam(ev)}</b>.</p></section>`;
  }
  el.innerHTML = html;
});

/* ---------- Page Objets ---------- */
page("objets", {
  title: "Objets", icon: 16041, intro: "Tous les objets de Dofus Touch : effets, recettes, butin, prix relevés.", needs: ["monsters"],
  render(el) {
    const f = ui("objF", { q: "", fam: "all", type: "", min: 1, max: 200, sort: "lvl", craft: false, priced: false });
    el.innerHTML = hero("objets") + `<section class="panel"><div class="filters">
      <div class="search"><input type="search" id="o-q" placeholder="Nom de l'objet…" value="${esc(f.q)}" aria-label="Rechercher"></div>
      <select id="o-fam" aria-label="Famille">${FAMS.map(x => `<option value="${x[0]}" ${f.fam === x[0] ? "selected" : ""}>${x[1]}</option>`).join("")}</select>
      <select id="o-type" aria-label="Type"></select>
      <label class="fld">Niv. min<input type="number" id="o-min" min="0" max="200" value="${f.min}"></label>
      <label class="fld">Niv. max<input type="number" id="o-max" min="0" max="200" value="${f.max}"></label>
      <select id="o-sort" aria-label="Trier"><option value="lvl">Niveau</option><option value="lvld">Niveau décroissant</option><option value="name">Nom</option><option value="price">Prix relevé</option></select>
      <label class="check"><input type="checkbox" id="o-craft" ${f.craft ? "checked" : ""}> Fabricable</label>
      <label class="check"><input type="checkbox" id="o-priced" ${f.priced ? "checked" : ""}> Avec prix</label></div>
      <p class="muted small" id="o-count"></p><div class="cards" id="o-list"></div><button class="btn more" id="o-more" hidden>Voir plus</button></section>`;
    $("#o-sort").value = f.sort;
    let shown = 60, list = [];
    const fillTypes = () => {
      const fam = FAMS.find(x => x[0] === f.fam);
      const ts = Object.entries(D.core.types).filter(([, t]) => fam[2]({ sup: t[1] })).sort((a, b) => a[1][0].localeCompare(b[1][0]));
      $("#o-type").innerHTML = `<option value="">Tous les types</option>` + ts.map(([k, t]) => `<option value="${k}" ${f.type === k ? "selected" : ""}>${esc(t[0])}</option>`).join("");
    };
    const run = () => {
      const fam = FAMS.find(x => x[0] === f.fam)[2];
      const words = norm(f.q).split(" ").filter(Boolean);
      list = [];
      for (const [id, r] of Object.entries(D.core.items)) {
        if (r[2] < f.min || r[2] > f.max) continue;
        if (f.type && String(r[1]) !== f.type) continue;
        const it = item(id); if (!fam(it)) continue;
        if (f.craft && !D.core.recipes[id]) continue;
        if (f.priced && price(id) == null) continue;
        if (words.length) { const nm = norm(r[0]); if (!words.every(w => nm.includes(w))) continue; }
        list.push(it);
      }
      const s = f.sort;
      list.sort((a, b) => s === "name" ? a.name.localeCompare(b.name) : s === "lvld" ? b.lvl - a.lvl : s === "price" ? (price(b.id) || 0) - (price(a.id) || 0) : a.lvl - b.lvl || a.name.localeCompare(b.name));
      shown = 60; draw();
    };
    const draw = () => {
      $("#o-count").textContent = `${fmt(list.length)} objet${list.length > 1 ? "s" : ""}`;
      $("#o-list").innerHTML = list.slice(0, shown).map(it => { const p = price(it.id);
        return `<button class="card" data-item="${it.id}">${icon(it.id)}<span class="t"><span class="nm">${esc(it.name)}</span><small>${esc(it.typeName)} · niv. ${it.lvl}${p != null ? ` · <span class="gold">${kam(p)}</span>` : ""}</small></span></button>`; }).join("") || `<div class="empty"><strong>Aucun objet</strong><span>Élargis les filtres.</span></div>`;
      $("#o-more").hidden = list.length <= shown;
    };
    const upd = () => { f.q = $("#o-q").value; f.fam = $("#o-fam").value; f.type = $("#o-type").value; f.min = +$("#o-min").value || 0; f.max = +$("#o-max").value || 200; f.sort = $("#o-sort").value; f.craft = $("#o-craft").checked; f.priced = $("#o-priced").checked; setUi("objF", f); run(); };
    fillTypes();
    $("#o-fam").addEventListener("change", () => { f.type = ""; f.fam = $("#o-fam").value; fillTypes(); upd(); });
    ["#o-type", "#o-min", "#o-max", "#o-sort", "#o-craft", "#o-priced"].forEach(s => $(s).addEventListener("change", upd));
    $("#o-q").addEventListener("input", debounce(upd, 200));
    $("#o-more").addEventListener("click", () => { shown += 60; draw(); });
    run();
  },
});

/* ---------- Page Panoplies ---------- */
page("panoplies", {
  title: "Panoplies", icon: 1048, intro: "Les panoplies, leurs objets et leurs bonus selon le nombre d'objets portés.",
  render(el) {
    const f = ui("setF", { q: "", min: 1, max: 200 });
    el.innerHTML = hero("panoplies") + `<section class="panel"><div class="filters"><div class="search"><input type="search" id="s-q" placeholder="Panoplie ou objet…" value="${esc(f.q)}"></div>
      <label class="fld">Niv. min<input type="number" id="s-min" value="${f.min}"></label><label class="fld">Niv. max<input type="number" id="s-max" value="${f.max}"></label></div><p class="muted small" id="s-count"></p><div class="cards" id="s-list"></div></section>`;
    const sets = Object.entries(D.core.sets).map(([k, s]) => ({ id: k, name: s[0], items: s[1], lvl: Math.max(0, ...s[1].map(i => item(i)?.lvl || 0)) })).filter(s => s.items.length).sort((a, b) => a.lvl - b.lvl);
    const run = () => {
      f.q = $("#s-q").value; f.min = +$("#s-min").value || 0; f.max = +$("#s-max").value || 200; setUi("setF", f);
      const ws = norm(f.q).split(" ").filter(Boolean);
      const l = sets.filter(s => s.lvl >= f.min && s.lvl <= f.max && (!ws.length || ws.every(w => norm(s.name + " " + s.items.map(itemName).join(" ")).includes(w))));
      $("#s-count").textContent = `${l.length} panoplies`;
      $("#s-list").innerHTML = l.slice(0, 200).map(s => `<button class="card" data-sheet="set:${s.id}">${icon(s.items[0])}<span class="t"><span class="nm">${esc(s.name)}</span><small>niv. ${s.lvl} · ${s.items.length} objets</small></span></button>`).join("");
    };
    $("#s-q").addEventListener("input", debounce(run, 200)); $("#s-min").addEventListener("change", run); $("#s-max").addEventListener("change", run);
    run();
  },
});

/* ---------- Page Monstres ---------- */
page("monstres", {
  title: "Monstres", icon: "m:31", intro: "Bestiaire : niveaux, résistances, zones et butin de chaque monstre.", needs: ["monsters", "world"],
  render(el) {
    const f = ui("monF", { q: "", race: "", min: 1, max: 250, kind: "" });
    const races = Object.entries(D.monsters.races).filter(([k]) => Object.values(D.monsters.monsters).some(m => String(m[1]) === k && !(m[2] & 8))).sort((a, b) => a[1][0].localeCompare(b[1][0]));
    el.innerHTML = hero("monstres") + `<section class="panel"><div class="filters"><div class="search"><input type="search" id="m-q" placeholder="Monstre ou objet lâché…" value="${esc(f.q)}"></div>
      <select id="m-race"><option value="">Toutes les races</option>${races.map(([k, r]) => `<option value="${k}" ${f.race === k ? "selected" : ""}>${esc(r[0])}</option>`).join("")}</select>
      <select id="m-kind"><option value="">Tous</option><option value="boss">Boss</option><option value="archi">Archimonstres</option><option value="normal">Monstres communs</option></select>
      <label class="fld">Niv. min<input type="number" id="m-min" value="${f.min}"></label><label class="fld">Niv. max<input type="number" id="m-max" value="${f.max}"></label></div>
      <p class="muted small" id="m-count"></p><div class="cards" id="m-list"></div><button class="btn more" id="m-more" hidden>Voir plus</button></section>`;
    $("#m-kind").value = f.kind;
    let list = [], shown = 60;
    const run = () => {
      f.q = $("#m-q").value; f.race = $("#m-race").value; f.kind = $("#m-kind").value; f.min = +$("#m-min").value || 0; f.max = +$("#m-max").value || 250; setUi("monF", f);
      const ws = norm(f.q).split(" ").filter(Boolean);
      list = Object.entries(D.monsters.monsters).filter(([, m]) => {
        if (m[2] & 8 || !m[3].length) return false;
        if (f.race && String(m[1]) !== f.race) return false;
        if (f.kind === "boss" && !(m[2] & 1)) return false; if (f.kind === "archi" && !(m[2] & 16)) return false; if (f.kind === "normal" && (m[2] & 17)) return false;
        const l = m[3][0][0]; if (l > f.max || m[3][m[3].length - 1][0] < f.min) return false;
        if (ws.length) { const s = norm(m[0]); if (!ws.every(w => s.includes(w)) && !m[5].some(d => ws.every(w => norm(itemName(d[0])).includes(w)))) return false; }
        return true;
      }).sort((a, b) => a[1][3][0][0] - b[1][3][0][0]);
      shown = 60; draw();
    };
    const draw = () => {
      $("#m-count").textContent = `${fmt(list.length)} monstres`;
      $("#m-list").innerHTML = list.slice(0, shown).map(([id, m]) => `<button class="card" data-mon="${id}">${monImg(id)}<span class="t"><span class="nm">${esc(m[0])}</span><small>${monLvl(m)} · ${esc(D.monsters.races[m[1]]?.[0] || "")}</small></span></button>`).join("");
      $("#m-more").hidden = list.length <= shown;
    };
    $("#m-q").addEventListener("input", debounce(run, 250)); ["#m-race", "#m-kind", "#m-min", "#m-max"].forEach(s => $(s).addEventListener("change", run));
    $("#m-more").addEventListener("click", () => { shown += 60; draw(); });
    run();
  },
});
