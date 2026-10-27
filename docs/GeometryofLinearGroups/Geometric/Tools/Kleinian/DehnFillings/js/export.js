// export.js — groups to poincare: normalize the holonomy and pack it into poincare's #s= permalink.
//
// Cusped: conjugate so the meridian of cusp 0 is z ↦ z + 1 (cusp at ∞).
// Filled or cone-angle 2π/n: conjugate so the core geodesic of cusp 0 runs from 0 to ∞, then
// shift slightly so poincare's basepoint (0, 0, 1) is not on the core (it would be fixed by the
// elliptic element of an orbifold).

import { C, ONE, ZERO, abs, sub, div, neg, mmul, madj, msl2, fixedPoints, affine, mtrace } from './complex.js';

/** poincare's #s= hash for a state object (base64url JSON). */
export function stateHash(st) {
    const bytes = new TextEncoder().encode(JSON.stringify(st));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return '#s=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const POINCARE = '../poincare/index.html';

/** A complex entry as poincare reads it (LaTeX, no exponent notation). */
export function entryTex(z, digits = 13) {
    const clean = (x) => (Math.abs(x) < 10 ** -digits ? 0 : x);
    const re = clean(z.re), im = clean(z.im);
    const num = (x) => {
        let s = Math.abs(x).toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
        return s === '' ? '0' : s;
    };
    if (im === 0) return (re < 0 ? '-' : '') + num(re);
    const imPart = `${num(im)}i`;
    if (re === 0) return (im < 0 ? '-' : '') + imPart;
    return `${re < 0 ? '-' : ''}${num(re)}${im < 0 ? '-' : '+'}${imPart}`;
}

const conjBy = (X, M) => mmul(mmul(X, M), madj(X));

/** The conjugator putting a cusped group in normal form (meridian z ↦ z + 1). */
export function cuspedFrame(meridian) {
    const fps = fixedPoints(meridian);
    const p = affine(fps[0]);
    let X = p === null ? [ONE, ZERO, ZERO, ONE] : msl2([ZERO, ONE, ONE, neg(p)]);       // z ↦ 1/(z − p)
    let M = conjBy(X, meridian);
    if (mtrace(M).re < 0) M = M.map(neg);
    // M = (1 μ; 0 1): scale z ↦ z/μ
    const mu = div(M[1], M[3]);
    const S = msl2([ONE, ZERO, ZERO, mu]);
    return mmul(S, X);
}

/** The conjugator for a closed (or cone) structure: the core axis from 0 to ∞, then a small shift. */
export function filledFrame(meridian, longitude, shift = C(0.137, 0.071)) {
    let fps = fixedPoints(meridian);
    if (fps.length < 2 || isNearIdentity(meridian)) fps = fixedPoints(longitude);
    if (fps.length < 2) return null;
    const f1 = affine(fps[0]), f2 = affine(fps[1]);
    let X;
    if (f2 === null) X = [ONE, neg(f1), ZERO, ONE];
    else if (f1 === null) X = msl2([ZERO, ONE, ONE, neg(f2)]);
    else X = msl2([ONE, neg(f1), ONE, neg(f2)]);                 // z ↦ (z − f1)/(z − f2)
    // scale so the core's translation is visible but the domain stays near the basepoint
    const T = [ONE, shift, ZERO, ONE];
    return mmul(T, X);
}

function isNearIdentity(M) {
    const t = mtrace(M);
    return Math.min(abs(sub(t, C(2))), abs(sub(t, C(-2)))) < 1e-8 && abs(M[1]) + abs(M[2]) < 1e-8;
}

/**
 * A poincare state for SL₂ℂ matrices in decimals. poincare reads decimals as exact rationals,
 * which would make it certify a nearby, different group; the transcendental constant `float`
 * (unused by the entries) makes it work in floating point instead, and its field badge says so.
 */
export function decimalState(mats, { depth = 8, faces = 96 } = {}) {
    return {
        v: 1,
        mats: mats.map((M) => msl2(M).map((x) => entryTex(x))),
        anti: mats.map(() => false),
        consts: [['float', '\\ln(1)']],
        depth,
        faces,
    };
}

/** The poincare URL of an exact record from exact/<id>.json ({poly, near, mats}). */
export function exactRecordLink(rec, { depth = 8 } = {}) {
    return exactLink({ mats: rec.mats, consts: [{ name: 'w', poly: rec.poly, near: { re: rec.near[0], im: rec.near[1] } }], depth });
}

/** Normalize generators by X and return the poincare URL. */
export function poincareLink(X, gens, opts = {}) {
    const mats = gens.map((G) => conjBy(X, G));
    return POINCARE + stateHash(decimalState(mats, opts));
}

/** A poincare URL for an exact state (mats of LaTeX strings, consts rows). */
export function exactLink({ mats, consts = [], anti = null, depth = 8, faces = 96 }) {
    return POINCARE + stateHash({ v: 1, mats, anti: anti || mats.map(() => false), consts, depth, faces });
}
