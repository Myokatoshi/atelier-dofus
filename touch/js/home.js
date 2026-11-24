/* Accueil, Almanax, guides et réglages. */

/* ---------- Almanax ---------- */
// Entrée du calendrier pour une date : le calendrier suit les dates de l'année (19 novembre = entrée 66, relevé en jeu) ;
// le 29 février compte comme le 28. Un décalage corrigeable dans l'appli rattrape un éventuel écart.
function doyNoLeap(d) {
  const y = d.getFullYear(), start = Date.UTC(y, 0, 1), cur = Date.UTC(y, d.getMonth(), d.getDate());
  let doy = Math.round((cur - start) / 864e5) + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  if (leap && d.getMonth() >= 1 && (d.getMonth() > 1 || d.getDate() === 29)) doy -= 1;
  return doy;
}
function almId(date) {
  const d = typeof date === "string" ? new Date(date + "T12:00:00") : date;
  const [rd, rid] = D.almanax?.ref || ["2026-11-19", 66];
  const base = doyNoLeap(new Date(rd + "T12:00:00")) - rid; // décalage entre jour de l'année et entrée
  return ((doyNoLeap(d) - base - 1 + (S.settings.almOffset || 0)) % 365 + 365) % 365 + 1;
}
function isoOf(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }
function almDay(iso) {
  const id = almId(iso), a = D.almanax.days[id];
  return a ? { iso, id, bonus: a[0], desc: a[1], npc: a[2], item: a[3], qty: a[4], quest: a[5] } : { iso, id };
}
function almOfferNext(n = 30, from = isoOf(new Date())) { if (!D.almanax) return []; return Array.from({ length: n }, (_, i) => almDay(addDays(from, i))); }
// Prochains jours où un objet est demandé en offrande
function almOfferDays(id, horizon = 365) { return almOfferNext(horizon).filter(d => d.item === +id).map(d => [d.iso, d.qty]); }
function almCard(d, big = true) {
  const p = price(d.item);
  return `<div class="alm">${icon(d.item, big ? "l" : "")}<div class="stack" style="gap:4px"><span class="label">${esc(dayFr(d.iso))} · Offrande à ${esc(d.npc || "?")}</span>
    <h3>${fmt(d.qty)} × ${itemLine(d.item, p != null ? `${kam(p)} l'unité · ${kam(p * d.qty)} au total` : "prix non relevé")}</h3>
    <p><b>${esc(d.bonus || "")}</b> · <span class="muted">${esc(d.desc || "")}</span></p></div></div>`;
}

page("almanax", {
  title: "Almanax", icon: 23018, intro: "Offrande et bonus de chaque jour, recherche sur un an, et liste de courses des offrandes à venir.", needs: ["almanax"],
  render(el, args) {
    const f = ui("almF", { q: "", days: 30, kind: "" });
    const start = args[0] && /^\d{4}-\d\d-\d\d$/.test(args[0]) ? args[0] : isoOf(new Date());
    const kinds = [...new Set(Object.values(D.almanax.days).map(a => a[0]))].sort();
    el.innerHTML = hero("almanax") + `<section class="panel">${almCard(almDay(start))}</section>
      <div class="grid2"><section class="panel"><div class="row between"><h2>Calendrier</h2><input type="date" id="al-date" value="${start}" aria-label="Date"></div>
        <div class="filters"><div class="search"><input type="search" id="al-q" placeholder="Offrande, bonus, zone…" value="${esc(f.q)}"></div>
        <select id="al-kind"><option value="">Tous les bonus</option>${kinds.map(k => `<option ${f.kind === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
        <select id="al-days"><option value="30">30 jours</option><option value="90">3 mois</option><option value="365">1 an</option></select></div>
        <div class="list almlist" id="al-list"></div></section>
      <section class="panel"><h2>Courses des offrandes</h2><div class="row"><label class="fld">Prochains jours<input type="number" id="al-n" min="1" max="60" value="${ui("almN", 7)}"></label></div><div id="al-shop"></div></section></div>
      <section class="panel"><h2>Le bon jour ?</h2><p class="small muted">Le calendrier de Dofus Touch est calé sur le 19 novembre 2026 (Offrande à Waro). Si l'offrande du jour affichée ne correspond pas à celle du jeu, décale le calendrier :</p>
        <div class="row"><button class="btn sm" data-off="-1">← Un jour plus tôt</button><span class="chip">Décalage : ${S.settings.almOffset || 0} j</span><button class="btn sm" data-off="1">Un jour plus tard →</button>${S.settings.almOffset ? `<button class="btn sm" data-off="0">Réinitialiser</button>` : ""}</div></section>`;
    $("#al-days").value = String(f.days);
    const draw = () => {
      f.q = $("#al-q").value; f.kind = $("#al-kind").value; f.days = +$("#al-days").value; setUi("almF", f);
      const from = $("#al-date").value || start, ws = norm(f.q).split(" ").filter(Boolean), t = isoOf(new Date());
      const days = almOfferNext(f.days, from).filter(d => (!f.kind || d.bonus === f.kind) && (!ws.length || ws.every(w => norm(`${itemName(d.item)} ${d.bonus} ${d.desc} ${d.npc}`).includes(w))));
      $("#al-list").innerHTML = days.map(d => `<div class="li ${d.iso === t ? "today" : ""}"><div>${itemLine(d.item, `${esc(dayFr(d.iso))} · × ${fmt(d.qty)} · ${esc(d.bonus || "")}`, "s")}<p class="small muted">${esc(d.desc || "")}</p></div><div class="r">${price(d.item) != null ? `<span class="num gold">${kam(price(d.item) * d.qty)}</span>` : ""}</div></div>`).join("") || `<p class="muted">Aucun jour ne correspond.</p>`;
      const n = clamp(+$("#al-n").value || 7, 1, 60); setUi("almN", n);
      const need = {}; for (const d of almOfferNext(n)) if (d.item) need[d.item] = (need[d.item] || 0) + d.qty;
      let tot = 0, miss = 0;
      $("#al-shop").innerHTML = `<div class="list">${Object.entries(need).map(([id, q]) => { const p = price(id), buy = Math.max(0, q - (S.stock[id] || 0)); if (p == null) miss++; else tot += p * buy;
        return `<div class="li"><div>${itemLine(id, `× ${fmt(q)}${S.stock[id] ? ` · stock ${fmt(S.stock[id])}` : ""}`, "s")}</div><div class="r">${p != null ? `<span class="num gold">${kam(p * buy)}</span>` : '<span class="muted small">prix ?</span>'}</div></div>`; }).join("")}</div>
        <div class="tiles"><div class="tile kamas"><span class="label">Total</span><span class="v">${miss ? "≥ " : ""}${kam(tot)}</span></div></div>`;
    };
    ["#al-kind", "#al-days", "#al-date", "#al-n"].forEach(s => $(s).addEventListener("change", draw));
    $("#al-q").addEventListener("input", debounce(draw, 200));
    el.addEventListener("click", e => { const b = e.target.closest("[data-off]"); if (!b) return; const v = +b.dataset.off; S.settings.almOffset = v === 0 ? 0 : (S.settings.almOffset || 0) + v; save(); rerender(); });
    draw();
  },
});

/* ---------- Accueil ---------- */
page("accueil", {
  title: "Accueil", icon: 23003, intro: "", needs: ["almanax"],
  render(el) {
    const d = almDay(isoOf(new Date()));
    const watch = S.watch.filter(id => item(id));
    const nPrices = Object.keys(S.prices).length;
    let stockV = 0; for (const [id, q] of Object.entries(S.stock)) { const p = price(id); if (p) stockV += p * q; }
    const crafts = craftRows({ job: "", min: 1, max: 200, sort: "m", sold: true }).filter(r => r.m > 0).slice(0, 6);
    const recent = Object.keys(S.prices).map(Number).filter(id => item(id)).sort((a, b) => priceRec(b)[0] - priceRec(a)[0]).slice(0, 6);
    el.innerHTML = `<section class="hero"><div class="hi"><img src="icons/logo.png" alt=""></div><div class="txt"><h1>Bienvenue dans l'Atelier Touch</h1><p>Ton carnet de Dofus Touch sur ${esc(S.settings.server)} : encyclopédie complète, prix de l'HDV, crafts, métiers, builds, donjons, quêtes et Almanax. Tout reste sur ton appareil.</p></div></section>
      <section class="panel"><div class="row between"><h2>Almanax du jour</h2><a class="btn sm" href="#almanax">Calendrier</a></div>${almCard(d)}</section>
      <div class="tiles"><a class="tile" href="#prix" style="text-decoration:none;color:inherit"><span class="label">Prix relevés</span><span class="v">${fmt(nPrices)}</span></a>
        <a class="tile" href="#plan" style="text-decoration:none;color:inherit"><span class="label">Plan de craft</span><span class="v">${plural(S.plan.reduce((s, p) => s + p.n, 0), "objet")}</span></a>
        <a class="tile kamas" href="#inventaire" style="text-decoration:none;color:inherit"><span class="label">Inventaire</span><span class="v">${kam(stockV)}</span></a>
        <a class="tile" href="#builds" style="text-decoration:none;color:inherit"><span class="label">Builds</span><span class="v">${fmt(S.builds.length)}</span></a></div>
      <div class="grid2">
        <section class="panel"><div class="row between"><h2>Objets suivis</h2><a class="btn sm" href="#prix">Relever</a></div>${watch.length ? `<div class="list">${watch.slice(0, 12).map(id => `<div class="li"><div>${itemLine(id, priceRec(id) ? ago(priceRec(id)[0]) : "pas encore relevé", "s")}</div><div class="r">${price(id) != null ? `<span class="num gold">${kam(price(id))}</span>` : ""}${trendChip(id, 7)}</div></div>`).join("")}</div>` : `<p class="muted small">Coche « Suivre » dans la fiche d'un objet pour le retrouver ici.</p>`}</section>
        <section class="panel"><div class="row between"><h2>Meilleurs crafts</h2><a class="btn sm" href="#crafts">Tout voir</a></div>${crafts.length ? `<div class="list">${crafts.map(r => `<div class="li"><div>${itemLine(r.id, `coût ${kam(r.cost)} · vente ${kam(r.p)}`, "s")}</div><div class="r"><b class="num pos">${kam(r.m)}</b></div></div>`).join("")}</div>` : `<p class="muted small">Relève des prix (objets et ingrédients) pour voir les crafts rentables.</p>`}</section>
        <section class="panel"><div class="row between"><h2>Prochaines offrandes</h2><a class="btn sm" href="#almanax">Courses</a></div><div class="list">${almOfferNext(6, addDays(d.iso, 1)).map(x => `<div class="li"><div>${itemLine(x.item, `${esc(dayFr(x.iso))} · × ${x.qty} · ${esc(x.bonus || "")}`, "s")}</div><div class="r">${price(x.item) != null ? `<span class="num gold">${kam(price(x.item) * x.qty)}</span>` : ""}</div></div>`).join("")}</div></section>
        <section class="panel"><div class="row between"><h2>Derniers relevés</h2><a class="btn sm" href="#prix">Prix</a></div>${recent.length ? `<div class="list">${recent.map(id => `<div class="li"><div>${itemLine(id, ago(priceRec(id)[0]), "s")}</div><div class="r"><span class="num gold">${kam(price(id))}</span>${trendChip(id, 7)}</div></div>`).join("")}</div>` : `<p class="muted small">Aucun prix relevé pour l'instant.</p>`}</section>
      </div>
      <section class="panel"><h2>Tout l'atelier</h2><div class="cards">${GROUPS.flatMap(g => g.pages).filter(p => p !== "accueil" && PAGES[p]).map(p => `<a class="card" href="#${p}" style="text-decoration:none">${menuIcon(PAGES[p].icon).replace("<img", '<img class="ico"')}<span class="t"><span class="nm">${esc(PAGES[p].title)}</span><small>${esc(PAGES[p].intro || "").slice(0, 90)}${(PAGES[p].intro || "").length > 90 ? "…" : ""}</small></span></a>`).join("")}</div></section>`;
  },
});

/* ---------- Guides (Papycha et autres sources) ---------- */
const PAPY_API = "https://papycha.fr/wp-json/papycha-public/v1/";
const PAPY = {}; // réponses de l'API publique, gardées le temps de la session (jamais enregistrées)
async function papyAll(family) {
  if (PAPY[family]) return PAPY[family];
  PAPY[family] = (async () => {
    const out = []; let page = 1, total = 1;
    do {
      const r = await fetch(`${PAPY_API}${family}?per_page=100&page=${page}`); if (!r.ok) throw new Error("Papycha " + r.status);
      const j = await r.json(); out.push(...(j.items || [])); total = j.total_pages || 1; page++;
    } while (page <= total && page <= 20);
    return out;
  })().catch(e => { delete PAPY[family]; throw e; });
  return PAPY[family];
}
const PAPY_SECTIONS = [
  ["guides", "Guides", "Débuter, personnage, équipements, sorts, combats, métiers"], ["quetes", "Quêtes", "Toutes les quêtes, par zone"], ["arbres-de-quetes", "Arbres de quêtes", "L'ordre des quêtes"],
  ["suivi-quetes", "Suivi des quêtes", "Coche tes quêtes faites"], ["donjons", "Donjons", "Tous les donjons par niveau"], ["raids", "Raids", "Les raids"], ["tanieres-2", "Tanières", "Les tanières"],
  ["chemins", "Chemins", "Accès aux zones et donjons"], ["succes", "Succès", "Les succès"], ["carte", "Carte", "Carte du Monde des Douze"], ["outils", "Outils", "Brisage, Dofus, fortification des boucliers…"],
  ["evenements-saisonniers", "Événements saisonniers", "Les événements de l'année"],
];
page("guides", {
  title: "Guides", icon: 87002, intro: "Les guides du Bazar de Papycha, le site de référence de Dofus Touch : liens directs vers leurs pages.",
  async render(el) {
    el.innerHTML = hero("guides") + `<section class="panel"><h2>Le Bazar de Papycha</h2><p class="small muted">Papycha rédige les guides de Dofus Touch (quêtes, donjons, chemins, outils). L'atelier renvoie vers leurs pages sans les recopier, et affiche les informations de leur API publique (quêtes, donjons, chemins) en citant la source.</p>
      <div class="cards">${PAPY_SECTIONS.map(([slug, t, d]) => `<a class="card" href="https://papycha.fr/${slug}/" target="_blank" rel="noopener" style="text-decoration:none"><img class="ico" src="${itemImg(87002)}" alt=""><span class="t"><span class="nm">${esc(t)}</span><small>${esc(d)}</small></span></a>`).join("")}</div></section>
      <section class="panel"><h2>Chemins (Papycha)</h2><div id="g-paths"><p class="muted small">Chargement depuis Papycha…</p></div></section>
      <section class="panel"><h2>Autres sources</h2><div class="list">
        <div class="li"><div><b>Site officiel de Dofus Touch</b><p class="small muted">Actualités, notes de mise à jour, encyclopédie officielle.</p></div><div class="r"><a class="btn sm" href="https://www.dofus-touch.com/fr" target="_blank" rel="noopener">Ouvrir</a></div></div>
        <div class="li"><div><b>Discord officiel de Dofus Touch</b><p class="small muted">Annonces et entraide.</p></div><div class="r"><a class="btn sm" href="https://discord.com/invite/dofustouch" target="_blank" rel="noopener">Ouvrir</a></div></div>
      </div></section>`;
    try {
      const paths = await papyAll("paths");
      $("#g-paths").innerHTML = `<div class="list">${paths.map(p => `<div class="li"><div><b>${esc(String(p.name || "").replace(/^\[[^\]]*\]\s*/, ""))}</b></div><div class="r">${papyLink(p.url, "Voir le chemin")}</div></div>`).join("")}</div><p class="note">Source : Papycha (API publique).</p>`;
    } catch { $("#g-paths").innerHTML = `<p class="muted small">Papycha ne répond pas pour le moment : <a href="https://papycha.fr/chemins/" target="_blank" rel="noopener">ouvrir la page des chemins</a>.</p>`; }
  },
});

/* ---------- Réglages et sauvegarde ---------- */
page("reglages", {
  title: "Réglages", icon: 12017, intro: "Serveur, taxe de l'HDV, niveau du personnage, et sauvegarde de tes données (elles restent sur cet appareil).",
  render(el) {
    const st = S.settings, size = (localStorage.getItem(KEY) || "").length;
    el.innerHTML = hero("reglages") + `<div class="grid2"><section class="panel"><h2>Réglages</h2>
      <div class="row"><label class="fld">Serveur<input type="text" id="r-srv" value="${esc(st.server)}"></label><label class="fld">Taxe HDV (%)<input type="number" step="0.5" min="0" max="20" id="r-tax" value="${st.tax}"></label></div>
      <div class="row"><label class="fld">Niveau du personnage<input type="number" min="1" max="200" id="r-lvl" value="${st.lvl}"></label><label class="fld">Prospection<input type="number" min="0" max="1000" id="r-pp" value="${st.pp || 100}"></label></div>
      <label class="check"><input type="checkbox" id="r-bp" ${st.bonusPack ? "checked" : ""}> Bonus pack actif (XP des métiers × 1,5)</label>
      <p class="note">La taxe est retirée du prix de vente dans les calculs de marge. Le serveur sert de référence pour tes relevés de prix.</p></section>
      <section class="panel"><h2>Sauvegarde</h2><p class="small muted">Tes prix, ton inventaire, tes plans, tes builds et ta progression sont enregistrés dans ce navigateur (${fmt(size / 1024, 1)} Ko). Exporte-les pour les garder ou les passer sur un autre appareil.</p>
        <div class="row"><button class="btn primary" id="r-exp">Télécharger ma sauvegarde</button><button class="btn" id="r-copy">Copier</button><label class="btn">Importer un fichier<input type="file" id="r-file" accept="application/json,.json" hidden></label></div>
        <textarea id="r-txt" placeholder="…ou colle ici une sauvegarde puis « Importer le texte »" aria-label="Sauvegarde"></textarea>
        <div class="row"><button class="btn" id="r-imp">Importer le texte</button><button class="btn" id="r-reset" style="margin-left:auto">Tout effacer</button></div></section></div>
      <section class="panel"><h2>À propos</h2><p class="small">Atelier Touch : application de fans pour Dofus Touch. Données du jeu : client officiel (version ${esc(D.core.client)}), images servies par Ankama. Guides : <a href="https://papycha.fr" target="_blank" rel="noopener">Bazar de Papycha</a> (liens et API publique, avec citation). Aucun lien avec Ankama ; aucune connexion à ton compte.</p>
        <div class="row"><button class="btn" id="r-upd">Chercher une mise à jour de l'appli</button></div></section>`;
    const set = (k, v) => { S.settings[k] = v; save(); };
    $("#r-srv").addEventListener("change", e => { set("server", e.target.value.trim() || "Kelerog"); $$(".srv").forEach(s => s.textContent = S.settings.server); });
    $("#r-tax").addEventListener("change", e => set("tax", clamp(+e.target.value || 0, 0, 20)));
    $("#r-lvl").addEventListener("change", e => set("lvl", clamp(+e.target.value || 200, 1, 200)));
    $("#r-pp").addEventListener("change", e => set("pp", clamp(+e.target.value || 100, 0, 1000)));
    $("#r-bp").addEventListener("change", e => set("bonusPack", e.target.checked));
    const dump = () => JSON.stringify({ app: "atelier-touch", saved: new Date().toISOString(), data: S });
    $("#r-exp").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([dump()], { type: "application/json" })); a.download = `atelier-touch-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
    $("#r-copy").addEventListener("click", () => navigator.clipboard?.writeText(dump()).then(() => toast("Sauvegarde copiée."), () => { $("#r-txt").value = dump(); toast("Copie impossible : le texte est dans la case."); }));
    const imp = txt => {
      try { const j = JSON.parse(txt); const data = j.data || j; if (!data.settings || !data.prices) throw 0;
        if (!confirm("Remplacer toutes tes données par cette sauvegarde ?")) return;
        S = Object.assign(DEFAULT(), data); S.settings = Object.assign(DEFAULT().settings, data.settings); save(); toast("Sauvegarde importée."); setTimeout(() => location.reload(), 600);
      } catch { toast("Ce n'est pas une sauvegarde de l'Atelier Touch."); }
    };
    $("#r-imp").addEventListener("click", () => imp($("#r-txt").value));
    $("#r-file").addEventListener("change", e => { const f = e.target.files[0]; if (f) f.text().then(imp); });
    $("#r-reset").addEventListener("click", () => { if (confirm("Effacer toutes tes données (prix, inventaire, plans, builds, progression) ?") && confirm("Vraiment tout effacer ? Pense à exporter avant.")) { localStorage.removeItem(KEY); location.reload(); } });
    $("#r-upd").addEventListener("click", () => navigator.serviceWorker?.getRegistration().then(r => r ? r.update().then(() => toast("Vérification faite : l'appli se recharge si une version plus récente existe.")) : toast("Mise à jour : recharge la page.")));
  },
});
