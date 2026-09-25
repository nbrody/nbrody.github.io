// Geometry for the rails, ties, troughs, cages and support posts.
import * as THREE from 'three';
import { RAIL, BALL } from '../sim/constants.js';

const R = BALL.R;

export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  // tube through centres c[] with frames (a,b) perpendicular to the path
  tube(c, fa, fb, radius, radial = 8, v0 = 0) {
    const base = this.count;
    for (let i = 0; i < c.length; i++) {
      for (let k = 0; k < radial; k++) {
        const th = (k / radial) * Math.PI * 2, co = Math.cos(th), si = Math.sin(th);
        const nx = co * fa[i].x + si * fb[i].x, ny = co * fa[i].y + si * fb[i].y, nz = co * fa[i].z + si * fb[i].z;
        this.pos.push(c[i].x + radius * nx, c[i].y + radius * ny, c[i].z + radius * nz);
        this.nor.push(nx, ny, nz);
        this.uv.push(k / radial, v0 + i * 0.05);
      }
    }
    for (let i = 0; i + 1 < c.length; i++) for (let k = 0; k < radial; k++) {
      const a = base + i * radial + k, b = base + i * radial + ((k + 1) % radial);
      const c2 = a + radial, d = b + radial;
      this.idx.push(a, c2, b, b, c2, d);
    }
  }
  // sweep a 2D profile [(s,u,ns,nu)] along centres with frames S,U
  sweep(c, S, U, prof) {
    const base = this.count, m = prof.length;
    for (let i = 0; i < c.length; i++) {
      for (let k = 0; k < m; k++) {
        const [a, b, na, nb] = prof[k];
        this.pos.push(c[i].x + a * S[i].x + b * U[i].x, c[i].y + a * S[i].y + b * U[i].y, c[i].z + a * S[i].z + b * U[i].z);
        const nx = na * S[i].x + nb * U[i].x, ny = na * S[i].y + nb * U[i].y, nz = na * S[i].z + nb * U[i].z;
        this.nor.push(nx, ny, nz);
        this.uv.push(k / (m - 1), i * 0.02);
      }
    }
    for (let i = 0; i + 1 < c.length; i++) for (let k = 0; k + 1 < m; k++) {
      const a = base + i * m + k, b = a + 1, c2 = a + m, d = c2 + 1;
      this.idx.push(a, c2, b, b, c2, d);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// sample a track every `step` metres; returns arrays of centre/T/U/S
export function frames(track, step = 0.02, s0 = 0, s1 = track.L) {
  const out = { P: [], T: [], U: [], S: [], s: [] };
  const f = {};
  const n = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
  for (let i = 0; i < n; i++) {
    const s = s0 + (s1 - s0) * (i / (n - 1));
    track.sample(s, f);
    out.P.push({ x: f.px, y: f.py, z: f.pz });
    out.T.push({ x: f.tx, y: f.ty, z: f.tz });
    out.U.push({ x: f.ux, y: f.uy, z: f.uz });
    out.S.push({ x: f.sx, y: f.sy, z: f.sz });
    out.s.push(s);
  }
  return out;
}

const add = (a, b, k) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });

export function buildTracks(machine, M, opts = {}) {
  const railG = new GeoBuilder();
  const troughG = new GeoBuilder();
  const cageG = new GeoBuilder();
  const tieMats = [];
  const hoopMats = [];
  const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const rr = BALL.railRadius;
  for (const t of machine.world.tracks) {
    if (t.render.hidden || t.kind === 'flume') continue;   // flumes are built with the water slide
    const fr = frames(t, 0.02);
    if (t.kind === 'trough') {
      const w = (t.render.wide ?? 0) + R + 0.006;
      const prof = troughProfile(w);
      troughG.sweep(fr.P, fr.S, fr.U, prof);
      continue;
    }
    for (const side of [-1, 1]) {
      const c = fr.P.map((p, i) => add(add(p, fr.U[i], -RAIL.drop), fr.S[i], side * RAIL.lateral));
      railG.tube(c, fr.S, fr.U, rr, 8);
      if (t.caged) {
        const c2 = fr.P.map((p, i) => add(add(p, fr.U[i], RAIL.drop * 0.95), fr.S[i], side * RAIL.lateral));
        cageG.tube(c2, fr.S, fr.U, rr * 0.8, 6);
      }
    }
    if (t.render.guard) {
      // extra flanking guard rails on landing zones
      const [a, b] = t.render.guard;
      const g = frames(t, 0.02, a, Math.min(b, t.L));
      for (const side of [-1, 1]) {
        const c = g.P.map((p, i) => add(add(p, g.U[i], 0.004), g.S[i], side * (RAIL.lateral + 0.028)));
        cageG.tube(c, g.S, g.U, rr * 0.8, 6);
      }
    }
    // ties
    const tstep = 0.11;
    for (let s = 0.04; s < t.L; s += tstep) {
      const f = t.sample(s, {});
      bx.set(f.sx, f.sy, f.sz); by.set(f.ux, f.uy, f.uz); bz.set(f.tx, f.ty, f.tz);
      m4.makeBasis(bx, by, bz);
      const c = { x: f.px - f.ux * (RAIL.drop + rr + 0.002), y: f.py - f.uy * (RAIL.drop + rr + 0.002), z: f.pz - f.uz * (RAIL.drop + rr + 0.002) };
      m4.setPosition(c.x, c.y, c.z);
      tieMats.push(m4.clone());
      if (t.caged) {
        m4.makeBasis(bx, by, bz);
        m4.setPosition(f.px, f.py, f.pz);
        hoopMats.push(m4.clone());
      }
    }
  }
  // brush brakes: two strips of dark bristles either side of the ball, at its
  // waist, held on brass clips above the rails
  const brushG = new GeoBuilder(), clipG = new GeoBuilder();
  for (const t of machine.world.tracks) {
    if (!t.brake || t.render.hidden) continue;
    const g = frames(t, 0.02, t.brake.s0, t.brake.s1);
    for (const side of [-1, 1]) {
      const c = g.P.map((p, i) => add(p, g.S[i], side * (R + 0.007)));
      brushG.tube(c, g.S, g.U, 0.0085, 7);
      for (let i = 0; i < g.P.length; i += 7) {
        const top = add(c[i], g.S[i], side * 0.006), rail = add(add(g.P[i], g.U[i], -RAIL.drop), g.S[i], side * RAIL.lateral);
        const d = new THREE.Vector3(top.x - rail.x, top.y - rail.y, top.z - rail.z).normalize();
        const fa = new THREE.Vector3(g.T[i].x, g.T[i].y, g.T[i].z), fb = new THREE.Vector3().crossVectors(fa, d).normalize();
        clipG.tube([rail, top], [fa, fa], [fb, fb], 0.0022, 5);
      }
    }
  }
  const group = new THREE.Group();
  if (brushG.count) {
    const bristle = new THREE.MeshStandardMaterial({ color: 0x33261c, roughness: 1, metalness: 0 });
    const brush = new THREE.Mesh(brushG.geometry(), bristle);
    brush.castShadow = true;
    group.add(brush, new THREE.Mesh(clipG.geometry(), M.brass));
  }
  const rails = new THREE.Mesh(railG.geometry(), M.steel);
  rails.castShadow = true; rails.receiveShadow = true;
  group.add(rails);
  if (troughG.count) {
    const tr = new THREE.Mesh(troughG.geometry(), M.trough);
    tr.castShadow = true; tr.receiveShadow = true;
    group.add(tr);
  }
  if (cageG.count) {
    const cg = new THREE.Mesh(cageG.geometry(), M.steel);
    cg.castShadow = true;
    group.add(cg);
  }
  // ties: flat bars under the rails
  const tieGeo = new THREE.BoxGeometry(2 * RAIL.lateral + 0.012, 0.005, 0.01);
  const ties = new THREE.InstancedMesh(tieGeo, M.steelDark, tieMats.length);
  tieMats.forEach((m, i) => ties.setMatrixAt(i, m));
  ties.castShadow = true;
  group.add(ties);
  if (hoopMats.length) {
    const hoopGeo = new THREE.TorusGeometry(R + 2 * rr, 0.0026, 5, 20);
    const hoops = new THREE.InstancedMesh(hoopGeo, M.steel, hoopMats.length);
    const rot = new THREE.Matrix4(); // torus lies in XY; our basis puts T on z, so it's already perpendicular to the path
    hoopMats.forEach((m, i) => hoops.setMatrixAt(i, m.multiply(rot)));
    group.add(hoops);
  }
  return group;
}

function troughProfile(w) {
  // U-channel around the ball path: inner face, lip, outer face (s,u,ns,nu)
  const pts = [];
  const r = w, n = 9;
  const top = 0.012, th = 0.004;
  pts.push([-r - th, top, -1, 0]);
  pts.push([-r, top + 0.003, 0, 1]);
  pts.push([-r, top, 1, 0]);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI; // 180..360
    const s = Math.cos(a) * r, u = Math.sin(a) * (R + 0.002) - 0.0;
    pts.push([s, Math.min(u, top), -Math.cos(a), -Math.sin(a)]);
  }
  pts.push([r, top, -1, 0]);
  pts.push([r, top + 0.003, 0, 1]);
  pts.push([r + th, top, 1, 0]);
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + (i / n) * Math.PI;
    pts.push([Math.cos(a) * (r + th), Math.sin(a) * (R + 0.002 + th), Math.cos(a), Math.sin(a)]);
  }
  pts.push([-r - th, top, -1, 0]);
  return pts;
}

// ---------------------------------------------------------------------------
// Supports, Rhoads-style: tracks hang off shared masts on short cantilever
// arms; a new mast is planted (clear of every track and device below) only
// when no existing mast is close enough. Helices hang off their columns.
export function buildSupports(machine, M, keepOut, floorAt, colorOf) {
  const world = machine.world;
  const cell = 0.1;
  const grid = new Map();
  for (const t of world.tracks) for (let i = 0; i < t.n; i += 3) {
    const x = t.P[3 * i], y = t.P[3 * i + 1], z = t.P[3 * i + 2];
    const k = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    let a = grid.get(k); if (!a) grid.set(k, (a = []));
    a.push(t, i, y);
  }
  const lineClear = (x, z, y0, y1, self, sSelf) => {
    const ci = Math.floor(x / cell), ck = Math.floor(z / cell);
    for (let i = ci - 1; i <= ci + 1; i++) for (let k = ck - 1; k <= ck + 1; k++) {
      const a = grid.get(`${i},${k}`); if (!a) continue;
      for (let j = 0; j < a.length; j += 3) {
        const u = a[j], idx = a[j + 1], yu = a[j + 2];
        if (yu < y0 - 0.06 || yu > y1 + 0.04) continue;
        if (u === self && Math.abs(idx * u.ds - sSelf) < 0.3) continue;
        if (Math.hypot(u.P[3 * idx] - x, u.P[3 * idx + 2] - z) < 0.075) return false;
      }
    }
    for (const k of keepOut) if (k.hit(x, z, y0, y1)) return false;
    return true;
  };
  const masts = [];
  const arms = [];
  const brackets = [];
  const f = {};
  // how far below the ball centre the track's underside is
  const dropOf = (t) => (t.kind === 'trough' ? R + 0.01 : t.kind === 'flume' ? R + 0.012 : RAIL.drop + 0.012);
  const tracks = [...world.tracks].sort((a, b) => b.start.y - a.start.y); // high tracks first: they plant the tall masts
  for (const t of tracks) {
    if (t.supports === false || t.render.hidden || t.meta.ladder !== undefined) continue;
    const color = colorOf(t);
    const col = t.meta.column;
    const colEnd = col ? Math.min(t.L, col.s1 ?? t.L) : 0;   // a helix hangs off its column; the rest stands on masts
    if (col) {
      const bdrop = dropOf(t) - 0.002;
      for (let s = 0.2; s < colEnd; s += col.step ?? 0.42) {
        t.sample(s, f);
        const dx = f.px - col.x, dz = f.pz - col.z, d = Math.hypot(dx, dz);
        if (d < col.r * 0.6 || d > col.r * 1.5) continue;
        brackets.push({ color, a: { x: col.x + dx / d * 0.05, y: f.py - 0.05, z: col.z + dz / d * 0.05 }, b: { x: f.px - f.ux * bdrop, y: f.py - f.uy * bdrop - 0.004, z: f.pz - f.uz * bdrop } });
      }
      if (colEnd >= t.L - 0.05) continue;
    }
    const step = t.render.supportStep ?? 0.95;
    for (let s = Math.max(colEnd + 0.3, Math.min(0.3, t.L / 2)); s < t.L - 0.05; s += step) {
      t.sample(s, f);
      if (f.uy < 0.55) continue;
      const drop = dropOf(t);
      const A = { x: f.px - f.ux * drop, y: f.py - f.uy * drop, z: f.pz - f.uz * drop };
      // outward (away from the machine's axis) perpendicular in plan
      let ox = f.sx, oz = f.sz;
      const ol = Math.hypot(ox, oz) || 1; ox /= ol; oz /= ol;
      if (ox * A.x + oz * A.z < 0) { ox = -ox; oz = -oz; }
      // 1) reuse a nearby mast
      let best = null, bd = 0.95;
      for (const m of masts) {
        const d = Math.hypot(m.x - A.x, m.z - A.z);
        if (d > bd || d < 0.06) continue;
        if (A.y > m.yTop - 0.02 && !lineClear(m.x, m.z, m.yTop, A.y + 0.05, null, 0)) continue;
        if (A.y < m.y0 + 0.1) continue;
        best = m; bd = d;
      }
      if (best) {
        best.yTop = Math.max(best.yTop, A.y + 0.035);
        arms.push({ color: best.color, a: { x: best.x, y: A.y, z: best.z }, b: A });
        continue;
      }
      // 2) plant a new mast just outside the track, or inside, or right under it
      for (const off of [0.15, -0.15, 0.0, 0.3, -0.3]) {
        const x = A.x + ox * off, z = A.z + oz * off;
        const y0 = floorAt(x, z);
        if (A.y - y0 < 0.08) break;
        if (!lineClear(x, z, y0, A.y + 0.05, t, s)) continue;
        const m = { x, z, y0, yTop: A.y + 0.035, color };
        masts.push(m);
        if (off !== 0) arms.push({ color, a: { x, y: A.y, z }, b: A });
        break;
      }
    }
  }
  // instanced cylinders per colour
  const byColor = new Map();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), v3 = new THREE.Vector3(), d3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const put = (color, a, b, r) => {
    let arr = byColor.get(color); if (!arr) byColor.set(color, (arr = []));
    d3.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const L = d3.length(); if (L < 1e-4) return;
    q.setFromUnitVectors(Y, d3.normalize());
    m4.compose(v3.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), q, s3.set(r, L, r));
    arr.push(m4.clone());
  };
  const trim = [];
  for (const m of masts) {
    const tall = m.yTop - m.y0 > 2.2;
    put(m.color, { x: m.x, y: m.y0, z: m.z }, { x: m.x, y: m.yTop, z: m.z }, tall ? 0.0125 : 0.0095);
    trim.push(m4.compose(v3.set(m.x, m.yTop + 0.012, m.z), q.identity(), s3.set(0.02, 0.024, 0.02)).clone());
    trim.push(m4.compose(v3.set(m.x, m.y0 + 0.005, m.z), q.identity(), s3.set(0.04, 0.01, 0.04)).clone());
  }
  for (const a of arms) put(a.color, a.a, a.b, 0.0055);
  for (const b of brackets) put(b.color, b.a, b.b, 0.005);
  const group = new THREE.Group();
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
  for (const [color, arr] of byColor) {
    const im = new THREE.InstancedMesh(cyl, M.paint(color), arr.length);
    arr.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }
  const trims = new THREE.InstancedMesh(cyl, M.brass, trim.length);
  trim.forEach((m, i) => trims.setMatrixAt(i, m));
  group.add(trims);
  group.userData.postCount = masts.length;
  group.userData.armCount = arms.length;
  group.userData.masts = masts;
  return group;
}
