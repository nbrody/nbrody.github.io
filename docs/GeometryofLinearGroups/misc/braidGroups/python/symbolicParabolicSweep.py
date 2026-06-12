#!/usr/bin/env python3
"""
Symbolic parabolic sweep over Z[t, t^{-1}]  (requires python-flint)
===================================================================

For every freely reduced word w in Birman's F2 = <X, Y> of length <= L,
compute the first row of its reduced Burau matrix symbolically.  The word
is "parabolic" (first row proportional to e1^T, i.e. it stabilizes the
covector flag of u = x Y X y) precisely at the roots of

    g_w(t) = gcd( M(w)[0][1](t),  M(w)[0][2](t) )   in  Z[t].

Every root t0 (rational or algebraic, t0 != 0, units excluded by the
caller's interpretation) yields kernel words of the Burau representation
of B4 specialized at t0, via the construction of rationalKernelSearch.py:
v = [w, u] lies in the abelian unipotent group N where conjugation by
u^{-1} acts as multiplication by t0^6, so for t0 = p/q,

    u^{-1} v^{q^6} u v^{-p^6}

is a nontrivial free-group word mapping to the identity (provided v != 1;
at roots of unity with t0^6 = 1, e.g. the dominant factor t^2 - t + 1,
the relation degenerates to commutation and gives no kernel word).

This single sweep finds ALL specializations reachable by parabolic words
of length <= L.  Empirical result of the L = 12 sweep (1,062,880 words):

  * NO linear factors at all  =>  no rational t0 outside {0, +-1} is
    reachable by a parabolic word of length <= 12 (t = 2 needs length 15);
  * 145,184 parabolic events, all at algebraic points; the most frequent
    factors are cyclotomic (t^2-t+1 ~ zeta_6 in 118k events, t^2+1 ~ i,
    t^2+x+1 ~ zeta_3, t^6+t^3+1 ~ zeta_9, ...) followed by non-cyclotomic
    algebraic integers (t^4+t-1, t^3-t^2+1, t^2+t-1, ...);
  * the only "universal" parabolic words (rows proportional to e1^T
    identically in t) are the powers of u = x Y X y itself.

Usage:  python3 symbolicParabolicSweep.py [-L 12] [-o sweep_output.jsonl]
"""

from __future__ import annotations

import argparse
import json
import time

from flint import fmpz_poly

T = fmpz_poly([0, 1])
ONE = fmpz_poly([1])
ZERO = fmpz_poly([])
INV = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}


def mm(A, B):
    return tuple(tuple(A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j]
                       for j in range(3)) for i in range(3))


def burau_poly_gens():
    """Birman generators as polynomial matrices (true matrices times a
    power of t, which is irrelevant for vanishing loci away from t=0)."""
    def sig(i):
        M = [[ONE if a == b else ZERO for b in range(3)] for a in range(3)]
        r = i-1
        M[r][r] = -T
        if i > 1:
            M[r][r-1] = T
        if r+1 < 3:
            M[r][r+1] = ONE
        return tuple(tuple(row) for row in M)

    def siginv(i):                      # t * sigma_i^{-1}
        M = [[T if a == b else ZERO for b in range(3)] for a in range(3)]
        r = i-1
        M[r][r] = -ONE
        if i > 1:
            M[r][r-1] = T
        if r+1 < 3:
            M[r][r+1] = ONE
        return tuple(tuple(row) for row in M)

    s1, s2, s3 = sig(1), sig(2), sig(3)
    S1, S2, S3 = siginv(1), siginv(2), siginv(3)
    return {'X': mm(s3, S1), 'x': mm(s1, S3),
            'Y': mm(mm(s2, s3), mm(S1, S2)),
            'y': mm(mm(s2, s1), mm(S3, S2))}


def strip_t(p):
    cs = [int(p[i]) for i in range(p.degree()+1)]
    v = 0
    while v < len(cs) and cs[v] == 0:
        v += 1
    return fmpz_poly(cs[v:])


UNIT_FACTORS = {(1, 1), (-1, 1), (1, -1), (-1, -1)}   # t -/+ 1


def interesting_factors(g):
    """Nonunit, non-t factors of g as fmpz_poly list."""
    if g.degree() <= 0:
        return []
    out = []
    _, facs = g.factor()
    for f, _e in facs:
        f = strip_t(f)
        if f.degree() <= 0:
            continue
        cs = tuple(int(f[i]) for i in range(f.degree()+1))
        if cs in UNIT_FACTORS:
            continue
        out.append(f)
    return out


def sweep(max_len: int, out_path: str | None, verbose=True):
    gens = burau_poly_gens()
    t0 = time.time()
    stack = [((s,), gens[s]) for s in 'XYxy']
    n = 0
    events = []
    fh = open(out_path, 'w') if out_path else None
    while stack:
        w, M = stack.pop()
        n += 1
        if verbose and n % 500000 == 0:
            print(f"  ... {n} words, {len(events)} events, "
                  f"{time.time()-t0:.0f}s", flush=True)
        a, b = M[0][1], M[0][2]
        if not a and not b:
            ev = {'word': ' '.join(w), 'type': 'universal'}
            events.append(ev)
        else:
            g = a.gcd(b) if (a and b) else (a if a else b)
            facs = interesting_factors(strip_t(g))
            if facs:
                ev = {'word': ' '.join(w), 'type': 'roots',
                      'factors': [str(f) for f in facs],
                      'rational_roots': sorted(
                          {f'{-int(f[0])}/{int(f[1])}'
                           for f in facs if f.degree() == 1})}
                events.append(ev)
        if events and events[-1].get('word') == ' '.join(w) and fh:
            fh.write(json.dumps(events[-1]) + '\n')
        if len(w) < max_len:
            last = w[-1]
            for s in 'XYxy':
                if INV[s] != last:
                    stack.append((w + (s,), mm(M, gens[s])))
    if fh:
        fh.close()
    if verbose:
        n_lin = sum(1 for e in events if e.get('rational_roots'))
        print(f"done: {n} words, {len(events)} parabolic events, "
              f"{n_lin} with rational roots, {time.time()-t0:.0f}s")
    return events


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-L', '--max-len', type=int, default=12)
    ap.add_argument('-o', '--output', default=None,
                    help='write events as JSON lines')
    args = ap.parse_args()
    sweep(args.max_len, args.output)


if __name__ == '__main__':
    main()
