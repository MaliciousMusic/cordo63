/* ==========================================================================
   Cordo 63 — « le process » : le film de l'onglet L'atelier (CO.Process)
   L'établi de Clément vu de dessus, et ses deux mains qui restaurent une
   basket, calmement, avec des pauses :
     1. une main pose la basket sale au milieu du tapis ; l'autre accroche le
        ticket jaune à pastille rouge au lacet ;
     2. on délace : la main tire le lacet, il sort des œillets, il se pose à côté ;
     3. on nettoie : une main tient la basket, l'autre frotte à la brosse, en
        petits cercles ; la mousse monte, la saleté part là où la brosse passe ;
     4. la semelle : le pinceau trempe dans le pot, longe le bord décollé ; le
        marteau tapote le long du bord (le jour se referme à chaque coup) ;
     5. des lacets neufs, croisillon par croisillon, un nœud ;
     6. la main recentre la basket, le ticket reçoit le tampon rouge « PRÊTE » ;
        trois secondes sur l'image finale, puis on recommence.
   Chaque outil touche ce qu'il transforme ; les sons suivent (CO.sfx).

   Tout est une fonction du temps t (s) : image(t) dessine l'instant t, sans
   mémoire (on peut sauter n'importe où). Les objets sont calculés une fois, par
   tranches (co-rendu.js, co-outils.js, co-mains.js), gardés dans le téléphone ;
   à chaque image on ne fait que poser des sprites, tracer quelques lacets et
   des bulles de mousse.

   CO.Process.create(host, { boucle: true, auto: true, vitesse: 1, t: 0 }) → Promise<film>
     film.jouer()  film.pause()  film.reprise()  film.aller(t)  film.detruire()
     film.on('etape', fn(id))   id : discuter, ticket, demonter, reparer, finir, rendre (au début de chaque partie)
     film.duree, film.t, film.joue, film.image() (→ Promise : l'instant courant est dessiné), film.mesurer()
   Le film dort quand on ne le voit pas : hors de l'écran (IntersectionObserver), page cachée,
   ou une autre vue que « atelier » (CO.on('view')) ; ses calculs aussi (co-mains.js : CO.Mains.calcul).

   Le minutage (s) — 36,4 s en tout, en boucle :
     0,0  discuter  l'établi vide ; 0,5 la main droite apporte la basket sale, la pose (2,2), s'en va ; la gauche arrive
     4,6  ticket    la gauche prend un ticket sur la liasse (5,5), l'accroche au nœud du lacet (7,0), le pose à côté
     8,8  demonter  la gauche tient le talon ; la droite défait le nœud (10,0), tire le lacet en deux fois, le pose à droite ;
                    elle prend la brosse (13,3), la trempe dans le bol (14,0), frotte en petits cercles (14,6 → 16,5)
    17,2  reparer   le pinceau : trempé (18,1), il longe le bord décollé (18,85 → 19,85) ; le marteau (21,0),
                    six coups le long du bord (21,9 → 23,3), le jour se referme
    23,8  finir     des lacets neufs (24,3), posés en travers (25,2), six croisillons (25,6 → 27,8), le nœud (28,3)
    28,9  rendre    la droite recentre la basket ; la gauche tamponne « PRÊTE » sur le ticket (31,0) ; les mains sortent (32,9)
    32,9  l'image finale, trois secondes ; 35,8 fondu vers le début

   Les calculs (une fois, puis gardés dans le téléphone) : le fond d'abord en demi-définition (le film peut commencer),
   puis, dans l'ordre où le film en a besoin, la basket, les mains, les outils, le fond en pleine définition ;
   le film n'avance que quand ce dont il a besoin est prêt (il attend sur un temps calme). À chaque image : poser
   des sprites (tournés, soulevés), les ombres des mains unies dans un calque, quelques lacets, des bulles.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const R = CO.R, O = CO.Outils, M = CO.Mains;
  if (!R || !O || !M) throw new Error('co-process.js : charger co-rendu.js, co-outils.js et co-mains.js avant');
  const clamp01 = R.clamp01, sstep = R.sstep, lerp = R.lerp, geo = R.geo, MAT = R.MAT, lin = R.lin, tx = R.tx;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const now = () => performance.now();

  /* ======================================================================
     1. Petits outils
     ====================================================================== */
  const EASE = {
    lin: (t) => t,
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), // doux au départ et à l'arrivée
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    in2: (t) => t * t,
    out2: (t) => 1 - (1 - t) * (1 - t),
  };
  const mixv = (a, b, u) => {
    if (typeof a === 'number') return a + (b - a) * u;
    const o = new Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * u;
    return o;
  };
  /** clés : [[t0, v0], [t1, v1, 'ease'], …] → la valeur à t (l'ease s'applique au segment qui finit à cette clé) */
  function kf(t, K) {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) {
      if (t <= K[i][0]) {
        const a = K[i - 1], b = K[i];
        const d = b[0] - a[0];
        const u = d > 0 ? (EASE[b[2] || 'io'])((t - a[0]) / d) : 1;
        return mixv(a[1], b[1], u);
      }
    }
    return K[K.length - 1][1];
  }
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

  /* interpolation monotone (Fritsch-Carlson) de points [x, y] triés en x → f(x) (comme co-outils.js) */
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
  function table(f, a, b, n = 400) {
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

  let T = null; // les tuiles de bruit (les nôtres)
  function* tuiles() {
    if (T) return T;
    const t = {};
    t.a = yield* R.tuileG(13, 8, 4);
    t.b = yield* R.tuileG(14, 16, 3);
    t.c = yield* R.tuileG(15, 32, 2);
    t.e = yield* R.tuileG(12, 64, 1);
    T = t;
    return T;
  }

  /* ======================================================================
     2. Nos objets (ce que la boîte à outils n'a pas : une basket qui se salit et se nettoie,
        sans ses lacets ; un bol d'eau savonneuse ; un pot de colle ouvert sans pinceau ;
        un tampon et son encreur ; des lacets neufs ; le marteau vu en frappe)
     Chacun : générateur → spec pour R.rendre (repère mm de l'objet).
     ====================================================================== */
  /* ---------- la basket montante : même dessin que celle de l'établi (co-outils.js), mais sans lacets,
     sale ou propre. Repère : talon à −x, bout à +x (on la tourne de −90° : le bout vers le haut de l'écran). */
  const PIED = [
    [145, 4], [139, 26], [122, 43], [97, 50], [66, 49], [36, 43], [6, 35], [-25, 31.5], [-60, 33], [-95, 36],
    [-121, 33.5], [-138, 23], [-145, 4], [-143, -13], [-134, -27], [-116, -35], [-94, -36], [-66, -32], [-36, -27],
    [-6, -30], [24, -40], [54, -48], [84, -50.5], [110, -45], [130, -33], [142, -16],
  ];
  const BASKET = { L: 300, W: 114, ZS: 27 };
  const MODELES = new Map();
  function* modeleBasket() {
    if (MODELES.has('basket')) return MODELES.get('basket');
    yield* tuiles();
    const Ls = BASKET.L, Ws = BASKET.W;
    const kx = Ls / 290, ky = Ws / 101;
    const P = R.spline(PIED.map(([x, y]) => [x * kx, y * ky]), 6, true);
    const trace = (g) => {
      g.beginPath();
      g.moveTo(P[0], P[1]);
      for (let i = 2; i < P.length; i += 2) g.lineTo(P[i], P[i + 1]);
      g.closePath();
    };
    const box = [-156, -62, 156, 62];
    const F = yield* R.champ(box, 2.5, (g) => { trace(g); g.fill(); });
    const daim = yield* R.masqueG(box, 3, (g) => {
      g.save();
      trace(g);
      g.clip();
      g.beginPath(); // le bout rapporté
      g.moveTo(104, -70); g.bezierCurveTo(116, -20, 116, 20, 104, 70); g.lineTo(170, 70); g.lineTo(170, -70); g.closePath();
      g.fill();
      g.lineWidth = 22; // la bande de garde le long de la semelle, et le contrefort du talon
      trace(g); g.stroke();
      g.beginPath(); g.ellipse(-150, 0, 42, 60, 0, 0, TAU); g.fill();
      g.restore();
    });
    const gris = yield* R.masqueG(box, 3, (g) => { // les porte-œillets
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(66, s * 9); g.lineTo(-48, s * 10.5); g.quadraticCurveTo(-54, s * 18, -50, s * 27); g.bezierCurveTo(-20, s * 28, 30, s * 27, 74, s * 21);
        g.closePath();
        g.fill();
      }
    });
    const coutures = yield* R.masqueG(box, 4, (g) => {
      g.lineWidth = 0.45;
      g.setLineDash([1.6, 1.1]);
      g.beginPath(); g.moveTo(100, -60); g.bezierCurveTo(111, -20, 111, 20, 100, 60); g.stroke();
      g.beginPath(); g.moveTo(98, -60); g.bezierCurveTo(108.5, -20, 108.5, 20, 98, 60); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(64, s * 23); g.bezierCurveTo(30, s * 25, -20, s * 26, -58, s * 25); g.stroke(); }
      g.setLineDash([]);
    });
    // les trous du bout (perforations), sur le cuir blanc du dessus du pied
    const perfo = yield* R.masqueG(box, 5, (g) => {
      for (let i = 0; i < 9; i++) for (let j = -4; j <= 4; j++) {
        const x = 64 + i * 4.6, y = j * 4.6 + (i % 2) * 2.3;
        if (Math.abs(y) > 17 - Math.max(0, x - 90) * 0.5) continue;
        g.beginPath(); g.arc(x, y, 0.75, 0, TAU); g.fill();
      }
    });
    const emax = table((x) => Math.max(8, -F.get(x, 0)), -150, 150, 200);
    const retrait = table(monotone([[-152, 3], [-120, 4.5], [-40, 5.5], [60, 5.5], [120, 4.5], [152, 3]]), -152, 152);
    const crete = table(monotone([[152, 33], [140, 44], [124, 53], [100, 61], [74, 67], [50, 73], [26, 83], [2, 95], [-22, 108], [-44, 120], [-62, 127], [-100, 129], [-136, 125], [-152, 112]]), -152, 152);
    const zCorps = (x, y) => {
      const e = -(F.get(x, y) + retrait(x));
      const q = clamp01(e / Math.max(6, emax(x) - retrait(x)));
      return BASKET.ZS + (crete(x) - BASKET.ZS) * (1 - Math.pow(1 - q, 2.3));
    };
    const demiFente = (x) => lerp(9, 10.5, clamp01((58 - x) / 116));
    // les œillets : 7 paires, du bout (0) vers le col (6) ; [x, y] (y > 0 : côté +y)
    const oeillets = [];
    for (let k = 0; k < 7; k++) {
      const x = 58 - k * 17.4, yy = demiFente(x) + 5;
      oeillets.push([[x, -yy], [x, yy]]);
    }
    const surface = (x, y) => { // le dessus (pour poser les lacets)
      let z = zCorps(x, y);
      if (Math.abs(y) < demiFente(x) + 2 && x > -62 && x < 60) z += 3;
      return z;
    };
    // le bord de l'empeigne au bout (là où la semelle s'est décollée) : des points [x, y] le long du contour, rentré du retrait
    const bord = [];
    {
      const n = P.length / 2;
      for (let i = 0; i < n; i++) {
        const x = P[2 * i], y = P[2 * i + 1];
        if (x < 92) continue;
        // on rentre vers l'intérieur de la valeur du retrait (le long de la normale approximée par le centre de l'avant du pied)
        const cx = 95, cy = 0, dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1;
        bord.push([x - (dx / l) * (retrait(x) + 0.3), y - (dy / l) * (retrait(x) + 0.3)]);
      }
      // dans l'ordre du contour : du côté −y vers le côté +y en passant par le bout
      bord.sort((a, b) => Math.atan2(a[1], a[0] - 95) - Math.atan2(b[1], b[0] - 95));
    }
    const Mb = { P, F, daim, gris, coutures, perfo, emax, retrait, crete, zCorps, demiFente, oeillets, surface, bord, OX: -97, OY: 1, OA: 43, OB: 27.5 };
    MODELES.set('basket', Mb);
    return Mb;
  }

  function* specBasket(o) {
    const Mb = yield* modeleBasket();
    const sale = o.sale || 0;
    const oc = [37.7, 112.3, 201.9, 17.4];
    const F = Mb.F, retrait = Mb.retrait, zCorps = Mb.zCorps;
    const GOMME = MAT.gommeBlanche, JAUNE = lin('#d8c79a'), CRASSE = lin('#5d5246');
    const BLANC = MAT.cuirBlanc, DAIM = R.matiere('#a8a6a0', { ro: 0.9, f0: 0.02, sh: 0.45 }), GRIS = R.matiere('#8d8b86', { ro: 0.42, f0: 0.04 });
    const DOUBLURE = lin('#2e2d2e'), SEMELLE_INT = lin('#6f6b64'), SALE = lin('#7a6a55'), BOUE = lin('#4e4236');
    const couches = [];
    // --- la semelle : le bord blanc qui dépasse (jauni, éraflé si elle est sale)
    couches.push({
      box: [-156, -62, 156, 62],
      f(x, y, S) {
        const d = F.get(x, y);
        S.d = d;
        if (d > S.lim) return;
        const e = -d;
        const bout = sstep(118, 150, x) * 6;
        S.z = R.bord(e, 2.2, BASKET.ZS + bout);
        R.mat(S, GOMME, 1, 0.02);
        R.teinte(S, JAUNE, 0.06 + sale * (0.38 + 0.35 * sstep(3, 0, e)) + tx(T.a, x * 0.03 + oc[0], y * 0.05) * 0.05);
        if (sale > 0) {
          const eraf = sstep(0.5, 0.8, tx(T.b, x * 0.12 + oc[1], y * 0.2 + oc[2]));
          const crasse = sstep(0.1, 0.7, tx(T.a, x * 0.06 + oc[3], y * 0.1) * 0.7 + sstep(3.5, 0.5, e) * 0.5);
          R.teinte(S, CRASSE, sale * Math.min(0.8, eraf * 0.5 + crasse * 0.55));
          S.ro += sale * 0.12;
        }
        const st = R.trait(((x * 0.9) % 2.2 + 2.2) % 2.2 - 1.1, 0.5, 1 / S.ppm) * sstep(2.2, 0.5, e) * R.lod(2.2, S.ppm);
        S.z -= st * 0.3;
      },
    });
    // --- la tige : cuir blanc bombé, daim gris, porte-œillets, perforations ; le col et l'intérieur
    couches.push({
      box: [-153, -59, 153, 59],
      f(x, y, S) {
        const d = F.get(x, y) + retrait(x);
        S.d = d;
        if (d > S.lim) return;
        let z = zCorps(x, y);
        const dO = geo.ellipse(x - Mb.OX, y - Mb.OY, Mb.OA, Mb.OB);
        const pli = x > 60 && x < 108 ? Math.sin((x - 60) * 0.42 + y * 0.05) * sstep(28, 0, Math.abs(y)) * 0.6 : 0;
        z += pli;
        const grain = tx(T.e, x * 0.7 + oc[0], y * 0.7 + oc[1]) * R.lod(0.9, S.ppm);
        R.mat(S, BLANC, 0.98 + grain * 0.03, grain * 0.04);
        S.z = z + grain * 0.03;
        let dansCol = false;
        if (dO < 12) {
          dansCol = true;
          if (dO > 0) {
            // le col matelassé : un bourrelet qui sort doucement de la tige (pas une marche)
            const t = dO / 12, bb = Math.sqrt(Math.max(0, 1 - ((t - 0.4) * (t - 0.4)) / 0.36));
            S.z = Math.max(z, lerp(z, 126 + 5 * bb, sstep(1, 0.55, t)));
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
        const fente = Mb.demiFente(x);
        const lg = fente + 2.5, bout = -56 - 10 * Math.sqrt(Math.max(0, 1 - (y / lg) * (y / lg))); // le haut de la languette, arrondi
        if (x > bout && x < 60 && Math.abs(y) < lg) {
          const u = clamp01((lg - Math.abs(y)) / 3) * clamp01((x - bout) / 2.5);
          const haut = x < -44 ? (-44 - x) * 0.55 : 0;
          S.z = Math.max(S.z, zCorps(x, y) + 2.5 * u + haut);
          R.mat(S, BLANC, 0.93, 0.12);
          const maille = Math.sin(x * 3.2) * Math.sin(y * 3.2) * R.lod(1, S.ppm);
          S.r *= 1 + maille * 0.05; S.g *= 1 + maille * 0.05; S.b *= 1 + maille * 0.05;
          dansCol = false;
        }
        const p1 = Mb.daim.get(x, y), p2 = Mb.gris.get(x, y);
        if (p1 > 0 && dO > 12) {
          R.mat(S, DAIM, (1 + tx(T.c, x * 0.5 + oc[2], y * 0.5 + oc[3]) * 0.08) * (1 - sale * 0.18), 0);
          R.teinte(S, BLANC, 1 - p1);
          S.z += 0.9 * p1;
        }
        if (p2 > 0) {
          R.teinte(S, GRIS, p2);
          S.ro = lerp(S.ro, GRIS.ro, p2);
          S.sh *= 1 - p2;
          S.z += 0.8 * p2;
        }
        const pf = Mb.perfo.get(x, y) * R.lod(1.2, S.ppm);
        if (pf > 0 && p1 < 0.5) { S.z -= pf * 0.5; R.teinte(S, [0.18, 0.18, 0.18], pf * 0.6); }
        const cou = Mb.coutures.get(x, y) * R.lod(1.4, S.ppm);
        if (cou > 0) { R.teinte(S, [0.45, 0.44, 0.41], cou * 0.7); S.z -= cou * 0.15; }
        // sale : le gris-brun de la rue, surtout au bout, dans les plis de marche et vers la semelle ; des taches
        if (sale > 0 && !dansCol) {
          // un voile gris-brun partout (plus fort au bout, dans les plis de marche, près de la semelle),
          // des taches de boue, des éraflures sombres, la poussière dans les perforations et les coutures
          const n1 = tx(T.b, x * 0.05 + oc[0], y * 0.08 + oc[1]), n2 = tx(T.c, x * 0.18 + oc[2], y * 0.18 + oc[3]), n3 = tx(T.a, x * 0.02 + oc[1], y * 0.03 + oc[0]);
          const voile = 0.3 + 0.25 * n3;
          const zone = sstep(0.1, 0.8, n1 * 0.5 + sstep(60, 150, x) * 0.5 + sstep(-12, 0, d) * 0.55 + (pli > 0.15 ? 0.35 : 0));
          R.teinte(S, SALE, sale * Math.min(0.85, voile + zone * 0.55));
          const tache = sstep(0.36, 0.58, n2 * 0.7 + n1 * 0.45);
          R.teinte(S, BOUE, sale * tache * 0.62);
          const eraf = R.trait(((x * 0.35 + y * 0.9 + n1 * 14) % 9 + 9) % 9 - 4.5, 0.6, 1 / S.ppm) * sstep(0.3, 0.6, n2) * sstep(40, 110, x);
          R.teinte(S, [0.06, 0.05, 0.045], sale * eraf * 0.5);
          if (pf > 0 || cou > 0) R.teinte(S, BOUE, sale * Math.max(pf, cou) * 0.6);
          if (p1 > 0.5) { S.r *= 1 - sale * 0.22; S.g *= 1 - sale * 0.24; S.b *= 1 - sale * 0.27; }
          S.ro += sale * zone * 0.12;
        }
      },
    });
    // --- les œillets (anneaux d'acier)
    const oe = [].concat(...Mb.oeillets);
    couches.push({
      box: [-58, -24, 66, 24],
      f(x, y, S) {
        let best = 9, bx = 0, by = 0;
        for (const [ex, ey] of oe) {
          const dd = Math.hypot(x - ex, y - ey);
          if (dd < best) { best = dd; bx = ex; by = ey; }
        }
        const d = Math.max(best - 3.1, 1.3 - best);
        S.d = d;
        if (d > S.lim) return;
        S.z = Mb.surface(bx, by) + 1.2 + 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow((best - 2.2) / 0.9, 2)));
        R.mat(S, MAT.acierPoli, 0.9 - sale * 0.25, 0.08 + sale * 0.15);
      },
    });
    return {
      box: [-156, -62, 156, 62], haut: 138, couches,
      cavite: [3, 0.045], soleil: 1.4, ombre: { opacite: 0.58, contact: 0.5, doux: 1.1 },
    };
  }

  /* ---------- le bol d'eau savonneuse (inox), pour tremper la brosse ---------- */
  function* specBol() {
    yield* tuiles();
    const RB = 44, HB = 38, HE = 27;
    const EAU = lin('#7d8a8c'), MOUSSE = lin('#f2f1ec');
    return {
      box: [-46, -46, 46, 46], haut: HB,
      couches: [{
        box: [-46, -46, 46, 46],
        f(x, y, S) {
          const r = Math.hypot(x, y);
          const d = r - RB;
          S.d = d;
          if (d > S.lim) return;
          if (r > RB - 2.4) { // le bord roulé
            const q = (r - (RB - 1.2)) / 1.2;
            S.z = HB - 1.2 + 1.2 * Math.sqrt(Math.max(0, 1 - q * q));
            R.mat(S, MAT.acierPoli, 0.92, 0.04);
          } else if (r > RB - 8) { // la paroi intérieure, qui plonge vers l'eau
            const t = (RB - 2.4 - r) / 5.6;
            S.z = lerp(HB - 1.5, HE + 0.5, t);
            R.mat(S, MAT.acierBrosse, 0.85, 0.05);
            S.an = 0.15; S.gx = -y / (r || 1); S.gy = x / (r || 1);
          } else { // l'eau grise, et des îlots de mousse
            S.z = HE + 0.2 * tx(T.b, x * 0.2, y * 0.2);
            R.mat(S, MAT.plastiqueNoir);
            R.teinte(S, EAU, 1);
            S.ro = 0.06; S.f0 = 0.03;
            const ms = sstep(0.05, 0.3, tx(T.b, x * 0.09 + 11, y * 0.09 + 3) + sstep(RB - 16, RB - 8, r) * 0.5);
            if (ms > 0) {
              const bulle = 0.5 + 0.5 * Math.sin(tx(T.e, x * 1.6, y * 1.6) * 9);
              R.teinte(S, MOUSSE, ms * 0.9);
              S.ro = lerp(S.ro, 0.4, ms); S.z += ms * (1.2 + bulle * 0.6);
            }
          }
        },
      }],
      cavite: [2, 0.12], soleil: 1, ombre: { opacite: 0.55, contact: 0.5 },
    };
  }

  /* ---------- le pot de colle ouvert (la même boîte de fer-blanc que sur l'établi, sans son pinceau) ---------- */
  const POT = { RB: 40, HB: 62, HC: 47 };
  function* specPot() {
    yield* tuiles();
    const { RB, HB, HC } = POT;
    const COLLE = lin('#5b3b19'), PEAU = lin('#7a5327'), FER = R.matiere('#b9b3a6', { ro: 0.3, me: 1 });
    const oc = [71.1, 23.9, 140.6];
    return {
      box: [-42, -42, 42, 42], haut: HB,
      couches: [{
        box: [-42, -42, 42, 42],
        f(x, y, S) {
          const r = Math.hypot(x, y);
          const d = r - RB;
          S.d = d;
          if (d > S.lim) return;
          if (r > RB - 2.6) {
            const q = (r - (RB - 1.3)) / 1.3;
            S.z = HB - 1.3 + 1.3 * Math.sqrt(Math.max(0, 1 - q * q));
            R.mat(S, FER, 0.95, 0.05);
          } else if (r > RB - 4.2) {
            const t = (RB - 2.6 - r) / 1.6;
            S.z = lerp(HB - 1.5, HC + 1, t);
            R.mat(S, FER, 0.7, 0.2);
            S.ao = 0.55;
          } else {
            S.z = HC + 0.5 * tx(T.b, x * 0.12 + oc[0], y * 0.12 + oc[1]) + 0.4 * sstep(RB - 10, RB - 4.2, r);
            R.mat(S, MAT.plastiqueNoir);
            R.teinte(S, COLLE, 1);
            S.ro = 0.12; S.f0 = 0.05;
            const ride = Math.sin(tx(T.c, x * 0.3 + oc[2], y * 0.3) * 9) * R.lod(1.2, S.ppm);
            S.z += ride * 0.12;
            R.teinte(S, PEAU, sstep(RB - 12, RB - 4, r) * 0.6);
          }
          const cr = sstep(0.35, 0.75, tx(T.c, Math.atan2(y, x) * 5 + oc[1], r * 0.2)) * sstep(RB - 6, RB - 1, r);
          if (cr > 0) { R.teinte(S, PEAU, cr * 0.8); S.me *= 1 - cr; S.ro = lerp(S.ro, 0.2, cr); S.z += cr * 0.5; }
        },
      }],
      cavite: [3, 0.08], soleil: 1.2, ombre: { opacite: 0.58, contact: 0.5, doux: 1.1 },
    };
  }

  /* ---------- le tampon (manche de hêtre, semelle de caoutchouc) et son encreur (boîte de fer, feutre rouge) ---------- */
  function* specTampon() {
    yield* tuiles();
    const HETRE = R.matiere('#b88a5a', { ro: 0.34, f0: 0.05 });
    return {
      box: [-27, -14, 27, 14], haut: 66,
      couches: [
        { // le sabot : un bloc de bois, arêtes arrondies
          box: [-27, -14, 27, 14],
          f(x, y, S) {
            const d = geo.boite(x, y, 26, 12.5, 3);
            S.d = d;
            if (d > S.lim) return;
            S.z = 8 + R.bord(-d, 3, 12);
            R.mat(S, HETRE, 0.95 + tx(T.c, x * 0.3, y * 0.9) * 0.08, 0);
            // la tranche rouge du caoutchouc qui dépasse à peine
            if (-d < 0.8) R.teinte(S, lin('#8a1d17'), 0.7);
          },
        },
        { // le bouton : une poire tournée
          box: [-13, -13, 13, 13],
          f(x, y, S) {
            const r = Math.hypot(x, y);
            const d = r - 12;
            S.d = d;
            if (d > S.lim) return;
            const q = r / 12;
            S.z = 30 + 34 * Math.sqrt(Math.max(0, 1 - q * q * q));
            R.mat(S, HETRE, 1.05 + tx(T.e, x * 0.8, y * 0.8) * 0.05, -0.08);
            // les cernes du bois tourné
            const cerne = Math.sin(r * 2.2 + tx(T.b, x * 0.2, y * 0.2) * 3) * R.lod(1.4, S.ppm);
            S.r *= 1 + cerne * 0.05; S.g *= 1 + cerne * 0.05; S.b *= 1 + cerne * 0.04;
          },
        },
      ],
      cavite: [2, 0.1], soleil: 1.2, ombre: { opacite: 0.58, contact: 0.5 },
    };
  }
  function* specEncreur() {
    yield* tuiles();
    const FER = R.matiere('#8f8a80', { ro: 0.32, me: 1 }), FEUTRE = lin('#8c1c16');
    return {
      box: [-44, -28, 44, 28], haut: 12,
      couches: [{
        box: [-44, -28, 44, 28],
        f(x, y, S) {
          const d = geo.boite(x, y, 43, 27, 5);
          S.d = d;
          if (d > S.lim) return;
          const e = -d;
          if (e < 3.2) { // le rebord de la boîte
            S.z = 10 + R.bord(e, 1.2, 1.5);
            R.mat(S, FER, 0.9 + tx(T.c, x * 0.3, y * 0.3) * 0.08, 0.05);
            const ro = sstep(0.4, 0.7, tx(T.b, x * 0.1 + 5, y * 0.1));
            R.teinte(S, [0.2, 0.09, 0.05], ro * 0.5); // la rouille et l'encre séchée
          } else { // le feutre imbibé d'encre rouge, mat, un peu plus sombre au milieu (on y tamponne)
            S.z = 8 + 0.3 * tx(T.e, x * 0.6, y * 0.6);
            R.mat(S, MAT.tissu);
            R.teinte(S, FEUTRE, 1);
            const use = sstep(22, 4, Math.hypot(x, y * 1.5));
            S.r *= 1 - use * 0.3; S.g *= 1 - use * 0.4; S.b *= 1 - use * 0.4;
            S.ro = 0.7 - use * 0.3; S.sh = 0.2;
          }
        },
      }],
      cavite: [1.5, 0.2], soleil: 0.8, ombre: { opacite: 0.5, contact: 0.55 },
    };
  }

  /* ---------- une paire de lacets neufs, plats, blancs, pliés en quatre dans leur bague de papier kraft ---------- */
  const LACET_NEUF = '#f1efe8';
  function* specLacetsNeufs() {
    yield* tuiles();
    const BLANC = R.matiere(LACET_NEUF, { ro: 0.72, f0: 0.03, sh: 0.25 }), FERRET = lin('#cfd2d4');
    const KRAFT = R.matiere('#b88c5c', { ro: 0.85, f0: 0.03 });
    const couches = [];
    // chaque lacet : plié en zigzag (quatre longueurs de 104 mm), les plis en U aux deux bouts
    const lacet = (y0, s) => {
      const pts = [], L = 52, n = 4, e = 6.6;
      for (let k = 0; k < n; k++) {
        const y = y0 + k * e * s, sens = k % 2 ? -1 : 1;
        for (let i = 0; i <= 12; i++) pts.push([sens * (-L + (2 * L * i) / 12), y + Math.sin(i * 0.9 + k) * 0.4, 1.8]);
        if (k < n - 1) { // le pli : un demi-tour
          const xe = sens * L;
          for (let i = 1; i < 6; i++) { const a = (i / 6) * Math.PI; pts.push([xe + sens * Math.sin(a) * e * 0.55, y + (1 - Math.cos(a)) * 0.5 * e * s, 1.8]); }
        }
      }
      couches.push({
        tube: pts, r: 3.4, plat: 0.8,
        f(t, u, S) {
          R.mat(S, BLANC, 1 - Math.abs(u) * 0.04, 0);
          const tr = Math.sin(t * 5.5) * R.lod(1.2, S.ppm);
          S.r *= 1 + tr * 0.04; S.g *= 1 + tr * 0.04; S.b *= 1 + tr * 0.04;
        },
      });
      // les ferrets aux deux bouts
      for (const seg of [pts.slice(0, 4), pts.slice(-4)]) {
        couches.push({ tube: seg.map((p) => [p[0], p[1], p[2] + 0.3]), r: 2.5, f(t, u, S) { R.mat(S, MAT.plastiqueBlanc); R.teinte(S, FERRET, 0.7); S.ro = 0.15; S.f0 = 0.05; } });
      }
    };
    lacet(-20.5, 1);
    lacet(20.5, -1);
    // la bague de papier kraft, au milieu
    couches.push({
      box: [-12, -29, 12, 29],
      f(x, y, S) {
        const d = geo.boite(x, y, 11, 28, 1.5);
        S.d = d;
        if (d > S.lim) return;
        S.z = 4.2 + 0.4 * Math.sqrt(Math.max(0, 1 - (y / 28) * (y / 28))) + R.bord(-d, 0.6, 0.3);
        R.mat(S, KRAFT, 1 + tx(T.e, x * 0.8, y * 0.8) * 0.06, 0);
        const tr = R.trait(x - 7, 0.4, 1 / S.ppm) + R.trait(x + 7, 0.4, 1 / S.ppm); // deux filets imprimés
        if (tr > 0) R.teinte(S, [0.12, 0.08, 0.05], Math.min(1, tr) * 0.5);
      },
    });
    return {
      box: [-62, -34, 62, 34], haut: 6, couches,
      cavite: [1.2, 0.25], soleil: 0.6, ombre: { opacite: 0.55, contact: 0.55 },
    };
  }

  /* ---------- le marteau vu en frappe : la tête debout (la panne fendue en haut, la face ronde en bas),
     le manche à plat. Même manche que le marteau posé (co-outils.js) : frêne verni, la prise patinée.
     Repère : le manche le long de x (le bout à −150), la tête en x = 127. ---------- */
  function* specMarteauFrappe() {
    yield* tuiles();
    const XH = 127, ZH = 58; // l'axe du manche, à mi-hauteur de la tête
    const bois = R.matiere('#b59a7c', { ro: 0.3, f0: 0.05 });
    const wM = table(monotone([[-150, 13.2], [-138, 15.2], [-118, 15.8], [-80, 14.6], [-30, 13.0], [30, 11.6], [80, 11.1], [108, 11.9], [145, 11.6]]), -151, 146);
    return {
      box: [-151, -20, XH + 21, 20], haut: 118,
      couches: [
        { // le manche (à plat, à la hauteur de l'œil de la tête)
          box: [-151, -17, XH - 6, 17],
          f(x, y, S) {
            const w = wM(x), qx = -(x + 150), qy = Math.abs(y) - w, r = 5;
            const ax = Math.max(qx + r, 0), ay = Math.max(qy + r, 0);
            let d = Math.hypot(ax, ay) + Math.min(Math.max(qx + r, qy + r), 0) - r;
            d = Math.max(d, x - (XH - 8));
            S.d = d;
            if (d > S.lim) return;
            const q = Math.min(1, Math.abs(y) / w), bout = clamp01((x + 150) / 5);
            const prof = Math.sqrt(Math.max(0, 1 - q * q)) * Math.sqrt(1 - (1 - bout) * (1 - bout));
            S.z = lerp(10.6, ZH - 10, clamp01((x + 150) / (XH + 150))) + w * 0.78 * prof;
            const vn = Math.sin((y * 1.1 + tx(T.a, x * 0.018, y * 0.3) * 2.6) * 1.35 * TAU) > 0.6 ? 1 : 0;
            let k = 0.95 - vn * 0.2 + tx(T.b, x * 0.03, y * 0.2) * 0.1;
            const prise = sstep(-40, -95, x) * 0.7;
            k *= 1 - prise * 0.3;
            R.mat(S, bois, k, prise * 0.18);
            S.g *= 0.97 - prise * 0.04; S.b *= 0.9 - prise * 0.1;
          },
        },
        { // la tête, vue d'en haut : la face ronde (en bas, la plus large), le col, l'œil, la panne fendue (en haut)
          box: [XH - 20, -20, XH + 20, 20],
          f(x, y, S) {
            const u = x - XH, v = y;
            const r = Math.hypot(u, v);
            const d = r - 17.5;
            S.d = d;
            if (d > S.lim) return;
            // la panne : une lame étroite (le long de v), fendue en son milieu
            const lame = Math.max(Math.abs(u) - 4.2, Math.abs(v) - 15);
            const fente = Math.abs(v) < 1.3 && Math.abs(u) < 4.2;
            if (lame < 0 && !fente) {
              S.z = 112 + 4 * sstep(4.2, 0, Math.abs(u));
              R.mat(S, MAT.acierPoli, 0.95, 0.04);
            } else if (fente) {
              S.z = 96; R.mat(S, MAT.acierNoir, 0.4, 0.1); S.ao = 0.4;
            } else if (Math.abs(u) < 12.5 && Math.abs(v) < 13.5) { // le corps forgé, qui s'évase vers le bas
              const e = Math.min(12.5 - Math.abs(u), 13.5 - Math.abs(v));
              S.z = 104 - 40 * sstep(0, 1, 1 - e / 5.5);
              R.mat(S, MAT.acierNoir, 1 + tx(T.c, u * 0.5, v * 0.5) * 0.12, 0.05);
            } else { // la face ronde, polie, qu'on voit dépasser tout autour
              S.z = 20 + R.bord(-d, 3, 6);
              R.mat(S, MAT.acierPoli, 0.9, 0.06);
            }
          },
        },
      ],
      cavite: [2, 0.2], soleil: 1, ombre: { opacite: 0.6, contact: 0.3 },
    };
  }

  /* ---------- l'empreinte du tampon « PRÊTE » (encre rouge, un peu irrégulière) : un canvas 2D ---------- */
  function empreintePrete(ppm) {
    const W = 50, H = 22; // mm
    const c = R.canvas(W * ppm, H * ppm), g = c.getContext('2d');
    g.scale(ppm, ppm);
    g.fillStyle = 'rgba(200, 32, 28, 0.9)';
    g.strokeStyle = 'rgba(200, 32, 28, 0.9)';
    g.lineWidth = 1.2;
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    rr(1.5, 1.5, W - 3, H - 3, 2.5);
    g.stroke();
    rr(3.2, 3.2, W - 6.4, H - 6.4, 1.6);
    g.lineWidth = 0.4;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fam = (O.POLICE && O.POLICE.chiffres) || "'Big Shoulders', 'Arial Narrow', sans-serif";
    g.font = '800 11px ' + fam;
    g.save();
    g.translate(W / 2, H / 2 + 0.6);
    g.scale(1.25, 1);
    g.fillText('PRÊTE', 0, 0);
    g.restore();
    // l'encre ne prend pas partout : des manques (un voile de trous, effacé par composition : aucune relecture de pixels)
    g.setTransform(1, 0, 0, 1, 0, 0);
    const n = 96, trous = R.canvas(n, n), gt = trous.getContext('2d');
    const img = gt.createImageData(n, n), d = img.data, rng = R.rng(77);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = tx(T.c, i * 0.9, j * 0.9) * 0.6 + tx(T.e, i * 2.2, j * 2.2) * 0.4;
      const a = (1 - sstep(-0.35, 0.2, v)) * 0.38 + (rng() < 0.04 ? 0.5 : 0);
      const k = (j * n + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = Math.min(255, a * 255);
    }
    gt.putImageData(img, 0, 0);
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = g.createPattern(trous, 'repeat');
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    return { canvas: c, w: W, h: H };
  }

  /* ======================================================================
     3. Les sprites : les nôtres et ceux de la boîte à outils, calculés par tranches (co-mains.js),
        gardés en mémoire (R.cache) et dans le téléphone (R.coffre)
     ====================================================================== */
  const VERSION = 'process-4';
  const NOS = {
    'basket-sale': () => specBasket({ sale: 1 }),
    'basket-propre': () => specBasket({ sale: 0 }),
    bol: specBol,
    pot: specPot,
    tampon: specTampon,
    encreur: specEncreur,
    'lacets-neufs': specLacetsNeufs,
    'marteau-frappe': specMarteauFrappe,
  };
  const q5 = (v, s) => Math.round(v / s) * s;
  /** un sprite : id (nos objets, ou ceux de CO.Outils), { ppm, angle (degrés), graine, ticket: {…} } → Promise */
  function sprite(id, o, prio = 1) {
    const ppm = q5(o.ppm, 0.05), deg = q5(o.angle || 0, 0.5), graine = o.graine || 63;
    const extra = o.ticket ? '|' + [o.ticket.travail, o.ticket.prix, o.ticket.date].join(',') : '';
    const k = [VERSION, id, graine, ppm.toFixed(2), deg.toFixed(1)].join('|') + extra;
    const c = R.cache.get(k);
    if (c) return Promise.resolve(c);
    if (sprite.enCours.has(k)) return sprite.enCours.get(k);
    const sansCoffre = o.sansCoffre || /[?&]nocache\b/.test(location.search);
    const gen = (function* () {
      if (!sansCoffre) {
        const box = { v: undefined };
        yield M.coffre.sortir('pr|' + k).then((x) => { box.v = x; });
        if (box.v) return box.v;
      }
      const t0 = now();
      let spec;
      if (NOS[id]) spec = yield* NOS[id]();
      else if (O.defs[id]) spec = yield* O.defs[id].construire(Object.assign({ graine, ppm, angle: deg }, o.ticket || {}));
      else throw new Error('objet inconnu : ' + id);
      spec.ppm = ppm;
      spec.angle = deg * DEG;
      const sp = yield* R.rendre(spec);
      sp.id = id;
      sp.t.tout = now() - t0;
      if (spec.numero) sp.numero = spec.numero;
      if (!sansCoffre) M.coffre.ranger('pr|' + k, sp);
      return sp;
    })();
    const p = M.calcul.lancer(gen, prio, id).then((sp) => { sprite.enCours.delete(k); return R.cache.set(k, sp); }, (e) => { sprite.enCours.delete(k); throw e; });
    sprite.enCours.set(k, p);
    return p;
  }
  sprite.enCours = new Map();

  /* ======================================================================
     4. La scène (mm, axes de l'écran : x à droite, y en bas ; 0 au centre du cadre)
     ====================================================================== */
  const SC = {
    cadre: 440, // ce qui doit tenir à l'écran (un carré de 44 cm d'établi)
    tapis: { x: 92, y: 38, angle: -3.2 * DEG, W: 600, H: 450 }, // son coin haut-gauche dans le champ : l'aggloméré autour
    graine: 71, // (le ticket 0749 ; la liasse montre le suivant)
    pile: { x: -170, y: 154, a: 8 },
    pot: { x: 174, y: -64 },
    bol: { x: 166, y: -186 },
    encreur: { x: -170, y: -24 },
    mug: { x: -186, y: -196, a: 20 },
    brosse: { x: 36, y: -210, a: 0 },
    pinceau: { x: 140, y: -11, a: -60 }, // appuyé dans le pot, les soies dans la colle, le manche vers le bas
    marteau: { x: 194, y: 146, a: -90 },
    lacetsNeufs: { x: -156, y: -142, a: -8 },
    tampon: { x: -170, y: -24, a: 0 }, // posé sur l'encreur
    ticketPose: { x: -76, y: 150, a: 39.5 },
    vieuxLacet: [100, -138],
    epauleD: [235, 560], epauleG: [-235, 560],
    reposD: [120, 234], reposG: [-114, 242],
    horsD: [215, 450], horsG: [-215, 450],
  };
  const TICKET = { travail: 'nettoyage', prix: '35 €', date: 'jeudi' };
  // le décor cuit dans le fond (il ne bouge jamais)
  const DECOR = [
    { id: 'tickets-pile', x: SC.pile.x, y: SC.pile.y, a: SC.pile.a },
    { id: 'pot', x: SC.pot.x, y: SC.pot.y, a: 0 },
    { id: 'bol', x: SC.bol.x, y: SC.bol.y, a: 0 },
    { id: 'encreur', x: SC.encreur.x, y: SC.encreur.y, a: 0 },
    { id: 'mug', x: SC.mug.x, y: SC.mug.y, a: SC.mug.a, facultatif: true },
  ];

  /* les étapes (l'appli s'en sert pour la bulle de Clément et la liste du process) */
  const ETAPES = [['discuter', 0], ['ticket', 4.6], ['demonter', 8.8], ['reparer', 17.2], ['finir', 23.8], ['rendre', 28.9]];
  const FIN = 32.9, FONDU = 35.8, DUREE = 36.4; // la dernière main sort ; 3 s sur l'image finale ; le fondu vers le début

  /* la basket : son repère (talon −x, bout +x) → l'écran */
  const B2W = (sh, mx, my) => { const c = Math.cos(sh.a), s = Math.sin(sh.a); return [sh.x + mx * c - my * s, sh.y + mx * s + my * c]; };
  const W2B = (sh, X, Y) => { const c = Math.cos(sh.a), s = Math.sin(sh.a), dx = X - sh.x, dy = Y - sh.y; return [dx * c + dy * s, -dx * s + dy * c]; };

  /* ======================================================================
     5. La chorégraphie : l'état de tout, à l'instant t
     ====================================================================== */
  /** les poses successives d'une main : [[t, 'pose'], …] ; fondu de d secondes autour de chaque changement */
  function poses(t, L, d = 0.3) {
    let cur = L[0][1];
    for (let i = 1; i < L.length; i++) {
      const ti = L[i][0], p = L[i][1];
      if (p === cur) continue;
      if (t < ti - d / 2) return { pose: cur, pose2: null, mix: 0 };
      if (t < ti + d / 2) return { pose: cur, pose2: p, mix: sstep(0, 1, (t - (ti - d / 2)) / d) };
      cur = p;
    }
    return { pose: cur, pose2: null, mix: 0 };
  }
  const win = (t, a, b) => t >= a && t < b;
  const pr = (t, a, b) => clamp01((t - a) / (b - a));

  /* le chemin du pinceau et du marteau : le bord décollé de l'empeigne, au bout (repère de la basket) */
  let BORD = null; // { pts: [[x, y]], cum: [mm], L }
  function bordDe(Mb) {
    if (BORD) return BORD;
    const pts = Mb.bord.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.5);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    BORD = { pts, cum, L: cum[cum.length - 1] };
    return BORD;
  }
  function surBord(u) { // un point du bord, u ∈ [0, 1] → [x, y, nx, ny] (repère de la basket, normale vers l'extérieur)
    const B = BORD, s = clamp01(u) * B.L;
    let i = 1;
    while (i < B.cum.length - 1 && B.cum[i] < s) i++;
    const a = B.pts[i - 1], b = B.pts[i], l = B.cum[i] - B.cum[i - 1] || 1, k = (s - B.cum[i - 1]) / l;
    const x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k);
    const tx0 = (b[0] - a[0]) / l, ty0 = (b[1] - a[1]) / l;
    let nx = ty0, ny = -tx0;
    if (nx * (x - 95) + ny * y < 0) { nx = -nx; ny = -ny; }
    return [x, y, nx, ny];
  }

  /* les coups de marteau (le long du bord), les croisillons du laçage, le brossage */
  const COUPS = [0.1, 0.27, 0.43, 0.58, 0.74, 0.9].map((u, k) => ({ u, t: 21.92 + k * 0.27 }));
  const CROIX = [0, 1, 2, 3, 4, 5].map((k) => 25.62 + k * 0.43);
  const BROSSE_T = [14.6, 16.5];
  // le trajet de la brosse sur la basket (repère de la basket) : du bout vers le col, en petits cercles
  const BROSSE_CHEMIN = [[128, 4], [112, -14], [96, 10], [78, -8], [60, 12], [40, -10], [20, 8], [0, -6], [-22, 6], [-36, -4]];
  function brossePos(t) { // → [mx, my] (repère de la basket)
    const u = pr(t, BROSSE_T[0], BROSSE_T[1]);
    const n = BROSSE_CHEMIN.length - 1, f = EASE.sine(u) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    const a = BROSSE_CHEMIN[i], b = BROSSE_CHEMIN[i + 1];
    const ph = (t - BROSSE_T[0]) * TAU * 2.1;
    const r = 7 * sstep(0, 0.05, u) * (1 - sstep(0.95, 1, u));
    return [lerp(a[0], b[0], EASE.sine(k)) + Math.cos(ph) * r, lerp(a[1], b[1], EASE.sine(k)) + Math.sin(ph) * r * 1.2];
  }

  /**
   * L'état du film à l'instant t : la basket, le ticket, les outils, les lacets, la mousse, les mains.
   * (Tout se déduit de t : on peut sauter n'importe où.)
   */
  function etat(t, Mb) {
    const E = { t };
    // ---------------- la basket ----------------
    const shK = kf(t, [
      [0, [70, 430, -100, 70]],
      [0.5, [70, 430, -100, 70]],
      [2.05, [6, 16, -94, 12], 'out'],
      [2.2, [4, 12, -93, 0], 'in2'],
      [29.3, [4, 12, -93, 0]],
      [29.85, [0, 6, -90, 0], 'io'],
    ]);
    const sh = (E.basket = { x: shK[0], y: shK[1], a: shK[2] * DEG, lev: shK[3], vis: t > 0.45 });
    // la petite secousse de chaque coup de marteau
    for (const c of COUPS) { const d = t - c.t; if (d > 0 && d < 0.12) { const k = Math.sin((d / 0.12) * Math.PI) * (1 - d / 0.12); sh.y += 0.7 * k; } }
    const B = (mx, my) => B2W(sh, mx, my);
    const NOEUD = [-62, 0]; // le nœud du lacet, sur la languette, au pied du col

    // ---------------- les lacets ----------------
    // le vieux : noué au départ ; on défait le nœud, on tire, il sort des œillets, il se pose à droite
    const vieux = (E.vieux = { noeud: 1 - sstep(9.85, 10.3, t), retire: 0, tire: null, pose: 0, vis: t < 30 });
    vieux.retire = t < 10.3 ? 0 : t < 11.0 ? 0.5 * EASE.io(pr(t, 10.3, 11.0)) : t < 11.35 ? 0.5 : 0.5 + 0.5 * EASE.io(pr(t, 11.35, 12.05));
    vieux.pose = sstep(12.25, 12.6, t);
    // le neuf : sorti de son rouleau, posé en travers du bout, lacé croisillon par croisillon, noué
    const neuf = (E.neuf = { vis: t >= 24.3, barre: sstep(25.05, 25.3, t), croix: 0, noeud: sstep(28.1, 28.45, t), rouleau: t < 24.35 });
    let nc = 0;
    for (let k = 0; k < CROIX.length; k++) nc += sstep(CROIX[k] - 0.18, CROIX[k] + 0.12, t);
    neuf.croix = nc; // 0..6 croisillons

    // ---------------- le ticket ----------------
    const tk = (E.ticket = { x: SC.pile.x, y: SC.pile.y, a: SC.pile.a * DEG, lev: 0, vis: true, tampon: t >= 31.0 ? 1 : 0, fil: 0, filLibre: 0 });
    const pinceTicket = [0, -52]; // la main le prend par le haut, près de l'œillet
    const Bn = B(NOEUD[0], NOEUD[1]);
    // la pose d'accrochage : l'œillet du ticket contre le nœud, le ticket qui pend vers le bas à gauche
    const aAcc = 30 * DEG, oeilAcc = [Bn[0] - 5, Bn[1] + 7];
    const cAcc = [oeilAcc[0] - rot(0, -58, aAcc)[0], oeilAcc[1] - rot(0, -58, aAcc)[1]];
    const tkK = kf(t, [
      [5.45, [SC.pile.x, SC.pile.y, SC.pile.a, 0]],
      [5.8, [SC.pile.x + 6, SC.pile.y - 10, 14, 16], 'out'],
      [6.75, [cAcc[0], cAcc[1], 30, 22], 'io'],
      [7.3, [cAcc[0], cAcc[1], 30, 20]],
      [8.0, [SC.ticketPose.x, SC.ticketPose.y, SC.ticketPose.a, 0], 'io'],
    ]);
    tk.x = tkK[0]; tk.y = tkK[1]; tk.a = tkK[2] * DEG; tk.lev = tkK[3];
    if (win(t, 6.75, 7.3)) { const ph = pr(t, 6.75, 7.3) * TAU; tk.x += Math.sin(ph) * 3; tk.y += (1 - Math.cos(ph)) * 1.5; } // le geste pour passer l'élastique
    tk.fil = sstep(6.95, 7.1, t); // l'élastique autour du lacet
    tk.filLibre = sstep(9.95, 10.4, t); // le nœud défait : l'élastique glisse, retombe

    // ---------------- les outils ----------------
    const brosse = (E.brosse = { x: SC.brosse.x, y: SC.brosse.y, a: SC.brosse.a * DEG, lev: 0, tenue: false });
    const pinceau = (E.pinceau = { x: SC.pinceau.x, y: SC.pinceau.y, a: SC.pinceau.a * DEG, lev: 0, tenue: false, colle: 0, goutte: 0, incl: 1 });
    const marteau = (E.marteau = { x: SC.marteau.x, y: SC.marteau.y, a: SC.marteau.a * DEG, lev: 0, frappe: 0, tenue: false });
    const tampon = (E.tampon = { x: SC.tampon.x, y: SC.tampon.y, a: SC.tampon.a * DEG, lev: 0, tenue: false });

    // la colle : le trait déposé le long du bord ; le jour qui se referme sous les coups
    E.colle = sstep(18.8, 19.8, t) * 1; // la part du bord encollée
    if (t >= 18.8 && t < 19.8) E.colle = pr(t, 18.8, 19.8);
    E.coups = COUPS.map((c) => (t >= c.t ? 1 : 0)); // les coups déjà portés

    // ---------------- la mousse et le nettoyage ----------------
    E.brossage = t >= BROSSE_T[0] ? Math.min(t, BROSSE_T[1] + 1.2) : 0;
    E.propre = sstep(16.45, 17.05, t); // à la fin, ce que la brosse n'a pas touché (le col, la semelle) se nettoie aussi

    // ---------------- les mains ----------------
    const D = (E.droite = { x: SC.horsD[0], y: SC.horsD[1], pose: 'repos', pose2: null, mix: 0, lev: 0, plie: 0, vis: true });
    const G = (E.gauche = { x: SC.horsG[0], y: SC.horsG[1], pose: 'repos', pose2: null, mix: 0, lev: 0, plie: 0, vis: true });
    const setP = (H, p) => { H.pose = p.pose; H.pose2 = p.pose2; H.mix = p.mix; };

    // === la main droite ===
    const coll = B(-136, 0); // le col, derrière : c'est par là qu'on porte la basket
    if (t < 2.45) { // elle porte la basket
      D.x = coll[0]; D.y = coll[1]; D.lev = sh.lev + 10;
      setP(D, poses(t, [[0, 'tient']]));
    } else if (t < 9.1) {
      const p = kf(t, [[2.45, [coll[0], coll[1], 10]], [2.75, [coll[0] + 6, coll[1] + 10, 16], 'out'], [3.6, [SC.reposD[0], SC.reposD[1], 0], 'io']]);
      D.x = p[0]; D.y = p[1]; D.lev = p[2];
      setP(D, poses(t, [[0, 'tient'], [2.58, 'repos']]));
    } else if (t < 12.6) { // le vieux lacet : le nœud, puis on tire
      const b0 = [Bn[0] + 7, Bn[1] - 2];
      const p = kf(t, [
        [9.1, [SC.reposD[0], SC.reposD[1], 0]],
        [9.8, [b0[0], b0[1], 6], 'io'],
        [10.3, [b0[0] + 26, b0[1] - 18, 12], 'io'],
        [11.0, [b0[0] + 88, b0[1] - 62, 30], 'io'],
        [11.35, [b0[0] + 42, b0[1] - 46, 18], 'io'],
        [12.05, [b0[0] + 128, b0[1] - 118, 34], 'io'],
        [12.45, [SC.vieuxLacet[0] + 30, SC.vieuxLacet[1] - 8, 8], 'io'],
        [12.6, [SC.vieuxLacet[0] + 34, SC.vieuxLacet[1] - 4, 4]],
      ]);
      D.x = p[0]; D.y = p[1]; D.lev = p[2];
      setP(D, poses(t, [[0, 'repos'], [9.6, 'pince'], [12.55, 'repos']], 0.22));
      vieux.tire = [D.x, D.y, D.lev]; // (le bout du lacet suit les doigts ; recalé sur la pince plus bas)
    } else if (t < 17.2) { // la brosse
      if (t < 13.3) {
        const p = kf(t, [[12.6, [SC.vieuxLacet[0] + 34, SC.vieuxLacet[1] - 4, 4]], [13.3, [SC.brosse.x, SC.brosse.y, 0], 'io']]);
        D.x = p[0]; D.y = p[1]; D.lev = p[2];
      } else if (t < 16.5) {
        brosse.tenue = true;
        let p;
        if (t < BROSSE_T[0]) {
          const toe = B(128, 4);
          p = kf(t, [
            [13.3, [SC.brosse.x, SC.brosse.y, 0]],
            [13.55, [SC.brosse.x + 8, SC.brosse.y + 6, 22], 'out'],
            [13.9, [SC.bol.x - 6, SC.bol.y + 4, 16], 'io'],
            [14.05, [SC.bol.x - 4, SC.bol.y + 6, 3], 'in2'],
            [14.25, [SC.bol.x - 8, SC.bol.y + 10, 18], 'out'],
            [14.6, [toe[0], toe[1], 4], 'io'],
          ]);
          if (win(t, 13.9, 14.2)) p[0] += Math.sin(pr(t, 13.9, 14.2) * TAU * 2) * 4; // on remue un peu dans l'eau
        } else {
          const q = brossePos(t), w = B(q[0], q[1]);
          p = [w[0], w[1], 3 + 1.5 * Math.sin((t - BROSSE_T[0]) * TAU * 4.2)];
        }
        D.x = p[0]; D.y = p[1]; D.lev = p[2];
        brosse.x = p[0]; brosse.y = p[1]; brosse.lev = p[2];
      } else {
        const b1 = brossePos(16.5), w1 = B(b1[0], b1[1]);
        const p = kf(t, [[16.5, [w1[0], w1[1], 3]], [16.7, [w1[0] + 8, w1[1] - 6, 18], 'out'], [17.05, [SC.brosse.x, SC.brosse.y, 0], 'io']]);
        D.x = p[0]; D.y = p[1]; D.lev = p[2];
        brosse.tenue = t < 17.05;
        brosse.x = p[0]; brosse.y = p[1]; brosse.lev = p[2];
        if (t >= 17.05) { brosse.x = SC.brosse.x; brosse.y = SC.brosse.y; brosse.lev = 0; }
      }
      setP(D, poses(t, [[0, 'repos'], [13.2, 'brosse'], [17.1, 'repos']], 0.26));
    } else if (t < 20.4) { // le pinceau
      const aR = SC.pinceau.a * DEG, gp = [SC.pinceau.x + Math.cos(aR) * 77 * 0.9, SC.pinceau.y + Math.sin(aR) * 77 * 0.9]; // ses soies, dans le pot
      const d0 = surBord(0), w0 = B(d0[0] + d0[2] * 2, d0[1] + d0[3] * 2);
      let p;
      if (t < 18.8) {
        // on le prend, on le trempe une fois dans la colle, on le sort (un fil de colle), on va au bout de la basket
        p = kf(t, [[17.2, [SC.reposD[0], SC.reposD[1], 0]], [17.9, [gp[0], gp[1], 2], 'io'], [18.08, [gp[0] + 1, gp[1] - 2, -4], 'io'], [18.4, [gp[0] - 10, gp[1] + 10, 34], 'out'], [18.85, [w0[0], w0[1], 3], 'io']]);
      } else if (t < 19.8) {
        const d = surBord(pr(t, 18.8, 19.8)), w = B(d[0] + d[2] * 1.2, d[1] + d[3] * 1.2);
        p = [w[0], w[1], 3];
      } else {
        const d1 = surBord(1), w1 = B(d1[0] + d1[2] * 2, d1[1] + d1[3] * 2);
        p = kf(t, [[19.8, [w1[0], w1[1], 3]], [20.05, [w1[0] + 12, w1[1] - 8, 24], 'out'], [20.3, [gp[0], gp[1], 2], 'io'], [20.4, [gp[0], gp[1], 0]]]);
      }
      pinceau.tenue = win(t, 17.9, 20.32);
      pinceau.pointe = [p[0], p[1]]; // la pointe des soies (quand il est tenu)
      pinceau.lev = Math.max(0, p[2]);
      pinceau.tourne = sstep(18.05, 18.45, t) * (1 - sstep(19.95, 20.3, t)); // de sa pose dans le pot à la prise en crayon
      pinceau.goutte = t > 18.08 && t < 18.6 ? 1 - sstep(18.4, 18.6, t) : 0;
      pinceau.colle = 1;
      D.pointe = [p[0], p[1]];
      D.x = p[0]; D.y = p[1] + 40; // (première idée ; la main est recalée sur le manche au dessin)
      D.lev = p[2] * 0.8 + 4;
      setP(D, poses(t, [[0, 'repos'], [17.8, 'stylo'], [20.35, 'repos']], 0.24));
    } else if (t < 23.8) { // le marteau
      const gM = rot(5, 0, SC.marteau.a * DEG); // la prise, sur le manche du marteau posé (près de la tête)
      const prise0 = [SC.marteau.x + gM[0], SC.marteau.y + gM[1]];
      if (t < 21.3 || t >= 23.35) {
        const p = kf(t, [
          [20.4, [SC.pinceau.x, SC.pinceau.y, 0]],
          [21.0, [prise0[0], prise0[1], 0], 'io'],
          [21.3, [prise0[0] - 10, prise0[1] - 14, 26], 'out'],
          [23.35, [prise0[0] - 10, prise0[1] - 14, 26]],
          [23.6, [prise0[0], prise0[1], 0], 'io'],
          [23.8, [prise0[0] + 4, prise0[1] + 14, 6], 'out'],
        ]);
        D.x = p[0]; D.y = p[1]; D.lev = p[2];
        marteau.tenue = win(t, 21.0, 23.6);
        marteau.frappe = sstep(21.05, 21.3, t) * (1 - sstep(23.35, 23.55, t));
        marteau.tourne = sstep(21.0, 21.3, t) * (1 - sstep(23.35, 23.6, t));
        if (marteau.tenue) { marteau.prise = [D.x, D.y]; marteau.lev = D.lev; }
      } else {
        // la tête vise le bord : avance entre deux coups, se lève, tombe (le son à l'impact)
        marteau.tenue = true;
        marteau.frappe = 1;
        let u = COUPS[0].u, lev = 26;
        if (t < COUPS[0].t - 0.2) { u = COUPS[0].u; lev = lerp(26, 30, pr(t, 21.3, COUPS[0].t - 0.2)); }
        else {
          let k = COUPS.length - 1;
          for (let i = 0; i < COUPS.length; i++) if (t < COUPS[i].t + 0.07) { k = i; break; }
          const c = COUPS[k], prev = COUPS[Math.max(0, k - 1)];
          const d = t - c.t; // < 0 : avant l'impact
          if (d < -0.2) { u = lerp(prev.u, c.u, EASE.io(pr(t, prev.t + 0.07, c.t - 0.2))); lev = 30; }
          else if (d < -0.07) { u = c.u; lev = lerp(30, 34, EASE.out(pr(d, -0.2, -0.07))); } // l'élan
          else if (d < 0) { u = c.u; lev = lerp(34, 0, EASE.in(pr(d, -0.07, 0))); } // le coup
          else { u = c.u; lev = lerp(0, 8, EASE.out(pr(d, 0, 0.07))); } // le rebond
          if (t > COUPS[COUPS.length - 1].t + 0.07) lev = lerp(8, 26, pr(t, COUPS[COUPS.length - 1].t + 0.07, 23.35));
        }
        const d = surBord(u), w = B(d[0] + d[2] * 1.5, d[1] + d[3] * 1.5);
        marteau.tete = [w[0], w[1]];
        marteau.lev = lev;
        D.tete = [w[0], w[1]];
        D.x = w[0] + 150; D.y = w[1] + 110; // (première idée ; recalée au dessin)
        D.lev = lev * 0.6 + 6;
      }
      setP(D, poses(t, [[0, 'repos'], [20.9, 'poing'], [23.62, 'repos']], 0.24));
    } else if (t < 28.9) { // les lacets neufs (avec la main gauche) : la main droite prend l'autre bout
      const oe = Mb.oeillets;
      if (t < 24.6) {
        const p = kf(t, [[23.8, [SC.marteau.x - 8, SC.marteau.y + 2, 6]], [24.6, [SC.reposD[0] - 10, SC.reposD[1] - 30, 0], 'io']]);
        D.x = p[0]; D.y = p[1]; D.lev = p[2];
      } else {
        const k = Math.min(6, Math.floor(neuf.croix + 0.0001));
        const cible = (kk) => { const e = oe[Math.min(6, kk)][1]; return B(e[0] + 8, e[1] + 44); }; // côté +y de la basket : à droite de l'écran, à côté d'elle
        const aNoeud = sstep(27.9, 28.3, t) * (1 - sstep(28.45, 28.9, t));
        let base;
        if (t < 25.3) base = kf(t, [[24.6, [SC.reposD[0] - 10, SC.reposD[1] - 30]], [25.3, cible(0), 'io']]);
        else {
          const c0 = cible(k), c1 = cible(k + 1), f = neuf.croix - k;
          base = [lerp(c0[0], c1[0], EASE.io(f)), lerp(c0[1], c1[1], EASE.io(f))];
        }
        const nd = B(NOEUD[0] - 2, NOEUD[1] + 10);
        D.x = lerp(base[0], nd[0], aNoeud);
        D.y = lerp(base[1], nd[1], aNoeud);
        D.lev = 10 + 4 * Math.sin(t * 6);
        if (t > 28.45) { const p = kf(t, [[28.45, [nd[0], nd[1]]], [28.9, SC.reposD, 'io']]); D.x = p[0]; D.y = p[1]; D.lev = lerp(10, 0, pr(t, 28.45, 28.9)); }
      }
      setP(D, poses(t, [[0, 'repos'], [25.0, 'pince'], [28.5, 'repos']], 0.24));
    } else { // rendre : la main droite recentre la basket, puis s'en va
      const cote = B(-10, 58); // le flanc de la basket : le bout des doigts s'y pose, la paume à côté
      const p = kf(t, [
        [28.9, [SC.reposD[0], SC.reposD[1], 0]],
        [29.3, [cote[0] + 42, cote[1] + 70, 2], 'io'],
        [29.85, [cote[0] + 38, cote[1] + 70, 1]],
        [30.3, [SC.reposD[0] + 6, SC.reposD[1] + 4, 0], 'io'],
        [31.6, [SC.reposD[0] + 6, SC.reposD[1] + 4, 0]],
        [32.5, SC.horsD.concat(0), 'io'],
      ]);
      D.x = p[0]; D.y = p[1]; D.lev = p[2];
      setP(D, poses(t, [[0, 'repos']]));
    }

    // === la main gauche ===
    const talon = B(-114, -26); // le flanc du talon : c'est là qu'elle tient la basket
    if (t < 4.7) {
      const p = kf(t, [[2.6, SC.horsG], [3.5, SC.reposG, 'io']]);
      G.x = p[0]; G.y = p[1];
      setP(G, poses(t, [[0, 'repos']]));
    } else if (t < 8.9) { // le ticket
      const tp = rot(pinceTicket[0], pinceTicket[1], tk.a);
      const surTk = [tk.x + tp[0], tk.y + tp[1]];
      if (t < 5.45) {
        const p = kf(t, [[4.7, SC.reposG], [5.4, surTk, 'io']]);
        G.x = p[0]; G.y = p[1];
      } else if (t < 8.05) { G.x = surTk[0]; G.y = surTk[1]; G.lev = tk.lev + 3; }
      else {
        const p = kf(t, [[8.05, surTk], [8.25, [surTk[0] - 6, surTk[1] + 10], 'out'], [8.8, SC.reposG, 'io']]);
        G.x = p[0]; G.y = p[1]; G.lev = 6 * (1 - pr(t, 8.25, 8.8));
      }
      setP(G, poses(t, [[0, 'repos'], [5.3, 'pince'], [8.1, 'repos']], 0.24));
    } else if (t < 23.8) { // elle tient la basket par le talon
      const p = kf(t, [[8.9, SC.reposG], [9.6, talon, 'io'], [23.5, talon], [23.8, [talon[0] - 20, talon[1] - 30], 'io']]);
      G.x = p[0]; G.y = p[1]; G.lev = t < 23.5 ? 4 : 10;
      setP(G, poses(t, [[0, 'repos'], [9.45, 'tient'], [23.55, 'repos']], 0.28));
    } else if (t < 28.9) { // les lacets neufs : sortis du rouleau, posés, lacés
      const oe = Mb.oeillets;
      const cible = (kk) => { const e = oe[Math.min(6, kk)][0]; return B(e[0] + 8, e[1] - 44); }; // côté −y : à gauche de l'écran, à côté d'elle
      const bout = [SC.lacetsNeufs.x - 50, SC.lacetsNeufs.y - 14];
      if (t < 25.3) {
        const p = kf(t, [[23.8, [talon[0] - 20, talon[1] - 30, 10]], [24.3, [bout[0], bout[1], 0], 'io'], [24.6, [bout[0] + 20, bout[1] + 10, 26], 'out'], [25.3, cible(0).concat(10), 'io']]);
        G.x = p[0]; G.y = p[1]; G.lev = p[2];
      } else {
        const k = Math.min(6, Math.floor(neuf.croix + 0.0001)), f = neuf.croix - k;
        const c0 = cible(k), c1 = cible(k + 1);
        G.x = lerp(c0[0], c1[0], EASE.io(f)); G.y = lerp(c0[1], c1[1], EASE.io(f)); G.lev = 10 + 4 * Math.sin(t * 6 + 1.5);
        const aNoeud = sstep(27.9, 28.3, t) * (1 - sstep(28.45, 28.9, t));
        const nd = B(NOEUD[0] - 2, NOEUD[1] - 10);
        G.x = lerp(G.x, nd[0], aNoeud); G.y = lerp(G.y, nd[1], aNoeud);
        if (t > 28.45) { const p = kf(t, [[28.45, [nd[0], nd[1]]], [28.9, SC.reposG, 'io']]); G.x = p[0]; G.y = p[1]; G.lev = lerp(10, 0, pr(t, 28.45, 28.9)); }
      }
      setP(G, poses(t, [[0, 'repos'], [24.2, 'pince'], [28.5, 'repos']], 0.24));
    } else { // rendre : le tampon « PRÊTE » sur le ticket
      const surTk = rot(0, 18, tk.a), cible = [tk.x + surTk[0], tk.y + surTk[1]];
      const p = kf(t, [
        [28.9, SC.reposG.concat(0)],
        [29.9, [SC.tampon.x, SC.tampon.y, 0], 'io'],
        [30.15, [SC.tampon.x + 6, SC.tampon.y + 10, 26], 'out'],
        [30.75, [cible[0], cible[1], 24], 'io'],
        [31.0, [cible[0], cible[1], 0], 'in2'],
        [31.18, [cible[0], cible[1], 0]],
        [31.45, [cible[0] - 4, cible[1] - 8, 22], 'out'],
        [31.95, [SC.tampon.x, SC.tampon.y, 12], 'io'],
        [32.1, [SC.tampon.x, SC.tampon.y, 0], 'in2'],
        [32.9, SC.horsG.concat(0), 'io'],
      ]);
      G.x = p[0]; G.y = p[1]; G.lev = p[2];
      tampon.tenue = win(t, 29.9, 32.1);
      if (tampon.tenue) { tampon.x = p[0]; tampon.y = p[1]; tampon.lev = p[2]; }
      setP(G, poses(t, [[0, 'repos'], [29.8, 'poing'], [32.15, 'repos']], 0.24));
    }
    if (t >= FIN) { D.vis = false; G.vis = false; }
    if (t < 0.45) D.vis = false;
    if (t < 2.55) G.vis = false;
    return E;
  }

  /* ======================================================================
     6. Les éléments dessinés à la main, à chaque image
     ====================================================================== */
  const OMB = R.OMBRE; // décalage de l'ombre : mm par mm de hauteur
  const MANCHE = -2.62; // le manche dans le poing (repère de la main droite) : de la prise vers la tête, côté pouce, un peu en avant

  /* un lacet (tube plat) : un polygone [[x, y]] dans le repère courant (mm) ; couleur de base ; hauteur (pour l'ombre) */
  function tracerLacet(g, pts, coul, o = {}) {
    if (pts.length < 2) return;
    const w = o.larg || 6.4;
    const chemin = () => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 2) g.lineTo(pts[1][0], pts[1][1]);
      else {
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
          g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const L = pts[pts.length - 1];
        g.lineTo(L[0], L[1]);
      }
    };
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.ombre) {
      g.save();
      g.translate(o.ombre[0], o.ombre[1]);
      chemin();
      g.strokeStyle = 'rgba(8, 10, 14, ' + (o.ombreA || 0.26) + ')';
      g.lineWidth = w + 2.2;
      g.stroke();
      g.restore();
    }
    chemin();
    g.strokeStyle = coul.bord;
    g.lineWidth = w + 1;
    g.stroke();
    g.strokeStyle = coul.fond;
    g.lineWidth = w;
    g.stroke();
    if (o.lumiere) {
      g.save();
      g.translate(o.lumiere[0], o.lumiere[1]);
      chemin();
      g.strokeStyle = coul.reflet;
      g.lineWidth = w * 0.32;
      g.stroke();
      g.restore();
    }
  }
  const COUL_NEUF = { fond: 'rgb(236, 230, 214)', bord: 'rgb(150, 140, 122)', reflet: 'rgba(255, 252, 240, 0.7)' };
  const COUL_VIEUX = { fond: 'rgb(154, 142, 120)', bord: 'rgb(88, 78, 64)', reflet: 'rgba(206, 194, 170, 0.45)' };

  /* les brins d'un laçage croisé (repère de la basket) : la barre du bas, puis les croisillons ; n : combien (fractionnaire) */
  function brinsLacage(Mb, barre, n) {
    const oe = Mb.oeillets, out = [];
    const pose = (a, b) => [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
    if (barre > 0) {
      const a = oe[0][0], b = oe[0][1];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // la barre se pose depuis son milieu
      out.push({ pts: pose([lerp(m[0], a[0], barre), lerp(m[1], a[1], barre)], [lerp(m[0], b[0], barre), lerp(m[1], b[1], barre)]), dessus: 0 });
    }
    for (let k = 0; k < 6; k++) {
      const f = clamp01(n - k);
      if (f <= 0) break;
      const a0 = oe[k][0], a1 = oe[k][1], b0 = oe[k + 1][0], b1 = oe[k + 1][1];
      // deux diagonales : l'une passe sur l'autre (on alterne) ; elles se tracent de l'œillet d'en bas vers celui d'en haut
      const d1 = [a0, [lerp(a0[0], b1[0], f), lerp(a0[1], b1[1], f)]];
      const d2 = [a1, [lerp(a1[0], b0[0], f), lerp(a1[1], b0[1], f)]];
      out.push({ pts: pose(d1[0], d1[1]), dessus: k % 2 ? 1 : 0 });
      out.push({ pts: pose(d2[0], d2[1]), dessus: k % 2 ? 0 : 1 });
    }
    // les dessous d'abord
    out.sort((a, b) => a.dessus - b.dessus);
    return out;
  }
  /* le nœud (deux boucles, deux bouts) au pied du col ; f : 0..1 (il se forme) ; relâché : r (les boucles s'ouvrent) */
  function brinsNoeud(Mb, f, lache = 0) {
    const oe = Mb.oeillets[6], x0 = oe[0][0] - 4, out = [];
    if (f <= 0) return out;
    const k = f, r = 1 + lache * 0.6;
    const bl = (s) => { // une boucle
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 1.7 - 0.2;
        pts.push([x0 - 2 - Math.sin(a) * 15 * k * r, s * (4 + (1 - Math.cos(a)) * 9 * k * r)]);
      }
      return pts;
    };
    out.push(bl(-1), bl(1));
    // les bouts qui pendent vers le talon
    out.push([[x0 - 1, -3], [x0 - 14 * k, -7 - 6 * lache], [x0 - 26 * k, -9 - 14 * lache]]);
    out.push([[x0 - 1, 3], [x0 - 12 * k, 8 + 5 * lache], [x0 - 24 * k, 12 + 12 * lache]]);
    return out;
  }

  /* la mousse : des amas de petites bulles (précalculés), qui apparaissent sous la brosse puis s'affaissent */
  function bullesSprite(ppm, graine) {
    const rr = R.rng(graine), S = 26, c = R.canvas(S * ppm, S * ppm), g = c.getContext('2d');
    g.scale(ppm, ppm);
    for (let i = 0; i < 70; i++) {
      const a = rr() * TAU, d = Math.pow(rr(), 0.6) * 10.5;
      const x = S / 2 + Math.cos(a) * d * 1.1, y = S / 2 + Math.sin(a) * d * 0.85, r = rr.range(0.5, 2.1) * (1 - d / 16);
      const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.98)');
      gr.addColorStop(0.6, 'rgba(236,238,240,0.9)');
      gr.addColorStop(0.92, 'rgba(170,178,186,0.85)');
      gr.addColorStop(1, 'rgba(120,128,136,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    return { canvas: c, S };
  }
  /* les amas de mousse, tirés le long du trajet de la brosse (déterministes) */
  let AMAS = null;
  function amas() {
    if (AMAS) return AMAS;
    const rr = R.rng(4242), out = [];
    for (let t = BROSSE_T[0]; t < BROSSE_T[1]; t += 0.045) {
      const p = brossePos(t);
      out.push({ t, x: p[0] + rr.range(-30, 30), y: p[1] + rr.range(-24, 24), v: rr.int(0, 4), a: rr() * TAU, s: rr.range(0.85, 1.5), vie: rr.range(1.3, 2.2) });
    }
    AMAS = out;
    return out;
  }

  /* ======================================================================
     7. Poser un sprite (tourné, soulevé) ; les ombres des mains et de ce qu'elles tiennent, unies
     ====================================================================== */
  function poserSprite(g, V, sp, X, Y, rot0, o = {}) {
    if (!sp) return;
    const k = V.k, lev = o.lev || 0, s = k / sp.ppm;
    const d = (o.rot != null ? o.rot : rot0) - (sp.angle || 0);
    g.save();
    if (o.alpha != null) g.globalAlpha = o.alpha;
    g.translate((X - V.x0) * k, (Y - V.y0) * k);
    if (d) g.rotate(d);
    const gr = (1 + lev * 0.0012) * (o.echelle || 1);
    if (gr !== 1 || o.ex) g.scale(gr * (o.ex || 1), gr);
    if (o.coupe != null) { // seulement la partie de l'objet en deçà de x = coupe (repère de l'objet, tourné comme le sprite)
      const ca = Math.cos(sp.angle || 0), sa = Math.sin(sp.angle || 0), L = 400;
      g.beginPath();
      const pt = (x, y) => [(x * ca - y * sa) * k, (x * sa + y * ca) * k];
      const c = [pt(-L, -L), pt(o.coupe, -L), pt(o.coupe, L), pt(-L, L)];
      g.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) g.lineTo(c[i][0], c[i][1]); g.closePath();
      g.clip();
    }
    g.drawImage(sp.canvas, -sp.ax * k, -sp.ay * k, sp.canvas.width * s, sp.canvas.height * s);
    g.restore();
  }
  /** l'ombre (normale, sur l'établi) d'un sprite posé */
  function poserOmbre(g, V, sp, X, Y, rotW, o = {}) {
    if (!sp || !sp.ombre) return;
    const k = V.k, lev = o.lev || 0;
    let om = sp.ombre, dx = 0, dy = 0;
    if (lev > 0.5) { om = ombreSoulevee(sp, lev) || sp.ombre; dx = OMB[0] * lev; dy = OMB[1] * lev; }
    const d = rotW - (sp.angle || 0);
    g.save();
    if (o.alpha != null) g.globalAlpha = o.alpha;
    g.translate((X + dx - V.x0) * k, (Y + dy - V.y0) * k);
    if (d) g.rotate(d);
    if (o.ex) g.scale(o.ex, 1);
    g.drawImage(om.canvas, (om.x - sp.ax) * k, (om.y - sp.ay) * k, om.w * k, om.h * k);
    g.restore();
  }
  /* l'ombre « en blanc » (opaque : blanc = pas d'ombre) : on les unit par « darken » sans les additionner.
     (Par composition, sans relire les pixels : une relecture de canvas coûte cher sur le processeur graphique.) */
  function ombreBlanche(om) {
    if (om._blanc) return om._blanc;
    const c = R.canvas(om.canvas.width, om.canvas.height), g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(om.canvas, 0, 0);
    om._blanc = c;
    return c;
  }
  /* l'ombre d'un objet soulevé de lev mm : plus floue (la pénombre grandit) et plus claire (comme dans co-rendu.js),
     mais floutée en réduisant puis en agrandissant l'image (aucune relecture de pixels) ; par pas de 5 mm */
  function ombreSoulevee(sp, lev) {
    const o0 = sp.ombre;
    if (!o0) return null;
    const q = Math.round(lev / 5) * 5;
    if (q <= 0) return o0;
    sp._sl = sp._sl || new Map();
    let o = sp._sl.get(q);
    if (o) return o;
    const sg = (0.45 + 0.26 * q) * ((sp.ombreOpts && sp.ombreOpts.doux) || 1) * 0.8 * o0.pk; // σ (px de l'ombre)
    const pad = Math.ceil(sg * 2.5);
    const w = o0.canvas.width, h = o0.canvas.height, W = w + 2 * pad, H = h + 2 * pad;
    const f = Math.max(1, sg / 1.3);
    const a = R.canvas(Math.max(2, Math.round(W / f)), Math.max(2, Math.round(H / f))), ga = a.getContext('2d');
    ga.imageSmoothingEnabled = true;
    ga.imageSmoothingQuality = 'high';
    ga.drawImage(o0.canvas, pad / f, pad / f, w / f, h / f);
    const c = R.canvas(W, H), gc = c.getContext('2d');
    gc.imageSmoothingEnabled = true;
    gc.imageSmoothingQuality = 'high';
    gc.globalAlpha = 1 / (1 + q * 0.018);
    gc.drawImage(a, 0, 0, W, H);
    o = { canvas: c, x: o0.x - pad / o0.pk, y: o0.y - pad / o0.pk, k: o0.k, pk: o0.pk, w: W / o0.pk, h: H / o0.pk };
    sp._sl.set(q, o);
    return o;
  }
  function ombreUnie(gb, V, sb, sp, X, Y, rotW, o = {}) {
    if (!sp || !sp.ombre) return;
    const k = V.k * sb, lev = o.lev || 0;
    let om = sp.ombre, dx = 0, dy = 0;
    if (lev > 0.5) { om = ombreSoulevee(sp, lev) || sp.ombre; dx = OMB[0] * lev; dy = OMB[1] * lev; }
    const c = ombreBlanche(om);
    const d = rotW - (sp.angle || 0);
    gb.save();
    gb.translate((X + dx - V.x0) * k, (Y + dy - V.y0) * k);
    if (d) gb.rotate(d);
    if (o.ex) gb.scale(o.ex, 1);
    if (o.alpha != null && o.alpha < 1) gb.globalAlpha = o.alpha;
    gb.drawImage(c, (om.x - sp.ax) * k, (om.y - sp.ay) * k, om.w * k, om.h * k);
    gb.restore();
  }

  /* ======================================================================
     8. Le film
     ====================================================================== */
  function Film(host, opts) {
    this.host = host;
    // mouvement réduit (réglage du téléphone) : l'image finale, immobile ; on ne joue que si on le demande
    const reduit = CO.reduced && (!opts || opts.auto == null);
    this.o = Object.assign({ boucle: true, auto: !reduit, vitesse: 1, t: reduit ? FIN + 0.4 : 0 }, opts || {});
    this.t = Math.max(0, Math.min(DUREE - 0.001, this.o.t || 0));
    this.voulu = this.o.auto !== false;
    this.ecoute = { etape: [] };
    this.sp = {};
    this.visible = true;
    this.dedans = true;
    this.pret = false;
    this.raf = 0;
    this.derEtape = null;
    this.stats = { images: 0, ms: 0, max: 0 };
    const cv = (this.cv = document.createElement('canvas'));
    cv.className = 'co-process';
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', "Les mains de Clément restaurent une basket sur l'établi : on la nettoie, on recolle la semelle, des lacets neufs, le ticket tamponné « prête ».");
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.insertBefore(cv, host.firstChild);
    this.g = cv.getContext('2d');
    this._observer();
  }

  Film.prototype = {
    /* ---------- la mise en page ---------- */
    mesurerVue() {
      const r = this.host.getBoundingClientRect();
      const larg = Math.max(60, r.width || this.host.clientWidth || 390), haut = Math.max(60, r.height || this.host.clientHeight || 450);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const css = Math.min(larg / SC.cadre, haut / SC.cadre); // px CSS par mm
      const k = css * dpr;
      const W = Math.round(larg * dpr), H = Math.round(haut * dpr);
      const ppm = Math.round(k * 20) / 20;
      return { larg, haut, dpr, k, ppm, W, H, x0: -W / 2 / k, y0: -H / 2 / k };
    },
    appliquerVue(V) {
      this.V = V;
      this.cv.width = V.W;
      this.cv.height = V.H;
      // le tampon des ombres des mains (moitié de la définition : elles sont floues)
      const sb = (this.sb = 0.5);
      this.cb = R.canvas(Math.ceil(V.W * sb), Math.ceil(V.H * sb));
      this.gb = this.cb.getContext('2d');
      this.photo = null;
    },

    /* ---------- les calculs : dans l'ordre où le film en a besoin ---------- */
    async preparer() {
      const V = this.V, ppm = V.ppm;
      const t0 = now();
      this.tPrep = { debut: t0 };
      const s = (id, o, prio) => sprite(id, Object.assign({ ppm, graine: SC.graine }, o), prio).then((x) => { this.sp[o.cle || id] = x; return x; });
      // les mains
      this.D = new M.Main(1, { ppm, angle0: -0.36, epaule: SC.epauleD });
      this.G = new M.Main(-1, { ppm, angle0: 0.34, epaule: SC.epauleG });
      // 1. de quoi montrer l'établi tout de suite : le fond en demi-définition (le plein viendra plus tard)
      const debut = [this.fond(3, true), s('ticket', { angle: 0, ticket: TICKET }, 2.95)]; // (le ticket écrit son texte : un calcul d'un bloc, fait avant que le film parte)
      // 2. le reste, dans l'ordre d'apparition (le film n'avance que quand ce dont il a besoin est là)
      const suite = [
        () => M.calcul.lancer(modeleBasket(), 3, 'modèle basket').then((Mb) => { this.Mb = Mb; bordDe(Mb); }),
        () => s('basket-sale', { angle: -90 }, 3),
        () => this.D.charger(['tient'], 2.9),
        // les ombres de la basket portée et de la main qui la porte (dès la première seconde)
        () => M.calcul.lancer(this.chauffer([[this.sp['basket-sale'], 70], [this.D.sp.poses.tient, 80], [this.D.sp.bras, 50], [this.D.sp.manche, 50]]), 3, 'ombres du début').then(() => { this.chaud = true; }),
        () => this.D.charger(['repos'], 2.7),
        () => this.G.charger(['repos'], 2.6),
        () => this.G.charger(['pince'], 2.5),
        () => this.fond(2, false),
        () => this.D.charger(['pince'], 2),
        () => s('brosse', { angle: SC.brosse.a }, 2),
        () => this.D.charger(['brosse'], 2),
        () => this.G.charger(['tient'], 2),
        () => s('basket-propre', { angle: -90 }, 2),
        () => s('pinceau', { angle: 0 }, 1.8),
        () => this.D.charger(['stylo', 'poing'], 1.8),
        () => s('marteau', { angle: SC.marteau.a }, 1.6),
        () => s('marteau-frappe', { angle: 0 }, 1.6),
        () => s('lacets-neufs', { angle: SC.lacetsNeufs.a }, 1.4),
        () => this.G.charger(['poing'], 1.4),
        () => s('tampon', { angle: 0 }, 1.4),
      ];
      const tout = Promise.all(debut).then(() => {
        this.tPrep.debut = now() - t0;
        // (la suite, une par une : le premier plan reste fluide ; à l'arrêt, on redessine à chaque arrivée)
        const redessiner = () => { if (!this.raf && !this.detruit && this.visible) this.dessiner(this.t); };
        return suite.reduce((p, f) => p.then(f).then(redessiner), Promise.resolve());
      }).then(() => M.calcul.lancer(this.prechauffer(), 1, 'préchauffe')).then(() => {
        this.tPrep.tout = now() - t0;
        this.complet = true;
        this.aTeleverser = true; // (à la prochaine image : chaque image envoyée une fois à la carte graphique)
        if (!this.raf && !this.detruit) this.dessiner(this.t);
      });
      this.tout = tout;
      await Promise.all(debut);
      this.pret = true;
      M.calcul.reveil();
      return tout;
    },
    /* les ombres soulevées (par pas de 5 mm) et leurs versions « en blanc », calculées d'avance : pas d'à-coup au premier passage */
    *chauffer(liste) {
      for (const [s, max] of liste) {
        if (!s || !s.ombre) continue;
        ombreBlanche(s.ombre);
        yield;
        for (let q = 5; q <= max; q += 5) { const o = ombreSoulevee(s, q); if (o) ombreBlanche(o); yield; }
      }
    },
    *prechauffer() {
      const liste = [];
      for (const Hm of [this.D, this.G]) {
        const haut = Hm === this.D ? 80 : 45; // la main droite porte la basket (jusqu'à 80 mm)
        if (Hm.sp.bras) liste.push([Hm.sp.bras, haut * 0.6]);
        if (Hm.sp.manche) liste.push([Hm.sp.manche, haut * 0.6]);
        for (const k in Hm.sp.poses) liste.push([Hm.sp.poses[k], k === 'tient' ? haut : 45]);
      }
      for (const id of ['brosse', 'pinceau', 'marteau', 'marteau-frappe', 'tampon', 'ticket']) if (this.sp[id]) liste.push([this.sp[id], 40]);
      if (this.sp['basket-sale']) liste.push([this.sp['basket-sale'], 20]);
      for (const [s, max] of liste) {
        if (!s.ombre) continue;
        ombreBlanche(s.ombre);
        yield;
        for (let q = 5; q <= max; q += 5) { const o = ombreSoulevee(s, q); if (o) ombreBlanche(o); yield; }
      }
      // la basket portée (jusqu'à 70 mm), l'empreinte du tampon, les bulles, le calque du nettoyage
      if (this.sp['basket-sale']) for (let q = 5; q <= 70; q += 5) { ombreSoulevee(this.sp['basket-sale'], q); yield; }
      if (!this.empreinte) this.empreinte = empreintePrete(this.V.ppm);
      yield;
      if (!this.bulles) this.bulles = [0, 1, 2, 3, 4].map((i) => bullesSprite(this.V.ppm, 900 + i));
      yield;
      // (une première fois pour de vrai : les opérations de composition sont prêtes quand la brosse arrive)
      if (this.sp['basket-propre']) { this.nettoyer({ t: 15.5, brossage: 15.5, propre: 0 }); this.compo.tDer = -1; }
    },
    /* le fond : l'aggloméré, le tapis, le décor (la liasse, le pot, le bol, l'encreur, la tasse) */
    async fond(prio, bas) {
      const V = this.V;
      if (bas && this.fondPlein) return this.fondPlein;
      const cle = [VERSION, 'fond', V.W + 'x' + V.H, V.ppm.toFixed(2)].join('|');
      let c = R.cache.get(cle);
      if (!c && !/[?&]nocache\b/.test(location.search)) {
        const v = await R.coffre.get(cle);
        if (v) { const cv = await R.dePNG(v); if (cv) c = { canvas: cv, px: cv.width * cv.height }; }
      }
      if (c) bas = false; // (le plein est déjà là : pas besoin du brouillon)
      if (!c) {
        // bas : en demi-définition (quatre fois moins de calcul), agrandi ; le vrai viendra le remplacer
        const f = bas ? 0.5 : 1, w = Math.ceil(V.W * f), h = Math.ceil(V.H * f);
        const sp = await M.calcul.lancer(O.fond({
          cadre: { bx0: V.x0, by0: V.y0, w, h }, ppm: V.k * f, graine: SC.graine,
          tapis: { x: SC.tapis.x, y: SC.tapis.y, angle: SC.tapis.angle, W: SC.tapis.W, H: SC.tapis.H }, oeil: { x: 0, y: 0 },
        }), prio, bas ? 'fond (brouillon)' : 'fond');
        const cv = R.canvas(V.W, V.H), g = cv.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(sp.canvas, 0, 0, V.W, V.H);
        // le décor : calculé, posé (ombre puis objet), cuit
        const decor = [];
        for (const d of DECOR) {
          if (!NOS[d.id] && !O.defs[d.id]) continue;
          decor.push(sprite(d.id, { ppm: V.ppm, angle: d.a, graine: SC.graine }, prio).then((x) => ({ d, x })).catch(() => null));
        }
        const ds = (await Promise.all(decor)).filter(Boolean);
        for (const { d, x } of ds) poserOmbre(g, V, x, d.x, d.y, d.a * DEG);
        for (const { d, x } of ds) poserSprite(g, V, x, d.x, d.y, d.a * DEG);
        c = { canvas: cv, px: V.W * V.H };
        if (bas) { if (!this.fondPlein) this.fondCv = cv; return c; }
        R.versPNG(cv).then((b) => b && R.coffre.put(cle, b));
      }
      R.cache.set(cle, c);
      this.fondCv = c.canvas;
      this.fondPlein = c;
      return c;
    },
    /* la lumière de la photo (flaque de la vitrine, coins plus sombres) : une image, multipliée à chaque image */
    lumiere() {
      if (this.photo) return this.photo;
      const V = this.V, c = R.canvas(V.W, V.H), g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, V.W, V.H);
      R.photo(g, V.W, V.H, { foyer: [0.2, 0.06], force: 0.62, grain: 0 });
      this.photo = c;
      return c;
    },

    /* ---------- une image ---------- */
    dessiner(t) {
      const tA = now();
      const g = this.g, V = this.V;
      if (!V) return;
      if (!this.fondCv) {
        g.fillStyle = '#231b16';
        g.fillRect(0, 0, V.W, V.H);
        return;
      }
      if (this.aTeleverser) this.televerser(g);
      this.scene(g, t);
      // le fondu de la fin vers le début de la boucle
      if (t > FONDU) {
        g.save();
        g.globalAlpha = sstep(FONDU, DUREE, t);
        this.scene(g, 0);
        g.restore();
      }
      // la photo : la flaque de lumière, le vignetage, le grain
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.drawImage(this.lumiere(), 0, 0);
      g.restore();
      const dt = now() - tA;
      this.stats.images++;
      this.stats.ms += dt;
      if (dt > this.stats.max) this.stats.max = dt;
    },

    /* chaque sprite dessiné une fois, minuscule, sous le fond de l'image qui suit : il est déjà sur la carte
       graphique quand il entre en scène (pas d'à-coup au premier passage) */
    televerser(g) {
      this.aTeleverser = false;
      const liste = [];
      for (const k in this.sp) if (this.sp[k] && this.sp[k].canvas) liste.push(this.sp[k]);
      for (const Hm of [this.D, this.G]) { if (Hm.sp.bras) liste.push(Hm.sp.bras); if (Hm.sp.manche) liste.push(Hm.sp.manche); for (const p in Hm.sp.poses) liste.push(Hm.sp.poses[p]); }
      g.save();
      g.globalAlpha = 0.01;
      for (const s of liste) {
        g.drawImage(s.canvas, 0, 0, 2, 2);
        if (s.ombre && s.ombre.canvas) { g.drawImage(s.ombre.canvas, 0, 0, 2, 2); if (s.ombre._blanc) g.drawImage(s.ombre._blanc, 0, 0, 2, 2); }
        if (s._sl) for (const o of s._sl.values()) { g.drawImage(o.canvas, 0, 0, 2, 2); if (o._blanc) g.drawImage(o._blanc, 0, 0, 2, 2); }
      }
      if (this.compo) g.drawImage(this.compo.cv, 0, 0, 2, 2);
      if (this.empreinte) g.drawImage(this.empreinte.canvas, 0, 0, 2, 2);
      if (this.bulles) for (const b of this.bulles) g.drawImage(b.canvas, 0, 0, 2, 2);
      g.restore();
    },

    scene(g, t) {
      const V = this.V, sp = this.sp, Mb = this.Mb;
      if (!Mb) { g.drawImage(this.fondCv, 0, 0, V.W, V.H); return; }
      const E = etat(t, Mb);
      this.E = E;
      g.drawImage(this.fondCv, 0, 0, V.W, V.H);
      const sh = E.basket;
      // --- sur l'établi : le ticket (s'il est posé), le vieux lacet posé, les lacets neufs roulés, les outils posés
      const tk = E.ticket;
      if (tk.vis && sp.ticket && tk.lev < 0.5) this.dessinerTicket(g, tk, false);
      if (E.vieux.pose > 0) this.dessinerVieuxLacet(g, E, true);
      if (E.vieux.retire >= 0.999 && E.vieux.pose < 1 && E.vieux.tire) this.pendre(g, E); // sorti : il pend des doigts
      if (E.neuf.rouleau && sp['lacets-neufs']) { poserOmbre(g, V, sp['lacets-neufs'], SC.lacetsNeufs.x, SC.lacetsNeufs.y, SC.lacetsNeufs.a * DEG); poserSprite(g, V, sp['lacets-neufs'], SC.lacetsNeufs.x, SC.lacetsNeufs.y, SC.lacetsNeufs.a * DEG); }
      const posees = [];
      if (!E.brosse.tenue) posees.push(['brosse', E.brosse.x, E.brosse.y, E.brosse.a]);
      if (!E.pinceau.tenue) posees.push(['pinceau', E.pinceau.x, E.pinceau.y, E.pinceau.a]);
      if (!E.marteau.tenue) posees.push(['marteau', E.marteau.x, E.marteau.y, E.marteau.a]);
      if (!E.tampon.tenue) posees.push(['tampon', E.tampon.x, E.tampon.y, E.tampon.a]);
      for (const [id, x, y, a] of posees) if (sp[id]) poserOmbre(g, V, sp[id], x, y, a);
      for (const [id, x, y, a] of posees) if (sp[id]) poserSprite(g, V, sp[id], x, y, a, id === 'pinceau' ? { ex: 0.9 } : {});
      // --- la basket (sale, en train d'être nettoyée, propre), le bord décollé, la colle, les lacets, la mousse
      if (sh.vis && sp['basket-sale']) this.dessinerBasket(g, E);
      if (tk.vis && sp.ticket && tk.fil > 0 && tk.lev < 0.5) this.dessinerFil(g, tk); // l'élastique passe par-dessus la basket
      // --- ce que les mains tiennent, et les mains : leurs ombres d'abord (unies), puis elles
      this.dessinerMains(g, E);
    },

    dessinerTicket(g, tk, tenu) {
      const V = this.V, sp = this.sp.ticket;
      poserOmbre(g, V, sp, tk.x, tk.y, tk.a, { lev: tk.lev });
      poserSprite(g, V, sp, tk.x, tk.y, tk.a, { lev: tk.lev });
      if (tk.tampon > 0) { // l'empreinte rouge « PRÊTE », en travers
        if (!this.empreinte) this.empreinte = empreintePrete(V.ppm);
        const E = this.empreinte, k = V.k;
        g.save();
        g.translate((tk.x - V.x0) * k, (tk.y - V.y0) * k);
        g.rotate(tk.a - 0.14);
        g.translate(0, 16 * k);
        g.globalAlpha = tk.tampon;
        g.globalCompositeOperation = 'multiply';
        g.drawImage(E.canvas, (-E.w / 2) * k, (-E.h / 2) * k, E.w * k, E.h * k);
        g.restore();
      }
    },
    /* l'élastique du ticket : de son œillet au lacet (puis, le nœud défait, il retombe à côté) */
    dessinerFil(g, tk) {
      const V = this.V, k = V.k, E = this.E, sh = E.basket;
      const oe = rot(0, -58, tk.a), a = [tk.x + oe[0], tk.y + oe[1]];
      const n = B2W(sh, -62, 0), libre = [n[0] - 22, n[1] + 30];
      const b = [lerp(n[0], libre[0], tk.filLibre), lerp(n[1], libre[1], tk.filLibre)];
      const m = [(a[0] + b[0]) / 2 + 6, (a[1] + b[1]) / 2 + 4];
      g.save();
      g.lineCap = 'round';
      g.globalAlpha = tk.fil;
      const trace = (dx, dy) => { g.beginPath(); g.moveTo((a[0] + dx - V.x0) * k, (a[1] + dy - V.y0) * k); g.quadraticCurveTo((m[0] + dx - V.x0) * k, (m[1] + dy - V.y0) * k, (b[0] + dx - V.x0) * k, (b[1] + dy - V.y0) * k); };
      trace(OMB[0] * 3, OMB[1] * 3);
      g.strokeStyle = 'rgba(8,10,14,0.3)';
      g.lineWidth = 1.6 * k;
      g.stroke();
      trace(0, 0);
      g.strokeStyle = '#2b2622';
      g.lineWidth = 1.1 * k;
      g.stroke();
      if (tk.filLibre < 0.5) { // la boucle autour du lacet
        g.beginPath();
        g.ellipse((b[0] - V.x0) * k, (b[1] - V.y0) * k, 3.6 * k, 2.4 * k, 0.5, 0, TAU);
        g.lineWidth = 1 * k;
        g.stroke();
      }
      g.restore();
    },

    /* ---------- la basket ---------- */
    dessinerBasket(g, E) {
      const V = this.V, sp = this.sp, Mb = this.Mb, sh = E.basket, k = V.k;
      const sale = sp['basket-sale'], propre = sp['basket-propre'];
      poserOmbre(g, V, sale, sh.x, sh.y, sh.a, { lev: sh.lev });
      // le corps : sale, puis le propre révélé là où la brosse est passée (un masque, à la taille du sprite)
      let corps = sale;
      if (propre && E.brossage > 0) {
        this.nettoyer(E);
        corps = this.compo.sp;
      }
      poserSprite(g, V, corps, sh.x, sh.y, sh.a, { lev: sh.lev });
      // dans le repère de la basket (mm)
      const c = Math.cos(sh.a), s = Math.sin(sh.a), gr = 1 + sh.lev * 0.0012;
      g.save();
      g.setTransform(k * c * gr, k * s * gr, -k * s * gr, k * c * gr, (sh.x - V.x0) * k, (sh.y - V.y0) * k);
      // l'ombre des lacets tombe vers le bas à droite de l'écran : dans le repère de la basket
      const om = [OMB[0] * 2.4 * c + OMB[1] * 2.4 * s, -OMB[0] * 2.4 * s + OMB[1] * 2.4 * c];
      const lu = [-0.55 * c - 0.65 * s, 0.55 * s - 0.65 * c];
      this.dessinerBord(g, E);
      // la mousse (sous les lacets : ils sont retirés pendant le brossage)
      if (E.brossage > 0 && E.t < BROSSE_T[1] + 1.4) this.dessinerMousse(g, E);
      // le vieux lacet (tant qu'il est dans les œillets)
      if (E.vieux.vis && E.vieux.pose < 1 && E.t < 12.6) this.dessinerVieuxLacet(g, E, false, om, lu);
      // le neuf
      if (E.neuf.vis) this.dessinerLacetNeuf(g, E, om, lu);
      g.restore();
    },
    /* le masque du nettoyage : chaque passage de la brosse révèle la basket propre (avec un temps de retard,
       sous la mousse) ; à la fin, ce que la brosse n'a pas touché se nettoie aussi */
    nettoyer(E) {
      const sale = this.sp['basket-sale'], propre = this.sp['basket-propre'];
      if (!this.compo || this.compo.sale !== sale) {
        const w = sale.canvas.width, h = sale.canvas.height;
        const cv = R.canvas(w, h), m = R.canvas(w, h);
        this.compo = { sale, cv, g: cv.getContext('2d'), m, gm: m.getContext('2d'), sp: Object.assign({}, sale, { canvas: cv }), tDer: -1, disque: null };
        // un disque doux : la trace d'un passage de brosse
        const D = 64, dc = R.canvas(D, D), dg = dc.getContext('2d');
        const gr = dg.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        dg.fillStyle = gr; dg.fillRect(0, 0, D, D);
        this.compo.disque = dc;
      }
      const C = this.compo, t = E.t;
      const tq = Math.round(t * 30) / 30;
      if (C.tDer === tq) return;
      C.tDer = tq;
      const gm = C.gm, w = C.m.width, h = C.m.height, sp = sale, pk = sp.ppm, ca = Math.cos(sp.angle), sa = Math.sin(sp.angle);
      gm.clearRect(0, 0, w, h);
      // chaque amas de mousse dévoile, une demi-seconde après, un peu de cuir propre dessous
      for (const a of amas()) {
        const f = clamp01((t - a.t - 0.35) / 0.55);
        if (f <= 0) continue;
        const X = a.x * ca - a.y * sa, Y = a.x * sa + a.y * ca; // (repère du sprite : la basket déjà tournée)
        const px = (X + sp.ax) * pk, py = (Y + sp.ay) * pk, r = 34 * a.s * pk;
        gm.globalAlpha = f * 0.55;
        gm.drawImage(C.disque, px - r, py - r, 2 * r, 2 * r);
      }
      if (E.propre > 0) { gm.globalAlpha = E.propre; gm.fillStyle = '#fff'; gm.fillRect(0, 0, w, h); }
      gm.globalAlpha = 1;
      const g = C.g;
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
      g.drawImage(propre.canvas, 0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(C.m, 0, 0);
      g.globalCompositeOperation = 'destination-over';
      g.drawImage(sale.canvas, 0, 0);
      g.globalCompositeOperation = 'source-over';
    },
    dessinerMousse(g, E) {
      const t = E.t, ppm = this.V.ppm;
      if (!this.bulles) this.bulles = [0, 1, 2, 3, 4].map((i) => bullesSprite(ppm, 900 + i));
      for (const a of amas()) {
        const age = t - a.t;
        if (age < 0 || age > a.vie + 0.6) continue;
        const al = sstep(0, 0.12, age) * (1 - sstep(a.vie, a.vie + 0.6, age)) * (1 - sstep(16.8, 17.4, t)); // (tout est résorbé avant le pinceau)
        if (al <= 0.01) continue;
        const B = this.bulles[a.v], s = a.s * (0.75 + 0.35 * sstep(0, 0.3, age)) * (1 - 0.25 * sstep(a.vie * 0.6, a.vie + 0.6, age));
        g.save();
        // le cuir mouillé sous la mousse : un peu plus sombre, qui sèche ensuite
        g.globalAlpha = al * 0.12;
        g.fillStyle = '#2a2016';
        g.beginPath(); g.arc(a.x, a.y, 11 * s, 0, TAU); g.fill();
        g.globalAlpha = al * 0.95;
        g.translate(a.x, a.y);
        g.rotate(a.a);
        g.drawImage(B.canvas, (-B.S / 2) * s, (-B.S / 2) * s, B.S * s, B.S * s);
        g.restore();
      }
    },
    /* le bord de l'empeigne au bout : le jour (la semelle décollée), la colle déposée, les coups qui referment */
    dessinerBord(g, E) {
      const Bd = BORD;
      if (!Bd || E.t > 30) return;
      const n = Bd.pts.length;
      const ouvert = (u) => {
        let o = 1;
        for (let i = 0; i < COUPS.length; i++) if (E.coups[i]) o *= 1 - Math.exp(-Math.pow((u - COUPS[i].u) / 0.085, 2));
        return o;
      };
      g.save();
      g.lineCap = 'round';
      for (let i = 0; i < n - 1; i++) {
        const u = Bd.cum[i] / Bd.L, u1 = Bd.cum[i + 1] / Bd.L;
        const a = Bd.pts[i], b = Bd.pts[i + 1];
        // le jour : une fente sombre entre l'empeigne et la semelle, plus large au bout
        const larg = 2.7 * Math.pow(Math.sin(Math.PI * clamp01((u - 0.02) / 0.96)), 0.7);
        const o = ouvert((u + u1) / 2);
        if (larg > 0.05 && o > 0.02) {
          g.strokeStyle = 'rgba(18, 13, 10,' + (0.85 * o) + ')';
          g.lineWidth = larg * (0.4 + 0.6 * o) + 0.3;
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        }
        // la colle : ambrée, brillante tant qu'elle est fraîche ; pressée (plus mate) sous le marteau
        if (u < E.colle) {
          const frais = E.t < 21.9 ? 1 : 0.35 + 0.65 * o;
          g.strokeStyle = 'rgba(158, 100, 34,' + (0.66 + 0.24 * frais) + ')';
          g.lineWidth = 3.1;
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
          g.strokeStyle = 'rgba(255, 228, 176,' + (0.6 * frais) + ')';
          g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(a[0] - 0.5, a[1] - 0.4); g.lineTo(b[0] - 0.5, b[1] - 0.4); g.stroke();
        }
      }
      g.restore();
    },
    /* le vieux lacet : noué, puis défait, tiré hors des œillets ; et posé à droite de la basket */
    dessinerVieuxLacet(g, E, pose, om, lu) {
      const Mb = this.Mb, V = this.V, sh = E.basket;
      if (pose) { // posé sur le tapis : une grande S molle (repère de l'écran)
        const k = V.k, P0 = SC.vieuxLacet;
        const pts = [];
        for (let i = 0; i <= 24; i++) {
          const u = i / 24;
          pts.push([P0[0] - 58 + u * 112 + Math.sin(u * 3.4 + 0.6) * 10, P0[1] - 14 + u * 22 + Math.sin(u * 6.1) * 17]);
        }
        g.save();
        g.setTransform(k, 0, 0, k, -V.x0 * k, -V.y0 * k);
        g.globalAlpha = E.vieux.pose;
        tracerLacet(g, pts, COUL_VIEUX, { ombre: [OMB[0] * 2, OMB[1] * 2], lumiere: [-0.5, -0.6] });
        g.restore();
        return;
      }
      const vx = E.vieux;
      const ote = vx.retire * 7; // sept étapes : les six croisillons, puis la barre du bas
      const n = Math.max(0, 6 - ote), barre = clamp01(7 - ote); // ce qui est encore en place
      const brins = brinsLacage(Mb, barre, n);
      for (const b of brins) tracerLacet(g, b.pts, COUL_VIEUX, { ombre: om, lumiere: lu });
      if (vx.noeud > 0) for (const pts of brinsNoeud(Mb, 1, 1 - vx.noeud)) tracerLacet(g, pts, COUL_VIEUX, { ombre: om, lumiere: lu, larg: 5.8 });
      // le brin tiré : du dernier œillet encore lacé jusqu'aux doigts (tout sorti : il pend des doigts, voir pendre)
      if (vx.tire && E.t > 9.8 && vx.retire < 0.999) {
        const kk = Math.min(6, Math.ceil(n));
        const e = Mb.oeillets[Math.max(0, kk)][1];
        const main = W2B(sh, vx.tire[0], vx.tire[1]);
        const m = [(e[0] + main[0]) / 2 - 8, (e[1] + main[1]) / 2 + 6];
        tracerLacet(g, [e, m, main], COUL_VIEUX, { ombre: [om[0] * 3, om[1] * 3], lumiere: lu });
        if (vx.retire > 0.98) { // l'autre bout, qui vient de sortir, pend derrière
          const q = [main[0] + 40, main[1] - 30];
          tracerLacet(g, [main, [(main[0] + q[0]) / 2, (main[1] + q[1]) / 2 + 10], q], COUL_VIEUX, { ombre: [om[0] * 4, om[1] * 4] });
        }
      }
    },
    /* le vieux lacet sorti, qui pend des doigts (repère de l'écran), avant d'être posé */
    pendre(g, E) {
      const V = this.V, k = V.k, h = E.vieux.tire;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        pts.push([h[0] - 70 * u - Math.sin(u * 4) * 10, h[1] + 36 * u + Math.sin(u * 3.4) * 16 - 20 * u * u]);
      }
      g.save();
      g.setTransform(k, 0, 0, k, -V.x0 * k, -V.y0 * k);
      g.globalAlpha = 1 - E.vieux.pose;
      tracerLacet(g, pts, COUL_VIEUX, { ombre: [OMB[0] * (h[2] * 0.6 + 4), OMB[1] * (h[2] * 0.6 + 4)], ombreA: 0.18, lumiere: [-0.5, -0.6] });
      g.restore();
    },
    /* le lacet neuf : tenu entre les deux mains, posé en travers du bout, lacé, noué */
    dessinerLacetNeuf(g, E, om, lu) {
      const Mb = this.Mb, sh = E.basket, nf = E.neuf;
      const D = W2B(sh, E.droite.x, E.droite.y), G = W2B(sh, E.gauche.x, E.gauche.y);
      if (nf.barre <= 0) { // entre les deux mains (ou pendu à la gauche), avant d'être posé
        const t = E.t;
        const a = G, b = t > 24.9 ? D : [G[0] - 40, G[1] + 60];
        const m = [(a[0] + b[0]) / 2 - 10, (a[1] + b[1]) / 2 + 18];
        tracerLacet(g, [a, m, b], COUL_NEUF, { ombre: [om[0] * 5, om[1] * 5], lumiere: lu });
        return;
      }
      const brins = brinsLacage(Mb, nf.barre, nf.croix);
      for (const b of brins) tracerLacet(g, b.pts, COUL_NEUF, { ombre: om, lumiere: lu });
      if (nf.noeud > 0) for (const pts of brinsNoeud(Mb, nf.noeud, 0)) tracerLacet(g, pts, COUL_NEUF, { ombre: om, lumiere: lu, larg: 5.8 });
      if (nf.noeud < 1) { // les deux bouts libres : des derniers œillets lacés jusqu'aux doigts
        const k = Math.min(6, Math.floor(nf.croix + 0.0001));
        const eg = Mb.oeillets[k][0], ed = Mb.oeillets[k][1];
        const f = 1 - nf.noeud;
        for (const [e, h] of [[eg, G], [ed, D]]) {
          const q = [lerp(e[0], h[0], f), lerp(e[1], h[1], f)];
          tracerLacet(g, [e, [(e[0] + q[0]) / 2 + 3, (e[1] + q[1]) / 2], q], COUL_NEUF, { ombre: [om[0] * 4, om[1] * 4], lumiere: lu });
        }
      }
    },

    /* ---------- les mains, et ce qu'elles tiennent ---------- */
    dessinerMains(g, E) {
      const V = this.V, sp = this.sp, D = this.D, G = this.G, k = V.k;
      const items = []; // [{ sp, x, y, rot, lev, alpha, ex }] : d'abord les objets tenus, puis la main qui les tient
      const placer = (Hm, H) => {
        if (!H.vis) return null;
        const pz = { x: H.x, y: H.y, pose: H.pose, pose2: H.pose2, mix: H.mix, levee: H.lev, plie: H.plie };
        Hm.placer(pz);
        return Hm;
      };
      // la main droite et ce qu'elle tient
      const Dm = placer(D, E.droite);
      if (Dm) {
        const e = D.e;
        if (E.brosse.tenue && sp.brosse) items.push({ sp: sp.brosse, x: E.brosse.x, y: E.brosse.y, rot: e.rot, lev: E.brosse.lev });
        if (E.pinceau.tenue && sp.pinceau && E.pinceau.pointe) {
          // le pinceau part des doigts vers le bas de la pente : sa pointe là où on la veut, incliné (raccourci)
          const pt = E.pinceau.pointe, aR = SC.pinceau.a * DEG, tn = E.pinceau.tourne;
          let a = 0, ox = 0, oy = 0;
          for (let it = 0; it < 3; it++) { // la main tient la virole (sous le bout de l'index) ; on recale deux fois
            const aT = D.e.rot - Math.PI / 2 - 0.12 * D.cote;
            a = aR + ((((aT - aR) % TAU) + TAU + Math.PI) % TAU - Math.PI) * tn;
            const dir = [Math.cos(a), Math.sin(a)];
            ox = pt[0] - dir[0] * 77 * 0.8; oy = pt[1] - dir[1] * 77 * 0.8;
            const prise = [ox + dir[0] * 4 * 0.8, oy + dir[1] * 4 * 0.8]; // (on le tient sur le manche, juste derrière la virole)
            D.placer({ x: prise[0], y: prise[1], pose: E.droite.pose, pose2: E.droite.pose2, mix: E.droite.mix, levee: E.droite.lev, plie: 0 });
          }
          items.push({ sp: sp.pinceau, x: ox, y: oy, rot: a, lev: E.pinceau.lev, ex: 0.8 });
          D.pinceauDessus = { sp: sp.pinceau, x: ox, y: oy, rot: a, lev: E.pinceau.lev, ex: 0.8, coupe: -26 }; // le bout du manche, posé dans le creux du pouce : par-dessus la main
          if (E.pinceau.goutte > 0) items.push({ goutte: true, a: pt, b: [SC.pot.x, SC.pot.y], f: E.pinceau.goutte });
        }
        if (E.marteau.tenue) {
          const fr = E.marteau.frappe, ms = fr > 0.5 ? sp['marteau-frappe'] : sp.marteau;
          if (E.marteau.tete) {
            // la tête vise le bord ; le manche va vers la main (le poing à ~200 mm, côté auriculaire)
            // le manche traverse le poing en biais : la tête du côté du pouce, un peu vers l'avant ; on tient près de la tête
            const tete = E.marteau.tete, ext = 122;
            for (let it = 0; it < 3; it++) {
              const aM = D.e.rot + MANCHE * D.cote;
              const prise = [tete[0] - Math.cos(aM) * ext, tete[1] - Math.sin(aM) * ext];
              D.placer({ x: prise[0], y: prise[1], pose: 'poing', levee: E.droite.lev, plie: 0 });
            }
            const aM2 = D.e.rot + MANCHE * D.cote;
            const orig = [tete[0] - Math.cos(aM2) * 127, tete[1] - Math.sin(aM2) * 127];
            // l'arc du coup : la tête monte vers l'objectif et revient vers le poignet ; le manche pivote dans le poing
            const avance = E.marteau.lev * 0.42;
            items.push({ sp: ms, x: orig[0] + Math.cos(aM2) * -avance, y: orig[1] + Math.sin(aM2) * -avance, rot: aM2, lev: E.marteau.lev, echelle: 1 + E.marteau.lev * 0.0012 });
          } else if (E.marteau.prise) {
            // on le soulève en le tournant : de sa place (couché, la tête en haut) à la prise en main
            const aTenu = e.rot + MANCHE * D.cote, aPose = SC.marteau.a * DEG;
            const aM = aPose + ((((aTenu - aPose) % TAU) + TAU + Math.PI) % TAU - Math.PI) * E.marteau.tourne;
            const orig = [E.marteau.prise[0] - Math.cos(aM) * 5, E.marteau.prise[1] - Math.sin(aM) * 5];
            // le marteau posé (couché) → en frappe (debout) : fondu pendant qu'on le soulève
            const sM = sp.marteau, sF = sp['marteau-frappe'];
            if (sM && fr < 1) items.push({ sp: sM, x: orig[0], y: orig[1], rot: aM, lev: E.marteau.lev, alpha: 1 - fr });
            if (sF && fr > 0) items.push({ sp: sF, x: orig[0], y: orig[1], rot: aM, lev: E.marteau.lev, alpha: fr });
          }
        }
        for (const el of D.elements()) items.push(Object.assign({ main: true, lev: el.levee }, el));
        if (E.pinceau.tenue && D.pinceauDessus) items.push(D.pinceauDessus);
        D.pinceauDessus = null;
      }
      // la main gauche et ce qu'elle tient
      const Gm = placer(G, E.gauche);
      if (Gm) {
        const e = G.e;
        const tk = E.ticket;
        if (sp.ticket && tk.lev >= 0.5) items.push({ ticket: true });
        if (E.tampon.tenue && sp.tampon) items.push({ sp: sp.tampon, x: E.tampon.x, y: E.tampon.y, rot: e.rot, lev: E.tampon.lev });
        for (const el of G.elements()) items.push(Object.assign({ main: true, lev: el.levee }, el));
      } else if (sp.ticket && E.ticket.lev >= 0.5) items.push({ ticket: true });
      // 1. les ombres, unies (une seule ombre là où la main et l'outil se recouvrent)
      const gb = this.gb, sb = this.sb, cb = this.cb;
      gb.globalCompositeOperation = 'source-over';
      gb.fillStyle = '#fff';
      gb.fillRect(0, 0, cb.width, cb.height);
      gb.globalCompositeOperation = 'darken';
      let ombres = 0;
      for (const it of items) {
        if (it.ticket) { const tk = E.ticket; ombreUnie(gb, V, sb, sp.ticket, tk.x, tk.y, tk.a, { lev: tk.lev }); ombres++; continue; }
        if (!it.sp || it.coupe != null) continue;
        ombreUnie(gb, V, sb, it.sp, it.x, it.y, it.rot, { lev: it.lev, alpha: it.alpha, ex: it.ex });
        ombres++;
      }
      gb.globalCompositeOperation = 'source-over';
      if (ombres) {
        g.save();
        g.globalCompositeOperation = 'multiply';
        g.drawImage(cb, 0, 0, V.W, V.H);
        g.restore();
      }
      // 2. les objets et les mains
      for (const it of items) {
        if (it.ticket) { this.dessinerTicketTenu(g, E.ticket); continue; }
        if (it.goutte) { // un fil de colle, du pinceau au pot, qui s'amincit
          g.save();
          g.strokeStyle = 'rgba(120, 76, 30, ' + (0.7 * it.f) + ')';
          g.lineWidth = Math.max(0.3, 1.6 * it.f) * k;
          g.beginPath();
          g.moveTo((it.a[0] - V.x0) * k, (it.a[1] - V.y0) * k);
          g.quadraticCurveTo(((it.a[0] + it.b[0]) / 2 + 6 - V.x0) * k, ((it.a[1] + it.b[1]) / 2 + 10 - V.y0) * k, (it.b[0] - V.x0) * k, (it.b[1] - V.y0) * k);
          g.stroke();
          g.restore();
          continue;
        }
        if (!it.sp) continue;
        poserSprite(g, V, it.sp, it.x, it.y, it.rot, { lev: it.lev, alpha: it.alpha, ex: it.ex, coupe: it.coupe, echelle: it.echelle });
      }
    },
    dessinerTicketTenu(g, tk) {
      const V = this.V, sp = this.sp.ticket;
      poserSprite(g, V, sp, tk.x, tk.y, tk.a, { lev: tk.lev });
      if (tk.fil > 0) this.dessinerFil(g, tk);
    },

    /* ---------- le temps ---------- */
    etapeA(t) {
      let id = ETAPES[0][0];
      for (const [e, t0] of ETAPES) if (t >= t0) id = e;
      return id;
    },
    emettre(id) {
      if (id === this.derEtape) return;
      this.derEtape = id;
      for (const f of this.ecoute.etape) { try { f(id); } catch (e) { console.error(e); } }
    },
    sons(t0, t1) {
      if (!CO.sfx || !CO.sfx.play) return;
      for (const [ts, nom, o] of SONS) if (ts > t0 && ts <= t1) CO.sfx.play(nom, o || {});
    },
    boucle() {
      if (this.raf) return;
      let der = 0;
      const pas = (tn) => {
        this.raf = 0;
        if (!this.actif()) return;
        // (60 images/s suffisent : sur un écran à 120 Hz, on saute une image sur deux)
        if (der && tn - der < 14) { this.raf = requestAnimationFrame(pas); return; }
        const dt = der ? Math.min(0.1, (tn - der) / 1000) : 0;
        der = tn;
        // on attend les objets de la partie qui vient (sans avancer le temps)
        const t0 = this.t;
        const ok = this.besoins(t0);
        M.calcul.doux = ok && !this.complet;
        if (ok) {
          let t1 = t0 + dt * this.o.vitesse;
          if (t1 >= DUREE) {
            if (this.o.boucle) { this.sons(t0, DUREE); t1 -= DUREE; this.sons(-1, t1); }
            else { t1 = DUREE - 0.001; this.voulu = false; }
          } else this.sons(t0, t1);
          this.t = t1;
        }
        this.emettre(this.etapeA(this.t));
        this.dessiner(this.t);
        if (this.actif()) this.raf = requestAnimationFrame(pas);
      };
      this.raf = requestAnimationFrame(pas);
    },
    /* les objets nécessaires autour de t sont-ils prêts ? */
    besoins(t) {
      if (this.complet) return true;
      const sp = this.sp, D = this.D, G = this.G;
      const ok = (ids) => ids.every((id) => sp[id]);
      if (!this.fondCv) return false;
      if (t > 0.4 && !(this.Mb && sp['basket-sale'] && D.pret('tient') && this.chaud)) return false;
      if (t > 2.3 && !(D.pret('repos') && G.pret('repos') && sp.ticket)) return false;
      if (t > 4.6 && !G.pret('pince')) return false;
      if (t > 8.5 && !(D.pret('pince') && G.pret('tient'))) return false;
      if (t > 12.3 && !(ok(['brosse', 'basket-propre']) && D.pret('brosse'))) return false;
      if (t > 16.8 && !(ok(['pinceau']) && D.pret('stylo'))) return false;
      if (t > 20 && !(ok(['marteau', 'marteau-frappe']) && D.pret('poing'))) return false;
      if (t > 23.5 && !ok(['lacets-neufs'])) return false;
      if (t > 28.5 && !(ok(['tampon']) && G.pret('poing'))) return false;
      return true;
    },
    actif() { return this.voulu && this.visible && this.pret; },
    relancer() {
      if (this.actif()) this.boucle();
      else {
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
        M.calcul.doux = false; // (le film ne joue pas : les calculs vont à pleine vitesse, s'il est visible)
        M.calcul.reveil();
      }
    },

    /* ---------- visible ou non : rien ne tourne quand on ne le voit pas ---------- */
    _observer() {
      const vue = this.host.closest ? this.host.closest('.view') : null;
      this.vueId = vue ? vue.id : null;
      this.vueActive = CO.view || null;
      if (window.IntersectionObserver) {
        this.io = new IntersectionObserver((es) => { es.forEach((e) => { this.dedans = e.isIntersecting; }); this._maj(); });
        this.io.observe(this.host);
      }
      this._vue = (v) => { this.vueActive = v; this._maj(); };
      if (CO.on) CO.on('view', this._vue);
      this._vis = () => this._maj();
      document.addEventListener('visibilitychange', this._vis);
      if (window.ResizeObserver) {
        let tm = 0;
        this.ro = new ResizeObserver(() => { clearTimeout(tm); tm = setTimeout(() => this.redimensionner(), 180); });
        this.ro.observe(this.host);
      }
      this._cond = M.calcul.condition(() => this.visible && !this.detruit);
    },
    _maj() {
      if (this.detruit) return;
      const v = this.dedans && !document.hidden && (!this.vueId || !this.vueActive || this.vueActive === this.vueId);
      if (v === this.visible) return;
      this.visible = v;
      if (v) { M.calcul.reveil(); if (this.pret) this.dessiner(this.t); }
      this.relancer();
    },
    async redimensionner() {
      if (!this.V || this.detruit) return;
      const V = this.mesurerVue();
      if (Math.abs(V.W - this.V.W) < 2 && Math.abs(V.H - this.V.H) < 2) return;
      const ancien = this.fondCv;
      // même définition des objets (ils se posent à l'échelle) ; le fond, lui, est refait à la bonne taille
      V.ppm = this.V.ppm;
      this.appliquerVue(V);
      this.fondCv = ancien;
      this.fond(3).then(() => this.dessiner(this.t));
      this.dessiner(this.t);
    },
  };

  /* les sons, calés sur le geste qui les fait */
  const SONS = [
    [2.2, 'knock', { gain: 0.5 }],
    [5.5, 'flick', { gain: 0.45 }],
    [7.0, 'lace', { gain: 0.45 }],
    [7.95, 'flick', { gain: 0.3 }],
    [10.05, 'lace', { gain: 0.6 }],
    [10.7, 'lace'],
    [11.75, 'lace'],
    [12.5, 'flick', { gain: 0.25 }],
    [13.35, 'tap', { gain: 0.35 }],
    [14.0, 'glue', { gain: 0.55 }],
    [14.65, 'brush', { n: 4 }], [15.27, 'brush', { n: 4 }], [15.89, 'brush', { n: 3 }],
    [17.05, 'tap', { gain: 0.3 }],
    [18.0, 'glue', { gain: 0.7 }],
    [18.9, 'glue', { gain: 0.6 }], [19.45, 'glue', { gain: 0.45 }],
    [20.35, 'tap', { gain: 0.3 }],
    [21.05, 'tap', { gain: 0.35 }],
    ...COUPS.map((c, i) => [c.t, 'hammer', { v: 0.7 + (i % 2) * 0.12 }]),
    [23.6, 'tap', { gain: 0.35 }],
    [24.35, 'lace', { gain: 0.4 }],
    [25.2, 'lace', { gain: 0.55 }],
    ...CROIX.map((t) => [t, 'lace', { gain: 0.42 }]),
    [28.3, 'lace', { gain: 0.6 }],
    [29.45, 'knock', { gain: 0.22 }],
    [30.15, 'tap', { gain: 0.3 }],
    [31.0, 'stamp'],
    [31.35, 'yes', { gain: 0.45 }],
    [32.1, 'tap', { gain: 0.3 }],
  ];

  /* ======================================================================
     9. L'API
     ====================================================================== */
  function api(F) {
    const film = {
      jouer() { if (!F.o.boucle && F.t >= DUREE - 0.01) F.t = 0; F.voulu = true; F.relancer(); },
      pause() { F.voulu = false; F.relancer(); },
      reprise() { F.voulu = true; F.relancer(); },
      aller(t) {
        F.t = ((t % DUREE) + DUREE) % DUREE;
        F.emettre(F.etapeA(F.t));
        if (F.pret) F.dessiner(F.t);
      },
      /** on('etape', fn) : fn(id) au début de chaque partie ; un abonné tardif reçoit tout de suite l'étape en cours */
      on(ev, fn) {
        (F.ecoute[ev] = F.ecoute[ev] || []).push(fn);
        if (ev === 'etape' && F.derEtape) Promise.resolve().then(() => { if (!F.detruit) fn(F.derEtape); });
        return () => { F.ecoute[ev] = F.ecoute[ev].filter((f) => f !== fn); };
      },
      detruire() {
        F.detruit = true;
        F.voulu = false;
        if (F.raf) cancelAnimationFrame(F.raf);
        if (F.io) F.io.disconnect();
        if (F.ro) F.ro.disconnect();
        document.removeEventListener('visibilitychange', F._vis);
        if (F._cond) F._cond();
        F.cv.remove();
      },
      /** → Promise : tout est calculé et l'instant courant est dessiné */
      async image() { await F.tout; F.dessiner(F.t); return F.cv; },
      /** mesures : temps de préparation, coût d'une image (moyenne et pire sur 120 images dessinées d'affilée) */
      async mesurer() {
        await F.tout;
        const tps = [];
        let pire = 0, tPire = 0;
        for (let i = 0; i < 180; i++) {
          const t = (i / 180) * DUREE;
          const a = now();
          F.dessiner(t);
          const d = now() - a;
          tps.push(d);
          if (d > pire) { pire = d; tPire = t; }
        }
        tps.sort((a, b) => a - b);
        const moy = tps.reduce((s, v) => s + v, 0) / tps.length;
        F.dessiner(F.t);
        return 'préparation : ' + Math.round(F.tPrep.debut) + ' ms pour commencer, ' + Math.round(F.tPrep.tout) + ' ms en tout (calcul pur ' + Math.round(M.calcul.stats.cpu) + ' ms, tranche la plus longue ' + M.calcul.stats.pasMax.toFixed(1) + ' ms)\n' +
          'une image (' + F.V.W + '×' + F.V.H + ' px) : ' + moy.toFixed(2) + ' ms en moyenne, médiane ' + tps[90].toFixed(2) + ' ms, 95 % < ' + tps[171].toFixed(2) + ' ms, pire ' + tps[179].toFixed(2) + ' ms (à ' + tPire.toFixed(1) + ' s)';
      },
      get duree() { return DUREE; },
      get t() { return F.t; },
      get joue() { return F.actif(); },
      get canvas() { return F.cv; },
      ETAPES: ETAPES.slice(),
      _F: F,
    };
    return film;
  }

  const Process = (CO.Process = CO.Process || {});
  Object.assign(Process, {
    DUREE, ETAPES,
    /** CO.Process.create(host, { boucle, auto, vitesse, t }) → Promise<film> (résolue quand le début est prêt) */
    async create(host, opts) {
      const F = new Film(host, opts);
      F.appliquerVue(F.mesurerVue());
      F.dessiner(F.t);
      F.preparer().catch((e) => console.warn('process', e));
      // on attend de quoi commencer
      await new Promise((res) => {
        const verif = () => { if (F.pret || F.detruit) res(); else setTimeout(verif, 60); };
        verif();
      });
      F.emettre(F.etapeA(F.t));
      F.dessiner(F.t);
      F.relancer();
      return api(F);
    },
    _interne: { sprite, modeleBasket, empreintePrete, kf, EASE, tuiles, NOS, etat, SC },
  });
})();
