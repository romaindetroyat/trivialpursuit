# Trivial 1000

Jeu de questions façon Trivial Pursuit : **1000 cartes de 6 questions**, soit 6000 questions en français,
dans une application web progressive (PWA) installable sur téléphone et utilisable hors ligne.

| Couleur | Catégorie |
|---|---|
| 🔵 Bleu | Géographie |
| 🩷 Rose | Divertissement |
| 🟡 Jaune | Histoire |
| 🟤 Marron | Arts & Littérature |
| 🟢 Vert | Sciences & Nature |
| 🟠 Orange | Sports & Loisirs |

## Ce que fait l'application

- **Piocher une carte** : pour jouer avec un vrai plateau. Le paquet est mélangé et aucune carte
  ne ressort avant d'avoir vu les 1000. Touchez une question pour voir sa réponse.
- **Partie sans plateau** : 2 à 6 joueurs. Le dé tire une couleur, une bonne réponse rapporte le
  camembert de la couleur et permet de rejouer. Avec les 6 camemberts, les autres joueurs choisissent
  la catégorie de la question finale. Réglages : difficulté des questions, nombre de bonnes
  réponses nécessaires par camembert. La partie est sauvegardée si l'application est fermée.
- **Parcourir** : recherche plein texte (sans accents), filtre par catégorie et difficulté, ou
  saisie d'un numéro de carte.
- **Imprimer** : planches A4 de 6 cartes (95 × 92 mm), recto questions / verso réponses en miroir
  pour une impression recto verso bord long. La taille du texte s'ajuste à chaque carte.

## Organisation

```
app/                 la PWA (fichiers statiques, aucune dépendance)
  index.html, styles.css, app.js
  cartes.json        les 1000 cartes (généré)
  manifest.webmanifest, sw.js, icons/
data/
  raw/*.json         questions sources par catégorie et sous-thème
  cartes.csv         toutes les cartes, lisible dans un tableur (généré)
  reserve.json       questions valides non utilisées, pour remplacer une question (généré)
scripts/build.py     assemble data/raw en cartes équilibrées
```

Chaque question source a la forme :

```json
{"q": "Quel fleuve traverse Lyon avant de rejoindre le Rhône ?", "r": "La Saône", "d": 1, "t": "Fleuves"}
```

`d` est la difficulté (1 facile, 2 moyenne, 3 difficile) et `t` le sous-thème.

## Modifier les questions

1. Corrigez, ajoutez ou supprimez des questions dans `data/raw/<catégorie>_*.json`
   (`geo`, `div`, `his`, `art`, `sci`, `spo`).
2. Régénérez les cartes :

   ```sh
   python3 scripts/build.py            # 1000 cartes, graine 2026
   python3 scripts/build.py --cartes 500 --graine 7
   ```

   Le script valide les questions, supprime les doublons, garde la même répartition de
   difficulté, et compose des cartes de difficulté totale équilibrée.
3. Incrémentez `VERSION` dans `app/sw.js` pour que les téléphones récupèrent la mise à jour.

## Lancer en local

```sh
cd app && python3 -m http.server 8080
```

puis ouvrez <http://localhost:8080>. Un serveur est nécessaire : la page ne fonctionne pas
ouverte directement depuis le disque (`file://`).

## Publier et installer

Le workflow `.github/workflows/pages.yml` publie le dossier `app/` sur GitHub Pages à chaque push
sur `main`. Il faut l'activer une fois : **Settings → Pages → Source : GitHub Actions**.

Sur téléphone, ouvrez l'adresse du site puis :
- Android / Chrome : menu ⋮ → **Installer l'application** (ou le bouton sur l'accueil) ;
- iPhone / Safari : bouton Partager → **Sur l'écran d'accueil**.

Après la première ouverture, le jeu fonctionne sans connexion.

---

Projet personnel non affilié à Hasbro ; « Trivial Pursuit » est une marque de son propriétaire.
