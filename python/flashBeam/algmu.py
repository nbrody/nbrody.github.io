"""Shared support for algebraic mu in the Lyndon-Ullman searches.

Mu(spec) accepts:
  - a rational:              "3/2", "-1/2"
  - a sympy expression:      "sqrt(2)", "sqrt(3)/2", "(1+sqrt(5))/2"
  - an integer polynomial in x, meaning an abstract root of it:
                             "x^3+x^2-2x-1"   (2cos(2pi/7))

Internally mu = beta/m, where beta = m*mu is an algebraic integer (m = the
leading coefficient of mu's primitive integer minimal polynomial) with
monic integer minimal polynomial g of degree d. beta is represented by the
d x d companion matrix C of g, so 2x2 matrices over Q(mu) become 2d x 2d
integer matrices; each generator letter carries one factor of m, which is
divided back out by canonicalizing with the primes of m.

Working mod the minimal polynomial means a discovered relation holds at
EVERY conjugate of mu simultaneously. Consequently, if any conjugate sigma
has |sigma(mu)| >= 2, the group there is free (Sanov) and no relation can
exist -- such specs are negative controls (`sanov_blocked`).
"""
import math
from fractions import Fraction

from flint import fmpz, fmpz_mat


class Mu:
    def __init__(self, spec):
        spec = str(spec).strip()
        self.spec = spec
        if self._try_rational(spec):
            pass
        else:
            self._parse_algebraic(spec)
        if not self.b or self.b[-1] == 0:
            raise ValueError(f"mu must be nonzero (got {spec})")
        self.primes = self._primes_of(self.m)
        self.sanov_blocked = any(abs(c) >= 2 - 1e-9 for c in self.conjugates)

    # ---------- parsing ----------

    def _try_rational(self, spec):
        try:
            f = Fraction(spec)
        except (ValueError, ZeroDivisionError):
            return False
        self.d = 1
        self.m = f.denominator
        self.b = [-f.numerator]          # g(y) = y - p
        self.pretty = str(f)
        self.conjugates = [complex(f)]
        return True

    def _parse_algebraic(self, spec):
        import sympy
        from sympy.parsing.sympy_parser import (
            parse_expr, standard_transformations,
            implicit_multiplication_application, convert_xor)
        transforms = standard_transformations + (
            implicit_multiplication_application, convert_xor)
        x = sympy.symbols("x")
        parsed = parse_expr(spec, transformations=transforms,
                            local_dict={"x": x})
        if parsed.has(x):
            poly = sympy.Poly(parsed, x)
            self.pretty = f"root({sympy.sstr(poly.as_expr())})"
        else:
            poly = sympy.Poly(sympy.minimal_polynomial(parsed, x), x)
            self.pretty = sympy.sstr(parsed)
        if not all(c.is_integer for c in poly.all_coeffs()):
            raise ValueError(f"minimal polynomial not integral: {poly}")
        if not poly.is_irreducible:
            raise ValueError(f"polynomial is not irreducible: {poly}")

        coeffs = [int(c) for c in poly.all_coeffs()]   # leading first
        if coeffs[0] < 0:
            coeffs = [-c for c in coeffs]
        a = coeffs[0]
        self.d = len(coeffs) - 1
        self.m = a
        # beta = a*mu has monic integer min poly y^d + sum a_k a^(k-1) y^(d-k)
        self.b = [coeffs[k] * a ** (k - 1) for k in range(1, self.d + 1)]
        self.conjugates = [complex(r) for r in poly.nroots()]

    @staticmethod
    def _primes_of(n):
        n = abs(int(n))
        out = set()
        p = 2
        while p * p <= n:
            if n % p == 0:
                out.add(p)
                while n % p == 0:
                    n //= p
            p += 1
        if n > 1:
            out.add(n)
        return out

    # ---------- matrices ----------

    def companion(self):
        """d x d integer companion matrix of g (multiplication by beta)."""
        d = self.d
        rows = [[0] * d for _ in range(d)]
        for j in range(d - 1):
            rows[j + 1][j] = 1
        for i in range(d):
            rows[i][d - 1] = -self.b[d - 1 - i]
        return rows

    def matrices(self):
        """Scaled generators as 2d x 2d fmpz_mat: a=[[m,mu],[0,m]] etc."""
        d, m = self.d, self.m
        C = self.companion()
        mI = [[m if i == j else 0 for j in range(d)] for i in range(d)]
        Z = [[0] * d for _ in range(d)]
        nC = [[-v for v in row] for row in C]

        def block(tl, tr, bl, br):
            ents = []
            for i in range(2 * d):
                for j in range(2 * d):
                    src = (tl if i < d and j < d else
                           tr if i < d else
                           bl if j < d else br)
                    ents.append(src[i % d][j % d])
            return fmpz_mat(2 * d, 2 * d, ents)

        I_d = [[1 if i == j else 0 for j in range(d)] for i in range(d)]
        return {
            "a": block(mI, C, Z, mI),
            "b": block(mI, Z, C, mI),
            "ai": block(mI, nC, Z, mI),
            "bi": block(mI, Z, nC, mI),
            "I": block(I_d, Z, Z, I_d),
        }

    def describe(self):
        conj = ", ".join(f"{c.real:+.3f}{c.imag:+.3f}i" if abs(c.imag) > 1e-9
                         else f"{c.real:+.3f}" for c in self.conjugates)
        lines = [f"mu = {self.pretty}  (degree {self.d}, scale m = {self.m})",
                 f"conjugates: {conj}"]
        if self.sanov_blocked:
            lines.append("NOTE: some conjugate has |mu| >= 2 -> free by "
                         "Sanov there; NO relation can exist for this spec.")
        return "\n".join(lines)
