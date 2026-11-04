/**
 * Face colors from a list of hex colors (a palette made in the Design
 * Studio, /designStudio/palettes/). Pairing class k takes color k; when a
 * domain has more classes than the palette has colors, the palette repeats
 * lighter, then darker, then lighter still, so every class stays distinct
 * and the palette keeps its character.
 */

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToOklab(rgb) {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

function oklabToLinear([L, A, B]) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

function oklabToRgb(lab) {
    return oklabToLinear(lab).map((c) => clamp01(toSrgb(c)));
}

const inGamut = (lab) => oklabToLinear(lab).every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/**
 * The OKLCH midpoint of two colors (lightness and chroma averaged, hue half
 * way round the short arc), with its chroma cut back into sRGB if need be.
 * Returns the color and the hue gap it bridges (0…π).
 */
export function mixColor(x, y) {
    const p = rgbToOklab(x), q = rgbToOklab(y);
    const C1 = Math.hypot(p[1], p[2]), C2 = Math.hypot(q[1], q[2]);
    const h1 = Math.atan2(p[2], p[1]), h2 = Math.atan2(q[2], q[1]);
    let h, gap = 0;
    if (C1 < 0.02) h = h2;                 // a near-neutral end takes the other's hue
    else if (C2 < 0.02) h = h1;
    else {
        let d = h2 - h1;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d <= -Math.PI) d += 2 * Math.PI;
        h = h1 + d / 2;
        gap = Math.abs(d);
    }
    const L = (p[0] + q[0]) / 2;
    let lo = 0, hi = (C1 + C2) / 2;
    const at = (C) => [L, C * Math.cos(h), C * Math.sin(h)];
    if (!inGamut(at(hi))) {
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(at(mid))) lo = mid; else hi = mid;
        }
        hi = lo;
    }
    return { rgb: oklabToRgb(at(hi)), gap };
}

const ORDER_COST = 0.04;   // a slight lean toward the palette's earlier colors
const MIX_COST = 0.12;     // an in-between hue of two palette colors (more for a wider gap)
const ROUND_COST = 0.15;   // a lighter or darker copy of a palette color, per round

/**
 * Candidate face colors for k pairing classes from a palette of hex colors,
 * each with a cost (see faceColoring.js): the palette's own colors; when k is
 * larger than the palette, the in-between hue of every pair of them, then
 * lighter and darker copies, until there are k + n candidates. Candidates
 * that come out nearly identical are kept once.
 */
export function discretePool(colors, k) {
    const n = colors.length, want = k + n, out = [], labs = [];
    const add = (rgb, cost) => {
        const lab = rgbToOklab(rgb);
        if (labs.some((q) => Math.hypot(q[0] - lab[0], q[1] - lab[1], q[2] - lab[2]) < 0.02)) return;
        out.push({ rgb, cost });
        labs.push(lab);
    };
    const base = colors.map(hexToRgb);
    base.forEach((rgb, i) => add(rgb, ORDER_COST * i / n));
    if (k > n) {
        const mixes = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const { rgb, gap } = mixColor(base[i], base[j]);
                mixes.push({ rgb, cost: MIX_COST + 0.08 * gap / Math.PI + ORDER_COST * (i + j) / (2 * n) });
            }
        }
        mixes.sort((a, b) => a.cost - b.cost).forEach((c) => add(c.rgb, c.cost));
    }
    for (let r = 1; out.length < want && r < 12; r++) {
        for (let i = 0; i < n; i++) add(discreteClassColor(colors, r * n + i), ROUND_COST * r + ORDER_COST * i / n);
    }
    // Still short (a tiny palette, many classes): repeats are allowed.
    for (let i = 0; out.length < want; i++) out.push({ rgb: base[i % n], cost: ROUND_COST * 12 });
    return out;
}

/** Class k of a palette given as hex colors → [r, g, b] in [0, 1] (sRGB). */
export function discreteClassColor(colors, k) {
    const n = colors.length;
    const base = hexToRgb(colors[k % n]);
    const round = Math.floor(k / n);
    if (!round) return base;
    // round 1 lighter, 2 darker, 3 lighter again (further), …
    const step = Math.ceil(round / 2) * 0.1 * (round % 2 ? 1 : -1);
    const [L, a, b] = rgbToOklab(base);
    const L2 = Math.min(0.95, Math.max(0.25, L + step));
    const shrink = Math.min(1, (1 - Math.abs(L2 - 0.65)) / Math.max(0.2, 1 - Math.abs(L - 0.65)));
    return oklabToRgb([L2, a * shrink, b * shrink]);
}

export const isHexList = (xs) => Array.isArray(xs) && xs.length >= 2 && xs.length <= 24 &&
    xs.every((c) => typeof c === 'string' && /^#?[0-9a-fA-F]{6}$/.test(c));
