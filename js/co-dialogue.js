/* ==========================================================================
   Cordo 63 — Clément parle : les bulles de l'atelier
   On touche Clément (ou « Touchez Clément pour lui parler ») : il pose son outil, se tourne,
   et répond comme dans un jeu : son nom en étiquette, le texte qui s'écrit lettre à lettre
   avec sa petite voix, le ▼ quand la page est pleine, et nos réponses en bulles à toucher.
   Ses bulles ont avalé tout ce que disait l'ancien onglet : son histoire, le process, les
   horaires, les avis, Small Custom, les questions fréquentes (le texte complet reste dans
   la feuille « Tout lire », pour les lecteurs d'écran et les moteurs de recherche).
   Les phrases sont écrites à partir du dossier (La Montagne, Instagram, fiche Google) :
   à relire avec Clément.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const PAS = 24; // ms par lettre
  const PAGE_MAX = 150; // caractères par page de bulle

  /* sa voix : de petits « bla » feutrés, un peu plus graves en fin de phrase */
  if (CO.sfx && CO.sfx.ajouter) {
    CO.sfx.ajouter('voix', (c, dst, t, o, O) => {
      const f = O.rnd(410, 540) * (o.p || 1);
      O.tone(c, dst, t, { f, f2: f * O.rnd(0.84, 0.95), glide: 0.06, type: 'triangle', a: 0.005, d: 0.055, v: 0.03 });
      O.noise(c, dst, t, { f: 1700, q: 2.2, a: 0.002, d: 0.03, v: 0.005 });
    }, { gap: 40 });
  }

  let getScene = () => null; // la scène de la boutique (co-atelier.js)
  let ouvert = false, dejaVu = false, jeton = 0;
  let passer = null; // le « toucher pour continuer » en attente

  /* ---------- le texte ---------- */
  const minus = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  /** coupe un texte en pages de bulle, aux fins de phrases */
  function paginer(texte, max = PAGE_MAX) {
    const phrases = String(texte).match(/[^.!?…]+(?:[.!?…]+[»”"]?|$)\s*/g) || [texte];
    const pages = [];
    let cur = '';
    phrases.forEach((ph) => {
      if (cur && (cur + ph).trim().length > max) { pages.push(cur.trim()); cur = ''; }
      cur += ph;
    });
    if (cur.trim()) pages.push(cur.trim());
    return pages;
  }
  function joursOuvertsTexte() {
    const noms = [2, 3, 4, 5, 6, 0, 1].filter((d) => CO.HOURS.semaine[d]).map((d) => CO.JOURS[d].toLowerCase());
    const suite = noms.length > 2 && noms.join() === 'mardi,mercredi,jeudi,vendredi,samedi';
    return suite ? 'Du mardi au samedi' : noms.join(', ').replace(/^./, (c) => c.toUpperCase());
  }
  function plagesTexte() {
    const pl = CO.HOURS.semaine.find(Boolean);
    return pl ? pl.map((p) => CO.fmtH(p[0]) + ' à ' + CO.fmtH(p[1])).join(', puis de ') : '';
  }
  function maintenant() {
    const st = CO.statut();
    if (st.ouvert) return st.bientot ? `C’est ouvert, mais je ferme à ${CO.fmtH(st.jusqua)} : dépêchez-vous !` : `C’est ouvert, jusqu’à ${CO.fmtH(st.jusqua)}. Passez quand vous voulez.`;
    if (st.pause) return `Là, c’est la pause de midi. Je rouvre à ${CO.fmtH(st.prochain.heure)}.`;
    if (st.prochain) {
      const k = st.prochain.dansJours;
      const quand = k === 0 ? 'aujourd’hui' : k === 1 ? 'demain' : CO.JOURS[st.prochain.jour].toLowerCase();
      return `Là, c’est fermé. Je rouvre ${quand} à ${CO.fmtH(st.prochain.heure)}.`;
    }
    return 'Là, c’est fermé.';
  }

  /* ---------- les réponses possibles ---------- */
  const sujet = (label, id) => ({ label, id });
  const action = (label, fn, opts = {}) => ({ label, fn, ...opts });
  const lien = (label, href) => ({ label, href });
  const AUTRE = sujet('Autre chose', 'menu');
  const MENU = () => [
    sujet('Vous êtes qui ?', 'qui'),
    sujet('Comment ça marche ?', 'comment'),
    sujet('Vos horaires ?', 'quand'),
    sujet('Les avis ?', 'avis'),
    sujet('Small Custom ?', 'custom'),
    sujet('Une question…', 'faq'),
    sujet('Déposer une paire', 'deposer'),
    sujet('Salut !', 'salut'),
  ];
  const BONJOUR = [
    'Salut ! Moi c’est Clément. J’ai les mains dans la colle, mais les oreilles libres : je vous écoute.',
    'Bonjour ! Deux secondes, je pose ça… Voilà. Qu’est-ce que je peux faire pour vous ?',
    'Hé, bonjour ! Une question, une paire à sauver ?',
  ];
  const SUJETS = {
    menu: () => ({ pages: ['Autre chose ?'], choix: MENU() }),
    qui: () => ({
      pages: [
        'Clément Petit. Les sneakers, c’est ma passion : j’ai voulu les réparer et les customiser moi-même.',
        'À un peu plus de trente ans, j’ai quitté mon job et je suis parti en CAP cordonnier.',
        'Christophe Giraud, le cordonnier du Mazet depuis quinze ans, a été le seul à me prendre en apprentissage.',
        'En 2023, il a arrêté et il m’a proposé la boutique. J’ai pensé oui, alors j’ai dit oui.',
        'J’ai inversé l’atelier et la boutique : maintenant je travaille derrière la vitrine. Je suis ma vitrine !',
      ],
      choix: [sujet('Et Small Custom ?', 'custom'), sujet('Ça se passe comment ?', 'comment'), AUTRE],
    }),
    comment: () => ({
      pages: [
        'Vous me montrez la paire. Je regarde ce qui est possible et je vous dis combien. Le devis est gratuit.',
        'Je vous fais un ticket jaune : une moitié reste accrochée à la paire, l’autre part avec vous. Même numéro.',
        'Ensuite je démonte, je répare, je finis : tranchet, colle, marteau, couture, finisseuse, cire, brosse.',
        'Quand c’est prêt, je vous préviens. Vous passez avec votre ticket, et on vérifie ensemble.',
      ],
      choix: [action('Montrez-moi !', () => montrerProcess()), action('Déposer une paire', () => aller('deposer')), AUTRE],
    }),
    quand: () => ({
      pages: [
        maintenant(),
        `${joursOuvertsTexte()}, de ${plagesTexte()}. Pas besoin de rendez-vous.`,
        `${CO.SHOP.adresse}, ${CO.SHOP.repere}. Vous me verrez depuis la rue !`,
      ],
      choix: [lien('Itinéraire', CO.SHOP.itineraire), lien('Appeler', 'tel:' + CO.SHOP.telIntl), AUTRE],
    }),
    avis: () => ({
      pages: [
        `${String(CO.SHOP.avis.note).replace('.', ',')} sur 5 sur Google, avec ${CO.SHOP.avis.nombre} avis. Ça fait plaisir !`,
        ...CO.AVIS.map((a) => `${a.qui.split(' ')[0]} a écrit : « ${a.texte} »`),
      ],
      choix: [lien('Tous les avis sur Google', CO.SHOP.avis.url), AUTRE],
    }),
    custom: () => ({
      pages: [
        'Small Custom, c’est mon côté custom. Small, comme Petit !',
        'Peinture, cuir rapporté, pièces uniques : on en parle à l’atelier, et je vous fais un devis.',
      ],
      choix: [action('Voir des photos', () => lire('pile-titre')), lien('@small.custom', CO.SHOP.custom), AUTRE],
    }),
    faq: () => ({
      pages: ['Allez-y, je vous écoute.'],
      choix: CO.FAQ.map((f, i) => sujet(f.q, 'faq-' + i)).concat([sujet('Non, rien', 'menu')]),
    }),
    deposer: () => ({ pages: ['Parfait ! Remplissez le ticket jaune : je le reçois ici, à l’atelier.'], fin: () => aller('deposer') }),
    salut: () => ({ pages: ['À bientôt au Mazet !'], fin: () => fermer() }),
    etageres: () => ({
      pages: ['Là, ce sont les paires qui attendent leur propriétaire, chacune avec son ticket jaune.', 'La vôtre ? Suivez-la dans Mes tickets.'],
      choix: [action('Mes tickets', () => aller('tickets')), AUTRE],
    }),
  };
  function trouver(id) {
    const m = /^faq-(\d+)$/.exec(id || '');
    if (m) {
      const f = CO.FAQ[+m[1]];
      return f ? { pages: paginer(f.moi || f.r), choix: [sujet('Une autre question', 'faq'), AUTRE] } : SUJETS.menu();
    }
    return (SUJETS[id] || SUJETS.menu)();
  }

  /* ---------- la bulle ---------- */
  const el = {};
  function lu(texte) { if (el.lu) el.lu.textContent = texte; }
  function placerQueue() {
    const sc = getScene();
    if (!ouvert || !el.bulle) return;
    let x = 0.5;
    try {
      const t = sc && sc.clement && sc.clement.tete && sc.clement.tete();
      if (t) {
        const r = el.bulle.getBoundingClientRect();
        x = CO.clamp((t.x - r.left) / r.width, 0.1, 0.9);
      }
    } catch (e) { /* la scène n'est pas prête */ }
    el.bulle.style.setProperty('--queue-x', (x * 100).toFixed(1) + '%');
    el.bulle.classList.toggle('nom-droite', x < 0.42); // l'étiquette « Clément » laisse la place à la queue
  }
  let queueT = 0;

  /** écrit une page ; se résout quand elle est lue (toucher si attendre, sinon tout de suite) */
  function taper(texte, { attendre = true } = {}) {
    const mon = jeton;
    return new Promise((resolve) => {
      const sc = getScene();
      el.bulle.classList.remove('finie');
      el.texte.innerHTML = '';
      lu(texte);
      const spans = [...texte].map((ch) => { const sp = document.createElement('span'); sp.className = 'l'; sp.textContent = ch; el.texte.appendChild(sp); return sp; });
      let i = 0, t = 0, fini = false;
      const parle = (on) => { try { sc && sc.clement && sc.clement.parler && sc.clement.parler(on); } catch (e) { /* rien */ } };
      const tout = () => {
        clearTimeout(t);
        spans.forEach((sp) => sp.classList.add('vu'));
        fini = true;
        parle(false);
        if (!attendre) { passer = null; resolve(); return; }
        el.bulle.classList.add('finie');
        passer = () => { passer = null; resolve(); };
      };
      const pas = () => {
        if (mon !== jeton) { parle(false); return; }
        if (i >= spans.length) { tout(); return; }
        const ch = spans[i].textContent;
        spans[i].classList.add('vu');
        if (i % 3 === 0 && /[a-zà-ÿ0-9]/i.test(ch)) CO.sfx.play('voix', { p: /[.!?]/.test(texte.slice(i, i + 4)) ? 0.9 : 1 });
        i++;
        t = setTimeout(pas, /[.!?:…]/.test(ch) ? PAS * 9 : ch === ',' ? PAS * 4 : PAS);
      };
      passer = () => { if (!fini) tout(); };
      parle(true);
      if (CO.reduced) tout(); else pas();
    });
  }

  function viderChoix() { el.choix.innerHTML = ''; el.choix.classList.remove('on'); }
  function montrerChoix(liste) {
    viderChoix();
    liste.forEach((c, k) => {
      const b = document.createElement(c.href ? 'a' : 'button');
      b.className = 'dlg-rep';
      b.textContent = c.label;
      b.style.setProperty('--k', k);
      if (c.href) {
        b.href = c.href;
        if (/^https?:/.test(c.href)) { b.target = '_blank'; b.rel = 'noopener'; }
      } else b.type = 'button';
      b.dataset.sfx = 'pop';
      b.addEventListener('click', (e) => choisir(c, b, e));
      el.choix.appendChild(b);
    });
    requestAnimationFrame(() => el.choix.classList.add('on'));
  }

  /** notre réponse s'envole dans la bulle, puis Clément enchaîne */
  async function choisir(c, b) {
    if (c.href) { setTimeout(() => montrerChoix(trouver('menu').choix), 400); return; }
    const r = b.getBoundingClientRect(), rb = el.bulle.getBoundingClientRect();
    if (!CO.reduced && b.animate) {
      const vol = b.cloneNode(true);
      vol.classList.add('vol');
      vol.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;margin:0;z-index:60;pointer-events:none`;
      document.body.appendChild(vol);
      vol.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${rb.left + 24 - r.left}px, ${rb.top + 10 - r.top}px) scale(.6)`, opacity: 0 },
      ], { duration: 320, easing: 'cubic-bezier(.4,0,.7,.4)' }).finished.then(() => vol.remove(), () => vol.remove());
    }
    viderChoix();
    await CO.wait(CO.reduced ? 0 : 200);
    if (c.fn) { c.fn(); return; }
    jouer(trouver(c.id));
  }

  async function jouer(s) {
    const mon = ++jeton;
    viderChoix();
    for (let i = 0; i < s.pages.length; i++) {
      const dernier = i === s.pages.length - 1;
      await taper(s.pages[i], { attendre: !dernier || !s.choix });
      if (mon !== jeton) return;
    }
    if (s.choix) montrerChoix(s.choix);
    else if (s.fin) s.fin();
  }

  /* ---------- ouvrir, fermer ---------- */
  async function ouvrir(id) {
    const sc = getScene();
    const premier = !ouvert;
    ouvert = true;
    el.dlg.hidden = false;
    document.documentElement.classList.add('dlg-ouvert');
    requestAnimationFrame(() => el.dlg.classList.add('on'));
    placerQueue();
    clearInterval(queueT);
    queueT = setInterval(placerQueue, 250);
    if (premier && sc && sc.clement && sc.clement.regarder) {
      el.texte.innerHTML = '';
      lu('');
      try { await Promise.race([sc.clement.regarder(), CO.wait(1600)]); } catch (e) { /* rien */ }
    }
    if (id) { jouer(trouver(id)); return; }
    const salut = dejaVu ? 'Re ! Autre chose ?' : BONJOUR[Math.floor(Math.random() * BONJOUR.length)];
    dejaVu = true;
    jouer({ pages: [salut], choix: MENU() });
  }
  function fermer() {
    if (!ouvert) return;
    ouvert = false;
    jeton++;
    passer = null;
    clearInterval(queueT);
    el.dlg.classList.remove('on');
    document.documentElement.classList.remove('dlg-ouvert');
    viderChoix();
    setTimeout(() => { if (!ouvert) el.dlg.hidden = true; }, 260);
    const sc = getScene();
    try { if (sc && sc.clement) { if (sc.clement.parler) sc.clement.parler(false); if (sc.clement.reprendre) sc.clement.reprendre(); } } catch (e) { /* rien */ }
  }

  /* ---------- ce que ses réponses déclenchent ---------- */
  function aller(vue) { fermer(); CO.go(vue); }
  function lire(ancre) {
    if (!CO.openSheet) return;
    CO.openSheet('#feuille-infos');
    if (ancre) setTimeout(() => { const a = document.getElementById(ancre); if (a) a.scrollIntoView({ behavior: CO.reduced ? 'auto' : 'smooth', block: 'start' }); }, 420);
  }
  function montrerProcess() {
    fermer();
    if (CO.Film && CO.Film.ouvrir) CO.Film.ouvrir();
  }

  CO.Dialogue = {
    ouvrir, fermer, lire, paginer,
    get ouvert() { return ouvert; },
    /** avance d'une page (toucher Clément ou la bulle pendant qu'il parle) */
    suite() { if (passer) passer(); },
    init(scene) {
      if (typeof scene === 'function') getScene = scene;
      el.dlg = $('#dialogue');
      el.bulle = $('#dlg-bulle');
      el.texte = $('#dlg-texte');
      el.choix = $('#dlg-choix');
      if (!el.dlg || !el.bulle || !el.texte || !el.choix) return;
      // le texte tapé lettre à lettre n'est pas lu ; une copie entière l'est, d'un coup
      el.texte.setAttribute('aria-hidden', 'true');
      el.texte.removeAttribute('aria-live');
      el.lu = document.createElement('p');
      el.lu.className = 'visuellement-cache';
      el.lu.setAttribute('aria-live', 'polite');
      el.bulle.appendChild(el.lu);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'dlg-fermer';
      x.setAttribute('aria-label', 'Laisser Clément travailler');
      x.dataset.sfx = 'close';
      x.innerHTML = '<svg aria-hidden="true"><use href="#i-croix"/></svg>';
      x.addEventListener('click', (e) => { e.stopPropagation(); fermer(); });
      el.bulle.appendChild(x);
      el.bulle.addEventListener('click', () => { if (passer) passer(); });
      document.addEventListener('keydown', (e) => {
        if (!ouvert) return;
        if (e.key === 'Escape') fermer();
        else if ((e.key === 'Enter' || e.key === ' ') && passer && !e.target.closest('button, a, input, textarea')) { e.preventDefault(); passer(); }
      });
      CO.on('view', (v) => { if (v !== 'atelier') fermer(); });
    },
  };
})();
