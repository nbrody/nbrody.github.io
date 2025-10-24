# Quaternion Calculator - General Primes

This tool dynamically computes generators and relations for quaternion groups based on user-specified odd primes.

## Structure

- **generatorComputation.js**: Core module for computing generators and relations
  - `generateQuaternionsOfNorm(p)`: Finds all quaternions with norm = p
  - `removeDuplicatesUpToSign(quaternions)`: Removes projective duplicates
  - `computeRelations(generators)`: Finds all commutation relations between generators

- **projectiveQuaternion.js**: ProjectiveQuaternion class
  - `ProjectiveQuaternion`: Class representing quaternions in projective space (q ~ λq)
  - Automatic normalization to canonical form
  - Projective equality checking
  - `generateProjectiveQuaternionsOfNorm(p)`: Generate all projective quaternions of norm p
  - `computeProjectiveRelations(generators)`: Compute relations using projective equality

- **primeQuaternionFilters.js**: Canonical generator computation (from primeQuaternions.html)
  - `findAllQuaternions(p)`: Find all integer quaternions of norm p
  - `filterByQ8Orbit(quaternions)`: Remove Q8 orbit equivalents (a > 0, a odd, b even)
  - `removeConjugatePairs(quaternions)`: Remove conjugate pairs
  - `findXYSolution(p)`: Find solution to x²+y²≡-1 (mod p)
  - `matchQuaternionToP1(q, x0, y0, p)`: Map quaternion to P¹ label in {0, 1, ..., p-1, ∞}
  - `generateCanonicalGenerators(p)`: Main function returning (p+1)/2 canonical generators with P¹ labels
  - `generateGeneratorsForPrimes(primes)`: Generate for multiple primes with progress tracking

- **index.html**: Full interactive page with Three.js visualizations
- **test.html**: Test page to verify generator and relation computation
- **testProjective.html**: Test suite for ProjectiveQuaternion class
- **testP1Labeling.html**: Test suite for P¹ labeling system and bijection verification

## How It Works

### Canonical Generator Computation (Integrated from primeQuaternions.html)

For each odd prime `p`, we find canonical generators using a three-step filtering process:

1. **Find all solutions**: Generate all integer quaternions `(a, b, c, d)` where:
   ```
   a² + b² + c² + d² = p
   ```
   By Lagrange's four-square theorem, there are exactly `8(p+1)` solutions.

2. **Remove Q8 orbit equivalents**: Filter to only quaternions where:
   - `a > 0` (positive real part)
   - `a` is odd
   - `b` is even

   This removes equivalences under the action of Q8 = {±1, ±i, ±j, ±k}.

3. **Remove conjugate pairs**: For each quaternion and its conjugate, keep only one based on the sign of the second non-zero coordinate.

4. **Label with P¹(F_p)**: Each canonical generator is labeled with an element of P¹(F_p) = {0, 1, ..., p-1, ∞}:
   - Find a solution (x₀, y₀) to x²+y²≡-1 (mod p)
   - This solution determines an isomorphism from the F_p quaternion algebra to M_2(F_p)
   - Quaternions of norm p correspond to rank 1 matrices (trace p, determinant 0)
   - Each rank 1 matrix annihilates a 1-dimensional subspace of F_p², giving a point in P¹(F_p)
   - Convert projective coordinates [x:y] to labels: [1:0]→∞, [x:y]→x·y⁻¹ mod p

**Result**: Exactly `(p+1)/2` canonical generators for each prime `p`, each labeled with a unique element of P¹(F_p).

### Example: Prime 5

- All solutions: 40 quaternions (8 × 6)
- After Q8 filtering: 6 quaternions
- After conjugate removal: 3 generators
  - `1+2i` and `1-2i`
  - `1+2j` and `1-2j`
  - `1+2k` and `1-2k`

### Relation Computation

For generators `a`, `b`, `bp`, `ap`, a relation is:
```
a × b = bp × ap  (up to sign)
```

This means the square with edges labeled `a` (bottom), `b` (right), `ap` (top), `bp` (left) commutes in the group.

The algorithm:
1. For each pair of generators `(a, b)`
2. Compute `ab = a × b`
3. Search for generators `bp`, `ap` such that `bp × ap = ab` (up to sign)
4. Record the relation `{ a, b, bp, ap }`

### Norm pq Factorization Relations

For each pair of distinct primes `p` and `q`, there are `(p+1)(q+1)` quaternions of norm `pq`. Each such quaternion can be written in two ways:
- As a product `p_i × q_j` (generator of norm p times generator of norm q)
- As a product `q_k × p_ℓ` (generator of norm q times generator of norm p)

These factorizations are organized in a `(p+1) × (q+1)` table where:
- **Rows** are indexed by `i ∈ F_p P¹ = {0, 1, ..., p-1, ∞}`
- **Columns** are indexed by `j ∈ F_q P¹ = {0, 1, ..., q-1, ∞}`
- **Cell (i,j)** displays a square diagram showing the relation: `p_i × q_j = ±q_k × p_ℓ`
  - Bottom edge: p_i (row generator)
  - Right edge: q_j (column generator)
  - Left edge: q_k (found from relation)
  - Top edge: p_ℓ (found from relation)

Each square graphically represents the commutation relation, showing how the two paths through the diagram (bottom→right vs left→top) produce the same result.

This table reveals how the two different prime factorizations of quaternions of norm pq relate to each other through the P¹ labeling.

## Usage

Open `test.html` in a browser and enter odd primes (e.g., "5, 13").

The tool will:
1. Generate all quaternion generators for those primes
2. Compute all relations between them
3. Display the results

## Next Steps

- [ ] Create full UI with Three.js visualizations
- [ ] Add Cayley graph visualization on S²
- [ ] Add square complex tiling visualization
- [ ] Add interactive controls for generator selection
