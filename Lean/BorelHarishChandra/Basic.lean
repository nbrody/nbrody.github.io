import Mathlib

/-!
# Borel-Harish-Chandra

This project is a sandbox for formalizing the Borel-Harish-Chandra theorem in Lean.

The classical statement says, roughly, that if `G` is a linear algebraic group over
`ℚ` with no non-trivial `ℚ`-characters, then the arithmetic subgroup `G(ℤ)` is a
lattice in the real Lie group `G(ℝ)`.

That final statement needs a substantial amount of infrastructure: algebraic
groups, rational characters, arithmetic subgroups, Haar measure, and finite-covolume
lattices in locally compact groups. The first useful Lean work is therefore to
stabilize the vocabulary and prove smaller lemmas against Mathlib's existing APIs.
-/

namespace BorelHarishChandra

/-!
## First smoke tests

These examples are intentionally tiny. They verify that Mathlib is available and give
you a place to experiment with Lean syntax before the project grows.
-/

example (n : ℕ) : n + 0 = n := by
  simp

example : IsClosed ({0} : Set ℝ) := by
  simp

end BorelHarishChandra
