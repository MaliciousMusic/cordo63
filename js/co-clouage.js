/* ==========================================================================
   Cordo 63 — le clouage de la carte fidélité (CO.Clouage)
   À chaque réparation, Clément plante un clou dans la carte de cuir : sa main
   gauche arrive d'en bas à gauche, le pouce et l'index pincent la tige sous la
   tête (les trois autres doigts rentrés), le clou penché d'une vingtaine de
   degrés, la pointe sur la case ; la droite tient le maillet (tête de cuir brut
   roulé) à pleine main, les doigts enroulés sur le manche, le pouce par-dessus ;
   quatre à sept coups : l'élan (la tête remonte vers le poing), le coup sec, la
   tête qui s'écrase un instant ; le clou s'enfonce et se redresse, le cuir se
   creuse, la carte tressaille ; après deux ou trois coups les doigts s'ouvrent
   et la main s'écarte un peu (elle revient avec le clou suivant, ou s'en va),
   les derniers coups le mettent à fleur. Vu de dessus, comme le film de
   l'atelier : mêmes mains (co-mains.js), même lumière (co-rendu.js).

   Les têtes varient d'un clou à l'autre (la même, toujours, pour une case
   d'une carte donnée) : laiton, cuivre, bronze, acier, fer noirci, doré ;
   bombée, plate, pointe de diamant, carrée (clou de soulier), rosette,
   champignon (clou de tapissier) ; taille et rotation un peu différentes, un
   reflet, de l'usure, l'ombre de contact et le creux du cuir autour.

   CO.Clouage.tete(index, carteId, { taille = 40, ombre = true })  → le SVG d'une tête (chaîne) : à mettre dans .trou-clou
   CO.Clouage.enfoncer(case | [cases], { index | [index], carteId, coups }) → Promise (résolue quand les mains sont parties)
        (plusieurs cases : la main gauche revient avec le clou suivant, tout va plus vite, cinq clous en moins de 9 s ;
        chaque tête est posée dans sa case au dernier coup ; mouvement réduit, ou mains pas prêtes en 4,5 s :
        pas de mains, la tête se pose d'un coup de tampon)
   CO.Clouage.preparer() → Promise   calcule les mains, les avant-bras et le maillet d'avance (≈ 2 à 4 s la première
        fois sur un ordinateur, puis gardés dans le téléphone) : à appeler tôt (la vue « Mes tickets », le code qui s'ouvre)
   CO.Clouage.stats.dernier          le dernier clouage : durée, images, coût JS (banc d'essai)
   CO.Clouage.figer(cases, o, t)     dessine l'instant t sans l'animer (captures) ; CO.Clouage.plan(n, coups, graine)
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const TAU = Math.PI * 2;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const E = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out2: (t) => 1 - (1 - t) * (1 - t),
  };
  const now = () => performance.now();
  const f2 = (v) => Math.round(v * 100) / 100;

  /* ======================================================================
     1. Les têtes de clous (SVG) : déterministes pour (carte, case)
     La lumière vient d'en haut à gauche (comme sur l'établi) : le reflet ne tourne pas avec la tête.
     ====================================================================== */
  // les finitions : [reflet, clair, moyen, sombre]
  const FINIS = {
    laiton: ['#FFF4C8', '#E7C066', '#A77D34', '#5B3E15'],
    cuivre: ['#FFE3CE', '#DD915E', '#9D512C', '#4E2412'],
    bronze: ['#F6DFB3', '#BB8D52', '#7C572A', '#3E2A12'],
    acier: ['#FFFFFF', '#D3D7DA', '#8D9399', '#454A4F'],
    fer: ['#AEB0B3', '#595B5F', '#2D2E31', '#121315'],
    dore: ['#FFF9D0', '#F3CC4D', '#BB8C1E', '#6D4C0A'],
  };
  const FINITIONS = ['laiton', 'laiton', 'cuivre', 'bronze', 'acier', 'fer', 'dore'];
  const FORMES = ['bombe', 'plat', 'pyramide', 'carre', 'rosette', 'champignon'];
  const L2 = [-0.64, -0.77]; // vers la lumière (en haut à gauche), dans le plan

  const hash = (s) => (CO.hash ? CO.hash(s) : Array.from(s).reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261));
  const rngDe = (seed) => {
    if (CO.rng) return CO.rng(seed);
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const melange = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; };
  /* la teinte d'une facette selon son orientation (angle de sa normale dans le plan) : de sombre à claire */
  function teinteFacette(c, ang, pente = 0.8) {
    const d = Math.cos(ang) * L2[0] + Math.sin(ang) * L2[1]; // −1 (dos à la lumière) … 1 (face à elle)
    const t = 0.5 + 0.5 * d * pente;
    return t < 0.5 ? melange(c[3], c[2], t * 2) : t < 0.8 ? melange(c[2], c[1], (t - 0.5) / 0.3) : melange(c[1], c[0], (t - 0.8) / 0.2);
  }

  /** le modèle d'une tête (tiré une fois) */
  function modele(index, carteId) {
    const seed = hash(String(carteId || 'carte') + '#' + index);
    const r = rngDe(seed);
    const fin = FINITIONS[Math.floor(r() * FINITIONS.length)];
    // les formes : une permutation par carte, pour que deux cases voisines diffèrent souvent
    const p = rngDe(hash(String(carteId || 'carte') + '#formes'));
    const ordre = FORMES.slice();
    for (let i = ordre.length - 1; i > 0; i--) { const j = Math.floor(p() * (i + 1)); const t = ordre[i]; ordre[i] = ordre[j]; ordre[j] = t; }
    const forme = r() < 0.72 ? ordre[index % ordre.length] : FORMES[Math.floor(r() * FORMES.length)];
    const R = 11.4 * (0.9 + 0.2 * r()) * (forme === 'champignon' ? 1.08 : forme === 'rosette' ? 1.02 : 1);
    const rot = r() * TAU;
    const rayures = [];
    const nr = 1 + Math.floor(r() * 4);
    for (let i = 0; i < nr; i++) {
      const a = r() * TAU, d = r() * R * 0.6, l = R * (0.3 + r() * 0.65), b = r() * TAU;
      const x0 = Math.cos(a) * d, y0 = Math.sin(a) * d;
      rayures.push([x0 - Math.cos(b) * l / 2, y0 - Math.sin(b) * l / 2, x0 + Math.cos(b) * l / 2, y0 + Math.sin(b) * l / 2, 0.22 + r() * 0.3, r() < 0.5]);
    }
    const patine = { x: (r() - 0.5) * R, y: (r() - 0.5) * R, r: R * (0.4 + r() * 0.5), a: fin === 'acier' || fin === 'dore' ? 0.1 : 0.16 + r() * 0.2 };
    const bosse = r() < 0.35 ? { x: (r() - 0.5) * R * 1.1, y: (r() - 0.5) * R * 1.1, r: 1 + r() * 1.6 } : null;
    return { seed, fin, forme, R, rot, rayures, patine, bosse, u: 'cl' + seed.toString(36) + index };
  }

  /**
   * La tête d'un clou, en SVG (chaîne), centrée : taille (px) = la boîte (la tête ≈ 60 % de sa largeur, plus le creux du cuir).
   * ombre : l'ombre de contact et le creux du cuir autour (false : la tête seule, pour l'animation).
   */
  function tete(index, carteId, o = {}) {
    const m = modele(index, carteId);
    const taille = o.taille || 40, ombre = o.ombre !== false;
    const c = FINIS[m.fin], R = m.R, u = m.u + (ombre ? 'o' : 'n');
    const rot = (m.rot * 180) / Math.PI;
    const defs = [], corps = [];
    // les dégradés (en espace de l'utilisateur : le reflet reste en haut à gauche quand la tête tourne)
    defs.push(`<radialGradient id="${u}d" gradientUnits="userSpaceOnUse" cx="${f2(-R * 0.34)}" cy="${f2(-R * 0.4)}" r="${f2(R * 1.35)}"><stop offset="0" stop-color="${c[0]}"/><stop offset=".3" stop-color="${c[1]}"/><stop offset=".72" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`);
    defs.push(`<linearGradient id="${u}l" gradientUnits="userSpaceOnUse" x1="${f2(-R)}" y1="${f2(-R)}" x2="${f2(R)}" y2="${f2(R)}"><stop offset="0" stop-color="${c[1]}"/><stop offset=".5" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>`);
    defs.push(`<clipPath id="${u}c"><circle r="${f2(R * (m.forme === 'champignon' ? 1.1 : 1))}"/></clipPath>`);
    const coulPatine = m.fin === 'cuivre' || m.fin === 'bronze' || m.fin === 'laiton' ? '#3d4a2c' : '#1a1a1a';
    defs.push(`<radialGradient id="${u}p" gradientUnits="userSpaceOnUse" cx="${f2(m.patine.x)}" cy="${f2(m.patine.y)}" r="${f2(m.patine.r)}"><stop offset="0" stop-color="${coulPatine}" stop-opacity="${f2(m.patine.a)}"/><stop offset="1" stop-color="${coulPatine}" stop-opacity="0"/></radialGradient>`);
    if (ombre) {
      // le creux : le cuir tassé autour de la tête (plus sombre), un bourrelet qui prend la lumière plus loin
      defs.push(`<radialGradient id="${u}f" gradientUnits="userSpaceOnUse" r="${f2(R + 7.5)}"><stop offset="0" stop-color="#1c0f06" stop-opacity=".6"/><stop offset="${f2(R / (R + 7.5))}" stop-color="#1c0f06" stop-opacity=".55"/><stop offset="${f2((R + 3) / (R + 7.5))}" stop-color="#1c0f06" stop-opacity=".18"/><stop offset="1" stop-color="#1c0f06" stop-opacity="0"/></radialGradient>`);
      defs.push(`<radialGradient id="${u}s" gradientUnits="userSpaceOnUse" cx="1.6" cy="2.2" r="${f2(R + 3)}"><stop offset="0" stop-color="#0d0703" stop-opacity=".62"/><stop offset=".7" stop-color="#0d0703" stop-opacity=".35"/><stop offset="1" stop-color="#0d0703" stop-opacity="0"/></radialGradient>`);
      corps.push(`<circle r="${f2(R + 7.5)}" fill="url(#${u}f)"/>`);
      // le bourrelet du cuir, éclairé du côté de la lumière
      corps.push(`<path d="M${f2(-(R + 3.8) * 0.9)} ${f2((R + 3.8) * 0.42)}A${f2(R + 3.8)} ${f2(R + 3.8)} 0 0 1 ${f2((R + 3.8) * 0.42)} ${f2(-(R + 3.8) * 0.9)}" fill="none" stroke="#ffdcb4" stroke-opacity=".08" stroke-width="2.2" stroke-linecap="round"/>`);
      corps.push(`<ellipse cx="1.6" cy="2.2" rx="${f2(R + 2.4)}" ry="${f2(R + 2)}" fill="url(#${u}s)"/>`);
    }
    // la tête
    const g = [];
    if (m.forme === 'bombe') {
      g.push(`<circle r="${f2(R)}" fill="url(#${u}d)" stroke="${c[3]}" stroke-width=".7"/>`);
    } else if (m.forme === 'champignon') {
      g.push(`<circle r="${f2(R * 1.1)}" fill="${c[3]}"/>`);
      g.push(`<circle r="${f2(R * 1.03)}" fill="url(#${u}d)"/>`);
      g.push(`<ellipse cx="${f2(-R * 0.36)}" cy="${f2(-R * 0.42)}" rx="${f2(R * 0.3)}" ry="${f2(R * 0.17)}" transform="rotate(-38 ${f2(-R * 0.36)} ${f2(-R * 0.42)})" fill="#fff" fill-opacity=".62"/>`);
    } else if (m.forme === 'plat') {
      g.push(`<circle r="${f2(R)}" fill="url(#${u}l)" stroke="${c[3]}" stroke-width=".7"/>`);
      g.push(`<circle r="${f2(R - 1.5)}" fill="none" stroke="${c[0]}" stroke-opacity=".45" stroke-width=".8" stroke-dasharray="${f2(R * 2.2)} ${f2(R * 4.1)}" transform="rotate(170)"/>`);
      g.push(`<circle r="${f2(R - 1.5)}" fill="none" stroke="${c[3]}" stroke-opacity=".35" stroke-width=".7" stroke-dasharray="${f2(R * 2.2)} ${f2(R * 4.1)}" transform="rotate(-10)"/>`);
      for (const k of [0.34, 0.58]) g.push(`<circle r="${f2(R * k)}" fill="none" stroke="${c[3]}" stroke-opacity=".14" stroke-width=".45"/>`);
    } else if (m.forme === 'pyramide' || m.forme === 'carre') {
      // un carré (tourné), quatre facettes : chacune éclairée selon son orientation
      const h = m.forme === 'pyramide' ? R * 0.92 : R * 0.84;
      const coins = [0, 1, 2, 3].map((k) => { const a = m.rot + Math.PI / 4 + (k * Math.PI) / 2; return [Math.cos(a) * h * Math.SQRT2, Math.sin(a) * h * Math.SQRT2]; });
      const pente = m.forme === 'pyramide' ? 0.95 : 0.55;
      const sommet = m.forme === 'pyramide' ? [0, 0] : [0, 0];
      for (let k = 0; k < 4; k++) {
        const a = coins[k], b = coins[(k + 1) % 4], n = m.rot + Math.PI / 2 + (k * Math.PI) / 2;
        g.push(`<path d="M${f2(sommet[0])} ${f2(sommet[1])}L${f2(a[0])} ${f2(a[1])}L${f2(b[0])} ${f2(b[1])}Z" fill="${teinteFacette(c, n, pente)}"/>`);
      }
      if (m.forme === 'carre') { // le clou de soulier : bombé, les arêtes adoucies
        const d = coins.map((p, k) => (k ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1])).join('') + 'Z';
        g.push(`<path d="${d}" fill="url(#${u}d)" fill-opacity=".45"/>`);
        g.push(`<path d="${d}" fill="none" stroke="${c[3]}" stroke-width=".8" stroke-linejoin="round"/>`);
      } else {
        g.push(`<path d="${coins.map((p, k) => (k ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1])).join('')}Z" fill="none" stroke="${c[3]}" stroke-width=".6" stroke-linejoin="round"/>`);
        for (const p of coins) g.push(`<path d="M0 0L${f2(p[0])} ${f2(p[1])}" stroke="${c[0]}" stroke-opacity=".25" stroke-width=".35"/>`);
      }
    } else if (m.forme === 'rosette') {
      // huit pétales en couronne, un bouton au milieu
      for (let k = 0; k < 8; k++) {
        const a = m.rot + (k * Math.PI) / 4, cx = Math.cos(a) * R * 0.55, cy = Math.sin(a) * R * 0.55;
        g.push(`<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(R * 0.46)}" ry="${f2(R * 0.27)}" transform="rotate(${f2((a * 180) / Math.PI)} ${f2(cx)} ${f2(cy)})" fill="${teinteFacette(c, a, 0.85)}" stroke="${c[3]}" stroke-width=".45"/>`);
      }
      g.push(`<circle r="${f2(R * 0.38)}" fill="url(#${u}d)" stroke="${c[3]}" stroke-width=".5"/>`);
    }
    // l'usure (dans la tête) : patine, rayures claires ou sombres, un petit enfoncement
    const us = [];
    us.push(`<circle cx="${f2(m.patine.x)}" cy="${f2(m.patine.y)}" r="${f2(m.patine.r)}" fill="url(#${u}p)"/>`);
    for (const [x0, y0, x1, y1, a, clair] of m.rayures) us.push(`<path d="M${f2(x0)} ${f2(y0)}L${f2(x1)} ${f2(y1)}" stroke="${clair ? c[0] : c[3]}" stroke-opacity="${f2(a * 0.8)}" stroke-width=".28" stroke-linecap="round"/>`);
    if (m.bosse) us.push(`<ellipse cx="${f2(m.bosse.x)}" cy="${f2(m.bosse.y)}" rx="${f2(m.bosse.r)}" ry="${f2(m.bosse.r * 0.7)}" fill="${c[3]}" fill-opacity=".35"/><ellipse cx="${f2(m.bosse.x + 0.4)}" cy="${f2(m.bosse.y + 0.4)}" rx="${f2(m.bosse.r * 0.6)}" ry="${f2(m.bosse.r * 0.4)}" fill="${c[0]}" fill-opacity=".3"/>`);
    // un reflet vif (la vitrine), toujours en haut à gauche
    const reflet = m.forme === 'champignon' ? '' : `<ellipse cx="${f2(-R * 0.34)}" cy="${f2(-R * 0.4)}" rx="${f2(R * 0.22)}" ry="${f2(R * 0.12)}" transform="rotate(-38 ${f2(-R * 0.34)} ${f2(-R * 0.4)})" fill="#fff" fill-opacity="${m.fin === 'fer' ? '.28' : '.5'}"/>`;
    corps.push(`<g>${g.join('')}<g clip-path="url(#${u}c)">${us.join('')}</g>${reflet}</g>`);
    const nom = { laiton: 'laiton', cuivre: 'cuivre', bronze: 'bronze', acier: 'acier', fer: 'fer noirci', dore: 'doré' }[m.fin];
    return `<svg class="clou-tete" data-forme="${m.forme}" data-finition="${m.fin}" viewBox="-20 -20 40 40" width="${taille}" height="${taille}" aria-hidden="true" focusable="false" style="position:absolute;left:50%;top:50%;width:${taille}px;height:${taille}px;margin:${-taille / 2}px 0 0 ${-taille / 2}px;overflow:visible;pointer-events:none" data-nom="clou ${m.forme}, ${nom}"><defs>${defs.join('')}</defs>${corps.join('')}</svg>`;
  }

  /* ======================================================================
     2. Ce qu'il faut calculer : les mains, un bout d'avant-bras (il s'efface hors du gros plan), le maillet
     ====================================================================== */
  const PPM = 2.4; // px par mm des sprites (≈ la définition du canvas sur un téléphone : pas d'agrandissement)
  const EPAULES = { g: [-40, 530], d: [170, 660] }; // (repère de la carte, mm : la gauche arrive d'en bas à gauche, la droite d'en bas)
  const PRISE_M = 42; // de la sortie du poing (entre le pouce et l'index) au centre de la tête du maillet
  const ELAN = 0.75; // en levant le maillet, sa tête recule vers le poing (l'arc du geste, vu de dessus) : on voit le clou
  const AVANT_BRAS = 190; // mm d'avant-bras (au-delà, il sort du gros plan : il s'efface)
  const ANGLES = { g: 0.33, d: 0.1 }; // les angles de calcul des sprites (≈ ceux du geste : la lumière y est juste)
  let pret = null, pretTout = null, SP = null, arret = null;
  let calculer = true; // (pendant le geste, les calculs en retard attendent : chaque image est pour les mains)
  let active = null, ecoute = false; // la séance en cours (une autre vue de l'appli l'arrête : CO.on('view'))
  const M = () => CO.Mains;
  const R = () => CO.R;

  /* le maillet de cordonnier, vu de dessus en frappe : la tête (cuir brut roulé) debout, le manche à plat ;
     repère : le centre de la tête en (0, 0), le manche vers −x */
  function* specMaillet() {
    const Rr = R();
    const T1 = yield* Rr.tuileG(16, 16, 3), T2 = yield* Rr.tuileG(17, 64, 1);
    const tx = Rr.tx, lin = Rr.lin, MAT = Rr.MAT, sst = Rr.sstep;
    const CUIR = lin('#c79b5c'), CUIR_S = lin('#8a5c2a'), HETRE = Rr.matiere('#b88a5a', { ro: 0.32, f0: 0.05 });
    const RT = 21, HT = 64; // la tête : rayon, hauteur (posée sur sa face)
    return {
      box: [-152, -24, 24, 24], haut: HT,
      couches: [
        { // le manche : hêtre verni, la prise patinée
          box: [-152, -12, -14, 12],
          f(x, y, S) {
            const w = lerp(9.5, 10.8, clamp01((-x - 20) / 120)), ay = Math.abs(y);
            let d = ay - w;
            d = Math.max(d, -151 - x, x + 16);
            if (x < -146) d = Math.max(d, Math.hypot(x + 146, y) - w);
            S.d = d;
            if (d > S.lim) return;
            const q = Math.min(1, ay / w);
            S.z = 26 + w * 0.85 * Math.sqrt(Math.max(0, 1 - q * q));
            const vn = Math.sin((y * 1.2 + tx(T1, x * 0.02, y * 0.3) * 2.2) * 1.4 * TAU) > 0.55 ? 1 : 0;
            Rr.mat(S, HETRE, 0.96 - vn * 0.18 + tx(T1, x * 0.04, y * 0.2) * 0.08, 0);
            const prise = sst(-40, -90, x) * 0.6;
            S.r *= 1 - prise * 0.28; S.g *= 1 - prise * 0.32; S.b *= 1 - prise * 0.38; S.ro += prise * 0.15;
          },
        },
        { // la tête : un rouleau de cuir brut (translucide, ambré), vu par sa face du dessus : la spirale des couches
          box: [-24, -24, 24, 24],
          f(x, y, S) {
            const r = Math.hypot(x, y);
            const d = r - RT;
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            S.z = HT - 2.2 + Math.min(2.2, Math.sqrt(Math.max(0, e * 4.4 - e * e)));
            const a = Math.atan2(y, x);
            const pas = 3.4, sp = ((r + (a / TAU) * pas + 0.9 * tx(T1, x * 0.12, y * 0.12)) % pas + pas) % pas; // la spirale des couches roulées
            const couche = Math.abs(sp - pas / 2) / (pas / 2);
            Rr.mat(S, MAT.cuirTanne, 1, 0);
            S.r = CUIR[0]; S.g = CUIR[1]; S.b = CUIR[2];
            const k = 0.9 + 0.1 * tx(T1, x * 0.3, y * 0.3) - 0.12 * Math.pow(1 - couche, 8);
            S.r *= k; S.g *= k; S.b *= k;
            Rr.teinte(S, CUIR_S, sst(RT - 3, RT, r) * 0.6 + sst(0.45, 0.8, tx(T2, x * 0.5, y * 0.5)) * 0.25);
            S.ro = 0.55; S.f0 = 0.04; S.sh = 0.12;
            S.z -= Math.pow(1 - couche, 8) * 0.18; // les lignes entre les couches, un peu creusées
            // la face écrasée par les coups (plus lisse, plus sombre au centre)
            const use = sst(12, 0, r);
            S.r *= 1 - use * 0.12; S.g *= 1 - use * 0.14; S.b *= 1 - use * 0.16; S.ro -= use * 0.12;
          },
        },
      ],
      cavite: [2, 0.12], soleil: 1.2, ombre: { opacite: 0.55, contact: 0.3 },
    };
  }

  /** calcule d'avance les mains et le maillet (une fois ; gardés en mémoire et dans le téléphone) */
  function preparer() {
    if (pret) return pret;
    const Mn = M(), Rr = R();
    if (!Mn || !Rr) return (pret = Promise.resolve(null));
    // (les calculs tournent même si le film de l'atelier, ailleurs, dort)
    if (!arret) arret = Mn.calcul.condition(() => calculer);
    const main = (cote, pose, angle, prio = 3) => Mn.preparer('main', cote, pose, { ppm: PPM, angle }, prio);
    const bras = (cote, angle) => Mn.preparer('bras', cote, null, { ppm: PPM, angle, longueur: AVANT_BRAS }, 3.2);
    const maillet = (() => {
      const k = 'clouage-2|maillet|' + PPM;
      const c = Rr.cache.get(k);
      if (c) return Promise.resolve(c);
      const sansCoffre = !Mn.coffre || /[?&]nocache\b/.test(location.search);
      return Mn.calcul.lancer((function* () {
        if (!sansCoffre) {
          const box = { v: null };
          yield Mn.coffre.sortir('cl|' + k).then((x) => { box.v = x; });
          if (box.v) return box.v;
        }
        const spec = yield* specMaillet();
        spec.ppm = PPM;
        spec.angle = 0;
        const sp = yield* Rr.rendre(spec);
        if (!sansCoffre) Mn.coffre.ranger('cl|' + k, sp);
        return sp;
      })(), 3, 'maillet').then((sp) => Rr.cache.set(k, sp));
    })();
    // l'essentiel d'abord (la main qui tient le clou, le poing et le maillet, les avant-bras) ; la main gauche
    // détendue (une fois le clou lâché) suit : tant qu'elle n'est pas prête, la main garde la pince
    const detendue = main(-1, 'lache', ANGLES.g, 2.5);
    pret = Promise.all([
      main(-1, 'clou', ANGLES.g), main(1, 'maillet', ANGLES.d), maillet, bras(-1, ANGLES.g), bras(1, ANGLES.d),
    ]).then(([gP, dP, ml, gB, dB]) => {
      SP = { gP, gR: null, dP, ml, gB, dB };
      return SP;
    }).catch((e) => { console.warn('clouage', e); pret = null; return null; });
    pretTout = Promise.all([pret, detendue]).then(([sp, gR]) => { if (sp) sp.gR = gR; }, () => {}).then(() => { if (arret) { arret(); arret = null; } });
    return pret;
  }

  /* ======================================================================
     3. Le son : le maillet de cuir sur la tête, et le clou qui chante plus haut à mesure qu'il entre
     ====================================================================== */
  let sonPret = false;
  function son(k, v = 1) {
    const S = CO.sfx;
    if (!S) return;
    if (!sonPret && S.ajouter) {
      sonPret = true;
      S.ajouter('clouer', (c, dst, t, opts, o) => {
        const p = opts.k || 0, vv = opts.v || 1;
        o.strike(c, dst, t, o.rnd(215, 245), 'wood', { d: 0.09, v: 0.1 * vv }); // le cuir roulé du maillet : un coup mat
        o.noise(c, dst, t, { f: 1500, q: 0.9, a: 0.001, d: 0.025, v: 0.055 * vv });
        o.strike(c, dst, t + 0.003, o.midi(79 + p * 10), 'anvil', { d: 0.12 + p * 0.14, v: (0.028 + 0.016 * p) * vv }); // le clou
        if (p > 0.95) o.strike(c, dst, t + 0.01, o.midi(91), 'bell', { d: 0.4, v: 0.02 * vv }); // à fleur : il sonne clair
      }, { gap: 0 });
    }
    if (S.existe && S.existe('clouer')) S.play('clouer', { k, v });
    else S.play('nail', { i: Math.round(k * 4) });
  }

  /* ======================================================================
     4. La chorégraphie : un plan (tous les clous), puis l'état à l'instant t
     ====================================================================== */
  // l'échelle du gros plan : la carte compte pour 25 cm de large (des mains d'homme à l'échelle y prennent environ la
  // moitié de sa largeur : on voit toute la carte et la case qu'on cloue) ; les têtes (≈ 23 px) sont de gros clous de tapissier
  const CARTE_W = 250; // mm
  const TIGE = 16; // la tige du clou (mm)
  const PENCHE = 21 * (Math.PI / 180); // l'inclinaison au départ
  const DIR = [-0.55, 0.84]; // vers où la tête penche (vers la main gauche, en bas à gauche)

  /** le plan : pour chaque clou, ses temps (s) ; plusieurs clous : plus vite, le tout en moins de 9 s */
  function plan(n, coups, graine) {
    const r = rngDe(graine);
    const nb = [];
    for (let i = 0; i < n; i++) nb.push(coups && coups[i] ? Math.max(4, Math.min(7, coups[i])) : 4 + Math.floor(r() * 4));
    let tempo = 1;
    const total = (tp) => { let s = 0.52 * tp + 0.42 * tp; nb.forEach((c, i) => { s += (i ? 0.3 : 0) * tp + c * (i ? 0.2 : 0.26) * tp + 0.12 * tp; }); return s; };
    if (n > 1) while (total(tempo) > 8.2 && tempo > 0.6) tempo -= 0.02; // (plus la mise en place : moins de 9 s en tout)
    const clous = [];
    let t = 0.52 * tempo; // les mains arrivent
    for (let i = 0; i < n; i++) {
      if (i) t += 0.3 * tempo; // la main droite passe à la case suivante ; la gauche revient avec un clou
      const d = (i ? 0.2 : 0.26) * tempo; // la durée d'un coup
      const t0 = t, impacts = [];
      for (let k = 0; k < nb[i]; k++) impacts.push(t0 + (k + 0.82) * d);
      const lache = impacts[Math.min(nb[i] - 2, nb[i] >= 6 ? 2 : 1)] + 0.04; // elle lâche après deux ou trois coups
      clous.push({ i, n: nb[i], t0, d, impacts, lache, fin: impacts[impacts.length - 1] });
      t = t0 + nb[i] * d + 0.12 * tempo;
    }
    return { clous, fin: t + 0.42 * tempo, tempo };
  }

  /* ======================================================================
     5. L'animation : un canvas posé sur la carte (fixe à l'écran, bords fondus), rien après
     ====================================================================== */
  const OMB = [0.84 * 0.62, 0.97 * 0.62]; // l'ombre (comme l'établi, adoucie : la carte est éclairée plus largement)
  const REPOS_G = [-46, 50]; // la main gauche, le clou lâché : elle s'écarte un peu (vers son épaule) et reprend un clou
  const SORTIE_G = [-230, 280], ENTREE_G = [-190, 220]; // après le dernier clou, elle s'en va ; au début, elle arrive
  const DEHORS_D = [140, 250]; // la main droite (et le maillet) : d'où elle arrive, où elle repart
  const MANCHE = -2.85; // le manche sous les doigts : de la sortie du poing vers la tête, côté pouce, un peu en avant

  function Seance(cases, opts) {
    this.cases = cases;
    this.carte = cases[0].closest ? cases[0].closest('.cuir') || cases[0].parentElement : null;
    this.index = opts.index;
    this.carteId = opts.carteId;
    this.P = plan(cases.length, opts.coups, hash(String(opts.carteId) + ':' + opts.index.join(',')));
    this.poses = new Set();
    this.images = new Map();
  }
  Seance.prototype = {
    /* la géométrie de la carte à l'écran : son rectangle, les px par mm, la position des cases (mm) */
    mesurer() {
      const r = this.carte.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = (r.width / CARTE_W) * dpr; // px du canvas par mm
      // le canvas : la carte et ses abords (les mains y entrent), bornés à la fenêtre
      const vw = window.innerWidth, vh = window.innerHeight;
      const x0 = Math.max(0, r.left - r.width * 0.4), x1 = Math.min(vw, r.right + r.width * 0.4);
      const y0 = Math.max(0, r.top - r.height * 0.35), y1 = Math.min(vh, r.bottom + r.height * 0.85); // (en dessous : sans aller jusqu'à la barre d'onglets)
      const G = { r, dpr, k, x0, y0, w: x1 - x0, h: y1 - y0, mm: r.width / CARTE_W };
      // les cases (mm, repère de la carte : son coin haut-gauche)
      G.cases = this.cases.map((c) => { const b = c.getBoundingClientRect(); return [(b.left + b.width / 2 - r.left) / G.mm, (b.top + b.height / 2 - r.top) / G.mm]; });
      G.px = (xmm, ymm) => [((r.left - x0) + xmm * G.mm) * dpr, ((r.top - y0) + ymm * G.mm) * dpr];
      return G;
    },
    installer() {
      const cv = (this.cv = document.createElement('canvas'));
      cv.className = 'clouage';
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;z-index:60;pointer-events:none;';
      document.body.appendChild(cv);
      this.g = cv.getContext('2d');
      this.caler();
    },
    caler() {
      const G = (this.G = this.mesurer());
      const W = Math.max(2, Math.round(G.w * G.dpr)), H = Math.max(2, Math.round(G.h * G.dpr));
      const cv = this.cv;
      // (le canvas garde sa taille à deux pixels près : la carte qui tressaille ne le fait pas réallouer)
      if (Math.abs(cv.width - W) > 2 || Math.abs(cv.height - H) > 2) {
        cv.width = W; cv.height = H;
        this.masque = null;
      }
      G.w = cv.width / G.dpr; G.h = cv.height / G.dpr;
      const st = G.x0.toFixed(2) + ',' + G.y0.toFixed(2) + ',' + G.w + ',' + G.h;
      if (st !== this.st) {
        this.st = st;
        cv.style.left = G.x0 + 'px'; cv.style.top = G.y0 + 'px';
        cv.style.width = G.w + 'px'; cv.style.height = G.h + 'px';
      }
    },
    /* les bords du canvas se fondent (les mains entrent comme dans un projecteur) */
    fondu() {
      if (this.masque) return this.masque;
      const W = this.cv.width, H = this.cv.height, G = this.G;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const b = Math.min(W, H) * 0.16 + 10 * G.dpr;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      // on efface en dégradé le long des bords (« destination-out » ne touche que ce qu'on dessine)
      g.globalCompositeOperation = 'destination-out';
      const lin = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); return gr; };
      // les quatre bords, sauf là où le canvas touche le bord de la fenêtre (rien à fondre : c'est l'écran)
      const bords = [
        [G.x0 > 1, lin(0, 0, b, 0), [0, 0, b, H]],
        [G.x0 + G.w < window.innerWidth - 1, lin(W, 0, W - b, 0), [W - b, 0, b, H]],
        [G.y0 > 1, lin(0, 0, 0, b), [0, 0, W, b]],
        [G.y0 + G.h < window.innerHeight - 1, lin(0, H, 0, H - b), [0, H - b, W, b]],
      ];
      for (const [on, gr, rc] of bords) { if (!on) continue; g.fillStyle = gr; g.fillRect(rc[0], rc[1], rc[2], rc[3]); }
      g.globalCompositeOperation = 'source-over';
      this.masque = c;
      return c;
    },
    /* l'image de la tête (le SVG, sans ombre) : pour que la dernière image du canvas soit exactement la tête posée */
    imageTete(n) {
      if (this.images.has(n)) return this.images.get(n);
      const img = new Image();
      const svg = tete(this.index[n], this.carteId, { taille: 80, ombre: false }).replace(/style="[^"]*"/, '');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
      const e = { img: null, p: null };
      // (rastérisée une fois, sur un canvas : un SVG redessiné à une autre échelle à chaque image serait recalculé)
      e.p = new Promise((res) => {
        img.onload = () => {
          try {
            const c = document.createElement('canvas'), T = Math.ceil(40 * 1.2 * (this.G ? this.G.dpr : 2));
            c.width = c.height = T;
            c.getContext('2d').drawImage(img, 0, 0, T, T);
            e.img = c;
          } catch (err) { e.img = img; }
          res(e.img);
        };
        img.onerror = () => res(null);
      });
      this.images.set(n, e);
      return e;
    },
    async chargerImages() { await Promise.all(this.cases.map((c, n) => this.imageTete(n).p)); },

    /** un clou i à l'instant t : planté (enfoncé d'autant de coups reçus), ou porté par la main (décalé de off, soulevé) */
    clouA(i, t, off, souleve = 0) {
      const c = this.P.clous[i], pos = this.G.cases[i];
      let b = 0;
      for (const ti of c.impacts) if (t >= ti) b++;
      const dernier = c.impacts[b - 1] || 0;
      const vite = b ? E.out(clamp01((t - dernier) / 0.05)) : 1; // (il entre en 50 ms)
      const f = (x) => Math.pow(x / c.n, 0.8);
      const prof = b ? lerp(f(b - 1), f(b), vite) : 0;
      const penche = PENCHE * (1 - Math.pow(prof, 0.75)); // il se redresse à mesure qu'il entre
      const visible = TIGE * (1 - prof); // la tige encore hors du cuir
      const hz = visible * Math.cos(penche) + 1.2; // la hauteur de la tête
      const dxy = visible * Math.sin(penche);
      const ox = off ? off[0] : 0, oy = off ? off[1] : 0;
      return {
        j: i, pos, prof, penche, visible, hz: hz + souleve, dir: DIR, coups: b, n: c.n, alpha: 1,
        tete: [pos[0] + DIR[0] * dxy + ox, pos[1] + DIR[1] * dxy + oy],
        pointe: [pos[0] + ox, pos[1] + oy],
        plante: !off,
      };
    },

    /** l'état à l'instant t : les clous en jeu, la main gauche, la main droite et le maillet */
    etat(t) {
      const P = this.P, C = P.clous, n = C.length, T = P.tempo, S = {};
      const dRel = (i) => (i === n - 1 ? 0.55 : 0.34) * T; // (après le dernier clou, elle s'en va : plus loin, plus lent)
      const REP = (i) => (i === n - 1 ? SORTIE_G : REPOS_G);
      const pinceDe = (cl) => [cl.tete[0] - DIR[0] * 3.5, cl.tete[1] - DIR[1] * 3.5]; // les doigts, sur la tige sous la tête
      // la fenêtre où la main gauche apporte le clou i : de l'entrée, ou de là où elle s'était écartée (quand le maillet a fini)
      const apport = (i) => (i === 0 ? [0, C[0].t0] : [Math.max(C[i - 1].lache + dRel(i - 1), C[i - 1].fin - 0.05), C[i].t0 - 0.02]);
      // --- la main gauche : sa phase
      let seg = null;
      for (let i = 0; i < n && !seg; i++) {
        const [a0, a1] = apport(i);
        if (t < a0) seg = { k: 'repos', i: i - 1 };
        else if (t < C[i].t0) seg = { k: 'apporte', i, u: clamp01((t - a0) / Math.max(0.05, a1 - a0)) };
        else if (t < C[i].lache) seg = { k: 'tient', i };
        else if (t < C[i].lache + dRel(i)) seg = { k: 'lache', i, u: clamp01((t - C[i].lache) / dRel(i)) };
      }
      if (!seg) seg = { k: 'repos', i: n - 1 };
      const gl = { vis: true, pose: 'clou', pose2: null, mix: 0, lev: 16, clou: -1 };
      const clous = [];
      if (seg.k === 'apporte') {
        const i = seg.i, u = E.io(seg.u);
        const cl0 = this.clouA(i, t, null), p1 = pinceDe(cl0);
        let de;
        if (i === 0) de = [p1[0] + ENTREE_G[0], p1[1] + ENTREE_G[1]];
        else { const pp = pinceDe(this.clouA(i - 1, C[i - 1].lache, null)); de = [pp[0] + REPOS_G[0], pp[1] + REPOS_G[1]]; }
        const off = [(de[0] - p1[0]) * (1 - u), (de[1] - p1[1]) * (1 - u)];
        const cl = this.clouA(i, t, off, (1 - sstep(0.6, 1, seg.u)) * 12); // porté un peu haut, posé sur sa case à la fin
        if (i > 0) cl.alpha = clamp01(seg.u / 0.12);
        clous.push(cl);
        gl.x = p1[0] + off[0]; gl.y = p1[1] + off[1];
        gl.lev = lerp(16, cl0.hz * 0.5 + 4, u);
        gl.clou = i; // (entre deux clous, elle garde la pince : elle revient avec le suivant entre les doigts)
      } else if (seg.k === 'tient') {
        const cl = this.clouA(seg.i, t, null), p = pinceDe(cl);
        gl.x = p[0]; gl.y = p[1]; gl.lev = cl.hz * 0.5 + 4;
        gl.clou = seg.i;
      } else {
        const i = Math.max(0, seg.i), cl = this.clouA(i, C[i].lache, null), p = pinceDe(cl), R2 = REP(i);
        const u = seg.k === 'lache' ? seg.u : 1, l = E.io(u);
        gl.x = p[0] + R2[0] * l; gl.y = p[1] + R2[1] * l; gl.lev = lerp(cl.hz * 0.5 + 4, 16, l);
        // les doigts s'ouvrent en lâchant ; entre deux clous, la pince se referme (sur le clou suivant) avant de revenir
        // (des fondus courts : deux poses superposées longtemps feraient deux index)
        gl.pose = 'clou'; gl.pose2 = 'lache'; gl.mix = sstep(0, 0.08, u * dRel(i));
        if (seg.k === 'repos' && i < n - 1) {
          const b0 = apport(i + 1)[0];
          gl.mix = 1 - sstep(b0 - 0.1, b0 - 0.02, t);
        }
      }
      // --- les clous plantés, pas encore à fleur (le dernier coup pose la tête dans sa case)
      for (let i = 0; i < n; i++) if (t >= C[i].t0 && t < C[i].fin) clous.push(this.clouA(i, t, null));
      S.clous = clous;
      S.poses = C.filter((c) => t >= c.fin).map((c) => c.i);
      S.gauche = gl;
      // --- la main droite et le maillet : la face du maillet au-dessus de la tête du clou ; l'élan, le coup, le rebond
      let j = n - 1;
      for (let i = 0; i < n; i++) if (t < C[i].fin + 0.02) { j = i; break; }
      const c = C[j], clJ = this.clouA(j, t, null);
      const md = { vis: true, pose: 'maillet', ecrase: 0 };
      let lev = 34, recul = 10;
      md.cible = [clJ.tete[0], clJ.tete[1]];
      if (t >= c.t0) {
        const kk = Math.min(c.n - 1, Math.floor((t - c.t0) / c.d)), ph = (t - c.t0 - kk * c.d) / c.d; // phase du coup (0..1)
        const bas = kk === 0 ? 30 : 3; // (le premier coup part d'en haut : le maillet arrive levé)
        if (t > c.fin) { lev = lerp(0, 30, E.out(clamp01((t - c.fin) / 0.2))); recul = lev * ELAN; }
        else if (ph < 0.56) { lev = lerp(bas, 36, E.out(ph / 0.56)); recul = lev * ELAN; } // l'élan : il remonte, recule vers le poing
        else if (ph < 0.68) { lev = 36 + 2 * Math.sin(((ph - 0.56) / 0.12) * Math.PI); recul = 36 * ELAN; } // en haut, un temps
        else if (ph < 0.82) { lev = lerp(36, 0, E.in((ph - 0.68) / 0.14)); recul = lev * ELAN; } // le coup
        else { lev = lerp(0, 3, E.out((ph - 0.82) / 0.18)); recul = 0; } // le rebond
      } else if (j > 0) {
        // entre deux clous : il remonte et glisse, levé, de la tête d'avant à la nouvelle
        const pr = C[j - 1], u = clamp01((t - pr.fin) / Math.max(0.05, c.t0 - pr.fin));
        lev = lerp(lerp(0, 30, E.out(clamp01((t - pr.fin) / 0.2))), 30, sstep(0, 0.4, u)); recul = lev * ELAN;
        const ph = this.clouA(j - 1, pr.fin, null).tete;
        md.cible = [lerp(ph[0], clJ.tete[0], E.io(u)), lerp(ph[1], clJ.tete[1], E.io(u))];
      } else {
        lev = 30; recul = 30 * ELAN; // au début : il arrive de son épaule, levé
      }
      md.levM = lev + clJ.hz - 1;
      // à l'impact, la tête de cuir s'écrase un instant sur le clou
      for (const ti of c.impacts) if (t >= ti && t < ti + 0.09) md.ecrase = Math.max(md.ecrase, 1 - (t - ti) / 0.09);
      md.recul = recul;
      md.dehors = (1 - sstep(0, 0.52 * T, t)) + sstep(P.fin - 0.42 * T, P.fin, t); // d'où elle arrive, où elle repart
      S.droite = md;
      S.clou = clous.find((x) => x.j === j) || clJ; // (pour les bancs d'essai)
      return S;
    },

    /** dessine l'instant t (le canvas est déjà calé sur la carte) */
    dessiner(t) {
      const g = this.g, G = this.G, S = this.etat(t), k = G.k;
      const cv = this.cv;
      const op = Math.round(Math.min(1, t / 0.14) * (1 - sstep(this.P.fin - 0.2, this.P.fin, t)) * 100) / 100;
      if (op !== this.op && !this.chauffe) { cv.style.opacity = op; this.op = op; }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      if (!SP) return S;
      const P0 = (x, y) => G.px(x, y);
      // --- le cuir qui se creuse autour des clous qu'on enfonce
      for (const cl of S.clous) {
        if (!cl.plante || cl.prof <= 0) continue;
        const [px, py] = P0(cl.pos[0], cl.pos[1]);
        const rr = (6 + 5 * cl.prof) * k;
        const gr = g.createRadialGradient(px, py, 0, px, py, rr);
        gr.addColorStop(0, 'rgba(22, 11, 4,' + (0.55 * cl.prof) + ')');
        gr.addColorStop(0.55, 'rgba(22, 11, 4,' + (0.3 * cl.prof) + ')');
        gr.addColorStop(1, 'rgba(22, 11, 4, 0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(px, py, rr, 0, TAU); g.fill();
      }
      // --- les mains et le maillet : où ils sont
      const Dm = this.mainD, Gm = this.mainG;
      const gl = S.gauche, md = S.droite;
      if (!Gm.sp.poses.lache && SP.gR) Gm.sp.poses.lache = SP.gR; // (la pince ouverte : prête en second)
      const pz = (p) => (p === 'lache' && !Gm.sp.poses.lache ? 'clou' : p);
      if (gl.vis) Gm.placer({ x: gl.x, y: gl.y, pose: pz(gl.pose), pose2: gl.pose2 && pz(gl.pose2), mix: gl.mix, levee: gl.lev, plie: 0 });
      // le maillet : sa tête au-dessus du clou ; le manche vers le poing (on recale la main deux fois)
      let aM = 0, tete = [md.cible[0], md.cible[1]];
      for (let it = 0; it < 3; it++) {
        aM = Dm.e.rot + MANCHE;
        const recul = [-Math.cos(aM) * md.recul, -Math.sin(aM) * md.recul];
        tete = [md.cible[0] + recul[0] + md.dehors * DEHORS_D[0], md.cible[1] + recul[1] + md.dehors * DEHORS_D[1]];
        const prise = [tete[0] - Math.cos(aM) * PRISE_M, tete[1] - Math.sin(aM) * PRISE_M];
        Dm.placer({ x: prise[0], y: prise[1], pose: 'maillet', levee: md.levM * 0.5 + 8, plie: 0 });
      }
      aM = Dm.e.rot + MANCHE;
      // --- les ombres (sur la carte)
      const ombre = (sp, X, Y, rot, lev) => {
        if (!sp || !sp.ombre) return;
        const om = sp.ombre, [px, py] = P0(X + OMB[0] * lev, Y + OMB[1] * lev);
        g.save();
        g.globalAlpha = 0.45 / (1 + lev * 0.02);
        g.translate(px, py);
        g.rotate(rot - (sp.angle || 0));
        g.drawImage(om.canvas, (om.x - sp.ax) * k, (om.y - sp.ay) * k, om.w * k, om.h * k);
        g.restore();
      };
      const poser = (sp, X, Y, rot, lev, alpha = 1, ech = 1) => {
        if (!sp) return;
        const [px, py] = P0(X, Y), s = k / sp.ppm, gr = (1 + lev * 0.0016) * ech;
        g.save();
        g.globalAlpha = alpha;
        g.translate(px, py);
        g.rotate(rot - (sp.angle || 0));
        g.scale(gr, gr);
        g.drawImage(sp.canvas, -sp.ax * k, -sp.ay * k, sp.canvas.width * s, sp.canvas.height * s);
        g.restore();
      };
      const elsD = Dm.elements(), elsG = gl.vis ? Gm.elements() : [];
      ombre(SP.ml, tete[0], tete[1], aM, md.levM);
      for (const e of elsD) ombre(e.sp, e.x, e.y, e.rot, e.levee);
      for (const e of elsG) ombre(e.sp, e.x, e.y, e.rot, e.levee);
      // --- un clou : son ombre et sa tige, puis sa tête (celui que tient la main gauche : la main entre les deux)
      const tige = (cl) => {
        const [bx, by] = P0(cl.pointe[0], cl.pointe[1]), [hx, hy] = P0(cl.tete[0], cl.tete[1]);
        const [sx, sy] = P0(cl.tete[0] + OMB[0] * cl.hz, cl.tete[1] + OMB[1] * cl.hz);
        g.save();
        g.globalAlpha = cl.alpha;
        g.strokeStyle = 'rgba(12, 6, 2, 0.34)'; g.lineCap = 'round'; g.lineWidth = 1.5 * k;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(sx, sy); g.stroke();
        g.fillStyle = 'rgba(12, 6, 2, 0.26)';
        g.beginPath(); g.ellipse(sx, sy, 5.2 * k, 4.6 * k, 0, 0, TAU); g.fill();
        if (cl.visible > 0.3) { // la tige : acier, un filet de lumière sur le côté éclairé
          g.lineCap = 'round';
          g.strokeStyle = '#5e6166'; g.lineWidth = 1.6 * k;
          g.beginPath(); g.moveTo(bx, by); g.lineTo(hx, hy); g.stroke();
          g.strokeStyle = 'rgba(235, 238, 240, 0.8)'; g.lineWidth = 0.45 * k;
          g.beginPath(); g.moveTo(bx - 0.35 * k, by - 0.35 * k); g.lineTo(hx - 0.35 * k, hy - 0.35 * k); g.stroke();
        }
        g.restore();
      };
      const teteDe = (cl) => {
        const im = this.imageTete(cl.j).img;
        if (!im || !im.width) return;
        const [hx, hy] = P0(cl.tete[0], cl.tete[1]);
        // la tête : une boîte de 40 px CSS, comme dans la case ; un peu plus grande quand elle est haute
        const ech = (1 + cl.hz * 0.004) * G.dpr, ang = Math.atan2(cl.dir[1], cl.dir[0]);
        g.save();
        g.globalAlpha = cl.alpha;
        g.translate(hx, hy);
        g.rotate(ang);
        g.scale(Math.cos(cl.penche), 1); // raccourcie dans le sens où elle penche
        g.rotate(-ang);
        const w = 40 * ech;
        g.drawImage(im, -w / 2, -w / 2, w, w);
        g.restore();
      };
      const tenu = S.clous.find((cl) => cl.j === gl.clou);
      for (const cl of S.clous) if (cl !== tenu) { tige(cl); teteDe(cl); }
      if (tenu) tige(tenu);
      for (const e of elsG) poser(e.sp, e.x, e.y, e.rot, e.levee, e.alpha);
      if (tenu) teteDe(tenu);
      // --- le maillet et la main droite, par-dessus tout
      poser(SP.ml, tete[0], tete[1], aM, md.levM, 1, 1 + 0.045 * md.ecrase);
      for (const e of elsD) poser(e.sp, e.x, e.y, e.rot, e.levee, e.alpha);
      // --- les bords fondus
      g.save();
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(this.fondu(), 0, 0);
      g.restore();
      return S;
    },

    /* à l'impact : la carte tressaille, le téléphone vibre, le son (plus aigu à mesure que le clou entre) */
    coup(j, b, n) {
      const k = b / n;
      son(k, 0.9 + 0.1 * Math.random());
      if (CO.vibrate) CO.vibrate(8);
      if (this.carte && this.carte.animate) {
        try { this.carte.animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(0.3px, ' + (0.6 + 0.5 * (1 - k)) + 'px)' }, { transform: 'translate(0, 0)' }], { duration: 110, easing: 'ease-out' }); } catch (e) { /* rien */ }
      }
      // la tête posée dans sa case, au dernier coup (à fleur)
      if (b >= n) this.poserTete(j);
    },
    /* la tête dans sa case, d'avance mais invisible : au dernier coup, on la montre (pas de mise en page pendant le geste) */
    preposer(j) {
      const c = this.cases[j];
      if (!c || c.querySelector('.clou-tete')) return;
      c.insertAdjacentHTML('beforeend', tete(this.index[j], this.carteId));
      const el = c.querySelector('.clou-tete');
      if (el) { el.style.opacity = '0'; el.setAttribute('data-attend', ''); }
    },
    poserTete(j) {
      const c = this.cases[j];
      if (!c) return;
      const el = c.querySelector('.clou-tete');
      if (!el) c.insertAdjacentHTML('beforeend', tete(this.index[j], this.carteId));
      else if (el.hasAttribute('data-attend')) { el.style.opacity = ''; el.removeAttribute('data-attend'); }
    },
    /* avant la première image : chaque sprite et chaque tête est dessiné une fois (téléversé, rastérisé), les têtes sont
       en place (cachées), la carte a son calque (elle tressaillera sans être repeinte) : pas d'à-coup pendant le geste */
    async chauffer() {
      const g = this.g, G = this.G;
      g.save();
      g.globalAlpha = 0.02;
      // (à la taille où ils seront dessinés : le navigateur garde une version par échelle)
      for (const sp of [SP.gP, SP.gR, SP.dP, SP.ml, SP.gB, SP.dB]) {
        if (!sp) continue;
        const s = G.k / sp.ppm;
        g.drawImage(sp.canvas, 0, 0, sp.canvas.width * s, sp.canvas.height * s);
        if (sp.ombre) g.drawImage(sp.ombre.canvas, 0, 0, sp.ombre.w * G.k, sp.ombre.h * G.k);
      }
      for (let n = 0; n < this.cases.length; n++) {
        const im = this.imageTete(n).img;
        if (im && im.width) g.drawImage(im, 0, 0, 40 * G.dpr, 40 * G.dpr);
      }
      g.restore();
      for (let j = 0; j < this.cases.length; j++) this.preposer(j);
      if (this.carte) { this.wc = this.carte.style.willChange; this.carte.style.willChange = 'transform'; }
      // puis trois instants du geste, dessinés pour de bon (invisibles) : la carte graphique prépare une fois pour
      // toutes ses programmes (images tournées, dégradés, traits, masque des bords) ; une image entre chaque
      const c0 = this.P.clous[0], raf = () => new Promise((r) => requestAnimationFrame(r));
      this.chauffe = true;
      for (const tt of [c0.t0 * 0.7, c0.impacts[Math.min(1, c0.n - 1)] + 0.03, c0.lache + 0.2]) { await raf(); this.dessiner(tt); }
      this.chauffe = false;
      await raf(); await raf();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.cv.width, this.cv.height);
    },
    finir() {
      for (let j = 0; j < this.cases.length; j++) this.poserTete(j); // (chaque tête est dans sa case, visible)
      this.cv.remove();
      if (this.carte) this.carte.style.willChange = this.wc || '';
      calculer = true;
      if (M()) M().calcul.reveil();
    },
  };

  /** le clouage : une case (ou plusieurs, à la suite) → Promise (résolue quand les mains sont parties) */
  async function enfoncer(cases, o = {}) {
    const liste = Array.isArray(cases) || (cases && typeof cases.length === 'number' && !cases.nodeType) ? Array.from(cases) : [cases];
    const index = Array.isArray(o.index) ? o.index : liste.map((c, k) => (o.index != null ? o.index + k : k));
    const carteId = o.carteId || 'carte';
    const coups = Array.isArray(o.coups) ? o.coups : o.coups ? liste.map(() => o.coups) : null;
    if (!liste.length || !liste[0]) return;
    // mouvement réduit (ou pas de moyens de calculer les mains) : la tête se pose, d'un coup de tampon
    const tampon = async () => {
      const t0 = now();
      for (let j = 0; j < liste.length; j++) {
        const c = liste[j];
        if (!c.querySelector('.clou-tete')) c.insertAdjacentHTML('beforeend', tete(index[j], carteId));
        const el = c.querySelector('.clou-tete');
        if (el && el.animate && !CO.reduced) el.animate([{ transform: 'scale(1.18)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 160, easing: 'ease-out' });
        son(1);
        if (j < liste.length - 1) await new Promise((r) => setTimeout(r, 180));
      }
      stats.dernier = { clous: liste.length, tampon: true, coups: [], impacts: [], plan: 0, images: 0, ms: 0, max: 0, duree: (now() - t0) / 1000, t0 };
    };
    if (CO.reduced || !M() || !R()) return tampon();
    const sp = await Promise.race([preparer(), new Promise((r) => setTimeout(() => r('lent'), 4500))]);
    if (!sp || sp === 'lent' || !SP) return tampon();
    const S = new Seance(liste, { index, carteId, coups });
    // si l'appli change de vue pendant le geste (la carte n'est plus là) : les têtes sont posées, on s'arrête
    const vue = S.carte && S.carte.closest && S.carte.closest('.view');
    S.vue = vue ? vue.dataset.view || vue.id : null;
    if (!ecoute && CO.on) { ecoute = true; CO.on('view', (v) => { if (active && active.vue && v !== active.vue) active.quitte = true; }); }
    active = S;
    try {
      S.installer();
      S.mainG = new (M().Main)(-1, { ppm: PPM, angle0: ANGLES.g, epaule: EPAULES.g });
      S.mainD = new (M().Main)(1, { ppm: PPM, angle0: ANGLES.d, epaule: EPAULES.d });
      S.mainG.sp = { bras: SP.gB, manche: null, poses: { clou: SP.gP, lache: SP.gR } };
      S.mainD.sp = { bras: SP.dB, manche: null, poses: { maillet: SP.dP } };
      await S.chargerImages();
      S.cv.style.opacity = '0.01'; // (presque rien : le canvas reste dans l'image, ce qu'on y dessine est bien envoyé)
      calculer = false;
      await S.chauffer();
    } catch (e) { // (un imprévu : pas de mains, le coup de tampon ; rien ne reste)
      console.warn('clouage', e);
      if (S.cv) S.cv.remove();
      if (S.carte) S.carte.style.willChange = S.wc || '';
      calculer = true;
      if (active === S) active = null;
      for (const c of liste) { const el = c.querySelector('.clou-tete[data-attend]'); if (el) el.remove(); }
      return tampon();
    }
    const mes = { clous: liste.length, coups: S.P.clous.map((c) => c.n), impacts: S.P.clous.map((c) => c.impacts), plan: S.P.fin, images: 0, ms: 0, max: 0, duree: 0, t0: 0 };
    return new Promise((resolve) => {
      let t0 = (mes.t0 = now()), avant = t0;
      let der = -1, fini = false;
      const faits = new Set();
      const finir = () => { fini = true; S.finir(); if (active === S) active = null; mes.duree = der; stats.dernier = mes; resolve(); };
      const pas = () => {
        if (fini) return;
        const ta = now();
        // (l'onglet caché, puis revenu : on reprend où on en était, sans rattraper les coups d'un seul coup)
        if (ta - avant > 250) t0 += ta - avant - 16;
        avant = ta;
        const t = (ta - t0) / 1000;
        // la carte a disparu (une autre vue de l'appli, ou elle n'est plus affichée) : les têtes sont posées, on s'arrête là
        if (S.quitte || (S.carte && !S.carte.getClientRects().length)) { der = t; finir(); return; }
        try { S.caler(); S.dessiner(t); } catch (e) { console.warn('clouage', e); der = t; finir(); return; }
        const dt = now() - ta;
        mes.images++; mes.ms += dt; if (dt > mes.max) mes.max = dt;
        // les impacts passés depuis la dernière image
        for (const c of S.P.clous) {
          c.impacts.forEach((ti, b) => {
            const cle = c.i + ':' + b;
            if (ti <= t && ti > der - 0.001 && !faits.has(cle)) { faits.add(cle); S.coup(c.i, b + 1, c.n); }
          });
        }
        der = t;
        if (t >= S.P.fin) { finir(); return; }
        requestAnimationFrame(pas);
      };
      requestAnimationFrame(pas);
    });
  }

  /* banc d'essai : dessine l'instant t d'un clouage, sans l'animer (captures) → Promise<{ canvas, etat }> */
  async function figer(cases, o = {}, t = 0) {
    const liste = Array.isArray(cases) ? cases : [cases];
    const index = Array.isArray(o.index) ? o.index : liste.map((c, k) => k);
    await preparer();
    await pretTout;
    const S = new Seance(liste, { index, carteId: o.carteId || 'carte', coups: o.coups ? liste.map(() => o.coups) : null });
    S.installer();
    S.mainG = new (M().Main)(-1, { ppm: PPM, angle0: ANGLES.g, epaule: EPAULES.g });
    S.mainD = new (M().Main)(1, { ppm: PPM, angle0: ANGLES.d, epaule: EPAULES.d });
    S.mainG.sp = { bras: SP.gB, manche: null, poses: { clou: SP.gP, lache: SP.gR } };
    S.mainD.sp = { bras: SP.dB, manche: null, poses: { maillet: SP.dP } };
    await S.chargerImages();
    // les têtes déjà posées à cet instant
    const etat = S.etat(t);
    for (const j of etat.poses) S.poserTete(j);
    S.caler();
    S.dessiner(t);
    return { canvas: S.cv, etat, plan: S.P, seance: S };
  }

  const stats = { dernier: null }; // le dernier clouage : { clous, coups, plan, duree (s), images, ms (JS, total), max (ms) }
  CO.Clouage = { tete, enfoncer, preparer, figer, modele, FINITIONS: Object.keys(FINIS), FORMES, plan, stats };
})();
