// pretzel.js — the closed surface of genus g in R³, for the surface view.
// Thicken a row of g circles of radius R, centered at (x_k, 0, 0) with x_k = 2R(k − (g+1)/2), so
// that neighbors touch: the surface is {smin_k d_k = ρ}, d_k the distance to circle k and smin a
// smooth minimum. Seen from above it is a doubled planar region: a top sheet z > 0 and a bottom
// sheet z < 0 glued along the rims (the outer equator and an inner equator around each hole).
//
// The chain c_1, …, c_{2g+1} is the standard one. The odd curves are the slices y = 0 through the
// tubes (around the left end, between neighboring holes, around the right end); the even curves are
// the inner equators of the holes. Turning the surface by π about the x-axis reverses each of them:
// that is the hyperelliptic involution.
//
// The mesh is a polar grid around each hole (rays from the hole's center out to the outer rim, or
// to the line x = x_k ± R where two holes meet), doubled. The chain curves run along mesh edges.

export const PRETZEL = { R: 1, rho: 0.42, K: 0.25 };

function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

export function makePretzel(g, { quarter = 20, radial = 24 } = {}) {
    const { R, rho, K } = PRETZEL;
    const cx = Array.from({ length: g }, (_, k) => 2 * R * (k + 1 - (g + 1) / 2));
    const field = (x, y, z) => {
        let m = Infinity;
        for (const c of cx) {
            const a = Math.hypot(x - c, y) - R;
            const d = Math.sqrt(a * a + z * z);
            m = m === Infinity ? d : smin(m, d, K);
        }
        return m - rho;
    };
    const height = (x, y) => {
        if (field(x, y, 0) >= 0) return 0;
        let lo = 0, hi = rho + K;
        for (let it = 0; it < 42; it++) { const m = 0.5 * (lo + hi); if (field(x, y, m) < 0) lo = m; else hi = m; }
        return 0.5 * (lo + hi);
    };
    const normal = (x, y, z) => {
        const h = 1e-5;
        const v = [field(x + h, y, z) - field(x - h, y, z), field(x, y + h, z) - field(x, y - h, z), field(x, y, z + h) - field(x, y, z - h)];
        const s = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / s, v[1] / s, v[2] / s];
    };

    // ray angles: a quarter's worth of base angles, mirrored into all four quadrants, plus the
    // angle θ_J of the corner where the line between two holes meets the outer rim
    const yJ = Math.sqrt((R + rho + K / 4) ** 2 - R * R), thJ = Math.atan2(yJ, R);
    let base = [];
    for (let i = 0; i <= quarter; i++) base.push(Math.PI / 2 * i / quarter);
    const step = Math.PI / 2 / quarter;
    base = base.filter(b => Math.abs(b - thJ) > 0.35 * step);
    base.push(thJ);
    base.sort((a, b) => a - b);
    const cb = base.map((b, i) => (b === Math.PI / 2 ? 0 : Math.cos(b))), sb = base.map(b => (b === Math.PI / 2 ? 1 : Math.sin(b)));
    const jBase = base.indexOf(thJ);
    const angles = [];             // {b: base index, sx, sy, th}
    const seen = new Set();
    for (let i = 0; i < base.length; i++)
        for (const [sx, sy, th] of [[1, 1, base[i]], [-1, 1, Math.PI - base[i]], [-1, -1, Math.PI + base[i]], [1, -1, 2 * Math.PI - base[i]]]) {
            const key = `${(sx * cb[i]).toFixed(12)},${(sy * sb[i]).toFixed(12)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            angles.push({ b: i, sx: cb[i] === 0 ? 0 : sx, sy: sb[i] === 0 ? 0 : sy, th: th % (2 * Math.PI) });
        }
    angles.sort((a, b) => a.th - b.th);
    const nA = angles.length;
    const j0 = angles.findIndex(a => a.sy === 0 && a.sx > 0), jPi = angles.findIndex(a => a.sy === 0 && a.sx < 0);

    const pos = [], nrm = [];
    const addV = (x, y, z) => {
        pos.push(x, y, z);
        nrm.push(...normal(x, y, z));
        return pos.length / 3 - 1;
    };
    const shared = new Map();
    const sharedV = (key, make) => { let v = shared.get(key); if (v === undefined) shared.set(key, v = make()); return v; };

    // cells[k][j] = {top: [ids along the ray], bot: [ids]}
    const N = radial;
    const cells = [];
    for (let k = 0; k < g; k++) {
        const rays = [];
        for (let j = 0; j < nA; j++) {
            const a = angles[j], c = a.sx * cb[a.b], s = a.sy * sb[a.b];
            const P = r => [cx[k] + r * c, r * s];
            // inner rim
            let lo = 0, hi = R;
            for (let it = 0; it < 60; it++) { const m = 0.5 * (lo + hi); const [x, y] = P(m); if (field(x, y, 0) > 0) lo = m; else hi = m; }
            const rIn = 0.5 * (lo + hi);
            // the line to the neighboring hole, if there is one on this side
            const J = c > 1e-12 && k < g - 1 ? k : c < -1e-12 && k > 0 ? k - 1 : -1;
            const rLine = J >= 0 ? R / Math.abs(c) : Infinity;
            // outer rim: the first sign change beyond the core circle
            let rRim = Infinity;
            for (let r = R; r < Math.min(rLine, R + 2); r += 0.01) {
                const [x1, y1] = P(r + 0.01);
                if (field(x1, y1, 0) > 0) {
                    let l = r, h = r + 0.01;
                    for (let it = 0; it < 60; it++) { const m = 0.5 * (l + h); const [x, y] = P(m); if (field(x, y, 0) < 0) l = m; else h = m; }
                    rRim = 0.5 * (l + h);
                    break;
                }
            }
            const corner = J >= 0 && a.b === jBase;
            const toRim = corner || rRim <= rLine;
            const rEnd = corner ? Math.hypot(R, yJ) : toRim ? rRim : rLine;
            // place N+1 points along the ray, evenly in arc length on the top sheet
            const M = 120, rr = [], ss = [0];
            for (let i = 0; i <= M; i++) {
                const v = i / M, u = toRim ? 0.5 - 0.5 * Math.cos(Math.PI * v) : 1 - Math.cos(0.5 * Math.PI * v);
                rr.push(rIn + (rEnd - rIn) * u);
            }
            const pts = rr.map((r, i) => {
                const [x, y] = P(r);
                return [x, y, i === 0 || (i === M && toRim) ? 0 : height(x, y)];
            });
            for (let i = 1; i <= M; i++) ss.push(ss[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
            const at = t => {             // r at arc-length fraction t
                const target = t * ss[M];
                let i = 1;
                while (i < M && ss[i] < target) i++;
                const f = (target - ss[i - 1]) / Math.max(1e-300, ss[i] - ss[i - 1]);
                return rr[i - 1] + f * (rr[i] - rr[i - 1]);
            };
            const top = [], bot = [];
            // inner rim vertex: shared by both sheets
            const vIn = (() => { const [x, y] = P(rIn); return addV(x, y, 0); })();
            top.push(vIn); bot.push(vIn);
            for (let i = 1; i < N; i++) {
                const [x, y] = P(at(i / N)), z = height(x, y);
                top.push(addV(x, y, z)); bot.push(addV(x, y, -z));
            }
            if (corner) {
                const v = sharedV(`corner:${J}:${a.sy}`, () => addV(cx[k] + Math.sign(c) * R, a.sy * yJ, 0));
                top.push(v); bot.push(v);
            } else if (toRim) {
                const [x, y] = P(rEnd), v = addV(x, y, 0);
                top.push(v); bot.push(v);
            } else {
                const y = R * sb[a.b] / cb[a.b] * a.sy, x = cx[k] + Math.sign(c) * R, z = height(x, y);
                top.push(sharedV(`line:${J}:${a.b}:${a.sy}:+`, () => addV(x, y, z)));
                bot.push(sharedV(`line:${J}:${a.b}:${a.sy}:-`, () => addV(x, y, -z)));
            }
            rays.push({ top, bot });
        }
        cells.push(rays);
    }

    // triangles, oriented with the normal outward. A grid quad (ray j → ray j+1, then outward)
    // runs clockwise seen from above, so on the top sheet it is reversed. The diagonal flips from
    // one quadrant to the next, so that the turns by π take triangles to triangles.
    const tri = [];
    const nV = pos.length / 3;
    for (const rays of cells)
        for (let j = 0; j < nA; j++) {
            const r0 = rays[j], r1 = rays[(j + 1) % nA];
            const mid = 0.5 * (angles[j].th + (j + 1 < nA ? angles[j + 1].th : 2 * Math.PI));
            const diagAC = Math.sin(mid) * Math.cos(mid) > 0;
            for (let i = 0; i < N; i++) {
                for (const sheet of ['top', 'bot']) {
                    const a = r0[sheet][i], b = r1[sheet][i], c = r1[sheet][i + 1], d = r0[sheet][i + 1];
                    const T = diagAC ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
                    if (sheet === 'top') for (let q = 0; q < 6; q += 3) tri.push(T[q], T[q + 2], T[q + 1]);
                    else tri.push(...T);
                }
            }
        }

    // the chain, as closed vertex paths
    const chain = {};
    const ray = (k, j) => cells[k][j];
    const loopOf = (r, rev = false) => {            // a ray's top sheet out, its bottom sheet back
        const out = r.top.slice();
        for (let i = N - 1; i >= 1; i--) out.push(r.bot[i]);
        return rev ? out.reverse() : out;
    };
    chain[1] = loopOf(ray(0, jPi));
    for (let k = 0; k < g; k++) chain[2 * k + 2] = cells[k].map(r => r.top[0]);
    for (let k = 0; k + 1 < g; k++) {
        const a = ray(k, j0), b = ray(k + 1, jPi);
        const path = a.top.slice();                              // hole k → the line, on top
        for (let i = N - 1; i >= 0; i--) path.push(b.top[i]);    // → hole k+1
        for (let i = 1; i <= N; i++) path.push(b.bot[i]);        // back underneath
        for (let i = N - 1; i >= 1; i--) path.push(a.bot[i]);
        chain[2 * k + 3] = path;
    }
    chain[2 * g + 1] = loopOf(ray(g - 1, j0));
    // c_i ∩ c_{i+1}: the inner rim of hole k at angle π (i = 2k+1) and at angle 0 (i = 2k+2)
    const cross = {};
    for (let k = 0; k < g; k++) { cross[2 * k + 1] = cells[k][jPi].top[0]; cross[2 * k + 2] = cells[k][j0].top[0]; }

    const out = {
        g, nV, pos: Float64Array.from(pos), nrm: Float64Array.from(nrm), tri: Uint32Array.from(tri),
        chain, cross, field, cx, extent: [cx[0] - R - rho - 0.1, cx[g - 1] + R + rho + 0.1, R + rho + 0.1, rho + K],
    };
    out.sym = { x: symPerm(out, [1, -1, -1]), y: symPerm(out, [-1, 1, -1]), z: symPerm(out, [-1, -1, 1]) };
    return out;
}

// the vertex permutation induced by (x, y, z) ↦ (sx x, sy y, sz z)
function symPerm(pz, [sx, sy, sz]) {
    const { pos, nV } = pz, h = 1e-4, grid = new Map(), B = 200001;
    const key = (ix, iy, iz) => ((ix + 100000) * B + iy + 100000) * B + iz + 100000;
    for (let v = 0; v < nV; v++) {
        const k = key(Math.round(pos[3 * v] / h), Math.round(pos[3 * v + 1] / h), Math.round(pos[3 * v + 2] / h));
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(v);
    }
    const perm = new Int32Array(nV).fill(-1);
    for (let v = 0; v < nV; v++) {
        const x = sx * pos[3 * v], y = sy * pos[3 * v + 1], z = sz * pos[3 * v + 2];
        const ix = Math.round(x / h), iy = Math.round(y / h), iz = Math.round(z / h);
        let best = -1, bd = 1e-7;
        const look = k => {
            for (const u of grid.get(k) || []) {
                const d = Math.hypot(pos[3 * u] - x, pos[3 * u + 1] - y, pos[3 * u + 2] - z);
                if (d < bd) { bd = d; best = u; }
            }
        };
        look(key(ix, iy, iz));                       // almost always here; else the neighbors
        if (best < 0) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) if (a || b || c) look(key(ix + a, iy + b, iz + c));
        perm[v] = best;
    }
    return perm;
}
