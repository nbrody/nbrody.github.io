import Mathlib

/-!
# Basic Vocabulary for the Golg Conjecture

This file fixes a small, compileable interface for the conjecture while the full
Mathlib APIs for algebraic groups over number fields are still being identified.
-/

universe u v w

namespace Golg

/-- An abstract placeholder for a `k`-simple algebraic group over a field `k`.

The type `Points` represents the group of rational points `G(k)`. The proposition
`IsKSimple` records the intended `k`-simplicity hypothesis without choosing a
formal algebraic-group API yet.
-/
structure AlgebraicGroup (k : Type u) [Field k] where
  Points : Type v
  [pointsGroup : Group Points]
  IsKSimple : Prop

attribute [instance] AlgebraicGroup.pointsGroup

/-- Local points attached to a valuation of `k`.

The type `Points` is intended to become `G(k_v)`, and `toLocal` is the natural map
from rational points into local points.
-/
structure LocalPoints {k : Type u} [Field k] (G : AlgebraicGroup k) where
  Points : Type w
  [pointsGroup : Group Points]
  [pointsTopology : TopologicalSpace Points]
  toLocal : G.Points →* Points

attribute [instance] LocalPoints.pointsGroup LocalPoints.pointsTopology

/-- An abstract integral model for the subgroups `G(A) ≤ G(k)` as `A` ranges over
subrings of the number field.
-/
structure ArithmeticModel {k : Type u} [Field k] (G : AlgebraicGroup k) where
  integralPoints : Subring k → Subgroup G.Points

variable {k : Type u} [Field k] [NumberField k]
variable {G : AlgebraicGroup k}

/-- `H` is algebraic if it is not `ℚ`-Zariski dense in `Res_{k/ℚ}(G)`.

For now, the `ℚ`-Zariski density predicate is a parameter. Later this should be
replaced by the actual Zariski topology on the restriction of scalars.
-/
def IsAlgebraic (resQZariskiDense : Subgroup G.Points → Prop) (H : Subgroup G.Points) : Prop :=
  ¬ resQZariskiDense H

/-- `H` is geometric if it is discrete in the local points for at least one
valuation of `k`.
-/
def IsGeometric (H : Subgroup G.Points) : Prop :=
  ∃ V : LocalPoints.{u, v, w} G, DiscreteTopology (Subgroup.map V.toLocal H)

/-- `H` is arithmetic if it is commensurable with `G(A)` for some subring `A ≤ k`. -/
def IsArithmetic (M : ArithmeticModel G) (H : Subgroup G.Points) : Prop :=
  ∃ A : Subring k, Subgroup.Commensurable H (M.integralPoints A)

/-- The three alternatives appearing in the conjecture. -/
def IsClassified
    (resQZariskiDense : Subgroup G.Points → Prop)
    (M : ArithmeticModel G)
    (H : Subgroup G.Points) : Prop :=
  IsAlgebraic resQZariskiDense H ∨ IsGeometric.{u, v, w} H ∨ IsArithmetic M H

end Golg
