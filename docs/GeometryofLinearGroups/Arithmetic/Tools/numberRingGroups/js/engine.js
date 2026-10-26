// Presentations of GL_2(O), SL_2(O), PGL_2(O), PSL_2(O) for the ring of integers O of a number field.
//
//   1. The unit group: Voronoi's algorithm for GL_1(O) = O^× (the same machinery in rank 1) gives
//      generators and relations of O^×, hence fundamental units and the roots of unity.
//   2. GL_2(O): Voronoi's algorithm for perfect binary forms (Koecher) and Brown's theorem.
//   3. PGL_2(O) = GL_2(O)/O^×: add the relators ζ·I = 1, ε_k·I = 1 (words found by walking the complex).
//      SL_2(O) is the kernel of GL_2(O)/⟨ε_k I⟩ → O^×/⟨ε_k²⟩, PSL_2(O) the kernel of
//      PGL_2(O) → O^×/O^{×2} (the determinant): Reidemeister–Schreier on these finite coset actions.
// Every relator of every presentation is checked as a matrix identity (exact arithmetic).
import { NumberField } from './nf.js';
import { FormSpace } from './voronoi.js';
import { voronoiComplex, brownPresentation, evalWord, wordFor } from './brown.js';
import { tietze, abelianInvariants, reidemeisterSchreier } from '../../../../PresentationCalc/js/presentation.js';
import { quotient } from '../../../../PresentationCalc/js/intlin.js';
import { identifyGroup } from './groups.js';

const babs = (x) => (x < 0n ? -x : x);

export function supportCheck(nf) {
    if (nf.kind) return null;
    if (nf.r1 > 0 && nf.r2 > 0) return `mixed signature (${nf.r1}, ${nf.r2}) in degree ${nf.n}: only cubic fields with a complex place are supported so far`;
    return 'a totally complex field that is not CM: not supported yet';
}

// ------------------------------------------------------------------ words and presentations
const invWord = (w) => w.slice().reverse().map((x) => -x);
const freeReduce = (w) => { const o = []; for (const x of w) { if (o.length && o[o.length - 1] === -x) o.pop(); else o.push(x); } return o; };

/** Simplify ⟨1 … L | rels⟩ with Tietze moves; matrices of the kept letters. */
function simplify(space, letters, rels, opts = {}) {
    const T = tietze(letters.length, rels, { seconds: 8, maxLen: 24, ...opts });
    const gens = T.keep.map((k) => letters[k - 1]);
    return { gens, relators: T.relators, express: T.express, keep: T.keep };
}

function checkRelators(space, gens, relators) {
    const idk = space.matKey(space.identity());
    let bad = 0;
    for (const r of relators) if (space.matKey(evalWord(space, gens, r)) !== idk) bad++;
    return bad;
}
/** relators hold modulo scalars */
function checkProjective(space, gens, relators) {
    const K = space.nf;
    let bad = 0;
    for (const r of relators) {
        const g = evalWord(space, gens, r);
        if (!(K.isZero(g[0][1]) && K.isZero(g[1][0]) && K.eq(g[0][0], g[1][1]))) bad++;
    }
    return bad;
}

/**
 * Reidemeister–Schreier for the subgroup of ⟨gens | relators⟩ (letters 1 … m, ±) stabilizing coset 0 of
 * an action given by act(k, i) (generator k = 1 … m on coset i). Returns the subgroup's generators
 * (with matrices) and relators.
 */
function subgroupPresentation(space, gens, relators, nCosets, act) {
    const m = gens.length;
    const table = Array.from({ length: nCosets }, (_, i) => {
        const row = new Array(2 * m);
        for (let k = 1; k <= m; k++) row[2 * (k - 1)] = act(k, i);
        return row;
    });
    for (let k = 1; k <= m; k++) for (let i = 0; i < nCosets; i++) table[table[i][2 * (k - 1)]][2 * k - 1] = i;
    const toLetters = (w) => w.map((x) => (x > 0 ? 2 * (x - 1) : 2 * (-x - 1) + 1));
    const RS = reidemeisterSchreier({ nLetters: 2 * m, inv: (x) => x ^ 1, relators: relators.map(toLetters), table });
    const letterMat = (x) => (x % 2 === 0 ? gens[x >> 1].mat : space.matInv(gens[x >> 1].mat));
    const wordMat = (lw) => lw.reduce((g, x) => space.matMul(g, letterMat(x)), space.identity());
    const trans = RS.transversal.map(wordMat);
    const sub = RS.gens.map(({ i, x }) => ({ mat: space.matMul(space.matMul(trans[i], letterMat(x)), space.matInv(trans[table[i][x]])) }));
    return { gens: sub, relators: RS.relators, rewrite: (w) => RS.rewrite(toLetters(w)) };
}

// ------------------------------------------------------------------ the unit group
function unitGroup(nf, { deadline, progress }) {
    const r = nf.r1 + nf.r2;
    const units = { w: nf.w, zeta: nf.zeta, fundamental: [], rank: r - 1, cells: 0 };
    if (r < 2) return units;
    const S1 = new FormSpace(nf, 1);
    const cx = voronoiComplex(S1, { deadline, progress: (p) => progress({ ...p, stage: 'units' }) });
    const P = brownPresentation(cx, { deadline });
    units.cells = cx.cells.length;
    const L = P.letters.length;
    const rows = P.relators.map((w) => { const v = new Array(L).fill(0n); for (const x of w) v[Math.abs(x) - 1] += x > 0 ? 1n : -1n; return v; });
    const Q = quotient(rows, L);
    const free = [], tors = [];
    Q.orders.forEach((o, j) => {
        let u = nf.one();
        Q.basis[j].forEach((e, i) => {
            if (!e) return;
            let x = P.letters[i].mat[0][0];
            if (e < 0n) { x = nf.inv(x).v; e = -e; }
            for (let t = 0n; t < e; t++) u = nf.mul(u, x);
        });
        if (o === 0n) free.push(u); else tors.push({ o, u });
    });
    if (free.length !== r - 1) throw new Error(`internal: unit rank ${free.length}, expected ${r - 1}`);
    const torsOrder = tors.reduce((a, t) => a * t.o, 1n);
    if (torsOrder !== BigInt(nf.w)) throw new Error('internal: torsion of the unit group');
    units.fundamental = free.map((u) => reduceUnit(nf, u, free));
    units.fundamental = lllUnits(nf, units.fundamental);
    // the regulator
    const logs = units.fundamental.map((u) => nf.logEmbed(u).slice(0, r - 1));
    units.regulator = Math.abs(det(logs));
    return units;
}
function det(A) {
    const n = A.length; if (!n) return 1;
    const M = A.map((r) => r.slice()); let d = 1;
    for (let c = 0; c < n; c++) {
        let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        if (M[p][c] === 0) return 0;
        if (p !== c) { [M[p], M[c]] = [M[c], M[p]]; d = -d; }
        d *= M[c][c];
        for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; }
    }
    return d;
}
// make units look nicer: sign and small height (LLL on the log lattice, exact products)
function reduceUnit(nf, u) {
    // prefer a positive first real embedding / ε > 1 at the first place
    const e = nf.embed(u)[0];
    if (nf.r1 > 0 && e[0] < 0) u = nf.neg(u);
    return u;
}
function lllUnits(nf, units) {
    const r = units.length;
    if (r <= 1) return units.map((u) => normalizeUnit(nf, u));
    let U = units.slice();
    const logs = () => U.map((u) => nf.logEmbed(u));
    for (let pass = 0; pass < 50; pass++) {
        let changed = false;
        const L = logs();
        for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) {
            if (i === j) continue;
            const dij = L[i].reduce((s, x, t) => s + x * L[j][t], 0), djj = L[j].reduce((s, x) => s + x * x, 0);
            const q = Math.round(dij / djj);
            if (q) {
                let x = q > 0 ? nf.inv(U[j]).v : U[j];
                let y = U[i];
                for (let t = 0; t < Math.abs(q); t++) y = nf.mul(y, x);
                U[i] = y; changed = true;
                L[i] = nf.logEmbed(U[i]);
            }
        }
        if (!changed) break;
    }
    return U.map((u) => normalizeUnit(nf, u));
}
function normalizeUnit(nf, u) {
    // among ±ε^{±1}: the smallest coordinates in the user's root, then the fewest minus signs
    const ui = nf.inv(u).v;
    const cands = [u, nf.neg(u), ui, nf.neg(ui)];
    const score = (x) => { const a = nf.toA(x); let h = 0, neg = 0; for (const t of a) { const v = Number(t.n) / Number(t.d); h += Math.abs(v); if (v < 0) neg++; } return [h, neg]; };
    let best = null;
    for (const x of cands) { const [h, neg] = score(x); if (!best || h < best.h - 1e-9 || (Math.abs(h - best.h) < 1e-9 && neg < best.neg)) best = { x, h, neg }; }
    return best.x;
}
/** u = ζ^a ∏ ε_k^{e_k}: exponents (exact check) */
export function unitLog(nf, units, u) {
    const r = units.fundamental.length;
    let e = [];
    if (r) {
        const A = units.fundamental.map((x) => nf.logEmbed(x).slice(0, r));
        const b = nf.logEmbed(u).slice(0, r);
        // solve eᵀA = b
        const M = Array.from({ length: r }, (_, i) => Array.from({ length: r }, (_, j) => A[j][i]).concat([b[i]]));
        for (let c = 0; c < r; c++) {
            let p = c; for (let q = c + 1; q < r; q++) if (Math.abs(M[q][c]) > Math.abs(M[p][c])) p = q;
            [M[p], M[c]] = [M[c], M[p]];
            for (let q = 0; q < r; q++) { if (q === c) continue; const f = M[q][c] / M[c][c]; for (let k = c; k <= r; k++) M[q][k] -= f * M[c][k]; }
        }
        e = M.map((row, i) => Math.round(row[r] / row[i]));
    }
    let rest = u;
    units.fundamental.forEach((x, k) => {
        let ek = e[k];
        const y = ek > 0 ? nf.inv(x).v : x;
        for (let t = 0; t < Math.abs(ek); t++) rest = nf.mul(rest, y);
    });
    const a = nf.mu.findIndex((z) => nf.eq(z, rest));
    if (a < 0) throw new Error('internal: unit discrete logarithm');
    return { a, e };
}

// ------------------------------------------------------------------ the main computation
export function computeAll(src, { name = null, seconds = 120, progress = () => {}, tietzeSeconds = 8 } = {}) {
    const t0 = Date.now(), deadline = t0 + 1000 * seconds;
    const nf = new NumberField(src, { name });
    const why = supportCheck(nf);
    if (why) throw new Error(why);
    progress({ stage: 'field', phase: 'done' });
    const units = unitGroup(nf, { deadline, progress });
    progress({ stage: 'units', phase: 'done' });
    const space = new FormSpace(nf, 2);
    const cx = voronoiComplex(space, { deadline, progress: (p) => progress({ ...p, stage: 'voronoi' }) });
    progress({ stage: 'voronoi', phase: 'done', cells: cx.cells.length });
    const P = brownPresentation(cx, { deadline });
    const badBrown = checkRelators(space, P.letters, P.relators);
    if (badBrown) throw new Error(`internal: ${badBrown} relators of Brown's presentation fail`);
    progress({ stage: 'brown', phase: 'done', letters: P.letters.length, relators: P.relators.length });

    // words for the central elements
    const zetaWord = P.Wm(0, space.scalar(nf.zeta));
    const rng = mulberry(12345);
    const epsWords = units.fundamental.map((u) => wordFor(cx, P, space.scalar(u), { rng }));

    const out = { field: fieldSummary(nf, units), timing: {} };
    // GL_2, then everything else from its simplified presentation
    const T = { seconds: tietzeSeconds };
    const GL = simplify(space, P.letters, P.relators, T);
    out.GL2 = finishPresentation(space, GL, 'GL');
    const rewrite = (w) => freeReduce([].concat(...w.map((x) => (x > 0 ? GL.express(x) : invWord(GL.express(-x))))));
    const zetaW = rewrite(zetaWord), epsW = epsWords.map(rewrite);
    // PGL_2
    const PGL = simplify(space, GL.gens, GL.relators.concat([zetaW], epsW), T);
    out.PGL2 = finishPresentation(space, PGL, 'PGL');
    // SL_2: GL_2/⟨ε_k I⟩, kernel of the determinant class in μ × (Z/2)^{r−1}
    const GLmodEps = epsW.length ? simplify(space, GL.gens, GL.relators.concat(epsW), T) : GL;
    const r1 = units.fundamental.length, w = nf.w;
    const detClass = (g) => { const { a, e } = unitLog(nf, units, space.det(g)); return [((a % w) + w) % w].concat(e.map((x) => ((x % 2) + 2) % 2)); };
    const enc = (c) => c.reduce((acc, x, i) => acc + x * (i === 0 ? 1 : w * 2 ** (i - 1)), 0);
    const dec = (n) => { const c = [n % w]; let m = Math.floor(n / w); for (let i = 0; i < r1; i++) { c.push(m % 2); m = Math.floor(m / 2); } return c; };
    {
        const cls = GLmodEps.gens.map((g) => detClass(g.mat));
        const nC = w * 2 ** r1;
        const act = (k, i) => { const a = dec(i), b = cls[k - 1]; return enc(a.map((x, t) => (t === 0 ? (x + b[t]) % w : (x + b[t]) % 2))); };
        const sub = subgroupPresentation(space, GLmodEps.gens, GLmodEps.relators, nC, act);
        // the Schreier generators lie in GL_2 with det in ⟨ε²⟩: divide by the matching ε-power
        const fixed = sub.gens.map((g) => ({ mat: toSL(nf, space, units, g.mat) }));
        const SLs = simplify(space, fixed, sub.relators, T);
        out.SL2 = finishPresentation(space, SLs, 'SL');
    }
    // PSL_2: kernel of PGL_2 → O^×/O^{×2}
    {
        const cls = PGL.gens.map((g) => detClass(g.mat));
        const sq = (c) => [c[0] % 2].concat(c.slice(1));          // mod squares: a mod 2, e mod 2
        const nC = 2 * 2 ** r1;
        const enc2 = (c) => c.reduce((acc, x, i) => acc + x * 2 ** i, 0);
        const dec2 = (n) => Array.from({ length: r1 + 1 }, (_, i) => (n >> i) & 1);
        const act = (k, i) => { const a = dec2(i), b = sq(cls[k - 1]); return enc2(a.map((x, t) => x ^ b[t])); };
        const sub = subgroupPresentation(space, PGL.gens, PGL.relators, nC, act);
        const fixed = sub.gens.map((g) => ({ mat: toSL(nf, space, units, g.mat, true) }));
        const PSLs = simplify(space, fixed, sub.relators, T);
        out.PSL2 = finishPresentation(space, PSLs, 'PSL');
    }
    out.complex = complexSummary(nf, space, cx);
    out.brown = { letters: P.letters.length, relators: P.relators.length, tags: countTags(P.tags) };
    out.timing.total = Date.now() - t0;
    out._internal = { nf, space, cx, P, units, GL, PGL };
    return out;
}

// a matrix with det = ζ^a ε^{2e} (or a square class, projectively) scaled into SL_2 (up to ±1 projectively)
function toSL(nf, space, units, g, projective = false) {
    const { a, e } = unitLog(nf, units, space.det(g));
    // det g = ζ^a ∏ ε^{e}; e even (and a even when projective, or a = 0 for SL)
    let s = nf.one();
    units.fundamental.forEach((x, k) => {
        const h = e[k] / 2;
        if (!Number.isInteger(h)) throw new Error('internal: determinant is not a square');
        const y = h > 0 ? nf.inv(x).v : x;
        for (let t = 0; t < Math.abs(h); t++) s = nf.mul(s, y);
    });
    if (projective) {
        if (a % 2) throw new Error('internal: determinant is not a square');
        const z = nf.mu[(nf.w - a / 2) % nf.w];
        s = nf.mul(s, z);
    } else if (a !== 0) throw new Error('internal: determinant is not 1');
    return space.matMul(space.scalar(s), g);
}

function finishPresentation(space, S, kind) {
    const projective = kind === 'PGL' || kind === 'PSL';
    const bad = projective ? checkProjective(space, S.gens, S.relators) : checkRelators(space, S.gens, S.relators);
    if (bad) throw new Error(`internal: ${bad} relators of the ${kind}_2 presentation fail`);
    if (kind === 'SL' || kind === 'PSL') for (const g of S.gens) {
        const d = space.det(g.mat);
        if (!space.nf.isOne(d)) throw new Error('internal: a generator of SL_2 has determinant ≠ 1');
    }
    const ab = abelianInvariants(S.gens.length, S.relators);
    return {
        gens: S.gens.map((g) => g.mat),
        relators: S.relators,
        abelianization: ab,
        verified: S.relators.length,
    };
}

function countTags(tags) { const m = {}; for (const t of tags) m[t] = (m[t] || 0) + 1; return m; }

function fieldSummary(nf, units) {
    return {
        poly: nf.polyTex(), n: nf.n, r1: nf.r1, r2: nf.r2, disc: `${nf.disc}`, kind: nf.kind,
        basis: nf.B.map((_, i) => nf.tex(nf.unit(i))),
        w: nf.w, zeta: nf.tex(nf.zeta),
        fundamental: units.fundamental.map((u) => nf.tex(u)),
        regulator: units.regulator ?? null,
        unitCells: units.cells,
        certified: nf.certified,
    };
}

function complexSummary(nf, space, cx) {
    return cx.cells.map((c) => {
        const S = c.stab.elems;
        const proj = S.filter((g) => true);
        void proj;
        return {
            vectors: c.mv.vecs.length,
            rays: c.mv.qs.length,
            facets: c.facets.length,
            facetOrbits: c.facetReps.length,
            ridges: c.ridges.filter((r) => r.interior).length,
            stabOrder: S.length,
            pglStab: identifyGroup(space, S, nf.w),
            neighbors: c.facetReps.map((fi) => c.neighbor.get(fi).to),
        };
    });
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export { freeReduce, invWord, subgroupPresentation, simplify };
