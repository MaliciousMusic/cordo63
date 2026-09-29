/* ==========================================================================
   Cordo 63 — Clément, le personnage de la boutique (js/co-boutique.js le fait vivre)
   D'après sa photo (osint/ref/ig/cordo-DbFq32HAG2t) : la trentaine, barbe brune pleine et
   soignée, cheveux bruns courts, lunettes en acétate cristal, t-shirt anthracite, tablier à
   bavette en toile de coton brune (étiquette sur la poche, écusson rond rouge et jaune),
   avant-bras tatoué, montre au bracelet de cuir orange.
   Dessiné au canevas, en centimètres (1 unité = 1 cm), à chaque image :
   - la tête est un petit modèle 3D (sections empilées, maillages de la barbe et des cheveux,
     traits posés sur des plans tangents) projeté : elle tourne de face, de trois-quarts, de
     profil, hoche, cligne, parle ; les verres des lunettes accrochent la lumière ;
   - le corps : un tronc en sections (il pivote, se penche, respire, s'assoit), le tablier
     posé dessus (il se balance), des bras à deux os (cinématique inverse), des mains en poses
     (ouverte, poing, pince, plate, tenir, geste), des jambes qui marchent.
   La tête et le tronc (le plus coûteux) passent par de petits caches d'images, indexés par leur pose
   arrondie : on ne les redessine que quand la pose change vraiment.
   CO.Clement.create(opts) → le pantin : un état qu'on anime (etat), maj(dt) (respiration, clignements,
   tablier), dessiner(ctx, passe, objets), des repères (tete(), boite(), point(), repos()).
   CO.Clement.prechauffer() : un générateur qui fabrique les textures (barbe, cheveux, toile…) par pas.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const deg = Math.PI / 180;

  /* ---------- la palette (lumière chaude de l'atelier) ---------- */
  const PAL = {
    peau: '#DDA482', peauClair: '#F2C7A5', peauOmbre: '#B47556', peauSombre: '#86503C', peauRose: '#D98575',
    levre: '#A8605A', levreSombre: '#6E302C', bouche: '#2A120E',
    barbe: '#3A2417', barbeSombre: '#221309', barbeMoy: '#5A3822', barbeClair: '#8C5E3A', barbeRoux: '#9A5A32',
    cheveux: '#2C1B11', cheveuxClair: '#6A4A33',
    oeil: '#EDE2D6', iris: '#4A2D1B', pupille: '#140A06',
    tshirt: '#2B3038', tshirtClair: '#48505C', tshirtOmbre: '#191C22',
    tablier: '#8C5A2E', tablierClair: '#B07A45', tablierOmbre: '#5C391B', tablierSombre: '#42280F', couture: '#DDB57E',
    jean: '#2F3B55', jeanClair: '#4E5E80', jeanOmbre: '#1D2538',
    cuivre: '#C07A45', laiton: '#C9A45C', acier: '#B9BEC2', acierSombre: '#6E7378',
    montre: '#C8742E', encre: '#3C4A64',
    ecussonRouge: '#C8322A', ecussonJaune: '#F2C443',
  };

  /* ---------- petits outils de dessin ---------- */
  function toile(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  /** chemin lisse (Catmull-Rom → Bézier) par une suite de points [x, y] */
  function lisse(ctx, pts, ferme = true, k = 1 / 6) {
    const n = pts.length;
    if (n < 2) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    const m = ferme ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const p0 = pts[ferme ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[ferme ? (i + 2) % n : Math.min(n - 1, i + 2)];
      ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
    }
    if (ferme) ctx.closePath();
  }
  function poly(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  /** enveloppe convexe (chaîne monotone d'Andrew) */
  function enveloppe(P) {
    const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    hi.pop(); lo.pop();
    return lo.concat(hi);
  }
  const lin = (ctx, x0, y0, x1, y1, stops) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(clamp(o, 0, 1), c));
    return g;
  };
  const rad = (ctx, x, y, r, stops, x0 = x, y0 = y, r0 = 0) => {
    const g = ctx.createRadialGradient(x0, y0, r0, x, y, Math.max(0.01, r));
    stops.forEach(([o, c]) => g.addColorStop(clamp(o, 0, 1), c));
    return g;
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  /* ---------- les textures (une fois, raccordables) ---------- */
  const TEX = {};
  /** une texture, faite une fois ; fab peut être un générateur (fabriqué pas à pas par prechauffer()) */
  function tex(nom, fab) {
    if (TEX[nom]) return TEX[nom];
    const r = fab();
    if (r && typeof r.next === 'function') { let e; do { e = r.next(); } while (!e.done); return (TEX[nom] = e.value); }
    return (TEX[nom] = r);
  }
  /** des brins (barbe, cheveux) : traits courbes, surtout dans une direction (générateur : 300 brins par pas) */
  function* brins(N, fond, cols, n, { lg = [3, 8], ep = [0.5, 1.2], dir = Math.PI / 2, ecart = 0.8, graine = 1, alpha = [0.5, 1] } = {}) {
    const c = toile(N, N), x = c.getContext('2d'), r = CO.rng(graine);
    x.fillStyle = fond;
    x.fillRect(0, 0, N, N);
    x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = r() * N, py = r() * N, L = lg[0] + r() * (lg[1] - lg[0]), a = dir + (r() - 0.5) * ecart;
      const ca = Math.cos(a), sa = Math.sin(a), cb = (r() - 0.5) * L * 0.5;
      x.strokeStyle = cols[Math.floor(Math.pow(r(), 1.3) * cols.length)];
      x.globalAlpha = alpha[0] + r() * (alpha[1] - alpha[0]);
      x.lineWidth = ep[0] + r() * (ep[1] - ep[0]);
      for (let dx = -N; dx <= N; dx += N) for (let dy = -N; dy <= N; dy += N) {
        const X = px + dx, Y = py + dy;
        if (X < -L || X > N + L || Y < -L || Y > N + L) continue;
        x.beginPath();
        x.moveTo(X, Y);
        x.quadraticCurveTo(X + ca * L * 0.5 - sa * cb, Y + sa * L * 0.5 + ca * cb, X + ca * L, Y + sa * L);
        x.stroke();
      }
      if (i % 300 === 299) yield;
    }
    x.globalAlpha = 1;
    return c;
  }
  /** fabrique toutes les textures pas à pas (un générateur : le décor rend la main entre deux pas) */
  function* prechauffer() {
    const liste = [['barbe', fabBarbe], ['cheveux', fabCheveux], ['toile', fabToile], ['tricot', fabTricot], ['jean', fabJean]];
    for (const [nom, fab] of liste) {
      if (TEX[nom]) continue;
      const r = fab();
      if (r && typeof r.next === 'function') { let e; while (!(e = r.next()).done) yield; TEX[nom] = e.value; } else TEX[nom] = r;
      yield;
    }
  }
  const fabBarbe = () => brins(160, PAL.barbe, ['#1C1008', '#26160C', '#3A2415', '#4E3120', '#6A4429', '#86573A', '#9A5E34'], 2600, { lg: [4, 10], ep: [0.6, 1.4], dir: Math.PI / 2 + 0.1, ecart: 1.1, graine: 63 });
  const fabCheveux = () => brins(128, PAL.cheveux, ['#170D07', '#22150C', '#342216', '#4A3322', '#654631'], 2200, { lg: [2.5, 6], ep: [0.5, 1.1], dir: -Math.PI / 2 + 0.45, ecart: 0.8, graine: 64 });
  const texBarbe = () => tex('barbe', fabBarbe);
  const texCheveux = () => tex('cheveux', fabCheveux);
  /** la toile de coton du tablier (duck canvas) : armure serrée, nuances, usure */
  const fabToile = () => {
    const N = 96, c = toile(N, N), x = c.getContext('2d'), r = CO.rng(65), n = CO.noise2(66);
    const img = x.createImageData(N, N), d = img.data;
    const base = CO.hex2rgb(PAL.tablier);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tr = (i % 2 === 0 ? 1 : -1) * ((j >> 1) % 2 === 0 ? 1 : -1); // armure toile
      const u = i / N, v = j / N;
      const s = n(u * 6, v * 6) * 0.5 + n(u * 6 - 6, v * 6) * 0; // (raccord doux : faible amplitude)
      const k = 1 + tr * 0.045 + (r() - 0.5) * 0.07 + s * 0.04;
      const o = (j * N + i) * 4;
      d[o] = base[0] * k; d[o + 1] = base[1] * k; d[o + 2] = base[2] * k; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  };
  const texToile = () => tex('toile', fabToile);
  const fabTricot = () => {
    const N = 48, c = toile(N, N), x = c.getContext('2d'), r = CO.rng(67);
    x.fillStyle = PAL.tshirt;
    x.fillRect(0, 0, N, N);
    for (let i = 0; i < 700; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      x.fillRect(Math.floor(r() * N), Math.floor(r() * N), 1, 1);
    }
    return c;
  };
  const texTricot = () => tex('tricot', fabTricot);
  const fabJean = () => {
    const N = 32, c = toile(N, N), x = c.getContext('2d'), r = CO.rng(68);
    x.fillStyle = PAL.jean;
    x.fillRect(0, 0, N, N);
    x.strokeStyle = 'rgba(160,180,220,0.14)';
    x.lineWidth = 1;
    for (let k = -N; k < N * 2; k += 3) { x.beginPath(); x.moveTo(k, 0); x.lineTo(k + N, N); x.stroke(); }
    for (let i = 0; i < 200; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)'; x.fillRect(r() * N, r() * N, 1, 1); }
    return c;
  };
  const texJean = () => tex('jean', fabJean);
  /** remplit le chemin courant avec une texture ancrée au point (ox, oy), à l'échelle k (cm par pixel) */
  function remplirMotif(ctx, img, ox, oy, k, alpha = 1, rot = 0) {
    const pat = ctx.createPattern(img, 'repeat');
    ctx.save();
    ctx.translate(ox, oy);
    if (rot) ctx.rotate(rot);
    ctx.scale(k, k);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = pat;
    ctx.fill();
    ctx.restore();
  }

  /* ======================================================================
     La tête : un modèle 3D léger
     Repère : x vers la droite de l'écran (de face), y vers le haut, z vers nous ; origine au
     milieu des yeux. Les rotations : tangage (hochement) d'abord, lacet (tourner), puis roulis.
     ====================================================================== */
  // le crâne et le visage (peau) : [y, demi-largeur a, avant b, arrière c]
  const CRANE = [
    [12.0, 1.6, 1.0, 1.8], [11.3, 4.6, 3.6, 5.6], [10.1, 6.4, 6.4, 7.8], [8.3, 7.35, 8.3, 9.2],
    [6.0, 7.75, 9.1, 9.8], [3.5, 7.9, 9.4, 9.9], [1.3, 7.75, 9.2, 9.7], [-1.0, 7.5, 8.8, 9.3],
    [-3.2, 7.35, 8.8, 8.6], [-5.4, 6.95, 8.9, 7.2], [-7.6, 6.5, 8.7, 5.4], [-9.6, 5.8, 8.3, 3.8],
    [-11.2, 4.5, 7.8, 2.6], [-12.3, 2.6, 7.1, 1.4],
  ];
  // la barbe (surface extérieure), l'avant seulement : [y, a, b]
  const BARBE = [
    [1.2, 7.95, 9.0], [-1.0, 7.98, 9.1], [-3.0, 8.0, 9.45], [-5.0, 8.02, 10.05], [-7.0, 8.02, 10.55],
    [-9.0, 7.92, 10.85], [-11.0, 7.5, 11.0], [-12.8, 6.75, 10.85], [-14.3, 5.55, 10.35], [-15.4, 4.0, 9.55],
    [-16.1, 2.2, 8.45], [-16.45, 0.7, 7.4],
  ];
  // la ligne des joues (le haut de la barbe) selon l'angle autour de la tête (degrés) : haute près des
  // oreilles, en diagonale sur les joues, la moustache sous le nez
  const JOUE = [[0, -6.0], [8, -5.95], [15, -5.8], [21, -5.45], [27, -4.95], [34, -4.25], [42, -3.5], [51, -2.75], [60, -2.1], [69, -1.45], [77, -0.7], [83, 0.4], [88, 1.4], [93, -3.9], [100, -6.4]];
  const BAS_BARBE = [[0, -16.45], [18, -16.1], [32, -15.45], [46, -14.4], [58, -13.1], [70, -11.6], [82, -10.1], [100, -8.7]];
  // les cheveux (surface extérieure) : [y, a, b, c] ; du volume sur le dessus, courts sur les côtés
  const CHEVEUX = [
    [14.0, 0.05, 0.05, 0.05], [13.8, 1.3, 1.1, 1.7], [13.45, 3.2, 3.6, 4.2], [12.8, 5.0, 6.3, 6.6], [11.6, 6.5, 8.6, 8.6], [9.8, 7.55, 10.0, 9.9],
    [7.8, 7.98, 10.25, 10.35], [5.6, 8.05, 10.0, 10.4], [3.2, 8.0, 9.85, 10.3], [1.0, 7.95, 9.7, 10.12], [-1.0, 7.88, 9.4, 9.82],
    [-3.0, 7.78, 9.2, 9.22], [-5.0, 7.5, 9.0, 8.22], [-7.0, 7.08, 8.8, 6.88], [-8.6, 6.6, 8.6, 5.3],
  ];
  // la lisière des cheveux (le bas de la chevelure) selon l'angle (0 = milieu du front, 180 = nuque)
  const LISIERE = [[0, 7.35], [10, 7.5], [18, 7.7], [26, 8.05], [33, 8.3], [40, 8.0], [47, 7.1], [54, 6.0], [62, 4.7], [69, 3.5], [75, 2.3], [80, 1.2], [85, 0.3], [89, 0.9], [92, 3.2], [102, 3.3], [112, 1.4], [124, -3.0], [140, -5.8], [160, -7.0], [180, -7.3]];
  const table = (T, v) => { // interpolation dans une table [[x, y]…] (x croissant)
    if (v <= T[0][0]) return T[0][1];
    for (let i = 1; i < T.length; i++) if (v <= T[i][0]) { const [x0, y0] = T[i - 1], [x1, y1] = T[i]; return lerp(y0, y1, (v - x0) / (x1 - x0)); }
    return T[T.length - 1][1];
  };
  /** une section (y) d'une table de niveaux [y, a, b, c] décroissants en y */
  function niveau(L, y) {
    if (y >= L[0][0]) return L[0];
    for (let i = 1; i < L.length; i++) if (y >= L[i][0]) {
      const A = L[i - 1], B = L[i], t = (y - A[0]) / (B[0] - A[0]);
      return [y, lerp(A[1], B[1], t), lerp(A[2], B[2], t), lerp(A[3] != null ? A[3] : A[2], B[3] != null ? B[3] : B[2], t)];
    }
    return L[L.length - 1];
  }
  /** point de surface : angle psi (0 = avant, +90 = côté droit de l'écran), avant en super-ellipse (visage plat) */
  function surf(a, b, c, psi, e = 0.86) {
    const s = Math.sin(psi), co = Math.cos(psi);
    if (co >= 0) return [a * Math.sign(s) * Math.pow(Math.abs(s), e), b * Math.pow(co, e)];
    return [a * s, c * co];
  }
  const RING = 22;

  function rotateur(yaw, pitch, roll, piv) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const f = (x, y, z, o) => {
      x -= piv[0]; y -= piv[1]; z -= piv[2];
      const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
      const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
      o[0] = x2 * cr + y1 * sr + piv[0];
      o[1] = -x2 * sr + y1 * cr + piv[1];
      o[2] = z2 + piv[2];
      return o;
    };
    f.v = (x, y, z, o) => { // un vecteur (sans pivot)
      const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
      const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
      o[0] = x2 * cr + y1 * sr; o[1] = -x2 * sr + y1 * cr; o[2] = z2;
      return o;
    };
    return f;
  }

  /** le haut du cou (sous la mâchoire), tourné avec la tête */
  function anneauCou(H) {
    const PIV = [0, -7.2, -1.2], K = H.k || 1.07, R = rotateur(H.yaw, H.pitch, H.roll || 0, PIV), tmp = [0, 0, 0], out = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      R(Math.sin(a) * 5.3, -9.5, -1.6 + Math.cos(a) * 5.0, tmp);
      out.push([H.x + (tmp[0] - PIV[0]) * K, H.y - (tmp[1] - PIV[1]) * K]);
    }
    return out;
  }

  /** Dessine la tête. H : { x, y (le pivot du cou dans le monde, y vers le bas), yaw, pitch, roll,
      regard [gx, gy], cligne, bouche, sourire, sourcils, souffle, clous, reflet, eclat } */
  function dessinerTete(ctx, H) {
    const PIV = [0, -7.2, -1.2], K = H.k || 1.07; // (un peu plus grande que nature : on le reconnaît mieux)
    const R = rotateur(H.yaw, H.pitch, H.roll || 0, PIV);
    const tmp = [0, 0, 0];
    const P = (x, y, z) => { R(x, y, z, tmp); return [H.x + (tmp[0] - PIV[0]) * K, H.y - (tmp[1] - PIV[1]) * K, tmp[2]]; };
    const O = P(0, 0, 0), ox = O[0], oy = O[1]; // le milieu des yeux, à l'écran
    const Nz = (x, y, z) => { R.v(x, y, z, tmp); return tmp[2] / Math.hypot(x, y, z); };
    const syaw = Math.sin(H.yaw);
    const jaw = (H.bouche || 0) * 0.9 + (H.souffle || 0) * 0.35; // la mâchoire descend quand il parle
    const souri = H.sourire || 0;

    /** un repère affine sur un plan tangent : centre c, axes u (largeur) et v (hauteur) */
    const plan = (c, u, v) => {
      const C = P(c[0], c[1], c[2]);
      R.v(u[0], u[1], u[2], tmp); const U = [tmp[0] * K, -tmp[1] * K, tmp[2]];
      R.v(v[0], v[1], v[2], tmp); const V = [tmp[0] * K, -tmp[1] * K, tmp[2]];
      return { C, U, V, set(c2) { c2.transform(U[0], U[1], V[0], V[1], C[0], C[1]); } };
    };
    const tache = (c, rx, ry, couleur, a0) => { // une tache douce (ombre, rougeur, reflet)
      ctx.fillStyle = rad(ctx, c[0], c[1], Math.max(rx, ry), [[0, rgba(couleur, a0)], [0.55, rgba(couleur, a0 * 0.45)], [1, rgba(couleur, 0)]]);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], rx, ry, 0, 0, TAU); ctx.fill();
    };

    // ---------- le crâne (enveloppe) ----------
    const pts = [];
    for (const L of CRANE) for (let k = 0; k < RING; k++) {
      const psi = (k / RING) * TAU, [x, z] = surf(L[1], L[2], L[3], psi);
      pts.push(P(x, L[0], z));
    }
    const peau = enveloppe(pts);
    const cxh = ox, cyh = oy; // centre visuel (les yeux)
    const lumX = cxh - 4.5, lumY = cyh - 6.5;

    // ---------- l'oreille (plan de l'oreille, qui dépasse du crâne) ----------
    const OREILLE = [[0.7, 2.6], [0.1, 3.3], [-0.9, 3.25], [-1.65, 2.2], [-1.95, 0.6], [-1.75, -1.0], [-1.25, -2.3], [-0.55, -3.2], [0.3, -3.35], [0.75, -2.6], [0.85, -1.2], [1.0, 0.2], [0.9, 1.6]];
    const CONQUE = [[0.45, 1.4], [-0.55, 1.85], [-1.1, 0.6], [-0.95, -0.8], [-0.35, -1.45], [0.45, -0.85], [0.6, 0.4]];
    function oreille(cote) { // cote : -1 (gauche de l'écran, de face), +1
      const sortie = (u, v) => 7.3 + 0.2 + 0.85 * sstep(1, -1.9, u) * (0.45 + 0.55 * sstep(-3.4, 1, v));
      const pt = (u, v) => P(cote * sortie(u, v), -2.1 + v, -0.9 + u);
      const nz = Nz(cote, 0, 0.28);
      if (nz < -0.45) return;
      const contour = OREILLE.map(([u, v]) => pt(u, v));
      ctx.beginPath();
      lisse(ctx, contour);
      ctx.fillStyle = lin(ctx, contour[1][0], contour[1][1], contour[8][0], contour[8][1], [[0, PAL.peau], [0.55, '#D2927A'], [1, PAL.peauOmbre]]);
      ctx.fill();
      if (nz > -0.15) {
        const cq = CONQUE.map(([u, v]) => pt(u * 0.95, v));
        ctx.beginPath();
        lisse(ctx, cq);
        ctx.fillStyle = rgba(PAL.peauSombre, 0.5 * clamp(nz * 2 + 0.4, 0, 1));
        ctx.fill();
        ctx.beginPath();
        lisse(ctx, contour.slice(0, 8), false);
        ctx.strokeStyle = rgba(PAL.peauClair, 0.5);
        ctx.lineWidth = 0.2;
        ctx.stroke();
      }
    }
    const coteLoin = syaw > 0 ? 1 : -1;
    const deFace = Math.abs(syaw) <= 0.3;
    if (!deFace) oreille(coteLoin);

    // ---------- la peau ----------
    ctx.beginPath();
    lisse(ctx, peau);
    ctx.fillStyle = rad(ctx, lumX, lumY, 17.5, [[0, PAL.peauClair], [0.36, PAL.peau], [0.76, PAL.peauOmbre], [1, PAL.peauSombre]], lumX + 1, lumY + 1, 1);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // l'ombre propre, du côté opposé à la lumière
    ctx.fillStyle = lin(ctx, cxh - 1, 0, cxh + 9, 0, [[0, 'rgba(96,42,26,0)'], [1, 'rgba(96,42,26,0.3)']]);
    ctx.fillRect(cxh - 12, cyh - 16, 26, 36);
    // le modelé : orbites, cernes, pommettes, joues rosées, reflet du front, tempes
    [-1, 1].forEach((s) => {
      if (Nz(s * 0.3, 0, 1) < -0.25) return;
      tache(P(s * 3.2, 0.9, 8.4), 3.1, 1.9, '#6E3422', 0.26); // sous l'arcade
      tache(P(s * 3.3, -1.5, 8.4), 2.2, 1.0, '#7A3A2A', 0.16); // la cerne
      tache(P(s * 5.0, -2.2, 7.8), 2.6, 1.8, '#FFE4CC', 0.18); // la pommette, éclairée
      tache(P(s * 4.6, -3.4, 8.0), 2.6, 2.0, '#D8786A', 0.2); // le rose des joues
      tache(P(s * 7.3, 3.0, 3.6), 2.6, 3.2, '#7A3A26', 0.2); // la tempe
    });
    tache(P(-1.6, 5.2, 9.3), 3.8, 2.1, '#FFEEDD', 0.3); // le front
    if (souri > 0.2) [-1, 1].forEach((s) => { if (Nz(s * 0.4, 0, 1) > 0) tache(P(s * 3.3, -1.9, 8.7), 1.6, 0.7, '#FFE0C8', 0.35 * souri); }); // les pommettes remontent
    tache(P(0, 1.6, 9.2), 1.3, 1.6, '#7A3A26', 0.14); // la racine du nez, entre les sourcils
    ctx.restore();

    // ---------- les yeux ----------
    const gx = clamp((H.regard && H.regard[0]) || 0, -1, 1), gy = clamp((H.regard && H.regard[1]) || 0, -1, 1);
    const cl = clamp(H.cligne || 0, 0, 1);
    function oeil(s) {
      const a = s * 0.3;
      const nz = Nz(Math.sin(a), 0, Math.cos(a));
      if (nz < 0.03) return;
      const pl = plan([s * 3.2, 0.05, 8.1], [Math.cos(a), 0, -Math.sin(a)], [0, 1, 0]);
      ctx.save();
      pl.set(ctx);
      ctx.scale(s, 1); // +x vers le coin externe, pour les deux yeux
      const w = 1.48, h0 = 0.64 * (1 - souri * 0.3);
      const h = h0 * (1 - cl);
      const haut = (hh) => { ctx.moveTo(-w, 0.06); ctx.bezierCurveTo(-w * 0.5, -hh * 1.32, w * 0.42, -hh * 1.36, w, -0.12); };
      if (h > 0.05) {
        ctx.beginPath();
        haut(h);
        ctx.bezierCurveTo(w * 0.45, h * 0.9, -w * 0.45, h * 0.95, -w, 0.06);
        ctx.closePath();
        ctx.fillStyle = lin(ctx, -w, 0, w, 0, [[0, '#D9C7B8'], [0.3, PAL.oeil], [0.75, PAL.oeil], [1, '#CDB6A6']]);
        ctx.fill();
        ctx.save();
        ctx.clip();
        const ix = gx * 0.5 * s, iy = -gy * 0.2 - 0.08;
        ctx.fillStyle = rad(ctx, ix, iy, 0.78, [[0, '#7A4A2C'], [0.5, PAL.iris], [0.92, '#24140A'], [1, '#1A0E07']]);
        ctx.beginPath(); ctx.arc(ix, iy, 0.78, 0, TAU); ctx.fill();
        ctx.fillStyle = PAL.pupille;
        ctx.beginPath(); ctx.arc(ix, iy, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.arc(ix - 0.24 * s, iy - 0.26, 0.14, 0, TAU); ctx.fill();
        // l'ombre de la paupière sur le globe
        ctx.fillStyle = lin(ctx, 0, -h * 1.35, 0, h * 0.25, [[0, 'rgba(60,24,14,0.6)'], [1, 'rgba(60,24,14,0)']]);
        ctx.fillRect(-w - 0.2, -h * 1.45, 2 * w + 0.4, h * 1.5);
        ctx.restore();
      }
      // la paupière supérieure : la ligne des cils (épaisse, plus longue au coin externe)
      ctx.beginPath();
      haut(h + 0.02);
      ctx.lineTo(w + 0.3, -0.24);
      ctx.bezierCurveTo(w * 0.42, -h * 1.36 - 0.38, -w * 0.5, -h * 1.32 - 0.32, -w - 0.08, 0.02);
      ctx.closePath();
      ctx.fillStyle = '#26130A';
      ctx.fill();
      // la paupière (peau) et son pli
      ctx.beginPath();
      ctx.moveTo(-w * 0.85, -h0 * 1.2 - 0.18);
      ctx.bezierCurveTo(-w * 0.3, -h0 * 1.85 - 0.42, w * 0.45, -h0 * 1.85 - 0.4, w * 0.98, -h0 * 0.95 - 0.26);
      ctx.strokeStyle = 'rgba(112,52,34,0.55)';
      ctx.lineWidth = 0.13;
      ctx.stroke();
      if (h > 0.05) { // la paupière inférieure, son rebord clair
        ctx.beginPath();
        ctx.moveTo(-w * 0.82, h * 0.5);
        ctx.bezierCurveTo(-w * 0.3, h * 1.05, w * 0.4, h * 1.02, w * 0.92, h * 0.28);
        ctx.strokeStyle = 'rgba(128,62,44,0.5)';
        ctx.lineWidth = 0.11;
        ctx.stroke();
      } else { // fermé : la ligne des cils seule
        ctx.beginPath();
        ctx.moveTo(-w, 0.08); ctx.quadraticCurveTo(0, 0.42, w, -0.1);
        ctx.strokeStyle = '#26130A';
        ctx.lineWidth = 0.2;
        ctx.stroke();
      }
      ctx.restore();
    }
    const eLoin = syaw >= 0 ? 1 : -1;
    oeil(eLoin);

    // ---------- le nez ----------
    {
      const N = {
        racine: P(0, 1.4, 8.95), dos: P(0, -1.3, 9.95), bout: P(0, -4.3, 11.75), sous: P(0, -5.2, 10.95), base: P(0, -5.65, 9.55),
        ailD: P(2.05, -4.8, 9.15), ailG: P(-2.05, -4.8, 9.15), ailBD: P(1.6, -5.4, 9.15), ailBG: P(-1.6, -5.4, 9.15),
        hautD: P(1.35, -3.4, 9.8), hautG: P(-1.35, -3.4, 9.8), flancD: P(1.0, -0.5, 8.85), flancG: P(-1.0, -0.5, 8.85),
      };
      const vers = syaw >= 0 ? -1 : 1; // le côté du nez tourné vers nous
      const loin = vers > 0 ? 'G' : 'D', pres = vers > 0 ? 'D' : 'G';
      if (Math.abs(syaw) > 0.18) { // de trois-quarts, de profil : la silhouette du nez sort du visage
        ctx.beginPath();
        lisse(ctx, [N.racine, N['flanc' + loin], N['haut' + loin], N['ail' + loin], N['ailB' + loin], N.base, N.sous, N.bout, N.dos], true, 0.12);
        ctx.fillStyle = lin(ctx, N.racine[0], N.racine[1], N.bout[0], N.bout[1], [[0, PAL.peau], [0.75, PAL.peau], [1, '#E2A286']]);
        ctx.fill();
      }
      // le flanc à l'ombre (la lumière vient d'en haut à gauche) : du dos du nez à l'aile
      const cO = N.flancD[0] > N.flancG[0] ? 'D' : 'G';
      ctx.beginPath();
      lisse(ctx, [N.racine, N['flanc' + cO], N['haut' + cO], N['ail' + cO], N['ailB' + cO], N.sous, N.bout, N.dos], true, 0.1);
      ctx.fillStyle = lin(ctx, N.dos[0], N.dos[1], N['ail' + cO][0] + (N['ail' + cO][0] - N.dos[0]) * 0.3, N['ail' + cO][1], [[0, 'rgba(118,50,32,0.04)'], [1, 'rgba(118,50,32,0.58)']]);
      ctx.fill();
      // les ailes : un volume arrondi, cerné en bas (le sillon)
      ['D', 'G'].forEach((c) => {
        const a = N['ail' + c], b = N['ailB' + c], h = N['haut' + c];
        const vis = c === pres || Math.abs(syaw) < 0.4;
        if (!vis) return;
        ctx.beginPath();
        ctx.moveTo(h[0], h[1]);
        ctx.quadraticCurveTo(a[0] + (a[0] - N.bout[0]) * 0.25, a[1] - 0.2, a[0], a[1] + 0.2);
        ctx.quadraticCurveTo(b[0] + (a[0] - b[0]) * 0.2, b[1] + 0.15, b[0], b[1]);
        ctx.strokeStyle = 'rgba(112,48,32,0.62)';
        ctx.lineWidth = 0.2;
        ctx.stroke();
      });
      // l'ombre sous le nez (portée sur la moustache) et les narines
      const fz = clamp(Nz(0, 0, 1) * 1.6 - 0.2, 0, 1);
      if (fz > 0.02) tache([N.sous[0], N.sous[1] + 0.6], 2.1, 0.85, '#301208', 0.62 * fz);
      if (Nz(0, -1, 0.3) > -0.35) {
        [-1, 1].forEach((d) => {
          const c = P(d * 0.82, -5.12, 9.95), nz = Nz(d * 0.9, -0.7, 0.6);
          if (nz < -0.15) return;
          ctx.fillStyle = 'rgba(62,24,16,0.78)';
          ctx.beginPath();
          ctx.ellipse(c[0], c[1], 0.48 * clamp(nz + 0.35, 0.25, 1), 0.2, 0.18 * d, 0, TAU);
          ctx.fill();
        });
      }
      // le bout : rond, plus clair, un peu rose ; le reflet du dos du nez
      tache([N.bout[0], N.bout[1] + 0.1], 1.25, 1.05, '#E89A86', 0.3);
      tache([N.bout[0] - 0.3, N.bout[1] - 0.35], 0.62, 0.45, '#FFF4E8', 0.35 + 0.3 * fz);
      ctx.strokeStyle = 'rgba(255,240,226,0.32)';
      ctx.lineWidth = 0.42;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(N.racine[0] - 0.2, N.racine[1] + 0.9); ctx.quadraticCurveTo(N.dos[0] - 0.3, N.dos[1], N.bout[0] - 0.3, N.bout[1] - 0.9); ctx.stroke();
    }
    oeil(-eLoin);

    // ---------- les cheveux (maillage : de la lisière au sommet) ----------
    {
      const COLS = 32, ROWS = 7;
      const grille = [];
      for (let i = 0; i <= COLS; i++) {
        const deg0 = -180 + (i / COLS) * 360, psi = deg0 * deg;
        const yb = table(LISIERE, Math.abs(deg0));
        const col = [];
        for (let j = 0; j <= ROWS; j++) {
          const y = lerp(yb, 14.0, Math.pow(j / ROWS, 0.8));
          const L = niveau(CHEVEUX, y);
          const [x, z] = surf(L[1], L[2], L[3], psi, 0.9);
          const p = P(x, y, z);
          const tt = j / ROWS, lat = 1 - tt * tt;
          p.push(Nz(Math.sin(psi) * lat, 0.12 + tt * tt * 1.1, Math.cos(psi) * lat));
          col.push(p);
        }
        grille.push(col);
      }
      const trace = () => {
        ctx.beginPath();
        for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
          const a = grille[i][j], b = grille[i + 1][j], c = grille[i + 1][j + 1], d = grille[i][j + 1];
          if (a[3] + b[3] + c[3] + d[3] < -0.2) continue;
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
        }
      };
      trace();
      ctx.fillStyle = PAL.cheveux;
      ctx.fill();
      remplirMotif(ctx, texCheveux(), ox, oy, 0.085, 0.95, -0.25);
      ctx.save();
      ctx.clip();
      // le lustre sur le dessus (la lampe), l'ombre de l'autre côté
      const hautT = P(-2.5, 11.5, 6.5);
      ctx.save();
      ctx.translate(hautT[0], hautT[1]);
      ctx.scale(1.6, 0.8);
      ctx.fillStyle = rad(ctx, 0, 0, 5, [[0, 'rgba(150,112,82,0.34)'], [0.5, 'rgba(120,88,62,0.12)'], [1, 'rgba(120,85,60,0)']]);
      ctx.fillRect(-12, -12, 24, 24);
      ctx.restore();
      ctx.fillStyle = lin(ctx, cxh - 5, 0, cxh + 9, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.32)']]);
      ctx.fillRect(cxh - 14, cyh - 20, 28, 30);
      // le dégradé des côtés (coupe courte : la peau transparaît au-dessus des oreilles)
      const f0 = P(0, -0.6, 0), f1 = P(0, 5.2, 0);
      ctx.fillStyle = lin(ctx, f0[0], f0[1], f1[0], f1[1], [[0, rgba(PAL.peauOmbre, 0.78)], [0.4, rgba(PAL.peauOmbre, 0.42)], [0.75, rgba(PAL.peauOmbre, 0.12)], [1, rgba(PAL.peauOmbre, 0)]]);
      ctx.fillRect(cxh - 14, cyh - 20, 28, 30);
      ctx.restore();
      // la lisière : des cheveux fins qui partent en arrière depuis le front (bord doux)
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const a = grille[i][0], b = grille[i][1], a2 = grille[i + 1][0];
        if (a[3] < 0.05 && a2[3] < 0.05) continue;
        for (let k = 0; k < 5; k++) {
          const t = k / 5, x0 = lerp(a[0], a2[0], t), y0 = lerp(a[1], a2[1], t);
          const dx = b[0] - a[0], dy = b[1] - a[1];
          ctx.moveTo(x0 - dx * 0.12, y0 - dy * 0.12);
          ctx.lineTo(x0 + dx * 0.55 + (k - 2) * 0.08, y0 + dy * 0.55);
        }
      }
      ctx.strokeStyle = 'rgba(44,27,17,0.55)';
      ctx.lineWidth = 0.1;
      ctx.stroke();
      // le haut de la silhouette : de petites mèches couchées vers l'arrière
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const p = grille[i][ROWS - 1], q = grille[i + 1][ROWS - 1], c = grille[i][ROWS - 3];
        if (p[3] < -0.2) continue;
        const dx = p[0] - c[0], dy = p[1] - c[1], l = Math.hypot(dx, dy) || 1;
        ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(lerp(p[0], q[0], 0.5) + (dx / l) * 0.45, lerp(p[1], q[1], 0.5) + (dy / l) * 0.45, q[0], q[1]);
      }
      ctx.strokeStyle = 'rgba(36,22,13,0.35)';
      ctx.lineWidth = 0.14;
      ctx.stroke();
      // des mèches plus claires, couchées vers l'arrière (le brillant des cheveux)
      ctx.beginPath();
      for (let i = 0; i < COLS; i += 2) for (let j = 2; j < ROWS - 1; j += 2) {
        const a = grille[i][j], b = grille[i][j + 1], c = grille[i + 1][j];
        if (a[3] < 0.25) continue;
        ctx.moveTo(lerp(a[0], c[0], 0.3), lerp(a[1], c[1], 0.3));
        ctx.quadraticCurveTo(lerp(a[0], b[0], 0.5) + 0.25, lerp(a[1], b[1], 0.5), lerp(b[0], c[0], 0.2), lerp(b[1], c[1], 0.2));
      }
      ctx.strokeStyle = 'rgba(126,92,66,0.35)';
      ctx.lineWidth = 0.14;
      ctx.stroke();
    }

    // l'oreille proche, par-dessus les cheveux courts
    oreille(-coteLoin);
    if (deFace) oreille(coteLoin);

    // ---------- les sourcils (épais, bruns) ----------
    const sc = H.sourcils || 0;
    [-1, 1].forEach((s) => {
      const nz = Nz(s * 0.45, 0.2, 0.9);
      if (nz < 0.02) return;
      const pl = plan([s * 3.45, 2.45 + sc * 0.45, 9.1], [Math.cos(s * 0.42), 0, -Math.sin(s * 0.42)], [0, 1, 0.15]);
      ctx.save();
      pl.set(ctx);
      ctx.scale(s, 1); // +x vers l'extérieur
      const fr = -sc * 0.2 + souri * 0.05;
      ctx.beginPath();
      ctx.moveTo(-2.3, -0.45 - fr);
      ctx.bezierCurveTo(-2.45, 0.1 - fr, -1.4, 0.72, 0.2, 0.78);
      ctx.bezierCurveTo(1.3, 0.8, 2.2, 0.45, 2.55, 0.05);
      ctx.bezierCurveTo(1.6, 0.2, 0.4, 0.12, -0.9, -0.12);
      ctx.bezierCurveTo(-1.5, -0.25, -2.0, -0.55 - fr, -2.3, -0.45 - fr);
      ctx.closePath();
      ctx.fillStyle = lin(ctx, 0, -0.4, 0, 0.8, [[0, '#2E1A0E'], [1, '#1E1007']]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,16,8,0.7)';
      ctx.lineWidth = 0.09;
      ctx.beginPath();
      for (let k = 0; k < 13; k++) {
        const u = -2.2 + k * 0.37, v = 0.35 - Math.abs(u) * 0.04;
        ctx.moveTo(u, v - 0.35); ctx.lineTo(u + 0.45, v + 0.28);
      }
      ctx.stroke();
      ctx.restore();
    });

    // ---------- la barbe (maillage : de la ligne des joues au bas) ----------
    {
      const COLS = 28, ROWS = 8;
      const cols = [];
      for (let i = 0; i <= COLS; i++) {
        const dg = -100 + (i / COLS) * 200, psi = dg * deg, ad = Math.abs(dg);
        const yt = table(JOUE, ad), yb = table(BAS_BARBE, ad) - jaw * (ad < 60 ? 1 : 0.6);
        const col = [];
        for (let j = 0; j <= ROWS; j++) {
          const t = j / ROWS;
          const y = lerp(yt, yb, t);
          const L = niveau(BARBE, y + jaw * t * 0.8);
          const ep = lerp(0.3, 1, sstep(0, 0.4, t)); // la barbe s'épaissit sous la ligne des joues
          const Lp = niveau(CRANE, Math.max(-12.3, y));
          const a = lerp(Lp[1] + 0.12, L[1], ep), b = lerp(Lp[2] + 0.15, L[2], ep);
          const [x, z] = surf(a, b, b, psi, 0.9);
          const p = P(x, y, z);
          p.push(Nz(Math.sin(psi), -0.35 * t * t, Math.cos(psi)));
          col.push(p);
        }
        cols.push(col);
      }
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
        const a = cols[i][j], b = cols[i + 1][j], c = cols[i + 1][j + 1], d = cols[i][j + 1];
        if (a[3] + b[3] + c[3] + d[3] < -0.6) continue;
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
      }
      ctx.fillStyle = PAL.barbe;
      ctx.fill();
      remplirMotif(ctx, texBarbe(), ox, oy, 0.07);
      ctx.save();
      ctx.clip();
      const bas = P(0, -16, 9), hautB = P(0, -3, 9);
      // le volume : clair en haut (les joues dans la lumière), sombre dessous et côté ombre
      ctx.fillStyle = lin(ctx, 0, hautB[1], 0, bas[1] + 0.5, [[0, 'rgba(176,118,74,0.3)'], [0.4, 'rgba(90,55,30,0)'], [0.75, 'rgba(14,7,3,0.18)'], [1, 'rgba(14,7,3,0.5)']]);
      ctx.fillRect(cxh - 14, cyh - 6, 28, 20);
      ctx.fillStyle = lin(ctx, cxh - 8, 0, cxh + 9, 0, [[0, 'rgba(176,112,66,0.2)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(10,5,2,0.45)']]);
      ctx.fillRect(cxh - 14, cyh - 6, 28, 20);
      // les reflets roux dans la lumière chaude (joue éclairée, menton)
      tache(P(-4.6, -6.5, 9.2), 3.6, 3.0, '#B06A38', 0.3);
      tache(P(-0.8, -12.5, 10.8), 3.2, 2.4, '#A0602F', 0.22);
      // l'ombre sous la moustache (la bouche en retrait)
      tache(P(0, -7.9, 10.6), 2.7, 0.9, '#120804', 0.35);
      ctx.restore();
      // la moustache : deux mèches qui descendent sur la lèvre, plus claires
      {
        const pl = plan([0, -6.35, 10.45], [1, 0, 0], [0, 1, 0.25]);
        if (Nz(0, 0, 1) > 0.05) {
          ctx.save();
          pl.set(ctx);
          ctx.beginPath();
          ctx.moveTo(0, 0.35);
          ctx.bezierCurveTo(-1.2, 0.55, -2.6, 0.2, -3.25, -1.25);
          ctx.bezierCurveTo(-2.6, -1.05, -1.6, -1.25, -0.6, -1.0);
          ctx.quadraticCurveTo(0, -0.85, 0.6, -1.0);
          ctx.bezierCurveTo(1.6, -1.25, 2.6, -1.05, 3.25, -1.25);
          ctx.bezierCurveTo(2.6, 0.2, 1.2, 0.55, 0, 0.35);
          ctx.closePath();
          ctx.fillStyle = PAL.barbeMoy;
          ctx.fill();
          remplirMotif(ctx, texBarbe(), 0, 0, 0.06, 0.8);
          ctx.fillStyle = lin(ctx, 0, 0.5, 0, -1.3, [[0, 'rgba(180,120,76,0.35)'], [1, 'rgba(20,10,4,0.35)']]);
          ctx.fill();
          ctx.strokeStyle = 'rgba(30,16,8,0.6)';
          ctx.lineWidth = 0.08;
          ctx.beginPath();
          for (let k = -8; k <= 8; k++) {
            const u = k * 0.38;
            ctx.moveTo(u * 0.55, 0.3); ctx.lineTo(u, -0.9 - Math.abs(k) * 0.03);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      // le bord : des brins fins qui dépassent (bas de la barbe, côtés)
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const p = cols[i][ROWS], q = cols[i][ROWS - 1], p2 = cols[i + 1][ROWS];
        if (p[3] < -0.35) continue;
        const dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy) || 1;
        for (let k = 0; k < 4; k++) {
          const x0 = lerp(p[0], p2[0], k / 4), y0 = lerp(p[1], p2[1], k / 4);
          const L2 = 0.3 + ((i * 7 + k * 3) % 5) * 0.09;
          ctx.moveTo(x0 - (dx / l) * 0.5, y0 - (dy / l) * 0.5);
          ctx.quadraticCurveTo(x0, y0, x0 + (dx / l) * L2 + (k - 1.5) * 0.12, y0 + (dy / l) * L2);
        }
      }
      ctx.strokeStyle = 'rgba(34,19,9,0.8)';
      ctx.lineWidth = 0.14;
      ctx.stroke();
      // la ligne des joues : des poils courts qui se fondent dans la peau
      ctx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const p = cols[i][0], q = cols[i][1], p2 = cols[i + 1][0];
        if (p[3] < 0.05) continue;
        for (let k = 0; k < 5; k++) {
          const x0 = lerp(p[0], p2[0], k / 5), y0 = lerp(p[1], p2[1], k / 5);
          ctx.moveTo(x0 + (q[0] - p[0]) * 0.22, y0 + (q[1] - p[1]) * 0.22);
          ctx.lineTo(x0 - (q[0] - p[0]) * 0.1 + 0.04 * (k - 2), y0 - (q[1] - p[1]) * 0.1);
        }
      }
      ctx.strokeStyle = 'rgba(58,36,23,0.4)';
      ctx.lineWidth = 0.1;
      ctx.stroke();
    }

    // ---------- la bouche (sous la moustache, dans la barbe) ----------
    {
      const nz = Nz(0, -0.05, 1);
      if (nz > 0.08) {
        const pl = plan([0, -7.55 - jaw * 0.3, 10.7], [1, 0, 0], [0, 1, 0.1]);
        ctx.save();
        pl.set(ctx);
        const ouv = clamp((H.bouche || 0), 0, 1), ronde = clamp(H.souffle || 0, 0, 1);
        const w = lerp(1.35, 0.5, ronde) + souri * 0.3, hOuv = ouv * 0.9 + ronde * 0.5;
        if (hOuv > 0.04) { // l'ouverture
          ctx.beginPath();
          ctx.moveTo(-w * 0.85, 0.05);
          ctx.quadraticCurveTo(0, 0.28, w * 0.85, 0.05);
          ctx.quadraticCurveTo(0, -hOuv * 1.1, -w * 0.85, 0.05);
          ctx.fillStyle = PAL.bouche;
          ctx.fill();
          if (ouv > 0.35 && !ronde) {
            ctx.fillStyle = 'rgba(232,222,206,0.75)';
            ctx.beginPath(); ctx.ellipse(0, 0.02, w * 0.45, 0.13, 0, 0, TAU); ctx.fill();
          }
        }
        // la lèvre inférieure, pleine, un peu brillante
        ctx.beginPath();
        ctx.moveTo(-w * 0.8, -0.08 - hOuv * 0.9);
        ctx.quadraticCurveTo(0, -0.12 - hOuv * 0.95, w * 0.8, -0.08 - hOuv * 0.9);
        ctx.quadraticCurveTo(0, -0.95 - hOuv * 0.95, -w * 0.8, -0.08 - hOuv * 0.9);
        ctx.fillStyle = PAL.levre;
        ctx.fill();
        ctx.fillStyle = 'rgba(255,220,210,0.35)';
        ctx.beginPath(); ctx.ellipse(-0.25, -0.38 - hOuv * 0.9, w * 0.35, 0.12, 0, 0, TAU); ctx.fill();
        // les clous entre les lèvres (le cordonnier en garde toujours quelques-uns)
        const nc = H.clous | 0;
        for (let k = 0; k < nc; k++) {
          const u = -0.8 + k * 0.5, a = -0.3 + k * 0.25;
          ctx.save();
          ctx.translate(u, -0.3 - hOuv * 0.4);
          ctx.rotate(a);
          ctx.fillStyle = '#8E949A';
          ctx.fillRect(-0.05, -1.2, 0.1, 1.2);
          ctx.fillStyle = '#D4D9DC';
          ctx.fillRect(-0.18, -1.3, 0.36, 0.12);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // ---------- les lunettes (acétate cristal) ----------
    {
      const monture = (w) => { ctx.lineWidth = w; };
      const branche = (s) => { // de l'angle de la monture à l'oreille
        const a = P(s * 6.3, 0.75, 9.1), b = P(s * 7.95, 0.55, 3.2), c = P(s * 8.0, -0.2, -1.4);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(222,212,196,0.72)'; monture(0.4); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; monture(0.1); ctx.stroke();
      };
      if (Math.abs(syaw) > 0.12) branche(syaw > 0 ? -1 : 1);
      const verres = [-1, 1].map((s) => {
        const a = s * 0.2;
        return { s, nz: Nz(Math.sin(a), 0, Math.cos(a)), pl: plan([s * 3.35, 0.2, 10.15], [Math.cos(a), 0, -Math.sin(a)], [0, 1, 0]) };
      });
      // le pont (en trou de serrure)
      {
        const a = P(-1.05, 1.0, 10.55), m = P(0, 1.35, 10.8), b = P(1.05, 1.0, 10.55);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1] - 0.35, b[0], b[1]);
        ctx.strokeStyle = 'rgba(226,216,200,0.7)'; monture(0.46); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; monture(0.12); ctx.stroke();
      }
      const rr = (c2, w, h) => { // la forme du verre : une super-ellipse (rectangle très arrondi), plus large en haut
        c2.beginPath();
        for (let k = 0; k < 36; k++) {
          const t = (k / 36) * TAU, co = Math.cos(t), si = Math.sin(t);
          const y = h * Math.sign(si) * Math.pow(Math.abs(si), 0.55);
          const x = w * Math.sign(co) * Math.pow(Math.abs(co), 0.62) * (1 - 0.05 * (y / h));
          if (k) c2.lineTo(x, y); else c2.moveTo(x, y);
        }
        c2.closePath();
      };
      const g = H.reflet || 0;
      verres.forEach(({ s, nz, pl }) => {
        if (nz < -0.05) return;
        ctx.save();
        pl.set(ctx);
        ctx.scale(s, 1);
        const W = 2.6, Hh = 1.95, r = 1.1;
        rr(ctx, W, Hh);
        ctx.fillStyle = 'rgba(214,232,238,0.06)';
        ctx.fill();
        ctx.save();
        ctx.clip();
        // le reflet qui glisse quand il tourne la tête, la lampe dans le haut du verre
        const off = ((g * 1.4 * s + 0.4 + 9) % 3) - 1.5;
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(-W + off * W, Hh); ctx.lineTo(-W + (off + 0.35) * W, -Hh); ctx.lineTo(-W + (off + 0.6) * W, -Hh); ctx.lineTo(-W + (off + 0.25) * W, Hh);
        ctx.fill();
        ctx.fillStyle = lin(ctx, 0, -Hh, 0, -Hh * 0.2, [[0, 'rgba(255,248,232,0.22)'], [1, 'rgba(255,248,232,0)']]);
        ctx.fillRect(-W, -Hh, 2 * W, Hh);
        ctx.restore();
        // la monture : translucide, épaisse, avec la lumière qui court sur le haut
        rr(ctx, W, Hh);
        ctx.strokeStyle = 'rgba(232,224,212,0.5)'; monture(0.48); ctx.stroke();
        rr(ctx, W - 0.24, Hh - 0.24);
        ctx.strokeStyle = 'rgba(96,74,58,0.28)'; monture(0.08); ctx.stroke();
        rr(ctx, W + 0.2, Hh + 0.2);
        ctx.strokeStyle = 'rgba(120,96,78,0.22)'; monture(0.06); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-W + r * 0.7, -Hh - 0.08); ctx.bezierCurveTo(-W * 0.2, -Hh * 1.05 - 0.08, W * 0.3, -Hh * 1.05 - 0.08, W - r * 0.5, -Hh - 0.06);
        ctx.strokeStyle = 'rgba(255,255,255,0.72)'; monture(0.12); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W - 0.1, -Hh + r * 0.8); ctx.lineTo(W - 0.08, Hh * 0.2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; monture(0.1); ctx.stroke();
        // la charnière (deux petits rivets d'acier)
        ctx.fillStyle = 'rgba(206,208,210,0.95)';
        ctx.beginPath(); ctx.arc(W - 0.35, -Hh + 0.45, 0.13, 0, TAU); ctx.arc(-W + 0.35, -Hh + 0.45, 0.13, 0, TAU); ctx.fill();
        ctx.restore();
      });
      // l'éclat : une petite étoile qui s'allume par moments
      const ec = H.eclat || 0;
      if (ec > 0.01) {
        const v = verres[H.yaw >= 0 ? 0 : 1];
        if (v.nz > 0.2) {
          const c = v.pl.C;
          ctx.save();
          ctx.translate(c[0] - 1.1, c[1] - 1.0);
          ctx.globalAlpha = ec;
          ctx.fillStyle = rad(ctx, 0, 0, 1.4, [[0, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]);
          ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, TAU); ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          const L = 1.9 * ec;
          ctx.beginPath();
          ctx.moveTo(0, -L); ctx.lineTo(0.13, -0.13); ctx.lineTo(L, 0); ctx.lineTo(0.13, 0.13); ctx.lineTo(0, L); ctx.lineTo(-0.13, 0.13); ctx.lineTo(-L, 0); ctx.lineTo(-0.13, -0.13);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }
    return { centre: [cxh, cyh - 1], haut: P(0, 13.7, 0), bouche: P(0, -7.6, 10.5) };
  }
  /* ======================================================================
     Le corps
     Repère du corps : x latéral (vers la droite de l'écran de face), h la hauteur (vers le haut),
     z vers l'avant. Le lacet du corps : +90° = de profil tourné vers la droite de l'écran.
     ====================================================================== */
  // le tronc : [h, demi-largeur a, avant b, arrière c]
  const TRONC = [
    [151.5, 6.4, 5.6, 5.8], [149, 12.2, 6.6, 7.4], [146.3, 17.2, 8.3, 8.6], [143.2, 19.8, 9.6, 9.6], [139, 19.5, 11.0, 10.2],
    [133, 18.9, 11.8, 10.4], [126, 18.2, 12.2, 10.0], [119, 17.6, 12.6, 9.6], [112, 17.2, 13.1, 9.4], [105, 17.1, 12.9, 9.8],
    [98, 17.7, 11.7, 11.2], [92, 17.5, 10.7, 11.8], [87, 16.5, 9.3, 11.2],
  ];
  const EPAULE = [18.4, 141.2, -0.6]; // (x signé selon le côté)
  const HANCHE = [9.3, 90, 0];
  const L_BRAS = 29, L_AVB = 26.5, L_MAIN = 8.5; // bras, avant-bras (au poignet), du poignet au creux de la main
  const L_CUISSE = 44, L_JAMBE = 42;

  /* ---------- une main, dans son repère : origine au poignet, x vers les doigts, y vers le pouce ---------- */
  const PINCE = [12.7, -5.6], ECHELLE_MAIN = 0.93; // où le pouce et l'index se touchent (la pose 'pince'), dans ce repère
  function dessinerMain(ctx, pose, ombre) {
    const peauG = (x0, x1) => lin(ctx, x0, -4, x1, 4, [[0, PAL.peauClair], [0.45, PAL.peau], [1, PAL.peauOmbre]]);
    const doigt = (x0, y0, ang, l, r, pli = 0) => { // un doigt en deux phalanges
      const c1 = Math.cos(ang), s1 = Math.sin(ang), a2 = ang + pli, c2 = Math.cos(a2), s2 = Math.sin(a2);
      const x1 = x0 + c1 * l * 0.55, y1 = y0 + s1 * l * 0.55, x2 = x1 + c2 * l * 0.45, y2 = y1 + s2 * l * 0.45;
      ctx.lineCap = 'round';
      ctx.lineWidth = r * 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      return [x2, y2, a2];
    };
    const ongle = (x, y, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = 'rgba(250,215,200,0.75)';
      ctx.beginPath(); ctx.ellipse(-0.35, 0, 0.42, 0.36, 0, 0, TAU); ctx.fill();
      ctx.restore();
    };
    ctx.strokeStyle = PAL.peau;
    const paume = (lg, larg) => {
      ctx.beginPath();
      ctx.moveTo(-0.5, -2.7);
      ctx.bezierCurveTo(2.5, -3.2, lg - 1.5, -larg * 0.5, lg, -larg * 0.48);
      ctx.bezierCurveTo(lg + 0.9, -larg * 0.2, lg + 0.9, larg * 0.25, lg, larg * 0.5);
      ctx.bezierCurveTo(lg - 2.5, larg * 0.62, 2, 3.4, -0.5, 2.8);
      ctx.closePath();
      ctx.fillStyle = peauG(0, lg);
      ctx.fill();
    };
    switch (pose) {
      case 'poing': case 'prise': { // le poing (autour d'un manche en x = 9.4)
        paume(7.4, 8.4);
        ctx.fillStyle = lin(ctx, 6, -4, 11.5, 4, [[0, PAL.peauClair], [0.5, PAL.peau], [1, PAL.peauOmbre]]);
        ctx.beginPath();
        ctx.moveTo(6.4, -4.3); ctx.bezierCurveTo(9.6, -4.9, 12, -3.6, 11.9, -0.5); ctx.bezierCurveTo(12, 2.6, 10.3, 4.6, 6.6, 4.3); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(134,80,60,0.6)';
        ctx.lineWidth = 0.18;
        ctx.beginPath();
        [-2.1, 0, 2.1].forEach((y) => { ctx.moveTo(8.2, y); ctx.quadraticCurveTo(10.6, y + 0.1, 11.7, y + 0.45); });
        ctx.stroke();
        // les jointures éclairées
        ctx.fillStyle = 'rgba(255,230,212,0.4)';
        [-3.1, -1.05, 1.05, 3.1].forEach((y) => { ctx.beginPath(); ctx.ellipse(7.3, y, 0.7, 0.55, 0, 0, TAU); ctx.fill(); });
        // le pouce replié par-dessus
        ctx.strokeStyle = PAL.peau;
        const t = doigt(3.2, -3.6, 0.35, 6.2, 1.15, 0.6);
        ctx.strokeStyle = 'rgba(180,117,86,0.8)';
        ctx.lineWidth = 0.14;
        ctx.beginPath(); ctx.moveTo(3.4, -4.4); ctx.quadraticCurveTo(6.5, -4.1, t[0], t[1] - 0.9); ctx.stroke();
        ongle(t[0], t[1], t[2]);
        break;
      }
      case 'pince': { // le pouce et l'index se touchent au bout (PINCE) : un clou, une clé, un stylo
        paume(8, 8);
        // les trois autres doigts repliés dans la paume (la peau, cernée d'un pli)
        [[7.7, 2.9, 0.62, 4.6], [8, 1.1, 0.46, 5.3], [8, -0.8, 0.32, 5.6]].forEach(([x, y, a, l]) => {
          ctx.strokeStyle = PAL.peauOmbre; doigt(x, y, a, l, 1.02, 1.6);
          ctx.strokeStyle = PAL.peau; doigt(x, y, a, l, 0.84, 1.6);
        });
        ctx.strokeStyle = PAL.peau;
        const i1 = doigt(8, -2.7, -0.12, 7.2, 1.0, -0.9);
        const p1 = doigt(2.6, -3.6, -0.3, 9.4, 1.15, 0.25);
        ongle(i1[0], i1[1], i1[2]);
        ongle(p1[0], p1[1], p1[2]);
        break;
      }
      case 'plate': { // la main à plat (on presse, on lisse)
        paume(9, 8.2);
        ctx.strokeStyle = PAL.peau;
        [[-3.0, -0.08, 7.2], [-1.0, -0.02, 8], [1.0, 0.03, 7.7], [2.9, 0.09, 6.4]].forEach(([y, a, l]) => { const e = doigt(8.8, y, a, l, 0.95, 0.05); ongle(e[0], e[1], e[2]); });
        doigt(2.4, -3.6, -0.5, 6.4, 1.1, -0.2);
        break;
      }
      case 'tenir': { // un objet tenu par le côté (une chaussure, une brosse)
        paume(8.4, 8.3);
        ctx.strokeStyle = PAL.peau;
        [[-3.0, 0.35, 7.0], [-1.0, 0.42, 7.6], [1.0, 0.48, 7.2], [2.9, 0.55, 6.0]].forEach(([y, a, l]) => { const e = doigt(8.2, y, a, l, 1.0, 0.75); ongle(e[0], e[1], e[2]); });
        const p = doigt(2.4, -3.6, -0.7, 6.8, 1.15, 0.35);
        ongle(p[0], p[1], p[2]);
        break;
      }
      case 'geste': { // la main qui parle : ouverte, paume vers le haut
        paume(8.6, 8.4);
        ctx.strokeStyle = PAL.peau;
        [[-3.1, -0.25, 7.0], [-1.0, -0.1, 7.8], [1.0, 0.06, 7.5], [3.0, 0.22, 6.2]].forEach(([y, a, l]) => { const e = doigt(8.4, y, a, l, 0.98, 0.35); ongle(e[0], e[1], e[2]); });
        doigt(2.5, -3.6, -0.95, 6.5, 1.12, 0.15);
        ctx.fillStyle = 'rgba(214,133,117,0.22)';
        ctx.beginPath(); ctx.ellipse(5, 0, 3, 2.4, 0, 0, TAU); ctx.fill();
        break;
      }
      default: { // ouverte, détendue : les doigts serrés, un peu repliés
        paume(8.6, 8.0);
        ctx.strokeStyle = PAL.peau;
        [[-2.7, 0.06, 7.0], [-0.9, 0.08, 7.6], [0.9, 0.1, 7.3], [2.6, 0.12, 6.1]].forEach(([y, a, l]) => { const e = doigt(8.4, y, a, l, 0.98, 0.42); ongle(e[0], e[1], e[2]); });
        ctx.strokeStyle = 'rgba(150,90,66,0.5)';
        ctx.lineWidth = 0.12;
        ctx.beginPath(); [-1.8, 0, 1.75].forEach((y) => { ctx.moveTo(9, y); ctx.lineTo(13.5, y + 0.2); }); ctx.stroke();
        ctx.strokeStyle = PAL.peau;
        doigt(2.5, -3.4, -0.35, 6.2, 1.12, 0.25);
      }
    }
  }

  /* ---------- un membre : une gélule effilée de A à B, ombrée en travers ---------- */
  function membre(ctx, A, B, ra, rb, couleurs, rm = 0, tm = 0.35) {
    const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 0.01;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const r1 = rm || (ra + rb) / 2, M = [A[0] + dx * tm, A[1] + dy * tm];
    ctx.beginPath();
    ctx.moveTo(A[0] + nx * ra, A[1] + ny * ra);
    ctx.quadraticCurveTo(M[0] + nx * r1 * 1.05, M[1] + ny * r1 * 1.05, B[0] + nx * rb, B[1] + ny * rb);
    ctx.arc(B[0], B[1], rb, Math.atan2(ny, nx), Math.atan2(-ny, -nx), true);
    ctx.quadraticCurveTo(M[0] - nx * r1 * 1.05, M[1] - ny * r1 * 1.05, A[0] - nx * ra, A[1] - ny * ra);
    ctx.arc(A[0], A[1], ra, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
    ctx.closePath();
    // la lumière vient d'en haut à gauche : le côté de la normale qui regarde par là est clair
    const clair = nx * -0.55 + ny * -0.83 > 0 ? 1 : -1;
    const R = Math.max(ra, rb) * 1.1;
    ctx.fillStyle = lin(ctx, M[0] + nx * R * clair, M[1] + ny * R * clair, M[0] - nx * R * clair, M[1] - ny * R * clair, couleurs);
    ctx.fill();
    return { ux, uy, nx, ny, L };
  }

  /* ---------- IK à deux os ---------- */
  function ik(S, T, L1, L2, pole) {
    let dx = T[0] - S[0], dy = T[1] - S[1];
    let d = Math.hypot(dx, dy) || 0.001;
    const dMax = L1 + L2 - 0.01, dMin = Math.abs(L1 - L2) + 0.5;
    const dc = clamp(d, dMin, dMax);
    const ux = dx / d, uy = dy / d;
    const a = Math.acos(clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1));
    const c = Math.cos(a), s = Math.sin(a);
    const e1 = [S[0] + (ux * c - uy * s) * L1, S[1] + (uy * c + ux * s) * L1];
    const e2 = [S[0] + (ux * c + uy * s) * L1, S[1] + (uy * c - ux * s) * L1];
    const E = Math.hypot(e1[0] - pole[0], e1[1] - pole[1]) < Math.hypot(e2[0] - pole[0], e2[1] - pole[1]) ? e1 : e2;
    const W = [S[0] + ux * dc, S[1] + uy * dc]; // la main atteinte (bras tendu si trop loin)
    const L2x = W[0] - E[0], L2y = W[1] - E[1], l2 = Math.hypot(L2x, L2y) || 1;
    return { E, W: [E[0] + (L2x / l2) * L2, E[1] + (L2y / l2) * L2], atteint: d <= dMax + 0.5 };
  }

  /* ======================================================================
     Le pantin
     ====================================================================== */
  function create(opts = {}) {
    const r = CO.rng(opts.graine || 0x1019);
    const noise = CO.noise2((opts.graine || 0x1019) + 7);
    // les taches de colle et de teinture sur le tablier (fixes)
    const taches = Array.from({ length: 9 }, () => ({ x: r.range(-15, 15), h: r.range(62, 128), r: r.range(0.4, 1.4), a: r.range(0.18, 0.45), c: r() < 0.6 ? '#2A1A10' : r() < 0.5 ? '#3A3F4A' : '#6E2A1C' }));

    const S = {
      x: opts.x || 0, y: 0, // les pieds (le sol), dans le monde
      yaw: 0, lean: 0, cote: 0, // lacet, penché en avant, penché de côté (rad)
      assis: 0, // 0 debout → 1 assis sur le tabouret
      respire: 0, // phase de la respiration (rad)
      marche: 0, marchePhase: 0, // 0..1 intensité de la marche ; phase (cycles)
      tete: { turn: 0, pitch: 0.08, roll: 0 }, // la tête, relative au corps
      regard: [0, 0],
      cligne: 0, bouche: 0, sourire: 0, sourcils: 0, souffle: 0, clous: 0, eclat: 0,
      // les mains : cibles dans le monde (le creux de la main), pose, angle (null = dans l'axe de l'avant-bras), devant (dessinées devant les meubles)
      mainD: { x: -10, y: -95, pose: 'ouverte', angle: null, devant: false, objet: null },
      mainG: { x: 10, y: -95, pose: 'ouverte', angle: null, devant: false, objet: null },
      tablier: { x: 0, z: 0, vx: 0, vz: 0 },
      nuit: false,
    };
    let dernier = null; // les repères du dernier dessin (tête, mains, boîte)

    /* ---------- le corps projeté ---------- */
    const rebond = () => S.marche * 1.2 - S.marche * (1.1 * Math.abs(Math.cos(S.marchePhase * TAU))); // le haut et le bas du pas
    function projeteur({ x0 = null, y0 = null, sansBob = false, resp: respForce = null } = {}) {
      const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      const lam = S.lean, cl = Math.cos(lam), sl = Math.sin(lam), rho = S.cote, crr = Math.cos(rho), srr = Math.sin(rho);
      const chute = S.assis * 36; // le bassin descend sur le tabouret
      const bob = sansBob ? 0 : rebond();
      const resp = respForce == null ? Math.sin(S.respire) : respForce;
      const ax = x0 == null ? S.x : x0, ay = y0 == null ? S.y : y0;
      /** un point du corps (x, h, z) → [X, Y (monde), Z] */
      const f = function (x, h, z = 0, haut = true) {
        let hh = h, zz = z, xx = x;
        if (haut && h > 100) { // le haut du corps se penche autour de la taille
          const dh = h - 100;
          hh = 100 + dh * cl - z * sl;
          zz = dh * sl + z * cl;
          const dh2 = hh - 100;
          xx = x * crr + dh2 * srr;
          hh = 100 + dh2 * crr - x * srr;
        }
        if (haut && h > 118) hh += resp * 0.28 * sstep(118, 146, h);
        hh -= chute + bob;
        const X = xx * cy + zz * sy, Z = -xx * sy + zz * cy;
        return [ax + X, ay - hh, Z];
      };
      f.resp = resp;
      return f;
    }

    function silhouetteTronc(Pj, hMin = 86) {
      const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), resp = Pj.resp == null ? Math.sin(S.respire) : Pj.resp;
      const g = [], d = [];
      TRONC.forEach(([h, a, b, c]) => {
        if (h < hMin) return;
        const k = h > 118 && h < 146 ? 1 + resp * 0.012 : 1;
        const A = a * k, B = b * k;
        const ctr = Pj(0, h, 0);
        const ext = (dd) => Math.sqrt(A * A * cy * cy + dd * dd * sy * sy);
        const droite = ext(sy >= 0 ? B : c), gauche = ext(sy >= 0 ? c : B);
        d.push([ctr[0] + droite, ctr[1]]);
        g.push([ctr[0] - gauche, ctr[1]]);
      });
      return { g, d };
    }

    /** un point de la surface avant du tronc, donné par sa position de face (xf, h) */
    function surTronc(Pj, xf, h, dz = 0.3) {
      const L = niveau(TRONC.map((t) => [t[0], t[1], t[2], t[3]]), h);
      const a = L[1], b = L[2];
      const s = clamp(xf / a, -1, 1), psi = Math.asin(s);
      const x = a * s, z = b * Math.cos(psi) + dz;
      return Pj(x, h, z);
    }
    /** la jupe du tablier (sous la taille) : une nappe qui tombe, qui se balance */
    function surJupe(Pj, xf, h, dz = 0) {
      const t = clamp((104 - h) / 52, 0, 1);
      const a = lerp(17.3, 22.8, t), b = lerp(13.2, 11.2, t);
      const s = clamp(xf / a, -1.05, 1.05), psi = Math.asin(clamp(s, -1, 1)) + (Math.abs(s) > 1 ? (s - Math.sign(s)) * 1.2 : 0);
      const x = a * Math.sin(psi) + S.tablier.x * t * t, z = b * Math.cos(psi) + dz + S.tablier.z * t * t - Math.max(0, Math.abs(s) - 0.9) * 6;
      return Pj(x, h, z, false);
    }

    /* ---------- les jambes ---------- */
    function jambes(ctx, Pj) {
      const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      const ph = S.marchePhase * TAU, m = S.marche;
      const cotes = [-1, 1].map((s) => {
        const phase = ph + (s > 0 ? Math.PI : 0);
        const flex = m * 0.42 * Math.sin(phase); // flexion de la hanche (avant +)
        const genou = m * (0.1 + 0.55 * Math.max(0, Math.sin(phase + 1.2))) + S.assis * 1.45; // flexion du genou
        const hip = [s * HANCHE[0], HANCHE[1], 0]; // (le projeteur fait descendre le bassin quand il s'assoit)
        const aF = flex + S.assis * 1.45, k1 = [hip[0], hip[1] - L_CUISSE * Math.cos(aF), L_CUISSE * Math.sin(aF)];
        const aJ = aF - genou, an = [k1[0] + s * 0.4, k1[1] - L_JAMBE * Math.cos(aJ), k1[2] + L_JAMBE * Math.sin(aJ)];
        return { s, H: Pj(hip[0], hip[1], hip[2], false), K: Pj(k1[0], k1[1], k1[2], false), A: Pj(an[0], an[1], an[2], false), aJ, z: -s * sy };
      });
      cotes.sort((a, b) => a.z - b.z);
      cotes.forEach((j) => {
        const cols = [[0, PAL.jeanClair], [0.5, PAL.jean], [1, PAL.jeanOmbre]];
        membre(ctx, j.H, j.K, 8.4, 6.3, cols, 7.8);
        membre(ctx, j.K, j.A, 6.3, 5.4, cols, 6.1);
        // la basket (une montante blanche et noire) : de profil selon le lacet
        const pied = 27 * Math.abs(cy) < 27 ? 27 * Math.abs(sy) + 11 * Math.abs(cy) : 27;
        const dir = sy >= 0 ? 1 : -1;
        const x = j.A[0], y = j.A[1];
        ctx.fillStyle = '#F1ECE2';
        ctx.beginPath();
        ctx.moveTo(x - 6 * dir, y - 5);
        ctx.lineTo(x - 6.5 * dir, y + 5);
        ctx.lineTo(x + (pied - 6) * dir, y + 5);
        ctx.quadraticCurveTo(x + (pied - 3) * dir, y + 2, x + (pied - 8) * dir, y - 1);
        ctx.lineTo(x + 2 * dir, y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1E1E20';
        ctx.fillRect(Math.min(x - 6.5 * dir, x + (pied - 6) * dir), y + 3.2, Math.abs(pied - 0.5), 1.8);
        ctx.fillStyle = '#B8322E';
        ctx.beginPath(); ctx.moveTo(x - 6 * dir, y - 5); ctx.lineTo(x - 6.4 * dir, y + 1); ctx.lineTo(x + 1 * dir, y + 1); ctx.lineTo(x + 1.5 * dir, y - 5.5); ctx.closePath(); ctx.fill();
      });
    }

    /* ---------- le tronc, le t-shirt, le tablier ---------- */
    function tronc(ctx, Pj) {
      const sil = silhouetteTronc(Pj);
      const contour = sil.g.concat(sil.d.slice().reverse());
      // le bassin (jean) sous le t-shirt
      ctx.beginPath();
      lisse(ctx, contour, true, 0.14);
      const top = Pj(0, 151, 0), bot = Pj(0, 87, 0);
      ctx.fillStyle = PAL.tshirt;
      ctx.fill();
      remplirMotif(ctx, texTricot(), top[0], top[1], 0.25, 1);
      ctx.fillStyle = lin(ctx, top[0] - 20, top[1], top[0] + 22, top[1] + 30, [[0, 'rgba(120,132,150,0.24)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
      ctx.fill();
      // les plis du t-shirt (sous les bras, sur la poitrine)
      ctx.strokeStyle = 'rgba(10,12,16,0.35)';
      ctx.lineWidth = 0.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      [[-1, 131, 124], [1, 131, 124], [-1, 125, 116], [1, 126, 117]].forEach(([s, h0, h1]) => {
        const a = surTronc(Pj, s * 16.5, h0), b = surTronc(Pj, s * 12, h1);
        ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(lerp(a[0], b[0], 0.5) + s * 0.8, lerp(a[1], b[1], 0.5), b[0], b[1]);
      });
      ctx.stroke();
      // le col rond, côtelé
      {
        const pts = [];
        for (let k = -6; k <= 6; k++) {
          const u = k / 6, xf = u * 6.6, h = 150.6 - (1 - u * u) * 2.3;
          pts.push(surTronc(Pj, xf, h, 0.5));
        }
        ctx.beginPath();
        lisse(ctx, pts, false);
        ctx.strokeStyle = '#3A404A';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
      tablier(ctx, Pj);
    }

    function tablier(ctx, Pj) {
      const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      // contour : la bavette (sur le tronc), puis la jupe (qui tombe)
      const bav = [];
      const HB = 137.5, HT = 104;
      bav.push(surTronc(Pj, -12.2, HB, 0.5));
      for (let k = 1; k <= 5; k++) { const t = k / 5; bav.push(surTronc(Pj, lerp(-12.2, 12.2, t), HB + Math.sin(t * Math.PI) * 0.15, 0.5)); }
      for (let k = 1; k <= 6; k++) { const t = k / 6, h = lerp(HB, HT, t); bav.push(surTronc(Pj, 12.2 + 4.8 * t * t, h, 0.5)); }
      // la jupe, à droite : de la taille à l'ourlet
      const HO = 52;
      for (let k = 1; k <= 6; k++) { const t = k / 6; bav.push(surJupe(Pj, lerp(18.5, 22.8, t), lerp(HT - 2, HO, t), 0.2)); }
      for (let k = 1; k < 10; k++) { const t = k / 10; bav.push(surJupe(Pj, lerp(22.8, -22.8, t), HO + Math.sin(t * Math.PI) * 0.6, 0.2)); }
      for (let k = 0; k <= 6; k++) { const t = k / 6; bav.push(surJupe(Pj, lerp(-22.8, -18.5, t), lerp(HO, HT - 2, t), 0.2)); }
      for (let k = 1; k <= 6; k++) { const t = 1 - k / 6, h = lerp(HB, HT, t); bav.push(surTronc(Pj, -12.2 - 4.8 * t * t, h, 0.5)); }
      const top = Pj(0, 140, 0), bot = Pj(0, 52, 0);
      ctx.beginPath();
      lisse(ctx, bav, true, 0.1);
      ctx.fillStyle = PAL.tablier;
      ctx.fill();
      remplirMotif(ctx, texToile(), top[0], top[1], 0.2, 1);
      ctx.save();
      ctx.clip();
      // le volume : lumière en haut à gauche, ombre en bas et sur le côté fuyant
      ctx.fillStyle = lin(ctx, top[0] - 18, top[1], top[0] + 20, top[1], [[0, 'rgba(255,214,160,0.2)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(30,15,5,0.3)']]);
      ctx.fillRect(top[0] - 40, top[1] - 5, 80, 100);
      ctx.fillStyle = lin(ctx, 0, top[1], 0, bot[1], [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(0,0,0,0.04)'], [1, 'rgba(25,12,4,0.32)']]);
      ctx.fillRect(top[0] - 40, top[1] - 5, 80, 100);
      // l'usure (plus clair au ventre et sur les cuisses), les taches de colle et de teinture
      [[0, 112, 8], [-9, 74, 6], [9, 72, 6]].forEach(([x, h, rr]) => {
        const p = surJupe(Pj, x, h);
        const q = h > 104 ? surTronc(Pj, x, h) : p;
        ctx.fillStyle = rad(ctx, q[0], q[1], rr, [[0, 'rgba(230,190,140,0.16)'], [1, 'rgba(230,190,140,0)']]);
        ctx.beginPath(); ctx.arc(q[0], q[1], rr, 0, TAU); ctx.fill();
      });
      taches.forEach((t) => {
        const p = t.h > 104 ? surTronc(Pj, t.x * 0.8, t.h) : surJupe(Pj, t.x, t.h);
        if (p[2] < -2) return;
        ctx.fillStyle = rgba(t.c, t.a);
        ctx.beginPath(); ctx.ellipse(p[0], p[1], t.r * Math.max(0.3, cy * cy + 0.2), t.r * 0.8, 0.3, 0, TAU); ctx.fill();
      });
      // les plis de la jupe : des ombres douces verticales qui suivent les jambes
      ctx.lineCap = 'round';
      [[-11, 100, 56, 0.2], [-3, 98, 60, 0.12], [6, 99, 55, 0.16], [14, 100, 57, 0.2]].forEach(([x, h0, h1, a]) => {
        const p0 = surJupe(Pj, x * 0.8, h0), p1 = surJupe(Pj, x + S.tablier.x * 0.2, h1);
        ctx.strokeStyle = `rgba(40,20,6,${a})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(lerp(p0[0], p1[0], 0.5) + 0.8, lerp(p0[1], p1[1], 0.5), p1[0], p1[1]); ctx.stroke();
        ctx.strokeStyle = `rgba(255,220,170,${a * 0.5})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(p0[0] + 1.3, p0[1]); ctx.quadraticCurveTo(lerp(p0[0], p1[0], 0.5) + 2.1, lerp(p0[1], p1[1], 0.5), p1[0] + 1.3, p1[1]); ctx.stroke();
      });
      // les fronces à la taille (la ceinture serrée)
      ctx.strokeStyle = 'rgba(40,20,6,0.25)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let k = -4; k <= 4; k++) {
        const p = surJupe(Pj, k * 4, 102.5), q = surJupe(Pj, k * 4.3, 96);
        ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      ctx.restore();

      // les coutures (fil beige, doubles) : haut de la bavette, bords, ourlet
      const couture = (pts, dz = 0) => {
        ctx.beginPath();
        lisse(ctx, pts, false);
        ctx.setLineDash([0.9, 0.7]);
        ctx.strokeStyle = rgba(PAL.couture, 0.85);
        ctx.lineWidth = 0.22;
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const ligneT = (x0, x1, h, dz = 0.6) => Array.from({ length: 7 }, (_, k) => surTronc(Pj, lerp(x0, x1, k / 6), h, dz));
      const ligneJ = (x0, x1, h) => Array.from({ length: 9 }, (_, k) => surJupe(Pj, lerp(x0, x1, k / 8), h, 0.35));
      couture(ligneT(-11.5, 11.5, HB - 0.9));
      couture(ligneT(-11.5, 11.5, HB - 1.6));
      couture(ligneJ(-22, 22, HO + 1.2));

      // la poche de poitrine (à gauche de Clément : à droite de l'écran), un stylo et un marqueur dedans
      {
        const pk = [surTronc(Pj, 1.5, 130.5, 0.9), surTronc(Pj, 10.3, 130.5, 0.9), surTronc(Pj, 10.6, 119.5, 0.9), surTronc(Pj, 1.8, 119.5, 0.9)];
        if (pk[0][2] > -3) {
          // stylo et marqueur qui dépassent
          [[3.2, '#1E1E22', 6.2, 0.55], [5.0, '#D8342C', 4.8, 0.7]].forEach(([x, c, l, e]) => {
            const a = surTronc(Pj, x, 129.5, 1.2), b = surTronc(Pj, x + 0.3, 129.5 + l, 1.2);
            ctx.strokeStyle = c;
            ctx.lineWidth = e * 1.8;
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 0.25;
            ctx.beginPath(); ctx.moveTo(a[0] - 0.3, a[1]); ctx.lineTo(b[0] - 0.3, b[1]); ctx.stroke();
          });
          ctx.beginPath();
          poly(ctx, pk);
          ctx.fillStyle = PAL.tablier;
          ctx.fill();
          remplirMotif(ctx, texToile(), top[0] + 3, top[1] + 1, 0.2, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(40,20,6,0.45)';
          ctx.lineWidth = 0.35;
          ctx.stroke();
          couture([surTronc(Pj, 1.9, 129.6, 1.0), surTronc(Pj, 10, 129.6, 1.0)]);
          couture([surTronc(Pj, 2.2, 120.2, 1.0), surTronc(Pj, 10.1, 120.2, 1.0)]);
          // les rivets de cuivre
          [pk[0], pk[1]].forEach((p) => { ctx.fillStyle = PAL.cuivre; ctx.beginPath(); ctx.arc(p[0], p[1] + 0.5, 0.45, 0, TAU); ctx.fill(); });
        }
      }
      // l'écusson rond rouge et jaune (à droite de Clément : à gauche de l'écran)
      {
        const c = surTronc(Pj, -6.4, 127.5, 1.0);
        if (c[2] > -1) {
          const fx = clamp(Math.cos(S.yaw + Math.asin(-6.4 / 18.9)), 0.15, 1);
          ctx.save();
          ctx.translate(c[0], c[1]);
          ctx.scale(fx, 1);
          ctx.fillStyle = PAL.ecussonRouge;
          ctx.beginPath(); ctx.arc(0, 0, 3.3, 0, TAU); ctx.fill();
          ctx.fillStyle = PAL.ecussonJaune;
          ctx.beginPath(); ctx.arc(0, 0, 2.35, 0, TAU); ctx.fill();
          // un petit motif : une basket stylisée
          ctx.fillStyle = PAL.ecussonRouge;
          ctx.beginPath();
          ctx.moveTo(-1.6, 0.7); ctx.lineTo(-1.5, -0.6); ctx.lineTo(-0.5, -0.7); ctx.quadraticCurveTo(0.3, -0.2, 1.6, 0.1); ctx.lineTo(1.7, 0.7); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,240,200,0.8)';
          ctx.lineWidth = 0.22;
          ctx.setLineDash([0.5, 0.35]);
          ctx.beginPath(); ctx.arc(0, 0, 2.85, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.beginPath(); ctx.ellipse(-0.9, -1.2, 1.6, 0.9, -0.5, 0, TAU); ctx.fill();
          ctx.restore();
        }
      }
      // la grande poche du bas, en trois compartiments ; l'étiquette cousue ; un réglet qui dépasse
      {
        const HP = 95, BP = 76;
        const pk = [];
        for (let k = 0; k <= 8; k++) pk.push(surJupe(Pj, lerp(-17, 17, k / 8), HP, 0.8));
        for (let k = 0; k <= 8; k++) pk.push(surJupe(Pj, lerp(17.4, -17.4, k / 8), BP, 0.8));
        // les outils dans les compartiments
        const reg = [surJupe(Pj, -11, HP - 1, 0.6), surJupe(Pj, -10.2, HP + 9, 0.6)];
        ctx.strokeStyle = '#C9CDD0';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(reg[0][0], reg[0][1]); ctx.lineTo(reg[1][0], reg[1][1]); ctx.stroke();
        ctx.strokeStyle = '#6E7378';
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) { const t = k / 8; const x = lerp(reg[0][0], reg[1][0], t), y = lerp(reg[0][1], reg[1][1], t); ctx.moveTo(x - 0.6, y); ctx.lineTo(x, y); }
        ctx.stroke();
        const tourn = [surJupe(Pj, 9.5, HP - 1, 0.6), surJupe(Pj, 10.8, HP + 7, 0.6)];
        ctx.strokeStyle = '#E0762C';
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(tourn[0][0], tourn[0][1]); ctx.lineTo(tourn[1][0], tourn[1][1]); ctx.stroke();
        ctx.beginPath();
        lisse(ctx, pk, true, 0.05);
        ctx.fillStyle = PAL.tablier;
        ctx.fill();
        remplirMotif(ctx, texToile(), top[0] + 5, top[1] + 3, 0.2, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,20,6,0.5)';
        ctx.lineWidth = 0.35;
        ctx.stroke();
        couture(Array.from({ length: 9 }, (_, k) => surJupe(Pj, lerp(-16.4, 16.4, k / 8), HP - 0.8, 1.0)));
        [-5.8, 5.8].forEach((x) => couture([surJupe(Pj, x, HP - 1, 1.0), surJupe(Pj, x * 1.02, BP + 0.6, 1.0)]));
        [[-17, HP], [17, HP], [-5.8, HP], [5.8, HP]].forEach(([x, h]) => { const p = surJupe(Pj, x, h - 0.6, 1.1); ctx.fillStyle = PAL.cuivre; ctx.beginPath(); ctx.arc(p[0], p[1], 0.45, 0, TAU); ctx.fill(); });
        // l'étiquette (sans marque) sur le compartiment de droite
        const e = [surJupe(Pj, 9.5, HP - 3, 1.1), surJupe(Pj, 14.5, HP - 3, 1.1), surJupe(Pj, 14.5, HP - 6.6, 1.1), surJupe(Pj, 9.5, HP - 6.6, 1.1)];
        if (e[0][2] > -2) {
          ctx.beginPath(); poly(ctx, e);
          ctx.fillStyle = '#E4D2A8';
          ctx.fill();
          ctx.strokeStyle = 'rgba(90,60,30,0.6)';
          ctx.lineWidth = 0.18;
          ctx.stroke();
          const m = [(e[0][0] + e[2][0]) / 2, (e[0][1] + e[2][1]) / 2];
          ctx.fillStyle = '#8E5A30';
          ctx.beginPath(); ctx.arc(m[0], m[1], 0.9 * Math.max(0.3, Math.abs(cy)), 0, TAU); ctx.fill();
        }
      }
      // les bretelles (de la bavette aux épaules)
      [-1, 1].forEach((s) => {
        const a = surTronc(Pj, s * 10.2, HB - 0.5, 0.6), b = surTronc(Pj, s * 9.4, 146.5, 0.4), c = surTronc(Pj, s * 8.8, 150.2, -1.5);
        const d = surTronc(Pj, s * 13.6, HB - 0.5, 0.6), e2 = surTronc(Pj, s * 12.6, 146.8, 0.4), f2 = surTronc(Pj, s * 12.2, 150.6, -1.5);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.lineTo(f2[0], f2[1]); ctx.quadraticCurveTo(e2[0], e2[1], d[0], d[1]); ctx.closePath();
        ctx.fillStyle = s * sy > 0.3 ? PAL.tablierOmbre : PAL.tablier;
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fill();
        ctx.setLineDash([0.8, 0.6]);
        ctx.strokeStyle = rgba(PAL.couture, 0.7);
        ctx.lineWidth = 0.18;
        ctx.stroke();
        ctx.setLineDash([]);
        // la boucle de réglage en laiton
        const m = surTronc(Pj, s * 11.8, 142, 1.0);
        ctx.fillStyle = PAL.laiton;
        ctx.fillRect(m[0] - 1.6, m[1] - 0.7, 3.2, 1.4);
        ctx.fillStyle = 'rgba(255,240,200,0.6)';
        ctx.fillRect(m[0] - 1.6, m[1] - 0.7, 3.2, 0.4);
      });
      // les liens de la taille, qui partent dans le dos
      [-1, 1].forEach((s) => {
        const a = surJupe(Pj, s * 18.8, 104.5, 0.5), b = surJupe(Pj, s * 21, 104.2, -2);
        ctx.strokeStyle = PAL.tablierOmbre;
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      });
    }

    /* ---------- les bras ---------- */
    function bras(ctx, Pj, cote, tete) { // cote : 'D' (droite de Clément = gauche de l'écran de face) ou 'G'
      const M = cote === 'D' ? S.mainD : S.mainG;
      const s = cote === 'D' ? -1 : 1;
      const Sh = Pj(s * EPAULE[0], EPAULE[1], EPAULE[2]);
      // le pôle : le coude part vers l'extérieur et vers le bas (dans le repère du corps)
      const pole = Pj(s * 30, 112, -30);
      const T = [M.x, M.y];
      const cA = clamp(M.coude || 0, 0, 1); // le coude qui vient vers nous : le bras se raccourcit à l'œil
      const cB = clamp(M.raccourci || 0, 0, 1); // l'avant-bras qui pointe vers nous (une main tenue devant la poitrine)
      const kB = (1 - 0.1 * cA) * (1 - 0.62 * cB);
      const L1 = L_BRAS * (1 - 0.42 * cA), L2 = (L_AVB + L_MAIN * 0.7) * kB;
      const k = ik(Sh, T, L1, L2, pole);
      let E = k.E, versW = [k.W[0] - E[0], k.W[1] - E[1]], Lavb = L_AVB * kB;
      // une main tenue devant soi, sous l'épaule : le coude ne monte pas, il vient vers nous (tout se raccourcit à l'œil)
      const monte = Sh[1] - E[1];
      if (monte > 0 && T[1] > Sh[1] - 8) {
        const pdx = pole[0] - Sh[0], pdy = pole[1] - Sh[1], pl = Math.hypot(pdx, pdy) || 1;
        const En = [Sh[0] + (pdx / pl) * L_BRAS * 0.6, Sh[1] + (pdy / pl) * L_BRAS * 0.6];
        const t = clamp(monte / 10, 0, 1) * clamp((T[1] - (Sh[1] - 8)) / 10, 0, 1);
        E = [lerp(E[0], En[0], t), lerp(E[1], En[1], t)];
        versW = [T[0] - E[0], T[1] - E[1]];
        Lavb = lerp(Lavb, clamp(Math.hypot(versW[0], versW[1]) - L_MAIN * 0.7, 4, Lavb), t);
      }
      const dxW = versW[0], dyW = versW[1], lw = Math.hypot(dxW, dyW) || 1;
      const W = [E[0] + (dxW / lw) * Lavb, E[1] + (dyW / lw) * Lavb];
      const angAvb = Math.atan2(dyW, dxW);
      let angMain = M.angle == null ? angAvb : M.angle;
      const dA = Math.atan2(Math.sin(angMain - angAvb), Math.cos(angMain - angAvb));
      angMain = angAvb + clamp(dA, -1.25, 1.25);
      // le pouce vers l'avant et vers le corps (ou vers le haut quand la main est à l'horizontale)
      const dx = -0.5 * s * Math.cos(S.yaw) + Math.sin(S.yaw);
      let flip = Math.sin(angMain) * dx + 0.7 * Math.cos(angMain) >= 0 ? 1 : -1;
      if (M.miroir != null) flip = M.miroir; else if (M.retourne) flip = -flip;
      return { cote, s, Sh, E, W, angMain, M, z: Sh[2], flip };
    }
    function dessinerBras(ctx, B, avecMain = true) {
      const { Sh, E, W } = B;
      const peau = [[0, PAL.peauClair], [0.45, PAL.peau], [1, PAL.peauOmbre]];
      // le bras nu (sous la manche), l'avant-bras
      membre(ctx, lerp2(Sh, E, 0.3), E, 5.0, 4.3, peau, 4.9);
      const fa = membre(ctx, E, W, 4.3, 2.9, peau, 4.75, 0.3);
      // les poils de l'avant-bras, à peine
      ctx.strokeStyle = 'rgba(80,45,25,0.25)';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const t = 0.2 + k * 0.07, ex = lerp(E[0], W[0], t) + fa.nx * ((k % 3) - 1) * 1.6, ey = lerp(E[1], W[1], t) + fa.ny * ((k % 3) - 1) * 1.6;
        ctx.moveTo(ex, ey); ctx.lineTo(ex + fa.ux * 0.9 + fa.nx * 0.3, ey + fa.uy * 0.9 + fa.ny * 0.3);
      }
      ctx.stroke();
      // les tatouages (encre bleu-gris) : une rose et sa banderole à gauche, une hirondelle à droite
      {
        ctx.save();
        ctx.beginPath();
        const clipA = [E[0] + fa.nx * 4.2, E[1] + fa.ny * 4.2], clipB = [W[0] + fa.nx * 2.8, W[1] + fa.ny * 2.8], clipC = [W[0] - fa.nx * 2.8, W[1] - fa.ny * 2.8], clipD = [E[0] - fa.nx * 4.2, E[1] - fa.ny * 4.2];
        poly(ctx, [clipA, clipB, clipC, clipD]);
        ctx.clip();
        ctx.translate(E[0], E[1]);
        ctx.rotate(Math.atan2(fa.uy, fa.ux));
        const encre = (a) => rgba(PAL.encre, a);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (B.cote === 'G') {
          // la rose (des pétales en spirale, pleins), deux feuilles, une banderole
          ctx.fillStyle = encre(0.3);
          ctx.beginPath(); ctx.arc(9.8, 0.2, 2.5, 0, TAU); ctx.fill();
          ctx.strokeStyle = encre(0.75); ctx.lineWidth = 0.26;
          ctx.beginPath(); ctx.arc(9.8, 0.2, 2.5, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(9.9, 0.1, 1.5, 0.3, 5.6); ctx.stroke();
          ctx.beginPath(); ctx.arc(10.1, 0.2, 0.7, 1.2, 6.0); ctx.stroke();
          ctx.fillStyle = encre(0.45);
          [[13.2, -1.7, -0.5], [6.6, 1.9, 0.5]].forEach(([fx, fy, a]) => { ctx.save(); ctx.translate(fx, fy); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-1.9, 0); ctx.quadraticCurveTo(0, -1.1, 1.9, 0); ctx.quadraticCurveTo(0, 1.1, -1.9, 0); ctx.fill(); ctx.restore(); });
          ctx.strokeStyle = encre(0.7); ctx.lineWidth = 0.22;
          ctx.beginPath(); ctx.moveTo(15.5, -2.4); ctx.lineTo(21.5, -2.1); ctx.lineTo(22.6, -1.2); ctx.lineTo(21.6, -0.3); ctx.lineTo(15.6, -0.6); ctx.lineTo(16.3, -1.5); ctx.closePath(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(4.2, -2.6); ctx.bezierCurveTo(5.6, -3.4, 6.2, -1.6, 7.4, -2.4); ctx.stroke();
        } else {
          // l'hirondelle
          ctx.fillStyle = encre(0.4);
          ctx.beginPath(); ctx.moveTo(8, 0.4); ctx.quadraticCurveTo(10.5, -1.6, 13.4, -0.6); ctx.lineTo(16.8, -2.6); ctx.lineTo(15, 0); ctx.lineTo(17.2, 1.6); ctx.lineTo(13.2, 0.9); ctx.quadraticCurveTo(10.8, 2.2, 8, 0.4); ctx.fill();
          ctx.strokeStyle = encre(0.75); ctx.lineWidth = 0.22; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(10.6, -0.9); ctx.quadraticCurveTo(12.4, -3.6, 14.2, -3.2); ctx.stroke();
          ctx.fillStyle = encre(0.8); ctx.beginPath(); ctx.arc(8.9, 0.2, 0.25, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // la manche du t-shirt, par-dessus le haut du bras
      const Mn = lerp2(Sh, E, 0.47);
      const ux = (E[0] - Sh[0]), uy = (E[1] - Sh[1]), l = Math.hypot(ux, uy) || 1, nx = -uy / l, ny = ux / l;
      {
        // la manche : un tube qui s'évase un peu vers l'ourlet, l'épaule arrondie mais sans « boule »
        const A = lerp2(Sh, E, -0.02), rA = 4.35, rB = 5.35;
        const clair = nx * -0.55 + ny * -0.83 > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(A[0] + nx * rA, A[1] + ny * rA);
        ctx.quadraticCurveTo(lerp(A[0], Mn[0], 0.5) + nx * (rA + rB) * 0.54, lerp(A[1], Mn[1], 0.5) + ny * (rA + rB) * 0.54, Mn[0] + nx * rB, Mn[1] + ny * rB);
        ctx.lineTo(Mn[0] - nx * rB, Mn[1] - ny * rB);
        ctx.quadraticCurveTo(lerp(A[0], Mn[0], 0.5) - nx * (rA + rB) * 0.5, lerp(A[1], Mn[1], 0.5) - ny * (rA + rB) * 0.5, A[0] - nx * rA, A[1] - ny * rA);
        ctx.arc(A[0], A[1], rA, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true);
        ctx.closePath();
        const R0 = rB * 1.1, M0 = lerp2(A, Mn, 0.5);
        ctx.fillStyle = lin(ctx, M0[0] + nx * R0 * clair, M0[1] + ny * R0 * clair, M0[0] - nx * R0 * clair, M0[1] - ny * R0 * clair, [[0, PAL.tshirtClair], [0.45, PAL.tshirt], [1, PAL.tshirtOmbre]]);
        ctx.fill();
        remplirMotif(ctx, texTricot(), A[0], A[1], 0.25, 0.6);
      }
      ctx.strokeStyle = 'rgba(12,14,18,0.55)';
      ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.moveTo(Mn[0] + nx * 5.2, Mn[1] + ny * 5.2); ctx.lineTo(Mn[0] - nx * 5.2, Mn[1] - ny * 5.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(Mn[0] + nx * 5.1 - ux / l * 0.6, Mn[1] + ny * 5.1 - uy / l * 0.6); ctx.lineTo(Mn[0] - nx * 5.1 - ux / l * 0.6, Mn[1] - ny * 5.1 - uy / l * 0.6); ctx.stroke();
      // un pli de la manche, la couture d'épaule
      ctx.strokeStyle = 'rgba(10,12,16,0.4)';
      ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(lerp(Sh[0], Mn[0], 0.5) + nx * 2.5, lerp(Sh[1], Mn[1], 0.5) + ny * 2.5); ctx.quadraticCurveTo(lerp(Sh[0], Mn[0], 0.75), lerp(Sh[1], Mn[1], 0.75), Mn[0] - nx * 1.5, Mn[1] - ny * 1.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(10,12,16,0.3)';
      ctx.beginPath(); ctx.moveTo(Sh[0] + nx * 4.2 + ux / l * 1.2, Sh[1] + ny * 4.2 + uy / l * 1.2); ctx.quadraticCurveTo(Sh[0] + ux / l * 2.4, Sh[1] + uy / l * 2.4, Sh[0] - nx * 4.2 + ux / l * 1.2, Sh[1] - ny * 4.2 + uy / l * 1.2); ctx.stroke();
      // la montre (poignet gauche) : bracelet de cuir orange, boîtier d'acier
      if (B.cote === 'G') {
        const wx = lerp(E[0], W[0], 0.9), wy = lerp(E[1], W[1], 0.9);
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(Math.atan2(W[1] - E[1], W[0] - E[0]));
        ctx.fillStyle = PAL.montre;
        ctx.fillRect(-1.1, -3.25, 2.2, 6.5);
        ctx.fillStyle = 'rgba(255,220,170,0.35)';
        ctx.fillRect(-1.1, -3.25, 0.5, 6.5);
        ctx.fillStyle = lin(ctx, -1.6, -1.6, 1.6, 1.6, [[0, '#E6E9EB'], [0.5, '#9EA3A8'], [1, '#5E6368']]);
        ctx.beginPath(); ctx.arc(0, -2.1, 1.65, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1C1E22';
        ctx.beginPath(); ctx.arc(0, -2.1, 1.2, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(-0.4, -2.5, 0.35, 0, TAU); ctx.fill();
        ctx.restore();
      }
      if (avecMain) dessinerLaMain(ctx, B);
    }
    function dessinerLaMain(ctx, B) {
      const { W, angMain, M } = B;
      ctx.save();
      ctx.translate(W[0], W[1]);
      ctx.rotate(angMain);
      ctx.scale(ECHELLE_MAIN, ECHELLE_MAIN * B.flip);
      dessinerMain(ctx, M.pose || 'ouverte', true);
      ctx.restore();
    }
    const lerp2 = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2] || 0, B[2] || 0, t)];

    /* ---------- le cou ---------- */
    function cou(ctx, Pj, H) {
      const pts = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        pts.push(Pj(Math.sin(a) * 6.0, 150.2, 0.5 + Math.cos(a) * 5.6));
      }
      const haut = anneauCou(H);
      const env = enveloppe(pts.concat(haut));
      ctx.beginPath();
      lisse(ctx, env, true, 0.08);
      const yT = Math.min(...haut.map((p) => p[1])), yB = pts[0][1];
      ctx.fillStyle = lin(ctx, 0, yT, 0, yB, [[0, '#4E2A1E'], [0.4, PAL.peauSombre], [1, PAL.peauOmbre]]);
      ctx.fill();
      const xs = env.map((p) => p[0]);
      ctx.fillStyle = lin(ctx, Math.min(...xs), 0, Math.max(...xs), 0, [[0, 'rgba(255,220,190,0.16)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(40,16,8,0.32)']]);
      ctx.fill();
    }

    /* ---------- l'ombre au sol ---------- */
    function ombreSol(ctx) {
      ctx.fillStyle = rad(ctx, S.x, S.y, 30, [[0, 'rgba(10,6,3,0.35)'], [1, 'rgba(10,6,3,0)']]);
      ctx.save();
      ctx.translate(S.x, S.y);
      ctx.scale(1, 0.18);
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill();
      ctx.restore();
    }

    /* ---------- les images en cache : la tête et le tronc (redessinés seulement quand la pose change) ---------- */
    function Cache(max) {
      const m = new Map();
      return {
        get(k) { const v = m.get(k); if (v) { m.delete(k); m.set(k, v); } return v; },
        set(k, v) { m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); },
        clear() { m.clear(); },
        get taille() { return m.size; },
      };
    }
    const cacheTete = Cache(opts.cacheTete || 28), cacheTronc = Cache(opts.cacheTronc || 10);
    const stats = { tete: 0, teteRate: 0, tronc: 0, troncRate: 0 };
    const q = (v, pas) => Math.round(v / pas);
    /** dessine via le cache : bb = la boîte (cm) autour de l'ancre ; dessin(g) dessine autour de (0, 0) */
    function viaCache(ctx, cache, cle, bb, ancre, dessin, nom) {
      const T = ctx.getTransform ? ctx.getTransform() : null;
      const k = T ? Math.hypot(T.a, T.b) : 4;
      const kq = Math.pow(1.06, Math.round(Math.log(k) / Math.log(1.06))) * 1.12;
      const key = cle + '|' + kq.toFixed(3);
      let e = cache.get(key);
      if (!e) {
        const c = toile(bb.w * kq, bb.h * kq), g = c.getContext('2d');
        g.setTransform(kq, 0, 0, kq, -bb.x * kq, -bb.y * kq);
        const info = dessin(g);
        e = { c, info };
        cache.set(key, e);
        stats[nom + 'Rate']++;
      }
      stats[nom]++;
      ctx.drawImage(e.c, ancre[0] + bb.x, ancre[1] + bb.y, bb.w, bb.h);
      return e.info;
    }
    const BB_TETE = { x: -20, y: -29, w: 40, h: 48 }, BB_TRONC = { x: -36, y: -162, w: 72, h: 136 };

    /** dessine le pantin. passe : 'tout', 'corps' (tout sauf ce qui est devant les meubles), 'devant' ;
        objets(ctx, main, repere) : le décor dessine ce que tient la main (entre le bras et les doigts) */
    function dessiner(ctx, passe = 'tout', objets = null) {
      const Pj = projeteur();
      const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      if (passe !== 'devant') {
        dernier = { bras: [] };
      }
      // la tête : pivot au haut du cou
      const piv = Pj(0, 157.5, 1.2);
      const headYaw = S.yaw + S.tete.turn;
      const brasD = bras(ctx, Pj, 'D'), brasG = bras(ctx, Pj, 'G');
      const liste = [brasD, brasG].sort((a, b) => a.z - b.z);
      const derriere = (B) => B.z < -3 && !B.M.devant; // le bras loin, derrière le tronc
      if (passe !== 'devant') {
        ombreSol(ctx);
        jambes(ctx, Pj);
        liste.forEach((B) => { if (derriere(B)) { dessinerBras(ctx, B, false); if (objets && B.M.objet) objets(ctx, B.M, B); dessinerLaMain(ctx, B); } });
        // les valeurs arrondies (ce que le cache sait distinguer)
        const H0 = {
          x: 0, y: 0, yaw: q(headYaw, 0.025) * 0.025, pitch: q(S.tete.pitch + S.lean * 0.3, 0.025) * 0.025, roll: q(S.tete.roll - S.cote * 0.6, 0.025) * 0.025,
          regard: [q(S.regard[0], 0.1) * 0.1, q(S.regard[1], 0.1) * 0.1], cligne: q(S.cligne, 0.25) * 0.25, bouche: q(S.bouche, 0.12) * 0.12,
          sourire: q(S.sourire, 0.1) * 0.1, sourcils: q(S.sourcils, 0.1) * 0.1, souffle: q(S.souffle, 0.2) * 0.2, clous: S.clous | 0, eclat: q(S.eclat, 0.2) * 0.2,
        };
        H0.reflet = H0.yaw;
        const HT = Object.assign({}, H0, { x: piv[0], y: piv[1] });
        // le tronc et le tablier : en cache, ancrés aux pieds (le rebond du pas s'ajoute à l'ancre)
        const respQ = q(Math.sin(S.respire), 0.34) * 0.34;
        const cleTronc = [q(S.yaw, 0.02), q(S.lean, 0.02), q(S.cote, 0.02), q(S.assis, 0.04), q(respQ, 0.34), q(S.tablier.x, 0.45), q(S.tablier.z, 0.45)].join(',');
        if (opts.sansCache) tronc(ctx, Pj);
        else viaCache(ctx, cacheTronc, cleTronc, BB_TRONC, [S.x, S.y - rebond()], (g) => tronc(g, projeteur({ x0: 0, y0: 0, sansBob: true, resp: respQ })), 'tronc');
        cou(ctx, Pj, HT);
        let t;
        if (opts.sansCache) t = dessinerTete(ctx, HT);
        else {
          const cleTete = [H0.yaw, H0.pitch, H0.roll, H0.regard[0], H0.regard[1], H0.cligne, H0.bouche, H0.sourire, H0.sourcils, H0.souffle, H0.clous, H0.eclat].map((v) => v.toFixed(3)).join(',');
          const r = viaCache(ctx, cacheTete, cleTete, BB_TETE, piv, (g) => dessinerTete(g, H0), 'tete');
          t = { centre: [r.centre[0] + piv[0], r.centre[1] + piv[1]], haut: [r.haut[0] + piv[0], r.haut[1] + piv[1], r.haut[2]], bouche: [r.bouche[0] + piv[0], r.bouche[1] + piv[1]] };
        }
        dernier.tete = t;
        dernier.piv = piv;
      }
      // les bras (le décor peut s'intercaler : ceux qui ne sont pas « devant » se dessinent avec le corps)
      liste.forEach((B) => {
        if (derriere(B)) return;
        const devant = !!B.M.devant;
        if ((passe === 'corps' && devant) || (passe === 'devant' && !devant)) return;
        dessinerBras(ctx, B, false);
      });
      liste.forEach((B) => {
        if (derriere(B)) return;
        const devant = !!B.M.devant;
        if ((passe === 'corps' && devant) || (passe === 'devant' && !devant)) return;
        if (objets && B.M.objet) objets(ctx, B.M, B);
        dessinerLaMain(ctx, B);
      });
      if (dernier) dernier.bras = [brasD, brasG];
    }

    /** la boîte du pantin dans le monde (pour le toucher) */
    function boite() {
      const Pj = projeteur();
      const h = Pj(0, 184, 0), p = Pj(0, 40, 0);
      return { x: S.x - 26, y: h[1], w: 52, h: p[1] - h[1] };
    }
    /** la tête dans le monde : centre (entre les yeux), et le haut du crâne */
    function tete() {
      if (dernier && dernier.tete) return { x: dernier.tete.centre[0], y: dernier.tete.centre[1], haut: dernier.tete.haut[1] };
      const Pj = projeteur(), p = Pj(0, 168, 3);
      return { x: p[0], y: p[1], haut: p[1] - 14 };
    }
    /** l'épaule (pour poser les mains au repos) */
    function epaule(cote) {
      const Pj = projeteur();
      return Pj((cote === 'D' ? -1 : 1) * EPAULE[0], EPAULE[1], EPAULE[2]);
    }
    /** un point du corps (x, h, z) → monde */
    function point(x, h, z) { return projeteur()(x, h, z); }
    /** les mains au repos, le long du corps (ou posées devant, selon la pose) */
    function repos(cote) {
      const s = cote === 'D' ? -1 : 1;
      const Pj = projeteur();
      return S.assis > 0.5 ? Pj(s * 12, 108, 22) : Pj(s * 21.5, 83, 3);
    }

    /* ---------- la vie secondaire : respiration, clignements, tablier, éclat des verres ---------- */
    let tCligne = 1.5 + r() * 3, cligneT = -1, tEclat = 4 + r() * 6, eclatT = -1, t = 0;
    const tabl = S.tablier;
    let xPrec = S.x;
    function maj(dt) {
      const s = dt / 1000;
      t += s;
      S.respire += s * TAU / (S.marche > 0.3 ? 2.6 : 4.2);
      // clignement : vite, parfois double
      tCligne -= s;
      if (tCligne <= 0 && cligneT < 0) { cligneT = 0; tCligne = 2.2 + r() * 4 + (r() < 0.2 ? -1.9 : 0); }
      if (cligneT >= 0) {
        cligneT += s;
        const d = 0.16;
        S.cligne = cligneT < d / 2 ? cligneT / (d / 2) : cligneT < d ? 1 - (cligneT - d / 2) / (d / 2) : 0;
        if (cligneT >= d) { cligneT = -1; S.cligne = 0; }
      }
      // l'éclat des lunettes : de temps en temps quand il est de face
      tEclat -= s;
      if (tEclat <= 0 && eclatT < 0 && Math.abs(S.yaw + S.tete.turn) < 0.5) { eclatT = 0; tEclat = 5 + r() * 8; }
      if (eclatT >= 0) {
        eclatT += s;
        S.eclat = Math.sin(clamp(eclatT / 0.5, 0, 1) * Math.PI);
        if (eclatT > 0.5) { eclatT = -1; S.eclat = 0; }
      }
      // le tablier : un ressort amorti qui suit le corps (il traîne quand il marche, se balance quand il s'arrête)
      const v = (S.x - xPrec) / Math.max(0.001, s);
      xPrec = S.x;
      const cible = clamp(-v * 0.04, -4, 4) * Math.abs(Math.cos(S.yaw)) + Math.sin(S.marchePhase * TAU * 2) * S.marche * 0.6;
      const cibleZ = -Math.abs(v) * 0.025 * Math.abs(Math.sin(S.yaw)) + Math.sin(S.marchePhase * TAU) * S.marche * 1.4;
      const kk = 60, am = 7;
      tabl.vx += ((cible - tabl.x) * kk - tabl.vx * am) * s;
      tabl.vz += ((cibleZ - tabl.z) * kk - tabl.vz * am) * s;
      tabl.x += tabl.vx * s;
      tabl.z += tabl.vz * s;
    }

    return {
      etat: S, PAL, dessiner, maj, boite, tete, epaule, point, repos, stats,
      viderCaches() { cacheTete.clear(); cacheTronc.clear(); },
      get dernier() { return dernier; },
      L_BRAS, L_AVB,
    };
  }

  CO.Clement = { create, PAL, PINCE, ECHELLE_MAIN, dessinerTete, dessinerMain, prechauffer, outils: { lisse, poly, lin, rad, rgba, toile, enveloppe, remplirMotif, membre } };
})();
