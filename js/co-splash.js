/* ==========================================================================
   Cordo 63 — l'ouverture : le logo frappé lettre par lettre, sur le beat de l'atelier
   Le logo CORDO63 en filigrane sur un fond crème quadrillé comme un tapis de découpe, et
   « Entrer » (le geste qui autorise le son). Au toucher : une boucle boom-bap faite avec les
   outils (la forme en fonte en grosse caisse, le marteau à plat sur une semelle en caisse
   claire, le cutter qu'on clique en charleston) ; à chaque croche une lettre se frappe au
   poinçon, avec sa note sur l'enclume ; puis la phrase, et la rue apparaît.
   Une fois par visite ; ?intro la rejoue, ?nointro la saute ; un toucher pendant l'animation la passe.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);
  const BPM = 92;
  const DOUBLE = 60000 / BPM / 4; // une double-croche (ms)
  // deux mesures de seize doubles : grosse caisse, caisse claire, charleston (le 2e de chaque paire traîne un peu : le swing)
  const KICK = [0, 7, 10, 16, 23, 26];
  const SNARE = [4, 12, 20, 28];
  const LETTRES_PAS = [0, 2, 4, 6, 8, 10, 12]; // C O R D O 6 3, une par croche
  const NOTES = [76, 79, 81, 84, 86, 88, 91];

  function beat(t0, pas = 32) {
    const at = (p) => t0 + p * DOUBLE + (p % 2 ? 18 : 0);
    KICK.filter((p) => p < pas).forEach((p) => CO.sfx.play('kick', { delay: at(p) }));
    SNARE.filter((p) => p < pas).forEach((p) => CO.sfx.play('snare', { delay: at(p) }));
    for (let p = 0; p < pas; p += 2) CO.sfx.play('hat', { delay: at(p) + (p % 4 === 2 ? 22 : 0), v: p % 4 ? 0.7 : 1 });
    return at;
  }

  CO.splash = function () {
    return new Promise((resolve) => {
      const el = $('#splash');
      const q = new URLSearchParams(location.search);
      let deja = false;
      try { deja = sessionStorage.getItem('co-intro') === '1'; } catch (e) { /* navigation privée */ }
      if (!el || !CO.logo || q.has('nointro') || (deja && !q.has('intro'))) { resolve({ skipped: true }); return; }
      try { sessionStorage.setItem('co-intro', '1'); } catch (e) { /* idem */ }
      el.hidden = false;
      const host = $('#splash-logo');
      const svg = CO.logo({ couleur: 'currentColor' });
      host.innerHTML = '';
      host.appendChild(svg);
      const lettres = [...svg.querySelectorAll('.l')];
      svg.style.opacity = '.16';
      const btn = $('#splash-entrer');
      const muet = $('#splash-muet');
      const sous = $('.splash-sous', el);
      if (muet && !CO.sfx.on) muet.hidden = true;
      setTimeout(() => { btn.classList.add('on'); if (muet) muet.classList.add('on'); }, 250);

      let fini = false, lance = false;
      const partir = (opts) => {
        if (fini) return;
        fini = true;
        el.classList.add('part');
        setTimeout(() => { el.hidden = true; el.classList.remove('part'); }, 650);
        resolve(opts);
      };

      async function jouer() {
        if (lance) return;
        lance = true;
        btn.classList.remove('on');
        btn.classList.add('parti');
        btn.disabled = true;
        if (muet) { muet.classList.remove('on'); muet.style.visibility = 'hidden'; }
        if (CO.reduced) { svg.style.opacity = '1'; sous.classList.add('on'); await CO.wait(700); partir({ lettres: false }); return; }
        svg.style.transition = 'opacity .25s ease';
        lettres.forEach((l) => { l.style.opacity = '0'; });
        svg.style.opacity = '1';
        const lat = CO.sfx.latency() * 1000;
        const t0 = 120;
        const at = beat(t0);
        LETTRES_PAS.forEach((p, i) => {
          const l = lettres[i];
          if (!l) return;
          CO.sfx.play('rim', { delay: at(p), m: NOTES[i] });
          setTimeout(() => {
            if (fini) return;
            l.style.opacity = '1';
            l.animate([
              { transform: 'translateY(-26px) scale(1.55)', opacity: 0 },
              { transform: 'translateY(2px) scale(.94)', opacity: 1, offset: 0.55 },
              { transform: 'scale(1.03)', offset: 0.78 },
              { transform: 'none', opacity: 1 },
            ], { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1)' });
            CO.vibrate(6);
          }, at(p) + lat);
        });
        // la dernière croche : l'accord sur l'enclume, puis la phrase
        const fin = at(14) + lat;
        [72, 79, 84, 88].forEach((m, k) => CO.sfx.play('rim', { delay: at(14) + k * 22, m, v: 0.8 }));
        setTimeout(() => { if (!fini) sous.classList.add('on'); }, fin);
        setTimeout(() => partir({ lettres: true }), at(26) + lat);
      }
      btn.addEventListener('click', jouer);
      if (muet) muet.addEventListener('click', () => {
        CO.sfx.on = false;
        if (CO.syncSound) CO.syncSound();
        jouer();
      });
      // un toucher pendant l'animation la passe
      el.addEventListener('pointerdown', (e) => { if (lance && !e.target.closest('button')) partir({ lettres: false }); });
    });
  };
})();
