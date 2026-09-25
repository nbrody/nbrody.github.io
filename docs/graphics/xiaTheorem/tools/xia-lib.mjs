// xia-lib.mjs — shared pieces of the Xia cascade builder (Node only).

import { NBody } from '../js/nbody.js';
import { xiaInitial } from '../js/scenarios.js';

/** Semi-major axis and separation of the pair (i, j). */
export function pairA(s, i, j) {
  const x = s.x, v = s.v;
  const dx = x[3 * i] - x[3 * j], dy = x[3 * i + 1] - x[3 * j + 1], dz = x[3 * i + 2] - x[3 * j + 2];
  const dvx = v[3 * i] - v[3 * j], dvy = v[3 * i + 1] - v[3 * j + 1], dvz = v[3 * i + 2] - v[3 * j + 2];
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz), v2 = dvx * dvx + dvy * dvy + dvz * dvz, M = s.m[i] + s.m[j];
  const eps = v2 / 2 - M / r;
  return { a: -M / (2 * eps), r };
}

/**
 * Integrate a Xia configuration and classify Q₅'s encounters with the
 * binaries. A *good* encounter: Q₅ enters a binary's neighbourhood, leaves on
 * the side it came from (a bounce), at least `gMin` times faster relative to
 * the binary, and the binary stays bound and hardens. Stops at the first
 * encounter that is not good. `score` = number of consecutive good ones.
 */
export function classifySim(s, maxEnc = 30, opts = {}) {
  const enc = [];
  let inside = null, steps = 0, lastTarget = null;
  const K = opts.K ?? 2.5, gMin = opts.gMin ?? 1.25;
  let aA = pairA(s, 0, 1).a, aB = pairA(s, 2, 3).a;
  while (steps < (opts.maxSteps ?? 4e6)) {
    s.step(); steps++;
    if (s.failed) { enc.push({ type: 'fail' }); break; }
    const z5 = s.x[14], zA = (s.x[2] + s.x[5]) / 2, zB = (s.x[8] + s.x[11]) / 2;
    const dA = z5 - zA, dB = z5 - zB;
    if (!inside) {
      const bA = pairA(s, 0, 1), bB = pairA(s, 2, 3);
      // Two-body energies only mean something with Q₅ well away (it is not that light).
      if (Math.abs(dA) > 3 * K * aA) aA = bA.a;
      if (Math.abs(dB) > 3 * K * aB) aB = bB.a;
      if (!(aA > 0) || !(aB > 0)) { enc.push({ type: 'unbound', t: s.t }); break; }
      if (Math.abs(dA) < K * aA) inside = { X: 'A', side: Math.sign(dA), t0: s.t, minR: 1e9, P: 2 * Math.PI * Math.sqrt(aA ** 3 / 2), a0: aA, R: K * aA, v0: s.v[14] - (s.v[2] + s.v[5]) / 2 };
      else if (Math.abs(dB) < K * aB) inside = { X: 'B', side: Math.sign(dB), t0: s.t, minR: 1e9, P: 2 * Math.PI * Math.sqrt(aB ** 3 / 2), a0: aB, R: K * aB, v0: s.v[14] - (s.v[8] + s.v[11]) / 2 };
    } else {
      const X = inside.X, d = X === 'A' ? dA : dB;
      const o = X === 'A' ? 0 : 6;
      const r12 = Math.sqrt((s.x[o] - s.x[o + 3]) ** 2 + (s.x[o + 1] - s.x[o + 4]) ** 2 + (s.x[o + 2] - s.x[o + 5]) ** 2);
      inside.minR = Math.min(inside.minR, Math.sqrt(d * d + r12 * r12 / 4));
      if (Math.abs(d) > inside.R * 2.5) {
        const vb = X === 'A' ? (s.v[2] + s.v[5]) / 2 : (s.v[8] + s.v[11]) / 2;
        const b = X === 'A' ? pairA(s, 0, 1) : pairA(s, 2, 3);
        let type = Math.sign(d) === inside.side ? 'back' : 'thru';
        const vrel = s.v[14] - vb;
        if (type === 'back' && !(Math.abs(vrel) >= gMin * Math.abs(inside.v0) && b.a > 0 && b.a < inside.a0)) type = 'weak';
        enc.push({ X, t: s.t, t0: inside.t0, type, v0: inside.v0, vrel, a0: inside.a0, a1: b.a, minR: inside.minR });
        inside = null;
        if (X === 'A') aA = b.a; else aB = b.a;
        if (type !== 'back' || (lastTarget && X === lastTarget)) break;
        lastTarget = X;
        if (enc.length >= maxEnc) break;
      } else if (s.t - inside.t0 > 3 * inside.P + 3 * inside.R / Math.abs(inside.v0)) {
        enc.push({ type: 'capture', X: inside.X, t: s.t, minR: inside.minR }); break;
      }
    }
  }
  let score = 0, prev = null;
  for (const e of enc) { if (e.type === 'back' && e.X !== prev) { score++; prev = e.X; } else break; }
  return { enc, score, steps };
}

// ── Kepler time-shift of one binary (universal variables) ──

export function keplerShift(r0v, v0v, GM, dt) {
  const r0 = Math.hypot(...r0v), v2 = v0v[0] ** 2 + v0v[1] ** 2 + v0v[2] ** 2;
  const vr0 = (r0v[0] * v0v[0] + r0v[1] * v0v[1] + r0v[2] * v0v[2]) / r0;
  const alpha = 2 / r0 - v2 / GM, sm = Math.sqrt(GM);
  const C = z => z > 1e-8 ? (1 - Math.cos(Math.sqrt(z))) / z : z < -1e-8 ? (Math.cosh(Math.sqrt(-z)) - 1) / (-z) : 0.5 - z / 24;
  const S = z => z > 1e-8 ? (Math.sqrt(z) - Math.sin(Math.sqrt(z))) / z ** 1.5 : z < -1e-8 ? (Math.sinh(Math.sqrt(-z)) - Math.sqrt(-z)) / (-z) ** 1.5 : 1 / 6 - z / 120;
  let chi = sm * dt / r0;
  for (let i = 0; i < 80; i++) {
    const z = alpha * chi * chi, c = C(z), s = S(z);
    const F = r0 * vr0 / sm * chi * chi * c + (1 - alpha * r0) * chi ** 3 * s + r0 * chi - sm * dt;
    const dF = r0 * vr0 / sm * chi * (1 - z * s) + (1 - alpha * r0) * chi * chi * c + r0;
    const d = F / dF; chi -= d;
    if (Math.abs(d) < 1e-16 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi, c = C(z), s = S(z);
  const f = 1 - chi * chi / r0 * c, g = dt - chi ** 3 * s / sm;
  const r = r0v.map((x, k) => f * x + g * v0v[k]); const rn = Math.hypot(...r);
  const fd = sm / (rn * r0) * (alpha * chi ** 3 * s - chi), gd = 1 - chi * chi / rn * c;
  return { r, v: r0v.map((x, k) => fd * x + gd * v0v[k]) };
}

/** Shift the internal Kepler phase of binary (i, j) by dt; its centre of mass is untouched. */
export function shiftBinary(x, v, m, i, j, dt) {
  const M = m[i] + m[j];
  const rr = [0, 1, 2].map(k => x[3 * i + k] - x[3 * j + k]), vv = [0, 1, 2].map(k => v[3 * i + k] - v[3 * j + k]);
  const c = [0, 1, 2].map(k => (m[i] * x[3 * i + k] + m[j] * x[3 * j + k]) / M), cv = [0, 1, 2].map(k => (m[i] * v[3 * i + k] + m[j] * v[3 * j + k]) / M);
  const { r, v: w } = keplerShift(rr, vv, M, dt);
  for (let k = 0; k < 3; k++) {
    x[3 * i + k] = c[k] + m[j] / M * r[k]; x[3 * j + k] = c[k] - m[i] / M * r[k];
    v[3 * i + k] = cv[k] + m[j] / M * w[k]; v[3 * j + k] = cv[k] - m[i] / M * w[k];
  }
}

export const BUILD_OPTS = { eta: 1e9, tol: 1e-12 };

/** A one-parameter family of initial states → a fresh integrator for parameter p. */
export function familySim(fam, p) {
  if (fam.kind === 'MA') {
    const { masses, pos, vel } = xiaInitial({ ...fam.base, MA: p, MB: fam.MB });
    return NBody.fromState({ m: masses, t: 0, x: pos.flat(), v: vel.flat() }, BUILD_OPTS);
  }
  const st = fam.state;
  const x = Float64Array.from(st.x), v = Float64Array.from(st.v);
  if (p !== 0) shiftBinary(x, v, st.m, fam.ij[0], fam.ij[1], p * fam.P);
  return NBody.fromState({ m: st.m, t: st.t, x, v }, BUILD_OPTS);
}

export function stateFor(fam, p) {
  const s = familySim(fam, p);
  return { m: Array.from(s.m), t: s.t, x: Array.from(s.x), v: Array.from(s.v) };
}
