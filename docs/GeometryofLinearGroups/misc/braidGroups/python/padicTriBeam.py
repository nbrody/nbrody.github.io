#!/usr/bin/env python3
"""
p-adic beam search for triangular words in Burau(Birman F2) at t = p/q.

A word's matrix at t = p/q has entries in Z[1/(pq)].  It is lower
(resp. upper) triangular iff the three upper (resp. lower) entries are 0.
Score an entry n/(pq)^d by the bit length of n with all factors of p, q
stripped: that quantity is u-conjugation-invariant-ish and hits 0 exactly
when the entry is 0.  Beam-search minimizing the total stripped size.

Matrices are stored as integer 3x3 arrays with an implicit denominator
(pq)^d, normalized by stripping common pq-factors.
"""

from __future__ import annotations

import argparse
import time
from fractions import Fraction as Fr
from math import gcd

SYMS = ('X', 'Y', 'x', 'y')
INV = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}
UPPER_POS = ((0, 1), (0, 2), (1, 2))   # zero these => lower triangular
LOWER_POS = ((1, 0), (2, 0), (2, 1))   # zero these => upper triangular


def mm_int(A, B):
    return tuple(tuple(A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j]
                       for j in range(3)) for i in range(3))


def frac_gens(t: Fr):
    def sig(i):
        M = [[Fr(int(a == b)) for b in range(3)] for a in range(3)]
        r = i-1
        M[r][r] = -t
        if i > 1:
            M[r][r-1] = t
        if r+1 < 3:
            M[r][r+1] = Fr(1)
        return tuple(tuple(row) for row in M)

    def minv(A):
        det = (A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1])
               - A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])
               + A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]))
        return tuple(tuple(
            (A[(j+1) % 3][(i+1) % 3]*A[(j+2) % 3][(i+2) % 3]
             - A[(j+1) % 3][(i+2) % 3]*A[(j+2) % 3][(i+1) % 3]) / det
            for j in range(3)) for i in range(3))
    s1, s2, s3 = sig(1), sig(2), sig(3)
    X = mm_int(s3, minv(s1))   # works for Fractions too
    Y = mm_int(mm_int(s2, s3), mm_int(minv(s1), minv(s2)))
    return {'X': X, 'x': minv(X), 'Y': Y, 'y': minv(Y)}


def clear_denoms(M, pq):
    """Fraction matrix -> (int matrix, d) with denominator (pq)^d."""
    d = 0
    while True:
        scale = pq**d
        ok = all((e * scale).denominator == 1 for row in M for e in row)
        if ok:
            return tuple(tuple(int(e*scale) for e in row) for row in M), d
        d += 1


def strip_pq(n, p, q):
    if n == 0:
        return 0
    n = abs(n)
    for f in {p, q}:
        if f > 1:
            while n % f == 0:
                n //= f
    return n


def normalize(A, d, pq):
    """Strip common pq factors shared by ALL entries (with d >= 0)."""
    while d > 0:
        if all(e % pq == 0 for row in A for e in row):
            A = tuple(tuple(e // pq for e in row) for row in A)
            d -= 1
        else:
            break
    return A, d


class TriBeam:
    def __init__(self, t: Fr, target='lower'):
        self.t = t
        p, q = abs(t.numerator), t.denominator
        self.p, self.q = p, q
        self.pq = p*q
        g = frac_gens(t)
        self.gens = {}
        for s, M in g.items():
            self.gens[s] = clear_denoms(M, self.pq)
        self.bad_pos = UPPER_POS if target == 'lower' else LOWER_POS
        self.target = target

    def score(self, A):
        s = 0
        for (i, j) in self.bad_pos:
            n = strip_pq(A[i][j], self.p, self.q)
            s += n.bit_length()
        return s

    def step(self, word, A, d, sym):
        B, db = self.gens[sym]
        C = mm_int(A, B)
        C, dc = normalize(C, d + db, self.pq)
        return word + (sym,), C, dc

    def search(self, beam_width=3000, max_depth=150, verbose=True,
               n_hits=4, max_seconds=None):
        I = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
        beam = [((), I, 0, 0)]   # word, intmat, d, score
        hits = []
        seen = set()
        t0 = time.time()
        for depth in range(1, max_depth+1):
            cand = {}
            for word, A, d, sc in beam:
                last = word[-1] if word else None
                for s in SYMS:
                    if last and INV[s] == last:
                        continue
                    w2, C, dc = self.step(word, A, d, s)
                    key = (C, dc)
                    if key in seen:
                        continue
                    seen.add(key)
                    sc2 = self.score(C)
                    if sc2 == 0:
                        hits.append((w2, C, dc))
                        if verbose:
                            print(f"    HIT depth {depth}: {' '.join(w2)}")
                        if len(hits) >= n_hits:
                            return hits
                        continue
                    k2 = (C, dc)
                    if k2 not in cand or sc2 < cand[k2][3]:
                        cand[k2] = (w2, C, dc, sc2)
            pool = sorted(cand.values(), key=lambda x: (x[3], len(x[0])))
            beam = [(w, A, d, sc) for w, A, d, sc in pool[:beam_width]]
            if verbose and (depth % 10 == 0 or depth <= 3):
                bs = beam[0][3] if beam else -1
                print(f"    depth {depth:3d} | best score {bs:4d} | "
                      f"beam {len(beam):5d} | {time.time()-t0:.0f}s")
            if not beam:
                break
            if max_seconds and time.time()-t0 > max_seconds:
                if verbose:
                    print("    (time limit)")
                break
        return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-t', type=str, default='2')
    ap.add_argument('--target', choices=['lower', 'upper'], default='lower')
    ap.add_argument('-W', '--beam-width', type=int, default=3000)
    ap.add_argument('-D', '--max-depth', type=int, default=150)
    args = ap.parse_args()
    t = Fr(args.t)
    tb = TriBeam(t, args.target)
    print(f"Searching {args.target}-triangular words at t={t} "
          f"(W={args.beam_width}, D={args.max_depth})")
    hits = tb.search(args.beam_width, args.max_depth)
    print(f"{len(hits)} hits")
    for w, A, d, in hits:
        print(' '.join(w))
        print(f"  matrix/(pq)^{d}: {A}")


if __name__ == '__main__':
    main()
