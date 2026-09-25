#!/usr/bin/env python3
"""Assemble les questions de data/raw/ en cartes de 6 questions.

- donne à chaque question un identifiant stable (champ "id", ajouté dans data/raw/ s'il manque) ;
- conserve telles quelles les cartes déjà composées, enregistrées dans data/paquet.json
  (une question supprimée des sources y est remplacée par une question de même catégorie) ;
- valide et nettoie chaque question, écarte les doublons (texte identique ou quasi identique
  avec la même réponse), y compris avec les questions déjà placées sur une carte ;
- ajoute si besoin de nouvelles cartes, équilibrées en difficulté, jusqu'au nombre demandé ;
- écrit app/cartes.json (données de la PWA), data/cartes.csv (pour relire ou éditer),
  data/paquet.json et data/reserve.json (questions valides non utilisées).

Usage : python3 scripts/build.py [--cartes N] [--edition NOM] [--graine 2026]
Sans --cartes, le nombre de cartes du paquet existant est conservé.
"""
import argparse
import csv
import glob
import json
import os
import random
import re
import sys
import unicodedata

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CATEGORIES = [
    {"id": "geo", "nom": "Géographie", "couleur": "#1f6fd1"},
    {"id": "div", "nom": "Divertissement", "couleur": "#e0479e"},
    {"id": "his", "nom": "Histoire", "couleur": "#f2c200"},
    {"id": "art", "nom": "Arts & Littérature", "couleur": "#8a5a2b"},
    {"id": "sci", "nom": "Sciences & Nature", "couleur": "#2e9e4f"},
    {"id": "spo", "nom": "Sports & Loisirs", "couleur": "#f07c1b"},
]

MOTS_VIDES = set("""le la les un une des de du d l a à au aux en et est qui que quel quelle quels quelles
dans par pour sur ce cette ces son sa ses il elle on se s y ou où comment combien quoi
nom appelle appelait t il-t-on""".split())


def normaliser(texte):
    t = unicodedata.normalize("NFD", texte.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def mots(texte):
    return {m for m in normaliser(texte).split() if m not in MOTS_VIDES and len(m) > 1}


def nettoyer(item, source):
    q = " ".join(str(item.get("q", "")).split())
    r = " ".join(str(item.get("r", "")).split())
    t = " ".join(str(item.get("t", "")).split()) or "Divers"
    try:
        d = int(item.get("d", 2))
    except (TypeError, ValueError):
        d = 2
    if not q or not r:
        return None, "question ou réponse vide"
    q = re.sub(r"\s*\?$", " ?", q)
    if not q.endswith("?"):
        q += " ?"
    if len(q) > 260:
        return None, "question trop longue"
    if len(r) > 70:
        return None, "réponse trop longue"
    return {"id": item["id"], "q": q, "r": r, "d": min(3, max(1, d)), "t": t, "src": source}, None


def attribuer_identifiants():
    """Ajoute un identifiant stable aux questions sources qui n'en ont pas."""
    for chemin in sorted(glob.glob(os.path.join(RACINE, "data", "raw", "*_*.json"))):
        base = os.path.basename(chemin)[:-5]
        try:
            with open(chemin, encoding="utf-8") as f:
                donnees = json.load(f)
        except json.JSONDecodeError as e:
            sys.exit(f"JSON invalide dans {base}.json : {e}")
        pris = {x.get("id") for x in donnees}
        n, modifie = 0, False
        for i, item in enumerate(donnees):
            if item.get("id"):
                continue
            while True:
                n += 1
                nouvel = f"{base}-{n:03d}"
                if nouvel not in pris:
                    break
            pris.add(nouvel)
            donnees[i] = {"id": nouvel, **item}
            modifie = True
        if modifie:
            with open(chemin, "w", encoding="utf-8") as f:
                json.dump(donnees, f, ensure_ascii=False, indent=1)
                f.write("\n")


def charger(cat_id):
    questions, rejets = [], []
    for chemin in sorted(glob.glob(os.path.join(RACINE, "data", "raw", f"{cat_id}_*.json"))):
        source = os.path.basename(chemin)
        try:
            with open(chemin, encoding="utf-8") as f:
                donnees = json.load(f)
        except json.JSONDecodeError as e:
            sys.exit(f"JSON invalide dans {source} : {e}")
        for item in donnees:
            propre, raison = nettoyer(item, source)
            if propre:
                questions.append(propre)
            else:
                rejets.append((source, raison, item))
    return questions, rejets


def dedoublonner(questions, vus=None, par_reponse=None):
    """Écarte les questions identiques, ou proches avec la même réponse.

    `vus` et `par_reponse` peuvent être partagés entre catégories pour détecter
    un même fait posé dans deux catégories différentes.
    """
    gardees, doublons = [], []
    vus = set() if vus is None else vus
    par_reponse = {} if par_reponse is None else par_reponse
    for q in questions:
        cle = normaliser(q["q"])
        if cle in vus:
            doublons.append(q)
            continue
        rep = normaliser(q["r"])
        m = mots(q["q"])
        similaire = False
        for autre in par_reponse.get(rep, []):
            union = m | autre
            if union and len(m & autre) / len(union) >= 0.5:
                similaire = True
                break
        if similaire:
            doublons.append(q)
            continue
        vus.add(cle)
        par_reponse.setdefault(rep, []).append(m)
        gardees.append(q)
    return gardees, doublons


def selectionner(questions, n, rng):
    """Garde n questions en préservant la répartition des difficultés."""
    if len(questions) <= n:
        return questions, []
    melange = questions[:]
    rng.shuffle(melange)
    par_niveau = {d: [q for q in melange if q["d"] == d] for d in (1, 2, 3)}
    quotas = {d: round(n * len(par_niveau[d]) / len(melange)) for d in (1, 2, 3)}
    quotas[2] += n - sum(quotas.values())
    choisies, reserve = [], []
    for d in (1, 2, 3):
        choisies += par_niveau[d][: quotas[d]]
        reserve += par_niveau[d][quotas[d]:]
    return choisies, reserve


def composer(par_cat, n, rng):
    """Répartit les questions sur n cartes en équilibrant la difficulté totale de chaque carte."""
    cartes = [[None] * len(CATEGORIES) for _ in range(n)]
    totaux = [0] * n
    for i, cat in enumerate(CATEGORIES):
        qs = par_cat[cat["id"]][:]
        rng.shuffle(qs)
        qs.sort(key=lambda q: q["d"])  # tri stable : ordre aléatoire à difficulté égale
        ordre = list(range(n))
        rng.shuffle(ordre)
        ordre.sort(key=lambda k: -totaux[k])  # cartes déjà difficiles d'abord
        for k, q in zip(ordre, qs):
            cartes[k][i] = q
            totaux[k] += q["d"]
    rng.shuffle(cartes)
    return cartes


def charger_alias():
    """Réponses alternatives acceptées et texte à lire, préparés par question (data/alias/*.json)."""
    alias = {}
    for chemin in sorted(glob.glob(os.path.join(RACINE, "data", "alias", "*.json"))):
        with open(chemin, encoding="utf-8") as f:
            try:
                alias.update(json.load(f))
            except json.JSONDecodeError as e:
                sys.exit(f"JSON invalide dans {os.path.basename(chemin)} : {e}")
    return alias


def enrichir(q, alias):
    """Renvoie la question au format compact [q, r, d, t] + [alternatives, texte à lire] si présents."""
    info = alias.get(q["id"], {})
    reponse = normaliser(q["r"])
    alternatives = []
    for a in info.get("a", []):
        a = " ".join(str(a).split())
        if a and len(a) <= 50 and normaliser(a) != reponse and a not in alternatives:
            alternatives.append(a)
    lecture = " ".join(str(info.get("l", "")).split())
    if lecture == q["q"]:
        lecture = ""
    ligne = [q["q"], q["r"], q["d"], q["t"]]
    if alternatives or lecture:
        ligne.append(alternatives)
    if lecture:
        ligne.append(lecture)
    return ligne


def charger_paquet():
    """Renvoie (cartes, éditions) du paquet enregistré ; chaque édition couvre une plage de cartes."""
    chemin = os.path.join(RACINE, "data", "paquet.json")
    if not os.path.exists(chemin):
        return [], []
    with open(chemin, encoding="utf-8") as f:
        paquet = json.load(f)
    cartes = paquet["cartes"]
    editions = paquet.get("editions") or ([{"nom": "Base", "de": 1, "a": len(cartes)}] if cartes else [])
    return cartes, editions


def ecrire_paquet(cartes, editions):
    lignes = ",\n".join("  " + json.dumps([q["id"] for q in c]) for c in cartes)
    with open(os.path.join(RACINE, "data", "paquet.json"), "w", encoding="utf-8") as f:
        f.write('{"categories": ' + json.dumps([c["id"] for c in CATEGORIES])
                + ',\n "editions": ' + json.dumps(editions, ensure_ascii=False)
                + ',\n "cartes": [\n' + lignes + "\n]}\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cartes", type=int, default=None, help="nombre total de cartes voulu")
    ap.add_argument("--graine", type=int, default=2026)
    ap.add_argument("--edition", default=None, help="nom de l'édition regroupant les nouvelles cartes")
    args = ap.parse_args()
    rng = random.Random(args.graine)

    attribuer_identifiants()
    par_id, brutes_par_cat, rejets_par_cat = {}, {}, {}
    for cat in CATEGORIES:
        brutes, rejets = charger(cat["id"])
        brutes_par_cat[cat["id"]], rejets_par_cat[cat["id"]] = brutes, rejets
        for q in brutes:
            par_id[q["id"]] = q
        for source, raison, item in rejets:
            print(f"  rejet [{source}] {raison} : {item}", file=sys.stderr)

    # Cartes déjà composées : on les garde, en notant les questions disparues des sources.
    paquet, editions = charger_paquet()
    cartes, trous = [], []
    for k, ids in enumerate(paquet):
        carte = []
        for i, qid in enumerate(ids):
            q = par_id.get(qid)
            if q is None or q["src"].split("_")[0] != CATEGORIES[i]["id"]:
                trous.append((k, i, qid))
                q = None
            carte.append(q)
        cartes.append(carte)
    places = {q["id"] for c in cartes for q in c if q}

    # Doublons : les questions déjà placées passent en premier et ne sont jamais écartées.
    vus, par_reponse = set(), {}
    dedoublonner([q for c in cartes for q in c if q], vus, par_reponse)
    libres, bilan = {}, []
    for cat in CATEGORIES:
        candidates = [q for q in brutes_par_cat[cat["id"]] if q["id"] not in places]
        uniques, doublons = dedoublonner(candidates, vus, par_reponse)
        libres[cat["id"]] = uniques
        bilan.append((cat, len(brutes_par_cat[cat["id"]]), len(rejets_par_cat[cat["id"]]), len(doublons)))

    # Questions disparues : remplacées par une question libre de même catégorie et difficulté proche.
    for k, i, qid in trous:
        pool = libres[CATEGORIES[i]["id"]]
        if not pool:
            sys.exit(f"Plus de question disponible pour remplacer {qid} (carte {k + 1}).")
        rng.shuffle(pool)
        pool.sort(key=lambda q: abs(q["d"] - 2))
        cartes[k][i] = pool.pop(0)
        print(f"  carte {k + 1} : {qid} introuvable, remplacée par {cartes[k][i]['id']}", file=sys.stderr)

    # Nouvelles cartes.
    objectif = args.cartes if args.cartes is not None else len(cartes)
    a_creer = objectif - len(cartes)
    if a_creer < 0:
        sys.exit(f"Le paquet contient déjà {len(cartes)} cartes : impossible d'en garder seulement {objectif}.")
    if a_creer:
        a_creer = min([a_creer] + [len(v) for v in libres.values()])
        if len(cartes) + a_creer < objectif:
            print(f"\nAttention : seulement {len(cartes) + a_creer} cartes possibles (objectif {objectif}).")
        choisies = {}
        for cat in CATEGORIES:
            choisies[cat["id"]], libres[cat["id"]] = selectionner(libres[cat["id"]], a_creer, rng)
        debut = len(cartes) + 1
        cartes += composer(choisies, a_creer, rng)
        nom = args.edition or ("Base" if not editions else f"Extension {len(editions)}")
        editions.append({"nom": nom, "de": debut, "a": len(cartes)})
    reserve = libres

    for cat, nb_brutes, nb_rejets, nb_doublons in bilan:
        i = CATEGORIES.index(cat)
        niveaux = [sum(1 for c in cartes if c[i]["d"] == d) for d in (1, 2, 3)]
        print(f"{cat['nom']:<20} sources {nb_brutes:>5}  rejetées {nb_rejets:>3}  doublons {nb_doublons:>3}"
              f"  en jeu {len(cartes):>5}  réserve {len(reserve[cat['id']]):>4}"
              f"  (faciles/moyennes/difficiles {niveaux[0]}/{niveaux[1]}/{niveaux[2]})")

    ecrire_paquet(cartes, editions)

    alias = charger_alias()
    sortie = {
        "version": 1,
        "categories": CATEGORIES,
        "editions": editions,
        "cartes": [[enrichir(q, alias) for q in carte] for carte in cartes],
    }
    with open(os.path.join(RACINE, "app", "cartes.json"), "w", encoding="utf-8") as f:
        json.dump(sortie, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(RACINE, "data", "cartes.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["carte", "categorie", "question", "reponse", "difficulte", "theme", "id"])
        for num, carte in enumerate(cartes, 1):
            for cat, q in zip(CATEGORIES, carte):
                w.writerow([num, cat["nom"], q["q"], q["r"], q["d"], q["t"], q["id"]])

    with open(os.path.join(RACINE, "data", "reserve.json"), "w", encoding="utf-8") as f:
        json.dump({k: [{kk: q[kk] for kk in ("id", "q", "r", "d", "t")} for q in v] for k, v in reserve.items()},
                  f, ensure_ascii=False, indent=1)

    print(f"\n{len(cartes)} cartes ({len(cartes) * len(CATEGORIES)} questions) écrites dans app/cartes.json et data/cartes.csv")


if __name__ == "__main__":
    main()
