// gps.js — the whole computation, from (f, v, N) to arithmetic pieces.
//
//  1. Lattice. Γ = O′(Λ) for Λ = ℤ^{n+1} when the reflection in v is
//     integral (v is a root); otherwise Λ = L_v ⊕ ℤv with L_v = v^⊥ ∩ ℤ^{n+1},
//     a sublattice of finite index D in which v is a root. Either way H_v is
//     a mirror of the reflection group W ⊴ Γ.
//  2. Vinberg's algorithm, based at a point p₀ ∈ H_v, gives the Coxeter
//     polytope P with H_v as one of its walls.
//  3. K = Γ(N), N ≥ 3: torsion-free and normal in Γ ∋ r_v, so (Millson) the
//     image of H_v in M′ = ℍⁿ/K is an embedded, two-sided hypersurface Σ₀.
//  4. Cutting M′ along Σ₀ gives a one-edge graph of groups — an amalgam
//     A ∗_{π₁Σ₀} B or an HNN extension A ∗_{π₁Σ₀}. The vertex groups are the
//     arithmetic pieces.

import { bil, signature, kernelOfRow, lll, primitive, transpose, matMul, detB, adjugateB,
         matMulB, big, identity } from './linalg.js';
import { vinberg, isRoot } from './vinberg.js';
import { buildPolytope, symmetries } from './polytope.js';
import { splitCover, boundaryGenerators, pieceHomology } from './cover.js';
import { describeForm } from './forms.js';

// ---------------- input ----------------

/** Parse "−1, 1, 1, 1" (diagonal) or rows "a b c; d e f; …" (Gram) into an integer matrix. */
export function parseForm(text) {
    const clean = String(text).replace(/[−–]/g, '-').replace(/[⟨⟩<>\[\]()]/g, ' ').trim();
    if (!clean) throw new Error('enter a quadratic form');
    const rows = clean.split(/[;\n]+/).map(r => r.trim()).filter(Boolean)
        .map(r => r.split(/[\s,]+/).filter(Boolean).map(Number));
    if (rows.some(r => r.some(x => !Number.isInteger(x)))) throw new Error('entries must be integers');
    if (rows.length === 1) {
        const d = rows[0];
        return d.map((x, i) => d.map((_, j) => (i === j ? x : 0)));
    }
    const m = rows.length;
    if (rows.some(r => r.length !== m)) throw new Error('the Gram matrix must be square');
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (rows[i][j] !== rows[j][i]) throw new Error('the Gram matrix must be symmetric');
    return rows;
}

export function parseVector(text, m) {
    const clean = String(text).replace(/[−–]/g, '-').replace(/[()\[\]]/g, ' ').trim();
    const v = clean.split(/[\s,]+/).filter(Boolean).map(Number);
    if (v.length !== m || v.some(x => !Number.isInteger(x))) throw new Error(`v must have ${m} integer coordinates`);
    if (v.every(x => x === 0)) throw new Error('v must be nonzero');
    return v;
}

// ---------------- lattice set-up ----------------

export function setupLattice(A, v0, mode = 'auto') {
    const m = A.length, n = m - 1;
    if (m < 3) throw new Error('need dimension n ≥ 2 (a form in at least 3 variables)');
    const sig = signature(A);
    if (sig.zero || sig.neg !== 1) throw new Error(`the form must have signature (${n}, 1); it has (${sig.pos}, ${sig.neg})${sig.zero ? ` and is degenerate` : ''}`);
    const v = primitive(v0);
    const fv = bil(A, v, v);
    if (fv <= 0) throw new Error(`v must be spacelike: f(v) = ${fv}`);
    const row = A.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
    let Lb = lll(kernelOfRow(row));
    Lb = niceBasis(A, Lb);
    const gH = Lb.map(a => Lb.map(b => bil(A, a, b)));
    const rootGiven = isRoot(A, v);
    const useGiven = mode === 'given' || (mode === 'auto' && rootGiven);
    if (useGiven && !rootGiven) throw new Error('v is not a root of ℤ^{n+1}: its reflection is not integral — use the split lattice');
    const M = useGiven ? identity(m) : transpose([...Lb, v]);       // columns = lattice basis
    const AL = matMul(matMul(transpose(M), A), M);
    const vL = useGiven ? v.slice() : Array.from({ length: m }, (_, i) => (i === m - 1 ? 1 : 0));
    const D = Math.abs(Number(detB(M)));
    // the hyperplane lattice in lattice coordinates
    const HL = useGiven ? Lb.map(b => b.slice()) : Lb.map((_, i) => Array.from({ length: m }, (_, j) => (j === i ? 1 : 0)));
    // basepoint: a short timelike vector on H_v
    let p0 = null, best = Infinity, bestH = Infinity;
    const R = n <= 3 ? 3 : 2;
    const c = new Array(n).fill(-R);
    for (;;) {
        const x = HL.reduce((acc, b, i) => acc.map((t, j) => t + c[i] * b[j]), new Array(m).fill(0));
        const fx = bil(AL, x, x);
        if (fx < 0) {
            const h = Math.max(...x.map(Math.abs));
            if (-fx < best || (-fx === best && h < bestH)) { p0 = primitive(x); best = -fx; bestH = h; }
        }
        let i = 0;
        while (i < n && c[i] === R) { c[i] = -R; i++; }
        if (i === n) break;
        c[i]++;
    }
    if (!p0) throw new Error('no short timelike vector on H_v was found');
    if (bil(AL, p0, p0) >= 0) throw new Error('internal: basepoint is not timelike');
    // future = the sheet containing p₀
    return { A, m, n, v, fv, Lb, gH, rootGiven, mode: useGiven ? 'given' : 'split', M, AL, vL, D, HL, p0 };
}

/** Reorder a basis of L_v so the timelike-ish vector comes first and coordinates look natural. */
function niceBasis(A, B) {
    const b = B.map(x => x.map(t => t));
    // sign: first nonzero coordinate positive
    for (const x of b) { const i = x.findIndex(t => t !== 0); if (i >= 0 && x[i] < 0) for (let j = 0; j < x.length; j++) x[j] = -x[j]; }
    // order by position of first nonzero coordinate (diagonal forms give the standard basis)
    b.sort((x, y) => x.findIndex(t => t !== 0) - y.findIndex(t => t !== 0) || bil(A, x, x) - bil(A, y, y));
    return b;
}

// ---------------- main ----------------

export function analyze(input, opts = {}) {
    const t0 = Date.now();
    const progress = opts.onProgress || (() => {});
    const A = input.A, N = input.N;
    if (!(N >= 3)) throw new Error('the level N must be at least 3 (so that Γ(N) is torsion-free)');
    progress({ stage: 'lattice' });
    const L = setupLattice(A, input.v, input.lattice || 'auto');
    progress({ stage: 'vinberg' });
    const vb = vinberg(L.AL, L.p0, { wall: L.vL, maxRoots: opts.maxRoots, maxT: opts.maxT, deadline: Date.now() + (opts.vinbergMs ?? 15000) });
    if (!vb.ok) return { ok: false, stage: 'vinberg', reason: vb.reason, lattice: L };
    const P = buildPolytope(L.AL, vb.roots, vb.rays);
    const sym = symmetries(L.AL, vb.roots);
    const i0 = vb.roots.findIndex(e => e.join(',') === L.vL.join(','));
    if (i0 < 0) throw new Error('internal: H_v is not a wall of P');
    const mirrorClass = mirrorClassOf(P, sym, i0);
    progress({ stage: 'group' });
    const cover = splitCover(P, sym, N, i0, {
        cut: input.cut || 'one', cap: opts.cap,
        onProgress: (g, order) => progress({ stage: 'group', done: g, order }),
    });
    progress({ stage: 'boundary' });
    // one boundary group per distinct starting wall
    const walls = [...new Set(cover.edges.map(e => e.wall))];
    const boundary = new Map();
    for (const j of walls) boundary.set(j, boundaryRecord(L, P, cover, j));
    progress({ stage: 'homology' });
    const homology = opts.homology === false ? null : safe(() => pieceHomology(P, cover, undefined, opts.homologyMs ?? 5000));
    if (homology && !homology.error) homology.forEach((h, i) => { if (h) cover.pieces[i].homology = h; });
    const formInfo = safe(() => describeForm(L.AL));
    const origInfo = safe(() => describeForm(A));
    const hypInfo = safe(() => describeForm(L.gH));
    return {
        ok: true, ms: Date.now() - t0, input: { ...input }, lattice: L, P, sym, i0, mirrorClass,
        vinberg: { batches: vb.batches }, cover, boundary, formInfo, origInfo, hypInfo,
    };
}

const safe = f => { try { return f(); } catch (e) { return { error: e.message }; } };

/** Walls conjugate to wall i0 in Γ: odd-labelled Coxeter components, closed under Sym. */
export function mirrorClassOf(P, sym, i0) {
    const k = P.k;
    const cls = new Set([i0]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const i of [...cls]) {
            for (let j = 0; j < k; j++) {
                if (cls.has(j)) continue;
                const mm = P.coxM[i][j];
                if (mm === 3 || mm === 5) { cls.add(j); grew = true; }
            }
            for (const s of sym) if (!cls.has(s.perm[i])) { cls.add(s.perm[i]); grew = true; }
        }
    }
    return [...cls].sort((a, b) => a - b);
}

/**
 * The boundary surface H_e / Stab_K(H_e) for the wall e = roots[j], packaged
 * for gluing: its lattice Λ ∩ e^⊥ (basis C, Gram gH), the generators of the
 * boundary group as integer matrices in that basis, and enough ambient data
 * to test membership of any isometry of the hyperplane.
 */
function boundaryRecord(L, P, cover, j) {
    const AL = L.AL, m = L.m, n = L.n;
    const e = P.roots[j];
    let C;
    if (e.join(',') === L.vL.join(',')) C = L.HL.map(x => x.slice());
    else C = lll(kernelOfRow(AL.map(r => r.reduce((s, x, t) => s + x * e[t], 0))));
    const gH = C.map(a => C.map(b => bil(AL, a, b)));
    const gens = boundaryGenerators(P, cover, j);
    // restrict: k·C = C·δ  ⇒  δ = gH⁻¹ Cᵀ A k C
    const CB = transpose(C).map(r => r.map(big));                  // m × n
    const ALB = AL.map(r => r.map(big));
    const { adj, det } = adjugateB(gH);
    const CtA = matMulB(transpose(CB), ALB);
    const restricted = gens.map(K => {
        const X = matMulB(matMulB(adj, CtA), matMulB(K, CB));
        return X.map(r => r.map(x => {
            if (x % det !== 0n) throw new Error('internal: boundary generator is not integral on the hyperplane lattice');
            return x / det;
        }));
    });
    const sf = cover.surfaces[cover.edges.find(ed => ed.wall === j).comp];
    return {
        wall: j, root: e, C, gH, n, m, N: cover.N, AL, gens: restricted, surface: sf,
        rootOrig: matVecN(L.M, e), basisOrig: C.map(c => matVecN(L.M, c)),
    };
}
const matVecN = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));

/** Is the hyperplane isometry δ (n×n, in basis C) in the boundary group of `rec`? */
export function inBoundaryGroup(rec, delta) {
    const { C, root, AL, N, m, n } = rec;
    // basis [C | e] of ℚ^m; δ̂ = [C|e] · diag(δ, 1) · [C|e]⁻¹ (lattice coordinates)
    const Bm = transpose([...C, root]).map(r => r.map(big));
    const D = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) =>
        (i < n && j < n) ? big(delta[i][j]) : (i === j ? 1n : 0n)));
    const { adj, det } = adjugateB(Bm);
    const X = matMulB(matMulB(Bm, D), adj);
    const NB = big(N);
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
        if (X[i][j] % det !== 0n) return { ok: false, why: 'not integral on the ambient lattice' };
        const x = X[i][j] / det - (i === j ? 1n : 0n);
        if (x % NB !== 0n) return { ok: false, why: `not ≡ I mod ${N}` };
    }
    // future-preserving: a timelike vector of the hyperplane stays in its sheet
    const gH = rec.gH;
    let t = null;
    for (let i = 0; i < n && !t; i++) if (gH[i][i] < 0) t = Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));
    if (!t) {
        for (let i = 0; i < n && !t; i++) for (let j = i + 1; j < n && !t; j++) {
            for (const s of [1, -1]) {
                const x = Array.from({ length: n }, (_, a) => (a === i ? 1 : a === j ? s : 0));
                if (bil(gH, x, x) < 0) { t = x; break; }
            }
        }
    }
    if (t) {
        const dt = delta.map(r => r.reduce((s, x, j) => s + Number(x) * t[j], 0));
        if (bil(gH, t, dt) >= 0) return { ok: false, why: 'swaps the two sheets' };
    }
    return { ok: true };
}
