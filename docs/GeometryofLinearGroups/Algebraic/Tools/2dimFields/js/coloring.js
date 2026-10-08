// Colouring the planes and balls: a palette of colour stops, and a rule that gives each vertex a
// number t ∈ [0, 1] along it (or none, for a neutral tone). The stops are mid-tones; each is
// restyled for its role and the theme in OKLab (fills deep in the dark theme and pale in the
// light one, outlines the other way round), keeping its hue and a third of its own lightness, so
// every palette reads in both themes and a one-hue palette still shows its range.

export const PALETTES = [
    { id: 'iris', name: 'Iris & jade', stops: ['#7F77DD', '#1D9E75'] },
    { id: 'ember', name: 'Ember', stops: ['#F6C453', '#F0824F', '#C8456E', '#6A3D9A'] },
    { id: 'ocean', name: 'Ocean', stops: ['#1F4E8C', '#2C8FC9', '#3CC2B4', '#A5E3A0'] },
    { id: 'viridis', name: 'Viridis', stops: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'] },
    { id: 'spectrum', name: 'Spectrum', stops: ['#E8575A', '#F2A541', '#C9CC4A', '#4FB878', '#3FA0D9', '#8E6FD8'], cyclic: true },
    { id: 'ink', name: 'Ink', stops: ['#3A4252', '#C4CAD6'] },
];

export const RULES = [
    { id: 'type', name: 'Vertex type',
        hint: 'The tree is bipartite: the two types of vertex alternate along every path. Elements whose determinant has odd valuation swap them.' },
    { id: 'depth', name: 'Distance from v₀', hint: 'The number of edges from the base vertex v₀.' },
    { id: 'level', name: 'Horocycle level',
        hint: 'The Busemann function of the end ∞: every edge climbs one level toward ∞ or drops one away from it. On the half-plane the heights follow these levels.' },
    { id: 'branch', name: 'Branch at v₀',
        hint: 'Which neighbour of v₀ the path from v₀ leaves through: each branch takes the hue of its cusp on the base, so the ends of the tree group by colour.' },
    { id: 'height', name: 'Cusp height',
        hint: 'The height of the cusp a plane hangs from: q at p/q (|q| over ℚ(i) and ℚ(ω)). Big Ford circles in the first colour, small ones in the last.' },
    { id: 'moved', name: 'Moved by g',
        hint: 'How far the current element moves each vertex, d(v, g·v): its fixed tree, or the axis of a hyperbolic element, takes the first colour.' },
];

// ---------- OKLab (Björn Ottosson), to and from linear sRGB ----------
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexToLab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = lin((n >> 16 & 255) / 255), g = lin((n >> 8 & 255) / 255), b = lin((n & 255) / 255);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function labToLinear(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
// The colour of lightness L and hue (a, b), with as much of its chroma as fits in sRGB.
function inGamut(L, a, b) {
    const ok = (k) => labToLinear(L, a * k, b * k).every((x) => x >= -1e-4 && x <= 1 + 1e-4);
    if (ok(1)) return labToLinear(L, a, b);
    let lo = 0, hi = 1;
    for (let i = 0; i < 14; i++) { const k = (lo + hi) / 2; if (ok(k)) lo = k; else hi = k; }
    return labToLinear(L, a * lo, b * lo).map((x) => Math.min(1, Math.max(0, x)));
}

// Per role and theme: the target lightness, and how much of the stop's chroma to keep.
const ROLES = {
    dark: { fill: [0.29, 0.78], str: [0.80, 0.85], horo: [0.68, 1], ball: [0.52, 1] },
    light: { fill: [0.94, 0.38], str: [0.47, 1], horo: [0.72, 0.9], ball: [0.80, 0.85] },
};
const restyle = ([L, a, b], [Lr, k]) => inGamut(Math.min(0.985, Math.max(0.08, Lr + 0.35 * (L - 0.62))), a * k, b * k);

// The palette at t ∈ [0, 1], interpolated in OKLab (a cyclic palette wraps round to its first stop).
function sampler(pal) {
    const labs = pal.stops.map(hexToLab), n = labs.length;
    return (t) => {
        const x = pal.cyclic ? t * n : t * (n - 1), i = Math.min(Math.floor(x), pal.cyclic ? n - 1 : n - 2), f = x - i;
        const A = labs[i], B = labs[(i + 1) % n];
        return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
    };
}

// Linear-sRGB shades for every role: entries 0…N along the palette, and entry N + 1 neutral (the
// palette's mean, nearly grey).
export function shades(pal, theme, N) {
    const at = sampler(pal), labs = pal.stops.map(hexToLab);
    const mean = [0, 1, 2].map((j) => labs.reduce((s, c) => s + c[j], 0) / labs.length);
    const neutral = [mean[0], mean[1] * 0.25, mean[2] * 0.25];
    const out = {};
    for (const [role, spec] of Object.entries(ROLES[theme])) {
        out[role] = [];
        for (let i = 0; i <= N; i++) out[role].push(restyle(at(i / N), spec));
        out[role].push(restyle(neutral, spec));
    }
    return out;
}

// A CSS gradient through the stops, for the palette's swatch.
export const swatch = (pal) => `linear-gradient(90deg, ${[...pal.stops, ...(pal.cyclic ? [pal.stops[0]] : [])].join(', ')})`;
