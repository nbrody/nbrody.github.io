// Cusps and Farey edges. A cusp is a reduced pair [p, q] with q ≥ 0; ∞ is [1, 0].
// Each plane is drawn as a unit disk with ∞ at the top, via
//   B(p/q) = (2pq, p² − q²) / (p² + q²),
// which sends the Ford horoball at p/q to a horocycle of Euclidean diameter 2/(1 + p² + q²).

export const B = (p, q) => {
    const s = p * p + q * q;
    return [2 * p * q / s, (p * p - q * q) / s];
};
export const fordDiam = (p, q) => 2 / (1 + p * p + q * q);
export const fmt = (p, q) => (q === 0 ? '∞' : q === 1 ? String(p) : p + '/' + q).replace('-', '−');

const cache = new Map();
const memo = (key, f) => {
    if (!cache.has(key)) cache.set(key, f());
    return cache.get(key);
};

// Farey fractions in [lo, hi] with denominator ≤ N, and the Farey edges [p1, q1, p2, q2] between them.
export function farey(lo, hi, N) {
    return memo(`f${lo},${hi},${N}`, () => {
        const v = [], e = [];
        const rec = (a, b, c, d) => {
            e.push([a, b, c, d]);
            if (b + d > N) return;
            const p = a + c, q = b + d;
            v.push([p, q]);
            rec(a, b, p, q);
            rec(p, q, c, d);
        };
        for (let n = lo; n < hi; n++) { v.push([n, 1]); rec(n, 1, n + 1, 1); }
        v.push([hi, 1]);
        return { v, e };
    });
}

// Largest horocycles first, so a walk over the cusps can stop at the first one too small to see.
const bySize = (v) => v.slice().sort((x, y) => x[0] * x[0] + x[1] * x[1] - y[0] * y[0] - y[1] * y[1]);

// A child plane: ∞ is the cusp toward its parent, so it carries children at the cusps in [−5, 5].
export function diskSet(N) {
    return memo(`d${N}`, () => {
        const { v, e } = farey(-5, 5, N);
        const edges = e.slice();
        for (let n = -5; n <= 5; n++) edges.push([n, 1, 1, 0]);
        return { v: bySize(v), e: edges };
    });
}

// The base disk has no parent, so close the child-plane set up under S: w ↦ −1/w (which also adds ∞).
const norm = (p, q) => (q < 0 ? [-p, -q] : q === 0 ? [1, 0] : [p, q]);
const S = (p, q) => norm(-q, p);
export function baseDiskSet(N) {
    return memo(`b${N}`, () => {
        const { v, e } = diskSet(N);
        const cusps = new Map(), edges = new Map();
        for (const [p, q] of v) for (const c of [[p, q], S(p, q)]) cusps.set(c.join('/'), c);
        for (const [a, b, c, d] of e) {
            for (const [x, y] of [[[a, b], [c, d]], [S(a, b), S(c, d)]]) {
                const k = [x.join('/'), y.join('/')].sort().join(' ');
                edges.set(k, [...x, ...y]);
            }
        }
        return { v: bySize([...cusps.values()]), e: [...edges.values()] };
    });
}
