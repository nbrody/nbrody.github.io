#!/usr/bin/env python3
"""
Exhaustive short-word sweep for integer matrices on the Magnus curve
====================================================================

For each algebraic specialization t (given by its minimal polynomial),
enumerate ALL freely reduced words w(A, B) of length <= L by DFS with
exact number-field arithmetic and record every word whose matrix lies in
M_2(Z).  This is the ground truth for short words; integerBeam.py goes
deeper but non-exhaustively.

Usage:
    python3 fieldSweep.py                      # default field panel, L=12
    python3 fieldSweep.py -L 10 -p t^2-2 t^3-t-1
    python3 fieldSweep.py --no-save            # print only

Results merge into ../data/integer_matrix_db.json.
"""

from __future__ import annotations

import argparse
import time

from magnusCore import (
    NumberField, SYMS, INV, magnus_generators, mat_mul, mat_identity,
    matrix_is_integral, integral_entries, make_record,
    load_db, save_db, field_entry, merge_records, parse_poly, poly_str,
)

# (minpoly low->high, label) — t and t-1 unit status noted in the DB.
DEFAULT_PANEL = [
    ([-1, -1, 1],      'golden ratio phi'),
    ([-1, 1, 1],       'inverse golden ratio 1/phi'),
    ([1, -3, 1],       'phi^2  (t + 1/t = 3)'),
    ([1, -4, 1],       '2 + sqrt(3)  (t + 1/t = 4)'),
    ([1, -5, 1],       '(5 + sqrt(21))/2  (t + 1/t = 5)'),
    ([-2, 0, 1],       'sqrt(2)'),
    ([-3, 0, 1],       'sqrt(3)'),
    ([-1, -1, 0, 1],   'plastic number'),
    ([-1, 0, -1, 1],   'cubic unit t^3 = t^2 + 1'),
    ([1, 0, -1, 1],    'cubic unit t^3 = t^2 - 1'),
    ([-2, 0, 0, 1],    'cbrt(2)'),
    ([-1, 0, 0, -1, 1], 'quartic unit t^4 = t^3 + 1'),
]


def exhaustive_search(K: NumberField, L: int, verbose=True):
    """DFS over reduced words; returns list of result records."""
    gens = magnus_generators(K)
    hits = []
    t0 = time.time()
    count = 0

    def dfs(word, M):
        nonlocal count
        count += 1
        if word and matrix_is_integral(K, M):
            Z = integral_entries(K, M)
            if Z != ((1, 0), (0, 1)):
                hits.append(make_record(K, word, Z, f'exhaustive(L={L})'))
        if len(word) == L:
            return
        last = word[-1] if word else None
        for s in SYMS:
            if last and INV[last] == s:
                continue
            dfs(word + s, mat_mul(K, M, gens[s]))

    dfs('', mat_identity(K))
    if verbose:
        inf = sum(r['infinite_order'] for r in hits)
        print(f'  [{K.label}] {count} words <= {L}: {len(hits)} integral '
              f'({inf} of infinite order)  [{time.time()-t0:.1f}s]')
    return hits


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument('-L', '--length', type=int, default=12,
                    help='max word length (default 12)')
    ap.add_argument('-p', '--poly', nargs='*', default=None,
                    help="minimal polynomials, e.g. t^2-t-1 t^3-2 "
                         "(default: built-in panel)")
    ap.add_argument('--cap', type=int, default=60,
                    help='max records stored per field (default 60)')
    ap.add_argument('--no-save', action='store_true')
    args = ap.parse_args()

    if args.poly:
        panel = [(parse_poly(p), None) for p in args.poly]
    else:
        panel = DEFAULT_PANEL

    db = load_db()
    for coeffs, label in panel:
        K = NumberField(coeffs, label)
        print(f'== {poly_str(coeffs)}  ({K.label})')
        hits = exhaustive_search(K, args.length)
        if not args.no_save:
            entry = field_entry(db, K, label)
            merge_records(entry, hits, cap=args.cap)
            entry['search']['exhaustive_len'] = max(
                args.length, entry['search'].get('exhaustive_len', 0))
            if not hits and entry['status'] == 'unsearched':
                entry['status'] = 'none_found'

    if not args.no_save:
        path = save_db(db, time.strftime('%Y-%m-%d'))
        print('wrote', path)


if __name__ == '__main__':
    main()
