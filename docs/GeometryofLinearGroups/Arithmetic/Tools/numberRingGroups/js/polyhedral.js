// Exact linear algebra and polyhedral cones over an ordered field F (see scalar.js).

export const dot = (F, a, b) => { let s = F.zero; for (let i = 0; i < a.length; i++) if (!F.isZero(a[i]) && !F.isZero(b[i])) s = F.add(s, F.mul(a[i], b[i])); return s; };

/** Row echelon data of a list of vectors: { rank, pivots (indices of a maximal independent subset) } */
export function independentSubset(F, vecs) {
    const basis = [];                                    // reduced rows with pivot columns
    const pick = [];
    vecs.forEach((v0, idx) => {
        let v = v0.slice();
        for (const { row, col } of basis) {
            if (F.isZero(v[col])) continue;
            const f = F.div(v[col], row[col]);
            v = v.map((x, j) => (F.isZero(row[j]) ? x : F.sub(x, F.mul(f, row[j]))));
        }
        const col = v.findIndex((x) => !F.isZero(x));
        if (col >= 0) { basis.push({ row: v, col }); pick.push(idx); }
    });
    return { rank: pick.length, pivots: pick };
}
export const rankOf = (F, vecs) => independentSubset(F, vecs).rank;

/** A basis of { y : v·y = 0 for every v in rows }, vectors of length N. */
export function nullspace(F, rows, N) {
    const R = rows.map((r) => r.slice());
    const pivCols = [];
    let r = 0;
    for (let c = 0; c < N && r < R.length; c++) {
        let p = r; while (p < R.length && F.isZero(R[p][c])) p++;
        if (p === R.length) continue;
        [R[r], R[p]] = [R[p], R[r]];
        const inv = F.div(F.one, R[r][c]);
        R[r] = R[r].map((x) => F.mul(x, inv));
        for (let i = 0; i < R.length; i++) {
            if (i === r || F.isZero(R[i][c])) continue;
            const f = R[i][c];
            R[i] = R[i].map((x, j) => F.sub(x, F.mul(f, R[r][j])));
        }
        pivCols.push(c); r++;
    }
    const free = [];
    for (let c = 0; c < N; c++) if (!pivCols.includes(c)) free.push(c);
    return free.map((fc) => {
        const y = new Array(N).fill(F.zero);
        y[fc] = F.one;
        pivCols.forEach((pc, i) => { y[pc] = F.neg(R[i][fc]); });
        return y;
    });
}

/** Solve A x = b (A square, invertible) */
export function solve(F, A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
        let p = c; while (p < n && F.isZero(M[p][c])) p++;
        if (p === n) throw new Error('internal: singular system');
        [M[c], M[p]] = [M[p], M[c]];
        const inv = F.div(F.one, M[c][c]);
        M[c] = M[c].map((x) => F.mul(x, inv));
        for (let i = 0; i < n; i++) {
            if (i === c || F.isZero(M[i][c])) continue;
            const f = M[i][c];
            M[i] = M[i].map((x, j) => F.sub(x, F.mul(f, M[c][j])));
        }
    }
    return M.map((row) => row[n]);
}

/** Exact positive definiteness of a symmetric matrix over F (symmetric Gaussian elimination). */
export function isPositiveDefinite(F, G) {
    const n = G.length;
    const A = G.map((r) => r.slice());
    for (let i = 0; i < n; i++) {
        if (F.sign(A[i][i]) <= 0) return false;
        const inv = F.div(F.one, A[i][i]);
        for (let r = i + 1; r < n; r++) {
            if (F.isZero(A[r][i])) continue;
            const f = F.mul(A[r][i], inv);
            for (let c = i + 1; c < n; c++) if (!F.isZero(A[i][c])) A[r][c] = F.sub(A[r][c], F.mul(f, A[i][c]));
        }
    }
    return true;
}

// ------------------------------------------------------------------ bitsets over generator indices
const bsNew = (m) => new Uint32Array((m + 31) >>> 5);
const bsSet = (b, i) => { b[i >>> 5] |= 1 << (i & 31); };
const bsHas = (b, i) => (b[i >>> 5] >>> (i & 31)) & 1;
const bsAnd = (a, b) => { const c = new Uint32Array(a.length); for (let i = 0; i < a.length; i++) c[i] = a[i] & b[i]; return c; };
const bsSub = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] & ~b[i]) return false; return true; };   // a ⊆ b
const popcnt32 = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
const bsCount = (a) => { let s = 0; for (const x of a) s += popcnt32(x); return s; };
const bsList = (a, m) => { const out = []; for (let i = 0; i < m; i++) if (bsHas(a, i)) out.push(i); return out; };

/**
 * Facets of the cone spanned by gens (vectors in F^N, the cone full-dimensional and pointed),
 * by the double description method. Returns [{ normal (F^N, normal·g ≥ 0 on the cone),
 * set (sorted indices of the generators on the facet) }].
 */
export function coneFacets(F, gens, N, { deadline = Infinity } = {}) {
    const m = gens.length;
    const { rank, pivots } = independentSubset(F, gens);
    if (rank < N) throw new Error('internal: the cone is not full-dimensional');
    // initial simplicial cone: rays y_j with g_i·y_j = δ_ij for i in the basis
    const Bm = pivots.map((i) => gens[i]);
    let rays = [];
    for (let j = 0; j < N; j++) {
        const e = new Array(N).fill(F.zero); e[j] = F.one;
        const y = solve(F, Bm, e);
        const z = bsNew(m);
        pivots.forEach((pi, t) => { if (t !== j) bsSet(z, pi); });
        rays.push({ y: F.normalizeVec(y), z });
    }
    const inBasis = new Set(pivots);
    const order = [];
    for (let i = 0; i < m; i++) if (!inBasis.has(i)) order.push(i);
    for (const gi of order) {
        if (Date.now() > deadline) throw new Error('timeout: facet enumeration');
        const g = gens[gi];
        const plus = [], zero = [], minus = [];
        const vals = rays.map((r) => dot(F, g, r.y));
        rays.forEach((r, k) => { const s = F.sign(vals[k]); (s > 0 ? plus : s < 0 ? minus : zero).push(k); });
        if (!minus.length) { for (const k of zero) bsSet(rays[k].z, gi); continue; }
        const fresh = [];
        for (const a of plus) for (const b of minus) {
            const ra = rays[a], rb = rays[b];
            const common = bsAnd(ra.z, rb.z);
            if (bsCount(common) < N - 2) continue;
            // combinatorial adjacency: no third ray's zero set contains the common zero set
            let adj = true;
            for (let k = 0; k < rays.length && adj; k++) if (k !== a && k !== b && bsSub(common, rays[k].z)) adj = false;
            if (!adj) continue;
            const va = vals[a], vb = vals[b];                 // va > 0 > vb
            const y = ra.y.map((x, t) => F.sub(F.mul(va, rb.y[t]), F.mul(vb, x)));
            const z = common; bsSet(z, gi);
            fresh.push({ y: F.normalizeVec(y), z });
        }
        for (const k of zero) bsSet(rays[k].z, gi);
        rays = plus.map((k) => rays[k]).concat(zero.map((k) => rays[k]), fresh);
    }
    return rays.map((r) => ({ normal: r.y, set: bsList(r.z, m) }));
}

/** Ridges (codimension-2 faces) from the facet incidence sets: pairs whose intersection lies in no third facet. */
export function coneRidges(facets, N) {
    const sets = facets.map((f) => new Set(f.set));
    const out = [];
    for (let a = 0; a < facets.length; a++) for (let b = a + 1; b < facets.length; b++) {
        const I = facets[a].set.filter((i) => sets[b].has(i));
        if (I.length < N - 2) continue;
        let ok = true;
        for (let c = 0; c < facets.length && ok; c++) if (c !== a && c !== b && I.every((i) => sets[c].has(i))) ok = false;
        if (ok) out.push({ set: I, facets: [a, b] });
    }
    return out;
}
