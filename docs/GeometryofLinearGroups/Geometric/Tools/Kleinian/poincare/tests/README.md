Run with Node.js 22 or later from the poincare directory:

```sh
node --test --import ./tests/register.mjs 'tests/*.test.mjs'
```

Uses the existing sibling `vendor/three` and `vendor/mathjs` files; no dependency installation is required.

- `math.test.mjs` — PSL sign/rounding invariance, Cayley relations and search budgets, view
  covariance (including orientation reversal), cache invalidation and isolation, input bounds,
  and representative canonical domains and numerical certification.
- `library.test.mjs` — the regression suite. Every preset in `js/groupLibrary.js` goes through
  `runCompute` (the Web Worker's entry point, inputs round-tripped through JSON) and must
  reproduce its certificate status, face count, membership of the input generators, H₁, volume
  (SnapPy / Humbert values), cusp count and invariant trace field. Also: Ford-domain volumes and
  maximal cusp heights, PGL(2,ℤ) (walls tangent at ∞), the membership failure for a generator
  the search has not reached, the right-angled dodecahedron's combinatorics (V − E + F), and the
  presentation tools (Tietze moves, abelianization). A new preset must be added to its
  expectation table — the first test fails otherwise.
