/* ==========================================================================
   Cordo 63 — l'enseigne en 3D : une Air Jordan 1 High sculptée dans le bois
   Comme l'enseigne drapeau de la boutique : bois clair poncé, empiècements en
   léger relief bordés de surpiqûres incisées, bout perforé, œillets percés,
   pointe en bas dans un cadre en tube d'acier anthracite qui sort du mur.
   Le cadre, son bras et la broche sont fixes (vus de trois-quarts depuis la rue) ;
   la chaussure tourne lentement sur la broche, sans fin, et on la relance du doigt.
   Tout est calculé ici, au chargement : la forme (un « loft » de sections le
   long de la chaussure, tenu par son profil), les cartes de sculpture (reliefs,
   coutures, perforations, traces de gouge), le bois (cernes 3D d'une bille,
   fibres, nœuds, taches) et un petit moteur WebGL maison. Aucune dépendance.
     CO.Jordan.create(host, { mode, pose, interactive, nuit, yaw }) → Promise<api>
       mode   'enseigne' (cadre, bras, broche ; la platine murale est celle de la façade) | 'seule'
       pose   'pointe' (pointe en bas, comme la vraie) | 'posee' (sur sa semelle)
       yaw    angle de départ de la chaussure (rad ; 0 = de profil, parallèle au mur)
       api    { canvas, setNuit(b), tourner(v) (élan en rad/s), entree() → Promise,
                pause(), reprise(), detruire(), on('toc' | 'tourne', fn), yaw, stats }
       'tourne' reçoit le yaw de la chaussure (nombre, rad, ]−π, π]) : l'ombre de la façade le suit.
   Marques : aucun texte ni logo (ni « NIKE », ni « AIR », ni Jumpman, ni le
   médaillon « Wings » : le col reste lisse). Le swoosh n'est qu'un empiècement,
   retirable d'une ligne (SWOOSH ci-dessous).
   ========================================================================== */
(function () {
  'use strict';

  const CO = (window.CO = window.CO || {});

  /* ---------- Réglages ---------- */
  // false : le swoosh devient une bande neutre (même principe de couture, sans sa forme)
  const SWOOSH = true;
  /* ======================================================================
     L'usine : toute la géométrie de la sculpture, calculée d'un bloc.
     Fonction autonome (aucune référence extérieure) : sa source est recopiée
     telle quelle dans un Worker créé depuis un Blob (compatible file://) ;
     sans Worker, elle tourne dans la page.
       base(P)      → maillages de départ + ce qu'il faut pour dessiner les cartes
       relief(C)    → applique les cartes (déplacement), occlusion, tampons finaux
     Unités : cm. X du talon vers la pointe, Y vers le haut, Z vers l'extérieur
     (côté du swoosh visible sur l'enseigne ; chaussure droite).
     ====================================================================== */
  function coJordanUsine() {
    'use strict';
    const PI = Math.PI;
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, t) => a + (b - a) * t;
    const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const ST = 10; // flottants par sommet : position, normale, aux (occlusion, côté/abscisse, …)

    /* Interpolation monotone (Fritsch–Carlson) d'une table [[x, y], …], bornée aux extrémités */
    function courbe(pts) {
      const n = pts.length, X = pts.map((p) => p[0]), Y = pts.map((p) => p[1]), d = [], m = [];
      for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
      m[0] = d[0]; m[n - 1] = d[n - 2];
      for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
      for (let i = 0; i < n - 1; i++) {
        if (!d[i]) { m[i] = m[i + 1] = 0; continue; }
        const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
        if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
      }
      return (x) => {
        if (x <= X[0]) return Y[0];
        if (x >= X[n - 1]) return Y[n - 1];
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const k = (lo + hi) >> 1; if (X[k] > x) hi = k; else lo = k; }
        const h = X[hi] - X[lo], t = (x - X[lo]) / h, t2 = t * t, t3 = t2 * t;
        return (2 * t3 - 3 * t2 + 1) * Y[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (3 * t2 - 2 * t3) * Y[hi] + (t3 - t2) * h * m[hi];
      };
    }

    /* Catmull-Rom (ouverte ou fermée), k points par segment */
    function lisse(P, k, ferme) {
      const n = P.length, out = [];
      const at = (i) => P[ferme ? ((i % n) + n) % n : clamp(i, 0, n - 1)];
      const segs = ferme ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        for (let j = 0; j < k; j++) {
          const t = j / k, t2 = t * t, t3 = t2 * t;
          out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3)));
        }
      }
      if (!ferme) out.push(P[n - 1].slice());
      return out;
    }

    /* Paramétrage à abscisse curviligne : s ∈ [0, 1] → [x, y] */
    function abscisse(poly) {
      const n = poly.length, L = new Float64Array(n);
      for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
      const f = (s) => {
        const q = clamp(s, 0, 1) * L[n - 1];
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const k = (lo + hi) >> 1; if (L[k] > q) hi = k; else lo = k; }
        const t = (q - L[lo]) / Math.max(1e-9, L[hi] - L[lo]);
        return [lerp(poly[lo][0], poly[hi][0], t), lerp(poly[lo][1], poly[hi][1], t)];
      };
      f.long = L[n - 1];
      return f;
    }

    /* Polyligne plate [x0, y0, x1, y1, …] → N points régulièrement espacés, écrits dans out à partir du point o */
    function reech(src, N, out, o) {
      const n = src.length / 2;
      if (n < 2) { for (let k = 0; k < N; k++) { out[2 * (o + k)] = src[0]; out[2 * (o + k) + 1] = src[1]; } return; }
      const L = new Float64Array(n);
      for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(src[2 * i] - src[2 * i - 2], src[2 * i + 1] - src[2 * i - 1]);
      const tot = L[n - 1];
      let j = 0;
      for (let k = 0; k < N; k++) {
        const q = N > 1 ? (k / (N - 1)) * tot : 0;
        while (j < n - 2 && L[j + 1] < q) j++;
        const t = clamp((q - L[j]) / Math.max(1e-9, L[j + 1] - L[j]), 0, 1);
        out[2 * (o + k)] = lerp(src[2 * j], src[2 * j + 2], t);
        out[2 * (o + k) + 1] = lerp(src[2 * j + 1], src[2 * j + 3], t);
      }
    }

    /* ======================================================================
       Les mesures (relevées sur des vues de profil et de dessous d'une AJ1 High,
       puis adaptées à la sculpture : un peu plus trapue, arêtes adoucies)
       ====================================================================== */
    // la semelle vue de dessus : talon rond (r ≈ 4 cm), cambrure côté intérieur, bout rond (r ≈ 4,5 cm)
    const CONTOUR = [
      [0, 0], [0.1, 0.88], [0.39, 1.66], [0.82, 2.33], [1.26, 2.72], [2.13, 3.25], [3.0, 3.56], [3.9, 3.78],
      [4.7, 3.92], [6.5, 4.12], [8.6, 4.3], [10.8, 4.52], [13.0, 4.98], [15.1, 5.44], [17.3, 5.8], [19.5, 5.95],
      [21.6, 5.82], [23.8, 5.38], [26.0, 4.72], [27.52, 4.02], [28.42, 3.42], [29.12, 2.7], [29.62, 1.86], [29.9, 1.04],
      [30.02, 0],
      [29.9, -1.04], [29.62, -1.84], [29.12, -2.66], [28.42, -3.3], [27.52, -3.86], [26.0, -4.14], [23.8, -4.45],
      [21.6, -4.5], [19.5, -4.2], [17.3, -3.6], [15.1, -2.95], [13.0, -2.75], [10.8, -2.85], [8.6, -3.25], [6.5, -3.62],
      [4.7, -3.78], [3.9, -3.8], [3.0, -3.72], [2.13, -3.46], [1.26, -2.92], [0.82, -2.42], [0.39, -1.66], [0.1, -0.88],
    ];
    const EPAIS = courbe([[0, 3.72], [1.5, 3.6], [3, 3.42], [5, 3.22], [8, 2.95], [12, 2.56], [16, 2.4], [20, 2.3], [24, 2.24], [27, 2.04], [29, 1.66], [30.1, 1.42]]);
    const yDessous = (x) => (x <= 20 ? 0 : 1.1 * Math.pow(Math.min(1.02, (x - 20) / 10), 2.2)); // relevé de la pointe
    const yDessus = (x) => yDessous(x) + EPAIS(x);
    const RAINURE = courbe([[0, 1.02], [3, 0.8], [7, 0.58], [18, 0.52], [24, 0.6], [27, 0.86], [29, 1.12], [30.1, 1.22]]);

    // profil de la tige : l'arrière (talon → col), la ligne du haut (col, œillère, dessus du bout), le nez
    const DOS = [[0.35, yDessus(0.35) - 0.15], [0.36, 4.0], [0.4, 4.7], [0.44, 5.5], [0.52, 6.25], [0.62, 7.0], [0.72, 7.6],
      [0.82, 8.2], [0.93, 8.85], [1.07, 9.5], [1.25, 10.2], [1.45, 10.9], [1.64, 11.6], [1.79, 12.3], [1.9, 13.0],
      [2.01, 13.55], [2.14, 14.05], [2.3, 14.4], [2.5, 14.65]];
    const HAUT_PTS = [[2.5, 14.65], [3.0, 14.95], [4.0, 15.27], [4.8, 15.5], [5.6, 15.75], [6.4, 16.0], [7.2, 16.27], [7.9, 16.5],
      [8.6, 16.72], [9.3, 16.86], [10.3, 16.92], [11.0, 16.78], [11.5, 16.35], [12.0, 15.55], [12.6, 14.6], [13.4, 13.65],
      [14.4, 12.55], [15.5, 11.35], [16.5, 10.35], [17.5, 9.45], [18.5, 8.65], [19.5, 7.95], [20.5, 7.4], [21.5, 7.0],
      [22.5, 6.75], [23.5, 6.55], [24.5, 6.37], [25.5, 6.18], [26.5, 5.98], [27.3, 5.78], [28.0, 5.5], [28.5, 5.22], [28.85, 4.95]];
    const HAUT = courbe(HAUT_PTS);
    const NEZ = [[29.7, yDessus(29.7) - 0.15], [29.74, 2.8], [29.72, 3.3], [29.58, 3.85], [29.35, 4.35], [29.1, 4.7], [28.85, 4.95]];
    // la languette (profil fermé), qui dépasse du col à l'avant de l'ouverture
    const LANGUE = [[9.2, 12.0], [9.25, 14.2], [9.35, 15.8], [9.5, 16.7], [9.75, 17.3], [10.15, 17.75], [10.7, 18.02], [11.3, 18.02],
      [11.78, 17.72], [12.08, 17.2], [12.32, 16.5], [12.58, 15.7], [12.85, 14.85], [13.2, 13.9], [13.5, 13.0], [12.0, 12.2]];

    // réglages de la section, le long de la chaussure (abscisse du haut de la station)
    const LARG_HAUT = courbe([[2.5, 2.9], [4.0, 3.12], [9.0, 3.2], [11, 3.2], [14, 3.25], [17, 3.5], [19.5, 3.95], [21, 4.25], [24, 4.5], [27, 4.3], [29, 3.2]]);
    const EPAULE = courbe([[2.5, 0.95], [3.3, 0.85], [9.4, 0.85], [10.4, 0.85], [13, 0.95], [17, 1.15], [19.5, 1.55], [21, 2.15], [24, 2.7], [27, 2.85], [29, 2.3]]);
    const GALBE = courbe([[0, 0.12], [8, 0.1], [12, 0.04], [18, 0.04], [22, 0.12], [27, 0.15], [30, 0.05]]);
    const FENTE = courbe([[9.4, 1.72], [12, 1.62], [15, 1.5], [18, 1.3], [19.8, 0.95], [20.8, 0.45], [21.3, 0]]); // la languette entre les œillères
    const COL = { x: 6.45, l: 3.2, a: 2.1, p: 4.6 }; // l'ouverture du col (ovale vu de dessus) et sa profondeur

    /* Contour de la semelle : échantillonné, normales, et largeurs de la tige (en retrait de 3 mm) */
    function contour(n) {
      const fin = lisse(CONTOUR, 12, true), ab = abscisse(fin.concat([fin[0]]));
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(ab(i / n));
      const nr = pts.map((p, i) => {
        const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        return [tz, -tx]; // à droite de la marche : le contour tourne dans le sens horaire (vu de dessus, Z vers le haut)
      });
      // oriente vers l'extérieur (le point latéral du milieu doit avoir une normale en +Z)
      let k = 0;
      for (let i = 0; i < n; i++) if (Math.abs(pts[i][0] - 15) < Math.abs(pts[k][0] - 15) && pts[i][1] > 0) k = i;
      if (nr[k][1] < 0) nr.forEach((v) => { v[0] = -v[0]; v[1] = -v[1]; });
      return { pts, nr, long: ab.long };
    }

    /* Tables X → demi-largeur (côtés extérieur et intérieur) d'un contour en retrait */
    function largeurs(ct, retrait) {
      const lat = [], med = [];
      let xmin = 1e9, xmax = -1e9;
      ct.pts.forEach((p, i) => {
        const x = p[0] - ct.nr[i][0] * retrait, z = p[1] - ct.nr[i][1] * retrait;
        (z >= 0 ? lat : med).push([x, Math.abs(z)]);
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
      });
      // les deux pointes (talon, bout) appartiennent aux deux côtés, à largeur nulle
      lat.push([xmin, 0], [xmax, 0]); med.push([xmin, 0], [xmax, 0]);
      const prep = (arr) => {
        arr.sort((a, b) => a[0] - b[0]);
        const x0 = arr[0][0], x1 = arr[arr.length - 1][0], N = 600, T = new Float32Array(N + 1);
        let j = 0;
        for (let k = 0; k <= N; k++) {
          const x = x0 + ((x1 - x0) * k) / N;
          while (j < arr.length - 2 && arr[j + 1][0] < x) j++;
          const a = arr[j], b = arr[j + 1] || a;
          T[k] = lerp(a[1], b[1], clamp((x - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1));
        }
        return (x) => {
          if (x <= x0 || x >= x1) return 0;
          const f = ((x - x0) / (x1 - x0)) * N, i = Math.floor(f);
          return lerp(T[i], T[Math.min(N, i + 1)], f - i);
        };
      };
      return { lat: prep(lat), med: prep(med), x0: xmin, x1: xmax };
    }

    /* N valeurs de [0, 1] réparties selon une densité (plus serrées là où elle est forte) */
    function distribue(N, rho) {
      const M = 4000, C = new Float64Array(M + 1);
      for (let i = 1; i <= M; i++) C[i] = C[i - 1] + rho((i - 0.5) / M);
      const out = new Float64Array(N);
      let j = 0;
      for (let k = 0; k < N; k++) {
        const q = (k / (N - 1)) * C[M];
        while (j < M - 1 && C[j + 1] < q) j++;
        out[k] = (j + clamp((q - C[j]) / Math.max(1e-12, C[j + 1] - C[j]), 0, 1)) / M;
      }
      out[0] = 0; out[N - 1] = 1;
      return out;
    }

    /* Normales lissées d'un maillage (somme des faces) */
    function normales(V, I, n) {
      const A = new Float32Array(n * 3);
      for (let t = 0; t < I.length; t += 3) {
        const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3, a = I[t] * ST, b = I[t + 1] * ST, c = I[t + 2] * ST;
        const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
        const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        A[ia] += nx; A[ia + 1] += ny; A[ia + 2] += nz;
        A[ib] += nx; A[ib + 1] += ny; A[ib + 2] += nz;
        A[ic] += nx; A[ic + 1] += ny; A[ic + 2] += nz;
      }
      for (let q = 0; q < n; q++) {
        const x = A[q * 3], y = A[q * 3 + 1], z = A[q * 3 + 2], l = Math.hypot(x, y, z) || 1;
        V[q * ST + 3] = x / l; V[q * ST + 4] = y / l; V[q * ST + 5] = z / l;
      }
    }

    /* Grille (rangées × colonnes) → triangles ; fermee : la dernière colonne rejoint la première */
    function indicesGrille(nr, nc, fermee) {
      const cols = fermee ? nc : nc - 1, I = new Uint32Array((nr - 1) * cols * 6);
      let n = 0;
      for (let i = 0; i < nr - 1; i++) {
        for (let j = 0; j < cols; j++) {
          const j1 = (j + 1) % nc, a = i * nc + j, b = (i + 1) * nc + j, c = i * nc + j1, d = (i + 1) * nc + j1;
          I[n++] = a; I[n++] = b; I[n++] = c;
          I[n++] = b; I[n++] = d; I[n++] = c;
        }
      }
      return I;
    }

    /* ---------- Une demi-section de la tige, dans son plan : d (du centre vers le côté), h (du bas vers le haut) ----------
       côté (bas → épaule arrondie → faîte), puis intérieur (faîte → lèvre → paroi → fond → centre) :
       l'ouverture du col, le creux de la languette entre les œillères, ou un dessus plein (bout). */
    function demiSection(s, KS, KI, out) {
      const cote = [], dedans = [], hS = s.H - s.Rs;
      for (let i = 0; i <= 36; i++) {
        const t = i / 36;
        cote.push(s.d0 + (s.dT - s.d0) * Math.pow(t, 1.12) + s.galbe * Math.sin(PI * t), hS * t);
      }
      for (let i = 1; i <= 20; i++) {
        const th = (i / 20) * PI * 0.5;
        cote.push(s.dT - s.Rs + s.Rs * Math.cos(th), hS + s.Rs * Math.sin(th));
      }
      const dr = s.dT - s.Rs;
      dedans.push(dr, s.H);
      if (s.D > 1e-3 && s.a > 1e-3) {
        const lip = s.a + s.Ri, hb = s.H - s.D + s.Rb;
        if (dr - lip > 1e-4) dedans.push(lip, s.H);
        for (let i = 1; i <= 10; i++) { const th = PI * 0.5 + (i / 10) * PI * 0.5; dedans.push(lip + s.Ri * Math.cos(th), s.H - s.Ri + s.Ri * Math.sin(th)); }
        if (s.H - s.Ri - hb > 1e-4) dedans.push(s.a, hb);
        for (let i = 1; i <= 10; i++) { const th = -(i / 10) * PI * 0.5; dedans.push(s.a - s.Rb + s.Rb * Math.cos(th), hb + s.Rb * Math.sin(th)); }
        if (s.a - s.Rb > 1e-4) dedans.push(0, s.H - s.D);
      } else dedans.push(0, s.H);
      reech(cote, KS, out, 0);
      reech(dedans, KI, out, KS - 1);
    }

    /* ---------- La tige ---------- */
    function tige(P, W) {
      const NU = P.nu, KS = P.ks, KI = P.ki, K = KS + KI - 1, NT = 2 * K - 1;
      const dos = abscisse(lisse(DOS, 8, false)), nez = abscisse(lisse(NEZ, 8, false));
      const BL = DOS[0], TL = DOS[DOS.length - 1], BR = NEZ[0], TR = NEZ[NEZ.length - 1];
      // stations serrées aux deux bouts et aux extrémités de l'ouverture du col
      const us = distribue(NU, (u) => 1 + 3 * Math.exp(-((u / 0.035) ** 2)) + 3 * Math.exp(-(((1 - u) / 0.035) ** 2))
        + 1.5 * Math.exp(-(((u - 0.025) / 0.015) ** 2)) + 1.5 * Math.exp(-(((u - 0.27) / 0.02) ** 2)));
      const V = new Float32Array(NU * NT * ST);
      const NV = 40, cx = new Float64Array(NV), cy = new Float64Array(NV), ca = new Float64Array(NV);
      const sL = new Float64Array(2 * K), sM = new Float64Array(2 * K);
      const info = []; // par station : repères utiles aux cartes
      for (let i = 0; i < NU; i++) {
        const u = us[i], XB = lerp(BL[0], BR[0], u), YB = yDessus(XB) - 0.15, XT = lerp(TL[0], TR[0], u), YT = HAUT(XT);
        // la station : courbe de Coons entre le bas (semelle) et le haut (profil), tenue par le dos et le nez
        for (let k = 0; k < NV; k++) {
          const v = k / (NV - 1), L = dos(v), R = nez(v);
          cx[k] = (1 - v) * XB + v * XT + (1 - u) * L[0] + u * R[0] - ((1 - u) * (1 - v) * BL[0] + u * (1 - v) * BR[0] + (1 - u) * v * TL[0] + u * v * TR[0]);
          cy[k] = (1 - v) * YB + v * YT + (1 - u) * L[1] + u * R[1] - ((1 - u) * (1 - v) * BL[1] + u * (1 - v) * BR[1] + (1 - u) * v * TL[1] + u * v * TR[1]);
          ca[k] = k ? ca[k - 1] + Math.hypot(cx[k] - cx[k - 1], cy[k] - cy[k - 1]) : 0;
        }
        const H = ca[NV - 1];
        const wl = W.lat(XB), wm = W.med(XB), zc = 0.5 * (wl - wm) * 0.85 * sst(10, 18, XB);
        const bout = Math.min(1, Math.min(wl, wm) / 1.5);
        // l'ouverture : le col creusé, puis la languette en retrait entre les œillères
        let a, D, Ri, Rb;
        if (XT < 9.4) {
          const q = Math.min(1, Math.abs(XT - COL.x) / COL.l);
          a = COL.a * Math.sqrt(1 - q * q); D = COL.p * Math.sqrt(Math.max(0, 1 - Math.pow(q, 5))); Ri = 0.42; Rb = Math.min(1.3, a);
        } else {
          a = FENTE(XT); D = 0.32 * (1 - sst(20.6, 21.3, XT)); Ri = Rb = D / 2;
        }
        const demi = (d0, out) => {
          const dT = lerp(Math.min(LARG_HAUT(XT), d0 * 1.1), d0 * 0.965, sst(19.5, 22, XT));
          const Rs = Math.max(0.001, Math.min(EPAULE(XT), 0.92 * dT, 0.75 * H));
          const s = { d0, dT, H, Rs, galbe: GALBE(XB) * bout, a: 0, D: 0, Ri: 0, Rb: 0 };
          s.a = Math.max(0, Math.min(a, dT - Rs - Ri - 0.08));
          s.D = D * sst(0, 0.5, s.a);
          s.Ri = Ri; s.Rb = Math.min(Rb, s.a);
          if (s.Ri + s.Rb > s.D) { const k = s.D / Math.max(1e-6, s.Ri + s.Rb); s.Ri *= k; s.Rb *= k; }
          demiSection(s, KS, KI, out);
          return s;
        };
        const qL = demi(Math.max(0, wl - zc), sL), qM = demi(Math.max(0, wm + zc), sM);
        info.push({ u, XB, XT, H, zc, qL, qM });
        // en 3D : (d, h) → point de la station à la hauteur h, décalé de ±d
        let seg = 0;
        const put = (j, d, h, side, k) => {
          const hh = clamp(h, 0, H);
          seg = 0;
          let lo = 0, hi = NV - 1;
          while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ca[m] > hh) hi = m; else lo = m; }
          const t = (hh - ca[lo]) / Math.max(1e-9, ca[hi] - ca[lo]);
          const o = (i * NT + j) * ST;
          V[o] = lerp(cx[lo], cx[hi], t); V[o + 1] = lerp(cy[lo], cy[hi], t); V[o + 2] = zc + side * d;
          // occlusion : le fond du col, le pied de la tige contre la semelle
          const creux = k >= KS ? 1 - 0.75 * sst(0.15, 3.6, H - h) : 1;
          V[o + 6] = creux * lerp(0.6, 1, sst(0.1, 1.25, h));
          V[o + 7] = k === K - 1 ? 0 : side;
          V[o + 9] = k >= KS ? 1 - 0.88 * sst(0.25, 2.2, H - h) : 1; // ombre portée au fond du col
        };
        for (let k = 0; k < K; k++) {
          put(k, sL[2 * k], sL[2 * k + 1], 1, k);
          if (k < K - 1) put(2 * K - 2 - k, sM[2 * k], sM[2 * k + 1], -1, k);
        }
      }
      const I = indicesGrille(NU, NT, false);
      normales(V, I, NU * NT);
      // les deux bouts (talon, nez) : les côtés s'y rejoignent, on fond leurs normales
      for (const i of [0, NU - 1]) {
        for (let k = 0; k < K - 1; k++) {
          const a = (i * NT + k) * ST, b = (i * NT + 2 * K - 2 - k) * ST;
          let x = V[a + 3] + V[b + 3], y = V[a + 4] + V[b + 4], z = V[a + 5] + V[b + 5];
          const l = Math.hypot(x, y, z) || 1;
          x /= l; y /= l; z /= l;
          V[a + 3] = V[b + 3] = x; V[a + 4] = V[b + 4] = y; V[a + 5] = V[b + 5] = z;
        }
      }
      return { V, I, NU, NT, K, KS, KI, info };
    }

    /* ---------- La languette : un profil fermé, extrudé en épaisseur, arêtes arrondies ---------- */
    function languette(P, zc) {
      const fin = lisse(LANGUE, 8, true), ab = abscisse(fin.concat([fin[0]]));
      const NO = P.nlang, Wt = 1.85, r = 0.55, pts = [];
      for (let i = 0; i < NO; i++) pts.push(ab(i / NO));
      let aire = 0;
      for (let i = 0; i < NO; i++) { const p = pts[i], q = pts[(i + 1) % NO]; aire += p[0] * q[1] - q[0] * p[1]; }
      const sg = aire > 0 ? 1 : -1; // sens trigo : la normale sortante est à droite de la marche
      const nr = pts.map((p, i) => {
        const a = pts[(i - 1 + NO) % NO], b = pts[(i + 1) % NO];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const l = Math.hypot(tx, ty) || 1;
        return [(sg * ty) / l, (-sg * tx) / l];
      });
      // profil en travers : arrondi extérieur, tranche, arrondi intérieur
      const prof = [], NA = 7, NM = 8;
      for (let k = 0; k <= NA; k++) { const th = PI * 0.5 * (1 - k / NA); prof.push([r * (1 - Math.cos(th)), Wt - r + r * Math.sin(th), Math.cos(th), Math.sin(th)]); }
      for (let k = 1; k < NM; k++) prof.push([0, (Wt - r) * (1 - (2 * k) / NM), 1, 0]);
      for (let k = 0; k <= NA; k++) { const th = -PI * 0.5 * (k / NA); prof.push([r * (1 - Math.cos(th)), -(Wt - r) + r * Math.sin(th), Math.cos(th), Math.sin(th)]); }
      const NP = prof.length, NR = 4; // + deux flancs plats (anneaux vers le centre)
      const cxm = pts.reduce((s, p) => s + p[0], 0) / NO, cym = pts.reduce((s, p) => s + p[1], 0) / NO;
      const nV = NO * NP + 2 * (NO * NR + 1), V = new Float32Array(nV * ST), I = [];
      const ao = (x, y) => lerp(0.42, 1, sst(HAUT(x) - 1.6, HAUT(x) + 0.35, y));
      let q = 0;
      for (let i = 0; i < NO; i++) {
        for (let k = 0; k < NP; k++, q++) {
          const [e, z, cn, sz] = prof[k], o = q * ST;
          V[o] = pts[i][0] - nr[i][0] * e; V[o + 1] = pts[i][1] - nr[i][1] * e; V[o + 2] = zc + z;
          V[o + 3] = nr[i][0] * cn; V[o + 4] = nr[i][1] * cn; V[o + 5] = sz;
          V[o + 6] = ao(V[o], V[o + 1]); V[o + 7] = z > 0.3 ? 1 : z < -0.3 ? -1 : 0;
        }
      }
      for (let i = 0; i < NO; i++) {
        const i1 = (i + 1) % NO;
        for (let k = 0; k < NP - 1; k++) {
          const a = i * NP + k, b = i1 * NP + k;
          I.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      // les flancs : anneaux concentriques jusqu'au centre
      for (const side of [1, -1]) {
        const base = q;
        for (let rr = 0; rr < NR; rr++) {
          const f = 1 - rr / NR;
          for (let i = 0; i < NO; i++, q++) {
            const o = q * ST, px = pts[i][0] - nr[i][0] * r, py = pts[i][1] - nr[i][1] * r;
            V[o] = cxm + (px - cxm) * f; V[o + 1] = cym + (py - cym) * f; V[o + 2] = zc + side * Wt;
            V[o + 3] = 0; V[o + 4] = 0; V[o + 5] = side; V[o + 6] = ao(V[o], V[o + 1]); V[o + 7] = side;
          }
        }
        const c = q++, oc = c * ST;
        V[oc] = cxm; V[oc + 1] = cym; V[oc + 2] = zc + side * Wt; V[oc + 5] = side; V[oc + 6] = ao(cxm, cym); V[oc + 7] = side;
        for (let rr = 0; rr < NR; rr++) {
          for (let i = 0; i < NO; i++) {
            const i1 = (i + 1) % NO, a = base + rr * NO + i, b = base + rr * NO + i1;
            // même sens de rotation vu de dehors, des deux côtés
            if (rr < NR - 1) { const a2 = a + NO, b2 = b + NO; if (side > 0) I.push(a, a2, b, b, a2, b2); else I.push(a, b, a2, b, b2, a2); } else if (side > 0) I.push(a, c, b); else I.push(a, b, c);
          }
        }
      }
      // cintrée : les bords reculent un peu, et elle s'affine vers le haut
      for (let q2 = 0; q2 < nV; q2++) {
        const o = q2 * ST, y = V[o + 1], zr = (V[o + 2] - zc) / Wt, k = sst(13.5, 17.8, y);
        V[o + 2] = zc + (V[o + 2] - zc) * (1 - 0.14 * k);
        V[o] -= 0.42 * zr * zr * k;
        V[o + 9] = 1;
      }
      const II = new Uint32Array(I);
      normales(V, II, nV);
      return { V, I: II, n: nV };
    }

    /* ---------- La semelle : le contour extrudé, arête du dessous arrondie, petit rebord sous la tige ---------- */
    function semelle(P, ct) {
      const NO = ct.pts.length, Rb = 0.34, Rt = 0.12, KB = 9;
      const S0 = [3.2, 0.15], S1 = [26.8, 0.55], sdx = S1[0] - S0[0], sdz = S1[1] - S0[1], sl2 = sdx * sdx + sdz * sdz;
      const rows = []; // [type, paramètre]
      for (let k = 0; k < KB; k++) rows.push(['f', k / KB]);
      for (let k = 0; k <= 6; k++) rows.push(['b', -PI * 0.5 + (k / 6) * PI * 0.5]);
      for (let k = 1; k <= 4; k++) rows.push(['c', k / 5]);
      for (let k = 0; k <= 4; k++) rows.push(['t', (k / 4) * PI * 0.5]);
      rows.push(['r', 0.4], ['r', 0.72]);
      const NR = rows.length, V = new Float32Array(NR * NO * ST);
      for (let r = 0; r < NR; r++) {
        const [ty, p] = rows[r];
        for (let i = 0; i < NO; i++) {
          const [x, z] = ct.pts[i], [nx, nz] = ct.nr[i], y0 = yDessous(x), t = EPAIS(x);
          let px = x, pz = z, py = y0, ao = 1;
          if (ty === 'f') { // le dessous, du squelette vers l'arête
            const tt = clamp(((x - S0[0]) * sdx + (z - S0[1]) * sdz) / sl2, 0, 1), sx = S0[0] + sdx * tt, sz = S0[1] + sdz * tt;
            const f = Math.pow(p, 0.8), ex = x - nx * Rb, ez = z - nz * Rb;
            px = sx + (ex - sx) * f; pz = sz + (ez - sz) * f; py = yDessous(px); ao = 0.92;
          } else if (ty === 'b') { px = x + nx * (Rb * Math.cos(p) - Rb); pz = z + nz * (Rb * Math.cos(p) - Rb); py = y0 + Rb + Rb * Math.sin(p); ao = 0.95; }
          else if (ty === 'c') { py = y0 + Rb + (t - Rt - Rb) * p; ao = lerp(1, 0.9, p); }
          else if (ty === 't') { px = x + nx * (Rt * Math.cos(p) - Rt); pz = z + nz * (Rt * Math.cos(p) - Rt); py = y0 + t - Rt + Rt * Math.sin(p); ao = lerp(0.88, 0.72, p / (PI * 0.5)); }
          else { px = x - nx * (Rt + (0.7 - Rt) * p); pz = z - nz * (Rt + (0.7 - Rt) * p); py = y0 + t; ao = lerp(0.62, 0.45, p); }
          const o = (r * NO + i) * ST;
          V[o] = px; V[o + 1] = py; V[o + 2] = pz; V[o + 6] = ao;
          V[o + 7] = (i / NO) * ct.long; // abscisse le long du tour (pointillés de la surpiqûre)
          V[o + 8] = ty === 'f' ? -5 : py - (y0 + RAINURE(x)); // hauteur au-dessus de la rainure
          V[o + 9] = ty === 'f' ? Math.hypot(px - x, pz - z) : y0 + t - py; // dessous : distance au bord ; sinon profondeur sous le dessus
        }
      }
      const I = indicesGrille(NR, NO, true);
      normales(V, I, NR * NO);
      // oriente vers l'extérieur (la paroi du milieu, côté latéral, doit regarder en +Z)
      const rc = KB + 7 + 1;
      let k = 0;
      for (let i = 0; i < NO; i++) if (ct.pts[i][1] > 0 && Math.abs(ct.pts[i][0] - 15) < Math.abs(ct.pts[k][0] - 15)) k = i;
      if (V[(rc * NO + k) * ST + 5] < 0) for (let q = 0; q < NR * NO; q++) { V[q * ST + 3] *= -1; V[q * ST + 4] *= -1; V[q * ST + 5] *= -1; }
      return { V, I, n: NR * NO, NR, NO };
    }

    /* ---------- Les empiècements, vus de profil (cm) : partagés avec les cartes et le dessin de repli ---------- */
    const GARDE_HAUT = [[21.35, 4.4], [22.3, 4.95], [24.0, 5.25], [26.1, 5.52], [27.3, 5.78], [28.0, 5.92], [28.8, 6.0], [30.8, 6.05]];
    const PANNEAUX = {
      // contrefort : il fait le tour du talon (déborde derrière le dos)
      contrefort: [[-0.8, 2.0], [7.55, 2.0], [7.52, 3.2], [7.45, 3.6], [7.28, 4.05], [7.08, 4.5], [6.9, 5.0], [6.7, 5.5], [6.46, 6.0],
        [6.16, 6.5], [5.72, 7.0], [4.85, 7.5], [3.65, 8.0], [2.5, 8.5], [1.5, 8.98], [0.9, 9.3], [-0.8, 9.55]],
      // le swoosh : pointe de la queue au talon, crochet sous l'œillère (coins vifs : 0 et 14)
      swoosh: [[1.3, 9.68], [2.2, 9.5], [3.6, 9.02], [4.95, 8.52], [6.35, 8.02], [8.1, 7.5], [9.6, 7.02], [10.4, 6.82], [11.2, 6.78],
        [11.85, 6.9], [12.3, 7.18], [12.52, 7.6], [12.66, 8.1], [12.76, 8.55], [12.9, 8.88], [13.2, 8.62], [13.62, 8.02], [14.02, 7.5],
        [14.32, 7.0], [14.46, 6.5], [14.48, 6.0], [14.3, 5.52], [13.92, 5.16], [13.32, 4.94], [12.62, 4.9], [11.95, 5.02], [10.98, 5.26],
        [10.0, 5.5], [9.2, 5.76], [8.5, 6.0], [7.8, 6.25], [7.1, 6.5], [6.4, 6.78], [5.8, 7.02], [4.95, 7.5], [3.65, 8.02], [2.5, 8.52],
        [1.85, 8.92], [1.5, 9.3]],
      // à la place du swoosh (SWOOSH = false) : une bande neutre, bords parallèles, bouts ronds
      neutre: [[1.25, 9.55], [2.6, 9.35], [4.5, 8.85], [6.5, 8.2], [8.5, 7.55], [10.5, 7.0], [12.4, 6.62], [13.6, 6.45], [14.2, 6.15],
        [14.3, 5.62], [13.95, 5.22], [13.3, 5.12], [11.8, 5.3], [9.8, 5.75], [7.6, 6.42], [5.5, 7.15], [3.6, 7.86], [2.0, 8.45], [1.2, 8.9], [1.0, 9.25]],
      // œillère et empiècement du milieu (une seule pièce : de la semelle au haut du col)
      oeillere: [[15.3, 1.8], [15.5, 3.0], [15.8, 3.5], [16.1, 4.0], [16.4, 4.5], [16.62, 5.0], [16.86, 5.5], [16.98, 6.0], [17.02, 6.5],
        [17.02, 6.9], [16.2, 7.45], [15.35, 7.98], [14.75, 8.5], [14.1, 9.0], [13.0, 9.45], [11.6, 9.82], [10.75, 10.15], [10.4, 10.6],
        [10.3, 11.3], [10.3, 12.0], [10.25, 12.5], [10.0, 13.5], [9.7, 14.5], [9.45, 15.4], [9.3, 16.2], [9.25, 17.3], [9.25, 19.2],
        [21.9, 19.2], [21.9, 7.3], [21.6, 6.5], [21.3, 6.0], [20.95, 5.5], [20.85, 5.0], [21.05, 4.7], [21.35, 4.4], [21.1, 3.6],
        [20.72, 2.8], [20.5, 1.8]],
      // bout rapporté / garde-boue : tout l'avant, jusqu'au bord relevé sur le bout
      garde: [[21.35, 4.4]].concat(GARDE_HAUT, [[30.8, 1.5], [20.3, 1.5], [20.5, 2.0], [20.72, 2.8], [21.1, 3.6]]),
      // empiècement du col (lisse : pas de médaillon)
      aile: [[-0.8, 10.95], [1.5, 10.85], [2.3, 10.45], [3.9, 10.05], [5.5, 9.98], [6.45, 10.02], [7.0, 10.28], [7.6, 10.7], [8.4, 11.15],
        [9.2, 11.58], [9.9, 12.02], [10.25, 12.5], [10.0, 13.5], [9.7, 14.5], [9.45, 15.4], [7.9, 15.0], [6.7, 14.5], [5.3, 14.0],
        [3.6, 13.5], [1.95, 13.0], [-0.8, 12.9]],
      // le col rembourré, en haut
      col: [[-0.8, 12.9], [1.95, 13.0], [3.6, 13.5], [5.3, 14.0], [6.7, 14.5], [7.9, 15.0], [9.45, 15.4], [9.3, 16.2], [9.25, 17.3], [9.25, 19.2], [-0.8, 19.2]],
    };
    const COINS = { swoosh: [0, 14], neutre: [], contrefort: [0, 1, 16], oeillere: [0, 9, 26, 27, 28, 34, 37], garde: [0, 8, 9, 10, 11, 12], aile: [0, 5, 11, 12, 20], col: [0, 6, 9, 10] };

    /* ---------- Profondeurs : Z de la surface extérieure, vue de profil (pour poser les détails en 3D) ---------- */
    const PR = { x0: -0.5, y0: 1.5, pas: 0.1, nx: 311, ny: 176 };
    function profondeurs(T, L) {
      const n = PR.nx * PR.ny, ZL = new Float32Array(n).fill(-99), ZM = new Float32Array(n).fill(99);
      const tri = (V, a, b, c, lat) => {
        const ax = (V[a] - PR.x0) / PR.pas, ay = (V[a + 1] - PR.y0) / PR.pas, bx = (V[b] - PR.x0) / PR.pas, by = (V[b + 1] - PR.y0) / PR.pas;
        const cx = (V[c] - PR.x0) / PR.pas, cy = (V[c + 1] - PR.y0) / PR.pas;
        const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(det) < 1e-9) return;
        const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx))), x1 = Math.min(PR.nx - 1, Math.floor(Math.max(ax, bx, cx)));
        const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy))), y1 = Math.min(PR.ny - 1, Math.floor(Math.max(ay, by, cy)));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
            if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
            const z = l1 * V[a + 2] + l2 * V[b + 2] + l3 * V[c + 2], k = y * PR.nx + x;
            if (lat) { if (z > ZL[k]) ZL[k] = z; } else if (z < ZM[k]) ZM[k] = z;
          }
        }
      };
      const { V, NU, NT, KS } = T;
      for (let i = 0; i < NU - 1; i++) {
        for (let j = 0; j < NT - 1; j++) {
          const lat = j < KS - 1, med = j >= NT - KS;
          if (!lat && !med) continue;
          const a = (i * NT + j) * ST, b = ((i + 1) * NT + j) * ST, c = (i * NT + j + 1) * ST, d = ((i + 1) * NT + j + 1) * ST;
          tri(V, a, b, c, lat); tri(V, b, d, c, lat);
        }
      }
      for (let t = 0; t < L.I.length; t += 3) {
        const a = L.I[t] * ST, b = L.I[t + 1] * ST, c = L.I[t + 2] * ST, z = L.V[a + 2] + L.V[b + 2] + L.V[c + 2];
        tri(L.V, a, b, c, z > 0);
      }
      return { ZL, ZM, grille: PR };
    }

    /* Traits du dessus : les lèvres des œillères (bord de la fente de la languette) */
    function traitsDessus(T) {
      const lat = [], med = [];
      T.info.forEach((s) => {
        if (s.XT > 9.5 && s.XT < 21.3 && s.qL.a > 0.02) {
          const YT = HAUT(s.XT);
          lat.push([s.XT, YT, s.zc + s.qL.a + s.qL.Ri]); med.push([s.XT, YT, s.zc - s.qM.a - s.qM.Ri]);
        }
      });
      return { levres: [lat, med] };
    }

    /* Perforations du bout : réparties en quinconce sur la surface même (pas en projection) */
    function perforations(T) {
      const { V, NT, K, info } = T, out = [], gh = courbe(GARDE_HAUT), PAS = 0.5;
      const pos = (i, j, k) => V[(i * NT + j) * ST + k];
      for (let m = 0; ; m++) {
        const X = 22.15 + m * 0.46;
        if (X > 27.45) break;
        let lo = 0, hi = info.length - 1;
        while (hi - lo > 1) { const q = (lo + hi) >> 1; if (info[q].XT > X) hi = q; else lo = q; }
        const i = X - info[lo].XT < info[hi].XT - X ? lo : hi;
        for (const side of [1, -1]) {
          // abscisse le long de la section, depuis le centre du dessus
          let s = 0, j = K - 1, off = (m % 2) * PAS * 0.5, k = side > 0 ? 0 : off > 0 ? 0 : 1;
          let cible = off + k * PAS;
          while (true) {
            const j2 = j - side;
            if (j2 < 0 || j2 >= NT) break;
            const seg = Math.hypot(pos(i, j2, 0) - pos(i, j, 0), pos(i, j2, 1) - pos(i, j, 1), pos(i, j2, 2) - pos(i, j, 2));
            if (s + seg >= cible) {
              const t = (cible - s) / Math.max(1e-6, seg), p = [0, 1, 2].map((c) => lerp(pos(i, j, c), pos(i, j2, c), t));
              if (p[1] < gh(p[0]) + 0.42) break;
              const nn = [3, 4, 5].map((c) => lerp(pos(i, j, c), pos(i, j2, c), t)), l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
              out.push({ p, n: [nn[0] / l, nn[1] / l, nn[2] / l], cote: side });
              k++; cible = off + k * PAS;
              continue;
            }
            s += seg; j = j2;
          }
        }
      }
      return out;
    }

    /* ---------- L'acier : générateurs ---------- */
    function maille() { return { V: [], I: [] }; }
    function sommet(M, p, n, ao) { M.V.push(p[0], p[1], p[2], n[0], n[1], n[2], ao == null ? 1 : ao, 0, 0, 0); return M.V.length / ST - 1; }
    // profil carré à coins arrondis (côté s, rayon r) : [p, q, np, nq]
    function profilCarre(s, r, nc) {
      const out = [], h = s / 2 - r;
      [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], c) => {
        for (let k = 0; k <= nc; k++) {
          const th = ((c + k / nc) * PI) / 2;
          out.push([sx * h + r * Math.cos(th), sy * h + r * Math.sin(th), Math.cos(th), Math.sin(th)]);
        }
      });
      return out;
    }
    /* Le cadre : tube carré soudé en onglets, dans le plan z = 0 (axe du tube sur le rectangle x0..x1, y0..y1) */
    function cadre(M, x0, x1, y0, y1, s, r, nAnneaux) {
      const pr = profilCarre(s, r, 4), C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      for (let b = 0; b < 4; b++) {
        const A = C[b], B = C[(b + 1) % 4], L = Math.hypot(B[0] - A[0], B[1] - A[1]), D = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
        let N = [D[1], -D[0]];
        const mx = (A[0] + B[0]) / 2 - cx, my = (A[1] + B[1]) / 2 - cy;
        if (N[0] * mx + N[1] * my < 0) N = [-N[0], -N[1]];
        const base = M.V.length / ST, NP = pr.length;
        for (let a = 0; a <= nAnneaux; a++) {
          const t = a / nAnneaux;
          for (let k = 0; k < NP; k++) {
            const [p, q, np, nq] = pr[k], sh = (2 * t - 1) * p; // onglet à 45° aux deux bouts
            const px = lerp(A[0], B[0], t) + D[0] * sh * (t === 0 || t === 1 ? 1 : 0) + N[0] * p, py = lerp(A[1], B[1], t) + D[1] * sh * (t === 0 || t === 1 ? 1 : 0) + N[1] * p;
            sommet(M, [px, py, q], [N[0] * np, N[1] * np, nq]);
          }
        }
        for (let a = 0; a < nAnneaux; a++) {
          for (let k = 0; k < NP; k++) {
            const k1 = (k + 1) % NP, i0 = base + a * NP + k, i1 = base + (a + 1) * NP + k, i2 = base + a * NP + k1, i3 = base + (a + 1) * NP + k1;
            M.I.push(i0, i1, i2, i1, i3, i2);
          }
        }
      }
    }
    /* Pavé à arêtes arrondies (centre c, demi-tailles h, rayon r) */
    function pave(M, c, h, r, nn) {
      const faces = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
        [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]]];
      faces.forEach(([n, ua, va]) => {
        const base = M.V.length / ST;
        for (let i = 0; i <= nn; i++) {
          for (let j = 0; j <= nn; j++) {
            const fu = -1 + (2 * i) / nn, fv = -1 + (2 * j) / nn;
            const p = [0, 1, 2].map((k) => n[k] * h[k] + ua[k] * fu * h[k] + va[k] * fv * h[k]);
            const q = p.map((v, k) => clamp(v, -(h[k] - r), h[k] - r));
            let d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], l = Math.hypot(d[0], d[1], d[2]);
            if (l < 1e-6) { d = n.slice(); l = 1; }
            const nr = [d[0] / l, d[1] / l, d[2] / l];
            sommet(M, [c[0] + q[0] + nr[0] * r, c[1] + q[1] + nr[1] * r, c[2] + q[2] + nr[2] * r], nr);
          }
        }
        for (let i = 0; i < nn; i++) {
          for (let j = 0; j < nn; j++) {
            const a = base + i * (nn + 1) + j, b = a + nn + 1;
            M.I.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      });
    }
    /* Cylindre (ou prisme : nseg = 6 et facettes) d'axe « ax » (0 = x, 1 = y, 2 = z), de h0 à h1, avec couvercles */
    function cylindre(M, c, ax, rayon, h0, h1, nseg, facettes, chanfrein) {
      const u = (ax + 1) % 3, v = (ax + 2) % 3, ch = chanfrein || 0;
      const P = (a, rr, h) => { const p = c.slice(); p[ax] += h; p[u] += rr * Math.cos(a); p[v] += rr * Math.sin(a); return p; };
      const Nn = (a, k) => { const n = [0, 0, 0]; n[u] = Math.cos(a); n[v] = Math.sin(a); n[ax] = k || 0; const l = Math.hypot(n[0], n[1], n[2]); return n.map((x) => x / l); };
      for (let s = 0; s < nseg; s++) {
        const a0 = (s / nseg) * PI * 2, a1 = ((s + 1) / nseg) * PI * 2, am = (a0 + a1) / 2;
        const n0 = facettes ? Nn(am) : Nn(a0), n1 = facettes ? Nn(am) : Nn(a1);
        const i0 = sommet(M, P(a0, rayon, h0 + ch), n0), i1 = sommet(M, P(a1, rayon, h0 + ch), n1);
        const i2 = sommet(M, P(a0, rayon, h1 - ch), n0), i3 = sommet(M, P(a1, rayon, h1 - ch), n1);
        M.I.push(i0, i2, i1, i1, i2, i3);
        for (const [hh, sg] of [[h0, -1], [h1, 1]]) {
          const n = [0, 0, 0]; n[ax] = sg;
          const r2 = rayon - ch, hb = sg > 0 ? h1 - ch : h0 + ch;
          if (ch > 0) { // petit chanfrein sur l'arête
            const b0 = sommet(M, P(a0, rayon, hb), Nn(facettes ? am : a0, sg)), b1 = sommet(M, P(a1, rayon, hb), Nn(facettes ? am : a1, sg));
            const t0 = sommet(M, P(a0, r2, hh), Nn(facettes ? am : a0, sg)), t1 = sommet(M, P(a1, r2, hh), Nn(facettes ? am : a1, sg));
            M.I.push(b0, t0, b1, b1, t0, t1);
          }
          const cc = sommet(M, P(0, 0, hh), n), e0 = sommet(M, P(a0, r2, hh), n), e1 = sommet(M, P(a1, r2, hh), n);
          M.I.push(cc, e0, e1);
        }
      }
    }

    /* ---------- Les poses : l'enseigne drapeau (fixe) et la chaussure sur sa broche ----------
       Repère de la scène : le mur (la devanture) est le plan z = 0, x vers la droite, y vers le haut,
       z vers la rue. Cadre, bras et broche sont fixes, dans le plan x = 0 (perpendiculaire au mur) ;
       la chaussure tourne sur la broche verticale (x = 0, z = axe[1]).
       « pointe » : pointe en bas, un peu inclinée pour que la broche entre au talon et sorte au bout.
       « posee »  : sur sa semelle, la broche en son milieu. */
    function poser(P, maillages) {
      const pointe = P.pose !== 'posee', out = { axe: [0, 0], ancre: [0, 0, 0], acier: null, entrees: [] };
      // chaussure → repère de la broche (la broche est l'axe y), matrice 4×4 par colonnes
      let m;
      if (pointe) {
        const H = [0.35, 8.6], T = [29.75, 3.9], l = Math.hypot(T[0] - H[0], T[1] - H[1]), c = (T[0] - H[0]) / l, s = (T[1] - H[1]) / l;
        const r00 = -s, r01 = c, r10 = -c, r11 = -s; // envoie la direction talon → pointe vers le bas
        m = [r00, r10, 0, 0, r01, r11, 0, 0, 0, 0, 1, 0, -(r00 * H[0] + r01 * H[1]), -(r10 * H[0] + r11 * H[1]), 0, 1];
        out.entrees = [0, -l];
      } else {
        m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -15, 0, -0.5, 1];
        out.entrees = [0, HAUT(15)];
      }
      out.mat = m;
      // l'enveloppe de la rotation : rayon maximal autour de la broche, hauteurs extrêmes
      let r2 = 0, ya = 1e9, yb = -1e9;
      maillages.forEach((M) => {
        for (let q = 0; q < M.n; q += 2) {
          const o = q * ST, x = M.V[o], y = M.V[o + 1], X = m[0] * x + m[4] * y + m[12], Y = m[1] * x + m[5] * y + m[13], Z = M.V[o + 2] + m[14];
          r2 = Math.max(r2, X * X + Z * Z); ya = Math.min(ya, Y); yb = Math.max(yb, Y);
        }
      });
      const R = Math.sqrt(r2);
      out.env = { r: R, y: [ya, yb] };
      if (P.mode === 'seule') return out;
      // l'acier, construit dans le plan de l'enseigne (x = distance au mur), puis tourné dans la scène
      // le bras fait 12 cm : vue de la rue, la chaussure qui tourne reste devant la platine
      const S = 2, h = S / 2, jeu = 1.3, xc = 12 + S + jeu + R;
      const x0 = 12 + h, x1 = xc + R + jeu + h, y0 = ya - 1.7 - h, y1 = yb + 1.7 + h;
      const A = maille();
      cadre(A, x0, x1, y0, y1, S, 0.22, 10);
      // la broche : tige ronde entre les traverses, écrous serrés contre elles, rondelles contre le bois
      cylindre(A, [xc, 0, 0], 1, 0.38, y0 + h - 0.1, y1 - h + 0.1, 16, false, 0);
      cylindre(A, [xc, 0, 0], 1, 0.72, y1 - h - 0.5, y1 - h, 6, true, 0.06);
      cylindre(A, [xc, 0, 0], 1, 0.72, y0 + h, y0 + h + 0.5, 6, true, 0.06);
      cylindre(A, [xc, 0, 0], 1, 0.95, out.entrees[0] - 0.02, out.entrees[0] + 0.14, 20, false, 0);
      cylindre(A, [xc, 0, 0], 1, 0.95, out.entrees[1] - 0.14, out.entrees[1] + 0.02, 20, false, 0);
      // le bras : du mur (la platine est dessinée par la façade) au montant côté mur, dans le haut du cadre
      const yArm = y1 + h - 0.125 * (y1 - y0 + S);
      pave(A, [(x0 + 0.4) / 2, yArm, 0], [(x0 - 0.4) / 2, 0.95, 0.95], 0.2, 3); // part du devant de la platine (0,4 cm)
      // un petit gousset sous le bras, soudé au montant
      pave(A, [x0 - 2.3, yArm - 1.6, 0], [1.3, 0.75, 0.12], 0.06, 2);
      // plan de l'enseigne → scène : (x, y, z) → (−z, y, x)
      for (let q = 0; q < A.V.length; q += ST) {
        const x = A.V[q], z = A.V[q + 2], nx = A.V[q + 3], nz = A.V[q + 5];
        A.V[q] = -z; A.V[q + 2] = x; A.V[q + 3] = -nz; A.V[q + 5] = nx;
      }
      out.acier = { V: new Float32Array(A.V), I: new Uint32Array(A.I), n: A.V.length / ST };
      out.axe = [0, xc];
      out.ancre = [0, yArm, 0];
      out.cadre = { z: [x0 - h, x1 + h], y: [y0 - h, y1 + h] };
      return out;
    }

    /* ---------- Occlusion là où la broche entre dans le bois ---------- */
    function broche(Po, meshes) {
      const m = Po.mat, e = Po.entrees;
      meshes.forEach((M) => {
        for (let q = 0; q < M.n; q++) {
          const o = q * ST, x = M.V[o], y = M.V[o + 1], X = m[0] * x + m[4] * y + m[12], Y = m[1] * x + m[5] * y + m[13], Z = M.V[o + 2] + m[14];
          const d2 = X * X + Z * Z, dy = Math.min(Math.abs(Y - e[0]), Math.abs(Y - e[1]));
          if (d2 < 9 && dy < 2) M.V[o + 6] *= 1 - 0.55 * Math.exp(-d2 / 1.1) * Math.exp(-(dy * dy) / 0.5);
        }
      });
    }


    /* ---------- Occlusion ambiante : huit rayons par sommet, contre le volume (profondeurs + semelle) ;
       sur la tige, un sommet sur quatre, les autres interpolés ---------- */
    function occlusion(Ms, prof, W) {
      const { ZL, ZM } = prof, G = prof.grille, N = 620, yb = new Float32Array(N + 1), yh = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) { yb[i] = yDessous(i * 0.05); yh[i] = yDessus(i * 0.05); }
      const ig = 1 / G.pas, gx0 = G.x0, gy0 = G.y0, nx0 = G.nx, ny0 = G.ny;
      const D = [];
      for (let i = 0; i < 8; i++) { const u = (i + 0.5) / 8, r = Math.sqrt(u), a = i * 2.39996; D.push(r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - u)); }
      const ao = (V, o) => {
        const px = V[o], py = V[o + 1], pz = V[o + 2], nx = V[o + 3], ny = V[o + 4], nz = V[o + 5];
        let tx = ny, ty = -nx, tz = 0;
        if (Math.abs(nz) > 0.9) { tx = 0; ty = nz; tz = -ny; }
        const lt = Math.hypot(tx, ty, tz) || 1;
        tx /= lt; ty /= lt; tz /= lt;
        const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
        let occ = 0;
        for (let r = 0; r < 24; r += 3) {
          const dx = tx * D[r] + bx * D[r + 1] + nx * D[r + 2], dy = ty * D[r] + by * D[r + 1] + ny * D[r + 2], dz = tz * D[r] + bz * D[r + 1] + nz * D[r + 2];
          for (let st = 1; st <= 6; st++) {
            const L = 0.1 + st * 0.48, x = px + dx * L, y = py + dy * L, z = pz + dz * L;
            if (x < -0.2 || x > 30.2 || y < -0.1) break;
            const i = (x * 20 + 0.5) | 0;
            if (y < yh[i < 0 ? 0 : i > N ? N : i] - 0.05) {
              if (y > yb[i < 0 ? 0 : i > N ? N : i] && Math.abs(z) < (z >= 0 ? W.lat(x) : W.med(x)) + 0.3) { occ++; break; }
              continue;
            }
            const ix = ((x - gx0) * ig + 0.5) | 0, iy = ((y - gy0) * ig + 0.5) | 0;
            if (ix < 0 || iy < 0 || ix >= nx0 || iy >= ny0) continue;
            const k = iy * nx0 + ix;
            if (z <= ZL[k] + 0.02 && z >= ZM[k] - 0.02) { occ++; break; }
          }
        }
        return 1 - 0.78 * (occ / 8);
      };
      Ms.forEach((M) => {
        if (!M.NT) { for (let q = 0; q < M.n; q++) M.V[q * ST + 6] *= ao(M.V, q * ST); return; }
        // la grille de la tige : un point sur deux dans chaque sens, puis interpolation
        const NU = M.NU, NT = M.NT, A = new Float32Array(NU * NT);
        const pair = (n, i) => i % 2 === 0 || i === n - 1;
        for (let i = 0; i < NU; i++) if (pair(NU, i)) for (let j = 0; j < NT; j++) if (pair(NT, j)) A[i * NT + j] = ao(M.V, (i * NT + j) * ST);
        for (let i = 0; i < NU; i++) if (pair(NU, i)) for (let j = 1; j < NT - 1; j++) if (!pair(NT, j)) A[i * NT + j] = (A[i * NT + j - 1] + A[i * NT + j + 1]) / 2;
        for (let i = 1; i < NU - 1; i++) if (!pair(NU, i)) for (let j = 0; j < NT; j++) A[i * NT + j] = (A[(i - 1) * NT + j] + A[(i + 1) * NT + j]) / 2;
        for (let q = 0; q < NU * NT; q++) M.V[q * ST + 6] *= A[q];
      });
    }

    /* ---------- Les cartes : géométrie commune (page, usine, shader) ---------- */
    const CARTE = { w: 1024, h: 512, x0: -0.5, x1: 30.5, y0: 1.5, y1: 19.0, z0: -6.5, z1: 6.5, ech: 0.8 }; // ech : cm pour 255 niveaux

    let E = null; // ce que base() garde pour relief()
    function base(P0) {
      const t0 = Date.now();
      const P = Object.assign({ nu: 300, ks: 104, ki: 36, nlang: 120, nsem: 280, mode: 'enseigne', pose: 'pointe' }, P0 || {});
      const ct = contour(P.nsem), W = largeurs(ct, 0.3);
      // le dos et le nez de la tige partent exactement des pointes du contour en retrait (coutures fermées)
      DOS[0] = [W.x0, yDessus(W.x0) - 0.15]; NEZ[0] = [W.x1, yDessus(W.x1) - 0.15];
      const T = tige(P, W), L = languette(P, 0), S = semelle(P, ct);
      // la languette : pas de relief sur sa face arrière, au fond du col
      for (let q = 0; q < L.n; q++) { const o = q * ST; L.V[o + 8] = L.V[o + 3] < -0.5 && L.V[o + 1] < 16.9 ? 0 : 1; }
      // la tige : l'intérieur (fond du col, fente de la languette) ne lit que la carte du dessus
      for (let i = 0; i < T.NU; i++) for (let j = 0; j < T.NT; j++) {
        const k = j < T.K ? j : T.NT - 1 - j;
        T.V[(i * T.NT + j) * ST + 8] = k >= T.KS ? 2 : 1;
      }
      T.n = T.NU * T.NT;
      const prof = profondeurs(T, L), traits = traitsDessus(T), trous = perforations(T);
      const Po = poser(P, [T, L, S]);
      E = { P, T, L, S, Po, prof, W };
      return {
        prof, traits, trous, carte: CARTE,
        panneaux: PANNEAUX, coins: COINS,
        profil: { haut: HAUT_PTS, dos: DOS, nez: NEZ, langue: LANGUE, contour: CONTOUR, garde: GARDE_HAUT, dessus: Array.from({ length: 61 }, (_, i) => [i / 2, yDessus(i / 2)]), dessous: Array.from({ length: 61 }, (_, i) => [i / 2, yDessous(i / 2)]) },
        pose: { mat: Po.mat, axe: Po.axe, ancre: Po.ancre, cadre: Po.cadre || null, env: Po.env },
        sommets: T.n + L.n + S.n + (Po.acier ? Po.acier.n : 0),
        ms: Date.now() - t0,
      };
    }

    /* Déplace les sommets le long de leur normale, selon les cartes (mêmes règles que le shader) */
    function deplace(M, gLat, gMed, gDes) {
      const { w, h, x0, x1, y0, y1, z0, z1 } = CARTE, k0 = CARTE.ech / 255;
      const lit = (A, u, v) => { // bilinéaire sur les niveaux de gris → cm
        const fx = clamp(u * w - 0.5, 0, w - 1.001), fy = clamp(v * h - 0.5, 0, h - 1.001), ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * w + ix;
        return ((A[i] * (1 - tx) + A[i + 1] * tx) * (1 - ty) + (A[i + w] * (1 - tx) + A[i + w + 1] * tx) * ty - 128) * k0;
      };
      for (let q = 0; q < M.n; q++) {
        const o = q * ST, mode = M.V[o + 8];
        if (mode < 0.5) continue;
        const x = M.V[o], y = M.V[o + 1], z = M.V[o + 2], ny = M.V[o + 4], side = M.V[o + 7];
        const u = (x - x0) / (x1 - x0), wT = mode > 1.5 ? 1 : sst(0.5, 0.8, ny);
        let d = 0;
        if (wT < 1) d += (1 - wT) * lit(side >= 0 ? gLat : gMed, u, (y1 - y) / (y1 - y0));
        if (wT > 0) d += wT * lit(gDes, u, (z1 - z) / (z1 - z0));
        M.V[o] += M.V[o + 3] * d; M.V[o + 1] += M.V[o + 4] * d; M.V[o + 2] += M.V[o + 5] * d;
      }
    }

    /* Découpe un maillage en morceaux de moins de 65 536 sommets (index 16 bits, partout) */
    function morceaux(M) {
      const n = M.n || M.V.length / ST;
      if (n <= 65535) return [{ V: M.V, I: new Uint16Array(M.I) }];
      if (M.NT) { // une grille : on coupe par rangées (la rangée frontière est dupliquée)
        const out = [], per = Math.floor(65535 / M.NT) - 1;
        for (let r0 = 0; r0 < M.NU - 1; r0 += per) {
          const r1 = Math.min(M.NU - 1, r0 + per), nr = r1 - r0 + 1;
          out.push({ V: M.V.slice(r0 * M.NT * ST, (r1 + 1) * M.NT * ST), I: new Uint16Array(indicesGrille(nr, M.NT, false)) });
        }
        return out;
      }
      const out = [], I = M.I;
      let t = 0;
      while (t < I.length) {
        const map = new Map(), V = [], J = [];
        while (t < I.length && map.size < 65532) {
          for (let k = 0; k < 3; k++) {
            const v = I[t + k];
            if (!map.has(v)) { map.set(v, map.size); for (let c = 0; c < ST; c++) V.push(M.V[v * ST + c]); }
            J.push(map.get(v));
          }
          t += 3;
        }
        out.push({ V: new Float32Array(V), I: new Uint16Array(J) });
      }
      return out;
    }

    function relief(C) {
      const t0 = Date.now(), { T, L, S, Po } = E;
      if (C) { deplace(T, C.lat, C.med, C.dessus); deplace(L, C.lat, C.med, C.dessus); }
      occlusion([T, L, S], E.prof, E.W);
      broche(Po, [T, L, S]);
      const parties = [];
      morceaux(T).forEach((m) => parties.push({ nom: 'tige', V: m.V, I: m.I }));
      morceaux(L).forEach((m) => parties.push({ nom: 'tige', V: m.V, I: m.I }));
      morceaux(S).forEach((m) => parties.push({ nom: 'semelle', V: m.V, I: m.I }));
      if (Po.acier) morceaux(Po.acier).forEach((m) => parties.push({ nom: 'acier', V: m.V, I: m.I }));
      E = null;
      return { parties, ms: Date.now() - t0 };
    }

    // le profil seul (dessin de repli, sans WebGL) : aucune géométrie calculée
    const profil = () => ({ haut: HAUT_PTS, dos: DOS, nez: NEZ, langue: LANGUE, contour: CONTOUR, panneaux: PANNEAUX, coins: COINS,
      dessus: Array.from({ length: 61 }, (_, i) => [i / 2, yDessus(i / 2)]), dessous: Array.from({ length: 61 }, (_, i) => [i / 2, yDessous(i / 2)]) });
    return { base, relief, profil };
  }

  /* ======================================================================
     Les cartes de sculpture : des cartes de hauteur en niveaux de gris,
     dessinées au canvas 2D (gris 128 = la surface, plus clair = en relief).
       côté extérieur et côté intérieur : projection de profil (x, y)
       dessus : projection vue de dessus (x, z), rééchantillonnée depuis les
       profils (grâce aux profondeurs) pour que les deux vues coïncident
     Elles servent deux fois : déplacement des sommets (dans l'usine) et
     relief par pixel (le GPU en tire pentes et creux, une fois au chargement).
     Fonction autonome, comme l'usine : dans le Worker quand OffscreenCanvas
     y existe, sinon dans la page.
     ====================================================================== */
  function coJordanCartes() {
  'use strict';
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1].map((c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * t3));
  }
  /* Contour fermé lissé (Catmull-Rom), coins vifs aux indices donnés ; k points par arête */
  function trace(pts, coins, k) {
    const n = pts.length, out = [], coin = (i) => coins.indexOf(i) >= 0;
    for (let i = 0; i < n; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const p0 = coin(i) ? p1 : pts[(i - 1 + n) % n], p3 = coin((i + 1) % n) ? p2 : pts[(i + 2) % n];
      for (let j = 0; j < k; j++) out.push(catmull(p0, p1, p2, p3, j / k));
    }
    return out;
  }
  /* Courbe ouverte lissée */
  function traceOuverte(pts, k) {
    const n = pts.length, out = [];
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      for (let j = 0; j < k; j++) out.push(catmull(p0, p1, p2, p3, j / k));
    }
    out.push(pts[n - 1].slice());
    return out;
  }
  /* Décalage d'une polyligne (vers la gauche de la marche si d > 0) */
  function decale(poly, d, ferme) {
    const n = poly.length;
    return poly.map((p, i) => {
      const a = poly[ferme ? (i - 1 + n) % n : Math.max(0, i - 1)], b = poly[ferme ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
      return [p[0] - (ty / l) * d, p[1] + (tx / l) * d];
    });
  }
  const aire = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

  function dessineCartes(B, opt) {
    const t0 = performance.now(), SWOOSH = opt.swoosh !== false;
    let graine = 0x5eed63;
    const rng = () => { // mulberry32, comme CO.rng
      graine = (graine + 0x6d2b79f5) >>> 0;
      let t = graine;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const C = B.carte, W = C.w, H = C.h, cv = opt.toile(W, 3 * H);
    const g = cv.getContext('2d', { willReadFrequently: true });
    if (!g) throw new Error('canvas 2D indisponible');
    const niv = (h) => Math.max(0, Math.min(255, Math.round(128 + (h / C.ech) * 255)));
    const gris = (h) => { const v = niv(h); return 'rgb(' + v + ',' + v + ',' + v + ')'; };
    g.fillStyle = gris(0);
    g.fillRect(0, 0, W, 3 * H);
    const kx = W / (C.x1 - C.x0), ky = H / (C.y1 - C.y0), kz = H / (C.z1 - C.z0);
    const PX = (x) => (x - C.x0) * kx, PY = (y, r) => r * H + (C.y1 - y) * ky, PZ = (z) => 2 * H + (C.z1 - z) * kz;
    const chemin = (poly, r, ferme) => {
      g.beginPath();
      poly.forEach((p, i) => (i ? g.lineTo(PX(p[0]), PY(p[1], r)) : g.moveTo(PX(p[0]), PY(p[1], r))));
      if (ferme) g.closePath();
    };
    const RELIEF = 0.17, COL = 0.08, PIQ = 0.045, JOINT = 0.05;
    const pan = B.panneaux, coins = B.coins;
    const liste = [['col', COL], ['aile', RELIEF], ['contrefort', RELIEF], [SWOOSH ? 'swoosh' : 'neutre', RELIEF], ['oeillere', RELIEF], ['garde', RELIEF]];
    const traces = {};
    liste.forEach(([nom]) => { traces[nom] = trace(pan[nom], coins[nom] || [], 10); });

    // 1) les empiècements, en relief, bord arrondi (biseau en marches, fondues ensuite par le GPU)
    for (let r = 0; r < 2; r++) {
      liste.forEach(([nom, h]) => {
        const poly = traces[nom];
        chemin(poly, r, true);
        g.save();
        g.clip();
        g.fillStyle = gris(h);
        g.fill();
        const w = 0.2 * kx, N = 6;
        g.lineJoin = 'round';
        for (let k = N; k >= 1; k--) {
          const f = k / N, prof = Math.sqrt(1 - (1 - f) * (1 - f)); // quart de rond
          g.lineWidth = 2 * w * f;
          g.strokeStyle = gris(h * prof);
          chemin(poly, r, true);
          g.stroke();
        }
        g.restore();
      });
    }

    // 2) coutures : un joint incisé au pied de chaque bord, puis les surpiqûres (pointillés)
    const piqure = (poly, r, niveau, ferme) => {
      g.save();
      g.globalCompositeOperation = 'darken';
      g.setLineDash([0.11 * kx, 0.17 * kx]);
      g.lineDashOffset = rng() * 0.3 * kx;
      g.lineCap = 'round';
      g.lineWidth = 0.075 * kx;
      g.strokeStyle = gris(niveau - PIQ);
      chemin(poly, r, ferme);
      g.stroke();
      g.restore();
    };
    const joint = (poly, r, ferme) => {
      g.save();
      g.globalCompositeOperation = 'darken';
      g.lineWidth = 0.075 * kx;
      g.lineJoin = 'round';
      g.strokeStyle = gris(-JOINT);
      chemin(poly, r, ferme);
      g.stroke();
      g.restore();
    };
    // morceaux de contour (indices des points d'origine) qui reçoivent des surpiqûres : [nom, i0, i1, décalages]
    const PIQURES = [
      ['contrefort', 2, 15, [0.19, 0.37]], ['oeillere', 1, 25, [0.2]], ['oeillere', 29, 34, [0.2]],
      ['garde', 0, 7, [0.19, 0.39]], ['aile', 1, 11, [0.19]], ['aile', 13, 20, [0.19]], ['col', 1, 6, [0.2]],
    ];
    const morceau = (nom, i0, i1) => traces[nom].slice(i0 * 10, i1 * 10 + 1);
    for (let r = 0; r < 2; r++) {
      liste.forEach(([nom]) => joint(traces[nom], r, true));
      PIQURES.forEach(([nom, i0, i1, ds]) => {
        const poly = morceau(nom, i0, i1), sg = aire(traces[nom]) > 0 ? 1 : -1;
        ds.forEach((d) => piqure(decale(poly, sg * d, false), r, nom === 'col' ? COL : RELIEF, false));
      });
      const s = traces[SWOOSH ? 'swoosh' : 'neutre'];
      piqure(decale(s, (aire(s) > 0 ? 1 : -1) * 0.16, true), r, RELIEF, true);
      // le long du laçage (sous le bord de l'œillère) et du haut du col
      const haut = traceOuverte(B.profil.haut, 6), sgH = -1; // le haut va vers +x : l'intérieur est à droite
      piqure(decale(haut.filter((p) => p[0] > 9.6 && p[0] < 21.2), sgH * 0.3, false), r, RELIEF, false);
      piqure(decale(haut.filter((p) => p[0] > 2.7 && p[0] < 9.2), sgH * 0.42, false), r, COL, false);
      // la languette : une piqûre qui suit son bord, au-dessus du col
      const lg = trace(B.profil.langue, [], 8), sgL = aire(lg) > 0 ? 1 : -1;
      piqure(decale(lg, sgL * 0.3, true).filter((p) => p[1] > 16.2), r, 0, false);
    }

    // 3) œillets percés, le long du laçage
    const trous = [];
    const hautLace = traceOuverte(B.profil.haut.filter((p) => p[0] >= 10.3 && p[0] <= 21.0), 8);
    const ligne = decale(hautLace, -0.85, false);
    let L = 0;
    const acc = ligne.map((p, i) => (i ? (L += Math.hypot(p[0] - ligne[i - 1][0], p[1] - ligne[i - 1][1])) : 0));
    const N_OEIL = 8, s0 = 0.55, s1 = L - 0.75;
    for (let k = 0; k < N_OEIL; k++) {
      const s = s0 + ((s1 - s0) * k) / (N_OEIL - 1);
      let j = 0;
      while (j < acc.length - 2 && acc[j + 1] < s) j++;
      const t = (s - acc[j]) / Math.max(1e-6, acc[j + 1] - acc[j]);
      trous.push({ x: ligne[j][0] + (ligne[j + 1][0] - ligne[j][0]) * t, y: ligne[j][1] + (ligne[j + 1][1] - ligne[j][1]) * t, r: 0.2, h: -0.36 });
    }
    // profondeurs → point 3D et normale d'un point vu de profil (r = 0 extérieur, 1 intérieur)
    const P = B.prof, G = P.grille;
    const zAt = (x, y, r) => {
      const fx = (x - G.x0) / G.pas, fy = (y - G.y0) / G.pas, ix = Math.floor(fx), iy = Math.floor(fy);
      if (ix < 0 || iy < 0 || ix >= G.nx - 1 || iy >= G.ny - 1) return null;
      const A = r ? P.ZM : P.ZL, tx = fx - ix, ty = fy - iy, k = iy * G.nx + ix;
      const v = [A[k], A[k + 1], A[k + G.nx], A[k + G.nx + 1]];
      if (v.some((q) => Math.abs(q) > 50)) return null;
      return (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty;
    };
    const normale = (x, y, r) => {
      const e = 0.12, zx1 = zAt(x + e, y, r), zx0 = zAt(x - e, y, r), zy1 = zAt(x, y + e, r), zy0 = zAt(x, y - e, r);
      if (zx1 == null || zx0 == null || zy1 == null || zy0 == null) return null;
      // surface z = f(x, y) : normale sortante (−s·fx, −s·fy, s), s = +1 dehors, −1 dedans
      const s = r ? -1 : 1, gx = (zx1 - zx0) / (2 * e), gy = (zy1 - zy0) / (2 * e), l = Math.hypot(gx, gy, 1);
      return [(-s * gx) / l, (-s * gy) / l, s / l];
    };
    // un trou : ellipse = projection d'un disque sur le plan de la carte
    const ellipse = (cx, cy, r, ax, ay, f, niveau) => {
      if (f < 0.2) return;
      g.save();
      g.globalCompositeOperation = 'darken';
      g.translate(cx, cy);
      g.rotate(Math.atan2(ay, ax));
      g.scale(Math.max(0.2, f), 1);
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fillStyle = gris(niveau);
      g.fill();
      g.restore();
    };
    for (let r = 0; r < 2; r++) {
      trous.forEach((t) => {
        const n = normale(t.x, t.y, r);
        const f = n ? Math.abs(n[2]) : 1, ax = n ? n[0] : 1, ay = n ? -n[1] : 0;
        ellipse(PX(t.x), PY(t.y, r), t.r * kx, ax, ay, f, t.h);
      });
      B.trous.filter((t) => (t.cote > 0) === (r === 0)).forEach((t) => {
        ellipse(PX(t.p[0]), PY(t.p[1], r), 0.105 * kx, t.n[0], -t.n[1], Math.abs(t.n[2]), -0.22);
      });
    }

    // traces de gouge : des creux peu profonds qui se recoupent, multipliés dans la carte (les reliefs gardent leur rang)
    g.save();
    g.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 900; k++) {
      const cx = rng() * W, cy = rng() * 3 * H, len = (0.9 + rng() * 1.4) * kx, lar = (0.5 + rng() * 0.6) * kx, a = rng() * Math.PI;
      g.setTransform(1, 0, 0, 1, cx, cy);
      g.rotate(a);
      g.scale(1, lar / len);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
      gr.addColorStop(0, 'rgb(246,246,246)');
      gr.addColorStop(1, 'rgb(255,255,255)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, len, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // 4) les profils, lus ; la carte du dessus est rééchantillonnée depuis eux
    const img = g.getImageData(0, 0, W, 2 * H), D = img.data, top = g.createImageData(W, H), T4 = top.data;
    T4.fill(128);
    for (let i = 3; i < T4.length; i += 4) T4[i] = 255;
    const cote = (x, y, r) => {
      const fx = Math.max(0, Math.min(W - 1, PX(x) - 0.5)), fy = Math.max(r * H, Math.min(r * H + H - 1, PY(y, r) - 0.5));
      return D[(Math.round(fy) * W + Math.round(fx)) * 4];
    };
    const col = [new Float32Array(G.ny), new Float32Array(G.ny)];
    const ecrit = (iz, ix, v) => { const o = (iz * W + ix) * 4; T4[o] = T4[o + 1] = T4[o + 2] = v; };
    for (let ix = 0; ix < W; ix++) {
      const x = C.x0 + (ix + 0.5) / kx, fx = (x - G.x0) / G.pas, gi = Math.floor(fx), tx = fx - gi;
      if (gi < 0 || gi >= G.nx - 1) continue;
      // les deux colonnes de profondeurs à cet x ; le faîte = le plus haut point défini
      const tops = [-1, -1];
      for (let r = 0; r < 2; r++) {
        const A = r ? P.ZM : P.ZL, cz = col[r];
        for (let j = 0; j < G.ny; j++) {
          const a = A[j * G.nx + gi], b = A[j * G.nx + gi + 1];
          cz[j] = Math.abs(a) > 50 || Math.abs(b) > 50 ? NaN : a + (b - a) * tx;
          if (cz[j] === cz[j]) tops[r] = j;
        }
      }
      if (tops[0] < 3 || tops[1] < 3) continue;
      const zT = [col[0][tops[0]], col[1][tops[1]]];
      const vT = [cote(x, G.y0 + tops[0] * G.pas - 0.05, 0), cote(x, G.y0 + tops[1] * G.pas - 0.05, 1)], zMid = (zT[0] + zT[1]) / 2;
      const rang = (z) => (C.z1 - z) * kz - 0.5;
      // le dessus, entre les deux faîtes : la valeur du bord le plus proche
      const iA = Math.max(0, Math.ceil(rang(zT[0]))), iB = Math.min(H - 1, Math.floor(rang(zT[1])));
      for (let iz = iA; iz <= iB; iz++) ecrit(iz, ix, C.z1 - (iz + 0.5) / kz > zMid ? vT[0] : vT[1]);
      // les flancs : du faîte vers l'extérieur, en descendant la colonne (une seule passe)
      for (let r = 0; r < 2; r++) {
        const cz = col[r], pas = r ? 1 : -1;
        let j = tops[r];
        for (let iz = r ? iB + 1 : iA - 1; iz >= 0 && iz < H; iz += pas) {
          const z = C.z1 - (iz + 0.5) / kz;
          while (j > 0 && cz[j - 1] === cz[j - 1] && (r ? cz[j - 1] > z : cz[j - 1] < z)) j--;
          if (j === 0 || cz[j - 1] !== cz[j - 1]) break;
          const za = cz[j - 1], zb = cz[j], t = (z - za) / ((zb - za) || 1e-6);
          ecrit(iz, ix, Math.abs(zb - za) < 0.015 ? vT[r] : cote(x, G.y0 + (j - 1 + t) * G.pas, r));
        }
      }
    }
    g.putImageData(top, 0, 2 * H);

    // 5) ce qui ne se voit que du dessus : la languette en retrait entre les œillères, ses piqûres, les trous d'en haut
    const lz = (p) => [PX(p[0]), PZ(p[2])];
    const [lat, med] = B.traits.levres;
    if (lat.length > 2) {
      g.save();
      g.beginPath();
      lat.forEach((p, i) => { const q = lz(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
      med.slice().reverse().forEach((p) => { const q = lz(p); g.lineTo(q[0], q[1]); });
      g.closePath();
      g.fillStyle = gris(0);
      g.fill();
      g.restore();
      for (const [ln, s] of [[lat, 1], [med, -1]]) {
        g.save();
        g.globalCompositeOperation = 'darken';
        g.setLineDash([0.2 * kx, 0.1 * kx]);
        g.lineCap = 'round';
        g.lineWidth = 0.055 * kx;
        g.strokeStyle = gris(RELIEF - PIQ);
        g.beginPath();
        ln.forEach((p, i) => { const q = [PX(p[0]), PZ(p[2] + s * 0.22)]; i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
        g.stroke();
        g.strokeStyle = gris(-JOINT);
        g.setLineDash([]);
        g.lineWidth = 0.05 * kx;
        g.beginPath();
        ln.forEach((p, i) => { const q = lz(p); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
        g.stroke();
        g.restore();
      }
    }
    // la languette, vue de dessus : lisse
    g.fillStyle = gris(0);
    g.beginPath();
    g.ellipse(PX(10.95), PZ(0), 1.25 * kx, 1.72 * kz, 0, 0, Math.PI * 2);
    g.fill();
    B.trous.forEach((t) => ellipse(PX(t.p[0]), PZ(t.p[2]), 0.105 * kx, t.n[0], -t.n[2], Math.abs(t.n[1]), -0.22));
    trous.forEach((t) => {
      for (let r = 0; r < 2; r++) {
        const z = zAt(t.x, t.y, r), n = normale(t.x, t.y, r);
        if (z == null || !n) continue;
        ellipse(PX(t.x), PZ(z), t.r * kx, n[0], -n[2], Math.abs(n[1]), t.h);
      }
    });

    // 6) une seule relecture : le rouge de chaque carte
    const F = g.getImageData(0, 0, W, 3 * H).data, n = W * H;
    const lat8 = new Uint8Array(n), med8 = new Uint8Array(n), des8 = new Uint8Array(n);
    for (let i = 0; i < n; i++) { lat8[i] = F[i * 4]; med8[i] = F[(n + i) * 4]; des8[i] = F[(2 * n + i) * 4]; }
    return { lat: lat8, med: med8, dessus: des8, ms: Math.round(performance.now() - t0) };
  }
  return dessineCartes;
  }

  /* ======================================================================
     Le moteur WebGL (WebGL 1, sans dépendance)
     ====================================================================== */
  /* ---------- Petite algèbre (matrices colonne par colonne, comme WebGL) ---------- */
  const M4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    persp(fovy, asp, n, f) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = (2 * f * n) / (n - f);
      return o;
    },
    lookAt(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
      zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
    chain(...ms) { return ms.reduce((a, b) => M4.mul(a, b)); },
    apply(m, p) {
      const x = p[0], y = p[1], z = p[2], w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
    },
    nrm(m) { return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); },
  };

  /* ---------- Shaders ---------- */
  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aAux;
uniform mat4 uPV; uniform mat4 uM; uniform mat3 uNM; uniform float uGonfle;
varying vec3 vO; varying vec3 vNo; varying vec3 vW; varying vec3 vN; varying vec4 vAux;
void main() {
  vec3 p = aPos + aNrm * uGonfle;
  vec4 w = uM * vec4(p, 1.0);
  vO = p; vNo = aNrm; vW = w.xyz; vN = uNM * aNrm; vAux = aAux;
  gl_Position = uPV * w;
}`;
  // éclairage commun : soleil (ou réverbère la nuit), ciel/sol, lumière d'appoint ; tons doux, gamma
  const LUM = `
uniform vec3 uEye; uniform vec3 uL1; uniform vec3 uC1; uniform vec3 uCiel; uniform vec3 uSol; uniform vec3 uL2; uniform vec3 uC2;
uniform float uAlpha; uniform sampler2D uBruit;
float bruit(vec3 x) {
  vec3 p = floor(x); vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
  vec2 rg = texture2D(uBruit, (uv + 0.5) / 256.0).yx;
  return mix(rg.x, rg.y, f.z);
}
vec3 sortie(vec3 c) { c = c / (1.0 + c * 0.22); return pow(max(c, 0.0), vec3(1.0 / 2.2)); }`;
  const FS_BOIS = (deriv, prec) => `${deriv ? '#extension GL_OES_standard_derivatives : enable\n' : ''}precision ${prec} float;
varying vec3 vO; varying vec3 vNo; varying vec3 vW; varying vec3 vN; varying vec4 vAux;
uniform sampler2D uCote; uniform sampler2D uDessus; uniform vec4 uCx; uniform vec4 uCyz;
uniform float uMat; uniform float uRelief; uniform mat3 uNM; uniform vec3 uAxe; uniform vec3 uNoeuds[3];
${LUM}
// un nœud : une branche qui part de l'axe de la bille ; les cernes le contournent
float noeud(vec3 P, vec3 S, float r, inout float rr) {
  vec2 dir = normalize(S.yz - uAxe.xy);
  vec3 v = P - vec3(S.x, uAxe.xy);
  float along = dot(v.yz, dir);
  float d = length(vec3(v.x, v.yz - dir * along));
  float sortant = step(0.0, along);
  rr -= sortant * 0.9 * exp(-d * d / (r * r * 5.0));
  return sortant * (1.0 - smoothstep(r * 0.55, r, d));
}
void main() {
  vec3 P = vO, no = normalize(vNo);
  if (uAlpha < 1.0 && bruit(P * vec3(0.9, 2.6, 2.6) + 3.0) * 0.7 + bruit(P * 5.0) * 0.3 > uAlpha * 1.08) discard;
  vec3 grad = vec3(0.0); float cav = 0.0, haut = 0.0;
  if (uMat < 0.5) {
    // les cartes de sculpture : profil (côté) et dessus, mêlés selon l'orientation
    float mode = vAux.z;
    if (mode > 0.5) {
      float wT = mode > 1.5 ? 1.0 : smoothstep(0.5, 0.8, no.y);
      float u = (P.x - uCx.x) * uCx.y, vy = clamp((uCyz.x - P.y) * uCyz.y, 0.001, 0.999);
      vec4 A = texture2D(uCote, vec2(u, vAux.y < 0.0 ? 0.5 + vy * 0.5 : vy * 0.5));
      vec4 D = texture2D(uDessus, vec2(u, (uCyz.z - P.z) * uCyz.w));
      vec3 gS = vec3(A.g - 0.5, A.b - 0.5, 0.0) * 6.0, gT = vec3(D.g - 0.5, 0.0, D.b - 0.5) * 6.0;
      grad = mix(gS, gT, wT);
      cav = mix(A.a, D.a, wT);
      haut = mix(A.r, D.r, wT) - 0.502;
    }
  }
  vec3 nb = normalize(no - (grad - no * dot(no, grad)) * uRelief);
  vec3 N = normalize(uNM * nb);
  float ao = vAux.x, hd = 0.0;
  if (uMat > 0.5) {
    // la semelle : fine rainure du bord, surpiqûre du tour (pointillés), en creux
    float a = vAux.z, b = vAux.w, s = vAux.y;
    if (a > -2.0) {
      float rain = 1.0 - smoothstep(0.02, 0.075, abs(a));
      float fs = fract(s / 0.34);
      float piq = (1.0 - smoothstep(0.022, 0.05, abs(b - 0.46))) * (1.0 - smoothstep(0.24, 0.34, abs(fs - 0.5)));
      hd = -0.06 * rain - 0.035 * piq;
      ao *= 1.0 - 0.45 * rain - 0.35 * piq;
    } else {
      // le dessous : cercle de pivot à l'avant, rayons au talon, chevrons entre les deux ; bordure lisse
      vec2 q = P.xz - vec2(21.2, 0.45), h2 = P.xz - vec2(4.4, 0.0);
      float r1 = length(q), r2 = length(h2);
      float g1 = (1.0 - smoothstep(0.035, 0.07, abs(fract(r1 / 0.42 + 0.5) - 0.5) * 0.42)) * step(0.45, r1) * (1.0 - smoothstep(3.0, 3.1, r1));
      float g2 = (1.0 - smoothstep(0.035, 0.08, abs(fract(atan(h2.y, h2.x) * 2.546 + 0.5) - 0.5) * r2 * 0.39)) * smoothstep(0.9, 1.0, r2) * (1.0 - smoothstep(2.9, 3.0, r2));
      g2 = max(g2, (1.0 - smoothstep(0.03, 0.06, abs(r2 - 0.85))) + (1.0 - smoothstep(0.03, 0.06, abs(r2 - 3.05))));
      float c = P.x + 0.32 * abs(P.z - 0.3);
      float g3 = (1.0 - smoothstep(0.035, 0.07, abs(fract(c / 0.52 + 0.5) - 0.5) * 0.52)) * smoothstep(3.2, 3.35, r1) * smoothstep(3.2, 3.35, r2) * step(P.x, 27.0);
      float motif = clamp(max(max(g1, g2), g3), 0.0, 1.0) * smoothstep(0.55, 0.8, b);
      hd = -0.05 * motif;
      ao *= 1.0 - 0.35 * motif;
    }
  }
  // le bois : cernes 3D autour d'un axe parallèle à la longueur (une bille), à peine ondulés
  vec2 d = P.yz - uAxe.xy;
  float w1 = bruit(P * vec3(0.035, 0.16, 0.16)) - 0.5, w2 = bruit(P * vec3(0.09, 0.45, 0.45) + 11.0) - 0.5;
  float rr = length(d) + w1 * 0.95 + w2 * 0.24;
  float kn = 0.0;
  kn = max(kn, noeud(P, uNoeuds[0], 0.34, rr));
  kn = max(kn, noeud(P, uNoeuds[1], 0.24, rr));
  kn = max(kn, noeud(P, uNoeuds[2], 0.28, rr));
  float t = rr / uAxe.z;
  float f = fract(t);
${deriv ? '  float aa = clamp(1.3 - fwidth(t) * 2.2, 0.0, 1.0);' : '  float aa = 0.6;'}
  // bois d'été : une bande étroite, fondue côté printemps, nette au cerne suivant ; trop fins à l'écran, on les moyenne
  float cerne = mix(0.3, smoothstep(0.55, 0.93, f) * (1.0 - smoothstep(0.95, 1.0, f)), aa);
  float fib = bruit(vec3(P.x * 0.7, P.y * 22.0, P.z * 22.0)) - 0.5;
  float fin = bruit(vec3(P.x * 3.0, P.y * 75.0, P.z * 75.0)) - 0.5;
  float ray = smoothstep(0.8, 0.92, bruit(vec3(atan(d.y, d.x) * 70.0, length(d) * 1.2, P.x * 0.6)));
  float large = bruit(P * 0.08 + 5.0), large2 = bruit(P * 0.3 + 17.0);
  vec3 base = vec3(0.68, 0.485, 0.262), veine = vec3(0.451, 0.27, 0.111);
  vec3 alb = base * mix(0.92, 1.05, large) * vec3(1.0, 1.0 - 0.05 * (large2 - 0.5), 1.0 - 0.1 * (large2 - 0.5));
  alb = mix(alb, veine, cerne * 0.2);
  alb *= 1.0 + fib * 0.05 + fin * 0.05 + ray * 0.03;
  // nœuds : un petit cœur brun, cerné d'un liseré plus sombre
  alb = mix(alb, vec3(0.36, 0.22, 0.1), kn * 0.75);
  alb *= 1.0 - kn * (1.0 - kn) * 0.9;
  // quelques taches brun-rouge, éparses
  float tach = smoothstep(0.8, 0.88, bruit(P * 0.33 + 3.7)) * smoothstep(0.45, 0.78, bruit(P * 2.2 + 9.1));
  tach += smoothstep(0.9, 0.94, bruit(P * 1.3 + 21.0)) * 0.5;
  alb *= mix(vec3(1.0), vec3(0.6, 0.4, 0.33), clamp(tach, 0.0, 1.0) * 0.8);
  // patine de plein air : des marbrures sombres, plus fortes dans les creux et les recoins
  float sal = smoothstep(0.42, 0.78, bruit(P * 0.55 + 31.0) * 0.65 + bruit(P * 2.1 + 7.0) * 0.35);
  alb *= mix(vec3(1.0), vec3(0.8, 0.7, 0.6), sal * (0.35 + 0.65 * (1.0 - vAux.x)));
  // les creux se salissent, les arêtes en relief sont un peu plus claires (poncées, touchées)
  alb *= 1.0 - cav * 0.35;
  alb *= 1.0 + clamp(haut * 2.5, -0.08, 0.1);
  ao *= 1.0 - cav * 0.8;
${deriv ? `  // micro-relief : le fil du bois poncé (et les détails de la semelle), par dérivées d'écran
  hd += (fib * 0.006 + fin * 0.003) * uRelief;
  vec3 dpx = dFdx(vW), dpy = dFdy(vW);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  N = normalize(abs(det) * N - sign(det) * (dFdx(hd) * r1 + dFdy(hd) * r2));` : ''}
  // lumière
  vec3 V = normalize(uEye - vW);
  float nl = dot(N, uL1);
  float ombre = uMat < 0.5 ? vAux.w : 1.0; // le fond du col ne voit pas le soleil
  float dif = max((nl + 0.14) / 1.14, 0.0) * ombre;
  vec3 amb = mix(uSol, uCiel, N.y * 0.5 + 0.5);
  vec3 col = alb * (amb * ao + uC1 * dif * mix(0.45, 1.0, ao) + uC2 * max(dot(N, uL2), 0.0) * ao);
  // fini huilé satiné : reflet faible et large, cassé par le fil du bois
  vec3 Hv = normalize(uL1 + V);
  col += uC1 * pow(max(dot(N, Hv), 0.0), 16.0) * 0.035 * (0.75 + fib + cerne * 0.5) * step(0.0, nl) * ao * ombre;
  // bois poncé, un peu duveteux : un voile clair aux incidences rasantes
  float sheen = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  col += (amb * 0.6 + uC1 * max(nl, 0.0) * 0.4) * alb * sheen * 0.35 * ao;
  gl_FragColor = vec4(sortie(col), 1.0);
}`;
  const FS_ACIER = (prec) => `precision ${prec} float;
varying vec3 vO; varying vec3 vNo; varying vec3 vW; varying vec3 vN; varying vec4 vAux;
${LUM}
void main() {
  if (uAlpha < 1.0 && bruit(vO * 1.6 + 9.0) > uAlpha * 1.1) discard;
  vec3 N = normalize(vN), V = normalize(uEye - vW);
  float ao = vAux.x;
  // acier anthracite satiné : calamine légère, reflets fins sur les arêtes arrondies
  float n = bruit(vO * 1.7) * 0.6 + bruit(vO * vec3(0.4, 9.0, 0.4)) * 0.4;
  vec3 alb = vec3(0.043, 0.048, 0.055) * (0.8 + 0.4 * n);
  float nl = dot(N, uL1);
  vec3 amb = mix(uSol, uCiel, N.y * 0.5 + 0.5);
  vec3 col = alb * (amb * ao * 1.3 + uC1 * max(nl, 0.0) * 1.1 + uC2 * max(dot(N, uL2), 0.0) * ao);
  vec3 R = reflect(-V, N);
  vec3 env = mix(uSol * 0.9, uCiel * 1.5, smoothstep(-0.35, 0.55, R.y)) + uC1 * 0.9 * pow(max(dot(R, uL1), 0.0), 6.0);
  float fr = 0.05 + 0.45 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col += env * fr * ao * (0.7 + 0.3 * n);
  col += uC1 * pow(max(dot(N, normalize(uL1 + V)), 0.0), 70.0) * 0.55 * step(0.0, nl) * ao;
  gl_FragColor = vec4(sortie(col), 1.0);
}`;
  // cuisson des cartes : hauteur lissée, pentes (Sobel), creux (écart au flou des mipmaps)
  const VS_Q = 'attribute vec2 aQ; varying vec2 vUV; void main() { vUV = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }';
  const FS_CUIT = (prec) => `precision ${prec} float;
uniform sampler2D uH; uniform vec2 uTx; uniform vec2 uK; varying vec2 vUV;
float h(float x, float y) { return texture2D(uH, vUV + uTx * vec2(x, y)).r; }
void main() {
  float a = h(-1.0, -1.0), b = h(0.0, -1.0), c = h(1.0, -1.0), d = h(-1.0, 0.0), e = h(0.0, 0.0), f = h(1.0, 0.0), g = h(-1.0, 1.0), i = h(0.0, 1.0), j = h(1.0, 1.0);
  float m = (a + 2.0 * b + c + 2.0 * d + 4.0 * e + 2.0 * f + g + 2.0 * i + j) / 16.0;
  float gx = ((c + 2.0 * f + j) - (a + 2.0 * d + g)) / 8.0 * uK.x;
  float gy = ((a + 2.0 * b + c) - (g + 2.0 * i + j)) / 8.0 * uK.y;
  float bl = texture2D(uH, vUV, 2.6).r;
  gl_FragColor = vec4(m, clamp(0.5 + gx / 6.0, 0.0, 1.0), clamp(0.5 + gy / 6.0, 0.0, 1.0), clamp((bl - m) * 255.0 * 0.8 / 255.0 / 0.07, 0.0, 1.0));
}`;
  // ombre de contact au sol (chaussure seule, posée)
  const VS_OMB = 'attribute vec2 aQ; uniform mat4 uPV; uniform mat4 uM; uniform vec4 uR; varying vec2 vQ; void main() { vQ = aQ; gl_Position = uPV * uM * vec4(uR.x + aQ.x * uR.z, 0.02, uR.y + aQ.y * uR.w, 1.0); }';
  const FS_OMB = 'precision mediump float; varying vec2 vQ; uniform float uA; void main() { float d = length(vQ); float a = uA * (0.55 * (1.0 - smoothstep(0.2, 1.0, d)) + 0.45 * pow(1.0 - smoothstep(0.0, 0.7, d), 2.0)); gl_FragColor = vec4(vec3(0.1, 0.06, 0.04) * a, a); }';

  /* ---------- Un contexte (une enseigne par page, d'habitude) ---------- */
  function Moteur(cv) {
    const o = { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'default' };
    const gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o);
    if (!gl) return null;
    const E = { gl, prog: {}, deriv: false, uint: false };
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const programme = (vs, fs, attribs) => {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    };
    E.setup = () => {
      E.deriv = !!gl.getExtension('OES_standard_derivatives');
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), prec = hp && hp.precision > 0 ? 'highp' : 'mediump';
      E.prog.bois = programme(VS, FS_BOIS(E.deriv, prec), ['aPos', 'aNrm', 'aAux']);
      E.prog.acier = programme(VS, FS_ACIER(prec), ['aPos', 'aNrm', 'aAux']);
      E.prog.cuit = programme(VS_Q, FS_CUIT(prec), ['aQ']);
      E.prog.omb = programme(VS_OMB, FS_OMB, ['aQ']);
      E.quad = tampon(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
      E.bruit = texBruit();
    };
    const tampon = (data, cible) => {
      const b = gl.createBuffer(), t = cible || gl.ARRAY_BUFFER;
      gl.bindBuffer(t, b);
      gl.bufferData(t, data, gl.STATIC_DRAW);
      return b;
    };
    E.tampon = tampon;
    const texture = (w, h, fmt, data, o2) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
      const rep = o2 && o2.rep ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, rep);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, rep);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (o2 && o2.mip) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return t;
    };
    E.texture = texture;
    // bruit de valeur 256 × 256 : le vert est le rouge décalé de (37, 17) (bruit 3D en une lecture)
    const texBruit = () => {
      const r = CO.rng(0x0b0153), R = new Uint8Array(256 * 256), D = new Uint8Array(256 * 256 * 4);
      for (let i = 0; i < R.length; i++) R[i] = (r() * 256) | 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        D[i] = R[y * 256 + x];
        D[i + 1] = R[((y - 17) & 255) * 256 + ((x - 37) & 255)];
        D[i + 3] = 255;
      }
      return texture(256, 256, gl.RGBA, D, { rep: true });
    };
    /* Cuit une carte de hauteur (niveaux de gris) en texture RVBA (hauteur, pentes, creux), avec mipmaps */
    E.cuire = (gris, w, h, kx, ky) => {
      const src = texture(w, h, gl.LUMINANCE, gris, { mip: true });
      const dst = texture(w, h, gl.RGBA, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      const P = E.prog.cuit;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(P.u.uH, 0);
      gl.uniform2f(P.u.uTx, 1 / w, 1 / h);
      gl.uniform2f(P.u.uK, kx, ky);
      gl.bindBuffer(gl.ARRAY_BUFFER, E.quad);
      for (let i = 1; i < 3; i++) gl.disableVertexAttribArray(i);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(src);
      gl.bindTexture(gl.TEXTURE_2D, dst);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      const an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 4);
      return dst;
    };
    E.maille = (V, I) => ({ vb: tampon(V), ib: tampon(I, gl.ELEMENT_ARRAY_BUFFER), n: I.length });
    E.dessine = (m) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.drawElements(E.fil ? gl.LINES : gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
    };
    E.setup();
    return E;
  }

  /* ======================================================================
     La vue : le canvas, la caméra (fixe), la chaussure qui tourne, les gestes
     ====================================================================== */
  // lumières fixes, accordées à l'ombre portée de la façade : le soleil en haut à gauche le jour,
  // la lanterne de la rue à droite le soir (chaude, un peu rasante), le ciel bleu nuit autour
  const AMBIANCES = {
    jour: { L1: [-0.7, 0.64, 0.36], C1: [1.2, 1.02, 0.8], ciel: [0.36, 0.39, 0.45], sol: [0.3, 0.24, 0.18], L2: [0.72, 0.1, 0.68], C2: [0.1, 0.11, 0.13] },
    nuit: { L1: [0.72, -0.04, 0.69], C1: [1.5, 0.82, 0.38], ciel: [0.075, 0.1, 0.19], sol: [0.1, 0.075, 0.06], L2: [-0.6, 0.5, 0.4], C2: [0.1, 0.15, 0.3] },
  };
  const VUE = 0.5; // l'enseigne drapeau vue de trois-quarts depuis la rue, à droite (≈ 29° de la normale au mur)
  const TOUR = 14; // secondes pour un tour, en croisière
  const ANCRE = [0.971, 0.214]; // où le bras sort de la platine de la façade, dans l'hôte (zoneEnseigne)
  const norme = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const angle = (a) => a - CO.TAU * Math.floor((a + Math.PI) / CO.TAU); // → ]−π, π]

  /* Un Worker créé depuis un Blob (fonctionne aussi en file://), avec l'usine et les cartes ; sinon, null.
     Avec OffscreenCanvas, il fait tout (géométrie, cartes, relief) ; sinon la page dessine les cartes. */
  let urlTravail = null;
  function travailleur() {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || !window.URL || !URL.createObjectURL) return null;
    try {
      if (!urlTravail) {
        const src = `var U = (${coJordanUsine})(), K = (${coJordanCartes})();
function envoie(q, o, r) { var t = []; if (r) r.parties.forEach(function (p) { t.push(p.V.buffer, p.I.buffer); }); o.q = q; postMessage(o, t); }
onmessage = function (e) { var m = e.data; try {
  if (m.q === 'base') { var B = U.base(m.P), C = null;
    if (typeof OffscreenCanvas !== 'undefined' && !m.P.page) { try { C = K(B, { swoosh: m.swoosh, toile: function (w, h) { return new OffscreenCanvas(w, h); } }); } catch (x) { C = null; } }
    if (!C) { envoie('base', { B: B }); return; }
    var R = U.relief(C); envoie('tout', { B: B, C: C, R: R }, R);
  } else { var R2 = U.relief(m.C); envoie('relief', { R: R2 }, R2); }
} catch (err) { postMessage({ q: 'erreur', e: String((err && err.stack) || err) }); } };`;
        urlTravail = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      }
      return new Worker(urlTravail);
    } catch (e) {
      return null;
    }
  }
  const souffle = () => new Promise((r) => setTimeout(r, 0)); // rend la main entre deux étapes (pas de longue tâche)

  class Enseigne {
    constructor(host, opts) {
      this.host = host;
      this.o = Object.assign({ mode: 'enseigne', pose: 'pointe', interactive: true, nuit: false, yaw: 0.6 }, opts || {});
      this.o.mode = this.o.mode === 'seule' ? 'seule' : 'enseigne';
      this.o.pose = this.o.pose === 'posee' ? 'posee' : 'pointe';
      this.fige = !!this.o.fige || CO.reduced; // mouvement réduit : pose fixe de trois-quarts
      this.ecoute = {};
      this.mort = false;
      this.pause = false;
      this.visible = !('IntersectionObserver' in window);
      this.vueActive = true;
      this.psi = +this.o.yaw || 0; // la chaussure sur sa broche : 0 = de profil, parallèle au mur
      this.om = 0; // sa vitesse (rad/s)
      this.croisiere = this.fige ? 0 : CO.TAU / TOUR;
      this.demi = null; // mouvement réduit : un demi-tour lent à la fois
      this.nuit = this.o.nuit ? 1 : 0;
      this.nuitCible = this.nuit;
      this.gonfle = 0; this.relief = 1; this.alpha = 1;
      this.anims = [];
      this.tTourne = -1e9;
      this.stats = { image: 0 };
      this.dprMax = 2; this.moy = 0; this.nMoy = 0; // devicePixelRatio plafonné à 2 (moins si l'appareil peine)
      const cv = (this.canvas = document.createElement('canvas'));
      cv.className = 'co-jordan';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'L’enseigne de la cordonnerie : une Air Jordan 1 sculptée dans le bois qui tourne dans son cadre d’acier');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;-webkit-tap-highlight-color:transparent;' + (this.o.interactive ? 'cursor:grab;' : 'pointer-events:none;');
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(cv);
      this.vue = this.o.vue || (host.closest && host.closest('.view') && host.closest('.view').id) || 'accueil';
      this.boucleFn = (t) => this.boucle(t);
      this.E = null;
      try { this.E = Moteur(cv); } catch (e) { this.E = null; }
      if (this.E) {
        this.E.fil = !!this.o.fil;
        cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.perdu = true; cancelAnimationFrame(this.raf); this.raf = 0; });
        cv.addEventListener('webglcontextrestored', () => { this.perdu = false; try { this.E.setup(); this.gpu(); } catch (err) { /* rien */ } this.sale = true; this.kick(); });
      }
      // dort hors de l'écran, page cachée, autre vue, ou hôte masqué par l'appli (opacité 0)
      this.io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { es.forEach((e) => { this.visible = e.isIntersecting; }); this.reveil(); }) : null;
      if (this.io) this.io.observe(cv);
      this.mo = 'MutationObserver' in window ? new MutationObserver(() => this.reveil()) : null;
      if (this.mo) this.mo.observe(host, { attributes: true, attributeFilter: ['style', 'class'] });
      this.ro = 'ResizeObserver' in window ? new ResizeObserver(() => this.taille()) : null;
      if (this.ro) this.ro.observe(host);
      else { this.onResize = () => this.taille(); window.addEventListener('resize', this.onResize); }
      this.onVis = () => this.reveil();
      document.addEventListener('visibilitychange', this.onVis);
      CO.on('view', (v) => { if (this.mort) return; this.vueActive = !v || v === this.vue; this.reveil(); });
      if (this.o.interactive) this.gestes();
      this.taille();
      this.api = this.faitApi();
    }

    /* ---------- Chargement : l'usine (Worker si possible), les cartes, le GPU ---------- */
    async charge() {
      // densité du maillage : pleine pour un grand canvas, allégée pour une petite enseigne (le relief par pixel garde le détail)
      const dense = this.o.qualite === 'haute' || (this.o.qualite !== 'basse' && Math.max(this.pw || 0, this.ph || 0) > 600);
      const P = Object.assign({ mode: this.o.mode, pose: this.o.pose }, dense ? {} : { nu: 190, ks: 68, ki: 26, nlang: 90, nsem: 220 });
      if (!this.E) { this.repli(); return; }
      const t0 = performance.now(), K = coJordanCartes(), w = this.o.worker === false ? null : travailleur();
      const toile = (W, H) => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
      const demande = (msg, transfert) => new Promise((res, rej) => {
        w.onmessage = (e) => (e.data.q === 'erreur' ? rej(new Error(e.data.e)) : res(e.data));
        w.onerror = (e) => rej(e);
        w.postMessage(msg, transfert || []);
      });
      let R, ou = 'page';
      try {
        if (w) {
          const r1 = await demande({ q: 'base', P: Object.assign({ page: !!this.o.cartesPage }, P), swoosh: SWOOSH });
          if (this.mort) return;
          this.B = r1.B;
          if (r1.q === 'tout') { this.C = r1.C; R = r1.R; ou = 'Worker (tout)'; }
          else {
            await souffle();
            this.C = K(this.B, { swoosh: SWOOSH, toile });
            const c = { lat: this.C.lat.slice(), med: this.C.med.slice(), dessus: this.C.dessus.slice() };
            R = (await demande({ q: 'relief', C: c }, [c.lat.buffer, c.med.buffer, c.dessus.buffer])).R;
            ou = 'Worker + cartes dans la page';
          }
        } else {
          const U = coJordanUsine();
          await souffle(); this.B = U.base(P);
          await souffle(); this.C = K(this.B, { swoosh: SWOOSH, toile });
          await souffle(); R = U.relief(this.C);
        }
      } finally { if (w) w.terminate(); }
      if (this.mort) return;
      this.parties = R.parties;
      this.stats.usine = { base: this.B.ms, cartes: this.C.ms, relief: R.ms, ou };
      this.stats.sommets = this.parties.reduce((s, p) => s + p.V.length / 10, 0);
      this.gpu();
      this.cadrage();
      this.stats.pret = Math.round(performance.now() - t0);
      this.pret = true;
      this.sale = true;
      this.emet('tourne', angle(this.psi));
      this.kick();
    }

    /* (Re)crée tout ce qui vit sur le GPU, depuis les copies gardées en mémoire */
    gpu() {
      const E = this.E, gl = E.gl, C = this.B.carte, W = C.w, H = C.h;
      this.m = { tige: [], semelle: [], acier: [] };
      this.parties.forEach((p) => this.m[p.nom].push(E.maille(p.V, E.fil ? filDeFer(p.I) : p.I)));
      const cote = new Uint8Array(W * H * 2);
      cote.set(this.C.lat, 0); cote.set(this.C.med, W * H);
      const kx = C.ech / ((C.x1 - C.x0) / W);
      this.tex = {
        cote: E.cuire(cote, W, 2 * H, kx, C.ech / ((C.y1 - C.y0) / H)),
        dessus: E.cuire(this.C.dessus, W, H, kx, C.ech / ((C.z1 - C.z0) / H)),
      };
      gl.viewport(0, 0, this.pw || 1, this.ph || 1);
    }

    taille() {
      const r = this.host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(this.dprMax, window.devicePixelRatio || 1);
      this.cssW = r.width; this.cssH = r.height;
      this.pw = Math.max(2, Math.round(r.width * dpr)); this.ph = Math.max(2, Math.round(r.height * dpr));
      if (this.canvas.width !== this.pw || this.canvas.height !== this.ph) { this.canvas.width = this.pw; this.canvas.height = this.ph; }
      if (this.pret) this.cadrage();
      this.sale = true;
      if (!this.E && this.B0) this.repli();
      this.kick();
    }

    /* La caméra, fixe : l'enseigne vue de trois-quarts, un peu d'en dessous. Un décentrement optique
       fait tenir le tout dans l'hôte et fait sortir le bras exactement de la platine de la façade. */
    cadrage() {
      const po = this.B.pose, ens = this.o.mode === 'enseigne' && !!po.cadre, asp = this.pw / this.ph, ax = po.axe, env = po.env;
      const pts = []; // l'enveloppe de la chaussure qui tourne, le cadre, le bras
      for (let k = 0; k < 24; k++) { const a = (k / 24) * CO.TAU; for (const y of env.y) pts.push([ax[0] + Math.cos(a) * env.r, y, ax[1] + Math.sin(a) * env.r]); }
      if (ens) po.cadre.z.forEach((z) => po.cadre.y.forEach((y) => pts.push([-1, y, z], [1, y, z])));
      let c = [0, 0, 0];
      pts.forEach((p) => { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; });
      const el = this.o.elevation != null ? this.o.elevation : ens ? -0.07 : this.o.pose === 'posee' ? 0.2 : 0.04;
      const th = ens ? VUE : 0, D = 360;
      const oeil = [c[0] + Math.sin(th) * Math.cos(el) * D, c[1] + Math.sin(el) * D, c[2] + Math.cos(th) * Math.cos(el) * D];
      const PV = M4.mul(M4.persp(0.26, asp, D - 70, D + 70), M4.lookAt(oeil, c, [0, 1, 0]));
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pts.forEach((p) => { const q = M4.apply(PV, p); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
      let s, tx, ty;
      if (ens) {
        const A = M4.apply(PV, po.ancre), an = this.o.ancre || ANCRE, u = an[0] * 2 - 1, v = 1 - an[1] * 2, lim = (d, e) => (e > 1e-6 ? d / e : 1e9);
        s = Math.min(1.9 / (y1 - y0), lim(0.98 - v, y1 - A[1]), lim(v + 0.98, A[1] - y0), lim(0.98 - u, x1 - A[0]), lim(u + 0.98, A[0] - x0));
        tx = u - s * A[0]; ty = v - s * A[1];
      } else {
        s = Math.min(1.84 / (x1 - x0), 1.84 / (y1 - y0)); tx = (-s * (x0 + x1)) / 2; ty = (-s * (y0 + y1)) / 2;
      }
      this.cam = { oeil, PV: M4.mul(new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, tx, ty, 0, 1]), PV) };
    }

    /* ---------- Les gestes : on lance la chaussure (tap, glisser horizontal) ; la page défile toujours ---------- */
    gestes() {
      const cv = this.canvas;
      cv.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || this.doigt) return;
        this.doigt = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, lt: e.timeStamp, t0: performance.now(), tire: false, defile: false };
      });
      cv.addEventListener('pointermove', (e) => {
        const d = this.doigt;
        if (!d || e.pointerId !== d.id || d.defile) return;
        const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
        if (!d.tire) {
          // on ne prend le geste que franchement horizontal : sinon, la page défile (touch-action: pan-y)
          if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.15) {
            d.tire = true; d.lx = e.clientX; d.lt = e.timeStamp;
            try { cv.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
            cv.style.cursor = 'grabbing';
            this.demi = null;
          } else if (Math.abs(dy) > 10) d.defile = true;
          return;
        }
        const k = (Math.PI * 1.6) / Math.max(90, Math.min(this.cssW || 120, 360)), ddx = e.clientX - d.lx, dt = Math.max(8, e.timeStamp - d.lt) / 1000;
        this.psi += ddx * k;
        this.om = this.om * 0.3 + ((ddx * k) / dt) * 0.7;
        d.lx = e.clientX; d.lt = e.timeStamp;
        this.kick();
      });
      const fin = (e) => {
        const d = this.doigt;
        if (!d || e.pointerId !== d.id) return;
        this.doigt = null;
        cv.style.cursor = 'grab';
        if (d.tire) { if (e.timeStamp - d.lt > 90 || this.fige) this.om = this.fige ? 0 : this.croisiere; } // lâchée à l'arrêt : pas d'élan
        else if (e.type === 'pointerup' && !d.defile && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8 && performance.now() - d.t0 < 450) this.toc();
        this.kick();
      };
      cv.addEventListener('pointerup', fin);
      cv.addEventListener('pointercancel', fin);
      cv.addEventListener('lostpointercapture', fin);
    }

    /* Un tap : on toque sur le bois, et la chaussure repart d'un coup de doigt */
    toc() {
      CO.sfx.play('knock');
      CO.vibrate(8);
      this.lance(2.6);
      this.emet('toc', {});
    }
    /* Une impulsion (rad/s) ; en mouvement réduit, un demi-tour lent au plus */
    lance(v) {
      if (!v) return;
      if (this.fige) {
        if (!this.demi) this.demi = { t0: performance.now(), a: this.psi, da: Math.PI * Math.sign(v), dur: 2600 };
      } else this.om += v;
      this.kick();
    }

    /* ---------- Le temps : la croisière, les élans, le sommeil ---------- */
    vivant() {
      return !this.mort && !this.perdu && !this.pause && this.visible && this.vueActive && !document.hidden && this.pw > 0 && this.host.style.opacity !== '0';
    }
    reveil() { if (this.vivant()) { this.sale = true; this.kick(); } }
    kick() { if (!this.raf && !this.mort && (this.pret || !this.E)) { this.tPrec = 0; this.raf = requestAnimationFrame(this.boucleFn); } }

    boucle(now) {
      this.raf = 0;
      if (!this.vivant() || !this.E) return; // endormi : les observateurs le réveilleront
      const brut = this.tPrec ? now - this.tPrec : 0, dt = brut ? Math.min(0.05, brut / 1000) : 1 / 60;
      this.tPrec = now;
      // résolution adaptative : si les images traînent (moins de ~45 i/s), on dessine moins de pixels
      if (brut && brut < 200 && this.o.qualiteAuto !== false) {
        this.moy = this.moy ? this.moy * 0.95 + brut * 0.05 : brut;
        if (++this.nMoy > 90 && this.moy > 22 && this.dprMax > 1.25) { this.dprMax -= 0.25; this.nMoy = 0; this.moy = 0; this.taille(); }
      }
      const bouge = this.maj(dt, now);
      if (this.sale || bouge) {
        const t0 = performance.now();
        this.dessine();
        this.stats.image = this.stats.image * 0.9 + (performance.now() - t0) * 0.1;
        this.stats.images = (this.stats.images || 0) + 1;
        this.sale = false;
        // l'ombre portée de la façade suit (environ 20 fois par seconde)
        if (now - this.tTourne > 50) { this.tTourne = now; this.emet('tourne', angle(this.psi)); }
      }
      if (bouge) this.raf = requestAnimationFrame(this.boucleFn);
    }

    maj(dt, now) {
      let vif = false;
      if (this.anims.length) {
        this.anims = this.anims.filter((a) => { const p = Math.min(1, (now - a.t0) / a.dur); a.fn(p); if (p >= 1) { a.res(); return false; } return true; });
        vif = true;
      }
      if (this.doigt && this.doigt.tire) vif = true; // le doigt mène
      else if (this.demi) {
        const p = Math.min(1, (now - this.demi.t0) / this.demi.dur);
        this.psi = this.demi.a + this.demi.da * CO.ease.inOutSine(p);
        if (p >= 1) this.demi = null;
        vif = true;
      } else {
        // la croisière : un tour lent, sans fin ; après un élan, la vitesse y revient en douceur
        this.om += (this.croisiere - this.om) * (1 - Math.exp(-dt / 1.5));
        if (Math.abs(this.om) > 0.0004) { this.psi += this.om * dt; vif = true; } else this.om = 0;
      }
      if (this.nuit !== this.nuitCible) { this.nuit += Math.sign(this.nuitCible - this.nuit) * Math.min(Math.abs(this.nuitCible - this.nuit), dt * 1.8); vif = true; }
      return vif;
    }

    /* ---------- Une image ---------- */
    dessine() {
      const E = this.E, gl = E.gl, po = this.B.pose, PV = this.cam.PV;
      gl.viewport(0, 0, this.pw, this.ph);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      // la chaussure tourne sur sa broche ; le cadre, le bras et la broche ne bougent pas
      const Mr = M4.chain(M4.trans(po.axe[0], 0, po.axe[1]), M4.rotY(this.psi)), Mc = M4.mul(Mr, new Float32Array(po.mat));
      const I4 = M4.trans(0, 0, 0), A = AMBIANCES.jour, N = AMBIANCES.nuit, k = CO.ease.inOutSine(this.nuit);
      const mixv = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      const u = (P, M) => {
        gl.useProgram(P.p);
        gl.uniformMatrix4fv(P.u.uPV, false, PV);
        gl.uniformMatrix4fv(P.u.uM, false, M);
        gl.uniformMatrix3fv(P.u.uNM, false, M4.nrm(M));
        gl.uniform3fv(P.u.uEye, this.cam.oeil);
        gl.uniform3fv(P.u.uL1, norme(mixv(A.L1, N.L1)));
        gl.uniform3fv(P.u.uC1, mixv(A.C1, N.C1));
        gl.uniform3fv(P.u.uCiel, mixv(A.ciel, N.ciel));
        gl.uniform3fv(P.u.uSol, mixv(A.sol, N.sol));
        gl.uniform3fv(P.u.uL2, norme(mixv(A.L2, N.L2)));
        gl.uniform3fv(P.u.uC2, mixv(A.C2, N.C2));
        gl.uniform1f(P.u.uAlpha, this.alpha);
        gl.uniform1f(P.u.uGonfle, P === E.prog.bois ? this.gonfle : 0);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, E.bruit);
        gl.uniform1i(P.u.uBruit, 2);
      };
      // ombre douce sous la chaussure seule, posée (elle tourne avec elle)
      if (this.o.mode === 'seule' && this.o.pose === 'posee') {
        const S = E.prog.omb;
        gl.useProgram(S.p);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.uniformMatrix4fv(S.u.uPV, false, PV);
        gl.uniformMatrix4fv(S.u.uM, false, Mr);
        gl.uniform4f(S.u.uR, 0, 0.3, 16.5, 6.2);
        gl.uniform1f(S.u.uA, 0.36 * this.alpha);
        for (let i = 1; i < 3; i++) gl.disableVertexAttribArray(i);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, E.quad);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
      for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
      // le bois
      const Pb = E.prog.bois, C = this.B.carte;
      u(Pb, Mc);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.cote); gl.uniform1i(Pb.u.uCote, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.dessus); gl.uniform1i(Pb.u.uDessus, 1);
      gl.uniform4f(Pb.u.uCx, C.x0, 1 / (C.x1 - C.x0), 0, 0);
      gl.uniform4f(Pb.u.uCyz, C.y1, 1 / (C.y1 - C.y0), C.z1, 1 / (C.z1 - C.z0));
      gl.uniform3f(Pb.u.uAxe, 5.2, -12.5, 0.43);
      gl.uniform3fv(Pb.u.uNoeuds, new Float32Array([3.6, 5.8, 3.9, 24.8, 4.2, -4.3, 16.5, 12.0, -2.8]));
      gl.uniform1f(Pb.u.uRelief, this.relief);
      gl.uniform1f(Pb.u.uMat, 0);
      this.m.tige.forEach((m) => E.dessine(m));
      gl.uniform1f(Pb.u.uMat, 1);
      this.m.semelle.forEach((m) => E.dessine(m));
      // l'acier, immobile
      if (this.m.acier.length) {
        u(E.prog.acier, I4);
        this.m.acier.forEach((m) => E.dessine(m));
      }
    }

    anime(dur, fn) { return new Promise((res) => { this.anims.push({ t0: performance.now(), dur, fn, res }); this.sale = true; this.kick(); }); }

    /* L'apparition : la sculpture sort du bois (le bloc brut se resserre, le grain se révèle)
       et arrive en tournant vite, puis ralentit jusqu'à la croisière */
    entree() {
      if (!this.E || !this.pret) return Promise.resolve();
      if (this.fige) { this.alpha = 1; this.gonfle = 0; this.relief = 1; this.sale = true; this.kick(); return Promise.resolve(); }
      return this.anime(1500, (p) => {
        const e = CO.ease.outCubic(Math.min(1, p / 0.8));
        this.alpha = Math.min(1, p / 0.42);
        this.gonfle = 0.55 * (1 - e);
        this.relief = e;
        this.om = this.croisiere + 5 * (1 - CO.ease.outCubic(p));
      }).then(() => { this.alpha = 1; this.gonfle = 0; this.relief = 1; });
    }

    /* ---------- Sans WebGL : une image de repli (le profil, dessiné en 2D) ---------- */
    repli() {
      this.B0 = this.B0 || coJordanUsine().profil();
      const cv = this.canvas, g = cv.getContext('2d');
      if (!g || !this.pw) return;
      const P = this.B0, ens = this.o.mode === 'enseigne', pointe = this.o.pose !== 'posee', nuit = this.nuitCible > 0.5;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      const s = Math.min(cv.width / (pointe ? 30 : 44), cv.height / (pointe ? 40 : 27)) * 0.92;
      g.translate(cv.width / 2 - (ens ? 1.5 * s : 0), cv.height / 2);
      g.scale(s, s);
      if (ens) { // le cadre de face, et son bras vers la platine (à droite)
        const acier = nuit ? '#4c4238' : '#3B3E42', w = pointe ? 24 : 35, h = pointe ? 36 : 23;
        g.strokeStyle = acier; g.lineWidth = 2; g.lineJoin = 'miter';
        g.strokeRect(-w / 2, -h / 2, w, h);
        g.fillStyle = acier;
        g.fillRect(w / 2, -h / 2 + 0.214 * h - 0.9, (cv.width / s) / 2 - w / 2 + 1.5, 1.8);
      }
      if (pointe) g.rotate(Math.PI / 2);
      g.translate(-15, 9);
      g.scale(1, -1);
      const chemin = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); };
      const tour = [].concat(P.dessous, P.nez, P.haut.slice().reverse(), P.dos.slice().reverse());
      const bois = g.createLinearGradient(0, 18, 0, 0);
      bois.addColorStop(0, nuit ? '#b98a55' : '#DDC096');
      bois.addColorStop(1, nuit ? '#86603a' : '#C09762');
      g.fillStyle = bois;
      chemin(tour); g.closePath(); g.fill();
      g.save();
      chemin(tour); g.closePath(); g.clip();
      g.fillStyle = 'rgba(255, 244, 220, 0.2)'; // la semelle, un ton plus clair
      chemin(P.dessous.concat(P.dessus.slice().reverse())); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(100, 68, 36, 0.6)';
      g.lineWidth = 0.12;
      ['col', 'aile', 'contrefort', SWOOSH ? 'swoosh' : 'neutre', 'oeillere', 'garde'].forEach((nom) => { chemin(P.panneaux[nom]); g.closePath(); g.stroke(); });
      chemin(P.dessus); g.stroke();
      g.restore();
    }

    /* ---------- L'API ---------- */
    emet(ev, d) { (this.ecoute[ev] || []).forEach((fn) => { try { fn(d); } catch (e) { /* un écouteur fautif n'arrête pas l'enseigne */ } }); }
    faitApi() {
      const self = this;
      return {
        canvas: this.canvas,
        setNuit(b) { self.nuitCible = b ? 1 : 0; if (self.fige) self.nuit = self.nuitCible; self.sale = true; self.kick(); if (!self.E) self.repli(); },
        tourner(v) { self.lance(+v || 0); },
        entree() { return self.entree(); },
        pause() { self.pause = true; cancelAnimationFrame(self.raf); self.raf = 0; },
        reprise() { self.pause = false; self.reveil(); },
        detruire() {
          if (self.mort) return;
          self.mort = true;
          cancelAnimationFrame(self.raf);
          [self.io, self.ro, self.mo].forEach((o) => o && o.disconnect());
          if (self.onResize) window.removeEventListener('resize', self.onResize);
          document.removeEventListener('visibilitychange', self.onVis);
          self.anims.forEach((a) => a.res());
          if (self.E) { const x = self.E.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
          self.canvas.remove();
          self.ecoute = {};
        },
        on(ev, fn) { (self.ecoute[ev] = self.ecoute[ev] || []).push(fn); return () => { self.ecoute[ev] = (self.ecoute[ev] || []).filter((f) => f !== fn); }; },
        // mesure : coût moyen d'une image, GPU compris (n images forcées, chacune attendue par la lecture d'un pixel) — pour le labo
        mesure(n) {
          if (!self.E || !self.pret) return 0;
          const gl = self.E.gl, N = n || 30, px = new Uint8Array(4), attend = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          self.dessine(); attend();
          const t0 = performance.now();
          for (let i = 0; i < N; i++) { self.psi += 0.01; self.dessine(); attend(); }
          return (performance.now() - t0) / N;
        },
        get yaw() { return angle(self.psi); },
        get stats() { return self.stats; },
        get cartes() { return self.C ? { lat: self.C.lat, med: self.C.med, dessus: self.C.dessus } : null; },
        get pret() { return !!self.pret; },
      };
    }
  }

  /* Triangles → segments (vue en fil de fer) */
  function filDeFer(I) {
    const L = new Uint16Array(I.length * 2);
    for (let t = 0, n = 0; t < I.length; t += 3) { L[n++] = I[t]; L[n++] = I[t + 1]; L[n++] = I[t + 1]; L[n++] = I[t + 2]; L[n++] = I[t + 2]; L[n++] = I[t]; }
    return L;
  }

  CO.Jordan = {
    SWOOSH,
    create(host, opts) {
      const v = new Enseigne(host, opts);
      return v.charge().then(() => {
        if (!v.E) v.repli();
        if (!v.mort && v.pret && v.fige) v.dessine();
        return v.api;
      }, (err) => {
        // la géométrie a échoué : on garde au moins l'image de repli
        v.E = null;
        v.repli();
        if (window.console) console.warn('Cordo 63 — enseigne 3D indisponible :', err);
        return v.api;
      });
    },
  };
})();
