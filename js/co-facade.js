/* ==========================================================================
   Cordo 63 — la devanture animée de l'accueil : 6 rue Verdier-Latour, à l'angle
   « J'inverse l'atelier et la boutique avec l'ambition que l'on me voie travailler.
     Je suis ma vitrine. » (Clément Petit, 2023) : derrière les vitres, c'est lui le spectacle.
   SVG dessiné en JS (viewBox 0 0 400 560, 1 unité ≈ 1 cm), d'après la vue de la rue : un immeuble
   d'angle enduit crème, fenêtres encadrées de pierre de Volvic, chaîne d'angle, volets persiennés
   vert sauge ; la boutique commence à l'angle : corniche saillante, bandeau vert clair aux grandes
   lettres « CORDONNERIE » dorées en relief (dessinées ici en chemins), pilastres de Volvic entre les
   baies, menuiseries et soubassements verts, porte vitrée dans la dernière baie ; à droite, la porte
   de l'immeuble. Derrière les vitres, l'atelier éclairé (mur de pierre, finisseuse rouge, presse
   bleue, établi au tapis de découpe vert) et Clément qui frappe une semelle ; au coin, le poteau
   du sens interdit ; devant, l'ardoise « Déposez vos paires ! ».
   L'enseigne (la Jordan en bois dans son cadre d'acier, pointe en bas) est dessinée par un autre
   module (js/co-enseigne.js, ses images) et posée par-dessus, au bout gauche du bandeau : on lui réserve sa place
   (zoneEnseigne), on dessine sa platine murale et son ombre portée (ombreEnseigne).
   Les calques, du fond vers l'avant :
     monde (ciel lointain, retour de l'angle, mur, devanture, trottoir) → voile du soir → lueurs
     de la rue → quadrillage fantôme → intérieurs éclairés → vinyles collés aux vitres → reflets
     (découpés aux vitres) → vie (lumière de la porte) → devant (poteau, ardoise) → zones à toucher ;
     par-dessus le SVG, un calque HTML : la chaleur (la lumière dans laquelle on entre)
   Cadrage : toute la hauteur, le bas collé au bas de l'hôte ; sur un écran large, la rue déborde
   sur les côtés ; sur un écran plus haut que la scène, c'est l'immeuble qui déborde en haut.
   Le haut de la scène (≈ 110 unités, 80 px) reste décoratif : l'enseigne des horaires de l'appli
   pend par-dessus.
   Textes : jamais de famille de police en dur, les variables de l'appli (--large, --sans, --stylo,
   --chiffres) ; jamais de transformation CSS sur un <text> (Safari) : on anime leur <g>.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const S = (tag, attrs, parent) => CO.svg(tag, attrs, parent);
  const f = CO.f; // arrondi au centième

  const P = {
    enduit: '#D2C6AB', enduitOmbre: '#B3A68A',
    volvic: '#57524C', volvicSombre: '#433F3A', volvicClair: '#736D65',
    volet: '#93A897', voletSombre: '#6F8474', voletClair: '#B5C6B7',
    vert: '#86A873', vertClair: '#A6C394', vertOmbre: '#6A8B5B', vertNoir: '#46603D',
    zinc: '#A9ADAA', zincClair: '#D9DCD8', corniche: '#CFC6B2', cornicheOmbre: '#A69C86',
    verre: '#1B211F',
    rouge: '#D3262B', rougeClair: '#F0514C',
    tapis: '#2E684B', tapisClair: '#8BC2A1',
    tablier: '#8E5F33', tablierSombre: '#65421F', tablierClair: '#B7844F',
    tshirt: '#2B2F34', jean: '#2F3B54',
    peau: '#D8A07C', peauOmbre: '#B07352',
    barbe: '#5A3B26', barbeClair: '#86603F', cheveux: '#3B281B', cheveuxClair: '#76573C',
    nuit: '#0D1830',
  };
  // les polices : celles de l'appli, par ses variables (repli système si elles manquent)
  const FONTE = {
    large: 'font-family:var(--large, system-ui, sans-serif)',
    sans: 'font-family:var(--sans, system-ui, sans-serif)',
    stylo: 'font-family:var(--stylo, cursive)',
    chiffres: "font-family:var(--chiffres, 'Arial Narrow', sans-serif)",
  };

  /* ---------- petites briques ---------- */
  const dR = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
  const dDisc = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
  const dEll = (cx, cy, rx, ry) => `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0z`;
  const dRR = (x, y, w, h, r) => `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}z`;
  const dPoly = (pts) => 'M' + pts.map(([x, y]) => f(x) + ' ' + f(y)).join('L') + 'Z';
  /** Formes de même couleur fusionnées en un seul chemin (peu d'éléments : le téléphone respire) */
  function seau() {
    const m = new Map();
    return {
      add(c, d) { (m.get(c) || m.set(c, []).get(c)).push(d); },
      flush(par, extra = {}) { m.forEach((ds, c) => S('path', { d: ds.join(''), fill: c, ...extra }, par)); m.clear(); },
    };
  }
  /** Traits de même couleur et de même épaisseur fusionnés */
  function traits() {
    const m = new Map();
    return {
      add(c, w, d) { const k = c + '|' + w; (m.get(k) || m.set(k, []).get(k)).push(d); },
      flush(par, extra = {}) {
        m.forEach((ds, k) => { const [c, w] = k.split('|'); S('path', { d: ds.join(''), fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'round', ...extra }, par); });
        m.clear();
      },
    };
  }

  /* ---------- textures (canvas → image, une fois) ---------- */
  const TEX = {};
  function texture(nom, N, dessin) {
    if (TEX[nom]) return TEX[nom];
    const c = document.createElement('canvas');
    c.width = c.height = N;
    dessin(c.getContext('2d'), N);
    return (TEX[nom] = c.toDataURL());
  }
  // l'enduit : un bruit doux, raccordable (quatre échantillons mêlés)
  const texEnduit = () => texture('enduit', 160, (x, N) => {
    const img = x.createImageData(N, N), n1 = CO.noise2(21), n2 = CO.noise2(22), n3 = CO.noise2(23);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N;
      const s = (a, b) => n1(a * 5, b * 5) * 0.5 + n2(a * 17, b * 17) * 0.33 + n3(a * 47, b * 47) * 0.17;
      const val = s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
      const k = (j * N + i) * 4, t = 0.5 + val * 0.5;
      img.data[k] = 108 + t * 72; img.data[k + 1] = 98 + t * 66; img.data[k + 2] = 80 + t * 54;
      img.data[k + 3] = 20 + Math.abs(val) * 52;
    }
    x.putImageData(img, 0, 0);
  });
  // le grain : piqué de la pierre bouchardée, de l'asphalte
  const texGrain = () => texture('grain', 96, (x, N) => {
    const r = CO.rng(7);
    for (let i = 0; i < 1500; i++) {
      const light = r() < 0.4;
      x.fillStyle = light ? `rgba(215,212,204,${0.18 + r() * 0.25})` : `rgba(18,18,16,${0.2 + r() * 0.3})`;
      const px = r() * N, py = r() * N, s = 0.5 + r() * 1.1;
      x.fillRect(px, py, s, s);
      if (px < 2) x.fillRect(px + N, py, s, s);
      if (py < 2) x.fillRect(px, py + N, s, s);
    }
  });

  /* ---------- « CORDONNERIE » : des capitales à empattements, étroites, dessinées en chemins
     (pas de police à charger, même rendu partout). Hauteur de capitale 100 ; contours dans le
     sens horaire, contreformes (les « trous » de O, D, R) dans l'autre : règle nonzero. ---------- */
  const EMP = { h: 4.6, br: 4.2 }; // empattement : épaisseur, congé
  function plume(ox, oy, k) {
    const P = (x, y) => f(ox + x * k) + ' ' + f(oy + y * k);
    return {
      P,
      A: (rx, ry, large, sens, x, y) => 'A' + f(rx * k) + ' ' + f(ry * k) + ' 0 ' + large + ' ' + sens + ' ' + P(x, y),
      Q: (cx, cy, x, y) => 'Q' + P(cx, cy) + ' ' + P(x, y),
      C: (ax, ay, bx, by, x, y) => 'C' + P(ax, ay) + ' ' + P(bx, by) + ' ' + P(x, y),
      poly: (pts) => 'M' + pts.map(([x, y]) => P(x, y)).join('L') + 'Z',
    };
  }
  /** Un fût vertical et ses empattements (hg, hd : en haut à gauche, à droite ; bg, bd : en bas), congés compris */
  function fut(pl, x0, w, { hg = 7.5, hd = 7.5, bg = 7.5, bd = 7.5 } = {}) {
    const { P, Q } = pl, x1 = x0 + w, H = 100, e = EMP.h;
    const c = (l) => Math.min(EMP.br, l);
    let d = 'M' + P(x0 - hg, 0) + 'L' + P(x1 + hd, 0);
    if (hd) d += 'L' + P(x1 + hd, e) + 'L' + P(x1 + c(hd), e) + Q(x1, e, x1, e + c(hd));
    if (bd) d += 'L' + P(x1, H - e - c(bd)) + Q(x1, H - e, x1 + c(bd), H - e) + 'L' + P(x1 + bd, H - e) + 'L' + P(x1 + bd, H);
    else d += 'L' + P(x1, H);
    d += 'L' + P(x0 - bg, H);
    if (bg) d += 'L' + P(x0 - bg, H - e) + 'L' + P(x0 - c(bg), H - e) + Q(x0, H - e, x0, H - e - c(bg));
    if (hg) d += 'L' + P(x0, e + c(hg)) + Q(x0, e, x0 - c(hg), e) + 'L' + P(x0 - hg, e);
    else d += 'L' + P(x0, 0);
    return d + 'Z';
  }
  const GLYPHES = {
    C: { w: 60, d: (pl) => { const { P, A, Q } = pl;
      return 'M' + P(53.22, 82.91) + A(29, 51.2, 1, 1, 53.22, 17.09) + 'L' + P(43.1, 21.2) + A(15.8, 44.8, 1, 0, 43.1, 78.8) + 'Z' +
        'M' + P(49.5, 12.8) + 'L' + P(55, 10.5) + 'L' + P(55.5, 32) + 'L' + P(52.8, 32) + Q(51, 23.5, 47.5, 20.5) + 'Z' +
        'M' + P(47.5, 79.5) + Q(52, 77.5, 53.5, 69) + 'L' + P(55.5, 69) + 'L' + P(55.2, 84) + 'L' + P(49.5, 86) + 'Z'; } },
    O: { w: 64, d: ({ P, A }) => 'M' + P(2, 50) + A(30, 51.2, 1, 1, 62, 50) + A(30, 51.2, 1, 1, 2, 50) + 'Z' +
        'M' + P(15.5, 50) + A(16.5, 44.8, 1, 0, 48.5, 50) + A(16.5, 44.8, 1, 0, 15.5, 50) + 'Z' },
    R: { w: 60, d: (pl) => { const { P, A } = pl;
      return fut(pl, 7, 14, { hd: 0 }) +
        'M' + P(14, 0) + 'L' + P(28, 0) + A(25, 27.5, 0, 1, 28, 55) + 'L' + P(14, 55) + 'Z' +
        'M' + P(21, 6.5) + 'L' + P(21, 48.5) + 'L' + P(28, 48.5) + A(12, 21, 0, 0, 28, 6.5) + 'Z' +
        pl.poly([[26.5, 49], [40.5, 49], [58.5, 100], [44.5, 100]]) + pl.poly([[41, 95.4], [62, 95.4], [62, 100], [41, 100]]); } },
    D: { w: 64, d: (pl) => { const { P, A } = pl;
      return fut(pl, 7, 14, { hd: 0, bd: 0 }) +
        'M' + P(14, 0) + 'L' + P(29, 0) + A(31, 50, 0, 1, 29, 100) + 'L' + P(14, 100) + 'Z' +
        'M' + P(21, 6.5) + 'L' + P(21, 93.5) + 'L' + P(29, 93.5) + A(17.5, 43.5, 0, 0, 29, 6.5) + 'Z'; } },
    N: { w: 62, d: (pl) => fut(pl, 6, 6.5, { hd: 0 }) + pl.poly([[6, 0], [21, 0], [56.5, 100], [42, 100]]) +
        fut(pl, 50, 6.5, { bg: 0, bd: 0 }) + pl.poly([[6, 0], [24, 0], [24, EMP.h], [6, EMP.h]]) },
    E: { w: 54, d: (pl) => { const { P, Q } = pl;
      return fut(pl, 8, 14, { hd: 0, bd: 0 }) +
        pl.poly([[20, 0], [46.5, 0], [46.5, 7], [20, 7]]) +
        'M' + P(41, 0) + 'L' + P(46.5, 0) + 'L' + P(46.5, 21) + 'L' + P(44.6, 21) + Q(43.4, 10.5, 38, 7) + 'Z' +
        pl.poly([[20, 46.5], [40, 46.5], [40, 53], [20, 53]]) +
        'M' + P(36.4, 39.5) + 'L' + P(40, 39.5) + 'L' + P(40, 60) + 'L' + P(36.4, 60) + Q(36.4, 54, 33, 53) + 'L' + P(33, 46.5) + Q(36.4, 45.5, 36.4, 39.5) + 'Z' +
        pl.poly([[20, 93], [48, 93], [48, 100], [20, 100]]) +
        'M' + P(42, 93) + Q(44.2, 89, 45.8, 77) + 'L' + P(48.5, 77) + 'L' + P(48.5, 100) + 'L' + P(42, 100) + 'Z'; } },
    I: { w: 31, d: (pl) => fut(pl, 8.5, 14) },
  };
  /* ---------- « CORDO63 », le logo : grotesque étendue, monoligne (des traits, pas une police) ---------- */
  const LOGO = {
    C: { w: 110, d: ({ P, A }) => 'M' + P(97.1, 17.9) + A(55, 50, 1, 0, 97.1, 82.1) },
    O: { w: 110, d: ({ P, A }) => 'M' + P(0, 50) + A(55, 50, 1, 0, 110, 50) + A(55, 50, 1, 0, 0, 50) },
    R: { w: 100, d: ({ P, A }) => 'M' + P(0, 100) + 'L' + P(0, 0) + 'L' + P(62, 0) + A(25, 26, 0, 0, 62, 52) + 'L' + P(0, 52) + 'M' + P(58, 52) + 'L' + P(100, 100) },
    D: { w: 108, d: ({ P, A }) => 'M' + P(0, 0) + 'L' + P(0, 100) + 'L' + P(50, 100) + A(58, 50, 0, 0, 50, 0) + 'Z' },
    6: { w: 90, d: ({ P, A, C }) => 'M' + P(10, 64) + A(35, 35, 1, 0, 80, 64) + A(35, 35, 1, 0, 10, 64) + C(10, 26, 34, 2, 76, 6) },
    3: { w: 88, d: ({ P, C }) => 'M' + P(10, 5) + 'L' + P(80, 5) + 'L' + P(42, 42) + C(72, 39, 88, 56, 86, 73) + C(84, 93, 64, 101, 45, 100) + C(30, 99, 17, 93, 9, 85) },
  };

  /* ---------- une basket de profil (étagères, établi) : semelle, tige, renforts, bande ---------- */
  function basket(sk, x, y, L, c, dir = 1, sens = 1) { // sens = -1 : retournée, semelle en l'air
    const X = (u) => f(x + dir * u * L), Y = (v) => f(y - sens * v * L);
    const M = (pts) => 'M' + pts.map(([u, v]) => X(u) + ' ' + Y(v)).join('L') + 'Z';
    sk.add(c.semelle, `M${X(0)} ${Y(0)}L${X(0.97)} ${Y(0)}Q${X(1.03)} ${Y(0.05)} ${X(0.98)} ${Y(0.12)}L${X(0.01)} ${Y(0.12)}Z`);
    sk.add(c.tige, `M${X(0.01)} ${Y(0.11)}L${X(0.02)} ${Y(0.5)}Q${X(0.03)} ${Y(0.57)} ${X(0.13)} ${Y(0.56)}L${X(0.34)} ${Y(0.52)}Q${X(0.45)} ${Y(0.47)} ${X(0.58)} ${Y(0.34)}Q${X(0.74)} ${Y(0.24)} ${X(0.9)} ${Y(0.21)}Q${X(1.0)} ${Y(0.18)} ${X(0.98)} ${Y(0.11)}Z`);
    sk.add(c.renfort, M([[0.01, 0.11], [0.02, 0.36], [0.2, 0.33], [0.26, 0.11]]) + M([[0.7, 0.11], [0.72, 0.25], [0.9, 0.21], [0.99, 0.16], [0.98, 0.11]]));
    sk.add(c.bande, `M${X(0.2)} ${Y(0.18)}Q${X(0.45)} ${Y(0.24)} ${X(0.66)} ${Y(0.33)}Q${X(0.46)} ${Y(0.3)} ${X(0.24)} ${Y(0.24)}Z`);
  }
  const PAIRES = [
    { tige: '#F2EEE6', renfort: '#C8262C', bande: '#1E1E20', semelle: '#FBFAF6' },
    { tige: '#1F1F22', renfort: '#C8262C', bande: '#F2EEE6', semelle: '#F4F1EA' },
    { tige: '#F2EEE6', renfort: '#6FA6D6', bande: '#6FA6D6', semelle: '#FBFAF6' },
    { tige: '#E8E2D4', renfort: '#2F6A4C', bande: '#2F6A4C', semelle: '#D9B98A' },
    { tige: '#8E8C88', renfort: '#3A3A3C', bande: '#F2EEE6', semelle: '#F4F1EA' },
    { tige: '#E07A2E', renfort: '#1F1F22', bande: '#1F1F22', semelle: '#F4F1EA' },
    { tige: '#F2EEE6', renfort: '#E9B04A', bande: '#1E1E20', semelle: '#FBFAF6' },
  ];

  /* ---------- le gond qui grince quand on pousse la porte en grand : un son à nous, ajouté à la palette ---------- */
  function sonsPorte() {
    if (!CO.sfx || !CO.sfx.ajouter || (CO.sfx.existe && CO.sfx.existe('porte-grince'))) return;
    CO.sfx.ajouter('porte-grince', (c, o, t, opts, s) => {
      const dur = opts.dur || 0.5;
      s.tone(c, o, t, { f: 190, f2: 320, glide: dur, type: 'triangle', a: 0.05, d: 0.14, hold: dur * 0.75, v: 0.02 });
      s.tone(c, o, t + 0.03, { f: 610, f2: 820, glide: dur * 0.9, type: 'triangle', a: 0.04, d: 0.1, hold: dur * 0.6, v: 0.012 });
      let tt = t, pas = 0.05; // le frottement par à-coups : le bois qui colle et décolle sur le gond
      while (tt < t + dur) { s.noise(c, o, tt, { f: s.rnd(900, 1700), q: 5, a: 0.001, d: 0.014, v: 0.03 }); tt += pas; pas = Math.max(0.017, pas * 0.88); }
    }, { gap: 250 });
  }

  /* ======================================================================
     Construction
     ====================================================================== */
  async function create(host, opts = {}) {
    sonsPorte();
    { // les polices de l'appli (par ses variables) : on attend un peu qu'elles arrivent, sinon repli
      const cs = getComputedStyle(host);
      const fam = (v) => (cs.getPropertyValue(v) || '').trim();
      const charge = [['700', '--large'], ['600', '--sans'], ['400', '--stylo'], ['700', '--chiffres']]
        .filter(([, v]) => fam(v)).map(([w, v]) => document.fonts.load(`${w} 12px ${fam(v)}`).catch(() => null));
      try { await Promise.race([Promise.all(charge), CO.wait(1200)]); } catch (e) { /* repli */ }
    }
    const R = CO.rng(opts.graine || 0x63);
    const svg = S('svg', {
      viewBox: '0 0 400 560', class: 'co-facade', preserveAspectRatio: 'xMidYMax meet', role: 'img',
      'aria-label': "La devanture de Cordo 63, à l'angle de la rue Verdier-Latour : derrière les vitres, l'atelier éclairé et Clément au travail",
    });
    svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none';
    { // le décor déborde de la scène : l'hôte le coupe (jamais de barre de défilement) ; il porte aussi un calque HTML
      const cs = getComputedStyle(host);
      if (cs.overflowX === 'visible' || cs.overflowY === 'visible') host.style.overflow = 'hidden';
      if (cs.position === 'static') host.style.position = 'relative';
    }
    S('style', {}, svg).textContent =
      '.co-facade .cf-hit{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}' +
      '.co-facade .cf-hit:focus{outline:none}' +
      '.co-facade .cf-hit:focus-visible{fill:#FFE9B0;fill-opacity:.12;stroke:#F4C75E;stroke-width:1.8;stroke-dasharray:5 3}';
    const defs = S('defs', {}, svg);
    const U = (p) => CO.uid('cf' + p);
    function degrade(tag, stops, o) {
      const id = U('d');
      const g = S(tag, { id, ...o }, defs);
      stops.forEach(([off, c, a]) => S('stop', { offset: off, 'stop-color': c, 'stop-opacity': a == null ? 1 : a }, g));
      return `url(#${id})`;
    }
    const lin = (stops, o = {}) => degrade('linearGradient', stops, { x1: 0, y1: 0, x2: 0, y2: 1, ...o });
    const linU = (y1, y2, stops, x1 = 0, x2 = 0) => degrade('linearGradient', stops, { gradientUnits: 'userSpaceOnUse', x1, y1, x2, y2 });
    const rad = (stops, o = {}) => degrade('radialGradient', stops, o);
    const rect = (p, x, y, w, h, fill, extra = {}) => S('rect', { x: f(x), y: f(y), width: f(w), height: f(h), fill, ...extra }, p);
    const path = (p, d, fill, extra = {}) => S('path', { d, fill, ...extra }, p);
    const G = (p, extra) => S('g', extra || {}, p);
    const texte = (p, txt, x, y, taille, style, extra = {}) => {
      const t = S('text', { x: f(x), y: f(y), 'font-size': taille, style, ...extra }, p);
      t.textContent = txt;
      return t;
    };
    const motif = (url, taille) => {
      const id = U('m');
      S('image', { href: url, width: taille, height: taille, preserveAspectRatio: 'none' }, S('pattern', { id, width: taille, height: taille, patternUnits: 'userSpaceOnUse' }, defs));
      return `url(#${id})`;
    };
    const ENDUIT = motif(texEnduit(), 160), GRAIN = motif(texGrain(), 48);

    /* ---------- la mise en page (unités de la scène) ---------- */
    const SOL = 478; // le trottoir, au pied de la devanture
    const VERRE = [250.5, 394]; // le haut et le bas des vitres
    const carreaux = (x0, x1, n, bord = 2.5, meneau = 3) => {
      const w = (x1 - x0 - 2 * bord - (n - 1) * meneau) / n;
      return Array.from({ length: n }, (_, i) => [x0 + bord + i * (w + meneau), w]);
    };
    const VG = carreaux(24, 184, 4), VD = carreaux(208, 275, 2); // l'atelier (à gauche), la boutique (entre le pilastre et la porte)
    const PANES = VG.concat(VD).map(([x, w]) => [x, VERRE[0], w, VERRE[1] - VERRE[0]]);
    const IMPOSTE = [279, 250.5, 71, 15.5]; // la vitre au-dessus de la porte
    const ENS = { x: 22, y: 146, w: 70, h: 112 }; // la place de l'enseigne, au bout gauche du bandeau
    const ANCRE = { x: 90, y: 170 }; // là où son bras entre dans le bandeau
    // le retour de l'angle, en perspective : il fuit vers un point à gauche, à hauteur des yeux
    const FUITE = [-760, 316];
    const RET = (t, y) => [FUITE[0] * t, y + (FUITE[1] - y) * t];
    const quadR = (t0, t1, y0, y1) => dPoly([RET(t0, y0), RET(t1, y0), RET(t1, y1), RET(t0, y1)]);

    /* ---------- les calques ---------- */
    const monde = G(svg, { class: 'cf-monde' });
    const voile = rect(svg, -1400, -1400, 3800, 1980, linU(500, 548, [[0, P.nuit], [1, P.nuit, 0]]), { opacity: 0, class: 'cf-voile', 'pointer-events': 'none' });
    const lueurs = G(svg, { class: 'cf-lueurs', 'pointer-events': 'none', opacity: 0 }); // le soir : la lanterne, les vitrines sur le trottoir
    const quadr = G(svg, { class: 'cf-quadrillage', 'pointer-events': 'none' });
    const dedans = G(svg, { class: 'cf-dedans', 'pointer-events': 'none' });
    const vinyles = G(svg, { class: 'cf-vinyles', 'pointer-events': 'none' });
    const reflets = G(svg, { class: 'cf-reflets', 'pointer-events': 'none' });
    const vie = G(svg, { class: 'cf-vie', 'pointer-events': 'none' });
    const devant = G(svg, { class: 'cf-devant', 'pointer-events': 'none' });
    const touches = G(svg, { class: 'cf-touches' });
    // le soir, ce qui est devant (au-dessus du voile de la rue) a son propre voile : ses couleurs mêlées au bleu nuit
    const nuitF = U('nf');
    const nuitM = S('feColorMatrix', { type: 'matrix', values: '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0' },
      S('filter', { id: nuitF, x: '-5%', y: '-5%', width: '110%', height: '110%', 'color-interpolation-filters': 'sRGB' }, defs));
    const VOILE = CO.hex2rgb(P.nuit).map((v) => v / 255);
    let voileK = 0, voileTour = 0;
    function voileDevant(k) {
      voileK = k;
      const a = (1 - k).toFixed(4), c = VOILE.map((v) => (v * k).toFixed(4));
      nuitM.setAttribute('values', `${a} 0 0 0 ${c[0]} 0 ${a} 0 0 ${c[1]} 0 0 ${a} 0 ${c[2]} 0 0 0 1 0`);
      if (k > 0.002) devant.setAttribute('filter', `url(#${nuitF})`); else devant.removeAttribute('filter');
    }

    /* ======================================================================
       Le monde : au loin, le retour de l'angle, le mur, l'étage
       ====================================================================== */
    // au-delà de l'angle (écrans larges) : l'autre rue qui part, le ciel, le puy de Dôme dans la brume
    const loin = G(monde, { class: 'cf-lointain' });
    rect(loin, -1400, -1400, 1402, 1720, linU(-300, 316, [[0, '#AFC4D2'], [0.7, '#D5DEDF'], [1, '#E6E2D6']]));
    path(loin, 'M-900 318C-800 314 -740 300 -700 276C-676 262 -660 256 -646 256C-632 256 -614 263 -590 278C-556 300 -520 314 -430 318Z', '#A9B7BC', { opacity: 0.6 });
    rect(loin, -1400, 316, 1402, 164, linU(316, 480, [[0, '#9E9B92'], [1, '#8F8C84']]));
    // le retour de l'immeuble sur l'autre rue : enduit à l'ombre, fenêtres en fuite, la boutique qui tourne l'angle
    const retour = G(monde, { class: 'cf-retour' });
    {
      const TM = 0.3;
      path(retour, quadR(0, TM, -1400, SOL), '#B7AA8F');
      path(retour, quadR(0, TM, -1400, SOL), ENDUIT, { opacity: 0.7 });
      const rb = seau();
      [128, -172, -472].forEach((appui) => [[0.07, 0.11], [0.19, 0.23]].forEach(([t0, t1]) => {
        rb.add(P.volvicSombre, quadR(t0 - 0.008, t1 + 0.008, appui - 156, appui + 5));
        rb.add('#3B464D', quadR(t0, t1, appui - 150, appui));
        rb.add(P.voletSombre, quadR(t0 - 0.03, t0 - 0.01, appui - 150, appui) + quadR(t1 + 0.01, t1 + 0.03, appui - 150, appui));
      }));
      // la boutique, sur son côté : corniche, bandeau, vitres, soubassements, jusqu'à un pilastre
      rb.add(P.corniche, quadR(0, 0.14, 146, 162));
      rb.add(P.vertOmbre, quadR(0, 0.13, 162, 242));
      rb.add('#56504A', quadR(0.13, 0.145, 162, SOL));
      rb.add(P.vertOmbre, quadR(0, 0.13, 242, 250.5));
      rb.add('#241D17', quadR(0, 0.13, 250.5, 394));
      rb.add(P.vertOmbre, quadR(0, 0.13, 394, 474));
      [0.035, 0.07, 0.1].forEach((t) => rb.add(P.vertNoir, quadR(t, t + 0.004, 250.5, 474)));
      rb.add('#4A4540', quadR(0, 0.145, 474, SOL));
      // la chaîne d'angle vue de côté
      for (let y = 146, k = 0; y > -1400; k++) { const h = 24 + ((k * 7) % 5); rb.add(k % 2 ? '#4E4A44' : '#46423D', quadR(0, k % 2 ? 0.012 : 0.02, y - h, y - 1.2)); y -= h; }
      rb.flush(retour);
      // un peu de la lumière de l'atelier, par la vitre du retour
      path(retour, quadR(0.004, 0.126, 262, 390), lin([[0, '#FFC98A', 0.1], [0.6, '#E9A460', 0.34], [1, '#8A5230', 0.12]]));
      // le sol de l'autre rue, sous le retour
      path(retour, dPoly([[0, SOL], RET(TM, SOL), [RET(TM, SOL)[0], SOL]]), '#A29E95');
    }

    // le mur de l'immeuble : enduit crème (il continue à droite sur les écrans larges)
    const mur = G(monde, { class: 'cf-mur' });
    rect(mur, 0, -1400, 1400, 1880, linU(-300, 480, [[0, '#DACFB6'], [0.6, P.enduit], [1, '#C4B79C']]));
    rect(mur, 0, -1400, 1400, 1880, ENDUIT);
    // la chaîne d'angle en pierre de Volvic (harpée), la descente d'eau le long de l'angle
    {
      const qb = seau(), qj = [];
      for (let y = 146, k = 0; y > -1400; k++) {
        const h = 24 + ((k * 7) % 5), w = k % 2 ? 14 : 22;
        qb.add(k % 3 ? P.volvic : '#4E4A44', dR(0, y - h, w, h - 1.2));
        qj.push(`M0 ${f(y - h - 0.6)}H${w}`);
        y -= h;
      }
      qb.flush(mur);
      rect(mur, 0, -1400, 22, 1546, GRAIN, { opacity: 0.45 });
      path(mur, qj.join(''), 'none', { stroke: '#8E8A80', 'stroke-width': 1 });
      rect(mur, 0, -1400, 1.4, 1546, '#fff', { opacity: 0.12 });
    }
    rect(mur, 3, -1400, 5, 1546, lin([[0, '#7F8381'], [0.5, '#AEB2AF'], [1, '#727674']], { x2: 1, y2: 0 }));
    for (let y = -1340; y < 140; y += 118) rect(mur, 1.6, y, 8, 3.4, '#5F6260');

    // l'étage : fenêtres à encadrement de Volvic, volets persiennés vert sauge (ouverts, fermés, un balconnet)
    const etage = G(monde, { class: 'cf-etage' });
    const vb = seau(), vt = traits();
    function persienne(x, y, w, h) {
      vb.add(P.volet, dR(x, y, w, h));
      for (let yy = y + 5; yy < y + h - 4; yy += 3.8) {
        vt.add(P.voletSombre, 1.4, `M${f(x + 2.6)} ${f(yy + 1.1)}H${f(x + w - 2.6)}`);
        vt.add(P.voletClair, 0.6, `M${f(x + 2.6)} ${f(yy)}H${f(x + w - 2.6)}`);
      }
      vt.add(P.voletSombre, 1.1, `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`);
      vt.add(P.voletSombre, 0.8, `M${f(x + 2.6)} ${f(y + 2.6)}V${f(y + h - 2.6)}M${f(x + w - 2.6)} ${f(y + 2.6)}V${f(y + h - 2.6)}`);
      vb.add('#000000', dR(x + w - 1.4, y, 1.4, h));
    }
    /** Une fenêtre de l'étage (x : la baie ; appui en y ; h : sa hauteur) — fermée, ouverte à balconnet, ou entrebâillée */
    function fenetre(x, appui, w, h, mode) {
      const y = appui - h, E = 7;
      vb.add(P.volvicSombre, dR(x - E, y - E, w + 2 * E, h + E));
      vb.add(P.volvic, dR(x - E - 2.5, appui, w + 2 * E + 5, 5.5));
      vb.add('#8B8A84', dR(x - E - 2.5, appui, w + 2 * E + 5, 1.2));
      vb.add('#000000', dR(x - E - 2.5, appui + 5.5, w + 2 * E + 5, 2.4));
      if (mode === 'fermee') { persienne(x, y, w / 2, h); persienne(x + w / 2, y, w / 2, h); return; }
      vb.add('#3E4A52', dR(x, y, w, h));
      vb.add('#EEEAE0', dR(x + 2, y + 2, w - 4, 3));
      vb.add('#D9D3C6', dR(x + w / 2 - 1.5, y, 3, h));
      vb.add('#E4DFD3', dR(x, y, 2.5, h) + dR(x + w - 2.5, y, 2.5, h) + dR(x, appui - 3, w, 3));
      for (let k = 1; k < 4; k++) vb.add('#E4DFD3', dR(x + 2.5, y + (h * k) / 4 - 0.8, w - 5, 1.6));
      vb.add('rgba(236,240,238,0.55)', dPoly([[x + 4, y + 8], [x + w / 2 - 3, y + 8], [x + w / 2 - 6, appui - 6], [x + 6, appui - 6]]));
      vb.add('rgba(255,255,255,0.14)', dPoly([[x + 8, appui - 4], [x + 24, y + 4], [x + 30, y + 4], [x + 14, appui - 4]]));
      if (mode === 'balcon') { // le balconnet en fer forgé
        const b = [`M${x - 2} ${appui - 30}H${x + w + 2}`, `M${x - 2} ${appui - 2}H${x + w + 2}`];
        for (let xx = x + 2; xx < x + w; xx += 5.2) b.push(`M${f(xx)} ${appui - 30}V${appui - 2}`);
        for (let xx = x + 8; xx < x + w - 6; xx += 14) b.push(`M${f(xx)} ${appui - 16}c3 -6 8 -6 10 0c-2 6 -7 6 -10 0`);
        vt.add('#1F1D1B', 1.1, b.join(''));
      }
      persienne(x - w / 2 - 1, y, w / 2, h);
      if (mode !== 'entrebaillee') persienne(x + w + 1, y, w / 2, h);
      else persienne(x + w / 2 + 6, y + 2, w / 2 - 8, h - 4);
    }
    const FEN = [[84, 'balcon'], [208, 'fermee'], [320, 'balcon'], [470, 'fermee'], [600, 'balcon'], [730, 'fermee'], [860, 'balcon'], [990, 'fermee'], [1120, 'balcon'], [1250, 'fermee']];
    FEN.forEach(([x, m], i) => {
      fenetre(x, 128, 56, 150, m);
      fenetre(x, -172, 56, 150, i % 2 ? 'balcon' : 'entrebaillee');
      fenetre(x, -472, 56, 150, i % 3 ? 'fermee' : 'balcon');
    });
    vb.flush(etage);
    vt.flush(etage);
    // coulures sous les appuis : l'enduit a vécu
    FEN.forEach(([x]) => [128, -172].forEach((a) => rect(etage, x - 4, a + 8, 64, 30, lin([[0, '#4A4032', 0.12], [1, '#4A4032', 0]]))));
    // la plaque de rue, émaillée, à l'angle
    const plaque = G(etage, { class: 'cf-plaque' });
    rect(plaque, 20, 116.8, 36, 18, '#000', { opacity: 0.18, rx: 2 });
    rect(plaque, 19, 115.6, 36, 18, '#1F4F9C', { rx: 2 });
    rect(plaque, 20.5, 117.1, 33, 15, 'none', { rx: 1.3, stroke: '#F4F3EE', 'stroke-width': 0.6 });
    rect(plaque, 19, 115.6, 36, 8, '#fff', { opacity: 0.1, rx: 2 });
    texte(plaque, 'RUE', 37, 122, 3.4, FONTE.chiffres + ';font-weight:600', { 'text-anchor': 'middle', fill: '#F4F3EE', 'letter-spacing': 0.4 });
    texte(plaque, 'VERDIER-LATOUR', 37, 129.6, 5, FONTE.chiffres + ';font-weight:700', { 'text-anchor': 'middle', fill: '#F4F3EE', textLength: 29, lengthAdjust: 'spacingAndGlyphs' });

    // à droite de la boutique : la porte de l'immeuble, en chêne sombre, sous sa lanterne
    const immeuble = G(monde, { class: 'cf-porte-immeuble' });
    {
      rect(immeuble, 380, 254, 50, 224, P.volvicSombre);
      rect(immeuble, 380, 254, 50, 224, GRAIN, { opacity: 0.5 });
      rect(immeuble, 386, 262, 38, 216, '#2E2620');
      rect(immeuble, 386, 262, 38, 26, '#221B16');
      const gr = [];
      for (let x = 390; x < 422; x += 4) gr.push(`M${x} 264V286`);
      gr.push('M388 275H422');
      path(immeuble, gr.join(''), 'none', { stroke: '#57504A', 'stroke-width': 0.7 });
      rect(immeuble, 386, 288, 38, 2, '#1A1410');
      [[389, 294, 15, 70], [406, 294, 15, 70], [389, 370, 15, 100], [406, 370, 15, 100]].forEach(([x, y, w, h]) => {
        rect(immeuble, x, y, w, h, '#3A2F27');
        rect(immeuble, x, y, w, 1, '#4E4136');
        rect(immeuble, x + w - 1, y, 1, h, '#221B16');
      });
      path(immeuble, 'M405 290V478', 'none', { stroke: '#1A1410', 'stroke-width': 1 });
      S('circle', { cx: 402, cy: 372, r: 1.6, fill: '#C9A45C' }, immeuble);
      rect(immeuble, 378, 474, 54, 4.5, '#4E4D49');
      // plus loin (écrans larges), le rez-de-chaussée de l'immeuble : des fenêtres basses à barreaux, un soupirail
      const rz = seau(), bar = [];
      [470, 600, 730, 860, 990].forEach((x) => {
        rz.add(P.volvicSombre, dR(x - 7, 300, 70, 112));
        rz.add('#34403F', dR(x, 307, 56, 98));
        rz.add('rgba(255,255,255,0.1)', dPoly([[x + 6, 405], [x + 26, 307], [x + 34, 307], [x + 14, 405]]));
        rz.add(P.volvic, dR(x - 9, 412, 74, 5));
        for (let k = 1; k < 6; k++) bar.push(`M${x + (56 * k) / 6} 307V405`);
        bar.push(`M${x} 340H${x + 56}`);
        rz.add('#2A2622', dR(x + 8, 452, 40, 12));
      });
      rz.add(P.volvicSombre, dR(430, 474, 1000, 4.5));
      rz.flush(immeuble);
      path(immeuble, bar.join(''), 'none', { stroke: '#1E1C1A', 'stroke-width': 1.3 });
      rect(immeuble, 560, -1400, 5, 1878, lin([[0, '#7F8381'], [0.5, '#AEB2AF'], [1, '#727674']], { x2: 1, y2: 0 }));
    }
    // la lanterne de rue, sur sa console en fonte, au-dessus de la porte de l'immeuble (allumée le soir)
    const lanterne = G(monde, { class: 'cf-lanterne' });
    rect(lanterne, 414, 188, 4, 16, '#2A2724', { rx: 0.8 });
    path(lanterne, 'M414 192H407Q403 192 403 196Q403 199 406 199Q408 199 408 197M414 200Q409 201 405.5 205M405 205V207.5', 'none', { stroke: '#1E1C1A', 'stroke-width': 1.3, 'stroke-linecap': 'round' });
    path(lanterne, 'M398 212L405 207L412 212Z', '#1E1C1A');
    path(lanterne, 'M397 212H413L411.4 215H398.6Z', '#2A2724');
    const vitreLant = path(lanterne, 'M398.4 215H411.6L409.4 234H400.6Z', '#B9BDB9');
    path(lanterne, 'M405 215V234M400.2 215.4L401.8 234M409.8 215.4L408.2 234', 'none', { stroke: '#1E1C1A', 'stroke-width': 0.6 });
    path(lanterne, 'M400.2 234H409.8L407 238.5H403Z', '#1E1C1A');
    const flamme = path(lanterne, 'M401.4 218H408.6L407.4 232H402.6Z', '#FFE7AE', { opacity: 0 });

    /* ---------- l'ombre portée de l'enseigne (la Jordan elle-même vient d'ailleurs) ----------
       Dessinée « à plat » (l'enseigne de face, contre le bandeau), douce (des dégradés, pas de filtre) ;
       ombreEnseigne(yaw) la projette sur le mur selon la lumière du moment. */
    const ombreEns = G(monde, { class: 'cf-ombre-enseigne', 'pointer-events': 'none' });
    // retirée : le cadre de l'enseigne est fixe et seule la chaussure tourne ; cette ombre à plat suivait la
    // rotation et se voyait coupée par le mur (retour de l'utilisateur). On la garde, masquée, pour l'API.
    ombreEns.setAttribute('display', 'none');
    const ombreIn = G(ombreEns);
    { // la chaussure pendue pointe en bas : quatre taches douces ; le cadre : quatre barres floues
      const C = '#221D16', { x, y, w, h } = ENS;
      const tache = rad([[0, C, 0.55], [0.55, C, 0.36], [1, C, 0]]);
      [[0.56, 0.2, 0.36, 0.14], [0.53, 0.4, 0.38, 0.19], [0.5, 0.62, 0.34, 0.19], [0.42, 0.82, 0.26, 0.13]].forEach(([cx, cy, rx, ry]) =>
        S('ellipse', { cx: f(x + cx * w), cy: f(y + cy * h), rx: f(rx * w), ry: f(ry * h), fill: tache }, ombreIn));
      const barreH = lin([[0, C, 0], [0.5, C, 0.62], [1, C, 0]]), barreV = lin([[0, C, 0], [0.5, C, 0.62], [1, C, 0]], { x2: 1, y2: 0 });
      rect(ombreIn, x, y + 2, w, 5, barreH);
      rect(ombreIn, x, y + h - 7, w, 5, barreH);
      rect(ombreIn, x, y + 3, 5, h - 6, barreV);
      rect(ombreIn, x + w - 5, y + 3, 5, h - 6, barreV);
      rect(ombreIn, x + w - 4, ANCRE.y - 3, ANCRE.x - x - w + 6, 6, barreH);
    }

    /* ======================================================================
       La devanture : corniche, bandeau, pilastres, baies, porte
       ====================================================================== */
    const boutique = G(monde, { class: 'cf-boutique' });
    // les vitres, sombres (l'atelier éclairé se dessine par-dessus, dans son propre calque)
    PANES.forEach(([x, y, w, h]) => rect(boutique, x, y, w, h, P.verre));
    rect(boutique, IMPOSTE[0], IMPOSTE[1], IMPOSTE[2], IMPOSTE[3], P.verre);
    // les menuiseries vertes : dormants, montants fins, pièces d'appui, soubassements pleins
    const mb = seau();
    const menuiserie = (x0, x1, panes) => {
      mb.add(P.vert, dR(x0, 248, x1 - x0, 2.5) + dR(x0, 248, 2.5, 226) + dR(x1 - 2.5, 248, 2.5, 226));
      panes.slice(1).forEach(([x]) => mb.add(P.vert, dR(x - 3, 248, 3, 226)));
      panes.slice(1).forEach(([x]) => mb.add(P.vertClair, dR(x - 3, 250.5, 0.8, 143.5)));
      mb.add(P.vertClair, dR(x0 + 2.5, VERRE[0], 0.7, VERRE[1] - VERRE[0]));
      mb.add('#000000', dR(x0 + 2.5, VERRE[0], x1 - x0 - 5, 1.6));
      mb.add(P.vertClair, dR(x0 - 1.5, 394, x1 - x0 + 3, 1.6));
      mb.add(P.vert, dR(x0 - 1.5, 395.6, x1 - x0 + 3, 4.4));
      mb.add(P.vertNoir, dR(x0 - 1.5, 400, x1 - x0 + 3, 1.8));
      panes.forEach(([x, w]) => {
        mb.add(P.vert, dR(x, 401.8, w, 72.2));
        mb.add(P.vertClair, dR(x + 3, 405, w - 6, 1.1) + dR(x + 3, 405, 1.1, 63));
        mb.add(P.vertOmbre, dR(x + 3, 467, w - 6, 1.1) + dR(x + w - 4.1, 405, 1.1, 63));
      });
    };
    menuiserie(24, 184, VG);
    menuiserie(208, 275, VD);
    mb.flush(boutique);
    rect(boutique, 24, 400, 160, 74, lin([[0, '#fff', 0.05], [1, '#000', 0.16]]));
    rect(boutique, 208, 400, 67, 74, lin([[0, '#fff', 0.05], [1, '#000', 0.16]]));
    // les pilastres en pierre de Volvic bouchardée : à l'angle, entre les baies, à côté de la porte
    const PIL = [[0, 24], [184, 208], [354, 378]];
    const piliers = G(boutique, { class: 'cf-piliers' });
    {
      const pb = seau(), pj = [];
      PIL.forEach(([x0, x1], i) => {
        let y = 242;
        const r = CO.rng(40 + i);
        while (y < SOL - 4) {
          const h = Math.min(SOL - y, 26 + r() * 12);
          pb.add(['#5C5751', '#55504A', '#625D56', '#524D47'][Math.floor(r() * 4)], dR(x0, y, x1 - x0, h));
          if (y + h < SOL - 2) pj.push(`M${x0} ${f(y + h)}H${x1}`);
          y += h;
        }
      });
      pb.flush(piliers);
      PIL.forEach(([x0, x1]) => rect(piliers, x0, 242, x1 - x0, 236, GRAIN));
      path(piliers, pj.join(''), 'none', { stroke: '#8E8A81', 'stroke-width': 1.1 });
      const ar = seau();
      PIL.forEach(([x0, x1]) => { ar.add('rgba(255,255,255,0.1)', dR(x0, 242, 1.3, 236)); ar.add('rgba(0,0,0,0.22)', dR(x1 - 1.6, 242, 1.6, 236)); });
      ar.flush(piliers);
    }
    rect(boutique, 0, 474, 380, 4.5, '#4E4D49');
    rect(boutique, 273, 473, 83, 6, '#9C988F');
    rect(boutique, 273, 473, 83, 1.4, '#B9B5AC');

    // la corniche saillante (chapeau de zinc, moulure, son ombre) et le bandeau vert clair
    const bandeauG = G(boutique, { class: 'cf-bandeau' });
    rect(bandeauG, 0, 162, 380, 80, P.vert);
    rect(bandeauG, 0, 162, 380, 80, linU(162, 242, [[0, '#fff', 0.1], [0.45, '#fff', 0], [1, '#000', 0.12]]));
    rect(bandeauG, 6, 168, 368, 68, 'none', { stroke: P.vertOmbre, 'stroke-width': 1.3 });
    rect(bandeauG, 7.2, 169.2, 365.6, 65.6, 'none', { stroke: P.vertClair, 'stroke-width': 0.6, opacity: 0.8 });
    rect(bandeauG, -1.5, 146, 383, 16, linU(146, 162, [[0, P.zincClair], [0.14, P.zinc], [0.24, P.corniche], [0.55, '#E2DBCB'], [0.8, P.cornicheOmbre], [1, '#857C69']]));
    rect(bandeauG, -1.5, 145.2, 383, 1.4, '#EFF1EE');
    rect(bandeauG, 0, 162, 380, 9, linU(162, 171, [[0, '#000', 0.38], [1, '#000', 0]]));
    rect(boutique, 0, 242, 380, 8, P.vertOmbre);
    rect(boutique, 0, 242, 380, 1.2, P.vertClair);
    rect(boutique, 0, 248.6, 380, 1.4, P.vertNoir);

    // les grandes lettres dorées en relief : ombre portée sur le bandeau, flanc, lumière, face
    const MOT = 'CORDONNERIE', capH = 30, base = 217.5, mx0 = 118, mx1 = 368, kL = capH / 100;
    const largMot = [...MOT].reduce((s, ch) => s + GLYPHES[ch].w, 0) * kL;
    const espace = (mx1 - mx0 - largMot) / (MOT.length - 1);
    const lettres = [];
    {
      let cx = mx0;
      [...MOT].forEach((ch) => {
        lettres.push({ ch, x: cx, w: GLYPHES[ch].w * kL, d: GLYPHES[ch].d(plume(cx, base - capH, kL)) });
        cx += GLYPHES[ch].w * kL + espace;
      });
    }
    const motD = lettres.map((l) => l.d).join('');
    const lettresG = G(bandeauG, { class: 'cf-lettres' });
    const ombresL = G(lettresG, { class: 'cf-lettres-ombre' });
    path(ombresL, motD, '#1F2C1A', { opacity: 0.16, transform: 'translate(3.2 4.2)' });
    path(ombresL, motD, '#1F2C1A', { opacity: 0.36, transform: 'translate(1.4 1.9)' });
    path(lettresG, motD, '#4E3717', { transform: 'translate(.62 .78)' });
    path(lettresG, motD, '#FFF1C8', { transform: 'translate(-.38 -.4)', opacity: 0.9 });
    path(lettresG, motD, '#7A5E36'); // la face « éteinte » (bronze)
    const OR = linU(base - capH, base, [[0, '#FBE3A8'], [0.3, '#DDB468'], [0.62, '#B98A42'], [1, '#86602C']]);
    const facesOr = lettres.map(() => G(lettresG, { class: 'cf-lettre' }));
    lettres.forEach((l, i) => path(facesOr[i], l.d, OR));
    const etincelles = lettres.map((l) => { // une étincelle par lettre, quand elle s'allume (à l'ouverture)
      const e = path(bandeauG, `M${f(l.x + l.w * 0.8)} ${f(base - capH - 2.6)}l.8 2.6l2.6 .8l-2.6 .8l-.8 2.6l-.8 -2.6l-2.6 -.8l2.6 -.8z`, '#FFF8DC', { opacity: 0, 'pointer-events': 'none' });
      e.style.transformBox = 'fill-box';
      e.style.transformOrigin = 'center';
      return e;
    });

    // la platine murale de l'enseigne : acier anthracite, quatre boulons, le départ du bras
    const platine = G(boutique, { class: 'cf-platine' });
    rect(platine, ANCRE.x - 6.2, ANCRE.y - 9.4, 13.6, 20, '#000', { opacity: 0.25, rx: 1 });
    rect(platine, ANCRE.x - 6.8, ANCRE.y - 10.2, 13.6, 20, '#34373A', { rx: 1 });
    rect(platine, ANCRE.x - 6.8, ANCRE.y - 10.2, 13.6, 1.1, '#6A6F73', { rx: 0.6 });
    rect(platine, ANCRE.x - 6.8, ANCRE.y - 10.2, 0.9, 20, '#565B5F');
    {
      const bb = seau();
      [[-3.9, -6.6], [3.9, -6.6], [-3.9, 6.6], [3.9, 6.6]].forEach(([dx, dy]) => {
        bb.add('#1C1E20', dDisc(ANCRE.x + dx, ANCRE.y + dy, 1.35));
        bb.add('#8A9095', dDisc(ANCRE.x + dx - 0.35, ANCRE.y + dy - 0.35, 0.5));
      });
      bb.flush(platine);
    }
    rect(platine, ANCRE.x - 3.2, ANCRE.y - 3.2, 6.4, 6.4, '#26282B', { rx: 0.5 });
    rect(platine, ANCRE.x - 3.2, ANCRE.y - 3.2, 6.4, 1.1, '#5E6368');

    // le numéro, émaillé, sur le pilastre près de la porte
    rect(boutique, 358, 256, 16, 14, '#1F4F9C', { rx: 2 });
    rect(boutique, 359.2, 257.2, 13.6, 11.6, 'none', { rx: 1.4, stroke: '#F4F3EE', 'stroke-width': 0.6 });
    texte(boutique, '6', 366, 267.6, 10.5, FONTE.chiffres + ';font-weight:700', { 'text-anchor': 'middle', fill: '#F4F3EE' });

    /* ---------- la porte : vantail vitré vert, gonds à droite, entrouvert vers l'intérieur ----------
       Le vantail est dessiné à plat puis projeté : les grandes pièces point par point, les petites
       (poignée, pancarte, vinyle) par un repère local linéarisé. La boutique se voit par
       l'entrebâillement (côté gauche : la lumière sort vers le milieu de la rue) et par la vitre. */
    const PO = { gond: 350, oeilX: 200, oeilY: 316, focale: 700 };
    const ENTRE = (50 * Math.PI) / 180, GRAND = (84 * Math.PI) / 180, SEUIL_ANGLE = (96 * Math.PI) / 180; // entrouverte, grande ouverte, rabattue contre le mur (on entre)
    let theta = ENTRE;
    const proj = (x, y) => {
      const d = PO.gond - x, X = PO.gond - d * Math.cos(theta), Z = d * Math.sin(theta), s = PO.focale / (PO.focale + Z);
      return [PO.oeilX + (X - PO.oeilX) * s, PO.oeilY + (y - PO.oeilY) * s];
    };
    const pt = (x, y) => { const p = proj(x, y); return f(p[0]) + ' ' + f(p[1]); };
    const polyD = (pts) => 'M' + pts.map(([x, y]) => pt(x, y)).join('L') + 'Z';
    const quadD = (x, y, w, h) => polyD([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    const affine = (cx, cy, k = 10) => { // la projection, linéarisée autour de (cx, cy)
      const a0 = proj(cx - k, cy), a1 = proj(cx + k, cy), b0 = proj(cx, cy - k), b1 = proj(cx, cy + k), p0 = proj(cx, cy);
      const a = (a1[0] - a0[0]) / (2 * k), b = (a1[1] - a0[1]) / (2 * k), c = (b1[0] - b0[0]) / (2 * k), d = (b1[1] - b0[1]) / (2 * k);
      return `matrix(${[a, b, c, d, p0[0] - a * cx - c * cy, p0[1] - b * cx - d * cy].map((v) => Math.round(v * 10000) / 10000).join(' ')})`;
    };
    const LP = [], LT = [];
    const piece = (par, fill, fn, extra = {}) => { const el = path(par, fn(), fill, extra); LP.push([el, fn]); return el; };

    const porteG = G(boutique, { class: 'cf-porte' });
    rect(porteG, 275, 248, 79, 226, P.vertOmbre); // le dormant
    rect(porteG, 275, 248, 79, 2.5, P.vert);
    rect(porteG, 275, 248, 4, 226, P.vert);
    rect(porteG, 350, 248, 4, 226, P.vert);
    rect(porteG, 275, 266, 79, 4, P.vert);
    rect(porteG, 275, 269.2, 79, 0.8, P.vertNoir);
    rect(porteG, 279, 270, 71, 204, '#17110D'); // l'ouverture (la boutique se dessine dans son calque)
    const vantail = G(porteG, { class: 'cf-vantail' });
    const VA = { x: 279, y: 270, w: 71, h: 204, vx: 288, vy: 280, vw: 53, vh: 122 }; // le vantail et sa vitre, à plat
    piece(vantail, P.vert, () => quadD(VA.x, VA.y, VA.w, VA.h));
    piece(vantail, P.vertClair, () => quadD(VA.x, VA.y, VA.w, 1.4));
    piece(vantail, P.vertNoir, () => quadD(VA.vx - 2, VA.vy - 2, VA.vw + 4, VA.vh + 4));
    piece(vantail, P.verre, () => quadD(VA.vx, VA.vy, VA.vw, VA.vh));
    { // le panneau du bas, en relief
      const x0 = 288, y0 = 412, x1 = 341, y1 = 466, b = 3;
      piece(vantail, P.vertNoir, () => quadD(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2), { opacity: 0.6 });
      piece(vantail, P.vertClair, () => polyD([[x0, y0], [x1, y0], [x1 - b, y0 + b], [x0 + b, y0 + b]]));
      piece(vantail, '#98B786', () => polyD([[x0, y0], [x0 + b, y0 + b], [x0 + b, y1 - b], [x0, y1]]));
      piece(vantail, P.vertOmbre, () => polyD([[x0, y1], [x0 + b, y1 - b], [x1 - b, y1 - b], [x1, y1]]));
      piece(vantail, '#5E7D50', () => polyD([[x1, y0], [x1, y1], [x1 - b, y1 - b], [x1 - b, y0 + b]]));
      piece(vantail, P.vert, () => quadD(x0 + b, y0 + b, x1 - x0 - 2 * b, y1 - y0 - 2 * b));
    }
    // la poignée : une barre de laiton, côté libre (à gauche)
    const poignee = G(vantail, { class: 'cf-poignee' });
    rect(poignee, 281.6, 334, 2.6, 3, '#6D5A33');
    rect(poignee, 281.6, 386, 2.6, 3, '#6D5A33');
    rect(poignee, 280.2, 330, 3, 62, lin([[0, '#F4DDA0'], [0.5, '#C9A45C'], [1, '#7C5E2A']], { x2: 1, y2: 0 }), { rx: 1.5 });
    rect(poignee, 283, 396, 4, 5, '#3A3A3A', { rx: 1 });
    LT.push([poignee, 282, 362]);
    const ombreVantail = piece(vantail, '#000', () => quadD(VA.x, VA.y, VA.w, VA.h), { opacity: 0.1 });

    /* ---------- le trottoir (il se fond, en bas, dans le quadrillage fantôme) ---------- */
    const masque = U('mk');
    rect(S('mask', { id: masque, maskUnits: 'userSpaceOnUse', x: -1400, y: 440, width: 3800, height: 140 }, defs), -1400, 440, 3800, 140,
      linU(440, 580, [[0, '#fff'], [0.43, '#fff'], [0.77, '#000'], [1, '#000']]));
    const trottoir = G(monde, { class: 'cf-trottoir', mask: `url(#${masque})` });
    rect(trottoir, -1400, 476, 3800, 100, linU(476, 560, [[0, '#A29E94'], [0.25, '#B3AFA5'], [1, '#BEBAB0']]));
    rect(trottoir, -1400, 476, 3800, 100, GRAIN, { opacity: 0.55 });
    {
      const tt = traits();
      for (let X = -1000; X <= 1400; X += 100) { // les joints des dalles fuient vers l'œil
        const xb = 200 + (X - 200) * ((560 - 316) / (SOL - 316));
        tt.add('#8F8B82', 0.6, `M${f(X)} ${SOL}L${f(xb)} 560`);
      }
      [494, 516].forEach((y) => tt.add('#8F8B82', 0.6, `M-1400 ${y}H2400`));
      tt.add('#7E7A72', 0.5, 'M142 497l6 3l3 -1l7 4M238 530l5 -2l6 3');
      tt.flush(trottoir, { opacity: 0.7 });
    }
    rect(trottoir, -1400, 476, 3800, 7, linU(476, 483, [[0, '#000', 0.3], [1, '#000', 0]]));
    // les ombres de l'ardoise et du poteau
    if (opts.ardoise) path(trottoir, dEll(66, 548, 48, 5), '#000', { opacity: 0.2 });
    path(trottoir, dEll(-9, 506, 6, 1.6), '#000', { opacity: 0.3 });
    // la lumière du jour : le soleil vient d'en haut à gauche, la rue est plus fraîche au ras du sol
    rect(monde, -1400, -1400, 3800, 1880, linU(0, 500, [[0, '#FFF1D6', 0.12], [0.5, '#FFF1D6', 0], [1, '#26344A', 0.12]], -20, 440), { 'pointer-events': 'none' });

    // le quadrillage fantôme d'un tapis de découpe vert (au-dessus du voile : il ne bleuit pas)
    {
      const fin = [], gras = [], diag = [];
      for (let x = -1404; x <= 2400; x += 9) (Math.round((x + 1404) / 9) % 5 ? fin : gras).push(`M${x} 496V560`);
      for (let y = 505, k = 0; y <= 560; y += 9, k++) (k % 5 ? fin : gras).push(`M-1400 ${y}H2400`);
      for (let x = -1400; x <= 2400; x += 180) diag.push(`M${x} 560L${x + 64} 496`);
      const encre = linU(496, 560, [[0, '#2E684B', 0], [0.45, '#2E684B', 0.3], [0.75, '#2E684B', 0.17], [1, '#2E684B', 0]]);
      path(quadr, fin.join(''), 'none', { stroke: encre, 'stroke-width': 0.3 });
      path(quadr, gras.join(''), 'none', { stroke: encre, 'stroke-width': 0.65 });
      path(quadr, diag.join(''), 'none', { stroke: encre, 'stroke-width': 0.4, 'stroke-dasharray': '2 1.5' });
    }

    /* ======================================================================
       Les intérieurs éclairés (au-dessus du voile du soir)
       ====================================================================== */
    const clipAtelier = U('ca');
    const cla = S('clipPath', { id: clipAtelier }, defs);
    PANES.forEach(([x, y, w, h]) => rect(cla, x, y, w, h, null));
    const atelier = G(dedans, { 'clip-path': `url(#${clipAtelier})`, class: 'cf-atelier' });

    // le mur de pierre apparente, au fond (lumière chaude, pierres calcaires dans leur mortier)
    rect(atelier, 20, 248, 260, 150, '#5A4B3D');
    {
      const sb = seau(), r = CO.rng(9);
      const cols = ['#9A8870', '#8B7A63', '#A7967C', '#7D6D59', '#B09F85', '#948269', '#857460', '#A08C70'];
      for (let y = 246; y < 400;) {
        const h = 8 + r() * 6;
        for (let x = 16 - r() * 12; x < 280;) {
          const w = 10 + r() * 17, cx = x + w / 2, cy = y + h / 2, pts = [];
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * CO.TAU + r() * 0.35, c = Math.cos(a), s = Math.sin(a);
            pts.push([cx + Math.sign(c) * Math.pow(Math.abs(c), 0.55) * (w / 2 - 0.7) * (0.86 + r() * 0.14), cy + Math.sign(s) * Math.pow(Math.abs(s), 0.55) * (h / 2 - 0.6) * (0.84 + r() * 0.16)]);
          }
          sb.add(cols[Math.floor(r() * cols.length)], CO.closedPath(pts, 0.8));
          x += w + 0.6 + r() * 1.3;
        }
        y += h + 0.7 + r() * 0.8;
      }
      sb.flush(atelier);
    }
    rect(atelier, 20, 248, 260, 150, lin([[0, '#140C07', 0.72], [0.28, '#140C07', 0.18], [0.7, '#140C07', 0.1], [1, '#140C07', 0.42]]));
    const lampes = G(atelier, { class: 'cf-lampes' });
    const lueurChaude = rad([[0, '#FFD7A0', 0.55], [0.5, '#E9A460', 0.22], [1, '#8A5230', 0]]);
    [[80, 306, 60, 66], [157, 318, 56, 76], [242, 320, 44, 62]].forEach(([cx, cy, rx, ry]) => S('ellipse', { cx, cy, rx, ry, fill: lueurChaude, class: 'cf-lueur' }, lampes));

    // en haut : une étagère de baskets, le panneau ovale SMALL (son compte de customisation)
    {
      S('ellipse', { cx: 110, cy: 276, rx: 12, ry: 17, fill: '#EDEBE6' }, atelier);
      S('ellipse', { cx: 110, cy: 276, rx: 12, ry: 17, fill: 'none', stroke: '#B9B6AF', 'stroke-width': 0.9 }, atelier);
      const sm = G(atelier, { transform: 'rotate(-78 110.6 278.4)' });
      texte(sm, 'SMALL', 110.6, 278.4, 6, FONTE.chiffres + ';font-weight:800', { 'text-anchor': 'middle', fill: '#2A2A2A' });
      const sk = seau();
      [[26, 290, 70]].forEach(([x0, y, w]) => {
        sk.add('#4A3322', dR(x0, y, w, 2.4));
        sk.add('#2B1D13', dR(x0, y + 2.4, w, 1.4));
        let x = x0 + 2;
        while (x < x0 + w - 16) { basket(sk, x, y, 14 + R() * 2, PAIRES[Math.floor(R() * PAIRES.length)], 1); x += 17 + R() * 4; }
      });
      sk.flush(atelier);
    }
    // la presse bleue et son flexible d'air en spirale
    {
      const pr = G(atelier, { class: 'cf-presse' });
      rect(pr, 26, 332, 18, 62, '#56789A');
      rect(pr, 26, 332, 18, 62, lin([[0, '#fff', 0.14], [1, '#000', 0.22]], { x2: 1, y2: 0 }));
      rect(pr, 29, 320, 12, 14, '#6D8FB0', { rx: 2 });
      rect(pr, 33, 302, 4, 20, '#8C9196');
      rect(pr, 27, 350, 16, 5, '#2E3B48');
      path(pr, 'M29 355h12l-2 7h-8z', '#1D1D1F');
      const sp = [];
      for (let k = 0; k < 7; k++) sp.push(`M${46 - (k % 2) * 2} ${326 + k * 5}c4 1 4 4 0 5`);
      path(pr, sp.join(''), 'none', { stroke: '#3C8FD8', 'stroke-width': 1 });
    }

    // la finisseuse rouge : brosses et meules sur l'arbre, qui tournent
    const fin = G(atelier, { class: 'cf-finisseuse' });
    const brosses = []; // [x, largeur, rayon, couleur]
    {
      path(fin, 'M46 424V348Q46 343 51 343H117Q122 343 122 348V424Z', lin([[0, '#E4332F'], [0.6, P.rouge], [1, '#A81B20']]));
      path(fin, 'M52 343V335Q52 331 56 331H108V343Z', '#C8232A');
      rect(fin, 52, 331, 56, 1.4, P.rougeClair);
      S('circle', { cx: 62, cy: 337.5, r: 3.2, fill: '#F2D43A' }, fin);
      S('circle', { cx: 62, cy: 337.5, r: 2.1, fill: '#C21A1F' }, fin);
      [71, 76, 81].forEach((x) => rect(fin, x - 1.7, 335.7, 3.4, 3.4, '#39A866', { rx: 0.6 }));
      rect(fin, 88, 335, 12, 5, '#1E3A6E', { rx: 0.6 });
      rect(fin, 104, 322, 13, 10, '#2A2A2C', { rx: 2 });
      S('ellipse', { cx: 118, cy: 328, rx: 2.2, ry: 6.5, fill: '#9C9C98' }, fin);
      rect(fin, 100, 326, 5, 4, '#6E6E6A');
      rect(fin, 50, 348, 68, 26, '#6E1014');
      rect(fin, 50, 348, 68, 26, lin([[0, '#000', 0.5], [1, '#000', 0.1]]));
      rect(fin, 50, 374, 68, 8, '#2A2A2A');
      for (let x = 52; x < 116; x += 4) rect(fin, x, 375, 2.2, 6, '#4A4A48');
      rect(fin, 46, 382, 76, 2, P.rougeClair);
      rect(fin, 58, 388, 52, 36, '#1C1C1E');
      rect(fin, 46, 343, 76, 1.2, '#F48A84', { opacity: 0.6 });
      rect(fin, 50, 360.2, 68, 2.2, lin([[0, '#E4E6E6'], [1, '#6E7274']]));
      [[56, 5, 9, '#7A9BB4'], [68, 6, 10, '#5A3A26'], [80, 6, 10, '#8A5A36'], [93, 5, 9, '#1E1E1E'], [110, 9, 11.5, '#26221F']].forEach((b) => brosses.push(b));
      const bb = seau();
      brosses.forEach(([x, w, r, c]) => {
        bb.add(c, dRR(x - w / 2, 361.3 - r, w, 2 * r, Math.min(2, w / 2)));
        bb.add('rgba(255,255,255,0.18)', dEll(x + w / 2, 361.3, 1.4 + (200 - x) / 90, r * 0.98));
      });
      bb.flush(fin);
    }
    // la texture qui défile sur le chant des brosses (c'est ce qui les fait tourner)
    const clipBrosses = U('cb');
    const clb = S('clipPath', { id: clipBrosses }, defs);
    brosses.forEach(([x, w, r]) => rect(clb, x - w / 2, 361.3 - r, w, 2 * r, null));
    const defile = G(G(fin, { 'clip-path': `url(#${clipBrosses})` }), { class: 'cf-defile' });
    {
      const tb = seau();
      for (let y = 344; y < 380; y += 2.6) brosses.forEach(([x, w], i) => {
        tb.add(i === 0 ? 'rgba(220,235,245,0.35)' : 'rgba(0,0,0,0.38)', dR(x - w / 2, y + (i % 2) * 1.2, w, 0.9));
        tb.add('rgba(255,236,210,0.22)', dR(x - w / 2 + (i * 1.7) % (w - 1), y + 0.6, 0.8, 1.2));
      });
      tb.flush(defile);
    }
    rect(fin, 46, 343, 76, 81, linU(0, 0, [[0, '#fff', 0.1], [0.5, '#fff', 0], [1, '#000', 0.2]], 46, 122));
    // les mains de Clément à la finisseuse (on ne les voit que quand il y passe une chaussure)
    const aLaBrosse = G(fin, { class: 'cf-a-la-brosse', opacity: 0 });
    const chaussureBrosse = G(aLaBrosse, { class: 'cf-chaussure-brosse' });
    chaussureBrosse.style.transformOrigin = '124px 357px';
    {
      const sk = seau();
      basket(sk, 116, 362, 15, PAIRES[0], 1);
      sk.flush(chaussureBrosse);
      path(aLaBrosse, 'M134 356L126.6 357.4Q124 358 124.4 360.4Q125 362.4 127.6 362L134 361Z', P.peau);
      path(aLaBrosse, 'M134 348.6L128.4 349.4Q125.6 350 126 352.4Q126.6 354.4 129.2 354L134 353.4Z', P.peauOmbre);
      rect(aLaBrosse, 131.2, 348.6, 2.2, 5, '#E0762C');
    }
    const poussieres = G(atelier, { class: 'cf-poussieres', style: 'mix-blend-mode:screen' });
    const grains = Array.from({ length: 12 }, () => S('circle', { cx: 116, cy: 357, r: f(0.45 + R() * 0.55), fill: '#FFE6BA', opacity: 0 }, poussieres));

    // l'établi, derrière Clément : plateau d'aggloméré usé, tapis de découpe vert, outils, pied de fer
    const et = G(atelier, { class: 'cf-etabli' });
    {
      path(et, 'M126 364L184 364L184 370L126 370Z', '#7A5A3E');
      path(et, 'M126 369.2L184 369.2L184 371L126 371Z', '#A07C58');
      rect(et, 126, 371, 58, 24, '#4A3526');
      rect(et, 126, 371, 58, 24, lin([[0, '#000', 0.1], [1, '#000', 0.45]]));
      path(et, 'M130 357.5L183 357.5L184 364.2L128 364.2Z', P.tapis);
      const ql = [];
      for (let x = 132; x < 183; x += 3.4) ql.push(`M${f(x)} 357.6L${f(x - (x - 160) * 0.035)} 364.2`);
      [359.6, 361.8].forEach((y) => ql.push(`M129 ${y}H184`));
      path(et, ql.join(''), 'none', { stroke: P.tapisClair, 'stroke-width': 0.22, opacity: 0.7 });
      path(et, 'M130 357.5L183 357.5', 'none', { stroke: '#F2D24A', 'stroke-width': 0.5 });
      path(et, 'M131 361Q137 358.2 145 359.2Q149 360.6 145 362.4Q137 363.4 131 362.4Z', '#3A2A20');
      rect(et, 133, 351, 5, 7, '#F2F0EA', { rx: 1 });
      rect(et, 132.6, 349.4, 5.8, 2.4, '#2F6FB8', { rx: 0.8 });
      path(et, 'M176 360.8l5 -.7l.5 2.6l-5 .7z', '#F2D24A');
      S('circle', { cx: 178.6, cy: 361.3, r: 0.7, fill: '#D8342C' }, et);
      // le pied de fer et la chaussure retournée qu'on ressemelle
      rect(et, 167.4, 349, 2.6, 9.6, '#2B2B2E');
      rect(et, 163, 356.6, 11.6, 2.2, '#2B2B2E');
    }
    const piedChaussure = G(et, { class: 'cf-pied' });
    {
      const sk = seau();
      basket(sk, 165, 342.2, 15, { tige: '#F1EDE4', renfort: '#B8322E', bande: '#2A2A2C', semelle: '#7A5234' }, 1, -1);
      sk.flush(piedChaussure);
      path(piedChaussure, 'M165 342.4L180.4 342.4', 'none', { stroke: '#B98A5C', 'stroke-width': 0.5 });
    }
    // le marteau, posé sur l'établi (quand Clément est à la finisseuse ou absent)
    const marteauPose = G(atelier, { class: 'cf-marteau-pose', opacity: 0 });
    path(marteauPose, 'M150 362.4L164 360.6', 'none', { stroke: '#B88A56', 'stroke-width': 1.3, 'stroke-linecap': 'round' });
    rect(marteauPose, 161.6, 357.4, 3, 6, '#6B7277', { rx: 0.6, transform: 'rotate(-8 163 360)' });

    // les suspensions émaillées et le cône de lumière sur l'établi
    const suspG = G(atelier, { class: 'cf-suspensions' });
    [[80, 262, '#232323'], [157, 274, '#2F5A47']].forEach(([x, y, c]) => {
      path(suspG, `M${x} 248V${y - 8}`, 'none', { stroke: '#1A1A1A', 'stroke-width': 0.6 });
      path(suspG, `M${x - 7.5} ${y}Q${x - 7.5} ${y - 8.6} ${x} ${y - 9}Q${x + 7.5} ${y - 8.6} ${x + 7.5} ${y}Z`, c);
      path(suspG, `M${x - 6} ${y - 0.4}Q${x - 5.4} ${y - 7} ${x} ${y - 7.6}`, 'none', { stroke: '#fff', 'stroke-width': 0.6, opacity: 0.25 });
      S('ellipse', { cx: x, cy: y + 0.2, rx: 7, ry: 1.3, fill: '#FFF2CF' }, suspG);
    });
    const cone = path(atelier, 'M150 275L164 275L186 360L128 360Z', lin([[0, '#FFEFC7', 0.3], [1, '#FFEFC7', 0]]), { class: 'cf-cone' });

    // entre le pilastre et la porte : la boutique, les paires réparées qui attendent avec leur ticket jaune
    {
      const bq = G(atelier, { class: 'cf-boutique-dedans' });
      rect(bq, 206, 248, 72, 150, '#6B4A33');
      rect(bq, 206, 248, 72, 150, lin([[0, '#2A1A10', 0.7], [0.4, '#2A1A10', 0.1], [1, '#2A1A10', 0.3]]));
      const sk = seau();
      [296, 326, 356].forEach((y, j) => {
        sk.add('#3A2616', dR(206, y, 72, 2.4));
        sk.add('#24170D', dR(206, y + 2.4, 72, 1.2));
        for (let x = 210, k = 0; x < 266; x += 19, k++) {
          const c = PAIRES[(j * 3 + k) % PAIRES.length];
          basket(sk, x, y, 12, c, 1);
          basket(sk, x + 4, y, 12, c, 1);
          sk.add('#F2D24A', dR(x + 6, y - 11.6, 4.2, 5.6));
          sk.add('#D8342C', dDisc(x + 8.1, y - 10.2, 0.7));
        }
      });
      sk.flush(bq);
      path(bq, 'M232 248V262', 'none', { stroke: '#1A1A1A', 'stroke-width': 0.6 });
      path(bq, 'M226 270Q226 262 232 261.6Q238 262 238 270Z', '#E7C391');
      S('ellipse', { cx: 232, cy: 270.2, rx: 6, ry: 1.1, fill: '#FFF3D0' }, bq);
    }

    /* ---------- Clément : de trois-quarts dos, barbe, lunettes, t-shirt sombre, tablier de toile brune ----------
       Dessiné en centimètres (pieds à l'origine, y vers le haut négatif) puis posé à 1,2 m derrière la vitre.
       Un pantin en 2D : le bras droit (le marteau) est orienté segment par segment. */
    const clementG = G(atelier, { class: 'cf-clement' });
    const CL = { x: 157, y: 449, k: 0.83 }; // (le montant de la vitrine frôle son épaule gauche : il travaille juste derrière)
    const corps = G(clementG, { transform: `translate(${CL.x} ${CL.y}) scale(${CL.k})` });
    const buste = G(corps, { class: 'cf-buste' });
    const brasG = G(buste, { class: 'cf-bras-g' });
    path(brasG, 'M-5.8 -2.5L5.6 -2.5L6 9L5 11.5L-4.8 11.5L-5.8 8Z', P.tshirt);
    path(brasG, 'M-4 10.6L4 10.6L3.4 26Q0 28.4 -3.4 26Z', P.peauOmbre);
    brasG.setAttribute('transform', 'translate(-17.5 -142) rotate(12)');
    path(buste, 'M-18.6 -99L18.6 -99L19.2 -80L18.8 -58L-18.8 -58L-19.2 -80Z', P.jean);
    path(buste, 'M-14.6 -91H-3.2L-3.8 -76Q-9 -73.4 -14.2 -76ZM3.2 -91H14.6L14.2 -76Q9 -73.4 3.8 -76Z', '#26324A');
    path(buste, 'M-14.6 -91H-3.2L-3.8 -76Q-9 -73.4 -14.2 -76ZM3.2 -91H14.6L14.2 -76Q9 -73.4 3.8 -76Z', 'none', { stroke: '#C08A4A', 'stroke-width': 0.35, 'stroke-dasharray': '0.9 0.6' });
    path(buste, 'M-22.2 -108L-17.2 -106.4L-18.2 -58L-23.6 -58ZM17.4 -106.4L22.4 -108L23.8 -58L18.4 -58Z', P.tablier);
    path(buste, 'M-22.2 -108L-23.6 -58M22.4 -108L23.8 -58', 'none', { stroke: P.tablierSombre, 'stroke-width': 0.8 });
    const dos = CO.closedPath([[-6.5, -151], [-13, -149.6], [-19.6, -146.4], [-22.2, -140.6], [-21.6, -132], [-19.6, -123], [-18.2, -113], [-17.3, -104], [-18.3, -95.5], [-9, -94.6], [0, -94.4], [9, -94.6], [18.4, -95.5], [17.6, -104], [18.6, -113], [20.2, -123], [22.2, -132], [22.6, -140.6], [20.1, -146.4], [13.6, -149.6], [6.6, -151]], 0.9);
    path(buste, dos, P.tshirt);
    path(buste, dos, lin([[0, '#fff', 0.06], [0.5, '#fff', 0], [1, '#000', 0.25]]));
    path(buste, 'M-9.5 -131Q-6 -124 -3.4 -121M9 -118Q12 -113 15.6 -109M-14 -112Q-11 -106 -12 -101', 'none', { stroke: '#1B1E22', 'stroke-width': 0.8, 'stroke-linecap': 'round' });
    path(buste, 'M-20.4 -145Q-13.5 -149.6 -7 -151M7 -151Q13.8 -149.6 20.8 -145.4', 'none', { stroke: '#7A6E62', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.7 });
    const bret = (x0, y0, x1, y1, w) => {
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2;
      return dPoly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]);
    };
    path(buste, bret(10.6, -150.4, -14.8, -104, 4.3), P.tablierSombre);
    path(buste, bret(-10.2, -150.4, 15.2, -104, 4.3), P.tablier);
    path(buste, 'M-8.2 -149L13.6 -106.6', 'none', { stroke: P.tablierClair, 'stroke-width': 0.35, 'stroke-dasharray': '0.9 0.7' });
    path(buste, 'M-18.4 -106.8L18.4 -106.8L18.2 -102.6L-18.2 -102.6Z', P.tablier);
    path(buste, 'M-18.4 -106.8L18.4 -106.8', 'none', { stroke: P.tablierClair, 'stroke-width': 0.5 });
    path(buste, dEll(0.8, -104.6, 2.6, 2.3), P.tablierSombre);
    path(buste, 'M-0.4 -102.6L-2.4 -90L0.2 -90.4L1 -102.4ZM2 -102.6L4.8 -91.4L2.6 -90.8L0.8 -102.4Z', P.tablier);
    rect(buste, -16.4, -106.6, 2.4, 3.8, '#C9A45C', { rx: 0.5 });
    rect(buste, 14, -106.6, 2.4, 3.8, '#C9A45C', { rx: 0.5 });
    path(buste, 'M-5.4 -158L5.8 -158L6.4 -150.6Q0 -148.8 -6.6 -150.6Z', P.peau);
    path(buste, 'M-5.2 -157.4Q0 -155.2 5.6 -157.4L5.8 -155.6Q0 -153.6 -5.4 -155.6Z', P.peauOmbre, { opacity: 0.8 });
    path(buste, 'M-7 -151Q0 -148.6 7 -151', 'none', { stroke: '#3C4248', 'stroke-width': 1.4 });
    // le bras droit (le marteau) : bras, avant-bras tatoué, poing, marteau
    const brasD = G(corps, { class: 'cf-bras-d' });
    const segBras = G(brasD);
    path(segBras, 'M-4.1 9.6L4.1 9.6L3.6 26Q0 28.4 -3.6 26Z', P.peau);
    path(segBras, 'M1.6 10L4.1 9.6L3.6 26Q2.2 27.2 1 27Z', P.peauOmbre, { opacity: 0.6 });
    path(segBras, 'M-5.8 -2.5L5.8 -2.5L6.2 9L5.2 11.6L-4.8 11.6L-5.8 8Z', P.tshirt);
    path(segBras, 'M-4.8 11.6L5.2 11.6', 'none', { stroke: '#1B1E22', 'stroke-width': 0.8 });
    const segAvant = G(brasD);
    path(segAvant, 'M-3.7 0L3.7 0L2.9 24Q0 25.6 -2.9 24Z', P.peau);
    path(segAvant, 'M1.2 0.4L3.7 0L2.9 24L1 24.6Z', P.peauOmbre, { opacity: 0.55 });
    path(segAvant, 'M-1.8 4.6Q0.2 3.4 1.6 5.2Q0.2 7.4 -1.6 6.6ZM-2 11.6Q0 10.2 1.4 12.2M-2.2 14Q-0.2 12.8 1.6 14.6M-1.6 17.4Q0 16.4 1.2 18', 'none', { stroke: '#3F4B5E', 'stroke-width': 0.55, opacity: 0.55, 'stroke-linecap': 'round' });
    const segMain = G(brasD);
    const manche = G(segMain);
    path(manche, 'M-0.9 1.5L-0.7 -24L0.7 -24L0.9 1.5Z', '#B88A56');
    path(manche, 'M0.3 1.5L0.4 -24L0.7 -24L0.9 1.5Z', '#7C5834');
    // la tête du marteau de cordonnier : une panne ronde et large d'un côté, une panne plate de l'autre
    const teteMarteau = G(segMain);
    path(teteMarteau, 'M-1.5 -2.4H1.5V2.4H-1.5Z', '#50565B');
    path(teteMarteau, 'M1.2 -2.8L5.8 -3.4Q7.8 -3.5 8 0Q7.8 3.5 5.8 3.4L1.2 2.8Z', '#6B7277');
    path(teteMarteau, 'M-1.2 -2L-7.4 -1.3Q-8.1 0 -7.4 1.3L-1.2 2Z', '#5E656A');
    path(teteMarteau, 'M1.2 -2.8L5.8 -3.4Q7.8 -3.5 8 0M-1.2 -2L-7.4 -1.3', 'none', { stroke: '#C4CBD0', 'stroke-width': 0.6 });
    path(segMain, 'M-3.4 -2.6Q0 -4.4 3.4 -2.6Q4.4 0.4 3.2 3Q0 4.4 -3.2 3Q-4.2 0.2 -3.4 -2.6Z', P.peau);
    path(segMain, 'M-3 -1L3 -1.4M-2.8 1.2L3 1', 'none', { stroke: P.peauOmbre, 'stroke-width': 0.45 });
    // la tête, de trois-quarts dos (tournée vers sa droite) ; sa jumelle en miroir quand il se tourne vers la finisseuse
    // (teteG : le hochement, autour du cou ; teteTour : le demi-tour, en miroir)
    const teteG = G(corps, { class: 'cf-tete' });
    const teteTour = G(teteG);
    const teteD = G(teteTour, { class: 'cf-tete-d' });
    const teteDessin = G(teteD); // (le miroir clone ce dessin-ci : l'opacité de teteD ne le touche pas)
    {
      const crane = CO.closedPath([[-7, -160.4], [-8.6, -166], [-8, -171.6], [-5, -176], [0.6, -178.2], [5.8, -176.8], [9, -172.4], [10.2, -167], [10, -161.5], [8, -157.2], [3.6, -155.6], [-3, -156], [-6, -158]], 1);
      path(teteDessin, crane, P.cheveux);
      path(teteDessin, 'M-5 -160.6Q0 -158.2 5.4 -160Q6 -157.4 5 -155.8Q0 -154.6 -4.6 -156Q-5.4 -158 -5 -160.6Z', P.peau);
      path(teteDessin, 'M-5 -160.6Q0 -158.2 5.4 -160', 'none', { stroke: '#2A1C12', 'stroke-width': 0.7 });
      path(teteDessin, 'M8.6 -168.4Q11 -165.6 11.4 -161Q11.6 -156.2 9 -152.8Q6 -151.2 3.4 -152.6Q4.2 -155.4 6.6 -156.8Q8.4 -159.2 8.2 -163.4Z', P.barbe);
      path(teteDessin, 'M9.6 -164Q10.6 -160 9.8 -156.2M7.8 -156.6Q6.2 -154.6 4.8 -153.8', 'none', { stroke: P.barbeClair, 'stroke-width': 0.45, 'stroke-linecap': 'round' });
      path(teteDessin, 'M9.8 -169Q11 -167.6 10.9 -165.6L9.6 -166.2Z', P.peau);
      path(teteDessin, dEll(8.9, -164.6, 1.45, 3), P.peau);
      path(teteDessin, 'M8.6 -166.8Q9.6 -165 8.8 -162.6', 'none', { stroke: P.peauOmbre, 'stroke-width': 0.5 });
      path(teteDessin, 'M7.9 -167.2L12.1 -167.6', 'none', { stroke: '#2A2420', 'stroke-width': 0.5 });
      path(teteDessin, 'M12 -169.6Q12.8 -166.6 12.3 -163.8', 'none', { stroke: '#D9D2C4', 'stroke-width': 0.8, 'stroke-linecap': 'round' });
      path(teteDessin, 'M-3 -177.2Q3.6 -178 7.8 -174.2Q9.4 -172 9.6 -169.6', 'none', { stroke: P.cheveuxClair, 'stroke-width': 1.2, 'stroke-linecap': 'round', opacity: 0.8 });
      path(teteDessin, 'M-6.6 -170Q-5.4 -166.8 -6 -163', 'none', { stroke: '#2A1C12', 'stroke-width': 0.6, opacity: 0.8 });
      path(teteDessin, 'M-4.4 -174.6Q-1.8 -168 -3.2 -161.6M-1 -176.6Q1.6 -169 0.4 -160.8M2.6 -176.8Q5 -170 4.4 -161.4M5.8 -175Q8.2 -170 8 -165M-7 -168.8Q-5.8 -164.4 -6.2 -161.4', 'none', { stroke: '#271A10', 'stroke-width': 0.55, opacity: 0.75, 'stroke-linecap': 'round' });
      path(teteDessin, 'M-2.2 -176Q0.4 -171 -0.4 -165.6M4.2 -175.8Q6.4 -171.4 6.2 -167.6', 'none', { stroke: '#6A4D34', 'stroke-width': 0.45, opacity: 0.7, 'stroke-linecap': 'round' });
      path(teteDessin, 'M-5 -160.6Q-3.6 -159.2 -2.4 -160.4Q-1 -158.8 0.4 -160Q1.8 -158.6 3.2 -159.9Q4.4 -158.8 5.4 -160', 'none', { stroke: P.cheveux, 'stroke-width': 0.9, 'stroke-linejoin': 'round' });
    }
    const idTete = U('tt');
    teteDessin.setAttribute('id', idTete);
    const teteGa = S('use', { href: '#' + idTete, transform: 'translate(3 0) scale(-1 1)', opacity: 0 }, teteTour);
    const hocher = (deg, dy = 0) => teteG.setAttribute('transform', deg || dy ? `translate(0 ${f(dy)}) rotate(${f(deg)} 1.5 -152)` : '');
    /** Le demi-tour de la tête (u : 0 tournée vers l'établi, 1 vers la finisseuse), un peu écrasée au passage */
    const tournerTete = (u) => {
      teteD.setAttribute('opacity', u < 0.5 ? 1 : 0);
      teteGa.setAttribute('opacity', u < 0.5 ? 0 : 1);
      const k = 1 - 0.3 * Math.sin(Math.PI * u);
      teteTour.setAttribute('transform', u > 0 && u < 1 ? `translate(1.5 0) scale(${k.toFixed(3)} 1) translate(-1.5 0)` : '');
    };

    /* ---------- la boutique, vue par la porte (toujours un peu éclairée) ---------- */
    const clipPorte = U('cp'), clipImp = U('ci');
    const clipPorteP = S('path', {}, S('clipPath', { id: clipPorte }, defs));
    rect(S('clipPath', { id: clipImp }, defs), IMPOSTE[0], IMPOSTE[1], IMPOSTE[2], IMPOSTE[3], null);
    const dansPorte = G(dedans, { 'clip-path': `url(#${clipPorte})`, class: 'cf-dans-porte' });
    const dansImposte = G(dedans, { 'clip-path': `url(#${clipImp})`, class: 'cf-dans-imposte' });
    const boutiqueFond = (par) => {
      rect(par, 272, 244, 86, 236, '#6B4A33');
      rect(par, 272, 244, 86, 236, lin([[0, '#2A1A10', 0.8], [0.35, '#2A1A10', 0.1], [1, '#2A1A10', 0.2]]));
      // le mur aux clés (des clés vierges accrochées en rangs, laiton et nickel)
      rect(par, 296, 292, 50, 44, '#3A2A1E');
      const kb = seau();
      for (let j = 0; j < 6; j++) for (let i = 0; i < 11; i++) {
        const x = 299 + i * 4.3 + (j % 2) * 1.2, y = 296 + j * 6.8;
        kb.add((i + j) % 3 ? '#D8B45E' : '#C9CDD0', dRR(x, y, 1.8, 4.6, 0.8));
      }
      kb.flush(par);
      const pb = seau(); // les étagères de cirages et de lacets
      [[276, 300, 18], [276, 318, 18]].forEach(([x, y, w]) => {
        pb.add('#3A2616', dR(x, y, w, 1.8));
        for (let k = 0; k < 4; k++) pb.add(['#C8262C', '#2F6FB8', '#E9B04A', '#2E684B', '#F2EEE6'][(k + y) % 5], dRR(x + 1 + k * 4.3, y - 6, 3.4, 6, 0.8));
      });
      pb.flush(par);
      // le comptoir, la machine à clés dessus
      rect(par, 272, 352, 86, 62, '#5A3A24');
      for (let x = 276; x < 356; x += 9) rect(par, x, 356, 7, 54, 'none', { stroke: '#7A5234', 'stroke-width': 0.6 });
      rect(par, 272, 349, 86, 3.6, '#A57A56');
      rect(par, 272, 349, 86, 1, '#D2AA80');
      rect(par, 318, 339, 18, 10, '#8E9296', { rx: 1 });
      rect(par, 322, 335, 6, 4.6, '#C8262C', { rx: 0.6 });
      S('ellipse', { cx: 332, cy: 344, rx: 3, ry: 3, fill: '#5E6266' }, par);
      // le parquet, et le tapis en forme de semelle de basket
      rect(par, 272, 412, 86, 66, lin([[0, '#7E5234'], [1, '#B98556']]));
      const lames = [];
      for (let xb = 220; xb <= 420; xb += 11) lames.push(`M${f(314 + (xb - 314) * 0.55)} 412L${f(xb)} 478`);
      path(par, lames.join(''), 'none', { stroke: '#5E3C22', 'stroke-width': 0.6, opacity: 0.55 });
      path(par, CO.closedPath([[280, 446], [302, 440], [326, 441], [340, 447], [338, 455], [320, 459], [296, 460], [278, 455]], 1), '#8E8C88');
      const cr = [];
      for (let x = 284; x < 338; x += 5) cr.push(`M${x} 444.5v13`);
      path(par, cr.join(''), 'none', { stroke: '#6F6D69', 'stroke-width': 1.2 });
      // la suspension de la boutique et sa grande lueur
      path(par, 'M314 244V276', 'none', { stroke: '#1A1A1A', 'stroke-width': 0.6 });
      path(par, 'M305 285Q305 275 314 274.6Q323 275 323 285Z', '#E7C391');
      S('ellipse', { cx: 314, cy: 285.2, rx: 8.6, ry: 1.6, fill: '#FFF3D0' }, par);
      S('ellipse', { cx: 314, cy: 350, rx: 70, ry: 120, fill: rad([[0, '#FFE2AE', 0.62], [0.45, '#F4B870', 0.3], [1, '#A5653A', 0]]), class: 'cf-lueur', style: 'mix-blend-mode:screen' }, par);
      path(par, 'M305 286L323 286L356 440L272 440Z', lin([[0, '#FFF0C8', 0.28], [1, '#FFF0C8', 0]]), { style: 'mix-blend-mode:screen' });
    };
    boutiqueFond(dansPorte);
    boutiqueFond(dansImposte);
    const chant = path(dedans, '', 'none', { stroke: '#FFD98E', 'stroke-width': 1.3, 'stroke-linecap': 'round', opacity: 0.8 });

    // les voiles « fermé » (l'intérieur tamisé) et « soir » (l'atelier brille plus fort)
    const tamis = [atelier, dansPorte, dansImposte].map((g) => rect(g, 20, 240, 360, 240, '#0E0906', { opacity: 0, class: 'cf-tamis' }));
    const nuitDedans = [atelier, dansPorte].map((g) => S('ellipse', { cx: g === atelier ? 150 : 314, cy: 322, rx: g === atelier ? 170 : 80, ry: 120, fill: rad([[0, '#FFC47A', 0.34], [0.6, '#FFB266', 0.16], [1, '#FFB266', 0]]), opacity: 0 }, g));

    /* ======================================================================
       Les vinyles collés aux vitres
       ====================================================================== */
    // le logo CORDO63 sur l'imposte, en traits dorés (il s'allume quand le reflet passe)
    const idLogo = U('lg');
    const logoOr = S('linearGradient', { id: idLogo, gradientUnits: 'userSpaceOnUse', x1: -400, y1: 0, x2: -380, y2: 0 }, defs);
    [[0, '#E6CB8E'], [0.35, '#FFF3CF'], [0.5, '#FFFFFF'], [0.65, '#FFF3CF'], [1, '#E6CB8E']].forEach(([o, c]) => S('stop', { offset: o, 'stop-color': c }, logoOr));
    {
      const lg = G(vinyles, { class: 'cf-logo', 'clip-path': `url(#${clipImp})` });
      const hL = 6.6, kLg = hL / 100, esp = 3.6, txt = 'CORDO63';
      const larg = [...txt].reduce((s, ch) => s + LOGO[ch].w, 0) * kLg + esp * (txt.length - 1);
      let x = IMPOSTE[0] + (IMPOSTE[2] - larg) / 2;
      const d = [...txt].map((ch) => { const s = LOGO[ch].d(plume(x, 255.2, kLg)); x += LOGO[ch].w * kLg + esp; return s; }).join('');
      path(lg, d, 'none', { stroke: `url(#${idLogo})`, 'stroke-width': 0.95, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    }
    // sur la vitre du vantail : la pancarte OUVERT / FERMÉ (elle suit la porte) et le vinyle des horaires
    const clipVitreP = U('cv');
    const vitreClipP = S('path', {}, S('clipPath', { id: clipVitreP }, defs));
    const surVitre = G(G(vinyles, { 'clip-path': `url(#${clipVitreP})` }), { class: 'cf-sur-vitre' });
    LT.push([surVitre, 314.5, 330]);
    const pancarte = G(surVitre, { class: 'cf-pancarte' });
    S('circle', { cx: 314.5, cy: 288, r: 1.4, fill: '#D8D2C4' }, pancarte);
    path(pancarte, 'M302.5 297L314.5 289L326.5 297', 'none', { stroke: '#D9C9A8', 'stroke-width': 0.6 });
    rect(pancarte, 298.5, 297, 32, 12.5, '#F4ECDC', { rx: 1.6, stroke: P.vertOmbre, 'stroke-width': 0.8 });
    const pancarteT = texte(pancarte, 'OUVERT', 314.5, 306.4, 7, FONTE.chiffres + ';font-weight:800', { 'text-anchor': 'middle', fill: '#3E6B45', 'letter-spacing': 0.5 });
    const horV = G(surVitre, { class: 'cf-horaires-vinyle', fill: '#F7F4EC', 'text-anchor': 'middle' });
    const idHor = U('hg');
    const horOr = S('linearGradient', { id: idHor, gradientUnits: 'userSpaceOnUse', x1: -400, y1: 0, x2: -380, y2: 0 }, defs);
    [[0, '#F7F4EC'], [0.35, '#FFF1C4'], [0.5, '#FFD978'], [0.65, '#FFF1C4'], [1, '#F7F4EC']].forEach(([o, c]) => S('stop', { offset: o, 'stop-color': c }, horOr));
    texte(horV, 'HORAIRES', 314.5, 358, 4.6, FONTE.large + ';font-weight:700', { 'letter-spacing': 0.8, fill: `url(#${idHor})` });
    rect(horV, 304.5, 360.4, 20, 0.35, '#F7F4EC');
    texte(horV, 'MARDI → SAMEDI', 314.5, 366.4, 3.4, FONTE.sans + ';font-weight:700', { 'letter-spacing': 0.15 });
    texte(horV, '10h – 13h30', 314.5, 373, 4.4, FONTE.chiffres + ';font-weight:700');
    texte(horV, '14h30 – 19h', 314.5, 379, 4.4, FONTE.chiffres + ';font-weight:700');
    rect(surVitre, 330, 388, 7.4, 5, '#1F4F9C', { rx: 0.8 });
    rect(surVitre, 331, 389.2, 5.4, 1.1, '#F2D24A');
    rect(surVitre, 320, 388, 8.4, 5, '#F4F3EE', { rx: 0.8 });
    S('circle', { cx: 322.4, cy: 390.5, r: 1.3, fill: '#C8262C' }, surVitre);
    S('circle', { cx: 324.3, cy: 390.5, r: 1.3, fill: '#E9B04A', opacity: 0.85 }, surVitre);

    /* ======================================================================
       Les reflets (toujours découpés aux vitres)
       ====================================================================== */
    const clipVerres = U('cg');
    const clg = S('clipPath', { id: clipVerres }, defs);
    PANES.concat([IMPOSTE]).forEach(([x, y, w, h]) => rect(clg, x, y, w, h, null));
    const verreVantailP = S('path', {}, clg);
    const refletsG = G(reflets, { 'clip-path': `url(#${clipVerres})` });
    const teinte = G(refletsG, { class: 'cf-teinte' });
    rect(teinte, 20, 248, 260, 150, lin([[0, '#DCE6EA', 0.3], [0.3, '#DCE6EA', 0.08], [1, '#DCE6EA', 0.03]]));
    rect(teinte, 275, 248, 79, 20, lin([[0, '#DCE6EA', 0.3], [1, '#DCE6EA', 0.12]]));
    const teinteVantail = path(teinte, '', lin([[0, '#DCE6EA', 0.26], [0.4, '#DCE6EA', 0.06], [1, '#DCE6EA', 0.03]]));
    {
      const st = [];
      PANES.forEach(([x, y, w, h]) => {
        st.push(dPoly([[x + w * 0.1, y + h], [x + w * 0.62, y], [x + w * 0.78, y], [x + w * 0.26, y + h]]));
        st.push(dPoly([[x + w * 0.72, y + h], [x + w * 1.12, y], [x + w * 1.18, y], [x + w * 0.78, y + h]]));
      });
      path(teinte, st.join(''), '#FFFFFF', { opacity: 0.05 });
      path(teinte, 'M20 394V372Q60 366 110 370T210 368T290 371V394Z', '#EDE6D6', { opacity: 0.06 });
    }
    // le reflet qui passe (il allume au passage le logo de l'imposte et le mot HORAIRES)
    const sheen = G(refletsG, { class: 'cf-sheen' });
    const bande = G(sheen, { transform: 'translate(-60 0)', opacity: 0 });
    rect(bande, 60, 240, 20, 170, '#FFFFFF', { opacity: 0.2, transform: 'skewX(-18)' });
    rect(bande, 84, 240, 6, 170, '#FFFFFF', { opacity: 0.12, transform: 'skewX(-18)' });

    /* ======================================================================
       La vie : la lumière de la porte, sur le trottoir et en halo ; les lueurs du soir
       ====================================================================== */
    // les flaques de lumière sur le trottoir : des demi-ellipses dont le bord coïncide avec l'extinction
    // de leur dégradé radial (ancré au milieu du bord haut, demi-largeur, pleine hauteur) : aucun bord dur
    const nappe = (stops) => rad(stops, { cx: 0.5, cy: 0, fx: 0.5, fy: 0, r: 1, gradientTransform: 'translate(.5 0) scale(.5 1) translate(-.5 0)' });
    const demiEll = (cx, y, rx, ry) => `M${f(cx - rx)} ${y}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx + rx)} ${y}Z`;
    const flaque = G(vie, { style: 'mix-blend-mode:screen' });
    const flaqueP = path(flaque, '', nappe([[0, '#FFE0A8', 1], [0.3, '#FFCF86', 0.72], [0.65, '#FFC878', 0.3], [1, '#FFC878', 0]]));
    const vitrinesSol = G(lueurs, { style: 'mix-blend-mode:screen' }); // le soir, les vitrines éclairent le trottoir
    const nappeV = nappe([[0, '#FFCF8A', 0.62], [0.45, '#FFCF8A', 0.3], [1, '#FFCF8A', 0]]);
    [[104, 124, 52], [241, 56, 44]].forEach(([cx, rx, ry]) => path(vitrinesSol, demiEll(cx, 478, rx, ry), nappeV));
    const halo = G(vie, { class: 'cf-halo', style: 'mix-blend-mode:screen' });
    const haloE = S('ellipse', { cx: 288, cy: 372, rx: 30, ry: 130, fill: rad([[0, '#FFDCA4', 0.75], [0.5, '#FFC47A', 0.28], [1, '#FFC47A', 0]]) }, halo);
    const moutes = G(halo, { class: 'cf-moutes' });
    const moutesEls = [];
    for (let k = 0; k < 3; k++) {
      const dansFente = k % 2 === 0;
      moutesEls.push(S('circle', { cx: f(dansFente ? 281 + R() * 14 : 250 + R() * 70), cy: f(dansFente ? 380 + R() * 70 : 478 + R() * 36), r: f(0.5 + R() * 0.6), fill: '#FFF2CC', opacity: 0 }, moutes));
    }
    // l'entrée : quand la porte s'ouvre en grand pour qu'on entre, la lumière de la boutique déborde, loin sur le
    // trottoir, dans l'embrasure et sur le dormant (éteinte le reste du temps)
    const entreeLum = G(vie, { class: 'cf-entree-lumiere', opacity: 0, style: 'mix-blend-mode:screen' });
    path(entreeLum, demiEll(314.5, 477.5, 120, 98), nappe([[0, '#FFE6B6', 1], [0.35, '#FFD394', 0.62], [0.7, '#FFC878', 0.22], [1, '#FFC878', 0]]));
    S('ellipse', { cx: 314.5, cy: 370, rx: 64, ry: 136, fill: rad([[0, '#FFE4B2', 0.6], [0.55, '#FFCB84', 0.3], [1, '#FFCB84', 0]]) }, entreeLum);
    rect(entreeLum, 275, 266, 4, 208, lin([[0, '#FFD28A', 0.1], [0.45, '#FFD28A', 0.65], [1, '#FFD28A', 0.3]]));
    rect(entreeLum, 350, 266, 4, 208, lin([[0, '#FFD28A', 0.1], [0.45, '#FFD28A', 0.5], [1, '#FFD28A', 0.25]]));
    rect(entreeLum, 273, 472.4, 83, 6.2, lin([[0, '#FFE8BC', 0.85], [1, '#FFE8BC', 0.2]]));
    // la lanterne, le soir : sa lueur, et le mur qu'elle éclaire
    const lueurLant = G(lueurs, { style: 'mix-blend-mode:screen' });
    S('ellipse', { cx: 405, cy: 228, rx: 80, ry: 92, fill: rad([[0, '#FFE2A0', 0.5], [0.35, '#FFD48A', 0.16], [1, '#FFD48A', 0]]) }, lueurLant);
    S('ellipse', { cx: 405, cy: 225, rx: 13, ry: 15, fill: rad([[0, '#FFF6D8', 0.95], [1, '#FFE6A8', 0]]) }, lueurLant);
    // à l'étage, quelqu'un est rentré : la fenêtre au balconnet s'allume derrière son voilage
    rect(lueurLant, 322, -22, 52, 148, lin([[0, '#FFD89A', 0.16], [0.6, '#FFCB80', 0.3], [1, '#FFC070', 0.4]]));
    // et le bandeau, que la lanterne et la boutique réchauffent un peu
    S('ellipse', { cx: 290, cy: 206, rx: 120, ry: 48, fill: rad([[0, '#FFD08A', 0.2], [1, '#FFD08A', 0]]) }, lueurLant);

    /* ======================================================================
       Devant : le poteau du sens interdit, au coin ; l'ardoise « Déposez vos paires ! »
       ====================================================================== */
    const poteau = G(devant, { class: 'cf-poteau' });
    rect(poteau, -10.6, 296, 3.2, 210, lin([[0, '#8B9194'], [0.5, '#C9CED0'], [1, '#6F7578']], { x2: 1, y2: 0 }));
    S('circle', { cx: -9, cy: 322, r: 11, fill: '#C8262C', stroke: '#F4F3EE', 'stroke-width': 1.1 }, poteau);
    rect(poteau, -16.4, 320, 14.8, 4, '#F4F3EE', { rx: 0.4 });
    S('circle', { cx: -9, cy: 322, r: 11, fill: rad([[0, '#fff', 0.18], [1, '#fff', 0]], { cx: 0.35, cy: 0.3 }) }, poteau);
    rect(poteau, -17, 337, 16, 9, '#F4F3EE', { rx: 0.6, stroke: '#9A9A96', 'stroke-width': 0.4 });
    texte(poteau, 'SAUF', -9, 342.6, 3.4, FONTE.chiffres + ';font-weight:700', { 'text-anchor': 'middle', fill: '#2A2A2A' });
    // l'ardoise « Déposez vos paires ! » : seulement sur demande (opts.ardoise), la scène reste dégagée
    const ardoise = G(devant, { class: 'cf-ardoise' });
    if (!opts.ardoise) ardoise.setAttribute('display', 'none');
    {
      const A = G(ardoise, { transform: 'translate(66 574) scale(1.3)' }); // premier plan : plus grande, plus bas, coupée par le bas du cadre
      path(A, 'M-26 0L-21 -110M26 0L21 -110', 'none', { stroke: '#8A5E3B', 'stroke-width': 3.2, 'stroke-linecap': 'round' });
      path(A, 'M-24.4 -40H24.4', 'none', { stroke: '#6E4A2E', 'stroke-width': 1.6 });
      path(A, 'M-25 -112H25L28.5 -44H-28.5Z', '#B98A5C');
      path(A, 'M-22 -108.5H22L25 -48H-25Z', '#262826');
      path(A, 'M-22 -108.5H22L25 -48H-25Z', lin([[0, '#fff', 0.07], [1, '#fff', 0]], { x2: 1, y2: 1 }));
      path(A, 'M-25 -112H25L25.4 -110H-25.4Z', '#D8AC7A');
      const craie = G(A, { fill: '#F2F0EA', 'text-anchor': 'middle' });
      texte(craie, 'Déposez', 0, -93, 11.5, FONTE.stylo + ';font-weight:400');
      texte(craie, 'vos paires !', 0, -79, 10.4, FONTE.stylo + ';font-weight:400');
      // une basket à la craie, et une flèche vers la porte
      const b = [];
      b.push('M-13 -58Q-12.6 -66 -9 -67Q-6 -67.4 -4 -64Q2 -61 8 -60.4Q12.4 -60 12.6 -57.4Q12.4 -55.6 10 -55.6L-12 -55.6Q-13.2 -56 -13 -58Z');
      b.push('M-12 -58.6L10.8 -58.6M-5 -64.6L-3 -61.6M-2.4 -63.2L-0.6 -60.6');
      path(A, b.join(''), 'none', { stroke: '#F2F0EA', 'stroke-width': 0.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 });
      path(A, 'M15 -64Q19 -67 21 -61M21 -61l-2.4 -.6M21 -61l.4 -2.4', 'none', { stroke: '#F2F0EA', 'stroke-width': 0.7, 'stroke-linecap': 'round', opacity: 0.85 });
    }

    /* ======================================================================
       La chaleur : quand on passe le seuil, la lumière de la boutique monte et se réchauffe. Un calque HTML
       posé sur l'hôte, au-dessus du SVG (son fondu ne coûte rien : le compositeur s'en charge) ; au bout de
       l'entrée, l'embrasure est au centre de l'écran, et la lumière avec elle.
       ====================================================================== */
    const chaleur = document.createElement('div');
    chaleur.className = 'cf-chaleur';
    chaleur.setAttribute('aria-hidden', 'true');
    chaleur.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;opacity:0;' +
      'background:radial-gradient(ellipse 72% 62% at 50% 52%, rgba(255,246,226,.97) 0%, rgba(255,228,176,.9) 34%, rgba(255,203,132,.72) 70%, rgba(233,164,96,.55) 100%)';

    /* ======================================================================
       Les zones à toucher (transparentes) : une seule pour la boutique (vitrine, porte, Clément)
       ====================================================================== */
    const ecoutes = new Map();
    const emettre = (nom, ...a) => (ecoutes.get(nom) || []).slice().forEach((fn) => { try { fn(...a); } catch (e) { console.warn('facade', nom, e); } });
    const zone = (id, x, y, w, h, label) => {
      const el = rect(touches, x, y, w, h, '#fff', { 'fill-opacity': 0, class: 'cf-hit cf-hit-' + id, role: 'button', tabindex: 0, 'aria-label': label, rx: 2, 'data-cible': id });
      el.addEventListener('keydown', (e) => { // au clavier, Entrée et Espace valent un clic
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      });
      el.addEventListener('click', (e) => emettre('cible', id, e));
      return el;
    };
    const cibles = {
      boutique: zone('boutique', 0, 244, 378, 236, "Entrer dans la boutique : l'atelier de Clément"),
      bandeau: zone('bandeau', 96, 146, 284, 98, "L'enseigne CORDONNERIE"),
      enseigne: zone('enseigne', ENS.x, ENS.y, ENS.w, ENS.h, "L'enseigne : une Air Jordan 1 sculptée dans le bois"),
      chevalet: opts.ardoise ? zone('chevalet', 30, 424, 72, 136, 'L’ardoise : déposez vos paires') : null,
    };

    /* ======================================================================
       La porte : projection, lumière, clip de la boutique
       ====================================================================== */
    let lumK = 1; // intensité de la lumière qui sort (plus forte le soir, plus faible fermé)
    function poser() {
      LP.forEach(([el, fn]) => el.setAttribute('d', fn()));
      LT.forEach(([el, cx, cy]) => el.setAttribute('transform', affine(cx, cy)));
      const s = Math.sin(theta), L = s / Math.sin(GRAND); // la part de lumière qui sort : 0 fermée, 1 grande ouverte
      ombreVantail.setAttribute('opacity', (0.04 + 0.3 * s).toFixed(3));
      const th = proj(VA.x, VA.y), bh = proj(VA.x, VA.y + VA.h);
      const verreQ = quadD(VA.vx, VA.vy, VA.vw, VA.vh);
      clipPorteP.setAttribute('d', `M279 270H350L${f(th[0])} ${f(th[1])}L${f(bh[0])} ${f(bh[1])}L350 474H279Z` + verreQ);
      vitreClipP.setAttribute('d', verreQ);
      verreVantailP.setAttribute('d', verreQ);
      teinteVantail.setAttribute('d', verreQ);
      const ouv = theta > 0.02;
      chant.setAttribute('d', ouv ? `M${f(th[0])} ${f(th[1] + 1)}L${f(bh[0])} ${f(bh[1] - 1)}` : '');
      const bx = bh[0];
      flaqueP.setAttribute('d', ouv ? demiEll((279 + bx) / 2 - 4, 477.5, 44 + (bx - 279) * 1.3, 60 + 26 * L) : '');
      flaque.setAttribute('opacity', Math.min(1, lumK * (0.25 + 0.75 * L) * (ouv ? 1 : 0)).toFixed(3));
      haloE.setAttribute('cx', f((279 + bx) / 2));
      haloE.setAttribute('rx', f(16 + (bx - 279) * 1.1));
      halo.setAttribute('opacity', Math.min(1, lumK * Math.min(1, L * 1.4)).toFixed(3));
    }
    let tourPorte = 0;
    async function pivoter(th, ms, ease = CO.ease.inOutSine, lent = false) {
      const id = ++tourPorte, th0 = theta;
      if (CO.reduced || ms <= 0) { theta = th; poser(); return; }
      await (lent ? geste : CO.tween)(ms, (e) => { if (id === tourPorte) { theta = th0 + (th - th0) * e; poser(); } }, ease);
    }
    function balancerPancarte(amp) { // la pancarte se balance sur sa cordelette, autour de sa ventouse
      if (CO.reduced) return;
      CO.tween(1500, (e) => pancarte.setAttribute('transform', `rotate(${f(amp * Math.exp(-3.2 * e) * Math.sin(e * 15))} 314.5 288)`));
    }
    poser();

    /* ======================================================================
       Clément : le pantin
       ====================================================================== */
    const EP = [17.5, -142]; // l'épaule droite
    const orient = (g, ax, ay, bx, by, L) => { // un segment dessiné de (0,0) vers (0,L), posé de A vers B
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 0.01;
      g.setAttribute('transform', `translate(${f(ax)} ${f(ay)}) rotate(${f((Math.atan2(-dx, dy) * 180) / Math.PI)}) scale(1 ${(len / L).toFixed(3)})`);
    };
    // les poses de la main droite : coude, main, angle du marteau (0 = manche vers le haut), longueur apparente du manche
    const POSES = {
      repos: { c: [19.4, -116.5], m: [19.2, -127.4], a: 110, l: 0.34 },
      mi: { c: [26, -122], m: [27, -141], a: 42, l: 0.66 },
      leve: { c: [27, -129], m: [24, -151.6], a: -14, l: 0.92 },
      bas: { c: [19.6, -114], m: [15, -118], a: 150, l: 0.3 },
    };
    const etat = { c: POSES.repos.c.slice(), m: POSES.repos.m.slice(), a: POSES.repos.a, l: POSES.repos.l, marteau: 1 };
    function poserBras() {
      orient(segBras, EP[0], EP[1], etat.c[0], etat.c[1], 26);
      orient(segAvant, etat.c[0], etat.c[1], etat.m[0], etat.m[1], 24);
      segMain.setAttribute('transform', `translate(${f(etat.m[0])} ${f(etat.m[1])}) rotate(${f(etat.a)})`);
      manche.setAttribute('transform', `scale(1 ${etat.l.toFixed(3)})`);
      teteMarteau.setAttribute('transform', `translate(0 ${f(-24 * etat.l)})`);
      manche.setAttribute('opacity', etat.marteau);
      teteMarteau.setAttribute('opacity', etat.marteau);
    }
    /** Comme CO.tween, mais à ~30 images/s : Clément bouge presque sans cesse, deux fois moins de repeints
        (la dernière image est toujours jouée) */
    const geste = (ms, fn, ease = CO.ease.linear) => new Promise((resolve) => {
      const t0 = performance.now();
      let prec = -1e9;
      const pas = (now) => {
        const p = Math.max(0, Math.min(1, (now - t0) / ms));
        if (p >= 1 || now - prec >= 31) { prec = now; fn(ease(p), p); }
        if (p < 1) requestAnimationFrame(pas); else resolve();
      };
      requestAnimationFrame(pas);
    });
    const lerpPose = (A, B, e) => ({ c: [CO.lerp(A.c[0], B.c[0], e), CO.lerp(A.c[1], B.c[1], e)], m: [CO.lerp(A.m[0], B.m[0], e), CO.lerp(A.m[1], B.m[1], e)], a: CO.lerp(A.a, B.a, e), l: CO.lerp(A.l, B.l, e) });
    const allerA = (chemin, ms, ease, apres) => geste(ms, (e) => { // suit une suite de poses (arc naturel)
      const n = chemin.length - 1, t = Math.min(n - 1e-6, e * n), i = Math.floor(t);
      Object.assign(etat, lerpPose(chemin[i], chemin[i + 1], t - i));
      poserBras();
      if (apres) apres(e);
    }, ease);
    poserBras();
    const poserCorps = (dx = 0, dy = 0) => corps.setAttribute('transform', `translate(${f(CL.x + dx * CL.k)} ${f(CL.y + dy * CL.k)}) scale(${CL.k})`);

    /* ======================================================================
       API
       ====================================================================== */
    host.appendChild(svg);
    host.appendChild(chaleur);
    let nuit = false, ouvert = true, frappeTour = 0, vivant = false, toque = false, entre = false;
    let camCadre = null, camAnim = null, yawEns = 0;
    const visible = () => CO.ambiance.visible(host);
    const son = (nom, o) => { if (visible()) CO.sfx.play(nom, o); };

    function ombre(yaw = yawEns) {
      yawEns = yaw;
      // la lumière : le soleil en haut à gauche le jour, la lanterne à droite le soir
      const kx = nuit ? -0.55 : 0.32, ky = nuit ? 0.3 : 0.5, bras = 10;
      const s = Math.sin(yaw), c0 = Math.cos(yaw) - kx * s;
      const c = Math.abs(c0) < 0.14 ? (c0 < 0 ? -0.14 : 0.14) : c0;
      const e = ANCRE.x * (1 - c) + bras * kx, fy = bras * ky + ky * s * ANCRE.x;
      ombreIn.setAttribute('transform', `matrix(${c.toFixed(4)} ${(-ky * s).toFixed(4)} 0 1 ${f(e)} ${f(fy)})`);
    }
    ombre(0);

    function appliquer(ms = 1200) {
      const tr = `opacity ${ms}ms ease`;
      [voile, lueurs, ombreEns].forEach((el) => { el.style.transition = tr; });
      voile.style.opacity = nuit ? '0.58' : '0';
      lueurs.style.opacity = nuit ? '1' : '0';
      ombreEns.style.opacity = nuit ? '0.34' : '0.58';
      flamme.setAttribute('opacity', nuit ? 1 : 0);
      vitreLant.setAttribute('fill', nuit ? '#FFE9B8' : '#B9BDB9');
      if (!entre) { reflets.style.transition = tr; reflets.style.opacity = nuit ? '0.4' : '1'; }
      nuitDedans.forEach((el) => { el.style.transition = tr; el.style.opacity = nuit && ouvert ? '1' : '0'; });
      tamis.forEach((el, i) => { el.style.transition = tr; el.style.opacity = ouvert || (entre && i > 0) ? '0' : i === 0 ? '0.62' : '0.45'; });
      [lampes, cone].forEach((el) => { el.style.transition = tr; el.style.opacity = ouvert ? '1' : '0.15'; });
      const k1 = nuit ? 0.55 : 0;
      if (Math.abs(k1 - voileK) > 0.002) {
        const k0 = voileK, tour = ++voileTour;
        if (CO.reduced || ms <= 0) voileDevant(k1);
        else CO.tween(ms, (e) => { if (tour === voileTour) voileDevant(k0 + (k1 - k0) * e); }, CO.ease.inOutSine);
      }
      lumK = entre ? lumEntree() : lumRepos();
      ombre();
      poser();
    }
    const lumRepos = () => (ouvert ? 1 : 0.55) * (nuit ? 1.25 : 1); // la lumière qui sort de la porte, au repos
    const lumEntree = () => (nuit ? 2.2 : 1.8); // et quand elle s'ouvre en grand pour qu'on entre

    function montrerClement(on, ms = 600) {
      clementG.style.transition = `opacity ${ms}ms ease`;
      clementG.style.opacity = on ? '1' : '0';
      marteauPose.setAttribute('opacity', on ? 0 : 1);
    }

    /* ---------- la vie de Clément : il frappe, regarde, passe parfois une chaussure à la finisseuse ---------- */
    async function frappe(force = 1) {
      await allerA([POSES.repos, POSES.mi, POSES.leve], 340 + Math.random() * 120, CO.ease.inOutSine);
      await CO.wait(40 + Math.random() * 80);
      await allerA([POSES.leve, POSES.mi, POSES.repos], 105, CO.ease.inQuad);
      son('hammer', { gain: 0.42 * force });
      await allerA([POSES.repos, { ...POSES.repos, m: [19.6, -129.4], a: 100, l: 0.4 }, POSES.repos], 150, CO.ease.outQuad, (e) => {
        const k = 1 - e; // le choc : le corps tassé d'un demi-centimètre, la chaussure qui tressaute
        poserCorps(0, 0.6 * k);
        piedChaussure.setAttribute('transform', k > 0.02 ? `translate(0 ${f(0.7 * k)})` : '');
      });
    }
    async function regarder() { // il penche la tête vers la semelle, vérifie, se redresse
      const d = 1300 + Math.random() * 600;
      await geste(d, (e, p) => {
        const k = p < 0.3 ? CO.ease.inOutSine(p / 0.3) : p < 0.7 ? 1 : 1 - CO.ease.inOutSine((p - 0.7) / 0.3);
        hocher(7 * k, 0.6 * k);
      });
      hocher(0);
    }
    function poncer() { // des poussières dorées s'envolent de la brosse (en boucle, le temps du ponçage)
      return grains.map((g, i) => {
        const dx = -4 - Math.random() * 14, dy = -6 + Math.random() * 12;
        return CO.ambiance.anime(g.animate([
          { transform: 'translate(0px, 0px)', opacity: 0.95 },
          { transform: `translate(${f(dx * 0.6)}px, ${f(dy * 0.6 - 3)}px)`, opacity: 0.8, offset: 0.5 },
          { transform: `translate(${f(dx)}px, ${f(dy + 5)}px)`, opacity: 0 },
        ], { duration: 520 + Math.random() * 380, delay: i * 60, iterations: Infinity, easing: 'ease-out' }), host);
      });
    }
    async function aLaFinisseuse() {
      await allerA([POSES.repos, POSES.bas], 260, CO.ease.inOutSine);
      etat.marteau = 0;
      poserBras();
      marteauPose.setAttribute('opacity', 1);
      // il fait un pas vers la gauche, la tête tourne ; ses mains passent la chaussure à la dernière brosse
      const tourner = (u) => {
        poserCorps(-14 * u, 0);
        tournerTete(u);
        brasG.setAttribute('transform', `translate(-17.5 -142) rotate(${f(12 - 70 * u)})`);
        segAvant.setAttribute('opacity', (1 - u).toFixed(3)); // l'avant-bras passe devant lui : caché
        segMain.setAttribute('opacity', (1 - u).toFixed(3));
      };
      await geste(460, tourner, CO.ease.inOutSine);
      aLaBrosse.style.transition = 'opacity .18s ease';
      aLaBrosse.style.opacity = '1';
      const duree = 1800 + Math.random() * 1200;
      son('grind', { dur: duree / 1000, gain: 0.55 });
      const bouge = CO.ambiance.anime(chaussureBrosse.animate([{ transform: 'translate(0px, 0px) rotate(0deg)' }, { transform: 'translate(0.8px, -1.4px) rotate(-6deg)' }, { transform: 'translate(-0.4px, 1px) rotate(4deg)' }, { transform: 'translate(0px, 0px) rotate(0deg)' }], { duration: 900, iterations: Infinity, easing: 'ease-in-out' }), host);
      const poussiere = poncer();
      await CO.wait(duree);
      bouge.cancel();
      poussiere.forEach((a) => a.cancel());
      aLaBrosse.style.opacity = '0';
      await CO.wait(180);
      await geste(460, (e) => tourner(1 - e), CO.ease.inOutSine);
      tourner(0);
      marteauPose.setAttribute('opacity', 0);
      etat.marteau = 1;
      await allerA([POSES.bas, POSES.repos], 260, CO.ease.inOutSine);
    }
    /** Les brosses de la finisseuse tournent (le moteur est coupé quand c'est fermé) : trois phases de 125 ms,
        à pleine vitesse on ne voit qu'un défilement flou */
    let defileAnim = null;
    function tourner(on) {
      if (defileAnim) { defileAnim.cancel(); defileAnim = null; }
      if (!on || CO.reduced || !vivant) return;
      defileAnim = CO.ambiance.anime(defile.animate([{ transform: 'translateY(0px)' }, { transform: 'translateY(2.6px)' }], { duration: 375, iterations: Infinity, easing: 'steps(3, jump-end)' }), host);
    }
    async function vieClement(tour) {
      await CO.wait(700);
      while (tour === frappeTour && svg.isConnected) {
        if (!ouvert || !visible()) { await CO.wait(800); continue; }
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n && tour === frappeTour && ouvert; i++) {
          await frappe(i === n - 1 ? 1 : 0.8);
          await CO.wait(90 + Math.random() * 160);
        }
        if (tour !== frappeTour || !ouvert) continue;
        await CO.wait(400 + Math.random() * 700);
        if (Math.random() < 0.5) await regarder();
        await CO.wait(900 + Math.random() * 1400);
        if (tour === frappeTour && ouvert && visible() && Math.random() < 0.45) {
          await CO.wait(200);
          await aLaFinisseuse();
          await CO.wait(400 + Math.random() * 500);
        }
      }
    }

    // le reflet passe de temps en temps (≈ toutes les 15 s, quand la devanture se voit) ; il allume au passage
    // le mot HORAIRES de la porte et le logo de l'imposte. Piloté ici le temps du passage : rien entre deux.
    const TAN18 = Math.tan((18 * Math.PI) / 180);
    function poserReflet(tx, op) {
      bande.setAttribute('transform', `translate(${f(tx)} 0)`);
      bande.setAttribute('opacity', op.toFixed(3));
      [[horOr, 358, 16], [logoOr, 259, 22]].forEach(([g, y, l]) => { // le centre de la bande à la hauteur y : 70 + tx − y·tan 18°
        const c = 70 + tx - y * TAN18;
        g.setAttribute('x1', f(c - l / 2));
        g.setAttribute('x2', f(c + l / 2));
      });
    }
    async function reflet() {
      await CO.wait(2500 + Math.random() * 2500);
      while (svg.isConnected) {
        if (visible() && !entre) {
          await geste(3600, (e, p) => poserReflet(-60 + 520 * p, p < 0.1 ? p / 0.1 : p > 0.9 ? (1 - p) / 0.1 : 1));
          poserReflet(-60, 0);
        }
        await CO.wait(9000 + Math.random() * 6000);
      }
    }

    /* ---------- la caméra ---------- */
    const suiveurs = new Set();
    function etatCamera() { const m = matrice(getComputedStyle(svg).transform); return { zoom: m[0], x: m[4], y: m[5] }; }
    function signaler() { if (!suiveurs.size) return; const e = etatCamera(); suiveurs.forEach((fn) => { try { fn(e); } catch (er) { console.warn('facade', er); } }); }
    /** Le cadre voulu → une transformation CSS du <svg> (px de l'hôte, origine en haut à gauche). Deux sortes de
        cadres : un rectangle de la scène (centré, entièrement visible, à 80 % de l'écran) ou { cx, cy, zoom } */
    function cadreCamera(r) {
      const W = host.clientWidth, H = host.clientHeight;
      if (!W || !H) return null;
      if (!r) return 'none';
      const s = Math.min(W / 400, H / 560), ox = W / 2 - 200 * s, oy = H - 560 * s;
      const k = r.zoom || 0.8 * Math.min(W / (r.w * s), H / (r.h * s));
      const cx = ox + (r.cx != null ? r.cx : r.x + r.w / 2) * s, cy = oy + (r.cy != null ? r.cy : r.y + r.h / 2) * s;
      return `translate(${(W / 2 - k * cx).toFixed(1)}px, ${(H / 2 - k * cy).toFixed(1)}px) scale(${k.toFixed(4)})`;
    }
    const animerCamera = (r, ms, easing = 'cubic-bezier(.55,0,.2,1)') => animerCameraPas([{ cadre: r || null, offset: 1, easing }], ms);
    /** Un mouvement de caméra en plusieurs temps : pas = [{ cadre, offset, easing }…] (easing : celui qui mène
        à ce pas), le dernier est l'arrivée. Une seule animation (le compositeur la joue), suivre() à chaque image. */
    function animerCameraPas(pas, ms) {
      const tos = pas.map((p) => cadreCamera(p.cadre));
      camCadre = pas[pas.length - 1].cadre || null;
      if (tos.some((t) => t == null)) return Promise.resolve();
      const neutre = 'translate(0px, 0px) scale(1)', v = (t) => (t === 'none' ? neutre : t);
      const from = getComputedStyle(svg).transform, fin = tos[tos.length - 1];
      if (camAnim) camAnim.cancel();
      svg.style.transformOrigin = '0 0';
      svg.style.transform = fin === 'none' ? '' : fin;
      if (CO.reduced || ms <= 0) { signaler(); return Promise.resolve(); }
      const kf = [{ transform: from === 'none' ? neutre : from, easing: pas[0].easing || 'ease' }];
      pas.forEach((p, i) => kf.push({ transform: v(tos[i]), offset: p.offset, easing: (pas[i + 1] && pas[i + 1].easing) || 'linear' }));
      // (pas de will-change : Chrome rastériserait tout le calque à l'échelle maximale du mouvement, ×5, d'un
      // coup au départ ; redessinée à chaque image, la scène reste nette tout le long)
      const a = (camAnim = svg.animate(kf, { duration: ms }));
      let court = true;
      const boucle = () => { if (!court) return; signaler(); requestAnimationFrame(boucle); };
      requestAnimationFrame(boucle); // suivre() : chaque image du mouvement
      const fini = () => { court = false; if (camAnim === a) camAnim = null; };
      return a.finished.then(() => { fini(); signaler(); }, fini);
    }
    // l'entrée par la porte : le cadre de la porte vitrée, puis le seuil (dans l'embrasure, ×5)
    const CADRE_PORTE = { x: 262, y: 240, w: 104, h: 244 };
    const SEUIL = { cx: 314.5, cy: 368, zoom: 5 };
    let sequence = 0; // (une entrée ou une sortie en chasse une autre)
    /** L'opacité d'un calque, en fondu CSS (ms = 0 : tout de suite) */
    const regler = (el, op, ms = 0, delai = 0, ease = 'ease') => {
      el.style.transition = ms > 0 ? `opacity ${Math.round(ms)}ms ${ease} ${Math.round(delai)}ms` : 'none';
      el.style.opacity = String(op);
    };
    function matrice(t) {
      if (!t || t === 'none') return [1, 0, 0, 1, 0, 0];
      const n = t.match(/-?[\d.]+(?:e-?\d+)?/g);
      if (!n) return [1, 0, 0, 1, 0, 0];
      const v = n.map(Number);
      return t.startsWith('matrix3d') ? [v[0], v[1], v[4], v[5], v[12], v[13]] : v.slice(0, 6);
    }
    // si l'hôte change de taille, la caméra garde son cadrage (sans animation), et on prévient ceux qui suivent
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (camCadre && !camAnim) { const to = cadreCamera(camCadre); if (to) svg.style.transform = to === 'none' ? '' : to; }
      signaler();
    }).observe(host);

    const api = {
      svg,
      /** Les zones à toucher : { boutique, bandeau, enseigne, chevalet } (role="button", tabindex, aria-label ;
          data-cible = leur nom). Toucher l'une d'elles émet aussi l'événement 'cible' (voir on). */
      cibles,
      zoneEnseigne: { x: ENS.x, y: ENS.y, w: ENS.w, h: ENS.h },
      ancreEnseigne: { x: ANCRE.x, y: ANCRE.y },

      /** Les événements : on('cible', (id, event) => …) quand on touche (ou active au clavier) une zone :
          id ∈ 'boutique' | 'bandeau' | 'enseigne' | 'chevalet'. Renvoie de quoi se désabonner. */
      on(nom, fn) {
        (ecoutes.get(nom) || ecoutes.set(nom, []).get(nom)).push(fn);
        return () => { const l = ecoutes.get(nom) || [], i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
      },

      setNuit(on) {
        nuit = !!on;
        appliquer();
      },
      setStatut(st = {}) {
        const etaitOuvert = ouvert;
        ouvert = st.ouvert !== false;
        pancarteT.textContent = ouvert ? 'OUVERT' : 'FERMÉ';
        pancarteT.setAttribute('fill', ouvert ? '#3E6B45' : '#A13D3D');
        appliquer();
        montrerClement(ouvert);
        tourner(ouvert);
        if (etaitOuvert !== ouvert && !toque) {
          if (ouvert) { balancerPancarte(5); pivoter(ENTRE, 1100, CO.ease.outBack); } else pivoter(0, 900, CO.ease.inOutSine);
        }
      },

      /** La devanture se construit : elle se pose, les lettres s'allument une à une, l'atelier s'éclaire, la porte s'entrouvre */
      async play() {
        if (CO.reduced) return;
        const A = (el, kf, o) => el.animate(kf, { fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...o });
        const sfx = (n, ms, o = {}) => CO.sfx.play(n, { ...o, delay: ms });
        const tout = [];
        tourPorte++;
        theta = 0;
        poser();
        tout.push(A(svg, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' }));
        tout.push(A(mur, [{ opacity: 0.4 }, { opacity: 1 }], { duration: 500 }));
        tout.push(A(etage, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 100 }));
        tout.push(A(boutique, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 120 }));
        [dedans, reflets, vinyles].forEach((el) => tout.push(A(el, [{ transform: 'translateY(24px)' }, { transform: 'none' }], { duration: 650, delay: 120 }))); // (ils montent avec elle)
        tout.push(A(trottoir, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 200 }));
        tout.push(A(ardoise, [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 500 }));
        // les lettres dorées s'allument une à une, avec une note d'enclume chacune
        facesOr.forEach((L, i) => {
          tout.push(A(L, [{ opacity: 0 }, { opacity: 1, offset: 0.55 }, { opacity: 1 }], { duration: 380, delay: 700 + i * 85 }));
          etincelles[i].animate([{ opacity: 0, transform: 'scale(0) rotate(0deg)' }, { opacity: 1, transform: 'scale(1.3) rotate(45deg)', offset: 0.4 }, { opacity: 0, transform: 'scale(0) rotate(90deg)' }], { duration: 520, delay: 830 + i * 85 });
          sfx('rim', 700 + i * 85, { m: [72, 74, 76, 79, 81][i % 5] + (i > 4 ? 12 : 0), v: 0.7 });
        });
        // l'atelier s'éclaire : d'abord sombre, puis les lampes une à une
        tout.push(A(dedans, [{ opacity: 0.15 }, { opacity: 0.15, offset: 0.3 }, { opacity: 0.7, offset: 0.45 }, { opacity: 0.45, offset: 0.55 }, { opacity: 1 }], { duration: 1100, delay: 1500, easing: 'linear' }));
        [...lampes.children].forEach((l, i) => tout.push(A(l, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0.5, offset: 0.55 }, { opacity: 1 }], { duration: 500, delay: 1750 + i * 140 })));
        tout.push(A(vinyles, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 2000 }));
        // la porte s'entrouvre (si c'est ouvert), la lumière sort
        tout.push({ finished: CO.wait(2450).then(() => { if (!ouvert) return null; sfx('open', 0, { gain: 0.8 }); balancerPancarte(6); return pivoter(ENTRE, 950, CO.ease.outBack); }) });
        await Promise.all(tout.map((a) => a.finished.catch(() => {})));
      },

      /** La vie continue (les boucles sans fin passent par CO.ambiance : petite cadence, arrêt hors écran ;
          les gestes de Clément et le reflet vérifient que la devanture se voit) */
      idle(fige) {
        if (vivant) return;
        if (CO.reduced || fige === true || (fige && fige.fige)) {
          Object.assign(etat, POSES.leve); // une image arrêtée, vivante quand même : le marteau levé
          poserBras();
          return;
        }
        vivant = true;
        const vit = (a) => CO.ambiance.anime(a, host);
        tourner(ouvert);
        reflet();
        // la lumière de la porte respire (par petits paliers), des poussières dorées flottent dedans
        const paliers = { duration: 3000, direction: 'alternate', iterations: Infinity, easing: 'steps(8, jump-none)' };
        vit(haloE.animate([{ opacity: 0.7, easing: 'ease-in-out' }, { opacity: 1 }], paliers));
        vit(chant.animate([{ opacity: 0.55, easing: 'ease-in-out' }, { opacity: 0.95 }], paliers));
        // (toutes ces boucles changent sur la même grille de 125 ms : elles se repeignent ensemble, ~8 fois par seconde)
        moutesEls.forEach((m, i) => {
          const dx = (Math.random() - 0.5) * 16, dy = -(16 + Math.random() * 28);
          vit(m.animate([{ opacity: 0, transform: 'translate(0px, 0px)' }, { opacity: 0.9, offset: 0.35 }, { opacity: 0, transform: `translate(${f(dx)}px, ${f(dy)}px)` }], { duration: 6000, delay: i * 2000, iterations: Infinity, easing: 'steps(48, jump-none)' }));
        });
        // de temps en temps, un courant d'air pousse la porte (on a envie de la toucher)
        const courantDair = async () => {
          await CO.wait(9000 + Math.random() * 8000);
          if (!svg.isConnected) return;
          if (!toque && ouvert && !entre && visible()) {
            balancerPancarte(3.5);
            await pivoter(ENTRE + 0.1, 1100, CO.ease.inOutSine, true);
            if (!toque && ouvert) await pivoter(ENTRE, 1500, CO.ease.inOutSine, true);
          }
          courantDair();
        };
        courantDair();
        vieClement(++frappeTour);
      },

      /** On pousse la porte : la clochette tinte, elle s'ouvre en grand et la lumière inonde le trottoir
          (fermé, on toque d'abord deux coups ; elle s'ouvre quand même : le site, lui, est ouvert) */
      async toquer() {
        toque = true;
        if (!ouvert) { CO.sfx.play('knock'); await CO.wait(380); }
        CO.sfx.play('bell');
        CO.sfx.play('open', { delay: 80 });
        balancerPancarte(9);
        lumK = nuit ? 1.25 : 1;
        await pivoter(GRAND, 750, CO.ease.outCubic);
      },
      /** Elle se referme (entrouverte si c'est ouvert, close sinon) */
      async fermerPorte(ms = 900) {
        CO.sfx.play('close', { delay: Math.max(0, ms - 200) });
        await pivoter(ouvert ? ENTRE : 0, ms, CO.ease.inOutSine);
        toque = false;
        appliquer(0);
      },

      /** On entre, par la porte (≈ 1,6 s) : a. la caméra glisse jusqu'à la porte vitrée et la cadre ; b. la porte
          s'ouvre en grand vers l'intérieur (le vantail pivote sur ses gonds, la clochette tinte, le gond grince) et
          la lumière de la boutique déborde sur le trottoir et le dormant ; c. la caméra passe le seuil (×5 dans
          l'embrasure) et finit dans une lumière chaude et claire : l'appli fond alors vers sa scène d'intérieur.
          Fermé aussi : la porte s'ouvre quand même. Résout à l'arrivée ; tout reste ainsi jusqu'à sortir().
          ms : 0 pour se poser d'un coup sur le seuil (sans son). */
      entrer({ ms = 1600 } = {}) {
        const id = ++sequence, t = CO.reduced ? 0 : Math.max(0, ms);
        entre = true;
        toque = true; // (le courant d'air et setStatut ne touchent plus à la porte)
        regler(reflets, 0, t * 0.3, t * 0.5);
        regler(entreeLum, 1, t * 0.42, t * 0.22, 'ease-out');
        regler(chaleur, 0.94, t * 0.4, t * 0.6, 'ease-in');
        tamis.slice(1).forEach((el) => regler(el, 0, t * 0.3, t * 0.2)); // même fermé, la boutique s'allume
        const th0 = theta, l0 = lumK, lumFin = lumEntree();
        let ouvrir;
        if (t <= 0) { tourPorte++; theta = SEUIL_ANGLE; lumK = lumFin; poser(); ouvrir = Promise.resolve(); } else ouvrir = (async () => {
          await CO.wait(t * 0.2);
          if (id !== sequence) return;
          CO.sfx.play('bell');
          CO.sfx.play('porte-grince', { delay: 40, dur: Math.min(0.9, (t * 0.4) / 1000) });
          balancerPancarte(8);
          const tp = ++tourPorte;
          await CO.tween(t * 0.42, (e) => { if (tp === tourPorte) { theta = th0 + (SEUIL_ANGLE - th0) * e; lumK = l0 + (lumFin - l0) * e; poser(); } }, CO.ease.outCubic);
        })();
        const camera = animerCameraPas([
          { cadre: CADRE_PORTE, offset: 0.34, easing: 'cubic-bezier(.45,0,.3,1)' },
          { cadre: CADRE_PORTE, offset: 0.5, easing: 'linear' },
          { cadre: SEUIL, offset: 1, easing: 'cubic-bezier(.55,0,.35,1)' },
        ], t);
        return Promise.all([ouvrir, camera]).then(() => {});
      },
      /** On ressort (≈ 0,9 s) : depuis le seuil (porte grande ouverte, caméra dans l'embrasure), la caméra recule
          jusqu'au repos, la lumière redescend, puis la porte se referme doucement derrière (clochette) : entrouverte
          si c'est ouvert, close sinon. ms : 0 pour revenir d'un coup (sans son). */
      sortir({ ms = 900 } = {}) {
        const id = ++sequence, t = CO.reduced ? 0 : Math.max(0, ms);
        entre = false;
        regler(chaleur, 0, t * 0.45, 0, 'ease-out');
        regler(entreeLum, 0, t * 0.55, t * 0.1);
        regler(reflets, nuit ? 0.4 : 1, t * 0.5, t * 0.3);
        tamis.slice(1).forEach((el) => regler(el, ouvert ? 0 : 0.45, t * 0.5, t * 0.35));
        const camera = animerCameraPas([{ cadre: null, offset: 1, easing: 'cubic-bezier(.3,0,.2,1)' }], t * 0.68);
        const repos = ouvert ? ENTRE : 0, lumFin = lumRepos();
        let fermer;
        if (t <= 0) { tourPorte++; theta = repos; lumK = lumFin; poser(); fermer = Promise.resolve(); } else fermer = (async () => {
          await CO.wait(t * 0.5);
          if (id !== sequence) return;
          const th0 = theta, l0 = lumK, tp = ++tourPorte;
          if (Math.abs(th0 - repos) > 0.05) { CO.sfx.play('bell', { v: 0.55 }); balancerPancarte(5); }
          await CO.tween(t * 0.5, (e) => { if (tp === tourPorte) { theta = th0 + (repos - th0) * e; lumK = l0 + (lumFin - l0) * e; poser(); } }, CO.ease.inOutSine);
        })();
        return Promise.all([camera, fermer]).then(() => { if (id === sequence) toque = false; });
      },
      /** La caméra : on s'approche d'un rectangle du décor (repère de la scène ; centré, entièrement visible,
          avec un peu de décor autour : il occupe 80 % de l'écran), ou on recule (null). Transformation CSS
          du <svg> : fluide pendant le mouvement, redessinée nette à l'arrivée. */
      camera(r, ms = 800) { return animerCamera(r || null, ms); },
      /** fn({ zoom, x, y }) à chaque image d'un mouvement de caméra (et quand l'hôte change de taille) : pour
          que l'appli déplace avec elle ce qu'elle pose par-dessus (l'enseigne). Renvoie de quoi arrêter. */
      suivre(fn) { suiveurs.add(fn); return () => suiveurs.delete(fn); },
      /** Un rectangle de la scène → sa place en px dans l'hôte (cadrage et caméra compris, même en mouvement) */
      versEcran(r) {
        const W = host.clientWidth, H = host.clientHeight, s = Math.min(W / 400, H / 560);
        const ox = W / 2 - 200 * s, oy = H - 560 * s;
        const m = matrice(getComputedStyle(svg).transform);
        const pt = (x, y) => { const X = ox + x * s, Y = oy + y * s; return [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]]; };
        const a = pt(r.x, r.y), b = pt(r.x + (r.w || 0), r.y + (r.h || 0));
        return { left: a[0], top: a[1], width: b[0] - a[0], height: b[1] - a[1] };
      },
      /** L'ombre portée de l'enseigne suit sa rotation : yaw en radians, 0 = vue de face (parallèle au mur),
          ±π/2 = de chant (perpendiculaire au mur, comme une vraie enseigne drapeau) */
      ombreEnseigne(yaw) { ombre(+yaw || 0); },
    };

    appliquer(0);
    return api;
  }

  CO.Facade = { create };
})();
