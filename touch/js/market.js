/* Marché : prix relevés à l'HDV, rentabilité des crafts (et simulateur), brisage. */

/* ---------- Prix ---------- */
function mkPriceRow(id) {
  const r = priceRec(id), p = r ? unitOf(r) : null;
  return `<div class="li" data-row="${id}"><div>${itemLine(id, r ? `${esc(item(id)?.typeName || "")} · ${ago(r[0])}` : "pas encore relevé", "s")}</div>
    <div class="r">${p != null ? `<span class="num gold">${kam(p)}</span>` : ""}${trendChip(id, 7)}${r && (r[2] || r[3]) ? `<span class="chip">×10 ${kam(r[2])} · ×100 ${kam(r[3])}</span>` : ""}
    <span class="row" style="gap:4px"><input class="sm" type="number" min="0" inputmode="numeric" placeholder="× 1" data-q1="${id}" aria-label="Prix à l'unité"><input class="sm" type="number" min="0" inputmode="numeric" placeholder="× 10" data-q10="${id}" aria-label="Prix du lot de 10"><input class="sm" type="number" min="0" inputmode="numeric" placeholder="× 100" data-q100="${id}" aria-label="Prix du lot de 100"><button class="btn sm" data-qsave="${id}">OK</button></span></div></div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-qsave]"); if (!b) return;
  const id = +b.dataset.qsave, row = b.closest(".li") || document;
  const v = k => $(`[data-q${k}="${id}"]`, row)?.value;
  if (!v(1) && !v(10) && !v(100)) { toast("Indique au moins un prix."); return; }
  setPrice(id, v(1), v(10), v(100));
  toast(`Prix de ${itemName(id)} enregistré.`);
  const nr = document.createElement("div"); nr.innerHTML = mkPriceRow(id); row.replaceWith(nr.firstElementChild);
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const i = e.target.closest("[data-q1],[data-q10],[data-q100]"); if (!i) return;
  e.preventDefault(); const id = i.dataset.q1 || i.dataset.q10 || i.dataset.q100; $(`[data-qsave="${id}"]`, i.closest(".li"))?.click();
});

// Objets à relever : suivis, ingrédients du plan, offrandes des prochains jours
function tourItems() {
  const ids = new Set(S.watch);
  for (const [id] of planNeeds()) ids.add(+id);
  if (typeof almOfferNext === "function") for (const d of almOfferNext(7)) if (d.item) ids.add(d.item);
  return [...ids].filter(id => item(id));
}

page("prix", {
  title: "Prix HDV", icon: 100056, intro: "Tes relevés de l'hôtel des ventes : à l'unité, par 10 ou par 100. Ils servent partout (crafts, brisage, butin, Almanax).",
  render(el) {
    const f = ui("prixF", { q: "", sort: "recent", fam: "all", mode: "list" });
    const n = Object.keys(S.prices).length;
    el.innerHTML = hero("prix", `<div class="chips"><span class="chip on">Serveur ${esc(S.settings.server)}</span><span class="chip on">${plural(n, "objet relevé")}</span></div>`) +
      `<section class="panel"><h2>Relever un prix</h2><div class="search"><input type="search" id="p-add" placeholder="Cherche un objet pour noter son prix…" aria-label="Objet à relever"></div><div class="list" id="p-new"></div></section>
      <section class="panel"><div class="row between"><h2>Mes prix</h2><div class="seg" id="p-mode"><button data-m="list">Relevés</button><button data-m="tour">Tournée</button></div></div>
      <div class="filters" id="p-filters"><div class="search"><input type="search" id="p-q" placeholder="Filtrer…" value="${esc(f.q)}"></div>
        <select id="p-fam">${FAMS.map(x => `<option value="${x[0]}">${x[1]}</option>`).join("")}</select>
        <select id="p-sort"><option value="recent">Plus récents</option><option value="old">À revérifier (plus anciens)</option><option value="name">Nom</option><option value="price">Prix</option><option value="up">Plus fortes hausses (7 j)</option><option value="down">Plus fortes baisses (7 j)</option></select></div>
      <p class="muted small" id="p-info"></p><div class="list" id="p-list"></div><button class="btn more" id="p-more" hidden>Voir plus</button></section>`;
    $("#p-fam").value = f.fam; $("#p-sort").value = f.sort;
    searchBox($("#p-add"), id => { $("#p-new").insertAdjacentHTML("afterbegin", mkPriceRow(id)); $(`[data-q1="${id}"]`)?.focus(); });
    let shown = 50, ids = [];
    const draw = () => {
      $$("#p-mode button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === f.mode));
      $("#p-filters").hidden = f.mode === "tour";
      if (f.mode === "tour") {
        ids = tourItems().sort((a, b) => (priceRec(a)?.[0] || 0) - (priceRec(b)?.[0] || 0));
        $("#p-info").textContent = ids.length ? `${ids.length} objets à vérifier : suivis, ingrédients de ton plan de craft et offrandes des 7 prochains jours, les plus anciens d'abord.` : "";
        $("#p-list").innerHTML = ids.map(mkPriceRow).join("") || `<div class="empty"><strong>Rien à relever</strong><span>Suis des objets (case « Suivre » des fiches) ou remplis ton plan de craft.</span></div>`;
        $("#p-more").hidden = true; return;
      }
      const fam = FAMS.find(x => x[0] === f.fam)[2], ws = norm(f.q).split(" ").filter(Boolean);
      ids = Object.keys(S.prices).map(Number).filter(id => { const it = item(id); return it && fam(it) && (!ws.length || ws.every(w => norm(it.name).includes(w))); });
      const t = id => trend(id, 7) ?? 0;
      ids.sort((a, b) => f.sort === "name" ? itemName(a).localeCompare(itemName(b)) : f.sort === "price" ? price(b) - price(a) : f.sort === "old" ? priceRec(a)[0] - priceRec(b)[0] : f.sort === "up" ? t(b) - t(a) : f.sort === "down" ? t(a) - t(b) : priceRec(b)[0] - priceRec(a)[0]);
      $("#p-info").textContent = `${ids.length} objets`;
      $("#p-list").innerHTML = ids.slice(0, shown).map(mkPriceRow).join("") || `<div class="empty"><strong>Aucun prix relevé</strong><span>Cherche un objet ci-dessus, ou note un prix depuis sa fiche.</span></div>`;
      $("#p-more").hidden = ids.length <= shown;
    };
    const upd = () => { f.q = $("#p-q").value; f.fam = $("#p-fam").value; f.sort = $("#p-sort").value; setUi("prixF", f); shown = 50; draw(); };
    $("#p-q").addEventListener("input", debounce(upd, 200)); $("#p-fam").addEventListener("change", upd); $("#p-sort").addEventListener("change", upd);
    $("#p-mode").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { f.mode = b.dataset.m; setUi("prixF", f); draw(); } });
    $("#p-more").addEventListener("click", () => { shown += 50; draw(); });
    draw();
  },
});

/* ---------- Crafts rentables ---------- */
function craftRows(f) {
  const out = [];
  for (const [id, r] of Object.entries(D.core.recipes)) {
    const it = item(id); if (!it) continue;
    if (f.job && String(r[0]) !== f.job) continue;
    if (it.lvl < f.min || it.lvl > f.max) continue;
    const c = recipeCost(+id); if (!c || c.missing) continue;
    const p = price(id);
    if (f.sold && p == null) continue;
    const net = p != null ? p * (1 - taxRate()) : null;
    out.push({ id: +id, it, job: r[0], cost: c.v, p, net, m: net != null ? net - c.v : null, mp: net != null && c.v ? (net - c.v) / c.v * 100 : null });
  }
  const k = f.sort;
  out.sort((a, b) => k === "cost" ? a.cost - b.cost : k === "mp" ? (b.mp ?? -1e9) - (a.mp ?? -1e9) : k === "lvl" ? a.it.lvl - b.it.lvl : (b.m ?? -1e18) - (a.m ?? -1e18));
  return out;
}
page("crafts", {
  title: "Crafts rentables", icon: 148004, intro: "Coût des ingrédients (achetés ou fabriqués s'ils reviennent moins cher) contre prix de vente à l'HDV, taxe déduite. Seules les recettes dont tous les ingrédients ont un prix apparaissent.",
  render(el, args) {
    const f = ui("craftF", { job: "", min: 1, max: 200, sort: "m", sold: true, mode: "list" });
    if (args[0] === "simu") f.mode = "simu";
    const jobs = Object.entries(D.core.jobs).filter(([k]) => Object.values(D.core.recipes).some(r => String(r[0]) === k)).sort((a, b) => a[1][0].localeCompare(b[1][0]));
    el.innerHTML = hero("crafts", `<div class="chips"><span class="chip on">Taxe HDV ${fmt(S.settings.tax, 1)} %</span></div>`) +
      `<div class="seg" id="c-mode"><button data-m="list">Classement</button><button data-m="simu">Simulateur</button></div><div id="c-body"></div>`;
    const body = $("#c-body");
    const drawList = () => {
      body.innerHTML = `<section class="panel"><div class="filters"><select id="c-job"><option value="">Tous les métiers</option>${jobs.map(([k, j]) => `<option value="${k}" ${f.job === k ? "selected" : ""}>${esc(j[0])}</option>`).join("")}</select>
        <label class="fld">Niv. min<input type="number" id="c-min" value="${f.min}"></label><label class="fld">Niv. max<input type="number" id="c-max" value="${f.max}"></label>
        <select id="c-sort"><option value="m">Marge en kamas</option><option value="mp">Marge en %</option><option value="cost">Coût le plus bas</option><option value="lvl">Niveau</option></select>
        <label class="check"><input type="checkbox" id="c-sold" ${f.sold ? "checked" : ""}> Prix de vente relevé</label></div><div id="c-out"></div></section>`;
      $("#c-sort").value = f.sort;
      const run = () => {
        f.job = $("#c-job").value; f.min = +$("#c-min").value || 0; f.max = +$("#c-max").value || 200; f.sort = $("#c-sort").value; f.sold = $("#c-sold").checked; setUi("craftF", f);
        const rows = craftRows(f);
        $("#c-out").innerHTML = rows.length ? `<p class="muted small">${rows.length} recettes calculables.</p><div class="tablewrap"><table><thead><tr><th>Objet</th><th class="n">Coût</th><th class="n">Prix HDV</th><th class="n">Marge</th><th class="n hide-m">%</th></tr></thead><tbody>${rows.slice(0, 150).map(r =>
          `<tr><td class="mc">${itemLine(r.id, `${esc(D.core.jobs[r.job]?.[0] || "")} · niv. ${r.it.lvl}`, "s")}</td><td class="n" data-label="Coût">${kam(r.cost)}</td><td class="n" data-label="Prix HDV">${kam(r.p)}</td><td class="n ${r.m == null ? "" : r.m >= 0 ? "pos" : "neg"}" data-label="Marge">${r.m == null ? "—" : kam(r.m)}</td><td class="n hide-m ${r.mp == null ? "" : r.mp >= 0 ? "pos" : "neg"}">${r.mp == null ? "—" : pct(r.mp)}</td></tr>`).join("")}</tbody></table></div>`
          : `<div class="empty"><strong>Aucune recette calculable</strong><span>Il faut le prix de tous les ingrédients (et du résultat si « Prix de vente relevé » est coché). Note des prix dans Prix HDV ou dans les fiches.</span></div>`;
      };
      ["#c-job", "#c-min", "#c-max", "#c-sort", "#c-sold"].forEach(s => $(s).addEventListener("change", run));
      run();
    };
    const drawSimu = () => {
      const sim = ui("simF", { id: 0, n: 1, pr: {}, owned: true, sell: 0, margin: 20 });
      if (args[0] === "simu" && args[1]) { sim.id = +args[1]; sim.pr = {}; sim.sell = 0; }
      body.innerHTML = `<section class="panel"><h2>Simuler un craft</h2><div class="search"><input type="search" id="sim-q" placeholder="Objet à fabriquer…"></div><div id="sim-out"></div></section>`;
      searchBox($("#sim-q"), id => { sim.id = id; sim.pr = {}; sim.sell = 0; setUi("simF", sim); calc(); }, { filter: it => !!recipe(it.id) });
      const calc = () => {
        const out = $("#sim-out"), r = recipe(sim.id);
        if (!r) { out.innerHTML = `<p class="muted">Choisis un objet fabricable.</p>`; return; }
        let cost = 0, missing = 0;
        const rows = r[1].map((ing, i) => {
          const need = r[2][i] * sim.n, have = Math.min(S.stock[ing] || 0, need), buy = need - have;
          const pu = sim.pr[ing] ?? (costOf(ing, 2)?.v ?? null);
          const sub = pu == null ? null : (sim.owned ? buy : need) * pu;
          if (sub == null) missing++; else cost += sub;
          return `<tr><td class="mc">${itemLine(ing, "", "s")}</td><td class="n" data-label="Besoin">${fmt(need)}</td><td class="n" data-label="J'en ai">${fmt(have)}</td><td class="n" data-label="À acheter">${fmt(buy)}</td>
            <td class="n" data-label="Prix unitaire"><input class="sm" type="number" min="0" data-simpr="${ing}" value="${pu ?? ""}" placeholder="?"></td><td class="n" data-label="Sous-total">${kam(sub)}</td></tr>`;
        }).join("");
        const pu = sim.sell || price(sim.id) || 0, net = pu * sim.n * (1 - taxRate()), marg = net - cost;
        const target = sim.n ? cost / sim.n * (1 + (sim.margin || 0) / 100) / (1 - taxRate()) : 0;
        out.innerHTML = `<div class="row">${itemLine(sim.id)}<label class="fld">Quantité<input type="number" min="1" id="sim-n" value="${sim.n}"></label>
          <label class="check"><input type="checkbox" id="sim-owned" ${sim.owned ? "checked" : ""}> Mon inventaire est gratuit</label></div>
          <div class="tablewrap"><table><thead><tr><th>Ingrédient</th><th class="n">Besoin</th><th class="n">J'en ai</th><th class="n">À acheter</th><th class="n">Prix unitaire</th><th class="n">Sous-total</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="row"><label class="fld">Prix de vente unitaire<input type="number" min="0" id="sim-sell" value="${pu || ""}" placeholder="?"></label><label class="fld">Marge visée (%)<input type="number" id="sim-m" value="${sim.margin}"></label></div>
          <div class="tiles"><div class="tile kamas"><span class="label">Coût total</span><span class="v">${missing ? "≥ " : ""}${kam(cost)}</span></div><div class="tile"><span class="label">Vente nette</span><span class="v">${kam(net)}</span></div>
          <div class="tile"><span class="label">Marge</span><span class="v ${marg >= 0 ? "pos" : "neg"}">${kam(marg)}</span><span class="small muted">${cost ? pct(marg / cost * 100) + " du coût" : ""}</span></div>
          <div class="tile"><span class="label">Prix à viser</span><span class="v">${kam(target)}</span><span class="small muted">pour ${fmt(sim.margin)} % de marge</span></div></div>
          <div class="row"><button class="btn" data-plan-add="${sim.id}">＋ Ajouter au plan</button></div>`;
        $("#sim-n").addEventListener("change", e => { sim.n = Math.max(1, +e.target.value || 1); setUi("simF", sim); calc(); });
        $("#sim-owned").addEventListener("change", e => { sim.owned = e.target.checked; setUi("simF", sim); calc(); });
        $("#sim-sell").addEventListener("change", e => { sim.sell = +e.target.value || 0; setUi("simF", sim); calc(); });
        $("#sim-m").addEventListener("change", e => { sim.margin = +e.target.value || 0; setUi("simF", sim); calc(); });
        $$("[data-simpr]", out).forEach(i => i.addEventListener("change", () => { const v = i.value === "" ? undefined : +i.value; if (v === undefined) delete sim.pr[i.dataset.simpr]; else sim.pr[i.dataset.simpr] = v; setUi("simF", sim); calc(); }));
      };
      calc();
    };
    const draw = () => { $$("#c-mode button").forEach(b => b.setAttribute("aria-pressed", b.dataset.m === f.mode)); (f.mode === "simu" ? drawSimu : drawList)(); };
    $("#c-mode").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { f.mode = b.dataset.m; setUi("craftF", f); draw(); } });
    draw();
  },
});
function openSimu(id) { setUi("craftF", Object.assign(ui("craftF", {}), { mode: "simu" })); go(`crafts/simu/${id}`); }

/* ---------- Brisage ---------- */
// Poids d'une unité de caractéristique (règles connues du brisage ; quelques valeurs sont des estimations)
const RUNE_W = { 118: 1, 119: 1, 123: 1, 126: 1, 124: 3, 125: .2, 174: .1, 240: 2, 241: 2, 242: 2, 243: 2, 244: 2, 210: 6, 211: 6, 212: 6, 213: 6, 214: 6,
  160: 7, 161: 7, 410: 7, 412: 7, 795: 2, 176: 3, 138: 2, 752: 4, 753: 4, 178: 10, 115: 10, 182: 30, 117: 51, 128: 90, 111: 100, 112: 20,
  422: 5, 424: 5, 426: 5, 428: 5, 430: 5, 158: .25, 414: 5, 416: 2, 418: 5, 420: 2, 225: 5, 226: 2, 220: 10 };
let RUNE_OF = null; // effet -> rune de base (la plus petite)
function runeOf(eid) {
  if (!RUNE_OF) {
    RUNE_OF = {};
    for (const [id, r] of Object.entries(D.core.items)) if (r[1] === 78) {
      const e = r[5][0]; if (!e) continue;
      const cur = RUNE_OF[e[0]]; if (!cur || (e[1] || 1) < cur[1]) RUNE_OF[e[0]] = [+id, e[1] || 1];
    }
  }
  return RUNE_OF[eid] || null;
}
// Runes de base obtenues en brisant un objet (formule du brisage de Dofus Touch)
function shatter(it, coef, jets) {
  const lines = [];
  for (const e of it.fx) {
    const w = RUNE_W[e[0]]; if (!w) continue;
    const jet = jets?.[e[0]] ?? (e[2] || e[1]); if (!jet || fxIsNeg(e)) continue;
    const base = ((it.lvl / 100) * jet * w + 1) / (w <= 1 ? 1 : w);
    const n = base * coef / 100, rune = runeOf(e[0]);
    const runeW = rune ? rune[1] * w : 1;   // la rune de base pèse (gain × poids) : on compte des runes de base
    const count = w < 1 && rune ? n / runeW : n;
    lines.push({ eid: e[0], jet, w, rune: rune?.[0], count, value: rune && price(rune[0]) != null ? count * price(rune[0]) : null });
  }
  return lines;
}
page("brisage", {
  title: "Brisage", icon: 78043, intro: "Runes obtenues en brisant un objet selon son niveau, ses jets et le coefficient du moment (affiché au briseur, il évolue avec l'économie du serveur).",
  render(el) {
    const f = ui("brF", { id: 0, coef: 100, jets: {}, top: { min: 1, max: 200 } });
    el.innerHTML = hero("brisage") + `<div class="grid2"><section class="panel"><h2>Briser un objet</h2><div class="search"><input type="search" id="b-q" placeholder="Équipement à briser…"></div><div id="b-out"></div></section>
      <section class="panel"><h2>Meilleurs objets à fabriquer pour briser</h2><p class="muted small">Coût du craft (ingrédients relevés) comparé à la valeur des runes au coefficient choisi, jets maximum.</p>
      <div class="filters"><label class="fld">Niv. min<input type="number" id="bt-min" value="${f.top.min}"></label><label class="fld">Niv. max<input type="number" id="bt-max" value="${f.top.max}"></label><button class="btn" id="bt-go">Calculer</button></div><div id="bt-out"></div></section></div>
      <p class="note">Formule : runes = ((niveau ÷ 100) × jet × poids + 1) ÷ poids (si le poids dépasse 1) × coefficient. Le coefficient suivant baisse après chaque brisage. Estimation théorique : le résultat réel varie un peu. Calculateur de référence : <a href="https://papycha.fr/taux-de-brisage/" target="_blank" rel="noopener">Taux de brisage (Papycha)</a>.</p>`;
    searchBox($("#b-q"), id => { f.id = id; f.jets = {}; setUi("brF", f); calc(); }, { filter: it => it.fx.some(e => RUNE_W[e[0]]) && [1, 2, 3, 4, 5, 7, 10, 11, 12].includes(it.sup) });
    const calc = () => {
      const out = $("#b-out"), it = item(f.id);
      if (!it) { out.innerHTML = `<p class="muted">Choisis un équipement.</p>`; return; }
      const lines = shatter(it, f.coef, f.jets);
      const tot = lines.reduce((s, l) => s + (l.value || 0), 0);
      const cost = recipeCost(it.id)?.missing === 0 ? recipeCost(it.id).v : null, p = price(it.id);
      const next = f.coef - (it.lvl / 200) * f.coef * f.coef / 100 / 50;
      out.innerHTML = `<div class="row">${itemLine(it.id)}<label class="fld">Coefficient (%)<input type="number" id="b-coef" min="1" max="4000" value="${f.coef}"></label></div>
        <div class="tablewrap"><table><thead><tr><th>Caractéristique</th><th class="n">Jet</th><th class="n">Runes</th><th class="n">Valeur</th></tr></thead><tbody>${lines.map(l => `<tr><td class="mc">${l.rune ? itemLine(l.rune, fxText([l.eid, l.jet]), "s") : esc(fxText([l.eid, l.jet]))}</td>
          <td class="n" data-label="Jet"><input class="sm" type="number" data-jet="${l.eid}" value="${l.jet}"></td><td class="n" data-label="Runes">${fmt(l.count, 2)}</td><td class="n" data-label="Valeur">${l.value == null ? '<span class="muted">prix ?</span>' : kam(l.value)}</td></tr>`).join("")}</tbody></table></div>
        <div class="tiles"><div class="tile kamas"><span class="label">Valeur des runes</span><span class="v">${kam(tot)}</span></div><div class="tile"><span class="label">Coût du craft</span><span class="v">${kam(cost)}</span></div>
        <div class="tile"><span class="label">Prix HDV de l'objet</span><span class="v">${kam(p)}</span></div><div class="tile"><span class="label">Coefficient suivant</span><span class="v">${fmt(next, 1)} %</span></div></div>
        ${cost != null ? `<p>Fabriquer puis briser : <b class="${tot - cost >= 0 ? "pos" : "neg"}">${kam(tot - cost)}</b> par objet.</p>` : ""}${p != null ? `<p>Acheter puis briser : <b class="${tot - p >= 0 ? "pos" : "neg"}">${kam(tot - p)}</b> par objet.</p>` : ""}`;
      $("#b-coef").addEventListener("change", e => { f.coef = clamp(+e.target.value || 100, 1, 4000); setUi("brF", f); calc(); });
      $$("[data-jet]", out).forEach(i => i.addEventListener("change", () => { f.jets[i.dataset.jet] = +i.value || 0; setUi("brF", f); calc(); }));
    };
    $("#bt-go").addEventListener("click", () => {
      f.top = { min: +$("#bt-min").value || 1, max: +$("#bt-max").value || 200 }; setUi("brF", f);
      const rows = [];
      for (const id of Object.keys(D.core.recipes)) {
        const it = item(id); if (!it || it.lvl < f.top.min || it.lvl > f.top.max || ![1, 2, 3, 4, 5, 7, 10, 11].includes(it.sup)) continue;
        const c = recipeCost(it.id); if (!c || c.missing) continue;
        const v = shatter(it, f.coef).reduce((s, l) => s + (l.value || 0), 0); if (!v) continue;
        rows.push([it.id, c.v, v, v - c.v]);
      }
      rows.sort((a, b) => b[3] - a[3]);
      $("#bt-out").innerHTML = rows.length ? `<div class="list">${rows.slice(0, 40).map(r => `<div class="li"><div>${itemLine(r[0], `craft ${kam(r[1])} · runes ${kam(r[2])}`, "s")}</div><div class="r"><b class="num ${r[3] >= 0 ? "pos" : "neg"}">${kam(r[3])}</b></div></div>`).join("")}</div>`
        : `<div class="empty"><strong>Rien à calculer</strong><span>Il faut les prix des ingrédients et des runes (Rune Fo, Rune Vi…).</span></div>`;
    });
    calc();
  },
});
