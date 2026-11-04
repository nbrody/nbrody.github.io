// curve.js — closed curves on S_g and the flow that pulls them tight to geodesics.
// A curve is a cyclic list of vertices P[k] ∈ D. Edge k runs from P[k] to M(W[k])·P[k+1]:
// the word W[k] says which tile the next vertex is in, seen from vertex k. Every computation
// is local (a vertex and its two neighbors), so long curves lose no precision.
import { dot, lcross, normPoint, normSpace, logUnit, expMap, mapply, minv, midpoint, lerpGeo } from './hyp.js';
import { freeReduce, inverseWord } from './surface.js';

export const H_DEFAULT = 0.06;

function thomas(lo, di, up, r, n) {
    const c = new Float64Array(n), d = new Float64Array(n), x = new Float64Array(n);
    c[0] = up[0] / di[0]; d[0] = r[0] / di[0];
    for (let i = 1; i < n; i++) {
        const m = di[i] - lo[i] * c[i - 1];
        c[i] = up[i] / m;
        d[i] = (r[i] - lo[i] * d[i - 1]) / m;
    }
    x[n - 1] = d[n - 1];
    for (let i = n - 2; i >= 0; i--) x[i] = d[i] - c[i] * x[i + 1];
    return x;
}
// row k: lo[k] x[k−1] + di[k] x[k] + up[k] x[k+1] = r[k], indices mod n (Sherman–Morrison)
export function solveCyclic(lo, di, up, r) {
    const n = r.length;
    const alpha = up[n - 1], beta = lo[0], gamma = -di[0];
    const bb = Float64Array.from(di);
    bb[0] = di[0] - gamma;
    bb[n - 1] = di[n - 1] - alpha * beta / gamma;
    const x = thomas(lo, bb, up, r, n);
    const u = new Float64Array(n);
    u[0] = gamma; u[n - 1] = alpha;
    const z = thomas(lo, bb, up, u, n);
    const f = (x[0] + beta * x[n - 1] / gamma) / (1 + z[0] + beta * z[n - 1] / gamma);
    for (let i = 0; i < n; i++) x[i] -= f * z[i];
    return x;
}

export class Curve {
    constructor(S, P = [], W = []) {
        this.S = S;
        this.P = P;
        this.W = W;
        this.trivial = false;
        this.version = 0;
        this.kappa = Infinity;
    }
    get n() { return this.P.length; }
    clone() {
        const c = new Curve(this.S, this.P.map(p => p.slice()), this.W.map(w => w.slice()));
        c.trivial = this.trivial; c.kappa = this.kappa;
        return c;
    }
    reversed() {
        const n = this.n;
        const P = [], W = [];
        for (let i = 0; i < n; i++) {
            P.push(this.P[(n - i) % n].slice());
            W.push(inverseWord(this.W[(2 * n - i - 1) % n]));
        }
        return new Curve(this.S, P, W);
    }

    nextPt(k) {
        const n = this.n, q = this.P[(k + 1) % n], M = this.S.wordMatrix(this.W[k]);
        return M ? normPoint(mapply(M, q)) : q;
    }
    prevPt(k) {
        const n = this.n, km = (k + n - 1) % n, q = this.P[km], M = this.S.wordMatrix(this.W[km]);
        return M ? normPoint(mapply(minv(M), q)) : q;
    }
    edgeLength(k) { return logUnit(this.P[k], this.nextPt(k)).d; }
    length() {
        let L = 0;
        for (let k = 0; k < this.n; k++) L += this.edgeLength(k);
        return L;
    }
    // the cyclic word in π₁ read off by the curve
    word() {
        let w = [];
        for (const x of this.W) w = freeReduce(w.concat(x));
        while (w.length > 1 && w[0] === -w[w.length - 1]) { w.shift(); w.pop(); }
        return w;
    }

    // replace W[k] by the sides its segment actually crosses, if that is the same element
    normalizeEdge(k) {
        const S = this.S;
        const w0 = this.W[k];
        const { word } = S.clip(this.P[k], this.nextPt(k), false);
        if (word.length === w0.length && word.every((x, i) => x === w0[i])) return;
        if (S.sameElement(word, w0)) this.W[k] = word;
    }
    // bring vertex k back into D, updating the two edges at it
    fixVertex(k) {
        const S = this.S, n = this.n;
        if (S.outside(this.P[k]) < 0) return false;
        const { p, word } = S.reduce(this.P[k]);
        if (!word.length) return false;
        const km = (k + n - 1) % n;
        this.P[k] = p;
        if (n === 1) {
            this.W[0] = freeReduce(inverseWord(word).concat(this.W[0], word));
        } else {
            this.W[km] = freeReduce(this.W[km].concat(word));
            this.W[k] = freeReduce(inverseWord(word).concat(this.W[k]));
            this.normalizeEdge(km);
        }
        this.normalizeEdge(k);
        return true;
    }

    // split long edges, merge short ones
    remesh(h = H_DEFAULT) {
        const S = this.S;
        let changed = false;
        // split
        for (let pass = 0; pass < 12; pass++) {
            const P = [], W = [];
            let split = false;
            for (let k = 0; k < this.n; k++) {
                const a = this.P[k], b = this.nextPt(k);
                const d = logUnit(a, b).d;
                P.push(a);
                if (d > 1.6 * h) {
                    const { p: m, word } = S.reduce(midpoint(a, b));
                    W.push(word);
                    P.push(m);
                    W.push(freeReduce(inverseWord(word).concat(this.W[k])));
                    split = true;
                } else W.push(this.W[k]);
            }
            this.P = P; this.W = W;
            if (!split) break;
            changed = true;
        }
        // merge: drop vertex k+1 when edge k is short
        if (this.n > 6) {
            const n = this.n, keep = new Uint8Array(n).fill(1);
            let count = n;
            for (let k = 0; k + 1 < n && count > 6; k++) {
                if (!keep[k]) continue;
                if (this.edgeLength(k) < 0.5 * h) { keep[k + 1] = 0; count--; k++; }
            }
            if (count < n) {
                const P = [], W = [];
                for (let k = 0; k < n; k++) {
                    if (keep[k]) { P.push(this.P[k]); W.push(this.W[k].slice()); }
                    else W[W.length - 1] = freeReduce(W[W.length - 1].concat(this.W[k]));
                }
                this.P = P; this.W = W;
                changed = true;
            }
        }
        if (changed) for (let i = 0; i < this.n; i++) this.normalizeEdge(i);
        if (changed) this.version++;
        return changed;
    }

    // Birkhoff curve shortening: move each vertex toward the midpoint of its neighbors
    // (odd vertices, then even ones). It never lengthens the curve and irons out kinks.
    smooth(w = 1) {
        const n = this.n;
        if (n < 3 || w <= 0) return;
        for (let parity = 0; parity < 2; parity++) {
            for (let k = parity; k < n; k += 2) {
                const m = midpoint(this.prevPt(k), this.nextPt(k));
                this.P[k] = w >= 1 ? m : lerpGeo(this.P[k], m, w);
                this.fixVertex(k);
            }
        }
        this.version++;
    }

    // one damped Newton step of the length functional:
    // (−∂² + 1)ψ = κ is the second variation of length on a hyperbolic surface.
    step({ cap = 0.5 * H_DEFAULT, tangential = 0.5, h = H_DEFAULT } = {}) {
        const n = this.n;
        if (n < 3) { this.remesh(h); return { kappa: Infinity, move: 0 }; }
        const lo = new Float64Array(n), di = new Float64Array(n), up = new Float64Array(n), r = new Float64Array(n);
        const Ns = new Array(n), Ts = new Array(n), tau = new Float64Array(n);
        let kmax = 0, turn = 0;
        for (let k = 0; k < n; k++) {
            const p = this.P[k];
            const la = logUnit(p, this.prevPt(k)), lb = logUnit(p, this.nextPt(k));
            const ea = Math.max(la.d, 1e-9), eb = Math.max(lb.d, 1e-9);
            let T = [lb.u[0] - la.u[0], lb.u[1] - la.u[1], lb.u[2] - la.u[2]];
            if (dot(T, T) < 1e-20) T = lb.u;
            T = normSpace(T);
            const N = normSpace(lcross(p, T));
            const phi = dot([la.u[0] + lb.u[0], la.u[1] + lb.u[1], la.u[2] + lb.u[2]], N);
            const hk = 0.5 * (ea + eb);
            lo[k] = -1 / ea; up[k] = -1 / eb; di[k] = 1 / ea + 1 / eb + hk;
            r[k] = phi;
            Ns[k] = N; Ts[k] = T;
            tau[k] = tangential * 0.5 * (eb - ea);
            kmax = Math.max(kmax, Math.abs(phi) / hk);
            turn = Math.max(turn, Math.abs(phi));
        }
        this.turn = turn;
        const psi = solveCyclic(lo, di, up, r);
        let m = 0;
        for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(psi[k]));
        const s = m > cap ? cap / m : 1;
        let move = 0;
        for (let k = 0; k < n; k++) {
            const a = s * psi[k], b = Math.max(-cap, Math.min(cap, tau[k]));
            const N = Ns[k], T = Ts[k];
            const v = [a * N[0] + b * T[0], a * N[1] + b * T[1], a * N[2] + b * T[2]];
            const len = Math.sqrt(Math.max(0, dot(v, v)));
            if (len > 0) this.P[k] = expMap(this.P[k], [v[0] / len, v[1] / len, v[2] / len], len);
            move = Math.max(move, Math.abs(a));
        }
        for (let k = 0; k < n; k++) this.fixVertex(k);
        this.kappa = kmax;
        this.version++;
        return { kappa: kmax, move };
    }

    // one iteration of the flow (remesh now and then, Birkhoff while kinky, then Newton);
    // maxCap limits how far a vertex moves, for animation. Returns true once converged.
    iterate({ h = H_DEFAULT, tol = 1e-9, maxCap = 4 * H_DEFAULT } = {}) {
        if (this.converged) return true;
        if (this._cap === undefined) { this._cap = 0.5 * h; this._lastL = Infinity; this.turn = Infinity; this._steps = 0; }
        if (this._steps++ % 4 === 0) this.remesh(h);
        if (this.checkTrivial(h)) { this.converged = true; return true; }
        if (this.turn > 0.12) this.smooth(Math.min(1, maxCap / (0.5 * h)));
        const { kappa, move } = this.step({ cap: Math.min(this._cap, maxCap), h });
        const L = this.length();
        // grow the step while the curve gets shorter, shrink it if it does not
        if (L <= this._lastL + 1e-12) this._cap = Math.min(4 * h, this._cap * 1.5);
        else this._cap = Math.max(0.05 * h, this._cap * 0.5);
        this._lastL = L;
        if (kappa < tol && move < tol) { this.remesh(h); this.converged = true; }
        return this.converged;
    }
    // invalidate convergence after the curve has been changed from outside
    touch() { this.converged = false; this._cap = undefined; this.version++; }

    // run to convergence; returns the number of steps taken
    relax({ maxSteps = 400, tol = 1e-9, h = H_DEFAULT } = {}) {
        this.touch();
        let steps = 0;
        while (steps < maxSteps && !this.iterate({ h, tol })) steps++;
        return steps;
    }

    checkTrivial(h = H_DEFAULT) {
        if (this.trivial) return true;
        if (this.n <= 8 && this.length() < 2 * h) {
            const w = this.word();
            if (!w.length || this.length() < 0.2 * h) { this.trivial = true; return true; }
        }
        return false;
    }

    // segments in D for drawing and intersections: {a, b, k, tile} with tile = the prefix of
    // W[k] crossed before this piece (the piece is M(tile)⁻¹ of the actual part of edge k)
    pieces() {
        if (this._pv === this.version && this._pieces) return this._pieces;
        const out = [];
        for (let k = 0; k < this.n; k++) {
            const { word, pieces } = this.S.clip(this.P[k], this.nextPt(k));
            for (let j = 0; j < pieces.length; j++)
                out.push({ a: pieces[j][0], b: pieces[j][1], k, tile: word.slice(0, j) });
        }
        this._pieces = out; this._pv = this.version;
        return out;
    }

    static fromWord(S, word, base = [0.031, 0.017]) {
        const o = normPoint([2 * base[0], 2 * base[1], 1 + base[0] ** 2 + base[1] ** 2]);
        const c = new Curve(S, word.map(() => o.slice()), word.map(x => [x]));
        c.remesh();
        return c;
    }
}
