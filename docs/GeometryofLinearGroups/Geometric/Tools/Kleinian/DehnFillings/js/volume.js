// volume.js — the Lobachevsky function and the volume of ideal tetrahedra.
//
// Л(θ) = −∫₀^θ log|2 sin t| dt = ½ Cl₂(2θ), and the ideal tetrahedron of shape z
// has (signed) volume D(z) = Л(arg z) + Л(arg z′) + Л(arg z″), the Bloch–Wigner
// dilogarithm: positive for positively oriented shapes, negative otherwise.

import { arg, div, sub, ONE } from './complex.js';

// |B_{2k}| / (2k (2k+1)!) for the series Cl₂(x) = x − x log|x| + Σ c_k x^{2k+1}, |x| < 2π
const BERN = [1 / 6, 1 / 30, 1 / 42, 1 / 30, 5 / 66, 691 / 2730, 7 / 6, 3617 / 510, 43867 / 798, 174611 / 330,
    854513 / 138, 236364091 / 2730, 8553103 / 6, 23749461029 / 870, 8615841276005 / 14322, 7709321041217 / 510,
    2577687858367 / 6, 26315271553053477373 / 1919190, 2929993913841559 / 6, 261082718496449122051 / 13530];
const COEF = BERN.map((b, i) => {
    const k = i + 1;
    let f = 1;
    for (let j = 2; j <= 2 * k + 1; j++) f *= j;
    return b / (2 * k * f);
});

/** Clausen's function Cl₂(x) = −∫₀^x log|2 sin(t/2)| dt. */
export function clausen(x) {
    const TAU = 2 * Math.PI;
    x = x - TAU * Math.round(x / TAU);              // (−π, π]
    if (x === 0) return 0;
    const ax = Math.abs(x);
    let s = ax - ax * Math.log(ax);
    const x2 = ax * ax;
    let p = ax;
    for (let k = 0; k < COEF.length; k++) {
        p *= x2;
        const term = COEF[k] * p;
        s += term;
        if (term < 1e-17 * s) break;
    }
    return x < 0 ? -s : s;
}

/** Л(θ) = ½ Cl₂(2θ). */
export const lobachevsky = (theta) => 0.5 * clausen(2 * theta);

/** Bloch–Wigner D(z): the signed volume of the ideal tetrahedron of shape z. */
export function tetVolume(z) {
    const z1 = div(ONE, sub(ONE, z));
    const z2 = sub(ONE, div(ONE, z));
    return lobachevsky(arg(z)) + lobachevsky(arg(z1)) + lobachevsky(arg(z2));
}

export const totalVolume = (shapes) => shapes.reduce((s, z) => s + tetVolume(z), 0);
