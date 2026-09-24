// elements.js — one element palette shared by the supernova (Ch. 1), the
// chemistry (Ch. 2) and anything that calls back to them, so an oxygen atom
// looks the same when it is forged, scattered, and bonded.
// Colors follow CPK conventions, nudged to glow on black.

export const ELEMENTS = {
  H:  { z: 1,  color: [0.90, 0.94, 1.00], r: 0.55 },
  He: { z: 2,  color: [1.00, 0.80, 0.45], r: 0.60 },
  C:  { z: 6,  color: [0.46, 0.48, 0.56], r: 0.85, glow: [0.95, 0.70, 0.45] },
  N:  { z: 7,  color: [0.30, 0.48, 1.00], r: 0.80 },
  O:  { z: 8,  color: [1.00, 0.24, 0.20], r: 0.78 },
  Ne: { z: 10, color: [1.00, 0.36, 0.62], r: 0.70 },
  Mg: { z: 12, color: [0.55, 1.00, 0.45], r: 0.95 },
  Si: { z: 14, color: [0.95, 0.76, 0.55], r: 1.00 },
  P:  { z: 15, color: [1.00, 0.55, 0.12], r: 0.95 },
  S:  { z: 16, color: [1.00, 0.88, 0.25], r: 0.95 },
  Fe: { z: 26, color: [0.92, 0.46, 0.22], r: 1.00 },
};

/** Color to use when an element is drawn as light (supernova debris, spectra). */
export function glowColor(sym) {
  const e = ELEMENTS[sym];
  return e.glow || e.color;
}

// Nucleon cluster layouts (unit sphere packing, 2D projected) for drawing
// nuclei as little clumps of protons (P) and neutrons (N).
export const NUCLEI = {
  p:   { label: 'H',   parts: [['P', 0, 0, 0]] },
  D:   { label: '²H',  parts: [['P', -0.55, 0, 0], ['N', 0.55, 0, 0]] },
  He3: { label: '³He', parts: [['P', -0.55, 0.32, 0], ['P', 0.55, 0.32, 0], ['N', 0, -0.62, 0.1]] },
  He4: { label: '⁴He', parts: [['P', -0.55, 0.3, 0.2], ['N', 0.55, 0.3, -0.2], ['N', -0.1, -0.6, -0.3], ['P', 0.15, -0.1, 0.65]] },
};

// Larger nuclei are generated as a fibonacci-ish packed ball.
function ball(nP, nN) {
  const n = nP + nN, parts = [];
  const R = Math.cbrt(n) * 0.62;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(1 - y * y);
    const phi = i * 2.399963;
    const s = R * Math.cbrt((i + 0.6) / n);
    parts.push([i % 2 === 0 && parts.filter((p) => p[0] === 'P').length < nP ? 'P' : 'N',
      Math.cos(phi) * rr * s, y * s, Math.sin(phi) * rr * s]);
  }
  // balance counts exactly
  let p = parts.filter((q) => q[0] === 'P').length;
  for (const q of parts) {
    if (p < nP && q[0] === 'N') { q[0] = 'P'; p++; }
    else if (p > nP && q[0] === 'P') { q[0] = 'N'; p--; }
  }
  return parts;
}
NUCLEI.C12 = { label: '¹²C', parts: ball(6, 6) };
NUCLEI.O16 = { label: '¹⁶O', parts: ball(8, 8) };

export const PROTON = [1.0, 0.36, 0.26];
export const NEUTRON = [0.58, 0.66, 0.86];
