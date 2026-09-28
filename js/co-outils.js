/* ==========================================================================
   Cordo 63 — les objets de l'établi, vus de dessus (CO.Outils)
   Chaque objet est défini procéduralement : une forme 2D (distances signées,
   ou dessinée au Canvas 2D puis changée en champ de distance), un profil de
   hauteur, une matière, de l'usure. Le moteur commun (co-rendu.js) l'éclaire
   avec la lumière de l'atelier et calcule son ombre.

   Repère de chaque objet : millimètres, centré ; l'axe long suit x.

   CO.Outils.liste                          [{ id, nom, dim: [long, larg, haut] (mm), categorie }]
                                              categorie : 'outil' | 'piece' (sneaker, derby) | 'encombrement' (ce qui
                                              traîne sur l'établi) | 'surface' (tapis, etabli)
   CO.Outils.sprite(id, { ppm, angle, graine, oeil })
                                            → { canvas, ombre, w, h, ax, ay, ppm, t, … } (calculé d'une traite, mis en cache)
                                              angle en degrés (sens horaire à l'écran), ppm en px du canvas par mm ;
                                              ombre : { canvas, x, y, k } (basse résolution, à poser avec CO.R.poser) ;
                                              oeil : [x, y] mm — où est l'appareil photo, vu depuis l'objet (reflets)
   CO.Outils.preparer(id, opts, prio)       → Promise du même sprite, calculé par tranches (cache mémoire + téléphone)
   CO.Outils.construireG(id, opts)          le même calcul, en générateur (pour composer soi-même)
   CO.Outils.fond({ cadre, ppm, tapis, avant, oeil, graine })
                                            → générateur : le plateau d'aggloméré et le tapis de découpe, usés (un
                                              canvas opaque ; l'encombrement est posé par co-etabli.js)
   CO.Outils.info(id)                       → { id, nom, dim, son, haut }
   Les textes dessinés (tapis, réglet, tickets, semelle) prennent les polices du site dans ses variables CSS
   (--chiffres, sinon --sans ; --main pour l'écriture à la main).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const R = CO.R;
  if (!R) throw new Error('co-outils.js : charger co-rendu.js avant');
  const geo = R.geo, MAT = R.MAT;
  const tx = R.tx, clamp01 = R.clamp01, sstep = R.sstep, lerp = R.lerp;
  const TAU = Math.PI * 2;
  const lin = R.lin;

  /* ======================================================================
     1. Outils communs
     ====================================================================== */
  /* polices (celles du site si elles sont là) */
  /* les polices : celles du site, lues dans ses variables CSS (--chiffres, sinon --sans ; --main pour l'écriture
     à la main), jamais écrites en dur ici — le site peut en changer. Relues à chaque modèle. */
  function famille(v, repli) {
    try {
      if (typeof document !== 'undefined' && window.getComputedStyle) {
        const cs = getComputedStyle(document.documentElement);
        for (const nom of v) {
          const f = cs.getPropertyValue(nom).trim();
          if (f) return f;
        }
      }
    } catch (e) { /* hors page */ }
    return repli;
  }
  const POLICE = {
    get chiffres() { return famille(['--chiffres', '--sans'], 'system-ui, sans-serif'); },
    get main() { return famille(['--main', '--manuscrite'], 'cursive'); },
  };
  /** l'empreinte des polices (dans les clés du cache : si le site change de police, on recalcule) */
  function empreinteP() {
    const t = POLICE.chiffres + '|' + POLICE.main;
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }
  /* les tuiles de bruit partagées (préparées une fois, par tranches) */
  const T = {};
  function* tuiles() {
    if (T.ok) return T;
    yield 'echauffer';
    R.echauffer(['600 12px ' + POLICE.chiffres, '600 12px ' + POLICE.main]);
    yield;
    const plan = [
      ['a', () => R.tuileG(1, 8, 4)], // fbm général (motifs de 32 texels)
      ['b', () => R.tuileG(2, 16, 3)],
      ['c', () => R.tuileG(3, 32, 2)], // fin
      ['d', () => R.tuileG(4, 4, 5)], // grandes taches
      ['e', () => R.tuileG(5, 64, 1)], // très fin (stries, pores)
      ['W', () => R.cellulesG(1, 32)], // cellules (copeaux, grain du cuir)
      ['V', () => R.cellulesG(2, 64)],
    ];
    for (const [k, f] of plan) {
      if (!T[k]) {
        yield 'tuile:' + k;
        T[k] = yield* f();
        yield;
      }
    }
    T.ok = true;
    return T;
  }

  /* les modèles (masques, champs, listes d'usure) : calculés une fois par objet et par graine */
  const MODELES = new Map();
  function* modele(cle, fab) {
    if (MODELES.has(cle)) return MODELES.get(cle);
    const m = yield* fab();
    MODELES.set(cle, m);
    return m;
  }

  /* interpolation monotone (Fritsch-Carlson) de points [x, y] triés en x → f(x) */
  function monotone(P) {
    const n = P.length, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const d = [], m = new Array(n);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0];
      if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0;
      while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  /* table d'une fonction sur [a, b] (n points) → lecture linéaire rapide */
  function table(f, a, b, n = 512) {
    const v = new Float32Array(n + 1), k = n / (b - a);
    for (let i = 0; i <= n; i++) v[i] = f(a + i / k);
    return (x) => {
      let u = (x - a) * k;
      if (u <= 0) return v[0];
      if (u >= n) return v[n];
      const i = u | 0;
      u -= i;
      return v[i] + (v[i + 1] - v[i]) * u;
    };
  }

  /* bois : les cernes (0..1, 1 = bois d'été sombre) le long de x ; y : position à travers (mm) ; f : cernes par mm */
  function veine(x, y, o, f = 0.3) {
    const warp = tx(T.a, x * 0.008 + o[0], y * 0.06 + o[1]) * 9 + tx(T.b, x * 0.03 + o[1], y * 0.2 + o[0]) * 2.2;
    // l'écartement des cernes varie (années sèches, années humides)
    const yy = y + warp;
    const ring = yy * f + tx(T.d, yy * 0.05 + o[1], o[0]) * 2.4;
    const fr = ring - Math.floor(ring);
    // bois de printemps (large, clair) puis bois d'été (étroit, sombre, bord net côté écorce)
    return fr < 0.62 ? sstep(0.25, 0.62, fr) * 0.35 : fr < 0.8 ? 0.35 + 0.65 * sstep(0.62, 0.72, fr) : 1 - sstep(0.8, 0.86, fr);
  }
  /* rayures fines (liste de segments) : couverture la plus forte au point (x, y) */
  function rayures(L, x, y, p) {
    let m = 0;
    for (let k = 0; k < L.length; k += 5) {
      const x0 = L[k], y0 = L[k + 1], x1 = L[k + 2], y1 = L[k + 3];
      if ((x < x0 - 1 && x < x1 - 1) || (x > x0 + 1 && x > x1 + 1) || (y < y0 - 1 && y < y1 - 1) || (y > y0 + 1 && y > y1 + 1)) continue;
      const d = geo.seg(x, y, x0, y0, x1, y1);
      if (d < 1) {
        const c = R.trait(d, L[k + 4], p);
        if (c > m) m = c;
      }
    }
    return m;
  }
  function listeRayures(rng, n, box, lmin, lmax, larg, axe = null, dispersion = 0.4) {
    const L = [];
    for (let i = 0; i < n; i++) {
      const x = rng.range(box[0], box[2]), y = rng.range(box[1], box[3]);
      const a = axe != null ? axe + rng.range(-dispersion, dispersion) : rng() * TAU;
      const l = rng.range(lmin, lmax);
      L.push(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, larg * rng.range(0.6, 1.3));
    }
    return L;
  }

  /* attend les polices du site (le générateur cède une promesse : l'ordonnanceur l'attend) */
  let policesPretes = false;
  function* polices() {
    if (policesPretes || typeof document === 'undefined' || !document.fonts) return;
    // les polices du site (celles des variables CSS), aux graisses qu'on dessine, puis document.fonts.ready
    const faces = [];
    for (const w of ['500', '600', '700', '800']) faces.push(w + ' 12px ' + POLICE.chiffres);
    faces.push('600 12px ' + POLICE.main, '700 12px ' + POLICE.main);
    const charge = Promise.all(faces.map((f) => (document.fonts.load ? document.fonts.load(f).catch(() => null) : null)))
      .then(() => document.fonts.ready);
    yield Promise.race([charge, new Promise((r) => setTimeout(r, 1800))]);
    policesPretes = true;
  }

  /* ======================================================================
     2. Le plateau d'aggloméré (l'établi) et le tapis de découpe, usés par des années de travail
     ====================================================================== */
  const ETABLI = lin('#3a2f28');
  const POUSSIERE = lin('#76675c'), POUSSIERE2 = lin('#9a8a7c');
  const TACHE = lin('#140f0c'), COLLE = lin('#7d6443'), TEINTURE = lin('#2a1512');
  const COPEAU_C = lin('#5a4a3c'), PATINE = lin('#1c1410'), AMBRE = lin('#7a5a36');

  /* une grille de cases (clé numérique) : ranger des éléments dans l'espace, retrouver ceux d'un point */
  function cases(x0, y0, x1, y1, pas) {
    const ni = Math.ceil((x1 - x0) / pas), nj = Math.ceil((y1 - y0) / pas);
    const t = new Array(ni * nj).fill(null);
    return {
      ajoute(bx0, by0, bx1, by1, v) {
        const i0 = Math.max(0, Math.floor((bx0 - x0) / pas)), i1 = Math.min(ni - 1, Math.floor((bx1 - x0) / pas));
        const j0 = Math.max(0, Math.floor((by0 - y0) / pas)), j1 = Math.min(nj - 1, Math.floor((by1 - y0) / pas));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const k = j * ni + i;
          (t[k] || (t[k] = [])).push(v);
        }
      },
      lire(x, y) {
        const i = Math.floor((x - x0) / pas), j = Math.floor((y - y0) / pas);
        return i < 0 || j < 0 || i >= ni || j >= nj ? null : t[j * ni + i];
      },
    };
  }

  /** la surface de l'établi au point (X, Y) du monde (mm) → ardoise ; avant : y du bord avant (côté Clément) */
  function surfaceEtabli(M, X, Y, S, avant) {
    const o = M.o, p = 1 / S.ppm;
    // copeaux de l'aggloméré (cellules allongées) : chacun sa teinte
    const cx = X * 0.42 + o[0], cy = Y * 0.3 + o[1];
    const W = T.W;
    const id = R.txN(W.ID, cx, cy);
    const f1 = R.txN(W.F1, cx, cy), f2 = R.txN(W.F2, cx, cy);
    const bordC = sstep(0.0, 0.12, f2 - f1); // 0 au joint entre deux copeaux
    const lodC = R.lod(2.2, S.ppm);
    const vC = ((id - 0.5) * 0.34 + (1 - bordC) * -0.18) * lodC;
    // grandes zones : poussière, colle, taches sombres
    const n1 = tx(T.d, X * 0.012 + o[2], Y * 0.012 + o[3]);
    const n2 = tx(T.a, X * 0.045 + o[3], Y * 0.045 + o[2]);
    const n3 = tx(T.b, X * 0.16 + o[4], Y * 0.16 + o[5]);
    const n4 = tx(T.c, X * 0.5 + o[5], Y * 0.5 + o[4]);
    const pous = sstep(-0.05, 0.55, n1 * 0.55 + n2 * 0.45 + n3 * 0.22 + n4 * 0.1);
    const tache = sstep(0.28, 0.4, tx(T.a, X * 0.03 + o[6], Y * 0.03 + o[7]) * 0.7 + n3 * 0.35 + n4 * 0.08);
    const colle = sstep(0.42, 0.5, tx(T.b, X * 0.05 + o[7], Y * 0.05 + o[6]) * 0.8 + n4 * 0.25);
    const teint = sstep(0.5, 0.58, tx(T.d, X * 0.02 + o[1], Y * 0.02 + o[0]) * 0.8 + n3 * 0.2);
    let r = ETABLI[0], g = ETABLI[1], b = ETABLI[2];
    const kc = 1 + vC;
    r *= kc; g *= kc; b *= kc;
    const pd = pous * (0.55 + 0.45 * (0.5 + 0.5 * n4));
    const P2 = n4 > 0.25 ? POUSSIERE2 : POUSSIERE;
    r += (P2[0] - r) * pd * 0.62; g += (P2[1] - g) * pd * 0.62; b += (P2[2] - b) * pd * 0.62;
    const td = tache * 0.85;
    r += (TACHE[0] - r) * td; g += (TACHE[1] - g) * td; b += (TACHE[2] - b) * td;
    if (teint > 0) { r += (TEINTURE[0] - r) * teint * 0.7; g += (TEINTURE[1] - g) * teint * 0.7; b += (TEINTURE[2] - b) * teint * 0.7; }
    if (colle > 0) { r += (COLLE[0] - r) * colle * 0.45; g += (COLLE[1] - g) * colle * 0.45; b += (COLLE[2] - b) * colle * 0.45; }
    let ro = 0.8 - colle * 0.5 - tache * 0.2 + pous * 0.08;
    let z = 0.05 * (1 - bordC) * lodC * -1 + colle * 0.18 + n4 * 0.05;
    // la patine grasse le long du bord avant (les avant-bras, les mains) : plus sombre, plus lustrée
    if (avant != null) {
      const pat = sstep(avant - 230, avant - 10, Y) * (0.75 + 0.25 * tx(T.a, X * 0.02 + o[2], Y * 0.08 + o[5]));
      if (pat > 0) {
        r += (PATINE[0] - r) * pat * 0.7; g += (PATINE[1] - g) * pat * 0.7; b += (PATINE[2] - b) * pat * 0.7;
        ro -= pat * 0.35;
      }
    }
    // les marques : rayures, bosses, coups de marteau, coulures de colle, rond de tasse, peinture
    const L = M.cases.lire(X, Y);
    if (L) {
      for (let k = 0; k < L.length; k++) {
        const e = L[k];
        if (e.t === 0) { // rayure
          if ((X < e.x0 - 1 && X < e.x1 - 1) || (X > e.x0 + 1 && X > e.x1 + 1) || (Y < e.y0 - 1 && Y < e.y1 - 1) || (Y > e.y0 + 1 && Y > e.y1 + 1)) continue;
          const c = R.trait(geo.seg(X, Y, e.x0, e.y0, e.x1, e.y1), e.w, p);
          if (c > 0) { const q = c * 0.55; r += (COPEAU_C[0] - r) * q; g += (COPEAU_C[1] - g) * q; b += (COPEAU_C[2] - b) * q; z -= c * 0.04; }
        } else if (e.t === 1) { // bosse, coup de marteau (un creux rond, le bord un peu clair)
          const d = Math.hypot(X - e.x, Y - e.y) - e.r;
          if (d < 1) {
            const dedans = clamp01(-d / e.r);
            z -= e.p * Math.sqrt(dedans) * (1 - dedans * 0.3);
            const bord = Math.exp(-d * d * 1.5) * 0.35;
            r *= 1 - dedans * 0.25 + bord; g *= 1 - dedans * 0.25 + bord; b *= 1 - dedans * 0.25 + bord;
          }
        } else if (e.t === 2) { // coulure de colle : une goutte ambrée, brillante, en relief
          const dx = X - e.x, dy = (Y - e.y) / e.k;
          const d = Math.hypot(dx, dy) - e.r * (1 + 0.2 * tx(T.c, Math.atan2(dy, dx) * 3 + e.s, e.s));
          if (d < p) {
            const c = clamp01(0.5 - d / p), ep = clamp01(-d / e.r);
            r += (AMBRE[0] - r) * c * 0.32; g += (AMBRE[1] - g) * c * 0.32; b += (AMBRE[2] - b) * c * 0.32;
            ro = lerp(ro, 0.1, c);
            z += e.h * Math.sqrt(ep) * c;
          }
        } else if (e.t === 3) { // le rond d'une tasse de café
          const dr = Math.hypot(X - e.x, Y - e.y) - e.R;
          const a = Math.atan2(Y - e.y, X - e.x);
          const ouvert = Math.abs(((a - e.a + Math.PI * 3) % TAU) - Math.PI) < 0.5 ? 0 : 1;
          const c = Math.exp(-(dr * dr) / (e.w * e.w)) * ouvert * (0.6 + 0.4 * tx(T.c, a * 6 + e.s, 1));
          if (c > 0.01) { r += (0.05 - r) * c * 0.45; g += (0.028 - g) * c * 0.45; b += (0.014 - b) * c * 0.45; }
        } else if (e.t === 4) { // peinture : une goutte, un éclat
          const d = Math.hypot(X - e.x, Y - e.y) - e.r;
          if (d < p) {
            const c = clamp01(0.5 - d / p) * e.o;
            r += (e.c[0] - r) * c; g += (e.c[1] - g) * c; b += (e.c[2] - b) * c;
            ro = lerp(ro, 0.35, c);
            z += 0.08 * c;
          }
        }
      }
    }
    S.r = r; S.g = g; S.b = b;
    S.ro = ro;
    S.f0 = 0.035 + colle * 0.02;
    S.z = z;
    S.ev = 0.7;
  }

  function* modeleEtabli(graine) {
    return yield* modele('etabli:' + graine, function* () {
      yield* tuiles();
      const rng = R.rng(graine * 7919 + 13);
      const o = [];
      for (let i = 0; i < 8; i++) o.push(rng() * 256);
      const C = cases(-1100, -900, 1100, 900, 40);
      // rayures
      for (let i = 0; i < 900; i++) {
        const x = rng.range(-1000, 1000), y = rng.range(-800, 800);
        const a = rng() < 0.6 ? rng.range(-0.3, 0.3) + (rng() < 0.5 ? 0 : Math.PI / 2) : rng() * TAU;
        const l = rng.range(6, 42);
        const x1 = x + Math.cos(a) * l, y1 = y + Math.sin(a) * l;
        C.ajoute(Math.min(x, x1) - 1, Math.min(y, y1) - 1, Math.max(x, x1) + 1, Math.max(y, y1) + 1, { t: 0, x0: x, y0: y, x1, y1, w: rng.range(0.15, 0.45) });
      }
      yield;
      // bosses et coups de marteau (souvent en grappes : on frappe au même endroit)
      for (let i = 0; i < 70; i++) {
        const gx = rng.range(-950, 950), gy = rng.range(-750, 750), n = rng.int(1, 5);
        for (let k = 0; k < n; k++) {
          const e = { t: 1, x: gx + rng.range(-14, 14), y: gy + rng.range(-14, 14), r: rng() < 0.3 ? rng.range(6, 12) : rng.range(1.2, 3.5), p: rng.range(0.1, 0.35) };
          C.ajoute(e.x - e.r - 2, e.y - e.r - 2, e.x + e.r + 2, e.y + e.r + 2, e);
        }
      }
      // coulures de colle
      for (let i = 0; i < 90; i++) {
        const e = { t: 2, x: rng.range(-1000, 1000), y: rng.range(-800, 800), r: rng.range(1.2, 5), k: rng.range(0.6, 1.8), h: rng.range(0.15, 0.5), s: rng() * 99 };
        C.ajoute(e.x - e.r * 2.5, e.y - e.r * 2.5, e.x + e.r * 2.5, e.y + e.r * 2.5, e);
      }
      // ronds de tasse
      for (let i = 0; i < 6; i++) {
        const e = { t: 3, x: rng.range(-800, 800), y: rng.range(-600, 600), R: rng.range(38, 44), w: rng.range(1.2, 2.2), a: rng() * TAU, s: rng() * 99 };
        C.ajoute(e.x - e.R - 6, e.y - e.R - 6, e.x + e.R + 6, e.y + e.R + 6, e);
      }
      // éclaboussures de peinture (blanc de tranche, rouge, un peu de bleu)
      const cols = [lin('#e7e2d4'), lin('#a8322a'), lin('#e7e2d4'), lin('#34518c'), lin('#1a1a1a')];
      for (let i = 0; i < 26; i++) {
        const gx = rng.range(-1000, 1000), gy = rng.range(-800, 800), c = rng.pick(cols), n = rng.int(1, 9);
        for (let k = 0; k < n; k++) {
          const e = { t: 4, x: gx + rng.range(-9, 9), y: gy + rng.range(-9, 9), r: k ? rng.range(0.3, 1.4) : rng.range(1.2, 3.8), c, o: rng.range(0.6, 0.95) };
          C.ajoute(e.x - e.r - 1, e.y - e.r - 1, e.x + e.r + 1, e.y + e.r + 1, e);
        }
      }
      yield;
      return { o, cases: C };
    });
  }

  /* ---------- le tapis de découpe ---------- */
  const TAPIS = lin('#2e5b4c');
  const ENCRE = lin('#bcd6b0'), ENCRE_J = lin('#d9d98e'), ENCRE_C = lin('#cfe0b6');
  const COUPE = lin('#7fac98'), COUPE_F = lin('#1d3a30'), COLLE_T = lin('#b8a472'), SALE = lin('#1c2a24'), RAPE = lin('#5d7d70');

  /* une tache irrégulière (un polygone bruité) */
  function tachePoly(g, rng, x, y, r, n = 22, irr = 0.32) {
    const a0 = rng() * TAU, h = [];
    for (let k = 0; k < 4; k++) h.push([rng() * TAU, rng.range(0.4, 1) * irr, rng.int(2, 5)]);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * TAU;
      let rr = r;
      for (const [ph, amp, f] of h) rr *= 1 + amp * 0.5 * Math.sin(a * f + ph);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
  }

  /** le modèle du tapis : W × H mm (A2 par défaut), graduations le long du haut et de la gauche ; usé */
  function* modeleTapis(graine, W = 600, H = 450) {
    return yield* modele('tapis:' + graine + ':' + W + 'x' + H + ':' + empreinteP(), function* () {
      yield* tuiles();
      yield* polices();
      const rng = R.rng(graine * 104729 + 7);
      const hw = W / 2, hh = H / 2, m = 15; // la bande graduée
      const gx0 = -hw + m, gy0 = -hh + m, gx1 = hw - m, gy1 = hh - m;
      const res = 6;
      const num = (g, x, y, v, rot) => {
        const gros = v % 5 === 0;
        g.save();
        g.translate(x, y);
        if (rot) g.rotate(rot);
        g.font = (gros ? '700 ' : '500 ') + (gros ? 3.9 : 2.7) + 'px ' + POLICE.chiffres;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(v), 0, 0);
        g.restore();
      };
      const haut = yield* R.masqueG([-hw, -hh, hw, gy0 + 0.5], res, (g) => {
        for (let v = 1; v * 10 < gx1 - gx0; v++) num(g, gx0 + v * 10, -hh + 5.6, v, 0);
      });
      const gauche = yield* R.masqueG([-hw, -hh, gx0 + 0.5, hh], res, (g) => {
        for (let v = 1; v * 10 < gy1 - gy0; v++) num(g, -hw + 5.6, gy0 + v * 10, v, -Math.PI / 2);
      });
      // les coupes : denses là où l'on travaille (au milieu), dans tous les sens ; quelques rainures profondes
      const CC = cases(-hw - 5, -hh - 5, hw + 5, hh + 5, 25);
      const nc = Math.round((W * H) / 170);
      const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5;
      for (let i = 0; i < nc; i++) {
        const centre = rng() < 0.6;
        const cx = centre ? gauss() * hw * 0.55 : rng.range(-hw * 0.95, hw * 0.95);
        const cy = centre ? gauss() * hh * 0.5 : rng.range(-hh * 0.95, hh * 0.95);
        const u = rng();
        const a = u < 0.5 ? (rng() < 0.5 ? 0 : Math.PI / 2) + rng.range(-0.03, 0.03) : u < 0.62 ? Math.PI / 4 * (rng() < 0.5 ? 1 : 3) + rng.range(-0.05, 0.05) : rng() * TAU;
        const l = rng() < 0.15 ? rng.range(80, 280) : rng.range(6, 70);
        const x1 = cx + Math.cos(a) * l, y1 = cy + Math.sin(a) * l;
        const prof = rng() < 0.07;
        CC.ajoute(Math.min(cx, x1) - 1, Math.min(cy, y1) - 1, Math.max(cx, x1) + 1, Math.max(cy, y1) + 1, [cx, cy, x1, y1, prof ? rng.range(0.32, 0.5) : rng.range(0.08, 0.2), prof ? 1 : 0]);
        if ((i & 255) === 255) yield;
      }
      // les entailles du bord (un coup de cutter qui a dérapé)
      const entailles = [[], [], [], []]; // haut, droite, bas, gauche : { u, w, p }
      for (let k = 0; k < 4; k++) {
        const L = k % 2 ? H : W;
        for (let u = -L / 2 + rng.range(10, 60); u < L / 2; u += rng.range(35, 110)) entailles[k].push({ u, w: rng.range(0.8, 2.6), p: rng.range(0.6, 2.2) });
      }
      // le calque des taches (dessiné au canvas, en couleur)
      const tr = R.rng(graine * 31 + 3);
      const deco = yield* R.imageG([-hw, -hh, hw, hh], 2, function* (g) {
        // teinture et cirage : noir, brun, bordeaux ; un cerne plus foncé au bord, des gouttelettes autour
        const encres = [[12, 10, 9], [52, 26, 14], [70, 16, 24], [12, 10, 9], [40, 22, 12]];
        for (let i = 0; i < 9; i++) {
          const x = tr.range(-hw * 0.9, hw * 0.9), y = tr.range(-hh * 0.9, hh * 0.9), r = tr.range(3, 16), e = tr.pick(encres);
          const c = 'rgba(' + e.join(',') + ',';
          // la teinture a bu dans le tapis : des couches inégales, un cerne plus sombre là où elle a séché
          for (let k = 0; k < 4; k++) {
            g.fillStyle = c + tr.range(0.14, 0.26).toFixed(2) + ')';
            tachePoly(g, tr, x + tr.range(-1.5, 1.5), y + tr.range(-1.5, 1.5), r * tr.range(0.7, 1));
            g.fill();
          }
          g.strokeStyle = c + '0.55)';
          g.lineWidth = tr.range(0.4, 0.9);
          tachePoly(g, tr, x, y, r * 0.98);
          g.stroke();
          g.fillStyle = c + '0.5)';
          for (let k = 0; k < tr.int(2, 9); k++) {
            const a = tr() * TAU, d = r * tr.range(1.1, 2.4);
            g.beginPath();
            g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, tr.range(0.3, 1.5), 0, TAU);
            g.fill();
          }
        }
        yield;
        // des traînées de cirage (un doigt essuyé)
        for (let i = 0; i < 5; i++) {
          const x = tr.range(-hw * 0.8, hw * 0.8), y = tr.range(-hh * 0.8, hh * 0.8), a = tr() * TAU, l = tr.range(15, 45);
          const gr = g.createLinearGradient(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
          gr.addColorStop(0, 'rgba(20,12,8,0.5)');
          gr.addColorStop(1, 'rgba(20,12,8,0)');
          g.strokeStyle = gr;
          g.lineWidth = tr.range(6, 12);
          g.beginPath();
          g.moveTo(x, y);
          g.quadraticCurveTo(x + Math.cos(a + 0.4) * l * 0.5, y + Math.sin(a + 0.4) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
          g.stroke();
        }
        // un point de peinture de tranche blanche, et un plus petit
        for (let i = 0; i < 2; i++) {
          const x = tr.range(-hw * 0.7, hw * 0.7), y = tr.range(-hh * 0.7, hh * 0.7);
          g.fillStyle = 'rgba(236,230,214,0.92)';
          tachePoly(g, tr, x, y, tr.range(1.8, 3.2), 16, 0.18);
          g.fill();
          g.beginPath();
          g.arc(x + tr.range(4, 8), y + tr.range(-3, 3), tr.range(0.5, 1), 0, TAU);
          g.fill();
        }
        // une brûlure (le fer à tranche posé trop longtemps) : centre brun-noir, auréole
        {
          const x = tr.range(-hw * 0.6, hw * 0.6), y = tr.range(-hh * 0.6, hh * 0.6), r = tr.range(7, 12);
          const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.8);
          gr.addColorStop(0, 'rgba(18,9,4,0.95)');
          gr.addColorStop(0.4, 'rgba(40,20,8,0.85)');
          gr.addColorStop(0.62, 'rgba(95,62,28,0.5)');
          gr.addColorStop(1, 'rgba(95,62,28,0)');
          g.fillStyle = gr;
          tachePoly(g, tr, x, y, r * 1.8, 26, 0.25);
          g.fill();
        }
        yield;
        // le ruban de masquage arraché : un rectangle pâle, les bords poisseux
        for (let i = 0; i < 2; i++) {
          const x = tr.range(-hw * 0.8, hw * 0.8), y = tr.range(-hh * 0.8, hh * 0.8), a = tr.range(-0.4, 0.4) + (tr() < 0.5 ? 0 : Math.PI / 2);
          g.save();
          g.translate(x, y);
          g.rotate(a);
          const l = tr.range(30, 60);
          g.fillStyle = 'rgba(215,200,160,0.09)';
          g.beginPath();
          g.moveTo(-l / 2, -9.5);
          g.lineTo(l / 2, -9.5);
          for (let k = 0; k <= 6; k++) g.lineTo(l / 2 + tr.range(-1.5, 1.5), -9.5 + k * 3.17);
          g.lineTo(-l / 2, 9.5);
          for (let k = 6; k >= 0; k--) g.lineTo(-l / 2 + tr.range(-1.5, 1.5), -9.5 + k * 3.17);
          g.closePath();
          g.fill();
          g.strokeStyle = 'rgba(40,36,30,0.3)';
          g.lineWidth = 0.8;
          g.stroke();
          g.restore();
        }
        // la poussière de ponçage : un nuage fin, gris-brun
        for (let i = 0; i < 2; i++) {
          const x = tr.range(-hw * 0.8, hw * 0.8), y = tr.range(-hh * 0.8, hh * 0.8), r = tr.range(25, 50);
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, 'rgba(150,132,112,0.2)');
          gr.addColorStop(1, 'rgba(150,132,112,0)');
          g.fillStyle = gr;
          g.fillRect(x - r, y - r, 2 * r, 2 * r);
          g.fillStyle = 'rgba(160,140,118,0.35)';
          for (let k = 0; k < 160; k++) {
            const a = tr() * TAU, d = r * Math.sqrt(tr()) * 0.9;
            g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, tr.range(0.2, 0.6), tr.range(0.2, 0.6));
          }
        }
        yield;
        // des éraflures pâles (la surface usée)
        g.strokeStyle = 'rgba(190,215,195,0.07)';
        for (let i = 0; i < 70; i++) {
          const x = gauss() * hw * 0.5, y = gauss() * hh * 0.5, a = tr() * TAU, l = tr.range(8, 30);
          g.lineWidth = tr.range(1, 4);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        // le crayon et le stylo : un trait de mesure et ses repères, un bout de patron, des chiffres, un gribouillis bleu
        g.strokeStyle = 'rgba(70,72,76,0.6)';
        g.lineWidth = 0.35;
        for (let i = 0; i < 4; i++) {
          const x = tr.range(-hw * 0.75, hw * 0.75), y = tr.range(-hh * 0.75, hh * 0.75), a = tr() < 0.6 ? 0 : tr() * TAU, l = tr.range(30, 110);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
          for (let k = 0; k < 4; k++) {
            const t = tr(), px = x + Math.cos(a) * l * t, py = y + Math.sin(a) * l * t;
            g.beginPath(); g.moveTo(px - Math.sin(a) * 2.5, py + Math.cos(a) * 2.5); g.lineTo(px + Math.sin(a) * 2.5, py - Math.cos(a) * 2.5); g.stroke();
          }
        }
        {
          const x = tr.range(-hw * 0.5, hw * 0.5), y = tr.range(-hh * 0.5, hh * 0.5);
          g.beginPath();
          g.ellipse(x, y, tr.range(35, 60), tr.range(16, 24), tr.range(-0.3, 0.3), 0.3, 4.4);
          g.stroke();
        }
        g.fillStyle = 'rgba(70,72,76,0.62)';
        const notes = ['42', '7,5', '38 ½', '30 €', 'x2', 'mardi'];
        for (let i = 0; i < 3; i++) {
          g.save();
          g.translate(tr.range(-hw * 0.8, hw * 0.8), tr.range(-hh * 0.8, hh * 0.8));
          g.rotate(tr.range(-0.5, 0.5));
          g.font = '600 ' + tr.range(5, 8).toFixed(1) + 'px ' + POLICE.main;
          g.fillText(tr.pick(notes), 0, 0);
          g.restore();
        }
        g.strokeStyle = 'rgba(30,48,130,0.55)';
        g.lineWidth = 0.4;
        {
          let x = tr.range(-hw * 0.7, hw * 0.7), y = tr.range(-hh * 0.7, hh * 0.7);
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 14; k++) { x += tr.range(-4, 6); y += tr.range(-3, 3); g.lineTo(x, y); }
          g.stroke();
        }
        yield;
        // des miettes de gomme et de cuir (petits éclats sombres), en grappes
        for (let i = 0; i < 7; i++) {
          const x = tr.range(-hw * 0.85, hw * 0.85), y = tr.range(-hh * 0.85, hh * 0.85);
          for (let k = 0; k < tr.int(8, 26); k++) {
            const a = tr() * TAU, d = tr.range(0, 14) * tr();
            g.fillStyle = tr() < 0.75 ? 'rgba(18,17,16,0.92)' : 'rgba(92,58,34,0.9)';
            tachePoly(g, tr, x + Math.cos(a) * d, y + Math.sin(a) * d, tr.range(0.25, 1.1), 7, 0.5);
            g.fill();
          }
        }
      });
      // la colle néoprène : traînées étalées au pinceau, filaments séchés (brillants, un peu en relief)
      const glu = yield* R.masqueG([-hw, -hh, hw, hh], 2, (g) => {
        for (let i = 0; i < 6; i++) {
          const x = tr.range(-hw * 0.8, hw * 0.8), y = tr.range(-hh * 0.8, hh * 0.8);
          g.globalAlpha = tr.range(0.45, 0.8);
          tachePoly(g, tr, x, y, tr.range(4, 14), 18, 0.45);
          g.fill();
          // la traînée du pinceau qui repart
          g.lineWidth = tr.range(2, 5);
          g.beginPath();
          g.moveTo(x, y);
          const a = tr() * TAU, l = tr.range(10, 35);
          g.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.6, y + Math.sin(a + 0.5) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
          g.stroke();
        }
        g.globalAlpha = 0.85;
        for (let i = 0; i < 9; i++) { // les fils de colle contact
          let x = tr.range(-hw * 0.8, hw * 0.8), y = tr.range(-hh * 0.8, hh * 0.8), a = tr() * TAU;
          g.lineWidth = tr.range(0.3, 0.8);
          g.beginPath();
          g.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            const l = tr.range(6, 18), a2 = a + tr.range(-1.2, 1.2);
            g.quadraticCurveTo(x + Math.cos(a2) * l * 0.7, y + Math.sin(a2) * l * 0.7, x + Math.cos(a) * l, y + Math.sin(a) * l);
            x += Math.cos(a) * l; y += Math.sin(a) * l; a += tr.range(-0.8, 0.8);
          }
          g.stroke();
        }
        g.globalAlpha = 1;
      }, 3, true);
      const o = [];
      for (let i = 0; i < 8; i++) o.push(rng() * 256);
      return { W, H, hw, hh, m, gx0, gy0, gx1, gy1, haut, gauche, coupes: CC, entailles, deco, glu, o };
    });
  }

  /** la surface du tapis au point (x, y) de son repère (mm) → ardoise ; coin : le coin qui rebique (0..3) ou −1 */
  function surfaceTapis(M, x, y, S, coin = -1) {
    let d = geo.boite(x, y, M.hw, M.hh, 7);
    // les entailles du bord
    const e0 = -d;
    if (e0 < 3 && e0 > -1) {
      const dh = y + M.hh, dd = M.hw - x, db = M.hh - y, dg = x + M.hw;
      const mn = Math.min(dh, dd, db, dg);
      const k = mn === dh ? 0 : mn === dd ? 1 : mn === db ? 2 : 3;
      const u = k === 0 ? x : k === 1 ? y : k === 2 ? -x : -y;
      const L = M.entailles[k];
      for (let i = 0; i < L.length; i++) {
        const t = (u - L[i].u) / L[i].w;
        if (t > -1 && t < 1) d = Math.max(d, -(e0 - L[i].p * (1 - t * t)));
      }
    }
    S.d = d;
    if (d > S.lim) return;
    const e = -d, p = 1 / S.ppm, o = M.o;
    S.z = R.bord(e, 0.9, 2.4);
    // le coin qui rebique (le tapis a pris l'humidité, ou on l'a trop roulé)
    if (coin >= 0) {
      const sx = coin === 1 || coin === 2 ? 1 : -1, sy = coin >= 2 ? 1 : -1;
      const t = ((M.hw - sx * x) + (M.hh - sy * y)) * Math.SQRT1_2;
      if (t < 75) { const q = 1 - t / 75; S.z += 9 * q * q * q; }
    }
    // la matière : PVC vert, légèrement marbré, usé au centre
    const n1 = tx(T.a, x * 0.02 + o[0], y * 0.02 + o[1]);
    const n2 = tx(T.c, x * 0.3 + o[2], y * 0.3 + o[3]);
    const use = sstep(0.1, 0.9, 1 - Math.hypot(x / M.hw, y / M.hh) * 0.9 + n1 * 0.4);
    const k0 = 1 + n1 * 0.07 + n2 * 0.035 + use * 0.05;
    let r = TAPIS[0] * k0, g = TAPIS[1] * k0, b = TAPIS[2] * k0;
    // l'impression : quadrillage (1 cm, plus marqué tous les 5 cm), diagonales, graduations, chiffres
    let ink = 0, inkJ = 0;
    const gx = x - M.gx0, gy = y - M.gy0;
    const dedans = x > M.gx0 - 0.3 && x < M.gx1 + 0.3 && y > M.gy0 - 0.3 && y < M.gy1 + 0.3;
    if (dedans) {
      const fx = gx - Math.round(gx / 10) * 10, fy = gy - Math.round(gy / 10) * 10;
      const mx = Math.round(gx / 10) % 5 === 0, my = Math.round(gy / 10) % 5 === 0;
      const cx = R.trait(fx, mx ? 0.55 : 0.3, p), cy = R.trait(fy, my ? 0.55 : 0.3, p);
      ink = Math.max(cx, cy) * (mx || my ? 1 : 0.85);
      const lodH = S.ppm < 2.4 ? 0 : R.lod(5, S.ppm);
      if (lodH > 0) {
        const hx = gx - 5 - Math.round((gx - 5) / 10) * 10, hy = gy - 5 - Math.round((gy - 5) / 10) * 10;
        const c2 = Math.max(gy - 2 * Math.floor(gy / 2) < 1 ? R.trait(hx, 0.18, p) : 0, gx - 2 * Math.floor(gx / 2) < 1 ? R.trait(hy, 0.18, p) : 0) * 0.55 * lodH;
        if (c2 > ink) ink = c2;
      }
      const s2 = Math.SQRT1_2, lim = p + 0.3;
      const d45a = (gx - gy) * s2, d45b = (M.gx1 - M.gx0 - gx - gy) * s2;
      const d60 = gx * 0.866 - gy * 0.5, d30 = gx * 0.5 - gy * 0.866;
      if (d45a < lim && d45a > -lim) inkJ = R.trait(d45a, 0.3, p);
      if (d45b < lim && d45b > -lim) inkJ = Math.max(inkJ, R.trait(d45b, 0.3, p));
      if (d60 < lim && d60 > -lim) inkJ = Math.max(inkJ, R.trait(d60, 0.26, p) * 0.9);
      if (d30 < lim && d30 > -lim) inkJ = Math.max(inkJ, R.trait(d30, 0.26, p) * 0.8);
    }
    if (y < M.gy0 && y > -M.hh + 1 && x > M.gx0 - 0.5 && x < M.gx1 + 0.5) {
      const mm = Math.round(gx), dd = gx - mm, lg = mm % 10 === 0 ? 6 : mm % 5 === 0 ? 4 : 2.4;
      const lod1 = mm % 5 === 0 ? 1 : R.lod(1, S.ppm) * 0.9;
      if (M.gy0 - y < lg) ink = Math.max(ink, R.trait(dd, mm % 10 === 0 ? 0.3 : 0.2, p) * lod1 + (1 - lod1) * 0.08);
      ink = Math.max(ink, M.haut.get(x, y));
    }
    if (x < M.gx0 && x > -M.hw + 1 && y > M.gy0 - 0.5 && y < M.gy1 + 0.5) {
      const mm = Math.round(gy), dd = gy - mm, lg = mm % 10 === 0 ? 6 : mm % 5 === 0 ? 4 : 2.4;
      const lod1 = mm % 5 === 0 ? 1 : R.lod(1, S.ppm) * 0.9;
      if (M.gx0 - x < lg) ink = Math.max(ink, R.trait(dd, mm % 10 === 0 ? 0.3 : 0.2, p) * lod1 + (1 - lod1) * 0.08);
      ink = Math.max(ink, M.gauche.get(x, y));
    }
    // l'encre s'efface là où l'on coupe et où la main glisse (par plaques)
    const frotte = sstep(0.12, 0.62, tx(T.d, x * 0.016 + o[5], y * 0.016 + o[6]) * 0.6 + use * 0.5 + tx(T.b, x * 0.06 + o[6], y * 0.06) * 0.25);
    const usure = 1 - frotte * 0.88;
    ink = Math.min(1, ink) * usure * 0.82;
    inkJ = Math.min(1, inkJ) * usure * 0.72;
    if (inkJ > 0) { r += (ENCRE_J[0] - r) * inkJ; g += (ENCRE_J[1] - g) * inkJ; b += (ENCRE_J[2] - b) * inkJ; }
    if (ink > 0) {
      const E = y < M.gy0 || x < M.gx0 ? ENCRE_C : ENCRE;
      r += (E[0] - r) * ink; g += (E[1] - g) * ink; b += (E[2] - b) * ink;
    }
    // les coupes du cutter : fines et claires (les lèvres accrochent la lumière) ; les rainures profondes, sombres
    let z = S.z, ro = 0.62 + n2 * 0.06;
    const L = M.coupes.lire(x, y);
    if (L) {
      let c = 0, cp = 0;
      for (let k = 0; k < L.length; k++) {
        const s = L[k], x0 = s[0], y0 = s[1], x1 = s[2], y1 = s[3];
        if ((x < x0 - 1 && x < x1 - 1) || (x > x0 + 1 && x > x1 + 1) || (y < y0 - 1 && y < y1 - 1) || (y > y0 + 1 && y > y1 + 1)) continue;
        const dd = geo.seg(x, y, x0, y0, x1, y1);
        if (dd > 1) continue;
        const cv = R.trait(dd, s[4], p);
        if (s[5]) { if (cv > cp) cp = cv; } else if (cv > c) c = cv;
      }
      if (c > 0) { const kc = Math.min(1, c * 1.15); r += (COUPE[0] - r) * kc; g += (COUPE[1] - g) * kc; b += (COUPE[2] - b) * kc; z -= c * 0.07; }
      if (cp > 0) { r += (COUPE_F[0] - r) * cp * 0.6; g += (COUPE_F[1] - g) * cp * 0.6; b += (COUPE_F[2] - b) * cp * 0.6; z -= cp * 0.3; ro += cp * 0.2; }
    }
    // la zone de travail, au milieu : la surface râpée par des milliers de coupes (plus claire, plus mate)
    const rape = use * sstep(0.15, 0.65, tx(T.a, x * 0.025 + o[3], y * 0.025 + o[4]) * 0.6 + 0.35) * (0.6 + 0.4 * n2);
    if (rape > 0) { r += (RAPE[0] - r) * rape * 0.35; g += (RAPE[1] - g) * rape * 0.35; b += (RAPE[2] - b) * rape * 0.35; ro += rape * 0.1; }
    // la crasse : plus sombre au bord, et quelques traînées
    const sale = sstep(0.35, 0.8, tx(T.b, x * 0.04 + o[4], y * 0.04 + o[5]) * 0.6 + (1 - Math.min(1, e / 25)) * 0.5 + n2 * 0.2);
    if (sale > 0) { const ks = sale * 0.45; r += (SALE[0] - r) * ks; g += (SALE[1] - g) * ks; b += (SALE[2] - b) * ks; }
    // le calque des taches (teinture, brûlure, peinture, crayon, ruban, poussière, miettes)
    const P = M.deco.lire(x, y);
    if (P[3] > 0.004) {
      const a = P[3];
      const c0 = LIN8[(P[0] * 255) | 0], c1 = LIN8[(P[1] * 255) | 0], c2 = LIN8[(P[2] * 255) | 0];
      r += (c0 - r) * a; g += (c1 - g) * a; b += (c2 - b) * a;
      z += a * (P[0] + P[1] + P[2] < 0.25 ? 0.12 : 0.03);
      ro -= a * 0.1;
    }
    // la colle néoprène séchée : ambrée, translucide, brillante, en relief
    const gl = M.glu.get(x, y);
    if (gl > 0.01) {
      const ep = gl * (0.55 + 0.45 * tx(T.c, x * 0.35 + o[1], y * 0.35 + o[2]));
      const cerne = gl * (1 - gl) * 4; // le bord de la flaque, plus épais et plus sombre
      r += (COLLE_T[0] - r) * ep * 0.2; g += (COLLE_T[1] - g) * ep * 0.2; b += (COLLE_T[2] - b) * ep * 0.2;
      r *= 1 - cerne * 0.25; g *= 1 - cerne * 0.25; b *= 1 - cerne * 0.3;
      ro = lerp(ro, 0.14, gl);
      z += ep * 0.3 + cerne * 0.08;
    }
    S.r = r; S.g = g; S.b = b;
    S.ro = ro;
    S.f0 = 0.04;
    S.z = z;
    S.ev = 0.85;
  }
  const LIN8 = R.LIN8;

  /**
   * Le fond de la scène (générateur → sprite opaque, .canvas) :
   *   cadre : { bx0, by0, w, h } (le coin haut-gauche en mm du monde, la taille en px) ; ppm ; graine
   *   tapis : { x, y, angle (rad), W, H, coin } | null ; avant : y (mm) du bord avant de l'établi
   *   oeil : { x, y } (l'appareil photo) ; lumiere(X, Y) facultatif
   *   encombrement : [{ id, x, y, angle (degrés, monde), graine }] — posés dans cet ordre, cuits dans le fond
   */
  function* fond(o) {
    yield* tuiles();
    const graine = o.graine || 63;
    const ME = yield* modeleEtabli(graine);
    const tp = o.tapis || null;
    const MT = tp ? yield* modeleTapis(graine, tp.W || 600, tp.H || 450) : null;
    const coin = tp && tp.coin != null ? tp.coin : -1;
    const avant = o.avant != null ? o.avant : null;
    const couches = [];
    const ca = tp ? Math.cos(tp.angle || 0) : 1, sa = tp ? Math.sin(tp.angle || 0) : 0;
    couches.push({
      f(X, Y, S) {
        let dm = 99;
        if (MT) {
          const dx = X - tp.x, dy = Y - tp.y, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
          dm = geo.boite(u, v, MT.hw, MT.hh, 7);
          if (dm < -3) { S.d = 9; return; } // sous le tapis : rien à peindre
        }
        S.d = -1000;
        surfaceEtabli(ME, X, Y, S, avant);
        if (dm > 0 && dm < 6) S.ao = 0.5 + 0.5 * sstep(0, 6, dm);
      },
    });
    if (MT) {
      const hw = MT.hw + 1, hh = MT.hh + 1;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [u, v] of [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]]) {
        const X = tp.x + u * ca - v * sa, Y = tp.y + u * sa + v * ca;
        bx0 = Math.min(bx0, X); bx1 = Math.max(bx1, X); by0 = Math.min(by0, Y); by1 = Math.max(by1, Y);
      }
      couches.push({
        box: [bx0, by0, bx1, by1],
        f(X, Y, S) {
          const dx = X - tp.x, dy = Y - tp.y;
          surfaceTapis(MT, dx * ca + dy * sa, -dx * sa + dy * ca, S, coin);
        },
      });
    }
    yield 'fond:rendu';
    const sp = yield* R.rendre({
      cadre: o.cadre, ppm: o.ppm, couches, opaque: true, cavite: false, soleil: 0.5, ombre: false,
      sol: MT ? [TAPIS[0] * 0.5, TAPIS[1] * 0.5, TAPIS[2] * 0.5] : null, lumiere: o.lumiere || null,
      oeil: o.oeil || null,
    });
    // l'encombrement : chaque objet (déjà en cache, ou calculé ici), son ombre sur ce qui est dessous, puis lui
    const L = o.encombrement || [];
    if (L.length) {
      const g = sp.canvas.getContext('2d');
      const bx0 = o.cadre.bx0, by0 = o.cadre.by0, ppm = o.ppm;
      for (const it of L) {
        if (!DEFS[it.id]) continue;
        yield 'encombrement:' + it.id;
        const opts = { ppm, angle: it.angle || 0, graine: it.graine || graine, oeil: it.oeil || null };
        const k = cleDe(it.id, opts);
        let obj = R.cache.get(k);
        if (!obj) obj = R.cache.set(k, yield* construire(it.id, opts));
        R.poser(g, obj, (it.x - bx0) * ppm, (it.y - by0) * ppm, { s: ppm / obj.ppm });
      }
    }
    return sp;
  }

  /* ======================================================================
     3. Les objets
     ====================================================================== */
  const DEFS = {};
  const LISTE = [];
  /**
   * def(id, nom, dim [long, larg, haut], son, construire)
   * construire(o) : générateur → { box, couches, haut, cavite, soleil, ombre, adoucir }
   */
  function def(id, nom, dim, son, construire, extra) {
    DEFS[id] = Object.assign({ id, nom, dim, son, construire }, extra || {});
    LISTE.push({ id, nom, dim, categorie: 'outil' });
  }

  /* ---------- le tapis et l'établi, en objets (pour la planche) ---------- */
  def('tapis', 'Tapis de découpe (A2)', [600, 450, 2.4], 'flick', function* (o) {
    const M = yield* modeleTapis(o.graine, 600, 450);
    return {
      box: [-301, -226, 301, 226], haut: 2.4,
      couches: [{ box: [-301, -226, 301, 226], f: (x, y, S) => surfaceTapis(M, x, y, S) }],
      cavite: false, soleil: 0.5, ombre: { opacite: 0.5, contact: 0.55 },
    };
  });
  def('etabli', "Plateau d'aggloméré", [500, 360, 0], null, function* (o) {
    const M = yield* modeleEtabli(o.graine);
    return {
      box: [-250, -180, 250, 180], haut: 0,
      couches: [{ box: [-250, -180, 250, 180], f(x, y, S) { S.d = geo.boite(x, y, 250, 180, 2); if (S.d > S.lim) return; surfaceEtabli(M, x, y, S); } }],
      cavite: false, soleil: false, ombre: false,
    };
  });

  /* ---------- le réglet : acier inoxydable brossé, graduations gravées, 30 cm ---------- */
  def('reglet', 'Réglet acier 30 cm', [320, 25, 1], 'punch', function* (o) {
    yield* tuiles();
    const M = yield* modele('reglet:' + o.graine + ':' + empreinteP(), function* () {
      yield* polices();
      const rng = R.rng(o.graine * 31 + 5);
      const res = 9;
      const txt = yield* R.masqueG([-160, -12.5, 160, 12.5], res, (g) => {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (let v = 1; v <= 30; v++) {
          g.font = '600 ' + (v % 5 === 0 ? 3.3 : 2.9) + 'px ' + POLICE.chiffres;
          g.fillText(String(v), -155 + v * 10, -4.6);
        }
        g.font = '600 2.2px ' + POLICE.chiffres;
        g.fillText('0', -155 + 1.8, -4.6);
        g.font = '500 2.3px ' + POLICE.chiffres;
        g.textAlign = 'left';
        g.fillText('INOX  ·  300 mm', -148, 5.6);
        g.textAlign = 'center';
        g.font = '600 2.3px ' + POLICE.chiffres;
        g.fillText('cm', 151.5, -4.6);
      });
      yield;
      const ray = listeRayures(rng, 60, [-155, -11, 155, 11], 3, 28, 0.08, 0, 0.25);
      const o2 = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
      return { txt, ray, o: o2 };
    });
    const x0 = -155; // le zéro de l'échelle
    return {
      box: [-160.5, -13, 160.5, 13], haut: 1,
      couches: [{
        box: [-160.5, -13, 160.5, 13],
        f(x, y, S) {
          let d = geo.boite(x, y, 160, 12.5, 1.4);
          d = Math.max(d, -(Math.hypot(x - 151.5, y - 5.2) - 3));
          S.d = d;
          if (d > S.lim) return;
          const p = 1 / S.ppm, e = -d;
          S.z = R.bord(e, 0.35, 0.95);
          // brossage le long de la règle
          const st = tx(T.e, x * 0.08 + M.o[0], y * 7 + M.o[1]) * 0.6 + tx(T.c, x * 0.03 + M.o[2], y * 3 + M.o[3]) * 0.4;
          R.mat(S, MAT.acierBrosse, 1.08 + st * 0.06, st * 0.06);
          S.an = 0.2; S.gx = 1; S.gy = 0;
          // gravure : traits (haut : 1 mm / 5 mm / 1 cm ; bas : 1 mm / 5 mm / 1 cm) et chiffres
          let gr = 0;
          const u = x - x0;
          if (u > -0.3 && u < 300.3) {
            const m = Math.round(u), dd = u - m;
            const lg = m % 10 === 0 ? 5.6 : m % 5 === 0 ? 4 : 2.7;
            const lod1 = m % 5 === 0 ? 1 : R.lod(1, S.ppm);
            const tr = R.trait(dd, m % 10 === 0 ? 0.24 : 0.17, p);
            if (y < -12.5 + lg) gr = Math.max(gr, tr * lod1 + (1 - lod1) * 0.12 * (y < -12.5 + 2.7 ? 1 : 0));
            const lb = m % 10 === 0 ? 4.4 : m % 5 === 0 ? 3.2 : 2.2;
            if (y > 12.5 - lb) gr = Math.max(gr, tr * lod1 + (1 - lod1) * 0.12 * (y > 12.5 - 2.2 ? 1 : 0));
          }
          gr = Math.max(gr, M.txt.get(x, y));
          // crasse : quelques voiles sombres (colle, doigts) et rayures fines
          const cr = sstep(0.25, 0.75, tx(T.a, x * 0.05 + M.o[1], y * 0.05 + M.o[2]) * 0.7 + tx(T.c, x * 0.4, y * 0.4) * 0.3);
          const ry = rayures(M.ray, x, y, p);
          if (cr > 0) { S.r *= 1 - cr * 0.5; S.g *= 1 - cr * 0.52; S.b *= 1 - cr * 0.55; S.ro += cr * 0.2; }
          if (ry > 0) { S.ro += ry * 0.25; S.r *= 1 + ry * 0.15; S.g *= 1 + ry * 0.15; S.b *= 1 + ry * 0.15; }
          if (gr > 0) {
            const k = Math.min(1, gr);
            S.r = lerp(S.r, 0.025, k); S.g = lerp(S.g, 0.022, k); S.b = lerp(S.b, 0.02, k);
            S.me = 1 - k * 0.8;
            S.ro = lerp(S.ro, 0.7, k);
            S.z -= 0.06 * k;
          }
        },
      }],
      cavite: false, soleil: 0.3, ombre: { opacite: 0.55, contact: 0.5 },
    };
  });

  /* ---------- le marteau de cordonnier : tête ronde polie, panne fendue, manche en frêne verni ---------- */
  def('marteau', 'Marteau de cordonnier', [300, 120, 34], 'hammer', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 17 + 3);
    const ob = [rng() * 256, rng() * 256], oc = [rng() * 256, rng() * 256];
    const XH = 127; // l'axe de la tête (le long de y)
    const ZA = 17; // hauteur de l'axe de la tête (le rayon de la face : le marteau repose sur elle)
    // le manche : demi-largeur et demi-épaisseur selon x
    const wM = table(monotone([[-150, 13.2], [-138, 15.2], [-118, 15.8], [-80, 14.6], [-30, 13.0], [30, 11.6], [80, 11.1], [108, 11.9], [145, 11.6]]), -151, 146);
    const zA = (x) => lerp(10.6, ZA, clamp01((x + 150) / (XH + 150)));
    // la tête : demi-largeur (le long du manche), demi-épaisseur (en z), rondeur (1 : section ronde)
    const hwT = table(monotone([[-62, 15.2], [-61, 16.4], [-59.5, 17], [-50, 17], [-46, 16.2], [-41, 13.2], [-33, 10.6], [-25, 11.2], [-20, 12.6], [-17, 12.9], [8, 12.9], [12, 12.2], [30, 14.2], [45, 16.8], [56, 18.4]]), -62, 56);
    const thT = table(monotone([[-62, 15.2], [-59.5, 17], [-50, 17], [-46, 16.2], [-41, 13.2], [-33, 10.6], [-25, 11.2], [-20, 12], [-17, 11.4], [8, 11.4], [14, 10.2], [34, 6.2], [56, 2.6]]), -62, 56);
    const rondT = (v) => (v < -19 ? 1 : v < -15 ? lerp(1, 0.15, (v + 19) / 4) : 0.15);
    const bois = R.matiere('#b19b84', { ro: 0.32, f0: 0.05 });
    return {
      box: [-151, -63, 151, 58], haut: 34,
      couches: [
        { // le manche
          box: [-151, -17, XH + 17, 17],
          f(x, y, S) {
            if (x > XH + 16.5) { S.d = 9; return; }
            const w = wM(x), qx = -(x + 150), qy = Math.abs(y) - w, r = 5;
            const ax = Math.max(qx + r, 0), ay = Math.max(qy + r, 0);
            let d = Math.hypot(ax, ay) + Math.min(Math.max(qx + r, qy + r), 0) - r;
            d = Math.max(d, x - (XH + 15.5));
            S.d = d;
            if (d > S.lim) return;
            const q = Math.min(1, Math.abs(y) / w), bout = clamp01((x + 150) / 5);
            const prof = Math.sqrt(Math.max(0, 1 - q * q)) * Math.sqrt(1 - (1 - bout) * (1 - bout));
            S.z = zA(x) + w * 0.78 * prof;
            // les cernes du frêne, le long du manche ; les pores en petits traits sombres
            const vn = veine(x, y * 1.05, ob, 0.28) * R.lod(1.2, S.ppm);
            const fin = tx(T.e, x * 0.12 + oc[0], y * 3.2 + oc[1]);
            const pore = sstep(0.3, 0.75, fin) * R.lod(0.8, S.ppm) * (0.4 + 0.6 * vn);
            let k = 1.02 - vn * 0.34 - pore * 0.22 + tx(T.b, x * 0.02 + ob[1], y * 0.15) * 0.12;
            // la prise : plus sombre, patinée par les mains ; le vernis usé
            const prise = sstep(-40, -95, x) * (0.6 + 0.4 * tx(T.a, x * 0.05 + oc[1], y * 0.3 + oc[0]));
            k *= 1 - prise * 0.3;
            R.mat(S, bois, k, prise * 0.18 + vn * 0.06);
            S.g *= 0.97 - prise * 0.04 - vn * 0.03; S.b *= 0.9 - prise * 0.1 - vn * 0.08;
            S.z += (pore * -0.03 - vn * 0.02) * R.lod(0.8, S.ppm);
            // taches de colle et de teinture sur le manche
            const t = sstep(0.55, 0.62, tx(T.b, x * 0.08 + oc[0], y * 0.3 + ob[0]));
            if (t > 0) { S.r *= 1 - t * 0.55; S.g *= 1 - t * 0.6; S.b *= 1 - t * 0.6; }
            // le bout du manche qui dépasse de l'œil : bois de bout, un coin d'acier
            if (x > XH + 12.8) {
              const bb = sstep(XH + 12.8, XH + 13.6, x);
              S.r *= 1 - bb * 0.25; S.g *= 1 - bb * 0.3; S.b *= 1 - bb * 0.3; S.ro = lerp(S.ro, 0.7, bb);
              const coin = R.trait(y + 1.5, 1.4, 1 / S.ppm) * bb;
              if (coin > 0) { R.teinte(S, MAT.acierNoir, coin); S.me = coin; S.ro = lerp(S.ro, 0.35, coin); }
            }
          },
        },
        { // la tête
          box: [XH - 19, -63, XH + 19, 57],
          f(x, y, S) {
            const u = x - XH, v = y;
            if (v < -62.5 || v > 56.5) { S.d = 9; return; }
            const hw = hwT(v);
            let d = Math.max(Math.abs(u) - hw, -62 - v, v - 56);
            // la fente de la panne (arrache-clous)
            if (v > 44) {
              const fente = 3.4 * (v - 44) / 12;
              d = Math.max(d, fente - Math.abs(u) - 0.2);
            }
            S.d = d;
            if (d > S.lim) return;
            const th = thT(v), rd = rondT(v);
            const q = Math.min(1, Math.abs(u) / hw);
            const pRond = Math.sqrt(Math.max(0, 1 - q * q));
            const e = hw - Math.abs(u); // profondeur depuis le bord, mm
            const pPlat = Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(1, e / Math.min(th, 3.2)), 2)));
            S.z = ZA + th * (rd * pRond + (1 - rd) * pPlat);
            // la face (chanfrein) : l'arête de la face, polie
            // matières : face et tête polies, col et œil forgés (noirs), panne polie sur ses biseaux
            const n = tx(T.c, u * 0.6 + oc[0], v * 0.6 + oc[1]);
            const poli = v < -45 + n * 2 ? 1 : v > 38 + n * 3 ? 0.85 : 0;
            const tourn = tx(T.e, u * 6 + oc[1], v * 0.12 + oc[0]); // stries de tournage (autour de l'axe)
            if (poli > 0) {
              R.mat(S, MAT.acierPoli, 1 + tourn * 0.05, tourn * 0.03 + (1 - poli) * 0.2);
            } else {
              R.mat(S, MAT.acierNoir, 1 + n * 0.12, n * 0.1);
            }
            // calamine et piqûres du forgé, bords usés plus clairs
            const cal = sstep(0.1, 0.6, tx(T.b, u * 0.3 + ob[0], v * 0.3 + ob[1]));
            if (!poli) { S.r *= 1 - cal * 0.35; S.g *= 1 - cal * 0.35; S.b *= 1 - cal * 0.33; S.ro += cal * 0.1; }
            const arete = sstep(1.2, 0, e) * (1 - poli);
            if (arete > 0) { R.teinte(S, MAT.acierPoli, arete * 0.5); S.ro -= arete * 0.12; }
            // la limite nette entre poli et forgé
            const lim = R.trait(v - (-45 + n * 2), 0.35, 1 / S.ppm);
            if (lim > 0) { S.r *= 1 - lim * 0.5; S.g *= 1 - lim * 0.5; S.b *= 1 - lim * 0.5; }
          },
        },
      ],
      cavite: [2, 0.25], soleil: 1, ombre: { opacite: 0.6, contact: 0.45 },
    };
  });

  /* ---------- les ciseaux : de tailleur (longs, argent) ou à poignées orange ----------
     Repère : le pivot en 0, les lames vers +x. Lame du dessus : dos côté −y ; lame du dessous : dos côté +y.
     Les lames sont légèrement bombées et brossées dans leur longueur ; le fil est un biseau poli. */
  function ciseaux(o, orange) {
    const rng = R.rng(o.graine * 13 + (orange ? 101 : 7));
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const Lb = orange ? 122 : 152; // longueur des lames depuis le pivot
    const W0 = orange ? 10.5 : 12.5; // largeur d'une lame près du pivot
    const dos = table(monotone([[-14, W0 * 0.55], [-4, W0 * 0.96], [8, W0], [Lb * 0.3, W0 * 0.93], [Lb * 0.6, W0 * 0.7], [Lb * 0.85, W0 * 0.4], [Lb - 4, 1.9], [Lb, 0.7]]), -14, Lb);
    const fil = table((x) => 0.9 + 1.5 * clamp01(1 - x / (Lb * 0.85)), -14, Lb);
    const bout = (x) => x - Lb; // la pointe
    // les anneaux (ellipses : demi-axes extérieurs a, b ; intérieurs ai, bi) et leurs branches
    const A1 = orange
      ? { x: -60, y: -21, a: 17, b: 15, rot: 0.12, ai: 10.5, bi: 9 }
      : { x: -62, y: -19, a: 16, b: 14.5, rot: 0.05, ai: 11.2, bi: 9.8 };
    const A2 = orange
      ? { x: -76, y: 22, a: 31, b: 18.5, rot: -0.1, ai: 22.5, bi: 11 }
      : { x: -84, y: 21, a: 32, b: 17, rot: -0.08, ai: 26, bi: 11.5 };
    const anneau = (A, x, y) => {
      const c = Math.cos(A.rot), s = Math.sin(A.rot);
      const px = (x - A.x) * c + (y - A.y) * s, py = -(x - A.x) * s + (y - A.y) * c;
      const dO = geo.ellipse(px, py, A.a, A.b), dI = geo.ellipse(px, py, A.ai, A.bi);
      return { d: Math.max(dO, -dI), e: Math.min(-dO, dI), w: (A.a - A.ai + A.b - A.bi) * 0.5 };
    };
    const matA = orange ? MAT.plastiqueOrange : MAT.chrome;
    const HA = orange ? 10.5 : 8.2; // hauteur des anneaux
    // une lame : dessus bombé, fil en biseau ; s = −1 (dessus, dos vers −y) ou +1 (dessous, dos vers +y)
    const lame = (x, y, S, s, z0) => {
      const yy = y * s; // > 0 vers le dos
      const dz = dos(x), fz = fil(x);
      let d = Math.max(yy - dz, -fz - yy, -14 - x, bout(x));
      // la pointe arrondie
      if (x > Lb - 3) d = Math.max(d, Math.hypot(Math.max(0, x - (Lb - 2.2)), yy - (dz - fz) * 0.5) - (dz + fz) * 0.5 - 0.05);
      S.d = d;
      if (d > S.lim) return false;
      const q = clamp01((dz - yy) / (dz + fz)); // 0 : le dos … 1 : le fil
      const ep = orange ? 2.1 : 2.5;
      let z = z0 + ep * (1 - 0.25 * q) + 0.45 * Math.sin(Math.PI * clamp01(q * 1.15)) + 0.3 * Math.sin((x / Lb) * Math.PI);
      const bis = sstep(0.72, 1, q);
      z -= bis * ep * 0.6;
      z = Math.min(z, z0 + R.bord(-d, 0.6, 9));
      S.z = z;
      const st = tx(T.e, x * 0.045 + oc[0], y * 5.5 + oc[1]) * 0.7 + tx(T.c, x * 0.02 + oc[2], y * 2 + oc[3]) * 0.3;
      R.mat(S, orange ? MAT.acierBrosse : MAT.acierPoli, 1 + st * 0.05, 0.08 + st * 0.05);
      S.an = 0.16 * (1 - bis);
      S.gx = 1;
      S.gy = 0;
      if (bis > 0) S.ro = lerp(S.ro, 0.05, bis);
      // traces de doigts et de colle, près du pivot
      const sale = sstep(0.45, 0.8, tx(T.b, x * 0.06 + oc[1], y * 0.2 + oc[2])) * (1 - clamp01(x / Lb));
      if (sale > 0) { S.ro += sale * 0.25; S.an *= 1 - sale; S.r *= 1 - sale * 0.2; S.g *= 1 - sale * 0.22; S.b *= 1 - sale * 0.25; }
      return true;
    };
    return {
      box: [-120, -40, Lb + 2, 42], haut: HA + 1,
      couches: [
        { // la lame du dessous
          box: [-16, -4, Lb + 1, W0 + 2],
          f(x, y, S) { lame(x, y, S, 1, 0); },
        },
        { // les branches : de la base des lames aux anneaux
          box: [-100, -38, 12, 40],
          f(x, y, S) {
            const r1 = orange ? 6.2 : 5.2, r2 = orange ? 7 : 5.8;
            const d1 = geo.seg(x, y, -4, -3.5, A1.x + A1.a * 0.72, A1.y + A1.b * 0.35) - r1;
            const t1 = geo.t;
            const d2 = geo.seg(x, y, -4, 4, A2.x + A2.a * 0.8, A2.y - A2.b * 0.3) - r2;
            const t2 = geo.t;
            const d = geo.smin(d1, d2, 1.5);
            S.d = d;
            if (d > S.lim) return;
            const r = d1 < d2 ? r1 : r2, t = d1 < d2 ? t1 : t2;
            const q = clamp01(1 - -Math.min(d1, d2) / r);
            S.z = 2.4 + (HA - 2.4) * sstep(0, 0.6, t) * 0.85 + r * 0.55 * Math.sqrt(1 - q * q);
            R.mat(S, matA);
            if (orange && t < 0.35) R.mat(S, MAT.acierBrosse, 1, 0.1); // la soie d'acier dans la poignée
          },
        },
        { // les anneaux
          box: [-120, -40, -26, 42],
          f(x, y, S) {
            const a = anneau(A1, x, y), b = anneau(A2, x, y);
            const u = a.d < b.d ? a : b;
            S.d = u.d;
            if (u.d > S.lim) return;
            const q = clamp01(1 - (u.e / (u.w * 0.5)));
            S.z = HA * 0.45 + HA * 0.55 * Math.sqrt(1 - q * q);
            if (orange) {
              const n = tx(T.c, x * 0.5 + oc[0], y * 0.5 + oc[1]);
              R.mat(S, matA, 1 + n * 0.04, 0.02 + n * 0.05);
              // la ligne de moulage au milieu de l'anneau
              const ml = R.trait(u.e - u.w * 0.5, 0.3, 1 / S.ppm);
              if (ml > 0) { S.ro += ml * 0.25; S.r *= 1 - ml * 0.1; }
            } else {
              R.mat(S, matA);
              const pq = sstep(0.55, 0.85, tx(T.b, x * 0.1 + oc[2], y * 0.1 + oc[3]));
              S.ro += pq * 0.12; // le chromage terni par les doigts
            }
          },
        },
        { // la lame du dessus (posée sur celle du dessous)
          box: [-16, -(W0 + 2), Lb + 1, 4],
          f(x, y, S) { lame(x, y, S, -1, 2.4); },
        },
        { // l'embase du pivot et la vis
          box: [-9, -9, 9, 9],
          f(x, y, S) {
            const r = Math.hypot(x, y);
            const d = r - 5.6;
            S.d = d;
            if (d > S.lim) return;
            const q = clamp01(r / 5.6);
            S.z = 5.2 + 1.3 * Math.sqrt(1 - q * q * q);
            R.mat(S, MAT.chrome, 0.95, 0.03);
            const fente = R.trait(x * 0.8 - y * 0.6, 0.9, 1 / S.ppm) * (r < 4.4 ? 1 : 0);
            if (fente > 0) { S.z -= fente * 0.8; S.r *= 1 - fente * 0.75; S.g *= 1 - fente * 0.75; S.b *= 1 - fente * 0.75; S.ro += fente * 0.3; }
          },
        },
      ],
      cavite: [1.5, 0.3], soleil: 0.8, ombre: { opacite: 0.6, contact: 0.5 },
    };
  }
  def('ciseaux', 'Ciseaux de tailleur', [270, 80, 9], 'snip', function* (o) {
    yield* tuiles();
    return ciseaux(o, false);
  });
  def('ciseaux-orange', 'Ciseaux à poignées orange', [230, 86, 11], 'snip', function* (o) {
    yield* tuiles();
    return ciseaux(o, true);
  });

  /* ---------- une paire de bouts de talons : gomme noire, clous ----------
     Un bout de talon (vu côté marche) : l'arrière en demi-cercle, l'avant droit un peu cambré (le gorgeron). */
  def('talons', 'Bouts de talons (paire)', [134, 58, 7], 'stamp', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 29 + 11);
    const oc = [rng() * 256, rng() * 256];
    const RR = 30.5, YC = 2.5, YF = -25;
    const forme = (x, y) => {
      const dC = Math.hypot(x, y - YC) - RR; // l'arrière, en demi-cercle
      const dR = geo.boite(x, y - (YF + YC) / 2, RR, (YC - YF) / 2, 5); // l'avant, coins arrondis
      const cambre = YF + 1.6 * (1 - (x / RR) * (x / RR)) - y; // le gorgeron, un peu creusé
      return Math.max(Math.min(dC, dR), cambre);
    };
    const clous = [[-19, -15], [19, -15], [-21, 9], [21, 9], [0, 22]];
    const piece = (cx, flip) => ({
      box: [cx - 33, -30, cx + 33, 36],
      f(x, y, S) {
        let u = x - cx, v = y;
        if (flip) u = -u;
        const d = forme(u, v);
        S.d = d;
        if (d > S.lim) return;
        const e = -d, p = 1 / S.ppm;
        S.z = R.bord(e, 1.4, 6.8);
        // le dessus : bordure lisse, puis une gaufrure en petits carrés (la gomme « antidérapante »)
        const lod = R.lod(2.1, S.ppm);
        let gauf = 0;
        const zone = sstep(3.2, 4.2, e);
        if (lod > 0 && zone > 0) {
          const a = u / 2.1, b = v / 2.1;
          const fa = Math.abs(a - Math.round(a)), fb = Math.abs(b - Math.round(b));
          gauf = (0.5 - Math.max(fa, fb)) * lod * zone;
        }
        const rainure = R.trait(e - 3.4, 0.5, p); // la rainure qui borde la gaufrure
        const n = tx(T.c, u * 0.4 + oc[0], v * 0.4 + oc[1]);
        R.mat(S, MAT.caoutchouc, 1.25 + n * 0.12, 0.0);
        S.z += gauf * 0.3 - rainure * 0.35;
        // poussière grise dans la gaufrure, le chant poncé plus brillant
        const pous = sstep(0.1, 0.7, tx(T.a, u * 0.08 + oc[1], v * 0.08 + oc[0]) + 0.3) * zone;
        R.teinte(S, [0.075, 0.07, 0.066], pous * (0.25 + 0.3 * Math.max(0, -gauf * 2)));
        if (e < 1.4) { S.ro -= 0.28 * (1 - e / 1.4); S.r *= 1.15; S.g *= 1.15; S.b *= 1.15; }
        // les clous : têtes d'acier affleurantes
        for (let k = 0; k < clous.length; k++) {
          const dc = Math.hypot(u - clous[k][0], v - clous[k][1]);
          if (dc < 2.4) {
            const c = clamp01((1.75 - dc) / p + 0.5);
            const creux = clamp01((2.3 - dc) / p + 0.5) * (1 - c);
            if (creux > 0) { S.z -= creux * 0.2; S.r *= 1 - creux * 0.3; S.g *= 1 - creux * 0.3; S.b *= 1 - creux * 0.3; }
            if (c > 0) {
              R.teinte(S, [0.5, 0.48, 0.45], c);
              S.me = c; S.ro = lerp(S.ro, 0.22, c); S.f0 = 0.5;
              S.z += c * (0.25 + 0.5 * Math.sqrt(Math.max(0, 1 - (dc / 1.75) * (dc / 1.75))));
            }
          }
        }
      },
    });
    return {
      box: [-70, -30, 70, 36], haut: 7,
      couches: [piece(-34.5, false), piece(34.5, true)],
      cavite: [1, 0.5], soleil: 0.6, ombre: { opacite: 0.6, contact: 0.55 },
    };
  });

  /* ---------- le ticket de réparation : jaune, œillet, pastille rouge, numéro ---------- */
  const JAUNE = '#f2d24b', ROUGE = '#e03a2e';
  def('ticket', 'Ticket de réparation', [56, 140, 0.3], 'tear', function* (o) {
    yield* tuiles();
    const numero = String(((o.graine * 7919) % 900) + 100).padStart(4, '0');
    const MB = yield* modele('ticketB:' + o.graine + ':' + empreinteP(), function* () {
      yield* polices();
      const res = 9;
      const noir = yield* R.masqueG([-28, -70, 28, 70], res, (g) => {
        g.textAlign = 'center';
        g.font = '800 5.6px ' + POLICE.chiffres;
        g.save();
        g.scale(1.22, 1);
        g.fillText('CORDO63', 0, -43.5);
        g.restore();
        g.font = '500 2.3px ' + POLICE.chiffres;
        g.fillText('cordonnerie · maroquinerie · clés', 0, -39.2);
        g.font = '800 9px ' + POLICE.chiffres;
        g.fillText('N° ' + numero, 0, -25);
        g.lineWidth = 0.22;
        g.textAlign = 'left';
        g.font = '500 2.6px ' + POLICE.chiffres;
        for (const [t, y] of [['Nom', -15], ['Travail', -7], ['Prix', 1], ['Pour le', 9]]) {
          g.fillText(t, -23, y);
          g.beginPath();
          g.moveTo(-23 + g.measureText(t).width + 1.2, y + 0.3);
          g.lineTo(23, y + 0.3);
          g.stroke();
        }
        g.lineWidth = 0.35;
        g.setLineDash([1.2, 1.1]);
        g.beginPath();
        g.moveTo(-28, 15.5);
        g.lineTo(28, 15.5);
        g.stroke();
        g.setLineDash([]);
        g.textAlign = 'center';
        g.font = '800 7px ' + POLICE.chiffres;
        g.fillText('N° ' + numero, 0, 30);
      });
      yield;
      const bleu = yield* R.masqueG([-28, -70, 28, 70], res, (g) => {
        g.font = '600 5px ' + POLICE.main;
        g.textAlign = 'left';
        g.fillText(o.travail || 'talons + patins', -10.5, -7.8);
        g.fillText(o.prix || '30 €', -14, 0.4);
        g.font = '600 4.6px ' + POLICE.main;
        g.fillText(o.date || 'mardi', -11, 8.3);
      });
      yield;
      return { noir, bleu };
    });
    const rng = R.rng(o.graine * 3 + 1);
    const oc = [rng() * 256, rng() * 256];
    const J = lin(JAUNE), RG = lin(ROUGE), NOIR = lin('#2a2622'), BLEU = lin('#1f3f8a');
    return {
      box: [-29, -71, 29, 71], haut: 0.6,
      couches: [
        {
          box: [-29, -71, 29, 71],
          f(x, y, S) {
            let d = geo.boite(x, y, 28, 70, 0.6);
            const coin = (Math.abs(x) - 28 + 9 - (y + 70)) * Math.SQRT1_2;
            d = Math.max(d, coin);
            const dT = Math.hypot(x, y + 58) - 2.9; // le trou de l'œillet
            d = Math.max(d, -dT);
            S.d = d;
            if (d > S.lim) return;
            const p = 1 / S.ppm;
            // le papier : un peu gondolé, plus épais que rien
            const ond = tx(T.a, x * 0.04 + oc[0], y * 0.04 + oc[1]) * 0.35 + (y + 70) * 0.002;
            S.z = 0.22 + ond * 0.5;
            const fib = tx(T.e, x * 0.6 + oc[1], y * 0.6 + oc[0]) * R.lod(0.8, S.ppm);
            R.mat(S, MAT.papier, 1, 0);
            S.r = J[0] * (1 + fib * 0.03); S.g = J[1] * (1 + fib * 0.03); S.b = J[2] * (1 + fib * 0.05);
            S.ro = 0.8;
            // l'encre
            const n = MB.noir.get(x, y), b = MB.bleu.get(x, y);
            if (n > 0) R.teinte(S, NOIR, n * 0.88);
            if (b > 0) R.teinte(S, BLEU, b * 0.85);
            // la pastille rouge (autocollant, un peu brillant)
            const dp = Math.hypot(x, y - 49) - 9;
            if (dp < p) {
              const c = clamp01(0.5 - dp / p);
              R.teinte(S, RG, c);
              S.ro = lerp(S.ro, 0.32, c);
              S.z += 0.08 * c;
            }
            // un peu de crasse de doigts
            const sale = sstep(0.4, 0.9, tx(T.b, x * 0.1 + oc[0], y * 0.1 + oc[1]));
            if (sale > 0) { S.r *= 1 - sale * 0.12; S.g *= 1 - sale * 0.14; S.b *= 1 - sale * 0.2; }
          },
        },
        { // l'œillet de renfort (rondelle de métal)
          box: [-7, -65, 7, -51],
          f(x, y, S) {
            const r = Math.hypot(x, y + 58);
            const d = Math.max(r - 5.8, 2.9 - r);
            S.d = d;
            if (d > S.lim) return;
            const q = (r - 4.35) / 1.45;
            S.z = 0.3 + 0.55 * Math.sqrt(Math.max(0, 1 - q * q));
            R.mat(S, MAT.laiton, 0.9, 0.08);
          },
        },
      ],
      cavite: false, soleil: 0.3, ombre: { opacite: 0.45, contact: 0.55 },
      numero,
    };
  });

  /* ---------- le pot de colle : flacon blanc carré, bouchon verseur bleu, vu de dessus ----------
     Un flacon de PEHD blanc un peu jauni, épaules arrondies ; le bouchon : une bague, un fût à l'épaule
     arrondie (le reflet de la vitrine y dessine un croissant), la buse ; de la colle séchée partout. */
  def('pot-colle', 'Pot de colle néoprène', [64, 64, 150], 'glue', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 41 + 9);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const HC = 112; // hauteur du corps
    const COLLE = lin('#a8793a'), CROUTE = lin('#8c6a3e'), JAUNI = lin('#d9cfae');
    // les coulures : deux ou trois traînées depuis le goulot, larges et plates, au bord irrégulier
    const coul = [];
    for (let i = 0; i < 2; i++) coul.push({ a: rng() * TAU, l: rng.range(6, 15), w: rng.range(1.4, 2.8), s: rng() * 99 });
    return {
      box: [-33, -33, 33, 33], haut: 150,
      couches: [
        { // le corps
          box: [-33, -33, 33, 33],
          f(x, y, S) {
            const d = geo.boite(x, y, 32, 32, 12);
            S.d = d;
            if (d > S.lim) return;
            const e = -d, r = Math.hypot(x, y), a = Math.atan2(y, x);
            // épaule arrondie (9 mm), dessus à peine bombé, un collet autour du goulot
            S.z = R.bord(e, 9, HC) + 0.8 * clamp01((e - 9) / 14) + 1.2 * sstep(17, 15, r);
            const n = tx(T.a, x * 0.1 + oc[0], y * 0.1 + oc[1]);
            R.mat(S, MAT.plastiqueBlanc, 0.96 + n * 0.04, 0.02 + n * 0.05);
            // jauni près du goulot, crasse grise sur l'épaule (les doigts)
            R.teinte(S, JAUNI, sstep(30, 12, r) * 0.5);
            const sale = sstep(0.3, 0.85, tx(T.b, x * 0.07 + oc[1], y * 0.07 + oc[0]) * 0.65 + (1 - clamp01(e / 10)) * 0.3 + tx(T.c, x * 0.35 + oc[2], y * 0.35) * 0.2);
            R.teinte(S, [0.3, 0.27, 0.23], sale * 0.55);
            S.ro += sale * 0.18;
            // la colle : croûte autour du goulot, traînées plates et brillantes
            const br = tx(T.c, Math.cos(a) * 5 + oc[2], Math.sin(a) * 5 + oc[3]);
            let c = sstep(19.5, 16.5, r + br * 2.6);
            for (const q of coul) {
              let da = a - q.a - tx(T.b, r * 0.08 + q.s, q.s) * 0.4;
              da = Math.abs(((da + Math.PI * 3) % TAU) - Math.PI) * r;
              const t = (r - 15) / q.l;
              if (t > -0.2 && t < 1.3) {
                const larg = q.w * (1 - 0.5 * clamp01(t)) * (0.8 + 0.4 * tx(T.c, r * 0.5 + q.s, q.s * 2));
                const bout = t > 1 ? (t - 1) * q.l : 0;
                c = Math.max(c, clamp01((larg - Math.hypot(da, bout)) * S.ppm * 0.6 + 0.5));
              }
            }
            if (c > 0) {
              const ep = c * (0.5 + 0.5 * tx(T.c, x * 0.4 + oc[0], y * 0.4 + oc[1]));
              R.teinte(S, r < 18 ? CROUTE : COLLE, ep * 0.4);
              S.ro = lerp(S.ro, 0.1, c);
              S.f0 = lerp(S.f0, 0.05, c);
              S.z += ep * 0.4;
            }
          },
        },
        { // le bouchon verseur
          box: [-15, -15, 15, 15],
          f(x, y, S) {
            const r = Math.hypot(x, y), a = Math.atan2(y, x);
            const rb = 13.6 + 0.22 * Math.cos(a * 32) * R.lod(2.6, S.ppm); // la bague, crantée sur son pourtour
            const d = r - rb;
            S.d = d;
            if (d > S.lim) return;
            if (r > 9.8) { // le dessus de la bague
              S.z = HC + 3 + R.bord(rb - r, 1.2, 4.5);
            } else if (r > 3.3) { // le fût, épaule arrondie
              S.z = HC + 7.5 + R.bord(9.8 - r, 5.5, 18.5);
            } else { // la buse, et son bout
              const t = r / 3.3;
              S.z = HC + 26 + 9 * (1 - t * t);
            }
            R.mat(S, MAT.plastiqueBleu, 1, 0.02);
            // un trait de moulage, quelques rayures
            const n = tx(T.c, x * 0.6 + oc[1], y * 0.6 + oc[2]);
            S.ro += Math.max(0, n) * 0.1;
            // la colle séchée qui a coulé de la buse
            const cc = sstep(4.6, 2.6, r + tx(T.c, x * 0.9 + oc[0], y * 0.9 + oc[1]) * 1.5);
            if (cc > 0) { R.teinte(S, COLLE, cc * 0.65); S.ro = lerp(S.ro, 0.12, cc); }
            if (r < 0.75) { const t = clamp01((0.75 - r) * S.ppm); S.z -= t * 1.2; R.teinte(S, [0.02, 0.015, 0.01], t); }
          },
        },
      ],
      cavite: [3, 0.06], soleil: 1.5, ombre: { opacite: 0.55, contact: 0.5, doux: 1.1 },
    };
  });

  /* ---------- aides : barres courbes, solides de révolution couchés ---------- */
  /* une polyligne (points [[x, y], …]) → distance (mm) au plus proche segment ; geo.t : abscisse relative totale */
  function polyligne(P) {
    const n = P.length, L = [0];
    for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const tot = L[n - 1];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    return {
      tot, box: [x0, y0, x1, y1], t: 0,
      d(x, y) {
        let best = Infinity, bt = 0;
        for (let i = 0; i < n - 1; i++) {
          const d = geo.seg(x, y, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
          if (d < best) { best = d; bt = (L[i] + geo.t * (L[i + 1] - L[i])) / tot; }
        }
        this.t = bt;
        return best;
      },
    };
  }
  /* un solide de révolution couché le long de x : rayon r(x) ; son axe à la hauteur zc(x) ; → hauteur du dessus */
  function revolution(y, r, zc) {
    const q = y / r;
    return zc + r * Math.sqrt(Math.max(0, 1 - q * q));
  }

  /* ---------- la pince à monter : deux mors forgés, pivot en bossage, face de marteau ronde, branches d'acier ---------- */
  def('pince', 'Pince à monter', [214, 56, 23], 'punch', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 53 + 5);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const pts = (P) => { const f = R.spline(P, 6, false), out = []; for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]); return out; };
    // les branches (repère : le pivot en 0, les mors vers +x)
    const bA = polyligne(pts([[-8, -6], [-50, -10.5], [-100, -13.5], [-150, -16]]));
    const bB = polyligne(pts([[-8, 6], [-50, 10.5], [-100, 14.5], [-150, 19]]));
    // un mors (s = −1 : celui de gauche, côté −y ; +1 : celui de droite) : largeur selon x, du pivot à la pointe
    const mors = table(monotone([[-14, 9], [0, 12.2], [14, 11.2], [30, 9.4], [46, 8.2], [58, 7.6]]), -14, 58);
    const talon = (x) => 5 * Math.exp(-Math.pow((x - 12) / 10, 2)); // l'appui courbe, derrière le mors de gauche
    const forge = (x, y, S, n) => {
      R.mat(S, MAT.acierNoir, 1.05 + n * 0.12, n * 0.08);
      const cal = sstep(0.15, 0.6, tx(T.b, x * 0.3 + oc[2], y * 0.3 + oc[0]));
      S.r *= 1 - cal * 0.28; S.g *= 1 - cal * 0.28; S.b *= 1 - cal * 0.26;
    };
    const branche = (x, y, S, B, sg) => {
      const d0 = B.d(x, y), t = B.t;
      const w = lerp(6.8, 4.8, t) + (t > 0.95 ? (t - 0.95) * 20 : 0);
      const d = d0 - w;
      if (d > S.lim) return;
      S.d = d;
      const q = clamp01(d0 / w);
      S.z = 4.5 + 4.2 * Math.sqrt(Math.max(0, 1 - Math.pow(q, 2.4))) + 7 * sstep(0.12, 0, t);
      // acier nu, poli par les mains sur le dessus, plus sombre sur les flancs
      const st = tx(T.e, x * 0.06 + oc[0], y * 4 + oc[1]);
      R.mat(S, MAT.acierBrosse, 0.9 + st * 0.05, 0.1 + st * 0.05);
      S.an = 0.14; S.gx = 1; S.gy = sg * 0.08;
      const sale = sstep(0.3, 0.75, tx(T.b, x * 0.05 + oc[1], y * 0.3 + oc[2]));
      if (sale > 0) { R.teinte(S, [0.08, 0.07, 0.06], sale * 0.5); S.ro += sale * 0.25; S.an *= 1 - sale; }
    };
    const unMors = (x, y, S, s) => {
      if (x < -15 || x > 59) { S.d = 9; return; }
      const yy = y * s; // > 0 vers l'extérieur du mors
      const hw = mors(x) + (s < 0 ? talon(x) : 0);
      let d = Math.max(yy - hw, -0.4 - yy, -14 - x, x - 58);
      if (x > 51) d = Math.max(d, Math.hypot(x - 51, Math.max(0, yy - hw + 7)) - 7);
      S.d = d;
      if (d > S.lim) return;
      const e = -d, q = clamp01(yy / hw);
      // le dessus bombé, arêtes adoucies
      S.z = Math.min(R.bord(e, 4, 20), 15 + 5 * Math.sqrt(Math.max(0, 1 - q * q * 0.9)));
      const n = tx(T.c, x * 0.5 + oc[0], y * 0.5 + oc[1]);
      forge(x, y, S, n);
      // arêtes et pointe polies par l'usage ; les stries de serrage au bout
      const ar = Math.min(1, sstep(1.6, 0, e) * 0.8 + sstep(48, 57, x) * 0.7);
      if (ar > 0) { R.teinte(S, MAT.acierPoli, ar * 0.6); S.ro -= ar * 0.15; }
      const stries = x > 54 ? R.trait((x - Math.round(x / 1.2) * 1.2), 0.3, 1 / S.ppm) * R.lod(1.2, S.ppm) : 0;
      if (stries > 0) S.z -= stries * 0.3;
    };
    return {
      box: [-156, -26, 60, 32], haut: 23,
      couches: [
        { box: [-156, -26, 2, 0], f(x, y, S) { branche(x, y, S, bA, -1); } },
        { box: [-156, 0, 2, 26], f(x, y, S) { branche(x, y, S, bB, 1); } },
        { box: [-16, -1, 60, 16], f(x, y, S) { unMors(x, y, S, 1); } },
        { box: [-16, -19, 60, 1], f(x, y, S) { unMors(x, y, S, -1); S.z += 0.4; } },
        { // le bossage du pivot et son rivet
          box: [-15, -15, 15, 15],
          f(x, y, S) {
            const r = Math.hypot(x, y);
            const d = r - 13;
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            S.z = 20 + R.bord(e, 2.5, 1.6) + (r < 5 ? 1.2 * Math.sqrt(Math.max(0, 1 - (r / 5) * (r / 5))) : 0);
            const n = tx(T.c, x * 0.5 + oc[1], y * 0.5 + oc[2]);
            forge(x, y, S, n);
            if (r < 5.4) { const c = clamp01((5.4 - r) * S.ppm); R.teinte(S, MAT.acierPoli, c * 0.85); S.ro = lerp(S.ro, 0.14, c); }
            const ar = sstep(1.4, 0, e);
            if (ar > 0) { R.teinte(S, MAT.acierPoli, ar * 0.5); S.ro -= ar * 0.12; }
          },
        },
        { // la face de marteau, ronde et polie, sur le flanc du mors de droite
          box: [14, 0, 44, 26],
          f(x, y, S) {
            const cx = 29, cy = 13, r = Math.hypot(x - cx, y - cy);
            const d = r - 9.2;
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            S.z = 12 + R.bord(e, 1.6, 11.5);
            R.mat(S, MAT.acierPoli, 1, 0.06);
            // les coups ont marqué la face (fines rayures concentriques), le chanfrein plus sombre
            const st = tx(T.e, Math.atan2(y - cy, x - cx) * 4 + oc[0], r * 3 + oc[1]);
            S.ro += Math.max(0, st) * 0.08;
            const ch = sstep(1.6, 0.2, e);
            if (ch > 0) R.teinte(S, MAT.acierNoir, ch * 0.5);
          },
        },
      ],
      cavite: [1.8, 0.25], soleil: 1, ombre: { opacite: 0.6, contact: 0.5 },
    };
  });

  /* ---------- le cutter : corps noir et rouge, lame sécable ---------- */
  def('cutter', 'Cutter à lame sécable', [168, 27, 17], 'cut', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 61 + 3);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const lameP = [60, -9, 86, -9, 72.5, 9, 60, 9].flat();
    const noir = MAT.plastiqueNoir, rouge = R.matiere('#b8241c', { ro: 0.55, f0: 0.04 });
    return {
      box: [-82, -14, 88, 14], haut: 17,
      couches: [
        { // la lame (sous le nez) : acier, traits de cassure à 60°, biseau
          box: [55, -10, 88, 10],
          f(x, y, S) {
            const d = geo.poly(x, y, lameP);
            S.d = d;
            if (d > S.lim) return;
            S.z = 6.2 + 0.25 * sstep(0, 0.6, -d);
            R.mat(S, MAT.acierBrosse, 0.95, 0);
            S.an = 0.1; S.gx = 1; S.gy = 0;
            // les traits de cassure (parallèles au bout de lame, tous les 9 mm)
            const u = (x - 60) * 0.866 + (y + 9) * 0.5 * 0.866 * 1.155;
            const k = ((x - 72.5) + (y - 9) * (13.5 / 18) * -1);
            const tr = R.trait(k - Math.round(k / 9) * 9, 0.25, 1 / S.ppm) * (k < -2 ? 1 : 0);
            if (tr > 0) { S.r *= 1 - tr * 0.6; S.g *= 1 - tr * 0.6; S.b *= 1 - tr * 0.6; S.ro += tr * 0.3; }
            // le fil (côté +y) poli
            const bis = sstep(6, 8.5, y);
            if (bis > 0) { S.ro = lerp(S.ro, 0.05, bis); S.an *= 1 - bis; S.z -= bis * 0.2; }
            void u;
          },
        },
        { // le corps
          box: [-82, -14, 62, 14],
          f(x, y, S) {
            const hw = x < 40 ? 13 : lerp(13, 10.2, sstep(40, 50, x));
            let d = geo.boite(x + 10, y, 72, hw, 6);
            d = Math.max(d, x - 61);
            S.d = d;
            if (d > S.lim) return;
            const q = clamp01(Math.abs(y) / hw);
            let z = 3 + 13 * Math.sqrt(Math.max(0, 1 - Math.pow(q, 2.2)));
            z = Math.min(z, R.bord(-d, 4, 16));
            // le nez d'acier (x > 40) : plus bas, plat
            const nez = sstep(38, 41, x);
            if (nez > 0) z = lerp(z, 3 + 8.5 * Math.sqrt(Math.max(0, 1 - Math.pow(q, 5))), nez);
            S.z = z;
            const n = tx(T.c, x * 0.4 + oc[0], y * 0.4 + oc[1]);
            if (nez > 0.5) {
              R.mat(S, MAT.acierBrosse, 0.85, 0.05);
              S.an = 0.12; S.gx = 1; S.gy = 0;
              // la fente de sortie de la lame
              const fente = R.trait(y, 1.2, 1 / S.ppm) * sstep(52, 58, x);
              if (fente > 0) { S.r *= 1 - fente * 0.8; S.g *= 1 - fente * 0.8; S.b *= 1 - fente * 0.8; S.z -= fente; }
            } else {
              // la poignée : caoutchouc rouge à l'arrière (nervures transversales), plastique noir devant
              const prise = sstep(-8, -12, x) * sstep(-78, -74, x);
              R.mat(S, noir, 1 + n * 0.08, n * 0.06);
              if (prise > 0) {
                R.mat(S, rouge, 1 + n * 0.06, n * 0.05);
                const lod = R.lod(3, S.ppm);
                const nerv = (0.5 - Math.abs(((x / 3) % 1 + 1) % 1 - 0.5)) * 2;
                S.z += (nerv - 0.5) * 0.5 * lod * sstep(0.2, 0.5, 1 - q);
              }
              // le poussoir rouge
              const pd = geo.boite(x - 24, y, 11, 5.2, 2.5);
              if (pd < 1 / S.ppm) {
                const c = clamp01(0.5 - pd * S.ppm);
                R.teinte(S, rouge, c);
                S.ro = lerp(S.ro, 0.4, c);
                const cr = (0.5 - Math.abs(((x / 2.2) % 1 + 1) % 1 - 0.5)) * 2 * R.lod(2.2, S.ppm);
                S.z += c * (1.6 + cr * 0.5) * sstep(0, 1.2, -pd);
              }
              // la crasse de colle et de cirage
              const sale = sstep(0.4, 0.85, tx(T.b, x * 0.05 + oc[2], y * 0.2 + oc[1]));
              if (sale > 0) { R.teinte(S, [0.12, 0.1, 0.08], sale * 0.4); S.ro += sale * 0.25; }
            }
          },
        },
      ],
      cavite: [1.2, 0.3], soleil: 0.8, ombre: { opacite: 0.6, contact: 0.5 },
    };
  });

  /* ---------- le tranchet : lame d'acier à pointe biaise, virole de laiton, manche de hêtre ---------- */
  def('tranchet', 'Tranchet de cordonnier', [214, 26, 18], 'cut', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 67 + 1);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const lameP = [8, -9.5, 112, -9.5, 86, 9.5, 8, 9.5];
    const wM = table(monotone([[-100, 8.5], [-96, 11], [-80, 12.4], [-40, 12.2], [-12, 11], [-4, 10.5]]), -100, -4);
    const bois = R.matiere('#9b7650', { ro: 0.36, f0: 0.045 });
    const ob = [rng() * 256, rng() * 256];
    return {
      box: [-101, -14, 113, 14], haut: 20,
      couches: [
        { // la lame : un peu relevée côté manche, pointe sur l'établi
          box: [6, -11, 113, 11],
          f(x, y, S) {
            const d = geo.poly(x, y, lameP);
            S.d = d;
            if (d > S.lim) return;
            const zb = lerp(7.5, 1.1, clamp01((x - 8) / 100));
            // le biseau le long du tranchant biais (de (112, −9,5) à (86, 9,5))
            const dt = ((x - 112) * 19 + (y + 9.5) * 26) / Math.hypot(19, 26); // distance au tranchant (négative dedans)
            const bis = sstep(-5.5, -0.3, dt);
            S.z = zb + 1.9 * (1 - bis * 0.85);
            const st = tx(T.e, x * 0.05 + oc[0], y * 5 + oc[1]);
            R.mat(S, MAT.acierBrosse, 0.78 + st * 0.05, 0.1 + st * 0.05);
            S.an = 0.12; S.gx = 1; S.gy = 0;
            // patine : acier au carbone gris sombre, piqûres de rouille claire
            const pat = sstep(0.1, 0.7, tx(T.b, x * 0.12 + oc[2], y * 0.12 + oc[3]));
            R.teinte(S, [0.1, 0.085, 0.07], pat * 0.55);
            S.ro += pat * 0.2;
            const rouille = sstep(0.55, 0.7, tx(T.c, x * 0.5 + oc[1], y * 0.5 + oc[0])) * (1 - bis);
            if (rouille > 0) { R.teinte(S, [0.2, 0.07, 0.025], rouille * 0.6); S.me *= 1 - rouille; S.ro = lerp(S.ro, 0.8, rouille); }
            if (bis > 0) { R.teinte(S, MAT.acierPoli, bis * 0.9); S.me = 1; S.ro = lerp(S.ro, 0.06, bis); S.an *= 1 - bis; }
          },
        },
        { // le manche en hêtre
          box: [-101, -14, -3, 14],
          f(x, y, S) {
            const w = wM(x);
            let d = Math.abs(y) - w;
            d = Math.max(d, -100 - x, x + 4);
            if (x < -96) d = Math.max(d, Math.hypot(x + 96, y * 0.75) - 7.6);
            S.d = d;
            if (d > S.lim) return;
            const t = w * 0.82;
            S.z = revolution(y * (t / w), t, t) * 1 + 0.2;
            const vn = veine(x, y, ob, 0.35) * R.lod(1.2, S.ppm);
            const n = tx(T.b, x * 0.04 + ob[1], y * 0.2);
            R.mat(S, bois, 1 - vn * 0.3 + n * 0.08, vn * 0.05);
            // patiné par la main : plus sombre et plus lisse au milieu
            const main = sstep(-95, -70, x) * sstep(-10, -35, x);
            S.r *= 1 - main * 0.25; S.g *= 1 - main * 0.28; S.b *= 1 - main * 0.3; S.ro -= main * 0.12;
          },
        },
        { // la virole de laiton
          box: [-6, -12, 10, 12],
          f(x, y, S) {
            const d = Math.max(Math.abs(y) - 10, Math.abs(x - 2) - 7);
            S.d = d;
            if (d > S.lim) return;
            S.z = revolution(y, 10, 9.5);
            R.mat(S, MAT.laiton, 0.9, 0.1);
            const gorge = R.trait(x - 5, 0.8, 1 / S.ppm);
            if (gorge > 0) { S.z -= gorge * 0.6; S.r *= 1 - gorge * 0.5; S.g *= 1 - gorge * 0.5; S.b *= 1 - gorge * 0.5; }
            const ter = sstep(0.2, 0.7, tx(T.c, x * 0.4 + oc[0], y * 0.4 + oc[2]));
            R.teinte(S, MAT.laitonTerni, ter * 0.6);
            S.ro += ter * 0.15;
          },
        },
      ],
      cavite: [1.5, 0.25], soleil: 0.9, ombre: { opacite: 0.6, contact: 0.5 },
    };
  });

  /* ---------- l'alêne : manche en poire (buis), virole, aiguille d'acier ---------- */
  def('alene', 'Alêne', [152, 30, 30], 'punch', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 71 + 7);
    const oc = [rng() * 256, rng() * 256];
    const rM = table(monotone([[-80, 6], [-78, 9.5], [-72, 12.5], [-58, 14.8], [-44, 14.6], [-28, 12.4], [-14, 9.8], [-2, 8.4], [0, 8.2]]), -80, 0);
    const zc = (x) => (x < -44 ? 14.8 : lerp(14.8, 0.6, clamp01((x + 44) / 116)));
    const buis = R.matiere('#c9a468', { ro: 0.3, f0: 0.05 });
    return {
      box: [-81, -16, 73, 16], haut: 30,
      couches: [
        { // l'aiguille
          box: [10, -3, 73, 3],
          f(x, y, S) {
            const r = lerp(1.9, 0.25, clamp01((x - 12) / 60));
            let d = Math.abs(y) - r;
            d = Math.max(d, 10 - x, x - 72.5);
            S.d = d;
            if (d > S.lim) return;
            S.z = revolution(y, r, zc(x));
            R.mat(S, MAT.acierPoli, 1, 0.04);
          },
        },
        { // la virole
          box: [-2, -8, 14, 8],
          f(x, y, S) {
            const r = lerp(7, 5.4, clamp01(x / 13));
            let d = Math.max(Math.abs(y) - r, -1 - x, x - 13);
            S.d = d;
            if (d > S.lim) return;
            S.z = revolution(y, r, zc(x));
            R.mat(S, MAT.laiton, 0.95, 0.08);
            const ter = sstep(0.1, 0.7, tx(T.c, x * 0.5 + oc[0], y * 0.5 + oc[1]));
            R.teinte(S, MAT.laitonTerni, ter * 0.55);
          },
        },
        { // le manche en poire
          box: [-81, -16, 1, 16],
          f(x, y, S) {
            if (x < -80.5 || x > 0.5) { S.d = 9; return; }
            const r = rM(x);
            let d = Math.abs(y) - r;
            d = Math.max(d, -80 - x, x);
            S.d = d;
            if (d > S.lim) return;
            S.z = revolution(y, r, zc(x));
            const vn = veine(x, y, oc, 0.45) * R.lod(1, S.ppm);
            R.mat(S, buis, 1 - vn * 0.18 + tx(T.b, x * 0.05 + oc[1], y * 0.1) * 0.06, vn * 0.04);
            const main = sstep(0.3, 0.8, tx(T.a, x * 0.06 + oc[0], y * 0.2 + oc[1]));
            R.teinte(S, [0.2, 0.13, 0.06], main * 0.35);
          },
        },
      ],
      cavite: [1.5, 0.2], soleil: 1, ombre: { opacite: 0.6, contact: 0.45 },
    };
  });

  /* ---------- le pinceau à colle : manche de bois brut, virole de fer-blanc, soies collées ---------- */
  def('pinceau', 'Pinceau à colle', [192, 17, 10], 'glue', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 79 + 13);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const bois = R.matiere('#b9a07a', { ro: 0.7, f0: 0.03 });
    const COLLE = lin('#9c6f31');
    return {
      box: [-116, -9, 77, 9], haut: 10,
      couches: [
        { // les soies
          box: [50, -9, 77, 9],
          f(x, y, S) {
            const t = clamp01((x - 52) / 24);
            const hw = 7.2 + 1.3 * t;
            let d = Math.abs(y) - hw;
            d = Math.max(d, 51 - x, x - 76 + 1.5 * Math.pow(Math.abs(y) / hw, 3) * 2);
            S.d = d;
            if (d > S.lim) return;
            const q = clamp01(Math.abs(y) / hw);
            S.z = 1 + 3.2 * (1 - t * 0.6) * Math.sqrt(Math.max(0, 1 - q * q));
            // des poils : fines lignes le long de x
            const poil = tx(T.e, x * 0.08 + oc[0], y * 9 + oc[1]) * R.lod(0.5, S.ppm);
            R.mat(S, MAT.crin, 1 + poil * 0.4, 0.1);
            S.z += poil * 0.15;
            // la colle séchée agglomère les soies (brillante, ambrée)
            const cl = sstep(0.1, 0.5, tx(T.b, x * 0.15 + oc[2], y * 0.2 + oc[0]) + t * 0.4);
            if (cl > 0) { R.teinte(S, COLLE, cl * 0.6); S.ro = lerp(S.ro, 0.12, cl); S.z += cl * 0.4; }
          },
        },
        { // le manche
          box: [-116, -6, 34, 6],
          f(x, y, S) {
            const r = x < -108 ? 4.2 : lerp(4.6, 5, clamp01((x + 108) / 140));
            let d = Math.abs(y) - r;
            d = Math.max(d, -115 - x, x - 33);
            if (x < -112) d = Math.max(d, Math.hypot(x + 112, y) - 4.2);
            S.d = d;
            if (d > S.lim) return;
            S.z = revolution(y, r, 5);
            const vn = veine(x, y, oc, 0.5) * R.lod(1, S.ppm);
            R.mat(S, bois, 1 - vn * 0.2, 0);
            // la colle et la crasse sur le manche (surtout près de la virole)
            const sale = sstep(0.2, 0.7, tx(T.b, x * 0.06 + oc[1], y * 0.3 + oc[2]) + sstep(-40, 30, x) * 0.4);
            if (sale > 0) { R.teinte(S, COLLE, sale * 0.45); S.ro = lerp(S.ro, 0.3, sale); }
          },
        },
        { // la virole de fer-blanc, sertie
          box: [28, -9, 54, 9],
          f(x, y, S) {
            const hw = lerp(5.4, 7.6, sstep(30, 40, x));
            let d = Math.max(Math.abs(y) - hw, 29 - x, x - 53);
            S.d = d;
            if (d > S.lim) return;
            const q = clamp01(Math.abs(y) / hw);
            S.z = 1.5 + 4.2 * Math.sqrt(Math.max(0, 1 - Math.pow(q, 3)));
            R.mat(S, MAT.acierPoli, 0.92, 0.05);
            S.an = 0.1; S.gx = 1; S.gy = 0;
            const sert = Math.max(R.trait(x - 34, 0.8, 1 / S.ppm), R.trait(x - 37.5, 0.8, 1 / S.ppm));
            if (sert > 0) { S.z -= sert * 0.5; S.r *= 1 - sert * 0.4; S.g *= 1 - sert * 0.4; S.b *= 1 - sert * 0.4; }
            const cl = sstep(0.35, 0.7, tx(T.b, x * 0.2 + oc[0], y * 0.3 + oc[1]));
            if (cl > 0) { R.teinte(S, COLLE, cl * 0.6); S.me *= 1 - cl; S.ro = lerp(S.ro, 0.15, cl); }
          },
        },
      ],
      cavite: [1.2, 0.25], soleil: 0.8, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  /* ---------- le contour d'une semelle (pied droit, talon à −x, bout à +x), mis à l'échelle ---------- */
  const PIED = [
    [145, 4], [139, 26], [122, 43], [97, 50], [66, 49], [36, 43], [6, 35], [-25, 31.5], [-60, 33], [-95, 36],
    [-121, 33.5], [-138, 23], [-145, 4], [-143, -13], [-134, -27], [-116, -35], [-94, -36], [-66, -32], [-36, -27],
    [-6, -30], [24, -40], [54, -48], [84, -50.5], [110, -45], [130, -33], [142, -16],
  ];
  function contourPied(L, W, effile = 0) {
    const kx = L / 290, ky = W / 101;
    // effile : le bout plus fin (une chaussure de ville) — on resserre l'avant du pied
    return R.spline(PIED.map(([x, y]) => [x * kx, y * ky * (1 - effile * Math.pow(Math.max(0, (x - 70) / 75), 1.6))]), 6, true);
  }
  function tracePoly(g, P) {
    g.beginPath();
    g.moveTo(P[0], P[1]);
    for (let i = 2; i < P.length; i += 2) g.lineTo(P[i], P[i + 1]);
    g.closePath();
  }
  /* points du contour à abscisses régulières (pas en mm) : [x, y, nx, ny] (normale vers l'extérieur) */
  function pasDuContour(P, pas) {
    const n = P.length / 2, out = [];
    let acc = 0, reste = 0;
    for (let i = 0; i < n; i++) {
      const x0 = P[2 * i], y0 = P[2 * i + 1], x1 = P[(2 * i + 2) % P.length], y1 = P[(2 * i + 3) % P.length];
      const l = Math.hypot(x1 - x0, y1 - y0);
      let t = reste;
      while (t < l) {
        const u = t / l;
        // la normale sortante (le contour tourne dans le sens horaire à l'écran)
        out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, (y1 - y0) / l, -(x1 - x0) / l]);
        t += pas;
      }
      reste = t - l;
      acc += l;
    }
    return out;
  }

  /* ---------- la brosse en crin : dos de noyer ciré, crin noir qui déborde tout autour, pointes irrégulières ---------- */
  def('brosse', 'Brosse en crin', [176, 64, 40], 'brush', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 83 + 17);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const noyer = R.matiere('#7a5236', { ro: 0.28, f0: 0.05 });
    const CRIN = R.matiere('#a58f72', { ro: 0.45, f0: 0.04 }); // crin naturel, blond-gris
    const HD = 17, HT = 38; // le bas et le haut du dos de bois
    const A = 81, B = 24.5, RC = 15;
    return {
      box: [-92, -35, 92, 35], haut: HT,
      couches: [
        { // le crin : il déborde du dos de 5 à 9 mm, en mèches ; pointes irrégulières
          box: [-92, -35, 92, 35],
          f(x, y, S) {
            const d0 = geo.boite(x, y, A, B, RC);
            const a = Math.atan2(y * 3.2, x);
            const touffe = Math.pow(Math.abs(Math.sin(a * 23 + oc[0])), 0.6) * 1.8; // les touffes plantées en rangs
            const meche = tx(T.c, a * 40 + oc[0], 1) * 1.6 + tx(T.e, a * 140 + oc[1], 2) * 1.1 + touffe;
            const fr = 7.5 + meche;
            const d = d0 - fr;
            S.d = d;
            if (d > S.lim) return;
            const t = clamp01(d0 / fr); // 0 : sous le dos … 1 : la pointe
            S.z = lerp(HD, 2.5, Math.pow(t, 0.75));
            // les poils : fines stries dans le sens de la mèche, reflets de crin, pointes un peu plus claires
            const poil = tx(T.e, a * 90 + oc[2], d0 * 0.8 + oc[3]) * R.lod(0.35, S.ppm);
            R.mat(S, CRIN, 0.55 + poil * 0.35 + t * 0.55, 0.05 + t * 0.15);
            R.teinte(S, [0.02, 0.016, 0.012], (1 - t) * 0.55); // l'ombre sous le dos, le cirage à la racine
            S.z += poil * 0.6;
            const l = Math.hypot(x, y * 3.2) || 1;
            S.an = 0.22; S.gx = x / l; S.gy = (y * 3.2) / l;
            S.ao = 0.55 + 0.45 * t;
          },
        },
        { // le dos de bois : dessus un peu bombé, arête arrondie, un filet creusé autour
          box: [-82, -26, 82, 26],
          f(x, y, S) {
            const d = geo.boite(x, y, A, B, RC);
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            const bombe = 2.2 * (1 - (x / A) * (x / A)) * (1 - (y / B) * (y / B));
            S.z = HD + R.bord(e, 7, HT - HD) + bombe;
            const filet = R.trait(e - 9.5, 0.9, 1 / S.ppm);
            S.z -= filet * 0.5;
            const vn = veine(x, y * 1.4, oc, 0.36) * R.lod(1, S.ppm);
            const n = tx(T.b, x * 0.03 + oc[3], y * 0.05);
            R.mat(S, noyer, 1 - vn * 0.3 + n * 0.08, vn * 0.05);
            // le cirage : des traces noires et brunes vers les bords ; le vernis usé au milieu (plus mat, plus clair)
            const cir = sstep(0.35, 0.8, tx(T.a, x * 0.05 + oc[2], y * 0.08 + oc[3]) * 0.7 + (1 - clamp01(e / 12)) * 0.45);
            if (cir > 0) { R.teinte(S, [0.03, 0.02, 0.014], cir * 0.55); S.ro -= cir * 0.06; }
            const use = sstep(0.2, 0.7, tx(T.b, x * 0.04 + oc[0], y * 0.1 + oc[1])) * clamp01(e / 10);
            S.ro += use * 0.3;
            R.teinte(S, [0.3, 0.22, 0.15], use * 0.15);
            if (filet > 0) R.teinte(S, [0.05, 0.03, 0.02], filet * 0.4);
          },
        },
      ],
      cavite: [2, 0.2], soleil: 1, ombre: { opacite: 0.6, contact: 0.55 },
    };
  });

  /* ---------- la plaque de patin : gomme noire gaufrée, un patin tracé au crayon argent ---------- */
  def('patins', 'Plaque de patin (gomme)', [190, 92, 2.5], 'stamp', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 89 + 23);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const M = yield* modele('patins:' + o.graine, function* () {
      // le tracé d'un patin (l'avant d'une semelle) au crayon argent, et une découpe déjà faite
      const P = contourPied(250, 90);
      const trace = yield* R.masqueG([-96, -47, 96, 47], 5, (g) => {
        g.save();
        g.translate(-58, -1);
        g.lineWidth = 0.55;
        g.beginPath();
        let first = true;
        for (let i = 0; i < P.length; i += 2) {
          if (P[i] < 20) { first = true; continue; }
          const x = P[i] - 5, y = P[i + 1];
          if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
        }
        g.stroke();
        g.beginPath();
        g.moveTo(15, -42); g.lineTo(15, 42);
        g.setLineDash([2.5, 2]);
        g.stroke();
        g.restore();
      });
      return { trace };
    });
    return {
      box: [-96, -47, 96, 47], haut: 2.6,
      couches: [
        {
          box: [-96, -47, 96, 47],
          f(x, y, S) {
            let d = geo.boite(x, y, 95, 46, 2.5);
            // un coin déjà entamé (une découpe au tranchet, droite)
            d = Math.max(d, (x - 95 + 22 - (y + 46) * 0.9) * 0.74);
            S.d = d;
            if (d > S.lim) return;
            const e = -d, p = 1 / S.ppm;
            S.z = R.bord(e, 0.8, 2.5);
            // la gaufrure en losanges (face d'usure), effacée de loin
            const lod = R.lod(3, S.ppm);
            let gf = 0;
            if (lod > 0) {
              const a = (x * 0.8 + y) / 3.2, b = (x * 0.8 - y) / 3.2;
              const fa = Math.abs(a - Math.round(a)), fb = Math.abs(b - Math.round(b));
              gf = (Math.min(fa, fb) - 0.25) * lod;
            }
            const n = tx(T.c, x * 0.3 + oc[0], y * 0.3 + oc[1]);
            R.mat(S, MAT.caoutchouc, 1.2 + n * 0.12, 0.02);
            S.z += gf * 0.35;
            // de la poussière de ponçage dans les creux, le chant découpé plus lisse
            R.teinte(S, [0.07, 0.066, 0.062], sstep(0.1, -0.2, gf) * 0.35 * sstep(0.2, 0.8, tx(T.a, x * 0.05 + oc[2], y * 0.05 + oc[1]) + 0.5));
            if (e < 0.8) S.ro -= 0.2 * (1 - e / 0.8);
            // le trait de crayon argent
            const tr = M.trace.get(x, y);
            if (tr > 0) { R.teinte(S, [0.42, 0.42, 0.44], tr * 0.8); S.me = tr * 0.6; S.ro = lerp(S.ro, 0.35, tr); }
            void p;
          },
        },
      ],
      cavite: [1.2, 0.5], soleil: 0.5, ombre: { opacite: 0.5, contact: 0.55 },
    };
  });

  /* ---------- la semelle de cuir : cuir tanné végétal, fleur un peu marquée, tranche brunie ---------- */
  def('semelle-cuir', 'Semelle en cuir', [290, 102, 5.5], 'stamp', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 97 + 29);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const M = yield* modele('semcuir:' + o.graine + ':' + empreinteP(), function* () {
      yield* polices();
      const P = contourPied(290, 102);
      const F = yield* R.champ([-150, -56, 150, 56], 3, (g) => { tracePoly(g, P); g.fill(); });
      // la pointure frappée au talon, et quelques trous de clous (peu, alignés)
      const marque = yield* R.masqueG([-150, -56, 150, 56], 5, (g) => {
        g.font = '700 9px ' + POLICE.chiffres;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.save();
        g.translate(-100, 0);
        g.rotate(-Math.PI / 2);
        g.fillText('42', 0, 0);
        g.restore();
      });
      return { F, marque };
    });
    const cuir = MAT.cuirTanne;
    const TRANCHE = lin('#4a2a18');
    return {
      box: [-150, -56, 150, 56], haut: 5.5,
      couches: [
        {
          box: [-150, -56, 150, 56],
          f(x, y, S) {
            const d = M.F.get(x, y);
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            // la semelle n'est jamais plate : le bout et le talon se relèvent un peu, elle vrille légèrement
            const voile = 2.2 * Math.pow(Math.abs(x) / 145, 2.2) + 0.9 * (y / 50) * (x / 145);
            S.z = R.bord(e, 1.4, 5.5) + voile;
            // le cuir : marbrures du tannage, fleur fine, éraflures claires, bords plus sombres (manipulé)
            const n1 = tx(T.a, x * 0.03 + oc[0], y * 0.03 + oc[1]);
            const n2 = tx(T.b, x * 0.12 + oc[2], y * 0.12 + oc[3]);
            const fleur = tx(T.e, x * 0.9 + oc[1], y * 0.9 + oc[0]) * R.lod(0.9, S.ppm);
            R.mat(S, cuir, 1 + n1 * 0.16 + n2 * 0.08 + fleur * 0.05, n2 * 0.05);
            R.teinte(S, [0.44, 0.27, 0.2], 0.45); // un cuir de semelle pâle, un peu rosé
            const pale = sstep(0.1, 0.55, n2 * 0.7 + tx(T.c, x * 0.2 + oc[3], y * 0.2) * 0.4);
            R.teinte(S, [0.6, 0.44, 0.34], pale * 0.4);
            S.ro += pale * 0.12;
            // les éraflures du ponçage : de fines stries parallèles dans une zone
            const zone = sstep(0.2, 0.6, tx(T.a, x * 0.02 + oc[1], y * 0.02 + oc[2]));
            const stri = zone * sstep(0.2, 0.9, tx(T.e, (x * 0.94 + y * 0.34) * 0.25 + oc[0], (y * 0.94 - x * 0.34) * 6)) * R.lod(0.8, S.ppm);
            R.teinte(S, [0.7, 0.55, 0.45], stri * 0.35);
            // des taches plus sombres (eau, graisse, colle)
            const tache = sstep(0.5, 0.75, tx(T.b, x * 0.05 + oc[0], y * 0.05 + oc[3]));
            R.teinte(S, [0.16, 0.08, 0.05], tache * 0.45);
            const bord = sstep(12, 0, e) * 0.5 + sstep(0.35, 0.85, n1) * 0.3;
            R.teinte(S, [0.2, 0.1, 0.055], bord * 0.55);
            // la tranche brunie (on la voit un peu sur l'arrondi)
            const tr = sstep(1.3, 0.4, e);
            if (tr > 0) { R.teinte(S, TRANCHE, tr * 0.8); S.ro = lerp(S.ro, 0.3, tr); }
            // la pointure frappée à froid (plus sombre, en creux)
            const mq = M.marque.get(x, y);
            if (mq > 0) { R.teinte(S, [0.22, 0.12, 0.07], mq * 0.6); S.z -= mq * 0.25; }
            // une ligne au crayon (le tracé de la couture) à 5 mm du bord
            const cr = R.trait(e - 5, 0.35, 1 / S.ppm) * sstep(0.2, 0.5, tx(T.c, x * 0.1 + oc[2], y * 0.1) + 0.5);
            if (cr > 0) R.teinte(S, [0.15, 0.12, 0.1], cr * 0.45);
            S.z += fleur * 0.02;
          },
        },
      ],
      cavite: false, soleil: 0.5, ombre: { opacite: 0.55, contact: 0.55 },
    };
  });

  /* ---------- la semelle crantée : gomme noire, crampons (type montagne, sans marque) ----------
     Une couronne de pavés le long du bord (coupée par des canaux perpendiculaires), un damier de pavés
     au milieu de l'avant, le talon à part (son avant droit), la cambrure lisse et en retrait. */
  def('semelle-gomme', 'Semelle crantée (gomme)', [300, 106, 10], 'stamp', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 101 + 31);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const M = yield* modele('semgomme:' + o.graine, function* () {
      const P = contourPied(300, 106);
      const box = [-156, -58, 156, 58];
      const F = yield* R.champ(box, 3, (g) => { tracePoly(g, P); g.fill(); });
      const pts = pasDuContour(P, 15.5);
      const C = yield* R.champ(box, 3, (g) => {
        g.save();
        tracePoly(g, P);
        g.clip();
        // 1) le damier de l'avant et les pavés du talon (tournés de 22°)
        g.save();
        g.translate(60, 0);
        g.rotate(0.38);
        for (let i = -9; i <= 9; i++) for (let j = -6; j <= 6; j++) {
          const bx = i * 15.5 + (j % 2 ? 7.75 : 0), by = j * 12.5;
          g.fillRect(bx - 5.8, by - 4.4, 11.6, 8.8);
        }
        g.restore();
        g.save();
        g.translate(-112, 0);
        for (let j = -2; j <= 2; j++) g.fillRect(-11, j * 12 - 4.2, 22, 8.4);
        g.restore();
        // on dégage une bande de 18 mm le long du bord (la couronne viendra là)
        g.globalCompositeOperation = 'destination-out';
        g.lineJoin = 'round';
        g.lineWidth = 36;
        tracePoly(g, P);
        g.stroke();
        // 2) la couronne de pavés : entre 2 et 15 mm du bord, coupée tous les 15,5 mm
        g.globalCompositeOperation = 'source-over';
        g.lineWidth = 30;
        tracePoly(g, P);
        g.stroke();
        g.globalCompositeOperation = 'destination-out';
        g.lineWidth = 4;
        tracePoly(g, P);
        g.stroke();
        g.lineWidth = 3.6;
        g.lineCap = 'butt';
        for (const [x, y, nx, ny] of pts) {
          g.beginPath();
          g.moveTo(x + nx * 3, y + ny * 3);
          g.lineTo(x - nx * 17, y - ny * 17);
          g.stroke();
        }
        // 3) la cambrure : lisse, sans crampons ; le talon a un avant droit
        g.fillRect(-72, -70, 58, 140);
        g.restore();
      });
      return { F, C };
    });
    return {
      box: [-156, -58, 156, 58], haut: 10,
      couches: [
        {
          box: [-156, -58, 156, 58],
          f(x, y, S) {
            const d = M.F.get(x, y);
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            const dc = M.C.get(x, y);
            // la semelle : 4,5 mm ; les crampons : 5 mm de plus, arêtes adoucies, flancs en dépouille
            const cr = dc < 0.6 ? R.bord(-dc + 0.6, 1.4, 1) : 0;
            const cambre = x > -72 && x < -14 ? 1 : 0;
            S.z = R.bord(e, 1.6, 4.5) - cambre * 0.8 + 5 * cr;
            const n = tx(T.c, x * 0.35 + oc[0], y * 0.35 + oc[1]);
            R.mat(S, MAT.caoutchouc, 1.15 + n * 0.12, 0.02);
            // le dessus des crampons : usé, plus lisse et plus clair (poussière grise, lustré)
            if (cr > 0.5) {
              const use = sstep(0.1, 0.7, tx(T.a, x * 0.04 + oc[2], y * 0.04 + oc[3]) + 0.4);
              R.teinte(S, [0.085, 0.08, 0.075], use * 0.45 * cr);
              S.ro -= 0.12 * cr;
            } else {
              // le fond : de fines stries moulées dans la cambrure, de la terre dans les canaux
              const stri = cambre ? R.trait(x - Math.round(x / 2.5) * 2.5, 0.8, 1 / S.ppm) * R.lod(2.5, S.ppm) : 0;
              S.z -= stri * 0.25;
              const terre = sstep(0.2, 0.8, tx(T.b, x * 0.08 + oc[1], y * 0.08 + oc[0]));
              R.teinte(S, [0.06, 0.045, 0.035], terre * 0.4);
            }
          },
        },
      ],
      cavite: [2.2, 0.28], soleil: 0.6, ombre: { opacite: 0.58, contact: 0.55 },
    };
  });

  /* ---------- les lacets : une paire de lacets ronds cirés, roulés en boucle, ferrets aux bouts ---------- */
  def('lacets', 'Lacets cirés (paire)', [150, 76, 4], 'lace', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 103 + 37);
    const couches = [];
    const BRUN = lin('#3b2415'), FERRET = lin('#1a1512');
    const lacet = (cx, cy, sens, s0) => {
      // une spirale ovale qui se resserre (1,6 tour), puis une queue ; l'autre bout repasse par-dessus
      const pts = [], r0 = 30, r1 = 12, tours = 1.55;
      const a0 = rng() * TAU;
      const N = 150;
      for (let k = 0; k <= N; k++) {
        const t = k / N, a = a0 + sens * t * tours * TAU;
        const r = lerp(r0, r1, t) * (1 + 0.04 * Math.sin(a * 3 + s0));
        pts.push([cx + Math.cos(a) * r * 1.12, cy + Math.sin(a) * r, 1.5]);
      }
      // la queue extérieure (le départ de la spirale), tangente
      const aq = a0 - sens * 0.05, dq = [Math.cos(aq + (sens * Math.PI) / 2) * -1, Math.sin(aq + (sens * Math.PI) / 2) * -1];
      const q0 = pts[0], queue = [];
      for (let k = 1; k <= 12; k++) queue.push([q0[0] + dq[0] * k * 3.2, q0[1] + dq[1] * k * 3.2 + Math.sin(k * 0.4) * 1.2, 1.5]);
      // l'autre bout : du centre, par-dessus les tours, vers l'extérieur
      const pin = pts[N], dir = rng() * TAU, bout = [];
      for (let k = 0; k <= 26; k++) {
        const l = k * 2.4, x = pin[0] + Math.cos(dir) * l + Math.sin(k * 0.3) * 0.8, y = pin[1] + Math.sin(dir) * l;
        const dans = Math.hypot((x - cx) / 1.12, y - cy) < r0 + 3;
        bout.push([x, y, dans ? 3.3 : 1.5 + 1.8 * sstep(r0 + 12, r0 + 3, Math.hypot((x - cx) / 1.12, y - cy))]);
      }
      const corps = queue.reverse().concat(pts).concat(bout.slice(1));
      const L = corps.length;
      const ferret = (k) => k < 6 || k > L - 7;
      couches.push({
        tube: corps,
        r: 1.55,
        f(t, u, S) {
          // la tresse : des chevrons fins le long du lacet ; la cire donne un lustre
          const tr = Math.sin((t * 1.9 + Math.abs(u) * 1.4) * Math.PI) * R.lod(1.1, S.ppm);
          R.mat(S, MAT.filCire, 1, 0);
          R.teinte(S, BRUN, 1);
          S.r *= 1 + tr * 0.12; S.g *= 1 + tr * 0.12; S.b *= 1 + tr * 0.12;
          S.ro = 0.34;
          S.f0 = 0.045;
        },
      });
      // les ferrets (acétate noir, brillant) : deux petits tubes par-dessus les bouts
      for (const seg of [corps.slice(0, 6), corps.slice(L - 6)]) {
        couches.push({
          tube: seg.map((p) => [p[0], p[1], p[2] + 0.2]),
          r: 1.75,
          f(t, u, S) { R.mat(S, MAT.plastiqueNoir); R.teinte(S, FERRET, 1); S.ro = 0.16; S.f0 = 0.05; },
        });
      }
      void ferret;
    };
    lacet(-36, 0, 1, 1.3);
    lacet(37, 2, -1, 4.1);
    return {
      box: [-78, -42, 78, 42], haut: 5, couches,
      cavite: [1.2, 0.3], soleil: 0.6, ombre: { opacite: 0.55, contact: 0.55 },
    };
  });

  /* ---------- les clés : trois ébauches de laiton et de maillechort sur un anneau brisé ---------- */
  def('cles', 'Clés brutes et anneau', [96, 84, 7], 'chip', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 107 + 41);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const RC = [-28, 0], RA = 14; // l'anneau : centre et rayon
    // une clé brute (repère de la clé : le trou en 0, la tige vers +x)
    const cle = (x, y, S, modele, z0, kk) => {
      // l'anneau de tête : un disque aplati côté tige ; le trou ; l'épaulement ; la tige avec sa rainure
      const dT = Math.hypot(x - 7, y) - 11.2;
      const dCol = geo.boite(x - 19, y, 4, 7.2, 1.2);
      const larg = x < 44 ? 4.3 : lerp(4.3, 1.4, (x - 44) / 6);
      const dTige = Math.max(Math.abs(y + 0.3) - larg, 19 - x, x - 50);
      let d = Math.min(dT, dCol, dTige);
      d = Math.max(d, -(Math.hypot(x, y) - 2.5)); // le trou de l'anneau
      if (d > S.lim) { S.d = d; return; }
      S.d = d;
      const e = -d;
      const pente = z0 * (1 - clamp01((x + 2) / 55)); // les clés du dessus reposent sur celles du dessous
      S.z = pente + R.bord(e, 0.7, 2.3);
      const n = tx(T.c, x * 0.5 + oc[kk], y * 0.5 + oc[(kk + 1) % 3]);
      R.mat(S, modele, 1 + n * 0.06, 0.02 + n * 0.05);
      S.an = 0.1; S.gx = 1; S.gy = 0;
      // la rainure de la tige (le profil de la serrure), fraisée : plus sombre et en creux
      if (x > 20 && x < 47) {
        const rn = R.trait(y - 1.1, 1.3, 1 / S.ppm) + R.trait(y + 1.9, 0.6, 1 / S.ppm) * 0.7;
        if (rn > 0) { S.z -= rn * 0.6; S.r *= 1 - rn * 0.35; S.g *= 1 - rn * 0.35; S.b *= 1 - rn * 0.35; S.an *= 1 - rn; }
      }
      // un peu de ternissure, surtout au bord ; les arêtes polies
      const ter = sstep(0.2, 0.8, tx(T.b, x * 0.15 + oc[kk], y * 0.15 + oc[2]) + (1 - clamp01(e / 3)) * 0.3);
      if (modele === MAT.laiton) R.teinte(S, MAT.laitonTerni, ter * 0.55);
      else R.teinte(S, [0.25, 0.24, 0.22], ter * 0.3);
      S.ro += ter * 0.1;
      const ar = sstep(0.8, 0, e);
      if (ar > 0) S.ro -= ar * 0.1;
    };
    const maillechort = R.matiere('#c9c4b6', { ro: 0.22, me: 1 });
    const angles = [-0.62, 0.05, 0.7];
    const modeles = [MAT.laiton, maillechort, MAT.laiton];
    const couches = angles.map((a, k) => {
      const hx = RC[0] + Math.cos(a) * (RA - 1.2), hy = RC[1] + Math.sin(a) * (RA - 1.2);
      const c = Math.cos(a), s = Math.sin(a);
      return {
        box: [-45, -44, 52, 44],
        f(x, y, S) {
          const u = (x - hx) * c + (y - hy) * s, v = -(x - hx) * s + (y - hy) * c;
          cle(u, v, S, modeles[k], k * 2.1, k);
        },
      };
    });
    // l'anneau brisé : deux spires d'acier, par-dessus les têtes
    const spires = [];
    for (let k = 0; k <= 96; k++) {
      const t = k / 96, a = t * TAU * 1.9 - 0.6;
      const r = RA + 0.9 * Math.sin(t * Math.PI) - 0.5;
      spires.push([RC[0] + Math.cos(a) * r, RC[1] + Math.sin(a) * r, 5.4 + 0.8 * t]);
    }
    couches.push({
      tube: spires, r: 0.85,
      f(t, u, S) { R.mat(S, MAT.acierPoli, 0.95, 0.04); },
    });
    return {
      box: [-45, -44, 52, 44], haut: 8, couches,
      cavite: [1, 0.3], soleil: 0.6, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  /* ---------- la fermeture éclair : ruban noir, dents de laiton vieilli, curseur, ouverte au bout ---------- */
  def('fermeture', 'Fermeture éclair', [196, 44, 7], 'lace', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 109 + 43);
    const oc = [rng() * 256, rng() * 256];
    const RUBAN = R.matiere('#202024', { ro: 0.85, f0: 0.03, sh: 0.25 });
    const DENT = R.matiere('#b8955a', { ro: 0.3, me: 1 });
    const ecart = (x) => 8.5 * sstep(36, 98, x); // l'ouverture, à droite du curseur
    const pas = 3.2;
    return {
      box: [-100, -26, 100, 26], haut: 7,
      couches: [
        { // les deux rubans (tissu tissé, bords un peu effilochés)
          box: [-100, -26, 100, 26],
          f(x, y, S) {
            const dy = ecart(x);
            const yu = y + dy, yl = y - dy; // repère de chaque ruban
            const dU = Math.max(-16 - yu, yu + 2.2), dL = Math.max(yl - 16, 2.2 - yl);
            let d = Math.min(dU, dL);
            d = Math.max(d, Math.abs(x) - 97 + 0.6 * tx(T.c, y * 2, x > 0 ? 3 : 7));
            S.d = d;
            if (d > S.lim) return;
            const haut = dU < dL;
            const yy = haut ? yu : yl;
            S.z = 1.1 * R.bord(-d, 0.5, 1) + 0.2 * Math.cos(yy * 0.4);
            const tissage = (Math.sin(x * 4.2) * Math.sin(yy * 4.2)) * R.lod(0.75, S.ppm);
            R.mat(S, RUBAN, 1 + tissage * 0.18 + tx(T.b, x * 0.05 + oc[0], y * 0.2) * 0.1, 0);
            S.z += tissage * 0.04;
            // la couture qui borde le ruban (à 3 mm du bord extérieur) : un fil un peu plus clair
            const cou = R.trait(Math.abs(yy) - 13, 0.5, 1 / S.ppm) * (Math.abs(((x / 2.6) % 1 + 1) % 1 - 0.5) < 0.32 ? 1 : 0.3);
            if (cou > 0) { R.teinte(S, [0.09, 0.09, 0.1], cou * 0.8); S.z += cou * 0.15; }
          },
        },
        { // les dents : alternées, emboîtées là où c'est fermé
          box: [-96, -14, 97, 14],
          f(x, y, S) {
            if (x < -95 || x > 96) { S.d = 9; return; }
            const dy = ecart(x);
            // dent du haut (accrochée au ruban du haut) et du bas, décalées d'un demi-pas
            const kU = Math.round(x / pas), kL = Math.round((x - pas / 2) / pas);
            const xU = x - kU * pas, xL = x - (kL * pas + pas / 2);
            const dU = geo.boite(xU, y + dy + 0.6, 1.15, 3.2, 0.9);
            const dL = geo.boite(xL, y - dy - 0.6, 1.15, 3.2, 0.9);
            const d = Math.min(dU, dL);
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            const bosse = Math.max(0, 1 - Math.pow((dU < dL ? y + dy - 1.2 : -(y - dy) - 1.2) / 2.2, 2));
            S.z = 1 + R.bord(e, 0.7, 1.7) + bosse * 0.5;
            R.mat(S, DENT, 1, 0.04);
            const ter = sstep(0.2, 0.7, tx(T.b, x * 0.2 + oc[1], y * 0.3 + oc[0]));
            R.teinte(S, [0.28, 0.2, 0.09], ter * 0.5);
            S.ro += ter * 0.12;
          },
        },
        { // le curseur et sa tirette
          box: [4, -9, 56, 9],
          f(x, y, S) {
            // le corps (plus large vers l'ouverture), puis la tirette couchée vers la gauche
            const larg = lerp(5.8, 8.2, clamp01((x - 32) / 20));
            const dC = Math.max(Math.abs(y) - larg, 31 - x, x - 52);
            const dT = Math.max(geo.boite(x - 20, y, 13, 3.6, 3.2), -geo.boite(x - 12.5, y, 3.2, 1.5, 1.2));
            const d = Math.min(dC, dT);
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            if (dC < dT) {
              const q = clamp01(Math.abs(y) / larg);
              S.z = 3 + 3.6 * Math.sqrt(Math.max(0, 1 - q * q)) * R.bord(e, 1.2, 1);
            } else {
              S.z = 6.8 + R.bord(e, 0.7, 1.2) - clamp01((32 - x) / 26) * 1.6;
            }
            R.mat(S, DENT, 0.9, 0.08);
            R.teinte(S, [0.22, 0.17, 0.1], 0.35);
            const ar = sstep(0.8, 0, e);
            if (ar > 0) { R.teinte(S, [0.75, 0.62, 0.38], ar * 0.4); S.ro -= ar * 0.1; }
          },
        },
      ],
      cavite: [1, 0.35], soleil: 0.6, ombre: { opacite: 0.55, contact: 0.55 },
    };
  });

  /* ---------- la boîte de crème : fer-blanc doré, couvercle embouti, étiquette ronde (sans marque) ---------- */
  def('creme', 'Boîte de crème à chaussures', [84, 76, 30], 'chip', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 113 + 47);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const OR = R.matiere('#c39a52', { ro: 0.2, me: 1 });
    const CREME = lin('#e8dcc0'), BRUN = lin('#4a2a17'), TEINTE = lin('#6b3a1e');
    return {
      box: [-39, -39, 46, 39], haut: 30,
      couches: [
        { // la clé papillon, sur le côté
          box: [34, -6, 46, 6],
          f(x, y, S) {
            const d = Math.max(geo.boite(x - 40, y, 5.5, 4.4, 2), -geo.boite(x - 41.5, y, 1.4, 1.6, 0.6));
            S.d = d;
            if (d > S.lim) return;
            S.z = 15 + R.bord(-d, 0.5, 0.9);
            R.mat(S, MAT.acierBrosse, 0.9, 0.05);
          },
        },
        { // le couvercle
          box: [-39, -39, 39, 39],
          f(x, y, S) {
            const r = Math.hypot(x, y);
            const d = r - 38;
            S.d = d;
            if (d > S.lim) return;
            // le bord roulé, un jonc embouti, le dessus à peine bombé
            let z = 27.5 + 1.8 * Math.sqrt(Math.max(0, 1 - Math.pow((r - 36.3) / 1.9, 2))) * (r > 34.2 ? 1 : 0);
            if (r <= 34.2) z = 28 + 0.9 * (1 - (r / 34) * (r / 34)) + 0.5 * Math.exp(-Math.pow((r - 29.5) / 0.9, 2)) - 0.4 * Math.exp(-Math.pow((r - 33.4) / 0.7, 2));
            S.z = z;
            const n = tx(T.c, x * 0.3 + oc[0], y * 0.3 + oc[1]);
            R.mat(S, OR, 1 + n * 0.05, 0.03 + n * 0.04);
            // rayures, la dorure usée au bord (le fer-blanc apparaît)
            const us = sstep(0.4, 0.8, tx(T.b, x * 0.1 + oc[2], y * 0.1 + oc[1]) + (r > 35 ? 0.3 : 0));
            if (us > 0) R.teinte(S, MAT.acierBrosse, us * 0.55);
            // l'étiquette ronde : papier crème, un filet brun, la couleur de la crème
            if (r < 23) {
              const c = clamp01((23 - r) * S.ppm);
              R.teinte(S, CREME, c);
              S.me *= 1 - c; S.ro = lerp(S.ro, 0.6, c); S.f0 = 0.035;
              const filet = R.trait(r - 20.5, 0.8, 1 / S.ppm) + R.trait(r - 18.8, 0.35, 1 / S.ppm);
              if (filet > 0) R.teinte(S, BRUN, Math.min(1, filet) * 0.85);
              const pastille = clamp01((10.5 - r) * S.ppm);
              if (pastille > 0) R.teinte(S, TEINTE, pastille);
              // quelques lignes de texte fondues (illisibles d'ici), au-dessus et au-dessous de la pastille
              const ligne = (Math.abs(y + 14.8) < 0.8 || Math.abs(y - 14.6) < 0.6) && Math.abs(x) < 9 ? 1 : 0;
              if (ligne && r > 11) R.teinte(S, BRUN, 0.55 * (0.6 + 0.4 * Math.sin(x * 3.1)));
              const vieux = sstep(0.3, 0.8, tx(T.a, x * 0.1 + oc[1], y * 0.1 + oc[2]));
              R.teinte(S, [0.45, 0.36, 0.22], vieux * 0.3);
            }
            // des traces de cirage sur le couvercle
            const cir = sstep(0.55, 0.8, tx(T.b, x * 0.08 + oc[0], y * 0.08 + oc[2]));
            if (cir > 0 && r > 22) { R.teinte(S, [0.05, 0.03, 0.02], cir * 0.6); S.me *= 1 - cir * 0.5; }
          },
        },
      ],
      cavite: [1.5, 0.3], soleil: 0.8, ombre: { opacite: 0.6, contact: 0.5 },
    };
  });

  /* ---------- la bobine de fil ciré : couchée, joues noires, fil de lin enroulé, un bout qui traîne ---------- */
  def('fil', 'Bobine de fil ciré', [96, 52, 50], 'sew', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 127 + 53);
    const oc = [rng() * 256, rng() * 256];
    const FIL = R.matiere('#cdb68a', { ro: 0.4, f0: 0.045 });
    const bout = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40;
      const x = lerp(12, 64, t) + Math.sin(t * 5) * 4, y = lerp(-20, 21, t) + Math.sin(t * 3.4 + 1) * 6;
      const z = t < 0.25 ? lerp(44, 0.8, sstep(0, 0.25, t)) : 0.8;
      bout.push([x, y, z]);
    }
    return {
      box: [-36, -27, 70, 27], haut: 50,
      couches: [
        { // les joues (plastique noir) et le fil enroulé
          box: [-36, -27, 36, 27],
          f(x, y, S) {
            const ax = Math.abs(x);
            const joue = ax > 25.5 && ax < 31;
            const R0 = joue ? 25 : 21.5;
            let d = Math.max(Math.abs(y) - R0, ax - 31);
            if (!joue && ax >= 31) d = 9;
            S.d = d;
            if (d > S.lim) return;
            S.z = revolution(y, R0, 25);
            if (joue) {
              R.mat(S, MAT.plastiqueNoir, 1.1, 0.05);
              const ar = sstep(29, 30.8, ax) + sstep(27, 25.6, ax);
              S.z -= ar * 0.6;
            } else {
              // les spires croisées : un léger losange (le bobinage), les fils visibles de près
              const q = y / R0;
              const u = Math.asin(Math.max(-1, Math.min(1, q))) * R0; // abscisse le long de la circonférence
              const sp = Math.sin((x + u * 0.12) * (TAU / 0.8)) * R.lod(0.8, S.ppm);
              const cr = Math.sin((x * 0.45 + u) * (TAU / 7)) * Math.sin((x * 0.45 - u) * (TAU / 7));
              R.mat(S, FIL, 1 + sp * 0.08 + cr * 0.04, 0);
              S.z += sp * 0.05 + cr * 0.12;
              S.an = 0.12; S.gx = 0; S.gy = 1;
              const sale = sstep(0.4, 0.8, tx(T.b, x * 0.1 + oc[0], y * 0.1 + oc[1]));
              R.teinte(S, [0.3, 0.24, 0.16], sale * 0.3);
            }
          },
        },
        {
          tube: bout, r: 0.55,
          f(t, u, S) { R.mat(S, FIL, 0.95, 0); },
        },
      ],
      cavite: [1.6, 0.25], soleil: 1, ombre: { opacite: 0.6, contact: 0.5 },
    };
  });

  /* ---------- le chiffon : un torchon de coton plié en quatre, ourlé, un coin retourné, taché de cirage ---------- */
  def('chiffon', 'Chiffon de lustrage', [140, 112, 9], 'brush', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 131 + 59);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    // quatre épaisseurs, un peu décalées (on l'a plié vite) ; les plis à gauche et en haut, les ourlets à droite et en bas
    const couchesT = [];
    for (let k = 0; k < 4; k++) couchesT.push({ dx: rng.range(-2.5, 2.5) + k * 0.8, dy: rng.range(-2.5, 2.5) + k * 0.6, a: rng.range(-0.03, 0.03) });
    const plis = [];
    for (let i = 0; i < 4; i++) {
      const a = rng.range(-0.9, 0.9) + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      plis.push({ c, s, o: rng.range(-30, 30), w: rng.range(2.5, 6), h: rng.range(1, 2.2) * (rng() < 0.4 ? -1 : 1), l: rng.range(40, 90) });
    }
    const TISSU = R.matiere('#d6d0c3', { ro: 0.95, f0: 0.02, sh: 0.4 });
    const CIRAGE = lin('#3a2416'), NOIR = lin('#141111');
    const HW = 66, HH = 52; // demi-côtés
    const coinX = HW - 2, coinY = HH - 2, coinL = 34; // le coin retourné (en bas à droite)
    return {
      box: [-72, -58, 72, 58], haut: 9,
      couches: [{
        box: [-72, -58, 72, 58],
        f(x, y, S) {
          // combien d'épaisseurs sous ce point ? (et la distance au bord de la plus haute)
          let n = 0, dmin = 9, eh = 0;
          for (let k = 0; k < 4; k++) {
            const L = couchesT[k], c = Math.cos(L.a), s = Math.sin(L.a);
            const u = (x - L.dx) * c + (y - L.dy) * s, v = -(x - L.dx) * s + (y - L.dy) * c;
            const ond = tx(T.c, u * 0.06 + k * 5, v * 0.06) * 2.2;
            const d = geo.boite(u, v, HW - k * 0.7, HH - k * 0.6, 4) - ond;
            if (d < dmin) dmin = d;
            if (d < 0) { n++; eh = -d; }
          }
          // le coin retourné : un triangle rabattu par-dessus
          const tc = (x - (coinX - coinL)) + (y - (coinY)) ;
          const flap = x > coinX - coinL && y > coinY - coinL && (coinX - x) + (coinY - y) < coinL;
          const d = dmin;
          S.d = d;
          if (d > S.lim) return;
          const bord = sstep(0, 3.5, eh);
          // les plis (à gauche et en haut) sont ronds et gonflés ; les ourlets (à droite, en bas) plats et cousus
          const ctePli = x < -HW + 8 || y < -HH + 8;
          let z = 0.9 + 1.5 * n * (0.55 + 0.45 * bord) + (ctePli ? 1.2 * Math.exp(-eh / 3) : 0);
          for (const p of plis) {
            const u = x * p.c + y * p.s - p.o, v = -x * p.s + y * p.c;
            if (Math.abs(v) < p.l) z += p.h * Math.exp(-(u * u) / (p.w * p.w)) * (1 - Math.abs(v) / p.l);
          }
          if (flap) z += 1.6 * sstep(0, 2, Math.min(coinX - x, coinY - y, coinL - (coinX - x) - (coinY - y)) + 1);
          S.z = z;
          // la toile de coton : trame fine, un peu de peluche ; les ourlets piqués
          const trame = (Math.sin(x * 4.6) * Math.sin(y * 4.6)) * R.lod(0.7, S.ppm);
          R.mat(S, TISSU, 0.96 + trame * 0.05 + tx(T.c, x * 0.2 + oc[1], y * 0.2) * 0.05, 0);
          S.z += trame * 0.04;
          if (!ctePli) {
            const ourlet = R.trait(eh - 3, 0.5, 1 / S.ppm) * (((x + y) * 0.6) % 2 < 1.3 ? 1 : 0.3);
            if (ourlet > 0) { R.teinte(S, [0.42, 0.4, 0.36], ourlet * 0.6); S.z -= ourlet * 0.1; }
          }
          if (flap) { R.teinte(S, [0.6, 0.57, 0.52], 0.15); }
          // le cirage : des taches brunes et noires, des doigts essuyés
          const t1 = sstep(0.12, 0.5, tx(T.b, x * 0.05 + oc[2], y * 0.05 + oc[3]));
          const t2 = sstep(0.3, 0.65, tx(T.a, x * 0.04 + oc[0], y * 0.04 + oc[2]));
          R.teinte(S, CIRAGE, t1 * 0.6);
          R.teinte(S, NOIR, t2 * 0.55);
          R.teinte(S, [0.35, 0.32, 0.28], sstep(0.2, 0.7, tx(T.c, x * 0.12 + oc[1], y * 0.12)) * 0.25); // gris, usé
          void tc;
        },
      }],
      adoucir: 0.25, cavite: [3, 0.1], soleil: 1.2, ombre: { opacite: 0.55, contact: 0.55 },
    };
  });

  /* ======================================================================
     Les pièces : une basket montante et un derby, vus de dessus
     ====================================================================== */
  /* la basket montante (à nettoyer) : cuir blanc, empiècements de daim gris, semelle blanche un peu jaunie,
     col matelassé, languette, lacets plats croisés sur six paires d'œillets. Repère : talon à −x, bout à +x. */
  def('sneaker', 'Basket montante', [300, 114, 138], 'knock', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 137 + 61);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const Ls = 300, Ws = 114, ZS = 27; // la semelle : dessus du bord à 27 mm
    const M = yield* modele('sneaker:' + o.graine, function* () {
      const P = contourPied(Ls, Ws);
      const box = [-156, -62, 156, 62];
      const F = yield* R.champ(box, 2.5, (g) => { tracePoly(g, P); g.fill(); });
      // les empiècements : le daim gris clair (bout, garde, contrefort), le cuir gris des œillets, les coutures
      const daim = yield* R.masqueG(box, 3, (g) => {
        g.save();
        tracePoly(g, P);
        g.clip();
        // le bout rapporté
        g.beginPath();
        g.moveTo(104, -70); g.bezierCurveTo(116, -20, 116, 20, 104, 70); g.lineTo(170, 70); g.lineTo(170, -70); g.closePath();
        g.fill();
        // la bande de garde le long de la semelle, et le contrefort du talon
        g.lineWidth = 22;
        tracePoly(g, P); g.stroke();
        g.beginPath(); g.ellipse(-150, 0, 42, 60, 0, 0, TAU); g.fill();
        g.restore();
      });
      const gris = yield* R.masqueG(box, 3, (g) => {
        // les porte-œillets : deux bandes le long de l'ouverture du laçage
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(62, s * 9); g.lineTo(-58, s * 10.5); g.lineTo(-62, s * 27); g.bezierCurveTo(-20, s * 28, 30, s * 27, 70, s * 21);
          g.closePath();
          g.fill();
        }
      });
      const coutures = yield* R.masqueG(box, 4, (g) => {
        // les coutures : doubles piqûres le long des empiècements (tirets)
        g.lineWidth = 0.45;
        g.setLineDash([1.6, 1.1]);
        g.beginPath(); g.moveTo(100, -60); g.bezierCurveTo(111, -20, 111, 20, 100, 60); g.stroke();
        g.beginPath(); g.moveTo(98, -60); g.bezierCurveTo(108.5, -20, 108.5, 20, 98, 60); g.stroke();
        for (const s of [-1, 1]) {
          g.beginPath(); g.moveTo(60, s * 23); g.bezierCurveTo(30, s * 25, -20, s * 26, -58, s * 25); g.stroke();
        }
        g.setLineDash([]);
      });
      // la profondeur au milieu (pour bomber la tige d'un bord à l'autre)
      const emax = table((x) => Math.max(8, -F.get(x, 0)), -150, 150, 200);
      return { P, F, daim, gris, coutures, emax };
    });
    const F = M.F, emax = M.emax;
    const retrait = table(monotone([[-152, 3], [-120, 4.5], [-40, 5.5], [60, 5.5], [120, 4.5], [152, 3]]), -152, 152);
    const crete = table(monotone([[152, 33], [140, 44], [124, 53], [100, 61], [74, 67], [50, 73], [26, 83], [2, 95], [-22, 108], [-44, 120], [-62, 127], [-100, 129], [-136, 125], [-152, 112]]), -152, 152);
    // l'ouverture du col (l'intérieur), le col matelassé autour
    const OX = -97, OY = 1, OA = 43, OB = 27.5;
    const zCorps = (x, y) => {
      const e = -(F.get(x, y) + retrait(x));
      const q = clamp01(e / Math.max(6, emax(x) - retrait(x)));
      return ZS + (crete(x) - ZS) * (1 - Math.pow(1 - q, 2.3));
    };
    // le laçage : l'ouverture entre les porte-œillets, les œillets
    const demiFente = (x) => lerp(9, 10.5, clamp01((58 - x) / 116));
    const oeillets = [];
    for (let k = 0; k < 6; k++) {
      const x = 50 - k * 18.6, yy = demiFente(x) + 5;
      oeillets.push([x, -yy], [x, yy]);
    }
    const surface = (x, y) => { // le dessus (pour poser les lacets)
      let z = zCorps(x, y);
      if (Math.abs(y) < demiFente(x) + 2 && x > -62 && x < 58) z += 3;
      return z;
    };
    const couches = [];
    // --- la semelle (le bord blanc qui dépasse), un peu jaunie, éraflée
    const GOMME = MAT.gommeBlanche, JAUNE = lin('#d8c79a');
    couches.push({
      box: [-156, -62, 156, 62],
      f(x, y, S) {
        const d = F.get(x, y);
        S.d = d;
        if (d > S.lim) return;
        const e = -d;
        const bout = sstep(118, 150, x) * 6; // l'avant remonte (pare-pierres)
        S.z = R.bord(e, 2.2, ZS + bout);
        R.mat(S, GOMME, 1, 0.02);
        R.teinte(S, JAUNE, 0.25 + 0.35 * sstep(3, 0, e) + tx(T.a, x * 0.03 + oc[0], y * 0.05) * 0.1);
        const eraf = sstep(0.55, 0.8, tx(T.b, x * 0.12 + oc[1], y * 0.2 + oc[2]));
        R.teinte(S, [0.3, 0.27, 0.22], eraf * 0.35);
        // les stries moulées sur le chant (on les devine sur l'arrondi)
        const st = R.trait(((x * 0.9) % 2.2 + 2.2) % 2.2 - 1.1, 0.5, 1 / S.ppm) * sstep(2.2, 0.5, e) * R.lod(2.2, S.ppm);
        S.z -= st * 0.3;
      },
    });
    // --- la tige : cuir blanc bombé, empiècements gris, plis, salissures ; le col et l'intérieur
    const BLANC = MAT.cuirBlanc, DAIM = R.matiere('#a8a6a0', { ro: 0.9, f0: 0.02, sh: 0.45 }), GRIS = R.matiere('#8d8b86', { ro: 0.42, f0: 0.04 });
    const DOUBLURE = lin('#2e2d2e'), SEMELLE_INT = lin('#6f6b64'), SALE = lin('#7a6a55');
    couches.push({
      box: [-153, -59, 153, 59],
      f(x, y, S) {
        const d = F.get(x, y) + retrait(x);
        S.d = d;
        if (d > S.lim) return;
        let z = zCorps(x, y);
        const dO = geo.ellipse(x - OX, y - OY, OA, OB);
        // les plis de marche sur l'empeigne
        const pli = x > 60 && x < 108 ? Math.sin((x - 60) * 0.42 + y * 0.05) * sstep(28, 0, Math.abs(y)) * 0.6 : 0;
        z += pli;
        // matière de base : le cuir blanc, légèrement grainé
        const grain = tx(T.e, x * 0.7 + oc[0], y * 0.7 + oc[1]) * R.lod(0.9, S.ppm);
        R.mat(S, BLANC, 0.98 + grain * 0.03, grain * 0.04);
        S.z = z + grain * 0.03;
        // le col : bourrelet matelassé autour de l'ouverture, puis l'intérieur (doublure sombre, première grise)
        if (dO < 12) {
          if (dO > 0) {
            const t = dO / 12;
            S.z = Math.max(z, 128 + 7 * Math.sqrt(Math.max(0, 1 - (t - 0.45) * (t - 0.45) / 0.3)));
            R.mat(S, BLANC, 0.95, 0.06);
          } else {
            const t = sstep(0, 9, -dO);
            S.z = lerp(126, 34, t);
            R.mat(S, BLANC, 1, 0.1);
            R.teinte(S, DOUBLURE, sstep(0, 3, -dO));
            if (-dO > 9) R.teinte(S, SEMELLE_INT, 0.7);
            S.ao = 1 - t * 0.5;
          }
        }
        // la languette, entre les porte-œillets (elle dépasse au-dessus du col)
        const fente = demiFente(x);
        if (x > -66 && x < 58 && Math.abs(y) < fente + 2.5) {
          const u = clamp01((fente + 2.5 - Math.abs(y)) / 3);
          const haut = x < -44 ? (-44 - x) * 0.65 : 0;
          S.z = Math.max(S.z, zCorps(x, y) + 2.5 * u + haut);
          R.mat(S, BLANC, 0.93, 0.12);
          const maille = (Math.sin(x * 3.2) * Math.sin(y * 3.2)) * R.lod(1, S.ppm);
          S.r *= 1 + maille * 0.05; S.g *= 1 + maille * 0.05; S.b *= 1 + maille * 0.05;
        }
        // les empiècements : daim gris clair, cuir gris sous les œillets (un peu en relief)
        const p1 = M.daim.get(x, y), p2 = M.gris.get(x, y);
        if (p1 > 0 && dO > 12) {
          R.mat(S, DAIM, 1 + tx(T.c, x * 0.5 + oc[2], y * 0.5 + oc[3]) * 0.08, 0);
          R.teinte(S, BLANC, 1 - p1);
          S.z += 0.9 * p1;
        }
        if (p2 > 0) {
          const k = p2;
          R.teinte(S, GRIS, k);
          S.ro = lerp(S.ro, GRIS.ro, k);
          S.sh *= 1 - k;
          S.z += 0.8 * k;
        }
        const cou = M.coutures.get(x, y) * R.lod(1.4, S.ppm);
        if (cou > 0) { R.teinte(S, [0.45, 0.44, 0.41], cou * 0.7); S.z -= cou * 0.15; }
        // à nettoyer : salissures vers le bout et sur les côtés, poussière dans les plis
        const sale = sstep(0.25, 0.8, tx(T.b, x * 0.05 + oc[0], y * 0.08 + oc[1]) * 0.6 + sstep(80, 150, x) * 0.35 + sstep(-8, 0, d) * 0.4);
        R.teinte(S, SALE, sale * 0.35);
      },
    });
    // --- les œillets (anneaux d'acier)
    couches.push({
      box: [-50, -24, 58, 24],
      f(x, y, S) {
        let best = 9, bx = 0, by = 0;
        for (const [ex, ey] of oeillets) {
          const dd = Math.hypot(x - ex, y - ey);
          if (dd < best) { best = dd; bx = ex; by = ey; }
        }
        const d = Math.max(best - 3.1, 1.3 - best);
        S.d = d;
        if (d > S.lim) return;
        S.z = surface(bx, by) + 1.2 + 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((best - 2.2) / 0.9, 2)));
        R.mat(S, MAT.acierPoli, 0.9, 0.08);
      },
    });
    // --- les lacets plats, croisés ; les deux bouts retombent sur l'établi
    const LACET = R.matiere('#efece4', { ro: 0.7, f0: 0.03, sh: 0.2 });
    const brins = [];
    const pose = (a, b, dz, n = 10) => {
      const pts = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
        pts.push([x, y, surface(x, y) + 1.6 + dz * Math.sin(Math.PI * t)]);
      }
      return pts;
    };
    brins.push(pose(oeillets[0], oeillets[1], 0.4));
    for (let k = 0; k < 5; k++) {
      const a0 = oeillets[2 * k], a1 = oeillets[2 * k + 1], b0 = oeillets[2 * k + 2], b1 = oeillets[2 * k + 3];
      brins.push(pose(a0, b1, k % 2 ? 1.6 : 0.3));
      brins.push(pose(a1, b0, k % 2 ? 0.3 : 1.6));
    }
    // les bouts : du dernier œillet, par-dessus le col, jusque sur l'établi
    const ferrets = [];
    for (const s of [-1, 1]) {
      const e0 = oeillets[s < 0 ? 10 : 11], pts = [];
      const tourne = s < 0 ? 1.1 : -0.7; // chacun retombe à sa façon
      for (let k = 0; k <= 34; k++) {
        const t = k / 34;
        const x = e0[0] - t * 22 + Math.sin(t * 2.2) * 10 * tourne + t * t * 18, y = e0[1] + s * (t * 58 - t * t * 8);
        const inside = F.get(x, y) + retrait(x) < 0;
        const z = inside ? surface(x, y) + 1.6 : lerp(surface(e0[0], e0[1]) * 0.5, 0.8, sstep(0.35, 0.75, t));
        pts.push([x, y, Math.max(0.8, z)]);
      }
      brins.push(pts);
      ferrets.push(pts.slice(-6));
    }
    for (const b of brins) {
      couches.push({
        tube: b, r: 3.8, plat: 0.75,
        f(t, u, S) {
          R.mat(S, LACET, 1 - Math.abs(u) * 0.05, 0);
          const tr = Math.sin(t * 5.5) * R.lod(1.2, S.ppm);
          S.r *= 1 + tr * 0.04; S.g *= 1 + tr * 0.04; S.b *= 1 + tr * 0.04;
        },
      });
    }
    // les ferrets (acétate clair, un peu brillant) au bout des deux lacets
    for (const fr of ferrets) {
      couches.push({ tube: fr.map((p) => [p[0], p[1], p[2] + 0.4]), r: 2.4, f(t, u, S) { R.mat(S, MAT.plastiqueBlanc, 0.85, 0); S.ro = 0.18; } });
    }
    return {
      box: [-160, -80, 156, 80], haut: 138, couches,
      cavite: [3, 0.1], soleil: 1.4, ombre: { opacite: 0.58, contact: 0.5, doux: 1.1 },
    };
  });


  /* ======================================================================
     L'encombrement : ce qui traîne sur l'établi (cuit dans le fond, jamais animé)
     ====================================================================== */

  /* ---------- un pot de colle ouvert, un pinceau planté dedans ---------- */
  def('pot-pinceau', 'Pot de colle ouvert et son pinceau', [150, 90, 96], 'glue', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 139 + 67);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const RB = 44, HB = 62, HC = 47; // rayon et hauteur de la boîte, niveau de la colle
    const COLLE = lin('#5b3b19'), PEAU = lin('#7a5327'), FER = R.matiere('#b9b3a6', { ro: 0.3, me: 1 });
    const a = rng.range(-0.5, 0.5); // le pinceau : il sort vers la droite, un peu de biais
    const ca = Math.cos(a), sa = Math.sin(a);
    const manche = [];
    for (let k = 0; k <= 30; k++) {
      const t = k / 30, l = lerp(6, 112, t);
      manche.push([ca * l, sa * l, lerp(HC + 2, HB + 34, t)]);
    }
    const virole = [];
    for (let k = 0; k <= 6; k++) { const l = lerp(-4, 8, k / 6); virole.push([ca * l, sa * l, lerp(HC, HC + 3.5, k / 6)]); }
    const bois = R.matiere('#9c4a2e', { ro: 0.4, f0: 0.045 }); // manche peint en rouge, écaillé
    return {
      box: [-46, -46, 118, 46], haut: 96,
      couches: [
        { // la boîte de fer-blanc : le bord roulé, la paroi intérieure, la colle (une peau ridée, brillante)
          box: [-46, -46, 46, 46],
          f(x, y, S) {
            const r = Math.hypot(x, y);
            const d = r - RB;
            S.d = d;
            if (d > S.lim) return;
            if (r > RB - 2.6) { // le bord roulé
              const q = (r - (RB - 1.3)) / 1.3;
              S.z = HB - 1.3 + 1.3 * Math.sqrt(Math.max(0, 1 - q * q));
              R.mat(S, FER, 0.95, 0.05);
            } else if (r > RB - 4.2) { // la paroi, vue d'en haut : elle plonge vers la colle
              const t = (RB - 2.6 - r) / 1.6;
              S.z = lerp(HB - 1.5, HC + 1, t);
              R.mat(S, FER, 0.7, 0.2);
              S.ao = 0.55;
            } else { // la colle
              S.z = HC + 0.6 * tx(T.b, x * 0.12 + oc[0], y * 0.12 + oc[1]) + 0.4 * sstep(RB - 10, RB - 4.2, r);
              R.mat(S, MAT.plastiqueNoir);
              R.teinte(S, COLLE, 1);
              S.ro = 0.14; S.f0 = 0.05;
              // la peau qui sèche : des rides fines, plus claire au bord
              const ride = Math.sin(tx(T.c, x * 0.3 + oc[2], y * 0.3) * 9) * R.lod(1.2, S.ppm);
              S.z += ride * 0.15;
              R.teinte(S, PEAU, sstep(RB - 12, RB - 4, r) * 0.6);
            }
            // la colle séchée sur le bord et qui a coulé
            const cr = sstep(0.35, 0.75, tx(T.c, Math.atan2(y, x) * 5 + oc[1], r * 0.2)) * sstep(RB - 6, RB - 1, r);
            if (cr > 0) { R.teinte(S, PEAU, cr * 0.8); S.me *= 1 - cr; S.ro = lerp(S.ro, 0.2, cr); S.z += cr * 0.5; }
          },
        },
        { tube: virole, r: 5.8, plat: 0.4, f(t, u, S) { R.mat(S, FER, 0.85, 0.08); R.teinte(S, COLLE, 0.45); } },
        {
          tube: manche, r: (t) => lerp(4.4, 5.2, clamp01(t / 90)),
          f(t, u, S) {
            R.mat(S, bois, 1 + tx(T.c, t * 0.3 + oc[2], u * 3) * 0.08, 0);
            // la peinture écaillée (le bois apparaît), la colle qui a coulé le long du manche
            const ec = sstep(0.4, 0.6, tx(T.b, t * 0.25 + oc[0], u * 2 + oc[1]));
            R.teinte(S, [0.42, 0.3, 0.18], ec * 0.8);
            const cl = sstep(35, 5, t) + sstep(0.55, 0.7, tx(T.c, t * 0.4, u + oc[2])) * 0.6;
            R.teinte(S, COLLE, Math.min(1, cl) * 0.7);
            S.ro = lerp(S.ro, 0.15, Math.min(1, cl));
          },
        },
      ],
      cavite: [3, 0.08], soleil: 1.2, ombre: { opacite: 0.58, contact: 0.5, doux: 1.1 },
    };
  });

  /* ---------- une boîte de teinture ouverte (noire, brune ou bordeaux) ---------- */
  def('boite-teinture', 'Boîte de teinture ouverte', [66, 66, 38], 'chip', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 149 + 71);
    const oc = [rng() * 256, rng() * 256];
    const TEINTES = ['#16110e', '#3b1d10', '#4a1119', '#241a14'];
    const TEI = lin(TEINTES[Math.floor(rng() * TEINTES.length)]);
    const RB = 31, HB = 36, HC = 29;
    const OR = R.matiere(rng() < 0.5 ? '#b89452' : '#a9a49a', { ro: 0.25, me: 1 });
    return {
      box: [-33, -33, 33, 33], haut: 38,
      couches: [{
        box: [-33, -33, 33, 33],
        f(x, y, S) {
          const r = Math.hypot(x, y), d = r - RB;
          S.d = d;
          if (d > S.lim) return;
          if (r > RB - 2.2) {
            const q = (r - (RB - 1.1)) / 1.1;
            S.z = HB - 1 + 1.1 * Math.sqrt(Math.max(0, 1 - q * q));
            R.mat(S, OR, 1, 0.04);
          } else if (r > RB - 3.4) {
            S.z = lerp(HB - 1.2, HC + 0.5, (RB - 2.2 - r) / 1.2);
            R.mat(S, OR, 0.6, 0.2);
            S.ao = 0.5;
          } else {
            // la teinture : un miroir sombre, à peine ridé
            S.z = HC + 0.08 * tx(T.c, x * 0.2 + oc[0], y * 0.2 + oc[1]);
            R.mat(S, MAT.plastiqueNoir);
            R.teinte(S, TEI, 1);
            S.ro = 0.04; S.f0 = 0.05;
          }
          // des coulures de teinture sur le bord
          const cl = sstep(0.4, 0.7, tx(T.c, Math.atan2(y, x) * 4 + oc[1], 3)) * sstep(RB - 3, RB - 0.5, r);
          if (cl > 0) { R.teinte(S, TEI, cl); S.me *= 1 - cl; S.ro = lerp(S.ro, 0.1, cl); }
        },
      }],
      cavite: [2, 0.12], soleil: 1, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  /* ---------- un rouleau de ruban de masquage ---------- */
  def('ruban', 'Rouleau de ruban de masquage', [80, 80, 24], 'flick', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 151 + 73);
    const oc = [rng() * 256, rng() * 256];
    const RE = rng.range(33, 39), RI = 25.5, RT = 22.5; // extérieur (il en reste plus ou moins), mandrin, trou
    const CREPE = R.matiere('#d9c79a', { ro: 0.85, f0: 0.03 }), CARTON = R.matiere('#8f7a5c', { ro: 0.8, f0: 0.03 });
    const aB = rng() * TAU; // le bout du ruban, décollé
    return {
      box: [-44, -44, 44, 44], haut: 24,
      couches: [{
        box: [-44, -44, 44, 44],
        f(x, y, S) {
          const r = Math.hypot(x, y), a = Math.atan2(y, x);
          // le bout décollé : une languette qui dépasse du rouleau
          const da = Math.abs(((a - aB + Math.PI * 3) % TAU) - Math.PI);
          const lang = da < 0.35 ? (1 - da / 0.35) * 5 : 0;
          const d = Math.max(r - (RE + lang), RT - r);
          S.d = d;
          if (d > S.lim) return;
          if (r > RE) { // la languette (une seule épaisseur de papier, relevée)
            S.z = 24 + (r - RE) * 0.3;
            R.mat(S, CREPE, 0.95, 0);
          } else if (r > RI) { // la tranche du rouleau : des spires très fines, le papier crêpé
            S.z = 24 - 0.4 * sstep(RE - 0.8, RE, r) - 0.3 * sstep(RI + 0.8, RI, r);
            const spire = Math.sin(r * 9) * R.lod(0.7, S.ppm);
            R.mat(S, CREPE, 1 + spire * 0.04 + tx(T.c, a * 8 + oc[0], r * 0.5) * 0.05, 0);
            S.z += spire * 0.02;
            // la tranche se salit : poussière, colle, doigts
            const sale = sstep(0.3, 0.8, tx(T.b, x * 0.1 + oc[1], y * 0.1 + oc[0]) + sstep(RE - 3, RE, r) * 0.3);
            R.teinte(S, [0.25, 0.2, 0.14], sale * 0.4);
          } else { // le mandrin de carton
            S.z = 24.6;
            R.mat(S, CARTON, 1 + tx(T.c, a * 6 + oc[1], r) * 0.08, 0);
            if (r < RT + 0.8) S.ao = 0.7;
          }
        },
      }],
      cavite: [1.5, 0.2], soleil: 0.8, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  /* ---------- un cône de fil (fil à coudre les semelles), debout ---------- */
  def('cone-fil', 'Cône de fil', [70, 70, 110], 'sew', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 157 + 79);
    const oc = [rng() * 256, rng() * 256];
    const COULEURS = ['#e8e2d2', '#1b1a1a', '#c9a878', '#5b3a24', '#e8e2d2'];
    const FIL = R.matiere(COULEURS[Math.floor(rng() * COULEURS.length)], { ro: 0.5, f0: 0.04, sh: 0.2 });
    const R0 = 34, R1 = 17, H = 108; // le cône de fil : large en bas, étroit en haut
    return {
      box: [-36, -36, 36, 36], haut: 112,
      couches: [{
        box: [-36, -36, 36, 36],
        f(x, y, S) {
          const r = Math.hypot(x, y), a = Math.atan2(y, x);
          const d = r - R0;
          S.d = d;
          if (d > S.lim) return;
          if (r > R1) { // le flanc du cône de fil
            const t = (R0 - r) / (R0 - R1);
            S.z = lerp(4, H - 6, Math.pow(t, 0.9));
            // les spires croisées : un fin losange (bobinage croisé), un peu de peluche
            const u = a * r;
            const cr = Math.sin((u + r * 1.2) * 0.9) * Math.sin((u - r * 1.2) * 0.9) * R.lod(1.8, S.ppm);
            R.mat(S, FIL, 1 + cr * 0.06, 0);
            S.z += cr * 0.2;
            S.an = 0.1; S.gx = -Math.sin(a); S.gy = Math.cos(a);
          } else { // le haut du tube de carton, et son trou
            const dT = r - 7.5;
            S.z = H + (dT > 0 ? 1.2 : -8 * sstep(0, -1.5, dT));
            R.mat(S, MAT.carton, 0.9, 0);
            if (dT < 0) S.ao = 0.35;
          }
        },
      }],
      cavite: [2.5, 0.08], soleil: 1.2, ombre: { opacite: 0.56, contact: 0.5, doux: 1.1 },
    };
  });

  /* ---------- une coupelle de semences (les petits clous du cordonnier) ---------- */
  def('coupelle-clous', 'Coupelle de semences', [80, 80, 16], 'chip', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 163 + 83);
    const RB = 38, HB = 14;
    // les semences : une tige effilée et une tête ronde, en tas (plus haut au milieu)
    const clous = [], C = cases(-40, -40, 40, 40, 8);
    const n = 70;
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(rng()) * (RB - 9), aa = rng() * TAU;
      const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr, a = rng() * TAU, l = rng.range(9, 14);
      const hx = x + Math.cos(a) * l * 0.5, hy = y + Math.sin(a) * l * 0.5; // la tête
      const px = x - Math.cos(a) * l * 0.5, py = y - Math.sin(a) * l * 0.5; // la pointe
      const z = 3 + (1 - rr / RB) * 5 + i * 0.03;
      const e = { hx, hy, px, py, z, bleu: rng() < 0.75 };
      clous.push(e);
      C.ajoute(Math.min(hx, px) - 2.5, Math.min(hy, py) - 2.5, Math.max(hx, px) + 2.5, Math.max(hy, py) + 2.5, e);
    }
    const BLEU = R.matiere('#3a3f4a', { ro: 0.28, me: 1 }), CLAIR = R.matiere('#b0aa9e', { ro: 0.25, me: 1 });
    const FER = R.matiere('#8e8a82', { ro: 0.4, me: 1 });
    return {
      box: [-40, -40, 40, 40], haut: 16,
      couches: [
        { // la coupelle (fer-blanc embouti, terni)
          box: [-40, -40, 40, 40],
          f(x, y, S) {
            const r = Math.hypot(x, y), d = r - RB;
            S.d = d;
            if (d > S.lim) return;
            const q = clamp01((RB - r) / 7);
            S.z = r > RB - 1.8 ? HB - 0.8 + 0.8 * Math.sqrt(Math.max(0, 1 - Math.pow((r - RB + 0.9) / 0.9, 2))) : lerp(HB - 1, 2.5, Math.sqrt(q));
            R.mat(S, FER, 1 + tx(T.c, x * 0.3, y * 0.3) * 0.1, 0.05);
            S.ao = r < RB - 2 ? 0.8 : 1;
          },
        },
        { // les semences
          box: [-36, -36, 36, 36],
          f(x, y, S) {
            const L = C.lire(x, y);
            if (!L) { S.d = 9; return; }
            let best = null, bd = 9, bz = -1, bt = 0;
            for (const e of L) {
              const dt = geo.seg(x, y, e.hx, e.hy, e.px, e.py), t = geo.t;
              const rt = 0.85 * (1 - t) + 0.15; // la tige s'effile vers la pointe
              const dh = Math.hypot(x - e.hx, y - e.hy) - 1.7;
              const dd = Math.min(dt - rt, dh);
              if (dd < 0.6 && e.z > bz) { best = e; bd = dd; bz = e.z; bt = dh < dt - rt ? -1 : t; }
            }
            if (!best) { S.d = 9; return; }
            S.d = bd;
            if (bd > S.lim) return;
            S.z = best.z + (bt < 0 ? 1.2 : 0.8) * Math.sqrt(clamp01(-bd / 0.9));
            R.mat(S, best.bleu ? BLEU : CLAIR, 1, 0);
          },
        },
      ],
      cavite: [1.2, 0.35], soleil: 0.6, ombre: { opacite: 0.55, contact: 0.5 },
    };
  });

  /* ---------- un talon empilé, couché sur le côté (les lamelles de cuir, le bonbout en gomme) ---------- */
  def('talon-bloc', 'Talon empilé', [72, 58, 30], 'stamp', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 167 + 89);
    const oc = [rng() * 256, rng() * 256];
    const CUIR = lin('#a87450'), CUIR2 = lin('#7c4f31');
    // le profil du talon couché : l'assise en haut (y < 0), le bonbout en bas (y > 0), le dos arrondi à gauche
    const PROFIL = R.spline([[-30, -29], [0, -30], [28, -29], [31, 0], [33, 29], [5, 30], [-22, 29], [-33, 12], [-36, -8]], 5, true);
    return {
      box: [-38, -32, 38, 32], haut: 30,
      couches: [{
        box: [-38, -32, 38, 32],
        f(x, y, S) {
          const d = geo.poly(x, y, PROFIL);
          S.d = d;
          if (d > S.lim) return;
          const e = -d;
          // le flanc bombé (le talon est arrondi)
          S.z = 8 + 20 * Math.sqrt(clamp01(e / 12));
          if (y > 22) { // le bonbout : gomme noire, clous
            R.mat(S, MAT.caoutchouc, 1.2, 0);
            const cl = Math.abs(((x + 40) % 14) - 7) < 1.1 && Math.abs(y - 25.5) < 1.1 ? 1 : 0;
            if (cl) { R.teinte(S, [0.5, 0.48, 0.45], 0.9); S.me = 1; S.ro = 0.3; }
          } else { // les lamelles de cuir empilées, de 4 à 5 mm, collées ; les lignes de colle plus sombres
            const lam = ((y + 30) / 4.6) % 1;
            const k = Math.floor((y + 30) / 4.6) % 2;
            R.mat(S, MAT.cuirTanne, 1, 0.05);
            R.teinte(S, k ? CUIR2 : CUIR, 0.7 + tx(T.c, x * 0.2 + oc[0], y + oc[1]) * 0.2);
            const joint = sstep(0.12, 0, lam) + sstep(0.88, 1, lam);
            R.teinte(S, [0.08, 0.05, 0.03], joint * 0.7);
            S.z -= joint * 0.3;
            // la tranche poncée : des stries fines
            S.z += tx(T.e, x * 2 + oc[1], y * 0.2) * 0.1 * R.lod(0.6, S.ppm);
          }
        },
      }],
      cavite: [1.2, 0.3], soleil: 1, ombre: { opacite: 0.6, contact: 0.5 },
    };
  });

  /* ---------- des chutes de cuir (croissants de découpe, fleur ou croûte) ---------- */
  def('chutes-cuir', 'Chutes de cuir', [150, 100, 6], 'flick', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 173 + 97);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const TEINTES = ['#b5825a', '#6b3d22', '#1d1715', '#8e5a36', '#c9a07a'];
    const pieces = [];
    for (let i = 0; i < 4; i++) {
      // un croissant (le reste d'une semelle découpée) ou un coin droit
      const cx = rng.range(-45, 45), cy = rng.range(-28, 28), R0 = rng.range(30, 55), ep = rng.range(8, 20);
      const a0 = rng() * TAU, ouv = rng.range(1.2, 2.4);
      pieces.push({ cx, cy, R0, ep, a0, ouv, col: lin(rng.pick(TEINTES)), croute: rng() < 0.4, z0: i * 1.7, s: rng() * 99 });
    }
    return {
      box: [-76, -52, 76, 52], haut: 8,
      couches: pieces.map((P) => ({
        box: [-76, -52, 76, 52],
        f(x, y, S) {
          const dx = x - P.cx, dy = y - P.cy;
          const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
          const da = ((a - P.a0 + Math.PI * 3) % TAU) - Math.PI; // dans l'ouverture ?
          const dAng = (Math.abs(da) - P.ouv / 2) * r;
          const bord = tx(T.c, a * 3 + P.s, P.s) * 1.5;
          const d = Math.max(Math.abs(r - P.R0 - bord) - P.ep / 2, dAng);
          S.d = d;
          if (d > S.lim) return;
          const e = -d;
          S.z = P.z0 + R.bord(e, 0.6, 1.8) + 1.2 * sstep(4, 0, dAng + P.ep); // les pointes se relèvent un peu
          if (P.croute) { // le côté chair : pelucheux, plus clair
            R.mat(S, MAT.daim, 1, 0);
            R.teinte(S, P.col, 0.5);
            R.teinte(S, [0.55, 0.42, 0.3], 0.3);
          } else {
            R.mat(S, MAT.cuirBrun, 1, 0.15);
            R.teinte(S, P.col, 1);
            S.z += tx(T.e, x * 0.8 + oc[0], y * 0.8) * 0.03;
          }
          // la tranche coupée au tranchet : nette, plus claire
          const tr = sstep(0.7, 0, e);
          if (tr > 0) R.teinte(S, [0.45, 0.3, 0.2], tr * 0.5);
        },
      })),
      cavite: [1, 0.3], soleil: 0.6, ombre: { opacite: 0.55, contact: 0.55 },
    };
  });

  /* ---------- des chutes de gomme (lanières noires, un bout de semelle) ---------- */
  def('chutes-gomme', 'Chutes de gomme', [130, 80, 6], 'flick', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 179 + 101);
    const pieces = [];
    for (let i = 0; i < 5; i++) {
      const pts = [];
      let x = rng.range(-50, 50), y = rng.range(-30, 30), a = rng() * TAU;
      const n = 8, l = rng.range(4, 9);
      for (let k = 0; k <= n; k++) { pts.push([x, y, 0.2 + i * 0.4]); x += Math.cos(a) * l; y += Math.sin(a) * l; a += rng.range(-0.35, 0.35); }
      pieces.push({ pts, w: rng.range(2, 5), gris: rng() < 0.3 });
    }
    return {
      box: [-72, -46, 72, 46], haut: 7,
      couches: pieces.map((P) => ({
        tube: P.pts, r: P.w, plat: 0.9,
        f(t, u, S) {
          R.mat(S, MAT.caoutchouc, P.gris ? 2.4 : 1.2, 0);
          const e = Math.abs(u);
          if (e > 0.8) S.ro -= 0.2; // la tranche coupée, lisse
        },
      })),
      cavite: [1, 0.3], soleil: 0.5, ombre: { opacite: 0.55, contact: 0.55 },
    };
  });

  /* ---------- une cale à poncer : bloc de liège, papier de verre usé dessus ---------- */
  def('cale-poncer', 'Cale à poncer', [112, 70, 30], 'brush', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 181 + 103);
    const oc = [rng() * 256, rng() * 256, rng() * 256];
    const PAPIER = R.matiere('#a8683a', { ro: 0.95, f0: 0.02 }), LIEGE = R.matiere('#b08a5c', { ro: 0.9, f0: 0.02 });
    return {
      box: [-57, -36, 57, 36], haut: 30,
      couches: [{
        box: [-57, -36, 57, 36],
        f(x, y, S) {
          const d = geo.boite(x, y, 55, 34, 3);
          S.d = d;
          if (d > S.lim) return;
          const e = -d;
          S.z = R.bord(e, 3, 29);
          // le papier de verre rabattu sur le dessus, sauf une bande de liège à chaque bout
          const pap = sstep(46, 44.5, Math.abs(x));
          const gr = tx(T.e, x * 1.6 + oc[0], y * 1.6 + oc[1]) * R.lod(0.6, S.ppm);
          if (pap > 0.5) {
            R.mat(S, PAPIER, 1 + gr * 0.18, 0);
            S.z += gr * 0.06;
            // usé et encrassé au milieu : le grain disparaît, la poussière de cuir et de gomme s'y colle
            const use = sstep(0.1, 0.7, tx(T.a, x * 0.04 + oc[2], y * 0.05) + 0.3 - Math.abs(x) / 90);
            R.teinte(S, [0.12, 0.1, 0.08], use * 0.45);
            R.teinte(S, [0.45, 0.4, 0.33], sstep(0.5, 0.8, tx(T.b, x * 0.1 + oc[1], y * 0.1)) * 0.3);
          } else {
            R.mat(S, LIEGE, 1 + tx(T.c, x * 0.9 + oc[1], y * 0.9) * 0.18, 0);
            S.z += tx(T.c, x * 0.9 + oc[1], y * 0.9) * 0.1;
          }
        },
      }],
      cavite: [1.5, 0.3], soleil: 0.9, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  /* ---------- la tasse de café (vue de dessus : le café, un peu de crème au bord, l'anse) ---------- */
  def('mug', 'Tasse de café', [110, 84, 96], 'knock', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 191 + 107);
    const oc = [rng() * 256, rng() * 256];
    const EMAUX = ['#e9e4d8', '#2d4b73', '#b8452f', '#e9e4d8', '#3a3a3a'];
    const EMAIL = R.matiere(EMAUX[Math.floor(rng() * EMAUX.length)], { ro: 0.12, f0: 0.05 });
    const CAFE = lin('#1e0f07'), CREME = lin('#6b4526');
    const RB = 41, HB = 95, HC = 78;
    const niveau = rng.range(0.3, 1); // à moitié bue ou presque pleine
    return {
      box: [-43, -43, 68, 43], haut: 96,
      couches: [
        { // l'anse, à droite
          box: [36, -12, 68, 12],
          f(x, y, S) {
            const dO = geo.boite(x - 50, y, 16, 10, 7), dI = geo.boite(x - 50, y, 9.5, 4, 3.5);
            const d = Math.max(dO, -dI, 38 - x);
            S.d = d;
            if (d > S.lim) return;
            const e = Math.min(-dO, dI);
            S.z = 62 + 6 * Math.sqrt(clamp01(e / 3.2));
            R.mat(S, EMAIL, 1, 0);
          },
        },
        { // la tasse : le bord, l'émail intérieur qui plonge, le café
          box: [-43, -43, 43, 43],
          f(x, y, S) {
            const r = Math.hypot(x, y), d = r - RB;
            S.d = d;
            if (d > S.lim) return;
            const rC = RB - 5.5;
            if (r > rC) {
              const q = (r - (RB - 2.4)) / 2.4;
              S.z = r > RB - 4.8 ? HB - 2.4 + 2.4 * Math.sqrt(Math.max(0, 1 - q * q)) : lerp(HB - 2.5, HB - 12, (RB - 4.8 - r) / 0.7);
              R.mat(S, EMAIL, 1, 0);
              if (r < RB - 4.8) S.ao = 0.6;
              // les traces de café séché sur l'émail, à l'intérieur (le niveau d'avant)
              const tr = sstep(RB - 4.6, RB - 5.4, r) * 0.4;
              R.teinte(S, CREME, tr);
            } else {
              S.z = lerp(HB - 40, HC, niveau) + 0.05 * tx(T.c, x * 0.3 + oc[0], y * 0.3 + oc[1]);
              R.mat(S, MAT.plastiqueNoir);
              R.teinte(S, CAFE, 1);
              R.teinte(S, CREME, sstep(rC - 2.5, rC, r) * 0.7);
              S.ro = 0.05; S.f0 = 0.035;
              S.ao = 0.75 + 0.25 * niveau;
            }
            // une coulure de café sur le bord extérieur
            const cl = sstep(0.55, 0.75, tx(T.c, Math.atan2(y, x) * 4 + oc[1], 2)) * sstep(RB - 2.5, RB - 0.5, r);
            if (cl > 0) R.teinte(S, CREME, cl * 0.6);
          },
        },
      ],
      cavite: [3, 0.06], soleil: 1.4, ombre: { opacite: 0.58, contact: 0.5, doux: 1.1 },
    };
  });

  /* ---------- des crayons : un crayon de charpentier taillé au couteau, un crayon à papier ---------- */
  def('crayons', 'Crayons', [180, 40, 8], 'tap', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 193 + 109);
    const oc = [rng() * 256, rng() * 256];
    const ROUGE = R.matiere('#b23a2a', { ro: 0.35, f0: 0.045 }), JAUNE = R.matiere('#d9a72b', { ro: 0.3, f0: 0.045 });
    const BOIS = lin('#d8b27c'), MINE = R.matiere('#2c2c2e', { ro: 0.35, me: 0.4 });
    const a2 = rng.range(0.08, 0.22) * (rng() < 0.5 ? -1 : 1);
    return {
      box: [-92, -24, 92, 24], haut: 8,
      couches: [
        { // le crayon à papier (hexagonal, jaune), un peu de biais
          box: [-92, -24, 92, 24],
          f(x, y, S) {
            const c = Math.cos(a2), s = Math.sin(a2);
            const u = (x + 4) * c + (y - 8) * s, v = -(x + 4) * s + (y - 8) * c;
            const L = 76;
            const pointe = u > L - 16 ? (u - (L - 16)) / 16 : 0;
            const larg = 3.6 * (1 - pointe);
            const d = Math.max(Math.abs(v) - larg, -L - u, u - L);
            S.d = d;
            if (d > S.lim) return;
            // l'hexagone : trois pans vus d'en haut
            const pan = Math.abs(v) / 3.6;
            S.z = 3.6 + 3.1 * (pan < 0.5 ? 1 : 1 - (pan - 0.5) * 1.1) * (1 - pointe * 0.6);
            if (pointe > 0) {
              R.mat(S, MAT.boisBrut, 1, 0);
              R.teinte(S, BOIS, 0.8);
              if (pointe > 0.72) R.mat(S, MINE, 1, 0);
            } else {
              R.mat(S, JAUNE, 1, 0);
              if (u < -L + 9) { R.mat(S, MAT.laiton, 0.9, 0.1); } // la frette
              if (u < -L + 2) R.mat(S, R.matiere('#c96f7a', { ro: 0.8 }), 1, 0); // la gomme
            }
          },
        },
        { // le crayon de charpentier (plat, rouge), taillé au couteau
          box: [-92, -24, 92, 24],
          f(x, y, S) {
            const u = x, v = y + 8;
            const L = 88;
            const taille = u > L - 22 ? (u - (L - 22)) / 22 : 0;
            const larg = 6.5 * (1 - taille * 0.55);
            const d = Math.max(Math.abs(v) - larg, -L - u, u - L);
            S.d = d;
            if (d > S.lim) return;
            const q = Math.abs(v) / larg;
            S.z = 1 + 3.2 * Math.sqrt(Math.max(0, 1 - q * q * q)) * (1 - taille * 0.5);
            if (taille > 0) {
              R.mat(S, MAT.boisBrut, 1 + Math.sin(u * 3) * 0.05, 0);
              R.teinte(S, BOIS, 0.85);
              if (Math.abs(v) < 1.3 && taille > 0.3) R.mat(S, MINE, 1, 0);
              S.z += Math.sin(u * 1.4 + v) * 0.15; // les coups de couteau
            } else {
              R.mat(S, ROUGE, 1 + tx(T.c, u * 0.3 + oc[0], v) * 0.06, 0);
              const us = sstep(0.4, 0.8, tx(T.b, u * 0.1 + oc[1], v * 0.3));
              R.teinte(S, [0.3, 0.2, 0.12], us * 0.4);
            }
          },
        },
      ],
      cavite: [1, 0.3], soleil: 0.7, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  /* ---------- une liasse de tickets de réparation (jaunes, pastille rouge), le numéro du dessus ---------- */
  def('tickets-pile', 'Liasse de tickets', [70, 150, 4], 'tear', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 197 + 113);
    const numero = String(((o.graine * 7919) % 900) + 101).padStart(4, '0');
    const MB = yield* modele('tickets-pile:' + o.graine + ':' + empreinteP(), function* () {
      yield* polices();
      const noir = yield* R.masqueG([-28, -70, 28, 70], 7, (g) => {
        g.textAlign = 'center';
        g.font = '800 5.6px ' + POLICE.chiffres;
        g.save(); g.scale(1.22, 1); g.fillText('CORDO63', 0, -43.5); g.restore();
        g.font = '800 9px ' + POLICE.chiffres;
        g.fillText('N° ' + numero, 0, -25);
        g.lineWidth = 0.22;
        for (const y of [-15, -7, 1, 9]) { g.beginPath(); g.moveTo(-23, y + 0.3); g.lineTo(23, y + 0.3); g.stroke(); }
        g.lineWidth = 0.35; g.setLineDash([1.2, 1.1]);
        g.beginPath(); g.moveTo(-28, 15.5); g.lineTo(28, 15.5); g.stroke();
      });
      return { noir };
    });
    const J = lin('#f2d24b'), RG = lin('#e03a2e'), NOIR = lin('#2a2622');
    const feuilles = [];
    for (let k = 0; k < 6; k++) feuilles.push({ dx: rng.range(-3, 3), dy: rng.range(-3, 3), a: rng.range(-0.06, 0.06), z: k * 0.28 });
    const forme = (x, y) => Math.max(geo.boite(x, y, 28, 70, 0.6), (Math.abs(x) - 28 + 9 - (y + 70)) * Math.SQRT1_2);
    return {
      box: [-36, -78, 36, 78], haut: 3,
      couches: feuilles.map((F, k) => ({
        box: [-36, -78, 36, 78],
        f(x, y, S) {
          const c = Math.cos(F.a), s = Math.sin(F.a);
          const u = (x - F.dx) * c + (y - F.dy) * s, v = -(x - F.dx) * s + (y - F.dy) * c;
          let d = forme(u, v);
          d = Math.max(d, -(Math.hypot(u, v + 58) - 2.9));
          S.d = d;
          if (d > S.lim) return;
          S.z = F.z + 0.25 + 0.3 * tx(T.a, u * 0.04 + k, v * 0.04);
          R.mat(S, MAT.papier, 1, 0);
          S.r = J[0] * (0.97 - (5 - k) * 0.01); S.g = J[1] * (0.97 - (5 - k) * 0.01); S.b = J[2];
          S.ro = 0.8;
          if (k === feuilles.length - 1) {
            const n = MB.noir.get(u, v);
            if (n > 0) R.teinte(S, NOIR, n * 0.85);
          }
          const dp = Math.hypot(u, v - 49) - 9;
          if (dp < 1 / S.ppm) { const cc = clamp01(0.5 - dp * S.ppm); R.teinte(S, RG, cc); S.ro = lerp(S.ro, 0.32, cc); }
          // l'œillet
          const re = Math.hypot(u, v + 58);
          if (re < 5.8) { const cc = clamp01((5.8 - re) * S.ppm); R.teinte(S, MAT.laiton, cc * 0.9); S.me = cc; S.ro = lerp(S.ro, 0.25, cc); S.z += cc * 0.4; }
          // les bords usés par les doigts
          R.teinte(S, [0.45, 0.35, 0.12], sstep(1.5, 0, -d) * 0.25);
        },
      })),
      cavite: false, soleil: 0.4, ombre: { opacite: 0.5, contact: 0.55 },
    };
  });

  /* ---------- le téléphone, posé face contre l'établi (coque noire, bloc photo) ---------- */
  def('telephone', 'Téléphone retourné', [152, 73, 10], 'tap', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 199 + 127);
    const oc = [rng() * 256, rng() * 256];
    const COQUE = R.matiere('#1e1f22', { ro: 0.62, f0: 0.04 }), BLOC = R.matiere('#27282b', { ro: 0.3, f0: 0.05 });
    const VERRE = R.matiere('#0b0c10', { ro: 0.03, f0: 0.06 });
    return {
      box: [-78, -38, 78, 38], haut: 11,
      couches: [
        {
          box: [-78, -38, 78, 38],
          f(x, y, S) {
            const d = geo.boite(x, y, 76, 36.5, 10);
            S.d = d;
            if (d > S.lim) return;
            const e = -d;
            S.z = R.bord(e, 3.5, 9.5);
            R.mat(S, COQUE, 1 + tx(T.c, x * 0.5 + oc[0], y * 0.5) * 0.05, 0);
            // la poussière et les traces de doigts sur la coque mate
            const tr = sstep(0.45, 0.8, tx(T.b, x * 0.06 + oc[1], y * 0.06 + oc[0]));
            S.ro -= tr * 0.25;
            R.teinte(S, [0.2, 0.19, 0.18], sstep(0.6, 0.9, tx(T.a, x * 0.08 + oc[0], y * 0.08)) * 0.3);
          },
        },
        { // le bloc photo (en haut à gauche de la coque) et ses objectifs
          box: [-70, -32, -28, 10],
          f(x, y, S) {
            const cx = -52, cy = -14;
            const d = geo.boite(x - cx, y - cy, 16, 16, 6);
            S.d = d;
            if (d > S.lim) return;
            S.z = 9.5 + R.bord(-d, 1.2, 1.6);
            R.mat(S, BLOC, 1, 0);
            for (const [lx, ly, lr] of [[-7, -7, 5.2], [7, -7, 5.2], [-7, 7, 5.2], [7, 7, 2.2]]) {
              const r = Math.hypot(x - cx - lx, y - cy - ly);
              if (r < lr) {
                const c = clamp01((lr - r) * S.ppm);
                if (lr > 3) {
                  R.teinte(S, VERRE, c); S.ro = lerp(S.ro, 0.03, c); S.f0 = 0.06;
                  S.z += c * (0.8 - (r / lr) * 0.5);
                  const bague = R.trait(r - lr + 0.8, 0.9, 1 / S.ppm);
                  if (bague > 0) { R.teinte(S, [0.5, 0.5, 0.52], bague * 0.8); S.me = bague; }
                } else { R.teinte(S, [0.8, 0.75, 0.55], c * 0.7); } // le flash
              }
            }
          },
        },
      ],
      cavite: [1.5, 0.2], soleil: 0.8, ombre: { opacite: 0.6, contact: 0.55 },
    };
  });

  /* ---------- le derby : cuir de veau brun patiné, trépointe cousue, cinq paires d'œillets, lacets ronds ----------
     Repère : talon à −x, bout à +x. Le bout est ciré (plus sombre, plus brillant), l'empeigne marquée de plis. */
  def('derby', 'Derby en cuir brun', [292, 106, 76], 'knock', function* (o) {
    yield* tuiles();
    const rng = R.rng(o.graine * 211 + 131);
    const oc = [rng() * 256, rng() * 256, rng() * 256, rng() * 256];
    const M = yield* modele('derby:' + o.graine, function* () {
      const P = contourPied(292, 102, 0.3);
      const box = [-150, -58, 150, 58];
      const F = yield* R.champ(box, 2.5, (g) => { tracePoly(g, P); g.fill(); });
      // les quartiers (les deux rabats qui portent les œillets, posés sur l'empeigne) et leurs coutures
      const quart = yield* R.masqueG(box, 3, (g) => {
        g.save();
        tracePoly(g, P);
        g.clip();
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(-160, s * 70);
          g.lineTo(-160, s * 1);
          g.lineTo(-20, s * 4.5);
          g.bezierCurveTo(10, s * 5, 30, s * 6, 36, s * 10);
          g.bezierCurveTo(42, s * 18, 30, s * 40, 8, s * 70);
          g.closePath();
          g.fill();
        }
        g.restore();
      });
      const coutures = yield* R.masqueG(box, 4, (g) => {
        g.lineWidth = 0.4;
        g.setLineDash([1.3, 0.9]);
        for (const s of [-1, 1]) {
          for (const k of [1.6, 3]) {
            g.beginPath();
            g.moveTo(-20, s * (4.5 + k));
            g.bezierCurveTo(10, s * (5 + k), 28, s * (6 + k), 34 - k, s * (10 + k * 0.5));
            g.bezierCurveTo(40 - k, s * (18 + k * 0.3), 28 - k, s * 40, 6 - k, s * 70);
            g.stroke();
          }
        }
        // la couture arrière du talon
        g.beginPath(); g.moveTo(-160, 0); g.lineTo(-128, 0); g.stroke();
      });
      const emax = table((x) => Math.max(8, -F.get(x, 0)), -150, 150, 200);
      return { P, F, quart, coutures, emax };
    });
    const F = M.F, emax = M.emax;
    const TREP = 5.2; // la trépointe qui dépasse
    const semelle = (x) => lerp(15, 29, sstep(-60, -110, x)); // la semelle et le talon
    const crete = table(monotone([[150, 30], [138, 40], [118, 47], [92, 53], [64, 58], [40, 63], [18, 67], [-4, 70], [-20, 71], [-60, 73], [-110, 76], [-140, 72], [-150, 58]]), -150, 150);
    const OX = -74, OY = 0, OA = 56, OB = 31; // l'ouverture
    const zCorps = (x, y) => {
      const e = -(F.get(x, y) + TREP);
      const q = clamp01(e / Math.max(6, emax(x) - TREP));
      const zs = semelle(x);
      return zs + (crete(x) - zs) * (1 - Math.pow(1 - q, 2.1));
    };
    const oeillets = [];
    for (let k = 0; k < 5; k++) { const x = 25 - k * 10.5; oeillets.push([x, -9.2], [x, 9.2]); }
    const surface = (x, y) => zCorps(x, y) + 1.4 * M.quart.get(x, y);
    const couches = [];
    const CUIR = MAT.cuirBrun, SEMELLE = lin('#2a170d'), PREMIERE = lin('#c7a077'), DOUBLURE = lin('#b98f63');
    // --- la semelle et la trépointe (on les voit tout autour)
    couches.push({
      box: [-150, -58, 150, 58],
      f(x, y, S) {
        const d = F.get(x, y);
        S.d = d;
        if (d > S.lim) return;
        const e = -d;
        S.z = R.bord(e, 1.5, semelle(x));
        R.mat(S, CUIR, 0.75, 0.05);
        R.teinte(S, SEMELLE, 0.75);
        S.ro = 0.35;
        // la couture de la trépointe : des points réguliers
        const pts = R.trait(e - 2.6, 0.9, 1 / S.ppm) * (Math.sin(Math.atan2(y, x) * 0 + (x + y) * 1.9) > 0 ? 1 : 0.2) * R.lod(1.6, S.ppm);
        if (pts > 0) { R.teinte(S, [0.3, 0.2, 0.12], pts * 0.8); S.z += pts * 0.2; }
      },
    });
    // --- la tige
    couches.push({
      box: [-150, -56, 150, 56],
      f(x, y, S) {
        const d = F.get(x, y) + TREP;
        S.d = d;
        if (d > S.lim) return;
        let z = zCorps(x, y);
        const dO = geo.ellipse(x - OX, y - OY, OA, OB);
        // les plis de l'empeigne
        const pli = x > 55 && x < 100 ? Math.pow(Math.max(0, Math.sin((x - 55) * 0.34 + y * 0.03)), 3) * sstep(34, 0, Math.abs(y)) * 0.8 : 0;
        z += pli;
        // le cuir : grain fin, patine (bout et bords plus sombres, milieu plus clair), cirage brillant au bout
        const grain = tx(T.e, x * 0.9 + oc[0], y * 0.9 + oc[1]) * R.lod(0.8, S.ppm);
        const n = tx(T.a, x * 0.03 + oc[2], y * 0.03 + oc[3]);
        R.mat(S, CUIR, 1.05 + n * 0.12 + grain * 0.03, 0);
        const bord = sstep(0, -12, d);
        const patine = Math.max(sstep(95, 145, x), sstep(-105, -150, x)) * 0.6 + (1 - bord) * 0.5;
        R.teinte(S, [0.05, 0.022, 0.012], patine * 0.6);
        S.ro = lerp(0.34, 0.16, sstep(85, 130, x)) - pli * 0.05;
        S.z = z + grain * 0.02;
        // les quartiers, posés sur l'empeigne : un peu plus hauts, leur bord fait une marche
        const q = M.quart.get(x, y);
        if (q > 0) { S.z += 1.4 * q; R.teinte(S, [0.06, 0.03, 0.015], (1 - q) * 0.5); }
        const cou = M.coutures.get(x, y) * R.lod(1.3, S.ppm);
        if (cou > 0) { R.teinte(S, [0.12, 0.06, 0.03], cou * 0.7); S.z -= cou * 0.12; }
        // l'ouverture : le bord de la tige, la doublure claire, la première au fond
        if (dO < 3) {
          if (dO > 0) {
            const t = dO / 3;
            S.z = Math.max(S.z - 1, lerp(crete(x) - 1, S.z, t));
          } else {
            const t = sstep(0, 7, -dO);
            S.z = lerp(crete(x) - 1, semelle(x) + 3, t);
            R.teinte(S, DOUBLURE, sstep(0, 1.2, -dO));
            if (-dO > 7) R.teinte(S, PREMIERE, 1);
            S.ro = 0.6;
            S.ao = 1 - t * 0.45;
          }
        }
        // la languette, entre les quartiers
        if (x > -24 && x < 34 && Math.abs(y) < 8 && q < 0.5) R.teinte(S, [0.14, 0.07, 0.035], 0.2);
      },
    });
    // --- les œillets
    couches.push({
      box: [-22, -14, 31, 14],
      f(x, y, S) {
        let best = 9, bx = 0, by = 0;
        for (const [ex, ey] of oeillets) {
          const dd = Math.hypot(x - ex, y - ey);
          if (dd < best) { best = dd; bx = ex; by = ey; }
        }
        const d = Math.max(best - 2.2, 0.9 - best);
        S.d = d;
        if (d > S.lim) return;
        S.z = surface(bx, by) + 0.5;
        R.mat(S, MAT.acierNoir, 0.9, 0.05);
      },
    });
    // --- les lacets ronds : des barrettes, puis le nœud et ses deux boucles, les bouts qui pendent
    const LACET = R.matiere('#2a1810', { ro: 0.36, f0: 0.045 });
    const brins = [];
    for (let k = 0; k < 5; k++) {
      const a = oeillets[2 * k], b = oeillets[2 * k + 1], pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8, x = a[0], y = lerp(a[1], b[1], t); pts.push([x, y, surface(x, y) + 1.1 + 0.3 * Math.sin(Math.PI * t)]); }
      brins.push(pts);
    }
    const nx = -21, ny = 0;
    for (const s of [-1, 1]) {
      // la boucle : un ovale couché sur le côté (le long du quartier), de 26 mm
      const boucle = [];
      for (let i = 0; i <= 32; i++) {
        const t = (i / 32) * TAU, x = nx + 4.5 * Math.sin(t) + (s > 0 ? 2 : -1) * (1 - Math.cos(t)), y = ny + s * 13 * (1 - Math.cos(t));
        boucle.push([x, y, surface(x, y) + 1.6 + 1.4 * Math.sin((i / 32) * Math.PI)]);
      }
      brins.push(boucle);
      // le bout : il part du nœud vers l'arrière et retombe sur le côté
      const bout = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, x = nx - 4 - t * 38, y = ny + s * (4 + t * 44 + Math.sin(t * 3) * 3);
        const dedans = F.get(x, y) + TREP < 0;
        bout.push([x, y, dedans ? surface(x, y) + 1.4 : lerp(surface(nx, ny) + 1, 0.9, sstep(0.55, 0.9, t))]);
      }
      brins.push(bout);
    }
    for (const b of brins) couches.push({ tube: b, r: 1.35, f(t, u, S) { R.mat(S, LACET, 1 + Math.sin(t * 6 + u * 2) * 0.06 * R.lod(1, S.ppm), 0); } });
    // le nœud
    couches.push({ tube: [[nx - 3, ny - 2.5, surface(nx, ny) + 2.2], [nx + 3, ny + 2.5, surface(nx, ny) + 2.4]], r: 2.4, f(t, u, S) { R.mat(S, LACET, 1.05, 0); } });
    return {
      box: [-150, -58, 150, 58], haut: 78, couches,
      cavite: [2.5, 0.12], soleil: 1.2, ombre: { opacite: 0.58, contact: 0.5 },
    };
  });

  // les objets qui portent du texte (leur image dépend des polices du site)
  for (const id of ['tapis', 'reglet', 'ticket', 'semelle-cuir', 'tickets-pile']) if (DEFS[id]) DEFS[id].texte = true;
  // les catégories : 'surface' (le fond), 'outil', 'piece' (les chaussures), 'encombrement' (ce qui traîne)
  const CATEGORIES = {
    surface: ['tapis', 'etabli'], piece: ['sneaker', 'derby'],
    encombrement: ['pot-pinceau', 'boite-teinture', 'ruban', 'cone-fil', 'coupelle-clous', 'talon-bloc', 'chutes-cuir',
      'chutes-gomme', 'cale-poncer', 'mug', 'crayons', 'tickets-pile', 'telephone'],
  };
  for (const e of LISTE) for (const c in CATEGORIES) if (CATEGORIES[c].includes(e.id)) e.categorie = c;

  /* ======================================================================
     4. L'API : sprites (cache mémoire + téléphone), fond de scène
     ====================================================================== */
  const q = (v, s) => Math.round(v / s) * s;
  function cleDe(id, o) {
    const oe = o.oeil ? '|' + q(o.oeil[0], 25) + ',' + q(o.oeil[1], 25) : '';
    const pol = DEFS[id] && DEFS[id].texte ? '|' + empreinteP() : '';
    return id + '|' + (o.graine || 63) + '|' + q(o.ppm, 0.05).toFixed(2) + '|' + q(o.angle || 0, 0.5).toFixed(1) + oe + pol;
  }
  function* construire(id, o) {
    const D = DEFS[id];
    if (!D) throw new Error('Objet inconnu : ' + id);
    const opts = { graine: o.graine || 63, ppm: q(o.ppm, 0.05), angle: q(o.angle || 0, 0.5) };
    const t0 = R.now();
    yield 'modele:' + id;
    const spec = yield* D.construire(opts);
    const tM = R.now() - t0;
    yield 'rendu:' + id;
    spec.ppm = opts.ppm;
    spec.angle = (opts.angle * Math.PI) / 180;
    // l'appareil photo, vu depuis l'objet (mm, axes de l'écran) : les reflets dépendent de sa place dans la scène
    if (o.oeil) spec.oeil = { x: q(o.oeil[0], 25), y: q(o.oeil[1], 25) };
    const sp = yield* R.rendre(spec);
    sp.id = id;
    sp.t.modele = tM;
    sp.t.tout += tM;
    sp.degres = opts.angle;
    if (spec.numero) sp.numero = spec.numero;
    return sp;
  }

  const Outils = (CO.Outils = {
    liste: LISTE,
    defs: DEFS,
    info(id) {
      const D = DEFS[id];
      return D ? { id, nom: D.nom, dim: D.dim, son: D.son, haut: D.dim[2] } : null;
    },
    /** Le sprite d'un objet, calculé d'une traite (mis en cache) */
    sprite(id, o = {}) {
      const opts = Object.assign({ ppm: 2, angle: 0, graine: 63 }, o);
      const k = cleDe(id, opts);
      const c = R.cache.get(k);
      if (c) return c;
      const sp = R.finir(construire(id, opts));
      return R.cache.set(k, sp);
    },
    /** Le même, par tranches (prio > 0 : tout de suite ; ≤ 0 : aux temps morts) ; garde aussi dans le téléphone */
    preparer(id, o = {}, prio = 1) {
      const opts = Object.assign({ ppm: 2, angle: 0, graine: 63 }, o);
      const k = cleDe(id, opts);
      const c = R.cache.get(k);
      if (c) return Promise.resolve(c);
      const gen = (function* () {
        // d'abord le téléphone
        let v = null;
        if (!o.sansCoffre) {
          const box = { v: undefined };
          yield R.coffre.get('sp|' + k).then(async (x) => { box.v = x ? await R.deballer(x) : null; });
          v = box.v;
        }
        if (v) return v;
        const sp = yield* construire(id, opts);
        if (!o.sansCoffre) R.emballer(sp).then((x) => x && R.coffre.put('sp|' + k, x));
        return sp;
      })();
      const pr = R.lancer(gen, { prio, cle: 'sp|' + k });
      const out = pr.then((sp) => R.cache.set(k, sp));
      out.job = pr.job;
      return out;
    },
    cle: cleDe,
    empreinte: empreinteP,
    /** le calcul d'un sprite, en générateur (pour le composer soi-même, par tranches) */
    construireG: construire,
    fond,
    modeleTapis,
    surfaceTapis,
    POLICE,
  });
  void Outils;
})();
