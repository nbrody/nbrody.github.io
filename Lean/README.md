# Borel-Harish-Chandra in Lean

This is a Lean 4 / Mathlib project aimed at eventually formalizing the
Borel-Harish-Chandra theorem.

## Setup

From this directory:

```sh
lake update
lake exe cache get
lake build
```

`lake exe cache get` downloads prebuilt Mathlib `.olean` files, which is much faster
than building all of Mathlib locally.

## First Lean Exercises

Start in `BorelHarishChandra/Basic.lean`.

Useful early goals:

1. Change the examples and watch how Lean reports errors.
2. Use `#check` to inspect Mathlib names, for example:

   ```lean
   #check IsClosed
   #check isClosed_singleton
   #check Matrix.SpecialLinearGroup
   #check MeasureTheory.Measure
   ```

3. Keep theorem statements compiling with placeholders only when needed:

   ```lean
   theorem example_statement : True := by
     trivial
   ```

## Mathematical Plan

The full theorem is far beyond a first Lean file. A practical path is:

1. Learn Lean and Mathlib on tiny topology, algebra, and measure examples.
2. Formalize concrete matrix-group facts about `SL(n, R)`.
3. State arithmetic subgroups in a concrete setting such as `SL(n, ℤ) ≤ SL(n, ℝ)`.
4. Connect those statements to Haar measure and finite covolume.
5. Generalize toward algebraic groups over `ℚ`.

## Proof-Oriented Folder Structure

The `BorelHarishChandra` source folder is organized by proof ingredient:

```text
BorelHarishChandra/
  Prerequisites/
    Algebra.lean
    TopologyMeasure.lean
  AlgebraicGroups/
    LinearAlgebraicGroups.lean
    RationalCharacters.lean
    IntegralModels.lean
  ArithmeticSubgroups/
    IntegralPoints.lean
    Examples.lean
  LieGroups/
    RealPoints.lean
    HaarMeasure.lean
  ReductionTheory/
    SiegelSets.lean
    Finiteness.lean
  Lattices/
    Definitions.lean
    FiniteCovolume.lean
  MainTheorem/
    Statement.lean
```

Each file currently contains a short explanation and a compileable placeholder.
Replace placeholders with real definitions and lemmas as the relevant Mathlib APIs
become clear.
