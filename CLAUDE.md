# Atelier Dofus 3 : notes pour Claude

- Application web statique (PWA), sans build : `index.html`, `css/app.css`, `js/app.js`, `sw.js`.
- Mise en ligne : chaque push sur `main` est recopié sur `gh-pages` (workflow « Mise en ligne »), publié sur https://myokatoshi.github.io/atelier-dofus/.
- À chaque changement de l'appli, incrémenter `VERSION` dans `sw.js` (sinon les utilisateurs gardent l'ancienne version en cache).
- Commits signés avec l'adresse anonyme GitHub (configurée dans `.git/config` du dépôt), jamais l'adresse e-mail personnelle.
- L'utilisateur ne veut pas gérer la technique : faire soi-même tout ce qui est possible, ne lui demander une action que si elle est nouvelle et indispensable.
- L'interface est uniquement en thème sombre.
- Onglets (`GROUPS` dans js/app.js) : Accueil ; Marché (prix, tournée, rentabilité, journal, alertes) ; Orukam (vue d'ensemble, cotes, donjons, brisage) ; Production (plan, métiers, farm, inventaire) ; Équipement (builds, comparer, encyclopédie) ; Compte.

## Base de données Supabase (projet `jvzwoialynhvhwkccgba`)

- `supabase/schema.sql` : schéma complet (installation neuve).
- `supabase/migrations/NNN_nom.sql` : changements à appliquer à la base existante. Les appliquer soi-même avec `tools/sql.sh supabase/migrations/NNN_nom.sql` (l'environnement « atelier-dofus » fournit le jeton via le proxy), vérifier, puis reporter le changement dans `schema.sql`.
- Migrations déjà appliquées : `002_journal.sql` (table `trades`), `003_price_updated_at.sql` (heure des relevés), `004_prix_actuel_obtention.sql` (prix actuel `cur`, table `item_obtain`), `005_duree_facultative.sql`, `006_pierre_auto.sql` (colonne `auto_stone`), `007_coef_brisage.sql` (table `item_coef`), `008_notifications.sql` (tables `push_subs`, `push_sent`), `009_alertes_auto.sql` (déclencheur sur `price_obs` + tâche pg_cron horaire qui appellent la fonction `alertes`).
- Données du jeu : `tools/build_data.py` (tout), `tools/souls.py` (âmes -> niveau du monstre, pierres -> niveau de capture, dans `core.json`).
- Données Kamamaster (serveur Orukam) : `tools/fetch_kamamaster.py` (4 appels par passage : prix HDV, coefficients de brisage des meilleures opportunités, zones en anomalie, donjons) écrit `data/km/orukam.json`, `data/km/orukam-history.json` (prix quotidiens, 90 jours) et `data/km/orukam-donjons.json` (drops attendus par passage, réglages par défaut de Kamamaster), seulement si les données ont changé ; prix ≥ 1 milliard ignorés (annonces fantaisistes). Lancé 4 fois par jour par le workflow « Prix Kamamaster » (commit sur main + gh-pages) ; l'appli revérifie le fichier au retour sur l'appli et toutes les 30 min. Dans l'appli : prix et coefficients de secours, le plus récent l'emporte (à date égale, le groupe) ; l'historique alimente les courbes et tendances ; section « Orukam » (vue d'ensemble, cotes HDV, donjons, brisage). Kamamaster met ses prix à jour environ une fois par jour : pas de vrai temps réel possible, seuls les relevés du groupe sont en direct. Pas d'API officielle ni de CORS chez Kamamaster : rester à quelques appels par jour et citer la source.
- Ajouter un membre : `python3 tools/add_member.py adresse@exemple.com [pseudo]` (crée le compte confirmé et affiche un mot de passe provisoire à transmettre).
- Tables : `price_obs` (prix partagés, temps réel ; pour un objet et un jour, le relevé le plus récent `updated_at` fait foi), `profiles` (pseudos), `user_state` (stock, plan + réglages + alertes de prix dans `plan`, builds par membre), `trades` (journal personnel), `item_obtain` (durée facultative et coût d'obtention par objet, partagé, dernière mise à jour fait foi). Le prix actuel `cur` est obligatoire dans tout nouveau relevé. `item_coef` (coefficient de brisage par objet, partagé). RLS activé partout.
- Brisage : formule de Kamamaster, quantité de runes = (3 × poids × jet × niveau / 200 + 1) × coef / 100, ÷ poids si poids > 1, ÷ 2,5 pour les pods ; table `RUNES` dans js/app.js (caractéristique -> poids, objet rune).

## Notifications appli fermée

- Fonction serveur `supabase/functions/alertes/index.ts` (Edge Function, verify_jwt désactivé, idempotente) : évalue les alertes de chaque membre inscrit (`push_subs`) avec les mêmes règles que l'appli et envoie un push Web, une fois par prix déclencheur (`push_sent`). Déploiement : `curl -X POST https://api.supabase.com/v1/projects/jvzwoialynhvhwkccgba/functions/deploy?slug=alertes` (multipart metadata + file).
- Secrets de la fonction : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (la clé publique est aussi dans `config.js`). Ne jamais mettre la clé privée dans le dépôt.
