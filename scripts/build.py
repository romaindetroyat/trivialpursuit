#!/usr/bin/env python3
"""Assemble les questions de data/raw/ en cartes de 6 questions.

- valide et nettoie chaque question ;
- supprime les doublons (texte identique ou quasi identique avec la même réponse) ;
- retient N questions par catégorie (1000 par défaut) et place le surplus dans data/reserve.json ;
- compose des cartes équilibrées en difficulté ;
- écrit app/cartes.json (données de la PWA) et data/cartes.csv (pour relire ou éditer).

Usage : python3 scripts/build.py [--cartes 1000] [--graine 2026]
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
    return {"q": q, "r": r, "d": min(3, max(1, d)), "t": t, "src": source}, None


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


def dedoublonner(questions):
    gardees, doublons = [], []
    vus = set()
    par_reponse = {}
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cartes", type=int, default=1000)
    ap.add_argument("--graine", type=int, default=2026)
    args = ap.parse_args()
    rng = random.Random(args.graine)

    par_cat, reserve, bilan = {}, {}, []
    for cat in CATEGORIES:
        brutes, rejets = charger(cat["id"])
        uniques, doublons = dedoublonner(brutes)
        choisies, surplus = selectionner(uniques, args.cartes, rng)
        par_cat[cat["id"]] = choisies
        reserve[cat["id"]] = surplus
        niveaux = [sum(1 for q in choisies if q["d"] == d) for d in (1, 2, 3)]
        bilan.append(f"{cat['nom']:<20} brutes {len(brutes):>5}  rejetées {len(rejets):>3}  doublons {len(doublons):>3}"
                     f"  retenues {len(choisies):>5}  réserve {len(surplus):>4}  (faciles/moyennes/difficiles {niveaux[0]}/{niveaux[1]}/{niveaux[2]})")
        for source, raison, item in rejets:
            print(f"  rejet [{source}] {raison} : {item}", file=sys.stderr)

    print("\n".join(bilan))
    n = min(len(v) for v in par_cat.values())
    if n < args.cartes:
        print(f"\nAttention : seulement {n} cartes complètes possibles (objectif {args.cartes}).")
        for cat in CATEGORIES:
            surplus = par_cat[cat["id"]][n:]
            par_cat[cat["id"]] = par_cat[cat["id"]][:n]
            reserve[cat["id"]] = surplus + reserve[cat["id"]]
    if n == 0:
        sys.exit("Aucune carte à composer.")

    cartes = composer(par_cat, n, rng)

    sortie = {
        "version": 1,
        "categories": CATEGORIES,
        "cartes": [[[q["q"], q["r"], q["d"], q["t"]] for q in carte] for carte in cartes],
    }
    with open(os.path.join(RACINE, "app", "cartes.json"), "w", encoding="utf-8") as f:
        json.dump(sortie, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(RACINE, "data", "cartes.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["carte", "categorie", "question", "reponse", "difficulte", "theme"])
        for num, carte in enumerate(cartes, 1):
            for cat, q in zip(CATEGORIES, carte):
                w.writerow([num, cat["nom"], q["q"], q["r"], q["d"], q["t"]])

    with open(os.path.join(RACINE, "data", "reserve.json"), "w", encoding="utf-8") as f:
        json.dump({k: [{kk: q[kk] for kk in ("q", "r", "d", "t")} for q in v] for k, v in reserve.items()},
                  f, ensure_ascii=False, indent=1)

    print(f"\n{len(cartes)} cartes ({len(cartes) * len(CATEGORIES)} questions) écrites dans app/cartes.json et data/cartes.csv")


if __name__ == "__main__":
    main()
