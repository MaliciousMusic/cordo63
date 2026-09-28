/* ==========================================================================
   Cordo 63 — l'enseigne-soulier, en tête de l'accueil (CO.Panneau)
   Un derby découpé dans la tôle, peint vert sauge comme la devanture, filet d'or, lettres
   dorées à la feuille (OUVERT · PAUSE · FERMÉ) ; dessous, pendue à deux anneaux, la plaquette
   de la petite ligne (« jusqu'à 19h », « réouvre à 14h30 », « réouvre mardi 10h »…).
   Il pend à deux chaînettes de laiton depuis le haut de l'écran (la vue commence déjà sous
   l'encoche : main est calé sur env(safe-area-inset-top)), reste en tête quand l'accueil
   défile et se balance : un pendule que poussent le défilement et les doigts (requestAnimationFrame
   tant qu'il bouge), et au repos un souffle à peine, avancé par CO.ambiance (seulement à l'écran).
   On le touche : derrière le soulier, trois volets repliés se déplient en accordéon (la semaine
   du lundi au dimanche, aujourd'hui surligné, la pause de midi ; l'adresse et le téléphone).
   On retouche, on touche ailleurs ou Échap : ils se replient. Le soir, une lampe col-de-cygne.
     const p = CO.Panneau.create(hote, { nuit })
     p.maj()  p.ouvrir()  p.fermer()  p.basculer()  p.nuit(bool)  p.secouer(force)
     p.masquer(bool)  p.detruire()  p.el
   Sans JS, l'hôte garde son contenu de repli (masqué ici, rendu par detruire()).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const DEG = 180 / Math.PI;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduit = () => !!CO.reduced;
  const son = (nom, o) => { try { if (CO.sfx) CO.sfx.play(nom, o); } catch (e) { /* muet */ } };
  const vibre = (ms) => { if (CO.vibrate) CO.vibrate(ms); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let instances = 0;

  /* ---------- le dessin : un derby de profil, la pointe à droite (repère 0..244 × 12..104) ---------- */
  const VB = [-8, 4, 260, 106]; // la boîte du bouton ; la lampe et les anneaux en débordent
  const FORME = 'M14 104L57 104Q59.6 104 59.6 101.4L60.6 94.6C74 95.6 96 97.6 118 97.6C130 97.6 136 101.2 148 101.2L206 101.2' +
    'C224 101.2 236 98.6 241.6 92.6C246.6 87 246.4 77.4 239.4 70.4C230.6 61.6 212.6 55 189 51.6C172 49.4 160 47.6 151 45.2' +
    'L120.2 25.6C119 18 114.2 12.6 106.6 12.6C99.6 12.6 95.2 16.6 93.6 23L92.6 28.6C82 36.6 66 42 55 40.6' +
    'C41 38.8 27 31 18 30C9.6 29.8 6 42 6 60C6 77 8.6 89 10.6 95L11.6 101Q12.1 104 14 104Z';
  const TRAIT_SEMELLE = 'M243.8 85.6C238 92.6 224 93.6 206 93.6L148 93.6C134 93.6 124.6 90.4 114 90C96 89.4 74 89.4 60 89.6L7.4 90.8';
  const SEMELLE = TRAIT_SEMELLE + 'L10.6 95L11.6 101Q12.1 104 14 104L57 104Q59.6 104 59.6 101.4L60.6 94.6C74 95.6 96 97.6 118 97.6' +
    'C130 97.6 136 101.2 148 101.2L206 101.2C224 101.2 236 98.6 241.6 92.6C243.2 90.8 243.9 88.4 243.8 85.6Z';
  const TALON = 'M7.6 91L61.2 90.2L60.6 94.6L59.6 101.4Q59.6 104 57 104L14 104Q12.1 104 11.6 101L10.6 95Z';
  const OEILLETS = [[101.6, 30.6], [112.7, 34.6], [123.8, 38.6], [134.9, 42.6], [146, 46.6]];
  const ANNEAUX = [[24, 36.4], [196, 61.2]]; // les trous des chaînettes (talon, bout) : ils encadrent le centre de gravité
  const ATTACHES = [[74, 99.6], [172, 101.8]]; // les anneaux de la plaquette, sous la semelle
  const MOT = { x: 116, y: 84, taille: 34, max: 150 }; // le grand mot : centre, ligne de base, corps, largeur utile

  /* ---------- les sons (synthétisés, ajoutés à la palette de l'atelier) ---------- */
  function sons() {
    if (!CO.sfx || !CO.sfx.ajouter || (CO.sfx.existe && CO.sfx.existe('pn-grince'))) return;
    // la charnière qui grince : une dent de scie très grave, irrégulière, dans trois résonances de tôle
    CO.sfx.ajouter('pn-grince', (c, o, t, opts) => {
      const d = opts.dur || 0.46, v = opts.v || 1;
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      const courbe = new Float32Array(14);
      for (let i = 0; i < courbe.length; i++) courbe[i] = 30 + 34 * Math.sin((i / 13) * Math.PI) + (Math.random() - 0.5) * 16;
      osc.frequency.setValueCurveAtTime(courbe, t, d);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.15 * v, t + 0.04);
      g.gain.setValueAtTime(0.13 * v, t + d * 0.7);
      g.gain.linearRampToValueAtTime(0, t + d);
      [[930, 9, 1], [1680, 12, 0.6], [2710, 15, 0.32]].forEach(([f, q, a]) => {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const ga = c.createGain();
        ga.gain.value = a;
        osc.connect(bp).connect(ga).connect(g);
      });
      g.connect(o);
      osc.start(t);
      osc.stop(t + d + 0.05);
    }, { gap: 160 });
    // les chaînettes qui tintent
    CO.sfx.ajouter('pn-chaine', (c, o, t, opts, O) => {
      const n = opts.n || 2, v = opts.v || 1;
      for (let k = 0; k < n; k++) {
        const tt = t + k * O.rnd(0.035, 0.075);
        O.strike(c, o, tt, O.rnd(3300, 4600), 'metal', { d: 0.05, v: 0.011 * v });
        O.noise(c, o, tt, { f: 6400, type: 'highpass', a: 0.001, d: 0.008, v: 0.006 * v });
      }
    }, { gap: 240 });
    // un volet qui tombe en place : le bois peint, la petite charnière
    CO.sfx.ajouter('pn-volet', (c, o, t, opts, O) => {
      const i = opts.i || 0;
      O.strike(c, o, t, 470 + i * 45, 'wood', { d: 0.07, v: 0.05 });
      O.strike(c, o, t + 0.004, 2900 + i * 150, 'metal', { d: 0.03, v: 0.008 });
      O.noise(c, o, t, { f: 1900, q: 1, a: 0.001, d: 0.02, v: 0.02 });
    }, { gap: 60 });
    // on replie : un souffle qui remonte, puis le claquement des volets contre la tôle
    CO.sfx.ajouter('pn-plier', (c, o, t, opts, O) => {
      O.noise(c, o, t, { f: 1500, f2: 520, q: 0.9, a: 0.02, d: 0.16, v: 0.045 });
      O.strike(c, o, t + 0.2, 380, 'wood', { d: 0.06, v: 0.06 });
      O.strike(c, o, t + 0.205, 2500, 'metal', { d: 0.04, v: 0.01 });
    }, { gap: 200 });
  }

  /* ---------- le dessin SVG (identifiants propres à l'instance) ---------- */
  function svgSoulier(u) {
    const oeillets = OEILLETS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="#1A2317" stroke="url(#${u}o)" stroke-width="1.25"/>`).join('');
    const lacets = OEILLETS.map(([x, y]) => `M${x - 0.6} ${y - 1.6}l-6.2 -6.6`).join('');
    const anneaux = ANNEAUX.map(([x, y]) =>
      `<circle cx="${x}" cy="${y}" r="2.1" fill="#141B10"/>` +
      `<circle cx="${x}" cy="${y - 4}" r="4.3" fill="none" stroke="#3A2A0E" stroke-width="2.3" opacity=".5" transform="translate(.5 .8)"/>` +
      `<circle cx="${x}" cy="${y - 4}" r="4.3" fill="none" stroke="url(#${u}l)" stroke-width="1.8"/>`).join('');
    const attaches = ATTACHES.map(([x, y]) =>
      `<ellipse cx="${x}" cy="${y + 3.2}" rx="2.3" ry="3.4" fill="none" stroke="url(#${u}l)" stroke-width="1.5"/>`).join('');
    return `<svg class="pn-soulier" viewBox="${VB.join(' ')}" aria-hidden="true" focusable="false">
<defs>
  <path id="${u}f" d="${FORME}"/>
  <clipPath id="${u}c"><use href="#${u}f"/></clipPath>
  <linearGradient id="${u}p" gradientUnits="userSpaceOnUse" x1="30" y1="8" x2="190" y2="118">
    <stop offset="0" stop-color="#94AD8C"/><stop offset=".45" stop-color="#6F886B"/><stop offset="1" stop-color="#4B624B"/>
  </linearGradient>
  <linearGradient id="${u}o" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="106">
    <stop offset="0" stop-color="#FFF1C2"/><stop offset=".2" stop-color="#EAC873"/><stop offset=".48" stop-color="#B0822F"/>
    <stop offset=".72" stop-color="#E4BE63"/><stop offset="1" stop-color="#7A561B"/>
  </linearGradient>
  <linearGradient id="${u}l" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FBE7A6"/><stop offset=".45" stop-color="#C79B45"/><stop offset="1" stop-color="#6E4E17"/>
  </linearGradient>
  <linearGradient id="${u}d" gradientUnits="userSpaceOnUse" x1="0" y1="${MOT.y - MOT.taille * 0.82}" x2="0" y2="${MOT.y + 1}">
    <stop offset="0" stop-color="#FFF7D6"/><stop offset=".3" stop-color="#F3D388"/><stop offset=".5" stop-color="#CC9D44"/>
    <stop offset=".54" stop-color="#A8792A"/><stop offset=".8" stop-color="#E8C46A"/><stop offset="1" stop-color="#946A22"/>
  </linearGradient>
  <linearGradient id="${u}r" gradientUnits="userSpaceOnUse" x1="0" y1="${MOT.y - MOT.taille * 0.82}" x2="0" y2="${MOT.y + 1}">
    <stop offset="0" stop-color="#F7806F"/><stop offset=".45" stop-color="#D6382B"/><stop offset=".55" stop-color="#B92A1F"/><stop offset="1" stop-color="#8E1D15"/>
  </linearGradient>
  <linearGradient id="${u}k" gradientUnits="userSpaceOnUse" x1="0" y1="${MOT.y - MOT.taille * 0.82}" x2="0" y2="${MOT.y + 1}">
    <stop offset="0" stop-color="#FFFBF1"/><stop offset=".5" stop-color="#F4E6C8"/><stop offset="1" stop-color="#D9C39A"/>
  </linearGradient>
  <radialGradient id="${u}n" gradientUnits="userSpaceOnUse" cx="${MOT.x + 6}" cy="${MOT.y - 20}" r="150">
    <stop offset="0" stop-color="#FFC878" stop-opacity=".2"/><stop offset=".32" stop-color="#3A3040" stop-opacity=".08"/>
    <stop offset=".7" stop-color="#0E1122" stop-opacity=".5"/><stop offset="1" stop-color="#070914" stop-opacity=".66"/>
  </radialGradient>
  <radialGradient id="${u}h"><stop offset="0" stop-color="#FFE3A6" stop-opacity=".95"/><stop offset=".3" stop-color="#FFC86E" stop-opacity=".42"/><stop offset="1" stop-color="#FFB050" stop-opacity="0"/></radialGradient>
  <linearGradient id="${u}v" gradientUnits="userSpaceOnUse" x1="132" y1="4" x2="118" y2="74">
    <stop offset="0" stop-color="#FFD58C" stop-opacity=".34"/><stop offset="1" stop-color="#FFD58C" stop-opacity="0"/>
  </linearGradient>
  <filter id="${u}g" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="3" seed="4"/>
    <feColorMatrix values="0 0 0 0 .08  0 0 0 0 .12  0 0 0 0 .07  1.9 0 0 0 -.92"/>
  </filter>
  <filter id="${u}b" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency=".007 .34" numOctaves="3" seed="12"/>
    <feColorMatrix values="0 0 0 0 1  0 0 0 0 .98  0 0 0 0 .9  1.5 0 0 0 -.64"/>
  </filter>
  <filter id="${u}s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter>
  <filter id="${u}e" x="-6%" y="-14%" width="112%" height="128%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="b"/>
    <feSpecularLighting in="b" surfaceScale="2.4" specularConstant=".95" specularExponent="18" lighting-color="#FFF4D2" result="s">
      <feDistantLight azimuth="235" elevation="42"/>
    </feSpecularLighting>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k1="0" k2="1" k3=".7" k4="0"/>
  </filter>
</defs>
<use href="#${u}f" fill="#1F2A1B" transform="translate(1.5 2.6)"/>
<use href="#${u}f" fill="none" stroke="#6E7E5C" stroke-width=".6" stroke-opacity=".5" transform="translate(1.5 2.6)"/>
<use href="#${u}f" fill="url(#${u}p)"/>
<g clip-path="url(#${u}c)">
  <path d="${SEMELLE}" fill="#2A3526"/>
  <path d="${TALON}" fill="#324030"/>
  <path d="M10.9 96.6H60.2M11.3 100.3H59.8" stroke="#1A2217" stroke-width=".7" fill="none"/>
  <path d="M10.9 97.3H60.1" stroke="#50624A" stroke-width=".45" fill="none" opacity=".6"/>
  <rect x="-8" y="4" width="260" height="106" fill="#000" filter="url(#${u}b)" opacity=".2"/>
  <rect x="-8" y="4" width="260" height="106" fill="#000" filter="url(#${u}g)" opacity=".34"/>
  <use href="#${u}f" fill="none" stroke="#162114" stroke-width="12" stroke-opacity=".42" filter="url(#${u}s)"/>
  <use href="#${u}f" fill="none" stroke="#1B2618" stroke-width="7.8" stroke-opacity=".6"/>
  <use href="#${u}f" fill="none" stroke="url(#${u}o)" stroke-width="5.2"/>
  <use href="#${u}f" fill="none" stroke="#FFF6D8" stroke-width="1.1" stroke-opacity=".6" transform="translate(.45 .55)"/>
  <use href="#${u}f" fill="none" stroke="#1B2618" stroke-width="1.2" stroke-opacity=".45" transform="translate(-.5 -.6)"/>
  <g fill="none" stroke="url(#${u}o)" stroke-width="1.15" stroke-linecap="round">
    <path d="${TRAIT_SEMELLE}"/>
    <path d="M19 33.6C28 34.6 42 42.2 55 43.8C67 45.2 81 39.6 90.8 32"/>
    <path d="M26 31.4C31 44 32 68 27.6 90.4"/>
    <path d="M94 33.4C110 36 132 44 150.4 51.6"/>
    <path d="M212.5 58.6C203.5 67.6 202 81.6 209.5 93.4"/>
  </g>
  <g fill="none" stroke="#F3E3BC" stroke-width=".75" stroke-dasharray="2.1 1.7" opacity=".7">
    <path d="${TRAIT_SEMELLE}" transform="translate(0 -2.5)"/>
    <path d="M29.8 32.4C34.8 45 35.8 68 31.4 90"/>
    <path d="M93.4 37C109.6 39.6 131.4 47.6 148.6 55"/>
  </g>
  <path d="M208.4 59.9C199.6 68.9 198 81.9 205.4 93.2" fill="none" stroke="#E8C779" stroke-width="1.5" stroke-linecap="round" stroke-dasharray=".01 3.3"/>
  <path d="${lacets}" fill="none" stroke="#F3E3BC" stroke-width="1.6" stroke-linecap="round"/>
  ${oeillets}
</g>
<g class="pn-mot">
  <text class="pn-mot-ombre" x="${MOT.x + 1.3}" y="${MOT.y + 1.9}" text-anchor="middle" fill="#121A10" fill-opacity=".62">OUVERT</text>
  <text class="pn-mot-face" x="${MOT.x}" y="${MOT.y}" text-anchor="middle" fill="url(#${u}d)" stroke="#1C2819" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke" filter="url(#${u}e)">OUVERT</text>
</g>
<g class="pn-lampe">
  <path d="M105.8 13C104 3 108 -6 118 -9.6C125 -12 131 -9.6 133.6 -5" fill="none" stroke="#1D1A15" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M105.8 13C104 3 108 -6 118 -9.6C125 -12 131 -9.6 133.6 -5" fill="none" stroke="url(#${u}l)" stroke-width="1" stroke-linecap="round" opacity=".8"/>
  <path class="pn-cone" d="M127 1L112 76H160L140 1Z" fill="url(#${u}v)"/>
  <path d="M126.4 -6.4L140.8 -6.4L144.6 2.2L122.6 2.2Z" fill="#26332A" stroke="url(#${u}l)" stroke-width=".7" stroke-linejoin="round"/>
  <circle class="pn-halo" cx="133.6" cy="3.2" r="15" fill="url(#${u}h)"/>
  <ellipse class="pn-ampoule" cx="133.6" cy="2.9" rx="4.6" ry="1.7" fill="#FFF0C8"/>
</g>
<rect class="pn-voile" x="-8" y="4" width="260" height="106" fill="url(#${u}n)" clip-path="url(#${u}c)"/>
<g class="pn-anneaux">${anneaux}${attaches}</g>
</svg>`;
  }

  /* la silhouette seule (l'ombre portée sur le mur) */
  function svgOmbre() {
    return `<svg viewBox="${VB.join(' ')}" aria-hidden="true" focusable="false"><path d="${FORME}" fill="#0E0B08"/></svg>`;
  }

  /* ---------- l'état du moment : le grand mot, la petite ligne ---------- */
  function lireStatut() {
    const st = CO.statut ? CO.statut() : { ouvert: false, texte: 'Fermé', court: 'Fermé' };
    const h = (m) => (CO.fmtH ? CO.fmtH(m) : Math.floor(m / 60) + 'h');
    let etat, mot, ligne;
    if (st.ouvert) {
      etat = 'ouvert'; mot = 'OUVERT';
      ligne = st.jusqua != null ? (st.bientot ? 'ferme à ' : 'jusqu’à ') + h(st.jusqua) : 'entrez !';
    } else if (st.pause) {
      etat = 'pause'; mot = 'PAUSE';
      ligne = 'réouvre à ' + h(st.prochain.heure);
    } else {
      etat = 'ferme'; mot = 'FERMÉ';
      const p = st.prochain;
      if (!p) ligne = 'à très bientôt';
      else if (p.dansJours === 0) ligne = 'ouvre à ' + h(p.heure);
      else if (p.dansJours === 1) ligne = 'réouvre demain ' + h(p.heure);
      else ligne = 'réouvre ' + (CO.JOURS ? CO.JOURS[p.jour] : '') + ' ' + h(p.heure);
    }
    return { st, etat, mot, ligne, texte: st.texte || mot };
  }

  /* le soir : l'heure de Paris et le coucher du soleil (même règle que l'appli : ?soir, ?jour) */
  function estNuit() {
    if (typeof CO.estNuit === 'function') { try { return !!CO.estNuit(); } catch (e) { /* suite */ } }
    const q = new URLSearchParams(location.search);
    if (q.has('soir')) return true;
    if (q.has('jour')) return false;
    const now = CO.parisNow ? CO.parisNow() : new Date();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const coucher = 19.1 + 2.2 * Math.sin(((doy - 80) / 365) * TAU);
    const lever = 7.4 - 1.9 * Math.sin(((doy - 80) / 365) * TAU);
    const hh = now.getHours() + now.getMinutes() / 60;
    return hh >= coucher || hh < lever;
  }

  /* ---------- la semaine (du lundi au dimanche de la semaine en cours, congés compris) ---------- */
  const JCOURT = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
  function semaine() {
    const now = CO.parisNow ? CO.parisNow() : new Date();
    const decal = (now.getDay() + 6) % 7;
    const lundi = new Date(now.getFullYear(), now.getMonth(), now.getDate() - decal);
    const jours = [];
    for (let k = 0; k < 7; k++) {
      const d = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + k);
      const plages = CO.plagesDu ? CO.plagesDu(d) : (CO.HOURS && CO.HOURS.semaine[d.getDay()]) || null;
      jours.push({ d, j: d.getDay(), plages, auj: k === decal });
    }
    return jours;
  }
  const plage = (p) => (CO.fmtH ? CO.fmtH(p[0]) + '–' + CO.fmtH(p[1]) : '');
  function feuilleHoraires(jours) {
    const lignes = jours.map((x) => {
      const nom = CO.JOURS ? CO.JOURS[x.j] : '';
      const cls = [x.auj ? 'auj' : '', x.plages ? '' : 'ferme'].filter(Boolean).join(' ');
      let cases;
      if (!x.plages) cases = '<td colspan="2" class="pn-ferme">fermé</td>';
      else if (x.plages.length === 1) cases = `<td colspan="2">${plage(x.plages[0])}</td>`;
      else cases = `<td>${plage(x.plages[0])}</td><td>${x.plages.slice(1).map(plage).join(' · ')}</td>`;
      return `<tr${cls ? ` class="${cls}"` : ''}><th scope="row"><i class="pn-pastille" aria-hidden="true"></i><span aria-hidden="true">${JCOURT[x.j]}</span><span class="pn-lib">${nom}${x.auj ? ' (aujourd’hui)' : ''}</span></th>${cases}</tr>`;
    }).join('');
    // la pause de midi, lue dans les horaires (le premier jour à deux plages)
    const deux = jours.find((x) => x.plages && x.plages.length > 1);
    const note = deux ? `pause déjeuner ${CO.fmtH(deux.plages[0][1])}–${CO.fmtH(deux.plages[1][0])}` : 'du mardi au samedi';
    return `<table class="pn-table"><caption class="pn-lib">Horaires de la semaine</caption><tbody>${lignes}</tbody></table><p class="pn-note">${esc(note)}</p>`;
  }

  /* ======================================================================
     create
     ====================================================================== */
  function create(host, opts = {}) {
    if (!host) return null;
    sons();
    let detruit = false;
    const u = 'pn' + (++instances) + '-';
    const S = CO.SHOP || {};
    const repli = [...host.children];
    repli.forEach((c) => { c.hidden = true; });

    const root = document.createElement('div');
    root.className = 'pn';
    root.innerHTML =
      `<div class="pn-balancier">
        <div class="pn-ombre" aria-hidden="true">${svgOmbre()}</div>
        <i class="pn-chaine" aria-hidden="true"></i><i class="pn-chaine" aria-hidden="true"></i>
        <div class="pn-corps">
          <div class="pn-3d">
            <button class="pn-bouton" type="button" aria-expanded="false" aria-controls="${u}volets" data-sfx="none">
              ${svgSoulier(u)}
              <span class="pn-plaque" aria-hidden="true"><span class="pn-ligne"></span><svg class="pn-chevron" viewBox="0 0 12 8"><path d="M1.6 1.6 6 6.1l4.4-4.5"/></svg></span>
              <span class="pn-lib pn-nom"></span>
            </button>
            <div class="pn-volets" id="${u}volets" role="region" aria-label="Horaires, adresse et téléphone">
              <div class="pn-volet pn-v1"><div class="pn-face"><div class="pn-feuille"></div><i class="pn-voile-f" aria-hidden="true"></i></div><div class="pn-dos" aria-hidden="true"><i class="pn-voile-f"></i></div></div>
              <div class="pn-volet pn-v2" aria-hidden="true"><div class="pn-face"><div class="pn-feuille pn-suite"></div><i class="pn-voile-f"></i></div><div class="pn-dos"><i class="pn-voile-f"></i></div></div>
              <div class="pn-volet pn-v3"><div class="pn-face"><i class="pn-voile-f" aria-hidden="true"></i>
                <p class="pn-adresse"><strong>${esc(S.adresse || '6 rue Verdier-Latour')}</strong><br>place du Mazet<br>${esc((S.cp || '63000') + ' ' + (S.ville || 'Clermont-Ferrand'))}</p>
                <a class="pn-tel" href="tel:${esc(S.telIntl || '+33473246690')}" data-sfx="none"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5h2.8l1.4 4.2-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4.2 1.4v2.8a2 2 0 0 1-2.1 2A16 16 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"/></svg><span><span class="pn-lib">Appeler le </span>${esc(S.tel || '04 73 24 66 90')}</span></a>
              </div><div class="pn-dos" aria-hidden="true"><i class="pn-voile-f"></i></div></div>
            </div>
          </div>
        </div>
      </div>`;
    host.appendChild(root);

    const $ = (s) => root.querySelector(s);
    const balancier = $('.pn-balancier'), corps = $('.pn-corps'), ombre = $('.pn-ombre');
    const bouton = $('.pn-bouton'), ligneEl = $('.pn-ligne'), nomEl = $('.pn-nom');
    const zone = $('.pn-volets');
    const textes = [...root.querySelectorAll('.pn-mot text')];
    const face = $('.pn-mot-face');
    const feuille = $('.pn-v1 .pn-feuille'), suite = $('.pn-v2 .pn-feuille');
    const chaines = [...root.querySelectorAll('.pn-chaine')].map((el, i) => ({ el, i, ax: 0, ay: 0, hx: 0, hy: 0 }));
    const volets = [...root.querySelectorAll('.pn-volet')].map((el, i) => ({
      el, i, h: 0, p: 0, v: 0, cible: 0, depart: 0, rebond: null,
      voiles: [el.querySelector('.pn-face > .pn-voile-f'), el.querySelector('.pn-dos > .pn-voile-f')], ombre: [-1, -1],
      faces: [el.querySelector('.pn-face'), el.querySelector('.pn-dos')], vu: -1,
    }));
    const v2 = volets[1].el;
    if ('inert' in v2) v2.inert = true;
    if ('inert' in zone) zone.inert = true;

    /* ---------- tailles (le soulier suit la largeur de la vue) ---------- */
    const G = { l: 186, s: 1, ox: 93, oy: 0, haut: 12, lv: 80 };
    function mesurer() {
      const W = host.getBoundingClientRect().width || document.documentElement.clientWidth || 320;
      const l = Math.round(clamp(W * 0.58, 180, 236));
      root.style.setProperty('--pn-l', l + 'px');
      G.l = l;
      G.s = l / VB[2];
      G.haut = parseFloat(getComputedStyle(root).getPropertyValue('--pn-haut')) || 12;
      G.lv = l * 0.42;
      // le pivot : entre les deux anneaux, en haut du soulier
      G.ox = l / 2;
      G.oy = G.haut + (30 - VB[1]) * G.s;
      chaines.forEach((c, i) => {
        const [x, y] = ANNEAUX[i];
        c.ax = (x - VB[0]) * G.s;
        c.ay = G.haut + (y - 4 - 4.3 - VB[1]) * G.s; // le haut de l'anneau
        c.hx = c.ax + (i ? 6 : -6); // les crochets, au-dessus de l'écran, un peu écartés
        c.hy = -120;
      });
      volets.forEach((f) => { f.h = f.el.offsetHeight; });
      ajusterLigne();
      appliquerCorps();
      appliquerVolets(T);
    }

    /* ---------- le statut ---------- */
    let dernier = null;
    function maj() {
      if (detruit) return;
      const s = lireStatut();
      const cle = s.etat + '|' + s.mot + '|' + s.ligne;
      if (cle !== dernier) {
        dernier = cle;
        root.dataset.etat = s.etat;
        textes.forEach((t) => { t.textContent = s.mot; });
        face.setAttribute('fill', `url(#${u}${s.etat === 'ouvert' ? 'd' : s.etat === 'ferme' ? 'r' : 'k'})`);
        ligneEl.textContent = s.ligne;
        nomEl.textContent = s.texte + '. Horaires de la semaine, adresse et téléphone.';
        ajusterMot();
        ajusterLigne();
      }
      const auj = (CO.parisNow ? CO.parisNow() : new Date()).toDateString();
      if (auj !== majJour) {
        majJour = auj;
        const html = feuilleHoraires(semaine());
        feuille.innerHTML = html;
        suite.innerHTML = html;
        suite.querySelectorAll('.pn-lib').forEach((e) => e.remove());
      }
      nuit(opts.nuit != null ? !!opts.nuit : estNuit());
    }
    let majJour = null;
    // le grand mot tient dans le soulier (serré s'il le faut, une fois la police chargée)
    function ajusterMot() {
      textes.forEach((t) => { t.removeAttribute('textLength'); t.removeAttribute('lengthAdjust'); });
      let lg = 0;
      try { lg = face.getComputedTextLength(); } catch (e) { return; }
      if (lg > MOT.max) textes.forEach((t) => { t.setAttribute('textLength', MOT.max); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); });
    }

    // la petite ligne tient sur la plaquette (« réouvre mercredi 10h » après un jour de congé) : le corps se serre
    function ajusterLigne() {
      const pl = ligneEl.parentNode, chev = pl.querySelector('.pn-chevron');
      pl.style.fontSize = '';
      const cs = getComputedStyle(pl);
      const libre = pl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (chev ? chev.getBoundingClientRect().width : 0) - (parseFloat(cs.columnGap) || 0) - 4;
      const lg = ligneEl.getBoundingClientRect().width;
      if (libre > 0 && lg > libre) pl.style.fontSize = (parseFloat(cs.fontSize) * Math.max(0.7, libre / lg)).toFixed(2) + 'px';
    }

    let estNuitEtat = null;
    function nuit(v) {
      v = !!v;
      if (v === estNuitEtat) return;
      estNuitEtat = v;
      root.classList.toggle('pn-soir', v);
    }

    /* ======================================================================
       Le balancier : un pendule (les chaînettes), un roulis (le soulier sur ses anneaux),
       un rebond (les maillons qui s'étirent). Pas d'animation quand il est au repos.
       ====================================================================== */
    const WF = TAU * 0.7, WT = TAU * 1.22, WY = TAU * 2.3;
    const P = { phi: 0, w: 0, psi: 0, wt: 0, y: 0, vy: 0, actif: false };
    function pousser(dpsi, dphi, dvy) {
      if (reduit() || detruit) return;
      P.wt = clamp(P.wt + dpsi, -2.2, 2.2);
      P.w = clamp(P.w + dphi, -1.2, 1.2);
      P.vy = clamp(P.vy + dvy, -160, 160);
      P.actif = true;
      demarrer();
    }
    function pasPhysique(dt) {
      if (!P.actif) return false;
      const ouvert = cibleOuvert;
      const zf = ouvert ? 0.34 : 0.1, zt = ouvert ? 0.5 : 0.15, zy = 0.32;
      const n = 3, h = dt / n;
      for (let k = 0; k < n; k++) {
        P.w += (-WF * WF * Math.sin(P.phi) - 2 * zf * WF * P.w) * h; P.phi += P.w * h;
        P.wt += (-WT * WT * P.psi - 2 * zt * WT * P.wt) * h; P.psi += P.wt * h;
        P.vy += (-WY * WY * P.y - 2 * zy * WY * P.vy) * h; P.y += P.vy * h;
      }
      P.psi = clamp(P.psi, -0.14, 0.14);
      P.phi = clamp(P.phi, -0.2, 0.2);
      P.y = clamp(P.y, -9, 9);
      // les chaînettes tintent quand ça bouge fort
      if (Math.abs(P.wt) > 1.1 || Math.abs(P.w) > 0.55) son('pn-chaine', { n: 2, v: Math.min(1, Math.abs(P.wt)) });
      // au repos dès que plus rien ne se voit (moins de 0,15 px, moins de 0,05°) : la boucle s'arrête
      const ampF = G.lv * Math.hypot(P.phi, P.w / WF), ampT = Math.hypot(P.psi, P.wt / WT), ampY = Math.hypot(P.y, P.vy / WY);
      if (ampF < 0.15 && ampT < 0.0009 && ampY < 0.15) {
        P.phi = P.w = P.psi = P.wt = P.y = P.vy = 0;
        P.actif = false;
        appliquerCorps();
        return false;
      }
      appliquerCorps();
      return true;
    }
    function appliquerCorps() {
      const dx = G.lv * Math.sin(P.phi), dy = G.lv * (1 - Math.cos(P.phi)) + P.y;
      const rot = P.psi + P.phi * 0.35;
      corps.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0) rotate(${(rot * DEG).toFixed(3)}deg)`;
      ombre.style.transform = `translate3d(${(dx * 1.08).toFixed(2)}px,${(dy + 0.5 * dx * dx / G.lv).toFixed(2)}px,0) rotate(${(rot * DEG).toFixed(3)}deg)`;
      const c = Math.cos(rot), s = Math.sin(rot);
      chaines.forEach((ch) => {
        const rx = ch.ax - G.ox, ry = ch.ay - G.oy;
        const x = G.ox + rx * c - ry * s + dx, y = G.oy + rx * s + ry * c + dy;
        const a = Math.atan2(ch.hx - x, y - ch.hy);
        ch.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${(a * DEG).toFixed(3)}deg)`;
      });
    }

    /* ======================================================================
       Les volets : l'accordéon. Chacun tourne autour de sa charnière (rotateX), le suivant
       accroché au bord du précédent ; replié, tout est rangé derrière le soulier (-180°).
       Ils tombent (la pesanteur), passent un peu la verticale, se posent ; on les relève dans
       l'ordre inverse.
       ====================================================================== */
    let cibleOuvert = false;
    const G_TOMBE = 25, G_LEVE = 38, AMORTI = 36;
    function lancerVolets(ouvrir, instantane) {
      const now = T;
      cibleOuvert = ouvrir;
      root.classList.toggle('est-ouvert', ouvrir);
      bouton.setAttribute('aria-expanded', String(ouvrir));
      if ('inert' in zone) zone.inert = !ouvrir;
      if (instantane || reduit()) {
        volets.forEach((f) => { f.p = ouvrir ? 1 : 0; f.v = 0; f.rebond = null; f.cible = ouvrir ? 1 : 0; });
        root.classList.toggle('pn-deplie', ouvrir);
        appliquerVolets(now);
        return;
      }
      root.classList.add('pn-deplie');
      volets.forEach((f, i) => {
        f.cible = ouvrir ? 1 : 0;
        f.depart = now + (ouvrir ? i * 175 : (volets.length - 1 - i) * 105);
        if (!ouvrir) f.rebond = null;
      });
      demarrer();
    }
    function angle(f, now) {
      let a = -180 * (1 - f.p);
      if (f.rebond) {
        const t = (now - f.rebond.t) / 1000;
        a += f.rebond.v * 180 * t * Math.exp(-AMORTI * t);
      }
      return a;
    }
    function pasVolets(now, dt) {
      let actif = false;
      volets.forEach((f) => {
        if (f.cible === 1) {
          if (f.p < 1) {
            actif = true;
            if (now < f.depart) return;
            f.v += G_TOMBE * dt;
            f.p += f.v * dt;
            if (f.p >= 1) {
              f.rebond = { t: now, v: Math.min(f.v, 7.5) };
              f.p = 1; f.v = 0;
              son('pn-volet', { i: f.i });
              if (f.i === volets.length - 1) vibre(6);
              pousser(0, 0, 18 + f.i * 6);
            }
          } else if (f.rebond) {
            if (now - f.rebond.t > 360) f.rebond = null;
            else actif = true;
          }
        } else if (f.p > 0 || f.v) {
          actif = true;
          if (now < f.depart) return;
          f.v = Math.min(f.v, 0) - G_LEVE * dt;
          f.p += f.v * dt;
          if (f.p <= 0) {
            f.p = 0; f.v = 0;
            if (f.i === 0) { son('pn-plier'); pousser(-0.25, 0, -14); }
          }
        }
      });
      appliquerVolets(now);
      if (!actif && !cibleOuvert) root.classList.remove('pn-deplie');
      return actif;
    }
    function appliquerVolets(now) {
      const [f1, f2, f3] = volets;
      const a1 = angle(f1, now), a2 = angle(f2, now), a3 = angle(f3, now);
      const t1 = `translateZ(-1px) rotateX(${a1.toFixed(2)}deg)`;
      const t2 = `${t1} translateY(${f1.h}px) translateZ(-.5px) rotateX(${a2.toFixed(2)}deg)`;
      const t3 = `${t2} translateY(${f2.h}px) translateZ(-.3px) rotateX(${a3.toFixed(2)}deg)`;
      f1.el.style.transform = t1;
      f2.el.style.transform = t2;
      f3.el.style.transform = t3;
      // replié, un volet est rangé derrière le soulier, mais la pointe du soulier est basse : on ne le montre
      // qu'une fois sorti de là (entre -150° et -120° il est encore caché : le fondu ne se voit pas)
      let vis = 1;
      [a1, a2, a3].forEach((a, i) => {
        vis = Math.min(vis, clamp((a + 150) / 30, 0, 1));
        const q = Math.round(vis * 20) / 20, f = volets[i];
        if (q !== f.vu) { f.vu = q; f.faces.forEach((e) => { e.style.opacity = q; }); }
      });
      // l'ombrage : la lumière vient d'en haut, un peu de face (l'opacité d'un voile : rien à repeindre)
      [a1, a1 + a2, a1 + a2 + a3].forEach((a, i) => {
        const r = a / DEG;
        const lum = clamp(0.52 * -Math.sin(r) + 0.86 * Math.cos(r), -1, 1); // la face
        const f = volets[i];
        const o = [clamp((0.86 - lum) * 0.62, 0, 0.62), clamp((0.86 + lum) * 0.5, 0, 0.62)];
        o.forEach((v, k) => {
          const q = Math.round(v * 100) / 100;
          if (q !== f.ombre[k] && f.voiles[k]) { f.ombre[k] = q; f.voiles[k].style.opacity = q; }
        });
      });
    }

    /* ---------- la boucle (seulement quand quelque chose bouge) ---------- */
    let raf = 0, tPrec = 0, T = 0; // T : l'horloge des volets (ms), qui peut être ralentie (CO.ralenti, pour le labo)
    function demarrer() { if (!raf && !detruit) { tPrec = 0; raf = requestAnimationFrame(image); } }
    function image(now) {
      raf = 0;
      if (detruit) return;
      const dt = (tPrec ? Math.min(0.05, (now - tPrec) / 1000) : 1 / 60) / (CO.ralenti || 1);
      tPrec = now;
      T += dt * 1000;
      let encore = pasVolets(T, dt);
      if (P.actif) {
        // hors de l'écran (autre onglet, page cachée) : on le pose, sans rien calculer de plus
        if (document.hidden || (CO.ambiance && !CO.ambiance.visible(root))) {
          P.phi = P.w = P.psi = P.wt = P.y = P.vy = 0; P.actif = false; appliquerCorps();
        } else encore = pasPhysique(dt) || encore;
      }
      if (encore) raf = requestAnimationFrame(image);
    }

    /* ---------- ouvrir, fermer ---------- */
    function ouvrir() {
      if (cibleOuvert || detruit) return;
      son('pn-grince');
      son('flip', { delay: 120 });
      vibre(8);
      pousser(0.35, 0.12, 30);
      lancerVolets(true);
      document.addEventListener('pointerdown', dehors, true);
      document.addEventListener('keydown', clavier, true);
    }
    function fermer(o = {}) {
      if (!cibleOuvert || detruit) return;
      if (!o.instantane) son('pn-grince', { dur: 0.3, v: 0.7 });
      const focusDedans = zone.contains(document.activeElement);
      lancerVolets(false, !!o.instantane);
      if (focusDedans) bouton.focus({ preventScroll: true });
      document.removeEventListener('pointerdown', dehors, true);
      document.removeEventListener('keydown', clavier, true);
    }
    const basculer = () => (cibleOuvert ? fermer() : ouvrir());
    function dehors(e) {
      const t = e.target;
      if (root.contains(t) || (t && t.closest && t.closest('[data-pn-garde]'))) return; // [data-pn-garde] : une zone qui ne referme pas
      fermer();
    }
    function clavier(e) { if (e.key === 'Escape' || e.key === 'Esc') { e.stopPropagation(); fermer(); } }

    // le doigt : on toque un côté, il penche ; le clic (ou Entrée, Espace) déplie
    let xTape = 0;
    bouton.addEventListener('pointerdown', (e) => {
      const r = bouton.getBoundingClientRect();
      xTape = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5);
      pousser(xTape * 1.5, xTape * 0.35, 26);
    });
    bouton.addEventListener('click', () => { basculer(); xTape = 0; });

    /* ---------- le défilement de l'accueil pousse l'enseigne ---------- */
    const vue = host.closest('.view');
    const defil = (vue && vue.querySelector('.view-scroll')) || null;
    let yS = null, tS = 0, vS = 0;
    function surDefilement() {
      const now = performance.now();
      const y = defil ? defil.scrollTop : window.scrollY;
      if (yS == null || now - tS > 140) { yS = y; tS = now; vS = 0; return; }
      const dt = Math.max(8, now - tS);
      const v = (y - yS) / dt; // px/ms
      const dv = clamp(v - vS, -3, 3);
      yS = y; tS = now; vS = v;
      if (Math.abs(dv) < 0.02) return;
      pousser(-dv * 0.2, dv * 0.07, -dv * 34);
    }
    (defil || window).addEventListener('scroll', surDefilement, { passive: true });

    /* ---------- le souffle au repos (CO.ambiance : 24 images/s, seulement à l'écran) ---------- */
    let souffle = null;
    function lancerSouffle() {
      if (reduit() || souffle || !balancier.animate) return;
      try {
        souffle = balancier.animate([{ transform: 'rotate(-.42deg)' }, { transform: 'rotate(.42deg)' }],
          { duration: 4600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        if (CO.ambiance) CO.ambiance.anime(souffle, root);
      } catch (e) { souffle = null; }
    }

    /* ---------- divers ---------- */
    let tMin = 0;
    function planifier() {
      clearTimeout(tMin);
      const n = new Date();
      tMin = setTimeout(() => { maj(); planifier(); }, 60000 - (n.getSeconds() * 1000 + n.getMilliseconds()) + 80);
    }
    const surVisible = () => { if (!document.hidden) maj(); };
    document.addEventListener('visibilitychange', surVisible);
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(() => mesurer()); ro.observe(host); }
    else window.addEventListener('resize', mesurer);
    if (CO.on) CO.on('view', (v) => { if (!detruit && vue && v !== vue.dataset.view) fermer({ instantane: true }); });

    function masquer(v) { root.classList.toggle('pn-cache', !!v); if (v) fermer({ instantane: true }); }
    function secouer(force = 1) { pousser(0.9 * force, 0.3 * force, 40 * force); }

    function detruire() {
      if (detruit) return;
      fermer({ instantane: true });
      detruit = true;
      cancelAnimationFrame(raf);
      clearTimeout(tMin);
      if (souffle) souffle.cancel();
      (defil || window).removeEventListener('scroll', surDefilement);
      document.removeEventListener('visibilitychange', surVisible);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', mesurer);
      root.remove();
      repli.forEach((c) => { c.hidden = false; });
    }

    // démarrage
    maj();
    mesurer();
    lancerVolets(false, true);
    lancerSouffle();
    planifier();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!detruit) { ajusterMot(); mesurer(); } });

    return { el: root, maj, ouvrir, fermer, basculer, nuit: (v) => { opts.nuit = v; nuit(v); }, secouer, masquer, detruire, get ouvert() { return cibleOuvert; } };
  }

  CO.Panneau = { create };
})();
