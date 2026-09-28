/* ==========================================================================
   Cordo 63 — les plans : un bleu d'atelier animé pour chaque réparation
   Sur le papier bleu de Prusse, au trait cyan-blanc : l'élévation d'un talon, le dessous
   d'une semelle, une vue éclatée… et ce que Clément y fait, en boucle (6 à 7 s, une pause
   à la fin). Le client comprend d'un coup d'œil ce que veut dire « bouts de talons ».

   CO.Plans.svg(id, { taille, decoratif, joue, fixe, rubrique, classe, calques })  → le balisage (chaîne)
       taille 'mini' : vignette 64 × 48, sans texte · 'grand' : 320 × 220 (s'étire en largeur) avec
         cotes, traits cachés, repères numérotés, notes manuscrites, cartouche
       le balisage : <span class="plan plan-mini|plan-grand" data-plan="id" role="img"> et deux <svg>
         superposés : .pl-trait (le dessin fixe) et .pl-mouv (les seules pièces qui bougent : une
         animation fait repeindre tout son <svg>, on ne repeint donc que le petit calque).
         calques: false → un seul <svg class="plan …"> (même rendu, plus coûteux à animer)
       decoratif : aria-hidden (la vignette dans un bouton qui porte déjà son nom)
       joue : anime tout de suite (sinon CO.Plans.observer s'en charge ; sans observateur, tout joue)
       fixe : l'état final, sans animation (par défaut : CO.reduced ; prefers-reduced-motion aussi en CSS)
       un id inconnu → le plan générique de sa rubrique (CO.service(id).rubrique, ou { rubrique },
         ou 'rubrique:talons' … ; sinon « À l'atelier »)
   CO.Plans.observer(racine, { seuil, marge })   n'anime que les plans visibles (classe .joue, les
                               autres en animation-play-state: paused) et suit l'onglet (CO.view) ;
                               renvoie { rafraichir(), pause(oui), deconnecter() }
   CO.Plans.feuille(id, { action: { texte, fn }, onClose })   le grand plan dans une feuille
                               (#feuille-plan : celle d'index.html si elle existe, sinon créée)
   CO.Plans.fermer()           referme la feuille
   CO.Plans.infos(id)          { id, titre, alt, legende, vue, rubrique, duree, generique }
   CO.Plans.ids                les plans dessinés (un par service)

   Règles : animations CSS seulement (transform, opacity, stroke-dashoffset), rien en JS à
   chaque image. En vignette, que transform et opacity (Chrome les joue sans le fil principal :
   les traits qui se dessinent y deviennent des fondus). Les éléments animés sont des <g> ou des
   <path> (jamais un <text> transformé : Safari). Le style de base de chaque élément animé est
   l'état final : sans animation, le plan montre le travail fait. Les id internes (découpes)
   sont uniques par exemplaire.
   ========================================================================== */
(function () {
  'use strict';
  const CO = (window.CO = window.CO || {});

  const W = 320, H = 220; // la planche du grand plan (unités = px à 320 de large)
  const INTRO = 1.1; // s : le trait se dessine, puis la boucle démarre
  const r2 = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ======================================================================
     Géométrie : repères locaux, chemins, hachures, décalages, découpes
     ====================================================================== */
  /** un repère local posé sur la planche : translation, échelle uniforme, miroir horizontal
      (les traits restent d'équerre ; les épaisseurs et les pointillés ne dépendent que de --u) */
  function R(x = 0, y = 0, s = 1, fx = false) {
    const m = fx ? -1 : 1;
    const o = {
      x, y, s, fx,
      X: (px) => r2(x + m * px * s),
      Y: (py) => r2(y + py * s),
      pt: (px, py) => [r2(x + m * px * s), r2(y + py * s)],
      sub: (px, py, ps = 1, pfx = false) => R(x + m * px * s, y + py * s, s * ps, fx !== pfx),
      d: (str) => transformer(str, o),
      poly: (pts) => pts.map(([px, py]) => [x + m * px * s, y + py * s]),
    };
    return o;
  }
  const RE_TOK = /[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;
  const NARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  function transformer(str, t) {
    const tok = str.match(RE_TOK) || [];
    const m = t.fx ? -1 : 1;
    let out = '', i = 0, cmd = 'M';
    while (i < tok.length) {
      if (/[a-z]/i.test(tok[i])) {
        cmd = tok[i++];
        out += cmd;
        if (cmd === 'Z' || cmd === 'z') continue;
      }
      const C = cmd.toUpperCase(), rel = cmd !== C, n = NARGS[C];
      const a = tok.slice(i, i + n).map(Number);
      i += n;
      let v;
      if (C === 'H') v = [rel ? m * a[0] * t.s : t.X(a[0])];
      else if (C === 'V') v = [rel ? a[0] * t.s : t.Y(a[0])];
      else if (C === 'A') v = [a[0] * t.s, a[1] * t.s, t.fx ? -a[2] : a[2], a[3], t.fx ? 1 - a[4] : a[4], rel ? m * a[5] * t.s : t.X(a[5]), rel ? a[6] * t.s : t.Y(a[6])];
      else {
        v = [];
        for (let k = 0; k < n; k += 2) v.push(rel ? m * a[k] * t.s : t.X(a[k]), rel ? a[k + 1] * t.s : t.Y(a[k + 1]));
      }
      out += v.map(r2).join(' ') + ' ';
      if (C === 'M') cmd = rel ? 'l' : 'L';
    }
    return out.trim();
  }

  /** un chemin (M L H V C Q Z, absolus ou relatifs) → des points */
  function points(str, pas = 10) {
    const tok = str.match(RE_TOK) || [];
    const pts = [];
    let i = 0, cmd = 'M', cx = 0, cy = 0, sx = 0, sy = 0;
    const num = () => +tok[i++];
    while (i < tok.length) {
      if (/[a-z]/i.test(tok[i])) cmd = tok[i++];
      const C = cmd.toUpperCase(), rel = cmd !== C;
      if (C === 'Z') { pts.push([sx, sy]); cx = sx; cy = sy; continue; }
      if (C === 'M') { cx = (rel ? cx : 0) + num(); cy = (rel ? cy : 0) + num(); sx = cx; sy = cy; pts.push([cx, cy]); cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { cx = (rel ? cx : 0) + num(); cy = (rel ? cy : 0) + num(); pts.push([cx, cy]); }
      else if (C === 'H') { cx = (rel ? cx : 0) + num(); pts.push([cx, cy]); }
      else if (C === 'V') { cy = (rel ? cy : 0) + num(); pts.push([cx, cy]); }
      else if (C === 'C' || C === 'Q') {
        const n = C === 'C' ? 3 : 2, p = [];
        for (let k = 0; k < n; k++) p.push([(rel ? cx : 0) + num(), (rel ? cy : 0) + num()]);
        const P0 = [cx, cy];
        for (let k = 1; k <= pas; k++) {
          const t = k / pas, s = 1 - t;
          pts.push(n === 3
            ? [s * s * s * P0[0] + 3 * s * s * t * p[0][0] + 3 * s * t * t * p[1][0] + t * t * t * p[2][0], s * s * s * P0[1] + 3 * s * s * t * p[0][1] + 3 * s * t * t * p[1][1] + t * t * t * p[2][1]]
            : [s * s * P0[0] + 2 * s * t * p[0][0] + t * t * p[1][0], s * s * P0[1] + 2 * s * t * p[0][1] + t * t * p[1][1]]);
        }
        cx = p[n - 1][0]; cy = p[n - 1][1];
      } else { i += NARGS[C] || 1; }
    }
    return pts;
  }
  const longueur = (str) => { const p = points(str, 16); let l = 0; for (let k = 1; k < p.length; k++) l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); return l; };
  const polyD = (pts, ferme = true) => 'M' + pts.map(([x, y]) => r2(x) + ' ' + r2(y)).join('L') + (ferme ? 'Z' : '');

  /** hachures : des traits parallèles (angle en degrés, pas) dans une forme fermée → un seul <path> */
  function hachures(forme, ang = 45, pas = 3) {
    const poly = typeof forme === 'string' ? points(forme, 8) : forme;
    const a = (ang * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const rp = poly.map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca]);
    let y0 = Infinity, y1 = -Infinity;
    rp.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    let out = '';
    for (let yy = Math.floor(y0 / pas) * pas + pas / 2; yy < y1; yy += pas) {
      const xs = [];
      for (let k = 0; k < rp.length; k++) {
        const [xa, ya] = rp[k], [xb, yb] = rp[(k + 1) % rp.length];
        if ((ya <= yy && yb > yy) || (yb <= yy && ya > yy)) xs.push(xa + ((yy - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        if (xs[k + 1] - xs[k] < 0.6) continue;
        out += 'M' + r2(xs[k] * ca - yy * sa) + ' ' + r2(xs[k] * sa + yy * ca) + 'L' + r2(xs[k + 1] * ca - yy * sa) + ' ' + r2(xs[k + 1] * sa + yy * ca);
      }
    }
    return out;
  }
  /** points décalés d'un chemin (dist > 0 : à gauche du sens de parcours, à l'écran) */
  function decalage(str, dist, ferme = false, pas = 10) {
    const p = typeof str === 'string' ? points(str, pas) : str, q = [p[0]];
    for (let i = 1; i < p.length; i++) if (Math.hypot(p[i][0] - q[q.length - 1][0], p[i][1] - q[q.length - 1][1]) > 0.4) q.push(p[i]);
    if (ferme && q.length > 2 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 0.6) q.pop();
    const n = q.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = q[ferme ? (i - 1 + n) % n : Math.max(0, i - 1)], b = q[ferme ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
      out.push([q[i][0] + (ty / L) * dist, q[i][1] - (tx / L) * dist]);
    }
    return out;
  }
  /** un polygone coupé par le demi-plan a·x + b·y + c ≥ 0 */
  function demiPlan(poly, a, b, c) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
      if (fp >= 0) out.push(P);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]); }
    }
    return out;
  }
  const bandeX = (poly, xa, xb) => demiPlan(demiPlan(poly, 1, 0, -xa), -1, 0, xb);
  /** un polygone coupé, rendu comme une ligne ouverte qui ne longe pas la coupe a·x + b·y + c = 0 */
  function ouvrir(poly, a, b, c) {
    const n = poly.length, sur = (p) => Math.abs(a * p[0] + b * p[1] + c) < 1e-6 * Math.hypot(a, b) + 1e-6;
    for (let i = 0; i < n; i++) {
      if (sur(poly[i]) && sur(poly[(i + 1) % n])) return poly.slice(i + 1).concat(poly.slice(0, i + 1));
    }
    return poly.concat([poly[0]]);
  }
  /** un semis de points dans une forme (liège, mousse, daim) : un seul <path> de points ronds */
  function semis(forme, n, graine = 7) {
    const poly = typeof forme === 'string' ? points(forme, 8) : forme;
    let a = graine >>> 0;
    const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    poly.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    const dedans = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    let s = '', k = 0, essais = 0;
    while (k < n && essais++ < n * 20) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (dedans(x, y)) { s += `M${r2(x)} ${r2(y)}h.01`; k++; }
    }
    return s;
  }
  /** une ondulation (bord de crêpe, laine, fil) */
  function onde(x0, x1, y, amp = 1.2, per = 5) {
    let s = `M${r2(x0)} ${r2(y)}`;
    for (let x = x0; x < x1 - 0.1; x += per) s += `Q${r2(x + per / 4)} ${r2(y - amp)} ${r2(x + per / 2)} ${r2(y)}T${r2(Math.min(x1, x + per))} ${r2(y)}`;
    return s;
  }

  /* ======================================================================
     Le papier et le trait (injectés une fois) ; les animations de chaque plan (à la demande)
     ====================================================================== */
  const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .78 0 0 0 0 .9 0 0 0 0 1 0 0 0 .13 -.035'/%3E%3C/filter%3E%3Crect width='150' height='150' filter='url(%23g)'/%3E%3C/svg%3E\")";
  const TACHES = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='t'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' seed='7' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .05 0 0 0 0 .12 0 0 0 0 .25 0 0 0 .5 -.2'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23t)'/%3E%3C/svg%3E\")";
  const CSS_BASE = `
.plan{--pl-1:#EEF8FF;--pl-2:#C3E3F8;--pl-3:#8FC4EA;--pl-ac:#F4D56E;--pl-f:rgba(210,236,255,.1);--u:1;display:block;overflow:hidden;-webkit-user-select:none;user-select:none;
background-color:#1A4A80;
background-image:${GRAIN},${TACHES},radial-gradient(130% 120% at 40% 35%,rgba(38,98,164,.5),rgba(28,78,134,0) 55%,rgba(8,26,54,.42) 100%),linear-gradient(rgba(170,214,250,.12) .6px,transparent .6px),linear-gradient(90deg,rgba(170,214,250,.12) .6px,transparent .6px),linear-gradient(rgba(170,214,250,.055) .5px,transparent .5px),linear-gradient(90deg,rgba(170,214,250,.055) .5px,transparent .5px),linear-gradient(165deg,#1C4E86,#15406F);
background-size:150px 150px,300px 300px,100% 100%,40px 40px,40px 40px,8px 8px,8px 8px,100% 100%;background-position:0 0,0 0,0 0,-1px -1px,-1px -1px,-1px -1px,-1px -1px,0 0}
span.plan{position:relative}
.plan>svg{position:absolute;left:0;top:0;width:100%;height:100%;display:block;overflow:hidden}
.plan-mini{width:64px;height:48px;background-size:150px 150px,300px 300px,100% 100%,16px 16px,16px 16px,4px 4px,4px 4px,100% 100%}
.plan-grand{width:100%;height:auto;aspect-ratio:320/220}
.plan path,.plan circle,.plan ellipse,.plan rect,.plan polyline,.plan polygon{fill:none;stroke:var(--pl-1);stroke-linecap:round;stroke-linejoin:round;stroke-width:calc(var(--u)*1.2px)}
.plan .t{stroke-width:calc(var(--u)*1.3px)}
.plan .t2{stroke:var(--pl-2);stroke-width:calc(var(--u)*.85px)}
.plan .t3{stroke:var(--pl-3);stroke-width:calc(var(--u)*.6px)}
.plan .c{stroke:var(--pl-3);stroke-width:calc(var(--u)*.5px);opacity:.55}
.plan .h{stroke:var(--pl-2);stroke-width:calc(var(--u)*.8px);stroke-linecap:butt}
.plan .pt{stroke:var(--pl-2);stroke-width:calc(var(--u)*.85px);stroke-linecap:butt}
.plan .ax{stroke:var(--pl-3);stroke-width:calc(var(--u)*.55px);stroke-linecap:butt}
.plan .hc{stroke:var(--pl-3);stroke-width:calc(var(--u)*.55px)}
.plan .dots{stroke:var(--pl-2);stroke-width:calc(var(--u)*1.1px)}
.plan .f{fill:var(--pl-f)}
.plan .fl{fill:var(--pl-1);stroke:none}
.plan .fl2{fill:var(--pl-2);stroke:none}
.plan .ac{stroke:var(--pl-ac)}
.plan .acf{fill:var(--pl-ac);stroke:none}
.plan .fa{fill:rgba(226,242,255,.16)}
.plan .fw{fill:rgba(238,248,255,.5)}
.plan .nf{stroke:var(--pl-ac);stroke-width:calc(var(--u)*.7px)}
.plan .gras{stroke-width:calc(var(--u)*1.9px)}
.plan text{fill:var(--pl-1);stroke:none}
.plan .n{font-family:var(--main,cursive);fill:var(--pl-ac)}
.plan .nb{font-family:var(--chiffres,var(--sans,sans-serif));font-variant-numeric:tabular-nums;fill:var(--pl-1)}
.plan .ca{font-family:var(--sans,sans-serif);letter-spacing:.09em;fill:var(--pl-2)}
.plan .cb{font-family:var(--sans,sans-serif);letter-spacing:.06em;fill:var(--pl-1);font-weight:600}
.plan .a{transform-box:view-box}
.plan .i-tr{stroke-dasharray:100 102;animation:pl-tr .95s cubic-bezier(.45,0,.2,1) both}
.plan .i-tr1{animation-delay:.12s}.plan .i-tr2{animation-delay:.24s}.plan .i-tr3{animation-delay:.36s}
.plan .i-fa{animation:pl-fa .6s ease .55s both}
.plan .i-fm{animation:pl-fa .45s ease both}
@keyframes pl-tr{from{stroke-dashoffset:101}to{stroke-dashoffset:0}}
@keyframes pl-fa{from{opacity:0}to{opacity:1}}
.plan.plan-obs:not(.joue) .a,.plan.plan-pause .a{animation-play-state:paused!important}
.plan.fixe .a{animation:none!important}
@media (prefers-reduced-motion:reduce){.plan .a{animation:none!important}}
`;
  let feuilleCss = null;
  const injectes = new Set();
  function css() {
    if (feuilleCss) return feuilleCss;
    const el = document.createElement('style');
    el.id = 'co-plans-css';
    el.textContent = CSS_BASE;
    document.head.appendChild(el);
    feuilleCss = el.sheet;
    return feuilleCss;
  }
  function injecter(sc) {
    if (injectes.has(sc.id) || typeof document === 'undefined') return;
    injectes.add(sc.id);
    const sh = css();
    compiler(sc).forEach((r) => {
      try { sh.insertRule(r, sh.cssRules.length); } catch (e) { console.warn('plans : règle refusée', sc.id, r.slice(0, 90), e); }
    });
  }

  /* ---------- Les animations : des images clés en secondes, compilées en CSS ----------
     k: { nom: [[t, { o, x, y, r, s, sx, sy, d }, ease], …] }  ou  { o: [ox, oy], k: […], fin }
     o opacité · x, y translation (unités de la planche) · r rotation (deg) · s / sx / sy échelle
     d stroke-dashoffset · ease (segment qui suit) : l, i, o, io, b (rebond), sN (N marches)
     Une valeur non donnée reste celle de l'image précédente ; la boucle revient à la 1re image.
     L'état à t = fin (s) devient le style de base : ce qu'on voit sans animation. */
  const EASE = { l: 'linear', i: 'ease-in', o: 'ease-out', io: 'ease-in-out', b: 'cubic-bezier(.3,1.55,.55,1)' };
  const easeCss = (e) => (!e ? null : /^s\d+$/.test(e) ? `steps(${e.slice(1)},end)` : EASE[e] || e);
  const DEF = { o: 1, x: 0, y: 0, r: 0, sx: 1, sy: 1, d: 0 };
  function etats(pts) {
    let st = Object.assign({}, DEF);
    return pts.map(([t, p = {}, e]) => {
      const q = Object.assign({}, p);
      if (q.s != null) { q.sx = q.s; q.sy = q.s; delete q.s; }
      st = Object.assign({}, st, q);
      return { t, st, e };
    });
  }
  function styleDe(st, used) {
    let s = '';
    if (used.o) s += `opacity:${r2(st.o)};`;
    const px = (v) => (r2(v) === 0 ? '0' : r2(v) + 'px');
    if (used.t) s += `transform:translate(${px(st.x)},${px(st.y)})${used.r ? ` rotate(${r2(st.r)}deg)` : ''}${used.s ? ` scale(${r2(st.sx)},${r2(st.sy)})` : ''};`;
    if (used.d) s += `stroke-dashoffset:${r2(st.d)};`;
    return s;
  }
  function compiler(sc) {
    const D = sc.D, rules = [];
    const sel = '.pl-' + sc.cle;
    const ks = typeof sc.k === 'function' ? sc.k() : sc.k || {};
    Object.keys(ks).forEach((nom) => {
      if (sc.noms && !sc.noms.has(nom)) return;
      const spec = Array.isArray(ks[nom]) ? { k: ks[nom] } : ks[nom];
      const brut = spec.k.slice().sort((a, b) => a[0] - b[0]);
      const u = {};
      brut.forEach(([, p = {}]) => Object.keys(p).forEach((c) => {
        if (c === 'o') u.o = 1;
        else if (c === 'd') u.d = 1;
        else { u.t = 1; if (c === 'r') u.r = 1; if (c[0] === 's') u.s = 1; }
      }));
      const fr = etats(brut);
      if (sc.mini && u.d) {
        const dMax = Math.max(...fr.map((f) => f.st.d)) || 1;
        fr.forEach((f) => { f.st = Object.assign({}, f.st, { o: f.st.o * (1 - f.st.d / dMax), d: 0 }); if (f.e && /^s\d+$/.test(f.e)) f.e = null; });
        u.d = 0; u.o = 1;
      }
      if (fr[0].t > 0) fr.unshift({ t: 0, st: fr[0].st });
      if (fr[fr.length - 1].t < D) fr.push({ t: D, st: fr[0].st });
      const img = fr.map((f) => {
        const e = easeCss(f.e);
        return `${r2((Math.min(D, f.t) / D) * 100)}%{${styleDe(f.st, u)}${e ? `animation-timing-function:${e};` : ''}}`;
      });
      const nomK = `plk-${sc.cle}-${nom}`;
      rules.push(`@keyframes ${nomK}{${img.join('')}}`);
      const tf = spec.fin != null ? spec.fin : sc.fin;
      let a = fr[0], b = fr[0];
      for (const f of fr) { if (f.t <= tf) a = f; if (f.t >= tf) { b = f; break; } }
      const w = b.t > a.t ? (tf - a.t) / (b.t - a.t) : 0;
      const fin = {};
      Object.keys(DEF).forEach((c) => { fin[c] = a.st[c] + (b.st[c] - a.st[c]) * w; });
      const orig = spec.o ? `transform-origin:${r2(spec.o[0])}px ${r2(spec.o[1])}px;` : '';
      rules.push(`${sel} .k-${nom}{${styleDe(fin, u)}${orig}animation:${nomK} ${D}s linear ${r2(INTRO + (spec.dec || 0))}s infinite both}`);
    });
    return rules;
  }

  /* Des séquences toutes faites (D = durée de la boucle) */
  const KF = {
    // la pièce usée : en place, puis s'en va (dx, dy) en s'effaçant ; revient pendant la remise à zéro
    part: (t0, t1, dx, dy, D, e = 'i') => [[0, { o: 1, x: 0, y: 0 }], [t0, {}, e], [t1, { o: 0, x: dx, y: dy }], [D - 0.45, { x: 0, y: 0 }], [D - 0.12, { o: 1 }]],
    // la pièce neuve : paraît décalée, glisse en place, reste ; s'efface à la fin
    arrive: (t0, t1, dx, dy, D, e = 'o') => [[0, { o: 0, x: dx, y: dy }], [t0, {}], [t0 + 0.2, { o: 1 }, e], [t1, { x: 0, y: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: dx, y: dy }]],
    // paraît à t0 et reste jusqu'à la remise à zéro (ou t1)
    montre: (t0, D, t1) => { const f = t1 != null ? t1 : D - 0.75; return [[0, { o: 0 }], [t0, {}], [t0 + 0.3, { o: 1 }], [f, {}], [f + 0.3, { o: 0 }]]; },
    // visible au début, s'efface à t0, revient à la remise à zéro
    cache: (t0, D, f = 0.3) => [[0, { o: 1 }], [t0, {}], [t0 + f, { o: 0 }], [D - 0.45, {}], [D - 0.15, { o: 1 }]],
    // visible entre t0 et t1 seulement (flèches, outils)
    entre: (t0, t1, f = 0.2) => [[0, { o: 0 }], [t0, {}], [t0 + f, { o: 1 }], [t1 - f, {}], [t1, { o: 0 }]],
    // éclairs (impacts) aux instants ts
    clic: (ts, dur = 0.18) => { const k = [[0, { o: 0 }]]; ts.forEach((t) => k.push([t, {}], [t + 0.04, { o: 1 }], [t + dur, { o: 0 }])); return k; },
    // n points qui paraissent un à un entre t0 et t1 (cf. d.couture)
    points: (n, t0, t1, D) => [[0, { d: n, o: 1 }], [t0, {}, 's' + n], [t1, { d: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { d: n }], [D - 0.05, { o: 1 }]],
    // un trait qui se dessine (cf. d.trace) entre t0 et t1
    trace: (t0, t1, D, e = 'io') => [[0, { d: 101, o: 1 }], [t0, {}, e], [t1, { d: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { d: 101 }], [D - 0.05, { o: 1 }]],
    // un éclat qui palpite (échelle) à partir de t0
    brille: (t0, D) => [[0, { o: 0, s: 0.4 }], [t0, {}, 'b'], [t0 + 0.35, { o: 1, s: 1 }], [t0 + 0.7, { s: 0.75 }, 'io'], [t0 + 1.05, { s: 1 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { s: 0.4 }]],
  };

  /* ======================================================================
     Le trait : primitives (chaînes SVG). d = le contexte d'un exemplaire (mini ou grand).
     ====================================================================== */
  function contexte(o) {
    const { mini, u, uid } = o;
    const dash = (a) => a.map((v) => r2(v * u)).join(' ');
    const d = {
      mini, grand: !mini, u, uid, defs: '',
      id: (n) => uid + '-' + n,
      p: (path, cls = 't', x = '') => (path ? `<path d="${path}" class="${cls}"${x}/>` : ''),
      l: (x1, y1, x2, y2, cls = 't2', x = '') => `<path d="M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}" class="${cls}"${x}/>`,
      c: (cx, cy, r, cls = 't2', x = '') => `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" class="${cls}"${x}/>`,
      e: (cx, cy, rx, ry, cls = 't2', x = '') => `<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}" class="${cls}"${x}/>`,
      r: (x, y, w, h, rx, cls = 't2', xx = '') => `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}"${rx ? ` rx="${r2(rx)}"` : ''} class="${cls}"${xx}/>`,
      h: (path, cls = 'h') => `<path d="${path}" class="${cls}" stroke-dasharray="${dash([3, 2])}"/>`,
      pt: (path, cls = 'pt', a = [2.2, 1.7]) => `<path d="${path}" class="${cls}" stroke-dasharray="${dash(a)}"/>`,
      ax: (path) => `<path d="${path}" class="ax" stroke-dasharray="${dash([10, 2, 1.6, 2])}"/>`,
      hc: (forme, ang, pas, cls = 'hc') => { const h = hachures(forme, ang, pas * (mini ? Math.max(1, u * 0.55) : 1)); return h ? `<path d="${h}" class="${cls}"/>` : ''; },
      dots: (forme, n, graine, cls = 'dots') => `<path d="${semis(forme, mini ? Math.ceil(n / 3) : n, graine)}" class="${cls}"/>`,
      g: (inner, cls, x = '') => (inner ? `<g${cls ? ` class="${cls}"` : ''}${x}>${inner}</g>` : ''),
      k: (nom, inner, x = '') => (inner ? `<g class="a k-${nom}"${x}>${inner}</g>` : ''),
      // un trait qui se dessine à l'ouverture (chemin seulement : pathLength)
      tr: (path, cls = 't', n = 0) => (mini ? `<path d="${path}" class="${cls}"/>` : `<path d="${path}" pathLength="100" class="${cls} a i-tr${n ? ' i-tr' + n : ''}"/>`),
      fa: (inner) => (inner ? (mini ? inner : `<g class="a i-fa">${inner}</g>`) : ''),
      // un trait qui se dessine pendant la boucle (KF.trace)
      trace: (nom, path, cls = 't') => (mini ? `<path d="${path}" class="${cls} a k-${nom}"/>` : `<path d="${path}" pathLength="100" class="${cls} a k-${nom}" style="stroke-dasharray:100 102"/>`),
      txt: (x, y, s, cls = 'n', fs = 12, anc = 'start', x2 = '') => `<text x="${r2(x)}" y="${r2(y)}" class="${cls}" font-size="${fs}"${anc !== 'start' ? ` text-anchor="${anc}"` : ''}${x2}>${esc(s)}</text>`,
      clip: (nom, forme) => { d.defs += `<clipPath id="${uid}-${nom}">${forme}</clipPath>`; return `clip-path="url(#${uid}-${nom})"`; },
    };
    /** des points de couture qui paraissent un à un (un seul élément : pointillés + marches) → { svg, n } */
    d.couture = (path, nom, pasU = 4.2, cls = 'pt') => {
      const L = longueur(path);
      if (mini) return { svg: `<path d="${path}" class="${cls} a k-${nom}" stroke-dasharray="${dash([2.4, 1.9])}"/>`, n: 1 };
      const n = Math.max(3, Math.round(L / pasU));
      const a = [];
      for (let k = 0; k < n; k++) a.push(0.58, k === n - 1 ? 0.42 + n + 1 : 0.42);
      return { svg: `<path d="${path}" pathLength="${n}" class="${cls} a k-${nom}" stroke-dasharray="${a.map(r2).join(' ')}"/>`, n };
    };
    return d;
  }

  /* ---------- Conventions du dessin technique ---------- */
  function fleche(d, x, y, vx, vy, lg = 4.2, la = 1.5, cls = 'fl') {
    const L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
    return `<path d="M${r2(x)} ${r2(y)}L${r2(x - ux * lg - uy * la)} ${r2(y - uy * lg + ux * la)}L${r2(x - ux * lg + uy * la)} ${r2(y - uy * lg - ux * la)}Z" class="${cls}"/>`;
  }
  /** cote entre deux points, décalée de `dec` (à gauche du vecteur 1→2, à l'écran), étiquette au milieu */
  function cote(d, x1, y1, x2, y2, txt, dec = 10, o = {}) {
    if (d.mini) return '';
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const nx = uy, ny = -ux;
    const s = Math.sign(dec) || 1;
    const ax = x1 + nx * dec, ay = y1 + ny * dec, bx = x2 + nx * dec, by = y2 + ny * dec;
    let out = '';
    if (!o.sansAttache) {
      out += d.l(x1 + nx * s * 1.8, y1 + ny * s * 1.8, ax + nx * s * 2.6, ay + ny * s * 2.6, 't3');
      out += d.l(x2 + nx * s * 1.8, y2 + ny * s * 1.8, bx + nx * s * 2.6, by + ny * s * 2.6, 't3');
    }
    out += d.l(ax, ay, bx, by, 't3');
    out += fleche(d, ax, ay, -ux, -uy, 4, 1.25, 'fl2') + fleche(d, bx, by, ux, uy, 4, 1.25, 'fl2');
    const mx = (ax + bx) / 2 + nx * s * 4.2 + (o.dx || 0), my = (ay + by) / 2 + ny * s * 4.2 + (o.dy || 0);
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const t = d.txt(0, 0, txt, 'nb', o.fs || 7.5, 'middle', ' dominant-baseline="central"');
    out += `<g transform="translate(${r2(mx)} ${r2(my)})${Math.abs(ang) > 0.5 ? ` rotate(${r2(ang)})` : ''}">${t}</g>`;
    return out;
  }
  /** repère numéroté : cercle + numéro, attache vers le point visé */
  function rep(d, n, cx, cy, px, py) {
    if (d.mini) return '';
    const dx = px - cx, dy = py - cy, L = Math.hypot(dx, dy) || 1, R0 = 5.4;
    return d.l(cx + (dx / L) * R0, cy + (dy / L) * R0, px, py, 't3') + d.c(px, py, 1.1, 'fl') + d.c(cx, cy, R0, 't2') +
      d.txt(cx, cy + 0.2, String(n), 'nb', 7.4, 'middle', ' dominant-baseline="central"');
  }
  /** note manuscrite (crayon jaune) avec, au besoin, sa flèche courbe vers ce qu'elle désigne */
  function note(d, x, y, txt, o = {}) {
    if (d.mini) return '';
    let s = d.txt(x, y, txt, 'n', o.fs || 12.5, o.a || 'start');
    if (o.vers) {
      const [tx, ty] = o.vers;
      const fx = o.de ? o.de[0] : x, fy = o.de ? o.de[1] : y + 3;
      const c = o.courbe != null ? o.courbe : 8;
      const ddx = tx - fx, ddy = ty - fy, L0 = Math.hypot(ddx, ddy) || 1;
      const mx = (fx + tx) / 2 - (ddy / L0) * c, my = (fy + ty) / 2 + (ddx / L0) * c;
      s += `<path d="M${r2(fx)} ${r2(fy)}Q${r2(mx)} ${r2(my)} ${r2(tx)} ${r2(ty)}" class="nf"/>`;
      const vx = tx - mx, vy = ty - my, L = Math.hypot(vx, vy) || 1, ux = vx / L, uy = vy / L;
      s += `<path d="M${r2(tx - ux * 4 - uy * 2.2)} ${r2(ty - uy * 4 + ux * 2.2)}L${r2(tx)} ${r2(ty)}L${r2(tx - ux * 4 + uy * 2.2)} ${r2(ty - uy * 4 - ux * 2.2)}" class="nf"/>`;
    }
    return s;
  }
  /** flèche de mouvement (au crayon jaune) : droite ou courbe (c = flèche de la courbe) */
  function mouvement(d, x1, y1, x2, y2, c = 0) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const qx = mx - (dy / L) * c, qy = my + (dx / L) * c;
    const vx = x2 - qx, vy = y2 - qy, Lv = Math.hypot(vx, vy) || 1;
    return `<path d="M${r2(x1)} ${r2(y1)}Q${r2(qx)} ${r2(qy)} ${r2(x2)} ${r2(y2)}" class="ac" style="stroke-width:calc(var(--u)*1.1px)"/>` + fleche(d, x2 + (vx / Lv) * 1.5, y2 + (vy / Lv) * 1.5, vx, vy, 5, 2.2, 'acf');
  }
  /** le sol : un trait et ses hachures dessous */
  function sol(d, x1, x2, y) {
    let s = d.l(x1, y, x2, y, 't2');
    if (d.grand) { let h = ''; for (let x = x1 + 3; x < x2 - 1; x += 5) h += `M${r2(x)} ${r2(y + 0.6)}L${r2(x - 3.4)} ${r2(y + 4)}`; s += `<path d="${h}" class="t3"/>`; }
    return s;
  }
  /** ligne de rupture (vue partielle) */
  function rupture(d, x, y1, y2) {
    const m = (y1 + y2) / 2;
    return d.p(`M${r2(x)} ${r2(y1)}L${r2(x)} ${r2(m - 4)}L${r2(x - 3)} ${r2(m - 1.5)}L${r2(x + 3)} ${r2(m + 1.5)}L${r2(x)} ${r2(m + 4)}L${r2(x)} ${r2(y2)}`, 't3');
  }
  /** ligne de rupture horizontale */
  function ruptureH(d, x1, x2, y) {
    const m = (x1 + x2) / 2;
    return d.p(`M${r2(x1)} ${r2(y)}L${r2(m - 4)} ${r2(y)}L${r2(m - 1.5)} ${r2(y - 3)}L${r2(m + 1.5)} ${r2(y + 3)}L${r2(m + 4)} ${r2(y)}L${r2(x2)} ${r2(y)}`, 't3');
  }
  /** petites marques d'impact (un coup de marteau, un clic) */
  function impact(d, x, y, r = 5, ang0 = -90, n = 3, ouv = 70) {
    let s = '';
    for (let k = 0; k < n; k++) {
      const a = ((ang0 - ouv / 2 + (ouv * k) / Math.max(1, n - 1)) * Math.PI) / 180;
      s += `M${r2(x + Math.cos(a) * r)} ${r2(y + Math.sin(a) * r)}L${r2(x + Math.cos(a) * r * 1.8)} ${r2(y + Math.sin(a) * r * 1.8)}`;
    }
    return `<path d="${s}" class="ac" style="stroke-width:calc(var(--u)*1px)"/>`;
  }
  /** un éclat de propre (étoile à 4 branches) */
  function eclat(d, x, y, r = 5) {
    const q = r * 0.2;
    return `<path d="M${r2(x)} ${r2(y - r)}Q${r2(x + q)} ${r2(y - q)} ${r2(x + r)} ${r2(y)}Q${r2(x + q)} ${r2(y + q)} ${r2(x)} ${r2(y + r)}Q${r2(x - q)} ${r2(y + q)} ${r2(x - r)} ${r2(y)}Q${r2(x - q)} ${r2(y - q)} ${r2(x)} ${r2(y - r)}Z" class="t2 fw"/>`;
  }
  /** une goutte (pointe en haut) */
  function goutte(d, x, y, r = 3, cls = 't2') {
    return d.p(`M${r2(x)} ${r2(y - r * 2.1)}C${r2(x + r * 0.5)} ${r2(y - r * 1.2)} ${r2(x + r)} ${r2(y - r * 0.6)} ${r2(x + r)} ${r2(y)}C${r2(x + r)} ${r2(y + r * 1.3)} ${r2(x - r)} ${r2(y + r * 1.3)} ${r2(x - r)} ${r2(y)}C${r2(x - r)} ${r2(y - r * 0.6)} ${r2(x - r * 0.5)} ${r2(y - r * 1.2)} ${r2(x)} ${r2(y - r * 2.1)}Z`, cls);
  }
  /** une perle d'eau posée (demi-bulle et son reflet) */
  function perle(d, x, y, r = 3) {
    return d.p(`M${r2(x - r)} ${r2(y)}C${r2(x - r)} ${r2(y - r * 1.2)} ${r2(x + r)} ${r2(y - r * 1.2)} ${r2(x + r)} ${r2(y)}Z`, 't2 fa') + d.p(`M${r2(x - r * 0.45)} ${r2(y - r * 0.5)}Q${r2(x - r * 0.2)} ${r2(y - r * 0.8)} ${r2(x + r * 0.1)} ${r2(y - r * 0.75)}`, 't3');
  }
  /** une coche (à dessiner : KF.trace) */
  const coche = (x, y, s = 1) => `M${r2(x - 4 * s)} ${r2(y)}L${r2(x - 1.2 * s)} ${r2(y + 3 * s)}L${r2(x + 5 * s)} ${r2(y - 4.2 * s)}`;
  /** le cercle d'une zone à reprendre (pointillés) */
  const zone = (d, x, y, rx, ry) => `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(rx)}" ry="${r2(ry)}" class="t3" stroke-dasharray="${r2(2.6 * d.u)} ${r2(1.8 * d.u)}"/>`;

  /* ---------- Le cadre et le cartouche (grand plan) ---------- */
  function cadre(d) {
    let s = d.r(3.5, 3.5, W - 7, H - 7, 0, 't3') + d.r(7, 7, W - 14, H - 14, 0, 't2');
    s += d.l(W / 2, 3.5, W / 2, 7, 't3') + d.l(W / 2, H - 3.5, W / 2, H - 7, 't3') + d.l(3.5, H / 2, 7, H / 2, 't3') + d.l(W - 3.5, H / 2, W - 7, H / 2, 't3');
    return s;
  }
  function cartouche(d, sc, n, titre) {
    const x0 = 196, y0 = 186, x1 = W - 7, y1 = H - 7, xc = x1 - 26;
    const nom = (titre || '').toUpperCase();
    let s = d.r(x0, y0, x1 - x0, y1 - y0, 0, 't2');
    s += d.l(x0, y0 + 8.5, x1, y0 + 8.5, 't3') + d.l(x0, y0 + 19.5, x1, y0 + 19.5, 't3') + d.l(xc, y0, xc, y0 + 8.5, 't3') + d.l(xc, y0 + 19.5, xc, y1, 't3');
    s += d.txt(x0 + 3, y0 + 6.1, 'CORDO 63 · ATELIER DU MAZET', 'ca', 4.6);
    s += d.txt(xc + 13, y0 + 6.1, 'PL. ' + (n > 0 ? String(n).padStart(2, '0') : '—'), 'ca', 4.6, 'middle');
    s += d.txt(x0 + 3, y0 + 16.4, nom.length > 31 ? nom.slice(0, 30) + '…' : nom, 'cb', nom.length > 24 ? 5.3 : 6.4);
    s += d.txt(x0 + 3, y1 - 2.4, (sc.vue || 'élévation').toUpperCase() + ' · ÉCH. ' + (sc.ech || '1:2'), 'ca', 4.3);
    s += d.txt(xc + 13, y1 - 2.4, 'C.P.', 'ca', 4.3, 'middle');
    return s;
  }

  /* ======================================================================
     Les pièces : chaussures, maroquinerie, clés, outils
     (coordonnées locales ; R(x, y, s, miroir) les pose sur la planche)
     ====================================================================== */

  /* --- Escarpin : origine sous le bout du talon, pointe à droite, talon de 68 --- */
  const ES = {
    tige: 'M-27.6 -70.8 C-34 -78 -35.4 -92 -31 -104 C-12 -101 20 -92 50 -80 C70 -72 86 -60 100 -50 C104 -47.8 108 -47 112 -46.6 C130 -42.4 152 -32 165 -20.6 C171.6 -14.6 175 -9.6 172 -6',
    semelle: 'M-27.6 -68 C-10 -68 5 -67.5 12 -66.5 C40 -62 70 -40 96 -14 C104 -6 112 -1 124 0 L150 0 C160 0 168 -2 172 -6',
    semelle2: 'M-27.6 -70.8 C-10 -70.8 5 -70.3 12.4 -69.3 C40.8 -64.6 71 -42.6 98 -16.2 C105.6 -8.8 113.2 -3.9 124.4 -2.7 L150 -2.7 C159 -2.7 165.4 -4.4 169.8 -7.8',
    talon: 'M-27 -67.6 C-25 -48 -12 -24 -5.2 -10 L5.2 -10 C3.6 -30 5 -52 12 -66.5',
    premiere: 'M-25 -75 C-8 -74.6 6 -74 14 -72.8 C42 -68 72 -45.6 99 -19.4 C106 -12.6 114 -7.6 124 -6.6',
    contrefort: 'M-30.4 -76 C-32.8 -85 -33 -95 -30.4 -101.4',
    doublure: 'M-26.6 -100.4 C-8 -97.6 22 -89 50 -77.6 C68 -70.4 84 -59.8 97 -50.8',
    boutUse: 'M-5.2 -10 L5.2 -10 L5.2 -4.4 L-0.4 -3.2 L-5.2 -5.8 Z',
    boutNeuf: 'M-5.2 -10 L5.2 -10 L5.2 -1.4 C5.2 -0.5 4.6 0 3.8 0 L-3.8 0 C-4.6 0 -5.2 -0.5 -5.2 -1.4 Z',
  };
  const P = {};
  P.escarpin = (d, T) => ({
    tige: d.p(T.d(ES.tige)), tigeTr: d.tr(T.d(ES.tige), 't', 0),
    semelle: d.p(T.d(ES.semelle)) + d.p(T.d(ES.semelle2), 't2'),
    talon: d.p(T.d(ES.talon)), talonTr: d.tr(T.d(ES.talon), 't', 1),
    details: d.grand ? d.h(T.d(ES.premiere)) + d.pt(T.d(ES.contrefort)) + d.p(T.d(ES.doublure), 't3') : '',
  });
  P.bout = (d, T, use) => {
    const f = use ? ES.boutUse : ES.boutNeuf;
    let s = d.p(T.d(f), use ? 't' : 't fa') + d.h(T.d('M-1.2 -10.6 L-1.2 -24 M1.2 -10.6 L1.2 -24'));
    if (use) s += d.p(T.d('M0 -3.4 L0 -0.4'), 't gras') + d.hc(T.d(f), 45, 1.7);
    return s;
  };

  /* --- Derby (ville) : origine au sol sous l'arrière du talon, pointe à droite, longueur 228 --- */
  const DB = {
    semelle: 'M0.4 -24 L52.8 -24 C78 -22.4 104 -8 132 -1.4 C140 0 150 0 186 0 C204 0 218 -3 227 -9.6 C228.8 -11 228.9 -12.8 227.6 -14.2 C217 -7.6 203 -4.5 186 -4.5 C150 -4.5 140 -4.6 131.4 -6 C103 -12.6 78 -27 52.8 -28.5 L0 -28.5 Z',
    semelleBas: 'M52.8 -24 C78 -22.4 104 -8 132 -1.4 C140 0 150 0 186 0 C204 0 218 -3 227 -9.6',
    talon: 'M2.6 -24 L3.4 0 L50.2 0 L52.8 -24',
    bon: 'M3.25 -5.2 L50.6 -5.2',
    lifts: 'M3 -10.6 L51.1 -10.6 M2.8 -16 L51.7 -16',
    tige: 'M0 -28.5 C-3.8 -40 -4.2 -62 3.6 -80 C22 -77.4 44 -71.6 62 -70.4 C70 -71 80 -76 88 -81.2 C92 -84.6 98 -86.6 102.4 -84.4 C104 -83.6 104.6 -82.6 104.4 -81.8 C130 -70.6 170 -54.6 198 -44.4 C214 -38.4 226 -28.6 227.6 -14.2',
    fermeTige: ' C217 -7.6 203 -4.5 186 -4.5 C150 -4.5 140 -4.6 131.4 -6 C103 -12.6 78 -27 52.8 -28.5 L0 -28.5 Z',
    quartier: 'M87 -80.4 C97 -66 108 -52 116 -40 C119 -31 119.2 -20 118.4 -8.4',
    contrefort: 'M0.6 -46 C13 -48.4 28 -46.6 38.6 -36.8 C41 -34 42 -31.4 42 -28.6',
    bout: 'M197 -44.8 C190 -35 188 -22 189.4 -4.6',
    trepointe: 'M54 -26.3 C79 -24.6 104 -10.4 131.8 -3.7 C140 -2.3 150 -2.25 186 -2.25 C203 -2.25 216 -5.4 226.2 -11.8',
    surpiqure: 'M4.8 -76 C22 -73.6 43 -68.2 60 -67',
    oeillets: [[95, -79.6], [103.2, -76.2], [111.4, -72.8], [119.6, -69.4]],
  };
  const CLOUS_TH = [10, 23, 36, 46]; // les clous du bonbout (talons homme)
  P.derby = (d, T, o = {}) => {
    const r = {
      tige: d.p(T.d(DB.tige)), tigeTr: d.tr(T.d(DB.tige), 't', 0),
      semelle: d.p(T.d(DB.semelle)), semelleTr: d.tr(T.d(DB.semelle), 't', 1),
      talon: d.p(T.d(DB.talon)) + d.p(T.d(DB.bon), 't2') + (d.grand ? d.p(T.d(DB.lifts), 't3') : ''),
      details: d.p(T.d(DB.quartier), 't2') + (o.sansBout ? '' : d.p(T.d(DB.bout), 't2')) + d.p(T.d(DB.contrefort), 't2'),
    };
    let oe = '', la = '';
    DB.oeillets.forEach(([x, y]) => {
      const [X, Y] = T.pt(x, y);
      if (d.grand) oe += d.c(X, Y, 1.25 * T.s, 't3');
      la += `M${r2(X)} ${r2(Y)}L${r2(X + 3.6 * T.s)} ${r2(Y - 5 * T.s)}`;
    });
    r.details += d.p(la, 't2') + oe;
    if (d.grand) {
      r.details += d.pt(T.d(DB.trepointe)) + d.pt(T.d(DB.surpiqure)) + d.pt(T.d('M2.6 -42.6 C14 -44.8 27 -43.2 36.4 -34.6'));
      if (!o.sansNoeud) r.details += d.p(T.d('M101 -85.6 C96 -93 103.6 -96 104 -89 C105.4 -96 113.6 -93.4 107.6 -85.4 M104 -87.6 L100 -80 M104.6 -87.4 L110 -80.6'), 't2');
    }
    return r;
  };

  /* --- Sneaker : origine au sol sous l'arrière, pointe à droite, longueur 200 --- */
  const SN = {
    semelle: 'M7 0 L172 0 C186 0 195 -3 199 -9 C201.5 -12.5 201.5 -16 199.5 -18 L3 -20 C0.5 -15 1 -5 7 0 Z',
    tige: 'M3 -20 C-1 -30 -1 -50 5 -64 C8 -69 14 -70 20 -67 C30 -62 42 -57 54 -57 C62 -57 68 -62 72 -70 C74 -76 79 -80 85 -79 C89 -78 91 -76 92 -73 C110 -64 132 -52 154 -44 C174 -38 193 -31 199.5 -18',
    rand: 'M2.2 -6.5 L174 -6.5 C185 -6.5 193 -8.5 197.6 -12.5',
    col: 'M8 -61.5 C12 -64.5 17 -64.5 23 -61.5 C33 -56.5 44 -52.5 54 -52.5 C61 -52.5 65 -55.5 68 -61',
    contrefort: 'M2 -40 C14 -44 27 -44 35 -36 C39 -31 40 -25 40 -19.6',
    bout: 'M176 -37 C170 -31 168.5 -25 169.5 -18.6',
    oeillets: 'M76 -64 C98 -56 122 -46 146 -38.5 C152 -36.5 158 -33 161 -27',
    flanc: 'M40 -26 C80 -26.5 130 -26.5 169.5 -25',
    trous: [[97, -70], [109, -64.6], [121, -59.2], [133, -53.8], [145, -48.4]],
  };
  P.sneaker = (d, T, o = {}) => {
    const r = {
      semelle: d.p(T.d(SN.semelle)), tige: d.p(T.d(SN.tige)),
      semelleTr: d.tr(T.d(SN.semelle), 't', 1), tigeTr: d.tr(T.d(SN.tige), 't', 0),
      rand: d.p(T.d(SN.rand), 't2'),
      details: d.p(T.d(SN.contrefort), 't2') + (o.sansBout ? '' : d.p(T.d(SN.bout), 't2')) + (o.sansOeillets ? '' : d.p(T.d(SN.oeillets), 't2')),
    };
    let oe = '', la = '';
    SN.trous.forEach(([x, y]) => {
      const [X, Y] = T.pt(x, y);
      if (d.grand) oe += d.c(X, Y, 1.25 * T.s, 't3');
      la += `M${r2(X - 3.2 * T.s)} ${r2(Y - 2.6 * T.s)}L${r2(X + 2.4 * T.s)} ${r2(Y + 1.6 * T.s)}`;
    });
    if (!o.sansLacets) r.details += d.p(la, 't2');
    if (d.grand) {
      r.details += d.p(T.d(SN.col), 't3') + d.p(T.d(SN.flanc), 't3') + oe;
      r.details += d.pt(T.d('M3.5 -13.4 L198.4 -12.6')) + d.pt(T.d('M4.6 -37.5 C15 -41 26 -41 33 -34 C36.6 -30 37.6 -25 37.6 -21'));
      if (!o.sansBout) r.details += d.pt(T.d('M172.6 -35.6 C167.2 -30 165.8 -24.6 166.6 -21'));
      let cr = '';
      for (let x = 14; x < 170; x += 7) { const [X, Y] = T.pt(x, 0); cr += `M${r2(X)} ${r2(Y - 0.8 * T.s)}L${r2(X)} ${r2(Y - 3.6 * T.s)}`; }
      r.details += d.p(cr, 't3');
    }
    return r;
  };

  /* --- Chelsea (bottine à élastiques) : origine au sol sous l'arrière, pointe à droite --- */
  const CH = {
    talon: 'M3 -25 L3.8 0 L48.4 0 L50.8 -25',
    semelle: 'M0.4 -25 L50.8 -25 C76 -23.4 104 -8.6 132 -1.6 C140 0 150 0 186 0 C204 0 218 -3.4 226 -10.4 C228 -12.2 228.2 -14.6 226.6 -16.4 C216 -9.4 202 -5.6 186 -5.6 C150 -5.6 140 -5.8 131 -7.2 C103 -14.2 76 -29.2 50.8 -30.6 L0 -30.6 Z',
    tige: 'M0 -30.6 C-3.6 -58 -2.8 -108 5.4 -148 L64 -146.4 C65 -124 70 -104 82 -92 C98 -78 134 -64 170 -54 C200 -45.6 222 -34 226.6 -16.4',
    soufflet: 'M24 -147.4 C27 -128 31.5 -110 38 -97 C44.5 -110 49 -128 52 -146.8',
    souffletF: 'M24 -147.4 C27 -128 31.5 -110 38 -97 C44.5 -110 49 -128 52 -146.8 Z',
    tirant: 'M5 -148 C3.6 -156 5 -161 9.4 -161.6 C13.6 -162 15.4 -157 14.4 -148.2',
    contrefort: 'M1 -50 C14 -52 28 -50 38 -40 C41.4 -36.4 42.4 -33.6 42.4 -30.6',
    bout: 'M198 -45.6 C191 -36 189 -22 190 -5.6',
    trepointe: 'M52 -27.8 C77 -26.2 104 -11.4 131.4 -4.4 C140 -2.8 150 -2.8 186 -2.8 C203 -2.8 216 -6 225 -13',
  };
  P.chelsea = (d, T) => ({
    tige: d.p(T.d(CH.tige)), tigeTr: d.tr(T.d(CH.tige), 't', 0),
    semelle: d.p(T.d(CH.semelle)), talon: d.p(T.d(CH.talon)) + d.p(T.d('M3.6 -5.4 L48.8 -5.4'), 't2'),
    details: d.p(T.d(CH.tirant), 't2') + d.p(T.d(CH.contrefort), 't2') + d.p(T.d(CH.bout), 't2') +
      (d.grand ? d.pt(T.d(CH.trepointe)) + d.pt(T.d('M6.6 -143.4 L22 -143')) + d.pt(T.d('M54 -142.6 L61.6 -142.4')) : ''),
  });

  /* --- Bottine à lacets, semelle crantée (type rangers) : origine au sol, pointe à droite --- */
  const BL = {
    tige: 'M3 -24 C-1.4 -50 -0.4 -96 6 -128 L60 -126 C61 -110 65 -100 74 -92 C88 -80 122 -66 160 -56 C196 -47 220 -36 226.4 -13.4',
    trepointe: 'M3 -24 L201 -21 C213 -20.6 223 -18.2 226.4 -13.4 L225 -9 C222 -14 212 -16.6 200 -17 L4 -20 Z',
    piqure: 'M6 -22 L200.4 -19 C212 -18.6 221 -16.2 224.6 -11.6',
    tirant: 'M7 -128 C5 -136 7 -140.6 11.4 -140.6 C15.6 -140.6 17 -136 15.6 -127.8',
    bout: 'M196 -47 C189 -40 187 -30 188 -21',
    contrefort: 'M1.6 -54 C16 -56 30 -52 40 -40 C43 -35 44 -29 44 -22.8',
    quartier: 'M60 -126 C61 -110 65 -100 74 -92 C80 -70 86 -46 86 -22',
    oeillets: [[57.4, -119], [59, -110], [61.4, -101.6], [65.6, -94], [72.4, -88.2], [80.4, -83.4]],
  };
  /** la semelle crantée : prof = hauteur des crampons (usée ≈ 1,2 ; neuve ≈ 5) */
  function semelleCrantee(prof) {
    let s = 'M4 -20 L200 -17 C212 -16.6 222 -14 225 -9 C226.6 -6 225.4 -' + r2(prof) + ' 221 -' + r2(prof) + ' L208 -' + r2(prof);
    const lugs = [];
    for (let x = 206; x > 10; x -= 14) lugs.push(x);
    lugs.forEach((x) => { s += ` L${x} -${r2(prof)} L${x} 0 L${x - 9} 0 L${x - 9} -${r2(prof)}`; });
    s += ` L6 -${r2(prof)} C2 -${r2(prof)} 0.6 -8 1 -12 C1.2 -16 2 -19 4 -20 Z`;
    return s;
  }
  P.botte = (d, T) => {
    let oe = '', la = '';
    BL.oeillets.forEach(([x, y], i) => {
      const [X, Y] = T.pt(x, y);
      if (d.grand) oe += d.c(X, Y, 1.3 * T.s, 't3');
      if (i < BL.oeillets.length) la += `M${r2(X)} ${r2(Y)}L${r2(X + 5 * T.s)} ${r2(Y - 3.4 * T.s)}`;
    });
    return {
      tige: d.p(T.d(BL.tige)), tigeTr: d.tr(T.d(BL.tige), 't', 0),
      trepointe: d.p(T.d(BL.trepointe), 't2'),
      details: d.p(T.d(BL.tirant), 't2') + d.p(T.d(BL.bout), 't2') + d.p(T.d(BL.contrefort), 't2') + d.p(T.d(BL.quartier), 't2') + d.p(la, 't2') + oe +
        (d.grand ? d.pt(T.d('M4.6 -50.4 C17 -52.4 29 -48.6 37.6 -38.4 C40.4 -33.8 41.4 -29 41.4 -24.6')) + d.pt(T.d('M192.6 -47.6 C186.4 -41 184.6 -31 185.6 -22.6')) : ''),
    };
  };

  /* --- Botte haute à fermeture (femme, talon bottier) : origine au sol, pointe à droite --- */
  const TB = {
    talon: 'M6 -34 L8 0 L40 0 L44 -34',
    semelle: 'M3.6 -34 L44 -34 C70 -30 100 -12 128 -2 C136 0 146 0 176 0 C192 0 204 -4 210 -10 C212 -12 212 -14.4 210.6 -15.6 C203 -9.4 191 -3.6 176 -3.6 C146 -3.6 136 -3.8 127 -5.4 C99 -15.4 70 -33.6 44 -37.4 L3.6 -37.4 Z',
    tige: 'M3.6 -37.4 C-2 -60 -4 -100 2 -140 C6 -180 6 -220 4 -250 L70 -250 C70 -210 68 -170 66 -140 C64 -120 68 -104 80 -94 C100 -78 150 -60 180 -46 C200 -36 210 -26 210.6 -15.6',
    zip: 'M26 -247 C25.6 -200 25 -150 24.4 -110 C24 -80 22.4 -60 18 -44',
    revers: 'M4 -238 L70 -238',
    bout: 'M186 -43 C180 -34 178.4 -24 179.4 -4',
    contrefort: 'M1.6 -64 C14 -66 30 -60 38 -46 C40.6 -42 42 -39 42.6 -37.4',
  };
  P.botteHaute = (d, T) => ({
    tige: d.p(T.d(TB.tige)), tigeTr: d.tr(T.d(TB.tige), 't', 0),
    semelle: d.p(T.d(TB.semelle)), talon: d.p(T.d(TB.talon)) + d.p(T.d('M7.6 -5 L40.4 -5'), 't2'),
    details: d.p(T.d(TB.revers), 't2') + d.p(T.d(TB.bout), 't2') + d.p(T.d(TB.contrefort), 't2') + (d.grand ? d.pt(T.d('M6 -233 L68 -233')) : ''),
  });

  /* --- Chukka / desert boot en daim, semelle crêpe : origine au sol, pointe à droite --- */
  const CK = {
    semelle: 'M2 -11 L210 -13 C212.6 -13.2 214 -11 213.4 -8.6 C212 -3.4 206 0 198 0 L8 0 C3 0 1 -4 1.4 -7 Z',
    tige: 'M2 -11 C-1 -30 -0.4 -62 5 -94 L56 -92 C58 -80 64 -72 76 -68 C98 -60 138 -50 170 -42 C194 -35.6 208 -27 210 -13',
    fermeTige: ' L2 -11 Z',
    quartier: 'M60 -91 C68 -78 78 -68 88 -60 C92 -48 94 -30 93 -12.2',
    contrefort: 'M1.6 -40 C12 -42 24 -40 32 -32 C34.6 -29 35.4 -24 35 -11.4',
    oeillets: [[64, -85], [71, -78.6], [78.4, -72.4]],
  };
  P.chukka = (d, T) => {
    let oe = '', la = '';
    CK.oeillets.forEach(([x, y]) => { const [X, Y] = T.pt(x, y); if (d.grand) oe += d.c(X, Y, 1.3 * T.s, 't3'); la += `M${r2(X)} ${r2(Y)}L${r2(X + 4 * T.s)} ${r2(Y - 4.4 * T.s)}`; });
    return {
      tige: d.p(T.d(CK.tige)), tigeTr: d.tr(T.d(CK.tige), 't', 0),
      semelle: d.p(T.d(CK.semelle)) + (d.grand ? d.p(T.d(onde(6, 206, -5.4, 0.9, 5)), 't3') : ''),
      details: d.p(T.d(CK.quartier), 't2') + d.p(T.d(CK.contrefort), 't2') + d.p(la, 't2') + oe +
        (d.grand ? d.p(T.d('M68 -88 C63 -95 70 -99 71 -91 C73 -99 81 -96 75 -88 M71 -90 L68 -82 M71.4 -89.8 L76.4 -83'), 't2') + d.pt(T.d('M5 -88.6 L53.6 -87')) : ''),
    };
  };

  /* --- Sandale deux brides, lit de liège : origine au sol sous l'arrière, pointe à droite --- */
  const SA = {
    semelle: 'M4 -9.6 C0.6 -8.4 0 -3 4.4 0 L198 0 C204.4 0 208.4 -3 208.4 -6.4 C208.4 -8.4 206.6 -9.6 204 -9.8 Z',
    semelleUsee: 'M4 -9.6 C0.6 -8.4 0.4 -6 3 -5 L40 -3 C80 -1 140 0 198 0 C204.4 0 208.4 -3 208.4 -6.4 C208.4 -8.4 206.6 -9.6 204 -9.8 Z',
    lit: 'M2.4 -27 C4 -22 10 -18.4 24 -18 C40 -17.6 60 -24.4 82 -25 C104 -25.4 122 -17.8 142 -17.4 C158 -17 167 -22.6 176 -22.8 C185 -23 191 -17.4 199 -16.8 C204 -16.4 207.4 -18.2 208.6 -20.2',
    litF: 'M2.4 -27 C4 -22 10 -18.4 24 -18 C40 -17.6 60 -24.4 82 -25 C104 -25.4 122 -17.8 142 -17.4 C158 -17 167 -22.6 176 -22.8 C185 -23 191 -17.4 199 -16.8 C204 -16.4 207.4 -18.2 208.6 -20.2 C209.4 -16 208 -12 204 -9.8 L4 -9.6 C1.6 -13 1 -20 2.4 -27 Z',
    bords: 'M2.4 -27 C1 -20 1.6 -13 4 -9.6 M208.6 -20.2 C209.4 -16 208 -12 204 -9.8',
    jute: 'M3 -12.4 L206.4 -12.6',
    daim: 'M4.6 -24.6 C7 -21.4 12 -19.8 24 -19.6 C40 -19.2 60 -26 82 -26.6 C104 -27 122 -19.4 142 -19 C158 -18.6 167 -24.2 176 -24.4 C185 -24.6 191 -19 199 -18.4 C203 -18 205.6 -19.4 206.6 -20.6',
    bride1: 'M116 -18 C114 -32 115.6 -47 120.4 -56.6 C123.6 -62.6 140 -60 145.6 -54.4 C150 -49.6 151.6 -34 150.6 -17.6',
    bride1p: 'M118.6 -18.4 C116.8 -32 118.2 -45.6 122.6 -54.2 C125.4 -59 138.4 -57 143.2 -52.4 C147 -48.2 148.6 -33.8 147.8 -17.8',
    bride2: 'M168 -22.6 C166.4 -33 167.4 -43.4 171.4 -49.6 C174.2 -54.4 188 -52.4 192.4 -47.6 C196 -43.2 197.2 -32 196.4 -17.4',
    bride2p: 'M170.6 -22.8 C169.2 -33 170.2 -42.2 173.6 -47.6 C176 -51.6 186.4 -50 190 -45.8 C193.2 -42 194.2 -31.6 193.6 -17.8',
    creux: 'M4 -24 C8 -21 14 -20 20 -20.2 C26 -20.4 30 -22 30 -24 L28 -26.4 C22 -26 12 -26.4 4 -24 Z',
  };
  P.sandale = (d, T) => ({
    lit: d.p(T.d(SA.lit)) + d.p(T.d(SA.bords)) + d.p(T.d(SA.jute), 't3') + (d.grand ? d.p(T.d(SA.daim), 't3') : ''),
    litTr: d.tr(T.d(SA.lit), 't', 0),
    liege: d.dots(T.d(SA.litF), 160, 11),
    brides: d.p(T.d(SA.bride1), 't') + d.p(T.d(SA.bride2), 't') + d.r(T.X(137.6), T.Y(-46), 9 * T.s, 11 * T.s, 1.2, 't2') + d.r(T.X(184.6), T.Y(-41), 8 * T.s, 10 * T.s, 1.2, 't2') +
      (d.grand ? d.pt(T.d(SA.bride1p)) + d.pt(T.d(SA.bride2p)) + d.l(T.X(142.1), T.Y(-46), T.X(142.1), T.Y(-35), 't3') + d.l(T.X(188.6), T.Y(-41), T.X(188.6), T.Y(-31), 't3') +
        d.c(T.X(142.1), T.Y(-29), 1.1 * T.s, 't3') + d.c(T.X(142.1), T.Y(-24.4), 1.1 * T.s, 't3') + d.c(T.X(188.6), T.Y(-26), 1.1 * T.s, 't3') : ''),
  });

  /* --- Dessous de semelle : origine au talon (bord arrière), axe horizontal, pointe à droite --- */
  const SD = {
    contour: 'M0 0 C0 -18 12 -30 32 -30 C52 -30 66 -26 84 -24 C104 -22 130 -40 164 -42 C196 -44 226 -34 230 -10 C233 8 216 30 186 36 C160 42 132 38 110 28 C90 20 70 26 50 28 C24 30 0 20 0 0 Z',
    talon: 'M53 -29.3 C56.6 -10 56.6 10 53 28.2',
  };
  const SD_POLY = points(SD.contour, 12);
  const SD_DEDANS = (dist) => decalage(SD_POLY, -dist, true);
  P.dessous = (d, T, o = {}) => {
    let s = '';
    if (o.talon !== false) {
      s += d.p(T.d(SD.talon), 't2');
      if (d.grand) {
        let cl = '';
        [[10, -8], [16, -17], [26, -22.4], [38, -24], [48, -22], [10, 8], [16, 17], [26, 22.4], [38, 24], [48, 22.4]].forEach(([x, y]) => { const [X, Y] = T.pt(x, y); cl += `M${r2(X)} ${r2(Y)}h.01`; });
        s += `<path d="${cl}" class="dots"/>`;
      }
    }
    return s;
  };

  /* --- Sac (cabas à anse) : origine au milieu du fond --- */
  const SC = {
    corps: 'M-74 0 L74 0 C78.6 0 80.8 -3 80.2 -7.4 L68 -88.6 C67.4 -92.4 64.6 -94.4 60.6 -94.4 L-60.6 -94.4 C-64.6 -94.4 -67.4 -92.4 -68 -88.6 L-80.2 -7.4 C-80.8 -3 -78.6 0 -74 0 Z',
    anse: 'M-38 -96 C-38 -140 38 -140 38 -96 L31 -96 C31 -131 -31 -131 -31 -96 Z',
    anseAxe: 'M-34.5 -96 C-34.5 -135.6 34.5 -135.6 34.5 -96',
    patteG: 'M-40 -101 L-29 -101 L-29 -86 L-40 -86 Z',
    patteD: 'M29 -101 L40 -101 L40 -86 L29 -86 Z',
    poche: 'M-52 -16 L52 -16 L56 -60 L-56 -60 Z',
  };
  P.sac = (d, T) => ({
    corps: d.p(T.d(SC.corps)), corpsTr: d.tr(T.d(SC.corps), 't', 0),
    details: d.p(T.d('M-66 -80 L66 -80'), 't3') + (d.grand ? d.pt(T.d('M-71.6 -5 L71.6 -5')) + d.pt(T.d('M-76 -8.6 L-64.6 -86')) + d.pt(T.d('M76 -8.6 L64.6 -86')) + d.pt(T.d('M-60 -89.6 L60 -89.6')) : '') +
      d.e(T.X(-56), T.Y(1.6), 3 * T.s, 1.6 * T.s, 't3') + d.e(T.X(56), T.Y(1.6), 3 * T.s, 1.6 * T.s, 't3'),
    anse: d.p(T.d(SC.anse), 't') + (d.grand ? d.pt(T.d('M-34.5 -98 C-34.5 -135.6 34.5 -135.6 34.5 -98')) : ''),
    pattes: d.p(T.d(SC.patteG), 't2') + d.p(T.d(SC.patteD), 't2'),
  });
  /** un point en croix (carré + X) sur une patte, à dessiner */
  const croix = (T, x, y, w, h) => T.d(`M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}`);

  /* --- Trousse à fermeture : origine au milieu du fond --- */
  const TR = {
    corps: 'M-80 0 L80 0 C86 0 90 -4 90 -10 L90 -64 C90 -70 86 -74 80 -74 L-80 -74 C-86 -74 -90 -70 -90 -64 L-90 -10 C-90 -4 -86 0 -80 0 Z',
  };

  /* --- Ceinture : origine au milieu de l'ardillon (sur la boucle), sangle vers la droite --- */
  const CE = {
    boucle: 'M-2 -17 L-24 -17 C-28 -17 -30 -15 -30 -11 L-30 11 C-30 15 -28 17 -24 17 L-2 17 C2 17 4 15 4 11 L4 -11 C4 -15 2 -17 -2 -17 Z M-4 -13 L-22 -13 C-25 -13 -26 -12 -26 -9 L-26 9 C-26 12 -25 13 -22 13 L-4 13 C-1 13 0 12 0 9 L0 -9 C0 -12 -1 -13 -4 -13 Z',
    sangle: 'M1 -9 L208 -9 M1 9 L208 9',
    bout: 'M224 -9 L236 -9 C244 -9 250 -4 252 0 C250 4 244 9 236 9 L224 9',
    boutNeuf: 'M208 -9 C214 -9 219 -5 222.6 0 C219 5 214 9 208 9',
    masque: 'M208 -9 L224 -9 M208 9 L224 9',
    passant: 'M14 -11.4 L24 -11.4 L24 11.4 L14 11.4 Z',
    ardillon: 'M-13 -1.3 L14 -1.3 C16 -1.3 17 -0.6 17 0 C17 0.6 16 1.3 14 1.3 L-13 1.3',
    trous: [150, 162, 174, 186, 198],
  };

  /* --- Clés --- */
  const CLE = {
    contour: 'M17 -9 L17 -12 C13 -17 6 -19 -1 -19 C-12 -19 -19 -11 -19 0 C-19 11 -12 19 -1 19 C6 19 13 17 17 12 L17 8 L94 8 C97 8 100 6 101 3 L101 -2 L96 -8',
    coupes: [[30, 4.2], [42, 2], [54, 5.2], [66, 3], [78, 4.6]],
  };
  const dentsCle = (coupes) => { let s = 'M17 -9 L20 -9 L22 -11 L24 -11'; coupes.forEach(([x, p]) => { s += ` L${x - 4.4} -11 L${x} ${-11 + p} L${x + 4.4} -11`; }); return s + ' L90 -11 L96 -8'; };
  const CS = {
    tete: 'M-22 -17 L6 -17 C10 -17 12 -15 12 -11 L12 11 C12 15 10 17 6 17 L-22 17 C-26 17 -28 15 -28 11 L-28 -11 C-28 -15 -26 -17 -22 -17 Z',
    lame: 'M12 -8 L98 -8 L104 -2 L104 2 L98 8 L12 8',
    points: [[24, -3.2, 2.8], [36, 3.2, 2.1], [48, -3.2, 3.2], [60, 3.2, 2.5], [72, -3.2, 3], [86, 3.2, 2.2]],
  };
  const BADGE = {
    corps: 'M0 -34 C12 -34 20 -26 20 -12 L20 18 C20 28 12 34 0 34 C-12 34 -20 28 -20 18 L-20 -12 C-20 -26 -12 -34 0 -34 Z',
    bobine: 'M-13 -6 C-13 -9 -11 -11 -8 -11 L8 -11 C11 -11 13 -9 13 -6 L13 22 C13 25 11 27 8 27 L-8 27 C-11 27 -13 25 -13 22 Z M-10.4 -4.6 C-10.4 -7 -9 -8.4 -6.6 -8.4 L6.6 -8.4 C9 -8.4 10.4 -7 10.4 -4.6 L10.4 20.6 C10.4 23 9 24.4 6.6 24.4 L-6.6 24.4 C-9 24.4 -10.4 23 -10.4 20.6 Z',
  };

  /* --- Outils --- */
  /** brosse (vue de côté, poils en bas ; origine : milieu du bas des poils) */
  P.brosse = (d, T, cls = 'ac') => {
    let poils = '';
    for (let x = -14; x <= 14; x += 2.8) poils += `M${T.X(x)} ${T.Y(-6)}L${T.X(x + 0.6)} ${T.Y(0)}`;
    return d.p(T.d('M-17 -6 L17 -6 L17 -11 C17 -13 15.5 -14.5 13 -14.5 L-13 -14.5 C-15.5 -14.5 -17 -13 -17 -11 Z'), 't ' + cls) + `<path d="${poils}" class="t3 ${cls}"/>` +
      (d.grand ? d.p(T.d('M-12 -10.3 L12 -10.3'), 't3 ' + cls) : '');
  };
  /** pinceau (origine : pointe des poils ; manche vers le haut) */
  P.pinceau = (d, T) => d.p(T.d('M-1.4 -46 L1.4 -46 L1.8 -20 L-1.8 -20 Z'), 't2 ac') + d.p(T.d('M-2.6 -20 L2.6 -20 L2.4 -13 L-2.4 -13 Z'), 't2 ac') + d.p(T.d('M-2.4 -13 C-3 -7 -1.6 -2 0 0 C1.6 -2 3 -7 2.4 -13'), 't2 ac');
  /** marteau de cordonnier (origine : milieu de la tête ; manche vers le bas) */
  P.marteau = (d, T) => d.p(T.d('M-15 -4 L10 -4 C13.6 -4 15.6 -2.2 15.6 0 C15.6 2.2 13.6 4 10 4 L-15 4 C-17.6 4 -19 2 -19 0 C-19 -2 -17.6 -4 -15 -4 Z'), 't2 ac') + d.p(T.d('M-2.4 4 L-3 42 C-3 44.6 3 44.6 3 42 L2.4 4'), 't2 ac');
  /** tube de colle (origine : pointe de la canule, tube vers la gauche) */
  P.tube = (d, T) => d.p(T.d('M-54 -6.4 L-12 -6.4 L-5 -2.4 L0 -1 L0 1 L-5 2.4 L-12 6.4 L-54 6.4 Z'), 't2 ac') + d.p(T.d('M-50 -6.4 L-50 6.4 M-47 -6.4 L-47 6.4 M-40 -3 L-20 -3'), 't3 ac');
  /** bombe (origine : la buse ; bombe vers le bas-gauche) */
  P.bombe = (d, T) => d.p(T.d('M-30 4 L-30 58 C-30 62 -26 64 -22 64 L-6 64 C-2 64 2 62 2 58 L2 4 C2 0 -2 -2 -6 -2 L-22 -2 C-26 -2 -30 0 -30 4 Z'), 't2') + d.p(T.d('M-22 -2 L-22 -10 L-6 -10 L-6 -2 M-6 -6 L0 -6'), 't2') + d.p(T.d('M-30 18 L2 18 M-30 48 L2 48'), 't3');
  /** lampe UV (origine : milieu du bas du boîtier) */
  P.lampe = (d, T) => d.p(T.d('M-74 -14 L74 -14 L68 0 L-68 0 Z'), 't2') + d.p(T.d('M-62 3 L62 3 C64 3 65 4 65 5.5 C65 7 64 8 62 8 L-62 8 C-64 8 -65 7 -65 5.5 C-65 4 -64 3 -62 3 Z'), 't2') + d.p(T.d('M-20 -14 L-20 -24 L20 -24 L20 -14 M0 -24 L0 -34'), 't3');
  /** flacon de teinture et son applicateur (origine : la boule de laine) */
  P.teinture = (d, T) => d.p(T.d('M0 0 m-4.6 0 C-4.6 -3 -2.6 -5 0 -5 C2.6 -5 4.6 -3 4.6 0 C4.6 3 2.6 5 0 5 C-2.6 5 -4.6 3 -4.6 0 Z'), 't2 ac fa') + d.p(T.d('M0 -5 L0 -38'), 't2 ac') + d.p(T.d('M-8 -38 L8 -38 L8 -46 L-8 -46 Z'), 't2 ac');
  /** foret (en élévation, pointe en bas ; origine : la pointe) */
  P.foret = (d, T) => d.p(T.d('M-3 -34 L3 -34 L3 -6 L0 0 L-3 -6 Z'), 't2 ac') + d.p(T.d('M-3 -28 L3 -24 M-3 -22 L3 -18 M-3 -16 L3 -12 M-3 -10 L3 -6'), 't3 ac') + d.p(T.d('M-5 -34 L5 -34 L5 -42 L-5 -42 Z'), 't3 ac');
  /** tranchet (origine : le fil de la lame) */
  P.tranchet = (d, T) => d.p(T.d('M0 0 L-3 -12 L3 -12 Z'), 't2 ac fa') + d.p(T.d('M-2.4 -12 L-2.4 -34 L2.4 -34 L2.4 -12'), 't2 ac');
  /** emporte-pièce à frapper (origine : le tranchant ; tube vers le haut) */
  P.emporte = (d, T) => d.p(T.d('M-4 0 L-4.6 -6 L-4.6 -30 L4.6 -30 L4.6 -6 L4 0 Z'), 't2 ac') + d.p(T.d('M-2 0 L-2 -5 M2 0 L2 -5'), 't3 ac') + d.p(T.d('M-5.6 -30 L5.6 -30 L5.6 -36 L-5.6 -36 Z'), 't2 ac');
  /** fraise (disque à dents) */
  function fraise(d, x, y, r) {
    let dents = '';
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; dents += `M${r2(x + Math.cos(a) * r)} ${r2(y + Math.sin(a) * r)}L${r2(x + Math.cos(a + 0.2) * (r + 2.2))} ${r2(y + Math.sin(a + 0.2) * (r + 2.2))}`; }
    return d.c(x, y, r, 't2 ac') + `<path d="${dents}" class="t3 ac"/>` + d.c(x, y, 2.2, 't3 ac');
  }
  /** petit chiffon (tampon) */
  const tampon = (d, x, y) => d.p(`M${r2(x - 8)} ${r2(y + 3)}C${r2(x - 9)} ${r2(y - 5)} ${r2(x - 2)} ${r2(y - 9)} ${r2(x + 4)} ${r2(y - 7)}C${r2(x + 10)} ${r2(y - 5)} ${r2(x + 10)} ${r2(y + 2)} ${r2(x + 6)} ${r2(y + 4)}C${r2(x + 2)} ${r2(y + 6)} ${r2(x - 5)} ${r2(y + 6)} ${r2(x - 8)} ${r2(y + 3)}Z`, 't2 ac fa') + d.p(`M${r2(x - 4)} ${r2(y - 2)}Q${r2(x)} ${r2(y - 5)} ${r2(x + 5)} ${r2(y - 2)}`, 't3 ac');

  /* ======================================================================
     Les plans, un par réparation
     draw(d) → les traits (d.mini : vignette ; d.grand : planche) ; k → les animations
     ====================================================================== */
  const SCENES = {};
  const scene = (id, def) => { def.id = id; def.cle = id.replace(/[^a-z0-9-]/g, '-'); if (def.fin == null) def.fin = def.D - 1; SCENES[id] = def; };

  /* ==================== Talons & patins ==================== */
  scene('bouts-talons', {
    rub: 'talons', D: 6, fin: 4.6, crop: [8, 8, 146], vue: 'élévation, détail', ech: '1:2',
    alt: 'Le bout du talon aiguille, usé jusqu’au clou, est retiré ; un bout neuf est emboîté à sa place.',
    leg: ['talon aiguille', 'bout usé : le clou touche le sol', 'bout neuf, emboîté sur la tige et tapé'],
    draw(d) {
      let s = '';
      if (d.mini) {
        const T = R(66, 110, 0.92);
        const e = P.escarpin(d, T);
        s += sol(d, 0, 160, 110) + e.tigeTr + e.talonTr + d.fa(e.semelle);
        const Tb = T.sub(0, 0, 1.35);
        s += d.k('fant-p', d.h(Tb.d(ES.boutUse))) + d.k('vieux-p', P.bout(d, Tb, true)) + d.k('neuf-p', P.bout(d, Tb, false));
        s += d.k('choc', impact(d, T.X(0), T.Y(2), 7, 90, 3, 120));
        return s;
      }
      const T = R(152, 116, 0.72), e = P.escarpin(d, T);
      s += sol(d, 112, 292, 116) + e.tigeTr + e.talonTr + d.fa(e.semelle + e.details);
      s += d.k('fant-p', d.h(T.d(ES.boutUse))) + d.k('vieux-p', P.bout(d, T, true)) + d.k('neuf-p', P.bout(d, T, false));
      // le détail A
      s += d.c(T.X(0), T.Y(-5), 12, 't3') + d.txt(T.X(0) + 11, T.Y(-5) - 11, 'A', 'cb', 7);
      const cx = 76, cy = 128, R0 = 46, Td = R(cx, cy + 12 * 2.3, 2.3);
      let det = d.p(Td.d(ES.talon)) + sol(d, cx - R0, cx + R0, Td.Y(0));
      det += d.k('fant', d.h(Td.d(ES.boutUse))) + d.k('vieux', P.bout(d, Td, true)) + d.k('neuf', P.bout(d, Td, false));
      det += d.k('tire', mouvement(d, Td.X(-13), Td.Y(-6), Td.X(-13), Td.Y(9), 0)) + d.k('pousse', mouvement(d, Td.X(13), Td.Y(9), Td.X(13), Td.Y(-6), 0));
      det += d.k('choc', impact(d, cx, Td.Y(1.6), 7, 90, 3, 110));
      s += `<g ${d.clip('det', `<circle cx="${cx}" cy="${cy}" r="${R0}"/>`)}>${det}</g>` + d.c(cx, cy, R0, 't2');
      s += d.l(T.X(-9.6), T.Y(2.4), cx + R0 * 0.93, cy - R0 * 0.36, 't3');
      s += d.txt(cx, cy + R0 + 9, 'DÉTAIL A · 3:1', 'ca', 5.4, 'middle');
      s += cote(d, T.X(-27.6) - 2, 116, T.X(-27.6) - 2, T.Y(-68), '8 cm', 9, { sansAttache: true }) + d.l(T.X(-27.6) - 13.6, T.Y(-68), T.X(-27.6) - 1.5, T.Y(-68), 't3');
      s += rep(d, 1, 118, 44, T.X(-10), T.Y(-42));
      s += d.k('n1', note(d, 132, 152, 'bout usé : le clou touche', { vers: [Td.X(-4), Td.Y(-3)], de: [130, 148], courbe: -9 }) + rep(d, 2, 20, 96, Td.X(-5.2), Td.Y(-6)));
      s += d.k('n2', note(d, 132, 152, 'bout neuf, emboîté et tapé', { vers: [Td.X(5.4), Td.Y(-4)], de: [130, 148], courbe: -9 }) + rep(d, 3, 20, 96, Td.X(-5.2), Td.Y(-6)) + cote(d, Td.X(5.2), Td.Y(0), Td.X(5.2), Td.Y(-10), '8 mm', -10, { fs: 7 }));
      s += note(d, 132, 172, 'pendant qu’on attend', { fs: 11 });
      return s;
    },
    k: (D = 6) => ({
      vieux: KF.part(0.7, 1.5, 0, 44, D), 'vieux-p': KF.part(0.7, 1.5, 0, 17, D),
      fant: KF.montre(1.2, D), 'fant-p': KF.montre(1.2, D),
      neuf: [[0, { o: 0, y: 44 }], [1.7, {}], [1.9, { o: 1 }, 'o'], [2.7, { y: 0 }], [2.95, { y: -2 }], [3.1, { y: 0 }], [3.3, { y: -1.2 }], [3.42, { y: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { y: 44 }]],
      'neuf-p': [[0, { o: 0, y: 17 }], [1.7, {}], [1.9, { o: 1 }, 'o'], [2.7, { y: 0 }], [2.95, { y: -1 }], [3.1, { y: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { y: 17 }]],
      tire: KF.entre(0.45, 1.5), pousse: KF.entre(1.75, 2.8),
      choc: KF.clic([3.05, 3.4]),
      n1: KF.cache(1.5, D), n2: KF.montre(2.6, D),
    }),
  });

  scene('talons-homme', {
    rub: 'talons', D: 6.6, fin: 5.4, crop: [44, 48, 168], vue: 'élévation partielle', ech: '1:1',
    alt: 'Le bonbout usé du talon est retiré ; un bonbout neuf, cuir et gomme, est posé et cloué.',
    leg: ['talon : empilage de cuir', 'bonbout usé en biais', 'bonbout neuf : cuir + gomme à l’arrière', 'clous'],
    draw(d) {
      const T = R(58, 168, 2.3);
      let s = sol(d, 36, 262, 168);
      // vue partielle : l'arrière du soulier, coupé par deux lignes de rupture
      s += d.tr(T.d('M0 -28.5 C-2.2 -36 -2.8 -43 -2.6 -50'), 't', 0) + d.tr(T.d('M0.4 -24 L52.8 -24 C64 -23.6 76 -20.4 86 -16.6 M0 -28.5 L52.8 -28.5 C64 -28 76 -24.8 86 -21.2'), 't', 1);
      s += d.fa(d.p(T.d('M2.6 -24 L3.25 -5.2 M52.8 -24 L50.6 -5.2'), 't') + d.p(T.d(DB.lifts + ' M3.1 -21.2 L52.3 -21.2'), 't3') + d.p(T.d(DB.contrefort), 't2') +
        ruptureH(d, T.X(-2.6), T.X(86), T.Y(-50)) + rupture(d, T.X(86), T.Y(-50), T.Y(-14)) +
        (d.grand ? d.pt(T.d('M2.6 -42.6 C14 -44.8 27 -43.2 36.4 -34.6')) + d.pt(T.d('M54 -26.3 C64 -25.8 76 -22.6 86 -18.9')) : ''));
      const vieux = 'M3.25 -5.2 L50.6 -5.2 L50.2 0 L16 0 L3.4 -3.6 Z', neuf = 'M3.25 -5.2 L50.6 -5.2 L50.2 0 L3.4 0 Z', gomme = 'M3.25 -5.2 L17 -5.2 L17 0 L3.4 0 Z', cuir = 'M17 -5.2 L50.6 -5.2 L50.2 0 L17 0 Z';
      s += d.k('fant', d.h(T.d(vieux)));
      s += d.k('vieux', d.p(T.d(vieux)) + d.hc(T.d(vieux), 45, 2.2));
      s += d.k('neuf', d.p(T.d(neuf), 't fa') + d.p(T.d('M17 -5.2 L17 0'), 't2') + d.hc(T.d(gomme), 45, 1.8) + d.hc(T.d(gomme), -45, 1.8) + d.hc(T.d(cuir), 60, 3.2));
      if (d.grand) CLOUS_TH.forEach((x, i) => {
        s += d.k('clou' + i, d.h(T.d(`M${x} 0 L${x} -13`)) + d.p(T.d(`M${x - 1.3} 0 L${x + 1.3} 0`), 't gras'));
      });
      const M = [T.X(CLOUS_TH[0]), T.Y(0) + 17.4];
      if (d.grand) s += d.k('marteau', `<g transform="translate(${M[0]} ${M[1]}) rotate(-90)">${P.marteau(d, R(0, 0, 1))}</g>` + d.k('choc', impact(d, M[0], M[1] - 17, 5, -90, 3, 100)));
      if (d.grand) {
        s += cote(d, T.X(3.4) - 2, T.Y(0), T.X(2.6) - 2, T.Y(-24), '2,5 cm', 10);
        s += rep(d, 1, 208, 78, T.X(40), T.Y(-18.4));
        s += d.k('n1', note(d, 198, 152, 'bonbout usé', { vers: [T.X(34), T.Y(-2)], de: [196, 148], courbe: 8 }) + rep(d, 2, 28, 184, T.X(7), T.Y(-2)));
        s += d.k('n2', note(d, 198, 152, 'cuir + gomme', { vers: [T.X(40), T.Y(-3)], de: [196, 148], courbe: 8 }) + rep(d, 3, 28, 184, T.X(7), T.Y(-2)));
        s += d.k('n3', rep(d, 4, 230, 100, T.X(46), T.Y(-9)) + note(d, 239, 104, '4 clous', {}));
      }
      return s;
    },
    k: (D = 6.6) => {
      const k = {
        vieux: KF.part(0.6, 1.3, 0, 20, D), fant: KF.montre(1.0, D, 2.0),
        neuf: KF.arrive(1.5, 2.3, 0, 22, D),
        marteau: [[0, { o: 0, x: 0, y: 7 }], [2.4, {}], [2.6, { o: 1 }]],
        n1: KF.cache(1.3, D), n2: KF.montre(2.2, D), n3: KF.montre(4.6, D),
      };
      const chocs = [];
      CLOUS_TH.forEach((x, i) => {
        const t = 2.9 + i * 0.5, X = r2((x - CLOUS_TH[0]) * 2.3);
        k.marteau.push([t - 0.24, { x: X, y: 7 }], [t - 0.12, {}, 'i'], [t, { y: 0 }, 'o'], [t + 0.14, { y: 7 }]);
        k['clou' + i] = [[0, { o: 0 }], [t, {}], [t + 0.03, { o: 1 }], [D - 0.75, {}], [D - 0.45, { o: 0 }]];
        chocs.push(t);
      });
      k.choc = KF.clic(chocs, 0.16);
      k.marteau.push([4.75, {}], [4.95, { o: 0 }], [D - 0.2, { x: 0 }]);
      return k;
    },
  });

  scene('patins', {
    rub: 'talons', D: 6.4, fin: 5.2, crop: [132, 42, 160], vue: 'dessous, coupe', ech: '1:2',
    alt: 'Sous la semelle en cuir, on encolle l’avant puis on pose un patin de gomme antidérapant.',
    leg: ['semelle cuir : glisse et s’use', 'colle néoprène', 'patin de gomme antidérapant'],
    draw(d) {
      const T = R(38, 98, 1.02);
      let s = d.tr(T.d(SD.contour), 't', 0) + d.fa(P.dessous(d, T) + (d.grand ? d.pt(polyD(T.poly(SD_DEDANS(4)))) : ''));
      const patin = demiPlan(SD_DEDANS(3.2), 1, 0, -121);
      const pt = T.poly(patin), pD = polyD(pt);
      s += d.k('usure', d.hc(T.d('M150 -22 C160 -26 176 -24 184 -14 C188 -4 182 10 170 12 C158 14 146 8 146 -4 C146 -12 146 -18 150 -22 Z'), 60, 2.6));
      s += d.k('colle', d.hc(pt, -30, 2.2, 'hc ac'));
      const cxp = T.X(176), cyp = T.Y(0);
      s += d.k('patin', d.p(pD, 't fa') + d.hc(pt, 45, 5.4, 't3') + d.hc(pt, -45, 5.4, 't3'));
      s += d.k('pinceau', `<g transform="translate(${T.X(128)} ${T.Y(-30)}) rotate(28)">${P.pinceau(d, R(0, 0, 1))}</g>`);
      s += d.k('choc', impact(d, cxp - 20, cyp - 26, 5, -90, 3, 80) + impact(d, cxp + 22, cyp + 24, 5, 90, 3, 80));
      if (d.grand) {
        // la coupe A-A
        s += d.ax(`M${T.X(172)} ${T.Y(-50)} L${T.X(172)} ${T.Y(46)}`) + d.txt(T.X(172) - 6, T.Y(-50) - 1, 'A', 'cb', 7) + d.txt(T.X(172) - 6, T.Y(46) + 7, 'A', 'cb', 7);
        const y0 = 160;
        s += d.txt(22, y0 - 5, 'COUPE A-A', 'ca', 5.4);
        s += d.r(22, y0, 150, 6, 0, 't2') + d.hc(`M22 ${y0} L172 ${y0} L172 ${y0 + 6} L22 ${y0 + 6} Z`, 45, 2.4) + d.txt(178, y0 + 5.4, 'cuir', 'n', 10.5);
        s += d.k('coupe', d.p(`M52 ${y0 + 6} L172 ${y0 + 6} L172 ${y0 + 9.4} ` + Array.from({ length: 12 }, (_, i) => `L${172 - i * 10 - 2} ${y0 + 9.4} L${172 - i * 10 - 5} ${y0 + 11.4} L${172 - i * 10 - 8} ${y0 + 9.4}`).join(' ') + ` L52 ${y0 + 9.4} Z`, 't2 fa') +
          d.txt(178, y0 + 15, 'patin 2 mm', 'n', 10.5));
        s += rep(d, 1, 54, 40, T.X(60), T.Y(-14));
        s += d.k('n1', note(d, 22, 194, 'la semelle cuir glisse et s’use', { fs: 11.5 }));
        s += d.k('n2', note(d, 118, 36, 'colle néoprène', { vers: [T.X(150), T.Y(-30)], de: [150, 40], courbe: 6 }) + rep(d, 2, 100, 26, T.X(140), T.Y(-36)));
        s += d.k('n3', note(d, 204, 34, 'patin gomme', { vers: [T.X(196), T.Y(-30)], de: [228, 38], courbe: -6 }) + rep(d, 3, 290, 50, T.X(212), T.Y(-20)) + note(d, 22, 194, 'ne glisse plus, protège le cuir', { fs: 11.5 }));
      }
      return s;
    },
    k: (D = 6.4) => ({
      usure: KF.cache(0.9, D), colle: [[0, { o: 0 }], [0.7, {}], [1.4, { o: 1 }], [2.3, {}], [2.45, { o: 0 }]],
      pinceau: { k: [[0, { o: 0, x: 0, y: 0 }], [0.55, {}], [0.7, { o: 1 }], [0.95, { x: 40, y: 30 }], [1.2, { x: 50, y: 0 }], [1.45, { x: 90, y: 36 }], [1.6, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]] },
      patin: { o: [217.5, 98], k: [[0, { o: 0, x: 60, y: -70, r: 14 }], [1.6, {}], [1.8, { o: 1 }, 'o'], [2.4, { x: 0, y: 0, r: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: 60, y: -70, r: 14 }]] },
      choc: KF.clic([2.42, 2.62]), coupe: KF.montre(2.4, D),
      n1: KF.cache(1.4, D), n2: KF.montre(0.8, D, 2.3), n3: KF.montre(2.5, D),
    }),
  });

  scene('patins-talons', {
    rub: 'talons', D: 6.6, fin: 5.4, crop: [26, -4, 272], vue: 'élévation', ech: '1:3',
    alt: 'Sous une paire neuve : un patin antidérapant se pose sous l’avant, un talon neuf sous le talon.',
    leg: ['patin de gomme sous l’avant', 'talon neuf', 'la paire tient deux fois plus longtemps'],
    draw(d) {
      const T = R(36, 142, 1.1);
      const db = P.derby(d, T);
      const ep = d.mini ? 6 : 2.8;
      const talonHaut = d.p(T.d('M2.6 -24 L3.25 -5.2 L50.6 -5.2 L52.8 -24'), 't') + (d.grand ? d.p(T.d(DB.lifts), 't3') : '');
      let s = db.tigeTr + db.semelleTr + d.fa(talonHaut + db.details);
      const patin = `M124 -2.6 C128 -1.4 134 -0.2 140 0 L186 0 C204 0 218 -3 227 -9.6 L${r2(228 + ep * 0.4)} ${r2(-9.6 + ep * 0.9)} C219 ${r2(-3 + ep)} 204 ${ep} 186 ${ep} L140 ${ep} C133 ${ep} 128 ${r2(ep - 1.2)} 122.6 ${r2(ep - 2.8)} Z`;
      const bonUse = 'M3.25 -5.2 L50.6 -5.2 L50.2 0 L16 0 L3.4 -3.6 Z', bonNeuf = 'M3.25 -5.2 L50.6 -5.2 L50.2 0 L3.4 0 Z';
      s += d.k('vieux', d.p(T.d(bonUse)) + d.hc(T.d(bonUse), 45, 2.2));
      s += d.k('patin', d.p(T.d(patin), 't fa'));
      s += d.k('talon', d.p(T.d(bonNeuf), 't fa'));
      s += d.k('choc1', impact(d, T.X(176), T.Y(ep + 2), 6, 90, 3, 90)) + d.k('choc2', impact(d, T.X(27), T.Y(ep + 2), 6, 90, 3, 90));
      s += d.k('f1', mouvement(d, T.X(176), T.Y(26), T.X(176), T.Y(9), 0)) + d.k('f2', mouvement(d, T.X(27), T.Y(26), T.X(27), T.Y(9), 0));
      if (d.grand) {
        s += rep(d, 1, 298, 160, T.X(214), T.Y(1.4)) + rep(d, 2, 22, 116, T.X(6), T.Y(-2.6));
        s += d.k('n1', note(d, 126, 178, 'patin antidérapant', { vers: [T.X(176), T.Y(3.6)], de: [218, 168], courbe: 6 }));
        s += d.k('n2', note(d, 22, 178, 'talon neuf', { vers: [T.X(20), T.Y(2.4)], de: [40, 168], courbe: -6 }));
        s += d.k('n3', note(d, 22, 30, 'le duo qui fait durer la paire', { fs: 12 }));
      }
      return s;
    },
    k: (D = 6.6) => ({
      vieux: KF.part(0.6, 1.2, 0, 16, D),
      patin: KF.arrive(1.3, 2.1, 0, 22, D), f1: KF.entre(1.2, 2.2), choc1: KF.clic([2.15, 2.35]),
      talon: KF.arrive(2.6, 3.4, 0, 22, D), f2: KF.entre(2.5, 3.5), choc2: KF.clic([3.45, 3.65]),
      n1: KF.montre(2.1, D), n2: KF.montre(3.4, D), n3: KF.montre(3.9, D),
    }),
  });

  /* ==================== Ressemelage ==================== */
  scene('demi-semelle', {
    rub: 'semelles', D: 6.8, fin: 5.6, crop: [100, 38, 190], vue: 'dessous, coupe', ech: '1:2',
    alt: 'La semelle trouée est coupée en biais au milieu ; l’avant usé part, une demi-semelle neuve est posée et cousue.',
    leg: ['avant usé, troué', 'ligne de coupe en biais (le biseau)', 'demi-semelle neuve, cousue ou collée'],
    draw(d) {
      const T = R(36, 98, 1.02);
      // la coupe en biais : x = 116 + 0,1·y ; l'avant : x − 0,1·y − 116 ≥ 0
      const arr = demiPlan(SD_POLY, -1, 0.1, 116), av = demiPlan(SD_POLY, 1, -0.1, -116);
      const avD = polyD(T.poly(av));
      const pArr = demiPlan(SD_DEDANS(4), -1, 0.1, 112);
      let s = d.tr(polyD(T.poly(arr)), 't', 0) + d.fa(P.dessous(d, T) + (d.grand ? d.pt(polyD(T.poly(ouvrir(pArr, -1, 0.1, 112)), false)) : ''));
      const trou = 'M156 -8 C160 -16 170 -18 176 -12 C182 -6 180 4 172 7 C164 10 156 6 155 0 Z';
      s += d.k('vieux', d.p(avD) + d.p(T.d(trou), 't2') + d.hc(T.d(trou), 45, 2) + d.hc(T.d('M140 -26 C150 -32 176 -32 190 -22 C200 -12 196 12 184 18 C168 24 146 20 140 8 Z'), -35, 3.4));
      s += d.k('fant', d.h(avD));
      s += d.k('ligne', d.p(`M${T.X(112.6)} ${T.Y(-34)} L${T.X(119.2)} ${T.Y(32)}`, 'ac', ' stroke-dasharray="' + r2(3.4 * d.u) + ' ' + r2(2 * d.u) + '"'));
      s += d.k('lame', `<g transform="translate(${T.X(112.6)} ${T.Y(-34)}) rotate(174)">${P.tranchet(d, R(0, 0, 1))}</g>`);
      s += d.k('neuf', d.p(avD, 't fa') + d.p(`M${T.X(121.4)} ${T.Y(-30)} L${T.X(127.2)} ${T.Y(28)}`, 't3'));
      const pc = demiPlan(SD_DEDANS(4.2), 1, -0.1, -121);
      s += d.couture(polyD(T.poly(ouvrir(pc, 1, -0.1, -121)), false), 'points', 4.4).svg;
      if (d.grand) {
        const y0 = 170;
        s += d.txt(20, y0 - 8, 'COUPE : LE BISEAU', 'ca', 5.4);
        s += d.p(`M20 ${y0} L96 ${y0} L108 ${y0 + 6} L20 ${y0 + 6} Z`, 't2') + d.hc(`M20 ${y0} L96 ${y0} L108 ${y0 + 6} L20 ${y0 + 6} Z`, 45, 2.4);
        s += d.k('coupe', d.p(`M96 ${y0} L180 ${y0} L180 ${y0 + 6} L108 ${y0 + 6} Z`, 't2 fa') + d.hc(`M96 ${y0} L180 ${y0} L180 ${y0 + 6} L108 ${y0 + 6} Z`, -45, 2.4));
        s += rep(d, 2, 96, 30, T.X(114), T.Y(-28));
        s += d.k('n1', note(d, 292, 30, 'troué à la marche', { a: 'end', fs: 11.5 }) + rep(d, 1, 232, 152, T.X(172), T.Y(12)));
        s += d.k('n2', note(d, 124, 26, 'coupe en biais', { vers: [T.X(115), T.Y(-33)], de: [122, 30], courbe: 6 }));
        s += d.k('n3', note(d, 292, 30, 'neuve, cousue', { a: 'end', vers: [T.X(200), T.Y(-31)], de: [240, 34], courbe: 8 }) + rep(d, 3, 296, 62, T.X(218), T.Y(-17)));
      }
      return s;
    },
    k: (D = 6.8) => {
      const k = {
        ligne: KF.montre(0.5, D, 2.6), lame: { k: [[0, { o: 0, x: 0, y: 0 }], [0.7, {}], [0.85, { o: 1 }], [1.5, { x: 6.7, y: 67.3 }], [1.65, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]] },
        vieux: KF.part(1.8, 2.5, 60, 0, D), fant: KF.montre(2.1, D, 2.9),
        neuf: KF.arrive(2.7, 3.5, 60, 0, D), coupe: KF.montre(3.3, D),
        n1: KF.cache(1.9, D), n2: KF.montre(0.6, D, 2.8), n3: KF.montre(4.4, D),
      };
      return k;
    },
    pts: [3.7, 4.7],
  });

  scene('ressemelage-cuir', {
    rub: 'semelles', D: 7, fin: 5.8, crop: [30, 14, 268], vue: 'éclaté', ech: '1:3',
    alt: 'Vue éclatée : la vieille semelle et le talon descendent, une semelle de cuir et un talon neufs remontent ; les bords sont teintés et lustrés.',
    leg: ['tige (le dessus)', 'semelle cuir neuve, cousue sur la trépointe', 'talon neuf', 'bords teintés et lustrés'],
    draw(d) {
      const T = R(40, 122, 1.08);
      const db = P.derby(d, T);
      let s = sol(d, 26, 294, 122) + db.tigeTr + d.fa(db.details);
      const semTal = d.p(T.d(DB.semelle)) + d.p(T.d(DB.talon)) + d.p(T.d(DB.bon), 't2');
      s += d.k('vieux', semTal + d.hc(T.d('M3.4 0 L50.2 0 L50.4 -3 L3.3 -3.2 Z'), 45, 1.8));
      s += d.k('fant', d.h(T.d(DB.semelle)) + d.h(T.d(DB.talon)));
      s += d.k('semelle', d.p(T.d(DB.semelle), 't fa'));
      s += d.k('talon', d.p(T.d(DB.talon + ' Z'), 't fa') + d.p(T.d(DB.bon), 't2') + (d.grand ? d.p(T.d(DB.lifts), 't3') : ''));
      s += d.couture(T.d(DB.trepointe), 'points', 4.6).svg;
      s += d.trace('lustre', T.d('M0.4 -24.8 L52.8 -24.8 ' + DB.semelleBas.slice(DB.semelleBas.indexOf('C'))), 'ac gras');
      if (d.grand) {
        s += d.ax(`M${T.X(27)} ${T.Y(-24) - 4} L${T.X(27)} ${T.Y(0) + 40}`) + d.ax(`M${T.X(170)} ${T.Y(-4)} L${T.X(170)} ${T.Y(0) + 40}`);
        s += rep(d, 1, 206, 26, T.X(150), T.Y(-60)) + rep(d, 2, 262, 156, T.X(186), T.Y(-2)) + rep(d, 3, 22, 156, T.X(20), T.Y(-10));
        s += d.k('n1', note(d, 120, 176, 'semelle et talon neufs', { fs: 12 }));
        s += d.k('n2', note(d, 128, 176, 'bords teintés, lustrés', { fs: 12, vers: [T.X(140), T.Y(1)], de: [150, 168], courbe: -6 }) + rep(d, 4, 110, 172, T.X(100), T.Y(-10)));
        s += cote(d, T.X(3.4), T.Y(0), T.X(2.6), T.Y(-24), '2,5 cm', 11);
      }
      return s;
    },
    k: (D = 7) => ({
      vieux: KF.part(0.6, 1.5, 0, 38, D), fant: KF.montre(1.1, D, 2.6),
      semelle: KF.arrive(1.7, 2.6, 0, 46, D), talon: KF.arrive(2.8, 3.6, 0, 46, D),
      points: KF.points(40, 3.8, 4.6, D), lustre: KF.trace(4.6, 5.4, D),
      n1: KF.montre(1.8, D, 4.5), n2: KF.montre(4.7, D),
    }),
  });

  scene('ressemelage-gomme', {
    rub: 'semelles', D: 7, fin: 5.8, crop: [34, 4, 252], vue: 'élévation', ech: '1:3',
    alt: 'La semelle aux crampons usés descend ; une semelle de gomme crantée neuve remonte et se coud sur la trépointe.',
    leg: ['crampons usés, lisses', 'trépointe : la couture jaune', 'semelle gomme crantée neuve'],
    draw(d) {
      const T = R(44, 154, 1.02);
      const bt = P.botte(d, T);
      let s = sol(d, 26, 290, 154) + bt.tigeTr + d.fa(bt.trepointe + bt.details);
      const use = semelleCrantee(1.4), neuve = semelleCrantee(5.6);
      s += d.k('vieux', d.p(T.d(use)) + d.hc(T.d('M4 -20 L60 -19 L60 -1.4 L6 -1.4 C2 -2 0.6 -8 1 -12 Z'), 45, 2.6));
      s += d.k('fant', d.h(T.d(use)));
      s += d.k('neuve', d.p(T.d(neuve), 't fa') + (d.grand ? d.p(T.d('M3 -12.6 L223 -11'), 't3') : ''));
      s += d.couture(T.d(BL.piqure), 'points', 4.4, 'pt ac').svg;
      if (d.grand) {
        s += cote(d, T.X(206), T.Y(0), T.X(206), T.Y(-5.6), '6 mm', -9, { fs: 6.8 });
        s += rep(d, 1, 150, 36, T.X(112), T.Y(-80)) + rep(d, 2, 22, 118, T.X(8), T.Y(-22)) + rep(d, 3, 22, 176, T.X(20), T.Y(-3));
        s += d.k('n1', note(d, 180, 180, 'crampons usés, lisses', { a: 'end', fs: 11.5 }));
        s += d.k('n2', note(d, 180, 180, 'gomme crantée neuve', { a: 'end', fs: 11.5 }));
        s += d.k('n3', note(d, 292, 62, 'cousue sur trépointe', { a: 'end', vers: [T.X(202), T.Y(-18.6)], de: [262, 68], courbe: -10 }));
      }
      return s;
    },
    k: (D = 7) => ({
      vieux: KF.part(0.6, 1.4, 0, 34, D), fant: KF.montre(1.0, D, 2.4),
      neuve: KF.arrive(1.7, 2.6, 0, 40, D), points: KF.points(52, 2.9, 4.3, D),
      n1: KF.cache(1.4, D), n2: KF.montre(2.4, D), n3: KF.montre(3.6, D),
    }),
  });

  scene('birkenstock', {
    rub: 'semelles', D: 7, fin: 5.8, crop: [40, 24, 256], vue: 'élévation', ech: '1:2',
    alt: 'Sandale à brides : la semelle usée se détache, le liège du talon est refait, une semelle d’origine neuve est posée.',
    leg: ['brides', 'liège refait au talon', 'semelle d’origine neuve'],
    draw(d) {
      const T = R(48, 154, 1.18);
      const sa = P.sandale(d, T);
      let s = sol(d, 30, 300, 154) + sa.litTr + d.fa(sa.lit.replace(d.p(T.d(SA.lit)), '') + sa.brides + (d.grand ? sa.liege : ''));
      s += d.k('usee', d.p(T.d(SA.semelleUsee)) + d.hc(T.d('M4 -9.6 L60 -9.4 L60 -2 L40 -3 L3 -5 C0.6 -6 0.6 -8.4 4 -9.6 Z'), 45, 2.2));
      s += d.k('fant', d.h(T.d(SA.semelleUsee)));
      s += d.k('creux', d.p(T.d(SA.creux), 't2') + d.hc(T.d(SA.creux), -45, 1.6));
      s += d.k('liege', d.p(T.d(SA.creux), 't2 fa') + d.dots(T.d(SA.creux), 24, 5));
      s += d.k('neuve', d.p(T.d(SA.semelle), 't fa') + (d.grand ? d.p(T.d(onde(8, 202, -4.6, 0.8, 5)), 't3') : ''));
      if (d.grand) {
        s += rep(d, 1, 196, 56, T.X(138), T.Y(-58)) + rep(d, 2, 22, 96, T.X(14), T.Y(-22)) + rep(d, 3, 22, 180, T.X(20), T.Y(-5));
        s += d.k('n1', note(d, 60, 70, 'liège creusé', { a: 'middle', vers: [T.X(16), T.Y(-24)], de: [60, 76], courbe: 6 }));
        s += d.k('n2', note(d, 60, 70, 'liège refait', { a: 'middle', vers: [T.X(16), T.Y(-24)], de: [60, 76], courbe: 6 }));
        s += d.k('n3', note(d, 186, 182, 'semelle et pièces d’origine', { a: 'end', fs: 11.5 }));
      }
      return s;
    },
    k: (D = 7) => ({
      usee: { o: [48 + 208 * 1.18, 154], k: KF.part(0.6, 1.5, 0, 30, D) },
      fant: KF.montre(1.1, D, 2.8),
      creux: KF.cache(1.7, D), liege: KF.montre(1.8, D),
      neuve: KF.arrive(2.8, 3.7, 0, 34, D),
      n1: KF.cache(1.6, D), n2: KF.montre(2.0, D), n3: KF.montre(3.8, D),
    }),
  });

  /* ==================== Sneakers ==================== */
  scene('nettoyage', {
    rub: 'sneakers', D: 6.6, fin: 5.4, crop: [24, 30, 236], vue: 'élévation', ech: '1:3',
    alt: 'Une sneaker salie : la brosse passe du talon à la pointe, la saleté s’en va, la paire brille.',
    leg: ['dessus brossé à la main, savon doux', 'semelle et bords', 'lacets lavés à part', 'intérieur nettoyé'],
    draw(d) {
      const T = R(44, 156, 1.1);
      const sn = P.sneaker(d, T);
      let s = sol(d, 26, 294, 156) + sn.tigeTr + sn.semelleTr + d.fa(sn.rand + sn.details);
      const tache = (pts) => { const q = T.poly(pts); return d.hc(q, 35, 2.4) + d.hc(q, -40, 3.2); };
      s += d.k('sale1', tache([[4, -58], [18, -62], [30, -54], [26, -34], [8, -26], [2, -40]]));
      s += d.k('sale2', tache([[44, -18.6], [120, -18], [118, -8], [70, -7.4], [46, -9]]));
      s += d.k('sale3', tache([[160, -41], [186, -32], [196, -20], [176, -21], [164, -28]]));
      s += d.k('sale4', tache([[96, -64], [120, -54], [128, -40], [104, -36], [90, -48]]));
      let mousse = '';
      if (d.grand) [[-20, -4, 2.2], [-24, -9, 1.5], [21, -3, 1.8], [25, -8, 1.3]].forEach(([x, y, r]) => { mousse += d.c(x, y, r, 't3'); });
      s += d.k('brosse', `<g transform="translate(${T.X(10)} ${T.Y(-40)})">${P.brosse(d, R(0, 0, 1.1))}${mousse}</g>`);
      s += d.k('eclat1', eclat(d, T.X(184), T.Y(-44), 6)) + d.k('eclat2', eclat(d, T.X(62), T.Y(-70), 4.5)) + d.k('eclat3', eclat(d, T.X(112), T.Y(-3), 4));
      if (d.grand) {
        s += rep(d, 1, 150, 36, T.X(118), T.Y(-56)) + rep(d, 2, 150, 184, T.X(80), T.Y(-12)) + rep(d, 3, 250, 58, T.X(133), T.Y(-54)) + rep(d, 4, 24, 70, T.X(30), T.Y(-60));
        s += note(d, 22, 30, 'brossée à la main', { fs: 12 });
        s += d.k('n2', note(d, 292, 36, 'comme neuve', { a: 'end', fs: 12 }));
      }
      return s;
    },
    k: (D = 6.6) => ({
      brosse: { k: [[0, { o: 0, x: 0, y: 0 }], [0.3, { o: 1 }], [0.6, { x: 14, y: -2 }], [0.85, { x: 4, y: 0 }], [1.1, { x: 24, y: 6 }], [1.35, { x: 14, y: 8 }],
        [1.6, { x: 50, y: 20 }], [1.85, { x: 40, y: 22 }], [2.1, { x: 96, y: -18 }], [2.35, { x: 84, y: -16 }], [2.6, { x: 108, y: 24 }],
        [2.85, { x: 140, y: 4 }], [3.1, { x: 128, y: 6 }], [3.35, { x: 166, y: 16 }], [3.6, { x: 156, y: 18 }], [3.85, { x: 176, y: 22 }], [4.1, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]] },
      sale1: KF.cache(0.7, D, 0.6), sale2: KF.cache(1.6, D, 0.9), sale4: KF.cache(2.1, D, 0.5), sale3: KF.cache(3.1, D, 0.7),
      eclat1: { o: [44 + 184 * 1.1, 156 - 44 * 1.1], k: KF.brille(4.1, D) }, eclat2: { o: [44 + 62 * 1.1, 156 - 70 * 1.1], k: KF.brille(4.3, D) }, eclat3: { o: [44 + 112 * 1.1, 156 - 3 * 1.1], k: KF.brille(4.5, D) },
      n2: KF.montre(4.2, D),
    }),
  });

  scene('desoxydation', {
    rub: 'sneakers', D: 7, fin: 5.8, crop: [28, 18, 262], vue: 'élévation', ech: '1:3',
    alt: 'La semelle jaunie passe sous la lampe à UV (48 h) : le jaune disparaît, la semelle redevient blanche.',
    leg: ['semelle et bords jaunis', 'gel éclaircissant + lampe UV, 48 h', 'semelle blanchie'],
    draw(d) {
      const T = R(40, 170, 1.15);
      const sn = P.sneaker(d, T);
      let s = sol(d, 26, 294, 170) + sn.tigeTr + sn.semelleTr + d.fa(sn.rand + sn.details);
      const sem = T.poly(points(SN.semelle, 8));
      s += d.k('jaune1', d.hc(sem, 45, 2.4, 'hc ac'));
      s += d.k('jaune2', d.hc(sem, -45, 2.4, 'hc ac'));
      const L = R(156, 38, 1);
      s += d.fa(P.lampe(d, L));
      let rais = '';
      for (let k = 0; k < 8; k++) { const x = 92 + k * 18.5; rais += `M${r2(x)} 50L${r2(x + (x - 156) * 0.18)} 144`; }
      s += d.k('rayons', `<path d="${rais}" class="t2 ac" stroke-dasharray="${r2(5 * d.u)} ${r2(4 * d.u)}"/>`);
      if (d.grand) {
        const hx = 276, hy = 64;
        s += d.c(hx, hy, 12, 't2') + d.p(`M${hx} ${hy - 12}L${hx} ${hy - 9.4}M${hx + 12} ${hy}L${hx + 9.4} ${hy}M${hx} ${hy + 12}L${hx} ${hy + 9.4}M${hx - 12} ${hy}L${hx - 9.4} ${hy}`, 't3');
        s += d.k('aiguille', d.l(hx, hy, hx, hy - 9, 't ac')) + d.c(hx, hy, 1.2, 'fl') + d.txt(hx, hy + 24, '48 h', 'n', 13, 'middle');
        s += rep(d, 1, 22, 124, T.X(40), T.Y(-10)) + rep(d, 2, 262, 180, T.X(196), T.Y(-12));
        s += d.k('n1', note(d, 22, 196, 'semelle jaunie', { fs: 12 }));
        s += d.k('n2', note(d, 22, 196, 'gel + UV, 48 h', { fs: 12 }));
        s += d.k('n3', note(d, 22, 196, 'blanche comme neuve', { fs: 12 }));
      }
      s += d.k('eclat1', eclat(d, T.X(60), T.Y(-10), 5.5)) + d.k('eclat2', eclat(d, T.X(150), T.Y(-9), 4.5));
      return s;
    },
    k: (D = 7) => ({
      rayons: [[0, { o: 0 }], [0.6, {}], [0.9, { o: 1 }], [1.6, { o: 0.65 }], [2.2, { o: 1 }], [2.8, { o: 0.7 }], [3.4, { o: 1 }], [3.9, {}], [4.2, { o: 0 }]],
      aiguille: { o: [276, 64], k: [[0, { r: 0 }], [0.9, {}], [3.9, { r: 720 }], [D - 0.3, {}], [D, { r: 720 }]], fin: 3 },
      jaune2: KF.cache(1.3, D, 1.0), jaune1: KF.cache(2.5, D, 1.3),
      eclat1: { o: [40 + 60 * 1.15, 170 - 10 * 1.15], k: KF.brille(4.2, D) }, eclat2: { o: [40 + 150 * 1.15, 170 - 9 * 1.15], k: KF.brille(4.45, D) },
      n1: KF.cache(0.8, D), n2: KF.montre(1.0, D, 3.9), n3: KF.montre(4.3, D),
    }),
  });

  scene('recollage-sneakers', {
    rub: 'sneakers', D: 6.6, fin: 5.4, crop: [96, 44, 200], vue: 'élévation', ech: '1:2',
    alt: 'La semelle décollée à l’avant s’ouvre : on nettoie, on encolle, on referme et on met sous presse.',
    leg: ['semelle décollée à l’avant', 'colle néoprène sur les deux faces', 'sous presse'],
    draw(d) {
      const T = R(34, 150, 1.22);
      const sn = P.sneaker(d, T);
      let s = sn.tigeTr + d.fa(sn.details);
      s += d.p(T.d('M108 0 L7 0 C1 -5 0.5 -15 3 -20 L108 -19.2'), 't') + d.p(T.d('M108 -19.2 L108 -12'), 't3') + d.p(T.d('M2.2 -6.5 L108 -6.5'), 't2');
      const avant = d.p(T.d('M108 -19.2 L199.5 -18 C201.5 -16 201.5 -12.5 199 -9 C195 -3 186 0 172 0 L108 0'), 't') + d.p(T.d('M108 -6.5 L174 -6.5 C185 -6.5 193 -8.5 197.6 -12.5'), 't2') +
        (d.grand ? d.pt(T.d('M108 -13.2 L198.4 -12.6')) : '');
      s += d.k('avant', avant);
      s += d.trace('colle', T.d(onde(112, 196, -17.4, 0.9, 6)), 'ac');
      s += d.k('buse', `<g transform="translate(${T.X(112)} ${T.Y(-16.4)}) rotate(4)">${P.tube(d, R(0, 0, 1, true))}</g>`);
      const xp = T.X(138), lp = 64 * T.s;
      s += d.k('presseH', d.r(xp, T.Y(-47) - 7, lp, 7, 1.5, 't2 ac fa') + mouvement(d, xp + lp / 2, T.Y(-47) - 22, xp + lp / 2, T.Y(-47) - 10, 0));
      s += d.k('presseB', d.r(xp, T.Y(0) + 1, lp, 7, 1.5, 't2 ac fa') + mouvement(d, xp + lp / 2, T.Y(0) + 23, xp + lp / 2, T.Y(0) + 11, 0));
      if (d.grand) {
        s += rep(d, 1, 110, 186, T.X(80), T.Y(-3)) + rep(d, 2, 300, 138, T.X(190), T.Y(-17.6));
        s += d.k('n1', note(d, 24, 36, 'décollée à l’avant', { fs: 12 }));
        s += d.k('n2', note(d, 24, 36, 'nettoyée, encollée', { fs: 12 }));
        s += d.k('n3', note(d, 24, 36, 'refermée, pressée', { fs: 12 }));
      }
      return s;
    },
    k: (D = 6.6) => {
      const px = 34 + 108 * 1.22, py = 150 - 19.2 * 1.22;
      return {
        avant: { o: [px, py], k: [[0, { r: 4 }], [0.4, {}, 'io'], [0.9, { r: 9 }], [2.9, {}, 'io'], [3.35, { r: 0 }], [D - 0.5, {}, 'io'], [D - 0.05, { r: 4 }]] },
        colle: [[0, { d: 101, o: 1 }], [1.1, {}, 'io'], [2.4, { d: 0 }], [3.3, {}], [3.5, { o: 0 }], [D - 0.4, { d: 101 }], [D - 0.05, { o: 1 }]],
        buse: { k: [[0, { o: 0, x: 0, y: 0 }], [0.9, {}], [1.1, { o: 1 }], [2.4, { x: 84 * 1.22, y: -1 }], [2.6, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]] },
        presseH: [[0, { o: 0, y: -10 }], [3.4, {}], [3.6, { o: 1 }, 'io'], [3.95, { y: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { y: -10 }]],
        presseB: [[0, { o: 0, y: 10 }], [3.4, {}], [3.6, { o: 1 }, 'io'], [3.95, { y: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { y: 10 }]],
        n1: KF.cache(0.9, D), n2: KF.montre(1.0, D, 2.9), n3: KF.montre(3.3, D),
      };
    },
  });

  scene('talon-interieur', {
    rub: 'sneakers', D: 6.6, fin: 5.4, crop: [22, 32, 172], vue: 'arraché', ech: '1:2',
    alt: 'Dans le talon de la sneaker (vue en arraché), la doublure est trouée ; une pièce de cuir la recouvre et se coud.',
    leg: ['contrefort du talon', 'doublure trouée par le frottement', 'pièce neuve en cuir ou en daim, cousue'],
    draw(d) {
      const T = R(32, 152, 1.28);
      const sn = P.sneaker(d, T);
      // la sneaker entière, sans les coutures du talon (la fenêtre d'arraché les coupe)
      let s = sn.tigeTr + sn.semelleTr + d.fa(sn.rand + d.p(T.d(SN.bout), 't2') + d.p(T.d(SN.oeillets), 't2') + (d.grand ? d.pt(T.d('M3.5 -13.4 L198.4 -12.6')) : ''));
      // la fenêtre d'arraché : on voit la doublure, dedans
      const fen = 'M8 -58 C12 -61 20 -60 26 -61 C31 -61.6 36 -58 37 -52 C38 -46 35 -42 37 -36 C38 -31 34 -27 28 -27.6 C22 -28 16 -26 11 -28 C6 -30 7 -36 6 -42 C5 -48 5 -55 8 -58 Z';
      const fenP = T.poly(points(fen, 8));
      s += d.fa(d.p(T.d(fen), 't2') + d.hc(fenP, 0, 2.8, 't3'));
      const trou = 'M15 -49 L18 -51 L21 -48.6 L25 -50.6 L28 -47 L27 -42 L29 -38.6 L25 -36.4 L21 -38 L17 -36 L14.6 -39.6 L15.6 -43.4 Z';
      s += d.k('trou', d.p(T.d(trou), 't2') + d.dots(T.d(trou), 30, 3));
      const piece = 'M11 -54 C14 -56.6 29 -56.6 32 -54 L33.4 -33.6 C30 -31 14 -31 10.6 -33.6 Z';
      s += d.k('piece', d.p(T.d(piece), 't fa'));
      const pp = T.poly(decalage(points(piece, 8), -1.7, true));
      s += d.couture(polyD(pp.concat([pp[0]]), false), 'points', 3.4).svg;
      if (d.grand) {
        s += d.txt(T.X(22), T.Y(-62.6), 'ARRACHÉ', 'ca', 4.8, 'middle');
        s += rep(d, 1, 18, 122, T.X(2), T.Y(-30)) + rep(d, 2, 104, 128, T.X(34), T.Y(-40));
        s += d.k('n1', note(d, 118, 34, 'doublure trouée', { vers: [T.X(24), T.Y(-47)], de: [116, 38], courbe: 10 }));
        s += d.k('n2', note(d, 118, 34, 'pièce cuir ou daim', { vers: [T.X(28), T.Y(-50)], de: [116, 38], courbe: 10 }) + rep(d, 3, 104, 150, T.X(31), T.Y(-36)));
        s += d.k('n3', note(d, 118, 50, 'cousue main', { fs: 12 }));
        s += note(d, 196, 184, 'le trou derrière le talon', { a: 'end', fs: 11 });
      }
      return s;
    },
    k: (D = 6.6) => ({
      trou: KF.cache(2.2, D, 0.2), piece: KF.arrive(1.4, 2.3, 0, -40, D),
      points: KF.points(24, 2.6, 4.0, D),
      n1: KF.cache(1.3, D), n2: KF.montre(2.2, D), n3: KF.montre(4.0, D),
    }),
  });

  scene('restauration', {
    rub: 'sneakers', D: 7.2, fin: 6, crop: [26, 20, 256], vue: 'état des lieux', ech: '1:3',
    alt: 'On fait l’état des lieux ensemble : la couleur, la couture, la semelle ; chaque point est repris et coché.',
    leg: ['couleur : éraflures reprises', 'couture refaite', 'semelle nettoyée, bords repeints', 'on en parle d’abord : devis gratuit'],
    draw(d) {
      const T = R(40, 162, 1.15);
      const sn = P.sneaker(d, T, { sansOeillets: true });
      let s = sn.tigeTr + sn.semelleTr + d.fa(sn.rand + sn.details + d.p(T.d('M76 -64 C98 -56 110 -51 118 -48'), 't2') + d.p(T.d('M140 -40.6 C148 -38 156 -34.6 161 -27'), 't2'));
      s += d.k('z1', d.hc(T.poly([[162, -40], [186, -32], [196, -20], [174, -20], [164, -28]]), 50, 2.3) + d.p(T.d('M168 -34 l6 3 l-4 2 l7 3'), 't3'));
      s += d.k('z2', d.p(T.d('M118 -48 C124 -52 126 -46 131 -48 M140 -40.6 C136 -44 134 -40 132 -42'), 't3 ac'));
      s += d.couture(T.d('M118 -48 C126 -45 133 -42.6 140 -40.6'), 'points', 3.2).svg;
      s += d.k('z3', d.hc(T.poly([[12, -19], [120, -18], [120, -7], [10, -7], [4, -12]]), 60, 2.6));
      const Z = [[180, -30, 16, 12, 196, -52], [128, -45, 16, 11, 128, -64], [60, -12, 50, 9, 30, -30]];
      Z.forEach(([x, y, rx, ry, cx, cy], i) => {
        s += zone(d, T.X(x), T.Y(y), rx * T.s, ry * T.s);
        s += d.trace('c' + (i + 1), coche(T.X(cx), T.Y(cy), 1.4), 't ac');
        if (d.grand) s += d.c(T.X(cx) - 12, T.Y(cy) + 1, 5.4, 't2') + d.txt(T.X(cx) - 12, T.Y(cy) + 1.2, String(i + 1), 'nb', 7.4, 'middle', ' dominant-baseline="central"');
      });
      if (d.grand) {
        const tk = 'M226 24 L286 24 L292 30 L292 50 L286 56 L226 56 Z';
        s += d.p(tk, 't2 ac') + d.c(233, 40, 2.4, 't3 ac') + d.txt(262, 45, 'devis', 'n', 14, 'middle');
        s += note(d, 22, 30, 'on en parle d’abord', { fs: 12.5 }) + note(d, 22, 44, 'puis point par point', { fs: 11 });
      }
      return s;
    },
    k: (D = 7.2) => ({
      z1: KF.cache(0.9, D, 0.5), c1: KF.trace(1.4, 1.8, D),
      z2: KF.cache(2.1, D, 0.3), points: KF.points(7, 2.2, 2.9, D), c2: KF.trace(3.0, 3.4, D),
      z3: KF.cache(3.6, D, 0.6), c3: KF.trace(4.3, 4.7, D),
    }),
  });

  scene('custom', {
    rub: 'sneakers', D: 7.2, fin: 6, crop: [26, 24, 256], vue: 'projet', ech: '1:3',
    alt: 'Un projet de custom : un motif (la chaîne des Puys) se peint sur le flanc, la pointe change de couleur, une pièce de cuir est rapportée et cousue.',
    leg: ['peinture cuir sur la pointe', 'motif au pinceau : la chaîne des Puys', 'pièce de cuir rapportée, cousue', 'sur devis : on dessine ensemble'],
    draw(d) {
      const T = R(40, 164, 1.15);
      const sn = P.sneaker(d, T);
      let s = sn.tigeTr + sn.semelleTr + d.fa(sn.rand + sn.details);
      s += d.trace('puys', T.d('M42 -30 L47 -30 C49 -30 51 -35.4 53 -35.4 C55 -35.4 57 -30 59 -30 L66 -30 C71 -30 75 -45 88 -45 C101 -45 105 -30 110 -30 L111.6 -30 L115.4 -38.8 L117.2 -36.8 L119 -38.8 L123 -30 L125.4 -30 C126.6 -30 127.8 -33.6 129 -33.6 C130.2 -33.6 131.4 -30 132.6 -30 L136 -30'), 'ac gras');
      const pointe = T.poly(points('M176 -37 C170 -31 168.5 -25 169.5 -18.6 L199.5 -18 C196 -30 186 -35 176 -37 Z', 8));
      s += d.k('peint1', d.hc(bandeX(pointe, 0, T.X(184)), 50, 1.9, 'hc ac')) + d.k('peint2', d.hc(bandeX(pointe, T.X(184), 999), 50, 1.9, 'hc ac'));
      const piece = 'M7 -52 C7 -56 10 -58 14 -58 L25 -58 C29 -58 31 -56 31 -52 L31 -41 C31 -37 29 -35 25 -35 L14 -35 C10 -35 7 -37 7 -41 Z';
      s += d.k('piece', d.p(T.d(piece), 't fa') + (d.grand ? d.txt(T.X(19), T.Y(-44.6), '63', 'cb', 9, 'middle', ' dominant-baseline="central"') : ''));
      s += d.couture(polyD(T.poly(decalage(points(piece, 6), -1.6, true)).concat([T.poly(decalage(points(piece, 6), -1.6, true))[0]]), false), 'points', 3.2).svg;
      if (d.grand) {
        [[248, 26, 45], [266, 26, -45], [284, 26, 0]].forEach(([x, y, a], i) => { s += d.c(x, y, 7, 't2') + d.hc(points(`M${x - 7} ${y} C${x - 7} ${y - 9} ${x + 7} ${y - 9} ${x + 7} ${y} C${x + 7} ${y + 9} ${x - 7} ${y + 9} ${x - 7} ${y} Z`), a, i === 2 ? 1.6 : 2.4, i === 0 ? 'hc ac' : 'hc'); });
        s += d.txt(266, 44, 'nuancier', 'ca', 5.2, 'middle');
        s += rep(d, 1, 262, 118, T.X(188), T.Y(-28)) + rep(d, 2, 150, 42, T.X(88), T.Y(-44)) + rep(d, 3, 22, 70, T.X(10), T.Y(-50));
        s += note(d, 22, 30, 'le projet, dessiné ensemble', { fs: 12 });
        s += d.txt(22, 196, 'Small Custom', 'n', 15);
      }
      return s;
    },
    k: (D = 7.2) => ({
      puys: KF.trace(0.5, 2.1, D), peint1: KF.montre(2.2, D), peint2: KF.montre(2.7, D),
      piece: KF.arrive(3.3, 4.0, 0, -36, D), points: KF.points(20, 4.2, 5.0, D),
    }),
  });

  /* ==================== Couture & recollage ==================== */
  scene('recollage', {
    rub: 'couture', D: 6.6, fin: 5.4, crop: [110, 20, 200], vue: 'élévation', ech: '1:3',
    alt: 'Le bout de la semelle bâille : on l’encolle au pinceau, on referme et on martèle.',
    leg: ['le bout qui bâille', 'colle néoprène au pinceau', 'refermée et martelée'],
    draw(d) {
      const T = R(30, 146, 1.16);
      const db = P.derby(d, T);
      let s = db.tigeTr + d.fa(db.details + db.talon);
      const arr = 'M0.4 -24 L52.8 -24 C78 -22.4 104 -8 132 -1.4 L132 -6 C103 -12.6 78 -27 52.8 -28.5 L0 -28.5 Z';
      const av = 'M132 -1.4 C140 0 150 0 186 0 C204 0 218 -3 227 -9.6 C228.8 -11 228.9 -12.8 227.6 -14.2 C217 -7.6 203 -4.5 186 -4.5 C150 -4.5 140 -4.6 132 -6';
      s += d.p(T.d(arr), 't');
      s += d.k('avant', d.p(T.d(av), 't') + d.trace('colle', T.d(onde(136, 222, -5.8, 0.8, 5)), 'ac') + (d.grand ? d.pt(T.d('M132 -3.7 C140 -2.3 150 -2.25 186 -2.25 C203 -2.25 216 -5.4 226.2 -11.8')) : ''));
      s += d.k('pinceau', `<g transform="translate(${T.X(150)} ${T.Y(-6)}) rotate(-60)">${P.pinceau(d, R(0, 0, 1))}</g>`);
      const M = [T.X(180), T.Y(0) + 18];
      s += d.k('marteau', `<g transform="translate(${M[0]} ${M[1]}) rotate(-90)">${P.marteau(d, R(0, 0, 1))}</g>`);
      s += d.k('choc', impact(d, M[0], M[1] - 17, 5, -90, 3, 110));
      if (d.grand) {
        s += rep(d, 1, 260, 170, T.X(206), T.Y(-3)) + rep(d, 2, 150, 176, T.X(176), T.Y(-5));
        s += d.k('n1', note(d, 24, 36, 'le bout bâille', { fs: 12.5 }));
        s += d.k('n2', note(d, 24, 36, 'colle néoprène', { fs: 12.5 }));
        s += d.k('n3', note(d, 24, 36, 'refermé, martelé', { fs: 12.5 }));
      }
      return s;
    },
    k: (D = 6.6) => {
      const px = 30 + 132 * 1.16, py = 146 - 6 * 1.16;
      const M = [30 + 180 * 1.16, 146 + 18];
      return {
        avant: { o: [px, py], k: [[0, { r: 3.5 }], [0.4, {}, 'io'], [0.9, { r: 8 }], [2.6, {}, 'io'], [3.0, { r: 0 }], [D - 0.5, {}, 'io'], [D - 0.05, { r: 3.5 }]] },
        colle: [[0, { d: 101, o: 1 }], [1.0, {}, 'io'], [2.3, { d: 0 }], [2.8, {}], [3.0, { o: 0 }], [D - 0.4, { d: 101 }], [D - 0.05, { o: 1 }]],
        pinceau: { k: [[0, { o: 0, x: 0, y: 0 }], [0.8, {}], [1.0, { o: 1 }], [1.35, { x: 26, y: 4 }], [1.7, { x: 44, y: 2 }], [2.05, { x: 68, y: 6 }], [2.3, { x: 84, y: 2 }], [2.5, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]] },
        marteau: { o: [M[0] + 44, M[1]], k: [[0, { o: 0, r: -16 }], [3.1, {}], [3.3, { o: 1 }, 'i'], [3.5, { r: 0 }], [3.7, { r: -16 }, 'i'], [3.9, { r: 0 }], [4.1, { r: -16 }, 'i'], [4.3, { r: 0 }], [4.5, {}], [4.7, { o: 0 }], [D, { r: -16 }]] },
        choc: KF.clic([3.5, 3.9, 4.3]),
        n1: KF.cache(0.9, D), n2: KF.montre(1.0, D, 2.8), n3: KF.montre(3.2, D),
      };
    },
  });

  scene('couture', {
    rub: 'couture', D: 6.6, fin: 5.4, crop: [50, 36, 144], vue: 'détail, dessus', ech: '2:1',
    alt: 'Une couture a lâché entre deux pièces de cuir : l’aiguille repique dans les mêmes trous, les points reviennent un à un.',
    leg: ['couture lâchée, fils cassés', 'l’aiguille repique dans les trous d’origine', 'points refaits, même pas qu’avant'],
    draw(d) {
      const O = R(-40, 0, 1); // le détail, décalé à gauche : la vue d'ensemble prend le coin droit
      let s = d.tr(O.d('M150 18 C146 50 142 80 150 110 C156 134 160 160 156 200'), 't', 0);
      s += d.fa(d.h(O.d('M140 18 C136 50 132 80 140 110 C146 134 150 160 146 200')) + d.p(O.d('M153.4 18 C149.4 50 145.4 80 153.4 110 C159.4 134 163.4 160 159.4 200'), 't3'));
      s += d.fa(d.pt(O.d('M146 20 C143.6 38 141.4 50 140.6 60')) + d.pt(O.d('M151 152 C153 166 153.4 180 152 198')));
      // les trous restés et les fils cassés
      const trou = (k) => { const t = k / 12; return [100.6 + Math.sin(t * Math.PI) * 5.4 + t * 10.2, 60 + t * 90]; };
      let trous = '';
      for (let k = 0; k <= 12; k++) { const [x, y] = trou(k); trous += `M${r2(x)} ${r2(y)}h.01`; }
      s += `<path d="${trous}" class="dots"/>`;
      s += d.k('fils', d.p(O.d('M141 60 C146 64 148 69 145 73 M151 150 C155 146 157 141 153 138'), 't2 ac'));
      s += d.couture(O.d('M140.6 60 C139.2 76 139.6 94 146 110 C149.4 124 150.6 136 150.8 150'), 'points', 7.5, 'pt').svg;
      const aig = '<path d="M0 -1 L1.1 -30 C1.1 -32.5 -1.1 -32.5 -1.1 -30 Z" class="t2 ac"/><path d="M0 -26.5 L0 -29" class="t3 ac"/><path d="M0 -28 C8 -34 14 -30 18 -40" class="t3 ac"/>';
      s += d.k('aiguille', `<g transform="translate(100.6 60) rotate(28)">${aig}</g>`);
      if (d.grand) {
        s += d.txt(22, 20, 'DÉTAIL B · 2:1', 'ca', 5.4);
        // la vue d'ensemble : où est la couture
        const V = R(216, 76, 0.36);
        s += d.p(V.d(SN.tige), 't2') + d.p(V.d(SN.semelle), 't2') + d.c(V.X(132), V.Y(-44), 6, 't3') + d.txt(V.X(132) + 8, V.Y(-44) - 6, 'B', 'cb', 6.4) + d.txt(252, 90, 'VUE D’ENSEMBLE', 'ca', 4.6, 'middle');
        const [hx, hy] = trou(4);
        s += cote(d, 106.6, 112, 109.4, 125, '3 mm', -12, { fs: 7 });
        s += rep(d, 1, 140, 54, 101.4, 64) + rep(d, 2, 150, 98, hx + 1.2, hy);
        s += d.k('n1', note(d, 148, 58, 'couture lâchée', {}));
        s += d.k('n2', note(d, 130, 178, 'repiquée, fil poissé', { vers: [115, 150], de: [132, 170], courbe: 6 }) + rep(d, 3, 62, 132, 106.6, 118));
        s += note(d, 214, 118, 'à la main', { fs: 11.5 }) + note(d, 214, 132, 'ou à la machine', { fs: 11.5 });
      }
      return s;
    },
    k: (D = 6.6) => ({
      fils: KF.cache(1.1, D), points: KF.points(12, 1.4, 4.4, D),
      aiguille: { k: [[0, { o: 0, x: 0, y: 0 }], [1.1, {}], [1.3, { o: 1 }], [2.2, { x: -2, y: 22 }], [3.0, { x: 4.4, y: 50 }], [3.8, { x: 9, y: 70 }], [4.4, { x: 10.2, y: 90 }], [4.7, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]] },
      n1: KF.cache(1.3, D), n2: KF.montre(4.3, D),
    }),
  });

  scene('elastiques', {
    rub: 'couture', D: 6.8, fin: 5.6, crop: [30, 4, 250], vue: 'élévation', ech: '1:3',
    alt: 'Sur la bottine Chelsea, l’élastique détendu est retiré ; un soufflet neuf est cousu, il s’étire et revient.',
    leg: ['élastique détendu', 'soufflet élastique neuf', 'cousu tout autour'],
    draw(d) {
      const T = R(52, 176, 0.95);
      const ch = P.chelsea(d, T);
      let s = sol(d, 34, 290, 176) + ch.tigeTr + d.fa(ch.semelle + ch.talon + ch.details);
      const V = T.poly(points(CH.souffletF, 8));
      const mou = 'M22 -147.4 C23 -126 30 -108 38 -95 C47 -108 52 -128 54 -146.6';
      let cotes = '';
      for (let x = 27; x <= 50; x += 3.4) cotes += `M${T.X(x)} ${T.Y(-146)} Q${T.X(x + 2)} ${T.Y(-128)} ${T.X(38 + (x - 38) * 0.3)} ${T.Y(-104)}`;
      s += d.k('vieux', d.p(T.d(mou), 't') + `<path d="${cotes}" class="t3"/>`);
      s += d.k('fant', d.h(T.d(CH.soufflet)));
      s += d.k('neuf', d.k('etire', d.p(T.d(CH.souffletF), 't fa') + d.hc(V, 90, 3.3 * T.s, 't3')));
      const pC = polyD(decalage(T.poly(points(CH.soufflet, 8)), -1.8), false);
      s += d.couture(pC, 'points', 4).svg;
      s += d.k('fl', mouvement(d, T.X(38) - 20, T.Y(-128), T.X(38) - 32, T.Y(-128), 0) + mouvement(d, T.X(38) + 20, T.Y(-128), T.X(38) + 32, T.Y(-128), 0));
      if (d.grand) {
        s += rep(d, 1, 140, 40, T.X(44), T.Y(-130)) + rep(d, 2, 140, 74, T.X(48), T.Y(-120));
        s += d.k('n1', note(d, 160, 44, 'élastique détendu', { fs: 12 }));
        s += d.k('n2', note(d, 160, 44, 'soufflet neuf, cousu', { fs: 12 }));
        s += d.k('n3', note(d, 160, 78, 's’étire et revient', { fs: 12 }));
      }
      return s;
    },
    k: (D = 6.8) => {
      const cx = 52 + 38 * 0.95, cy = 176 - 124 * 0.95;
      return {
        vieux: KF.part(0.6, 1.4, -46, 0, D), fant: KF.montre(1.0, D, 2.6),
        neuf: KF.arrive(1.7, 2.5, -46, 0, D), points: KF.points(26, 2.7, 3.9, D),
        etire: { o: [cx, cy], k: [[0, { sx: 1 }], [4.1, {}, 'io'], [4.4, { sx: 1.2 }], [4.7, { sx: 1 }, 'io'], [5.0, { sx: 1.2 }], [5.3, { sx: 1 }]] },
        fl: [[0, { o: 0 }], [4.1, {}], [4.25, { o: 1 }], [5.1, {}], [5.3, { o: 0 }]],
        n1: KF.cache(1.2, D), n2: KF.montre(2.4, D, 3.9), n3: KF.montre(4.1, D),
      };
    },
  });

  /* ==================== Cirage, teinture & soin ==================== */
  scene('cirage', {
    rub: 'soin', D: 6.8, fin: 5.6, crop: [100, 26, 210], vue: 'élévation', ech: '1:3',
    alt: 'Crème au chiffon en petits cercles, brosse, puis cire glacée sur le bout : la chaussure brille.',
    leg: ['crème au chiffon, en petits cercles', 'brosse en crin', 'glaçage à la cire sur le bout'],
    draw(d) {
      const T = R(30, 150, 1.14);
      const db = P.derby(d, T);
      let s = db.tigeTr + db.semelleTr + d.fa(db.talon + db.details);
      s += d.trace('spirale', T.d('M206 -40 C200 -46 192 -40 197 -35 C202 -30 208 -36 204 -41 C200 -46 190 -44 186 -38 C182 -32 190 -26 194 -31 C198 -36 190 -42 184 -37 C178 -32 174 -40 170 -45 C166 -50 160 -46 162 -42 C164 -38 170 -40 168 -46'), 't3 ac');
      const cx = T.X(198), cy = T.Y(-36);
      s += d.k('chiffon', tampon(d, cx, cy));
      s += d.k('brosse', `<g transform="translate(${T.X(158)} ${T.Y(-60.4)}) rotate(21)">${P.brosse(d, R(0, 0, 1.1))}</g>`);
      s += d.trace('reflet1', T.d('M200 -40 C208 -36 214 -30 217 -24'), 't fw');
      s += d.trace('reflet2', T.d('M178 -49 C186 -47 192 -45 196 -43'), 't2');
      s += d.k('eclat1', eclat(d, T.X(212), T.Y(-33), 6.5)) + d.k('eclat2', eclat(d, T.X(186), T.Y(-50), 4.5)) + d.k('eclat3', eclat(d, T.X(120), T.Y(-72), 4));
      if (d.grand) {
        const bx = 40, by = 176;
        s += d.e(bx + 22, by - 10, 22, 4.4, 't2') + d.p(`M${bx} ${by - 10} L${bx} ${by - 2} C${bx} ${by + 2} ${bx + 44} ${by + 2} ${bx + 44} ${by - 2} L${bx + 44} ${by - 10}`, 't2') + d.txt(bx + 22, by - 20, 'cirage', 'ca', 5.2, 'middle');
        s += rep(d, 1, 290, 150, T.X(214), T.Y(-28));
        s += d.k('n1', note(d, 24, 34, 'crème, en petits cercles', { fs: 12 }));
        s += d.k('n2', note(d, 24, 34, 'brosse en crin', { fs: 12 }));
        s += d.k('n3', note(d, 24, 34, 'cire : le bout glacé', { fs: 12 }));
      }
      return s;
    },
    k: (D = 6.8) => {
      const ch = [[0, { o: 0, x: 0, y: 0 }], [0.3, {}], [0.45, { o: 1 }]];
      for (let i = 0; i < 12; i++) { const a = (i / 6) * Math.PI * 2; ch.push([0.45 + (i + 1) * 0.13, { x: r2(Math.cos(a) * 7 - 7 - i * 2.4), y: r2(Math.sin(a) * 5 - i * 0.6) }]); }
      ch.push([2.1, {}], [2.25, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]);
      const br = [[0, { o: 0, x: 0, y: 0 }], [2.2, {}], [2.35, { o: 1 }]];
      for (let i = 0; i < 6; i++) br.push([2.35 + (i + 1) * 0.18, { x: i % 2 ? 0 : 22, y: i % 2 ? 0 : 8.6 }]);
      br.push([3.5, {}], [3.65, { o: 0 }]);
      return {
        spirale: [[0, { d: 101, o: 1 }], [0.45, {}, 'l'], [2.1, { d: 0 }], [3.4, {}], [3.7, { o: 0 }], [D - 0.4, { d: 101 }], [D - 0.05, { o: 1 }]],
        chiffon: ch, brosse: br,
        reflet1: KF.trace(3.8, 4.3, D), reflet2: KF.trace(4.0, 4.5, D),
        eclat1: { o: [30 + 212 * 1.14, 150 - 33 * 1.14], k: KF.brille(4.3, D) }, eclat2: { o: [30 + 186 * 1.14, 150 - 50 * 1.14], k: KF.brille(4.5, D) }, eclat3: { o: [30 + 120 * 1.14, 150 - 72 * 1.14], k: KF.brille(4.7, D) },
        n1: KF.montre(0.3, D, 2.1), n2: KF.montre(2.2, D, 3.6), n3: KF.montre(3.8, D),
      };
    },
  });

  scene('renovation', {
    rub: 'soin', D: 7, fin: 5.8, crop: [12, -18, 250], vue: 'élévation, coupe', ech: '1:3',
    alt: 'Le cuir éraflé est nettoyé puis nourri : les gouttes pénètrent, les éraflures se comblent et disparaissent.',
    leg: ['éraflures sur le cuir', 'nourri : le soin pénètre la fleur du cuir', 'éraflures reprises à la teinte'],
    draw(d) {
      const T = R(24, 116, 0.98);
      const db = P.derby(d, T);
      let s = db.tigeTr + db.semelleTr + d.fa(db.talon + db.details);
      s += d.k('rayures', d.p(T.d('M150 -58 l5 3 l-3 2 l6 3 M168 -50 l7 3 l-4 2 l6 2 M60 -58 l6 2 l-3 2 l7 2 M100 -44 l6 2 l-4 2 l6 3'), 't2'));
      const gx = d.mini ? [T.X(126), T.X(150), T.X(175)] : [58, 98, 140];
      const gy = d.mini ? [T.Y(-72.7), T.Y(-62.7), T.Y(-52.9)] : [146, 146, 146];
      gx.forEach((x, i) => { s += d.k('g' + i, goutte(d, x, gy[i] - 26, d.mini ? 4.2 : 3.2, 't2 ac')); });
      if (d.grand) {
        const y0 = 150;
        s += d.txt(18, y0 - 12, 'COUPE DU CUIR', 'ca', 5.4);
        s += d.p(`M18 ${y0 + 22} L178 ${y0 + 22}`, 't2') + d.p(`M18 ${y0} L18 ${y0 + 22} M178 ${y0} L178 ${y0 + 22}`, 't3');
        let fib = '';
        for (let x = 24; x < 174; x += 9) fib += `M${x} ${y0 + 6}q3 4 0 8t0 6`;
        s += `<path d="${fib}" class="t3"/>`;
        s += d.k('entaille', d.p(`M18 ${y0} L92 ${y0} L98 ${y0 + 6} L104 ${y0} L178 ${y0}`, 't'));
        s += d.k('lisse', d.p(`M18 ${y0} L178 ${y0}`, 't') + d.p(`M92 ${y0} L98 ${y0 + 6} L104 ${y0} Z`, 't3 fa'));
        s += d.k('ondes', d.p(`M50 ${y0 + 5} Q58 ${y0 + 9} 66 ${y0 + 5} M132 ${y0 + 5} Q140 ${y0 + 9} 148 ${y0 + 5}`, 't3 ac'));
        s += rep(d, 1, 270, 44, T.X(152), T.Y(-56)) + rep(d, 2, 150, 132, 136, y0 + 0.6);
        s += d.txt(184, y0 + 4, 'fleur', 'n', 10.5) + d.txt(184, y0 + 24, 'chair', 'n', 10.5);
        s += d.k('n1', note(d, 22, 198, 'éraflures', { fs: 12 }));
        s += d.k('n2', note(d, 22, 198, 'nourri en profondeur', { fs: 12 }));
        s += d.k('n3', note(d, 22, 198, 'éraflures reprises', { fs: 12 }));
      }
      return s;
    },
    k: (D = 7) => ({
      g0: [[0, { o: 0, y: -30 }], [0.8, {}], [0.95, { o: 1 }, 'i'], [1.4, { y: 24 }], [1.6, { o: 0 }], [D - 0.2, { y: -30 }]],
      g1: [[0, { o: 0, y: -30 }], [1.1, {}], [1.25, { o: 1 }, 'i'], [1.7, { y: 24 }], [1.9, { o: 0 }], [D - 0.2, { y: -30 }]],
      g2: [[0, { o: 0, y: -30 }], [1.4, {}], [1.55, { o: 1 }, 'i'], [2.0, { y: 24 }], [2.2, { o: 0 }], [D - 0.2, { y: -30 }]],
      ondes: KF.clic([1.45, 1.75, 2.05], 0.3),
      entaille: KF.cache(3.0, D), lisse: KF.montre(3.0, D),
      rayures: KF.cache(2.6, D, 1.2),
      n1: KF.cache(0.8, D), n2: KF.montre(1.0, D, 2.9), n3: KF.montre(3.2, D),
    }),
  });

  scene('teinture', {
    rub: 'soin', D: 7, fin: 5.8, crop: [26, 4, 276], vue: 'élévation', ech: '1:3',
    alt: 'L’applicateur passe du talon à la pointe : la couleur couvre la chaussure, zone par zone.',
    leg: ['teinture passée à la main', 'raviver la couleur ou en changer', 'cuir lisse ou daim'],
    draw(d) {
      const T = R(36, 156, 1.12);
      const db = P.derby(d, T);
      let s = db.tigeTr + db.semelleTr + d.fa(db.talon + db.details);
      const tige = T.poly(points(DB.tige + DB.fermeTige, 8));
      const bornes = [-6, 44, 100, 160, 232];
      for (let i = 0; i < 4; i++) s += d.k('z' + i, d.hc(bandeX(tige, T.X(bornes[i]), T.X(bornes[i + 1])), 55, 2.3, 'hc ac'));
      s += d.k('flacon', `<g transform="translate(${T.X(14)} ${T.Y(-60)})">${P.teinture(d, R(0, 0, 1))}</g>`);
      if (d.grand) {
        s += d.r(24, 24, 18, 14, 1, 't2') + d.hc('M24 24 L42 24 L42 38 L24 38 Z', 55, 4.2) + d.txt(33, 46, 'avant', 'ca', 5, 'middle');
        s += mouvement(d, 48, 31, 62, 31, 0);
        s += d.r(68, 24, 18, 14, 1, 't2') + d.hc('M68 24 L86 24 L86 38 L68 38 Z', 55, 1.8, 'hc ac') + d.hc('M68 24 L86 24 L86 38 L68 38 Z', -35, 2.6, 'hc ac') + d.txt(77, 46, 'après', 'ca', 5, 'middle');
        s += note(d, 100, 36, 'raviver ou changer de couleur', { fs: 12 });
        s += d.k('n2', note(d, 196, 184, 'teinte à la main', { a: 'end', fs: 12 }));
      }
      return s;
    },
    k: (D = 7) => {
      const k = { flacon: [[0, { o: 0, x: 0, y: 0 }], [0.4, {}], [0.6, { o: 1 }]] };
      const pts = [[30, 10], [58, 16], [96, 8], [128, 26], [160, 30], [196, 42], [212, 48]];
      pts.forEach(([x, y], i) => k.flacon.push([0.6 + (i + 1) * 0.5, { x: r2(x * 1.12), y: r2(y * 1.12) }]));
      k.flacon.push([4.4, {}], [4.6, { o: 0 }], [D - 0.2, { x: 0, y: 0 }]);
      for (let i = 0; i < 4; i++) k['z' + i] = KF.montre(0.9 + i * 0.85, D);
      k.n2 = KF.montre(4.3, D);
      return k;
    },
  });

  scene('impermeable', {
    rub: 'soin', D: 6.8, fin: 4.6, crop: [10, 6, 280], vue: 'élévation', ech: '1:3',
    alt: 'Un voile d’imperméabilisant est pulvérisé ; sous la pluie, l’eau perle sur le daim et glisse sans tacher.',
    leg: ['spray imperméabilisant, en voile léger', 'l’eau perle et glisse', 'cuir et daim protégés des taches'],
    draw(d) {
      const T = R(54, 172, 1.08);
      const ck = P.chukka(d, T);
      let s = sol(d, 30, 294, 172) + ck.tigeTr + d.fa(ck.semelle + ck.details + (d.grand ? d.dots(T.d(CK.tige + CK.fermeTige), 90, 17, 'dots') : ''));
      const B = R(52, 48, 1);
      s += d.fa(`<g transform="translate(40 42) rotate(-35)">${P.bombe(d, R(0, 0, 1))}</g>`);
      const cone = 'M46 44 L150 58 L124 106 Z';
      s += d.k('voile1', d.dots(cone, 70, 21, 'dots ac')) + d.k('voile2', d.dots(cone, 60, 33, 'dots'));
      const G = [[120], [148], [176], [204], [232]];
      const S = [[56, -92], [64, -80], [76, -68], [98, -60], [138, -50], [170, -42], [194, -35.6], [208, -27]];
      const surf = (x) => {
        const xl = (x - 54) / 1.08;
        for (let i = 1; i < S.length; i++) if (xl <= S[i][0]) { const [x0, y0] = S[i - 1], [x1, y1] = S[i]; return T.Y(y0 + ((xl - x0) / (x1 - x0)) * (y1 - y0)); }
        return T.Y(-27);
      };
      let gm = '', pm = '';
      G.forEach(([x], i) => {
        const y = r2(surf(x) - 2);
        if (d.mini) { gm += goutte(d, x, y - 44, 2.8, 't2'); pm += perle(d, x, y + 1.8, 3.4); return; }
        s += d.k('goutte' + i, goutte(d, x, y - 44, 2.8, 't2'));
        s += d.k('perle' + i, perle(d, x, y + 1.8, 3.4));
      });
      if (d.mini) s += d.k('goutte2', gm) + d.k('perle2', pm);
      if (d.grand) {
        s += d.k('n1', note(d, 180, 30, 'un voile de spray', { fs: 12 }));
        s += d.k('n2', note(d, 180, 30, 'l’eau perle', { fs: 12.5 }));
        s += d.k('n3', note(d, 180, 44, 'et glisse sans tacher', { fs: 11.5 }));
        s += note(d, 22, 196, 'cuir ou daim', { fs: 11 });
      }
      return s;
    },
    k: (D = 6.8) => {
      const k = {
        voile1: [[0, { o: 0 }], [0.4, {}], [0.6, { o: 1 }], [0.9, { o: 0.4 }], [1.2, { o: 1 }], [1.6, {}], [1.9, { o: 0 }]],
        voile2: [[0, { o: 0 }], [0.5, {}], [0.8, { o: 1 }], [1.1, { o: 0.3 }], [1.4, { o: 1 }], [1.7, {}], [2.0, { o: 0 }]],
        n1: KF.entre(0.4, 2.0), n2: KF.montre(2.8, D), n3: KF.montre(3.2, D),
      };
      [0, 1, 2, 3, 4].forEach((i) => {
        const t = 2.1 + i * 0.12;
        k['goutte' + i] = [[0, { o: 0, y: 0 }], [t, {}], [t + 0.1, { o: 1 }, 'i'], [t + 0.5, { y: 44 }], [t + 0.52, { o: 0 }], [D - 0.2, { y: 0 }]];
        k['perle' + i] = [[0, { o: 0, x: 0, y: 0 }], [t + 0.5, {}], [t + 0.54, { o: 1 }], [5.0 + i * 0.08, {}, 'i'], [5.7 + i * 0.08, { x: 26, y: 8 }], [5.9 + i * 0.08, { o: 0 }], [D - 0.1, { x: 0, y: 0 }]];
      });
      return k;
    },
  });

  /* ==================== Maroquinerie ==================== */
  scene('zip-bottes', {
    rub: 'maroquinerie', D: 7, fin: 5.8, crop: [20, 14, 240], vue: 'côté intérieur', ech: '1:4',
    alt: 'Sur la botte, la fermeture cassée est retirée ; une neuve est cousue sur toute la hauteur, le curseur la remonte.',
    leg: ['fermeture cassée', 'fermeture neuve, cousue des deux côtés', 'sur toute la hauteur'],
    draw(d) {
      const T = R(66, 186, 0.68);
      const bh = P.botteHaute(d, T);
      let s = sol(d, 40, 190, 186) + bh.tigeTr + d.fa(bh.semelle + bh.talon + bh.details);
      const zp = T.d(TB.zip), zpts = points(TB.zip, 10);
      const bordG = polyD(decalage(T.poly(zpts), 2.4), false), bordD = polyD(decalage(T.poly(zpts), -2.4), false);
      s += d.k('vieux', d.p(bordG, 't2') + d.p(bordD, 't2') + d.p(zp, 't3', ` stroke-dasharray="${r2(1 * d.u)} ${r2(1.4 * d.u)}"`) + d.p(T.d('M20.4 -64 L14 -44 M20.4 -64 L24 -44'), 't ac'));
      s += d.k('fant', d.h(zp));
      s += d.k('neuf', d.p(bordG, 't2 fa') + d.p(bordD, 't2') + d.p(zp, 't2', ` stroke-dasharray="${r2(1 * d.u)} ${r2(1.2 * d.u)}"`));
      s += d.couture(polyD(decalage(T.poly(zpts), 4.2), false), 'points', 4.2).svg;
      const [cx0, cy0] = T.pt(18, -44);
      s += d.k('curseur', d.p(`M${cx0 - 3.4} ${cy0 - 4} L${cx0 + 3.4} ${cy0 - 4} L${cx0 + 2.4} ${cy0 + 4} L${cx0 - 2.4} ${cy0 + 4} Z`, 't ac fa') + d.p(`M${cx0} ${cy0 + 4} L${cx0 + 1} ${cy0 + 12}`, 't2 ac'));
      if (d.grand) {
        s += cote(d, T.X(70) + 4, T.Y(-44), T.X(70) + 4, T.Y(-247), 'toute la hauteur · 38 cm', -12, { fs: 7 });
        s += rep(d, 1, 24, 60, T.X(26), T.Y(-200)) + rep(d, 2, 24, 90, T.X(28.6), T.Y(-160));
        s += d.k('n1', note(d, 160, 60, 'fermeture cassée', { fs: 12 }));
        s += d.k('n2', note(d, 160, 60, 'fermeture neuve', { fs: 12 }));
        s += d.k('n3', note(d, 160, 76, 'cousue des deux côtés', { fs: 11.5 }));
      }
      return s;
    },
    k: (D = 7) => {
      const tp = points(TB.zip, 10).map(([x, y]) => [66 + x * 0.68, 186 + y * 0.68]);
      const x0 = tp[tp.length - 1][0], y0 = tp[tp.length - 1][1];
      const cur = [[0, { o: 0, x: 0, y: 0 }], [3.6, {}], [3.8, { o: 1 }, 'io']];
      [0.25, 0.5, 0.75, 1].forEach((f, i) => { const p = tp[Math.round((1 - f) * (tp.length - 1))]; cur.push([3.8 + (i + 1) * 0.3, { x: r2(p[0] - x0), y: r2(p[1] - y0) }]); });
      cur.push([D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: 0, y: 0 }]);
      return {
        vieux: KF.part(0.6, 1.4, -30, 0, D), fant: KF.montre(1.0, D, 2.4),
        neuf: KF.arrive(1.7, 2.5, -30, 0, D), points: KF.points(46, 2.6, 3.6, D), curseur: cur,
        n1: KF.cache(1.3, D), n2: KF.montre(2.2, D), n3: KF.montre(3.4, D),
      };
    },
  });

  scene('zip-sac', {
    rub: 'maroquinerie', D: 7, fin: 5.8, crop: [30, 18, 260], vue: 'face', ech: '1:2',
    alt: 'Sur la trousse, la fermeture abîmée est retirée ; une fermeture identique est cousue, le curseur la referme.',
    leg: ['le curseur referme les dents', 'fermeture neuve, identique : mêmes dents, même longueur', 'cousue le long du ruban'],
    draw(d) {
      const T = R(160, 164, 1.3);
      let s = d.tr(T.d(TR.corps), 't', 0);
      s += d.fa(d.p(T.d('M-72 -40 C-40 -32 40 -32 72 -40'), 't2') + d.p(T.d('M90 -54 L97 -54 C99 -54 100 -53 100 -51 L100 -43 C100 -41 99 -40 97 -40 L90 -40'), 't2') +
        (d.grand ? d.pt(polyD(T.poly(decalage(points(TR.corps, 6), -4.4, true)), true)) + d.pt(T.d('M-70 -36.6 C-40 -28.6 40 -28.6 70 -36.6')) : ''));
      const ruban = (cls) => d.p(T.d('M-84 -74 L84 -74 L84 -66 L-84 -66 Z'), cls) + d.p(T.d('M-88 -73 L-84 -73 L-84 -67 L-88 -67 Z M84 -73 L88 -73 L88 -67 L84 -67 Z'), 't3');
      s += d.k('vieux', ruban('t2') + d.p(T.d('M-80 -70 L-10 -70 M20 -70 L80 -70'), 't3', ` stroke-dasharray="${r2(1.2 * d.u)} ${r2(1.2 * d.u)}"`) + d.p(T.d('M-10 -70 L-2 -64 M-10 -70 L-2 -76 M20 -70 L12 -64 M20 -70 L12 -76'), 't2 ac'));
      s += d.k('fant', d.h(T.d('M-84 -74 L84 -74 L84 -66 L-84 -66 Z')));
      s += d.k('neuf', ruban('t2 fa'));
      s += d.couture(T.d('M-80 -70 L80 -70'), 'dents', 1.6, 't3').svg;
      s += d.couture(T.d('M-82 -64.4 L82 -64.4'), 'points', 4).svg;
      const [x0, y0] = T.pt(-80, -70);
      s += d.k('curseur', d.p(`M${x0 - 6} ${y0 - 5} L${x0 + 6} ${y0 - 3} L${x0 + 6} ${y0 + 3} L${x0 - 6} ${y0 + 5} Z`, 't ac fa') + d.p(`M${x0 - 4} ${y0 + 5} L${x0 - 4} ${y0 + 16} C${x0 - 4} ${y0 + 19} ${x0 + 1} ${y0 + 19} ${x0 + 1} ${y0 + 16} L${x0 + 1} ${y0 + 5}`, 't2 ac'));
      if (d.grand) {
        s += cote(d, T.X(-84), T.Y(-74), T.X(84), T.Y(-74), 'même longueur · 22 cm', 12, { fs: 7 });
        s += rep(d, 1, 292, 40, x0 + 208, y0 + 4) + rep(d, 2, 232, 34, T.X(40), T.Y(-70)) + rep(d, 3, 300, 100, T.X(82), T.Y(-64.4));
        s += d.k('n1', note(d, 22, 30, 'fermeture abîmée', { fs: 12 }));
        s += d.k('n2', note(d, 22, 30, 'remplacée à l’identique', { fs: 12 }));
        s += note(d, 22, 196, 'sac ou blouson', { fs: 11 });
      }
      return s;
    },
    k: (D = 7) => ({
      vieux: KF.part(0.6, 1.4, 0, -36, D), fant: KF.montre(1.0, D, 2.4),
      neuf: KF.arrive(1.7, 2.5, 0, -36, D), points: KF.points(40, 2.6, 3.6, D),
      dents: KF.points(100, 3.8, 5.0, D),
      curseur: [[0, { o: 0, x: 0 }], [3.6, {}], [3.8, { o: 1 }, 'l'], [5.0, { x: 208 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: 0 }]],
      n1: KF.cache(1.3, D), n2: KF.montre(2.2, D),
    }),
  });

  scene('anse', {
    rub: 'maroquinerie', D: 7, fin: 5.8, crop: [52, 28, 196], vue: 'face', ech: '1:3',
    alt: 'L’anse arrachée du sac tombe ; une anse de cuir neuve descend à sa place, ses pattes sont cousues au point en croix.',
    leg: ['anse arrachée', 'anse neuve en cuir', 'pattes cousues au point en croix'],
    draw(d) {
      const T = R(150, 176, 1.02);
      const sc = P.sac(d, T);
      let s = sc.corpsTr + d.fa(sc.details);
      s += d.k('vieille', d.p(T.d(SC.anse)) + d.p(T.d(SC.patteG), 't2') + d.p(T.d('M29 -101 L33 -97 L31 -93 L35 -90 L33 -86 L29 -86 Z'), 't2 ac'));
      s += d.k('fant', d.h(T.d(SC.anseAxe)));
      s += d.k('neuve', sc.anse.replace('class="t"', 'class="t fa"') + sc.pattes);
      s += d.trace('x1', croix(T, -39, -99, 9, 11), 't2 ac') + d.trace('x2', croix(T, 30, -99, 9, 11), 't2 ac');
      if (d.grand) {
        s += rep(d, 1, 262, 40, T.X(28), T.Y(-128)) + rep(d, 2, 262, 110, T.X(36), T.Y(-92));
        s += d.k('n1', note(d, 22, 34, 'anse arrachée', { fs: 12 }));
        s += d.k('n2', note(d, 22, 34, 'anse neuve en cuir', { fs: 12 }));
        s += d.k('n3', note(d, 22, 52, 'point en croix', { fs: 11.5, vers: [T.X(-35), T.Y(-99)], de: [60, 56], courbe: -8 }));
      }
      return s;
    },
    k: (D = 7) => {
      const px = 150 - 34.5 * 1.02, py = 176 - 96 * 1.02;
      return {
        vieille: { o: [px, py], k: [[0, { o: 1, r: 22, y: 0 }], [0.6, {}, 'i'], [1.1, { r: 60 }], [1.5, { y: 40, o: 0 }], [D - 0.45, { r: 22, y: 0 }], [D - 0.12, { o: 1 }]] },
        fant: KF.montre(1.2, D, 2.4),
        neuve: KF.arrive(1.8, 2.7, 0, -46, D), x1: KF.trace(3.0, 3.6, D), x2: KF.trace(3.7, 4.3, D),
        n1: KF.cache(1.4, D), n2: KF.montre(2.5, D), n3: KF.montre(3.2, D),
      };
    },
  });

  scene('ceinture', {
    rub: 'maroquinerie', D: 7, fin: 5.8, crop: [112, 20, 200], vue: 'dessus', ech: '1:2',
    alt: 'La ceinture est raccourcie : on coupe le bout et on le redessine ; un trou de plus est percé à l’emporte-pièce.',
    leg: ['bout coupé : raccourcie', 'bout retaillé en pointe', 'un trou de plus, à l’emporte-pièce'],
    draw(d) {
      const T = R(50, 104, 1.02);
      let s = d.tr(T.d(CE.sangle), 't', 0) + d.fa(d.p(T.d(CE.boucle), 't') + d.p(T.d(CE.passant), 't2') + d.p(T.d(CE.ardillon), 't2') + (d.grand ? d.pt(T.d('M28 -6.2 L204 -6.2 M28 6.2 L204 6.2')) : ''));
      CE.trous.forEach((x) => { s += d.e(T.X(x), T.Y(0), 1.8 * T.s, 2.6 * T.s, 't2'); });
      s += d.k('vieux', d.p(T.d(CE.bout)));
      s += d.k('fant', d.h(T.d(CE.bout)) + cote(d, T.X(224), T.Y(9), T.X(252), T.Y(9), '− 3 cm', -12, { fs: 7 }));
      s += d.k('coupe', d.p(`M${T.X(224)} ${T.Y(-15)} L${T.X(224)} ${T.Y(15)}`, 'ac', ` stroke-dasharray="${r2(3 * d.u)} ${r2(2 * d.u)}"`));
      s += d.trace('neuf', T.d(CE.boutNeuf), 't');
      s += d.k('masque', d.p(T.d(CE.masque), 't'));
      s += d.k('trou', d.e(T.X(138), T.Y(0), 1.8 * T.s, 2.6 * T.s, 't fa'));
      s += d.k('pastille', d.e(T.X(138), T.Y(0) + 16, 1.8 * T.s, 2.6 * T.s, 't3 ac'));
      s += d.k('outil', `<g transform="translate(${T.X(138)} ${T.Y(-2)})">${P.emporte(d, R(0, 0, 1))}</g>`);
      s += d.k('choc', impact(d, T.X(138), T.Y(-2) - 40, 5, -90, 3, 100));
      if (d.grand) {
        s += d.k('n1', note(d, 266, 146, 'raccourcie', { a: 'middle', fs: 12.5 }));
        s += d.k('n2', note(d, 124, 44, 'un trou de plus', { a: 'middle', fs: 12, vers: [T.X(138) - 4, T.Y(-6)], de: [118, 50], courbe: -6 }));
        s += note(d, 22, 196, 'pendant qu’on attend', { fs: 11.5 });
      }
      return s;
    },
    k: (D = 7) => ({
      coupe: KF.entre(0.4, 1.9), vieux: KF.part(1.2, 1.9, 34, 0, D), fant: KF.montre(1.6, D),
      masque: KF.cache(1.95, D, 0.1), neuf: KF.trace(1.95, 2.6, D),
      outil: [[0, { o: 0, y: -30 }], [2.8, {}], [3.0, { o: 1 }, 'i'], [3.35, { y: 0 }], [3.5, {}, 'o'], [3.9, { y: -30 }], [4.1, { o: 0 }]],
      choc: KF.clic([3.35]), trou: KF.montre(3.33, D),
      pastille: [[0, { o: 0, y: 0 }], [3.35, {}], [3.4, { o: 1 }, 'i'], [3.9, { y: 14 }], [4.0, { o: 0 }]],
      n1: KF.montre(2.4, D), n2: KF.montre(3.6, D),
    }),
  });

  scene('pressions', {
    rub: 'maroquinerie', D: 6.8, fin: 5.6, crop: [72, 20, 176], vue: 'éclaté en coupe', ech: '4:1',
    alt: 'Vue éclatée d’une pression : calotte, douille, bouton et tige se rejoignent de part et d’autre du cuir, se sertissent et s’emboîtent.',
    leg: ['calotte', 'douille', 'bouton', 'tige', 'œillets et rivets : même geste'],
    draw(d) {
      const T = R(160, 108, 1.3);
      // (repère local : axe x = 0 ; cuir du haut −40…−34, cuir du bas 12…18)
      const cuir = (y) => { const f = `M-50 ${y} L50 ${y} L50 ${y + 6} L-50 ${y + 6} Z`; return d.p(T.d(f), 't2') + d.hc(T.poly([[-50, y], [-4, y], [-4, y + 6], [-50, y + 6]]), 45, 2.4) + d.hc(T.poly([[4, y], [50, y], [50, y + 6], [4, y + 6]]), 45, 2.4); };
      const calotte = 'M-9 -40 C-9 -46 -4.6 -49 0 -49 C4.6 -49 9 -46 9 -40 Z M-1.8 -40 L-1.8 -33 M1.8 -40 L1.8 -33';
      const douille = 'M-8.4 -34 L8.4 -34 L8.4 -31 L2.6 -31 L2.6 -26 C2.6 -24.4 -2.6 -24.4 -2.6 -26 L-2.6 -31 L-8.4 -31 Z';
      const bouton = 'M-7.6 12 L7.6 12 L7.6 9.6 L3 9.6 L3 6 C3 2.6 -3 2.6 -3 6 L-3 9.6 L-7.6 9.6 Z';
      const tige = 'M-8.4 24 L8.4 24 L8.4 21.6 L1.8 21.6 L1.8 13 L-1.8 13 L-1.8 21.6 L-8.4 21.6 Z';
      let s = d.fa(d.ax(`M${T.X(0)} ${T.Y(-72)} L${T.X(0)} ${T.Y(46)}`));
      const piece = (nom, path) => d.k(nom, d.p(T.d(path), 't fa'));
      s += d.k('haut', cuir(-40) + piece('calotte', calotte) + piece('douille', douille) + (d.grand ? d.txt(T.X(52), T.Y(-35), 'cuir', 'n', 10.5) : ''));
      s += d.tr(T.d('M-50 12 L50 12 L50 18 L-50 18 Z'), 't2', 0) + d.fa(d.hc(T.poly([[-50, 12], [-4, 12], [-4, 18], [-50, 18]]), 45, 2.4) + d.hc(T.poly([[4, 12], [50, 12], [50, 18], [4, 18]]), 45, 2.4));
      s += piece('bouton', bouton) + piece('tige', tige);
      s += d.k('outil', `<g transform="translate(${T.X(0)} ${T.Y(-52)})">${P.emporte(d, R(0, 0, 1))}</g>`);
      s += d.k('choc1', impact(d, T.X(0) + 15, T.Y(-45), 5, 0, 3, 80) + impact(d, T.X(0) - 15, T.Y(-45), 5, 180, 3, 80));
      s += d.k('choc2', impact(d, T.X(0) + 15, T.Y(4), 5, 0, 3, 80) + impact(d, T.X(0) - 15, T.Y(4), 5, 180, 3, 80));
      if (d.grand) {
        s += rep(d, 1, 52, 56, ...T.pt(-7, -44 + 27)) + rep(d, 2, 52, 84, ...T.pt(-6, -29 + 27)) + rep(d, 3, 52, 112, ...T.pt(-5, 8)) + rep(d, 4, 52, 144, ...T.pt(-6, 22.8));
        s += d.txt(T.X(52), T.Y(17), 'cuir', 'n', 10.5);
        // à côté : un rivet et un œillet, en coupe
        const x = 280;
        s += d.p(`M${x - 18} 58 L${x + 18} 58 L${x + 18} 64 L${x - 18} 64 Z`, 't2') + d.hc([[x - 18, 58], [x - 3, 58], [x - 3, 64], [x - 18, 64]], 45, 2) + d.hc([[x + 3, 58], [x + 18, 58], [x + 18, 64], [x + 3, 64]], 45, 2);
        s += d.p(`M${x - 7} 58 C${x - 7} 53 ${x + 7} 53 ${x + 7} 58 Z M${x - 2} 58 L${x - 2} 65 M${x + 2} 58 L${x + 2} 65 M${x - 6} 65 L${x + 6} 65 L${x + 6} 67.4 L${x - 6} 67.4 Z`, 't2 fa') + d.txt(x, 80, 'RIVET', 'ca', 4.8, 'middle');
        s += d.p(`M${x - 18} 118 L${x + 18} 118 L${x + 18} 124 L${x - 18} 124 Z`, 't2') + d.hc([[x - 18, 118], [x - 7, 118], [x - 7, 124], [x - 18, 124]], 45, 2) + d.hc([[x + 7, 118], [x + 18, 118], [x + 18, 124], [x + 7, 124]], 45, 2);
        s += d.p(`M${x - 11} 116.4 L${x - 5} 116.4 L${x - 5} 125 C${x - 5} 126.6 ${x - 7} 127 ${x - 10} 126.6 M${x + 11} 116.4 L${x + 5} 116.4 L${x + 5} 125 C${x + 5} 126.6 ${x + 7} 127 ${x + 10} 126.6`, 't2') + d.txt(x, 140, 'ŒILLET', 'ca', 4.8, 'middle');
        s += d.k('n1', note(d, 22, 196, 'serties au balancier', { fs: 11.5 }));
        s += d.k('n2', note(d, 22, 196, 'clic : c’est fermé', { fs: 11.5 }));
      }
      return s;
    },
    k: (D = 6.8) => {
      const u = 1.3;
      return {
        calotte: [[0, { y: -14 * u }], [0.4, {}, 'io'], [1.2, { y: 0 }], [D - 0.5, {}, 'io'], [D - 0.05, { y: -14 * u }]],
        douille: [[0, { y: 10 * u }], [0.4, {}, 'io'], [1.2, { y: 0 }], [D - 0.5, {}, 'io'], [D - 0.05, { y: 10 * u }]],
        bouton: [[0, { y: -10 * u }], [0.4, {}, 'io'], [1.2, { y: 0 }], [D - 0.5, {}, 'io'], [D - 0.05, { y: -10 * u }]],
        tige: [[0, { y: 10 * u }], [0.4, {}, 'io'], [1.2, { y: 0 }], [D - 0.5, {}, 'io'], [D - 0.05, { y: 10 * u }]],
        outil: [[0, { o: 0, y: -10 }], [1.1, {}], [1.25, { o: 1 }, 'i'], [1.45, { y: 2.6 * u }], [1.6, {}, 'o'], [1.9, { y: -10 }], [2.1, { o: 0 }]],
        choc1: KF.clic([1.45]), choc2: KF.clic([3.05]),
        haut: [[0, { y: 0 }], [2.4, {}, 'i'], [3.05, { y: 27 * u }], [D - 0.5, {}, 'io'], [D - 0.05, { y: 0 }]],
        n1: KF.montre(1.3, D, 2.6), n2: KF.montre(3.1, D),
      };
    },
  });

  /* ==================== Clés ==================== */
  scene('cle-plate', {
    rub: 'cles', D: 6.4, fin: 5.2, crop: [60, 38, 196], vue: 'face', ech: '1:1',
    alt: 'La clé d’origine en haut, l’ébauche en bas : le palpeur suit les crans, la fraise taille les mêmes dans l’ébauche.',
    leg: ['clé d’origine, suivie par le palpeur', 'ébauche vierge, serrée dans l’étau', 'crans taillés à la fraise, un à un, à l’identique'],
    draw(d) {
      const A = R(92, 76, 1.6), B = R(92, 152, 1.6);
      let s = d.tr(A.d(CLE.contour), 't', 0) + d.fa(d.p(A.d(dentsCle(CLE.coupes))) + d.c(A.X(-7), A.Y(0), 4 * A.s, 't2') + (d.grand ? d.p(A.d('M24 -1.5 L92 -1.5 M22 3.5 L95 3.5'), 't3') : ''));
      s += d.tr(B.d(CLE.contour), 't', 1) + d.fa(d.c(B.X(-7), B.Y(0), 4 * B.s, 't2') + d.p(B.d('M17 -9 L20 -9 L22 -11 L25.6 -11 M82.6 -11 L90 -11 L96 -8'), 't') + (d.grand ? d.p(B.d('M24 -1.5 L92 -1.5 M22 3.5 L95 3.5'), 't3') : ''));
      CLE.coupes.forEach(([x, p], i) => {
        const trou = i < CLE.coupes.length - 1 ? d.p(B.d(`M${x + 4.4} -11 L${CLE.coupes[i + 1][0] - 4.4} -11`), 't') : '';
        s += (d.mini ? d.p(B.d(`M${x - 4.4} -11 L${x + 4.4} -11`), 't3') : d.k('plat' + i, d.p(B.d(`M${x - 4.4} -11 L${x + 4.4} -11`), 't'))) + d.k('v' + i, d.p(B.d(`M${x - 4.4} -11 L${x} ${-11 + p} L${x + 4.4} -11`), 't')) + trou;
      });
      const x0 = A.X(CLE.coupes[0][0] - 8), ya = A.Y(-11), yb = B.Y(-11);
      const outil = d.p(`M${x0 - 3} ${ya - 16} L${x0} ${ya - 1} L${x0 + 3} ${ya - 16} Z`, 't2 ac') + d.p(`M${x0} ${ya - 16} L${x0} ${ya - 26}`, 't2 ac') +
        fraise(d, x0, yb - 12, 10) + (d.grand ? d.h(`M${x0} ${ya - 26} L${x0 - 24} ${ya - 26} L${x0 - 24} ${yb - 12} L${x0 - 12} ${yb - 12}`) : '');
      s += d.k('outil', outil + d.k('copeaux', d.p(`M${x0 + 11} ${yb - 4} q3 -2 2 -5 M${x0 + 13} ${yb - 1} q4 0 4 -3 M${x0 + 8} ${yb - 7} q1 -3 -1 -5`, 't3 ac')));
      if (d.grand) {
        s += rep(d, 1, 262, 40, A.X(78), A.Y(-9)) + rep(d, 2, 288, 150, B.X(99), B.Y(-2)) + rep(d, 3, 34, 120, B.X(30), B.Y(-8.4));
        s += note(d, 124, 30, 'clé d’origine', { fs: 12 }) + note(d, 124, 190, 'ébauche', { fs: 12 });
        s += d.k('n1', note(d, 262, 110, 'à l’identique', { a: 'middle', fs: 12 }) + d.h(`M${A.X(54)} ${A.Y(-6)} L${A.X(54)} ${B.Y(-10)} M${A.X(78)} ${A.Y(-7)} L${A.X(78)} ${B.Y(-10)}`));
      }
      return s;
    },
    k: (D = 6.4) => {
      const k = {}, t0 = 0.5, dt = 0.62, c = CLE.coupes;
      const pos = [[0, { o: 0, x: 0, y: 0 }], [0.3, { o: 1 }], [t0, {}]];
      c.forEach(([x, p], i) => {
        const X = (x - c[0][0] + 8) * 1.6;
        pos.push([t0 + i * dt + dt * 0.25, { x: X - 7, y: 0 }], [t0 + i * dt + dt * 0.5, { x: X, y: p * 1.6 }], [t0 + i * dt + dt * 0.75, { x: X + 7, y: 0 }]);
        k['plat' + i] = [[0, { o: 1 }], [t0 + i * dt + dt * 0.45, {}], [t0 + i * dt + dt * 0.55, { o: 0 }], [D - 0.45, {}], [D - 0.15, { o: 1 }]];
        k['v' + i] = [[0, { o: 0 }], [t0 + i * dt + dt * 0.45, {}], [t0 + i * dt + dt * 0.55, { o: 1 }], [D - 0.45, {}], [D - 0.15, { o: 0 }]];
      });
      const tf = t0 + c.length * dt;
      pos.push([tf + 0.3, { x: (96 - c[0][0] + 8) * 1.6, y: 0 }], [tf + 0.5, { o: 0 }], [D - 0.2, { x: 0 }]);
      k.outil = pos;
      k.copeaux = [[0, { o: 0 }], [t0, {}], [t0 + 0.1, { o: 1 }], [tf, {}], [tf + 0.15, { o: 0 }]];
      k.n1 = KF.montre(tf + 0.4, D);
      return k;
    },
  });

  scene('cle-securite', {
    rub: 'cles', D: 7, fin: 5.8, crop: [16, 30, 216], vue: 'face, profil', ech: '1,5:1',
    alt: 'Clé brevetée : avec la carte de propriété, le foret perce les points un à un, à la bonne profondeur.',
    leg: ['carte de propriété, obligatoire', 'clé à points (brevetée)', 'profil : chaque point percé au foret, à sa profondeur'],
    draw(d) {
      const T = R(66, 72, 1.5);
      let s = d.tr(T.d(CS.tete), 't', 0) + d.tr(T.d(CS.lame), 't', 1) + d.fa(d.c(T.X(-18), T.Y(0), 4.4 * T.s, 't2') + d.ax(T.d('M8 0 L110 0')));
      const yp = 128;
      s += d.fa(d.p(`M${T.X(12)} ${yp} L${T.X(98)} ${yp} L${T.X(104)} ${yp + 2.2} L${T.X(98)} ${yp + 4.4} L${T.X(12)} ${yp + 4.4}`, 't2') + d.p(`M${T.X(-28)} ${yp - 3} L${T.X(12)} ${yp - 3} L${T.X(12)} ${yp + 7.4} L${T.X(-28)} ${yp + 7.4} Z`, 't2'));
      if (d.grand) s += d.txt(T.X(-28), yp - 8, 'PROFIL', 'ca', 5.2);
      CS.points.forEach(([x, y, r], i) => {
        s += d.k('p' + i, d.c(T.X(x), T.Y(y), r * T.s * 0.5, 't2') + d.c(T.X(x), T.Y(y), r * T.s * 0.18, 'fl2') + d.p(`M${T.X(x) - r * 1.2} ${yp} L${T.X(x)} ${yp + r * 0.9} L${T.X(x) + r * 1.2} ${yp}`, 't2'));
      });
      const x0 = T.X(CS.points[0][0]);
      s += d.k('foret', d.c(x0, T.Y(CS.points[0][1]), 5, 't3 ac') + d.p(`M${x0 - 8} ${T.Y(CS.points[0][1])} L${x0 + 8} ${T.Y(CS.points[0][1])} M${x0} ${T.Y(CS.points[0][1]) - 8} L${x0} ${T.Y(CS.points[0][1]) + 8}`, 't3 ac') +
        `<g transform="translate(${x0} ${yp - 3})">${P.foret(d, R(0, 0, 1))}</g>`);
      if (d.grand) {
        const cx = 236, cy = 36;
        s += d.r(cx, cy, 70, 44, 3, 't2') + d.r(cx + 6, cy + 14, 11, 9, 1.5, 't3') + d.p(`M${cx + 6} ${cy + 30} L${cx + 50} ${cy + 30} M${cx + 6} ${cy + 36} L${cx + 38} ${cy + 36}`, 't3');
        s += d.txt(cx + 6, cy + 8, 'CARTE DE PROPRIÉTÉ', 'ca', 4.2) + d.txt(cx + 24, cy + 21, 'N° 63 1019', 'nb', 6);
        s += d.trace('coche', coche(cx + 60, cy + 20, 1.6), 't ac');
        s += rep(d, 1, 292, 100, cx + 64, cy + 42) + rep(d, 2, 150, 34, T.X(48), T.Y(-5)) + rep(d, 3, 150, 176, T.X(60), yp + 2);
        s += note(d, 22, 30, 'avec la carte', { fs: 12.5 });
        s += d.k('n2', note(d, 230, 128, 'les points,', { fs: 12 }) + note(d, 230, 142, 'un à un', { fs: 12 }));
      }
      return s;
    },
    k: (D = 7) => {
      const k = { coche: KF.trace(0.3, 0.8, D) };
      const f = [[0, { o: 0, x: 0, y: 0 }], [0.8, {}], [1.0, { o: 1 }]];
      CS.points.forEach(([x], i) => {
        const X = (x - CS.points[0][0]) * 1.5, t = 1.2 + i * 0.6;
        f.push([t, { x: X, y: 0 }, 'i'], [t + 0.2, { y: 4 }, 'o'], [t + 0.4, { y: 0 }]);
        k['p' + i] = [[0, { o: 0 }], [t + 0.2, {}], [t + 0.24, { o: 1 }], [D - 0.75, {}], [D - 0.45, { o: 0 }]];
      });
      f.push([1.2 + CS.points.length * 0.6 + 0.2, { o: 0 }], [D - 0.2, { x: 0 }]);
      k.foret = f;
      k.n2 = KF.montre(4.8, D);
      return k;
    },
  });

  scene('badge', {
    rub: 'cles', D: 6.4, fin: 5.2, crop: [46, 36, 226], vue: 'transparence', ech: '1,5:1',
    alt: 'Le badge d’origine est lu, ses ondes passent au badge vierge : son antenne se dessine, il est copié.',
    leg: ['antenne, vue en transparence', 'puce', 'copie sur un badge vierge, selon le modèle'],
    draw(d) {
      const A = R(96, 100, 1.45), B = R(226, 100, 1.45);
      const fob = (T, i) => d.tr(T.d(BADGE.corps), 't', i) + d.fa(d.c(T.X(0), T.Y(-24), 4.4 * T.s, 't2'));
      let s = fob(A, 0) + fob(B, 1);
      s += d.fa(d.p(A.d(BADGE.bobine), 't3') + d.r(A.X(-3.6), A.Y(4), 7.2 * A.s, 7 * A.s, 1, 't2'));
      s += d.fa(d.h(B.d(BADGE.bobine)));
      s += d.trace('bobine', B.d(BADGE.bobine), 't2 ac');
      s += d.k('puce', d.r(B.X(-3.6), B.Y(4), 7.2 * B.s, 7 * B.s, 1, 't2 fa'));
      for (let i = 0; i < 3; i++) s += d.k('o' + i, d.p(`M${138 + i * 16} 82 Q${146 + i * 16} 100 ${138 + i * 16} 118`, 't2 ac'));
      if (d.grand) {
        s += d.r(56, 168, 206, 10, 2, 't2') + d.c(248, 173, 2, 't3') + d.k('led', d.c(248, 173, 2, 'acf'));
        s += rep(d, 1, 36, 60, A.X(-12), A.Y(10)) + rep(d, 2, 36, 150, A.X(-3), A.Y(8));
        s += note(d, 60, 30, 'badge d’origine', { a: 'middle', fs: 12 }) + note(d, 226, 30, 'copie', { a: 'middle', fs: 12 });
        s += d.k('n1', note(d, 270, 150, 'lu, puis copié', { a: 'end', fs: 11.5 }));
        s += d.trace('coche', coche(262, 66, 1.6), 't ac');
      }
      return s;
    },
    k: (D = 6.4) => {
      const k = { bobine: KF.trace(1.6, 3.0, D), puce: KF.montre(3.0, D), led: KF.montre(3.2, D), coche: KF.trace(3.4, 3.8, D), n1: KF.montre(3.3, D) };
      for (let i = 0; i < 3; i++) k['o' + i] = [[0, { o: 0 }], [0.5 + i * 0.2, {}], [0.62 + i * 0.2, { o: 1 }], [0.9 + i * 0.2, { o: 0 }], [1.3 + i * 0.2, {}], [1.42 + i * 0.2, { o: 1 }], [1.7 + i * 0.2, { o: 0 }], [2.1 + i * 0.2, {}], [2.22 + i * 0.2, { o: 1 }], [2.5 + i * 0.2, { o: 0 }]];
      return k;
    },
  });

  /* ==================== Pour vos paires ==================== */
  scene('lacets', {
    rub: 'boutique', D: 6.6, fin: 5.4, crop: [40, 28, 180], vue: 'dessus, sections', ech: '1:1',
    alt: 'Vu de dessus, un lacet neuf se croise d’œillet en œillet ; à côté, les sections : plat, rond, ciré.',
    leg: ['laçage croisé', 'plats, ronds ou cirés', 'toutes les longueurs, de 60 à 180 cm'],
    draw(d) {
      const O = R(-40, 16, 1); // le laçage à gauche, les sections à droite
      const G = [[124, 142], [120, 116], [116, 90], [112, 64], [108, 38]].map(([x, y]) => O.pt(x, y));
      const Dr = [[196, 142], [200, 116], [204, 90], [208, 64], [212, 38]].map(([x, y]) => O.pt(x, y));
      let s = d.tr(O.d('M94 24 C98 70 108 136 128 166 C142 188 178 188 192 166 C212 136 222 70 226 24'), 't', 0);
      s += d.fa(d.p(O.d('M116 24 C120 70 126 124 138 150 M204 24 C200 70 194 124 182 150'), 't2') + d.h(O.d('M122 16 L198 16 L194 146 L146 146 Z')));
      let oe = '';
      G.concat(Dr).forEach(([x, y]) => { oe += d.c(x, y, 3, 't2') + (d.grand ? d.c(x, y, 1.4, 't3') : ''); });
      s += d.fa(oe);
      const P2 = (p) => `${p[0]} ${p[1]}`;
      const a = `M${P2(G[0])} L${P2(Dr[0])} L${P2(G[1])} L${P2(Dr[2])} L${P2(G[3])} L${P2(Dr[4])} C${Dr[4][0] + 10} ${Dr[4][1] - 14} ${Dr[4][0] + 14} ${Dr[4][1] - 22} ${Dr[4][0] + 24} ${Dr[4][1] - 28}`;
      const b = `M${P2(G[0])} L${P2(Dr[1])} L${P2(G[2])} L${P2(Dr[3])} L${P2(G[4])} C${G[4][0] - 10} ${G[4][1] - 14} ${G[4][0] - 14} ${G[4][1] - 22} ${G[4][0] - 24} ${G[4][1] - 28}`;
      s += d.trace('la', a, 't ac gras') + d.trace('lb', b, 't ac gras');
      const fer = (x, y, sx) => d.p(`M${x} ${y} L${x + sx * 8} ${y - 4.4}`, 't', ' style="stroke-width:calc(var(--u)*3px)"');
      s += d.k('ferrets', fer(Dr[4][0] + 22, Dr[4][1] - 27, 1) + fer(G[4][0] - 22, G[4][1] - 27, -1));
      if (d.grand) {
        const x = 256;
        s += d.txt(x, 30, 'SECTIONS', 'ca', 5.2, 'middle');
        s += d.k('s1', d.r(x - 10, 44, 20, 5, 2.4, 't2') + d.txt(x, 62, 'plat', 'n', 11, 'middle'));
        s += d.k('s2', d.c(x, 80, 4, 't2') + d.txt(x, 96, 'rond', 'n', 11, 'middle'));
        s += d.k('s3', d.c(x, 114, 4, 't2 fa') + d.p(`M${x - 2.4} 112 Q${x - 1} 110 ${x + 1} 110.4`, 't3') + d.txt(x, 130, 'ciré', 'n', 11, 'middle'));
        s += d.p('M214 162 L302 162', 't ac gras') + d.p('M214 162 L220 162 M296 162 L302 162', 't', ' style="stroke-width:calc(var(--u)*3px)"');
        s += cote(d, 214, 162, 302, 162, '60 à 180 cm', 9, { fs: 7.2 });
      }
      return s;
    },
    k: (D = 6.6) => ({
      la: KF.trace(0.5, 2.8, D, 'l'), lb: KF.trace(0.7, 3.0, D, 'l'), ferrets: KF.montre(3.0, D),
      s1: KF.montre(3.3, D), s2: KF.montre(3.6, D), s3: KF.montre(3.9, D),
    }),
  });

  scene('semelles-int', {
    rub: 'boutique', D: 6.8, fin: 5.6, crop: [30, 5, 262], vue: 'coupe + sections', ech: '1:3',
    alt: 'Une semelle intérieure glisse dans la chaussure (vue en coupe) ; à côté, trois sections : cuir, confort, laine.',
    leg: ['semelle intérieure, à la pointure', 'cuir, confort (mousse) ou laine', 'glissée dans la chaussure'],
    draw(d) {
      const T = R(40, 146, 1.1);
      let s = d.tr(T.d(DB.semelle), 't', 0) + d.fa(d.h(T.d(DB.tige)) + d.p(T.d(DB.talon), 't2') + d.p(T.d(DB.bon), 't3'));
      const ins = 'M6 -31.4 L54 -31.4 C79 -29.8 104 -15.4 132 -8.8 C140 -7.4 150 -7.2 186 -7.2 C200 -7.2 212 -9.2 221 -13.6 L221.6 -16.4 C212 -12.2 200 -10.2 186 -10.2 C150 -10.2 140 -10.4 131.4 -11.8 C103 -18.4 78 -32.8 54 -34.4 L6 -34.4 Z';
      s += d.k('semelle', d.p(T.d(ins), 't ac fa'));
      if (d.grand) {
        const y = 176;
        const sec = [['cuir', 45, 'hc'], ['confort', 0, 'dots'], ['laine', 0, 'onde']];
        sec.forEach(([nom, a, type], i) => {
          const x = 24 + i * 56;
          let g = d.r(x, y, 44, 7, 1.5, 't2');
          if (type === 'hc') g += d.hc(`M${x} ${y} L${x + 44} ${y} L${x + 44} ${y + 7} L${x} ${y + 7} Z`, a, 2.2);
          if (type === 'dots') g += d.dots(`M${x + 1} ${y + 1} L${x + 43} ${y + 1} L${x + 43} ${y + 6} L${x + 1} ${y + 6} Z`, 26, 3);
          if (type === 'onde') g += d.p(onde(x + 2, x + 42, y + 3.5, 1.4, 4), 't3');
          s += d.k('s' + i, g + d.txt(x + 22, y - 5, nom, 'n', 11.5, 'middle'));
        });
        s += d.txt(24, y - 20, 'SECTIONS', 'ca', 5.2);
        const PI = R(234, 50, 0.3);
        s += d.p(PI.d(SD.contour), 't2') + d.txt(234 + 35, 72, 'VUE DE DESSUS', 'ca', 4.4, 'middle');
        s += d.k('n1', note(d, 22, 32, 'glissée dans la chaussure', { fs: 12 }));
        s += note(d, 22, 48, 'à votre pointure', { fs: 11 });
      }
      return s;
    },
    k: (D = 6.8) => ({
      semelle: { o: [40 + 110, 146 - 20], k: [[0, { o: 0, x: -96, y: -60, r: -14 }], [0.6, {}], [0.8, { o: 1 }, 'io'], [1.8, { x: 0, y: 0, r: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: -96, y: -60, r: -14 }]] },
      s0: KF.montre(2.3, D), s1: KF.montre(2.7, D), s2: KF.montre(3.1, D), n1: KF.montre(1.8, D),
    }),
  });

  scene('kit-sneakers', {
    rub: 'boutique', D: 6.6, fin: 5.4, crop: [22, 20, 250], vue: 'dessus', ech: '1:2',
    alt: 'Le kit d’entretien se range au cordeau : le nettoyant, la brosse, le chiffon microfibre.',
    leg: ['nettoyant doux', 'brosse', 'chiffon microfibre'],
    draw(d) {
      let s = '';
      const flacon = 'M40 52 L118 52 C122 52 124 55 124 58 L124 74 C124 77 122 80 118 80 L40 80 C36 80 34 77 34 74 L34 58 C34 55 36 52 40 52 Z M124 60 L132 60 L132 72 L124 72 Z M132 58 L146 58 L146 74 L132 74 Z';
      s += d.k('i1', d.p(flacon, 't') + d.r(52, 57, 44, 18, 2, 't3') + (d.grand ? d.p('M136 58 L136 74 M140 58 L140 74', 't3') + d.txt(74, 68, 'NETTOYANT', 'ca', 4.6, 'middle', ' dominant-baseline="central"') : ''));
      const brosse = 'M44 112 L112 112 C124 112 132 118 132 128 C132 138 124 144 112 144 L44 144 C36 144 32 138 32 128 C32 118 36 112 44 112 Z';
      let trous = '';
      for (let x = 44; x <= 116; x += 8) for (let y = 120; y <= 136; y += 8) trous += `M${x} ${y}h.01`;
      s += d.k('i2', d.p(brosse, 't') + `<path d="${trous}" class="dots"/>` + d.c(124, 128, 3, 't3'));
      const chiffon = 'M166 52 L240 52 L240 126 L166 126 Z';
      s += d.k('i3', d.p(chiffon, 't') + d.p('M240 104 L218 126', 't2') + d.hc('M166 52 L240 52 L240 104 L218 126 L166 126 Z', 45, 3.6, 'hc') + d.hc('M166 52 L240 52 L240 104 L218 126 L166 126 Z', -45, 3.6, 'hc'));
      s += d.k('regle', d.h('M20 46 L260 46 M20 150 L260 150 M154 40 L154 156'));
      if (d.grand) {
        s += rep(d, 1, 72, 30, 70, 52) + rep(d, 2, 72, 168, 80, 144) + rep(d, 3, 272, 60, 240, 70);
        s += d.k('n1', note(d, 196, 150, 'rangé au cordeau', { a: 'middle', fs: 12 }));
        s += note(d, 22, 196, 'le kit pour chez soi', { fs: 11.5 });
      }
      return s;
    },
    k: (D = 6.6) => ({
      i1: { o: [90, 66], k: [[0, { o: 0, x: -70, y: -10, r: -18 }], [0.4, {}], [0.55, { o: 1 }, 'o'], [1.2, { x: 0, y: 0, r: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: -70, y: -10, r: -18 }]] },
      i2: { o: [82, 128], k: [[0, { o: 0, x: -20, y: 60, r: 22 }], [1.2, {}], [1.35, { o: 1 }, 'o'], [2.0, { x: 0, y: 0, r: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: -20, y: 60, r: 22 }]] },
      i3: { o: [203, 89], k: [[0, { o: 0, x: 70, y: 20, r: 24 }], [2.0, {}], [2.15, { o: 1 }, 'o'], [2.8, { x: 0, y: 0, r: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: 70, y: 20, r: 24 }]] },
      regle: KF.montre(3.0, D), n1: KF.montre(3.2, D),
    }),
  });

  scene('embauchoirs', {
    rub: 'boutique', D: 6.8, fin: 5.6, crop: [24, 8, 268], vue: 'transparence', ech: '1:3',
    alt: 'L’embauchoir en cèdre entre dans la chaussure : les plis du dessus se tendent, le cèdre boit l’humidité.',
    leg: ['embauchoir en cèdre', 'ressort : la forme tendue', 'le cèdre boit l’humidité'],
    draw(d) {
      const T = R(40, 154, 1.1);
      const db = P.derby(d, T);
      let s = db.tigeTr + db.semelleTr + d.fa(db.talon + db.details);
      s += d.k('plis', d.p(T.d('M150 -58 C154 -52 156 -48 155 -42 M162 -54 C166 -49 167 -45 166 -40 M140 -62 C143 -57 144 -53 143 -48'), 't2'));
      const emb = 'M128 -14 C150 -10.6 186 -10 208 -13.4 C219 -15.4 223 -22 216 -30.6 C206 -40.6 180 -48.4 150 -58.4 C140 -61.4 130 -58.6 126.4 -51 C124 -40 124 -24 128 -14 Z M200 -22 L150 -26 M14 -32 C10 -42 13 -58 26 -61 C38 -63.6 48 -55 48 -45.6 C48 -38 44 -31 38 -29.4 Z';
      const ressort = 'M48 -44 L56 -44 L60 -48 L64 -40 L68 -48 L72 -40 L76 -48 L80 -40 L84 -48 L88 -40 L92 -44 L126 -44';
      s += d.k('emb', d.p(T.d(emb), 't ac fa') + d.p(T.d(ressort), 't2 ac') + (d.grand ? d.hc(T.d('M128 -14 C150 -10.6 186 -10 208 -13.4 C219 -15.4 223 -22 216 -30.6 C206 -40.6 180 -48.4 150 -58.4 C140 -61.4 130 -58.6 126.4 -51 C124 -40 124 -24 128 -14 Z'), 80, 5, 'hc ac') : ''));
      [[176, -30], [192, -24], [160, -38], [184, -40]].forEach(([x, y], i) => { s += d.k('h' + i, goutte(d, T.X(x), T.Y(y), 2.2, 't3')); });
      if (d.grand) {
        s += rep(d, 1, 280, 60, T.X(200), T.Y(-28)) + rep(d, 2, 122, 180, T.X(72), T.Y(-44));
        s += d.k('n1', note(d, 22, 34, 'les plis', { fs: 12 }));
        s += d.k('n2', note(d, 22, 34, 'cèdre : la forme gardée', { fs: 12 }));
        s += d.k('n3', note(d, 22, 184, 'l’humidité bue', { fs: 12 }));
      }
      return s;
    },
    k: (D = 6.8) => {
      const k = {
        emb: [[0, { o: 0, x: -120 }], [0.5, {}], [0.7, { o: 1 }, 'io'], [2.0, { x: 0 }], [D - 0.75, {}], [D - 0.45, { o: 0 }], [D - 0.4, { x: -120 }]],
        plis: KF.cache(1.8, D, 0.5), n1: KF.cache(1.6, D), n2: KF.montre(2.0, D), n3: KF.montre(3.6, D),
      };
      [0, 1, 2, 3].forEach((i) => { k['h' + i] = [[0, { o: 1, x: 0, y: 0 }], [2.6 + i * 0.25, {}, 'i'], [3.2 + i * 0.25, { o: 0, x: 6, y: -8 }], [D - 0.45, { x: 0, y: 0 }], [D - 0.12, { o: 1 }]]; });
      return k;
    },
  });

  /* ======================================================================
     Les plans génériques (un id inconnu) : un par rubrique
     ====================================================================== */
  scene('rubrique:talons', {
    rub: 'talons', D: 6, fin: 4.8, crop: [36, 62, 160], vue: 'élévation arrière', ech: '1:1', titre: 'Talons',
    alt: 'Le talon : on refait ce qui touche le sol, pendant qu’on attend.', leg: ['talon', 'ce qui touche le sol, refait'],
    draw(d) {
      const T = R(52, 170, 1.85);
      let s = sol(d, 34, 244, 170) + d.tr(T.d('M0 -28.5 C-3.8 -40 -4.2 -62 3.6 -80 C22 -77.4 44 -71.6 62 -70.4 C70 -71 80 -76 88 -81.2'), 't', 0) + d.tr(T.d('M0.4 -24 L52.8 -24 C70 -22.8 82 -18.8 90 -15.6 M0 -28.5 L52.8 -28.5 C70 -27.4 82 -23.2 90 -20.2'), 't', 1);
      s += d.fa(d.p(T.d(DB.talon), 't') + d.p(T.d(DB.lifts), 't3') + rupture(d, T.X(90), T.Y(-86), T.Y(-12)));
      s += d.k('bon', d.p(T.d('M3.25 -5.2 L50.6 -5.2 L50.2 0 L3.4 0 Z'), 't fa'));
      s += d.k('choc', impact(d, T.X(27), T.Y(2), 7, 90, 3, 120));
      return s;
    },
    k: (D = 6) => ({ bon: [[0, { o: 0.25 }], [1, {}], [1.6, { o: 1 }], [D - 0.6, {}], [D - 0.2, { o: 0.25 }]], choc: KF.clic([1.7, 2.0, 2.3]) }),
  });
  scene('rubrique:semelles', {
    rub: 'semelles', D: 6, fin: 4.8, crop: [100, 38, 190], vue: 'dessous', ech: '1:2', titre: 'Ressemelage',
    alt: 'Le dessous de la semelle : refait et cousu tout autour.', leg: ['semelle', 'couture tout autour'],
    draw(d) {
      const T = R(36, 98, 1.02);
      return d.tr(T.d(SD.contour), 't', 0) + d.fa(P.dessous(d, T)) + d.couture(polyD(T.poly(SD_DEDANS(4.2)), true), 'points', 4.4).svg;
    },
    k: (D = 6) => ({ points: KF.points(46, 0.6, 3.2, D) }),
  });
  scene('rubrique:sneakers', {
    rub: 'sneakers', D: 6, fin: 4.8, crop: [24, 56, 236], vue: 'élévation', ech: '1:3', titre: 'Sneakers',
    alt: 'La sneaker, reprise à la main.', leg: ['sneaker', 'reprise à la main'],
    draw(d) {
      const T = R(44, 156, 1.1), sn = P.sneaker(d, T);
      return sol(d, 26, 294, 156) + sn.tigeTr + sn.semelleTr + d.fa(sn.rand + sn.details) + d.k('e1', eclat(d, T.X(184), T.Y(-44), 6)) + d.k('e2', eclat(d, T.X(62), T.Y(-70), 4.5));
    },
    k: (D = 6) => ({ e1: { o: [44 + 184 * 1.1, 156 - 44 * 1.1], k: KF.brille(1.2, D) }, e2: { o: [44 + 62 * 1.1, 156 - 70 * 1.1], k: KF.brille(1.5, D) } }),
  });
  scene('rubrique:couture', {
    rub: 'couture', D: 6, fin: 4.8, crop: [92, 36, 144], vue: 'détail', ech: '2:1', titre: 'Couture & recollage',
    alt: 'Une couture refaite, point par point.', leg: ['couture refaite, point par point'],
    draw(d) { return d.tr('M150 18 C146 50 142 80 150 110 C156 134 160 160 156 200', 't', 0) + d.fa(d.h('M140 18 C136 50 132 80 140 110 C146 134 150 160 146 200')) + d.couture('M146 20 C142 50 138 80 146 110 C152 134 156 160 152 198', 'points', 7).svg; },
    k: (D = 6) => ({ points: KF.points(26, 0.6, 3.4, D) }),
  });
  scene('rubrique:soin', {
    rub: 'soin', D: 6, fin: 4.8, crop: [124, 44, 180], vue: 'élévation', ech: '1:3', titre: 'Soin du cuir',
    alt: 'Le cuir nourri et lustré.', leg: ['cuir nourri, lustré'],
    draw(d) {
      const T = R(30, 150, 1.14), db = P.derby(d, T);
      return db.tigeTr + db.semelleTr + d.fa(db.talon + db.details) + d.trace('reflet', T.d('M200 -40 C208 -36 214 -30 217 -24'), 't fw') + d.k('e1', eclat(d, T.X(212), T.Y(-33), 6.5));
    },
    k: (D = 6) => ({ reflet: KF.trace(1.0, 1.6, D), e1: { o: [30 + 212 * 1.14, 150 - 33 * 1.14], k: KF.brille(1.6, D) } }),
  });
  scene('rubrique:maroquinerie', {
    rub: 'maroquinerie', D: 6, fin: 4.8, crop: [52, 28, 196], vue: 'face', ech: '1:3', titre: 'Maroquinerie',
    alt: 'Le sac repris et recousu.', leg: ['sac', 'coutures reprises'],
    draw(d) {
      const T = R(150, 176, 1.02), sc = P.sac(d, T);
      return sc.corpsTr + d.fa(sc.anse + sc.pattes) + d.couture(T.d('M-71.6 -5 L71.6 -5 L64.6 -86 L-64.6 -86 Z'), 'points', 4.6).svg;
    },
    k: (D = 6) => ({ points: KF.points(60, 0.6, 3.4, D) }),
  });
  scene('rubrique:cles', {
    rub: 'cles', D: 6, fin: 4.8, crop: [60, 38, 196], vue: 'face', ech: '1:1', titre: 'Clés',
    alt: 'La clé et ses crans.', leg: ['clé', 'crans taillés'],
    draw(d) { const A = R(92, 110, 1.6); return d.tr(A.d(CLE.contour), 't', 0) + d.fa(d.c(A.X(-7), A.Y(0), 4 * A.s, 't2')) + d.trace('dents', A.d(dentsCle(CLE.coupes)), 't'); },
    k: (D = 6) => ({ dents: KF.trace(0.6, 2.4, D, 'l') }),
  });
  scene('rubrique:boutique', {
    rub: 'boutique', D: 6, fin: 4.8, crop: [84, 16, 168], vue: 'face', ech: '1:1', titre: 'Pour vos paires',
    alt: 'L’étiquette de la boutique.', leg: ['en boutique'],
    draw(d) {
      let s = d.tr('M120 60 L200 60 L210 74 L210 150 L110 150 L110 74 Z', 't', 0) + d.fa(d.c(160, 76, 4, 't2'));
      s += d.k('fil', d.p('M160 72 C160 50 170 36 190 26', 't2 ac'));
      if (d.grand) s += d.txt(160, 118, 'Cordo 63', 'n', 18, 'middle');
      return s;
    },
    k: (D = 6) => ({ fil: { o: [160, 76], k: [[0, { r: 0 }], [1, {}, 'io'], [2, { r: -6 }], [3, { r: 4 }, 'io'], [4, { r: 0 }]] } }),
  });
  scene('rubrique:atelier', {
    rub: 'autre', D: 6, fin: 4.8, crop: [26, 32, 276], vue: 'élévation', ech: '1:3', titre: 'À l’atelier',
    alt: 'On regarde ensemble ce qui peut être fait.', leg: ['on regarde ensemble', 'devis gratuit'],
    draw(d) {
      const T = R(36, 156, 1.12), db = P.derby(d, T);
      let s = db.tigeTr + db.semelleTr + d.fa(db.talon + db.details);
      s += d.k('zone', zone(d, T.X(120), T.Y(-40), 70, 34));
      if (d.grand) s += note(d, 22, 34, 'on en parle, devis gratuit', { fs: 12.5 });
      return s;
    },
    k: (D = 6) => ({ zone: KF.montre(0.8, D) }),
  });

  // les points de couture qui paraissent un à un : leur nombre dépend du dessin (d.couture)
  // → la boucle « points » de chaque plan est recalculée au premier dessin (voir preparer()).

  /* ======================================================================
     L'API
     ====================================================================== */
  let compteur = 0;
  let ORDRE = null; // le numéro de planche : la place du service dans le catalogue (lu au premier dessin)
  const numero = (id) => { if (!ORDRE && CO.SERVICES) { ORDRE = []; CO.SERVICES.forEach((r) => r.items.forEach((it) => ORDRE.push(it.id))); } return ORDRE ? ORDRE.indexOf(id) + 1 : 0; };

  function trouver(id, rub) {
    if (SCENES[id] && !String(id).startsWith('rubrique:')) return SCENES[id];
    const it = CO.service ? CO.service(id) : null;
    const r = (it && it.rubrique) || rub || (String(id).startsWith('rubrique:') ? String(id).slice(9) : null);
    return SCENES['rubrique:' + r] || SCENES['rubrique:atelier'];
  }
  function infos(id, rub) {
    const sc = trouver(id, rub);
    const it = CO.service ? CO.service(id) : null;
    const r = CO.SERVICES ? CO.SERVICES.find((x) => x.id === sc.rub) : null;
    return { id: sc.id, titre: (it && it.nom) || sc.titre || (r && r.titre) || '', alt: sc.alt || '', legende: sc.leg || [], vue: sc.vue, rubrique: sc.rub, duree: sc.D, generique: sc.id !== id };
  }

  /* Les animations d'un plan : les images clés, avec le nombre réel de points des coutures
     (d.couture les compte au premier dessin, en grand : même tracé, même nombre en vignette ? non :
     la vignette espace ses points davantage → on compile avec le nombre du grand, et la vignette
     reçoit ses propres règles si son nombre diffère) */
  function keyframesDe(sc) {
    const k = typeof sc.k === 'function' ? sc.k(sc.D) : sc.k;
    return k || {};
  }

  /* Le trait fixe et les pièces qui bougent, séparés : une animation, même minuscule, fait
     redessiner tout son <svg> à chaque image (fond, hachures compris). Deux calques superposés :
     le trait (dessiné une fois) et le mouvement (quelques éléments légers). */
  const DECOR_MINI = /k-(?:fant|fant-p|choc|choc1|choc2|f1|f2|fl|copeaux|eclat2|eclat3|reflet2|pastille|ondes)"/;
  function retirer(corps, re) {
    const tag = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
    let m, out = '', dernier = 0, prof = 0, saut = -1;
    while ((m = tag.exec(corps))) {
      if (saut < 0 && !m[1] && re.test(m[3])) {
        out += corps.slice(dernier, m.index);
        if (m[4]) { dernier = tag.lastIndex; continue; }
        saut = prof; prof++;
        continue;
      }
      if (m[1]) prof--; else if (!m[4]) prof++;
      if (saut >= 0 && m[1] && prof === saut) { saut = -1; dernier = tag.lastIndex; }
    }
    return saut >= 0 ? out : out + corps.slice(dernier);
  }
  function separer(corps) {
    const out = { fixe: '', jeu: '' };
    const re = /<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g;
    let m, prof = 0, debut = 0;
    while ((m = re.exec(corps))) {
      if (prof === 0 && !m[1]) debut = m.index;
      if (m[1]) prof--;
      else if (!m[3]) prof++;
      if (prof === 0) {
        const el = corps.slice(debut, re.lastIndex);
        if (/\bk-[\w-]/.test(el)) out.jeu += el; else out.fixe += el;
      }
    }
    return out;
  }

  function svg(id, opts = {}) {
    const taille = opts.taille === 'grand' ? 'grand' : 'mini';
    const sc = trouver(id, opts.rubrique);
    const it = CO.service ? CO.service(id) : null;
    const mini = taille === 'mini';
    const uid = 'pl' + (++compteur).toString(36);
    let vb, u, avant = '', apres = '';
    if (mini) {
      const [cx, cy, cw] = sc.crop, ch = cw * 0.75;
      vb = `0 0 ${r2(cw)} ${r2(ch)}`;
      u = cw / 64;
      avant = `<g transform="translate(${r2(-cx)} ${r2(-cy)})">`;
      apres = '</g>';
    } else { vb = `0 0 ${W} ${H}`; u = 1; }
    const d = contexte({ mini, u, uid });
    let corps = '';
    try { corps = sc.draw(d); } catch (e) { console.warn('plans : dessin', sc.id, e); }
    if (mini) corps = retirer(corps, DECOR_MINI); // (sans les animations décoratives : fantômes, impacts…)
    // les coutures : leur nombre de points (par taille) fixe leurs marches
    const nPts = [...corps.matchAll(/pathLength="(\d+)" class="[^"]*\ba k-(points|dents)"/g)].map((m) => [m[2], +m[1]]);
    const cle = sc.cle + (mini ? '-m' : '');
    preparer(sc, cle, nPts, mini, new Set([...corps.matchAll(/\ba k-([\w-]+)/g)].map((m) => m[1])));
    let cadreS = '';
    if (mini) {
      const cw = sc.crop[2];
      cadreS = d.r(1.6 * u, 1.6 * u, cw - 3.2 * u, cw * 0.75 - 3.2 * u, 0, 't3', ' style="opacity:.7"');
    } else cadreS = cadre(d) + cartouche(d, sc, numero(id), (it && it.nom) || infos(id, opts.rubrique).titre);
    const fixe = opts.fixe != null ? opts.fixe : !!CO.reduced;
    const cls = `plan plan-${taille} pl-${cle}` + (fixe ? ' fixe' : '') + (opts.joue ? ' joue' : '') + (opts.classe ? ' ' + opts.classe : '');
    const nom = infos(id, opts.rubrique).titre;
    const aria = opts.decoratif ? ' aria-hidden="true"' : ` role="img" aria-label="${esc('Plan : ' + nom + '. ' + (sc.alt || ''))}"`;
    const dim = mini ? ' width="64" height="48"' : ` width="${W}" height="${H}"`;
    const defs = d.defs ? `<defs>${d.defs}</defs>` : '';
    if (opts.calques === false) {
      return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="${vb}"${dim} style="--u:${r2(u)}" data-plan="${esc(sc.id)}"${aria}${opts.decoratif ? ' focusable="false"' : ''}>${defs}${cadreS}${avant}${corps}${apres}</svg>`;
    }
    const c = separer(corps);
    const calque = (k, inner) => `<svg xmlns="http://www.w3.org/2000/svg" class="${k}" viewBox="${vb}"${dim} aria-hidden="true" focusable="false">${inner}</svg>`;
    return `<span class="${cls}" style="--u:${r2(u)}" data-plan="${esc(sc.id)}"${aria}>` +
      calque('pl-trait' + (mini ? ' a i-fm' : ''), defs + cadreS + avant + c.fixe + apres) + (c.jeu ? calque('pl-mouv', avant + c.jeu + apres) : '') + '</span>';
  }

  /* compile (une fois par clé) les animations d'un plan ; les « points » prennent le nombre réel de points */
  function preparer(sc, cle, nPts, mini, noms) {
    if (injectes.has(cle) || typeof document === 'undefined') return;
    const k = Object.assign({}, keyframesDe(sc));
    nPts.forEach(([nom, n]) => {
      const t = sc.pts || null;
      if (k[nom] && Array.isArray(k[nom])) k[nom] = k[nom].map(([tt, p, e]) => [tt, p && p.d != null && p.d > 0 ? Object.assign({}, p, { d: n }) : p, e && /^s\d+$/.test(e) ? 's' + n : e]);
      else if (!k[nom] && t) k[nom] = KF.points(n, t[0], t[1], sc.D);
    });
    if (mini && sc.pts && !k.points) k.points = KF.points(1, sc.pts[0], sc.pts[1], sc.D); // (fondu en vignette)
    injecter({ id: cle, cle, D: sc.D, fin: sc.fin, k, mini, noms });
  }

  /* ---------- n'animer que ce qui se voit ----------
     IntersectionObserver : .joue sur les plans visibles ; les autres restent en pause
     (animation-play-state) et ne coûtent rien. Suit aussi l'onglet de l'appli (CO.view). */
  function observer(racine = document, o = {}) {
    const root = racine || document;
    let enPause = false;
    const vus = new Set(), suivis = new Set();
    const vue = root.closest ? root.closest('.view') : null;
    const vueActive = () => !vue || !CO.view || CO.view === vue.dataset.view;
    const maj = (el) => el.classList.toggle('joue', !enPause && vueActive() && (!io || vus.has(el)));
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) vus.add(e.target); else vus.delete(e.target); maj(e.target); });
    }, { root: o.root || null, rootMargin: o.marge || '0px', threshold: o.seuil != null ? o.seuil : 0.35 }) : null;
    function rafraichir() {
      const els = root.querySelectorAll ? root.querySelectorAll('.plan[data-plan]') : [];
      els.forEach((el) => {
        if (suivis.has(el)) return;
        suivis.add(el);
        el.classList.add('plan-obs');
        if (io) io.observe(el); else maj(el);
      });
      suivis.forEach((el) => { if (!el.isConnected) { suivis.delete(el); vus.delete(el); if (io) io.unobserve(el); } });
    }
    rafraichir();
    if (CO.on) CO.on('view', () => suivis.forEach(maj));
    return {
      rafraichir,
      pause(oui = true) { enPause = !!oui; suivis.forEach(maj); },
      deconnecter() { if (io) io.disconnect(); suivis.forEach((el) => el.classList.remove('plan-obs', 'joue')); suivis.clear(); vus.clear(); },
    };
  }

  /* ---------- le grand plan dans une feuille ---------- */
  let surFermeture = null;
  function fermerFeuille() {
    const s = document.getElementById('feuille-plan');
    if (!s || s.hidden) return;
    if (CO.openSheet && CO.closeSheet) { CO.closeSheet('#feuille-plan'); return; }
    s.classList.remove('is-open');
    setTimeout(() => { s.hidden = true; const f = surFermeture; surFermeture = null; if (f) f(); }, 380);
  }
  function feuille(id, o = {}) {
    const inf = infos(id, o.rubrique);
    const it = CO.service ? CO.service(id) : null;
    const appli = !!(CO.openSheet && CO.closeSheet);
    let s = document.getElementById('feuille-plan');
    if (!s) {
      s = document.createElement('div');
      s.className = 'sheet sheet-plan';
      s.id = 'feuille-plan';
      s.hidden = true;
      s.dataset.cree = '1';
      s.setAttribute('role', 'dialog');
      s.setAttribute('aria-modal', 'true');
      s.setAttribute('aria-labelledby', 'fp-titre');
      s.innerHTML = '<div class="sheet-fond" data-close></div><div class="sheet-panel"><div class="sheet-grab" aria-hidden="true"></div>' +
        '<button class="sheet-close" type="button" data-close aria-label="Fermer"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<h2 class="sheet-titre" id="fp-titre"></h2><div class="fp-corps"></div></div>';
      document.body.appendChild(s);
    }
    if (!s.dataset.lie) {
      s.dataset.lie = '1';
      // une feuille écrite dans index.html est déjà branchée par co-app.js (fermer, glisser) ; la nôtre, par nous
      if (s.dataset.cree || !appli) s.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) fermerFeuille(); });
      if (!appli) document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerFeuille(); });
    }
    const corps = s.querySelector('.fp-corps');
    surFermeture = () => { corps.innerHTML = ''; if (o.onClose) o.onClose(); };
    s.querySelector('#fp-titre').textContent = inf.titre;
    const prix = it && CO.prixService ? CO.prixService(it) : '';
    const delai = it && CO.delaiTexte ? CO.delaiTexte(it.delai) : '';
    corps.innerHTML =
      `<div class="fp-plan">${svg(id, { taille: 'grand', joue: true, rubrique: o.rubrique })}</div>` +
      (inf.legende.length ? `<ol class="fp-legende">${inf.legende.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>` : '') +
      (it ? `<p class="fp-desc">${esc(it.desc)}</p><p class="fp-meta"><b>${esc(prix)}</b>${delai ? ' · ' + esc(delai) : ''}</p>` : '') +
      (o.action ? `<button class="btn btn-sauge btn-large fp-action" type="button">${esc(o.action.texte)}</button>` : '');
    const b = corps.querySelector('.fp-action');
    if (b && o.action) b.addEventListener('click', () => { o.action.fn(id); fermerFeuille(); });
    if (appli) CO.openSheet('#feuille-plan', () => { const f = surFermeture; surFermeture = null; if (f) f(); });
    else {
      s.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-open')));
    }
    return s;
  }

  CO.Plans = {
    svg,
    observer,
    feuille,
    fermer: fermerFeuille,
    infos,
    get ids() { return Object.keys(SCENES).filter((k) => !k.startsWith('rubrique:')); },
    INTRO,
  };
})();
