# Transitivity Calculator for Matrix Groups on ℚℙ¹

## Overview

This tool proves that a finitely generated matrix group acts with **finitely many orbits** on the projective line ℚℙ¹, using the **height reduction method**.

## How It Works

### Height Function

For a point [p:q] ∈ ℚℙ¹ with gcd(p,q) = 1, the **height** is:

```
h([p:q]) = max(|p|, |q|)
```

### Height Reduction Strategy

A matrix group Γ has finitely many orbits if:
1. We can partition ℚℙ¹ into finitely many regions X₁, X₂, ..., Xₙ
2. For each region Xᵢ, there exists a group element gᵢ ∈ Γ that reduces height for all sufficiently high points in Xᵢ

If we can find such a covering, then iterating the group action eventually brings every point into a bounded set, proving finitely many orbits.

## Determining Reduction Regions

### The General Question

For a matrix M = [[a,b],[c,d]] ∈ PGL₂(ℚ), when does M reduce the height of [p:q]?

**See REDUCTION_THEORY.md for detailed mathematical framework.**

### Key Concepts

**Archimedean (Real) Conditions:**
- Inequalities on the ratio p/q
- Examples: p/q < -1, p/q > 2, |p/q| > 5

**p-adic (Divisibility) Conditions:**
- Congruences modulo primes
- Examples: p ≡ 0 (mod 2), both p,q odd, v₃(p) ≥ 1

**Combined Conditions:**
- Often both types are needed
- Example: "p even AND |p/q| > 2"

### Implementation

The tool uses three strategies:

1. **Pattern Matching** (analyzeMatrixPrecise):
   - Recognizes common matrix structures
   - Upper/lower triangular with integer entries
   - Diagonal with fractions
   - Specific matrices that create systematic GCDs

2. **Systematic p-adic Testing**:
   - Tests congruence classes mod small primes (2, 3, 5)
   - Detects when matrix creates GCD factors
   - Identifies divisibility patterns

3. **Empirical Fallback**:
   - Samples many coprime points from standard regions
   - Determines which regions reduce empirically
   - Used when no closed form is found

## Examples

### Modular Group PSL₂(ℤ)

Generators: T = [[1,1],[0,1]] and S = [[0,-1],[1,0]]

**T:** Reduces on p/q < -1
**T⁻¹ = [[1,-1],[0,1]]:** Reduces on p/q > 1
**TS = [[1,-1],[1,0]]:** Reduces on 0 ≤ p/q < 1

Together these cover all of ℚℙ¹ except finitely many points, proving PSL₂(ℤ) has finitely many orbits.

### Matrix with p-adic Condition

**[[1,1],[-1,1]]:** Reduces when both p and q are odd
- This is a 2-adic condition: v₂(p) = v₂(q) = 0
- Creates gcd = 2, reducing height by factor of 2

### Matrix with Fractional Entry

**[[1/2,0],[0,1]]:** Reduces when p is even and |p/q| > 2
- p-adic: p ≡ 0 (mod 2)
- Archimedean: |p/q| > 2
- Both conditions required

## Using the Tool

1. **Enter matrices:** Click "Add Generator" and fill in the 2×2 matrix entries
2. **Or load an example:** Try the three built-in examples
3. **Prove finitely many orbits:** Click the button to find a covering strategy
4. **View visualization:** See the interval covering on ℝℙ¹

## Theory Reference

The mathematical framework is based on:
- Height functions on projective space
- Archimedean and p-adic valuations
- Geometric group actions on ℚℙ¹

For full mathematical details, see **REDUCTION_THEORY.md**.

## Files

- `index.html`: Main application
- `fraction.js`: Exact rational arithmetic
- `matrix.js`: 2×2 matrices and height function
- `analytical.js`: **Reduction region analysis** ← Core algorithm
- `algorithm.js`: Word generation and covering strategy
- `visualization.js`: ℝℙ¹ interval visualization
- `ui.js`: User interface
- `REDUCTION_THEORY.md`: Mathematical documentation
- `README.md`: This file
