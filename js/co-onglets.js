/* ==========================================================================
   Cordo 63 — la barre des onglets brodée (CO.Onglets)
   La barre est une sangle de cuir surpiquée ; ses icônes y sont brodées au fil, en points de bourdon,
   comme le nom sur la carte à clous (CO.Compte.broder, avec une forme au lieu d'un nom) : fil crème
   au repos, fil d'or sur l'onglet ouvert, fil sombre sur le ticket jaune de « Déposer ».
   À l'ouverture, elles se brodent sous nos yeux, de gauche à droite, l'aiguille qui court et la machine
   qui pique : c'est la fin de l'animation d'accueil. Sans ouverture (une autre visite, ?nointro) : elles
   sont là tout de suite. Sans JS (ou si la broderie échoue) : les icônes au trait du sprite.
     CO.Onglets.init()   (co-app.js)
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});

  /* les icônes, redessinées pour l'aiguille (32 × 32) : des aplats assez larges pour le bourdon, des jours
     découpés dedans (la vitrine, la porte, l'œillet, la coche…) ; angle : la pente des points */
  const ICONES = {
    accueil: { // la devanture : le store festonné, la vitrine et la porte, le trottoir
      d: 'M4 6.2h24v4.4c-1.6 1.7-3.2 1.7-4.8 0-1.6 1.7-3.2 1.7-4.8 0-1.6 1.7-3.2 1.7-4.8 0-1.6 1.7-3.2 1.7-4.8 0-1.6 1.7-3.2 1.7-4.8 0zM6 13.2h20v13.4H6zM3.2 26.6h25.6v2.4H3.2z',
      jours: 'M8.6 15.8h7.6v7.2H8.6zM19 15.8h4.6v10.8H19z', angle: 62,
    },
    services: { // le marteau de cordonnier, penché
      d: 'M9 6.5h12.8a3.2 3.2 0 0 1 0 6.4H9zM9 7.4 4.6 8.6v2.9L9 12.4zM14.2 12.9h3.6v14.3a1.8 1.8 0 0 1-3.6 0z', rot: -38, angle: 38,
    },
    deposer: { // le ticket : son œillet et sa ficelle, la ligne où il se déchire
      d: 'M9.5 9.2 13 4.6h6l3.5 4.6v18.8h-13z', traits: 'M16 6.6c.4-2.4 2.8-3.6 5.4-3', epais: 1.5,
      jours: 'M14.1 8.4a1.9 1.9 0 1 0 3.8 0a1.9 1.9 0 1 0-3.8 0', joursTraits: 'M11.2 19.8h9.6', joursEpais: 1.2, angle: 62,
    },
    tickets: { // la souche cochée, une autre derrière
      d: 'M11.5 10 14.8 6h5.4l3.3 4v17.5h-12z', traits: 'M8.3 12.6 9.8 10.3M8.3 12.6v14.4l2.8.5', epais: 1.7,
      jours: 'M16 9.6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', joursTraits: 'M14.2 18.9l2.2 2.2 4.4-4.7', joursEpais: 1.9, angle: 62,
    },
    atelier: { // la sneaker : la tige, la bande, la semelle, les œillets
      d: 'M3.8 20.4V13.2c2.4.3 4.3-.6 5.6-2.3L11.8 8c1.2 2.2 3.3 3.2 5.5 3l1.4-1.4c.7 2 1.7 3.7 3.4 4.9 2.4 1.7 5.6 2.4 6.4 5.3v.6zM3.4 21.7h25.3v1.9a1.1 1.1 0 0 1-1.1 1.1H4.5a1.1 1.1 0 0 1-1.1-1.1z',
      joursTraits: 'M7.4 17.3c3.6-.4 7.6 1 10.8 1M13.9 12.3l1.1 1.8M16.5 12.1l1 1.9M19.1 12.5l.8 2', joursEpais: 1.2, angle: 58,
    },
  };
  const DUREE = 520, ECART = 110; // ms : une icône, puis la suivante

  let barre = null, onglets = [], pret = false;

  function hote(cl) { const s = document.createElement('span'); s.className = 'tb ' + cl; return s; }
  function preparer() {
    barre = document.getElementById('tabbar');
    if (!barre || !CO.Compte || !CO.Compte.broder) return false;
    onglets = [...barre.querySelectorAll('.tab')].map((t) => {
      const id = t.dataset.tab, forme = ICONES[id];
      if (!forme) return null;
      const ticket = t.querySelector('.tab-ticket');
      const b = document.createElement('span');
      b.className = 'tab-brode' + (ticket ? ' tab-brode-ticket' : '');
      b.setAttribute('aria-hidden', 'true');
      const fils = ticket ? { encre: hote('tb-encre') } : { creme: hote('tb-creme'), or: hote('tb-or') };
      Object.values(fils).forEach((h) => b.appendChild(h));
      if (ticket) ticket.appendChild(b);
      else { const svg = t.querySelector(':scope > svg'); t.insertBefore(b, svg || t.firstChild); }
      return { t, id, forme, fils };
    }).filter(Boolean);
    barre.classList.add('brode');
    return true;
  }

  const options = (o, fil, anime) => ({ forme: o.forme, angle: o.forme.angle, fil, anime, duree: DUREE * (CO.ralenti || 1), muet: false });
  /** toutes les icônes, d'un coup (sans animation) */
  function toutes() {
    onglets.forEach((o) => Object.entries(o.fils).forEach(([fil, h]) => CO.Compte.broder(h, '', options(o, fil, false))));
  }
  /** l'animation d'accueil : de gauche à droite, chaque icône dans le fil qu'on voit ; l'autre fil, d'un coup */
  async function animer() {
    for (const o of onglets) {
      const actif = o.t.classList.contains('is-active');
      const vu = o.fils.encre ? 'encre' : actif ? 'or' : 'creme';
      Object.entries(o.fils).forEach(([fil, h]) => { if (fil !== vu) CO.Compte.broder(h, '', options(o, fil, false)); });
      await CO.Compte.broder(o.fils[vu], '', options(o, vu, true));
      await CO.wait(ECART * (CO.ralenti || 1));
    }
  }

  CO.Onglets = {
    init() {
      try {
        if (!preparer()) { if (barre) barre.classList.add('brode-ko'); return; }
        pret = true;
        // l'ouverture joue : les icônes attendent qu'elle ait dévoilé l'appli, puis se brodent
        const ouverture = document.documentElement.classList.contains('ouverture');
        let fait = false;
        if (!ouverture || CO.reduced) { toutes(); fait = true; }
        CO.on('ouverture', (r) => {
          if (!pret || fait) return;
          fait = true;
          if (!CO.reduced && r && r.revele && !r.passe) setTimeout(() => animer().catch(toutes), 260);
          else toutes();
        });
        // l'écran tourne : les broderies se refont à leur nouvelle taille
        let rz = 0;
        window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => onglets.forEach((o) => Object.values(o.fils).forEach((h) => CO.Compte.retailler(h))), 200); });
      } catch (e) {
        console.warn('onglets brodés', e);
        if (barre) barre.classList.add('brode-ko');
      }
    },
  };
})();
