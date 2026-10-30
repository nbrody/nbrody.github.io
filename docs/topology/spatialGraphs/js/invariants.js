// invariants.js — isotopy invariants read off a projection: the knot determinant
// |Δ(−1)| of every cycle of the graph, and the linking number of every pair of
// disjoint cycles. They cannot change while the shape relaxes, which makes them a
// running check on the isotopy guard; and they say what the graph *is*: a θ-curve
// whose cycles are all unknotted can still be knotted (Kinoshita), but a cycle
// with determinant ≠ 1 is certainly knotted, and Conway–Gordon says the linking
// numbers of the ten pairs of disjoint triangles in K₆ add up to an odd number.

const DIR = normalize([0.2113, 0.3271, 0.9211]);   // a generic direction of projection

function normalize(v) { const l = Math.hypot(...v); return v.map(c => c / l); }

/** Orthonormal frame (u, w) of the plane ⟂ DIR. */
const U = normalize([DIR[1], -DIR[0], 0]);
const W = [DIR[1] * U[2] - DIR[2] * U[1], DIR[2] * U[0] - DIR[0] * U[2], DIR[0] * U[1] - DIR[1] * U[0]];
const proj = p => [p[0] * U[0] + p[1] * U[1] + p[2] * U[2], p[0] * W[0] + p[1] * W[1] + p[2] * W[2], p[0] * DIR[0] + p[1] * DIR[1] + p[2] * DIR[2]];

/**
 * Crossings among closed polylines (each an array of [x,y,z], last ≠ first).
 * Returns [{ a, ia, ta, b, ib, tb, aOver, sign }] with a, b polyline indices and
 * positions ia + ta along them.
 */
export function crossings(polys) {
    const P = polys.map(p => p.map(proj));
    const out = [];
    const segs = [];
    P.forEach((p, k) => { for (let i = 0; i < p.length; i++) segs.push([k, i]); });
    for (let x = 0; x < segs.length; x++) {
        const [ka, ia] = segs[x];
        const pa = P[ka], na = pa.length;
        const p0 = pa[ia], p1 = pa[(ia + 1) % na];
        for (let y = x + 1; y < segs.length; y++) {
            const [kb, ib] = segs[y];
            const pb = P[kb], nb = pb.length;
            if (ka === kb && (Math.abs(ia - ib) <= 1 || Math.abs(ia - ib) === na - 1)) continue;
            const q0 = pb[ib], q1 = pb[(ib + 1) % nb];
            const d1 = [p1[0] - p0[0], p1[1] - p0[1]], d2 = [q1[0] - q0[0], q1[1] - q0[1]];
            const den = d1[0] * d2[1] - d1[1] * d2[0];
            if (Math.abs(den) < 1e-15) continue;
            const r = [q0[0] - p0[0], q0[1] - p0[1]];
            const t = (r[0] * d2[1] - r[1] * d2[0]) / den;
            const u = (r[0] * d1[1] - r[1] * d1[0]) / den;
            if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
            const za = p0[2] + t * (p1[2] - p0[2]), zb = q0[2] + u * (q1[2] - q0[2]);
            const aOver = za > zb;              // nearer the viewer at +DIR
            // sign: (over tangent × under tangent) · DIR
            const o = aOver ? d1 : d2, un = aOver ? d2 : d1;
            const sign = Math.sign(o[0] * un[1] - o[1] * un[0]);
            out.push({ a: ka, ia, ta: t, b: kb, ib, tb: u, aOver, sign });
        }
    }
    return out;
}

/** |Δ(−1)| of a closed polyline, from the colouring matrix of its projection. */
export function knotDeterminant(poly) {
    const C = crossings([poly]);
    const n = C.length;
    if (n === 0) return 1;
    // positions along the curve of each crossing's under- and over-strand
    const under = C.map(c => (c.aOver ? c.ib + c.tb : c.ia + c.ta));
    const over = C.map(c => (c.aOver ? c.ia + c.ta : c.ib + c.tb));
    const order = under.map((u, k) => [u, k]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
    const rank = new Array(n);
    order.forEach((k, r) => { rank[k] = r; });
    // arc r runs from the r-th undercrossing to the (r+1)-th
    const arcOf = s => {
        let lo = -1;
        for (let r = 0; r < n; r++) if (under[order[r]] <= s) lo = r;
        return lo < 0 ? n - 1 : lo;
    };
    const M = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let k = 0; k < n; k++) {
        const r = rank[k];
        const inArc = (r - 1 + n) % n, outArc = r;
        M[k][arcOf(over[k])] += 2;
        M[k][inArc] -= 1;
        M[k][outArc] -= 1;
    }
    return Math.round(Math.abs(det(M.slice(1).map(row => row.slice(1)))));
}

/** Linking number of two disjoint closed polylines. */
export function linkingNumber(A, B) {
    let s = 0;
    for (const c of crossings([A, B])) if (c.a !== c.b) s += c.sign;
    return s / 2;
}

function det(M) {
    const n = M.length;
    if (!n) return 1;
    const a = M.map(r => r.slice());
    let d = 1;
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
        if (Math.abs(a[p][c]) < 1e-12) return 0;
        if (p !== c) { [a[p], a[c]] = [a[c], a[p]]; d = -d; }
        d *= a[c][c];
        for (let r = c + 1; r < n; r++) {
            const f = a[r][c] / a[c][c];
            if (f) for (let k = c; k < n; k++) a[r][k] -= f * a[c][k];
        }
    }
    return d;
}

// ---------------------------------------------------------------- graphs

/** Simple cycles of the topological multigraph, as lists of [edge, reversed]; circles are cycles too. */
export function cycles(g, cap = 400) {
    const out = [];
    g.edges.forEach((e, i) => { if (e.circle || e.a === e.b) out.push([[i, false]]); });
    const arcs = g.edges.map((e, i) => i).filter(i => !g.edges[i].circle && g.edges[i].a !== g.edges[i].b);
    const V = g.vertexNodes.length;
    const inc = Array.from({ length: V }, () => []);
    for (const i of arcs) { const e = g.edges[i]; inc[e.a].push([i, e.b, false]); inc[e.b].push([i, e.a, true]); }
    // each cycle once: start at its least vertex, first edge index < last edge index
    for (let s = 0; s < V && out.length < cap; s++) {
        const usedV = new Uint8Array(V);
        const path = [];
        const dfs = v => {
            if (out.length >= cap) return;
            for (const [ei, w, rev] of inc[v]) {
                if (path.some(p => p[0] === ei)) continue;
                if (w === s && path.length >= 1) {
                    if (path.length === 1 && path[0][0] > ei) continue;     // a 2-cycle, counted once
                    if (path.length >= 2 && path[0][0] > ei) continue;      // other orientation
                    out.push([...path, [ei, rev]]);
                    continue;
                }
                if (w <= s || usedV[w]) continue;
                usedV[w] = 1; path.push([ei, rev]);
                dfs(w);
                path.pop(); usedV[w] = 0;
            }
        };
        usedV[s] = 1;
        dfs(s);
    }
    return out;
}

function cyclePoly(g, cyc) {
    const pts = [];
    for (const [ei, rev] of cyc) {
        let nd = g.edges[ei].nodes;
        if (rev) nd = nd.slice().reverse();
        for (let k = 0; k + 1 < nd.length; k++) pts.push([g.x[3 * nd[k]], g.x[3 * nd[k] + 1], g.x[3 * nd[k] + 2]]);
    }
    return pts;
}

function cycleVertices(g, cyc) {
    const s = new Set();
    for (const [ei] of cyc) { const e = g.edges[ei]; if (!e.circle) { s.add(e.a); s.add(e.b); } }
    return s;
}

/**
 * { cycles: [{ edges, det }], links: [{ i, j, lk }], capped } for cycles that are
 * pairwise vertex-disjoint (only pairs with nonzero linking are listed).
 */
export function graphInvariants(g, cap = 200) {
    const cyc = cycles(g, cap + 1);
    const capped = cyc.length > cap;
    const list = cyc.slice(0, cap).map(c => ({ edges: c, poly: cyclePoly(g, c), verts: cycleVertices(g, c), len: c.length }));
    for (const c of list) c.det = knotDeterminant(c.poly);
    const links = [];
    let pairs = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.edges.some(([e]) => B.edges.some(([f]) => f === e))) continue;
        if ([...A.verts].some(v => B.verts.has(v))) continue;
        pairs++;
        const lk = linkingNumber(A.poly, B.poly);
        if (lk) links.push({ i, j, lk });
    }
    return { cycles: list.map(({ poly, verts, ...c }) => c), links, pairs, capped };
}
