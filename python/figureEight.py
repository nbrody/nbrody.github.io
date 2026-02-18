#!/usr/bin/env python3
"""
Beam search to probe faithfulness of the SL_2(Z[φ]) representation
of the figure-eight knot group.

  G = ⟨a, b | a b a⁻¹ b a = b a b⁻¹ a b⟩

  a = ⎛φ  1⎞      b = ⎛φ  0⎞
      ⎝0  φ̄⎠          ⎝1  φ̄⎠

  where  φ = (1+√5)/2,  φ̄ = 1/φ = φ−1  (both in Z[φ])

Strategy
--------
  Represent Z[φ] via pairs of flint.fmpz integers (a, b) ↔ a + b·φ.
  Maintain a beam of (word, 2×2 matrix) states.
  Score each state by the Frobenius distance² of its matrix from ±I,
  using the real embedding φ ↦ 1.6180…
  Prune to beam_width survivors each depth level.
  Report any word whose matrix IS ±I (a relation in the image group).
  Such relations must then be checked against the knot group relation
  to decide if they reveal unfaithfulness.

Usage
-----
  python fig8_beam_search.py [--depth D] [--beam B] [--quiet]
"""

import sys
import argparse
from dataclasses import dataclass, field
from typing import List, Tuple, Optional

# ── flint imports ─────────────────────────────────────────────────────────────
from flint import fmpz

# real value of φ for scoring
PHI_REAL: float = (1.0 + 5.0**0.5) / 2.0    # ≈ 1.61803398875


# ══════════════════════════════════════════════════════════════════════════════
# Z[φ] arithmetic
# φ satisfies φ² = φ + 1  ⟹  (a+bφ)(c+dφ) = (ac+bd) + (ad+bc+bd)φ
# ══════════════════════════════════════════════════════════════════════════════

class ZPhi:
    """
    Element of Z[φ] stored as a pair of flint.fmpz integers.
    Represents  a + b·φ.
    """
    __slots__ = ('a', 'b')

    def __init__(self, a, b=0):
        self.a = fmpz(int(a))
        self.b = fmpz(int(b))

    # arithmetic
    def __add__(self, o):  return ZPhi(self.a + o.a, self.b + o.b)
    def __sub__(self, o):  return ZPhi(self.a - o.a, self.b - o.b)
    def __neg__(self):     return ZPhi(-self.a, -self.b)

    def __mul__(self, o):
        a, b, c, d = self.a, self.b, o.a, o.b
        # φ² = φ+1  →  b·d·φ² = b·d + b·d·φ
        return ZPhi(a*c + b*d, a*d + b*c + b*d)

    # predicates
    def is_zero(self): return int(self.a) == 0 and int(self.b) == 0
    def is_one(self):  return int(self.a) == 1 and int(self.b) == 0
    def is_neg_one(self): return int(self.a) == -1 and int(self.b) == 0

    def __eq__(self, o): return int(self.a) == int(o.a) and int(self.b) == int(o.b)
    def __hash__(self):  return hash((int(self.a), int(self.b)))

    def real_value(self) -> float:
        """Real embedding a + b·φ ∈ ℝ."""
        return int(self.a) + int(self.b) * PHI_REAL

    def size(self) -> int:
        """Max absolute integer coefficient – used to detect coefficient blowup."""
        return max(abs(int(self.a)), abs(int(self.b)))

    def __repr__(self):
        a, b = int(self.a), int(self.b)
        if b == 0:  return str(a)
        if a == 0:  return f"{b}φ"
        sign = '+' if b > 0 else '-'
        return f"{a} {sign} {abs(b)}φ"

    def __format__(self, format_spec):
        return format(str(self), format_spec)


# handy constants
_0 = ZPhi(0, 0)
_1 = ZPhi(1, 0)
_PHI  = ZPhi(0, 1)    # φ
_IPHI = ZPhi(-1, 1)   # 1/φ = φ − 1


# ══════════════════════════════════════════════════════════════════════════════
# 2×2 matrices over Z[φ]
# ══════════════════════════════════════════════════════════════════════════════

class Mat2:
    """2×2 matrix with Z[φ] entries stored row-major."""
    __slots__ = ('e',)          # e = [a00, a01, a10, a11]

    def __init__(self, a00, a01, a10, a11):
        self.e = [a00, a01, a10, a11]

    # index helpers
    @property
    def _00(self): return self.e[0]
    @property
    def _01(self): return self.e[1]
    @property
    def _10(self): return self.e[2]
    @property
    def _11(self): return self.e[3]

    def __mul__(self, o):
        a, b = self.e, o.e
        return Mat2(
            a[0]*b[0] + a[1]*b[2],   a[0]*b[1] + a[1]*b[3],
            a[2]*b[0] + a[3]*b[2],   a[2]*b[1] + a[3]*b[3],
        )

    def __eq__(self, o):
        return all(self.e[i] == o.e[i] for i in range(4))

    # identity / ±I checks
    def is_identity(self):
        return (self.e[0].is_one()  and self.e[1].is_zero() and
                self.e[2].is_zero() and self.e[3].is_one())

    def is_neg_identity(self):
        return (self.e[0].is_neg_one() and self.e[1].is_zero() and
                self.e[2].is_zero()    and self.e[3].is_neg_one())

    # SL_2 inverse: [[d,-b],[-c,a]]
    def inverse(self):
        return Mat2(self.e[3], -self.e[1], -self.e[2], self.e[0])

    # ── scoring ───────────────────────────────────────────────────────────────

    def dist_from_id_sq(self) -> float:
        """Frobenius distance² from +I in the real embedding."""
        total = 0.0
        targets = [1.0, 0.0, 0.0, 1.0]
        for i, (entry, t) in enumerate(zip(self.e, targets)):
            diff = entry.real_value() - t
            total += diff * diff
        return total

    def dist_from_neg_id_sq(self) -> float:
        """Frobenius distance² from −I in the real embedding."""
        total = 0.0
        targets = [-1.0, 0.0, 0.0, -1.0]
        for i, (entry, t) in enumerate(zip(self.e, targets)):
            diff = entry.real_value() - t
            total += diff * diff
        return total

    def beam_score(self) -> float:
        """Lower = closer to ±I = more promising for finding relations."""
        return min(self.dist_from_id_sq(), self.dist_from_neg_id_sq())

    def max_coeff_size(self) -> int:
        """Largest |coefficient| across all entries – monitors blowup."""
        return max(e.size() for e in self.e)

    def frobenius_norm_sq(self) -> float:
        """||M||_F² in real embedding – for display."""
        return sum(e.real_value()**2 for e in self.e)

    def __repr__(self):
        return (f"⎛{self.e[0]:>12}  {self.e[1]:>12}⎞\n"
                f"⎝{self.e[2]:>12}  {self.e[3]:>12}⎠")


# ══════════════════════════════════════════════════════════════════════════════
# Generator matrices for the figure-eight knot group representation
# ══════════════════════════════════════════════════════════════════════════════

A  = Mat2(_PHI, _1,  _0,   _IPHI)   # a
B  = Mat2(_IPHI, _0,  _1,   _PHI)   # b
Ai = A.inverse()                      # a⁻¹
Bi = B.inverse()                      # b⁻¹

GENERATORS = [('a', A), ('A', Ai), ('b', B), ('B', Bi)]

# cancellation pairs (free reduction)
CANCELS = {('a','A'), ('A','a'), ('b','B'), ('B','b')}


# ══════════════════════════════════════════════════════════════════════════════
# Verification helpers
# ══════════════════════════════════════════════════════════════════════════════

def verify_sl2():
    """Check determinant = 1 for generators (in Z[φ] arithmetic)."""
    ok = True
    for name, M in [('a', A), ('b', B)]:
        det = M.e[0]*M.e[3] - M.e[1]*M.e[2]
        if not det.is_one():
            print(f"  ERROR: det({name}) = {det}  ≠ 1")
            ok = False
        else:
            print(f"  det({name}) = 1  ✓")
    return ok


def verify_fig8_relation():
    """
    Figure-eight knot relation:  a b a⁻¹ b a = b a b⁻¹ a b
    This is the standard Wirtinger-derived presentation.
    """
    lhs = A  * B  * Ai * B  * A
    rhs = B  * A  * Bi * A  * B
    ok = (lhs == rhs)
    rel = "a·b·a⁻¹·b·a  =  b·a·b⁻¹·a·b"
    print(f"  {rel}  :  {'✓ satisfied' if ok else '✗ VIOLATED'}")
    if not ok:
        print(f"    LHS =\n{lhs}")
        print(f"    RHS =\n{rhs}")
    return ok


# ══════════════════════════════════════════════════════════════════════════════
# Beam search
# ══════════════════════════════════════════════════════════════════════════════

@dataclass(order=True)
class State:
    score: float
    word:  str       = field(compare=False)
    mat:   Mat2      = field(compare=False)


def beam_search(
    max_depth:  int  = 18,
    beam_width: int  = 600,
    verbose:    bool = True,
    size_limit: int  = 10_000,      # drop states with coefficients this large
) -> Tuple[List[Tuple[str, str]], List[State]]:
    """
    Explore words in {a, b, a⁻¹, b⁻¹}* via beam search, scoring by
    Frobenius distance² from ±I.

    Returns
    -------
    relations : list of (word, type) where type ∈ {'=I', '=-I'}
    beam      : final beam (useful for post-analysis)
    """

    print("\n" + "═"*62)
    print("  Verifying generator / relation setup")
    print("═"*62)
    sl2_ok  = verify_sl2()
    rel_ok  = verify_fig8_relation()
    if not (sl2_ok and rel_ok):
        print("\nSetup check failed – aborting.")
        sys.exit(1)

    print(f"\n  Generators:\n"
          f"    a  =  [[φ, 1],  [0, φ̄]]   where φ = (1+√5)/2, φ̄ = 1/φ = φ-1\n"
          f"    b  =  [[φ, 0],  [1, φ̄]]\n")

    print("═"*62)
    print(f"  Beam search   depth={max_depth}   width={beam_width}")
    print("═"*62)

    relations: List[Tuple[str, str]] = []

    # Initialise beam with single-letter words
    beam: List[State] = []
    for name, mat in GENERATORS:
        beam.append(State(score=mat.beam_score(), word=name, mat=mat))
    beam.sort()

    for depth in range(2, max_depth + 1):
        if verbose:
            best = beam[0]
            print(f"  depth {depth:2d}  |  beam {len(beam):5d}  |  "
                  f"best score {best.score:10.4f}  |  '{best.word}'")

        candidates: List[State] = []

        for state in beam:
            for gen_name, gen_mat in GENERATORS:
                # free reduction
                if state.word and (state.word[-1], gen_name) in CANCELS:
                    continue

                new_mat  = state.mat * gen_mat
                new_word = state.word + gen_name

                # coefficient blowup guard (keeps beam tractable)
                if new_mat.max_coeff_size() > size_limit:
                    continue

                # ── check for relations ────────────────────────────────────
                if new_mat.is_identity():
                    entry = (new_word, '=I')
                    if entry not in relations:
                        relations.append(entry)
                        print(f"\n  *** RELATION  {new_word} = I  ***\n")

                elif new_mat.is_neg_identity():
                    entry = (new_word, '=-I')
                    if entry not in relations:
                        relations.append(entry)
                        print(f"\n  *** RELATION  {new_word} = -I  ***\n")

                s = new_mat.beam_score()
                candidates.append(State(score=s, word=new_word, mat=new_mat))

        if not candidates:
            print("  (beam exhausted – no valid extensions)")
            break

        candidates.sort()
        beam = candidates[:beam_width]

    return relations, beam


# ══════════════════════════════════════════════════════════════════════════════
# Report
# ══════════════════════════════════════════════════════════════════════════════

def report(relations: List[Tuple[str, str]], beam: List[State], max_depth: int):
    print("\n" + "═"*62)
    print("  RESULTS")
    print("═"*62)

    if relations:
        print(f"\n  Relations found ({len(relations)}):\n")
        for word, kind in relations:
            print(f"    {word}  →  {kind}")
        print(f"""
  ─────────────────────────────────────────────────────────
  Next step: check whether each relation word equals 1 in G.
  If  w = I  in SL_2(Z[φ])  but  w ≠ 1  in G,
  then the representation is NOT faithful.

  The figure-eight knot group is known to be torsion-free,
  so  w = -I  always implies w ≠ 1 in G (since -I has order 2).
  Any word found with image -I is therefore a genuine kernel element.
  ─────────────────────────────────────────────────────────
""")
    else:
        print(f"\n  No relations found up to depth {max_depth}.")
        print(f"  This is positive evidence (not a proof) that the")
        print(f"  representation is faithful on words of this length.\n")

    print("  Top 10 beam states by proximity to ±I:")
    print(f"  {'Score':>12}  {'MaxCoeff':>10}  Word")
    print(f"  {'-'*48}")
    for st in beam[:10]:
        mc = st.mat.max_coeff_size()
        print(f"  {st.score:12.4f}  {mc:>10}  {st.word}")


# ══════════════════════════════════════════════════════════════════════════════
# Entry point
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Beam search for faithfulness of fig-8 knot rep in SL_2(Z[φ])"
    )
    parser.add_argument('--depth', type=int, default=16,
                        help='Maximum word length to search (default 16)')
    parser.add_argument('--beam',  type=int, default=600,
                        help='Beam width (default 600)')
    parser.add_argument('--quiet', action='store_true',
                        help='Suppress per-depth progress')
    args = parser.parse_args()

    relations, beam = beam_search(
        max_depth=args.depth,
        beam_width=args.beam,
        verbose=not args.quiet,
    )
    report(relations, beam, args.depth)


if __name__ == '__main__':
    main()