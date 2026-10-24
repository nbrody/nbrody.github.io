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
  maximal cusp heights, PGL(2,ℤ) (walls tangent at ∞), a long generator reduced into the
  domain (its remainder is a wall), the membership failure for a generator whose remainder
  needs words past the cap, the presets that once needed a deeper search verifying at depth 8,
  domains at random basepoints (same volume and H₁), the right-angled dodecahedron's
  combinatorics (V − E + F), and the presentation tools (Tietze moves, abelianization). A new
  preset must be added to its
  expectation table — the first test fails otherwise.
- `tower.test.mjs` — exact input: factoring over ℚ, the field tower (only the irreducible factor
  through the requested root is adjoined, so √6 adds nothing to ℚ(√2, √3)), the reader of
  constants and entries (field degrees, root rows, π-multiples, the floating-point fallback and
  its reason, error locations), complex conjugation (found inside the field or adjoined),
  serialization across the worker boundary, and that every preset reads exactly.
- `nondiscrete.test.mjs` — certificates of non-discreteness (`js/nondiscrete.js`, run by `runCompute`
  whenever Poincaré's conditions fail): an elliptic of infinite order; cusp groups that are not
  discrete (two parabolics with a real irrational translation ratio, translations of ℚ-rank 3, a
  loxodromic or a forbidden rotation fixing the cusp, two loxodromics with one common fixed point);
  Jørgensen and Shimizu. Each exactly and in floating point (evidence only), no false positive on
  any preset, and the report's status `nondiscrete` with the proof first in the certificate.
- `planar.test.mjs` — the plane picture: which presets lie in PGL₂(ℝ) (up to scalars, mirrors
  included), and that slicing the 3D domain by the plane over ℝ gives one polygon edge per face.
- `gluing.test.mjs` — the gluing walk behind the edge and vertex highlights (`js/gluing.js`): edge
  classes are exactly the certificate's edge cycles, a cycle that flips its edge is detected, the
  carried pulse coordinate covers the same range on every edge of a cycle, vertex classes give the
  stabilizer orders (1 for the Weeks manifold, 8 at the dodecahedron's corners, 6 and 12 for
  PSL(2,ℤ[ω])), and in a Ford domain the classes still partition the edges and vertices. Also
  the cells behind "Unwrap along edge / vertex" (`js/unwrap.js`): the walk round an edge closes
  after (cycle length × m) cells and a full turn of 2π, the cells at a vertex number (cycle size ×
  stabilizer order), and in a Ford domain only the chimney-cut edges fail to close; and the angle
  text (π, π/2, 2π/3 rather than 4π/4 or 0.5000π).
