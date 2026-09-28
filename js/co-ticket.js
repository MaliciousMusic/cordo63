/* ==========================================================================
   Cordo 63 — le ticket de réparation jaune
   L'étiquette du cordonnier : carton jaune, œillet cerclé de métal, pastille rouge, un numéro
   imprimé en rouge, et des pointillés : la partie haute reste accrochée à la paire, la souche
   part avec le client. Ici la souche part dans « Mes tickets ».
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CO.esc = esc;

  /** un QR code en SVG (qrcode.js) */
  function qr(texte, { couleur = '#2A2310', fond = '#FFFFFF' } = {}) {
    if (typeof window.qrcode !== 'function') return '';
    const q = window.qrcode(0, 'M');
    q.addData(texte);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code du ticket ${esc(texte)}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="${fond}"/><path d="${d}" fill="${couleur}"/></svg>`;
  }

  /** la date d'une commande, courte : « mar. 29 sept. » */
  const MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dateCourte(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return CO.JOURS_COURTS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_C[d.getMonth()];
  }
  function heure(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0');
  }

  /** ce qu'on répare, en une ligne manuscrite */
  function resume(c) {
    const quoi = c.detail || c.objetNom || '';
    const travaux = (c.services || []).map((s) => s.nom).join(', ') || (c.diagnostic ? 'à regarder ensemble' : '');
    return { quoi, travaux };
  }

  CO.Ticket = {
    qr, dateCourte, heure, resume,

    /** l'en-tête du grand ticket (marque, numéro) ; num = null → numéro encore vide */
    tete(num) {
      return `<div class="ticket-oeillet" aria-hidden="true"></div>
        <div class="ticket-tete">
          <div class="ticket-marque">CORDO63<small>6 rue Verdier-Latour · Clermont</small></div>
          <div class="ticket-num${num ? '' : ' vide'}" id="ticket-num"><small>N°</small>${num ? esc(num) : '····'}</div>
        </div>`;
    },

    /** la souche (dans Mes tickets) */
    souche(c) {
      const st = CO.STATUTS[CO.Commandes.rang(c)];
      const { quoi, travaux } = resume(c);
      const r = CO.Commandes.rang(c);
      const barres = CO.STATUTS.map((s, i) => `<i class="${i < r ? 'fait' : i === r ? 'ici' : ''}"></i>`).join('');
      let pret = '';
      if (c.statut === 'prete') pret = `Passez la chercher : ${CO.statut().ouvert ? 'c’est ouvert maintenant' : CO.statut().texte.toLowerCase()}.`;
      else if (c.pret && c.statut !== 'rendue') pret = `Prévue pour ${CO.fmtDate(new Date(c.pret))}.`;
      else if (c.statut === 'envoyee' && c.depot && c.depot.date) pret = `Vous passez ${CO.fmtDate(new Date(c.depot.date + 'T12:00:00'))}${c.depot.creneau ? ', ' + c.depot.creneau : ''}.`;
      return `<article class="souche ${esc(c.statut)}" data-num="${esc(c.num)}" role="button" tabindex="0" aria-label="Ticket numéro ${esc(c.num)} : ${esc(st.nom)}">
        <div class="s-tete"><span class="s-num">N° ${esc(c.num)}</span><span class="s-date">${esc(dateCourte(c.cree))}</span></div>
        <p class="s-quoi"><span class="ecrit">${esc(quoi)}</span>${travaux ? ' — ' + esc(travaux) : ''}</p>
        <p class="s-etat" style="margin:0"><b>${esc(st.nom)}</b>${esc(st.texte)}</p>
        <div class="avance" aria-hidden="true">${barres}</div>
        ${pret ? `<p class="s-pret">${esc(pret)}</p>` : ''}
      </article>`;
    },

    /** le détail d'un ticket (feuille) : avancement daté, QR, actions */
    detail(c) {
      const r = CO.Commandes.rang(c);
      const dates = {};
      (c.historique || []).forEach((h) => { dates[h.statut] = h.date; });
      const etapes = CO.STATUTS.map((s, i) => `<li class="${i < r ? 'fait' : i === r ? 'ici' : ''}">
          <span class="fs-rond"><svg aria-hidden="true"><use href="#i-check"/></svg></span>
          <span class="fs-nom">${esc(s.nom)}${i === r ? `<small>${esc(s.texte)}</small>` : ''}</span>
          <span class="fs-date">${dates[s.id] ? esc(dateCourte(dates[s.id])) : ''}</span>
        </li>`).join('');
      const { quoi, travaux } = resume(c);
      const est = c.estimation ? CO.Commandes.texteEstimation(c.estimation) : '';
      return `<div class="ft">
        <p class="s-quoi"><span class="ecrit">${esc(quoi)}</span>${travaux ? '<br>' + esc(travaux) : ''}</p>
        ${est ? `<p class="recap-note">Estimation : <b>${esc(est)}</b> (le prix est confirmé à l’atelier)</p>` : ''}
        <ol class="ft-statuts">${etapes}</ol>
        <div class="ft-qr">${qr('CORDO63-' + c.num)}</div>
        <p class="recap-note" style="text-align:center">Montrez ce code (ou dites « ticket ${esc(c.num)} ») à Clément.</p>
        <div class="ft-actions">
          <a class="btn btn-sauge" href="${esc(CO.SHOP.itineraire)}" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-pin"/></svg> Itinéraire</a>
          <a class="btn btn-ligne" href="tel:${esc(CO.SHOP.telIntl)}"><svg aria-hidden="true"><use href="#i-tel"/></svg> Appeler</a>
          ${c.statut === 'envoyee' ? `<button class="btn btn-ligne" type="button" data-annuler="${esc(c.num)}"><svg aria-hidden="true"><use href="#i-poubelle"/></svg> Annuler la demande</button>` : ''}
          ${c.statut === 'rendue' ? `<button class="btn btn-ligne" type="button" data-ranger="${esc(c.num)}"><svg aria-hidden="true"><use href="#i-check"/></svg> Ranger ce ticket</button>` : ''}
        </div>
      </div>`;
    },

    /** le numéro qui se tamponne en rouge sur le ticket */
    async tamponner(el, num) {
      if (!el) return;
      el.classList.remove('vide');
      el.innerHTML = `<small>N°</small><span class="tampon-num" style="display:inline-block">${esc(num)}</span>`;
      CO.sfx.play('stamp');
      CO.vibrate(12);
      await CO.wait(520);
    },

    /** le ticket se détache le long des pointillés : le haut part à l'atelier, la souche reste */
    async detacher(ticket) {
      if (!ticket) return;
      const perfo = ticket.querySelector('.ticket-perfo');
      CO.sfx.play('tear', { dur: 0.55 });
      CO.vibrate([8, 30, 8]);
      if (CO.reduced || !perfo) { await CO.wait(200); return; }
      // on coupe l'élément en deux clones : au-dessus et au-dessous des pointillés
      const r = ticket.getBoundingClientRect();
      const cut = perfo.getBoundingClientRect().top + perfo.offsetHeight / 2 - r.top;
      const haut = ticket.cloneNode(true), bas = ticket.cloneNode(true);
      [haut, bas].forEach((el) => { el.removeAttribute('id'); el.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id')); });
      const box = document.createElement('div');
      box.style.cssText = `position:relative;height:${r.height}px`;
      ticket.replaceWith(box);
      // bord déchiré : une dentelure irrégulière
      let dents = '';
      for (let x = 0; x <= 100; x += 2.5) dents += `${x}% ${cut + (Math.random() * 5 - 2.5)}px,`;
      haut.style.cssText = `position:absolute;left:0;right:0;top:0;margin:0 auto;clip-path:polygon(0 0,100% 0,${dents.split(',').reverse().filter(Boolean).join(',')})`;
      bas.style.cssText = `position:absolute;left:0;right:0;top:0;margin:0 auto;clip-path:polygon(${dents}100% 100%,0 100%)`;
      box.appendChild(bas);
      box.appendChild(haut);
      await haut.animate([
        { transform: 'translate(0,0) rotate(0)' },
        { transform: 'translate(-4px,-10px) rotate(-3deg)', offset: 0.25 },
        { transform: 'translate(40px,-60vh) rotate(-24deg)', opacity: 0 },
      ], { duration: 1000, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' }).finished;
      await bas.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-cut}px)` }], { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards' }).finished;
      return box;
    },
  };
})();
