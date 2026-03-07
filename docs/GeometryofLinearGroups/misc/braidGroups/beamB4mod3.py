#!/usr/bin/env python3

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Tuple, Dict, List
from flint import nmod_poly
import time

MOD = 3

# ============================================================
# Laurent polynomials over F_3[t, t^{-1}]
# stored as t^shift * poly(t), poly in ascending coefficients
# ============================================================

def _trim(coeffs: List[int]) -> List[int]:
    coeffs = [c % MOD for c in coeffs]
    while coeffs and coeffs[-1] == 0:
        coeffs.pop()
    return coeffs


@dataclass(frozen=True)
class Laurent:
    shift: int
    coeffs: Tuple[int, ...]

    @staticmethod
    def zero() -> "Laurent":
        return Laurent(0, ())

    @staticmethod
    def one() -> "Laurent":
        return Laurent(0, (1,))

    @staticmethod
    def monomial(exp: int, coeff: int = 1) -> "Laurent":
        coeff %= MOD
        if coeff == 0:
            return Laurent.zero()
        return Laurent(exp, (coeff,))

    @staticmethod
    def make(coeffs: List[int], shift: int = 0) -> "Laurent":
        coeffs = _trim(coeffs)
        if not coeffs:
            return Laurent.zero()
        i = 0
        while i < len(coeffs) and coeffs[i] == 0:
            i += 1
        if i == len(coeffs):
            return Laurent.zero()
        if i:
            coeffs = coeffs[i:]
            shift += i
        return Laurent(shift, tuple(coeffs))

    def is_zero(self) -> bool:
        return len(self.coeffs) == 0

    def __neg__(self) -> "Laurent":
        if self.is_zero():
            return self
        return Laurent(self.shift, tuple((-c) % MOD for c in self.coeffs))

    def __add__(self, other: "Laurent") -> "Laurent":
        if self.is_zero():
            return other
        if other.is_zero():
            return self
        lo = min(self.shift, other.shift)
        hi = max(self.shift + len(self.coeffs), other.shift + len(other.coeffs))
        out = [0] * (hi - lo)
        for i, c in enumerate(self.coeffs):
            out[self.shift - lo + i] = (out[self.shift - lo + i] + c) % MOD
        for i, c in enumerate(other.coeffs):
            out[other.shift - lo + i] = (out[other.shift - lo + i] + c) % MOD
        return Laurent.make(out, lo)

    def __sub__(self, other: "Laurent") -> "Laurent":
        return self + (-other)

    def __mul__(self, other: "Laurent") -> "Laurent":
        if self.is_zero() or other.is_zero():
            return Laurent.zero()
        p = nmod_poly(list(self.coeffs), MOD)
        q = nmod_poly(list(other.coeffs), MOD)
        r = p * q
        return Laurent.make([int(c) % MOD for c in r], self.shift + other.shift)

    def support_size(self) -> int:
        return len(self.coeffs)

    def degree_span(self) -> int:
        return max(0, len(self.coeffs) - 1)

    def min_exp(self):
        return None if self.is_zero() else self.shift

    def max_exp(self):
        return None if self.is_zero() else self.shift + len(self.coeffs) - 1

    def eval_mod3(self, a: int) -> int:
        if self.is_zero():
            return 0
        s = 0
        for i, c in enumerate(self.coeffs):
            e = self.shift + i
            s = (s + c * pow(a, e, MOD)) % MOD
        return s

    def key(self):
        return (self.shift, self.coeffs)

    def __str__(self) -> str:
        if self.is_zero():
            return "0"
        terms = []
        for i, c in enumerate(self.coeffs):
            if c == 0:
                continue
            e = self.shift + i
            if e == 0:
                mon = ""
            elif e == 1:
                mon = "t"
            else:
                mon = f"t^{e}"

            if c == 1:
                term = mon or "1"
            elif c == 2:
                term = f"2*{mon}" if mon else "2"
            else:
                term = f"{c}*{mon}" if mon else str(c)
            terms.append(term)
        return " + ".join(terms)


Z = Laurent.zero()
O = Laurent.one()
T = Laurent.monomial(1, 1)
Tm1 = Laurent.monomial(-1, 1)
NEG_T = Laurent.monomial(1, 2)      # -t mod 3
NEG_Tm1 = Laurent.monomial(-1, 2)   # -t^{-1} mod 3

Matrix = Tuple[
    Tuple[Laurent, Laurent, Laurent],
    Tuple[Laurent, Laurent, Laurent],
    Tuple[Laurent, Laurent, Laurent],
]


def mat_identity() -> Matrix:
    return (
        (O, Z, Z),
        (Z, O, Z),
        (Z, Z, O),
    )


def mat_mul(A: Matrix, B: Matrix) -> Matrix:
    out = []
    for i in range(3):
        row = []
        for j in range(3):
            s = Z
            for k in range(3):
                s = s + A[i][k] * B[k][j]
            row.append(s)
        out.append(tuple(row))
    return tuple(out)  # type: ignore


def mat_eq(A: Matrix, B: Matrix) -> bool:
    return all(A[i][j] == B[i][j] for i in range(3) for j in range(3))


def mat_key(A: Matrix):
    return tuple(A[i][j].key() for i in range(3) for j in range(3))


def pretty_matrix(A: Matrix) -> str:
    return "\n".join(
        "[ " + " , ".join(str(x) for x in row) + " ]"
        for row in A
    )


# ============================================================
# Reduced Burau generators for B4
#
# sigma1 = [[-t, 1, 0],
#           [ 0, 1, 0],
#           [ 0, 0, 1]]
#
# sigma2 = [[1, 0, 0],
#           [t,-t, 1],
#           [0, 0, 1]]
#
# sigma3 = [[1, 0, 0],
#           [0, 1, 0],
#           [0, t,-t]]
# ============================================================

I3 = mat_identity()

s1: Matrix = (
    (NEG_T, O, Z),
    (Z,     O, Z),
    (Z,     Z, O),
)

s1i: Matrix = (
    (NEG_Tm1, Tm1, Z),
    (Z,       O,   Z),
    (Z,       Z,   O),
)

s2: Matrix = (
    (O, Z,     Z),
    (T, NEG_T, O),
    (Z, Z,     O),
)

s2i: Matrix = (
    (O, Z,       Z),
    (O, NEG_Tm1, Tm1),
    (Z, Z,       O),
)

s3: Matrix = (
    (O, Z, Z),
    (Z, O, Z),
    (Z, T, NEG_T),
)

s3i: Matrix = (
    (O, Z, Z),
    (Z, O, Z),
    (Z, O, NEG_Tm1),
)

def check_burau():
    I = mat_identity()
    assert mat_eq(mat_mul(s1, s1i), I) and mat_eq(mat_mul(s1i, s1), I)
    assert mat_eq(mat_mul(s2, s2i), I) and mat_eq(mat_mul(s2i, s2), I)
    assert mat_eq(mat_mul(s3, s3i), I) and mat_eq(mat_mul(s3i, s3), I)

    # braid relations
    assert mat_eq(mat_mul(mat_mul(s1, s2), s1), mat_mul(mat_mul(s2, s1), s2))
    assert mat_eq(mat_mul(mat_mul(s2, s3), s2), mat_mul(mat_mul(s3, s2), s3))
    assert mat_eq(mat_mul(s1, s3), mat_mul(s3, s1))


# ============================================================
# Birman subgroup generators
# x = s1 s3^{-1}
# y = s2 s3 s1^{-1} s2^{-1}
# ============================================================

x  = mat_mul(s1, s3i)
xi = mat_mul(s3, s1i)

y  = mat_mul(mat_mul(mat_mul(s2, s3), s1i), s2i)
yi = mat_mul(mat_mul(mat_mul(s2, s1), s3i), s2i)

def check_birman():
    I = mat_identity()
    assert mat_eq(mat_mul(x, xi), I) and mat_eq(mat_mul(xi, x), I)
    assert mat_eq(mat_mul(y, yi), I) and mat_eq(mat_mul(yi, y), I)


GENS = {
    "x": x,
    "X": xi,
    "y": y,
    "Y": yi,
}
INV = {
    "x": "X",
    "X": "x",
    "y": "Y",
    "Y": "y",
}


# ============================================================
# Heuristic score
# ============================================================

def mat_defect(A: Matrix) -> int:
    I = mat_identity()
    score = 0
    for i in range(3):
        for j in range(3):
            D = A[i][j] - I[i][j]
            if D.is_zero():
                continue
            score += 5 * D.support_size()
            score += D.degree_span()
            score += abs(D.min_exp() or 0)
            score += abs(D.max_exp() or 0)
            score += 0 if i == j else 3

            # cheap specializations t=1,2 in F3 for extra guidance
            for a in (1, 2):
                if D.eval_mod3(a) != 0:
                    score += 2
    return score


@dataclass(order=True)
class State:
    score: int
    length: int
    word: str = field(compare=False)
    mat: Matrix = field(compare=False)


def freely_reduced_extensions(word: str):
    if not word:
        return list("xXyY")
    bad = INV[word[-1]]
    return [g for g in "xXyY" if g != bad]


def beam_search(max_len: int = 100, beam_width: int = 10000, report_every: int = 4):
    I = mat_identity()
    layer = [State(0, 0, "", I)]
    hits = []
    start = time.time()

    for depth in range(1, max_len + 1):
        best: Dict[Tuple, State] = {}

        for st in layer:
            for g in freely_reduced_extensions(st.word):
                M = mat_mul(st.mat, GENS[g])
                w = st.word + g
                sc = mat_defect(M)
                nxt = State(sc, depth, w, M)

                if w and mat_eq(M, I):
                    hits.append(nxt)

                k = mat_key(M)
                prev = best.get(k)
                if prev is None or sc < prev.score:
                    best[k] = nxt

        layer = sorted(best.values())[:beam_width]

        if report_every and depth % report_every == 0:
            print(
                f"depth={depth:3d}  beam={len(layer):5d}  "
                f"best_score={layer[0].score if layer else None}  "
                f"elapsed={time.time() - start:.2f}s"
            )

        if hits:
            break

    return hits, layer


def burau_image_of_word(word: str) -> Matrix:
    M = mat_identity()
    for ch in word:
        M = mat_mul(M, GENS[ch])
    return M


if __name__ == "__main__":
    check_burau()
    check_birman()

    hits, layer = beam_search(max_len=100, beam_width=10000, report_every=4)

    print()
    if hits:
        print("Kernel hits found:")
        for h in hits:
            print("=" * 72)
            print("word :", h.word)
            print("score:", h.score)
            print(pretty_matrix(h.mat))
    else:
        print("No nontrivial kernel element found up to the search bound.")
        if layer:
            print("Best candidate word:", layer[0].word)
            print("Best score:", layer[0].score)
            print("Its Burau image:")
            print(pretty_matrix(layer[0].mat))