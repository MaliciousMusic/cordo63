/* ==========================================================================
   Cordo 63 — l'atelier : on passe la vitrine, on est dans la boutique avec Clément
   La scène (js/co-boutique.js) : Clément à ses machines, dans une grande boucle au hasard.
   On le touche : il se tourne et parle (js/co-dialogue.js). Ce qu'on peut toucher autour :
   la radio (le son de l'appli), le carnet de commandes sur le comptoir (l'espace atelier,
   avec le code), les photos au mur (Tout lire, les photos), les étagères de paires (Mes
   tickets), la porte (retour dans la rue). « Montrez-moi ! » : la caméra plonge sur son
   établi et le film des mains prend le relais (js/co-film.js).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  let scene = null, pret = null, dehors = true;

  function nuit() {
    const q = new URLSearchParams(location.search);
    if (q.has('soir')) return true;
    if (q.has('jour')) return false;
    return CO.estNuit ? CO.estNuit() : false;
  }

  /** la scène, créée une fois (au premier passage, ou en douce après le chargement) */
  function preparer() {
    if (pret) return pret;
    const host = $('#boutique-host');
    if (!host || !CO.Boutique || !CO.Boutique.create) {
      if (host) host.classList.add('boutique-repli');
      return (pret = Promise.resolve(null));
    }
    // la vue doit avoir sa taille (display: block, encore invisible) pour que la scène se mesure
    const v = document.getElementById('atelier');
    if (v) v.classList.add('vue');
    pret = Promise.resolve()
      .then(() => CO.Boutique.create(host, { nuit: nuit(), graine: 63 }))
      .then((s) => {
        scene = s;
        CO.boutique = s;
        brancher(s);
        if (CO.view !== 'atelier' && s && s.pause) s.pause();
        return s;
      })
      .catch((e) => { console.warn('boutique', e); host.classList.add('boutique-repli'); return null; });
    return pret;
  }

  function brancher(s) {
    if (!s || !s.on) return;
    s.on('clement', () => {
      vuAstuce();
      if (CO.Dialogue.ouvert) CO.Dialogue.suite();
      else CO.Dialogue.ouvrir();
    });
    s.on('cible', (id) => {
      vuAstuce();
      if (id === 'radio') radio();
      else if (id === 'carnet') { if (CO.Pro) CO.Pro.ouvrir(); }
      else if (id === 'photos') CO.Dialogue.lire('pile-titre');
      else if (id === 'etageres') CO.Dialogue.ouvrir('etageres');
      else if (id === 'porte') sortir();
    });
  }

  /** la radio de l'atelier : le son de l'appli */
  function radio() {
    CO.sfx.on = !CO.sfx.on;
    if (CO.syncSound) CO.syncSound();
    if (CO.sfx.on) CO.sfx.play('on');
    CO.emit('sound', CO.sfx.on);
    CO.toast(CO.sfx.on ? 'La radio est allumée : on entend l’atelier.' : 'Radio coupée : l’atelier se tait.');
  }

  /* « Touchez Clément pour lui parler » : une fois, puis ça s'efface (reste là au clavier) */
  function astuce() {
    const a = $('#boutique-parler');
    if (!a || CO.store.get('atelier-astuce', false)) return;
    a.classList.add('on');
  }
  function vuAstuce() {
    const a = $('#boutique-parler');
    if (a) a.classList.remove('on');
    CO.store.set('atelier-astuce', true);
  }

  /** on arrive dans la boutique : depuis la rue, la caméra finit sa poussée ici */
  async function arriver() {
    const venuDeLaRue = dehors === 'vitrine';
    dehors = false;
    const s = await preparer();
    if (!s || CO.view !== 'atelier') return;
    if (s.reprise) s.reprise(); else if (s.jouer) s.jouer();
    if (s.entree && !CO.reduced) s.entree({ ms: venuDeLaRue ? 1100 : 650 });
    setTimeout(astuce, venuDeLaRue ? 1400 : 700);
  }

  /** retour dans la rue : la caméra recule vers la vitrine, puis la devanture se recule aussi */
  let sortant = false;
  async function sortir() {
    if (sortant) return;
    sortant = true;
    CO.Dialogue.fermer();
    if (CO.Film && CO.Film.fermer) CO.Film.fermer(true);
    if (scene && scene.sortie && !CO.reduced) {
      try { await Promise.race([scene.sortie({ ms: 650 }), CO.wait(1000)]); } catch (e) { /* rien */ }
    }
    CO.depuisBoutique = true;
    if (CO.fondu) await CO.fondu(() => CO.go('accueil')); else CO.go('accueil');
    sortant = false;
  }

  CO.Atelier = {
    preparer, sortir,
    get scene() { return scene; },
    /** la devanture a poussé la caméra dans la vitrine : l'arrivée sera enchaînée */
    depuisVitrine() { dehors = 'vitrine'; },
    init() {
      CO.Dialogue.init(() => scene);
      const b = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
      b('#boutique-sortir', sortir);
      b('#boutique-lire', () => CO.Dialogue.lire());
      b('#boutique-parler', () => { vuAstuce(); CO.Dialogue.ouvrir(); });
      CO.on('view', (v) => {
        if (v === 'atelier') arriver();
        else {
          if (!dehors) dehors = true;
          if (scene && scene.pause) scene.pause();
        }
      });
      // la scène se prépare en douce une fois l'appli installée (le premier passage est alors immédiat) : dès qu'elle est
      // prête sous l'ouverture aux lacets (« coulisses » : l'écran est couvert, rien ne bouge), sinon à son dévoilement.
      // En tranches courtes, en veille pendant qu'on touche l'écran et pendant l'animation des lacets (co-boutique.js).
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
      if (CO.view === 'atelier') arriver();
      else {
        let lancee = false;
        const enDouce = () => { if (lancee) return; lancee = true; idle(() => preparer(), { timeout: 5000 }); };
        CO.on('coulisses', enDouce);
        CO.on('ouverture', enDouce);
      }
    },
  };
})();
