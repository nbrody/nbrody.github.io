import Golg.Basic

/-!
# Statement of the Golg Conjecture

This module packages the trichotomy as a Lean proposition.
-/

universe u v w

namespace Golg.MainConjecture

open Golg

variable {k : Type u} [Field k] [NumberField k]

/-- The main conjecture for a fixed `k`-simple algebraic group `G`.

The predicate `resQZariskiDense` stands for `ℚ`-Zariski density in
`Res_{k/ℚ}(G)`, while `M` supplies the arithmetic subgroups `G(A)`.
-/
def Statement
    (G : AlgebraicGroup.{u, v} k)
    (_hG : G.IsKSimple)
    (resQZariskiDense : Subgroup G.Points → Prop)
    (M : ArithmeticModel G) : Prop :=
  ∀ H : Subgroup G.Points, IsClassified.{u, w, v} resQZariskiDense M H

/-- A small smoke test showing the statement is an ordinary proposition. -/
def statementAsProp
    (G : AlgebraicGroup.{u, v} k)
    (hG : G.IsKSimple)
    (resQZariskiDense : Subgroup G.Points → Prop)
    (M : ArithmeticModel G) :
    Prop :=
  Statement.{u, v, w} G hG resQZariskiDense M

end Golg.MainConjecture
