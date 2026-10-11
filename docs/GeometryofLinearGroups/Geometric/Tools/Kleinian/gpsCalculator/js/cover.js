// cover.js — the congruence cover M′ = ℍⁿ/K, K = Γ(N), tiled by copies of
// the Coxeter polytope P, and the splitting of M′ along an embedded lift of a
// mirror hypersurface.
//
// Γ = O′(Λ) = W ⋊ Sym(P). K = ker(Γ → GL(Λ/NΛ)) is normal, torsion-free for
// N ≥ 3 (Minkowski) and acts freely on chambers, so the tiles of M′ are the
// cosets G/Σ̄ of the finite group G = Γ/K (Σ̄ = image of Sym(P)). A "framed
// tile" is an element g ∈ G (the chamber gP with its walls labelled), and a
// "half-face" (g, j) is wall j of framed tile g, seen from g's side. Since
// gσ is the same tile with walls relabelled by σ,
//      (g, j) ≡ (gσ, π_σ⁻¹ j)        (same half-face)
// and the opposite half-face of (g, j) is (g s_j, j).
//
// A mirror continues across a ridge F_j ∩ F_l (dihedral angle π/m) into the
// half-face (g·u, t), u = s_l s_j s_l ⋯ (m − 1 letters), t = j for m even and
// l for m odd — and stays on the same side. Flood-filling with this rule
// traces a lift of the hypersurface through M′; carrying actual matrices
// along the way turns every non-tree step into an element of the boundary
// group Stab_K(H).

import { matMulB, adjugateB, transpose, big } from './linalg.js';
import { reflectionMatrix } from './vinberg.js';

// ---------------- the finite group G = Γ / Γ(N) ----------------

/**
 * Enumerate G = ⟨ s̄_j, σ̄ ⟩ ⊂ GL_m(ℤ/N) by right multiplication.
 * Returns { order, mats (Int32Array |G|·m²), R (right multiplication table,
 * |G|·ngen), parent, parentGen } with element 0 = identity.
 */
export function enumerateGroup(gens, m, N, cap = 800000, onProgress) {
    const mm = m * m;
    const ngen = gens.length;
    const gm = gens.map(G => Int32Array.from(G.flat().map(x => ((x % N) + N) % N)));
    const useNum = Math.pow(N, mm) < 9e15;
    const keyOf = useNum
        ? (a, o) => { let k = 0; for (let i = 0; i < mm; i++) k = k * N + a[o + i]; return k; }
        : (a, o) => { let s = ''; for (let i = 0; i < mm; i++) s += String.fromCharCode(48 + a[o + i]); return s; };
    let cap0 = 1024;
    let mats = new Int32Array(cap0 * mm);
    for (let i = 0; i < m; i++) mats[i * m + i] = 1 % N;
    const index = new Map([[keyOf(mats, 0), 0]]);
    let order = 1;
    let parent = new Int32Array(cap0), parentGen = new Int16Array(cap0);
    parent[0] = -1; parentGen[0] = -1;
    const tmp = new Int32Array(mm);
    let R = new Int32Array(cap0 * ngen);
    for (let g = 0; g < order; g++) {
        const o = g * mm;
        for (let s = 0; s < ngen; s++) {
            const S = gm[s];
            for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
                let acc = 0;
                for (let t = 0; t < m; t++) acc += mats[o + i * m + t] * S[t * m + j];
                tmp[i * m + j] = acc % N;
            }
            const key = keyOf(tmp, 0);
            let h = index.get(key);
            if (h === undefined) {
                h = order++;
                if (order > cap) throw new Error(`the group Γ/Γ(${N}) has more than ${cap.toLocaleString()} elements — try a smaller level`);
                if (h >= cap0) {
                    cap0 *= 2;
                    const nm = new Int32Array(cap0 * mm); nm.set(mats); mats = nm;
                    const np = new Int32Array(cap0); np.set(parent); parent = np;
                    const ng = new Int16Array(cap0); ng.set(parentGen); parentGen = ng;
                    const nR = new Int32Array(cap0 * ngen); nR.set(R); R = nR;
                }
                mats.set(tmp, h * mm);
                index.set(key, h);
                parent[h] = g; parentGen[h] = s;
            }
            R[g * ngen + s] = h;
        }
        if (onProgress && (g & 0x3fff) === 0) onProgress(g, order);
    }
    return {
        order, m, N, ngen,
        mats: mats.slice(0, order * mm), R: R.slice(0, order * ngen),
        parent: parent.slice(0, order), parentGen: parentGen.slice(0, order),
        indexOf: (M) => index.get(keyOf(Int32Array.from(M.flat().map(x => ((x % N) + N) % N)), 0)),
    };
}

// ---------------- union–find ----------------

class DSU {
    constructor(n) { this.p = new Int32Array(n); for (let i = 0; i < n; i++) this.p[i] = i; }
    find(x) { const p = this.p; while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
    union(a, b) { a = this.find(a); b = this.find(b); if (a !== b) { if (a < b) this.p[b] = a; else this.p[a] = b; } return a !== b; }
}

// ---------------- the cover and its splitting ----------------

/**
 * @param P      polytope from buildPolytope (roots, coxM, vertices…)
 * @param sym    symmetries [{perm, mat}] (including the identity)
 * @param N      level (≥ 3)
 * @param i0     index of the wall carrying the hypersurface
 * @param opts   { cut: 'one' | 'fix', onProgress }
 */
export function splitCover(P, sym, N, i0, opts = {}) {
    const { A, m, n, k, roots, coxM } = P;
    const cut = opts.cut || 'one';
    const refl = roots.map(e => reflectionMatrix(A, e));
    const symNon = sym.filter(s => s.perm.some((x, i) => x !== i));
    const gens = [...refl, ...symNon.map(s => s.mat)];
    const G = enumerateGroup(gens, m, N, opts.cap, opts.onProgress);
    const ngen = G.ngen, R = G.R, order = G.order;
    const nSym = symNon.length + 1;
    const permInv = symNon.map(s => { const inv = new Array(k); s.perm.forEach((x, i) => { inv[x] = i; }); return inv; });

    // vertex permutations induced by the symmetries (vertices matched by wall sets)
    const vKey = v => v.walls.slice().sort((a, b) => a - b).join(',');
    const vIndex = new Map(P.vertices.map((v, i) => [vKey(v), i]));
    const vPermInv = symNon.map((s, t) => P.vertices.map(v => vIndex.get(v.walls.map(w => permInv[t][w]).sort((a, b) => a - b).join(','))));

    // ---- half-faces ----
    // canonical representative of (g, j) under the Sym relabelling; returns id = g*k + j
    const canon = (g, j) => {
        let best = g * k + j;
        for (let t = 0; t < symNon.length; t++) {
            const id = R[g * ngen + k + t] * k + permInv[t][j];
            if (id < best) best = id;
        }
        return best;
    };
    // which Sym element realises the canonical form (−1 = identity)
    const canonSym = (g, j) => {
        let best = g * k + j, which = -1;
        for (let t = 0; t < symNon.length; t++) {
            const id = R[g * ngen + k + t] * k + permInv[t][j];
            if (id < best) { best = id; which = t; }
        }
        return which;
    };
    const opposite = (g, j) => canon(R[g * ngen + j], j);

    // ridge words: u_{jl} = s_l s_j s_l ⋯ (m−1 letters), landing wall t
    const ridgeNbrs = Array.from({ length: k }, () => []);
    for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) {
        const mm = coxM[j][l];
        if (j === l || !(mm >= 2 && mm !== Infinity)) continue;
        const word = [];
        for (let a = 0; a < mm - 1; a++) word.push(a % 2 === 0 ? l : j);
        ridgeNbrs[j].push({ l, word, t: mm % 2 === 0 ? j : l, m: mm });
    }
    const applyWord = (g, word) => { for (const s of word) g = R[g * ngen + s]; return g; };

    // ---- which half-faces get cut ----
    // sigmaComp[id] = component index (+side) or ~component (−side) for canonical half-face ids
    const sigmaComp = new Int32Array(order * k).fill(0x7fffffff);
    const NONE = 0x7fffffff;
    const comps = [];
    const traceComponent = (g0, j0) => {
        const c = comps.length;
        const comp = { start: [g0, j0], plus: [], oneSided: false };
        comps.push(comp);
        const queue = [[g0, j0]];
        const h0 = canon(g0, j0);
        sigmaComp[h0] = c; sigmaComp[opposite(g0, j0)] = ~c;
        comp.plus.push(h0);
        for (let qi = 0; qi < queue.length; qi++) {
            const [g, j] = queue[qi];
            for (const { word, t } of ridgeNbrs[j]) {
                const g2 = applyWord(g, word);
                const h = canon(g2, t);
                if (sigmaComp[h] === NONE) {
                    sigmaComp[h] = c;
                    const ho = opposite(g2, t);
                    if (sigmaComp[ho] !== NONE && sigmaComp[ho] !== ~c) comp.oneSided = true;
                    if (sigmaComp[ho] === c) comp.oneSided = true;
                    sigmaComp[ho] = ~c;
                    comp.plus.push(h);
                    queue.push([g2, t]);
                } else if (sigmaComp[h] !== c) comp.oneSided = true;
            }
        }
        return comp;
    };

    traceComponent(0, i0);
    let fixInfo = null;
    if (cut === 'fix') {
        // Fix(σ_v): half-faces (g, j) with g s_j g⁻¹ = r_v, i.e. g·s_j = r_v·g in G
        const rv = refl[i0];
        const mm = m * m;
        const left = new Int32Array(order);
        const tmp = Array.from({ length: m }, () => new Array(m).fill(0));
        for (let g = 0; g < order; g++) {
            for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
                let s = 0;
                for (let t = 0; t < m; t++) s += rv[a][t] * G.mats[g * mm + t * m + b];
                tmp[a][b] = s;
            }
            left[g] = G.indexOf(tmp);
        }
        let count = 0;
        for (let g = 0; g < order; g++) for (let j = 0; j < k; j++) {
            if (R[g * ngen + j] !== left[g]) continue;
            const h = canon(g, j);
            if (sigmaComp[h] !== NONE) continue;
            traceComponent(g, j);
            count++;
        }
        fixInfo = { extra: count };
    }
    const inSigma = id => sigmaComp[id] !== NONE;

    // ---- certificates: embedded (≤ one sheet through every ridge) ----
    let maxSheets = 0;
    for (const comp of comps) {
        for (const h of comp.plus) {
            const g = Math.floor(h / k), j = h % k;
            for (const { l, m: mm } of ridgeNbrs[j]) {
                let c = g, count = 0;
                const hits = [];
                for (let i = 0; i < 2 * mm; i++) {
                    const w = i % 2 === 0 ? l : j;
                    if (inSigma(canon(c, w))) { count++; hits.push(i); }
                    c = R[c * ngen + w];
                }
                if (count > maxSheets) maxSheets = count;
                if (count === 2 && hits[1] - hits[0] !== mm) maxSheets = Math.max(maxSheets, 3);
            }
        }
    }
    const embedded = maxSheets <= 2;
    const twoSided = comps.every(c => !c.oneSided);

    // ---- pieces: tiles glued across the uncut faces ----
    const dsu = new DSU(order);
    for (let g = 0; g < order; g++) {
        for (let t = 0; t < symNon.length; t++) dsu.union(g, R[g * ngen + k + t]);
        for (let j = 0; j < k; j++) if (!inSigma(canon(g, j))) dsu.union(g, R[g * ngen + j]);
    }
    const pieceOfRoot = new Map();
    const pieceOf = new Int32Array(order);
    const pieceSize = [];
    for (let g = 0; g < order; g++) {
        const r = dsu.find(g);
        let p = pieceOfRoot.get(r);
        if (p === undefined) { p = pieceSize.length; pieceOfRoot.set(r, p); pieceSize.push(0); }
        pieceOf[g] = p; pieceSize[p]++;
    }
    // order the pieces: the one containing P first
    const nPieces = pieceSize.length;
    const pieces = pieceSize.map((s, i) => ({ index: i, framed: s, tiles: s / nSym, boundary: [] }));

    // ---- the graph of groups ----
    const edges = comps.map((comp, c) => {
        const [g0, j0] = comp.start;
        const plusPiece = pieceOf[g0], minusPiece = pieceOf[R[g0 * ngen + j0]];
        pieces[plusPiece].boundary.push({ comp: c, side: '+' });
        pieces[minusPiece].boundary.push({ comp: c, side: '−' });
        return { comp: c, plus: plusPiece, minus: minusPiece, wall: j0, faces: comp.plus.length };
    });

    // ---- cusps: framed ideal vertices ----
    const ideal = P.vertices.map((v, i) => (v.ideal ? i : -1)).filter(i => i >= 0);
    const idealPos = new Map(ideal.map((v, i) => [v, i]));
    const nI = ideal.length;
    let cusps = null;
    if (nI) {
        const all = new DSU(order * nI), cutD = new DSU(order * nI);
        for (let g = 0; g < order; g++) for (let a = 0; a < nI; a++) {
            const nu = ideal[a], id = g * nI + a;
            for (let t = 0; t < symNon.length; t++) {
                const id2 = R[g * ngen + k + t] * nI + idealPos.get(vPermInv[t][nu]);
                all.union(id, id2); cutD.union(id, id2);
            }
            for (const j of P.vertices[nu].walls) {
                const id2 = R[g * ngen + j] * nI + a;
                all.union(id, id2);
                if (!inSigma(canon(g, j))) cutD.union(id, id2);
            }
        }
        const cuspIds = new Set(), sections = new Map();
        for (let g = 0; g < order; g++) for (let a = 0; a < nI; a++) {
            const id = g * nI + a;
            cuspIds.add(all.find(id));
            const r = cutD.find(id);
            let s = sections.get(r);
            if (!s) { s = { piece: pieceOf[g], cut: false }; sections.set(r, s); }
            if (!s.cut) for (const j of P.vertices[ideal[a]].walls) if (inSigma(canon(g, j))) { s.cut = true; break; }
        }
        cusps = { count: cuspIds.size };
        for (const p of pieces) { p.cuspSections = 0; p.cutSections = 0; }
        for (const s of sections.values()) { pieces[s.piece].cuspSections++; if (s.cut) pieces[s.piece].cutSections++; }
    } else for (const p of pieces) { p.cuspSections = 0; p.cutSections = 0; }

    // ---- surface invariants of each component ----
    const surfaces = comps.map(comp => surfaceInvariants(P, comp, k, canon, R, ngen, ridgeNbrs, applyWord, symNon, permInv, vPermInv));

    // ---- torsion check: finite vertex groups inject into G ----
    let injective = true;
    for (const F of P.faces) {
        if (F.S.length !== n) continue;
        const seen = new Set([0]); const q = [0];
        while (q.length) { const g = q.pop(); for (const s of F.S) { const h = R[g * ngen + s]; if (!seen.has(h)) { seen.add(h); q.push(h); } } }
        if (seen.size !== F.order) { injective = false; break; }
    }
    for (let t = 0; t < symNon.length; t++) if (R[k + t] === 0) injective = false;

    return {
        N, order, nSym, tiles: order / nSym, G, ngen, symNon, permInv,
        comps, edges, pieces, pieceOf, nPieces, sigmaComp, canon, canonSym, opposite,
        ridgeNbrs, applyWord, refl, cusps, surfaces,
        certificates: { embedded, twoSided, maxSheets, torsionFree: N >= 3, verticesInject: injective },
        fixInfo,
    };
}

/** Area/genus/punctures (n = 3) or length (n = 2) of a traced component. */
function surfaceInvariants(P, comp, k, canon, R, ngen, ridgeNbrs, applyWord, symNon, permInv, vPermInv) {
    const n = P.n;
    const walls = comp.plus.map(h => h % k);
    const out = { faces: comp.plus.length };
    if (n === 2) {
        let len = 0, closed = true;
        for (const j of walls) {
            const vs = P.vertices.filter(v => v.walls.includes(j));
            if (vs.length !== 2 || vs.some(v => v.ideal)) { closed = false; continue; }
            const [a, b] = vs;
            const c = -bilN(P.A, a.r, b.r) / Math.sqrt(a.f * b.f);
            len += Math.acosh(Math.max(1, c));
        }
        out.closed = closed;
        out.length = closed ? len : Infinity;
        return out;
    }
    if (n === 3) {
        const fd = P.faceData;
        const area = walls.reduce((s, j) => s + fd[j].area, 0);
        out.area = area;
        out.chi = -area / (2 * Math.PI);
        // punctures: (half-face, ideal vertex on it) up to continuation through that vertex
        const idealOn = j => P.vertices.map((v, i) => (v.ideal && v.walls.includes(j) ? i : -1)).filter(i => i >= 0);
        const ids = new Map();
        const key = (h, nu) => h * 4096 + nu;
        const parent = [];
        const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
        const id = (h, nu) => { const kk = key(h, nu); let v = ids.get(kk); if (v === undefined) { v = parent.length; parent.push(v); ids.set(kk, v); } return v; };
        // canonical (half-face, vertex): apply the same Sym element that canonicalises the half-face
        const canonHV = (g, j, nu) => {
            let best = g * k + j, bnu = nu;
            for (let t = 0; t < symNon.length; t++) {
                const idh = R[g * ngen + k + t] * k + permInv[t][j];
                if (idh < best || (idh === best && vPermInv[t][nu] < bnu)) { best = idh; bnu = vPermInv[t][nu]; }
            }
            return [best, bnu];
        };
        for (const h of comp.plus) {
            const g = Math.floor(h / k), j = h % k;
            for (const nu of idealOn(j)) {
                const [h1, n1] = canonHV(g, j, nu);
                const a = id(h1, n1);
                for (const { l, word, t } of ridgeNbrs[j]) {
                    if (!P.vertices[nu].walls.includes(l)) continue;
                    const g2 = applyWord(g, word);
                    const [h2, n2] = canonHV(g2, t, nu);
                    const b = id(h2, n2);
                    const ra = find(a), rb = find(b);
                    if (ra !== rb) parent[ra] = rb;
                }
            }
        }
        const roots = new Set(); for (let i = 0; i < parent.length; i++) roots.add(find(i));
        out.punctures = roots.size;
        const chi = Math.round(out.chi);
        out.chiExact = Math.abs(out.chi - chi) < 1e-6 ? chi : null;
        out.genus = out.chiExact !== null ? (2 - chi - out.punctures) / 2 : null;
        out.closed = out.punctures === 0;
        return out;
    }
    return out;
}

const bilN = (A, u, v) => { let s = 0; for (let i = 0; i < u.length; i++) for (let j = 0; j < v.length; j++) s += u[i] * A[i][j] * v[j]; return s; };

// ---------------- boundary groups (lifts carried through the flood fill) ----------------

/**
 * Generators of Stab_K(H_e) for the wall e = roots[j0], by flood-filling the
 * lift of H_e through framed tile 0 with actual matrices. Returns BigInt
 * matrices in lattice coordinates (acting on ℤ^m, fixing e).
 */
export function boundaryGenerators(P, cover, j0, maxGens = 20000) {
    const { A, m } = P;
    const { canon, canonSym, ridgeNbrs, applyWord, refl, symNon } = cover;
    const S = refl.map(M => M.map(r => r.map(big)));
    const SymM = symNon.map(s => s.mat.map(r => r.map(big)));
    const { adj, det } = adjugateB(A);
    const AB = A.map(r => r.map(big));
    const inv = W => matMulB(matMulB(adj, transpose(W)), AB).map(r => r.map(x => x / det));
    const I = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? 1n : 0n)));
    const wordMat = new Map();
    const ridgeMat = (j, l, word) => {
        const kk = j * 1000 + l;
        if (!wordMat.has(kk)) wordMat.set(kk, word.reduce((M, s) => matMulB(M, S[s]), I));
        return wordMat.get(kk);
    };
    const liftC = new Map();                       // canonical half-face → canonical lift
    const canonLift = (g, j, W) => { const t = canonSym(g, j); return t < 0 ? W : matMulB(W, SymM[t]); };
    const gens = new Map();
    const queue = [[0, j0, I]];
    liftC.set(canon(0, j0), canonLift(0, j0, I));
    for (let qi = 0; qi < queue.length && gens.size < maxGens; qi++) {
        const [g, j, W] = queue[qi];
        for (const { l, word, t } of ridgeNbrs[j]) {
            const g2 = applyWord(g, word);
            const W2 = matMulB(W, ridgeMat(j, l, word));
            const h = canon(g2, t);
            const Wc = canonLift(g2, t, W2);
            const old = liftC.get(h);
            if (!old) { liftC.set(h, Wc); queue.push([g2, t, W2]); continue; }
            const kk = matMulB(old, inv(Wc));
            if (kk.every((r, a) => r.every((x, b) => x === (a === b ? 1n : 0n)))) continue;
            const key = kk.flat().join(',');
            const keyInv = inv(kk).flat().join(',');
            if (!gens.has(key) && !gens.has(keyInv)) gens.set(key, kk);
        }
    }
    if (gens.size >= maxGens) throw new Error('boundary group: too many generators');
    return [...gens.values()];
}

// ---------------- homology of the pieces ----------------

/**
 * Ranks of H₁(piece; F_p) from the dual cell complex of the tiling: one
 * vertex per tile, one edge per uncut face, one 2-cell per ridge whose whole
 * link avoids the cut (its 2m faces form a relation). Each piece deformation
 * retracts, away from its codimension-3 skeleton, onto this complex, so
 *      dim H₁(piece; F_p) = E − V + 1 − rank_p ∂₂.
 * Over ℚ (a large prime) this is b₁; at p = 2, 3 the excess over b₁ counts
 * the p-torsion of H₁(piece; ℤ).
 */
export function pieceHomology(P, cover, primes = [2, 3, 67108859], budgetMs = 6000) {
    const { k, coxM } = P;
    const { G, ngen, order, canon, opposite, sigmaComp, pieceOf, nSym, symNon, permInv } = cover;
    const R = G.R;
    const NONE = 0x7fffffff;
    const t0 = Date.now();
    // tiles: canonical framed element of each Sym-orbit
    const tileOf = new Int32Array(order);
    for (let g = 0; g < order; g++) {
        let m = g;
        for (let t = 0; t < symNon.length; t++) { const h = R[g * ngen + k + t]; if (h < m) m = h; }
        tileOf[g] = m;
    }
    // edges: canonical uncut faces, oriented from the smaller canonical half-face
    const edgeId = new Map();
    const pieces = cover.pieces.map(() => ({ V: 0, E: 0, cols: [] }));
    for (let g = 0; g < order; g++) if (tileOf[g] === g) pieces[pieceOf[g]].V++;
    const edgeOf = (g, j) => {
        const h = canon(g, j);
        if (sigmaComp[h] !== NONE) return null;
        const ho = opposite(g, j);
        const key = Math.min(h, ho);
        let id = edgeId.get(key);
        if (id === undefined) { id = edgeId.size; edgeId.set(key, id); pieces[pieceOf[g]].E++; }
        return { id, sign: h === key ? 1 : -1 };
    };
    for (let g = 0; g < order; g++) for (let j = 0; j < k; j++) edgeOf(g, j);
    // 2-cells: ridges (g; j, l) up to the dihedral group and Sym, with no cut face in the link
    const seenRidge = new Set();
    for (let g = 0; g < order; g++) {
        for (let j = 0; j < k; j++) for (let l = j + 1; l < k; l++) {
            const mm = coxM[j][l];
            if (!(mm >= 2 && mm !== Infinity)) continue;
            // walk the link; canonical key = min over the 2m framed chambers and Sym relabellings
            let c = g, ok = true, keyMin = Infinity;
            const col = new Map();
            for (let i = 0; i < 2 * mm; i++) {
                const w = i % 2 === 0 ? l : j;
                const e = edgeOf(c, w);
                if (!e) { ok = false; break; }
                col.set(e.id, (col.get(e.id) || 0) + e.sign);
                const ck = c * k * k + Math.min(j, l) * k + Math.max(j, l);
                if (ck < keyMin) keyMin = ck;
                for (let t = 0; t < symNon.length; t++) {
                    const cs = R[c * ngen + k + t];
                    const a = permInv[t][j], b = permInv[t][l];
                    const kk = cs * k * k + Math.min(a, b) * k + Math.max(a, b);
                    if (kk < keyMin) keyMin = kk;
                }
                c = R[c * ngen + w];
            }
            if (!ok || seenRidge.has(keyMin)) continue;
            seenRidge.add(keyMin);
            const entries = [...col.entries()].filter(([, v]) => v !== 0);
            if (entries.length) pieces[pieceOf[g]].cols.push(entries);
        }
        if ((g & 1023) === 0 && Date.now() - t0 > budgetMs) return null;
    }
    // rank of ∂₂ mod p: sparse elimination, always pivoting in a shortest row on its least-used column
    const rankMod = (cols, p) => {
        const rows = cols.map(c => {
            const v = new Map();
            for (const [e, x] of c) { const y = ((x % p) + p) % p; if (y) v.set(e, y); }
            return v;
        });
        const colRows = new Map();
        rows.forEach((r, i) => { for (const e of r.keys()) { let s = colRows.get(e); if (!s) colRows.set(e, s = new Set()); s.add(i); } });
        const MAXB = 64;
        const buckets = Array.from({ length: MAXB + 1 }, () => new Set());
        const where = new Int32Array(rows.length);
        const place = i => { const b = Math.min(rows[i].size, MAXB); where[i] = b; buckets[b].add(i); };
        rows.forEach((_, i) => place(i));
        const alive = new Uint8Array(rows.length).fill(1);
        let rank = 0, left = rows.length, steps = 0;
        const inv = a => { let r = 1, b = a % p, e = p - 2; while (e > 0) { if (e & 1) r = mulmod(r, b, p); b = mulmod(b, b, p); e = Math.floor(e / 2); } return r; };
        while (left) {
            let i = -1;
            for (let b = 0; b <= MAXB && i < 0; b++) for (const x of buckets[b]) { i = x; break; }
            if (i < 0) break;
            buckets[where[i]].delete(i); alive[i] = 0; left--;
            const r = rows[i];
            if (!r.size) continue;
            let c = -1, best = Infinity;
            for (const e of r.keys()) { const n = colRows.get(e).size; if (n < best) { best = n; c = e; } }
            rank++;
            const s = inv(r.get(c));
            for (const e of r.keys()) colRows.get(e).delete(i);
            for (const i2 of [...colRows.get(c)]) {
                const r2 = rows[i2];
                const f = mulmod(r2.get(c), s, p);
                buckets[where[i2]].delete(i2);
                for (const [e, x] of r) {
                    const y = (((r2.get(e) || 0) - mulmod(f, x, p)) % p + p) % p;
                    const had = r2.has(e);
                    if (y) { r2.set(e, y); if (!had) colRows.get(e).add(i2); }
                    else if (had) { r2.delete(e); colRows.get(e).delete(i2); }
                }
                place(i2);
            }
            colRows.delete(c);
            if ((++steps & 255) === 0 && Date.now() - t0 > budgetMs) return null;
        }
        return rank;
    };
    const out = [];
    for (const pc of pieces) {
        const res = { V: pc.V, E: pc.E, F: pc.cols.length, dims: {} };
        for (const p of primes) {
            const r = rankMod(pc.cols, p);
            if (r === null) return null;
            res.dims[p] = pc.E - pc.V + 1 - r;
        }
        const big = primes[primes.length - 1];
        res.b1 = res.dims[big];
        res.torsion = primes.slice(0, -1).map(p => [p, res.dims[p] - res.b1]).filter(([, r]) => r > 0);
        out.push(res);
    }
    void nSym;
    return out;
}

function mulmod(a, b, p) {
    if (p < 94906265) return (a * b) % p;            // a·b < 2^53
    return Number((BigInt(a) * BigInt(b)) % BigInt(p));
}
