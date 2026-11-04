// chamber.js — hybrids without covers: gluing two Vinberg chambers.
//
// If the wall H of the Coxeter polytope P meets every adjacent wall at a right
// angle ("a right-angled wall"), then H ∩ P = F is a fundamental polytope of
// the reflection group of its neighbours acting on H. Two such chambers P₁, P₂
// (from forms f₁ = g ⊕ ⟨n₁⟩-ish and f₂ = g ⊕ ⟨n₂⟩-ish) whose faces are congruent
// glue into P = P₁ ∪_F P₂: along every edge of F the two right angles add up
// to π, so the walls through F's edges continue straight across, P is convex,
// and all its dihedral angles are π/m. Its reflection group
//     W(P) = W(P₁ ∖ H) ∗_{W(F)} W(P₂ ∖ H)
// is a lattice, and if f₁, f₂ are not similar it is non-arithmetic: a
// Gromov–Piatetski-Shapiro hybrid of orbifolds, of volume vol P₁ + vol P₂ —
// thousands of times smaller than a hybrid of congruence covers.
//
// The isometry Ψ: V₂ ⊗ ℝ → V₁ ⊗ ℝ placing P₂ across H sends the face walls of
// P₂ to those of P₁ and v₂ ↦ −√(n₂/n₁)·v₁; its entries lie in a multiquadratic
// field, ℚ(√(n₁n₂)) when the face walls have equal norms.
//
// (Only right angles allow incommensurable chambers: a wall through an edge of
// F at angle α in P₁ and β in P₂ needs α + β = π/m, while tan²α / tan²β is the
// ratio n₁/n₂ up to a square; for α, β ∈ {π/3, π/4, π/6} that forces n₁/n₂ to
// be a square, i.e. similar forms.)

import { bil, frac, kernelOfRow, lll } from './linalg.js';
import { invertFrac } from './multiquad.js';
import { kleinFrame } from './polytope.js';

/** Walls of P meeting every adjacent wall at a right angle (labels 2, or ∞ / ultraparallel for non-adjacent ones). */
export function rightAngledWalls(coxM) {
    const k = coxM.length, out = [];
    for (let i = 0; i < k; i++) {
        let ok = true, adj = 0;
        for (let j = 0; j < k && ok; j++) {
            if (j === i) continue;
            const m = coxM[i][j];
            if (m === -1 || m === Infinity || m === null) continue;
            adj++;
            if (m !== 2) ok = false;
        }
        if (ok && adj) out.push(i);
    }
    return out;
}

/** The Gram matrix of the hyperplane lattice e^⊥ ∩ Λ (LLL-reduced basis). */
export function hyperplaneGram(AL, e) {
    const row = AL.map((r) => r.reduce((s, x, t) => s + x * e[t], 0));
    const C = lll(kernelOfRow(row));
    return { C, gH: C.map((a) => C.map((b) => bil(AL, a, b))) };
}

/** A serializable chamber record for the workbench (from the worker's view model). */
export function chamberRecord(view, wall, label = '') {
    const P = view.poly, L = view.lattice;
    const face = [];
    for (let j = 0; j < P.k; j++) if (j !== wall && P.coxM[wall][j] === 2) face.push(j);
    const verts = P.vertices.map((v) => ({ r: v.r, walls: v.walls, ideal: v.ideal }));
    return {
        kind: 'gps-chamber', version: 1, label, n: P.n,
        A: L.A, AL: L.AL, formText: view.input.formText, vText: view.input.vText, latticeMode: L.mode,
        roots: P.roots, norms: P.norms, coxM: P.coxM, wall, face, verts,
        volume: P.volume, compact: !P.vertices.some((v) => v.ideal),
        formInfo: view.formInfo, hypInfo: wall === view.i0 ? view.hypInfo : null,
    };
}

// ---------------- small numeric helpers ----------------

const cosOf = (A, a, b) => bil(A, a, b) / Math.sqrt(bil(A, a, a) * bil(A, b, b));

function rankQ(rows) {
    // rank of integer vectors, numerically with partial pivoting (small sizes)
    const M = rows.map((r) => r.slice());
    let rank = 0;
    const cols = M[0] ? M[0].length : 0;
    for (let c = 0; c < cols && rank < M.length; c++) {
        let p = rank, best = 0;
        for (let i = rank; i < M.length; i++) if (Math.abs(M[i][c]) > best) { best = Math.abs(M[i][c]); p = i; }
        if (best < 1e-9) continue;
        [M[rank], M[p]] = [M[p], M[rank]];
        for (let i = 0; i < M.length; i++) {
            if (i === rank) continue;
            const f = M[i][c] / M[rank][c];
            for (let t = c; t < cols; t++) M[i][t] -= f * M[rank][t];
        }
        rank++;
    }
    return rank;
}

/** Bijections π of the face walls preserving the Gram matrix of unit normals. */
function faceMatchings(c1, c2, limit = 48) {
    const F1 = c1.face, F2 = c2.face;
    if (F1.length !== F2.length) return [];
    const g1 = F1.map((a) => F1.map((b) => cosOf(c1.AL, c1.roots[a], c1.roots[b])));
    const g2 = F2.map((a) => F2.map((b) => cosOf(c2.AL, c2.roots[a], c2.roots[b])));
    const out = [], pi = [], used = new Set();
    const rec = (i) => {
        if (out.length >= limit) return;
        if (i === F1.length) { out.push(pi.slice()); return; }
        for (let j = 0; j < F2.length; j++) {
            if (used.has(j)) continue;
            let ok = true;
            for (let t = 0; t < i && ok; t++) if (Math.abs(g1[i][t] - g2[j][pi[t]]) > 1e-9) ok = false;
            if (!ok) continue;
            pi.push(j); used.add(j); rec(i + 1); pi.pop(); used.delete(j);
        }
    };
    rec(0);
    return out;
}

/** The radicands of the gluing: n₁n₂ and the norm ratios of matched face walls (all mod squares). */
export function gluingRadicands(c1, c2, pi) {
    const n1 = c1.norms[c1.wall], n2 = c2.norms[c2.wall];
    const rads = [n1 * n2];
    c1.face.forEach((a, i) => { const b = c2.face[pi[i]]; rads.push(c1.norms[a] * c2.norms[b]); });
    return rads;
}

/**
 * Decide whether chamber c2 glues to chamber c1 along their right-angled
 * walls, and build the glued polytope over the field K (a MultiQuad that must
 * contain the gluing radicands; pass K = null to only test).
 * Returns { status: 'yes' | 'no', reason, pi?, glued? }.
 */
export function glueChambers(c1, c2, makeField = null) {
    if (c1.n !== c2.n) return { status: 'no', reason: 'the chambers live in different dimensions' };
    if (c1.face.length !== c2.face.length) return { status: 'no', reason: `the faces are not congruent: they have ${c1.face.length} and ${c2.face.length} sides` };
    const n = c1.n, m = n + 1;
    const pis = faceMatchings(c1, c2);
    if (!pis.length) return { status: 'no', reason: 'the faces are not congruent: their dihedral angles differ' };
    const s1 = faceCenter(c1), s2 = faceCenter(c2);
    let lastWhy = '';
    for (const pi of pis) {
        // sources: n independent face roots of c2, and v₂
        const v1 = c1.roots[c1.wall], v2 = c2.roots[c2.wall];
        const idx = [];
        for (let i = 0; i < c1.face.length && idx.length < n; i++) {
            const trial = [...idx, i].map((t) => c2.roots[c2.face[pi[t]]]);
            if (rankQ(trial) === trial.length) idx.push(i);
        }
        if (idx.length < n) { lastWhy = 'the face walls do not span the hyperplane'; continue; }
        // numeric isometry first (cheap): does Ψ send every face wall and the face centre correctly?
        const mu = c1.face.map((a, i) => Math.sqrt(c2.norms[c2.face[pi[i]]] / c1.norms[a]));
        const nu = Math.sqrt(c2.norms[c2.wall] / c1.norms[c1.wall]);
        const src = [...idx.map((i) => c2.roots[c2.face[pi[i]]]), v2];
        const tgt = [...idx.map((i) => c1.roots[c1.face[i]].map((x) => mu[i] * x)), v1.map((x) => -nu * x)];
        const Psi = numericMap(src, tgt);
        if (!Psi) { lastWhy = 'singular'; continue; }
        const ok = c1.face.every((a, i) => {
            const im = mv(Psi, c2.roots[c2.face[pi[i]]]);
            return im.every((x, t) => Math.abs(x - mu[i] * c1.roots[a][t]) < 1e-7 * (1 + Math.abs(x)));
        });
        if (!ok) { lastWhy = 'no isometry of the hyperplanes carries one face onto the other'; continue; }
        // isometry: Ψᵀ A₁ Ψ = A₂
        let iso = true;
        for (let i = 0; i < m && iso; i++) for (let j = 0; j < m && iso; j++) {
            const ci = Psi.map((r) => r[i]), cj = Psi.map((r) => r[j]);
            if (Math.abs(bil(c1.AL, ci, cj) - c2.AL[i][j]) > 1e-7 * (1 + Math.abs(c2.AL[i][j]))) iso = false;
        }
        if (!iso) { lastWhy = 'the matching of the faces does not extend to an isometry'; continue; }
        // the two faces must lie in the same sheet (else Ψ maps P₂'s face to the antipodal face)
        if (bil(c1.AL, mv(Psi, s2), s1) >= 0) { lastWhy = 'the matching sends the face to the other sheet'; continue; }
        const result = { status: 'yes', pi, Psi };
        result.reason = `the ${c1.face.length} walls through the faces are matched by an isometry of the hyperplanes`;
        result.n1 = c1.norms[c1.wall]; result.n2 = c2.norms[c2.wall];
        if (makeField) result.glued = buildGlued(c1, c2, pi, idx, makeField);
        return result;
    }
    return { status: 'no', reason: `the faces are combinatorially alike, but ${lastWhy}` };
}

function faceCenter(c) {
    const vs = c.verts.filter((v) => v.walls.includes(c.wall));
    const s = new Array(c.n + 1).fill(0);
    for (const v of vs) {
        const r = v.r.map(Number);
        const f = bil(c.AL, r, r);
        const sc = f < 0 ? 1 / Math.sqrt(-f) : 1;       // ideal vertices: any positive multiple
        for (let i = 0; i < s.length; i++) s[i] += sc * r[i];
    }
    return s;
}

const mv = (M, v) => M.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));

/** The real matrix sending the columns src to tgt. */
function numericMap(src, tgt) {
    const m = src.length;
    const S = Array.from({ length: m }, (_, i) => src.map((c) => c[i]));
    const Si = invNum(S);
    if (!Si) return null;
    const T = Array.from({ length: m }, (_, i) => tgt.map((c) => c[i]));
    return T.map((r) => Si[0].map((_, j) => r.reduce((s, x, k) => s + x * Si[k][j], 0)));
}

function invNum(M0) {
    const n = M0.length;
    const A = M0.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
        if (Math.abs(A[p][c]) < 1e-12) return null;
        [A[c], A[p]] = [A[p], A[c]];
        const piv = A[c][c];
        for (let j = 0; j < 2 * n; j++) A[c][j] /= piv;
        for (let i = 0; i < n; i++) {
            if (i === c) continue;
            const f = A[i][c];
            if (f) for (let j = 0; j < 2 * n; j++) A[i][j] -= f * A[c][j];
        }
    }
    return A.map((r) => r.slice(n));
}

/**
 * The glued polytope: walls of P₁ other than H, and Ψ(walls of P₂ other than H
 * and its face walls), exactly over K = makeField(radicands), with the numeric
 * Coxeter matrix and the data for the picture.
 */
function buildGlued(c1, c2, pi, idx, makeField) {
    const n = c1.n, m = n + 1;
    const K = makeField(gluingRadicands(c1, c2, pi));
    const v1 = c1.roots[c1.wall], v2 = c2.roots[c2.wall];
    const n1 = c1.norms[c1.wall], n2 = c2.norms[c2.wall];
    // exact Ψ = T S⁻¹ over K
    const srcCols = [...idx.map((i) => c2.roots[c2.face[pi[i]]]), v2];
    const S = Array.from({ length: m }, (_, i) => srcCols.map((c) => frac(BigInt(c[i]))));
    const Si = invertFrac(S);
    const sq = (num, den) => K.sqrt({ n: BigInt(num), d: BigInt(den) });
    const tgtCols = [
        ...idx.map((i) => { const a = c1.face[i], b = c2.face[pi[i]]; const mu = sq(c2.norms[b], c1.norms[a]); return c1.roots[a].map((x) => K.scale(mu, frac(BigInt(x)))); }),
        v1.map((x) => K.neg(K.scale(sq(n2, n1), frac(BigInt(x))))),
    ];
    const Psi = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => {
        let s = K.zero();
        for (let t = 0; t < m; t++) s = K.add(s, K.scale(tgtCols[t][i], Si[t][j]));
        return s;
    }));
    const apply = (r) => Psi.map((row) => row.reduce((s, x, j) => K.add(s, K.scale(x, frac(BigInt(r[j])))), K.zero()));
    // walls
    const walls = [], origin = [];
    c1.roots.forEach((r, j) => { if (j === c1.wall) return; walls.push(r.map((x) => K.rat(BigInt(x)))); origin.push(c1.face.includes(j) ? { piece: 0, index: j, face: true } : { piece: 1, index: j }); });
    const faceSet2 = new Set(c2.face);
    c2.roots.forEach((r, j) => { if (j === c2.wall || faceSet2.has(j)) return; walls.push(apply(r)); origin.push({ piece: 2, index: j }); });
    // numeric Gram and Coxeter matrix
    const A1 = c1.AL;
    const wn = walls.map((w) => w.map((x) => K.num(x).re));
    const norm = wn.map((w) => bil(A1, w, w));
    const k = walls.length;
    const coxM = [], bad = [];
    for (let i = 0; i < k; i++) {
        const row = [];
        for (let j = 0; j < k; j++) {
            if (i === j) { row.push(1); continue; }
            const c = -bil(A1, wn[i], wn[j]) / Math.sqrt(norm[i] * norm[j]);
            if (c > 1 + 1e-9) row.push(-1);
            else if (c > 1 - 1e-9) row.push(Infinity);
            else {
                const mm = Math.PI / Math.acos(Math.max(-1, Math.min(1, c)));
                const r = Math.round(mm);
                if (Math.abs(mm - r) > 1e-6 || r < 2) { bad.push([i, j, mm]); row.push(NaN); } else row.push(r);
            }
        }
        coxM.push(row);
    }
    // the gluing plane's unit normal and a frame centred on the face, for the picture
    const center = faceCenter(c1);
    const frame = kleinFrame(A1, center);
    const std = (w, f) => { const s = Math.sqrt(f); const x = frame.map((u) => bil(A1, u, w) / s); return [...x.slice(1), -x[0]]; };
    const rwalls = wn.map((w, i) => std(w, norm[i]));
    const h = std(v1, n1);
    return {
        K, walls, origin, coxM, bad, wallsNum: wn, norms: norm,
        volume: c1.volume + c2.volume, compact: c1.compact && c2.compact,
        render: { n, k, walls: rwalls, hybrid: h },
        n1, n2,
    };
}

/** For the export: a base wall for s_b s_j that mixes both pieces (a wall of P₁ off the face). */
export function mixingBase(glued) {
    const i = glued.origin.findIndex((o) => o.piece === 1);
    return i >= 0 ? i : 0;
}
