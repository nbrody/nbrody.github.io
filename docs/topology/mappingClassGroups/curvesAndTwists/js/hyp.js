// hyp.js — the hyperbolic plane in the hyperboloid model.
// Points are [x, y, t] with x² + y² − t² = −1, t > 0, and <u, v> = x x' + y y' − t t'.
// Isometries are 3×3 Lorentz matrices (row-major Float64Array(9)); their inverse is J Mᵀ J.

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] - a[2] * b[2];

// J(a × b): orthogonal to a and b for <,>. For a point p and a unit tangent T at p,
// lcross(p, T) is the unit normal to the left of T.
export const lcross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    -(a[0] * b[1] - a[1] * b[0]),
];

export function normPoint(p) {
    const s = 1 / Math.sqrt(Math.max(1e-300, -dot(p, p)));
    return p[2] < 0 ? [-p[0] * s, -p[1] * s, -p[2] * s] : [p[0] * s, p[1] * s, p[2] * s];
}
export function normSpace(v) {
    const s = 1 / Math.sqrt(Math.max(1e-300, dot(v, v)));
    return [v[0] * s, v[1] * s, v[2] * s];
}

export const cdist = (p, q) => Math.max(1, -dot(p, q));          // cosh of the distance
export const dist = (p, q) => Math.acosh(cdist(p, q));
// the same distance, accurate when p and q are close (acosh loses half the digits near 1)
export function distNear(p, q) {
    const v = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    return 2 * Math.asinh(0.5 * Math.sqrt(Math.max(0, dot(v, v))));
}

export const ORIGIN = [0, 0, 1];

export function fromDisk(a, b) {
    const r2 = a * a + b * b, s = 1 / (1 - r2);
    return [2 * a * s, 2 * b * s, (1 + r2) * s];
}
export const toDisk = p => [p[0] / (1 + p[2]), p[1] / (1 + p[2])];
export const toKlein = p => [p[0] / p[2], p[1] / p[2]];
export function fromKlein(u, v) {
    const s = 1 / Math.sqrt(Math.max(1e-300, 1 - u * u - v * v));
    return [u * s, v * s, s];
}

// ---------------------------------------------------------------- matrices
export const I3 = () => new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function mmul(A, B) {
    const C = new Float64Array(9);
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
}
export function mapply(M, p) {
    return [
        M[0] * p[0] + M[1] * p[1] + M[2] * p[2],
        M[3] * p[0] + M[4] * p[1] + M[5] * p[2],
        M[6] * p[0] + M[7] * p[1] + M[8] * p[2],
    ];
}
// (J Mᵀ J)_ij = J_ii M_ji J_jj
export function minv(M) {
    return new Float64Array([
        M[0], M[3], -M[6],
        M[1], M[4], -M[7],
        -M[2], -M[5], M[8],
    ]);
}
export function mdist(A, B) {
    let s = 0;
    for (let i = 0; i < 9; i++) s = Math.max(s, Math.abs(A[i] - B[i]));
    return s;
}

export function rot(th) {
    const c = Math.cos(th), s = Math.sin(th);
    return new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1]);
}
export function boost(d) {               // translation along the x-axis by d
    const c = Math.cosh(d), s = Math.sinh(d);
    return new Float64Array([c, 0, s, 0, 1, 0, s, 0, c]);
}
export const translate = (th, d) => mmul(rot(th), mmul(boost(d), rot(-th)));

// the isometry taking the origin to a and the x-direction to the unit tangent T at a
export function frame(a, T) {
    const N = lcross(a, T);
    return new Float64Array([T[0], N[0], a[0], T[1], N[1], a[1], T[2], N[2], a[2]]);
}
// translation by d along the oriented geodesic through a with unit tangent T
export function translationAlong(a, T, d) {
    const F = frame(a, T);
    return mmul(F, mmul(boost(d), minv(F)));
}

// ---------------------------------------------------------------- tangents
// unit tangent at p pointing to q, and the distance
export function logUnit(p, q) {
    const c = -dot(p, q);
    const v = [q[0] - c * p[0], q[1] - c * p[1], q[2] - c * p[2]];
    const s = Math.sqrt(Math.max(0, dot(v, v)));
    if (s < 1e-300) return { u: [1, 0, 0], d: 0 };
    return { u: [v[0] / s, v[1] / s, v[2] / s], d: Math.asinh(s) };
}
export function expMap(p, u, s) {        // u a unit tangent at p
    const c = Math.cosh(s), h = Math.sinh(s);
    return normPoint([c * p[0] + h * u[0], c * p[1] + h * u[1], c * p[2] + h * u[2]]);
}
// project v onto the tangent plane at p (removes the p-component)
export function tangentPart(p, v) {
    const c = dot(p, v);
    return [v[0] + c * p[0], v[1] + c * p[1], v[2] + c * p[2]];
}
export function midpoint(p, q) {
    return normPoint([p[0] + q[0], p[1] + q[1], p[2] + q[2]]);
}
// the point a fraction s of the way from p to q along the geodesic
export function lerpGeo(p, q, s) {
    const { u, d } = logUnit(p, q);
    return d < 1e-15 ? p.slice() : expMap(p, u, s * d);
}
// sinh of the signed distance from x to the geodesic with unit normal n
export const sideOf = (x, n) => dot(x, n);
