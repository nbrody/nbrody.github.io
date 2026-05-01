import BorelHarishChandra.MainTheorem.Statement

/-!
# Formalization Roadmap

This file records the mathematical decomposition of the project. Early entries should
be replaced by precise definitions and lemmas as Mathlib support becomes clear.

## Target theorem, informal

Let `G` be a linear algebraic group over `ℚ`. If `G` has no non-trivial rational
characters, then `G(ℤ)` is a lattice in `G(ℝ)`.

## Module structure

* `Prerequisites`: algebra, topology, and measure theory background.
* `AlgebraicGroups`: linear algebraic groups, rational characters, and integral
  models.
* `ArithmeticSubgroups`: integral points and concrete examples like `SL(n, ℤ)`.
* `LieGroups`: real points and Haar measure.
* `ReductionTheory`: Siegel sets and the finiteness estimates they imply.
* `Lattices`: discrete subgroups and finite covolume.
* `MainTheorem`: the eventual formal Borel-Harish-Chandra statement.

## Suggested milestones

1. Work through Lean's theorem-proving workflow on small Mathlib examples.
2. Identify Mathlib's existing APIs for each module above.
3. Formalize a toy arithmetic subgroup, probably `SL(n, ℤ)` inside `SL(n, ℝ)`.
4. State and prove compactness or finite-volume lemmas in the available topology
   and measure theory language.
5. Promote the toy statements into the general Borel-Harish-Chandra vocabulary.

The theorem below is not the real target. It is a deliberately small placeholder that
keeps the file compiling while marking where project-level statements can go.
-/

namespace BorelHarishChandra

theorem roadmap_placeholder : True := by
  trivial

end BorelHarishChandra
