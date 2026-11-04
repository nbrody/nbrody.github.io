// Zipping a curve to a train track.
//
// Cut the plane by the vertical rays above and below each puncture (U_i, D_i).
// Between consecutive punctures, and around each puncture, the arcs of the
// curve from one ray to the next fall into families: arcs in one strip that
// join the same two rays are parallel. Each family becomes a branch of the
// train track: its center line, with the ends slid together at every ray
// into one switch, where the branches meet tangentially.
//
// The zip has two stages.
//  1. Each band closes onto its center line, along the normals to it, the
//     zipper running from the middle of the band outward. It stops short of
//     the rays, where the strands fan out to their crossings. Points on one
//     normal move together and a band never leaves its own region, so nothing
//     crosses.
//  2. The fans zip into the switches and the branches slide into place.
//
// The branches carry the number of strands as weights. At each switch the
// weights on the left and on the right both add up to the strands through it.

import { cutFrame, crossingsAt, getLoops, segsIntersect } from './engine.js';

const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const M = 96;                            // samples along each branch

// cancel consecutive crossings of one edge (bigons), cyclically, keeping positions
function reduceAt(seq) {
    const same = (a, b) => (a.code >> 1) === (b.code >> 1);
    const st = [];
    for (const c of seq) {
        if (st.length && same(st[st.length - 1], c)) st.pop();
        else st.push(c);
    }
    let i = 0, j = st.length - 1;
    while (i < j && same(st[i], st[j])) { i++; j--; }
    return st.slice(i, j + 1);
}

// points of a polyline at M+1 equally spaced arc-length parameters
function resample(pts, cum, rev) {
    const L = cum[cum.length - 1] || 1;
    const out = new Array(M + 1);
    let k = 0;
    for (let s = 0; s <= M; s++) {
        const target = (rev ? 1 - s / M : s / M) * L;
        while (k > 0 && cum[k] > target) k--;
        while (k < cum.length - 2 && cum[k + 1] < target) k++;
        const seg = cum[k + 1] - cum[k];
        const f = seg > 0 ? Math.min(1, Math.max(0, (target - cum[k]) / seg)) : 0;
        out[s] = [pts[k][0] + f * (pts[k + 1][0] - pts[k][0]), pts[k][1] + f * (pts[k + 1][1] - pts[k][1])];
    }
    return out;
}

function cumulative(p) {
    const cum = [0];
    for (let s = 1; s < p.length; s++) cum.push(cum[s - 1] + Math.hypot(p[s][0] - p[s - 1][0], p[s][1] - p[s - 1][1]));
    return cum;
}

function at(path, u) {
    const x = Math.max(0, Math.min(1, u)) * M;
    const s = Math.min(M - 1, Math.floor(x)), f = x - s;
    return [path[s][0] + f * (path[s + 1][0] - path[s][0]), path[s][1] + f * (path[s + 1][1] - path[s][1])];
}

// Replace the end of a branch within distance D of its switch S by a cubic that
// leaves S in direction (dx, dy) and joins the branch smoothly. `fromEnd`
// works on the far end (u = 1) instead.
function tangentEnd(path, S, dx, dy, D, fromEnd) {
    const P = fromEnd ? path.slice().reverse() : path.slice();
    const cum = cumulative(P);
    let k = 2;
    while (k < M - 2 && cum[k] < D) k++;
    const B = P[k], L = cum[k];
    const tb = [P[k + 1][0] - P[k - 1][0], P[k + 1][1] - P[k - 1][1]];
    const tl = Math.hypot(tb[0], tb[1]) || 1;
    const m0 = [dx * L, dy * L], m1 = [tb[0] / tl * L, tb[1] / tl * L];
    for (let s = 0; s < k; s++) {
        const t = s / k, t2 = t * t, t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        P[s] = [h00 * S[0] + h10 * m0[0] + h01 * B[0] + h11 * m1[0], h00 * S[1] + h10 * m0[1] + h01 * B[1] + h11 * m1[1]];
    }
    // even out the samples again
    const out = resample(P, cumulative(P), false);
    return fromEnd ? out.reverse() : out;
}

// The train track carrying the current curve, with the data to animate the zip.
// Returns null when there is nothing to zip.
export function buildTrack(sim) {
    const n = sim.P.length;
    if (!n || !sim.N) return null;
    const F = cutFrame(sim.P);
    const loops = getLoops(sim);
    const families = new Map();          // key -> family
    const switches = new Map();          // edge code -> switch
    const famList = [];
    let zippable = 0;

    loops.forEach((Lp, l) => {
        const xs = Lp.x, ys = Lp.y, m = xs.length, o = sim.starts[l];
        const ray = reduceAt(crossingsAt(xs, ys, F)).filter(c => ((c.code >> 1) % 3) !== 2);
        const r = ray.length;
        if (r < 2) return;
        zippable++;
        for (const c of ray) {
            const e = c.code >> 1;
            let sw = switches.get(e);
            if (!sw) { sw = { e, i: (e / 3) | 0, up: e % 3 === 0, sx: 0, sy: 0, tx: 0, ty: 0, count: 0 }; switches.set(e, sw); }
            // direction of the strand here, pointing right in the cut frame
            const k2 = (c.k + 1) % m;
            let dx = xs[k2] - xs[c.k], dy = ys[k2] - ys[c.k];
            const dl = Math.hypot(dx, dy) || 1;
            const sgn = (dx * F.c + dy * F.s) >= 0 ? 1 : -1;
            sw.sx += c.x; sw.sy += c.y; sw.tx += sgn * dx / dl; sw.ty += sgn * dy / dl; sw.count++;
        }
        for (let j = 0; j < r; j++) {
            const a = ray[j], b = ray[(j + 1) % r];
            const ea = a.code >> 1, eb = b.code >> 1;
            const ia = (ea / 3) | 0;
            const strip = (a.code & 1) ? ia : ia + 1;            // strip s lies between punctures s−1 and s
            const lo = Math.min(ea, eb), hi = Math.max(ea, eb);
            const key = `${strip}:${lo}:${hi}`;
            let fam = families.get(key);
            if (!fam) {
                fam = { id: famList.length, key, strip, ga: lo, gb: hi, arcs: [] };
                families.set(key, fam);
                famList.push(fam);
            }
            const rev = ea > eb;
            const cnt = j < r - 1 ? b.k - a.k : b.k + m - a.k;
            const pts = [[a.x, a.y]], verts = [];
            for (let q = 1; q <= cnt; q++) {
                const v = (a.k + q) % m;
                pts.push([xs[v], ys[v]]);
                verts.push(o + v);
            }
            pts.push([b.x, b.y]);
            fam.arcs.push({ pts, cum: cumulative(pts), rev, verts });
        }
    });
    if (!zippable) return null;
    for (const sw of switches.values()) {
        sw.sx /= sw.count; sw.sy /= sw.count;
        const tl = Math.hypot(sw.tx, sw.ty) || 1;
        sw.tx /= tl; sw.ty /= tl;
    }

    const h = sim.h || 10;
    for (const fam of famList) {
        // the band's center line: the mean of its arcs, ironed (ends kept)
        const mean = Array.from({ length: M + 1 }, () => [0, 0]);
        for (const arc of fam.arcs) {
            const rs = resample(arc.pts, arc.cum, arc.rev);
            for (let s = 0; s <= M; s++) { mean[s][0] += rs[s][0]; mean[s][1] += rs[s][1]; }
        }
        const w = fam.arcs.length;
        for (const p of mean) { p[0] /= w; p[1] /= w; }
        for (let pass = 0; pass < 10; pass++) {
            for (let s = 2; s <= M - 2; s++) {
                mean[s] = [0.5 * mean[s][0] + 0.25 * (mean[s - 1][0] + mean[s + 1][0]),
                           0.5 * mean[s][1] + 0.25 * (mean[s - 1][1] + mean[s + 1][1])];
            }
        }
        fam.mean = mean;
        fam.mcum = cumulative(mean);
        const spread = (k, end) => Math.max(...fam.arcs.map(arc => {
            const q = (arc.rev ? !end : end) ? arc.pts[arc.pts.length - 1] : arc.pts[0];
            return Math.hypot(q[0] - mean[k][0], q[1] - mean[k][1]);
        }));
        const Lm = fam.mcum[M];
        fam.fanA = Math.min(0.35 * Lm, Math.max(2 * h, 3 * spread(0, false)));
        fam.fanB = Math.min(0.35 * Lm, Math.max(2 * h, 3 * spread(M, true)));
        fam.weight = w;
        fam.uturn = ((fam.ga / 3) | 0) === ((fam.gb / 3) | 0);
    }

    // The branches: each center line with its ends slid onto the switches over a
    // merge distance, leaving them along the switch's direction. The merge
    // distance at each switch starts long (smooth switches) and is shortened
    // wherever two branches would cross on their way in.
    const reach = new Map();             // switch -> merge distance
    for (const fam of famList) {
        const L = fam.mcum[M];
        for (const e of [fam.ga, fam.gb]) reach.set(e, Math.min(reach.get(e) ?? Infinity, 0.5 * L));
    }
    const out = (fam, sw) => (fam.strip === sw.i + 1 ? 1 : -1);    // into the strip: right or left
    const branchPath = fam => {
        const A = switches.get(fam.ga), B = switches.get(fam.gb);
        const DA = reach.get(fam.ga), DB = reach.get(fam.gb), L = fam.mcum[M], mean = fam.mean;
        const dA = [A.sx - mean[0][0], A.sy - mean[0][1]], dB = [B.sx - mean[M][0], B.sy - mean[M][1]];
        let path = mean.map((p, s) => {
            const wa = 1 - smooth(fam.mcum[s] / DA), wb = 1 - smooth((L - fam.mcum[s]) / DB);
            return [p[0] + wa * dA[0] + wb * dB[0], p[1] + wa * dA[1] + wb * dB[1]];
        });
        path = tangentEnd(path, [A.sx, A.sy], out(fam, A) * A.tx, out(fam, A) * A.ty, Math.min(0.5 * DA, 4 * h), false);
        path = tangentEnd(path, [B.sx, B.sy], out(fam, B) * B.tx, out(fam, B) * B.ty, Math.min(0.5 * DB, 4 * h), true);
        return path;
    };
    const firstCrossing = paths => {
        for (let a = 0; a < paths.length; a++) for (let b = a + 1; b < paths.length; b++) {
            const P = paths[a], Q = paths[b];
            for (let i = 2; i < M - 2; i++) for (let j = 2; j < M - 2; j++) {
                if (segsIntersect(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], Q[j][0], Q[j][1], Q[j + 1][0], Q[j + 1][1])) return [a, i, b, j];
            }
        }
        return null;
    };
    let paths = famList.map(branchPath);
    for (let round = 0; round < 12; round++) {
        const c = firstCrossing(paths);
        if (!c) break;
        // shorten the merge at the switch nearest the crossing, on the branches involved
        const [a, i, b, j] = c;
        for (const [f, s] of [[a, i], [b, j]]) {
            const fam = famList[f], e = s < M / 2 ? fam.ga : fam.gb;
            reach.set(e, Math.max(2 * h, 0.6 * reach.get(e)));
        }
        paths = famList.map(branchPath);
    }
    famList.forEach((fam, f) => { fam.path = paths[f]; fam.length = cumulative(paths[f])[M]; });

    // Each vertex: its nearest point on the band's center line, found by
    // walking along the arc and the center line together.
    const vf = new Int32Array(sim.N).fill(-1);
    const vu = new Float64Array(sim.N);
    for (const fam of famList) {
        const mean = fam.mean;
        for (const arc of fam.arcs) {
            const order = arc.verts.map((_, q) => q);
            if (arc.rev) order.reverse();
            let s0 = 0;
            for (const q of order) {
                const [px, py] = arc.pts[q + 1];
                let best = Infinity, bs = s0, bt = 0;
                for (let s = s0; s < Math.min(M, s0 + 48); s++) {
                    const ax = mean[s][0], ay = mean[s][1], ex = mean[s + 1][0] - ax, ey = mean[s + 1][1] - ay;
                    const ee = ex * ex + ey * ey;
                    const t = ee > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / ee)) : 0;
                    const d = (px - ax - t * ex) ** 2 + (py - ay - t * ey) ** 2;
                    if (d < best) { best = d; bs = s; bt = t; }
                }
                s0 = bs;
                const g = arc.verts[q];
                vf[g] = fam.id;
                vu[g] = (bs + bt) / M;
            }
        }
    }

    // branches: families joined end to end through switches with one family on each side
    const parent = famList.map((_, f) => f);
    const find = f => { while (parent[f] !== f) f = parent[f] = parent[parent[f]]; return f; };
    const ends = new Map();
    for (const fam of famList) {
        for (const e of [fam.ga, fam.gb]) {
            const i = (e / 3) | 0;
            const side = fam.strip === i + 1 ? 'R' : 'L';
            if (!ends.has(e)) ends.set(e, { L: [], R: [] });
            ends.get(e)[side].push(fam.id);
        }
    }
    let trueSwitches = 0;
    for (const [e, { L, R }] of ends) {
        const sw = switches.get(e);
        sw.left = L.length; sw.right = R.length;
        if (L.length === 1 && R.length === 1) { const a = find(L[0]), b = find(R[0]); if (a !== b) parent[a] = b; }
        else trueSwitches++;
    }
    const groups = new Map();
    for (const fam of famList) {
        const r = find(fam.id);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(fam);
    }
    const branches = [...groups.values()].map(fs => {
        const host = fs.reduce((a, b) => (b.length > a.length ? b : a));
        return { families: fs.map(f => f.id), weight: host.weight, host: host.id };
    });

    return {
        N: sim.N, X: sim.X, sig: punctureSig(sim),
        families: famList.map(f => ({ id: f.id, strip: f.strip, ga: f.ga, gb: f.gb, weight: f.weight, mean: f.mean, mcum: f.mcum, fanA: f.fanA, fanB: f.fanB, path: f.path, uturn: f.uturn, length: f.length })),
        switches: [...switches.values()],
        branches,
        trueSwitches,
        vf, vu,
    };
}

export function punctureSig(sim) {
    return sim.P.map(p => `${p.x.toFixed(6)},${p.y.toFixed(6)}`).join(';');
}

// still describes the curve in sim?
export function trackValid(track, sim) {
    return !!track && track.N === sim.N && track.X === sim.X && track.sig === punctureSig(sim);
}

// how far stage 1 has closed the band at place u: the front runs from the
// middle outward over t ∈ [0, 0.6], and tapers off within the fans
const SOFT = 0.35, T1 = 0.6;
function closure(fam, u, t) {
    const front = t >= T1 ? 1 : smooth((t / T1 * (1 + SOFT) - (1 - 2 * Math.min(u, 1 - u))) / SOFT);
    const x = Math.max(0, Math.min(1, u)) * M, s = Math.min(M - 1, Math.floor(x));
    const c = fam.mcum[s] + (x - s) * (fam.mcum[s + 1] - fam.mcum[s]);
    const taper = smooth(Math.min(c / fam.fanA, (fam.mcum[M] - c) / fam.fanB));
    return front * taper;
}

// Where a point of the curve is at zip parameter t: (ox, oy) is the point, f
// its family, u its place along the band (by the normal to the center line).
export function zipPoint(track, f, u, ox, oy, t) {
    if (f < 0) return [ox, oy];
    const fam = track.families[f];
    const z1 = closure(fam, u, t), z2 = smooth((t - T1) / (1 - T1));
    const [mx, my] = at(fam.mean, u), [px, py] = at(fam.path, u);
    const sx = ox + z1 * (mx - ox), sy = oy + z1 * (my - oy);
    return [sx + z2 * (px - sx), sy + z2 * (py - sy)];
}

// vertex positions with the zip t of the way done
export function zipPositions(track, sim, t, outX, outY) {
    const { X, Y, N } = sim;
    for (let g = 0; g < N; g++) {
        const [x, y] = zipPoint(track, track.vf[g], track.vu[g], X[g], Y[g], t);
        outX[g] = x; outY[g] = y;
    }
}

// The zipped loops as polylines, one flat [x0, y0, x1, y1, …] array per loop.
// A segment whose ends sit far apart along their branch is subdivided along
// it, so the zipper's front is resolved however coarse the curve's vertices.
// With `zs` (and `fs`), also how far each point has closed onto its band's
// center line (0 … 1), and which band it is in.
export function zipLoops(track, sim, t, zs = null, fs = null) {
    const { X, Y } = sim;
    const out = [];
    for (let l = 0; l < sim.starts.length; l++) {
        const o = sim.starts[l], n = sim.lens[l], pts = [], zl = [], fl = [];
        for (let i = 0; i < n; i++) {
            const a = o + i, b = o + (i + 1) % n;
            const fa = track.vf[a];
            const [x, y] = zipPoint(track, fa, track.vu[a], X[a], Y[a], t);
            pts.push(x, y);
            zl.push(fa < 0 ? 0 : closure(track.families[fa], track.vu[a], t));
            fl.push(fa);
            if (fa < 0 || track.vf[b] !== fa) continue;
            const ua = track.vu[a], ub = track.vu[b];
            const m = Math.min(64, Math.ceil(Math.abs(ub - ua) * M / 1.5));
            for (let k = 1; k < m; k++) {
                const s = k / m, u = ua + s * (ub - ua);
                const [qx, qy] = zipPoint(track, fa, u, X[a] + s * (X[b] - X[a]), Y[a] + s * (Y[b] - Y[a]), t);
                pts.push(qx, qy);
                zl.push(closure(track.families[fa], u, t));
                fl.push(fa);
            }
        }
        out.push(pts);
        if (zs) zs.push(zl);
        if (fs) fs.push(fl);
    }
    return out;
}

// Check the switch conditions (weights in = weights out = strands through the switch).
export function switchConditions(track) {
    const bad = [];
    for (const sw of track.switches) {
        let L = 0, R = 0;
        for (const f of track.families) {
            for (const e of [f.ga, f.gb]) {
                if (e !== sw.e) continue;
                if (f.strip === sw.i + 1) R += f.weight; else L += f.weight;
            }
        }
        if (L !== sw.count || R !== sw.count) bad.push({ e: sw.e, L, R, count: sw.count });
    }
    return bad;
}
