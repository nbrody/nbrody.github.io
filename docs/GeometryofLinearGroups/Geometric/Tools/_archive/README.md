# Archived Geometric tools

Retired tools, kept so their code and old URLs stay reachable. Nothing on the site links here:
no cards, no site-nav entries, no sitemap entries. Each tool moved here unchanged (with
`git mv`, so `git log --follow` still shows its history). The exception is a fix to a
relative path where the move would have broken it.

The folder sits at the same depth as `Tools/Kleinian/` and `Tools/padicGroups/`, so the
archived pages' relative links mostly still resolve.

| Archived | Was at | Superseded by / why |
|---|---|---|
| `poincare2/` | `Tools/Kleinian/poincare2/` | `Kleinian/poincare` (an older fork; its one unique feature, the Tie-Dye fold shading, moved into poincare on 2026-10-11) |
| `fuchsian/` | `Tools/Kleinian/fuchsian/` | `Kleinian/poincare`, whose planar view draws a Fuchsian group's domain and tiling in the disk or upper half-plane. Not carried over: the tile colouring modes (word hash, distance, first or last letter, parity), the von Dyck (p, q, r) preset builder, and raw-covector input (`?vectors=`, `?faces=`), which nothing sent. |
| `fuchsianDiscreteness/` | `Tools/Kleinian/fuchsianDiscreteness/` | `Kleinian/poincare`. On 2026-10-11 poincare gained the two decisions it was missing: commuting loxodromics whose translation lengths have an irrational ratio (`axisTest` in `assets/js/hyperbolic/nondiscrete.js`), and classical proofs of discreteness where the domain leaves a cusp unresolved, such as Γ(2) (`assets/js/hyperbolic/classical.js`). All 17 of this tool's examples are decided the same way in `poincare/tests/fuchsian.test.mjs`. Its "the Cayley graph closed, so the group is finite" verdict is unsound: it drops words at the length cap and calls three non-discrete groups finite. It was not ported. |
| `dirichlet/` | `Tools/Kleinian/dirichlet/` | `Kleinian/poincare` (all of its presets are there, with exact certificates) |
| `limitsets.html` | `Tools/Kleinian/limitsets.html` | `Kleinian/poincare` (same presets; isometric circles in the cusp/Ford view) |
| `fuchstest.html` | `Tools/Kleinian/fuchstest.html` | October 2025 prototype of the H² Dirichlet viewer |
| `rileySlice/` | `Tools/Kleinian/rileySlice/` | `Kleinian/riley-slice`, which gained a corrected explainer (`explanation.html`), the dominant-slope line in its selection readout and a slope legend. Its ρ / symmetric-z switch is riley-slice's ρ / √ρ plane. The old URL redirects to riley-slice. This tool's explanation.html is wrong in places and was not copied: both generators are parabolic, the slice is Robert Riley's, and \|Φ\| > 2 does not mean discrete. |
| `pleating.html` | `Tools/Kleinian/pleating.html` | `Kleinian/riley`, which gained its two root plots (tr = +2, the roots of Q − 2, and the zeros of the bottom-left entry c), computed from riley's Farey word, plus the continued fraction of p/q. Its own word construction was not ported: for 1/2 it builds XXY, with trace 2 + 2ρ, not the Farey word with Φ₁/₂ = 2 + ρ². |
| `maskit2.html` | `Tools/Kleinian/maskit2.html` | `Kleinian/maskit.html`, as its "Orbit density" mode. Despite its "(Riley Slice)" title, this page drew the Maskit group ⟨z + 1, (μz − i)/(−iz)⟩: the density of random-word orbits. |
| `pleatingRays/` | `Tools/Kleinian/pleatingRays/` | `Kleinian/riley-slice` (a strict superset: same rays, extensions and dots, plus Ford regions) |
| `maskit1.html` | `Tools/Kleinian/maskit1.html` | `Kleinian/riley-slice` (a per-pixel Riley-slice plot, despite the name) |
| `apollodense.html` | `Tools/Kleinian/apollodense.html` | `Kleinian/apollonian.html` (a WebGPU port of the plain gasket; its shader no longer compiles) |
| `knots/` | `Tools/Kleinian/knots/` | KnotFolio (a smaller, independent knot-drawing canvas) |
| `knotfolio.html` | `Tools/Kleinian/knotfolio.html` | Not a page: a plain-text to-do note about KnotFolio |
| `kleinianAssets/` | `Tools/Kleinian/assets/` | Nothing loaded these early PSL₂(ℂ) helpers; the live code is `GeometryofLinearGroups/assets/js/hyperbolic/` |
| `globeGame.html` | `Tools/padicGroups/globeGame.html` | A redirect to `padicGroups/globeGame/` (target path adjusted for the move) |
| `pAdic.js` | `Tools/padicGroups/pAdic.js` | Unused (its page, pAdicAction.html, was deleted in October 2025) |
| `pAdicHelper.js` | `Tools/padicGroups/js/pAdicHelper.js` | Unused ℤ_p / Hensel-lifting helpers |
| `LLL.js` | `Tools/Euclidean/LLL.js` | Unused (gpsCalculator has its own `lll()`) |
| `SL3Rcopy.html` | `Geometric/SL3Rcopy.html` | `Tools/freeProduct` (the original SL₃(ℤ[½]) ℝ³-vs-ℙ² page, kept when SL3.html became the building viewer) |
