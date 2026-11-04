// Curves on the punctured plane: geometry, the tightening solver, and the
// combinatorics (cut systems, intersection numbers, words, canonical layouts).
//
// World coordinates have y pointing up. A curve is a set of closed polygons
// ("loops") stored flat: loop l occupies X/Y[starts[l] .. starts[l]+lens[l]),
// and segment g runs from vertex g to vertex next[g].
//
// The one invariant everything protects: the polygons stay simple, pairwise
// disjoint, and off the punctures. Every move (tension, spacing, a dragged
// puncture, a braid twist) is clamped so that no vertex moves more than 0.45×
// the clearance of its segments (the least distance from the segment to any
// non-adjacent segment or puncture), and a puncture moves at most 0.45× its own
// clearance. Two pieces then close at most 0.9× the gap between them, so
// nothing ever touches and the isotopy class never changes.

'use strict';

// ------------------------------------------------------------------ sim state

export function createSim() {
    return {
        P: [],                       // punctures {id, x, y}
        X: new Float64Array(0), Y: new Float64Array(0), N: 0,
        next: new Int32Array(0), prev: new Int32Array(0), loopOf: new Int32Array(0),
        starts: [], lens: [],
        h: 10,                       // strand spacing (world units)
        rpFactor: 1.0,               // innermost radius around a puncture, × h
        tension: 0.15,               // current cap on a tension step, × h
        nextId: 1,
        _buf: {},
    };
}

function buf(sim, name, n, Type) {
    let b = sim._buf[name];
    if (!b || b.length < n || !(b instanceof Type)) {
        b = new Type(Math.max(n, 16) * 1.5 | 0);
        sim._buf[name] = b;
    }
    return b;
}

export function addPuncture(sim, x, y) {
    const p = { id: sim.nextId++, x, y };
    sim.P.push(p);
    return p;
}

export function setLoops(sim, loops) {
    let N = 0;
    for (const L of loops) N += L.x.length;
    const X = new Float64Array(N), Y = new Float64Array(N);
    const next = new Int32Array(N), prev = new Int32Array(N), loopOf = new Int32Array(N);
    const starts = [], lens = [];
    let o = 0;
    loops.forEach((L, l) => {
        const n = L.x.length;
        starts.push(o); lens.push(n);
        for (let i = 0; i < n; i++) {
            X[o + i] = L.x[i]; Y[o + i] = L.y[i];
            next[o + i] = o + (i + 1) % n;
            prev[o + i] = o + (i - 1 + n) % n;
            loopOf[o + i] = l;
        }
        o += n;
    });
    Object.assign(sim, { X, Y, N, next, prev, loopOf, starts, lens });
}

export function getLoops(sim) {
    return sim.starts.map((o, l) => ({
        x: Array.from(sim.X.subarray(o, o + sim.lens[l])),
        y: Array.from(sim.Y.subarray(o, o + sim.lens[l])),
    }));
}

export function snapshot(sim) {
    return {
        P: sim.P.map(p => ({ ...p })),
        loops: getLoops(sim),
        h: sim.h,
        nextId: sim.nextId,
    };
}

export function restore(sim, s) {
    sim.P = s.P.map(p => ({ ...p }));
    sim.nextId = s.nextId;
    setLoops(sim, s.loops);
}

// ------------------------------------------------------------------ geometry

export function segPoint(ax, ay, bx, by, px, py) {
    const ex = bx - ax, ey = by - ay;
    const L2 = ex * ex + ey * ey;
    let u = L2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / L2 : 0;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    const qx = ax + u * ex, qy = ay + u * ey;
    return { d: Math.hypot(px - qx, py - qy), u, qx, qy };
}

function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

// closed segments meet (touching counts)
export function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = orient(cx, cy, dx, dy, ax, ay), d2 = orient(cx, cy, dx, dy, bx, by);
    const d3 = orient(ax, ay, bx, by, cx, cy), d4 = orient(ax, ay, bx, by, dx, dy);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    const on = (px, py, qx, qy, rx, ry) =>
        Math.min(px, qx) <= rx && rx <= Math.max(px, qx) && Math.min(py, qy) <= ry && ry <= Math.max(py, qy);
    if (d1 === 0 && on(cx, cy, dx, dy, ax, ay)) return true;
    if (d2 === 0 && on(cx, cy, dx, dy, bx, by)) return true;
    if (d3 === 0 && on(ax, ay, bx, by, cx, cy)) return true;
    if (d4 === 0 && on(ax, ay, bx, by, dx, dy)) return true;
    return false;
}

// closed triangle, slightly fattened by eps
function inTriangle(px, py, ax, ay, bx, by, cx, cy, eps) {
    const s1 = orient(ax, ay, bx, by, px, py), s2 = orient(bx, by, cx, cy, px, py), s3 = orient(cx, cy, ax, ay, px, py);
    const neg = s1 < 0 || s2 < 0 || s3 < 0, pos = s1 > 0 || s2 > 0 || s3 > 0;
    if (!(neg && pos)) return true;
    return segPoint(ax, ay, bx, by, px, py).d < eps || segPoint(bx, by, cx, cy, px, py).d < eps ||
        segPoint(cx, cy, ax, ay, px, py).d < eps;
}

export function windingNumber(xs, ys, px, py) {
    let w = 0;
    const n = xs.length;
    for (let i = 0; i < n; i++) {
        const ax = xs[i], ay = ys[i], bx = xs[(i + 1) % n], by = ys[(i + 1) % n];
        if (ay <= py) {
            if (by > py && orient(ax, ay, bx, by, px, py) > 0) w++;
        } else if (by <= py && orient(ax, ay, bx, by, px, py) < 0) w--;
    }
    return w;
}

export function totalLength(sim) {
    const { X, Y, N, next } = sim;
    let s = 0;
    for (let g = 0; g < N; g++) s += Math.hypot(X[next[g]] - X[g], Y[next[g]] - Y[g]);
    return s;
}

// hyperbolic length with a metric, Euclidean without
export function curveLength(sim) {
    const M = sim.metric;
    if (!M) return totalLength(sim);
    const { X, Y, N, next } = sim;
    let s = 0;
    for (let g = 0; g < N; g++) {
        const k = next[g];
        s += M.rho(0.5 * (X[g] + X[k]), 0.5 * (Y[g] + Y[k])) * Math.hypot(X[k] - X[g], Y[k] - Y[g]);
    }
    return s;
}

export function loopLength(xs, ys) {
    let s = 0;
    const n = xs.length;
    for (let i = 0; i < n; i++) s += Math.hypot(xs[(i + 1) % n] - xs[i], ys[(i + 1) % n] - ys[i]);
    return s;
}

// ------------------------------------------------------------------ segment grid

// A uniform grid of cell size >= cs over everything, segments filed under
// every cell their bounding box touches (CSR layout). Any segment within
// distance cs of a point is filed in the 3×3 block around the point's cell.
function buildGrid(sim, cs) {
    const { X, Y, N, next, P } = sim;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let g = 0; g < N; g++) {
        const x = X[g], y = Y[g];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    for (const p of P) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    if (!(minX <= maxX)) { minX = minY = 0; maxX = maxY = 1; }
    minX -= cs; minY -= cs; maxX += cs; maxY += cs;
    let nx = Math.ceil((maxX - minX) / cs), ny = Math.ceil((maxY - minY) / cs);
    const MAXC = 1 << 18;
    if (nx * ny > MAXC) {
        cs *= Math.sqrt(nx * ny / MAXC) * 1.01;
        nx = Math.ceil((maxX - minX) / cs); ny = Math.ceil((maxY - minY) / cs);
    }
    const cells = nx * ny;
    const start = buf(sim, 'gStart', cells + 2, Int32Array);
    start.fill(0, 0, cells + 2);
    const inv = 1 / cs;
    // pass 1: count
    for (let g = 0; g < N; g++) {
        const h = next[g];
        const x0 = Math.min(X[g], X[h]), x1 = Math.max(X[g], X[h]);
        const y0 = Math.min(Y[g], Y[h]), y1 = Math.max(Y[g], Y[h]);
        const i0 = ((x0 - minX) * inv) | 0, i1 = ((x1 - minX) * inv) | 0;
        const j0 = ((y0 - minY) * inv) | 0, j1 = ((y1 - minY) * inv) | 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) start[j * nx + i + 1]++;
    }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const total = start[cells];
    const items = buf(sim, 'gItems', total + 1, Int32Array);
    const fill = buf(sim, 'gFill', cells + 1, Int32Array);
    for (let c = 0; c < cells; c++) fill[c] = start[c];
    for (let g = 0; g < N; g++) {
        const h = next[g];
        const x0 = Math.min(X[g], X[h]), x1 = Math.max(X[g], X[h]);
        const y0 = Math.min(Y[g], Y[h]), y1 = Math.max(Y[g], Y[h]);
        const i0 = ((x0 - minX) * inv) | 0, i1 = ((x1 - minX) * inv) | 0;
        const j0 = ((y0 - minY) * inv) | 0, j1 = ((y1 - minY) * inv) | 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) items[fill[j * nx + i]++] = g;
    }
    return { minX, minY, cs, inv, nx, ny, start, items };
}

// ------------------------------------------------------------------ clearance sweep

// One pass over all (vertex, nearby segment) and (puncture, nearby segment)
// pairs. Fills C[g] = clearance of segment g, Cp[k] = clearance of puncture k,
// and, if wanted, Jacobi-averaged spacing corrections (cx, cy, cn).
export function sweep(sim, wantCorr) {
    const { X, Y, N, next, prev, loopOf, P } = sim;
    const h = sim.h, rp = h * sim.rpFactor;
    const G = buildGrid(sim, Math.max(h, rp));
    const cs = G.cs, cs2 = cs * cs;
    const C = buf(sim, 'C', N, Float64Array); C.fill(Infinity, 0, N);
    const Cp = new Float64Array(P.length).fill(Infinity);
    const stamp = buf(sim, 'stamp', N, Int32Array); stamp.fill(-1, 0, N);
    let cx = null, cy = null, cn = null, px = null, py = null, arc = null, loopLen = null;
    let maxOv = 0;
    if (wantCorr) {
        cx = buf(sim, 'cx', N, Float64Array); cx.fill(0, 0, N);
        cy = buf(sim, 'cy', N, Float64Array); cy.fill(0, 0, N);
        cn = buf(sim, 'cn', N, Float64Array); cn.fill(0, 0, N);
        px = buf(sim, 'px', N, Float64Array); px.fill(0, 0, N);
        py = buf(sim, 'py', N, Float64Array); py.fill(0, 0, N);
        arc = buf(sim, 'arc', N, Float64Array);
        loopLen = new Float64Array(sim.starts.length);
        for (let l = 0; l < sim.starts.length; l++) {
            const o = sim.starts[l], n = sim.lens[l];
            let s = 0;
            for (let i = 0; i < n; i++) {
                const g = o + i, k = next[g];
                arc[g] = s;
                s += Math.hypot(X[k] - X[g], Y[k] - Y[g]);
            }
            loopLen[l] = s;
        }
    }
    const excl = 1.6 * h, hRec = 1.15 * h;
    let pairW = buf(sim, 'pairW', 4 * N + 64, Int32Array), pairT = buf(sim, 'pairT', 4 * N + 64, Int32Array), nPairs = 0;
    const { minX, minY, inv, nx, ny, start, items } = G;

    for (let w = 0; w < N; w++) {
        const wx = X[w], wy = Y[w];
        const ci = ((wx - minX) * inv) | 0, cj = ((wy - minY) * inv) | 0;
        const wp = prev[w], wn = next[w];
        for (let j = cj - 1; j <= cj + 1; j++) {
            if (j < 0 || j >= ny) continue;
            for (let i = ci - 1; i <= ci + 1; i++) {
                if (i < 0 || i >= nx) continue;
                const c = j * nx + i;
                for (let k = start[c], e = start[c + 1]; k < e; k++) {
                    const t = items[k];
                    if (stamp[t] === w) continue;
                    stamp[t] = w;
                    const t1 = next[t];
                    if (t === w || t1 === w) continue;
                    const ax = X[t], ay = Y[t], ex = X[t1] - ax, ey = Y[t1] - ay;
                    const L2 = ex * ex + ey * ey;
                    let u = L2 > 0 ? ((wx - ax) * ex + (wy - ay) * ey) / L2 : 0;
                    if (u < 0) u = 0; else if (u > 1) u = 1;
                    const dx = wx - ax - u * ex, dy = wy - ay - u * ey;
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= cs2) continue;
                    const d = Math.sqrt(d2);
                    const adjL = t1 === wp, adjR = t === wn;
                    if (!adjL && d < C[wp]) C[wp] = d;
                    if (!adjR && d < C[w]) C[w] = d;
                    if ((!adjL || !adjR) && d < C[t]) C[t] = d;
                    if (!wantCorr || d >= hRec) continue;
                    if (loopOf[t] === loopOf[w]) {
                        const Ll = loopLen[loopOf[w]];
                        let da = Math.abs(arc[t] + u * Math.sqrt(L2) - arc[w]);
                        if (Ll - da < da) da = Ll - da;
                        if (da < excl) continue;
                    }
                    if (nPairs >= pairW.length) { pairW = grow(sim, 'pairW', pairW); pairT = grow(sim, 'pairT', pairT); }
                    pairW[nPairs] = w; pairT[nPairs] = t; nPairs++;
                    if (d >= h) continue;
                    let nxv, nyv;
                    if (d > 1e-12) { nxv = dx / d; nyv = dy / d; }
                    else { const Lt = Math.sqrt(L2) || 1; nxv = -ey / Lt; nyv = ex / Lt; }
                    // each contact asks for a half-overlap push on either side; pushes
                    // are averaged with weight = overlap, so the tightest contact wins
                    const f = 0.5 * (h - d), wt = (h - d) / h;
                    if (wt > maxOv) maxOv = wt;
                    cx[w] += wt * f * nxv; cy[w] += wt * f * nyv; cn[w] += wt;
                    const w0 = wt * (1 - u), w1 = wt * u;
                    cx[t] -= w0 * f * nxv; cy[t] -= w0 * f * nyv; cn[t] += w0;
                    cx[t1] -= w1 * f * nxv; cy[t1] -= w1 * f * nyv; cn[t1] += w1;
                }
            }
        }
    }

    for (let q = 0; q < P.length; q++) {
        const qx0 = P[q].x, qy0 = P[q].y;
        const ci = ((qx0 - minX) * inv) | 0, cj = ((qy0 - minY) * inv) | 0;
        const tag = N + q;
        for (let j = cj - 1; j <= cj + 1; j++) {
            if (j < 0 || j >= ny) continue;
            for (let i = ci - 1; i <= ci + 1; i++) {
                if (i < 0 || i >= nx) continue;
                const c = j * nx + i;
                for (let k = start[c], e = start[c + 1]; k < e; k++) {
                    const t = items[k];
                    if (stamp[t] === tag) continue;
                    stamp[t] = tag;
                    const t1 = next[t];
                    const ax = X[t], ay = Y[t], ex = X[t1] - ax, ey = Y[t1] - ay;
                    const L2 = ex * ex + ey * ey;
                    let u = L2 > 0 ? ((qx0 - ax) * ex + (qy0 - ay) * ey) / L2 : 0;
                    if (u < 0) u = 0; else if (u > 1) u = 1;
                    const dx = ax + u * ex - qx0, dy = ay + u * ey - qy0;
                    const d2 = dx * dx + dy * dy;
                    if (d2 >= cs2) continue;
                    const d = Math.sqrt(d2);
                    if (d < Cp[q]) Cp[q] = d;
                    if (d < C[t]) C[t] = d;
                    if (!wantCorr || d >= 1.15 * rp) continue;
                    if (nPairs >= pairW.length) { pairW = grow(sim, 'pairW', pairW); pairT = grow(sim, 'pairT', pairT); }
                    pairW[nPairs] = -1 - q; pairT[nPairs] = t; nPairs++;
                    if (d >= rp) continue;
                    let nxv, nyv;
                    if (d > 1e-12) { nxv = dx / d; nyv = dy / d; }
                    else { const Lt = Math.sqrt(L2) || 1; nxv = -ey / Lt; nyv = ex / Lt; }
                    const o = rp - d, wt = 2 * o / rp;
                    if (o > maxOv * rp) maxOv = o / rp;
                    // a puncture does not move, so the segment takes the whole
                    // push; it joins the same weighted average, at double weight
                    const w0 = 1 - u, w1 = u, ww = w0 * w0 + w1 * w1;
                    const k0 = wt * w0, k1 = wt * w1;
                    cx[t] += k0 * o / ww * nxv; cy[t] += k0 * o / ww * nyv; cn[t] += k0;
                    cx[t1] += k1 * o / ww * nxv; cy[t1] += k1 * o / ww * nyv; cn[t1] += k1;
                }
            }
        }
    }
    return { C, Cp, cx, cy, cn, px, py, cs, maxOv, pairW, pairT, nPairs };
}

function grow(sim, name, a) {
    const b = new Int32Array(a.length * 2);
    b.set(a);
    sim._buf[name] = b;
    return b;
}

// Move vertex g by (DX[g], DY[g]) scaled down to its safe limit. Returns the
// largest move actually made.
export function applyMoves(sim, DX, DY, sw) {
    const { X, Y, N, prev } = sim;
    const C = sw.C, muMax = 0.4 * sw.cs;
    let maxMove = 0;
    for (let g = 0; g < N; g++) {
        const dx = DX[g], dy = DY[g];
        if (dx === 0 && dy === 0) continue;
        let lim = 0.45 * Math.min(C[prev[g]], C[g]);
        if (lim > muMax) lim = muMax;
        const m = Math.hypot(dx, dy);
        const s = m > lim ? lim / m : 1;
        X[g] += dx * s; Y[g] += dy * s;
        if (m * s > maxMove) maxMove = m * s;
    }
    return maxMove;
}

// applyMoves, then undo the moves of any close pair that came nearer than a
// floor (3% of the spacing; 5% of rp for a puncture). Undoing moves keeps
// every vertex inside its clearance bound, so this is as safe as applyMoves,
// and no contact can be ground down to nothing by conflicting pushes.
export function applyMovesFloored(sim, DX, DY, sw) {
    const { N, next, P } = sim;
    const X = sim.X, Y = sim.Y;
    const x0 = buf(sim, 'fx0', N, Float64Array), y0 = buf(sim, 'fy0', N, Float64Array);
    x0.set(X.subarray(0, N)); y0.set(Y.subarray(0, N));
    applyMoves(sim, DX, DY, sw);
    const h = sim.h, rp = h * sim.rpFactor;
    const { pairW, pairT, nPairs } = sw;
    const dist = (XA, YA, w, t) => {
        const t1 = next[t];
        const wx = w >= 0 ? XA[w] : P[-1 - w].x, wy = w >= 0 ? YA[w] : P[-1 - w].y;
        return segPoint(XA[t], YA[t], XA[t1], YA[t1], wx, wy).d;
    };
    const revert = g => { X[g] = x0[g]; Y[g] = y0[g]; };
    for (let rep = 0; rep < 4; rep++) {
        let changed = false;
        for (let k = 0; k < nPairs; k++) {
            const w = pairW[k], t = pairT[k];
            const floor = w >= 0 ? 0.03 * h : 0.05 * rp;
            const dNew = dist(X, Y, w, t);
            if (dNew >= floor) continue;
            if (dNew >= dist(x0, y0, w, t)) continue;
            if (w >= 0) revert(w);
            revert(t); revert(next[t]);
            changed = true;
        }
        if (!changed) break;
    }
}

// largest safe step for puncture q in this sweep
export function punctureLimit(sw, q) {
    return 0.45 * Math.min(sw.Cp[q], sw.cs);
}

// ------------------------------------------------------------------ remeshing

function collapseSafe(sim, G, a, v, c, mark) {
    const { X, Y, next, P } = sim;
    const ax = X[a], ay = Y[a], vx = X[v], vy = Y[v], cx = X[c], cy = Y[c];
    const scale = Math.max(Math.abs(ax - vx), Math.abs(ay - vy), Math.abs(cx - vx), Math.abs(cy - vy), 1e-9);
    const eps = 1e-7 * scale;
    for (const p of P) if (inTriangle(p.x, p.y, ax, ay, vx, vy, cx, cy, eps + 1e-9)) return false;
    const x0 = Math.min(ax, vx, cx), x1 = Math.max(ax, vx, cx), y0 = Math.min(ay, vy, cy), y1 = Math.max(ay, vy, cy);
    const { minX, minY, inv, nx, ny, start, items } = G;
    const i0 = Math.max(0, ((x0 - minX) * inv) | 0), i1 = Math.min(nx - 1, ((x1 - minX) * inv) | 0);
    const j0 = Math.max(0, ((y0 - minY) * inv) | 0), j1 = Math.min(ny - 1, ((y1 - minY) * inv) | 0);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cc = j * nx + i;
        for (let k = start[cc], e = start[cc + 1]; k < e; k++) {
            const t = items[k];
            if (mark[t] === v) continue;
            mark[t] = v;
            if (t === a || t === v) continue;
            const t1 = next[t];
            if (t !== c && inTriangle(X[t], Y[t], ax, ay, vx, vy, cx, cy, eps)) return false;
            if (t1 !== a && inTriangle(X[t1], Y[t1], ax, ay, vx, vy, cx, cy, eps)) return false;
            if (t === c || t1 === a) continue;
            if (segsIntersect(X[t], Y[t], X[t1], Y[t1], ax, ay, cx, cy)) return false;
        }
    }
    return true;
}

// Keep segment lengths near ell = 0.4 h: split long ones, merge short ones
// (only where the merged segment sweeps over nothing). Drops loops that have
// shrunk to nothing around no puncture.
export function remesh(sim, force = false) {
    const { X, Y, N, next, prev } = sim;
    const ell = 0.4 * sim.h, hiL = 1.45 * ell, loL = 0.5 * ell;
    // with a metric, segments shrink where ρ is large (near the cusps)
    const cap = Math.max(ell, sim.ellMax || 0);
    const target = sim.metric && sim.ellHyp
        ? (x, y) => Math.max(0.04 * sim.h, Math.min(cap, sim.ellHyp / sim.metric.rho(x, y)))
        : null;
    const lenOK = (g, k) => {
        const L = Math.hypot(X[k] - X[g], Y[k] - Y[g]);
        const t = target ? target(0.5 * (X[k] + X[g]), 0.5 * (Y[k] + Y[g])) : ell;
        return L <= 1.45 * t && L >= 0.5 * t;
    };
    let need = force;
    void hiL; void loL;
    // interior angle below ~70°: a spike, which only the solver's own
    // clamping can produce; remove its apex
    const SPIKE = 0.34;
    const spike = g => {
        const a = prev[g], c = next[g];
        const ux = X[a] - X[g], uy = Y[a] - Y[g], vx = X[c] - X[g], vy = Y[c] - Y[g];
        const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        return den > 0 && (ux * vx + uy * vy) > SPIKE * den;
    };
    if (!need) {
        for (let g = 0; g < N; g++) {
            if (!lenOK(g, next[g]) || spike(g)) { need = true; break; }
        }
    }
    if (!need) return false;
    const G = buildGrid(sim, Math.max(sim.h, 2 * hiL));
    const mark = buf(sim, 'mark', N, Int32Array); mark.fill(-1, 0, N);
    const loops = [];
    let dropped = 0;
    for (let l = 0; l < sim.starts.length; l++) {
        const o = sim.starts[l], n = sim.lens[l];
        const remove = new Uint8Array(n);
        let kept = n;
        for (let i = 0; i < n; i++) {
            if (kept <= 10) break;
            if (i > 0 && remove[i - 1]) continue;
            if (i === n - 1 && remove[0]) continue;
            const g = o + i, a = prev[g], c = next[g];
            const la = Math.hypot(X[g] - X[a], Y[g] - Y[a]), lc = Math.hypot(X[c] - X[g], Y[c] - Y[g]);
            const sp = spike(g);
            const tl = target ? target(X[g], Y[g]) : ell;
            if (!sp && Math.min(la, lc) >= 0.5 * tl) continue;
            if (!sp && Math.hypot(X[c] - X[a], Y[c] - Y[a]) > 1.45 * tl) continue;
            if (!collapseSafe(sim, G, a, g, c, mark)) continue;
            remove[i] = 1; kept--;
        }
        const xs = [], ys = [];
        const keep = [];
        for (let i = 0; i < n; i++) if (!remove[i]) keep.push(o + i);
        for (let k = 0; k < keep.length; k++) {
            const a = keep[k], b = keep[(k + 1) % keep.length];
            xs.push(X[a]); ys.push(Y[a]);
            const L = Math.hypot(X[b] - X[a], Y[b] - Y[a]);
            const tl = target ? target(0.5 * (X[a] + X[b]), 0.5 * (Y[a] + Y[b])) : ell;
            if (L > 1.45 * tl) {
                const m = Math.ceil(L / tl);
                for (let s = 1; s < m; s++) {
                    xs.push(X[a] + (X[b] - X[a]) * s / m);
                    ys.push(Y[a] + (Y[b] - Y[a]) * s / m);
                }
            }
        }
        if (loopLength(xs, ys) < 3 * sim.h && !sim.P.some(p => windingNumber(xs, ys, p.x, p.y) !== 0)) {
            dropped++;
            continue;
        }
        loops.push({ x: xs, y: ys });
    }
    setLoops(sim, loops);
    return dropped ? 'dropped' : true;
}

// ------------------------------------------------------------------ tension

// Solve (1 + 2 s2) d_i - s2 (d_{i-1} + d_{i+1}) = r_i on a cycle of length n
// (Sherman–Morrison around the Thomas algorithm). rx, ry → ox, oy.
function solveCyclic(n, s2, rx, ry, ox, oy, w) {
    const b = 1 + 2 * s2, a = -s2, c = -s2;
    const gamma = -b;
    const cp = w.cp, zx = w.zx;
    // diagonal of the modified tridiagonal matrix
    const diag = i => (i === 0 ? b - gamma : i === n - 1 ? b - a * c / gamma : b);
    // forward sweep for three right-hand sides: rx, ry, u = [gamma,0..0,a]
    let m = diag(0);
    cp[0] = c / m;
    ox[0] = rx[0] / m; oy[0] = ry[0] / m; zx[0] = gamma / m;
    for (let i = 1; i < n; i++) {
        m = diag(i) - a * cp[i - 1];
        cp[i] = c / m;
        const ui = i === n - 1 ? a : 0;
        ox[i] = (rx[i] - a * ox[i - 1]) / m;
        oy[i] = (ry[i] - a * oy[i - 1]) / m;
        zx[i] = (ui - a * zx[i - 1]) / m;
    }
    for (let i = n - 2; i >= 0; i--) {
        ox[i] -= cp[i] * ox[i + 1];
        oy[i] -= cp[i] * oy[i + 1];
        zx[i] -= cp[i] * zx[i + 1];
    }
    // v = [1, 0..0, c/gamma]
    const vz = zx[0] + c / gamma * zx[n - 1];
    const fx = (ox[0] + c / gamma * ox[n - 1]) / (1 + vz);
    const fy = (oy[0] + c / gamma * oy[n - 1]) / (1 + vz);
    for (let i = 0; i < n; i++) { ox[i] -= fx * zx[i]; oy[i] -= fy * zx[i]; }
}

// Sobolev-smoothed umbrella flow: pulls the curve tight with large-scale
// moves while damping wiggles. Adds into DX/DY, each capped at capLen, and
// only where there is slack: a vertex whose pull points into a strand or
// puncture already at the spacing distance is not pulled (sw gives the
// contacts). Tight bands are then an exact fixed point instead of a stack
// that tension keeps squeezing.
function tensionMoves(sim, DX, DY, capLen, sw) {
    const { X, Y } = sim;
    const S = 12, s2 = S * S;
    const tau = 0.8 * (1 + 4 * s2) / 2;
    const TDX = buf(sim, 'TDX', sim.N, Float64Array), TDY = buf(sim, 'TDY', sim.N, Float64Array);
    for (let l = 0; l < sim.starts.length; l++) {
        const o = sim.starts[l], n = sim.lens[l];
        if (n < 4) continue;
        const rx = buf(sim, 'trx', n, Float64Array), ry = buf(sim, 'try', n, Float64Array);
        const ox = buf(sim, 'tox', n, Float64Array), oy = buf(sim, 'toy', n, Float64Array);
        const w = { cp: buf(sim, 'tcp', n, Float64Array), zx: buf(sim, 'tzx', n, Float64Array) };
        const M = sim.metric && sim.useMetric !== false ? sim.metric : null;
        for (let i = 0; i < n; i++) {
            const a = o + (i - 1 + n) % n, g = o + i, c = o + (i + 1) % n;
            rx[i] = 0.5 * (X[a] + X[c]) - X[g];
            ry[i] = 0.5 * (Y[a] + Y[c]) - Y[g];
            if (M) {
                // hyperbolic curve shortening: velocity ∝ κn − (∇ log ρ)⊥,
                // with the umbrella standing for ½ℓ²κn
                const du = M.u(X[g], Y[g]);
                let tx = X[c] - X[a], ty = Y[c] - Y[a];
                const tl = Math.hypot(tx, ty) || 1;
                tx /= tl; ty /= tl;
                const gn = du.gx - (du.gx * tx + du.gy * ty) * tx, gnY = du.gy - (du.gx * tx + du.gy * ty) * ty;
                const l2 = 0.5 * Math.hypot(X[g] - X[a], Y[g] - Y[a]) * Math.hypot(X[c] - X[g], Y[c] - Y[g]);
                rx[i] -= l2 * gn; ry[i] -= l2 * gnY;
            }
        }
        solveCyclic(n, s2, rx, ry, ox, oy, w);
        for (let i = 0; i < n; i++) {
            let dx = tau * ox[i], dy = tau * oy[i];
            // normal part only: sliding along the curve changes nothing but jitters
            const a = o + (i - 1 + n) % n, c = o + (i + 1) % n;
            let tx = X[c] - X[a], ty = Y[c] - Y[a];
            const tl = Math.hypot(tx, ty);
            if (tl > 0) { tx /= tl; ty /= tl; const along = dx * tx + dy * ty; dx -= along * tx; dy -= along * ty; }
            const m = Math.hypot(dx, dy);
            if (m > capLen) { dx *= capLen / m; dy *= capLen / m; }
            TDX[o + i] = dx; TDY[o + i] = dy;
        }
    }
    const lim = slack(sim, sw, TDX, TDY);
    for (let g = 0; g < sim.N; g++) {
        const m = Math.hypot(TDX[g], TDY[g]);
        const k = m > lim[g] ? lim[g] / m : 1;
        DX[g] += k * TDX[g]; DY[g] += k * TDY[g];
    }
}

// How far each vertex may be pulled: toward a neighbor at distance d it may
// close at most half of the gap d − h (d − rp for a puncture), so strands
// come to rest against each other instead of bouncing off.
function slack(sim, sw, TDX, TDY) {
    const { X, Y, next, P, N } = sim;
    const h = sim.h, rp = h * sim.rpFactor;
    const f = buf(sim, 'slack', N, Float64Array); f.fill(Infinity, 0, N);
    const block = (g, vx, vy, d, target) => {
        const tx = TDX[g], ty = TDY[g];
        const tm = Math.hypot(tx, ty), vm = Math.hypot(vx, vy);
        if (tm === 0 || vm === 0) return;
        const cos = (tx * vx + ty * vy) / (tm * vm);
        if (cos <= 0.2) return;                       // pulling elsewhere
        const v = 0.5 * Math.max(0, d - target) / cos;
        if (v < f[g]) f[g] = v;
    };
    const { pairW, pairT, nPairs } = sw;
    for (let k = 0; k < nPairs; k++) {
        const w = pairW[k], t = pairT[k], t1 = next[t];
        const ax = X[t], ay = Y[t], ex = X[t1] - ax, ey = Y[t1] - ay;
        const L2 = ex * ex + ey * ey;
        let wx, wy, target;
        if (w >= 0) { wx = X[w]; wy = Y[w]; target = h; } else { wx = P[-1 - w].x; wy = P[-1 - w].y; target = rp; }
        let u = L2 > 0 ? ((wx - ax) * ex + (wy - ay) * ey) / L2 : 0;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        const qx = ax + u * ex, qy = ay + u * ey;
        const d = Math.hypot(wx - qx, wy - qy);
        if (w >= 0) block(w, qx - wx, qy - wy, d, target);     // w pulled toward t
        if (u < 0.85) block(t, wx - qx, wy - qy, d, target);   // t's ends pulled toward w
        if (u > 0.15) block(t1, wx - qx, wy - qy, d, target);
    }
    return f;
}

// Even out the vertices along the curve (tangential part of the umbrella
// move, which does not change the shape) and straighten sharp turns (its
// normal part, only where the curve turns by more than 75° at one vertex,
// far sharper than any settled bend, so the settled shape is not pulled in).
function localSmooth(sim, DX, DY) {
    const { X, Y, N, next, prev } = sim;
    const COS_SHARP = Math.cos(75 * Math.PI / 180);
    for (let g = 0; g < N; g++) {
        const a = prev[g], c = next[g];
        const mx = 0.5 * (X[a] + X[c]) - X[g], my = 0.5 * (Y[a] + Y[c]) - Y[g];
        let tx = X[c] - X[a], ty = Y[c] - Y[a];
        const tl = Math.hypot(tx, ty);
        if (tl < 1e-12) { DX[g] += 0.5 * mx; DY[g] += 0.5 * my; continue; }
        tx /= tl; ty /= tl;
        const mt = mx * tx + my * ty;
        DX[g] += 0.3 * mt * tx; DY[g] += 0.3 * mt * ty;
        const ux = X[g] - X[a], uy = Y[g] - Y[a], vx = X[c] - X[g], vy = Y[c] - Y[g];
        const den = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        if (den > 0 && (ux * vx + uy * vy) < COS_SHARP * den) {
            DX[g] += 0.5 * (mx - mt * tx); DY[g] += 0.5 * (my - mt * ty);
        }
    }
}

// ------------------------------------------------------------------ relaxation

// One solver iteration: tension + spacing, then extra spacing passes.
// Returns the largest net displacement of any vertex.
export function relaxIteration(sim, opts = {}) {
    const passes = opts.passes ?? 2;
    remesh(sim);
    const { N } = sim;
    if (N === 0) return 0;
    const x0 = buf(sim, 'rx0', N, Float64Array), y0 = buf(sim, 'ry0', N, Float64Array);
    x0.set(sim.X.subarray(0, N)); y0.set(sim.Y.subarray(0, N));
    const DX = buf(sim, 'DX', N, Float64Array), DY = buf(sim, 'DY', N, Float64Array);
    const omega = opts.omega ?? 1.2;
    let ov = 0;
    for (let p = 0; p < passes; p++) {
        const sw = sweep(sim, true);
        DX.fill(0, 0, N); DY.fill(0, 0, N);
        localSmooth(sim, DX, DY);
        if (p === 0 && opts.tension !== false) tensionMoves(sim, DX, DY, sim.tension * sim.h, sw);
        // spacing: overlap-weighted average of the contact pushes
        for (let g = 0; g < N; g++) {
            const n = sw.cn[g];
            if (n > 0) { const f = omega / n; DX[g] += sw.cx[g] * f; DY[g] += sw.cy[g] * f; }
        }
        applyMovesFloored(sim, DX, DY, sw);
        ov = Math.max(ov, sw.maxOv);
    }
    // Tension feedback: pull hard while the curve is slack, ease off once the
    // strands press on each other, so that stacked strands keep their spacing.
    // Once the shape has stopped changing the caller sets sim.annealing and
    // tension fades to nothing, so the curve comes to rest.
    const tMax = opts.tensionMax ?? 0.15, tMin = 0.002;
    if (sim.annealing) sim.tension *= 0.92;
    else if (sim.metric) sim.tension = Math.min(tMax, Math.max(0.02, sim.tension) * 1.08);
    else if (ov > 0.12) sim.tension = Math.max(tMin, sim.tension * 0.8);
    else if (ov < 0.06) sim.tension = Math.min(tMax, Math.max(tMin, sim.tension) * 1.08);
    sim.lastOverlap = ov;
    let net = 0;
    for (let g = 0; g < N; g++) {
        const m = Math.hypot(sim.X[g] - x0[g], sim.Y[g] - y0[g]);
        if (m > net) net = m;
    }
    return net;
}

// Drives relaxIteration to rest: full tension while the curve is still
// getting shorter, then annealing, then settled (net motion < 0.003 h for 30
// iterations in a row). Call wake() after anything moves the curve.
export class Settler {
    constructor(sim) { this.sim = sim; this.wake(); }
    wake() {
        this.sim.annealing = false;
        if (this.sim.tension < 0.02) this.sim.tension = 0.02;
        this.iters = 0; this.quiet = 0; this.settled = false; this.lengths = [];
    }
    step(opts) {
        const sim = this.sim;
        const net = relaxIteration(sim, opts);
        this.iters++;
        if (this.iters % 25 === 0) {
            this.lengths.push(curveLength(sim));
            if (this.lengths.length > 5) this.lengths.shift();
            const L = this.lengths;
            if (!sim.annealing && L.length === 5 && (L[0] - L[4]) < 0.0015 * L[4]) sim.annealing = true;
            if (!sim.annealing && this.iters > 4000) sim.annealing = true;
        }
        if (net < 0.003 * sim.h) this.quiet++; else this.quiet = 0;
        if (sim.annealing && this.quiet > 30) this.settled = true;
        return net;
    }
}

// ------------------------------------------------------------------ coherent moves

// For moves meant to happen together (a dragged puncture carrying the curve,
// a braid twist) the per-vertex clamp is too timid: a strand riding along
// with a puncture is close to it but not approaching it. Here the safety test
// uses relative motion. For a vertex (or puncture) w at distance d from
// segment t, with q the nearest point, a = |D_w − D_q| and b = |D_t1 − D_t0|:
// if α·a ≤ 0.6 d and α·b ≤ 0.6 |t|, then for every point p_u of t,
// α|D_w − D_u| ≤ 0.6 (d + |u − u*|·|t|) ≤ 0.85 |w − p_u|, so the pair cannot
// meet. Both ratios stay bounded for a smooth flow however close the pair is,
// so a coherent move never stalls. Returns the largest such α ≤ 1; distant
// pairs are covered by keeping every move below 0.4·cs.
export function safeScale(sim, DX, DY, pmoves) {
    const { X, Y, N, next, P } = sim;
    const h = sim.h, rp = h * sim.rpFactor;
    const G = buildGrid(sim, Math.max(h, rp));
    const cs = G.cs, cs2 = cs * cs;
    const { minX, minY, inv, nx, ny, start, items } = G;
    const stamp = buf(sim, 'stamp', N, Int32Array); stamp.fill(-1, 0, N);
    let alpha = 1, maxD = 0, witness = null;
    for (let g = 0; g < N; g++) { const m = Math.hypot(DX[g], DY[g]); if (m > maxD) maxD = m; }
    const PDX = new Float64Array(P.length), PDY = new Float64Array(P.length);
    for (const [q, d] of pmoves) { PDX[q] = d[0]; PDY[q] = d[1]; maxD = Math.max(maxD, Math.hypot(d[0], d[1])); }
    if (maxD > 0.4 * cs) alpha = 0.4 * cs / maxD;
    const test = (wx, wy, dwx, dwy, t, tag) => {
        if (stamp[t] === tag) return;
        stamp[t] = tag;
        const t1 = next[t];
        const ax = X[t], ay = Y[t], ex = X[t1] - ax, ey = Y[t1] - ay;
        const L2 = ex * ex + ey * ey;
        let u = L2 > 0 ? ((wx - ax) * ex + (wy - ay) * ey) / L2 : 0;
        if (u < 0) u = 0; else if (u > 1) u = 1;
        const dx = wx - ax - u * ex, dy = wy - ay - u * ey;
        const d2 = dx * dx + dy * dy;
        if (d2 >= cs2) return;
        const qdx = (1 - u) * DX[t] + u * DX[t1], qdy = (1 - u) * DY[t] + u * DY[t1];
        const rel = Math.hypot(dwx - qdx, dwy - qdy);
        const str = Math.hypot(DX[t1] - DX[t], DY[t1] - DY[t]);
        const d = Math.sqrt(d2), len = Math.sqrt(L2);
        if (rel > 0 && 0.6 * d < alpha * rel) { alpha = 0.6 * d / rel; witness = { tag, t, d, rel }; }
        if (str > 0 && 0.6 * len < alpha * str) { alpha = 0.6 * len / str; witness = { tag, t, len, str }; }
    };
    for (let w = 0; w < N; w++) {
        const wx = X[w], wy = Y[w];
        const ci = ((wx - minX) * inv) | 0, cj = ((wy - minY) * inv) | 0;
        for (let j = cj - 1; j <= cj + 1; j++) {
            if (j < 0 || j >= ny) continue;
            for (let i = ci - 1; i <= ci + 1; i++) {
                if (i < 0 || i >= nx) continue;
                const c = j * nx + i;
                for (let k = start[c], e = start[c + 1]; k < e; k++) {
                    const t = items[k];
                    if (t === w || next[t] === w) continue;
                    test(wx, wy, DX[w], DY[w], t, w);
                }
            }
        }
    }
    for (let q = 0; q < P.length; q++) {
        const wx = P[q].x, wy = P[q].y;
        const ci = ((wx - minX) * inv) | 0, cj = ((wy - minY) * inv) | 0;
        for (let j = cj - 1; j <= cj + 1; j++) {
            if (j < 0 || j >= ny) continue;
            for (let i = ci - 1; i <= ci + 1; i++) {
                if (i < 0 || i >= nx) continue;
                const c = j * nx + i;
                for (let k = start[c], e = start[c + 1]; k < e; k++) test(wx, wy, PDX[q], PDY[q], items[k], N + q);
            }
        }
    }
    sim._witness = witness;
    return alpha;
}

function applyScaled(sim, DX, DY, pmoves, alpha) {
    const { X, Y, N } = sim;
    for (let g = 0; g < N; g++) { X[g] += alpha * DX[g]; Y[g] += alpha * DY[g]; }
    for (const [q, d] of pmoves) { sim.P[q].x += alpha * d[0]; sim.P[q].y += alpha * d[1]; }
}

// ------------------------------------------------------------------ dragging a puncture

// Push puncture q toward (tx, ty), carrying a disk of curve around it
// rigidly and the curve a little farther out partly. Returns the distance
// still to go.
export function dragStep(sim, q, tx, ty) {
    const p = sim.P[q];
    remesh(sim);
    let dx = tx - p.x, dy = ty - p.y;
    const m = Math.hypot(dx, dy);
    if (m < 1e-12) return 0;
    const h = sim.h;
    const cap = 0.35 * h;
    if (m > cap) { dx *= cap / m; dy *= cap / m; }
    // keep punctures apart
    const minPP = 0.6 * h;
    for (let k = 0; k < sim.P.length; k++) {
        if (k === q) continue;
        const o = sim.P[k];
        const d = Math.hypot(p.x + dx - o.x, p.y + dy - o.y);
        if (d < minPP && d < Math.hypot(p.x - o.x, p.y - o.y)) return m;
    }
    const N = sim.N;
    const DX = buf(sim, 'DX', N, Float64Array), DY = buf(sim, 'DY', N, Float64Array);
    const rp = h * sim.rpFactor, R0 = 1.6 * rp, R1 = 4 * rp;
    for (let g = 0; g < N; g++) {
        const d = Math.hypot(sim.X[g] - p.x, sim.Y[g] - p.y);
        let s = 0;
        if (d < R1) s = d <= R0 ? 1 : 0.5 * (1 + Math.cos(Math.PI * (d - R0) / (R1 - R0)));
        DX[g] = s * dx; DY[g] = s * dy;
    }
    const pm = [[q, [dx, dy]]];
    const alpha = safeScale(sim, DX, DY, pm);
    applyScaled(sim, DX, DY, pm, alpha);
    return Math.hypot(tx - p.x, ty - p.y);
}

// ------------------------------------------------------------------ half twists

// The half twist exchanging punctures qa and qb along the segment between
// them: rotation by angle·g(ρ) in elliptic polar coordinates about the
// midpoint, g = 1 inside the inner ellipse (which holds both punctures and a
// collar around them) and 0 outside the outer one (which holds no other
// puncture).
export function twistFrame(sim, qa, qb, sign = 1) {
    const A = sim.P[qa], B = sim.P[qb];
    const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
    const L = Math.hypot(B.x - A.x, B.y - A.y);
    const ex = (B.x - A.x) / L, ey = (B.y - A.y) / L;
    const nx = -ey, ny = ex;
    const margin = sim.h * sim.rpFactor * 1.2;
    // The punctures sit at elliptic radius rhoP; everything out to rhoIn turns
    // with them; the shear happens between rhoIn and 1. Pick the roundest,
    // roomiest ellipse that holds no other puncture.
    let best = null;
    for (const rhoP of [0.5, 0.6, 0.72]) {
        const SA = (L / 2) / rhoP;
        let SB = SA;
        for (let k = 0; k < sim.P.length; k++) {
            if (k === qa || k === qb) continue;
            const p = sim.P[k];
            const u = ((p.x - cx) * ex + (p.y - cy) * ey) / (SA + margin);
            const v = Math.abs((p.x - cx) * nx + (p.y - cy) * ny) - margin;
            if (Math.abs(u) >= 1) continue;
            const capB = Math.max(v, 1e-6) / Math.sqrt(1 - u * u);
            if (capB < SB) SB = capB;
        }
        SB = Math.max(SB, 1e-3 * SA);
        const score = Math.min(SB, SA) * (1 - rhoP);
        if (!best || score > best.score * 1.25) best = { rhoP, SA, SB, score };
    }
    const { rhoP, SA, SB } = best;
    const rhoIn = rhoP + 0.55 * (1 - rhoP);
    return {
        qa, qb, sign, cx, cy, ex, ey, nx, ny, SA, SB, rhoP, rhoIn,
        ax: A.x, ay: A.y, bx: B.x, by: B.y, theta: 0, done: false,
    };
}

function twistPoint(tw, x, y, ang) {
    const dx = x - tw.cx, dy = y - tw.cy;
    const u = (dx * tw.ex + dy * tw.ey) / tw.SA, v = (dx * tw.nx + dy * tw.ny) / tw.SB;
    const r = Math.hypot(u, v);
    if (r >= 1) return null;
    let g = 1;
    if (r > tw.rhoIn) { const s = (1 - r) / (1 - tw.rhoIn); g = s * s * (3 - 2 * s); }
    const a = ang * g, c = Math.cos(a), s = Math.sin(a);
    const u2 = u * c - v * s, v2 = u * s + v * c;
    return [tw.cx + tw.SA * u2 * tw.ex + tw.SB * v2 * tw.nx, tw.cy + tw.SA * u2 * tw.ey + tw.SB * v2 * tw.ny];
}

// where the two punctures should be after turning by theta (exact path)
export function twistTargets(tw, theta) {
    return [twistPoint(tw, tw.ax, tw.ay, theta), twistPoint(tw, tw.bx, tw.by, theta)];
}

// Advance a twist toward total angle `goal` (0..π; the direction is tw.sign).
// The punctures ride the same incremental flow as the curve, so nothing near
// them moves relative to them; once the full angle is applied they are
// nudged (guarded) onto their exact final places. Returns the fraction done;
// sets tw.done when the punctures have exactly exchanged places.
export function twistStep(sim, tw, goal = Math.PI) {
    remesh(sim);
    const N = sim.N;
    const DX = buf(sim, 'DX', N, Float64Array), DY = buf(sim, 'DY', N, Float64Array);
    const pa = sim.P[tw.qa], pb = sim.P[tw.qb];
    const target = Math.min(goal, tw.theta + 0.12);
    const dth = target - tw.theta;
    tw.steps = (tw.steps || 0) + 1;
    if (dth > 1e-12) {
        // exact rotation increments (a scaled-down chord would let the
        // punctures spiral inward); shrink the angle until the step is safe
        let tryAng = dth;
        for (let attempt = 0; attempt < 8; attempt++) {
            const ang = tw.sign * tryAng;
            for (let g = 0; g < N; g++) {
                const q = twistPoint(tw, sim.X[g], sim.Y[g], ang);
                if (q) { DX[g] = q[0] - sim.X[g]; DY[g] = q[1] - sim.Y[g]; } else { DX[g] = 0; DY[g] = 0; }
            }
            const na = twistPoint(tw, pa.x, pa.y, ang), nb = twistPoint(tw, pb.x, pb.y, ang);
            const pm = [[tw.qa, [na[0] - pa.x, na[1] - pa.y]], [tw.qb, [nb[0] - pb.x, nb[1] - pb.y]]];
            const alpha = safeScale(sim, DX, DY, pm);
            if (alpha >= 0.999) {
                applyScaled(sim, DX, DY, pm, 1);
                tw.theta += tryAng;
                break;
            }
            tryAng *= Math.max(0.05, 0.9 * alpha);
        }
        if (tw.theta > Math.PI - 1e-12) tw.theta = Math.PI;
        // jam relief: strands packed too tight to move together; loosen the
        // spacing and let them spread before going on
        tw.stuck = tw.theta - (tw.lastTheta ?? -1) < 1e-4 ? (tw.stuck || 0) + 1 : 0;
        tw.lastTheta = tw.theta;
        if (tw.stuck > 20) {
            sim.h *= 0.8;
            sim.jammed = true;
            for (let k = 0; k < 15; k++) relaxIteration(sim, { tension: false });
            tw.stuck = 0;
        }
    } else if (tw.theta >= Math.PI) {
        // land exactly (the residue is rounding error), carrying a small
        // disk of curve around each puncture with it
        const pm = [[tw.qa, [tw.bx - pa.x, tw.by - pa.y]], [tw.qb, [tw.ax - pb.x, tw.ay - pb.y]]];
        const R = 0.5 * sim.h;
        for (let g = 0; g < N; g++) {
            DX[g] = 0; DY[g] = 0;
            for (const [q, d] of pm) {
                const p = sim.P[q];
                if (Math.hypot(sim.X[g] - p.x, sim.Y[g] - p.y) < R) { DX[g] = d[0]; DY[g] = d[1]; }
            }
        }
        const alpha = safeScale(sim, DX, DY, pm);
        applyScaled(sim, DX, DY, pm, alpha);
        if (alpha >= 1) {
            pa.x = tw.bx; pa.y = tw.by; pb.x = tw.ax; pb.y = tw.ay;
            tw.done = true;
        }
    }
    return tw.theta / Math.PI;
}

// Run a whole twist synchronously (tests, scripted moves). sign = ±1.
export function twistNow(sim, qa, qb, sign, relaxPerStep = 1, relaxOpts = {}) {
    const tw = twistFrame(sim, qa, qb, sign);
    let guard = 0;
    while (!tw.done && guard++ < 20000) {
        twistStep(sim, tw);
        for (let k = 0; k < relaxPerStep; k++) relaxIteration(sim, relaxOpts);
    }
    if (!tw.done) { const e = new Error('twist stalled'); e.info = { tw }; throw e; }
    return guard;
}

// ------------------------------------------------------------------ cut system

// The cut system: through each puncture a vertical line (a ray up U_i and a
// ray down D_i), and between consecutive punctures a vertical line B_i.
// "Vertical" is in a frame rotated by theta, chosen so that no two punctures
// line up. Punctures are ordered left to right in that frame.
export function cutFrame(P) {
    const n = P.length;
    const gapAt = th => {
        const c = Math.cos(th), s = Math.sin(th);
        const xs = P.map(p => p.x * c + p.y * s).sort((a, b) => a - b);
        let g = Infinity;
        for (let i = 1; i < n; i++) g = Math.min(g, xs[i] - xs[i - 1]);
        return g;
    };
    let theta = 0;
    if (n > 1 && gapAt(0) < 4) {
        let best = gapAt(0);
        for (let deg = -40; deg <= 40; deg += 1) {
            const g = gapAt(deg * Math.PI / 180);
            if (g > best * 1.05 + 1e-9) { best = g; theta = deg * Math.PI / 180; }
        }
    }
    const c = Math.cos(theta), s = Math.sin(theta);
    const rot = P.map((p, k) => ({ k, X: p.x * c + p.y * s, Y: -p.x * s + p.y * c }));
    rot.sort((a, b) => a.X - b.X);
    return {
        theta, c, s,
        order: rot.map(r => r.k),           // order[i] = index into P of the i-th puncture from the left
        X: rot.map(r => r.X), Y: rot.map(r => r.Y),
        toFrame: (x, y) => [x * c + y * s, -x * s + y * c],
        fromFrame: (X, Y) => [X * c - Y * s, X * s + Y * c],
    };
}

// Crossings of one loop with the cut system, in order along the loop.
// Edge codes: 3i = U_i, 3i+1 = D_i, 3i+2 = B_i. Each crossing is
// (edge << 1) | (leftward ? 1 : 0).
export function crossings(xs, ys, F) {
    return crossingsAt(xs, ys, F).map(c => c.code);
}

// The same, with where each crossing is: on segment k (vertex k to k+1) at
// parameter t, at world point (x, y).
export function crossingsAt(xs, ys, F) {
    const n = F.X.length;
    const lines = [];
    for (let i = 0; i < n; i++) {
        lines.push({ x: F.X[i], i, kind: 0 });
        if (i < n - 1) lines.push({ x: (F.X[i] + F.X[i + 1]) / 2, i, kind: 1 });
    }
    lines.sort((a, b) => a.x - b.x);
    const lx = lines.map(l => l.x);
    const lower = v => { let lo = 0, hi = lx.length; while (lo < hi) { const m = (lo + hi) >> 1; if (lx[m] < v) lo = m + 1; else hi = m; } return lo; };
    const m = xs.length;
    const X = new Float64Array(m), Y = new Float64Array(m);
    for (let k = 0; k < m; k++) { const r = F.toFrame(xs[k], ys[k]); X[k] = r[0]; Y[k] = r[1]; }
    const out = [];
    for (let k = 0; k < m; k++) {
        const k2 = (k + 1) % m;
        const xa = X[k], xb = X[k2];
        if (xa === xb) continue;
        const right = xa < xb;
        // lines with min < x <= max, i.e. (xa < x) != (xb < x)
        const lo = right ? xa : xb, hi = right ? xb : xa;
        let a = lower(lo);
        while (a < lx.length && lx[a] <= lo) a++;
        let b = lower(hi);
        while (b < lx.length && lx[b] <= hi) b++;
        if (a >= b) continue;
        const idx = [];
        for (let j = a; j < b; j++) idx.push(j);
        if (!right) idx.reverse();
        for (const j of idx) {
            const L = lines[j];
            let edge;
            if (L.kind === 1) edge = 3 * L.i + 2;
            else {
                const t = (L.x - xa) / (xb - xa);
                const y = Y[k] + t * (Y[k2] - Y[k]);
                edge = y > F.Y[L.i] ? 3 * L.i : 3 * L.i + 1;
            }
            const t = (L.x - xa) / (xb - xa);
            out.push({
                code: (edge << 1) | (right ? 0 : 1), k, t,
                x: xs[k] + t * (xs[k2] - xs[k]), y: ys[k] + t * (ys[k2] - ys[k]),
            });
        }
    }
    return out;
}

// Cancel consecutive crossings of the same edge, cyclically. Consecutive
// crossings of one edge bound a bigon in a disk face, so the reduced sequence
// is that of the curve in minimal position.
export function reduceCyclic(seq, same = (a, b) => (a >> 1) === (b >> 1)) {
    const st = [];
    for (const c of seq) {
        if (st.length && same(st[st.length - 1], c)) st.pop();
        else st.push(c);
    }
    let i = 0, j = st.length - 1;
    while (i < j && same(st[i], st[j])) { i++; j--; }
    return st.slice(i, j + 1);
}

// Free reduction of signed letters (±(i+1)), cyclically.
export function freeReduceCyclic(w) {
    return reduceCyclic(w, (a, b) => a === -b);
}

// Everything combinatorial about the current curve.
export function analyze(sim) {
    const F = cutFrame(sim.P);
    const n = sim.P.length;
    const up = new Array(n).fill(0), down = new Array(n).fill(0), beta = new Array(Math.max(0, n - 1)).fill(0);
    const loops = getLoops(sim);
    const perLoop = loops.map(L => {
        const seq = reduceCyclic(crossings(L.x, L.y, F));
        for (const c of seq) {
            const e = c >> 1, i = (e / 3) | 0, kind = e % 3;
            if (kind === 0) up[i]++; else if (kind === 1) down[i]++; else beta[i]++;
        }
        // π1 word: crossings of the upward rays, rightward = x_i
        const w = [];
        for (const c of seq) {
            const e = c >> 1;
            if (e % 3 === 0) w.push((c & 1) ? -((e / 3 | 0) + 1) : (e / 3 | 0) + 1);
        }
        const enclosed = sim.P.filter(p => windingNumber(L.x, L.y, p.x, p.y) !== 0).length;
        let kind = 'essential';
        if (seq.length === 0 || enclosed === 0) kind = 'trivial';
        else if (enclosed === 1) kind = 'peripheral';
        else if (enclosed === n) kind = 'outer';
        return { word: freeReduceCyclic(w), kind, enclosed, crossings: seq.length };
    });
    // strands through the segment between consecutive punctures (exact)
    const gapStrands = [];
    for (let i = 0; i + 1 < n; i++) {
        const ri = (up[i] + down[i] - beta[i]) / 2;
        const lj = (up[i + 1] + down[i + 1] - beta[i]) / 2;
        const diag = Math.abs((up[i] - ri) - (up[i + 1] - lj));
        gapStrands.push(ri + lj + diag);
    }
    return { F, up, down, beta, loops: perLoop, gapStrands };
}

// A strand spacing that lets every band fit: the strands crossing the segment
// between consecutive punctures (exact counts) must fit in it with room to
// spare, and spacing grows with the scale of the picture up to density × the
// typical distance between neighboring punctures.
export function autoSpacing(sim, an, opts = {}) {
    const fill = opts.fill ?? 0.8, density = opts.density ?? 0.075;
    const P = sim.P, n = P.length;
    if (n < 2) return opts.single ?? 14;
    const nn = P.map((p, i) => Math.min(...P.filter((_, j) => j !== i).map(q => Math.hypot(p.x - q.x, p.y - q.y))));
    nn.sort((a, b) => a - b);
    let h = density * nn[nn.length >> 1];
    for (let i = 0; i + 1 < n; i++) {
        const p = P[an.F.order[i]], q = P[an.F.order[i + 1]];
        h = Math.min(h, fill * Math.hypot(p.x - q.x, p.y - q.y) / (an.gapStrands[i] + 1));
    }
    if (opts.extra) for (const [D, k] of opts.extra) h = Math.min(h, fill * D / (k + 1));
    return Math.max(opts.hMin ?? 0.6, Math.min(opts.hMax ?? Infinity, h));
}

// Strands of the current curve crossing the straight segment between every
// pair of punctures whose segment passes near no other puncture. Only an upper
// bound for the minimal number until the curve has settled.
export function pairCrossings(sim) {
    const P = sim.P, out = [];
    const { X, Y, N, next } = sim;
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) {
        const p = P[a], q = P[b];
        const D = Math.hypot(q.x - p.x, q.y - p.y);
        if (P.some((r, k) => k !== a && k !== b && E_segPointD(p, q, r) < 0.25 * D)) continue;
        let k = 0;
        for (let g = 0; g < N; g++) {
            const g1 = next[g];
            if (segsIntersect(X[g], Y[g], X[g1], Y[g1], p.x, p.y, q.x, q.y)) k++;
        }
        out.push([D, k]);
    }
    return out;
}
function E_segPointD(p, q, r) { return segPoint(p.x, p.y, q.x, q.y, r.x, r.y).d; }

// Dynnikov coordinates (a; b) for n ≥ 3: a_i = (α_{2i} − α_{2i−1})/2 with
// α_{2i−1} above and α_{2i} below the (i+1)-st puncture, b_i = (β_i − β_{i+1})/2.
export function dynnikov(an) {
    const n = an.up.length;
    if (n < 3) return null;
    const a = [], b = [];
    for (let i = 1; i <= n - 2; i++) {
        a.push((an.down[i] - an.up[i]) / 2);
        b.push((an.beta[i - 1] - an.beta[i]) / 2);
    }
    return { a, b };
}

// Intersection data of the multicurve with Dynnikov coordinates (a; b),
// without boundary-parallel or peripheral components.
export function countsFromDynnikov(n, a, b) {
    // β_1 is the least even value with every count nonnegative.
    const betas = b0 => {
        const be = [b0];
        for (let i = 0; i < n - 2; i++) be.push(be[i] - 2 * b[i]);
        return be;
    };
    let need = 0;
    {
        const be = betas(0);
        for (let i = 0; i < n - 1; i++) need = Math.max(need, -be[i]);
        // above and below each interior puncture there must be room for the
        // |b_i| U-turns around it: M_i/2 − |a_i| ≥ |b_i|
        for (let i = 0; i < n - 2; i++) {
            const M = Math.max(be[i], be[i + 1]);
            need = Math.max(need, 2 * Math.abs(a[i]) + 2 * Math.abs(b[i]) - M);
        }
    }
    if (need % 2) need++;
    const beta = betas(need);
    const up = new Array(n).fill(0), down = new Array(n).fill(0);
    up[0] = down[0] = beta[0] / 2;
    up[n - 1] = down[n - 1] = beta[n - 2] / 2;
    for (let i = 1; i <= n - 2; i++) {
        const M = Math.max(beta[i - 1], beta[i]);
        up[i] = M / 2 - a[i - 1];
        down[i] = M / 2 + a[i - 1];
    }
    return { up, down, beta };
}

// ------------------------------------------------------------------ canonical layout

// Draw the multicurve with the given intersection numbers in normal form:
// k-th crossing above/below puncture i at height k (units of h), nested
// U-turns around each puncture, order-preserving arcs between consecutive
// puncture lines. Built in a standard model and carried to the actual
// punctures by a homeomorphism that is affine on each vertical strip, so the
// result is simple and avoids the punctures by construction.
export function layoutFromCounts(sim, counts, hOverride) {
    const F = cutFrame(sim.P);
    const n = sim.P.length;
    const { up, down, beta } = counts;
    if (n === 0) return [];
    const B = i => (i < 0 || i >= n - 1 ? 0 : beta[i]);
    const l = [], r = [];
    for (let i = 0; i < n; i++) {
        l.push((up[i] + down[i] - B(i - 1)) / 2);
        r.push((up[i] + down[i] - B(i)) / 2);
        if (l[i] < 0 || r[i] < 0 || !Number.isInteger(l[i]) || !Number.isInteger(r[i])) {
            throw new Error('These intersection numbers do not describe a curve.');
        }
    }
    // standard model: puncture i at (SX[i], 0), unit spacing
    const SX = [0];
    const zones = [];
    for (let i = 0; i + 1 < n; i++) {
        const Rl = r[i] + 1, Rr = l[i + 1] + 1;
        const span = Math.max(up[i], down[i], up[i + 1], down[i + 1]);
        const T = Math.max(3, 0.6 * span);
        zones.push({ Rl, Rr, T });
        SX.push(SX[i] + Rl + T + Rr);
    }
    const ds = 0.3;                      // sampling step in model units
    // nodes: point (i, s, k) = k-th crossing above (s=+1) or below (s=-1) puncture i
    const key = (i, s, k) => `${i},${s},${k}`;
    const arcs = new Map();              // key -> the two arcs at that crossing: [{id, to, pts}]
    let arcId = 0;
    const addArc = (k1, k2, pts) => {
        if (!arcs.has(k1)) arcs.set(k1, []);
        if (!arcs.has(k2)) arcs.set(k2, []);
        const id = arcId++;
        arcs.get(k1).push({ id, to: k2, pts });
        arcs.get(k2).push({ id, to: k1, pts: pts.slice().reverse() });
    };
    const semicircle = (i, k, side) => {       // side -1 left, +1 right; from top to bottom
        const m = Math.max(6, Math.ceil(Math.PI * k / ds));
        const pts = [];
        for (let j = 0; j <= m; j++) {
            const a = Math.PI / 2 - Math.PI * j / m;   // +90° → −90°
            pts.push([SX[i] + side * k * Math.cos(a), k * Math.sin(a)]);
        }
        return pts;
    };
    for (let i = 0; i < n; i++) {
        for (let k = 1; k <= l[i]; k++) addArc(key(i, 1, k), key(i, -1, k), semicircle(i, k, -1));
        for (let k = 1; k <= r[i]; k++) addArc(key(i, 1, k), key(i, -1, k), semicircle(i, k, 1));
    }
    for (let i = 0; i + 1 < n; i++) {
        const L = [], R = [];
        for (let k = up[i]; k > r[i]; k--) L.push([1, k]);
        for (let k = r[i] + 1; k <= down[i]; k++) L.push([-1, k]);
        for (let k = up[i + 1]; k > l[i + 1]; k--) R.push([1, k]);
        for (let k = l[i + 1] + 1; k <= down[i + 1]; k++) R.push([-1, k]);
        if (L.length !== R.length) throw new Error('These intersection numbers do not describe a curve.');
        const { Rl, Rr } = zones[i];
        const x0 = SX[i], x1 = SX[i] + Rl, x2 = SX[i + 1] - Rr, x3 = SX[i + 1];
        for (let j = 0; j < L.length; j++) {
            const yl = L[j][0] * L[j][1], yr = R[j][0] * R[j][1];
            const pts = [];
            const seg = (xa, xb, f) => {
                const m = Math.max(1, Math.ceil((xb - xa) / ds));
                for (let q = pts.length ? 1 : 0; q <= m; q++) {
                    const x = xa + (xb - xa) * q / m;
                    pts.push([x, f(q / m)]);
                }
            };
            seg(x0, x1, () => yl);
            const span = Math.max(1, Math.abs(yr - yl));
            const m = Math.max(2, Math.ceil(Math.hypot(x2 - x1, span) / ds));
            for (let q = 1; q <= m; q++) {
                const t = q / m, s = t * t * (3 - 2 * t);
                pts.push([x1 + (x2 - x1) * t, yl + (yr - yl) * s]);
            }
            seg(x2, x3, () => yr);
            addArc(key(i, L[j][0], L[j][1]), key(i + 1, R[j][0], R[j][1]), pts);
        }
    }
    // homeomorphism: model → frame → world
    const h = hOverride ?? sim.h;
    const toWorld = (sx, sy) => {
        let X, Y;
        if (sx <= SX[0]) { X = F.X[0] + (sx - SX[0]) * h; Y = F.Y[0] + h * sy; }
        else if (sx >= SX[n - 1]) { X = F.X[n - 1] + (sx - SX[n - 1]) * h; Y = F.Y[n - 1] + h * sy; }
        else {
            let i = 0;
            while (i < n - 2 && sx > SX[i + 1]) i++;
            const t = (sx - SX[i]) / (SX[i + 1] - SX[i]);
            X = F.X[i] + t * (F.X[i + 1] - F.X[i]);
            Y = F.Y[i] + t * (F.Y[i + 1] - F.Y[i]) + h * sy;
        }
        return F.fromFrame(X, Y);
    };
    // trace components
    const used = new Set();
    const loops = [];
    for (const k0 of arcs.keys()) {
        if (used.has(k0)) continue;
        const xs = [], ys = [];
        let cur = k0, cameBy = -1;
        let guard = 0;
        while (guard++ < 1e7) {
            used.add(cur);
            const opts = arcs.get(cur);
            if (opts.length !== 2) throw new Error('layout: a crossing without two arcs');
            // leave by the arc we did not arrive on
            const pick = opts[0].id === cameBy ? opts[1] : opts[0];
            for (let q = 0; q < pick.pts.length - 1; q++) {
                const w = toWorld(pick.pts[q][0], pick.pts[q][1]);
                xs.push(w[0]); ys.push(w[1]);
            }
            cameBy = pick.id;
            cur = pick.to;
            if (cur === k0) break;
        }
        loops.push({ x: xs, y: ys });
    }
    return loops;
}
