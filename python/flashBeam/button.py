"""
FlashBeam search for integral elements in Button's genus-2 surface group
representation in SL_2(F_3(x,y)).

Matrices from Theorem 5.4 of arXiv:2603.06139 (Button, "Groups acting on
products of locally finite trees").

Parameters: d = 1/x^2, delta = x+1, h = x, c = 1, giving
  X = (1-x)/x^2,  Y = (2x^3+2x^2-1)/x.

An integral element is a nontrivial group element whose matrix entries all
lie in F_3[x,y] (polynomials, no denominators).
"""

from flashbeam import FlashBeam, SearchProblem, Node
from typing import Dict, Tuple

# ============================================================
# F_3[x,y] polynomial arithmetic
# ============================================================
# Representation: dict mapping (x_exp, y_exp) -> coeff in {1, 2}
# Zero polynomial: empty dict {}

Poly = Dict[Tuple[int, int], int]


def p_zero() -> Poly:
    return {}

def p_one() -> Poly:
    return {(0, 0): 1}

def p_const(c: int) -> Poly:
    c %= 3
    return {(0, 0): c} if c else {}

def p_x(n: int = 1) -> Poly:
    return {(n, 0): 1}

def p_y(n: int = 1) -> Poly:
    return {(0, n): 1}

def p_add(a: Poly, b: Poly) -> Poly:
    r = dict(a)
    for k, v in b.items():
        r[k] = (r.get(k, 0) + v) % 3
        if r[k] == 0:
            r.pop(k)
    return r

def p_neg(a: Poly) -> Poly:
    return {k: (3 - v) % 3 for k, v in a.items()}

def p_sub(a: Poly, b: Poly) -> Poly:
    return p_add(a, p_neg(b))

def p_mul(a: Poly, b: Poly) -> Poly:
    if not a or not b:
        return {}
    r: Dict[Tuple[int, int], int] = {}
    for (ax, ay), ac in a.items():
        for (bx, by), bc in b.items():
            k = (ax + bx, ay + by)
            r[k] = (r.get(k, 0) + ac * bc) % 3
    return {k: v for k, v in r.items() if v}

def p_scale(a: Poly, c: int) -> Poly:
    c %= 3
    if not c:
        return {}
    if c == 1:
        return dict(a)
    return {k: (v * c) % 3 for k, v in a.items()}

def p_is_zero(a: Poly) -> bool:
    return not a

def p_is_const(a: Poly) -> bool:
    return not a or (len(a) == 1 and (0, 0) in a)

def p_const_val(a: Poly) -> int:
    return a.get((0, 0), 0) if a else 0

def p_total_deg(a: Poly) -> int:
    if not a:
        return -1
    return max(ex + ey for ex, ey in a)

def p_x_deg(a: Poly) -> int:
    if not a:
        return -1
    return max(ex for ex, _ in a)

def p_y_deg(a: Poly) -> int:
    if not a:
        return -1
    return max(ey for _, ey in a)

def p_num_terms(a: Poly) -> int:
    return len(a)

def p_eq(a: Poly, b: Poly) -> bool:
    return a == b

def p_hash(a: Poly) -> int:
    return hash(tuple(sorted(a.items())))

def p_eval_y(a: Poly, yval: int) -> Poly:
    """Evaluate y at yval in F_3, return univariate poly in x."""
    r: Dict[Tuple[int, int], int] = {}
    for (ex, ey), c in a.items():
        if yval == 0 and ey > 0:
            continue
        val = (c * pow(yval, ey, 3)) % 3 if yval else c % 3
        if val:
            k = (ex, 0)
            r[k] = (r.get(k, 0) + val) % 3
    return {k: v for k, v in r.items() if v}


# --- Univariate GCD over F_3 (polynomials in x only) ---

def _f3_inv(c: int) -> int:
    # 1^-1 = 1, 2^-1 = 2 in F_3
    return c % 3

def _uv_to_list(p: Poly) -> list:
    if not p:
        return []
    d = max(ex for ex, _ in p)
    return [p.get((i, 0), 0) % 3 for i in range(d + 1)]

def _uv_from_list(lst: list) -> Poly:
    while lst and lst[-1] % 3 == 0:
        lst.pop()
    return {(i, 0): c % 3 for i, c in enumerate(lst) if c % 3}

def _uv_gcd_list(a: list, b: list) -> list:
    a, b = list(a), list(b)
    while True:
        while a and a[-1] % 3 == 0:
            a.pop()
        while b and b[-1] % 3 == 0:
            b.pop()
        if not b:
            break
        if len(a) < len(b):
            a, b = b, a
        while len(a) >= len(b) and b:
            f = (a[-1] * _f3_inv(b[-1])) % 3
            s = len(a) - len(b)
            for i in range(len(b)):
                a[s + i] = (a[s + i] - f * b[i]) % 3
            while a and a[-1] % 3 == 0:
                a.pop()
        a, b = b, a
    if a:
        lc_inv = _f3_inv(a[-1])
        a = [(c * lc_inv) % 3 for c in a]
    return a

def uv_gcd(a: Poly, b: Poly) -> Poly:
    return _uv_from_list(_uv_gcd_list(_uv_to_list(a), _uv_to_list(b)))

def uv_div(a: Poly, b: Poly) -> Poly:
    al, bl = list(_uv_to_list(a)), _uv_to_list(b)
    if not bl:
        raise ZeroDivisionError
    q = [0] * max(0, len(al) - len(bl) + 1)
    while len(al) >= len(bl):
        f = (al[-1] * _f3_inv(bl[-1])) % 3
        s = len(al) - len(bl)
        q[s] = f
        for i in range(len(bl)):
            al[s + i] = (al[s + i] - f * bl[i]) % 3
        while al and al[-1] % 3 == 0:
            al.pop()
    return _uv_from_list(q)


# --- Bivariate GCD over F_3[x,y] ---

def _is_uv_x(p: Poly) -> bool:
    return all(ey == 0 for _, ey in p)

def p_gcd(a: Poly, b: Poly) -> Poly:
    if not a:
        return b or p_one()
    if not b:
        return a
    if p_is_const(a) or p_is_const(b):
        return p_one()

    # Extract common monomial factor x^mx * y^my
    mx = min(min(ex for ex, _ in a), min(ex for ex, _ in b))
    my = min(min(ey for _, ey in a), min(ey for _, ey in b))

    if mx > 0 or my > 0:
        a2 = {(ex - mx, ey - my): c for (ex, ey), c in a.items()}
        b2 = {(ex - mx, ey - my): c for (ex, ey), c in b.items()}
        g = _p_gcd_inner(a2, b2)
        return {(ex + mx, ey + my): c for (ex, ey), c in g.items()}
    return _p_gcd_inner(a, b)

def _p_gcd_inner(a: Poly, b: Poly) -> Poly:
    if p_is_const(a) or p_is_const(b):
        return p_one()
    if _is_uv_x(a) and _is_uv_x(b):
        return uv_gcd(a, b)

    # Evaluate at y = 0, 1, 2 and compute univariate GCDs
    gcds = []
    for yv in range(3):
        ae = p_eval_y(a, yv)
        be = p_eval_y(b, yv)
        if not ae or not be:
            gcds.append(p_one())
        else:
            gcds.append(uv_gcd(ae, be))

    degs = [p_x_deg(g) for g in gcds]
    min_d = min(degs)
    if min_d <= 0:
        return p_one()

    # If all evaluation GCDs have the same x-degree, interpolate
    if degs[0] == degs[1] == degs[2]:
        g0 = gcds[0]   # g(x, 0)
        # g(x,1) = g0 + g1 + g2,  g(x,2) = g0 + 2*g1 + g2  (y^2 at y=2 is 4=1)
        # => g1 = g(x,2) - g(x,1),  g2 = g(x,1) - g0 - g1
        g1 = p_sub(gcds[2], gcds[1])
        g2 = p_sub(p_sub(gcds[1], g0), g1)
        result: Poly = {}
        for (ex, _), c in g0.items():
            result[(ex, 0)] = c
        for (ex, _), c in g1.items():
            k = (ex, 1)
            result[k] = (result.get(k, 0) + c) % 3
        for (ex, _), c in g2.items():
            k = (ex, 2)
            result[k] = (result.get(k, 0) + c) % 3
        result = {k: v for k, v in result.items() if v}
        if result:
            # Verify it divides both a and b by checking at evaluation points
            ok = True
            for yv in range(3):
                ge = p_eval_y(result, yv)
                ae = p_eval_y(a, yv)
                be = p_eval_y(b, yv)
                if ge and ae:
                    # ge should divide ae
                    if p_x_deg(ae) >= p_x_deg(ge):
                        rem = _uv_mod(ae, ge)
                        if rem:
                            ok = False
                            break
                if ge and be:
                    if p_x_deg(be) >= p_x_deg(ge):
                        rem = _uv_mod(be, ge)
                        if rem:
                            ok = False
                            break
            if ok:
                return result

    # Fallback: return one of the minimum-degree evaluation GCDs
    for i, d in enumerate(degs):
        if d == min_d and gcds[i]:
            return gcds[i]
    return p_one()

def _uv_mod(a: Poly, b: Poly) -> Poly:
    """Remainder of a mod b for univariate-in-x polys over F_3."""
    al, bl = list(_uv_to_list(a)), _uv_to_list(b)
    if not bl:
        raise ZeroDivisionError
    while len(al) >= len(bl):
        f = (al[-1] * _f3_inv(bl[-1])) % 3
        s = len(al) - len(bl)
        for i in range(len(bl)):
            al[s + i] = (al[s + i] - f * bl[i]) % 3
        while al and al[-1] % 3 == 0:
            al.pop()
    return _uv_from_list(al)


# --- Polynomial division ---

def _poly_div(a: Poly, b: Poly) -> Poly:
    """Exact division a / b in F_3[x,y]."""
    if p_is_const(b):
        return p_scale(a, _f3_inv(p_const_val(b)))
    if len(b) == 1:
        (bx, by), bc = next(iter(b.items()))
        inv_c = _f3_inv(bc)
        return {(ex - bx, ey - by): (c * inv_c) % 3 for (ex, ey), c in a.items()}
    if _is_uv_x(a) and _is_uv_x(b):
        return uv_div(a, b)

    # General multivariate long division (graded reverse lex)
    remainder = dict(a)
    result: Poly = {}
    b_keys = sorted(b.keys(), key=lambda k: (k[0] + k[1], k[0]), reverse=True)
    b_lt = b_keys[0]
    b_lt_c = b[b_lt]
    b_lt_inv = _f3_inv(b_lt_c)

    for _ in range(10000):  # safety bound
        if not remainder:
            break
        r_keys = sorted(remainder.keys(), key=lambda k: (k[0] + k[1], k[0]), reverse=True)
        r_lt = r_keys[0]
        qx = r_lt[0] - b_lt[0]
        qy = r_lt[1] - b_lt[1]
        if qx < 0 or qy < 0:
            break
        qc = (remainder[r_lt] * b_lt_inv) % 3
        result[(qx, qy)] = (result.get((qx, qy), 0) + qc) % 3
        for (bx, by), bc in b.items():
            k = (bx + qx, by + qy)
            remainder[k] = (remainder.get(k, 0) - qc * bc) % 3
            if remainder[k] == 0:
                remainder.pop(k, None)
    return {k: v for k, v in result.items() if v}


# ============================================================
# F_3(x,y) rational function arithmetic
# ============================================================

def _poly_str(p: Poly) -> str:
    if not p:
        return "0"
    terms = []
    for (ex, ey) in sorted(p.keys(), key=lambda k: (k[0] + k[1], k[0]), reverse=True):
        c = p[(ex, ey)]
        parts = []
        is_monomial = (ex > 0 or ey > 0)
        if c == 2 and is_monomial:
            parts.append("2")
        elif not is_monomial:
            parts.append(str(c))
        if ex == 1:
            parts.append("x")
        elif ex > 1:
            parts.append(f"x^{ex}")
        if ey == 1:
            parts.append("y")
        elif ey > 1:
            parts.append(f"y^{ey}")
        terms.append("".join(parts) or str(c))
    return " + ".join(terms) if terms else "0"


class F3Frac:
    """Element of F_3(x,y) = Frac(F_3[x,y])."""
    __slots__ = ('num', 'den')

    def __init__(self, num: Poly, den: Poly = None):
        if den is None:
            den = p_one()
        if not num:
            self.num = {}
            self.den = p_one()
            return
        # Reduce by GCD
        g = p_gcd(num, den)
        if g and not p_is_const(g):
            num = _poly_div(num, g)
            den = _poly_div(den, g)
        # Normalize: make "leading" coeff of den = 1
        if den:
            lk = min(sorted(den.keys()))
            lc = den[lk]
            if lc == 2:
                num = p_scale(num, 2)
                den = p_scale(den, 2)
        self.num = num
        self.den = den

    def is_zero(self) -> bool:
        return not self.num

    def is_polynomial(self) -> bool:
        return p_is_const(self.den)

    def den_total_deg(self) -> int:
        return 0 if p_is_const(self.den) else p_total_deg(self.den)

    def complexity(self) -> int:
        """Total number of terms in num + den."""
        return p_num_terms(self.num) + p_num_terms(self.den)

    def __add__(self, other: 'F3Frac') -> 'F3Frac':
        num = p_add(p_mul(self.num, other.den), p_mul(other.num, self.den))
        den = p_mul(self.den, other.den)
        return F3Frac(num, den)

    def __sub__(self, other: 'F3Frac') -> 'F3Frac':
        num = p_sub(p_mul(self.num, other.den), p_mul(other.num, self.den))
        den = p_mul(self.den, other.den)
        return F3Frac(num, den)

    def __mul__(self, other: 'F3Frac') -> 'F3Frac':
        return F3Frac(p_mul(self.num, other.num), p_mul(self.den, other.den))

    def __neg__(self) -> 'F3Frac':
        return F3Frac(p_neg(self.num), dict(self.den))

    def __eq__(self, other) -> bool:
        if not isinstance(other, F3Frac):
            return NotImplemented
        return p_eq(p_mul(self.num, other.den), p_mul(other.num, self.den))

    def __hash__(self) -> int:
        return hash((p_hash(self.num), p_hash(self.den)))

    def __repr__(self) -> str:
        n = _poly_str(self.num)
        d = _poly_str(self.den)
        if d == "1":
            return n
        return f"({n})/({d})"


FRAC_ZERO = F3Frac({})
FRAC_ONE = F3Frac(p_one())


# ============================================================
# 2x2 matrix over F_3(x,y)
# ============================================================

class Mat2:
    __slots__ = ('a', 'b', 'c', 'd')

    def __init__(self, a: F3Frac, b: F3Frac, c: F3Frac, d: F3Frac):
        self.a = a
        self.b = b
        self.c = c
        self.d = d

    def __mul__(self, other: 'Mat2') -> 'Mat2':
        return Mat2(
            self.a * other.a + self.b * other.c,
            self.a * other.b + self.b * other.d,
            self.c * other.a + self.d * other.c,
            self.c * other.b + self.d * other.d,
        )

    def inv(self) -> 'Mat2':
        """Inverse of SL_2 matrix: [[d,-b],[-c,a]]."""
        return Mat2(self.d, -self.b, -self.c, self.a)

    def is_identity(self) -> bool:
        return (self.a == FRAC_ONE and self.b == FRAC_ZERO
                and self.c == FRAC_ZERO and self.d == FRAC_ONE)

    def is_scalar(self) -> bool:
        return self.b == FRAC_ZERO and self.c == FRAC_ZERO and self.a == self.d

    def is_integral(self) -> bool:
        return (self.a.is_polynomial() and self.b.is_polynomial()
                and self.c.is_polynomial() and self.d.is_polynomial())

    def integrality_score(self) -> int:
        return (self.a.den_total_deg() + self.b.den_total_deg()
                + self.c.den_total_deg() + self.d.den_total_deg())

    def __eq__(self, other) -> bool:
        return (self.a == other.a and self.b == other.b
                and self.c == other.c and self.d == other.d)

    def hash_key(self):
        return (hash(self.a), hash(self.b), hash(self.c), hash(self.d))


# ============================================================
# Build the four generators from Theorem 5.4 (mod 3)
# ============================================================

def _poly(*terms) -> Poly:
    """Helper: _poly((coeff, x_deg, y_deg), ...) -> Poly in F_3[x,y]."""
    p: Poly = {}
    for c, ex, ey in terms:
        k = (ex, ey)
        p[k] = (p.get(k, 0) + c) % 3
    return {k: v for k, v in p.items() if v}

def _frac(num: Poly, den: Poly = None) -> F3Frac:
    return F3Frac(num, den) if den is not None else F3Frac(num)


def make_button_matrices():
    """
    Construct A, B, C, D in SL_2(F_3(x,y)) from Theorem 5.4.

    After reducing mod 3 with d=1/x^2, delta=x+1, h=x, c=1:

      A = [[(x^2+2x+2)/x,  (x^3+2x^2+x+1)/x^3],
           [1,               1/x^2              ]]

      B = [[(x+1)/(x(x^2+2x+2)),  (x^3+x^2+2)/(x^2(x^2+2x+2))],
           [x,                      x+1                           ]]

      D = [[(x^2+2x+2)/x,  (x^3+2x^2+x+1)/(y*x^3)],
           [y,               1/x^2                  ]]

      C = [[(x+1)/(x(x^2+2x+2)),  (x^3+x^2+2)/(y*x^2*(x^2+2x+2))],
           [y*x,                    x+1                              ]]
    """
    # Commonly used polynomials
    q = _poly((1, 2, 0), (2, 1, 0), (2, 0, 0))       # x^2 + 2x + 2
    xq = p_mul(p_x(), q)                               # x^3 + 2x^2 + 2x
    x2q = p_mul(p_x(2), q)                             # x^4 + 2x^3 + 2x^2

    num_A01 = _poly((2, 3, 0), (1, 2, 0), (2, 1, 0), (2, 0, 0))   # 2x^3 + x^2 + 2x + 2
    num_B01 = _poly((2, 3, 0), (2, 2, 0), (1, 0, 0))              # 2x^3 + 2x^2 + 1
    xp1 = _poly((1, 1, 0), (1, 0, 0))                              # x + 1

    A = Mat2(
        _frac(q, p_x()),                        # (x^2+2x+2)/x
        _frac(num_A01, p_x(3)),                  # (x^3+2x^2+x+1)/x^3
        _frac(p_one()),                          # 1
        _frac(p_one(), p_x(2)),                  # 1/x^2
    )

    B = Mat2(
        _frac(xp1, xq),                         # (x+1)/(x(x^2+2x+2))
        _frac(num_B01, x2q),                     # (x^3+x^2+2)/(x^2(x^2+2x+2))
        _frac(p_x()),                            # x
        _frac(xp1),                              # x+1
    )

    D = Mat2(
        _frac(q, p_x()),                         # (x^2+2x+2)/x
        _frac(num_A01, p_mul(p_y(), p_x(3))),   # (x^3+2x^2+x+1)/(y*x^3)
        _frac(p_y()),                            # y
        _frac(p_one(), p_x(2)),                  # 1/x^2
    )

    C = Mat2(
        _frac(xp1, xq),                                       # (x+1)/(x(x^2+2x+2))
        _frac(num_B01, p_mul(p_y(), x2q)),                    # (x^3+x^2+2)/(y*x^2*(x^2+2x+2))
        _frac(p_mul(p_y(), p_x())),                           # y*x
        _frac(xp1),                                            # x+1
    )

    return A, B, C, D


def verify_matrices():
    """Sanity check: determinants should all be 1."""
    A, B, C, D = make_button_matrices()
    for name, M in [("A", A), ("B", B), ("C", C), ("D", D)]:
        det = M.a * M.d - M.b * M.c
        assert det == FRAC_ONE, f"det({name}) = {det} != 1"
    # Check surface group relation [A,B][C,D] = I
    AB_comm = A * B * A.inv() * B.inv()
    CD_comm = C * D * C.inv() * D.inv()
    relation = AB_comm * CD_comm
    assert relation.is_identity(), f"Surface relation failed: [A,B][C,D] = {relation}"
    
    print("Matrix verifications passed: All determinants are 1 and [A,B][C,D] = I.")


# ============================================================
# FlashBeam SearchProblem
# ============================================================

MAT_I = Mat2(FRAC_ONE, FRAC_ZERO, FRAC_ZERO, FRAC_ONE)


class ButtonProblem(SearchProblem):
    def __init__(self):
        A, B, C, D = make_button_matrices()
        self.generators = [A, B, C, D, A.inv(), B.inv(), C.inv(), D.inv()]
        self.names = ['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']
        self.inverses_map = {
            'A': 'a', 'a': 'A', 'B': 'b', 'b': 'B',
            'C': 'c', 'c': 'C', 'D': 'd', 'd': 'D',
        }

    def _reduce_word(self, word_str):
        if not word_str:
            return ""
        tokens = word_str.split(" ")
        stack = []
        for t in tokens:
            if stack and self.inverses_map.get(stack[-1]) == t:
                stack.pop()
            else:
                stack.append(t)
        return " ".join(stack)

    def get_initial_node(self):
        return Node(state=MAT_I, identifier="", score=0.0)

    def get_generators(self):
        nodes = []
        for name, m in zip(self.names, self.generators):
            score = m.integrality_score()
            nodes.append(Node(state=m, identifier=name, score=float(score)))
        return nodes

    def combine(self, node_a, node_b):
        raw_word = f"{node_a.identifier} {node_b.identifier}".strip()
        new_word = self._reduce_word(raw_word)
        if not new_word:
            return Node(state=MAT_I, identifier="", score=0.0)
        new_mat = node_a.state * node_b.state
        score = new_mat.integrality_score()
        return Node(state=new_mat, identifier=new_word, score=float(score))

    def get_hash_key(self, node):
        return node.state.hash_key()

    def is_solution(self, node):
        return node.state.is_integral()

    def is_nontrivial(self, node):
        if not node.identifier:
            return False
        tokens = node.identifier.split(" ")
        if len(tokens) < 2:
            return False
        if node.state.is_scalar():
            return False
        return True

    def format_score(self, node):
        return f"{node.score:.0f}"

    def format_state(self, node):
        m = node.state
        return f"[{m.a},  {m.b}]\n[{m.c},  {m.d}]"


# ============================================================
# Main
# ============================================================

BEAM_WIDTH = 5000
FLASH_SIZE = 20
MAX_ITERATIONS = 200
MAX_SOLUTIONS = 3

if __name__ == "__main__":
    verify_matrices()
    print()

    problem = ButtonProblem()
    solver = FlashBeam(
        problem=problem,
        beam_width=BEAM_WIDTH,
        flash_size=FLASH_SIZE,
        max_iterations=MAX_ITERATIONS,
        max_solutions=MAX_SOLUTIONS,
    )

    print("Button's genus-2 surface group in SL_2(F_3(x,y))")
    print("Searching for integral elements (all entries in F_3[x,y])...")
    print("Generators: A, B, C, D and inverses a, b, c, d")
    print()

    for gen in problem.get_generators():
        print(f"  {gen.identifier}: integrality score = {gen.score:.0f}")
    print()

    results = solver.solve()

    if results:
        print(f"\nFound {len(results)} integral element(s):")
        for r in results:
            tokens = r.identifier.split(" ")
            print(f"\n  Word (length {len(tokens)}): {r.identifier}")
            print(f"  Matrix:")
            for line in problem.format_state(r).splitlines():
                print(f"    {line}")
    else:
        print("\nNo integral elements found in search depth.")
