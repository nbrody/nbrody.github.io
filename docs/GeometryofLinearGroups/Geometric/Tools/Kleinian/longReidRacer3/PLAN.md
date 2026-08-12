# Long–Reid Racer 3 — rebuild plan

A from-scratch recreation of the Long–Reid Racer (see `../longReidRacer`,
`../longReidRacer2`), keeping the synthwave hover-car aesthetic and the
mathematical content, with a cleaner architecture and exact arithmetic tuned
to the group's actual structure.

## The math

The game is played on the Cayley graph of the Long–Reid group: the Magnus
curve group Γ_t = ⟨A, B⟩, A = [[t,0],[0,1]], B = [[t²+1,2],[t,1]],
specialized at t = 9 and normalized into SL₂:

    a = (1/3)·[[9,0],[0,1]] = [[3,0],[0,1/3]]
    b = (1/8)·[[82,2],[9,1]]           (det b = (82 − 18)/64 = 1)

All entries lie in Z[1/6]. Long–Reid proposed this group act properly on the
product of trees T₃ × T₄; properness fails exactly when some word evaluates
to an infinite-order matrix in PGL₂(Z). **Brody, arXiv:2512.19760** exhibits
a length-82 witness — that word is the game's built-in "solution".

- **Height** of a word w: write w = N / (2^e₂·3^e₃) with N integral and the
  power minimal; height = e₂ + e₃ (the distance from the "ground floor" of
  T₃ × T₄, i.e. how far the matrix is from being integral).
- **Win condition:** height 0 and N ≠ ±I — an integer matrix of infinite
  order (the relator [a,b]² = −I makes ±I unavoidable background torsion).

## Game concept (unchanged from v1/v2)

You drive a neon hover-car over the Poincaré disk. Nodes of the Cayley graph
are positions g·i (upper half-plane orbit of i, mapped to the disk); each
node floats at altitude = its height. Edges are hyperbolic-geodesic highway
strips. Each move multiplies the current matrix by a generator, the world
recenters around you (Möbius animation), and you try to descend to
height 0 somewhere other than ±I.

Controls:

| Input | Action |
|---|---|
| `W/A/S/D` | absolute moves: b / a⁻¹ / b⁻¹ / a |
| `←/↑/→` | relative moves: previous / same / next generator in the cycle a→b→a⁻¹→b⁻¹ |
| `↓` | undo last move |
| `R` | restart |
| `,` or `P` | step one move of the built-in solution |
| `!` | autoplay the whole solution (~12 s) |
| mouse drag / wheel | orbit / zoom camera |
| mobile | on-screen D-pad (▼ = undo) + `!` autoplay button |

HUD: current matrix in factored form 1/(2^x·3^y)·(integer matrix), height,
move count. Overhead signposts preview the three relative moves, colored by
height delta (green = descend, red = climb, pink = level).

## Architecture — what changes from v1/v2

1. **Exact arithmetic adapted to Z[1/6].** Instead of four independent
   `Fraction`s (v1/v2), a matrix is `{n00,n01,n10,n11 : BigInt, e2,e3 : int}`
   meaning N/(2^e₂·3^e₃), kept normalized (no common factor of 2 or 3 in all
   four entries while the exponent is positive). Multiplication is one
   integer matrix product plus exponent bookkeeping; height is read off as
   e₂+e₃ with no gcd/lcm recomputation. Simpler, faster, and it *is* the
   group's structure.
2. **Free-reduction of the move history.** A move that inverts the previous
   one pops it instead of pushing, so the winning word is always freely
   reduced.
3. **Separation of concerns.** `math.js` (exact + complex/Möbius), 
   `cayley.js` (BFS graph around the current node), `render.js` (all canvas
   drawing), `game.js` (state, input, solution, victory). No cross-file
   spaghetti; each file exposes a small namespace. `math.js` is UMD-lite so
   the Node test can require it.
4. **Verified solution.** `tests/verify.mjs` (Node, no deps) checks: dets of
   a and b are 1, the relator [a,b]² = −I holds, the 82-move solution word is
   freely reduced, lands at height 0, and is ≠ ±I (infinite order, huge
   trace). Run: `node tests/verify.mjs`.
5. **Crisper canvas.** Fixed 800×600 logical size, scaled by devicePixelRatio.

## File layout

```
longReidRacer3/
├── PLAN.md              this plan
├── index.html           title screen, HUD, mobile controls, nav bootstrap
├── css/style.css        synthwave styling, scanlines, responsive/mobile
├── js/math.js           Mat2 over Z[1/6] (BigInt), Complex, Möbius, disk map
├── js/cayley.js         Cayley-graph BFS with disk positions + heights
├── js/render.js         background (sky/sun/mountains/stars), scenery,
│                        geodesic road strips, support struts, signs, car,
│                        victory screen, camera
├── js/game.js           state, input (kbd/mouse/touch), solution autoplay,
│                        victory check, HUD updates
└── tests/verify.mjs     Node verification of the math + solution word
```

## Rendering spec (v3 overhaul)

- **Roads as a connected network.** Each edge is a perspective-correct
  ribbon: the half-width is computed in *disk space* as
  ROAD_HALF·(1 − |z|²), so every road arriving at a node shares its
  cross-section there; a junction pad (16-gon disc with neon rim and pulsing
  beacon) is drawn over each node to merge the road ends into interchanges.
  Road anatomy: side skirts (slab thickness), asphalt surface, magenta edge
  rails (glow + hot core), perspective-correct cyan lane dashes that flow
  with progress. Roads are clipped against the camera near-plane into
  contiguous runs (with interpolated cut samples) so sweeps past the camera
  cut cleanly instead of streaking.
- **Signs: overhead highway gantry.** A lattice truss across the top of the
  view (posts fading to the ground, marker lights) carries one hanging panel
  per relative move (◄ ▲ ►): rounded panel, generator label with real
  superscript for inverses, height delta with ▲/▼, border + glow colored
  green (descend) / red (climb) / pink (level). Screen-fixed so all three
  choices stay legible regardless of which roads face the camera.
- **Background.** Sky gradient with drifting haze bands and twinkling stars;
  synthwave sun with slits, halo, and a reflection pooling on the desert
  floor; two parallax mountain layers with a lit city skyline (windows,
  antennas) sandwiched between; glowing horizon line; scrolling vaporwave
  ground grid (magenta longitudinals, cyan cross-lines flowing toward the
  camera), clipped below the horizon.
- **Scenery kit** (deterministic placement + parallax, depth-sorted, fogged,
  ground shadows): swaying palms, fluted Greek columns, glowing crystals,
  radio towers with blinking beacons, contour-lined pyramids, neon cacti,
  floating rotating wireframe gems, obelisks.
- Elevated nodes get support struts with height notches (capped at 8).
- Camera: yaw/pitch orbit (drag), zoom (wheel), car pinned at the origin
  with a subtle hover bob; world Möbius-slides during moves
  (entry-interpolated generator matrix, eased).
- Victory: starburst particles, pulsing rainbow VICTORY!, scrolling winning
  word, the winning integer matrix typeset with big parens, "press R".

## Verification plan

1. `node tests/verify.mjs` — all checks above must pass.
2. Serve the site locally, load the game in the browser: title screen →
   keypress starts → WASD/arrow moves animate and update the HUD/height →
   `!` autoplays the solution to the VICTORY screen. Check console for
   errors, screenshot as proof.

## Rollout

- New folder only; the two existing builds stay untouched.
- Link it like its siblings: tool-card in `Geometric/index.html` and entry
  in `assets/js/site-nav.js` ("Long-Reid Racer 3").
