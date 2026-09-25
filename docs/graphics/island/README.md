# Island: tree study

The first component of the procedural island project, with three source-informed species presets. Open `/graphics/island/`
through Graphics Studio, or `/graphics/island/?standalone=1` for the full field guide.
Serve `docs/` (or the repository) with any static HTTP server. No build or dependencies.

Four selectable stages: capsule + sphere; branches and smooth crown unions;
two trigonometric displacement octaves; individual leaves on oriented twigs.
Select an available parameter and Play variation to sweep smoothly through its
range. Editing a slider pauses playback. Reset restores the selected species proportions and camera;
it keeps the construction stage. Drag to orbit and scroll to zoom.

`tree.js` exports reusable GLSL tree geometry and its displacement step bound.
`shader.js` handles raymarching, lighting, and the study ground plane.
`foliage.js` generates branch-attached twig planes and analytic leaf masks.
`main.js` handles WebGL, controls, stage gating, and parameter animation.
The trig layers are distance estimates, with a gradient bound used to reduce
marching steps. The final stage replaces crown volumes with SDF-cut leaf geometry, depth-tested against the raymarched trunk. High-frequency
extremes cost more raymarching work; resolution is capped for interactive use.

Inspired by Inigo Quilez's distance-function and smooth-minimum techniques:
https://iquilezles.org/articles/distfunctions/
https://iquilezles.org/articles/smin/

Next components: ocean shader, island/mountain shader, and tree placement.

## Species studies

Coast redwood, Hollywood juniper and Monterey cypress now have separate branching
recipes. Select a species, inspect **Growth habits & sources**, then vary development,
leader dominance, crown base, branch elevation, contortion, exposure or flattening.
**Show branch skeleton** removes foliage. **Reset** restores the selected species.
The original simple tree remains available. Species selection starts at stage 4;
all four construction stages remain accessible.

`species.js` owns source links, defaults and deterministic skeleton construction.
The shader unions tapered segments and ellipsoid distance bounds, with trigonometric displacement in stage 3. Stage 4 uses oriented twig planes for foliage. See [RESEARCH.md](RESEARCH.md) for the
observations, mappings and limitations. Architecture is descriptive, not a
calibrated biological growth model; development is not age in years.

Run `node docs/graphics/tests/island.mjs` from the repository root for geometry
regressions (204 cases, connection integrity and control sensitivity).


The leaf stage exposes **Leaf size**, **Foliage density**, and **Foliage close-up**.
Redwood has two rows of flat needles. Juniper and cypress use scale-leaved
branchlet motifs; the simple study gets broader elliptical leaves. Placement is
deterministic and every twig is attached to the woody skeleton. These are oriented
planes with analytic cutouts, not full volumetric needles. Rendering requires
WebGL EXT_frag_depth and OES_standard_derivatives. The shared projection/depth
convention uses near 0.1 and far 100. Geometry is cached during camera movements.
