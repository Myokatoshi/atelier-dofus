# Atelier Dofus 3 : notes pour Claude

- Application web statique (PWA), sans build : `index.html`, `css/app.css`, `js/app.js`, `sw.js`.
- Mise en ligne : chaque push sur `main` est recopié sur `gh-pages` (workflow « Mise en ligne »), publié sur https://myokatoshi.github.io/atelier-dofus/.
- À chaque changement de l'appli, incrémenter `VERSION` dans `sw.js` (sinon les utilisateurs gardent l'ancienne version en cache).
- Commits signés avec l'adresse anonyme GitHub (configurée dans `.git/config` du dépôt), jamais l'adresse e-mail personnelle.
- L'utilisateur ne veut pas gérer la technique : faire soi-même tout ce qui est possible, ne lui demander une action que si elle est nouvelle et indispensable.
- L'interface est uniquement en thème sombre.

## Base de données Supabase (projet `jvzwoialynhvhwkccgba`)

- `supabase/schema.sql` : schéma complet (installation neuve).
- `supabase/migrations/NNN_nom.sql` : changements à appliquer à la base existante. Les appliquer soi-même avec `tools/sql.sh supabase/migrations/NNN_nom.sql` (l'environnement « atelier-dofus » fournit le jeton via le proxy), vérifier, puis reporter le changement dans `schema.sql`.
- Migrations déjà appliquées : `002_journal.sql` (table `trades`), `003_price_updated_at.sql` (heure des relevés), `004_prix_actuel_obtention.sql` (prix actuel `cur`, table `item_obtain`).
- Ajouter un membre : `python3 tools/add_member.py adresse@exemple.com [pseudo]` (crée le compte confirmé et affiche un mot de passe provisoire à transmettre).
- Tables : `price_obs` (prix partagés, temps réel ; pour un objet et un jour, le relevé le plus récent `updated_at` fait foi), `profiles` (pseudos), `user_state` (stock, plan + réglages + alertes de prix dans `plan`, builds par membre), `trades` (journal personnel), `item_obtain` (durée et coût d'obtention par objet, partagé, dernière mise à jour fait foi). RLS activé partout.
