// nbody.js — a regularized few-body integrator (no three.js; runs in Node too).
//
// Close encounters are the whole story in Xia's theorem, so the integrator is
// built to survive them without softening:
//
//   • Logarithmic-Hamiltonian leapfrog (Mikkola–Tanikawa 1999, Preto–Tremaine
//     1999). With fictitious time s, dt/ds = 1/(T + B) in the drift and
//     dt/ds = 1/U in the kick, where U = Σ G mᵢmⱼ/rᵢⱼ and B = −E. On a Kepler
//     orbit this leapfrog is exact up to a phase error, and s advances like
//     the eccentric anomaly — a near-collision takes a handful of steps.
//   • Gragg–Bulirsch–Stoer extrapolation of that time-symmetric leapfrog
//     (substep sequence 2, 4, 6, …) to reach ~1e-12 local accuracy.
//   • An optional Plummer softening ε for comparison (ε = 0 is exact Newton).
//
// Each accepted step is also capped so it spans only a fraction of the fastest
// local orbit; the renderer then interpolates between steps with quintic
// Hermite polynomials (see `sample`).

export const G = 1;

export class NBody {
  /**
   * @param {number[]} masses
   * @param {number[][]} pos  [[x,y,z], …]
   * @param {number[][]} vel
   * @param {{tol?:number, soft?:number, eta?:number}} [opts]
   */
  constructor(masses, pos, vel, opts = {}) {
    const N = masses.length;
    this.N = N;
    this.m = Float64Array.from(masses);
    this.x = new Float64Array(3 * N);
    this.v = new Float64Array(3 * N);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
      this.x[3 * i + k] = pos[i][k];
      this.v[3 * i + k] = vel[i][k];
    }
    this.t = 0;
    this.tol = opts.tol ?? 1e-12;
    this.soft = opts.soft ?? 0;
    this.eta = opts.eta ?? 0.2;         // max step as a fraction of the fastest local timescale
    this.lenient = !!opts.lenient;      // relax tolerance instead of failing (interactive use)
    this.dtFloor = 0;                   // steps shorter than this need no smoothness cap (sub-frame)
    this.a = new Float64Array(3 * N);
    this.accel(this.x, this.a);
    this.B = this.potential(this.x) - this.kinetic(this.v);   // B = −E, conserved
    this.E0 = -this.B;
    this.h = 0;                          // step in fictitious time s (chosen on first step)
    this.steps = 0;
    this.lastDt = 0;
    this.failed = false;

    // Scratch for the extrapolation tableau: y = [t, x…, v…].
    this.dim = 1 + 6 * N;
    this.KMAX = 10;
    this.seq = Array.from({ length: this.KMAX }, (_, k) => 2 * (k + 1));
    this.tab = Array.from({ length: this.KMAX }, (_, k) =>
      Array.from({ length: k + 1 }, () => new Float64Array(this.dim)));
    this.wx = new Float64Array(3 * N);
    this.wv = new Float64Array(3 * N);
    this.wa = new Float64Array(3 * N);
    this.err = new Float64Array(this.dim);
  }

  /**
   * Rebuild an integrator from a saved state {m, t, x, v} (flat arrays). The
   * step-size memory starts fresh, exactly as the cascade builder does, so a
   * run from a checkpoint reproduces the precomputed one.
   */
  static fromState(st, opts = {}) {
    const N = st.m.length;
    const pos = [], vel = [];
    for (let i = 0; i < N; i++) {
      pos.push([st.x[3 * i], st.x[3 * i + 1], st.x[3 * i + 2]]);
      vel.push([st.v[3 * i], st.v[3 * i + 1], st.v[3 * i + 2]]);
    }
    const s = new NBody(st.m, pos, vel, opts);
    s.t = st.t;
    return s;
  }

  /** U = Σ G mᵢmⱼ / rᵢⱼ  (positive). */
  potential(x) {
    const { N, m } = this, e2 = this.soft * this.soft;
    let U = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = x[3 * j] - x[3 * i], dy = x[3 * j + 1] - x[3 * i + 1], dz = x[3 * j + 2] - x[3 * i + 2];
      U += G * m[i] * m[j] / Math.sqrt(dx * dx + dy * dy + dz * dz + e2);
    }
    return U;
  }

  kinetic(v) {
    const { N, m } = this;
    let T = 0;
    for (let i = 0; i < N; i++) T += 0.5 * m[i] * (v[3 * i] ** 2 + v[3 * i + 1] ** 2 + v[3 * i + 2] ** 2);
    return T;
  }

  /** Accelerations into `out`; returns U so kicks need only one pair loop. */
  accel(x, out) {
    const { N, m } = this, e2 = this.soft * this.soft;
    out.fill(0);
    let U = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = x[3 * j] - x[3 * i], dy = x[3 * j + 1] - x[3 * i + 1], dz = x[3 * j + 2] - x[3 * i + 2];
      const r2 = dx * dx + dy * dy + dz * dz + e2;
      const ir = 1 / Math.sqrt(r2), ir3 = G * ir * ir * ir;
      U += G * m[i] * m[j] * ir;
      out[3 * i] += m[j] * dx * ir3; out[3 * i + 1] += m[j] * dy * ir3; out[3 * i + 2] += m[j] * dz * ir3;
      out[3 * j] -= m[i] * dx * ir3; out[3 * j + 1] -= m[i] * dy * ir3; out[3 * j + 2] -= m[i] * dz * ir3;
    }
    return U;
  }

  energy() { return this.kinetic(this.v) - this.potential(this.x); }

  /** Relative energy drift |E − E₀| / |E₀| (or absolute if E₀ ≈ 0). */
  energyError() {
    const E = this.energy();
    return Math.abs(E - this.E0) / Math.max(Math.abs(this.E0), 1e-9);
  }

  /** Shortest two-body timescale √(r³ / G(mᵢ+mⱼ)) — a local "orbit radian". */
  minTimescale(x = this.x) {
    const { N, m } = this;
    let tau = Infinity;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = x[3 * j] - x[3 * i], dy = x[3 * j + 1] - x[3 * i + 1], dz = x[3 * j + 2] - x[3 * i + 2];
      const r2 = dx * dx + dy * dy + dz * dz + this.soft * this.soft;
      const mm = m[i] + m[j];
      if (mm <= 0) continue;
      const tt = Math.sqrt(r2 * Math.sqrt(r2) / (G * mm));
      if (tt < tau) tau = tt;
    }
    return tau;
  }

  /** n leapfrog substeps (D K D …) over fictitious time H, from the current state into row. */
  leapfrog(H, n, row) {
    const N3 = 3 * this.N, B = this.B, m = this.m, x = this.wx, v = this.wv, a = this.wa;
    x.set(this.x); v.set(this.v);
    let t = 0;          // time elapsed within this step (keeps tiny steps exact near collisions)
    const hs = H / n;
    for (let i = 0; i <= n; i++) {
      // drift (half steps at both ends)
      let T = 0;
      for (let b = 0, k = 0; k < N3; b++, k += 3) T += m[b] * (v[k] * v[k] + v[k + 1] * v[k + 1] + v[k + 2] * v[k + 2]);
      const dtD = (i === 0 || i === n ? 0.5 * hs : hs) / (0.5 * T + B);
      t += dtD;
      for (let k = 0; k < N3; k++) x[k] += dtD * v[k];
      if (i === n) break;
      // kick
      const U = this.accel(x, a);
      const dtK = hs / U;
      for (let k = 0; k < N3; k++) v[k] += dtK * a[k];
    }
    row[0] = t;
    row.set(x, 1);
    row.set(v, 1 + N3);
  }

  /** Scaled error of the extrapolation difference (positions relative to nearest-neighbour distance). */
  errorNorm(diff, y) {
    const { N } = this;
    let e = 0;
    const dtStep = Math.abs(y[0]) + 1e-300;
    e = Math.max(e, Math.abs(diff[0]) / dtStep);
    for (let i = 0; i < N; i++) {
      // nearest-neighbour distance² for body i in the candidate state
      let d2 = Infinity;
      for (let j = 0; j < N; j++) if (j !== i) {
        const dx = y[1 + 3 * j] - y[1 + 3 * i], dy = y[2 + 3 * j] - y[2 + 3 * i], dz = y[3 + 3 * j] - y[3 + 3 * i];
        const r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < d2) d2 = r2;
      }
      const o = 1 + 3 * i, ov = 1 + 3 * N + 3 * i;
      // Floor the scale at roundoff level: a tight pair far from the origin can't be
      // resolved better than a few ulps of its coordinates.
      const xr = Math.abs(y[o]) + Math.abs(y[o + 1]) + Math.abs(y[o + 2]);
      const d = Math.sqrt(d2) + 1e-15 * xr / this.tol;
      const dp = Math.sqrt(diff[o] * diff[o] + diff[o + 1] * diff[o + 1] + diff[o + 2] * diff[o + 2]);
      const vs = Math.sqrt(y[ov] * y[ov] + y[ov + 1] * y[ov + 1] + y[ov + 2] * y[ov + 2]);
      const dvv = Math.sqrt(diff[ov] * diff[ov] + diff[ov + 1] * diff[ov + 1] + diff[ov + 2] * diff[ov + 2]);
      const ep = dp / (d + 1e-300), ev = dvv / (vs + Math.sqrt(G * this.m[i] / (d + 1e-300)) * 1e-3 + 1e-300);
      if (ep > e) e = ep;
      if (ev > e) e = ev;
    }
    return e;
  }

  /** Initial fictitious step: a small fraction of the fastest timescale. */
  guessStep() {
    const U = this.potential(this.x);
    return 0.02 * this.minTimescale() * U;
  }

  /**
   * Take one adaptive step. Returns the physical time advanced (0 on failure).
   * `dtMax` optionally caps the physical step (used to land on frame times cleanly).
   */
  step(dtMax = Infinity) {
    if (this.failed) return 0;
    const { KMAX, seq, tab, dim, err } = this;
    const U0 = this.potential(this.x);
    // Cap the step in s so the physical step spans ≤ eta of the local timescale.
    let hCap = Math.max(this.eta * this.minTimescale(), this.dtFloor) * U0;
    if (Number.isFinite(dtMax)) hCap = Math.min(hCap, dtMax * U0);
    if (!(this.h > 0)) this.h = this.guessStep();
    let H = Math.min(this.h, hCap);

    for (let attempt = 0; attempt < 40; attempt++) {
      let accepted = -1;
      for (let k = 0; k < KMAX; k++) {
        // Row k of the Aitken–Neville tableau: T[k][0] is the raw leapfrog result,
        // T[k][j] = T[k][j−1] + (T[k][j−1] − T[k−1][j−1]) / ((n_k/n_{k−j})² − 1).
        const row = tab[k];
        this.leapfrog(H, seq[k], row[0]);
        for (let j = 1; j <= k; j++) {
          const ratio = (seq[k] / seq[k - j]) ** 2 - 1;
          const A = row[j - 1], P = tab[k - 1][j - 1], out = row[j];
          for (let c = 0; c < dim; c++) out[c] = A[c] + (A[c] - P[c]) / ratio;
        }
        if (k >= 2) {
          for (let c = 0; c < dim; c++) err[c] = row[k][c] - row[k - 1][c];
          const e = this.errorNorm(err, row[k]);
          if (e < this.tol && Number.isFinite(e)) { accepted = k; break; }
        }
      }
      if (accepted >= 0) {
        const y = tab[accepted][accepted];
        const dt = y[0];
        if (!(dt > 0) || !Number.isFinite(dt)) { H *= 0.5; continue; }
        this.t += dt;
        this.x.set(y.subarray(1, 1 + 3 * this.N));
        this.v.set(y.subarray(1 + 3 * this.N));
        this.accel(this.x, this.a);
        this.lastDt = dt;
        this.steps++;
        // Step-size control: aim for convergence around k = 5.
        const grow = accepted <= 3 ? 1.6 : accepted <= 5 ? 1.15 : accepted <= 7 ? 0.8 : 0.5;
        this.h = H * grow;
        return dt;
      }
      H *= 0.35;
      if (attempt === 30 && this.lenient) {
        // Browser fallback: keep going with the best estimate rather than stopping the show.
        this.tol = Math.min(this.tol * 100, 1e-8);
      }
    }
    this.failed = true;
    return 0;
  }

  /** Centre of mass position and velocity. */
  com() {
    const { N, m, x, v } = this;
    let M = 0; const c = [0, 0, 0], w = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      M += m[i];
      for (let k = 0; k < 3; k++) { c[k] += m[i] * x[3 * i + k]; w[k] += m[i] * v[3 * i + k]; }
    }
    return { M, pos: c.map(u => u / M), vel: w.map(u => u / M) };
  }

  /** Snapshot for interpolation: t, x, v, a (copies). */
  snapshot() {
    return { t: this.t, x: Float64Array.from(this.x), v: Float64Array.from(this.v), a: Float64Array.from(this.a) };
  }
}

/**
 * Quintic Hermite interpolation between snapshots s0 and s1 at time t, into out (3N).
 * Matches position, velocity and acceleration at both ends.
 */
export function hermite(s0, s1, t, out) {
  const h = s1.t - s0.t;
  if (!(h > 0)) { out.set(s1.x); return out; }
  const u = Math.min(1, Math.max(0, (t - s0.t) / h));
  const u2 = u * u, u3 = u2 * u, u4 = u3 * u, u5 = u4 * u;
  const h00 = 1 - 10 * u3 + 15 * u4 - 6 * u5;
  const h10 = u - 6 * u3 + 8 * u4 - 3 * u5;
  const h20 = 0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5;
  const h01 = 10 * u3 - 15 * u4 + 6 * u5;
  const h11 = -4 * u3 + 7 * u4 - 3 * u5;
  const h21 = 0.5 * u3 - u4 + 0.5 * u5;
  const hh = h * h;
  for (let k = 0; k < out.length; k++) {
    out[k] = h00 * s0.x[k] + h10 * h * s0.v[k] + h20 * hh * s0.a[k]
           + h01 * s1.x[k] + h11 * h * s1.v[k] + h21 * hh * s1.a[k];
  }
  return out;
}
