#!/usr/bin/env python3
"""
check_curves.py — check that each relaxed 3D knot in tools/curves.json is the
knot of its census triangulation, with the same chirality.

Projects each curve in a random direction, reads off a PD code, and asks
SnapPy for an orientation-preserving isometry from the diagram's exterior to
the census manifold that preserves the meridian (so the slopes drawn on the
3D knot are the slopes the calculator fills).

Usage:  python3 tools/check_curves.py
"""
import json
import math
import os
import random
import sys

import numpy as np
import snappy
import spherogram

HERE = os.path.dirname(os.path.abspath(__file__))


def rotation(rng):
    q = np.array([rng.gauss(0, 1) for _ in range(4)])
    q /= np.linalg.norm(q)
    a, b, c, d = q
    return np.array([
        [a*a+b*b-c*c-d*d, 2*(b*c-a*d), 2*(b*d+a*c)],
        [2*(b*c+a*d), a*a-b*b+c*c-d*d, 2*(c*d-a*b)],
        [2*(b*d-a*c), 2*(c*d+a*b), a*a-b*b-c*c+d*d]])


def pd_code(P):
    N = len(P)
    passes = []          # (curve parameter, crossing id, is_over, direction)
    cid = 0
    for i in range(N):
        a, b = P[i], P[(i + 1) % N]
        for j in range(i + 2, N):
            if i == 0 and j == N - 1:
                continue
            c, d = P[j], P[(j + 1) % N]
            r = b[:2] - a[:2]
            s = d[:2] - c[:2]
            den = r[0] * s[1] - r[1] * s[0]
            if abs(den) < 1e-14:
                continue
            w = c[:2] - a[:2]
            t = (w[0] * s[1] - w[1] * s[0]) / den
            u = (w[0] * r[1] - w[1] * r[0]) / den
            if not (0 <= t < 1 and 0 <= u < 1):
                continue
            zi = a[2] + t * (b[2] - a[2])
            zj = c[2] + u * (d[2] - c[2])
            passes.append((i + t, cid, zi > zj, r / np.linalg.norm(r)))
            passes.append((j + u, cid, zj > zi, s / np.linalg.norm(s)))
            cid += 1
    passes.sort(key=lambda x: x[0])
    n2 = len(passes)
    info = {}
    for k, (_, c, over, dirn) in enumerate(passes):
        info.setdefault(c, {})['over' if over else 'under'] = (k, dirn)
    pd = []
    for c, d in info.items():
        ku, du = d['under']
        ko, do = d['over']
        a_lab, c_lab = (ku - 1) % n2, ku
        o_in, o_out = (ko - 1) % n2, ko
        perp = np.array([du[1], -du[0]])      # rot90(-du) counterclockwise
        if perp @ do > 0:
            b_lab, d_lab = o_out, o_in
        else:
            b_lab, d_lab = o_in, o_out
        pd.append((a_lab, b_lab, c_lab, d_lab))
    return pd


def main():
    curves = json.load(open(os.path.join(HERE, 'curves.json')))
    rng = random.Random(7)
    ok = True
    for mid, rec in curves.items():
        pts = rec['curve'] if isinstance(rec, dict) else rec
        P0 = np.array(pts, dtype=float)
        M = snappy.Manifold(mid)
        verdict = None
        for attempt in range(4):
            P = P0 @ rotation(rng).T
            pd = pd_code(P)
            L = spherogram.Link(pd)
            E = L.exterior()
            try:
                isos = E.is_isometric_to(M, return_isometries=True)
            except Exception as err:      # rare numerical trouble: try another projection
                verdict = f'isometry test failed ({err})'
                continue
            if not isos:
                verdict = 'NOT the same knot'
                break
            pres = [iso for iso in isos if iso.cusp_maps()[0].det() > 0]
            mer = [iso for iso in pres if abs(iso.cusp_maps()[0][0, 0]) == 1 and iso.cusp_maps()[0][1, 0] == 0]
            if mer:
                verdict = 'ok'
            elif pres:
                verdict = 'same knot, but the meridian is not preserved'
            else:
                verdict = 'MIRROR IMAGE'
            break
        print(f'{mid:8s} {len(pd):3d} crossings in projection  {verdict}')
        ok = ok and verdict == 'ok'
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
