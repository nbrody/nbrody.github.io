"""
Classical beam search for integral elements in Button's genus-2 surface
group in SL_2(F_3(x,y)), using python-flint's nmod_poly for fast
univariate arithmetic mod 3.

Bivariate polynomials in F_3[x,y] are represented as dict[int, nmod_poly]:
  { y_degree: polynomial_in_x_over_F3 }

Rational functions are (num, den) pairs reduced by GCD.
"""

import heapq
import time
from flint import nmod_poly

P = 3  # characteristic

# ============================================================
# Bivariate polynomial over F_3  (dict: y_exp -> nmod_poly in x)
# ============================================================

ZERO_X = nmod_poly([], P)
ONE_X = nmod_poly([1], P)


def bv_zero():
    return {}


def bv_one():
    return {0: nmod_poly([1], P)}


def bv_x(n=1):
    coeffs = [0] * n + [1]
    return {0: nmod_poly(coeffs, P)}


def bv_y(n=1):
    return {n: nmod_poly([1], P)}


def bv_const(c):
    c = int(c) % P
    if c == 0:
        return {}
    return {0: nmod_poly([c], P)}


def bv_clean(a):
    return {k: v for k, v in a.items() if v != ZERO_X and v.degree() >= 0}


def bv_is_zero(a):
    return not bv_clean(a)


def bv_is_const(a):
    a = bv_clean(a)
    if not a:
        return True
    if len(a) == 1 and 0 in a and a[0].degree() == 0:
        return True
    return False


def bv_const_val(a):
    a = bv_clean(a)
    if not a:
        return 0
    if 0 in a and a[0].degree() == 0:
        return int(a[0][0])
    return 0


def bv_add(a, b):
    r = dict(a)
    for k, v in b.items():
        if k in r:
            r[k] = r[k] + v
        else:
            r[k] = v
    return bv_clean(r)


def bv_neg(a):
    return {k: v * (P - 1) for k, v in a.items()}


def bv_sub(a, b):
    return bv_add(a, bv_neg(b))


def bv_mul(a, b):
    a = bv_clean(a)
    b = bv_clean(b)
    if not a or not b:
        return {}
    r = {}
    for ay, ax in a.items():
        for by, bx in b.items():
            ky = ay + by
            prod = ax * bx
            if ky in r:
                r[ky] = r[ky] + prod
            else:
                r[ky] = prod
    return bv_clean(r)


def bv_scale(a, c):
    c = int(c) % P
    if c == 0:
        return {}
    if c == 1:
        return dict(a)
    return bv_clean({k: v * c for k, v in a.items()})


def bv_y_deg(a):
    a = bv_clean(a)
    if not a:
        return -1
    return max(a.keys())


def bv_total_deg(a):
    """Max of (x_deg + y_deg) over all terms."""
    a = bv_clean(a)
    if not a:
        return -1
    return max(v.degree() + k for k, v in a.items())


def bv_num_terms(a):
    """Total number of nonzero monomials."""
    return sum(v.degree() + 1 for v in bv_clean(a).values())


def bv_eq(a, b):
    a = bv_clean(a)
    b = bv_clean(b)
    if a.keys() != b.keys():
        return False
    return all(a[k] == b[k] for k in a)


def bv_hash(a):
    a = bv_clean(a)
    parts = []
    for k in sorted(a.keys()):
        p = a[k]
        parts.append((k, tuple(int(p[i]) for i in range(p.degree() + 1))))
    return hash(tuple(parts))


def bv_eval_y(a, yval):
    """Evaluate y at yval in F_3, return nmod_poly in x."""
    yval = int(yval) % P
    result = ZERO_X
    for ey, px in a.items():
        if yval == 0 and ey > 0:
            continue
        c = pow(yval, ey, P) if yval else 1
        result = result + px * c
    return result


# --- GCD ---

def _min_y_power(a):
    a = bv_clean(a)
    if not a:
        return 0
    return min(a.keys())


def bv_gcd(a, b):
    """GCD of bivariate polynomials over F_3."""
    a = bv_clean(a)
    b = bv_clean(b)
    if not a:
        return b or bv_one()
    if not b:
        return a
    if bv_is_const(a) or bv_is_const(b):
        return bv_one()

    # Factor out common y^m
    my_a = _min_y_power(a)
    my_b = _min_y_power(b)
    my = min(my_a, my_b)

    # Factor out common x^m from all terms
    mx = None
    for p in list(a.values()) + list(b.values()):
        if p.degree() < 0:
            continue
        # Find min x power with nonzero coeff
        mp = 0
        while mp <= p.degree() and int(p[mp]) == 0:
            mp += 1
        mx = mp if mx is None else min(mx, mp)
    if mx is None:
        mx = 0

    # Shift out monomial factor
    if my > 0 or mx > 0:
        a2 = {k - my: _shift_right(v, mx) for k, v in a.items()}
        b2 = {k - my: _shift_right(v, mx) for k, v in b.items()}
        g = _bv_gcd_inner(bv_clean(a2), bv_clean(b2))
        # Multiply back monomial
        x_mono = nmod_poly([0] * mx + [1], P) if mx > 0 else ONE_X
        result = {}
        for ky, px in g.items():
            result[ky + my] = px * x_mono if mx > 0 else px
        return bv_clean(result)

    return _bv_gcd_inner(a, b)


def _shift_right(p, n):
    """Divide nmod_poly by x^n (exact)."""
    if n == 0:
        return p
    if p.degree() < n:
        return ZERO_X
    coeffs = [int(p[i]) for i in range(n, p.degree() + 1)]
    return nmod_poly(coeffs, P)


def _bv_gcd_inner(a, b):
    """GCD of bivariate polys with monomial factors already removed."""
    if bv_is_const(a) or bv_is_const(b):
        return bv_one()

    # Both univariate in x (no y)?
    a_uv = (bv_y_deg(a) == 0)
    b_uv = (bv_y_deg(b) == 0)
    if a_uv and b_uv:
        g = a[0].gcd(b[0])
        if g.degree() <= 0:
            return bv_one()
        return {0: g}

    # Evaluate at y = 0, 1, 2 and compute univariate GCDs
    gcds = []
    for yv in range(P):
        ae = bv_eval_y(a, yv)
        be = bv_eval_y(b, yv)
        if ae.degree() < 0 or be.degree() < 0:
            gcds.append(ONE_X)
        else:
            gcds.append(ae.gcd(be))

    degs = [g.degree() for g in gcds]
    min_d = min(degs)

    if min_d <= 0:
        return bv_one()

    # If all have same x-degree, interpolate to recover y-dependence
    if degs[0] == degs[1] == degs[2]:
        # g(x,y) = g0(x) + g1(x)*y + g2(x)*y^2
        # g(x,0) = g0, g(x,1) = g0+g1+g2, g(x,2) = g0+2g1+g2 (since 2^2=1 mod 3)
        # g1 = g(x,2) - g(x,1), g2 = g(x,1) - g0 - g1
        g0 = gcds[0]
        g1 = gcds[2] - gcds[1]
        g2 = gcds[1] - g0 - g1
        result = {}
        if g0 != ZERO_X and g0.degree() >= 0:
            result[0] = g0
        if g1 != ZERO_X and g1.degree() >= 0:
            result[1] = g1
        if g2 != ZERO_X and g2.degree() >= 0:
            result[2] = g2
        result = bv_clean(result)
        if result:
            return result

    # Fallback: return the smallest-degree evaluation GCD (y-free)
    for i, d in enumerate(degs):
        if d == min_d and gcds[i].degree() > 0:
            return {0: gcds[i]}
    return bv_one()


# --- Division ---

def bv_divexact(a, b):
    """Exact division a / b in F_3[x,y]."""
    b = bv_clean(b)
    if not b:
        raise ZeroDivisionError
    if bv_is_const(b):
        c = bv_const_val(b)
        # inverse of c mod 3: 1->1, 2->2
        return bv_scale(a, c)
    # Monomial case: y^m * x^n * c
    if len(b) == 1:
        by = next(iter(b))
        bx = b[by]
        if bx.degree() == 0:
            # just y^m * c
            inv_c = int(bx[0])  # same as inverse in F_3
            result = {}
            for ay, ax in a.items():
                result[ay - by] = ax * inv_c
            return bv_clean(result)

    # General: long division ordered by y-degree (descending), then x-degree
    a = bv_clean(a)
    b_max_y = max(b.keys())
    b_lead_x = b[b_max_y]  # leading y-coefficient (an nmod_poly in x)
    result = {}

    remainder = dict(a)
    for _ in range(5000):
        remainder = bv_clean(remainder)
        if not remainder:
            break
        r_max_y = max(remainder.keys())
        r_lead_x = remainder[r_max_y]
        qy = r_max_y - b_max_y
        if qy < 0:
            break
        # Divide leading x-polynomials
        qx, rem = divmod(r_lead_x, b_lead_x)
        if qx.degree() < 0:
            break
        # Subtract qx * y^qy * b from remainder
        if qy in result:
            result[qy] = result[qy] + qx
        else:
            result[qy] = qx
        for by, bx in b.items():
            ky = by + qy
            sub = bx * qx
            if ky in remainder:
                remainder[ky] = remainder[ky] - sub
            else:
                remainder[ky] = ZERO_X - sub
    return bv_clean(result)


# ============================================================
# Rational function in F_3(x,y)
# ============================================================

class Frac:
    __slots__ = ('num', 'den', '_hash')

    def __init__(self, num, den=None, _reduce=True):
        if den is None:
            den = bv_one()
        if bv_is_zero(num):
            self.num = {}
            self.den = bv_one()
            self._hash = None
            return
        if _reduce:
            g = bv_gcd(num, den)
            if not bv_is_const(g):
                num = bv_divexact(num, g)
                den = bv_divexact(den, g)
            # Normalize: make leading coeff of den's highest y-term monic
            den = bv_clean(den)
            if den:
                top_y = max(den.keys())
                lc = den[top_y]
                leading = int(lc[lc.degree()])
                if leading == 2:  # multiply both by 2 to make it 1
                    num = bv_scale(num, 2)
                    den = bv_scale(den, 2)
        self.num = bv_clean(num)
        self.den = bv_clean(den) or bv_one()
        self._hash = None

    def is_zero(self):
        return bv_is_zero(self.num)

    def is_poly(self):
        return bv_is_const(self.den)

    def den_deg(self):
        return 0 if bv_is_const(self.den) else bv_total_deg(self.den)

    def __add__(self, other):
        n = bv_add(bv_mul(self.num, other.den), bv_mul(other.num, self.den))
        d = bv_mul(self.den, other.den)
        return Frac(n, d)

    def __sub__(self, other):
        n = bv_sub(bv_mul(self.num, other.den), bv_mul(other.num, self.den))
        d = bv_mul(self.den, other.den)
        return Frac(n, d)

    def __mul__(self, other):
        return Frac(bv_mul(self.num, other.num), bv_mul(self.den, other.den))

    def __neg__(self):
        return Frac(bv_neg(self.num), dict(self.den), _reduce=False)

    def __eq__(self, other):
        if not isinstance(other, Frac):
            return NotImplemented
        return bv_eq(bv_mul(self.num, other.den), bv_mul(other.num, self.den))

    def __hash__(self):
        if self._hash is None:
            self._hash = hash((bv_hash(self.num), bv_hash(self.den)))
        return self._hash

    def __repr__(self):
        n = _bv_str(self.num)
        d = _bv_str(self.den)
        return n if d == "1" else f"({n})/({d})"


def _nmod_str(p):
    """Compact string for nmod_poly."""
    if p.degree() < 0:
        return "0"
    return str(p)


def _bv_str(a):
    a = bv_clean(a)
    if not a:
        return "0"
    parts = []
    for ey in sorted(a.keys(), reverse=True):
        px = a[ey]
        xs = _nmod_str(px)
        if ey == 0:
            parts.append(xs)
        elif ey == 1:
            if xs == "1":
                parts.append("y")
            else:
                parts.append(f"({xs})*y")
        else:
            if xs == "1":
                parts.append(f"y^{ey}")
            else:
                parts.append(f"({xs})*y^{ey}")
    return " + ".join(parts) if parts else "0"


FRAC_ZERO = Frac({})
FRAC_ONE = Frac(bv_one())


# ============================================================
# 2x2 matrix over F_3(x,y)
# ============================================================

class Mat2:
    __slots__ = ('a', 'b', 'c', 'd', '_hash')

    def __init__(self, a, b, c, d):
        self.a = a
        self.b = b
        self.c = c
        self.d = d
        self._hash = None

    def __mul__(self, other):
        return Mat2(
            self.a * other.a + self.b * other.c,
            self.a * other.b + self.b * other.d,
            self.c * other.a + self.d * other.c,
            self.c * other.b + self.d * other.d,
        )

    def inv(self):
        return Mat2(self.d, -self.b, -self.c, self.a)

    def is_identity(self):
        return (self.a == FRAC_ONE and self.b == FRAC_ZERO
                and self.c == FRAC_ZERO and self.d == FRAC_ONE)

    def is_scalar(self):
        return self.b == FRAC_ZERO and self.c == FRAC_ZERO and self.a == self.d

    def is_integral(self):
        return self.a.is_poly() and self.b.is_poly() and self.c.is_poly() and self.d.is_poly()

    def score(self):
        return self.a.den_deg() + self.b.den_deg() + self.c.den_deg() + self.d.den_deg()

    def __eq__(self, other):
        return (self.a == other.a and self.b == other.b
                and self.c == other.c and self.d == other.d)

    def hash_key(self):
        if self._hash is None:
            self._hash = (hash(self.a), hash(self.b), hash(self.c), hash(self.d))
        return self._hash


# ============================================================
# Generators from Theorem 5.4 (mod 3)
# ============================================================

def _frac(num, den=None):
    return Frac(num, den) if den is not None else Frac(num)


def make_generators():
    """
    A, B, C, D in SL_2(F_3(x,y)) and their inverses.
    Returns (matrices, names, inverses_map).
    """
    q = {0: nmod_poly([2, 2, 1], P)}              # x^2 + 2x + 2
    xq = {0: nmod_poly([0, 2, 2, 1], P)}          # x(x^2+2x+2) = x^3+2x^2+2x
    x2q = {0: nmod_poly([0, 0, 2, 2, 1], P)}      # x^2(x^2+2x+2)

    num_A01 = {0: nmod_poly([2, 2, 1, 2], P)}     # 2x^3 + x^2 + 2x + 2
    num_B01 = {0: nmod_poly([1, 0, 2, 2], P)}     # 2x^3 + 2x^2 + 1
    xp1 = {0: nmod_poly([1, 1], P)}               # x + 1
    x1 = bv_x(1)                                   # x
    x2 = bv_x(2)                                   # x^2
    x3 = bv_x(3)                                   # x^3
    y1 = bv_y(1)                                   # y
    yx = bv_mul(y1, x1)                            # xy
    yx3 = bv_mul(y1, x3)                           # yx^3
    yx2q = bv_mul(y1, x2q)                         # yx^2(x^2+2x+2)

    A = Mat2(
        _frac(q, x1),
        _frac(num_A01, x3),
        _frac(bv_one()),
        _frac(bv_one(), x2),
    )
    B = Mat2(
        _frac(xp1, xq),
        _frac(num_B01, x2q),
        _frac(x1),
        _frac(xp1),
    )
    D = Mat2(
        _frac(q, x1),
        _frac(num_A01, yx3),
        _frac(y1),
        _frac(bv_one(), x2),
    )
    C = Mat2(
        _frac(xp1, xq),
        _frac(num_B01, yx2q),
        _frac(yx),
        _frac(xp1),
    )

    mats = [A, B, C, D, A.inv(), B.inv(), C.inv(), D.inv()]
    names = ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']
    inv_map = {'A': 'a', 'a': 'A', 'B': 'b', 'b': 'B',
               'C': 'c', 'c': 'C', 'D': 'd', 'd': 'D'}
    return mats, names, inv_map


def verify():
    mats, names, _ = make_generators()
    A, B, C, D = mats[:4]
    for name, M in zip(names[:4], mats[:4]):
        det = M.a * M.d - M.b * M.c
        assert det == FRAC_ONE, f"det({name}) = {det}"
    comm_AB = A * B * A.inv() * B.inv()
    comm_DC = D * C * D.inv() * C.inv()
    assert comm_AB == comm_DC, "[A,B] != [D,C]"
    print("Verification passed: det=1 for all generators, [A,B]=[D,C].")


# ============================================================
# Classical beam search
# ============================================================

def reduce_word(tokens, inv_map):
    stack = []
    for t in tokens:
        if stack and inv_map.get(stack[-1]) == t:
            stack.pop()
        else:
            stack.append(t)
    return tuple(stack)


CD_LETTERS = frozenset('CDcd')


def _uses_cd(word):
    return any(t in CD_LETTERS for t in word)


def beam_search(beam_width=50000, max_iters=300, max_solutions=3):
    mats, names, inv_map = make_generators()

    # Partitioned beam: reserve half for words using C/D, half for A/B-only.
    # This prevents the A/B subgroup from monopolizing the beam.
    half = beam_width // 2

    beam = []
    visited = set()
    solutions = []

    identity_key = Mat2(FRAC_ONE, FRAC_ZERO, FRAC_ZERO, FRAC_ONE).hash_key()
    visited.add(identity_key)

    for m, name in zip(mats, names):
        key = m.hash_key()
        if key not in visited:
            visited.add(key)
            s = m.score()
            beam.append((s, (name,), m))
            if s == 0 and not m.is_scalar():
                solutions.append(((name,), m))

    print(f"Beam search: width={beam_width} ({half} AB + {half} CD), generators={len(mats)}")
    print(f"Initial beam: {len(beam)} entries")
    for s, w, _ in sorted(beam, key=lambda x: x[0])[:8]:
        print(f"  {' '.join(w)}: score={s}")
    print()

    t0 = time.monotonic()

    for it in range(max_iters):
        candidates_ab = []
        candidates_cd = []
        for _, word, mat in beam:
            for g, gname in zip(mats, names):
                new_tokens = reduce_word(word + (gname,), inv_map)
                if not new_tokens:
                    continue
                new_mat = mat * g
                key = new_mat.hash_key()
                if key in visited:
                    continue
                visited.add(key)
                s = new_mat.score()
                if s == 0 and not new_mat.is_scalar() and len(new_tokens) >= 2:
                    solutions.append((new_tokens, new_mat))
                    wstr = " ".join(new_tokens)
                    print(f"\n*** SOLUTION (length {len(new_tokens)}): {wstr}")
                    if len(solutions) >= max_solutions:
                        return solutions
                entry = (s, new_tokens, new_mat)
                if _uses_cd(new_tokens):
                    candidates_cd.append(entry)
                else:
                    candidates_ab.append(entry)

        if not candidates_ab and not candidates_cd:
            print(f"Iter {it}: no new candidates. Stopping.")
            break

        # Select top from each partition, then merge
        if len(candidates_ab) > half:
            best_ab = heapq.nsmallest(half, candidates_ab, key=lambda x: x[0])
        else:
            candidates_ab.sort(key=lambda x: x[0])
            best_ab = candidates_ab

        if len(candidates_cd) > half:
            best_cd = heapq.nsmallest(half, candidates_cd, key=lambda x: x[0])
        else:
            candidates_cd.sort(key=lambda x: x[0])
            best_cd = candidates_cd

        beam = best_ab + best_cd

        elapsed = time.monotonic() - t0
        avg_len = sum(len(w) for _, w, _ in beam) / max(1, len(beam))

        # Report best from each partition
        best_ab_s = best_ab[0][0] if best_ab else float('inf')
        best_cd_s = best_cd[0][0] if best_cd else float('inf')
        best_ab_w = " ".join(best_ab[0][1]) if best_ab else "-"
        best_cd_w = " ".join(best_cd[0][1]) if best_cd else "-"
        print(f"Iter {it}: AB best={best_ab_s} [{best_ab_w}]  "
              f"CD best={best_cd_s} [{best_cd_w}]  "
              f"beam={len(best_ab)}+{len(best_cd)}  "
              f"visited={len(visited)}  avg_len={avg_len:.1f}  "
              f"time={elapsed:.1f}s")

    return solutions


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    verify()
    print()
    results = beam_search(beam_width=50000, max_iters=300, max_solutions=3)
    if results:
        print(f"\nFound {len(results)} integral element(s):")
        for word, mat in results:
            print(f"\n  Word (length {len(word)}): {' '.join(word)}")
            print(f"  [{mat.a},  {mat.b}]")
            print(f"  [{mat.c},  {mat.d}]")
    else:
        print("\nNo integral elements found.")
