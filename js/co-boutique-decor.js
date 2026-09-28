/* ==========================================================================
   Cordo 63 — le décor de la boutique vue de l'intérieur (js/co-boutique.js le peint une fois en
   images, à la résolution de l'écran, puis le pose à chaque image selon la caméra)
   D'après les photos de la boutique (osint/ref/ig/cordo-DcQSJTOggIU, cordo-DTZ3pvtjQoR) : le mur de
   moellons dans sa lumière chaude, la clim, le caisson lumineux « SMALL » (Small Custom), la presse
   bleu-gris et ses flexibles d'air en spirale, la finisseuse rouge (plaque « SUR mini II », brosses
   et meules sur l'arbre, capot, caisson noir, roulettes), l'établi d'aggloméré au tapis de découpe
   vert et son pied de fer, la piqueuse à colonne noire aux décors dorés, le coin des baskets, le
   comptoir des clés, les étagères de paires aux tickets jaunes, le sac à dos jaune, les polaroïds,
   la pendule, la porte sur la rue ; sur le comptoir : la radio, le carnet, la tablette, les semelles
   crantées… Aucune marque ni logo sur les baskets (des montantes façon AJ1).
   Tout est en centimètres (1 unité = 1 cm ; y vers le bas, 0 = le sol) ; chaque peintre dessine
   dans le repère du monde. CO.BoutiqueDecor : les peintres, les dimensions (D), les stations, les
   textures (prechauffer() : un générateur, pour les fabriquer par tranches).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const O = () => CO.Clement.outils;

  /* ======================================================================
     Le monde (cm). x latéral (0 = le mur de gauche), y vers le bas (0 = le sol), d = la profondeur
     (distance à la caméra au repos). Clément et ses machines sont au plan D_LANE.
     ====================================================================== */
  const D_LANE = 250, D_MUR = 305, D_COMPTOIR = 188, D_OBJETS = 172, D_PLAFOND = 290;
  const OEIL = 185; // la hauteur de l'œil (un peu au-dessus du client : on voit le dessus des établis)
  const VUE = 165; // la largeur vue au plan de Clément, caméra au repos (cm)
  const HAUT_COMPTOIR = 90;
  const MONDE = { x0: 0, x1: 700 };
  const STATIONS = {
    presse: { x: 104, face: -0.95, cam: 84, zoom: 26 },
    finisseuse: { x: 240, face: -1.0, cam: 192, zoom: 22 },
    etabli: { x: 303, face: 0, cam: 303, zoom: 52 },
    couture: { x: 420, face: 0.12, cam: 410, zoom: 52, assis: true },
    nettoyage: { x: 494, face: 0, cam: 494, zoom: 54 },
    cles: { x: 578, face: 0, cam: 580, zoom: 52 },
  };

  /* ---------- la palette de l'atelier (accordée à la devanture de co-facade.js) ---------- */
  const C = {
    pierre: ['#9A8870', '#8B7A63', '#A7967C', '#7D6D59', '#B09F85', '#948269', '#857460', '#A08C70', '#8E8272', '#B5A78E', '#96806A', '#A99A84'],
    mortier: '#8C7E6C', mortierSombre: '#6A5D4E',
    plafond: '#2C2019', poutre: '#4A3627', poutreClair: '#6B503A',
    bois: '#9A6A40', boisClair: '#C28E5C', boisSombre: '#5E3E24',
    rouge: '#D3262B', rougeClair: '#EE4A45', rougeSombre: '#8E151A',
    bleuPresse: '#6F8EAB', bleuPresseSombre: '#46627F', bleuTuyau: '#3C8FD8',
    tapis: '#2E684B', tapisClair: '#8BC2A1',
    sauge: '#6E866A', saugeSombre: '#4E6450', saugeClair: '#8FA88A',
    ticket: '#F2D24B', pastille: '#E03A2E',
    acier: '#B9BEC2', acierSombre: '#5E6368',
    lampe: '#FFE3B0',
  };
  const PAIRES = [ // des montantes façon AJ1, sans logo : tige, empiècements, col, semelle
    { tige: '#F4F0E8', emp: '#C8262C', col: '#1E1E20', sem: '#FBFAF6', semB: '#C8262C' },
    { tige: '#F4F0E8', emp: '#2F5FA8', col: '#1E1E20', sem: '#FBFAF6', semB: '#2F5FA8' },
    { tige: '#8E8C88', emp: '#2B2B2D', col: '#2B2B2D', sem: '#F4F1EA', semB: '#2B2B2D' },
    { tige: '#F4F0E8', emp: '#2F6A4C', col: '#2F6A4C', sem: '#FBFAF6', semB: '#2F6A4C' },
    { tige: '#1F1F22', emp: '#C8262C', col: '#1F1F22', sem: '#FBFAF6', semB: '#C8262C' },
    { tige: '#F4F0E8', emp: '#E07A2E', col: '#1E1E20', sem: '#FBFAF6', semB: '#E07A2E' },
    { tige: '#F4F0E8', emp: '#8FB8DE', col: '#8FB8DE', sem: '#FBFAF6', semB: '#8FB8DE' },
    { tige: '#6B4A33', emp: '#2A1E16', col: '#2A1E16', sem: '#EDE3CF', semB: '#6B4A33' },
    { tige: '#F4F0E8', emp: '#E9B04A', col: '#1E1E20', sem: '#FBFAF6', semB: '#1E1E20' },
  ];

  /* ---------- les polices (jamais écrites en dur : on lit les variables du site) ---------- */
  const police = (v, repli) => {
    try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || repli; } catch (e) { return repli; }
  };

  /* ---------- outils ---------- */
  function toile(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  const lin = (g, x0, y0, x1, y1, stops) => { const d = g.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => d.addColorStop(clamp(o, 0, 1), c)); return d; };
  const rad = (g, x, y, r, stops, x0 = x, y0 = y, r0 = 0) => { const d = g.createRadialGradient(x0, y0, r0, x, y, Math.max(0.01, r)); stops.forEach(([o, c]) => d.addColorStop(clamp(o, 0, 1), c)); return d; };
  function rr(g, x, y, w, h, r) { // rectangle arrondi
    r = Math.min(r, w / 2, h / 2);
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function lisse(g, pts, ferme = true, k = 1 / 6) { return O().lisse(g, pts, ferme, k); }
  const tache = (g, x, y, rx, ry, couleur, a) => { // une lueur ou une ombre douce
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    g.fillStyle = rad(g, 0, 0, rx, [[0, rgba(couleur, a)], [0.5, rgba(couleur, a * 0.45)], [1, rgba(couleur, 0)]]);
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.restore();
  };

  /* ---------- les textures (une fois) ---------- */
  const TEX = {};
  /** une texture, faite une fois ; fab peut être un générateur (fabriqué pas à pas par prechauffer()) */
  const tex = (nom, fab) => {
    if (TEX[nom]) return TEX[nom];
    const r = fab();
    if (r && typeof r.next === 'function') { let e; do { e = r.next(); } while (!e.done); return (TEX[nom] = e.value); }
    return (TEX[nom] = r);
  };
  /** grain de pierre : piqué clair et sombre (raccordable) */
  const texGrain = () => tex('grain', () => {
    const N = 128, c = toile(N, N), x = c.getContext('2d'), r = CO.rng(305);
    for (let i = 0; i < 2600; i++) {
      const clair = r() < 0.38;
      x.fillStyle = clair ? `rgba(236,228,214,${0.1 + r() * 0.22})` : `rgba(28,22,16,${0.12 + r() * 0.28})`;
      const px = r() * N, py = r() * N, s = 0.6 + r() * 1.3;
      x.fillRect(px, py, s, s);
      if (px > N - 2) x.fillRect(px - N, py, s, s);
      if (py > N - 2) x.fillRect(px, py - N, s, s);
    }
    return c;
  });
  /** le bois : un fil droit qui ondule à peine, des pores allongés, quelques rayons (raccordable en x) */
  const texBois = (nom, base, sombre, clair, graine) => tex(nom, () => fabBois(base, sombre, clair, graine));
  function* fabBois(base, sombre, clair, graine) {
    const W = 512, H = 64, c = toile(W, H), x = c.getContext('2d');
    const img = x.createImageData(W, H), d = img.data, n = CO.noise2(graine), n2 = CO.noise2(graine + 1), n3 = CO.noise2(graine + 2);
    const B = CO.hex2rgb(base), S = CO.hex2rgb(sombre), L = CO.hex2rgb(clair);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = j / H;
      const raccord = (fn, a, b, per) => fn(a, b) * (1 - u) + fn(a - per, b) * u;
      const w = raccord(n, u * 3, v * 1.2, 3) * 0.55 + raccord(n2, u * 10, v * 3, 10) * 0.12;
      const fil = Math.sin((v * 30 + w * 3) * Math.PI) * 0.5 + Math.sin((v * 71 + w * 5) * Math.PI) * 0.22;
      const pores = raccord(n3, u * 90, v * 60, 90);
      const nuance = raccord(n2, u * 2, v * 0.6, 2) * 0.1;
      let k = clamp(0.56 + fil * 0.2 + nuance - (pores > 0.55 ? 0.22 : 0), 0, 1);
      const o = (j * W + i) * 4;
      const col = k < 0.5 ? S.map((s2, q) => lerp(s2, B[q], k * 2)) : B.map((b, q) => lerp(b, L[q], (k - 0.5) * 2));
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      if (i === W - 1 && j % 8 === 7) yield;
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  /** fabrique les textures du décor pas à pas (un générateur) */
  function* prechauffer() {
    if (!TEX.chene) { const r = fabBois('#86603E', '#583A24', '#A87E56', 71); let e; while (!(e = r.next()).done) yield; TEX.chene = e.value; }
    texGrain(); yield;
    texAgglo(); yield;
  }
  const texChene = () => texBois('chene', '#86603E', '#583A24', '#A87E56', 71);
  const texAgglo = () => tex('agglo', () => { // l'aggloméré brun usé de l'établi
    const N = 128, c = toile(N, N), x = c.getContext('2d'), r = CO.rng(72);
    x.fillStyle = '#5A4232';
    x.fillRect(0, 0, N, N);
    for (let i = 0; i < 1800; i++) {
      x.fillStyle = r() < 0.5 ? `rgba(150,112,80,${r() * 0.35})` : `rgba(20,12,6,${r() * 0.35})`;
      x.beginPath(); x.ellipse(r() * N, r() * N, 0.6 + r() * 2.4, 0.4 + r() * 1.2, r() * 3, 0, TAU); x.fill();
    }
    return c;
  });
  const motif = (g, img, k, ox = 0, oy = 0, rot = 0) => { // un motif à l'échelle k (cm par pixel), ancré
    const p = g.createPattern(img, 'repeat');
    if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().translate(ox, oy).rotate(rot * 180 / Math.PI).scale(k));
    return p;
  };

  /* ======================================================================
     Les peintres du décor (en cm, dans le repère du monde)
     ====================================================================== */

  /** le mur de moellons : pierres chaudes (beige, brun, gris, quelques ocres) dans un mortier sombre,
      comme vu depuis la rue (co-facade.js) ; la lumière des lampes s'y pose en flaques chaudes */
  function peindreMur(g, x0, x1, y0, nuit, lampes) { const it = peindreMurPas(g, x0, x1, y0, nuit, lampes); while (!it.next().done); }
  /** le même, pas à pas (un générateur : on rend la main au navigateur toutes les ~120 pierres) */
  function* peindreMurPas(g, x0, x1, y0, nuit, lampes) {
    const r = CO.rng(305);
    const H = -y0 + 2;
    g.fillStyle = '#5A4A3B';
    g.fillRect(x0, y0, x1 - x0, H);
    g.fillStyle = motif(g, texGrain(), 0.15);
    g.fillRect(x0, y0, x1 - x0, H);
    const pierres = [];
    const pierre = (cx, cy, w, h) => {
      const pts = [], n = 6 + Math.floor(r() * 4), rot = r() * TAU;
      for (let k = 0; k < n; k++) {
        const a = rot + (k / n) * TAU + (r() - 0.5) * 0.55, c = Math.cos(a), sn = Math.sin(a);
        const sup = 0.38 + r() * 0.22;
        pts.push([cx + Math.sign(c) * Math.pow(Math.abs(c), sup) * (w / 2) * (0.82 + r() * 0.18), cy + Math.sign(sn) * Math.pow(Math.abs(sn), sup) * (h / 2) * (0.78 + r() * 0.22)]);
      }
      pierres.push({ pts, cx, cy, w, h, col: C.pierre[Math.floor(r() * C.pierre.length)], ocre: r() < 0.14, sombre: r() < 0.12 });
    };
    for (let y = 1; y > y0 - 24;) {
      const h = 7 + r() * 9;
      for (let x = x0 - r() * 20; x < x1 + 20;) {
        const grand = r() < 0.1, w = grand ? 20 + r() * 14 : 9 + r() * 17, hh = grand ? h * 1.75 : h * (0.72 + r() * 0.28);
        pierre(x + w / 2, y - hh / 2 - r() * (h - hh) * 0.5, w - 1.1, hh - 1.1);
        if (r() < 0.3) pierre(x + w + 1.1, y - h * (0.2 + r() * 0.6), 2.4 + r() * 3.4, 2 + r() * 2.6);
        x += w + 0.5 + r() * 1.6;
      }
      y -= h + 0.4 + r() * 1.1;
    }
    yield;
    for (let i = 0; i < pierres.length; i++) {
      const p = pierres[i];
      g.save(); g.translate(0.4, 0.8);
      g.beginPath(); lisse(g, p.pts, true, 0.08);
      g.fillStyle = 'rgba(24,16,10,0.55)'; g.fill();
      g.restore();
      g.beginPath(); lisse(g, p.pts, true, 0.08);
      g.fillStyle = p.sombre ? '#6E6254' : p.ocre ? '#A98A62' : p.col;
      g.fill();
      if (i % 160 === 159) yield;
    }
    // le grain, sur les pierres seulement (par bandes : chaque pierre est dans une seule bande)
    const NB = 8, hB = H / NB;
    for (let b = 0; b < NB; b++) {
      const ya = b === 0 ? -1e9 : y0 + b * hB, yb = b === NB - 1 ? 1e9 : y0 + (b + 1) * hB;
      g.save();
      g.beginPath();
      for (const p of pierres) if (p.cy >= ya && p.cy < yb) lisse(g, p.pts, true, 0.08);
      g.clip();
      const r0 = Math.max(y0, ya) - 24, r1 = Math.min(2, yb) + 24;
      g.fillStyle = motif(g, texGrain(), 0.1, 5, 3);
      g.fillRect(x0, r0, x1 - x0, r1 - r0);
      g.globalAlpha = 0.55;
      g.fillStyle = motif(g, texGrain(), 0.24, 17, 11);
      g.fillRect(x0, r0, x1 - x0, r1 - r0);
      g.globalAlpha = 1;
      g.restore();
      yield;
    }
    yield;
    for (let i = 0; i < pierres.length; i++) {
      const p = pierres[i];
      if (i % 90 === 89) yield;
      g.beginPath(); lisse(g, p.pts, true, 0.08);
      g.fillStyle = lin(g, 0, p.cy - p.h / 2, 0, p.cy + p.h / 2, [[0, 'rgba(255,240,215,0.22)'], [0.4, 'rgba(255,240,215,0.02)'], [1, 'rgba(30,20,12,0.32)']]);
      g.fill();
      const v = r();
      if (v < 0.3) { g.fillStyle = 'rgba(60,44,30,0.14)'; g.fill(); } else if (v < 0.5) { g.fillStyle = 'rgba(255,235,205,0.08)'; g.fill(); }
      if (r() < 0.22) tache(g, p.cx + (r() - 0.5) * p.w * 0.4, p.cy + (r() - 0.5) * p.h * 0.3, p.w * 0.32, p.h * 0.3, r() < 0.6 ? '#B08448' : '#D6C8AE', 0.3);
      const hautes = p.pts.filter((q) => q[1] < p.cy), basses = p.pts.filter((q) => q[1] >= p.cy);
      if (hautes.length > 1) { g.beginPath(); lisse(g, hautes.sort((a, b) => a[0] - b[0]), false); g.strokeStyle = 'rgba(255,236,210,0.28)'; g.lineWidth = 0.4; g.stroke(); }
      if (basses.length > 1) { g.beginPath(); lisse(g, basses.sort((a, b) => a[0] - b[0]), false); g.strokeStyle = 'rgba(28,18,10,0.4)'; g.lineWidth = 0.45; g.stroke(); }
    }
    yield;
    // l'ombre du plafond en haut, le bas plus sombre (derrière les machines)
    g.fillStyle = lin(g, 0, y0, 0, 0, [[0, 'rgba(20,12,6,0.85)'], [0.14, 'rgba(20,12,6,0.4)'], [0.4, 'rgba(20,12,6,0.12)'], [0.7, 'rgba(20,12,6,0.18)'], [1, 'rgba(20,12,6,0.55)']]);
    g.fillRect(x0, y0, x1 - x0, H);
    // la pierre est dans la pénombre, sauf sous les lampes : des flaques chaudes
    g.fillStyle = 'rgba(30,18,10,0.28)';
    g.fillRect(x0, y0, x1 - x0, H);
    g.globalCompositeOperation = 'screen';
    lampes.forEach((L) => {
      tache(g, L.x, L.y + 75, 95, 115, '#FFB068', 0.34);
      tache(g, L.x, L.y + 28, 40, 34, '#FFDDA8', 0.3);
    });
    g.globalCompositeOperation = 'source-over';
  }

  /** une basket montante de profil (façon AJ1, sans logo) : x, y au talon au sol, L la longueur */
  function basket(g, x, y, L, c, dir = 1, sale = 0) {
    g.save();
    g.translate(x, y);
    g.scale(dir * L / 30, L / 30);
    // la semelle (blanche) et l'extérieur (couleur)
    g.fillStyle = c.semB || '#2B2B2D';
    g.beginPath(); g.moveTo(-0.5, 0); g.lineTo(29.5, 0); g.quadraticCurveTo(31.5, -0.8, 30.2, -2.2); g.lineTo(-0.6, -1.4); g.closePath(); g.fill();
    g.fillStyle = c.sem;
    g.beginPath(); g.moveTo(-0.6, -1.2); g.lineTo(30.2, -2.0); g.quadraticCurveTo(31, -3.6, 29.4, -4.6); g.lineTo(-0.2, -4.2); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(0, -2.8); g.lineTo(29.8, -3.3); g.stroke();
    // la tige
    g.fillStyle = c.tige;
    g.beginPath();
    g.moveTo(-0.2, -4.2); g.lineTo(0.6, -19); g.quadraticCurveTo(1, -21.2, 3.4, -21.3); g.lineTo(9.2, -21.1);
    g.quadraticCurveTo(10.6, -20.6, 11.3, -17.8); g.lineTo(13.2, -12.6); g.quadraticCurveTo(15.2, -9.4, 19.5, -8.6);
    g.quadraticCurveTo(27.5, -7.8, 29.4, -5.4); g.lineTo(29.4, -4.6); g.closePath();
    g.fill();
    // les empiècements : le talon, le bout, l'œillet, le col
    g.fillStyle = c.emp;
    g.beginPath(); g.moveTo(-0.2, -4.2); g.lineTo(0.3, -12.5); g.quadraticCurveTo(4, -13.4, 6.2, -9.8); g.quadraticCurveTo(7, -6.2, 6.5, -4.3); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(20.5, -4.4); g.quadraticCurveTo(21, -8.2, 24, -8.1); g.quadraticCurveTo(28.2, -7.4, 29.4, -5.4); g.lineTo(29.4, -4.6); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(9.8, -20.6); g.lineTo(11.3, -17.8); g.lineTo(13.4, -12.2); g.quadraticCurveTo(15, -9.8, 18.4, -9.2); g.lineTo(18, -10.6); g.quadraticCurveTo(14.6, -11.8, 12.6, -18); g.lineTo(11.6, -21); g.closePath(); g.fill();
    g.fillStyle = c.col;
    g.beginPath(); g.moveTo(0.6, -19); g.quadraticCurveTo(1, -21.2, 3.4, -21.3); g.lineTo(9.2, -21.1); g.quadraticCurveTo(10.6, -20.6, 11.3, -17.8); g.lineTo(10.2, -17.2); g.quadraticCurveTo(6, -18.6, 0.8, -16.6); g.closePath(); g.fill();
    // la languette, les lacets, les surpiqûres
    g.fillStyle = c.tige;
    g.beginPath(); g.moveTo(9.4, -21.1); g.quadraticCurveTo(11.2, -23.4, 12.6, -22.2); g.lineTo(11.6, -19.4); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(250,248,242,0.95)'; g.lineWidth = 0.7;
    g.beginPath(); for (let k = 0; k < 5; k++) { const t = k / 4, lx = lerp(11.2, 16.8, t), ly = lerp(-18.6, -10.4, t); g.moveTo(lx - 0.8, ly - 0.2); g.lineTo(lx + 1.4, ly + 0.8); } g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.18; g.setLineDash([0.5, 0.4]);
    g.beginPath(); g.moveTo(1, -12.6); g.quadraticCurveTo(4.6, -13.2, 6.6, -9.4); g.moveTo(20.8, -4.6); g.quadraticCurveTo(21.4, -8.6, 24, -8.6); g.stroke();
    g.setLineDash([]);
    // le volume : clair en haut, ombre en bas, un reflet sur le cuir
    g.fillStyle = lin(g, 0, -22, 0, 0, [[0, 'rgba(255,255,255,0.12)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.18)']]);
    g.beginPath(); g.moveTo(-0.2, -4.2); g.lineTo(0.6, -19); g.quadraticCurveTo(1, -21.2, 3.4, -21.3); g.lineTo(9.2, -21.1); g.quadraticCurveTo(10.6, -20.6, 11.3, -17.8); g.lineTo(13.2, -12.6); g.quadraticCurveTo(15.2, -9.4, 19.5, -8.6); g.quadraticCurveTo(27.5, -7.8, 29.4, -5.4); g.lineTo(29.4, -4.6); g.closePath(); g.fill();
    if (sale > 0) { // la saleté (le nettoyage l'efface)
      g.globalAlpha = sale;
      g.fillStyle = 'rgba(110,90,62,0.55)';
      [[3, -3], [12, -3.4], [22, -3.6], [27, -5.5], [5, -8], [17, -9.5]].forEach(([a, b], i) => { g.beginPath(); g.ellipse(a, b, 2.4 + (i % 3), 1.1, 0.1, 0, TAU); g.fill(); });
      g.globalAlpha = 1;
    }
    g.restore();
  }

  /** une chaussure de ville (derby) de profil : x, y au talon au sol */
  function derby(g, x, y, L, cuir = '#5A3422', dir = 1, semelle = '#2A1A10') {
    g.save();
    g.translate(x, y);
    g.scale(dir * L / 30, L / 30);
    g.fillStyle = semelle;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6.5, 0); g.lineTo(6.5, -1.4); g.lineTo(29.5, -1.4); g.quadraticCurveTo(31, -1.8, 30.2, -2.8); g.lineTo(0, -3.2); g.closePath(); g.fill();
    g.fillStyle = cuir;
    g.beginPath(); g.moveTo(0.2, -3.2); g.quadraticCurveTo(-0.6, -9, 1.6, -11.6); g.lineTo(8, -11.8); g.quadraticCurveTo(12, -11.5, 15, -9.4); g.quadraticCurveTo(24, -8.6, 28.6, -6); g.quadraticCurveTo(30.6, -4.4, 30.2, -2.8); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,230,200,0.22)';
    g.beginPath(); g.ellipse(24, -6.5, 4, 1.4, -0.2, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(9, -11.6); g.quadraticCurveTo(13, -8.2, 18.6, -8.2); g.stroke();
    g.restore();
  }

  /** le ticket jaune à pastille rouge (x, y : le haut, suspendu) */
  function ticket(g, x, y, w = 4.2, h = 8, a = 0) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(-w / 2 + 0.35, 0.35, w, h);
    g.fillStyle = C.ticket;
    g.fillRect(-w / 2, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(-w / 2, 0, w, h * 0.15);
    g.fillStyle = C.pastille;
    g.beginPath(); g.arc(w * 0.18, h * 0.78, w * 0.16, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(60,50,30,0.55)'; g.lineWidth = 0.18;
    g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-w * 0.35, h * (0.3 + k * 0.13)); g.lineTo(w * (0.1 + (k % 2) * 0.15), h * (0.3 + k * 0.13)); } g.stroke();
    g.fillStyle = '#EDE6D4';
    g.beginPath(); g.arc(0, h * 0.08, 0.35, 0, TAU); g.fill();
    g.restore();
  }

  // (la suite du décor : les machines, les meubles, le comptoir, les objets)
  /* ---------- petites briques de volume ---------- */
  /** un cylindre vertical (tube, montant) vu de face : dégradé en travers */
  function tube(g, x, y, w, h, base, clair, sombre) {
    g.fillStyle = lin(g, x, 0, x + w, 0, [[0, sombre], [0.25, clair], [0.45, base], [1, sombre]]);
    g.fillRect(x, y, w, h);
  }
  /** une plaque de métal peint : aplat, biseau clair en haut, ombre en bas, usure */
  function plaque(g, x, y, w, h, base, { r = 1.2, biseau = 0.8, reflet = 0.18, ombre = 0.25 } = {}) {
    g.beginPath(); rr(g, x, y, w, h, r);
    g.fillStyle = base;
    g.fill();
    g.fillStyle = lin(g, 0, y, 0, y + h, [[0, `rgba(255,255,255,${reflet})`], [0.18, 'rgba(255,255,255,0.03)'], [0.8, 'rgba(0,0,0,0.04)'], [1, `rgba(0,0,0,${ombre})`]]);
    g.fill();
    g.strokeStyle = `rgba(255,255,255,${reflet * 1.3})`;
    g.lineWidth = biseau * 0.5;
    g.beginPath(); g.moveTo(x + r, y + biseau * 0.3); g.lineTo(x + w - r, y + biseau * 0.3); g.stroke();
  }
  /** l'ombre d'un objet posé (au sol ou sur une table) */
  const ombrePose = (g, x, y, w, a = 0.35) => tache(g, x, y, w / 2, w / 9, '#140C06', a);
  /** du texte peint (canevas : jamais de <text> SVG transformé) */
  function texte(g, t, x, y, taille, { police: fam = 'sans-serif', poids = 700, couleur = '#fff', ecart = 0, aligne = 'center', etire = 1, rot = 0 } = {}) {
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.scale(etire, 1);
    g.font = `${poids} ${taille}px ${fam}`;
    g.textAlign = aligne;
    g.textBaseline = 'middle';
    g.fillStyle = couleur;
    if (ecart && 'letterSpacing' in g) g.letterSpacing = ecart + 'px';
    g.fillText(t, 0, 0);
    g.restore();
  }

  /* ======================================================================
     Les accessoires du mur
     ====================================================================== */
  /** la clim (en haut à gauche, comme sur la photo de la machine rouge) */
  function peindreClim(g, x, y) {
    tache(g, x + 45, y + 32, 50, 8, '#140C06', 0.3);
    plaque(g, x, y, 90, 29, '#E4E1DA', { r: 3, reflet: 0.3, ombre: 0.2 });
    g.fillStyle = '#C9C5BC';
    g.fillRect(x + 4, y + 21, 82, 3.4);
    g.fillStyle = '#9C988F';
    for (let k = 0; k < 16; k++) g.fillRect(x + 6 + k * 5, y + 21.4, 3.2, 0.7);
    g.fillStyle = '#6CC08A';
    g.beginPath(); g.arc(x + 80, y + 8, 0.9, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + 3, y + 2, 84, 1.2);
    // le tuyau qui descend le long du mur
    g.fillStyle = '#D8D4CA';
    g.fillRect(x + 84, y + 29, 3.2, 40);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(x + 86.4, y + 29, 0.8, 40);
  }
  /** le caisson lumineux rond « SMALL » (Small Custom), en drapeau sur le mur, vu de biais */
  function peindreSmall(g, cx, cy, nuit, fam) {
    // le halo sur la pierre
    g.globalCompositeOperation = 'screen';
    tache(g, cx - 6, cy, 60, 70, '#FFF1D6', nuit ? 0.55 : 0.32);
    g.globalCompositeOperation = 'source-over';
    // la potence au mur
    g.fillStyle = '#2A2A2C';
    g.fillRect(cx + 7, cy - 3, 11, 2.6);
    g.fillRect(cx + 16, cy - 7, 3, 10);
    // la tranche du disque (profondeur), puis la face lumineuse, très en biais
    const rx = 10.5, ry = 25.5;
    g.fillStyle = '#B9B6AF';
    g.beginPath(); g.ellipse(cx + 3.2, cy, rx, ry, 0, 0, TAU); g.fill();
    g.fillStyle = lin(g, cx - rx, 0, cx + rx, 0, [[0, '#EDE6D8'], [0.6, '#FBF6EC'], [1, '#DDD5C6']]);
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = '#A8A49A';
    g.lineWidth = 0.8;
    g.stroke();
    // SMALL : en capitales serrées, le long du grand axe (vu de biais, écrasé)
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx - 1, ry - 1, 0, 0, TAU); g.clip();
    texte(g, 'SMALL', cx + 0.4, cy, 11, { police: fam, poids: 800, couleur: '#1E1E1E', etire: 1.0, rot: -Math.PI / 2 * 0.93, ecart: 1 });
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath(); g.ellipse(cx - 5, cy - 12, 3, 9, 0.2, 0, TAU); g.fill();
  }
  /** l'armoire électrique blanche et ses autocollants */
  function peindreArmoire(g, x, y) {
    tache(g, x + 16, y + 58, 18, 4, '#140C06', 0.3);
    plaque(g, x, y, 30, 52, '#A9A59C', { r: 1.5, reflet: 0.2, ombre: 0.35 });
    g.fillStyle = 'rgba(40,30,20,0.18)'; g.fillRect(x, y, 30, 52);
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 0.4;
    g.strokeRect(x + 2, y + 2, 26, 48);
    g.fillStyle = '#C8322A';
    g.fillRect(x + 6, y + 10, 9, 12);
    g.fillStyle = '#FFFFFF';
    g.fillRect(x + 7, y + 11.5, 7, 3);
    g.fillStyle = '#F2C443';
    g.beginPath(); g.moveTo(x + 22, y + 26); g.lineTo(x + 27, y + 34); g.lineTo(x + 17, y + 34); g.closePath(); g.fill();
    g.fillStyle = '#222';
    g.fillRect(x + 21.6, y + 28.5, 0.8, 3);
    g.fillStyle = '#9A9790';
    g.fillRect(x + 27, y + 24, 2, 8);
    // la gaine qui monte au plafond
    g.fillStyle = '#2A2A2C';
    g.fillRect(x + 14, y - 80, 2.2, 80);
  }
  /** une étagère de planche sur équerres, avec ce qu'on y pose */
  function planche(g, x, y, w) {
    tache(g, x + w / 2, y + 5, w / 2, 4, '#140C06', 0.35);
    g.fillStyle = motif(g, texChene(), 0.14, x, y);
    g.fillRect(x, y, w, 2.6);
    g.fillStyle = 'rgba(255,235,200,0.28)';
    g.fillRect(x, y, w, 0.6);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x, y + 2, w, 0.6);
    g.fillStyle = '#2A2A2C';
    [x + 8, x + w - 10].forEach((ex) => { g.beginPath(); g.moveTo(ex, y + 2.6); g.lineTo(ex + 2, y + 2.6); g.lineTo(ex + 2, y + 12); g.closePath(); g.fill(); });
  }
  /** les polaroïds punaisés sur un liège : des baskets, des customs, Clément, l'établi */
  function peindrePolaroids(g, x, y, r) {
    plaque(g, x, y, 44, 34, '#B98E5E', { r: 0.8, reflet: 0.12, ombre: 0.2 });
    g.fillStyle = motif(g, texGrain(), 0.08);
    g.fillRect(x, y, 44, 34);
    g.strokeStyle = '#7A5A3A';
    g.lineWidth = 1.2;
    g.strokeRect(x + 0.6, y + 0.6, 42.8, 32.8);
    const images = [
      (gx, gy) => { g.fillStyle = '#E9E2D2'; g.fillRect(gx, gy, 7, 6.6); basket(g, gx + 0.6, gy + 5.2, 6, PAIRES[0]); },
      (gx, gy) => { g.fillStyle = '#3A4A5E'; g.fillRect(gx, gy, 7, 6.6); g.fillStyle = '#E0A987'; g.beginPath(); g.arc(gx + 3.5, gy + 2.8, 1.4, 0, TAU); g.fill(); g.fillStyle = '#3A2417'; g.beginPath(); g.arc(gx + 3.5, gy + 3.9, 1.3, 0, Math.PI); g.fill(); g.fillStyle = '#8C5A2E'; g.fillRect(gx + 1.8, gy + 5, 3.4, 1.6); },
      (gx, gy) => { g.fillStyle = '#2E684B'; g.fillRect(gx, gy, 7, 6.6); g.strokeStyle = '#8BC2A1'; g.lineWidth = 0.15; for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(gx + k, gy); g.lineTo(gx + k, gy + 6.6); g.stroke(); } derby(g, gx + 1, gy + 4.8, 5, '#6B3A22'); },
      (gx, gy) => { g.fillStyle = '#D9C9A8'; g.fillRect(gx, gy, 7, 6.6); basket(g, gx + 0.5, gy + 5.4, 6, PAIRES[5]); },
      (gx, gy) => { g.fillStyle = '#C8322A'; g.fillRect(gx, gy, 7, 6.6); g.fillStyle = '#F2C443'; g.beginPath(); g.arc(gx + 3.5, gy + 3.3, 2.2, 0, TAU); g.fill(); },
      (gx, gy) => { g.fillStyle = '#5A4B3D'; g.fillRect(gx, gy, 7, 6.6); g.fillStyle = C.rouge; g.fillRect(gx + 1, gy + 2.5, 5, 3.4); g.fillStyle = '#222'; g.fillRect(gx + 1.5, gy + 3.6, 4, 1); },
      (gx, gy) => { g.fillStyle = '#E4DCCB'; g.fillRect(gx, gy, 7, 6.6); basket(g, gx + 0.4, gy + 5.4, 6.2, PAIRES[1]); },
      (gx, gy) => { g.fillStyle = '#1E1E22'; g.fillRect(gx, gy, 7, 6.6); g.fillStyle = C.ticket; g.fillRect(gx + 2.5, gy + 1.2, 2.2, 4.2); },
    ];
    const pos = [[3, 2.5], [13.5, 3.5], [24, 2], [34, 3.2], [5, 17.5], [15.5, 18.5], [26, 17], [34.5, 18.8]];
    pos.forEach(([px, py], i) => {
      const a = (r() - 0.5) * 0.22;
      g.save();
      g.translate(x + px + 4.2, y + py + 5);
      g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-4.2 + 0.4, -5 + 0.5, 8.4, 10);
      g.fillStyle = '#F6F3EC';
      g.fillRect(-4.2, -5, 8.4, 10);
      images[i % images.length](-3.5, -4.3);
      g.fillStyle = ['#D8342C', '#2F6FB8', '#E9B04A', '#2E684B'][i % 4];
      g.beginPath(); g.arc(0, -4.3, 0.7, 0, TAU); g.fill();
      g.restore();
    });
  }
  /** le râtelier d'outils au-dessus de l'établi */
  function peindreRatelier(g, x, y, w) {
    tache(g, x + w / 2, y + 4, w / 2, 3, '#140C06', 0.3);
    g.fillStyle = motif(g, texChene(), 0.12, x, y);
    g.fillRect(x, y, w, 4);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x, y + 3.4, w, 0.6);
    const outils = [
      (ox) => { g.fillStyle = '#B88A56'; g.fillRect(ox - 0.8, y + 4, 1.6, 18); g.fillStyle = '#5E656A'; g.fillRect(ox - 3.5, y + 21, 7, 3.4); }, // marteau (tête en bas)
      (ox) => { g.strokeStyle = '#6E7378'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(ox - 1.5, y + 4); g.lineTo(ox - 0.4, y + 18); g.moveTo(ox + 1.5, y + 4); g.lineTo(ox + 0.4, y + 18); g.stroke(); g.fillStyle = '#C8262C'; g.fillRect(ox - 2, y + 4, 1.4, 6); g.fillRect(ox + 0.6, y + 4, 1.4, 6); }, // pince
      (ox) => { g.fillStyle = '#8A6A4A'; g.fillRect(ox - 0.9, y + 4, 1.8, 8); g.fillStyle = '#C9CDD0'; g.beginPath(); g.moveTo(ox - 0.8, y + 12); g.lineTo(ox + 0.8, y + 12); g.lineTo(ox + 0.2, y + 22); g.closePath(); g.fill(); }, // tranchet
      (ox) => { g.fillStyle = '#6B5A48'; g.fillRect(ox - 1.2, y + 4, 2.4, 20); g.fillStyle = 'rgba(255,255,255,0.15)'; for (let k = 0; k < 9; k++) g.fillRect(ox - 1.2, y + 6 + k * 2, 2.4, 0.4); }, // râpe
      (ox) => { g.strokeStyle = '#E07A2E'; g.lineWidth = 1; g.beginPath(); g.ellipse(ox - 1.4, y + 7, 1.4, 2.4, 0, 0, TAU); g.ellipse(ox + 1.4, y + 7, 1.4, 2.4, 0, 0, TAU); g.stroke(); g.fillStyle = '#C9CDD0'; g.beginPath(); g.moveTo(ox - 0.8, y + 9); g.lineTo(ox + 0.8, y + 9); g.lineTo(ox, y + 20); g.closePath(); g.fill(); }, // ciseaux
      (ox) => { g.fillStyle = '#B88A56'; g.beginPath(); g.ellipse(ox, y + 8, 1.6, 3.4, 0, 0, TAU); g.fill(); g.strokeStyle = '#9EA3A8'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(ox, y + 11); g.lineTo(ox, y + 19); g.stroke(); }, // alêne
      (ox) => { g.fillStyle = '#B88A56'; g.fillRect(ox - 0.7, y + 4, 1.4, 16); g.fillStyle = '#50565B'; g.fillRect(ox - 2.6, y + 19, 5.2, 4.4); g.fillStyle = '#8E949A'; g.fillRect(ox - 2.6, y + 19, 5.2, 1); }, // maillet
    ];
    outils.forEach((f, i) => f(x + 7 + i * ((w - 14) / (outils.length - 1))));
    g.fillStyle = '#2A2A2C';
    for (let k = 0; k < 7; k++) g.fillRect(x + 7 + k * ((w - 14) / 6) - 0.4, y + 3, 0.8, 1.6);
  }
  /** la pendule (l'heure de Paris est posée à chaque image) : le cadran seul */
  function peindrePendule(g, x, y, fam) {
    tache(g, x + 1, y + 2, 15, 15, '#140C06', 0.35);
    g.fillStyle = '#2A2A2C';
    g.beginPath(); g.arc(x, y, 12.5, 0, TAU); g.fill();
    g.fillStyle = rad(g, x - 3, y - 3, 12, [[0, '#FBF6EA'], [1, '#E6DCC8']]);
    g.beginPath(); g.arc(x, y, 11, 0, TAU); g.fill();
    g.strokeStyle = '#2A2420';
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * TAU, l = k % 5 ? 0.7 : 1.8;
      g.lineWidth = k % 5 ? 0.18 : 0.45;
      g.beginPath(); g.moveTo(x + Math.sin(a) * (10.2 - l), y - Math.cos(a) * (10.2 - l)); g.lineTo(x + Math.sin(a) * 10.2, y - Math.cos(a) * 10.2); g.stroke();
    }
    [12, 3, 6, 9].forEach((h) => { const a = (h / 12) * TAU; texte(g, String(h), x + Math.sin(a) * 7.4, y - Math.cos(a) * 7.4 + 0.2, 2.6, { police: fam, poids: 700, couleur: '#2A2420' }); });
  }
  /** le panneau des clés vierges (laiton et nickel) */
  function peindreCles(g, x, y, w, h) {
    tache(g, x + w / 2, y + h + 2, w / 2, 3, '#140C06', 0.3);
    plaque(g, x, y, w, h, '#3A2A1E', { r: 1, reflet: 0.1, ombre: 0.3 });
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let j = 0; j < 5; j++) for (let i = 0; i < 9; i++) g.fillRect(x + 3 + i * ((w - 6) / 8.6), y + 4 + j * (h - 8) / 4.4, 0.8, 0.8);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 9; i++) {
      const kx = x + 3.4 + i * ((w - 6) / 8.6), ky = y + 5 + j * (h - 8) / 4.4;
      const laiton = (i + j * 2) % 3 !== 0;
      g.fillStyle = laiton ? '#D6B25C' : '#C6CACD';
      g.beginPath(); g.arc(kx, ky + 1.2, 1.1, 0, TAU); g.fill();
      g.fillRect(kx - 0.45, ky + 2, 0.9, 4.2);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(kx - 0.45, ky + 2, 0.3, 4.2);
    }
  }
  /** les étagères des paires qui attendent leur propriétaire, chacune avec son ticket jaune */
  function peindreEtageres(g, x, y, w, r) {
    const hs = [0, 30, 60, 90];
    // les montants
    g.fillStyle = motif(g, texChene(), 0.12, x, y);
    g.fillRect(x, y - 4, 3, 100);
    g.fillRect(x + w - 3, y - 4, 3, 100);
    hs.forEach((dy, j) => {
      const py = y + dy;
      planche(g, x, py, w);
      let px = x + 4;
      while (px < x + w - 20) {
        const k = r(), L = 17 + r() * 4;
        if (k < 0.45) basket(g, px, py, L, PAIRES[Math.floor(r() * PAIRES.length)]);
        else if (k < 0.75) derby(g, px, py, L, ['#5A3422', '#1F1A17', '#7A4A2A', '#3A2A20'][Math.floor(r() * 4)]);
        else { // une bottine
          derby(g, px, py, L, '#2A201A');
          g.fillStyle = '#2A201A';
          g.fillRect(px + 0.5, py - 16, 7, 6);
        }
        if (r() < 0.8) ticket(g, px + L * 0.35, py - 12 - r() * 3, 3.6, 6.4, (r() - 0.5) * 0.3);
        px += L + 3 + r() * 3;
      }
    });
  }
  /** le sac à dos jaune pendu à son crochet (photo de la boutique) */
  function peindreSac(g, x, y) {
    g.fillStyle = '#2A2A2C';
    g.fillRect(x - 0.6, y - 2, 1.2, 4);
    g.fillStyle = '#E8B82E';
    g.beginPath();
    g.moveTo(x - 4, y + 2); g.quadraticCurveTo(x - 13, y + 8, x - 12, y + 32); g.quadraticCurveTo(x - 11, y + 40, x, y + 40);
    g.quadraticCurveTo(x + 11, y + 40, x + 12, y + 32); g.quadraticCurveTo(x + 13, y + 8, x + 4, y + 2); g.closePath();
    g.fill();
    g.fillStyle = lin(g, x - 12, 0, x + 12, 0, [[0, 'rgba(0,0,0,0.25)'], [0.35, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.3)']]);
    g.fill();
    g.fillStyle = '#C99A22';
    g.beginPath(); rr(g, x - 8, y + 20, 16, 12, 3); g.fill();
    g.strokeStyle = '#2A2A2C'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - 7, y + 20.5); g.lineTo(x + 7, y + 20.5); g.stroke();
    g.fillStyle = '#C8322A';
    g.fillRect(x - 3, y + 12, 6, 3);
    g.strokeStyle = '#2A2A2C'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - 6, y + 4); g.quadraticCurveTo(x - 9, y + 22, x - 5, y + 38); g.moveTo(x + 6, y + 4); g.quadraticCurveTo(x + 9, y + 22, x + 5, y + 38); g.stroke();
  }
  /** la porte vitrée (menuiserie vert sauge, comme la devanture) et la rue derrière */
  function peindrePorte(g, x, y, w, h, nuit, fam) {
    // la rue : la façade d'en face floue, le ciel ; le soir, bleu nuit et lanterne
    const ciel = nuit ? ['#0F1A33', '#1B2A4A'] : ['#DCE6EA', '#F2EEE2'];
    g.fillStyle = lin(g, 0, y, 0, y + h, [[0, ciel[0]], [0.5, ciel[1]], [1, nuit ? '#2A2A30' : '#CFC8B8']]);
    g.fillRect(x, y, w, h);
    // la façade d'en face (enduit crème, volets gris-vert), floue
    g.fillStyle = nuit ? 'rgba(60,62,80,0.9)' : 'rgba(214,204,184,0.9)';
    g.fillRect(x, y + h * 0.12, w, h * 0.6);
    g.fillStyle = nuit ? 'rgba(40,44,60,0.9)' : 'rgba(130,142,140,0.8)';
    [[0.1, 0.18], [0.55, 0.18], [0.1, 0.46], [0.55, 0.46]].forEach(([u, v]) => g.fillRect(x + w * u, y + h * v, w * 0.3, h * 0.2));
    if (nuit) {
      g.fillStyle = 'rgba(255,196,110,0.85)';
      g.fillRect(x + w * 0.58, y + h * 0.2, w * 0.24, h * 0.16);
      g.globalCompositeOperation = 'screen';
      tache(g, x + w * 0.25, y + h * 0.3, 22, 26, '#FFD27A', 0.7);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#FFE9B8';
      g.beginPath(); g.arc(x + w * 0.25, y + h * 0.3, 2, 0, TAU); g.fill();
    }
    // le trottoir, un potelet
    g.fillStyle = nuit ? '#23242A' : '#A9A396';
    g.fillRect(x, y + h * 0.78, w, h * 0.22);
    g.fillStyle = nuit ? '#15161A' : '#4A4A48';
    g.fillRect(x + w * 0.7, y + h * 0.62, 3, h * 0.2);
    // le reflet sur la vitre
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath(); g.moveTo(x + w * 0.15, y + h); g.lineTo(x + w * 0.55, y); g.lineTo(x + w * 0.72, y); g.lineTo(x + w * 0.32, y + h); g.closePath(); g.fill();
    // la menuiserie : dormant, imposte, vantail, soubassement plein
    const cadre = (cx, cy, cw, ch, e) => {
      g.fillStyle = C.sauge;
      g.fillRect(cx, cy, cw, e); g.fillRect(cx, cy + ch - e, cw, e); g.fillRect(cx, cy, e, ch); g.fillRect(cx + cw - e, cy, e, ch);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(cx, cy, cw, 0.8); g.fillRect(cx, cy, 0.8, ch);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(cx + e - 0.8, cy + e, 0.8, ch - 2 * e); g.fillRect(cx + e, cy + e - 0.8, cw - 2 * e, 0.8);
    };
    cadre(x - 5, y - 5, w + 10, h + 5, 5);
    cadre(x, y + 26, w, h - 26, 4);
    g.fillStyle = C.sauge;
    g.fillRect(x, y + 22, w, 4);
    g.fillStyle = C.saugeSombre;
    g.fillRect(x + 4, y + h - 64, w - 8, 60);
    g.fillStyle = C.sauge;
    g.fillRect(x + 8, y + h - 60, w - 16, 52);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(x + 8, y + h - 8, w - 16, 1);
    // le logo CORDO63 sur l'imposte (ses vrais tracés, co-brand.js), vu de l'intérieur : en miroir, doré
    if (CO.BRAND && CO.BRAND.lettres && window.Path2D) {
      const lw = w * 0.82, k = lw / CO.BRAND.largeur;
      g.save();
      g.translate(x + w / 2 + lw / 2, y + 12 - 50 * k);
      g.scale(-k, k);
      g.strokeStyle = 'rgba(234,210,154,0.85)';
      g.lineWidth = CO.BRAND.trait;
      g.lineJoin = 'miter';
      CO.BRAND.lettres.forEach((l) => g.stroke(new Path2D(l.d)));
      g.restore();
    }
    // la poignée, la clochette de laiton sur son ressort
    g.fillStyle = '#C9A45C';
    g.fillRect(x + 6, y + h * 0.55, 1.6, 9);
    g.strokeStyle = '#2A2A2C'; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(x + w - 8, y - 5); g.quadraticCurveTo(x + w - 14, y + 2, x + w - 12, y + 7); g.stroke();
    g.fillStyle = lin(g, x + w - 15, 0, x + w - 9, 0, [[0, '#8E6A2A'], [0.4, '#F2D48A'], [1, '#8E6A2A']]);
    g.beginPath(); g.moveTo(x + w - 15, y + 12); g.quadraticCurveTo(x + w - 12, y + 4, x + w - 9, y + 12); g.closePath(); g.fill();
    // la pancarte, vue de dos
    g.strokeStyle = '#D9C9A8'; g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(x + w / 2 - 7, y + 40); g.lineTo(x + w / 2, y + 34); g.lineTo(x + w / 2 + 7, y + 40); g.stroke();
    g.fillStyle = '#EDE3CF';
    g.fillRect(x + w / 2 - 9, y + 40, 18, 7.5);
    g.strokeStyle = C.sauge; g.lineWidth = 0.6;
    g.strokeRect(x + w / 2 - 9, y + 40, 18, 7.5);
  }

  /* ======================================================================
     Les machines et les meubles (au plan de Clément)
     ====================================================================== */
  /** la finisseuse rouge (SUR mini II) : caisson, porte noire, cavité des brosses, capot, pupitre */
  const ROUES = [
    { x: 111, w: 9, r: 12.2, type: 'fraise' },
    { x: 127, w: 14, r: 13.4, type: 'abrasif' },
    { x: 145, w: 13, r: 13, type: 'noire' },
    { x: 163, w: 13, r: 13, type: 'tampico' },
    { x: 181, w: 12, r: 13.6, type: 'feutre' },
    { x: 200, w: 16, r: 13.4, type: 'crin' },
  ];
  const ARBRE_Y = -99;
  function peindreFinisseuse(g, fam) {
    const x0 = 96, x1 = 222;
    ombrePose(g, 159, 0, 150, 0.5);
    // les roulettes
    [102, 216].forEach((x) => { g.fillStyle = '#1C1C1E'; g.beginPath(); g.arc(x, -3.2, 3.2, 0, TAU); g.fill(); g.fillStyle = '#5E6368'; g.beginPath(); g.arc(x, -3.2, 1.2, 0, TAU); g.fill(); g.fillStyle = '#3A3A3C'; g.fillRect(x - 2, -9, 4, 4); });
    // le flanc droit (la profondeur du caisson)
    g.fillStyle = C.rougeSombre;
    g.beginPath(); g.moveTo(x1, -8); g.lineTo(x1 + 6, -12); g.lineTo(x1 + 6, -150); g.lineTo(x1, -153); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x1 + 1, -80, 5, 2);
    // « SUR » en grandes lettres blanches sur le flanc (vues de biais)
    g.save();
    g.transform(0.32, -0.07, 0, 1, x1 + 1.2, -30);
    texte(g, 'SUR', 8, -18, 16, { police: fam, poids: 800, couleur: 'rgba(255,255,255,0.9)', rot: -Math.PI / 2 });
    g.restore();
    // le caisson bas : cadre rouge, porte noire (le sac à poussière)
    plaque(g, x0, -82, x1 - x0, 74, C.rouge, { r: 1, reflet: 0.2, ombre: 0.35 });
    plaque(g, x0 + 6, -74, x1 - x0 - 12, 60, '#1A1A1C', { r: 1.2, reflet: 0.08, ombre: 0.4 });
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x0 + 8, -72, x1 - x0 - 16, 20);
    g.fillStyle = '#6E7378';
    g.fillRect(x0 + 58, -46, 10, 2.2);
    // l'éraflure, la trace de doigts, l'autocollant bleu
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x0 + 20, -66, 18, 0.5);
    g.fillStyle = '#1E3A6E';
    g.fillRect(x0 + 94, -68, 12, 6);
    // le socle
    g.fillStyle = C.rougeSombre;
    g.fillRect(x0, -12, x1 - x0, 4);
    // la bouche d'aspiration (grille noire) sous les brosses
    g.fillStyle = '#1A1A1C';
    g.fillRect(x0 + 2, -86, x1 - x0 - 4, 5);
    g.fillStyle = '#3A3A3C';
    for (let x = x0 + 4; x < x1 - 4; x += 2.4) g.fillRect(x, -85.4, 1.2, 3.8);
    // la cavité des brosses (l'intérieur du capot, sombre)
    g.fillStyle = lin(g, 0, -115, 0, -86, [[0, '#120404'], [0.5, '#2A0A0C'], [1, '#0A0303']]);
    g.fillRect(x0 + 2, -115, x1 - x0 - 4, 30);
    // l'arbre (acier)
    g.fillStyle = lin(g, 0, ARBRE_Y - 1.4, 0, ARBRE_Y + 1.4, [[0, '#F2F4F5'], [0.5, '#9EA3A8'], [1, '#4E5358']]);
    g.fillRect(x0 + 3, ARBRE_Y - 1.3, x1 - x0 - 6, 2.6);
    // le capot : un grand caisson rouge, le pupitre
    plaque(g, x0, -151, x1 - x0, 36, C.rouge, { r: 1.5, reflet: 0.28, ombre: 0.3 });
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x0, -116, x1 - x0, 1.5);
    // le rebord qui protège les brosses (lèvre du capot)
    g.fillStyle = C.rougeSombre;
    g.fillRect(x0 + 1, -118, x1 - x0 - 2, 3);
    // la plaque de la marque : SUR, mini II (à gauche)
    plaque(g, x0 + 8, -145, 36, 13, '#F4F1EA', { r: 1, reflet: 0.2, ombre: 0.15 });
    texte(g, 'SUR', x0 + 19, -138.4, 8.5, { police: fam, poids: 800, couleur: C.rouge, ecart: 0.5 });
    texte(g, 'mini II', x0 + 35, -138, 4.2, { police: fam, poids: 700, couleur: '#2A2420' });
    // le pupitre de commande (à droite, sous la main de Clément) : arrêt d'urgence, marche, arrêt, compte-tours
    const px = x1 - 51;
    plaque(g, px, -145, 46, 22, '#1E1F22', { r: 1.2, reflet: 0.12, ombre: 0.3 });
    g.fillStyle = '#F2D43A';
    g.beginPath(); g.arc(px + 9, -134, 5.2, 0, TAU); g.fill();
    g.fillStyle = rad(g, px + 8, -135.5, 3.6, [[0, '#FF6A5E'], [0.7, '#D11E22'], [1, '#8E1115']]);
    g.beginPath(); g.arc(px + 9, -134, 3.6, 0, TAU); g.fill();
    [[px + 20, '#39A866'], [px + 27, '#39A866'], [px + 34, '#D8342C']].forEach(([bx, c]) => {
      g.fillStyle = '#2E2F33'; g.beginPath(); g.arc(bx, -136, 2.6, 0, TAU); g.fill();
      g.fillStyle = c; g.beginPath(); g.arc(bx, -136.3, 1.9, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.arc(bx - 0.6, -137, 0.6, 0, TAU); g.fill();
    });
    g.fillStyle = '#0E2A1A';
    g.fillRect(px + 18, -130.5, 20, 4.5);
    g.fillStyle = '#9EA3A8';
    [px + 41].forEach((bx) => { g.beginPath(); g.arc(bx, -134, 2.2, 0, TAU); g.fill(); });
    // le dessus (un peu vu d'en haut) et ce qui traîne : boîte de cire, brosse, bombe, chiffon
    g.fillStyle = lin(g, 0, -156, 0, -151, [[0, '#9A1A1E'], [1, '#E23A36']]);
    g.beginPath(); g.moveTo(x0 + 1, -151); g.lineTo(x0 + 5, -156); g.lineTo(x1 + 4, -156); g.lineTo(x1, -151); g.closePath(); g.fill();
    g.fillStyle = '#2A2A2C'; g.fillRect(x0 + 10, -161, 9, 6); g.fillStyle = '#C9A45C'; g.fillRect(x0 + 10, -162, 9, 1.4); // boîte de cire
    g.fillStyle = '#8A6A4A'; g.fillRect(x0 + 26, -159, 14, 3.4); g.fillStyle = '#EDE3CF'; for (let k = 0; k < 12; k++) g.fillRect(x0 + 26.4 + k * 1.1, -160.4, 0.6, 1.6); // brosse
    g.fillStyle = '#E8E6E0'; g.fillRect(x0 + 46, -168, 5.2, 13); g.fillStyle = '#2F6FB8'; g.fillRect(x0 + 46, -164, 5.2, 4); g.fillStyle = '#2A2A2C'; g.fillRect(x0 + 47, -170, 3.2, 2.2); // bombe
    g.fillStyle = '#C9B89A'; g.beginPath(); g.moveTo(x0 + 2, -155); g.quadraticCurveTo(x0 + 6, -161, x0 + 9, -156.5); g.quadraticCurveTo(x0 + 8, -154, x0 + 2, -155); g.fill(); // chiffon
    // la tête de ponçage sur le dessus (moteur gris, disque)
    tube(g, x0 + 58, -174, 22, 18, '#8E9296', '#D6DADC', '#4E5358');
    g.fillStyle = '#2A2A2C';
    g.fillRect(x0 + 57, -175, 24, 2);
    g.fillStyle = lin(g, x0 + 80, 0, x0 + 84, 0, [[0, '#6E7378'], [0.5, '#E6E9EB'], [1, '#5E6368']]);
    g.beginPath(); g.ellipse(x0 + 82, -165, 2.4, 9, 0, 0, TAU); g.fill();
    // la gaine d'aspiration qui monte vers le mur
    g.strokeStyle = '#3A3A3C'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x0 + 20, -156); g.bezierCurveTo(x0 + 16, -190, x0 + 30, -200, x0 + 36, -230); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.6; g.setLineDash([0.6, 1.4]);
    g.stroke();
    g.setLineDash([]);
    // la lumière chaude sur le capot
    tache(g, x0 + 60, -146, 60, 14, '#FFE2B0', 0.18);
  }

  /** la presse à semelles bleu-gris et ses flexibles d'air en spirale (photo de la machine rouge) */
  function peindrePresse(g) {
    ombrePose(g, 48, 0, 76, 0.5);
    // les flexibles bleus en spirale, à gauche, vers le mur
    g.strokeStyle = C.bleuTuyau; g.lineWidth = 1.2;
    g.beginPath();
    for (let k = 0; k < 16; k++) { const yy = -176 + k * 5.5; g.moveTo(14, yy); g.bezierCurveTo(8, yy + 1, 8, yy + 4.5, 14, yy + 5.5); }
    g.stroke();
    g.beginPath(); g.moveTo(14, -176); g.quadraticCurveTo(22, -190, 38, -180); g.stroke();
    // le bâti : colonne arrière, bras, socle
    plaque(g, 20, -80, 58, 78, C.bleuPresse, { r: 1.2, reflet: 0.22, ombre: 0.35 });
    plaque(g, 26, -72, 46, 44, C.bleuPresseSombre, { r: 1, reflet: 0.1, ombre: 0.3 });
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(28, -70, 42, 12);
    g.fillStyle = '#1C1C1E'; g.fillRect(40, -6, 18, 4); // la pédale
    g.fillStyle = '#2A2A2C'; g.fillRect(20, -4, 58, 4);
    tube(g, 62, -186, 13, 108, C.bleuPresse, '#A9C0D6', '#3A5470');
    plaque(g, 22, -190, 55, 14, C.bleuPresse, { r: 2, reflet: 0.25, ombre: 0.3 });
    // le vérin pneumatique qui pend du bras
    tube(g, 36, -178, 16, 30, '#A7ADB2', '#E8EBED', '#5E6368');
    g.fillStyle = '#2A2A2C'; g.fillRect(35, -179, 18, 2.4); g.fillRect(35, -150, 18, 2.4);
    // le coussin de caoutchouc noir (on y pose la chaussure, semelle en bas)
    plaque(g, 22, -95, 52, 15, '#1E1E20', { r: 2.5, reflet: 0.1, ombre: 0.35 });
    g.fillStyle = lin(g, 0, -95, 0, -91, [[0, '#4A4A4E'], [1, '#1E1E20']]);
    g.beginPath(); g.moveTo(24, -91); g.quadraticCurveTo(48, -97, 72, -91); g.closePath(); g.fill();
    // le manomètre (l'aiguille bouge : dessinée à part)
    g.fillStyle = '#2A2A2C'; g.beginPath(); g.arc(69, -150, 5.6, 0, TAU); g.fill();
    g.fillStyle = '#F2EEE6'; g.beginPath(); g.arc(69, -150, 4.6, 0, TAU); g.fill();
    g.strokeStyle = '#C8322A'; g.lineWidth = 0.6;
    g.beginPath(); g.arc(69, -150, 3.8, -0.6, 0.4); g.stroke();
    g.strokeStyle = '#2A2420'; g.lineWidth = 0.2;
    for (let k = 0; k < 9; k++) { const a = -2.4 + k * 0.6; g.beginPath(); g.moveTo(69 + Math.cos(a) * 3.2, -150 + Math.sin(a) * 3.2); g.lineTo(69 + Math.cos(a) * 4.2, -150 + Math.sin(a) * 4.2); g.stroke(); }
    // le voyant vert, l'étiquette d'avertissement
    g.fillStyle = '#39D26A'; g.beginPath(); g.arc(30, -183, 1.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(57,210,106,0.35)'; g.beginPath(); g.arc(30, -183, 2.8, 0, TAU); g.fill();
    g.fillStyle = '#F2C443'; g.beginPath(); g.moveTo(66, -118); g.lineTo(71, -110); g.lineTo(61, -110); g.closePath(); g.fill();
    // le pivot du levier
    g.fillStyle = '#2A2A2C'; g.beginPath(); g.arc(76, -122, 2.6, 0, TAU); g.fill();
    tache(g, 48, -178, 40, 10, '#FFE2B0', 0.15);
  }

  /** l'établi : le plateau d'aggloméré usé (vu un peu d'en haut), le tapis de découpe vert quadrillé,
      le pied de fer, les outils rangés */
  const ETABLI = { x0: 248, x1: 358, y: -91, fond: -105 };
  function peindreEtabli(g, fam) {
    const { x0, x1, y, fond } = ETABLI;
    // le devant : le chant du plateau, la ceinture, le tiroir
    g.fillStyle = motif(g, texAgglo(), 0.16, x0, y);
    g.fillRect(x0, y, x1 - x0, 5);
    g.fillStyle = 'rgba(255,220,180,0.25)'; g.fillRect(x0, y, x1 - x0, 0.8);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0, y + 4.4, x1 - x0, 0.6);
    g.fillStyle = motif(g, texChene(), 0.15, x0, y + 5);
    g.fillRect(x0 + 2, y + 5, x1 - x0 - 4, 32);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 + 2, y + 5, x1 - x0 - 4, 32);
    g.fillStyle = lin(g, 0, y + 5, 0, y + 37, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x0 + 2, y + 5, x1 - x0 - 4, 32);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.5; g.strokeRect(x0 + 30, y + 10, 50, 14);
    g.fillStyle = '#C9A45C'; g.fillRect(x0 + 51, y + 16, 8, 1.6);
    // le bas de l'établi : fermé jusqu'au sol, deux grands tiroirs, un socle
    g.fillStyle = motif(g, texChene(), 0.15, x0, y + 37);
    g.fillRect(x0 + 2, y + 37, x1 - x0 - 4, -y - 37);
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(x0 + 2, y + 37, x1 - x0 - 4, -y - 37);
    g.fillStyle = lin(g, 0, y + 37, 0, 0, [[0, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0.5)']]); g.fillRect(x0 + 2, y + 37, x1 - x0 - 4, -y - 37);
    [[x0 + 8, y + 42, 44, 24], [x1 - 52, y + 42, 44, 24], [x0 + 8, y + 70, x1 - x0 - 16, 16]].forEach(([tx, ty, tw, th]) => {
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.5; g.strokeRect(tx, ty, tw, th);
      g.strokeStyle = 'rgba(255,225,190,0.1)'; g.strokeRect(tx + 0.5, ty + 0.5, tw, th);
      g.fillStyle = '#C9A45C'; g.fillRect(tx + tw / 2 - 4, ty + th / 2 - 0.8, 8, 1.6);
    });
    g.fillStyle = '#1C120C'; g.fillRect(x0 + 2, -3, x1 - x0 - 4, 3);
    // le dessus, en perspective (le fond est plus haut et un peu plus étroit)
    const dessus = [[x0, y], [x1, y], [x1 - 4, fond], [x0 + 4, fond]];
    g.beginPath(); g.moveTo(dessus[0][0], dessus[0][1]); dessus.slice(1).forEach((p) => g.lineTo(p[0], p[1])); g.closePath();
    g.fillStyle = motif(g, texAgglo(), 0.14, x0, fond);
    g.fill();
    g.fillStyle = lin(g, 0, fond, 0, y, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(255,230,190,0.1)']]);
    g.fill();
    // des taches de colle, de teinture
    [[x0 + 8, -96, 3, '#2A1A10'], [x1 - 10, -94, 2.4, '#3A2A1E'], [x1 - 14, -101, 1.8, '#6E2A1C']].forEach(([tx, ty, tr, tc]) => { g.fillStyle = rgba(tc, 0.5); g.beginPath(); g.ellipse(tx, ty, tr, tr * 0.35, 0, 0, TAU); g.fill(); });
    // le tapis de découpe vert quadrillé (bords jaunes gradués)
    const T = [[x0 + 12, y - 1], [x1 - 22, y - 1], [x1 - 25, fond + 1.5], [x0 + 15, fond + 1.5]];
    g.beginPath(); g.moveTo(T[0][0], T[0][1]); T.slice(1).forEach((p) => g.lineTo(p[0], p[1])); g.closePath();
    g.fillStyle = C.tapis; g.fill();
    g.save(); g.clip();
    g.strokeStyle = rgba(C.tapisClair, 0.55); g.lineWidth = 0.14;
    for (let k = 0; k <= 30; k++) { const t = k / 30, xa = lerp(T[0][0], T[1][0], t), xb = lerp(T[3][0], T[2][0], t); g.beginPath(); g.moveTo(xa, T[0][1]); g.lineTo(xb, T[3][1]); g.stroke(); }
    for (let k = 0; k <= 10; k++) { const t = Math.pow(k / 10, 1.25), yy = lerp(T[0][1], T[3][1], t); g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke(); }
    g.strokeStyle = rgba('#F2D24A', 0.8); g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(T[0][0], T[0][1] - 0.5); g.lineTo(T[1][0], T[1][1] - 0.5); g.stroke();
    g.strokeStyle = rgba(C.tapisClair, 0.35); g.lineWidth = 0.2;
    g.beginPath(); g.moveTo(T[0][0], T[0][1]); g.lineTo(T[2][0], T[2][1]); g.stroke();
    g.fillStyle = lin(g, 0, fond, 0, y, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x0, fond, x1 - x0, y - fond);
    g.restore();
    // le pied de fer : colonne de fonte, trois bras (le bras du haut porte la chaussure : dessinée à part)
    const px = 300;
    ombrePose(g, px, -97.5, 22, 0.45);
    g.fillStyle = '#2B2C2F';
    g.beginPath(); g.ellipse(px, -97.5, 7, 2, 0, 0, TAU); g.fill();
    tube(g, px - 2.2, -121, 4.4, 24, '#3A3B3F', '#8E9296', '#1A1A1C');
    g.fillStyle = '#2B2C2F';
    g.beginPath(); g.moveTo(px - 2, -112); g.quadraticCurveTo(px - 10, -114, px - 13, -110); g.lineTo(px - 12, -107.5); g.quadraticCurveTo(px - 8, -110, px - 2, -108.5); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(px + 2, -110); g.quadraticCurveTo(px + 8, -111, px + 10, -107); g.lineTo(px + 8.5, -105.6); g.quadraticCurveTo(px + 6, -108, px + 2, -107); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(px - 12, -110.6, 6, 0.6);
    // les outils rangés sur le tapis : tenailles, tranchet, la coupelle de clous, la brosse, le réglet
    ombrePose(g, 268, -95.5, 14, 0.3);
    g.strokeStyle = '#5E6368'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(262, -94.5); g.lineTo(274, -97.5); g.moveTo(262, -96.5); g.lineTo(274, -96.2); g.stroke();
    g.fillStyle = '#9EA3A8'; g.beginPath(); g.ellipse(275.5, -97, 2, 1.2, 0, 0, TAU); g.fill();
    // la coupelle de clous (à droite du pied : la main gauche y puise)
    g.fillStyle = '#6E7378'; g.beginPath(); g.ellipse(322, -100.5, 4.6, 1.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#9EA3A8'; g.beginPath(); g.ellipse(322, -101, 3.8, 1.1, 0, 0, TAU); g.fill();
    g.fillStyle = '#4E5358'; for (let k = 0; k < 8; k++) { g.fillRect(319.6 + (k * 1.7) % 5, -101.6 + (k % 3) * 0.4, 0.6, 0.35); }
    // le tranchet
    g.fillStyle = '#8A6A4A'; g.fillRect(332, -95.5, 7, 1.6);
    g.fillStyle = '#C9CDD0'; g.beginPath(); g.moveTo(339, -95.5); g.lineTo(344, -95); g.lineTo(339, -94); g.closePath(); g.fill();
    // le réglet d'acier, le long du fond
    g.fillStyle = '#C9CDD0'; g.beginPath(); g.moveTo(262, -103.5); g.lineTo(312, -103.8); g.lineTo(312, -103); g.lineTo(262, -102.6); g.closePath(); g.fill();
    // le ticket jaune posé
    g.save(); g.translate(262, -101.5); g.scale(1, 0.4); g.rotate(0.3);
    g.fillStyle = C.ticket; g.fillRect(-3, -5, 6, 10); g.fillStyle = C.pastille; g.beginPath(); g.arc(1.4, 3, 0.9, 0, TAU); g.fill();
    g.restore();
    // la lumière de la suspension verte sur le tapis
    g.globalCompositeOperation = 'screen';
    tache(g, 303, -99, 40, 7, '#FFE6B8', 0.25);
    g.globalCompositeOperation = 'source-over';
  }

  /** la machine à coudre à colonne (piqueuse noire aux décors dorés) sur sa table, à gauche :
      Clément s'assoit derrière, un peu à droite de l'aiguille */
  const COUTURE = { x0: 372, x1: 452, y: -72, fond: -83, aiguilleX: 389, aiguilleY: -95, volantX: 426, volantY: -106 };
  function peindreCouture(g) {
    const { x0, x1, y, fond } = COUTURE;
    // la table : plateau de chêne clair, pieds d'acier, le moteur dessous
    g.fillStyle = motif(g, texChene(), 0.12, x0, y);
    g.fillRect(x0, y, x1 - x0, 4);
    g.fillStyle = 'rgba(255,230,190,0.3)'; g.fillRect(x0, y, x1 - x0, 0.7);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, y + 3.4, x1 - x0, 0.6);
    g.fillStyle = '#2A2A2C'; g.fillRect(x0 + 4, y + 4, 3, -y - 4); g.fillRect(x1 - 7, y + 4, 3, -y - 4);
    g.fillRect(x0 + 4, -14, x1 - x0 - 8, 2);
    g.fillStyle = '#3A3A3C'; g.fillRect(x0 + 18, y + 4, 30, 10);
    g.fillStyle = '#6E7378'; g.beginPath(); g.arc(x0 + 44, y + 9, 3, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.lineTo(x1 - 3, fond); g.lineTo(x0 + 3, fond); g.closePath();
    g.fillStyle = motif(g, texChene(), 0.1, x0, fond); g.fill();
    g.fillStyle = lin(g, 0, fond, 0, y, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(255,235,200,0.12)']]); g.fill();
    // le porte-bobines (deux cônes) tout à gauche, le fil qui monte
    ombrePose(g, x0 + 7, -76, 12, 0.3);
    g.fillStyle = '#8E9296'; g.fillRect(x0 + 6.4, -138, 1.2, 62);
    g.fillRect(x0 + 1, -138, 12, 1);
    [[x0 + 4, '#F2EEE6'], [x0 + 10, '#B07A45']].forEach(([cx, c]) => {
      g.fillStyle = c; g.beginPath(); g.moveTo(cx - 2.6, -76); g.lineTo(cx + 2.6, -76); g.lineTo(cx + 1.5, -88); g.lineTo(cx - 1.5, -88); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(cx, -88, 1.5, 12);
    });
    g.strokeStyle = 'rgba(240,236,226,0.7)'; g.lineWidth = 0.15;
    g.beginPath(); g.moveTo(x0 + 4, -88); g.lineTo(x0 + 3, -138); g.quadraticCurveTo(x0 + 12, -128, 386, -112); g.stroke();
    // la machine : le socle, la colonne, le montant, le bras, la tête
    const noir = '#16171A', noirClair = '#3A3C42';
    ombrePose(g, 405, -79, 50, 0.4);
    plaque(g, 378, -84, 50, 5, noir, { r: 1, reflet: 0.2, ombre: 0.3 });
    tube(g, 385, -94, 8, 10, noir, noirClair, '#050506'); // la colonne : l'aiguille pique au-dessus
    g.fillStyle = lin(g, 384, 0, 394, 0, [[0, '#8E9296'], [0.4, '#F2F4F5'], [1, '#6E7378']]);
    g.fillRect(384.5, -95.4, 9, 1.4); // la plaque à aiguille
    tube(g, 412, -113, 13, 29, noir, noirClair, '#050506'); // le montant de droite
    g.fillStyle = noir;
    g.beginPath(); rr(g, 378, -115, 48, 8, 3.5); g.fill();
    g.fillStyle = lin(g, 0, -115, 0, -107, [[0, 'rgba(255,255,255,0.22)'], [0.4, 'rgba(255,255,255,0.02)'], [1, 'rgba(0,0,0,0.3)']]);
    g.beginPath(); rr(g, 378, -115, 48, 8, 3.5); g.fill();
    g.fillStyle = noir; g.beginPath(); rr(g, 378, -117, 15, 21, 2.2); g.fill(); // la tête
    g.fillStyle = lin(g, 379, 0, 384, 0, [[0, '#6E7378'], [0.5, '#EDEFF0'], [1, '#8E9296']]);
    g.beginPath(); rr(g, 378.6, -113.5, 5, 16, 1); g.fill();
    g.fillStyle = '#C9CDD0'; g.beginPath(); g.arc(388.5, -110.5, 1.6, 0, TAU); g.fill();
    g.fillStyle = '#6E7378'; g.beginPath(); g.arc(388.5, -110.5, 0.7, 0, TAU); g.fill();
    // les décors dorés (volutes, filets) — sans marque
    g.strokeStyle = '#D8B25C'; g.lineWidth = 0.32;
    g.beginPath();
    g.moveTo(396, -112); g.bezierCurveTo(399, -114.5, 402, -109.5, 405, -112); g.bezierCurveTo(407.5, -114, 410, -110.5, 412, -112);
    g.moveTo(414, -104); g.bezierCurveTo(416.5, -100.5, 413.5, -97, 416.5, -93.5); g.bezierCurveTo(418.5, -91, 415.5, -88, 418, -86);
    g.moveTo(396, -109); g.lineTo(411, -109);
    g.stroke();
    g.fillStyle = '#D8B25C';
    g.beginPath(); g.ellipse(403.5, -112, 1.9, 1.05, 0, 0, TAU); g.fill();
    g.fillStyle = noir; g.beginPath(); g.ellipse(403.5, -112, 1.1, 0.5, 0, 0, TAU); g.fill();
    // la petite lampe à col de cygne
    g.strokeStyle = '#2A2A2C'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(380, -117); g.quadraticCurveTo(375, -127, 382, -129); g.stroke();
    g.fillStyle = '#2A2A2C'; g.beginPath(); g.ellipse(384, -129, 2.8, 1.4, 0.3, 0, TAU); g.fill();
    g.fillStyle = '#FFF4D8'; g.beginPath(); g.ellipse(384.4, -128.2, 2.1, 0.6, 0.3, 0, TAU); g.fill();
    g.globalCompositeOperation = 'screen';
    tache(g, 388, -95, 11, 4.5, '#FFF0CC', 0.5);
    g.globalCompositeOperation = 'source-over';
    // des chutes de cuir, une bobine sur la table
    g.fillStyle = '#7A4A2A'; g.beginPath(); g.moveTo(432, -76); g.lineTo(444, -77); g.lineTo(440, -74.5); g.lineTo(430, -74); g.closePath(); g.fill();
    g.fillStyle = '#2A1E16'; g.beginPath(); g.ellipse(446, -75, 3.6, 1.1, 0.2, 0, TAU); g.fill();
  }

  /** le coin nettoyage des baskets : petit meuble, bassine, mousse, brosses, serviette, séchoir */
  const NETTOYAGE = { x0: 466, x1: 522, y: -90, fond: -100 };
  function peindreNettoyage(g) {
    const { x0, x1, y, fond } = NETTOYAGE;
    g.fillStyle = motif(g, texChene(), 0.13, x0, y);
    g.fillRect(x0, y, x1 - x0, -y);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, y, x1 - x0, -y);
    g.fillStyle = lin(g, 0, y, 0, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]); g.fillRect(x0, y, x1 - x0, -y);
    g.fillStyle = 'rgba(255,230,190,0.25)'; g.fillRect(x0, y, x1 - x0, 0.7);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 0.4; g.strokeRect(x0 + 3, y + 5, x1 - x0 - 6, 14); g.strokeRect(x0 + 3, y + 23, x1 - x0 - 6, -y - 27);
    g.fillStyle = '#C9A45C'; g.fillRect((x0 + x1) / 2 - 3, y + 11, 6, 1.2); g.fillRect((x0 + x1) / 2 - 3, y + 30, 6, 1.2);
    g.fillStyle = '#1C120C'; g.fillRect(x0, -3, x1 - x0, 3);
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.lineTo(x1 - 3, fond); g.lineTo(x0 + 3, fond); g.closePath();
    g.fillStyle = motif(g, texChene(), 0.1, x0, fond); g.fill();
    g.fillStyle = lin(g, 0, fond, 0, y, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(255,235,200,0.12)']]); g.fill();
    // la bassine émaillée, l'eau savonneuse
    ombrePose(g, 478, -93, 18, 0.35);
    g.fillStyle = '#E8E6E0'; g.beginPath(); g.moveTo(470, -99); g.lineTo(486, -99); g.lineTo(484, -93); g.lineTo(472, -93); g.closePath(); g.fill();
    g.fillStyle = '#2F4A6E'; g.fillRect(470, -99.6, 16, 0.8);
    g.fillStyle = '#B9C8CC'; g.beginPath(); g.ellipse(478, -98.6, 7.4, 1.1, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; [[474, -99.2, 1.1], [477, -99.5, 0.8], [480.5, -99.1, 1.2], [482.5, -99.4, 0.7]].forEach(([bx, by, br]) => { g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill(); });
    // le flacon de nettoyant (blanc, bouchon rouge) et un pain de savon
    ombrePose(g, 514, -94, 8, 0.3);
    g.fillStyle = '#F1EEE8'; g.beginPath(); rr(g, 511, -108, 6.4, 14, 1.4); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(515.4, -107, 1.4, 12);
    g.fillStyle = '#C8322A'; g.fillRect(512.4, -111, 3.6, 3.2); g.fillRect(515.6, -110.4, 2.6, 1);
    g.fillStyle = '#2F6FB8'; g.fillRect(511.6, -103, 5.2, 3.4);
    g.fillStyle = '#E8D9B0'; g.beginPath(); rr(g, 500, -95.5, 6, 2.6, 0.8); g.fill();
  }

  /** le comptoir des clés : façade de planches, plateau épais, la machine à clés (bâti fixe) */
  const CLES = { x0: 536, x1: 616, y: -100, fond: -112, machineX: 578 };
  function peindreComptoirCles(g) {
    const { x0, x1, y, fond } = CLES;
    // la façade de planches verticales
    g.fillStyle = motif(g, texChene(), 0.15, x0, y, Math.PI / 2);
    g.fillRect(x0, y + 4, x1 - x0, -y - 4);
    for (let x = x0 + 8; x < x1; x += 9) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + 4, 0.6, -y - 4); g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(x + 0.6, y + 4, 0.5, -y - 4); }
    g.fillStyle = lin(g, 0, y + 4, 0, 0, [[0, 'rgba(0,0,0,0.4)'], [0.3, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.4)']]); g.fillRect(x0, y + 4, x1 - x0, -y - 4);
    g.fillStyle = '#1C120C'; g.fillRect(x0, -4, x1 - x0, 4);
    // le plateau épais, son chant arrondi
    g.fillStyle = motif(g, texChene(), 0.12, x0, y);
    g.fillRect(x0 - 2, y, x1 - x0 + 4, 4.4);
    g.fillStyle = 'rgba(255,235,200,0.35)'; g.fillRect(x0 - 2, y, x1 - x0 + 4, 0.8);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x0 - 2, y + 3.8, x1 - x0 + 4, 0.6);
    g.beginPath(); g.moveTo(x0 - 2, y); g.lineTo(x1 + 2, y); g.lineTo(x1 - 1, fond); g.lineTo(x0 + 1, fond); g.closePath();
    g.fillStyle = motif(g, texChene(), 0.1, x0, fond); g.fill();
    g.fillStyle = lin(g, 0, fond, 0, y, [[0, 'rgba(0,0,0,0.28)'], [1, 'rgba(255,235,200,0.12)']]); g.fill();
    // le présentoir de porte-clés, à droite
    g.fillStyle = '#2A2A2C'; g.fillRect(607, -132, 1.2, 28); g.fillRect(601, -132, 13, 1);
    [[602, '#C8322A'], [606, '#F2C443'], [610, '#2F6FB8'], [613, '#E07A2E']].forEach(([kx, c]) => { g.strokeStyle = '#9EA3A8'; g.lineWidth = 0.3; g.beginPath(); g.arc(kx, -129, 1, 0, TAU); g.stroke(); g.fillStyle = c; g.fillRect(kx - 1, -128, 2, 3.4); });
    // la machine à clés : le socle gris, le carter rouge du moteur
    const mx = CLES.machineX;
    ombrePose(g, mx, -104, 44, 0.45);
    plaque(g, mx - 22, -110, 44, 8, '#8E9296', { r: 1.2, reflet: 0.3, ombre: 0.3 });
    plaque(g, mx - 16, -128, 32, 18, '#C8262C', { r: 3, reflet: 0.3, ombre: 0.3 });
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let k = 0; k < 5; k++) g.fillRect(mx - 10 + k * 4.4, -124, 2, 8);
    // le rail du chariot
    g.fillStyle = lin(g, 0, -111, 0, -109, [[0, '#E6E9EB'], [1, '#6E7378']]);
    g.fillRect(mx - 20, -111.4, 40, 1.6);
    // l'interrupteur, la petite lampe
    g.fillStyle = '#1E1E20'; g.fillRect(mx + 14, -126, 4, 3); g.fillStyle = '#39A866'; g.fillRect(mx + 14.6, -125.6, 1.4, 2);
    g.strokeStyle = '#2A2A2C'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(mx + 10, -128); g.quadraticCurveTo(mx + 14, -140, mx + 4, -141); g.stroke();
    g.fillStyle = '#2A2A2C'; g.beginPath(); g.ellipse(mx + 2, -141, 2.6, 1.3, -0.3, 0, TAU); g.fill();
    // un plateau à clés, la boîte des ébauches
    g.fillStyle = '#3A2A1E'; g.fillRect(546, -106, 12, 3);
    g.fillStyle = '#D6B25C'; g.fillRect(548, -106.5, 3, 0.6); g.fillRect(552, -106.8, 3, 0.6);
  }

  /** une suspension (abat-jour émaillé) : forme, couleur ; l'ampoule */
  function peindreLampe(g, x, y, couleur = '#232323', large = 18, nuit = false) {
    g.strokeStyle = '#141414'; g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(x, y - 110); g.lineTo(x, y - 10); g.stroke();
    g.fillStyle = '#1A1A1A'; g.fillRect(x - 1.5, y - 12, 3, 4);
    g.fillStyle = couleur;
    g.beginPath(); g.moveTo(x - large / 2, y + 2); g.quadraticCurveTo(x - large / 2, y - 9, x, y - 9.5); g.quadraticCurveTo(x + large / 2, y - 9, x + large / 2, y + 2); g.closePath(); g.fill();
    g.fillStyle = lin(g, x - large / 2, 0, x + large / 2, 0, [[0, 'rgba(255,255,255,0.05)'], [0.3, 'rgba(255,255,255,0.3)'], [0.5, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.3)']]);
    g.fill();
    g.fillStyle = '#FFF6DA';
    g.beginPath(); g.ellipse(x, y + 2, large / 2 - 0.6, 1.6, 0, 0, TAU); g.fill();
    g.fillStyle = rad(g, x, y + 2, 5, [[0, '#FFFFFF'], [1, 'rgba(255,240,200,0)']]);
    g.beginPath(); g.arc(x, y + 2, 5, 0, TAU); g.fill();
  }

  /* ======================================================================
     Le comptoir du premier plan : ses objets (peints une fois, au plan D_OBJETS)
     ====================================================================== */
  /** les semelles crantées alignées (photo de la boutique) : debout sur le talon, la semelle vue de biais */
  function peindreSemelles(g, x, y) {
    for (let k = 0; k < 3; k++) {
      const sx = x + k * 10.5, h = 21 - k * 1.2;
      ombrePose(g, sx + 5, y, 14, 0.4);
      g.save();
      g.translate(sx + 5, y);
      g.rotate(-0.08 + k * 0.05);
      // le contour d'une semelle : talon rond en bas, cambrure, avant large en haut
      const forme = () => { g.beginPath(); g.moveTo(-2.6, 0); g.quadraticCurveTo(-3.7, -2.4, -2.8, -6.2); g.quadraticCurveTo(-2.1, -9.4, -2.9, -13); g.quadraticCurveTo(-4.4, -h + 2.4, -0.8, -h); g.quadraticCurveTo(3.9, -h + 1.1, 3.9, -13); g.quadraticCurveTo(3.1, -9.4, 3.2, -6.2); g.quadraticCurveTo(3.9, -2.4, 2.6, 0); g.closePath(); };
      g.fillStyle = '#3A3A3C'; forme(); g.fill();
      g.save(); g.translate(-0.6, -0.4); g.fillStyle = lin(g, -5, 0, 5, 0, [[0, '#8A8A88'], [0.45, '#6E6E6C'], [1, '#4E4E4C']]); forme(); g.fill(); g.restore();
      // les crampons
      g.fillStyle = '#48484A';
      for (let j = 0; j < 6; j++) { const yy = -2 - j * 3, l = j > 2 ? 2.8 : 2.1; g.beginPath(); rr(g, -l, yy - 0.9, l * 0.9, 1.3, 0.4); g.fill(); g.beginPath(); rr(g, 0.3, yy - 0.9, l * 0.9, 1.3, 0.4); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-3.4, -h + 3, 0.8, h - 5);
      g.restore();
    }
  }
  /** le sac en papier vert foncé à cordelette (sans marque) */
  function peindreSacPapier(g, x, y) {
    ombrePose(g, x + 13, y, 30, 0.4);
    g.fillStyle = '#20382E';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 26, y); g.lineTo(x + 25, y - 34); g.lineTo(x + 1, y - 34); g.closePath(); g.fill();
    g.fillStyle = lin(g, x, 0, x + 26, 0, [[0, 'rgba(255,255,255,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1, y - 34, 24, 3);
    g.strokeStyle = '#EDE6D4'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(x + 7, y - 33); g.quadraticCurveTo(x + 13, y - 46, x + 19, y - 33); g.stroke();
    g.strokeStyle = 'rgba(237,230,212,0.6)'; g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(x + 6, y - 18); g.quadraticCurveTo(x + 13, y - 20, x + 20, y - 18); g.stroke();
  }
  /** la petite radio (crème et rouge, cadran lumineux) */
  const RADIO = { x: 264, y: 0, w: 23.4, h: 15, cadran: [17 * 0.78, -12 * 0.78, 11 * 0.78, 5.4 * 0.78] };
  function peindreRadio(g, x0, y0) {
    g.save();
    g.translate(x0, y0); g.scale(0.78, 0.78); g.translate(-x0, -y0);
    const x = x0, y = y0;
    ombrePose(g, x + 15, y, 34, 0.45);
    g.fillStyle = '#B9A27E';
    g.beginPath(); rr(g, x, y - 19, 30, 19, 3.2); g.fill();
    g.fillStyle = lin(g, 0, y - 19, 0, y, [[0, '#F1E6CE'], [0.5, '#E2D2B2'], [1, '#B9A27E']]);
    g.beginPath(); rr(g, x + 0.6, y - 18.4, 28.8, 17.8, 2.8); g.fill();
    g.fillStyle = '#B8322E';
    g.beginPath(); rr(g, x + 0.6, y - 18.4, 28.8, 4, 2.4); g.fill();
    // la grille du haut-parleur
    g.fillStyle = '#6E5A44';
    g.beginPath(); g.arc(x + 9.5, y - 7.4, 5.6, 0, TAU); g.fill();
    g.fillStyle = '#3A2E22';
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { if (i * i + j * j > 18) continue; g.beginPath(); g.arc(x + 9.5 + i * 1.2, y - 7.4 + j * 1.2, 0.35, 0, TAU); g.fill(); }
    // le cadran (s'allume quand le son est là : dessiné à part), les boutons
    g.fillStyle = '#2A2420'; g.beginPath(); rr(g, x + 17, y - 12, 11, 5.4, 1); g.fill();
    g.fillStyle = '#8E7A5A'; [[x + 19.5, y - 3.6], [x + 25.5, y - 3.6]].forEach(([bx, by]) => { g.beginPath(); g.arc(bx, by, 1.6, 0, TAU); g.fill(); });
    // la poignée
    g.strokeStyle = '#6B4A33'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x + 5, y - 19); g.quadraticCurveTo(x + 15, y - 27, x + 25, y - 19); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(x + 2, y - 15.5); g.lineTo(x + 28, y - 15.5); g.stroke();
    g.restore();
  }
  /** le carnet de commandes ouvert, les tickets jaunes glissés dedans, le stylo */
  const CARNET = { x: 548, y: 0, w: 40 };
  function peindreCarnet(g, x, y, fam, r) {
    ombrePose(g, x + 20, y, 44, 0.4);
    // vu en plongée : deux pages (trapèzes aplatis), la reliure
    const H = 9;
    g.fillStyle = '#2A2420';
    g.beginPath(); g.moveTo(x - 1, y + 0.4); g.lineTo(x + 41, y + 0.4); g.lineTo(x + 38, y - H - 0.6); g.lineTo(x + 2, y - H - 0.6); g.closePath(); g.fill();
    ['#F7F1E3', '#F2EBDB'].forEach((c, i) => {
      g.fillStyle = c;
      const a = x + i * 20, b = a + 19.6;
      g.beginPath(); g.moveTo(a + 0.2, y - 0.2); g.lineTo(b, y - 0.2); g.lineTo(b - (i ? 1.6 : -0.2), y - H); g.lineTo(a + (i ? 0 : 1.8), y - H); g.closePath(); g.fill();
    });
    g.strokeStyle = 'rgba(80,120,170,0.35)'; g.lineWidth = 0.12;
    for (let k = 1; k < 7; k++) { const yy = y - k * (H / 7); g.beginPath(); g.moveTo(x + 2, yy); g.lineTo(x + 38, yy); g.stroke(); }
    // l'écriture de Clément
    g.strokeStyle = 'rgba(40,40,70,0.7)'; g.lineWidth = 0.22;
    for (let k = 1; k < 6; k++) {
      const yy = y - k * (H / 7) - 0.4;
      [[x + 3, x + 17], [x + 22, x + 36]].forEach(([a, b]) => {
        if (r() < 0.2) return;
        g.beginPath();
        let px = a;
        g.moveTo(px, yy);
        while (px < b - r() * 6) { px += 0.8 + r() * 0.9; g.lineTo(px, yy - r() * 0.7); }
        g.stroke();
      });
    }
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x + 19.6, y - H, 0.8, H);
    // les tickets jaunes qui dépassent
    [[x + 6, -0.25], [x + 12, 0.12], [x + 30, 0.3]].forEach(([tx, a]) => { g.save(); g.translate(tx, y - H + 0.5); g.rotate(a); g.fillStyle = C.ticket; g.fillRect(-2, -6.5, 4, 7); g.fillStyle = C.pastille; g.beginPath(); g.arc(0.9, -5.4, 0.6, 0, TAU); g.fill(); g.restore(); });
    // le stylo
    g.save(); g.translate(x + 26, y - 3); g.rotate(-0.18);
    g.fillStyle = '#1E1E22'; g.fillRect(0, -0.6, 14, 1.2); g.fillStyle = '#C9CDD0'; g.fillRect(14, -0.45, 1.6, 0.9); g.fillStyle = '#C8322A'; g.fillRect(-0.8, -0.65, 1.6, 1.3);
    g.restore();
  }
  /** la tablette sur son pied, le terminal de paiement */
  function peindreTablette(g, x, y) {
    ombrePose(g, x + 11, y, 26, 0.35);
    g.fillStyle = '#1C1C1E';
    g.save(); g.translate(x, y); g.transform(1, 0, -0.25, 1, 0, 0);
    g.beginPath(); rr(g, 2, -18, 22, 16, 1.5); g.fill();
    const tuiles = ['#7A3A30', '#8A7A4E', '#3E5A4C', '#9A9488', '#5E4630', '#3E4E66'];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { g.fillStyle = tuiles[(i + j * 2) % tuiles.length]; g.fillRect(3.4 + i * 6.6, -16.6 + j * 4.6, 6, 4); }
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(3, -17); g.lineTo(14, -17); g.lineTo(6, -3); g.lineTo(3, -3); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#2A2A2C'; g.fillRect(x + 8, y - 3, 8, 3);
    // le terminal de paiement
    const tx = x + 30;
    ombrePose(g, tx + 5, y, 14, 0.35);
    g.fillStyle = '#26272B'; g.beginPath(); rr(g, tx, y - 12, 10, 12, 1.6); g.fill();
    g.fillStyle = '#6FB0D8'; g.fillRect(tx + 1.5, y - 10.8, 7, 3.4);
    g.fillStyle = '#4A4B50'; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.fillRect(tx + 1.8 + i * 2.4, y - 6.4 + j * 1.8, 1.8, 1.2);
  }
  /** la sonnette de comptoir en laiton */
  function peindreSonnette(g, x, y) {
    ombrePose(g, x, y, 12, 0.4);
    g.fillStyle = '#2A2A2C'; g.beginPath(); g.ellipse(x, y - 0.8, 5.4, 1.6, 0, 0, TAU); g.fill();
    g.fillStyle = lin(g, x - 5, 0, x + 5, 0, [[0, '#8E6A2A'], [0.35, '#FBE7A8'], [0.6, '#D8B25C'], [1, '#7A5A22']]);
    g.beginPath(); g.moveTo(x - 4.8, y - 1.2); g.quadraticCurveTo(x - 4.8, y - 7.5, x, y - 7.6); g.quadraticCurveTo(x + 4.8, y - 7.5, x + 4.8, y - 1.2); g.closePath(); g.fill();
    g.fillStyle = '#5E6368'; g.fillRect(x - 0.5, y - 9.4, 1, 2); g.fillStyle = '#9EA3A8'; g.beginPath(); g.ellipse(x, y - 9.6, 1.2, 0.5, 0, 0, TAU); g.fill();
  }
  /** des boîtes de cirage empilées (à vendre) */
  function peindreCirages(g, x, y) {
    const cols = ['#C8322A', '#2F6FB8', '#E9B04A', '#2E684B', '#1E1E22', '#8C5A2E'];
    ombrePose(g, x + 14, y, 32, 0.35);
    for (let k = 0; k < 6; k++) {
      const bx = x + (k % 3) * 9.4, by = y - Math.floor(k / 3) * 3.6;
      g.fillStyle = cols[k]; g.beginPath(); g.ellipse(bx + 4.4, by - 1.6, 4.4, 1.4, 0, 0, TAU); g.fill();
      g.fillRect(bx, by - 3.2, 8.8, 1.6);
      g.fillStyle = lin(g, bx, 0, bx + 8.8, 0, [[0, '#B9BEC2'], [0.4, '#F2F4F5'], [1, '#6E7378']]);
      g.beginPath(); g.ellipse(bx + 4.4, by - 3.2, 4.4, 1.4, 0, 0, TAU); g.fill();
    }
  }
  /** une plante grasse dans un pot de terre */
  function peindrePlante(g, x, y) {
    ombrePose(g, x, y, 16, 0.4);
    g.fillStyle = '#B8683E'; g.beginPath(); g.moveTo(x - 6, y - 11); g.lineTo(x + 6, y - 11); g.lineTo(x + 4.6, y); g.lineTo(x - 4.6, y); g.closePath(); g.fill();
    g.fillStyle = '#9A5230'; g.fillRect(x - 6.4, y - 12, 12.8, 2.4);
    const feuilles = [[-4, -20, -0.5], [0, -24, 0], [4, -19, 0.5], [-2, -17, -0.2], [2.5, -16, 0.3]];
    feuilles.forEach(([fx, fy, a]) => { g.save(); g.translate(x + fx * 0.5, y - 11); g.rotate(a); g.fillStyle = '#5E8A5A'; g.beginPath(); g.ellipse(0, fy / 2 + 11 / 2 - 5, 2.2, -fy / 2 - 3, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-0.3, fy + 9, 0.6, -fy - 12); g.restore(); });
  }
  /** une boîte à chaussures ouverte, une paire dedans, son ticket */
  function peindreBoite(g, x, y) {
    ombrePose(g, x + 18, y, 40, 0.45);
    g.fillStyle = '#E06A2C'; g.fillRect(x, y - 12, 36, 12);
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, y - 12, 36, 1.2);
    g.fillStyle = '#F1ECE2'; g.fillRect(x + 1, y - 13.5, 34, 2);
    basket(g, x + 3, y - 10, 15, PAIRES[2]);
    basket(g, x + 17, y - 11, 15, PAIRES[2]);
    g.fillStyle = '#E06A2C'; g.fillRect(x, y - 7, 36, 7);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y - 7, 36, 1);
    ticket(g, x + 30, y - 9, 3.4, 6, 0.15);
  }
  /** le pot à stylos et les cartes de visite */
  function peindrePot(g, x, y, fam) {
    ombrePose(g, x + 4, y, 12, 0.35);
    g.fillStyle = '#4A5A6E'; g.fillRect(x, y - 9, 8, 9);
    [[1.5, '#1E1E22', 13], [3.2, '#C8322A', 12], [5, '#2F6FB8', 14], [6.4, '#E07A2E', 11.5]].forEach(([dx, c, l]) => { g.fillStyle = c; g.fillRect(x + dx - 0.5, y - l, 1, l - 8); });
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 0.6, y - 9, 1, 9);
    // les cartes de visite (crème, logo sauge)
    g.fillStyle = '#FFF2E2'; g.fillRect(x + 11, y - 3, 9, 3);
    g.fillStyle = '#8A927B'; g.fillRect(x + 12.5, y - 2.2, 6, 0.6);
  }

  /* ---------- le tout premier plan (sur le comptoir, tout près de nous) : des objets plats ---------- */
  /** le sous-main de cuir, surpiqué ; y = le plateau ; vu en plongée (écrasé) */
  function peindreSousMain(g, x, y, w) {
    const h = 5.5;
    ombrePose(g, x + w / 2, y + 0.4, w * 1.02, 0.4);
    g.fillStyle = '#3A2418';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - 3, y - h); g.lineTo(x + 3, y - h); g.closePath(); g.fill();
    g.fillStyle = lin(g, 0, y - h, 0, y, [[0, 'rgba(255,220,180,0.08)'], [1, 'rgba(0,0,0,0.25)']]); g.fill();
    g.strokeStyle = 'rgba(233,217,182,0.55)'; g.lineWidth = 0.2; g.setLineDash([0.8, 0.6]);
    g.beginPath(); g.moveTo(x + 2, y - 0.6); g.lineTo(x + w - 2, y - 0.6); g.lineTo(x + w - 4.4, y - h + 0.6); g.lineTo(x + 4.4, y - h + 0.6); g.closePath(); g.stroke();
    g.setLineDash([]);
    // un ticket et un crayon posés dessus
    g.save(); g.translate(x + w * 0.66, y - h * 0.5); g.scale(1, 0.38); g.rotate(-0.25);
    g.fillStyle = C.ticket; g.fillRect(-3.4, -6, 6.8, 12); g.fillStyle = C.pastille; g.beginPath(); g.arc(1.6, 3.4, 1, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(40,40,70,0.6)'; g.lineWidth = 0.35; g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(-2.4, -3.5 + k * 1.8); g.lineTo(1.8, -3.8 + k * 1.8); } g.stroke();
    g.restore();
    g.save(); g.translate(x + w * 0.3, y - h * 0.45); g.rotate(0.06);
    g.fillStyle = '#E8B82E'; g.fillRect(0, -0.5, 13, 1); g.fillStyle = '#2A2A2C'; g.fillRect(13, -0.35, 1.2, 0.7); g.fillStyle = '#E8A0A0'; g.fillRect(-1.3, -0.5, 1.3, 1);
    g.restore();
  }
  /** le plateau de bois aux clés (celles qu'on vient de tailler, un porte-clés) */
  function peindrePlateauCles(g, x, y) {
    ombrePose(g, x + 9, y + 0.3, 20, 0.4);
    g.fillStyle = '#6B4A33';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y); g.lineTo(x + 16.5, y - 4); g.lineTo(x + 1.5, y - 4); g.closePath(); g.fill();
    g.fillStyle = '#4A3122'; g.beginPath(); g.moveTo(x + 1.2, y - 0.8); g.lineTo(x + 16.8, y - 0.8); g.lineTo(x + 15.6, y - 3.4); g.lineTo(x + 2.4, y - 3.4); g.closePath(); g.fill();
    [[x + 5, -2.1, '#D6B25C', 0.3], [x + 9.5, -2.4, '#C6CACD', -0.2], [x + 12.5, -1.9, '#D6B25C', 0.5]].forEach(([kx, dy, c, a]) => {
      g.save(); g.translate(kx, y + dy); g.rotate(a); g.scale(1, 0.5);
      g.fillStyle = c; g.beginPath(); g.arc(0, 0, 1.3, 0, TAU); g.fill(); g.fillRect(1, -0.45, 3.8, 0.9);
      g.restore();
    });
    g.strokeStyle = '#C8322A'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(x + 7, y - 1.6, 1.6, 0.6, 0, 0, TAU); g.stroke();
  }
  /** une liasse de tickets jaunes et un tampon */
  function peindreLiasse(g, x, y) {
    ombrePose(g, x + 6, y + 0.3, 14, 0.35);
    for (let k = 0; k < 4; k++) {
      g.save(); g.translate(x + 5 + k * 0.4, y - 1.2 - k * 0.35); g.scale(1, 0.36); g.rotate(-0.1 + k * 0.08);
      g.fillStyle = k === 3 ? C.ticket : '#DDB92A'; g.fillRect(-4, -7, 8, 14);
      if (k === 3) { g.fillStyle = C.pastille; g.beginPath(); g.arc(2, 4, 1.1, 0, TAU); g.fill(); }
      g.restore();
    }
    g.fillStyle = '#2A2A2C'; g.fillRect(x + 12, y - 5, 3.2, 3.6); g.fillStyle = '#8A6A4A'; g.beginPath(); g.ellipse(x + 13.6, y - 5.4, 2.4, 1, 0, 0, TAU); g.fill();
    g.fillStyle = '#C8322A'; g.fillRect(x + 11.8, y - 1.6, 3.6, 0.9);
  }
  /** des bouts de talons et quelques clous de laiton éparpillés */
  function peindreBouts(g, x, y) {
    [[x + 2, 0.2], [x + 8, -0.3]].forEach(([bx, a]) => {
      g.save(); g.translate(bx, y - 1); g.rotate(a); g.scale(1, 0.42);
      g.fillStyle = '#2A2A2C'; g.beginPath(); g.moveTo(-2.4, 2); g.quadraticCurveTo(-2.8, -2.6, 0, -2.8); g.quadraticCurveTo(2.8, -2.6, 2.4, 2); g.closePath(); g.fill();
      g.fillStyle = '#C9CDD0'; g.fillRect(-1.4, 1, 2.8, 0.8);
      g.restore();
    });
    g.fillStyle = '#D6B25C';
    [[x + 13, -0.8], [x + 15, -1.6], [x + 12, -2.2], [x + 17, -0.9], [x + 14.5, -2.8]].forEach(([nx, ny]) => { g.fillRect(nx, y + ny, 0.9, 0.35); });
  }
  /** une chute de cuir fauve, roulée */
  function peindreChute(g, x, y) {
    ombrePose(g, x + 7, y + 0.3, 16, 0.35);
    g.fillStyle = '#A8703E'; g.beginPath(); g.moveTo(x, y - 0.6); g.quadraticCurveTo(x + 7, y - 3.6, x + 14, y - 1.2); g.lineTo(x + 13.6, y); g.lineTo(x + 0.6, y); g.closePath(); g.fill();
    g.fillStyle = '#7A4A2A'; g.beginPath(); g.ellipse(x + 14, y - 1.4, 1.3, 1.4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,230,190,0.2)'; g.fillRect(x + 2, y - 2.2, 9, 0.5);
  }
  /** une boîte de cire ouverte, le chiffon */
  function peindreCire(g, x, y) {
    ombrePose(g, x + 5, y + 0.3, 12, 0.4);
    g.fillStyle = lin(g, x, 0, x + 9, 0, [[0, '#9EA3A8'], [0.4, '#EEF0F1'], [1, '#6E7378']]);
    g.beginPath(); g.ellipse(x + 4.5, y - 1.5, 4.5, 1.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#3A2012'; g.beginPath(); g.ellipse(x + 4.5, y - 1.8, 3.8, 1.1, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,220,170,0.25)'; g.beginPath(); g.ellipse(x + 3.6, y - 2.1, 1.6, 0.4, 0, 0, TAU); g.fill();
    g.fillStyle = '#C9B89A'; g.beginPath(); g.moveTo(x + 9, y - 0.4); g.quadraticCurveTo(x + 13, y - 3.4, x + 17, y - 0.8); g.quadraticCurveTo(x + 13, y, x + 9, y - 0.4); g.fill();
  }

  const DECOR = {
    peindreSousMain, peindrePlateauCles, peindreLiasse, peindreBouts, peindreChute, peindreCire,
    tube, plaque, ombrePose, texte, peindreClim, peindreSmall, peindreArmoire, planche, peindrePolaroids, peindreRatelier, peindrePendule,
    peindreCles, peindreEtageres, peindreSac, peindrePorte, peindreFinisseuse, peindrePresse, peindreEtabli, peindreCouture, peindreNettoyage,
    peindreComptoirCles, peindreLampe, peindreSemelles, peindreSacPapier, peindreRadio, peindreCarnet, peindreTablette, peindreSonnette,
    peindreCirages, peindrePlante, peindreBoite, peindrePot,
    ROUES, ARBRE_Y, ETABLI, COUTURE, NETTOYAGE, CLES, RADIO, CARNET,
  };
  CO.BoutiqueDecor = { prechauffer, peindreMur, peindreMurPas, basket, derby, ticket, C, PAIRES, STATIONS, ...DECOR, D: { D_LANE, D_MUR, D_COMPTOIR, D_OBJETS, D_PLAFOND, OEIL, VUE, HAUT_COMPTOIR, MONDE }, outils: { toile, rgba, lin, rad, rr, lisse, tache, motif, texGrain, texChene, texAgglo, police } };
})();
