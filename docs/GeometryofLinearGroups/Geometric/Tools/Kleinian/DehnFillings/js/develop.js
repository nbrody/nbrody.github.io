// develop.js — the developing map: tetrahedra placed in H³ (vertices in CP¹), the
// face pairings (holonomy) as SL₂ℂ matrices, π₁ words, and the cusp pictures.
//
// The shape of edge {a, b} of a tetrahedron with vertices v₀…v₃ is the cross ratio
//   z_ab = (v_d − v_b)(v_c − v_a) / ((v_c − v_b)(v_d − v_a))    for (a, b, c, d) even,
// so with v₀ = ∞, v₁ = 0, v₂ = 1 the fourth vertex is v₃ = z (the shape on edge 01).

import {
    C, ONE, ZERO, INF, pt, delta, mul, sub, add, div, neg, scale, abs, exp,
    mmul, madj, mobiusFrom3, mapply, IDENT, msl2, affine, normPt,
} from './complex.js';
import { EDGE_TYPE } from './triangulation.js';

// An even permutation (a, b, c, d) ending in each vertex d.
const EVEN_ENDING = [[1, 3, 2, 0], [0, 2, 3, 1], [0, 3, 1, 2], [0, 1, 2, 3]];

/** The shape on edge {a, b} for a tetrahedron of shape z. */
export function edgeShape(z, a, b) {
    const t = EDGE_TYPE[a][b];
    if (t === 0) return z;
    if (t === 1) return div(ONE, sub(ONE, z));
    return sub(ONE, div(ONE, z));
}

/** Given three vertices of a tetrahedron of shape z (P[k] unknown), the fourth. */
export function fourthVertex(P, k, z) {
    const [a, b, c] = EVEN_ENDING[k];
    const zab = edgeShape(z, a, b);
    const K1 = delta(P[c], P[a]), K2 = delta(P[c], P[b]);
    const x = sub(mul(P[b][0], K1), mul(mul(zab, K2), P[a][0]));
    const y = sub(mul(P[b][1], K1), mul(mul(zab, K2), P[a][1]));
    return normPt([x, y]);
}

/** Place tetrahedron u from the placement P of its neighbor t across face f. */
export function placeAcross(tri, z, t, f, P) {
    const T = tri.tets[t];
    const u = T.nbr[f], s = T.glu[f];
    const Q = new Array(4);
    for (let i = 0; i < 4; i++) if (i !== f) Q[s[i]] = P[i];
    Q[s[f]] = fourthVertex(Q, s[f], z[u]);
    return { u, Q };
}

/** The standard placement of a tetrahedron of shape z with vertex v at ∞. */
export function standardPlacement(z, v = 0) {
    const others = [0, 1, 2, 3].filter((x) => x !== v);
    const P = new Array(4);
    P[v] = INF;
    P[others[0]] = pt(ZERO);
    P[others[1]] = pt(ONE);
    P[others[2]] = fourthVertex(P, others[2], z);
    return P;
}

/**
 * Develop the tetrahedra along SnapPy's maximal tree (faces with generator 0), the root
 * with vertex 0 at ∞, 1 at 0 and 2 at 1. Returns the placements, the BFS order (with
 * the parent face of each tetrahedron) and the face-pairing generators g₁ … g_N.
 *
 * Convention (checked against SnapPy in the tests): for a face f of t with generator +k,
 * g_k is the Möbius map carrying the placed neighbor's face onto face f of t, so the
 * neighbor of the developed domain across that face is g_k(placed neighbor).
 */
export function developTets(tri, z) {
    const n = tri.n;
    const P = new Array(n).fill(null);
    const order = [{ tet: tri.root, parent: -1, face: -1 }];
    P[tri.root] = standardPlacement(z[tri.root], 0);
    for (let i = 0; i < order.length; i++) {
        const t = order[i].tet;
        for (let f = 0; f < 4; f++) {
            if (tri.tets[t].gen[f] !== 0) continue;
            const { u, Q } = placeAcross(tri, z, t, f, P[t]);
            if (P[u]) continue;
            P[u] = Q;
            order.push({ tet: u, parent: t, face: f, face2: tri.tets[t].glu[f][f] });
        }
    }
    if (P.some((x) => !x)) throw new Error('the maximal tree does not reach every tetrahedron');
    const gens = new Array(tri.nOrig + 1).fill(null);
    for (let t = 0; t < n; t++) {
        for (let f = 0; f < 4; f++) {
            const g = tri.tets[t].gen[f];
            if (g <= 0) continue;
            const { u, Q } = placeAcross(tri, z, t, f, P[t]);
            const s = tri.tets[t].glu[f];
            const face = [0, 1, 2, 3].filter((i) => i !== f);
            // g maps P[u] (actual) onto Q (developed across face f of t)
            gens[g] = mobiusFrom3(face.map((i) => P[u][s[i]]), face.map((i) => Q[s[i]]));
        }
    }
    return { P, order, gens };
}

/** Evaluate a word (a = generator 1, A = its inverse, …) on a list of matrices indexed 1…N. */
export function evalWord(word, gens) {
    let M = IDENT;
    for (const ch of word) {
        const lower = ch.toLowerCase();
        const k = lower.charCodeAt(0) - 96;
        const G = gens[k];
        if (!G) throw new Error(`no generator ${ch}`);
        M = mmul(M, ch === lower ? G : madj(G));
    }
    return M;
}

/** The holonomy representation: original generators, simplified generators, peripheral elements. */
export function holonomy(tri, z) {
    const dev = developTets(tri, z);
    const pres = tri.entry.pres;
    const simple = [null, ...pres.inOrig.map((w) => evalWord(w, dev.gens))];
    const periph = pres.periph.map(([m, l]) => ({ m: evalWord(m, simple), l: evalWord(l, simple) }));
    return { ...dev, simple, periph };
}

// ---------------- cusp pictures ----------------

/**
 * Develop the vertex triangles of cusp k in C (the view from the cusp at ∞): each (t, v)
 * is a placement of tetrahedron t with v at ∞, laid out along a spanning tree of the
 * cusp triangulation. Returns the triangles, the deck similarities across non-tree
 * sides, and the holonomies of the meridian and longitude as similarities z ↦ a z + b.
 */
export function developCusp(tri, z, k) {
    const tris = tri.cuspTriangles(k);
    const key = (t, v) => 4 * t + v;
    const place = new Map();
    const [t0, v0] = tris[0];
    place.set(key(t0, v0), standardPlacement(z[t0], v0));
    const queue = [[t0, v0]];
    const deck = new Map();         // key(t,v)*4+f → similarity [a, b] for the crossing (t,v) → neighbor across f
    for (let i = 0; i < queue.length; i++) {
        const [t, v] = queue[i];
        const P = place.get(key(t, v));
        for (let f = 0; f < 4; f++) {
            if (f === v) continue;
            const { u, Q } = placeAcross(tri, z, t, f, P);
            const s = tri.tets[t].glu[f];
            const v2 = s[v];
            const kk = key(u, v2);
            if (!place.has(kk)) {
                place.set(kk, Q);
                queue.push([u, v2]);
                deck.set(key(t, v) * 4 + f, null);          // tree side
                deck.set(kk * 4 + s[f], null);
                continue;
            }
            if (deck.has(key(t, v) * 4 + f)) continue;
            const Pu = place.get(kk);
            const face = [0, 1, 2, 3].filter((i) => i !== f && i !== v);
            // similarity h with h(Pu) = Q on the two finite vertices of the shared side
            const p1 = affine(Pu[s[face[0]]]), p2 = affine(Pu[s[face[1]]]);
            const q1 = affine(Q[s[face[0]]]), q2 = affine(Q[s[face[1]]]);
            const a = div(sub(q2, q1), sub(p2, p1));
            const b = sub(q1, mul(a, p1));
            deck.set(key(t, v) * 4 + f, [a, b]);
            deck.set(kk * 4 + s[f], invSim([a, b]));
        }
    }
    const triangles = [...place.entries()].map(([kk, P]) => {
        const t = kk >> 2, v = kk & 3;
        const others = [0, 1, 2, 3].filter((x) => x !== v);
        return { tet: t, vertex: v, corners: others.map((i) => affine(P[i])), labels: others };
    });
    const curveHol = (field) => {
        let h = [ONE, ZERO];
        for (const [t, v] of tris) {
            const data = tri.tets[t][field];
            for (let f = 0; f < 4; f++) {
                if (f === v) continue;
                const c = data[4 * v + f];
                if (c <= 0) continue;
                const d = deck.get(key(t, v) * 4 + f);
                if (!d) continue;
                h = composeSim(h, powSim(d, -c));
            }
        }
        return h;
    };
    return { triangles, deck, meridian: curveHol('m'), longitude: curveHol('l') };
}

// similarities [a, b]: z ↦ a z + b
export const applySim = ([a, b], w) => add(mul(a, w), b);
export const composeSim = ([a1, b1], [a2, b2]) => [mul(a1, a2), add(mul(a1, b2), b1)];
export const invSim = ([a, b]) => { const ai = div(ONE, a); return [ai, neg(mul(ai, b))]; };
export function powSim(h, k) {
    let R = [ONE, ZERO], B = k < 0 ? invSim(h) : h;
    for (let e = Math.abs(k); e > 0; e >>= 1) {
        if (e & 1) R = composeSim(R, B);
        B = composeSim(B, B);
    }
    return R;
}
/** The fixed point of a similarity that is not a translation. */
export const simFixed = ([a, b]) => div(b, sub(ONE, a));

export { msl2, mapply, exp, scale, abs };
