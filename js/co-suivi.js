/* ==========================================================================
   Cordo 63 — Mes tickets : les souches jaunes, où en est chaque paire
   La liste (onglet Mes tickets), le ticket en cours sur l'accueil, la pastille de l'onglet,
   la feuille d'un ticket (avancement daté, QR code à montrer à Clément, actions).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => CO.esc(s);
  let ouvert = null; // le numéro affiché dans la feuille

  function liste() {
    const box = $('#mes-tickets');
    if (!box) return;
    const mes = CO.Commandes.miennes();
    if (!mes.length) {
      box.innerHTML = `<div class="vide-tickets">
          <div class="clou-seul" aria-hidden="true"></div>
          <h3>Pas encore de ticket</h3>
          <p>Préparez votre dépôt : Clément reçoit votre ticket, vous suivez votre paire ici jusqu’à ce qu’elle soit prête.</p>
          <a class="btn btn-ticket" href="#deposer" data-sfx="stamp"><svg aria-hidden="true"><use href="#i-ticket"/></svg> Déposer une paire</a>
          <form class="suivre-num" id="suivre-num" novalidate>
            <input id="sn-num" inputmode="numeric" maxlength="6" placeholder="N° d’un ticket papier" aria-label="Numéro d’un ticket papier" autocomplete="off">
            <button class="btn btn-ligne" type="submit">Suivre</button>
          </form>
        </div>`;
      $('#suivre-num').addEventListener('submit', async (e) => {
        e.preventDefault();
        const n = $('#sn-num').value.replace(/\D/g, '');
        if (!n) return;
        const c = await CO.Commandes.suivre(n, (CO.store.get('moi', {}) || {}).tel || '');
        if (c) { CO.sfx.play('yes'); ouvrir(c.num); }
        else { CO.sfx.play('nope'); CO.toast('Ticket introuvable : Clément vous le confirmera au téléphone.'); }
      });
    } else {
      box.innerHTML = mes.map((c) => CO.Ticket.souche(c)).join('');
      $$('.souche', box).forEach((el) => {
        const go = () => ouvrir(el.dataset.num);
        el.addEventListener('click', go);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      });
    }
  }

  /** l'accueil : le ticket en cours (le plus avancé), sinon l'appel à déposer */
  function accueil() {
    const box = $('#accueil-ticket');
    if (!box) return;
    const act = CO.Commandes.actives().sort((a, b) => CO.Commandes.rang(b) - CO.Commandes.rang(a));
    if (act.length) {
      box.innerHTML = CO.Ticket.souche(act[0]) + (act.length > 1 ? `<p class="t-note"><a href="#tickets">Mes ${act.length} tickets <svg aria-hidden="true"><use href="#i-fleche"/></svg></a></p>` : '');
      const s = $('.souche', box);
      s.addEventListener('click', () => ouvrir(act[0].num));
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter') ouvrir(act[0].num); });
    } else box.innerHTML = ''; // pas de ticket en cours : le lacet jaune « Déposer une paire » suffit
  }

  function badge() {
    const b = $('#tab-badge');
    if (!b) return;
    const act = CO.Commandes.actives();
    const pretes = act.filter((c) => c.statut === 'prete').length;
    const n = pretes || act.length;
    b.hidden = !n;
    b.textContent = n;
    b.style.background = pretes ? '#5E9E4A' : '';
    b.setAttribute('aria-label', pretes ? pretes + ' paire(s) prête(s)' : n + ' ticket(s) en cours');
  }

  function ouvrir(num) {
    const c = CO.Commandes.get(num);
    if (!c) return;
    ouvert = c.num;
    $('#ft-titre').textContent = 'Ticket N° ' + c.num;
    $('#ft-corps').innerHTML = CO.Ticket.detail(c);
    const an = $('[data-annuler]', $('#ft-corps'));
    if (an) an.addEventListener('click', () => {
      if (!confirm('Annuler la demande N° ' + c.num + ' ?')) return;
      CO.Commandes.annuler(c.num);
      CO.closeSheet('#feuille-ticket');
      CO.toast('Demande annulée.');
    });
    const rg = $('[data-ranger]', $('#ft-corps'));
    if (rg) rg.addEventListener('click', () => { CO.Commandes.ranger(c.num); CO.closeSheet('#feuille-ticket'); });
    CO.openSheet('#feuille-ticket', () => { ouvert = null; });
  }

  function tout() {
    liste();
    accueil();
    badge();
    if (ouvert) {
      const c = CO.Commandes.get(ouvert);
      if (c) $('#ft-corps').innerHTML = CO.Ticket.detail(c);
    }
  }

  // une paire vient de passer « prête » (dans l'espace atelier, ou dans un autre onglet) : on le dit
  let pretesVues = new Set(CO.Commandes.miennes().filter((c) => c.statut === 'prete').map((c) => c.num));
  function nouvellesPretes() {
    const maintenant = CO.Commandes.miennes().filter((c) => c.statut === 'prete');
    maintenant.forEach((c) => {
      if (!pretesVues.has(c.num)) {
        CO.sfx.play('chime');
        CO.toast(`Votre paire N° ${c.num} est prête !`, 4200);
        CO.vibrate([30, 60, 30]);
      }
    });
    pretesVues = new Set(maintenant.map((c) => c.num));
  }

  CO.Suivi = {
    ouvrir,
    init() {
      tout();
      CO.on('commandes', () => { tout(); nouvellesPretes(); });
      setInterval(() => { accueil(); }, 60000); // « ouvert maintenant » / « ouvre demain »
    },
  };
})();
