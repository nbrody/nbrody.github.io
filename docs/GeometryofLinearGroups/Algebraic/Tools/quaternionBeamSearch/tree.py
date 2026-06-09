"""
Bruhat-Tits tree of PGL_2(Q_p) seen through the splitting H (x) Q_p = M_2(Q_p),
for a prime p with p = 1 mod 4 (so -1 is a square in Z_p and the Hamilton
quaternion algebra splits at p).

A quaternion q maps to the matrix
        [[ w + x*s ,  y + z*s ],
         [ -y + z*s,  w - x*s ]]   over Z_p,    s^2 = -1,
whose determinant is the reduced norm N(q).  The vertex of the tree attached to
q is the homothety class of the lattice spanned by the columns of this matrix.

For a *primitive* integer quaternion the cokernel Z_p^2 / L is cyclic of order
p^n with n = v_p(N(q)) (= graph distance from the base vertex v0), and the vertex
is recorded canonically as a point of P^1(Z/p^n) (the kernel direction of the
matrix mod p^n).  v0 (n = 0) is the class of Z_p^2.
"""


def _sqrt_minus1(p, M):
    """A square root of -1 modulo p^M (Hensel lift), for p = 1 mod 4."""
    mod = p ** M
    # find a root mod p
    s0 = next(r for r in range(p) if (r * r + 1) % p == 0)
    s = s0
    cur = p
    while cur < mod:
        cur *= cur
        if cur > mod:
            cur = mod
        s = (s - (s * s + 1) * pow(2 * s, -1, cur)) % cur
    assert (s * s + 1) % mod == 0
    return s


class PrimeTree:
    """Vertex bookkeeping for the tree of PGL_2(Q_p)."""

    def __init__(self, p, precision=80):
        self.p = p
        self.M = precision
        self.mod = p ** precision
        self.s = _sqrt_minus1(p, precision)

    def vp(self, n):
        n = abs(int(n))
        d = 0
        while n and n % self.p == 0:
            n //= self.p
            d += 1
        return d

    def _mat(self, q):
        w, x, y, z = (int(v) for v in q.c)
        s, mod = self.s, self.mod
        return ((w + x * s) % mod, (y + z * s) % mod,
                (-y + z * s) % mod, (w - x * s) % mod)

    def vertex(self, q):
        """Canonical key of the tree vertex of (primitive) quaternion q."""
        p = self.p
        n = self.vp(int(q.norm()))
        if n == 0:
            return (0,)
        pn = p ** n
        a, b, c, d = (v % pn for v in self._mat(q))
        # left kernel f of the matrix mod p^n: (d,-b) or (-c,a)
        for al, be in ((d, (-b) % pn), ((-c) % pn, a)):
            if al % p != 0:
                return (n, 0, (be * pow(al, -1, pn)) % pn)
            if be % p != 0:
                return (n, 1, (al * pow(be, -1, pn)) % pn)
        return (n, -1, 0)  # unreachable for primitive q

    def distance(self, q):
        """Graph distance in the tree from v0 to vertex(q)."""
        return self.vp(int(q.primitive().norm()))
