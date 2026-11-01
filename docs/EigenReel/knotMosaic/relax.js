/**
 * Relax a link in ℝ³ by descending a knot energy, keeping its type. A flat-array port of the flow in
 * Topology/knotTheory/knotMosaics/smooth3d.js (the 'mobius' model), with no three.js, so it runs in
 * Node, in a worker, or on the page.
 *
 * Each component is a closed polygon p_0 … p_{N−1} with target edge h. Its energy is the discrete
 * O'Hara (Möbius, α = 2) energy
 *     Σ_{|i−j|>1} (1/|p_i − p_j|² − 1/d_ij²)·w_i·w_j,      d_ij = arc length, w_i = mean adjacent edge,
 * plus springs on (|e| − h)/h, a little bending μ·L·Σ|Δ²p|²/h³, and a tube barrier. Components repel
 * each other by Σ h_a·h_b/r². Steps are smoothed along the curve (a Sobolev preconditioner) and keep
 * every component's length fixed. Every move is capped so that no edge can reach another while it runs,
 * which is what keeps the knot or link type: two edges a distance g apart whose points each move less
 * than g/2 cannot meet.
 */

const K_TUBE = 8.0;
const BEND_MU = 0.02;
const K_REPEL = 1.6;
const K_SPRING = 6.0;
const DT_SAFETY = 0.18;
const PRECOND = 0.1;
const RAMP_FRAMES = 60, RAMP_FLOOR = 0.05;
const TAU_START = 1, TAU_GROW = 1.2;
const SAFE_FRACTION = 0.45, GAP_FLOOR = 0.02;

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/* ───────── building a link from dense polylines ───────── */

// Resample a closed polyline (array of [x,y,z]) at M evenly spaced points; tag each with the value of
// `tag` (per input point, linearly interpolated) at that arc length.
function resample(pts, M, tag) {
  const n = pts.length, S = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    S[i + 1] = S[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const L = S[n], X = new Float64Array(3 * M), T = new Float32Array(M);
  let k = 0;
  for (let m = 0; m < M; m++) {
    const s = L * m / M;
    while (S[k + 1] < s) k++;
    const u = (s - S[k]) / Math.max(1e-12, S[k + 1] - S[k]);
    const a = pts[k], b = pts[(k + 1) % n];
    for (let c = 0; c < 3; c++) X[3 * m + c] = a[c] + (b[c] - a[c]) * u;
    if (tag) {
      const ta = tag[k], tb = (k + 1 < n) ? tag[k + 1] : tag[n - 1] + (tag[n - 1] - tag[n - 2]);
      T[m] = ta + (tb - ta) * u;
    }
  }
  return { X, T, L };
}

class Chain {
  constructor(X, tubeR, alpha = 2, bend = BEND_MU) {
    this.alpha = alpha; this.bend = bend;
    this.N = X.length / 3;
    this.X = X;
    let L = 0;
    for (let i = 0; i < this.N; i++) {
      const a = 3 * i, b = 3 * ((i + 1) % this.N);
      L += Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]);
    }
    this.h = L / this.N;
    this.pinned = L;
    // never below 0.45 h, so two edges crossing between their vertices still come within contact
    this.tubeR = Math.max(tubeR, 0.45 * this.h);
    this.kTube = K_TUBE / (this.h * this.h);
    this.F = new Float64Array(3 * this.N);
    this.E = 0;
    const f = () => new Float64Array(this.N);
    this.b = { len: f(), tx: f(), ty: f(), tz: f(), w: f(), G: f(), Gw: f(), S: new Float64Array(this.N + 1), D: new Float64Array(this.N + 1),
               gL: new Float64Array(3 * this.N), SF: new Float64Array(3 * this.N), SG: new Float64Array(3 * this.N), f: f(), out: f(), y: f() };
  }
}

/**
 * comps: [{ pts: [[x,y,z]…], s: [tag…] }] dense closed polylines (from mosaic.curves).
 * Returns a link: { chains, tags: Float32Array per chain, offsets, n, steps, tau, prevE }.
 */
export function buildLink(comps, { h = 0.2, tubeR = 0.07, minN = 24, alpha = 4, bend = BEND_MU } = {}) {
  const chains = [], tags = [], offsets = [];
  let n = 0;
  for (const c of comps) {
    let L = 0;
    for (let i = 0; i < c.pts.length; i++) {
      const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length];
      L += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    const M = Math.max(minN, Math.round(L / h));
    const r = resample(c.pts, M, c.s);
    chains.push(new Chain(r.X, tubeR, alpha, bend));
    tags.push(r.T);
    offsets.push(n);
    n += M;
  }
  return { chains, tags, offsets, n, steps: 0, tau: TAU_START, prevE: null, energy: 0 };
}

/* ───────── forces ───────── */

// The chain's own energy: O'Hara pairs, springs, bending, vertex tube barrier (see smooth3d.js pairForces).
function pairForces(ch, ramp) {
  const N = ch.N, X = ch.X, F = ch.F;
  const { len, tx, ty, tz, w, G, Gw, S, D } = ch.b;
  const h = ch.h, alpha = ch.alpha, kM = 2 * ramp * K_REPEL, hp = Math.pow(h, alpha - 2);
  F.fill(0);
  S[0] = 0;
  for (let k = 0; k < N; k++) {
    const a = 3 * k, b = 3 * ((k + 1) % N);
    const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2];
    const l = Math.hypot(dx, dy, dz) + 1e-12;
    len[k] = l; tx[k] = dx / l; ty[k] = dy / l; tz[k] = dz / l;
    S[k + 1] = S[k] + l;
    D[k] = 0; Gw[k] = 0;
  }
  D[N] = 0;
  const L = S[N], halfL = 0.5 * L;
  for (let i = 0; i < N; i++) w[i] = 0.5 * (len[(i - 1 + N) % N] + len[i]);
  let energy = 0;

  const kS = K_SPRING / (h * h);
  for (let k = 0; k < N; k++) {
    const st = len[k] - h;
    G[k] = kS * st;
    energy += 0.5 * kS * st * st;
  }

  const kB = ramp * ch.bend * ch.pinned / (h * h * h);
  for (let i = 0; i < N; i++) {
    const im = 3 * ((i - 1 + N) % N), ip = 3 * ((i + 1) % N), ic = 3 * i;
    const lx = X[im] - 2 * X[ic] + X[ip], ly = X[im + 1] - 2 * X[ic + 1] + X[ip + 1], lz = X[im + 2] - 2 * X[ic + 2] + X[ip + 2];
    energy += 0.5 * kB * (lx * lx + ly * ly + lz * lz);
    F[im] -= kB * lx; F[im + 1] -= kB * ly; F[im + 2] -= kB * lz;
    F[ip] -= kB * lx; F[ip + 1] -= kB * ly; F[ip + 2] -= kB * lz;
    F[ic] += 2 * kB * lx; F[ic + 1] += 2 * kB * ly; F[ic + 2] += 2 * kB * lz;
  }

  const tube = 2 * ch.tubeR, tube2 = tube * tube, arcSkip = Math.PI * ch.tubeR, kTube = ch.kTube;
  for (let i = 0; i < N; i++) {
    const ax = X[3 * i], ay = X[3 * i + 1], az = X[3 * i + 2];
    const Wi = kM * w[i] * hp, Si = S[i];
    let fix = 0, fiy = 0, fiz = 0, gi = 0, di = 0, d0 = 0;
    const jEnd = i === 0 ? N - 1 : N;
    for (let j = i + 2; j < jEnd; j++) {
      const wj = w[j], j3 = 3 * j;
      const dx = ax - X[j3], dy = ay - X[j3 + 1], dz = az - X[j3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz + 1e-24;
      const A = S[j] - Si;
      const d = A <= halfL ? A : L - A;
      const ir2 = 1 / r2, id = 1 / d;
      let iRE, iRF, iDE;
      if (alpha === 2) { iRE = ir2; iRF = ir2 * ir2; iDE = id * id; }
      else if (alpha === 1) { iRE = Math.sqrt(ir2); iRF = iRE * ir2; iDE = id; }
      else if (alpha === 3) { iRE = ir2 * Math.sqrt(ir2); iRF = iRE * ir2; iDE = id * id * id; }
      else { iRE = ir2 * ir2; iRF = iRE * ir2; iDE = id * id * id * id; }
      const kW = Wi * wj, u = iRE - iDE;
      energy += kW * u;
      let fMag = alpha * kW * iRF;
      if (r2 < tube2 && d >= arcSkip) {
        const r = Math.sqrt(r2), ov = tube - r;
        fMag += kTube * ov / r;
        energy += 0.5 * kTube * ov * ov;
      }
      fix += fMag * dx; fiy += fMag * dy; fiz += fMag * dz;
      F[j3] -= fMag * dx; F[j3 + 1] -= fMag * dy; F[j3 + 2] -= fMag * dz;
      const c = alpha * kW * iDE * id;
      if (A <= halfL) { di += c; D[j] -= c; } else { D[j] += c; d0 += c; di -= c; }
      gi += u * wj;
      Gw[j] += u * Wi;
    }
    Gw[i] += gi * kM * hp;
    D[i] += di; D[0] += d0;
    F[3 * i] += fix; F[3 * i + 1] += fiy; F[3 * i + 2] += fiz;
  }
  let acc = 0;
  for (let k = 0; k < N; k++) {
    acc += D[k];
    const g = G[k] + acc + 0.5 * (Gw[k] + Gw[(k + 1) % N]), k1 = (k + 1) % N;
    F[3 * k] += g * tx[k]; F[3 * k + 1] += g * ty[k]; F[3 * k + 2] += g * tz[k];
    F[3 * k1] -= g * tx[k]; F[3 * k1 + 1] -= g * ty[k]; F[3 * k1 + 2] -= g * tz[k];
  }
  ch.E = energy;
}

// Components repel with the chains' own exponent: k·h_a·h_b·h̄^(α−2) / r^α over every cross pair of vertices.
function crossForces(chs, ramp) {
  let energy = 0;
  for (let a = 0; a < chs.length; a++) for (let b = a + 1; b < chs.length; b++) {
    const A = chs[a], B = chs[b], XA = A.X, XB = B.X, FA = A.F, FB = B.F, alpha = A.alpha;
    const k = 2 * ramp * K_REPEL * A.h * B.h * Math.pow(0.5 * (A.h + B.h), alpha - 2);
    for (let i = 0; i < A.N; i++) {
      const ax = XA[3 * i], ay = XA[3 * i + 1], az = XA[3 * i + 2];
      let fx = 0, fy = 0, fz = 0;
      for (let j = 0; j < B.N; j++) {
        const dx = ax - XB[3 * j], dy = ay - XB[3 * j + 1], dz = az - XB[3 * j + 2];
        const ir2 = 1 / (dx * dx + dy * dy + dz * dz + 1e-24);
        const iRE = alpha === 4 ? ir2 * ir2 : alpha === 3 ? ir2 * Math.sqrt(ir2) : alpha === 2 ? ir2 : Math.sqrt(ir2);
        energy += k * iRE;
        const f = alpha * k * iRE * ir2;
        fx += f * dx; fy += f * dy; fz += f * dz;
        FB[3 * j] -= f * dx; FB[3 * j + 1] -= f * dy; FB[3 * j + 2] -= f * dz;
      }
      FA[3 * i] += fx; FA[3 * i + 1] += fy; FA[3 * i + 2] += fz;
    }
  }
  return energy;
}

// Squared closest approach of segments [a,b] in XA and [c,d] in XB; parameters to out.
function segSeg2(XA, a, b, XB, c, d, out) {
  const ux = XA[b] - XA[a], uy = XA[b + 1] - XA[a + 1], uz = XA[b + 2] - XA[a + 2];
  const vx = XB[d] - XB[c], vy = XB[d + 1] - XB[c + 1], vz = XB[d + 2] - XB[c + 2];
  const wx = XA[a] - XB[c], wy = XA[a + 1] - XB[c + 1], wz = XA[a + 2] - XB[c + 2];
  const uu = ux * ux + uy * uy + uz * uz + 1e-12, vv = vx * vx + vy * vy + vz * vz + 1e-12;
  const uv = ux * vx + uy * vy + uz * vz, uw = ux * wx + uy * wy + uz * wz, vw = vx * wx + vy * wy + vz * wz;
  const den = uu * vv - uv * uv;
  let s = den > 1e-12 ? clamp01((uv * vw - uw * vv) / den) : 0;
  let t = (uv * s + vw) / vv;
  if (t < 0) { t = 0; s = clamp01(-uw / uu); } else if (t > 1) { t = 1; s = clamp01((uv - uw) / uu); }
  if (out) { out.s = s; out.t = t; }
  const dx = wx + s * ux - t * vx, dy = wy + s * uy - t * vy, dz = wz + s * uz - t * vz;
  return dx * dx + dy * dy + dz * dz;
}

// Visit every pair of edges (within or across chains) that are not neighbours along a curve and whose
// midpoints lie within `reach(ha, hb)`; fn(A, i, B, j, d2) gets their squared closest approach.
function forEdgePairs(chs, skipOf, slack, fn) {
  const cs = { s: 0, t: 0 };
  for (let a = 0; a < chs.length; a++) for (let b = a; b < chs.length; b++) {
    const A = chs[a], B = chs[b], XA = A.X, XB = B.X;
    for (let i = 0; i < A.N; i++) {
      const i0 = 3 * i, i1 = 3 * ((i + 1) % A.N);
      const mx = 0.5 * (XA[i0] + XA[i1]), my = 0.5 * (XA[i0 + 1] + XA[i1 + 1]), mz = 0.5 * (XA[i0 + 2] + XA[i1 + 2]);
      const hi = 0.5 * Math.hypot(XA[i1] - XA[i0], XA[i1 + 1] - XA[i0 + 1], XA[i1 + 2] - XA[i0 + 2]);
      for (let j = a === b ? i + 1 : 0; j < B.N; j++) {
        if (a === b) {
          const d = j - i, skip = skipOf(A);
          if (Math.min(d, A.N - d) < skip) continue;
        }
        const j0 = 3 * j, j1 = 3 * ((j + 1) % B.N);
        const nx = 0.5 * (XB[j0] + XB[j1]) - mx, ny = 0.5 * (XB[j0 + 1] + XB[j1 + 1]) - my, nz = 0.5 * (XB[j0 + 2] + XB[j1 + 2]) - mz;
        const hj = 0.5 * Math.hypot(XB[j1] - XB[j0], XB[j1 + 1] - XB[j0 + 1], XB[j1 + 2] - XB[j0 + 2]);
        const reach = slack(A, B) + hi + hj;
        if (nx * nx + ny * ny + nz * nz >= reach * reach) continue;
        const d2 = segSeg2(XA, i0, i1, XB, j0, j1, cs);
        fn(A, i, B, j, d2, cs);
      }
    }
  }
}

// Edge-to-edge contact barrier, k·(c − r)·c/r² along the gap, which no driving force can flatten.
function contactForces(chs) {
  let energy = 0;
  const skipOf = A => Math.max(2, Math.min(A.N >> 2, Math.ceil(2 * A.tubeR * 1.1 / A.h) + 1));
  forEdgePairs(chs, skipOf, (A, B) => A.tubeR + B.tubeR, (A, i, B, j, d2, cs) => {
    const contact = A.tubeR + B.tubeR;
    if (d2 >= contact * contact) return;
    const r = Math.sqrt(d2) + 1e-12, k = Math.min(A.kTube, B.kTube);
    const f = k * (contact - r) * contact / (r * r);
    energy += k * contact * (contact * Math.log(contact / r) - (contact - r));
    const XA = A.X, XB = B.X, s = cs.s, t = cs.t;
    const i0 = 3 * i, i1 = 3 * ((i + 1) % A.N), j0 = 3 * j, j1 = 3 * ((j + 1) % B.N);
    const g = [0, 1, 2].map(c => (XA[i0 + c] + s * (XA[i1 + c] - XA[i0 + c])) - (XB[j0 + c] + t * (XB[j1 + c] - XB[j0 + c])));
    for (let c = 0; c < 3; c++) {
      const fc = f * g[c];
      A.F[i0 + c] += (1 - s) * fc; A.F[i1 + c] += s * fc;
      B.F[j0 + c] -= (1 - t) * fc; B.F[j1 + c] -= t * fc;
    }
  });
  return energy;
}

/* ───────── moves ───────── */

// Smooth f along a closed curve: (1 + 2a)v_i − a(v_{i−1} + v_{i+1}) = f_i.
function smoothCyclic(f, out, a, y) {
  const N = f.length;
  if (!(a > 0)) { out.set(f); return; }
  const rho = ((1 + 2 * a) - Math.sqrt(1 + 4 * a)) / (2 * a);
  const wrap = 1 / (1 - Math.pow(rho, N));
  let s = 0, pk = 1;
  for (let k = 0; k < N; k++) { s += pk * f[(N - 1 + k) % N]; pk *= rho; }
  y[N - 1] = s * wrap;
  for (let i = N - 2; i >= 0; i--) y[i] = f[i] + rho * y[i + 1];
  s = 0; pk = 1;
  for (let k = 0; k < N; k++) { s += pk * y[(N - k) % N]; pk *= rho; }
  out[0] = s * wrap;
  for (let i = 1; i < N; i++) out[i] = y[i] + rho * out[i - 1];
  const c = rho / a;
  for (let i = 0; i < N; i++) out[i] *= c;
}

// The preconditioned step at fixed length (smooth3d.js pairMove): V = S(F − λ∇L), dt = τh², each vertex
// moving at most DT_SAFETY·h, then a Newton step back to the pinned length.
function proposeMove(ch, tau) {
  const N = ch.N, X = ch.X, F = ch.F, h = ch.h;
  const { gL, SF, SG, f, out, y } = ch.b;
  gL.fill(0);
  let L = 0;
  for (let i = 0; i < N; i++) {
    const a = 3 * i, b = 3 * ((i + 1) % N);
    const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2];
    const l = Math.hypot(dx, dy, dz) + 1e-12;
    L += l;
    gL[b] += dx / l; gL[b + 1] += dy / l; gL[b + 2] += dz / l;
    gL[a] -= dx / l; gL[a + 1] -= dy / l; gL[a + 2] -= dz / l;
  }
  const a = Math.pow(PRECOND * N, 2);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < N; i++) f[i] = F[3 * i + c];
    smoothCyclic(f, out, a, y);
    for (let i = 0; i < N; i++) SF[3 * i + c] = out[i];
    for (let i = 0; i < N; i++) f[i] = gL[3 * i + c];
    smoothCyclic(f, out, a, y);
    for (let i = 0; i < N; i++) SG[3 * i + c] = out[i];
  }
  let gsf = 0, gsg = 0;
  for (let k = 0; k < 3 * N; k++) { gsf += gL[k] * SF[k]; gsg += gL[k] * SG[k]; }
  const lambda = gsf / (gsg + 1e-30);
  let maxV = 0;
  for (let k = 0; k < 3 * N; k++) SF[k] -= lambda * SG[k];
  for (let i = 0; i < N; i++) maxV = Math.max(maxV, Math.hypot(SF[3 * i], SF[3 * i + 1], SF[3 * i + 2]));
  const limit = (DT_SAFETY * h) / (maxV + 1e-12);
  ch.tauLimited = tau * h * h < limit;
  const dt = Math.min(tau * h * h, limit);
  let gamma = (ch.pinned - L) / (gsg + 1e-30), maxG = 0, maxD = 0;
  for (let i = 0; i < N; i++) maxG = Math.max(maxG, Math.hypot(SG[3 * i], SG[3 * i + 1], SG[3 * i + 2]));
  gamma = Math.sign(gamma) * Math.min(Math.abs(gamma), (DT_SAFETY * h) / (maxG + 1e-12));
  for (let k = 0; k < 3 * N; k++) SF[k] = dt * SF[k] + gamma * SG[k];
  for (let i = 0; i < N; i++) maxD = Math.max(maxD, Math.hypot(SF[3 * i], SF[3 * i + 1], SF[3 * i + 2]));
  const k0 = Math.min(1, (DT_SAFETY * h) / (maxD + 1e-12));
  const T = new Float64Array(3 * N);
  for (let k = 0; k < 3 * N; k++) T[k] = X[k] + k0 * SF[k];
  return T;
}

// caps[c][i] ∈ [0, 1]: how much of its move vertex i may make, so that no edge reaches another.
function safeCaps(chs, targets) {
  let dMax = 0;
  const D = chs.map((ch, c) => {
    const d = new Float64Array(ch.N), T = targets[c], X = ch.X;
    for (let i = 0; i < ch.N; i++) {
      d[i] = Math.hypot(T[3 * i] - X[3 * i], T[3 * i + 1] - X[3 * i + 1], T[3 * i + 2] - X[3 * i + 2]);
      if (d[i] > dMax) dMax = d[i];
    }
    return d;
  });
  const caps = chs.map(ch => new Float64Array(ch.N).fill(1));
  if (dMax === 0) return caps;
  let floorMax = 0;
  for (const ch of chs) floorMax = Math.max(floorMax, GAP_FLOOR * ch.tubeR);
  const cut = dMax / SAFE_FRACTION + floorMax;
  const gap = chs.map(ch => new Float64Array(ch.N).fill(Infinity));
  forEdgePairs(chs, () => 2, () => cut, (A, i, B, j, d2) => {
    const g = Math.sqrt(d2), a = chs.indexOf(A), b = chs.indexOf(B);
    if (g < gap[a][i]) gap[a][i] = g;
    if (g < gap[b][j]) gap[b][j] = g;
  });
  chs.forEach((ch, c) => {
    const floor = GAP_FLOOR * ch.tubeR;
    for (let i = 0; i < ch.N; i++) {
      const lim = SAFE_FRACTION * Math.max(0, Math.min(gap[c][i], gap[c][(i - 1 + ch.N) % ch.N]) - floor);
      if (D[c][i] > lim) caps[c][i] = lim / D[c][i];
    }
  });
  return caps;
}

/* ───────── stepping ───────── */

export function step(link) {
  const chs = link.chains;
  const ramp = link.steps < RAMP_FRAMES ? RAMP_FLOOR + (1 - RAMP_FLOOR) * (link.steps / RAMP_FRAMES) ** 2 : 1;
  for (const ch of chs) pairForces(ch, ramp);
  const cross = (chs.length > 1 ? crossForces(chs, ramp) : 0) + contactForces(chs);
  const E = chs.reduce((s, ch) => s + ch.E, cross);
  if (link.steps < RAMP_FRAMES) link.prevE = null;
  else {
    if (link.prevE !== null) {
      if (E > link.prevE + 1e-9 * Math.abs(link.prevE)) link.tau *= 0.5;
      else if (chs.some(ch => ch.tauLimited)) link.tau *= TAU_GROW;
    }
    link.prevE = E;
  }
  link.energy = E;
  const targets = chs.map(ch => proposeMove(ch, link.tau));
  const caps = safeCaps(chs, targets);
  let moved = 0;
  chs.forEach((ch, c) => {
    const T = targets[c], X = ch.X, k = caps[c];
    for (let i = 0; i < ch.N; i++) {
      for (let q = 0; q < 3; q++) {
        const d = k[i] * (T[3 * i + q] - X[3 * i + q]);
        X[3 * i + q] += d;
        moved += d * d;
      }
    }
  });
  link.steps++;
  return Math.sqrt(moved / link.n);
}

// All vertices, all chains, as one Float32Array (chain c starts at 3·offsets[c]).
export function snapshot(link) {
  const out = new Float32Array(3 * link.n);
  link.chains.forEach((ch, c) => out.set(ch.X, 3 * link.offsets[c]));
  return out;
}

/**
 * Run the flow and keep frames evenly spaced in shape: a new frame whenever the RMS distance from the last
 * one (centroids matched) passes `delta`. Stops on an energy plateau, when a long stretch of steps moves
 * less than `still`, or at maxSteps. Frames keep the first frame's centroid. Calls onFrame(frame, info)
 * as frames are made.
 */
export function record(link, { delta = 0.012, maxSteps = 6000, still = 2e-5, patience = 120, plateau = 3e-5, window = 100, onFrame } = {}) {
  const frames = [];
  const centroid = f => { let x = 0, y = 0, z = 0; const n = f.length / 3; for (let i = 0; i < n; i++) { x += f[3 * i]; y += f[3 * i + 1]; z += f[3 * i + 2]; } return [x / n, y / n, z / n]; };
  const first = snapshot(link), c0 = centroid(first);
  frames.push(first);
  onFrame?.(first, { steps: 0, energy: link.energy });
  let last = first, quiet = 0;
  const hist = [];   // energy every step, to stop on a plateau
  const push = f => {
    const c = centroid(f);
    for (let i = 0; i < f.length; i += 3) { f[i] += c0[0] - c[0]; f[i + 1] += c0[1] - c[1]; f[i + 2] += c0[2] - c[2]; }
    frames.push(f); last = f;
    onFrame?.(f, { steps: link.steps, energy: link.energy });
  };
  while (link.steps < maxSteps) {
    const m = step(link);
    quiet = m < still ? quiet + 1 : 0;
    if (quiet > patience && link.steps > RAMP_FRAMES) break;
    // Past the ramp, stop once the energy has dropped by less than `plateau` (relative) over `window`
    // steps. Left running, the flow slides vertices along the curve and, much later, starts to pull
    // the knot tight; the shape worth showing is the plateau before that.
    hist.push(link.energy);
    if (link.steps > RAMP_FRAMES + window) {
      const e0 = hist[hist.length - 1 - window], e1 = link.energy;
      if ((e0 - e1) / Math.abs(e1) < plateau) break;
    }
    const f = snapshot(link);
    const ca = centroid(f), cb = centroid(last);
    let s = 0;
    for (let i = 0; i < f.length; i += 3) {
      const dx = f[i] - ca[0] - (last[i] - cb[0]), dy = f[i + 1] - ca[1] - (last[i + 1] - cb[1]), dz = f[i + 2] - ca[2] - (last[i + 2] - cb[2]);
      s += dx * dx + dy * dy + dz * dz;
    }
    if (Math.sqrt(s / link.n) >= delta) push(f);
  }
  const f = snapshot(link);
  push(f);
  return frames;
}

// Smallest gap between edges of the link that are at least `skip` edges apart along their curve (any two
// edges of different components count). With skip ≈ arc/h this is the clearance a drawn tube has.
export function minGap(link, skip = 2) {
  let g = Infinity;
  forEdgePairs(link.chains, () => skip, () => 1, (A, i, B, j, d2) => { if (d2 < g * g) g = Math.sqrt(d2); });
  return g;
}
