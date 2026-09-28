/* ==========================================================================
   Cordo 63 — la carte à clous (fidélité) et le code de l'atelier
   Une carte de cuir tanné, surpiquée, le logo frappé à froid : à chaque réparation, Clément
   y plante un clou de laiton, avec son code à 6 chiffres, sur le téléphone du client (même
   système que Café Laitue, Kookies, L'Armoire : 5 essais puis une minute de pause, 5 clous
   au plus par passage). Dix clous = un cadeau, validé par le même code.
   Le même pavé ouvre l'espace atelier (co-pro.js).
   La carte est posée sur le tapis de découpe de l'établi, vue de dessus, avec le maillet et la
   coupelle de clous ; sous le CORDO63, le nom du client est cousu (js/co-compte.js). Sans compte,
   « Faire planter un clou » ouvre d'abord la fiche : le nom est cousu, puis le code.
   Maquette : la carte vit sur l'appareil ; en production, côté serveur.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const GOAL = (CO.FIDELITE && CO.FIDELITE.objectif) || 10;

  const CHIFFRES = 6; // le code de l'atelier a six chiffres
  const PIN = {
    // Code de l'atelier (6 chiffres) : seule l'empreinte SHA-256 de `${salt}:${code}` est publiée.
    // Pour le changer : node tools/set-pin.mjs 123456
    salt: 'cordo63-mazet',
    pinHash: 'ffffbafb0750350ba1a0885f45695f2c25b988c5553ae8c6aeac876a481467d0',
    maxParPassage: 5,
  };

  /* ---------- SHA-256 (crypto.subtle si le contexte est sûr ; sinon ce petit calcul) ---------- */
  function sha256js(msg) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = new TextEncoder().encode(msg);
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb);
    m.set(bytes);
    m[l] = 0x80;
    const bits = l * 8;
    for (let i = 0; i < 8; i++) m[nb - 1 - i] = Math.floor(bits / Math.pow(2, 8 * i)) & 255;
    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const w = new Uint32Array(64);
    const ror = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = H.map((x, i) => (x + [a, b, c, d, e, f, g, h][i]) | 0);
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  async function sha(s) {
    try {
      if (window.crypto && crypto.subtle && window.isSecureContext) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* repli */ }
    return sha256js(s);
  }

  /* ---------- le pavé du code (feuille #feuille-pin) ---------- */
  let essais = 0, bloqueJusqua = 0;
  CO.Pin = {
    /** demande le code ; { titre, aide, qte: bool } → Promise<{ ok, n }> */
    demander({ titre = 'Code de l’atelier', aide = 'Tendez votre téléphone à Clément.', qte = false, max = PIN.maxParPassage } = {}) {
      return new Promise((resolve) => {
        let code = '', n = 1, fini = false;
        $('#pin-titre').textContent = titre;
        $('#pin-aide').textContent = aide;
        $('#pin-msg').textContent = '';
        const q = $('#pin-qte');
        q.hidden = !qte;
        const majN = () => { $('#pq-n').textContent = n + (n > 1 ? ' clous' : ' clou'); };
        majN();
        q.querySelector('.pq-moins').onclick = () => { n = Math.max(1, n - 1); majN(); };
        q.querySelector('.pq-plus').onclick = () => { n = Math.min(max, n + 1); majN(); };
        const pts = $('#pin-points');
        const dessiner = () => [...pts.children].forEach((i, k) => i.classList.toggle('on', k < code.length));
        const pave = $('#pin-pave');
        pave.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, 'x'].map((k) => k === '' ? '<button type="button" class="pp-vide" tabindex="-1" aria-hidden="true"></button>'
          : k === 'x' ? '<button type="button" class="pp-eff" data-k="x" aria-label="Effacer" data-sfx="none"><svg aria-hidden="true"><use href="#i-retour"/></svg></button>'
            : `<button type="button" data-k="${k}" data-sfx="none">${k}</button>`).join('');
        dessiner();
        const essayer = async () => {
          if (Date.now() < bloqueJusqua) { $('#pin-msg').textContent = 'Trop d’essais : patientez une minute.'; code = ''; dessiner(); return; }
          const ok = PIN.pinHash && (await sha(`${PIN.salt}:${code}`)) === PIN.pinHash;
          if (!ok) {
            essais++;
            CO.sfx.play('nope');
            pts.classList.remove('faux'); void pts.offsetWidth; pts.classList.add('faux');
            code = ''; dessiner();
            $('#pin-msg').textContent = essais >= 5 ? 'Code incorrect. Réessayez dans une minute.' : 'Code incorrect.';
            if (essais >= 5) { bloqueJusqua = Date.now() + 60000; essais = 0; }
            return;
          }
          essais = 0;
          fini = true;
          CO.sfx.play('yes');
          CO.closeSheet('#feuille-pin');
          resolve({ ok: true, n });
        };
        pave.onclick = (e) => {
          const b = e.target.closest('[data-k]');
          if (!b) return;
          CO.sfx.play('key');
          if (b.dataset.k === 'x') code = code.slice(0, -1);
          else if (code.length < CHIFFRES) code += b.dataset.k;
          dessiner();
          if (code.length === CHIFFRES) setTimeout(essayer, 120);
        };
        const clavier = (e) => {
          if (!$('#feuille-pin').classList.contains('is-open')) return;
          if (/^\d$/.test(e.key) && code.length < CHIFFRES) { code += e.key; CO.sfx.play('key'); dessiner(); if (code.length === CHIFFRES) setTimeout(essayer, 120); }
          else if (e.key === 'Backspace') { code = code.slice(0, -1); dessiner(); }
        };
        document.addEventListener('keydown', clavier);
        CO.openSheet('#feuille-pin', () => {
          document.removeEventListener('keydown', clavier);
          if (!fini) resolve({ ok: false, n: 0 });
        });
      });
    },
  };

  /* ---------- la carte ---------- */
  function carte() {
    let c = CO.store.get('carte', null);
    if (!c || typeof c !== 'object' || !c.id) {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let id = 'C63-';
      for (let i = 0; i < 4; i++) id += a[Math.floor(Math.random() * a.length)];
      c = { id, clous: 0, cadeaux: 0, historique: [] };
      CO.store.set('carte', c);
    }
    return c;
  }
  const compte = () => (CO.Compte ? CO.Compte.get() : null);

  /* ---------- l'établi autour de la carte : l'usure du tapis, sa règle ; la coupelle de clous, le maillet ----------
     (SVG dessinés une fois ; vus de dessus, la lumière en haut à gauche comme sur l'établi et les mains) */
  const f2 = (v) => Math.round(v * 100) / 100;
  const FINIS = { // [reflet, clair, moyen, sombre] : les têtes de co-clouage.js
    laiton: ['#FFF4C8', '#E7C066', '#A77D34', '#5B3E15'], cuivre: ['#FFE3CE', '#DD915E', '#9D512C', '#4E2412'],
    bronze: ['#F6DFB3', '#BB8D52', '#7C572A', '#3E2A12'], acier: ['#FFFFFF', '#D3D7DA', '#8D9399', '#454A4F'],
    fer: ['#AEB0B3', '#595B5F', '#2D2E31', '#121315'], dore: ['#FFF9D0', '#F3CC4D', '#BB8C1E', '#6D4C0A'],
  };
  const gradsFinis = (p) => Object.entries(FINIS).map(([n, c]) => `<radialGradient id="${p}${n}" cx=".36" cy=".32" r=".78"><stop offset="0" stop-color="${c[0]}"/><stop offset=".3" stop-color="${c[1]}"/><stop offset=".72" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`).join('');
  /** l'usure du tapis : coupes au cutter (le long du réglet), rayures, taches de teinture et de colle */
  function usure() {
    const r = CO.rng(631);
    let s = '';
    const coupe = (x, y, a, L, fort) => {
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      s += `<path d="M${f2(x)} ${f2(y)}L${f2(x2)} ${f2(y2)}" stroke="rgba(214,236,204,${fort ? 0.2 : 0.11})" stroke-width="${fort ? 0.9 : 0.6}"/>`;
      if (fort) s += `<path d="M${f2(x + 0.6)} ${f2(y + 0.8)}L${f2(x2 + 0.6)} ${f2(y2 + 0.8)}" stroke="rgba(6,20,14,.28)" stroke-width=".7"/>`;
    };
    for (let i = 0; i < 8; i++) { const dir = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4][Math.floor(r() * 4)] + (r() - 0.5) * 0.08; coupe(r() * 600, r() * 700, dir, 120 + r() * 300, true); }
    for (let i = 0; i < 46; i++) coupe(r() * 600, r() * 700, r() * Math.PI * 2, 8 + r() * 42, false);
    for (let i = 0; i < 7; i++) s += `<ellipse cx="${f2(r() * 600)}" cy="${f2(r() * 700)}" rx="${f2(8 + r() * 34)}" ry="${f2(6 + r() * 22)}" fill="url(#tp-tache)" opacity="${f2(0.35 + r() * 0.5)}"/>`;
    for (let i = 0; i < 3; i++) s += `<ellipse cx="${f2(r() * 600)}" cy="${f2(r() * 700)}" rx="${f2(3 + r() * 6)}" ry="${f2(2 + r() * 5)}" fill="rgba(96,44,22,.3)"/>`;
    for (let i = 0; i < 4; i++) { const x = r() * 600, y = r() * 700, rx = 4 + r() * 12; s += `<ellipse cx="${f2(x)}" cy="${f2(y)}" rx="${f2(rx)}" ry="${f2(rx * (0.4 + r() * 0.5))}" fill="rgba(236,242,222,.07)"/><ellipse cx="${f2(x - rx * 0.3)}" cy="${f2(y - rx * 0.2)}" rx="${f2(rx * 0.3)}" ry="${f2(rx * 0.12)}" fill="rgba(255,255,255,.1)"/>`; }
    s += '<path d="M420 120a90 90 0 0 1 60 150" stroke="rgba(214,236,204,.12)" stroke-width=".7" fill="none"/>';
    return `<svg class="tapis-usure" viewBox="0 0 600 700" preserveAspectRatio="xMinYMin slice" aria-hidden="true" focusable="false"><defs><radialGradient id="tp-tache"><stop offset="0" stop-color="#0B1E16" stop-opacity=".5"/><stop offset=".6" stop-color="#0B1E16" stop-opacity=".22"/><stop offset="1" stop-color="#0B1E16" stop-opacity="0"/></radialGradient></defs>${s}</svg>`;
  }
  /** la coupelle de laiton, pleine de clous (les mêmes têtes que ceux que Clément plante) */
  function coupelle() {
    const r = CO.rng(1019), fins = Object.keys(FINIS);
    let c = '';
    for (let i = 0; i < 6; i++) { // des clous couchés, sous le tas : la tige, la tête vue de profil
      const a = r() * 6.283, d = r() * 15, x = Math.cos(a) * d, y = Math.sin(a) * d, L = 10 + r() * 5;
      c += `<g transform="translate(${f2(x)} ${f2(y)}) rotate(${f2(r() * 360)})"><path d="M.6 .9H${f2(L)}" stroke="rgba(0,0,0,.4)" stroke-width="2" stroke-linecap="round"/><path d="M0 0H${f2(L)}" stroke="#44484D" stroke-width="1.8" stroke-linecap="round"/><path d="M0 -.35H${f2(L - 1)}" stroke="#D2D6DA" stroke-width=".55" stroke-linecap="round"/><rect x="-1.5" y="-3.7" width="2.7" height="7.4" rx="1.2" fill="url(#tp-f-${fins[i % fins.length]})"/></g>`;
    }
    for (let i = 0; i < 17; i++) { // les têtes, en tas
      const a = r() * 6.283, d = Math.sqrt(r()) * 19, x = Math.cos(a) * d, y = Math.sin(a) * d, rr = 2.7 + r() * 1.4;
      const f = fins[Math.floor(r() * fins.length)], hx = x - rr * 0.36, hy = y - rr * 0.4;
      c += `<circle cx="${f2(x + 0.8)}" cy="${f2(y + 1.1)}" r="${f2(rr)}" fill="rgba(0,0,0,.45)"/><circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(rr)}" fill="url(#tp-f-${f})"/><ellipse cx="${f2(hx)}" cy="${f2(hy)}" rx="${f2(rr * 0.34)}" ry="${f2(rr * 0.19)}" transform="rotate(-38 ${f2(hx)} ${f2(hy)})" fill="#fff" fill-opacity=".55"/>`;
    }
    return `<div class="coupelle"><svg viewBox="-36 -36 72 72" focusable="false"><defs>${gradsFinis('tp-f-')}
        <radialGradient id="tp-om"><stop offset=".72" stop-color="#060301" stop-opacity=".55"/><stop offset="1" stop-color="#060301" stop-opacity="0"/></radialGradient>
        <radialGradient id="tp-bord" cx=".36" cy=".3" r=".78"><stop offset="0" stop-color="#F6E3AE"/><stop offset=".42" stop-color="#C9A25A"/><stop offset=".78" stop-color="#8A6A2E"/><stop offset="1" stop-color="#4E3A16"/></radialGradient>
        <radialGradient id="tp-creux" cx=".62" cy=".66" r=".72"><stop offset="0" stop-color="#8E7040"/><stop offset=".55" stop-color="#5E4626"/><stop offset="1" stop-color="#3A2A14"/></radialGradient>
      </defs><ellipse cx="4.5" cy="6.5" rx="36" ry="35" fill="url(#tp-om)"/><circle r="32" fill="url(#tp-bord)"/><circle r="27" fill="url(#tp-creux)"/><circle r="27" fill="none" stroke="rgba(20,12,4,.5)" stroke-width="1.5"/>${c}<path d="M-27 -11A29 29 0 0 1 -9 -28" stroke="#FFF3CF" stroke-opacity=".65" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg></div>`;
  }
  /** deux clous tombés à côté */
  function clousEpars() {
    const clou = (x, y, a, L, f) => `<g transform="translate(${x} ${y}) rotate(${a})"><path d="M1 1.5H${L}" stroke="rgba(0,0,0,.42)" stroke-width="2.2" stroke-linecap="round"/><path d="M0 0H${L}" stroke="#44484D" stroke-width="1.9" stroke-linecap="round"/><path d="M0 -.4H${L - 1.5}" stroke="#D6DADE" stroke-width=".6" stroke-linecap="round"/><path d="M-3.4 -4.4Q-5.6 0 -3.4 4.4H0V-4.4Z" fill="url(#tp-e-${f})"/></g>`;
    return `<div class="clous-epars"><svg viewBox="0 0 60 40" focusable="false"><defs>${gradsFinis('tp-e-')}</defs>${clou(10, 12, 14, 15, 'laiton')}${clou(46, 30, 205, 14, 'cuivre')}</svg></div>`;
  }
  /** le maillet de cordonnier, couché sur le tapis : le manche de hêtre (patiné à la prise), la tête de cuir brut
      roulé en travers (un cylindre sur le flanc : éclairé à gauche, ses deux faces de frappe usées, la lisière du cuir) */
  function maillet() {
    return `<div class="maillet"><svg viewBox="0 0 232 84" focusable="false"><defs>
        <linearGradient id="tp-manche" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6BD8A"/><stop offset=".3" stop-color="#C99D68"/><stop offset=".64" stop-color="#A67646"/><stop offset="1" stop-color="#6A4627"/></linearGradient>
        <linearGradient id="tp-tete" x1="0" x2="1"><stop offset="0" stop-color="#C9955A"/><stop offset=".16" stop-color="#F2D39C"/><stop offset=".4" stop-color="#DDB06C"/><stop offset=".74" stop-color="#B07A38"/><stop offset="1" stop-color="#63401A"/></linearGradient>
        <linearGradient id="tp-faces" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A2C10" stop-opacity=".55"/><stop offset=".1" stop-color="#4A2C10" stop-opacity="0"/><stop offset=".9" stop-color="#4A2C10" stop-opacity="0"/><stop offset="1" stop-color="#4A2C10" stop-opacity=".6"/></linearGradient>
      </defs>
      <g fill="#050201" transform="translate(7 9)" opacity=".3"><rect x="6" y="31" width="176" height="22" rx="11"/><rect x="172" y="3" width="54" height="80" rx="11"/></g>
      <g fill="#050201" transform="translate(3.5 5)" opacity=".3"><rect x="8" y="33" width="172" height="18" rx="9"/><rect x="175" y="6" width="48" height="73" rx="8"/></g>
      <path d="M17 33H182V51H17A9 9 0 0 1 17 33Z" fill="url(#tp-manche)"/>
      <rect x="8" y="33" width="80" height="18" rx="9" fill="#3A2210" opacity=".2"/>
      <path d="M20 37.2C64 36.4 118 37.8 178 37M24 44.4C74 43.8 126 45.2 178 44.6M44 40.9C88 40.4 132 41.5 178 41.1" stroke="#6A4020" stroke-opacity=".28" stroke-width=".7" fill="none"/>
      <path d="M18 35.6H178" stroke="#FFF0D8" stroke-opacity=".4" stroke-width="1.7" stroke-linecap="round"/>
      <rect x="168" y="33" width="10" height="18" fill="#2A1606" opacity=".22"/>
      <rect x="176" y="6" width="46" height="72" rx="7" fill="url(#tp-tete)"/>
      <rect x="176" y="6" width="46" height="72" rx="7" fill="url(#tp-faces)"/>
      <path d="M199.5 7.5C198.6 24 200.6 52 199.2 76.5" stroke="#5A3410" stroke-opacity=".42" stroke-width=".9" fill="none"/>
      <path d="M200.4 7.5C199.5 24 201.5 52 200.1 76.5" stroke="#FFE8BE" stroke-opacity=".25" stroke-width=".6" fill="none"/>
      <path d="M180 22H220M180 39.5H220M180 60H220" stroke="#6E4418" stroke-opacity=".13" stroke-width=".8"/>
      <path d="M183.5 10V74" stroke="#FFF6E0" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
    </svg></div>`;
  }
  function decor() {
    const tapis = $('#tapis'), objets = $('#tapis-objets');
    if (!tapis || tapis.childElementCount) return;
    tapis.innerHTML = `<span class="tapis-regle">${Array.from({ length: 31 }, (_, i) => `<span>${i}</span>`).join('')}</span>${usure()}`;
    if (objets) objets.innerHTML = coupelle() + clousEpars() + maillet();
  }

  /* ---------- le nom sous le logo : cousu, ou la ligne à coudre (« votre nom ici ») ---------- */
  function nom(box, cpt, { coudre = false } = {}) {
    const hote = $('.cuir-nom', box);
    if (!hote) return;
    if (cpt) {
      hote.classList.remove('vide');
      if (!coudre && CO.Compte) CO.Compte.broder(hote, cpt.nom, { anime: false });
      return;
    }
    hote.classList.add('vide');
    hote.innerHTML = '<span class="cuir-nom-vide">votre nom ici</span>';
    $('.cuir-nom-vide', hote).addEventListener('click', () => { if (CO.Compte) CO.Compte.ouvrir(); });
  }

  function rendre(nouveaux = 0, o = {}) {
    const box = $('#cuir');
    if (!box) return;
    const c = carte();
    const cpt = compte();
    const n = Math.min(c.clous, GOAL);
    const neuf = (i) => i >= n - nouveaux;
    const clou = (i) => (CO.Clouage
      ? (neuf(i) ? '' : CO.Clouage.tete(i, c.id)) // (les nouveaux : ce sont les mains de Clément qui les plantent)
      : `<i class="clou${neuf(i) ? ' frappe' : ''}" style="animation-delay:${Math.max(0, i - (n - nouveaux)) * 0.42}s"></i>`);
    box.innerHTML = `<div class="cuir-logo" aria-hidden="true"></div>
      <div class="cuir-nom" aria-hidden="true"></div>
      <div class="cuir-grille">${Array.from({ length: GOAL }, (_, i) => `<span class="trou-clou">${i < n ? clou(i) : ''}</span>`).join('')}</div>
      <span class="cuir-num">${CO.esc(c.id)}</span>
      ${n >= GOAL && !(CO.Clouage && nouveaux) ? `<div class="cuir-plein"><div><b>Offert !</b><span>${CO.esc(CO.FIDELITE.cadeau)}</span></div></div>` : ''}`;
    box.setAttribute('aria-label', `La carte à clous${cpt ? ' de ' + cpt.nom : ''} : ${n} clou${n > 1 ? 's' : ''} sur ${GOAL}` + (n >= GOAL ? ', le cadeau est à retirer' : ''));
    const logo = $('.cuir-logo', box);
    if (logo && CO.logo) logo.appendChild(CO.logo({ couleur: 'currentColor' }));
    nom(box, cpt, o);
    majBoutons();
  }

  /** les boutons sous la carte, la ligne du compte */
  function majBoutons() {
    const c = carte(), n = Math.min(c.clous, GOAL), cpt = compte();
    const creer = $('#compte-creer');
    if (creer) creer.hidden = !!cpt || n >= GOAL;
    const b = $('#clous-valider');
    if (b) {
      b.innerHTML = n >= GOAL ? '<svg aria-hidden="true"><use href="#i-etoile"/></svg> Valider le cadeau' : '<svg aria-hidden="true"><use href="#i-cadenas"/></svg> Faire planter un clou';
      b.className = 'btn ' + (cpt || n >= GOAL ? 'btn-ticket' : 'btn-craie');
    }
    const num = $('#clous-num');
    if (num) num.textContent = c.cadeaux ? `Déjà ${c.cadeaux} carte${c.cadeaux > 1 ? 's' : ''} remplie${c.cadeaux > 1 ? 's' : ''}, merci !` : '';
    const ligne = $('#clous-compte');
    if (ligne) {
      ligne.innerHTML = cpt ? `<span>Carte de <b>${CO.esc(cpt.nom)}</b> · ${CO.esc(cpt.tel)}</span><button class="lien-discret" type="button" id="compte-modifier" data-sfx="tap">Modifier</button>` : '';
      const m = $('#compte-modifier', ligne);
      if (m) m.addEventListener('click', () => { if (CO.Compte) CO.Compte.modifier(); });
    }
  }

  /** la taille d'un centimètre du tapis (la carte fait 25 cm pour les mains de Clément), le nom retaillé */
  function mesurer() {
    const cuir = $('#cuir'), zone = $('#tapis-zone');
    if (!cuir || !zone || !cuir.offsetWidth) return;
    zone.style.setProperty('--cm', (cuir.offsetWidth / 25).toFixed(3) + 'px');
    const hote = $('.cuir-nom', cuir);
    if (hote && compte() && !enCouture && CO.Compte) CO.Compte.retailler(hote);
  }

  /* ---------- le compte change : on coud le nom (ou on le découd) sous les yeux du client ---------- */
  let enCouture = null;
  async function coudreApres({ compte: cpt, avant, raison } = {}) {
    majBoutons();
    const box = $('#cuir');
    if (!box) return;
    const hote = () => $('.cuir-nom', box);
    await CO.wait(CO.reduced ? 60 : 460); // (la fiche se referme)
    const voir = async () => { if (CO.view === 'tickets' && CO.scrollTo) { CO.scrollTo(box, 110); await CO.wait(CO.reduced ? 0 : 480); } };
    if (raison === 'oublier') {
      await voir();
      if (hote()) await CO.Compte.decoudre(hote());
      rendre();
      CO.toast('Carte oubliée : le nom est décousu, le numéro effacé.');
      return;
    }
    if (!cpt) return;
    if (avant && avant.nom === cpt.nom) { rendre(); CO.toast('C’est noté : numéro mis à jour.'); return; }
    await voir();
    const h = hote();
    if (!h) return;
    if (avant && h._broderie && h._broderie.n) await CO.Compte.decoudre(h);
    h.innerHTML = '';
    h.classList.remove('vide');
    box.setAttribute('aria-label', box.getAttribute('aria-label').replace(/^La carte à clous( de [^:]*)?/, 'La carte à clous de ' + cpt.nom));
    await CO.Compte.broder(h, cpt.nom, { anime: true });
    CO.toast(avant ? `Recousu : « ${cpt.nom} ».` : 'C’est cousu : la carte est à votre nom !', 3000);
  }
  function surCompte(ev) {
    const p = coudreApres(ev).catch((e) => console.warn('couture', e));
    enCouture = p;
    p.then(() => { if (enCouture === p) enCouture = null; });
  }

  let occupe = false;
  async function valider() {
    if (occupe) return;
    occupe = true;
    try {
      if (enCouture) await enCouture;
      let c = carte();
      const plein = c.clous >= GOAL;
      // pas encore de compte : d'abord la fiche (le nom est cousu), puis le code
      if (!plein && CO.Compte && !compte()) {
        if (CO.Clouage) CO.Clouage.preparer(); // (les mains se calculent pendant qu'on remplit la fiche)
        const cpt = await CO.Compte.ouvrir({ suite: true });
        if (!cpt) return;
        await CO.wait(0);
        if (enCouture) await enCouture;
        await CO.wait(CO.reduced ? 0 : 250);
        c = carte();
      }
      if (CO.Clouage && !plein) CO.Clouage.preparer(); // les mains se calculent pendant que Clément tape son code
      const r = await CO.Pin.demander(plein
        ? { titre: 'Le cadeau', aide: 'Clément valide le cadeau avec son code.' }
        : { titre: 'Planter des clous', aide: 'Clément choisit le nombre de réparations et tape son code.', qte: true, max: Math.min(PIN.maxParPassage, GOAL - c.clous) });
      if (!r.ok) return;
      if (plein) {
        c.clous = 0;
        c.cadeaux = (c.cadeaux || 0) + 1;
        c.historique.push({ quoi: 'cadeau', date: new Date().toISOString() });
        CO.store.set('carte', c);
        CO.sfx.play('chime');
        CO.toast('Cadeau validé. Une nouvelle carte commence !');
        rendre();
        return;
      }
      const n = Math.min(r.n, GOAL - c.clous);
      c.clous += n;
      c.historique.push({ quoi: 'clous', n, date: new Date().toISOString() });
      CO.store.set('carte', c);
      rendre(n);
      if (CO.Clouage) {
        const cuir = $('#cuir'), zone = $('#tapis-zone');
        if (cuir && CO.scrollTo) { CO.scrollTo(cuir, 120); await CO.wait(CO.reduced ? 0 : 380); } // la carte bien en vue avant que les mains arrivent
        if (zone) zone.classList.add('cloue'); // (Clément prend le maillet posé sur le tapis)
        try {
          const cases = [...document.querySelectorAll('#cuir .trou-clou')].slice(c.clous - n, c.clous);
          await CO.Clouage.enfoncer(cases, { index: cases.map((_, k) => c.clous - n + k), carteId: c.id });
        } finally {
          if (zone) setTimeout(() => zone.classList.remove('cloue'), 150); // (il le repose)
        }
        if (c.clous >= GOAL) rendre(); // « Offert ! » : une fois le dernier clou planté
      } else for (let i = 0; i < n; i++) CO.sfx.play('nail', { delay: 60 + i * 420, i: c.clous - n + i });
      setTimeout(() => {
        if (c.clous >= GOAL) { CO.sfx.play('chime'); CO.toast('Dix clous ! ' + CO.FIDELITE.cadeau[0].toUpperCase() + CO.FIDELITE.cadeau.slice(1) + '.', 4200); }
        else CO.toast(`${n} clou${n > 1 ? 's' : ''} de plus : ${c.clous} sur ${GOAL}.`);
      }, CO.Clouage ? 150 : 200 + n * 420);
    } finally {
      occupe = false;
    }
  }

  CO.Clous = {
    init() {
      const obj = $('#clous-objectif');
      if (obj) obj.textContent = GOAL === 10 ? 'Dix clous' : GOAL + ' clous';
      const cad = $('#clous-cadeau');
      if (cad) cad.textContent = CO.FIDELITE.cadeau;
      decor();
      rendre();
      const b = $('#clous-valider');
      if (b) b.addEventListener('click', valider);
      const cr = $('#compte-creer');
      if (cr) cr.addEventListener('click', () => { if (CO.Compte) CO.Compte.ouvrir(); });
      CO.on('compte', surCompte);
      // les mains et le maillet se calculent en avance, dès qu'on ouvre Mes tickets
      CO.on('view', (v) => { if (v === 'tickets') { mesurer(); if (CO.Clouage && CO.Clouage.preparer) setTimeout(() => CO.Clouage.preparer(), 600); } });
      const cuir = $('#cuir');
      if (cuir && window.ResizeObserver) new ResizeObserver(() => mesurer()).observe(cuir);
      else window.addEventListener('resize', mesurer);
    },
  };
})();
