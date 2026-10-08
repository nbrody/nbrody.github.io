// K = ℚ(i) and ℚ(ω): cusps of ℙ¹(K) by height, and the circles through neighbouring cusps.
//
// Over K((1/t)) the residue field K sits in ℂ, so each vertex of the tree carries hyperbolic
// 3-space, drawn as a ball, and its link ℙ¹(K) is the set of K-rational points of the sphere at
// infinity. A cusp is a coprime pair (p, q) of integers of O_K = ℤ[i] or ℤ[ω] up to units, at
//     B(p, q) = (2 Re p q̄, 2 Im p q̄, |p|² − |q|²) / (|p|² + |q|²)
// on the unit sphere (∞ at the north pole, 0 at the south), and its Ford sphere — the horoball
// of Euclidean diameter 1/|q|² in upper half-space — has diameter 2/(1 + |p|² + |q|²) in the ball.
// Two cusps are neighbours when ps − qr is a unit, i.e. when they are g(∞), g(0) for some
// g ∈ GL₂(O_K); the circles g(ℝ̂) through them decorate each sphere, as the Farey lines do each plane.
// Elements of O_K are pairs [a, b] = a + bθ with θ = i or ω, small enough for exact JS integers.

const SQ3 = Math.sqrt(3);
export const FIELDS = {
    i: {
        id: 'i', name: 'ℚ(i)', ring: 'ℤ[i]', sym: 'i',
        units: [[1, 0], [0, 1], [-1, 0], [0, -1]],
        mul: ([a, b], [c, d]) => [a * c - b * d, a * d + b * c],
        conj: ([a, b]) => [a, -b],
        norm: ([a, b]) => a * a + b * b,
        toC: ([a, b]) => [a, b],
    },
    omega: {
        id: 'omega', name: 'ℚ(ω)', ring: 'ℤ[ω]', sym: 'ω',
        units: [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]],
        mul: ([a, b], [c, d]) => [a * c - b * d, a * d + b * c - b * d],   // ω² = −1 − ω
        conj: ([a, b]) => [a - b, -b],
        norm: ([a, b]) => a * a - a * b + b * b,
        toC: ([a, b]) => [a - b / 2, b * SQ3 / 2],
    },
};

const sub = ([a, b], [c, d]) => [a - c, b - d];
const add = ([a, b], [c, d]) => [a + c, b + d];
const isZero = ([a, b]) => a === 0 && b === 0;

// Division with remainder: q = x/y rounded in the basis (1, θ); the remainder has smaller norm
// (|s + tθ|² ≤ 3/4 for |s|, |t| ≤ 1/2 in both rings), so both rings are Euclidean.
export function divmod(K, x, y) {
    const [u, v] = K.mul(x, K.conj(y)), n = K.norm(y);
    const q = [Math.round(u / n), Math.round(v / n)];
    return [q, sub(x, K.mul(q, y))];
}
export function gcd(K, x, y) {
    while (!isZero(y)) [x, y] = [y, divmod(K, x, y)[1]];
    return x;
}

// The elements of O_K of norm at most M.
function elements(K, M) {
    const out = [], B = Math.ceil(2 * Math.sqrt(M) / SQ3) + 1;
    for (let a = -B; a <= B; a++) for (let b = -B; b <= B; b++) if (K.norm([a, b]) <= M) out.push([a, b]);
    return out;
}

// The representative of (p, q) up to units with q in the sector 0 ≤ arg q < 2π/#units.
export function normalize(K, p, q) {
    if (isZero(q)) return [[1, 0], [0, 0]];
    const w = 2 * Math.PI / K.units.length;
    for (const u of K.units) {
        const [x, y] = K.toC(K.mul(u, q));
        let a = Math.atan2(y, x);
        if (a < -1e-9) a += 2 * Math.PI;
        if (a < w - 1e-9) return [K.mul(u, p), K.mul(u, q)];
    }
    return [p, q];
}

const cache = new Map();
const memo = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };

export function cuspOf(K, p, q) {
    const [pr, pi] = K.toC(p), [qr, qi] = K.toC(q);
    const P2 = pr * pr + pi * pi, Q2 = qr * qr + qi * qi, n2 = P2 + Q2;
    const re = pr * qr + pi * qi, im = pi * qr - pr * qi;      // p·q̄
    return {
        p, q, n2, key: `${p}|${q}`, D: 2 / (1 + n2), absq: Math.sqrt(Q2),
        dir: [2 * re / n2, 2 * im / n2, (P2 - Q2) / n2],
    };
}

// The cusps with |p|² + |q|² ≤ H², largest Ford sphere first; ∞ only when withInf.
export function cusps(K, H, withInf) {
    return memo(`c${K.id}${H}${withInf}`, () => {
        const M = H * H, els = elements(K, M), out = [];
        for (const q of els) {
            if (isZero(q)) continue;
            const [, nq] = normalize(K, [0, 0], q);
            if (nq[0] !== q[0] || nq[1] !== q[1]) continue;                // one q per unit class
            const left = M - K.norm(q);
            for (const p of els) {
                if (K.norm(p) > left) continue;
                if (K.norm(gcd(K, p, q)) !== 1) continue;
                out.push(cuspOf(K, p, q));
            }
        }
        if (withInf) out.push(cuspOf(K, [1, 0], [0, 0]));
        return out.sort((a, b) => a.n2 - b.n2);
    });
}

export const unimodular = (K, a, b) => K.norm(sub(K.mul(a.p, b.q), K.mul(a.q, b.p))) === 1;

// Circles g(ℝ̂), g ∈ GL₂(O_K), through pairs of neighbouring cusps of height ≤ H, on the unit
// sphere: { n, d, r } with the circle the section of the sphere by the plane n·x = d, r = √(1 − d²).
// Through the neighbours p/q, r/s pass the circles through (p + μr)/(q + μs), one for each unit μ up to sign.
export function circles(K, H) {
    return memo(`o${K.id}${H}`, () => {
        const cs = cusps(K, H, true), seen = new Map();
        const halfUnits = K.units.slice(0, K.units.length / 2);
        for (let i = 0; i < cs.length; i++) {
            for (let j = i + 1; j < cs.length; j++) {
                const A = cs[i], C = cs[j];
                if (!unimodular(K, A, C)) continue;
                for (const mu of halfUnits) {
                    const P = cuspOf(K, add(A.p, K.mul(mu, C.p)), add(A.q, K.mul(mu, C.q)));
                    const c = planeThrough(A.dir, C.dir, P.dir);
                    if (!c) continue;
                    const key = c.n.concat(c.d).map((x) => Math.round(x * 1e6)).join(',');
                    // three points as complex vectors (p, q), for carrying the circle by a Möbius map
                    if (!seen.has(key)) seen.set(key, { ...c, pts: [A, C, P].map((x) => [K.toC(x.p), K.toC(x.q)]) });
                }
            }
        }
        return [...seen.values()].sort((a, b) => b.r - a.r);
    });
}

export function planeThrough(a, b, c) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n);
    if (l < 1e-12) return null;
    n = n.map((x) => x / l);
    let d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    const lead = Math.abs(d) > 1e-9 ? d : n.find((x) => Math.abs(x) > 1e-9);
    if (lead < 0) { n = n.map((x) => -x); d = -d; }
    return { n, d, r: Math.sqrt(Math.max(0, 1 - d * d)) };
}

// A readable name for the cusp p/q.
export function cuspName(K, c) {
    const el = ([a, b]) => {
        if (!b) return `${a}`;
        const t = b === 1 ? K.sym : b === -1 ? `−${K.sym}` : `${b}${K.sym}`;
        return a ? `${a}${b < 0 ? '' : '+'}${t}` : t;
    };
    if (isZero(c.q)) return '∞';
    if (K.norm(c.q) === 1) {                                   // q a unit: p/q is an integer
        const [x] = divmod(K, c.p, c.q);
        return el(x).replace(/-/g, '−');
    }
    const wrap = (s) => (/[+−-]/.test(s.slice(1)) ? `(${s})` : s);
    return `${wrap(el(c.p))}/${wrap(el(c.q))}`.replace(/-/g, '−');
}
