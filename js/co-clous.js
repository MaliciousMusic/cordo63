/* ==========================================================================
   Cordo 63 — la carte à clous (fidélité) et le code de l'atelier
   Une carte de cuir tanné, surpiquée, le logo frappé à froid : à chaque réparation, Clément
   y plante un clou de laiton, avec son code à 4 chiffres, sur le téléphone du client (même
   système que Café Laitue, Kookies, L'Armoire : 5 essais puis une minute de pause, 5 clous
   au plus par passage). Dix clous = un cadeau, validé par le même code.
   Le même pavé ouvre l'espace atelier (co-pro.js).
   Maquette : la carte vit sur l'appareil ; en production, côté serveur.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const GOAL = (CO.FIDELITE && CO.FIDELITE.objectif) || 10;

  const PIN = {
    // Code de l'atelier (4 chiffres) : seule l'empreinte SHA-256 de `${salt}:${code}` est publiée.
    // Pour le changer : node tools/set-pin.mjs 1234
    salt: 'cordo63-mazet',
    pinHash: '1719540ca01a47e110192896e379a731ef256435e4e5bf92c5219e9aab8229f0',
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
          else if (code.length < 4) code += b.dataset.k;
          dessiner();
          if (code.length === 4) setTimeout(essayer, 120);
        };
        const clavier = (e) => {
          if (!$('#feuille-pin').classList.contains('is-open')) return;
          if (/^\d$/.test(e.key) && code.length < 4) { code += e.key; CO.sfx.play('key'); dessiner(); if (code.length === 4) setTimeout(essayer, 120); }
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

  function rendre(nouveaux = 0) {
    const box = $('#cuir');
    if (!box) return;
    const c = carte();
    const n = Math.min(c.clous, GOAL);
    const neuf = (i) => i >= n - nouveaux;
    const clou = (i) => (CO.Clouage
      ? (neuf(i) ? '' : CO.Clouage.tete(i, c.id)) // (les nouveaux : ce sont les mains de Clément qui les plantent)
      : `<i class="clou${neuf(i) ? ' frappe' : ''}" style="animation-delay:${Math.max(0, i - (n - nouveaux)) * 0.42}s"></i>`);
    box.innerHTML = `<div class="cuir-logo" aria-hidden="true"></div>
      <div class="cuir-grille">${Array.from({ length: GOAL }, (_, i) => `<span class="trou-clou">${i < n ? clou(i) : ''}</span>`).join('')}</div>
      <span class="cuir-num">${CO.esc(c.id)}</span>
      ${n >= GOAL && !(CO.Clouage && nouveaux) ? `<div class="cuir-plein"><div><b>Offert !</b><span>${CO.esc(CO.FIDELITE.cadeau)}</span></div></div>` : ''}`;
    box.setAttribute('aria-label', `La carte à clous : ${n} clou${n > 1 ? 's' : ''} sur ${GOAL}` + (n >= GOAL ? ', le cadeau est à retirer' : ''));
    const logo = $('.cuir-logo', box);
    if (logo && CO.logo) logo.appendChild(CO.logo({ couleur: 'currentColor' }));
    const b = $('#clous-valider');
    if (b) b.innerHTML = n >= GOAL ? '<svg aria-hidden="true"><use href="#i-etoile"/></svg> Valider le cadeau' : '<svg aria-hidden="true"><use href="#i-cadenas"/></svg> Faire planter un clou';
    const num = $('#clous-num');
    if (num) num.textContent = c.cadeaux ? `Déjà ${c.cadeaux} carte${c.cadeaux > 1 ? 's' : ''} remplie${c.cadeaux > 1 ? 's' : ''}, merci !` : '';
  }

  async function valider() {
    const c = carte();
    const plein = c.clous >= GOAL;
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
      const cuir = $('#cuir');
      if (cuir && CO.scrollTo) { CO.scrollTo(cuir, 120); await CO.wait(CO.reduced ? 0 : 380); } // la carte bien en vue avant que les mains arrivent
      const cases = [...document.querySelectorAll('#cuir .trou-clou')].slice(c.clous - n, c.clous);
      await CO.Clouage.enfoncer(cases, { index: cases.map((_, k) => c.clous - n + k), carteId: c.id });
      if (c.clous >= GOAL) rendre(); // « Offert ! » : une fois le dernier clou planté
    } else for (let i = 0; i < n; i++) CO.sfx.play('nail', { delay: 60 + i * 420, i: c.clous - n + i });
    setTimeout(() => {
      if (c.clous >= GOAL) { CO.sfx.play('chime'); CO.toast('Dix clous ! ' + CO.FIDELITE.cadeau[0].toUpperCase() + CO.FIDELITE.cadeau.slice(1) + '.', 4200); }
      else CO.toast(`${n} clou${n > 1 ? 's' : ''} de plus : ${c.clous} sur ${GOAL}.`);
    }, CO.Clouage ? 150 : 200 + n * 420);
  }

  CO.Clous = {
    init() {
      const obj = $('#clous-objectif');
      if (obj) obj.textContent = GOAL === 10 ? 'Dix clous' : GOAL + ' clous';
      const cad = $('#clous-cadeau');
      if (cad) cad.textContent = CO.FIDELITE.cadeau;
      rendre();
      const b = $('#clous-valider');
      if (b) b.addEventListener('click', valider);
      // les mains et le maillet se calculent en avance, dès qu'on ouvre Mes tickets
      CO.on('view', (v) => { if (v === 'tickets' && CO.Clouage && CO.Clouage.preparer) setTimeout(() => CO.Clouage.preparer(), 600); });
    },
  };
})();
