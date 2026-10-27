// complex.js — complex numbers {re, im}, points of CP¹ as [x, y] pairs, and 2 × 2 matrices [a, b, c, d].

export const C = (re, im = 0) => ({ re, im });
export const ZERO = C(0, 0);
export const ONE = C(1, 0);
export const I = C(0, 1);
export const TWO_PI_I = C(0, 2 * Math.PI);

export const add = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
export const sub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
export const neg = (a) => ({ re: -a.re, im: -a.im });
export const conj = (a) => ({ re: a.re, im: -a.im });
export const scale = (a, s) => ({ re: a.re * s, im: a.im * s });
export const mul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const abs = (a) => Math.hypot(a.re, a.im);
export const abs2 = (a) => a.re * a.re + a.im * a.im;
export const arg = (a) => Math.atan2(a.im, a.re);
export function div(a, b) {
    const d = b.re * b.re + b.im * b.im;
    return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}
export const inv = (a) => div(ONE, a);
export const exp = (a) => { const r = Math.exp(a.re); return { re: r * Math.cos(a.im), im: r * Math.sin(a.im) }; };
export const log = (a) => ({ re: Math.log(Math.hypot(a.re, a.im)), im: Math.atan2(a.im, a.re) });
export function sqrt(a) {
    const r = Math.hypot(a.re, a.im);
    if (r === 0) return ZERO;
    const s = Math.sqrt((r + Math.abs(a.re)) / 2);
    return a.re >= 0 ? { re: s, im: a.im / (2 * s) } : { re: Math.abs(a.im) / (2 * s), im: a.im >= 0 ? s : -s };
}
export const isFiniteC = (a) => Number.isFinite(a.re) && Number.isFinite(a.im);
export const cstr = (a, d = 6) => `${a.re.toFixed(d)}${a.im < 0 ? '-' : '+'}${Math.abs(a.im).toFixed(d)}i`;

// ---------------- CP¹ in homogeneous coordinates ----------------

export const INF = [ONE, ZERO];
export const pt = (z) => [z, ONE];
/** Δ(p, q) = p_x q_y − q_x p_y, i.e. p − q when both are finite with y = 1. */
export const delta = (p, q) => sub(mul(p[0], q[1]), mul(q[0], p[1]));
/** The point as a complex number, or null for ∞. */
export function affine(p) {
    if (abs(p[1]) < 1e-300 || abs(p[1]) < 1e-14 * abs(p[0])) return null;
    return div(p[0], p[1]);
}
export function normPt(p) {
    const s = Math.hypot(abs(p[0]), abs(p[1])) || 1;
    return [scale(p[0], 1 / s), scale(p[1], 1 / s)];
}

// ---------------- 2 × 2 complex matrices [a, b, c, d] ----------------

export const IDENT = [ONE, ZERO, ZERO, ONE];
export const mmul = (A, B) => [
    add(mul(A[0], B[0]), mul(A[1], B[2])), add(mul(A[0], B[1]), mul(A[1], B[3])),
    add(mul(A[2], B[0]), mul(A[3], B[2])), add(mul(A[2], B[1]), mul(A[3], B[3])),
];
export const mdet = (A) => sub(mul(A[0], A[3]), mul(A[1], A[2]));
export const mtrace = (A) => add(A[0], A[3]);
/** Inverse of a matrix of determinant 1 (the adjugate). */
export const madj = (A) => [A[3], neg(A[1]), neg(A[2]), A[0]];
export function minv(A) {
    const d = mdet(A);
    return madj(A).map((x) => div(x, d));
}
/** Scale to determinant 1. */
export function msl2(A) {
    const s = inv(sqrt(mdet(A)));
    return A.map((x) => mul(x, s));
}
export const mapply = (A, p) => [add(mul(A[0], p[0]), mul(A[1], p[1])), add(mul(A[2], p[0]), mul(A[3], p[1]))];
export function mpow(A, k) {
    let R = IDENT, B = k < 0 ? madj(A) : A;
    for (let e = Math.abs(k); e > 0; e >>= 1) {
        if (e & 1) R = mmul(R, B);
        B = mmul(B, B);
    }
    return R;
}
/** max |A − B| over entries, after fixing the sign ambiguity of PSL₂ (A ~ −A). */
export function mdistPSL(A, B) {
    let d1 = 0, d2 = 0;
    for (let i = 0; i < 4; i++) { d1 = Math.max(d1, abs(sub(A[i], B[i]))); d2 = Math.max(d2, abs(add(A[i], B[i]))); }
    return Math.min(d1, d2);
}

/** The Möbius transformation sending p1 → 0, p2 → ∞, p3 → 1. */
function toZeroInfOne(p1, p2, p3) {
    const k1 = delta(p3, p2), k2 = delta(p3, p1);
    return [mul(k1, p1[1]), neg(mul(k1, p1[0])), mul(k2, p2[1]), neg(mul(k2, p2[0]))];
}
/** The Möbius transformation (in SL₂ℂ) sending the triple P to the triple Q. */
export function mobiusFrom3(P, Q) {
    const A = toZeroInfOne(P[0], P[1], P[2]);
    const B = toZeroInfOne(Q[0], Q[1], Q[2]);
    return msl2(mmul(minv(B), A));
}

/** Eigen-fixed points of a Möbius transformation, as CP¹ points (one for parabolics). */
export function fixedPoints(A) {
    // c z² + (d − a) z − b = 0
    const [a, b, c, d] = A;
    if (abs(c) < 1e-14 * (abs(a) + abs(b) + abs(d))) {
        const p = [INF];
        const da = sub(d, a);
        if (abs(da) > 1e-12) p.push(pt(div(b, da)));
        return p;
    }
    const disc = sqrt(add(mul(sub(d, a), sub(d, a)), scale(mul(b, c), 4)));
    const r1 = div(add(sub(a, d), disc), scale(c, 2));
    const r2 = div(sub(sub(a, d), disc), scale(c, 2));
    return abs(disc) < 1e-10 ? [pt(r1)] : [pt(r1), pt(r2)];
}

/** Matrix logarithm and power path in SL₂ℂ: A^s for s ∈ [0, 1] (principal branch). */
export function mpowReal(A, s) {
    // A = cosh(ℓ/2)·I + sinh(ℓ/2)/sinh... use the eigenbasis-free formula A^s = (sinh((1−s)x) I + sinh(s x) A·e)/sinh x
    // with tr A = 2 cosh x. Fall back to linear interpolation near the identity.
    const half = scale(mtrace(A), 0.5);
    // x = acosh(half)
    const x = log(add(half, sqrt(sub(mul(half, half), ONE))));
    if (abs(x) < 1e-9) {
        // parabolic or identity: A = I + N, A^s = I + sN
        return [add(ONE, scale(sub(A[0], ONE), s)), scale(A[1], s), scale(A[2], s), add(ONE, scale(sub(A[3], ONE), s))];
    }
    const sh = (u) => scale(sub(exp(u), exp(neg(u))), 0.5);
    const shx = sh(x);
    const c0 = div(sh(scale(x, 1 - s)), shx);
    const c1 = div(sh(scale(x, s)), shx);
    return [add(c0, mul(c1, A[0])), mul(c1, A[1]), mul(c1, A[2]), add(c0, mul(c1, A[3]))];
}
