/* ==========================================================================
   Cordo 63 — L'atelier (onglet) : les volets qui se déplient, la pile de ses photos
   d'établi (on jette celle du dessus, elle repart dessous), les étapes du process.
   Photos : celles de @cordo.63 et @tiega49 (basse définition, en attendant les originaux
   et l'accord de Clément).
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => CO.esc(s);

  CO.INSTA = [
    { img: 'santiag', legende: 'Une santiag, et son ticket jaune' },
    { img: 'mocassins', legende: 'Mocassins en daim, semelles neuves' },
    { img: 'sneakers', legende: 'Des sneakers à restaurer' },
    { img: 'semelle', legende: 'La semelle cuir, la trépointe' },
    { img: 'escarpins', legende: 'Escarpins vernis, talons à refaire' },
    { img: 'rollers', legende: 'Même les rollers passent par l’établi' },
  ];

  const POSE = [{ x: 0, y: 0, r: -1.5, s: 1 }, { x: 12, y: 8, r: 4, s: 0.97 }, { x: -11, y: 14, r: -4.5, s: 0.94 }, { x: 6, y: 20, r: 2, s: 0.91 }];

  function pile() {
    const box = $('#pile-photos');
    if (!box) return;
    box.innerHTML = CO.INSTA.map((p, i) => `<figure class="pile-photo" data-i="${i}" style="margin:0"><img src="assets/img/insta/${p.img}.webp" alt="${esc(p.legende)}" loading="lazy" decoding="async" draggable="false"><span>${esc(p.legende)}</span></figure>`).join('');
    const cards = $$('.pile-photo', box);
    const N = cards.length;
    let order = cards.map((_, i) => i), busy = false, drag = null;
    const tf = (p, dx = 0, dy = 0, dr = 0) => `translate(${p.x + dx}px, ${p.y + dy}px) rotate(${p.r + dr}deg) scale(${p.s})`;
    const pose = (d) => POSE[Math.min(d, POSE.length - 1)];
    function layout() {
      order.forEach((ci, d) => {
        const c = cards[ci];
        c.style.zIndex = String(N - d);
        c.style.transform = tf(pose(d));
        c.style.opacity = d < POSE.length ? '1' : '0';
        c.setAttribute('aria-hidden', String(d !== 0));
      });
    }
    function toss(dir, dy = 0) {
      if (busy) return;
      busy = true;
      const c = cards[order[0]];
      c.style.transition = 'transform .34s cubic-bezier(.4,0,.9,.6), opacity .34s ease-in';
      c.style.transform = `translate(${dir * 125}%, ${dy + 30}px) rotate(${dir * 22}deg) scale(.96)`;
      c.style.opacity = '0';
      CO.sfx.play('flick');
      setTimeout(() => {
        order.push(order.shift());
        c.style.transition = 'none';
        layout();
        void c.offsetWidth;
        c.style.transition = '';
        busy = false;
      }, CO.reduced ? 0 : 340);
      order.slice(1).forEach((ci, d) => { const n = cards[ci]; n.style.transform = tf(pose(d)); n.style.opacity = d < POSE.length ? '1' : '0'; n.style.zIndex = String(N - d - 1); });
    }
    box.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.pile-photo');
      if (busy || !c || c !== cards[order[0]]) return;
      drag = { c, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, on: false, lx: e.clientX, lt: e.timeStamp, vx: 0 };
    });
    box.addEventListener('pointermove', (e) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      d.dx = e.clientX - d.x0;
      d.dy = e.clientY - d.y0;
      if (!d.on) {
        if (Math.abs(d.dy) > 10 && Math.abs(d.dy) > Math.abs(d.dx)) { drag = null; return; }
        if (Math.abs(d.dx) < 6) return;
        d.on = true;
        try { d.c.setPointerCapture(d.id); } catch (_) { /* rien */ }
        d.c.style.transition = 'none';
      }
      const dt = Math.max(8, e.timeStamp - d.lt);
      d.vx = d.vx * 0.4 + ((e.clientX - d.lx) / dt) * 0.6;
      d.lx = e.clientX;
      d.lt = e.timeStamp;
      d.c.style.transform = tf(POSE[0], d.dx, d.dy * 0.25, d.dx * 0.07);
    });
    const end = (e) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      d.c.style.transition = '';
      if (!d.on) { if (e.type === 'pointerup') toss(1); return; }
      if (Math.abs(d.dx) > 80 || Math.abs(d.vx) > 0.55) toss(Math.sign(d.dx || d.vx), d.dy);
      else d.c.style.transform = tf(POSE[0]);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.setAttribute('tabindex', '0');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Ses photos d’établi : touchez ou faites glisser pour passer à la suivante');
    box.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); toss(e.key === 'ArrowRight' ? 1 : -1); } });
    layout();
  }

  function plis() {
    $$('.pli').forEach((d) => {
      const corps = $('.pli-corps', d);
      const sommaire = $('summary', d);
      if (!corps || !sommaire || !corps.animate) return;
      sommaire.addEventListener('click', (e) => {
        if (CO.reduced) return;
        e.preventDefault();
        if (d.dataset.anim) return;
        const ouvrir = !d.open;
        if (ouvrir) d.open = true;
        CO.sfx.play(ouvrir ? 'page' : 'close');
        const h = corps.scrollHeight;
        d.dataset.anim = '1';
        const a = corps.animate(ouvrir
          ? [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }]
          : [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: ouvrir ? 380 : 260, easing: 'cubic-bezier(.3,.8,.3,1)' });
        const fin = () => { if (!ouvrir) d.open = false; delete d.dataset.anim; };
        a.onfinish = fin;
        a.oncancel = fin;
      });
    });
  }

  CO.Nous = {
    init() {
      plis();
      let fait = false;
      const faire = () => { if (!fait) { fait = true; pile(); } };
      CO.on('view', (v) => { if (v === 'atelier') faire(); });
      if (CO.view === 'atelier') faire();
      // le film du process éclaire l'étape qu'il montre
      CO.on('etape', (id) => {
        $$('#process .etape').forEach((li) => li.classList.toggle('ici', li.dataset.etape === id));
      });
    },
  };
})();
