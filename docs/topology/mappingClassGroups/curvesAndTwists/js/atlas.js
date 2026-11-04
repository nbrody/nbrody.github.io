// atlas.js — a homeomorphism from the hyperbolic surface (the polygon D) onto the pretzel in R³.
//
// The whole chain c_1, …, c_{2g+1} cuts S_g into two disks: on the pretzel, its front half
// (y > 0) and its back half, each cut along the inner equators. In the hyperbolic plane each disk
// develops to a convex 4g-gon whose sides are arcs of the chain geodesics, straight in the Klein
// model. Cut the pretzel mesh along its own chain, lay each boundary on its polygon in proportion
// to arc length, and place the inside by Tutte's harmonic embedding; since the polygons are convex
// the result is one-to-one. A point of D is moved into one of the polygons by a deck
// transformation, found in a triangle there, and sent to the same barycentric point on the pretzel.
// The map takes each chain geodesic onto the pretzel's own curve c_i.
import { dot, lcross, normPoint, expMap, logUnit, lerpGeo, toKlein, fromKlein, mapply, mmul, minv, frame, normSpace, tangentPart, dist, distNear, ORIGIN } from './hyp.js';
import { freeReduce, inverseWord } from './surface.js';
import { Curve } from './curve.js';
import * as TW from './twist.js';

const neg = u => [-u[0], -u[1], -u[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ---------------------------------------------------------------- the hyperbolic side
// The crossings v_i = c_i ∩ c_{i+1}, their positions along both curves and the tangents there;
// then the boundaries of the pieces, each walked with its piece on the left.
export function developFaces(S, C, m) {
    const cum = {}, len = {};
    for (let i = 1; i <= m; i++) {
        const c = C[i], a = [0];
        for (let k = 0; k < c.n; k++) a.push(a[k] + c.edgeLength(k));
        cum[i] = a; len[i] = a[c.n];
    }
    const arcPos = (i, pc, X) => {
        const M = S.wordMatrix(pc.tile);
        const Xk = M ? normPoint(mapply(M, X)) : X;
        return cum[i][pc.k] + dist(C[i].P[pc.k], Xk);
    };
    const V = [];
    for (let i = 1; i < m; i++) {
        const xs = TW.crossings(C[i], C[i + 1]);
        if (xs.length !== 1) throw new Error(`c${i} and c${i + 1} should meet once, not ${xs.length} times`);
        const x = xs[0];
        const NA = lcross(x.X, x.tA);
        V[i] = {
            X: x.X, t: { [i]: x.tA, [i + 1]: x.tB }, alpha: Math.atan2(dot(x.tB, NA), dot(x.tB, x.tA)),
            s: { [i]: arcPos(i, x.pa, x.X), [i + 1]: arcPos(i + 1, x.pb, x.X) },
        };
    }
    const onCurve = i => [i - 1, i].filter(v => v >= 1 && v < m);
    function nextVertex(i, v, d) {
        const s0 = V[v].s[i], Li = len[i];
        let best = null, bl = Infinity;
        for (const w of onCurve(i)) {
            let l = d > 0 ? V[w].s[i] - s0 : s0 - V[w].s[i];
            l = ((l % Li) + Li) % Li;
            if (l < 1e-12) l = Li;
            if (l < bl) { bl = l; best = w; }
        }
        return { v: best, len: bl };
    }
    // Walk a boundary. Everything is done in the frame of the current corner's crossing X ∈ D:
    // an arc runs from X along a chain curve to M(r)·X' for a short word r, and the next corner is
    // then X' in its own frame. Nothing far from D is ever computed.
    const key = h => `${h.c}:${h.d}:${h.v}`;
    const used = new Set();
    function walk(h0) {
        const sides = [];
        let cur = h0;
        for (let step = 0; step < 8 * m; step++) {
            used.add(key(cur));
            const X = V[cur.v].X, tc = V[cur.v].t[cur.c], u = cur.d > 0 ? tc : neg(tc);
            const { v: v2, len: l } = nextVertex(cur.c, cur.v, cur.d);
            const end = expMap(X, u, l);
            const { p, word: w } = S.reduce(end);
            const r = freeReduce(w.concat(S.nearestLift(p, V[v2].X)));
            const Mr = S.wordMatrix(r);
            sides.push({ c: cur.c, d: cur.d, from: cur.v, to: v2, len: l, r, snap: distNear(Mr ? normPoint(mapply(Mr, V[v2].X)) : V[v2].X, end) });
            // the four ways out of v2; take the first one clockwise from the way back
            const X2 = V[v2].X, other = cur.c === v2 ? v2 + 1 : v2;
            const Fc = V[v2].t[cur.c], Fo = V[v2].t[other];
            const Tin = cur.d > 0 ? Fc : neg(Fc), Nin = lcross(X2, Tin);
            let pick = null, bw = Infinity;
            for (const o of [{ c: cur.c, d: 1, u: Fc }, { c: cur.c, d: -1, u: neg(Fc) }, { c: other, d: 1, u: Fo }, { c: other, d: -1, u: neg(Fo) }]) {
                if (o.c === cur.c && o.d === -cur.d) continue;
                const ang = Math.atan2(dot(o.u, Nin), dot(o.u, Tin));
                const cw = (((Math.PI - ang) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                if (cw < bw) { bw = cw; pick = o; }
            }
            cur = { c: pick.c, d: pick.d, v: v2 };
            if (key(cur) === key(h0)) break;
        }
        return { sides, labels: sides.map(s => `${s.c}:${s.d}:${s.from}`) };
    }
    // Lay the polygon out in the frame of one tile. Corner k is M(u_k)·X for a short word u_k:
    // step from the exact corner along the exact tangent, find the tile the end lands in, and
    // snap to the copy of the next crossing there. Lorentz matrices lose about ε‖M‖² of accuracy,
    // so the frame is a tile near the middle of the polygon and every word stays short.
    function layout(face, base) {
        let u = base, worst = 0;
        for (const s of face.sides) {
            const Mu = S.wordMatrix(u);
            const A = Mu ? normPoint(mapply(Mu, V[s.from].X)) : V[s.from].X;
            const t0 = V[s.from].t[s.c], t = Mu ? mapply(Mu, t0) : t0;
            const end = expMap(A, s.d > 0 ? t : neg(t), s.len);
            const { p, word: w } = S.reduce(end);
            const u2 = freeReduce(w.concat(S.nearestLift(p, V[s.to].X)));
            const M2 = S.wordMatrix(u2);
            const B = M2 ? normPoint(mapply(M2, V[s.to].X)) : V[s.to].X;
            Object.assign(s, { A, B, word: u, snap: distNear(B, end) });
            worst = Math.max(worst, s.snap);
            u = u2;
        }
        return Math.max(worst, distNear(face.sides[face.sides.length - 1].B, face.sides[0].A));
    }
    function place(face) {
        layout(face, []);
        // the center of the smallest disk holding the corners (Bădoiu–Clarkson: step toward the
        // farthest corner by 1/(k+1)); its tile is the chart
        let c = face.sides[0].A;
        for (let k = 1; k < 400; k++) {
            let far = null, fd = -1;
            for (const s of face.sides) { const d = dist(c, s.A); if (d > fd) { fd = d; far = s.A; } }
            c = lerpGeo(c, far, 1 / (k + 1));
        }
        const { p, word } = S.reduce(c);
        face.base = word;                       // tile frame: absolute = M(base)·(tile frame)
        face.closure = layout(face, inverseWord(word));
        // the chart: a small isometry moving the center (inside the frame's tile) to the origin
        const T = normSpace(tangentPart(p, [1, 0, 0]));
        face.Ainv = frame(p, T);
        face.A = minv(face.Ainv);
        for (const s of face.sides) { s.A = normPoint(mapply(face.A, s.A)); s.B = normPoint(mapply(face.A, s.B)); }
    }
    const faces = [];
    for (let c = 1; c <= m; c++)
        for (const v of onCurve(c))
            for (const d of [1, -1])
                if (!used.has(key({ c, d, v }))) faces.push(walk({ c, d, v }));
    faces.forEach(place);
    return { V, faces };
}

// ---------------------------------------------------------------- the pretzel side
// Split every vertex on the cut into one copy per wedge between cut edges.
function cutMesh(pz, paths) {
    const { nV, tri } = pz, nT = tri.length / 3;
    const ek = (a, b) => (a < b ? a * nV + b : b * nV + a);
    const cut = new Set();
    for (const p of Object.values(paths)) for (let i = 0; i < p.length; i++) cut.add(ek(p[i], p[(i + 1) % p.length]));
    const dirT = new Map();
    for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) dirT.set(tri[3 * t + c] * nV + tri[3 * t + (c + 1) % 3], t);
    const inc = Array.from({ length: nV }, () => []);
    for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) inc[tri[3 * t + c]].push(t);
    const copy = new Int32Array(3 * nT).fill(-1);
    const origin = [];
    const corner = (t, v) => (tri[3 * t] === v ? 0 : tri[3 * t + 1] === v ? 1 : 2);
    for (let v = 0; v < nV; v++) {
        if (!inc[v].length) continue;
        // the fan around v, counterclockwise from outside
        const fan = [], brk = [];
        let t = inc[v][0];
        for (let guard = 0; guard < 64; guard++) {
            fan.push(t);
            const b = tri[3 * t + (corner(t, v) + 2) % 3];
            brk.push(cut.has(ek(v, b)));
            t = dirT.get(v * nV + b);
            if (t === inc[v][0]) break;
        }
        // wedges: start just after a cut edge, if any
        let start = brk.indexOf(true);
        start = start < 0 ? 0 : (start + 1) % fan.length;
        let id = -1;
        for (let q = 0; q < fan.length; q++) {
            const f = (start + q) % fan.length;
            if (q === 0 || brk[(f - 1 + fan.length) % fan.length]) { id = origin.length; origin.push(v); }
            copy[3 * fan[f] + corner(fan[f], v)] = id;
        }
    }
    // boundary loop: directed edges whose reverse is missing
    const nC = origin.length, have = new Set(), nxt = new Int32Array(nC).fill(-1);
    for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) have.add(copy[3 * t + c] * nC + copy[3 * t + (c + 1) % 3]);
    for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) {
        const a = copy[3 * t + c], b = copy[3 * t + (c + 1) % 3];
        if (!have.has(b * nC + a)) nxt[a] = b;
    }
    return { copy, origin, nC, nxt };
}

// ---------------------------------------------------------------- Tutte embedding
// Cotangent weights, clamped positive: with a convex boundary the solution is an embedding.
// A Euclidean harmonic map in the Klein chart crowds the far corners of a long polygon, so the
// weights are then scaled edge by edge by (hyperbolic length / Klein length)² and the system
// solved again, a few times: this approaches the hyperbolic harmonic map, and every solve is
// still a Tutte embedding.
function tutte(pz, cm, fixed, rounds = 6, cap = 30) {
    const { tri, pos } = pz, nT = tri.length / 3, { copy, origin, nC } = cm;
    const W = new Map();
    const P = v => [pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]];
    const add = (a, b, w) => { const k = a < b ? a * nC + b : b * nC + a; W.set(k, (W.get(k) || 0) + w); };
    for (let t = 0; t < nT; t++) {
        const c = [copy[3 * t], copy[3 * t + 1], copy[3 * t + 2]];
        const X = c.map(i => P(origin[i]));
        for (let q = 0; q < 3; q++) {
            const o = X[q], a = X[(q + 1) % 3], b = X[(q + 2) % 3];
            const e1 = [a[0] - o[0], a[1] - o[1], a[2] - o[2]], e2 = [b[0] - o[0], b[1] - o[1], b[2] - o[2]];
            const cr = cross3(e1, e2), s = Math.hypot(cr[0], cr[1], cr[2]);
            add(c[(q + 1) % 3], c[(q + 2) % 3], 0.5 * (e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2]) / Math.max(s, 1e-12));
        }
    }
    // edges as arrays
    const E = W.size, ea = new Int32Array(E), eb = new Int32Array(E), w0 = new Float64Array(E), w = new Float64Array(E);
    let e = 0;
    for (const [k, x] of W) { ea[e] = Math.floor(k / nC); eb[e] = k - ea[e] * nC; w0[e] = w[e] = Math.max(x, 0.02); e++; }
    const free = [], idx = new Int32Array(nC).fill(-1);
    for (let i = 0; i < nC; i++) if (!fixed[i]) { idx[i] = free.length; free.push(i); }
    const n = free.length;
    const K = new Float64Array(2 * nC);
    for (let i = 0; i < nC; i++) if (fixed[i]) { K[2 * i] = fixed[i][0]; K[2 * i + 1] = fixed[i][1]; }
    const diag = new Float64Array(n), bx = new Float64Array(n), by = new Float64Array(n);
    const assemble = () => {
        diag.fill(0); bx.fill(0); by.fill(0);
        for (let e = 0; e < E; e++) {
            const ia = idx[ea[e]], ib = idx[eb[e]];
            if (ia >= 0) { diag[ia] += w[e]; if (ib < 0) { bx[ia] += w[e] * K[2 * eb[e]]; by[ia] += w[e] * K[2 * eb[e] + 1]; } }
            if (ib >= 0) { diag[ib] += w[e]; if (ia < 0) { bx[ib] += w[e] * K[2 * ea[e]]; by[ib] += w[e] * K[2 * ea[e] + 1]; } }
        }
    };
    const matvec = (x, y) => {
        for (let r = 0; r < n; r++) y[r] = diag[r] * x[r];
        for (let e = 0; e < E; e++) {
            const ia = idx[ea[e]], ib = idx[eb[e]];
            if (ia >= 0 && ib >= 0) { y[ia] -= w[e] * x[ib]; y[ib] -= w[e] * x[ia]; }
        }
    };
    const cg = (b, x, tol) => {
        const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), q = new Float64Array(n);
        matvec(x, q);
        let rz = 0, b2 = 0;
        for (let i = 0; i < n; i++) { r[i] = b[i] - q[i]; z[i] = r[i] / diag[i]; p[i] = z[i]; rz += r[i] * z[i]; b2 += b[i] * b[i]; }
        let it = 0;
        for (; it < 4000; it++) {
            let r2 = 0;
            for (let i = 0; i < n; i++) r2 += r[i] * r[i];
            if (r2 < tol * tol * b2) break;
            matvec(p, q);
            let pq = 0;
            for (let i = 0; i < n; i++) pq += p[i] * q[i];
            const a = rz / pq;
            for (let i = 0; i < n; i++) { x[i] += a * p[i]; r[i] -= a * q[i]; }
            let rz2 = 0;
            for (let i = 0; i < n; i++) { z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
            const beta = rz2 / rz;
            rz = rz2;
            for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
        }
        return it;
    };
    const x = new Float64Array(n), y = new Float64Array(n);
    let iterations = 0;
    for (let round = 0; round <= rounds; round++) {
        if (round) {
            for (let e = 0; e < E; e++) {
                const a = ea[e], b = eb[e];
                const ka = [K[2 * a], K[2 * a + 1]], kb = [K[2 * b], K[2 * b + 1]];
                const dk = Math.hypot(ka[0] - kb[0], ka[1] - kb[1]);
                const dh = distNear(fromKlein(ka[0], ka[1]), fromKlein(kb[0], kb[1]));
                w[e] = w0[e] * Math.min(cap, Math.max(1 / cap, dk > 1e-14 ? (dh / dk) ** 2 : 1));
            }
        }
        assemble();
        const tol = round === rounds ? 1e-12 : 1e-6;
        iterations += cg(bx, x, tol) + cg(by, y, tol);
        for (let r = 0; r < n; r++) { K[2 * free[r]] = x[r]; K[2 * free[r] + 1] = y[r]; }
    }
    return { K, iterations };
}

// convex polygons (counterclockwise Klein vertex lists) overlap?
function overlap(P, Q) {
    for (const [A, B] of [[P, Q], [Q, P]])
        for (let i = 0; i < A.length; i++) {
            const a = A[i], b = A[(i + 1) % A.length], nx = b[1] - a[1], ny = a[0] - b[0];
            if (B.every(p => (p[0] - a[0]) * nx + (p[1] - a[1]) * ny > 1e-12)) return false;
        }
    return true;
}

// ---------------------------------------------------------------- the atlas
export function buildAtlas(S, refs, pz, opts = {}) {
    const g = S.g, m = 2 * g + 1;
    const t0 = Date.now();
    const C = {};
    for (let i = 1; i <= m; i++) C[i] = refs['c' + i];
    const dev = developFaces(S, C, m);
    const closure = Math.max(...dev.faces.map(f => f.closure));
    if (dev.faces.length !== 2 || dev.faces.some(f => f.sides.length !== 4 * g) || closure > 1e-2)
        throw new Error(`the chain should cut the surface into two ${4 * g}-gons (${dev.faces.map(f => f.sides.length)}, gap ${closure})`);

    // orient the pretzel's chain so that its crossings have the signs of the hyperbolic ones
    const paths = {};
    for (let i = 1; i <= m; i++) paths[i] = pz.chain[i].slice();
    const P = v => [pz.pos[3 * v], pz.pos[3 * v + 1], pz.pos[3 * v + 2]];
    const tangent = (path, v) => {
        const k = path.indexOf(v), a = P(path[(k - 1 + path.length) % path.length]), b = P(path[(k + 1) % path.length]);
        return [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    };
    for (let i = 1; i < m; i++) {
        const v = pz.cross[i], n = [pz.nrm[3 * v], pz.nrm[3 * v + 1], pz.nrm[3 * v + 2]];
        const c = cross3(tangent(paths[i], v), tangent(paths[i + 1], v));
        if (Math.sign(c[0] * n[0] + c[1] * n[1] + c[2] * n[2]) !== Math.sign(dev.V[i].alpha)) paths[i + 1].reverse();
    }

    // cut, then read each boundary loop as arcs between crossings
    const cm = cutMesh(pz, paths);
    const crossOf = new Map(Object.entries(pz.cross).map(([i, v]) => [v, +i]));
    const pathPos = {};
    for (let i = 1; i <= m; i++) pathPos[i] = new Map(paths[i].map((v, k) => [v, k]));
    const label = a => {
        const o = a.map(x => cm.origin[x]);
        let j = -1;
        for (let i = 1; i <= m && j < 0; i++) {
            const pp = pathPos[i], n = paths[i].length;
            if (o.length > 2 ? pp.has(o[1]) : pp.has(o[0]) && pp.has(o[1]) && [1, n - 1].includes(Math.abs(pp.get(o[0]) - pp.get(o[1])))) j = i;
        }
        const pp = pathPos[j], n = paths[j].length;
        return `${j}:${(pp.get(o[1]) - pp.get(o[0]) + n) % n === 1 ? 1 : -1}:${crossOf.get(o[0])}`;
    };
    const seenB = new Uint8Array(cm.nC), loops = [];
    for (let s = 0; s < cm.nC; s++) {
        if (cm.nxt[s] < 0 || seenB[s] || !crossOf.has(cm.origin[s])) continue;
        const arcs = [];
        let u = s, arc = [u];
        for (let guard = 0; guard < cm.nC + 2; guard++) {
            seenB[u] = 1;
            u = cm.nxt[u];
            arc.push(u);
            if (crossOf.has(cm.origin[u])) { arcs.push(arc); arc = [u]; if (u === s) break; }
        }
        loops.push({ arcs, labels: arcs.map(label) });
    }
    // match each loop to a piece of the hyperbolic surface
    const match = loops.map(L => {
        for (let f = 0; f < dev.faces.length; f++) {
            const lab = dev.faces[f].labels;
            if (lab.length !== L.labels.length) continue;
            for (let o = 0; o < lab.length; o++) if (lab.every((l, k) => L.labels[(k + o) % lab.length] === l)) return { f, o };
        }
        return null;
    });
    if (loops.length !== 2 || match.some(x => !x) || match[0].f === match[1].f) throw new Error('the cut pretzel and the cut surface do not match');

    // each piece in its own chart, with the middle of its polygon at the origin
    const charts = dev.faces.map(face => ({ base: face.base, A: face.A, Ainv: face.Ainv, Q: face.sides.map(sd => toKlein(sd.A)) }));
    // the boundaries, laid on the polygons by arc length
    const fixed = new Array(cm.nC).fill(null), copyFace = new Int8Array(cm.nC).fill(-1);
    loops.forEach((L, li) => {
        const { f, o } = match[li], face = dev.faces[f];
        face.sides.forEach((sd, k) => {
            const a = L.arcs[(k + o) % L.arcs.length];
            const len = [0];
            for (let q = 1; q < a.length; q++) {
                const x = P(cm.origin[a[q - 1]]), y = P(cm.origin[a[q]]);
                len.push(len[q - 1] + Math.hypot(y[0] - x[0], y[1] - x[1], y[2] - x[2]));
            }
            for (let q = 0; q < a.length; q++) {
                const h = q === 0 ? sd.A : q === a.length - 1 ? sd.B : lerpGeo(sd.A, sd.B, len[q] / len[a.length - 1]);
                fixed[a[q]] = toKlein(h);
                copyFace[a[q]] = f;
            }
        });
    });
    const { K, iterations } = tutte(pz, cm, fixed, opts.rounds ?? 6, opts.cap ?? 30);
    // which piece each triangle is in: flood from the boundary across shared copies
    const nT = pz.tri.length / 3, triFace = new Int8Array(nT).fill(-1);
    const byCopy = Array.from({ length: cm.nC }, () => []);
    for (let t = 0; t < nT; t++) for (let q = 0; q < 3; q++) byCopy[cm.copy[3 * t + q]].push(t);
    const stack = [];
    for (let i = 0; i < cm.nC; i++) if (copyFace[i] >= 0) for (const t of byCopy[i]) if (triFace[t] < 0) { triFace[t] = copyFace[i]; stack.push(t); }
    while (stack.length) {
        const t = stack.pop();
        for (let q = 0; q < 3; q++) for (const t2 of byCopy[cm.copy[3 * t + q]]) if (triFace[t2] < 0) { triFace[t2] = triFace[t]; stack.push(t2); }
    }
    const atlas = new Atlas(S, pz, cm, K, charts, triFace);
    atlas.info = { iterations, ms: Date.now() - t0, faces: dev.faces.map(f => f.sides.length), closure, copies: cm.nC, paths, dev };
    return atlas;
}

class Atlas {
    constructor(S, pz, cm, K, charts, triFace) {
        Object.assign(this, { S, pz, cm, K, charts, triFace });
        const nT = pz.tri.length / 3;
        const kc = (t, j) => [K[2 * cm.copy[3 * t + j]], K[2 * cm.copy[3 * t + j] + 1]];
        this.area = new Float64Array(nT);
        const G = this.G = 128;
        for (const ch of charts) {
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const [x, y] of ch.Q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
            ch.box = [x0, y0, (x1 - x0) / G, (y1 - y0) / G];
            ch.cells = Array.from({ length: G * G }, () => []);
        }
        for (let t = 0; t < nT; t++) {
            const ch = charts[triFace[t]];
            const a = kc(t, 0), b = kc(t, 1), c = kc(t, 2);
            this.area[t] = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            const cx0 = this.cellX(ch, Math.min(a[0], b[0], c[0])), cx1 = this.cellX(ch, Math.max(a[0], b[0], c[0]));
            const cy0 = this.cellY(ch, Math.min(a[1], b[1], c[1])), cy1 = this.cellY(ch, Math.max(a[1], b[1], c[1]));
            for (let i = cx0; i <= cx1; i++) for (let j = cy0; j <= cy1; j++) ch.cells[i * G + j].push(t);
        }
        // for each piece, the deck transformations moving D onto it (composed with the chart)
        this.deck = [];
        charts.forEach((ch, f) => {
            // the tiles meeting the polygon, as short words in the chart's frame
            const tiles = [{ word: [], M: ch.A, c: ORIGIN }], seen = [ORIGIN], all = [tiles[0]];
            for (let at = 0; at < all.length && all.length < 2000; at++) {
                const t = all[at];
                if (!overlap(S.vertices.map(v => toKlein(mapply(t.M, v))), ch.Q)) continue;
                if (at) tiles.push(t);
                for (let i = 0; i < S.n; i++) {
                    const w = freeReduce(t.word.concat([S.sideLetter[i]]));
                    if (w.length <= t.word.length) continue;
                    const Mw = S.wordMatrix(w), c = mapply(Mw, ORIGIN);
                    if (seen.some(o => distNear(o, c) < 1e-6)) continue;
                    seen.push(c);
                    all.push({ word: w, M: mmul(ch.A, Mw), c });
                }
            }
            if (!overlap(S.vertices.map(v => toKlein(mapply(ch.A, v))), ch.Q)) tiles.shift();
            for (const t of tiles) this.deck.push({ f, M: t.M, word: t.word });
        });
        this.last = 0;
        this.symTri = {};
    }
    cellX(ch, x) { return Math.max(0, Math.min(this.G - 1, Math.floor((x - ch.box[0]) / ch.box[2]))); }
    cellY(ch, y) { return Math.max(0, Math.min(this.G - 1, Math.floor((y - ch.box[1]) / ch.box[3]))); }
    // how far inside the polygon of chart ch the Klein point (u, v) is (negative: outside)
    inside(ch, u, v) {
        const Q = ch.Q;
        let worst = Infinity;
        for (let i = 0; i < Q.length; i++) {
            const a = Q[i], b = Q[(i + 1) % Q.length];
            worst = Math.min(worst, ((b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        return worst;
    }
    // the triangle containing the Klein point (u, v) of chart ch, with barycentric coordinates
    locateK(ch, u, v) {
        const { K, cm, G } = this;
        const ci = this.cellX(ch, u), cj = this.cellY(ch, v);
        let best = -1, bb = null, bm = -Infinity;
        for (let r = 0; r <= 2 && bm < 0; r++)
            for (let i = Math.max(0, ci - r); i <= Math.min(G - 1, ci + r); i++)
                for (let j = Math.max(0, cj - r); j <= Math.min(G - 1, cj + r); j++) {
                    if (r && Math.max(Math.abs(i - ci), Math.abs(j - cj)) < r) continue;
                    for (const t of ch.cells[i * G + j]) {
                        const i0 = cm.copy[3 * t], i1 = cm.copy[3 * t + 1], i2 = cm.copy[3 * t + 2];
                        const ax = K[2 * i0], ay = K[2 * i0 + 1], bx = K[2 * i1], by = K[2 * i1 + 1], cx = K[2 * i2], cy = K[2 * i2 + 1];
                        const A = this.area[t];
                        const l1 = ((bx - u) * (cy - v) - (by - v) * (cx - u)) / A;
                        const l2 = ((cx - u) * (ay - v) - (cy - v) * (ax - u)) / A;
                        const l3 = 1 - l1 - l2, mn = Math.min(l1, l2, l3);
                        if (mn > bm) { bm = mn; best = t; bb = [l1, l2, l3]; if (mn >= 0) break; }
                    }
                }
        if (bm < 0) {                 // just outside every triangle: a rounding error at an edge
            const s = bb.map(x => Math.max(0, x)), z = s[0] + s[1] + s[2];
            bb = s.map(x => x / z);
        }
        return { t: best, b: bb };
    }
    // a point p of D → the triangle and barycentric coordinates of its copy in one of the pieces
    locate(p) {
        const D = this.deck;
        let best = null, bw = -Infinity;
        for (let q = 0; q < D.length; q++) {
            const k = (this.last + q) % D.length, M = D[k].M;
            const x = mapply(M, p), u = x[0] / x[2], v = x[1] / x[2];
            const w = this.inside(this.charts[D[k].f], u, v);
            if (w > bw) { bw = w; best = [k, u, v]; }
            if (w >= -1e-12) break;
        }
        this.last = best[0];
        return this.locateK(this.charts[D[best[0]].f], best[1], best[2]);
    }
    // the point of the pretzel at p ∈ D, and the surface normal there
    at(p, out = null) {
        const L = this.locate(p);
        const { pos, nrm, tri } = this.pz;
        const o = out || { pos: [0, 0, 0], nrm: [0, 0, 0] };
        const X = o.pos, N = o.nrm;
        X[0] = X[1] = X[2] = N[0] = N[1] = N[2] = 0;
        for (let q = 0; q < 3; q++) {
            const v = tri[3 * L.t + q], b = L.b[q];
            X[0] += b * pos[3 * v]; X[1] += b * pos[3 * v + 1]; X[2] += b * pos[3 * v + 2];
            N[0] += b * nrm[3 * v]; N[1] += b * nrm[3 * v + 1]; N[2] += b * nrm[3 * v + 2];
        }
        const s = Math.hypot(N[0], N[1], N[2]) || 1;
        N[0] /= s; N[1] /= s; N[2] /= s;
        return o;
    }
    // the point of D at barycentric coordinates b in triangle t (corners in the order ord)
    pointOf(t, b, ord = [0, 1, 2]) {
        const { K, cm } = this;
        let u = 0, v = 0;
        for (let q = 0; q < 3; q++) { const i = cm.copy[3 * t + ord[q]]; u += b[q] * K[2 * i]; v += b[q] * K[2 * i + 1]; }
        return this.S.reduce(normPoint(mapply(this.charts[this.triFace[t]].Ainv, fromKlein(u, v)))).p;
    }
    // triangle t of the pretzel mesh at barycentric coordinates b → the point of D
    fromSurface(t, b) { return this.pointOf(t, b); }
    // the rotation of the pretzel by π about an axis, as a piecewise-linear map of D
    symmetry(axis, p) {
        const L = this.locate(p), map = this.symMap(axis);
        return this.pointOf(map.t[L.t], L.b, map.perm[L.t]);
    }
    symMap(axis) {
        if (this.symTri[axis]) return this.symTri[axis];
        const { tri } = this.pz, nT = tri.length / 3, sig = this.pz.sym[axis];
        const key = (a, b, c) => [a, b, c].sort((x, y) => x - y).join(',');
        const byKey = new Map();
        for (let t = 0; t < nT; t++) byKey.set(key(tri[3 * t], tri[3 * t + 1], tri[3 * t + 2]), t);
        const T = new Int32Array(nT), perm = [];
        for (let t = 0; t < nT; t++) {
            const im = [sig[tri[3 * t]], sig[tri[3 * t + 1]], sig[tri[3 * t + 2]]];
            const t2 = byKey.get(key(...im));
            if (t2 === undefined) throw new Error('the mesh is not symmetric');
            T[t] = t2;
            perm.push(im.map(v => (tri[3 * t2] === v ? 0 : tri[3 * t2 + 1] === v ? 1 : 2)));
        }
        return (this.symTri[axis] = { t: T, perm });
    }
}

// a closed curve through the points pts of D, consecutive points close on the surface
export function curveFromPoints(S, pts) {
    const n = pts.length, W = [];
    for (let k = 0; k < n; k++) W.push(S.nearestLift(pts[k], pts[(k + 1) % n]));
    const c = new Curve(S, pts.map(p => p.slice()), W);
    for (let k = 0; k < c.n; k++) c.normalizeEdge(k);
    c.remesh();
    return c;
}

// points along a curve, at most `step` apart, as points of D
export function samplePoints(curve, step = 0.03) {
    const out = [];
    for (const pc of curve.pieces()) {
        const { u, d } = logUnit(pc.a, pc.b);
        const k = Math.max(1, Math.ceil(d / step));
        for (let i = 0; i < k; i++) out.push(i ? expMap(pc.a, u, d * i / k) : pc.a);
    }
    return out;
}

// plain data for a worker to send back, and the atlas rebuilt from it
export function atlasData(a) {
    const { field, ...pz } = a.pz;
    return {
        pz, cm: { copy: a.cm.copy, origin: Int32Array.from(a.cm.origin), nC: a.cm.nC }, K: a.K, triFace: a.triFace,
        charts: a.charts.map(c => ({ base: c.base, A: c.A, Ainv: c.Ainv, Q: c.Q })),
        info: { ms: a.info.ms, iterations: a.info.iterations, faces: a.info.faces, closure: a.info.closure },
    };
}
export function atlasFromData(S, d) {
    const a = new Atlas(S, d.pz, d.cm, d.K, d.charts, d.triFace);
    a.info = d.info;
    return a;
}
