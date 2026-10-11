// glue.js — arithmetic pieces as portable records, and gluing them.
//
// A piece remembers its ambient lattice (for the commensurability class) and,
// for each boundary component, the boundary group Δ = Stab_K(H)|_H as integer
// matrices on the hyperplane lattice Λ ∩ e^⊥, together with the ambient data
// needed to decide membership in Δ.
//
// Two boundary components glue iff some isometry Φ of the hyperplanes
// conjugates one boundary group onto the other. For n ≥ 3 the tool looks for
// Φ among the isometries of the hyperplane lattices, and certifies
//      Φ Δ₁ Φ⁻¹ ⊆ Δ₂   and   Φ⁻¹ Δ₂ Φ ⊆ Δ₁
// generator by generator. For n = 2 the boundary is a geodesic, and any two
// closed geodesics of equal length glue (with a free twist).

import { bil, adjugateB, matMulB, big } from './linalg.js';
import { inBoundaryGroup } from './gps.js';
import { similarQ, describeForm } from './forms.js';

const S = M => M.map(r => r.map(x => x.toString()));
const B = M => M.map(r => r.map(x => BigInt(x)));

/** Serialisable records for every piece of an analysis result. */
export function pieceRecords(res, label = '') {
    const { cover, P, lattice: L } = res;
    const surf = {};
    for (const [wall, rec] of res.boundary) {
        surf[wall] = {
            wall, root: rec.root, C: rec.C, gH: rec.gH, n: rec.n, m: rec.m, N: rec.N, AL: rec.AL,
            gens: rec.gens.map(S), surface: rec.surface, rootOrig: rec.rootOrig, basisOrig: rec.basisOrig,
        };
    }
    const vol = P.volume;
    return cover.pieces.map((p, i) => {
        const boundary = p.boundary.map(b => {
            const e = cover.edges[b.comp];
            return { comp: b.comp, side: b.side, wall: e.wall };
        });
        const rec = {
            kind: 'gps-piece', version: 1,
            label: label ? `${label}${cover.pieces.length > 1 ? ` (piece ${String.fromCharCode(65 + i)} of ${cover.pieces.length})` : ''}` : '',
            n: L.n, A: L.A, AL: L.AL, v: L.v, N: cover.N, latticeMode: L.mode, D: L.D, cut: res.input.cut || 'one',
            formText: res.input.formText || '', vText: res.input.vText || '',
            tiles: p.tiles, volume: p.tiles * vol, volP: vol,
            cuspSections: p.cuspSections || 0, cutSections: p.cutSections || 0,
            b1: p.homology ? p.homology.b1 : null, torsion: p.homology ? p.homology.torsion : null,
            boundary,
            surfaces: Object.fromEntries(boundary.map(b => [b.wall, surf[b.wall]])),
            pieceIndex: i, nPieces: cover.pieces.length,
        };
        if (L.n === 2) rec.area = rec.volume;
        return rec;
    });
}

// ---------------- isometries of hyperplane lattices ----------------

/** Integer matrices Φ (det ±1) with Φᵀ g2 Φ = g1, entries bounded by R. */
export function latticeIsometries(g1, g2, { R = 3, limit = 12 } = {}) {
    const n = g1.length;
    if (g2.length !== n) return [];
    const out = [];
    const same = g1.every((r, i) => r.every((x, j) => x === g2[i][j]));
    if (same) out.push(Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    for (let r = 1; r <= R && out.length < limit; r++) {
        // candidate columns: y with g2(y, y) = g1[i][i]
        const vecs = [];
        const y = new Array(n).fill(-r);
        for (;;) {
            if (y.some(t => t !== 0)) vecs.push(y.slice());
            let i = 0;
            while (i < n && y[i] === r) { y[i] = -r; i++; }
            if (i === n) break;
            y[i]++;
        }
        const cand = g1.map((row, i) => vecs.filter(v => bil(g2, v, v) === row[i]));
        const cols = [];
        const rec = i => {
            if (out.length >= limit) return;
            if (i === n) {
                const Phi = cols[0].map((_, a) => cols.map(c => c[a]));
                const d = det(Phi);
                if (Math.abs(d) !== 1) return;
                if (!out.some(M => M.every((row, a) => row.every((x, b) => x === Phi[a][b])))) out.push(Phi);
                return;
            }
            for (const c of cand[i]) {
                let ok = true;
                for (let j = 0; j < i; j++) if (bil(g2, cols[j], c) !== g1[j][i]) { ok = false; break; }
                if (!ok) continue;
                cols.push(c); rec(i + 1); cols.pop();
            }
        };
        rec(0);
    }
    return out;
}

function det(M) {
    const n = M.length;
    if (n === 1) return M[0][0];
    if (n === 2) return M[0][0] * M[1][1] - M[0][1] * M[1][0];
    let s = 0;
    for (let j = 0; j < n; j++) {
        const minor = M.slice(1).map(r => r.filter((_, t) => t !== j));
        s += (j % 2 ? -1 : 1) * M[0][j] * det(minor);
    }
    return s;
}

// conjugate δ by Φ: Φ δ Φ⁻¹ (all integer, Φ unimodular)
function conj(Phi, delta) {
    const P = Phi.map(r => r.map(big));
    const { adj, det: d } = adjugateB(P);
    const X = matMulB(matMulB(P, delta), adj);
    return X.map(r => r.map(x => x / d));
}

/**
 * Decide whether boundary surface s1 (of one piece) glues to s2 (of another).
 * Returns { status: 'yes' | 'no' | 'open', reason, phi?, checked? }.
 */
export function glueCheck(s1, s2) {
    if (s1.n !== s2.n) return { status: 'no', reason: 'the pieces live in different dimensions' };
    const n = s1.n;
    const a = s1.surface, b = s2.surface;
    if (n === 2) {
        if (a.closed !== b.closed) return { status: 'no', reason: 'one boundary geodesic is closed and the other is not' };
        if (!a.closed) return { status: 'yes', reason: 'both boundaries are bi-infinite geodesics running cusp to cusp; any isometry of the lines glues them' };
        if (Math.abs(a.length - b.length) > 1e-9 * Math.max(1, a.length)) {
            return { status: 'no', reason: `the boundary geodesics have different lengths, ${a.length.toFixed(6)} and ${b.length.toFixed(6)}` };
        }
        return { status: 'yes', reason: `both boundaries are closed geodesics of length ${a.length.toFixed(6)}; they glue for every twist parameter` };
    }
    // n ≥ 3: necessary invariants first
    if (n === 3) {
        if (Math.abs(a.area - b.area) > 1e-6) return { status: 'no', reason: `the boundary surfaces have different areas, ${fmtArea(a.area)} and ${fmtArea(b.area)}` };
        if (a.punctures !== b.punctures) return { status: 'no', reason: `the boundary surfaces have ${a.punctures} and ${b.punctures} punctures` };
    }
    let commensurable = null;
    try { commensurable = similarQ(s1.gH, s2.gH); } catch { /* invariants unavailable */ }
    if (commensurable === false) {
        return { status: 'no', reason: 'the boundary groups are not even commensurable: the hyperplane forms are not similar over ℚ' };
    }
    const phis = latticeIsometries(s1.gH, s2.gH);
    if (!phis.length) {
        return { status: 'open', reason: 'the boundary surfaces have the same invariants, but no isometry between the hyperplane lattices was found in the search box' };
    }
    const g1 = s1.gens.map(B), g2 = s2.gens.map(B);
    let lastFail = null;
    for (const Phi of phis) {
        const PhiInv = inverseInt(Phi);
        let fail = null;
        for (let i = 0; i < g1.length && !fail; i++) {
            const r = inBoundaryGroup(s2, conj(Phi, g1[i]));
            if (!r.ok) fail = `Φ δ${sub(i + 1)} Φ⁻¹ is not in the second boundary group (${r.why})`;
        }
        for (let i = 0; i < g2.length && !fail; i++) {
            const r = inBoundaryGroup(s1, conj(PhiInv, g2[i]));
            if (!r.ok) fail = `Φ⁻¹ δ′${sub(i + 1)} Φ is not in the first boundary group (${r.why})`;
        }
        if (!fail) {
            return {
                status: 'yes', phi: Phi,
                reason: `Φ conjugates the boundary groups onto each other: all ${g1.length} + ${g2.length} generators were checked`,
            };
        }
        lastFail = fail;
    }
    return { status: 'open', reason: `the boundary invariants agree, but none of the ${phis.length} lattice isometries tried conjugates the boundary groups (${lastFail})` };
}

function inverseInt(Phi) {
    const { adj, det: d } = adjugateB(Phi.map(r => r.map(big)));
    return adj.map(r => r.map(x => Number(x / d)));
}

const sub = k => String(k).split('').map(c => '₀₁₂₃₄₅₆₇₈₉'[c]).join('');
export const fmtArea = A => `${(A / Math.PI).toFixed(4).replace(/\.?0+$/, '')}π`;

// ---------------- hybrids ----------------

/**
 * Summarise an assembly: pieces, glued pairs [{a:{piece, b}, b:{piece, b}}].
 * Commensurability classes of the ambient forms decide the GPS verdict.
 */
export function assemble(pieces, pairs) {
    const used = new Set();
    for (const p of pairs) { used.add(`${p.a.piece}:${p.a.b}`); used.add(`${p.b.piece}:${p.b.b}`); }
    const open = [];
    pieces.forEach((pc, i) => pc.boundary.forEach((_, b) => { if (!used.has(`${i}:${b}`)) open.push({ piece: i, b }); }));
    // connectivity of the gluing graph
    const parent = pieces.map((_, i) => i);
    const find = x => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const p of pairs) parent[find(p.a.piece)] = find(p.b.piece);
    const connected = new Set(pieces.map((_, i) => find(i))).size <= 1;
    // commensurability classes
    const classes = [];
    const classOf = pieces.map(pc => {
        for (let c = 0; c < classes.length; c++) {
            let sim = false;
            try { sim = similarQ(classes[c].A, pc.A); } catch { sim = false; }
            if (sim) return c;
        }
        classes.push({ A: pc.A, info: safeDescribe(pc.A) });
        return classes.length - 1;
    });
    const volume = pieces.reduce((s, p) => s + p.volume, 0);
    let verdict;
    if (classes.length >= 2) {
        verdict = { status: 'nonarithmetic', text: 'Non-arithmetic. The pieces come from incommensurable arithmetic lattices, so by Gromov–Piatetski-Shapiro the glued manifold is not arithmetic.' };
    } else {
        verdict = { status: 'unknown', text: 'All pieces come from one commensurability class. The result may be arithmetic: regluing the pieces of one cover by the identity gives that cover back. This tool does not decide that case.' };
    }
    return { open, connected, classes, classOf, volume, verdict, closedUp: open.length === 0 };
}

function safeDescribe(A) { try { return describeForm(A); } catch (e) { return { error: e.message }; } }
