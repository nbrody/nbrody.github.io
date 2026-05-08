import Golg.MainConjecture.Statement

/-!
# Formalization Roadmap

The conjecture is currently stated through a deliberately small interface. The
next milestones are to replace these abstract pieces with canonical Mathlib
objects as they become available.

## Target replacements

* Replace `AlgebraicGroup` with an algebraic-group scheme or a concrete linear
  algebraic group over a number field.
* Define `ℚ`-Zariski density in `Res_{k/ℚ}(G)` rather than passing it as a
  predicate.
* Replace `LocalPoints` with completions `k_v` attached to valuations of `k`.
* Replace `ArithmeticModel.integralPoints` with the actual subgroups `G(A)`.
* Add invariance lemmas: commensurability invariance for arithmeticity, and
  compatibility of discreteness with finite-index changes.
-/

namespace Golg

theorem roadmap_placeholder : True := by
  trivial

end Golg
