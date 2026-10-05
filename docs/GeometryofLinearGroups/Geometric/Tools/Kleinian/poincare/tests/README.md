Run with Node.js 22 or later from the poincare directory:

```sh
node --test --import ./tests/register.mjs 'tests/*.test.mjs'
```

Uses the existing sibling `vendor/three` files; no dependency installation is required.

- `math.test.mjs` — PSL sign/rounding invariance, Cayley relations and search budgets, view
  covariance (including orientation reversal), cache invalidation and isolation, input bounds,
  and representative canonical domains and numerical certification.
- `library.test.mjs` — the regression suite. Every preset in `js/groupLibrary.js` goes through
  `runCompute` (the Web Worker's entry point, inputs round-tripped through JSON) and must
  reproduce its certificate status, face count, membership of the input generators, H₁, volume
  (SnapPy / Humbert values), cusp count and invariant trace field, with its relations verified
  exactly. Also: Ford-domain volumes and
  maximal cusp heights, PGL(2,ℤ) (walls tangent at ∞), the membership failure for a generator
  the search has not reached, the right-angled dodecahedron's combinatorics (V − E + F), and the
  presentation tools (Tietze moves, abelianization). A new preset must be added to its
  expectation table — the first test fails otherwise.
- `tower.test.mjs` — exact input: factoring over ℚ, the field tower (only the irreducible factor
  through the requested root is adjoined, so √6 adds nothing to ℚ(√2, √3)), the reader of
  constants and entries (field degrees, root rows, π-multiples, the floating-point fallback and
  its reason, error locations), complex conjugation (found inside the field or adjoined),
  serialization across the worker boundary, and that every preset reads exactly.
- `planar.test.mjs` — the plane picture: which presets lie in PGL₂(ℝ) (up to scalars, mirrors
  included), and that slicing the 3D domain by the plane over ℝ gives one polygon edge per face.
