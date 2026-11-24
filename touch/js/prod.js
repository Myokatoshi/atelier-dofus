/* Production : plan de craft et liste d'achat, inventaire, métiers (recettes, XP), liste de farm. */

const missNote = m => m ? `<p class="muted small">${plural(m, "ingrédient")} sans prix : note-les dans Prix HDV (onglet Tournée).</p>` : "";

/* ---------- Plan de craft ---------- */
// Quantités nécessaires : ingrédients des objets du plan, en fabriquant aussi les ingrédients marqués « Fabriquer »
function planExpand() {
  const need = new Map(), craft = new Map(), mk = S.ui.planCraft || {};
  const add = (id, q, depth) => {
    const r = recipe(id);
    if (depth > 0 && r && mk[id]) { craft.set(id, (craft.get(id) || 0) + q); r[1].forEach((ing, i) => add(ing, q * r[2][i], depth - 1)); }
    else need.set(id, (need.get(id) || 0) + q);
  };
  for (const p of S.plan) { const r = recipe(p.id); if (!r) continue; craft.set(p.id, (craft.get(p.id) || 0) + p.n); r[1].forEach((ing, i) => add(ing, p.n * r[2][i], 4)); }
  return { need, craft };
}
// Liste d'achat : [objet, besoin, à acheter (besoin moins l'inventaire)]
function planNeeds() {
  const out = [];
  for (const [id, q] of planExpand().need) out.push([id, q, Math.max(0, q - (S.stock[id] || 0))]);
  return out.sort((a, b) => itemName(a[0]).localeCompare(itemName(b[0])));
}
page("plan", {
  title: "Plan de craft", icon: 95093, intro: "Les objets que tu veux fabriquer : liste d'achat (moins ton inventaire), coût, revente et métiers nécessaires.",
  render(el) {
    el.innerHTML = hero("plan") + `<section class="panel"><h2>Ajouter un objet</h2><div class="search"><input type="search" id="pl-q" placeholder="Objet à fabriquer…"></div></section><div id="pl-body"></div>`;
    searchBox($("#pl-q"), id => { const ex = S.plan.find(p => p.id === id); if (ex) ex.n++; else S.plan.push({ id, n: 1 }); save(); draw(); }, { filter: it => !!recipe(it.id) });
    const draw = () => {
      const body = $("#pl-body");
      if (!S.plan.length) { body.innerHTML = `<div class="empty"><strong>Ton plan est vide</strong><span>Ajoute un objet ci-dessus ou avec le bouton « Ajouter au plan de craft » d'une fiche.</span></div>`; return; }
      const { craft } = planExpand(), needs = planNeeds();
      let totalBuy = 0, miss = 0, sale = 0;
      for (const [id, , buy] of needs) { const p = price(id); if (buy) { if (p == null) miss++; else totalBuy += p * buy; } }
      const targets = S.plan.map(p => {
        const it = item(p.id), r = recipe(p.id), c = recipeCost(p.id), pv = price(p.id);
        if (pv != null) sale += pv * p.n * (1 - taxRate());
        const lj = S.jobs[r[0]] || 0;
        return `<div class="li"><div>${itemLine(p.id, `${esc(D.core.jobs[r[0]]?.[0] || "")} niv. ${it.lvl}${lj && lj < it.lvl ? ` · <span class="neg">ton niveau : ${lj}</span>` : ""}`)}</div>
          <div class="r"><span class="muted small">coût ${c && !c.missing ? kam(c.v * p.n) : "?"}${pv != null ? ` · revente ${kam(pv * p.n * (1 - taxRate()))}` : ""}</span>
          <span class="row" style="gap:4px"><button class="btn sm" data-pl-dec="${p.id}" aria-label="Moins">−</button><input class="sm" type="number" min="1" value="${p.n}" data-pl-n="${p.id}" aria-label="Quantité"><button class="btn sm" data-pl-inc="${p.id}" aria-label="Plus">+</button></span>
          <button class="x" data-pl-del="${p.id}" aria-label="Retirer">✕</button></div></div>`;
      }).join("");
      const inter = [...craft.keys()].filter(id => !S.plan.some(p => p.id === id));
      const shop = needs.map(([id, q, buy]) => {
        const p = price(id), r = recipe(id), done = S.bought[id];
        return `<div class="li ${done || !buy ? "done" : ""}"><div class="row"><label class="check"><input type="checkbox" data-bought="${id}" ${done ? "checked" : ""} ${buy ? "" : "disabled"} aria-label="Acheté"></label>${itemLine(id, `besoin ${fmt(q)}${S.stock[id] ? ` · stock ${fmt(S.stock[id])}` : ""} · <b>à acheter ${fmt(buy)}</b>`, "s")}</div>
          <div class="r">${p != null ? `<span class="num">${kam(p)}</span><b class="num gold">${kam(p * buy)}</b>` : `<span class="muted small">prix ?</span>`}${r ? `<button class="chip" data-pl-craft="${id}">Fabriquer</button>` : ""}</div></div>`;
      }).join("");
      const jobsNeed = {};
      for (const id of craft.keys()) { const r = recipe(id); if (r) jobsNeed[r[0]] = Math.max(jobsNeed[r[0]] || 0, item(id).lvl); }
      body.innerHTML = `<div class="tiles"><div class="tile kamas"><span class="label">Achats</span><span class="v">${miss ? "≥ " : ""}${kam(totalBuy)}</span></div><div class="tile"><span class="label">Revente nette</span><span class="v">${kam(sale)}</span></div>
        <div class="tile"><span class="label">Bilan</span><span class="v ${sale - totalBuy >= 0 ? "pos" : "neg"}">${sale ? kam(sale - totalBuy) : "—"}</span></div><div class="tile"><span class="label">Objets à fabriquer</span><span class="v">${fmt(S.plan.reduce((s, p) => s + p.n, 0))}</span></div></div>
        <div class="grid2"><section class="panel"><div class="row between"><h2>À fabriquer</h2><button class="btn sm" id="pl-clear">Vider</button></div><div class="list">${targets}</div>
          ${inter.length ? `<p class="small"><span class="label">Fabriqués en chemin (touche pour les acheter plutôt)</span><br>${inter.map(id => `<button class="chip sec" data-pl-uncraft="${id}">${esc(itemName(id))} × ${fmt(craft.get(id))} ✕</button>`).join(" ")}</p>` : ""}
          <p class="small"><span class="label">Métiers nécessaires</span><br>${Object.entries(jobsNeed).map(([j, l]) => `<span class="chip ${(S.jobs[j] || 0) >= l ? "up" : "warn"}">${esc(D.core.jobs[j]?.[0] || j)} niv. ${l}${S.jobs[j] ? ` (toi : ${S.jobs[j]})` : ""}</span>`).join(" ")}</p>
          <div class="row"><button class="btn" id="pl-done">J'ai tout fabriqué</button><a class="btn" href="#farm/plan">Où farmer les ressources</a></div></section>
        <section class="panel"><div class="row between"><h2>Liste d'achat</h2><button class="btn sm" id="pl-unbuy">Tout décocher</button></div>${missNote(miss)}<div class="list">${shop}</div></section></div>`;
    };
    el.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t) return;
      const id = +(t.dataset.plInc || t.dataset.plDec || t.dataset.plDel || t.dataset.plCraft || t.dataset.plUncraft || 0);
      if (t.dataset.plInc) S.plan.find(p => p.id === id).n++;
      else if (t.dataset.plDec) { const p = S.plan.find(p => p.id === id); p.n = Math.max(1, p.n - 1); }
      else if (t.dataset.plDel) S.plan = S.plan.filter(p => p.id !== id);
      else if (t.dataset.plCraft) (S.ui.planCraft = S.ui.planCraft || {})[id] = 1;
      else if (t.dataset.plUncraft) delete (S.ui.planCraft || {})[id];
      else if (t.id === "pl-clear") { if (!confirm("Vider le plan de craft ?")) return; S.plan = []; S.bought = {}; }
      else if (t.id === "pl-unbuy") S.bought = {};
      else if (t.id === "pl-done") {
        if (!confirm("Retirer les ingrédients de ton inventaire et y ajouter les objets fabriqués ?")) return;
        for (const [id2, q] of planExpand().need) { S.stock[id2] = Math.max(0, (S.stock[id2] || 0) - q); if (!S.stock[id2]) delete S.stock[id2]; }
        for (const p of S.plan) S.stock[p.id] = (S.stock[p.id] || 0) + p.n;
        S.plan = []; S.bought = {}; toast("Inventaire mis à jour.");
      } else return;
      save(); draw();
    });
    el.addEventListener("change", e => {
      const n = e.target.dataset.plN; if (n) { S.plan.find(p => p.id === +n).n = Math.max(1, +e.target.value || 1); save(); draw(); }
      const b = e.target.dataset.bought; if (b) { if (e.target.checked) S.bought[b] = 1; else delete S.bought[b]; save(); e.target.closest(".li").classList.toggle("done", e.target.checked); }
    });
    draw();
  },
});

/* ---------- Inventaire ---------- */
page("inventaire", {
  title: "Inventaire", icon: 24243, intro: "Ce que tu possèdes : déduit des listes d'achat, valeur au prix de l'HDV, et ce que tu peux fabriquer avec.",
  render(el) {
    el.innerHTML = hero("inventaire") + `<section class="panel"><h2>Ajouter</h2><div class="search"><input type="search" id="iv-q" placeholder="Objet possédé…"></div></section><div id="iv-body"></div>`;
    searchBox($("#iv-q"), id => { S.stock[id] = (S.stock[id] || 0) + 1; save(); draw(); setTimeout(() => $(`[data-iv="${id}"]`)?.select(), 50); });
    const draw = () => {
      const ids = Object.keys(S.stock).map(Number).filter(id => item(id)).sort((a, b) => itemName(a).localeCompare(itemName(b)));
      if (!ids.length) { $("#iv-body").innerHTML = `<div class="empty"><strong>Inventaire vide</strong><span>Ajoute ce que tu possèdes pour que les listes d'achat en tiennent compte.</span></div>`; return; }
      let tot = 0;
      const rows = ids.map(id => { const p = price(id), q = S.stock[id]; if (p) tot += p * q;
        return `<div class="li"><div>${itemLine(id, "", "s")}</div><div class="r">${p != null ? `<span class="num gold">${kam(p * q)}</span>` : ""}<input class="sm" type="number" min="0" value="${q}" data-iv="${id}" aria-label="Quantité"><button class="x" data-iv-del="${id}" aria-label="Retirer">✕</button></div></div>`; }).join("");
      // Recettes réalisables entièrement avec l'inventaire
      const can = [];
      for (const [id, r] of Object.entries(D.core.recipes)) {
        if (!r[1].every(i => S.stock[i])) continue;
        const n = Math.min(...r[1].map((i, k) => Math.floor(S.stock[i] / r[2][k])));
        if (n > 0) can.push([+id, n]);
      }
      can.sort((a, b) => (price(b[0]) || 0) * b[1] - (price(a[0]) || 0) * a[1] || item(b[0]).lvl - item(a[0]).lvl);
      $("#iv-body").innerHTML = `<div class="tiles"><div class="tile"><span class="label">Objets différents</span><span class="v">${ids.length}</span></div><div class="tile kamas"><span class="label">Valeur à l'HDV</span><span class="v">${kam(tot)}</span></div></div>
        <div class="grid2"><section class="panel"><h2>Mon inventaire</h2><div class="list">${rows}</div></section>
        <section class="panel"><h2>Je peux fabriquer</h2>${can.length ? `<div class="list">${can.slice(0, 50).map(([id, n]) => `<div class="li"><div>${itemLine(id, `${esc(D.core.jobs[recipe(id)[0]]?.[0] || "")} niv. ${item(id).lvl} · jusqu'à ${fmt(n)}`, "s")}</div><div class="r">${price(id) != null ? `<span class="num gold">${kam(price(id))}</span>` : ""}<button class="btn sm" data-plan-add="${id}">＋ Plan</button></div></div>`).join("")}</div>` : `<p class="muted">Aucune recette complète avec ton inventaire.</p>`}</section></div>`;
    };
    el.addEventListener("change", e => { const id = e.target.dataset.iv; if (!id) return; const v = Math.max(0, +e.target.value || 0); if (v) S.stock[id] = v; else delete S.stock[id]; save(); draw(); });
    el.addEventListener("click", e => { const id = e.target.closest("[data-iv-del]")?.dataset.ivDel; if (id) { delete S.stock[id]; save(); draw(); } });
    draw();
  },
});

/* ---------- Métiers ---------- */
// Table d'XP des métiers de Dofus Touch (niveau 1 à 100) et XP d'un craft selon le nombre de cases de la recette
const JOB_XP = [0, 0, 50, 140, 271, 441, 653, 905, 1199, 1543, 1911, 2330, 2792, 3297, 3840, 4439, 5078, 5762, 6493, 7280, 8097, 8980, 9898, 10875, 11903, 12985, 14122, 15315, 16564, 17873, 19242, 20672, 22166, 23726, 25353, 27048, 28815, 30656, 32572, 34566, 36641, 38800, 41044, 43378, 45804, 48325, 50946, 53669, 56498, 59437, 62491, 65664, 68960, 72385, 75943, 79640, 83482, 87475, 91624, 95937, 100421, 105082, 109930, 114971, 120215, 125671, 131348, 137256, 143407, 149811, 156481, 163429, 170669, 178214, 186080, 194283, 202839, 211765, 221082, 230808, 240964, 251574, 262660, 274248, 286364, 299037, 312297, 326175, 340705, 355924, 371870, 388582, 406106, 424486, 443772, 464016, 485274, 507604, 531071, 555741, 581687];
// [cases, XP par craft, niveau min, niveau max où la recette rapporte de l'XP]
const CRAFT_XP = [[1, 1, 1, 20], [2, 10, 1, 60], [3, 25, 10, 80], [4, 50, 20, 100], [5, 100, 40, 100], [6, 250, 60, 100], [7, 500, 80, 100], [8, 1000, 100, 100]];
const HARVEST_JOBS = new Set([2, 24, 26, 28, 36, 41]);
function jobLevelOf(xp) { let l = 1; while (l < 100 && xp >= JOB_XP[l + 1]) l++; return l; }
function jobName(j) { return D.core.jobs[j]?.[0] || `Métier ${j}`; }
function jobList() { return Object.keys(D.core.jobs).map(Number).filter(j => j !== 1 && (Object.values(D.core.recipes).some(r => r[0] === j) || D.core.harvest.some(h => h[0] === j))).sort((a, b) => jobName(a).localeCompare(jobName(b))); }
// Nombre de crafts pour aller d'une XP à un niveau visé, par nombre de cases
function jobPlan(xp, target, bonus) {
  const mult = bonus ? 1.5 : 1, goal = JOB_XP[target];
  return CRAFT_XP.map(([slots, gain, lo, hi]) => {
    const start = Math.max(xp, JOB_XP[lo]), end = Math.min(goal, JOB_XP[Math.min(100, hi)] || goal);
    const usable = Math.max(0, end - start);
    return { slots, gain, lo, hi, n: usable ? Math.ceil(usable / (gain * mult)) : 0, ok: usable > 0, capped: target > hi };
  });
}
page("metiers", {
  title: "Métiers", icon: 8001, intro: "Tes niveaux de métier, les recettes et ressources de chaque métier, et le nombre de crafts pour monter.",
  render(el, args) {
    const jobs = jobList();
    let cur = +(args[0] || ui("job", jobs[0]));
    el.innerHTML = hero("metiers") + `<section class="panel"><h2>Mes métiers</h2><div class="cards">${jobs.map(j => `<a class="card" href="#metiers/${j}" style="text-decoration:none${j === cur ? ";border-color:var(--sec)" : ""}">${jobImg(j, "ico")}<span class="t"><span class="nm">${esc(jobName(j))}</span><small>${S.jobs[j] ? `niveau ${S.jobs[j]}` : "niveau ?"}${HARVEST_JOBS.has(j) ? " · récolte" : ""}</small></span></a>`).join("")}</div></section><div id="jb"></div>`;
    const draw = () => {
      setUi("job", cur);
      const lvl = S.jobs[cur] || 1, xp = S.jobxp[cur] ?? JOB_XP[lvl], next = Math.min(100, lvl + 1);
      const target = clamp(ui("jobTarget-" + cur, Math.min(100, lvl + 10)), lvl, 100);
      const recs = Object.entries(D.core.recipes).filter(([, r]) => r[0] === cur).map(([id, r]) => ({ id: +id, r, it: item(id) })).filter(x => x.it).sort((a, b) => a.it.lvl - b.it.lvl);
      const showAll = ui("jobAll", false);
      const list = recs.filter(x => showAll || x.it.lvl <= lvl);
      // Meilleure recette par nombre de cases (coût des ingrédients le plus bas)
      const best = {};
      for (const x of recs) { if (x.it.lvl > lvl) continue; const c = recipeCost(x.id); if (!c || c.missing) continue; const k = x.r[1].length; if (!best[k] || c.v < best[k].c) best[k] = { id: x.id, c: c.v }; }
      const plan = jobPlan(xp, target, S.settings.bonusPack);
      const harv = D.core.harvest.filter(h => h[0] === cur).sort((a, b) => a[2] - b[2]);
      $("#jb").innerHTML = `<section class="panel"><div class="row between"><h2>${jobImg(cur)} ${esc(jobName(cur))}</h2><span class="chip sec">${recs.length} recettes</span></div>
        <div class="row"><label class="fld">Niveau<input type="number" min="1" max="100" id="jb-lvl" value="${lvl}"></label><label class="fld">XP actuelle<input type="number" min="0" id="jb-xp" value="${xp}"></label>
        <div class="grow"><div class="row between small"><span>Niveau ${lvl}</span><span class="muted">${lvl < 100 ? `${fmt(JOB_XP[next] - xp)} XP avant le niveau ${next}` : "niveau maximum"}</span></div><div class="bar"><span style="width:${lvl < 100 ? clamp((xp - JOB_XP[lvl]) / (JOB_XP[next] - JOB_XP[lvl]) * 100, 0, 100) : 100}%"></span></div></div></div></section>
        ${recs.length ? `<section class="panel"><h2>Monter de niveau</h2><div class="row"><label class="fld">Niveau visé<input type="number" min="${lvl}" max="100" id="jb-target" value="${target}"></label><label class="check"><input type="checkbox" id="jb-bonus" ${S.settings.bonusPack ? "checked" : ""}> Bonus pack (XP × 1,5)</label><span class="muted small">${fmt(Math.max(0, JOB_XP[target] - xp))} XP à gagner</span></div>
          <div class="tablewrap"><table><thead><tr><th>Recette</th><th class="n">XP / craft</th><th class="n">Crafts</th><th>Recette la moins chère</th><th class="n">Coût total</th></tr></thead><tbody>${plan.map(p => { const b = best[p.slots];
            return `<tr><td class="mc"><b>${p.slots} case${p.slots > 1 ? "s" : ""}</b> <span class="muted small">(XP du niveau ${p.lo} au ${p.hi})</span></td><td class="n" data-label="XP / craft">${fmt(p.gain * (S.settings.bonusPack ? 1.5 : 1), 1)}</td><td class="n" data-label="Crafts">${p.ok ? fmt(p.n) + (p.capped ? " *" : "") : `<span class="muted">dès le niv. ${p.lo}</span>`}</td>
            <td data-label="Recette la moins chère">${b ? itemLine(b.id, `${kam(b.c)} le craft`, "s") : '<span class="muted small">aucune avec prix</span>'}</td><td class="n" data-label="Coût total">${b && p.ok ? kam(b.c * p.n) : "—"}</td></tr>`; }).join("")}</tbody></table></div>
          <p class="note">* la recette cesse de rapporter de l'XP avant le niveau visé : le nombre de crafts s'arrête à sa limite. XP par craft selon le nombre de cases (règles de Dofus Touch). Guide : <a href="https://papycha.fr/monter-son-metier-dartisan/" target="_blank" rel="noopener">Monter son métier d'artisan (Papycha)</a>.</p></section>` : ""}
        ${harv.length ? `<section class="panel"><h2>Ressources récoltées</h2><div class="list">${harv.map(h => `<div class="li"><div>${itemLine(h[1], `niv. ${h[2]} · ${esc(h[4])}`, "s")}</div><div class="r">${price(h[1]) != null ? `<span class="num gold">${kam(price(h[1]))}</span>` : ""}<a class="chip" href="#carte/res/${h[1]}">${h[3].length} zones</a></div></div>`).join("")}</div>
          <p class="note">Guide : <a href="https://papycha.fr/monter-son-metier-de-recolteur/" target="_blank" rel="noopener">Monter son métier de récolteur (Papycha)</a>.</p></section>` : ""}
        ${recs.length ? `<section class="panel"><div class="row between"><h2>Recettes</h2><label class="check"><input type="checkbox" id="jb-all" ${showAll ? "checked" : ""}> Afficher aussi celles au-dessus de mon niveau</label></div>
          <div class="list">${list.slice(0, 200).map(x => { const c = recipeCost(x.id), p = price(x.id), m = c && !c.missing && p != null ? p * (1 - taxRate()) - c.v : null;
            return `<div class="li ${x.it.lvl > lvl ? "done" : ""}"><div>${itemLine(x.id, `niv. ${x.it.lvl} · ${x.r[1].length} cases`, "s")}</div><div class="r"><span class="muted small">coût ${c && !c.missing ? kam(c.v) : "?"}</span>${p != null ? `<span class="num gold">${kam(p)}</span>` : ""}${m != null ? `<b class="num ${m >= 0 ? "pos" : "neg"}">${kam(m)}</b>` : ""}<button class="btn sm" data-plan-add="${x.id}">＋ Plan</button></div></div>`; }).join("")}</div>
          ${list.length > 200 ? `<p class="muted small">… ${list.length - 200} autres recettes (voir l'encyclopédie).</p>` : ""}</section>` : ""}`;
      const setLvl = (l, x) => { S.jobs[cur] = clamp(l, 1, 100); S.jobxp[cur] = x; save(); draw(); };
      $("#jb-lvl").addEventListener("change", e => { const l = clamp(+e.target.value || 1, 1, 100); setLvl(l, JOB_XP[l]); });
      $("#jb-xp").addEventListener("change", e => { const x = Math.max(0, +e.target.value || 0); setLvl(jobLevelOf(x), x); });
      $("#jb-target")?.addEventListener("change", e => { setUi("jobTarget-" + cur, clamp(+e.target.value || lvl, lvl, 100)); draw(); });
      $("#jb-bonus")?.addEventListener("change", e => { S.settings.bonusPack = e.target.checked; save(); draw(); });
      $("#jb-all")?.addEventListener("change", e => { setUi("jobAll", e.target.checked); draw(); });
    };
    draw();
  },
});

/* ---------- Liste de farm ---------- */
// Meilleures sources d'une ressource : récolte, puis monstres qui la lâchent (taux décroissant)
function farmSources(id) {
  const hv = harvestOf(id);
  const drops = dropsOf(id).filter(d => d[3] !== 2).sort((a, b) => b[2] - a[2]).slice(0, 5);
  return { hv, drops };
}
page("farm", {
  title: "Liste de farm", icon: 34009, intro: "Où trouver les ressources : zones de récolte, monstres qui les lâchent et leurs zones.", needs: ["monsters", "world"],
  render(el, args) {
    const f = ui("farmF", { src: args[0] === "plan" ? "plan" : "list", list: [] });
    if (args[0] === "plan") f.src = "plan";
    el.innerHTML = hero("farm") + `<section class="panel"><div class="row between"><h2>Ressources à trouver</h2><div class="seg" id="fm-src"><button data-s="plan">Mon plan de craft</button><button data-s="list">Ma liste</button></div></div>
      <div class="search" id="fm-add"><input type="search" placeholder="Ajouter une ressource à ma liste…"></div><div id="fm-out"></div></section>`;
    searchBox($("#fm-add input"), id => { if (!f.list.some(x => x.id === id)) f.list.push({ id, n: 1 }); setUi("farmF", f); draw(); });
    const draw = () => {
      $$("#fm-src button").forEach(b => b.setAttribute("aria-pressed", b.dataset.s === f.src));
      $("#fm-add").hidden = f.src !== "list";
      const rows = f.src === "plan" ? planNeeds().filter(r => r[2] > 0).map(r => ({ id: r[0], n: r[2] })) : f.list;
      if (!rows.length) { $("#fm-out").innerHTML = `<div class="empty"><strong>Rien à farmer</strong><span>${f.src === "plan" ? "Ton plan de craft n'a pas d'ingrédients à acheter." : "Ajoute des ressources à ta liste."}</span></div>`; return; }
      $("#fm-out").innerHTML = `<div class="list">${rows.map(r => {
        const s = farmSources(r.id);
        const hv = s.hv.map(h => `<span class="chip sec">${esc(jobName(h[0]))} niv. ${h[2]}</span> <a href="#carte/res/${r.id}">${h[3].length} zones</a> <span class="muted small">(${h[3].slice(0, 3).map(subName).map(esc).join(", ")}${h[3].length > 3 ? "…" : ""})</span>`).join("<br>");
        const dr = s.drops.map(d => { const m = D.monsters.monsters[d[0]]; const subs = m[4].slice(0, 2).map(subName).map(esc).join(", ");
          return `<span class="chips"><button class="chip" data-mon="${d[0]}">${esc(m[0])} · ${fmt(d[2], 2)} %</button><span class="muted small">${subs}</span></span>`; }).join("");
        const bought = f.src === "plan" ? "" : `<input class="sm" type="number" min="1" value="${r.n}" data-fm-n="${r.id}" aria-label="Quantité"><button class="x" data-fm-del="${r.id}" aria-label="Retirer">✕</button>`;
        return `<div class="li"><div class="stack" style="gap:6px">${itemLine(r.id, `× ${fmt(r.n)}${price(r.id) != null ? ` · ${kam(price(r.id) * r.n)} à l'HDV` : ""}`)}<div class="small">${hv || ""}${dr ? `<div>${dr}</div>` : ""}${!hv && !dr ? '<span class="muted">Ni récolte ni butin connu : objet de quête, de boutique ou d\'événement.</span>' : ""}</div></div><div class="r">${bought}</div></div>`;
      }).join("")}</div>`;
    };
    el.addEventListener("click", e => {
      const b = e.target.closest("#fm-src button"); if (b) { f.src = b.dataset.s; setUi("farmF", f); draw(); return; }
      const d = e.target.closest("[data-fm-del]"); if (d) { f.list = f.list.filter(x => x.id !== +d.dataset.fmDel); setUi("farmF", f); draw(); }
    });
    el.addEventListener("change", e => { const n = e.target.dataset.fmN; if (n) { f.list.find(x => x.id === +n).n = Math.max(1, +e.target.value || 1); setUi("farmF", f); } });
    draw();
  },
});
