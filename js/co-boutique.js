/* ==========================================================================
   Cordo 63 — la boutique vue de l'intérieur : Clément à ses machines
   « J'inverse l'atelier et la boutique avec l'ambition que l'on me voie travailler. Je suis ma
   vitrine. » On vient de passer la vitrine : de l'autre côté du comptoir, le mur de pierre, la
   presse bleue, la finisseuse rouge (SUR mini II), l'établi et son pied de fer, la machine à
   coudre, le coin des baskets, les clés ; et Clément qui va de l'un à l'autre, dans une grande
   boucle au hasard (js/co-clement.js le dessine, js/co-boutique-decor.js peint le décor).
   Des calques de profondeur empilés (une vraie parallaxe : chaque calque a sa distance) :
     plafond (poutres) → mur (une image) → machines (images) → Clément → meubles devant lui →
     ses bras, ce qu'il tient → la lumière (lampes, poussière) → le comptoir du premier plan
     (planches en perspective) et ses objets → le soir.
   Le décor peint une fois est déplacé par la caméra (transform CSS : le compositeur, rien ne se
   repeint) ; seul ce qui bouge se peint à chaque image, dans des canevas à sa taille (voir « Les
   calques » plus bas). La caméra suit Clément (travelling, approche, bascule) ; à ~30 images/s, et
   plus rien du tout quand la scène ne se voit pas (pause(), vue cachée, page cachée, hors écran) :
   sons coupés.

   À inclure après co-core.js (co-brand.js facultatif : le logo de l'imposte) :
     js/co-clement.js, js/co-boutique-decor.js, js/co-boutique.js (s'ils manquent, co-boutique.js
     charge lui-même les deux premiers, à côté de lui).

   CO.Boutique.create(host, { nuit, graine, adaptatif }) → Promise<scène>   (nuit : sinon ?soir / ?nuit dans l'adresse ;
     adaptatif : false fige la densité des calques, pour les captures)
     La création peint le décor par tranches (pas de longue tâche ; en veille quand on touche ou fait
     défiler l'écran) ; la scène est immobile jusqu'à jouer().
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
  /** un dégradé fait une fois pour les mêmes points et les mêmes couleurs (un dégradé ne tient à aucun canevas : son
      repère est celui du dessin qui le pose) ; fn : lin ou rad de co-boutique-decor.js */
  function memoDegrade(fn) {
    const m = new Map();
    return (g, ...a) => {
      const cle = a.map((v) => (Array.isArray(v) ? v.join(';') : v)).join('|');
      let d = m.get(cle);
      if (!d) { if (m.size > 600) m.clear(); d = fn(g, ...a); m.set(cle, d); }
      return d;
    };
  }

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
    A('bq-clou', (c, d, t, op, o) => { o.strike(c, d, t, 3400, 'metal', { d: 0.03, v: 0.018 * (op.v || 1) }); }, 50);
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
    const { rgba, rr, toile } = D.outils;
    // (les dégradés de la scène sont faits une fois : un dégradé ne tient à aucun canevas, son repère est celui du dessin)
    const lin = memoDegrade(D.outils.lin), rad = memoDegrade(D.outils.rad);
    /** une lueur ou une ombre douce (D.outils.tache, son dégradé fait une fois) */
    const tache = (g, x, y, rx, ry, couleur, a) => {
      g.save(); g.translate(x, y); g.scale(1, ry / rx);
      g.fillStyle = rad(g, 0, 0, rx, [[0, rgba(couleur, a)], [0.5, rgba(couleur, a * 0.45)], [1, rgba(couleur, 0)]]);
      g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
      g.restore();
    };
    const FAM = police('--chiffres', 'sans-serif'), FAM_SANS = police('--sans', 'sans-serif');
    const graine = opts.graine == null ? 63 : opts.graine;
    const R = CO.rng(graine), RV = CO.rng(graine * 7 + 1); // le hasard (seedé) ; RV : la vie courante
    const reduit = !!CO.reduced;
    const VITESSE = +opts.vitesse || 1; // (tests : le temps accéléré)

    /* ---------- le DOM : les calques, les zones à toucher ---------- */
    const cs = getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    host.style.overflow = 'hidden';
    const racine = document.createElement('div');
    racine.className = 'co-boutique';
    // (son fond est opaque : les calques de lumière, posés en « écran » ou en « produit », ne se fondent qu'avec la scène ;
    //  sans isolation, le compositeur n'a pas de passe de rendu de plus)
    racine.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#1A130E;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:pan-y';
    const style = document.createElement('style');
    // (les canevas gardent leur taille naturelle, celle de leurs px : la page leur impose max-width: 100%)
    style.textContent = '.co-boutique .cb-c{position:absolute;left:0;top:0;display:block;max-width:none;max-height:none;transform-origin:0 0;pointer-events:none;will-change:transform}' +
      '.co-boutique .cb-cible{position:absolute;left:0;top:0;margin:0;padding:0;border:0;background:transparent;cursor:pointer;touch-action:pan-y;-webkit-tap-highlight-color:transparent;border-radius:14px;outline:none}' +
      '.co-boutique .cb-cible:focus-visible{box-shadow:0 0 0 2px rgba(255,233,176,.9),0 0 0 5px rgba(43,36,32,.5)}' +
      '.co-boutique .cb-cible[hidden]{display:none}';
    racine.appendChild(style);
    host.appendChild(racine);

    /* ---------- les mesures, la caméra ---------- */
    let W = 0, H = 0, dpr = 1, s0 = 1, Yh0 = 0;
    const cam = { x: STATIONS.etabli.cam, d: STATIONS.etabli.zoom, tilt: 0.12, cx: STATIONS.etabli.cam, cd: STATIONS.etabli.zoom, ct: 0.12 }; // c… : la cible
    function mesurer() {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || 2);
      s0 = Math.min(W / K.VUE, H / 330);
      Yh0 = 0.8 * H - (K.OEIL - K.HAUT_COMPTOIR) * s0 * (K.D_LANE / K.D_COMPTOIR);
    }
    const sig = (d) => K.D_LANE / Math.max(14, d - cam.d);
    /** la bascule qui met le point y (plan de Clément) à la fraction f de la hauteur, pour une approche donnée */
    const tiltPour = (y, dolly, f) => (Yh0 - (f * H - (y + K.OEIL) * s0 * K.D_LANE / Math.max(14, K.D_LANE - dolly))) / H;
    const Yh = () => Yh0 - cam.tilt * H;
    /** un point du monde (x, y) à la profondeur d → px dans l'hôte */
    function ecran(x, y, d = K.D_LANE) { const s = s0 * sig(d); return [W / 2 + (x - cam.x) * s, Yh() + (y + K.OEIL) * s]; }
    /** quelle abscisse la caméra doit viser pour qu'un point x du plan de Clément soit au centre */
    const bornesCam = (d) => { const demi = W / 2 / (s0 * K.D_LANE / Math.max(14, K.D_LANE - d)); return [K.MONDE.x0 + demi + 4, K.MONDE.x1 - demi - 4]; };

    /* ======================================================================
       Les calques, empilés dans l'ordre où se peignait l'image : le plafond ; le mur et ses images ; les lampes, la
       presse, la finisseuse ; leurs pièces qui bougent ; Clément ; les meubles devant lui ; les objets posés ; ses bras,
       ce qu'il tient, la poussière ; la lumière des lampes ; le comptoir et ses objets ; le soir ; le vignettage ; la vitre.
       - Les images du décor (peintes une fois) sont posées dans des plans (des div) que la caméra déplace et met à
         l'échelle (transform) : le compositeur s'en charge, rien ne se repeint.
       - Ce qui bouge sans cesse (Clément, ses bras, la poussière qui flotte) se peint à chaque image, dans des canevas
         de la taille de sa zone.
       - Le reste (les pièces des machines, les objets posés, la lumière, le comptoir, le soir) ne se repeint que quand il
         change, ou quand la caméra l'a trop agrandi ou trop déplacé ; entre deux, il glisse avec elle.
       La lumière des lampes et le soir se posent comme avant (écran, produit) : mix-blend-mode, sur le fond opaque de la racine.
       La densité (px par px CSS) : ≤ 2 ; les calques flous ou lents à peindre, moins ; tout baisse si les images traînent.
       ====================================================================== */
    const CANEVAS = new Set(); // les canevas des calques (pour compter leur mémoire)
    function calque(tag = 'canvas', css = '') {
      const e = document.createElement(tag);
      e.className = 'cb-c';
      if (css) e.style.cssText = css;
      e.setAttribute('aria-hidden', 'true');
      if (tag === 'canvas') { e.width = e.height = 0; CANEVAS.add(e); }
      racine.appendChild(e);
      return e;
    }
    const montrer = (e, on) => { if (e._vu !== on) { e._vu = on; e.style.visibility = on ? '' : 'hidden'; } };
    const opacite = (e, a) => { const v = a >= 0.9995 ? '' : a.toFixed(3); if (e._op !== v) { e._op = v; e.style.opacity = v; } };
    const mat = (a, d, e, f) => `matrix(${a.toFixed(6)},0,0,${d.toFixed(6)},${e.toFixed(3)},${f.toFixed(3)})`;
    const poserTf = (o, tf) => { if (o.tf !== tf) { o.tf = tf; o.c.style.transform = tf; } };
    const etendre = (b, x0, y0, x1, y1) => (b ? [Math.min(b[0], x0), Math.min(b[1], y0), Math.max(b[2], x1), Math.max(b[3], y1)] : [x0, y0, x1, y1]);
    const unir = (a, b) => (!a ? b : !b ? a : etendre(a, b[0], b[1], b[2], b[3]));
    // la densité adaptative (image() la règle) : les calques vifs (Clément, les objets), les calques flous (la lumière)
    let qVive = 1, qFloue = 1;
    const densite = (q) => Math.max(Math.min(1, dpr), dpr * q); // (jamais sous 1 px par px CSS, sauf écran plus grossier)
    /** un canevas assez grand pour bw × bh px (avec du jeu) ; rendu à la mémoire quand il est un moment bien trop grand */
    function dimensionner(o, bw, bh, maxW, maxH) {
      const c = o.c, assez = bw <= c.width && bh <= c.height;
      if (assez && c.width * c.height <= 1.8 * bw * bh + 8192) { o.trop = 0; return false; }
      if (assez && ++o.trop < 45) return false;
      c.width = Math.max(bw, Math.min(maxW, Math.ceil(bw * 1.08 / 16) * 16));
      c.height = Math.max(bh, Math.min(maxH, Math.ceil(bh * 1.08 / 16) * 16));
      o.trop = 0; o.bw = o.bh = 0;
      return true;
    }

    /* ---------- les zones : ce qui bouge sans cesse, peint à chaque image là où il est ---------- */
    function zone(css) { return { c: calque('canvas', css), g: null, dens: 1, x0: 0, y0: 0, bw: 0, bh: 0, tf: '', trop: 0, vide: 0 }; }
    /** prépare la zone r = [x0, y0, x1, y1] (px de l'hôte) pour l'image : sa taille, l'effacement, sa place ; false si vide */
    function ouvrir(Z, r, dens) {
      const g = Z.g || (Z.g = Z.c.getContext('2d'));
      let x0 = 0, y0 = 0, bw = 0, bh = 0;
      if (r) {
        // (calée sur la grille des px du canevas : un dessin net, comme sur l'ancien grand canevas)
        x0 = Math.floor(Math.max(0, r[0]) * dens) / dens; y0 = Math.floor(Math.max(0, r[1]) * dens) / dens;
        bw = Math.ceil(Math.min(W, r[2]) * dens) - Math.round(x0 * dens); bh = Math.ceil(Math.min(H, r[3]) * dens) - Math.round(y0 * dens);
      }
      if (bw <= 0 || bh <= 0) {
        if (Z.bw) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, Z.bw, Z.bh); Z.bw = Z.bh = 0; }
        montrer(Z.c, false);
        if (Z.c.width && ++Z.vide > 60) Z.c.width = Z.c.height = 0; // (vide depuis deux secondes : sa mémoire rendue)
        return false;
      }
      Z.vide = 0;
      if (dens !== Z.dens) { Z.dens = dens; Z.c.width = Z.c.height = 0; }
      dimensionner(Z, bw, bh, Math.ceil(W * dens) + 2, Math.ceil(H * dens) + 2);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // (tout le canevas : ce qu'on dessine déborde parfois de la zone, hors de l'écran ; rien ne doit en rester)
      g.clearRect(0, 0, Z.c.width, Z.c.height);
      Z.bw = bw; Z.bh = bh; Z.x0 = x0; Z.y0 = y0;
      poserTf(Z, mat(1 / dens, 1 / dens, x0, y0));
      montrer(Z.c, true);
      return true;
    }
    /** le repère du monde au plan d, sur une zone (pour dessiner en cm) */
    function repereZone(Z, d = K.D_LANE) {
      const s = s0 * sig(d), k = Z.dens;
      Z.g.setTransform(s * k, 0, 0, s * k, (W / 2 - cam.x * s - Z.x0) * k, (Yh() + K.OEIL * s - Z.y0) * k);
    }
    /** une boîte du monde (au plan d) → px de l'hôte, avec la marge de l'antialiasing */
    function zoneEcran(b, d = K.D_LANE) {
      if (!b) return null;
      const s = s0 * sig(d), Y = Yh();
      return [W / 2 + (b[0] - cam.x) * s - 2, Y + (b[1] + K.OEIL) * s - 2, W / 2 + (b[2] - cam.x) * s + 2, Y + (b[3] + K.OEIL) * s + 2];
    }

    /* ---------- les couches : peintes au plan d (le monde, en cm), repeintes seulement quand il le faut ---------- */
    function couche(o) { return Object.assign({ c: calque('canvas', o.css), g: null, q: 1, net: true, marge: 0.12, sig: '', R: null, tf: '', trop: 0, bw: 0, bh: 0, sale: true, cachee: 0 }, o); }
    const frac = (v) => Math.abs(v - Math.round(v));
    /** pose (et repeint s'il le faut) la couche L : son contenu a changé (signature), la caméra l'a trop agrandi, on sort de
        la partie peinte, ou (écran dont la densité est celle du canevas) un décalage d'une fraction de px l'adoucirait */
    function majCouche(L) {
      const s = s0 * sig(L.d), Y = Yh();
      const B = L.visible && !L.visible() ? null : L.bornes();
      const vx0 = cam.x - W / 2 / s, vx1 = cam.x + W / 2 / s, vy0 = -Y / s - K.OEIL, vy1 = (H - Y) / s - K.OEIL;
      if (!B || Math.min(vx1, B[2]) <= Math.max(vx0, B[0]) || Math.min(vy1, B[3]) <= Math.max(vy0, B[1])) {
        montrer(L.c, false);
        if (L.c.width && ++L.cachee > 60) { L.c.width = L.c.height = 0; L.bw = L.bh = 0; L.R = null; } // (cachée depuis deux secondes : sa mémoire rendue)
        return;
      }
      L.cachee = 0;
      const dens = densite(L.q * (L.net ? qVive : qFloue));
      const sg = L.signature ? L.signature() : '';
      const r0 = L.R;
      let refaire = L.sale || !r0 || sg !== L.sig || r0.dens !== dens || Math.abs(s / r0.s - 1) > (L.net ? 0.01 : 0.04) ||
        Math.max(vx0, B[0]) < r0.x0 || Math.min(vx1, B[2]) > r0.x1 || Math.max(vy0, B[1]) < r0.y0 || Math.min(vy1, B[3]) > r0.y1;
      for (let passe = 0; passe < 2; passe++) {
        if (refaire) {
          // la fenêtre peinte : ce qu'on voit, avec de la marge (la caméra peut glisser sans repeindre), dans la boîte du contenu
          const mx = (vx1 - vx0) * L.marge, my = (vy1 - vy0) * L.marge;
          const x0 = Math.max(B[0], vx0 - mx), x1 = Math.min(B[2], vx1 + mx), y0 = Math.max(B[1], vy0 - my), y1 = Math.min(B[3], vy1 + my);
          const Xa = Math.floor((W / 2 + (x0 - cam.x) * s) * dens) / dens, Ya = Math.floor((Y + (y0 + K.OEIL) * s) * dens) / dens;
          const bw = Math.ceil((W / 2 + (x1 - cam.x) * s - Xa) * dens) + 1, bh = Math.ceil((Y + (y1 + K.OEIL) * s - Ya) * dens) + 1;
          const g = L.g || (L.g = L.c.getContext('2d'));
          if (!r0 || r0.dens !== dens) L.c.width = L.c.height = 0;
          dimensionner(L, bw, bh, bw * 2, bh * 2);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
          g.clearRect(0, 0, L.c.width, L.c.height); // (tout : le dessin déborde de la fenêtre)
          L.bw = bw; L.bh = bh;
          g.setTransform(s * dens, 0, 0, s * dens, (W / 2 - cam.x * s - Xa) * dens, (Y + K.OEIL * s - Ya) * dens);
          g.lineCap = 'round'; // (l'état qu'avait le grand canevas à ce moment de l'image)
          L.peindre(g, s);
          L.R = { s, cx: cam.x, Y, Xa, Ya, x0, x1, y0, y1, dens };
          L.sig = sg; L.sale = false;
        }
        // la transformation : px de la couche → px de l'hôte
        const R2 = L.R, k = s / R2.s;
        const tx = W / 2 - cam.x * s + k * (R2.Xa - W / 2 + R2.cx * R2.s), ty = Y + K.OEIL * s + k * (R2.Ya - R2.Y - K.OEIL * R2.s);
        if (!refaire && L.net && Math.abs((window.devicePixelRatio || 1) - dens) < 0.01 && (frac(tx * dens) > 0.3 || frac(ty * dens) > 0.3)) { refaire = true; continue; }
        poserTf(L, mat(k / dens, k / dens, tx, ty));
        break;
      }
      montrer(L.c, true);
    }

    /* ---------- les plans : les images du décor à la profondeur d (leur repère : le monde, en cm) ---------- */
    function plan(d, noms) { return { d, noms, c: calque('div'), tf: '' }; }
    function poserPlan(P) { const s = s0 * sig(P.d); poserTf(P, mat(s, s, W / 2 - cam.x * s, Yh() + K.OEIL * s)); }
    /** les images (peintes) prennent leur place dans leur plan, dans l'ordre */
    function accrocher(P) {
      P.c.replaceChildren(...P.noms.map((n) => SP[n]).filter(Boolean).map((sp) => {
        const c = sp.c;
        c.className = 'cb-c';
        c.setAttribute('aria-hidden', 'true');
        c.style.transform = mat(sp.w / c.width, sp.h / c.height, sp.x, sp.y);
        return c;
      }));
    }

    /* ---------- les images du décor (peintes une fois, à la bonne résolution) ---------- */
    const SP = {};
    let fileSprites = null; // quand elle existe : les images à peindre plus tard, par tranches
    const TEMPS_SPRITE = {};
    function sprite(nom, x, y, w, h, q, peindre) {
      if (fileSprites) { const f = () => sprite(nom, x, y, w, h, q, peindre); f.nom = nom; fileSprites.push(f); return null; }
      const t0 = performance.now();
      const Rz = s0 * dpr * q;
      const c = toile(w * Rz, h * Rz), g = c.getContext('2d');
      g.setTransform(Rz, 0, 0, Rz, -x * Rz, -y * Rz);
      const r = peindre(g);
      const fin = () => { if (pasAPas) pixelliser(c); TEMPS_SPRITE[nom] = Math.round(performance.now() - t0); return (SP[nom] = { c, x, y, w, h }); };
      if (r && typeof r.next === 'function') { // un peintre pas à pas (générateur)
        if (pasAPas) return { iter: r, fin, pixelliser: () => pixelliser(c) };
        while (!r.next().done);
      }
      return fin();
    }
    let pasAPas = false, petitCtx = null;
    const petit = () => petitCtx || (petitCtx = toile(256, 256).getContext('2d'));
    /** (Chrome enregistre les dessins et ne les pixellise qu'au premier usage : on force la pixellisation au fil de la
        préparation, par tranches, plutôt qu'à la première image ; la copie va à un canevas accéléré : rien ne se relit) */
    function pixelliser(c) { try { petit().drawImage(c, 0, 0, 1, 1); } catch (e) { /* rien */ } }
    // la préparation se met en veille quand on touche ou qu'on fait défiler l'écran, et pendant l'ouverture aux lacets
    let finOccupe = 0, nPrepa = 0;
    const EV_OCCUPE = ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel', 'scroll', 'keydown'];
    const toucher = (e) => { if (e.type !== 'pointermove' || e.buttons) finOccupe = performance.now() + 450; };
    const occupe = () => performance.now() < finOccupe || !!document.querySelector('#splash.lance');
    if (CO.on) CO.on('ouverture', () => { finOccupe = Math.max(finOccupe, performance.now() + 900); }); // (le dévoilement de l'appli)
    /** rendre la main jusqu'à un moment calme ; → le temps qu'on peut prendre (ms) avant de la rendre encore */
    async function repos() {
      for (let k = 0; ; k++) {
        const libre = await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback((dl) => r(dl.timeRemaining()), { timeout: 250 }) : setTimeout(() => r(8), 16)));
        if (mort || vueOk) return 20; // (la scène est attendue : de plus grandes tranches)
        if (!occupe() || k > 60) return clamp(libre, 5, 12);
      }
    }
    /** tout peindre, en rendant la main entre deux pas (jamais de longue tâche : l'accueil reste fluide) */
    const TRANCHES = {}; // (le labo) le plus long pas de chaque préparation, en ms
    async function peindreToutDoucement(abandon = () => false, suite = []) {
      fileSprites = [];
      peindreTout();
      const tex = () => ({ iter: D.prechauffer(), fin() {} }), texC = () => ({ iter: CO.Clement.prechauffer(), fin() {} });
      tex.nom = 'textures'; texC.nom = 'textures Clément';
      const file = [tex, texC].concat(fileSprites, suite);
      fileSprites = null;
      if (!nPrepa++) EV_OCCUPE.forEach((t) => window.addEventListener(t, toucher, { capture: true, passive: true }));
      pasAPas = true;
      const noter = (nom, t0) => { const dt = Math.round(performance.now() - t0); if (!(TRANCHES[nom] >= dt)) TRANCHES[nom] = dt; };
      try {
        let budget = await repos(), t = performance.now();
        for (const f of file) {
          if (abandon()) return false;
          let t0 = performance.now();
          const r = f();
          noter(f.nom || '?', t0);
          if (r && r.iter) {
            for (;;) {
              t0 = performance.now();
              const fini = r.iter.next().done;
              if (!fini && r.pixelliser) r.pixelliser();
              noter(f.nom || '?', t0);
              if (fini) break;
              if (performance.now() - t > budget) { budget = await repos(); t = performance.now(); if (abandon()) return false; }
            }
            t0 = performance.now();
            r.fin();
            noter(f.nom || '?', t0);
          }
          if (performance.now() - t > budget) { budget = await repos(); t = performance.now(); }
        }
      } finally {
        pasAPas = false;
        if (!--nPrepa) EV_OCCUPE.forEach((t) => window.removeEventListener(t, toucher, { capture: true }));
      }
      return true;
    }
    const LAMPES = [
      { x: 48, y: -226, c: '#232323', l: 16 }, { x: 166, y: -224, c: '#232323', l: 18 }, { x: 303, y: -198, c: '#2F5A47', l: 22 },
      { x: 412, y: -222, c: '#232323', l: 17 }, { x: 540, y: -216, c: '#6B4A33', l: 20 },
    ];
    let nuit = opts.nuit != null ? !!opts.nuit : /[?&](soir|nuit)(=|&|$)/.test(location.search);
    const porte = (soir) => sprite(soir ? 'porteNuit' : 'porteJour', 650, -238, 64, 240, 0.9, (g) => D.peindrePorte(g, 660, -232, 46, 232, soir, FAM));
    function peindreTout() {
      const rr2 = CO.rng(graine + 5);
      sprite('mur', -60, -300, 820, 302, 0.72, function* (g) {
        yield* D.peindreMurPas(g, -60, 760, -300, false, LAMPES);
        D.peindreClim(g, 24, -262);
        D.planche(g, 128, -190, 60);
        D.basket(g, 132, -190, 17, D.PAIRES[0]); D.basket(g, 151, -190, 17, D.PAIRES[5]); D.basket(g, 170, -190, 16, D.PAIRES[1]);
        yield;
        D.peindreArmoire(g, 256, -208);
        D.planche(g, 300, -216, 150);
        let px = 304;
        [3, 8, 4, 0, 6, 2, 7].forEach((k) => { D.basket(g, px, -216, 17 + rr2() * 2, D.PAIRES[k]); px += 20.5; });
        yield;
        D.peindreRatelier(g, 262, -152, 84);
        D.peindrePolaroids(g, 354, -178, rr2);
        yield;
        D.peindrePendule(g, 470, -188, FAM);
        D.peindreCles(g, 510, -176, 40, 46);
        yield;
        D.peindreEtageres(g, 572, -212, 66, rr2);
        D.peindreSac(g, 648, -182);
      });
      SP.small = null;
      sprite('small', 196, -250, 70, 90, 0.9, (g) => D.peindreSmall(g, 234, -206, false, FAM));
      // (la porte du jour ou celle du soir : l'autre se peint si l'on passe de l'un à l'autre)
      SP.porteJour = SP.porteNuit = null;
      porte(nuit);
      sprite('presse', 2, -200, 92, 204, 1.35, (g) => D.peindrePresse(g));
      sprite('finisseuse', 88, -236, 148, 240, 1.35, (g) => D.peindreFinisseusePas(g, FAM));
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

    /* ---------- les dégradés faits une fois, dans un repère unité (chaque dessin les pose à sa place) ---------- */
    const DEG = {};
    const degV = (nom, stops) => DEG[nom] || (DEG[nom] = lin(petit(), 0, 0, 0, 1, stops)); // de (0, 0) à (0, 1)
    const degR = (nom, stops) => DEG[nom] || (DEG[nom] = rad(petit(), 0, 0, 1, stops)); // centre (0, 0), rayon 1
    /** remplit le rectangle (x, y, w, h) avec le dégradé unité posé en (ox, oy) à l'échelle (kx, ky) : comme le dégradé
        de (ox, oy) à (ox, oy + ky) (vertical), ou centré en (ox, oy) de rayon kx (radial) */
    function rectDeg(g, deg, ox, oy, kx, ky, x, y, w, h) {
      if (!(Math.abs(kx) > 1e-9 && Math.abs(ky) > 1e-9)) return; // (un dégradé de longueur nulle ne peint rien)
      g.save();
      g.transform(kx, 0, 0, ky, ox, oy);
      g.fillStyle = deg;
      g.fillRect((x - ox) / kx, (y - oy) / ky, w / kx, h / ky);
      g.restore();
    }

    /* ---------- les calques, de l'arrière à l'avant ---------- */
    const L_PLAFOND = { c: calque(), cle: '', tf: '', trop: 0, bw: 0, bh: 0, vide: 0 };
    const P_MUR = plan(K.D_MUR, ['mur', 'porteJour', 'porteNuit', 'small']);
    const L_AIGUILLES = couche({ d: K.D_MUR, marge: 0.1, bornes: () => [460, -198, 480, -178], signature: sigAiguilles, peindre: peindreAiguilles });
    const P_FOND = plan(K.D_LANE, ['lampe0', 'lampe1', 'lampe2', 'lampe3', 'lampe4', 'presse', 'finisseuse']);
    const L_MACHINES = couche({ d: K.D_LANE, bornes: bornesMachines, signature: sigMachines, peindre: peindreMachines });
    const Z_CORPS = zone();
    const P_MEUBLES = plan(K.D_LANE, ['etabli', 'couture', 'nettoyage', 'cles']);
    const L_TABLE = couche({ d: K.D_LANE, bornes: bornesTable, signature: sigTable, peindre: peindreTable });
    const Z_DEVANT = zone();
    const L_LUMIERE = couche({ d: K.D_LANE, css: 'mix-blend-mode:screen', q: 0.5, net: false, marge: 0.15, bornes: () => bornesLumiere(false), signature: () => nuitK.toFixed(4), peindre: (g) => peindreCones(g, false) });
    const L_LUMIERE540 = couche({ d: K.D_LANE, css: 'mix-blend-mode:screen', q: 0.5, net: false, marge: 0.15, bornes: () => bornesLumiere(true), signature: () => nuitK.toFixed(4), peindre: (g) => peindreCones(g, true) });
    const Z_MOUTES = zone('mix-blend-mode:screen');
    const L_COMPTOIR = { c: calque(), g: null, R: null, tf: '', trop: 0, bw: 0, bh: 0, motif: null, vide: 0 };
    const P_OBJETS = plan(K.D_OBJETS, OBJETS_COMPTOIR);
    const P_PREMIER = plan(D_PREMIER, PREMIER_PLAN);
    const L_SOIR = { c: calque('canvas', 'mix-blend-mode:multiply'), cle: '', tf: '' };
    const L_SOIR_HALOS = couche({ d: K.D_LANE, css: 'mix-blend-mode:screen', q: 0.5, net: false, visible: () => nuitK > 0.001, bornes: () => bornesHalos(), peindre: peindreHalosSoir });
    const L_RADIO = couche({ d: K.D_OBJETS, css: 'mix-blend-mode:screen', visible: () => !!(CO.sfx && CO.sfx.on), bornes: bornesRadio, peindre: peindreRadioLueur });
    const L_RADIO_AIGUILLE = couche({ d: K.D_OBJETS, marge: 0.1, visible: () => !!(CO.sfx && CO.sfx.on), bornes: bornesRadio, signature: () => aiguilleRadio().toFixed(2), peindre: peindreRadioAiguille });
    const L_SMALL = couche({ d: K.D_MUR, css: 'mix-blend-mode:screen', q: 0.5, net: false, visible: () => nuitK > 0.02, bornes: () => [190, -250, 278, -162], peindre: peindreSmallVive });
    const L_VIGNETTE = { c: calque(), cle: '', tf: '' };
    const L_INDICE = { c: calque('canvas', 'mix-blend-mode:screen'), r: 0, dens: 0, tf: '' };
    const L_VITRE = { c: calque(), g: null, tf: '', trop: 0, bw: 0, bh: 0 };
    // (leurs noms, pour le labo et les mesures)
    const CALQUES = { plafond: L_PLAFOND, mur: P_MUR, aiguilles: L_AIGUILLES, fond: P_FOND, machines: L_MACHINES, corps: Z_CORPS, meubles: P_MEUBLES, table: L_TABLE, devant: Z_DEVANT,
      lumiere: L_LUMIERE, lumiere540: L_LUMIERE540, moutes: Z_MOUTES, comptoir: L_COMPTOIR, objets: P_OBJETS, premier: P_PREMIER, soir: L_SOIR, halos: L_SOIR_HALOS,
      radio: L_RADIO, aiguilleRadio: L_RADIO_AIGUILLE, small: L_SMALL, vignette: L_VIGNETTE, indice: L_INDICE, vitre: L_VITRE };
    Object.entries(CALQUES).forEach(([n, L]) => { L.c.dataset.calque = n; });

    /* ---------- le plafond (poutres en perspective) : peint quand on le voit (une bande en haut, rarement) ---------- */
    const POUTRES = [305, 280, 255, 230, 205, 180, 155];
    const yPl = (d, y) => Yh() + (y + K.OEIL) * s0 * sig(d);
    function majPlafond() {
      const L = L_PLAFOND, yMur = yPl(K.D_MUR, -290);
      if (yMur <= 0) { montrer(L.c, false); if (L.c.width && ++L.vide > 60) { L.c.width = L.c.height = 0; L.bw = L.bh = 0; L.cle = ''; } return; }
      L.vide = 0;
      const cle = [cam.x, cam.d, cam.tilt, W, H, dpr, qVive].join(',');
      if (cle !== L.cle) {
        L.cle = cle;
        // (jusqu'au bas des poutres : le mur, devant, cache ce qui dépasse)
        let bas = yMur + 1;
        POUTRES.forEach((d) => { if (d - cam.d < 20) return; const yb = yPl(d - 6, -276), yh = yPl(d - 6, -290), yl = yPl(d + 6, -276); if (yh > H || yb < -40) return; bas = Math.max(bas, yb + 0.5, yl + 0.5); });
        const dens = densite(qVive), bw = Math.ceil(W * dens), bh = Math.ceil(Math.min(H, bas) * dens) + 1;
        const g = L.g || (L.g = L.c.getContext('2d'));
        if (L.dens !== dens) { L.dens = dens; L.c.width = L.c.height = 0; }
        dimensionner(L, bw, bh, bw, Math.ceil(H * dens) + 2);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, L.c.width, L.c.height);
        g.setTransform(dens, 0, 0, dens, 0, 0);
        peindrePlafond(g, yMur);
        poserTf(L, mat(1 / dens, 1 / dens, 0, 0));
      }
      montrer(L.c, true);
    }
    function peindrePlafond(g, yMur) {
      rectDeg(g, degV('plafond', [[0, '#18110C'], [1, '#2E2119']]), 0, 0, 1, yMur, 0, 0, W, yMur + 1);
      POUTRES.forEach((d) => {
        if (d - cam.d < 20) return;
        const yb = yPl(d - 6, -276), yh = yPl(d - 6, -290), yl = yPl(d + 6, -276);
        if (yh > H || yb < -40) return;
        // le dessous de la poutre (éclairé par les lampes), sa face
        rectDeg(g, degV('poutreDessous', [[0, '#5A4230'], [1, '#3E2C20']]), 0, yb, 1, yl - yb, 0, Math.min(yb, yl), W, Math.abs(yl - yb) + 0.5);
        rectDeg(g, degV('poutreFace', [[0, '#2A1D14'], [1, '#4A3526']]), 0, yh, 1, yb - yh, 0, yh, W, yb - yh + 0.5);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, yh, W, 1);
      });
      // la lumière des lampes sur le plafond
      g.globalCompositeOperation = 'screen';
      LAMPES.forEach((L) => {
        const [x, y] = ecran(L.x, L.y - 60);
        if (x < -200 || x > W + 200) return;
        const r = 120 * s0 / 2.3;
        rectDeg(g, degR('plafondLampe', [[0, 'rgba(255,190,120,0.16)'], [1, 'rgba(255,190,120,0)']]), x, y, r, r, x - 200, 0, 400, yMur);
      });
      g.globalCompositeOperation = 'source-over';
    }

    /* ---------- le comptoir du premier plan : des planches en perspective. Un calque repeint quand la caméra a assez
       bougé pour que ça se voie (un quart de px) ; entre deux, il glisse avec elle ---------- */
    const MX_COMPTOIR = 10, BAS_COMPTOIR = 3; // les marges peintes (px CSS) : à gauche et à droite, sous le bas de l'écran
    const yComptoir = (d) => Yh() + (K.OEIL - K.HAUT_COMPTOIR) * s0 * sig(d);
    function majComptoir() {
      const L = L_COMPTOIR, Y = Yh(), yFond = yComptoir(K.D_COMPTOIR);
      if (yFond > H) { montrer(L.c, false); if (L.c.width && ++L.vide > 60) { L.c.width = L.c.height = 0; L.bw = L.bh = 0; L.R = null; } return; }
      L.vide = 0;
      const dens = densite(qVive), r0 = L.R;
      let refaire = !r0 || r0.W !== W || r0.H !== H || r0.nuit !== nuit || r0.dens !== dens || Math.abs(cam.d - r0.d) > 0.04 || Math.abs(Y - r0.Y) > 1.5;
      if (!refaire) {
        const dx = cam.x - r0.cx;
        // (chaque planche glisse à sa vitesse : l'écart entre la plus lente et la plus rapide reste sous ~¼ de px)
        if (Math.abs(dx) * (r0.sMax - r0.sMin) * 0.5 * dens > 0.25 || Math.abs(dx * r0.sMid) > MX_COMPTOIR - 2) refaire = true;
      }
      for (let passe = 0; passe < 2; passe++) {
        if (refaire) {
          const e = 2.2 * s0 * sig(K.D_COMPTOIR);
          const y0 = Math.floor((yFond - e * 0.5 - 1) * dens) / dens;
          const bw = Math.ceil((W + 2 * MX_COMPTOIR) * dens), bh = Math.ceil((H + BAS_COMPTOIR - y0) * dens);
          const g = L.g || (L.g = L.c.getContext('2d'));
          if (!r0 || r0.dens !== dens) L.c.width = L.c.height = 0;
          dimensionner(L, bw, bh, bw, Math.ceil((H + BAS_COMPTOIR) * dens) + 2);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.clearRect(0, 0, L.c.width, L.c.height);
          L.bw = bw; L.bh = bh;
          g.setTransform(dens, 0, 0, dens, MX_COMPTOIR * dens, -y0 * dens);
          const v = peindreComptoir(g, yFond);
          L.R = { W, H, nuit, dens, d: cam.d, Y, cx: cam.x, y0, sMin: v[0], sMax: v[1], sMid: (v[0] + v[1]) / 2 };
        }
        const R2 = L.R, tx = -MX_COMPTOIR - (cam.x - R2.cx) * R2.sMid, ty = R2.y0 + (Y - R2.Y);
        // (sur un écran de cette densité, un décalage d'une fraction de px adoucirait les joints : on repeint)
        if (!refaire && Math.abs((window.devicePixelRatio || 1) - dens) < 0.01 && (frac(tx * dens) > 0.3 || frac(ty * dens) > 0.3)) { refaire = true; continue; }
        poserTf(L, mat(1 / dens, 1 / dens, tx, ty));
        break;
      }
      montrer(L.c, true);
    }
    /** les planches, le nez, l'ombre et la lumière du premier plan (px de l'hôte) ; → [la plus petite échelle, la plus grande] */
    function peindreComptoir(g, yFond) {
      const x0 = -MX_COMPTOIR, larg = W + 2 * MX_COMPTOIR, Hb = H + BAS_COMPTOIR;
      const bords = [];
      for (let d = K.D_COMPTOIR; d > 40; d -= 15) bords.push(d);
      const L = L_COMPTOIR, p = L.motif || (L.motif = g.createPattern(D.outils.texChene(), 'repeat'));
      let sMin = Infinity, sMax = 0;
      for (let i = 0; i < bords.length - 1; i++) {
        const d0 = bords[i], d1 = bords[i + 1];
        if (d1 - cam.d < 16) break;
        const ya = yComptoir(d0), yb = Math.min(H + 2, yComptoir(d1));
        if (ya > H) break;
        const s = s0 * sig((d0 + d1) / 2);
        sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
        if (p.setTransform && window.DOMMatrix) p.setTransform(new DOMMatrix().translate(W / 2 - cam.x * s + i * 37 * s, ya).scale(s * 0.13, (yb - ya) / 64 * 0.55));
        g.fillStyle = p;
        g.fillRect(x0, ya, larg, yb - ya + 0.6);
        // chaque planche : patinée, plus claire au milieu (usée), le joint sombre
        const ton = [0.34, 0.22, 0.4, 0.28, 0.18, 0.36, 0.26][i % 7];
        rectDeg(g, degV('planche' + (i % 7), [[0, `rgba(26,12,4,${ton + 0.25})`], [0.35, `rgba(40,20,8,${ton})`], [0.7, `rgba(40,20,8,${ton + 0.06})`], [1, `rgba(20,10,4,${ton + 0.2})`]]), 0, ya, 1, yb - ya, x0, ya, larg, yb - ya + 0.6);
        g.fillStyle = 'rgba(20,10,4,0.55)';
        g.fillRect(x0, ya, larg, Math.max(0.6, (yb - ya) * 0.04));
      }
      // le nez du comptoir (arrondi, il accroche la lumière)
      const e = 2.2 * s0 * sig(K.D_COMPTOIR);
      rectDeg(g, degV('nez', [[0, 'rgba(255,236,205,0.0)'], [0.35, 'rgba(255,236,205,0.4)'], [1, 'rgba(60,30,12,0)']]), 0, yFond - e * 0.5, 1, e * 1.5, x0, yFond - e * 0.5, larg, e * 1.5);
      g.fillStyle = 'rgba(20,10,4,0.5)';
      g.fillRect(x0, yFond - 1, larg, 1);
      // le premier plan s'enfonce dans l'ombre (on regarde Clément, pas nos mains)
      rectDeg(g, degV('ombrePremier', [[0, 'rgba(14,8,4,0)'], [0.5, 'rgba(14,8,4,0.25)'], [1, 'rgba(14,8,4,0.55)']]), 0, yFond, 1, H - yFond, x0, yFond, larg, Hb - yFond);
      // la lumière du jour qui vient de la vitrine (derrière nous), ou la pénombre du soir
      rectDeg(g, nuit ? degV('premierSoir', [[0, 'rgba(10,14,30,0.15)'], [1, 'rgba(10,14,30,0.55)']]) : degV('premierJour', [[0, 'rgba(255,248,235,0.05)'], [1, 'rgba(230,238,245,0.18)']]), 0, yFond, 1, H - yFond, x0, yFond, larg, Hb - yFond);
      return sMax ? [sMin, sMax] : [0, 0];
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
    /** le bout des doigts pincés (pouce contre index) d'un bras dessiné */
    function boutDe(B) {
      const P = CO.Clement.PINCE, k = CO.Clement.ECHELLE_MAIN, c = Math.cos(B.angMain), s = Math.sin(B.angMain);
      const lx = P[0] * k, ly = P[1] * k * B.flip;
      return [B.W[0] + c * lx - s * ly, B.W[1] + s * lx + c * ly];
    }
    /** l'objet suit la main qui le tient (le creux de la main, ou le bout des doigts pour ce qu'on pince, + la prise tournée avec l'objet) */
    function suivreMain(o, B) {
      const ca = Math.cos(B.angMain), sa = Math.sin(B.angMain);
      const [px, py] = o.auBout ? boutDe(B) : [B.W[0] + ca * 8.5, B.W[1] + sa * 8.5];
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
    /** une tête de clou d'acier (vue un peu d'en haut), son ombre, son reflet */
    function teteClou(g, x, y, r = 0.68) {
      g.fillStyle = 'rgba(28,16,8,0.45)'; g.beginPath(); g.ellipse(x + 0.1, y + 0.16, r * 1.05, r * 0.48, 0, 0, TAU); g.fill();
      g.fillStyle = lin(g, x - r, y - r * 0.45, x + r, y + r * 0.45, [[0, '#F4F6F7'], [0.45, '#AEB4B9'], [1, '#4E5358']]);
      g.beginPath(); g.ellipse(x, y, r, r * 0.45, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(28,30,34,0.85)'; g.lineWidth = 0.12; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.1, r * 0.34, r * 0.14, 0, 0, TAU); g.fill();
    }
    /* la semelle neuve vue un peu d'en haut : son dessus (y = -2 - DESSUS(x)) au-dessus de la tranche ; les clous se
       plantent le long des bords de l'avant-pied (la demi-semelle), le bord de devant d'abord, puis celui du fond */
    const DESSUS = [[-14, 0.3], [-12.6, 1.4], [-9.5, 1.9], [-5.5, 1.75], [-2, 1.45], [2, 1.85], [6, 2.55], [10, 2.6], [12.8, 2.05], [14.3, 0.5]];
    const dessusSemelle = (x) => {
      for (let k = 1; k < DESSUS.length; k++) if (x <= DESSUS[k][0]) { const [x0, h0] = DESSUS[k - 1], [x1, h1] = DESSUS[k]; return lerp(h0, h1, (x - x0) / (x1 - x0)); }
      return DESSUS[DESSUS.length - 1][1];
    };
    const PLACES_CLOUS = [];
    for (let r = 0; r < 2; r++) for (let k = 0; k < 8; k++) PLACES_CLOUS.push([-0.5 + k * 1.9, r]);
    /** où entre le clou (repère de la chaussure) : juste derrière le bord de devant, ou juste devant celui du fond */
    const piedClou = ([x, rang]) => [x, rang ? -2 - dessusSemelle(x) + 0.5 : -2 - 0.5];
    const CUIRS = ['#231C19', '#5A3422', '#6B3A22', '#2B2B2D', '#7A4A2A'];
    objet('surForme', {
      x: 300, y: -123.5, a: 0, cuir: '#231C19', clous: [], colle: 0, neuve: false, eclat: 0,
      dessin(g, o) {
        g.save(); g.scale(1, -1);
        D.derby(g, -14.5, 0, 29, o.cuir, 1, '#3A2616');
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.1)';
        g.beginPath(); g.ellipse(6, 7.5, 7, 1.4, -0.1, 0, TAU); g.fill();
        g.fillStyle = '#5A3A22';
        g.beginPath(); g.moveTo(-14.6, 0.4); g.lineTo(15, 0.4); g.quadraticCurveTo(16.6, -0.8, 15, -2.4); g.lineTo(-14.2, -2.4); g.quadraticCurveTo(-15.4, -1, -14.6, 0.4); g.closePath(); g.fill();
        // la tranche
        g.fillStyle = o.neuve ? lin(g, 0, -2.2, 0, 0, [[0, '#4A4A4C'], [1, '#2A2A2C']]) : lin(g, 0, -2.2, 0, 0, [[0, '#E0B888'], [1, '#B98C5C']]);
        g.beginPath(); g.moveTo(-14, -0.1); g.lineTo(14.6, -0.1); g.quadraticCurveTo(15.6, -1, 14.4, -2); g.lineTo(-13.6, -2); g.quadraticCurveTo(-14.6, -1, -14, -0.1); g.closePath(); g.fill();
        if (o.colle > 0) { g.fillStyle = `rgba(255,236,190,${0.35 * o.colle})`; g.fill(); }
        g.fillStyle = 'rgba(90,50,24,0.35)';
        g.fillRect(-6.8, -2, 0.5, 1.9);
        // le dessus (plus clair : il prend la lumière de la lampe), l'arête de devant
        g.beginPath(); g.moveTo(-13.6, -2);
        DESSUS.forEach(([x, h]) => g.lineTo(x, -2 - h));
        g.lineTo(14.4, -2); g.closePath();
        g.fillStyle = o.neuve ? lin(g, 0, -4.6, 0, -2, [[0, '#56565A'], [1, '#3C3C3F']]) : lin(g, 0, -4.6, 0, -2, [[0, '#F0D2A8'], [1, '#D9B282']]);
        g.fill();
        if (o.colle > 0) { g.fillStyle = `rgba(255,240,200,${0.5 * o.colle})`; g.fill(); }
        g.strokeStyle = o.neuve ? 'rgba(255,255,255,0.18)' : 'rgba(255,244,222,0.7)'; g.lineWidth = 0.18;
        g.beginPath(); g.moveTo(-13.4, -2.05); g.lineTo(14.2, -2.05); g.stroke();
        // les clous plantés (la file du fond d'abord, derrière ; une semelle neuve collée par-dessus les cache)
        if (!o.neuve) o.clous.slice().sort((a, b) => b[1] - a[1]).forEach((c) => { const [x, y] = piedClou(c); teteClou(g, x, y - 0.1); });
        if (o.eclat > 0.02 && o.clous.length) { // l'éclat du dernier coup
          const [x, y] = piedClou(o.clous[o.clous.length - 1]);
          g.fillStyle = rad(g, x, y - 0.3, 2.4, [[0, `rgba(255,248,220,${0.8 * o.eclat})`], [1, 'rgba(255,248,220,0)']]);
          g.fillRect(x - 2.4, y - 2.7, 4.8, 4.8);
        }
      },
    });
    // le clou qu'on plante : pris dans la coupelle, tenu du bout des doigts, planté debout, enfoncé en deux coups
    objet('clou', {
      x: 322, y: -101.6, a: 0, aMonde: 0, prise: [0, 0.7], auBout: true, visible: false, enfonce: 0,
      dessin(g, o) { // la tête en 0, la tige vers +y (stylisée : 2,2 cm)
        const L = 2.2 * (1 - o.enfonce);
        if (L > 0.05) {
          g.fillStyle = lin(g, -0.16, 0, 0.16, 0, [[0, '#4E5358'], [0.45, '#D4D8DB'], [1, '#5E6368']]);
          g.beginPath(); g.moveTo(-0.15, 0); g.lineTo(0.15, 0); g.lineTo(0.05, L); g.lineTo(-0.05, L); g.closePath(); g.fill();
        }
        teteClou(g, 0, 0);
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
    // (les peintres des pièces vives dessinent dans le repère du monde, au plan de Clément : leur calque le pose)
    function peindrePresseVive(g) {
      const P = M.presse;
      // la tige du vérin et la tête de presse qui descend
      const yt = -140 + 15 * P.tete;
      g.fillStyle = acier(g, 43, 0, 45, 0);
      g.fillRect(43, -149, 2.4, yt + 149);
      g.fillStyle = lin(g, 0, yt, 0, yt + 8, [[0, '#3A3B3F'], [0.3, '#5E6166'], [1, '#1A1A1C']]);
      g.beginPath(); rr(g, 33, yt, 23, 8, 1.5); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(34, yt + 0.6, 21, 0.8);
      // le levier (poignée noire)
      const [bx, by] = levierBout(P.levier);
      g.strokeStyle = acier(g, PR.pivot[0], PR.pivot[1], bx, by); g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(PR.pivot[0], PR.pivot[1]); g.lineTo(bx, by); g.stroke();
      g.fillStyle = '#1C1C1E'; g.beginPath(); g.arc(bx, by, 2.6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.arc(bx - 0.8, by - 0.8, 0.8, 0, TAU); g.fill();
      // l'aiguille du manomètre
      const a = -2.4 + 1.8 * P.mano;
      g.strokeStyle = '#C8322A'; g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(69, -150); g.lineTo(69 + Math.cos(a) * 3.6, -150 + Math.sin(a) * 3.6); g.stroke();
      g.fillStyle = '#2A2A2C'; g.beginPath(); g.arc(69, -150, 0.6, 0, TAU); g.fill();
    }
    function peindreCoutureVive(g) {
      const Cm = M.couture, cx = D.COUTURE.aiguilleX;
      // la barre à aiguille qui pique (floue quand ça va vite)
      const b = Math.sin(Cm.phase) * 2.1 * (Cm.vitesse > 0.02 ? 1 : 0);
      if (Cm.vitesse > 0.35) {
        g.fillStyle = 'rgba(210,214,218,0.55)'; g.fillRect(cx - 0.35, -110, 0.7, 8.5);
      } else {
        g.fillStyle = acier(g, cx - 0.4, 0, cx + 0.4, 0); g.fillRect(cx - 0.4, -110, 0.8, 5 + b);
        g.fillStyle = '#C9CDD0'; g.fillRect(cx - 0.12, -105 + b, 0.24, 3);
      }
      // le pied presseur
      g.fillStyle = '#9EA3A8'; g.fillRect(cx - 1.4, -104.6, 2.8, 1.1);
      // le volant (vu de biais) : un reflet qui tourne
      const vx = D.COUTURE.volantX, vy = D.COUTURE.volantY;
      g.fillStyle = '#1C1C1E'; g.beginPath(); g.ellipse(vx, vy, 2.6, 6.2, 0, 0, TAU); g.fill();
      g.strokeStyle = '#6E7378'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(vx, vy, 2.1, 5.4, 0, 0, TAU); g.stroke();
      const av = Cm.volant;
      g.fillStyle = 'rgba(230,232,234,0.8)';
      g.beginPath(); g.ellipse(vx + Math.sin(av) * 1.8, vy + Math.cos(av) * 4.6, 0.5, 0.9, 0, 0, TAU); g.fill();
    }
    function peindreClesVive(g) {
      const Kc = M.cles, mx = D.CLES.machineX;
      const dx = (Kc.chariot - 0.5) * 7;
      // la fraise (à droite) et le palpeur (à gauche), sur le carter
      const fx = mx + 12, fy = -117;
      g.fillStyle = acier(g, fx - 1.6, 0, fx + 1.6, 0);
      g.beginPath(); g.ellipse(fx, fy, 1.6, 5.4, 0, 0, TAU); g.fill();
      if (Kc.vitesse > 0.05) {
        g.fillStyle = `rgba(255,255,255,${0.35 * Kc.vitesse})`;
        g.beginPath(); g.ellipse(fx, fy, 1.7, 5.6, 0, 0, TAU); g.fill();
      } else {
        g.strokeStyle = 'rgba(60,60,64,0.8)'; g.lineWidth = 0.2;
        g.beginPath(); for (let k = -4; k <= 4; k++) { g.moveTo(fx - 1.2, fy + k * 1.2); g.lineTo(fx + 1.2, fy + k * 1.2 + 0.4); } g.stroke();
      }
      g.fillStyle = '#2A2A2C'; g.fillRect(mx - 14, -121, 3, 5); g.beginPath(); g.moveTo(mx - 14, -116); g.lineTo(mx - 11, -116); g.lineTo(mx - 12.5, -113.5); g.closePath(); g.fill();
      // le chariot et ses deux étaux
      g.fillStyle = lin(g, 0, -113, 0, -107, [[0, '#B9BEC2'], [1, '#6E7378']]);
      g.beginPath(); rr(g, mx - 19 + dx, -113, 38, 6, 1); g.fill();
      [mx - 12.5 + dx, mx + 12 + dx].forEach((vx) => {
        g.fillStyle = '#1E1E20'; g.fillRect(vx - 3.5, -114.6, 7, 2.6);
        g.fillStyle = '#6E7378'; g.beginPath(); g.arc(vx + 4.2, -113.3, 0.9, 0, TAU); g.fill();
      });
      // la poignée du chariot, devant
      g.fillStyle = '#1C1C1E'; g.beginPath(); g.arc(mx + dx, -106, 1.8, 0, TAU); g.fill();
      g.fillStyle = '#6E7378'; g.fillRect(mx - 0.4 + dx, -108.5, 0.8, 2.6);
      // les clés serrées dans les étaux (posées par etatTable())
      if (Kc.orig) dessinerObjet(g, OBJ.cleOrig);
      if (Kc.neuve) dessinerObjet(g, OBJ.cleNeuve);
    }
    /** ce que l'image règle avant de peindre la table, au même moment qu'avant : les clés dans les étaux, la chaussure
        qui saute sous le marteau, le clou planté qui la suit */
    function etatTable() {
      const Kc = M.cles, mx = D.CLES.machineX, dx = (Kc.chariot - 0.5) * 7;
      if (Kc.orig) { const o = OBJ.cleOrig; o.x = mx - 17.5 + dx; o.y = -115.4; o.a = 0; }
      if (Kc.neuve) { const o = OBJ.cleNeuve; o.x = mx + 7 + dx; o.y = -115.4; o.a = 0; }
      forme.y = -123.5 + M.etabli.choc * 0.6;
      { const c = OBJ.clou; if (c.plante) { c.x = forme.x + c.plante[0]; c.y = forme.y + c.plante[1] - 2.2 * (1 - c.enfonce); c.a = 0; } }
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
    /** la boîte (monde) des particules vivantes */
    function empriseParticules() {
      let b = null;
      PART.forEach((p) => {
        const r = (p.r || 0.3) * (1 + p.t * (p.grossit || 1.6)) + (p.type === 'etincelle' ? Math.hypot(p.vx, p.vy) * 0.018 : 0) + (p.type === 'eclat' ? p.r : 0) + 1.2;
        b = etendre(b, p.x - r, p.y - r, p.x + r, p.y + r);
      });
      return b;
    }
    function dessinerParticules(g) {
      PART.forEach((p) => {
        const k = 1 - p.t / p.vie;
        if (p.type === 'etincelle') {
          g.strokeStyle = `rgba(255,${(170 + 70 * k) | 0},${(60 + 60 * k) | 0},${k.toFixed(3)})`;
          g.lineWidth = 0.28;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018); g.stroke();
        } else if (p.type === 'vapeur') {
          g.fillStyle = `rgba(255,248,236,${(0.07 * Math.sin(k * Math.PI)).toFixed(3)})`;
          g.beginPath(); g.arc(p.x + Math.sin(p.t * 3 + p.ph) * 0.8, p.y, p.r * (1 + p.t * 1.6), 0, TAU); g.fill();
        } else if (p.type === 'eclat') {
          const L = p.r * Math.sin(k * Math.PI);
          g.fillStyle = `rgba(255,255,255,${(0.9 * Math.sin(k * Math.PI)).toFixed(3)})`;
          g.beginPath(); g.moveTo(p.x, p.y - L); g.lineTo(p.x + L * 0.12, p.y - L * 0.12); g.lineTo(p.x + L, p.y); g.lineTo(p.x + L * 0.12, p.y + L * 0.12); g.lineTo(p.x, p.y + L); g.lineTo(p.x - L * 0.12, p.y + L * 0.12); g.lineTo(p.x - L, p.y); g.lineTo(p.x - L * 0.12, p.y - L * 0.12); g.closePath(); g.fill();
        } else {
          g.fillStyle = rgba(p.c || '#D8C6A8', ((p.a || 0.7) * k).toFixed(3));
          g.beginPath(); g.arc(p.x, p.y, p.r * (p.grossit ? 1 + p.t * p.grossit : 1), 0, TAU); g.fill();
        }
      });
    }
    const poussiere = (x, y, dir = 1, n = 2) => emettre(n, () => ({ x: x + (RV() - 0.5) * 2, y: y + (RV() - 0.5) * 1.5, vx: dir * (10 + RV() * 50), vy: 20 + RV() * 70, g: 60, frein: 1.2, vie: 0.5 + RV() * 0.8, r: 0.25 + RV() * 0.45, c: RV() < 0.5 ? '#E6D2B0' : '#B8946A', a: 0.8 }));
    const bouffee = (x, y) => emettre(14, () => ({ x, y, vx: -30 + RV() * 25, vy: -10 + RV() * 25, g: 10, frein: 2.2, vie: 0.7 + RV() * 0.6, r: 0.3 + RV() * 0.5, grossit: 1.5, c: '#E8D8BC', a: 0.6 }));
    const etincelles = (x, y) => emettre(3, () => ({ type: 'etincelle', x, y, vx: 40 + RV() * 120, vy: -30 + RV() * 90, g: 260, vie: 0.25 + RV() * 0.35 }));

    /* ---------- la lumière : cônes des lampes, poussière qui flotte ; le soir ---------- */
    const MOUTES = Array.from({ length: 30 }, (_, i) => ({ l: i % LAMPES.length, u: R(), v: R(), ph: R() * TAU, vit: 0.3 + R() * 0.7 }));
    let tVie = 0, nuitK = nuit ? 1 : 0;
    /** les cônes et les halos des lampes, en « écran » ; la lampe du fond (x 540) à part : elle vacille (son calque
        est peint au plus fort, 1,02, et son opacité suit le vacillement : l'écran est linéaire en alpha) */
    function peindreCones(g, l540) {
      g.globalCompositeOperation = 'screen';
      LAMPES.forEach((L) => {
        if ((L.x === 540) !== l540) return;
        const h = 150, f = l540 ? 1.02 : 1;
        g.fillStyle = lin(g, 0, L.y, 0, L.y + h, [[0, rgba('#FFE7B8', (0.13 + 0.08 * nuitK) * f)], [1, rgba('#FFE7B8', 0)]]);
        g.beginPath(); g.moveTo(L.x - L.l * 0.42, L.y + 2); g.lineTo(L.x + L.l * 0.42, L.y + 2); g.lineTo(L.x + L.l * 2.4, L.y + h); g.lineTo(L.x - L.l * 2.4, L.y + h); g.closePath(); g.fill();
        g.fillStyle = rad(g, L.x, L.y + 3, 26, [[0, rgba('#FFF1CF', (0.4 + 0.15 * nuitK) * f)], [1, rgba('#FFE0A0', 0)]]);
        g.beginPath(); g.arc(L.x, L.y + 3, 26, 0, TAU); g.fill();
      });
      g.globalCompositeOperation = 'source-over';
    }
    function bornesLumiere(l540) {
      let b = null;
      LAMPES.forEach((L) => { if ((L.x === 540) === l540) b = etendre(b, L.x - Math.max(26, L.l * 2.4) - 1, L.y - 24, L.x + Math.max(26, L.l * 2.4) + 1, L.y + 151); });
      return b;
    }
    /** la poussière qui flotte dans les cônes : une zone, peinte à chaque image */
    const POS_MOUTES = MOUTES.map(() => [0, 0, 0]);
    function majMoutes() {
      let b = null;
      MOUTES.forEach((m, i) => {
        const L = LAMPES[m.l];
        const v = (m.v + tVie * 0.012 * m.vit) % 1;
        const x = L.x + (m.u - 0.5) * L.l * (1 + v * 3.6) + Math.sin(tVie * 0.4 * m.vit + m.ph) * 3;
        const y = L.y + 8 + v * 120;
        const a = Math.sin(v * Math.PI) * (0.35 + 0.35 * Math.sin(tVie * 1.3 + m.ph));
        const p = POS_MOUTES[i]; p[0] = x; p[1] = y; p[2] = a;
        if (a > 0.02) b = etendre(b, x - 0.5, y - 0.5, x + 0.5, y + 0.5);
      });
      const Z = Z_MOUTES;
      if (!ouvrir(Z, zoneEcran(b), densite(0.625 * qFloue))) return; // (des grains de lumière : un calque flou)
      repereZone(Z);
      const g = Z.g;
      g.globalCompositeOperation = 'screen';
      g.fillStyle = 'rgb(255,236,200)';
      POS_MOUTES.forEach(([x, y, a]) => {
        if (a <= 0.02) return;
        g.globalAlpha = +a.toFixed(3);
        g.beginPath(); g.arc(x, y, 0.35, 0, TAU); g.fill();
      });
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    /** le soir : une carte de lumière (petite, redessinée quand la caméra bouge) posée en « produit » sur l'image : la
        pénombre bleutée loin des lampes, des flaques chaudes dessous ; puis le halo des ampoules (une couche) */
    let TACHE_SOIR = null, TACHE_RUE = null;
    function majSoir() {
      const L = L_SOIR;
      if (nuitK <= 0.001) { montrer(L.c, false); return; }
      const cw = Math.max(8, Math.round(W / 6)), ch = Math.max(8, Math.round(H / 6));
      const cle = [cam.x, cam.d, cam.tilt, nuitK, W, H].join(',');
      if (cle !== L.cle) {
        L.cle = cle;
        if (L.c.width !== cw || L.c.height !== ch) { L.c.width = cw; L.c.height = ch; }
        if (!TACHE_SOIR) { // (les flaques des lampes et le lampadaire de la rue : des dégradés peints une fois, posés à leur taille)
          const N = 128, tache1 = (stops) => { const c = toile(N, N), t = c.getContext('2d'); t.fillStyle = rad(t, N / 2, N / 2, N / 2, stops); t.fillRect(0, 0, N, N); return c; };
          TACHE_SOIR = tache1([[0, 'rgba(255,190,120,0.85)'], [0.45, 'rgba(200,140,90,0.42)'], [1, 'rgba(150,100,70,0)']]);
          TACHE_RUE = tache1([[0, 'rgba(120,140,190,0.5)'], [1, 'rgba(120,140,190,0)']]);
        }
        const g = L.c.getContext('2d'), k = cw / W;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
        const fond = [lerp(255, 70, nuitK), lerp(255, 66, nuitK), lerp(255, 86, nuitK)];
        g.fillStyle = `rgb(${fond[0] | 0},${fond[1] | 0},${fond[2] | 0})`;
        g.fillRect(0, 0, cw, ch);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = nuitK;
        LAMPES.forEach((Lp) => {
          const [x, y] = ecran(Lp.x, Lp.y + 70);
          const r = 150 * s0 * sig(K.D_LANE) * k;
          if ((x * k) < -r || (x * k) > cw + r) return;
          g.drawImage(TACHE_SOIR, x * k - r, y * k - r, 2 * r, 2 * r);
        });
        // le lampadaire de la rue par la porte vitrée
        const [px, py] = ecran(672, -160, K.D_MUR);
        const rp = 60 * s0 * k;
        g.drawImage(TACHE_RUE, px * k - rp, py * k - rp, 2 * rp, 2 * rp);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        poserTf(L, mat(W / cw, H / ch, 0, 0));
      }
      montrer(L.c, true);
    }
    // le halo des ampoules, le soir (peint pour nuitK = 1 : son opacité suit la tombée du soir)
    function bornesHalos() { let b = null; LAMPES.forEach((L) => { b = etendre(b, L.x - 35, L.y - 31, L.x + 35, L.y + 39); }); return b; }
    function peindreHalosSoir(g) {
      g.globalCompositeOperation = 'screen';
      LAMPES.forEach((L) => {
        g.fillStyle = rad(g, L.x, L.y + 4, 34, [[0, 'rgba(255,214,150,0.4)'], [1, 'rgba(255,190,120,0)']]);
        g.fillRect(L.x - 34, L.y + 4 - 34, 68, 68);
      });
      g.globalCompositeOperation = 'source-over';
    }
    /** le caisson SMALL est lumineux : il brille à travers la pénombre du soir (peint pour nuitK = 1) */
    function peindreSmallVive(g) {
      g.fillStyle = rad(g, 234, -206, 44, [[0, 'rgba(255,246,228,0.5)'], [0.35, 'rgba(255,236,210,0.22)'], [1, 'rgba(255,230,200,0)']]);
      g.fillRect(234 - 44, -206 - 44, 88, 88);
    }
    /** la pendule : l'heure de Paris (repeinte toutes les deux secondes) */
    let hSec = -1, hVal = null;
    const heure = () => { const t = Math.floor(Date.now() / 1000); if (t !== hSec || !hVal) { hSec = t; hVal = CO.parisNow ? CO.parisNow() : new Date(); } return hVal; }; // (une fois par seconde : l'heure de Paris coûte)
    function sigAiguilles() { const t = heure(); return String(Math.floor((t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds()) / 2)); }
    function peindreAiguilles(g) {
      const t = heure();
      const h = (t.getHours() % 12) + t.getMinutes() / 60, m = t.getMinutes() + t.getSeconds() / 60;
      g.strokeStyle = '#1E1A16'; g.lineCap = 'round';
      g.lineWidth = 0.9; g.beginPath(); g.moveTo(470, -188); g.lineTo(470 + Math.sin(h / 12 * TAU) * 5.4, -188 - Math.cos(h / 12 * TAU) * 5.4); g.stroke();
      g.lineWidth = 0.55; g.beginPath(); g.moveTo(470, -188); g.lineTo(470 + Math.sin(m / 60 * TAU) * 8.2, -188 - Math.cos(m / 60 * TAU) * 8.2); g.stroke();
      g.fillStyle = '#C8322A'; g.beginPath(); g.arc(470, -188, 0.7, 0, TAU); g.fill();
    }
    /** le cadran de la radio s'allume quand le son est là ; son aiguille rouge glisse */
    const cadranRadio = () => { const [cx, cy, cw, chh] = D.RADIO.cadran; return [D.RADIO.x + cx, -K.HAUT_COMPTOIR + cy, cw, chh]; };
    const aiguilleRadio = () => D.RADIO.cadran[2] * (0.3 + 0.1 * Math.sin(tVie * 0.2));
    function bornesRadio() { const [x, y, cw, chh] = cadranRadio(); return [x - 10.5, y - 10.5, x + cw + 10.5, y + chh + 10.5]; }
    function peindreRadioLueur(g) {
      const [x, y, cw, chh] = cadranRadio();
      g.globalCompositeOperation = 'screen';
      g.fillStyle = 'rgba(255,190,90,0.85)';
      g.fillRect(x + 0.4, y + 0.4, cw - 0.8, chh - 0.8);
      g.fillStyle = rad(g, x + cw / 2, y + chh / 2, 9, [[0, 'rgba(255,190,90,0.35)'], [1, 'rgba(255,190,90,0)']]);
      g.fillRect(x - 10, y - 10, cw + 20, chh + 20);
      g.globalCompositeOperation = 'source-over';
    }
    function peindreRadioAiguille(g) {
      const [x, y, , chh] = cadranRadio();
      g.fillStyle = '#C8322A'; g.fillRect(x + aiguilleRadio(), y + 0.5, 0.35, chh - 1);
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
    function peindreRoues(g) {
      const F = M.finisseuse;
      D.ROUES.forEach((w) => {
        const x = w.x - w.w / 2, y = D.ARBRE_Y - w.r, h = 2 * w.r;
        const T = texRoue(w.type);
        g.save();
        g.beginPath(); rr(g, x, y, w.w, h, Math.min(3, w.w / 3)); g.clip();
        const per = h * 1.6, off = ((F.angle * w.r * 0.5) % per + per) % per;
        const flou = clamp(F.vitesse * 1.4, 0, 1);
        g.globalAlpha = 1 - flou * 0.85;
        g.drawImage(T.net, x, y - per + off, w.w, per); g.drawImage(T.net, x, y + off, w.w, per);
        if (flou > 0.02) { g.globalAlpha = flou; g.drawImage(T.flou, x, y - per + off, w.w, per); g.drawImage(T.flou, x, y + off, w.w, per); }
        g.globalAlpha = 1;
        g.fillStyle = lin(g, 0, y, 0, y + h, [[0, 'rgba(0,0,0,0.75)'], [0.28, 'rgba(255,240,220,0.12)'], [0.4, 'rgba(255,255,255,0.05)'], [0.75, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0.85)']]);
        g.fillRect(x, y, w.w, h);
        g.fillStyle = lin(g, x, 0, x + w.w, 0, [[0, 'rgba(0,0,0,0.3)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
        g.fillRect(x, y, w.w, h);
        g.restore();
        g.fillStyle = lin(g, 0, D.ARBRE_Y - 3, 0, D.ARBRE_Y + 3, [[0, '#E6E9EB'], [1, '#4E5358']]);
        g.fillRect(x - 0.8, D.ARBRE_Y - 2.6, 0.8, 5.2); g.fillRect(x + w.w, D.ARBRE_Y - 2.6, 0.8, 5.2);
      });
    }

    /* ---------- les couches vives : les pièces des machines, les objets posés (repeintes quand elles changent) ---------- */
    /** la place d'un objet tenu, autour du poignet qui le tient : de quoi ne rien couper */
    const rayonObjet = (o) => (o.id === 'basket' ? 42 : 32) * (o.k || 1);
    /** le dessin d'un objet tient dans cette boîte de son repère (cm, avant rotation et miroir) */
    const BOITES = {
      marteau: [-2.5, -5, 26, 6.5], surForme: [-16, -7.5, 17, 12], clou: [-0.8, -0.8, 0.9, 2.4], pinceau: [-4.6, -0.9, 12.1, 0.9],
      potColle: [-5.1, -8.3, 5.1, 1.9], semelle: [-14.1, -2, 15.8, 0.5], tasse: [-6.1, -11, 8.4, 1.7], chausFin: [-15.1, -7.6, 15.6, 5.6],
      chausPresse: [-15.7, -24.1, 17.1, 0.6], basket: [-14.7, -24.1, 17.6, 0.6], brosse: [-4.7, -1.8, 4.7, 2.8], serviette: [-3.2, -4.2, 8.2, 22.2],
      cuir: [-10.8, -1.8, 11.2, 0.8], ciseaux: [-1.8, -2.1, 6.7, 2.1], cleOrig: [-1.8, -1.8, 7.1, 1.8], cleNeuve: [-1.8, -1.8, 7.1, 1.8],
      lime: [-9.2, -0.8, 4.2, 0.8], stylo: [-1.4, -0.7, 12, 0.7], ticketP: [-3.2, -4.3, 3.2, 4.7],
    };
    /** la boîte (monde) d'un objet posé : sa boîte tournée, retournée, mise à l'échelle (et 1 cm pour les traits) */
    function boiteObjet(o) {
      const L = BOITES[o.id] || [-20, -20, 20, 20], c = Math.cos(o.a), s = Math.sin(o.a), kx = o.sens * o.k, ky = o.k;
      let b = null;
      [[L[0], L[1]], [L[2], L[1]], [L[0], L[3]], [L[2], L[3]]].forEach(([lx, ly]) => {
        const X = lx * kx, Y = ly * ky, x = o.x + c * X - s * Y, y = o.y + s * X + c * Y;
        b = etendre(b, x - 1, y - 1, x + 1, y + 1);
      });
      return b;
    }
    /** l'état d'un objet posé, en une chaîne (tout ce qui change son dessin) */
    function sigObjet(o) {
      if (o.main) return 'm';
      let s = '';
      for (const k in o) {
        const v = o[k];
        if (typeof v === 'number') s += Math.round(v * 200) + ',';
        else if (typeof v === 'boolean' || typeof v === 'string') s += v + ',';
        else if (Array.isArray(v)) { s += v.length + ':'; if (k === 'mousse') v.forEach((b) => { s += Math.round(b.a * 200) + '.'; }); s += ','; }
        else if (v && k === 'couleur') s += D.PAIRES.indexOf(v) + ',';
      }
      return s;
    }
    function bornesMachines() {
      let b = [30, -156, 106, -93]; // la presse : la tige, la tête, le levier, le manomètre
      D.ROUES.forEach((w) => { b = etendre(b, w.x - w.w / 2 - 1, D.ARBRE_Y - w.r - 3, w.x + w.w / 2 + 1, D.ARBRE_Y + w.r + 3); });
      planMachine.forEach((o) => { if (!o.main && o.visible) b = unir(b, boiteObjet(o)); });
      return b;
    }
    function sigMachines() {
      const F = M.finisseuse, P = M.presse;
      let s = Math.round(clamp(F.vitesse * 1.4, 0, 1) * 1000) + ',' + Math.round(P.tete * 1000) + ',' + Math.round(P.levier * 1000) + ',' + Math.round(P.mano * 1000);
      D.ROUES.forEach((w) => { const per = 2 * w.r * 1.6; s += ',' + Math.round((((F.angle * w.r * 0.5) % per + per) % per) * 50); });
      planMachine.forEach((o) => { s += ';' + sigObjet(o); });
      return s;
    }
    function peindreMachines(g) {
      peindreRoues(g);
      peindrePresseVive(g);
      planMachine.forEach((o) => { if (!o.main) dessinerObjet(g, o); });
    }
    function bornesTable() {
      let b = [384, -114, 432, -97]; // la couture : l'aiguille, le pied, le volant
      b = etendre(b, 552, -125, 606, -101); // les clés : la fraise, le chariot, les étaux
      planTable.forEach((o) => { if (!o.main && o.visible) b = unir(b, boiteObjet(o)); });
      return b;
    }
    function sigTable() {
      const Cm = M.couture, Kc = M.cles;
      const b = Math.sin(Cm.phase) * 2.1 * (Cm.vitesse > 0.02 ? 1 : 0);
      let s = (Cm.vitesse > 0.35 ? 'f' : Math.round(b * 200)) + ',' + Math.round(Math.sin(Cm.volant) * 400) + ',' + Math.round(Math.cos(Cm.volant) * 400) + ';';
      s += Math.round(Kc.chariot * 1000) + ',' + (Kc.vitesse > 0.05 ? Math.round(Kc.vitesse * 400) : 'a') + ',' + Kc.orig + Kc.neuve + ';';
      planTable.forEach((o) => { s += sigObjet(o) + ';'; });
      return s;
    }
    function peindreTable(g) {
      peindreCoutureVive(g);
      peindreClesVive(g);
      planTable.forEach((o) => { if (!o.main && !(o.id === 'cleOrig' && M.cles.orig) && !(o.id === 'cleNeuve' && M.cles.neuve)) dessinerObjet(g, o); });
    }

    /* ---------- la vitre qu'on vient de passer (entrée, sortie) : montants vert sauge, reflets ---------- */
    let vitreK = 0; // 0 : rien ; 1 : on est contre la vitre
    function majVitre() {
      const L = L_VITRE, k = vitreK;
      if (k <= 0.004) { if (L.c.width) { L.c.width = L.c.height = 0; L.bw = L.bh = 0; } montrer(L.c, false); return; } // (rendue à la mémoire)
      const dens = densite(0.5 * qVive), bw = Math.ceil(W * dens), bh = Math.ceil(H * dens); // (un passage de quelques images, flou de bougé : 1 px par px CSS)
      const g = L.g || (L.g = L.c.getContext('2d'));
      if (L.dens !== dens) { L.dens = dens; L.c.width = L.c.height = 0; }
      dimensionner(L, bw, bh, bw, bh);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, L.c.width, L.c.height);
      g.setTransform(dens, 0, 0, dens, 0, 0);
      peindreVitre(g, k);
      poserTf(L, mat(1 / dens, 1 / dens, 0, 0));
      montrer(L.c, true);
    }
    function peindreVitre(g, k) {
      // le verre : une légère teinte et des reflets obliques
      g.fillStyle = `rgba(214,228,232,${(0.18 * k).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(255,255,255,${(0.14 * k).toFixed(3)})`;
      const o = (1 - k) * W * 0.6;
      g.beginPath(); g.moveTo(W * 0.12 + o, H); g.lineTo(W * 0.62 + o, 0); g.lineTo(W * 0.8 + o, 0); g.lineTo(W * 0.3 + o, H); g.closePath(); g.fill();
      // les montants de la devanture (vert sauge), qui s'écartent quand on passe
      const e = Math.pow(k, 2.2);
      const larg = lerp(W * 3.2, W * 1.02, e), ep = lerp(W * 0.5, W * 0.035, e);
      g.fillStyle = C.sauge;
      [-1, 1].forEach((s) => {
        const x = W / 2 + s * larg / 2;
        g.fillRect(x - ep / 2, 0, ep, H);
        g.fillStyle = `rgba(255,255,255,0.18)`; g.fillRect(x - ep / 2, 0, ep * 0.18, H);
        g.fillStyle = C.sauge;
      });
      const yt = lerp(-H * 1.2, H * 0.06, e), yb = lerp(H * 2.2, H * 0.9, e);
      g.fillRect(0, yt - ep, W, ep);
      g.fillRect(0, yb, W, ep * 1.6);
    }

    /* ---------- le premier passage : un halo doux autour de Clément (une fois) ---------- */
    let indice = null;
    function majIndice() {
      const L = L_INDICE;
      if (!indice) { montrer(L.c, false); return; }
      const p = (tVie - indice.t0) / 2.8;
      if (p >= 1) { indice = null; montrer(L.c, false); L.c.width = L.c.height = 0; L.r = 0; return; }
      const t = cl.tete();
      const [x, y] = ecran(t.x, t.y + 34);
      const r = 62 * s0 * sig(K.D_LANE);
      const a = Math.pow(Math.sin(p * Math.PI * 2), 2) * Math.sin(p * Math.PI);
      // (le halo est peint pour a = 1, à son rayon ; son opacité suit le battement : l'écran est linéaire en alpha)
      const dens = Math.max(Math.min(1, dpr), qFloue);
      if (Math.abs(r - L.r) > L.r * 0.005 || L.dens !== dens) {
        L.r = r; L.dens = dens;
        const bw = Math.ceil(2 * r * 0.72 * dens) + 2, bh = Math.ceil(2 * r * dens) + 2;
        L.c.width = bw; L.c.height = bh;
        const g = L.c.getContext('2d');
        g.setTransform(dens * 0.72, 0, 0, dens, bw / 2, bh / 2);
        g.fillStyle = rad(g, 0, 0, r, [[0, 'rgba(255,226,170,0.22)'], [0.55, 'rgba(255,214,150,0.12)'], [1, 'rgba(255,214,150,0)']]);
        g.fillRect(-r, -r, 2 * r, 2 * r);
      }
      poserTf(L, mat(1 / L.dens, 1 / L.dens, x - L.c.width / 2 / L.dens, y - L.c.height / 2 / L.dens));
      opacite(L.c, a);
      montrer(L.c, a > 0.0005);
    }

    /* ---------- le vignettage (fixe : peint une fois par taille ; son opacité suit le soir) ---------- */
    function majVignette() {
      const L = L_VIGNETTE, cle = W + 'x' + H;
      if (L.cle !== cle) {
        L.cle = cle;
        const dens = 0.5, bw = Math.ceil(W * dens), bh = Math.ceil(H * dens);
        L.c.width = bw; L.c.height = bh;
        const g = L.c.getContext('2d');
        g.setTransform(bw / W, 0, 0, bh / H, 0, 0);
        g.fillStyle = rad(g, W / 2, H * 0.42, Math.max(W, H) * 0.78, [[0.45, 'rgba(12,7,3,0)'], [1, 'rgba(12,7,3,0.65)']]);
        g.fillRect(0, 0, W, H);
        poserTf(L, mat(W / bw, H / bh, 0, 0));
      }
      opacite(L.c, (0.5 + 0.15 * nuitK) / 0.65);
      montrer(L.c, true);
    }

    /* ---------- le rendu d'une image : chaque calque à sa place, repeint s'il le faut ---------- */
    const planMachine = [], planTable = [];
    const PERF = window.CO_BQ_PERF ? {} : null;
    let tP = 0;
    const jalon = (nom) => { if (!PERF) return; const t = performance.now(); PERF[nom] = (PERF[nom] || 0) * 0.9 + (t - tP) * 0.1; tP = t; };
    // ce que tient une main : il suit la main, il se dessine entre le bras et les doigts
    const objets = (g, Mn, B) => { if (Mn.objet) { if (Mn.objet.main !== 'deux') suivreMain(Mn.objet, B); dessinerObjet(g, Mn.objet); } };
    let MUET = null;
    /** (Clément hors de l'écran : on le dessine quand même, hors du canevas, pour ses repères et ce qu'il tient) */
    function muet(dens) {
      const g = MUET || (MUET = toile(1, 1).getContext('2d')), s = s0 * sig(K.D_LANE);
      g.setTransform(s * dens, 0, 0, s * dens, -1e6, -1e6);
      return g;
    }
    function rendre() {
      if (PERF) tP = performance.now();
      const dv = densite(qVive);
      // le décor fixe : ses plans suivent la caméra (le compositeur les déplace, rien ne se repeint)
      poserPlan(P_MUR); poserPlan(P_FOND); poserTf(P_MEUBLES, P_FOND.tf); poserPlan(P_OBJETS); poserPlan(P_PREMIER);
      if (SP.porteJour) montrer(SP.porteJour.c, nuitK <= 0.5);
      if (SP.porteNuit) montrer(SP.porteNuit.c, nuitK > 0.5);
      montrer(P_PREMIER.c, cam.d < D_PREMIER - 30);
      majPlafond();
      majCouche(L_AIGUILLES);
      jalon('decor');
      majCouche(L_MACHINES);
      jalon('machines');
      // Clément (le corps)
      const em = cl.emprise(rayonObjet);
      if (ouvrir(Z_CORPS, zoneEcran(em.corps), dv)) { repereZone(Z_CORPS); Z_CORPS.g.lineCap = 'round'; cl.dessiner(Z_CORPS.g, 'corps', objets); } else cl.dessiner(muet(dv), 'corps', objets);
      jalon('clementCorps');
      // les meubles devant lui (images), puis les pièces vives et les objets posés
      etatTable();
      majCouche(L_TABLE);
      jalon('meubles');
      // ses bras et ce qu'il tient, la poussière
      if (ouvrir(Z_DEVANT, zoneEcran(unir(em.bras, empriseParticules())), dv)) {
        repereZone(Z_DEVANT); Z_DEVANT.g.lineCap = 'round';
        cl.dessiner(Z_DEVANT.g, 'devant', objets);
        dessinerParticules(Z_DEVANT.g);
      } else cl.dessiner(muet(dv), 'devant', objets);
      jalon('clementDevant');
      // la lumière des lampes (la lampe du fond vacille), la poussière qui flotte
      majCouche(L_LUMIERE);
      majCouche(L_LUMIERE540);
      opacite(L_LUMIERE540.c, (1 + 0.02 * Math.sin(tVie * 7.3 + 540)) / 1.02);
      majMoutes();
      jalon('lumiere');
      majComptoir();
      jalon('comptoir');
      // le soir, la radio, le caisson lumineux, le vignettage, l'indice, la vitre
      majSoir();
      majCouche(L_SOIR_HALOS); opacite(L_SOIR_HALOS.c, nuitK);
      majCouche(L_RADIO);
      majCouche(L_RADIO_AIGUILLE);
      majCouche(L_SMALL); opacite(L_SMALL.c, nuitK);
      majVignette();
      majIndice();
      majVitre();
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
    function mainLibre(cote) { const m = mainDe(cote); m.mode = 'libre'; m.coude = 0; m.raccourci = 0; m.angle = null; m.suit = null; m.pose = 'ouverte'; m.devant = false; }
    function mainVers(cote, x, y, ms, { pose, angle, ease = E.io, jeton, devant, coude, raccourci } = {}) {
      const m = mainDe(cote);
      m.mode = 'fixe'; m.suit = null;
      const x0 = m.x, y0 = m.y, a0 = m.angle == null ? null : m.angle, c0 = m.coude || 0, c1 = coude == null ? c0 : coude;
      const r0 = m.raccourci || 0, r1 = raccourci == null ? r0 : raccourci;
      if (devant != null) m.devant = devant;
      return tw(ms, (e, p) => {
        m.x = lerp(x0, x, e); m.y = lerp(y0, y, e); m.coude = lerp(c0, c1, e); m.raccourci = lerp(r0, r1, e);
        if (angle !== undefined) m.angle = angle == null ? null : a0 == null ? angle : lerp(a0, angle, e);
        if (pose && p >= 0.55) m.pose = pose;
      }, ease, jeton);
    }
    const brasDe = (cote) => { const d = cl.dernier; return d && d.bras ? d.bras.find((b) => b.cote === cote) : null; };
    /** amener le bout des doigts pincés en (x, y) : la cible de la main se corrige à chaque image (d'après le dernier dessin) */
    function boutVers(cote, x, y, ms, { ease = E.io, jeton, coude, devant, angle } = {}) {
      const m = mainDe(cote);
      m.mode = 'fixe'; m.suit = null; m.pose = 'pince';
      if (devant != null) m.devant = devant;
      const x0 = m.x, y0 = m.y, a0 = m.angle, c0 = m.coude || 0, c1 = coude == null ? c0 : coude;
      return tw(ms, (e) => {
        const B = brasDe(cote), [bx, by] = B ? boutDe(B) : [m.x, m.y];
        m.x = lerp(x0, x - (bx - m.x), e); m.y = lerp(y0, y - (by - m.y), e); m.coude = lerp(c0, c1, e);
        if (angle !== undefined) m.angle = angle == null ? null : a0 == null ? angle : lerp(a0, angle, e);
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

    /** où mettre la main droite pour que la panne du marteau (tourné de a) tombe en (x, y) : la prise est au creux de
        la main, à ~2,8 cm devant la cible de la main dans l'axe de l'avant-bras (d'après le dernier dessin) */
    function mainPourPanne(x, y, a) {
      const B = brasDe('D'), u = B ? B.angMain : -0.9, c = Math.cos(a), s = Math.sin(a);
      const fx = 19.25, fy = 5.8; // la panne, depuis la prise (le manche)
      return [x - (c * fx - s * fy) - Math.cos(u) * 2.8, y - (s * fx + c * fy) - Math.sin(u) * 2.8];
    }
    /** la chaussure suivante sur le pied de fer : un autre cuir, une semelle sans clous */
    function chaussureSuivante() {
      forme.clous = []; forme.eclat = 0;
      const i = CUIRS.indexOf(forme.cuir);
      forme.cuir = CUIRS[(i + 1 + Math.floor(RV() * (CUIRS.length - 1))) % CUIRS.length];
    }
    // de près, pendant qu'il cloue : le pied de fer, ses mains et sa tête penchée
    const CADRE_CLOUS = { x: 303, d: 122, y: -128, f: 0.6 };

    /** 1. Le marteau sur le pied de fer : la caméra s'approche ; pour chaque clou, la main gauche le prend dans la
        coupelle, le plante debout au bord de la semelle, un petit coup pour qu'il tienne ; la main s'écarte et tient
        la chaussure, un coup franc : la tête reste, rangée avec les autres le long de la demi-semelle */
    async function marteler(j) {
      const st = STATIONS.etabli, clou = OBJ.clou;
      if (forme.clous.length >= PLACES_CLOUS.length) chaussureSuivante();
      await marcher(st.x, j, st.face);
      camGros = CADRE_CLOUS;
      await Promise.all([corps({ lean: 0.2 }, 400, E.io, j), tete({ pitch: 0.5, turn: 0 }, 400, E.io, j), regardVers(0, -0.4, 400, j)]);
      // le marteau, pris par le manche, tenu prêt au-dessus du travail ; la main gauche tient le bout de la chaussure
      await versObjet('D', marteau, 450, { pose: 'poing', devant: true, angle: null, coude: 0.4, jeton: j });
      prendre('D', marteau);
      son('bq-pose', { v: 0.5 });
      await Promise.all([
        mainVers('D', 280, -128, 420, { coude: 0.4, raccourci: 0.75, jeton: j }), angleMarteau(-0.55, 420, j),
        mainVers('G', forme.x + 12.5, forme.y - 2.2, 420, { pose: 'plate', devant: true, angle: Math.PI - 0.25, coude: 0.35, jeton: j }),
      ]);
      /** un coup sur (x, y) : l'élan (le poignet d'abord, la main à peine), le coup sec, le choc, le rebond */
      const A_COUP = -0.35; // le marteau à l'impact : le manche monte un peu vers la tête
      const coup = async (x, y, force, choc) => {
        const [hx, hy] = mainPourPanne(x, y, A_COUP);
        const lever = 170 + 190 * force;
        await Promise.all([mainVers('D', hx + 1.5 * force, hy - 2 - 2 * force, lever, { ease: E.out, coude: 0.4, raccourci: 0.8, jeton: j }), angleMarteau(A_COUP - 0.5 * force - 0.05, lever, j, E.out)]);
        await att(40 + RV() * 60, j);
        const frappe = 80 + 25 * (1 - force);
        await Promise.all([mainVers('D', hx, hy, frappe, { ease: E.in, jeton: j }), angleMarteau(A_COUP, frappe, j, E.in)]);
        son('hammer', { gain: 0.22 + 0.45 * force });
        M.etabli.choc = force;
        choc();
        await Promise.all([
          mainVers('D', hx + 0.5, hy - 1 - 1.5 * force, 150, { ease: E.out, jeton: j }), angleMarteau(A_COUP - 0.2 * force, 150, j, E.out),
          tw(230, (e) => { M.etabli.choc = force * (1 - e); forme.eclat = Math.max(0, forme.eclat - 0.05); }, E.out, j),
        ]);
      };
      const n = 3 + Math.floor(RV() * 2);
      for (let i = 0; i < n && forme.clous.length < PLACES_CLOUS.length; i++) {
        const place = PLACES_CLOUS[forme.clous.length], pied = piedClou(place);
        const nx = forme.x + pied[0], ny = forme.y + pied[1]; // où le clou entre
        // un clou pris dans la coupelle, du bout des doigts
        await Promise.all([boutVers('G', 322, -101.8, 430, { devant: true, coude: 0.2, angle: null, jeton: j }), tete({ pitch: 0.56, turn: 0.14 }, 380, E.io, j), regardVers(0.4, -0.5, 300, j)]);
        clou.visible = true; clou.enfonce = 0; clou.plante = null;
        prendre('G', clou);
        son('bq-clou', { v: 0.45 });
        await att(110, j);
        // planté debout à sa place, la pointe sur la semelle
        await Promise.all([boutVers('G', nx, ny - 2.2 + clou.prise[1], 460, { coude: 0.45, jeton: j }), tete({ pitch: 0.5, turn: 0.02 }, 400, E.io, j), regardVers(0.05, -0.45, 300, j)]);
        lacher(clou);
        clou.plante = pied;
        await att(90, j);
        // un petit coup : il tient ; les doigts s'ouvrent, la main va tenir le bout de la chaussure
        await coup(nx, ny - 2.2, 0.35, () => { clou.enfonce = 0.5; son('bq-clou', { v: 0.6 }); });
        await Promise.all([mainVers('G', forme.x + 12.5, forme.y - 2.2, 240, { pose: 'plate', angle: Math.PI - 0.25, coude: 0.35, jeton: j }), att(120, j)]);
        // le coup franc : à fleur de semelle
        await coup(nx, ny - 1.1, 1, () => {
          clou.enfonce = 1; clou.visible = false; clou.plante = null;
          forme.clous.push(place); forme.eclat = 1;
          son('bq-clou');
        });
        if (RV() < 0.35) await coup(nx, ny, 0.55, () => { forme.eclat = 0.6; });
        if (RV() < 0.25) { // on vérifie la ligne
          await Promise.all([tete({ pitch: 0.62, roll: -0.12 }, 360, E.io, j), corps({ lean: 0.26 }, 360, E.io, j)]);
          await att(420, j);
          await Promise.all([tete({ roll: 0, pitch: 0.5 }, 300, E.io, j), corps({ lean: 0.2 }, 300, E.io, j)]);
        }
      }
      camGros = null;
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
      forme.neuve = false; chaussureSuivante(); // (la chaussure suivante)
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
      camGros = null;
      { const c = OBJ.clou; if (c.main) lacher(c, c.maison); c.visible = false; c.plante = null; c.enfonce = 0; }
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
    let camGros = null; // le gros plan d'une activité (le clouage), après la conversation
    function majCamera(dt) {
      const k = 1 - Math.exp(-dt / 1000 * 2.6);
      if (camLibre) { cam.cx = camLibre.x; cam.cd = camLibre.d; cam.ct = tiltPour(camLibre.y, camLibre.d, camLibre.f); }
      else if (regardeNous) {
        cam.cx = S.x; cam.cd = 92;
        cam.ct = tiltPour(S.y - 172 + S.assis * 30, cam.cd, 0.25);
      } else if (camGros) { cam.cx = camGros.x; cam.cd = camGros.d; cam.ct = tiltPour(camGros.y, camGros.d, camGros.f); } else {
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
      const ecart = tPrec ? now - tPrec : 0;
      const dt = tPrec ? Math.min(70, now - tPrec) : 16;
      tPrec = now;
      const t0 = performance.now();
      maj(reduit && !transition ? 0 : dt * VITESSE);
      rendre();
      placerCibles();
      nImages++;
      cadence = cadence * 0.9 + (performance.now() - t0) * 0.1;
      if (ecart) adapter(ecart);
      if ((vivant && !reduit) || transition) raf = requestAnimationFrame(image);
    }
    /* la densité adaptative : quand les images traînent (moins de ~22 i/s, deux secondes durant), les calques vifs (Clément,
       les objets) passent de 2 à 1,5 px par px, puis les calques flous (la lumière) à 1,25 ; ça remonte après ~12 s de
       bonne cadence */
    const PALIERS = [[1, 1], [0.75, 0.75], [0.75, 0.625], [0.625, 0.625]];
    let palier = 0, moyImg = 33.3, nAdapt = 0;
    function adapter(ecart) {
      if (opts.adaptatif === false || ecart > 250 || transition) return; // (une reprise, un mouvement de caméra de l'appli : on ne juge pas là-dessus)
      moyImg = moyImg * 0.94 + ecart * 0.06;
      nAdapt++;
      if (moyImg > 46 && nAdapt > 60 && palier < PALIERS.length - 1) palier++;
      else if (moyImg < 36 && nAdapt > 360 && palier > 0) palier--;
      else return;
      nAdapt = 0;
      [qVive, qFloue] = PALIERS[palier];
    }
    function etatChange() {
      if (actif()) { tPrec = 0; demander(); } else couperSons();
    }
    CO.on && CO.on('view', (v) => { vueOk = v === vueId; etatChange(); });
    const onVis = () => { docOk = !document.hidden; etatChange(); };
    document.addEventListener('visibilitychange', onVis);
    const io = window.IntersectionObserver ? new IntersectionObserver((es) => { ecranOk = es[es.length - 1].isIntersecting; etatChange(); }) : null;
    if (io) io.observe(host);
    /** tout est à repeindre (la taille a changé, des canevas ont été perdus) */
    function salir() {
      [L_AIGUILLES, L_MACHINES, L_TABLE, L_LUMIERE, L_LUMIERE540, L_SOIR_HALOS, L_RADIO, L_RADIO_AIGUILLE, L_SMALL].forEach((L) => { L.sale = true; });
      L_COMPTOIR.R = null; L_PLAFOND.cle = L_SOIR.cle = L_VIGNETTE.cle = ''; L_INDICE.r = 0;
    }
    const PLANS = [P_MUR, P_FOND, P_MEUBLES, P_OBJETS, P_PREMIER];
    /** les images du décor (re)prennent leur place ; celles qu'elles remplacent rendent leur mémoire */
    function accrocherTout() {
      PLANS.forEach((P) => {
        const avant = Array.from(P.c.children);
        accrocher(P);
        avant.forEach((c) => { if (c.parentNode !== P.c) c.width = c.height = 0; });
      });
    }
    let rzT = 0, s0Peint = 0, repeintTour = 0;
    function repeindreDecor() {
      const tour = ++repeintTour, s1 = s0;
      peindreToutDoucement(() => tour !== repeintTour || mort).then((ok) => {
        if (!ok || tour !== repeintTour || mort) return;
        s0Peint = s1; accrocherTout(); cl.viderCaches(); salir();
        if (vueOk && docOk) { rendre(); placerCibles(); }
      });
    }
    const ro = window.ResizeObserver ? new ResizeObserver(() => {
      if (mort || !pret) return;
      const avant = W, avantH = H;
      mesurer();
      if (Math.abs(s0 - s0Peint) / (s0Peint || 1) > 0.15) { // (l'écran a tourné) : le décor repeint à la nouvelle échelle, par tranches
        clearTimeout(rzT);
        rzT = setTimeout(() => { if (!mort) repeindreDecor(); }, 220);
      }
      if (avant !== W || avantH !== H) salir();
      // (rien du tout quand la scène ne se voit pas : la prochaine image la remettra à sa taille)
      if ((avant !== W || avantH !== H || !raf) && vueOk && docOk) { rendre(); placerCibles(); }
      demander();
    }) : null;
    if (ro) ro.observe(host);
    // le navigateur peut reprendre la mémoire des canevas (onglet en arrière-plan, mémoire pleine) : on repeint
    racine.addEventListener('contextrestored', () => { if (mort || !pret) return; cl.viderCaches(); salir(); repeindreDecor(); demander(); }, true);

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
        // au moins 44 px de côté (le doigt) ; (on n'écrit le style que s'il change : pas de mise en page pour rien)
        const cx = (Math.max(0, x0) + Math.min(W, x1)) / 2, cy = (Math.max(0, y0) + Math.min(H, y1)) / 2;
        const ww = Math.max(44, L), hh = Math.max(44, Hh);
        const tf = `translate(${(cx - ww / 2).toFixed(1)}px,${(cy - hh / 2).toFixed(1)}px)`, lw = ww.toFixed(0) + 'px', lh = hh.toFixed(0) + 'px';
        if (c.tf !== tf) { c.tf = tf; c.el.style.transform = tf; }
        if (c.lw !== lw) { c.lw = lw; c.el.style.width = lw; }
        if (c.lh !== lh) { c.lh = lh; c.el.style.height = lh; }
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
    // le décor ; puis, chacun dans sa tranche : les meules, le premier dessin de Clément (ses images en cache), les calques
    // qu'on ne repeint qu'à l'occasion (la première image n'aura plus qu'à poser le reste)
    const tranche = (nom, fn) => { const f = () => { try { fn(); } catch (e) { console.warn('boutique', e); } return null; }; f.nom = nom; return f; };
    await peindreToutDoucement(() => mort, [
      ...D.ROUES.map((w) => tranche('meule ' + w.type, () => texRoue(w.type))),
      Object.assign(() => {
        const g0 = toile(4, 4).getContext('2d'), k0 = s0 * sig(K.D_LANE) * densite(qVive);
        g0.setTransform(k0, 0, 0, k0, 0, 0);
        return { iter: cl.prechaufferCaches(g0), fin() {} };
      }, { nom: 'Clément en cache' }),
      tranche('comptoir', majComptoir),
      tranche('lumière', () => { majCouche(L_LUMIERE); majCouche(L_LUMIERE540); }),
      tranche('machines', () => majCouche(L_MACHINES)),
      tranche('table', () => { etatTable(); majCouche(L_TABLE); }),
      tranche('vignettage', () => { majVignette(); majCouche(L_AIGUILLES); majPlafond(); }),
    ]);
    if (!mort) accrocherTout();
    await new Promise((r) => setTimeout(r, 0));
    pret = true;
    maj(0);
    rendre();
    placerCibles();

    /** la mémoire des canevas de la scène (octets) : le décor, les calques, les images en cache de Clément */
    function memoire() {
      const o = (c) => (c ? c.width * c.height * 4 : 0);
      let decor = o(petitCtx && petitCtx.canvas) + o(TACHE_SOIR) + o(TACHE_RUE), calques = 0;
      Object.values(SP).forEach((sp) => { if (sp) decor += o(sp.c); });
      Object.values(TEXROUE).forEach((t) => { decor += o(t.net) + o(t.flou); });
      const detail = {};
      CANEVAS.forEach((c) => { calques += o(c); if (o(c)) detail[c.dataset.calque] = mo(o(c)); });
      const clement = (cl.stats && cl.stats.octets) || 0;
      return { decor, calques, clement, total: decor + calques + clement, detail };
    }
    const mo = (v) => Math.round(v / 104857.6) / 10;
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
        // (la mémoire des canevas rendue tout de suite : iOS compte le total, il n'attend pas le ramasse-miettes)
        CANEVAS.forEach((c) => { c.width = c.height = 0; });
        Object.values(SP).forEach((sp) => { if (sp) sp.c.width = sp.c.height = 0; });
        cl.viderCaches();
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
      /** (labo) le dedans de la scène, à lire ou à régler à la main avant un pas(0) */
      get labo() { return { S, OBJ, M, cam, prendre, lacher, tiltPour }; },
      get activites() { return Object.keys(ACTIVITES); },
      setNuit(on) {
        nuit = !!on;
        if (pret && !SP[nuit ? 'porteNuit' : 'porteJour']) { porte(nuit); accrocher(P_MUR); } // (l'autre porte, peinte à la demande)
        if (reduit) { nuitK = nuit ? 1 : 0; rendre(); }
        demander();
      },
      perf: PERF,
      tempsSprites: TEMPS_SPRITE,
      tranches: TRANCHES,
      etat() { return { drapeaux: { pret, mort, enPause, vueOk, docOk, ecranOk, W, vivant, raf: !!raf }, voix: Object.keys(voix).filter((k) => voix[k].v), memoire: (() => { const m = memoire(); return `${mo(m.total)} Mo (décor ${mo(m.decor)}, calques ${mo(m.calques)}, Clément ${mo(m.clement)})`; })(), calques: memoire().detail, densite: { vive: densite(qVive), floue: densite(qFloue), palier }, images: nImages, caches: cl.stats, activite: enCours, x: S.x, regardeNous, parle, nuit, particules: PART.length, cadence: +cadence.toFixed(2), cam: { x: +cam.x.toFixed(1), d: +cam.d.toFixed(1), tilt: +cam.tilt.toFixed(3) } }; },
    };
    function poseDepart() {
      S.x = STATIONS.etabli.x; S.yaw = 0; S.assis = 0; S.lean = 0.2; S.tete.turn = 0; S.tete.pitch = 0.5; S.regard = [0, -0.4]; S.sourire = 0; S.bouche = 0;
      S.mainD.mode = 'fixe'; S.mainD.coude = 0.4; S.mainD.raccourci = 0.75; S.mainD.x = 281; S.mainD.y = -128; S.mainD.pose = 'poing'; S.mainD.angle = null; S.mainD.devant = true;
      prendre('D', marteau); marteau.aMonde = -0.6;
      S.mainG.mode = 'fixe'; S.mainG.x = forme.x + 12.5; S.mainG.y = forme.y - 2.2; S.mainG.pose = 'plate'; S.mainG.angle = Math.PI - 0.25; S.mainG.coude = 0.35; S.mainG.devant = true;
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
