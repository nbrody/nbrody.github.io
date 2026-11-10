// Color maths for the palette studio: sRGB ↔ OKLab ↔ OKLCH, gamut mapping,
// the sRGB chroma limit, and color-vision simulation. Runs in the browser
// and in Node (the corpus build and the tests import it).
//
// Conventions: rgb channels in [0, 1] (gamma-encoded sRGB), OKLab as [L, a, b]
// with L in [0, 1], OKLCH as [L, C, h] with h in degrees [0, 360).

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

// ---------------- hex ----------------

export function hexToRgb(hex) {
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a hex color: ${hex}`);
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb) {
    return '#' + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('');
}

export const isHex = (s) => /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(s).trim());

// ---------------- sRGB transfer ----------------

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);

// ---------------- OKLab (Björn Ottosson) ----------------

export function linearRgbToOklab([r, g, b]) {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ];
}

export function oklabToLinearRgb([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

export const rgbToOklab = (rgb) => linearRgbToOklab(rgb.map(srgbToLinear));
export const oklabToRgb = (lab) => oklabToLinearRgb(lab).map(linearToSrgb);

export function oklabToOklch([L, a, b]) {
    const C = Math.hypot(a, b);
    let h = Math.atan2(b, a) / RAD;
    if (h < 0) h += 360;
    return [L, C, C < 1e-6 ? 0 : h];
}

export function oklchToOklab([L, C, h]) {
    return [L, C * Math.cos(h * RAD), C * Math.sin(h * RAD)];
}

export const hexToOklab = (hex) => rgbToOklab(hexToRgb(hex));
export const hexToOklch = (hex) => oklabToOklch(hexToOklab(hex));

// ---------------- gamut ----------------

const GAMUT_EPS = 1e-5;
export function linearInGamut(lin) {
    return lin.every((c) => c >= -GAMUT_EPS && c <= 1 + GAMUT_EPS);
}

/** Largest in-gamut chroma at (L, h), by bisection. */
export function maxChromaExact(L, h) {
    if (L <= 0 || L >= 1) return 0;
    let lo = 0, hi = 0.4;
    for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (linearInGamut(oklabToLinearRgb(oklchToOklab([L, mid, h])))) lo = mid; else hi = mid;
    }
    return lo;
}

// A table of the chroma limit (L every 0.01, h every 2°), read bilinearly.
const TL = 101, TH = 180;
let chromaTable = null;
function buildChromaTable() {
    chromaTable = new Float32Array(TL * TH);
    for (let i = 0; i < TL; i++) {
        for (let j = 0; j < TH; j++) chromaTable[i * TH + j] = maxChromaExact(i / (TL - 1), j * 2);
    }
}

export function maxChroma(L, h) {
    if (!chromaTable) buildChromaTable();
    if (L <= 0 || L >= 1) return 0;
    const x = L * (TL - 1), i = Math.min(TL - 2, Math.floor(x)), fx = x - i;
    const hh = ((h % 360) + 360) % 360 / 2, j = Math.floor(hh) % TH, fy = hh - Math.floor(hh), j1 = (j + 1) % TH;
    const t = chromaTable;
    const a = t[i * TH + j] * (1 - fx) + t[(i + 1) * TH + j] * fx;
    const b = t[i * TH + j1] * (1 - fx) + t[(i + 1) * TH + j1] * fx;
    return a * (1 - fy) + b * fy;
}

// Lightness of the most chromatic in-gamut color at each hue (the "cusp"):
// yellow is naturally light, blue naturally dark.
let cuspTable = null;
export function cuspLightness(h) {
    if (!cuspTable) {
        if (!chromaTable) buildChromaTable();
        cuspTable = new Float32Array(TH);
        for (let j = 0; j < TH; j++) {
            let best = 0, bestL = 0.5;
            for (let i = 1; i < TL - 1; i++) {
                const c = chromaTable[i * TH + j];
                if (c > best) { best = c; bestL = i / (TL - 1); }
            }
            cuspTable[j] = bestL;
        }
    }
    const hh = ((h % 360) + 360) % 360 / 2, j = Math.floor(hh) % TH, f = hh - Math.floor(hh);
    return cuspTable[j] * (1 - f) + cuspTable[(j + 1) % TH] * f;
}

/** Bring an OKLCH color into sRGB by lowering chroma at fixed L and h. */
export function gamutMapOklch([L, C, h]) {
    const LL = Math.min(1, Math.max(0, L));
    if (LL <= 0) return [0, 0, h];
    if (LL >= 1) return [1, 0, h];
    if (linearInGamut(oklabToLinearRgb(oklchToOklab([LL, C, h])))) return [LL, Math.max(0, C), h];
    let lo = 0, hi = C;
    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        if (linearInGamut(oklabToLinearRgb(oklchToOklab([LL, mid, h])))) lo = mid; else hi = mid;
    }
    return [LL, lo, h];
}

export function oklchToHex(lch) {
    const g = gamutMapOklch(lch);
    return rgbToHex(oklabToRgb(oklchToOklab(g)));
}

export const oklabToHex = (lab) => oklchToHex(oklabToOklch(lab));

// ---------------- differences ----------------

export function deltaE(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Signed hue difference b − a in (−180, 180]. */
export function hueDiff(a, b) {
    let d = ((b - a) % 360 + 540) % 360 - 180;
    return d === -180 ? 180 : d;
}

export const wrapHue = (h) => ((h % 360) + 360) % 360;

// ---------------- WCAG contrast ----------------

export function relativeLuminance(rgb) {
    const [r, g, b] = rgb.map(srgbToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(rgbA, rgbB) {
    const a = relativeLuminance(rgbA), b = relativeLuminance(rgbB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ---------------- color vision (Machado et al. 2009, severity 1) ----------------

const CVD = {
    protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};

export function simulateCvd(hex, kind) {
    const M = CVD[kind];
    if (!M) return hex;
    const lin = hexToRgb(hex).map(srgbToLinear);
    const out = M.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
    return rgbToHex(out.map((c) => linearToSrgb(clamp01(c))));
}

// ---------------- small helpers ----------------

/** Mix two hex colors in OKLab. */
export function mixHex(a, b, t) {
    const A = hexToOklab(a), B = hexToOklab(b);
    return oklabToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** Readable text color (near-black or white) for a background. */
export function inkOn(hex) {
    return hexToOklab(hex)[0] > 0.66 ? '#14161c' : '#ffffff';
}
