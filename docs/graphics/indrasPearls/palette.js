// palette.js — colour themes and colouring schemes shared by the figures.
//
// A limit-set render produces one label per pixel (0 = nothing, 1…255 = the
// class of the word that reached it); a scheme says what the labels mean and a
// theme turns them into colours. Themes are four anchor colours — one per
// generator a, b, A, B — plus a background and two accents for circle chains.
// Derived colours are mixed in OKLab so blends and gradients stay even.

// ---- OKLab <-> sRGB ------------------------------------------------------------
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToLab([r, g, b]) {
  [r, g, b] = [r, g, b].map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function labToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((v) => Math.round(255 * Math.min(1, Math.max(0, toSrgb(Math.max(0, v))))));
}
const mixLab = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const mix = (p, q, t) => labToRgb(mixLab(rgbToLab(p), rgbToLab(q), t));
const shade = (c, dL) => { const lab = rgbToLab(c); lab[0] = Math.min(0.97, Math.max(0.08, lab[0] + dL)); return labToRgb(lab); };

// ---- themes ------------------------------------------------------------------------
// anchors are in generator order a, b, A, B.
export const THEMES = {
  tidepool: { label: 'Tidepool', bg: '#f6f1e7', anchors: ['#e0674f', '#2a7f8e', '#e9b949', '#34495e'], chains: ['#1f5f6b', '#c8553d'] },
  nocturne: { label: 'Nocturne', bg: '#0c1016', anchors: ['#ff8a6b', '#5cc8e0', '#ffd479', '#a38bff'], chains: ['#e8f1ff', '#ff5d8f'] },
  ink: { label: 'Ink & paper', bg: '#f3eee3', anchors: ['#a8323e', '#1d3557', '#c98b2b', '#5a7d5a'], chains: ['#1d3557', '#a8323e'] },
  glacier: { label: 'Glacier', bg: '#fbfcfd', anchors: ['#6c8ebf', '#9ec9c2', '#3d4f7d', '#d8e2ef'], chains: ['#2c3e66', '#8fb8b0'] },
  ember: { label: 'Ember', bg: '#140d0b', anchors: ['#ff6b35', '#f7c548', '#c1121f', '#ffe8c2'], chains: ['#fff4e0', '#ff9e00'] },
  orchid: { label: 'Orchid', bg: '#fdf7fb', anchors: ['#b5569f', '#6a5acd', '#f28fb0', '#3f8f8a'], chains: ['#4b2a6b', '#d4508a'] },
  book: { label: 'Book (original)', bg: '#ffffff', anchors: ['#e41616', '#182ce2', '#1acc2c', '#f4e000'], chains: ['#27a9bf', '#de6ea0'] },
};

/** A cyclic gradient through the four anchors (a → b → A → B → a), n steps. */
export function cyclicRamp(theme, n = 256) {
  const labs = theme.anchors.map((h) => rgbToLab(hexToRgb(h)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 4, k = Math.floor(t), f = t - k;
    const e = f * f * (3 - 2 * f); // ease so each anchor holds a little longer
    out.push(labToRgb(mixLab(labs[k % 4], labs[(k + 1) % 4], e)));
  }
  return out;
}

/** The book's HSV rainbow, for Fig 12.1. */
export function rainbowRamp(n = 256) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (i / n) * 6;
    const c = [0, 4, 2].map((o) => Math.min(1, Math.max(0, Math.abs(((h + o) % 6) - 3) - 1)));
    out.push(c.map((v) => Math.round(v * 255)));
  }
  return out;
}

// ---- colouring schemes ---------------------------------------------------------------
// `id` is sent to the worker, which computes labels (see limitWorker.js).
export const SCHEMES = [
  { id: 'l1', label: '1st letter', kind: 'letter' },
  { id: 'l2', label: '2nd letter', kind: 'letter' },
  { id: 'l3', label: '3rd letter', kind: 'letter' },
  { id: 'l4', label: '4th letter', kind: 'letter' },
  { id: 'last', label: 'last letter of leaf', kind: 'letter' },
  { id: 'p1', label: 'letters 1–2 (12)', kind: 'pair' },
  { id: 'p2', label: 'letters 2–3 (12)', kind: 'pair' },
  { id: 'p3', label: 'letters 3–4 (12)', kind: 'pair' },
  { id: 't1', label: 'letters 1–3 (36)', kind: 'triple' },
  { id: 'turns', label: 'turns at letters 2–4 (27)', kind: 'turns' },
  { id: 'abel', label: 'abelian drift (a−A, b−B)', kind: 'cyclic' },
  { id: 'depth', label: 'word length', kind: 'ramp' },
];

// A reduced word turns left (k+1), straight (k) or right (k−1) at each letter.
const TURN_SHADE = [0.1, 0, -0.1];

/**
 * The 256-entry lookup table for a scheme under a theme. `soften` in [0, 1]
 * blends every class toward the background (Fig 10.10's pale regions).
 */
export function buildLut(schemeId, themeId, soften = 0) {
  const theme = THEMES[themeId];
  const bg = hexToRgb(theme.bg);
  const A = theme.anchors.map(hexToRgb);
  const kind = SCHEMES.find((s) => s.id === schemeId).kind;
  const lut = Array.from({ length: 256 }, () => bg);
  if (kind === 'letter') {
    for (let l = 0; l < 4; l++) lut[1 + l] = A[l];
  } else if (kind === 'pair') {
    // Hue from the first letter, pulled toward the second, lightness by turn.
    for (let l = 0; l < 4; l++) {
      for (let t = 0; t < 3; t++) {
        const next = (l + 1 - t + 4) % 4;
        lut[1 + l * 3 + t] = shade(mix(A[l], A[next], 0.28), TURN_SHADE[t]);
      }
    }
  } else if (kind === 'triple') {
    for (let l = 0; l < 4; l++) {
      for (let t2 = 0; t2 < 3; t2++) {
        const l2 = (l + 1 - t2 + 4) % 4;
        for (let t3 = 0; t3 < 3; t3++) {
          const l3 = (l2 + 1 - t3 + 4) % 4;
          const c = mix(mix(A[l], A[l2], 0.3), A[l3], 0.18);
          lut[1 + l * 9 + t2 * 3 + t3] = shade(c, TURN_SHADE[t2] * 0.9 + TURN_SHADE[t3] * 0.5);
        }
      }
    }
  } else if (kind === 'turns') {
    // Left / straight / right, three times over: the "grammar" of the word.
    const base = [A[0], A[1], A[3]];
    for (let t2 = 0; t2 < 3; t2++) {
      for (let t3 = 0; t3 < 3; t3++) {
        for (let t4 = 0; t4 < 3; t4++) {
          lut[1 + t2 * 9 + t3 * 3 + t4] = shade(mix(base[t2], base[t3], 0.3), TURN_SHADE[t4] * 1.4);
        }
      }
    }
  } else if (kind === 'cyclic') {
    const ramp = cyclicRamp(theme, 254);
    for (let i = 0; i < 254; i++) lut[1 + i] = ramp[i];
    lut[255] = mix(A[0], bg, 0.5); // no net drift
  } else {
    // Sequential: from the background's opposite through the anchors.
    const ramp = cyclicRamp(theme, 340).slice(0, 255);
    for (let i = 0; i < 255; i++) lut[1 + i] = ramp[i];
  }
  if (soften > 0) for (let i = 1; i < 256; i++) lut[i] = mix(lut[i], bg, soften);
  return { lut, bg, chains: theme.chains };
}
