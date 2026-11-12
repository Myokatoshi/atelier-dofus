# Atelier Dofus 3

Application installable (PWA) pour un groupe d'amis sur Dofus 3 :

- **prix HDV partagés en direct** (fourchette basse / haute, historique, courbes par semaine et par mois) ;
- **rentabilité** : crafter et revendre, ou acheter à l'HDV ;
- **Orukam** : cotes HDV de tout le serveur avec tendances, donjons rentables en kamas/heure, brisage et zones en anomalie (données publiées par [Kamamaster](https://kamamaster.fr), vérifiées 4 fois par jour) ;
- **métiers** : plan de montée jusqu'au niveau visé (crafts, coût, liste d'achat) avec le calcul d'XP de [DofusDB](https://dofusdb.fr) et les bonus de l'Almanax ;
- **alertes de prix**, y compris en notification quand l'appli est fermée ;
- **plan de craft** et liste de courses ;
- **liste de farm** : zones, monstres, taux de drop, donjons ;
- **builds** importés de Dofusbook (copier-coller), statistiques et coût ;
- **Almanax** et **encyclopédie** (21 622 objets, recettes, effets, panoplies).

Les prix sont communs à tout le groupe. Le stock, le plan, la liste de farm et les builds sont personnels.

Application de fans, sans lien avec Ankama. Données du jeu extraites par le projet communautaire [DofusDude](https://github.com/dofusdude).

## Installation (administrateur, une seule fois)

### 1. Base de données Supabase (gratuite)

1. Crée un compte sur [supabase.com](https://supabase.com), puis **New project** (région Europe, mot de passe au choix).
2. **SQL Editor** > **New query** : colle le contenu de [`supabase/schema.sql`](supabase/schema.sql), puis **Run**.
3. **Authentication** > **Sign In / Providers** > **Email** : désactive **Allow new users to sign up**. Seules les personnes que tu ajoutes pourront entrer.
4. **Authentication** > **URL Configuration** : mets `https://myokatoshi.github.io/atelier-dofus/` dans **Site URL**.
5. **Project Settings** > **API** : copie **Project URL** et la clé **anon public** dans [`config.js`](config.js).

La clé `anon` est publique par conception : la sécurité repose sur les règles du fichier `schema.sql` (seuls les membres connectés lisent les prix, chacun ne modifie que ses relevés et ses propres données).

### Mises à jour du serveur

Quand une nouvelle fonction a besoin d'une table, son fichier SQL est à exécuter une fois (SQL Editor > New query > Run) :

- [`supabase/migrations/002_journal.sql`](supabase/migrations/002_journal.sql) : journal de ventes (déjà appliqué).

`schema.sql` contient toujours l'ensemble, pour une installation neuve.

### 2. Mise en ligne sur GitHub Pages

L'appli est publiée sur **https://myokatoshi.github.io/atelier-dofus/** depuis la branche `gh-pages`.
Chaque push sur `main` est recopié automatiquement sur `gh-pages` par [`.github/workflows/pages.yml`](.github/workflows/pages.yml) ; la mise en ligne prend une à deux minutes.

### 3. Ajouter les membres du groupe

Supabase > **Authentication** > **Users** > **Add user** > **Create new user** : saisis l'e-mail et un mot de passe provisoire, coche **Auto Confirm User**, puis transmets ces identifiants à ton ami. Il pourra changer son mot de passe dans l'onglet **Compte**.

Mot de passe oublié : dans la même page, ouvre le membre puis change son mot de passe.

## Utilisation (chaque membre)

1. Ouvre l'adresse de l'appli et connecte-toi avec ton e-mail et ton mot de passe.
2. Installe l'appli :
   - **Android / PC (Chrome, Edge)** : bouton **Installer** dans la barre d'adresse ou le menu ;
   - **iPhone (Safari)** : bouton **Partager** > **Sur l'écran d'accueil**.
3. Choisis ton pseudo et change ton mot de passe dans l'onglet **Compte**.

Pour reprendre tes données de la version Claude : onglet **Compte** de l'ancienne version > **Copier**, puis **Importer** ici. Les prix importés se partagent ensuite avec le bouton de l'onglet **Prix HDV**.

## Développement

Aucune étape de build : HTML, CSS et JavaScript simples.

```
index.html              page d'entrée
css/app.css             styles
js/app.js               application (vues, calculs, serveur)
config.js               adresse et clé Supabase
sw.js                   cache hors connexion (changer VERSION à chaque mise en ligne)
manifest.webmanifest    installation
data/                   données du jeu générées (core.json, farm.json, det/, icons/)
tools/build_data.py     génération de data/ depuis les releases DofusDude
supabase/schema.sql     tables et règles de sécurité
vendor/supabase.js      client Supabase 2.49.10 (copie locale)
```

Lancer en local :

```
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000. Sans `config.js` renseigné, l'appli fonctionne en mode local (données dans le navigateur).

### Mettre à jour les données du jeu

```
pip install pillow
python3 tools/build_data.py
```

Le script télécharge la dernière release de [dofusdude/dofus3-main](https://github.com/dofusdude/dofus3-main/releases) dans `.cache/` et régénère `data/`. Change ensuite `VERSION` dans `sw.js`, puis pousse.
