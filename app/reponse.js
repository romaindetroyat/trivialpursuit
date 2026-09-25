/* Comparaison tolérante entre une réponse donnée (dite ou tapée) et la réponse attendue. */
'use strict';

(function (global) {
  // Mots ignorés : articles, et tournures fréquentes à l'oral (« c'est », « je pense que »…).
  const MOTS_VIDES = new Set(`le la les l un une des du de d au aux a en et ou
    c ce cest est sont s il elle ils elles on je j pense crois dirais que qu qui
    euh ben bah alors voila heu hum peut etre bien sur reponse ma mon cela ca`.split(/\s+/));

  const NOMBRES = {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20,
    trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mille: 1000,
    vingts: 20,
  };

  // Mots qui accompagnent un nombre sans changer la réponse (« 21 points », « 8 848 m »).
  const UNITES = new Set(`point m metre km kilometre cm mm kg g gramme tonne an annee jour heure
    minute seconde siecle joueur fois pourcent degre litre l tour set manche moi semaine km h
    habitant etoile coup case carte pied touche corde ans`.split(/\s+/));

  /** Remplace les suites de nombres en lettres par des chiffres : « vingt et un » -> « 21 ». */
  function chiffrer(mots) {
    const sortie = [];
    let i = 0;
    while (i < mots.length) {
      if (!(mots[i] in NOMBRES)) { sortie.push(mots[i++]); continue; }
      let j = i, total = 0, centaines = 0, sous = 0, nb = 0;
      while (j < mots.length) {
        const m = mots[j];
        if (m === 'et' && nb && mots[j + 1] in NOMBRES) { j++; continue; }
        if (!(m in NOMBRES)) break;
        const v = NOMBRES[m];
        if (v === 100) { centaines += (sous || 1) * 100; sous = 0; }
        else if (v === 1000) { total += ((centaines + sous) || 1) * 1000; centaines = 0; sous = 0; }
        else if (v === 20 && sous > 0 && sous < 10) sous *= 20; // quatre-vingt
        else sous += v;
        nb++; j++;
      }
      const courant = centaines + sous;
      // « un »/« une » isolés au milieu d'une phrase sont des articles.
      if (nb === 1 && (mots[i] === 'un' || mots[i] === 'une') && mots.length > 1) sortie.push(mots[i]);
      else sortie.push(String(total + courant));
      i = j;
    }
    return sortie;
  }

  function normaliser(texte) {
    return String(texte).toLowerCase()
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/(\d)[\s  .](?=\d{3}\b)/g, '$1') // 8 848 ou 8.848 -> 8848
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function jetons(texte) {
    const bruts = normaliser(texte).split(' ').filter(Boolean);
    const pleins = jetonsPleins(bruts);
    // Réponse faite uniquement de petits mots (« Où », « Le »…) : on garde tout.
    return pleins.length ? pleins : bruts;
  }

  function jetonsPleins(bruts) {
    return chiffrer(bruts)
      .filter(m => !MOTS_VIDES.has(m))
      .map(m => (m.length > 3 && /[sx]$/.test(m) && !/\d/.test(m)) ? m.slice(0, -1) : m);
  }

  function distance(a, b) {
    if (a === b) return 0;
    const ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let diag = ligne[0];
      ligne[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = ligne[j];
        ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return ligne[b.length];
  }

  function proche(mot, attendu) {
    if (mot === attendu) return true;
    if (/\d/.test(attendu) || /\d/.test(mot)) return false;
    const tolerance = attendu.length >= 8 ? 2 : attendu.length >= 5 ? 1 : 0;
    return tolerance > 0 && distance(mot, attendu) <= tolerance;
  }

  // Réponses acceptées : la réponse principale, et les variantes entre parenthèses ou après « ou ».
  function variantes(reponse) {
    const principale = reponse.replace(/\([^)]*\)/g, ' ').trim();
    const liste = [];
    principale.split(/\s+ou\s+|\s*\/\s*/).forEach(v => liste.push(v));
    const numeriquePrincipale = /^\s*[\d\s]+\s*$/.test(principale);
    for (const [, dedans] of reponse.matchAll(/\(([^)]*)\)/g)) {
      dedans.split(/\s*[,;]\s*|\s+ou\s+/).forEach(v => {
        v = v.replace(/^(ou|aussi|dit|dite|soit)\s+/i, '');
        // Une simple année entre parenthèses est une précision, pas une réponse alternative.
        if (/^\s*\d{3,4}\s*$/.test(v) && !numeriquePrincipale) return;
        liste.push(v);
      });
    }
    return liste.map(v => ({ texte: v, jetons: jetons(v) })).filter(v => v.jetons.length);
  }

  function estNomPropre(texte) {
    const mots = texte.replace(/^(l'|le |la |les )/i, '').split(/[\s-]+/).filter(Boolean);
    const pleins = mots.filter(m => !/^(de|du|des|d'|von|van|der|di|da|le|la)$/i.test(m));
    return pleins.length >= 2 && pleins.every(m => /^[A-ZÀ-ÖØ-Þ]/.test(m));
  }

  /** Renvoie true si l'une des propositions (transcriptions) correspond à la réponse attendue. */
  function verifier(propositions, reponse) {
    const vars = variantes(reponse);
    for (const prop of [].concat(propositions)) {
      const dits = jetons(prop);
      if (!dits.length) continue;
      const colle = dits.join('');
      for (const v of vars) {
        if (colle === v.jetons.join('')) return true;
        const trouves = v.jetons.filter(a => dits.some(d => proche(d, a))).length;
        if (trouves === v.jetons.length) return true;
        // Les unités et les années de précision sont facultatives (« 21 » pour « 21 points »,
        // « Montréal » pour « Montréal 1976 »).
        const mots = v.jetons.filter(a => !/\d/.test(a) && !UNITES.has(a));
        const essentiels = v.jetons.filter(a => !UNITES.has(a) && !(/^\d{4}$/.test(a) && mots.length));
        if (essentiels.length && essentiels.length < v.jetons.length
          && essentiels.every(a => dits.some(d => proche(d, a)))) return true;
        if (v.jetons.length >= 3 && trouves / v.jetons.length >= 2 / 3) return true;
        // Personne ou lieu en plusieurs mots : le dernier nom suffit (« Hugo » pour « Victor Hugo »).
        if (estNomPropre(v.texte)) {
          const dernier = v.jetons[v.jetons.length - 1];
          if (dernier.length >= 4 && dits.some(d => proche(d, dernier))) return true;
        }
      }
    }
    return false;
  }

  const api = { verifier, normaliser, jetons, variantes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Reponse = api;
})(typeof window !== 'undefined' ? window : globalThis);
