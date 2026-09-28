/* ==========================================================================
   Cordo 63 — « Montrez-moi ! » : le film du process, les mains de Clément sur son établi
   Dans l'atelier, on demande à Clément comment ça se passe ; il dit « Montrez-moi ! »… la
   caméra plonge sur son établi (co-boutique.js) et le film des mains (co-process.js) prend
   l'écran : une paire arrive sur le tapis ; le ticket jaune ; on démonte ; on répare ; on
   finit ; prête. À chaque étape, sa phrase s'écrit dans la bulle et l'étape s'allume en haut.
   Sans le film des mains, l'établi (co-etabli.js) pose les outils étape par étape.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});
  const $ = (s, r = document) => r.querySelector(s);

  // le texte de Clément (à relire avec lui), et ce qui se pose sur l'établi à chaque étape
  const SCRIPT = [
    { etape: 'discuter', poser: ['sneaker'], texte: 'Montrez-moi votre paire. On regarde ensemble ce qui est possible, et je vous dis combien. C’est gratuit.' },
    { etape: 'ticket', poser: ['ticket'], texte: 'Le ticket jaune : une moitié reste accrochée à la paire, l’autre part avec vous. Même numéro.' },
    { etape: 'demonter', poser: ['tranchet', 'pince'], texte: 'D’abord je délace, et un bon coup de brosse : on repart propre.' },
    { etape: 'reparer', poser: ['pot-colle', 'marteau', 'semelle-gomme'], texte: 'Un filet de colle tout le long du bord, et quelques coups de marteau pour bien la plaquer.' },
    { etape: 'finir', poser: ['brosse', 'creme'], texte: 'Des lacets neufs, croisés bien droits, et un dernier nœud.' },
    { etape: 'rendre', poser: [], texte: 'Et voilà, elle est prête ! Je vous envoie un message : vous passez avec votre ticket.' },
  ];
  const PAS_LETTRE = 26; // ms par lettre

  let process = null; // le film des mains (co-process.js) : c'est lui qui mène
  let etabli = null, pret = null, ouvert = false, jeton = 0;
  const bulle = () => $('#bulle');

  /** la bulle suit le film : à chaque étape, sa phrase s'écrit (sans attendre de toucher) */
  let tapeT = 0;
  function ecrire(texte) {
    const b = bulle(), t = $('#bulle-texte');
    if (!b || !t) return;
    clearTimeout(tapeT);
    b.hidden = false;
    b.classList.remove('finie');
    t.innerHTML = '';
    t.setAttribute('aria-label', texte);
    const spans = [...texte].map((ch) => { const sp = document.createElement('span'); sp.className = 'l'; sp.textContent = ch; sp.setAttribute('aria-hidden', 'true'); t.appendChild(sp); return sp; });
    let i = 0;
    const pas = () => {
      if (i < spans.length) {
        spans[i].classList.add('vu');
        if (i % 3 === 0 && /[a-zà-ÿ0-9]/i.test(spans[i].textContent)) CO.sfx.play(CO.sfx.existe && CO.sfx.existe('voix') ? 'voix' : 'key', { gain: 0.8 });
        i++;
        tapeT = setTimeout(pas, /[.:!…]/.test(spans[i - 1].textContent) ? PAS_LETTRE * 8 : PAS_LETTRE);
      } else b.classList.add('finie');
    };
    if (CO.reduced) { spans.forEach((sp) => sp.classList.add('vu')); b.classList.add('finie'); } else pas();
    b.onclick = () => { clearTimeout(tapeT); spans.forEach((sp) => sp.classList.add('vu')); b.classList.add('finie'); };
  }

  /* les six étapes en haut du film ; celle en cours s'allume */
  function etapes() {
    const ol = $('#film-etapes');
    if (!ol || ol.children.length) return;
    ol.innerHTML = CO.PROCESS.map((p, i) => `<li data-etape="${p.id}"><b>${i + 1}</b><span>${CO.esc ? CO.esc(p.titre) : p.titre}</span></li>`).join('');
  }
  function marquer(id) {
    const ol = $('#film-etapes');
    if (!ol) return;
    const k = CO.PROCESS.findIndex((x) => x.id === id);
    [...ol.children].forEach((li, i) => { li.classList.toggle('ici', i === k); li.classList.toggle('fait', k >= 0 && i < k); });
  }
  function etape(id) {
    CO.emit('etape', id);
    marquer(id);
    const s = SCRIPT.find((x) => x.etape === id);
    if (s && ouvert) ecrire(s.texte);
  }

  async function preparerProcess() {
    const host = $('#film-host');
    if (!host || !CO.Process || !CO.Process.create) return null;
    if (!process) {
      process = CO.Process.create(host, { boucle: true }).then((p) => {
        if (p && p.on) p.on('etape', etape);
        return p;
      }).catch((e) => { console.warn('process', e); return null; });
    }
    return process;
  }

  /* ---------- sans le film des mains : l'établi pose ses outils, étape par étape ---------- */
  function preparerEtabli() {
    if (pret) return pret;
    const host = $('#film-host');
    if (!host) return (pret = Promise.resolve(null));
    if (!CO.Etabli || !CO.Etabli.create) {
      host.style.background = 'linear-gradient(rgba(180,215,190,.2) 1px, transparent 1px) 0 0 / 100% 24px, linear-gradient(90deg, rgba(180,215,190,.2) 1px, transparent 1px) 0 0 / 24px 100%, radial-gradient(120% 90% at 40% 30%, #33634F, #244A3D)';
      return (pret = Promise.resolve(null));
    }
    pret = CO.Etabli.create(host, { disposition: 'vide', graine: 49 }).then((e) => { etabli = e; return e; }).catch((err) => { console.warn('film', err); return null; });
    return pret;
  }
  async function jouerEtabli() {
    const mon = ++jeton;
    const e = await preparerEtabli();
    if (e && e.vider) e.vider();
    for (let k = 0; ouvert && mon === jeton; k = (k + 1) % SCRIPT.length) {
      const s = SCRIPT[k];
      if (k === 0 && e && e.vider) e.vider();
      etape(s.etape);
      if (e && e.poser) s.poser.forEach((id, j) => setTimeout(() => { try { if (mon === jeton) e.poser(id, { anime: true }); } catch (err) { /* objet inconnu */ } }, j * 380));
      await CO.wait(Math.max(3800, s.texte.length * 60));
    }
  }

  /* ---------- ouvrir, fermer ---------- */
  async function ouvrir() {
    const f = $('#film-plein');
    if (!f || ouvert) return;
    ouvert = true;
    etapes();
    const sc = CO.boutique;
    if (sc && sc.zoomEtabli && !CO.reduced) {
      try { await Promise.race([sc.zoomEtabli(), CO.wait(1300)]); } catch (e) { /* rien */ }
    }
    if (!ouvert) return;
    if (sc && sc.pause) sc.pause();
    f.hidden = false;
    requestAnimationFrame(() => f.classList.add('on'));
    CO.sfx.play('open');
    const p = await preparerProcess();
    if (!ouvert) return;
    if (p) {
      if (p.aller) p.aller(0);
      if (p.jouer) p.jouer();
      else if (p.reprise) p.reprise();
    } else jouerEtabli();
    const x = $('#film-fermer');
    if (x) setTimeout(() => x.focus({ preventScroll: true }), 400);
  }
  /** vite : on quitte l'atelier, pas de retour de caméra */
  function fermer(vite) {
    const f = $('#film-plein');
    if (!f || !ouvert) return;
    ouvert = false;
    jeton++;
    clearTimeout(tapeT);
    f.classList.remove('on');
    if (process) process.then((p) => p && p.pause && p.pause());
    const b = bulle();
    if (b) b.hidden = true;
    marquer(null);
    CO.emit('etape', null);
    setTimeout(() => { if (!ouvert) f.hidden = true; }, vite ? 0 : 320);
    const sc = CO.boutique;
    if (!vite && sc) {
      if (sc.dezoom) sc.dezoom();
      if (sc.reprise) sc.reprise();
    }
  }

  CO.Film = {
    ouvrir, fermer,
    jouer: ouvrir, // compatibilité
    get ouvert() { return ouvert; },
    init() {
      const x = $('#film-fermer');
      if (x) x.addEventListener('click', () => fermer());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ouvert) fermer(); });
      CO.on('view', (v) => { if (v !== 'atelier') fermer(true); });
    },
  };
})();
