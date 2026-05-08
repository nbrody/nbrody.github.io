# Golg

This is a Lean 4 / Mathlib project for the conjectural trichotomy:

Let `k` be a number field and let `G` be a `k`-simple algebraic group. Every
subgroup `H ≤ G(k)` is at least one of:

1. **Algebraic**: `H` is not `ℚ`-Zariski dense in `Res_{k/ℚ}(G)`.
2. **Geometric**: for some valuation `v` of `k`, `H` is discrete in `G(k_v)`.
3. **Arithmetic**: for some subring `A ≤ k`, `H` is commensurable with `G(A)`.

## Setup

From this directory:

```sh
lake update
lake exe cache get
lake build
```

## Current Formalization Strategy

The first Lean files keep the full algebraic geometry abstract while making the
logical shape of the conjecture precise.

* `Golg.Basic` defines an abstract algebraic group over a number field, rational
  points, local points, arithmetic models, and the three predicates.
* `Golg.MainConjecture.Statement` packages the trichotomy as a `Prop`.
* `Golg.Roadmap` records the next mathematical APIs that should replace the
  abstract placeholders.

The intent is to refine each placeholder as Mathlib support for algebraic groups,
restriction of scalars, valuations, completions, and integral models becomes clear.
