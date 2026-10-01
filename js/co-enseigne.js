/* ==========================================================================
   Cordo 63 — l'enseigne : la Air Jordan 1 sculptée dans le bois, en images (CO.Enseigne)
   Le modèle 3D (js/co-jordan.js, WebGL) a été rendu une fois pour toutes, pose par pose, sur un tour
   complet, de jour et de nuit (tools/render-images.mjs → assets/img/enseigne-jour.webp, -nuit.webp) :
   ici, on feuillette ces planches. Rien à calculer au chargement, aucun GPU à faire tourner : l'enseigne
   tourne doucement sur sa broche (un tour en 14 s, redessinée 15 fois par seconde en croisière, réveillée par un
   minuteur et non à chaque image de l'écran, en fondu d'une pose à la suivante), on la relance du doigt (un toucher : on toque sur le bois ; un
   glissé horizontal : on la fait tourner), et elle dort quand on ne la voit pas.
     CO.Enseigne.create(host, { interactive, nuit, cache }) → Promise<api>   (cache : invisible jusqu'à entree())
       api { canvas, setNuit(b), tourner(v) (élan, rad/s), entree() → Promise, pause(), reprise(), detruire(),
             on('toc' | 'tourne', fn), yaw }   (la même que CO.Jordan)
     CO.Enseigne.precharger(nuit) → Promise   (l'ouverture l'attend : l'enseigne est prête quand on entre)
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});

  // les planches : n poses sur un tour (yaw = k × 2π / n ; 0 : la chaussure de profil, parallèle au mur),
  // chacune l × h px (le rapport de la zone de l'enseigne sur la façade, 70 × 112), rangées en colonnes
  const PLANCHE = { n: 48, l: 180, h: 288, colonnes: 8 };
  const IMAGES = { jour: 'assets/img/enseigne-jour.webp', nuit: 'assets/img/enseigne-nuit.webp' };
  const TOUR = 14; // secondes pour un tour, en croisière
  const PAS_IMAGE = 66; // ms entre deux images, en croisière (15 images/s, en fondu : assez pour un tour si lent)
  const TAU = Math.PI * 2;
  const angle = (a) => a - TAU * Math.floor((a + Math.PI) / TAU); // → ]−π, π]

  const charges = {};
  function charger(quoi) {
    if (!charges[quoi]) {
      charges[quoi] = new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
        im.onerror = () => { delete charges[quoi]; rej(new Error('enseigne : ' + IMAGES[quoi])); };
        im.src = IMAGES[quoi];
      });
    }
    return charges[quoi];
  }

  class Enseigne {
    constructor(host, opts) {
      this.host = host;
      this.o = Object.assign({ interactive: true, nuit: false, yaw: 0.6 }, opts || {});
      this.fige = !!this.o.fige || !!CO.reduced; // mouvement réduit : pose fixe, un demi-tour lent quand on la touche
      this.ecoute = {};
      this.psi = +this.o.yaw || 0;
      this.om = 0;
      this.croisiere = this.fige ? 0 : TAU / TOUR;
      this.demi = null;
      this.nuit = this.o.nuit ? 1 : 0;
      this.nuitCible = this.nuit;
      this.alpha = this.o.cache ? 0 : 1; // cache : invisible jusqu'à entree()
      this.im = {};
      this.visible = !('IntersectionObserver' in window);
      this.vueActive = true;
      this.tDessin = 0; this.tTourne = 0; this.raf = 0; this.tPrec = 0;
      const cv = (this.canvas = document.createElement('canvas'));
      cv.className = 'co-enseigne';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'L’enseigne de la cordonnerie : une Air Jordan 1 sculptée dans le bois qui tourne dans son cadre d’acier');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y;-webkit-tap-highlight-color:transparent;' + (this.o.interactive ? 'cursor:grab;' : 'pointer-events:none;');
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(cv);
      this.g = cv.getContext('2d');
      this.vue = (host.closest && host.closest('.view') && host.closest('.view').id) || 'accueil';
      this.boucleFn = (t) => this.boucle(t);
      this.io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { es.forEach((e) => { this.visible = e.isIntersecting; }); this.reveil(); }) : null;
      if (this.io) this.io.observe(cv);
      this.mo = 'MutationObserver' in window ? new MutationObserver(() => this.reveil()) : null;
      if (this.mo) this.mo.observe(host, { attributes: true, attributeFilter: ['style', 'class'] });
      this.ro = 'ResizeObserver' in window ? new ResizeObserver(() => this.taille()) : null;
      if (this.ro) this.ro.observe(host);
      else { this.onResize = () => this.taille(); window.addEventListener('resize', this.onResize); }
      this.onVis = () => this.reveil();
      document.addEventListener('visibilitychange', this.onVis);
      this.offVue = CO.on ? CO.on('view', (v) => { this.vueActive = !v || v === this.vue; this.reveil(); }) : null;
      if (this.o.interactive) this.gestes();
      this.taille();
    }

    async charge() {
      const quoi = this.nuit > 0.5 ? 'nuit' : 'jour';
      this.im[quoi] = await charger(quoi);
      this.pret = true;
      this.dessine();
      this.kick();
    }

    taille() {
      const r = this.host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // pas plus fin que les planches elles-mêmes
      const dpr = Math.min(window.devicePixelRatio || 1, PLANCHE.l / r.width, 3);
      const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      if (this.pret) this.dessine();
    }

    /* une image : la pose de l'instant, en fondu entre ses deux voisines (et entre le jour et la nuit) */
    dessine() {
      const g = this.g, cv = this.canvas, P = PLANCHE;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      if (!this.pret || this.alpha <= 0) return;
      const f = ((((this.psi / TAU) % 1) + 1) % 1) * P.n, i = Math.floor(f) % P.n, j = (i + 1) % P.n, t = f - Math.floor(f);
      const src = (k) => [(k % P.colonnes) * P.l, Math.floor(k / P.colonnes) * P.h];
      const couches = [];
      if (this.im.jour && this.nuit < 1) couches.push([this.im.jour, 1 - (this.im.nuit ? this.nuit : 0)]);
      if (this.im.nuit && this.nuit > 0) couches.push([this.im.nuit, this.im.jour ? this.nuit : 1]);
      g.globalCompositeOperation = 'lighter'; // l'addition des couleurs prémultipliées : un vrai fondu, sans halo
      for (const [im, k] of couches) {
        for (const [q, a] of [[i, 1 - t], [j, t]]) {
          const al = a * k * this.alpha;
          if (al < 0.004) continue;
          const [sx, sy] = src(q);
          g.globalAlpha = al;
          g.drawImage(im, sx, sy, P.l, P.h, 0, 0, cv.width, cv.height);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }

    /* ---------- les gestes : on lance la chaussure (tap, glisser horizontal) ; la page défile toujours ---------- */
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
          if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.15) {
            d.tire = true; d.lx = e.clientX; d.lt = e.timeStamp;
            try { cv.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
            cv.style.cursor = 'grabbing';
            this.demi = null;
          } else if (Math.abs(dy) > 10) d.defile = true;
          return;
        }
        const r = this.host.getBoundingClientRect();
        const k = (Math.PI * 1.6) / Math.max(90, Math.min(r.width || 120, 360)), ddx = e.clientX - d.lx, dt = Math.max(8, e.timeStamp - d.lt) / 1000;
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
        if (d.tire) { if (e.timeStamp - d.lt > 90 || this.fige) this.om = this.fige ? 0 : this.croisiere; }
        else if (e.type === 'pointerup' && !d.defile && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8 && performance.now() - d.t0 < 450) this.toc();
        this.kick();
      };
      cv.addEventListener('pointerup', fin);
      cv.addEventListener('pointercancel', fin);
      cv.addEventListener('lostpointercapture', fin);
    }
    toc() {
      if (CO.sfx) CO.sfx.play('knock');
      if (CO.vibrate) CO.vibrate(8);
      this.lance(2.6);
      this.emet('toc', {});
    }
    lance(v) {
      if (!v) return;
      if (this.fige) { if (!this.demi) this.demi = { t0: performance.now(), a: this.psi, da: Math.PI * Math.sign(v), dur: 2600 }; }
      else this.om += v;
      this.kick();
    }

    /* ---------- le temps : la croisière, les élans, le sommeil ---------- */
    vivant() {
      return !this.mort && !this.pause && this.visible && this.vueActive && !document.hidden && this.canvas.width > 2 && this.host.style.opacity !== '0';
    }
    reveil() { if (this.vivant()) this.kick(); }
    kick() {
      if (this.mort || !this.pret) return;
      if (this.tCroisiere) { clearTimeout(this.tCroisiere); this.tCroisiere = 0; } // (un élan : on repasse à chaque image)
      if (!this.raf) { this.tPrec = 0; this.raf = requestAnimationFrame(this.boucleFn); }
    }
    boucle(now) {
      this.raf = 0;
      if (!this.vivant()) return;
      // encore cachée (sous l'ouverture, avant entree()) : rien à dessiner, elle dort ; entree() la réveille
      if (this.alpha <= 0 && !this.anim) { this.tPrec = 0; return; }
      const dt = this.tPrec ? Math.min(0.25, (now - this.tPrec) / 1000) : 1 / 60; // (en croisière, une image toutes les 66 ms ; après un sommeil, kick() repart de zéro)
      this.tPrec = now;
      let vif = false;
      if (this.anim) {
        const p = Math.min(1, (now - this.anim.t0) / this.anim.dur);
        this.anim.fn(p);
        if (p >= 1) { const a = this.anim; this.anim = null; a.res(); }
        vif = true;
      }
      if (this.doigt && this.doigt.tire) vif = true;
      else if (this.demi) {
        const p = Math.min(1, (now - this.demi.t0) / this.demi.dur);
        this.psi = this.demi.a + this.demi.da * CO.ease.inOutSine(p);
        if (p >= 1) this.demi = null;
        vif = true;
      } else {
        this.om += (this.croisiere - this.om) * (1 - Math.exp(-dt / 1.5));
        if (Math.abs(this.om) > 0.0004) { this.psi += this.om * dt; vif = true; } else this.om = 0;
      }
      if (this.nuit !== this.nuitCible) { this.nuit += Math.sign(this.nuitCible - this.nuit) * Math.min(Math.abs(this.nuitCible - this.nuit), dt * 1.8); vif = true; }
      // en croisière, une vingtaine d'images par seconde suffisent (un tour en 14 s) ; vite, à chaque image
      const vite = Math.abs(this.om) > this.croisiere * 1.6 || (this.doigt && this.doigt.tire) || this.anim || this.demi;
      if (vite || now - this.tDessin >= PAS_IMAGE - 4) {
        this.tDessin = now;
        this.dessine();
        if (now - this.tTourne > 50) { this.tTourne = now; this.emet('tourne', angle(this.psi)); }
      }
      if (!vif) return;
      if (vite) this.raf = requestAnimationFrame(this.boucleFn);
      else { // en croisière : le prochain réveil dans une quinzaine de millisecondes seulement
        this.tCroisiere = setTimeout(() => { this.tCroisiere = 0; if (!this.raf && !this.mort) this.raf = requestAnimationFrame(this.boucleFn); }, Math.max(0, PAS_IMAGE - (performance.now() - now) - 8));
      }
    }

    /* l'arrivée : elle paraît en tournant vite, puis ralentit jusqu'à la croisière */
    entree() {
      if (!this.pret) return Promise.resolve();
      if (this.fige) { this.alpha = 1; this.dessine(); return Promise.resolve(); }
      return new Promise((res) => {
        this.anim = {
          t0: performance.now(), dur: 1500, res,
          fn: (p) => { this.alpha = Math.min(1, p / 0.42); this.om = this.croisiere + 5 * (1 - CO.ease.outCubic(p)); },
        };
        this.alpha = 0;
        this.kick();
      }).then(() => { this.alpha = 1; });
    }

    setNuit(b) {
      this.nuitCible = b ? 1 : 0;
      const quoi = b ? 'nuit' : 'jour';
      if (this.im[quoi]) { if (this.fige) { this.nuit = this.nuitCible; this.dessine(); } this.kick(); return; }
      charger(quoi).then((im) => { this.im[quoi] = im; if (this.fige) { this.nuit = this.nuitCible; this.dessine(); } this.kick(); }, () => { /* la planche manque : on garde l'autre */ });
    }

    emet(ev, d) { (this.ecoute[ev] || []).forEach((fn) => { try { fn(d); } catch (e) { /* rien */ } }); }
    api() {
      const self = this;
      return {
        canvas: this.canvas,
        setNuit(b) { self.setNuit(b); },
        tourner(v) { self.lance(+v || 0); },
        entree() { return self.entree(); },
        pause() { self.pause = true; cancelAnimationFrame(self.raf); self.raf = 0; clearTimeout(self.tCroisiere); self.tCroisiere = 0; },
        reprise() { self.pause = false; self.reveil(); },
        detruire() {
          if (self.mort) return;
          self.mort = true;
          cancelAnimationFrame(self.raf);
          clearTimeout(self.tCroisiere);
          [self.io, self.ro, self.mo].forEach((o) => o && o.disconnect());
          if (self.onResize) window.removeEventListener('resize', self.onResize);
          document.removeEventListener('visibilitychange', self.onVis);
          if (self.anim) self.anim.res();
          self.canvas.remove();
          self.ecoute = {};
        },
        on(ev, fn) { (self.ecoute[ev] = self.ecoute[ev] || []).push(fn); return () => { self.ecoute[ev] = (self.ecoute[ev] || []).filter((f) => f !== fn); }; },
        get yaw() { return angle(self.psi); },
        get pret() { return !!self.pret; },
      };
    }
  }

  CO.Enseigne = {
    PLANCHE, IMAGES,
    precharger: (nuit) => charger(nuit ? 'nuit' : 'jour'),
    create(host, opts) {
      const e = new Enseigne(host, opts);
      return e.charge().then(() => e.api());
    },
  };
})();
