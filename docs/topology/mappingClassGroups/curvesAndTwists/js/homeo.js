// homeo.js — a Dehn twist as a map of the surface, for the animation.
// Near the simple closed geodesic c use Fermi coordinates (s, d): s is arc length along c
// (period ℓ = ℓ(c)) and d the signed distance, positive on the left of c. The twist at time t
// slides the collar |d| < w along c, the two halves in opposite directions:
//     (s, d) ↦ (s + e t (ℓ/2) sign(d) β(|d|), d),     β(0) = 1, β(w) = 0, smooth,
// so the surface tears along c while 0 < t < 1 and closes up at t = 1, where the relative slide
// across c is a whole turn: the map is then the left twist T_c (e = +1) or its inverse.
import { dot, lcross, normPoint, logUnit, expMap, lerpGeo, mapply, toKlein, dist } from './hyp.js';
import { curveFromPoints } from './atlas.js';

const GRID = 64;
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class TwistMap {
    constructor(c, e = 1) {
        this.c = c; this.e = e;
        const S = this.S = c.S, n = c.n;
        this.cum = [0];
        this.u = [];
        for (let k = 0; k < n; k++) {
            const lu = logUnit(c.P[k], c.nextPt(k));
            this.u.push(lu.u);
            this.cum.push(this.cum[k] + lu.d);
        }
        const L = this.L = this.cum[n];
        // the collar: comfortably inside the one the collar lemma guarantees, if that is not too thin
        const lemma = Math.asinh(1 / Math.sinh(L / 2));
        this.w = Math.max(0.03, Math.min(0.22, 0.8 * lemma));
        // the pieces of c in the tiles touching D, with their arc-length offsets, in a Klein grid
        const segs = [];
        for (const pc of c.pieces()) {
            const M = S.wordMatrix(pc.tile);
            const s0 = this.cum[pc.k] + dist(c.P[pc.k], M ? normPoint(mapply(M, pc.a)) : pc.a);
            const len = dist(pc.a, pc.b);
            for (const t of S.starTiles()) {
                const a = t.word.length ? mapply(t.M, pc.a) : pc.a, b = t.word.length ? mapply(t.M, pc.b) : pc.b;
                const mid = normPoint([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
                if (Math.acosh(Math.max(1, mid[2])) > S.R + 0.5 * len + this.w + 1e-9) continue;
                const nr = lcross(a, b), nn = Math.sqrt(Math.max(1e-300, dot(nr, nr)));
                const N = [nr[0] / nn, nr[1] / nn, nr[2] / nn];
                const Ta = logUnit(a, b).u;
                segs.push({ a, b, N, Ta, s0, len });
            }
        }
        this.segs = segs;
        this.cells = new Map();
        segs.forEach((sg, i) => {
            const ka = toKlein(sg.a), kb = toKlein(sg.b), w = this.w;
            const x0 = this.cell(Math.min(ka[0], kb[0]) - w), x1 = this.cell(Math.max(ka[0], kb[0]) + w);
            const y0 = this.cell(Math.min(ka[1], kb[1]) - w), y1 = this.cell(Math.max(ka[1], kb[1]) + w);
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                const key = x * GRID + y;
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(i);
            }
        });
    }
    cell(v) { return Math.max(0, Math.min(GRID - 1, Math.floor((v + 1) * GRID / 2))); }
    // Fermi coordinates of x ∈ D, or null outside the collar
    fermi(x) {
        const list = this.cells.get(this.cell(x[0] / x[2]) * GRID + this.cell(x[1] / x[2]));
        if (!list) return null;
        let best = null, bd = this.w;
        for (const i of list) {
            const sg = this.segs[i];
            const h = dot(x, sg.N), d = Math.asinh(h);
            if (Math.abs(d) >= bd) continue;
            const f = normPoint([x[0] - h * sg.N[0], x[1] - h * sg.N[1], x[2] - h * sg.N[2]]);
            const t = Math.asinh(dot(f, sg.Ta));
            if (t < -1e-7 || t > sg.len + 1e-7) continue;
            bd = Math.abs(d);
            best = { s: sg.s0 + Math.max(0, Math.min(sg.len, t)), d };
        }
        return best;
    }
    // the point with Fermi coordinates (s, d), as a point of D
    pointAt(s, d) {
        const { c, cum, L } = this;
        s = ((s % L) + L) % L;
        let lo = 0, hi = c.n - 1;
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= s) lo = m; else hi = m - 1; }
        const k = lo, tau = s - cum[k], P = c.P[k], u = this.u[k];
        const ch = Math.cosh(tau), sh = Math.sinh(tau);
        const z = normPoint([ch * P[0] + sh * u[0], ch * P[1] + sh * u[1], ch * P[2] + sh * u[2]]);
        const T = [sh * P[0] + ch * u[0], sh * P[1] + ch * u[1], sh * P[2] + ch * u[2]];
        const y = d ? expMap(z, lcross(z, T), d) : z;
        return this.S.reduce(y).p;
    }
    // the slide at signed distance d, at time t
    shift(d, t) { return this.e * t * 0.5 * this.L * Math.sign(d) * smooth(1 - Math.abs(d) / this.w); }
    image(sample, t) {
        const f = sample.f;
        if (!f || t === 0) return sample.x;
        return this.pointAt(f.s + this.shift(f.d, t), f.d);
    }
    // the collar's stripes: point at fraction a ∈ [0,1) along c (before the twist) and v ∈ [−1, 1] across
    stripePoint(a, v, t) {
        const d = v * this.w;
        return this.pointAt(a * this.L + this.shift(d, t), d);
    }
}

// Points along γ, dense where γ is in the collar so that their images stay close together.
// Each sample is {x ∈ D, f = Fermi coordinates or null}; tear[k] marks the step k → k+1 that
// crosses c (where the picture tears during the twist).
export function dragSamples(gamma, tw, step = 0.03) {
    const fine = 0.04 / (1 + 0.75 * tw.L / tw.w);
    const S = gamma.S, out = [];
    for (let k = 0; k < gamma.n; k++) {
        const a = gamma.P[k], b = gamma.nextPt(k), { u, d } = logUnit(a, b);
        const at = s => { const x = S.reduce(s ? expMap(a, u, s) : a).p; return { x, f: tw.fermi(x), s }; };
        const n0 = Math.max(1, Math.ceil(d / step));
        let prev = at(0);
        for (let i = 1; i <= n0; i++) {
            const next = i === n0 ? null : at(d * i / n0);
            const end = next || { f: tw.fermi(S.reduce(b).p), s: d };
            out.push(prev);
            if (prev.f || end.f) {
                const m = Math.ceil((end.s - prev.s) / fine);
                for (let q = 1; q < m; q++) out.push(at(prev.s + (end.s - prev.s) * q / m));
            }
            if (next) prev = next;
        }
    }
    const tear = out.map((p, k) => {
        const q = out[(k + 1) % out.length];
        return !!(p.f && q.f && Math.sign(p.f.d) !== Math.sign(q.f.d));
    });
    return { pts: out, tear, crossings: tear.filter(Boolean).length };
}

export const dragImage = (samples, tw, t) => samples.pts.map(p => tw.image(p, t));

// the curve T_c^e(γ) as the image of γ under the map at t = 1 (not yet pulled tight)
export function dragCurve(samples, tw) {
    return curveFromPoints(tw.S, dragImage(samples, tw, 1));
}
