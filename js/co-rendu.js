/* ==========================================================================
   Cordo 63 — l'établi vu de dessus : le moteur de rendu commun (CO.R)
   Tout ce qui se pose sur l'établi (outils, semelles, chaussures, le tapis de
   découpe, le plateau d'aggloméré) est calculé pixel par pixel dans un canvas,
   avec la même lumière : la vitrine de l'atelier en haut à gauche, lumière
   chaude et un peu rasante (≈ 38° au-dessus du plan de travail), atelier sombre
   autour. Les ombres portées tombent vers le bas à droite, douces et longues.

   Repère : millimètres, vu de dessus ; x vers la droite, y vers le bas, z vers l'œil.
   ppm = pixels (du canvas) par millimètre.

   Un objet se décrit en « couches » peintes l'une sur l'autre (ordre du peintre) :
     { box: [x0, y0, x1, y1] (mm, repère de l'objet), f(x, y, S), z: false }
   f reçoit un point du repère de l'objet (déjà tourné) et remplit l'ardoise S :
     S.d   distance signée au bord de la pièce (mm, < 0 dedans) : en premier ; si S.d > S.lim, sortir
     S.z   hauteur du dessus (mm)
     S.r, S.g, S.b  albédo LINÉAIRE ; S.ro rugosité (0 miroir … 1 mat) ; S.me métal (0..1)
     S.f0  réflectance des non-métaux (0,04) ; S.ao occlusion propre (1 = dégagé)
     S.sh  voile des tissus et du daim ; S.ev facteur des reflets (0..1)
     (S.h0 : la hauteur déjà peinte à cet endroit ; S.ppm : la résolution)
   z: true → la pièce ne se peint que là où elle dépasse ce qui est déjà peint.
   Ou un tube (lacets, fils, anneau) : { tube: [[x, y, z], …], r, plat, f(t, u, S) } (t : abscisse en mm,
   u : position dans la largeur, −1..1) ; un tube passe toujours au-dessus de ce qui est plus bas que lui.

   Le moteur en tire : relief → normales → occlusion des creux → ombres propres →
   lumière (diffus enveloppant, reflets de l'atelier et de la vitrine, Fresnel) →
   sprite ; et l'ombre portée (tranches de hauteur décalées puis floutées, en
   basse résolution), plus l'ombre de contact.

   Un « sprite » : { canvas, ombre, w, h, ax, ay, ppm, angle, t, … }
     canvas : l'objet éclairé (fond transparent), w × h mm ; (ax, ay) : l'origine de l'objet dans ce canvas (mm)
     ombre  : { canvas, x, y, k } — son ombre (basse résolution) : à poser en (ancre + x, ancre + y) mm,
              agrandie k fois ; R.poser(ctx, sprite, x, y, …) s'en occupe.

   Tout calcul est un générateur : R.lancer(gen, { prio, cle }) le découpe en tranches de quelques
   millisecondes (le fil principal ne gèle jamais) ; R.finir(gen) le mène au bout d'une traite.
   Un générateur peut céder une promesse (le chargement d'une police) : on l'attend avant de reprendre.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  if (CO.R && CO.R.rendre) return;
  const R = (CO.R = CO.R || {});
  R.VERSION = 'etabli-1';

  const TAU = Math.PI * 2;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  R.now = now;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sstep = (a, b, x) => {
    const t = (x - a) / (b - a);
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  R.clamp01 = clamp01;
  R.sstep = sstep;
  R.lerp = lerp;
  R.TAU = TAU;

  /* hasard déterministe (celui du noyau s'il est là, sinon le même mulberry32) */
  R.rng = function (seed) {
    if (CO.rng) return CO.rng(seed);
    let a = seed >>> 0;
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (min, max) => min + r() * (max - min);
    r.int = (min, max) => Math.floor(min + r() * (max - min + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  };

  /* hachage entier → [0, 1) */
  function hash2(i, j, s) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  R.hash2 = hash2;

  /* ======================================================================
     1. La lumière de l'atelier
     ====================================================================== */
  const nrm3 = (v) => {
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  };
  const L = (R.L = nrm3([-0.52, -0.6, 0.62])); // vers la vitrine : en haut à gauche, ≈ 38° au-dessus de l'établi
  R.LUM = [1.06, 0.85, 0.62]; // la lumière directe : chaude (lampe et fin de journée)
  R.AMB = [0.1, 0.1, 0.108]; // l'ambiance de l'atelier : faible, à peine plus froide
  R.EXPO = 1.0;
  /** l'appareil photo : à 65 cm au-dessus de l'établi (les reflets varient d'un bout à l'autre d'un objet) */
  R.OEIL = 650;
  /** décalage de l'ombre portée : mm par mm de hauteur (vers le bas à droite) */
  R.OMBRE = [-L[0] / L[2], -L[1] / L[2]];
  /** couleur des ombres portées (sRGB) : un noir un peu froid (elles ne reçoivent que l'ambiance) */
  R.OMBRE_RGB = [9, 12, 16];

  /* l'environnement qui se reflète dans les matières brillantes : l'atelier sombre, le plafond et les murs
     éclairés du côté de la vitrine, la vitrine elle-même (avec ses montants) dans l'axe de la lumière, un
     néon au plafond, et sous l'horizon le tapis vert */
  const ENV = (R.ENV = (() => {
    let ux = -L[1], uy = L[0];
    const ul = Math.hypot(ux, uy);
    ux /= ul; uy /= ul;
    // v = L × u : « vers le haut » dans le plan tangent à l'axe de la lumière
    const vx = -L[2] * uy, vy = L[2] * ux, vz = L[0] * uy - L[1] * ux;
    const lh = Math.hypot(L[0], L[1]);
    return {
      ux, uy, vx, vy, vz, lx: L[0] / lh, ly: L[1] / lh,
      U: 0.44, V0: -0.34, V1: 0.58, // la vitrine dans le plan tangent (≈ ±24° × −19°…+30° autour de la lumière)
      BAR: 0.016, TRAV: 0.16, // le montant (u = 0) et la traverse (v = TRAV)
      HAUT: 5.4, BAS: 2.3, // luminance du haut (le ciel) et du bas (la rue, les façades)
      MUR: [0.02, 0.017, 0.015], // les murs de l'atelier, à l'horizon
      PLAF: [0.26, 0.24, 0.22], // le plafond au-dessus de l'établi (clair, éclairé par la lampe)
      CLAIR: 0.62, // le plafond et les murs éclairés du côté de la vitrine
      HALO: 0.5, // autour de la vitrine
      NEON: 2.4, NY: -0.32, NX: 0.6, NW: 0.018, // le néon : un tube le long de x, un peu vers le haut de l'image
      NEONC: [0.9, 0.96, 1.0],
      SOL: [0.016, 0.05, 0.036], // sous l'horizon : le tapis vert, éclairé
    };
  })());

  /* ---------- sRGB ↔ linéaire ---------- */
  R.lin = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2));
  };
  const LIN8 = new Float32Array(256);
  for (let i = 0; i < 256; i++) LIN8[i] = Math.pow(i / 255, 2.2);
  R.LIN8 = LIN8;
  /* linéaire → sRGB 8 bits : table indexée en racine (précise dans les noirs), épaule douce des reflets */
  const ENC_N = 4096;
  const ENC = new Uint8ClampedArray(ENC_N + 1);
  for (let i = 0; i <= ENC_N; i++) {
    let v = 2 * (i / ENC_N) * (i / ENC_N); // v ∈ [0, 2]
    if (v > 0.82) v = 0.82 + 0.18 * (1 - Math.exp(-(v - 0.82) / 0.18));
    ENC[i] = Math.round(Math.pow(v, 1 / 2.2) * 255);
  }
  R.enc = (v) => (v <= 0 ? 0 : v >= 2 ? 255 : ENC[(Math.sqrt(v * 0.5) * ENC_N) | 0]);

  /* ======================================================================
     2. Petits outils : canvas, tampons, bruit en tuiles, masques dessinés
     ====================================================================== */
  const DANS_WORKER = typeof document === 'undefined';
  R.canvas = function (w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (DANS_WORKER) return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };

  /* ---------- bruit : tuiles périodiques 256×256 (gradient de Perlin, octaves) ----------
     Les tuiles sont partagées (quelques variantes) ; chaque objet s'y promène avec un décalage
     tiré de sa graine (R.ofs) : aucun recalcul par graine. */
  const TN = 256, TM = 255;
  const TUILES = new Map();
  R.tuile = (variante, per, oct, gain) => R.finir(R.tuileG(variante, per, oct, gain));
  R.tuileG = function* (variante, per = 8, oct = 1, gain = 0.5) {
    const seed = 1013 + (variante & 15) * 7919;
    const key = seed + ':' + per + ':' + oct + ':' + gain;
    let T = TUILES.get(key);
    if (T) return T;
    T = new Float32Array(TN * TN);
    let amp = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      const p = Math.min(TN, per << o);
      const rr = R.rng((Math.imul(seed | 0, 7919) + o * 104729 + 17) >>> 0);
      const gx = new Float32Array(p * p), gy = new Float32Array(p * p);
      for (let i = 0; i < p * p; i++) {
        const a = rr() * TAU;
        gx[i] = Math.cos(a);
        gy[i] = Math.sin(a);
      }
      const cell = TN / p;
      for (let y = 0; y < TN; y++) {
        const fy = y / cell, iy = Math.floor(fy), ty = fy - iy, iy1 = (iy + 1) % p;
        const sy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
        for (let x = 0; x < TN; x++) {
          const fx = x / cell, ix = Math.floor(fx), tx = fx - ix, ix1 = (ix + 1) % p;
          const sx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
          const a0 = iy * p + ix, a1 = iy * p + ix1, b0 = iy1 * p + ix, b1 = iy1 * p + ix1;
          const n00 = gx[a0] * tx + gy[a0] * ty;
          const n10 = gx[a1] * (tx - 1) + gy[a1] * ty;
          const n01 = gx[b0] * tx + gy[b0] * (ty - 1);
          const n11 = gx[b1] * (tx - 1) + gy[b1] * (ty - 1);
          const u = n00 + sx * (n10 - n00), v = n01 + sx * (n11 - n01);
          T[y * TN + x] += amp * (u + sy * (v - u)) * 1.45;
        }
        if ((y & 63) === 63) yield;
      }
      norm += amp;
      amp *= gain;
    }
    for (let i = 0; i < T.length; i++) T[i] /= norm;
    TUILES.set(key, T);
    return T;
  };
  /** échantillon bilinéaire d'une tuile (coordonnées en texels, répétition) → ≈ [-1, 1] */
  R.tx = function (T, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = xi & TM, y0 = (yi & TM) << 8, x1 = (x0 + 1) & TM, y1 = ((yi + 1) & TM) << 8;
    const a = T[y0 | x0], b = T[y0 | x1], c = T[y1 | x0], d = T[y1 | x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  /** décalage (texels) propre à une graine et à un usage */
  R.ofs = (seed, k) => [hash2(seed, k, 1) * 256, hash2(seed, k, 2) * 256];

  /* ---------- cellules (Worley) : tuile périodique → distance au germe le plus proche et identité ---------- */
  const CELLS = new Map();
  R.cellules = (variante, per) => R.finir(R.cellulesG(variante, per));
  R.cellulesG = function* (variante, per = 32) {
    const key = variante + ':' + per;
    let C = CELLS.get(key);
    if (C) return C;
    const rr = R.rng(0x51f15e + variante * 977);
    const gx = new Float32Array(per * per), gy = new Float32Array(per * per);
    for (let i = 0; i < per * per; i++) { gx[i] = rr(); gy[i] = rr(); }
    const F1 = new Float32Array(TN * TN), F2 = new Float32Array(TN * TN), ID = new Float32Array(TN * TN);
    const cs = TN / per;
    for (let y = 0; y < TN; y++) {
      for (let x = 0; x < TN; x++) {
        const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
        let d1 = 9, d2 = 9, id = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const qx = (cx + ox + per) % per, qy = (cy + oy + per) % per, q = qy * per + qx;
            const px = (cx + ox + gx[q]) * cs, py = (cy + oy + gy[q]) * cs;
            const dx = (x + 0.5 - px) / cs, dy = (y + 0.5 - py) / cs, dd = dx * dx + dy * dy;
            if (dd < d1) { d2 = d1; d1 = dd; id = q; } else if (dd < d2) d2 = dd;
          }
        }
        const i = y * TN + x;
        F1[i] = Math.sqrt(d1);
        F2[i] = Math.sqrt(d2);
        ID[i] = hash2(id, variante, 7);
      }
      if ((y & 31) === 31) yield;
    }
    C = { F1, F2, ID, per };
    CELLS.set(key, C);
    return C;
  };
  /** l'identité de la cellule (plus proche texel, sans interpolation) */
  R.txN = (T, x, y) => T[((Math.floor(y) & TM) << 8) | (Math.floor(x) & TM)];

  /** Détail périodique visible ? (période en mm) → 0 (plus fin que 1,6 px : moiré, on l'efface) … 1 */
  R.lod = (periode, ppm) => clamp01((periode * ppm - 1.7) / 1.8);
  /** Couverture d'un trait de largeur l (mm) dont le centre est à la distance d (mm) du pixel (filtre boîte) */
  R.trait = function (d, l, p) {
    if (d < 0) d = -d;
    const hi = Math.min(d + p * 0.5, l * 0.5), lo = Math.max(d - p * 0.5, -l * 0.5);
    return hi > lo ? (hi - lo) / p : 0;
  };

  /* ---------- l'échauffement : le premier canvas « lisible » et le premier texte coûtent cher (une fois) ----------
     On le fait dans une tranche à part, avant tout le reste. */
  let chaud = false;
  R.echauffer = function (polices) {
    if (chaud) return;
    chaud = true;
    try {
      const c = R.canvas(8, 8), g = c.getContext('2d', { willReadFrequently: true });
      g.fillRect(0, 0, 2, 2);
      for (const f of polices || []) { g.font = f; g.fillText('0', 1, 6); }
      g.getImageData(0, 0, 8, 8);
    } catch (e) { /* rien */ }
  };

  /* ---------- masques dessinés au Canvas 2D (repère en mm) ---------- */
  /**
   * Un masque (couverture 0..1) dessiné en mm dans la boîte [x0, y0, x1, y1] à `res` px/mm.
   * dessin(g) dessine en blanc (repère : mm, origine = celle de l'objet). → { get(x, y), data, w, h, res }
   */
  R.masqueG = function* (box, res, dessin, canal = 3, octets = false) {
    const [x0, y0, x1, y1] = box;
    const w = Math.max(2, Math.ceil((x1 - x0) * res)), h = Math.max(2, Math.ceil((y1 - y0) * res));
    const c = R.canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    dessin(g);
    yield 'masque:lecture';
    // (octets : un octet par pixel au lieu d'un flottant — les grands calques, quatre fois moins de mémoire)
    const data = octets ? new Uint8Array(w * h) : new Float32Array(w * h);
    const kd = octets ? 1 : 1 / 255;
    const bande = Math.max(1, Math.floor(160000 / w));
    for (let j = 0; j < h; j += bande) {
      const hb = Math.min(bande, h - j);
      const d = g.getImageData(0, j, w, hb).data;
      const o = j * w;
      for (let i = 0, n = w * hb; i < n; i++) data[o + i] = d[i * 4 + canal] * kd;
      yield;
    }
    return grille(data, w, h, x0, y0, res, 0, octets ? 1 / 255 : 1);
  };
  R.masque = (box, res, dessin, canal) => R.finir(R.masqueG(box, res, dessin, canal));

  /**
   * Un calque en couleur (RVBA) dessiné en mm dans la boîte, à `res` px/mm : taches, écritures, peinture…
   * → { lire(x, y) } qui remplit R.PX = [r, v, b, a] (r, v, b : sRGB 0..1, a : 0..1 ; bilinéaire pondéré par a)
   */
  R.PX = [0, 0, 0, 0];
  R.imageG = function* (box, res, dessin) {
    const [x0, y0, x1, y1] = box;
    const w = Math.max(2, Math.ceil((x1 - x0) * res)), h = Math.max(2, Math.ceil((y1 - y0) * res));
    const c = R.canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const it = dessin(g);
    if (it && typeof it.next === 'function') yield* it; // un dessin peut se découper lui-même
    yield 'image:lecture';
    const d = new Uint8ClampedArray(w * h * 4);
    const bande = Math.max(1, Math.floor(120000 / w));
    for (let j = 0; j < h; j += bande) {
      const hb = Math.min(bande, h - j);
      d.set(g.getImageData(0, j, w, hb).data, j * w * 4);
      yield;
    }
    const W1 = w - 1, H1 = h - 1, P = R.PX;
    return {
      w, h, x0, y0, res, d,
      lire(x, y) {
        const fx = (x - x0) * res - 0.5, fy = (y - y0) * res - 0.5;
        if (fx < 0 || fy < 0 || fx >= W1 || fy >= H1) { P[3] = 0; return P; }
        const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
        const i00 = (iy * w + ix) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
        const a00 = d[i00 + 3] * (1 - tx) * (1 - ty), a10 = d[i10 + 3] * tx * (1 - ty), a01 = d[i01 + 3] * (1 - tx) * ty, a11 = d[i11 + 3] * tx * ty;
        const a = a00 + a10 + a01 + a11;
        if (a < 0.5) { P[3] = 0; return P; }
        const ia = 1 / (a * 255);
        P[0] = (d[i00] * a00 + d[i10] * a10 + d[i01] * a01 + d[i11] * a11) * ia;
        P[1] = (d[i00 + 1] * a00 + d[i10 + 1] * a10 + d[i01 + 1] * a01 + d[i11 + 1] * a11) * ia;
        P[2] = (d[i00 + 2] * a00 + d[i10 + 2] * a10 + d[i01 + 2] * a01 + d[i11 + 2] * a11) * ia;
        P[3] = a / 255;
        return P;
      },
    };
  };
  /* une grille échantillonnable en mm (bilinéaire) ; hors de la grille : `dehors` */
  function grille(data, w, h, x0, y0, res, dehors, echelle = 1) {
    const W1 = w - 1, H1 = h - 1;
    return {
      data, w, h, x0, y0, res,
      get(x, y) {
        const fx = (x - x0) * res - 0.5, fy = (y - y0) * res - 0.5;
        if (fx < 0 || fy < 0 || fx >= W1 || fy >= H1) {
          if (dehors !== undefined && dehors !== null && typeof dehors === 'number' && dehors !== 0) {
            // pour les champs de distance : on prolonge au-delà du bord (distance à la grille + valeur du bord)
            const cx = fx < 0 ? 0 : fx > W1 ? W1 : fx, cy = fy < 0 ? 0 : fy > H1 ? H1 : fy;
            const v = data[(cy | 0) * w + (cx | 0)];
            return v + Math.hypot(fx - cx, fy - cy) / res;
          }
          return 0;
        }
        const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * w + ix;
        const a = data[i], b = data[i + 1], c = data[i + w], d = data[i + w + 1];
        return (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * echelle;
      },
    };
  }
  R.grille = grille;

  /* ---------- champ de distance signée (mm) d'une forme dessinée : transformée de distance exacte ---------- */
  const INF = 1e20;
  function edt1(f, n, d, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
    }
  }
  /* distance euclidienne au carré aux pixels « sources » (générateur : une tranche par colonne/ligne) */
  function* edt2(src, w, h, out) {
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = src[y * w + x] ? 0 : INF;
      edt1(f, h, d, v, z);
      for (let y = 0; y < h; y++) out[y * w + x] = d[y];
      if ((x & 31) === 31) yield;
    }
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 0; x < w; x++) f[x] = out[r + x];
      edt1(f, w, d, v, z);
      for (let x = 0; x < w; x++) out[r + x] = d[x];
      if ((y & 31) === 31) yield;
    }
  }
  /**
   * Champ de distance signée (mm, < 0 dedans) d'une forme dessinée en blanc (voir R.masque).
   * Générateur : const F = yield* R.champ(box, res, dessin) ; F.get(x, y) → mm ; F.cov : le masque.
   */
  R.champ = function* (box, res, dessin) {
    yield 'champ:dessin';
    const M = yield* R.masqueG(box, res, dessin);
    yield 'champ:edt';
    yield;
    const w = M.w, h = M.h, n = w * h, cov = M.data;
    const dedans = new Uint8Array(n), dehors = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      dedans[i] = cov[i] >= 0.5 ? 1 : 0;
      dehors[i] = 1 - dedans[i];
    }
    const dOut = new Float32Array(n), dIn = new Float32Array(n);
    yield* edt2(dedans, w, h, dOut);
    yield* edt2(dehors, w, h, dIn);
    const sd = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = cov[i];
      let v;
      if (c > 0.02 && c < 0.98) v = 0.5 - c;
      else v = dedans[i] ? -(Math.sqrt(dIn[i]) - 0.5) : Math.sqrt(dOut[i]) - 0.5;
      sd[i] = v / res;
    }
    const G = grille(sd, w, h, box[0], box[1], res, 1);
    G.cov = M;
    return G;
  };

  /* ======================================================================
     3. Géométrie 2D (mm) : distances signées des formes simples
     ====================================================================== */
  const geo = (R.geo = {
    /** segment : distance ; geo.t reçoit l'abscisse relative (0..1) */
    t: 0,
    seg(px, py, ax, ay, bx, by) {
      const ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
      const l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? (wx * ex + wy * ey) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      geo.t = t;
      const dx = wx - ex * t, dy = wy - ey * t;
      return Math.sqrt(dx * dx + dy * dy);
    },
    /** boîte centrée (demi-côtés hx, hy), coins arrondis r */
    boite(px, py, hx, hy, r = 0) {
      const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
      return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
    },
    /** ellipse centrée (demi-axes a, b) : approximation au premier ordre, bonne près du bord */
    ellipse(px, py, a, b) {
      const k0 = Math.hypot(px / a, py / b);
      if (k0 < 1e-6) return -Math.min(a, b);
      const k1 = Math.hypot(px / (a * a), py / (b * b));
      return (k0 * (k0 - 1)) / k1;
    },
    /** polygone (tableau plat [x0, y0, x1, y1, …]) : distance exacte */
    poly(px, py, P) {
      const n = P.length >> 1;
      let d = (px - P[0]) * (px - P[0]) + (py - P[1]) * (py - P[1]), s = 1;
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const xi = P[2 * i], yi = P[2 * i + 1], xj = P[2 * j], yj = P[2 * j + 1];
        const ex = xj - xi, ey = yj - yi, wx = px - xi, wy = py - yi;
        let t = (wx * ex + wy * ey) / (ex * ex + ey * ey || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const bx = wx - ex * t, by = wy - ey * t, dd = bx * bx + by * by;
        if (dd < d) d = dd;
        const c1 = py >= yi, c2 = py < yj, c3 = ex * wy > ey * wx;
        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * Math.sqrt(d);
    },
    /** union adoucie (k en mm) */
    smin(a, b, k) {
      const h = clamp01(0.5 + (0.5 * (b - a)) / k);
      return lerp(b, a, h) - k * h * (1 - h);
    },
  });
  /** bord arrondi d'une plaque d'épaisseur h (mm) : quart de cercle de rayon r ≤ h */
  R.bord = function (e, r, h) {
    if (e >= r) return h;
    if (e <= 0) return h - r;
    const u = 1 - e / r;
    return h - r + r * Math.sqrt(1 - u * u);
  };

  /** Catmull-Rom (fermée ou non) échantillonnée : points [[x, y], …] → tableau plat */
  R.spline = function (pts, n = 8, ferme = true) {
    const out = [];
    const N = pts.length;
    const P = (i) => (ferme ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))]);
    const seg = ferme ? N : N - 1;
    for (let i = 0; i < seg; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        for (let c = 0; c < 2; c++) {
          out.push(0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
        }
      }
    }
    if (!ferme) out.push(pts[N - 1][0], pts[N - 1][1]);
    return out;
  };

  /* ======================================================================
     4. Les matières
     Albédo en sRGB (converti en linéaire), rugosité, métal, réflectance, voile, reflets.
     ====================================================================== */
  function matiere(hex, o = {}) {
    const c = R.lin(hex);
    return { hex, r: c[0], g: c[1], b: c[2], ro: o.ro != null ? o.ro : 0.5, me: o.me || 0, f0: o.f0 || 0.04, sh: o.sh || 0, ev: o.ev == null ? 1 : o.ev };
  }
  R.matiere = matiere;
  R.MAT = {
    acierBrosse: matiere('#b8b5ae', { ro: 0.34, me: 1 }),
    acierPoli: matiere('#cfccc6', { ro: 0.13, me: 1 }),
    acierNoir: matiere('#625d58', { ro: 0.36, me: 1 }), // forgé, bruni
    chrome: matiere('#e2e1dd', { ro: 0.045, me: 1 }),
    laiton: matiere('#e3c077', { ro: 0.22, me: 1 }),
    laitonTerni: matiere('#a98a4c', { ro: 0.45, me: 1 }),
    boisVerni: matiere('#c49660', { ro: 0.26, f0: 0.05 }),
    boisBrut: matiere('#b89a74', { ro: 0.75, f0: 0.03 }),
    caoutchouc: matiere('#1e1d1c', { ro: 0.72, f0: 0.035 }),
    plastiqueBlanc: matiere('#e9e6de', { ro: 0.38, f0: 0.045 }),
    plastiqueBleu: matiere('#1d5bc0', { ro: 0.2, f0: 0.05 }),
    plastiqueOrange: matiere('#f27a1a', { ro: 0.26, f0: 0.05 }),
    plastiqueNoir: matiere('#1b1b1c', { ro: 0.36, f0: 0.045 }),
    plastiqueRouge: matiere('#c82a1f', { ro: 0.3, f0: 0.045 }),
    cuirTanne: matiere('#c08a64', { ro: 0.62, f0: 0.035 }),
    cuirNoir: matiere('#191614', { ro: 0.26, f0: 0.045 }),
    cuirBrun: matiere('#6a3a1f', { ro: 0.28, f0: 0.045 }),
    cuirBlanc: matiere('#efede7', { ro: 0.42, f0: 0.04 }),
    daim: matiere('#8b6a4c', { ro: 0.92, f0: 0.02, sh: 0.5 }),
    papier: matiere('#f0ead9', { ro: 0.82, f0: 0.03 }),
    carton: matiere('#b89a70', { ro: 0.85, f0: 0.03 }),
    filCire: matiere('#cdb68a', { ro: 0.42, f0: 0.045 }),
    tissu: matiere('#d9d3c6', { ro: 0.95, f0: 0.02, sh: 0.35 }),
    gommeBlanche: matiere('#efeee7', { ro: 0.55, f0: 0.035 }),
    crin: matiere('#2c241e', { ro: 0.5, f0: 0.04 }),
  };
  /** Applique une matière à l'ardoise ; k : variation d'albédo (×), dr : variation de rugosité (+) */
  R.mat = function (S, m, k = 1, dr = 0) {
    S.r = m.r * k;
    S.g = m.g * k;
    S.b = m.b * k;
    S.ro = m.ro + dr;
    S.me = m.me;
    S.f0 = m.f0;
    S.sh = m.sh;
    S.ev = m.ev;
  };
  /** Mélange l'albédo de l'ardoise vers une couleur linéaire c (t : 0..1) */
  R.teinte = function (S, c, t) {
    if (!(t > 0)) return;
    if (t > 1) t = 1;
    const r = c.r !== undefined ? c.r : c[0], g = c.g !== undefined ? c.g : c[1], b = c.b !== undefined ? c.b : c[2];
    S.r += (r - S.r) * t;
    S.g += (g - S.g) * t;
    S.b += (b - S.b) * t;
  };

  /* ======================================================================
     5. Relief : normales, flou, occlusion des creux, ombres propres
     ====================================================================== */
  /** normales (lignes j0..j1) ; k : pixels par mm ; pente plafonnée (arêtes franches sans aberration) */
  R.normales = function (Hf, w, h, k, N, j0 = 0, j1 = h, A = null) {
    const nx = N.nx, ny = N.ny, nz = N.nz;
    const P = 14, SEUIL = 0.4;
    for (let y = j0; y < j1; y++) {
      const y0 = y > 0 ? y - 1 : y, y1 = y < h - 1 ? y + 1 : y;
      const r0 = y0 * w, r1 = y1 * w, rw = y * w;
      for (let x = 0; x < w; x++) {
        let x0 = x > 0 ? x - 1 : x, x1 = x < w - 1 ? x + 1 : x;
        let ya = r0, yb = r1, dyn = y1 - y0;
        if (A && A[rw + x] >= SEUIL) {
          // un voisin hors de l'objet : différence d'un seul côté (le bord est modelé par le profil, pas par le sol)
          if (A[rw + x0] < SEUIL) x0 = x;
          if (A[rw + x1] < SEUIL) x1 = x;
          if (A[r0 + x] < SEUIL) { ya = rw; dyn = y1 - y; }
          if (A[r1 + x] < SEUIL) { yb = rw; dyn = (yb === rw ? y : y1) - (ya === rw ? y : y0); }
        }
        let dx = x1 !== x0 ? (Hf[rw + x1] - Hf[rw + x0]) * (k / (x1 - x0)) : 0;
        let dy = dyn ? (Hf[yb + x] - Hf[ya + x]) * (k / dyn) : 0;
        if (dx > P) dx = P; else if (dx < -P) dx = -P;
        if (dy > P) dy = P; else if (dy < -P) dy = -P;
        const il = 1 / Math.sqrt(dx * dx + dy * dy + 1);
        const i = rw + x;
        nx[i] = -dx * il;
        ny[i] = -dy * il;
        nz[i] = il;
      }
    }
  };

  /* flou gaussien approché (trois boîtes), en place ; R.flouG : le même en générateur (une tranche par passe) */
  R.flouG = function* (a, w, h, sigma) {
    if (sigma < 0.35) return a;
    const wI = Math.sqrt((12 * sigma * sigma) / 3 + 1);
    let wl = Math.floor(wI);
    if (wl % 2 === 0) wl--;
    const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    const t = new Float32Array(a.length);
    for (let p = 0; p < 3; p++) {
      const r = Math.max(0, Math.round(((p < m ? wl : wl + 2) - 1) / 2));
      if (!r) continue;
      boite(a, t, w, h, r, 1, w);
      if (a.length > 150000) yield;
      boite(t, a, h, w, r, w, 1);
      if (a.length > 150000) yield;
    }
    return a;
  };
  R.flou = (a, w, h, sigma) => R.finir(R.flouG(a, w, h, sigma));
  // une passe de boîte le long des lignes (pas = 1, saut = w) ou des colonnes (pas = w, saut = 1)
  function boite(src, dst, n1, n2, r, pas, saut) {
    const iv = 1 / (r + r + 1);
    for (let l = 0; l < n2; l++) {
      const o = l * saut;
      const first = src[o], last = src[o + (n1 - 1) * pas];
      let acc = (r + 1) * first;
      for (let p = 1; p <= r; p++) acc += p < n1 ? src[o + p * pas] : last;
      for (let x = 0; x < n1; x++) {
        dst[o + x * pas] = acc * iv;
        const pa = x + r + 1, pr = x - r;
        acc += (pa < n1 ? src[o + pa * pas] : last) - (pr > 0 ? src[o + pr * pas] : first);
      }
    }
  }

  /** Occlusion des creux : plus sombre là où les alentours sont plus hauts (r : rayon mm, force : par mm de creux) */
  R.caviteG = function* (Hf, w, h, k, r = 1.5, force = 0.3) {
    const b = Float32Array.from(Hf);
    yield* R.flouG(b, w, h, r * k);
    const ao = new Float32Array(w * h);
    for (let i = 0, n = w * h; i < n; i++) {
      const c = b[i] - Hf[i];
      ao[i] = c > 0 ? Math.max(0, 1 - c * force) : 1;
    }
    return ao;
  };
  R.cavite = (Hf, w, h, k, r, force) => R.finir(R.caviteG(Hf, w, h, k, r, force));

  /**
   * Ombres propres : ce que les bosses cachent de la lumière (balayage ligne à ligne depuis la lumière,
   * O(w·h)). doux : pénombre, en mm de relief caché. → Float32Array 0..1 (1 = au soleil)
   */
  R.soleilG = function* (Hf, w, h, k, doux = 1) {
    const lxy = Math.hypot(L[0], L[1]) || 1e-6;
    const dx = L[0] / lxy, dy = L[1] / lxy, rise = L[2] / lxy;
    const out = new Float32Array(w * h).fill(1);
    if (w * h > 200000) yield;
    const S = new Float32Array(w * h);
    if (w * h > 200000) yield;
    const byRows = Math.abs(dy) >= Math.abs(dx);
    const n1 = byRows ? h : w, n2 = byRows ? w : h;
    const t = 1 / Math.abs(byRows ? dy : dx);
    const off = (byRows ? dx : dy) * t;
    const drop = (t / k) * rise;
    const sgn = (byRows ? dy : dx) < 0 ? -1 : 1;
    const inv = doux > 0 ? 1 / doux : 1e6;
    for (let s = 0; s < n1; s++) {
      const a = sgn < 0 ? s : n1 - 1 - s, up = a + sgn;
      for (let b = 0; b < n2; b++) {
        const i = byRows ? a * w + b : b * w + a, hv = Hf[i];
        let c = hv;
        if (s > 0) {
          const p = b + off, p0 = Math.floor(p), f = p - p0;
          if (p0 >= 0 && p0 + 1 < n2) {
            const iu0 = byRows ? up * w + p0 : p0 * w + up, iu1 = byRows ? iu0 + 1 : iu0 + w;
            const u = S[iu0] * (1 - f) + S[iu1] * f - drop;
            if (u > c) c = u;
          }
        }
        S[i] = c;
        if (c > hv) {
          const x = Math.min(1, (c - hv) * inv);
          out[i] = 1 - x * x * (3 - 2 * x);
        }
      }
      if ((s & 31) === 31 && n1 * n2 > 120000) yield;
    }
    return out;
  };
  R.soleil = (Hf, w, h, k, doux) => R.finir(R.soleilG(Hf, w, h, k, doux));

  /* ======================================================================
     6. La lumière : diffus enveloppant, ambiance, reflets de l'atelier (Fresnel de Schlick)
     ====================================================================== */
  /* le rayonnement de l'environnement vu dans la direction (rx, ry, rz) (unitaire), pour une rugosité donnée
     → EV0, EV1, EV2 (linéaire). vis : la part de lumière directe qui arrive là (ombres propres). */
  let EV0 = 0, EV1 = 0, EV2 = 0, SOL0 = 0, SOL1 = 0, SOL2 = 0;
  function envAt(rx, ry, rz, rough, vis) {
    const E = ENV, LW = R.LUM;
    let e0, e1, e2;
    if (rz >= 0) {
      const t = rz * rz * (3 - 2 * rz);
      e0 = E.MUR[0] + (E.PLAF[0] - E.MUR[0]) * t;
      e1 = E.MUR[1] + (E.PLAF[1] - E.MUR[1]) * t;
      e2 = E.MUR[2] + (E.PLAF[2] - E.MUR[2]) * t;
      // le côté de la vitrine : plafond et murs éclairés par la lampe
      let c = (rx * E.lx + ry * E.ly + 0.3) / 1.3;
      c = c <= 0 ? 0 : c >= 1 ? 1 : c * c * (3 - 2 * c);
      c *= E.CLAIR * (1 - rz * 0.45);
      e0 += c * LW[0]; e1 += c * LW[1]; e2 += c * LW[2];
    } else {
      const t = rz < -0.2 ? 1 : -rz * 5;
      e0 = E.MUR[0] + (SOL0 - E.MUR[0]) * t;
      e1 = E.MUR[1] + (SOL1 - E.MUR[1]) * t;
      e2 = E.MUR[2] + (SOL2 - E.MUR[2]) * t;
    }
    const dd = rx * L[0] + ry * L[1] + rz * L[2];
    if (dd > 0) {
      const h2 = dd * dd, g = E.HALO * h2 * h2 * (0.55 + 0.7 * rough);
      e0 += g * LW[0]; e1 += g * LW[1]; e2 += g * LW[2];
      if (dd > 0.25) {
        const idd = 1 / dd;
        const u = (rx * E.ux + ry * E.uy) * idd;
        const v = (rx * E.vx + ry * E.vy + rz * E.vz) * idd;
        const e = 0.012 + rough * 0.55, ie = 0.5 / e;
        const au = u < 0 ? -u : u;
        if (au < E.U + e && v > E.V0 - e && v < E.V1 + e) {
          let t1 = (E.U - au + e) * ie; t1 = t1 >= 1 ? 1 : t1 * t1 * (3 - 2 * t1);
          let t2 = (v - E.V0 + e) * ie; t2 = t2 >= 1 ? 1 : t2 <= 0 ? 0 : t2 * t2 * (3 - 2 * t2);
          let t3 = (E.V1 - v + e) * ie; t3 = t3 >= 1 ? 1 : t3 <= 0 ? 0 : t3 * t3 * (3 - 2 * t3);
          let m = t1 * t2 * t3;
          if (m > 0) {
            if (rough < 0.35) {
              const eb = e * 0.7, ib = 0.5 / eb;
              let bu = (au - E.BAR + eb) * ib; bu = bu <= 0 ? 1 : bu >= 1 ? 0 : 1 - bu * bu * (3 - 2 * bu);
              const dv0 = v - E.TRAV, dv = dv0 < 0 ? -dv0 : dv0;
              let bv = (dv - E.BAR + eb) * ib; bv = bv <= 0 ? 1 : bv >= 1 ? 0 : 1 - bv * bv * (3 - 2 * bv);
              m *= 1 - (1 - rough * 2.8) * 0.85 * (bu > bv ? bu : bv);
            }
            let sk = (v - E.V0) / (E.V1 * 0.8 - E.V0);
            sk = sk <= 0 ? 0 : sk >= 1 ? 1 : sk * sk * (3 - 2 * sk);
            const Lw = m * (E.BAS + (E.HAUT - E.BAS) * sk) * (1 - 0.75 * (rough > 1 ? 1 : rough)) * (0.25 + 0.75 * vis);
            e0 += Lw * LW[0]; e1 += Lw * LW[1]; e2 += Lw * LW[2];
          }
        }
      }
    }
    // le néon du plafond : un trait lumineux (flou et plus terne sur les matières rugueuses)
    if (rz > 0.35 && rough < 0.6) {
      const iz = 1 / rz, ax = rx * iz, ay = ry * iz;
      const w = E.NW + rough * 0.42;
      const dy = ay - E.NY, ady = dy < 0 ? -dy : dy;
      const aax = ax < 0 ? -ax : ax;
      if (ady < w && aax < E.NX + w) {
        let m = 1 - ady / w;
        m = m * m * (3 - 2 * m);
        let f = (E.NX + w - aax) / (2 * w);
        f = f >= 1 ? 1 : f * f * (3 - 2 * f);
        const I = E.NEON * (E.NW / w) * m * f * (1 - rough * 1.2 > 0 ? 1 - rough * 1.2 : 0.05);
        e0 += I * E.NEONC[0]; e1 += I * E.NEONC[1]; e2 += I * E.NEONC[2];
      }
    }
    EV0 = e0; EV1 = e1; EV2 = e2;
  }
  /* pour les matières rugueuses (ro ≥ 0,45), l'environnement est flou : table 40 × 40 par rugosité, interpolée */
  const TENV = new Map(), TN_ = 40;
  function tableEnv(rq) {
    const cle = rq + '|' + SOL0.toFixed(4) + ',' + SOL1.toFixed(4) + ',' + SOL2.toFixed(4); // (l'établi reflété dépend du sol)
    let t = TENV.get(cle);
    if (t) return t;
    t = new Float32Array(TN_ * TN_ * 3 * 2); // [haut | bas] × (rx, ry)
    for (let h = 0; h < 2; h++) {
      for (let j = 0; j < TN_; j++) for (let i = 0; i < TN_; i++) {
        let rx = (i / (TN_ - 1)) * 2 - 1, ry = (j / (TN_ - 1)) * 2 - 1;
        const l2 = rx * rx + ry * ry;
        if (l2 > 1) { const l = Math.sqrt(l2); rx /= l; ry /= l; }
        const rz = Math.sqrt(Math.max(0, 1 - rx * rx - ry * ry)) * (h ? -1 : 1);
        envAt(rx, ry, rz, rq, 1);
        const q = ((h * TN_ + j) * TN_ + i) * 3;
        t[q] = EV0; t[q + 1] = EV1; t[q + 2] = EV2;
      }
    }
    if (TENV.size > 24) TENV.delete(TENV.keys().next().value);
    TENV.set(cle, t);
    return t;
  }
  /** prépare les tables des reflets rugueux pour un sol donné, une par tranche (générateur) */
  R.tablesEnv = function* (sol) {
    const s0 = sol || ENV.SOL;
    for (const rq of [0.45, 0.6, 0.75, 0.9]) {
      SOL0 = s0[0]; SOL1 = s0[1]; SOL2 = s0[2];
      tableEnv(rq);
      yield;
    }
  };
  function envTable(t, rx, ry, rz) {
    const fx = (rx + 1) * 0.5 * (TN_ - 1), fy = (ry + 1) * 0.5 * (TN_ - 1);
    let ix = fx | 0, iy = fy | 0;
    if (ix > TN_ - 2) ix = TN_ - 2; if (iy > TN_ - 2) iy = TN_ - 2;
    if (ix < 0) ix = 0; if (iy < 0) iy = 0;
    const tx = fx - ix, ty = fy - iy, o = rz < 0 ? TN_ * TN_ * 3 : 0;
    const a = o + (iy * TN_ + ix) * 3, b = a + 3, c = a + TN_ * 3, d = c + 3;
    const w0 = (1 - tx) * (1 - ty), w1 = tx * (1 - ty), w2 = (1 - tx) * ty, w3 = tx * ty;
    EV0 = t[a] * w0 + t[b] * w1 + t[c] * w2 + t[d] * w3;
    EV1 = t[a + 1] * w0 + t[b + 1] * w1 + t[c + 1] * w2 + t[d + 1] * w3;
    EV2 = t[a + 2] * w0 + t[b + 2] * w1 + t[c + 2] * w2 + t[d + 2] * w3;
  }
  R.envAt = function (rx, ry, rz, rough) {
    const s = ENV.SOL;
    SOL0 = s[0]; SOL1 = s[1]; SOL2 = s[2];
    envAt(rx, ry, rz, rough, 1);
    return [EV0, EV1, EV2];
  };

  /**
   * Éclaire les lignes j0..j1 d'une zone w × h. o : { w, h, img (ImageData), alb (×3), alpha, nx, ny, nz,
   *   ro, me, f0, ao, sh, ev, an (brossage : inclinaison des micro-facettes), gx, gy (sens du brossage),
   *   vis (ombres propres), sol ([r, g, b] linéaire : ce qui est sous l'horizon), wrap,
   *   lumiere (facultatif : Float32Array w*h, un facteur local de la lumière directe) }
   */
  R.eclairer = function (o, j0, j1) {
    const w = o.w, dat = o.img.data, base = (o.decal || 0) * w * 4;
    const alb = o.alb, A = o.alpha, NX = o.nx, NY = o.ny, NZ = o.nz;
    const RO = o.ro, ME = o.me, F0 = o.f0, AO = o.ao, SH = o.sh, EV = o.ev, VIS = o.vis, LUMI = o.lumiere || null;
    const AN = o.an || null, GX = o.gx || null, GY = o.gy || null;
    const wrap = o.wrap != null ? o.wrap : 0.3, iw = 1 / (1 + wrap);
    // l'appareil est à D mm au-dessus du point (ox, oy) : chaque pixel le voit sous un angle un peu différent
    const OE = o.oeil || null, D = OE ? OE.D || R.OEIL : 1, ipp = OE ? 1 / OE.ppm : 0;
    const sol = o.sol || ENV.SOL;
    SOL0 = sol[0]; SOL1 = sol[1]; SOL2 = sol[2];
    const TR = [tableEnv(0.45), tableEnv(0.6), tableEnv(0.75), tableEnv(0.9)];
    const L0 = L[0], L1 = L[1], L2 = L[2];
    const X = R.EXPO * (o.expo || 1);
    const k0 = R.LUM[0] * X, k1 = R.LUM[1] * X, k2 = R.LUM[2] * X;
    const a0 = R.AMB[0] * X, a1 = R.AMB[1] * X, a2 = R.AMB[2] * X;
    let vx = 0, vy = 0, vz = 1;
    for (let i = j0 * w, n = j1 * w; i < n; i++) {
      const a = A ? A[i] : 1;
      if (a <= 0.002) continue;
      const nx = NX[i], ny = NY[i], nz = NZ[i];
      if (OE) {
        const jj = (i / w) | 0, ii = i - jj * w;
        vx = -(OE.x0 + (ii + 0.5) * ipp) / D;
        vy = -(OE.y0 + (jj + 0.5) * ipp) / D;
        const il = 1 / Math.sqrt(vx * vx + vy * vy + 1);
        vx *= il; vy *= il; vz = il;
      }
      let dif = (nx * L0 + ny * L1 + nz * L2 + wrap) * iw;
      if (dif < 0) dif = 0;
      const vi = VIS ? VIS[i] : 1;
      dif *= vi;
      if (LUMI) dif *= LUMI[i];
      const oc = AO[i];
      const rough = RO[i];
      // le reflet : direction miroir de l'œil (au zénith) ; brossé : plusieurs micro-facettes
      let e0, e1, e2;
      const an = AN ? AN[i] : 0;
      if (an > 0.001) {
        const bx = -GY[i], by = GX[i];
        e0 = 0; e1 = 0; e2 = 0;
        for (let s = 0; s < 4; s++) {
          const kk = ((s - 1.5) / 1.5) * an;
          let mx = nx + bx * kk, my = ny + by * kk, mz = nz;
          const il = 1 / Math.sqrt(mx * mx + my * my + mz * mz);
          mx *= il; my *= il; mz *= il;
          const dv = mx * vx + my * vy + mz * vz;
          envAt(2 * dv * mx - vx, 2 * dv * my - vy, 2 * dv * mz - vz, rough, vi);
          e0 += EV0; e1 += EV1; e2 += EV2;
        }
        e0 *= 0.25; e1 *= 0.25; e2 *= 0.25;
      } else if (rough >= 0.45) {
        // matière rugueuse : la table (deux rugosités voisines), l'ombre propre atténue le reflet de la vitrine
        const dv = nx * vx + ny * vy + nz * vz;
        const rx = 2 * dv * nx - vx, ry = 2 * dv * ny - vy, rz = 2 * dv * nz - vz;
        const kv = 0.55 + 0.45 * vi;
        if (rough >= 0.6) { // très rugueux : l'environnement bouge à peine d'une rugosité à l'autre (une seule table)
          envTable(TR[rough < 0.8 ? 2 : 3], rx, ry, rz);
          e0 = EV0 * kv; e1 = EV1 * kv; e2 = EV2 * kv;
        } else {
          const u = (rough - 0.45) / 0.15, fu = u > 0.999 ? 0.999 : u;
          envTable(TR[0], rx, ry, rz);
          e0 = EV0; e1 = EV1; e2 = EV2;
          envTable(TR[1], rx, ry, rz);
          e0 = (e0 + (EV0 - e0) * fu) * kv; e1 = (e1 + (EV1 - e1) * fu) * kv; e2 = (e2 + (EV2 - e2) * fu) * kv;
        }
      } else {
        const dv = nx * vx + ny * vy + nz * vz;
        envAt(2 * dv * nx - vx, 2 * dv * ny - vy, 2 * dv * nz - vz, rough, vi);
        e0 = EV0; e1 = EV1; e2 = EV2;
      }
      const f0 = F0[i], met = ME[i];
      const ek = EV[i] * (0.2 + 0.8 * oc);
      const ndv = nx * vx + ny * vy + nz * vz;
      const c1 = ndv < 1 ? 1 - ndv : 0, r1 = 1 - rough;
      const c2 = c1 * c1, c5 = c2 * c2 * c1 * r1 * r1;
      const fs = f0 + (1 - f0) * c5;
      const dm = (1 - met) * (1 - fs);
      const kd = dif * oc, ka = 0.4 + 0.6 * oc;
      const j = i * 3, k = i * 4 - base;
      const al0 = alb[j], al1 = alb[j + 1], al2 = alb[j + 2];
      let v0 = al0 * dm * (kd * k0 + ka * a0) + (fs + (al0 + (1 - al0) * c5 - fs) * met) * e0 * ek;
      let v1 = al1 * dm * (kd * k1 + ka * a1) + (fs + (al1 + (1 - al1) * c5 - fs) * met) * e1 * ek;
      let v2 = al2 * dm * (kd * k2 + ka * a2) + (fs + (al2 + (1 - al2) * c5 - fs) * met) * e2 * ek;
      const sh = SH[i];
      if (sh > 0) { // voile des tissus et du daim : plus clair quand la surface se détourne
        const rim = sh * (c2 + 0.15) * (0.35 + 0.65 * oc);
        v0 += al0 * rim * (dif * k0 + a0) * 1.4;
        v1 += al1 * rim * (dif * k1 + a1) * 1.4;
        v2 += al2 * rim * (dif * k2 + a2) * 1.4;
      }
      dat[k] = v0 <= 0 ? 0 : v0 >= 2 ? 255 : ENC[(Math.sqrt(v0 * 0.5) * ENC_N) | 0];
      dat[k + 1] = v1 <= 0 ? 0 : v1 >= 2 ? 255 : ENC[(Math.sqrt(v1 * 0.5) * ENC_N) | 0];
      dat[k + 2] = v2 <= 0 ? 0 : v2 >= 2 ? 255 : ENC[(Math.sqrt(v2 * 0.5) * ENC_N) | 0];
      dat[k + 3] = a * 255 + 0.5;
    }
  };

  /* ======================================================================
     7. Peindre les couches, éclairer, ombrer : R.rendre (générateur)
     ====================================================================== */
  function ardoise() {
    return { d: 0, z: 0, r: 0, g: 0, b: 0, ro: 0.5, me: 0, f0: 0.04, ao: 1, sh: 0, ev: 1, an: 0, gx: 1, gy: 0, lim: 0, h0: 0, ppm: 1, x: 0, y: 0 };
  }

  /* mélange du pixel i avec ce que l'ardoise vient de peindre, couverture c (opérateur « par-dessus ») */
  function melange(B, i, S, c) {
    const A = B.A, a0 = A[i];
    if (c >= 1 || a0 <= 0) {
      A[i] = c >= 1 ? 1 : c;
      B.H[i] = S.z;
      const j = i * 3, alb = B.alb;
      alb[j] = S.r; alb[j + 1] = S.g; alb[j + 2] = S.b;
      B.ro[i] = S.ro; B.me[i] = S.me; B.f0[i] = S.f0; B.ao[i] = S.ao; B.sh[i] = S.sh; B.ev[i] = S.ev; B.an[i] = S.an;
      if (S.an > 0) { B.gx[i] = S.gx * B.ca - S.gy * B.sa; B.gy[i] = S.gx * B.sa + S.gy * B.ca; }
      return;
    }
    const wA = a0 * (1 - c), an = c + wA;
    const ks = c / an, kd = wA / an;
    A[i] = an;
    B.H[i] = S.z * ks + B.H[i] * kd;
    const j = i * 3, alb = B.alb;
    alb[j] = S.r * ks + alb[j] * kd;
    alb[j + 1] = S.g * ks + alb[j + 1] * kd;
    alb[j + 2] = S.b * ks + alb[j + 2] * kd;
    B.ro[i] = S.ro * ks + B.ro[i] * kd;
    B.me[i] = S.me * ks + B.me[i] * kd;
    B.f0[i] = S.f0 * ks + B.f0[i] * kd;
    B.ao[i] = S.ao * ks + B.ao[i] * kd;
    B.sh[i] = S.sh * ks + B.sh[i] * kd;
    B.ev[i] = S.ev * ks + B.ev[i] * kd;
    B.an[i] = S.an * ks + B.an[i] * kd;
    if (ks > 0.5 && S.an > 0) { // le sens du brossage, tourné dans le repère du monde
      B.gx[i] = S.gx * B.ca - S.gy * B.sa;
      B.gy[i] = S.gx * B.sa + S.gy * B.ca;
    }
  }

  /* une ligne d'une couche */
  function ligne(B, part, j, ia, ib) {
    const S = B.S, w = B.w, ppm = B.ppm, ip = 1 / ppm, ca = B.ca, sa = B.sa;
    const Y = B.by0 + (j + 0.5) * ip;
    const f = part.f, zt = !!part.z, H = B.H, A = B.A;
    for (let i = ia; i < ib; i++) {
      const X = B.bx0 + (i + 0.5) * ip;
      const x = X * ca + Y * sa, y = -X * sa + Y * ca;
      const id = j * w + i;
      S.d = 1e9;
      S.ao = 1;
      S.sh = 0;
      S.ev = 1;
      S.me = 0;
      S.f0 = 0.04;
      S.an = 0;
      S.h0 = A[id] > 0.5 ? H[id] : 0;
      f(x, y, S);
      let c = 0.5 - S.d * ppm;
      if (c <= 0) continue;
      if (c > 1) c = 1;
      if (zt && A[id] > 0.01 && S.z < H[id]) {
        // pièce plus basse que ce qui est déjà là : seulement au bord de ce qui la cache
        const vis = (1 - A[id]);
        if (vis <= 0.001) continue;
        c *= vis;
      }
      melange(B, id, S, c);
    }
  }

  /* la réserve de tampons : un jeu (hauteur, couverture, albédo, matière…) par rendu en cours ; rendu à la fin */
  const RESERVE = [];
  const NOMS = ['H', 'A', 'ro', 'me', 'f0', 'ao', 'sh', 'ev', 'an', 'gx', 'gy', 'nx', 'ny', 'nz'];
  const DEFAUT = { H: 0, A: 0, ro: 0.6, me: 0, f0: 0.04, ao: 1, sh: 0, ev: 1, an: 0, gx: 1, gy: 0, nx: 0, ny: 0, nz: 1 };
  function* prendre(n) {
    let k = -1;
    for (let i = 0; i < RESERVE.length; i++) {
      const c = RESERVE[i].cap;
      if (c >= n && c <= n * 4 && (k < 0 || c < RESERVE[k].cap)) k = i;
    }
    let jeu;
    const gros = n > 200000;
    if (k >= 0) jeu = RESERVE.splice(k, 1)[0];
    else {
      const cap = Math.ceil(n * 1.1);
      jeu = { cap, b: {} };
      for (const nm of NOMS) {
        jeu.b[nm] = new Float32Array(cap);
        if (gros) yield;
      }
      jeu.b.alb = new Float32Array(cap * 3);
      if (gros) yield;
    }
    const v = {};
    for (const nm of NOMS) {
      v[nm] = jeu.b[nm].subarray(0, n);
      if (nm !== 'nx' && nm !== 'ny' && nm !== 'nz') v[nm].fill(DEFAUT[nm]);
      if (gros) yield;
    }
    v.alb = jeu.b.alb.subarray(0, n * 3);
    v.alb.fill(0);
    jeu.v = v;
    return jeu;
  }
  function rendre_(jeu) {
    if (!jeu || jeu.rendu) return;
    jeu.rendu = true;
    delete jeu.v;
    RESERVE.push(jeu);
    RESERVE.sort((a, b) => b.cap - a.cap);
    while (RESERVE.length > 3) RESERVE.pop();
    jeu.rendu = false;
  }

  /* un tube (lacet, fil, anneau) : en deux passes — d'abord, pour chaque pixel, le point le plus proche de
     toute la polyligne (distance, abscisse, hauteur de l'axe) ; puis une seule peinture par pixel (un tube
     lisse, sans perles aux jointures) */
  function* tube(B, part) {
    const S = B.S, w = B.w, h = B.h, ppm = B.ppm, ip = 1 / ppm, ca = B.ca, sa = B.sa;
    const P = part.tube, n = P.length;
    if (n < 2) return;
    const rf = typeof part.r === 'function' ? part.r : null, r0 = rf ? 0 : part.r;
    const plat = part.plat || 0; // 0 : rond ; > 0 : section aplatie (lacet plat)
    const X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n), T = new Float32Array(n), RA = new Float32Array(n);
    let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity, rmax = 0;
    for (let k = 0; k < n; k++) {
      const p = P[k];
      X[k] = p[0] * ca - p[1] * sa;
      Y[k] = p[0] * sa + p[1] * ca;
      Z[k] = p[2] || 0;
      T[k] = k ? T[k - 1] + Math.hypot(X[k] - X[k - 1], Y[k] - Y[k - 1]) : 0;
    }
    for (let k = 0; k < n; k++) {
      RA[k] = rf ? rf(T[k]) : r0;
      if (RA[k] > rmax) rmax = RA[k];
      if (X[k] < mx0) mx0 = X[k]; if (X[k] > mx1) mx1 = X[k];
      if (Y[k] < my0) my0 = Y[k]; if (Y[k] > my1) my1 = Y[k];
    }
    const i0 = Math.max(0, Math.floor((mx0 - rmax - B.bx0) * ppm) - 1), i1 = Math.min(w, Math.ceil((mx1 + rmax - B.bx0) * ppm) + 2);
    const j0 = Math.max(0, Math.floor((my0 - rmax - B.by0) * ppm) - 1), j1 = Math.min(h, Math.ceil((my1 + rmax - B.by0) * ppm) + 2);
    const tw = i1 - i0, th = j1 - j0;
    if (tw <= 0 || th <= 0) return;
    const tn = tw * th;
    const D = new Float32Array(tn).fill(1e9), TT = new Float32Array(tn), ZC = new Float32Array(tn), UU = new Float32Array(tn), RR = new Float32Array(tn);
    // passe 1 : le plus proche segment
    for (let k = 0; k < n - 1; k++) {
      const ax = X[k], ay = Y[k], bx = X[k + 1], by = Y[k + 1];
      const rm = Math.max(RA[k], RA[k + 1]) + ip;
      const ia = Math.max(i0, Math.floor((Math.min(ax, bx) - rm - B.bx0) * ppm)), ib = Math.min(i1, Math.ceil((Math.max(ax, bx) + rm - B.bx0) * ppm) + 1);
      const ja = Math.max(j0, Math.floor((Math.min(ay, by) - rm - B.by0) * ppm)), jb = Math.min(j1, Math.ceil((Math.max(ay, by) + rm - B.by0) * ppm) + 1);
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9, il = 1 / Math.sqrt(l2);
      const nx = -ey * il, ny = ex * il;
      for (let j = ja; j < jb; j++) {
        const Yp = B.by0 + (j + 0.5) * ip, row = (j - j0) * tw - i0;
        for (let i = ia; i < ib; i++) {
          const Xp = B.bx0 + (i + 0.5) * ip;
          const wx = Xp - ax, wy = Yp - ay;
          let t = (wx * ex + wy * ey) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = wx - ex * t, dy = wy - ey * t, dist = Math.sqrt(dx * dx + dy * dy);
          const q = row + i;
          if (dist < D[q]) {
            D[q] = dist;
            TT[q] = T[k] + (T[k + 1] - T[k]) * t;
            ZC[q] = Z[k] + (Z[k + 1] - Z[k]) * t;
            RR[q] = RA[k] + (RA[k + 1] - RA[k]) * t;
            UU[q] = wx * nx + wy * ny;
          }
        }
      }
      if ((k & 15) === 15) yield;
    }
    // passe 2 : une peinture par pixel
    const f = part.f, H = B.H, A = B.A;
    for (let j = j0; j < j1; j++) {
      const row = (j - j0) * tw - i0;
      for (let i = i0; i < i1; i++) {
        const q = row + i, dist = D[q], r = RR[q];
        if (dist >= r + ip) continue;
        let c = (r - dist) * ppm + 0.5;
        if (c <= 0) continue;
        if (c > 1) c = 1;
        const qq = dist / r > 1 ? 1 : dist / r;
        const prof = plat > 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(qq, 2 + plat * 6))) * (1 - plat * 0.55) : Math.sqrt(1 - qq * qq);
        const z = ZC[q] + r * prof;
        const id = j * w + i;
        if (A[id] > 0.01 && z < H[id] - 0.02) {
          const vis = 1 - A[id];
          if (vis <= 0.001) continue;
          c *= vis;
        }
        const u = UU[q] / r;
        S.d = 0;
        S.z = z;
        S.ao = 1; S.sh = 0; S.ev = 1; S.me = 0; S.f0 = 0.04; S.an = 0;
        f(TT[q], u < -1 ? -1 : u > 1 ? 1 : u, S, qq);
        melange(B, id, S, c);
      }
      if ((j & 31) === 31) yield;
    }
  }

  /**
   * Rend un objet (générateur). spec :
   *   ppm, angle (rad), box [x0, y0, x1, y1] (mm, repère de l'objet), couches [ … ],
   *   cadre (facultatif) : { bx0, by0, w, h } — une zone imposée (le fond de la scène), sans marge
   *   cavite [r, force] | false, soleil (pénombre mm) | false, wrap, sol ([r, g, b] linéaire),
   *   lumiere(X, Y) (facultatif : facteur local de la lumière directe, repère du monde),
   *   ombre : { opacite, doux, contact, ppmS } | false, opaque (fond : alpha = 1 partout)
   * → sprite { canvas, ombre, w, h, ax, ay, ppm, angle, t }
   */
  R.rendre = function* (spec) {
    const t0 = now();
    const T = {};
    const ppm = spec.ppm, ang = spec.angle || 0;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let bx0, by0, w, h;
    if (spec.cadre) {
      ({ bx0, by0, w, h } = spec.cadre);
    } else {
      const [x0, y0, x1, y1] = spec.box;
      let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const X = x * ca - y * sa, Y = x * sa + y * ca;
        if (X < mx0) mx0 = X; if (X > mx1) mx1 = X;
        if (Y < my0) my0 = Y; if (Y > my1) my1 = Y;
      }
      const m = 1.5 / ppm;
      bx0 = mx0 - m; by0 = my0 - m;
      w = Math.ceil((mx1 - mx0 + 2 * m) * ppm);
      h = Math.ceil((my1 - my0 + 2 * m) * ppm);
    }
    const n = w * h;
    const S = ardoise();
    S.lim = 0.5 / ppm;
    S.ppm = ppm;
    const jeu = yield* prendre(n);
    const B = Object.assign({ w, h, n, ppm, ca, sa, bx0, by0, S }, jeu.v);
    yield 'couches';
    // --- les couches
    let cnt = 0;
    for (const part of spec.couches) {
      if (!part) continue;
      if (part.tube) {
        yield* tube(B, part);
        continue;
      }
      let ia = 0, ib = w, ja = 0, jb = h;
      if (part.box) {
        const [x0, y0, x1, y1] = part.box;
        let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
        for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
          const X = x * ca - y * sa, Y = x * sa + y * ca;
          if (X < mx0) mx0 = X; if (X > mx1) mx1 = X;
          if (Y < my0) my0 = Y; if (Y > my1) my1 = Y;
        }
        ia = Math.max(0, Math.floor((mx0 - bx0) * ppm) - 1);
        ib = Math.min(w, Math.ceil((mx1 - bx0) * ppm) + 1);
        ja = Math.max(0, Math.floor((my0 - by0) * ppm) - 1);
        jb = Math.min(h, Math.ceil((my1 - by0) * ppm) + 1);
      }
      const larg = Math.max(1, ib - ia), pas = Math.max(1, Math.round(2400 / larg));
      for (let j = ja; j < jb; j++) {
        ligne(B, part, j, ia, ib);
        if (++cnt % pas === 0) yield;
      }
      yield;
    }
    if (spec.opaque) B.A.fill(1);
    T.peint = now() - t0;
    yield 'relief';
    // --- relief
    let t1 = now();
    if (spec.adoucir) R.flou(B.H, w, h, spec.adoucir * ppm);
    const N = { nx: B.nx, ny: B.ny, nz: B.nz };
    const bande = Math.max(4, Math.round(60000 / w));
    for (let j = 0; j < h; j += bande) {
      R.normales(B.H, w, h, ppm, N, j, Math.min(h, j + bande), spec.opaque ? null : B.A);
      yield;
    }
    yield 'cavite';
    if (spec.cavite !== false) {
      const cv = spec.cavite || [1.6, 0.35];
      const ao = yield* R.caviteG(B.H, w, h, ppm, cv[0], cv[1]);
      for (let i = 0; i < n; i++) B.ao[i] *= ao[i];
      yield;
    }
    yield 'soleil';
    const vis = spec.soleil === false ? null : yield* R.soleilG(B.H, w, h, ppm, spec.soleil || 0.8);
    yield 'lumiere';
    let lumi = null;
    if (spec.lumiere) {
      lumi = new Float32Array(n);
      const ip = 1 / ppm;
      for (let j = 0; j < h; j++) {
        const Y = by0 + (j + 0.5) * ip;
        for (let i = 0; i < w; i++) lumi[j * w + i] = spec.lumiere(bx0 + (i + 0.5) * ip, Y);
      }
      yield;
    }
    T.relief = now() - t1;
    // --- la lumière
    t1 = now();
    yield* R.tablesEnv(spec.sol);
    const bandeL = Math.max(2, Math.round(12000 / w));
    const c = R.canvas(w, h), gc = c.getContext('2d');
    const O = {
      w, h, alb: B.alb, alpha: spec.opaque ? null : B.A, nx: N.nx, ny: N.ny, nz: N.nz,
      ro: B.ro, me: B.me, f0: B.f0, ao: B.ao, sh: B.sh, ev: B.ev, an: B.an, gx: B.gx, gy: B.gy,
      vis, sol: spec.sol, wrap: spec.wrap, lumiere: lumi,
      oeil: spec.oeil === false ? null : { x0: bx0 - (spec.oeil ? spec.oeil.x : 0), y0: by0 - (spec.oeil ? spec.oeil.y : 0), ppm, D: spec.oeil && spec.oeil.D },
    };
    for (let j = 0; j < h; j += bandeL) {
      const j1 = Math.min(h, j + bandeL);
      O.img = gc.createImageData(w, j1 - j);
      O.decal = j;
      R.eclairer(O, j, j1);
      gc.putImageData(O.img, 0, j);
      yield;
    }
    T.lumiere = now() - t1;
    if (spec.ombre === false || spec.cadre) rendre_(jeu);
    // --- l'ombre portée
    t1 = now();
    let ombre = null;
    if (spec.ombre !== false && !spec.cadre) {
      const oo = spec.ombre || {};
      yield 'ombreBasse';
      const low = yield* R.ombreBasse(B.H, B.A, w, h, ppm, oo);
      yield 'ombre';
      rendre_(jeu);
      ombre = yield* R.ombreDe(low, oo);
    }
    T.ombre = now() - t1;
    T.tout = now() - t0;
    return {
      canvas: c, ombre, w: w / ppm, h: h / ppm, ax: -bx0, ay: -by0, ppm, angle: ang, t: T,
      haut: spec.haut || 0, px: n, ombreOpts: spec.ombre || {},
    };
  };

  /* ======================================================================
     8. L'ombre portée
     Un point de l'établi est à l'ombre si le rayon qui monte vers la lumière traverse l'objet :
     à la hauteur z, ce rayon passe au-dessus du point décalé de −OMBRE·z. On empile donc des tranches
     de l'objet (là où il dépasse z), décalées de OMBRE·z, et floutées d'autant plus qu'elles sont
     hautes (la vitrine est une grande source : pénombre ≈ 0,25 mm par mm de hauteur).
     Tout se fait en basse résolution (≈ 1 px/mm) : l'ombre est douce.
     ====================================================================== */
  const sigmaDe = (z, doux) => (0.45 + 0.26 * z) * doux; // mm

  /** Réduit l'objet en basse résolution (couverture moyenne, hauteur maximale) avec les marges de l'ombre */
  R.ombreBasse = function* (Hf, A, w, h, ppm, o = {}) {
    let zmax = 0;
    for (let i = 0; i < w * h; i++) if (A[i] > 0.3 && Hf[i] > zmax) zmax = Hf[i];
    // l'ombre est douce : ≈ 1 px/mm pour un objet plat, moins pour un objet haut (sa pénombre est large)
    const ps = Math.min(ppm, o.ppmS || (zmax > 40 ? 0.5 : zmax > 9 ? 0.72 : 1.0));
    const k = ppm / ps;
    const pk = ps;
    const lift = o.levee || 0;
    const doux = o.doux || 1;
    const S0 = R.OMBRE[0], S1 = R.OMBRE[1];
    const zt = zmax + Math.max(lift, o.leveeMax || 0);
    const sg = sigmaDe(zt, doux);
    const mL = 2.5 + 2.2 * sigmaDe(0.5, doux), mR = S0 * zt + 2.6 * sg + 3, mB = S1 * zt + 2.6 * sg + 3;
    const ox = Math.ceil(mL * pk), oy = Math.ceil(mL * pk);
    const w2 = ox + Math.ceil(w / k) + 1 + Math.ceil(mR * pk), h2 = oy + Math.ceil(h / k) + 1 + Math.ceil(mB * pk);
    const A2 = new Float32Array(w2 * h2), Z2 = new Float32Array(w2 * h2);
    const inv = 1 / (k * k);
    const ik = 1 / k;
    for (let j = 0; j < h; j++) {
      const row = (oy + ((j * ik) | 0)) * w2 + ox;
      for (let i = 0; i < w; i++) {
        const a = A[j * w + i];
        if (a <= 0) continue;
        const q = row + ((i * ik) | 0);
        A2[q] += a * inv;
        const z = Hf[j * w + i];
        if (a > 0.25 && z > Z2[q]) Z2[q] = z;
      }
    }
    for (let i = 0; i < w2 * h2; i++) if (A2[i] > 1) A2[i] = 1;
    yield;
    return { A2, Z2, w2, h2, ox, oy, k, pk, zmax, ppm };
  };

  /** Calcule l'ombre (canvas basse résolution) à partir de la réduction (générateur) */
  R.ombreDe = function* (low, o = {}) {
    const { A2, Z2, w2, h2, ox, oy, k, pk, zmax } = low;
    const doux = o.doux || 1;
    const opacite = o.opacite != null ? o.opacite : 0.62;
    const contact = o.contact != null ? o.contact : 0.5;
    const S0 = R.OMBRE[0] * pk, S1 = R.OMBRE[1] * pk; // px par mm de hauteur
    const SL = Math.hypot(S0, S1) || 1;
    const n = w2 * h2;
    // boîte de l'objet (px basse résolution)
    let bx0 = w2, by0 = h2, bx1 = 0, by1 = 0;
    for (let j = 0; j < h2; j++) for (let i = 0; i < w2; i++) if (A2[j * w2 + i] > 0.01) {
      if (i < bx0) bx0 = i; if (i > bx1) bx1 = i; if (j < by0) by0 = j; if (j > by1) by1 = j;
    }
    const O = new Float32Array(n);
    if (bx1 >= bx0) {
      // les tranches : pas croissant (les tranches hautes sont floues : on peut les espacer) ; décalages entiers
      const niveaux = [];
      let z = 0.25, der = '';
      while (z < zmax) {
        const cle = Math.round(S0 * z) + ',' + Math.round(S1 * z);
        if (cle !== der) niveaux.push(z);
        der = cle;
        const s = sigmaDe(z, doux) * pk;
        z += Math.max(0.8 / SL, (0.45 * s) / SL);
      }
      if (!niveaux.length) niveaux.push(Math.max(0.01, zmax * 0.5));
      // la tranche z : couverture là où l'objet dépasse z (bord adouci sur 0,4 mm)
      const U = new Float32Array(n);
      let gi = 0;
      while (gi < niveaux.length) {
        const s0 = sigmaDe(niveaux[gi], doux);
        let gj = gi;
        while (gj + 1 < niveaux.length && sigmaDe(niveaux[gj + 1], doux) < s0 * 1.8) gj++;
        U.fill(0);
        let ux0 = w2, uy0 = h2, ux1 = 0, uy1 = 0;
        for (let q = gi; q <= gj; q++) {
          const zq = niveaux[q];
          const fx = Math.round(S0 * zq), fy = Math.round(S1 * zq);
          const jA = Math.max(0, by0 + fy), jB = Math.min(h2 - 1, by1 + fy);
          const iA = Math.max(0, bx0 + fx), iB = Math.min(w2 - 1, bx1 + fx);
          if (iA < ux0) ux0 = iA; if (iB > ux1) ux1 = iB; if (jA < uy0) uy0 = jA; if (jB > uy1) uy1 = jB;
          for (let j = jA; j <= jB; j++) {
            const rs = (j - fy) * w2 - fx, rd = j * w2;
            for (let i = iA; i <= iB; i++) {
              const sq = rs + i, a = A2[sq];
              if (a <= 0) continue;
              const zz = Z2[sq];
              let v = a;
              if (zz <= zq) { if (zz <= zq - 0.4) continue; v = a * (zz - zq + 0.4) * 2.5; }
              if (v > U[rd + i]) U[rd + i] = v;
            }
          }
          if ((q & 7) === 7) yield;
        }
        yield;
        // flou du groupe, sur sa boîte seulement
        const sg = Math.sqrt(sigmaDe(niveaux[gi], doux) * sigmaDe(niveaux[gj], doux)) * pk;
        const pad = Math.ceil(sg * 3) + 2;
        const cx0 = Math.max(0, ux0 - pad), cy0 = Math.max(0, uy0 - pad), cx1 = Math.min(w2 - 1, ux1 + pad), cy1 = Math.min(h2 - 1, uy1 + pad);
        const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
        const tmp = new Float32Array(cw * ch);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) tmp[j * cw + i] = U[(j + cy0) * w2 + i + cx0];
        yield* R.flouG(tmp, cw, ch, sg);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
          const id = (j + cy0) * w2 + i + cx0, v = tmp[j * cw + i];
          if (v > O[id]) O[id] = v;
        }
        yield;
        gi = gj + 1;
      }
    }
    // l'ombre de contact (serrée) et l'occlusion ambiante (large, selon la hauteur)
    const C = new Float32Array(n), AOb = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      C[i] = A2[i];
      AOb[i] = A2[i] * Math.min(1, Z2[i] / 30);
    }
    yield* R.flouG(C, w2, h2, 0.9 * pk);
    yield;
    yield* R.flouG(AOb, w2, h2, (5 + zmax * 0.22) * pk);
    yield;
    const c = R.canvas(w2, h2), g = c.getContext('2d');
    const img = g.createImageData(w2, h2), d = img.data;
    const [r0, g0, b0] = R.OMBRE_RGB;
    for (let i = 0; i < n; i++) {
      let v = O[i] * opacite + C[i] * contact + AOb[i] * 0.3;
      v = v > 0.92 ? 0.92 : v;
      const q = i * 4;
      d[q] = r0; d[q + 1] = g0; d[q + 2] = b0; d[q + 3] = v * 255;
    }
    g.putImageData(img, 0, 0);
    // placement : le coin haut-gauche de l'ombre, en mm, relatif au coin haut-gauche du canvas de l'objet
    return { canvas: c, x: -ox / pk, y: -oy / pk, k, pk, w: w2 / pk, h: h2 / pk };
  };

  /**
   * L'ombre d'un sprite soulevé de `levee` mm (animations : l'objet tombe, se soulève) : la même, adoucie
   * (la pénombre grandit avec la hauteur) et un peu plus claire ; gardée en cache par pas de 5 mm.
   * Le décalage (OMBRE × levee) est appliqué par R.poser.
   */
  R.ombreLevee = function (sp, levee) {
    const o0 = sp.ombre;
    if (!o0) return null;
    const q = Math.round(levee / 5) * 5;
    if (q <= 0) return o0;
    sp._levees = sp._levees || new Map();
    let o = sp._levees.get(q);
    if (o) return o;
    const src = o0.canvas, w = src.width, h = src.height;
    const sg = sigmaDe(q, sp.ombreOpts && sp.ombreOpts.doux || 1) * 0.8 * o0.pk;
    const pad = Math.ceil(sg * 2.5);
    const W = w + 2 * pad, H = h + 2 * pad;
    const g0 = src.getContext('2d', { willReadFrequently: true });
    const d0 = g0.getImageData(0, 0, w, h).data;
    const a = new Float32Array(W * H);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) a[(j + pad) * W + i + pad] = d0[(j * w + i) * 4 + 3] / 255;
    R.flou(a, W, H, sg);
    const c = R.canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const [r0, g1, b0] = R.OMBRE_RGB;
    const k = 1 / (1 + q * 0.018);
    for (let i = 0; i < W * H; i++) {
      d[i * 4] = r0; d[i * 4 + 1] = g1; d[i * 4 + 2] = b0; d[i * 4 + 3] = a[i] * k * 255;
    }
    g.putImageData(img, 0, 0);
    o = { canvas: c, x: o0.x - pad / o0.pk, y: o0.y - pad / o0.pk, k: o0.k, pk: o0.pk, w: W / o0.pk, h: H / o0.pk };
    sp._levees.set(q, o);
    return o;
  };

  /* ======================================================================
     9. Poser un sprite dans un contexte 2D
     ====================================================================== */
  /**
   * Pose l'ombre puis l'objet, l'origine de l'objet en (x, y) pixels du contexte.
   * s : échelle (px du contexte par px du sprite) ; levee : mm au-dessus de l'établi (l'ombre s'écarte et
   * s'adoucit, l'objet grossit un peu : il se rapproche de l'objectif) ; ombre / objet : l'un ou l'autre seul.
   */
  R.poser = function (ctx, sp, x, y, { s = 1, alpha = 1, ombre = true, objet = true, levee = 0 } = {}) {
    if (!sp) return;
    const ppm = sp.ppm * s; // px du contexte par mm
    if (ombre && sp.ombre) {
      let o = sp.ombre, dx = 0, dy = 0;
      if (levee > 0.5) {
        o = R.ombreLevee(sp, levee) || sp.ombre;
        dx = R.OMBRE[0] * levee;
        dy = R.OMBRE[1] * levee;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(o.canvas, x + (o.x - sp.ax + dx) * ppm, y + (o.y - sp.ay + dy) * ppm, o.canvas.width * o.k * s, o.canvas.height * o.k * s);
      ctx.restore();
    }
    if (objet) {
      const g = 1 + levee * 0.0016;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (g !== 1) ctx.scale(g, g);
      ctx.drawImage(sp.canvas, -sp.ax * ppm, -sp.ay * ppm, sp.canvas.width * s, sp.canvas.height * s);
      ctx.restore();
    }
  };

  /* ======================================================================
     9 bis. La photo : la flaque de lumière de la lampe, le vignetage, le grain
     ====================================================================== */
  let GRAIN = null;
  function grainTuile() {
    if (GRAIN) return GRAIN;
    const n = 192, c = R.canvas(n, n), g = c.getContext('2d');
    const img = g.createImageData(n, n), d = img.data;
    const rr = R.rng(0x9e3779b9);
    for (let i = 0; i < n * n; i++) {
      // un grain un peu gaussien (somme de trois tirages), légèrement coloré dans les ombres
      const v = (rr() + rr() + rr() - 1.5) * 150;
      d[i * 4] = 128 + v;
      d[i * 4 + 1] = 128 + v * 0.96;
      d[i * 4 + 2] = 128 + v * 1.06;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    GRAIN = c;
    return c;
  }
  /**
   * Sur l'image finie (contexte 2D, w × h px) : la lumière de la vitrine tombe en haut à gauche et s'éteint
   * vers le bas à droite (multiplication), les coins s'assombrissent, un grain fin de photo de téléphone.
   * foyer : [fx, fy] (fraction de w, h) le centre de la flaque de lumière ; force, grain : 0..1
   */
  R.photo = function (ctx, w, h, { foyer = [0.24, 0.12], force = 1, grain = 1, echelle = 1 } = {}) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = force;
    const d = Math.hypot(w, h);
    const cx = w * foyer[0], cy = h * foyer[1];
    const g = ctx.createRadialGradient(cx, cy, d * 0.04, cx, cy, d * 1.08);
    g.addColorStop(0, 'rgb(255,251,244)');
    g.addColorStop(0.35, 'rgb(246,236,222)');
    g.addColorStop(0.62, 'rgb(212,192,170)');
    g.addColorStop(0.85, 'rgb(150,126,104)');
    g.addColorStop(1, 'rgb(104,84,68)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const v = ctx.createRadialGradient(w / 2, h / 2, d * 0.32, w / 2, h / 2, d * 0.62);
    v.addColorStop(0, 'rgb(255,255,255)');
    v.addColorStop(1, 'rgb(168,158,150)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    if (grain > 0) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.34 * grain;
      const pat = ctx.createPattern(grainTuile(), 'repeat');
      if (pat && pat.setTransform && echelle !== 1 && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().scale(echelle));
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  };

  /* ======================================================================
     10. L'ordonnanceur : les calculs par tranches (le fil principal ne gèle jamais)
     ====================================================================== */
  R.BUDGET = 8; // ms par tranche
  const file = [];
  const parCle = new Map();
  let prevu = 0, enPause = false, seq = 0, enCours = null;
  const canal = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  if (canal) canal.port1.onmessage = () => { prevu = 0; tourner(null); };
  R.stats = { pasMax: 0, tranches: 0, cpu: 0 };

  function planifier() {
    if (prevu || enPause || !file.length || enCours) return;
    const tete = file[0];
    if (tete.prio <= 0 && typeof requestIdleCallback !== 'undefined') {
      prevu = 2;
      requestIdleCallback((dl) => { prevu = 0; tourner(dl); }, { timeout: 1200 });
    } else if (canal) {
      prevu = 1;
      canal.port2.postMessage(0);
    } else {
      prevu = 1;
      setTimeout(() => { prevu = 0; tourner(null); }, 0);
    }
  }
  function trier() {
    file.sort((a, b) => b.prio - a.prio || a.n - b.n);
  }
  function tourner(dl) {
    if (enPause || enCours) return;
    const t0 = now();
    let budget = R.BUDGET;
    if (dl && dl.timeRemaining && !dl.didTimeout) budget = Math.max(3, Math.min(R.BUDGET, dl.timeRemaining() - 1));
    R.stats.tranches++;
    while (file.length && now() - t0 < budget) {
      const job = file[0];
      const ta = now();
      const etape = job.etape;
      let r;
      try {
        r = job.gen.next(job.retour);
        job.retour = undefined;
      } catch (e) {
        file.shift();
        if (job.cle) parCle.delete(job.cle);
        job.reject(e);
        continue;
      }
      const dt = now() - ta;
      job.cpu += dt;
      if (dt > job.pasMax) { job.pasMax = dt; job.pasLent = etape; }
      if (dt > R.stats.pasMax) { R.stats.pasMax = dt; R.stats.pasLent = (job.cle || '?') + ' / ' + etape; }
      if (r.value && typeof r.value === 'string') job.etape = r.value;
      R.stats.cpu += dt;
      if (r.done) {
        file.shift();
        if (job.cle) parCle.delete(job.cle);
        job.resolve(r.value);
        continue;
      }
      if (r.value && typeof r.value.then === 'function') {
        // une promesse (police à charger…) : on la laisse se résoudre, les autres calculs continuent
        enCours = job;
        file.shift();
        r.value.then((v) => { job.retour = v; }, () => {}).then(() => {
          enCours = null;
          file.push(job);
          trier();
          planifier();
        });
        break;
      }
    }
    planifier();
  }
  /**
   * Lance un calcul découpé en tranches. gen : un générateur ; prio : > 0 tout de suite (tranches de 8 ms
   * entre deux images), ≤ 0 aux temps morts (requestIdleCallback) ; cle : un même calcul demandé deux fois
   * n'est fait qu'une fois (et sa priorité monte). → Promise du résultat (job.cpu : temps de calcul total).
   */
  R.lancer = function (gen, { prio = 1, cle = null } = {}) {
    if (cle && parCle.has(cle)) {
      const j = parCle.get(cle);
      if (prio > j.prio) { j.prio = prio; trier(); planifier(); }
      return j.promise;
    }
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    const job = { gen, prio, cle, n: seq++, resolve, reject, promise, cpu: 0, pasMax: 0, t0: now() };
    promise.job = job;
    file.push(job);
    if (cle) parCle.set(cle, job);
    trier();
    planifier();
    return promise;
  };
  /** Mène un générateur au bout, d'une traite (banc d'essai, planche) */
  R.finir = function (gen) {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  };
  /** Suspend / reprend les calculs (l'établi n'est plus à l'écran : rien ne tourne) */
  R.pause = function (v) {
    enPause = !!v;
    if (!enPause) planifier();
  };
  R.enAttente = () => file.length + (enCours ? 1 : 0);

  /* ======================================================================
     11. Le cache : mémoire (Map bornée) et le téléphone (IndexedDB, comme kk-bake.js)
     ====================================================================== */
  const CACHE = new Map();
  let cachePx = 0;
  R.CACHE_MAX = 36e6; // pixels gardés en mémoire (≈ 144 Mo au pire)
  R.cache = {
    get(k) {
      const v = CACHE.get(k);
      if (v) { CACHE.delete(k); CACHE.set(k, v); } // le plus récent en dernier
      return v;
    },
    set(k, v) {
      if (CACHE.has(k)) return v;
      CACHE.set(k, v);
      cachePx += v.px || 0;
      while (cachePx > R.CACHE_MAX && CACHE.size > 1) {
        const [k0, v0] = CACHE.entries().next().value;
        CACHE.delete(k0);
        cachePx -= v0.px || 0;
      }
      return v;
    },
    has: (k) => CACHE.has(k),
    taille: () => CACHE.size,
    vider() { CACHE.clear(); cachePx = 0; },
  };

  /* la mémoire du téléphone : une image calculée une fois y est gardée (PNG) ; aux visites suivantes elle
     revient en quelques millisecondes. Clés préfixées par la version : une nouvelle version repart de zéro. */
  const SELF = !DANS_WORKER && document.currentScript ? document.currentScript.src : '';
  const VERSION = R.VERSION + ':' + ((SELF.match(/[?&]v=([^&#]+)/) || [])[1] || 'dev');
  R.coffre = (() => {
    let dbp = null;
    const off = () => typeof indexedDB === 'undefined' || /[?&]nocache\b/.test((typeof location !== 'undefined' && location.search) || '');
    const open = () => dbp || (dbp = new Promise((res) => {
      try {
        if (off()) return res(null);
        const rq = indexedDB.open('cordo63-etabli', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('img');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = (e) => { e.preventDefault(); res(null); };
        rq.onblocked = () => res(null);
      } catch (e) {
        res(null);
      }
    }));
    const quiet = (e) => { if (e && e.preventDefault) e.preventDefault(); };
    return {
      async get(k) {
        const db = await open();
        if (!db) return null;
        return new Promise((res) => {
          try {
            const rq = db.transaction('img', 'readonly').objectStore('img').get(VERSION + '|' + k);
            rq.onsuccess = () => res(rq.result == null ? null : rq.result);
            rq.onerror = (e) => { quiet(e); res(null); };
          } catch (e) {
            res(null);
          }
        });
      },
      async put(k, v) {
        const db = await open();
        if (!db || v == null) return;
        try {
          const t = db.transaction('img', 'readwrite');
          t.onerror = t.onabort = quiet;
          t.objectStore('img').put(v, VERSION + '|' + k).onerror = quiet;
        } catch (e) { /* mémoire pleine ou refusée : on recalculera */ }
      },
      async sweep() {
        const db = await open();
        if (!db) return;
        try {
          const t = db.transaction('img', 'readwrite');
          t.onerror = t.onabort = quiet;
          const store = t.objectStore('img');
          const rq = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
          rq.onsuccess = () => {
            const c = rq.result;
            if (!c) return;
            if (!String(c.key).startsWith(VERSION + '|')) store.delete(c.key);
            c.continue();
          };
        } catch (e) { /* rien */ }
      },
    };
  })();
  if (!DANS_WORKER) setTimeout(() => R.coffre.sweep(), 9000);

  /** canvas → Blob PNG (null si impossible) */
  R.versPNG = function (c) {
    return new Promise((res) => {
      try {
        if (c.convertToBlob) c.convertToBlob({ type: 'image/png' }).then(res, () => res(null));
        else c.toBlob((b) => res(b), 'image/png');
      } catch (e) { res(null); }
    });
  };
  /** Blob PNG → canvas (null si impossible) */
  R.dePNG = async function (blob) {
    try {
      if (typeof createImageBitmap === 'undefined') return null;
      const bm = await createImageBitmap(blob);
      const c = R.canvas(bm.width, bm.height);
      c.getContext('2d').drawImage(bm, 0, 0);
      if (bm.close) bm.close();
      return c;
    } catch (e) {
      return null;
    }
  };
  /** Un sprite → ce qu'on garde dans le téléphone (deux PNG + les mesures) */
  R.emballer = async function (sp) {
    const a = await R.versPNG(sp.canvas);
    const b = sp.ombre ? await R.versPNG(sp.ombre.canvas) : null;
    if (!a) return null;
    const o = sp.ombre;
    return {
      png: a, ombre: b,
      m: { w: sp.w, h: sp.h, ax: sp.ax, ay: sp.ay, ppm: sp.ppm, angle: sp.angle, haut: sp.haut, t: sp.t, ombreOpts: sp.ombreOpts,
        ombre: o ? { x: o.x, y: o.y, k: o.k, pk: o.pk, w: o.w, h: o.h } : null },
    };
  };
  R.deballer = async function (v) {
    if (!v || !v.png) return null;
    const c = await R.dePNG(v.png);
    if (!c) return null;
    const m = v.m;
    let ombre = null;
    if (v.ombre && m.ombre) {
      const oc = await R.dePNG(v.ombre);
      if (oc) ombre = Object.assign({ canvas: oc }, m.ombre);
    }
    // les mesures d'abord, puis l'image et l'ombre rebâties (m.ombre, sans canvas, ne doit pas écraser l'ombre)
    return Object.assign({}, m, { canvas: c, ombre, px: c.width * c.height, coffre: true });
  };

  /** Masque de couverture basse résolution d'un sprite (pour savoir quel objet on touche) */
  R.masqueDe = function (sp) {
    if (sp._masque) return sp._masque;
    const k = Math.max(1, Math.round(sp.ppm / 1.5));
    const w = Math.max(1, Math.ceil(sp.canvas.width / k)), h = Math.max(1, Math.ceil(sp.canvas.height / k));
    const c = R.canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(sp.canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    sp._masque = { a, w, h, k };
    return sp._masque;
  };
})();
