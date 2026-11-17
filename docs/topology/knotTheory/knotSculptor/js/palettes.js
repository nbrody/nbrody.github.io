// Rope color gradients, Oklab/Oklch-inspired periodic interpolation, and smooth closure-period relaxation.
// Pure functions (no DOM or Three.js dependency) so unit tests can verify continuity and periodicity.

export const DEFAULT_PALETTE = 'vaporwave';

// Default rope arc-length (in knot-local metres) per full color cycle while drawing.
// A normalized knot (radius ~0.13 m) has length ~0.85–1.6 m, giving ~3–6 lush cycles.
export const ROPE_PERIOD = 0.28;

// Duration (seconds) of the closure smoothing animation that relaxes fractional rope cycles to an integer period.
export const CLOSURE_SMOOTH_DURATION = 0.95;

export const PALETTES = {
  vaporwave: {
    id: 'vaporwave',
    name: 'Vaporwave',
    stops: ['#ff2e93', '#b548f7', '#38bdf8', '#00f5d4', '#6366f1', '#e879f9'],
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    stops: ['#10b981', '#5eead4', '#22d3ee', '#818cf8', '#c084fc', '#38bdf8'],
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    stops: ['#fb7185', '#f97316', '#facc15', '#fb923c', '#ec4899', '#8b5cf6'],
  },
  prism: {
    id: 'prism',
    name: 'Iridescent',
    stops: ['#ff4d6d', '#ff922b', '#ffd43b', '#20c997', '#339af0', '#845ef7', '#f06595'],
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    stops: ['#fde047', '#f59e0b', '#ef4444', '#be185d', '#e11d48', '#fb923c'],
  },
  classic: {
    id: 'classic',
    name: 'Solid (Poincaré)',
    solid: true,
    stops: ['#818cf8', '#22d3ee', '#4ade80', '#f07aa8'],
  },
};

export const PALETTE_IDS = Object.keys(PALETTES);

// ───────────────────────────── color-space helpers (sRGB ↔ Linear ↔ Oklab) ─────────────────────────────

export function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c) {
  c = c < 0 ? 0 : c > 1 ? 1 : c;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function parseHexSrgb(hex) {
  const s = String(hex || '#818cf8').replace('#', '');
  const full = s.length === 3 ? s[0] + s[0] + s[1] + s[1] + s[2] + s[2] : s;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [0.5, 0.55, 0.97];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function parseHexLinear(hex) {
  const [r, g, b] = parseHexSrgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function linearRgbToOklab(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToLinearRgb(L, a, b, out = [0, 0, 0]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  out[0] = Math.min(1, Math.max(0, +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
  out[1] = Math.min(1, Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
  out[2] = Math.min(1, Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
  return out;
}

// Precompute Oklab (L, a, b) control points for C^1-smooth, in-gamut periodic Catmull-Rom evaluation.
const compiledPalettes = new Map();
function getCompiled(id) {
  const key = PALETTES[id] ? id : DEFAULT_PALETTE;
  let c = compiledPalettes.get(key);
  if (c) return c;
  const pal = PALETTES[key];
  const lab = pal.stops.map(hex => {
    const [r, g, b] = parseHexLinear(hex);
    return linearRgbToOklab(r, g, b);
  });
  c = { ...pal, lab };
  compiledPalettes.set(key, c);
  return c;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * Sample a periodic palette at phase `phi` (cycles; wraps mod 1) into linear-sRGB `[r, g, b]`.
 * Smooth (C^1) across all phases including integers.
 */
export function samplePaletteLinear(paletteId, phi, out = [0, 0, 0], fallbackHex = '#818cf8') {
  const pal = getCompiled(paletteId);
  if (pal.solid) {
    const [r, g, b] = parseHexLinear(fallbackHex);
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }
  const { lab } = pal;
  const n = lab.length;
  const safePhi = Number.isFinite(phi) ? phi : 0;
  const wrapped = ((safePhi % 1) + 1) % 1;
  const x = wrapped * n;
  const k = Math.min(n - 1, Math.max(0, Math.floor(x)));
  const t = x - k;
  const p0 = lab[(k - 1 + n) % n];
  const p1 = lab[k];
  const p2 = lab[(k + 1) % n];
  const p3 = lab[(k + 2) % n];

  const L = Math.min(0.98, Math.max(0.05, catmullRom(p0[0], p1[0], p2[0], p3[0], t)));
  const a = catmullRom(p0[1], p1[1], p2[1], p3[1], t);
  const b = catmullRom(p0[2], p1[2], p2[2], p3[2], t);
  return oklabToLinearRgb(L, a, b, out);
}

/** Sample a periodic palette at phase `phi` into display sRGB `[r, g, b]` in `0..1`. */
export function samplePaletteSrgb(paletteId, phi, out = [0, 0, 0], fallbackHex = '#818cf8') {
  samplePaletteLinear(paletteId, phi, out, fallbackHex);
  out[0] = linearToSrgb(out[0]);
  out[1] = linearToSrgb(out[1]);
  out[2] = linearToSrgb(out[2]);
  return out;
}

/** Sample a periodic palette at phase `phi` as a CSS `#rrggbb` string. */
export function samplePaletteHex(paletteId, phi, fallbackHex = '#818cf8') {
  const [r, g, b] = samplePaletteSrgb(paletteId, phi, [0, 0, 0], fallbackHex);
  const h = v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** CSS linear-gradient string (using --in-oklch token when available) for UI swatches. */
export function paletteCSSGradient(paletteId, fallbackHex = '#818cf8') {
  const pal = PALETTES[paletteId] || PALETTES[DEFAULT_PALETTE];
  if (pal.solid) return `linear-gradient(90deg, ${fallbackHex}, ${fallbackHex})`;
  const samples = 9;
  const parts = [];
  for (let i = 0; i <= samples; i++) {
    const pct = ((i / samples) * 100).toFixed(1);
    parts.push(`${samplePaletteHex(paletteId, i / samples, fallbackHex)} ${pct}%`);
  }
  return `linear-gradient(to right var(--in-oklch,), ${parts.join(', ')})`;
}

// ───────────────────────────── arc-length & closure period smoothing ─────────────────────────────

/**
 * Cumulative arc lengths along a 3D polyline `pts` (length `3 * N`).
 * If `closed`, `cum` has length `N + 1` with `cum[N]` = total closed loop length.
 * If `!closed`, `cum` has length `N` with `cum[N - 1]` = open rope length.
 */
export function cumulativeArcLengths(pts, closed = true) {
  const N = Math.floor(pts.length / 3);
  if (N < 1) return { cum: new Float64Array(0), total: 0 };
  const cum = new Float64Array(closed ? N + 1 : N);
  for (let i = 0; i < N - 1; i++) {
    const j = i + 1;
    cum[j] = cum[i] + Math.hypot(pts[3 * j] - pts[3 * i], pts[3 * j + 1] - pts[3 * i + 1], pts[3 * j + 2] - pts[3 * i + 2]);
  }
  if (closed && N >= 2) {
    const a = N - 1;
    cum[N] = cum[a] + Math.hypot(pts[0] - pts[3 * a], pts[1] - pts[3 * a + 1], pts[2] - pts[3 * a + 2]);
  }
  const total = cum[cum.length - 1] || 0;
  return { cum, total };
}

// Quintic C^2 smoothstep on [0, 1] so derivative and curvature vanish cleanly at both ends.
function smootherstep(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Create the gradient winding state for a closed strand.
 * - While `animate: true`, `progress` starts at `0` (preserving the exact rope-length colors
 *   drawn before closure, with a narrow C^2 bridge across the closing segment so there is
 *   never a seam jump) and eases smoothly to `1`, where the color cycles uniformly `targetK`
 *   integer times around the closed knot.
 * - For library / preset knots (`animate: false`), `progress` starts at `1`.
 */
export function createStrandColorState({
  openLength = null,
  closedLength = 1,
  period = ROPE_PERIOD,
  animate = false,
  phaseOffset = 0,
  minCycles = 1,
} = {}) {
  const safeClosed = Number.isFinite(closedLength) && closedLength > 1e-6 ? closedLength : 1;
  const L = Math.max(1e-6, safeClosed);
  const rawQ = L / Math.max(1e-6, Number.isFinite(period) ? period : ROPE_PERIOD);
  const targetK = Math.max(minCycles, Math.round(rawQ));
  const openL = openLength == null || !Number.isFinite(openLength) ? L : Math.min(L, Math.max(0, openLength));
  const uEnd = openL / L;
  const alreadyInteger = Math.abs(rawQ - targetK) < 1e-4 && uEnd > 0.999;
  return {
    rawQ,
    targetK,
    uEnd,
    phaseOffset,
    progress: !animate || alreadyInteger ? 1 : 0,
    duration: CLOSURE_SMOOTH_DURATION,
  };
}

/** Advance a strand's closure-smoothing animation by `dt` seconds. Returns true while still animating. */
export function stepStrandColorState(state, dt) {
  if (!state || state.progress >= 1) return false;
  const dur = state.duration || CLOSURE_SMOOTH_DURATION;
  state.progress = Math.min(1, state.progress + Math.max(0, dt) / dur);
  return state.progress < 1;
}

/**
 * Evaluate the gradient phase (in cycles) at normalized arc-length `u` in `[0, 1]` along a closed loop.
 * Properties for every `progress` in `[0, 1]`:
 *  1. Seam-free: `strandPhaseAt(1, state) - strandPhaseAt(0, state) === state.targetK` (exact integer!).
 *  2. Jump-free at closure (`progress === 0`): on `[0, 1 - w0]`, `phase === phaseOffset + rawQ * u`,
 *     matching `s / period` of the open stroke right before release.
 *  3. Uniform integer period at completion (`progress === 1`): `phase === phaseOffset + targetK * u`.
 */
export function strandPhaseAt(u, state) {
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  if (!state) return u;
  const { rawQ, targetK, uEnd = 0.92, phaseOffset = 0, progress = 1 } = state;
  if (progress >= 1) return phaseOffset + targetK * u;
  const t = Math.max(0, Math.min(1, progress));
  // Smooth cubic ease-out in time so relaxation starts immediately on closure and settles silkily.
  const alpha = 1 - Math.pow(1 - t, 3);
  const w0 = Math.min(0.45, Math.max(0.08, 1 - uEnd + 0.04));
  const w = w0 + (1 - w0) * alpha;
  const bridge = smootherstep((u - (1 - w)) / Math.max(1e-6, w));
  const beta = (1 - alpha) * bridge + alpha * u;
  return phaseOffset + rawQ * u + (targetK - rawQ) * beta;
}

/**
 * Compute linear-sRGB ring colors (`Float32Array` of length `3 * N`) for a closed or open tube.
 */
export function ringColorsForStrand(pts, {
  closed = true,
  paletteId = DEFAULT_PALETTE,
  state = null,
  period = ROPE_PERIOD,
  phaseOffset = 0,
  fallbackHex = '#818cf8',
  out = null,
} = {}) {
  const N = Math.floor(pts.length / 3);
  const colors = out && out.length === 3 * N ? out : new Float32Array(3 * N);
  if (N < 1) return colors;
  const { cum, total } = cumulativeArcLengths(pts, closed);
  const rgb = [0, 0, 0];
  if (!closed) {
    const p = Math.max(1e-6, period);
    for (let i = 0; i < N; i++) {
      const phi = phaseOffset + cum[i] / p;
      samplePaletteLinear(paletteId, phi, rgb, fallbackHex);
      colors[3 * i] = rgb[0]; colors[3 * i + 1] = rgb[1]; colors[3 * i + 2] = rgb[2];
    }
    return colors;
  }
  const L = Math.max(1e-9, total);
  for (let i = 0; i < N; i++) {
    const u = cum[i] / L;
    const phi = state ? strandPhaseAt(u, state) : phaseOffset + Math.max(1, Math.round(L / period)) * u;
    samplePaletteLinear(paletteId, phi, rgb, fallbackHex);
    colors[3 * i] = rgb[0]; colors[3 * i + 1] = rgb[1]; colors[3 * i + 2] = rgb[2];
  }
  return colors;
}
