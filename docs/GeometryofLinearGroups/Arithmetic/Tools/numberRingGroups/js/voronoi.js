// Voronoi's algorithm for GL_d(O), d = 1 or 2, after Koecher: perfect forms on O^d up to GL_d(O).
//
// V = Hermitian forms on (K⊗R)^d, with the trace pairing ⟨A, B⟩ = Σ_places c_σ tr(A_σ B_σ). A form is
// stored by its dual coordinates α ∈ F^N, so that A[v] = Σ_σ c_σ σ(v)* A_σ σ(v) = α·q(v) with q(v) the
// coordinates of v v* (exact, in F = Q or the cubic field; see nf.js). The Voronoi cones
// σ(P) = cone{ q(v) : v a minimal vector of P } of the perfect forms P tile the positive cone, GL_d(O)
// permutes them with finitely many orbits, and their stabilizers are finite.
import { Rat, R0, R1 } from './nf.js';
import { QF, KCubic } from './scalar.js';
import { lllGram, shortVectors } from './lattice.js';
import { dot, independentSubset, nullspace, isPositiveDefinite, coneFacets, coneRidges } from './polyhedral.js';

const babs = (x) => (x < 0n ? -x : x);

export class FormSpace {
    constructor(nf, d) {
        this.nf = nf; this.d = d;
        const n = nf.n;
        this.n = n;
        this.k = d * n;                                     // rank of the lattice O^d over Z
        if (nf.kind === 'real') { this.F = QF; this.N = d === 2 ? 3 * n : n; }
        else if (nf.kind === 'cm') { this.F = QF; this.N = d === 2 ? 2 * n : nf.m; }
        else if (nf.kind === 'cubic') { this.F = new KCubic(nf); this.N = d === 2 ? 7 : 2; }
        else throw new Error('this field type is not supported');
        const F = this.F;
        // quadratic coefficient matrices: q(v)_k = xᵀ Q_k x, x = Z-coordinates of v
        const e = (i) => { const x = new Array(this.k).fill(0n); x[i] = 1n; return x; };
        const qe = Array.from({ length: this.k }, (_, i) => this.q(this.split(e(i))));
        const half = F.div(F.one, F.fromBig(2n));
        this.Q = Array.from({ length: this.N }, () => Array.from({ length: this.k }, () => new Array(this.k).fill(F.zero)));
        for (let i = 0; i < this.k; i++) {
            for (let c = 0; c < this.N; c++) this.Q[c][i][i] = qe[i][c];
            for (let j = i + 1; j < this.k; j++) {
                const x = e(i); x[j] = 1n;
                const qij = this.q(this.split(x));
                for (let c = 0; c < this.N; c++) {
                    const t = F.mul(F.sub(F.sub(qij[c], qe[i][c]), qe[j][c]), half);
                    this.Q[c][i][j] = this.Q[c][j][i] = t;
                }
            }
        }
        this.alpha0 = this.identityForm();
    }
    /** Z-coordinates (BigInt[k]) → v ∈ O^d */
    split(x) { const out = []; for (let t = 0; t < this.d; t++) out.push(x.slice(t * this.n, (t + 1) * this.n)); return out; }
    flat(v) { return [].concat(...v); }
    /** coordinates of v v* (exact, F^N) */
    q(v) {
        const K = this.nf, F = this.F;
        if (K.kind === 'real') {
            const parts = this.d === 2 ? [K.mul(v[0], v[0]), K.mul(v[0], v[1]), K.mul(v[1], v[1])] : [K.mul(v[0], v[0])];
            return [].concat(...parts).map((t) => new Rat(t));
        }
        if (K.kind === 'cm') {
            const herm = (x, y) => K.mul(x, K.conj(y));
            const parts = this.d === 2 ? [K.toOplus(herm(v[0], v[0])), herm(v[0], v[1]), K.toOplus(herm(v[1], v[1]))] : [K.toOplus(herm(v[0], v[0]))];
            return [].concat(...parts).map((t) => new Rat(t));
        }
        // cubic with one complex place
        if (this.d === 1) return [F.fromO(K.mul(v[0], v[0])), F.fromO(K.sharp(v[0]))];
        return [F.fromO(K.mul(v[0], v[0])), F.fromO(K.mul(v[0], v[1])), F.fromO(K.mul(v[1], v[1])),
            F.fromO(K.sharp(v[0])), F.fromO(K.sharp(v[1])), F.fromO(K.sharpPair(v[0], v[1])), F.fromK(K.Spair(v[0], v[1]))];
    }
    /** α for the form Σ_σ c_σ |σ(v)|² (the trace form of K, summed over the coordinates) */
    identityForm() {
        const K = this.nf, F = this.F, N = this.N;
        if (K.kind === 'real') {
            const tr = K.tr.map((t) => new Rat(t)), z = tr.map(() => R0);
            return this.d === 2 ? tr.concat(z, tr) : tr;
        }
        if (K.kind === 'cm') {
            const tr = K.Oplus.map((b) => new Rat(K.trace(b))), z = new Array(K.n).fill(R0);
            return this.d === 2 ? tr.concat(z, tr) : tr;
        }
        const one = F.one, two = F.fromBig(2n), z = F.zero;
        void N;
        return this.d === 2 ? [one, z, one, two, two, z, z] : [one, two];
    }
    value(alpha, qv) { return dot(this.F, alpha, qv); }
    gram(alpha) {
        const F = this.F, k = this.k;
        const G = Array.from({ length: k }, () => new Array(k).fill(F.zero));
        for (let c = 0; c < this.N; c++) {
            if (F.isZero(alpha[c])) continue;
            const Qc = this.Q[c];
            for (let i = 0; i < k; i++) for (let j = i; j < k; j++) if (!F.isZero(Qc[i][j])) G[i][j] = F.add(G[i][j], F.mul(alpha[c], Qc[i][j]));
        }
        for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) G[i][j] = G[j][i];
        return G;
    }
    gramNum(G) { return G.map((r) => r.map((x) => this.F.toNum(x))); }
    isPD(alpha) { return isPositiveDefinite(this.F, this.gram(alpha)); }

    // ---------------------------------------------------------------- vectors and the group
    /** canonical representative of v modulo the roots of unity (as a key and the vector) */
    canon(v) {
        const K = this.nf;
        if (K.w === 2) {
            const x = this.flat(v), i = x.findIndex((t) => t !== 0n);
            const w = x[i] < 0n ? v.map((c) => K.neg(c)) : v;
            return { v: w, key: this.flat(w).join(',') };
        }
        let best = null;
        for (const z of K.mu) {
            const w = v.map((c) => K.mul(z, c)), key = this.flat(w).join(',');
            if (!best || key < best.key) best = { v: w, key };
        }
        return best;
    }
    act(g, v) {
        const K = this.nf;
        if (this.d === 1) return [K.mul(g[0][0], v[0])];
        return [K.add(K.mul(g[0][0], v[0]), K.mul(g[0][1], v[1])), K.add(K.mul(g[1][0], v[0]), K.mul(g[1][1], v[1]))];
    }
    det(g) { const K = this.nf; return this.d === 1 ? g[0][0] : K.sub(K.mul(g[0][0], g[1][1]), K.mul(g[0][1], g[1][0])); }
    detOf(vs) { const K = this.nf; return this.d === 1 ? vs[0][0] : K.sub(K.mul(vs[0][0], vs[1][1]), K.mul(vs[1][0], vs[0][1])); }
    matMul(a, b) {
        const K = this.nf;
        if (this.d === 1) return [[K.mul(a[0][0], b[0][0])]];
        const m = (i, j) => K.add(K.mul(a[i][0], b[0][j]), K.mul(a[i][1], b[1][j]));
        return [[m(0, 0), m(0, 1)], [m(1, 0), m(1, 1)]];
    }
    identity() { const K = this.nf; return this.d === 1 ? [[K.one()]] : [[K.one(), K.zero()], [K.zero(), K.one()]]; }
    scalar(u) { const K = this.nf; return this.d === 1 ? [[u]] : [[u, K.zero()], [K.zero(), u]]; }
    matKey(g) { return g.map((r) => r.map((x) => x.join(',')).join(';')).join('|'); }
    /** g⁻¹ for g ∈ GL_d(O) */
    matInv(g) {
        const K = this.nf, dt = this.det(g), di = K.inv(dt);
        if (di.d !== 1n) throw new Error('internal: not invertible over O');
        if (this.d === 1) return [[di.v]];
        const s = (x) => K.mul(x, di.v);
        return [[s(g[1][1]), s(K.neg(g[0][1]))], [s(K.neg(g[1][0])), s(g[0][0])]];
    }
    /** do the vectors span K^d? */
    spans(vs) {
        if (this.d === 1) return vs.length > 0;
        for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) if (!this.nf.isZero(this.detOf([vs[a], vs[b]]))) return true;
        return false;
    }

    // ---------------------------------------------------------------- minimal vectors
    /** { m, vecs (mod μ, canonical), keys, qs (distinct q), qidx (vector → q index) } */
    minimalVectors(alpha) {
        const F = this.F;
        const G = this.gram(alpha), Gn = this.gramNum(G);
        const red = lllGram(Gn);
        // an upper bound for the minimum: the reduced basis vectors
        let m = null;
        for (let c = 0; c < this.k; c++) {
            const x = red.U.map((row) => BigInt(row[c]));
            const val = this.value(alpha, this.q(this.split(x)));
            if (m === null || F.sign(F.sub(val, m)) < 0) m = val;
        }
        const cand = shortVectors(Gn, F.toNum(m), { reduced: red });
        const vals = cand.map((x) => this.value(alpha, this.q(this.split(x))));
        for (const v of vals) if (F.sign(F.sub(v, m)) < 0) m = v;
        const out = { m, vecs: [], keys: [], qs: [], qidx: [], keyIndex: new Map(), qIndex: new Map() };
        cand.forEach((x, i) => {
            if (!F.eq(vals[i], m)) return;
            const c = this.canon(this.split(x));
            if (out.keyIndex.has(c.key)) return;
            out.keyIndex.set(c.key, out.vecs.length);
            out.vecs.push(c.v); out.keys.push(c.key);
            const qv = this.q(c.v), qk = qv.map((t) => F.key(t)).join(';');
            let qi = out.qIndex.get(qk);
            if (qi === undefined) { qi = out.qs.length; out.qIndex.set(qk, qi); out.qs.push(qv); }
            out.qidx.push(qi);
        });
        return out;
    }
    /** short vectors with value ≤ bound (exact), as { v, val } */
    vectorsUpTo(alpha, bound) {
        const F = this.F;
        const Gn = this.gramNum(this.gram(alpha));
        const cand = shortVectors(Gn, F.toNum(bound));
        const out = [];
        for (const x of cand) {
            const v = this.split(x), val = this.value(alpha, this.q(v));
            if (F.sign(F.sub(val, bound)) <= 0) out.push({ v, val, x });
        }
        return out;
    }

    /**
     * Voronoi neighbor: P + tD for the largest t > 0 keeping min = m (D·q ≥ 0 on Min P, D·q(w) < 0 for
     * some w). Schürmann, Computational geometry of positive definite quadratic forms, Algorithm 2.
     */
    flip(alpha, m, D) {
        const F = this.F;
        const at = (t) => alpha.map((a, i) => F.add(a, F.mul(t, D[i])));
        let lo = F.zero, hi = F.one;
        const two = F.fromBig(2n);
        for (let guard = 0; ; guard++) {
            if (guard > 400) throw new Error('internal: Voronoi neighbor search did not converge');
            const P = at(hi);
            if (!this.isPD(P)) { hi = F.div(F.add(lo, hi), two); continue; }
            const mv = this.minimalVectors(P);
            if (F.eq(mv.m, m)) {
                // new minimal vectors (with D·q < 0)? then hi is already the answer
                if (mv.vecs.some((v) => F.sign(dot(F, D, this.q(v))) < 0)) return { alpha: P, mv };
                lo = hi; hi = F.mul(hi, two); continue;
            }
            break;
        }
        for (let guard = 0; ; guard++) {
            if (guard > 400) throw new Error('internal: Voronoi neighbor refinement did not converge');
            const P = at(hi);
            const mv = this.minimalVectors(P);
            if (F.sign(F.sub(mv.m, m)) >= 0) return { alpha: P, mv };
            // the first crossing among the vectors now below m
            let t = null;
            for (const v of mv.vecs) {
                const qv = this.q(v), dv = dot(F, D, qv);
                if (F.sign(dv) >= 0) continue;
                const tv = F.div(F.sub(this.value(alpha, qv), m), F.neg(dv));
                if (t === null || F.sign(F.sub(tv, t)) < 0) t = tv;
            }
            if (t === null) throw new Error('internal: Voronoi neighbor');
            hi = t;
        }
    }

    /** a perfect form, from the identity form by Voronoi's perfection steps */
    initialPerfect() {
        const F = this.F;
        let alpha = this.alpha0.slice();
        let mv = this.minimalVectors(alpha);
        for (let step = 0; step < 200; step++) {
            const { rank } = independentSubset(F, mv.qs);
            if (rank === this.N) return { alpha, mv };
            const ker = nullspace(F, mv.qs, this.N);
            let D = ker[0];
            // a direction in which some lattice vector gets shorter
            let found = 0;
            for (let mult = 2n; !found && mult < 1n << 20n; mult *= 2n) {
                for (const { v } of this.vectorsUpTo(alpha, F.mul(mv.m, F.fromBig(mult)))) {
                    const s = F.sign(dot(F, D, this.q(v)));
                    if (s) { found = s; break; }
                }
            }
            if (!found) throw new Error('internal: perfection step found no direction');
            if (found > 0) D = D.map((x) => F.neg(x));
            ({ alpha, mv } = this.flip(alpha, mv.m, D));
        }
        throw new Error('internal: no perfect form reached');
    }
}

// ==================================================================== perfect forms and their cells

/** A perfect form with its cone: minimal vectors, facets, ridges. */
export function makeCell(space, alpha, mv, deadline) {
    const F = space.F;
    // normalize the scale: min = 1 is not available in Z, so keep (alpha, m)
    const facets = coneFacets(F, mv.qs, space.N, { deadline });
    const ridges = coneRidges(facets, space.N);
    const vecsOfQ = mv.qs.map(() => []);
    mv.vecs.forEach((v, i) => vecsOfQ[mv.qidx[i]].push(i));
    const interior = (qset) => space.spans([].concat(...qset.map((qi) => vecsOfQ[qi].map((i) => mv.vecs[i]))));
    return {
        alpha, m: mv.m, mv, facets: facets.map((f) => ({ ...f, interior: interior(f.set) })),
        ridges: ridges.map((r) => ({ ...r, interior: interior(r.set) })),
        vecsOfQ,
    };
}

/** invariants for quick inequivalence: |M|, multiset of |N det| over pairs (d = 2) or |N v| (d = 1) */
export function cellInvariant(space, cell) {
    const K = space.nf, vs = cell.mv.vecs;
    const norms = [];
    if (space.d === 1) for (const v of vs) norms.push(babs(K.norm(v[0])));
    else for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) norms.push(babs(K.norm(space.detOf([vs[a], vs[b]]))));
    norms.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return `${vs.length}|${cell.mv.qs.length}|${cell.facets.length}|${norms.join(',')}`;
}

/**
 * All g ∈ GL_d(O) with g·M = M' (vectors mod μ), where M = cell's minimal vectors, M' = target's.
 * With firstOnly, stop at the first. Returned elements are normalized so g·v₀ = w (canonical reps); the
 * full set is these times the roots of unity.
 */
export function equivalences(space, cell, target, { firstOnly = false } = {}) {
    const K = space.nf, d = space.d;
    const M = cell.mv.vecs, Mt = target.mv.vecs;
    if (M.length !== Mt.length) return [];
    const tKeys = target.mv.keyIndex;
    const nd = (vs) => babs(K.norm(space.detOf(vs)));
    // a basis of K^d from M with the rarest |N det|
    let basis = null;
    if (d === 1) {
        const counts = new Map();
        for (const v of M) { const k = `${babs(K.norm(v[0]))}`; counts.set(k, (counts.get(k) || 0) + 1); }
        let best = null;
        M.forEach((v, i) => { const k = `${babs(K.norm(v[0]))}`; if (!best || counts.get(k) < best.c) best = { i, c: counts.get(k), k }; });
        basis = { idx: [best.i], nd: best.k };
    } else {
        const counts = new Map(), pairs = [];
        for (let a = 0; a < M.length; a++) for (let b = a + 1; b < M.length; b++) {
            const x = nd([M[a], M[b]]);
            if (x === 0n) continue;
            const k = `${x}`;
            counts.set(k, (counts.get(k) || 0) + 1);
            pairs.push({ a, b, k });
        }
        let best = null;
        for (const p of pairs) if (!best || counts.get(p.k) < best.c) best = { ...p, c: counts.get(p.k) };
        basis = { idx: [best.a, best.b], nd: best.k };
    }
    const V = basis.idx.map((i) => M[i]);
    // values of P at v₀ ± v₁ (invariants of the pair under g, with g·P = P')
    const F = space.F;
    const valP = (alpha, v) => space.value(alpha, space.q(v));
    const pairVals = d === 2 ? [valP(cell.alpha, [K.add(V[0][0], V[1][0]), K.add(V[0][1], V[1][1])]), valP(cell.alpha, [K.sub(V[0][0], V[1][0]), K.sub(V[0][1], V[1][1])])] : null;
    // the target's minimum may be a different positive multiple of the source's: compare ratios
    const ratio = F.div(target.m, cell.m);
    // inverse of the basis matrix (columns v₀, v₁): adj / det
    const det = space.detOf(V);
    const detInv = K.inv(det);
    const cand = [];
    const out = [];
    const tryG = (W) => {
        // g = W · V⁻¹, W = [w₀ w₁] (columns)
        let g;
        if (d === 1) {
            const q = K.kmul({ v: W[0][0], d: 1n }, detInv);
            if (q.d !== 1n) return false;
            g = [[q.v]];
        } else {
            // V = [[v0₀, v1₀], [v0₁, v1₁]] (columns are vectors); adj(V) = [[v1₁, −v1₀], [−v0₁, v0₀]]
            const adj = [[V[1][1], K.neg(V[1][0])], [K.neg(V[0][1]), V[0][0]]];
            const Wm = [[W[0][0], W[1][0]], [W[0][1], W[1][1]]];
            const prod = space.matMul(Wm, adj);
            g = [];
            for (let i = 0; i < 2; i++) {
                const row = [];
                for (let j = 0; j < 2; j++) { const q = K.kmul({ v: prod[i][j], d: 1n }, detInv); if (q.d !== 1n) return false; row.push(q.v); }
                g.push(row);
            }
        }
        if (!K.isUnit(space.det(g))) return false;
        for (const v of M) if (!tKeys.has(space.canon(space.act(g, v)).key)) return false;
        out.push(g);
        return true;
    };
    if (d === 1) {
        for (const w of Mt) {
            if (`${babs(K.norm(w[0]))}` !== basis.nd) continue;
            if (tryG([w]) && firstOnly) return out;
        }
        return out;
    }
    for (let a = 0; a < Mt.length; a++) for (let b = 0; b < Mt.length; b++) {
        if (a === b) continue;
        if (`${nd([Mt[a], Mt[b]])}` !== basis.nd) continue;
        cand.push([a, b]);
    }
    for (const [a, b] of cand) {
        for (const z of K.mu) {
            const w0 = Mt[a], w1 = [K.mul(z, Mt[b][0]), K.mul(z, Mt[b][1])];
            // P'(w₀ ± w₁) = ratio·P(v₀ ± v₁)
            const s = [K.add(w0[0], w1[0]), K.add(w0[1], w1[1])], t = [K.sub(w0[0], w1[0]), K.sub(w0[1], w1[1])];
            if (!F.eq(valP(target.alpha, s), F.mul(ratio, pairVals[0])) || !F.eq(valP(target.alpha, t), F.mul(ratio, pairVals[1]))) continue;
            if (tryG([w0, w1]) && firstOnly) return out;
        }
    }
    return out;
}
