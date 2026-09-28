/* ==========================================================================
   Cordo 63 — Déposer une paire : le ticket jaune se remplit étape par étape
   1 quoi · 2 quels travaux · 3 une photo ? · 4 quand ? · 5 qui ? · 6 le récapitulatif
   Puis « Envoyer à Clément » : le numéro se tamponne en rouge, le ticket se détache le long
   des pointillés (le haut part à l'atelier), la souche file dans « Mes tickets ».
   Le brouillon est gardé sur l'appareil (on peut quitter l'onglet et revenir).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => CO.esc(s);
  const ETAPES = ['objet', 'travaux', 'photos', 'quand', 'qui', 'recap'];
  const MAX_PHOTOS = 3;

  let form = null;
  let d = null; // le brouillon
  let etape = 0;
  let envoi = false;

  const neuf = () => ({ objet: null, detail: '', services: [], diagnostic: false, photos: [], note: '', depot: { date: null, creneau: null, plusTard: false }, client: { prenom: '', tel: '', email: '' }, consent: false });
  function charger() {
    const b = CO.store.get('brouillon', null);
    d = b && typeof b === 'object' ? Object.assign(neuf(), b) : neuf();
    etape = Math.min(CO.store.get('brouillon-etape', 0) || 0, ETAPES.length - 1);
    // le prénom et le téléphone de la dernière fois
    const moi = CO.store.get('moi', null);
    if (moi && !d.client.prenom) d.client = Object.assign(d.client, moi);
    preremplir();
  }
  /** la carte à clous a un nom et un téléphone (js/co-compte.js) : le ticket les reprend s'ils manquent */
  function preremplir() {
    const cpt = CO.Compte && CO.Compte.get();
    if (!cpt) return;
    if (!d.client.prenom) d.client.prenom = cpt.nom;
    if (!d.client.tel) d.client.tel = cpt.tel;
  }
  const garder = () => { CO.store.set('brouillon', d); CO.store.set('brouillon-etape', etape); };
  const objetDef = () => CO.OBJETS.find((o) => o.id === d.objet) || null;

  /** services proposés pour l'objet choisi, par rubrique */
  function servicesPour(objet) {
    return CO.SERVICES.map((r) => ({ r, items: r.items.filter((it) => !objet || it.objets.includes(objet)) })).filter((g) => g.items.length);
  }

  /* ---------- rendu ---------- */
  function rendre({ anime = false } = {}) {
    if (!form) return;
    const nom = ETAPES[etape];
    const fil = ETAPES.map((_, i) => `<i class="${i < etape ? 'fait' : i === etape ? 'ici' : ''}"></i>`).join('');
    form.innerHTML = `<div class="ticket" id="ticket-depot">
        ${CO.Ticket.tete(null)}
        <div class="ticket-corps">
          <div class="etapes-fil" aria-hidden="true">${fil}</div>
          <p class="visuellement-cache" aria-live="polite">Étape ${etape + 1} sur ${ETAPES.length}</p>
          ${ETAPE[nom]()}
        </div>
        <div class="ticket-perfo" aria-hidden="true"></div>
        <div class="ticket-souche">
          <span class="ecrit" id="souche-texte">${esc(soucheTexte())}</span>
          <span class="ticket-pastille" aria-hidden="true"></span>
        </div>
      </div>
      <p class="demo-note">Rien n’est payé en ligne : vous réglez à l’atelier, quand vous récupérez votre paire.</p>`;
    brancher(nom);
    if (anime && !CO.reduced) {
      const c = $('.ticket-corps', form);
      c.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.25,1)' });
    }
  }

  function soucheTexte() {
    const o = objetDef();
    const n = d.services.length;
    if (!o) return 'Ticket à remplir';
    return o.nom + (n ? ' · ' + n + ' réparation' + (n > 1 ? 's' : '') : d.diagnostic ? ' · à regarder' : '');
  }

  const nav = (suivant = 'Continuer', { ok = true, sansRetour = false } = {}) => `<div class="etape-nav">
      ${etape > 0 && !sansRetour ? '<button class="btn btn-ligne btn-retour" type="button" data-nav="-1" aria-label="Étape précédente" data-sfx="page"><svg aria-hidden="true"><use href="#i-retour"/></svg></button>' : ''}
      <button class="btn btn-noir" type="button" data-nav="1" data-sfx="page" ${ok ? '' : 'disabled'}>${suivant} <svg aria-hidden="true"><use href="#i-fleche"/></svg></button>
    </div>`;

  const ETAPE = {
    objet() {
      const tuiles = CO.OBJETS.map((o) => `<button class="objet${d.objet === o.id ? ' on' : ''}" type="button" data-objet="${o.id}" aria-pressed="${d.objet === o.id}" data-sfx="chip"><svg aria-hidden="true"><use href="#${o.icone}"/></svg><span>${esc(o.nom)}</span></button>`).join('');
      return `<h3 class="etape-q">Qu’est-ce qu’on répare ?</h3>
        <p class="etape-aide">Une paire, un sac, des clés…</p>
        <div class="objets">${tuiles}</div>
        ${d.objet ? `<label class="champ" style="margin-top:14px"><span>Précisez (marque, modèle, pointure)</span><input id="d-detail" maxlength="60" value="${esc(d.detail)}" placeholder="${d.objet === 'sneakers' ? 'Jordan 1 blanches, 43' : d.objet === 'cles' ? '2 clés plates' : 'Bottines noires'}" autocomplete="off"></label>` : ''}
        ${nav('Continuer', { ok: !!d.objet })}`;
    },
    travaux() {
      const groupes = servicesPour(d.objet);
      const pris = new Set(d.services);
      const lignes = groupes.map((g) => g.items.map((it) => `<label class="choix-l"><input type="checkbox" value="${it.id}" ${pris.has(it.id) ? 'checked' : ''}><span class="cl-trou" aria-hidden="true"></span><span class="cl-nom">${esc(it.nom)}<small>${esc(CO.delaiTexte(it.delai))}</small></span><span class="cl-prix">${esc(CO.prixService(it))}</span></label>`).join('')).join('');
      return `<h3 class="etape-q">Qu’est-ce qu’il faut faire ?</h3>
        <p class="etape-aide">Cochez une ou plusieurs réparations. Les prix sont indicatifs.</p>
        <div class="choix" id="d-services">${lignes}
          <label class="choix-l sp"><input type="checkbox" id="d-diag" ${d.diagnostic ? 'checked' : ''}><span class="cl-trou" aria-hidden="true"></span><span class="cl-nom">Je ne sais pas<small>Clément regarde et vous dit (gratuit)</small></span><span class="cl-prix">0 €</span></label>
        </div>
        ${nav('Continuer', { ok: d.services.length > 0 || d.diagnostic })}`;
    },
    photos() {
      const minis = d.photos.map((p, i) => `<div class="photo-mini" style="--rot:${[-3, 2, -1][i % 3]}deg"><img src="${p}" alt="Photo ${i + 1}"><button type="button" data-suppr="${i}" aria-label="Retirer la photo ${i + 1}" data-sfx="close"><svg aria-hidden="true"><use href="#i-croix"/></svg></button></div>`).join('');
      return `<h3 class="etape-q">Une photo ?</h3>
        <p class="etape-aide">Facultatif, mais ça aide Clément à préparer (et à vous répondre s’il y a un doute).</p>
        <div class="photos">${minis}${d.photos.length < MAX_PHOTOS ? `<label class="photo-ajout"><span><svg aria-hidden="true"><use href="#i-photo"/></svg>Ajouter</span><input type="file" accept="image/*" id="d-photo" aria-label="Ajouter une photo"></label>` : ''}</div>
        <label class="champ" style="margin-top:16px"><span>Un mot pour Clément</span><textarea id="d-note" rows="3" maxlength="400" placeholder="La semelle se décolle à l’avant…">${esc(d.note)}</textarea></label>
        ${nav('Continuer')}`;
    },
    quand() {
      const jours = CO.joursOuverts(6);
      const j = jours.map((x) => `<button class="jour${d.depot.date === x.iso ? ' on' : ''}" type="button" data-jour="${x.iso}" aria-pressed="${d.depot.date === x.iso}" data-sfx="chip">${esc(x.label)}<small>${x.date.getDate()} ${CO.MOIS[x.date.getMonth()].slice(0, 4)}.</small></button>`).join('');
      const cr = ['le matin', 'l’après-midi'].map((c) => `<button class="jour${d.depot.creneau === c ? ' on' : ''}" type="button" data-creneau="${c}" aria-pressed="${d.depot.creneau === c}" data-sfx="chip">${c === 'le matin' ? 'Le matin<small>10h – 13h30</small>' : 'L’après-midi<small>14h30 – 19h</small>'}</button>`).join('');
      return `<h3 class="etape-q">Quand passez-vous la déposer ?</h3>
        <p class="etape-aide">Sans rendez-vous : c’est pour que Clément vous attende.</p>
        <div class="jours">${j}</div>
        <div class="creneaux">${cr}</div>
        <label class="consent" style="margin-top:14px"><input type="checkbox" id="d-plustard" ${d.depot.plusTard ? 'checked' : ''}> Je ne sais pas encore, je passerai</label>
        ${nav('Continuer', { ok: d.depot.plusTard || !!d.depot.date })}`;
    },
    qui() {
      preremplir();
      const c = d.client;
      return `<h3 class="etape-q">C’est au nom de qui ?</h3>
        <p class="etape-aide">Clément vous prévient quand c’est prêt.</p>
        <label class="champ" id="c-prenom"><span>Prénom</span><input id="d-prenom" name="given-name" autocomplete="given-name" maxlength="30" value="${esc(c.prenom)}" placeholder="Votre prénom" required><em class="champ-msg"></em></label>
        <label class="champ" id="c-tel"><span>Téléphone</span><input id="d-tel" name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(c.tel)}" placeholder="06 12 34 56 78" required><em class="champ-msg"></em></label>
        <label class="champ" id="c-email"><span>E-mail (facultatif)</span><input id="d-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="80" value="${esc(c.email)}" placeholder="vous@exemple.fr"><em class="champ-msg"></em></label>
        <label class="consent"><input type="checkbox" id="d-consent" ${d.consent ? 'checked' : ''}> J’accepte que Cordo 63 garde ces informations le temps de la réparation et me contacte à son sujet.</label>
        ${nav('Voir le ticket', { ok: true })}`;
    },
    recap() {
      const o = objetDef();
      const servs = d.services.map((id) => CO.service(id)).filter(Boolean);
      const est = CO.Commandes.estimer(servs);
      const delai = CO.Commandes.delai(servs);
      const depart = d.depot.date ? new Date(d.depot.date + 'T12:00:00') : new Date();
      const pret = CO.apresJoursOuvres(depart, delai);
      const lignes = servs.map((s) => `<div class="recap-l"><span>${esc(s.nom)}</span><span class="ecrit">${esc(CO.prixService(s))}</span></div>`).join('')
        + (d.diagnostic ? '<div class="recap-l"><span>Diagnostic</span><span class="ecrit">gratuit</span></div>' : '');
      const quand = d.depot.plusTard || !d.depot.date ? 'Quand vous voulez, aux heures d’ouverture' : CO.fmtDate(new Date(d.depot.date + 'T12:00:00')) + (d.depot.creneau ? ', ' + d.depot.creneau : '');
      return `<h3 class="etape-q">Votre ticket</h3>
        <p class="champ-t">Article</p><p class="ecrit" style="margin:0">${esc(o ? o.nom : '')}${d.detail ? ' — ' + esc(d.detail) : ''}</p>
        <p class="champ-t">Travaux</p>${lignes}
        <div class="recap-total"><span>Estimation</span><span class="ecrit">${esc(CO.Commandes.texteEstimation(est) || 'sur devis')}</span></div>
        <p class="recap-note">${delai === 0 ? 'Souvent fait pendant qu’on attend.' : 'Prête vers le ' + esc(CO.fmtDate(pret)) + ' (' + esc(CO.delaiTexte(delai)) + ').'} Le prix est confirmé par Clément quand il voit la paire.</p>
        <p class="champ-t">Dépôt</p><p class="ecrit" style="margin:0">${esc(quand)}</p>
        <p class="champ-t">Au nom de</p><p class="ecrit" style="margin:0">${esc(d.client.prenom)} · ${esc(d.client.tel)}</p>
        ${d.photos.length ? `<p class="champ-t">Photos</p><div class="photos">${d.photos.map((p, i) => `<div class="photo-mini" style="--rot:${[-3, 2, -1][i % 3]}deg;width:64px;height:64px"><img src="${p}" alt=""></div>`).join('')}</div>` : ''}
        <div class="etape-nav">
          <button class="btn btn-ligne btn-retour" type="button" data-nav="-1" aria-label="Étape précédente" data-sfx="page"><svg aria-hidden="true"><use href="#i-retour"/></svg></button>
          <button class="btn btn-noir" type="button" id="d-envoyer" data-sfx="none"><svg aria-hidden="true"><use href="#i-ticket"/></svg> Envoyer à Clément</button>
        </div>`;
    },
  };

  /* ---------- interactions ---------- */
  function brancher(nom) {
    $$('[data-nav]', form).forEach((b) => b.addEventListener('click', () => aller(etape + +b.dataset.nav)));
    const majNav = (ok) => { const b = $('[data-nav="1"]', form); if (b) b.disabled = !ok; };
    const majSouche = () => { const s = $('#souche-texte', form); if (s) s.textContent = soucheTexte(); };

    if (nom === 'objet') {
      $$('[data-objet]', form).forEach((b) => b.addEventListener('click', () => {
        const avant = d.objet;
        d.objet = b.dataset.objet;
        if (avant !== d.objet) {
          // on garde les services encore valables pour ce nouvel objet
          d.services = d.services.filter((id) => { const s = CO.service(id); return s && s.objets.includes(d.objet); });
        }
        garder();
        rendre();
        const inp = $('#d-detail', form);
        if (inp && matchMedia('(hover: hover)').matches) inp.focus({ preventScroll: true });
      }));
      const det = $('#d-detail', form);
      if (det) det.addEventListener('input', () => { d.detail = det.value.trim(); garder(); });
    }
    if (nom === 'travaux') {
      $$('#d-services input[value]', form).forEach((inp) => inp.addEventListener('change', () => {
        const id = inp.value;
        d.services = inp.checked ? [...new Set(d.services.concat(id))] : d.services.filter((x) => x !== id);
        CO.sfx.play(inp.checked ? 'punch' : 'tap');
        garder(); majSouche(); majNav(d.services.length > 0 || d.diagnostic);
        CO.emit('devis', d.services);
      }));
      const dg = $('#d-diag', form);
      dg.addEventListener('change', () => { d.diagnostic = dg.checked; CO.sfx.play(dg.checked ? 'punch' : 'tap'); garder(); majSouche(); majNav(d.services.length > 0 || d.diagnostic); });
    }
    if (nom === 'photos') {
      const f = $('#d-photo', form);
      if (f) f.addEventListener('change', async () => {
        const file = f.files && f.files[0];
        if (!file) return;
        try {
          const url = await reduire(file);
          d.photos = d.photos.concat(url).slice(0, MAX_PHOTOS);
          CO.sfx.play('snip');
          garder();
          rendre();
        } catch (e) { CO.toast('Cette image ne passe pas, essayez une autre.'); }
      });
      $$('[data-suppr]', form).forEach((b) => b.addEventListener('click', () => { d.photos.splice(+b.dataset.suppr, 1); garder(); rendre(); }));
      const n = $('#d-note', form);
      n.addEventListener('input', () => { d.note = n.value; garder(); });
    }
    if (nom === 'quand') {
      $$('[data-jour]', form).forEach((b) => b.addEventListener('click', () => { d.depot.date = b.dataset.jour; d.depot.plusTard = false; garder(); rendre(); }));
      $$('[data-creneau]', form).forEach((b) => b.addEventListener('click', () => { d.depot.creneau = d.depot.creneau === b.dataset.creneau ? null : b.dataset.creneau; garder(); rendre(); }));
      const pt = $('#d-plustard', form);
      pt.addEventListener('change', () => { d.depot.plusTard = pt.checked; if (pt.checked) { d.depot.date = null; d.depot.creneau = null; } garder(); rendre(); });
    }
    if (nom === 'qui') {
      const sync = () => {
        d.client.prenom = $('#d-prenom', form).value.trim();
        d.client.tel = $('#d-tel', form).value.trim();
        d.client.email = $('#d-email', form).value.trim();
        d.consent = $('#d-consent', form).checked;
        garder();
      };
      $$('input', form).forEach((i) => i.addEventListener('input', sync));
      $('#d-consent', form).addEventListener('change', sync);
      // la validation se fait au moment de continuer
      const b = $('[data-nav="1"]', form);
      b.replaceWith(b.cloneNode(true));
      $('[data-nav="1"]', form).addEventListener('click', () => { sync(); if (valider()) aller(etape + 1); });
      $('[data-nav="-1"]', form).addEventListener('click', sync);
    }
    if (nom === 'recap') {
      $('#d-envoyer', form).addEventListener('click', envoyer);
    }
  }

  function erreur(id, msg) {
    const c = $('#' + id, form);
    if (!c) return;
    c.classList.toggle('erreur', !!msg);
    $('.champ-msg', c).textContent = msg || '';
  }
  const telOk = (t) => /^(?:\+33\s?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}$/.test(t.trim()) || /^\+?\d[\d\s.-]{7,17}$/.test(t.trim());
  function valider() {
    let ok = true;
    const c = d.client;
    erreur('c-prenom', c.prenom.length < 2 ? 'Votre prénom, pour le ticket.' : '');
    if (c.prenom.length < 2) ok = false;
    erreur('c-tel', !telOk(c.tel) ? 'Un numéro pour vous prévenir quand c’est prêt.' : '');
    if (!telOk(c.tel)) ok = false;
    const emailOk = !c.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email);
    erreur('c-email', emailOk ? '' : 'Cette adresse ne semble pas complète.');
    if (!emailOk) ok = false;
    if (!d.consent) { ok = false; CO.toast('Cochez la case pour que Clément puisse vous prévenir.'); }
    if (!ok) CO.sfx.play('nope');
    return ok;
  }

  function aller(i) {
    const n = Math.max(0, Math.min(ETAPES.length - 1, i));
    if (n > etape) {
      // on ne saute pas d'étape obligatoire
      if (ETAPES[etape] === 'objet' && !d.objet) return;
      if (ETAPES[etape] === 'travaux' && !d.services.length && !d.diagnostic) return;
    }
    etape = n;
    garder();
    rendre({ anime: true });
    const sc = $('#deposer .view-scroll');
    if (sc) sc.scrollTo({ top: 0, behavior: CO.reduced ? 'auto' : 'smooth' });
  }

  /** une photo réduite (640 px, JPEG) : légère sur l'appareil, suffisante pour un diagnostic */
  function reduire(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 640 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.62));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
      img.src = url;
    });
  }

  /* ---------- l'envoi : tampon, déchirure, merci ---------- */
  async function envoyer() {
    if (envoi) return;
    envoi = true;
    const btn = $('#d-envoyer', form);
    if (btn) btn.disabled = true;
    const o = objetDef();
    const servs = d.services.map((id) => CO.service(id)).filter(Boolean);
    const delai = CO.Commandes.delai(servs);
    const depart = d.depot.date ? new Date(d.depot.date + 'T12:00:00') : new Date();
    const cmd = await CO.Commandes.creer({
      objet: d.objet, objetNom: o ? o.nom : '', detail: d.detail, services: servs, diagnostic: d.diagnostic,
      photos: d.photos, note: d.note,
      depot: d.depot.plusTard || !d.depot.date ? null : { date: d.depot.date, creneau: d.depot.creneau },
      client: d.client, estimation: CO.Commandes.estimer(servs), pret: CO.apresJoursOuvres(depart, delai).toISOString(),
    });
    CO.store.set('moi', { prenom: d.client.prenom, tel: d.client.tel, email: d.client.email });
    const ticket = $('#ticket-depot', form);
    await CO.Ticket.tamponner($('#ticket-num', form), cmd.num);
    await CO.wait(250);
    await CO.Ticket.detacher(ticket);
    CO.sfx.play('ding');
    // le brouillon repart à zéro
    d = neuf();
    const moi = CO.store.get('moi', null);
    if (moi) d.client = Object.assign(d.client, moi);
    etape = 0;
    garder();
    merci(cmd);
    envoi = false;
    CO.emit('commande-envoyee', cmd);
  }

  function merci(cmd) {
    form.innerHTML = `<div class="merci">
        ${CO.Ticket.souche(cmd)}
        <h3>C’est noté, ${esc(cmd.client.prenom)} !</h3>
        <p>Clément a votre ticket <b>N° ${esc(cmd.num)}</b>. Passez déposer votre paire${cmd.depot ? ' ' + esc(CO.fmtDate(new Date(cmd.depot.date + 'T12:00:00'))) : ''} : dites simplement « ticket ${esc(cmd.num)} ».</p>
        <a class="btn btn-ticket btn-large" href="#tickets" data-sfx="tab">Voir mes tickets</a>
        <a class="btn btn-ligne btn-large" href="${esc(CO.SHOP.itineraire)}" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="#i-pin"/></svg> Itinéraire jusqu’à l’atelier</a>
        <button class="btn btn-ligne btn-large" type="button" id="d-encore" data-sfx="page">Déposer une autre paire</button>
      </div>`;
    $('#d-encore', form).addEventListener('click', () => rendre({ anime: true }));
    $('.souche', form).addEventListener('click', () => CO.Suivi && CO.Suivi.ouvrir(cmd.num));
    if (!CO.reduced) $('.merci .souche', form).animate([{ transform: 'translateY(-30px) rotate(-3deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  }

  /* ---------- l'API ---------- */
  CO.Deposer = {
    init() {
      form = $('#commande');
      if (!form) return;
      charger();
      rendre();
      form.addEventListener('submit', (e) => e.preventDefault());
    },
    /** depuis l'établi : les services choisis → le ticket, à la bonne étape */
    preparer(ids) {
      if (!d) charger();
      const servs = ids.map((id) => CO.service(id)).filter(Boolean);
      if (!servs.length) return;
      d.services = [...new Set(servs.map((s) => s.id))];
      d.diagnostic = false;
      // l'objet : celui que tous ces services acceptent (le premier commun), sinon on le demande
      const communs = CO.OBJETS.map((o) => o.id).filter((o) => servs.every((s) => s.objets.includes(o)));
      if (!d.objet || !communs.includes(d.objet)) d.objet = communs.length === 1 ? communs[0] : null;
      etape = d.objet ? ETAPES.indexOf('photos') : 0;
      garder();
      rendre();
    },
  };
})();
