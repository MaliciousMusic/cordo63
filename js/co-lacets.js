/* ==========================================================================
   Cordo 63 — les lacets : les accès rapides sous le logo (CO.Lacets)
   Une pile de lacets plats de couleur, posés en travers de l'écran comme des bandeaux ondulés,
   chacun avec son mot tissé dans la trame, ses ferrets aux deux bouts. Un lacet plat en vrai :
   des rangs de fil à chevrons (la trame), des bords arrondis (un liseré de lumière en haut, une
   ombre en bas), un peu d'épaisseur, une ombre douce sur le papier, et çà et là une torsion qui
   montre l'envers.
   On le touche : il se tend (la vague s'aplatit, les torsions se défont), puis on le tire par le
   ferret le plus proche du doigt : il file le long de son propre tracé et sort de l'écran, ferret
   devant (zip), et seulement alors le lien s'ouvre. Quand on revient sur l'accueil (ou sur la
   page, après un lien externe), il se renfile et se détend.
     const l = CO.Lacets.create(hote, [
       { label: 'Déposer une paire', couleur: '#F2D24B', action: () => CO.go('deposer') },
       { label: 'Itinéraire', couleur: '#E03A2E', href: 'https://…', externe: true }, …
     ], { debord: 18 })  → { remettre(), detruire(), el }
   Sans items, les liens de repli de l'hôte (a.lacet-repli) servent de liste. Chaque lacet est un
   vrai <a> ou <button> (son nom en texte), Entrée ou Espace le tirent aussi ; CO.reduced : pas de
   tirage, l'action tout de suite. Rien ne tourne au repos : tout est redessiné image par image
   seulement pendant un geste.
   Le dessin : la ligne médiane est une courbe de sinus (un peu différente pour chaque lacet), qui
   se prolonge hors de l'écran des deux côtés ; le lacet en occupe un morceau de longueur fixe
   (sa matière : [s0, s0 + L] en abscisse curviligne). Tirer, c'est faire glisser s0 le long du
   tracé (la trame est ancrée à la matière et glisse avec), le mot suit par le startOffset de son
   textPath, les ferrets se posent au bout, dans l'axe de la tangente.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lisse = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const E = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    glisse: (t) => Math.pow(t, 2.1),
    rentre: (t) => 1 - Math.pow(1 - t, 3.2),
  };
  const f2 = (n) => (Math.round(n * 100) / 100).toString();
  const f1 = (n) => (Math.round(n * 10) / 10).toString(); // les tracés redessinés à chaque image : 0,1 px (un tiers de pixel à 3x)
  const reduit = () => !!CO.reduced;
  const lent = () => CO.ralenti || 1;
  const son = (nom, o) => { try { if (CO.sfx) CO.sfx.play(nom, o); } catch (e) { /* muet */ } };
  const vibre = (ms) => { if (CO.vibrate) CO.vibrate(ms); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let instances = 0;

  // la durée des gestes (ms) ; l'action part à la fin du tirage
  const TENSION = 190, GLISSE = 470, RETOUR = 540, DETENTE = 560;

  /* la main qui montre les lacets (celle de Clément : sa montre au bracelet orange), dessinée l'index vers
     le haut, le bout du doigt en (15, 3) ; elle est tournée vers le lacet par la feuille de style */
  const MAIN_SVG = `<svg viewBox="0 0 44 58" focusable="false">
  <defs><linearGradient id="lc-peau" x1="0" x2="1" y1="0" y2=".25"><stop offset="0" stop-color="#F0C4A0"/><stop offset=".55" stop-color="#E2A983"/><stop offset="1" stop-color="#C98B64"/></linearGradient></defs>
  <g stroke="#2B2420" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14.2 45.5 13.6 58h19.2l-.5-12.5z" fill="url(#lc-peau)"/>
    <rect x="12.2" y="47.6" width="22.2" height="7.2" rx="2.2" fill="#E27A2B"/>
    <path d="M31.2 48.6v5.2" stroke="#F6D3A8" stroke-width="1.1"/>
    <rect x="19.6" y="21.6" width="7.2" height="11" rx="3.6" fill="url(#lc-peau)"/>
    <rect x="26.3" y="23.4" width="6.4" height="10" rx="3.2" fill="url(#lc-peau)"/>
    <rect x="32" y="26.2" width="5.4" height="9" rx="2.7" fill="url(#lc-peau)"/>
    <rect x="9" y="25" width="28.4" height="24" rx="9.5" fill="url(#lc-peau)"/>
    <path d="M10.5 33V7.6a4.5 4.5 0 0 1 9 0V31.4" fill="url(#lc-peau)"/>
    <path d="M9.6 33.2c-4-1-5.2 4.4-1.6 6.9l6.6 4.2c3 1.9 7-.6 5-4.1-1.1-1.9-3.9-2.8-5.9-3.8z" fill="url(#lc-peau)"/>
  </g>
  <path d="M12.9 7.4a2.1 2.4 0 0 1 4.2 0v1.6h-4.2z" fill="#FBE3CE" opacity=".8"/>
  <path d="M21.6 27.4h3.2M28 28.6h2.6M33.4 30.6h2.2" stroke="#9C6444" stroke-width="1" stroke-linecap="round" opacity=".7"/>
</svg>`;
  const DX = 2; // pas de la table de la ligne médiane (px)

  /* ---------- couleurs : un lacet, sa trame, son envers, son fil, ses ferrets ---------- */
  const NOMMEES = { jaune: '#F2D24B', ticket: '#F2D24B', sauge: '#8A927B', rouge: '#E03A2E', pastille: '#E03A2E', creme: '#F4EEE2', blanc: '#F7F4EE', noir: '#232326', cuir: '#A8743F', brun: '#3A2A20' };
  const DEFAUT = ['#F2D24B', '#8A927B', '#E03A2E', '#F4EEE2', '#3A2A20'];
  const rgb = (h) => {
    h = String(NOMMEES[h] || h || '#888').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const hex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const melange = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const NOIR = [0, 0, 0], BLANC = [255, 255, 255], ENCRE = [43, 36, 32], CREME = [255, 246, 230];
  function palette(item) {
    let base = rgb(item.couleur);
    const fil = item.texte ? rgb(item.texte) : (contraste(base, ENCRE) >= contraste(base, CREME) ? ENCRE : CREME);
    // le mot tissé reste lisible (contraste 4,5:1) : on fonce ou on éclaircit un peu le lacet s'il le faut
    for (let k = 0; k < 12 && contraste(base, fil) < 4.5; k++) base = melange(base, fil === ENCRE ? BLANC : NOIR, 0.07);
    const L = lum(base);
    const clair = L > 0.42;
    return {
      L, clair,
      base: hex(base),
      bord: hex(melange(base, NOIR, clair ? 0.34 : 0.5)),
      tranche: hex(melange(base, NOIR, clair ? 0.3 : 0.45)),
      envers: hex(melange(melange(base, NOIR, 0.16), [128, 128, 128], 0.14)),
      fil: hex(fil),
      relief: clair ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.42)',
      crete: clair ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.13)',
      creux: clair ? 'rgba(90,62,18,.17)' : 'rgba(0,0,0,.27)',
      lustre: clair ? 0.34 : 0.2,
      haut: clair ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.3)',
      bas: clair ? 'rgba(80,56,20,.3)' : 'rgba(0,0,0,.45)',
      ferret: item.ferret || (L < 0.06 ? 'laiton' : L < 0.42 || L > 0.78 ? 'nickel' : 'noir'),
      rgb: base,
    };
  }
  const METAUX = {
    laiton: [[0, '#4E3810'], [0.16, '#E2C47C'], [0.3, '#FFF4D2'], [0.46, '#C69B4A'], [0.74, '#7A5820'], [1, '#3A290B']],
    nickel: [[0, '#3E4146'], [0.18, '#D2D7DC'], [0.31, '#FFFFFF'], [0.5, '#A6ACB2'], [0.76, '#666B71'], [1, '#2E3135']],
    noir: [[0, '#070708'], [0.2, '#3C3C40'], [0.3, '#A5A5AC'], [0.4, '#2C2C30'], [0.75, '#131315'], [1, '#040405']],
  };

  /* ---------- les sons (synthétisés, ajoutés à la palette) ---------- */
  function sons() {
    if (!CO.sfx || !CO.sfx.ajouter || (CO.sfx.existe && CO.sfx.existe('lc-tirer'))) return;
    // la tension : le lacet se raidit d'un coup, un petit crissement de fibre
    CO.sfx.ajouter('lc-tendre', (c, o, t, opts, O) => {
      O.strike(c, o, t, O.rnd(700, 760), 'leather', { d: 0.05, v: 0.05 });
      O.tone(c, o, t + 0.01, { f: 1250, f2: 1800, glide: 0.08, type: 'triangle', a: 0.01, d: 0.07, v: 0.012 });
      O.noise(c, o, t, { f: 3200, q: 1.6, a: 0.004, d: 0.05, v: 0.018 });
    }, { gap: 120 });
    // le zip : le lacet file de plus en plus vite dans les œillets, puis le souffle de la sortie
    CO.sfx.ajouter('lc-tirer', (c, o, t, opts, O) => {
      const d = opts.dur || 0.47;
      O.noise(c, o, t, { f: 900, f2: 3600, q: 2.3, a: 0.05, d: 0.12, hold: d * 0.7, v: 0.05 });
      let tt = t, pas = 0.062;
      while (tt < t + d) { O.noise(c, o, tt, { f: 4600, type: 'highpass', a: 0.001, d: 0.006, v: 0.016 }); tt += pas; pas *= 0.8; if (pas < 0.009) pas = 0.009; }
      O.noise(c, o, t + d * 0.85, { f: 2600, f2: 700, q: 0.8, a: 0.01, d: 0.16, v: 0.03 });
    }, { gap: 200 });
    // on le renfile : le zip à l'envers, qui ralentit, et le lacet qui se pose
    CO.sfx.ajouter('lc-renfiler', (c, o, t, opts, O) => {
      const d = opts.dur || 0.5;
      O.noise(c, o, t, { f: 3100, f2: 1100, q: 2, a: 0.03, d: 0.14, hold: d * 0.55, v: 0.03 });
      let tt = t, pas = 0.012;
      while (tt < t + d * 0.9) { O.noise(c, o, tt, { f: 4200, type: 'highpass', a: 0.001, d: 0.005, v: 0.01 }); tt += pas; pas *= 1.28; }
      O.strike(c, o, t + d + 0.04, O.rnd(470, 520), 'leather', { d: 0.06, v: 0.04 });
    }, { gap: 150 });
  }

  /* ---------- les éléments ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const XL = 'http://www.w3.org/1999/xlink';
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) {
      e.setAttribute(k, attrs[k]);
      if (k === 'href') e.setAttributeNS(XL, 'xlink:href', attrs[k]); // les Safari d'avant 12.1
    }
    if (parent) parent.appendChild(e);
    return e;
  };
  function lireRepli(host) {
    return [...host.querySelectorAll('a, button')].map((a, i) => ({
      label: a.textContent.trim(),
      couleur: a.dataset.couleur || DEFAUT[i % DEFAUT.length],
      href: a.getAttribute('href') || undefined,
      externe: a.target === '_blank',
    }));
  }

  /* ======================================================================
     create
     ====================================================================== */
  function create(host, items, opts = {}) {
    if (!host) return null;
    sons();
    items = (items && items.length ? items : lireRepli(host)).filter((it) => it && it.label);
    const u = 'lc' + (++instances) + '-';
    const repli = [...host.childNodes];
    repli.forEach((n) => n.remove());
    host.classList.add('lc-hote');
    const root = document.createElement('div');
    root.className = 'lc';
    if (opts.debord != null) root.style.setProperty('--lc-debord', opts.debord + 'px');
    host.appendChild(root);
    let detruit = false, occupe = null, raf = 0;
    const anims = new Set(); // les gestes en cours (une fonction par lacet qui bouge)
    const vue = host.closest('.view');
    const maVue = vue ? vue.dataset.view : null;

    /* ---------- un lacet ---------- */
    const lacets = items.map((item, i) => {
      const lien = !!item.href;
      const el = document.createElement(lien ? 'a' : 'button');
      el.className = 'lc-lacet';
      el.dataset.sfx = 'none';
      if (lien) {
        el.href = item.href;
        if (item.externe) { el.target = '_blank'; el.rel = 'noopener'; }
      } else el.type = 'button';
      el.innerHTML = `<span class="lc-lib">${esc(item.label)}${item.externe ? ' (nouvel onglet)' : ''}</span>`;
      const pal = palette(item);
      const svg = svgEl('svg', { class: 'lc-svg', 'aria-hidden': 'true', focusable: 'false' });
      el.appendChild(svg);
      root.appendChild(el);
      const l = { i, item, el, svg, pal, etat: 'repos', dir: 1, amp: 1, tau: 1, serre: 1, s0: 0, ampTable: null, torsions: [], xTap: null, tTap: 0 };
      l.rng = CO.rng ? CO.rng(CO.hash ? CO.hash(item.label + i) : 7 + i * 131) : Math.random;
      squelette(l);
      return l;
    });

    function squelette(l) {
      const { svg, pal, i } = l;
      svg.innerHTML = '';
      const defs = svgEl('defs', null, svg);
      l.centre = svgEl('path', { id: `${u}c${i}` }, defs);
      l.forme = svgEl('path', { id: `${u}b${i}` }, defs); // la bande : une seule géométrie, trois usages (ombre douce, ombre, lacet)
      l.gLustre = svgEl('linearGradient', { id: `${u}l${i}`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 100, y2: 0 }, defs);
      l.gFerret = svgEl('linearGradient', { id: `${u}f${i}`, gradientUnits: 'userSpaceOnUse', x1: 0, y1: -4, x2: 0, y2: 4 }, defs);
      const ombres = svgEl('g', { class: 'lc-ombres' }, svg);
      svgEl('use', { href: `#${u}b${i}`, class: 'lc-o2', transform: 'translate(2.4 5.2)' }, ombres);
      svgEl('use', { href: `#${u}b${i}`, class: 'lc-o1', transform: 'translate(1.1 2.6)' }, ombres);
      l.fo = [0, 1].map(() => svgEl('ellipse', { class: 'lc-fo' }, ombres));
      const corps = svgEl('g', { class: 'lc-corps' }, svg);
      // l'épaisseur : la tranche du lacet, un peu plus sombre, juste sous le bord
      svgEl('use', { href: `#${u}b${i}`, class: 'lc-tranche', fill: pal.tranche, transform: 'translate(.25 1.15)' }, corps);
      svgEl('use', { href: `#${u}b${i}`, class: 'lc-bande', fill: pal.base, stroke: pal.bord, 'stroke-width': '.6', 'stroke-linejoin': 'round' }, corps);
      l.envers = svgEl('path', { class: 'lc-envers', fill: pal.envers }, corps);
      l.lustre = svgEl('path', { class: 'lc-lustre', fill: `url(#${u}l${i})` }, corps);
      l.t2 = svgEl('text', { class: 'lc-t lc-t2', fill: pal.relief, 'text-anchor': 'middle' }, corps);
      l.t1 = svgEl('text', { class: 'lc-t lc-t1', fill: pal.fil, 'text-anchor': 'middle' }, corps);
      [l.t1, l.t2].forEach((t) => {
        const tp = svgEl('textPath', { href: `#${u}c${i}`, startOffset: 0 }, t);
        tp.textContent = l.item.label.toUpperCase();
        t.tp = tp;
      });
      const tresse = svgEl('g', { class: 'lc-tresse', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, corps);
      l.creux = svgEl('path', { stroke: pal.creux, 'stroke-width': '.9' }, tresse);
      l.cretes = svgEl('path', { stroke: pal.crete, 'stroke-width': '.7' }, tresse);
      l.bh = svgEl('path', { class: 'lc-bh', fill: 'none', stroke: pal.haut, 'stroke-linecap': 'round' }, corps);
      l.bb = svgEl('path', { class: 'lc-bb', fill: 'none', stroke: pal.bas, 'stroke-linecap': 'round' }, corps);
      l.gTors = [];
      l.tors = svgEl('g', { class: 'lc-torsions' }, corps);
      l.ferrets = [0, 1].map((b) => ferret(l, svg, b));
    }

    // un ferret : un tube rigide (métal serti ou plastique), dans son repère (x vers l'extérieur)
    function ferret(l, svg, b) {
      const g = svgEl('g', { class: 'lc-ferret' }, svg);
      const coeur = svgEl('path', { class: 'lc-f-coeur', fill: l.pal.base }, g);
      const corps = svgEl('path', { class: 'lc-f-corps', fill: `url(#${u}f${l.i})`, stroke: 'rgba(0,0,0,.28)', 'stroke-width': '.35' }, g);
      const sertis = svgEl('path', { class: 'lc-f-sertis', fill: 'none', stroke: 'rgba(0,0,0,.34)', 'stroke-width': '.5' }, g);
      const reflet = svgEl('path', { class: 'lc-f-reflet', fill: 'none', stroke: 'rgba(255,255,255,.75)', 'stroke-width': '.7', 'stroke-linecap': 'round' }, g);
      return { g, coeur, corps, sertis, reflet, b };
    }

    /* ---------- tailles, tracés ---------- */
    let W = 320, w0 = 21, pas = 40, marge = 26, X0 = 0, X1 = 0, N = 0;
    function mesurer() {
      if (detruit) return;
      // un geste en cours (l'écran a tourné) : on l'arrête net ; tiré, le lacet reviendra ; rentrant, il est posé
      if (anims.size) {
        anims.clear();
        lacets.forEach((l) => {
          if (l.etat === 'tire') { l.etat = 'dehors'; l.el.classList.remove('lc-tire', 'lc-anime'); l.el.classList.add('lc-dehors'); }
          else if (l.etat === 'rentre') { l.etat = 'repos'; l.el.classList.remove('lc-anime'); }
        });
      }
      const r = root.getBoundingClientRect();
      W = Math.round(r.width) || 320;
      w0 = clamp(W * 0.066, 20.5, 25);
      pas = Math.round(w0 + 16);
      marge = Math.round(w0 * 1.25);
      const haut = 8;
      root.style.height = (haut * 2 + pas * lacets.length) + 'px';
      const corps = clamp(W * 0.047, 14.5, 16.5);
      root.style.setProperty('--lc-taille', corps.toFixed(2) + 'px');
      X0 = -W - 80; X1 = 2 * W + 80;
      N = Math.ceil((X1 - X0) / DX) + 1;
      lacets.forEach((l) => {
        l.el.style.top = (haut + l.i * pas) + 'px';
        l.el.style.height = pas + 'px';
        const H = pas + 2 * marge;
        l.svg.setAttribute('width', W);
        l.svg.setAttribute('height', H);
        l.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        l.svg.style.top = -marge + 'px';
        // les capitales (0,8 em chez Big Shoulders) centrées sur la ligne médiane ; le relief, un peu dessous
        l.t1.setAttribute('dy', f2(corps * 0.39));
        l.t2.setAttribute('dy', f2(corps * 0.39 + 0.75));
        preparer(l);
      });
      // la longueur des mots, lue pour tous d'un coup (une seule mise en page), puis la suite
      lacets.forEach((l) => { try { l.tl = l.t1.getComputedTextLength() || 0; } catch (e) { l.tl = 0; } });
      lacets.forEach((l) => finir(l));
    }
    // la forme d'un lacet : sa vague (graine = son nom), ses bouts (puis finir() : ses torsions, ses dégradés, son dessin)
    function preparer(l) {
      const R = CO.rng ? CO.rng(CO.hash ? CO.hash(l.item.label + ':' + l.i) : 3 + l.i) : Math.random;
      l.base = marge + pas / 2;
      l.w0 = w0;
      l.A = w0 * (0.42 + 0.1 * R());
      l.k1 = TAU / (W * (0.5 + 0.12 * R()));
      l.p1 = 1.3 + l.i * Math.PI * (0.88 + 0.24 * R()); // deux voisins à peu près en opposition : ils se touchent çà et là
      l.h2 = 0.16 + 0.1 * R();
      l.k2 = l.k1 * (2.1 + 0.4 * R());
      l.p2 = R() * TAU;
      l.pente = (R() - 0.5) * 0.026;                 // jamais tout à fait parallèle aux autres
      l.xc = W * (0.5 + (R() - 0.5) * 0.08);         // là où se pose le mot, la vague se calme
      l.ew = W * 0.21;
      l.xL = 7 + 6 * R();
      l.xR = W - 7 - 6 * R();
      l.La = Math.round(w0 * 0.98);   // la longueur d'un ferret
      l.da = w0 * 0.37;               // son diamètre
      l.Tp = w0 * 0.55;               // le bout qui s'amincit dans le ferret
      l.n = N;
      l.xs = new Float64Array(N); l.ys = new Float64Array(N); l.ss = new Float64Array(N);
      l.amp = 1; l.tau = 1; l.serre = 1;
      table(l);
      l.s0 = sDeX(l, l.xL);
      l.L = sDeX(l, l.xR) - l.s0;
    }
    function finir(l) {
      placerTorsions(l);
      degrades(l);
      if (l.etat === 'dehors') { l.svg.style.visibility = 'hidden'; return; }
      l.etat = 'repos';
      l.svg.style.visibility = '';
      dessiner(l);
    }
    // la ligne médiane : deux sinus, une pente légère, une vague plus calme sous le mot (enveloppe)
    const onde = (l, x) => (Math.sin(l.k1 * x + l.p1) + l.h2 * Math.sin(l.k2 * x + l.p2)) / (1 + l.h2 * 0.5);
    const donde = (l, x) => (l.k1 * Math.cos(l.k1 * x + l.p1) + l.h2 * l.k2 * Math.cos(l.k2 * x + l.p2)) / (1 + l.h2 * 0.5);
    const env = (l, x) => { const z = (x - l.xc) / l.ew; return 1 - 0.36 * Math.exp(-z * z); };
    const denv = (l, x) => { const z = (x - l.xc) / l.ew; return ((0.72 * z) / l.ew) * Math.exp(-z * z); };
    const yA = (l, x) => l.base + l.pente * (x - W / 2) + l.amp * l.A * env(l, x) * onde(l, x);
    const dyA = (l, x) => l.pente + l.amp * l.A * (denv(l, x) * onde(l, x) + env(l, x) * donde(l, x));
    // une torsion ou deux (le lacet s'est retourné sur une crête et montre son envers jusqu'au ferret), loin du mot
    const TORSIONS = [0, 1, 0, 0, -1];
    function placerTorsions(l) {
      l.torsions = [];
      const fin = TORSIONS[l.i % TORSIONS.length];
      if (!fin) return;
      const taille = parseFloat(root.style.getPropertyValue('--lc-taille')) || 15;
      const tl = l.tl || l.item.label.length * taille * 0.52;
      const sig = w0 * 0.75 + 3;
      const libre0 = l.La + l.Tp + sig + 4, libre1 = l.L - l.La - l.Tp - sig - 4;
      const motA = l.L / 2 - tl / 2 - 8 - sig, motB = l.L / 2 + tl / 2 + 8 + sig;
      const a = fin > 0 ? motB : libre0, b = fin > 0 ? libre1 : motA;
      if (b - a < 2) return;
      let mieux = (a + b) / 2, v0 = -1;
      for (let uu = a; uu <= b; uu += 2) { // sur une crête si possible
        const v = Math.abs(onde(l, xDeS(l, l.s0 + uu, 0)));
        if (v > v0) { v0 = v; mieux = uu; }
      }
      l.torsions.push({ u: mieux, sig, fin, sens: l.i % 4 ? 1 : -1 });
    }
    // la table de la ligne médiane (x, y, abscisse curviligne) pour l'amplitude du moment, et son tracé (pour le textPath)
    function table(l) {
      const { xs, ys, ss } = l;
      let s = 0, py = 0;
      for (let k = 0; k < l.n; k++) {
        const x = X0 + k * DX, y = yA(l, x);
        if (k) s += Math.sqrt(DX * DX + (y - py) * (y - py));
        xs[k] = x; ys[k] = y; ss[k] = s; py = y;
      }
      l.ampTable = l.amp;
      // le tracé du mot : un point sur trois suffit (l'écart de longueur avec la table est de l'ordre du centième de pixel)
      let d = 'M' + xs[0] + ' ' + f2(ys[0]);
      for (let k = 3; k < l.n; k += 3) d += 'L' + xs[k] + ' ' + f2(ys[k]);
      l.centre.setAttribute('d', d);
    }
    function sDeX(l, x) {
      const f = clamp((x - X0) / DX, 0, l.n - 1.001), k = Math.floor(f);
      return lerp(l.ss[k], l.ss[k + 1], f - k);
    }
    // l'indice de la table pour une longueur (dichotomie)
    function indice(l, s) {
      let a = 0, b = l.n - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (l.ss[m] <= s) a = m; else b = m; }
      return a;
    }
    // l'abscisse d'une longueur donnée (recherche à partir d'un indice voisin)
    function xDeS(l, s, h) {
      const ss = l.ss;
      let k = clamp(h | 0, 0, l.n - 2);
      while (k < l.n - 2 && ss[k + 1] < s) k++;
      while (k > 0 && ss[k] > s) k--;
      const t = ss[k + 1] > ss[k] ? clamp((s - ss[k]) / (ss[k + 1] - ss[k]), 0, 1) : 0;
      xDeS.k = k;
      return X0 + (k + t) * DX;
    }
    // les dégradés : le lustre (le long du lacet, un peu irrégulier), le métal ou le plastique des ferrets
    function degrades(l) {
      const g = l.gLustre, R = l.rng;
      g.setAttribute('x1', 0); g.setAttribute('x2', W);
      g.innerHTML = '';
      for (let k = 0; k <= 8; k++) {
        const a = l.pal.lustre * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(k * 1.9 + l.i * 2.3 + R() * 0.8)));
        svgEl('stop', { offset: (k / 8).toFixed(3), 'stop-color': '#FFFFFF', 'stop-opacity': a.toFixed(3) }, g);
      }
      const r = l.da / 2, gf = l.gFerret;
      gf.setAttribute('y1', f2(-r)); gf.setAttribute('y2', f2(r));
      gf.innerHTML = '';
      const m = l.pal.ferret;
      if (METAUX[m]) METAUX[m].forEach(([o, c]) => svgEl('stop', { offset: o, 'stop-color': c }, gf));
      else { // plastique clair teinté par le lacet
        const b = l.pal.rgb;
        [[0, hex(melange(b, NOIR, 0.45)), 0.92], [0.2, '#FFFFFF', 0.9], [0.34, hex(b), 0.5], [0.7, hex(melange(b, NOIR, 0.2)), 0.72], [1, hex(melange(b, NOIR, 0.5)), 0.95]]
          .forEach(([o, c, a]) => svgEl('stop', { offset: o, 'stop-color': c, 'stop-opacity': a }, gf));
      }
      // la forme des ferrets (repère local)
      const La = l.La, fr = r, tip = r * 0.84;
      const corps = `M0 ${f2(-fr * 1.06)}L${f2(La - tip)} ${f2(-tip)}Q${f2(La + tip * 0.15)} ${f2(-tip)} ${f2(La + tip * 0.15)} 0Q${f2(La + tip * 0.15)} ${f2(tip)} ${f2(La - tip)} ${f2(tip)}L0 ${f2(fr * 1.06)}Z`;
      const metal = !!METAUX[m] && m !== 'noir';
      l.ferrets.forEach((F) => {
        F.corps.setAttribute('d', corps);
        F.coeur.setAttribute('d', `M-1 ${f2(-fr * 0.5)}L${f2(La * 0.86)} ${f2(-fr * 0.4)}L${f2(La * 0.86)} ${f2(fr * 0.4)}L-1 ${f2(fr * 0.5)}Z`);
        F.coeur.style.display = m === 'clair' ? '' : 'none';
        F.sertis.setAttribute('d', metal ? `M2.3 ${f2(-fr)}V${f2(fr)}M3.8 ${f2(-fr)}V${f2(fr)}M${f2(La - tip - 1.2)} ${f2(-tip)}V${f2(tip)}` : `M1.4 ${f2(-fr)}V${f2(fr)}`);
        F.reflet.setAttribute('d', `M1.6 ${f2(-fr * 0.46)}L${f2(La - tip * 0.9)} ${f2(-tip * 0.42)}`);
      });
    }

    /* ---------- le dessin d'un lacet (au repos : une fois ; pendant un geste : à chaque image) ---------- */
    const P = { x: [], y: [], nx: [], ny: [], h: [], c: [] };
    function dessiner(l) {
      if (l.ampTable !== l.amp) table(l);
      const L = l.L, La = l.La, Tp = l.Tp, w = l.w0 * l.serre;
      const u0 = La - 1, u1 = L - La + 1;
      const n = Math.max(12, Math.ceil((u1 - u0) / 3));
      const epais = 1.1; // l'épaisseur vue par la tranche (px)
      let k0 = indice(l, l.s0 + u0);
      for (let k = 0; k <= n; k++) {
        const uu = u0 + ((u1 - u0) * k) / n;
        const x = xDeS(l, l.s0 + uu, k0);
        k0 = xDeS.k;
        const y = yA(l, x), d = dyA(l, x), q = 1 / Math.sqrt(1 + d * d);
        // la normale « vers le haut » de l'écran
        const nx = d * q, ny = -q;
        const bout = Math.min(uu - La, L - La - uu);
        let e = 0.34 + 0.66 * lisse(bout / Tp);
        let c = 1;
        for (const t of l.torsions) {
          const tt = t.fin > 0 ? (uu - (t.u - t.sig)) / (2 * t.sig) : (t.u + t.sig - uu) / (2 * t.sig);
          c *= Math.cos(Math.PI * l.tau * lisse(tt));
        }
        P.x[k] = x; P.y[k] = y; P.nx[k] = nx; P.ny[k] = ny;
        P.h[k] = Math.max((w / 2) * e * Math.abs(c), epais);
        P.c[k] = (w / 2) * e * c;
      }
      const bord = (o, signe) => { // un bord (o : fraction de la demi-largeur ; signe : suit la torsion)
        let s = '';
        for (let k = 0; k <= n; k++) {
          const hh = signe ? P.c[k] * o : P.h[k] * o;
          s += (k ? 'L' : 'M') + f1(P.x[k] + P.nx[k] * hh) + ' ' + f1(P.y[k] + P.ny[k] * hh);
        }
        return s;
      };
      const ruban = (a, b, k1 = 0, k2 = n) => { // la surface entre deux bords (fractions de la demi-largeur)
        let s = '';
        for (let k = k1; k <= k2; k++) s += (k > k1 ? 'L' : 'M') + f1(P.x[k] + P.nx[k] * P.h[k] * a) + ' ' + f1(P.y[k] + P.ny[k] * P.h[k] * a);
        for (let k = k2; k >= k1; k--) s += 'L' + f1(P.x[k] + P.nx[k] * P.h[k] * b) + ' ' + f1(P.y[k] + P.ny[k] * P.h[k] * b);
        return s + 'Z';
      };
      l.forme.setAttribute('d', ruban(1, -1));
      l.lustre.setAttribute('d', ruban(0.62, 0.04));
      // l'envers (entre les deux passages par la tranche d'une torsion)
      let dEnv = '';
      let debut = -1;
      for (let k = 0; k <= n + 1; k++) {
        const neg = k <= n && P.c[k] < 0;
        if (neg && debut < 0) debut = k;
        if (!neg && debut >= 0) { dEnv += ruban(1, -1, Math.max(0, debut - 1), Math.min(n, k)); debut = -1; }
      }
      l.envers.setAttribute('d', dEnv);
      // la tresse : des chevrons serrés (crêtes claires, creux sombres), ancrés à la matière (ils glissent avec le lacet)
      const pasT = 2.5, avance = 0.8;
      const I = (uu) => {
        const kf = clamp(((uu - u0) / (u1 - u0)) * n, 0, n - 1e-4), i = Math.floor(kf), f = kf - i;
        return [lerp(P.x[i], P.x[i + 1], f), lerp(P.y[i], P.y[i + 1], f), lerp(P.nx[i], P.nx[i + 1], f), lerp(P.ny[i], P.ny[i + 1], f), lerp(P.c[i], P.c[i + 1], f), lerp(P.h[i], P.h[i + 1], f)];
      };
      let dC = '', dS = '';
      for (let m = Math.ceil((u0 + 0.5) / pasT); ; m++) {
        const ua = m * pasT, a = I(ua), ub = ua + a[5] * avance;
        if (ub > u1 - 0.5) break;
        const b = I(ub), hh = a[4] * 0.88;
        const seg = 'M' + f1(a[0] + a[2] * hh) + ' ' + f1(a[1] + a[3] * hh) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + 'L' + f1(a[0] - a[2] * hh) + ' ' + f1(a[1] - a[3] * hh);
        if (m % 2) dC += seg; else dS += seg;
      }
      l.cretes.setAttribute('d', dC);
      l.creux.setAttribute('d', dS);
      l.bh.setAttribute('d', bord(0.8, false));
      l.bh.setAttribute('stroke-width', f2(Math.max(0.7, w * 0.05)));
      l.bb.setAttribute('d', bord(-0.83, false));
      l.bb.setAttribute('stroke-width', f2(Math.max(1, w * 0.085)));
      // les torsions : l'ombre de la tranche, un éclat de lumière juste avant
      torsions(l, n);
      // le mot, au milieu de la matière du lacet
      const so = f2(l.s0 + L / 2);
      l.t1.tp.setAttribute('startOffset', so);
      l.t2.tp.setAttribute('startOffset', so);
      // les ferrets, dans l'axe du lacet, au bout
      [0, 1].forEach((b) => {
        const kk = b ? n : 0;
        let tx = -P.ny[kk], ty = P.nx[kk]; // la tangente (vers la droite)
        if (!b) { tx = -tx; ty = -ty; }
        const a = Math.atan2(ty, tx) * (180 / Math.PI);
        const flip = tx < 0 ? -1 : 1; // le reflet reste en haut de l'écran
        const x = P.x[kk], y = P.y[kk];
        l.ferrets[b].g.setAttribute('transform', `translate(${f2(x)} ${f2(y)}) rotate(${f2(a)}) scale(1 ${flip})`);
        const fo = l.fo[b];
        fo.setAttribute('cx', f2(x + tx * La * 0.5 + 1.4));
        fo.setAttribute('cy', f2(y + ty * La * 0.5 + 3));
        fo.setAttribute('rx', f2(La * 0.55 + 1));
        fo.setAttribute('ry', f2(l.da * 0.55 + 0.6));
        fo.setAttribute('transform', `rotate(${f2(a)} ${f2(x + tx * La * 0.5 + 1.4)} ${f2(y + ty * La * 0.5 + 3)})`);
      });
    }
    function torsions(l, n) {
      while (l.gTors.length < l.torsions.length) {
        const k = l.gTors.length;
        const g = svgEl('linearGradient', { id: `${u}t${l.i}-${k}`, gradientUnits: 'userSpaceOnUse' }, l.svg.querySelector('defs'));
        const p = svgEl('path', { fill: `url(#${u}t${l.i}-${k})` }, l.tors);
        l.gTors.push({ g, p, stops: [] });
      }
      l.torsions.forEach((t, k) => {
        const T = l.gTors[k];
        if (l.tau < 0.02) { T.p.setAttribute('d', ''); return; }
        const ua = t.u - t.sig, ub = t.u + t.sig;
        const u0 = l.La - 1, u1 = l.L - l.La + 1;
        const ka = clamp(Math.floor(((ua - u0) / (u1 - u0)) * n), 0, n), kb = clamp(Math.ceil(((ub - u0) / (u1 - u0)) * n), 0, n);
        let s = '';
        for (let q = ka; q <= kb; q++) s += (q > ka ? 'L' : 'M') + f1(P.x[q] + P.nx[q] * P.h[q] * 1.02) + ' ' + f1(P.y[q] + P.ny[q] * P.h[q] * 1.02);
        for (let q = kb; q >= ka; q--) s += 'L' + f1(P.x[q] - P.nx[q] * P.h[q] * 1.02) + ' ' + f1(P.y[q] - P.ny[q] * P.h[q] * 1.02);
        T.p.setAttribute('d', s + 'Z');
        T.g.setAttribute('x1', f1(P.x[ka])); T.g.setAttribute('y1', f1(P.y[ka]));
        T.g.setAttribute('x2', f1(P.x[kb])); T.g.setAttribute('y2', f1(P.y[kb]));
        const M = 16;
        while (T.stops.length < M + 1) T.stops.push(svgEl('stop', null, T.g));
        for (let q = 0; q <= M; q++) {
          const tt = q / M;
          const th = Math.PI * l.tau * lisse(t.fin > 0 ? tt : 1 - tt);
          const cc = Math.abs(Math.cos(th)), sn = Math.sin(th) * t.sens;
          const sombre = 0.55 * Math.pow(1 - cc, 1.3);
          const eclat = Math.max(0, sn) * Math.pow(cc, 3) * 0.9 * (1 - cc) * 2.2;
          const st = T.stops[q];
          st.setAttribute('offset', tt.toFixed(3));
          if (eclat > sombre) { st.setAttribute('stop-color', '#FFFFFF'); st.setAttribute('stop-opacity', clamp(eclat * 0.8, 0, 0.55).toFixed(3)); }
          else { st.setAttribute('stop-color', '#000000'); st.setAttribute('stop-opacity', (sombre * l.tau).toFixed(3)); }
        }
      });
    }

    /* ---------- les gestes : tendre, tirer, renfiler ---------- */
    function boucle() {
      raf = 0;
      if (detruit) return;
      const now = performance.now();
      anims.forEach((a) => { if (a(now) === false) anims.delete(a); });
      if (anims.size) raf = requestAnimationFrame(boucle);
    }
    const lancer = (fn) => { anims.add(fn); if (!raf) raf = requestAnimationFrame(boucle); };

    function tirer(l, dir) {
      l.etat = 'tire';
      l.dir = dir;
      l.el.classList.add('lc-tire', 'lc-anime');
      const t0 = performance.now(), T1 = TENSION * lent(), T2 = GLISSE * lent();
      const queue = dir > 0 ? l.xL : l.xR; // le bout qui ne bouge pas pendant la tension
      const amp1 = 0.34, tau0 = l.tau;
      let sA = null, D = 0;
      son('lc-tendre');
      vibre(8);
      lancer((now) => {
        const t = now - t0;
        if (t < T1) {
          const e = E.outCubic(t / T1);
          l.amp = lerp(1, amp1, e);
          l.tau = lerp(tau0, 0, E.outCubic(Math.min(1, t / (T1 * 0.85))));
          l.serre = 1 - 0.07 * e;
          table(l);
          l.s0 = dir > 0 ? sDeX(l, queue) : sDeX(l, queue) - l.L;
          dessiner(l);
          return true;
        }
        if (sA == null) { // la glissade commence : le tracé ne change plus, seul s0 avance
          l.amp = amp1; l.tau = 0; l.serre = 0.93;
          table(l);
          l.s0 = dir > 0 ? sDeX(l, queue) : sDeX(l, queue) - l.L;
          sA = l.s0;
          D = dir > 0 ? sDeX(l, W + 8) - sA : sA + l.L - sDeX(l, -8);
          son('lc-tirer', { dur: T2 / 1000 });
        }
        const p = Math.min(1, (t - T1) / T2);
        l.s0 = sA + dir * D * E.glisse(p);
        dessiner(l);
        if (p >= 1) {
          l.etat = 'dehors';
          l.el.classList.remove('lc-tire', 'lc-anime');
          l.el.classList.add('lc-dehors');
          l.svg.style.visibility = 'hidden';
          if (l.rentrer) { l.rentrer = false; setTimeout(() => rentrer(l), 120); }
          return false;
        }
        return true;
      });
      return (T1 + T2);
    }

    function rentrer(l, delai = 0) {
      if (l.etat !== 'dehors' || detruit) { if (l.etat === 'tire') l.rentrer = true; return; }
      l.etat = 'rentre';
      l.el.classList.remove('lc-dehors');
      l.el.classList.add('lc-anime');
      const dir = l.dir, amp1 = 0.34;
      l.amp = amp1; l.tau = 0; l.serre = 0.93;
      table(l);
      const queue = dir > 0 ? l.xL : l.xR;
      const sRepos = dir > 0 ? sDeX(l, queue) : sDeX(l, queue) - l.L;
      const sDehors = dir > 0 ? sDeX(l, W + 8) : sDeX(l, -8) - l.L;
      l.s0 = sDehors;
      dessiner(l);
      l.svg.style.visibility = '';
      const t0 = performance.now() + delai, T1 = RETOUR * lent(), T2 = DETENTE * lent();
      let sonne = false;
      lancer((now) => {
        const t = now - t0;
        if (t < 0) return true;
        if (!sonne) { sonne = true; son('lc-renfiler', { dur: T1 / 1000 }); }
        if (t < T1) {
          l.s0 = lerp(sDehors, sRepos, E.rentre(t / T1));
          dessiner(l);
          return true;
        }
        // la détente : la vague revient (un peu trop, puis se pose), les torsions se refont
        const p = Math.min(1, (t - T1) / T2);
        const ressort = 1 - Math.exp(-5.2 * p) * Math.cos(7.2 * p);
        l.amp = lerp(amp1, 1, ressort);
        l.serre = lerp(0.93, 1, E.outCubic(p));
        l.tau = E.inOutSine(clamp((p - 0.15) / 0.85, 0, 1));
        table(l);
        l.s0 = dir > 0 ? sDeX(l, queue) : sDeX(l, queue) - l.L;
        dessiner(l);
        if (p >= 1) {
          l.amp = 1; l.tau = 1; l.serre = 1;
          table(l);
          l.s0 = sDeX(l, l.xL);
          dessiner(l);
          l.etat = 'repos';
          l.el.classList.remove('lc-anime');
          return false;
        }
        return true;
      });
    }

    function remettre() {
      if (detruit) return;
      let k = 0;
      lacets.forEach((l) => {
        if (l.etat === 'dehors') rentrer(l, 90 * k++);
        else if (l.etat === 'tire') l.rentrer = true;
      });
    }
    let tRetour = 0;
    function planifierRetour(ms) {
      clearTimeout(tRetour);
      tRetour = setTimeout(() => {
        if (document.hidden) return;
        if (maVue && CO.view && CO.view !== maVue) return;
        remettre();
      }, ms);
    }

    /* ---------- activer un lacet : le geste, puis (seulement) le lien ---------- */
    function agir(l) {
      const it = l.item;
      if (typeof it.action === 'function') { try { it.action(); } catch (e) { console.warn('lacet', e); } return; }
      if (!it.href) return;
      if (it.externe) {
        const w = window.open(it.href, '_blank', 'noopener');
        if (!w && !it.href.startsWith('http')) location.href = it.href;
      } else location.href = it.href;
    }
    function activer(l, e) {
      doigtVu();
      if (e && l.item.href && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button && e.button > 0))) return; // un lien dans un nouvel onglet : le navigateur s'en charge
      if (reduit()) {
        if (typeof l.item.action === 'function') { if (e) e.preventDefault(); agir(l); }
        return; // un lien : il s'ouvre normalement
      }
      if (e) e.preventDefault();
      if (occupe) return;
      if (l.etat === 'flechi') { l.etat = 'repos'; l.amp = 1; } // (il fléchissait sous le doigt de l'aide : on le tire quand même)
      if (l.etat === 'dehors') { rentrer(l); return; }
      if (l.etat !== 'repos') return;
      // le côté : vers le bout le plus proche du doigt (au clavier : un sur deux)
      let dir = l.i % 2 ? -1 : 1;
      if (l.xTap != null && performance.now() - l.tTap < 1500) {
        const r = l.el.getBoundingClientRect();
        dir = l.xTap > r.left + r.width / 2 ? 1 : -1;
      }
      l.xTap = null;
      occupe = l;
      const duree = tirer(l, dir);
      // le lien part dans le même geste (un minuteur de moins d'une seconde garde l'autorisation d'ouvrir un onglet)
      setTimeout(() => {
        occupe = null;
        if (detruit) return;
        agir(l);
        // restés sur place (appel, onglet ouvert à côté) : le lacet revient de lui-même
        setTimeout(() => {
          if (l.etat === 'dehors' && !document.hidden && (!maVue || !CO.view || CO.view === maVue)) rentrer(l);
        }, 1600);
      }, duree + 20);
    }
    lacets.forEach((l) => {
      const el = l.el;
      el.addEventListener('pointerdown', (e) => {
        l.xTap = e.clientX; l.tTap = performance.now();
        el.classList.add('lc-presse');
      });
      const relache = () => el.classList.remove('lc-presse');
      el.addEventListener('pointerup', relache);
      el.addEventListener('pointercancel', relache);
      el.addEventListener('pointerleave', relache);
      el.addEventListener('click', (e) => activer(l, e));
      if (el.tagName === 'A') { // Espace sur un lien : comme un bouton
        el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault(); });
        el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); activer(l, null); } });
      }
    });

    /* ---------- le doigt qui montre : « ça se touche » ----------
       Tant qu'on n'a jamais tiré de lacet : quand les lacets sont à l'écran (l'appli dévoilée, sur
       l'accueil), une main arrive (celle de Clément, sa montre au bracelet orange) et toque trois fois
       le premier lacet, juste après son mot ; le lacet fléchit sous le doigt, une onde part du bout du
       doigt. Puis la main s'en va. Une fois par visite ; plus jamais dès qu'un lacet a été tiré. */
    const CLE_DOIGT = 'lacets-tires';
    const doigt = { el: null, fini: opts.indice === false || !lacets.length || !!(CO.store && CO.store.get(CLE_DOIGT, false)), t: [], io: null };
    function doigtVu() {
      if (!doigt.fini && CO.store) CO.store.set(CLE_DOIGT, true);
      doigtFin();
    }
    function doigtFin() {
      doigt.fini = true;
      doigt.t.forEach(clearTimeout);
      doigt.t = [];
      if (doigt.io) { doigt.io.disconnect(); doigt.io = null; }
      const el = doigt.el;
      if (!el) return;
      doigt.el = null;
      el.classList.remove('on');
      setTimeout(() => el.remove(), 450);
    }
    // le lacet sous le doigt : il fléchit un peu (la vague s'aplatit, puis revient en ressort)
    function flechir(l) {
      if (l.etat !== 'repos' || occupe || detruit || reduit()) return;
      l.etat = 'flechi';
      l.el.classList.add('lc-presse');
      const t0 = performance.now(), T = 520;
      lancer((now) => {
        if (l.etat !== 'flechi') return false;
        const p = Math.min(1, (now - t0) / T);
        l.amp = 1 - 0.2 * Math.exp(-6 * p) * Math.cos(9 * p) * (1 - p);
        if (p > 0.3) l.el.classList.remove('lc-presse');
        table(l);
        l.s0 = sDeX(l, l.xL);
        dessiner(l);
        if (p >= 1) { l.amp = 1; table(l); l.s0 = sDeX(l, l.xL); dessiner(l); l.etat = 'repos'; return false; }
        return true;
      });
    }
    function doigtLancer() {
      if (doigt.fini || doigt.el || detruit) return;
      const l = lacets[0];
      if (l.etat !== 'repos') return;
      // le bout du doigt : juste après le mot, sur la ligne médiane du lacet
      const taille = parseFloat(root.style.getPropertyValue('--lc-taille')) || 15;
      const tl = l.tl || l.item.label.length * taille * 0.55;
      const x = clamp(l.xc + tl / 2 + w0 * 0.9, W * 0.55, W - 46);
      const y = parseFloat(l.el.style.top) - marge + yA(l, x);
      const el = document.createElement('div');
      el.className = 'lc-doigt';
      el.setAttribute('aria-hidden', 'true');
      el.style.left = x.toFixed(1) + 'px';
      el.style.top = y.toFixed(1) + 'px';
      el.innerHTML = `<i class="lc-doigt-onde"></i><span class="lc-doigt-main">${MAIN_SVG}</span>`;
      const cycle = 1500 * lent(), toucher = 0.4 * cycle, n = reduit() ? 0 : 3;
      el.style.setProperty('--lc-cycle', cycle + 'ms');
      root.appendChild(el);
      doigt.el = el;
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
      for (let k = 0; k < n; k++) {
        doigt.t.push(setTimeout(() => {
          if (!doigt.el) return;
          el.classList.remove('toque');
          void el.offsetWidth; // (l'animation repart)
          el.classList.add('toque');
        }, 520 + k * cycle));
        doigt.t.push(setTimeout(() => { if (doigt.el) { flechir(l); son('tap'); } }, 520 + k * cycle + toucher));
      }
      doigt.t.push(setTimeout(doigtFin, 520 + Math.max(1, n) * cycle + (n ? 250 : 2600)));
    }
    function doigtGuetter() {
      if (doigt.fini || detruit) return;
      // l'ouverture couvre encore l'écran : on attend qu'elle ait dévoilé l'appli
      if (document.documentElement.classList.contains('ouverture') && !doigt.ouverture) {
        if (!doigt.attend && CO.on) { doigt.attend = true; CO.on('ouverture', () => { doigt.ouverture = true; doigtGuetter(); }); }
        return;
      }
      if (maVue && CO.view && CO.view !== maVue) return;
      if (doigt.io || doigt.el) return;
      if (!window.IntersectionObserver) { doigt.t.push(setTimeout(doigtLancer, 1400)); return; }
      doigt.io = new IntersectionObserver((es) => {
        const vu = es.some((e) => e.isIntersecting && e.intersectionRatio > 0.95);
        clearTimeout(doigt.attente);
        if (vu && !doigt.el) doigt.attente = setTimeout(() => { if (doigt.io) { doigt.io.disconnect(); doigt.io = null; } doigtLancer(); }, 1300);
      }, { threshold: [0, 0.95, 1] });
      doigt.io.observe(lacets[0].el);
    }
    if (!doigt.fini) {
      if (CO.on) CO.on('view', (v) => {
        if (doigt.fini || detruit) return;
        if (maVue && v !== maVue) { // on quitte l'accueil pendant qu'elle toque : elle reviendra
          doigt.t.forEach(clearTimeout); doigt.t = [];
          clearTimeout(doigt.attente);
          if (doigt.io) { doigt.io.disconnect(); doigt.io = null; }
          if (doigt.el) { doigt.el.remove(); doigt.el = null; }
        } else setTimeout(doigtGuetter, 300);
      });
      setTimeout(doigtGuetter, 0);
    }

    /* ---------- le retour sur l'accueil, sur la page ---------- */
    if (CO.on) CO.on('view', (v) => { if (!detruit && (!maVue || v === maVue)) planifierRetour(260); });
    const surPageshow = () => planifierRetour(220);
    const surVisible = () => { if (!document.hidden) planifierRetour(260); };
    window.addEventListener('pageshow', surPageshow);
    document.addEventListener('visibilitychange', surVisible);
    let ro = null, largeur = 0;
    const surTaille = () => { const w = Math.round(root.getBoundingClientRect().width); if (w && w !== largeur) { largeur = w; mesurer(); } };
    if (window.ResizeObserver) { ro = new ResizeObserver(surTaille); ro.observe(root); } else window.addEventListener('resize', surTaille);

    function detruire() {
      if (detruit) return;
      doigtFin();
      detruit = true;
      cancelAnimationFrame(raf);
      clearTimeout(tRetour);
      window.removeEventListener('pageshow', surPageshow);
      document.removeEventListener('visibilitychange', surVisible);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', surTaille);
      root.remove();
      host.classList.remove('lc-hote');
      repli.forEach((n) => host.appendChild(n));
    }

    // la première mesure : au premier rappel de l'observateur de taille (juste après la mise en page, avant la première
    // image : rien à forcer pendant que l'appli se construit) ; sans lui, tout de suite
    if (!ro) { largeur = Math.round(root.getBoundingClientRect().width); mesurer(); }
    // la police arrivée, le mot a sa vraie longueur : les torsions se posent à côté (lues d'un coup ; pas encore mesurés :
    // la première mesure s'en chargera)
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
      if (detruit || !largeur) return;
      lacets.forEach((l) => { try { l.tl = l.t1.getComputedTextLength() || l.tl; } catch (e) { /* rien */ } });
      lacets.forEach((l) => {
        placerTorsions(l);
        if (l.etat === 'repos') dessiner(l);
      });
    });
    return { el: root, remettre, detruire };
  }

  /* ======================================================================
     Le logo au lacet : CORDO63 à l'encre noire sur le crème, un lacet plat rouge qui passe
     dessus, dessous, d'une lettre à l'autre comme dans des œillets, et ressort des deux côtés
     jusqu'à ses ferrets. Les lettres sont les vrais tracés du logo (CO.BRAND.lettres, jamais une
     police) ; les croisements se trouvent tout seuls (on lit les tracés M/L/C du logo, on cherche
     où les traits entrent dans la bande du lacet) et alternent dessus / dessous, avec leurs ombres
     de contact. Tout est calculé : aucune mesure dans la page, le même dessin partout.
       CO.Lacets.logoSVG({ forme, encre, lacet, fond, k, id })  → une chaîne SVG autonome
       CO.Lacets.logo(o)                                         → l'élément <svg>
     forme : 'ligne' (le mot, large), 'carre' (l'icône : le mot au milieu, le lacet qui pend des
     deux côtés ; k < 1 le resserre pour la zone sûre des icônes masquables), 'signe' (« 63 »,
     traits plus gras, pour le favicon).
     ====================================================================== */
  const FORMES = {
    ligne: {
      lettres: [0, 1, 2, 3, 4, 5, 6], trait: 11.9, w: 24,
      pts: [[-168, 98], [-80, 62], [9, 42], [160, 55], [325, 72], [465, 70], [607, 60], [773, 69], [994, 71], [1080, 58], [1168, 22]],
      vb: [-196, -12, 1392, 136], chevrons: true,
    },
    carre: { // l'icône, sur deux lignes : CORDO, puis 63 centré dessous ; le lacet les lace en Z, comme les deux rangs d'œillets d'une chaussure
      lettres: [0, 1, 2, 3, 4, [5, -510.45, 158], [6, -510.45, 158]], trait: 11.9, w: 25, ferret0: false,
      pts: [[-430, -150], [-160, 0], [9, 52], [160, 60], [325, 72], [465, 70], [607, 62], [744, 60], [800, 86], [806, 150], [758, 206], [660, 224], [520, 228], [352, 227], [262, 226], [200, 246], [172, 318], [192, 392]],
      vb: [-72, -315, 890, 890], chevrons: true,
    },
    signe: {
      lettres: [5, 6], trait: 22, w: 19, ferrets: false, liseres: false, pas: 6,
      pts: [[640, 73.5], [773, 71.45], [862, 71.45], [930, 71.45], [994, 71.45], [1120, 70]],
      vb: [751, -76, 264, 264], chevrons: false,
    },
  };
  // un tracé du logo (M, L, C, Z absolus) en polylignes (une par sous-chemin)
  function polylignes(d, pas = 1.2) {
    const tok = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
    const out = [];
    let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0, cur = null;
    const num = () => parseFloat(tok[i++]);
    while (i < tok.length) {
      const t = tok[i];
      if (/^[MLCZ]$/i.test(t)) {
        cmd = t.toUpperCase(); i++;
        if (cmd === 'Z' && cur) { // le segment de fermeture compte (le fût du D, par exemple)
          const n = Math.max(1, Math.ceil(Math.hypot(x0 - x, y0 - y) / pas));
          for (let k = 1; k <= n; k++) cur.push([x + ((x0 - x) * k) / n, y + ((y0 - y) * k) / n]);
          x = x0; y = y0;
        }
        continue;
      }
      if (cmd === 'M') { x = num(); y = num(); x0 = x; y0 = y; cur = [[x, y]]; out.push(cur); cmd = 'L'; }
      else if (cmd === 'L') {
        const nx = num(), ny = num(), n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / pas));
        for (let k = 1; k <= n; k++) cur.push([x + ((nx - x) * k) / n, y + ((ny - y) * k) / n]);
        x = nx; y = ny;
      } else if (cmd === 'C') {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
        const n = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2)) / pas));
        for (let k = 1; k <= n; k++) {
          const t2 = k / n, v = 1 - t2;
          cur.push([v * v * v * x + 3 * v * v * t2 * x1 + 3 * v * t2 * t2 * x2 + t2 * t2 * t2 * x3, v * v * v * y + 3 * v * v * t2 * y1 + 3 * v * t2 * t2 * y2 + t2 * t2 * t2 * y3]);
        }
        x = x3; y = y3;
      } else i++;
    }
    return out;
  }
  // la ligne médiane du lacet : Catmull-Rom par ses points de passage, rééchantillonnée à pas régulier
  function ligneMediane(pts, pas = 1.5) {
    const dense = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let k = 0; k < 32; k++) {
        const t = k / 32, t2 = t * t, t3 = t2 * t;
        dense.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    dense.push(pts[pts.length - 1]);
    const X = [dense[0][0]], Y = [dense[0][1]], S = [0];
    let acc = 0, reste = 0;
    for (let i = 1; i < dense.length; i++) {
      const [ax, ay] = dense[i - 1], [bx, by] = dense[i];
      const seg = Math.hypot(bx - ax, by - ay);
      let pos = pas - reste;
      while (pos <= seg) { const t = pos / seg; X.push(ax + (bx - ax) * t); Y.push(ay + (by - ay) * t); acc += pas; S.push(acc); pos += pas; }
      reste = seg - (pos - pas);
    }
    const n = X.length, NX = [], NY = [];
    for (let k = 0; k < n; k++) { // la normale « vers le haut » (à gauche de la marche)
      const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
      const tx = X[b] - X[a], ty = Y[b] - Y[a], q = Math.hypot(tx, ty) || 1;
      NX.push(ty / q); NY.push(-tx / q);
    }
    return { X, Y, S, NX, NY, n, L: S[n - 1] };
  }
  // où les traits des lettres entrent dans la bande du lacet : des zones [u0, u1] le long du lacet
  function zonesCroisement(traits, C, rayon) {
    const G = new Map(), cell = 24;
    for (let k = 0; k < C.n; k++) {
      const key = Math.floor(C.X[k] / cell) + ':' + Math.floor(C.Y[k] / cell);
      if (!G.has(key)) G.set(key, []);
      G.get(key).push(k);
    }
    const us = [];
    traits.forEach((pl) => pl.forEach(([px, py]) => {
      const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
      let best = Infinity, bk = -1;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = G.get(cx + a + ':' + (cy + b));
        if (l) l.forEach((k) => { const d = (px - C.X[k]) ** 2 + (py - C.Y[k]) ** 2; if (d < best) { best = d; bk = k; } });
      }
      if (bk >= 0 && Math.sqrt(best) < rayon) us.push([C.S[bk], Math.sqrt(best)]);
    }));
    us.sort((a, b) => a[0] - b[0]);
    const zones = [];
    us.forEach(([v, d]) => { const z = zones[zones.length - 1]; if (z && v - z[1] < 5) { z[1] = v; z[2] = Math.min(z[2], d); } else zones.push([v, v, d]); });
    return zones.filter((z) => z[2] < rayon - 2.6); // un vrai croisement : le trait entre dans le lacet d'au moins deux unités
  }
  function logoSVG(o = {}) {
    const F = FORMES[o.forme] || FORMES.ligne;
    const B = CO.BRAND;
    if (!B) return '';
    const id = o.id || 'lg' + (++instances);
    const encre = o.encre || '#1E1A17', rougeHex = o.lacet || '#D8352A';
    const t = F.trait, w = F.w, hw = w / 2;
    const r = rgb(rougeHex);
    const C = ligneMediane(F.pts);
    // une lettre : son indice, ou [indice, dx, dy] (la même lettre, déplacée : l'icône sur deux lignes)
    const lettres = F.lettres.map((e) => { const [i, dx = 0, dy = 0] = [].concat(e); return { l: B.lettres[i], dx, dy }; });
    const lettresD = lettres.map(({ l, dx, dy }) => (dx || dy ? `<path transform="translate(${dx} ${dy})" d="${l.d}"/>` : `<path d="${l.d}"/>`)).join('');
    const traits = [];
    lettres.forEach(({ l, dx, dy }) => polylignes(l.d).forEach((pl) => traits.push(dx || dy ? pl.map(([x, y]) => [x + dx, y + dy]) : pl)));
    // les ferrets aux deux bouts, la bande entre les deux (qui s'amincit dans les ferrets)
    const La = w * 1.05, Tp = w * 0.55, da = w * 0.4;
    const k0 = Math.round(La / 1.5), k1 = C.n - 1 - k0;
    const demi = (k) => { const u = C.S[k], bout = Math.min(u - La, C.L - La - u); return hw * (0.34 + 0.66 * lisse(bout / Tp)); };
    const P = (k, o2) => [C.X[k] + C.NX[k] * o2, C.Y[k] + C.NY[k] * o2];
    const fmt = (p) => f1(p[0]) + ' ' + f1(p[1]);
    const pasK = F.pas || 3; // un point sur trois en sortie (4,5 unités : la courbe reste lisse, le fichier léger)
    const indices = (ka, kb) => { const l = []; for (let k = ka; k < kb; k += pasK) l.push(k); l.push(kb); return l; };
    const ruban = (a, b, ka = k0, kb = k1, marge = 0) => {
      const ks = indices(ka, kb);
      let s = '';
      ks.forEach((k, j) => { s += (j ? 'L' : 'M') + fmt(P(k, (demi(k) + marge) * a)); });
      for (let j = ks.length - 1; j >= 0; j--) s += 'L' + fmt(P(ks[j], (demi(ks[j]) + marge) * b));
      return s + 'Z';
    };
    const bord = (a) => indices(k0, k1).map((k, j) => (j ? 'L' : 'M') + fmt(P(k, demi(k) * a))).join('');
    // les croisements : dessus, dessous, en alternance le long du lacet (le premier : dessus)
    const zones = zonesCroisement(traits, C, hw + t / 2 + 0.8).map(([u0, u1], i) => ({ u0: u0 - t * 0.35 - 2, u1: u1 + t * 0.35 + 2, dessus: i % 2 === 0 }));
    if (o.zones) o.zones(zones.map((z) => ({ x: +C.X[clamp(Math.round((z.u0 + z.u1) / 3), 0, C.n - 1)].toFixed(1), u0: +z.u0.toFixed(1), u1: +z.u1.toFixed(1), dessus: z.dessus })));
    const kDe = (u) => clamp(Math.round(u / 1.5), k0, k1);
    const dessus = zones.filter((z) => z.dessus).map((z) => ruban(1, -1, kDe(z.u0), kDe(z.u1), 6)).join('');
    // la trame : chevrons (crêtes claires, creux sombres)
    let crete = '', creux = '';
    if (F.chevrons) {
      const pasT = w * 0.13;
      for (let m = 0, u = C.S[k0] + 1; u < C.S[k1] - w * 0.6; m++, u += pasT) {
        const k = kDe(u), h = demi(k) * 0.88, kb = kDe(u + demi(k) * 0.8);
        const seg = 'M' + fmt(P(k, h)) + 'L' + fmt(P(kb, 0)) + 'L' + fmt(P(k, -h));
        if (m % 2) crete += seg; else creux += seg;
      }
    }
    // les ferrets (tubes rigides dans l'axe du bout)
    const ferret = (k, sens) => {
      const tx = (C.X[Math.min(C.n - 1, k + 1)] - C.X[Math.max(0, k - 1)]) * sens, ty = (C.Y[Math.min(C.n - 1, k + 1)] - C.Y[Math.max(0, k - 1)]) * sens;
      const a = (Math.atan2(ty, tx) * 180) / Math.PI, flip = tx < 0 ? -1 : 1, rr = da / 2, tip = rr * 0.84;
      const corps = `M0 ${f1(-rr * 1.06)}L${f1(La - tip)} ${f1(-tip)}Q${f1(La + tip * 0.15)} ${f1(-tip)} ${f1(La + tip * 0.15)} 0Q${f1(La + tip * 0.15)} ${f1(tip)} ${f1(La - tip)} ${f1(tip)}L0 ${f1(rr * 1.06)}Z`;
      return `<g transform="translate(${f1(C.X[k])} ${f1(C.Y[k])}) rotate(${f1(a)}) scale(1 ${flip})">` +
        `<ellipse cx="${f1(La * 0.5 + 1.5)}" cy="${f1(rr + 1.8)}" rx="${f1(La * 0.55)}" ry="${f1(rr * 0.8)}" fill="#3A2410" opacity=".22" filter="url(#${id}f)"/>` +
        `<path d="${corps}" fill="url(#${id}a)" stroke="#000" stroke-opacity=".35" stroke-width=".5"/>` +
        `<path d="M1.6 ${f1(-rr * 0.46)}L${f1(La - tip * 0.9)} ${f1(-tip * 0.42)}" stroke="#fff" stroke-opacity=".7" stroke-width="${f1(Math.max(0.6, rr * 0.22))}" stroke-linecap="round" fill="none"/>` +
        `<path d="M1.4 ${f1(-rr)}V${f1(rr)}" stroke="#000" stroke-opacity=".4" stroke-width=".6"/></g>`;
    };
    const [vx, vy, vw, vh] = F.vb;
    const k = o.k || 1; // < 1 : on resserre autour du centre (zone sûre des icônes masquables)
    const cx = vx + vw / 2, cy = vy + vh / 2;
    const fond = o.fond ? `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" rx="${o.arrondi || 0}" fill="${o.fond}"/>` : '';
    const sombre = hex(melange(r, NOIR, 0.4)), tranche = hex(melange(r, NOIR, 0.32));
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vx} ${vy} ${vw} ${vh}" role="img" aria-label="CORDO63">` +
      `<defs>` +
      `<filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f1(w * 0.09)}"/></filter>` +
      `<linearGradient id="${id}a" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(-da / 2)}" x2="0" y2="${f1(da / 2)}">` +
      `<stop offset="0" stop-color="#070708"/><stop offset=".2" stop-color="#3C3C40"/><stop offset=".3" stop-color="#A5A5AC"/><stop offset=".4" stop-color="#2C2C30"/><stop offset=".75" stop-color="#131315"/><stop offset="1" stop-color="#040405"/></linearGradient>` +
      `<path id="${id}b" d="${ruban(1, -1)}"/>` +
      `<g id="${id}t">${lettresD}</g>` +
      `<clipPath id="${id}c"><use href="#${id}b" xlink:href="#${id}b"/></clipPath>` +
      `<clipPath id="${id}d"><path d="${dessus || 'M0 0'}"/></clipPath>` +
      `<mask id="${id}m" maskUnits="userSpaceOnUse" x="${vx}" y="${vy}" width="${vw}" height="${vh}"><g fill="none" stroke="#fff" stroke-width="${t}" stroke-linejoin="miter"><use href="#${id}t" xlink:href="#${id}t"/></g></mask>` +
      `<g id="${id}l">` +
      `<use href="#${id}b" xlink:href="#${id}b" fill="${tranche}" transform="translate(.3 ${f1(w * 0.06)})"/>` +
      `<use href="#${id}b" xlink:href="#${id}b" fill="${rougeHex}" stroke="${sombre}" stroke-width="${f1(w * 0.025)}"/>` +
      (crete ? `<path d="${creux}" fill="none" stroke="#000" stroke-opacity=".2" stroke-width="${f1(w * 0.04)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${crete}" fill="none" stroke="#fff" stroke-opacity=".15" stroke-width="${f1(w * 0.03)}" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
      (F.liseres === false ? '' : `<path d="${bord(0.8)}" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="${f1(w * 0.05)}" stroke-linecap="round"/>` +
      `<path d="${bord(-0.83)}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="${f1(w * 0.085)}" stroke-linecap="round"/>`) +
      `</g>` +
      `<g id="${id}o"><use href="#${id}b" xlink:href="#${id}b" fill="#2A1408" opacity=".28" transform="translate(${f1(w * 0.07)} ${f1(w * 0.14)})" filter="url(#${id}f)"/></g>` +
      `</defs>` +
      fond +
      `<g transform="translate(${f1(cx)} ${f1(cy)}) scale(${k}) translate(${f1(-cx)} ${f1(-cy)})">` +
      `<use href="#${id}o" xlink:href="#${id}o"/>` + // l'ombre du lacet sur le papier
      `<use href="#${id}l" xlink:href="#${id}l"/>` + // le lacet, dessous
      `<g clip-path="url(#${id}c)" opacity=".4"><g fill="none" stroke="#2A1408" stroke-width="${t}" transform="translate(${f1(t * 0.14)} ${f1(t * 0.28)})" filter="url(#${id}f)"><use href="#${id}t" xlink:href="#${id}t"/></g></g>` + // l'ombre des lettres sur le lacet
      `<g fill="none" stroke="${encre}" stroke-width="${t}" stroke-linejoin="miter"><use href="#${id}t" xlink:href="#${id}t"/></g>` + // les lettres
      `<g clip-path="url(#${id}d)"><g mask="url(#${id}m)"><use href="#${id}o" xlink:href="#${id}o"/></g><use href="#${id}l" xlink:href="#${id}l"/></g>` + // le lacet, dessus (et son ombre sur les traits)
      (F.ferrets === false || F.ferret0 === false ? '' : ferret(k0, -1)) + (F.ferrets === false ? '' : ferret(k1, 1)) +
      `</g></svg>`;
  }
  function logo(o) {
    const d = document.createElement('div');
    d.innerHTML = logoSVG(o);
    const s = d.firstChild;
    if (s) { s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.removeAttribute('role'); }
    return s;
  }

  CO.Lacets = { create, logo, logoSVG, sons, palette: (couleur) => palette({ couleur }), METAUX };
})();
