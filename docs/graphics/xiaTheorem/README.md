# Xia's Theorem

Exact few-body gravity with no softening, centred on Xia's five-body
non-collision singularity and a small library of other configurations.

| file | role |
| --- | --- |
| `js/nbody.js` | Regularized integrator: logarithmic-Hamiltonian leapfrog (Mikkola–Tanikawa, Preto–Tremaine) with Gragg–Bulirsch–Stoer extrapolation, plus quintic Hermite interpolation for display. Node-safe. |
| `js/scenarios.js` | Scenario catalogue: initial data, bodies, camera, chart and tempo hints. |
| `js/cascade.js` | **Generated**: the tuned Xia cascade (initial state, trimmed and sync checkpoints, bounce list, t* estimate). |
| `js/render.js` | three.js scene: sky, glowing bodies, GPU ribbon trails fed from a ring-buffer texture (with optional "unroll time" drift), guides, osculating orbits, bloom. |
| `js/chart.js` | World-line chart; for Xia also blow-up coordinates, z / (z_A − z_B) against −log₁₀(t* − t). |
| `js/main.js` | Stepping, checkpoint resync, tempo (singularity clock / adaptive / uniform), camera framing, UI. |
| `tools/build-cascade.mjs` | Offline search that produces `js/cascade.js`. |

## The cascade

Each bounce happens in a thin window of initial data next to a triple
collision, and each later bounce sits inside a thinner sliver of the previous
window. A double runs out of digits after two or three levels. The builder
therefore does the following:

1. Tunes binary A's initial phase, with binary B's phase on a coarse grid, for
   two good bounces. A good bounce sends Q₅ back faster (at least ×1.25) and
   leaves the binary bound and harder.
2. Restarts at a mid-flight checkpoint before the deepest good bounce. There
   the approaching binary's Kepler phase is trimmed by the amount nearest 0
   (a few 10⁻⁶ of a period) that also makes the next bounce good. It
   backtracks depth-first when a branch dies.
3. Adds sync checkpoints so a browser run never carries round-off through
   more than one near triple collision.

The result is a shadowing pseudo-orbit whose jumps are the recorded trims. The
page shows the latest trim in the HUD.

```bash
node docs/graphics/xiaTheorem/tools/build-cascade.mjs --workers 6 --target 10
node docs/graphics/tests/xiaTheorem.mjs
```

The shipped cascade uses m₅ = 0.1 and binaries with 1 − e = 10⁻⁴. It gives
four bounces (speed ×1.3, ×2.2, ×1.4, ×1.4), and every trim is under
10⁻⁵ of a period. With 1 − e = 10⁻⁴ a back-bounce gains at most about 2×, and
the window after the fourth bounce can no longer steer the fifth. More nearly
collinear binaries (1 − e = 10⁻⁶ to 10⁻⁸) let the triple approach come much
closer, with back-bounce gains of 20× to 60× and room for longer cascades. The
search is then far slower, because each near triple collision costs 10⁴ to
10⁵ integrator steps. To try it, edit `BASE` in `tools/build-cascade.mjs`.
