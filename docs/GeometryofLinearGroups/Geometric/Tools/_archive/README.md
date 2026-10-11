# Archived Geometric tools

Retired tools, kept so their code and old URLs stay reachable. Nothing on the site links here:
no cards, no site-nav entries, no sitemap entries. Each tool moved here unchanged (with
`git mv`, so `git log --follow` still shows its history). The exception is a fix to a
relative path where the move would have broken it.

The folder sits at the same depth as `Tools/Kleinian/` and `Tools/padicGroups/`, so the
archived pages' relative links mostly still resolve.

| Archived | Was at | Superseded by / why |
|---|---|---|
| `dirichlet/` | `Tools/Kleinian/dirichlet/` | `Kleinian/poincare` (all of its presets are there, with exact certificates) |
| `limitsets.html` | `Tools/Kleinian/limitsets.html` | `Kleinian/poincare` (same presets; isometric circles in the cusp/Ford view) |
| `fuchstest.html` | `Tools/Kleinian/fuchstest.html` | October 2025 prototype of the H² Dirichlet viewer |
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
