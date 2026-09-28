/* ==========================================================================
   Cordo 63 — Mes tickets : le mur de l'atelier, les souches pendues
   Le mur de pierre apparente (peint une fois pour une taille, au canvas) sous la lampe
   émaillée ; la planche de chêne et son étiquette Dymo ; les souches jaunes pendent aux
   crochets de la planche puis à des clous plantés dans les joints, au bout d'une ficelle,
   un peu de travers. Elles se balancent quand on défile ou qu'on les touche (un pendule
   amorti, calculé seulement tant qu'il bouge). Une paire prête : le papier vert, le tampon
   « PRÊTE » qui tombe. Pas de ticket : un crochet vide, le mot de Clément, et un ticket
   vierge pour déposer une paire. En bas du mur, une souche où l'on écrit le numéro d'un
   ticket papier. Aussi : le ticket en cours sur l'accueil, la pastille de l'onglet, la feuille
   d'un ticket (avancement daté, QR code à montrer à Clément, actions).
   CO.Suivi = { ouvrir(num), init() }
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  let ouvert = null; // le numéro affiché dans la feuille

  /* ======================================================================
     Le mur de pierre : des moellons chauds dans un mortier sombre (les couleurs du mur
     de la boutique, co-boutique-decor.js), dans la pénombre sauf sous la lampe
     ====================================================================== */
  const PIERRES = ['#9A8870', '#8B7A63', '#A7967C', '#7D6D59', '#B09F85', '#948269', '#857460', '#A08C70', '#8E8272', '#B5A78E', '#96806A', '#A99A84'];
  /** un grain (piqué clair et sombre) en petit carreau raccordable : peint une fois, posé en motif */
  const grains = {};
  function grain(nom, clair, sombre, n, graine) {
    if (grains[nom]) return grains[nom];
    const N = 96, c = document.createElement('canvas'), x = c.getContext('2d'), r = CO.rng(graine);
    c.width = c.height = N;
    for (let i = 0; i < n; i++) {
      x.fillStyle = r() < clair ? `rgba(236,226,208,${0.1 + r() * 0.2})` : `rgba(24,16,8,${0.12 + r() * sombre})`;
      const px = r() * N, py = r() * N, t = 0.7 + r() * 1.1;
      x.fillRect(px, py, t, t);
      if (px > N - 2) x.fillRect(px - N, py, t, t);
      if (py > N - 2) x.fillRect(px, py - N, t, t);
    }
    return (grains[nom] = c);
  }
  /**
   * le mur, peint une fois pour une largeur (plus haut que nécessaire : une souche de plus ne le fait pas repeindre) ;
   * le grain en motifs (pas de milliers de petits carrés), les arêtes des pierres par décalage (pas de découpe)
   */
  function peindreMur() {
    const cv = $('#mur-pierre'), mur = $('#mur');
    if (!cv || !mur) return;
    const W = mur.clientWidth, H = mur.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const deja = cv.dataset.taille && cv.dataset.taille.split('@');
    if (deja && deja[0] === String(W) && +deja[1] === dpr && +deja[2] >= H) return;
    const Hp = Math.ceil(Math.max(H, 900) / 400) * 400 + 400;
    cv.dataset.taille = W + '@' + dpr + '@' + Hp;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(Hp * dpr);
    cv.style.height = Hp + 'px';
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = CO.rng(63);
    const motif = (img) => g.createPattern(img, 'repeat');
    // le mortier, et son grain
    g.fillStyle = '#4B3C2F';
    g.fillRect(0, 0, W, Hp);
    g.fillStyle = motif(grain('mortier', 0.45, 0.16, 1300, 305));
    g.fillRect(0, 0, W, Hp);
    // les pierres, par assises (une grosse de temps en temps, qui mange l'assise suivante)
    const pierres = [];
    const pierre = (cx, cy, w, hh) => {
      const pts = [], nb = 8 + Math.floor(r() * 4), rot = r() * 6.2832;
      for (let k = 0; k < nb; k++) { // (des moellons : à peu près carrés, les angles cassés, une face plus plate)
        const a = rot + (k / nb) * 6.2832 + (r() - 0.5) * 0.42, c = Math.cos(a), s = Math.sin(a), sup = 0.42 + r() * 0.3;
        pts.push([cx + Math.sign(c) * Math.pow(Math.abs(c), sup) * ((w - 4) / 2) * (0.78 + r() * 0.22), cy + Math.sign(s) * Math.pow(Math.abs(s), sup) * ((hh - 4) / 2) * (0.76 + r() * 0.24)]);
      }
      pierres.push({ p: new Path2D(CO.closedPath(pts, 0.7 + r() * 0.3)), cx, cy, w, h: hh, col: PIERRES[Math.floor(r() * PIERRES.length)], v: r(), ocre: r() < 0.14, sombre: r() < 0.12 });
    };
    for (let y = -10; y < Hp + 30;) {
      const h = 19 + r() * 17;
      for (let x = -r() * 40; x < W + 40;) {
        const grande = r() < 0.12;
        const w = grande ? 58 + r() * 40 : 24 + r() * 44;
        const hh = grande ? h * 1.55 : h * (0.7 + r() * 0.3);
        pierre(x + w / 2, y + h / 2 + (r() - 0.5) * Math.max(0, h - hh) * 0.6 + (grande ? h * 0.25 : 0), w, hh);
        if (r() < 0.3) pierre(x + w + 2 + r() * 3, y + h * (0.2 + r() * 0.6), 9 + r() * 9, 7 + r() * 7); // une cale entre deux pierres
        x += w + 1.2 + r() * 3.4;
      }
      y += h + 1.2 + r() * 2.4;
    }
    const grainPierre = motif(grain('pierre', 0.4, 0.22, 900, 306));
    for (const q of pierres) {
      // l'arête éclairée (en haut à gauche) et l'ombre dans le joint (en bas à droite) : la pierre décalée, dessous
      g.save(); g.translate(-0.7, -1); g.fillStyle = 'rgba(255,236,208,.3)'; g.fill(q.p); g.translate(1.9, 3); g.fillStyle = 'rgba(18,10,4,.6)'; g.fill(q.p); g.restore();
      g.fillStyle = q.sombre ? '#6E6254' : q.ocre ? '#A98A62' : q.col;
      g.fill(q.p);
      const lg = g.createLinearGradient(q.cx - q.w * 0.4, q.cy - q.h * 0.6, q.cx + q.w * 0.25, q.cy + q.h * 0.55);
      lg.addColorStop(0, 'rgba(255,238,212,.26)'); lg.addColorStop(0.45, 'rgba(255,238,212,.03)'); lg.addColorStop(1, 'rgba(28,18,10,.4)');
      g.fillStyle = lg;
      g.fill(q.p);
      const bo = g.createRadialGradient(q.cx - q.w * 0.12, q.cy - q.h * 0.18, 0, q.cx - q.w * 0.12, q.cy - q.h * 0.18, Math.max(q.w, q.h) * 0.5);
      bo.addColorStop(0, `rgba(255,236,206,${(0.05 + q.v * 0.09).toFixed(3)})`); bo.addColorStop(1, 'rgba(255,236,206,0)');
      g.fillStyle = bo;
      g.fill(q.p);
      if (q.v < 0.3) { g.fillStyle = 'rgba(60,44,30,.16)'; g.fill(q.p); } else if (q.v < 0.5) { g.fillStyle = 'rgba(255,235,205,.08)'; g.fill(q.p); }
      g.fillStyle = grainPierre; // le grain de la pierre
      g.fill(q.p);
    }
    // la pénombre, la lampe : une flaque chaude sous l'abat-jour
    g.fillStyle = 'rgba(22,13,6,.5)';
    g.fillRect(0, 0, W, Hp);
    const lampe = $('.mur-lampe', mur);
    const lx = lampe ? lampe.offsetLeft + lampe.offsetWidth / 2 : W * 0.26;
    g.globalCompositeOperation = 'screen';
    const flaque = (x, y, rx, ry, couleur, a) => {
      g.save(); g.translate(x, y); g.scale(1, ry / rx);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      rg.addColorStop(0, `rgba(${couleur},${a})`); rg.addColorStop(0.5, `rgba(${couleur},${a * 0.42})`); rg.addColorStop(1, `rgba(${couleur},0)`);
      g.fillStyle = rg; g.beginPath(); g.arc(0, 0, rx, 0, 6.2832); g.fill(); g.restore();
    };
    flaque(lx, 150, Math.max(W * 0.95, 300), 330, '255,170,96', 0.36);
    flaque(lx, 96, W * 0.42, 120, '255,222,170', 0.3);
    g.globalCompositeOperation = 'source-over';
    // les bords, plus sombres (le bas : .mur::after, l'ombre de l'établi)
    const vg = g.createLinearGradient(0, 0, W, 0);
    vg.addColorStop(0, 'rgba(10,6,3,.3)'); vg.addColorStop(0.18, 'rgba(10,6,3,0)'); vg.addColorStop(0.82, 'rgba(10,6,3,0)'); vg.addColorStop(1, 'rgba(10,6,3,.36)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, Hp);
    const loin = g.createLinearGradient(0, 520, 0, 1100); // (loin de la lampe, la pénombre s'installe)
    loin.addColorStop(0, 'rgba(10,6,3,0)'); loin.addColorStop(1, 'rgba(10,6,3,.22)');
    g.fillStyle = loin;
    g.fillRect(0, 520, W, Hp - 520);
  }
  let peinture = 0;
  const repeindre = () => { if (!peinture) peinture = requestAnimationFrame(() => { peinture = 0; peindreMur(); }); };

  /* ======================================================================
     Les souches pendues : le pendule (amorti ; on ne calcule que ce qui bouge)
     ====================================================================== */
  const K = 72, AMORTI = 3.4; // raideur (1/s²) et frottement (1/s) : ≈ 1,35 oscillation par seconde, calmée en 2 s
  const bouge = new Map(); // .pendule → { a, v, base } (degrés, degrés/s)
  let rafB = 0, tB = 0;
  function pousser(el, v) {
    if (!el || CO.reduced) return;
    let s = bouge.get(el);
    if (!s) { s = { a: 0, v: 0, base: parseFloat(el.style.getPropertyValue('--incl')) || 0 }; bouge.set(el, s); }
    s.v = clamp(s.v + v, -160, 160);
    if (!rafB) { tB = 0; rafB = requestAnimationFrame(balancer); }
  }
  function balancer(now) {
    rafB = 0;
    // le temps vrai écoulé (si le téléphone a calé, la souche a continué de se calmer), par petits pas
    const dt = tB ? Math.min(2, (now - tB) / 1000) : 1 / 60;
    tB = now;
    bouge.forEach((s, el) => {
      if (!el.isConnected) { bouge.delete(el); return; }
      for (let r = dt; r > 0; r -= 0.008) { const h = Math.min(0.008, r); s.v += (-K * s.a - AMORTI * s.v) * h; s.a += s.v * h; }
      s.a = clamp(s.a, -10, 10);
      if (Math.abs(s.a) < 0.06 && Math.abs(s.v) < 0.6) { el.style.transform = ''; bouge.delete(el); return; } // (à l'arrêt : plus rien ne tourne)
      el.style.transform = `rotate(${(s.base + s.a).toFixed(3)}deg)`;
    });
    if (bouge.size) rafB = requestAnimationFrame(balancer);
  }
  /* le défilement du mur pousse les souches (un peu : elles sont lourdes de leur carton) */
  let yS = null, tS = 0, vS = 0;
  function surDefilement(e) {
    const sc = e.currentTarget, now = performance.now(), y = sc.scrollTop;
    if (yS == null || now - tS > 140) { yS = y; tS = now; vS = 0; return; }
    const v = (y - yS) / Math.max(8, now - tS);
    const dv = clamp(v - vS, -3, 3);
    yS = y; tS = now; vS = v;
    if (Math.abs(dv) < 0.03 || CO.reduced) return;
    const haut = window.innerHeight;
    $$('#mes-tickets .pendule').forEach((el, i) => {
      const b = el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > haut) return;
      pousser(el, -dv * 13 * (0.75 + 0.5 * ((i * 0.618) % 1)));
    });
  }

  /* ======================================================================
     Le tableau
     ====================================================================== */
  /** une souche (ou autre chose) pendue : à un crochet de la planche (première rangée), sinon à un clou */
  function accroche(contenu, cle, rang, { vide = false } = {}) {
    const h = CO.hash(String(cle));
    const incl = (((h % 1000) / 1000) * 2.6 + 0.8) * (h & 1024 ? 1 : -1); // de 0,8 à 3,4 degrés, d'un côté ou de l'autre
    const fil = rang === 0 ? 16 + ((h >>> 11) % 20) : 12 + ((h >>> 11) % 16);
    const point = `<span class="accroche-point ${rang === 0 ? 'crochet' : 'clou'}" aria-hidden="true"></span>`;
    if (vide) return `<div class="accroche vide" style="--fil:${fil}px">${point}${contenu}</div>`;
    return `<div class="accroche" style="--fil:${fil}px">${point}<div class="pendule" style="--incl:${incl.toFixed(2)}deg"><span class="ficelle" aria-hidden="true"></span>${contenu}</div></div>`;
  }
  const VIERGE = `<a class="souche vierge" href="#deposer" data-sfx="stamp" aria-label="Déposer une paire : remplir un ticket">
      <div class="s-papier">
        <span class="s-oeillet" aria-hidden="true"></span>
        <div class="s-tete"><span class="s-marque">CORDO63</span></div>
        <p class="s-num"><small>N°</small>····</p>
        <p class="vierge-t">Déposer une paire <svg aria-hidden="true"><use href="#i-fleche"/></svg></p>
        <p class="vierge-s">Remplissez le ticket : Clément le reçoit à l’atelier.</p>
        <span class="s-pastille" aria-hidden="true"></span>
      </div>
    </a>`;
  const MOT = `<div class="mot"><span class="scotch" aria-hidden="true"></span>
      <p>Rien d’accroché ici pour l’instant.</p>
      <p>Déposez une paire : votre souche viendra pendre à ce crochet.</p>
      <span class="mot-signe">Clément</span>
    </div>`;

  function liste() {
    const box = $('#mes-tickets');
    if (!box) return;
    // au mur : les paires prêtes d'abord, puis celles en cours, les rendues à la fin (chaque groupe du plus récent au plus ancien)
    const groupe = (c) => (c.statut === 'prete' ? 0 : c.statut === 'rendue' ? 2 : 1);
    const mes = CO.Commandes.miennes().map((c, i) => [c, i]).sort((x, y) => groupe(x[0]) - groupe(y[0]) || x[1] - y[1]).map((x) => x[0]);
    const items = [];
    if (!mes.length) items.push(accroche(MOT, 'vide', 0, { vide: true }));
    mes.forEach((c) => items.push(accroche(CO.Ticket.souche(c), c.num, Math.floor(items.length / 2))));
    if (items.length % 2 === 1) items.push(accroche(VIERGE, 'vierge' + mes.length, Math.floor(items.length / 2)));
    box.innerHTML = `<div class="tableau">${items.join('')}</div>`;
    $$('.souche[data-num]', box).forEach((el) => {
      const go = () => ouvrir(el.dataset.num);
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    $$('.pendule', box).forEach((p) => p.addEventListener('pointerdown', (e) => {
      const b = p.getBoundingClientRect();
      pousser(p, clamp((e.clientX - (b.left + b.width / 2)) / (b.width / 2), -1, 1) * -60 + (Math.random() - 0.5) * 16);
    }));
    repeindre();
  }

  /** l'accueil : le ticket en cours (le plus avancé), pendu à son clou ; sinon rien (le lacet jaune « Déposer une paire » suffit) */
  function accueil() {
    const box = $('#accueil-ticket');
    if (!box) return;
    const act = CO.Commandes.actives().sort((a, b) => CO.Commandes.rang(b) - CO.Commandes.rang(a));
    if (act.length) {
      box.innerHTML = accroche(CO.Ticket.souche(act[0]), 'accueil' + act[0].num, 1) + (act.length > 1 ? `<p class="t-note"><a href="#tickets">Mes ${act.length} tickets <svg aria-hidden="true"><use href="#i-fleche"/></svg></a></p>` : '');
      const s = $('.souche', box), p = $('.pendule', box);
      s.addEventListener('click', () => { pousser(p, 45); ouvrir(act[0].num); });
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(act[0].num); } });
    } else box.innerHTML = '';
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

  /* ---------- une paire vient de passer « prête » (espace atelier, autre onglet) : on le dit, on tamponne ---------- */
  let pretesVues = new Set(CO.Commandes.miennes().filter((c) => c.statut === 'prete').map((c) => c.num));
  const aTamponner = new Set();
  function nouvellesPretes() {
    const maintenant = CO.Commandes.miennes().filter((c) => c.statut === 'prete');
    maintenant.forEach((c) => {
      if (!pretesVues.has(c.num)) {
        CO.sfx.play('chime');
        CO.toast(`Votre paire N° ${c.num} est prête !`, 4200);
        CO.vibrate([30, 60, 30]);
        aTamponner.add(c.num);
      }
    });
    pretesVues = new Set(maintenant.map((c) => c.num));
    if (CO.view === 'tickets') setTimeout(tamponner, 260);
  }
  /** le tampon « PRÊTE » tombe sur la souche (quand on la voit) */
  function tamponner() {
    if (CO.view !== 'tickets') return;
    aTamponner.forEach((num) => {
      const s = $(`#mes-tickets .souche[data-num="${num}"]`);
      const t = s && $('.s-tampon', s);
      if (!t) return;
      aTamponner.delete(num);
      if (CO.reduced) return;
      t.classList.remove('frappe');
      void t.offsetWidth;
      t.classList.add('frappe');
      CO.sfx.play('stamp', { delay: 170 });
      setTimeout(() => pousser(s.closest('.pendule'), 30), 190);
    });
  }

  /* ---------- suivre un ticket papier : on écrit son numéro sur la souche ---------- */
  function brancherPapier() {
    const f = $('#suivre-num');
    if (!f) return;
    const inp = $('#sn-num', f);
    inp.addEventListener('input', () => { const v = inp.value.replace(/\D/g, ''); if (v !== inp.value) inp.value = v; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = inp.value.replace(/\D/g, '');
      if (!n) { CO.sfx.play('nope'); return; }
      const compte = CO.Compte && CO.Compte.get();
      const tel = (compte && compte.tel) || (CO.store.get('moi', {}) || {}).tel || '';
      const c = await CO.Commandes.suivre(n, tel);
      if (c) { CO.sfx.play('yes'); inp.value = ''; inp.blur(); ouvrir(c.num); }
      else { CO.sfx.play('nope'); CO.toast('Ticket introuvable : Clément vous le confirmera au téléphone.'); }
    });
  }

  CO.Suivi = {
    ouvrir,
    init() {
      tout();
      brancherPapier();
      CO.on('commandes', () => { tout(); nouvellesPretes(); });
      CO.on('view', (v) => { if (v === 'tickets') { repeindre(); setTimeout(tamponner, 480); } });
      const sc = $('#tickets .view-scroll');
      if (sc) sc.addEventListener('scroll', surDefilement, { passive: true });
      const mur = $('#mur');
      if (mur && window.ResizeObserver) new ResizeObserver(repeindre).observe(mur);
      else window.addEventListener('resize', repeindre);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(repeindre);
      setInterval(() => { accueil(); }, 60000); // « ouvert maintenant » / « ouvre demain »
    },
  };
})();
