// network.js — Chapter 4: a network of neurons in 3D.
//
// Somata sit mostly in a thin outer shell (a cortex) around a sparser core.
// Each neuron sends an axon to three near neighbours. Spikes are scheduled
// once at start with a branching process tuned near criticality — each
// spike makes its target fire with probability p, three targets each, so
// σ = 3p ≈ 1 — which gives the "neuronal avalanches" seen in real cortex:
// mostly small cascades, occasionally one that sweeps the whole network.
// The schedule is stored, so any moment is a lookup (free seeking).

import { SHAPE } from '../../gfx/renderer.js';
import { RNG, lerp, smoothstep } from '../../lib/math.js';

export const N = 260;
const MAXDELAY = 1.8;

function rateAt(T) {
  if (T < 10) return 0;
  if (T < 34) return lerp(0.008, 0.07, smoothstep(10, 30, T));
  if (T < 56) return 0.085 * (T > 50 ? 1.6 : 1);
  if (T < 86) return 0.05;
  if (T < 104) return 0.012;
  return 0.02;
}
const sigmaAt = (T) => (T < 34 ? lerp(0.75, 0.93, smoothstep(10, 34, T)) : T < 56 ? 0.97 : 0.9);

export class Network {
  constructor() {
    const rng = new RNG(4040);
    this.pos = [];
    this.pos.push([0, 0, 0]);  // the first neuron
    while (this.pos.length < N) {
      const d = rng.dir3();
      const shell = rng.next() < 0.72;
      const r = shell ? 0.82 + 0.18 * rng.next() : Math.cbrt(rng.next()) * 0.75;
      this.pos.push([d[0] * r * 1.35, d[1] * r * 0.85, d[2] * r * 0.95]);
    }
    // dendrites: short branching offsets; the first neuron gets an elaborate arbor
    this.dend = this.pos.map((_, i) => {
      const segs = [];
      const grow = (p, dir, len, depth, maxDepth) => {
        const q = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
        segs.push([p, q, depth]);
        if (depth >= maxDepth) return;
        for (let k = 0; k < 2; k++) {
          const nd = rng.dir3();
          const d2 = [dir[0] + nd[0] * 0.7, dir[1] + nd[1] * 0.7, dir[2] + nd[2] * 0.7];
          const l = Math.hypot(...d2);
          grow(q, [d2[0] / l, d2[1] / l, d2[2] / l], len * 0.7, depth + 1, maxDepth);
        }
      };
      const n = i === 0 ? 7 : rng.int(4, 6);
      for (let k = 0; k < n; k++) grow([0, 0, 0], rng.dir3(), i === 0 ? 0.09 : 0.035, 0, i === 0 ? 3 : 1);
      return segs;
    });
    // axons: three of the ten nearest neighbours, curved
    this.edges = [];
    this.out = this.pos.map(() => []);
    for (let i = 0; i < N; i++) {
      const near = this.pos.map((p, j) => [j, (p[0] - this.pos[i][0]) ** 2 + (p[1] - this.pos[i][1]) ** 2 + (p[2] - this.pos[i][2]) ** 2])
        .filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 10);
      for (let k = 0; k < 3; k++) {
        const [j, d2] = near.splice(rng.int(0, near.length - 1), 1)[0];
        const a = this.pos[i], b = this.pos[j];
        const bend = rng.dir3(), bl = Math.sqrt(d2) * 0.35;
        const c = [(a[0] + b[0]) / 2 + bend[0] * bl, (a[1] + b[1]) / 2 + bend[1] * bl, (a[2] + b[2]) / 2 + bend[2] * bl];
        const pts = [];
        for (let s = 0; s <= 8; s++) {
          const u = s / 8, v = 1 - u;
          pts.push([v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1], v * v * a[2] + 2 * v * u * c[2] + u * u * b[2]]);
        }
        const e = { i, j, pts, delay: Math.min(MAXDELAY, 0.25 + Math.sqrt(d2) * 2.4) };
        this.edges.push(e);
        this.out[i].push(this.edges.length - 1);
      }
    }
    this._schedule(rng);
  }

  _schedule(rng) {
    const fires = [];     // [t, i]
    const spikes = [];    // [t0, t1, edge]
    const last = new Float32Array(N).fill(-9);
    const pending = [];   // arrivals: [t, j]
    const fire = (t, i) => {
      if (t - last[i] < 0.55) return;
      last[i] = t;
      fires.push([t, i]);
      for (const ei of this.out[i]) {
        const e = this.edges[ei];
        spikes.push([t, t + e.delay, ei]);
        pending.push([t + e.delay, e.j]);
      }
    };
    // the first thoughts: neuron 0 fires alone in the dark
    const scripted = [3.0, 6.4, 8.7];
    const dt = 1 / 60;
    let recent = 0, win = 0;
    for (let t = 0; t < 124; t += dt) {
      for (const s of scripted) if (s >= t && s < t + dt) fire(s, 0);
      const r = rateAt(t);
      if (r > 0) for (let i = 0; i < N; i++) if (rng.next() < r * dt) fire(t, i);
      pending.sort((a, b) => a[0] - b[0]);
      const p = sigmaAt(t) / 3 * (recent > 90 ? 0.6 : 1);
      while (pending.length && pending[0][0] <= t) {
        const [ta, j] = pending.shift();
        if (t < 10 && j !== 0) { if (rng.next() < 0.15) fire(ta, j); continue; }
        if (rng.next() < p) fire(ta, j);
      }
      while (win < fires.length && fires[win][0] < t - 1) win++;
      recent = fires.length - win;
    }
    fires.sort((a, b) => a[0] - b[0]);
    spikes.sort((a, b) => a[0] - b[0]);
    this.fires = fires;
    this.spikes = spikes;
    this.fireT = new Float32Array(fires.map((f) => f[0]));
    this.spikeT = new Float32Array(spikes.map((s) => s[0]));
  }

  /** Index of the first entry with time ≥ t. */
  static lower(arr, t) {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < t) lo = m + 1; else hi = m; }
    return lo;
  }

  /** Recent activity per neuron at T: 0..1 (flash that decays over ~0.6 s). */
  activity(T, out) {
    out.fill(0);
    for (let k = Network.lower(this.fireT, T - 0.7); k < this.fires.length && this.fires[k][0] <= T; k++) {
      const [t, i] = this.fires[k];
      out[i] = Math.max(out[i], Math.exp(-(T - t) * 5));
    }
    return out;
  }

  /**
   * Draw the network. cam(p) → [sx, sy, z, k] projects a world point; k is px per
   * world unit / 100. opts: { T, alpha, tint(i) → [r,g,b], posOf(i) → world
   * position, boost(i) → 0..1 extra light, lines (0..1), glowScale }
   */
  draw(R, cam, o) {
    const { T, alpha } = o;
    if (alpha <= 0.001) return;
    const S = R.sprites, L = R.lines;
    const act = this.activity(T, this._act || (this._act = new Float32Array(N)));
    const P = this.pos.map((_, i) => cam(o.posOf ? o.posOf(i) : this.pos[i]));
    const offset = (i, p) => {
      if (!o.posOf) return p;
      const q = o.posOf(i), b = this.pos[i];
      return [p[0] + q[0] - b[0], p[1] + q[1] - b[1], p[2] + q[2] - b[2]];
    };
    // axons
    const lineA = o.lines ?? 1;
    if (lineA > 0.01) {
      for (const e of this.edges) {
        const c = o.tint(e.i);
        const a0 = alpha * lineA * (0.05 + 0.25 * act[e.i]);
        let prev = cam(offset(e.i, e.pts[0]));
        for (let s = 1; s < e.pts.length; s++) {
          const q = cam(offset(s < 4 ? e.i : e.j, e.pts[s]));
          if (prev[2] > 0 && q[2] > 0) L.add(prev[0], prev[1], q[0], q[1], Math.max(0.35, 0.22 * q[3]), c, a0, c, a0, 0);
          prev = q;
        }
      }
    }
    // dendrites
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (p[2] <= 0) continue;
      const c = o.tint(i);
      const a0 = alpha * (0.3 + 0.7 * act[i]) * (i === 0 ? 1 : 0.8);
      for (const [a, b, depth] of this.dend[i]) {
        const pa = cam(offset(i, [this.pos[i][0] + a[0], this.pos[i][1] + a[1], this.pos[i][2] + a[2]]));
        const pb = cam(offset(i, [this.pos[i][0] + b[0], this.pos[i][1] + b[1], this.pos[i][2] + b[2]]));
        if (pa[2] > 0 && pb[2] > 0) L.add(pa[0], pa[1], pb[0], pb[1], Math.max(0.4, (1.4 - depth * 0.3) * 0.3 * pa[3]), c, a0, c, a0 * 0.5, 0);
      }
    }
    L.flush('add');
    // spikes racing down axons
    for (let k = Network.lower(this.spikeT, T - MAXDELAY); k < this.spikes.length && this.spikes[k][0] <= T; k++) {
      const [t0, t1, ei] = this.spikes[k];
      if (T > t1) continue;
      const e = this.edges[ei];
      const u = (T - t0) / (t1 - t0);
      const f = u * 8, s = Math.min(7, Math.floor(f)), w = f - s;
      const a = e.pts[s], b = e.pts[s + 1];
      const p = cam(offset(u < 0.5 ? e.i : e.j, [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)]));
      if (p[2] <= 0) continue;
      const c = o.tint(e.i);
      S.add(p[0], p[1], Math.max(2, 1.7 * p[3]), [c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5], alpha * 1.4, SHAPE.glow);
    }
    // somata
    for (let i = 0; i < N; i++) {
      const p = P[i];
      if (p[2] <= 0) continue;
      const c = o.tint(i);
      const b = o.boost ? o.boost(i) : 0;
      const hot = Math.min(1, act[i] + b);
      const r = Math.max(1.2, (i === 0 ? 3.0 : 1.4) * p[3] * (o.glowScale ?? 1) * (1 + b * 0.8));
      const halo = o.halo ?? 1;
      S.add(p[0], p[1], r * 4 * halo, c, alpha * (0.05 + 0.45 * hot) * halo, SHAPE.glow);
      S.add(p[0], p[1], r, [c[0] * 0.6 + hot * 0.6, c[1] * 0.6 + hot * 0.6, c[2] * 0.6 + hot * 0.6], alpha * (0.7 + 0.3 * hot), SHAPE.sphere, 0.6, 0.8);
    }
    S.flush('add');
    return P;
  }
}

