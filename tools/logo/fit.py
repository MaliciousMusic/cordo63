#!/usr/bin/env python3
"""Reconstruit le logo CORDO63 en vectoriel à partir de l'avatar Instagram (150 px, osint/ref/ig/cordo-avatar-logo.jpg).

L'image est trop petite pour un tracé direct : on cherche la grotesque étendue (Archivo, axes largeur/graisse)
et les réglages (largeur, graisse, approche, échelle) qui recouvrent le mieux l'encre de l'avatar, lettre par
lettre, puis on écrit les contours obtenus (assets/brand/logo-cordo63.svg + js/co-brand.js via build.py).
Usage : python tools/logo/fit.py   (écrit tools/logo/_work/fit.json et des images de contrôle)
"""
import json
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image, ImageDraw
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "tools" / "logo" / "_work"
WORK.mkdir(parents=True, exist_ok=True)
AV = ROOT / "osint" / "ref" / "ig" / "cordo-avatar-logo.jpg"
FONT = ROOT / "assets" / "fonts" / "archivo-normal-100-900-latin.woff2"
TEXT = "CORDO63"
CREAM = np.array([255, 242, 226.0])
INK = np.array([138, 146, 123.0])
SS = 8  # sur-échantillonnage du rendu

# ---------- l'encre de l'avatar : 0 = crème, 1 = vert plein ----------
im = np.asarray(Image.open(AV).convert("RGB")).astype(float)
axis = INK - CREAM
ink = ((im - CREAM) @ axis) / (axis @ axis)
ink = np.clip(ink, 0, 1)
yy, xx = np.mgrid[0:ink.shape[0], 0:ink.shape[1]]
ink[(xx - 74.5) ** 2 + (yy - 74.5) ** 2 >= 73 ** 2] = 0  # hors du rond de l'avatar
Y0, Y1, X0, X1 = 56, 83, 0, 150  # la ligne CORDO63 seule (la phrase dessous commence à y = 84)
target = ink[Y0:Y1, X0:X1]
Image.fromarray((255 - target * 255).astype(np.uint8)).resize(((X1 - X0) * 6, (Y1 - Y0) * 6), Image.NEAREST).save(WORK / "cible.png")

_cache = {}
def glyphs(wdth, wght):
    key = (round(wdth, 1), round(wght, 0))
    if key in _cache:
        return _cache[key]
    f = TTFont(FONT)
    inst = instantiateVariableFont(f, {"wdth": key[0], "wght": key[1]}, inplace=False)
    gs = inst.getGlyphSet()
    cmap = inst.getBestCmap()
    upm = inst["head"].unitsPerEm
    out = []
    for ch in TEXT:
        name = cmap[ord(ch)]
        pen = RecordingPen()
        gs[name].draw(pen)
        out.append((pen.value, gs[name].width))
    capH = inst["OS/2"].sCapHeight
    _cache[key] = (out, upm, capH)
    return _cache[key]

def flatten(rec, sx, sy, ox, oy):
    """contours → polygones (pixels), y vers le bas"""
    polys, cur, p0 = [], [], None
    def P(x, y):
        return (ox + x * sx, oy - y * sy)
    for op, args in rec:
        if op == "moveTo":
            cur = [P(*args[0])]
            p0 = args[0]
        elif op == "lineTo":
            cur.append(P(*args[0])); p0 = args[0]
        elif op == "qCurveTo":
            pts = [p0] + list(args)
            # décomposition des qCurveTo implicites (TrueType)
            segs = []
            on = pts[0]
            offs = pts[1:-1]
            end = pts[-1]
            for i, off in enumerate(offs):
                nxt = end if i == len(offs) - 1 else ((off[0] + offs[i + 1][0]) / 2, (off[1] + offs[i + 1][1]) / 2)
                segs.append((on, off, nxt)); on = nxt
            if not offs:
                segs.append((on, on, end))
            for a, b, c in segs:
                for t in np.linspace(0, 1, 12)[1:]:
                    x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0]
                    y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]
                    cur.append(P(x, y))
            p0 = end
        elif op == "curveTo":
            a = p0; b, c, d = args
            for t in np.linspace(0, 1, 14)[1:]:
                mt = 1 - t
                x = mt**3 * a[0] + 3 * mt * mt * t * b[0] + 3 * mt * t * t * c[0] + t**3 * d[0]
                y = mt**3 * a[1] + 3 * mt * mt * t * b[1] + 3 * mt * t * t * c[1] + t**3 * d[1]
                cur.append(P(x, y))
            p0 = d
        elif op in ("closePath", "endPath"):
            if len(cur) > 2:
                polys.append(cur)
            cur = []
    return polys

def render(params, shape=None, ss=SS):
    wdth, wght, scale, sxr, tx, ty, track = params[:7]
    kern = params[7:]
    (gl, upm, capH) = glyphs(wdth, wght)
    H, W = target.shape if shape is None else shape
    img = Image.new("L", (W * ss, H * ss), 0)
    dr = ImageDraw.Draw(img)
    s = scale * ss / upm
    x = tx * ss
    for i, (rec, adv) in enumerate(gl):
        k = kern[i] if i < len(kern) else 0
        polys = flatten(rec, s * sxr, s, x + k * ss, ty * ss)
        # remplissage pair-impair : chaque contour XOR (trous des O, D, R, 6)
        m = Image.new("L", img.size, 0)
        md = ImageDraw.Draw(m)
        acc = np.zeros((img.size[1], img.size[0]), dtype=np.uint8)
        for poly in polys:
            layer = Image.new("1", img.size, 0)
            ImageDraw.Draw(layer).polygon(poly, fill=1)
            acc ^= np.asarray(layer, dtype=np.uint8)
        img = Image.fromarray(np.maximum(np.asarray(img), acc * 255))
        x += (adv * s * sxr) + track * ss
    a = np.asarray(img, dtype=float) / 255
    a = a.reshape(H, ss, W, ss).mean(axis=(1, 3))
    return a

def loss(params):
    r = render(params)
    return float(((r - target) ** 2).sum())

def main():
    global best, p
    best = None
    for wdth in (112, 125):
        for wght in (160, 220, 280, 340):
            # hauteur de capitale mesurée : 14,6 px (lignes 64,6 → 79,3) ; départ x ~ 2
            p0 = [wdth, wght, 21.3, 1.08, 2.0, 23.3, 0.0] + [0.0] * len(TEXT)
            L = loss(p0)
            if best is None or L < best[0]:
                best = (L, p0)
    print("meilleur départ", best)

    def obj(v):
        p = [best[1][0], best[1][1]] + list(v)
        return loss(p)

    B = [(19, 24), (0.95, 1.3), (-2, 6), (21, 26), (-1.5, 3)] + [(-2.5, 2.5)] * len(TEXT)
    res = minimize(obj, best[1][2:], method="Powell", bounds=B, options={"maxiter": 3000, "xtol": 1e-3, "ftol": 1e-5})
    p = [best[1][0], best[1][1]] + list(res.x)
    print("après échelle/position :", res.fun)

    def obj2(v):
        return loss(list(v[:2]) + p[2:])
    res2 = minimize(obj2, p[:2], method="Powell", bounds=[(100, 125), (100, 500)], options={"maxiter": 400, "xtol": 0.5})
    p = list(res2.x) + p[2:]
    res3 = minimize(lambda v: loss(p[:2] + list(v)), p[2:], method="Powell", bounds=B, options={"maxiter": 4000, "ftol": 1e-6})
    p = p[:2] + list(res3.x)
    final = loss(p)
    r = render(p)
    inter = np.minimum(r, target).sum(); union = np.maximum(r, target).sum()
    print("final", final, "IoU", inter / union, "params", [round(float(x), 3) for x in p])
    json.dump({"params": [float(x) for x in p], "iou": float(inter / union), "loss": final}, open(WORK / "fit.json", "w"), indent=1)
    Image.fromarray((255 - r * 255).astype(np.uint8)).resize(((X1 - X0) * 6, (Y1 - Y0) * 6), Image.NEAREST).save(WORK / "rendu.png")
    diff = np.stack([255 - target * 255, 255 - r * 255, 255 - np.minimum(r, target) * 255], -1).astype(np.uint8)
    Image.fromarray(diff).resize(((X1 - X0) * 6, (Y1 - Y0) * 6), Image.NEAREST).save(WORK / "diff.png")


if __name__ == "__main__":
    main()
