// manifest.js — the catalog of visualizations under docs/graphics/.
//
// Each entry is a self-contained tool living in its own folder with an
// index.html. The wrapper (gallery / stage / remote) is driven entirely by
// this list, so adding a new visualization is a one-line change here.
//
// `keys` lists the single-character keyboard shortcuts a tool advertises in its
// own <kbd> hints; the remote surfaces these as tappable buttons. They are a
// convenience hint only — the remote can forward any key regardless.

export const CATEGORIES = {
  fractals: { label: 'Fractals & Chaos', accent: '#ff6b6b' },
  tilings: { label: 'Tilings & Lattices', accent: '#5cc8ff' },
  fields: { label: 'Fluids & Fields', accent: '#ffa94d' },
  maps: { label: 'Maps & Scales', accent: '#b197fc' },
  generative: { label: 'Generative', accent: '#63e6be' },
  botanical: { label: 'Botanical Studies', accent: '#a9e34b' },
};

export const VISUALIZATIONS = [
  // — Fractals & Chaos —
  { id: '3dFractal', title: 'Fractal Raymarcher', cat: 'fractals', glyph: '✦',
    blurb: 'Ray-marched 3D fractal you can orbit and dive into.', keys: ['h'] },
  { id: 'mandelbrot', title: 'Mandelbrot Explorer', cat: 'fractals', glyph: '𝓜',
    blurb: 'GPU fractal explorer with live Julia preview and auto-zoom.', keys: ['h', 'j', ' '] },
  { id: 'xiaTheorem', title: "Xia's Theorem", cat: 'fractals', glyph: '☄',
    blurb: 'The 5-body finite-time singularity, simulated.', keys: [' ', 'r', 's', 'b', 'h'] },
  { id: 'indrasPearls', title: "Indra's Pearls", cat: 'fractals', glyph: '◎',
    blurb: 'Limit sets of Kleinian groups, after the figures in Indra’s Pearls.', keys: ['h', ' '] },
  { id: '4dKleinian', title: 'Kleinian Limit Sets in 4D', cat: 'fractals', glyph: '⊛',
    blurb: 'Ray-marched limit sets of reflection groups acting on hyperbolic 4-space; orbit, breathe the mirrors, export posters.', keys: ['[', ']', 'O', 'B', 'R', 'H'] },
  { id: 'newtonFractals', title: 'Newton Fractals', cat: 'fractals', glyph: '∂',
    blurb: 'Newton, Halley & Nova basins — Pisot/Salem conjugates, draggable roots, and the cubic λ-plane.', keys: ['h', ' ', 'n', 'p', 's', 'r'] },

  // — Tilings & Lattices —
  { id: 'hatTiling', title: 'Hat Monotile', cat: 'tilings', glyph: '⬡',
    blurb: "Generator for the aperiodic 'Hat' monotile tiling.", keys: ['h', '+', '-'] },
  { id: 'penrose', title: 'Penrose Tiling', cat: 'tilings', glyph: '✶',
    blurb: 'Penrose tiling via cut-and-project from ℝ⁵ → ℝ².', keys: [] },
  { id: 'picardOrbit', title: 'Picard Orbit', cat: 'tilings', glyph: '◉',
    blurb: 'A PSL₂(ℤ[i]) orbit drawn in the Poincaré ball.', keys: [] },
  { id: 'infiniteZ3lattice', title: 'Z³ Lattice (Raymarched)', cat: 'tilings', glyph: '⧉',
    blurb: 'Ray-marched infinite Z³ lattice of sine waves.', keys: [] },
  { id: 'z3lattice', title: 'Z³ Lattice', cat: 'tilings', glyph: '⊞',
    blurb: 'A luminous crystal of waves, ripples, and interference over ℤ³.', keys: [] },

  // — Fluids & Fields —
  { id: 'blockCloud', title: 'Block Cloud', cat: 'fields', glyph: '☁',
    blurb: 'An endless cloudscape sampled into orange-framed blocks, with breathing grid density.', keys: [' ', 'r'] },
  { id: 'cyclicCellularAutomaton', title: 'Cyclic automaton', cat: 'fields', glyph: '◌',
    blurb: 'Griffeath waves with finite-group rules and palette controls.', keys: [' ', 'r', 'h', 'n'] },
  { id: 'gameOfLife', title: 'Game of Life in (ℤ/2)²', cat: 'fields', glyph: '▚',
    blurb: 'Conway’s Life told in chapters, with live cells split into the three nonzero elements of (ℤ/2)².', keys: [' ', 'n', 'r', 's', 'h'] },
  { id: 'fire', title: 'Combustion Engine', cat: 'fields', glyph: '🔥',
    blurb: 'Navier–Stokes flame solver. Drag to add fuel.', keys: [] },
  { id: 'smoke', title: 'Domain Warping', cat: 'fields', glyph: '🌫',
    blurb: "IQ-style fbm domain-warping smoke.", keys: ['h', ' '] },
  { id: 'gyroidSmoke', title: 'Gyroid Smoke', cat: 'fields', glyph: '〰',
    blurb: 'Curling iridescent smoke carried by a gyroid flow field.', keys: [' ', 'r', 's', 'b', 'h'] },
  { id: '3dGyroidSmoke', title: '3D Gyroid Smoke', cat: 'fields', glyph: '◈',
    blurb: 'MIDI notes fill an architectural room with persistent, colored 3D smoke.', keys: [' ', 'r', 's', 'b', 'h'] },
  { id: 'iceWall', title: 'Ice Wall', cat: 'fields', glyph: '❄',
    blurb: 'Voronoi + domain-warped FBM ice surface.', keys: ['h', ' '] },
  { id: 'turingPatterns', title: 'Gray–Scott', cat: 'fields', glyph: '🦓',
    blurb: 'Reaction–diffusion (Turing) patterns you can paint.', keys: [] },
  { id: 'tidalMarsh', title: 'Tidal Marsh', cat: 'fields', glyph: '🪸',
    blurb: 'Dendritic tidal channel networks, grown live.', keys: [] },

  // — Maps & Scales —
  { id: 'mathMap', title: 'Map of Mathematics', cat: 'maps', glyph: '🗺',
    blurb: 'An interactive map of the fields of mathematics.', keys: [] },
  { id: 'scienceMap', title: 'Map of Science', cat: 'maps', glyph: '🧭',
    blurb: 'An interactive map of the sciences.', keys: [] },
  { id: 'sizeExplorer', title: 'Size Explorer', cat: 'maps', glyph: '🔭',
    blurb: 'Scale of the universe, from quarks to the cosmos.', keys: [] },

  // — Generative —
  { id: 'island', title: 'Island · Tree Study', cat: 'generative', glyph: '♧',
    blurb: 'Grow a raymarched tree from simple shapes and layered sine waves.', keys: [] },
  { id: 'donutSpiral', title: 'Donut Spiral', cat: 'generative', glyph: '🍩',
    blurb: 'A hypnotic radial annulus animation.', keys: [] },
  { id: 'origins', title: 'Origins', cat: 'generative', glyph: '✺',
    blurb: 'A generative cosmological scene.', keys: [] },
  { id: 'lightDesigner', title: 'CK5 Virtual Rig', cat: 'generative', glyph: '💡',
    blurb: 'Kinetic truss pods, 72 moving heads and haze: a lighting console, hour-long shows, and a MIDI mode where every key fires lights.', keys: [' ', 't', 'x', 's', 'b', 'g'] },
  { id: 'ballMachine', title: 'Glasshouse Excogitation', cat: 'generative', glyph: '⚙',
    blurb: 'A George Rhoads–style ball machine in a Victorian palm house: thirty balls, five musical routes and real rolling physics. Chase a ball or ride one.', keys: ['1', '2', '3', '4', 'n', ' ', '[', ']'] },

  // — Botanical Studies —
  { id: 'bunya', title: 'Bunya Pine', cat: 'botanical', glyph: '🌲',
    blurb: 'A procedural Bunya pine: towering trunk, cascading foliage, coastal breeze.', keys: [] },
  { id: 'juniper', title: 'Hollywood Juniper', cat: 'botanical', glyph: '🌿',
    blurb: 'Twisted wood and ascending foliage of a Hollywood juniper in the breeze.', keys: [] },
  { id: 'passiflora', title: 'Passiflora', cat: 'botanical', glyph: '🌸',
    blurb: 'A photograph-inspired passionflower in procedural GLSL.', keys: [] },
  { id: 'passiflora2', title: 'Passiflora caerulea', cat: 'botanical', glyph: '💠',
    blurb: 'Two blue passionflower blooms against a fence.', keys: [] },
  { id: 'passifloraSimple', title: 'Passiflora · Simple', cat: 'botanical', glyph: '✿',
    blurb: 'A deliberately basic sketch of the same flower: ellipses, filaments, cylinders.', keys: [] },
];

const _byId = new Map(VISUALIZATIONS.map((v) => [v.id, v]));

/** Look up a visualization by its folder id. */
export function vizById(id) {
  return _byId.get(id) || null;
}

/** Relative path (from the graphics root) to a visualization's entry page. */
export function vizPath(id) {
  return `${id}/index.html`;
}

/** Relative path (from the graphics root) to a visualization's preview image. */
export function vizThumb(id) {
  return `thumbs/${id}.webp`;
}

/** Accent color for a visualization (falls back to a neutral). */
export function vizAccent(id) {
  const v = _byId.get(id);
  return (v && CATEGORIES[v.cat]?.accent) || '#8ab4f8';
}
