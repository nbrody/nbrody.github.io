// symmetry.js — which rigid motions of ℝ³ carry the embedding onto itself?
//
// A rigid symmetry permutes the graph: vertices to vertices, arcs to arcs (perhaps
// reversed), circles to circles (rotated along themselves). So for graphs with
// vertices we run through the automorphisms of the topological multigraph, pair
// up arclength-proportional samples along each arc and its image, and ask for the
// best orthogonal map (Horn's quaternion method, proper and improper). For pure
// links the candidates come from sliding one circle along another. The rigid maps
// that fit within tolerance form a point group, which we name (Schoenflies).

const ARC_SAMPLES = 12;
const CIRCLE_SAMPLES = 96;

// ---------------------------------------------------------------- sampling

/** t ∈ [0,1] ↦ point on edge ei, by arclength (circles are periodic). */
export function edgeSampler(g, ei, x = g.x) {
    const nd = g.edges[ei].nodes;
    const cum = [0];
    for (let k = 1; k < nd.length; k++) {
        const a = 3 * nd[k - 1], b = 3 * nd[k];
        cum.push(cum[k - 1] + Math.hypot(x[b] - x[a], x[b + 1] - x[a + 1], x[b + 2] - x[a + 2]));
    }
    const L = cum[cum.length - 1];
    const circle = g.edges[ei].circle;
    const f = t => {
        if (circle) t -= Math.floor(t);
        else t = Math.min(1, Math.max(0, t));
        const s = t * L;
        let lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
        const u = (s - cum[lo]) / Math.max(1e-12, cum[hi] - cum[lo]);
        const a = 3 * nd[lo], b = 3 * nd[hi];
        return [x[a] + u * (x[b] - x[a]), x[a + 1] + u * (x[b + 1] - x[a + 1]), x[a + 2] + u * (x[b + 2] - x[a + 2])];
    };
    f.length_ = L;
    f.cum = cum;
    return f;
}

// ---------------------------------------------------------------- linear algebra

function jacobi4(A) {
    const a = A.map(r => r.slice());
    const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        let off = 0;
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += a[i][j] * a[i][j];
        if (off < 1e-22) break;
        for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
            if (Math.abs(a[p][q]) < 1e-15) continue;
            const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
            const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < 4; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
            for (let k = 0; k < 4; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
            for (let k = 0; k < 4; k++) { const x = v[k][p], y = v[k][q]; v[k][p] = c * x - s * y; v[k][q] = s * x + c * y; }
        }
    }
    let best = 0;
    for (let i = 1; i < 4; i++) if (a[i][i] > a[best][best]) best = i;
    return [v[0][best], v[1][best], v[2][best], v[3][best]];
}

/** Best rotation R (row-major 3×3) with R·P[i] ≈ Q[i] (both already centred). */
function hornRotation(P, Q) {
    let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
    for (let i = 0; i < P.length; i++) {
        const p = P[i], q = Q[i];
        Sxx += p[0] * q[0]; Sxy += p[0] * q[1]; Sxz += p[0] * q[2];
        Syx += p[1] * q[0]; Syy += p[1] * q[1]; Syz += p[1] * q[2];
        Szx += p[2] * q[0]; Szy += p[2] * q[1]; Szz += p[2] * q[2];
    }
    const N = [
        [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
        [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
        [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
        [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
    ];
    const [w, x, y, z] = jacobi4(N);
    return [
        1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
        2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
        2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
    ];
}

const apply = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
const mul = (A, B) => {
    const C = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[3 * i + j] = A[3 * i] * B[j] + A[3 * i + 1] * B[3 + j] + A[3 * i + 2] * B[6 + j];
    return C;
};
const det3 = R => R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
const frob = (A, B) => Math.sqrt(A.reduce((s, a, i) => s + (a - B[i]) ** 2, 0));
const neg = R => R.map(v => -v);
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Best proper and improper fits for centred correspondences; returns [{R, rms}]. */
function bestFits(P, Q) {
    const out = [];
    const Rp = hornRotation(P, Q);
    out.push({ R: Rp, rms: rms(P, Q, Rp) });
    const Pn = P.map(p => [-p[0], -p[1], -p[2]]);
    const Ri = neg(hornRotation(Pn, Q));          // improper = −(rotation of −P)
    out.push({ R: Ri, rms: rms(P, Q, Ri) });
    return out;
}

function rms(P, Q, R) {
    let s = 0;
    for (let i = 0; i < P.length; i++) {
        const r = apply(R, P[i]), q = Q[i];
        s += (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 + (r[2] - q[2]) ** 2;
    }
    return Math.sqrt(s / P.length);
}

// ---------------------------------------------------------------- automorphisms

/**
 * Vertex permutations of the topological multigraph preserving edge multiplicities.
 * Colour refinement first (a vertex can only go to one of the same colour), then
 * backtracking with a work budget, so a big graph gives up rather than hanging.
 */
function vertexAutomorphisms(g, cap = 50000, budget = 400000) {
    const V = g.vertexNodes.length;
    const mult = Array.from({ length: V }, () => new Array(V).fill(0));
    for (const e of g.edges) {
        if (e.circle) continue;
        if (e.a === e.b) mult[e.a][e.a]++;
        else { mult[e.a][e.b]++; mult[e.b][e.a]++; }
    }
    const nbrs = mult.map(row => row.map((m, w) => (m ? w : -1)).filter(w => w >= 0));
    // colour refinement (1-dimensional Weisfeiler–Leman)
    const deg = g.stars.map(st => st.length);
    let col = relabel(Array.from({ length: V }, (_, v) => `${deg[v]}|${mult[v][v]}`));
    for (let it = 0; it < V; it++) {
        const next = relabel(Array.from({ length: V }, (_, v) =>
            `${col[v]}:${nbrs[v].filter(w => w !== v).map(w => `${col[w]}x${mult[v][w]}`).sort().join(',')}`));
        const same = new Set(next).size === new Set(col).size;
        col = next;
        if (same) break;
    }
    // BFS order so that each new vertex has assigned neighbours to check against
    const order = [], seen = new Array(V).fill(false);
    for (let s0 = 0; s0 < V; s0++) {
        if (seen[s0]) continue;
        const q = [s0]; seen[s0] = true;
        while (q.length) {
            const v = q.shift(); order.push(v);
            for (const w of nbrs[v]) if (!seen[w]) { seen[w] = true; q.push(w); }
        }
    }
    const byCol = new Map();
    for (let v = 0; v < V; v++) { if (!byCol.has(col[v])) byCol.set(col[v], []); byCol.get(col[v]).push(v); }
    const pi = new Array(V).fill(-1), used = new Array(V).fill(false);
    const out = [];
    let work = 0, exhausted = false;
    const rec = k => {
        if (out.length >= cap || exhausted) return;
        if (++work > budget) { exhausted = true; return; }
        if (k === V) { out.push(pi.slice()); return; }
        const v = order[k];
        for (const w of byCol.get(col[v])) {
            if (used[w]) continue;
            let ok = true;
            for (const u of nbrs[v]) if (pi[u] >= 0 && mult[v][u] !== mult[w][pi[u]]) { ok = false; break; }
            if (ok) for (const u of nbrs[w]) {
                // w's neighbours that are already images must come from v's neighbours
                const pre = used[u] ? pi.indexOf(u) : -1;
                if (pre >= 0 && mult[v][pre] !== mult[w][u]) { ok = false; break; }
            }
            if (!ok) continue;
            pi[v] = w; used[w] = true;
            rec(k + 1);
            pi[v] = -1; used[w] = false;
        }
    };
    rec(0);
    return { perms: out, mult, capped: out.length >= cap || exhausted };
}

function relabel(keys) {
    const ids = new Map();
    return keys.map(k => { if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); });
}

function* permutations(arr) {
    if (arr.length <= 1) { yield arr.slice(); return; }
    for (let i = 0; i < arr.length; i++) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        for (const p of permutations(rest)) yield [arr[i], ...p];
    }
}

const factorial = n => (n <= 1 ? 1 : n * factorial(n - 1));

/** All edge maps σ (arc → [arc', reversed]) over a vertex permutation pi, up to `cap`. */
function edgeMaps(g, pi, cap) {
    const arcs = g.edges.map((e, i) => i).filter(i => !g.edges[i].circle);
    const bundles = new Map();
    for (const i of arcs) {
        const e = g.edges[i];
        const key = e.a <= e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`;
        if (!bundles.has(key)) bundles.set(key, []);
        bundles.get(key).push(i);
    }
    const list = [...bundles.values()];
    const choices = [];
    let total = 1;
    for (const B of list) {
        const e0 = g.edges[B[0]];
        const ta = pi[e0.a], tb = pi[e0.b];
        const key = ta <= tb ? `${ta}|${tb}` : `${tb}|${ta}`;
        const T = bundles.get(key);
        if (!T || T.length !== B.length) return [];
        const loop = e0.a === e0.b;
        // too many to list: say so, rather than silently listing only some
        if (factorial(B.length) * (loop ? 2 ** B.length : 1) > 2000) return null;
        const opts = [];
        for (const perm of permutations(T)) {
            if (!loop) {
                opts.push(B.map((src, k) => {
                    const s = g.edges[src], t = g.edges[perm[k]];
                    return [src, perm[k], t.a !== pi[s.a]];
                }));
            } else {
                for (let mask = 0; mask < (1 << B.length); mask++) {
                    opts.push(B.map((src, k) => [src, perm[k], !!(mask & (1 << k))]));
                }
            }
        }
        total *= opts.length;
        choices.push(opts);
    }
    if (total > cap) return null;
    const out = [];
    const rec = (k, acc) => {
        if (k === choices.length) { out.push(acc.slice()); return; }
        for (const o of choices[k]) { acc.push(...o); rec(k + 1, acc); acc.length -= o.length; }
    };
    rec(0, []);
    return out;
}

/**
 * Orbits of the edges under the automorphisms of the topological multigraph
 * (all circles form one orbit). Edges in one orbit have equal length in any
 * embedding that realizes those automorphisms.
 */
export function edgeOrbits(g) {
    const m = g.edges.length;
    const parent = [...Array(m).keys()];
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const join = (a, b) => { parent[find(a)] = find(b); };
    const circles = g.edges.map((e, i) => i).filter(i => g.edges[i].circle);
    for (const i of circles) join(i, circles[0]);
    // parallel edges (and loops at one vertex) can always be swapped; a vertex
    // automorphism carries the bundle at {u, v} onto the bundle at {πu, πv}
    const key = (a, b) => (a <= b ? `${a}|${b}` : `${b}|${a}`);
    const bundles = new Map();
    g.edges.forEach((e, i) => {
        if (e.circle) return;
        const k = key(e.a, e.b);
        if (!bundles.has(k)) bundles.set(k, []);
        bundles.get(k).push(i);
    });
    for (const B of bundles.values()) for (const i of B) join(i, B[0]);
    if (bundles.size) {
        const { perms } = vertexAutomorphisms(g, 4000);
        for (const pi of perms) {
            for (const B of bundles.values()) {
                const e = g.edges[B[0]];
                const T = bundles.get(key(pi[e.a], pi[e.b]));
                if (T) join(B[0], T[0]);
            }
        }
    }
    const ids = new Map();
    return Int32Array.from({ length: m }, (_, i) => {
        const r = find(i);
        if (!ids.has(r)) ids.set(r, ids.size);
        return ids.get(r);
    });
}

// ---------------------------------------------------------------- detection

/**
 * Detect the rigid symmetries of g. Returns
 * { center, Rg, elements: [{R, det, rms, kind, axis, order, map}], group: {name, order},
 *   autCount, realized, tol }
 */
export function detectSymmetry(g, { tol = 0.04, x = g.x } = {}) {
    const samplers = g.edges.map((e, i) => edgeSampler(g, i, x));
    const arcs = g.edges.map((e, i) => i).filter(i => !g.edges[i].circle);
    const circles = g.edges.map((e, i) => i).filter(i => g.edges[i].circle);

    // centre and size from arclength-proportional samples
    const all = [];
    for (const i of arcs) for (let k = 0; k <= ARC_SAMPLES; k++) all.push(samplers[i](k / ARC_SAMPLES));
    for (const i of circles) for (let k = 0; k < CIRCLE_SAMPLES; k++) all.push(samplers[i](k / CIRCLE_SAMPLES));
    const c = [0, 0, 0];
    for (const p of all) for (let j = 0; j < 3; j++) c[j] += p[j] / all.length;
    let Rg = 0;
    for (const p of all) Rg += (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    Rg = Math.sqrt(Rg / all.length) || 1;
    const cen = p => [p[0] - c[0], p[1] - c[1], p[2] - c[2]];

    const circleSamples = circles.map(i => Array.from({ length: CIRCLE_SAMPLES }, (_, k) => cen(samplers[i](k / CIRCLE_SAMPLES))));
    const lengths = g.edges.map((e, i) => samplers[i].length_);

    /** do circles go onto circles under R? returns rms of nearest-sample distances */
    const circleFit = R => {
        if (!circles.length) return 0;
        let s = 0, n = 0;
        for (let a = 0; a < circles.length; a++) {
            for (const p of circleSamples[a]) {
                const q = apply(R, p);
                let best = Infinity;
                for (let b = 0; b < circles.length; b++) {
                    if (Math.abs(lengths[circles[a]] - lengths[circles[b]]) > 0.05 * lengths[circles[a]]) continue;
                    for (const r of circleSamples[b]) {
                        const d = (q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2 + (q[2] - r[2]) ** 2;
                        if (d < best) best = d;
                    }
                }
                s += best; n++;
            }
        }
        // nearest-sample distance overestimates by up to half a sample spacing
        return Math.sqrt(s / n);
    };

    const found = [];
    const consider = (R, fit, map) => {
        if (fit > tol * Rg) return;
        const circ = circleFit(R);
        const slack = circles.length ? 0.5 * Math.max(...circles.map(i => lengths[i])) / CIRCLE_SAMPLES : 0;
        if (circ > tol * Rg + slack) return;
        const total = Math.max(fit, circ - slack);
        const dup = found.find(f => frob(f.R, R) < 0.2);
        if (dup) { if (total < dup.rms) { dup.R = R; dup.rms = total; dup.map = map; } dup.count++; return; }
        found.push({ R, rms: total, map, count: 1 });
    };

    let autCount = null, capped = false;
    if (arcs.length) {
        const { perms, capped: cp } = vertexAutomorphisms(g);
        capped = cp;
        const fracs = Array.from({ length: ARC_SAMPLES + 1 }, (_, k) => k / ARC_SAMPLES);
        const src = [];
        for (const i of arcs) for (const t of fracs) src.push(cen(samplers[i](t)));
        let count = 0;
        const budget = 60000;
        for (const pi of perms) {
            const maps = edgeMaps(g, pi, Math.max(1, Math.floor(budget / Math.max(1, perms.length))));
            if (maps === null) {
                // too many ways to permute parallel edges: let the geometry choose them
                for (const cand of bundleFits(g, pi, samplers, arcs, cen, lengths, Rg, tol)) consider(cand.R, cand.rms, { pi, sigma: cand.sigma });
                continue;
            }
            for (const sigma of maps) {
                count++;
                const dst = [];
                const byArc = new Map(sigma.map(([s, t, rev]) => [s, [t, rev]]));
                for (const i of arcs) {
                    const [t, rev] = byArc.get(i);
                    for (const f of fracs) dst.push(cen(samplers[t](rev ? 1 - f : f)));
                }
                // length check first: σ must preserve arc lengths
                let lenBad = false;
                for (const [s, t] of sigma) if (Math.abs(lengths[s] - lengths[t]) > 0.08 * lengths[s] + 0.02 * Rg) { lenBad = true; break; }
                if (lenBad) continue;
                for (const { R, rms: r } of bestFits(src, dst)) consider(R, r, { pi, sigma });
            }
        }
        autCount = circles.length ? null : count;
    } else if (circles.length) {
        // slide circle 0 along each circle of the same length, both ways
        const i0 = circles[0];
        const P = circleSamples[0];
        for (const j of circles) {
            if (Math.abs(lengths[j] - lengths[i0]) > 0.05 * lengths[i0]) continue;
            for (const rev of [false, true]) {
                const fit = shift => {
                    const Q = P.map((_, k) => cen(samplers[j]((rev ? -k : k) / CIRCLE_SAMPLES + shift)));
                    return bestFits(P, Q);
                };
                for (let k = 0; k < CIRCLE_SAMPLES; k++) {
                    const s0 = k / CIRCLE_SAMPLES;
                    for (const which of [0, 1]) {
                        let r0 = fit(s0)[which].rms;
                        if (r0 > 0.25 * Rg) continue;
                        // refine the shift
                        let lo = s0 - 1 / CIRCLE_SAMPLES, hi = s0 + 1 / CIRCLE_SAMPLES;
                        for (let it = 0; it < 24; it++) {
                            const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
                            if (fit(m1)[which].rms < fit(m2)[which].rms) hi = m2; else lo = m1;
                        }
                        const best = fit((lo + hi) / 2)[which];
                        consider(best.R, best.rms, { circle: j, rev, shift: (lo + hi) / 2 });
                    }
                }
            }
        }
    }

    if (!found.some(f => frob(f.R, IDENTITY) < 0.2)) found.push({ R: IDENTITY.slice(), rms: 0, map: null, count: 1 });
    // a near-miss can leave the set short of a group: close it up (products of symmetries are symmetries)
    for (let pass = 0; pass < 4 && found.length < 130; pass++) {
        let added = false;
        const cur = found.slice();
        for (const a of cur) for (const b of cur) {
            const P = mul(a.R, b.R);
            if (found.some(f => frob(f.R, P) < 0.2)) continue;
            found.push({ R: P, rms: Math.max(a.rms, b.rms), map: null, count: 0, derived: true });
            added = true;
        }
        if (!added) break;
    }
    const elements = found.map(f => describe(f));
    const group = nameGroup(elements);
    const realized = arcs.length && !circles.length ? found.reduce((s, f) => s + (f.map ? 1 : 0), 0) : null;
    return { center: c, Rg, elements, group, autCount, realized, capped, tol };
}

/**
 * Rigid motions realizing the vertex permutation pi when bundles of parallel
 * edges are too big to enumerate: fit the vertices and the centroids of the
 * bundles, then pair each edge with the closest edge (either way round) of
 * the image bundle.
 */
function bundleFits(g, pi, samplers, arcs, cen, lengths, Rg, tol) {
    const key = (a, b) => (a <= b ? `${a}|${b}` : `${b}|${a}`);
    const bundles = new Map();
    for (const i of arcs) { const e = g.edges[i], k = key(e.a, e.b); if (!bundles.has(k)) bundles.set(k, []); bundles.get(k).push(i); }
    const F = 8;
    const pts = i => Array.from({ length: F + 1 }, (_, k) => cen(samplers[i](k / F)));
    const P = new Map(arcs.map(i => [i, pts(i)]));
    const centroid = list => { const c = [0, 0, 0]; let n = 0; for (const i of list) for (const p of P.get(i)) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; } return c.map(v => v / n); };
    const src = [], dst = [];
    g.vertexNodes.forEach((nd, v) => {
        const at = n => cen([g.x[3 * n], g.x[3 * n + 1], g.x[3 * n + 2]]);
        src.push(at(nd)); dst.push(at(g.vertexNodes[pi[v]]));
    });
    for (const [k, B] of bundles) {
        const e = g.edges[B[0]], T = bundles.get(key(pi[e.a], pi[e.b]));
        if (!T || T.length !== B.length) return [];
        src.push(centroid(B)); dst.push(centroid(T));
    }
    // vertices and centroids may all lie on a line (an axis): pin one edge to each of
    // its possible images as well
    const anchor = arcs[0], ea = g.edges[anchor];
    const anchorTargets = bundles.get(key(pi[ea.a], pi[ea.b]));
    const fits = [];
    for (const j of anchorTargets) {
        for (const rev of [false, true]) {
            const f = g.edges[j];
            if (ea.a !== ea.b && (rev ? f.b !== pi[ea.a] : f.a !== pi[ea.a])) continue;
            const A = P.get(anchor), B = P.get(j);
            const s2 = src.concat(A), d2 = dst.concat(A.map((_, k2) => B[rev ? F - k2 : k2]));
            fits.push(...bestFits(s2, d2));
        }
    }
    const out = [];
    for (const { R } of fits) {
        if (out.some(o => frob(o.R, R) < 0.05)) continue;
        const sigma = [];
        let sum = 0, count = 0, ok = true;
        for (const [k, B] of bundles) {
            const e0 = g.edges[B[0]], T = bundles.get(key(pi[e0.a], pi[e0.b])).slice();
            for (const i of B) {
                const e = g.edges[i];
                const img = P.get(i).map(p => apply(R, p));
                let best = null;
                for (const j of T) {
                    if (Math.abs(lengths[i] - lengths[j]) > 0.1 * lengths[i] + 0.02 * Rg) continue;
                    const f = g.edges[j];
                    for (const rev of [false, true]) {
                        if (e0.a !== e0.b && (rev ? f.b !== pi[e.a] : f.a !== pi[e.a])) continue;
                        const Q = P.get(j);
                        let d = 0;
                        for (let k2 = 0; k2 <= F; k2++) { const q = Q[rev ? F - k2 : k2], r = img[k2]; d += (q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2 + (q[2] - r[2]) ** 2; }
                        if (!best || d < best.d) best = { d, j, rev };
                    }
                }
                if (!best) { ok = false; break; }
                T.splice(T.indexOf(best.j), 1);
                sigma.push([i, best.j, best.rev]);
                sum += best.d; count += F + 1;
            }
            if (!ok) break;
        }
        if (!ok) continue;
        const rms = Math.sqrt(sum / count);
        if (rms <= tol * Rg) out.push({ R, rms, sigma });
    }
    return out;
}

/** Classify one orthogonal matrix. */
function describe(f) {
    const R = f.R;
    const d = det3(R);
    const Rp = d > 0 ? R : neg(R);                // the rotation part
    const tr = Rp[0] + Rp[4] + Rp[8];
    const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
    let axis = [Rp[7] - Rp[5], Rp[2] - Rp[6], Rp[3] - Rp[1]];
    let n = Math.hypot(...axis);
    if (n < 1e-3) {
        // angle 0 or π: the axis is a column of Rp + I
        const M = [Rp[0] + 1, Rp[1], Rp[2], Rp[3], Rp[4] + 1, Rp[5], Rp[6], Rp[7], Rp[8] + 1];
        const cols = [[M[0], M[3], M[6]], [M[1], M[4], M[7]], [M[2], M[5], M[8]]];
        axis = cols.reduce((b, col) => (Math.hypot(...col) > Math.hypot(...b) ? col : b));
        n = Math.hypot(...axis);
    }
    axis = n > 1e-9 ? axis.map(v => v / n) : [0, 0, 1];
    const order = rotationOrder(ang);
    let kind;
    if (d > 0) kind = ang < 0.05 ? 'identity' : 'rotation';
    else if (ang < 0.05) kind = 'inversion';                       // −I
    else if (Math.abs(ang - Math.PI) < 0.05) kind = 'mirror';      // −(rotation by π) = reflection
    else kind = 'rotoreflection';
    // for an improper element −Rp, the rotoreflection angle is ang + π
    const sOrder = d < 0 ? rotationOrder(Math.PI - ang) : order;
    return { R, det: Math.sign(d), rms: f.rms, kind, axis, angle: ang, order: d > 0 ? order : sOrder, map: f.map };
}

function rotationOrder(ang) {
    if (ang < 0.05) return 1;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    for (let n = 2; n <= 24; n++) {
        const k = Math.round((ang * n) / (2 * Math.PI));
        if (k >= 1 && gcd(k, n) === 1 && Math.abs(ang - (2 * Math.PI * k) / n) < 0.06) return n;
    }
    return 0;   // not of small finite order
}

/** Schoenflies name from a list of described elements. */
export function nameGroup(elements) {
    const rot = elements.filter(e => e.det > 0);
    const imp = elements.filter(e => e.det < 0);
    const nr = rot.length, order = elements.length;
    // distinct rotation axes and their orders
    const axes = [];
    for (const e of rot) {
        if (e.kind !== 'rotation') continue;
        let a = axes.find(A => Math.abs(A.v[0] * e.axis[0] + A.v[1] * e.axis[1] + A.v[2] * e.axis[2]) > 0.97);
        if (!a) axes.push((a = { v: e.axis, count: 0 }));
        a.count++;
    }
    axes.forEach(a => { a.order = a.count + 1; });
    const n3 = axes.filter(a => a.order === 3).length;
    const n4 = axes.filter(a => a.order === 4).length;
    const n5 = axes.filter(a => a.order === 5).length;
    // a round circle (or a round piece) has a continuous group: many rotations about one axis
    const big = axes.find(a => a.order > 24);
    if (big) {
        const perp2 = axes.some(a => a !== big && Math.abs(dot(a.v, big.v)) < 0.1);
        const mirrorPerp = imp.some(e => e.kind === 'mirror' && Math.abs(dot(e.axis, big.v)) > 0.97);
        const name = perp2 ? (mirrorPerp ? 'D∞h' : 'D∞') : (imp.length ? 'C∞v' : 'C∞');
        return { name, order: Infinity, rotations: Infinity, chiral: !imp.length, closed: true, continuous: true };
    }
    let base, n = 1, main = null;
    if (nr === 1) base = 'C1';
    else if (n5 >= 6 && nr === 60) base = 'I';
    else if (n4 >= 3 && nr === 24) base = 'O';
    else if (n3 >= 4 && nr === 12) base = 'T';
    else if (axes.length === 1) { base = 'C'; n = nr; main = axes[0]; }
    else {
        base = 'D'; n = nr / 2;
        main = axes.reduce((b, a) => (a.order > b.order ? a : b));
        if (n === 2) main = axes[0];
    }
    const has = kind => imp.some(e => e.kind === kind);
    const mirrorPerp = main && imp.some(e => e.kind === 'mirror' && Math.abs(dot(e.axis, main.v)) > 0.97);
    let name;
    if (!imp.length) name = base === 'C1' ? 'C1' : (base === 'C' || base === 'D') ? `${base}${n}` : base;
    else if (base === 'C1') name = has('mirror') ? 'Cs' : 'Ci';
    else if (base === 'C') name = mirrorPerp ? `C${n}h` : has('mirror') ? `C${n}v` : `S${2 * n}`;
    else if (base === 'D') name = mirrorPerp ? `D${n}h` : `D${n}d`;
    else if (base === 'T') name = has('inversion') ? 'Th' : 'Td';
    else name = `${base}h`;
    const chiral = !imp.length;
    return { name, order, rotations: nr, chiral, closed: isClosed(elements) };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function isClosed(elements) {
    for (const a of elements) for (const b of elements) {
        const P = mul(a.R, b.R);
        if (!elements.some(e => frob(e.R, P) < 0.3)) return false;
    }
    return true;
}

// ---------------------------------------------------------------- symmetrize

/**
 * A displacement field toward the average of the embedding over its symmetry
 * group: every bead goes toward the mean of the preimages of its images.
 */
export function symmetrizeField(g, sym, rate = 0.5) {
    const els = sym.elements.filter(e => e.map || e.kind === 'identity');
    return (x, D) => {
        const samplers = g.edges.map((e, i) => edgeSampler(g, i, x));
        // centre from the current samples
        const c = sym.center;
        const inv = R => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
        const back = (R, p) => { const q = apply(inv(R), [p[0] - c[0], p[1] - c[1], p[2] - c[2]]); return [q[0] + c[0], q[1] + c[1], q[2] + c[2]]; };
        const target = new Float64Array(x.length);
        const count = new Float64Array(g.N);
        for (const el of els) {
            const map = el.map;
            if (el.kind === 'identity' || !map) {
                for (let i = 0; i < g.N; i++) { target[3 * i] += x[3 * i]; target[3 * i + 1] += x[3 * i + 1]; target[3 * i + 2] += x[3 * i + 2]; count[i]++; }
                continue;
            }
            if (map.sigma) {
                const byArc = new Map(map.sigma.map(([s, t, rev]) => [s, [t, rev]]));
                g.vertexNodes.forEach((n, v) => {
                    const m = g.vertexNodes[map.pi[v]];
                    const p = back(el.R, [x[3 * m], x[3 * m + 1], x[3 * m + 2]]);
                    target[3 * n] += p[0]; target[3 * n + 1] += p[1]; target[3 * n + 2] += p[2]; count[n]++;
                });
                g.edges.forEach((e, ei) => {
                    if (e.circle) return;
                    const [t, rev] = byArc.get(ei);
                    const cum = samplers[ei].cum, L = samplers[ei].length_;
                    for (let k = 1; k + 1 < e.nodes.length; k++) {
                        const f = cum[k] / L;
                        const p = back(el.R, samplers[t](rev ? 1 - f : f));
                        const n = e.nodes[k];
                        target[3 * n] += p[0]; target[3 * n + 1] += p[1]; target[3 * n + 2] += p[2]; count[n]++;
                    }
                });
            } else if (map.circle !== undefined && g.edges.length === 1) {
                // a knot: slide along itself (for links we only know where circle 0 goes)
                g.edges.forEach((e, ei) => {
                    const j = ei;
                    const cum = samplers[ei].cum, L = samplers[ei].length_;
                    for (let k = 0; k + 1 < e.nodes.length; k++) {
                        const f = cum[k] / L;
                        const p = back(el.R, samplers[j]((map.rev ? -f : f) + map.shift));
                        const n = e.nodes[k];
                        target[3 * n] += p[0]; target[3 * n + 1] += p[1]; target[3 * n + 2] += p[2]; count[n]++;
                    }
                });
            }
        }
        for (let i = 0; i < g.N; i++) {
            if (!count[i]) continue;
            for (let j = 0; j < 3; j++) D[3 * i + j] += rate * (target[3 * i + j] / count[i] - x[3 * i + j]);
        }
    };
}
