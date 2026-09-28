#!/usr/bin/env python3
"""Écrit le logo CORDO63 reconstruit (tools/logo/_work/geo.json, voir geo.py) :
  - assets/brand/logo-cordo63.svg : le mot seul, traits vert sauge (fichier de travail, icônes) ;
  - assets/brand/logo-cordo63-complet.svg : le mot + « cordonnerie • maroquinerie • clés » (Archivo large, en contours) ;
  - js/co-brand.js : les tracés, lettre par lettre, pour l'appli (CO.BRAND, CO.logo()).
Repère : hauteur de capitale (bord extérieur) = 100 unités, le mot commence à x = 0.
Usage : python tools/logo/build.py
"""
import json
import math
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

import geo

ROOT = Path(__file__).resolve().parents[2]
D = json.load(open(ROOT / "tools" / "logo" / "_work" / "geo.json", encoding="utf-8"))
G, PS = D["G"], D["PS"]
SAUGE = "#8A927B"
CREME = "#FFF2E2"

# échelle : capitale extérieure (top - w/2 → bot + w/2) = 100 unités
cap = (G["bot"] - G["top"]) + G["w"]
K = 100.0 / cap
Y0 = G["top"] - G["w"] / 2
# bord gauche du mot : le C (cx - a - w/2)
X0 = PS[0]["cx"] - PS[0]["a"] - G["w"] / 2
W = G["w"] * K


def T(p):
    return ((p[0] - X0) * K, (p[1] - Y0) * K)


def fmt(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith(".0") else s


def chemin(pts, ferme, lisse):
    """points → chemin SVG : droites pour les traits (jambages, barres), Catmull-Rom → Bézier pour les courbes"""
    P = [T(p) for p in pts]
    if not lisse:
        d = "M" + " L".join(fmt(x) + " " + fmt(y) for x, y in P)
        return d + ("Z" if ferme else "")
    n = len(P)
    if ferme and math.dist(P[0], P[-1]) < 1e-6:
        P = P[:-1]; n -= 1
    d = f"M{fmt(P[0][0])} {fmt(P[0][1])}"
    rng = range(n) if ferme else range(n - 1)
    for i in rng:
        p0 = P[(i - 1) % n] if ferme else P[max(0, i - 1)]
        p1 = P[i]
        p2 = P[(i + 1) % n] if ferme else P[i + 1]
        p3 = P[(i + 2) % n] if ferme else P[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}"
    return d + ("Z" if ferme else "")


def reech(pts, k):
    """rééchantillonne une courbe en k segments (moins de points, courbes lissées ensuite)"""
    if len(pts) <= k + 1:
        return pts
    idx = [round(i * (len(pts) - 1) / k) for i in range(k + 1)]
    return [pts[i] for i in idx]


def bez(P):
    """courbe par points → segments de Bézier (Catmull-Rom, tangentes bornées aux extrémités)"""
    n, out = len(P), ""
    for i in range(n - 1):
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        out += f"C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}"
    return out


def mixte(segs, ferme=False):
    """un seul tracé continu : [('L', pts) | ('C', pts)], chaque morceau part du dernier point du précédent"""
    P0 = T(segs[0][1][0])
    d = f"M{fmt(P0[0])} {fmt(P0[1])}"
    for kind, pts in segs:
        P = [T(p) for p in pts]
        if kind == "L":
            d += "".join(f"L{fmt(x)} {fmt(y)}" for x, y in P[1:])
        else:
            d += bez(P)
    return d + ("Z" if ferme else "")


LETTRES = []
for (ch, fn), P in zip(geo.LETTRES, PS):
    parts = fn(G, P)
    if ch == "D":
        pts = parts[0][0]
        d = mixte([("L", pts[0:2]), ("C", reech(pts[1:-1], 12)), ("L", pts[-2:])], ferme=True)
    elif ch == "R":
        bowl, leg = parts[0][0], parts[1][0]
        d = mixte([("L", bowl[0:3]), ("C", reech(bowl[2:-1], 10)), ("L", bowl[-2:])])
        d += " " + mixte([("L", leg)])
    elif ch == "3":
        haut, bas = parts[0][0], parts[1][0]
        d = mixte([("C", reech(haut[:-1], 16)), ("L", [haut[-2], haut[-1]]), ("C", reech(bas, 18))])
    else:
        d = " ".join(chemin(reech(pts, 24 if ferme else 18), ferme, True) for pts, ferme in parts)
    xs = []
    for pts, _ in parts:
        xs += [T(p)[0] for p in pts]
    LETTRES.append({"c": ch, "d": d, "x0": round(min(xs) - W / 2, 1), "x1": round(max(xs) + W / 2, 1)})

LARG = max(l["x1"] for l in LETTRES)
VB = f"0 0 {fmt(LARG)} 100"

# ---------- la phrase : Archivo large et fine, en contours (pour le fichier SVG et les icônes) ----------
PHRASE = "cordonnerie • maroquinerie • clés"
font = TTFont(ROOT / "assets" / "fonts" / "archivo-normal-100-900-latin.woff2")
inst = instantiateVariableFont(font, {"wdth": 125, "wght": 330}, inplace=False)
gs, cmap, upm = inst.getGlyphSet(), inst.getBestCmap(), inst["head"].unitsPerEm
# sur l'avatar : x-height ~3 px, la phrase occupe ~76 % de la largeur du mot, 5 px sous les capitales
PH_H = 26.0  # hauteur d'x visée (unités)
xh = inst["OS/2"].sxHeight or 520
s = PH_H / xh
larg_phrase = sum(gs[cmap[ord(c)]].width for c in PHRASE) * s
track = (LARG * 0.78 - larg_phrase) / (len(PHRASE) - 1)
x = (LARG - (larg_phrase + track * (len(PHRASE) - 1))) / 2
base = 100 + 40 + PH_H
d_phrase = []
for c in PHRASE:
    g = gs[cmap[ord(c)]]
    pen = SVGPathPen(gs)
    g.draw(TransformPen(pen, (s, 0, 0, -s, x, base)))
    if pen.getCommands():
        d_phrase.append(pen.getCommands())
    x += g.width * s + track
PHRASE_D = " ".join(d_phrase)
H_COMPLET = base + 8

stroke = f'fill="none" stroke="{SAUGE}" stroke-width="{fmt(W)}" stroke-linejoin="miter" stroke-miterlimit="4"'
mot = "\n".join(f'  <path d="{l["d"]}"/>' for l in LETTRES)
(ROOT / "assets" / "brand").mkdir(parents=True, exist_ok=True)
(ROOT / "assets" / "brand" / "logo-cordo63.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-{fmt(W)} -{fmt(W)} {fmt(LARG + 2 * W)} {fmt(100 + 2 * W)}" role="img" aria-label="CORDO63">\n<g {stroke}>\n{mot}\n</g>\n</svg>\n', encoding="utf-8")
(ROOT / "assets" / "brand" / "logo-cordo63-complet.svg").write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-{fmt(W)} -{fmt(W)} {fmt(LARG + 2 * W)} {fmt(H_COMPLET + 2 * W)}" role="img" aria-label="CORDO63, cordonnerie, maroquinerie, clés">\n<g {stroke}>\n{mot}\n</g>\n<path fill="#6F7766" d="{PHRASE_D}"/>\n</svg>\n', encoding="utf-8")

js = f"""/* ==========================================================================
   Cordo 63 — la marque : le logo CORDO63, reconstruit en tracés (tools/logo/geo.py + build.py)
   d'après leur avatar Instagram (150 px) : une grotesque très large, monoligne, vert sauge.
   ⚠ Fichier source du logo à demander à Clément : ces tracés en sont une reconstruction fidèle,
   pas l'original. Généré par tools/logo/build.py : ne pas modifier à la main.
   Repère : capitales de 0 à 100 (bord extérieur), le mot de x = 0 à x = {fmt(LARG)}.
   ========================================================================== */
(function () {{
  'use strict';
  const CO = (window.CO = window.CO || {{}});
  const NS = 'http://www.w3.org/2000/svg';

  CO.BRAND = {{
    sauge: '{SAUGE}',
    creme: '{CREME}',
    trait: {fmt(W)},
    largeur: {fmt(LARG)},
    lettres: {json.dumps([{"c": l["c"], "d": l["d"], "x0": l["x0"], "x1": l["x1"]} for l in LETTRES], ensure_ascii=False)},
    phrase: {{ texte: '{PHRASE}', d: '{PHRASE_D}', h: {fmt(H_COMPLET)} }},
  }};

  /** Le logo en <svg> : CO.logo({{ couleur, phrase, lettres }}) ; lettres = true → un <g class="l"> par lettre (animables) */
  CO.logo = function (opts = {{}}) {{
    const B = CO.BRAND, w = B.trait;
    const h = opts.phrase ? B.phrase.h : 100;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `${{-w}} ${{-w}} ${{B.largeur + 2 * w}} ${{h + 2 * w}}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', opts.couleur || 'currentColor');
    g.setAttribute('stroke-width', w);
    g.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(g);
    B.lettres.forEach((l, i) => {{
      const lg = document.createElementNS(NS, 'g');
      lg.setAttribute('class', 'l');
      lg.style.setProperty('--i', i);
      lg.style.transformOrigin = `${{(l.x0 + l.x1) / 2}}px 50px`;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', l.d);
      lg.appendChild(p);
      g.appendChild(lg);
    }});
    if (opts.phrase) {{
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', B.phrase.d);
      p.setAttribute('class', 'phrase');
      p.setAttribute('fill', opts.couleurPhrase || 'currentColor');
      svg.appendChild(p);
    }}
    return svg;
  }};
}})();
"""
(ROOT / "js" / "co-brand.js").write_text(js, encoding="utf-8", newline="\n")
print("logo :", fmt(LARG), "x 100 unités, trait", fmt(W), "· js/co-brand.js", len(js) // 1024, "Ko")
