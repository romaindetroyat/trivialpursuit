/* Trivial 1000 — application sans dépendance. */
'use strict';

const CLE_PIOCHE = 'trivial1000.pioche';
const CLE_PARTIE = 'trivial1000.partie';
const CLE_JOUEURS = 'trivial1000.joueurs';

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

function etatPioche() {
  let etat = lire(CLE_PIOCHE, null);
  if (!etat || !Array.isArray(etat.ordre) || etat.ordre.length !== DATA.cartes.length) {
    etat = { ordre: melanger([...DATA.cartes.keys()]), pos: 0 };
    ecrire(CLE_PIOCHE, etat);
  }
  return etat;
}

function afficherPioche(avancer = false) {
  let etat = etatPioche();
  if (avancer) etat.pos++;
  if (etat.pos >= etat.ordre.length) etat = { ordre: melanger([...DATA.cartes.keys()]), pos: 0 };
  ecrire(CLE_PIOCHE, etat);
  rendreCarte($('#pioche-carte'), etat.ordre[etat.pos]);
  $('#pioche-info').textContent = `Carte ${etat.pos + 1} sur ${etat.ordre.length} du paquet`;
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
    effacer(CLE_PIOCHE);
    afficherPioche();
  });
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

const VUES = ['accueil', 'carte', 'partie', 'parcourir', 'imprimer'];

function naviguer() {
  const vue = VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'accueil';
  document.querySelectorAll('.vue').forEach(v => { v.hidden = v.dataset.vue !== vue; });
  document.querySelectorAll('.topnav a').forEach(a => a.classList.toggle('actif', a.getAttribute('href') === '#' + vue));
  if (vue === 'carte') afficherPioche();
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
  initPartie();
  initParcourir();
  initImpression();

  $('#chargement').remove();
  window.addEventListener('hashchange', naviguer);
  naviguer();
}

demarrer();
