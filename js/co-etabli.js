/* ==========================================================================
   Cordo 63 — l'établi : la vue de dessus du plan de travail de Clément
   Le plateau d'aggloméré, le tapis de découpe vert posé un peu de biais (un
   coin rebique), et tout ce qui traîne dans les coins et le long du fond :
   pots de colle, boîtes de teinture, cônes de fil, chutes de cuir, la tasse…
   Au centre, une place libre où l'appli range au cordeau (knolling) les
   objets du service choisi. Même lumière partout (la vitrine en haut à
   gauche), rendu pixel par pixel par co-rendu.js et co-outils.js.

   Le décor (établi, tapis, encombrement) est calculé une fois, par tranches,
   puis gardé (mémoire et téléphone) : c'est une seule image. Seuls les objets
   posés par l'appli sont animés.

   CO.Etabli.create(host, options) → Promise<établi>
     options : { disposition: 'services' (défaut) | 'vide', graine: 63, ppm (imposé, px/mm), encombrement: true }
       'services' : l'encombrement dans les coins et le long du fond, la place libre au centre
       'vide'     : le tapis seul
       La vue s'adapte à la forme de `host` (bandeau large et bas ou vue haute) : la place libre garde
       au moins 330 × 200 mm, l'encombrement se range autour et déborde du cadre.
   établi.poser(id, { x, y, angle, anime = true }) → Promise   pose un objet de CO.Outils.liste : il tombe,
          rebondit, son ombre se resserre, un son selon la matière. Sans x/y : rangé au cordeau dans la place
          libre avec les autres (une ou deux rangées). x, y : mm depuis le centre de la place libre, dans les
          axes du tapis ; angle : degrés (sens horaire), dans les axes du tapis. Reposer un objet déjà là le
          déplace.
   établi.retirer(id) → Promise           l'objet se soulève et s'efface (les autres se resserrent)
   établi.vider() → Promise               retire tout ce qui a été posé
   établi.montrer(id) → { x, y, w, h, cx, cy, ecran }  l'objet se soulève et respire un instant ; son
          rectangle en px CSS relatifs à `host` (ecran : relatif à la fenêtre, pour une étiquette fixe)
   établi.rect(id) → le même rectangle, sans animation
   établi.on('tap', fn(id)) → désabonnement   on a touché un objet posé (id) ; fn(null) si c'est l'établi
   établi.on('pret', fn())                le décor est affiché (après create, ou après un redimensionnement)
   établi.objets                          les ids posés, dans l'ordre : ['talons', 'patins']
   établi.redimensionner()                (fait tout seul quand `host` change de taille)
   établi.detruire()
   CO.Etabli.prechauffer({ largeur, hauteur, disposition, graine })  calcule le décor et les objets des
          services aux temps morts (à appeler au chargement de la page : l'établi s'affichera tout de suite)
   CO.Etabli.SERVICES                     les objets associés à chaque service

   Rien ne tourne quand l'établi n'est pas visible (hors écran, autre onglet, page cachée) :
   ni calcul, ni animation.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const R = CO.R, O = CO.Outils;
  if (!R || !O) throw new Error('co-etabli.js : charger co-rendu.js et co-outils.js avant');

  const DEG = Math.PI / 180;
  const BIAIS = -3.2; // degrés : le tapis un peu de biais, comme sur ses photos
  const TAPIS = { W: 660, H: 470 };
  const LIBRE = { w: 330, h: 200 }; // la place libre minimale (mm)

  /* les objets de chaque service (pour l'appli) */
  const SERVICES = {
    talons: ['talons', 'patins'],
    ressemelage: ['semelle-cuir', 'tranchet'],
    couture: ['alene', 'fil', 'pot-colle'],
    sneakers: ['sneaker', 'brosse'],
    cirage: ['creme', 'chiffon'],
    maroquinerie: ['fermeture'],
    cles: ['cles'],
    lacets: ['lacets'],
  };

  /* ce qui traîne sur l'établi : [id, poids, où (fond : le long du fond ; coin ; bord : n'importe où autour)] */
  const TRAINE = [
    ['pot-pinceau', 3, 'fond'], ['mug', 3, 'fond'], ['boite-teinture', 2, 'fond'], ['boite-teinture', 2, 'coin'],
    ['cone-fil', 2, 'fond'], ['cone-fil', 2, 'coin'], ['ruban', 2, 'coin'], ['pot-colle', 2, 'fond'],
    ['creme', 2, 'coin'], ['coupelle-clous', 2, 'coin'], ['talon-bloc', 2, 'bord'], ['chutes-cuir', 3, 'bord'],
    ['chutes-gomme', 3, 'bord'], ['cale-poncer', 2, 'coin'], ['crayons', 2, 'bord'], ['tickets-pile', 2, 'coin'],
    ['telephone', 1, 'coin'], ['reglet', 2, 'bord'], ['alene', 1, 'bord'], ['fil', 1, 'coin'], ['chiffon', 2, 'coin'],
    ['pinceau', 1, 'bord'], ['brosse', 1, 'coin'], ['marteau', 2, 'bord'], ['pince', 1, 'bord'], ['ciseaux', 1, 'bord'],
    ['cutter', 1, 'bord'], ['tranchet', 1, 'bord'], ['patins', 1, 'coin'], ['semelle-gomme', 1, 'bord'],
  ];

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));

  /* ======================================================================
     La vue : du monde (mm, origine au centre de la place libre) aux pixels
     ====================================================================== */
  function vue(largeur, hauteur, disposition, ppmImpose) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const b = BIAIS * DEG;
    const vide = disposition === 'vide';
    let s, fx, fy, cy;
    if (vide) {
      // le tapis entier, un peu d'établi autour
      s = Math.min(largeur / (TAPIS.W + 40), hauteur / (TAPIS.H + 60));
      fx = 0.7; fy = 0.62; cy = 0.5;
    } else {
      // la place libre au centre (un peu plus bas que le milieu : le fond de l'établi est plus encombré)
      fx = 0.64; fy = 0.54; cy = 0.55;
      s = Math.min((fx * largeur) / LIBRE.w, (fy * hauteur) / LIBRE.h);
    }
    const ppm = ppmImpose || Math.round(s * dpr * 20) / 20;
    s = ppm / dpr;
    const W = Math.round(largeur * dpr), H = Math.round(hauteur * dpr);
    const Vw = largeur / s, Vh = hauteur / s;
    const x0 = -Vw / 2, y0 = -Vh * cy; // le coin haut-gauche de la vue, dans le monde
    const libre = { x: 0, y: 0, w: Math.max(LIBRE.w, fx * Vw), h: Math.max(LIBRE.h, fy * Vh) };
    // le tapis : il déborde à droite et en bas ; l'établi se voit en haut et à gauche, avec le coin qui rebique
    let tapis;
    if (vide) tapis = { x: 0, y: 0, angle: b, W: TAPIS.W, H: TAPIS.H, coin: 0 };
    else {
      // un tapis à la mesure de la vue (plus grand qu'un A2 dans une vue haute) ; l'établi reste visible devant
      const mg = Math.min(46, Vw * 0.09), mh = Math.min(36, Vh * 0.08);
      const TW = Math.max(TAPIS.W, Math.min(900, Vw - mg + 140)), TH = Math.max(TAPIS.H, Math.min(620, Vh - mh - 20));
      tapis = { x: x0 + mg + TW / 2, y: y0 + mh + TH / 2, angle: b, W: Math.round(TW), H: Math.round(TH), coin: 0 };
    }
    return {
      dpr, s, ppm, W, H, largeur, hauteur, Vw, Vh, x0, y0, biais: b, libre, tapis,
      cx: x0 + Vw / 2, cy: y0 + Vh / 2, // l'appareil photo, au-dessus du centre de la vue
      avant: y0 + Vh + 45, // le bord avant de l'établi, juste sous le cadre
      bx0: x0, by0: y0,
    };
  }

  /* ======================================================================
     L'encombrement : tiré au sort (graine), autour de la place libre, jamais dedans
     ====================================================================== */
  function encombrer(V, graine) {
    const rng = R.rng((graine * 2654435761) >>> 0);
    const L = V.libre, marge = 16;
    const lx0 = L.x - L.w / 2 - marge, lx1 = L.x + L.w / 2 + marge, ly0 = L.y - L.h / 2 - marge, ly1 = L.y + L.h / 2 + marge;
    const vx0 = V.x0, vy0 = V.y0, vx1 = V.x0 + V.Vw, vy1 = V.y0 + V.Vh;
    const poses = [];
    // la boîte d'un objet tourné (demi-côtés, repère du monde)
    const boite = (id, a) => {
      const d = O.info(id).dim, c = Math.abs(Math.cos(a * DEG)), s = Math.abs(Math.sin(a * DEG));
      return [(d[0] * c + d[1] * s) / 2, (d[0] * s + d[1] * c) / 2];
    };
    const chevauche = (x, y, hx, hy) => {
      let pire = 0;
      for (const p of poses) {
        const ox = Math.min(x + hx, p.x + p.hx) - Math.max(x - hx, p.x - p.hx);
        const oy = Math.min(y + hy, p.y + p.hy) - Math.max(y - hy, p.y - p.hy);
        if (ox > 0 && oy > 0) pire = Math.max(pire, (ox * oy) / Math.min(hx * hy * 4, p.hx * p.hy * 4));
      }
      return pire;
    };
    // la liste : tirée selon les poids, sans trop de doublons
    const sac = [];
    for (const [id, p, ou] of TRAINE) if (O.defs[id]) for (let k = 0; k < p; k++) sac.push({ id, ou });
    for (let i = sac.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [sac[i], sac[j]] = [sac[j], sac[i]]; }
    const vus = {};
    const surface = V.Vw * V.Vh - L.w * L.h;
    let couvert = 0;
    for (const it of sac) {
      if ((vus[it.id] || 0) >= (it.id === 'cone-fil' || it.id === 'boite-teinture' || it.id === 'chutes-cuir' || it.id === 'chutes-gomme' ? 2 : 1)) continue;
      if (couvert > surface * 0.85) break;
      const long = O.info(it.id).dim[0] > 180;
      for (let essai = 0; essai < 36; essai++) {
        // un angle : les objets longs suivent à peu près les bords, les autres n'importe comment
        const a = long ? (rng() < 0.5 ? 0 : 90) + rng.range(-12, 12) : rng.range(-180, 180);
        const [hx, hy] = boite(it.id, a);
        // où : le long du fond (en haut), dans un coin, ou sur un bord ; on peut déborder du cadre
        let x, y;
        const u = rng();
        const zone = it.ou === 'fond' ? (u < 0.75 ? 'fond' : 'coin') : it.ou === 'coin' ? (u < 0.65 ? 'coin' : u < 0.85 ? 'avant' : 'fond') : u < 0.35 ? 'cote' : u < 0.6 ? 'coin' : u < 0.8 ? 'avant' : 'fond';
        if (zone === 'avant') { // devant la place libre (le bord de l'établi, côté Clément)
          x = rng.range(vx0 - hx * 0.3, vx1 + hx * 0.3);
          y = rng.range(Math.min(ly1 + hy, vy1), vy1 + hy * 0.45);
        } else if (zone === 'fond') {
          x = rng.range(vx0 - hx * 0.3, vx1 + hx * 0.3);
          y = rng.range(vy0 - hy * 0.45, Math.max(vy0 + hy * 0.2, ly0 - hy));
        } else if (zone === 'coin') {
          const droite = rng() < 0.5, bas = rng() < 0.35;
          x = droite ? rng.range(Math.min(lx1 + hx * 0.4, vx1), vx1 + hx * 0.45) : rng.range(vx0 - hx * 0.45, Math.max(lx0 - hx * 0.4, vx0));
          y = bas ? rng.range(Math.min(ly1 + hy * 0.3, vy1), vy1 + hy * 0.45) : rng.range(vy0 - hy * 0.45, vy0 + (vy1 - vy0) * 0.3);
        } else {
          const droite = rng() < 0.5;
          x = droite ? rng.range(lx1 + hx * 0.6, vx1 + hx * 0.4) : rng.range(vx0 - hx * 0.4, lx0 - hx * 0.6);
          y = rng.range(vy0, vy1);
        }
        // jamais dans la place libre ; au moins un bon tiers dans le cadre
        if (x + hx > lx0 && x - hx < lx1 && y + hy > ly0 && y - hy < ly1) continue;
        const visX = Math.min(x + hx, vx1) - Math.max(x - hx, vx0), visY = Math.min(y + hy, vy1) - Math.max(y - hy, vy0);
        if (visX <= 0 || visY <= 0 || (visX * visY) / (4 * hx * hy) < 0.35) continue;
        // des tas, oui, mais pas les uns entièrement sur les autres
        if (chevauche(x, y, hx, hy) > (zone === 'coin' ? 0.45 : 0.3)) continue;
        poses.push({ id: it.id, x, y, angle: a, hx, hy, haut: O.info(it.id).dim[2], k: poses.length });
        vus[it.id] = (vus[it.id] || 0) + 1;
        couvert += Math.min(4 * hx * hy, visX * visY);
        break;
      }
    }
    // l'ordre de pose : les choses plates d'abord (les chutes, les tickets), les hautes par-dessus
    poses.sort((a, b) => a.haut - b.haut || a.k - b.k);
    return poses.map((p, k) => ({ id: p.id, x: p.x, y: p.y, angle: Math.round(p.angle * 2) / 2, graine: graine * 31 + k, oeil: [V.cx - p.x, V.cy - p.y] }));
  }

  /* ======================================================================
     Un établi
     ====================================================================== */
  function Etabli(host, opts) {
    this.host = host;
    this.opts = Object.assign({ disposition: 'services', graine: 63, encombrement: true }, opts || {});
    this.objets = new Map(); // id → objet posé
    this.ordre = [];
    this.ecoute = { tap: [], pret: [] };
    this.visible = true;
    this.anims = new Set();
    this.raf = 0;
    this.fond = null;
    this.gen = 0; // génération (redimensionnement : les calculs périmés s'ignorent)
    const cv = (this.cv = document.createElement('canvas'));
    cv.className = 'co-etabli';
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:manipulation;';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', "L'établi de Clément : le tapis de découpe, ses outils et tout ce qui traîne autour");
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.insertBefore(cv, host.firstChild);
    this.g = cv.getContext('2d');
    this._pointeurs();
    this._observer();
  }

  /** la clé du décor (fond + tapis + encombrement) pour une vue */
  function cleFond(V, opts) {
    return ['fond2', opts.disposition, opts.graine, opts.encombrement ? 1 : 0, V.W + 'x' + V.H, V.ppm.toFixed(2), BIAIS, O.empreinte()].join('|');
  }
  /** l'établi et le tapis (générateur) */
  function* genBase(V, opts) {
    return yield* O.fond({
      cadre: { bx0: V.bx0, by0: V.by0, w: V.W, h: V.H }, ppm: V.ppm, graine: opts.graine,
      tapis: V.tapis, avant: V.avant, oeil: { x: V.cx, y: V.cy },
    });
  }
  /** ce qui traîne, posé sur une copie de la base (générateur) ; un peu moins défini que le centre
      (80 % de la résolution) : comme la profondeur de champ d'une photo, les bords sont plus doux */
  function* composer(base, enc, V) {
    const c = R.canvas(base.width, base.height), g = c.getContext('2d');
    g.drawImage(base, 0, 0);
    const ppm = Math.round(V.ppm * 0.8 * 20) / 20;
    for (const it of enc) {
      yield 'encombrement:' + it.id;
      const o = { ppm, angle: it.angle || 0, graine: it.graine, oeil: it.oeil };
      const k = O.cle(it.id, o);
      let sp = R.cache.get(k);
      if (!sp) sp = R.cache.set(k, yield* O.construireG(it.id, o));
      R.poser(g, sp, (it.x - V.bx0) * V.ppm, (it.y - V.by0) * V.ppm, { s: V.ppm / sp.ppm });
    }
    return c;
  }
  /** le décor complet (établi + tapis + encombrement) d'une vue : générateur d'une traite (banc d'essai) */
  function* genFond(V, opts) {
    const base = yield* genBase(V, opts);
    const enc = opts.disposition === 'vide' || !opts.encombrement ? [] : encombrer(V, opts.graine);
    return { canvas: enc.length ? yield* composer(base.canvas, enc, V) : base.canvas };
  }
  /**
   * Le décor d'une vue : mémoire, téléphone, ou calcul (prio > 0 : tout de suite ; ≤ 0 : aux temps morts).
   * surBase(canvas) : appelé dès que l'établi et le tapis sont prêts (l'encombrement vient ensuite).
   */
  async function decor(V, opts, prio, surBase) {
    const cle = cleFond(V, opts);
    const c = R.cache.get(cle);
    if (c) return c.canvas;
    const v = await R.coffre.get(cle);
    if (v) {
      const cv = await R.dePNG(v);
      if (cv) { R.cache.set(cle, { canvas: cv, px: cv.width * cv.height }); return cv; }
    }
    const base = await R.lancer(genBase(V, opts), { prio, cle: cle + '|base' });
    const enc = opts.disposition === 'vide' || !opts.encombrement ? [] : encombrer(V, opts.graine);
    let tout = base.canvas;
    if (enc.length) {
      if (surBase) surBase(base.canvas);
      tout = await R.lancer(composer(base.canvas, enc, V), { prio, cle: cle + '|encombrement' });
    }
    R.cache.set(cle, { canvas: tout, px: V.W * V.H });
    R.versPNG(tout).then((b) => b && R.coffre.put(cle, b));
    return tout;
  }

  Etabli.prototype = {
    /* ---------- démarrage ---------- */
    async demarrer() {
      await this._mettreEnPage();
      idle(() => this._prechauffer()); // les objets des services, aux temps morts : poser() sera immédiat
      return this;
    },

    async _mettreEnPage() {
      const r = this.host.getBoundingClientRect();
      const larg = Math.max(40, r.width || this.host.clientWidth || 360), haut = Math.max(40, r.height || this.host.clientHeight || 300);
      const gen = ++this.gen;
      const V = (this.V = vue(larg, haut, this.opts.disposition, this.opts.ppm));
      this.cv.width = V.W;
      this.cv.height = V.H;
      this.dessiner();
      // d'abord l'établi et le tapis ; l'encombrement arrive ensuite, en fondu
      const promesses = [decor(V, this.opts, 3, (base) => {
        if (gen !== this.gen) return;
        this.fond = base;
        this.dessiner();
      }).then((c) => {
        if (gen !== this.gen) return;
        if (this.fond && this.fond !== c) this._fondu(this.fond);
        this.fond = c;
      })];
      for (const o of this.objets.values()) { o.sp = null; promesses.push(this._sprite(o, 3)); }
      await Promise.all(promesses);
      if (gen !== this.gen) return;
      for (const p of this._ranger()) { p.o.x = p.x; p.o.y = p.y; }
      this.dessiner();
      (this.ecoute.pret || []).forEach((fn) => fn());
    },

    /* le décor complet arrive : fondu depuis l'ancien */
    _fondu(avant) {
      this.fondAvant = avant;
      this.fonduT = 0;
      this._anim(null, 450, (t) => { this.fonduT = t; }, () => { this.fondAvant = null; });
    },

    /* ---------- les objets posés ---------- */
    _ajouter(id, { x = 0, y = 0, angle = 0 }) {
      const o = { id, x, y, angle, sp: null, levee: 0, alpha: 1, dx: 0, dy: 0, auto: true, sortie: false };
      this.objets.set(id, o);
      this.ordre.push(id);
      return o;
    },
    _monde(o) { // (x, y) de l'objet dans le monde (mm)
      const V = this.V, [X, Y] = rot(o.x + o.dx, o.y + o.dy, V.biais);
      return [V.libre.x + X, V.libre.y + Y];
    },
    _optsSprite(o) {
      // l'appareil est au-dessus du centre de la vue : vu depuis l'objet, il est là (mm, axes de l'écran)
      const V = this.V, [X, Y] = rot(o.x, o.y, V.biais);
      return { ppm: V.ppm, angle: BIAIS + o.angle, graine: this.opts.graine, oeil: [V.cx - V.libre.x - X, V.cy - V.libre.y - Y] };
    },
    async _sprite(o, prio) {
      const gen = this.gen;
      const sp = await O.preparer(o.id, this._optsSprite(o), prio);
      if (gen === this.gen && this.objets.get(o.id) === o) o.sp = sp;
      return sp;
    },
    _position(o) { // l'origine de l'objet, en px du canvas
      const V = this.V, [X, Y] = this._monde(o);
      return [(X - V.bx0) * V.ppm, (Y - V.by0) * V.ppm];
    },

    /* la place libre : les objets posés sans coordonnées y sont rangés au cordeau (une ou deux rangées) */
    _ranger() {
      const L = this.V.libre, gap = 22;
      const libres = this.ordre.map((id) => this.objets.get(id)).filter((o) => o.auto && !o.sortie);
      if (!libres.length) return [];
      const dims = libres.map((o) => {
        const inf = O.info(o.id);
        const a = ((o.angle % 180) + 180) % 180;
        return a > 45 && a < 135 ? [inf.dim[1], inf.dim[0]] : [inf.dim[0], inf.dim[1]];
      });
      let rangs = [libres.map((o, i) => i)];
      const largeur = (idx) => idx.reduce((s, i) => s + dims[i][0], 0) + gap * (idx.length - 1);
      if (largeur(rangs[0]) > L.w - 20 && libres.length > 1) {
        let best = null;
        const tous = libres.map((o, i) => i);
        for (let k = 1; k < libres.length; k++) {
          const a = tous.slice(0, k), b = tous.slice(k), m = Math.max(largeur(a), largeur(b));
          if (!best || m < best.m) best = { a, b, m };
        }
        rangs = [best.a, best.b];
      }
      const hauteurs = rangs.map((r) => Math.max(...r.map((i) => dims[i][1])));
      const Ht = hauteurs.reduce((s, h) => s + h, 0) + gap * (rangs.length - 1);
      let y = -Ht / 2;
      const places = [];
      rangs.forEach((r, k) => {
        let x = -largeur(r) / 2;
        for (const i of r) {
          places.push({ o: libres[i], x: x + dims[i][0] / 2, y: y + hauteurs[k] / 2 });
          x += dims[i][0] + gap;
        }
        y += hauteurs[k] + gap;
      });
      return places;
    },

    /* ---------- animations ---------- */
    _anim(o, duree, fn, fin) {
      const a = { o, t0: performance.now(), duree, fn, fin };
      this.anims.add(a);
      this._boucle();
      return a;
    },
    _boucle() {
      if (this.raf || !this.visible) return;
      const pas = (now) => {
        this.raf = 0;
        if (!this.visible) return;
        for (const a of [...this.anims]) {
          const t = Math.min(1, (now - a.t0) / a.duree);
          a.fn(t, a.o);
          if (t >= 1) {
            this.anims.delete(a);
            if (a.fin) a.fin();
          }
        }
        this.dessiner();
        if (this.anims.size) this.raf = requestAnimationFrame(pas);
      };
      this.raf = requestAnimationFrame(pas);
    },
    /* la chute : de 55 mm, accélérée, puis un petit rebond ; le son au contact */
    _chute(o) {
      return new Promise((resolve) => {
        let touche = false;
        o.levee = 55;
        o.alpha = 0;
        this._anim(o, 620, (t) => {
          if (t < 0.6) {
            const u = t / 0.6;
            o.levee = 55 * (1 - u * u);
            o.alpha = Math.min(1, u * 3);
          } else {
            if (!touche) {
              touche = true;
              const inf = O.info(o.id);
              if (inf && inf.son && CO.sfx) CO.sfx.play(inf.son);
              if (CO.vibrate) CO.vibrate(8);
            }
            const u = (t - 0.6) / 0.4;
            o.levee = 3.2 * Math.sin(Math.PI * u) * (1 - u * 0.3);
            o.alpha = 1;
          }
        }, () => { o.levee = 0; o.alpha = 1; resolve(); });
      });
    },
    _glisser(o, x, y) {
      if (Math.abs(o.x - x) < 0.5 && Math.abs(o.y - y) < 0.5) return Promise.resolve();
      const x0 = o.x + o.dx, y0 = o.y + o.dy;
      o.x = x; o.y = y;
      o.dx = x0 - x; o.dy = y0 - y;
      return new Promise((resolve) => {
        const dx0 = o.dx, dy0 = o.dy;
        this._anim(o, 480, (t) => {
          const e = easeInOut(t);
          o.dx = dx0 * (1 - e);
          o.dy = dy0 * (1 - e);
          o.levee = 9 * Math.sin(Math.PI * t);
        }, () => { o.dx = o.dy = 0; o.levee = 0; resolve(); });
      });
    },

    /* ---------- l'API ---------- */
    async poser(id, { x, y, angle, anime = true } = {}) {
      if (!O.defs[id]) throw new Error('Objet inconnu : ' + id);
      const auto = x == null || y == null;
      let o = this.objets.get(id);
      const deja = !!(o && !o.sortie);
      if (!o) {
        o = this._ajouter(id, { angle: angle || 0 });
        o.alpha = 0;
      } else {
        o.sortie = false;
        if (angle != null && angle !== o.angle) { o.angle = angle; o.sp = null; }
      }
      o.auto = auto;
      if (!auto) { o.x = x; o.y = y; }
      this.ordre = this.ordre.filter((k) => k !== id).concat(id); // au premier plan
      await this._sprite(o, 3);
      // la place libre se range (les autres glissent), puis il tombe
      const mouvements = [];
      for (const p of this._ranger()) {
        if (p.o === o && !deja) { o.x = p.x; o.y = p.y; } else mouvements.push(this._glisser(p.o, p.x, p.y));
      }
      if (!deja) {
        if (anime && !CO.reduced) await this._chute(o);
        else { o.alpha = 1; o.levee = 0; this.dessiner(); }
      }
      await Promise.all(mouvements);
      this.dessiner();
    },

    retirer(id) {
      const o = this.objets.get(id);
      if (!o || o.sortie) return Promise.resolve();
      o.sortie = true;
      const places = this._ranger();
      return new Promise((resolve) => {
        const l0 = o.levee;
        this._anim(o, 380, (t) => {
          o.levee = l0 + 45 * easeOut(t);
          o.alpha = 1 - t * t;
        }, () => {
          if (this.objets.get(id) === o && o.sortie) {
            this.objets.delete(id);
            this.ordre = this.ordre.filter((k) => k !== id);
          }
          this.dessiner();
          resolve();
        });
        for (const p of places) this._glisser(p.o, p.x, p.y);
      });
    },

    vider() {
      return Promise.all([...this.objets.keys()].map((id) => this.retirer(id)));
    },

    montrer(id) {
      const o = this.objets.get(id);
      if (!o || !o.sp) return null;
      const r = this.rect(id);
      this._anim(o, 1700, (t) => {
        const monte = Math.min(1, t / 0.18), descend = t > 0.8 ? (t - 0.8) / 0.2 : 0;
        const souffle = t > 0.18 && t < 0.8 ? Math.sin(((t - 0.18) / 0.62) * Math.PI * 2) * 2.2 : 0;
        o.levee = (11 * easeOut(monte) + souffle) * (1 - easeInOut(descend));
      }, () => { o.levee = 0; });
      return r;
    },

    /** le rectangle de l'objet (au repos), px CSS relatifs à host ; ecran : relatif à la fenêtre */
    rect(id) {
      const o = this.objets.get(id);
      if (!o || !o.sp) return null;
      const sp = o.sp, V = this.V, s = V.ppm / sp.ppm;
      const m = R.masqueDe(sp);
      let i0 = m.w, j0 = m.h, i1 = -1, j1 = -1;
      for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.a[j * m.w + i] > 80) {
        if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
      }
      if (i1 < 0) { i0 = 0; j0 = 0; i1 = m.w - 1; j1 = m.h - 1; }
      const [px, py] = this._position(Object.assign({}, o, { dx: 0, dy: 0 }));
      const ox = px - sp.ax * V.ppm, oy = py - sp.ay * V.ppm;
      const x = (ox + i0 * m.k * s) / V.dpr, y = (oy + j0 * m.k * s) / V.dpr;
      const w = ((i1 - i0 + 1) * m.k * s) / V.dpr, h = ((j1 - j0 + 1) * m.k * s) / V.dpr;
      const hr = this.host.getBoundingClientRect();
      return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, ecran: { left: hr.left + x, top: hr.top + y, width: w, height: h, right: hr.left + x + w, bottom: hr.top + y + h } };
    },

    on(ev, fn) {
      (this.ecoute[ev] = this.ecoute[ev] || []).push(fn);
      return () => { this.ecoute[ev] = this.ecoute[ev].filter((f) => f !== fn); };
    },

    async redimensionner() {
      const r = this.host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (this.V && Math.abs(r.width - this.V.largeur) < 1 && Math.abs(r.height - this.V.hauteur) < 1 && Math.min(2, window.devicePixelRatio || 1) === this.V.dpr) return;
      this.fond = null;
      await this._mettreEnPage();
    },

    detruire() {
      this.gen++;
      cancelAnimationFrame(this.raf);
      if (this.ro) this.ro.disconnect();
      if (this.io) this.io.disconnect();
      document.removeEventListener('visibilitychange', this._vis);
      this.cv.remove();
      this.objets.clear();
    },

    /* ---------- le dessin ---------- */
    dessiner() {
      if (!this.visible) { this.sale = true; return; }
      const g = this.g, V = this.V;
      if (!V) return;
      const W = this.cv.width, H = this.cv.height;
      if (this.fond) {
        if (this.fondAvant) {
          g.drawImage(this.fondAvant, 0, 0, W, H);
          g.globalAlpha = this.fonduT;
          g.drawImage(this.fond, 0, 0, W, H);
          g.globalAlpha = 1;
        } else g.drawImage(this.fond, 0, 0, W, H);
      } else {
        g.fillStyle = '#231b16';
        g.fillRect(0, 0, W, H);
      }
      const liste = this.ordre.map((id) => this.objets.get(id)).filter((o) => o && o.sp && o.alpha > 0.001);
      liste.sort((a, b) => (a.levee > 1 ? 1 : 0) - (b.levee > 1 ? 1 : 0)); // ce qui est en l'air passe devant
      for (const o of liste) {
        const [x, y] = this._position(o);
        R.poser(g, o.sp, x, y, { objet: false, levee: o.levee, alpha: o.alpha, s: V.ppm / o.sp.ppm });
      }
      for (const o of liste) {
        const [x, y] = this._position(o);
        R.poser(g, o.sp, x, y, { ombre: false, levee: o.levee, alpha: o.alpha, s: V.ppm / o.sp.ppm });
      }
      R.photo(g, W, H, { foyer: [0.26, 0.1], force: 0.62, grain: 0.9 });
      this.sale = false;
    },

    /* ---------- le doigt ---------- */
    _pointeurs() {
      let d = null;
      this.cv.addEventListener('pointerdown', (e) => { d = { x: e.clientX, y: e.clientY, t: performance.now() }; });
      this.cv.addEventListener('pointerup', (e) => {
        if (!d) return;
        const bouge = Math.hypot(e.clientX - d.x, e.clientY - d.y), long = performance.now() - d.t;
        d = null;
        if (bouge > 10 || long > 700) return;
        const id = this.toucher(e.clientX, e.clientY);
        (this.ecoute.tap || []).forEach((fn) => fn(id));
      });
    },
    /** quel objet posé est sous ce point (coordonnées de la fenêtre) ? */
    toucher(cx, cy) {
      const V = this.V;
      if (!V) return null;
      const r = this.cv.getBoundingClientRect();
      const px = (cx - r.left) * (this.cv.width / r.width), py = (cy - r.top) * (this.cv.height / r.height);
      for (let k = this.ordre.length - 1; k >= 0; k--) {
        const o = this.objets.get(this.ordre[k]);
        if (!o || !o.sp || o.sortie) continue;
        const sp = o.sp, s = V.ppm / sp.ppm;
        const [x, y] = this._position(o);
        const m = R.masqueDe(sp);
        const u = ((px - x) / s + sp.ax * sp.ppm) / m.k, v = ((py - y) / s + sp.ay * sp.ppm) / m.k;
        const tol = Math.max(1, Math.round((3 * sp.ppm) / m.k)); // le doigt est gros : un peu de tolérance
        let best = 0;
        for (let dj = -tol; dj <= tol; dj++) for (let di = -tol; di <= tol; di++) {
          const i = Math.round(u) + di, j = Math.round(v) + dj;
          if (i < 0 || j < 0 || i >= m.w || j >= m.h) continue;
          if (m.a[j * m.w + i] > best) best = m.a[j * m.w + i];
        }
        if (best > 90) return o.id;
      }
      return null;
    },

    /* ---------- visible ou non : rien ne tourne quand on ne le voit pas ---------- */
    _observer() {
      let t = 0;
      if (window.ResizeObserver) {
        this.ro = new ResizeObserver(() => {
          clearTimeout(t);
          t = setTimeout(() => this.redimensionner(), 160);
        });
        this.ro.observe(this.host);
      }
      const vueEl = this.host.closest ? this.host.closest('.view') : null;
      this.vueId = vueEl ? vueEl.id : null;
      this.vueActive = null;
      this.dedans = true;
      if (window.IntersectionObserver) {
        this.io = new IntersectionObserver((es) => {
          es.forEach((e) => { this.dedans = e.isIntersecting; });
          this._maj();
        });
        this.io.observe(this.host);
      }
      if (CO.on) CO.on('view', (v) => { this.vueActive = v; this._maj(); });
      this._vis = () => this._maj();
      document.addEventListener('visibilitychange', this._vis);
    },
    _maj() {
      const v = this.dedans && !document.hidden && (!this.vueId || !this.vueActive || this.vueActive === this.vueId);
      if (v === this.visible) return;
      this.visible = v;
      R.pause(!v);
      if (v) {
        if (this.sale) this.dessiner();
        if (this.anims.size) this._boucle();
      } else if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
    },

    /* aux temps morts : les objets des services, à la taille de cet écran */
    _prechauffer() {
      if (!this.V) return;
      const V = this.V;
      const ids = [...new Set(Object.values(SERVICES).flat())].filter((id) => O.defs[id]);
      for (const id of ids) {
        if (this.objets.has(id)) continue;
        O.preparer(id, { ppm: V.ppm, angle: BIAIS, graine: this.opts.graine, oeil: [V.cx - V.libre.x, V.cy - V.libre.y] }, 0).catch(() => {});
      }
    },
  };

  /* ======================================================================
     L'API
     ====================================================================== */
  function api(E) {
    return {
      poser: (id, o) => E.poser(id, o),
      retirer: (id) => E.retirer(id),
      vider: () => E.vider(),
      montrer: (id) => E.montrer(id),
      rect: (id) => E.rect(id),
      on: (ev, fn) => E.on(ev, fn),
      redimensionner: () => E.redimensionner(),
      detruire: () => E.detruire(),
      get objets() { return E.ordre.filter((id) => { const o = E.objets.get(id); return o && !o.sortie; }); },
      get canvas() { return E.cv; },
      get vue() { return E.V; },
      _E: E,
    };
  }

  CO.Etabli = {
    SERVICES,
    BIAIS,
    TRAINE,
    async create(host, opts) {
      const E = new Etabli(host, opts);
      await E.demarrer();
      return api(E);
    },
    /** calcule le décor d'une vue de largeur × hauteur px CSS, et les objets des services, aux temps morts */
    prechauffer({ largeur = 390, hauteur = 320, disposition = 'services', graine = 63, encombrement = true } = {}) {
      const V = vue(largeur, hauteur, disposition);
      decor(V, { disposition, graine, encombrement }, 0).catch(() => {});
      for (const id of [...new Set(Object.values(SERVICES).flat())]) {
        if (O.defs[id]) O.preparer(id, { ppm: V.ppm, angle: BIAIS, graine, oeil: [V.cx - V.libre.x, V.cy - V.libre.y] }, 0).catch(() => {});
      }
    },
    _vue: vue,
    _encombrer: encombrer,
    _genFond: genFond,
    _genBase: genBase,
  };
})();
