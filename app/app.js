/* Trivial 1000 — application sans dépendance. */
'use strict';

const CLE_PIOCHE = 'trivial1000.pioche';
const CLE_PARTIE = 'trivial1000.partie';
const CLE_JOUEURS = 'trivial1000.joueurs';
const CLE_SOLO = 'trivial1000.solo';
const CLE_SOLO_VUES = 'trivial1000.solo.vues';
const CLE_SOLO_RECORDS = 'trivial1000.solo.records';

// Texte lisible sur fond clair pour les couleurs trop pâles (jaune).
const COULEUR_TEXTE = { his: '#9a7a00' };

let DATA = null;          // { categories, cartes }
let CATS = [];            // catégories dans l'ordre des cartes
let QUESTIONS = [];       // liste à plat : { id, carte, cat, q, r, d, t }

/* ---------------- Utilitaires ---------------- */

const $ = (sel, racine = document) => racine.querySelector(sel);

function h(balise, attrs = {}, ...enfants) {
  const el = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) {
    if (e == null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(e));
  }
  return el;
}

function lire(cle, defaut) {
  try {
    const v = localStorage.getItem(cle);
    return v ? JSON.parse(v) : defaut;
  } catch { return defaut; }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
}
function effacer(cle) {
  try { localStorage.removeItem(cle); } catch { /* ignore */ }
}

function melanger(tab) {
  const a = tab.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const numero = n => String(n).padStart(4, '0');
// Typographie française : espace insécable avant ? ! : ; » et après «, pour éviter
// qu'un signe se retrouve seul en début de ligne.
const typo = t => String(t).replace(/\s+([?!:;»])/g, '\u00a0$1').replace(/«\s+/g, '«\u00a0');
const styleCat = c => `--c:${c.couleur};--c-texte:${COULEUR_TEXTE[c.id] || c.couleur}`;
const catParId = id => CATS.find(c => c.id === id);

function niveau(d) {
  const libelle = ['', 'facile', 'moyenne', 'difficile'][d] || '';
  return h('span', { class: 'niv', title: `Difficulté ${libelle}`, 'aria-label': `difficulté ${libelle}` },
    [1, 2, 3].map(i => h('i', { class: i <= d ? 'on' : null })));
}

function camembert(parts, taille = 36) {
  // parts : tableau de booléens dans l'ordre des catégories
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', taille);
  svg.setAttribute('height', taille);
  svg.setAttribute('aria-hidden', 'true');
  const fond = document.createElementNS(ns, 'circle');
  fond.setAttribute('cx', 32); fond.setAttribute('cy', 32); fond.setAttribute('r', 30);
  fond.setAttribute('fill', '#fff');
  svg.append(fond);
  const n = CATS.length;
  CATS.forEach((c, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const r = 27;
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', `M32 32 L${32 + r * Math.cos(a0)} ${32 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${32 + r * Math.cos(a1)} ${32 + r * Math.sin(a1)} Z`);
    p.setAttribute('fill', parts[i] ? c.couleur : '#dcd6c8');
    p.setAttribute('stroke', '#fff');
    p.setAttribute('stroke-width', '1.5');
    svg.append(p);
  });
  return svg;
}

/* ---------------- Rendu d'une carte ---------------- */

function ligneQuestion(cat, [q, r, d], { ouvert = false, cliquable = true } = {}) {
  const el = h(cliquable ? 'button' : 'div', {
    class: 'ligne-q' + (ouvert ? ' ouvert' : ''),
    style: styleCat(cat),
    type: cliquable ? 'button' : null,
    'aria-expanded': cliquable ? String(ouvert) : null,
  },
    h('span', { class: 'cat' }, cat.nom, niveau(d)),
    h('span', { class: 'q' }, q),
    h('span', { class: 'r' }, r),
  );
  if (cliquable) {
    el.append(h('span', { class: 'indice' }, 'Voir la réponse'));
    el.addEventListener('click', () => {
      const o = el.classList.toggle('ouvert');
      el.setAttribute('aria-expanded', String(o));
    });
  }
  return el;
}

function rendreCarte(conteneur, index) {
  const carte = DATA.cartes[index];
  conteneur.replaceChildren(
    h('div', { class: 'carte-tete' }, h('span', {}, 'CARTE'), h('span', { class: 'num' }, 'N° ' + numero(index + 1))),
    ...CATS.map((c, i) => ligneQuestion(c, carte[i])),
  );
}

/* ---------------- Pioche ---------------- */

function cartesDuPaquet(choix) {
  // choix : 'tout' ou l'indice d'une édition (plage de numéros de cartes).
  const ed = (DATA.editions || [])[choix];
  if (!ed) return [...DATA.cartes.keys()];
  return Array.from({ length: ed.a - ed.de + 1 }, (_, i) => ed.de - 1 + i);
}

function nouvellePioche(choix) {
  return { paquet: choix, ordre: melanger(cartesDuPaquet(choix)), pos: 0 };
}

function etatPioche() {
  let etat = lire(CLE_PIOCHE, null);
  const choix = etat && etat.paquet != null ? etat.paquet : 'tout';
  if (!etat || !Array.isArray(etat.ordre) || etat.ordre.length !== cartesDuPaquet(choix).length
    || etat.ordre.some(i => !DATA.cartes[i])) {
    etat = nouvellePioche(choix);
    ecrire(CLE_PIOCHE, etat);
  }
  return etat;
}

function afficherPioche(avancer = false) {
  let etat = etatPioche();
  if (avancer) etat.pos++;
  if (etat.pos >= etat.ordre.length) etat = nouvellePioche(etat.paquet);
  ecrire(CLE_PIOCHE, etat);
  rendreCarte($('#pioche-carte'), etat.ordre[etat.pos]);
  $('#pioche-info').textContent = `Carte ${etat.pos + 1} sur ${etat.ordre.length}`;
  $('#pioche-paquet').value = String(etat.paquet);
}

function initPioche() {
  $('#pioche-suivante').addEventListener('click', () => {
    afficherPioche(true);
    $('#pioche-carte').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  $('#pioche-retourner').addEventListener('click', () => {
    const lignes = [...document.querySelectorAll('#pioche-carte .ligne-q')];
    const toutOuvert = lignes.every(l => l.classList.contains('ouvert'));
    lignes.forEach(l => {
      l.classList.toggle('ouvert', !toutOuvert);
      l.setAttribute('aria-expanded', String(!toutOuvert));
    });
  });
  $('#pioche-reset').addEventListener('click', () => {
    if (!confirm('Remélanger tout le paquet ? Les cartes déjà vues pourront ressortir.')) return;
    ecrire(CLE_PIOCHE, nouvellePioche(etatPioche().paquet));
    afficherPioche();
  });
  const editions = DATA.editions || [];
  if (editions.length > 1) {
    const choix = $('#pioche-paquet');
    choix.append(
      h('option', { value: 'tout' }, `Toutes les cartes (1 à ${DATA.cartes.length})`),
      ...editions.map((ed, i) => h('option', { value: String(i) }, `${ed.nom} (${ed.de} à ${ed.a})`)));
    choix.hidden = false;
    choix.addEventListener('change', () => {
      ecrire(CLE_PIOCHE, nouvellePioche(choix.value === 'tout' ? 'tout' : Number(choix.value)));
      afficherPioche();
    });
  }
}

/* ---------------- Partie sans plateau ---------------- */

let partie = null;

const NIVEAUX = {
  0: [1, 2, 3],
  1: [1],
  2: [1, 2],
  3: [2, 3],
};

function sauverPartie() { ecrire(CLE_PARTIE, partie); }

function champJoueur(nom = '') {
  const ligne = h('div', { class: 'joueur-champ' },
    h('input', { type: 'text', name: 'joueur', value: nom, placeholder: 'Nom du joueur', maxlength: 20, 'aria-label': 'Nom du joueur' }),
    h('button', {
      type: 'button', class: 'btn-lien', 'aria-label': 'Retirer ce joueur',
      onclick: () => {
        if ($('#liste-joueurs').children.length > 2) ligne.remove();
      },
    }, 'Retirer'),
  );
  return ligne;
}

function afficherConfig() {
  $('#partie-config').hidden = false;
  $('#partie-jeu').hidden = true;
  const liste = $('#liste-joueurs');
  const noms = lire(CLE_JOUEURS, ['Joueur 1', 'Joueur 2']);
  liste.replaceChildren(...noms.map(n => champJoueur(n)));
}

function tirerQuestion(catId) {
  const niveaux = NIVEAUX[partie.niveau] || NIVEAUX[0];
  const deja = new Set(partie.utilisees);
  let pool = QUESTIONS.filter(q => q.cat === catId && niveaux.includes(q.d) && !deja.has(q.id));
  if (!pool.length) {
    // Toutes les questions de ce niveau ont servi : on recycle celles de cette catégorie.
    partie.utilisees = partie.utilisees.filter(id => QUESTIONS[id].cat !== catId);
    pool = QUESTIONS.filter(q => q.cat === catId && niveaux.includes(q.d));
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  partie.utilisees.push(q.id);
  return q.id;
}

function rendreScores() {
  $('#scores').replaceChildren(...partie.joueurs.map((j, i) =>
    h('div', { class: 'score' + (i === partie.tour ? ' actif' : '') },
      camembert(CATS.map(c => j.parts.includes(c.id))),
      h('div', {},
        h('div', { class: 'nom' }, j.nom),
        h('div', { class: 'meta', style: 'font-size:.8rem;color:var(--texte-doux)' }, `${j.parts.length}/6`),
      ),
    )));
}

function joueurCourant() { return partie.joueurs[partie.tour]; }

function passerAuSuivant() {
  partie.tour = (partie.tour + 1) % partie.joueurs.length;
  partie.phase = 'de';
  partie.question = null;
  partie.cat = null;
  sauverPartie();
  rendrePartie();
}

function lancerDe() {
  const de = $('.de');
  const bouton = $('#btn-de');
  bouton.disabled = true;
  de.classList.add('roule');
  let n = 0;
  const final = CATS[Math.floor(Math.random() * CATS.length)];
  const t = setInterval(() => {
    const c = n < 11 ? CATS[Math.floor(Math.random() * CATS.length)] : final;
    de.style.setProperty('--c', c.couleur);
    de.textContent = c.nom;
    if (++n > 11) {
      clearInterval(t);
      de.classList.remove('roule');
      setTimeout(() => {
        partie.cat = final.id;
        partie.question = tirerQuestion(final.id);
        partie.phase = 'question';
        sauverPartie();
        rendrePartie();
      }, 450);
    }
  }, 90);
}

function choisirCategorieFinale(catId) {
  partie.cat = catId;
  partie.question = tirerQuestion(catId);
  partie.phase = 'question';
  sauverPartie();
  rendrePartie();
}

function repondre(bon) {
  const j = joueurCourant();
  const final = j.parts.length === CATS.length;
  if (bon) {
    if (final) {
      partie.phase = 'victoire';
      partie.gagnant = partie.tour;
      sauverPartie();
      rendrePartie();
      return;
    }
    if (!j.parts.includes(partie.cat)) {
      j.bonnes[partie.cat] = (j.bonnes[partie.cat] || 0) + 1;
      if (j.bonnes[partie.cat] >= partie.requis) j.parts.push(partie.cat);
    }
    // Bonne réponse : le joueur rejoue.
    partie.phase = 'de';
    partie.question = null;
    partie.cat = null;
    sauverPartie();
    rendrePartie();
  } else {
    passerAuSuivant();
  }
}

function rendrePartie() {
  if (!partie) { afficherConfig(); return; }
  $('#partie-config').hidden = true;
  $('#partie-jeu').hidden = false;
  rendreScores();
  const tour = $('#tour');
  const j = joueurCourant();
  const complet = j.parts.length === CATS.length;

  if (partie.phase === 'victoire') {
    const g = partie.joueurs[partie.gagnant];
    tour.replaceChildren(h('div', { class: 'hero victoire' },
      camembert(CATS.map(() => true), 140),
      h('h2', { style: 'margin-top:14px' }, `${g.nom} a gagné !`),
      h('p', { class: 'message' }, 'Camembert complet et question finale réussie.'),
      h('button', { type: 'button', class: 'btn', onclick: nouvellePartie }, 'Nouvelle partie'),
    ));
    return;
  }

  const entete = h('p', { class: 'tour-joueur' }, 'À ', h('b', {}, j.nom), ' de jouer');

  if (partie.phase === 'de' && complet) {
    tour.replaceChildren(entete,
      h('p', { class: 'message' }, `${j.nom} a tous ses camemberts ! Question finale : les autres joueurs choisissent la catégorie.`),
      h('div', { class: 'choix-cat' }, CATS.map(c =>
        h('button', { type: 'button', 'data-cat': c.id, style: styleCat(c), onclick: () => choisirCategorieFinale(c.id) }, c.nom))),
    );
    return;
  }

  if (partie.phase === 'de') {
    tour.replaceChildren(entete,
      h('div', { class: 'de' }, '?'),
      h('button', { type: 'button', class: 'btn', id: 'btn-de', onclick: lancerDe }, 'Lancer le dé'),
    );
    return;
  }

  // Phase question
  const q = QUESTIONS[partie.question];
  const cat = catParId(q.cat);
  const ligne = ligneQuestion(cat, [q.q, q.r, q.d], { cliquable: false, ouvert: partie.phase === 'reponse' });
  const carte = h('article', { class: 'carte' },
    h('div', { class: 'carte-tete' },
      h('span', {}, complet ? 'QUESTION FINALE' : (j.parts.includes(q.cat) ? 'QUESTION' : 'QUESTION CAMEMBERT')),
      h('span', { class: 'num' }, 'N° ' + numero(q.carte + 1))),
    ligne);

  if (partie.phase === 'question') {
    tour.replaceChildren(entete, carte,
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => { partie.phase = 'reponse'; sauverPartie(); rendrePartie(); },
      }, 'Voir la réponse'));
  } else {
    tour.replaceChildren(entete, carte,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-ko', onclick: () => repondre(false) }, 'Mauvaise réponse'),
        h('button', { type: 'button', class: 'btn btn-ok', onclick: () => repondre(true) }, 'Bonne réponse'),
      ));
  }
}

function nouvellePartie() {
  partie = null;
  effacer(CLE_PARTIE);
  afficherConfig();
}

function initPartie() {
  $('#ajout-joueur').addEventListener('click', () => {
    const liste = $('#liste-joueurs');
    if (liste.children.length >= 6) return;
    const champ = champJoueur('');
    liste.append(champ);
    $('input', champ).focus();
  });
  $('#form-partie').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const noms = [...form.querySelectorAll('input[name="joueur"]')]
      .map((i, k) => i.value.trim() || `Joueur ${k + 1}`);
    if (noms.length < 1) return;
    ecrire(CLE_JOUEURS, noms);
    partie = {
      joueurs: melanger(noms).map(nom => ({ nom, parts: [], bonnes: {} })),
      tour: 0,
      niveau: Number(form.niveau.value),
      requis: Number(form.requis.value),
      phase: 'de',
      utilisees: [],
      question: null,
      cat: null,
    };
    sauverPartie();
    rendrePartie();
  });
  $('#partie-abandon').addEventListener('click', () => {
    if (confirm('Terminer la partie en cours ?')) nouvellePartie();
  });
  partie = lire(CLE_PARTIE, null);
  if (partie && (partie.question != null && !QUESTIONS[partie.question])) partie = null;
}

/* ---------------- Solo ---------------- */

let solo = null;
const VIES = 3;
const LIBELLE_NIVEAU = ['toutes difficultés', 'faciles', 'faciles et moyennes', 'moyennes et difficiles'];

function sauverSolo() { ecrire(CLE_SOLO, solo); }

function cleRecord(s) { return `${s.format}|${s.cat || 'toutes'}|${s.niveau}`; }

function libelleConfig(s) {
  const format = s.format === 'survie' ? 'Survie' : `${s.format} questions`;
  const cat = s.cat ? catParId(s.cat).nom : 'toutes catégories';
  return `${format} · ${cat} · ${LIBELLE_NIVEAU[s.niveau]}`;
}

function tirerQuestionSolo() {
  const niveaux = NIVEAUX[solo.niveau] || NIVEAUX[0];
  const dansPartie = new Set(solo.historique.map(e => e.id));
  const convient = q => (!solo.cat || q.cat === solo.cat) && niveaux.includes(q.d) && !dansPartie.has(q.id);
  let vues = new Set(lire(CLE_SOLO_VUES, []));
  let pool = QUESTIONS.filter(q => convient(q) && !vues.has(q.id));
  if (!pool.length) {
    // Toutes les questions de ces réglages ont déjà été vues : on les remet en jeu.
    const aRetirer = new Set(QUESTIONS.filter(convient).map(q => q.id));
    vues = new Set([...vues].filter(id => !aRetirer.has(id)));
    pool = QUESTIONS.filter(convient);
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  vues.add(q.id);
  ecrire(CLE_SOLO_VUES, [...vues]);
  return q.id;
}

function soloTermine() {
  if (solo.format === 'survie') return solo.erreurs >= VIES;
  return solo.historique.length >= Number(solo.format);
}

function nouveauSolo(reglages) {
  solo = { ...reglages, historique: [], question: null, phase: 'question', score: 0, serie: 0, meilleureSerie: 0 };
  solo.question = tirerQuestionSolo();
  sauverSolo();
  rendreSolo();
}

function repondreSolo(bon) {
  const q = QUESTIONS[solo.question];
  let pts = 0;
  if (bon) {
    solo.serie++;
    solo.meilleureSerie = Math.max(solo.meilleureSerie, solo.serie);
    pts = q.d + (solo.serie >= 3 ? 1 : 0);
    solo.score += pts;
  } else {
    solo.serie = 0;
    solo.erreurs = (solo.erreurs || 0) + 1;
  }
  solo.historique.push({ id: q.id, ok: bon, pts });
  if (soloTermine()) {
    solo.phase = 'fin';
    const records = lire(CLE_SOLO_RECORDS, {});
    const cle = cleRecord(solo);
    solo.ancienRecord = records[cle] ? records[cle].score : null;
    if (solo.ancienRecord == null || solo.score > solo.ancienRecord) {
      records[cle] = { score: solo.score, date: new Date().toISOString().slice(0, 10) };
      ecrire(CLE_SOLO_RECORDS, records);
    }
  } else {
    solo.question = tirerQuestionSolo();
    solo.phase = 'question';
  }
  sauverSolo();
  rendreSolo();
}

function afficherConfigSolo() {
  $('#solo-config').hidden = false;
  $('#solo-jeu').hidden = true;
  const records = Object.entries(lire(CLE_SOLO_RECORDS, {}))
    .sort((a, b) => b[1].score - a[1].score).slice(0, 8);
  $('#solo-records').replaceChildren(...(records.length ? [
    h('h3', {}, 'Vos records'),
    h('ul', { class: 'records' }, records.map(([cle, r]) => {
      const [format, cat, niveau] = cle.split('|');
      return h('li', {},
        h('span', {}, libelleConfig({ format, cat: cat === 'toutes' ? '' : cat, niveau: Number(niveau) })),
        h('b', {}, `${r.score} pts`));
    })),
  ] : []));
}

function rendreSolo() {
  if (!solo) { afficherConfigSolo(); return; }
  $('#solo-config').hidden = true;
  const zone = $('#solo-jeu');
  zone.hidden = false;

  if (solo.phase === 'fin') { rendreFinSolo(zone); return; }

  const n = solo.historique.length + 1;
  const progression = solo.format === 'survie'
    ? h('span', { class: 'vies', 'aria-label': `${VIES - (solo.erreurs || 0)} vies restantes` },
      Array.from({ length: VIES }, (_, i) => h('i', { class: i < VIES - (solo.erreurs || 0) ? 'on' : null })))
    : h('span', {}, `Question ${n} / ${solo.format}`);
  const derniere = solo.historique[solo.historique.length - 1];

  const q = QUESTIONS[solo.question];
  const cat = catParId(q.cat);
  const carte = h('article', { class: 'carte' },
    h('div', { class: 'carte-tete' },
      h('span', {}, `${q.d} PT${q.d > 1 ? 'S' : ''}${solo.serie >= 2 ? ' + 1 BONUS' : ''}`),
      h('span', { class: 'num' }, 'N° ' + numero(q.carte + 1))),
    ligneQuestion(cat, [q.q, q.r, q.d], { cliquable: false, ouvert: solo.phase === 'reponse' }));

  const actions = solo.phase === 'question'
    ? h('button', { type: 'button', class: 'btn', onclick: () => { solo.phase = 'reponse'; sauverSolo(); rendreSolo(); } }, 'Voir la réponse')
    : h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-ko', onclick: () => repondreSolo(false) }, 'Raté'),
      h('button', { type: 'button', class: 'btn btn-ok', onclick: () => repondreSolo(true) }, 'Je l\'avais'));

  zone.replaceChildren(
    h('div', { class: 'solo-tete' },
      progression,
      h('span', { class: 'solo-score' }, h('b', {}, String(solo.score)), ' pts')),
    h('p', { class: 'solo-info' },
      derniere ? (derniere.ok ? `Bonne réponse : +${derniere.pts}` : 'Raté') : 'Répondez à voix haute, puis vérifiez.',
      solo.serie >= 2 ? ` · série de ${solo.serie}` : ''),
    carte,
    h('div', { class: 'tour' }, actions),
    h('div', { class: 'partie-actions' },
      h('button', {
        type: 'button', class: 'btn-lien',
        onclick: () => { if (confirm('Abandonner cette série ? Le score ne sera pas enregistré.')) { solo = null; effacer(CLE_SOLO); rendreSolo(); } },
      }, 'Abandonner')),
  );
}

function rendreFinSolo(zone) {
  const total = solo.historique.length;
  const bonnes = solo.historique.filter(e => e.ok).length;
  const record = solo.ancienRecord == null || solo.score > solo.ancienRecord;
  const parCat = CATS.map(c => {
    const e = solo.historique.filter(x => QUESTIONS[x.id].cat === c.id);
    return { c, total: e.length, ok: e.filter(x => x.ok).length };
  }).filter(x => x.total);
  const ratees = solo.historique.filter(e => !e.ok).map(e => QUESTIONS[e.id]);
  const reglages = { format: solo.format, cat: solo.cat, niveau: solo.niveau };

  zone.replaceChildren(
    h('div', { class: 'solo-fin' },
      h('p', { class: 'solo-config-rappel' }, libelleConfig(solo)),
      h('div', { class: 'solo-total' }, h('b', {}, String(solo.score)), ' points'),
      h('p', { class: 'solo-record' + (record ? ' nouveau' : '') },
        record
          ? (solo.ancienRecord == null ? 'Premier record établi !' : `Nouveau record ! (ancien : ${solo.ancienRecord})`)
          : `Record à battre : ${solo.ancienRecord}`),
      h('p', { class: 'message' }, `${bonnes} bonne${bonnes > 1 ? 's' : ''} réponse${bonnes > 1 ? 's' : ''} sur ${total} · meilleure série : ${solo.meilleureSerie}`),
      h('ul', { class: 'barres' }, parCat.map(({ c, total: t, ok }) =>
        h('li', { style: styleCat(c) },
          h('span', { class: 'barre-nom' }, c.nom),
          h('span', { class: 'barre-fond' }, h('span', { class: 'barre-val', style: `width:${Math.round(100 * ok / t)}%` })),
          h('span', { class: 'barre-chiffre' }, `${ok}/${t}`)))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-clair', onclick: () => { solo = null; effacer(CLE_SOLO); rendreSolo(); } }, 'Changer les réglages'),
        h('button', { type: 'button', class: 'btn', onclick: () => nouveauSolo(reglages) }, 'Rejouer')),
    ),
    ratees.length ? h('div', { class: 'ratees' },
      h('h3', {}, 'Les réponses que vous avez manquées'),
      h('ol', { class: 'resultats' }, ratees.map(q =>
        h('li', { style: styleCat(catParId(q.cat)) },
          h('div', {}, q.q),
          h('div', { class: 'r' }, q.r))))) : null,
  );
}

function initSolo() {
  $('#solo-cats').append(
    h('label', {}, h('input', { type: 'radio', name: 'cat', value: '', checked: true }), ' Toutes'),
    ...CATS.map(c => h('label', {}, h('input', { type: 'radio', name: 'cat', value: c.id }), ' ',
      h('span', { class: 'pastille', style: styleCat(c) }), ' ', c.nom)));
  $('#form-solo').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    nouveauSolo({ format: f.format.value, cat: f.cat.value, niveau: Number(f.niveau.value) });
  });
  solo = lire(CLE_SOLO, null);
  if (solo && (!Array.isArray(solo.historique) || (solo.question != null && !QUESTIONS[solo.question])
    || solo.historique.some(e => !QUESTIONS[e.id]))) solo = null;
}

/* ---------------- Parcourir ---------------- */

let resultats = [];
let affiches = 0;
const PAR_PAGE = 50;

const normaliser = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let INDEX_RECHERCHE = null;

function filtrer() {
  if (!INDEX_RECHERCHE) INDEX_RECHERCHE = QUESTIONS.map(q => normaliser(`${q.q} ${q.r} ${q.t}`));
  const texte = $('#recherche').value.trim();
  const cat = $('#filtre-cat').value;
  const niv = Number($('#filtre-niv').value) || 0;
  const num = /^\d{1,4}$/.test(texte) ? Number(texte) : null;
  const mots = num ? [] : normaliser(texte).split(/\s+/).filter(Boolean);
  resultats = QUESTIONS.filter(q =>
    (!cat || q.cat === cat) &&
    (!niv || q.d === niv) &&
    (num == null || q.carte + 1 === num) &&
    mots.every(m => INDEX_RECHERCHE[q.id].includes(m)));
  affiches = 0;
  $('#resultats').replaceChildren();
  afficherPlus();
}

function afficherPlus() {
  const lot = resultats.slice(affiches, affiches + PAR_PAGE);
  affiches += lot.length;
  $('#resultats').append(...lot.map(q => {
    const c = catParId(q.cat);
    return h('li', { style: styleCat(c) },
      h('div', { class: 'meta' }, `${c.nom} · carte ${numero(q.carte + 1)} · ${q.t}`, niveau(q.d)),
      h('div', {}, q.q),
      h('div', { class: 'r' }, q.r));
  }));
  $('#resultats-info').textContent = `${resultats.length} question${resultats.length > 1 ? 's' : ''}`;
  $('#plus-resultats').hidden = affiches >= resultats.length;
}

function initParcourir() {
  $('#filtre-cat').append(...CATS.map(c => h('option', { value: c.id }, c.nom)));
  let minuterie;
  $('#recherche').addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(filtrer, 150); });
  $('#filtre-cat').addEventListener('change', filtrer);
  $('#filtre-niv').addEventListener('change', filtrer);
  $('#plus-resultats').addEventListener('click', afficherPlus);
}

/* ---------------- Impression ---------------- */

function carteImprimee(index, verso) {
  if (index == null) return h('div', { class: 'pc vide' });
  const carte = DATA.cartes[index];
  return h('div', { class: 'pc' },
    h('div', { class: 'pc-tete' }, h('span', {}, verso ? 'RÉPONSES' : 'TRIVIAL 1000'), h('span', {}, 'N° ' + numero(index + 1))),
    h('div', { class: 'pc-lignes' }, CATS.map((c, i) =>
      h('div', { class: 'pc-l', style: `--c:${c.couleur}` }, h('i'), h('span', {}, verso ? carte[i][1] : carte[i][0])))));
}

function ajusterTexte(racine) {
  // Réduit la police des cartes dont le texte déborde.
  for (const lignes of racine.querySelectorAll('.pc-lignes')) {
    let taille = lignes.closest('.verso') ? 11 : 9;
    lignes.style.setProperty('--taille', taille + 'pt');
    while (lignes.scrollHeight > lignes.clientHeight + 1 && taille > 5.5) {
      taille -= 0.25;
      lignes.style.setProperty('--taille', taille + 'pt');
    }
  }
}

function imprimer(de, a) {
  const zone = $('#impression');
  const indices = [];
  for (let i = de; i <= a; i++) indices.push(i - 1);
  const planches = [];
  for (let p = 0; p < indices.length; p += 6) {
    const lot = indices.slice(p, p + 6);
    while (lot.length < 6) lot.push(null);
    planches.push(h('section', { class: 'planche recto' }, lot.map(i => carteImprimee(i, false))));
    // Verso : colonnes inversées pour un retournement bord long.
    const miroir = [];
    for (let r = 0; r < 3; r++) miroir.push(lot[r * 2 + 1], lot[r * 2]);
    planches.push(h('section', { class: 'planche verso' }, miroir.map(i => carteImprimee(i, true))));
  }
  zone.replaceChildren(...planches);
  ajusterTexte(zone);
  window.print();
}

function initImpression() {
  const total = DATA.cartes.length;
  $('#imp-de').max = total;
  $('#imp-a').max = total;
  $('#form-impression').addEventListener('submit', e => {
    e.preventDefault();
    let de = Math.max(1, Math.min(total, Number($('#imp-de').value) || 1));
    let a = Math.max(1, Math.min(total, Number($('#imp-a').value) || de));
    if (a < de) [de, a] = [a, de];
    imprimer(de, a);
  });
  window.addEventListener('afterprint', () => $('#impression').replaceChildren());
}

/* ---------------- Navigation ---------------- */

const VUES = ['accueil', 'carte', 'solo', 'partie', 'parcourir', 'imprimer'];

function naviguer() {
  const vue = VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'accueil';
  document.querySelectorAll('.vue').forEach(v => { v.hidden = v.dataset.vue !== vue; });
  document.querySelectorAll('.topnav a').forEach(a => a.classList.toggle('actif', a.getAttribute('href') === '#' + vue));
  if (vue === 'carte') afficherPioche();
  if (vue === 'solo') rendreSolo();
  if (vue === 'partie') rendrePartie();
  if (vue === 'parcourir' && !$('#resultats').children.length) filtrer();
  window.scrollTo(0, 0);
}

/* ---------------- Installation PWA ---------------- */

let invite = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  invite = e;
  $('#installer').hidden = false;
});
window.addEventListener('appinstalled', () => { $('#installer').hidden = true; });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------------- Démarrage ---------------- */

async function demarrer() {
  try {
    const rep = await fetch('cartes.json');
    if (!rep.ok) throw new Error(rep.status);
    DATA = await rep.json();
  } catch (err) {
    $('#chargement').textContent = 'Impossible de charger les cartes. Vérifiez votre connexion puis rechargez la page.';
    return;
  }
  CATS = DATA.categories;
  DATA.cartes.forEach(carte => carte.forEach(q => { q[0] = typo(q[0]); q[1] = typo(q[1]); }));
  QUESTIONS = [];
  DATA.cartes.forEach((carte, n) => carte.forEach(([q, r, d, t], i) => {
    QUESTIONS.push({ id: QUESTIONS.length, carte: n, cat: CATS[i].id, q, r, d, t });
  }));

  document.querySelectorAll('[data-stat="cartes"]').forEach(e => { e.textContent = DATA.cartes.length; });
  document.querySelectorAll('[data-stat="questions"]').forEach(e => { e.textContent = QUESTIONS.length; });
  $('#legende').replaceChildren(...CATS.map(c =>
    h('li', {}, h('span', { class: 'pastille', style: styleCat(c) }), c.nom)));

  $('#btn-installer').addEventListener('click', async () => {
    if (!invite) return;
    invite.prompt();
    await invite.userChoice;
    invite = null;
    $('#installer').hidden = true;
  });

  initPioche();
  initSolo();
  initPartie();
  initParcourir();
  initImpression();

  $('#chargement').remove();
  window.addEventListener('hashchange', naviguer);
  naviguer();
}

demarrer();
