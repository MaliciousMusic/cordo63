/* ==========================================================================
   Cordo 63 — la boutique vue de l'intérieur : Clément à ses machines
   « J'inverse l'atelier et la boutique avec l'ambition que l'on me voie travailler. Je suis ma
   vitrine. » On vient de passer la vitrine : de l'autre côté du comptoir, le mur de pierre, la
   presse bleue, la finisseuse rouge (SUR mini II), l'établi et son pied de fer, la machine à
   coudre, le coin des baskets, les clés ; et Clément qui va de l'un à l'autre, dans une grande
   boucle au hasard (js/co-clement.js le dessine, js/co-boutique-decor.js peint le décor).
   Le canevas, en calques de profondeur (une vraie parallaxe : chaque calque a sa distance) :
     plafond (poutres, peint à chaque image) → mur (une image) → machines (images) → Clément
     → meubles devant lui → ses bras, ce qu'il tient → le comptoir du premier plan (planches en
     perspective) et ses objets → la lumière (lampes, poussière, soir).
   La caméra suit Clément (travelling, approche, bascule) ; à ~30 images/s, et plus rien du tout
   quand la scène ne se voit pas (pause(), vue cachée, page cachée, hors écran) : sons coupés.

   À inclure après co-core.js (co-brand.js facultatif : le logo de l'imposte) :
     js/co-clement.js, js/co-boutique-decor.js, js/co-boutique.js (s'ils manquent, co-boutique.js
     charge lui-même les deux premiers, à côté de lui).

   CO.Boutique.create(host, { nuit, graine }) → Promise<scène>   (nuit : sinon ?soir / ?nuit dans l'adresse)
     La création peint le décor par tranches (pas de longue tâche) ; la scène est immobile jusqu'à jouer().
     scène.jouer() · pause() · reprise() · detruire()
     scène.entree({ ms }) · sortie({ ms }) · zoomEtabli({ ms }) · dezoom({ ms })      → Promise
     scène.on('clement' | 'cible' | 'activite', fn) → désabonnement ; 'cible' : 'radio', 'carnet',
       'photos', 'etageres', 'porte' ; 'activite' : l'id de l'activité qui commence
       (finisseuse, marteau, nettoyage, presse, couture, cles, colle, pause)
     scène.clement.regarder() → Promise · parler(on) · reprendre() · tete() → { x, y, haut } (px, fenêtre)
     (et pour le labo : faire(id), setNuit(on), activites, etat())
   CO.reduced : une image arrêtée (le marteau levé) ; le toucher marche toujours (il se tourne, parle).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const E = {
    lin: (t) => t, io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2), in: (t) => t * t, out: (t) => 1 - (1 - t) * (1 - t),
    sin: (t) => -(Math.cos(Math.PI * t) - 1) / 2, out3: (t) => 1 - Math.pow(1 - t, 3), in3: (t) => t * t * t,
  };
  const ANNULE = { annule: true };

  /* ---------- les deux compagnons (chargés d'ici si la page ne les a pas) ---------- */
  const ICI = (document.currentScript && document.currentScript.src) || '';
  function charger(nom) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = ICI ? ICI.replace(/co-boutique\.js(\?.*)?$/, nom + '$1') : 'js/' + nom;
      s.onload = res;
      s.onerror = () => rej(new Error('chargement ' + nom));
      document.head.appendChild(s);
    });
  }

  /* ======================================================================
     Les sons de l'atelier (synthétisés ; ajoutés à la palette de co-core)
     ====================================================================== */
  let sonsPrets = false;
  function preparerSons() {
    if (sonsPrets || !CO.sfx || !CO.sfx.ajouter) return;
    sonsPrets = true;
    const S = CO.sfx;
    // le moteur de la finisseuse : un bourdon (harmoniques audibles sur un téléphone) + le souffle des brosses
    S.ajouterVoix('bq-moteur', (c, dst, o) => {
      const osc = c.createOscillator(), osc2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      osc.type = 'sawtooth'; osc2.type = 'square';
      osc.frequency.value = 45; osc2.frequency.value = 90.5;
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.8;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      osc.connect(lp); osc2.connect(g2).connect(lp);
      const src = c.createBufferSource(); src.buffer = o.noiseB(c); src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
      const gn = c.createGain(); gn.gain.value = 0;
      src.connect(bp).connect(gn).connect(g);
      lp.connect(g);
      g.gain.value = 0;
      g.connect(dst);
      osc.start(); osc2.start(); src.start(c.currentTime, Math.random());
      let fini = false;
      return {
        level(x) {
          const v = clamp(x, 0, 1), t = c.currentTime;
          osc.frequency.setTargetAtTime(28 + 30 * v, t, 0.25);
          osc2.frequency.setTargetAtTime(56 + 61 * v, t, 0.25);
          lp.frequency.setTargetAtTime(400 + 900 * v, t, 0.2);
          gn.gain.setTargetAtTime(0.9 * v, t, 0.2);
          g.gain.setTargetAtTime(0.022 * Math.sqrt(v), t, 0.18);
        },
        stop() {
          if (fini) return; fini = true;
          const t = c.currentTime;
          g.gain.setTargetAtTime(0, t, 0.12);
          [osc, osc2, src].forEach((n) => n.stop(t + 0.8));
        },
      };
    });
    // le frottement contre une brosse ou une meule (semelle, clé) : un bruit qui grince, modulé
    S.ajouterVoix('bq-meule', (c, dst, o) => {
      const src = c.createBufferSource(); src.buffer = o.noiseB(c); src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.1;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const g = c.createGain(); g.gain.value = 0;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 11; lg.gain.value = 0;
      lfo.connect(lg).connect(g.gain);
      src.connect(bp).connect(hp).connect(g).connect(dst);
      src.start(c.currentTime, Math.random()); lfo.start();
      let fini = false;
      return {
        level(x, aigu = 0) {
          const t = c.currentTime, v = clamp(x, 0, 1);
          g.gain.setTargetAtTime(0.03 * v, t, 0.06);
          lg.gain.setTargetAtTime(0.012 * v, t, 0.06);
          bp.frequency.setTargetAtTime(2200 + aigu * 2600 + v * 400, t, 0.08);
        },
        stop() { if (fini) return; fini = true; g.gain.setTargetAtTime(0, c.currentTime, 0.05); src.stop(c.currentTime + 0.5); lfo.stop(c.currentTime + 0.5); },
      };
    });
    // la machine à coudre : le moteur qui file, et le cliquetis de l'aiguille
    S.ajouterVoix('bq-couture', (c, dst, o) => {
      const osc = c.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 180;
      const gm = c.createGain(); gm.gain.value = 0;
      const src = c.createBufferSource(); src.buffer = o.noiseB(c); src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 2;
      const gc = c.createGain(); gc.gain.value = 0;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 14;
      const lg = c.createGain(); lg.gain.value = 0;
      lfo.connect(lg).connect(gc.gain);
      src.connect(bp).connect(gc).connect(dst);
      osc.connect(gm).connect(dst);
      osc.start(); src.start(c.currentTime, Math.random()); lfo.start();
      let fini = false;
      return {
        level(x) {
          const t = c.currentTime, v = clamp(x, 0, 1);
          lfo.frequency.setTargetAtTime(6 + 12 * v, t, 0.1);
          osc.frequency.setTargetAtTime(140 + 120 * v, t, 0.15);
          lg.gain.setTargetAtTime(0.03 * v, t, 0.05);
          gm.gain.setTargetAtTime(0.008 * v, t, 0.1);
        },
        stop() { if (fini) return; fini = true; const t = c.currentTime; lg.gain.setTargetAtTime(0, t, 0.04); gm.gain.setTargetAtTime(0, t, 0.05); [osc, src, lfo].forEach((n) => n.stop(t + 0.5)); },
      };
    });
    const A = (nom, fn, gap) => S.ajouter(nom, fn, { gap });
    A('bq-clic', (c, d, t, op, o) => { o.strike(c, d, t, 1900, 'metal', { d: 0.04, v: 0.035 }); o.noise(c, d, t, { f: 3000, q: 1, a: 0.001, d: 0.015, v: 0.03 }); }, 40);
    A('bq-air', (c, d, t, op, o) => { // la presse : un « pschhh » d'air comprimé
      const dur = op.dur || 0.7;
      o.noise(c, d, t, { f: 5200, type: 'highpass', q: 0.7, a: 0.02, d: dur * 0.6, hold: dur * 0.3, v: 0.05 });
      o.noise(c, d, t, { f: 2600, f2: 1800, q: 0.8, a: 0.03, d: dur * 0.5, v: 0.025 });
    }, 120);
    A('bq-levier', (c, d, t, op, o) => { o.strike(c, d, t, 620, 'metal', { d: 0.09, v: 0.05 }); o.strike(c, d, t, 260, 'wood', { d: 0.06, v: 0.05 }); o.noise(c, d, t, { f: 1500, q: 1, a: 0.001, d: 0.03, v: 0.04 }); }, 80);
    A('bq-souffle', (c, d, t, op, o) => { o.noise(c, d, t, { f: 900, f2: 500, q: 0.6, a: 0.05, d: 0.28, hold: 0.08, v: 0.05 }); o.noise(c, d, t, { f: 2800, q: 0.8, a: 0.04, d: 0.2, v: 0.018 }); }, 200);
    A('bq-mousse', (c, d, t, op, o) => { o.noise(c, d, t, { f: 4200, type: 'highpass', q: 0.6, a: 0.005, d: 0.18, hold: 0.12, v: 0.05 }); o.noise(c, d, t + 0.05, { f: 1300, q: 1.4, a: 0.02, d: 0.25, v: 0.012 }); }, 150);
    A('bq-frotte', (c, d, t, op, o) => { for (let k = 0; k < 3; k++) o.noise(c, d, t + k * 0.18, { f: 1400 + k * 200, q: 0.7, a: 0.06, d: 0.1, hold: 0.04, v: 0.02 }); }, 120);
    A('bq-lime', (c, d, t, op, o) => { for (let k = 0; k < 2; k++) o.noise(c, d, t + k * 0.2, { f: 3800, f2: 5200, q: 2.4, a: 0.02, d: 0.08, hold: 0.07, v: 0.035 }); }, 100);
    A('bq-stylo', (c, d, t, op, o) => { for (let k = 0; k < 6; k++) o.noise(c, d, t + k * 0.09 + Math.random() * 0.03, { f: 2600 + Math.random() * 1200, q: 3, a: 0.004, d: 0.05, v: 0.018 }); }, 120);
    A('bq-gorgee', (c, d, t, op, o) => { o.noise(c, d, t, { f: 700, f2: 1400, q: 2, a: 0.03, d: 0.12, v: 0.02 }); o.tone(c, d, t + 0.25, { f: 320, f2: 220, glide: 0.08, a: 0.01, d: 0.07, v: 0.02 }); }, 300);
    A('bq-pose', (c, d, t, op, o) => { o.strike(c, d, t, 300 + Math.random() * 80, 'wood', { d: 0.06, v: 0.05 * (op.v || 1) }); o.noise(c, d, t, { f: 1200, q: 0.8, a: 0.001, d: 0.02, v: 0.03 * (op.v || 1) }); }, 60);
    A('bq-pas', (c, d, t, op, o) => { o.strike(c, d, t, 180 + Math.random() * 40, 'wood', { d: 0.05, v: 0.025 }); o.noise(c, d, t, { f: 700, q: 0.7, a: 0.002, d: 0.04, v: 0.012 }); }, 120);
    A('bq-clou', (c, d, t, op, o) => { o.strike(c, d, t, 3400, 'metal', { d: 0.03, v: 0.018 }); }, 50);
    A('bq-etau', (c, d, t, op, o) => { o.strike(c, d, t, 1200, 'metal', { d: 0.05, v: 0.04 }); o.noise(c, d, t + 0.02, { f: 2400, q: 2, a: 0.01, d: 0.08, v: 0.02 }); }, 80);
  }

  /* ======================================================================
     L'horloge de la scène : le temps n'avance que quand on la voit
     ====================================================================== */
  function Horloge() {
    let t = 0;
    const taches = new Set();
    return {
      get t() { return t; },
      avance(dt) {
        t += dt;
        for (const k of Array.from(taches)) {
          const annule = k.jeton && k.jeton.annule;
          if (annule && (k.dur == null || k.coupe)) { taches.delete(k); k.rej(ANNULE); continue; }
          if (k.dur != null) {
            const p = clamp((t - k.debut) / k.dur, 0, 1);
            k.fn(k.ease(p), p);
            if (p >= 1) { taches.delete(k); k.res(); }
          } else if (t >= k.fin) { taches.delete(k); k.res(); }
        }
      },
      attendre(ms, jeton) {
        return new Promise((res, rej) => { if (jeton && jeton.annule) { rej(ANNULE); return; } taches.add({ fin: t + ms, res, rej, jeton }); });
      },
      /** un geste : fn(e, p) à chaque image ; il va au bout même si on l'interrompt (sauf « coupe ») */
      tween(ms, fn, ease = E.lin, jeton = null, coupe = false) {
        return new Promise((res, rej) => {
          if (jeton && jeton.annule) { rej(ANNULE); return; }
          fn(ease(0), 0);
          taches.add({ debut: t, dur: Math.max(1, ms), fn, ease, res, rej, jeton, coupe });
        });
      },
      vider() { taches.forEach((k) => k.rej(ANNULE)); taches.clear(); },
    };
  }

  /* ======================================================================
     La scène
     ====================================================================== */
  async function create(host, opts = {}) {
    if (!CO.Clement) await charger('co-clement.js');
    if (!CO.BoutiqueDecor) await charger('co-boutique-decor.js');
    try {
      await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), CO.wait(1500)]);
      const fams = [police('--chiffres', ''), police('--sans', ''), police('--stylo', '')].map((f) => f.split(',')[0].trim()).filter(Boolean);
      await Promise.race([Promise.all(fams.map((f) => document.fonts.load(`700 20px ${f}`).catch(() => null))), CO.wait(1200)]);
    } catch (e) { /* polices : repli */ }
    preparerSons();
    const D = CO.BoutiqueDecor, K = D.D;
    const { C, STATIONS } = D;
    const { rgba, lin, rad, rr, tache, toile, motif } = D.outils;
    const FAM = police('--chiffres', 'sans-serif'), FAM_SANS = police('--sans', 'sans-serif');
    const graine = opts.graine == null ? 63 : opts.graine;
    const R = CO.rng(graine), RV = CO.rng(graine * 7 + 1); // le hasard (seedé) ; RV : la vie courante
    const reduit = !!CO.reduced;
    const VITESSE = +opts.vitesse || 1; // (tests : le temps accéléré)

    /* ---------- le DOM : le canevas, les zones à toucher ---------- */
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    host.style.overflow = 'hidden';
    const racine = document.createElement('div');
    racine.className = 'co-boutique';
    racine.style.cssText = 'position:absolute;inset:0;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:pan-y';
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:pan-y';
    cv.setAttribute('aria-hidden', 'true');
    racine.appendChild(cv);
    const style = document.createElement('style');
    style.textContent = '.co-boutique .cb-cible{position:absolute;left:0;top:0;margin:0;padding:0;border:0;background:transparent;cursor:pointer;touch-action:pan-y;-webkit-tap-highlight-color:transparent;border-radius:14px;outline:none}' +
      '.co-boutique .cb-cible:focus-visible{box-shadow:0 0 0 2px rgba(255,233,176,.9),0 0 0 5px rgba(43,36,32,.5)}' +
      '.co-boutique .cb-cible[hidden]{display:none}';
    racine.appendChild(style);
    host.appendChild(racine);
    const ctx = cv.getContext('2d');

    /* ---------- les mesures, la caméra ---------- */
    let W = 0, H = 0, dpr = 1, s0 = 1, Yh0 = 0;
    const cam = { x: STATIONS.etabli.cam, d: STATIONS.etabli.zoom, tilt: 0.12, cx: STATIONS.etabli.cam, cd: STATIONS.etabli.zoom, ct: 0.12 }; // c… : la cible
    function mesurer() {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || 2);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      s0 = Math.min(W / K.VUE, H / 330);
      Yh0 = 0.8 * H - (K.OEIL - K.HAUT_COMPTOIR) * s0 * (K.D_LANE / K.D_COMPTOIR);
    }
    const sig = (d) => K.D_LANE / Math.max(14, d - cam.d);
    /** la bascule qui met le point y (plan de Clément) à la fraction f de la hauteur, pour une approche donnée */
    const tiltPour = (y, dolly, f) => (Yh0 - (f * H - (y + K.OEIL) * s0 * K.D_LANE / Math.max(14, K.D_LANE - dolly))) / H;
    const Yh = () => Yh0 - cam.tilt * H;
    /** un point du monde (x, y) à la profondeur d → px dans l'hôte */
    function ecran(x, y, d = K.D_LANE) { const s = s0 * sig(d); return [W / 2 + (x - cam.x) * s, Yh() + (y + K.OEIL) * s]; }
    /** le repère du monde au plan d, pour dessiner en cm */
    function repere(d = K.D_LANE) {
      const s = s0 * sig(d);
      ctx.setTransform(s * dpr, 0, 0, s * dpr, (W / 2 - cam.x * s) * dpr, (Yh() + K.OEIL * s) * dpr);
    }
    /** quelle abscisse la caméra doit viser pour qu'un point x du plan de Clément soit au centre */
    const bornesCam = (d) => { const demi = W / 2 / (s0 * K.D_LANE / Math.max(14, K.D_LANE - d)); return [K.MONDE.x0 + demi + 4, K.MONDE.x1 - demi - 4]; };

    /* ---------- les images du décor (peintes une fois, à la bonne résolution) ---------- */
    const SP = {};
    let fileSprites = null; // quand elle existe : les images à peindre plus tard, par tranches
    const TEMPS_SPRITE = {};
    function sprite(nom, x, y, w, h, q, peindre) {
      if (fileSprites) { fileSprites.push(() => sprite(nom, x, y, w, h, q, peindre)); return null; }
      const t0 = performance.now();
      const Rz = s0 * dpr * q;
      const c = toile(w * Rz, h * Rz), g = c.getContext('2d');
      g.setTransform(Rz, 0, 0, Rz, -x * Rz, -y * Rz);
      const r = peindre(g);
      // (Chrome enregistre les dessins et ne les pixellise qu'au premier usage : on force la pixellisation
      //  ici, par tranches, plutôt qu'à la première image, qui figerait tout d'un coup)
      const pixelliser = () => { try { petit().drawImage(c, 0, 0, 1, 1); } catch (e) { /* rien */ } };
      const fin = () => { if (pasAPas) pixelliser(); TEMPS_SPRITE[nom] = Math.round(performance.now() - t0); return (SP[nom] = { c, x, y, w, h }); };
      if (r && typeof r.next === 'function') { // un peintre pas à pas (générateur)
        if (pasAPas) return { iter: r, fin, pixelliser };
        while (!r.next().done);
      }
      return fin();
    }
    let pasAPas = false, petitCtx = null;
    const petit = () => petitCtx || (petitCtx = toile(1, 1).getContext('2d'));
    /** tout peindre, en rendant la main entre deux images (pas de longue tâche qui fige l'accueil) */
    async function peindreToutDoucement(abandon = () => false) {
      fileSprites = [];
      peindreTout();
      const file = [() => ({ iter: D.prechauffer(), fin() {} }), () => ({ iter: CO.Clement.prechauffer(), fin() {} })].concat(fileSprites);
      fileSprites = null;
      const repos = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 120 }) : setTimeout(r, 16)));
      let t = performance.now();
      pasAPas = true;
      try {
        for (const f of file) {
          if (abandon()) return;
          const r = f();
          if (r && r.iter) {
            while (!r.iter.next().done) {
              if (r.pixelliser) r.pixelliser();
              if (performance.now() - t > 24) { await repos(); t = performance.now(); }
            }
            r.fin();
          }
          if (performance.now() - t > 24) { await repos(); t = performance.now(); }
        }
      } finally { pasAPas = false; }
    }
    function poser(sp, d, alpha = 1) {
      if (!sp) return;
      const s = s0 * sig(d);
      let X = W / 2 + (sp.x - cam.x) * s, Y = Yh() + (sp.y + K.OEIL) * s, Wd = sp.w * s, Hd = sp.h * s;
      // on ne copie que la partie visible (le mur est grand)
      const x0 = Math.max(0, X), y0 = Math.max(0, Y), x1 = Math.min(W, X + Wd), y1 = Math.min(H, Y + Hd);
      if (x1 <= x0 || y1 <= y0) return;
      const kx = sp.c.width / Wd, ky = sp.c.height / Hd;
      // (la source strictement dans l'image : Safari n'en dessine rien sinon)
      const sx = clamp((x0 - X) * kx, 0, sp.c.width), sy = clamp((y0 - Y) * ky, 0, sp.c.height);
      const sw = Math.min(sp.c.width - sx, (x1 - x0) * kx), sh = Math.min(sp.c.height - sy, (y1 - y0) * ky);
      if (sw < 0.5 || sh < 0.5) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp.c, sx, sy, sw, sh, x0 * dpr, y0 * dpr, (x1 - x0) * dpr, (y1 - y0) * dpr);
      ctx.globalAlpha = 1;
    }
    const LAMPES = [
      { x: 48, y: -226, c: '#232323', l: 16 }, { x: 166, y: -224, c: '#232323', l: 18 }, { x: 303, y: -198, c: '#2F5A47', l: 22 },
      { x: 412, y: -222, c: '#232323', l: 17 }, { x: 540, y: -216, c: '#6B4A33', l: 20 },
    ];
    let nuit = opts.nuit != null ? !!opts.nuit : /[?&](soir|nuit)(=|&|$)/.test(location.search);
    function peindreTout() {
      const rr2 = CO.rng(graine + 5);
      sprite('mur', -60, -300, 820, 302, 0.72, function* (g) {
        yield* D.peindreMurPas(g, -60, 760, -300, false, LAMPES);
        D.peindreClim(g, 24, -262);
        D.planche(g, 128, -190, 60);
        D.basket(g, 132, -190, 17, D.PAIRES[0]); D.basket(g, 151, -190, 17, D.PAIRES[5]); D.basket(g, 170, -190, 16, D.PAIRES[1]);
        D.peindreArmoire(g, 256, -208);
        D.planche(g, 300, -216, 150);
        let px = 304;
        [3, 8, 4, 0, 6, 2, 7].forEach((k) => { D.basket(g, px, -216, 17 + rr2() * 2, D.PAIRES[k]); px += 20.5; });
        D.peindreRatelier(g, 262, -152, 84);
        D.peindrePolaroids(g, 354, -178, rr2);
        D.peindrePendule(g, 470, -188, FAM);
        D.peindreCles(g, 510, -176, 40, 46);
        D.peindreEtageres(g, 572, -212, 66, rr2);
        D.peindreSac(g, 648, -182);
      });
      SP.small = null;
      sprite('small', 196, -250, 70, 90, 0.9, (g) => D.peindreSmall(g, 234, -206, false, FAM));
      sprite('porteJour', 650, -238, 64, 240, 0.9, (g) => D.peindrePorte(g, 660, -232, 46, 232, false, FAM));
      sprite('porteNuit', 650, -238, 64, 240, 0.9, (g) => D.peindrePorte(g, 660, -232, 46, 232, true, FAM));
      sprite('presse', 2, -200, 92, 204, 1.35, (g) => D.peindrePresse(g));
      sprite('finisseuse', 88, -236, 148, 240, 1.35, (g) => D.peindreFinisseuse(g, FAM));
      sprite('etabli', 244, -128, 118, 130, 1.6, (g) => D.peindreEtabli(g, FAM));
      sprite('couture', 366, -142, 92, 144, 1.4, (g) => D.peindreCouture(g));
      sprite('nettoyage', 460, -122, 68, 124, 1.4, (g) => D.peindreNettoyage(g));
      sprite('cles', 530, -146, 94, 148, 1.4, (g) => D.peindreComptoirCles(g));
      LAMPES.forEach((L, i) => sprite('lampe' + i, L.x - L.l / 2 - 2, L.y - 112, L.l + 4, 118, 1.3, (g) => D.peindreLampe(g, L.x, L.y, L.c, L.l)));
      // les objets du comptoir (plan D_OBJETS), posés sur le plateau
      const qo = 1.9, HC = -K.HAUT_COMPTOIR;
      const obj = (nom, x, w, h, fn) => sprite(nom, x, HC - h + 3, w, h, qo, (g) => fn(g, HC));
      obj('o-semelles', 8, 40, 26, (g, y) => D.peindreSemelles(g, 12, y));
      obj('o-sac', 232, 34, 52, (g, y) => D.peindreSacPapier(g, 236, y));
      obj('o-boite', 112, 44, 28, (g, y) => D.peindreBoite(g, 116, y));
      obj('o-radio', D.RADIO.x - 4, 38, 32, (g, y) => D.peindreRadio(g, D.RADIO.x, y));
      obj('o-pot', 318, 26, 20, (g, y) => D.peindrePot(g, 322, y, FAM_SANS));
      obj('o-tablette', 451, 48, 24, (g, y) => D.peindreTablette(g, 455, y));
      obj('o-carnet', D.CARNET.x - 4, 50, 18, (g, y) => D.peindreCarnet(g, D.CARNET.x, y, FAM, CO.rng(9)));
      obj('o-sonnette', 604, 16, 16, (g, y) => D.peindreSonnette(g, 612, y));
      obj('o-cirages', 636, 34, 14, (g, y) => D.peindreCirages(g, 640, y));
      obj('o-plante', 680, 22, 30, (g, y) => D.peindrePlante(g, 691, y));
      // le tout premier plan : des objets plats, tout près (plan D_PREMIER)
      const pp = (nom, x, w, h, fn) => sprite(nom, x, HC - h + 2, w, h, 2.4, (g) => fn(g, HC));
      pp('p-souMain', 540, 70, 10, (g, y) => D.peindreSousMain(g, 542, y, 64));
      pp('p-plateau', 604, 22, 8, (g, y) => D.peindrePlateauCles(g, 606, y));
      pp('p-liasse', 466, 20, 10, (g, y) => D.peindreLiasse(g, 468, y));
      pp('p-cire', 196, 22, 6, (g, y) => D.peindreCire(g, 198, y));
    }
    const OBJETS_COMPTOIR = ['o-semelles', 'o-sac', 'o-boite', 'o-radio', 'o-pot', 'o-tablette', 'o-carnet', 'o-sonnette', 'o-cirages', 'o-plante'];
    const PREMIER_PLAN = ['p-souMain', 'p-plateau', 'p-liasse', 'p-cire'];
    const D_PREMIER = 150;

    /* ---------- le plafond (poutres en perspective, à chaque image) ---------- */
    const POUTRES = [305, 280, 255, 230, 205, 180, 155];
    function peindrePlafond() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const yP = (d, y) => Yh() + (y + K.OEIL) * s0 * sig(d);
      const yMur = yP(K.D_MUR, -290);
      if (yMur <= 0) return;
      ctx.fillStyle = lin(ctx, 0, 0, 0, yMur, [[0, '#18110C'], [1, '#2E2119']]);
      ctx.fillRect(0, 0, W, yMur + 1);
      POUTRES.forEach((d) => {
        if (d - cam.d < 20) return;
        const yb = yP(d - 6, -276), yh = yP(d - 6, -290), yl = yP(d + 6, -276);
        if (yh > H || yb < -40) return;
        // le dessous de la poutre (éclairé par les lampes), sa face
        ctx.fillStyle = lin(ctx, 0, yb, 0, yl, [[0, '#5A4230'], [1, '#3E2C20']]);
        ctx.fillRect(0, Math.min(yb, yl), W, Math.abs(yl - yb) + 0.5);
        ctx.fillStyle = lin(ctx, 0, yh, 0, yb, [[0, '#2A1D14'], [1, '#4A3526']]);
        ctx.fillRect(0, yh, W, yb - yh + 0.5);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, yh, W, 1);
      });
      // la lumière des lampes sur le plafond
      ctx.globalCompositeOperation = 'screen';
      LAMPES.forEach((L) => {
        const [x, y] = ecran(L.x, L.y - 60);
        if (x < -200 || x > W + 200) return;
        ctx.fillStyle = rad(ctx, x, y, 120 * s0 / 2.3, [[0, 'rgba(255,190,120,0.16)'], [1, 'rgba(255,190,120,0)']]);
        ctx.fillRect(x - 200, 0, 400, yMur);
      });
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- le comptoir du premier plan : des planches en perspective ---------- */
    function peindreComptoir() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hc = K.HAUT_COMPTOIR;
      const yP = (d) => Yh() + (K.OEIL - hc) * s0 * sig(d);
      const bords = [];
      for (let d = K.D_COMPTOIR; d > 40; d -= 15) bords.push(d);
      const bois = D.outils.texChene();
      const yFond = yP(K.D_COMPTOIR);
      if (yFond > H) return;
      for (let i = 0; i < bords.length - 1; i++) {
        const d0 = bords[i], d1 = bords[i + 1];
        if (d1 - cam.d < 16) break;
        const ya = yP(d0), yb = Math.min(H + 2, yP(d1));
        if (ya > H) break;
        const s = s0 * sig((d0 + d1) / 2);
        const p = ctx.createPattern(bois, 'repeat');
        if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().translate(W / 2 - cam.x * s + i * 37 * s, ya).scale(s * 0.13, (yb - ya) / 64 * 0.55));
        ctx.fillStyle = p;
        ctx.fillRect(0, ya, W, yb - ya + 0.6);
        // chaque planche : patinée, plus claire au milieu (usée), le joint sombre
        const ton = [0.34, 0.22, 0.4, 0.28, 0.18, 0.36, 0.26][i % 7];
        ctx.fillStyle = lin(ctx, 0, ya, 0, yb, [[0, `rgba(26,12,4,${ton + 0.25})`], [0.35, `rgba(40,20,8,${ton})`], [0.7, `rgba(40,20,8,${ton + 0.06})`], [1, `rgba(20,10,4,${ton + 0.2})`]]);
        ctx.fillRect(0, ya, W, yb - ya + 0.6);
        ctx.fillStyle = 'rgba(20,10,4,0.55)';
        ctx.fillRect(0, ya, W, Math.max(0.6, (yb - ya) * 0.04));
      }
      // le nez du comptoir (arrondi, il accroche la lumière)
      const e = 2.2 * s0 * sig(K.D_COMPTOIR);
      ctx.fillStyle = lin(ctx, 0, yFond - e * 0.5, 0, yFond + e, [[0, 'rgba(255,236,205,0.0)'], [0.35, 'rgba(255,236,205,0.4)'], [1, 'rgba(60,30,12,0)']]);
      ctx.fillRect(0, yFond - e * 0.5, W, e * 1.5);
      ctx.fillStyle = 'rgba(20,10,4,0.5)';
      ctx.fillRect(0, yFond - 1, W, 1);
      // le premier plan s'enfonce dans l'ombre (on regarde Clément, pas nos mains)
      ctx.fillStyle = lin(ctx, 0, yFond, 0, H, [[0, 'rgba(14,8,4,0)'], [0.5, 'rgba(14,8,4,0.25)'], [1, 'rgba(14,8,4,0.55)']]);
      ctx.fillRect(0, yFond, W, H - yFond);
      // la lumière du jour qui vient de la vitrine (derrière nous), ou la pénombre du soir
      ctx.fillStyle = nuit ? lin(ctx, 0, yFond, 0, H, [[0, 'rgba(10,14,30,0.15)'], [1, 'rgba(10,14,30,0.55)']]) : lin(ctx, 0, yFond, 0, H, [[0, 'rgba(255,248,235,0.05)'], [1, 'rgba(230,238,245,0.18)']]);
      ctx.fillRect(0, yFond, W, H - yFond);
    }

    /* ======================================================================
       Clément
       ====================================================================== */
    const cl = CO.Clement.create({ graine: graine + 11, x: STATIONS.etabli.x });
    const S = cl.etat;
    S.yaw = 0;
    S.tete.pitch = 0.32;

    /* ======================================================================
       Les objets qu'on prend et qu'on pose
       Chaque objet a son repère (x, y, a : l'angle, sens : le miroir) et sa maison. Tenu d'une main,
       il suit la main (sa prise au creux de la main) ; tenu à deux mains, c'est lui qu'on déplace
       et les mains le suivent (ses deux prises). plan : 'machine' (derrière Clément) ou 'table'.
       ====================================================================== */
    const OBJ = {};
    function objet(id, o) {
      const x = Object.assign({ id, x: 0, y: 0, a: 0, k: 1, sens: 1, main: null, visible: true, prise: [0, 0], prises: null, plan: 'table', dessin: null }, o);
      x.maison = x.maison || [x.x, x.y, x.a];
      return (OBJ[id] = x);
    }
    /** un point du repère de l'objet → le monde */
    function monde(o, [lx, ly]) {
      const c = Math.cos(o.a), s = Math.sin(o.a), X = lx * o.sens * o.k, Y = ly * o.k;
      return [o.x + c * X - s * Y, o.y + s * X + c * Y];
    }
    /** l'objet suit la main qui le tient (le creux de la main + la prise, tournée avec la main) */
    function suivreMain(o, B) {
      const ca = Math.cos(B.angMain), sa = Math.sin(B.angMain);
      const px = B.W[0] + ca * 8.5, py = B.W[1] + sa * 8.5;
      const ang = o.aMonde != null ? o.aMonde : B.angMain + (o.angMain || 0);
      o.a = ang;
      const c = Math.cos(ang), s = Math.sin(ang), gx = o.prise[0] * o.sens * o.k, gy = o.prise[1] * o.k;
      o.x = px - (c * gx - s * gy);
      o.y = py - (s * gx + c * gy);
    }
    function dessinerObjet(g, o) {
      if (!o.visible || !o.dessin) return;
      g.save();
      g.translate(o.x, o.y);
      g.rotate(o.a);
      g.scale(o.sens * o.k, o.k);
      o.dessin(g, o);
      g.restore();
    }
    const acier = (g, x0, y0, x1, y1) => lin(g, x0, y0, x1, y1, [[0, '#8E9398'], [0.35, '#EEF0F1'], [0.6, '#A9AEB2'], [1, '#5E6368']]);

    // --- à l'établi : le marteau, la chaussure sur le pied de fer, la colle, la semelle, le café
    objet('marteau', {
      x: 268, y: -97, a: 0.06, prise: [3, 0], aMonde: 0.06,
      dessin(g) { // le manche vers +x, la tête au bout (la panne ronde vers le bas quand a = 0)
        g.fillStyle = lin(g, 0, -0.9, 0, 0.9, [[0, '#D8A870'], [0.5, '#B88A56'], [1, '#7C5834']]);
        g.beginPath(); rr(g, -2, -0.85, 24, 1.7, 0.8); g.fill();
        g.fillStyle = lin(g, 20, 0, 25, 0, [[0, '#6E7378'], [0.4, '#E6E9EB'], [1, '#4E5358']]);
        g.beginPath(); g.moveTo(20.5, -3.6); g.lineTo(24, -3.6); g.quadraticCurveTo(25.6, 0, 24, 5.8); g.lineTo(20.5, 5.8); g.closePath(); g.fill();
        g.beginPath(); g.ellipse(22.3, -3.8, 2.4, 1, 0, 0, TAU); g.fill();
        g.fillStyle = '#50565B'; g.fillRect(20.5, -1.4, 3.5, 2.8);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(21, 5.2, 2.6, 0.5);
      },
    });
    objet('surForme', {
      x: 300, y: -123.5, a: 0, cuir: '#231C19', clous: 0, colle: 0, neuve: false,
      dessin(g, o) {
        g.save(); g.scale(1, -1);
        D.derby(g, -14.5, 0, 29, o.cuir, 1, '#3A2616');
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.beginPath(); g.ellipse(6, 7.5, 7, 1.4, -0.1, 0, TAU); g.fill();
        g.fillStyle = '#5A3A22';
        g.beginPath(); g.moveTo(-14.6, 0.4); g.lineTo(15, 0.4); g.quadraticCurveTo(16.6, -0.8, 15, -2.4); g.lineTo(-14.2, -2.4); g.quadraticCurveTo(-15.4, -1, -14.6, 0.4); g.closePath(); g.fill();
        g.fillStyle = o.neuve ? lin(g, 0, -2.2, 0, 0, [[0, '#4A4A4C'], [1, '#2A2A2C']]) : lin(g, 0, -2.2, 0, 0, [[0, '#E0B888'], [1, '#B98C5C']]);
        g.beginPath(); g.moveTo(-14, -0.1); g.lineTo(14.6, -0.1); g.quadraticCurveTo(15.6, -1, 14.4, -2); g.lineTo(-13.6, -2); g.quadraticCurveTo(-14.6, -1, -14, -0.1); g.closePath(); g.fill();
        if (o.colle > 0) { g.fillStyle = `rgba(255,236,190,${0.35 * o.colle})`; g.fill(); }
        g.fillStyle = 'rgba(90,50,24,0.35)';
        g.fillRect(-6.8, -2, 0.5, 1.9);
        g.fillStyle = '#D6B25C';
        for (let k = 0; k < o.clous; k++) { g.beginPath(); g.arc(-12.5 + k * 2.5, -1.05, 0.38, 0, TAU); g.fill(); }
      },
    });
    objet('pinceau', {
      x: 352, y: -109, a: -1.35, prise: [2, 0], dessin(g) { // le manche vers +x, les poils au bout (-x)
        g.fillStyle = '#B88A56'; g.beginPath(); rr(g, 0, -0.45, 12, 0.9, 0.4); g.fill();
        g.fillStyle = '#9EA3A8'; g.fillRect(-1.6, -0.6, 1.8, 1.2);
        g.fillStyle = '#E8D6A8'; g.beginPath(); g.moveTo(-1.6, -0.7); g.lineTo(-4.4, -0.3); g.lineTo(-4.4, 0.3); g.lineTo(-1.6, 0.7); g.closePath(); g.fill();
      },
    });
    objet('potColle', {
      x: 352, y: -101, a: 0, dessin(g) {
        tache(g, 0, 0.5, 5, 1.2, '#140C06', 0.35);
        g.fillStyle = '#F1EEE8'; g.beginPath(); rr(g, -3.2, -7, 6.4, 7, 1); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(1.2, -6.4, 1.6, 6);
        g.fillStyle = '#2F6FB8'; g.beginPath(); g.ellipse(0, -7, 3.2, 0.9, 0, 0, TAU); g.fill();
        g.fillStyle = '#2A2A2C'; g.beginPath(); g.ellipse(0, -7.1, 2.2, 0.5, 0, 0, TAU); g.fill();
      },
    });
    objet('semelle', {
      x: 320, y: -99.6, a: 0, colle: 0, prises: { D: [-9, 0.6], G: [9, 0.6] }, dessin(g, o) { // une semelle gomme crantée, vue de chant
        g.fillStyle = '#2A2A2C'; g.beginPath(); g.moveTo(-14, 0); g.lineTo(14.5, 0); g.quadraticCurveTo(15.6, -0.9, 14, -1.6); g.lineTo(-14, -1.6); g.closePath(); g.fill();
        g.fillStyle = '#4A4A4C'; g.fillRect(-14, -1.6, 28, 0.6);
        g.fillStyle = '#1A1A1C'; for (let k = 0; k < 9; k++) g.fillRect(-13 + k * 3.1, -0.2, 1.4, 0.6);
        if (o.colle > 0) { g.fillStyle = `rgba(255,236,190,${0.4 * o.colle})`; g.fillRect(-14, -1.8, 28.4, 0.7); }
      },
    });
    objet('tasse', {
      x: 255, y: -98.5, a: 0, sens: -1, prise: [5.4, -5], angMain: 0, aMonde: 0, vapeur: 1, dessin(g) {
        tache(g, 0, 0.3, 6, 1.3, '#140C06', 0.35);
        g.fillStyle = lin(g, -4.4, 0, 4.4, 0, [[0, '#FBF6EA'], [0.6, '#E9E2D2'], [1, '#B9B1A0']]);
        g.beginPath(); g.moveTo(-4.4, -10); g.lineTo(4.4, -10); g.lineTo(4, 0); g.lineTo(-4, 0); g.closePath(); g.fill();
        g.strokeStyle = '#E2DACB'; g.lineWidth = 1.3; g.beginPath(); g.arc(5.2, -5.2, 2.4, -1.3, 1.3); g.stroke();
        g.fillStyle = '#56705A'; g.fillRect(-4.3, -7.2, 8.6, 1.5);
        g.fillStyle = '#3A2012'; g.beginPath(); g.ellipse(0, -10, 4.2, 0.9, 0, 0, TAU); g.fill();
      },
    });
    // --- à la finisseuse : la chaussure dont on finit le bord de semelle (tenue à deux mains)
    objet('chausFin', {
      x: 201, y: -161, a: 0, sens: -1, plan: 'machine', prises: { D: [11, -1], G: [-10, 0] }, cuir: '#6B3A22', dessin(g, o) {
        D.derby(g, -14.5, 5, 29, o.cuir, 1, '#2A1A10');
        // le bord de la semelle neuve, qu'on ponce et qu'on lustre (plus clair tant qu'il n'est pas fini)
        g.fillStyle = `rgba(214,170,120,${0.75 * (1 - (o.fini || 0))})`;
        g.fillRect(-14.4, 3.4, 29.2, 1.2);
        g.fillStyle = `rgba(255,255,255,${0.35 * (o.fini || 0)})`;
        g.fillRect(-13, 3.4, 26, 0.35);
      },
    });
    // --- à la presse : une basket dont on recolle la semelle
    objet('chausPresse', {
      x: 48, y: -95, a: 0, plan: 'machine', prises: { D: [14, -8], G: [-12, -9] }, dessin(g) {
        D.basket(g, -15, 0, 30, D.PAIRES[3], 1);
      },
    });
    // --- le coin nettoyage : la basket sale, la brosse, la serviette
    const COULEURS = [0, 1, 2, 4, 5, 7, 8];
    objet('basket', {
      x: 490, y: -93, a: 0, sens: -1, prise: [-9, -17], sale: 0.9, mousse: [], couleur: D.PAIRES[4], eclat: 0,
      dessin(g, o) {
        D.basket(g, -14, 0, 30, o.couleur, 1, o.sale);
        o.mousse.forEach((b) => {
          g.fillStyle = `rgba(255,255,255,${0.85 * b.a})`;
          g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
          g.strokeStyle = `rgba(190,205,215,${0.7 * b.a})`; g.lineWidth = 0.15; g.stroke();
        });
      },
    });
    objet('brosse', {
      x: 478, y: -98, a: -1.1, prise: [3.5, 0], dessin(g) { // le dos de la brosse vers +x, les poils vers +y
        g.fillStyle = lin(g, 0, -1.6, 0, 1, [[0, '#C69868'], [1, '#8A6038']]);
        g.beginPath(); rr(g, -4.5, -1.6, 9, 2.6, 1.1); g.fill();
        g.fillStyle = '#EDE3CF'; for (let k = 0; k < 9; k++) g.fillRect(-4 + k * 1, 1, 0.6, 1.6);
      },
    });
    objet('serviette', {
      x: 470, y: -90.5, a: 0, prise: [3, 1], plie: 0, dessin(g, o) {
        g.fillStyle = '#6E8FA8';
        if (o.main) { g.beginPath(); g.moveTo(-3, -2); g.quadraticCurveTo(5, -4, 7, 1); g.quadraticCurveTo(4, 5, -2, 4); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-2, 1, 8, 0.5); return; }
        g.beginPath(); g.moveTo(-2, 0); g.lineTo(8, 0); g.lineTo(7.5, 20); g.quadraticCurveTo(3, 22, -1.5, 19); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-1.5, 16); g.lineTo(7.6, 16.5); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(5, 0, 2.5, 20);
      },
    });
    // --- la couture : la pièce de cuir, les ciseaux à fil
    objet('cuir', {
      x: 438, y: -76, a: 0, points: 0, prises: { D: [-7, 0.6], G: [7, 0.6] }, dessin(g, o) {
        g.fillStyle = '#B07A45';
        g.beginPath(); g.moveTo(-10, 0.6); g.lineTo(10, 0.6); g.quadraticCurveTo(11.4, -0.8, 9, -1.6); g.lineTo(-8, -1.6); g.quadraticCurveTo(-11, -0.8, -10, 0.6); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,230,190,0.3)'; g.fillRect(-9, -1.6, 18, 0.4);
        g.fillStyle = '#F2EEE6';
        for (let k = 0; k < Math.min(24, o.points); k++) g.fillRect(8 - k * 0.8, -0.8, 0.45, 0.25);
      },
    });
    objet('ciseaux', {
      x: 447, y: -75.2, a: 0.2, prise: [1.5, 0], dessin(g) {
        g.strokeStyle = '#2A2A2C'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(0, -0.9, 1.3, 0.8, 0, 0, TAU); g.ellipse(0, 0.9, 1.3, 0.8, 0, 0, TAU); g.stroke();
        g.fillStyle = acier(g, 0, -1, 0, 1); g.beginPath(); g.moveTo(1.2, -0.4); g.lineTo(6.5, -0.1); g.lineTo(6.5, 0.1); g.lineTo(1.2, 0.4); g.closePath(); g.fill();
      },
    });
    // --- les clés : l'originale du client, l'ébauche qu'on taille ; la lime
    const dessinCle = (g, o) => {
      g.fillStyle = o.laiton ? lin(g, 0, -1.5, 0, 1.5, [[0, '#F2D48A'], [0.5, '#C9A04A'], [1, '#8E6A2A']]) : acier(g, 0, -1.5, 0, 1.5);
      g.beginPath(); g.arc(0, 0, 1.6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(-0.5, 0, 0.4, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(1.4, -0.55); g.lineTo(6.6, -0.55); g.lineTo(6.9, 0);
      const coupe = o.coupe == null ? 1 : o.coupe;
      for (let k = 0; k < 5; k++) { const x = 6.2 - k * 0.95; g.lineTo(x, 0.55 + (k % 2 ? 0.35 : 0.1) * coupe); g.lineTo(x - 0.47, 0.55); }
      g.lineTo(1.4, 0.55); g.closePath();
      g.fillStyle = o.laiton ? '#D6B25C' : '#BFC4C8'; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(1.6, -0.5, 5, 0.25);
    };
    objet('cleOrig', { x: 549, y: -106.4, a: 0, prise: [0.5, 0], laiton: false, coupe: 1, dessin: dessinCle });
    objet('cleNeuve', { x: 603, y: -104.6, a: 0.05, prise: [0.5, 0], laiton: true, coupe: 0, dessin: dessinCle });
    objet('lime', {
      x: 610, y: -103.2, a: 0.1, prise: [2, 0], dessin(g) {
        g.fillStyle = '#C8322A'; g.beginPath(); rr(g, -1, -0.6, 5, 1.2, 0.5); g.fill();
        g.fillStyle = lin(g, 0, -0.5, 0, 0.5, [[0, '#9EA3A8'], [1, '#4E5358']]); g.fillRect(-9, -0.35, 8, 0.7);
      },
    });
    // --- le ticket : le carnet jaune et le stylo
    objet('stylo', {
      x: 592, y: -103.2, a: -0.1, prise: [5, 0], dessin(g) {
        g.fillStyle = '#1E1E22'; g.fillRect(0, -0.45, 11, 0.9); g.fillStyle = '#C9CDD0'; g.fillRect(-1.2, -0.3, 1.2, 0.6); g.fillStyle = '#C8322A'; g.fillRect(10.4, -0.5, 1.4, 1);
      },
    });
    objet('ticketP', {
      x: 598, y: -103.4, a: 0, ecrit: 0, prise: [0, -3], dessin(g, o) {
        if (o.main) { D.ticket(g, 0, -4, 4.2, 8, 0); g.strokeStyle = 'rgba(40,40,70,0.7)'; g.lineWidth = 0.2; g.beginPath(); for (let k = 0; k < Math.round(o.ecrit * 6); k++) { g.moveTo(-1.5, -1.2 + k * 0.7); g.lineTo(1.2, -1.2 + k * 0.7 - 0.2); } g.stroke(); return; }
        g.save(); g.scale(1, 0.32); g.fillStyle = C.ticket; g.fillRect(-3, -8, 6, 9); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-3, 0, 6, 1); g.restore();
      },
    });
    const marteau = OBJ.marteau, forme = OBJ.surForme;

    /* ---------- les états des machines ---------- */
    const M = {
      finisseuse: { vitesse: 0, cible: 0, angle: 0, contact: null },
      etabli: { choc: 0 },
      presse: { tete: 0, levier: 0, mano: 0 },
      couture: { vitesse: 0, cible: 0, phase: 0, volant: 0 },
      cles: { vitesse: 0, cible: 0, angle: 0, chariot: 0, orig: false, neuve: false, contact: null },
    };
    const PR = { pivot: [76, -122], L: 26, a0: -1.2, a1: 0.35 };
    const levierBout = (k) => { const a = lerp(PR.a0, PR.a1, k); return [PR.pivot[0] + Math.cos(a) * PR.L, PR.pivot[1] + Math.sin(a) * PR.L]; };
    function peindrePresseVive() {
      const P = M.presse;
      repere(K.D_LANE);
      // la tige du vérin et la tête de presse qui descend
      const yt = -140 + 15 * P.tete;
      ctx.fillStyle = acier(ctx, 43, 0, 45, 0);
      ctx.fillRect(43, -149, 2.4, yt + 149);
      ctx.fillStyle = lin(ctx, 0, yt, 0, yt + 8, [[0, '#3A3B3F'], [0.3, '#5E6166'], [1, '#1A1A1C']]);
      ctx.beginPath(); rr(ctx, 33, yt, 23, 8, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(34, yt + 0.6, 21, 0.8);
      // le levier (poignée noire)
      const [bx, by] = levierBout(P.levier);
      ctx.strokeStyle = acier(ctx, PR.pivot[0], PR.pivot[1], bx, by); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(PR.pivot[0], PR.pivot[1]); ctx.lineTo(bx, by); ctx.stroke();
      ctx.fillStyle = '#1C1C1E'; ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(bx - 0.8, by - 0.8, 0.8, 0, TAU); ctx.fill();
      // l'aiguille du manomètre
      const a = -2.4 + 1.8 * P.mano;
      ctx.strokeStyle = '#C8322A'; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(69, -150); ctx.lineTo(69 + Math.cos(a) * 3.6, -150 + Math.sin(a) * 3.6); ctx.stroke();
      ctx.fillStyle = '#2A2A2C'; ctx.beginPath(); ctx.arc(69, -150, 0.6, 0, TAU); ctx.fill();
    }
    function peindreCoutureVive() {
      const Cm = M.couture, cx = D.COUTURE.aiguilleX;
      repere(K.D_LANE);
      // la barre à aiguille qui pique (floue quand ça va vite)
      const b = Math.sin(Cm.phase) * 2.1 * (Cm.vitesse > 0.02 ? 1 : 0);
      if (Cm.vitesse > 0.35) {
        ctx.fillStyle = 'rgba(210,214,218,0.55)'; ctx.fillRect(cx - 0.35, -110, 0.7, 8.5);
      } else {
        ctx.fillStyle = acier(ctx, cx - 0.4, 0, cx + 0.4, 0); ctx.fillRect(cx - 0.4, -110, 0.8, 5 + b);
        ctx.fillStyle = '#C9CDD0'; ctx.fillRect(cx - 0.12, -105 + b, 0.24, 3);
      }
      // le pied presseur
      ctx.fillStyle = '#9EA3A8'; ctx.fillRect(cx - 1.4, -104.6, 2.8, 1.1);
      // le volant (vu de biais) : un reflet qui tourne
      const vx = D.COUTURE.volantX, vy = D.COUTURE.volantY;
      ctx.fillStyle = '#1C1C1E'; ctx.beginPath(); ctx.ellipse(vx, vy, 2.6, 6.2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6E7378'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(vx, vy, 2.1, 5.4, 0, 0, TAU); ctx.stroke();
      const av = Cm.volant;
      ctx.fillStyle = 'rgba(230,232,234,0.8)';
      ctx.beginPath(); ctx.ellipse(vx + Math.sin(av) * 1.8, vy + Math.cos(av) * 4.6, 0.5, 0.9, 0, 0, TAU); ctx.fill();
    }
    function peindreClesVive() {
      const Kc = M.cles, mx = D.CLES.machineX;
      repere(K.D_LANE);
      const dx = (Kc.chariot - 0.5) * 7;
      // la fraise (à droite) et le palpeur (à gauche), sur le carter
      const fx = mx + 12, fy = -117;
      ctx.fillStyle = acier(ctx, fx - 1.6, 0, fx + 1.6, 0);
      ctx.beginPath(); ctx.ellipse(fx, fy, 1.6, 5.4, 0, 0, TAU); ctx.fill();
      if (Kc.vitesse > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${0.35 * Kc.vitesse})`;
        ctx.beginPath(); ctx.ellipse(fx, fy, 1.7, 5.6, 0, 0, TAU); ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(60,60,64,0.8)'; ctx.lineWidth = 0.2;
        ctx.beginPath(); for (let k = -4; k <= 4; k++) { ctx.moveTo(fx - 1.2, fy + k * 1.2); ctx.lineTo(fx + 1.2, fy + k * 1.2 + 0.4); } ctx.stroke();
      }
      ctx.fillStyle = '#2A2A2C'; ctx.fillRect(mx - 14, -121, 3, 5); ctx.beginPath(); ctx.moveTo(mx - 14, -116); ctx.lineTo(mx - 11, -116); ctx.lineTo(mx - 12.5, -113.5); ctx.closePath(); ctx.fill();
      // le chariot et ses deux étaux
      ctx.fillStyle = lin(ctx, 0, -113, 0, -107, [[0, '#B9BEC2'], [1, '#6E7378']]);
      ctx.beginPath(); rr(ctx, mx - 19 + dx, -113, 38, 6, 1); ctx.fill();
      [mx - 12.5 + dx, mx + 12 + dx].forEach((vx) => {
        ctx.fillStyle = '#1E1E20'; ctx.fillRect(vx - 3.5, -114.6, 7, 2.6);
        ctx.fillStyle = '#6E7378'; ctx.beginPath(); ctx.arc(vx + 4.2, -113.3, 0.9, 0, TAU); ctx.fill();
      });
      // la poignée du chariot, devant
      ctx.fillStyle = '#1C1C1E'; ctx.beginPath(); ctx.arc(mx + dx, -106, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6E7378'; ctx.fillRect(mx - 0.4 + dx, -108.5, 0.8, 2.6);
      // les clés serrées dans les étaux
      if (Kc.orig) { const o = OBJ.cleOrig; o.x = mx - 17.5 + dx; o.y = -115.4; o.a = 0; dessinerObjet(ctx, o); }
      if (Kc.neuve) { const o = OBJ.cleNeuve; o.x = mx + 7 + dx; o.y = -115.4; o.a = 0; dessinerObjet(ctx, o); }
    }

    /* ---------- les particules : poussière, étincelles, mousse, vapeur, bouffée ---------- */
    const PART = [];
    function emettre(n, f) { for (let i = 0; i < n && PART.length < 220; i++) PART.push(Object.assign({ t: 0 }, f(i))); }
    function majParticules(dt) {
      const s = dt / 1000;
      for (let i = PART.length - 1; i >= 0; i--) {
        const p = PART[i];
        p.t += s;
        if (p.t >= p.vie) { PART.splice(i, 1); continue; }
        p.vy += (p.g || 0) * s;
        if (p.frein) { const f = Math.max(0, 1 - p.frein * s); p.vx *= f; p.vy *= f; }
        p.x += p.vx * s; p.y += p.vy * s;
      }
    }
    function dessinerParticules() {
      repere(K.D_LANE);
      PART.forEach((p) => {
        const k = 1 - p.t / p.vie;
        if (p.type === 'etincelle') {
          ctx.strokeStyle = `rgba(255,${(170 + 70 * k) | 0},${(60 + 60 * k) | 0},${k.toFixed(3)})`;
          ctx.lineWidth = 0.28;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018); ctx.stroke();
        } else if (p.type === 'vapeur') {
          ctx.fillStyle = `rgba(255,248,236,${(0.07 * Math.sin(k * Math.PI)).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(p.x + Math.sin(p.t * 3 + p.ph) * 0.8, p.y, p.r * (1 + p.t * 1.6), 0, TAU); ctx.fill();
        } else if (p.type === 'eclat') {
          const L = p.r * Math.sin(k * Math.PI);
          ctx.fillStyle = `rgba(255,255,255,${(0.9 * Math.sin(k * Math.PI)).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(p.x, p.y - L); ctx.lineTo(p.x + L * 0.12, p.y - L * 0.12); ctx.lineTo(p.x + L, p.y); ctx.lineTo(p.x + L * 0.12, p.y + L * 0.12); ctx.lineTo(p.x, p.y + L); ctx.lineTo(p.x - L * 0.12, p.y + L * 0.12); ctx.lineTo(p.x - L, p.y); ctx.lineTo(p.x - L * 0.12, p.y - L * 0.12); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = rgba(p.c || '#D8C6A8', ((p.a || 0.7) * k).toFixed(3));
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (p.grossit ? 1 + p.t * p.grossit : 1), 0, TAU); ctx.fill();
        }
      });
    }
    const poussiere = (x, y, dir = 1, n = 2) => emettre(n, () => ({ x: x + (RV() - 0.5) * 2, y: y + (RV() - 0.5) * 1.5, vx: dir * (10 + RV() * 50), vy: 20 + RV() * 70, g: 60, frein: 1.2, vie: 0.5 + RV() * 0.8, r: 0.25 + RV() * 0.45, c: RV() < 0.5 ? '#E6D2B0' : '#B8946A', a: 0.8 }));
    const bouffee = (x, y) => emettre(14, () => ({ x, y, vx: -30 + RV() * 25, vy: -10 + RV() * 25, g: 10, frein: 2.2, vie: 0.7 + RV() * 0.6, r: 0.3 + RV() * 0.5, grossit: 1.5, c: '#E8D8BC', a: 0.6 }));
    const etincelles = (x, y) => emettre(3, () => ({ type: 'etincelle', x, y, vx: 40 + RV() * 120, vy: -30 + RV() * 90, g: 260, vie: 0.25 + RV() * 0.35 }));

    /* ---------- la lumière : cônes des lampes, poussière qui flotte ; le soir ---------- */
    const MOUTES = Array.from({ length: 30 }, (_, i) => ({ l: i % LAMPES.length, u: R(), v: R(), ph: R() * TAU, vit: 0.3 + R() * 0.7 }));
    let tVie = 0, nuitK = nuit ? 1 : 0;
    function peindreLumiere() {
      repere(K.D_LANE);
      ctx.globalCompositeOperation = 'screen';
      LAMPES.forEach((L) => {
        const h = 150, f = 1 + 0.02 * Math.sin(tVie * 7.3 + L.x) * (L.x === 540 ? 1 : 0);
        ctx.fillStyle = lin(ctx, 0, L.y, 0, L.y + h, [[0, rgba('#FFE7B8', (0.13 + 0.08 * nuitK) * f)], [1, rgba('#FFE7B8', 0)]]);
        ctx.beginPath(); ctx.moveTo(L.x - L.l * 0.42, L.y + 2); ctx.lineTo(L.x + L.l * 0.42, L.y + 2); ctx.lineTo(L.x + L.l * 2.4, L.y + h); ctx.lineTo(L.x - L.l * 2.4, L.y + h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = rad(ctx, L.x, L.y + 3, 26, [[0, rgba('#FFF1CF', (0.4 + 0.15 * nuitK) * f)], [1, rgba('#FFE0A0', 0)]]);
        ctx.beginPath(); ctx.arc(L.x, L.y + 3, 26, 0, TAU); ctx.fill();
      });
      MOUTES.forEach((m) => {
        const L = LAMPES[m.l];
        const v = (m.v + tVie * 0.012 * m.vit) % 1;
        const x = L.x + (m.u - 0.5) * L.l * (1 + v * 3.6) + Math.sin(tVie * 0.4 * m.vit + m.ph) * 3;
        const y = L.y + 8 + v * 120;
        const a = Math.sin(v * Math.PI) * (0.35 + 0.35 * Math.sin(tVie * 1.3 + m.ph));
        if (a <= 0.02) return;
        ctx.fillStyle = `rgba(255,236,200,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 0.35, 0, TAU); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    /** le soir : une carte de lumière (petite, redessinée à chaque image) posée en « produit » sur l'image :
        la pénombre bleutée loin des lampes, des flaques chaudes dessous ; puis le halo des ampoules */
    let carte = null;
    function peindreSoir() {
      if (nuitK <= 0.001) return;
      const cw = Math.max(8, Math.round(W / 6)), ch = Math.max(8, Math.round(H / 6));
      if (!carte || carte.width !== cw || carte.height !== ch) carte = toile(cw, ch);
      const g = carte.getContext('2d'), k = cw / W;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      const fond = [lerp(255, 70, nuitK), lerp(255, 66, nuitK), lerp(255, 86, nuitK)];
      g.fillStyle = `rgb(${fond[0] | 0},${fond[1] | 0},${fond[2] | 0})`;
      g.fillRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'lighter';
      LAMPES.forEach((L) => {
        const [x, y] = ecran(L.x, L.y + 70);
        const r = 150 * s0 * sig(K.D_LANE) * k;
        if ((x * k) < -r || (x * k) > cw + r) return;
        g.fillStyle = rad(g, x * k, y * k, r, [[0, `rgba(255,190,120,${(0.85 * nuitK).toFixed(3)})`], [0.45, `rgba(200,140,90,${(0.42 * nuitK).toFixed(3)})`], [1, 'rgba(150,100,70,0)']]);
        g.fillRect(x * k - r, y * k - r, 2 * r, 2 * r);
      });
      // le lampadaire de la rue par la porte vitrée
      const [px, py] = ecran(672, -160, K.D_MUR);
      const rp = 60 * s0 * k;
      g.fillStyle = rad(g, px * k, py * k, rp, [[0, `rgba(120,140,190,${(0.5 * nuitK).toFixed(3)})`], [1, 'rgba(120,140,190,0)']]);
      g.fillRect(px * k - rp, py * k - rp, 2 * rp, 2 * rp);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(carte, 0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'screen';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      LAMPES.forEach((L) => {
        const [x, y] = ecran(L.x, L.y + 4);
        const r = 34 * s0 * sig(K.D_LANE);
        if (x < -r || x > W + r) return;
        ctx.fillStyle = rad(ctx, x, y, r, [[0, `rgba(255,214,150,${(0.4 * nuitK).toFixed(3)})`], [1, 'rgba(255,190,120,0)']]);
        ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    /** le caisson SMALL est lumineux : il brille à travers la pénombre du soir */
    function peindreSmallVive() {
      if (nuitK <= 0.02) return;
      const [x, y] = ecran(234, -206, K.D_MUR);
      const r = 44 * s0 * sig(K.D_MUR);
      if (x < -r || x > W + r) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rad(ctx, x, y, r, [[0, `rgba(255,246,228,${(0.5 * nuitK).toFixed(3)})`], [0.35, `rgba(255,236,210,${(0.22 * nuitK).toFixed(3)})`], [1, 'rgba(255,230,200,0)']]);
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      ctx.globalCompositeOperation = 'source-over';
    }
    /** la pendule : l'heure de Paris */
    function peindreAiguilles() {
      const [x, y] = ecran(470, -188, K.D_MUR);
      if (x < -40 || x > W + 40) return;
      repere(K.D_MUR);
      const t = CO.parisNow ? CO.parisNow() : new Date();
      const h = (t.getHours() % 12) + t.getMinutes() / 60, m = t.getMinutes() + t.getSeconds() / 60;
      ctx.strokeStyle = '#1E1A16'; ctx.lineCap = 'round';
      ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(470, -188); ctx.lineTo(470 + Math.sin(h / 12 * TAU) * 5.4, -188 - Math.cos(h / 12 * TAU) * 5.4); ctx.stroke();
      ctx.lineWidth = 0.55; ctx.beginPath(); ctx.moveTo(470, -188); ctx.lineTo(470 + Math.sin(m / 60 * TAU) * 8.2, -188 - Math.cos(m / 60 * TAU) * 8.2); ctx.stroke();
      ctx.fillStyle = '#C8322A'; ctx.beginPath(); ctx.arc(470, -188, 0.7, 0, TAU); ctx.fill();
    }
    /** le cadran de la radio s'allume quand le son est là */
    function peindreRadioVive() {
      if (!(CO.sfx && CO.sfx.on)) return;
      repere(K.D_OBJETS);
      const [cx, cy, cw, chh] = D.RADIO.cadran, x = D.RADIO.x + cx, y = -K.HAUT_COMPTOIR + cy;
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,190,90,0.85)';
      ctx.fillRect(x + 0.4, y + 0.4, cw - 0.8, chh - 0.8);
      ctx.fillStyle = rad(ctx, x + cw / 2, y + chh / 2, 9, [[0, 'rgba(255,190,90,0.35)'], [1, 'rgba(255,190,90,0)']]);
      ctx.fillRect(x - 10, y - 10, cw + 20, chh + 20);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#C8322A'; ctx.fillRect(x + cw * (0.3 + 0.1 * Math.sin(tVie * 0.2)), y + 0.5, 0.35, chh - 1);
    }

    /* ---------- la finisseuse : les brosses et les meules qui tournent ---------- */
    const TEXROUE = {};
    function texRoue(type) { // une bande verticale (le chant qui défile), et sa version filée (flou de bougé)
      if (TEXROUE[type]) return TEXROUE[type];
      const Wt = 24, Ht = 96, c = toile(Wt, Ht), g = c.getContext('2d'), r = CO.rng(type.length * 31);
      const fond = { fraise: '#8E9296', abrasif: '#3A3634', noire: '#1C1C1E', tampico: '#C9A878', feutre: '#EDE6D6', crin: '#6B4A2E' }[type];
      g.fillStyle = fond; g.fillRect(0, 0, Wt, Ht);
      if (type === 'fraise') { for (let y = 0; y < Ht; y += 6) { g.fillStyle = '#E6E9EB'; g.fillRect(0, y, Wt, 1.6); g.fillStyle = '#4E5358'; g.fillRect(0, y + 3.4, Wt, 1.6); } }
      else if (type === 'abrasif') { for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(200,190,170,0.5)' : 'rgba(0,0,0,0.5)'; g.fillRect(r() * Wt, r() * Ht, 1, 1); } }
      else if (type === 'feutre') { for (let y = 0; y < Ht; y += 3) { g.fillStyle = y % 6 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.5)'; g.fillRect(0, y, Wt, 1.2); } }
      else { for (let i = 0; i < 260; i++) { g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.4)'; g.lineWidth = 0.8; const x = r() * Wt, y = r() * Ht; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 5 + r() * 5); g.stroke(); } }
      const floue = toile(Wt, Ht), f = floue.getContext('2d');
      for (let k = 0; k < 10; k++) { f.globalAlpha = 0.18; f.drawImage(c, 0, k * 2.2 - 10); f.drawImage(c, 0, k * 2.2 - 10 + Ht); }
      f.globalAlpha = 1;
      return (TEXROUE[type] = { net: c, flou: floue });
    }
    function peindreRoues() {
      const F = M.finisseuse;
      repere(K.D_LANE);
      D.ROUES.forEach((w) => {
        const x = w.x - w.w / 2, y = D.ARBRE_Y - w.r, h = 2 * w.r;
        const T = texRoue(w.type);
        ctx.save();
        ctx.beginPath(); rr(ctx, x, y, w.w, h, Math.min(3, w.w / 3)); ctx.clip();
        const per = h * 1.6, off = ((F.angle * w.r * 0.5) % per + per) % per;
        const flou = clamp(F.vitesse * 1.4, 0, 1);
        ctx.globalAlpha = 1 - flou * 0.85;
        ctx.drawImage(T.net, x, y - per + off, w.w, per); ctx.drawImage(T.net, x, y + off, w.w, per);
        if (flou > 0.02) { ctx.globalAlpha = flou; ctx.drawImage(T.flou, x, y - per + off, w.w, per); ctx.drawImage(T.flou, x, y + off, w.w, per); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = lin(ctx, 0, y, 0, y + h, [[0, 'rgba(0,0,0,0.75)'], [0.28, 'rgba(255,240,220,0.12)'], [0.4, 'rgba(255,255,255,0.05)'], [0.75, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0.85)']]);
        ctx.fillRect(x, y, w.w, h);
        ctx.fillStyle = lin(ctx, x, 0, x + w.w, 0, [[0, 'rgba(0,0,0,0.3)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
        ctx.fillRect(x, y, w.w, h);
        ctx.restore();
        ctx.fillStyle = lin(ctx, 0, D.ARBRE_Y - 3, 0, D.ARBRE_Y + 3, [[0, '#E6E9EB'], [1, '#4E5358']]);
        ctx.fillRect(x - 0.8, D.ARBRE_Y - 2.6, 0.8, 5.2); ctx.fillRect(x + w.w, D.ARBRE_Y - 2.6, 0.8, 5.2);
      });
    }

    /* ---------- la vitre qu'on vient de passer (entrée, sortie) : montants vert sauge, reflets ---------- */
    let vitreK = 0; // 0 : rien ; 1 : on est contre la vitre
    function peindreVitre() {
      const k = vitreK;
      if (k <= 0.004) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // le verre : une légère teinte et des reflets obliques
      ctx.fillStyle = `rgba(214,228,232,${(0.18 * k).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${(0.14 * k).toFixed(3)})`;
      const o = (1 - k) * W * 0.6;
      ctx.beginPath(); ctx.moveTo(W * 0.12 + o, H); ctx.lineTo(W * 0.62 + o, 0); ctx.lineTo(W * 0.8 + o, 0); ctx.lineTo(W * 0.3 + o, H); ctx.closePath(); ctx.fill();
      // les montants de la devanture (vert sauge), qui s'écartent quand on passe
      const e = Math.pow(k, 2.2);
      const larg = lerp(W * 3.2, W * 1.02, e), ep = lerp(W * 0.5, W * 0.035, e);
      ctx.fillStyle = C.sauge;
      [-1, 1].forEach((s) => {
        const x = W / 2 + s * larg / 2;
        ctx.fillRect(x - ep / 2, 0, ep, H);
        ctx.fillStyle = `rgba(255,255,255,0.18)`; ctx.fillRect(x - ep / 2, 0, ep * 0.18, H);
        ctx.fillStyle = C.sauge;
      });
      const yt = lerp(-H * 1.2, H * 0.06, e), yb = lerp(H * 2.2, H * 0.9, e);
      ctx.fillRect(0, yt - ep, W, ep);
      ctx.fillRect(0, yb, W, ep * 1.6);
    }

    /* ---------- le premier passage : un halo doux autour de Clément (une fois) ---------- */
    let indice = null;
    function peindreIndice() {
      if (!indice) return;
      const p = (tVie - indice.t0) / 2.8;
      if (p >= 1) { indice = null; return; }
      const t = cl.tete();
      const [x, y] = ecran(t.x, t.y + 34);
      const r = 62 * s0 * sig(K.D_LANE);
      const a = Math.pow(Math.sin(p * Math.PI * 2), 2) * Math.sin(p * Math.PI);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.save();
      ctx.translate(x, y); ctx.scale(0.72, 1);
      ctx.fillStyle = rad(ctx, 0, 0, r, [[0, `rgba(255,226,170,${(0.22 * a).toFixed(3)})`], [0.55, `rgba(255,214,150,${(0.12 * a).toFixed(3)})`], [1, 'rgba(255,214,150,0)']]);
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- le rendu d'une image ---------- */
    const planMachine = [], planTable = [];
    const PERF = window.CO_BQ_PERF ? {} : null;
    let tP = 0;
    const jalon = (nom) => { if (!PERF) return; const t = performance.now(); PERF[nom] = (PERF[nom] || 0) * 0.9 + (t - tP) * 0.1; tP = t; };
    function rendre() {
      if (PERF) tP = performance.now();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1A130E';
      ctx.fillRect(0, 0, cv.width, cv.height);
      peindrePlafond();
      jalon('plafond');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      poser(SP.mur, K.D_MUR);
      poser(nuitK > 0.5 ? SP.porteNuit : SP.porteJour, K.D_MUR);
      poser(SP.small, K.D_MUR);
      peindreAiguilles();
      jalon('mur');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      LAMPES.forEach((L, i) => poser(SP['lampe' + i], K.D_LANE));
      poser(SP.presse, K.D_LANE);
      poser(SP.finisseuse, K.D_LANE);
      jalon('machines');
      peindreRoues();
      peindrePresseVive();
      repere(K.D_LANE);
      planMachine.forEach((o) => { if (!o.main) dessinerObjet(ctx, o); });
      jalon('machinesVives');
      // Clément (le corps), les meubles devant lui, puis ses bras et ce qu'il tient
      const objets = (g, Mn, B) => { if (Mn.objet) { if (Mn.objet.main !== 'deux') suivreMain(Mn.objet, B); dessinerObjet(g, Mn.objet); } };
      cl.dessiner(ctx, 'corps', objets);
      jalon('clementCorps');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      poser(SP.etabli, K.D_LANE);
      poser(SP.couture, K.D_LANE);
      poser(SP.nettoyage, K.D_LANE);
      poser(SP.cles, K.D_LANE);
      jalon('meubles');
      peindreCoutureVive();
      peindreClesVive();
      repere(K.D_LANE);
      forme.y = -123.5 + M.etabli.choc * 0.6;
      planTable.forEach((o) => { if (!o.main && !(o.id === 'cleOrig' && M.cles.orig) && !(o.id === 'cleNeuve' && M.cles.neuve)) dessinerObjet(ctx, o); });
      jalon('meublesVifs');
      cl.dessiner(ctx, 'devant', objets);
      jalon('clementDevant');
      dessinerParticules();
      peindreLumiere();
      jalon('lumiere');
      peindreComptoir();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      OBJETS_COMPTOIR.forEach((n) => poser(SP[n], K.D_OBJETS));
      if (cam.d < D_PREMIER - 30) PREMIER_PLAN.forEach((n) => poser(SP[n], D_PREMIER));
      jalon('comptoir');
      peindreSoir();
      peindreRadioVive();
      peindreSmallVive();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = rad(ctx, W / 2, H * 0.42, Math.max(W, H) * 0.78, [[0.45, 'rgba(12,7,3,0)'], [1, `rgba(12,7,3,${(0.5 + 0.15 * nuitK).toFixed(3)})`]]);
      ctx.fillRect(0, 0, W, H);
      peindreIndice();
      peindreVitre();
      jalon('voiles');
    }
    Object.values(OBJ).forEach((o) => (o.plan === 'machine' ? planMachine : planTable).push(o));

    /* ======================================================================
       Le mouvement de Clément
       ====================================================================== */
    const horloge = Horloge();
    const tw = (ms, fn, ease, jeton, coupe) => horloge.tween(ms, fn, ease, jeton, coupe);
    const att = (ms, jeton) => horloge.attendre(ms, jeton);
    const mainDe = (c) => (c === 'D' ? S.mainD : S.mainG);
    function mainLibre(cote) { const m = mainDe(cote); m.mode = 'libre'; m.coude = 0; m.angle = null; m.suit = null; m.pose = 'ouverte'; m.devant = false; }
    function mainVers(cote, x, y, ms, { pose, angle, ease = E.io, jeton, devant, coude } = {}) {
      const m = mainDe(cote);
      m.mode = 'fixe'; m.suit = null;
      const x0 = m.x, y0 = m.y, a0 = m.angle == null ? null : m.angle, c0 = m.coude || 0, c1 = coude == null ? c0 : coude;
      if (devant != null) m.devant = devant;
      return tw(ms, (e, p) => {
        m.x = lerp(x0, x, e); m.y = lerp(y0, y, e); m.coude = lerp(c0, c1, e);
        if (angle !== undefined) m.angle = angle == null ? null : a0 == null ? angle : lerp(a0, angle, e);
        if (pose && p >= 0.55) m.pose = pose;
      }, ease, jeton);
    }
    /** aller prendre un objet (sa prise, ou un point) */
    const versObjet = (cote, o, ms, opts = {}) => { const [x, y] = o.prises && o.prises[cote] ? monde(o, o.prises[cote]) : monde(o, o.prise); return mainVers(cote, x, y, ms, opts); };
    /** prendre d'une main : l'objet suit la main */
    function prendre(cote, o) { o.main = cote; mainDe(cote).objet = o; }
    /** poser (l'objet reste là où il est, ou va à sa place) */
    function lacher(o, place) {
      ['D', 'G'].forEach((c) => { const m = mainDe(c); if (m.objet === o) m.objet = null; if (m.suit === o) { m.suit = null; m.mode = 'fixe'; } });
      o.main = null;
      if (place) { o.x = place[0]; o.y = place[1]; o.a = place[2] || 0; if (o.aMonde != null) o.aMonde = o.a; }
    }
    /** tenir à deux mains : les mains suivent les prises de l'objet */
    function deuxMains(o, devant = true) {
      o.main = 'deux';
      ['D', 'G'].forEach((c) => { const m = mainDe(c); m.mode = 'objet'; m.suit = o; m.devant = devant; });
      // l'objet se dessine avec la main la plus loin (les deux mains passent par-dessus)
      const loin = Math.sin(S.yaw) < 0 ? 'D' : 'G';
      mainDe(loin).objet = o; mainDe(loin === 'D' ? 'G' : 'D').objet = null;
    }
    /** déplacer un objet (tenu à deux mains, ou posé) */
    function deplacer(o, x, y, a, ms, j, ease = E.io) {
      const x0 = o.x, y0 = o.y, a0 = o.a;
      return tw(ms, (e) => { o.x = lerp(x0, x, e); o.y = lerp(y0, y, e); o.a = lerp(a0, a, e); }, ease, j);
    }
    function corps(cible, ms, ease = E.io, jeton) {
      const d = {};
      Object.keys(cible).forEach((k) => { d[k] = [S[k], cible[k]]; });
      return tw(ms, (e) => { Object.keys(d).forEach((k) => { S[k] = lerp(d[k][0], d[k][1], e); }); }, ease, jeton);
    }
    function tete(cible, ms, ease = E.io, jeton) {
      const d = {};
      Object.keys(cible).forEach((k) => { d[k] = [S.tete[k], cible[k]]; });
      return tw(ms, (e) => { Object.keys(d).forEach((k) => { S.tete[k] = lerp(d[k][0], d[k][1], e); }); }, ease, jeton);
    }
    /** la bouche à l'écran (monde), d'après la dernière image */
    const bouche = () => { const d = cl.dernier; return d && d.tete && d.tete.bouche ? d.tete.bouche : [S.x, S.y - 150]; };
    const regardVers = (gx, gy, ms, j) => { const g0 = S.regard.slice(); return tw(ms, (e) => { S.regard = [lerp(g0[0], gx, e), lerp(g0[1], gy, e)]; }, E.io, j); };
    /** s'asseoir sur le tabouret (haut : la machine à coudre se travaille presque debout) */
    const asseoir = (on, j) => corps({ assis: on ? 0.7 : 0 }, 520, E.io, j);
    /** marcher jusqu'en x (le corps se tourne vers là où il va, les bras balancent) */
    async function marcher(x, jeton, faceFin = 0) {
      if (S.assis > 0.02) await asseoir(false, jeton);
      const x0 = S.x, dist = Math.abs(x - x0);
      if (dist < 3) { await Promise.all([corps({ yaw: faceFin }, 320, E.io, jeton), tete({ turn: 0 }, 320, E.io, jeton)]); return; }
      const dir = Math.sign(x - x0);
      mainLibre('D'); mainLibre('G');
      await Promise.all([corps({ yaw: dir * 1.02, lean: 0.03, cote: 0 }, 260, E.io, jeton), tete({ turn: -dir * 0.42, pitch: 0.05, roll: 0 }, 300, E.io, jeton)]);
      const v = 105, dur = (dist / v) * 1000 + 350;
      const ph0 = S.marchePhase;
      let dernierPas = Math.floor(ph0 * 2);
      await tw(dur, (e, p) => {
        S.x = lerp(x0, x, e);
        S.marche = clamp(Math.min(p / 0.12, (1 - p) / 0.14), 0, 1);
        S.marchePhase = ph0 + Math.abs(S.x - x0) / 130;
        const pas = Math.floor(S.marchePhase * 2);
        if (pas !== dernierPas) { dernierPas = pas; son('bq-pas'); }
      }, E.sin, jeton, true); // (on l'appelle : il s'arrête où il est)
      S.marche = 0;
      await Promise.all([corps({ yaw: faceFin, lean: 0 }, 320, E.io, jeton), tete({ turn: 0 }, 320, E.io, jeton)]);
    }

    /* ---------- les sons (sur un canal qu'on coupe net) ---------- */
    const canal = CO.sfx && CO.sfx.channel ? CO.sfx.channel(1) : null;
    const voix = {}; // nom → { v, niveau, aigu }
    function son(nom, o) { if (canal && actifSon()) canal.play(nom, o || {}); }
    function voixNiveau(nom, niveau, aigu = 0) { const V = voix[nom] || (voix[nom] = { v: null, niveau: 0, aigu: 0 }); V.niveau = niveau; V.aigu = aigu; }
    let tVoix = -9;
    function majVoix() {
      const ok = canal && actifSon();
      Object.keys(voix).forEach((nom) => {
        const V = voix[nom];
        if (!ok || V.niveau <= 0.004) { if (V.v) { V.v.stop(); V.v = null; } return; }
        if (!V.v && tVie - tVoix > 0.4) { tVoix = tVie; V.v = canal.voice(nom); }
        if (V.v) V.v.level(V.niveau, V.aigu);
      });
    }
    function couperSons() { Object.values(voix).forEach((V) => { if (V.v) { try { V.v.stop(); } catch (e) { /* rien */ } V.v = null; } }); if (canal) canal.cut(); }

    /* ======================================================================
       Les activités (chacune 8 à 20 s ; il marche d'une machine à l'autre entre deux)
       Tous les gestes passent par l'horloge de la scène : ils s'arrêtent avec elle.
       ====================================================================== */
    const angleMarteau = (a, ms, j, ease = E.io) => { const a0 = marteau.aMonde; return tw(ms, (e) => { marteau.aMonde = lerp(a0, a, e); }, ease, j); };

    /** 1. Le marteau sur le pied de fer : les clous aux lèvres, un clou posé, deux coups, le rebond */
    async function marteler(j) {
      const st = STATIONS.etabli;
      await marcher(st.x, j, st.face);
      await Promise.all([corps({ lean: 0.2 }, 400, E.io, j), tete({ pitch: 0.5, turn: 0 }, 400, E.io, j), regardVers(0, -0.4, 400, j)]);
      await versObjet('D', marteau, 450, { pose: 'poing', devant: true, angle: -1.2, jeton: j });
      prendre('D', marteau);
      son('bq-pose', { v: 0.5 });
      await Promise.all([mainVers('D', 280, -131, 380, { angle: -1.65, jeton: j }), angleMarteau(-0.3, 380, j)]);
      const n = 3 + Math.floor(RV() * 2);
      const sole = -126;
      for (let i = 0; i < n; i++) {
        // les clous : une pincée prise dans la coupelle, gardée aux lèvres ; la main les y reprend par le côté
        const auxLevres = (ms) => { const [bx, by] = bouche(); return mainVers('G', bx + 10.5, by + 2, ms, { pose: 'pince', jeton: j, coude: 0.55, angle: Math.PI + 0.3 }); };
        if (i === 0) {
          await mainVers('G', 322, -102, 380, { pose: 'pince', devant: true, angle: null, jeton: j });
          await att(160, j);
          await Promise.all([auxLevres(440), tete({ pitch: 0.34, turn: 0.1 }, 400, E.io, j)]);
          S.clous = 4;
          son('bq-clou');
          await att(160, j);
        } else {
          await Promise.all([auxLevres(300), tete({ pitch: 0.36, turn: 0.1 }, 260, E.io, j)]);
        }
        S.clous = Math.max(0, S.clous - 1);
        const nx = 305 - i * 2.4;
        await Promise.all([mainVers('G', nx + 3, sole - 1.6, 340, { jeton: j, coude: 0.2, angle: null }), tete({ pitch: 0.55, turn: 0.04 }, 340, E.io, j)]);
        for (const force of [0.45, 1]) {
          await Promise.all([mainVers('D', 268, -150 - force * 8, 260 + force * 140, { ease: E.out, jeton: j, coude: 0.75 }), angleMarteau(-1.2 - force * 0.25, 260 + force * 140, j, E.out)]);
          await att(50 + RV() * 70, j);
          await Promise.all([mainVers('D', nx - 19.5, sole - 5.4, 95, { ease: E.in, jeton: j, coude: 0.3 }), angleMarteau(0, 95, j, E.in)]);
          son('hammer', { gain: 0.3 + 0.4 * force });
          if (force > 0.6) { son('bq-clou'); forme.clous = Math.min(10, forme.clous + 1); }
          M.etabli.choc = 1;
          await Promise.all([
            mainVers('D', nx - 21, sole - 11, 170, { ease: E.out, jeton: j }), angleMarteau(-0.28, 170, j, E.out),
            tw(230, (e) => { M.etabli.choc = 1 - e; }, E.out, j),
          ]);
          if (force < 0.9) await mainVers('G', 318, -120, 170, { pose: 'ouverte', jeton: j });
        }
        if (RV() < 0.3) {
          await Promise.all([tete({ pitch: 0.62, roll: -0.12 }, 360, E.io, j), corps({ lean: 0.28 }, 360, E.io, j)]);
          await att(500, j);
          await Promise.all([tete({ roll: 0, pitch: 0.5 }, 300, E.io, j), corps({ lean: 0.2 }, 300, E.io, j)]);
        }
      }
      if (forme.clous >= 10) forme.clous = 0;
      await ranger(j);
    }

    /** 2. La finisseuse : le moteur, le bord de semelle contre la brosse, on tourne, on vérifie, on souffle */
    async function finir(j) {
      const F = M.finisseuse, ch = OBJ.chausFin, st = STATIONS.finisseuse;
      await marcher(st.x, j, st.face);
      await Promise.all([tete({ turn: -0.2, pitch: 0.3 }, 350, E.io, j), corps({ lean: 0.1 }, 350, E.io, j)]);
      // le bouton vert
      await mainVers('G', 191, -136.5, 420, { pose: 'pince', jeton: j });
      son('bq-clic'); F.cible = 1;
      await mainVers('G', 198, -128, 200, { jeton: j });
      // prendre la chaussure posée sur le capot, à deux mains
      await Promise.all([versObjet('G', ch, 460, { pose: 'tenir', jeton: j }), versObjet('D', ch, 460, { pose: 'tenir', jeton: j })]);
      deuxMains(ch, true);
      son('bq-pose', { v: 0.4 });
      const passe = async (roue, ms, dy = 0) => {
        const w = D.ROUES.find((r) => r.type === roue);
        await deplacer(ch, w.x + 6, D.ARBRE_Y - 4 + dy, -0.12, 520, j);
        F.contact = { x: w.x, y: D.ARBRE_Y + 2, dir: -1 };
        voixNiveau('bq-meule', 0.8, roue === 'abrasif' ? 0.6 : 0.1);
        await tw(ms, (e, p) => {
          ch.x = w.x + 6 + Math.sin(p * TAU * 2.2) * 3.2;
          ch.a = -0.12 + Math.sin(p * TAU * 1.4) * 0.2;
          ch.fini = clamp((ch.fini || 0) + 0.004, 0, 1);
          F.contact.x = w.x + Math.sin(p * TAU * 2.2) * 1.5;
        }, E.lin, j, true);
        F.contact = null;
        voixNiveau('bq-meule', 0);
      };
      await passe('crin', 2200 + RV() * 1200);
      // on regarde : la chaussure à hauteur des yeux, on la tourne
      await Promise.all([deplacer(ch, 214, -141, -0.35, 520, j), tete({ turn: -0.3, pitch: 0.25 }, 520, E.io, j), regardVers(-0.5, -0.2, 400, j)]);
      await deplacer(ch, 212, -143, 0.25, 700, j);
      await att(300, j);
      // il souffle la poussière
      S.souffle = 0;
      await tw(260, (e) => { S.souffle = e; }, E.out, j);
      son('bq-souffle');
      bouffee(ch.x + 4, ch.y + 4);
      await att(350, j);
      await tw(220, (e) => { S.souffle = 1 - e; }, E.io, j);
      await Promise.all([tete({ turn: -0.2, pitch: 0.3 }, 400, E.io, j), regardVers(0, -0.3, 400, j)]);
      await passe('feutre', 1800 + RV() * 1200, 1);
      // la chaussure reposée sur le capot, le bouton rouge
      await deplacer(ch, ch.maison[0], ch.maison[1], 0, 560, j);
      lacher(ch, ch.maison);
      son('bq-pose', { v: 0.5 });
      mainLibre('D');
      await mainVers('G', 205, -136.5, 380, { pose: 'pince', jeton: j });
      son('bq-clic'); F.cible = 0;
      await att(200, j);
      ch.fini = 0;
      await ranger(j);
    }

    /** 3. La presse : on cale la basket, on tire le levier, l'air siffle, on attend, on relâche */
    async function presser(j) {
      const P = M.presse, ch = OBJ.chausPresse, st = STATIONS.presse;
      await marcher(st.x, j, st.face);
      await Promise.all([tete({ turn: -0.25, pitch: 0.35 }, 380, E.io, j), corps({ lean: 0.14 }, 380, E.io, j)]);
      // caler la chaussure sur le coussin
      await Promise.all([versObjet('G', ch, 460, { pose: 'tenir', jeton: j }), versObjet('D', ch, 460, { pose: 'tenir', jeton: j })]);
      deuxMains(ch, false);
      await deplacer(ch, 50, -95, 0.04, 300, j);
      await deplacer(ch, 48, -95, 0, 240, j);
      son('bq-pose', { v: 0.6 });
      lacher(ch, ch.maison);
      // la main droite tient la chaussure, la gauche prend le levier
      await Promise.all([mainVers('D', 44, -110, 360, { pose: 'plate', jeton: j }), mainVers('G', ...levierBout(0), 420, { pose: 'poing', jeton: j })]);
      son('bq-levier');
      await tw(520, (e) => {
        P.levier = e;
        const [x, y] = levierBout(e); S.mainG.x = x; S.mainG.y = y;
        P.tete = clamp((e - 0.15) / 0.85, 0, 1);
      }, E.io, j);
      son('bq-air', { dur: 0.9 });
      await mainVers('D', 64, -128, 320, { pose: 'plate', jeton: j }); // la main droite se pose sur la colonne
      // la pression monte ; il surveille le manomètre, le tapote
      await Promise.all([tete({ turn: -0.1, pitch: 0.05 }, 400, E.io, j), regardVers(-0.3, 0.3, 400, j), tw(900, (e) => { P.mano = 0.82 * e; }, E.out, j)]);
      if (RV() < 0.6) {
        await mainVers('D', 69, -149, 360, { pose: 'pince', jeton: j });
        for (let k = 0; k < 2; k++) { await mainVers('D', 68, -151, 90, { jeton: j }); son('bq-clic'); P.mano = 0.86; await mainVers('D', 69, -149, 110, { jeton: j }); P.mano = 0.82; }
      }
      await att(1000 + RV() * 900, j);
      // on relâche
      son('bq-levier');
      await tw(480, (e) => {
        P.levier = 1 - e;
        const [x, y] = levierBout(1 - e); S.mainG.x = x; S.mainG.y = y;
        P.tete = clamp(1 - e * 1.2, 0, 1); P.mano = 0.82 * (1 - e);
      }, E.io, j);
      son('bq-air', { dur: 0.5 });
      // on sort la chaussure, on regarde le collage
      await Promise.all([versObjet('G', ch, 420, { pose: 'tenir', jeton: j }), versObjet('D', ch, 420, { pose: 'tenir', jeton: j }), tete({ turn: -0.25, pitch: 0.35 }, 400, E.io, j)]);
      deuxMains(ch, true);
      await Promise.all([deplacer(ch, 72, -136, -0.3, 600, j), tete({ turn: -0.25, pitch: 0.28 }, 600, E.io, j)]);
      await deplacer(ch, 72, -138, 0.2, 700, j);
      await att(300, j);
      await deplacer(ch, ch.maison[0], ch.maison[1], 0, 600, j);
      son('bq-pose', { v: 0.6 });
      lacher(ch, ch.maison);
      await ranger(j);
    }

    /** 4. La machine à coudre : assis, le cuir sous l'aiguille, ça pique, on tourne, on coupe le fil */
    async function coudre(j) {
      const Cm = M.couture, cu = OBJ.cuir, st = STATIONS.couture, ax = D.COUTURE.aiguilleX, ay = D.COUTURE.aiguilleY + 0.4;
      await marcher(st.x, j, st.face);
      await Promise.all([asseoir(true, j), tete({ pitch: 0.45 }, 520, E.io, j)]);
      await corps({ lean: 0.12 }, 300, E.io, j);
      await Promise.all([versObjet('G', cu, 420, { pose: 'plate', jeton: j }), versObjet('D', cu, 420, { pose: 'plate', jeton: j })]);
      deuxMains(cu, true);
      await deplacer(cu, ax + 8, ay, 0, 520, j);
      son('bq-pose', { v: 0.3 });
      const piquer = async (ms, a) => {
        Cm.cible = 1;
        await tw(ms, (e, p) => {
          const pts = Math.floor(p * ms / 100);
          cu.x = ax + 8 - p * (ms / 1000) * 3.4 * Math.cos(a);
          cu.y = ay + p * (ms / 1000) * 3.4 * Math.sin(a) * 0.3;
          cu.a = a * 0.3;
          cu.points = cu.pts0 + pts;
        }, E.lin, j, true);
        cu.pts0 = cu.points;
        Cm.cible = 0;
      };
      cu.pts0 = 0; cu.points = 0;
      await piquer(1800 + RV() * 900, 0);
      await att(400, j);
      // on tourne la pièce, aiguille plantée
      await deplacer(cu, cu.x, cu.y, -0.25, 420, j);
      await piquer(1400 + RV() * 700, 0.2);
      await att(350, j);
      // les ciseaux à fil
      const ci = OBJ.ciseaux;
      await versObjet('D', ci, 420, { pose: 'pince', jeton: j });
      mainDe('D').mode = 'fixe';
      prendre('D', ci);
      await mainVers('D', ax + 4, ay - 3, 380, { jeton: j });
      son('snip');
      await att(200, j);
      await mainVers('D', ci.maison[0], ci.maison[1], 380, { jeton: j });
      lacher(ci, ci.maison);
      // on regarde la couture
      deuxMains(cu, true);
      await Promise.all([deplacer(cu, 404, -118, 0.1, 560, j), tete({ pitch: 0.28, turn: -0.2 }, 560, E.io, j)]);
      await att(700, j);
      await deplacer(cu, cu.maison[0], cu.maison[1], 0, 520, j);
      lacher(cu, cu.maison);
      cu.points = 0;
      await ranger(j);
    }

    /** 5. Le nettoyage des baskets : brosse et mousse, la serviette, on la lève à la lumière */
    async function nettoyer(j) {
      const b = OBJ.basket, br = OBJ.brosse, sv = OBJ.serviette, st = STATIONS.nettoyage;
      b.couleur = D.PAIRES[COULEURS[Math.floor(RV() * COULEURS.length)]];
      b.sale = 0.9; b.mousse = [];
      await marcher(st.x, j, st.face);
      await Promise.all([corps({ lean: 0.16 }, 380, E.io, j), tete({ pitch: 0.45 }, 380, E.io, j)]);
      // la main gauche prend la basket par le col
      await versObjet('G', b, 450, { pose: 'tenir', devant: true, jeton: j });
      prendre('G', b); b.angMain = 0; b.aMonde = 0;
      await mainVers('G', 505, -121, 460, { jeton: j });
      // la main droite trempe la brosse dans la bassine
      await versObjet('D', br, 420, { pose: 'poing', devant: true, jeton: j });
      prendre('D', br); br.aMonde = -0.2;
      son('glue');
      await mainVers('D', 478, -104, 260, { jeton: j });
      await mainVers('D', 486, -118, 300, { jeton: j });
      const frotter = async (n) => {
        for (let k = 0; k < n; k++) {
          const cx = b.x + (b.sens < 0 ? -1 : 1) * 2 + (k % 2 ? 4 : -4);
          await mainVers('D', cx, b.y - 3 + (k % 3), 115, { jeton: j });
          if (k % 4 === 0) son('brush', { n: 4 });
          if (b.mousse.length < 26 && RV() < 0.8) b.mousse.push({ x: -12 + RV() * 26, y: -1 - RV() * 9, r: 0.5 + RV() * 1.1, a: 1 });
          b.sale = Math.max(0.35, b.sale - 0.03);
        }
      };
      await frotter(10);
      // on tourne la basket, l'autre côté
      await tw(360, (e) => { b.sens = e < 0.5 ? -1 : 1; b.k = 1 - Math.sin(e * Math.PI) * 0.15; }, E.io, j);
      b.k = 1;
      await frotter(8);
      // la brosse retourne dans la bassine
      await mainVers('D', br.maison[0] + 2, br.maison[1] - 2, 420, { jeton: j });
      lacher(br, br.maison);
      // la serviette
      await versObjet('D', sv, 380, { pose: 'poing', jeton: j });
      prendre('D', sv); sv.aMonde = 0;
      son('bq-frotte');
      for (let k = 0; k < 5; k++) {
        await mainVers('D', b.x + (k % 2 ? 5 : -5), b.y - 4 - (k % 3) * 2, 170, { jeton: j });
        b.mousse.forEach((m) => { m.a = Math.max(0, m.a - 0.35); });
        b.sale = Math.max(0, b.sale - 0.08);
        if (k === 2) son('bq-frotte');
      }
      b.mousse = []; b.sale = 0;
      await mainVers('D', sv.maison[0] + 3, sv.maison[1] + 1, 400, { jeton: j });
      lacher(sv, sv.maison);
      mainLibre('D');
      // on la lève dans la lumière de la lampe, on la tourne, elle brille
      await Promise.all([mainVers('G', 524, -176, 620, { jeton: j, coude: 0.35 }), tete({ pitch: -0.2, turn: 0.35 }, 620, E.io, j), corps({ lean: 0 }, 620, E.io, j), regardVers(0.5, 0.6, 500, j)]);
      await tw(900, (e) => { b.sens = e < 0.5 ? -1 : 1; b.k = 1 - Math.sin(e * Math.PI) * 0.18; }, E.io, j);
      b.k = 1;
      emettre(1, () => ({ type: 'eclat', x: b.x + 3, y: b.y - 3, vx: 0, vy: 0, vie: 0.6, r: 3 }));
      S.sourire = 0;
      await Promise.all([tw(500, (e) => { S.sourire = e * 0.8; }, E.io, j), tete({ pitch: -0.1 }, 500, E.io, j)]);
      await att(500, j);
      // la basket reposée, propre
      await Promise.all([mainVers('G', b.maison[0] + 9 * b.sens, b.maison[1] - 17, 560, { jeton: j, coude: 0 }), tete({ pitch: 0.4, turn: 0 }, 560, E.io, j), tw(560, (e) => { S.sourire = 0.8 * (1 - e); }, E.io, j), regardVers(0, -0.3, 400, j)]);
      lacher(b, b.maison);
      b.sens = -1; b.angMain = 0; b.aMonde = null;
      son('bq-pose', { v: 0.4 });
      await ranger(j);
    }

    /** 6. Les clés : l'originale et l'ébauche serrées, la fraise qui crisse, la lime, on compare */
    async function tailler(j) {
      const Kc = M.cles, co = OBJ.cleOrig, cn = OBJ.cleNeuve, li = OBJ.lime, st = STATIONS.cles, mx = D.CLES.machineX;
      cn.coupe = 0; Kc.orig = Kc.neuve = false; lacher(co, co.maison); lacher(cn, cn.maison);
      await marcher(st.x, j, st.face);
      await Promise.all([corps({ lean: 0.16 }, 380, E.io, j), tete({ pitch: 0.48 }, 380, E.io, j)]);
      // l'originale (main droite) dans l'étau de gauche, l'ébauche (main gauche) dans celui de droite
      await Promise.all([versObjet('D', co, 460, { pose: 'pince', devant: true, jeton: j }), versObjet('G', cn, 460, { pose: 'pince', devant: true, jeton: j })]);
      prendre('D', co); prendre('G', cn); co.angMain = -0.3; cn.angMain = 0.3;
      await Promise.all([mainVers('D', mx - 16, -118, 420, { jeton: j }), mainVers('G', mx + 8, -118, 420, { jeton: j })]);
      lacher(co); lacher(cn); Kc.orig = true; Kc.neuve = true;
      son('bq-etau');
      await att(160, j);
      son('bq-etau');
      // le moteur
      await mainVers('G', mx + 16, -125, 320, { pose: 'pince', jeton: j });
      son('bq-clic'); Kc.cible = 1;
      await mainVers('G', mx + 20, -112, 300, { pose: 'ouverte', jeton: j });
      // la main droite mène le chariot : la fraise taille l'ébauche
      await mainVers('D', mx - 1, -105.5, 360, { pose: 'poing', jeton: j });
      son('keycut', { dur: 1.7 });
      voixNiveau('bq-meule', 0.7, 1);
      await tw(1800, (e, p) => {
        Kc.chariot = 0.5 + Math.sin(p * TAU * 1.5) * 0.45;
        S.mainD.x = mx - 1 + (Kc.chariot - 0.5) * 7;
        cn.coupe = clamp(p * 1.1, 0, 1);
        Kc.contact = { x: mx + 12, y: -114.5 };
      }, E.lin, j, true);
      Kc.contact = null;
      voixNiveau('bq-meule', 0);
      Kc.chariot = 0.5;
      await mainVers('G', mx + 16, -125, 320, { pose: 'pince', jeton: j });
      son('bq-clic'); Kc.cible = 0;
      // on desserre la clé neuve, on l'ébavure à la lime
      await mainVers('G', mx + 9, -118, 320, { jeton: j });
      son('bq-etau');
      Kc.neuve = false; prendre('G', cn); cn.angMain = 0.3; cn.a = 0;
      // la clé passe dans la main droite, la main gauche prend la lime
      await Promise.all([mainVers('G', mx - 2, -126, 380, { jeton: j }), mainVers('D', mx - 8, -127, 380, { pose: 'pince', jeton: j })]);
      lacher(cn); prendre('D', cn); cn.angMain = -0.2;
      await versObjet('G', li, 440, { pose: 'poing', jeton: j });
      prendre('G', li); li.aMonde = 0.05;
      for (let k = 0; k < 4; k++) {
        await mainVers('G', mx + 4, -128, 150, { jeton: j });
        if (k % 2 === 0) son('bq-lime');
        await mainVers('G', mx + 11, -128.5, 150, { jeton: j });
      }
      await mainVers('G', li.maison[0] - 2, li.maison[1], 420, { jeton: j });
      lacher(li, li.maison); li.aMonde = null;
      lacher(cn); prendre('G', cn); cn.angMain = 0.3;
      // il souffle sur la clé
      await tw(220, (e) => { S.souffle = e; }, E.out, j);
      son('bq-souffle');
      await att(280, j);
      await tw(200, (e) => { S.souffle = 1 - e; }, E.io, j);
      // l'originale, et les deux côte à côte à hauteur des yeux
      await mainVers('D', mx - 16, -118, 380, { pose: 'pince', jeton: j });
      son('bq-etau');
      Kc.orig = false; prendre('D', co); co.angMain = -0.3;
      await Promise.all([mainVers('D', mx - 9, -146, 560, { jeton: j, coude: 0.45 }), mainVers('G', mx + 9, -146, 560, { jeton: j, coude: 0.45 }), tete({ pitch: 0.3, roll: 0.1 }, 560, E.io, j), corps({ lean: 0.04 }, 560, E.io, j), regardVers(0, -0.3, 400, j)]);
      co.angMain = cn.angMain = -Math.PI / 2 + 0.1;
      await att(700, j);
      await Promise.all([tete({ roll: -0.06, pitch: 0.06 }, 300, E.io, j)]);
      await tete({ roll: 0, pitch: 0.02 }, 260, E.io, j);
      // posées sur le plateau pour le client
      await Promise.all([mainVers('D', co.maison[0] + 1, co.maison[1] - 1, 520, { jeton: j, coude: 0 }), mainVers('G', mx - 22, -106, 520, { jeton: j, coude: 0 }), tete({ pitch: 0.45, roll: 0 }, 520, E.io, j)]);
      lacher(co, co.maison); lacher(cn, [mx - 24, -106.4, 0.1]);
      co.angMain = cn.angMain = 0;
      son('bq-pose', { v: 0.3 });
      await ranger(j);
      lacher(cn, cn.maison); cn.coupe = 0; // (une ébauche neuve reprend sa place)
    }

    /** 7. La colle : le pinceau dans le pot, sur la chaussure et sur la semelle, on attend, on presse */
    async function coller(j) {
      const pi = OBJ.pinceau, se = OBJ.semelle, st = STATIONS.etabli;
      forme.colle = 0; forme.neuve = false; se.colle = 0; se.visible = true;
      await marcher(st.x, j, st.face);
      await Promise.all([corps({ lean: 0.2 }, 400, E.io, j), tete({ pitch: 0.52, turn: 0.05 }, 400, E.io, j)]);
      await versObjet('G', pi, 440, { pose: 'poing', devant: true, jeton: j });
      prendre('G', pi); pi.aMonde = -1.2;
      son('glue');
      await tw(300, (e) => { pi.aMonde = lerp(-1.2, -2.3, e); }, E.io, j);
      const etaler = async (x0, x1, y, n, cible) => {
        for (let k = 0; k < n; k++) {
          await mainVers('G', (k % 2 ? x1 : x0) + 5, y - 3.5, 240, { jeton: j });
          if (k % 2 === 0) son('glue');
          cible.colle = clamp((k + 1) / n, 0, 1);
        }
      };
      await etaler(290, 312, -126.5, 5, forme);
      // on retrempe, puis la semelle posée sur le tapis
      await mainVers('G', pi.maison[0] + 4, pi.maison[1] - 3, 320, { jeton: j });
      son('glue');
      await tete({ pitch: 0.6, turn: 0.12 }, 300, E.io, j);
      await etaler(308, 330, -101, 4, se);
      await mainVers('G', pi.maison[0] + 2, pi.maison[1] - 4, 380, { jeton: j });
      lacher(pi, pi.maison); pi.aMonde = null;
      // on laisse tirer la colle : un coup d'œil à la montre
      await Promise.all([mainVers('G', 322, -134, 460, { pose: 'ouverte', angle: -2.6, jeton: j, coude: 0.45 }), tete({ pitch: 0.42, turn: 0.22 }, 460, E.io, j), regardVers(0.5, -0.4, 300, j)]);
      await att(900 + RV() * 500, j);
      await Promise.all([tete({ pitch: 0.5, turn: 0 }, 360, E.io, j), regardVers(0, -0.4, 300, j)]);
      // la semelle retournée, posée sur la chaussure, pressée à plat
      await Promise.all([versObjet('D', se, 420, { pose: 'tenir', angle: null, jeton: j }), versObjet('G', se, 420, { pose: 'tenir', angle: null, jeton: j })]);
      deuxMains(se, true);
      await deplacer(se, 300, -135, Math.PI, 560, j);
      await deplacer(se, 300, -126.8, Math.PI, 300, j);
      lacher(se); se.visible = false; forme.neuve = true; forme.colle = 0;
      son('bq-pose', { v: 0.7 });
      await Promise.all([mainVers('D', 292, -129, 260, { pose: 'plate', jeton: j }), mainVers('G', 308, -129, 260, { pose: 'plate', jeton: j })]);
      for (let k = 0; k < 2; k++) { await Promise.all([mainVers('D', 292, -127.5, 160, { jeton: j }), mainVers('G', 308, -127.5, 160, { jeton: j })]); M.etabli.choc = 0.5; await Promise.all([mainVers('D', 292, -129.5, 160, { jeton: j }), mainVers('G', 308, -129.5, 160, { jeton: j })]); M.etabli.choc = 0; }
      await ranger(j);
      lacher(se, se.maison); se.visible = true; se.colle = 0;
      forme.neuve = false; // (la chaussure suivante)
    }

    /** 8. Une pause : une gorgée de café, ou un ticket jaune écrit au comptoir */
    async function pause(j) {
      if (RV() < 0.55) {
        const t = OBJ.tasse, st = STATIONS.etabli;
        t.sens = -1;
        await marcher(st.x, j, 0);
        await Promise.all([tete({ pitch: 0.35, turn: -0.2 }, 380, E.io, j), corps({ lean: 0.08 }, 380, E.io, j)]);
        await versObjet('D', t, 420, { pose: 'tenir', devant: true, jeton: j });
        prendre('D', t); t.aMonde = 0;
        await Promise.all([mainVers('D', S.x - 11, -150, 620, { jeton: j, coude: 0.6 }), tete({ pitch: -0.05, turn: -0.1 }, 620, E.io, j), corps({ lean: 0 }, 620, E.io, j)]);
        await tete({ pitch: -0.2 }, 300, E.io, j);
        son('bq-gorgee');
        await att(700, j);
        // il nous regarde, la tasse à la main
        await Promise.all([mainVers('D', S.x - 12, -128, 520, { jeton: j, coude: 0.2 }), tete({ pitch: 0.02, turn: 0 }, 520, E.io, j), regardVers(0, 0.1, 400, j), tw(520, (e) => { S.sourire = 0.7 * e; }, E.io, j)]);
        await att(1300 + RV() * 800, j);
        await Promise.all([mainVers('D', t.maison[0] + 2.5, t.maison[1] - 3, 560, { jeton: j, coude: 0 }), tete({ pitch: 0.35, turn: -0.2 }, 560, E.io, j), tw(560, (e) => { S.sourire = 0.7 * (1 - e); }, E.io, j), regardVers(0, -0.3, 400, j)]);
        lacher(t, t.maison);
        son('bq-pose', { v: 0.4 });
      } else {
        const tp = OBJ.ticketP, sy = OBJ.stylo, st = STATIONS.cles;
        await marcher(st.x + 8, j, 0);
        await Promise.all([corps({ lean: 0.2 }, 380, E.io, j), tete({ pitch: 0.55 }, 380, E.io, j)]);
        await Promise.all([versObjet('D', sy, 420, { pose: 'pince', devant: true, jeton: j }), mainVers('G', tp.x + 4, tp.y - 1, 420, { pose: 'plate', devant: true, jeton: j })]);
        prendre('D', sy); sy.aMonde = -2.3;
        tp.ecrit = 0;
        for (let k = 0; k < 6; k++) {
          await mainVers('D', tp.x - 2 + (k % 3) * 1.6, tp.y - 2.5 + Math.floor(k / 3) * 0.8, 150, { jeton: j });
          if (k % 2 === 0) son('bq-stylo');
          tp.ecrit = (k + 1) / 6;
        }
        await mainVers('D', sy.maison[0] + 5, sy.maison[1], 320, { jeton: j });
        lacher(sy, sy.maison); sy.aMonde = null;
        // il détache le ticket, le montre, le pique sur la pointe
        await versObjet('D', tp, 300, { pose: 'pince', jeton: j });
        son('tear', { dur: 0.35 });
        prendre('D', tp); tp.aMonde = 0;
        await Promise.all([mainVers('D', S.x - 4, -150, 520, { jeton: j, coude: 0.5 }), tete({ pitch: 0.02 }, 520, E.io, j), regardVers(0, 0.1, 400, j), mainVers('G', S.x + 20, -95, 400, { pose: 'ouverte', jeton: j })]);
        await att(900, j);
        await Promise.all([mainVers('D', tp.maison[0], tp.maison[1] - 1, 520, { jeton: j, coude: 0 }), tete({ pitch: 0.45 }, 520, E.io, j), regardVers(0, -0.3, 400, j)]);
        son('stamp');
        lacher(tp, tp.maison); tp.ecrit = 0;
      }
      await ranger(j);
    }

    /** reposer ce qu'on tient, arrêter les machines, se redresser (aussi quand on l'interrompt) */
    async function ranger(j, vite = 1) {
      const T = (ms) => Math.round(ms * vite);
      S.clous = 0;
      if (S.marche > 0.01) { const m0 = S.marche; await tw(T(220), (e) => { S.marche = m0 * (1 - e); }, E.out, j); S.marche = 0; }
      M.finisseuse.cible = 0; M.couture.cible = 0; M.cles.cible = 0; M.finisseuse.contact = null; M.cles.contact = null;
      voixNiveau('bq-meule', 0);
      const P = M.presse;
      if (P.levier > 0.01 || P.tete > 0.01) {
        son('bq-air', { dur: 0.4 });
        const l0 = P.levier, t0 = P.tete, m0 = P.mano;
        await tw(T(360), (e) => { P.levier = l0 * (1 - e); P.tete = t0 * (1 - e); P.mano = m0 * (1 - e); }, E.io, j);
      }
      if (S.souffle > 0) await tw(160, (e) => { S.souffle = S.souffle * (1 - e); }, E.io, j);
      S.souffle = 0;
      // ce qu'on tient à deux mains : reposé à sa place
      const deux = Object.values(OBJ).find((o) => o.main === 'deux');
      if (deux) { await deplacer(deux, deux.maison[0], deux.maison[1], deux.maison[2], T(420), j); lacher(deux, deux.maison); }
      for (const c of ['D', 'G']) {
        const m = mainDe(c), o = m.objet;
        if (o && o.main === c) {
          // trop loin de sa place : on l'y rapporte (il marche avec, à la main)
          if (Math.abs(o.maison[0] - S.x) > 42) await marcher(o.maison[0] + (c === 'D' ? 17 : -17), j, 0);
          const [mx, my] = monde(Object.assign({}, o, { x: o.maison[0], y: o.maison[1], a: o.maison[2] }), o.prise);
          await mainVers(c, mx, my, T(380), { jeton: j });
          lacher(o, o.maison);
          o.angMain = o.id === 'basket' || o.id === 'tasse' ? 0 : o.angMain;
          son('bq-pose', { v: 0.4 });
        }
      }
      mainLibre('D'); mainLibre('G');
      await Promise.all([corps({ lean: 0, cote: 0 }, T(400), E.io, j), tete({ pitch: 0.12, roll: 0, turn: 0 }, T(400), E.io, j), regardVers(0, 0, T(300), j), tw(T(300), (e) => { S.sourire = S.sourire * (1 - e); }, E.io, j)]);
    }

    const ACTIVITES = {
      finisseuse: { poids: 3, fn: finir, station: 'finisseuse' },
      marteau: { poids: 3, fn: marteler, station: 'etabli' },
      nettoyage: { poids: 3, fn: nettoyer, station: 'nettoyage' },
      presse: { poids: 2, fn: presser, station: 'presse' },
      couture: { poids: 2, fn: coudre, station: 'couture' },
      cles: { poids: 2, fn: tailler, station: 'cles' },
      colle: { poids: 2, fn: coller, station: 'etabli' },
      pause: { poids: 1.5, fn: pause, station: null },
    };

    /* ---------- la grande boucle au hasard (pondérée, jamais deux fois la même de suite) ---------- */
    let jeton = { annule: false }, enCours = null, derniere = null, boucleTour = 0, vivant = false;
    let regardeNous = false, parle = false, reprendreRes = null, finActivite = null, force = 'marteau';
    let listeners = {};
    const emit = (ev, a) => (listeners[ev] || []).forEach((fn) => { try { fn(a); } catch (e) { console.warn(e); } });
    function tirer() {
      const ids = Object.keys(ACTIVITES).filter((k) => k !== derniere);
      const tot = ids.reduce((s, k) => s + ACTIVITES[k].poids, 0);
      let x = RV() * tot;
      for (const k of ids) { x -= ACTIVITES[k].poids; if (x <= 0) return k; }
      return ids[ids.length - 1];
    }
    async function boucle(tour) {
      while (tour === boucleTour && vivant) {
        if (regardeNous) { await new Promise((r) => { reprendreRes = r; }); reprendreRes = null; continue; }
        const id = force || tirer();
        force = null;
        derniere = id;
        const j = (jeton = { annule: false });
        enCours = id;
        emit('activite', id);
        let fin;
        finActivite = new Promise((r) => { fin = r; });
        try {
          // ce qu'il tenait encore (la pose de départ, un geste interrompu) est reposé d'abord
          if (id !== 'marteau' && Object.values(OBJ).some((o) => o.main)) await ranger(j);
          await ACTIVITES[id].fn(j);
          if (!j.annule) await att(250 + RV() * 450, j);
        } catch (e) {
          if (e !== ANNULE) console.warn('boutique', e);
          try { await ranger({ annule: false }, regardeNous ? 0.6 : 1); } catch (e2) { /* rien */ }
        }
        enCours = null;
        fin();
      }
    }
    function interrompre() {
      jeton.annule = true;
      return finActivite || Promise.resolve();
    }

    /* ---------- il se tourne vers nous, il parle ---------- */
    async function regarder() {
      regardeNous = true;
      if (reduit) { poseFace(); rendre(); return; }
      if (!vivant) { vivant = true; enPause = false; boucle(++boucleTour); }
      demander();
      await Promise.race([interrompre(), CO.wait(3000)]);
      const j = { annule: false };
      // de face (depuis une machine de côté, on se tourne franchement), on nous regarde, on sourit
      const face = Math.abs(S.yaw) > 0.3 ? S.yaw * 0.25 : 0;
      await Promise.all([
        corps({ yaw: face, lean: 0, cote: 0 }, 380, E.io, j),
        tete({ turn: -face * 0.8, pitch: -0.02, roll: 0.04 }, 380, E.io, j),
        regardVers(0, 0.1, 300, j),
        tw(380, (e) => { S.sourire = lerp(S.sourire, 0.75, e); S.sourcils = 0.5 * Math.sin(e * Math.PI); }, E.io, j),
      ]);
      S.sourcils = 0;
    }
    function poseFace() { // (mouvement réduit) : l'image arrêtée, de face
      mainLibre('D'); mainLibre('G');
      Object.values(OBJ).forEach((o) => { if (o.main) lacher(o, o.maison); });
      S.yaw = 0; S.lean = 0; S.tete.turn = 0; S.tete.pitch = 0; S.regard = [0, 0.1]; S.sourire = 0.7; S.clous = 0;
      majMains();
      cam.cx = cam.x = S.x; cam.cd = cam.d = 95; cam.ct = cam.tilt = tiltPour(S.y - 172, 95, 0.26);
    }
    let gesteT = 0, gesteCote = 'D';
    function majParole(dt) {
      if (reduit) return;
      if (!parle) { if (S.bouche > 0) S.bouche = Math.max(0, S.bouche - dt / 90); return; }
      const t = tVie;
      // des syllabes (bruit, ~7 par seconde), la bouche s'ouvre et se ferme
      const n = Math.sin(t * 43) * 0.5 + Math.sin(t * 27.3 + 1) * 0.35 + Math.sin(t * 11.1) * 0.25;
      S.bouche = clamp(0.15 + n * 0.55, 0, 0.85);
      S.sourcils = 0.25 * Math.max(0, Math.sin(t * 1.7));
      S.tete.pitch = -0.02 + 0.03 * Math.sin(t * 2.3);
      S.tete.roll = 0.04 * Math.sin(t * 0.9);
      // une main qui accompagne ce qu'il dit
      gesteT -= dt / 1000;
      if (gesteT <= 0 && !mainDe(gesteCote).objet) {
        gesteT = 1.4 + RV() * 1.6;
        gesteCote = RV() < 0.5 ? 'D' : 'G';
        const s = gesteCote === 'D' ? -1 : 1, m = mainDe(gesteCote);
        if (RV() < 0.65) { // la main s'ouvre de son côté, paume vers le haut, à hauteur de la taille
          const [x, y] = cl.point(s * (19 + RV() * 4), 110 + RV() * 8, 16);
          mainVers(gesteCote, x, y, 420, { pose: 'geste', angle: s < 0 ? -2.45 - RV() * 0.3 : -0.7 + RV() * 0.3, coude: 0.35 });
        } else mainLibre(gesteCote);
        const autre = gesteCote === 'D' ? 'G' : 'D';
        if (mainDe(autre).pose === 'geste') mainLibre(autre);
      }
      if (mainDe(gesteCote).pose === 'geste') { const m = mainDe(gesteCote); m.y += Math.sin(t * 5.1) * 0.15; }
    }

    /* ======================================================================
       La mise à jour et la boucle d'images (~30 i/s, seulement quand on la voit)
       ====================================================================== */
    function majMains() {
      ['D', 'G'].forEach((c) => {
        const m = mainDe(c);
        if (m.mode === 'fixe') return;
        if (m.mode === 'objet' && m.suit) { const [x, y] = monde(m.suit, m.suit.prises[c]); m.x = x; m.y = y; return; }
        const s = c === 'D' ? -1 : 1, ph = S.marchePhase * TAU + (c === 'D' ? 0 : Math.PI);
        const sw = S.marche * 14 * Math.sin(ph);
        const p = S.assis > 0.5 ? cl.repos(c) : cl.point(s * 21.5, 83 + S.marche * 3 * Math.cos(ph), 3 + sw);
        m.x = p[0]; m.y = p[1];
      });
    }
    const camOff = { d: 0, t: 0 };
    let camLibre = null; // un cadrage imposé (l'établi de près)
    function majCamera(dt) {
      const k = 1 - Math.exp(-dt / 1000 * 2.6);
      if (camLibre) { cam.cx = camLibre.x; cam.cd = camLibre.d; cam.ct = tiltPour(camLibre.y, camLibre.d, camLibre.f); }
      else if (regardeNous) {
        cam.cx = S.x; cam.cd = 92;
        cam.ct = tiltPour(S.y - 172 + S.assis * 30, cam.cd, 0.25);
      } else {
        let st = enCours && ACTIVITES[enCours] && ACTIVITES[enCours].station ? STATIONS[ACTIVITES[enCours].station] : null;
        if (st && Math.abs(S.x - st.x) > 16) st = null; // (le cadrage de la machine, seulement une fois arrivé)
        const marche = S.marche > 0.05;
        const avance = marche ? Math.sign(Math.sin(S.yaw)) * 24 : 0;
        cam.cx = marche || !st ? S.x + avance : lerp(S.x, st.cam, 0.6);
        cam.cd = marche ? 18 : st ? st.zoom : 42;
        cam.ct = tiltPour(S.y - 172 + S.assis * 30, cam.cd, 0.31);
      }
      const dd = cam.cd + camOff.d;
      const [a, b] = bornesCam(dd);
      const cx = a > b ? (a + b) / 2 : clamp(cam.cx, a, b);
      // une caméra portée, à peine : elle respire
      const resp = reduit ? 0 : Math.sin(tVie * 0.37) * 0.6;
      cam.x += (cx + resp - cam.x) * k;
      cam.d += (dd - cam.d) * k * 0.9;
      cam.tilt += (cam.ct + camOff.t - cam.tilt) * k * 0.9;
    }
    function maj(dt) {
      tVie += dt / 1000;
      horloge.avance(dt);
      cl.maj(dt);
      majParole(dt);
      // les machines
      const F = M.finisseuse, s = dt / 1000;
      F.vitesse += (F.cible - F.vitesse) * (1 - Math.exp(-s * (F.cible > F.vitesse ? 1.8 : 0.9)));
      F.angle += F.vitesse * dt * 0.06;
      voixNiveau('bq-moteur', F.vitesse * 0.9);
      if (F.contact && F.vitesse > 0.3) poussiere(F.contact.x, F.contact.y, F.contact.dir, 2);
      const Cm = M.couture;
      Cm.vitesse += (Cm.cible - Cm.vitesse) * (1 - Math.exp(-s * 6));
      Cm.phase += Cm.vitesse * dt * 0.065;
      Cm.volant += Cm.vitesse * dt * 0.02;
      voixNiveau('bq-couture', Cm.vitesse);
      const Kc = M.cles;
      Kc.vitesse += (Kc.cible - Kc.vitesse) * (1 - Math.exp(-s * 3));
      if (Kc.contact && Kc.vitesse > 0.4) etincelles(Kc.contact.x, Kc.contact.y);
      // la vapeur du café
      const t = OBJ.tasse;
      if (RV() < 0.12) { const [vx, vy] = monde(t, [0, -10.5]); emettre(1, () => ({ type: 'vapeur', x: vx + (RV() - 0.5) * 3, y: vy, vx: (RV() - 0.5) * 2, vy: -6 - RV() * 5, vie: 1.6 + RV(), r: 0.8, ph: RV() * 6 })); }
      // la nuit qui tombe (ou le jour)
      nuitK += ((nuit ? 1 : 0) - nuitK) * (1 - Math.exp(-s * 2.2));
      majMains();
      majParticules(dt);
      majCamera(dt);
      majVoix();
    }

    // la visibilité : pause(), la vue de l'appli, la page, l'écran
    const vueId = opts.vue || (host.closest && host.closest('.view') && host.closest('.view').id) || 'atelier';
    let enPause = false, vueOk = !CO.view || CO.view === vueId, docOk = !document.hidden, ecranOk = true, mort = false, pret = false;
    const actif = () => pret && !mort && !enPause && vueOk && docOk && ecranOk && W > 2;
    const actifSon = () => actif() && !!(CO.sfx && CO.sfx.on);
    let raf = 0, tPrec = 0, cadence = 0, nImages = 0;
    function demander() { if (!raf && actif()) raf = requestAnimationFrame(image); }
    function image(now) {
      raf = 0;
      if (!actif()) { tPrec = 0; couperSons(); return; }
      if (tPrec && now - tPrec < 1000 / 30 - 3) { raf = requestAnimationFrame(image); return; }
      const dt = tPrec ? Math.min(70, now - tPrec) : 16;
      tPrec = now;
      const t0 = performance.now();
      maj(reduit && !transition ? 0 : dt * VITESSE);
      rendre();
      placerCibles();
      nImages++;
      cadence = cadence * 0.9 + (performance.now() - t0) * 0.1;
      if ((vivant && !reduit) || transition) raf = requestAnimationFrame(image);
    }
    function etatChange() {
      if (actif()) { tPrec = 0; demander(); } else couperSons();
    }
    CO.on && CO.on('view', (v) => { vueOk = v === vueId; etatChange(); });
    const onVis = () => { docOk = !document.hidden; etatChange(); };
    document.addEventListener('visibilitychange', onVis);
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => { ecranOk = es[es.length - 1].isIntersecting; etatChange(); }) : null;
    if (io) io.observe(host);
    let rzT = 0, s0Peint = 0, repeintTour = 0;
    const ro = window.ResizeObserver ? new ResizeObserver(() => {
      if (mort || !pret) return;
      const avant = W;
      mesurer();
      if (Math.abs(s0 - s0Peint) / (s0Peint || 1) > 0.15) { // (l'écran a tourné) : le décor repeint à la nouvelle échelle, par tranches
        clearTimeout(rzT);
        rzT = setTimeout(() => {
          if (mort) return;
          const tour = ++repeintTour, s1 = s0;
          peindreToutDoucement(() => tour !== repeintTour || mort).then(() => { if (tour !== repeintTour || mort) return; s0Peint = s1; cl.viderCaches(); rendre(); placerCibles(); });
        }, 220);
      }
      if (avant !== W || !raf) { rendre(); placerCibles(); }
      demander();
    }) : null;
    if (ro) ro.observe(host);
    // le navigateur peut reprendre la mémoire des canevas (onglet en arrière-plan, mémoire pleine) : on repeint
    cv.addEventListener('contextrestored', () => { if (mort || !pret) return; peindreTout(); cl.viderCaches(); rendre(); placerCibles(); });

    /* ---------- les zones à toucher (boutons transparents, suivent la caméra) ---------- */
    const CIBLES = [
      { id: 'clement', label: 'Clément : lui parler', boite: () => { const b = cl.boite(); return [b.x + 6, b.y - 4, b.w - 12, b.h * 0.8, K.D_LANE]; } },
      { id: 'radio', label: 'La radio : le son de l’atelier', boite: () => [D.RADIO.x - 2, -K.HAUT_COMPTOIR - 22, D.RADIO.w + 4, 23, K.D_OBJETS] },
      { id: 'carnet', label: 'Le carnet de commandes', boite: () => [D.CARNET.x - 2, -K.HAUT_COMPTOIR - 14, D.CARNET.w + 4, 16, K.D_OBJETS] },
      { id: 'photos', label: 'Les photos au mur', boite: () => [352, -180, 48, 38, K.D_MUR] },
      { id: 'etageres', label: 'Les paires qui attendent leur propriétaire', boite: () => [570, -236, 70, 128, K.D_MUR] },
      { id: 'porte', label: 'La porte : retour dans la rue', boite: () => [650, -238, 60, 238, K.D_MUR] },
    ];
    CIBLES.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cb-cible cb-' + c.id;
      b.setAttribute('aria-label', c.label);
      b.dataset.sfx = c.id === 'clement' ? 'none' : 'tap';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (c.id === 'clement') { indice = null; emit('clement'); } else emit('cible', c.id);
      });
      racine.appendChild(b);
      c.el = b;
    });
    function placerCibles() {
      CIBLES.forEach((c) => {
        const [x, y, w, h, d] = c.boite();
        const [x0, y0] = ecran(x, y, d), [x1, y1] = ecran(x + w, y + h, d);
        const L = Math.max(0, Math.min(W, x1) - Math.max(0, x0)), Hh = Math.max(0, Math.min(H, y1) - Math.max(0, y0));
        const vis = L > 14 && Hh > 14 && !(camLibre && c.id !== 'clement');
        if (c.el.hidden === vis) c.el.hidden = !vis;
        if (!vis) return;
        // au moins 44 px de côté (le doigt)
        const cx = (Math.max(0, x0) + Math.min(W, x1)) / 2, cy = (Math.max(0, y0) + Math.min(H, y1)) / 2;
        const ww = Math.max(44, L), hh = Math.max(44, Hh);
        c.el.style.transform = `translate(${(cx - ww / 2).toFixed(1)}px,${(cy - hh / 2).toFixed(1)}px)`;
        c.el.style.width = ww.toFixed(0) + 'px';
        c.el.style.height = hh.toFixed(0) + 'px';
      });
    }

    /* ---------- les mouvements de caméra de l'appli (entrée, sortie, l'établi de près) ---------- */
    let transition = 0;
    async function animer(ms, fn, ease = E.io) {
      transition++;
      demander();
      try {
        if (reduit || ms <= 0) { fn(1); return; }
        await new Promise((res) => {
          const t0 = performance.now();
          const pas = (now) => {
            const p = clamp((now - t0) / ms, 0, 1);
            fn(ease(p));
            if (p < 1 && !mort) requestAnimationFrame(pas); else res();
          };
          requestAnimationFrame(pas);
        });
      } finally { transition--; }
    }

    mesurer();
    s0Peint = s0;
    // la pose de départ : à l'établi, le marteau levé (comme on le voit depuis la rue)
    poseDepart();
    await peindreToutDoucement();
    // le premier dessin de Clément (ses images en cache) et des meules, dans leur propre tranche
    try {
      const g0 = toile(4, 4).getContext('2d'), k0 = s0 * sig(K.D_LANE) * dpr;
      g0.setTransform(k0, 0, 0, k0, 0, 0);
      cl.dessiner(g0, 'tout');
      D.ROUES.forEach((w) => texRoue(w.type));
    } catch (e) { /* rien */ }
    await new Promise((r) => setTimeout(r, 0));
    pret = true;
    maj(0);
    rendre();
    placerCibles();

    /* ======================================================================
       L'API
       ====================================================================== */
    const scene = {
      /** la vie commence (la grande boucle) */
      jouer() {
        if (mort) return;
        enPause = false;
        if (!vivant && !reduit) { vivant = true; boucle(++boucleTour); }
        if (!indiceVu()) setTimeout(montrerIndice, 1600);
        etatChange();
      },
      /** tout s'arrête (images, gestes, sons) */
      pause() { enPause = true; couperSons(); },
      /** reprend là où on en était (démarre la vie si ce n'était pas fait) */
      reprise() { if (mort) return; if (!vivant) { scene.jouer(); return; } enPause = false; etatChange(); },
      detruire() {
        mort = true; vivant = false; boucleTour++; jeton.annule = true;
        horloge.vider(); couperSons();
        if (raf) cancelAnimationFrame(raf);
        document.removeEventListener('visibilitychange', onVis);
        if (io) io.disconnect(); if (ro) ro.disconnect();
        racine.remove();
        listeners = {};
      },
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return () => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); }; },

      /** on arrive de la rue : un peu trop près, comme si on venait de passer la vitre, puis on se pose */
      entree({ ms = 1100 } = {}) {
        if (reduit) return Promise.resolve();
        camOff.d = 70; camOff.t = 0.05; vitreK = 0.7;
        cam.d = cam.cd + camOff.d; cam.tilt = cam.ct + camOff.t;
        return animer(ms, (e) => { camOff.d = 70 * (1 - e); camOff.t = 0.05 * (1 - e); vitreK = 0.7 * Math.pow(1 - e, 2); cam.d = cam.cd + camOff.d; }, E.out3);
      },
      /** on repart : la caméra recule vers la vitrine (ses montants reviennent) */
      sortie({ ms = 650 } = {}) {
        if (reduit) return Promise.resolve();
        const d0 = camOff.d;
        return animer(ms, (e) => { camOff.d = lerp(d0, -150, e); camOff.t = -0.04 * e; vitreK = e; cam.d = cam.cd + camOff.d; }, E.in3);
      },
      /** la caméra plonge sur l'établi (le film des mains prend le relais) */
      zoomEtabli({ ms = 1000 } = {}) {
        camLibre = { x: 300, d: 172, y: -99, f: 0.46 };
        placerCibles();
        if (reduit) { cam.x = cam.cx = 300; cam.d = cam.cd = 172; cam.tilt = cam.ct = tiltPour(-99, 172, 0.46); rendre(); return Promise.resolve(); }
        const x0 = cam.x, d0 = cam.d, t0 = cam.tilt, t1 = tiltPour(-99, 172, 0.46);
        return animer(ms, (e) => { cam.x = lerp(x0, 300, e); cam.d = lerp(d0, 172, e); cam.tilt = lerp(t0, t1, e); }, E.io);
      },
      dezoom({ ms = 800 } = {}) {
        camLibre = null;
        if (reduit) { poseDepart(); rendre(); placerCibles(); return Promise.resolve(); }
        return animer(ms, () => {}, E.io);
      },

      clement: {
        /** il finit (ou interrompt) son geste, pose l'outil, se tourne vers nous → Promise */
        regarder,
        /** la bouche et les mains pendant que la bulle s'écrit */
        parler(on) {
          parle = !!on;
          if (reduit) { S.bouche = on ? 0.35 : 0; rendre(); return; }
          if (!on) { ['D', 'G'].forEach((c) => { if (mainDe(c).pose === 'geste') mainLibre(c); }); S.sourcils = 0; }
          demander();
        },
        /** il retourne au travail */
        reprendre() {
          parle = false;
          if (!regardeNous) return;
          regardeNous = false;
          S.bouche = 0;
          if (reduit) { poseDepart(); rendre(); placerCibles(); return; }
          tw(400, (e) => { S.sourire = S.sourire * (1 - e); }, E.io);
          if (reprendreRes) reprendreRes();
          demander();
        },
        /** sa tête à l'écran (px, repère de la fenêtre) : la queue de la bulle pointe là */
        tete() {
          const t = cl.tete(), [x, y] = ecran(t.x, t.y), r = host.getBoundingClientRect();
          return { x: r.left + x, y: r.top + y, haut: r.top + ecran(t.x, t.haut)[1] };
        },
      },

      // pour le labo et les tests
      faire(id) { if (!ACTIVITES[id] || reduit) return; force = id; if (!vivant) scene.jouer(); else if (!regardeNous) jeton.annule = true; },
      /** le temps de la scène à la main (labo, captures) : pause() d'abord, puis pas(ms) avance de ms et dessine */
      pas(ms = 33) { maj(ms); rendre(); placerCibles(); },
      get activites() { return Object.keys(ACTIVITES); },
      setNuit(on) { nuit = !!on; if (reduit) { nuitK = nuit ? 1 : 0; rendre(); } demander(); },
      perf: PERF,
      tempsSprites: TEMPS_SPRITE,
      etat() { return { drapeaux: { pret, mort, enPause, vueOk, docOk, ecranOk, W, vivant, raf: !!raf }, voix: Object.keys(voix).filter((k) => voix[k].v), memoire: Math.round(Object.values(SP).reduce((m, sp) => m + (sp ? sp.c.width * sp.c.height * 4 : 0), 0) / 1048576) + ' Mo', images: nImages, caches: cl.stats, activite: enCours, x: S.x, regardeNous, parle, nuit, particules: PART.length, cadence: +cadence.toFixed(2), cam: { x: +cam.x.toFixed(1), d: +cam.d.toFixed(1), tilt: +cam.tilt.toFixed(3) } }; },
    };
    function poseDepart() {
      S.x = STATIONS.etabli.x; S.yaw = 0; S.assis = 0; S.lean = 0.2; S.tete.turn = 0; S.tete.pitch = 0.5; S.regard = [0, -0.4]; S.sourire = 0; S.bouche = 0;
      S.mainD.mode = 'fixe'; S.mainD.coude = 0.75; S.mainD.x = 268; S.mainD.y = -158; S.mainD.pose = 'poing'; S.mainD.angle = -1.65; S.mainD.devant = true;
      prendre('D', marteau); marteau.aMonde = -1.35;
      S.mainG.mode = 'fixe'; S.mainG.x = 306; S.mainG.y = -127.6; S.mainG.pose = 'pince'; S.mainG.devant = true;
      cam.x = cam.cx = STATIONS.etabli.cam; cam.d = cam.cd = STATIONS.etabli.zoom; cam.tilt = cam.ct = tiltPour(-172, cam.d, 0.31);
    }
    const indiceVu = () => CO.store && CO.store.get('boutique-indice', false);
    function montrerIndice() {
      if (mort || indiceVu() || regardeNous) return;
      if (!actif()) { setTimeout(montrerIndice, 1500); return; }
      indice = { t0: tVie };
      if (CO.store) CO.store.set('boutique-indice', true);
      if (reduit) { transition++; demander(); setTimeout(() => { transition--; indice = null; rendre(); }, 2700); }
    }
    return scene;
  }

  function police(v, repli) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || repli; } catch (e) { return repli; }
  }

  CO.Boutique = { create };
})();
