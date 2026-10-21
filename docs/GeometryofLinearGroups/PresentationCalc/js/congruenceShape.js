/**
 * congruenceShape.js — the congruence closure Δ of Γ ⊂ Λ = PGL₂(ℤ[1/S]), written out.
 *
 * congruence.js finds the levels N = ∏ q (q = ℓ^k) at which Δ is cut out and its index. Here, for
 * each q, the image H_q of Γ₀ = Γ ∩ Λ₀ in SL₂(ℤ/q)/±1 is described:
 *
 *   · its linear hull R_q, the ℤ/q-algebra H_q spans, as the congruences on (a b; c d) that hold
 *     on all of H_q: b ≡ 0 (mod 2), a ≡ d (mod 4), … found among short linear forms, and checked
 *     to cut out exactly R_q. When they are conditions on single entries and on a − d, they read
 *     as a matrix pattern, (a 2b; 3c d) with a ≡ d (mod 4);
 *   · whether H_q is all of SL₂ ∩ R_q (then Δ is just that pattern at q), or a subgroup of index r
 *     in it; and its image mod ℓ in PSL₂(𝔽_ℓ) (Dickson: the stabilizer of a point with its
 *     eigenvalue there in a subgroup of 𝔽_ℓ^× (Γ_H), Cartan subgroups and their normalizers, A₄, S₄,
 *     A₅), with the kernel of reduction mod ℓ when q = ℓ^k;
 *   · whether the joint image is the product of the H_q (Δ is cut out prime by prime), or the
 *     primes are linked (Goursat), with the index of the joint image in the product.
 */
import { primitiveRow, kernelZero, detClass } from './congruence.js';

const md = (x, q) => ((x % q) + q) % q;
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const primeOf = (q) => { for (let p = 2; p * p <= q; p++) if (q % p === 0) return p; return q; };
function invmod(x, q) {
    let [a, b, s, t] = [md(x, q), q, 1, 0];
    while (b) { const k = Math.floor(a / b); [a, b] = [b, a - k * b]; [s, t] = [t, s - k * t]; }
    return md(s, q);
}
const slOrder = (q) => { if (q === 1) return 1; const p = primeOf(q); return (q / p) ** 3 * p * (p * p - 1); };
const mul = (A, B, q) => [(A[0] * B[0] + A[1] * B[2]) % q, (A[0] * B[1] + A[1] * B[3]) % q, (A[2] * B[0] + A[3] * B[2]) % q, (A[2] * B[1] + A[3] * B[3]) % q];

/** Γ₀'s generators mod q, in SL₂(ℤ/q), with −1. */
function liftsMod(K, q) {
    const out = K.gens.map(({ M, u }) => {
        const ui = invmod(Number(((u % BigInt(q)) + BigInt(q)) % BigInt(q)), q);
        return M.map((x) => (Number(((x % BigInt(q)) + BigInt(q)) % BigInt(q)) * ui) % q);
    });
    out.push([(q - 1) % q, 0, 0, (q - 1) % q]);
    return out;
}

/** H_q by breadth-first search: { elements, order (mod ±1) } or null past the cap. */
function imageMod(gens, q, cap) {
    const key = (A) => ((A[0] * q + A[1]) * q + A[2]) * q + A[3];
    const one = [1 % q, 0, 0, 1 % q], H = [one], seen = new Set([key(one)]);
    for (let i = 0; i < H.length; i++) for (const g of gens) {
        const y = mul(H[i], g, q), k = key(y);
        if (!seen.has(k)) { if (H.length >= cap) return null; seen.add(k); H.push(y); }
    }
    return { elements: H, order: H.length / (q > 2 ? 2 : 1) };
}

// ── lattices in ℤ⁴ containing qℤ⁴, by Hermite normal form ──

/** The upper-triangular Hermite basis (4 rows) of the lattice spanned by rows and q·ℤ⁴. */
function hnf(rows, q) {
    const B = [];
    let pool = rows.map((r) => r.map((x) => md(x, q)));
    for (let col = 0; col < 4; col++) {
        // q·e_col is in the lattice; it is added here, as the reductions mod q below would zero it
        const e = [0, 0, 0, 0]; e[col] = q; pool.push(e);
        // gcd-combine the pivots in this column
        let piv = null;
        const rest = [];
        for (const r of pool) {
            if (r[col] === 0) { rest.push(r); continue; }
            if (!piv) { piv = r.slice(); continue; }
            // extended Euclid on piv[col], r[col]
            let [a, b] = [piv[col], r[col]], [x0, y0, x1, y1] = [1, 0, 0, 1];
            while (b) { const k = Math.floor(a / b); [a, b] = [b, a - k * b]; [x0, x1] = [x1, x0 - k * x1]; [y0, y1] = [y1, y0 - k * y1]; }
            const np = piv.map((v, i) => x0 * v + y0 * r[i]);
            const nr = piv.map((v, i) => x1 * v + y1 * r[i]);    // its column entry is 0
            piv = np;
            rest.push(nr);
        }
        if (!piv) { const z = [0, 0, 0, 0]; z[col] = q; piv = z; }
        if (piv[col] < 0) piv = piv.map((v) => -v);
        // keep entries small (everything is modulo q·ℤ⁴ anyway, past this column)
        piv = piv.map((v, i) => (i > col ? md(v, q) : v));
        B.push(piv);
        pool = rest.map((r) => r.map((v, i) => (i > col ? md(v, q) : v)));
    }
    // reduce above the diagonal, column by column (later columns are reduced after earlier ones change them)
    for (let i = 0; i < 4; i++) for (let j = 0; j < i; j++) {
        const k = Math.floor(B[j][i] / B[i][i]);
        if (k) B[j] = B[j].map((v, t) => v - k * B[i][t]);
    }
    return B;
}
const sameLattice = (A, B) => A.every((r, i) => r.every((v, j) => v === B[i][j]));
const latticeIndex = (B) => B.reduce((s, r, i) => s * r[i], 1);

/** The ℤ/q-algebra spanned by H_q: closed under right multiplication by the generators. */
function algebraHull(gens, q) {
    let B = hnf([[1, 0, 0, 1]], q);
    for (let round = 0; round < 64; round++) {
        const rows = B.slice();
        for (const b of B) for (const g of gens) rows.push(mul(b, g, q));
        const C = hnf(rows, q);
        if (sameLattice(B, C)) return B;
        B = C;
    }
    return B;
}

// ── the hull as congruences ──

const NAMES = ['a', 'b', 'c', 'd'];
/** Short linear forms, simplest first: single entries, then a − d, then the rest. */
function forms() {
    const out = [];
    for (let i = 0; i < 81; i++) {
        const f = [0, 1, 2, 3].map((k) => (Math.floor(i / 3 ** k) % 3) - 1);
        if (f.every((x) => !x)) continue;
        if (f.find((x) => x) < 0) continue;                   // f and −f say the same
        out.push(f);
    }
    const rank = (f) => {
        const nz = f.filter((x) => x).length;
        if (nz === 1) return [0, f[1] ? 0 : f[2] ? 1 : 2];
        if (f[0] === 1 && f[3] === -1 && !f[1] && !f[2]) return [1, 0];
        return [nz, 0];
    };
    return out.sort((x, y) => { const [a, b] = rank(x), [c, d] = rank(y); return a - c || b - d; });
}
const FORMS = forms();

/** Index in ℤ⁴ of { x : f_j·x ≡ 0 (mod m_j) for all j }. */
function solutionIndex(conds) {
    if (!conds.length) return 1;
    const n = conds.length, M = conds.reduce((s, c) => s * c.m, 1);
    // the image of ℤ⁴ in ⊕ ℤ/m_j: generated by the columns
    const cols = [0, 1, 2, 3].map((i) => conds.map((c) => md(c.f[i], c.m)));
    // order of the subgroup they generate = ∏ m_j / det(lattice spanned by cols and m_j e_j)
    const rows = cols.concat(conds.map((c, j) => { const e = Array(n).fill(0); e[j] = c.m; return e; }));
    return M / detLattice(rows, n);
}
/** det of the full-rank lattice in ℤⁿ spanned by rows (small n). */
function detLattice(rows, n) {
    let pool = rows.map((r) => r.slice()), det = 1;
    for (let col = 0; col < n; col++) {
        let piv = null; const rest = [];
        for (const r of pool) {
            if (r[col] === 0) { rest.push(r); continue; }
            if (!piv) { piv = r; continue; }
            let [a, b] = [piv[col], r[col]], [x0, y0, x1, y1] = [1, 0, 0, 1];
            while (b) { const k = Math.floor(a / b); [a, b] = [b, a - k * b]; [x0, x1] = [x1, x0 - k * x1]; [y0, y1] = [y1, y0 - k * y1]; }
            const np = piv.map((v, i) => x0 * v + y0 * r[i]), nr = piv.map((v, i) => x1 * v + y1 * r[i]);
            piv = np; rest.push(nr);
        }
        if (!piv) return Infinity;
        det *= Math.abs(piv[col]);
        pool = rest;
    }
    return det;
}

/** Linear forms with coefficients in [−h, h] and at least one of size h (f and −f once), simplest first. */
function formsOfHeight(h) {
    const out = [], n = 2 * h + 1;
    for (let i = 0; i < n ** 4; i++) {
        const f = [0, 1, 2, 3].map((k) => (Math.floor(i / n ** k) % n) - h);
        if (!f.some((x) => Math.abs(x) === h) || f.find((x) => x) < 0) continue;
        out.push(f);
    }
    const nz = (f) => f.filter((x) => x).length, l1 = (f) => f.reduce((t, x) => t + Math.abs(x), 0);
    return out.sort((x, y) => nz(x) - nz(y) || l1(x) - l1(y));
}

/**
 * Congruences cutting out the lattice B (Hermite basis, containing qℤ⁴): [{ f, m }] with f a linear
 * form on (a, b, c, d), as short as can be found (coefficients ±1 first, then up to q/2, at most 12),
 * or null.
 */
function congruencesOf(B, q) {
    const target = latticeIndex(B);
    const conds = [];
    let idx = 1;
    if (target === 1) return conds;
    const H = Math.min(Math.floor(q / 2), 12);
    for (let h = 1; h <= Math.max(1, H); h++) {
        for (const f of h === 1 ? FORMS : formsOfHeight(h)) {
            let g = q;
            for (const b of B) g = gcd(g, f[0] * b[0] + f[1] * b[1] + f[2] * b[2] + f[3] * b[3]);
            if (g <= 1) continue;
            const trial = conds.concat([{ f, m: g }]), t = solutionIndex(trial);
            if (t > idx) { conds.push({ f, m: g }); idx = t; }
            if (idx === target) return conds;
        }
    }
    return null;
}

/** The lattice { x ∈ ℤ⁴ : f_j·x ≡ 0 (mod m_j) } (Hermite basis), as the kernel of ℤ⁴ → ⊕ ℤ/m_j. */
function latticeOfConds(conds, q) {
    const n = conds.length;
    if (!n) return hnf([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], q);
    // rows [Φ(e_i) | e_i] and [m_j e_j | 0]; echelon on the Φ columns first: the rows left with Φ = 0
    // span the kernel
    const rows = [];
    for (let i = 0; i < 4; i++) { const e = [0, 0, 0, 0]; e[i] = 1; rows.push(conds.map((c) => md(c.f[i], c.m)).concat(e)); }
    conds.forEach((c, j) => { const r = Array(n + 4).fill(0); r[j] = c.m; rows.push(r); });
    let pool = rows;
    for (let col = 0; col < n; col++) {
        let piv = null; const rest = [];
        for (const r of pool) {
            if (r[col] === 0) { rest.push(r); continue; }
            if (!piv) { piv = r; continue; }
            let [a, b] = [piv[col], r[col]], [x0, y0, x1, y1] = [1, 0, 0, 1];
            while (b) { const k = Math.floor(a / b); [a, b] = [b, a - k * b]; [x0, x1] = [x1, x0 - k * x1]; [y0, y1] = [y1, y0 - k * y1]; }
            const np = piv.map((v, i) => x0 * v + y0 * r[i]), nr = piv.map((v, i) => x1 * v + y1 * r[i]);
            piv = np; rest.push(nr);
        }
        pool = rest;
    }
    return hnf(pool.map((r) => r.slice(n)), q);
}

/**
 * Drop the congruences that SL₂ makes redundant: one whose removal leaves the same matrices of
 * determinant 1 (a ≡ d once c ≡ 0 (mod 3), say). Conditions on a − d and the like go first.
 */
function pruneConds(conds, q, cap) {
    let keep = conds.slice();
    const want = slInHull(latticeOfConds(keep, q), q, cap);
    if (want === null) return keep;
    const order = keep.map((c, i) => i).sort((i, j) => (keep[j].f.filter((x) => x).length - keep[i].f.filter((x) => x).length));
    for (const i of order) {
        const c = conds[i], trial = keep.filter((x) => x !== c);
        if (trial.length === keep.length) continue;
        if (slInHull(latticeOfConds(trial, q), q, cap) === want) keep = trial;
    }
    return keep;
}

/** The points of ℙ¹(ℤ/q) that every element fixes: [x : 1], and [1 : y] with ℓ | y. */
function fixedPoints(gens, q, l, max = 4) {
    const pts = [];
    const fixes = (x, y) => gens.every((A) => {
        const u = md(A[0] * x + A[1] * y, q), v = md(A[2] * x + A[3] * y, q);
        return md(u * y - v * x, q) === 0;          // (u, v) ∝ (x, y): the 2 × 2 determinant vanishes
    });
    for (let x = 0; x < q && pts.length <= max; x++) if (fixes(x, 1)) pts.push([x, 1]);
    for (let y = 0; y < q && pts.length <= max; y += l) if (fixes(1, y)) pts.push([1, y]);
    return pts;
}

/**
 * |SL₂ ∩ R| mod ±1. An element of R mod q is Σ cᵢ Bᵢ with cᵢ < q/dᵢ (B upper triangular), and only
 * the last row of B moves d: for fixed c₁, c₂, c₃ the condition det = 1 is a linear congruence
 * a·d₄·c₄ ≡ 1 + bc − a·d′ (mod q) in c₄, whose solutions in [0, q/d₄) are counted directly. So the
 * search runs over q³/(d₁d₂d₃) triples; null past the cap.
 */
function slInHull(B, q, cap) {
    if (latticeIndex(B) === 1) return slOrder(q) / (q > 2 ? 2 : 1);
    const ranges = B.map((r, i) => q / r[i]);
    if (ranges[0] * ranges[1] * ranges[2] > cap) return null;
    const d4 = B[3][3], r4 = ranges[3];
    let count = 0;
    for (let c1 = 0; c1 < ranges[0]; c1++) for (let c2 = 0; c2 < ranges[1]; c2++) for (let c3 = 0; c3 < ranges[2]; c3++) {
        const v = [0, 1, 2, 3].map((j) => md(c1 * B[0][j] + c2 * B[1][j] + c3 * B[2][j], q));
        const [a, b, c, dp] = v;
        // a·d₄·c₄ ≡ β (mod q), with β = 1 + bc − a·d′
        const alpha = md(a * d4, q), beta = md(1 + b * c - a * dp, q);
        const g = gcd(alpha, q);
        if (beta % g) continue;
        const period = q / g;                              // solutions: one residue class mod q/g
        const c0 = period === 1 ? 0 : md((beta / g) * invmod(alpha / g, period), period);
        count += c0 < r4 ? Math.floor((r4 - 1 - c0) / period) + 1 : 0;
    }
    return count / (q > 2 ? 2 : 1);
}

// ── what the image is mod ℓ (Dickson), and the kernel of reduction ──

/** Multiplicative order of x in 𝔽_ℓ^×. */
function orderModL(x, l) { x = md(x, l); if (!x) return Infinity; let y = x, n = 1; while (y !== 1 % l) { y = (y * x) % l; n++; } return n; }
const lcm = (a, b) => a / gcd(a, b) * b;

/**
 * The image of ⟨gens⟩ (in SL₂(𝔽_ℓ), with −1) in PSL₂(𝔽_ℓ), by Dickson's classification:
 *   · 'borel': it fixes exactly one point P of ℙ¹(𝔽_ℓ). Then it has no torus to itself, so it
 *     contains the unipotent radical, and it is { g fixing P with eigenvalue on P in M }, where M is
 *     generated by ±1 and the generators' eigenvalues (the eigenvalue is a character of Stab(P));
 *   · 'split': it fixes two points P, Q, and is { g fixing both, eigenvalue on P in M };
 *   · 'split-normalizer': it fixes or swaps the two points of a pair;
 *   · 'cyclic' / 'dihedral': it fixes no point and preserves no pair (in the normalizer of a
 *     non-split Cartan subgroup); a cyclic one comes with a generator gen, and cartan when it is
 *     the whole non-split Cartan subgroup; or 'A4', 'S4', 'A5'; 'full'; 'trivial'.
 * For 'borel' and 'split' the description is exact and found from the generators alone, with
 * power = [𝔽_ℓ^× : M]: the eigenvalue is a power-th power. order is mod ±1, null when unknown.
 * known: the image, already enumerated, or 'full'.
 */
function shapeModL(gens, l, known, cap) {
    const half = l > 2 ? 2 : 1, full = slOrder(l) / half;
    if (known === 'full') return { kind: 'full', order: full };
    if (gens.every((A) => A[1] === 0 && A[2] === 0 && A[0] === A[3])) return { kind: 'trivial', order: 1 };
    const pts = []; for (let x = 0; x < l; x++) pts.push([x, 1]); pts.push([1, 0]);
    const act = (A, [x, y]) => { const u = md(A[0] * x + A[1] * y, l), v = md(A[2] * x + A[3] * y, l); return v ? [md(u * invmod(v, l), l), 1] : [1, 0]; };
    const eq = (P, Q) => P[0] === Q[0] && P[1] === Q[1];
    const fixedBy = (As) => pts.filter((P) => As.every((A) => eq(act(A, P), P)));
    // the eigenvalue on the line through P = [x : 1] or [1 : 0]
    const eigen = (A, [x, y]) => (y ? md(A[2] * x + A[3], l) : A[0]);
    const fixed = fixedBy(gens);
    if (fixed.length === 1 || fixed.length === 2) {
        const Msize = gens.reduce((s, A) => lcm(s, orderModL(eigen(A, fixed[0]), l)), half);
        // M itself, when short enough to list
        const units = Msize <= 12 ? Array.from({ length: l - 1 }, (_, i) => i + 1).filter((x) => Msize % orderModL(x, l) === 0) : null;
        return {
            kind: fixed.length === 1 ? 'borel' : 'split', points: fixed, power: (l - 1) / Msize, units,
            order: (fixed.length === 1 ? l : 1) * Msize / half,
        };
    }
    const H = known || imageMod(gens, l, cap);
    const order = H ? H.order : null;
    if (order === full) return { kind: 'full', order };
    // a pair preserved by everything: the fixed points of a generator or of a product of two
    const cands = [];
    for (const A of gens) for (const B of [null, ...gens]) {
        const fp = fixedBy([B ? mul(A, B, l) : A]);
        if (fp.length === 2 && !cands.some(([P, Q]) => eq(P, fp[0]) && eq(Q, fp[1]))) cands.push(fp);
    }
    for (const [P, Q] of cands) {
        const keeps = gens.every((A) => { const a = act(A, P), b = act(A, Q); return (eq(a, P) && eq(b, Q)) || (eq(a, Q) && eq(b, P)); });
        if (keeps) return { kind: 'split-normalizer', points: [P, Q], order };
    }
    if (!H) return { kind: 'unknown', order };
    // element orders mod ±1 tell cyclic, dihedral and the exceptional groups apart
    const isPm1 = (A) => A[1] === 0 && A[2] === 0 && A[0] === A[3] && (A[0] === 1 || A[0] === l - 1);
    let maxOrd = 1;
    for (const A of H.elements) { let B = A, n = 1; while (!isPm1(B) && n <= order) { B = mul(B, A, l); n++; } maxOrd = Math.max(maxOrd, n); }
    if (maxOrd === order) {
        // a generator with small entries (as residues in (−ℓ/2, ℓ/2]), for writing the group as ±⟨h⟩
        const sym = (x) => (2 * x > l ? x - l : x);
        let gen = null, best = Infinity;
        for (const A of H.elements) {
            let B = A, n = 1; while (!isPm1(B) && n <= order) { B = mul(B, A, l); n++; }
            if (n !== order) continue;
            const h = A.map(sym), sc = Math.max(...h.map(Math.abs)) * 100 + h.reduce((t, v) => t + Math.abs(v), 0) + (h[0] < 0 ? 1 : 0);
            if (sc < best) { best = sc; gen = h; }
        }
        return { kind: 'cyclic', order, gen, cartan: order === (l + 1) / half };
    }
    if (2 * maxOrd === order) return { kind: 'dihedral', order };
    return { kind: { 12: 'A4', 24: 'S4', 60: 'A5' }[order] || 'unknown', order };
}

/**
 * The description. rows: Γ's generators (rational strings); S: primes; levels: congruence.js's.
 * Returns { local: [{ q, l, k, order, ambient, hullIndex, conds, exact, slHull, inside, modL, kernel,
 * fullKernel, byModL }], product, joint, linked, classes: { gamma, lambda, basis } } or null.
 */
export function describeClosure(rows, S, levels, { cap = 600000, jointOrder = null } = {}) {
    S = S.map(Number);
    const gens = rows.map(primitiveRow);
    if (gens.some((g) => !g)) return null;
    const K = kernelZero(gens, S);
    const local = [];
    for (const q of levels) {
        const l = primeOf(q);
        let k = 0; for (let x = q; x > 1; x /= l) k++;
        const lifts = liftsMod(K, q);
        const B = algebraHull(lifts, q);
        // ℓ ≥ 5 with no linear condition: by Dickson, a proper subgroup of PSL₂(𝔽_ℓ) fixing no point
        // has at most max(2(ℓ + 1), 60) elements, so a short search mod ℓ decides fullness there; and a
        // closed subgroup of SL₂(ℤ_ℓ) that is full mod ℓ is all of it (Serre), so then H_q is full
        let H = null, fullBySerre = false;
        if (l >= 5 && latticeIndex(B) === 1) {
            const small = imageMod(lifts.map((A) => A.map((x) => x % l)), l, 2 * Math.max(2 * (l + 1), 60) + 2);
            if (!small) fullBySerre = true;
        }
        if (!fullBySerre) H = imageMod(lifts, q, cap);
        const found = congruencesOf(B, q);
        const conds = found ? pruneConds(found, q, cap) : null;
        const slHull = slInHull(B, q, cap);
        const fixed = q <= 20000 ? fixedPoints(lifts, q, l) : [];
        const ambient = slOrder(q) / (q > 2 ? 2 : 1);
        const order = fullBySerre ? ambient : H ? H.order : null;
        const exact = order !== null && slHull !== null && order === slHull;
        // the image mod ℓ, and the kernel of reduction to it (of fullKernel elements, mod ±1)
        const modL = shapeModL(lifts.map((A) => A.map((x) => x % l)), l, fullBySerre ? 'full' : k === 1 ? H : null, cap);
        const fullKernel = ambient / (slOrder(l) / (l > 2 ? 2 : 1));
        const kernel = k > 1 && order !== null && modL.order ? order / modL.order : null;
        // cut out by its image mod ℓ: when that is described exactly and the kernel is everything
        const byModL = ['full', 'trivial', 'borel', 'split', 'cyclic'].includes(modL.kind) && (k === 1 || kernel === fullKernel);
        local.push({
            q, l, k, order, count: fullBySerre ? slOrder(q) : H ? H.elements.length : null, ambient, hullIndex: latticeIndex(B), conds, exact, slHull,
            fixed: fixed.length && fixed.length <= 2 ? fixed : [],
            inside: order !== null && slHull !== null ? slHull / order : null,
            modL, kernel, fullKernel, byModL,
        });
    }
    // the product of the local images in SL₂(ℤ/N), mod ±1, against the joint image (Goursat)
    const N = levels.reduce((s, q) => s * q, 1);
    const product = local.every((x) => x.count !== null) ? local.reduce((s, x) => s * x.count, 1) / (N > 2 ? 2 : 1) : null;
    const joint = jointOrder ?? null;
    // the determinant classes Γ meets, as signed products of primes of S modulo squares
    const cls = gens.map((g) => detClass(g, S)).filter((c) => c);
    const basis = [];
    for (let c of cls) { for (const b of basis) if ((c ^ b) < c) c ^= b; if (c) { basis.push(c); basis.sort((x, y) => y - x); } }
    const classText = (c) => { const f = []; if (c & 1) f.push('-1'); S.forEach((p, i) => { if (c & (2 << i)) f.push(String(p)); }); return f.join('\\cdot '); };
    return {
        local, product, joint,
        linked: product !== null && joint !== null ? Math.round(product / joint) : null,
        classes: { gamma: K.classes, lambda: 2 ** (S.length + 1), basis: basis.map(classText) },
    };
}

// ── as TeX ──

const coefTex = (k, name) => (k === 1 ? name : k === -1 ? `-${name}` : `${k}${name}`);
/** One congruence f·x ≡ 0 (mod m) as TeX, terms moved to make both sides positive. */
export function congruenceTex({ f, m }, withModulus = true) {
    const lhs = [], rhs = [];
    f.forEach((v, i) => { if (v > 0) lhs.push(coefTex(v, NAMES[i])); if (v < 0) rhs.push(coefTex(-v, NAMES[i])); });
    return `${lhs.join(' + ') || '0'} \\equiv ${rhs.join(' + ') || '0'}${withModulus ? ` \\pmod{${m}}` : ''}`;
}

/**
 * The congruences as a matrix pattern where they allow: divisibility of single entries goes into
 * the matrix ((a 2b; 3c d)); the rest (a ≡ d, …) is listed. conds may come from several primes.
 */
export function patternTex(conds) {
    const entryMod = [1, 1, 1, 1], side = [];
    for (const c of conds) {
        const nz = c.f.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
        if (nz.length === 1 && Math.abs(c.f[nz[0]]) === 1) entryMod[nz[0]] = entryMod[nz[0]] * c.m / gcd(entryMod[nz[0]], c.m);
        else side.push(c);
    }
    // a ≡ d at several moduli combine
    const merged = [];
    for (const c of side) {
        const same = merged.find((x) => x.f.join() === c.f.join());
        if (same) same.m = same.m * c.m / gcd(same.m, c.m); else merged.push({ f: c.f.slice(), m: c.m });
    }
    const entry = (i) => (entryMod[i] === 1 ? NAMES[i] : `${entryMod[i]}${NAMES[i]}`);
    const matrix = `\\begin{pmatrix} ${entry(0)} & ${entry(1)} \\\\ ${entry(2)} & ${entry(3)} \\end{pmatrix}`;
    // one modulus once: b ≡ c, a ≡ c + d (mod 2)
    const byMod = new Map();
    for (const c of merged) byMod.set(c.m, (byMod.get(c.m) || []).concat([congruenceTex(c, false)]));
    return { matrix, side: [...byMod].map(([m, parts]) => `${parts.join(',\\ ')} \\pmod{${m}}`), plain: entryMod.every((x) => x === 1) && !merged.length };
}

const POWERS = { 2: 'square', 3: 'cube', 4: 'fourth power', 5: 'fifth power', 6: 'sixth power', 7: 'seventh power', 8: 'eighth power', 9: 'ninth power', 10: 'tenth power', 11: 'eleventh power', 12: 'twelfth power' };
/** 'a fifth power', in words (with $…$ past twelve). */
export const powerName = (m) => (POWERS[m] ? `a ${POWERS[m]}` : `an $${m}$th power`);
export const pointTex = ([x, y]) => `[${x} : ${y}]`;
const colTex = ([x, y]) => `\\binom{${x}}{${y}}`;
export const matrixTex = (h) => `\\begin{pmatrix} ${h[0]} & ${h[1]} \\\\ ${h[2]} & ${h[3]} \\end{pmatrix}`;

/**
 * The image mod ℓ (shapeModL) as conditions on g, in TeX, when it is cut out by them: g fixes a
 * point, with eigenvalue lam there in a subgroup of 𝔽_ℓ^×; or g ≡ ±1. [] otherwise.
 */
export function modLConditionsTex(s, l, lam = '\\lambda') {
    const [P, Q] = s.points || [];
    const unitsTex = !s.power || s.power === 1 ? null
        : s.units && s.units.length === 2 ? `${lam} \\equiv \\pm 1` : `${lam} \\in (\\mathbb{F}_{${l}}^{\\times})^{${s.power}}`;
    if (s.kind === 'borel') {
        return unitsTex ? [`g ${colTex(P)} \\equiv ${lam} ${colTex(P)} \\pmod{${l}}`, unitsTex] : [`g \\cdot ${pointTex(P)} \\equiv ${pointTex(P)} \\pmod{${l}}`];
    }
    if (s.kind === 'split') {
        return unitsTex
            ? [`g ${colTex(P)} \\equiv ${lam} ${colTex(P)},\\ g ${colTex(Q)} \\equiv ${lam}^{-1} ${colTex(Q)} \\pmod{${l}}`, unitsTex]
            : [`g \\cdot ${pointTex(P)} \\equiv ${pointTex(P)},\\ g \\cdot ${pointTex(Q)} \\equiv ${pointTex(Q)} \\pmod{${l}}`];
    }
    if (s.kind === 'trivial') return [`g \\equiv ${l > 2 ? '\\pm ' : ''}1 \\pmod{${l}}`];
    if (s.kind === 'cyclic' && s.gen) return [`g \\bmod ${l} \\in ${l > 2 ? '\\pm' : ''}\\left\\langle ${matrixTex(s.gen)} \\right\\rangle`];
    return [];
}

/** (testing) */
export const _internal = { hnf, slInHull, latticeOfConds, congruencesOf, algebraHull, shapeModL };
