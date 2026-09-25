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

  // Ordinaux : « dix-neuvième » -> 19, « vingt et unième » -> 21, « troisième » -> 3.
  const ORDINAUX = {
    unieme: 1, deuxieme: 2, second: 2, seconde: 2, troisieme: 3, quatrieme: 4, cinquieme: 5,
    sixieme: 6, septieme: 7, huitieme: 8, neuvieme: 9, dixieme: 10, onzieme: 11, douzieme: 12,
    treizieme: 13, quatorzieme: 14, quinzieme: 15, seizieme: 16, vingtieme: 20, trentieme: 30,
    quarantieme: 40, cinquantieme: 50, soixantieme: 60, centieme: 100, millieme: 1000,
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
      if (!(mots[i] in NOMBRES)) {
        const o = ORDINAUX[mots[i]];
        // Ordinal isolé (« second », « troisième ») : chiffre seulement s'il n'est pas le premier mot.
        sortie.push(o && i > 0 && !['second', 'seconde'].includes(mots[i]) ? String(o) : mots[i]);
        i++;
        continue;
      }
      let j = i, total = 0, centaines = 0, sous = 0, nb = 0;
      while (j < mots.length) {
        const m = mots[j];
        if (m === 'et' && nb && (mots[j + 1] in NOMBRES || mots[j + 1] in ORDINAUX)) { j++; continue; }
        if (m in ORDINAUX && nb) {
          // Fin d'un ordinal composé : « dix-neuvième », « quatre-vingt-dixième ».
          const v = ORDINAUX[m];
          if (v === 100) { centaines += (sous || 1) * 100; sous = 0; } else sous += v;
          nb++; j++;
          break;
        }
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
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/(\d)[\s  .](?=\d{3}\b)/g, '$1') // 8 848 ou 8.848 -> 8848
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function jetons(texte) {
    // « XIXe siècle », « IIIe République » : ordinal romain, repéré en majuscules avant normalisation.
    // (« Le » et « Ce » ne sont pas des ordinaux : une seule lettre L ou C est exclue.)
    texte = String(texte).replace(/\b([IVXLC]{2,7}|[IVX])(e|er|re|ème|eme)\b/g,
      (tout, r) => romain(r.toLowerCase()) ? ' ' + romain(r.toLowerCase()) + ' ' : tout);
    const bruts = normaliser(texte).split(' ').filter(Boolean);
    const pleins = jetonsPleins(bruts);
    // Réponse faite uniquement de petits mots (« Où », « Le »…) : on garde tout.
    return pleins.length ? pleins : bruts;
  }

  const ROMAINS = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  function romain(m) {
    if (!/^[ivxlc]{1,7}$/.test(m)) return null;
    let total = 0;
    for (let i = 0; i < m.length; i++) {
      const v = ROMAINS[m[i]], suivant = ROMAINS[m[i + 1]] || 0;
      total += v < suivant ? -v : v;
    }
    return total > 0 && total < 100 ? String(total) : null;
  }

  function canonique(r) {
    const n = Number(romain(r));
    const table = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let reste = n, sortie = '';
    for (const [v, lettres] of table) while (reste >= v) { sortie += lettres; reste -= v; }
    return sortie === r;
  }

  // « Louis XIV », « Napoléon Ier », « Jean-Paul 2 » : numéros de souverains et de siècles en chiffres.
  function numeroter(mots) {
    return mots.map((m, i) => {
      // « 19e », « 1er » : ordinal en chiffres.
      const o = /^(\d+)(e|eme|er|re)$/.exec(m);
      if (o) return o[1];
      // « xviiie » tapé en minuscules : siècle ou numéro jusqu'à 30, sauf vrais mots (« vie »).
      const r = /^([ivxlc]{2,6})(e|eme)$/.exec(m);
      if (r && m !== 'vie' && romain(r[1]) && Number(romain(r[1])) <= 30 && canonique(r[1])) return romain(r[1]);
      // Numéro de souverain : seulement juste après un nom (« Henri IV », « Napoléon Ier »).
      const avant = mots[i - 1];
      if (!avant || MOTS_VIDES.has(avant) || /\d/.test(avant)) return m;
      if (/^(ier|iere|ire|er|1er|1re|premier|premiere)$/.test(m)) return '1';
      return romain(m) || m;
    });
  }

  function jetonsPleins(bruts) {
    return numeroter(chiffrer(bruts))
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
    const tolerance = attendu.length >= 9 ? 2 : attendu.length >= 5 ? 1 : 0;
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

  const EPITHETES = new Set(`grand grande bref pieux hardi bel magnifique conquerant sage jeune ancien
    catholique saint sainte gros chauve simple juste fort cruel terrible lion lionne debonnaire`.split(/\s+/));

  function estNomPropre(texte) {
    const mots = texte.replace(/^(l'|le |la |les )/i, '').split(/[\s-]+/).filter(Boolean);
    const pleins = mots.filter(m => !/^(de|du|des|d'|von|van|der|di|da|le|la)$/i.test(m));
    return pleins.length >= 2 && pleins.every(m => /^[A-ZÀ-ÖØ-Þ]/.test(m));
  }

  /**
   * Renvoie true si l'une des propositions (transcriptions ou saisie) correspond à la réponse.
   * options.question : énoncé ; les mots de la réponse qui y figurent déjà sont facultatifs
   *   (« indienne » suffit pour « La plaque indienne » quand on demande « Quelle plaque… »).
   * options.alias : autres réponses acceptées, préparées à l'avance.
   */
  function verifier(propositions, reponse, options = {}) {
    const vars = variantes(reponse);
    for (const a of options.alias || []) vars.push(...variantes(a));
    const dansQuestion = new Set(options.question ? jetons(options.question) : []);
    const dansReponse = new Set(vars.flatMap(v => v.jetons));
    for (const prop of [].concat(propositions)) {
      const dits = jetons(prop);
      if (!dits.length) continue;
      const colle = dits.join('');
      const trouve = a => dits.some(d => proche(d, a));
      for (const v of vars) {
        if (colle === v.jetons.join('')) return true;
        // Nom propre ou nombre : un mot en trop (autre prénom, autre nom) signale une autre réponse
        // (« Joseph Bonaparte » n'est pas « Pauline Bonaparte »).
        const nomOuNombre = estNomPropre(v.texte) || /^[A-ZÀ-ÖØ-Þ]/.test(v.texte.replace(/^(l'|le |la |les )/i, ''))
          || v.jetons.every(a => /\d/.test(a) || UNITES.has(a));
        if (nomOuNombre && dits.some(d => d.length >= 3 && !/^\d+$/.test(d) && !UNITES.has(d) && !MOTS_VIDES.has(d)
          && !dansQuestion.has(d) && !dansReponse.has(d) && !v.jetons.some(a => proche(d, a)))) continue;
        const trouves = v.jetons.filter(trouve).length;
        if (trouves === v.jetons.length) return true;
        const nomPropre = estNomPropre(v.texte);
        // Réponse longue : deux tiers des mots suffisent, sauf pour un nom de personne ou de lieu.
        if (!nomPropre && v.jetons.length >= 3 && trouves / v.jetons.length >= 2 / 3) return true;
        // Mots facultatifs : unités (« 21 » pour « 21 points »), années de précision
        // (« Montréal » pour « Montréal 1976 ») et mots déjà présents dans la question.
        const mots = v.jetons.filter(a => !/\d/.test(a) && !UNITES.has(a));
        const essentiels = v.jetons.filter(a => !UNITES.has(a)
          && !(/^\d{4}$/.test(a) && mots.length)
          && !dansQuestion.has(a));
        if (essentiels.length && essentiels.length < v.jetons.length && essentiels.every(trouve)) return true;
        // Personne ou lieu en plusieurs mots : le dernier nom suffit (« Hugo » pour « Victor Hugo »).
        if (nomPropre) {
          const dernier = v.jetons[v.jetons.length - 1];
          // Pas pour un surnom (« Pierre le Grand ») ni un nom déjà dans la question
          // (« Kubilai Khan » quand la question cite Gengis Khan).
          if (!EPITHETES.has(dernier) && !dansQuestion.has(dernier) && dernier.length >= 4 && dits.some(d => d === dernier || (dernier.length >= 6 && distance(d, dernier) <= 1))) return true;
        }
      }
    }
    return false;
  }

  const api = { verifier, normaliser, jetons, variantes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Reponse = api;
})(typeof window !== 'undefined' ? window : globalThis);
