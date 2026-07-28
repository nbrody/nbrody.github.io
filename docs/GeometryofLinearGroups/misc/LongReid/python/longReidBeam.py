#!/usr/bin/env python3
"""
Witnesses of non-properness for the Long-Reid action  (rational t)
==================================================================

At a rational parameter t = s^2 (a square, so the representation can be
normalized into PSL2), the Magnus-curve representation of the orbifold
group pi_1(T^2(2)) = <a, b | [a,b]^2> specializes to

    a = (1/s) [[t, 0], [0, 1]],     b = (1/(t-1)) [[t^2+1, 2], [t, 1]],

both of determinant 1, with entries in Z[1/(t(t-1))].  For t = 9 this is
the **Long-Reid group**  Gamma <= PSL2(Z[1/6]),  which acts on the
product of Bruhat-Tits trees T_3 x T_4; by Borel--Harish-Chandra the
action is proper iff  Gamma  meets  PGL2(Z)  in a finite set.

Brody, *An improper surface group action* (arXiv:2512.19760), exhibits a
length-82 word evaluating to an infinite-order integer matrix, so the
action is NOT proper.  This script verifies that witness and beam-searches
for further (and shorter) witnesses: words whose normalized matrix has
all entries in Z.  Such a matrix has det 1 automatically; it is a
non-properness witness iff it has infinite order in PGL2, i.e.
M^12 is not +-I.

The beam is scored by gcd(denominators): here the entry denominators are
genuinely nontrivial (powers of the primes dividing t and t-1), and the
score drives them to 1.  `--score lcm | mixed` select variants.

Usage:
    python3 longReidBeam.py                    # t = 9, verify + search
    python3 longReidBeam.py -t 9 -d 90 -w 6000
    python3 longReidBeam.py -t 25 --score mixed

Results merge into ../data/integer_matrix_db.json under the key 't-<n>'.
"""

from __future__ import annotations

import argparse
import math
import time
from fractions import Fraction as Fr

from magnusCore import (
    NumberField, SYMS, INV, primitive_root_of,
    update_db, field_entry, merge_records,
)

# The length-82 witness of arXiv:2512.19760 (a -> A, b -> B, lowercase
# = inverse), Theorem 1.
PAPER_WITNESS_T9 = ('AABaabABAAbabAABaBAAbabABAbABaBAAbAAABaab'
                    'AbaaBBAbaaBabAbaaBAbAABaBAbABaBAAbAAABaab')


# ── exact 2x2 arithmetic over Q ──────────────────────────────────

def mm(M, N):
    return ((M[0][0]*N[0][0] + M[0][1]*N[1][0], M[0][0]*N[0][1] + M[0][1]*N[1][1]),
            (M[1][0]*N[0][0] + M[1][1]*N[1][0], M[1][0]*N[0][1] + M[1][1]*N[1][1]))


def inv2(M):
    d = M[0][0]*M[1][1] - M[0][1]*M[1][0]
    return ((M[1][1]/d, -M[0][1]/d), (-M[1][0]/d, M[0][0]/d))


ID2 = ((Fr(1), Fr(0)), (Fr(0), Fr(1)))


def normalized_generators(t: Fr):
    """PSL2 forms of the Magnus generators at rational square t = s^2."""
    s = Fr(math.isqrt(t.numerator), math.isqrt(t.denominator))
    if s * s != t:
        raise ValueError(f't = {t} is not a rational square; cannot '
                         'normalize A into PSL2')
    A = ((t / s, Fr(0)), (Fr(0), 1 / s))
    d = t - 1
    B = (((t*t + 1) / d, 2 / d), (t / d, 1 / d))
    return {'A': A, 'a': inv2(A), 'B': B, 'b': inv2(B)}


def is_integral(M):
    return all(M[i][j].denominator == 1 for i in range(2) for j in range(2))


def to_int(M):
    return tuple(tuple(int(M[i][j]) for j in range(2)) for i in range(2))


def pgl2_infinite_order(Z):
    """Z integer matrix, det +-1: finite order in PGL2 <=> Z^12 = +-I."""
    P = ((1, 0), (0, 1))
    for _ in range(12):
        P = ((P[0][0]*Z[0][0] + P[0][1]*Z[1][0], P[0][0]*Z[0][1] + P[0][1]*Z[1][1]),
             (P[1][0]*Z[0][0] + P[1][1]*Z[1][0], P[1][0]*Z[0][1] + P[1][1]*Z[1][1]))
    return P != ((1, 0), (0, 1)) and P != ((-1, 0), (0, -1))


def canonical_sign(Z):
    """Negate so trace > 0 (or first nonzero entry > 0 when trace = 0):
    matrices are PSL2 elements, defined up to sign."""
    tr = Z[0][0] + Z[1][1]
    flip = tr < 0
    if tr == 0:
        for v in (Z[0][0], Z[0][1], Z[1][0], Z[1][1]):
            if v:
                flip = v < 0
                break
    return tuple(tuple(-x for x in row) for row in Z) if flip else Z


def flog(fr: Fr) -> float:
    if fr == 0:
        return 0.0
    return max(0.0, fr.numerator.bit_length() - fr.denominator.bit_length()) + 1.0


def score(M, mode='gcd'):
    """(denominator aggregate in bits, #fractional entries, entry size)."""
    dens = [M[i][j].denominator for i in range(2) for j in range(2)]
    if mode == 'gcd':
        agg = math.gcd(*dens)
    else:
        agg = 1
        for dn in dens:
            agg = agg * dn // math.gcd(agg, dn)
    frac = sum(1.0 for dn in dens if dn != 1)
    size = max(flog(M[i][j]) for i in range(2) for j in range(2))
    if mode == 'mixed':
        return (math.log2(agg) + size, frac)
    return (math.log2(agg), frac, size)


def make_projective_record(word, Z, found_by):
    Z = canonical_sign(Z)
    tr = Z[0][0] + Z[1][1]
    det = Z[0][0]*Z[1][1] - Z[0][1]*Z[1][0]
    rec = {
        'word': word,
        'length': len(word),
        'matrix': [[str(Z[0][0]), str(Z[0][1])], [str(Z[1][0]), str(Z[1][1])]],
        'trace': str(tr),
        'det': str(det),
        'infinite_order': pgl2_infinite_order(Z),
        'projective': True,
        'found_by': found_by,
    }
    pw = primitive_root_of(word)
    if pw:
        rec['power_of'], rec['exponent'] = pw
    return rec


def beam_search(gens, depth, width, mode, verbose=True):
    beam = [('', ID2)]
    hits = {}
    t0 = time.time()
    for d in range(1, depth + 1):
        children = {}
        for word, M in beam:
            last = word[-1] if word else None
            for s in SYMS:
                if last and INV[last] == s:
                    continue
                N = mm(M, gens[s])
                old = children.get(N)
                if old is None or len(word) + 1 < len(old):
                    children[N] = word + s
        scored = []
        for N, word in children.items():
            if is_integral(N):
                Z = canonical_sign(to_int(N))
                if Z != ((1, 0), (0, 1)) and Z not in hits:
                    hits[Z] = (word, Z)
            scored.append((score(N, mode), word, N))
        scored.sort(key=lambda x: (x[0], len(x[1]), x[1]))
        beam = [(w, N) for _, w, N in scored[:width]]
        if verbose and (d % 10 == 0 or d == depth):
            inf = sum(pgl2_infinite_order(Z) for Z in hits)
            print(f'  depth {d:3d}: beam {len(beam):5d}, hits {len(hits)} '
                  f'({inf} inf in PGL2), best '
                  f'{tuple(round(x, 1) for x in scored[0][0])} '
                  f'[{time.time()-t0:.0f}s]')
    return hits


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument('-t', type=str, default='9',
                    help='rational square parameter (default 9)')
    ap.add_argument('-d', '--depth', type=int, default=90)
    ap.add_argument('-w', '--width', type=int, default=4000)
    ap.add_argument('--score', choices=('gcd', 'lcm', 'mixed'), default='gcd')
    ap.add_argument('--cap', type=int, default=60)
    ap.add_argument('--no-save', action='store_true')
    args = ap.parse_args()

    t = Fr(args.t)
    gens = normalized_generators(t)
    tag = f'beam(d={args.depth},w={args.width},{args.score},psl2)'
    records = []

    # ── verify the published witness at t = 9 ──
    if t == 9:
        M = ID2
        for s in PAPER_WITNESS_T9:
            M = mm(M, gens[s])
        assert is_integral(M), 'paper witness should be integral!'
        Z = to_int(M)
        assert pgl2_infinite_order(Z)
        print(f'verified arXiv:2512.19760 witness '
              f'(length {len(PAPER_WITNESS_T9)}, infinite order in PGL2)')
        records.append(make_projective_record(
            PAPER_WITNESS_T9, Z, 'arXiv:2512.19760 Thm 1 (verified)'))

    # ── beam search ──
    print(f'== beam at t = {t} (normalized, depth {args.depth}, '
          f'width {args.width}, {args.score})')
    hits = beam_search(gens, args.depth, args.width, args.score)
    for word, Z in hits.values():
        records.append(make_projective_record(word, Z, tag))
    inf = [r for r in records if r['infinite_order']]
    print(f'  -> {len(records)} integral (projective) matrices, '
          f'{len(inf)} of infinite order in PGL2')
    for r in sorted(inf, key=lambda r: r['length'])[:6]:
        print(f"     len {r['length']}: {r['word'][:50]}"
              f"{'...' if r['length'] > 50 else ''}  tr={r['trace']}")

    if not args.no_save:
        if t.denominator != 1:
            print('(database keys require integer t; use --no-save for '
                  'non-integer rational t)')
            return

        def apply(db):
            K = NumberField([-int(t), 1])      # minpoly  t - n
            entry = field_entry(db, K, f'Long-Reid group at t = {t} '
                                       f'(PSL2-normalized, witnesses of '
                                       f'non-properness on trees)')
            entry['mode'] = 'psl2_normalized'
            merge_records(entry, records, cap=args.cap)
            bs = entry['search'].setdefault('beam', [])
            bs.append({'depth': args.depth, 'width': args.width,
                       'score': args.score, 'normalized': True})

        path = update_db(apply, time.strftime('%Y-%m-%d'))
        print('wrote', path)


if __name__ == '__main__':
    main()
