# Cyclic cellular automaton

A dependency-free Canvas 2D experiment with Griffeath’s cyclic cellular automaton
and a generator-based extension to finite groups. Open `index.html` through an
HTTP server to enter Graphics Studio, or add `?standalone=1` for the full
experiment page with explanations and a transition inspector.

From the graphics directory:

```sh
python3 -m http.server 8786
```

Visit `http://localhost:8786/cyclicCellularAutomaton/index.html?standalone=1`.

## Rule

The standard state space is ℤ/nℤ. A cell in state `g` advances to `g + 1 mod n`
when at least the threshold number of its neighbors have that successor state.
All cells read the previous generation and update simultaneously. The default
uses 12 states, four nearest neighbors, threshold 1, and periodic boundaries.

See Fisch, Gravner, and Griffeath,
[Threshold-Range Scaling of Excitable Cellular Automata](https://arxiv.org/abs/patt-sol/9304001).

The advanced rule uses a finite group G and a selected list S of nonidentity
elements. The allowed successors of `g` are `g·s` (right multiplication) or
`s·g` (left multiplication), for `s` in S. Each candidate must separately meet
the threshold. Among eligible candidates, the one with the most neighbors
wins; ties follow the displayed generator order. If none qualify, the cell
stays unchanged. No selected generators freezes the field. This is an explicit
extension of the cyclic rule; it keeps the spatial lattice two-dimensional.

Available groups:

- Cyclic ℤ/nℤ, 2 ≤ n ≤ 32; default generator 1.
- Product ℤ/mℤ × ℤ/nℤ, 2 ≤ m,n ≤ 8; generators (1,0), (0,1).
- Dihedral Dₙ of order 2n, 3 ≤ n ≤ 16; generators r,s with srs = r⁻¹.
- Symmetric S₃ and S₄; adjacent transpositions. Products compose right to left.
- Quaternion Q₈; generators i,j with i² = j² = k² = ijk = −1.

The generator panel reports the size of the generated subgroup and previews
allowed transitions from any state. Left and right multiplication differ in
noncommutative groups. Initial bands and spirals follow the displayed element
ordering; in general groups this ordering need not be a generator path.

## Eisenstein lattice

Choose **Eisenstein · triangular** under **Lattice & neighborhood**, or start
with the **Eisenstein waves** preset. The lattice choice works with every finite
state group and palette. Switching the lattice preserves the current cells
and generation; Restart constructs the selected initial pattern in its new
geometry.

Sites have coordinates `z = x + yω`, where `ω = exp(2πi/3)`, and display at
`(x − y/2, √3 y/2)`. Each site occupies its regular hexagonal Voronoi cell.
The six nearest neighbors differ by `±1, ±ω, ±(1+ω)`. A neighborhood of graph
radius r consists of offsets satisfying `max(|dx|, |dy|, |dx−dy|) ≤ r`,
excluding the center, so it has `3r(r+1)` sites (6, 18, 36, 60 for radii 1–4).

The finite field is a parallelogram in the complex plane. Wrap-around identifies
opposite sides by the translations `width` and `height·ω`; closed edges ignore
sites outside it. Painting uses the Euclidean norm
`dx² − dx·dy + dy² ≤ brushRadius²`, keeping the brush circular on screen.
Spiral seeds, bands, droplets, pointer hit testing, and exported PNGs all use
the same lattice geometry. See the
[Eisenstein integer definition and norm](https://resources.wolframcloud.com/FunctionRepository/resources/EisensteinIntegers).

## Interaction

Pause/play, step, speed, states, neighborhood, radius, threshold, boundary,
resolution, initial pattern, seed, brush, and six color palettes are adjustable.
Changing palettes, neighborhood rules, or generators preserves the field.
Changing the state group, its order, or grid dimensions restarts it.
Changing the seed input takes effect on Restart. Spiral and band patterns are
deterministic constructions independent of seed; random fields and droplets
use a seeded generator. Repeating the same settings and seed reproduces the field.

Drag to paint; Shift-drag paints random states. Space pauses, N advances one
generation, R chooses a new seed, and H toggles a clean view. PNG export saves
the current field with its seed and generation in the filename. The page starts
paused when the browser requests reduced motion. On slower devices, actual
simulation speed may fall below the requested rate to keep controls responsive.

## Verification

```sh
node --test cyclicCellularAutomaton/*.test.mjs
```

Tests cover group axioms, generator coverage, noncommutative relations,
simultaneous cyclic updates, thresholds and tie-breaking, both boundaries,
reference comparisons across groups and neighborhoods, seeds, and painting.
Geometry tests cover cell centers, six equidistant neighbors, hexagonal corners,
outside pixels, raster hit testing, and resolution bounds.
