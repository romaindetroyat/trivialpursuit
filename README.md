# Trivial 1000

Jeu de questions façon Trivial Pursuit : **1833 cartes de 6 questions** (base de 1000 cartes + extension de 833), soit près de 11 000 questions en français,
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
  ne ressort avant d'avoir vu toutes les autres. On peut piocher dans tout le paquet, ou seulement
  dans la base ou l'extension. Touchez une question pour voir sa réponse.
- **Solo** : séries de 10, 20 ou 30 questions, ou mode survie (fin à la 3e erreur), sur toutes les
  catégories ou une seule. Une bonne réponse rapporte 1, 2 ou 3 points selon la difficulté, plus 1 point
  de bonus à partir de 3 bonnes réponses d'affilée. Le record de chaque réglage est conservé, et l'écran
  de fin détaille le score par catégorie et rappelle les réponses manquées. Les questions déjà vues en
  solo ne reviennent qu'une fois toutes les autres épuisées.
  On répond **à voix haute** (reconnaissance vocale du navigateur) ou au clavier ; la réponse est
  comparée à celle attendue avec tolérance (articles, accents, fautes légères, nom de famille seul,
  nombres en lettres ou en chiffres romains, variantes entre parenthèses, mots déjà présents dans la
  question) et aux **autres formulations acceptées** préparées par IA pour chaque question
  (synonymes, graphies, sigles, noms courants). On peut toujours corriger le verdict.
  L'application peut **lire les questions à voix haute** (aussi en partie à plusieurs), et un mode
  **mains libres** enchaîne lecture de la question, écoute de la réponse, verdict et question suivante.
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
  reponse.js         comparaison tolérante des réponses données en solo
  cartes.json        toutes les cartes et leurs éditions (généré)
  manifest.webmanifest, sw.js, icons/
data/
  raw/*.json         questions sources par catégorie et sous-thème
  paquet.json        composition figée de chaque carte (identifiants des 6 questions) et éditions
  cartes.csv         toutes les cartes, lisible dans un tableur (généré)
  reserve.json       questions valides non utilisées, pour remplacer une question (généré)
  alias/*.json       par question : autres réponses acceptées ("a") et texte à lire à voix haute ("l")
scripts/build.py     assemble data/raw en cartes équilibrées
```

Chaque question source a la forme :

```json
{"id": "geo_a_2-017", "q": "Quel fleuve traverse Lyon avant de rejoindre le Rhône ?", "r": "La Saône", "d": 1, "t": "Fleuves"}
```

`d` est la difficulté (1 facile, 2 moyenne, 3 difficile), `t` le sous-thème et `id` un identifiant
stable, ajouté automatiquement par le script s'il manque.

Le paquet est découpé en **éditions** : la base (cartes 1 à 1000) et l'extension (cartes 1001 et
suivantes). Une carte déjà composée ne change jamais de numéro ni de questions : des cartes imprimées
restent valables après une mise à jour.

## Modifier les questions

1. Corrigez, ajoutez ou supprimez des questions dans `data/raw/<catégorie>_*.json`
   (`geo`, `div`, `his`, `art`, `sci`, `spo`).
2. Régénérez les cartes :

   ```sh
   python3 scripts/build.py                                   # garde le paquet tel quel
   python3 scripts/build.py --cartes 2000 --edition "Extension 2"   # ajoute des cartes
   ```

   Le script valide les questions et écarte les doublons, y compris avec les questions déjà
   placées sur une carte. Une question corrigée garde sa place ; une question supprimée est
   remplacée par une question de la réserve de même catégorie. Les nouvelles cartes reprennent
   la répartition de difficulté et sont équilibrées entre elles.
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
