#!/usr/bin/env python3
"""
Beam search for infinite-order integer matrices on the Magnus curve
===================================================================

At a fixed algebraic t (given by its minimal polynomial), grow freely
reduced words w(A, B) breadth-first, but keep only the `--width` best
states at each depth.  States are scored by how close the matrix is to
an integer matrix; the primary key is the *gcd of the denominators* of
the four entries (written in power-basis coordinates), with the
off-rational coordinate mass and entry size as tiebreakers:

    score(M) = ( log2 gcd(den(M_ij)),  off-rational mass,
                 fractional rational part,  coordinate size )

At specializations where t and t-1 are units the denominators are
identically 1 and the search is driven by the off-rational mass — the
total size of the coordinates on t, ..., t^{d-1}, which vanishes
exactly on the integer points we are hunting.  `--score lcm` / `mixed`
select the variants (lcm is usually the sharper drive at non-unit t).

Every integral matrix met along the way is verified exactly (M^12 != I
gives infinite order for an integral 2x2 matrix) and merged into
../data/integer_matrix_db.json.

Usage:
    python3 integerBeam.py -p t^2-t-1                  # phi, defaults
    python3 integerBeam.py -p t^3-t-1 -d 32 -w 6000    # deeper/wider
    python3 integerBeam.py -p t^2-2 --score lcm
"""

from __future__ import annotations

import argparse
import time

from magnusCore import (
    NumberField, SYMS, INV, magnus_generators, mat_mul, mat_identity,
    matrix_is_integral, integral_entries, matrix_score, make_record,
    update_db, field_entry, merge_records, parse_poly, poly_str,
)


def beam_search(K: NumberField, depth: int, width: int, score_mode: str,
                verbose=True):
    """Returns (records, stats). States: (word, matrix), deduped by matrix."""
    gens = magnus_generators(K)
    beam = [('', mat_identity(K))]
    hits = {}
    t0 = time.time()

    for d in range(1, depth + 1):
        children = {}
        for word, M in beam:
            last = word[-1] if word else None
            for s in SYMS:
                if last and INV[last] == s:
                    continue
                N = mat_mul(K, M, gens[s])
                key = N
                old = children.get(key)
                if old is None or len(word) + 1 < len(old[0]):
                    children[key] = (word + s, N)
        scored = []
        for N, (word, _) in children.items():
            if matrix_is_integral(K, N):
                Z = integral_entries(K, N)
                if Z != ((1, 0), (0, 1)) and Z not in hits:
                    hits[Z] = make_record(
                        K, word, Z,
                        f'beam(d={depth},w={width},{score_mode})')
            scored.append((matrix_score(K, N, score_mode), word, N))
        scored.sort(key=lambda x: (x[0], len(x[1]), x[1]))
        beam = [(w, N) for _, w, N in scored[:width]]
        if verbose and (d % 4 == 0 or d == depth):
            best = scored[0][0] if scored else None
            inf = sum(r['infinite_order'] for r in hits.values())
            print(f'  depth {d:3d}: beam {len(beam):5d}, hits {len(hits)} '
                  f'({inf} inf), best score {tuple(round(x,2) for x in best)} '
                  f'[{time.time()-t0:.0f}s]')
    return list(hits.values()), {'depth': depth, 'width': width,
                                 'score': score_mode}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument('-p', '--poly', nargs='+', required=True,
                    help='minimal polynomial(s) of t, e.g. t^2-t-1')
    ap.add_argument('-d', '--depth', type=int, default=24,
                    help='max word length (default 24)')
    ap.add_argument('-w', '--width', type=int, default=3000,
                    help='beam width (default 3000)')
    ap.add_argument('--score', choices=('gcd', 'lcm', 'mixed'),
                    default='gcd',
                    help='primary score: gcd of entry denominators '
                         '(default), their lcm, or a mixed sum')
    ap.add_argument('--label', default=None,
                    help='display label for the field (single -p only)')
    ap.add_argument('--cap', type=int, default=60)
    ap.add_argument('--no-save', action='store_true')
    args = ap.parse_args()

    pending = []
    for p in args.poly:
        coeffs = parse_poly(p)
        label = args.label if len(args.poly) == 1 else None
        K = NumberField(coeffs, label)
        print(f'== beam at {poly_str(coeffs)} '
              f'(depth {args.depth}, width {args.width}, {args.score})')
        records, stats = beam_search(K, args.depth, args.width, args.score)
        inf = [r for r in records if r['infinite_order']]
        print(f'  -> {len(records)} integral matrices, '
              f'{len(inf)} of infinite order')
        for r in sorted(inf, key=lambda r: r['length'])[:8]:
            print(f"     {r['word']}  ->  {r['matrix']}  "
                  f"tr={r['trace']} det={r['det']}")
        pending.append((coeffs, label, records, stats))

    if not args.no_save:
        def apply(db):
            for coeffs, label, records, stats in pending:
                K = NumberField(coeffs, label)
                entry = field_entry(db, K, label)
                merge_records(entry, records, cap=args.cap)
                bs = entry['search'].setdefault('beam', [])
                bs.append(stats)
                if not records and entry['status'] == 'unsearched':
                    entry['status'] = 'none_found'

        path = update_db(apply, time.strftime('%Y-%m-%d'))
        print('wrote', path)


if __name__ == '__main__':
    main()
