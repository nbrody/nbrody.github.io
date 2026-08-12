'use strict';
// Rational point generation on SL(2,C) character varieties of 2-generator groups,
// in trace coordinates (x, y, z) = (tr a, tr b, tr ab).
//
// The Fricke family (torus orbifolds): kappa(x,y,z) = x^2+y^2+z^2-xyz = k.
//   k = 2: <a,b | [a,b]^2>  (tr[A,B] =  0)     k = 0: Markov cone (tr = -2)
//   k = 1: <a,b | [a,b]^3>  (tr[A,B] = -1)     k = 3: same group, other lift (+1)
//   k = 4: reducible characters (Cayley cubic, tr = +2)
//
// Knot/link groups (a, b conjugate meridians => x = y = t on the whole variety):
//   trefoil <a,b | aba=bab>:  nonabelian curve z = 1;  abelian z = t^2 - 2.
//   figure-eight <a,b | aw=wb>, w = ba^{-1}b^{-1}a:
//       nonabelian curve z^2 - (t^2+1)z + 2t^2 - 1 = 0, disc (t^2-1)(t^2-5);
//       genus 1 — rational points are scarce (only t = +-1 up to denominator 120).
//   Whitehead link b(8,3), meridians of the two components:
//       nonabelian surface F = z^3 - xyz^2 + (x^2+y^2-2)z - xy = 0
//       (at the cusp x=y=2: z = 1 +- i, the trace field Q(i)).
// All knot equations derived by elimination in sympy and verified numerically
// against reconstructed representations.

// ---------- symmetry groups ----------
const SIGN_PATTERNS = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
const PERM_PATTERNS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const SYM24 = [];
for (const p of PERM_PATTERNS) for (const s of SIGN_PATTERNS) SYM24.push({ p, s });

// knots: (t,t,z) -> (-t,-t,z) (twist by the character a,b -> -1)
const SYMKNOT = [
  { p: [0, 1, 2], s: [1, 1, 1] },
  { p: [0, 1, 2], s: [-1, -1, 1] },
];
// Whitehead link: swap the two components x <-> y, and even sign twists
const SYMWH = [];
for (const p of [[0, 1, 2], [1, 0, 2]]) for (const s of SIGN_PATTERNS) SYMWH.push({ p, s });

function applyOp(fr, op) {
  const out = new Array(3);
  for (let i = 0; i < 3; i++) {
    const f = fr[op.p[i]];
    out[i] = op.s[i] < 0 ? Fneg(f) : f;
  }
  return out;
}

// ---------- variety registry ----------
const VARIETIES = {
  k2: { kind: 'markov', k: 2, M: 12, syms: SYM24 },
  k0: { kind: 'markov', k: 0, M: 26, syms: SYM24 },
  k1: { kind: 'markov', k: 1, M: 12, syms: SYM24 },
  k3: { kind: 'markov', k: 3, M: 30, syms: SYM24 },
  k4: { kind: 'markov', k: 4, M: 14, syms: SYM24 },
  trefoil: { kind: 'trefoil', M: 8, syms: SYMKNOT },
  fig8: { kind: 'fig8', M: 8, syms: SYMKNOT },
  whitehead: { kind: 'whitehead', M: 8, syms: SYMWH },
};

class PointSet {
  constructor(variety, M, Hcap, maxOrbits) {
    this.variety = variety;
    this.k = variety.k;         // markov level, if any
    this.M = M;
    this.Hcap = BigInt(Hcap);
    this.HcapN = Hcap;
    this.maxOrbits = maxOrbits;
    this.map = new Map();
    this.list = [];
    this.capped = false;
  }

  // Canonical orbit representative under the full S3 x V4 (Markov case):
  // sort |coords| descending; if the number of negative entries is odd (and no
  // coordinate is zero), the double-sign-flips can only move the single minus
  // sign around, so park it on the smallest entry.
  canonical24(fr) {
    const zeros = fr.some(f => f.n === 0n);
    const negs = fr.reduce((c, f) => c + (f.n < 0n ? 1 : 0), 0);
    const abs = fr.map(Fabs);
    abs.sort((a, b) => fcmpAbs(b, a));
    if (!zeros && negs % 2 === 1) abs[2] = Fneg(abs[2]);
    return abs;
  }

  // generic: minimum key over the symmetry images (fine for small groups)
  canonicalize(fr) {
    if (this.variety.syms === SYM24) {
      const rep = this.canonical24(fr);
      return { rep, key: rep.map(fstr).join(',') };
    }
    let best = null, bestKey = null;
    for (const op of this.variety.syms) {
      const im = applyOp(fr, op);
      const key = im.map(fstr).join(',');
      if (bestKey === null || key < bestKey) { bestKey = key; best = im; }
    }
    return { rep: best, key: bestKey };
  }

  tryAdd(fx, fy, fz, force = false) {
    const vx = fnum(fx), vy = fnum(fy), vz = fnum(fz);
    if (!force) {
      const lim = this.M + 1e-9;
      if (Math.abs(vx) > lim || Math.abs(vy) > lim || Math.abs(vz) > lim) return null;
    }
    let H = fheight(fx);
    const hy = fheight(fy), hz = fheight(fz);
    if (hy > H) H = hy;
    if (hz > H) H = hz;
    if (!force && H > this.Hcap) return null;
    const { rep, key } = this.canonicalize([fx, fy, fz]);
    const got = this.map.get(key);
    if (got) return got;
    if (!force && this.list.length >= this.maxOrbits) { this.capped = true; return null; }
    const o = {
      fr: rep,
      H: Number(H),
      integral: rep.every(f => f.d === 1n),
      compact: rep.every(f => Math.abs(fnum(f)) <= 2 + 1e-12),
    };
    this.map.set(key, o);
    this.list.push(o);
    return o;
  }
}

function canonicalKeyOf(ps, fr) {
  return ps.canonicalize(fr).key;
}

// =====================  Fricke family generators  =====================

// sweep pairs (x,y) with bounded denominator; z^2 - xyz + (x^2+y^2-k) = 0,
// disc = x^2 y^2 - 4x^2 - 4y^2 + 4k.
function bruteForce(ps, D1) {
  const M = ps.M, k = ps.k;
  const vals = [];
  for (let r = 1; r <= D1; r++)
    for (let p = -M * r; p <= M * r; p++)
      if (gcdInt(Math.abs(p), r) === 1) vals.push([p, r]);
  for (let i = 0; i < vals.length; i++) {
    const p = vals[i][0], r = vals[i][1];
    const pp = p * p, rr = r * r;
    for (let j = i; j < vals.length; j++) {
      const q = vals[j][0], s = vals[j][1];
      const N = pp * q * q - 4 * (pp * s * s + q * q * rr) + 4 * k * rr * s * s;
      const sq = isqrtExact(N);
      if (sq < 0) continue;
      const fx = frac(BigInt(p), BigInt(r));
      const fy = frac(BigInt(q), BigInt(s));
      const den = BigInt(2 * r * s);
      ps.tryAdd(fx, fy, frac(BigInt(p * q + sq), den));
      if (sq > 0) ps.tryAdd(fx, fy, frac(BigInt(p * q - sq), den));
    }
  }
}

// (k = 0 only) projection from the cone point (0,0,0): every rational point
// except the origin is t.(u,v,w), t = (u^2+v^2+w^2)/(uvw). Complete search.
function coneEnum(ps, Nmax) {
  const M = ps.M, Hcap = ps.HcapN;
  for (let u = 1; u <= Nmax; u++) {
    for (let v = u; v <= Nmax; v++) {
      const g1 = gcdInt(u, v);
      const uv = u * v;
      for (let w = v; w <= Nmax; w++) {
        if (gcdInt(g1, w) !== 1) continue;
        const s = u * u + v * v + w * w;
        if (s > M * uv) continue;                    // box (largest coord)
        const g = gcdInt(s, uv);
        if (Math.max(s / g, uv / g) > Hcap) continue; // reduced heights
        const gx = gcdInt(s, v * w), gy = gcdInt(s, u * w);
        if (Math.max(s / gx, v * w / gx) > Hcap) continue;
        if (Math.max(s / gy, u * w / gy) > Hcap) continue;
        const S = BigInt(s);
        ps.tryAdd(frac(S, BigInt(v * w)), frac(S, BigInt(u * w)), frac(S, BigInt(uv)));
        if (ps.capped) return;
      }
    }
  }
}

// conic-fiber chord sweep: fix x = xi, fiber y^2 + z^2 - xi.y.z = k - xi^2.
function fiberSweep(ps, fiberCount, slopeH) {
  const fibers = new Map();
  for (const o of ps.list) {
    for (const op of ps.variety.syms) {
      const im = applyOp(o.fr, op);
      const key = fstr(im[0]);
      const cur = fibers.get(key);
      if (!cur || o.H < cur.H) fibers.set(key, { xi: im[0], y0: im[1], z0: im[2], H: o.H });
    }
  }
  const chosen = [...fibers.values()].sort((a, b) => a.H - b.H).slice(0, fiberCount);
  const lim = ps.M + 0.5;
  for (const fb of chosen) {
    const xi = fb.xi, y0 = fb.y0, z0 = fb.z0;
    const xiN = fnum(xi), y0N = fnum(y0), z0N = fnum(z0);
    for (let md = 1; md <= slopeH; md++) {
      for (let mn = -slopeH; mn <= slopeH; mn++) {
        if (gcdInt(Math.abs(mn), md) !== 1) continue;
        const mN = mn / md;
        const QN = 1 + mN * mN - xiN * mN;
        if (Math.abs(QN) < 1e-12) continue;
        const tN = -(2 * y0N + 2 * z0N * mN - xiN * (z0N + y0N * mN)) / QN;
        const yN = y0N + tN, zN = z0N + mN * tN;
        if (Math.abs(yN) > lim || Math.abs(zN) > lim) continue;
        const m = frac(BigInt(mn), BigInt(md));
        const Q = Fsub(Fadd(F1, Fmul(m, m)), Fmul(xi, m));
        if (Q.n === 0n) continue;
        const L = Fsub(Fadd(Fmul(F2, y0), Fmul(F2, Fmul(z0, m))), Fmul(xi, Fadd(z0, Fmul(y0, m))));
        const t = Fneg(Fdiv(L, Q));
        ps.tryAdd(xi, Fadd(y0, t), Fadd(z0, Fmul(m, t)));
        if (ps.capped) return;
      }
    }
  }
}

// Vieta involutions z' = xy - z on the three cyclic re-orderings.
function vietaPass(ps) {
  const snapshot = ps.list.slice();
  const CYC = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  for (const o of snapshot) {
    for (const c of CYC) {
      const x = o.fr[c[0]], y = o.fr[c[1]], z = o.fr[c[2]];
      ps.tryAdd(x, y, Fsub(Fmul(x, y), z));
      if (ps.capped) return;
    }
  }
}

// Vieta partners of a specific point (exact), for the selection panel.
function vietaPartners(fr) {
  const [x, y, z] = fr;
  return [
    [Fsub(Fmul(y, z), x), y, z],
    [x, Fsub(Fmul(x, z), y), z],
    [x, y, Fsub(Fmul(x, y), z)],
  ];
}

// =====================  knot curve generators  =====================

// characters live in the plane x = y = t; abelian parabola z = t^2 - 2 always.
function knotSweep(ps, D1, kind) {
  const M = ps.M;
  for (let q = 1; q <= D1; q++) {
    for (let p = -M * q; p <= M * q; p++) {
      if (gcdInt(Math.abs(p), q) !== 1) continue;
      const t = frac(BigInt(p), BigInt(q));
      ps.tryAdd(t, t, Fsub(Fmul(t, t), F2));       // abelian characters
      if (kind === 'trefoil') {
        ps.tryAdd(t, t, F1);                       // nonabelian line z = 1
      } else {
        // fig-8: z^2 - (t^2+1)z + 2t^2 - 1 = 0, disc = (t^2-1)(t^2-5)
        const N = (p * p - q * q) * (p * p - 5 * q * q);
        if (N < 0) continue;
        const w = isqrtExact(N);
        if (w < 0) continue;
        const den = BigInt(2 * q * q);
        ps.tryAdd(t, t, frac(BigInt(p * p + q * q + w), den));
        if (w > 0) ps.tryAdd(t, t, frac(BigInt(p * p + q * q - w), den));
      }
    }
  }
}

// =====================  Whitehead link generators  =====================
// F = z^3 - xyz^2 + (x^2+y^2-2)z - xy = 0; quadratic in y:
//   z.y^2 - x(z^2+1).y + (x^2 z + z^3 - 2z) = 0,
//   disc = x^2 (z^2+1)^2 - 4 z^2 (x^2 + z^2 - 2).

function whiteheadAxes(ps, D1) {
  // the coordinate lines (t, 0, 0) and (by the x<->y swap) (0, t, 0)
  const M = ps.M;
  for (let q = 1; q <= D1; q++)
    for (let p = -M * q; p <= M * q; p++)
      if (gcdInt(Math.abs(p), q) === 1) ps.tryAdd(frac(BigInt(p), BigInt(q)), F0, F0);
}

function whiteheadBrute(ps, D1) {
  const M = ps.M;
  const vals = [];
  for (let q = 1; q <= D1; q++)
    for (let p = -M * q; p <= M * q; p++)
      if (gcdInt(Math.abs(p), q) === 1) vals.push([p, q]);
  for (const [p, q] of vals) {          // x = p/q
    for (const [m, n] of vals) {        // z = m/n (z = 0 handled by the axes)
      if (m === 0) continue;
      const mm = m * m, nn = n * n, S = mm + nn;
      const N = p * p * S * S - 4 * mm * (p * p * nn + q * q * mm - 2 * q * q * nn);
      if (N < 0) continue;
      const w = isqrtExact(N);
      if (w < 0) continue;
      // y = [p(m^2+n^2) +- w] / (2 m n q)
      const den = BigInt(2 * m * n * q);
      const x = frac(BigInt(p), BigInt(q)), z = frac(BigInt(m), BigInt(n));
      ps.tryAdd(x, frac(BigInt(p * S + w), den), z);
      if (w > 0) ps.tryAdd(x, frac(BigInt(p * S - w), den), z);
      if (ps.capped) return;
    }
  }
}

// z-fibers are conics z(x^2+y^2) - (z^2+1)xy + z(z^2-2) = 0: chord sweep.
function whiteheadFibers(ps, fiberCount, slopeH) {
  const fibers = new Map();
  for (const o of ps.list) {
    for (const op of ps.variety.syms) {
      const im = applyOp(o.fr, op);
      if (im[2].n === 0n) continue;
      const key = fstr(im[2]);
      const cur = fibers.get(key);
      if (!cur || o.H < cur.H) fibers.set(key, { ze: im[2], x0: im[0], y0: im[1], H: o.H });
    }
  }
  const chosen = [...fibers.values()].sort((a, b) => a.H - b.H).slice(0, fiberCount);
  const lim = ps.M + 0.5;
  for (const fb of chosen) {
    const ze = fb.ze, x0 = fb.x0, y0 = fb.y0;
    const zN = fnum(ze), x0N = fnum(x0), y0N = fnum(y0);
    const cN = zN * zN + 1;
    const c = Fadd(Fmul(ze, ze), F1);   // z^2 + 1
    for (let md = 1; md <= slopeH; md++) {
      for (let mn = -slopeH; mn <= slopeH; mn++) {
        if (gcdInt(Math.abs(mn), md) !== 1) continue;
        const mN = mn / md;
        const QN = zN * (1 + mN * mN) - cN * mN;
        if (Math.abs(QN) < 1e-12) continue;
        const tN = -(2 * zN * x0N + 2 * zN * y0N * mN - cN * (x0N * mN + y0N)) / QN;
        const xN = x0N + tN, yN = y0N + mN * tN;
        if (Math.abs(xN) > lim || Math.abs(yN) > lim) continue;
        const m = frac(BigInt(mn), BigInt(md));
        const Q = Fsub(Fmul(ze, Fadd(F1, Fmul(m, m))), Fmul(c, m));
        if (Q.n === 0n) continue;
        const L = Fsub(Fmul(Fmul(F2, ze), Fadd(x0, Fmul(y0, m))), Fmul(c, Fadd(Fmul(x0, m), y0)));
        const t = Fneg(Fdiv(L, Q));
        ps.tryAdd(Fadd(x0, t), Fadd(y0, Fmul(m, t)), ze);
        if (ps.capped) return;
      }
    }
  }
}

// quadratic flips: for z != 0, y' = x(z^2+1)/z - y (and the x <-> y mirror).
function whiteheadFlipPartners(fr) {
  const [x, y, z] = fr;
  if (z.n === 0n) return [];
  const c = Fdiv(Fadd(Fmul(z, z), F1), z);
  return [
    [Fsub(Fmul(c, y), x), y, z],
    [x, Fsub(Fmul(c, x), y), z],
  ];
}

function whiteheadFlips(ps) {
  const snapshot = ps.list.slice();
  for (const o of snapshot) {
    for (const p of whiteheadFlipPartners(o.fr)) {
      ps.tryAdd(p[0], p[1], p[2]);
      if (ps.capped) return;
    }
  }
}

// =====================  twinkle generations  =====================

// Markov descent: number of strictly |.|-sum-decreasing Vieta moves to the
// minimal point of the tree (= Markov tree level for 3x Markov triples).
function descentGen(x, y, z) {
  let g = 0;
  for (let step = 0; step < 64; step++) {
    const s = Math.abs(x) + Math.abs(y) + Math.abs(z);
    const cx = y * z - x, cy = x * z - y, cz = x * y - z;
    const sx = Math.abs(cx) + Math.abs(y) + Math.abs(z);
    const sy = Math.abs(x) + Math.abs(cy) + Math.abs(z);
    const sz = Math.abs(x) + Math.abs(y) + Math.abs(cz);
    const m = Math.min(sx, sy, sz);
    if (m >= s - 1e-9) break;
    if (m === sx) x = cx; else if (m === sy) y = cy; else z = cz;
    g++;
  }
  return g;
}

// Whitehead: descent within the z-fiber under the two quadratic flips.
function descentGenWH(x, y, z) {
  if (Math.abs(z) < 1e-12) return 0;
  const c = (z * z + 1) / z;
  let g = 0;
  for (let step = 0; step < 64; step++) {
    const s = Math.abs(x) + Math.abs(y);
    const nx = c * y - x, ny = c * x - y;
    const sx = Math.abs(nx) + Math.abs(y), sy = Math.abs(x) + Math.abs(ny);
    const m = Math.min(sx, sy);
    if (m >= s - 1e-9) break;
    if (m === sx) x = nx; else y = ny;
    g++;
  }
  return g;
}

// Lazily compute and cache each orbit's generation (on the orbit objects,
// so it survives re-sorting of ps.list).
function computeGens(ps) {
  const kind = ps.variety.kind;
  let maxG = 0;
  for (const o of ps.list) {
    if (o.gen === undefined) {
      const f = o.fr.map(fnum);
      if (kind === 'markov') o.gen = descentGen(f[0], f[1], f[2]);
      else if (kind === 'whitehead') o.gen = descentGenWH(f[0], f[1], f[2]);
      else o.gen = Math.max(0, Math.round(Math.log2(Math.max(1, o.H))));
    }
    if (o.gen > maxG) maxG = o.gen;
  }
  return maxG;
}

// =====================  pipelines  =====================
const H_CAP = 6500;
const MAX_ORBITS = 60000;

function generationSteps(ps, depth) {
  const d = Math.min(depth, 3);
  const steps = [];
  const kind = ps.variety.kind;
  if (kind === 'markov' && ps.k === 0) {
    const N = [60, 120, 200, 300][d];
    steps.push({ label: `projecting from the cone point (N ≤ ${N})…`, run: () => coneEnum(ps, N) });
    steps.push({ label: 'placing the quaternion character…', run: () => ps.tryAdd(F0, F0, F0) });
  } else if (kind === 'markov') {
    const D1 = [11, 14, 17, 20][d];
    const fc = [110, 180, 260, 340][d];
    const sh = [22, 30, 38, 46][d];
    steps.push({ label: `sweeping denominators ≤ ${D1}…`, run: () => bruteForce(ps, D1) });
    steps.push({ label: 'walking conic fibers…', run: () => fiberSweep(ps, fc, sh) });
    steps.push({ label: 'applying Vieta moves…', run: () => { vietaPass(ps); vietaPass(ps); } });
    steps.push({ label: 'walking new conic fibers…', run: () => fiberSweep(ps, fc + 40, sh + 4) });
  } else if (kind === 'trefoil' || kind === 'fig8') {
    const D1 = [40, 70, 100, 140][d];
    steps.push({
      label: `sweeping meridian traces, denominators ≤ ${D1}…`,
      run: () => knotSweep(ps, D1, kind),
    });
  } else if (kind === 'whitehead') {
    const D1 = [7, 9, 11, 13][d];
    const fc = [90, 150, 220, 300][d];
    const sh = [20, 26, 32, 40][d];
    steps.push({ label: 'laying the coordinate axes…', run: () => whiteheadAxes(ps, [30, 45, 60, 80][d]) });
    steps.push({ label: `sweeping (x, z) pairs, denominators ≤ ${D1}…`, run: () => whiteheadBrute(ps, D1) });
    steps.push({ label: 'walking conic z-fibers…', run: () => whiteheadFibers(ps, fc, sh) });
    steps.push({ label: 'applying quadratic flips…', run: () => { whiteheadFlips(ps); whiteheadFlips(ps); } });
    steps.push({ label: 'walking new z-fibers…', run: () => whiteheadFibers(ps, fc + 40, sh + 4) });
  }
  return steps;
}
