// Minimal complex-number and 2×2 matrix utilities.
// Complex numbers are plain [re, im] arrays.

export const C = (re = 0, im = 0) => [re, im];

export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a, b) => [a[0]*b[0] - a[1]*b[1], a[0]*b[1] + a[1]*b[0]];
export const cscale = (a, s) => [a[0]*s, a[1]*s];
export const cabs2 = (a) => a[0]*a[0] + a[1]*a[1];
export const cabs = (a) => Math.hypot(a[0], a[1]);
export const cneg = (a) => [-a[0], -a[1]];

export function cdiv(a, b) {
    const d = b[0]*b[0] + b[1]*b[1];
    return [(a[0]*b[0] + a[1]*b[1]) / d, (a[1]*b[0] - a[0]*b[1]) / d];
}
export function cinv(a) {
    const d = a[0]*a[0] + a[1]*a[1];
    return [a[0]/d, -a[1]/d];
}
export function cexp(a) {
    const r = Math.exp(a[0]);
    return [r*Math.cos(a[1]), r*Math.sin(a[1])];
}
export function csqrt(a) {
    const r = Math.hypot(a[0], a[1]);
    const re = Math.sqrt((r + a[0]) / 2);
    const im = Math.sign(a[1] || 1) * Math.sqrt((r - a[0]) / 2);
    return [re, im];
}

// 2x2 complex matrices as [a, b, c, d] (each a complex).
export function matmul(M, N) {
    const [a, b, c, d] = M;
    const [e, f, g, h] = N;
    return [
        cadd(cmul(a, e), cmul(b, g)),
        cadd(cmul(a, f), cmul(b, h)),
        cadd(cmul(c, e), cmul(d, g)),
        cadd(cmul(c, f), cmul(d, h)),
    ];
}
export function matinv(M) {
    // assume det = 1
    const [a, b, c, d] = M;
    return [d, cneg(b), cneg(c), a];
}
export function mob(M, z) {
    // (az + b) / (cz + d)
    const [a, b, c, d] = M;
    const num = cadd(cmul(a, z), b);
    const den = cadd(cmul(c, z), d);
    return cdiv(num, den);
}
export function trace(M) { return cadd(M[0], M[3]); }
