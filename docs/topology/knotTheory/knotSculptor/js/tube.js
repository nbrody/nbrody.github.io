// Tube geometry around a polyline, with parallel-transport frames (closed curves get the holonomy
// spread evenly so the seam doesn't twist). Geometries are updated in place when the point count matches.
import * as THREE from 'three';

export function tubeGeometry(pts, radius, { closed = true, radial = 10, geometry = null } = {}) {
  const N = pts.length / 3;
  if (N < 2) return geometry || new THREE.BufferGeometry();
  const R = radial;
  const rings = closed ? N : N;
  const nVerts = rings * R;
  let g = geometry;
  if (!g || g.userData.nVerts !== nVerts || g.userData.closed !== closed) {
    g?.dispose();
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * nVerts), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(3 * nVerts), 3));
    const segs = closed ? N : N - 1;
    const idx = new (nVerts > 65535 ? Uint32Array : Uint16Array)(segs * R * 6);
    let k = 0;
    for (let i = 0; i < segs; i++) {
      const i1 = (i + 1) % N;
      for (let j = 0; j < R; j++) {
        const j1 = (j + 1) % R;
        const a = i * R + j, b = i1 * R + j, c = i1 * R + j1, d = i * R + j1;
        idx[k++] = a; idx[k++] = b; idx[k++] = d;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.userData = { nVerts, closed };
  }
  // tangents
  const T = new Float64Array(3 * N);
  for (let i = 0; i < N; i++) {
    let a = i - 1, b = i + 1;
    if (closed) { a = (a + N) % N; b = b % N; } else { a = Math.max(0, a); b = Math.min(N - 1, b); }
    let x = pts[3 * b] - pts[3 * a], y = pts[3 * b + 1] - pts[3 * a + 1], z = pts[3 * b + 2] - pts[3 * a + 2];
    const l = Math.hypot(x, y, z) || 1;
    T[3 * i] = x / l; T[3 * i + 1] = y / l; T[3 * i + 2] = z / l;
  }
  // initial normal
  const Nn = new Float64Array(3 * N);
  {
    const tx = T[0], ty = T[1], tz = T[2];
    let ax = 0, ay = 1, az = 0;
    if (Math.abs(ty) > 0.9) { ax = 1; ay = 0; }
    const d = ax * tx + ay * ty + az * tz;
    let nx = ax - d * tx, ny = ay - d * ty, nz = az - d * tz;
    const l = Math.hypot(nx, ny, nz);
    Nn[0] = nx / l; Nn[1] = ny / l; Nn[2] = nz / l;
  }
  const transport = (i, j) => { // carry the normal from i to j
    const tx = T[3 * j], ty = T[3 * j + 1], tz = T[3 * j + 2];
    let nx = Nn[3 * i], ny = Nn[3 * i + 1], nz = Nn[3 * i + 2];
    const d = nx * tx + ny * ty + nz * tz;
    nx -= d * tx; ny -= d * ty; nz -= d * tz;
    const l = Math.hypot(nx, ny, nz) || 1;
    Nn[3 * j] = nx / l; Nn[3 * j + 1] = ny / l; Nn[3 * j + 2] = nz / l;
  };
  for (let i = 0; i < N - 1; i++) transport(i, i + 1);
  if (closed) {
    // holonomy: angle between the transported normal at the end and the start normal, about T0
    const save = [Nn[0], Nn[1], Nn[2]];
    const last = [Nn[3 * (N - 1)], Nn[3 * (N - 1) + 1], Nn[3 * (N - 1) + 2]];
    const tx = T[0], ty = T[1], tz = T[2];
    let d = last[0] * tx + last[1] * ty + last[2] * tz;
    let lx = last[0] - d * tx, ly = last[1] - d * ty, lz = last[2] - d * tz;
    const ll = Math.hypot(lx, ly, lz) || 1; lx /= ll; ly /= ll; lz /= ll;
    const bx = ty * save[2] - tz * save[1], by = tz * save[0] - tx * save[2], bz = tx * save[1] - ty * save[0];
    const theta = Math.atan2(lx * bx + ly * by + lz * bz, lx * save[0] + ly * save[1] + lz * save[2]);
    for (let i = 0; i < N; i++) { // rotate normal i by −θ·i/N about T_i
      const a = (-theta * i) / N, c = Math.cos(a), s = Math.sin(a);
      const t = [T[3 * i], T[3 * i + 1], T[3 * i + 2]];
      const n = [Nn[3 * i], Nn[3 * i + 1], Nn[3 * i + 2]];
      const b = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
      Nn[3 * i] = c * n[0] + s * b[0]; Nn[3 * i + 1] = c * n[1] + s * b[1]; Nn[3 * i + 2] = c * n[2] + s * b[2];
    }
  }
  const P = g.attributes.position.array, NR = g.attributes.normal.array;
  for (let i = 0; i < N; i++) {
    const t = [T[3 * i], T[3 * i + 1], T[3 * i + 2]];
    const n = [Nn[3 * i], Nn[3 * i + 1], Nn[3 * i + 2]];
    const b = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    for (let j = 0; j < R; j++) {
      const ph = (2 * Math.PI * j) / R, c = Math.cos(ph), s = Math.sin(ph);
      const ox = c * n[0] + s * b[0], oy = c * n[1] + s * b[1], oz = c * n[2] + s * b[2];
      const v = 3 * (i * R + j);
      P[v] = pts[3 * i] + radius * ox; P[v + 1] = pts[3 * i + 1] + radius * oy; P[v + 2] = pts[3 * i + 2] + radius * oz;
      NR[v] = ox; NR[v + 1] = oy; NR[v + 2] = oz;
    }
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
