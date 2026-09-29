/* ==========================================================================
   Cordo 63 — l'ouverture : l'écran lacé, puis délacé
   L'ouverture est aussi l'écran de chargement : elle couvre tout l'écran dès la première image (un
   script dans le <head> pose html.ouverture ; dessous, un fond d'établi sombre, opaque : l'appli qui se
   construit ne se voit pas). Une vingtaine de lacets plats de toutes les couleurs de la boutique viennent
   lacer l'écran : une toile serrée, dessus, dessous. Au milieu, deux lacets enfilés de cubes de bois
   lettrés, les perles des enfants : « CORDO 63 » sur un lacet rouge, et plus petit, « PAR CLÉMENT PETIT »
   sur un lacet crème, replié en deux rangs. Ils s'enfilent : le lacet avance d'un bout à l'autre, chaque
   cube paraît quand le ferret atteint son trou. Puis, tant que l'appli se prépare, les cubes tournent un
   à un sur leur lacet (une vague, une note de marimba chacun : un petit air), et la vague repart ; une
   fois tout chargé (CO.splash({ pret })), la vague finit et paraissent « Entrer » (le geste qui autorise
   le son : l'air ne s'entend avant que si l'on a déjà touché l'écran) et « Entrer sans le son » (une
   étiquette de kraft).
   On entre : sur le beat de l'atelier (la forme en fonte en grosse caisse, le marteau à plat en caisse
   claire, le cutter en charleston), les lacets de la toile filent un à un le long de leur tracé et sortent
   de l'écran, par vagues, de haut en bas (un zip chacun). Puis on arrache les lacets à perles : le lacet
   file à travers les trous, chaque cube lâché tombe (toc, toc, sur une gamme qui monte) ; « CORDO 63 »
   part le dernier, sur l'accord d'enclume, et l'appli est là. Un toucher pendant l'animation la passe.
   Une fois par visite ; ?intro la rejoue, ?nointro la saute ; CO.reduced : un simple fondu.
   Un seul <canvas> et une seule boucle d'images. Chaque lacet de la toile est dessiné une fois (une image
   par couleur : tresse en chevrons, fibres, duvet, bords roulés, ombre portée vers le bas de l'écran),
   puis seulement posé, tourné, glissé ; les croisements « dessus » sont redessinés dans leur losange (un
   chemin de découpe par lacet), et la lumière des croisements (le dos d'âne du lacet qui passe dessus,
   l'ombre de celui qui plonge dessous) est un motif calé sur la ligne de chaque lacet : il ne glisse pas
   avec lui. Posée, la toile n'est plus qu'une image. Chaque cube est dessiné une fois (une vraie
   projection : ses six faces, arêtes arrondies, veines du bois, lettres) ; quand il tourne sur son
   lacet, il est redessiné à chaque image (deux ou trois à la fois) ; au repos, les deux lacets à perles
   ne sont qu'une image.
     CO.splash({ pret }) → Promise, résolue quand l'appli est dévoilée : { revele: true } (ou { skipped: true })
                          pret : une Promise, résolue quand l'appli est chargée (sinon : tout de suite)
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lisse = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const TOUR = Math.PI * 2;
  const BPM = 92;
  const DOUBLE = 60000 / BPM / 4; // une double-croche (ms)
  const KICK = [0, 7, 10, 16, 23, 26];
  const SNARE = [4, 12, 20, 28];
  const PENTA = [0, 2, 4, 7, 9];
  // les couleurs des lacets de l'accueil, et quelques autres de la boutique
  const COULEURS = ['#F2D24B', '#8A927B', '#E03A2E', '#F4EEE2', '#3A2A20', '#232326', '#A8743F', '#56705A', '#FBF8F1', '#CDAE80'];
  const ANGLE = (55 * Math.PI) / 180; // la toile : deux familles de diagonales, à ±55°
  const PAR_FAMILLE = 12;
  const SERRE = 0.8; // la largeur d'un lacet de la toile, rapportée à l'écart entre deux lacets (on voit les mailles)
  // le bas de l'écran, vu depuis un lacet de la toile : le même pour les deux familles, la seconde étant posée en miroir
  const OMBRE = [Math.sin(ANGLE), Math.cos(ANGLE)];
  const DUREE_TIRE = 430, DUREE_ENTREE = 460, DUREE_PERLES = 480;
  const lent = () => CO.ralenti || 1; // le ralenti des labos et des captures (CO.ralenti = 8)
  // les cubes : les couleurs vives des perles d'enfant, et le bois brut (null)
  const CUBES = [[245, 196, 38], [64, 166, 226], [80, 178, 76], [229, 68, 48], [240, 128, 172], [246, 138, 34], null];
  const BOIS = [224, 190, 142];
  const ENCRE = '#17120E';
  const LACETS_PERLES = ['#E03A2E', '#F4EEE2']; // « CORDO 63 » sur le rouge, « PAR CLÉMENT PETIT » sur le crème
  const DESSUS = 'ABCDEFGHIJKLMNOPRSTUVZ'; // les lettres des faces du dessus (au hasard, comme sur les vrais cubes)

  /* ---------- petits outils ---------- */
  const hexRgb = (h) => {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const css = (c, a) => {
    const v = c.map((x) => Math.round(clamp(x, 0, 255))).join(',');
    return a == null || a >= 1 ? `rgb(${v})` : `rgba(${v},${a})`;
  };
  const melange = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const CLAIR = [255, 250, 240];
  // une face plus ou moins éclairée : plus sombre en dessous de 1, blanchie au-dessus
  const teinte = (c, k) => (k <= 1 ? [c[0] * k, c[1] * k, c[2] * k] : melange(c, CLAIR, Math.min(0.5, (k - 1) * 0.8)));
  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  // un polygone convexe aux coins arrondis (le rayon se plie aux côtés courts)
  function arrondi(g, pts, r) {
    const n = pts.length;
    const mil = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mil(pts[n - 1], pts[0]);
    g.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const rr = Math.min(r, 0.45 * Math.hypot(p[0] - a[0], p[1] - a[1]), 0.45 * Math.hypot(b[0] - p[0], b[1] - p[1]));
      const m = mil(p, b);
      g.arcTo(p[0], p[1], m[0], m[1], rr);
    }
    g.closePath();
  }
  function enveloppe(pts) { // l'enveloppe convexe (chaîne monotone)
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const bas = [], haut = [];
    pts.forEach((p) => { while (bas.length >= 2 && x(bas[bas.length - 2], bas[bas.length - 1], p) <= 0) bas.pop(); bas.push(p); });
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (haut.length >= 2 && x(haut[haut.length - 2], haut[haut.length - 1], p) <= 0) haut.pop(); haut.push(p); }
    return bas.slice(0, -1).concat(haut.slice(0, -1));
  }

  /* ---------- le beat de l'atelier : une liste de sons (instant en ms, nom, options) ---------- */
  function beat(t0, pas = 16, ral = 1) {
    const at = (p) => t0 + (p * DOUBLE + (p % 2 ? 18 : 0)) * ral;
    const sons = [];
    KICK.filter((p) => p < pas).forEach((p) => sons.push([at(p), 'kick', {}]));
    SNARE.filter((p) => p < pas).forEach((p) => sons.push([at(p), 'snare', {}]));
    for (let p = 0; p < pas; p += 2) sons.push([at(p) + (p % 4 === 2 ? 22 : 0), 'hat', { v: p % 4 ? 0.7 : 1 }]);
    return { at, sons };
  }
  function sons() {
    if (!CO.sfx || !CO.sfx.ajouter) return;
    const manque = (nom) => !(CO.sfx.existe && CO.sfx.existe(nom));
    // un zip court (le lacet qui file), qui monte d'une vague à l'autre
    if (manque('sp-zip')) CO.sfx.ajouter('sp-zip', (c, o, t, opts, O) => {
      const k = opts.k || 0, v = opts.v || 1;
      const f0 = 1100 + k * 70, f1 = 3200 + k * 110;
      O.noise(c, o, t, { f: f0, f2: f1, q: 2.4, a: 0.012, d: 0.07, hold: 0.12, v: 0.042 * v });
      O.noise(c, o, t + 0.005, { f: 5200, type: 'highpass', a: 0.001, d: 0.012, v: 0.012 * v });
      O.noise(c, o, t + 0.14, { f: 2400, f2: 800, q: 0.8, a: 0.01, d: 0.1, v: 0.016 * v });
    }, { gap: 0 });
    // l'air du chargement : une note par cube qui tourne, une lame de marimba (le bois, une fondamentale qui chante)
    if (manque('sp-tinte')) CO.sfx.ajouter('sp-tinte', (c, o, t, opts, O) => {
      const v = opts.v || 1, f = O.midi(opts.m || 84);
      O.tone(c, o, t, { f, type: 'sine', a: 0.004, d: 0.5, v: 0.05 * v });
      O.tone(c, o, t, { f: f * 3.99, type: 'sine', a: 0.002, d: 0.07, v: 0.011 * v });
      O.strike(c, o, t, f * 0.5, 'wood', { d: 0.05, v: 0.018 * v });
      O.noise(c, o, t, { f: 3200, q: 1.2, a: 0.0008, d: 0.012, v: 0.008 * v });
    }, { gap: 0 });
    // un cube de bois lâché : un « toc » sec, accordé
    if (manque('sp-perle')) CO.sfx.ajouter('sp-perle', (c, o, t, opts, O) => {
      const v = opts.v || 1, f = O.midi(opts.m || 84) * O.rnd(0.992, 1.008);
      O.strike(c, o, t, f, 'wood', { d: 0.08, v: 0.05 * v });
      O.noise(c, o, t, { f: 3800, q: 1.3, a: 0.0006, d: 0.014, v: 0.02 * v });
    }, { gap: 0 });
  }

  /* ======================================================================
     la toile
     ====================================================================== */
  /* la tresse, dessinée une fois pour tous les lacets de la toile : deux motifs (lacets clairs, lacets
     sombres) qui se répètent le long du lacet sans couture : des côtes en chevrons (un creux sombre, une
     crête en points de tresse, chaque côte avec sa phase), des côtes pincées, des fibres claires et sombres.
     Repère du lacet : x le long, y en travers, 0 au milieu (le sommet des chevrons). */
  function tresses(w, dpr, rng) {
    const pas = w * 0.075, pente = 0.62, hw = w / 2;
    const nCol = 40, Lt = nCol * pas, th = w + 6;
    const cols = [];
    for (let c = 0; c < nCol; c++) cols.push([rng() * 0.3, rng() * 0.3, rng(), rng(), rng(), rng()]);
    const fibres = [];
    for (let k = 0, nf = Math.round((Lt * w) / 30); k < nf; k++) fibres.push([rng(), rng(), rng() < 0.5 ? -1 : 1, rng(), rng(), rng()]);
    const faire = (clair) => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(Lt * dpr); cv.height = Math.ceil(th * dpr);
      const g = cv.getContext('2d');
      g.scale(cv.width / Lt, cv.height / th);
      g.translate(0, th / 2);
      g.lineCap = 'round';
      const pt = (x, u, sg) => [x + pente * hw * u, sg * hw * (1 - u)]; // u : 0 au bord, 1 au milieu
      const creux = new Path2D(), cretes = new Path2D(), pinces = new Path2D(), fibC = new Path2D(), fibS = new Path2D();
      [-Lt, 0, Lt].forEach((dx) => {
        cols.forEach((r, c) => {
          const x = c * pas + dx;
          for (let sg = -1; sg <= 1; sg += 2) {
            const a = pt(x, -0.1, sg), b = pt(x, 1, sg);
            creux.moveTo(a[0], a[1]); creux.lineTo(b[0], b[1]);
            const e = pt(x + pas * 0.5, -0.1 - r[sg < 0 ? 0 : 1], sg), d = pt(x + pas * 0.5, 0.97, sg);
            cretes.moveTo(e[0] - pas * 0.09, e[1] - pas * 0.07); cretes.lineTo(d[0] - pas * 0.09, d[1] - pas * 0.07);
            if (r[sg < 0 ? 2 : 3] < 0.5) { const q = pt(x + pas * 0.5, 0.1 + r[sg < 0 ? 4 : 5] * 0.8, sg); pinces.moveTo(q[0] - pas * 0.2, q[1] + sg * pas * 0.12); pinces.lineTo(q[0] + pas * 0.2, q[1] - sg * pas * 0.12); }
          }
        });
        fibres.forEach(([fx, fu, sg, fa, fl, fc]) => {
          const p = pt(fx * Lt + dx, fu, sg);
          const a = Math.atan2(-sg, pente) + (fa - 0.5) * 0.9, len = 0.8 + fl * 2;
          const f = fc < 0.55 ? fibC : fibS;
          f.moveTo(p[0], p[1]); f.lineTo(p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len);
        });
      });
      g.lineWidth = pas * 0.36; g.strokeStyle = clair ? 'rgba(92,64,22,.2)' : 'rgba(0,0,0,.34)'; g.stroke(creux);
      g.setLineDash([pas * 1.25, pas * 0.4]);
      g.lineWidth = pas * 0.28; g.strokeStyle = clair ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.2)'; g.stroke(cretes);
      g.setLineDash([]);
      g.lineWidth = pas * 0.3; g.strokeStyle = clair ? 'rgba(92,64,22,.12)' : 'rgba(0,0,0,.18)'; g.stroke(pinces);
      g.lineWidth = 0.35;
      g.strokeStyle = clair ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.12)'; g.stroke(fibC);
      g.strokeStyle = clair ? 'rgba(80,56,20,.13)' : 'rgba(0,0,0,.2)'; g.stroke(fibS);
      return cv;
    };
    return { clair: faire(true), sombre: faire(false), Lt, th };
  }
  /* un lacet plat, dessiné une fois (une image par couleur) : il pointe vers +x, de 0 à L.
     La tresse (le motif partagé), la teinture un peu inégale, un tube aplati (l'épaule du haut prend la
     lumière, celle du bas est dans l'ombre), un peu de duvet sur les bords, une largeur et une tension
     pas tout à fait régulières, les ferrets. L'ombre portée tombe vers le bas de l'écran. */
  function lacetImage(couleur, L, w, dpr, rng, T) {
    const P = CO.Lacets && CO.Lacets.palette ? CO.Lacets.palette(couleur) : null;
    const base = P ? P.base : couleur, clair = P ? P.clair : false, lu = P ? P.L : 0.3;
    const rb = hexRgb(base);
    const m = Math.ceil(w * 0.5); // la marge de l'ombre
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((L + 2 * m) * dpr);
    cv.height = Math.ceil((w + 2 * m) * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(m, m + w / 2);
    const hw = w / 2, La = w * 0.95, Tp = w * 0.55, da = w * 0.36;
    // un lacet n'est jamais tout à fait régulier : sa largeur respire, sa ligne flotte un peu (la tension)
    const ph = [rng(), rng(), rng(), rng()].map((x) => x * TOUR);
    const l1 = w * (2.4 + rng() * 1.5), l2 = w * (6 + rng() * 3), l3 = w * (3.5 + rng() * 2), l4 = w * (8 + rng() * 4);
    const bout = (x) => Math.min(x - La, L - La - x);
    const yc = (x) => w * (0.03 * Math.sin((TOUR * x) / l3 + ph[2]) + 0.018 * Math.sin((TOUR * x) / l4 + ph[3])) * lisse(bout(x) / (w * 1.6));
    const h = (x) => hw * (1 + 0.03 * Math.sin((TOUR * x) / l1 + ph[0]) + 0.02 * Math.sin((TOUR * x) / l2 + ph[1])) * (0.34 + 0.66 * lisse(bout(x) / Tp));
    const x0 = La - 1, x1 = L - La + 1, n = Math.max(24, Math.ceil((x1 - x0) / 3));
    const X = new Float32Array(n + 1), C = new Float32Array(n + 1), E = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n; X[k] = x; C[k] = yc(x); E[k] = h(x); }
    const bande = new Path2D();
    for (let k = 0; k <= n; k++) { const y = C[k] - E[k] + (rng() - 0.5) * 0.3; if (k) bande.lineTo(X[k], y); else bande.moveTo(X[k], y); }
    for (let k = n; k >= 0; k--) bande.lineTo(X[k], C[k] + E[k] + (rng() - 0.5) * 0.3);
    bande.closePath();
    // l'ombre : un voile doux tout autour, et l'ombre portée vers le bas de l'écran
    g.save();
    g.fillStyle = base;
    g.shadowColor = 'rgba(28, 16, 6, .16)';
    g.shadowBlur = w * 0.3 * dpr;
    g.fill(bande);
    g.shadowColor = 'rgba(28, 16, 6, .42)';
    g.shadowBlur = w * 0.15 * dpr;
    g.shadowOffsetX = OMBRE[0] * w * 0.09 * dpr;
    g.shadowOffsetY = OMBRE[1] * w * 0.09 * dpr;
    g.fill(bande);
    g.restore();
    // la tranche (l'épaisseur, côté ombre), puis la face
    g.save(); g.translate(OMBRE[0] * w * 0.032, OMBRE[1] * w * 0.032); g.fillStyle = P ? P.tranche : 'rgba(0,0,0,.4)'; g.fill(bande); g.restore();
    g.fillStyle = base;
    g.fill(bande);
    // la tresse (le motif partagé, calé au hasard le long du lacet ; plus ou moins marqué selon la couleur)
    g.save();
    g.clip(bande);
    if (T) {
      const src = clair ? T.clair : T.sombre;
      const mo = g.createPattern(src, 'repeat');
      if (mo && typeof mo.setTransform === 'function' && typeof DOMMatrix === 'function') {
        mo.setTransform(new DOMMatrix([T.Lt / src.width, 0, 0, T.th / src.height, rng() * T.Lt, -T.th / 2]));
        g.fillStyle = mo;
        g.globalAlpha = clair ? 1 : clamp(0.55 + 0.9 * lu, 0.55, 1);
        g.fillRect(x0 - 2, -hw * 1.3, x1 - x0 + 4, w * 1.3);
        g.globalAlpha = 1;
      }
    }
    // la teinture n'est pas tout à fait égale : de grandes taches très douces
    for (let x = x0 + rng() * w; x < x1; x += w * (0.8 + rng() * 1.6)) {
      const r = w * (0.5 + rng() * 0.9), gr = g.createRadialGradient(x, 0, 0, x, 0, r);
      gr.addColorStop(0, rng() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, -hw * 1.2, 2 * r, w * 1.2);
    }
    // le volume : un tube aplati ; l'épaule du haut prend la lumière, celle du bas s'enroule dans l'ombre
    const vol = g.createLinearGradient(0, -hw, 0, hw);
    vol.addColorStop(0, clair ? 'rgba(70,48,16,.1)' : 'rgba(0,0,0,.14)');
    vol.addColorStop(0.1, clair ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.1)');
    vol.addColorStop(0.3, 'rgba(255,255,255,.05)');
    vol.addColorStop(0.55, 'rgba(0,0,0,0)');
    vol.addColorStop(0.8, clair ? 'rgba(70,48,16,.08)' : 'rgba(0,0,0,.12)');
    vol.addColorStop(1, clair ? 'rgba(70,48,16,.26)' : 'rgba(0,0,0,.36)');
    g.fillStyle = vol;
    g.fillRect(x0 - 2, -hw * 1.3, x1 - x0 + 4, w * 1.3);
    g.restore();
    // les bords, qui suivent le vrai bord (la largeur varie) : doux
    const lisere = (o, coul, lw) => {
      g.beginPath();
      for (let k = 0; k <= n; k++) { const y = C[k] + E[k] * o; if (k) g.lineTo(X[k], y); else g.moveTo(X[k], y); }
      g.strokeStyle = coul; g.lineWidth = lw; g.stroke();
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    lisere(-0.68, clair ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)', w * 0.2);
    lisere(0.74, clair ? 'rgba(70,48,16,.06)' : 'rgba(0,0,0,.08)', w * 0.26);
    lisere(0.97, clair ? 'rgba(70,48,16,.14)' : 'rgba(0,0,0,.2)', w * 0.06);
    g.globalAlpha = 0.55; g.lineWidth = w * 0.018; g.strokeStyle = P ? P.bord : 'rgba(0,0,0,.4)'; g.stroke(bande); g.globalAlpha = 1;
    // le duvet : de petits poils qui dépassent des bords
    const duvet = new Path2D();
    for (let k = 0; k <= n; k++) {
      for (let sg = -1; sg <= 1; sg += 2) {
        if (rng() > 0.4) continue;
        const x = X[k] + rng() * 3, y = C[k] + sg * E[k] * 0.985;
        const a = sg * 1.5708 + (rng() - 0.5) * 2.2, len = 0.5 + rng() * rng() * 2.6;
        duvet.moveTo(x, y);
        duvet.quadraticCurveTo(x + Math.cos(a) * len * 0.6 + (rng() - 0.5) * 0.8, y + Math.sin(a) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len);
      }
    }
    g.lineWidth = 0.4; g.strokeStyle = css(melange(rb, BLANC(clair), clair ? 0.1 : 0.28), 0.55); g.stroke(duvet);
    // les ferrets : des tubes (métal ou plastique selon la couleur), aux deux bouts
    const mat = (P && CO.Lacets.METAUX[P.ferret]) || (CO.Lacets && CO.Lacets.METAUX && CO.Lacets.METAUX.nickel) || [[0, '#444'], [0.3, '#eee'], [1, '#333']];
    const ferret = (xa, sens) => {
      g.save();
      g.translate(xa, 0);
      g.scale(sens, 1);
      const rr = da / 2, tip = rr * 0.84;
      const tube = new Path2D();
      tube.moveTo(0, -rr * 1.06); tube.lineTo(La - tip, -tip);
      tube.quadraticCurveTo(La + tip * 0.15, -tip, La + tip * 0.15, 0);
      tube.quadraticCurveTo(La + tip * 0.15, tip, La - tip, tip);
      tube.lineTo(0, rr * 1.06); tube.closePath();
      g.save();
      g.shadowColor = 'rgba(38, 24, 10, .35)'; g.shadowBlur = w * 0.12 * dpr; g.shadowOffsetX = OMBRE[0] * sens * w * 0.06 * dpr; g.shadowOffsetY = OMBRE[1] * w * 0.06 * dpr;
      const gr = g.createLinearGradient(0, -rr, 0, rr);
      mat.forEach(([o, c]) => gr.addColorStop(o, c));
      g.fillStyle = gr; g.fill(tube);
      g.restore();
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 0.6; g.stroke(tube);
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(0.8, rr * 0.2); g.beginPath(); g.moveTo(1.6, -rr * 0.46); g.lineTo(La - tip * 0.9, -tip * 0.42); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(2.4, -rr); g.lineTo(2.4, rr); g.moveTo(3.9, -rr); g.lineTo(3.9, rr); g.stroke();
      g.restore();
    };
    ferret(La, -1);
    ferret(L - La, 1);
    return { cv, m, L, w };
  }
  function BLANC(clair) { return clair ? [255, 255, 255] : [255, 246, 230]; }

  /* la lumière des croisements, vue depuis un lacet (x le long, y en travers ; la même image pour les deux
     familles) : un motif d'une période (deux croisements) : là où il passe dessus, le dos d'âne s'éclaire,
     ses pentes prennent ou perdent la lumière ; là où il plonge dessous, il s'assombrit au ras du lacet qui
     le couvre (l'ombre d'ambiance). Il est calé sur la ligne du lacet, pas sur le lacet : il ne glisse pas. */
  function motifCroisements(ctx, w, Delta, dir) {
    if (typeof DOMMatrix !== 'function') return null;
    let nx = -dir[1], ny = dir[0];
    if (nx < 0) { nx = -nx; ny = -ny; }
    const P = 2 * Delta, tw = Math.max(16, Math.round(P)), hT = w / 2 + 2, th = Math.ceil(2 * hT);
    const cv = document.createElement('canvas');
    cv.width = tw; cv.height = th;
    const g = cv.getContext('2d');
    const im = g.createImageData(tw, th), D = im.data;
    const hc = w / 2, lam = w * 0.2, bosse = hc + w * 0.3;
    for (let j = 0; j < th; j++) {
      const y = ((j + 0.5) / th) * 2 * hT - hT;
      for (let i = 0; i < tw; i++) {
        const x = ((i + 0.5) / tw) * P;
        const q0 = x * nx + y * ny, qP = (x - P) * nx + y * ny;
        const dO = Math.min(Math.abs(q0), Math.abs(qP));
        const dU = Math.abs((x - Delta) * nx + y * ny);
        let xs = q0 / nx; // le long du lacet, depuis le croisement « dessus »
        if (xs > Delta) xs -= P; else if (xs < -Delta) xs += P;
        let v = 0.13 * Math.max(0, 1 - (dO / bosse) * (dO / bosse)) - 0.07 * Math.sin((Math.PI * xs) / Delta);
        const u = dU - hc;
        v -= u <= 0 ? 0.36 : 0.36 * Math.exp(-u / lam);
        const o = (j * tw + i) * 4;
        if (v >= 0) { D[o] = 255; D[o + 1] = 249; D[o + 2] = 236; D[o + 3] = Math.round(Math.min(1, v) * 255); }
        else { D[o] = 22; D[o + 1] = 12; D[o + 2] = 4; D[o + 3] = Math.round(Math.min(1, -v) * 255); }
      }
    }
    g.putImageData(im, 0, 0);
    const motif = ctx.createPattern(cv, 'repeat');
    if (!motif || typeof motif.setTransform !== 'function') return null;
    return { motif, hT, mat: new DOMMatrix([P / tw, 0, 0, (2 * hT) / th, 0, -hT]) };
  }

  /* le croisillon : deux familles de diagonales qui couvrent tout l'écran, un peu irrégulières
     (un rien d'angle, d'écart et de largeur en plus ou en moins) */
  function lacis(W, H, rng) {
    const cx = W / 2, cy = H / 2;
    const fams = [ANGLE, -ANGLE].map((a) => {
      const d = [Math.cos(a), Math.sin(a)], nrm = [-d[1], d[0]];
      const E = Math.abs(W * nrm[0]) + Math.abs(H * nrm[1]);
      return { a, d, nrm, s: E / (PAR_FAMILLE - 0.6) };
    });
    const w = Math.min(fams[0].s, fams[1].s) * SERRE;
    const long = Math.abs(W * Math.cos(ANGLE)) + Math.abs(H * Math.sin(ANGLE)); // la plus longue corde
    const L = long + w * 2.6;
    const lacets = [];
    fams.forEach((F, f) => {
      for (let i = 0; i < PAR_FAMILLE; i++) {
        const a = F.a + (rng() - 0.5) * 0.012;
        const d = [Math.cos(a), Math.sin(a)], nrm = [-d[1], d[0]];
        const off = (i - (PAR_FAMILLE - 1) / 2) * F.s + (rng() - 0.5) * F.s * 0.07;
        const c = [cx + F.nrm[0] * off, cy + F.nrm[1] * off];
        const glisse = (rng() - 0.5) * w * 2.2; // les bouts ne tombent pas tous au même endroit : des ferrets pointent au bord
        const t0 = -(L / 2 + glisse);
        lacets.push({ f, i, d, nrm, c, t0, debut: [c[0] + d[0] * t0, c[1] + d[1] * t0], ep: 0.94 + rng() * 0.12, o: 0, parti: false, sens: rng() < 0.5 ? 1 : -1, miroir: f === 1, phase: 0 });
      }
    });
    // les couleurs : distribuées d'un paquet mélangé (chacune deux ou trois fois), jamais deux voisines pareilles
    const paquet = [];
    while (paquet.length < lacets.length + COULEURS.length) {
      const tour = COULEURS.map((c, i) => i);
      for (let i = tour.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [tour[i], tour[j]] = [tour[j], tour[i]]; }
      paquet.push(...tour);
    }
    lacets.forEach((l, k) => {
      const voisin = k % PAR_FAMILLE ? lacets[k - 1].ci : -1, vis = k >= PAR_FAMILLE ? lacets[k - PAR_FAMILLE].ci : -1;
      let j = 0;
      while (j < paquet.length - 1 && (paquet[j] === voisin || paquet[j] === vis)) j++;
      l.ci = paquet.splice(j, 1)[0];
    });
    // les croisements (armure toile : un sur deux) : les losanges où la première famille passe dessus,
    // et la phase de la lumière de chaque lacet (son croisement « dessus » le plus proche du milieu)
    const inter = (P1, d1, P2, d2) => { const den = d1[0] * d2[1] - d1[1] * d2[0]; const t = ((P2[0] - P1[0]) * d2[1] - (P2[1] - P1[1]) * d2[0]) / den; return [P1[0] + d1[0] * t, P1[1] + d1[1] * t]; };
    const decale = (P, n, k) => [P[0] + n[0] * k, P[1] + n[1] * k];
    const para = (a, ha, b, hb) => {
      const A1 = decale(a.c, a.nrm, -ha), A2 = decale(a.c, a.nrm, ha), B1 = decale(b.c, b.nrm, -hb), B2 = decale(b.c, b.nrm, hb);
      return [inter(A1, a.d, B1, b.d), inter(A2, a.d, B1, b.d), inter(A2, a.d, B2, b.d), inter(A1, a.d, B2, b.d)];
    };
    const onde = w * 0.05; // le flottement de la ligne et du bord
    const sm = w * 0.4, portee = w * 0.3; // l'ombre du lacet du dessus ; celle du lacet du dessous, à recouvrir
    const A = lacets.filter((l) => l.f === 0), B = lacets.filter((l) => l.f === 1);
    const phases = new Map();
    lacets.forEach((l) => phases.set(l, Infinity));
    A.forEach((a) => {
      a.dessus = new Path2D();
      B.forEach((b) => {
        const X = inter(a.c, a.d, b.c, b.d);
        if ((a.i + b.i) % 2 === 0) {
          const xa = (X[0] - a.c[0]) * a.d[0] + (X[1] - a.c[1]) * a.d[1];
          if (Math.abs(xa) < Math.abs(phases.get(a))) phases.set(a, xa);
          const ha = (w * a.ep) / 2, hb = (w * b.ep) / 2;
          // deux losanges : le lacet A sur toute la largeur de B et de son ombre ; l'ombre de A sur B
          [para(a, ha + onde, b, hb + portee), para(a, ha + sm, b, hb + onde + 1)].forEach((p) => {
            a.dessus.moveTo(p[0][0], p[0][1]);
            for (let k = 1; k < 4; k++) a.dessus.lineTo(p[k][0], p[k][1]);
            a.dessus.closePath();
          });
        } else {
          const xb = -((X[0] - b.c[0]) * b.d[0] + (X[1] - b.c[1]) * b.d[1]); // le repère de B est en miroir
          if (Math.abs(xb) < Math.abs(phases.get(b))) phases.set(b, xb);
        }
      });
    });
    lacets.forEach((l) => { const p = phases.get(l); l.phase = isFinite(p) ? p : 0; });
    const d0 = fams[0].d, n0 = fams[0].nrm, d1 = fams[1].d, n1 = fams[1].nrm;
    const Delta = fams[1].s / Math.abs(d0[0] * n1[0] + d0[1] * n1[1]); // l'écart entre deux croisements, le long d'un lacet
    const croise = [d1[0] * d0[0] + d1[1] * d0[1], d1[0] * n0[0] + d1[1] * n0[1]];
    return { lacets, w, L, Delta, croise };
  }

  /* ======================================================================
     les perles : des cubes de bois lettrés, enfilés
     ====================================================================== */
  const mul3 = (A, B) => { const C = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return C; };
  const app3 = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  // autour de la verticale, vers nous (on voit le dessus), dans le plan de l'écran ; et d'abord « tour » :
  // le cube qui tourne sur son lacet (l'axe des trous, x), le dessus qui vient vers nous puis descend
  function rotation(lacet, bascule, roulis, tour = 0) {
    const cy = Math.cos(lacet), sy = Math.sin(lacet), ct = Math.cos(bascule), st = Math.sin(bascule), cr = Math.cos(roulis), sr = Math.sin(roulis);
    const R = mul3([cr, -sr, 0, sr, cr, 0, 0, 0, 1], mul3([1, 0, 0, 0, ct, -st, 0, st, ct], [cy, 0, sy, 0, 1, 0, -sy, 0, cy]));
    if (!tour) return R;
    const ca = Math.cos(tour), sa = Math.sin(tour);
    return mul3(R, [1, 0, 0, 0, ca, -sa, 0, sa, ca]);
  }
  // les six faces (x à droite, y en haut, z vers nous) ; u, v : la droite et le bas de la lettre de la face
  // (u × v = −n : aucune lettre en miroir ; chacune se lit droite quand le cube tourne et l'amène devant)
  const FACES = [
    { nom: 'avant', n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
    { nom: 'dessus', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { nom: 'arriere', n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] },
    { nom: 'dessous', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { nom: 'gauche', n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
    { nom: 'droite', n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  ];
  const LUMIERE = (() => { const v = [-0.2, 0.75, 0.95], k = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / k); })();
  const eclat = (n) => 0.42 + 0.58 * Math.max(0, n[0] * LUMIERE[0] + n[1] * LUMIERE[1] + n[2] * LUMIERE[2]);

  // la géométrie d'un cube tourné (projection orthogonale) : sa silhouette, ses faces vues, ses deux trous
  // (tour : l'angle du cube sur son lacet ; les trous, sur l'axe, ne bougent pas)
  function geomCube(s, lacet, bascule, roulis, tour = 0) {
    const h = s / 2, R = rotation(lacet, bascule, roulis, tour);
    const P = (v) => { const p = app3(R, v); return [p[0], -p[1]]; };
    const coins = [];
    [-h, h].forEach((x) => [-h, h].forEach((y) => [-h, h].forEach((z) => coins.push(P([x, y, z])))));
    const coque = enveloppe(coins);
    const faces = [];
    FACES.forEach((F) => {
      const n = app3(R, F.n);
      if (n[2] > 0.035) faces.push({ F, n, c: P([F.n[0] * h, F.n[1] * h, F.n[2] * h]), U: P(F.u), V: P(F.v) });
    });
    const fc = faces.find((f) => f.F.nom === 'gauche' || f.F.nom === 'droite');
    const cote = fc ? (fc.F.nom === 'gauche' ? 'g' : 'd') : null;
    const face = fc ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [fc.c[0] + h * (a * fc.U[0] + b * fc.V[0]), fc.c[1] + h * (a * fc.U[1] + b * fc.V[1])]) : null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    coque.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return { s, h, R, coque, faces, trouG: P([-h, 0, 0]), trouD: P([h, 0, 0]), cote, face, x0, y0, x1, y1 };
  }
  // les veines : le fil du bois sur les faces de long, les cernes (le bois de bout) sur le dessus
  // (trois tracés par face, du plus pâle au plus marqué)
  function veinage(g, face, h, rng, force) {
    const paquets = [new Path2D(), new Path2D(), new Path2D()];
    if (face === 'dessus') {
      const cx = (rng() < 0.5 ? -1 : 1) * h * (1.4 + rng()), cy = h * (rng() * 2 - 1) * 1.2;
      for (let r = h * (0.4 + rng() * 0.3); r < h * 4.2; r += h * (0.1 + rng() * 0.12)) {
        const p = paquets[Math.floor(rng() * 3)];
        for (let k = 0; k <= 32; k++) {
          const a = (k / 32) * TOUR, q = 1 + 0.035 * Math.sin(a * 3 + r);
          const x = cx + Math.cos(a) * r * q, y = cy + Math.sin(a) * r * q;
          if (k) p.lineTo(x, y); else p.moveTo(x, y);
        }
      }
    } else {
      for (let x = -h - rng() * 2; x < h + 2; x += 1.2 + rng() * 2.6) {
        const p = paquets[Math.floor(rng() * 3)], amp = 0.4 + rng() * 1.3, fr = 0.05 + rng() * 0.08, ph = rng() * TOUR;
        for (let y = -h - 1; y <= h + 1; y += 2.5) { const xx = x + Math.sin(y * fr + ph) * amp; if (y > -h - 1) p.lineTo(xx, y); else p.moveTo(xx, y); }
      }
    }
    g.lineCap = 'round';
    [0.09, 0.16, 0.25].forEach((a, i) => { g.strokeStyle = `rgba(110,64,26,${(a * force).toFixed(3)})`; g.lineWidth = 0.45 + i * 0.3; g.stroke(paquets[i]); });
  }
  const CAPS = new Map();
  // une lettre au milieu d'une face (repère de la face, de -h à h) : capitale grasse, noire
  function lettre(g, ch, h, police, alpha) {
    if (!ch || ch === ' ') return;
    g.save();
    const ref = h * 2;
    g.font = `800 ${ref.toFixed(1)}px ${police}`;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const cle = police + ref.toFixed(1);
    if (!CAPS.has(cle)) CAPS.set(cle, g.measureText('H').actualBoundingBoxAscent || ref * 0.7);
    const capH = CAPS.get(cle);
    const m = g.measureText(ch);
    const asc = m.actualBoundingBoxAscent != null ? m.actualBoundingBoxAscent : capH, desc = m.actualBoundingBoxDescent || 0;
    const gau = m.actualBoundingBoxLeft != null ? m.actualBoundingBoxLeft : 0, dro = m.actualBoundingBoxRight != null ? m.actualBoundingBoxRight : m.width;
    let k = (ref * 0.6) / capH;
    k *= Math.min(1, (ref * 0.84) / ((asc + desc) * k), (ref * 0.8) / ((gau + dro) * k));
    g.scale(k, k);
    g.globalAlpha = alpha;
    g.fillStyle = ENCRE;
    g.fillText(ch, (gau - dro) / 2, (asc - desc) / 2);
    g.restore();
  }
  function trou(g, s) { // le trou du lacet, un peu fraisé
    const r = s * 0.15;
    const gr = g.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
    gr.addColorStop(0, '#0E0906'); gr.addColorStop(0.7, '#2A1A0E'); gr.addColorStop(1, 'rgba(60,38,20,.9)');
    g.beginPath(); g.arc(0, 0, r, 0, TOUR); g.fillStyle = gr; g.fill();
    g.beginPath(); g.arc(0, 0, r * 1.14, 0.3, 2.6); g.strokeStyle = 'rgba(255,240,215,.35)'; g.lineWidth = r * 0.26; g.stroke();
  }
  function usure(g, h, rng) { // la peinture un peu usée aux arêtes : le bois paraît
    g.fillStyle = 'rgba(236,212,170,.55)';
    for (let k = 0; k < 6; k++) {
      const bord = Math.floor(rng() * 4), t = (rng() * 2 - 1) * h * 0.8, e = h - rng() * 1.2;
      const x = bord < 2 ? t : bord === 2 ? -e : e, y = bord < 2 ? (bord ? e : -e) : t;
      g.beginPath(); g.ellipse(x, y, 0.4 + rng() * 1.1, 0.3 + rng() * 0.6, rng() * 3, 0, TOUR); g.fill();
    }
  }
  // un cube dessiné à sa rotation : le corps, puis chaque face vue (teinte selon sa lumière, veines, arêtes
  // arrondies qui prennent ou perdent la lumière, lettre ou trou). Le hasard de chaque face vient de la graine
  // du cube : quand il tourne, ses veines et son usure ne changent pas d'une image à l'autre. cible : un
  // canvas à réutiliser (le cube qui tourne, redessiné à chaque image), sinon un neuf. ref : la lumière de
  // la face avant au repos (les faces gardent leur teinte en tournant).
  function dessinerCube(geo, o, dpr, police, rng, cible, ref) {
    const { s, h, R, coque, faces } = geo;
    const r = s * 0.12, marge = 2;
    const cx = -geo.x0 + marge, cy = -geo.y0 + marge;
    const lw = geo.x1 - geo.x0 + 2 * marge, lh = geo.y1 - geo.y0 + 2 * marge;
    const cv = cible || document.createElement('canvas');
    const W2 = Math.ceil(lw * dpr), H2 = Math.ceil(lh * dpr);
    if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
    const g = cv.getContext('2d');
    if (cible) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); }
    const base = o.bois ? BOIS : o.couleur;
    if (ref == null) ref = eclat(app3(R, [0, 0, 1]));
    const hasard = (k) => (CO.rng && o.graine != null ? CO.rng(o.graine * 7 + k * 7919) : rng);
    g.setTransform(dpr, 0, 0, dpr, dpr * cx, dpr * cy);
    g.beginPath(); arrondi(g, coque, r); g.fillStyle = css(teinte(base, 0.74)); g.fill();
    faces.forEach(({ F, n, c, U, V }) => {
      const rf = hasard(FACES.indexOf(F) + 1);
      g.save();
      g.setTransform(dpr * U[0], dpr * U[1], dpr * V[0], dpr * V[1], dpr * (cx + c[0]), dpr * (cy + c[1]));
      g.beginPath(); rrect(g, -h, -h, 2 * h, 2 * h, r);
      g.fillStyle = css(teinte(base, eclat(n) / ref)); g.fill();
      g.clip();
      if (o.bois) veinage(g, F.nom === 'dessous' ? 'dessus' : F.nom, h, rf, 1); // les veines sur le bois brut (la peinture les couvre) ; dessus, dessous : le bois de bout
      // les arêtes arrondies : chaque bord prend la lumière de sa propre pente
      const bw = s * 0.16;
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([ea, eb]) => {
        const nb = [ea * F.u[0] + eb * F.v[0], ea * F.u[1] + eb * F.v[1], ea * F.u[2] + eb * F.v[2]];
        const ne = app3(R, [(F.n[0] + nb[0]) * Math.SQRT1_2, (F.n[1] + nb[1]) * Math.SQRT1_2, (F.n[2] + nb[2]) * Math.SQRT1_2]);
        const dk = eclat(ne) - eclat(n);
        if (Math.abs(dk) < 0.012) return;
        const gr = ea ? g.createLinearGradient(ea * h, 0, ea * (h - bw), 0) : g.createLinearGradient(0, eb * h, 0, eb * (h - bw));
        const a = Math.min(0.45, Math.abs(dk) * 1.6).toFixed(3), t = dk > 0 ? '255,250,238' : '24,14,6';
        gr.addColorStop(0, `rgba(${t},${a})`); gr.addColorStop(1, `rgba(${t},0)`);
        g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h);
      });
      if (F.nom === 'avant') {
        const gr = g.createLinearGradient(0, -h, 0, h);
        gr.addColorStop(0.55, 'rgba(24,14,6,0)'); gr.addColorStop(1, 'rgba(24,14,6,.12)');
        g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h);
        lettre(g, o.lettre, h, police, 0.94);
        if (!o.bois) usure(g, h, rf);
        // le vernis accroche la lumière sur l'arête du dessus
        g.beginPath(); g.moveTo(-h + r, -h + 0.9); g.lineTo(h - r, -h + 0.9);
        g.strokeStyle = o.bois ? 'rgba(255,248,230,.3)' : 'rgba(255,255,255,.42)'; g.lineWidth = 1; g.stroke();
      } else if (F.nom === 'dessus') {
        const gr = g.createLinearGradient(0, -h, 0, h);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.14)');
        g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h);
        g.rotate((o.tour * Math.PI) / 2);
        lettre(g, o.dessus, h * 0.84, police, 0.72);
      } else if (F.nom === 'arriere' || F.nom === 'dessous') { // on ne les voit que quand le cube tourne
        lettre(g, F.nom === 'arriere' ? o.arriere : o.dessous, h, police, 0.9);
        if (!o.bois) usure(g, h, rf);
      } else trou(g, s);
      g.restore();
    });
    g.setTransform(dpr, 0, 0, dpr, dpr * cx, dpr * cy);
    g.beginPath(); arrondi(g, coque, r); g.strokeStyle = 'rgba(30,18,8,.4)'; g.lineWidth = 0.7; g.stroke();
    return { cv, cx, cy, w: lw, h: lh };
  }
  function ombreImage(s, dpr) { // l'ombre douce d'un cube, sur ce qui est dessous
    const m = s * 0.45, t = s * 1.05, T = t + 2 * m;
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(T * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.shadowColor = 'rgba(24,14,6,.5)'; g.shadowBlur = s * 0.2 * dpr; g.shadowOffsetX = 2000 * dpr;
    g.fillStyle = '#000';
    g.beginPath(); rrect(g, m - 2000, m, t, t, s * 0.22); g.fill();
    return { cv, c: T / 2, t: T };
  }

  /* la disposition : « CORDO 63 » (un rang, lacet rouge), « PAR CLÉMENT » puis « PETIT » (un lacet crème
     replié : il passe dans « PETIT », fait une boucle à droite, revient par « PAR CLÉMENT »). Les rangs font
     un léger sourire ; chaque cube est un peu tourné. Coordonnées : x sur l'écran, y depuis le haut du bloc. */
  function planPerles(W, H, rng) {
    const bord = W < 360 ? 8 : 12;
    const dispo = Math.min(W - 2 * bord, 640);
    const K = 1.12, GP = 0.19, ESP = 0.62; // la largeur vue d'un cube, le lacet entre deux cubes, un blanc (en cubes)
    const s1 = clamp(Math.min(dispo / (7 * K + 5 * GP + ESP + 1.05), H * 0.075), 20, 58);
    const s2 = clamp(Math.min(s1 * 0.7, dispo / (10 * K + 8 * GP + ESP + 1.75)), 15, 40);
    let paquet = [], prec = -1;
    const couleur = () => { // d'un paquet mélangé, jamais deux voisines pareilles
      if (paquet.length < 3) {
        const t = CUBES.map((c, i) => i);
        for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const x = t[i]; t[i] = t[j]; t[j] = x; }
        paquet = paquet.concat(t);
      }
      let j = 0;
      while (j < paquet.length - 1 && paquet[j] === prec) j++;
      prec = paquet.splice(j, 1)[0];
      return prec;
    };
    const largeur = (texte, s) => { let n = 0, e = 0; for (const ch of texte) { if (ch === ' ') e++; else n++; } return s * (n * K + (n - 1) * GP + e * ESP); };
    let nRang = -1;
    const rang = (texte, s, y, x0, sens) => {
      nRang++;
      const long = largeur(texte, s), sag = 0.09 * s, mil = x0 + long / 2;
      const cubes = [];
      let x = x0;
      for (const ch of texte) {
        if (ch === ' ') { x += s * ESP; continue; }
        const cx = x + (s * K) / 2, u = (cx - mil) / (long / 2);
        const pente = (-4 * sag * u) / long;
        const ci = couleur();
        const ang = [(rng() < 0.5 ? -1 : 1) * (0.14 + rng() * 0.2), 0.27 + rng() * 0.13, -Math.atan(pente) + (rng() - 0.5) * 0.12];
        const geo = geomCube(s, ang[0], ang[1], ang[2]);
        const autre = () => DESSUS[Math.floor(rng() * DESSUS.length)];
        cubes.push({
          lettre: ch, s, x: cx, y: y + sag * (1 - u * u), sens, couleur: CUBES[ci], bois: !CUBES[ci], dessus: autre(), arriere: autre(), dessous: autre(),
          tour: Math.floor(rng() * 4), ang, geo, ref: eclat(app3(geo.R, [0, 0, 1])), graine: Math.floor(rng() * 1e6), rang: nRang,
          etat: { dx: 0, dy: 0, a: 0, sc: 1, al: 1, tour: 0 }, chute: null,
        });
        x += s * (K + GP);
      }
      return { cubes, x0, x1: x0 + long };
    };
    const y1 = 0.74 * s1;
    const r1 = rang('CORDO 63', s1, y1, (W - largeur('CORDO 63', s1)) / 2, 1);
    const y2a = y1 + 1.11 * s1 + 0.66 * s2, y2b = y2a + 1.62 * s2;
    const r2a = rang('PAR CLÉMENT', s2, y2a, (W - largeur('PAR CLÉMENT', s2)) / 2, -1);
    const r2b = rang('PETIT', s2, y2b, r2a.x1 - largeur('PETIT', s2), 1);
    const lacets = [
      { couleur: LACETS_PERLES[0], s: s1, wl: Math.max(3.2, s1 * 0.17), cubes: r1.cubes, sensTire: 1, boucle: -1, depuis: 'debut' },
      { couleur: LACETS_PERLES[1], s: s2, wl: Math.max(2.6, s2 * 0.18), cubes: r2b.cubes.concat(r2a.cubes.slice().reverse()), sensTire: -1, boucle: r2b.cubes.length, depuis: 'fin' },
    ];
    let haut = Infinity, bas = -Infinity;
    lacets.forEach((lc) => {
      lc.P = CO.Lacets && CO.Lacets.palette ? CO.Lacets.palette(lc.couleur) : { base: lc.couleur, bord: '#5A2A1A', tranche: '#5A2A1A', clair: false, ferret: 'nickel' };
      lc.mat = (CO.Lacets && CO.Lacets.METAUX && CO.Lacets.METAUX[lc.P.ferret]) || [[0, '#444'], [0.3, '#eee'], [1, '#333']];
      lc.ferret = lc.wl * 2.3 + 3;
      const der = lc.cubes[lc.cubes.length - 1];
      const xs = der.x + lc.sensTire * der.s * 0.5;
      lc.bout = clamp((lc.sensTire > 0 ? W - xs : xs) - lc.ferret - 3, 0.35 * lc.s, 1.4 * lc.s);
      lc.alpha = 1; lc.delta = 0; lc.entre = false; lc.fil = 0; lc.fini = false;
      lc.repos = chemin(lc, (i) => ({ x: lc.cubes[i].x, y: lc.cubes[i].y, a: 0 }));
      lc.repos.segs.forEach((sg) => {
        if (sg.debut) lc.cubes[sg.debut.i]['seg' + sg.debut.cote] = sg;
        if (sg.fin) lc.cubes[sg.fin.i]['seg' + sg.fin.cote] = sg;
      });
      const p = lc.repos.pts, xf = p[p.length - 2];
      lc.sortie = (lc.sensTire > 0 ? W - xf : xf) + lc.ferret + 40;
      lc.ombre = ombreImage(lc.s, Math.min(2, window.devicePixelRatio || 1));
      lc.cubes.forEach((cb) => { haut = Math.min(haut, cb.y + cb.geo.y0); bas = Math.max(bas, cb.y + cb.geo.y1 + cb.s * 0.45); });
      for (let k = 1; k < p.length; k += 2) { haut = Math.min(haut, p[k]); bas = Math.max(bas, p[k]); }
      bas = Math.max(bas, p[1] + lc.ferret + 4);
    });
    return { lacets, s1, s2, haut: haut - 6, bas: bas + 8, hauteur: Math.ceil(bas + 8), oy: 0, pret: false, image: null };
  }

  /* le tracé d'un lacet à perles : la queue qui pend, les trous des cubes (dedans : tout droit, caché),
     entre deux cubes un petit ventre, la boucle, la tête tendue vers le bord (c'est par là qu'on tire).
     etat(i) → { x, y, a } : la place du cube i. */
  function chemin(lc, etat) {
    const pts = [], segs = [], marques = [];
    const P = (x, y) => pts.push(x, y);
    const idx = () => pts.length / 2 - 1;
    const cubes = lc.cubes, n = cubes.length;
    const trouDe = (i, cote) => {
      const cb = cubes[i], e = etat(i), t = cote === 'g' ? cb.geo.trouG : cb.geo.trouD;
      const c = Math.cos(e.a), s = Math.sin(e.a);
      return [e.x + t[0] * c - t[1] * s, e.y + t[0] * s + t[1] * c];
    };
    const cEntree = (i) => (cubes[i].sens > 0 ? 'g' : 'd'), cSortie = (i) => (cubes[i].sens > 0 ? 'd' : 'g');
    const bez = (p0, p1, p2, p3) => {
      const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      const m = Math.max(3, Math.ceil(l / 2.5));
      for (let k = 1; k <= m; k++) {
        const t = k / m, u = 1 - t;
        P(u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]);
      }
    };
    const s0 = cubes[0].s, e0 = trouDe(0, cEntree(0)), dq = -cubes[0].sens;
    const q = [e0[0] + dq * 0.4 * s0, e0[1] + 0.66 * s0];
    P(q[0], q[1]);
    bez(q, [q[0] + dq * 0.03 * s0, q[1] - 0.34 * s0], [e0[0] + dq * 0.28 * s0, e0[1] + 0.04 * s0], e0);
    segs.push({ de: 0, a: idx(), fin: { i: 0, cote: cEntree(0) } });
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const x = trouDe(i - 1, cSortie(i - 1)), e = trouDe(i, cEntree(i)), de = idx();
        if (i === lc.boucle) {
          const r = Math.abs(x[1] - e[1]) / 2, dir = cubes[i - 1].sens, k = 0.3 * cubes[i].s + 1.3 * r;
          bez(x, [x[0] + dir * k, x[1] + 0.3 * r], [e[0] + dir * k, e[1] - 0.08 * r], e);
        } else {
          const qx = (x[0] + e[0]) / 2, qy = (x[1] + e[1]) / 2 + 2 * (0.1 * Math.hypot(e[0] - x[0], e[1] - x[1]) + 0.35);
          bez(x, [x[0] + (2 / 3) * (qx - x[0]), x[1] + (2 / 3) * (qy - x[1])], [e[0] + (2 / 3) * (qx - e[0]), e[1] + (2 / 3) * (qy - e[1])], e);
        }
        segs.push({ de, a: idx(), debut: { i: i - 1, cote: cSortie(i - 1) }, fin: { i, cote: cEntree(i) } });
      }
      marques.push(idx());
      const x = trouDe(i, cSortie(i));
      P(x[0], x[1]);
      marques.push(idx());
    }
    const xl = trouDe(n - 1, cSortie(n - 1)), dl = lc.sensTire, sl = cubes[n - 1].s, de = idx();
    const fin = [xl[0] + dl * lc.bout, xl[1] + 0.06 * sl];
    bez(xl, [xl[0] + dl * lc.bout * 0.35, xl[1] + 0.1 * sl], [xl[0] + dl * lc.bout * 0.7, fin[1]], fin);
    segs.push({ de, a: idx(), debut: { i: n - 1, cote: cSortie(n - 1) } });
    const N = pts.length / 2, S = new Float32Array(N);
    for (let k = 1; k < N; k++) S[k] = S[k - 1] + Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1]);
    return { pts: Float32Array.from(pts), S, fin: S[N - 1], segs, sE: marques.filter((v, k) => !(k & 1)).map((v) => S[v]), sX: marques.filter((v, k) => k & 1).map((v) => S[v]) };
  }
  // la voie du lacet entre deux abscisses (au-delà de la tête : tout droit vers le bord), et ses deux bouts
  function troncon(ch, a, b, dl) {
    const { pts, S, fin } = ch, N = S.length;
    const en = (s) => {
      if (s >= fin) return [pts[2 * N - 2] + dl * (s - fin), pts[2 * N - 1], dl, 0, N - 1];
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
      const t = (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]);
      const tx = pts[2 * hi] - pts[2 * lo], ty = pts[2 * hi + 1] - pts[2 * lo + 1], l = Math.hypot(tx, ty) || 1;
      return [pts[2 * lo] + tx * t, pts[2 * lo + 1] + ty * t, tx / l, ty / l, lo];
    };
    const A = en(a), B = en(b), p = new Path2D();
    p.moveTo(A[0], A[1]);
    if (a < fin) for (let k = A[4] + 1; k < N && S[k] < b; k++) p.lineTo(pts[2 * k], pts[2 * k + 1]);
    p.lineTo(B[0], B[1]);
    return { p, A, B };
  }
  function cordon(g, p, lc) { // un lacet plat, fin : ses bords, sa face, ses côtes, son reflet
    const P = lc.P, wl = lc.wl;
    g.lineJoin = 'round'; g.lineCap = 'butt';
    g.strokeStyle = P.bord; g.lineWidth = wl; g.stroke(p);
    g.strokeStyle = P.base; g.lineWidth = Math.max(1, wl - 1.1); g.stroke(p);
    g.setLineDash([wl * 0.2, wl * 0.32]);
    g.strokeStyle = P.clair ? 'rgba(90,62,18,.17)' : 'rgba(0,0,0,.28)'; g.lineWidth = Math.max(1, wl - 1.5); g.stroke(p);
    g.setLineDash([]);
    g.strokeStyle = P.clair ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.3)'; g.lineWidth = Math.max(0.6, wl * 0.2); g.stroke(p);
  }
  function ferretPerle(g, x, y, ux, uy, lc, k, oy) { // un ferret, depuis le bout du lacet, dans la direction (ux, uy)
    const L = lc.ferret, r = lc.wl * 0.62;
    g.setTransform(k * ux, k * uy, -k * uy, k * ux, k * x, k * (y + oy));
    const gr = g.createLinearGradient(0, -r, 0, r);
    lc.mat.forEach(([o, c]) => gr.addColorStop(o, c));
    g.beginPath(); rrect(g, -0.5, -r, L, 2 * r, r * 0.7);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.5; g.stroke();
  }
  /* les lacets à perles, dans un contexte (l'écran, ou l'image du repos) : k = l'échelle, oy = le décalage
     vertical du bloc. Les ombres, les lacets et leurs ferrets, les cubes enfilés, au repos le bout de lacet
     qui entre dans le trou de la face de côté, enfin les cubes lâchés qui tombent. */
  function dessinerPerles(g, plan, now, k, oy, repos, bas) {
    const pose = (x, y, a, sc = 1) => {
      if (a) { const c = Math.cos(a) * k * sc, s = Math.sin(a) * k * sc; g.setTransform(c, s, -s, c, k * x, k * (y + oy)); }
      else g.setTransform(k * sc, 0, 0, k * sc, k * x, k * (y + oy));
    };
    plan.lacets.forEach((lc) => {
      if (!lc.trace || lc.alpha <= 0) return;
      g.globalAlpha = lc.alpha;
      g.setTransform(k, 0, 0, k, k * lc.s * 0.04, k * (oy + lc.s * 0.16));
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = 'rgba(24,14,6,.1)'; g.lineWidth = lc.wl * 2.4; g.stroke(lc.trace.p);
      g.strokeStyle = 'rgba(24,14,6,.18)'; g.lineWidth = lc.wl * 1.2; g.stroke(lc.trace.p);
      lc.cubes.forEach((cb) => {
        const e = cb.etat;
        if (cb.chute || e.al <= 0) return;
        g.globalAlpha = lc.alpha * e.al;
        pose(cb.x + e.dx + cb.s * 0.04 * e.sc, cb.y + e.dy + cb.s * 0.2 * e.sc, e.a, e.sc);
        g.drawImage(lc.ombre.cv, -lc.ombre.c, -lc.ombre.c, lc.ombre.t, lc.ombre.t);
      });
    });
    plan.lacets.forEach((lc) => {
      if (!lc.trace || lc.alpha <= 0) return;
      g.globalAlpha = lc.alpha;
      g.setTransform(k, 0, 0, k, 0, k * oy);
      cordon(g, lc.trace.p, lc);
      const A = lc.trace.A, B = lc.trace.B;
      ferretPerle(g, A[0], A[1], -A[2], -A[3], lc, k, oy);
      ferretPerle(g, B[0], B[1], B[2], B[3], lc, k, oy);
    });
    plan.lacets.forEach((lc) => {
      if (lc.alpha <= 0) return;
      g.globalAlpha = lc.alpha;
      lc.cubes.forEach((cb) => {
        const e = cb.etat;
        if (cb.chute || !cb.img || e.al <= 0) return;
        g.globalAlpha = lc.alpha * e.al;
        pose(cb.x + e.dx, cb.y + e.dy, e.a, e.sc);
        const im = cb.vue || cb.img; // (le cube qui tourne sur son lacet : son image de l'instant)
        g.drawImage(im.cv, -im.cx, -im.cy, im.w, im.h);
      });
    });
    g.globalAlpha = 1;
    if (repos) {
      plan.lacets.forEach((lc) => lc.cubes.forEach((cb) => {
        const sg = cb.geo.cote && cb['seg' + cb.geo.cote];
        if (!sg) return;
        const p = new Path2D(), pts = lc.repos.pts;
        for (let j = sg.de; j <= sg.a; j++) { if (j > sg.de) p.lineTo(pts[2 * j], pts[2 * j + 1]); else p.moveTo(pts[2 * j], pts[2 * j + 1]); }
        g.save();
        g.setTransform(k, 0, 0, k, 0, k * oy);
        g.beginPath();
        (cb.vueGeo || cb.geo).face.forEach(([x, y], j) => { if (j) g.lineTo(cb.x + x, cb.y + y); else g.moveTo(cb.x + x, cb.y + y); });
        g.closePath();
        g.clip();
        cordon(g, p, lc);
        g.restore();
      }));
    }
    let restent = 0;
    plan.lacets.forEach((lc) => lc.cubes.forEach((cb) => {
      const c = cb.chute;
      if (!c || c.hors || !cb.img) return;
      const t = Math.max(0, (now - c.t0) / (1000 * c.ral));
      const x = c.x + c.vx * t, y = c.y + c.vy * t + 0.5 * c.g * t * t, a = c.w * t;
      if (y - cb.s > bas) { c.hors = true; return; }
      restent++;
      pose(x + cb.s * 0.04, y + cb.s * 0.2, a);
      g.drawImage(lc.ombre.cv, -lc.ombre.c, -lc.ombre.c, lc.ombre.t, lc.ombre.t);
      pose(x, y, a);
      g.drawImage(cb.img.cv, -cb.img.cx, -cb.img.cy, cb.img.w, cb.img.h);
    }));
    return restent;
  }
  const rebond = (p) => { const c = 1.5; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

  /* ======================================================================
     CO.splash
     ====================================================================== */
  /** l'ouverture joue-t-elle ? Une fois par visite ; ?intro la rejoue, ?nointro la saute. (Le même calcul que le
      petit script du <head>, qui pose html.ouverture pour que l'écran soit couvert dès la première image.) */
  CO.splashDecide = function () {
    const q = new URLSearchParams(location.search);
    let deja = false;
    try { deja = sessionStorage.getItem('co-intro') === '1'; } catch (e) { /* navigation privée */ }
    return !q.has('nointro') && (!deja || q.has('intro'));
  };
  CO.splash = function (opts = {}) {
    return new Promise((resolve) => {
      const el = $('#splash');
      const racine = document.documentElement;
      if (!el || !CO.splashDecide()) { racine.classList.remove('ouverture'); el && (el.hidden = true); resolve({ skipped: true }); return; }
      try { sessionStorage.setItem('co-intro', '1'); } catch (e) { /* navigation privée */ }
      racine.classList.add('ouverture');
      sons();
      el.hidden = false;
      // l'appli chargée (la page, ses polices, la devanture…) : la vague des cubes finit et « Entrer » paraît
      let charge = false;
      Promise.resolve(opts.pret).then(() => { charge = true; }, () => { charge = true; });
      setTimeout(() => { charge = true; }, 15000); // (au cas où : on n'attend pas indéfiniment)
      const cv = $('#splash-lacis', el), badge = $('#splash-badge', el), hote = $('#splash-perles', el);
      const btn = $('#splash-entrer', el), muet = $('#splash-muet', el);
      if (muet && CO.sfx && !CO.sfx.on) muet.hidden = true;
      const reduit = !!CO.reduced;
      const ctx = cv && cv.getContext ? cv.getContext('2d') : null;
      const rng = CO.rng ? CO.rng(CO.newSeed ? CO.newSeed() : 63) : Math.random;
      // les lettres des cubes : la police de titre (jeton --large), attendue un peu si elle n'est pas là
      const police = (getComputedStyle(document.documentElement).getPropertyValue('--large') || '').trim() || 'system-ui, sans-serif';
      let policePrete = false;
      const delai = (ms) => new Promise((r) => setTimeout(r, ms));
      const pret = (document.fonts && document.fonts.load ? Promise.race([document.fonts.load(`800 40px ${police}`, 'CORDO63PARCLÉMENTPETIT'), delai(900)]) : Promise.resolve())
        .catch(() => {}).then(() => { policePrete = true; });

      /* le dessin */
      let W = 0, H = 0, dpr = 1, G = null, images = [], motif = null, plan = null;
      function preparer() {
        W = el.clientWidth || innerWidth; H = el.clientHeight || innerHeight;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        // la place des perles d'abord (les boutons se posent dessous), leurs images quand la police est là
        plan = hote ? planPerles(W, H, rng) : null;
        if (plan) {
          hote.style.height = plan.hauteur + 'px';
          plan.oy = hote.getBoundingClientRect().top - el.getBoundingClientRect().top;
        }
        if (!ctx) return;
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
        G = lacis(W, H, rng);
        // une image par couleur, à 1,5x au plus (des lacets larges : la trame reste nette, la mémoire raisonnable)
        const di = Math.min(1.5, dpr);
        const T = tresses(G.w, di, rng);
        images = COULEURS.map((c) => lacetImage(c, G.L, G.w, di, rng, T));
        motif = motifCroisements(ctx, G.w, G.Delta, G.croise);
      }
      // les images des perles : quelques cubes à la fois (24 ms au plus : d'un coup sur un bon téléphone), le
      // premier morceau tout de suite ; puis l'image du repos. ensuite() quand tout est prêt.
      function perlesImages(ensuite) {
        if (!plan || !ctx) return;
        const p = plan;
        if (p.pret) { if (ensuite) ensuite(); return; }
        if (ensuite) (p.attente = p.attente || []).push(ensuite);
        if (p.enCours) return;
        p.enCours = true;
        const dc = Math.min(2, window.devicePixelRatio || 1);
        const cubes = [];
        p.lacets.forEach((lc) => lc.cubes.forEach((cb) => cubes.push(cb)));
        let i = 0;
        const etape = () => {
          if (plan !== p || fini || lance) return;
          const t = performance.now();
          while (i < cubes.length && performance.now() - t < 24) { const cb = cubes[i++]; cb.img = dessinerCube(cb.geo, cb, dc, police, rng, null, cb.ref); }
          if (i < cubes.length) { setTimeout(etape, 0); return; }
          const repos = () => {
            if (plan !== p || fini || lance) return;
            if (hote) p.oy = hote.getBoundingClientRect().top - el.getBoundingClientRect().top; // (la police a pu changer la hauteur des boutons)
            const y0 = Math.floor(p.haut), y1 = Math.ceil(p.bas);
            const im = document.createElement('canvas');
            im.width = Math.round(W * dpr); im.height = Math.ceil((y1 - y0) * dpr);
            p.lacets.forEach((lc) => { lc.trace = troncon(lc.repos, 0, lc.repos.fin, lc.sensTire); lc.traceRepos = lc.trace; });
            dessinerPerles(im.getContext('2d'), p, 0, dpr, -y0, true, Infinity);
            p.image = { cv: im, y: y0 };
            p.pret = true; p.enCours = false;
            (p.attente || []).splice(0).forEach((f) => f());
          };
          repos(); // (quelques ms : tout de suite, pour ne pas attendre derrière une longue tâche)
        };
        etape();
      }
      function poser(l) {
        const im = images[l.ci];
        const t = l.miroir ? l.o + G.L : l.o;
        const ox = l.debut[0] + l.d[0] * t, oy = l.debut[1] + l.d[1] * t;
        const ux = l.miroir ? -l.d[0] : l.d[0], uy = l.miroir ? -l.d[1] : l.d[1];
        ctx.setTransform(dpr * ux, dpr * uy, dpr * l.nrm[0] * l.ep, dpr * l.nrm[1] * l.ep, dpr * ox, dpr * oy);
        ctx.drawImage(im.cv, -im.m, -im.m - im.w / 2, im.L + 2 * im.m, im.w + 2 * im.m);
      }
      // la lumière des croisements, calée sur la ligne du lacet (seulement là où il est encore)
      function ombrer(l) {
        if (!motif) return;
        let a = l.t0 + l.o + G.w * 1.1, b = l.t0 + l.o + G.L - G.w * 1.1;
        if (l.miroir) { const t = a; a = -b; b = -t; }
        if (b <= a) return;
        const ux = l.miroir ? -l.d[0] : l.d[0], uy = l.miroir ? -l.d[1] : l.d[1];
        ctx.setTransform(dpr * ux, dpr * uy, dpr * l.nrm[0] * l.ep, dpr * l.nrm[1] * l.ep, dpr * l.c[0], dpr * l.c[1]);
        motif.mat.e = l.phase;
        motif.motif.setTransform(motif.mat);
        ctx.fillStyle = motif.motif;
        const hw = G.w * 0.485;
        ctx.fillRect(a, -hw, b - a, 2 * hw);
      }
      function perles(now) {
        if (!plan || !plan.pret) return 0;
        const tourne = plan.lacets.some((lc) => lc.cubes.some((cb) => cb.vue));
        const calme = plan.lacets.every((lc) => !lc.entre && !lc.delta && lc.alpha >= 1);
        if (calme && tourne) { // seuls des cubes tournent : tout le reste est au repos (les bouts de lacet dans les trous compris)
          plan.lacets.forEach((lc) => { lc.trace = lc.traceRepos; });
          return dessinerPerles(ctx, plan, now, dpr, plan.oy, true, H - plan.oy + 10);
        }
        if (calme && plan.image) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(plan.image.cv, 0, Math.round((plan.oy + plan.image.y) * dpr));
          return 0;
        }
        plan.lacets.forEach((lc) => {
          if (lc.fini) { lc.trace = null; return; }
          const R = lc.repos;
          if (lc.delta > 0) lc.trace = troncon(R, lc.delta, R.fin + lc.delta, lc.sensTire);
          else if (lc.entre) lc.trace = lc.depuis === 'fin' ? troncon(R, Math.max(0, R.fin - lc.fil), R.fin, lc.sensTire) : troncon(R, 0, Math.min(R.fin, lc.fil), lc.sensTire);
          else lc.trace = lc.traceRepos;
        });
        return dessinerPerles(ctx, plan, now, dpr, plan.oy, false, H - plan.oy + 10);
      }
      let tombent = 0;
      function dessiner(now) {
        if (!ctx || !G) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (G.fixe && G.cache) { // la toile posée : son image
          ctx.drawImage(G.cache, 0, 0);
          tombent = perles(now || performance.now());
          return;
        }
        const L = G.lacets;
        L.forEach((l) => { if (l.f === 0 && !l.parti) { poser(l); ombrer(l); } });
        L.forEach((l) => { if (l.f === 1 && !l.parti) { poser(l); ombrer(l); } });
        L.forEach((l) => { // les croisements où la première famille passe dessus
          if (l.f !== 0 || l.parti) return;
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clip(l.dessus);
          poser(l);
          ombrer(l);
          ctx.restore();
        });
        if (G.fixe && !G.cache) { // elle vient de se poser : on la garde en image (rien ne bouge plus sous les perles)
          const c = document.createElement('canvas');
          c.width = cv.width; c.height = cv.height;
          c.getContext('2d').drawImage(cv, 0, 0);
          G.cache = c;
        }
        tombent = perles(now || performance.now());
      }

      /* une seule boucle : ce qui bouge (entrée, tirage, chute) */
      const mouvements = new Set();
      let raf = 0;
      function image(now) {
        raf = 0;
        let encore = false;
        mouvements.forEach((m) => { if (m(now) === false) mouvements.delete(m); else encore = true; });
        dessiner(now);
        if (encore || tombent) raf = requestAnimationFrame(image);
      }
      const bouger = (m) => { mouvements.add(m); if (!raf) raf = requestAnimationFrame(image); };

      // l'arrivée : chaque lacet entre par un bout et vient se poser (l'appli se couvre)
      function entree() {
        if (!G) return;
        const t0 = performance.now(), ral = lent();
        G.lacets.forEach((l) => {
          l.o = -l.sens * (G.L + 40);
          const retard = rng() * 300 + (l.f ? 60 : 0);
          bouger((now) => {
            const p = clamp((now - t0 - retard * ral) / (DUREE_ENTREE * ral), 0, 1);
            const e = 1 - Math.pow(1 - p, 3);
            l.o = -l.sens * (G.L + 40) * (1 - e);
            return p < 1;
          });
        });
        const g0 = G;
        bouger(() => { if (G !== g0) return false; if (g0.lacets.every((l) => l.o === 0)) { g0.fixe = true; return false; } return true; });
      }
      // l'enfilage : le lacet avance d'un bout à l'autre (« CORDO 63 » depuis sa queue, l'autre depuis le bord),
      // et chaque cube paraît quand le ferret atteint son trou (il grossit en place, un petit rebond)
      function entreePerles(t0) {
        if (!plan || !plan.pret) return;
        const ral = lent(), POP = 260 * ral;
        plan.lacets.forEach((lc, j) => {
          const depart = (j ? 200 : 0) * ral, duree = (j ? 1000 : 720) * ral, R = lc.repos;
          lc.entre = true; lc.fil = 0;
          lc.cubes.forEach((cb) => { cb.etat.sc = 0.35; cb.etat.al = 0; cb.tPop = null; });
          bouger((now) => {
            const p = clamp((now - t0 - depart) / duree, 0, 1);
            lc.fil = R.fin * (1 - Math.pow(1 - p, 1.8));
            let fini = p >= 1;
            lc.cubes.forEach((cb, i) => {
              const atteint = lc.depuis === 'fin' ? R.fin - lc.fil <= R.sX[i] : lc.fil >= R.sE[i];
              if (cb.tPop == null && atteint) cb.tPop = now;
              if (cb.tPop == null) { fini = false; return; }
              const q = clamp((now - cb.tPop) / POP, 0, 1);
              cb.etat.sc = 0.35 + 0.65 * rebond(q); cb.etat.al = clamp(q * 3, 0, 1);
              if (q < 1) fini = false;
            });
            if (fini) { lc.entre = false; lc.cubes.forEach((cb) => { cb.etat.sc = 1; cb.etat.al = 1; }); return false; }
            return true;
          });
        });
      }
      function perlesAuRepos() {
        if (!plan) return;
        plan.lacets.forEach((lc) => { lc.entre = false; lc.alpha = 1; lc.cubes.forEach((cb) => { cb.etat.dx = 0; cb.etat.dy = 0; cb.etat.a = 0; cb.etat.sc = 1; cb.etat.al = 1; cb.vue = null; cb.vueGeo = null; }); });
      }

      /* le chargement : tant que l'appli se prépare, les cubes tournent un à un sur leur lacet, dans l'ordre de
         la lecture (un temps de plus entre deux mots, entre deux rangs), chacun sa note : un petit air de
         marimba ; puis la vague repart. L'appli chargée, la vague finit (au moins une) et les boutons paraissent. */
      // l'air : une vague qui monte et descend sur CORDO 63, une levée sur PAR, CLÉMENT qui chante, PETIT qui se pose sur la tonique
      const AIR = [76, 79, 84, 81, 79, 76, 79, 72, 74, 76, 79, 81, 84, 86, 84, 81, 79, 81, 84, 88, 86, 84];
      const PAS_VAGUE = 76, TOUR_MS = 560, BLANC = 70, RANG = 150, REPOS_VAGUE = 420;
      const tourDe = (p) => { const c = 0.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }; // lancé d'une pichenette, un rien trop loin, posé
      let attente = 0, vagues = 0, montre = false;
      function ordreLecture() {
        const tous = [];
        plan.lacets.forEach((lc) => lc.cubes.forEach((cb) => tous.push(cb)));
        tous.sort((a, b) => a.rang - b.rang || a.x - b.x);
        let t = 0, prec = null;
        return tous.map((cb, j) => {
          if (prec) t += PAS_VAGUE + (cb.rang !== prec.rang ? RANG : cb.x - prec.x > cb.s * 1.6 ? BLANC : 0);
          prec = cb;
          return { cb, t, m: AIR[j % AIR.length] };
        });
      }
      function vague(t0) {
        const ral = lent(), ordre = ordreLecture();
        const lat = CO.sfx && CO.sfx.latency ? CO.sfx.latency() * 1000 : 0;
        const dc = Math.min(2, window.devicePixelRatio || 1);
        const fin = (ordre[ordre.length - 1].t + TOUR_MS) * ral;
        let iNote = 0;
        bouger((now) => {
          if (lance || fini || !plan) { ordre.forEach(({ cb }) => { cb.vue = null; cb.vueGeo = null; }); return false; }
          const t = now - t0;
          while (iNote < ordre.length && ordre[iNote].t * ral < t + 120) { // les notes, programmées juste à temps
            const o = ordre[iNote++];
            if (CO.sfx) CO.sfx.play('sp-tinte', { m: o.m, v: 0.9, delay: Math.max(1, o.t * ral - t + lat) });
          }
          ordre.forEach(({ cb, t: tc }) => {
            const p = (t - tc * ral) / (TOUR_MS * ral);
            if (p <= 0 || p >= 1) { if (cb.vue) { cb.vue = null; cb.vueGeo = null; } return; }
            cb.vueGeo = geomCube(cb.s, cb.ang[0], cb.ang[1], cb.ang[2], TOUR * tourDe(p));
            cb.vueCv = cb.vueCv || document.createElement('canvas');
            cb.vue = dessinerCube(cb.vueGeo, cb, dc, police, rng, cb.vueCv, cb.ref);
          });
          return t < fin;
        });
        return t0 + fin;
      }
      function montrer() {
        if (montre || fini) return;
        montre = true;
        if (badge) badge.classList.add('on');
      }
      function chargement(t0) {
        if (fini || lance) return;
        if (reduit || !plan || !plan.pret) { // pas de vague : les boutons dès que l'appli est chargée
          const guette = () => { if (fini || lance) return; if (charge) montrer(); else attente = setTimeout(guette, 120); };
          guette();
          return;
        }
        const tFin = vague(t0);
        vagues++;
        attente = setTimeout(() => {
          if (fini || lance) return;
          if (charge) montrer(); else chargement(performance.now());
        }, Math.max(0, tFin - performance.now()) + (charge ? 60 : REPOS_VAGUE * lent()));
      }

      let fini = false, lance = false;
      function nettoyer() {
        cancelAnimationFrame(raf);
        mouvements.clear();
        window.removeEventListener('resize', surTaille);
        el.removeEventListener('pointerdown', surToucher);
        if (cv) { cv.width = 0; cv.height = 0; }
        images = []; G = null; plan = null; motif = null;
      }
      function partir(opts) {
        if (fini) return;
        fini = true;
        el.classList.add('part');
        clearTimeout(attente);
        setTimeout(() => { el.hidden = true; racine.classList.remove('ouverture'); el.classList.remove('part', 'lance'); if (badge) badge.classList.remove('on'); nettoyer(); }, 380);
        const r = Object.assign({ revele: true }, opts);
        resolve(r);
        if (CO.emit) CO.emit('ouverture', r); // (les calculs lourds des autres onglets peuvent attendre ce signal)
      }

      // on entre : le beat, les vagues de lacets tirés, puis les lacets à perles arrachés, « CORDO 63 » le dernier
      async function jouer() {
        if (lance) return;
        lance = true;
        el.classList.add('lance');
        btn.disabled = true;
        if (muet) muet.disabled = true;
        if (reduit || !ctx || !G) { await CO.wait(120); partir({ passe: true }); return; }
        // l'appli dessous doit être prête (la devanture se crée en même temps) : on l'attend un peu
        const tA = performance.now();
        while (CO.Facade && !CO.facade && performance.now() - tA < 1500) await CO.wait(60);
        if (fini) return;
        clearTimeout(attente);
        mouvements.clear(); // l'arrivée n'est peut-être pas finie : chaque lacet repart d'où il est, les perles se posent
        perlesAuRepos();
        G.fixe = false; G.cache = null; // la toile va bouger
        const ral = lent();
        const lat = CO.sfx && CO.sfx.latency ? CO.sfx.latency() * 1000 : 0;
        const B = beat(90, 16, ral), at = B.at, sonsA = B.sons;
        const debut = performance.now();
        // l'ordre : de haut en bas (le milieu de chaque lacet), deux par double-croche, une famille chacun
        const ordre = G.lacets.slice().sort((a, b) => (a.c[1] - b.c[1]) || (a.f - b.f));
        const vagues = [];
        for (let k = 0; k < ordre.length; k += 2) vagues.push(ordre.slice(k, k + 2));
        vagues.forEach((v, k) => {
          const quand = at(k) + lat;
          sonsA.push([at(k), 'sp-zip', { k, v: 0.9 }]);
          v.forEach((l, j) => {
            const t1 = quand + j * 24 * ral;
            const o0 = l.o, D = G.L * 1.05 + 60;
            bouger((now) => {
              const p = clamp((now - debut - t1) / (DUREE_TIRE * ral), 0, 1);
              if (p <= 0) return true;
              l.o = o0 + l.sens * D * Math.pow(p, 2.1);
              if (p >= 1) { l.parti = true; return false; }
              return true;
            });
          });
        });
        // les lacets à perles : on les arrache par leur tête ; le lacet file dans les trous, chaque cube lâché
        // tombe, sur une gamme qui monte ; « PAR CLÉMENT PETIT » sur la 9e double-croche, « CORDO 63 » sur la 11e (la grosse caisse)
        const n = vagues.length;
        const tirages = plan && plan.pret ? [[plan.lacets[1], at(Math.max(0, n - 4)), 67], [plan.lacets[0], at(Math.max(0, n - 2)), 74]] : [];
        tirages.forEach(([lc, t1, gamme]) => {
          const T = DUREE_PERLES * ral, D = lc.repos.fin + lc.sortie;
          sonsA.push([t1, 'sp-zip', { k: 12, v: 1.1 }]);
          lc.cubes.forEach((cb, j) => {
            const tl = t1 + T * Math.sqrt(Math.min(1, lc.repos.sX[j] / D));
            sonsA.push([tl, 'sp-perle', { m: gamme + 12 * Math.floor(j / 5) + PENTA[j % 5], v: 0.9 }]);
          });
          bouger((now) => {
            const p = clamp((now - debut - t1 - lat) / T, 0, 1);
            if (p <= 0) return true;
            const d = D * p * p, v = ((2 * D * p) / T) * 1000; // la vitesse du lacet (px/s)
            lc.delta = Math.max(0.001, d);
            lc.cubes.forEach((cb, j) => {
              if (cb.chute || d < lc.repos.sX[j]) return;
              // le cube lâché : un peu entraîné par le lacet, un petit saut, et il tombe en tournant
              const fr = Math.min(300, v * 0.1);
              cb.chute = { t0: now, ral, x: cb.x, y: cb.y, vx: cb.sens * fr + (rng() - 0.5) * 60, vy: -(80 + rng() * 110), w: (rng() < 0.5 ? -1 : 1) * (2.5 + rng() * 5), g: 3800, hors: false };
              if (CO.vibrate && j === lc.cubes.length - 1 && lc === plan.lacets[0]) CO.vibrate(8);
            });
            if (p >= 1) { lc.fini = true; return false; }
            return true;
          });
        });
        // l'accord d'enclume sur « CORDO 63 »
        const tFin = tirages.length ? tirages[1][1] : at(n - 1) + DUREE_TIRE * 0.8 * ral;
        [72, 79, 84, 88].forEach((m, k) => sonsA.push([tFin + k * 22, 'rim', { m, v: 0.75 }]));
        // les sons se programment juste à temps (150 ms d'avance) : pas de pointe de calcul au toucher
        sonsA.sort((a, b) => a[0] - b[0]);
        let iSon = 0;
        bouger((now) => {
          const ecoule = now - debut;
          while (iSon < sonsA.length && sonsA[iSon][0] < ecoule + 150) {
            const [quand, nom, o] = sonsA[iSon++];
            if (CO.sfx) CO.sfx.play(nom, Object.assign({}, o, { delay: Math.max(1, quand - ecoule) }));
          }
          return iSon < sonsA.length;
        });
        // la fin : la toile partie, les lacets à perles arrachés, le dernier cube sorti de l'écran
        bouger(() => {
          if (fini) return false;
          const toile = G.lacets.every((l) => l.parti);
          const billes = !plan || !plan.pret || plan.lacets.every((lc) => lc.fini && lc.cubes.every((cb) => cb.chute && cb.chute.hors));
          if (toile && billes) { partir({}); return false; }
          return true;
        });
        setTimeout(() => partir({}), tFin + lat + (DUREE_PERLES + 1600) * ral); // au cas où
      }
      btn.addEventListener('click', jouer);
      if (muet) muet.addEventListener('click', () => {
        if (CO.sfx) { CO.sfx.on = false; if (CO.syncSound) CO.syncSound(); }
        jouer();
      });
      // un toucher pendant l'animation la passe
      function surToucher(e) { if (lance && !fini && !e.target.closest('button')) partir({ passe: true }); }
      el.addEventListener('pointerdown', surToucher);
      let tR = 0;
      // l'écran change de taille (rotation, barre d'adresse) : un nouveau laçage, posé d'un coup (rien pendant le tirage)
      function surTaille() {
        clearTimeout(tR);
        tR = setTimeout(() => {
          if (fini || lance || !G) return;
          if (Math.abs((el.clientWidth || innerWidth) - W) < 2 && Math.abs((el.clientHeight || innerHeight) - H) < 2) return;
          mouvements.clear();
          clearTimeout(attente);
          preparer();
          if (G) { G.lacets.forEach((l) => { l.o = 0; }); G.fixe = true; }
          dessiner();
          if (policePrete) perlesImages(() => { dessiner(); if (!montre) chargement(performance.now()); });
        }, 120);
      }
      window.addEventListener('resize', surTaille);

      // on prépare à la première image : l'arrivée part de lacets hors de l'écran, rien ne presse, et la
      // première mise en page de l'appli se fait à son heure (pas au milieu de son initialisation)
      requestAnimationFrame(() => {
        if (fini) return;
        preparer();
        if (reduit || !ctx) {
          if (G) G.fixe = true;
          dessiner();
          chargement(0);
          pret.then(() => { if (!fini && !lance) perlesImages(() => dessiner()); });
          return;
        }
        const tInit = performance.now();
        entree();
        // les perles tardent (la police) : les boutons viennent quand même, l'appli chargée
        const secours = setTimeout(() => { if (!plan || !plan.pret) chargement(0); }, 2500);
        pret.then(() => {
          if (fini || lance) return;
          perlesImages(() => {
            const t0 = Math.max(performance.now(), tInit + 320 * lent());
            entreePerles(t0);
            clearTimeout(secours);
            // l'enfilage fini (le second lacet : 200 + 1000 ms, et le dernier cube qui se pose), la première vague
            const t1 = t0 + 1460 * lent();
            attente = setTimeout(() => chargement(t1), Math.max(0, t1 - performance.now()));
          });
        });
      });
    });
  };
})();
