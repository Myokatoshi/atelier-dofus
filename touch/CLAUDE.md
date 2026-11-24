# Atelier Touch : notes pour Claude

- Appli séparée de l'Atelier Dofus 3 : elle vit dans le dossier `touch/` du dépôt `atelier-dofus` (faute de dépôt à part) et ne partage rien avec lui (ni code, ni données, ni base). Publiée avec le reste du site à chaque push sur `main` : https://myokatoshi.github.io/atelier-dofus/touch/. Pour la sortir dans son propre dépôt plus tard : copier `touch/` à la racine d'un nouveau dépôt, rien d'autre à changer (chemins relatifs).
- Même domaine que l'Atelier Dofus 3 : son service worker ne supprime que les caches `touch-…` (celui de Dofus 3 ne supprime que les `atelier-…` et ignore les adresses `/touch/`) ; stockage local sous la seule clé `atelier-touch`. Les commandes `tools/…` se lancent depuis `touch/` (données brutes dans `touch/.cache/`, ignoré par git). Application pour **Dofus Touch**, serveur de référence **Kelerog** (le serveur ne change que l'étiquette des relevés : `S.settings.server`).
- Application web statique (PWA), sans build : `index.html`, `css/app.css`, `js/*.js`, `sw.js`. Pas de compte ni de serveur : tout est dans `localStorage["atelier-touch"]` (`S` dans `js/core.js` : réglages, prix, suivis, inventaire, plan, métiers, builds, progression des quêtes/succès/donjons, filtres `S.ui`). Export/import dans Réglages.
- À chaque changement de l'appli, incrémenter `VERSION` dans `sw.js` (`touch-vN`), sinon les utilisateurs gardent l'ancienne version en cache.
- Commits signés avec l'adresse anonyme GitHub (`Myokatoshi@users.noreply.github.com`, dans `.git/config`), jamais l'adresse personnelle.
- L'utilisateur ne veut pas gérer la technique : faire soi-même tout ce qui est possible.
- Interface en français, tutoiement, thème sombre uniquement. Vert = hausse (`.pos`, `.chip.up`), rouge = baisse (`.neg`, `.chip.down`).
- Téléphone (≤ 720 px) : aucun défilement horizontal, aucun texte qui sort de sa case ; tableaux `.tablewrap` avec `data-label` sur chaque `td` (cartes empilées, cellule principale `.mc`, `.hide-m` masque), listes `.li` (empilées sous 560 px). Vérifier avec un audit Playwright en 360 px et iPhone 13.

## Fichiers JS (chargés dans cet ordre, fonctions globales)
- `core.js` : données (`need("monsters", …)` charge `data/<nom>.json`), `item(id)`, icônes (`icon()`, `monImg()`, `itemImg(iconId)`, `monUrl(id)`, `spellImg()`, `jobImg()` : **CDN officiel** `D.core.assets` + `gfx/...` ; `static.ankama.com` refuse les images affichées sur un autre site, ne pas l'utiliser ni contourner sa protection), effets (`fxText()`, `fxList()`), prix (`setPrice(id, p1, p10, p100)`, `price(id)` = prix unitaire le plus bas des lots du dernier relevé, `trend()`), recettes (`recipe()`, `usedIn()`, `costOf()` achat ou craft le moins cher, `recipeCost()`), recherche (`find()`, `searchBox()`), navigation (`GROUPS` : 6 rubriques, `page(nom, {title, icon, intro, needs, render})`, adresse `#page/arg`), fiches (`sheet(type, fn)`, `openSheet(type, id)`, clic sur `data-item` / `data-mon` / `data-sheet="type:id"`).
- `ency.js` : Objets, Panoplies, Monstres ; fiches `item`, `set`, `mon` ; `dropsOf()`, `harvestOf()`, `critText()`, `priceChart()`, `priceForm()`.
- `market.js` : Prix HDV (relevés, tournée), Crafts rentables (`craftRows()`, simulateur `#crafts/simu/<id>`), Brisage (`shatter()` : runes = ((niveau ÷ 100) × jet × poids + 1) ÷ poids si poids > 1, × coefficient ; poids `RUNE_W`).
- `prod.js` : Plan de craft (`planExpand()`, `planNeeds()`), Inventaire, Métiers (`JOB_XP` niveaux 1–100, `CRAFT_XP` XP par nombre de cases, bonus pack × 1,5), Liste de farm.
- `adventure.js` : Donjons, Quêtes, Succès, Carte (canvas, `#carte/sub/<sous-zone>`, `#carte/res/<ressource>`) ; fiches `dungeon`, `quest`, `achievement`.
- `build.js` : Builds (poupée, points, panoplies, totaux), Sorts (rangs, effets, dégâts estimés) ; fiche `spell`.
- `home.js` : Accueil, Almanax (`almId(date)`, `almDay()`, `almOfferNext()`, `almOfferDays()`), Guides, Réglages ; `papyAll(famille)` (API Papycha).

## Données (`data/`, générées)
- `tools/fetch_data.py` : tables du jeu depuis le serveur officiel (`config.json` → `dataUrl` = `https://dt-proxy-production-login.ankama-games.com`, `POST /data/map?lang=fr {"class": "Items"}`), dans `.cache/raw/` (non publié). `tools/build_data.py` écrit `core.json` (objets, types, effets, panoplies, recettes, métiers, récoltes), `monsters.json`, `world.json` (zones, sous-zones, cases de la carte, donjons, repères), `spells.json`, `quests.json` (quêtes, succès, défis), `almanax.json`, `desc.json`, `misc.json`. Formats : voir les commentaires de `build_data.py`.
- Almanax : l'entrée du calendrier suit la date (19/11/2026 = entrée 66, relevé en jeu et recoupé) ; offrande = quête « Offrande à … » dont l'objectif va voir le Méryde du jour ; décalage corrigeable dans l'appli (`S.settings.almOffset`).
- Pas de source de prix automatique pour Dofus Touch (Kamamaster ne suit que Dofus 3) : les prix viennent des relevés de l'utilisateur.
- DofusDB : licence LPNC-IA (interdit de fournir ses données à une IA) → ne pas l'utiliser.

## Papycha (https://papycha.fr)
- Politique : extraction, base locale, miroir, republication **interdits** ; l'API publique `https://papycha.fr/wp-json/papycha-public/v1/` (familles `quests`, `dungeons`, `paths`, `taxonomy`, `capabilities`) est autorisée avec attribution (nom + lien vers la page). L'appli l'interroge en direct depuis le navigateur (CORS ouvert), garde les réponses en mémoire le temps de la session seulement, et affiche « Source : Papycha » + lien. Ne jamais recopier ses textes ni stocker ses pages.
