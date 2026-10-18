/**
 * descent.js — conjugating Γ ⊂ PGL₂(F) into PGL₂(ℚ) when its trace field is ℚ and its quaternion
 * algebra splits, so that the steps over ℚ (coset enumeration in PGL₂(ℤ[1/S]), the vertex orbits,
 * the exact checks) apply.
 *
 * Skolem–Noether, constructively. With h_j = g_j² / det g_j ∈ SL₂(F), the ℚ-algebra
 * A₀ = ℚ⟨1, h₁, h₂, h₁h₂⟩ ⊂ M₂(F) is the invariant quaternion algebra (its traces are rational).
 * When A₀ ≅ M₂(ℚ) it has zero divisors: rational x with Nrd(Σ xᵢBᵢ) = det(Σ xᵢBᵢ) = 0, an
 * isotropic vector of a quaternary quadratic form over ℚ, found by search. For such z ≠ 0 and v a
 * nonzero column of z, W = A₀·v is a ℚ-form of F² (a simple A₀-module, of ℚ-dimension 2): with a
 * ℚ-basis w₁ = v, w₂ = Bₖv of W and c = [w₁ w₂], c⁻¹A₀c = M₂(ℚ). Γ normalizes A₀, so c⁻¹Γc lies in
 * F^×·GL₂(ℚ), that is in PGL₂(ℚ). Every step is exact; the result is checked.
 */
import { field, parsePoly } from './cusps.js';

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const lcm = (a, b) => (a / bgcd(a, b)) * b;

/**
 * Γ = ⟨gens⟩ (rows of ringEngine text in w, poly of w low → high) conjugated into PGL₂(ℚ):
 * { mats: rows of integer strings, x: the isotropic vector } or { error }.
 */
export function descendToQ(gens, poly, { box = 12 } = {}) {
    const K = field(poly.map(BigInt)), d = K.d;
    // matrices over F as integer vectors over a common denominator: { e: [4 vectors], D }
    const Mx = (e, D = 1n) => ({ e, D });
    const mmul = (A, B) => Mx([K.add(K.mul(A.e[0], B.e[0]), K.mul(A.e[1], B.e[2])), K.add(K.mul(A.e[0], B.e[1]), K.mul(A.e[1], B.e[3])), K.add(K.mul(A.e[2], B.e[0]), K.mul(A.e[3], B.e[2])), K.add(K.mul(A.e[2], B.e[1]), K.mul(A.e[3], B.e[3]))], A.D * B.D);
    const mdet = (A) => ({ v: K.sub(K.mul(A.e[0], A.e[3]), K.mul(A.e[1], A.e[2])), D: A.D * A.D });
    const add = (A, B) => Mx(A.e.map((x, i) => K.add(K.scale(x, B.D), K.scale(B.e[i], A.D))), A.D * B.D);
    const scaleM = (A, k) => Mx(A.e.map((x) => K.scale(x, k)), A.D);
    const isRational = (v) => v.slice(1).every((x) => x === 0n);
    // the generators, integral
    const G = [];
    for (const row of gens) {
        const q = row.map((s) => parsePoly(s, d));
        if (q.some((x) => !x)) return { error: 'an entry could not be read' };
        const L = q.reduce((l, e) => lcm(l, e.den), 1n);
        G.push(Mx(q.map((e) => e.num.map((x) => x * (L / e.den)))));
    }
    // h = g² / det g, exactly: entries divided by det g in F
    const half = (g) => {
        const g2 = mmul(g, g), dt = mdet(g).v;
        const qs = g2.e.map((x) => K.divide(x, dt));
        const L = qs.reduce((l, q) => lcm(l, q.den), 1n);
        return Mx(qs.map((q) => q.num.map((x) => x * (L / q.den))), L);
    };
    if (G.length < 2) return { error: 'needs two generators' };
    // two elements x, y of Γ⁽²⁾ (squares, normalized to det 1) with 1, x, y, xy independent over ℚ
    const adjM = (A) => Mx([A.e[3], K.scale(A.e[1], -1n), K.scale(A.e[2], -1n), A.e[0]], A.D);
    const pool = [];
    for (let i = 0; i < G.length; i++) {
        pool.push(G[i]);
        for (let j = 0; j < G.length; j++) if (j !== i) { pool.push(mmul(G[i], G[j])); pool.push(mmul(G[i], adjM(G[j]))); }
    }
    const halves = pool.map(half);
    const one = Mx([K.one, K.zero, K.zero, K.one]);
    const flat = (A) => A.e.flat();                        // over the common denominator A.D (rank only)
    const rank = (rows) => {
        const M = rows.map((r) => r.slice());
        let rk = 0;
        for (let c = 0; c < (M[0] || []).length && rk < M.length; c++) {
            let p = rk; while (p < M.length && M[p][c] === 0n) p++;
            if (p === M.length) continue;
            [M[rk], M[p]] = [M[p], M[rk]];
            for (let i = rk + 1; i < M.length; i++) if (M[i][c] !== 0n) { const a = M[rk][c], b = M[i][c]; M[i] = M[i].map((x, k) => x * a - M[rk][k] * b); }
            rk++;
        }
        return rk;
    };
    let B = null;
    for (let i = 0; i < halves.length && !B; i++) for (let j = i + 1; j < halves.length && !B; j++) {
        const cand = [one, halves[i], halves[j], mmul(halves[i], halves[j])];
        if (rank(cand.map(flat)) === 4) B = cand;
    }
    if (!B) return { error: 'Γ⁽²⁾ spans no quaternion algebra here (reducible or elementary)' };
    // the reduced norm: Nrd(Σ xᵢBᵢ) = Σ qᵢⱼ xᵢxⱼ, with rational qᵢⱼ
    const ratDet = (A) => { const { v, D } = mdet(A); if (!isRational(v)) return null; const g = bgcd(v[0], D) || 1n; return [v[0] / g, D / g]; };
    const q = [];
    for (let i = 0; i < 4; i++) { q.push([]); for (let j = 0; j < 4; j++) q[i].push(null); }
    for (let i = 0; i < 4; i++) {
        const di = ratDet(B[i]);
        if (!di) return { error: 'the traces are not rational' };
        q[i][i] = di;
    }
    const fr = (n, m) => { const g = bgcd(n, m) || 1n; return m < 0n ? [-n / g, -m / g] : [n / g, m / g]; };
    const fsub = (a, b) => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const s = ratDet(add(B[i], B[j]));
        if (!s) return { error: 'the traces are not rational' };
        q[i][j] = fsub(fsub(s, q[i][i]), q[j][j]);        // the coefficient of xᵢxⱼ
    }
    // integer coefficients
    let L = 1n;
    for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) L = lcm(L, q[i][j][1]);
    const Q = [];
    for (let i = 0; i < 4; i++) { Q.push([]); for (let j = 0; j < 4; j++) Q[i].push(j >= i ? Number(q[i][j][0] * (L / q[i][j][1])) : 0); }
    if (Q.flat().some((c) => !Number.isSafeInteger(c) || Math.abs(c) > 2 ** 30)) return { error: 'the reduced norm has large coefficients' };
    // an isotropic vector, smallest box first
    let x = null;
    search: for (let N = 1; N <= box; N++) {
        for (let a = -N; a <= N; a++) for (let b = -N; b <= N; b++) for (let c = -N; c <= N; c++) for (let e = -N; e <= N; e++) {
            if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(e)) !== N) continue;
            const v = [a, b, c, e];
            let s = 0;
            for (let i = 0; i < 4; i++) for (let j = i; j < 4; j++) s += Q[i][j] * v[i] * v[j];
            if (s === 0) { x = v; break search; }
        }
    }
    if (!x) return { error: `no zero divisor with coordinates ≤ ${box} (the algebra may be a division algebra)` };
    let z = Mx([K.zero, K.zero, K.zero, K.zero], 1n);
    x.forEach((xi, i) => { if (xi) z = add(z, scaleM(B[i], BigInt(xi))); });
    if (!K.isZero(mdet(z).v)) return { error: 'internal: not a zero divisor' };
    // v: a nonzero column of z; w₂ = Bₖ v independent of v over F
    const col = !K.isZero(z.e[0]) || !K.isZero(z.e[2]) ? [z.e[0], z.e[2]] : [z.e[1], z.e[3]];
    if (K.isZero(col[0]) && K.isZero(col[1])) return { error: 'internal: z = 0' };
    let c = null;
    for (const Bk of B.slice(1)) {
        const w2 = [K.add(K.mul(Bk.e[0], col[0]), K.mul(Bk.e[1], col[1])), K.add(K.mul(Bk.e[2], col[0]), K.mul(Bk.e[3], col[1]))];
        const C = Mx([col[0], w2[0], col[1], w2[1]]);
        if (!K.isZero(mdet(C).v)) { c = C; break; }
    }
    if (!c) return { error: 'internal: A₀·v is a line' };
    const cinv = Mx([c.e[3], K.scale(c.e[1], -1n), K.scale(c.e[2], -1n), c.e[0]]);
    // c⁻¹ g c, projectively: divide by the first nonzero entry, and check that it is rational
    const mats = [];
    for (const g of G) {
        const C = mmul(mmul(cinv, g), c);
        const f = C.e.find((y) => !K.isZero(y));
        const qs = C.e.map((y) => K.divide(y, f));
        if (qs.some((r) => !isRational(r.num))) return { error: 'internal: a conjugated generator is not rational' };
        const D = qs.reduce((l, r) => lcm(l, r.den), 1n);
        let ints = qs.map((r) => r.num[0] * (D / r.den));
        const g0 = ints.reduce((s, y) => bgcd(s, y), 0n);
        ints = ints.map((y) => y / g0);
        mats.push(ints.map(String));
    }
    return { mats, x, conj: c.e.map((v) => v.map(String)) };
}

/**
 * When A₀ is a division algebra over ℚ that splits at ∞ (indefinite), there is no conjugation into
 * PGL₂(ℚ), but there is an embedding into PGL₂(L) for a real quadratic field L = ℚ(√a) ⊂ A₀:
 * take x ∈ A₀ with x² = a > 0 (not a square), and y = z − x z x⁻¹ (anticommuting with x, so
 * y² = b ∈ ℚ); then x ↦ diag(√a, −√a), y ↦ (0 b; 1 0) is an isomorphism A₀ ⊗ L ≅ M₂(L). Γ lies in
 * F^×·A₀^× (Skolem–Noether: that is the normalizer of A₀), so each generator is λ·Σ cᵢeᵢ with
 * c ∈ ℚ⁴ in the basis e = (1, x, y, xy), and maps to Σ cᵢρ(eᵢ) ∈ PGL₂(L). Over L the place at ∞
 * where A₀ splits is real, as the covering certificate and Poincaré at the real place need.
 * Returns { mats (rows over ℚ(w), w² = d), d, poly: [−d, 0, 1] } or { error }.
 */
export function descendToReal(gens, poly, { box = 6 } = {}) {
    const K = field(poly.map(BigInt)), d = K.d;
    // F-elements as { v: integer vector, D }; matrices as 4 such
    const fe = (v, D = 1n) => ({ v, D });
    const fmul = (a, b) => fe(K.mul(a.v, b.v), a.D * b.D);
    const fadd = (a, b) => fe(K.add(K.scale(a.v, b.D), K.scale(b.v, a.D)), a.D * b.D);
    const fneg = (a) => fe(K.scale(a.v, -1n), a.D);
    const fzero = (a) => K.isZero(a.v);
    const fdiv = (a, b) => { const q = K.divide(K.scale(a.v, b.D), K.scale(b.v, a.D)); return fe(q.num, q.den); };
    const mm = (A, B) => [fadd(fmul(A[0], B[0]), fmul(A[1], B[2])), fadd(fmul(A[0], B[1]), fmul(A[1], B[3])), fadd(fmul(A[2], B[0]), fmul(A[3], B[2])), fadd(fmul(A[2], B[1]), fmul(A[3], B[3]))];
    const madd = (A, B) => A.map((x, i) => fadd(x, B[i]));
    const mscale = (A, c) => A.map((x) => fmul(x, c));
    const tr = (A) => fadd(A[0], A[3]);
    const det = (A) => fadd(fmul(A[0], A[3]), fneg(fmul(A[1], A[2])));
    const rat = (a) => { if (!a.v.slice(1).every((x) => x === 0n)) return null; const g = bgcd(a.v[0], a.D) || 1n; const n = a.v[0] / g, m = a.D / g; return m < 0n ? [-n, -m] : [n, m]; };
    const fromQ = (n, m = 1n) => fe([n].concat(Array(d - 1).fill(0n)), m);
    const ONE = [fromQ(1n), fromQ(0n), fromQ(0n), fromQ(1n)];
    // the generators, and a basis of A₀ from squares of elements (as in descendToQ)
    const G = [];
    for (const row of gens) {
        const q = row.map((s) => parsePoly(s, d));
        if (q.some((x) => !x)) return { error: 'an entry could not be read' };
        G.push(q.map((e) => fe(e.num, e.den)));
    }
    const adj = (A) => [A[3], fneg(A[1]), fneg(A[2]), A[0]];
    const half = (g) => { const g2 = mm(g, g), dt = det(g); return g2.map((x) => fdiv(x, dt)); };
    const pool = [];
    for (let i = 0; i < G.length; i++) { pool.push(G[i]); for (let j = 0; j < G.length; j++) if (j !== i) { pool.push(mm(G[i], G[j])); pool.push(mm(G[i], adj(G[j]))); } }
    const H = pool.map(half);
    // ℚ-independence of 1, h, h′, hh′: rank of the coefficient vectors over a common denominator
    const flatQ = (A) => { const L = A.reduce((l, x) => lcm(l, x.D), 1n); return A.flatMap((x) => K.scale(x.v, L / x.D)); };
    const rank = (rows) => { const M = rows.map((r) => r.slice()); let rk = 0; for (let c = 0; c < (M[0] || []).length && rk < M.length; c++) { let p = rk; while (p < M.length && M[p][c] === 0n) p++; if (p === M.length) continue; [M[rk], M[p]] = [M[p], M[rk]]; for (let i = rk + 1; i < M.length; i++) if (M[i][c] !== 0n) { const a = M[rk][c], b = M[i][c]; M[i] = M[i].map((x, k) => x * a - M[rk][k] * b); } rk++; } return rk; };
    let B = null;
    for (let i = 0; i < H.length && !B; i++) for (let j = i + 1; j < H.length && !B; j++) {
        const cand = [ONE, H[i], H[j], mm(H[i], H[j])];
        if (rank(cand.map(flatQ)) === 4) B = cand;
    }
    if (!B) return { error: 'no quaternion basis' };
    // x: a pure element (trace 0) with x² = a > 0 not a square
    const pure = (A) => { const t = rat(tr(A)); return madd(A, mscale(ONE, fneg(fromQ(t[0], 2n * t[1])))); };
    const isSq = (n, m) => { const r = (z) => { if (z < 0n) return null; let s = BigInt(Math.floor(Math.sqrt(Number(z)))); while (s * s > z) s--; while ((s + 1n) * (s + 1n) <= z) s++; return s * s === z; }; return r(n * m); };
    let X = null, a = null;
    search: for (let N = 1; N <= box; N++) for (let c1 = -N; c1 <= N; c1++) for (let c2 = -N; c2 <= N; c2++) for (let c3 = -N; c3 <= N; c3++) {
        if (Math.max(Math.abs(c1), Math.abs(c2), Math.abs(c3)) !== N) continue;
        let Z = mscale(B[1], fromQ(BigInt(c1)));
        Z = madd(Z, mscale(B[2], fromQ(BigInt(c2))));
        Z = madd(Z, mscale(B[3], fromQ(BigInt(c3))));
        const Xc = pure(Z), sq = rat(det(Xc));                     // x² = −det x for trace 0
        if (!sq || sq[0] === 0n) continue;
        const av = [-sq[0], sq[1]];
        if (av[0] <= 0n || isSq(av[0], av[1])) continue;
        X = Xc; a = av; break search;
    }
    if (!X) return { error: 'no real quadratic subfield found' };
    // y = z − x z x⁻¹ for a basis element z not commuting with x; b = y² = −det y
    const xinv = (() => { const dt = det(X); return adj(X).map((e) => fdiv(e, dt)); })();
    let Y = null;
    for (const Z of B.slice(1)) {
        const Yc = madd(Z, mscale(mm(mm(X, Z), xinv), fromQ(-1n)));
        if (Yc.some((e) => !fzero(e))) { Y = Yc; break; }
    }
    if (!Y) return { error: 'internal: x is central' };
    const bq = rat(det(Y));
    if (!bq) return { error: 'internal: y² is not rational' };
    const b = [-bq[0], bq[1]];
    const XY = mm(X, Y);
    const E = [ONE, X, Y, XY];
    // coordinates of a matrix g ∈ M₂(F) in the F-basis E: solve the 4×4 system over F
    const coords = (g) => {
        const M = [0, 1, 2, 3].map((r) => E.map((e) => e[r]).concat([g[r]]));
        for (let c = 0; c < 4; c++) {
            let p = c; while (p < 4 && fzero(M[p][c])) p++;
            if (p === 4) return null;
            [M[c], M[p]] = [M[p], M[c]];
            for (let r = 0; r < 4; r++) {
                if (r === c || fzero(M[r][c])) continue;
                const f = fdiv(M[r][c], M[c][c]);
                M[r] = M[r].map((v, k) => fadd(v, fneg(fmul(f, M[c][k]))));
            }
        }
        return M.map((row, r) => fdiv(row[4], row[r]));
    };
    // L = ℚ(√a) = ℚ(w), w² = d squarefree, √a = s·w
    let an = a[0] * a[1], s = 1n;                    // a = an / a[1]², √a = √an / a[1]
    for (let p = 2n; p * p <= an; p++) while (an % (p * p) === 0n) { an /= p * p; s *= p; }
    const dsq = an;                                  // √a = (s / a[1]) · w, w² = dsq
    const sa = [s, a[1]];                            // √a = sa[0]/sa[1] · w
    // ρ(c₀ + c₁x + c₂y + c₃xy) = (c₀ + c₁√a, b(c₂ + c₃√a); c₂ − c₃√a, c₀ − c₁√a), entries p + q·w
    const mats = [];
    for (const g of G) {
        const mu = coords(g);
        if (!mu) return { error: 'internal: not in the span' };
        const j = mu.findIndex((m) => !fzero(m));
        const c = mu.map((m) => rat(fdiv(m, mu[j])));
        if (c.some((x) => !x)) return { error: 'internal: a generator is not in F^×·A₀' };
        // common denominator of everything
        const terms = [];
        const q = (x) => x;                           // [n, m] rationals
        const mulQ = (u, v) => [u[0] * v[0], u[1] * v[1]];
        const addQ = (u, v) => [u[0] * v[1] + v[0] * u[1], u[1] * v[1]];
        const negQ = (u) => [-u[0], u[1]];
        const ent = [
            [c[0], mulQ(c[1], sa)],                          // c₀ + c₁√a
            [mulQ(b, c[2]), mulQ(mulQ(b, c[3]), sa)],        // b c₂ + b c₃ √a
            [c[2], negQ(mulQ(c[3], sa))],                    // c₂ − c₃√a
            [c[0], negQ(mulQ(c[1], sa))],                    // c₀ − c₁√a
        ];
        void terms; void q; void addQ;
        const L = ent.flat().reduce((l, [, m]) => lcm(l, m < 0n ? -m : m), 1n);
        let ints = ent.map(([p0, p1]) => [p0[0] * (L / p0[1]), p1[0] * (L / p1[1])]);
        const g0 = ints.flat().reduce((u, v) => bgcd(u, v), 0n);
        ints = ints.map(([u, v]) => [u / g0, v / g0]);
        mats.push(ints.map(([u, v]) => (v === 0n ? `${u}` : `${u}${v < 0n ? '-' : '+'}${(v < 0n ? -v : v) === 1n ? '' : (v < 0n ? -v : v)}w`)));
    }
    return { mats, d: dsq, poly: [-dsq, 0n, 1n], a, b };
}
