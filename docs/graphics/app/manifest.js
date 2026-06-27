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
};

export const VISUALIZATIONS = [
  // — Fractals & Chaos —
  { id: '3dFractal', title: 'Fractal Raymarcher', cat: 'fractals', glyph: '✦',
    blurb: 'Ray-marched 3D fractal you can orbit and dive into.', keys: ['h'] },
  { id: 'mandelbrot', title: 'Mandelbrot Explorer', cat: 'fractals', glyph: '𝓜',
    blurb: 'GPU fractal explorer with live Julia preview and auto-zoom.', keys: ['h', 'j', ' '] },
  { id: 'xiaTheorem', title: "Xia's Theorem", cat: 'fractals', glyph: '☄',
    blurb: 'The 5-body finite-time singularity, simulated.', keys: [' ', 'r', 'h'] },

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
    blurb: 'A lattice of interfering sine waves over Z³.', keys: [] },

  // — Fluids & Fields —
  { id: 'fire', title: 'Combustion Engine', cat: 'fields', glyph: '🔥',
    blurb: 'Navier–Stokes flame solver. Drag to add fuel.', keys: [] },
  { id: 'smoke', title: 'Domain Warping', cat: 'fields', glyph: '🌫',
    blurb: "IQ-style fbm domain-warping smoke.", keys: ['h', ' '] },
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
  { id: 'donutSpiral', title: 'Donut Spiral', cat: 'generative', glyph: '🍩',
    blurb: 'A hypnotic radial annulus animation.', keys: [] },
  { id: 'origins', title: 'Origins', cat: 'generative', glyph: '✺',
    blurb: 'A generative cosmological scene.', keys: [] },
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

/** Accent color for a visualization (falls back to a neutral). */
export function vizAccent(id) {
  const v = _byId.get(id);
  return (v && CATEGORIES[v.cat]?.accent) || '#8ab4f8';
}
