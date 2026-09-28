/* ==========================================================================
   Cordo 63 — noyau : hasard seedé, maths, couleurs, SVG, stockage, sons
   Scripts classiques (pas de modules) : le site s'ouvre aussi en file://
   ========================================================================== */
(function () {
  'use strict';

  const CO = (window.CO = window.CO || {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  CO.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Hasard déterministe (mulberry32) ---------- */
  CO.rng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
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

  /* FNV-1a : une chaîne → une graine */
  CO.hash = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  CO.newSeed = () => (Math.random() * 4294967296) >>> 0;

  /* Bruit simplex 2D seedé (Gustavson) → [-1, 1] */
  CO.noise2 = function (seed) {
    const r = CO.rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512), pm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
    const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - i + t, y0 = yin - j + t;
      const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, g;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { g = pm[ii + perm[jj]] * 2; tt *= tt; n += tt * tt * (G[g] * x0 + G[g + 1] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { g = pm[ii + i1 + perm[jj + j1]] * 2; tt *= tt; n += tt * tt * (G[g] * x1 + G[g + 1] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { g = pm[ii + 1 + perm[jj + 1]] * 2; tt *= tt; n += tt * tt * (G[g] * x2 + G[g + 1] * y2); }
      return 70 * n;
    };
  };

  /* ---------- Maths ---------- */
  CO.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  CO.lerp = (a, b, t) => a + (b - a) * t;
  CO.prog = (t, a, b) => CO.clamp((t - a) / (b - a)); // avancement de t dans [a, b]
  CO.TAU = Math.PI * 2;
  CO.angDiff = (a, b) => {
    let d = (a - b) % CO.TAU;
    if (d > Math.PI) d -= CO.TAU;
    if (d < -Math.PI) d += CO.TAU;
    return d;
  };

  CO.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };

  /* ---------- Couleurs ---------- */
  CO.hex2rgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  CO.rgb2hex = (r, g, b) =>
    '#' + [r, g, b].map((v) => Math.round(CO.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  CO.mix = (a, b, t) => {
    const A = CO.hex2rgb(a), B = CO.hex2rgb(b);
    return CO.rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  CO.shade = (c, amt) => (amt >= 0 ? CO.mix(c, '#ffffff', amt) : CO.mix(c, '#000000', -amt));

  /* ---------- SVG ---------- */
  CO.svg = function (tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  let uidCount = 0;
  CO.uid = (p) => (p || 'co') + (++uidCount).toString(36);

  const f = (n) => Math.round(n * 100) / 100;
  CO.f = f;

  /* Catmull-Rom fermé → courbes de Bézier. tension 0 = polygone, 1 = lisse */
  CO.closedPath = function (pts, tension = 1) {
    const n = pts.length;
    if (n < 3) return '';
    const k = tension / 6;
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) * k) + ' ' + f(p1[1] + (p2[1] - p0[1]) * k) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) * k) + ' ' + f(p2[1] - (p3[1] - p1[1]) * k) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  };

  /* Catmull-Rom ouvert (fissures, filets) */
  CO.openPath = function (pts) {
    const n = pts.length;
    if (n < 2) return '';
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  };

  /* ---------- Animation ---------- */
  CO.tween = (dur, fn, ease = CO.ease.linear) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - t0) / dur)); // (l'horodatage de l'image peut précéder t0)
        fn(ease(p), p);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  CO.wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Formats ---------- */
  const nfEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  CO.fmtPrice = (n) => nfEUR.format(n);
  CO.pad = (n, l = 4) => String(n).padStart(l, '0');

  /* Heure de Paris, quel que soit le fuseau du visiteur */
  CO.parisNow = function () {
    try {
      return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    } catch (e) {
      return new Date();
    }
  };

  CO.vibrate = (ms) => {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms);
    } catch (e) { /* iOS : pas de vibration */ }
  };

  /* ---------- Stockage local (maquette ; en prod → base de données) ---------- */
  CO.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('co:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('co:' + k, JSON.stringify(v)); } catch (e) { /* navigation privée */ }
    },
    del(k) {
      try { localStorage.removeItem('co:' + k); } catch (e) { /* idem */ }
    },
  };

  /* ---------- Petit bus d'événements ---------- */
  const listeners = {};
  CO.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn));
  CO.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));

  /* ---------- L'ambiance : les animations décoratives sans fin (feuillages, vapeur, reflets…) ----------
     Redessiner une scène SVG coûte cher, à chaque image : on ne les laisse pas tourner seules à 60 images/s.
     Chacune appartient à une scène (l'élément qui doit être à l'écran) ; on les avance nous-mêmes environ
     24 fois par seconde (sur ces mouvements lents, l'œil n'y voit rien), et seulement quand la scène se voit :
     son onglet est ouvert, elle est dans la fenêtre, la page est au premier plan. Sinon elles s'arrêtent
     net, et ne coûtent plus rien.
       CO.ambiance.anime(animation, scene)   une animation Web sans fin (mise en pause, puis avancée par nous)
       CO.ambiance.smil(svg, scene)          la ligne de temps SMIL d'un <svg>
       CO.ambiance.visible(scene)            la scène se voit-elle ? (pour les petites vies à minuteur)     */
  CO.ambiance = (function () {
    const PAS = 1000 / 24;
    const scenes = new Map(); // élément → { vue, dedans, anims, svgs }
    let vue = null, minuteur = 0, raf = 0, prec = 0;
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => {
      es.forEach((e) => { const s = scenes.get(e.target); if (s) s.dedans = e.isIntersecting; });
      relance();
    }) : null;
    function scene(el) {
      let s = scenes.get(el);
      if (!s) {
        const v = el.closest && el.closest('.view');
        s = { vue: v ? v.id : null, dedans: !io, anims: new Set(), svgs: new Set() };
        scenes.set(el, s);
        if (io) io.observe(el);
      }
      return s;
    }
    const active = (s) => s.dedans && (!s.vue || s.vue === vue);
    function image(now) {
      raf = 0;
      if (document.hidden) { prec = 0; return; }
      const dt = prec ? Math.min(PAS * 2, now - prec) : PAS; // au retour d'une pause : on reprend sans sauter
      prec = now;
      let encore = false;
      scenes.forEach((s, el) => {
        if (!el.isConnected) { scenes.delete(el); if (io) io.unobserve(el); return; }
        if (!active(s)) return;
        s.anims.forEach((a) => {
          const t = a.effect && a.effect.target;
          if (a.playState === 'idle' || (t && !t.isConnected)) { s.anims.delete(a); return; }
          a.currentTime = (a.currentTime || 0) + dt;
          encore = true;
        });
        s.svgs.forEach((svg) => { svg.setCurrentTime(svg.getCurrentTime() + dt / 1000); encore = true; });
      });
      if (encore) minuteur = setTimeout(demande, PAS - 12);
      else prec = 0;
    }
    function demande() { minuteur = 0; if (!raf) raf = requestAnimationFrame(image); }
    function relance() { if (!minuteur && !raf) demande(); }
    CO.on('view', (v) => { vue = v; relance(); });
    document.addEventListener('visibilitychange', relance);
    return {
      anime(a, el) {
        const t = el || (a && a.effect && a.effect.target);
        if (!a || !t) return a;
        a.pause();
        scene(t).anims.add(a);
        relance();
        return a;
      },
      smil(svg, el) {
        if (!svg || !svg.pauseAnimations) return;
        svg.pauseAnimations();
        scene(el || svg).svgs.add(svg);
        relance();
      },
      visible(el) {
        if (document.hidden) return false;
        const s = scenes.get(el);
        return s ? active(s) : true;
      },
    };
  })();



  /* ---------- Sons : le sound design de l'atelier, synthétisé (WebAudio, aucun fichier) ----------
     Doux et discrets : ils ne démarrent qu'après un premier geste, suivent le mode silencieux de
     l'iPhone et se coupent d'un geste (l'interrupteur en bas de l'onglet L'atelier).
     CO.sfx.play('nom', { delay, gain, … })   son ponctuel (delay en ms)
     CO.sfx.channel(gain)                     sous-bus qu'on coupe net (l'ambiance de la rue, la machine)
     Tout bouton ou lien sans son dédié fait un petit « toc » de cuir ; data-sfx="nom" en choisit un
     autre (data-sfx-i : sa note), data-sfx="none" le rend muet. */
  CO.sfx = (function () {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null, bus = null, noiseBuf = null;
    let on = CO.store.get('sound', true);
    let gestureAt = -1e9, lastAny = -1e9;
    const lastBy = {};

    function makeBus(c) {
      const master = c.createGain();
      master.gain.value = 0.85;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -14;
      lim.knee.value = 8;
      lim.ratio.value = 10;
      lim.attack.value = 0.002;
      lim.release.value = 0.12;
      master.connect(lim).connect(c.destination);
      return master;
    }

    function unlock() {
      gestureAt = performance.now();
      if (!on || !ACtx) return;
      if (!ctx) {
        try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* API absente */ }
        try {
          ctx = new ACtx();
          bus = makeBus(ctx);
        } catch (e) {
          ctx = null;
          return;
        }
      }
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        try {
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, 22050);
          s.connect(ctx.destination);
          s.start(0);
        } catch (e) { /* rien */ }
      }
    }
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((type) => {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else if (on) ctx.resume().catch(() => {});
    });

    function live() {
      if (!on || !ctx) return null;
      if (ctx.state === 'running') return ctx;
      if (ctx.state === 'suspended' && performance.now() - gestureAt < 400) return ctx;
      return null;
    }

    /* ---------- briques de synthèse ---------- */
    function noiseB(c) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseBuf;
    }
    function env(c, t, a, d, v, hold = 0) {
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setTargetAtTime(0, t + a + hold, d / 5);
      return g;
    }
    const tail = (t, a, d, hold = 0) => t + a + hold + d * 1.3 + 0.02;
    function tone(c, dst, t, { f, f2, glide, type = 'sine', a = 0.004, d = 0.15, v = 0.1, hold = 0 }) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide != null ? glide : a + d * 0.7));
      o.connect(env(c, t, a, d, v, hold)).connect(dst);
      o.start(t);
      o.stop(tail(t, a, d, hold));
    }
    function noise(c, dst, t, { f = 1200, f2, q = 0.8, type = 'bandpass', a = 0.004, d = 0.1, v = 0.08, hold = 0 }) {
      const src = c.createBufferSource();
      src.buffer = noiseB(c);
      src.loop = true;
      const flt = c.createBiquadFilter();
      flt.type = type;
      flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + hold + d);
      src.connect(flt).connect(env(c, t, a, d, v, hold)).connect(dst);
      src.start(t, Math.random() * 1.5);
      src.stop(tail(t, a, d, hold));
    }
    // corps résonnants : [rapport de fréquence, niveau, durée relative]
    const BODY = {
      wood: [[1, 1, 1], [2.45, 0.42, 0.5], [5.2, 0.12, 0.3]],
      bell: [[1, 1, 1], [2.76, 0.32, 0.55], [5.4, 0.12, 0.3], [8.93, 0.04, 0.18]],
      metal: [[1, 1, 1], [2.1, 0.55, 0.8], [3.7, 0.3, 0.6], [5.9, 0.14, 0.4]],
      anvil: [[1, 1, 1], [2.63, 0.5, 0.7], [4.11, 0.3, 0.5], [6.8, 0.16, 0.35], [9.4, 0.06, 0.2]],
      leather: [[1, 1, 1], [1.6, 0.3, 0.4]],
    };
    function strike(c, dst, t, f, body, { d = 0.3, v = 0.1, a = 0.002 } = {}) {
      BODY[body].forEach(([r, amp, dk]) => {
        if (f * r < 15000) tone(c, dst, t, { f: f * r, a, d: d * dk, v: v * amp });
      });
    }
    const PENTA = [0, 2, 4, 7, 9];
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const penta = (i, base = 72) => midi(base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5]);
    const rnd = (a, b) => a + Math.random() * (b - a);

    /* ---------- la palette (registre médium-aigu : les haut-parleurs de téléphone
       ne rendent presque rien sous 300 Hz) ---------- */
    const SOUNDS = {
      // --- l'appli
      tap(c, o, t) { // bouton quelconque : un doigt sur du cuir tendu, « toc » feutré
        strike(c, o, t, rnd(620, 680), 'leather', { d: 0.07, v: 0.07 });
        noise(c, o, t, { f: 2400, q: 1.2, a: 0.001, d: 0.02, v: 0.02 });
      },
      tab(c, o, t, { i = 0 }) { // onglets : un petit coup de marteau sur l'enclume, la note monte vers la droite
        const f = penta(i + 3, 79);
        strike(c, o, t, f, 'anvil', { d: 0.22, v: 0.04 });
        noise(c, o, t, { f: 3800, q: 1.5, a: 0.001, d: 0.015, v: 0.02 });
      },
      chip(c, o, t, { i = 0 }) { // un choix (service, filtre) : une petite frappe de poinçon
        strike(c, o, t, penta(i + 1, 76), 'metal', { d: 0.14, v: 0.04 });
        strike(c, o, t, 420, 'wood', { d: 0.04, v: 0.03 });
      },
      on(c, o, t) {
        strike(c, o, t, midi(79), 'bell', { d: 0.25, v: 0.05 });
        strike(c, o, t + 0.07, midi(86), 'bell', { d: 0.35, v: 0.05 });
      },
      open(c, o, t) { noise(c, o, t, { f: 380, f2: 1600, q: 0.9, a: 0.06, d: 0.18, v: 0.08 }); },
      close(c, o, t) { noise(c, o, t, { f: 1400, f2: 380, q: 0.9, a: 0.02, d: 0.15, v: 0.055 }); },
      pop(c, o, t) { tone(c, o, t, { f: 520, f2: 1080, glide: 0.05, a: 0.003, d: 0.08, v: 0.08 }); },
      up(c, o, t) { tone(c, o, t, { f: 900, f2: 1200, glide: 0.03, a: 0.002, d: 0.04, v: 0.045 }); },
      down(c, o, t) { tone(c, o, t, { f: 1100, f2: 820, glide: 0.03, a: 0.002, d: 0.04, v: 0.045 }); },
      page(c, o, t) { // un carnet qu'on feuillette
        noise(c, o, t, { f: 900, f2: 3200, q: 0.7, a: 0.05, d: 0.16, v: 0.05 });
        noise(c, o, t + 0.12, { f: 2600, f2: 1200, q: 0.9, a: 0.01, d: 0.07, v: 0.02 });
      },

      // --- l'atelier
      hammer(c, o, t, { v = 1 }) { // le marteau de cordonnier sur la semelle, posée sur la forme en fonte
        strike(c, o, t, rnd(1850, 2050), 'anvil', { d: 0.18, v: 0.05 * v });
        strike(c, o, t, rnd(380, 420), 'wood', { d: 0.06, v: 0.06 * v });
        noise(c, o, t, { f: 1800, q: 0.9, a: 0.001, d: 0.03, v: 0.07 * v });
      },
      nail(c, o, t, { i = 0 }) { // un clou planté dans la carte fidélité : deux coups, la note monte
        const f = midi(86 + [0, 2, 4, 7, 9][i % 5]);
        SOUNDS.hammer(c, o, t, { v: 0.6 });
        strike(c, o, t + 0.16, f, 'anvil', { d: 0.3, v: 0.04 });
        noise(c, o, t + 0.16, { f: 2200, q: 0.9, a: 0.001, d: 0.025, v: 0.05 });
      },
      knock(c, o, t) { // on toque sur la Jordan en bois
        strike(c, o, t, rnd(300, 340), 'wood', { d: 0.12, v: 0.09 });
        strike(c, o, t + 0.11, rnd(330, 360), 'wood', { d: 0.1, v: 0.07 });
      },
      cut(c, o, t, { dur = 0.35 }) { // le tranchet qui file dans le cuir
        noise(c, o, t, { f: 2600, f2: 3600, q: 2.2, a: 0.02, d: 0.06, hold: dur, v: 0.035 });
        noise(c, o, t, { f: 900, q: 1.4, a: 0.02, d: 0.05, hold: dur * 0.8, v: 0.012 });
      },
      snip(c, o, t) { // les ciseaux
        noise(c, o, t, { f: 4200, f2: 2800, q: 2.5, a: 0.002, d: 0.05, v: 0.05 });
        strike(c, o, t + 0.045, 2900, 'metal', { d: 0.05, v: 0.018 });
      },
      brush(c, o, t, { n = 4 }) { // la brosse qui frotte (nettoyage, cirage)
        for (let k = 0; k < n; k++) {
          noise(c, o, t + k * 0.16, { f: rnd(3000, 4200), q: 0.8, a: 0.04, d: 0.08, hold: 0.05, v: 0.03 });
        }
      },
      glue(c, o, t) { // le pinceau dans le pot de colle
        noise(c, o, t, { f: 700, f2: 1300, q: 1.6, a: 0.03, d: 0.12, hold: 0.1, v: 0.03 });
        tone(c, o, t + 0.05, { f: 420, f2: 300, glide: 0.1, a: 0.01, d: 0.08, v: 0.012 });
      },
      stamp(c, o, t) { // un tampon encreur
        strike(c, o, t, 240, 'wood', { d: 0.08, v: 0.08 });
        noise(c, o, t, { f: 900, q: 0.8, a: 0.001, d: 0.05, v: 0.05 });
      },
      tear(c, o, t, { dur = 0.5 }) { // le ticket qu'on détache le long des pointillés
        let tt = t;
        while (tt < t + dur) {
          noise(c, o, tt, { f: rnd(1800, 4200), q: rnd(1.2, 3.2), a: 0.001, d: rnd(0.01, 0.03), v: rnd(0.025, 0.05) });
          tt += rnd(0.012, 0.03);
        }
      },
      punch(c, o, t) { // l'emporte-pièce
        strike(c, o, t, 1300, 'metal', { d: 0.06, v: 0.05 });
        noise(c, o, t, { f: 2600, q: 1.1, a: 0.001, d: 0.03, v: 0.05 });
      },
      sew(c, o, t, { n = 8 }) { // la machine à coudre : le pied qui pique
        for (let k = 0; k < n; k++) {
          strike(c, o, t + k * 0.07, 900 + (k % 2) * 60, 'metal', { d: 0.03, v: 0.03 });
          noise(c, o, t + k * 0.07, { f: 1500, q: 1.1, a: 0.001, d: 0.02, v: 0.02 });
        }
      },
      grind(c, o, t, { dur = 0.9 }) { // la finisseuse rouge : les brosses qui tournent
        tone(c, o, t, { f: 180, f2: 240, glide: 0.25, type: 'sawtooth', a: 0.15, d: 0.3, hold: dur, v: 0.012 });
        noise(c, o, t, { f: 2400, q: 0.7, a: 0.2, d: 0.3, hold: dur, v: 0.025 });
      },
      keycut(c, o, t, { dur = 0.7 }) { // la machine à clés
        tone(c, o, t, { f: 2900, f2: 3300, glide: dur, type: 'triangle', a: 0.05, d: 0.2, hold: dur, v: 0.01 });
        noise(c, o, t, { f: 5200, q: 2, a: 0.05, d: 0.15, hold: dur, v: 0.02 });
      },
      bell(c, o, t, { v = 1 }) { // la clochette de la porte
        [0, 0.085, 0.16, 0.27].forEach((dt, k) => {
          const f = rnd(2380, 2470) * (k % 2 ? 1.0 : 1.012);
          strike(c, o, t + dt, f, 'bell', { d: 1.2 - k * 0.12, v: (0.05 - k * 0.007) * v });
          noise(c, o, t + dt, { f: 6200, type: 'highpass', a: 0.001, d: 0.012, v: 0.012 * v });
        });
      },
      lace(c, o, t) { // un lacet qu'on tire dans les œillets
        noise(c, o, t, { f: 1600, f2: 2600, q: 3, a: 0.02, d: 0.08, hold: 0.12, v: 0.025 });
      },

      // --- les commandes, le pavé, la carte
      key(c, o, t) { // touche du pavé
        tone(c, o, t, { f: 1050, a: 0.002, d: 0.035, v: 0.05 });
        noise(c, o, t, { f: 4200, type: 'highpass', a: 0.001, d: 0.01, v: 0.01 });
      },
      nope(c, o, t) {
        tone(c, o, t, { f: 466, f2: 440, type: 'triangle', a: 0.005, d: 0.08, v: 0.08 });
        tone(c, o, t + 0.13, { f: 415, f2: 392, type: 'triangle', a: 0.005, d: 0.1, v: 0.08 });
      },
      yes(c, o, t) {
        strike(c, o, t, midi(79), 'bell', { d: 0.35, v: 0.05 });
        strike(c, o, t + 0.075, midi(86), 'bell', { d: 0.5, v: 0.05 });
      },
      ding(c, o, t) { // c'est envoyé
        strike(c, o, t, midi(84), 'bell', { d: 0.7, v: 0.06 });
        strike(c, o, t + 0.11, midi(91), 'bell', { d: 0.9, v: 0.05 });
      },
      chime(c, o, t) { // carte pleine
        [72, 76, 79, 84, 88].forEach((m, k) => strike(c, o, t + k * 0.09, midi(m), k % 2 ? 'bell' : 'anvil', { d: k === 4 ? 1.1 : 0.45, v: 0.06 }));
      },
      flip(c, o, t) {
        noise(c, o, t, { f: 500, f2: 2200, q: 0.7, a: 0.08, d: 0.2, v: 0.055 });
        strike(c, o, t + 0.3, 520, 'wood', { d: 0.05, v: 0.04 });
      },
      flick(c, o, t) { noise(c, o, t, { f: 700, f2: 3000, q: 0.8, a: 0.03, d: 0.12, v: 0.07 }); },

      // --- le beat de l'atelier (l'ouverture) : une boucle boom-bap faite avec les outils
      kick(c, o, t, { v = 1 }) { // la forme en fonte frappée : grosse caisse
        tone(c, o, t, { f: 150, f2: 52, glide: 0.12, a: 0.002, d: 0.22, v: 0.22 * v });
        strike(c, o, t, 330, 'wood', { d: 0.05, v: 0.05 * v });
      },
      snare(c, o, t, { v = 1 }) { // le plat du marteau sur une semelle : caisse claire
        noise(c, o, t, { f: 1900, q: 0.7, a: 0.001, d: 0.14, v: 0.09 * v });
        strike(c, o, t, 820, 'leather', { d: 0.06, v: 0.05 * v });
      },
      hat(c, o, t, { v = 1 }) { // le cutter qu'on clique : charleston
        noise(c, o, t, { f: 7200, type: 'highpass', q: 0.7, a: 0.001, d: 0.03, v: 0.03 * v });
      },
      rim(c, o, t, { m = 79, v = 1 }) { // une note sur l'enclume (une par lettre du logo)
        strike(c, o, t, midi(m), 'anvil', { d: 0.4, v: 0.045 * v });
      },
    };
    const GAP = { key: 0, tear: 0, kick: 0, snare: 0, hat: 0, rim: 0, nail: 0, hammer: 30, open: 150, close: 150, brush: 80 };

    /* voix continues : la rue (l'accueil) */
    const VOICES = {
      street(c, dst) {
        const src = c.createBufferSource();
        src.buffer = noiseB(c);
        src.loop = true;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900;
        bp.Q.value = 0.5;
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 0.07;
        lg.gain.value = 260;
        lfo.connect(lg).connect(bp.frequency);
        const g = c.createGain();
        g.gain.value = 0;
        src.connect(bp).connect(g).connect(dst);
        src.start(c.currentTime, Math.random());
        lfo.start();
        let stopped = false;
        return {
          level(x) { g.gain.setTargetAtTime(0.012 * Math.max(0, Math.min(1, x)), c.currentTime, 0.6); },
          stop() {
            if (stopped) return;
            stopped = true;
            g.gain.setTargetAtTime(0, c.currentTime, 0.2);
            src.stop(c.currentTime + 1.2);
            lfo.stop(c.currentTime + 1.2);
          },
        };
      },
    };

    function emit(name, opts, dst) {
      lastAny = performance.now();
      const c = live(), fn = SOUNDS[name];
      if (!c || !fn || !dst) return;
      const now = performance.now();
      if (!(opts.delay > 0) && now - (lastBy[name] || -1e9) < (GAP[name] != null ? GAP[name] : 50)) return;
      lastBy[name] = now;
      if (window.CO_SFX_LOG) window.CO_SFX_LOG.push(name);
      let out = dst;
      if (opts.gain != null) {
        out = c.createGain();
        out.gain.value = opts.gain;
        out.connect(dst);
      }
      try {
        fn(c, out, c.currentTime + 0.005 + Math.max(0, opts.delay || 0) / 1000, opts);
      } catch (e) { /* audio indisponible */ }
    }
    const play = (name, opts = {}) => emit(name, opts, bus);

    function channel(gain = 1) {
      let node = null;
      const voices = new Set();
      const get = () => {
        const c = live();
        if (!c) return null;
        if (!node) {
          node = c.createGain();
          node.gain.value = gain;
          node.connect(bus);
        }
        return node;
      };
      return {
        play(name, opts = {}) { emit(name, opts, get()); },
        voice(name) {
          const dst = get();
          if (!dst || !VOICES[name]) return null;
          const v = VOICES[name](ctx, dst);
          voices.add(v);
          return v;
        },
        cut() {
          voices.forEach((v) => v.stop());
          voices.clear();
          if (!node) return;
          const n = node;
          node = null;
          n.gain.setTargetAtTime(0, n.context.currentTime, 0.03);
          setTimeout(() => n.disconnect(), 400);
        },
      };
    }

    let dispatchAt = 0;
    window.addEventListener('click', () => { dispatchAt = performance.now(); }, true);
    window.addEventListener('click', (e) => {
      if (lastAny >= dispatchAt) return;
      const el = e.target.closest && e.target.closest('button, a[href], summary, [role="button"], [data-sfx]');
      if (!el || el.disabled) return;
      const s = el.closest('[data-sfx]');
      const name = s ? s.dataset.sfx : 'tap';
      if (name !== 'none') play(name, { i: s && s.dataset.sfxI ? +s.dataset.sfxI : 0 });
    });

    const latency = () => (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) + 0.005 : 0);

    /* les modules peuvent ajouter leurs sons (les machines de l'atelier, les lacets, les clous…) :
       CO.sfx.ajouter('nom', (c, dst, t, opts, o) => { o.strike(c, dst, t, 440, 'anvil', {…}) }, { gap: 40 })
       CO.sfx.ajouterVoix('nom', (c, dst, o) => ({ level(x) {}, stop() {} }))  une voix continue (moteur)
       o = les outils de la palette : tone, noise, strike, env, noiseB, midi, penta, rnd, BODY */
    const OUTILS = { tone, noise, strike, env, noiseB, midi, penta, rnd, BODY };
    function ajouter(nom, fn, { gap } = {}) {
      SOUNDS[nom] = (c, o, t, opts) => fn(c, o, t, opts, OUTILS);
      if (gap != null) GAP[nom] = gap;
    }
    function ajouterVoix(nom, fn) { VOICES[nom] = (c, dst) => fn(c, dst, OUTILS); }

    return {
      play, channel, unlock, latency, ajouter, ajouterVoix,
      existe: (nom) => !!SOUNDS[nom],
      supported: !!ACtx,
      get on() { return on; },
      set on(v) {
        on = !!v;
        CO.store.set('sound', on);
        if (on) unlock();
        else if (ctx) ctx.suspend().catch(() => {});
      },
    };
  })();
})();
