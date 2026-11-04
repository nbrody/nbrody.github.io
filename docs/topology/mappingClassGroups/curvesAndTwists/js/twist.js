// twist.js — crossings of curves, Dehn twists by surgery, and equality of geodesics.
// T_c(γ): at each crossing of γ with the simple curve c, γ turns left onto c, runs once
// around it and carries on; then the flow pulls the result tight. This is exact on the
// level of homotopy classes for any γ transverse to an embedded c.
import { dot, lcross, normSpace, logUnit, expMap, toKlein, fromKlein, normPoint } from './hyp.js';
import { freeReduce, inverseWord } from './surface.js';
import { Curve } from './curve.js';

const GRID = 48;

function bucket(pieces) {
    const cells = new Map();
    pieces.forEach((pc, i) => {
        const a = toKlein(pc.a), b = toKlein(pc.b);
        pc.ka = a; pc.kb = b;
        const x0 = Math.floor((Math.min(a[0], b[0]) + 1) * GRID / 2), x1 = Math.floor((Math.max(a[0], b[0]) + 1) * GRID / 2);
        const y0 = Math.floor((Math.min(a[1], b[1]) + 1) * GRID / 2), y1 = Math.floor((Math.max(a[1], b[1]) + 1) * GRID / 2);
        pc.box = [x0, x1, y0, y1];
        for (let x = x0; x <= x1; x++)
            for (let y = y0; y <= y1; y++) {
                const key = x * 4096 + y;
                let list = cells.get(key);
                if (!list) cells.set(key, list = []);
                list.push(i);
            }
    });
    return cells;
}

// proper crossing of Klein segments, parameters in [0, 1) on both
function segX(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-18) return null;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const s = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    if (s < 0 || s >= 1 || u < 0 || u >= 1) return null;
    return { s, u, x: [a[0] + s * rx, a[1] + s * ry] };
}

function dirAt(X, pc) {
    const f = logUnit(X, pc.b), g = logUnit(X, pc.a);
    if (f.d > g.d) return f.u;
    return [-g.u[0], -g.u[1], -g.u[2]];
}

// all crossings of A with B (B may be A for self-crossings, each counted twice)
export function crossings(A, B) {
    const pa = A.pieces(), pb = B === A ? pa : B.pieces();
    const cells = bucket(pb);
    if (B !== A) bucket(pa);
    const out = [];
    const seen = new Set();
    pa.forEach((p, i) => {
        const [x0, x1, y0, y1] = p.box;
        seen.clear();
        for (let x = x0; x <= x1; x++)
            for (let y = y0; y <= y1; y++) {
                const list = cells.get(x * 4096 + y);
                if (!list) continue;
                for (const j of list) {
                    if (seen.has(j)) continue;
                    seen.add(j);
                    if (B === A && i === j) continue;
                    const q = pb[j];
                    const hit = segX(p.ka, p.kb, q.ka, q.kb);
                    if (!hit) continue;
                    const X = fromKlein(hit.x[0], hit.x[1]);
                    out.push({ i, j, s: hit.s, u: hit.u, X, pa: p, pb: q, tA: dirAt(X, p), tB: dirAt(X, q) });
                }
            }
    });
    return out;
}

export const intersectionNumber = (A, B) => crossings(A, B).length;
export const selfCrossings = A => crossings(A, A).length / 2;
// algebraic intersection: + when B crosses A from right to left
export function algebraicIntersection(A, B) {
    let s = 0;
    for (const x of crossings(A, B)) s += dot(lcross(x.X, x.tA), x.tB) > 0 ? 1 : -1;
    return s;
}

// T_c^sign(γ) as an unrelaxed curve (sign = +1: left twist)
export function surgery(gamma, c, sign = 1, eps = 0.012) {
    const S = gamma.S;
    const xs = crossings(gamma, c);
    if (!xs.length) return gamma.clone();
    const K = c.n;
    // c's left normals at its vertices
    const Nc = c.P.map((p, k) => {
        const la = logUnit(p, c.prevPt(k)), lb = logUnit(p, c.nextPt(k));
        return normSpace(lcross(p, normSpace([lb.u[0] - la.u[0], lb.u[1] - la.u[1], lb.u[2] - la.u[2]])));
    });
    const byEdge = new Map();
    for (const x of xs) {
        const k = x.pa.k;
        if (!byEdge.has(k)) byEdge.set(k, []);
        byEdge.get(k).push(x);
    }
    // order along each edge: pieces come in order, then by the parameter
    const order = new Map(gamma.pieces().map((p, i) => [p, i]));
    for (const list of byEdge.values()) list.sort((x, y) => (order.get(x.pa) - order.get(y.pa)) || (x.s - y.s));

    const P = [], W = [];
    const push = (p, w) => { if (W.length) W[W.length - 1] = freeReduce(W[W.length - 1].concat(w)); P.push(p); W.push([]); };
    // W[last] collects the word from the last vertex pushed to the next one
    for (let k = 0; k < gamma.n; k++) {
        push(gamma.P[k], []);
        let lastT = [];
        for (const x of byEdge.get(k) || []) {
            const TA = x.pa.tile, TB = x.pb.tile, m = x.pb.k;
            const left = dot(lcross(x.X, x.tA), x.tB) > 0;
            const forward = sign > 0 ? left : !left;
            const near = -Math.sign(dot(x.tA, lcross(x.X, x.tB))) || 1;
            const off = i => expMap(c.P[i], Nc[i], near * eps);
            W[W.length - 1] = freeReduce(W[W.length - 1].concat(inverseWord(lastT), TA));
            push(x.X, []);
            if (forward) {
                W[W.length - 1] = freeReduce(inverseWord(TB).concat(c.W[m]));
                for (let i = 1; i <= K; i++) {
                    const v = (m + i) % K;
                    push(off(v), []);
                    W[W.length - 1] = i < K ? c.W[v].slice() : TB.slice();
                }
            } else {
                W[W.length - 1] = inverseWord(TB);
                for (let i = 0; i < K; i++) {
                    const v = (m - i + K) % K;
                    push(off(v), []);
                    W[W.length - 1] = i < K - 1 ? inverseWord(c.W[(v - 1 + K) % K]) : freeReduce(inverseWord(c.W[m]).concat(TB));
                }
            }
            push(x.X, []);
            lastT = TA;
        }
        W[W.length - 1] = freeReduce(W[W.length - 1].concat(inverseWord(lastT), gamma.W[k]));
    }
    const out = new Curve(S, P, W.map(w => freeReduce(w)));
    for (let k = 0; k < out.n; k++) out.fixVertex(k);
    for (let k = 0; k < out.n; k++) out.normalizeEdge(k);
    out.version++;
    return out;
}

export function twist(gamma, c, sign = 1, relaxOpts = {}) {
    const out = surgery(gamma, c, sign);
    out.relax({ maxSteps: 2000, ...relaxOpts });
    return out;
}

// +1: the same oriented geodesic, −1: the same with opposite orientation, 0: different.
// Both curves should be relaxed.
export function sameCurve(A, B, tol = 1e-6) {
    if (A.trivial || B.trivial) return A.trivial && B.trivial ? 1 : 0;
    const LA = A.length(), LB = B.length();
    if (Math.abs(LA - LB) > tol * Math.max(1, LA) * 10) return 0;
    const S = A.S;
    // a vertex of A deep inside D
    let best = 0, depth = -Infinity;
    for (let k = 0; k < A.n; k++) {
        let m = Infinity;
        for (const nrm of S.normals) m = Math.min(m, -dot(A.P[k], nrm));
        if (m > depth) { depth = m; best = k; }
    }
    const p = A.P[best];
    const la = logUnit(p, A.prevPt(best)), lb = logUnit(p, A.nextPt(best));
    const tA = normSpace([lb.u[0] - la.u[0], lb.u[1] - la.u[1], lb.u[2] - la.u[2]]);
    let dmin = Infinity, sgn = 0;
    for (const pc of B.pieces()) {
        const nrm = lcross(pc.a, pc.b);
        const nn = Math.sqrt(Math.max(1e-300, dot(nrm, nrm)));
        const d = Math.abs(dot(p, nrm)) / nn;           // sinh of the distance to the line
        if (d >= dmin) continue;
        // the foot of the perpendicular must lie on the piece
        const da = logUnit(p, pc.a), db = logUnit(p, pc.b);
        if (dot(da.u, db.u) > 0 && Math.min(da.d, db.d) > 1e-9) continue;
        dmin = d;
        const tB = da.d < 1e-9 ? db.u : db.d < 1e-9 ? [-da.u[0], -da.u[1], -da.u[2]]
            : normSpace([db.u[0] - da.u[0], db.u[1] - da.u[1], db.u[2] - da.u[2]]);
        sgn = dot(tA, tB) > 0 ? 1 : -1;
    }
    return dmin < tol ? sgn : 0;
}

// The strands drawn while a twist winds γ around c: one per crossing, running from the
// crossing along a copy of c pushed a little toward the side γ comes from. Each strand is
// a list of segments {a, b, s0, len} in D (s0 = arc length at a), of total length ℓ(c).
export function windingStrands(gamma, c, sign = 1, eps = 0.035) {
    const pcs = c.pieces();
    const idx = new Map(pcs.map((p, i) => [p, i]));
    const shift = (p, dir, s) => expMap(p, normSpace(lcross(p, dir)), s);
    return crossings(gamma, c).map(x => {
        const left = dot(lcross(x.X, x.tA), x.tB) > 0;
        const forward = sign > 0 ? left : !left;
        const near = -Math.sign(dot(x.tA, lcross(x.X, x.tB))) || 1;
        const segs = [];
        let s0 = 0;
        const add = (a, b) => {
            const { u, d } = logUnit(a, b);
            if (d < 1e-12) return;
            const back = logUnit(b, a).u;
            // offset to the near side of c, in c's own orientation
            const dirA = forward ? u : [-u[0], -u[1], -u[2]], dirB = forward ? [-back[0], -back[1], -back[2]] : back;
            segs.push({ a: shift(a, dirA, near * eps), b: shift(b, dirB, near * eps), s0, len: d });
            s0 += d;
        };
        const i0 = idx.get(x.pb), n = pcs.length;
        if (forward) {
            add(x.X, x.pb.b);
            for (let t = 1; t < n; t++) { const p = pcs[(i0 + t) % n]; add(p.a, p.b); }
            add(x.pb.a, x.X);
        } else {
            add(x.X, x.pb.a);
            for (let t = 1; t < n; t++) { const p = pcs[(i0 - t + n) % n]; add(p.b, p.a); }
            add(x.pb.b, x.X);
        }
        return { X: x.X, segs, total: s0 };
    });
}
