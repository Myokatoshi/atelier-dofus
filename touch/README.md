# Atelier Touch

En ligne : https://myokatoshi.github.io/atelier-dofus/touch/ (appli à part, installable séparément de l'Atelier Dofus 3).

Application web (PWA, installable sur téléphone) pour **Dofus Touch**, réglée sur le serveur **Kelerog** :

- **Encyclopédie** : tous les objets, panoplies et monstres du jeu (effets, conditions, recettes, « sert à fabriquer », butin avec taux, zones).
- **Marché** : relevés de prix de l'HDV (à l'unité, par 10, par 100), tournée de relevés, courbes et tendances, crafts rentables, simulateur de craft, brisage (runes et rentabilité).
- **Production** : plan de craft et liste d'achat (moins l'inventaire), inventaire, métiers (recettes, plan de montée d'XP), liste de farm (zones de récolte, monstres).
- **Aventure** : donjons, quêtes, succès (avec suivi de progression), carte du Monde des Douze.
- **Perso** : builds (équipement, points, panoplies, totaux), sorts des 15 classes avec calcul de dégâts, guides, réglages et sauvegarde.
- **Almanax** : offrande et bonus du jour, calendrier sur un an, courses des offrandes.

Tout est enregistré sur l'appareil (pas de compte) ; la sauvegarde s'exporte dans Réglages.

## Sources

- Données du jeu : client officiel de Dofus Touch (serveur de données d'Ankama), préparées par `tools/fetch_data.py` puis `tools/build_data.py`. Images : CDN officiel de Dofus Touch.
- [Le Bazar de Papycha](https://papycha.fr) : liens vers ses guides et informations de son API publique (quêtes, donjons, chemins), interrogée en direct avec citation, conformément à [sa politique](https://papycha.fr/utilisation-contenus-api/). Aucun contenu de Papycha n'est recopié.

Application de fans, sans lien avec Ankama.

## Mettre à jour les données après une mise à jour du jeu

```bash
cd touch && python3 tools/fetch_data.py --force
```

```bash
cd touch && python3 tools/build_data.py
```

Puis incrémenter `VERSION` dans `sw.js`.
