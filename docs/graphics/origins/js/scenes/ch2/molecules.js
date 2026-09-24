// molecules.js — ball-and-stick molecules for Chapter 2: templates built
// from real geometry (bond lengths in ångströms, ring angles), a 3D
// projection, depth-sorted drawing, and an "assembly" animation in which
// atoms fly in one by one and bonds snap shut.

import { SHAPE } from '../../gfx/renderer.js';
import { hash, clamp, smoothstep, ease } from '../../lib/math.js';
import { ELEMENTS } from '../common/elements.js';

export const ATOM_R = { H: 0.3, C: 0.48, N: 0.46, O: 0.45, P: 0.58, S: 0.58 };
export const colorOf = (el) => (el === 'C' ? [0.56, 0.58, 0.66] : ELEMENTS[el].color);

// ── template builder ───────────────────────────────────────────────────────

class Builder {
  constructor() { this.atoms = []; this.bonds = []; }
  atom(el, x, y, z = 0) { this.atoms.push({ el, p: [x, y, z] }); return this.atoms.length - 1; }
  bond(i, j, order = 1, ring = false) { this.bonds.push({ i, j, order, ring }); }
  /** Attach a new atom to atom i, `len` Å away in direction (dx, dy, dz). */
  sub(i, el, dx, dy, dz = 0, len = 1.0, order = 1) {
    const l = Math.hypot(dx, dy, dz) || 1, a = this.atoms[i].p;
    const k = this.atom(el, a[0] + (dx / l) * len, a[1] + (dy / l) * len, a[2] + (dz / l) * len);
    this.bond(i, k, order);
    return k;
  }
  /** Regular ring of atoms; returns their indices. Bonds close the ring. */
  ring(els, cx, cy, r, a0 = 0, orders = null) {
    const idx = els.map((el, k) => {
      const a = a0 + (k / els.length) * Math.PI * 2;
      return this.atom(el, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    });
    for (let k = 0; k < idx.length; k++) this.bond(idx[k], idx[(k + 1) % idx.length], orders ? orders[k] : 1, k === idx.length - 1);
    return idx;
  }
  done(name) {
    // centre on the centroid
    const n = this.atoms.length, c = [0, 0, 0];
    for (const a of this.atoms) { c[0] += a.p[0] / n; c[1] += a.p[1] / n; c[2] += a.p[2] / n; }
    for (const a of this.atoms) { a.p[0] -= c[0]; a.p[1] -= c[1]; a.p[2] -= c[2]; }
    return { name, atoms: this.atoms, bonds: this.bonds };
  }
}

const out = (cx, cy, x, y) => [x - cx, y - cy];

/** Hexane-like hydrocarbon chain: zig-zag carbons, two hydrogens on each. */
export function hydrocarbon(n = 6) {
  const b = new Builder();
  const cs = [];
  for (let i = 0; i < n; i++) {
    const c = b.atom('C', i * 1.26, (i % 2) * 0.86 - 0.43);
    if (i) b.bond(cs[i - 1], c);
    cs.push(c);
  }
  cs.forEach((c, i) => {
    const up = i % 2 ? 1 : -1;
    b.sub(c, 'H', -0.35, up * 0.6, 0.85, 1.09);
    b.sub(c, 'H', -0.35, up * 0.6, -0.85, 1.09);
    if (i === 0) b.sub(c, 'H', -1, -0.3, 0, 1.09);
    if (i === n - 1) b.sub(c, 'H', 1, (n % 2 ? -1 : 1) * 0.3, 0, 1.09);
  });
  return b.done('hydrocarbon');
}

/** Benzene: a hexagon of carbons with alternating double bonds. */
export function benzene() {
  const b = new Builder();
  const ring = b.ring(['C', 'C', 'C', 'C', 'C', 'C'], 0, 0, 1.39, Math.PI / 6, [2, 1, 2, 1, 2, 1]);
  ring.forEach((c, k) => {
    const a = Math.PI / 6 + (k / 6) * Math.PI * 2;
    b.sub(c, 'H', Math.cos(a), Math.sin(a), 0, 1.08);
  });
  return b.done('benzene');
}

/** Ribose (furanose ring): four carbons and an oxygen, hydroxyls around it. */
export function ribose() {
  const b = new Builder();
  const r = b.ring(['O', 'C', 'C', 'C', 'C'], 0, 0, 1.2, -Math.PI / 2);
  const [, c1, c2, c3, c4] = r;
  const dirs = [0, 1, 2, 3, 4].map((k) => -Math.PI / 2 + (k / 5) * Math.PI * 2);
  const oh = (c, k, z) => {
    const o = b.sub(c, 'O', Math.cos(dirs[k]), Math.sin(dirs[k]), z, 1.43);
    b.sub(o, 'H', Math.cos(dirs[k]) + 0.5, Math.sin(dirs[k]), z, 0.96);
  };
  oh(c1, 1, 0.4); oh(c2, 2, -0.5); oh(c3, 3, 0.5);
  const c5 = b.sub(c4, 'C', Math.cos(dirs[4]), Math.sin(dirs[4]), -0.3, 1.52);
  const o5 = b.sub(c5, 'O', 0.2, 1, 0.3, 1.43);
  b.sub(o5, 'H', 0.8, 0.6, 0, 0.96);
  for (const [c, k] of [[c1, 1], [c2, 2], [c3, 3], [c4, 4]]) b.sub(c, 'H', Math.cos(dirs[k]) * 0.3, Math.sin(dirs[k]) * 0.3, k % 2 ? -1 : 1, 1.09);
  return b.done('ribose');
}

/** Glycine, the simplest amino acid: H₂N–CH₂–COOH. */
export function glycine() {
  const b = new Builder();
  const n = b.atom('N', -1.9, 0.2);
  const ca = b.atom('C', -0.5, -0.3); b.bond(n, ca);
  const c = b.atom('C', 0.8, 0.4); b.bond(ca, c);
  b.sub(c, 'O', 0.3, 1, 0, 1.21, 2);
  const oh = b.sub(c, 'O', 1, -0.6, 0, 1.34);
  b.sub(oh, 'H', 0.6, -1, 0, 0.97);
  b.sub(n, 'H', -0.6, 1, 0.3, 1.01);
  b.sub(n, 'H', -0.8, -0.8, -0.3, 1.01);
  b.sub(ca, 'H', -0.2, -0.6, 0.8, 1.09);
  b.sub(ca, 'H', -0.2, -0.6, -0.8, 1.09);
  return b.done('glycine');
}

/** A nucleotide (AMP-like): phosphate – ribose – adenine. */
export function nucleotide() {
  const b = new Builder();
  // phosphate
  const p = b.atom('P', -3.6, 1.6);
  b.sub(p, 'O', -0.4, 1, 0.3, 1.5, 2);
  b.sub(p, 'O', -1, -0.1, -0.5, 1.55);
  b.sub(p, 'O', -0.2, 0.2, 1, 1.55);
  const o5 = b.sub(p, 'O', 1, -0.4, 0, 1.6);
  // ribose ring
  const c5 = b.sub(o5, 'C', 1, -0.3, 0.2, 1.43);
  const ring = b.ring(['C', 'O', 'C', 'C', 'C'], -0.4, -0.6, 1.2, Math.PI * 0.9);
  const [c4, o4, c1, c2, c3] = ring;
  void o4;
  b.bond(c5, c4);
  b.sub(c2, 'O', 0.1, -1, 0.4, 1.43);
  b.sub(c3, 'O', -0.5, -1, -0.4, 1.43);
  // adenine: a six-ring fused to a five-ring
  const n9 = b.sub(c1, 'N', 1, 0.2, 0, 1.47);
  const a9 = b.atoms[n9].p;
  const five = [n9];
  const cx5 = a9[0] + 1.15, cy5 = a9[1] + 0.1;
  for (let k = 1; k < 5; k++) {
    const ang = Math.PI + (k / 5) * Math.PI * 2;
    five.push(b.atom(k === 2 ? 'N' : 'C', cx5 + Math.cos(ang) * 1.14, cy5 + Math.sin(ang) * 1.14));
    b.bond(five[k - 1], five[k], k === 2 ? 2 : 1);
  }
  b.bond(five[4], n9, 1, true);
  const c4a = five[3], c5a = five[4];
  const pa = b.atoms[c4a].p, pb = b.atoms[c5a].p;
  const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
  const nx = mx - cx5, ny = my - cy5, nl = Math.hypot(nx, ny);
  const cx6 = mx + (nx / nl) * 1.2, cy6 = my + (ny / nl) * 1.2;
  const six = [c4a];
  const a0 = Math.atan2(pa[1] - cy6, pa[0] - cx6), a1 = Math.atan2(pb[1] - cy6, pb[0] - cx6);
  const dir = Math.sign(Math.sin(a1 - a0)) || 1;
  for (let k = 1; k < 5; k++) {
    const ang = a0 - dir * (k / 6) * Math.PI * 2;
    six.push(b.atom(k % 2 ? 'N' : 'C', cx6 + Math.cos(ang) * 1.39, cy6 + Math.sin(ang) * 1.39));
    b.bond(six[k - 1], six[k], k % 2 ? 2 : 1);
  }
  b.bond(six[4], c5a, 1, true);
  const amine = b.sub(six[2], 'N', ...out(cx6, cy6, ...b.atoms[six[2]].p.slice(0, 2)), 0, 1.34);
  b.sub(amine, 'H', 1, 0.6, 0, 1.0);
  b.sub(amine, 'H', 1, -0.6, 0, 1.0);
  return b.done('nucleotide');
}

// ── projection & drawing ───────────────────────────────────────────────────

/**
 * Transform template atoms to screen. xf = { x, y, s (px per Å), yaw, pitch, roll, persp }.
 * Returns [{ sx, sy, z, k (perspective), r }].
 */
export function project(tpl, xf, outArr = []) {
  const cy = Math.cos(xf.yaw || 0), sy = Math.sin(xf.yaw || 0);
  const cp = Math.cos(xf.pitch || 0), sp = Math.sin(xf.pitch || 0);
  const cr = Math.cos(xf.roll || 0), sr = Math.sin(xf.roll || 0);
  const persp = xf.persp ?? 0.06;
  tpl.atoms.forEach((a, i) => {
    let [x, y, z] = a.p;
    let t = x * cr - y * sr; y = x * sr + y * cr; x = t;          // roll (screen plane)
    t = x * cy + z * sy; z = -x * sy + z * cy; x = t;             // yaw
    t = y * cp - z * sp; z = y * sp + z * cp; y = t;              // pitch
    const k = 1 / (1 - z * persp);
    outArr[i] = { sx: xf.x + x * xf.s * k, sy: xf.y - y * xf.s * k, z, k, r: ATOM_R[a.el] * xf.s * k };
  });
  return outArr;
}

/**
 * Draw a molecule. `vis(i)` → 0..1 per atom (fly-in / fade), `bondVis(b)` → 0..1 grow.
 * Positions may be overridden per atom through `pos(i, p)` (fly-in paths).
 */
export function drawMolecule(R, tpl, P, { alpha = 1, glow = 0.5, vis = null, bondVis = null } = {}) {
  const S = R.sprites, L = R.lines;
  // bonds: soft glow underneath, then the stick
  for (const bd of tpl.bonds) {
    const g = bondVis ? bondVis(bd) : 1;
    if (g <= 0) continue;
    const a = P[bd.i], b = P[bd.j];
    const ca = colorOf(tpl.atoms[bd.i].el), cb = colorOf(tpl.atoms[bd.j].el);
    const ex = a.sx + (b.sx - a.sx) * g, ey = a.sy + (b.sy - a.sy) * g;
    const w = Math.max(0.6, 0.11 * (a.r / ATOM_R[tpl.atoms[bd.i].el]));
    const mx = (a.sx + ex) / 2, my = (a.sy + ey) / 2;
    L.add(a.sx, a.sy, ex, ey, w * 3.2, [0.6, 0.8, 1.0], alpha * glow * 0.35, [0.6, 0.8, 1.0], alpha * glow * 0.35, 1);
    if (bd.order === 2) {
      const dx = ey - a.sy, dy = -(ex - a.sx), dl = Math.hypot(dx, dy) || 1, o = w * 1.6;
      for (const sgn of [-1, 1]) {
        const ox = (dx / dl) * o * sgn, oy = (dy / dl) * o * sgn;
        L.add(a.sx + ox, a.sy + oy, mx + ox, my + oy, w * 0.7, ca, alpha, ca, alpha, 0);
        L.add(mx + ox, my + oy, ex + ox, ey + oy, w * 0.7, cb, alpha, cb, alpha, 0);
      }
    } else {
      L.add(a.sx, a.sy, mx, my, w, ca, alpha, ca, alpha, 0);
      L.add(mx, my, ex, ey, w, cb, alpha, cb, alpha, 0);
    }
  }
  L.flush('add');
  // atoms, far to near
  const order = P.map((p, i) => i).sort((i, j) => P[i].z - P[j].z);
  for (const i of order) {
    const v = vis ? vis(i) : 1;
    if (v <= 0) continue;
    const p = P[i], c = colorOf(tpl.atoms[i].el);
    S.add(p.sx, p.sy, p.r * 2.4, c, alpha * v * glow * 0.22, SHAPE.glow);
  }
  S.flush('add');
  for (const i of order) {
    const v = vis ? vis(i) : 1;
    if (v <= 0) continue;
    const p = P[i], c = colorOf(tpl.atoms[i].el);
    S.add(p.sx, p.sy, p.r * (0.6 + 0.4 * v), [c[0] * 1.15, c[1] * 1.15, c[2] * 1.15], alpha * Math.min(1, v * 1.5), SHAPE.sphere, 0.55, 0.45);
  }
  S.flush('over');
}

/**
 * Assembly choreography: atoms fly in along curved paths and land in order;
 * bonds grow once both ends have landed; closing a ring flashes.
 * Returns { P (positions), vis, bondVis, flashes: [{x, y, a, big}] }.
 */
export function assembly(tpl, xf, T, t0, dur, seed = 1) {
  const n = tpl.atoms.length;
  const P = project(tpl, xf);
  const land = (i) => t0 + (i / Math.max(1, n - 1)) * dur * 0.82;
  const fly = 0.9;
  const flashes = [];
  for (let i = 0; i < n; i++) {
    const u = clamp((T - (land(i) - fly)) / fly);
    const e = ease.outCubic(u);
    const ang = hash(i, seed) * Math.PI * 2, dist = xf.s * (7 + 5 * hash(i, seed + 1));
    const sx = P[i].sx + Math.cos(ang) * dist, sy = P[i].sy + Math.sin(ang) * dist;
    const bend = (hash(i, seed + 2) - 0.5) * dist * 0.8;
    const bx = (sx + P[i].sx) / 2 - Math.sin(ang) * bend, by = (sy + P[i].sy) / 2 + Math.cos(ang) * bend;
    const q = 1 - e;
    P[i].sx = q * q * sx + 2 * q * e * bx + e * e * P[i].sx;
    P[i].sy = q * q * sy + 2 * q * e * by + e * e * P[i].sy;
    P[i].v = smoothstep(0, 0.35, u);
    const since = T - land(i);
    if (since > 0 && since < 0.35) flashes.push({ x: P[i].sx, y: P[i].sy, a: 1 - since / 0.35, big: false });
  }
  const bondT = (bd) => Math.max(land(bd.i), land(bd.j));
  for (const bd of tpl.bonds) {
    const since = T - bondT(bd) - 0.25;
    if (bd.ring && since > 0 && since < 0.7) {
      const a = P[bd.i], b = P[bd.j];
      flashes.push({ x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2, a: 1 - since / 0.7, big: true });
    }
  }
  const done = T - (t0 + dur * 0.82) - 0.3;
  return {
    P,
    vis: (i) => P[i].v,
    bondVis: (bd) => clamp((T - bondT(bd)) / 0.25),
    flashes,
    complete: done > 0 ? Math.max(0, 1 - done / 0.8) : 0,
  };
}

/** Bond flashes and completion glow. */
export function drawFlashes(R, flashes, alpha, xf) {
  const S = R.sprites;
  for (const f of flashes) {
    if (f.big) {
      S.add(f.x, f.y, xf.s * (1.5 + 3 * (1 - f.a)), [1, 0.95, 0.8], alpha * f.a * 1.4, SHAPE.ring, 0.08);
      S.add(f.x, f.y, xf.s * 1.6, [1, 0.9, 0.7], alpha * f.a * 1.2, SHAPE.glow);
    } else {
      S.add(f.x, f.y, xf.s * 0.9, [0.85, 0.95, 1.0], alpha * f.a * 0.9, SHAPE.glow);
    }
  }
  S.flush('add');
}
