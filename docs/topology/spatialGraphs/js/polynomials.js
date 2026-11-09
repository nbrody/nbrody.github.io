// polynomials.js — polynomial invariants read off a diagram: the Alexander and
// Jones polynomials of a knot or link, and the Yamada polynomial of a spatial graph.
//
// A diagram here is a list of paths in the plane, each with a depth at every
// point (smaller depth is nearer the viewer), closed or open. Crossings are found
// geometrically.
//
// The Jones polynomial comes from the Kauffman bracket, summed by a dynamic
// program over crossings: process them one at a time and keep, for each way of
// smoothing the crossings so far, only how the loose ends are paired up (and a
// polynomial weight). Loops that close up are counted as they close.
//
// The Yamada polynomial uses the same machinery. Double every edge of the graph
// into two parallel strands, put the second Jones–Wenzl projector
//     p₂ = id − (1/d)·(cup-cap)
// on each doubled edge, and join the strands around each vertex to their
// neighbours. For a planar graph G the bracket of that picture is
//     ⟨D⟩ = (−1/d)^E (−d)^V Σ_{T⊆E} (−1)^{k(T)} (−d²)^{β(T)},
// since with the edges outside T cut the strands bound a neighbourhood of (V, T),
// which has k + β boundary circles. With σ = −d² that sum is Yamada's
// R(G) = Σ (−1)^{k} σ^{β}, σ = −x − 2 − x⁻¹, at x = A⁴. A crossing of two doubled
// edges satisfies Yamada's three-term skein relation, so the same formula holds
// for any diagram (checked against the skein expansion in tests/polynomials.mjs).

// ------------------------------------------------------------ Laurent polynomials
// { lo, c }: c[i] is the coefficient of x^(lo+i). Coefficients are integers.

export const Poly = {
    zero: () => ({ lo: 0, c: [] }),
    mono: (e, k = 1) => (k ? { lo: e, c: [k] } : { lo: 0, c: [] }),
    from(lo, c) { return trim({ lo, c: c.slice() }); },
    isZero: p => p.c.length === 0,
    add(p, q) {
        if (!p.c.length) return q; if (!q.c.length) return p;
        const lo = Math.min(p.lo, q.lo), hi = Math.max(p.lo + p.c.length, q.lo + q.c.length);
        const c = new Array(hi - lo).fill(0);
        p.c.forEach((v, i) => { c[p.lo + i - lo] += v; });
        q.c.forEach((v, i) => { c[q.lo + i - lo] += v; });
        return trim({ lo, c });
    },
    sub(p, q) { return Poly.add(p, Poly.scale(q, -1)); },
    scale(p, k) { return k ? { lo: p.lo, c: p.c.map(v => v * k) } : Poly.zero(); },
    shift(p, n) { return p.c.length ? { lo: p.lo + n, c: p.c } : p; },
    mul(p, q) {
        if (!p.c.length || !q.c.length) return Poly.zero();
        const c = new Array(p.c.length + q.c.length - 1).fill(0);
        for (let i = 0; i < p.c.length; i++) { const a = p.c[i]; if (a) for (let j = 0; j < q.c.length; j++) c[i + j] += a * q.c[j]; }
        return trim({ lo: p.lo + q.lo, c });
    },
    pow(p, n) { let r = Poly.mono(0); for (let i = 0; i < n; i++) r = Poly.mul(r, p); return r; },
    eq(p, q) { return p.lo === q.lo && p.c.length === q.c.length && p.c.every((v, i) => v === q.c[i]) || (!p.c.length && !q.c.length); },
    hi: p => p.lo + p.c.length - 1,
    /** p(x) ↦ p(x^k) (k may be negative). */
    subst(p, k) {
        const out = new Map();
        p.c.forEach((v, i) => { if (v) out.set((p.lo + i) * k, v); });
        return fromMap(out);
    },
    /** Exact quotient p / q, or null if q does not divide p. */
    div(p, q) {
        if (!q.c.length) return null;
        if (!p.c.length) return Poly.zero();
        const r = p.c.slice(), n = q.c.length, top = q.c[n - 1];
        const m = r.length - n + 1;
        if (m < 1) return null;
        const out = new Array(m).fill(0);
        for (let i = m - 1; i >= 0; i--) {
            const v = r[i + n - 1] / top;
            if (!Number.isInteger(v)) return null;
            out[i] = v;
            if (v) for (let j = 0; j < n; j++) r[i + j] -= v * q.c[j];
        }
        if (r.some(v => v !== 0)) return null;
        return trim({ lo: p.lo - q.lo, c: out });
    },
    evalAt(p, x) { let s = 0; p.c.forEach((v, i) => { s += v * Math.pow(x, p.lo + i); }); return s; },
    safe: p => p.c.every(v => Number.isSafeInteger(v)),
    key: p => (p.c.length ? `${p.lo}:${p.c.join(',')}` : '0'),
    /** TeX, in variable `v`; exponents are multiplied by `unit` (½ for t^{1/2} steps). */
    tex(p, v = 't', den = 1) {
        if (!p.c.length) return '0';
        let s = '';
        for (let i = p.c.length - 1; i >= 0; i--) {
            const k = p.c[i];
            if (!k) continue;
            const e = p.lo + i;
            const mag = Math.abs(k);
            const sign = k < 0 ? '-' : (s ? '+' : '');
            let term;
            if (e === 0) term = String(mag);
            else {
                const g = gcd(Math.abs(e), den), num = e / g, dd = den / g;
                const ex = dd === 1 ? (num === 1 ? '' : `^{${num}}`) : `^{${num < 0 ? '-' : ''}${Math.abs(num)}/${dd}}`;
                term = (mag === 1 ? '' : mag) + v + ex;
            }
            s += sign + term;
        }
        return s;
    },
};

function trim(p) {
    let a = 0, b = p.c.length;
    while (a < b && p.c[a] === 0) a++;
    while (b > a && p.c[b - 1] === 0) b--;
    if (a === b) return { lo: 0, c: [] };
    return { lo: p.lo + a, c: p.c.slice(a, b) };
}

function fromMap(m) {
    if (!m.size) return Poly.zero();
    const es = [...m.keys()], lo = Math.min(...es), hi = Math.max(...es);
    const c = new Array(hi - lo + 1).fill(0);
    for (const [e, v] of m) c[e - lo] += v;
    return trim({ lo, c });
}

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a || 1; }

const ONE = Poly.mono(0);
const D_LOOP = Poly.from(-2, [-1, 0, 0, 0, -1]);          // d = −A² − A⁻²

// ------------------------------------------------------------ crossings of a diagram

const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];

/**
 * paths: [{ pts: [[x, y, depth], …], closed }]. Returns crossings
 * [{ p: [pathA, pathB], pos: [posA, posB], tan: [tA, tB], over: 0|1 }] where pos is
 * segment index + fraction (monotone along the path) and tan the unit 2D tangents.
 */
export function findCrossings(paths) {
    const out = [];
    const segs = [];
    paths.forEach((P, k) => {
        const n = P.pts.length, m = P.closed ? n : n - 1;
        for (let i = 0; i < m; i++) {
            const a = P.pts[i], b = P.pts[(i + 1) % n];
            segs.push({ k, i, a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
        }
    });
    segs.sort((s, t) => s.x0 - t.x0);
    const eps = 1e-10;
    for (let x = 0; x < segs.length; x++) {
        const S = segs[x];
        for (let y = x + 1; y < segs.length && segs[y].x0 <= S.x1; y++) {
            const T = segs[y];
            if (T.y0 > S.y1 || T.y1 < S.y0) continue;
            if (S.k === T.k) {
                const n = paths[S.k].pts.length, d = Math.abs(S.i - T.i);
                if (d <= 1 || (paths[S.k].closed && d === n - 1)) continue;
            }
            const d1 = [S.b[0] - S.a[0], S.b[1] - S.a[1]], d2 = [T.b[0] - T.a[0], T.b[1] - T.a[1]];
            const den = cross2(d1, d2);
            if (Math.abs(den) < 1e-18) continue;
            const r = [T.a[0] - S.a[0], T.a[1] - S.a[1]];
            const t = cross2(r, d2) / den, u = cross2(r, d1) / den;
            if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) continue;
            const za = S.a[2] + t * (S.b[2] - S.a[2]), zb = T.a[2] + u * (T.b[2] - T.a[2]);
            const la = Math.hypot(...d1), lb = Math.hypot(...d2);
            out.push({
                p: [S.k, T.k], pos: [S.i + t, T.i + u],
                tan: [[d1[0] / la, d1[1] / la], [d2[0] / lb, d2[1] / lb]],
                over: za < zb ? 0 : 1,
                pt: [S.a[0] + t * d1[0], S.a[1] + t * d1[1]],
            });
        }
    }
    return out;
}

/** +1 for a right-handed crossing: (over × under) points at the viewer. */
const crossingSign = c => Math.sign(cross2(c.tan[c.over], c.tan[1 - c.over]));

/**
 * Passages along each path, sorted, with in/out segment labels. For a closed path
 * with m passages, segment j runs from passage j to passage j+1 (mod m).
 * Returns { pass: [path][j] = { c, side }, at: Map 'c:side' → { path, j }, labels }.
 */
function passages(paths, X) {
    const pass = paths.map(() => []);
    X.forEach((c, ci) => { for (const s of [0, 1]) pass[c.p[s]].push({ c: ci, side: s, pos: c.pos[s] }); });
    for (const list of pass) list.sort((a, b) => a.pos - b.pos);
    return pass;
}

// ------------------------------------------------------------ the bracket machine

/**
 * Sum over options of every element of weight × d^(loops). Elements:
 * { slots: [label…], options: [{ pairs: [[i, j], …] (slot indices), w: Poly }] }.
 * Every label must occur in exactly two slots overall. Returns null if the
 * state space gets too large.
 */
export function bracketSum(elements, { loop = D_LOOP, maxStates = 250000 } = {}) {
    const order = frontierOrder(elements);
    let states = new Map([['', { m: new Map(), p: ONE }]]);
    const loopPow = [ONE];
    const dPow = k => { while (loopPow.length <= k) loopPow.push(Poly.mul(loopPow[loopPow.length - 1], loop)); return loopPow[k]; };
    for (const ei of order) {
        const el = elements[ei];
        const next = new Map();
        for (const st of states.values()) {
            for (const opt of el.options) {
                const m = new Map(st.m);
                let loops = 0;
                for (const [i, j] of opt.pairs) loops += connect(m, el.slots[i], el.slots[j]);
                const key = keyOf(m);
                const w = Poly.mul(Poly.mul(st.p, opt.w), dPow(loops));
                const old = next.get(key);
                if (old) old.p = Poly.add(old.p, w);
                else next.set(key, { m, p: w });
            }
        }
        for (const [k, s] of next) if (!s.p.c.length) next.delete(k);
        if (next.size > maxStates) return null;
        states = next;
        if (!states.size) return Poly.zero();
    }
    let total = Poly.zero();
    for (const s of states.values()) total = Poly.add(total, s.p);
    return total;
}

/** Join labels x and y through the current element; returns loops closed. */
function connect(m, x, y) {
    if (x === y) return 1;
    const ox = m.get(x), oy = m.get(y);
    if (ox !== undefined && ox === y) { m.delete(x); m.delete(y); return 1; }
    let a = x, b = y;
    if (ox !== undefined) { m.delete(x); m.delete(ox); a = ox; }
    if (oy !== undefined) { m.delete(y); m.delete(oy); b = oy; }
    m.set(a, b); m.set(b, a);
    return 0;
}

function keyOf(m) {
    const ks = [];
    for (const [a, b] of m) if (a < b) ks.push(a * 1048576 + b);
    ks.sort((p, q) => p - q);
    return ks.join(',');
}

/** Greedy order keeping the set of half-used labels small. */
function frontierOrder(elements) {
    const n = elements.length;
    const byLabel = new Map();
    elements.forEach((el, i) => el.slots.forEach(l => { if (!byLabel.has(l)) byLabel.set(l, []); byLabel.get(l).push(i); }));
    const done = new Uint8Array(n), seen = new Map();   // label → times seen
    const order = [];
    const cost = i => { let c = 0; for (const l of elements[i].slots) c += (seen.get(l) || 0) ? -1 : 1; return c; };
    const cand = new Set();
    while (order.length < n) {
        let best = -1, bc = Infinity;
        for (const i of cand) { const c = cost(i); if (c < bc) { bc = c; best = i; } }
        if (best < 0) { for (let i = 0; i < n; i++) if (!done[i]) { best = i; break; } }
        done[best] = 1; cand.delete(best); order.push(best);
        for (const l of elements[best].slots) {
            seen.set(l, (seen.get(l) || 0) + 1);
            for (const j of byLabel.get(l)) if (!done[j]) cand.add(j);
        }
    }
    return order;
}

/**
 * A crossing as a bracket element. `o`, `u`: unit tangents of the over and under
 * strand; labels oIn, oOut, uIn, uOut. Rays counterclockwise from the outgoing
 * over end: r0 = +o, r1, r2 = −o, r3. Turning the over strand counterclockwise
 * sweeps the A-regions (r0,r1) and (r2,r3); the A-smoothing joins them, which
 * leaves arcs r1–r2 and r3–r0.
 */
function crossingElement(o, u, oIn, oOut, uIn, uOut, A = Poly.mono(1), B = Poly.mono(-1)) {
    const ccw = cross2(o, u) > 0;
    const slots = [oOut, ccw ? uOut : uIn, oIn, ccw ? uIn : uOut];
    return { slots, options: [{ pairs: [[1, 2], [3, 0]], w: A }, { pairs: [[0, 1], [2, 3]], w: B }] };
}

// ------------------------------------------------------------ knots and links

/** Conway-normalised Alexander polynomial of a closed path, or null if too big. */
export function alexander(path, X = findCrossings([path])) {
    const pass = passages([path], X)[0];
    const m = pass.length, n = X.length;
    if (n === 0) return ONE;
    // arcs: a new one starts after each under-passage
    const segArc = new Array(m);
    let cur = -1;
    for (let j = 0; j < m; j++) {
        const q = pass[j];
        if (q.side !== X[q.c].over) cur++;
        segArc[j] = cur;
    }
    for (let j = 0; j < m; j++) if (segArc[j] < 0) segArc[j] = cur;
    const underAt = new Array(n), overAt = new Array(n);
    pass.forEach((q, j) => { if (q.side === X[q.c].over) overAt[q.c] = j; else underAt[q.c] = j; });
    const M = Array.from({ length: n }, () => Array.from({ length: n }, () => Poly.zero()));
    const put = (r, col, p) => { M[r][col] = Poly.add(M[r][col], p); };
    X.forEach((c, r) => {
        const ju = underAt[r];
        const i = segArc[(ju - 1 + m) % m], j = segArc[ju], o = segArc[overAt[r]];
        if (crossingSign(c) > 0) { put(r, o, Poly.from(0, [1, -1])); put(r, i, Poly.mono(1)); put(r, j, Poly.mono(0, -1)); }
        else { put(r, o, Poly.from(0, [-1, 1])); put(r, i, Poly.mono(0)); put(r, j, Poly.mono(1, -1)); }
    });
    const minor = M.slice(1).map(row => row.slice(1));
    const D = polyDet(minor);
    if (!D || !Poly.safe(D)) return null;
    return conway(D);
}

/** Make Δ symmetric with Δ(1) = 1. */
function conway(D) {
    if (!D.c.length) return D;
    const hi = Poly.hi(D);
    if ((D.lo + hi) % 2) return D;               // shouldn't happen for a knot
    let P = Poly.shift(D, -(D.lo + hi) / 2);
    if (Poly.evalAt(P, 1) < 0) P = Poly.scale(P, -1);
    return P;
}

/** Fraction-free (Bareiss) determinant of a matrix of polynomials. */
function polyDet(M0) {
    const n = M0.length;
    if (!n) return ONE;
    const M = M0.map(r => r.slice());
    let sign = 1, prev = ONE;
    for (let k = 0; k < n - 1; k++) {
        if (!M[k][k].c.length) {
            let r = k + 1;
            while (r < n && !M[r][k].c.length) r++;
            if (r === n) return Poly.zero();
            [M[k], M[r]] = [M[r], M[k]]; sign = -sign;
        }
        for (let i = k + 1; i < n; i++) {
            for (let j = k + 1; j < n; j++) {
                const num = Poly.sub(Poly.mul(M[i][j], M[k][k]), Poly.mul(M[i][k], M[k][j]));
                const q = Poly.div(num, prev);
                if (!q) return null;
                M[i][j] = q;
            }
            M[i][k] = Poly.zero();
        }
        prev = M[k][k];
    }
    return Poly.scale(M[n - 1][n - 1], sign);
}

/**
 * Jones polynomial of a link given by closed paths, as a Laurent polynomial in
 * s = t^{1/2} (so a knot has only even powers). Null if too big.
 */
export function jones(paths, X = findCrossings(paths), opts = {}) {
    const pass = passages(paths, X);
    let free = 0, base = 0;
    const lab = new Map();                   // 'c:side' → [in, out]
    pass.forEach(list => {
        const m = list.length;
        if (!m) { free++; return; }
        list.forEach((q, j) => lab.set(`${q.c}:${q.side}`, [base + (j - 1 + m) % m, base + j]));
        base += m;
    });
    const elements = X.map((c, ci) => {
        const o = c.over, u = 1 - o;
        const [oIn, oOut] = lab.get(`${ci}:${o}`), [uIn, uOut] = lab.get(`${ci}:${u}`);
        return crossingElement(c.tan[o], c.tan[u], oIn, oOut, uIn, uOut);
    });
    const sum = X.length ? bracketSum(elements, opts) : ONE;
    if (!sum || !Poly.safe(sum)) return null;
    // ⟨D⟩ with ⟨O⟩ = 1
    let br = Poly.mul(sum, Poly.pow(D_LOOP, free));
    br = Poly.div(br, D_LOOP);
    if (!br) return null;
    const w = X.reduce((s, c) => s + crossingSign(c), 0);
    const V = Poly.mul(br, Poly.mono(-3 * w, w % 2 ? -1 : 1));   // (−A³)^(−w)
    // A^e = t^(−e/4) = s^(−e/2)
    if (V.c.some((v, i) => v && (V.lo + i) % 2)) return null;
    return halve(Poly.subst(V, -1));
}

/** Exponents all even → divide them by two. */
function halve(p) {
    const m = new Map();
    p.c.forEach((v, i) => { if (v) m.set((p.lo + i) / 2, v); });
    return fromMap(m);
}

// ------------------------------------------------------------ Yamada polynomial

/**
 * A spatial graph diagram: verts: [[x, y]] (positions of real vertices), edges:
 * [{ a, b, pts: [[x, y, depth], …] }] with pts running from vertex a to vertex b,
 * or { circle: true, pts } for a closed curve without vertices.
 * Returns R(G)(x) normalised up to multiplication by (−x)^k (see yamadaNormalize),
 * or null if the diagram is too large.
 */
export function yamada(diagram, opts = {}) {
    const { edges } = diagram;
    const paths = edges.map(e => ({ pts: e.pts, closed: !!e.circle }));
    const X = findCrossings(paths);
    const nV = diagram.verts.length + edges.filter(e => e.circle).length;
    const nE = edges.length;
    if (opts.maxCrossings != null && X.length > opts.maxCrossings) return null;

    // events along each edge: the projector first, then the strand crossings
    let nextLabel = 0;
    const elements = [];
    const events = edges.map(() => [[], []]);   // per strand (0 = left, 1 = right): [{ key, slotIn, slotOut, el }]
    // p₂ on each edge, weights scaled by d: d·id − cup-cap
    const proj = edges.map((e, ei) => {
        const el = { slots: [null, null, null, null], options: [
            { pairs: [[0, 1], [2, 3]], w: D_LOOP },
            { pairs: [[0, 2], [1, 3]], w: Poly.mono(0, -1) },
        ] };
        elements.push(el);
        // slots: 0 L-in, 1 L-out, 2 R-in, 3 R-out
        events[ei][0].push({ key: [-1, 0], el, sIn: 0, sOut: 1 });
        events[ei][1].push({ key: [-1, 0], el, sIn: 2, sOut: 3 });
        return el;
    });
    const nrm = t => [-t[1], t[0]];
    for (const c of X) {
        for (const X0 of [0, 1]) for (const Y0 of [0, 1]) {
            // strand X0 of side 0's edge meets strand Y0 of side 1's edge
            const dl = [X0 ? -1 : 1, Y0 ? -1 : 1];
            const t0 = c.tan[0], t1 = c.tan[1], n0 = nrm(t0), n1 = nrm(t1);
            const rhs = [dl[1] * n1[0] - dl[0] * n0[0], dl[1] * n1[1] - dl[0] * n0[1]];
            const den = cross2(t0, t1);
            const s0 = cross2(rhs, t1) / den, s1 = cross2(rhs, t0) / den;
            const o = c.over, u = 1 - o;
            const el = { slots: [null, null, null, null], options: null };
            const ccw = cross2(c.tan[o], c.tan[u]) > 0;
            // slot layout as in crossingElement: [oOut, ccw ? uOut : uIn, oIn, ccw ? uIn : uOut]
            const slotOf = (side, isOut) => side === o ? (isOut ? 0 : 2) : (isOut === ccw ? 1 : 3);
            el.options = [{ pairs: [[1, 2], [3, 0]], w: Poly.mono(1) }, { pairs: [[0, 1], [2, 3]], w: Poly.mono(-1) }];
            elements.push(el);
            events[c.p[0]][X0].push({ key: [c.pos[0], s0], el, sIn: slotOf(0, false), sOut: slotOf(0, true) });
            events[c.p[1]][Y0].push({ key: [c.pos[1], s1], el, sIn: slotOf(1, false), sOut: slotOf(1, true) });
        }
    }
    // labels: segments between consecutive events along each strand
    const parent = [];
    const newLabel = () => { parent.push(parent.length); return nextLabel++; };
    const find = l => { while (parent[l] !== l) { parent[l] = parent[parent[l]]; l = parent[l]; } return l; };
    const union = (a, b) => { parent[find(a)] = find(b); };
    const ends = edges.map(() => [null, null]);   // per strand: [firstLabel, lastLabel]
    edges.forEach((e, ei) => {
        for (const s of [0, 1]) {
            const list = events[ei][s].sort((p, q) => p.key[0] - q.key[0] || p.key[1] - q.key[1]);
            let lab = newLabel();
            const first = lab;
            for (const ev of list) {
                ev.el.slots[ev.sIn] = lab;
                lab = newLabel();
                ev.el.slots[ev.sOut] = lab;
            }
            ends[ei][s] = [first, lab];
            if (e.circle) union(first, lab);
        }
    });
    // vertices: strands join their neighbours around each vertex
    const half = diagram.verts.map(() => []);
    edges.forEach((e, ei) => {
        if (e.circle) return;
        const P = e.pts, n = P.length;
        const da = [P[1][0] - P[0][0], P[1][1] - P[0][1]];
        const db = [P[n - 2][0] - P[n - 1][0], P[n - 2][1] - P[n - 1][1]];
        // outward half-edges; left/right as seen looking outward
        half[e.a].push({ ang: Math.atan2(da[1], da[0]), left: ends[ei][0][0], right: ends[ei][1][0] });
        half[e.b].push({ ang: Math.atan2(db[1], db[0]), left: ends[ei][1][1], right: ends[ei][0][1] });
    });
    for (const hs of half) {
        hs.sort((p, q) => p.ang - q.ang);
        for (let i = 0; i < hs.length; i++) union(hs[i].left, hs[(i + 1) % hs.length].right);
    }
    for (const el of elements) el.slots = el.slots.map(find);
    const sum = bracketSum(elements, opts);
    if (!sum || !Poly.safe(sum)) return null;
    // R = B · (−1)^(E−V) / d^V, in A; then x = A⁴
    let R = Poly.scale(sum, (nE - nV) % 2 ? -1 : 1);
    for (let i = 0; i < nV; i++) { R = Poly.div(R, D_LOOP); if (!R) return null; }
    if (R.c.some((v, i) => v && (R.lo + i) % 4)) return null;
    const m = new Map();
    R.c.forEach((v, i) => { if (v) m.set((R.lo + i) / 4, v); });
    return { R: yamadaNormalize(fromMap(m)), crossings: X.length };
}

/** Multiply by (−x)^k so that lowest + highest exponent is 0 or 1. */
export function yamadaNormalize(R) {
    if (!R.c.length) return R;
    const s = R.lo + Poly.hi(R);
    const k = -Math.floor(s / 2);
    return Poly.scale(Poly.shift(R, k), k % 2 ? -1 : 1);
}

// ------------------------------------------------------------ naming knots

// Conway-normalised Alexander polynomials of the prime knots with ≤ 7 crossings,
// coefficients from t^(−g) up. These are all different, so Δ names the knot
// among these (bigger knots can share them).
const ALEX_TABLE = [
    ['3_1', [1, -1, 1]], ['4_1', [-1, 3, -1]],
    ['5_1', [1, -1, 1, -1, 1]], ['5_2', [2, -3, 2]],
    ['6_1', [-2, 5, -2]], ['6_2', [-1, 3, -3, 3, -1]], ['6_3', [1, -3, 5, -3, 1]],
    ['7_1', [1, -1, 1, -1, 1, -1, 1]], ['7_2', [3, -5, 3]], ['7_3', [2, -3, 3, -3, 2]],
    ['7_4', [4, -7, 4]], ['7_5', [2, -4, 5, -4, 2]], ['7_6', [-1, 5, -7, 5, -1]], ['7_7', [1, -5, 9, -5, 1]],
].map(([name, c]) => [name, Poly.from(-(c.length - 1) / 2, c)]);

/**
 * A name for a knot from its Alexander and Jones polynomials: 'unknot', a table
 * name ('3_1'), a connected sum of two ('3_1#4_1'), or null. `chiral` is true when
 * V(t) ≠ V(1/t), which certifies the knot differs from its mirror image.
 */
export function nameKnot(alex, V) {
    const chiral = V ? !Poly.eq(V, Poly.subst(V, -1)) : null;
    if (!alex) return { name: null, chiral };
    const isOne = p => p && Poly.eq(p, ONE);
    if (isOne(alex)) return { name: isOne(V) ? 'unknot' : (V ? 'knotted, Δ = 1' : null), chiral, trivialAlex: true };
    for (const [n, p] of ALEX_TABLE) if (Poly.eq(p, alex)) return { name: n, chiral };
    for (let i = 0; i < ALEX_TABLE.length; i++) {
        const q = Poly.div(alex, ALEX_TABLE[i][1]);
        if (!q) continue;
        for (let j = i; j < ALEX_TABLE.length; j++) if (Poly.eq(q, ALEX_TABLE[j][1])) return { name: `${ALEX_TABLE[i][0]}#${ALEX_TABLE[j][0]}`, chiral };
    }
    return { name: null, chiral };
}
