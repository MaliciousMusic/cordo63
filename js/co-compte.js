/* ==========================================================================
   Cordo 63 — mon compte : un nom et un téléphone ; le nom est cousu sur la carte à clous
   La fiche (feuille #feuille-compte) : une étiquette kraft qu'on remplit au stylo (le nom à
   coudre, le téléphone, l'accord). Une fois la fiche remplie, Clément coud le nom sous le
   CORDO63 frappé dans le cuir : du fil jaune (comme les coutures d'une Dr. Martens), point
   par point, comme une machine qui court le long des lettres.
   Maquette : tout reste sur ce téléphone (CO.store('compte')) ; en production, Clément
   reçoit la fiche pour relier les tickets et la carte.

   CO.Compte.get()                    → { nom, tel, cree } | null
   CO.Compte.creer({ nom, tel })      → { ok, compte, erreurs }  (écrit aussi CO.store('moi') : le dépôt est prérempli)
   CO.Compte.modifier()               → ouvre la fiche pour corriger (le nom est recousu) ; modifier({ nom, tel }) enregistre
   CO.Compte.oublier({ confirmer })   → bool : efface la fiche (après confirmation), le nom est décousu
   CO.Compte.ouvrir({ suite })        → Promise<compte | null> : la fiche (créer, ou modifier s'il y a un compte)
   CO.Compte.valider({ nom, tel })    → { nom?, tel? } les messages d'erreur
   CO.Compte.broder(hote, nom, { anime, duree, surPoint }) → Promise : coud le nom dans hote (deux <canvas>)
   CO.Compte.decoudre(hote)           → Promise : défait la couture, à l'envers, vite
   CO.on('compte', ({ compte, avant, raison }) => …)   raison : 'creer' | 'modifier' | 'oublier'
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => (CO.esc ? CO.esc(s) : String(s == null ? '' : s));
  const CLE = 'compte';

  /* ======================================================================
     1. Les données
     ====================================================================== */
  // un numéro français, fixe ou mobile (06 12 34 56 78, 0612345678, +33 6 12 34 56 78…), comme co-deposer.js
  const TEL = /^(?:(?:\+|00)33[\s.-]?(?:\(0\)[\s.-]?)?[1-9]|0[1-9])(?:[\s.-]?\d{2}){4}$/;
  const propre = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  function telJoli(t) {
    let d = String(t || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+33')) d = '0' + d.slice(3);
    else if (d.startsWith('0033')) d = '0' + d.slice(4);
    if (d.startsWith('00')) d = d.slice(1);
    return /^0\d{9}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, '$1 ') : propre(t);
  }
  function valider({ nom, tel } = {}) {
    const e = {};
    const n = propre(nom);
    if (n.length < 2) e.nom = 'Votre prénom (ou votre nom), deux lettres au moins.';
    else if (!/\p{L}/u.test(n)) e.nom = 'Des lettres, pour que Clément puisse les coudre.';
    if (!TEL.test(propre(tel))) e.tel = 'Un numéro français : 06 12 34 56 78.';
    return e;
  }
  function get() {
    const c = CO.store.get(CLE, null);
    return c && typeof c === 'object' && c.nom && c.tel ? { nom: c.nom, tel: c.tel, cree: c.cree || null } : null;
  }
  function ecrire(c, raison, avant) {
    CO.store.set(CLE, c);
    // le dépôt (co-deposer.js) reprend le prénom et le téléphone
    const moi = CO.store.get('moi', null) || {};
    CO.store.set('moi', { prenom: c.nom, tel: c.tel, email: moi.email || '' });
    CO.emit('compte', { compte: get(), avant, raison });
  }
  function creer({ nom, tel } = {}) {
    const erreurs = valider({ nom, tel });
    if (Object.keys(erreurs).length) return { ok: false, erreurs, compte: null };
    const avant = get();
    const c = { nom: propre(nom), tel: telJoli(tel), cree: (avant && avant.cree) || new Date().toISOString(), consent: true };
    ecrire(c, avant ? 'modifier' : 'creer', avant);
    return { ok: true, compte: get(), erreurs: {} };
  }
  function modifier(patch) {
    if (!patch) return ouvrir();
    const avant = get();
    if (!avant) return creer(patch);
    const suite = Object.assign({}, avant, patch);
    const erreurs = valider(suite);
    if (Object.keys(erreurs).length) return { ok: false, erreurs, compte: avant };
    const c = { nom: propre(suite.nom), tel: telJoli(suite.tel), cree: avant.cree, consent: true, modifie: new Date().toISOString() };
    if (c.nom === avant.nom && c.tel === avant.tel) return { ok: true, compte: avant, erreurs: {}, inchange: true }; // (rien à recoudre)
    ecrire(c, 'modifier', avant);
    return { ok: true, compte: get(), erreurs: {} };
  }
  function oublier({ confirmer = true } = {}) {
    const avant = get();
    if (!avant) return false;
    if (confirmer && !window.confirm('Oublier votre carte ?\nVotre nom et votre numéro sont effacés de ce téléphone ; les clous déjà plantés restent sur la carte.')) return false;
    CO.store.del(CLE);
    const moi = CO.store.get('moi', null);
    if (moi && (moi.tel === avant.tel || moi.prenom === avant.nom)) CO.store.del('moi');
    CO.emit('compte', { compte: null, avant, raison: 'oublier' });
    return true;
  }

  /* ======================================================================
     2. La fiche : une étiquette kraft, le stylo, la case à perforer
     ====================================================================== */
  let attente = null; // { resolve } : la fiche ouverte
  // l'aiguille et son fil (icône au trait, comme le sprite de index.html)
  const AIGUILLE = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4.5 19.5 17.8 6.2"/><path d="M17.8 6.2c.9-.9 2.2-.9 2.6-.5s.4 1.7-.5 2.6L8.6 19.6"/><path d="M18.4 6.9l.7-.7"/><path d="M3 21c1.8-2.5 4.4-1.4 5.4-3.4.8-1.6-.6-3.2-2.4-2.8"/></svg>';
  function fiche({ suite = false } = {}) {
    const c = get();
    const moi = CO.store.get('moi', null) || {};
    const nom = c ? c.nom : moi.prenom || '';
    const tel = c ? c.tel : moi.tel || '';
    const edition = !!c;
    return `<form class="fiche" id="fiche-compte" novalidate autocomplete="on">
        <div class="fiche-tag">
          <span class="fiche-oeillet" aria-hidden="true"></span>
          <p class="fiche-tete"><span>CORDO63</span><small>fiche client</small></p>
          <div class="fiche-cuir" aria-hidden="true"><span class="fiche-logo"></span><span class="fiche-apercu" id="compte-apercu">${esc(nom) || 'votre nom ici'}</span></div>
          <label class="fiche-champ" id="fc-nom"><span>Le nom à coudre</span><input id="compte-nom" name="name" autocomplete="name" autocapitalize="words" maxlength="24" value="${esc(nom)}" placeholder="Julie" required><em class="champ-msg"></em></label>
          <label class="fiche-champ" id="fc-tel"><span>Téléphone</span><input id="compte-tel" name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" value="${esc(tel)}" placeholder="06 12 34 56 78" required><em class="champ-msg"></em></label>
          <label class="fiche-accord" id="fc-accord">
            <input type="checkbox" id="compte-accord" ${edition ? 'checked' : ''}>
            <span class="fiche-trou" aria-hidden="true"></span>
            <span class="fiche-accord-t">J’accepte que Cordo 63 garde mon nom et mon numéro pour ma carte.<small>Démo : ils restent sur ce téléphone. En vrai, Clément les reçoit pour relier vos tickets et votre carte.</small></span>
          </label>
        </div>
        <div class="fiche-actions">
          <button class="btn btn-noir btn-large" type="submit" data-sfx="none">${AIGUILLE} ${edition ? 'Recoudre mon nom' : 'Coudre mon nom'}</button>
          ${edition ? '<button class="lien-discret fiche-oublier" type="button" id="compte-oublier" data-sfx="tap"><svg aria-hidden="true"><use href="#i-poubelle"/></svg> Oublier ma carte</button>' : ''}
        </div>
      </form>`;
  }
  function erreur(form, id, msg) {
    const l = $('#' + id, form);
    if (!l) return;
    l.classList.toggle('erreur', !!msg);
    const em = $('.champ-msg', l);
    if (em) em.textContent = msg || '';
  }
  /** la fiche : créer (ou modifier, s'il y a déjà un compte) → Promise<compte | null> */
  function ouvrir({ suite = false } = {}) {
    const corps = $('#compte-corps');
    if (!corps) return Promise.resolve(null);
    if (attente) { attente.resolve(null); attente = null; }
    const edition = !!get();
    $('#compte-titre').textContent = edition ? 'Ma carte, à mon nom' : 'Créer ma carte';
    const chapo = $('#compte-chapo');
    if (chapo) chapo.textContent = edition ? 'Une faute ? Corrigez : Clément découd et recoud.' : suite ? 'D’abord votre nom sur la carte, puis Clément plante le clou.' : 'Votre nom, cousu sous CORDO63. Et Clément relie vos tickets à votre carte.';
    corps.innerHTML = fiche({ suite });
    const form = $('#fiche-compte', corps);
    const logo = $('.fiche-logo', form);
    if (logo && CO.logo) logo.appendChild(CO.logo({ couleur: 'currentColor' }));
    const iNom = $('#compte-nom', form), iTel = $('#compte-tel', form), iAcc = $('#compte-accord', form), ap = $('#compte-apercu', form);
    iNom.addEventListener('input', () => { ap.textContent = propre(iNom.value) || 'votre nom ici'; ap.classList.toggle('vide', !propre(iNom.value)); erreur(form, 'fc-nom', ''); });
    ap.classList.toggle('vide', !propre(iNom.value));
    iTel.addEventListener('input', () => erreur(form, 'fc-tel', ''));
    iTel.addEventListener('blur', () => { if (TEL.test(propre(iTel.value))) iTel.value = telJoli(iTel.value); }); // 06 12 34 56 78
    iAcc.addEventListener('change', () => { CO.sfx.play(iAcc.checked ? 'punch' : 'tap'); erreur(form, 'fc-accord', ''); });
    return new Promise((resolve) => {
      attente = { resolve };
      let fini = false;
      const finir = (v) => { if (fini) return; fini = true; if (attente && attente.resolve === resolve) attente = null; resolve(v); };
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const donnees = { nom: iNom.value, tel: iTel.value };
        const err = valider(donnees);
        erreur(form, 'fc-nom', err.nom);
        erreur(form, 'fc-tel', err.tel);
        const accord = iAcc.checked;
        erreur(form, 'fc-accord', accord ? '' : 'x');
        if (Object.keys(err).length || !accord) {
          CO.sfx.play('nope');
          if (!accord && !Object.keys(err).length) CO.toast('Cochez la case : Clément a besoin de votre accord pour coudre votre nom.', 3200);
          return;
        }
        const r = edition ? modifier(donnees) : creer(donnees);
        if (!r.ok) return;
        CO.sfx.play('yes');
        if (r.inchange) CO.toast('Rien à recoudre : c’est déjà votre nom.');
        CO.closeSheet('#feuille-compte');
        finir(r.compte);
      });
      const ob = $('#compte-oublier', form);
      if (ob) ob.addEventListener('click', () => {
        if (!oublier()) return;
        CO.closeSheet('#feuille-compte');
        finir(null);
      });
      CO.openSheet('#feuille-compte', () => finir(null));
    });
  }

  /* ======================================================================
     3. La broderie : le nom en points de bourdon (satin) dans le cuir
     Le nom est écrit (police --main, Shantell Sans, grasse) sur un calque de calcul ; des
     lignes de couture parallèles, penchées, le traversent : chaque passage dans une lettre
     est un point (fil tendu d'un bord à l'autre ; au-delà de 7 à 8 mm, le point est coupé en
     quinconce). Les points sont rangés lettre par lettre, en allers-retours, comme la
     machine les pique. Deux calques : dessous, l'ombre du fil et les trous d'aiguille ;
     dessus, le fil (un ton par point, son ombre propre, son reflet côté lumière).
     ====================================================================== */
  const FILS = {
    jaune: { base: [238, 197, 62], clair: [255, 247, 204], sombre: [128, 88, 14] },
    creme: { base: [236, 223, 190], clair: [255, 255, 250], sombre: [140, 122, 90] },
  };
  const RES = 5; // px du calque de calcul par px CSS
  const cache = new Map(); // (nom, boîte) → géométrie
  const var_ = (v, repli) => { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || repli; } catch (e) { return repli; } };
  const hasard = (i) => { let t = (i * 2654435761) >>> 0; t ^= t >>> 15; t = Math.imul(t, 2246822519) >>> 0; t ^= t >>> 13; return (t >>> 0) / 4294967296; };

  async function policePrete(fam, poids, texte) {
    if (!document.fonts || !document.fonts.load) return;
    try { await Promise.race([document.fonts.load(`${poids} 40px ${fam}`, texte), CO.wait(1500)]); } catch (e) { /* la police de repli */ }
  }

  /**
   * la géométrie : les points d'un nom dans une boîte W × H (px CSS)
   * → { points: [{ x1, y1, x2, y2, l }], lettres, W, H }  (x, y en px CSS dans la boîte ; l : la lettre)
   */
  function geometrie(nom, W, H, o = {}) {
    const fam = o.famille || var_('--main', "'Shantell Sans', cursive");
    const poids = o.poids || 800;
    const angle = (o.angle != null ? o.angle : 62) * Math.PI / 180; // la pente des points (depuis l'horizontale)
    const pas = o.pas || 0.6; // l'écart entre deux points (px CSS) : un bourdon serré
    const longMax = o.longMax || 7.5; // au-delà, le point est coupé (px CSS ≈ mm de la carte : un bourdon ne dépasse pas 7 à 8 mm)
    const cle = [nom, W, H, fam, poids, angle, pas, longMax].join('|');
    if (cache.has(cle)) return cache.get(cle);
    const lettres = Array.from(String(nom).normalize('NFC'));
    const c = document.createElement('canvas');
    const Wm = Math.max(4, Math.ceil(W * RES)), Hm = Math.max(4, Math.ceil(H * RES));
    c.width = Wm; c.height = Hm;
    const g = c.getContext('2d', { willReadFrequently: true });
    // la taille : le nom tient sur une ligne ; trop long, on le réduit, puis on le resserre
    const T0 = 100;
    g.font = `${poids} ${T0}px ${fam}`;
    const m0 = g.measureText(nom);
    const haut0 = (m0.actualBoundingBoxAscent || T0 * 0.72) + (m0.actualBoundingBoxDescent || T0 * 0.2);
    const larg0 = Math.max(1, (m0.actualBoundingBoxLeft || 0) + (m0.actualBoundingBoxRight || m0.width));
    const tMax = o.max || H * 1.1, tMin = o.min || 12;
    let t = Math.min(T0 * (H * 0.94) / haut0, T0 * (W * 0.98) / larg0, tMax);
    let sx = 1;
    if (t < tMin) { sx = Math.max(0.55, (T0 * (W * 0.98) / larg0) / tMin); t = tMin; }
    g.font = `${poids} ${t * RES}px ${fam}`;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    const m = g.measureText(nom);
    const asc = m.actualBoundingBoxAscent || t * RES * 0.72, desc = m.actualBoundingBoxDescent || t * RES * 0.2;
    const gauche = m.actualBoundingBoxLeft || 0, droite = m.actualBoundingBoxRight || m.width;
    const encre = (gauche + droite) * sx;
    const x0 = (Wm - encre) / 2 + gauche * sx;
    const base = (Hm - (asc + desc)) / 2 + asc;
    g.save();
    g.translate(x0, base);
    g.scale(sx, 1);
    g.fillStyle = '#fff';
    g.fillText(nom, 0, 0);
    g.restore();
    // les bornes de chaque lettre (le long de la ligne) : pour coudre lettre par lettre
    const bornes = [];
    let acc = '';
    for (let i = 0; i < lettres.length; i++) { bornes.push(x0 + g.measureText(acc).width * sx); acc += lettres[i]; }
    bornes.push(x0 + g.measureText(acc).width * sx);
    const lettreDe = (x) => { let l = 0; while (l < lettres.length - 1 && x > bornes[l + 1]) l++; return l; };
    const px = g.getImageData(0, 0, Wm, Hm).data;
    const dedans = (x, y) => {
      const xi = x | 0, yi = y | 0;
      return xi >= 0 && yi >= 0 && xi < Wm && yi < Hm && px[(yi * Wm + xi) * 4 + 3] > 120;
    };
    // les lignes de couture : direction u (vers le haut à droite), écart le long de n
    const ux = Math.cos(angle), uy = -Math.sin(angle), nx = Math.sin(angle), ny = Math.cos(angle);
    const coins = [[0, 0], [Wm, 0], [0, Hm], [Wm, Hm]];
    const dL = coins.map(([x, y]) => x * nx + y * ny), tL = coins.map(([x, y]) => x * ux + y * uy);
    const d0 = Math.min(...dL), d1 = Math.max(...dL), t0 = Math.min(...tL), t1 = Math.max(...tL);
    const P = pas * RES, LM = longMax * RES, EP = 0.5;
    const pts = [];
    let k = 0;
    for (let d = d0 + P * 0.5; d < d1; d += P, k++) {
      const runs = [];
      let debut = null;
      for (let tt = t0; tt <= t1 + EP; tt += EP) {
        const x = nx * d + ux * tt, y = ny * d + uy * tt;
        const dd = tt <= t1 && dedans(x, y);
        if (dd && debut == null) debut = tt;
        else if (!dd && debut != null) { runs.push([debut, tt - EP]); debut = null; }
      }
      for (const [a, b] of runs) {
        const L = b - a;
        if (L < 0.9) continue;
        // un point trop long est coupé en quinconce (les coupes décalées d'une ligne à l'autre)
        const nb = Math.max(1, Math.ceil(L / LM));
        const cuts = [a];
        if (nb > 1) {
          const seg = L / nb, dec = (((k * 0.382) % 1) - 0.5) * seg * 0.7;
          for (let j = 1; j < nb; j++) cuts.push(a + seg * j + dec);
        }
        cuts.push(b);
        for (let j = 0; j < cuts.length - 1; j++) {
          const ta = cuts[j], tb = cuts[j + 1];
          if (tb - ta < 0.6) continue;
          const xa = nx * d + ux * ta, ya = ny * d + uy * ta, xb = nx * d + ux * tb, yb = ny * d + uy * tb;
          pts.push({ x1: xa / RES, y1: ya / RES, x2: xb / RES, y2: yb / RES, k, l: lettreDe((xa + xb) / 2) });
        }
      }
    }
    // l'ordre de la machine : lettre par lettre ; dans une lettre, ligne après ligne, en allers-retours
    pts.sort((p, q) => p.l - q.l || p.k - q.k || (p.k % 2 ? q.y1 - p.y1 : p.y1 - q.y1));
    pts.forEach((p, i) => {
      if (p.k % 2) { const x = p.x1, y = p.y1; p.x1 = p.x2; p.y1 = p.y2; p.x2 = x; p.y2 = y; } // (l'aiguille repart d'où elle est)
      p.r = hasard(i + 1);
    });
    const geo = { points: pts, lettres, W, H, taille: t, sx, ux, uy, nx, ny };
    if (cache.size > 24) cache.clear();
    cache.set(cle, geo);
    return geo;
  }

  /* le dessin d'un point : dessous (ombre, trous), dessus (le fil) */
  function dessinerPoints(gO, gF, geo, i0, i1, fil) {
    const F = FILS[fil] || FILS.jaune;
    const w = 0.72; // l'épaisseur du fil (px CSS) : un peu plus que l'écart, les fils se touchent
    const { nx, ny } = geo;
    const b = F.base, s = F.sombre, c = F.clair;
    for (let i = i0; i < i1; i++) {
      const p = geo.points[i];
      // dessous : le cuir tassé autour du fil, l'ombre portée (la lumière vient d'en haut à gauche), les trous
      gO.lineCap = 'round';
      gO.strokeStyle = 'rgba(24, 12, 4, 0.08)';
      gO.lineWidth = w + 1.6;
      gO.beginPath(); gO.moveTo(p.x1, p.y1); gO.lineTo(p.x2, p.y2); gO.stroke();
      gO.strokeStyle = 'rgba(16, 8, 3, 0.46)';
      gO.lineWidth = w + 0.4;
      gO.beginPath(); gO.moveTo(p.x1 + 0.4, p.y1 + 0.6); gO.lineTo(p.x2 + 0.4, p.y2 + 0.6); gO.stroke();
      const lg = Math.hypot(p.x2 - p.x1, p.y2 - p.y1) || 1, dx = (p.x2 - p.x1) / lg, dy = (p.y2 - p.y1) / lg; // (les trous : juste au-delà des bouts du fil)
      gO.fillStyle = 'rgba(12, 6, 2, 0.6)';
      gO.beginPath(); gO.arc(p.x1 - dx * 0.3, p.y1 - dy * 0.3, 0.3, 0, 6.2832); gO.fill();
      gO.beginPath(); gO.arc(p.x2 + dx * 0.3, p.y2 + dy * 0.3, 0.3, 0, 6.2832); gO.fill();
      // dessus : le fil ; un ton à peine différent d'un point à l'autre, et des bandes douces (le fil est retors)
      const k = 0.93 + p.r * 0.14;
      gF.lineCap = 'round';
      gF.strokeStyle = `rgb(${Math.min(255, b[0] * k) | 0},${Math.min(255, b[1] * k) | 0},${Math.min(255, b[2] * k) | 0})`;
      gF.lineWidth = w;
      gF.beginPath(); gF.moveTo(p.x1, p.y1); gF.lineTo(p.x2, p.y2); gF.stroke();
      // son ombre propre (côté opposé à la lumière), son reflet (côté lumière, le long du point)
      gF.strokeStyle = `rgba(${s[0]},${s[1]},${s[2]},0.5)`;
      gF.lineWidth = w * 0.36;
      gF.beginPath(); gF.moveTo(p.x1 + nx * w * 0.3, p.y1 + ny * w * 0.3); gF.lineTo(p.x2 + nx * w * 0.3, p.y2 + ny * w * 0.3); gF.stroke();
      gF.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.4 + p.r * 0.3})`;
      gF.lineWidth = w * 0.26;
      gF.beginPath();
      gF.moveTo(p.x1 + (p.x2 - p.x1) * 0.06 - nx * w * 0.17, p.y1 + (p.y2 - p.y1) * 0.06 - ny * w * 0.17);
      gF.lineTo(p.x1 + (p.x2 - p.x1) * 0.94 - nx * w * 0.17, p.y1 + (p.y2 - p.y1) * 0.94 - ny * w * 0.17);
      gF.stroke();
    }
  }

  const MARGE = 4; // px CSS autour de la boîte (l'ombre du fil déborde)
  /** les deux calques d'un hôte (créés une fois ; retaillés à sa taille) */
  function calques(hote) {
    let L = hote._broderie;
    const r = hote.getBoundingClientRect();
    const W = Math.round(hote.clientWidth || r.width), H = Math.round(hote.clientHeight || r.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (!L || !L.o.isConnected) {
      hote.querySelectorAll('canvas.broderie').forEach((x) => x.remove());
      const mk = (cl) => { const c = document.createElement('canvas'); c.className = 'broderie ' + cl; c.setAttribute('aria-hidden', 'true'); c.style.cssText = `position:absolute;left:${-MARGE}px;top:${-MARGE}px;pointer-events:none`; hote.appendChild(c); return c; };
      L = hote._broderie = { o: mk('broderie-dessous'), f: mk('broderie-fil'), W: 0, H: 0, dpr: 0, geo: null, n: 0 };
    }
    if (L.W !== W || L.H !== H || L.dpr !== dpr) {
      [L.o, L.f].forEach((c) => {
        c.width = Math.round((W + 2 * MARGE) * dpr); c.height = Math.round((H + 2 * MARGE) * dpr);
        c.style.width = W + 2 * MARGE + 'px'; c.style.height = H + 2 * MARGE + 'px';
      });
      L.W = W; L.H = H; L.dpr = dpr; L.n = 0;
    }
    return L;
  }
  function effacer(L) {
    [L.o, L.f].forEach((c) => { const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); });
    L.n = 0;
  }
  function contextes(L) {
    const t = (c) => { const g = c.getContext('2d'); g.setTransform(L.dpr, 0, 0, L.dpr, MARGE * L.dpr, MARGE * L.dpr); return g; };
    return [t(L.o), t(L.f)];
  }
  function tracer(L, jusqua, fil) {
    if (jusqua < L.n) effacer(L);
    const [gO, gF] = contextes(L);
    dessinerPoints(gO, gF, L.geo, L.n, jusqua, fil);
    L.n = jusqua;
  }

  /** son de la machine, tant qu'elle pique */
  let sonMachine = 0;
  function machine(on) {
    clearInterval(sonMachine);
    sonMachine = 0;
    if (!on) return;
    CO.sfx.play('sew', { n: 8 });
    sonMachine = setInterval(() => CO.sfx.play('sew', { n: 8 }), 560);
  }

  /**
   * coud le nom dans l'hôte (un bloc positionné : les calques s'y posent)
   * o : { anime = true, duree (ms, sinon selon le nombre de points), fil: 'jaune' | 'creme', surPoint(i, n, x, y) }
   */
  async function broder(hote, nom, o = {}) {
    if (!hote) return;
    const fil = o.fil || 'jaune';
    const fam = o.famille || var_('--main', "'Shantell Sans', cursive");
    await policePrete(fam, o.poids || 800, nom);
    const L = calques(hote);
    const jeton = (L.jeton = (L.jeton || 0) + 1); // (une nouvelle couture annule la précédente)
    L.nom = nom;
    if (L.W < 12 || L.H < 8) { L.geo = null; L.n = 0; return; } // (l'hôte n'a pas encore de taille : vue cachée ; retailler() coudra)
    L.geo = geometrie(nom, L.W, L.H, o);
    hote.classList.remove('vide');
    effacer(L);
    const N = L.geo.points.length;
    if (!o.anime || CO.reduced || !N) { tracer(L, N, fil); return; }
    // la machine : ≈ 125 points/s, entre 2,2 et 3,6 s ; une petite pause quand elle saute d'une lettre à l'autre
    // (CO.ralenti : le banc d'essai la ralentit pour les captures)
    const duree = (o.duree || Math.min(3600, Math.max(2200, N * 8))) * (CO.ralenti || 1);
    const sauts = [];
    for (let i = 1; i < N; i++) if (L.geo.points[i].l !== L.geo.points[i - 1].l) sauts.push(i);
    const pause = 70 * (CO.ralenti || 1);
    const utile = Math.max(400, duree - sauts.length * pause);
    const tempsDe = (i) => { let n = 0; for (const s of sauts) if (s <= i) n++; return (i / N) * utile + n * pause; };
    const aiguille = document.createElement('span');
    aiguille.className = 'broderie-aiguille';
    hote.appendChild(aiguille);
    machine(true);
    await new Promise((resolve) => {
      const t0 = performance.now();
      let i = 0;
      const pas = (now) => {
        if (L.jeton !== jeton || !hote.isConnected) { resolve(); return; }
        const t = now - t0;
        let j = i;
        while (j < N && tempsDe(j) <= t) j++;
        if (j > i) {
          tracer(L, j, fil);
          i = j;
          const p = L.geo.points[Math.min(N - 1, j - 1)];
          aiguille.style.transform = `translate(${p.x2.toFixed(2)}px, ${p.y2.toFixed(2)}px)`;
          if (o.surPoint) o.surPoint(j, N, p.x2, p.y2);
        }
        if (i >= N) { resolve(); return; }
        requestAnimationFrame(pas);
      };
      requestAnimationFrame(pas);
    });
    machine(false);
    aiguille.remove();
    if (L.jeton === jeton && L.n < N) tracer(L, N, fil);
  }

  /** défait la couture : les points partent à l'envers, vite (le découd-vite) */
  async function decoudre(hote, o = {}) {
    const L = hote && hote._broderie;
    if (!L || !L.geo || !L.n) return;
    const jeton = (L.jeton = (L.jeton || 0) + 1);
    const N = L.n, fil = o.fil || 'jaune';
    if (CO.reduced) { effacer(L); return; }
    CO.sfx.play('snip');
    CO.sfx.play('tear', { dur: 0.35, delay: 90 });
    const duree = o.duree || 620;
    await new Promise((resolve) => {
      const t0 = performance.now();
      const pas = (now) => {
        if (L.jeton !== jeton || !hote.isConnected) { resolve(); return; }
        const u = Math.min(1, (now - t0) / duree);
        const reste = Math.round(N * (1 - u * u));
        effacer(L);
        tracer(L, reste, fil);
        if (u >= 1) { resolve(); return; }
        requestAnimationFrame(pas);
      };
      requestAnimationFrame(pas);
    });
    if (L.jeton === jeton) effacer(L);
  }

  /** redessine (sans animation) la couture d'un hôte à sa nouvelle taille */
  function retailler(hote, o = {}) {
    const L = hote && hote._broderie;
    if (!L || !L.nom) return;
    const W = Math.round(hote.clientWidth), H = Math.round(hote.clientHeight);
    if (W === L.W && H === L.H && L.geo) return;
    broder(hote, L.nom, Object.assign({}, o, { anime: false }));
  }

  CO.Compte = { get, creer, modifier, oublier, ouvrir, valider, broder, decoudre, retailler, geometrie, telJoli };
})();
