# Atelier Dofus 3

Application installable (PWA) pour un groupe d'amis sur Dofus 3 :

- **prix HDV partagés en direct** (fourchette basse / haute, historique, courbes par semaine et par mois) ;
- **rentabilité** : crafter et revendre, ou acheter à l'HDV ;
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
3. **Authentication** > **Sign In / Providers** > **Email** : désactive **Allow new users to sign up**. Seules les personnes que tu invites pourront entrer.
4. **Authentication** > **Emails** > modèle **Magic Link** : ajoute la ligne `Ton code de connexion : {{ .Token }}`. Le code permet de se connecter depuis l'appli installée.
5. **Authentication** > **URL Configuration** : mets l'adresse de l'appli (étape 2) dans **Site URL** et **Redirect URLs**.
6. **Project Settings** > **API** : copie **Project URL** et la clé **anon public** dans [`config.js`](config.js).

La clé `anon` est publique par conception : la sécurité repose sur les règles du fichier `schema.sql` (seuls les membres connectés lisent les prix, chacun ne modifie que ses relevés et ses propres données).

### 2. Mise en ligne sur GitHub Pages

1. Dans le dépôt GitHub : **Settings** > **Pages** > **Source** : **GitHub Actions**.
2. Chaque push sur `main` met l'appli en ligne via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).
3. Adresse : `https://<ton-compte>.github.io/<nom-du-dépôt>/`.

GitHub Pages gratuit demande un dépôt **public**. Pour un dépôt privé, utilise Netlify, Vercel ou Cloudflare Pages (gratuits, sans étape de build : dossier racine).

### 3. Inviter le groupe

Supabase > **Authentication** > **Users** > **Invite user** : saisis l'e-mail de chaque ami.

## Utilisation (chaque membre)

1. Ouvre l'adresse de l'appli, saisis ton e-mail, puis le code reçu.
2. Installe l'appli :
   - **Android / PC (Chrome, Edge)** : bouton **Installer** dans la barre d'adresse ou le menu ;
   - **iPhone (Safari)** : bouton **Partager** > **Sur l'écran d'accueil**.
3. Choisis ton pseudo dans l'onglet **Sauvegarde**.

Pour reprendre tes données de la version Claude : onglet **Sauvegarde** de l'ancienne version > **Copier**, puis **Importer** ici. Les prix importés se partagent ensuite avec le bouton de l'onglet **Prix HDV**.

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
