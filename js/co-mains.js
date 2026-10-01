/* ==========================================================================
   Cordo 63 — les mains de Clément, vues de dessus (CO.Mains)
   Des mains d'homme calculées comme les outils de l'établi : une géométrie
   (le poignet, le dos de la main, les doigts en trois phalanges, le pouce),
   une carte de hauteur, puis la lumière commune de l'atelier (co-rendu.js).
   Ce qui fait vrai, et qu'on garde discret : des doigts longs, des
   articulations à peine marquées (quelques plis fins au dos des phalanges,
   un peu de rougeur), des ongles courts, les tendons et les veines qu'on
   devine sur le dos de la main. Aucune bosse ronde : le dos de la main sort
   du poignet sans rupture (même profil que l'avant-bras), les doigts et le
   pouce s'y raccordent par des palmures adoucies.
   Les avant-bras sont tatoués (motifs au trait, encre bleu-noir passée), une
   montre à bracelet orange au poignet gauche, les manches sombres remontées
   au coude.

   Repère d'une main (mm, vue de dessus) : le milieu du pli du poignet en (0, 0),
   les doigts vers −y (le haut de l'écran), l'avant-bras vers +y. Main droite :
   le pouce côté −x ; la main gauche est son miroir, calculé tel quel (la
   lumière reste celle de l'atelier, en haut à gauche).

   Deux sprites par main : l'avant-bras (un par côté, commun à toutes les
   poses) et la main (un par pose), qui se fond dans l'avant-bras au poignet
   (même profil des deux côtés du raccord, fondu sur 16 mm).

   CO.Mains.POSES                                   repos, tient, pince, brosse, stylo, poing ; clou, lache, maillet (le clouage)
   CO.Mains.main(cote, pose, { ppm, angle, boite })  générateur → sprite de la main (cote : +1 droite, −1 gauche ;
                                                    boite : [x0, y0, x1, y1] mm, pour ne calculer qu'un bout de main)
   CO.Mains.bras(cote, { ppm, angle, longueur })    générateur → sprite de l'avant-bras (longueur : raccourci, il s'efface au bout)
   CO.Mains.preparer(quoi, cote, pose, opts, prio)  → Promise du sprite (quoi : 'main' | 'bras' ; mis en cache)
   CO.Mains.prise(cote, pose)                       → [x, y] : le point de prise (ce que la main tient)
   CO.Mains.bout(cote, pose, doigt)                 → [x, y, z] : le bout d'un doigt (0 index … 3 auriculaire, 4 pouce)
   CO.Mains.Main(cote, { ppm, angle0, epaule })     une main vivante (placer, poses en fondu, éléments à dessiner)
   CO.Mains.calcul                                  l'ordonnanceur par tranches (indépendant de R.pause)
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const R = CO.R;
  if (!R) throw new Error('co-mains.js : charger co-rendu.js avant');
  const clamp01 = R.clamp01, sstep = R.sstep, lerp = R.lerp;
  const TAU = Math.PI * 2;
  const now = () => performance.now();

  /* ======================================================================
     0. L'ordonnanceur : les calculs par tranches, à nous
     L'établi (co-etabli.js) suspend l'ordonnanceur commun (R.pause) quand il
     n'est pas à l'écran : le film, lui, vit dans un autre onglet. On mène donc
     nos générateurs nous-mêmes, par tranches de quelques ms, et on s'arrête
     quand le film n'est pas visible (les conditions posées sont toutes fausses).
     Comme celui de co-rendu.js : chaque pas a son échéance (R.echeance) ; prio ≤ 0,
     aux temps morts seulement (R.inactif), dans l'échéance qu'ils donnent ; 0 < prio < 1,
     en douceur (une tranche après chaque image) ; prio ≥ 1, tout de suite.
     ====================================================================== */
  const calcul = (function () {
    const file = [];
    let prevuMsg = false, prevuIdle = false, prevuDoux = false, seq = 0, budget = 8, doux = false;
    const conditions = new Set();
    const canal = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
    const suite = () => { prevuMsg = false; tourner(2, null); };
    if (canal) canal.port1.onmessage = suite;
    const stats = { cpu: 0, pasMax: 0, tranches: 0, lents: [] };
    const classe = (p) => (p <= 0 ? 0 : p < 1 ? 1 : 2);
    function peutTourner() {
      if (!conditions.size) return true;
      for (const f of conditions) if (f()) return true;
      return false;
    }
    function planifier() {
      if (!file.length || !peutTourner()) return;
      const c = classe(file[0].prio);
      if (c === 0) {
        if (!prevuIdle) { prevuIdle = true; R.inactif((dl) => { prevuIdle = false; tourner(0, dl); }); }
        return;
      }
      if (c === 1) {
        if (!prevuDoux) { prevuDoux = true; R.apresImage(() => { prevuDoux = false; tourner(1, null); }); }
        return;
      }
      if (prevuMsg) return;
      prevuMsg = true;
      // doux : une tranche par image affichée (le film joue : il garde ses 60 images/s) ;
      // sinon, les tranches s'enchaînent (le film attend ses objets)
      if (doux) R.apresImage(suite);
      else if (canal) canal.port2.postMessage(0);
      else setTimeout(suite, 0);
    }
    function tourner(c, dl) {
      const t0 = now();
      stats.tranches++;
      const inactif = c === 0 && !!(dl && dl.timeRemaining && !dl.didTimeout);
      const fin = t0 + (inactif ? Math.min(budget, dl.timeRemaining() - 1) : c === 1 ? R.DOUX : doux ? Math.min(budget, 5) : budget);
      while (file.length) {
        const job = file[0];
        if (classe(job.prio) !== c) break; // (ce n'est pas sa file : planifier() s'en charge)
        const reste = fin - now();
        if (reste < (inactif ? 1 : 0.5)) break;
        const ta = now();
        R.echeance(Math.min(R.TRANCHE, reste));
        let r;
        try {
          r = job.gen.next(job.retour);
          job.retour = undefined;
        } catch (e) {
          file.shift();
          job.reject(e);
          continue;
        }
        const dt = now() - ta;
        job.cpu += dt;
        stats.cpu += dt;
        if (dt > stats.pasMax) stats.pasMax = dt;
        if (dt > 30) stats.lents.push([Math.round(dt), job.nom || '?']);
        if (r.done) {
          file.shift();
          job.resolve(r.value);
          continue;
        }
        if (r.value && typeof r.value.then === 'function') {
          // une promesse (une police, la mémoire du téléphone) : ce calcul attend, les autres continuent
          file.shift();
          r.value.then((v) => { job.retour = v; }, () => {}).then(() => { file.push(job); trier(); planifier(); });
        }
      }
      planifier();
    }
    function trier() { file.sort((a, b) => b.prio - a.prio || a.n - b.n); }
    return {
      stats,
      /** mène un générateur par tranches → Promise du résultat (p.job.cpu : son temps de calcul) */
      lancer(gen, prio = 1, nom = '') {
        let resolve, reject;
        const p = new Promise((a, b) => { resolve = a; reject = b; });
        const job = { gen, prio, n: seq++, resolve, reject, cpu: 0, nom };
        p.job = job;
        file.push(job);
        trier();
        planifier();
        return p;
      },
      /** un calcul lancé passe devant (prio plus haute) : on en a besoin maintenant */
      presser(p, prio) {
        const job = p && p.job;
        if (job && prio > job.prio) { job.prio = prio; trier(); planifier(); }
        return p;
      },
      /** une condition pour calculer (le film est-il visible ?) ; → la fonction qui l'enlève */
      condition(f) { conditions.add(f); return () => { conditions.delete(f); planifier(); }; },
      reveil: planifier,
      set budget(v) { budget = v; },
      /** doux : une tranche par image (pendant que le film joue) */
      set doux(v) { doux = !!v; },
      get doux() { return doux; },
      get budget() { return budget; },
      get attente() { return file.length; },
    };
  })();

  /* ======================================================================
     1. Les couleurs (sRGB → linéaire) et le bruit
     La lumière de l'atelier est chaude : l'albédo de la peau est donc rosé,
     peu saturé (sous la lampe, il redevient la peau claire de Clément).
     ====================================================================== */
  const C = {
    peau: R.lin('#d5a98d'), // le dos de la main (hâlé : pas rose, pas d'argile)
    peauBras: R.lin('#d9b297'), // l'avant-bras : un peu plus pâle
    jaune: R.lin('#d9b692'), // les reliefs osseux, plus jaunes
    rouge: R.lin('#c3856b'), // jointures, bouts des doigts (un rouge chaud, pas rose)
    ongle: R.lin('#e2b9a5'), lunule: R.lin('#eed8ca'), bordOngle: R.lin('#efe3d4'), crasse: R.lin('#6e5a48'),
    veine: R.lin('#8b97aa'),
    encre: R.lin('#2c3a4b'),
    manche: R.lin('#2b2c31'),
    bracelet: R.lin('#d9702a'), couture: R.lin('#9c4c1a'),
    cadran: R.lin('#ece3cf'), aiguille: R.lin('#22252a'),
  };
  let T = null;
  function* tuiles() {
    if (T) return T;
    const t = {};
    t.a = yield* R.tuileG(9, 8, 4); // grandes nuances
    t.b = yield* R.tuileG(10, 16, 3); // moyennes
    t.c = yield* R.tuileG(11, 32, 2); // fines (grain de peau)
    t.e = yield* R.tuileG(12, 64, 1); // très fines (pores, poils)
    T = t;
    return T;
  }
  const tx = R.tx;
  const smax = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + (h * h * k) / 4;
  };
  const smin = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - (h * h * k) / 4;
  };

  /* ======================================================================
     2. La géométrie
     Main droite (le pouce vers −x), doigts vers −y. mm.
     ====================================================================== */
  // les doigts : k la jointure (tête du métacarpien) ; L les phalanges (doigt tendu) ; r les demi-largeurs, de la base au bout
  const DOIGTS = [
    { k: [-26, -84], L: [41, 26, 21.5], r: [9.1, 8.2, 7.6, 7.05] }, // index
    { k: [-8, -89], L: [45.5, 29, 22.5], r: [9.3, 8.45, 7.8, 7.2] }, // majeur
    { k: [9.5, -87], L: [42.5, 27, 21.5], r: [8.9, 8.1, 7.5, 6.95] }, // annulaire
    { k: [25, -79], L: [32.5, 20.5, 19], r: [7.8, 7.05, 6.55, 6.05] }, // auriculaire
  ];
  const POUCE = { cmc: [-17, -12], Lmc: 42, L: [29, 25], r: [11.4, 10.6, 9.8, 8.9] };

  /* Les poses : flexion de chaque phalange (rad, vers l'établi), écart des doigts (rad, + vers l'auriculaire),
     pouce : mc l'angle du métacarpien (− vers l'extérieur), a l'inclinaison des phalanges vers l'index,
     flex leur flexion ; cible : le bout du pouce va rejoindre un point (0 : le bout de l'index, 1 : son milieu) */
  const POSES = {
    // posée à plat, détendue (elle attend, elle pousse la chaussure)
    repos: {
      flex: [[0.04, 0.17, 0.1], [0.02, 0.17, 0.1], [0.05, 0.19, 0.11], [0.08, 0.2, 0.12]],
      ecart: [-0.075, -0.02, 0.035, 0.1],
      pouce: { mc: -0.6, a: [0.1, 0.12], flex: [0.12, 0.16] },
    },
    // sur la chaussure : les doigts l'enveloppent, le pouce en face
    tient: {
      flex: [[0.4, 0.6, 0.3], [0.38, 0.62, 0.3], [0.42, 0.64, 0.32], [0.48, 0.68, 0.34]],
      ecart: [-0.06, -0.015, 0.035, 0.09],
      pouce: { mc: -0.62, a: [0.16, 0.16], flex: [0.32, 0.28] },
    },
    // la pince : le bout du pouce contre le bout de l'index, les autres repliés
    pince: {
      flex: [[0.5, 0.95, 0.45], [0.66, 1.0, 0.5], [0.8, 1.08, 0.55], [0.9, 1.12, 0.6]],
      ecart: [0.08, 0.03, 0.06, 0.11],
      pouce: { mc: -0.5, cible: 0, flex: [0.14, 0.1] },
    },
    // la brosse : la paume sur son dos, les doigts sur ses flancs
    brosse: {
      flex: [[0.16, 0.74, 0.42], [0.14, 0.76, 0.42], [0.18, 0.78, 0.44], [0.24, 0.82, 0.46]],
      ecart: [-0.05, -0.012, 0.03, 0.08],
      pouce: { mc: -0.62, a: [0.12, 0.1], flex: [0.36, 0.3] },
    },
    // le crayon : le pinceau entre le pouce et l'index, le majeur dessous
    stylo: {
      flex: [[0.42, 0.72, 0.36], [0.62, 1.0, 0.5], [0.86, 1.15, 0.6], [0.96, 1.2, 0.64]],
      ecart: [0.04, 0.05, 0.08, 0.12],
      pouce: { mc: -0.52, cible: 1, flex: [0.16, 0.14] },
    },
    // le poing serré sur un manche
    poing: {
      flex: [[1.15, 1.45, 0.8], [1.15, 1.5, 0.8], [1.2, 1.5, 0.82], [1.25, 1.5, 0.85]],
      ecart: [-0.03, 0, 0.02, 0.05],
      pouce: { mc: -0.5, a: [0.5, 0.42], flex: [0.18, 0.22] },
    },
    // tenir un clou : le pouce et l'index pincent la tige sous la tête, les trois autres doigts rentrés sous la paume
    clou: {
      flex: [[0.55, 1.05, 0.55], [1.36, 1.62, 0.9], [1.42, 1.62, 0.9], [1.48, 1.56, 0.9]],
      ecart: [0.05, -0.01, 0.0, 0.03],
      pouce: { mc: -0.15, cible: 0, ecart: 9, flex: [0.06, 0.1] }, // (le pouce en opposition : il rejoint le bout de l'index)
      plat: 0.78, carre: true,
    },
    // le clou lâché : le pouce et l'index s'ouvrent, les autres restent rentrés
    lache: {
      flex: [[0.46, 0.82, 0.42], [1.32, 1.6, 0.9], [1.38, 1.6, 0.9], [1.44, 1.54, 0.9]],
      ecart: [-0.03, -0.01, 0.0, 0.03],
      pouce: { mc: -0.42, a: [0.12, 0.16], flex: [0.14, 0.16] },
      plat: 0.78, carre: true,
    },
    // le maillet, poigne pleine : les doigts s'enroulent autour du manche (on voit la rangée des jointures),
    // le pouce couché par-dessus ; le manche sort en biais entre le pouce et l'index, vers la tête
    maillet: {
      flex: [[1.3, 1.62, 0.85], [1.38, 1.66, 0.85], [1.44, 1.66, 0.85], [1.5, 1.62, 0.85]],
      ecart: [-0.02, -0.01, 0.0, 0.02],
      pouce: { mc: -0.5, a: [0.5, 0.4], flex: [0.2, 0.22] },
      plat: 0.74, carre: true, // (des doigts serrés, le dos plat, les jointures franches : un poing, pas des griffes)
    },
  };
  const NOMS = Object.keys(POSES);

  /* le profil de l'avant-bras (v : mm depuis le pli du poignet, vers le coude) : partagé par les deux sprites */
  const rBras = (v) => 30 + 4.2 * sstep(-5, 75, v) + 6.6 * sstep(50, 210, v) - 1.6 * sstep(215, 262, v);
  const zBras = (v) => 7.5 + 7 * sstep(0, 130, v) + 11 * sstep(90, 280, v);
  const fBras = (v) => 0.84 + 0.08 * sstep(20, 160, v);
  const COUDE = 256; // la manche remontée commence là
  const FONDU = [13, 29]; // le raccord main → avant-bras (sur le sprite de la main)

  /* Le dos de la main (main droite) : il prolonge l'avant-bras (y ≥ 0 : le même tube), s'élargit vers les jointures,
     le dessus presque plat, les côtés arrondis ; il s'arrête un peu au-delà de la ligne des jointures. */
  const R0 = rBras(0); // demi-largeur du poignet (exactement celle de l'avant-bras : pas de marche au pli du poignet)
  const ligneJ = (() => { // la limite du dos de la main, un peu au-delà des jointures (x → y), par morceaux lissés
    const P = [[-40, -76], [-35, -83], [-26, -90], [-8, -95], [9.5, -93], [25, -85], [34, -77], [40, -70]];
    return (x) => {
      if (x <= P[0][0]) return P[0][1];
      if (x >= P[P.length - 1][0]) return P[P.length - 1][1];
      let i = 0;
      while (x > P[i + 1][0]) i++;
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const t = (x - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
    };
  })();
  /* → { d, h, he } : distance signée (mm), hauteur, hauteur prolongée hors de la forme (pour les raccords) */
  const CORPS = { d: 0, h: 0, he: 0, u: 0 };
  function corps(x, y, m) {
    const xm = x * m; // en main droite
    let xl, xr, zA, th, p;
    if (y >= 0) {
      const r = rBras(y);
      xl = -r; xr = r; zA = zBras(y); th = fBras(y) * r; p = 2;
    } else {
      const a = sstep(0, -26, y), b = sstep(-26, -88, y);
      // le bord cubital (côté auriculaire) est bombé : l'éminence hypothénar, puis il rentre vers le petit doigt
      xr = R0 + 5.8 * sstep(0, -48, y) - 5.6 * sstep(-52, -92, y); // (près des jointures, c'est l'auriculaire qui fait le bord)
      xl = -(R0 + 5.6 * sstep(-4, -74, y));
      zA = lerp(7.5, 13, a);
      th = lerp(fBras(0) * R0, 17.2, a) - 3.2 * b;
      p = 2 + 0.4 * a;
    }
    const xc = (xl + xr) / 2, hw = (xr - xl) / 2;
    const u = (xm - xc) / hw, au = u < 0 ? -u : u;
    const dS = (au - 1) * hw;
    const yK = ligneJ(xm);
    const eD = y - yK; // > 0 : en deçà de la ligne des jointures (dans la main)
    CORPS.d = Math.max(dS, -eD);
    CORPS.u = u;
    let S = au < 1 ? Math.pow(1 - Math.pow(au, p), 1 / p) : 0;
    // au bout, le dos s'arrondit à peine : les doigts prennent le relais à la même hauteur
    const RC = 15;
    const capF = eD >= RC ? 1 : eD <= 0 ? 0.62 : 0.62 + 0.38 * Math.sqrt(1 - (1 - eD / RC) * (1 - eD / RC));
    // le dos est un peu plus haut côté index (les deux premiers métacarpiens), plus bas côté auriculaire
    const pente = y < 0 ? -0.05 * xm * sstep(0, -30, y) : 0;
    CORPS.h = zA + th * S * capF + pente * S;
    CORPS.he = zA;
    return CORPS;
  }

  function cap(ax, ay, bx, by, ra, rb, za, zb, kind, o) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6;
    const m = Math.max(ra, rb) + 8; // (la marge : les raccords adoucis débordent un peu)
    const len = Math.sqrt(l2), ta = (zb - za) / len, cosA = 1 / Math.sqrt(1 + ta * ta);
    return Object.assign({
      ax, ay, bx, by, ra, rb, za, zb, kind, dx, dy, l2, len, cosA, sinA: ta * cosA, flat: 0.9, grp: 0, art: -1, fore: 1,
      x0: Math.min(ax, bx) - m, x1: Math.max(ax, bx) + m, y0: Math.min(ay, by) - m, y1: Math.max(ay, by) + m,
    }, o || {});
  }

  /* Un doigt : un tube balayé le long d'une Catmull-Rom qui passe par ses articulations pts ([x, y, z]),
     découpé en courts tronçons (des capsules presque alignées : pas de pli aux jointures) ; rayons rr aux
     articulations. phal[g][k] garde chaque phalange « logique » (repère des ongles et des plis). */
  function balayer(parts, phal, g, pts, rr, fores, o) {
    const n = pts.length;
    const P = (i) => {
      if (i < 0) return pts[0].map((v, c) => 2 * v - pts[1][c]);
      if (i >= n) return pts[n - 1].map((v, c) => 2 * v - pts[n - 2][c]);
      return pts[i];
    };
    const cr = (p0, p1, p2, p3, t, c) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
    };
    for (let k = 0; k < n - 1; k++) {
      const p0 = P(k - 1), p1 = P(k), p2 = P(k + 1), p3 = P(k + 2);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const N = Math.max(2, Math.min(8, Math.round(len / 4)));
      const derniere = k === n - 2;
      let px = p1[0], py = p1[1], pz = p1[2], pr = rr[k];
      for (let j = 1; j <= N; j++) {
        const t = j / N;
        const qx = cr(p0, p1, p2, p3, t, 0), qy = cr(p0, p1, p2, p3, t, 1), qz = cr(p0, p1, p2, p3, t, 2);
        const r = lerp(rr[k], rr[k + 1], t) * (1 - 0.028 * Math.sin(Math.PI * t)); // la phalange s'affine un peu en son milieu
        // (une phalange repliée sous la main, vers le poignet, ne se voit pas d'en haut : on ne la dessine pas)
        // (o.carre : là où le doigt se replie dessous, le bout visible est une jointure franche, pas une demi-boule)
        const plie = !derniere && o.carre && fores[k + 1] <= -0.25;
        if (fores[k] > -0.25) parts.push(cap(px, py, qx, qy, pr, r, pz, qz, derniere ? 'bout' : 'doigt', { grp: g, art: k, flat: o.flat, carre: (derniere || plie) && j === N }));
        px = qx; py = qy; pz = qz; pr = r;
      }
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      phal[g][k] = { ax: p1[0], ay: p1[1], bx: p2[0], by: p2[1], dx, dy, l2: dx * dx + dy * dy || 1e-6, len: len || 1e-3, ra: rr[k], rb: rr[k + 1], fore: fores[k], kind: derniere ? 'bout' : 'doigt', grp: g, art: k, nailW: o.nailW, nOff: o.nOff, pouce: !!o.pouce };
    }
  }

  /* la géométrie d'une main posée (mise en cache : elle sert au rendu et au placement) */
  const GEOS = new Map();
  function geometrie(cote, nom) {
    const cle = cote + ':' + nom;
    if (GEOS.has(cle)) return GEOS.get(cle);
    const P = POSES[nom] || POSES.repos, m = cote, X = (x) => x * m;
    const parts = [];
    const flex0 = P.flex.map((f) => f[0]);
    const kz = (i) => 17.2 + 4.6 * Math.min(1, flex0[i] * 1.1); // la jointure ressort quand le doigt se plie
    // les jointures : un léger relief, qui ne se voit que doigt plié (grp 0 : fondues dans le dos de la main)
    DOIGTS.forEach((fg, i) => {
      const kk = kz(i), f = Math.min(1, flex0[i] * 1.4);
      parts.push(cap(X(fg.k[0]), fg.k[1] + 3, X(fg.k[0]), fg.k[1] + 1, fg.r[0] + 1.2, fg.r[0] + 1.2, kk - 2.5 + 1.5 * f, kk - 2.5 + 1.5 * f, 'jointure', { flat: 0.42 + 0.22 * f, mc: i }));
    });
    // les doigts : un tube lisse, balayé le long d'une courbe qui passe par les articulations
    // (des capsules séparées font des « perles » aux jointures ; un tube courbe fait de la peau)
    const bouts = [], phal = [null, [], [], [], [], []], J = [null];
    DOIGTS.forEach((fg, i) => {
      const a0 = P.ecart[i] * m;
      const dir = [Math.sin(a0), -Math.cos(a0)];
      // le doigt part à la hauteur du dos de la main (un peu sous la jointure) : pas de marche au raccord
      const hK = corps(X(fg.k[0]), fg.k[1] + 4, m).h;
      let x = X(fg.k[0]), y = fg.k[1] + 1, z = Math.max(kz(i) - 1.6, hK - 0.86 * fg.r[0] - 0.8 + (kz(i) - 17.2)), cum = 0;
      const pts = [[x, y, z]], fores = [];
      for (let k = 0; k < 3; k++) {
        cum += P.flex[i][k];
        const Lp = fg.L[k] * Math.cos(cum), dz = -fg.L[k] * Math.sin(cum) * 0.72;
        x += dir[0] * Lp; y += dir[1] * Lp; z += dz;
        pts.push([x, y, z]);
        fores.push(Math.cos(cum));
      }
      J.push(pts);
      balayer(parts, phal, i + 1, pts, fg.r, fores, { flat: P.plat || 0.86, nailW: 0.66, nOff: 0, carre: !!P.carre });
      bouts.push(pts[3].slice());
    });
    // le pouce : le métacarpien (qui se fond dans le dos de la main par la palmure), puis deux phalanges
    const Tp = P.pouce;
    const cmc = [X(POUCE.cmc[0]), POUCE.cmc[1]];
    const aMC = Tp.mc * m;
    const mcp = [cmc[0] + Math.sin(aMC) * POUCE.Lmc, cmc[1] - Math.cos(aMC) * POUCE.Lmc];
    parts.push(cap(cmc[0], cmc[1], mcp[0], mcp[1], POUCE.r[0], POUCE.r[1] + 0.4, 12.5, 14.5, 'pouce-mc', { grp: 5, art: -1, flat: 0.72 }));
    const L1 = POUCE.L[0] * Math.cos(Tp.flex[0]), L2 = POUCE.L[1] * Math.cos(Tp.flex[0] + Tp.flex[1]);
    let a1, a2;
    if (Tp.cible != null) {
      // le bout du pouce rejoint le bout de l'index (pince) ou le milieu de sa dernière phalange (crayon)
      const ji = J[1];
      let tx0 = Tp.cible === 1 ? lerp(ji[2][0], ji[3][0], 0.4) : ji[3][0], ty0 = Tp.cible === 1 ? lerp(ji[2][1], ji[3][1], 0.4) : ji[3][1];
      // la pulpe du pouce contre le flanc de l'index, côté pouce : vu d'en haut, le pouce reste à côté (pas dessous)
      const ex = ji[3][0] - ji[2][0], ey = ji[3][1] - ji[2][1], el = Math.hypot(ex, ey) || 1;
      let nx = -ey / el, ny = ex / el;
      if (nx * m > 0) { nx = -nx; ny = -ny; }
      const ec = Tp.ecart != null ? Tp.ecart : 12.5; // (entre les deux pulpes : la tige d'un clou, ou rien)
      tx0 += nx * ec + (ex / el) * 1.5; ty0 += ny * ec + (ey / el) * 1.5;
      const dx = tx0 - mcp[0], dy = ty0 - mcp[1], D = Math.min(L1 + L2 - 0.01, Math.hypot(dx, dy));
      const base = Math.atan2(dx, -dy); // l'angle de la droite MCP → cible (direction (sin a, −cos a))
      const ang1 = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
      a1 = base - ang1 * m; // le pouce se plie vers l'extérieur
      const px = mcp[0] + Math.sin(a1) * L1, py = mcp[1] - Math.cos(a1) * L1;
      a2 = Math.atan2(tx0 - px, -(ty0 - py));
    } else {
      a1 = aMC + Tp.a[0] * m;
      a2 = a1 + Tp.a[1] * m;
    }
    {
      let x = mcp[0], y = mcp[1], z = 14, cum = 0;
      const pts = [[x, y, z]], fores = [];
      [[a1, POUCE.L[0]], [a2, POUCE.L[1]]].forEach(([a, L]) => {
        cum += Tp.flex[pts.length - 1];
        const Lp = L * Math.cos(cum);
        x += Math.sin(a) * Lp; y -= Math.cos(a) * Lp; z -= L * Math.sin(cum) * 0.5;
        pts.push([x, y, z]);
        fores.push(Math.cos(cum));
      });
      J.push(pts);
      balayer(parts, phal, 5, pts, POUCE.r.slice(1), fores, { flat: 0.8, nailW: 0.52, nOff: 0.3, pouce: true });
      bouts.push(pts[2].slice());
    }
    // plus rien sous l'établi : on relève toute la main si des doigts repliés descendent trop bas
    let zmin = Infinity;
    for (const p of parts) if (p.grp > 0) zmin = Math.min(zmin, p.za - p.ra * 0.3, p.zb - p.rb * 0.3);
    const dz0 = zmin < 1.5 ? 1.5 - zmin : 0;
    // les tendons (vers chaque jointure, visibles doigts tendus) et les veines du dos de la main
    const tendons = DOIGTS.map((fg, i) => ({ a: [X(fg.k[0] * 0.25), -16], b: [X(fg.k[0]), fg.k[1] + 12], f: 1 - Math.min(1, flex0[i] * 1.6) }));
    const veines = [
      [[-16, -8], [-19, -24], [-20, -42], [-17, -60], [-13, -72]],
      [[16, -8], [14, -26], [11, -46], [13, -64]],
      [[-19, -40], [-8, -50], [2, -60]],
    ].map((L) => L.map(([a, b]) => [X(a), b]));
    // les groupes (0 : jointures ; 1…4 : doigts ; 5 : pouce), rangés, avec leur boîte (on saute un doigt entier d'un coup)
    parts.sort((a, b) => a.grp - b.grp);
    const groupes = [];
    for (let g = 0; g < 6; g++) {
      const gp = parts.filter((p) => p.grp === g);
      if (!gp.length) { groupes.push(null); continue; }
      let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
      for (const p of gp) { gx0 = Math.min(gx0, p.x0); gx1 = Math.max(gx1, p.x1); gy0 = Math.min(gy0, p.y0); gy1 = Math.max(gy1, p.y1); }
      groupes.push({ i0: parts.indexOf(gp[0]), i1: parts.indexOf(gp[gp.length - 1]) + 1, x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of parts) { x0 = Math.min(x0, p.x0 + 4); x1 = Math.max(x1, p.x1 - 4); y0 = Math.min(y0, p.y0 + 4); y1 = Math.max(y1, p.y1 - 4); }
    x0 = Math.min(x0, -40); x1 = Math.max(x1, 40);
    const G = {
      cote, nom, parts, groupes, phal, bouts, tendons, veines, dz: dz0,
      box: [x0 - 3, y0 - 3, x1 + 3, FONDU[1] + 1],
      jointures: DOIGTS.map((fg) => [X(fg.k[0]), fg.k[1]]),
      pip: [1, 2, 3, 4].map((g) => [J[g][1][0], J[g][1][1]]),
      dip: [1, 2, 3, 4].map((g) => [J[g][2][0], J[g][2][1]]),
    };
    GEOS.set(cle, G);
    return G;
  }

  /* ======================================================================
     3. La peau d'une main (fonction de couche pour R.rendre)
     Chaque doigt (et le pouce) se raccorde au dos de la main par un congé
     (union adoucie : la palmure), mais pas à ses voisins (un pli net entre deux doigts).
     ====================================================================== */
  function distPoly(L, x, y) {
    let d = Infinity, t = 0, acc = 0;
    for (let i = 0; i < L.length - 1; i++) {
      const ax = L[i][0], ay = L[i][1], bx = L[i + 1][0], by = L[i + 1][1];
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey, l = Math.sqrt(l2);
      let u = ((x - ax) * ex + (y - ay) * ey) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const dx = x - ax - ex * u, dy = y - ay - ey * u, dd = dx * dx + dy * dy;
      if (dd < d) { d = dd; t = acc + u * l; }
      acc += l;
    }
    distPoly.t = acc ? t / acc : 0;
    return Math.sqrt(d);
  }

  function coucheMain(G, fondu = FONDU) {
    const parts = G.parts, np = parts.length, m = G.cote, dz0 = G.dz;
    const dG = new Float64Array(6), hG = new Float64Array(6), heG = new Float64Array(6);
    const bestG = new Array(6);
    const bhG = new Float64Array(6);
    const oc = [37.1, 91.7, 13.3, 55.9];
    const KD = [0, 2.6, 2.6, 2.6, 2.6, 7], KH = [4, 3.4, 3.4, 3.4, 3.4, 5.5]; // raccords : doigts serrés, pouce en large palmure
    return {
      box: G.box,
      f(x, y, S) {
        // --- le dos de la main et le poignet (analytique)
        const B = corps(x, y, m);
        // (hors du dos, sa hauteur « prolongée » retombe vite : elle ne sert qu'aux raccords tout près du bord)
        const dBody = B.d, hBodyIn = B.h + dz0, hBodyExt = B.he + dz0 - Math.max(0, dBody) * 1.6;
        let hBody = dBody < 0 ? hBodyIn : hBodyExt;
        // --- les capsules : jointures (dans le corps), doigts et pouce (par groupe)
        for (let g = 0; g < 6; g++) { dG[g] = 1e9; hG[g] = -1e9; heG[g] = -1e9; bestG[g] = null; bhG[g] = -1e9; }
        const GR = G.groupes;
        for (let g = 0; g < 6; g++) {
          const gr = GR[g];
          if (!gr || x < gr.x0 || x > gr.x1 || y < gr.y0 || y > gr.y1) continue;
          for (let q = gr.i0; q < gr.i1; q++) {
            const p = parts[q];
            if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
            const u = ((x - p.ax) * p.dx + (y - p.ay) * p.dy) / p.l2;
            const t = u < 0 ? 0 : u > 1 ? 1 : u;
            const L = p.len, sAl = u * L;
            const dp = Math.abs((x - p.ax) * p.dy - (y - p.ay) * p.dx) / L; // distance à l'axe, en travers
            const r = p.ra + (p.rb - p.ra) * t;
            let d;
            if (u < 0) d = Math.sqrt(dp * dp + sAl * sAl);
            else if (u <= 1) d = dp;
            else if (p.carre) {
              // le bout du doigt : pas une demi-boule, un arrondi plus plat (le bord de l'ongle)
              const da = (sAl - L) / 0.9;
              d = Math.pow(Math.pow(dp, 2.25) + Math.pow(da, 2.25), 1 / 2.25);
            } else d = Math.sqrt(dp * dp + (sAl - L) * (sAl - L));
            const zAx = p.za + (p.zb - p.za) * t + dz0;
            if (d - r < dG[g]) dG[g] = d - r;
            if (d < r) {
              // Le dessus exact d'une capsule inclinée vue d'en haut : entre deux calottes décalées vers
              // le haut de la pente, un cylindre étiré (q / cos α) ; les tronçons voisins se raccordent sans bourrelet.
              const qq = Math.sqrt(Math.max(0, r * r - dp * dp));
              const w = -qq * p.sinA;
              let hx;
              if (sAl - w < 0) hx = p.za + Math.sqrt(Math.max(0, qq * qq - sAl * sAl));
              else if (sAl - w > L) {
                const e = p.carre ? (sAl - L) / 0.9 : sAl - L;
                const qe = p.carre ? Math.sqrt(Math.max(0, r * r - Math.pow(Math.pow(dp, 2.25) + Math.pow(Math.max(0, e), 2.25), 2 / 2.25))) : Math.sqrt(Math.max(0, qq * qq - e * e));
                hx = p.zb + qe;
              } else hx = p.za + (sAl / L) * (p.zb - p.za) + qq / p.cosA;
              const hp = zAx + p.flat * (hx + dz0 - zAx);
              // (les tronçons d'un même doigt se recouvrent exactement : le max suffit)
              if (g === 0) hG[g] = hG[g] < -1e8 ? hp : smax(hG[g], hp, 3);
              else if (hp > hG[g]) hG[g] = hp;
              if (hp > bhG[g]) { bhG[g] = hp; bestG[g] = p; }
            } else if (heG[g] < zAx) heG[g] = zAx;
          }
        }
        // les jointures se fondent dans le dos de la main
        if (hG[0] > -1e8 && dBody < 2) hBody = smax(hBody, hG[0], 3);
        // --- l'union : chaque doigt raccordé au dos par un congé, pas aux autres doigts
        let d = dBody, h = dBody < 0 ? hBody : -1e9, dom = -1; // dom : le groupe qui domine ce pixel (−1 : le dos)
        let dOther = 1e9; // la distance au doigt le plus proche qui n'est pas le nôtre (occlusion entre les doigts)
        for (let g = 1; g < 6; g++) {
          if (dG[g] > 30) continue;
          const dg = smin(dBody, dG[g], KD[g]);
          const hf = hG[g] > -1e8 ? hG[g] : heG[g];
          // un doigt qui passe sous le dos de la main (poing) ne s'y fond pas : il resterait en « fantôme »
          // (on s'en éloigne en douceur : pas de couture)
          const fant = sstep(-0.5, -3, dBody) * sstep(hBody - 0.3, hBody - 2.5, hf);
          const hg = fant > 0 ? lerp(smax(hBody, hf, KH[g]), hBody, fant) : smax(hBody, hf, KH[g]);
          if (dg < 0.6) {
            if (dG[g] < 0.6 && (dom < 0 || hg > h)) { if (dom > 0) dOther = Math.min(dOther, dG[dom]); dom = g; } else dOther = Math.min(dOther, dG[g]);
            if (hg > h) h = hg;
          } else dOther = Math.min(dOther, dG[g]);
          if (dg < d) d = dg;
        }
        if (h < -1e8) h = hBody;
        // le raccord avec l'avant-bras : le sprite de la main s'efface sur 16 mm
        let a = 1;
        if (y > fondu[0]) a = 1 - sstep(fondu[0], fondu[1], y);
        if (a < 1) {
          const cov = Math.min(1, Math.max(0, 0.5 - d * S.ppm)) * a;
          S.d = (0.5 - cov) / S.ppm;
        } else S.d = d;
        if (S.d > S.lim) return;
        // la phalange qui domine (pour la matière : ongles, plis) : son repère « logique », de jointure à jointure
        let bp = null, bt = 0, bd = 0, br = 1, bu = 0;
        if (dom > 0 && bestG[dom] && bhG[dom] >= hBody - 0.5 && bestG[dom].art >= 0) {
          bp = G.phal[dom][bestG[dom].art];
          bu = ((x - bp.ax) * bp.dx + (y - bp.ay) * bp.dy) / bp.l2;
          bt = bu < 0 ? 0 : bu > 1 ? 1 : bu;
          const ex = x - (bp.ax + bp.dx * bt), ey = y - (bp.ay + bp.dy * bt);
          bd = Math.sqrt(ex * ex + ey * ey);
          br = bp.ra + (bp.rb - bp.ra) * bt;
        }
        // --- l'occlusion (calculée ici, pas par l'établi : les grands dénivelés des doigts repliés la saturaient)
        let ao = 1;
        // le flanc d'un doigt contre son voisin ; rien sur celui qui passe par-dessus (son voisin est dessous)
        if (dom > 0 && dOther > 0 && dOther < 6) ao *= 1 - 0.3 * Math.exp(-dOther / 1.8) * sstep(0, 0.8, dOther);
        if (dom > 0) ao *= 1 - 0.15 * sstep(0, 1.2, dBody) * sstep(0, 1.2, dG[dom]); // le creux des palmures
        // --- la matière : la peau, ses nuances
        const cBras = sstep(-10, 25, y);
        const n1 = tx(T.a, x * 0.045 + oc[0], y * 0.045 + oc[1]), n2 = tx(T.b, x * 0.16 + oc[2], y * 0.16 + oc[3]), n3 = tx(T.c, x * 0.6 + oc[1], y * 0.6 + oc[0]);
        const v = 1 + 0.065 * n1 + 0.03 * n2 + 0.014 * n3; // (des nuances : une peau n'est pas de l'argile)
        let r0 = lerp(C.peau[0], C.peauBras[0], cBras) * v, g0 = lerp(C.peau[1], C.peauBras[1], cBras) * v, b0 = lerp(C.peau[2], C.peauBras[2], cBras) * v;
        // des marbrures un peu plus rouges ou plus jaunes (la peau n'est jamais d'une seule teinte)
        const marb = n2 * 0.5 + n1 * 0.5;
        if (marb > 0) { const k = marb * 0.12; r0 += (C.rouge[0] - r0) * k; g0 += (C.rouge[1] - g0) * k; b0 += (C.rouge[2] - b0) * k; }
        else { const k = -marb * 0.18; r0 += (C.jaune[0] - r0) * k; g0 += (C.jaune[1] - g0) * k; b0 += (C.jaune[2] - b0) * k; }
        let rough = 0.5 + 0.06 * n3, f0 = 0.03, sh = 0.12;
        // rougeur des jointures (plus nette doigt plié) et des articulations
        let blush = 0;
        for (let i = 0; i < 4; i++) {
          const J = G.jointures[i], dx = x - J[0], dy = y - J[1], dd = dx * dx + dy * dy;
          if (dd < 500) blush = Math.max(blush, Math.exp(-dd / 90) * 0.3);
        }
        for (const J of G.pip) {
          const dx = x - J[0], dy = y - J[1], dd = dx * dx + dy * dy;
          if (dd < 200) blush = Math.max(blush, Math.exp(-dd / 32) * 0.3);
        }
        for (const J of G.dip) {
          const dx = x - J[0], dy = y - J[1], dd = dx * dx + dy * dy;
          if (dd < 120) blush = Math.max(blush, Math.exp(-dd / 20) * 0.2);
        }
        if (bp && bp.grp > 0 && bp.art >= 0) blush = Math.max(blush, bp.kind === 'bout' ? 0.12 + 0.15 * bt : 0.06);
        if (blush > 0) { r0 += (C.rouge[0] - r0) * blush; g0 += (C.rouge[1] - g0) * blush; b0 += (C.rouge[2] - b0) * blush; }
        // les plis fins en travers des jointures (trois ou quatre arcs, à peine) ; la peau y brille un peu plus
        const lodP = R.lod(1.1, S.ppm);
        if (lodP > 0) {
          for (let i = 0; i < 4; i++) {
            const J = G.jointures[i], dx = x - J[0], dy = y - J[1] + 2;
            if (dx * dx + dy * dy > 110) continue;
            const w = Math.exp(-(dx * dx) / 30) * Math.exp(-(dy * dy) / 26);
            const arc = dy + 0.045 * dx * dx; // (les plis s'incurvent autour de la bosse)
            const pl = Math.pow(0.5 + 0.5 * Math.cos((TAU * arc) / 2.3), 3) * w * lodP;
            h -= pl * 0.06;
            const kp = 1 - pl * 0.07;
            r0 *= kp; g0 *= kp * 0.985; b0 *= kp * 0.985;
            rough -= w * 0.06;
          }
        }
        // les doigts repliés vers l'établi : dans la pénombre, un peu plus rosés
        if (bp && bp.grp > 0 && bp.fore < 0.5) { const k = (0.5 - Math.max(-0.5, bp.fore)) * 0.05; r0 *= 1 + k; g0 *= 1 - k * 0.2; b0 *= 1 - k * 0.3; }
        // le grain de la peau (des creux minuscules) : une texture, pas du bruit
        h += 0.05 * n3 + 0.03 * tx(T.e, x * 1.3 + oc[3], y * 1.3 + oc[2]) * R.lod(0.8, S.ppm);
        // le quadrillage fin du dos de la main (deux familles de plis croisés, à peine)
        const lodQ = R.lod(1.7, S.ppm);
        if (lodQ > 0 && (dom < 0 || (bp && bp.art === 0))) {
          const w1 = x * 0.64 + y * 0.77, w2 = -x * 0.64 + y * 0.77;
          const q1 = Math.pow(Math.abs(Math.sin((w1 + 2.2 * n2) * 1.85)), 12), q2 = Math.pow(Math.abs(Math.sin((w2 + 2.2 * n1) * 1.85)), 12);
          const qd = Math.max(q1, q2) * lodQ * (0.55 + 0.45 * n3);
          h -= qd * 0.05;
          r0 *= 1 - qd * 0.022; g0 *= 1 - qd * 0.026; b0 *= 1 - qd * 0.026;
        }
        // tendons et veines, sur le dos de la main seulement (pas sur les doigts ni sur le raccord)
        if (dom < 0 && dBody < 0 && y < 2) {
          let tend = 0;
          for (const Td of G.tendons) {
            if (Td.f <= 0) continue;
            const ex = Td.b[0] - Td.a[0], ey = Td.b[1] - Td.a[1], l2 = ex * ex + ey * ey;
            const u = ((x - Td.a[0]) * ex + (y - Td.a[1]) * ey) / l2;
            if (u <= 0 || u >= 1) continue;
            const ddx = x - Td.a[0] - ex * u, ddy = y - Td.a[1] - ey * u;
            const dd = ddx * ddx + ddy * ddy;
            if (dd > 40) continue;
            tend = Math.max(tend, Math.exp(-dd / 9) * Math.pow(Math.sin(Math.PI * u), 0.8) * Td.f);
          }
          h += tend * 0.32;
          let vein = 0;
          for (const V of G.veines) {
            const dv = distPoly(V, x, y);
            if (dv < 7) vein = Math.max(vein, Math.exp(-(dv * dv) / 11) * Math.sin(Math.PI * Math.min(1, distPoly.t)));
          }
          if (vein > 0) {
            h += vein * 0.3;
            const kv2 = vein * 0.08;
            r0 += (C.veine[0] - r0) * kv2; g0 += (C.veine[1] - g0) * kv2; b0 += (C.veine[2] - b0) * kv2;
          }
          // un peu plus jaune sur les os du poignet et les métacarpiens tendus
          const jo = sstep(0.1, 0.9, tend) * 0.2;
          if (jo > 0) { r0 += (C.jaune[0] - r0) * jo; g0 += (C.jaune[1] - g0) * jo; b0 += (C.jaune[2] - b0) * jo; }
        }
        // les plis fins au dos des articulations (doigts tendus) : ce qui fait « vrai » sans faire de bosse
        if (bp && bp.grp > 0 && bp.grp < 5 && bp.art >= 0 && bp.art < 2 && bp.fore > 0.2) {
          const aj = (bu - 1) * bp.len; // mm depuis l'articulation (négatif : avant)
          const lim = bp.art === 0 ? [-7, 1.5, 2.1, 0.22] : [-4, 1, 1.6, 0.15];
          if (aj > lim[0] && aj < lim[1]) {
            const wx = ((x - bp.ax) * bp.dy - (y - bp.ay) * bp.dx) / bp.len, qq = wx / br;
            if (qq * qq < 0.5) {
              const s = aj + 0.18 * qq * qq * br;
              const env = Math.exp(-Math.pow((aj - (lim[0] + lim[1]) / 2) / ((lim[1] - lim[0]) * 0.42), 2)) * (1 - qq * qq * 2);
              const pli = Math.pow(0.5 + 0.5 * Math.cos((TAU * s) / lim[2]), 3) * env * Math.min(1, (bp.fore - 0.2) * 1.6) * (bp.fore > 0.5 ? 1 : 0.7);
              h -= pli * lim[3];
              const kp = 1 - pli * 0.12;
              r0 *= kp; g0 *= kp * 0.98; b0 *= kp * 0.98;
            }
          }
        }
        // les ongles : courts, une plaque lisse et un peu brillante, la lunule sur le pouce, un liseré au bord
        if (bp && bp.kind === 'bout' && bp.fore > 0.5) {
          const vu = sstep(0.5, 0.72, bp.fore); // un ongle vu par la tranche : on l'estompe
          const L = bp.len, rr = bp.rb;
          const along = bu * L, c0 = L * (bp.pouce ? 0.4 : 0.5), c1 = L + rr * 0.74;
          if (along > c0 - 1.5 && along < c1 + 1.5 && bd < br) {
            // l'axe « en travers », orienté vers l'extérieur de la main (le pouce montre son ongle de biais)
            let px = bp.dy / bp.len, py = -bp.dx / bp.len;
            if (px * m > 0) { px = -px; py = -py; }
            const wx = (x - bp.ax) * px + (y - bp.ay) * py;
            const off = bp.nOff * rr;
            const ea = (along - (c0 + c1) / 2) / ((c1 - c0) / 2), eb = (wx - off) / (rr * bp.nailW);
            const eaC = ea + 0.3 * eb * eb; // la cuticule : un arc
            const qn = Math.pow(Math.abs(eaC), 2.8) + Math.pow(Math.abs(eb), 2.4);
            if (qn < 1.3) {
              const inside = 1 - sstep(0.8, 1, qn);
              const repli = sstep(1.3, 1.0, qn) * (1 - inside); // le bourrelet de peau autour de l'ongle
              const s = (along - c0) / (c1 - c0);
              let nr = C.ongle[0], ng = C.ongle[1], nb = C.ongle[2];
              const lun = bp.pouce ? 1 - sstep(0.1, 0.24, s + 0.1 * eb * eb) : 1 - sstep(0.03, 0.12, s + 0.12 * eb * eb);
              if (lun > 0) { nr += (C.lunule[0] - nr) * lun * 0.75; ng += (C.lunule[1] - ng) * lun * 0.75; nb += (C.lunule[2] - nb) * lun * 0.75; }
              const libre = sstep(L + rr * 0.56, L + rr * 0.68, along);
              if (libre > 0) { nr += (C.bordOngle[0] - nr) * libre; ng += (C.bordOngle[1] - ng) * libre; nb += (C.bordOngle[2] - nb) * libre; }
              // un peu de crasse d'atelier sous le bord libre et à la cuticule
              const cr = Math.max(R.trait(along - (L + rr * 0.6), 0.4, 1 / S.ppm) * 0.4, sstep(-0.66, -0.92, eaC) * inside * 0.3) * vu;
              if (cr > 0) { nr += (C.crasse[0] - nr) * cr; ng += (C.crasse[1] - ng) * cr; nb += (C.crasse[2] - nb) * cr; }
              const iv = inside * vu;
              r0 += (nr - r0) * iv; g0 += (ng - g0) * iv; b0 += (nb - b0) * iv;
              h += iv * (0.3 + 0.35 * Math.sqrt(Math.max(0, 1 - eb * eb * 0.85))) + repli * 0.1;
              rough = lerp(rough, 0.2, iv);
              f0 = lerp(f0, 0.042, iv);
              // le sillon autour de la plaque : un liseré plus sombre, qui dessine l'ongle
              const sil = Math.exp(-Math.pow((qn - 1) / 0.09, 2));
              if (sil > 0.01) { const k = 1 - sil * 0.12 * vu; r0 *= k; g0 *= k * 0.97; b0 *= k * 0.97; ao *= 1 - sil * 0.12 * vu; }
            }
          }
        }
        S.z = h;
        S.r = r0; S.g = g0; S.b = b0;
        S.ro = rough; S.f0 = f0; S.sh = sh; S.ev = 0.5; S.ao = ao;
      },
    };
  }

  /* ======================================================================
     4. L'avant-bras : le profil, les tatouages, la montre (à gauche), la manche remontée
     ====================================================================== */
  const TAT = new Map();
  /* les tatouages, dessinés dans le repère de la peau : s (mm le long de la surface, en travers, 0 au milieu du dessus,
     + vers l'auriculaire) et v (mm depuis le poignet). Des motifs simples au trait, sans texte ni logo. */
  function* tatouages(cote) {
    if (TAT.has(cote)) return TAT.get(cote);
    const box = [-64, 50, 64, 262];
    const M = yield* R.masqueG(box, 4, (g) => {
      g.lineWidth = 0.85;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const etoile = (x, y, r, n = 5) => {
        g.beginPath();
        for (let k = 0; k <= n * 2; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / n, rr = k % 2 ? r * 0.45 : r;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
      };
      const points = (x0, y0, x1, y1, pas, r = 0.55) => {
        const l = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(l / pas);
        for (let k = 0; k <= n; k++) { g.beginPath(); g.arc(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, r, 0, TAU); g.fill(); }
      };
      if (cote > 0) {
        // --- bras droit : une rose, une petite basket montante, des étoiles, un bandeau pointillé
        g.save();
        g.translate(4, 150);
        g.beginPath(); // le cœur de la rose, en spirale
        for (let k = 0; k < 60; k++) {
          const a = k * 0.32, rr = 0.6 + k * 0.1;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.9;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
        [[0, -9, 10, 0.2, 2.9], [8, -2, 9.5, 1.3, 4.2], [-8, -1, 9.5, -1.2, 1.9], [5, 7, 9, 2.3, 5.1], [-5, 7, 9, 0.9, 3.6], [0, 1, 13.5, 0.4, 2.8]].forEach(([cx, cy, r, a0, a1]) => {
          g.beginPath();
          g.arc(cx * 0.8, cy * 0.8, r, a0, a1);
          g.stroke();
        });
        const feuille = (x, y, a, l) => {
          g.save(); g.translate(x, y); g.rotate(a);
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, -l * 0.34, l, 0); g.quadraticCurveTo(l * 0.5, l * 0.34, 0, 0); g.stroke();
          g.beginPath(); g.moveTo(l * 0.1, 0); g.lineTo(l * 0.85, 0); g.stroke();
          g.restore();
        };
        g.beginPath(); g.moveTo(1, 13); g.bezierCurveTo(-3, 26, 4, 38, -1, 52); g.stroke();
        feuille(0, 24, 2.6, 17);
        feuille(1, 33, 0.35, 15);
        g.restore();
        // la basket montante, vue de côté, au trait
        g.save();
        g.translate(-24, 88);
        g.rotate(-0.12);
        g.beginPath();
        g.moveTo(-19, 8); g.lineTo(19, 8); g.quadraticCurveTo(22, 8, 21.5, 5); g.lineTo(-19.5, 5); g.quadraticCurveTo(-21, 6.5, -19, 8);
        g.stroke();
        g.beginPath();
        g.moveTo(-19.5, 5); g.quadraticCurveTo(-20, -1, -16, -3); g.lineTo(-4, -5); g.lineTo(6, -17); g.lineTo(13, -18);
        g.quadraticCurveTo(17, -12, 18, -4); g.quadraticCurveTo(21, 0, 21.5, 5);
        g.stroke();
        g.beginPath(); g.moveTo(-13, 5); g.quadraticCurveTo(-13, -1, -8, -2.5); g.stroke();
        g.beginPath(); g.moveTo(6, -17); g.quadraticCurveTo(10, -9, 12, 5); g.stroke();
        for (let k = 0; k < 5; k++) {
          const px = -3 + k * 2.1, py = -6 - k * 2.3;
          g.beginPath(); g.moveTo(px - 1.6, py - 1); g.lineTo(px + 1.6, py + 1); g.stroke();
        }
        g.restore();
        etoile(30, 104, 3.4);
        etoile(-31, 197, 2.8);
        etoile(34, 206, 2.4);
        etoile(-8, 118, 1.8);
        g.beginPath(); g.moveTo(-64, 236); g.lineTo(64, 236); g.moveTo(-64, 244); g.lineTo(64, 244); g.stroke();
        for (let s = -62; s <= 62; s += 5) { g.beginPath(); g.arc(s, 240, 0.7, 0, TAU); g.fill(); }
        points(-40, 70, -6, 62, 3.2, 0.45);
      } else {
        // --- bras gauche : les puys (le puy de Dôme et son antenne), une rose des vents, des vagues
        g.save();
        g.translate(2, 176);
        g.beginPath(); // la ligne des puys (les sommets vers la main)
        g.moveTo(-46, 0);
        g.quadraticCurveTo(-38, -6, -31, -8);
        g.quadraticCurveTo(-26, -9, -23, -6);
        g.quadraticCurveTo(-18, -2, -14, -6);
        g.quadraticCurveTo(-6, -19, 0, -20);
        g.quadraticCurveTo(7, -19, 14, -8);
        g.quadraticCurveTo(18, -3, 22, -9);
        g.quadraticCurveTo(26, -13, 31, -9);
        g.lineTo(33, -11); g.lineTo(35, -9);
        g.quadraticCurveTo(40, -4, 46, 0);
        g.stroke();
        g.beginPath(); g.moveTo(0, -20); g.lineTo(0, -29); g.moveTo(-1.6, -25.5); g.lineTo(1.6, -25.5); g.stroke();
        g.beginPath(); g.arc(0, -30.2, 0.9, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(-50, 3); g.lineTo(50, 3); g.stroke();
        g.beginPath(); g.arc(-25, -26, 5.5, 0, TAU); g.stroke();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU;
          g.beginPath(); g.moveTo(-25 + Math.cos(a) * 7.5, -26 + Math.sin(a) * 7.5); g.lineTo(-25 + Math.cos(a) * 10, -26 + Math.sin(a) * 10); g.stroke();
        }
        g.restore();
        g.save();
        g.translate(12, 104);
        g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.stroke();
        g.beginPath(); g.arc(0, 0, 10.5, 0, TAU); g.stroke();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU - Math.PI / 2, l = k % 2 ? 9 : 17, w = k % 2 ? 1.6 : 2.6;
          g.beginPath();
          g.moveTo(Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w);
          g.lineTo(Math.cos(a) * l, Math.sin(a) * l);
          g.lineTo(Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w);
          g.stroke();
        }
        g.beginPath(); g.arc(0, 0, 1.1, 0, TAU); g.fill();
        g.restore();
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          for (let s = -64; s <= 64; s += 1) {
            const py = 226 + k * 6 + Math.sin(s * 0.28 + k * 0.9) * 1.8;
            if (s > -64) g.lineTo(s, py); else g.moveTo(s, py);
          }
          g.stroke();
        }
        etoile(-30, 128, 2.6);
        etoile(34, 150, 2.2);
        points(-20, 70, 30, 76, 3.4, 0.45);
      }
    });
    // l'encre a un peu bavé sous la peau, avec les années (par tranches : le masque est grand)
    yield* R.flouG(M.data, M.w, M.h, 0.38 * M.res);
    TAT.set(cote, M);
    return M;
  }

  /* partie : 'peau' (l'avant-bras, jusque sous l'ourlet de la manche) ou 'manche' (la manche seule, en demi-définition) */
  function coucheBras(cote, M, v1, partie, longueur) {
    const oc = cote > 0 ? [11.2, 73.4, 29.9, 140.2] : [201.7, 18.3, 88.8, 6.6];
    const montre = cote < 0;
    const MC = { x: 0, y: 44, R: 19, Rv: 15.6 }; // la montre : centre, boîtier, verre
    const v0 = partie === 'manche' ? COUDE - 8 : -8;
    if (partie !== 'manche') v1 = longueur ? Math.min(COUDE + 10, longueur) : COUDE + 10;
    return {
      box: [-58, v0, 58, v1],
      f(x, y, S) {
        const v = y;
        if (v < v0 || v > v1) { S.d = 9; return; }
        const ax = x < 0 ? -x : x;
        const n1 = tx(T.a, x * 0.04 + oc[0], v * 0.04 + oc[1]), n2 = tx(T.b, x * 0.14 + oc[2], v * 0.14 + oc[3]), n3 = tx(T.c, x * 0.5 + oc[1], v * 0.5 + oc[2]);
        // --- la manche remontée (coton sombre, plis en anneaux au coude), puis la manche du haut du bras
        const dansManche = v > COUDE - 4 + 3 * tx(T.b, x * 0.05 + oc[1], 3.1);
        if (partie === 'manche' && !dansManche) { S.d = 9; return; }
        if (dansManche) {
          const u = v - COUDE;
          const bourrelet = (1 - sstep(40, 95, u)) * (0.7 + 0.3 * sstep(0, 12, u));
          const plis = Math.sin(u * 0.21 + 2.4 * tx(T.b, x * 0.03 + oc[2], v * 0.015)) * bourrelet;
          const long = Math.sin(x * 0.13 + v * 0.018 + 2 * tx(T.a, x * 0.02, v * 0.01 + oc[3])) * (1 - bourrelet);
          const rS = 47 + 3.2 * bourrelet + 2.2 * plis + 0.8 * long;
          let d = ax - rS;
          d = Math.max(d, v - v1);
          S.d = d;
          if (d > S.lim) return;
          const zS = zBras(Math.min(v, 280)) + 4 + 0.06 * Math.max(0, v - 280);
          S.z = zS + 0.76 * Math.sqrt(Math.max(0, rS * rS - ax * ax)) + 1.6 * plis + 0.9 * long + 0.4 * n2;
          const k = 1 + 0.08 * n1 + 0.05 * plis;
          S.r = C.manche[0] * k; S.g = C.manche[1] * k; S.b = C.manche[2] * k;
          S.ro = 0.92; S.f0 = 0.02; S.sh = 0.45; S.ev = 0.4;
          const ourlet = sstep(4, 0, Math.abs(u - 1.5)) * 0.9; // l'ourlet roulé, à l'entrée de la manche
          if (ourlet > 0) { S.z += ourlet * 1.2; S.r *= 1 + ourlet * 0.25; S.g *= 1 + ourlet * 0.25; S.b *= 1 + ourlet * 0.25; }
          return;
        }
        // --- la peau de l'avant-bras
        const r = rBras(v);
        let d = ax - r;
        d = Math.max(d, -6 - v); // coupé net sous la main (caché par le sprite de la main)
        if (longueur && v > v1 - 34) { // raccourci (un gros plan) : il s'efface sur ses 34 derniers mm
          const cov = Math.min(1, Math.max(0, 0.5 - d * S.ppm)) * (1 - sstep(v1 - 34, v1 - 2, v));
          d = (0.5 - cov) / S.ppm;
        }
        S.d = d;
        if (d > S.lim) return;
        const q = Math.min(1, ax / r);
        let z = zBras(v) + fBras(v) * Math.sqrt(Math.max(0, r * r - ax * ax));
        // les muscles, à peine : le long supinateur côté pouce vers le coude, le sillon du cubitus côté auriculaire
        const xm = x * cote;
        z += 2.2 * Math.exp(-Math.pow((xm + 17) / 12, 2)) * sstep(110, 230, v) - 0.9 * Math.exp(-Math.pow((xm - 21) / 5, 2)) * sstep(60, 160, v);
        z += 0.05 * n3;
        const kv = 1 + 0.05 * n1 + 0.025 * n2;
        let r0 = C.peauBras[0] * kv, g0 = C.peauBras[1] * kv, b0 = C.peauBras[2] * kv;
        const marb = n2 * 0.5 + n1 * 0.5;
        if (marb > 0) { const k = marb * 0.12; r0 += (C.rouge[0] - r0) * k; g0 += (C.rouge[1] - g0) * k; b0 += (C.rouge[2] - b0) * k; }
        else { const k = -marb * 0.14; r0 += (C.jaune[0] - r0) * k; g0 += (C.jaune[1] - g0) * k; b0 += (C.jaune[2] - b0) * k; }
        // l'intérieur de l'avant-bras, plus pâle, qu'on devine sur les bords
        const bordI = sstep(0.75, 1, q);
        r0 *= 1 + bordI * 0.04; g0 *= 1 + bordI * 0.05; b0 *= 1 + bordI * 0.06;
        // des poils fins, couchés vers le poignet (une texture, pas des traits)
        const poil = sstep(0.35, 0.8, tx(T.e, x * 0.9 + oc[0], v * 0.16 + oc[1])) * R.lod(0.7, S.ppm) * (1 - bordI) * sstep(20, 70, v);
        if (poil > 0) { const k = 1 - poil * 0.1; r0 *= k; g0 *= k; b0 *= k * 0.98; }
        // les veines de l'avant-bras
        const vn = Math.max(
          Math.exp(-Math.pow(x - (-12 + 7 * Math.sin(v * 0.02 + 1)) * cote, 2) / 6) * sstep(40, 90, v) * (1 - sstep(170, 230, v)),
          Math.exp(-Math.pow(x - (14 + 5 * Math.sin(v * 0.026)) * cote, 2) / 5) * sstep(60, 120, v) * (1 - sstep(150, 200, v)) * 0.8,
        );
        if (vn > 0.01) { z += vn * 0.28; r0 += (C.veine[0] - r0) * vn * 0.07; g0 += (C.veine[1] - g0) * vn * 0.07; b0 += (C.veine[2] - b0) * vn * 0.07; }
        // les tatouages : l'encre bleu-noir passée, qui suit l'arrondi du bras
        if (v > 48 && v < 264) {
          const s = r * Math.asin(Math.max(-1, Math.min(1, x / r))) * 0.94;
          const t = M.get(s * cote, v);
          if (t > 0.01) {
            const k = Math.min(1, t) * (0.62 + 0.1 * n1) * (1 - bordI * 0.4);
            r0 += (C.encre[0] - r0) * k; g0 += (C.encre[1] - g0) * k; b0 += (C.encre[2] - b0) * k;
          }
        }
        let rough = 0.52 + 0.05 * n3, f0 = 0.028, sh = 0.12, me = 0, ao = 1;
        // --- la montre (poignet gauche) : bracelet de cuir orange, boîtier d'acier, cadran crème
        if (montre && v > 24 && v < 64) {
          const dm = Math.hypot(x - MC.x, v - MC.y);
          const zPeau = z;
          const e = 10.2 - Math.abs(v - MC.y); // le bracelet fait le tour du poignet
          if (e > -1 || dm < MC.R + 0.5) {
            if (e > -1) {
              const bb = clamp01(e * S.ppm + 0.5);
              const zB = zPeau + 2.2 * Math.sqrt(clamp01(e / 1.2));
              z = lerp(z, zB, bb);
              const kb = 1 + 0.06 * tx(T.c, x * 0.4 + oc[3], v * 0.4);
              r0 = lerp(r0, C.bracelet[0] * kb, bb); g0 = lerp(g0, C.bracelet[1] * kb, bb); b0 = lerp(b0, C.bracelet[2] * kb, bb);
              rough = lerp(rough, 0.46, bb); f0 = lerp(f0, 0.035, bb); sh = lerp(sh, 0.05, bb);
              const cout = R.trait(e - 1.6, 0.45, 1 / S.ppm) * ((((x * 0.9) % 2) + 2) % 2 < 1.2 ? 1 : 0);
              if (cout > 0) { r0 += (C.couture[0] - r0) * cout; g0 += (C.couture[1] - g0) * cout; b0 += (C.couture[2] - b0) * cout; z -= cout * 0.15; }
              if (e < 0.6 && e > -1) ao *= 0.75 + 0.25 * clamp01(-e); // l'ombre du bracelet sur la peau
              // les pattes du boîtier
              if (Math.abs(Math.abs(x) - 20) < 3.5 && Math.abs(Math.abs(v - MC.y) - 6.5) < 2.2) {
                z = zPeau + 6.5; r0 = 0.5; g0 = 0.49; b0 = 0.47; me = 1; rough = 0.2;
              }
            }
            if (dm < MC.R + 0.5) {
              const cb = clamp01((MC.R - dm) * S.ppm + 0.5);
              const zBoitier = zPeau + 9.5;
              let zz, rr = 0.52, gg = 0.5, bbb = 0.48, mm = 1, ro = 0.14;
              if (dm > MC.Rv) { // la lunette polie, arrondie vers l'extérieur
                const qq = (dm - MC.Rv) / (MC.R - MC.Rv);
                zz = zBoitier + 1.2 * Math.sqrt(Math.max(0, 1 - qq * qq)) - 3.5 * qq * qq;
              } else { // le verre bombé sur le cadran
                const qq = dm / MC.Rv;
                zz = zBoitier + 1.2 + 0.7 * (1 - qq * qq);
                rr = C.cadran[0]; gg = C.cadran[1]; bbb = C.cadran[2]; mm = 0; ro = 0.06;
                // les index et les aiguilles (10 h 10) ; midi vers l'extérieur du poignet, 3 h vers la main
                const ang = Math.atan2(-(v - MC.y), -(x - MC.x)); // 0 : midi (−x), sens horaire à l'écran
                const phi = ((ang % TAU) + TAU) % TAU;
                const k12 = Math.round(phi / (TAU / 12)), dphi = Math.abs(phi - k12 * (TAU / 12)) * dm;
                const ind = dm > 11.6 && dm < 14.2 && dphi < (k12 % 3 === 0 ? 0.75 : 0.45) ? 1 : 0;
                const aig = (a, l, w) => {
                  const ux = -Math.cos(a), uy = -Math.sin(a);
                  const px = x - MC.x, py = v - MC.y;
                  const al = px * ux + py * uy, trv = Math.abs(px * uy - py * ux);
                  return al > -2 && al < l && trv < w * (1 - (al / l) * 0.5) ? 1 : 0;
                };
                const hA = ((10 + 10 / 60) / 12) * TAU, mA = (10 / 60) * TAU;
                const aa = Math.max(ind, aig(hA, 8.5, 0.9), aig(mA, 12.5, 0.65), dm < 1.2 ? 1 : 0);
                if (aa > 0) { rr = C.aiguille[0]; gg = C.aiguille[1]; bbb = C.aiguille[2]; }
              }
              z = lerp(z, zz, cb);
              r0 = lerp(r0, rr, cb); g0 = lerp(g0, gg, cb); b0 = lerp(b0, bbb, cb);
              me = lerp(me, mm, cb); rough = lerp(rough, ro, cb); f0 = lerp(f0, 0.04, cb); sh = lerp(sh, 0, cb);
            }
            // la couronne, à 3 h (vers la main)
            const dc = Math.hypot(x - MC.x, v - (MC.y - MC.R - 1.6));
            if (dc < 2.3) { const c = clamp01((2.3 - dc) * S.ppm); z = lerp(z, zPeau + 7, c); r0 = lerp(r0, 0.5, c); g0 = lerp(g0, 0.49, c); b0 = lerp(b0, 0.47, c); me = lerp(me, 1, c); rough = lerp(rough, 0.25, c); }
          }
        }
        S.z = z;
        S.r = r0; S.g = g0; S.b = b0;
        S.ro = rough; S.f0 = f0; S.sh = sh; S.me = me; S.ev = me > 0.5 ? 1 : 0.5; S.ao = ao;
      },
    };
  }

  // (banc d'essai : ?debug=soleil0,cavite0 coupe une étape du rendu)
  const DEBUG = {};
  try { (new URLSearchParams(location.search).get('debug') || '').split(',').forEach((k) => { const m = k.match(/^([a-z]+)(\d)$/); if (m) DEBUG[m[1]] = +m[2]; }); } catch (e) { /* rien */ }

  /* ======================================================================
     5. Les sprites
     ====================================================================== */
  const LONG_BRAS = 470; // l'avant-bras et la manche : de quoi sortir du cadre
  /* un peu de lumière sous la peau : dans ses ombres, la peau tire vers le rouge, pas vers le gris
     (après l'éclairage ; seulement sur ce qui a la teinte de la peau : ni l'encre, ni le bracelet, ni le cadran).
     Sur l'image éclairée elle-même, avant qu'elle n'aille dans le canvas (R.rendre : apres) : aucune relecture */
  function* sousPeau(img, force = 1, filets = false) {
    const w = img.width, h = img.height, d = img.data;
    const src = new Uint8ClampedArray(d);
    const PLEIN = 250;
    // 1. Les filets (la main seulement) : là où deux pièces se chevauchent de très près (le bout d'un doigt replié
    //    qui dépasse à peine de la phalange du dessus, deux doigts serrés), il reste des lignes d'un ou deux pixels,
    //    pointillées, plus sombres ou plus claires que les deux côtés : on les comble (par la moyenne des deux côtés).
    //    Un bord franc (un côté clair, l'autre sombre) ne bouge pas.
    if (filets) {
      const Y = new Uint8Array(w * h);
      for (let q = 0, i = 0; q < w * h; q++, i += 4) Y[q] = (src[i] * 77 + src[i + 1] * 151 + src[i + 2] * 28) >> 8;
      const PAS = [1, w, w + 1, w - 1], T = 9, T2 = 12;
      for (let j = 2; j < h - 2; j++) {
        for (let x = 2; x < w - 2; x++) {
          const q = j * w + x;
          if (src[q * 4 + 3] < PLEIN) continue;
          const yq = Y[q];
          let best = 0, qa = 0, qb = 0, wa = 0.5;
          for (let k = 0; k < 4; k++) {
            const st = PAS[k];
            for (let m = 0; m < 3; m++) {
              const a2 = q - (m === 2 ? 2 : 1) * st, b2 = q + (m === 1 ? 2 : 1) * st;
              if (src[a2 * 4 + 3] < PLEIN || src[b2 * 4 + 3] < PLEIN) continue;
              const ya = Y[a2], yb = Y[b2], da = ya - yq, db = yb - yq;
              if (!((da > T && db > T) || (da < -T && db < -T)) || Math.abs(ya - yb) > T2) continue;
              const e = Math.min(Math.abs(da), Math.abs(db));
              if (e > best) { best = e; qa = a2; qb = b2; wa = m === 0 ? 0.5 : m === 1 ? 2 / 3 : 1 / 3; }
            }
          }
          if (best) {
            const i = q * 4, ia = qa * 4, ib = qb * 4, wb = 1 - wa;
            d[i] = src[ia] * wa + src[ib] * wb; d[i + 1] = src[ia + 1] * wa + src[ib + 1] * wb; d[i + 2] = src[ia + 2] * wa + src[ib + 2] * wb;
          }
        }
        if (R.assez()) yield;
      }
    }
    // 2. Le liseré : sur les pixels du bord (couverture partielle), le moteur calcule une normale rasante (la pente
    //    vers le vide) : un filet pointillé, clair ou sombre, qui se voit en gros plan. Ils prennent la couleur de
    //    l'intérieur tout proche (leur transparence ne change pas : l'anticrénelage reste).
    for (let j = 0; j < h; j++) {
      for (let x = 0; x < w; x++) {
        const i = (j * w + x) * 4, a = src[i + 3];
        if (a === 0 || a >= PLEIN) continue;
        let sr = 0, sg = 0, sb = 0, sw = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = j + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const k = (yy * w + xx) * 4, ak = src[k + 3];
            if (ak < PLEIN) continue;
            const wt = 1 / (1 + dx * dx + dy * dy);
            sr += d[k] * wt; sg += d[k + 1] * wt; sb += d[k + 2] * wt; sw += wt;
          }
        }
        if (sw > 0) { d[i] = sr / sw; d[i + 1] = sg / sw; d[i + 2] = sb / sw; }
      }
      if (R.assez()) yield;
    }
    for (let j = 0; j < h; j++) {
      for (let i = j * w * 4, n = (j + 1) * w * 4; i < n; i += 4) {
        if (d[i + 3] < 8) continue;
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (!(r > gg && gg > b)) continue;
        const sat = (r - b) / (r + 1);
        if (sat < 0.18 || sat > 0.62) continue;
        const lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
        if (lum < 0.12 || lum > 0.62) continue;
        const s = ((0.62 - lum) / 0.5) * Math.min(1, (lum - 0.12) / 0.08) * force;
        d[i] = Math.min(255, r + 17 * s);
        d[i + 1] = Math.min(255, gg + 7 * s);
        d[i + 2] = Math.max(0, b - 1 * s);
      }
      if ((j & 7) === 7 && R.assez()) yield;
    }
  }

  function* main(cote, pose, o = {}) {
    yield* tuiles();
    const G = geometrie(cote, pose);
    const t0 = now();
    // boite (facultatif) : on ne calcule qu'une partie de la main (repère de la main, mm) — un gros plan n'en montre qu'un bout
    const B = o.boite ? [Math.max(G.box[0], o.boite[0]), Math.max(G.box[1], o.boite[1]), Math.min(G.box[2], o.boite[2]), Math.min(G.box[3], o.boite[3])] : G.box;
    // (coupée avant le poignet : elle s'efface sur ses 18 derniers mm, pas de bord net)
    const couche = coucheMain(G, o.boite && o.boite[3] < FONDU[1] ? [o.boite[3] - 18, o.boite[3]] : FONDU);
    if (o.boite) couche.box = B;
    const sp = yield* R.rendre({
      ppm: o.ppm || 2, angle: o.angle || 0,
      box: B,
      couches: [couche],
      cavite: DEBUG.cavite === 0 ? false : [0.8, 0.05], soleil: DEBUG.soleil === 1 ? 1.5 : false, wrap: 0.38, // (pas d'ombres propres : sur les bords raides des doigts pliés, elles font des stries)
      ombre: { opacite: 0.5, contact: 0.26, doux: 1.25 },
      oeil: o.oeil ? { x: o.oeil[0], y: o.oeil[1] } : undefined,
      apres: (img) => sousPeau(img, 1, true),
    });
    sp.id = 'main:' + cote + ':' + pose;
    sp.t.tout = now() - t0;
    sp.cote = cote;
    sp.pose = pose;
    return sp;
  }
  function* bras(cote, o = {}) {
    yield* tuiles();
    const M = yield* tatouages(cote);
    const t0 = now();
    const lg = o.longueur ? Math.min(COUDE + 10, o.longueur) : COUDE + 10;
    const sp = yield* R.rendre({
      ppm: o.ppm || 2, angle: o.angle || 0,
      box: [-58, -8, 58, lg],
      couches: [coucheBras(cote, M, LONG_BRAS, 'peau', o.longueur)],
      cavite: [2.5, 0.06], soleil: 1.6, wrap: 0.38,
      ombre: { opacite: 0.46, contact: 0.2, doux: 1.4 },
      oeil: o.oeil ? { x: o.oeil[0], y: o.oeil[1] } : undefined,
      apres: (img) => sousPeau(img, 0.8),
    });
    sp.id = 'bras:' + cote;
    sp.t.tout = now() - t0;
    sp.cote = cote;
    return sp;
  }
  /* la manche (coton sombre, plis) : on la pose sur l'avant-bras ; demi-définition, elle est floue et sombre */
  function* manche(cote, o = {}) {
    yield* tuiles();
    const t0 = now();
    const sp = yield* R.rendre({
      ppm: (o.ppm || 2) * 0.5, angle: o.angle || 0,
      box: [-58, COUDE - 8, 58, LONG_BRAS],
      couches: [coucheBras(cote, null, LONG_BRAS, 'manche')],
      cavite: [3, 0.06], soleil: 2, wrap: 0.38,
      ombre: { opacite: 0.46, contact: 0.2, doux: 1.4 },
    });
    sp.id = 'manche:' + cote;
    sp.t.tout = now() - t0;
    return sp;
  }

  /* Le téléphone (IndexedDB) : ranger / sortir un sprite. R.deballer rend l'ombre sans son image (les mesures de
     l'ombre écrasent l'ombre reconstruite) : on la redécode ici ; et on garde ce que R.emballer oublie (les réglages
     de l'ombre, qui règlent le flou des ombres soulevées, le côté, la pose). Partagé avec co-process.js et co-clouage.js. */
  const coffre = {
    ranger(cle, sp) {
      return R.emballer(sp).then((x) => x && R.coffre.put(cle, Object.assign(x, {
        plus: { ombreOpts: sp.ombreOpts || null, id: sp.id || null, cote: sp.cote || null, pose: sp.pose || null, numero: sp.numero || null },
      }))).catch(() => null);
    },
    sortir(cle) {
      return R.coffre.get(cle).then(async (x) => {
        if (!x) return null;
        const sp = await R.deballer(x);
        if (!sp) return null;
        if (sp.ombre && !sp.ombre.canvas) {
          const oc = x.ombre && x.m && x.m.ombre ? await R.deCoffre(x.ombre) : null;
          sp.ombre = oc ? Object.assign({ canvas: oc }, x.m.ombre) : null;
        }
        if (x.plus) for (const n of Object.keys(x.plus)) if (x.plus[n] != null && sp[n] == null) sp[n] = x.plus[n];
        return sp;
      }).catch(() => null);
    },
  };

  /* le cache : la mémoire, et le téléphone (IndexedDB, comme les outils) */
  const VERSION_MAINS = 'mains-20';
  const q = (v, s) => Math.round(v / s) * s;
  function cleDe(quoi, cote, pose, o) {
    return [VERSION_MAINS, quoi, cote, quoi === 'main' ? pose : '-', q(o.ppm || 2, 0.05).toFixed(2), q(((o.angle || 0) * 180) / Math.PI, 0.5).toFixed(1)].join('|') + (o.boite ? '|' + o.boite.join(',') : '') + (o.longueur && quoi === 'bras' ? '|L' + Math.round(o.longueur) : '');
  }
  const enCours = new Map();
  function preparer(quoi, cote, pose, o = {}, prio = 1) {
    const k = cleDe(quoi, cote, pose, o);
    const c = R.cache.get(k);
    if (c) return Promise.resolve(c);
    if (enCours.has(k)) return calcul.presser(enCours.get(k), prio); // (demandé à nouveau, plus pressé : il passe devant)
    const opts = Object.assign({}, o, { ppm: q(o.ppm || 2, 0.05), angle: (q(((o.angle || 0) * 180) / Math.PI, 0.5) * Math.PI) / 180 });
    const sansCoffre = o.sansCoffre || /[?&]nocache\b/.test(location.search);
    const gen = (function* () {
      let v = null;
      if (!sansCoffre) {
        const box = { v: undefined };
        yield coffre.sortir('mn|' + k).then((x) => { box.v = x; });
        v = box.v;
      }
      if (v) return v;
      const sp = quoi === 'bras' ? yield* bras(cote, opts) : quoi === 'manche' ? yield* manche(cote, opts) : yield* main(cote, pose, opts);
      if (!sansCoffre) coffre.ranger('mn|' + k, sp);
      return sp;
    })();
    const pl = calcul.lancer(gen, prio, quoi + ':' + cote + ':' + (pose || ''));
    const p = pl.then((sp) => { enCours.delete(k); return R.cache.set(k, sp); }, (e) => { enCours.delete(k); throw e; });
    p.job = pl.job;
    enCours.set(k, p);
    return p;
  }

  /* ======================================================================
     6. Les points utiles : la prise, le bout des doigts
     ====================================================================== */
  function bout(cote, pose, doigt) {
    const G = geometrie(cote, pose);
    return G.bouts[doigt].slice();
  }
  /* le point de prise d'une pose (repère de la main, mm) : ce que la main tient y est centré */
  function prise(cote, pose) {
    const G = geometrie(cote, pose), m = cote;
    if (G._prise) return G._prise;
    let p;
    if (pose === 'pince' || pose === 'clou' || pose === 'lache') {
      const a = G.bouts[0], b = G.bouts[4];
      p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    } else if (pose === 'stylo') {
      // le pinceau se tient à la virole, sous le bout de l'index : c'est là qu'on le cale
      const a = G.bouts[0], b = G.bouts[4];
      p = [a[0] * 0.85 + b[0] * 0.15, a[1] * 0.85 + b[1] * 0.15];
    } else if (pose === 'poing') p = [-4 * m, -92];
    else if (pose === 'maillet') p = [-40 * m, -105]; // là où le manche sort du poing, entre le pouce et l'index
    else if (pose === 'brosse') p = [-6 * m, -76];
    else if (pose === 'tient') p = [-4 * m, -104];
    else p = [-6 * m, -70];
    G._prise = p;
    return p;
  }

  /* ======================================================================
     7. Une main vivante : où elle est, ce qu'elle fait, ce qu'on dessine
     ====================================================================== */
  /**
   * new Main(cote, { ppm, angle0, epaule: [x, y] }) ; main.placer({ x, y, pose, pose2, mix, levee, plie })
   *   (x, y) : où va le point de prise (mm, repère de la scène) ; l'avant-bras vise l'épaule (hors champ).
   *   pose2 / mix : la pose suivante et son fondu (0..1) ; plie : le poignet (rad, en plus de l'avant-bras)
   * main.elements() → [{ sp, x, y, rot, alpha, levee, quoi }] : l'avant-bras puis la main (ou les deux poses)
   */
  function Main(cote, o = {}) {
    this.cote = cote;
    this.ppm = o.ppm || 2;
    this.angle0 = o.angle0 != null ? o.angle0 : -0.33 * cote; // l'angle auquel les sprites sont calculés
    this.epaule = o.epaule || [230 * cote, 560];
    this.sp = { bras: null, poses: {} };
    this.e = { x: 0, y: 0, rot: 0, rotB: 0, pose: 'repos', pose2: null, mix: 0, levee: 0, leveeB: 0, vis: true };
  }
  Main.prototype = {
    charger(poses, prio = 1, opts = {}) {
      const ps = [];
      const o = Object.assign({ ppm: this.ppm, angle: this.angle0 }, opts);
      if (!this.sp.bras) ps.push(preparer('bras', this.cote, null, o, prio + 0.5).then((s) => { this.sp.bras = s; }));
      if (!this.sp.manche) ps.push(preparer('manche', this.cote, null, o, prio + 0.4).then((s) => { this.sp.manche = s; }));
      for (const p of poses) if (!this.sp.poses[p]) ps.push(preparer('main', this.cote, p, o, prio).then((s) => { this.sp.poses[p] = s; }));
      return Promise.all(ps);
    },
    pret(pose) { return !!(this.sp.bras && this.sp.manche && this.sp.poses[pose]); },
    /** le poignet tel que le point de prise tombe en (x, y) ; l'avant-bras vise l'épaule */
    placer({ x, y, pose = 'repos', pose2 = null, mix = 0, levee = 0, leveeB = null, plie = 0, vis = true }) {
      const pr1 = prise(this.cote, pose);
      const pr2 = pose2 ? prise(this.cote, pose2) : pr1;
      const k = sstep(0, 1, mix);
      const px = lerp(pr1[0], pr2[0], k), py = lerp(pr1[1], pr2[1], k);
      let wx = x, wy = y + 90, rot = 0, rotB = 0;
      for (let i = 0; i < 4; i++) {
        rotB = Math.atan2(-(this.epaule[0] - wx), this.epaule[1] - wy);
        rot = rotB + plie;
        const c = Math.cos(rot), s = Math.sin(rot);
        wx = x - (px * c - py * s);
        wy = y - (px * s + py * c);
      }
      const e = this.e;
      e.x = wx; e.y = wy; e.rot = rot; e.rotB = rotB;
      e.pose = pose; e.pose2 = pose2; e.mix = mix; e.levee = levee; e.leveeB = leveeB == null ? levee * 0.55 : leveeB; e.vis = vis;
      return e;
    },
    /** un point du repère de la main → la scène */
    point(dx, dy) {
      const e = this.e, c = Math.cos(e.rot), s = Math.sin(e.rot);
      return [e.x + dx * c - dy * s, e.y + dx * s + dy * c];
    },
    elements() {
      const e = this.e, out = [];
      if (!e.vis) return out;
      if (this.sp.bras) out.push({ sp: this.sp.bras, x: e.x, y: e.y, rot: e.rotB, alpha: 1, levee: e.leveeB, quoi: 'bras' });
      if (this.sp.manche) out.push({ sp: this.sp.manche, x: e.x, y: e.y, rot: e.rotB, alpha: 1, levee: e.leveeB, quoi: 'manche' });
      // la pose dominante est opaque dessous ; la suivante se fond par-dessus (jamais de main transparente) ;
      // à mi-chemin, les deux à moitié : là où elles se recouvrent, rien ne saute
      let base = e.pose, over = null, w = 0;
      if (e.pose2 && e.mix > 0) {
        if (e.mix < 0.5) { over = e.pose2; w = e.mix; } else { base = e.pose2; over = e.pose; w = 1 - e.mix; }
      }
      const sb = this.sp.poses[base] || this.sp.poses[over] || this.sp.poses.repos;
      if (sb) out.push({ sp: sb, x: e.x, y: e.y, rot: e.rot, alpha: 1, levee: e.levee, quoi: 'main' });
      const so = over && this.sp.poses[over];
      if (so && so !== sb && w > 0.01) out.push({ sp: so, x: e.x, y: e.y, rot: e.rot, alpha: w, levee: e.levee, quoi: 'main' });
      return out;
    },
  };

  CO.Mains = {
    POSES: NOMS,
    main, bras, manche, preparer, prise, bout, geometrie, Main, calcul, coffre,
    cle: cleDe,
    COUDE, LONG_BRAS, FONDU,
  };
})();
