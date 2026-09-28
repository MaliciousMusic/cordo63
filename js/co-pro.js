/* ==========================================================================
   Cordo 63 — l'espace atelier : là où Clément prend les commandes
   Derrière son code (le même que la carte à clous) : les tickets reçus de l'appli et ceux
   qu'il crée au comptoir, par état (à recevoir, en cours, prêtes, rendues). Il fait avancer
   chaque paire (déposée → à l'établi → finitions → prête → rendue), ajuste le prix, et
   prévient le client d'un SMS tout prêt quand c'est prêt.
   Ouverture : le lien « Espace atelier » en bas de L'atelier, ou ?atelier dans l'adresse.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => CO.esc(s);
  const GROUPES = [
    { id: 'recevoir', nom: 'À recevoir', statuts: ['envoyee'] },
    { id: 'cours', nom: 'En cours', statuts: ['recue', 'etabli', 'finitions'] },
    { id: 'pretes', nom: 'Prêtes', statuts: ['prete'] },
    { id: 'rendues', nom: 'Rendues', statuts: ['rendue'] },
  ];
  let filtre = 'cours';
  let vue = 'liste'; // 'liste' | num | 'nouveau'
  const deverrouille = () => { try { return sessionStorage.getItem('co:pro') === '1'; } catch (e) { return false; } };
  const deverrouiller = () => { try { sessionStorage.setItem('co:pro', '1'); } catch (e) { /* privé */ } };

  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  const telIntl = (t) => { const d = (t || '').replace(/[^\d+]/g, ''); return d.startsWith('0') ? '+33' + d.slice(1) : d; };
  const smsLien = (tel, msg) => `sms:${telIntl(tel)}${ios ? '&' : '?'}body=${encodeURIComponent(msg)}`;

  function corps() { return $('#pro-corps'); }

  /* ---------- la liste ---------- */
  function liste() {
    const toutes = CO.Commandes.toutes();
    const cpt = GROUPES.map((g) => ({ ...g, n: toutes.filter((c) => g.statuts.includes(c.statut)).length }));
    if (!toutes.some((c) => cpt.find((g) => g.id === filtre).statuts.includes(c.statut))) {
      const premier = cpt.find((g) => g.n);
      if (premier) filtre = premier.id;
    }
    const g = GROUPES.find((x) => x.id === filtre);
    const items = toutes.filter((c) => g.statuts.includes(c.statut));
    const exemples = toutes.some((c) => c.exemple);
    corps().innerHTML = `
      <div class="pro-compteurs" role="tablist">${cpt.map((x) => `<button type="button" role="tab" aria-selected="${x.id === filtre}" class="${x.id === filtre ? 'on' : ''}" data-f="${x.id}" data-sfx="chip"><b>${x.n}</b>${esc(x.nom)}</button>`).join('')}</div>
      <div class="pro-barre">
        <button class="btn btn-ticket" type="button" id="pro-nouveau" data-sfx="stamp"><svg aria-hidden="true"><use href="#i-plus"/></svg> Ticket au comptoir</button>
      </div>
      <div class="pro-liste">${items.length ? items.map(carte).join('') : `<p class="pro-vide">Rien ici pour l’instant.</p>`}</div>
      <p class="demo-note">${exemples ? '<button class="lien-discret" type="button" id="pro-ex-off">Retirer les exemples</button>' : '<button class="lien-discret" type="button" id="pro-ex">Montrer avec des exemples</button>'} · <button class="lien-discret" type="button" id="pro-quitter">Verrouiller</button></p>`;
    $$('[data-f]', corps()).forEach((b) => b.addEventListener('click', () => { filtre = b.dataset.f; liste(); }));
    $$('[data-num]', corps()).forEach((b) => b.addEventListener('click', () => { vue = b.dataset.num; detail(b.dataset.num); }));
    $('#pro-nouveau').addEventListener('click', () => { vue = 'nouveau'; nouveau(); });
    const ex = $('#pro-ex'), exo = $('#pro-ex-off');
    if (ex) ex.addEventListener('click', () => { CO.Commandes.exemples(); CO.sfx.play('page'); });
    if (exo) exo.addEventListener('click', () => { CO.Commandes.effacerExemples(); });
    $('#pro-quitter').addEventListener('click', () => { try { sessionStorage.removeItem('co:pro'); } catch (e) { /* privé */ } CO.closeSheet('#feuille-pro'); });
  }
  function carte(c) {
    const st = CO.STATUTS[CO.Commandes.rang(c)];
    const { quoi, travaux } = CO.Ticket.resume(c);
    return `<button type="button" class="pro-cmd" data-num="${esc(c.num)}" data-sfx="tap">
      <span class="pc-num">${esc(c.num)}</span>
      <span class="pc-qui">${esc(c.client.prenom || 'Sans nom')}${c.origine === 'comptoir' ? ' · comptoir' : ''}</span>
      <span class="pc-etat ${esc(c.statut)}">${esc(st.court)}</span>
      <span class="pc-quoi">${esc(quoi)}${travaux ? ' — ' + esc(travaux) : ''}${c.depot && c.statut === 'envoyee' ? ' · passe ' + esc(CO.fmtDate(new Date(c.depot.date + 'T12:00:00'))) + (c.depot.creneau ? ' ' + esc(c.depot.creneau) : '') : ''}</span>
    </button>`;
  }

  /* ---------- une commande ---------- */
  function detail(num) {
    const c = CO.Commandes.get(num);
    if (!c) { vue = 'liste'; liste(); return; }
    const r = CO.Commandes.rang(c);
    const { quoi } = CO.Ticket.resume(c);
    const est = c.estimation ? CO.Commandes.texteEstimation(c.estimation) : '';
    const services = (c.services || []).map((s) => `<div class="recap-l"><span>${esc(s.nom)}</span><span>${esc(s.prix == null ? 'sur devis' : (s.des ? 'dès ' : '') + CO.prix(s.prix))}</span></div>`).join('') + (c.diagnostic ? '<div class="recap-l"><span>Diagnostic demandé</span><span>—</span></div>' : '');
    const msgPret = `Bonjour ${c.client.prenom || ''} ! Votre paire (ticket N° ${c.num}) est prête chez Cordo 63, 6 rue Verdier-Latour. Du mardi au samedi, 10h-13h30 / 14h30-19h. À bientôt, Clément`;
    corps().innerHTML = `<div class="pro-detail">
        <button class="lien-discret" type="button" id="pd-retour" data-sfx="page"><svg aria-hidden="true"><use href="#i-retour"/></svg> Tous les tickets</button>
        <h3 style="margin-top:10px">N° ${esc(c.num)} · ${esc(c.client.prenom || 'Sans nom')}</h3>
        <p class="pd-meta">${esc(c.origine === 'comptoir' ? 'Créé au comptoir' : 'Reçu par l’appli')} le ${esc(CO.Ticket.dateCourte(c.cree))} à ${esc(CO.Ticket.heure(c.cree))}${c.exemple ? ' · exemple' : ''}</p>
        <div class="pro-statuts" role="group" aria-label="État">${CO.STATUTS.map((s, i) => `<button type="button" data-st="${s.id}" class="${i === r ? 'on' : ''}" data-sfx="${s.id === 'prete' ? 'chime' : 'hammer'}">${esc(s.court)}</button>`).join('')}</div>
        <div class="pd-bloc"><b>${esc(quoi)}</b>${services}${est ? `<div class="recap-l"><span>Estimation donnée</span><span>${esc(est)}</span></div>` : ''}
          <label class="champ pro-form" style="margin:10px 0 0"><span>Prix final (€)</span><input id="pd-prix" inputmode="decimal" value="${c.prixFinal != null ? esc(String(c.prixFinal).replace('.', ',')) : ''}" placeholder="à fixer"></label>
        </div>
        ${c.note ? `<div class="pd-bloc"><b>Le mot du client</b><br>${esc(c.note)}</div>` : ''}
        ${c.photos && c.photos.length ? `<div class="pd-bloc"><b>Photos</b><div class="pd-photos">${c.photos.map((p) => `<img src="${p}" alt="">`).join('')}</div></div>` : ''}
        <div class="pd-bloc"><b>Contact</b><br>${esc(c.client.prenom)} · <a href="tel:${esc(telIntl(c.client.tel))}">${esc(c.client.tel)}</a>${c.client.email ? ` · <a href="mailto:${esc(c.client.email)}">${esc(c.client.email)}</a>` : ''}
          ${c.depot ? `<br>Passe le ${esc(CO.fmtDate(new Date(c.depot.date + 'T12:00:00')))}${c.depot.creneau ? ', ' + esc(c.depot.creneau) : ''}` : ''}
          ${c.pret ? `<br>Prévue pour le ${esc(CO.fmtDate(new Date(c.pret)))}` : ''}
        </div>
        <div class="ft-actions">
          <a class="btn btn-sauge" id="pd-sms" href="${esc(smsLien(c.client.tel, msgPret))}"><svg aria-hidden="true"><use href="#i-sms"/></svg> Prévenir : c’est prêt</a>
          <a class="btn btn-ligne" href="tel:${esc(telIntl(c.client.tel))}"><svg aria-hidden="true"><use href="#i-tel"/></svg> Appeler</a>
        </div>
        <p class="demo-note"><button class="lien-discret" type="button" id="pd-suppr"><svg aria-hidden="true"><use href="#i-poubelle"/></svg> Supprimer ce ticket</button></p>
      </div>`;
    $('#pd-retour').addEventListener('click', () => { vue = 'liste'; liste(); });
    $$('[data-st]', corps()).forEach((b) => b.addEventListener('click', () => {
      CO.Commandes.maj(c.num, { statut: b.dataset.st });
      if (b.dataset.st === 'prete') CO.toast('Prête ! Pensez à prévenir ' + (c.client.prenom || 'le client') + '.');
    }));
    $('#pd-prix').addEventListener('change', (e) => {
      const v = parseFloat(e.target.value.replace(',', '.'));
      CO.Commandes.maj(c.num, { prixFinal: isNaN(v) ? null : v });
      CO.toast(isNaN(v) ? 'Prix retiré.' : 'Prix final : ' + CO.prix(v));
    });
    $('#pd-sms').addEventListener('click', () => { if (c.statut !== 'prete' && c.statut !== 'rendue') CO.Commandes.maj(c.num, { statut: 'prete' }); });
    $('#pd-suppr').addEventListener('click', () => {
      if (!confirm('Supprimer le ticket N° ' + c.num + ' ?')) return;
      const a = CO.store.get('commandes', []).filter((x) => x.num !== c.num);
      CO.store.set('commandes', a);
      CO.emit('commandes', a);
      vue = 'liste';
      liste();
    });
  }

  /* ---------- un ticket au comptoir ---------- */
  function nouveau() {
    const objets = CO.OBJETS.map((o) => `<option value="${o.id}">${esc(o.nom)}</option>`).join('');
    corps().innerHTML = `<form class="pro-form" id="pn" novalidate>
        <button class="lien-discret" type="button" id="pn-retour" data-sfx="page"><svg aria-hidden="true"><use href="#i-retour"/></svg> Tous les tickets</button>
        <h3 style="margin:10px 0 12px">Un ticket au comptoir</h3>
        <label class="champ"><span>Prénom du client</span><input id="pn-prenom" maxlength="30" required></label>
        <label class="champ"><span>Téléphone</span><input id="pn-tel" type="tel" inputmode="tel" maxlength="20"></label>
        <label class="champ"><span>Article</span><select id="pn-objet" style="width:100%;font:inherit;padding:8px 4px;border:0;border-bottom:1.5px solid rgba(43,36,32,.3);background:transparent">${objets}</select></label>
        <label class="champ"><span>Précision (modèle, couleur)</span><input id="pn-detail" maxlength="60"></label>
        <p class="champ-t" style="color:var(--encre-3)">Travaux</p>
        <div class="choix" id="pn-services"></div>
        <label class="champ" style="margin-top:12px"><span>Note</span><input id="pn-note" maxlength="200"></label>
        <button class="btn btn-ticket btn-large" type="submit" data-sfx="none">Créer le ticket</button>
      </form>`;
    const sel = $('#pn-objet');
    const services = () => {
      const o = sel.value;
      $('#pn-services').innerHTML = CO.SERVICES.flatMap((r) => r.items.filter((it) => it.objets.includes(o))).map((it) => `<label class="choix-l" style="background:rgba(255,250,240,.9)"><input type="checkbox" value="${it.id}"><span class="cl-trou" aria-hidden="true"></span><span class="cl-nom">${esc(it.nom)}</span><span class="cl-prix">${esc(CO.prixService(it))}</span></label>`).join('');
    };
    sel.addEventListener('change', services);
    services();
    $('#pn-retour').addEventListener('click', () => { vue = 'liste'; liste(); });
    $('#pn').addEventListener('submit', async (e) => {
      e.preventDefault();
      const prenom = $('#pn-prenom').value.trim();
      if (!prenom) { CO.sfx.play('nope'); CO.toast('Le prénom, au moins.'); return; }
      const servs = $$('#pn-services input:checked').map((i) => CO.service(i.value)).filter(Boolean);
      const o = CO.OBJETS.find((x) => x.id === sel.value);
      const cmd = await CO.Commandes.creer({
        objet: sel.value, objetNom: o ? o.nom : '', detail: $('#pn-detail').value.trim(), services: servs, note: $('#pn-note').value.trim(),
        client: { prenom, tel: $('#pn-tel').value.trim() }, estimation: CO.Commandes.estimer(servs),
        pret: CO.apresJoursOuvres(new Date(), CO.Commandes.delai(servs)).toISOString(),
      }, { comptoir: true });
      CO.sfx.play('stamp');
      corps().innerHTML = `<div class="merci">
          <p class="champ-t" style="color:var(--encre-3)">Ticket créé</p>
          <p class="s-num" style="font-size:54px;line-height:1">N° ${esc(cmd.num)}</p>
          <p>Écrivez ce numéro sur le ticket papier. Le client peut suivre sa paire en scannant ce code :</p>
          <div class="ft-qr">${CO.Ticket.qr('CORDO63-' + cmd.num)}</div>
          <button class="btn btn-ligne btn-large" type="button" id="pn-fini" data-sfx="page">Retour aux tickets</button>
        </div>`;
      $('#pn-fini').addEventListener('click', () => { vue = 'liste'; filtre = 'cours'; liste(); });
    });
  }

  function rafraichir() {
    if (!$('#feuille-pro').classList.contains('is-open')) return;
    if (vue === 'liste') liste();
    else if (vue !== 'nouveau') detail(vue);
  }

  async function ouvrir() {
    if (!deverrouille()) {
      const r = await CO.Pin.demander({ titre: 'L’espace atelier', aide: 'Réservé à Clément : tapez le code de l’atelier.' });
      if (!r.ok) return;
      deverrouiller();
      await CO.wait(380);
    }
    vue = 'liste';
    liste();
    CO.openSheet('#feuille-pro');
  }

  CO.Pro = {
    ouvrir,
    init() {
      const l = $('#lien-pro');
      if (l) l.addEventListener('click', (e) => { e.preventDefault(); ouvrir(); });
      CO.on('commandes', rafraichir);
      if (new URLSearchParams(location.search).has('atelier')) setTimeout(ouvrir, 900);
    },
  };
})();
