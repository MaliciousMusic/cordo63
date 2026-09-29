/* ==========================================================================
   Cordo 63 — l'appli : onglets (#accueil, #services, #deposer, #tickets, #atelier),
   feuilles qui montent, son, « Ouvert / Fermé » à l'heure de Paris (l'enseigne-soulier en
   tête de l'accueil, la devanture), les lacets sous le logo, la devanture et son enseigne en
   bois (la Jordan, en images, posée par-dessus) ; on touche la vitrine : la caméra entre dans la
   boutique (l'onglet L'atelier), et en ressort par « La rue ».
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const VIEWS = ['accueil', 'services', 'deposer', 'tickets', 'atelier'];
  let current = null;
  let facade = null, jordan = null, panneau = null, lacets = null;

  /* ---------- petits messages ---------- */
  let toastT = 0;
  CO.toast = function (msg, ms = 2600) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), ms);
  };

  /* ---------- onglets ---------- */
  function route(first) {
    const raw = decodeURIComponent((location.hash || '#accueil').slice(1));
    if (raw === 'pro') { // l'espace atelier s'ouvre par-dessus la vue en cours
      if (CO.Pro) CO.Pro.ouvrir();
      history.replaceState(null, '', '#' + (current || 'accueil'));
      if (!current) show('accueil', first);
      return;
    }
    let view = VIEWS.includes(raw) ? raw : null;
    let target = null;
    if (!view) {
      target = raw ? document.getElementById(raw) : null;
      const v = target && target.closest('.view');
      view = v ? v.dataset.view : 'accueil';
    }
    show(view, first);
    if (target) {
      setTimeout(() => {
        CO.scrollTo(target);
        if (target.classList.contains('ligne') && CO.Services) CO.Services.eclairer(target.dataset.id);
      }, first ? 80 : 400);
    }
  }
  CO.scrollTo = function (el, offset = 64) {
    const sc = el.closest('.view-scroll');
    if (!sc) return;
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - offset;
    sc.scrollTo({ top: Math.max(0, top), behavior: CO.reduced ? 'auto' : 'smooth' });
  };
  /** change de vue en fondu (sans le glissé des onglets) */
  CO.fondu = async function (fn, ms = 520) {
    const main = $('#main');
    main.classList.add('fondu');
    fn();
    await CO.wait(ms);
    main.classList.remove('fondu');
  };
  CO.go = function (view) {
    if (location.hash !== '#' + view) location.hash = view;
    else route(false);
  };

  function show(view, first) {
    if (view === current) return;
    const iNew = VIEWS.indexOf(view), iOld = VIEWS.indexOf(current);
    $$('.view').forEach((v) => {
      const i = VIEWS.indexOf(v.dataset.view);
      const on = v.dataset.view === view;
      if (on && !v.classList.contains('vue')) {
        v.classList.add('vue');
        v.classList.toggle('is-left', i < iOld);
        if (!first) void getComputedStyle(v).opacity;
      }
      v.classList.toggle('is-active', on);
      v.classList.toggle('is-left', !on && i < iNew);
      v.setAttribute('aria-hidden', String(!on));
      if ('inert' in v) v.inert = !on;
    });
    $$('#tabbar .tab').forEach((t) => {
      const on = t.dataset.tab === view;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    current = view;
    CO.view = view;
    CO.emit('view', view);
  }

  function initTabs() {
    const main = $('main');
    main.addEventListener('scroll', () => { if (main.scrollLeft || main.scrollTop) { main.scrollLeft = 0; main.scrollTop = 0; } });
    $$('#tabbar .tab').forEach((t) => {
      t.addEventListener('click', (e) => {
        if (t.dataset.tab === current) {
          e.preventDefault();
          const sc = $(`#${current} .view-scroll`);
          if (sc) sc.scrollTo({ top: 0, behavior: CO.reduced ? 'auto' : 'smooth' });
        }
      });
    });
    window.addEventListener('hashchange', () => route(false));
  }

  /* ---------- feuilles ---------- */
  const closers = new Map();
  CO.openSheet = function (sel, onClose) {
    const s = $(sel);
    if (!s) return;
    closers.set(sel, onClose);
    s.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-open')));
    const panel = s.querySelector('.sheet-panel');
    panel.setAttribute('tabindex', '-1');
    setTimeout(() => panel.focus({ preventScroll: true }), 60);
    CO.sfx.play('open');
  };
  CO.closeSheet = function (sel) {
    const s = $(sel);
    if (!s || s.hidden) return;
    s.classList.remove('is-open');
    const fn = closers.get(sel);
    closers.delete(sel);
    CO.sfx.play('close');
    setTimeout(() => { s.hidden = true; fn && fn(); }, 420);
  };
  function initSheets() {
    $$('.sheet').forEach((s) => {
      const sel = '#' + s.id;
      s.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) CO.closeSheet(sel); });
      const panel = s.querySelector('.sheet-panel');
      let y0 = null, dy = 0;
      panel.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.sheet-grab') && !(panel.scrollTop <= 0 && e.pointerType === 'touch' && !e.target.closest('button, input, a, textarea, select, label'))) return;
        y0 = e.clientY; dy = 0;
        panel.style.transition = 'none';
      });
      panel.addEventListener('pointermove', (e) => {
        if (y0 == null) return;
        dy = Math.max(0, e.clientY - y0);
        panel.style.transform = `translateY(${dy}px)`;
      });
      const end = () => {
        if (y0 == null) return;
        y0 = null;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 110) CO.closeSheet(sel);
      };
      panel.addEventListener('pointerup', end);
      panel.addEventListener('pointercancel', end);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.sheet.is-open').forEach((s) => CO.closeSheet('#' + s.id));
    });
  }

  /* ---------- son ---------- */
  CO.syncSound = () => $$('[data-son]').forEach((b) => b.setAttribute('aria-checked', String(!!CO.sfx.on)));
  function initSound() {
    $$('[data-son]').forEach((b) => b.addEventListener('click', () => {
      CO.sfx.on = !CO.sfx.on;
      CO.syncSound();
      if (CO.sfx.on) CO.sfx.play('on');
      CO.emit('sound', CO.sfx.on);
    }));
    CO.syncSound();
  }

  /* ---------- horaires : l'enseigne-soulier, le tableau, la devanture ---------- */
  function renderHours() {
    const st = CO.statut();
    const j = CO.parisNow().getDay();
    $$('#horaires tr').forEach((tr) => tr.classList.toggle('auj', +tr.dataset.j === j));
    if (facade && facade.setStatut) facade.setStatut(st);
    if (panneau && panneau.maj) panneau.maj();
    return st;
  }
  function initHours() {
    renderHours();
    setInterval(renderHours, 60000);
  }

  /* ---------- l'enseigne-soulier : le statut en tête, les horaires qui se déplient ---------- */
  function initPanneau() {
    const host = $('#panneau-host');
    if (!host || !CO.Panneau || !CO.Panneau.create) return;
    try { panneau = CO.Panneau.create(host); } catch (e) { console.warn('panneau', e); }
  }

  /* ---------- les lacets : les accès rapides sous le logo ---------- */
  function initLacets() {
    const host = $('#lacets');
    if (!host || !CO.Lacets || !CO.Lacets.create) return;
    const S = CO.SHOP;
    try {
      lacets = CO.Lacets.create(host, [
        { label: 'Déposer une paire', couleur: '#F2D24B', action: () => CO.go('deposer') },
        { label: 'Les tarifs', couleur: '#8A927B', action: () => CO.go('services') },
        { label: 'Itinéraire', couleur: '#E03A2E', href: S.itineraire, externe: true },
        { label: 'Appeler Clément', couleur: '#F4EEE2', href: 'tel:' + S.telIntl },
        { label: 'Instagram', couleur: '#3A2A20', href: S.instagram, externe: true },
      ]);
    } catch (e) { console.warn('lacets', e); }
  }

  /* ---------- le soir (heure de Paris, coucher du soleil approché) ---------- */
  function isNight() {
    const q = new URLSearchParams(location.search);
    if (q.has('soir')) return true;
    if (q.has('jour')) return false;
    const now = CO.parisNow();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const coucher = 19.1 + 2.2 * Math.sin(((doy - 80) / 365) * CO.TAU);
    const lever = 7.4 - 1.9 * Math.sin(((doy - 80) / 365) * CO.TAU);
    const h = now.getHours() + now.getMinutes() / 60;
    return h >= coucher || h < lever;
  }
  CO.estNuit = isNight;

  /* ---------- l'enseigne : la Jordan en bois (ses images, js/co-enseigne.js) posée sur la devanture ---------- */
  function placerEnseigne() {
    const host = $('#enseigne-host'), zone = $('#enseigne-zone');
    if (!host || !facade || !facade.versEcran || !facade.zoneEnseigne) return;
    const r = facade.versEcran(facade.zoneEnseigne);
    if (!r) return;
    [host, zone].forEach((el) => {
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
    });
  }
  function enseigneVisible(v) {
    const host = $('#enseigne-host');
    if (!host) return;
    host.style.transition = 'opacity .35s ease';
    host.style.opacity = v ? '1' : '0';
    host.classList.toggle('interactif', v);
  }
  async function initEnseigne() {
    const host = $('#enseigne-host');
    // l'enseigne en images (js/co-enseigne.js : le modèle 3D rendu une fois pour toutes) ; sinon le WebGL
    const E = CO.Enseigne || CO.Jordan;
    if (!host || !E || !E.create || !facade) return null;
    placerEnseigne();
    try {
      jordan = await E.create(host, { mode: 'enseigne', pose: 'pointe', interactive: true, nuit: isNight(), cache: true });
    } catch (e) {
      console.warn('enseigne', e);
      return null;
    }
    CO.jordan = jordan;
    host.classList.add('interactif');
    if (jordan.on) {
      let dit = false;
      jordan.on('toc', () => {
        if (dit) return;
        dit = true;
        CO.toast('Leur enseigne : une Air Jordan 1 sculptée dans le bois.', 3200);
      });
    }
    $('#enseigne-zone').addEventListener('click', () => { if (jordan && jordan.tourner) jordan.tourner(2.4); });
    if (facade.suivre) facade.suivre(placerEnseigne);
    let rz = 0;
    window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(placerEnseigne, 120); });
    if (window.ResizeObserver) new ResizeObserver(() => placerEnseigne()).observe($('#scene'));
    return jordan;
  }

  /* ---------- la devanture ---------- */
  async function initFacade() {
    const host = $('#facade-host');
    if (!host) return null;
    if (!CO.Facade || !CO.Facade.create) {
      host.style.background = 'linear-gradient(180deg, #D8CFBD 0 36%, #6E866A 36% 44%, #2F2A26 44% 86%, #9A9A96 86%)';
      return null;
    }
    try {
      facade = await CO.Facade.create(host, {});
    } catch (e) {
      console.warn('devanture', e);
      return null;
    }
    CO.facade = facade;
    if (facade.setStatut) facade.setStatut(CO.statut());
    if (facade.setNuit) facade.setNuit(isNight());
    setInterval(() => { const n = isNight(); if (facade.setNuit) facade.setNuit(n); if (jordan && jordan.setNuit) jordan.setNuit(n); }, 120000);
    // les cibles de la devanture (clic, Entrée, Espace) : la boutique (la vitrine, la porte, Clément
    // derrière la vitre) on y entre ; le bandeau CORDONNERIE mène aux tarifs ; l'ardoise, au dépôt
    const agir = (id) => {
      if (id === 'boutique') entrerBoutique();
      else if (id === 'bandeau') { CO.sfx.play('hammer'); CO.go('services'); }
      else if (id === 'chevalet') CO.go('deposer');
    };
    if (facade.on) facade.on('cible', (id) => agir(id));
    else Object.entries(facade.cibles || {}).forEach(([id, el]) => el && el.addEventListener('click', () => agir(id)));
    return facade;
  }

  /* ---------- entrer dans la boutique : la caméra pousse dans la vitrine, fondu sur l'intérieur ---------- */
  let entrant = false;
  async function entrerBoutique(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (entrant || CO.view !== 'accueil') return;
    entrant = true;
    try {
      if (CO.Atelier) CO.Atelier.preparer();
      const sc = $('#accueil .view-scroll');
      if (sc && sc.scrollTop > 4) {
        sc.scrollTo({ top: 0, behavior: CO.reduced ? 'auto' : 'smooth' });
        await CO.wait(380);
      }
      if (panneau && panneau.masquer) panneau.masquer(true); // l'enseigne-soulier se relève pendant qu'on entre
      const astuce = $('#scene-astuce');
      if (astuce) astuce.classList.remove('on');
      if (facade && facade.entrer && !CO.reduced) {
        enseigneVisible(false);
        CO.sfx.play('open');
        await Promise.race([facade.entrer(), CO.wait(2600)]);
      }
      if (CO.Atelier) CO.Atelier.depuisVitrine();
      await CO.fondu(() => CO.go('atelier'));
      if (!CO.statut().ouvert) CO.toast('La boutique est fermée : on visite l’atelier.', 3000);
    } finally {
      entrant = false;
      setTimeout(() => {
        if (CO.view !== 'accueil' && facade && facade.sortir) facade.sortir({ ms: 0 });
        enseigneVisible(true);
        if (CO.view === 'accueil' && panneau && panneau.masquer) panneau.masquer(false);
      }, 120);
    }
  }
  /** retour de la boutique : la devanture part du zoom et recule jusqu'à la rue */
  async function revenirRue() {
    if (!CO.depuisBoutique) { if (panneau && panneau.masquer) panneau.masquer(false); return; } // revenu par les onglets
    CO.depuisBoutique = false;
    if (!facade || !facade.entrer || !facade.sortir || CO.reduced) { if (panneau && panneau.masquer) panneau.masquer(false); return; }
    enseigneVisible(false);
    try {
      await facade.entrer({ ms: 0 });
      await Promise.race([facade.sortir({ ms: 900 }), CO.wait(1500)]);
    } catch (e) { /* rien */ }
    enseigneVisible(true);
    placerEnseigne();
    if (panneau && panneau.masquer) panneau.masquer(false);
  }

  /* ---------- l'astuce de la scène, qui s'efface ---------- */
  function hint() {
    const a = $('#scene-astuce');
    if (!a || CO.store.get('astuce-vue', false)) return;
    setTimeout(() => a.classList.add('on'), 1200);
    setTimeout(() => a.classList.remove('on'), 7000);
    CO.store.set('astuce-vue', true);
  }

  /* ---------- sur ordinateur : le logo, le QR code de la page ---------- */
  function initBureau() {
    const lg = $('#accueil-logo');
    if (lg && CO.logo) lg.appendChild(CO.logo({ couleur: 'currentColor' }));
    if (!matchMedia('(min-width: 1000px)').matches) return;
    const b = $('#bureau-logo');
    if (b && CO.logo) b.appendChild(CO.logo({ couleur: 'currentColor' }));
    const q = $('#bureau-qr');
    if (q && CO.Ticket) q.innerHTML = CO.Ticket.qr(location.href.split('#')[0].split('?')[0], { couleur: '#2B2420', fond: '#FFFCF6' });
  }

  /* ---------- démarrage ---------- */
  async function init() {
    document.documentElement.classList.remove('no-js');
    initSound();
    initSheets();
    initTabs();
    initPanneau();
    initHours();
    initLacets();
    try { initBureau(); } catch (e) { console.warn('bureau', e); }
    ['Onglets', 'Commandes', 'Suivi', 'Services', 'Deposer', 'Clous', 'Pro', 'Nous', 'Film', 'Atelier'].forEach((m) => {
      try { CO[m] && CO[m].init && CO[m].init(); } catch (e) { console.warn('module', m, e); }
    });
    route(true);
    CO.on('view', (v) => { if (v === 'accueil') revenirRue(); });
    const fac = initFacade();
    // l'appli est chargée quand la page et ses ressources, ses polices et la devanture sont là : l'ouverture
    // (l'écran de chargement) tourne jusque-là
    const page = new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', r, { once: true })));
    const polices = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    // les images pré-rendues : les planches de l'enseigne, le décor de l'établi
    const images = [
      CO.Enseigne && CO.Enseigne.precharger ? CO.Enseigne.precharger(isNight()) : null,
      CO.Services && CO.Services.precharger ? CO.Services.precharger() : null,
    ].map((p) => (p ? p.catch(() => null) : null));
    const pret = Promise.all([fac, page, polices, ...images]).catch(() => {});
    const splash = CO.splash ? CO.splash({ pret }) : Promise.resolve({ skipped: true });
    // l'enseigne se pose dès que la devanture est là (cachée : elle entre en scène une fois l'appli dévoilée)
    const ens = fac.then((f) => (f ? initEnseigne() : null));
    const [f, sp] = await Promise.all([fac, splash]);
    // « l'appli est dévoilée » : les calculs lourds des autres onglets attendent ce signal (l'ouverture l'émet elle-même)
    if (!sp || !sp.revele) CO.emit('ouverture', sp || { skipped: true });
    if (f) {
      // après l'ouverture aux lacets, la devanture est déjà là, allumée : on ne rejoue pas sa construction
      if (f.play && !(sp && (sp.revele || (sp.skipped && new URLSearchParams(location.search).has('fige'))))) await f.play();
      if (f.idle) f.idle();
    }
    const j = await ens;
    if (j && j.entree) j.entree();
    hint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
