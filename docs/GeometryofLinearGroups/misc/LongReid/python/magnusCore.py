#!/usr/bin/env python3
"""
Shared core for the Long-Reid / Magnus-curve integrality searches
=================================================================

The Magnus curve is the family of 2-generator subgroups of GL2 given by

    A = [[t, 0], [0, 1]],      B = [[t^2 + 1, 2], [t, 1]]

with det A = t and det B = (t - 1)^2.  For an algebraic number t with
minimal polynomial m, every word w(A, B) has entries in Q(t); we hunt for
words whose specialized matrix has all four entries in Z (rational
integers!) and which have infinite order.

Representation of Q(t): an element is a tuple of d Fractions, the
coordinates in the power basis (1, t, ..., t^{d-1}) of Q[t]/(m).  All
arithmetic is exact; floats appear only inside beam-search *scores*.

Integrality and order tests
---------------------------
* alpha in Z  <=>  coords (c_0, ..., c_{d-1}) have c_0 in Z and c_k = 0
  for k >= 1.
* An integral 2x2 matrix M has finite order iff M^12 = I (elements of
  finite order in GL2(Z) have order 1, 2, 3, 4 or 6; a matrix with
  |det| != 1 can never have finite order).

Galois point of view (why hits are rare and interesting): for t with
conjugates t = t_1, ..., t_d, the word w gives an integer matrix iff the
d Galois-conjugate specializations rho_{t_i}(w) all COINCIDE -- a
simultaneous collision of d representations, the analogue of the
collision searches in ../braidGroups.
"""

from __future__ import annotations

import fcntl
import json
import math
import os
from contextlib import contextmanager
from fractions import Fraction as Fr

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
DB_PATH = os.path.join(DATA_DIR, 'integer_matrix_db.json')
_LOCK_PATH = os.path.join(DATA_DIR, 'integer_matrix_db.lock')

SYMS = ('A', 'B', 'a', 'b')
INV = {'A': 'a', 'a': 'A', 'B': 'b', 'b': 'B'}


# ================================================================
#  Number field  K = Q[t]/(m(t)),  power-basis coordinates
# ================================================================

class NumberField:
    """m given as integer coefficient list [c0, c1, ..., 1] (monic)."""

    def __init__(self, coeffs, label=None):
        assert coeffs[-1] == 1, "minimal polynomial must be monic"
        self.coeffs = [int(c) for c in coeffs]
        self.d = len(coeffs) - 1
        self.label = label or poly_str(self.coeffs)
        # reduction table: t^k as a coordinate vector, k = 0 .. 2d-2
        red = []
        for k in range(self.d):
            v = [Fr(0)] * self.d
            v[k] = Fr(1)
            red.append(v)
        for k in range(self.d, 2 * self.d - 1):
            # t^k = t * t^{k-1}, then reduce the overflow with
            # t^d = -(c_0 + c_1 t + ... + c_{d-1} t^{d-1})
            prev = red[k - 1]
            v = [Fr(0)] + prev[:-1]
            top = prev[-1]
            if top:
                for i in range(self.d):
                    v[i] -= top * self.coeffs[i]
            red.append(v)
        self.red = red
        self.zero = tuple(Fr(0) for _ in range(self.d))
        self.one = self.from_int(1)
        self.t = self.from_coords([0, 1] + [0] * (self.d - 2)) \
            if self.d >= 2 else self.from_int(-self.coeffs[0])

    def from_int(self, n):
        v = [Fr(0)] * self.d
        v[0] = Fr(n)
        return tuple(v)

    def from_coords(self, cs):
        v = [Fr(c) for c in cs]
        v += [Fr(0)] * (self.d - len(v))
        return tuple(v)

    def add(self, a, b):
        return tuple(x + y for x, y in zip(a, b))

    def sub(self, a, b):
        return tuple(x - y for x, y in zip(a, b))

    def neg(self, a):
        return tuple(-x for x in a)

    def mul(self, a, b):
        d = self.d
        conv = [Fr(0)] * (2 * d - 1)
        for i, x in enumerate(a):
            if x:
                for j, y in enumerate(b):
                    if y:
                        conv[i + j] += x * y
        out = [Fr(0)] * d
        for k, c in enumerate(conv):
            if c:
                rk = self.red[k]
                for i in range(d):
                    out[i] += c * rk[i]
        return tuple(out)

    def inv(self, a):
        """Solve x * a = 1 by Gaussian elimination on the mult-by-a matrix."""
        d = self.d
        cols = [self.mul(a, self.red[k]) for k in range(d)]  # a * t^k
        # augmented system: sum_k x_k (a t^k) = 1
        M = [[cols[k][i] for k in range(d)] + [Fr(int(i == 0))]
             for i in range(d)]
        for col in range(d):
            piv = next((r for r in range(col, d) if M[r][col] != 0), None)
            if piv is None:
                raise ValueError('not invertible (zero divisor / singular element)')
            M[col], M[piv] = M[piv], M[col]
            pv = M[col][col]
            M[col] = [x / pv for x in M[col]]
            for r in range(d):
                if r != col and M[r][col]:
                    f = M[r][col]
                    M[r] = [x - f * y for x, y in zip(M[r], M[col])]
        return tuple(M[k][d] for k in range(d))

    def is_zero(self, a):
        return all(x == 0 for x in a)

    def is_rational_integer(self, a):
        return a[0].denominator == 1 and all(x == 0 for x in a[1:])

    def norm_of_linear(self, r):
        """Norm of (t - r) for rational r, i.e. +-m(r): unit test helper."""
        v = 0
        for c in reversed(self.coeffs):
            v = v * r + c
        return v

    def real_root(self):
        """Largest real root of m, by bisection + sign scan (for display)."""
        def f(x):
            v = 0.0
            for c in reversed(self.coeffs):
                v = v * x + c
            return v
        roots = []
        lo, hi, steps = -64.0, 64.0, 8192
        xs = [lo + (hi - lo) * i / steps for i in range(steps + 1)]
        for x0, x1 in zip(xs, xs[1:]):
            if f(x0) == 0:
                roots.append(x0)
            if f(x0) * f(x1) < 0:
                a_, b_ = x0, x1
                for _ in range(80):
                    mid = (a_ + b_) / 2
                    if f(a_) * f(mid) <= 0:
                        b_ = mid
                    else:
                        a_ = mid
                roots.append((a_ + b_) / 2)
        return roots[-1] if roots else None


def poly_str(coeffs):
    """[-1,-1,1] -> 't^2-t-1' (display/JSON key form)."""
    d = len(coeffs) - 1
    parts = []
    for k in range(d, -1, -1):
        c = coeffs[k]
        if c == 0:
            continue
        if k == d:
            term = ''
        elif c > 0:
            term = '+'
        else:
            term = '-'
        ac = abs(c)
        if k == 0:
            term += str(ac)
        else:
            if ac != 1:
                term += str(ac)
            term += 't' if k == 1 else f't^{k}'
        parts.append(term)
    return ''.join(parts)


def parse_poly(s):
    """'t^3-t-1' or '1,0,-1,...' -> monic integer coefficient list."""
    s = s.strip().replace(' ', '').replace('**', '^').replace('x', 't')
    if ',' in s:
        cs = [int(c) for c in s.split(',')]
        return cs
    # tokenize signed terms
    import re
    terms = re.findall(r'[+-]?[^+-]+', s)
    deg = 0
    parsed = []
    for term in terms:
        mt = re.fullmatch(r'([+-]?)(\d*)(?:\*?t(?:\^(\d+))?)?', term)
        if not mt or (mt.group(2) == '' and 't' not in term):
            raise ValueError(f'cannot parse term {term!r} of {s!r}')
        sign = -1 if mt.group(1) == '-' else 1
        coef = sign * int(mt.group(2) or 1)
        k = int(mt.group(3)) if mt.group(3) else (1 if 't' in term else 0)
        parsed.append((k, coef))
        deg = max(deg, k)
    cs = [0] * (deg + 1)
    for k, coef in parsed:
        cs[k] += coef
    return cs


# ================================================================
#  2x2 matrices over K and the Magnus generators
# ================================================================

def magnus_generators(K: NumberField):
    """Return {'A','a','B','b'} as 2x2 tuples over K."""
    t = K.t
    one, zero = K.one, K.zero
    # det A = t and det B = (t-1)^2, so both must be invertible in K.
    if K.is_zero(t):
        raise ValueError('Magnus generators undefined at t = 0 (det A = 0)')
    tm1 = K.sub(t, one)
    if K.is_zero(tm1):
        raise ValueError('Magnus generators undefined at t = 1 (det B = 0)')
    t2p1 = K.add(K.mul(t, t), one)                       # t^2 + 1
    two = K.from_int(2)
    A = ((t, zero), (zero, one))
    B = ((t2p1, two), (t, one))
    tinv = K.inv(t)
    a = ((tinv, zero), (zero, one))
    # B^{-1} = adj(B) / det(B),  det B = (t-1)^2
    dinv = K.inv(K.mul(tm1, tm1))
    b = ((K.mul(one, dinv), K.mul(K.neg(two), dinv)),
         (K.mul(K.neg(t), dinv), K.mul(t2p1, dinv)))
    return {'A': A, 'a': a, 'B': B, 'b': b}


def mat_mul(K, M, N):
    return ((K.add(K.mul(M[0][0], N[0][0]), K.mul(M[0][1], N[1][0])),
             K.add(K.mul(M[0][0], N[0][1]), K.mul(M[0][1], N[1][1]))),
            (K.add(K.mul(M[1][0], N[0][0]), K.mul(M[1][1], N[1][0])),
             K.add(K.mul(M[1][0], N[0][1]), K.mul(M[1][1], N[1][1]))))


def mat_identity(K):
    return ((K.one, K.zero), (K.zero, K.one))


def word_matrix(K, gens, word):
    M = mat_identity(K)
    for s in word:
        M = mat_mul(K, M, gens[s])
    return M


def free_reduce(word):
    out = []
    for s in word:
        if out and INV[out[-1]] == s:
            out.pop()
        else:
            out.append(s)
    return ''.join(out)


def word_inverse(word):
    return ''.join(INV[s] for s in reversed(word))


def primitive_root_of(word):
    """If word == v^k as a string with k >= 2, return (v, k), else None."""
    n = len(word)
    for plen in range(1, n // 2 + 1):
        if n % plen == 0 and word == word[:plen] * (n // plen):
            return word[:plen], n // plen
    return None


# ================================================================
#  Integrality / order tests on results
# ================================================================

def matrix_is_integral(K, M):
    return all(K.is_rational_integer(M[i][j]) for i in range(2) for j in range(2))


def integral_entries(K, M):
    """For an integral matrix, the 4 entries as python ints."""
    return tuple(tuple(int(M[i][j][0]) for j in range(2)) for i in range(2))


def has_infinite_order(Z):
    """Z = ((a,b),(c,d)) integer matrix. Finite order <=> Z^12 == I."""
    det = Z[0][0] * Z[1][1] - Z[0][1] * Z[1][0]
    if det == 0:
        return False          # not even invertible: discard upstream
    if abs(det) != 1:
        return True           # eigenvalues can't all be roots of unity
    P = ((1, 0), (0, 1))
    for _ in range(12):
        P = ((P[0][0]*Z[0][0] + P[0][1]*Z[1][0], P[0][0]*Z[0][1] + P[0][1]*Z[1][1]),
             (P[1][0]*Z[0][0] + P[1][1]*Z[1][0], P[1][0]*Z[0][1] + P[1][1]*Z[1][1]))
    return P != ((1, 0), (0, 1))


# ================================================================
#  Beam-search scoring
# ================================================================

def _flog(fr: Fr) -> float:
    """log2(1 + |fr|), overflow-safe via bit lengths."""
    if fr == 0:
        return 0.0
    return max(0.0, fr.numerator.bit_length() - fr.denominator.bit_length()) \
        + 1.0


def entry_denominator(alpha) -> int:
    den = 1
    for c in alpha:
        den = den * c.denominator // math.gcd(den, c.denominator)
    return den


def matrix_score(K, M, mode='gcd'):
    """Sortable score tuple; smaller = closer to an integer matrix.

    Components:
      1. denominator aggregate (log2): gcd or lcm of the 4 entry
         denominators per --score; at unit specializations these are
         identically 1 and the next component takes over;
      2. off-rational mass: total size of the coordinates on t..t^{d-1}
         (zero iff the matrix is rational);
      3. fractional part of the rational coordinates;
      4. overall coordinate size (keeps the beam from inflating).
    """
    dens = []
    offmass = 0.0
    frac = 0.0
    size = 0.0
    for i in range(2):
        for j in range(2):
            al = M[i][j]
            dens.append(entry_denominator(al))
            for k, c in enumerate(al):
                fl = _flog(c)
                size = max(size, fl)
                if k >= 1:
                    offmass += fl
                elif c.denominator != 1:
                    frac += 1.0
    if mode == 'gcd':
        agg = math.gcd(*dens)
    elif mode == 'lcm':
        agg = 1
        for dn in dens:
            agg = agg * dn // math.gcd(agg, dn)
    else:                      # 'mixed'
        agg = 1
        for dn in dens:
            agg = agg * dn // math.gcd(agg, dn)
        return (offmass + math.log2(agg), frac, size)
    return (math.log2(agg), offmass, frac, size)


# ================================================================
#  Result records and database IO
# ================================================================

def make_record(K, word, Z, found_by):
    tr = Z[0][0] + Z[1][1]
    det = Z[0][0] * Z[1][1] - Z[0][1] * Z[1][0]
    pw = primitive_root_of(word)
    rec = {
        'word': word,
        'length': len(word),
        'matrix': [[str(Z[0][0]), str(Z[0][1])], [str(Z[1][0]), str(Z[1][1])]],
        'trace': str(tr),
        'det': str(det),
        'infinite_order': has_infinite_order(Z),
        'found_by': found_by,
    }
    if pw:
        rec['power_of'] = pw[0]
        rec['exponent'] = pw[1]
    if set(word) <= {'A'} or set(word) <= {'a'} \
            or set(word) <= {'B'} or set(word) <= {'b'}:
        rec['power_of_generator'] = True
    return rec


def load_db():
    if os.path.exists(DB_PATH):
        with open(DB_PATH) as fh:
            return json.load(fh)
    return {
        '_meta': {
            'description': 'Integer matrices of infinite order in the Magnus '
                           'curve group <A,B>, A=[[t,0],[0,1]], '
                           'B=[[t^2+1,2],[t,1]], at algebraic values of t.',
            'generators': {'A': '[[t,0],[0,1]]', 'B': '[[t^2+1,2],[t,1]]'},
            'word_alphabet': 'A B a b  (lowercase = inverse)',
            'scripts': ['fieldSweep.py', 'integerBeam.py'],
        },
        'fields': {},
    }


@contextmanager
def _db_exclusive_lock():
    """Serialize load-modify-save against concurrent LongReid scripts."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(_LOCK_PATH, 'a+', encoding='utf-8') as lockfh:
        fcntl.flock(lockfh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lockfh.fileno(), fcntl.LOCK_UN)


def _write_db(db, updated_note=None):
    os.makedirs(DATA_DIR, exist_ok=True)
    if updated_note:
        db.setdefault('_meta', {})['updated'] = updated_note
    # stable ordering: fields by degree then key
    db['fields'] = dict(sorted(
        db['fields'].items(),
        key=lambda kv: (len(kv[1]['minpoly']), kv[0])))
    with open(DB_PATH, 'w') as fh:
        json.dump(db, fh, indent=1)
    return DB_PATH


def save_db(db, updated_note=None):
    """Overwrite the on-disk DB. Prefer update_db() for load-modify-save."""
    with _db_exclusive_lock():
        return _write_db(db, updated_note)


def update_db(mutator, updated_note=None):
    """Load, mutate, and save under an exclusive lock.

    Reloads the latest on-disk DB before applying ``mutator``, so concurrent
    savers merge instead of silently dropping each other's fields/matrices.
    """
    with _db_exclusive_lock():
        db = load_db()
        mutator(db)
        return _write_db(db, updated_note)


def field_entry(db, K: NumberField, label=None):
    key = poly_str(K.coeffs)
    if key not in db['fields']:
        nt = K.norm_of_linear(0)        # +- N(t) = m(0)
        nt1 = K.norm_of_linear(1)       # +- N(t-1) = m(1)
        db['fields'][key] = {
            'minpoly': K.coeffs,
            'label': label or key,
            't_numeric': K.real_root(),
            'unit_t': abs(nt) == 1,
            'unit_t_minus_1': abs(nt1) == 1,
            'norm_t': nt,
            'norm_t_minus_1': nt1,
            'status': 'unsearched',
            'search': {},
            'matrices': [],
        }
    elif label:
        db['fields'][key]['label'] = label
    return db['fields'][key]


def merge_records(entry, records, cap=60):
    """Insert records, dedupe by matrix, keep shortest-first up to cap."""
    seen = {tuple(tuple(row) for row in r['matrix']): r
            for r in entry['matrices']}
    for r in records:
        kkey = tuple(tuple(row) for row in r['matrix'])
        old = seen.get(kkey)
        if old is None or r['length'] < old['length']:
            seen[kkey] = r
    ranked = sorted(seen.values(), key=lambda r: (r['length'], r['word']))
    entry['total_distinct'] = len(ranked)
    entry['matrices'] = ranked[:cap]
    entry['status'] = 'found' if ranked else entry.get('status', 'none_found')
    return entry
