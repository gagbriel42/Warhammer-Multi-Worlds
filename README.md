# Battlefleet — prototype

Jeu en deux parties, jouable directement dans le navigateur (aucune installation) :

1. **Stratégie** : déplacez vos vaisseaux capitaux en 3D (plan + altitude), en **tours simultanés**.
2. **Combat** : quand deux flottes entrent en contact, vous pilotez un chasseur en vue première
   personne. La position des gros vaisseaux sur la carte devient le décor du combat, et les
   dégâts reviennent sur la carte stratégique.

> Projet de fan, non officiel, sans lien avec Games Workshop. Aucun élément graphique ou texte
> de l'univers Warhammer 40 000 n'est inclus : les vaisseaux sont de simples boîtes colorées.

## Contrôles

**Stratégie**
- Clic gauche sur un de vos vaisseaux, puis clic gauche sur la carte : ordre de déplacement
- `R` / `F` (ou Maj + molette) : monter / descendre l'ordre en altitude
- Clic droit + glisser : tourner la vue · molette : zoom · `Z Q S D` : déplacer la vue
- `Entrée` : valider les ordres (le cercle autour du vaisseau = sa portée pour ce tour)

**Combat**
- Souris : piloter · clic gauche ou `Espace` : tirer · `Z` / `S` : poussée · `Échap` : pause

Jouable sur ordinateur (clavier + souris), pas sur téléphone.

## Mettre en ligne avec GitHub Pages (sans rien installer)

1. Créez un compte sur <https://github.com> si vous n'en avez pas.
2. Cliquez sur **+** (en haut à droite) puis **New repository**.
   Nom : `battlefleet-40k` (par exemple). Choisissez **Public**. Cliquez **Create repository**.
3. Sur la page du dépôt, cliquez sur **uploading an existing file**, puis glissez-déposez ces
   fichiers : `index.html`, `game.js`, `logic.js`, `README.md`. Cliquez **Commit changes**.
4. Allez dans **Settings** → **Pages** (menu de gauche).
   Sous **Build and deployment**, choisissez **Deploy from a branch**, branche **main**,
   dossier **/ (root)**, puis **Save**.
5. Attendez une à deux minutes. Le jeu est alors en ligne à l'adresse :
   `https://VOTRE_PSEUDO.github.io/battlefleet-40k/`

Pour mettre à jour le jeu plus tard : dans le dépôt, **Add file** → **Upload files**, envoyez la
nouvelle version d'un fichier, **Commit changes**. Le site se met à jour tout seul.

## Tester sur votre ordinateur avant de publier

Double-cliquez sur `index.html` : le jeu s'ouvre dans le navigateur (il faut une connexion
internet, car la bibliothèque 3D Three.js est chargée depuis un CDN).

## Organisation du code

- `logic.js` : règles du jeu, sans affichage (état, ordres, résolution des tours simultanés,
  contacts, pont vers le combat, IA). C'est la partie qu'un serveur exécuterait en multijoueur.
- `game.js` : affichage 3D, entrées souris/clavier, combat.
- `index.html` : la page.

## Pistes pour la suite

- Carte galactique (planètes, routes warp) au-dessus de la vue système
- IA de chasseurs ennemis, plusieurs chasseurs alliés
- Vrais modèles 3D à la place des boîtes
- Multijoueur : un serveur reçoit les ordres des deux camps et appelle `resolveTurn`
