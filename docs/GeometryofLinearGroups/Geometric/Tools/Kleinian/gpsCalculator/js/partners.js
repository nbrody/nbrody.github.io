// partners.js — search for chambers that glue to a given one.
//
// A chamber with a right-angled wall H has face F = H ∩ P, a fundamental
// polytope for the reflection group of the hyperplane lattice L = v^⊥ ∩ Λ.
// Candidates are the lattices L ⊕ ℤe with f(e) = a: Vinberg's algorithm runs
// from a point of e^⊥ (time-limited: most forms are not reflective), and a
// candidate counts if e is a right-angled wall whose face is congruent to F.
// Forms with a ≢ f(v) mod squares are incommensurable with the original one
// (their discriminants differ), so the glued polytope is non-arithmetic.

import { setupLattice } from './gps.js';
import { vinberg } from './vinberg.js';
import { buildPolytope } from './polytope.js';
import { describeForm, similarQ, squarefree } from './forms.js';
import { rightAngledWalls, hyperplaneGram, glueChambers } from './chamber.js';

const blockForm = (g, a) => {
    const n = g.length;
    return Array.from({ length: n + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i < n && j < n ? g[i][j] : i === n && j === n ? a : 0)));
};

const isDiag = (A) => A.every((r, i) => r.every((x, j) => i === j || x === 0));
export const formText = (A) => (isDiag(A) ? A.map((r, i) => r[i]).join(', ') : A.map((r) => r.join(' ')).join('; '));

/**
 * The chamber record of the form A with right-angled wall v (default: the last
 * coordinate vector), or { ok: false, why }.
 */
export function chamberOfForm(A, perFormMs, v = null, mode = 'given') {
    const m = A.length;
    const e = v || Array.from({ length: m }, (_, i) => (i === m - 1 ? 1 : 0));
    const L = setupLattice(A, e, v ? mode : 'given');
    const vb = vinberg(L.AL, L.p0, { wall: L.vL, deadline: Date.now() + perFormMs });
    if (!vb.ok) return { ok: false, why: /time limit/.test(vb.reason || '') ? 'not reflective (time limit)' : (vb.reason || 'Vinberg failed') };
    const P = buildPolytope(L.AL, vb.roots, vb.rays);
    const wall = vb.roots.findIndex((r) => r.join(',') === L.vL.join(','));
    if (wall < 0) return { ok: false, why: 'internal: e is not a wall' };
    if (!rightAngledWalls(P.coxM).includes(wall)) return { ok: false, why: 'e is not a right-angled wall', P };
    const face = [];
    for (let j = 0; j < P.k; j++) if (j !== wall && P.coxM[wall][j] === 2) face.push(j);
    const rec = {
        kind: 'gps-chamber', version: 1, n: P.n, A, AL: L.AL, formText: formText(A), vText: L.v.join(', '), latticeMode: L.mode,
        roots: P.roots, norms: P.norms, coxM: P.coxM, wall, face,
        verts: P.vertices.map((v) => ({ r: v.r, walls: v.walls, ideal: v.ideal })),
        volume: P.volume, compact: !P.vertices.some((v) => v.ideal),
        formInfo: describeForm(L.AL), hypInfo: describeForm(L.gH),
    };
    return { ok: true, rec };
}

/**
 * Search a = amin … amax. onResult({ a, ok, rec?, glue?, similar?, why? }) after each form.
 */
export function findPartners(chamber, { amin = 1, amax = 40, perFormMs = 2500, onResult = () => { }, shouldStop = () => false } = {}) {
    const v = chamber.roots[chamber.wall];
    const { gH } = hyperplaneGram(chamber.AL, v);
    const nv = chamber.norms[chamber.wall];
    for (let a = amin; a <= amax; a++) {
        if (shouldStop()) break;
        const A = blockForm(gH, a);
        let out;
        try {
            const c = chamberOfForm(A, perFormMs);
            if (!c.ok) out = { a, ok: false, why: c.why };
            else {
                const glue = glueChambers(chamber, c.rec);
                let similar = null;
                try { similar = similarQ(chamber.AL, c.rec.AL); } catch { /* invariants unavailable */ }
                out = { a, ok: glue.status === 'yes', rec: c.rec, glue: { status: glue.status, reason: glue.reason }, similar, sameClassMod: squarefree(a) === squarefree(nv) };
            }
        } catch (e) {
            out = { a, ok: false, why: e.message };
        }
        onResult(out);
    }
}
