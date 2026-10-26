// From the Voronoi tessellation to a presentation (K. S. Brown, "Presentations for groups acting on
// simply-connected complexes", 1984, in the form of a tessellation theorem).
//
// GL_d(O) acts on the open cone C° of positive definite forms modulo scaling, a contractible manifold,
// tiled by the Voronoi cells σ(P) ∩ C°. With cell representatives C_1 … C_h (stabilizers S_i, finite),
// a representative F of each S_i-orbit of facets of C_i, and g_F with C_i ∪ g_F C_j adjacent across F:
//   generators   the elements of the S_i, and y_F (↦ g_F),
//   relations    (A) the multiplication of each S_i,
//                (B1) h·g_F = g_F·h' for h ∈ S_i fixing F (h' = g_F⁻¹ h g_F ∈ S_j),
//                (B2) g_F · t · g_{F'} · r = 1 where F' represents g_F⁻¹F in C_j (t ∈ S_j, r ∈ S_i),
//                (C)  for each codimension-2 face meeting C°, the product of the transitions around it,
// present GL_d(O). Every relator is also checked as a matrix identity.
import { FormSpace, makeCell, cellInvariant, equivalences } from './voronoi.js';
import { dot } from './polyhedral.js';
import { enumerateGeneral } from '../../../../PresentationCalc/js/bianchi.js';

// ==================================================================== finite groups
/** A closed finite subgroup of GL_d(O) given by its elements: generators, words, Cayley relators. */
export function finiteGroup(space, elems) {
    const key = (g) => space.matKey(g);
    const idx = new Map(elems.map((g, i) => [key(g), i]));
    const idKey = key(space.identity());
    // greedy generators: prefer elements of large order, then early ones
    const order = (g) => { let p = g, k = 1; while (key(p) !== idKey) { p = space.matMul(p, g); k++; if (k > 10000) throw new Error('internal: element of infinite order in a stabilizer'); } return k; };
    const ords = elems.map(order);
    const cand = elems.map((_, i) => i).filter((i) => key(elems[i]) !== idKey).sort((a, b) => ords[b] - ords[a] || a - b);
    const gens = [];
    let closure = new Set([idKey]);
    const close = () => {
        const seen = new Set([idKey]); const queue = [space.identity()];
        while (queue.length) { const x = queue.pop(); for (const gi of gens) { const y = space.matMul(x, elems[gi]); const k = key(y); if (!seen.has(k)) { seen.add(k); queue.push(y); } } }
        return seen;
    };
    for (const i of cand) {
        if (closure.size === elems.length) break;
        if (closure.has(key(elems[i]))) continue;
        gens.push(i); closure = close();
    }
    if (closure.size !== elems.length) throw new Error('internal: stabilizer is not closed');
    // breadth-first words (positive letters 0 … gens.length−1)
    const words = new Array(elems.length).fill(null), parent = new Array(elems.length).fill(null);
    const id = idx.get(idKey);
    words[id] = [];
    const queue = [id];
    while (queue.length) {
        const a = queue.shift();
        gens.forEach((gi, x) => {
            const b = idx.get(key(space.matMul(elems[a], elems[gi])));
            if (words[b] === null) { words[b] = words[a].concat([x]); parent[b] = [a, x]; queue.push(b); }
        });
    }
    // Cayley-graph relators word(a)·x·word(a·x)⁻¹ (complete), shortest first; keep only as many as a
    // coset enumeration of the trivial subgroup needs to reach |S| cosets
    const cayley = [];
    for (let a = 0; a < elems.length; a++) gens.forEach((gi, x) => {
        const b = idx.get(key(space.matMul(elems[a], elems[gi])));
        if (parent[b] && parent[b][0] === a && parent[b][1] === x) return;
        cayley.push(words[a].map((y) => y + 1).concat([x + 1], words[b].slice().reverse().map((y) => -(y + 1))));
    });
    cayley.sort((u, v) => u.length - v.length);
    const relators = gens.map((gi, x) => new Array(ords[gi]).fill(x + 1));
    if (elems.length > 1) {
        const toTC = (w) => w.map((s) => (s > 0 ? 2 * (s - 1) : 2 * (-s - 1) + 1));
        let next = 0;
        for (;;) {
            const res = enumerateGeneral(gens.length, relators.map(toTC), [], { maxCosets: 40 * elems.length + 2000, seconds: 5 });
            if (res.index === elems.length) break;
            if (res.index !== undefined && res.index < elems.length) throw new Error('internal: stabilizer presentation collapses');
            if (next >= cayley.length) throw new Error('internal: stabilizer presentation');
            const L = cayley[next].length;
            while (next < cayley.length && (cayley[next].length <= L || next < 4)) relators.push(cayley[next++]);
        }
    }
    return { elems, idx, gens, words, relators, key, id, indexOf: (g) => idx.get(key(g)) };
}

/** indices of a generating set of the subgroup { s ∈ S : test(s) } (greedy) */
function subgroupGens(space, S, test) {
    const members = [];
    S.elems.forEach((_, si) => { if (si !== S.id && test(si)) members.push(si); });
    const gens = [];
    let closure = new Set([S.id]);
    for (const si of members) {
        if (closure.has(si)) continue;
        gens.push(si);
        const seen = new Set([S.id]), queue = [S.id];
        while (queue.length) { const a = queue.pop(); for (const g of gens) { const b = S.idx.get(S.key(space.matMul(S.elems[a], S.elems[g]))); if (!seen.has(b)) { seen.add(b); queue.push(b); } } }
        closure = seen;
    }
    return gens;
}

// ==================================================================== the Voronoi complex
/**
 * Cell orbit representatives with stabilizers, facet orbits and neighbors.
 * opts: { deadline, progress(msg), maxCells }
 */
export function voronoiComplex(space, { deadline = Infinity, progress = () => {}, maxCells = 2000 } = {}) {
    const K = space.nf;
    const cells = [];
    const byInv = new Map();
    const mus = K.mu.map((z) => space.scalar(z));
    const addCell = (alpha, mv) => {
        const cell = makeCell(space, alpha, mv, deadline);
        cell.index = cells.length;
        cell.inv = cellInvariant(space, cell);
        // stabilizer: the normalized equivalences times the roots of unity
        const E = equivalences(space, cell, cell);
        const elems = [], seen = new Set();
        for (const g of E) for (const z of mus) { const h = space.matMul(z, g), k = space.matKey(h); if (!seen.has(k)) { seen.add(k); elems.push(h); } }
        cell.stab = finiteGroup(space, elems);
        // action of the stabilizer on q-indices and facets
        const vecIndex = (v) => cell.mv.keyIndex.get(space.canon(v).key);
        cell.qOf = (v) => { const i = vecIndex(v); return i === undefined ? undefined : cell.mv.qidx[i]; };
        cell.facetKey = (set) => set.slice().sort((a, b) => a - b).join(',');
        cell.facetIndex = new Map(cell.facets.map((f, i) => [cell.facetKey(f.set), i]));
        cell.qVec = cell.vecsOfQ.map((list) => cell.mv.vecs[list[0]]);
        cell.qperm = elems.map((g) => cell.qVec.map((v) => cell.qOf(space.act(g, v))));
        cell.facetAct = (si, f) => cell.facetIndex.get(cell.facetKey(cell.facets[f].set.map((qi) => cell.qperm[si][qi])));
        // facet orbits under the stabilizer: rep[f] and the element s with f = s·rep
        cell.facetRep = new Array(cell.facets.length).fill(-1);
        cell.facetMover = new Array(cell.facets.length).fill(-1);
        cell.facetReps = [];
        cell.facets.forEach((f, fi) => {
            if (cell.facetRep[fi] >= 0 || !f.interior) return;
            cell.facetReps.push(fi);
            elems.forEach((_, si) => {
                const t = cell.facetAct(si, fi);
                if (cell.facetRep[t] < 0) { cell.facetRep[t] = fi; cell.facetMover[t] = si; }
            });
        });
        cell.neighbor = new Map();                       // rep facet → { to, g }
        cells.push(cell);
        if (!byInv.has(cell.inv)) byInv.set(cell.inv, []);
        byInv.get(cell.inv).push(cell);
        progress({ phase: 'cells', cells: cells.length, last: { vecs: mv.vecs.length, facets: cell.facets.length, stab: elems.length } });
        return cell;
    };
    progress({ phase: 'start' });
    const first = space.initialPerfect();
    addCell(first.alpha, first.mv);
    for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        for (const fi of cell.facetReps) {
            if (Date.now() > deadline) throw new Error('timeout: Voronoi enumeration');
            const nb = space.flip(cell.alpha, cell.m, cell.facets[fi].normal);
            const probe = makeCell(space, nb.alpha, nb.mv, deadline);
            const inv = cellInvariant(space, probe);
            let hit = null;
            for (const c of byInv.get(inv) || []) {
                const E = equivalences(space, c, probe, { firstOnly: true });
                if (E.length) { hit = { to: c.index, g: E[0] }; break; }
            }
            if (!hit) {
                if (cells.length >= maxCells) throw new Error(`more than ${maxCells} cell orbits`);
                const c = addCell(nb.alpha, nb.mv);
                hit = { to: c.index, g: space.identity() };
            }
            cell.neighbor.set(fi, hit);
        }
    }
    return { space, cells };
}

// ==================================================================== the presentation
/**
 * Brown's presentation of GL_d(O) from the complex. Letters 1 … L (Tietze convention), each with a
 * matrix; relators as arrays of ±letter. Also returns helpers: stabWord(i, s) and transition data.
 */
export function brownPresentation(complex, { deadline = Infinity } = {}) {
    const { space, cells } = complex;
    const letters = [];                                   // { kind: 'stab'|'edge', cell, ref, mat, label }
    const stabLetter = cells.map((c) => c.stab.gens.map((gi, x) => {
        letters.push({ kind: 'stab', cell: c.index, gen: x, mat: c.stab.elems[gi] });
        return letters.length;
    }));
    const edgeLetter = cells.map((c) => {
        const m = new Map();
        for (const fi of c.facetReps) {
            const nb = c.neighbor.get(fi);
            letters.push({ kind: 'edge', cell: c.index, facet: fi, to: nb.to, mat: nb.g });
            m.set(fi, letters.length);
        }
        return m;
    });
    const inv = (w) => w.slice().reverse().map((x) => -x);
    const W = (ci, si) => cells[ci].stab.words[si].map((x) => stabLetter[ci][x]);
    const Wm = (ci, g) => { const si = cells[ci].stab.indexOf(g); if (si === undefined) throw new Error('internal: element not in the stabilizer'); return W(ci, si); };
    const relators = [];
    const tags = [];
    const push = (w, tag) => { relators.push(w); tags.push(tag); };
    // (T) the tree of representatives: a cell first reached across F is the neighbor itself (g_F = 1)
    letters.forEach((L, i) => { if (L.kind === 'edge' && space.matKey(L.mat) === space.matKey(space.identity())) push([i + 1], 'tree'); });
    // (A) stabilizers
    cells.forEach((c, ci) => {
        for (const r of c.stab.relators) push(r.map((s) => Math.sign(s) * stabLetter[ci][Math.abs(s) - 1]), 'stabilizer');
    });
    // transitions: crossing facet f of cell i (any facet, not only reps)
    const transition = (ci, f) => {
        const c = cells[ci];
        const rep = c.facetRep[f], si = c.facetMover[f];
        const nb = c.neighbor.get(rep);
        return {
            word: W(ci, si).concat([edgeLetter[ci].get(rep)]),
            mat: space.matMul(c.stab.elems[si], nb.g),
            to: nb.to,
        };
    };
    // a facet of cell j given by vectors (in j's frame)
    const facetOfVectors = (cj, vs) => {
        const set = vs.map((v) => cj.qOf(v));
        if (set.some((x) => x === undefined)) return -1;
        const fi = cj.facetIndex.get(cj.facetKey([...new Set(set)]));
        return fi === undefined ? -1 : fi;
    };
    const facetVectors = (c, fi) => c.facets[fi].set.map((qi) => c.qVec[qi]);
    // (B1), (B2)
    cells.forEach((c, ci) => {
        for (const fi of c.facetReps) {
            const nb = c.neighbor.get(fi), cj = cells[nb.to], y = edgeLetter[ci].get(fi);
            const gInv = space.matInv(nb.g);
            for (const si of subgroupGens(space, c.stab, (sj) => c.facetAct(sj, fi) === fi)) {
                const h2 = space.matMul(space.matMul(gInv, c.stab.elems[si]), nb.g);
                push(W(ci, si).concat([y], inv(Wm(nb.to, h2)), [-y]), 'edge stabilizer');
            }
            const back = facetOfVectors(cj, facetVectors(c, fi).map((v) => space.act(gInv, v)));
            if (back < 0) throw new Error('internal: the neighbor does not share the facet');
            const tr = transition(nb.to, back);
            if (tr.to !== ci) throw new Error('internal: facet pairing is inconsistent');
            // g_F · (t g_{F'}) · r = 1 with r ∈ S_i
            const r = space.matInv(space.matMul(nb.g, tr.mat));
            push([y].concat(tr.word, Wm(ci, r)), 'edge pairing');
        }
    });
    // (C) cycles around codimension-2 faces
    const seen = new Set();
    const ridgeKey = (c, set) => {
        let best = null;
        for (let si = 0; si < c.stab.elems.length; si++) {
            const k = set.map((qi) => c.qperm[si][qi]).sort((a, b) => a - b).join(',');
            if (best === null || k < best) best = k;
        }
        return `${c.index}:${best}`;
    };
    cells.forEach((c, ci) => {
        for (const R of c.ridges) {
            if (!R.interior) continue;
            if (seen.has(ridgeKey(c, R.set))) continue;
            if (Date.now() > deadline) throw new Error('timeout: ridge cycles');
            let cj = c, Rv = R.set.map((qi) => c.qVec[qi]), f = R.facets[0];
            let h = space.identity(), word = [];
            for (let step = 0; ; step++) {
                if (step > 5000) throw new Error('internal: a ridge cycle does not close');
                seen.add(ridgeKey(cj, Rv.map((v) => cj.qOf(v))));
                const tr = transition(cj.index, f);
                const fv = facetVectors(cj, f);
                const eInv = space.matInv(tr.mat);
                word = word.concat(tr.word);
                h = space.matMul(h, tr.mat);
                const nj = cells[tr.to];
                const Rn = Rv.map((v) => space.act(eInv, v));
                const back = facetOfVectors(nj, fv.map((v) => space.act(eInv, v)));
                const Rset = new Set(Rn.map((v) => nj.qOf(v)));
                if (back < 0 || Rset.has(undefined)) throw new Error('internal: ridge walk left the complex');
                const others = [];
                nj.facets.forEach((F, k) => { if (k !== back && [...Rset].every((qi) => F.set.includes(qi))) others.push(k); });
                if (others.length !== 1) throw new Error(`internal: a ridge lies in ${others.length + 1} facets`);
                cj = nj; Rv = Rn; f = others[0];
                if (cj.index === ci && c.stab.indexOf(h) !== undefined) {
                    // back at C_i with the same facet as at the start?
                    push(word.concat(inv(Wm(ci, h))), 'ridge cycle');
                    break;
                }
            }
        }
    });
    return { letters, relators, tags, W, Wm, transition, stabLetter, edgeLetter };
}

/** Evaluate a word in the letters as a matrix */
export function evalWord(space, letters, w) {
    let g = space.identity();
    const invs = new Map();
    for (const x of w) {
        const L = letters[Math.abs(x) - 1];
        let m = L.mat;
        if (x < 0) { if (!invs.has(x)) invs.set(x, space.matInv(m)); m = invs.get(x); }
        g = space.matMul(g, m);
    }
    return g;
}

// ==================================================================== words for matrices
/**
 * A word in the letters for g ∈ GL_d(O): walk along a segment from a point inside C_0 to a point
 * inside g·C_0, crossing facets. Returns the word (verified).
 */
export function wordFor(complex, pres, g, { rng = Math.random, maxSteps = 200000 } = {}) {
    const { space, cells } = complex;
    const F = space.F;
    const c0 = cells[0];
    const weights = () => c0.qVec.map(() => F.fromBig(BigInt(1 + Math.floor(rng() * 997))));
    for (let attempt = 0; attempt < 6; attempt++) {
        const la = weights(), lb = weights();
        const pts = c0.qVec;
        const gpts = pts.map((v) => space.act(g, v));
        let h = space.identity(), cj = c0, tcur = F.zero, word = [];
        let stuck = 0, ok = false;
        for (let step = 0; step < maxSteps; step++) {
            const hi = space.matInv(h);
            const comb = (lam, vs) => { let s = new Array(space.N).fill(F.zero); vs.forEach((v, i) => { const qv = space.q(space.act(hi, v)); s = s.map((x, t) => F.add(x, F.mul(lam[i], qv[t]))); }); return s; };
            const A = comb(la, pts), B = comb(lb, gpts);
            let best = null;
            cj.facets.forEach((fa, k) => {
                const va = dot(F, fa.normal, A), vb = dot(F, fa.normal, B);
                if (F.sign(F.sub(va, vb)) <= 0) return;                    // not decreasing along the segment
                const t = F.div(va, F.sub(va, vb));
                if (F.sign(F.sub(t, tcur)) < 0) return;
                if (!best || F.sign(F.sub(t, best.t)) < 0) best = { t, k };
            });
            if (!best || F.sign(F.sub(best.t, F.one)) >= 0) { ok = true; break; }
            if (F.eq(best.t, tcur)) { if (++stuck > 50) break; } else stuck = 0;
            const tr = pres.transition(cj.index, best.k);
            word = word.concat(tr.word);
            h = space.matMul(h, tr.mat);
            cj = cells[tr.to];
            tcur = best.t;
        }
        if (!ok) continue;
        if (cj.index !== 0) continue;
        const s = space.matMul(space.matInv(h), g);
        const si = c0.stab.indexOf(s);
        if (si === undefined) continue;
        word = word.concat(pres.W(0, si));
        const check = evalWord(space, pres.letters, word);
        if (space.matKey(check) !== space.matKey(g)) throw new Error('internal: the walk word does not evaluate to g');
        return word;
    }
    throw new Error('the walk did not reach the target');
}
