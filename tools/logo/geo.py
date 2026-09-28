#!/usr/bin/env python3
"""Le logo CORDO63 reconstruit en géométrie : une grotesque très large et monoligne (ellipses « super »
et traits droits), ajustée lettre par lettre sur l'avatar Instagram (150 px).

Chaque lettre est un tracé central (ligne médiane) épaissi d'un trait constant : C, O, D, R, 6, 3 sont
décrits par quelques paramètres (centre, demi-largeur, rondeur, ouvertures, jonctions), optimisés pour
recouvrir l'encre de l'avatar. Sortie : tools/logo/_work/geo.json (+ images de contrôle) ; build.py écrit
ensuite assets/brand/logo-cordo63.svg et les tracés de js/co-brand.js.
Usage : python tools/logo/geo.py
"""
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "tools" / "logo" / "_work"
WORK.mkdir(parents=True, exist_ok=True)
AV = ROOT / "osint" / "ref" / "ig" / "cordo-avatar-logo.jpg"
CREAM = np.array([255, 242, 226.0])
INK = np.array([138, 146, 123.0])
SS = 8

im = np.asarray(Image.open(AV).convert("RGB")).astype(float)
axis = INK - CREAM
INKMAP = np.clip(((im - CREAM) @ axis) / (axis @ axis), 0, 1)
yy, xx = np.mgrid[0:150, 0:150]
INKMAP[(xx - 74.5) ** 2 + (yy - 74.5) ** 2 >= 73 ** 2] = 0
Y0, Y1 = 58, 84
TARGET = INKMAP[Y0:Y1, :]


def se(cx, cy, a, b, n, t):
    """point d'une super-ellipse (|x/a|^n + |y/b|^n = 1), angle paramétrique t (y vers le bas)"""
    c, s = math.cos(t), math.sin(t)
    return (cx + a * math.copysign(abs(c) ** (2 / n), c), cy + b * math.copysign(abs(s) ** (2 / n), s))


def arc(cx, cy, a, b, n, t0, t1, k=40):
    return [se(cx, cy, a, b, n, t0 + (t1 - t0) * i / k) for i in range(k + 1)]


# ---------- les lettres : chacune renvoie une liste de tracés (listes de points), fermé ou non ----------
# G : globaux { top, bot, w, n } ; P : paramètres de la lettre. y vers le bas, en pixels de l'avatar.
def g_O(G, P):
    top, bot = G["top"], G["bot"]
    cy, b = (top + bot) / 2, (bot - top) / 2
    return [(arc(P["cx"], cy, P["a"], b, G["n"], 0, 2 * math.pi, 80), True)]


def g_C(G, P):
    top, bot = G["top"], G["bot"]
    cy, b = (top + bot) / 2, (bot - top) / 2
    al = P["ouv"]
    return [(arc(P["cx"], cy, P["a"], b, G["n"], al, 2 * math.pi - al, 70), False)]


def g_D(G, P):
    top, bot = G["top"], G["bot"]
    cy, b = (top + bot) / 2, (bot - top) / 2
    x0, x1, r = P["x0"], P["x1"], P["r"]  # r : demi-largeur de la courbe de droite
    pts = [(x0, top), (x1 - r, top)] + arc(x1 - r, cy, r, b, G["n"], -math.pi / 2, math.pi / 2, 40)[1:] + [(x0, bot)]
    return [(pts, True)]


def g_R(G, P):
    top, bot = G["top"], G["bot"]
    x0, x1, r, yj = P["x0"], P["x1"], P["r"], P["yj"]
    bb = (yj - top) / 2
    bowl = [(x0, bot), (x0, top), (x1 - r, top)] + arc(x1 - r, top + bb, r, bb, G["n"], -math.pi / 2, math.pi / 2, 30)[1:] + [(x0, yj)]
    leg = [(P["l0"], yj), (P["l1"], bot)]
    return [(bowl, False), (leg, False)]


def g_6(G, P):
    top, bot = G["top"], G["bot"]
    n = G["n"]
    cx, a, bb = P["cx"], P["a"], P["bb"]  # la panse du bas
    cyb = bot - bb
    bowl = arc(cx, cyb, a, bb, n, 0, 2 * math.pi, 70)
    # la hampe : le haut d'une grande ellipse, même centre en x, tangente à la panse à gauche
    B = cyb - top
    stem = arc(cx, cyb, a, B, n, math.pi, 2 * math.pi - P["fin"], 50)  # de la gauche (π) vers le haut, finit à droite
    return [(bowl, True), (stem, False)]


def g_3(G, P):
    top, bot = G["top"], G["bot"]
    n = G["n"]
    cx, yj = P["cx"], P["yj"]
    at, ab = P["at"], P["ab"]
    bt, bb = (yj - top) / 2, (bot - yj) / 2
    haut = arc(cx + P["dxt"], top + bt, at, bt, n, math.pi + P["o1"], 2 * math.pi + math.pi / 2, 40)  # du haut-gauche, par la droite, jusqu'en bas (jonction)
    haut.append((P["xj"], yj))
    bas = [(P["xj"], yj)] + arc(cx, yj + bb, ab, bb, n, -math.pi / 2, math.pi - P["o2"], 50)
    return [(haut, False), (bas, False)]


LETTRES = [("C", g_C), ("O", g_O), ("R", g_R), ("D", g_D), ("O", g_O), ("6", g_6), ("3", g_3)]


def raster(paths_list, w, shape=(Y1 - Y0, 150), ss=SS):
    img = Image.new("L", (shape[1] * ss, shape[0] * ss), 0)
    dr = ImageDraw.Draw(img)
    W = max(1, int(round(w * ss)))
    for pts, closed in paths_list:
        P = [((x) * ss, (y - Y0) * ss) for x, y in pts]
        if closed:
            P = P + [P[0], P[1]]
        dr.line(P, fill=255, width=W, joint="curve")
    a = np.asarray(img, dtype=float) / 255
    return a.reshape(shape[0], ss, shape[1], ss).mean(axis=(1, 3))


def build(G, PS):
    out = []
    for (ch, fn), P in zip(LETTRES, PS):
        out += fn(G, P)
    return out


def loss(G, PS):
    r = raster(build(G, PS), G["w"])
    return float(((r - TARGET) ** 2).sum())


# ---------- départ : mesuré sur l'avatar (colonnes d'encre : C 2–22, O 25–46, R 49–67, D 69–88,
# O 90–111, 6 114–128, 3 130–148 ; traits haut/bas centrés à y 65,6 / 77,8 ; épaisseur ~1,6 px) ----------
G0 = {"top": 65.6, "bot": 77.8, "w": 1.6, "n": 2.3}
PS0 = [
    {"cx": 12.0, "a": 9.2, "ouv": 0.7},
    {"cx": 35.5, "a": 9.7},
    {"x0": 49.8, "x1": 66.0, "r": 3.2, "yj": 72.0, "l0": 60.0, "l1": 66.2},
    {"x0": 69.8, "x1": 87.2, "r": 6.0},
    {"cx": 100.5, "a": 9.7},
    {"cx": 121.0, "a": 6.2, "bb": 3.3, "fin": 0.6},
    {"cx": 139.0, "at": 7.2, "ab": 8.0, "yj": 71.8, "dxt": -0.4, "o1": 0.3, "o2": 0.35, "xj": 136.0},
]
# bornes : ±1,5 px autour des mesures, rondeurs et ouvertures raisonnables
def bornes(k, v):
    if k in ("ouv", "fin", "o1", "o2"):
        return (0.05, 1.3)
    if k in ("n",):
        return (2.0, 3.2)
    if k in ("w",):
        return (1.1, 2.1)
    if k in ("r", "bb"):
        return (max(1.0, v - 2.0), v + 2.0)
    if k in ("dxt",):
        return (-2.0, 2.0)
    return (v - 1.5, v + 1.5)
KEYS = [list(p.keys()) for p in PS0]
GK = ["top", "bot", "w", "n"]


def pack(G, PS):
    return [G[k] for k in GK] + [p[k] for p, ks in zip(PS, KEYS) for k in ks]


def unpack(v):
    G = {k: v[i] for i, k in enumerate(GK)}
    PS, i = [], len(GK)
    for ks in KEYS:
        PS.append({k: v[i + j] for j, k in enumerate(ks)})
        i += len(ks)
    return G, PS


def main():
    v0 = pack(G0, PS0)
    print("départ", loss(*unpack(v0)))
    # 1) chaque lettre seule (les globaux fixés), 2) tout ensemble
    v = list(v0)
    for rnd in range(3):
        i = len(GK)
        for li, ks in enumerate(KEYS):
            idx = list(range(i, i + len(ks)))
            def f(sub):
                vv = list(v)
                for j, x in zip(idx, sub):
                    vv[j] = x
                return loss(*unpack(vv))
            ks_ = [k for k in KEYS[li]]
            B = [bornes(k, v0[j]) for k, j in zip(ks_, idx)]
            r = minimize(f, [v[j] for j in idx], method="Powell", bounds=B, options={"maxiter": 2500, "xtol": 1e-3, "ftol": 1e-6})
            for j, x in zip(idx, r.x):
                v[j] = float(x)
            i += len(ks)
        def fg(sub):
            vv = list(sub) + v[len(GK):]
            return loss(*unpack(vv))
        r = minimize(fg, v[: len(GK)], method="Powell", bounds=[bornes(k, v0[i]) for i, k in enumerate(GK)], options={"maxiter": 800, "xtol": 1e-3})
        v[: len(GK)] = [float(x) for x in r.x]
        print("tour", rnd, loss(*unpack(v)))
    G, PS = unpack(v)
    r = raster(build(G, PS), G["w"])
    inter = np.minimum(r, TARGET).sum(); union = np.maximum(r, TARGET).sum()
    print("IoU", inter / union)
    json.dump({"G": G, "PS": PS, "lettres": [c for c, _ in LETTRES], "iou": float(inter / union)}, open(WORK / "geo.json", "w"), indent=1)
    H, W = TARGET.shape
    big = lambda a: Image.fromarray((255 - a * 255).astype(np.uint8)).resize((W * 8, H * 8), Image.LANCZOS)
    im2 = Image.new("L", (W * 8, H * 16 + 10), 255)
    im2.paste(big(TARGET), (0, 0)); im2.paste(big(r), (0, H * 8 + 10))
    im2.save(WORK / "geo-compare.png")
    # rendu net, grand
    hi = raster(build(G, PS), G["w"], ss=24)
    Image.fromarray((255 - hi * 255).astype(np.uint8)).resize((W * 8, H * 8), Image.LANCZOS).save(WORK / "geo-net.png")


if __name__ == "__main__":
    main()
