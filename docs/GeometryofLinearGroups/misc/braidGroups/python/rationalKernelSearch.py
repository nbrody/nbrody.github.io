#!/usr/bin/env python3
"""
Kernel words for the Burau representation of B4 at rational t = p/q
===================================================================

Generalizes the t=2 discovery (u^{-1} v u = v^64 with v = w2 u^{-1}).

Structure theorem behind the search
-----------------------------------
Work in Birman's free group F2 = <X, Y> inside B4, with
    X = s3 s1^{-1},   Y = s2 s3 s1^{-1} s2^{-1},
and let u = X^{-1} Y X Y^{-1}  (in letters: x Y X y).

Over Z[t, t^{-1}] the reduced Burau matrix of u is LOWER TRIANGULAR with
diagonal (t^4, t^{-2}, t^{-2}); its Levi (lower 2x2) block is the CENTRAL
matrix t^{-2} I.  Consequently, for ANY word p whose Burau matrix at a
specialization t has first row proportional to e1^T (i.e. p lies in the
parabolic P~ = stabilizer of the projective covector [e1^T]), the
commutator  v = [p, u] = p^{-1} u^{-1} p u  lies in the abelian unipotent
group  N = { I + (a e2 + b e3) e1^T }.   On N, conjugation by u^{-1} is
multiplication by t^6, and v^k = I + k (v - I).  Hence at t = p/q:

    u^{-1} v^{q^6} u = v^{p^6}        (exactly, for every such p)

If v != 1 in F2, the word   R = u^{-1} v^{q^6} u v^{-p^6}   is a
NONTRIVIAL element of F2 (conjugate powers of an element of a free group
have equal exponents, and q^6 != p^6 for t != 0, +-1) that maps to the
identity: an explicit kernel word of the Burau representation of B4
specialized at t.  If instead Burau_t(v) = I with v != 1 in F2, then v
itself is already a kernel word.

Finding p: collision search.  Two words w1, w2 satisfy
[e1^T M(w1)] = [e1^T M(w2)]  iff  p = w1 w2^{-1} is in P~.  So bucket all
short words by the projective point of their first row (exact integer
arithmetic) and read off collisions.

Everything is verified with exact rational arithmetic; no floats.

Output: ../data/rational_kernel_db.json
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from fractions import Fraction as Fr

SYMS = ('X', 'Y', 'x', 'y')
INV = {'X': 'x', 'x': 'X', 'Y': 'y', 'y': 'Y'}
U_WORD = ('x', 'Y', 'X', 'y')


# ── exact 3x3 linear algebra over Q ──────────────────────────────

def mm(A, B):
    return tuple(tuple(A[i][0]*B[0][j] + A[i][1]*B[1][j] + A[i][2]*B[2][j]
                       for j in range(3)) for i in range(3))


def mat_inv(A):
    det = (A[0][0]*(A[1][1]*A[2][2]-A[1][2]*A[2][1])
           - A[0][1]*(A[1][0]*A[2][2]-A[1][2]*A[2][0])
           + A[0][2]*(A[1][0]*A[2][1]-A[1][1]*A[2][0]))
    return tuple(tuple(
        (A[(j+1) % 3][(i+1) % 3]*A[(j+2) % 3][(i+2) % 3]
         - A[(j+1) % 3][(i+2) % 3]*A[(j+2) % 3][(i+1) % 3]) / det
        for j in range(3)) for i in range(3))


I3 = tuple(tuple(Fr(int(i == j)) for j in range(3)) for i in range(3))


def mat_pow(A, n):
    if n < 0:
        return mat_pow(mat_inv(A), -n)
    R, P = I3, A
    while n:
        if n & 1:
            R = mm(R, P)
        P = mm(P, P)
        n >>= 1
    return R


def gens_at(t: Fr):
    def sig(i):
        M = [[Fr(int(a == b)) for b in range(3)] for a in range(3)]
        r = i-1
        M[r][r] = -t
        if i > 1:
            M[r][r-1] = t
        if r+1 < 3:
            M[r][r+1] = Fr(1)
        return tuple(tuple(row) for row in M)
    s1, s2, s3 = sig(1), sig(2), sig(3)
    X = mm(s3, mat_inv(s1))
    Y = mm(mm(s2, s3), mm(mat_inv(s1), mat_inv(s2)))
    return {'X': X, 'x': mat_inv(X), 'Y': Y, 'y': mat_inv(Y)}


def word_mat(word, g):
    M = I3
    for s in word:
        M = mm(M, g[s])
    return M


# ── word utilities ───────────────────────────────────────────────

def free_reduce(word):
    out = []
    for s in word:
        if out and INV[out[-1]] == s:
            out.pop()
        else:
            out.append(s)
    return tuple(out)


def inv_word(word):
    return tuple(INV[s] for s in reversed(word))


def commutator(a, b):
    return free_reduce(inv_word(a) + inv_word(b) + a + b)


# ── collision search for parabolic words ─────────────────────────

def int_gens(t: Fr):
    g = gens_at(t)
    out = {}
    for s, M in g.items():
        den = 1
        for row in M:
            for e in row:
                den = den*e.denominator // math.gcd(den, e.denominator)
        out[s] = tuple(tuple(int(e*den) for e in row) for row in M)
    return out


def proj(vec):
    d = 0
    for e in vec:
        d = math.gcd(d, abs(e))
    if d == 0:
        return None
    vec = tuple(e//d for e in vec)
    for e in vec:
        if e:
            return vec if e > 0 else tuple(-x for x in vec)
    return vec


def parabolic_candidates(t: Fr, max_len: int, max_pairs_per_bucket: int = 2):
    """Yield freely-reduced words p with first row prop. to e1^T at t,
    found via projective first-row collisions among words of length <= max_len.
    Sorted by length."""
    gi = int_gens(t)
    buckets = {}
    stack = [((s,), gi[s]) for s in SYMS]
    while stack:
        w, M = stack.pop()
        key = proj(M[0])
        b = buckets.setdefault(key, [])
        if len(b) < 24:
            b.append(w)
        if len(w) < max_len:
            last = w[-1]
            for s in SYMS:
                if INV[s] != last:
                    stack.append((w + (s,), mm(M, gi[s])))

    e1 = (1, 0, 0)
    cands = []
    seen = set()
    for key, ws in buckets.items():
        if key == e1:
            for w in ws:
                if w not in seen:
                    seen.add(w)
                    cands.append(w)
            continue
        if len(ws) < 2:
            continue
        ws = sorted(ws, key=len)
        base = ws[0]
        for other in ws[1:1+max_pairs_per_bucket]:
            p = free_reduce(other + inv_word(base))
            if p and p not in seen:
                seen.add(p)
                cands.append(p)
    cands.sort(key=lambda w: (len(w), w))
    return cands


# ── per-t kernel-word construction ───────────────────────────────

def in_N(M):
    """M in { I + (a e2 + b e3) e1^T } ?"""
    return (M[0] == (1, 0, 0) and M[1][1] == 1 and M[2][2] == 1
            and M[1][2] == 0 and M[0][1] == 0 and M[0][2] == 0
            and M[2][1] == 0)


def search_t(t: Fr, max_len: int, max_results: int = 3, verbose=True):
    g = gens_at(t)
    U = word_mat(U_WORD, g)
    Ui = mat_inv(U)
    pnum, qden = abs(t.numerator), t.denominator
    a_exp, b_exp = qden**6, pnum**6     # u^-1 v^{q^6} u = v^{p^6} (up to sign of t: t^6 = (p/q)^6 > 0)

    t0 = time.time()
    cands = parabolic_candidates(t, max_len)
    results = []
    direct_kernel = []
    for p_word in cands:
        P = word_mat(p_word, g)
        # confirm parabolic (first row prop e1) — guards proj-collision bookkeeping
        if P[0][1] != 0 or P[0][2] != 0:
            continue
        v_word = commutator(p_word, U_WORD)
        if not v_word:
            continue
        V = mm(mm(mat_inv(P), Ui), mm(P, U))
        assert in_N(V), f"[p,u] not in N at t={t}, p={p_word}"
        if V == I3:
            # v is itself a kernel word (nontrivial in F2, trivial Burau image)
            direct_kernel.append({'word': ' '.join(v_word),
                                  'length': len(v_word),
                                  'p_word': ' '.join(p_word)})
            continue
        # exact verification of the BS relation: u^-1 V^{q^6} u == V^{p^6}
        lhs = mm(mm(Ui, mat_pow(V, a_exp)), U)
        rhs = mat_pow(V, b_exp)
        assert lhs == rhs, f"BS relation failed at t={t}, p={p_word}"
        rel_len = 8 + len(v_word)*(a_exp + b_exp)
        results.append({
            'p_word': ' '.join(p_word),
            'v_word': ' '.join(v_word),
            'v_length': len(v_word),
            'exponents': [a_exp, b_exp],
            'ratio_t6': str(t**6),
            'kernel_word': f"u^-1 v^{a_exp} u v^-{b_exp}  "
                           f"(u = {' '.join(U_WORD)}, v = {' '.join(v_word)})",
            'kernel_word_length': rel_len,
        })
        if len(results) >= max_results:
            break

    # materialize + brute-verify the shortest relation if it is small enough
    if results:
        best = results[0]
        a_, b_ = best['exponents']
        v_word = tuple(best['v_word'].split())
        if 8 + len(v_word)*(a_+b_) <= 20000:
            R = free_reduce(inv_word(U_WORD) + v_word*a_ + U_WORD
                            + inv_word(v_word)*b_)
            assert R, "kernel word freely reduced to nothing"
            assert word_mat(R, g) == I3, "materialized kernel word not identity"
            best['kernel_word_explicit_length'] = len(R)

    if verbose:
        msg = (f"  t={t}: {len(cands)} parabolic candidates, "
               f"{len(results)} BS kernel words, "
               f"{len(direct_kernel)} direct kernel words "
               f"({time.time()-t0:.1f}s)")
        print(msg)
        for r in results[:2]:
            print(f"    p = {r['p_word']}")
            print(f"    v = [p,u] = {r['v_word']}   "
                  f"(u^-1 v^{r['exponents'][0]} u = v^{r['exponents'][1]})")
    return {
        't': str(t),
        'n_parabolic_candidates': len(cands),
        'bs_kernel_words': results,
        'direct_kernel_words': direct_kernel[:max_results],
        'params': {'max_len': max_len},
    }


DEFAULT_TS = ['2', '-2', '3', '-3', '4', '-4', '5', '-5', '6', '7',
              '1/2', '-1/2', '1/3', '3/2', '-3/2', '2/3', '5/2',
              '4/3', '5/3', '5/4', '-2/3', '7/2', '-5/2']


def main():
    ap = argparse.ArgumentParser(
        description='Kernel words for Burau(B4) at rational t via the '
                    'parabolic-commutator construction')
    ap.add_argument('-t', '--t-values', nargs='*', default=DEFAULT_TS)
    ap.add_argument('--max-len', type=int, default=10,
                    help='max word length for the collision scan')
    ap.add_argument('-o', '--output',
                    default=os.path.join(os.path.dirname(__file__), '..',
                                         'data', 'rational_kernel_db.json'))
    args = ap.parse_args()

    db = {}
    for ts in args.t_values:
        t = Fr(ts)
        if abs(t) == 1 or t == 0:
            print(f"  skipping t={t} (unit or degenerate)")
            continue
        entry = search_t(t, args.max_len)
        if not entry['bs_kernel_words'] and not entry['direct_kernel_words'] \
                and args.max_len < 12:
            print(f"    retrying t={t} with max_len=12")
            entry = search_t(t, 12)
        db[ts] = entry

    with open(args.output, 'w') as f:
        json.dump(db, f, indent=2)
    print(f"\nWrote {args.output}")

    print("\n=== Summary ===")
    print(f"{'t':>6} | {'shortest v':>10} | exponents (q^6 : p^6) | found")
    for ts, e in db.items():
        if e['bs_kernel_words']:
            r = e['bs_kernel_words'][0]
            print(f"{ts:>6} | {r['v_length']:>10} | "
                  f"{r['exponents'][0]} : {r['exponents'][1]} | yes")
        elif e['direct_kernel_words']:
            d = e['direct_kernel_words'][0]
            print(f"{ts:>6} | direct kernel word of length {d['length']}")
        else:
            print(f"{ts:>6} | {'—':>10} | none found")


if __name__ == '__main__':
    main()
