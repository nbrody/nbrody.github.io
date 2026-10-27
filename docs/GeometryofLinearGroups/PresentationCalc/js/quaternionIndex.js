/**
 * quaternionIndex.js — the exact step when the quaternion algebra A of Γ is totally definite over a totally
 * real field k (k = ℚ included): coset enumeration in Λ = N(𝒪[1/S])/k^×.
 *
 * Γ is bounded at every infinite place (A is ramified there) and at every prime outside S, so it lies in Λ for
 * a maximal order 𝒪 of A that Γ normalizes away from S (found below). Λ acts on X = ∏_{𝔭 ∈ S} T_𝔭, the trees
 * of PGL₂(k_𝔭) with N𝔭 + 1 edges at each vertex, whose vertices are the maximal orders equal to 𝒪 outside S.
 * The stabilizers are finite. Λ is presented by its action on X (simply connected, made of squares):
 *   vertices    representatives r_1 = 𝒪, r_2, … of the Λ-orbits, found by walking out from 𝒪: a neighbour w of
 *               some r_i is in the orbit of r_j when λ r_j λ⁻¹ = w for some λ, found exactly (below), and is a
 *               new representative when there is none;
 *   generators  the elements of each stabilizer U_i = N(r_i)/k^×, and a letter λ for every neighbour w of
 *               every r_i (λ r_j = w);
 *   relators    the multiplication of each U_i, s·a_w = a_{s·w}·u (s a generator of U_i), the edge inversions
 *               a·a′·u = 1, the squares a·b = b′·a′·u, and a = 1 for a letter that is 1.
 * Every generator symbol is an element of Λ and every relator is checked by multiplying it out, so the
 * presented group maps onto the group they generate, which is Λ when the stabilizers and orbits are complete
 * (they are: below). A closed coset table proves [Λ : Γ] finite in any case.
 *
 * Exact searches, with proven bounds (k has class number one, checked; the units are known modulo squares):
 *   · U_i: the x ∈ r_i whose reduced norm is a totally positive generator of 𝔡_e (a product of ramified primes)
 *     times a unit class: Fincke–Pohst on Tr_{k/ℚ}∘nrd up to Tr(ν), which is exhaustive;
 *   · λ with λ r_j λ⁻¹ = w: up to k^× it lies in the connecting ideal w·r_j with reduced norm a generator of
 *     𝔡_e·nrd(w·r_j), the same search;
 *   · the neighbours of r_i at 𝔭: the left orders 𝔭⁻¹ I Ī of the right ideals I = x r_i + 𝔭 r_i of norm 𝔭.
 * The maximal order: 𝒪_k⟨1, I, J, IJ⟩ enlarged by index-q steps in its dual; at a prime q outside S where Γ
 * does not normalize it, the intersection of its Γ-conjugates at q, and a Γ-invariant maximal overorder.
 * At a split prime outside S where a reduced norm has odd valuation, Γ inverts an edge there: the elements with
 * even valuations form a subgroup K of index ≤ 2^r, which takes Γ's place (as in sarithIndex.exactIndexCheck).
 *
 * The congruence sandwich: Λ acts on r_1/N r_1 by conjugation (N prime to S); Λ(N) is the kernel. With H the
 * image of Γ and λ_c the coset table's representatives, Γ ⊇ Λ(N) exactly when the cosets H·λ̄_c are distinct.
 */
import { field, parsePoly } from './cusps.js';
import { enumerateFelsch } from './felsch.js';
import { makeEmbedding, borelCovolume, dirichletStabilizer, lllFloat, gramOf, centreLattice } from './quaternionDirichlet.js';
import {
    KField, QAlgebra, Q, qadd, qsub, qmul, qdiv, babs, bgcd, blcm, vp, modn, primesOf, normFlat, solveRat, lattice, elemsOf, latEq, latKey,
    latSum, latScale, latScaleQ, latIndex, coordsIn, contains, latIntersect, patchAt, patchExponent, discOf,
    indexQOverorders, maximalizeAt, lll, shortVectors,
} from './quatOrders.js';

export { enumerateFelsch };
const qnum = (q) => Number(q[0]) / Number(q[1]);
const qstr = (q) => (q[1] === 1n ? `${q[0]}` : `${q[0]}/${q[1]}`);

// ───────────────────────── A₀ = k[Γ⁽²⁾] ⊂ M₂(F) as (α, β)_k ─────────────────────────

/**
 * The invariant quaternion algebra in an orthogonal basis 1, I, J, K = IJ with I² = α, J² = β ∈ ℤ[θ], and each
 * generator of Γ as an element of it up to F^× (flat integer vectors, content 1). gens: rows of ringEngine text
 * in w; poly: of w, low → high; fieldInfo: step 1's k ({ minpoly, P: θ^j in F's coordinates }), or ℚ.
 */
export function quaternionAlgebra(gens, poly, fieldInfo = null) {
    const F = field(poly.map(BigInt)), dF = F.d;
    const norm = (v, D) => { let g = D; for (const x of v) g = bgcd(g, x); if (D < 0n) g = -g; return { v: v.map((x) => x / g), D: D / g }; };
    const fe = (v, D = 1n) => norm(v, D);
    const fmul = (a, b) => fe(F.mul(a.v, b.v), a.D * b.D);
    const fadd = (a, b) => fe(F.add(F.scale(a.v, b.D), F.scale(b.v, a.D)), a.D * b.D);
    const fneg = (a) => ({ v: F.scale(a.v, -1n), D: a.D });
    const fzero = (a) => F.isZero(a.v);
    const fdiv = (a, b) => { const q = F.divide(F.scale(a.v, b.D), F.scale(b.v, a.D)); return fe(q.num, q.den); };
    const mm = (A, B) => [fadd(fmul(A[0], B[0]), fmul(A[1], B[2])), fadd(fmul(A[0], B[1]), fmul(A[1], B[3])), fadd(fmul(A[2], B[0]), fmul(A[3], B[2])), fadd(fmul(A[2], B[1]), fmul(A[3], B[3]))];
    const madd = (A, B) => A.map((x, i) => fadd(x, B[i]));
    const mscale = (A, c) => A.map((x) => fmul(x, c));
    const meq = (A, B) => A.every((x, i) => fzero(fadd(x, fneg(B[i]))));
    const tr = (A) => fadd(A[0], A[3]);
    const det = (A) => fadd(fmul(A[0], A[3]), fneg(fmul(A[1], A[2])));
    const fromQ = (n, m = 1n) => fe([n].concat(Array(dF - 1).fill(0n)), m);
    const ONE = [fromQ(1n), fromQ(0n), fromQ(0n), fromQ(1n)], ZERO = [fromQ(0n), fromQ(0n), fromQ(0n), fromQ(0n)];
    // k = ℚ(θ) ⊆ F
    const rat = (s) => { const [a, b] = String(s).split('/'); return Q(BigInt(a), BigInt(b || '1')); };
    let K, Pk;
    if (fieldInfo && fieldInfo.minpoly && fieldInfo.minpoly.length > 2) {
        K = new KField(fieldInfo.minpoly.map(BigInt));
        Pk = fieldInfo.P.map((row) => row.map(rat));
        if (Pk.length !== K.n || Pk.some((r) => r.length !== dF)) return { error: 'the trace field does not match the field of definition' };
    } else {
        K = new KField([0n, 1n]);
        Pk = [Array.from({ length: dF }, (_, i) => Q(i === 0 ? 1n : 0n))];
    }
    const n = K.n;
    // F-coordinates → θ-coordinates: n coordinates where the θ^j are independent, then a check of all
    const pivots = [];
    {
        const ech = [];
        for (let c = 0; c < dF && pivots.length < n; c++) {
            let v = Pk.map((row) => row[c]);
            for (const b of ech) { const t = v[b.piv]; if (t[0] !== 0n) { const f = qdiv(t, b.vec[b.piv]); v = v.map((x, i) => qsub(x, qmul(f, b.vec[i]))); } }
            const piv = v.findIndex((x) => x[0] !== 0n);
            if (piv >= 0) { ech.push({ vec: v, piv }); pivots.push(c); }
        }
        if (pivots.length !== n) return { error: 'internal: the powers of θ are not independent' };
    }
    const toK = (a) => {
        const vec = a.v.map((x) => Q(x, a.D));
        const M = pivots.map((c) => Pk.map((row) => row[c]));
        const sol = solveRat(M, pivots.map((c) => vec[c]));
        if (!sol) return null;
        // check every coordinate
        for (let c = 0; c < dF; c++) {
            let s = Q(0n);
            sol.forEach((x, j) => { s = qadd(s, qmul(x, Pk[j][c])); });
            if (s[0] !== vec[c][0] || s[1] !== vec[c][1]) return null;
        }
        return K.fromRats(sol);
    };
    const kToF = (x) => {
        let s = fromQ(0n);
        x.v.forEach((c, j) => { if (c) { const P = Pk[j], D = P.reduce((l, q) => blcm(l, q[1]), 1n); s = fadd(s, fe(P.map((q) => q[0] * (D / q[1]) * c), D * x.d)); } });
        return s;
    };
    const G = [];
    for (const row of gens) {
        const q = row.map((s) => parsePoly(s, dF));
        if (q.some((x) => !x)) return { error: 'an entry could not be read' };
        G.push(q.map((e) => fe(e.num, e.den)));
    }
    if (G.some((g) => fzero(det(g)))) return { error: 'a generator is singular' };
    const adj = (A) => [A[3], fneg(A[1]), fneg(A[2]), A[0]];
    const half = (g) => { const g2 = mm(g, g), dt = det(g); return g2.map((x) => fdiv(x, dt)); };
    const pool = [];
    for (let i = 0; i < G.length; i++) { pool.push(G[i]); for (let j = 0; j < G.length; j++) if (j !== i) { pool.push(mm(G[i], G[j])); pool.push(mm(G[i], adj(G[j]))); } }
    const Hs = pool.map(half);
    // pure elements P (trace 0) with P² = −det P ∈ k, scaled so that it lies in ℤ[θ]
    const pure = (A) => { const t = toK(tr(A)); return t ? madd(A, mscale(ONE, fneg(fdiv(kToF(t), fromQ(2n))))) : null; };
    const scaled = (P) => {
        const a0 = toK(fneg(det(P)));
        if (!a0 || K.isZero(a0)) return null;
        // P·m: α·m², m the denominator; then remove a rational square from the content
        let m = a0.d, a = K.scale(a0, a0.d * a0.d);
        const content = a.v.reduce((s, c) => bgcd(s, c), 0n);
        let sq = 1n;
        for (const p of primesOf(content)) { let e = vp(content, p); while (e >= 2) { sq *= p; e -= 2; } }
        a = K.norm1(a.v.map((c) => c / (sq * sq)), 1n);
        return { P: mscale(P, fe([m].concat(Array(dF - 1).fill(0n)), sq)), a };
    };
    const cands = [];
    for (const X of Hs.slice(0, 40)) { const P = pure(X); if (P && !meq(P, ZERO)) cands.push(P); }
    const size = (x) => qnum(K.norm(x)) < 0 ? -qnum(K.norm(x)) : qnum(K.norm(x));
    let best = null;
    for (const P of cands) { const c = scaled(P); if (c && (!best || size(c.a) < size(best.a))) best = c; }
    if (!best) return { error: 'Γ⁽²⁾ spans no quaternion algebra (reducible or elementary)' };
    const I = best.P, alpha = best.a;
    let bestJ = null;
    for (const P of cands) {
        const t = toK(tr(mm(P, I)));
        if (!t) continue;
        const J1 = madd(P, mscale(I, fneg(fdiv(kToF(t), kToF(K.scale(alpha, 2n))))));     // tr(J₁I) = 0
        if (meq(J1, ZERO)) continue;
        const c = scaled(J1);
        if (c && (!bestJ || size(c.a) < size(bestJ.a))) bestJ = c;
    }
    if (!bestJ) return { error: 'Γ⁽²⁾ spans no quaternion algebra (reducible or elementary)' };
    const J = bestJ.P, beta = bestJ.a, Km = mm(I, J), E = [ONE, I, J, Km];
    const QA = new QAlgebra(K, alpha, beta);
    // coordinates by the trace form: tr(X·e) = 2·e²·c for e = 1, I, J, K (e² = 1, α, β, −αβ)
    const sqs = [K.one, alpha, beta, K.neg(QA.ab)];
    const coords = (X) => {
        const c = [];
        for (let i = 0; i < 4; i++) {
            const t = toK(tr(mm(X, E[i])));
            if (!t) return null;
            c.push(K.div(t, K.scale(sqs[i], 2n)));
        }
        let Y = ZERO;
        c.forEach((ci, i) => { Y = madd(Y, mscale(E[i], kToF(ci))); });
        return meq(Y, X) ? c : null;
    };
    const flat = (c) => QA.prim(QA.fromBlocks(c));
    const quatOf = (g) => {
        const t = tr(g);
        if (!fzero(t)) { const c = coords(mscale(g, fdiv(t, det(g)))); return c ? flat(c) : null; }
        for (let i = 1; i < 4; i++) {
            const y = mm(g, E[i]), ty = tr(y);
            if (fzero(ty)) continue;
            const c = coords(mscale(y, fdiv(ty, det(y))));
            if (!c) return null;
            const e = [K.zero, K.zero, K.zero, K.zero]; e[i] = K.one;
            return QA.prim(QA.mul(flat(c), QA.fromBlocks(e)));        // ∝ g·eᵢ·eᵢ = g·eᵢ²
        }
        return null;
    };
    const quats = [];
    for (const g of G) { const q = quatOf(g); if (!q) return { error: 'a generator does not normalize the invariant quaternion algebra' }; quats.push(q); }
    if (K.real && K.sigma(alpha).every((x) => x < 0) && K.sigma(beta).every((x) => x < 0)) return reduceBasis(K, QA, quats);
    // the basis as matrices over F (for the embedding at the split place: quaternionDirichlet.js)
    const Finfo = (Es) => ({ poly: poly.map(BigInt), basis: Es.map((Xm) => Xm.map((x) => ({ v: x.v.slice(), D: x.D }))), theta: Pk.map((row) => row.map((q) => [q[0], q[1]])) });
    const F0 = Finfo(E);
    const emb0 = makeEmbedding(K, QA, F0);
    if (!emb0) return { K, QA, quats, alpha, beta, F: F0 };
    // a better basis, by the majorant of the split place; its elements as matrices over F
    const red = reduceBasis(K, QA, quats, emb0.gram);
    if (!red.basis) return { K, QA, quats, alpha, beta, F: F0 };
    const toFmat = (b) => { let M = ZERO; QA.blocks(b).forEach((c, i) => { if (!K.isZero(c)) M = madd(M, mscale(E[i], kToF(c))); }); return M; };
    return { ...red, F: Finfo(red.basis.map(toFmat)) };
}

/**
 * A definite algebra in a better basis: I, J the shortest orthogonal vectors (for Tr∘nrd, by LLL) of the O_k-span
 * of the pure parts of short words in Γ, so that α, β are small and 𝒪_k⟨1, I, J, IJ⟩ is close to maximal.
 */
function reduceBasis(K, QA0, quats, Gflat = null) {
    const n = K.n, D = 4 * n;
    const pool = quats.slice();
    const letters = quats.concat(quats.map((x) => QA0.conj(x)));
    for (const x of letters) for (const y of letters) pool.push(QA0.prim(QA0.mul(x, y)));
    const pureOf = (x) => ({ v: x.v.map((c, i) => (i < n ? 0n : c)), d: x.d });
    const gens = [];
    for (const x of pool) { const p = pureOf(x); if (p.v.some((c) => c)) for (const w of K.okBasis) gens.push(QA0.scaleK(p, w)); }
    // the pure lattice on its 3n coordinates
    const L = lattice(gens.map((x) => ({ v: x.v.slice(n), d: x.d })));
    if (!L) return { K, QA: QA0, quats, alpha: QA0.alpha, beta: QA0.beta };
    const pad = (x) => ({ v: new Array(n).fill(0n).concat(x.v), d: x.d });
    // the positive form: Tr∘nrd (definite), or the majorant of the split place on the pure coordinates
    const red = (Gflat ? lllFloat(elemsOf(L), Gflat.slice(n).map((r) => r.slice(n))) : lll(elemsOf(L), (a, b) => QA0.bil(pad(a), pad(b)))).map(pad);
    const ip = (x, y) => { const p = QA0.mul(x, QA0.conj(y)); return K.norm1(p.v.slice(0, n), p.d); };   // ⟨x, y⟩ = (x ȳ)₀ ∈ k
    const absN = (x) => { const q = K.norm(x); return Math.abs(Number(q[0]) / Number(q[1])); };
    // α = I² = −nrd(I), made integral (I·m) and free of rational square content
    const integral = (P) => {
        const a0 = K.neg(QA0.nrd(P));
        let a = K.scale(a0, a0.d * a0.d), m = Q(a0.d);
        const content = a.v.reduce((g, c) => bgcd(g, c), 0n);
        let sq = 1n;
        for (const p of primesOf(content)) { let e = vp(content, p); while (e >= 2) { sq *= p; e -= 2; } }
        a = K.norm1(a.v.map((c) => c / (sq * sq)), 1n);
        m = Q(m[0], sq);
        return { P: normFlat(P.v.map((c) => c * m[0]), P.d * m[1]), a };
    };
    // I: the first vector of nonzero norm (a split algebra has nilpotent pure elements)
    const i0 = red.findIndex((v) => !K.isZero(QA0.nrd(v)));
    if (i0 < 0) return { K, QA: QA0, quats, alpha: QA0.alpha, beta: QA0.beta };
    const I = integral(red[i0]);
    let best = null;
    for (const v of red.filter((_, i) => i !== i0)) {
        const t = K.div(ip(v, I.P), ip(I.P, I.P));
        const J = { v: v.v.map((c, i) => c), d: v.d };
        const Jp = (() => { const tI = QA0.scaleK(I.P, t); return normFlat(J.v.map((c, i) => c * tI.d - tI.v[i] * J.d), J.d * tI.d); })();
        if (!Jp.v.some((c) => c) || K.isZero(QA0.nrd(Jp))) continue;
        const c = integral(Jp);
        if (!best || absN(c.a) < absN(best.a)) best = c;
    }
    if (!best) return { K, QA: QA0, quats, alpha: QA0.alpha, beta: QA0.beta };
    const Jv = best.P, Kv = QA0.mul(I.P, Jv);
    const QA = new QAlgebra(K, I.a, best.a);
    const basis = [QA0.one(), I.P, Jv, Kv];
    const norms = basis.map((e) => ip(e, e));
    const toNew = (x) => QA.prim(QA.fromBlocks(basis.map((e, i) => K.div(ip(x, e), norms[i]))));
    // check: the new coordinates multiply like the old ones
    const back = (y) => { let s = { v: new Array(D).fill(0n), d: 1n }; QA.blocks(y).forEach((c, i) => { const t = QA0.scaleK(basis[i], c); s = normFlat(s.v.map((a, j) => a * t.d + t.v[j] * s.d), s.d * t.d); }); return s; };
    const out = quats.map(toNew);
    out.forEach((y, i) => { if (QA0.key(back(y)) !== QA0.key(quats[i])) throw new Error('internal: the change of basis failed'); });
    return { K, QA, quats: out, alpha: I.a, beta: best.a, basis };
}

// ───────────────────────── primes of k ─────────────────────────

const sameRows = (A, B) => A.length === B.length && A.every((r, i) => r.length === B[i].length && r.every((x, j) => BigInt(x) === BigInt(B[i][j])));
/** A prime of k, from a rational prime (k = ℚ, or one prime above it) or step 1's { p, e, f, H }. */
function primeOf(K, s) {
    const p = BigInt(typeof s === 'object' ? s.p : s);
    const all = K.primesAbove(p);
    let P = null;
    if (typeof s === 'object' && s.H && K.n > 1) P = all.find((c) => sameRows(c.H, s.H)) || null;
    else if (all.length === 1) P = all[0];
    else if (typeof s === 'object') { const m = all.filter((c) => c.e === s.e && c.f === s.f); if (m.length === 1) P = m[0]; }
    if (!P) throw new Error(`cannot tell which prime above ${p} is meant`);
    return withInverse(K, P);
}
function withInverse(K, P) {
    const N = P.p ** BigInt(P.f);
    let inv;
    if (K.n === 1) inv = lattice([{ v: [1n], d: P.p }]);
    else {
        const b = K.fromOk(P.pr.b.map(BigInt));
        inv = lattice(K.okBasis.concat(K.okBasis.map((w) => K.divInt(K.mul(w, b), P.p))));
    }
    return { ...P, N, inv, key: primeKey(P) };
}
const primeKey = (P) => `${P.p}|${latKey(P.L)}`;

/** (a, b)_p for nonzero integers (k = ℚ). */
function hilbert(a, b, p) {
    const legendre = (x, q) => { x = modn(x, q); if (x === 0n) return 0; let r = 1n, e = (q - 1n) / 2n, base = x; while (e > 0n) { if (e & 1n) r = (r * base) % q; base = (base * base) % q; e >>= 1n; } return r === 1n ? 1 : -1; };
    const split = (x) => { let e = 0n; while (x % p === 0n) { x /= p; e++; } return [e, x]; };
    const [ea, u] = split(a), [eb, v] = split(b);
    if (p !== 2n) {
        let s = (ea * eb * ((p - 1n) / 2n)) % 2n ? -1 : 1;
        if (eb % 2n) s *= legendre(u, p);
        if (ea % 2n) s *= legendre(v, p);
        return s;
    }
    const eps = (x) => modn((x - 1n) / 2n, 2n), om = (x) => modn((x * x - 1n) / 8n, 2n);
    return (eps(u) * eps(v) + ea * om(v) + eb * om(u)) % 2n ? -1 : 1;
}

// ───────────────────────── the step ─────────────────────────

/**
 * [Λ : Γ] for Γ = ⟨gens⟩ (rows of ringEngine text in w, poly of w low → high), S the primes of k where Γ is
 * unbounded (rational primes over ℚ, or step 1's { p, e, f, H }). opts: field (step 1's k: { minpoly, P }),
 * ram (step 1's finite ramified primes, { p, f, e, H }), levelPrimes ([{ p, level }], where the congruence
 * closure is deficient), seconds / maxCosets (Todd–Coxeter), buildSeconds, maxReps, maxNorm.
 * Returns null when this does not apply, else
 *   { index | limit | error, S, kernelIndex, bad, reps, stabilizers, gens, relators, level, … }.
 */
export function definiteIndex(gens, poly, Sin, opts = {}) {
    Sin = Sin || [];
    const t0 = Date.now();
    let QD;
    try { QD = quaternionAlgebra(gens, poly, opts.field); } catch (e) { QD = { error: e.message }; }
    if (QD.error) return { S: Sin.map((s) => String(typeof s === 'object' ? s.p : s)), kernelIndex: 1, bad: [], index: null, error: QD.error, ms: Date.now() - t0 };
    return indexFromQuaternions(QD, Sin, opts, t0);
}

/** The same, from Γ already in A = (α, β)_k: QD = { K, QA, quats } (quats: flat vectors). */
export function indexFromQuaternions(QD, Sin, opts = {}, t0 = Date.now()) {
    const { seconds = 3, maxCosets = 1500000, maxNorm = 400, maxReps = 48, buildSeconds = 25, congruenceBudget = 1.2e7, congruenceSeconds = 3 } = opts;
    const buildDeadline = t0 + 1000 * buildSeconds;
    Sin = Sin || [];
    const base = { S: Sin.map((s) => String(typeof s === 'object' ? s.p : s)), kernelIndex: 1, bad: [] };
    const fail = (error, extra = {}) => ({ ...base, index: null, error, ms: Date.now() - t0, ...extra });
    const { K, QA } = QD;
    const n = K.n, D = QA.D;
    // the geometry: A totally definite (finite stabilizers, Tr∘nrd), or split at exactly one place v at ∞
    // (stabilizers Fuchsian or Kleinian, the majorant of quaternionDirichlet.js)
    const definite = K.r2 === 0 && K.sigma(QA.alpha).every((x) => x < 0) && K.sigma(QA.beta).every((x) => x < 0);
    const emb = definite ? null : QD.F ? makeEmbedding(K, QA, QD.F) : null;
    if (!definite && !emb) return null;
    if (definite && !Sin.length) return null;                                      // Λ finite: nothing to enumerate
    const ramReal = definite ? K.roots.map((_, i) => i) : emb.realRam;
    const one = QA.one(), ONEKEY = QA.key(one);
    const conjLat = (x, L) => lattice(elemsOf(L).map((b) => QA.conjBy(x, b)));
    const mulLat = (L, M) => { const out = []; for (const a of elemsOf(L)) for (const b of elemsOf(M)) out.push(QA.mul(a, b)); return lattice(out); };
    const kLat = (ks, L) => { const out = []; for (const c of ks) for (const b of elemsOf(L)) out.push(QA.scaleK(b, c)); return lattice(out); };
    const bil = (a, b) => QA.bil(a, b);
    const combo = (E, c) => { const v = new Array(D).fill(0n); c.forEach((ci, i) => { if (ci) { const B = BigInt(ci); for (let j = 0; j < D; j++) v[j] += B * E[i].v[j]; } }); return normFlat(v, E[0].d); };
    const idxInt = (A, T) => { const q = latIndex(T, latSum(A, T)); return q[1] === 1n ? q[0] : null; };      // [A + T : T]
    const reduced = (L) => (definite ? lll(elemsOf(L), bil) : lllFloat(elemsOf(L), emb.gram));
    const gram = (E) => (definite ? E.map((a) => E.map((b) => qnum(bil(a, b)))) : gramOf(E, emb.gram));
    try {
        if (!K.classNumberOne()) return fail('the trace field has class number greater than 1, which this step does not handle yet');
        // S, and the finite primes where A ramifies
        const S = Sin.map((s) => primeOf(K, s));
        if (S.some((P) => P.N > BigInt(maxNorm))) return fail(`a prime of S has norm larger than ${maxNorm}`);
        let ram;
        if (n === 1) {
            const a = QA.alpha.v[0], b = QA.beta.v[0];
            ram = primesOf(2n * a * b).filter((p) => hilbert(a, b, p) === -1).map((p) => withInverse(K, K.primesAbove(p)[0]));
        } else {
            if (!opts.ram) return fail('the ramification of A was not given');
            ram = opts.ram.filter((r) => r.kind === undefined || r.kind === 'finite').map((r) => primeOf(K, r));
        }
        if (S.some((P) => ram.some((R) => R.key === P.key))) return fail('A is ramified at a prime of S');
        const inS = (P) => S.some((s) => s.key === primeKey(P)), isRam = (P) => ram.some((r) => r.key === primeKey(P));

        // K: the elements with even valuations at the split primes outside S
        let X = QD.quats;
        const bad = [];
        const nrdPrimes = (x) => primesOf(K.norm(QA.nrd(x))[0]);
        for (const x of X) for (const q of nrdPrimes(x)) for (const P of K.primesAbove(q)) {
            if (inS(P) || isRam(P)) continue;
            const Pw = withInverse(K, P);
            if (K.valuation(QA.nrd(x), Pw) % 2 && !bad.some((b) => b.key === Pw.key)) bad.push(Pw);
        }
        let kernelIndex = 1;
        if (bad.length) {
            const parity = (x) => bad.map((P) => ((K.valuation(QA.nrd(x), P) % 2) + 2) % 2);
            const keyP = (c) => c.join('');
            const reps = new Map([[keyP(bad.map(() => 0)), { c: bad.map(() => 0), x: one }]]);
            const queue = [...reps.values()];
            while (queue.length) {
                const r = queue.shift();
                for (const g of X) {
                    const c = r.c.map((v, i) => v ^ parity(g)[i]);
                    if (!reps.has(keyP(c))) { const nr = { c, x: QA.prim(QA.mul(r.x, g)) }; reps.set(keyP(c), nr); queue.push(nr); }
                }
            }
            const sch = [];
            for (const r of reps.values()) for (const g of X) {
                const c = r.c.map((v, i) => v ^ parity(g)[i]);
                const y = QA.prim(QA.mul(QA.mul(r.x, g), QA.conj(reps.get(keyP(c)).x)));
                if (QA.key(y) !== ONEKEY) sch.push(y);
            }
            kernelIndex = reps.size;
            X = sch.length ? sch : [one];
        }
        base.kernelIndex = kernelIndex; base.bad = bad.map((P) => `${P.p}`);

        // the neighbours of the vertex L at 𝔭: left orders 𝔭⁻¹IĪ of the right ideals I = xL + 𝔭L of norm 𝔭
        let seed = 12345;
        const rnd = (m) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % m; };
        const neighbours = (L, P) => {
            const want = Number(P.N) + 1, N2 = P.N * P.N;
            const E = reduced(L);
            const pL = kLat(elemsOf(P.L), L);
            const R = Number(P.p < 7n ? P.p : 7n);
            const randEl = () => combo(E, E.map(() => rnd(2 * R + 1) - R));
            const ideal = (x) => { const I = lattice(elemsOf(L).map((b) => QA.mul(x, b)).concat(elemsOf(pL))); const ix = latIndex(I, L); return ix[1] === 1n && ix[0] === N2 ? I : null; };
            let z = null;
            for (let t = 0; t < 40000 && !z; t++) {
                const x = randEl(), nr = QA.nrd(x);
                if (K.isZero(nr) || K.valuation(nr, P) < 1) continue;
                if (ideal(x)) z = x;
            }
            if (!z) throw new Error(`no zero divisor modulo the prime above ${P.p}`);
            const ideals = new Map();
            const take = (x) => { const I = ideal(x); if (I) ideals.set(latKey(I), I); };
            take(z);
            for (let t = 0; t < 80 * want && ideals.size < want; t++) take(QA.mul(randEl(), z));
            if (ideals.size !== want) throw new Error(`found ${ideals.size} of the ${want} neighbours at ${P.p}`);
            const dL = discOf(L, QA);
            return [...ideals.values()].map((I) => {
                const Ib = lattice(elemsOf(I).map((b) => QA.conj(b)));
                const W = kLat(elemsOf(P.inv), mulLat(I, Ib));
                const dW = discOf(W, QA), adj = latIndex(L, latSum(L, W));
                if (dW[0] !== dL[0] || dW[1] !== dL[1] || adj[1] !== 1n || adj[0] !== P.N) throw new Error('internal: a neighbour is not an adjacent maximal order');
                return { L: W, key: latKey(W) };
            });
        };

        // a maximal order that K normalizes at every prime outside S
        const e4 = [];
        for (let c = 0; c < 4; c++) for (const w of K.okBasis) { const bl = [K.zero, K.zero, K.zero, K.zero]; bl[c] = w; e4.push(QA.fromBlocks(bl)); }
        let O = lattice(e4);
        const Nd0 = ram.reduce((s2, P) => s2 * P.N, 1n), discMax = K.disc ** 4n * Nd0 * Nd0;
        for (const q of primesOf(discOf(O, QA)[0])) O = maximalizeAt(O, QA, q, vp(discMax, q));
        // membership at one prime P of k: y ∈ L_P ⟺ s·y ∈ L away from q, where s kills the other primes above q
        const genCache = new Map();
        const genOf = (P) => { const k = primeKey(P); if (!genCache.has(k)) { const g = K.generator(P.L); if (!g) throw new Error(`the prime above ${P.p} is not principal`); genCache.set(k, g); } return genCache.get(k); };
        const inAt = (L, y, P) => {
            const m = coordsIn(L, y).reduce((l, c) => blcm(l, c[1]), 1n), e = vp(m, P.p);
            if (e === 0) return true;
            let s = K.one;
            for (const P2 of K.primesAbove(P.p)) if (primeKey(P2) !== primeKey(P)) { const g = genOf(P2); for (let t = 0; t < e * P2.e; t++) s = K.mul(s, g); }
            const m2 = coordsIn(L, QA.scaleK(y, s)).reduce((l, c) => blcm(l, c[1]), 1n);
            return vp(m2, P.p) === 0;
        };
        const normalizesAt = (M, P) => X.every((x) => [x, QA.conj(x)].every((y) => elemsOf(M).every((b) => inAt(M, QA.conjBy(y, b), P))));
        // the primes outside S (and where A splits) at which K does not normalize L
        const badPrimes = (L) => {
            const qs = new Set();
            for (const x of X) for (const y of [x, QA.conj(x)]) { const idx = latIndex(L, latSum(L, conjLat(y, L))); for (const q of primesOf(idx[0] * idx[1])) qs.add(q); }
            const out = [];
            for (const q of qs) for (const P of K.primesAbove(q)) if (!inS(P) && !isRam(P) && !normalizesAt(L, P)) out.push(withInverse(K, P));
            return out;
        };
        for (const P of badPrimes(O)) {
            // K is bounded at P and preserves types there: it fixes a vertex of T_P, searched for outwards from O
            let found = null;
            const seen = new Set([latKey(O)]), queue = [O];
            for (let h = 0; h < queue.length && !found && h < 400; h++) {
                for (const w of neighbours(queue[h], P)) {
                    if (found || seen.has(w.key)) continue;
                    seen.add(w.key);
                    if (normalizesAt(w.L, P)) found = w.L; else queue.push(w.L);
                }
            }
            if (!found) return fail(`no maximal order at the prime above ${P.p} is normalized by Γ (searched ${seen.size} vertices)`);
            O = found;
        }
        // checks: maximal (d_k⁴·N(𝔡)²), and K normalizes O outside S
        const dsc = discOf(O, QA), Nd = ram.reduce((s, P) => s * P.N, 1n);
        if (dsc[1] !== 1n || dsc[0] !== K.disc ** 4n * Nd * Nd) return fail(`internal: the order has discriminant ${qstr(dsc)}, not ${K.disc ** 4n * Nd * Nd}`);
        if (badPrimes(O).length) return fail('internal: Γ does not normalize the order outside S');

        // reduced norms to look for: totally positive generators of 𝔡_e (e ⊆ ramified primes) times unit classes
        const okL = lattice(K.okBasis);
        const dIdeals = [];
        for (let mask = 0; mask < 1 << ram.length; mask++) { let L = okL; ram.forEach((P, i) => { if (mask & (1 << i)) L = K.idealMul(L, P.L); }); dIdeals.push(L); }
        const targetsFor = (ideal) => { const out = []; for (const dI of dIdeals) { const g = K.positiveGenerators(K.idealMul(dI, ideal), ramReal); if (g) out.push(...g); } return out; };
        const unitTargets = targetsFor(okL);
        const nrdIdeal = (L) => { const E = elemsOf(L), gs = E.map((b) => QA.nrd(b)); for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) gs.push(QA.trd(QA.mul(E[i], QA.conj(E[j])))); return K.idealOf(gs); };
        // elements x ∈ L with nrd(x) ∈ targets: exhaustive up to Tr∘nrd ≤ max Tr(ν) (definite), or up to
        // displacement R at v (the majorant: Σ_w σ_w(ν) + 2|ν|_v cosh R)
        const normBound = (targets, R) => (definite
            ? Math.max(...targets.map((t) => qnum(K.trace(t))))
            : Math.max(...targets.map((nu) => emb.nrdRam(nu).reduce((s2, x) => s2 + x, 0) + 2 * Math.hypot(emb.nrdV(nu).re, emb.nrdV(nu).im) * Math.cosh(R)))) * (1 + 1e-9);
        // (indefinite: the majorant at the centre of the order C, a vertex near the elements looked for)
        const centres = new Map();
        const embAt = (C) => { const k = latKey(C); if (!centres.has(k)) centres.set(k, emb.at(centreLattice(emb, C))); return centres.get(k); };
        const withNorms = (L, targets, test, R = 0, C = null) => {
            if (!targets.length) return null;
            const e2 = definite || !C ? null : embAt(C);
            const E = e2 ? lllFloat(elemsOf(L), e2.gram) : reduced(L);
            for (const c of shortVectors(e2 ? gramOf(E, e2.gram) : gram(E), normBound(targets, R), { max: 3e6 })) {
                const x = combo(E, c);
                const nr = QA.nrd(x);
                if (!targets.some((t) => K.eq(t, nr))) continue;
                const r = test(x);
                if (r) return r;
            }
            return null;
        };
        // the stabilizer of a vertex: { gens, rels (local letters 2k / 2k + 1), word(x), tgens (for the transport
        // relators), order (finite) or covol }
        const covolP = definite ? null : borelCovolume(K, emb.kind, ram.map((P) => P.N));
        const stabilizer = (L) => {
            if (!definite) {
                const U = dirichletStabilizer({ L, QA, K, emb, targets: unitTargets, covolP, conjLat, latEq, deadline: buildDeadline });
                return { ...U, tgens: U.gens.map((_, i) => i), order: null };
            }
            const els = [one], keys = new Map([[ONEKEY, 0]]);
            const add = (x) => { const k = QA.key(x); if (!keys.has(k)) { keys.set(k, els.length); els.push(QA.prim(x)); return true; } return false; };
            withNorms(L, unitTargets, (x) => { if (latEq(conjLat(x, L), L)) add(x); return null; });
            for (let i = 0; i < els.length; i++) for (let j = 0; j < els.length; j++) if (add(QA.mul(els[i], els[j]))) throw new Error('internal: the stabilizer found is not closed');
            const nU = els.length, umul = (a, b) => keys.get(QA.key(QA.mul(els[a], els[b])));
            const gensU = [];
            let span = new Set([0]);
            for (let a = 1; a < nU && span.size < nU; a++) {
                if (span.has(a)) continue;
                gensU.push(a);
                const st = [...span]; span = new Set(st);
                while (st.length) { const x = st.pop(); for (const s2 of gensU) { const y = umul(x, s2); if (!span.has(y)) { span.add(y); st.push(y); } } }
            }
            const rels = [[0]];
            for (const s2 of gensU) for (let t = 0; t < nU; t++) rels.push([2 * s2, 2 * t, 2 * umul(s2, t) + 1]);
            const word = (x) => { const u = keys.get(QA.key(x)); if (u === undefined) throw new Error('internal: not in the stabilizer'); return [2 * u]; };
            return { kind: 'finite', gens: els, rels, word, tgens: gensU, order: nU };
        };
        const identifyWith = (Lw, Lr) => {
            const I = mulLat(Lw, Lr), targets = targetsFor(nrdIdeal(I));
            const test = (x) => (latEq(conjLat(x, Lr), Lw) ? x : null);
            if (definite) return withNorms(I, targets, test);
            for (let R = 1; R <= 16 && Date.now() < buildDeadline; R += 1) {
                let x = null;
                try { x = withNorms(I, targets, test, R, Lr); } catch (e) { if (/too many short vectors/.test(e.message)) return null; throw e; }
                if (x) return x;
            }
            return null;
        };
        // indefinite: by strong approximation the norm-one group is transitive on the vertices of each type, so
        // the orbits are the types (parities of the distances from 𝒪 in each tree) modulo those Λ changes
        let classOf = null;
        if (!definite) {
            const Im = [];
            for (let mask = 0; mask < 1 << S.length; mask++) { let L = okL; S.forEach((P, i) => { if (mask & (1 << i)) L = K.idealMul(L, P.L); }); if (targetsFor(L).length) Im.push(mask); }
            classOf = (t) => Math.min(...Im.map((m) => t ^ m));
        }
        // the vertex orbits, walking out from 𝒪
        const reps = [], repOf = new Map();
        const addRep = (L, type) => { const r = { L, type, key: latKey(L), nbr: S.map(() => new Map()) }; repOf.set(r.key, reps.length); reps.push(r); return reps.length - 1; };
        addRep(O, 0);
        for (let i = 0; i < reps.length; i++) {
            if (Date.now() > buildDeadline) return fail('building Λ took too long');
            const r = reps[i];
            r.U = stabilizer(r.L);
            S.forEach((P, pi) => {
                const type = r.type ^ (1 << pi);
                for (const w of neighbours(r.L, P)) {
                    let j = repOf.get(w.key), lam = one;
                    if (j === undefined) {
                        if (definite) {
                            for (let t = 0; t < reps.length && j === undefined; t++) { const x = identifyWith(w.L, reps[t].L); if (x) { j = t; lam = QA.prim(x); } }
                        } else {
                            const t = reps.findIndex((r2) => classOf(r2.type) === classOf(type));
                            if (t >= 0) {
                                const x = identifyWith(w.L, reps[t].L);
                                if (!x) throw new Error('could not find the element of Λ carrying a vertex to its representative');
                                j = t; lam = QA.prim(x);
                            }
                        }
                        if (j === undefined) { if (reps.length >= maxReps) throw new Error(`more than ${maxReps} vertex orbits`); j = addRep(w.L, type); }
                    }
                    r.nbr[pi].set(w.key, { L: w.L, j, lam, pi });
                }
            });
        }

        // generators: the stabilizers, then the letters
        let nGens = 0;
        const uOff = reps.map((r) => { const o = nGens; nGens += r.U.gens.length; return o; });
        const letters = [];
        reps.forEach((r, i) => r.nbr.forEach((m) => m.forEach((a) => { a.i = i; a.g = nGens++; letters.push(a); })));
        const G2 = (g) => 2 * g, G2i = (g) => 2 * g + 1;
        const elOf = (l) => { const g = l >> 1; let x = null; const i = uOff.findIndex((o, t) => g >= o && g < o + reps[t].U.gens.length); if (i >= 0) x = reps[i].U.gens[g - uOff[i]]; else x = letters[g - letters[0].g].lam; return l & 1 ? QA.conj(x) : x; };
        const uWord = (i, x) => reps[i].U.word(x).map((l) => 2 * uOff[i] + l);
        const invW = (w) => w.slice().reverse().map((l) => l ^ 1);
        const rels = [], kinds = [];
        const push = (kind, w) => { rels.push(w); kinds.push(kind); };
        reps.forEach((r, i) => {
            for (const w of r.U.rels) push('stabilizer', w.map((l) => 2 * uOff[i] + l));
            // transport: s·a_w = a_{s·w}·u, for the generators s of U_i
            r.nbr.forEach((m) => m.forEach((a) => {
                if (QA.key(a.lam) === ONEKEY) push('trivial letter', [G2(a.g)]);
                for (const s2 of r.U.tgens) {
                    const sx = r.U.gens[s2];
                    const a2 = m.get(latKey(conjLat(sx, a.L)));
                    if (!a2 || a2.j !== a.j) throw new Error('internal: the stabilizer does not permute the neighbours');
                    push('transport', [G2(uOff[i] + s2), G2(a.g), ...invW(uWord(a.j, QA.mul(QA.mul(QA.conj(a2.lam), sx), a.lam))), G2i(a2.g)]);
                }
                // the edge back: a⁻¹·r_i is a neighbour of r_j
                const back = reps[a.j].nbr[a.pi].get(latKey(conjLat(QA.conj(a.lam), r.L)));
                if (!back || back.j !== i) throw new Error('internal: an edge has no way back');
                push('inversion', [G2(a.g), G2(back.g), ...uWord(i, QA.mul(QA.conj(back.lam), QA.conj(a.lam)))]);
            }));
        });
        // squares
        for (let pi = 0; pi < S.length; pi++) for (let qi = pi + 1; qi < S.length; qi++) {
            reps.forEach((r) => r.nbr[pi].forEach((a) => reps[a.j].nbr[qi].forEach((b) => {
                const ab = QA.mul(a.lam, b.lam);
                const Oz = conjLat(ab, reps[b.j].L);
                let bp = null, bv = null;
                for (const y of r.nbr[qi].values()) { const v = idxInt(y.L, Oz); if (v !== null && (bv === null || v < bv)) { bv = v; bp = y; } }
                if (bv !== S[pi].N) throw new Error('internal: a square does not close');
                const ap = reps[bp.j].nbr[pi].get(latKey(conjLat(QA.conj(bp.lam), Oz)));
                if (!ap || ap.j !== b.j) throw new Error('internal: a square does not close');
                push('square', [G2(a.g), G2(b.g), ...invW(uWord(b.j, QA.mul(QA.conj(QA.mul(bp.lam, ap.lam)), ab))), G2i(ap.g), G2i(bp.g)]);
            })));
        }
        rels.forEach((w, t) => { if (QA.key(w.reduce((x, l) => QA.prim(QA.mul(x, elOf(l))), one)) !== ONEKEY) throw new Error(`internal: a relator (${kinds[t]}) is not 1 in Λ`); });

        // the generators of K as words: walk from 𝒪 = r_1 towards g·𝒪, one closer neighbour at a time
        const wordOf = (g) => {
            let i = 0, mu = one, T = conjLat(g, reps[0].L);
            const w = [];
            for (let step = 0; step < 100000; step++) {
                const cur = idxInt(reps[i].L, T);
                if (cur === 1n) break;
                let best = null;
                for (const m of reps[i].nbr) for (const a of m.values()) { const v = idxInt(a.L, T); if (v !== null && v < cur && (!best || v < best.v)) best = { a, v }; }
                if (!best) throw new Error('internal: no step closer');
                w.push(G2(best.a.g));
                mu = QA.prim(QA.mul(mu, best.a.lam));
                T = conjLat(QA.conj(best.a.lam), T);
                i = best.a.j;
            }
            if (i !== 0) throw new Error('internal: g·𝒪 is not in the orbit of 𝒪');
            w.push(...uWord(0, QA.mul(QA.conj(mu), g)));
            if (QA.key(w.reduce((x, l) => QA.prim(QA.mul(x, elOf(l))), one)) !== QA.key(g)) throw new Error('internal: a word does not multiply back');
            return w;
        };
        const words = X.map(wordOf);

        const info = {
            k: n, disc: String(Nd), ramified: ram.map((P) => `${P.p}`), reps: reps.length, stabilizers: reps.map((r) => r.U.order),
            units: reps[0].U.order, stabilizer: reps[0].U.order, gens: nGens, relators: rels.length,
            definite, place: definite ? null : emb.kind, covols: definite ? null : reps.map((r) => r.U.covol), stabGens: reps.map((r) => r.U.gens.length),
            letters: S.map((P) => Number(P.N) + 1), norms: S.map((P) => String(P.N)), alpha: `${QA.alpha.v.join(',')}`, beta: `${QA.beta.v.join(',')}`,
        };
        if (opts.debug) info.debug = { rels, words, nGens, elOf, reps, QA, K, O, QD };
        const tc0 = Date.now();
        const r = enumerateFelsch(nGens, rels, words, { seconds, maxCosets });
        const tcMs = Date.now() - tc0;
        if (!r.index) return { ...base, ...info, index: null, limit: r.limit, defined: r.defined, ms: Date.now() - t0, buildMs: tc0 - t0, tcMs };
        let cong = { level: r.index === 1 ? { N: '1', index: 1, factors: [] } : null, levelTried: [] };
        const c0 = Date.now();
        if (r.index > 1) try {
            const below = new Set(S.map((P) => P.p));
            cong = congruenceLevel({ n: r.index, table: r.table, nGens, elOf, words, O: reps[0].L, QA, below, levelPrimes: opts.levelPrimes, ramified: ram.map((P) => P.p), budget: congruenceBudget, seconds: congruenceSeconds });
        } catch (e) { cong.levelTried = [{ error: e.message }]; }
        return { ...base, ...info, index: r.index, defined: r.defined, ms: Date.now() - t0, buildMs: tc0 - t0, tcMs, congMs: Date.now() - c0, level: cong.level, levelTried: cong.levelTried, levelStopped: cong.stopped ?? null, levelBest: cong.best ?? null };
    } catch (e) {
        return fail(e.message);
    }
}

// ───────────────────────── the congruence level ─────────────────────────

/**
 * Γ ⊇ Λ(N) ⟺ the n cosets Γλ_c (λ_c from the coset table) have n distinct images H·λ̄_c mod N, H the image
 * of Γ: Λ acts on O/NO by conjugation (N prime to the primes below S). Candidate levels from the primes where
 * step 1 found the closure deficient; exponents raised while the count grows, then lowered. Each count costs
 * n·|H| products of D × D matrices mod N, within `budget` and `seconds`.
 */
function congruenceLevel({ n, table, nGens, elOf, words, O, QA, below, levelPrimes, ramified, budget, seconds }) {
    const D = O.D, deadline = Date.now() + 1000 * seconds;
    class Stop extends Error { }
    let primes = (levelPrimes || []).map((x) => ({ p: BigInt(x.p), k: Math.max(1, x.level || 1) })).filter((x) => !below.has(x.p));
    if (!primes.length) primes = [...new Set([2n, ...ramified])].filter((p) => !below.has(p)).map((p) => ({ p, k: 1 }));
    if (!primes.length) return { level: null, levelTried: [] };
    const basis = elemsOf(O);
    const adExact = new Map();
    const ad = (l) => {
        if (adExact.has(l)) return adExact.get(l);
        const x = elOf(l);
        const cols = basis.map((b) => coordsIn(O, QA.conjBy(x, b)));
        adExact.set(l, cols);
        return cols;
    };
    const inv = (a, N) => { let [r0, r1, s0, s1] = [modn(a, N), N, 1n, 0n]; while (r1) { const q = r0 / r1; [r0, r1] = [r1, r0 - q * r1]; [s0, s1] = [s1, s0 - q * s1]; } if (r0 !== 1n) throw new Error('internal: not invertible mod N'); return modn(s0, N); };
    const ID = Array.from({ length: D * D }, (_, t) => (Math.floor(t / D) === t % D ? 1 : 0));
    const tried = [];
    const indexAt = (N, firstRepeat = false) => {
        const Nn = Number(N);
        const img = new Map();
        const imgOf = (l) => {
            if (img.has(l)) return img.get(l);
            const cols = ad(l), M = new Array(D * D);
            for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) { const q = cols[j][i]; M[D * i + j] = Number(modn(q[0] * inv(q[1], N), N)); }
            img.set(l, M);
            return M;
        };
        const mm = (A, B) => { const C = new Array(D * D); for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) { let s = 0; for (let k = 0; k < D; k++) s += A[D * i + k] * B[D * k + j]; C[D * i + j] = s % Nn; } return C; };
        const wordM = (w) => w.reduce((A, l) => mm(A, imgOf(l)), ID);
        const gensH = words.map(wordM).concat(words.map((w) => wordM(w.slice().reverse().map((l) => l ^ 1))));
        const capH = Math.floor(budget / (n * (D / 4) ** 3));
        const H = new Map([[ID.join(','), ID]]), st = [ID];
        let ops = 0;
        while (st.length) {
            const A = st.pop();
            for (const g of gensH) { const B = mm(A, g), k = B.join(','); if (!H.has(k)) { H.set(k, B); st.push(B); if (H.size > capH) return null; } }
            if (++ops % 1024 === 0 && Date.now() > deadline) throw new Stop();
        }
        const Hs = [...H.values()];
        const rep = new Array(n);
        rep[0] = ID;
        const q = [0];
        for (let h = 0; h < q.length; h++) { const c = q[h]; for (let x = 0; x < 2 * nGens; x++) { const d = table[c][x]; if (rep[d] === undefined) { rep[d] = mm(rep[c], imgOf(x)); q.push(d); } } }
        const seen = new Set();
        for (let c = 0; c < n; c++) {
            const r = rep[c];
            let best = Infinity;
            for (const h of Hs) {
                let h1 = 0x811c9dc5, h2 = 0x9747b28c;
                for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) {
                    let s = 0;
                    for (let k = 0; k < D; k++) s += h[D * i + k] * r[D * k + j];
                    const e = s % Nn;
                    h1 = Math.imul(h1 ^ e, 0x01000193);
                    h2 = Math.imul(h2 ^ (h2 >>> 15) ^ e, 0x5bd1e995);
                }
                const v = (h1 >>> 0) * 2097152 + ((h2 >>> 0) >>> 11);
                if (v < best) best = v;
            }
            if (seen.has(best) && firstRepeat) return { index: -1, H: Hs.length };
            seen.add(best);
            if (c % 32 === 0 && Date.now() > deadline) throw new Stop();
        }
        return { index: seen.size, H: Hs.length };
    };
    const levelOf = (ps) => ps.reduce((N, x) => N * x.p ** BigInt(x.k), 1n);
    const memo = new Map();
    const evaluate = (ps, firstRepeat = false) => {
        const N = levelOf(ps);
        if (memo.has(N) && !(memo.get(N) === -1 && !firstRepeat)) return memo.get(N);
        const v = N === 1n ? { index: 1, H: 1 } : indexAt(N, firstRepeat);
        tried.push({ N: String(N), index: v ? (v.index === -1 ? `< ${n}` : v.index) : null, H: v ? v.H : null });
        memo.set(N, v ? v.index : null);
        return v ? v.index : null;
    };
    let cur = primes.map((x) => ({ ...x })), m;
    try {
        m = evaluate(cur);
        if (m === null) return { level: null, levelTried: tried };
        for (let round = 0; round < 12 && m < n; round++) {
            let bestPs = null, bestM = m;
            for (let i = 0; i < cur.length && !bestPs; i++) for (const bump of [1, 2]) {
                const ps = cur.map((x, j) => (j === i ? { ...x, k: x.k + bump } : { ...x }));
                const v = evaluate(ps);
                if (v !== null && v > bestM) { bestM = v; bestPs = ps; break; }
            }
            if (!bestPs) break;
            cur = bestPs; m = bestM;
        }
        if (m !== n) return { level: null, levelTried: tried, best: m };
        for (let i = 0; i < cur.length; i++) {
            while (cur[i].k > 0) {
                const ps = cur.map((x, j) => (j === i ? { ...x, k: x.k - 1 } : { ...x }));
                if (evaluate(ps, true) === n) cur = ps; else break;
            }
        }
    } catch (e) {
        if (!(e instanceof Stop)) throw e;
        if (m !== n) return { level: null, levelTried: tried, stopped: 'time', best: m ?? null };
    }
    cur = cur.filter((x) => x.k > 0);
    return { level: { N: String(levelOf(cur)), index: n, factors: cur.map((x) => ({ p: String(x.p), k: x.k })) }, levelTried: tried };
}

export const _internal = { hilbert, quaternionAlgebra };
