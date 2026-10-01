/* ==========================================================================
   Cordo 63 — L'établi : les services et leurs prix
   En haut, fixe : l'établi de Clément vu de dessus (co-etabli.js), le titre dans son coin,
   le devis sur un ticket jaune dans le coin opposé, la phrase en bandeau. En dessous, seule
   la grille défile : on touche une réparation, la case est percée à l'emporte-pièce, ses
   outils se posent sur le tapis et le devis se met à jour ; « Déposer ces réparations »
   prépare le ticket.
   Ce qui coûte (les dessins des plans, le décor recadré, les objets de l'établi) se fait aux
   temps morts, dès que l'appli est prête sous l'ouverture : rien de lourd au chargement, ni en
   ouvrant l'onglet.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // le décor de l'établi (le plateau, le tapis, ce qui traîne) : une image rendue une fois pour toutes (tools/render-images.mjs)
  const FOND = 'assets/img/etabli-fond.webp';
  let choisis = new Set();
  let etabli = null, etabliPromesse = null;
  let etiquetteT = 0;

  const rubriqueDe = (id) => CO.SERVICES.find((r) => r.items.some((it) => it.id === id));
  /* un temps mort (co-rendu.js : requestIdleCallback, ou son équivalent sur Safari) */
  const inactif = (fn, delai) => (CO.R && CO.R.inactif ? CO.R.inactif(fn, delai) : setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 8 }), 60));

  function total() {
    const servs = [...choisis].map((id) => CO.service(id)).filter(Boolean);
    return CO.Commandes.estimer(servs);
  }

  function majDevis(saute) {
    const e = total();
    const t = $('#eh-total');
    if (t) t.textContent = choisis.size ? CO.Commandes.texteEstimation(e) : '0 €';
    const b = $('#eh-devis');
    // (l'animation repart deux images plus tard, une fois la classe ôtée vue par le navigateur : pas de mise en page
    // forcée dans le toucher)
    if (b && saute && !CO.reduced) { b.classList.remove('saute'); requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('saute'))); }
    const barre = $('#devis-barre');
    if (barre) {
      barre.hidden = !choisis.size;
      const a = $('#devis-deposer');
      if (a) a.innerHTML = `<svg aria-hidden="true"><use href="#i-ticket"/></svg> Déposer ${choisis.size > 1 ? 'ces ' + choisis.size + ' réparations' : 'cette réparation'}`;
    }
    CO.store.set('devis', [...choisis]);
  }

  /* ---------- l'établi (le moteur de rendu arrive de co-etabli.js ; sans lui, un tapis dessiné en CSS) ---------- */
  function preparerEtabli() {
    if (etabliPromesse) return etabliPromesse;
    const host = $('#etabli-host');
    if (!host) return Promise.resolve(null);
    if (!CO.Etabli || !CO.Etabli.create) {
      host.style.background = 'linear-gradient(rgba(180,215,190,.22) 1px, transparent 1px) 0 0 / 100% 24px, linear-gradient(90deg, rgba(180,215,190,.22) 1px, transparent 1px) 0 0 / 24px 100%, radial-gradient(120% 90% at 40% 30%, #33634F, #244A3D)';
      return (etabliPromesse = Promise.resolve(null));
    }
    etabliPromesse = CO.Etabli.create(host, { disposition: 'services', graine: 63, fondFige: FOND }).then((e) => {
      etabli = e;
      CO.etabli = e;
      if (e && e.on) e.on('tap', (id) => toucheObjet(id));
      // les outils des réparations déjà choisies
      [...choisis].forEach((id) => poserOutils(id, false));
      return e;
    }).catch((err) => { console.warn('établi', err); return null; });
    return etabliPromesse;
  }
  /* l'onglet s'ouvre : l'établi se crée juste après sa première image (pas dans la bascule d'onglet, où le
     navigateur calcule déjà toute la vue qui apparaît) */
  function etabliApresImage() {
    if (etabliPromesse) return;
    requestAnimationFrame(() => setTimeout(() => { if (CO.view === 'services') preparerEtabli(); }, 0));
  }

  function poserOutils(id, anime = true) {
    const r = rubriqueDe(id);
    if (!r || !etabli || !etabli.poser) return;
    (r.outils || []).forEach((o, k) => {
      if (etabli.objets && etabli.objets.some && etabli.objets.some((x) => (x.id || x) === o)) return;
      setTimeout(() => { try { etabli.poser(o, { anime }); } catch (e) { /* objet inconnu */ } }, anime ? k * 260 : 0);
    });
  }
  function retirerOutils(id) {
    const r = rubriqueDe(id);
    if (!r || !etabli || !etabli.retirer) return;
    const encore = r.items.some((it) => choisis.has(it.id));
    if (encore) return;
    (r.outils || []).forEach((o) => { try { etabli.retirer(o); } catch (e) { /* rien */ } });
  }

  function etiquette(texte, rect) {
    const haut = $('#etabli-haut');
    if (!haut || !rect) return;
    let el = $('.eh-etiquette', haut);
    if (!el) { el = document.createElement('p'); el.className = 'eh-etiquette'; haut.appendChild(el); }
    const hb = haut.getBoundingClientRect();
    el.textContent = texte;
    el.style.left = Math.max(70, Math.min(hb.width - 70, rect.left + rect.width / 2 - hb.left)) + 'px';
    el.style.top = Math.max(40, rect.top - hb.top) + 'px';
    el.hidden = false;
    clearTimeout(etiquetteT);
    etiquetteT = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* on touche un objet sur l'établi : sa rubrique s'éclaire dans la grille */
  function toucheObjet(id) {
    const r = CO.SERVICES.find((x) => (x.outils || []).includes(id));
    if (!r) return;
    const sec = $('#r-' + r.id);
    if (sec) {
      CO.scrollTo(sec, 52);
      $$('.ligne', sec).forEach((l, i) => setTimeout(() => { l.classList.remove('eclaire'); void l.offsetWidth; l.classList.add('eclaire'); }, 200 + i * 90));
    }
    const o = CO.Outils && CO.Outils.liste && CO.Outils.liste.find ? CO.Outils.liste.find((x) => x.id === id) : null;
    if (etabli && etabli.montrer) {
      const rect = etabli.montrer(id);
      if (rect && o) etiquette(o.nom, rect);
    }
  }

  function basculer(li) {
    const id = li.dataset.id;
    const on = !choisis.has(id);
    if (on) choisis.add(id); else choisis.delete(id);
    li.classList.toggle('choisi', on);
    li.setAttribute('aria-pressed', String(on));
    CO.sfx.play(on ? 'punch' : 'tap');
    CO.vibrate(on ? 10 : 0);
    majDevis(true);
    if (on) {
      poserOutils(id);
      const r = rubriqueDe(id);
      if (etabli && etabli.montrer && r && r.outils && r.outils[0]) setTimeout(() => { const rect = etabli.montrer(r.outils[0]); if (rect) etiquette(CO.service(id).nom, rect); }, 420);
    } else retirerOutils(id);
  }

  /* ---------- les plans des vignettes : la place à l'init (un bouton bleu, vide), le dessin aux temps morts ----------
     (un plan, c'est une scène dessinée, ses animations compilées en CSS, deux <svg> à insérer : trente-trois d'un coup,
     c'était une demi-seconde au chargement d'un téléphone) */
  let plans = null, aDessiner = null, ioPlans = null, imagePlans = 0;
  const visibles = new Set();
  let coutPlan = 6; // ms : ce que coûte un dessin de vignette (le plus long des derniers), pour tenir les temps morts
  function dessinerPlan(b) {
    if (b.dataset.plan) return false;
    const t0 = performance.now();
    b.dataset.plan = '1';
    if (ioPlans) ioPlans.unobserve(b);
    b.innerHTML = CO.Plans.svg(b.parentElement.dataset.id, { taille: 'mini', decoratif: true });
    coutPlan = Math.max(coutPlan * 0.8, performance.now() - t0);
    return true;
  }
  function dessinerPlans() {
    if (!CO.Plans || aDessiner) return;
    const boutons = $$('#liste-services .plan-mini');
    aDessiner = boutons.filter((b) => !b.dataset.plan);
    const ids = boutons.map((b) => b.parentElement.dataset.id);
    let regles = !CO.Plans.preparer;
    const pas = (dl) => {
      // d'abord les animations de toutes les vignettes, posées d'un coup (une seule feuille de style) ; puis les dessins,
      // un par un, tant qu'il reste du temps pour le suivant (attendu trop longtemps : un seul, quand même)
      const t0 = performance.now(), force = !dl || dl.didTimeout;
      const reste = () => (force ? 7 - (performance.now() - t0) : Math.min(16, dl.timeRemaining()));
      if (!regles) regles = CO.Plans.preparer(ids, { temps: Math.max(2, reste() - 2) });
      let n = 0;
      while (regles && aDessiner.length && (n === 0 ? force || reste() > Math.min(coutPlan, 10) : reste() > coutPlan + 2)) { if (dessinerPlan(aDessiner.shift())) n++; }
      if (n && plans) plans.rafraichir();
      if (aDessiner.length || !regles) inactif(pas, 2500);
    };
    inactif(pas, 2500);
  }
  /* on arrive sur l'onglet avant qu'ils soient tous faits : ceux qu'on voit (ou presque) d'abord, un par image
     (un IntersectionObserver les signale : rien n'est mesuré) ; le reste, aux temps morts */
  function surveillerPlans() {
    if (!CO.Plans || !('IntersectionObserver' in window)) return;
    ioPlans = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && !e.target.dataset.plan) visibles.add(e.target);
      if (visibles.size) dessinerVisibles();
    }, { root: $('#services .view-scroll'), rootMargin: '240px 0px' });
    $$('#liste-services .plan-mini').forEach((b) => ioPlans.observe(b));
  }
  function dessinerVisibles() {
    if (imagePlans) return;
    imagePlans = requestAnimationFrame(() => {
      imagePlans = 0;
      let n = 0;
      for (const b of visibles) {
        visibles.delete(b);
        if (dessinerPlan(b)) n++;
        if (n >= 1) break;
      }
      if (n && plans) plans.rafraichir();
      if (visibles.size) dessinerVisibles();
    });
  }

  /* ---------- les rubriques (puces collantes) ---------- */
  function rubriques() {
    const nav = $('#rubriques');
    if (!nav) return;
    nav.innerHTML = CO.SERVICES.map((r, i) => `<button class="rub-chip${i === 0 ? ' on' : ''}" type="button" data-r="${r.id}" data-sfx="chip" data-sfx-i="${i}">${CO.esc(r.titre)}</button>`).join('');
    nav.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const sec = $('#r-' + b.dataset.r);
      if (sec) CO.scrollTo(sec, 52);
    });
    const sc = $('#services .view-scroll');
    const chips = $$('.rub-chip', nav);
    let cur = CO.SERVICES[0].id;
    // la puce en cours glisse au centre de la barre : on ne fait défiler QUE la barre (un scrollIntoView
    // ferait aussi défiler la liste vers la position d'origine de la barre collante, en plein geste)
    function choisir(id) {
      if (id === cur) return;
      cur = id;
      chips.forEach((b) => {
        const on = b.dataset.r === id;
        b.classList.toggle('on', on);
        if (on) nav.scrollTo({ left: b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: CO.reduced ? 'auto' : 'smooth' });
      });
    }
    // où commence chaque rubrique (mesuré une fois, puis au redimensionnement) : rien n'est mesuré pendant le défilement
    let tops = [];
    function mesurer() {
      if (!sc.clientHeight) return;
      const r0 = sc.getBoundingClientRect().top - sc.scrollTop;
      tops = CO.SERVICES.map((r) => { const el = $('#r-' + r.id); return el ? { id: r.id, y: el.getBoundingClientRect().top - r0 } : null; }).filter(Boolean);
    }
    let raf = 0;
    sc.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!tops.length) mesurer();
        const y = sc.scrollTop + 70;
        let id = CO.SERVICES[0].id;
        for (const t of tops) if (t.y <= y) id = t.id;
        choisir(id);
      });
    }, { passive: true });
    // (la liste change de taille quand un plan arrive ? non : sa place est réservée ; mais les polices, la largeur…)
    if (window.ResizeObserver) new ResizeObserver(() => { tops = []; }).observe($('#liste-services') || sc);
    CO.on('view', (v) => { if (v === 'services') tops = []; });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { tops = []; });
  }

  CO.Services = {
    /** l'image du décor, chargée pendant l'ouverture (l'onglet s'ouvrira tout de suite) : → Promise */
    precharger() {
      return new Promise((res) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = im.onerror = () => res(im);
        im.src = FOND;
      });
    },
    init() {
      choisis = new Set((CO.store.get('devis', []) || []).filter((id) => CO.service(id)));
      $$('#liste-services .ligne').forEach((li) => {
        li.setAttribute('role', 'button');
        li.setAttribute('tabindex', '0');
        li.setAttribute('aria-pressed', String(choisis.has(li.dataset.id)));
        li.classList.toggle('choisi', choisis.has(li.dataset.id));
        li.addEventListener('click', () => basculer(li));
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(li); } });
      });
      // chaque réparation a son plan animé (js/co-plans.js) : la vignette à gauche de la ligne ; touchée, le grand plan
      // (ici, la place seulement : le dessin vient aux temps morts, voir dessinerPlans)
      if (CO.Plans) {
        $$('#liste-services .ligne').forEach((li) => {
          const id = li.dataset.id, it = CO.service(id);
          li.classList.add('a-plan');
          li.insertAdjacentHTML('afterbegin', `<button class="plan-mini" type="button" aria-label="${CO.esc('Voir le plan : ' + (it ? it.nom : id))}"></button>`);
          const b = li.firstElementChild;
          b.addEventListener('click', (e) => {
            e.stopPropagation(); // la ligne ne se perce pas
            if (plans) plans.pause(true);
            CO.Plans.feuille(id, {
              action: { texte: choisis.has(id) ? 'Retirer du devis' : 'Ajouter au devis', fn: () => basculer(li) },
              onClose: () => { if (plans) plans.pause(false); },
            });
          });
          b.addEventListener('keydown', (e) => e.stopPropagation()); // Entrée, Espace : le bouton, pas la ligne
        });
        // (pendant qu'on fait défiler la liste, les vignettes ne s'animent pas)
        plans = CO.Plans.observer($('#liste-services'), { defilement: $('#services .view-scroll') });
        surveillerPlans();
      }
      rubriques();
      majDevis(false);
      const dep = $('#devis-deposer');
      if (dep) dep.addEventListener('click', (e) => {
        e.preventDefault();
        if (CO.Deposer) CO.Deposer.preparer([...choisis]);
        CO.go('deposer');
      });
      $('#eh-devis').addEventListener('click', () => {
        if (!choisis.size) { CO.toast('Touchez une réparation pour l’ajouter au devis.'); return; }
        const b = $('#devis-barre');
        if (b) b.scrollIntoView({ block: 'end', behavior: CO.reduced ? 'auto' : 'smooth' });
      });
      // l'établi se prépare quand on arrive sur l'onglet (juste après sa première image) ; les plans qu'on voit, eux,
      // arrivent par ioPlans ; ceux qui restent continuent aux temps morts
      CO.on('view', (v) => { if (v === 'services') { etabliApresImage(); dessinerPlans(); } });
      // aux temps morts, dès que l'appli est prête sous l'ouverture (« coulisses », ou « ouverture » si elle vient
      // d'abord) : les plans, le décor de l'établi recadré à la taille qu'il aura, ses objets (gardés en mémoire et
      // dans le téléphone) — le premier passage sur l'onglet est immédiat ; la scène elle-même attend d'être visible
      let prete = false;
      const coulisses = () => {
        if (prete) return;
        prete = true;
        dessinerPlans();
        inactif(() => {
          if (!CO.Etabli || !CO.Etabli.prechauffer) return;
          const main = document.getElementById('main');
          const w = main ? main.clientWidth : innerWidth, h = main ? main.clientHeight : innerHeight;
          try { CO.Etabli.prechauffer({ largeur: w, hauteur: CO.clamp(h * 0.46, 250, 520), disposition: 'services', graine: 63, fondFige: FOND }); } catch (e) { /* rien */ }
        }, 3000);
      };
      CO.on('coulisses', coulisses);
      CO.on('ouverture', coulisses);
      // le ticket en cours de remplissage coche/décoche aussi ici
      CO.on('devis', (ids) => {
        choisis = new Set(ids);
        $$('#liste-services .ligne').forEach((li) => { li.classList.toggle('choisi', choisis.has(li.dataset.id)); li.setAttribute('aria-pressed', String(choisis.has(li.dataset.id))); });
        majDevis(false);
      });
    },
    /** une ligne s'éclaire (lien #s-xxx depuis l'accueil) */
    eclairer(id) {
      const li = document.getElementById('s-' + id);
      if (!li) return;
      li.classList.remove('eclaire'); void li.offsetWidth; li.classList.add('eclaire');
    },
  };
})();
