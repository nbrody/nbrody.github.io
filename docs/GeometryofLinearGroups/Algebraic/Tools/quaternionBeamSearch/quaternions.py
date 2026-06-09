"""
Exact projective integer (Lipschitz) quaternion arithmetic, backed by python-flint.

A quaternion is q = w + x*i + y*j + z*k with i^2 = j^2 = k^2 = -1, ij = k.
Coordinates are exact integers (flint.fmpz).

We work *projectively*: q ~ lambda*q for any nonzero rational lambda.  The canonical
representative of a projective class is the primitive integer 4-tuple (gcd of
coordinates = 1) with a fixed sign convention (first nonzero coordinate > 0).

This module also implements the Lubotzky-Phillips-Sarnak factorization of a
primitive quaternion of norm 5^k into a reduced word in the six norm-5 generators
    g0 = 1+2i, g1 = 1-2i, g2 = 1+2j, g3 = 1-2j, g4 = 1+2k, g5 = 1-2k,
which exhibits PH(Z[1/5]) as (virtually) the free group F_3 = < x, y, z >
with x ~ g0, y ~ g2, z ~ g4 and inverses g1, g3, g5.
"""

from flint import fmpz

# ---------------------------------------------------------------------------
# Core quaternion type
# ---------------------------------------------------------------------------


class Quat:
    __slots__ = ("c",)

    def __init__(self, w, x, y, z):
        self.c = (fmpz(w), fmpz(x), fmpz(y), fmpz(z))

    # --- basic accessors -------------------------------------------------
    @property
    def w(self):
        return self.c[0]

    @property
    def x(self):
        return self.c[1]

    @property
    def y(self):
        return self.c[2]

    @property
    def z(self):
        return self.c[3]

    # --- algebra ---------------------------------------------------------
    def __mul__(self, o):
        w1, x1, y1, z1 = self.c
        w2, x2, y2, z2 = o.c
        return Quat(
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        )

    def conj(self):
        w, x, y, z = self.c
        return Quat(w, -x, -y, -z)

    def norm(self):
        w, x, y, z = self.c
        return w * w + x * x + y * y + z * z

    # --- projective canonical form --------------------------------------
    def content(self):
        """gcd of the four coordinates (>= 0)."""
        from math import gcd

        g = 0
        for v in self.c:
            g = gcd(g, int(v))
        return g

    def primitive(self):
        """Divide out the content (does not touch sign)."""
        g = self.content()
        if g <= 1:
            return self
        return Quat(*(int(v) // g for v in self.c))

    def canonical(self):
        """Canonical representative of the projective class q ~ lambda*q.

        Primitive integer tuple with first nonzero coordinate positive.
        """
        q = self.primitive()
        for v in q.c:
            iv = int(v)
            if iv != 0:
                if iv < 0:
                    return Quat(*(-int(t) for t in q.c))
                return q
        return q  # zero quaternion (never used)

    def key(self):
        return tuple(int(v) for v in self.canonical().c)

    # --- dunders ---------------------------------------------------------
    def __eq__(self, o):
        return isinstance(o, Quat) and self.c == o.c

    def __hash__(self):
        return hash(self.c)

    def __repr__(self):
        names = ("", "i", "j", "k")
        parts = []
        for v, n in zip(self.c, names):
            iv = int(v)
            if iv == 0:
                continue
            parts.append(f"{iv}{n}" if n else f"{iv}")
        return " + ".join(parts).replace("+ -", "- ") if parts else "0"


ONE = Quat(1, 0, 0, 0)
UNITS = [Quat(1, 0, 0, 0), Quat(-1, 0, 0, 0),
         Quat(0, 1, 0, 0), Quat(0, -1, 0, 0),
         Quat(0, 0, 1, 0), Quat(0, 0, -1, 0),
         Quat(0, 0, 0, 1), Quat(0, 0, 0, -1)]


# ---------------------------------------------------------------------------
# LPS generators for p = 5
# ---------------------------------------------------------------------------

# The six norm-5 quaternions, paired so that GEN[i] and GEN[i^1] are conjugate.
GEN = [
    Quat(1, 2, 0, 0),   # 0: 1+2i  = x
    Quat(1, -2, 0, 0),  # 1: 1-2i  = x^{-1}
    Quat(1, 0, 2, 0),   # 2: 1+2j  = y
    Quat(1, 0, -2, 0),  # 3: 1-2j  = y^{-1}
    Quat(1, 0, 0, 2),   # 4: 1+2k  = z
    Quat(1, 0, 0, -2),  # 5: 1-2k  = z^{-1}
]
GEN_CONJ = [g.conj() for g in GEN]
# letters for the free group F_3 = <x,y,z>
LETTER = ["x", "X", "y", "Y", "z", "Z"]
INV = [1, 0, 3, 2, 5, 4]  # index of the inverse generator


def divisible_by_5(q):
    return all(int(v) % 5 == 0 for v in q.c)


def lps_factor(q):
    """Factor a primitive quaternion q of norm 5^k.

    Returns (unit, word) where `word` is the list of generator indices
    i_1..i_k (reduced, no i followed by INV[i]) such that, projectively,

        q  ~  GEN[i_1] * GEN[i_2] * ... * GEN[i_k]

    and `unit` in UNITS is the leftover torsion (a Lipschitz unit).
    The free-group element is read off from `word` via LETTER.
    """
    n = int(q.norm())
    # strip any square content already handled by caller; here q must be primitive
    # determine k from the 5-part of the norm
    k = 0
    m = n
    while m % 5 == 0:
        m //= 5
        k += 1
    assert m == 1, f"norm {n} is not a power of 5 (primitive form required)"

    cur = q
    word_rev = []
    for _ in range(k):
        found = None
        for i, g in enumerate(GEN):
            prod = cur * GEN_CONJ[i]            # norm 5^{step+1}
            if divisible_by_5(prod):
                # this generator divides on the right; reduced choice is unique
                # avoid immediate backtrack with previous letter
                if word_rev and i == INV[word_rev[-1]]:
                    continue
                found = (i, Quat(*(int(v) // 5 for v in prod.c)))
                break
        if found is None:
            # fall back: allow the backtracking generator (only at the very start)
            for i, g in enumerate(GEN):
                prod = cur * GEN_CONJ[i]
                if divisible_by_5(prod):
                    found = (i, Quat(*(int(v) // 5 for v in prod.c)))
                    break
        assert found is not None, f"no LPS divisor for {cur!r}"
        i, nxt = found
        word_rev.append(i)
        cur = nxt.primitive()

    # cur now has norm 1: a unit
    unit = cur.canonical() if int(cur.norm()) == 1 else cur
    word = list(reversed(word_rev))
    return unit, word


def word_str(word):
    return "".join(LETTER[i] for i in word) or "1"
