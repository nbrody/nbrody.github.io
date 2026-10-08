// The tree of planes and the action of SL₂(ℚ[t]) on it, exactly.
//
// Vertices of the Bruhat–Tits tree of SL₂(K), K = ℚ((π)), π = 1/t, are lattice classes. The
// link of the standard vertex v₀ = [O²] is ℙ¹(ℚ): the neighbour in direction w is [O(w,1) + πO²]
// (∞ ↦ (1,0)). A vertex at distance n is named by its path of cusps w₁, …, wₙ from v₀, where
// w₁ ∈ ℙ¹(ℚ) and later wₖ ∈ ℚ (∞ would step back). Its frame is
//     g_v = T_{w₁} ⋯ T_{wₙ},   T_w = (π w; 0 1),   T_∞ = (0 −1; π 0),
// so v = g_v·v₀; g_v carries the link of v₀ to the link of v with ∞ pointing back to the parent
// and w to the next cusp, and the plane X(v) is X(v₀) seen through g_v. Labels are cusps
// [p, q] of BigInts, reduced, q ≥ 0, ∞ = [1n, 0n].
//
// For γ ∈ GL₂(K): γ·g_v = g_{γv}·k with k ∈ K^×·GL₂(O), the stabilizer of v₀; scaled by a power
// of π it lies in GL₂(O), and its reduction h ∈ GL₂(ℚ) is the map X(v) → X(γv) in the two
// frames — an isometry of ℍ, orientation-reversing when det h < 0 (z ↦ (az̄ + b)/(cz̄ + d)).
// For γ ∈ SL₂ it is in SL₂(ℚ). Scaling γ by c ∈ K^× scales h by a square, so this is PGL₂.
import { Q } from './rational.js';
import { L, mmul, adj, det, seriesQuot, IDENTITY } from './laurent.js';

// The engine over a coefficient field k (ℚ here, ℚ(i) and ℚ(ω) in kengine.js): cfg gives the
// Laurent class, the one of k, the label of ∞, and how labels and elements of k correspond.
export function makeTree({ L, IDENTITY, one, INF, isInf, value, toLabel, labelKey }) {
    const T_INF = [L.ZERO, L.of(one.neg()), L.PI, L.ZERO];
    const step = (w) => (isInf(w) ? T_INF : [L.PI, L.of(value(w)), L.ZERO, L.ONE]);
    const keyOf = (labels) => labels.map(labelKey).join(' ');
    const isPrefix = (a, b) => a.length <= b.length && a.every((w, i) => labelKey(w) === labelKey(b[i]));

    const frames = new Map();
    function frameOf(labels) {
        if (!labels.length) return IDENTITY;
        const k = keyOf(labels);
        let F = frames.get(k);
        if (!F) {
            if (frames.size > 50000) frames.clear();
            F = mmul(frameOf(labels.slice(0, -1)), step(labels[labels.length - 1]));
            frames.set(k, F);
        }
        return F;
    }

    // The vertex M·v₀, as its path of cusps from v₀.
    function vertexOf(M) {
        let a = Infinity;
        for (const e of M) a = Math.min(a, e.val);
        const N = M.map((e) => e.shift(-a));          // entries in O, one of them a unit
        const m = det(N).val;                          // = d(v₀, Mv₀)
        if (m === 0) return [];
        // A column with a unit entry spans M·O² mod π^m (it is O·e + π^m·O² for one primitive e).
        const col = Math.min(N[0].val, N[2].val) === 0 ? 0 : 1;
        const c1 = N[col], c2 = N[col + 2];
        if (c2.val === 0) return seriesQuot(c1, c2, m).map(toLabel);   // [b : 1], b = Σ wₖπᵏ
        const s = seriesQuot(c2, c1, m);              // [1 : πc]: first step ∞, then the digits of −c
        const out = [INF];
        for (let k = 1; k < m; k++) out.push(toLabel(s[k].neg()));
        return out;
    }

    // γ on the vertex with these labels: the image's labels, and the local map h ∈ GL₂(k) as [a, b, c, d].
    function localMap(g, labels) {
        const M = mmul(g, frameOf(labels));
        const image = vertexOf(M);
        let K = mmul(adj(frameOf(image)), M).map((e) => e.shift(-image.length));   // det g_u = π^|u|
        let s = Infinity;
        for (const e of K) s = Math.min(s, e.val);
        K = K.map((e) => e.shift(-s));
        return { labels: image, h: K.map((e) => e.coef(0)) };
    }

    // How γ ∈ GL₂(K) moves the tree. Its translation length is max(0, v(det γ) − 2 v(tr γ)), which
    // for SL₂ is 2·max(0, deg tr γ). With length 0 it fixes a point of the tree: a vertex when
    // v(det γ) is even, the midpoint of an edge (which it inverts) when odd; the one nearest v₀ is the
    // midpoint of [v₀, γv₀]. These depend only on γ in PGL₂.
    function classify(g) {
        const tr = g[0].add(g[3]), vd = det(g).val;
        const ell = tr.isZero() ? 0 : Math.max(0, vd - 2 * tr.val);
        const moved = vertexOf(g), d = moved.length;
        if (ell) return { kind: 'hyperbolic', ell, moved };
        if (vd % 2) return { kind: 'inversion', ell, moved, edge: [moved.slice(0, (d - 1) / 2), moved.slice(0, (d + 1) / 2)] };
        return { kind: 'elliptic', ell, moved, fixed: moved.slice(0, d / 2) };
    }

    return { INF, isInf, keyOf, isPrefix, frameOf, vertexOf, localMap, classify, labelKey };
}

// Over ℚ, labels are cusps [p, q] of BigInts, reduced, q ≥ 0, ∞ = [1n, 0n].
export const cuspKey = ([p, q]) => (q === 0n ? '∞' : q === 1n ? `${p}` : `${p}/${q}`);
export const INF = [1n, 0n];
export const { keyOf, isPrefix, frameOf, vertexOf, localMap, classify } = makeTree({
    L, IDENTITY, one: Q.ONE, INF, isInf: ([, q]) => q === 0n, value: ([p, q]) => Q.of(p, q),
    toLabel: (x) => [x.n, x.d], labelKey: cuspKey,
});

// ---------- floating-point Möbius maps (z ↦ (az+b)/(cz+d)) ----------

export const toFloat = (h) => h.map((x) => x.toNumber());
export const fmul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
export const finv = (A) => { const d = A[0] * A[3] - A[1] * A[2]; return [A[3] / d, -A[1] / d, -A[2] / d, A[0] / d]; };
export const fdet = (A) => A[0] * A[3] - A[1] * A[2];
// scaled to |det| = 1, so that h·(p, q) is the horocycle vector of the image horocycle
export const fnorm = (A) => { const k = 1 / Math.sqrt(Math.abs(fdet(A))); return A.map((x) => x * k); };
// z ↦ −z̄, the reflection a plane's flip about its diameter through ∞ realizes
export const RHO = [-1, 0, 0, 1];

// The one-parameter path s ↦ hˢ in PSL₂(ℝ) from the identity to h (det h > 0): a rotation, a
// parabolic slide or a translation along the axis.
export function mobiusPath(h) {
    let [a, b, c, d] = h;
    const det0 = a * d - b * c, k = 1 / Math.sqrt(Math.abs(det0));
    a *= k; b *= k; c *= k; d *= k;
    if (a + d < 0) { a = -a; b = -b; c = -c; d = -d; }
    const tr = a + d;
    if (Math.abs(tr - 2) < 1e-12) return (s) => [1 + s * (a - 1), s * b, s * c, 1 + s * (d - 1)];
    if (tr < 2) {
        const th = Math.acos(tr / 2), co = Math.cos(th), sn = Math.sin(th);
        const J = [(a - co) / sn, b / sn, c / sn, (d - co) / sn];
        return (s) => { const C = Math.cos(s * th), S = Math.sin(s * th); return [C + S * J[0], S * J[1], S * J[2], C + S * J[3]]; };
    }
    const th = Math.acosh(tr / 2), co = Math.cosh(th), sn = Math.sinh(th);
    const J = [(a - co) / sn, b / sn, c / sn, (d - co) / sn];
    return (s) => { const C = Math.cosh(s * th), S = Math.sinh(s * th); return [C + S * J[0], S * J[1], S * J[2], C + S * J[3]]; };
}
