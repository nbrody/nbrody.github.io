// The complete hyperbolic metric ρ|dz| on a punctured disk: the disk
// |z − c| < R minus the punctures, with a cusp at each puncture and the
// boundary circle at infinite distance (curvature −1 everywhere). The braid
// group is exactly the mapping class group of this surface.
//
// Write u = log ρ; curvature −1 means Δu = e^{2u}. Two exact solutions are
// glued together:
//   the Poincaré disk,       D(z) = log(2R/(R² − |z − c|²)),
//   a cusp at p, scale s,    C(z) = −log r − log log(s/r),  r = |z − p|,
// into S = D + Σ χ_p (C_p − D) with C² radial cut-offs χ_p, and a bounded
// correction v is solved on a grid:
//   Δv = e^{2S}(e^{2v} − 1) + F,   F = e^{2S} − ΔS  (ΔS exact),
// with v = 0 on the circle and on a small disk at each cusp (where the
// profiles are taken as exact), so every solve is well posed. Nonlinear
// multigrid (full approximation scheme); v is read back with Catmull–Rom
// interpolation so ∇u is continuous.
//
// A cusp's scale s is not known in advance. It is bounded by comparison:
// the surface sits inside the disk minus p alone (s ≤ the disk's conformal
// radius at p) and inside every thrice-punctured sphere Ĉ − {p, a, b} with
// a, b punctures or points off the disk (s ≤ 16|p − a||p − b|/|a − b|);
// the least bound is used. Tests: tests/metric.test.mjs.

'use strict';

// C² cut-off (smootherstep) and derivatives
const sstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
const dsstep = t => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (t - 1) * (t - 1));
const ddsstep = t => (t <= 0 || t >= 1 ? 0 : 60 * t * (t - 1) * (2 * t - 1));

// the disk for a set of punctures (and optionally curve points to contain)
export function chooseDisk(P, extra = [], factor = 1.6) {
    const pts = P.length ? P : extra;
    if (!pts.length) return { cx: 0, cy: 0, R: 400 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let r = 0;
    for (const p of P) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
    let nn = Infinity;
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) nn = Math.min(nn, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y));
    if (!Number.isFinite(nn)) nn = 200;
    let R = factor * r + 0.8 * nn;
    for (const p of extra) R = Math.max(R, 1.12 * Math.hypot(p.x - cx, p.y - cy));
    return { cx, cy, R };
}

export class HyperbolicMetric {
    constructor(P, disk, opts = {}) {
        this.P = P.map(p => ({ x: p.x, y: p.y }));
        this.n = P.length;
        this.disk = disk || chooseDisk(P);
        this.maxM = opts.maxM ?? 320;
        this.res = opts.res ?? 10;              // grid cells across a cusp's half-gap
        this.pinFrac = opts.pinFrac ?? 0.12;
        this.setup();
        if (!opts.noSolve) this.solve();
    }

    setup() {
        const P = this.P, { cx, cy, R } = this.disk;
        // half the distance to the nearest other puncture or to the circle
        this.s = P.map((p, i) => {
            let d = R - Math.hypot(p.x - cx, p.y - cy);
            for (let j = 0; j < P.length; j++) if (j !== i) d = Math.min(d, 0.5 * Math.hypot(p.x - P[j].x, p.y - P[j].y));
            return Math.max(1e-6 * R, d);
        });
        // comparison bounds for the cusp scales
        const ring = [];
        for (let k = 0; k < 48; k++) ring.push({ x: cx + 1.0001 * R * Math.cos(k * Math.PI / 24), y: cy + 1.0001 * R * Math.sin(k * Math.PI / 24) });
        this.sc = P.map((p, i) => {
            const rr = Math.hypot(p.x - cx, p.y - cy);
            let best = (R * R - rr * rr) / R;                  // conformal radius of the disk at p
            const others = P.filter((_, j) => j !== i).concat(ring);
            const np = P.length - 1;
            for (let a = 0; a < others.length; a++) for (let b = a + 1; b < others.length; b++) {
                if (a >= np && (b - a) % 6) continue;          // thin out pairs of ring points
                const A = others[a], B = others[b];
                const val = 16 * Math.hypot(p.x - A.x, p.y - A.y) * Math.hypot(p.x - B.x, p.y - B.y) / Math.hypot(A.x - B.x, A.y - B.y);
                if (val < best) best = val;
            }
            return Math.max(best, this.s[i]);   // keeps log(s/r) > 0 across the zone
        });
        this.half = R;
        const want = 2 * R / (Math.min(R / 4, ...this.s) / this.res);
        let m = 20;
        while (m < want && m < this.maxM) m *= 2;
        this.M = m;
    }

    // the Poincaré disk: value, gradient, Laplacian (= e^{2 value})
    diskPart(x, y) {
        const { cx, cy, R } = this.disk;
        const dx = x - cx, dy = y - cy, r2 = dx * dx + dy * dy;
        const q = Math.max(1e-12 * R * R, R * R - r2);
        return { val: Math.log(2 * R / q), gx: 2 * dx / q, gy: 2 * dy / q, lap: 4 * R * R / (q * q) };
    }

    cusp(r, s) {
        const L = Math.log(s / r);
        return [-Math.log(r) - Math.log(L), -1 / r + 1 / (r * L), 1 / (r * r) - (L - 1) / (r * r * L * L)];
    }

    S(x, y, wantLap = false) {
        const D = this.diskPart(x, y);
        let val = D.val, gx = D.gx, gy = D.gy, lap = wantLap ? D.lap : 0;
        for (let i = 0; i < this.n; i++) {
            const rx = x - this.P[i].x, ry = y - this.P[i].y, r = Math.hypot(rx, ry);
            const a = 0.25 * this.s[i], b = 0.75 * this.s[i];
            if (r >= b) continue;
            const rr = Math.max(r, 1e-12 * this.s[i]);
            const [C, C1, C2] = this.cusp(rr, this.sc[i]);
            const ux = rx / rr, uy = ry / rr;
            const w = b - a, t = (r - a) / w;
            const chi = 1 - sstep(t), chi1 = -dsstep(t) / w, chi2 = -ddsstep(t) / (w * w);
            const d = C - D.val;
            val += chi * d;
            gx += chi1 * d * ux + chi * (C1 * ux - D.gx);
            gy += chi1 * d * uy + chi * (C1 * uy - D.gy);
            if (wantLap) {
                const lapChi = chi2 + chi1 / rr, lapC = C2 + C1 / rr;
                lap += lapChi * d + 2 * chi1 * (C1 - (D.gx * ux + D.gy * uy)) + chi * (lapC - D.lap);
            }
        }
        return { val, gx, gy, lap };
    }

    // ---- grid: A(v) = Δv − K(e^{2v} − 1) = F

    makeGrid(m) {
        const N = m + 1, { cx, cy, R } = this.disk;
        const hg = 2 * this.half / m;
        const x0 = cx - this.half, y0 = cy - this.half;
        const K = new Float64Array(N * N), F = new Float64Array(N * N), fixed = new Uint8Array(N * N);
        let scale = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const k = j * N + i, x = x0 + i * hg, y = y0 + j * hg;
            if (i === 0 || j === 0 || i === m || j === m || Math.hypot(x - cx, y - cy) > R - 0.5 * hg) { fixed[k] = 1; continue; }
            let pin = false;
            for (let q = 0; q < this.n; q++) {
                if (Math.hypot(x - this.P[q].x, y - this.P[q].y) < Math.max(this.pinFrac * this.s[q], 0.75 * hg)) pin = true;
            }
            if (pin) { fixed[k] = 1; continue; }
            const S = this.S(x, y, true);
            const e2 = Math.exp(2 * S.val);
            K[k] = e2;
            F[k] = e2 - S.lap;
            scale = Math.max(scale, Math.abs(F[k]), e2);
        }
        return { m, N, hg, x0, y0, K, F, fixed, v: new Float64Array(N * N), f: F, scale };
    }

    op(g, v, k) {
        const ih2 = 1 / (g.hg * g.hg), N = g.N;
        return (v[k - 1] + v[k + 1] + v[k - N] + v[k + N] - 4 * v[k]) * ih2 - g.K[k] * (Math.exp(2 * v[k]) - 1);
    }

    smooth(g, sweeps) {
        const { N, hg, K, fixed, v, f } = g;
        const ih2 = 1 / (hg * hg);
        for (let s = 0; s < sweeps; s++) {
            for (let color = 0; color < 2; color++) {
                for (let j = 1; j < N - 1; j++) {
                    for (let i = 1 + ((j + color) & 1); i < N - 1; i += 2) {
                        const k = j * N + i;
                        if (fixed[k]) continue;
                        const e = Math.exp(2 * v[k]);
                        const A = (v[k - 1] + v[k + 1] + v[k - N] + v[k + N] - 4 * v[k]) * ih2 - K[k] * (e - 1);
                        v[k] += (f[k] - A) / (-4 * ih2 - 2 * K[k] * e);
                    }
                }
            }
        }
    }

    residualNorm(g) {
        let m = 0;
        for (let j = 1; j < g.N - 1; j++) for (let i = 1; i < g.N - 1; i++) {
            const k = j * g.N + i;
            if (!g.fixed[k]) m = Math.max(m, Math.abs(g.f[k] - this.op(g, g.v, k)));
        }
        return m;
    }

    vcycle(l) {
        const g = this.levels[l];
        if (l === 0) { this.smooth(g, 400); return; }
        this.smooth(g, 3);
        const c = this.levels[l - 1];
        const Nf = g.N, Nc = c.N;
        const r = new Float64Array(Nf * Nf);
        for (let j = 1; j < Nf - 1; j++) for (let i = 1; i < Nf - 1; i++) {
            const k = j * Nf + i;
            if (!g.fixed[k]) r[k] = g.f[k] - this.op(g, g.v, k);
        }
        const v0 = new Float64Array(Nc * Nc);
        for (let J = 0; J < Nc; J++) for (let I = 0; I < Nc; I++) v0[J * Nc + I] = g.v[(2 * J) * Nf + 2 * I];
        c.v.set(v0);
        c.f = new Float64Array(Nc * Nc);
        for (let J = 1; J < Nc - 1; J++) for (let I = 1; I < Nc - 1; I++) {
            const K = J * Nc + I;
            if (c.fixed[K]) continue;
            const k = (2 * J) * Nf + 2 * I;
            const rr = (4 * r[k] + 2 * (r[k - 1] + r[k + 1] + r[k - Nf] + r[k + Nf]) +
                r[k - Nf - 1] + r[k - Nf + 1] + r[k + Nf - 1] + r[k + Nf + 1]) / 16;
            c.f[K] = this.op(c, v0, K) + rr;
        }
        this.vcycle(l - 1);
        for (let j = 1; j < Nf - 1; j++) for (let i = 1; i < Nf - 1; i++) {
            const k = j * Nf + i;
            if (g.fixed[k]) continue;
            const I = i >> 1, J = j >> 1, ti = (i & 1) * 0.5, tj = (j & 1) * 0.5;
            const e = K2 => (c.fixed[K2] ? 0 : c.v[K2] - v0[K2]);
            const a = e(J * Nc + I), b = ti ? e(J * Nc + I + 1) : 0, cc = tj ? e((J + 1) * Nc + I) : 0, d = ti && tj ? e((J + 1) * Nc + I + 1) : 0;
            g.v[k] += (1 - ti) * (1 - tj) * a + ti * (1 - tj) * b + (1 - ti) * tj * cc + ti * tj * d;
        }
        this.smooth(g, 3);
    }

    solve(cycles = 40, start = null) {
        if (this.n === 0) { this.grid = null; return; }
        const Ms = [];
        for (let m = 20; m <= this.M; m *= 2) Ms.push(m);
        this.levels = Ms.map(m => this.makeGrid(m));
        const fine = this.levels[this.levels.length - 1];
        if (start && start.length === fine.v.length) fine.v.set(start);
        let r0 = Infinity;
        for (let cycle = 0; cycle < cycles; cycle++) {
            this.vcycle(this.levels.length - 1);
            const r = this.residualNorm(fine);
            if (r < 1e-9 * fine.scale || (r > 0.8 * r0 && cycle > 4)) break;
            r0 = r;
        }
        this.grid = fine;
        this.levels = null;
    }

    // same disk, punctures moved a little: start from the old correction
    refresh(P, cycles = 4) {
        const moved = P.length !== this.n || P.some((p, i) => p.x !== this.P[i].x || p.y !== this.P[i].y);
        if (!moved) return false;
        const old = this.grid, oldM = this.M;
        this.P = P.map(p => ({ x: p.x, y: p.y }));
        this.n = P.length;
        this.setup();
        const warm = old && this.M === oldM;
        this.solve(warm ? cycles : 40, warm ? old.v : null);
        return true;
    }

    // ---- evaluation

    vAt(x, y) {
        const g = this.grid;
        if (!g) return [0, 0, 0];
        const fx = (x - g.x0) / g.hg, fy = (y - g.y0) / g.hg;
        const i = Math.floor(fx), j = Math.floor(fy);
        if (i < 1 || j < 1 || i > g.m - 3 || j > g.m - 3) return [0, 0, 0];
        const tx = fx - i, ty = fy - j;
        const w = t => [((-t + 2) * t - 1) * t / 2, ((3 * t - 5) * t * t + 2) / 2, ((-3 * t + 4) * t + 1) * t / 2, (t - 1) * t * t / 2];
        const dw = t => [(-3 * t * t + 4 * t - 1) / 2, (9 * t * t - 10 * t) / 2, (-9 * t * t + 8 * t + 1) / 2, (3 * t * t - 2 * t) / 2];
        const wx = w(tx), wy = w(ty), dx = dw(tx), dy = dw(ty);
        let val = 0, gx = 0, gy = 0;
        for (let b = 0; b < 4; b++) {
            const row = (j - 1 + b) * g.N + (i - 1);
            for (let a = 0; a < 4; a++) {
                const f = g.v[row + a];
                val += wx[a] * wy[b] * f;
                gx += dx[a] * wy[b] * f;
                gy += wx[a] * dy[b] * f;
            }
        }
        return [val, gx / g.hg, gy / g.hg];
    }

    // u = log ρ and its gradient (outside the disk: pushed back in, hard)
    u(x, y) {
        const { cx, cy, R } = this.disk;
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
        if (r > 0.999 * R) {
            const f = 0.999 * R / r;
            const inner = this.u(cx + dx * f, cy + dy * f);
            return { val: inner.val + (r - 0.999 * R) / (0.001 * R), gx: inner.gx + dx / r * 1e3 / R, gy: inner.gy + dy / r * 1e3 / R };
        }
        const S = this.S(x, y);
        const [v, vx, vy] = this.vAt(x, y);
        return { val: S.val + v, gx: S.gx + vx, gy: S.gy + vy };
    }

    rho(x, y) { return Math.exp(this.u(x, y).val); }

    curvature(x, y, eps) {
        const f = (p, q) => this.u(p, q).val;
        const lap = (f(x + eps, y) + f(x - eps, y) + f(x, y + eps) + f(x, y - eps) - 4 * f(x, y)) / (eps * eps);
        return -lap / Math.exp(2 * f(x, y));
    }
}
