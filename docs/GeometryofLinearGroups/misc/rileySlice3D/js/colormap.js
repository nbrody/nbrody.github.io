// ============================================================
//  colormap.js — Viridis & Inferno colormaps (256 entries)
//  Using accurate degree-6 polynomial fits (Matt Zucker / Inigo Quilez)
// ============================================================

// Degree-6 polynomial coefficients per channel: c0 + t*(c1 + t*(c2 + ...))
// These are the well-known ShaderToy/matplotlib polynomial approximations.

const VIRIDIS_COEFFS = [
    // [c0, c1, c2, c3, c4, c5, c6] for R, G, B
    [0.2777273272234177, 0.1050930431085774, -0.3308618287255563, -4.634230498983486, 6.228269936347081, 4.776384997670612, -5.435455855934631],
    [0.005407344544966578, 1.404613529898575, 0.214847559468213, -5.799100973351585, 14.17993336680509, -13.74514537774601, 4.645852612178535],
    [0.3340998053353061, 1.749339951367745, 0.09509516302823659, -19.33244095627987, 56.69055260068105, -65.35303263337234, 26.3124352495832],
];

const INFERNO_COEFFS = [
    [0.0002189403691192265, 0.1065134194856116, 11.60249308247187, -41.70399613139459, 77.162935699427, -73.76882330631613, 27.16442524311797],
    [0.001651004631001012, 0.5639564367884091, -3.972853965665698, 17.43639888205313, -33.40235894210092, 32.62606426397723, -12.24266895238567],
    [-0.01948089843709184, 3.932712388889277, -15.9423941062914, 44.35414519872813, -81.80730925738993, 73.20951985803202, -23.07032500287172],
];

function evalPoly6(t, coeffs) {
    const [c0, c1, c2, c3, c4, c5, c6] = coeffs;
    return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

function buildTable(allCoeffs) {
    const table = new Array(256);
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        table[i] = [
            Math.max(0, Math.min(1, evalPoly6(t, allCoeffs[0]))),
            Math.max(0, Math.min(1, evalPoly6(t, allCoeffs[1]))),
            Math.max(0, Math.min(1, evalPoly6(t, allCoeffs[2]))),
        ];
    }
    return table;
}

export const VIRIDIS = buildTable(VIRIDIS_COEFFS);
export const INFERNO = buildTable(INFERNO_COEFFS);

/**
 * Look up a color from a colormap table.
 * @param {number} t  Value in [0, 1]
 * @param {THREE.Color} color  THREE.Color to write into
 * @param {Array} table  Colormap table (default: VIRIDIS)
 */
export function colormapLookup(t, color, table = VIRIDIS) {
    const i = Math.max(0, Math.min(255, Math.round(t * 255)));
    const [r, g, b] = table[i];
    color.setRGB(r, g, b);
}
