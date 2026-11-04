// surface.js — the closed surface S_g as the regular hyperbolic 4g-gon D with angles 2π/4g,
// sides 4k ↔ 4k+2 and 4k+1 ↔ 4k+3 glued (boundary word a₁b₁a₁⁻¹b₁⁻¹⋯).
// Side i has its midpoint in direction θ_i = 2πi/4g at distance r_m, cosh r_m = cot(π/4g),
// and outward normal n_i, so D = {x : <x, n_i> ≤ 0 for all i}.
// Exiting D through side i enters the tile g_i(D); the letter of side i names g_i.
// Letters are ±1..±2g: letter 2k+1 is g_{4k} (=: a_{k+1}), letter 2k+2 is g_{4k+1} (=: b_{k+1}),
// and the paired sides carry the inverse letters.
import { dot, mmul, mapply, minv, rot, translate, I3, normPoint, ORIGIN, frame, expMap, dist, distNear, mdist } from './hyp.js';

export const TOL = 1e-12;

export function freeReduce(w) {
    const out = [];
    for (const x of w) {
        if (out.length && out[out.length - 1] === -x) out.pop();
        else out.push(x);
    }
    return out;
}
export const inverseWord = w => w.slice().reverse().map(x => -x);

export class Surface {
    constructor(g) {
        this.g = g;
        const n = this.n = 4 * g;
        this.rm = Math.acosh(1 / Math.tan(Math.PI / n));
        this.R = Math.acosh(1 / Math.tan(Math.PI / n) ** 2);
        this.theta = Array.from({ length: n }, (_, i) => 2 * Math.PI * i / n);
        const ch = Math.cosh(this.rm), sh = Math.sinh(this.rm);
        this.normals = this.theta.map(t => [ch * Math.cos(t), ch * Math.sin(t), sh]);
        // vertex i sits between side i and side i+1
        this.vertices = this.theta.map(t => {
            const a = t + Math.PI / n, r = this.R;
            return [Math.sinh(r) * Math.cos(a), Math.sinh(r) * Math.sin(a), Math.cosh(r)];
        });
        this.midpoints = this.theta.map(t => [sh * Math.cos(t), sh * Math.sin(t), ch]);
        this.partner = new Array(n);
        this.sideLetter = new Array(n);
        for (let k = 0; k < g; k++) {
            this.partner[4 * k] = 4 * k + 2; this.partner[4 * k + 2] = 4 * k;
            this.partner[4 * k + 1] = 4 * k + 3; this.partner[4 * k + 3] = 4 * k + 1;
            this.sideLetter[4 * k] = 2 * k + 1; this.sideLetter[4 * k + 2] = -(2 * k + 1);
            this.sideLetter[4 * k + 1] = 2 * k + 2; this.sideLetter[4 * k + 3] = -(2 * k + 2);
        }
        // g_i = (translate along θ_i by 2r_m) ∘ (rotation taking side partner(i) to side i+2g)
        this.sideMat = new Array(n);
        this.sideMatInv = new Array(n);
        for (let i = 0; i < n; i++) {
            const j = this.partner[i];
            const M = mmul(translate(this.theta[i], 2 * this.rm), rot(this.theta[(i + 2 * g) % n] - this.theta[j]));
            this.sideMat[i] = M;
            this.sideMatInv[i] = minv(M);
        }
        this.letterSide = {};
        this.gen = {};
        for (let i = 0; i < n; i++) {
            this.letterSide[this.sideLetter[i]] = i;
            this.gen[this.sideLetter[i]] = this.sideMat[i];
        }
        this._cache = new Map();
        this.relator = this.vertexRelator();
    }

    letterName(L) {
        const k = Math.ceil(Math.abs(L) / 2);
        return { base: (Math.abs(L) % 2 ? 'a' : 'b'), k, inv: L < 0 };
    }

    wordMatrix(w) {
        if (!w || !w.length) return null;
        if (w.length === 1) return this.gen[w[0]];
        const key = w.join(',');
        let M = this._cache.get(key);
        if (M) return M;
        M = this.gen[w[0]];
        for (let i = 1; i < w.length; i++) M = mmul(M, this.gen[w[i]]);
        if (this._cache.size > 20000) this._cache.clear();
        this._cache.set(key, M);
        return M;
    }
    apply(w, p) { const M = this.wordMatrix(w); return M ? mapply(M, p) : p; }

    // the most violated side, or -1 if p ∈ D
    outside(p, tol = TOL) {
        let best = -1, bv = tol;
        for (let i = 0; i < this.n; i++) {
            const v = dot(p, this.normals[i]);
            if (v > bv) { bv = v; best = i; }
        }
        return best;
    }

    // p = M(word) · q with q ∈ D
    reduce(p) {
        let q = p;
        const word = [];
        for (let it = 0; it < 200; it++) {
            const s = this.outside(q);
            if (s < 0) break;
            q = normPoint(mapply(this.sideMatInv[s], q));
            word.push(this.sideLetter[s]);
        }
        return { p: q, word };
    }

    // Walk the geodesic segment from p ∈ D to q (in p's frame), crossing sides.
    // Returns the word of sides crossed and the pieces in D coordinates.
    clip(p, q, wantPieces = true) {
        const word = [], pieces = [];
        let a = p, b = q;
        for (let it = 0; it < 64; it++) {
            let best = -1, bl = Infinity;
            for (let i = 0; i < this.n; i++) {
                const n = this.normals[i];
                const fb = dot(b, n);
                if (fb <= TOL) continue;
                const fa = Math.min(0, dot(a, n));
                const l = fa / (fa - fb);
                if (l < bl) { bl = l; best = i; }
            }
            if (best < 0) { if (wantPieces) pieces.push([a, b]); break; }
            const l = Math.max(0, Math.min(1, bl));
            const x = normPoint([(1 - l) * a[0] + l * b[0], (1 - l) * a[1] + l * b[1], (1 - l) * a[2] + l * b[2]]);
            if (wantPieces) pieces.push([a, x]);
            const Mi = this.sideMatInv[best];
            a = normPoint(mapply(Mi, x));
            b = normPoint(mapply(Mi, b));
            word.push(this.sideLetter[best]);
        }
        return { word, pieces, end: b };
    }

    // the word read off by a small loop around vertex 0 (equal to 1 in π₁)
    vertexRelator() {
        const V = this.vertices[0];
        const T = (() => {           // a tangent at V
            const u = [-V[1], V[0], 0];
            const c = dot(u, V);
            const v = [u[0] + c * V[0], u[1] + c * V[1], u[2] + c * V[2]];
            const s = Math.sqrt(dot(v, v));
            return [v[0] / s, v[1] / s, v[2] / s];
        })();
        const F = frame(V, T);
        const ex = mapply(F, [1, 0, 0]), ey = mapply(F, [0, 1, 0]);
        const r = 0.02, m = 16 * this.n;
        const pt = phi => expMap(V, [Math.cos(phi) * ex[0] + Math.sin(phi) * ey[0],
            Math.cos(phi) * ex[1] + Math.sin(phi) * ey[1], Math.cos(phi) * ex[2] + Math.sin(phi) * ey[2]], r);
        // start at a sample inside D
        let k0 = 0;
        while (this.outside(pt(2 * Math.PI * k0 / m), -1e-9) >= 0 && k0 < m) k0++;
        let p = pt(2 * Math.PI * k0 / m);
        let W = [];
        for (let k = 1; k <= m; k++) {
            const qg = pt(2 * Math.PI * (k0 + k) / m);
            const M = this.wordMatrix(W);
            const ql = M ? normPoint(mapply(minv(M), qg)) : qg;
            const { word, end } = this.clip(p, ql, false);
            W = freeReduce(W.concat(word));
            p = end;
        }
        return W;
    }

    // tiles reachable in ≤ depth side crossings, deduplicated by their centers
    tiles(depth) {
        const key = 'tiles' + depth;
        if (this[key]) return this[key];
        const out = [{ word: [], M: I3(), c: ORIGIN }];
        let frontier = out.slice();
        for (let d = 0; d < depth; d++) {
            const next = [];
            for (const t of frontier)
                for (let i = 0; i < this.n; i++) {
                    const w = freeReduce(t.word.concat([this.sideLetter[i]]));
                    if (w.length <= t.word.length) continue;
                    const M = this.wordMatrix(w);
                    const c = mapply(M, ORIGIN);
                    if (out.some(o => dist(o.c, c) < 1e-6)) continue;
                    const tile = { word: w, M, c };
                    out.push(tile); next.push(tile);
                }
            frontier = next;
        }
        this[key] = out;
        return out;
    }

    // the tiles that touch D: all copies of D around each of its corners
    starTiles() {
        if (this._star) return this._star;
        const out = [{ word: [], M: I3(), c: ORIGIN }];
        for (const V of this.vertices) {
            const ring = [out[0]];
            for (let at = 0; at < ring.length; at++) {
                const t = ring[at];
                for (let i = 0; i < this.n; i++) {
                    const w = freeReduce(t.word.concat([this.sideLetter[i]]));
                    if (!w.length) continue;
                    const M = this.wordMatrix(w);
                    if (!this.vertices.some(U => distNear(normPoint(mapply(M, U)), V) < 1e-6)) continue;
                    const c = mapply(M, ORIGIN);
                    if (ring.some(o => distNear(o.c, c) < 1e-6)) continue;
                    ring.push({ word: w, M, c });
                }
            }
            for (const t of ring) if (!out.some(o => distNear(o.c, t.c) < 1e-6)) out.push(t);
        }
        this._star = out;
        return out;
    }
    // the word w for which M(w)·q is the copy of q nearest to p (p, q ∈ D, close on the surface)
    nearestLift(p, q) {
        const dq = dist(p, q);
        if (dq < 0.3) return [];
        let best = [], bd = dq;
        for (const t of this.starTiles()) {
            if (!t.word.length) continue;
            const d = dist(p, mapply(t.M, q));
            if (d < bd) { bd = d; best = t.word; if (d < 0.3) break; }
        }
        return best;
    }

    // the same group element? (matrices agree)
    sameElement(w1, w2) {
        const A = this.wordMatrix(w1) || I3(), B = this.wordMatrix(w2) || I3();
        return mdist(A, B) < 1e-7 * Math.max(1, Math.abs(A[8]));
    }
}
