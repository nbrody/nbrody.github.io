// Sharing a knot: a compact URL code for its curves, and a binary STL of the tube for 3D printing.
import { resampleClosed, centroid, radius } from './knot.js';

// ───────────── link code ─────────────
// Each component is resampled to at most `perComp` points, centred, and quantised to 16 bits
// across [−R, R]. Layout (little endian): u8 version, u8 count, then per component u16 n and
// n·3 int16 coordinates; then f32 R. base64url.
const VERSION = 1;

export function encodeKnot(comps, { perComp = 120 } = {}) {
  if (!comps.length) return '';
  const c = centroid(comps), R = radius(comps, c) * 1.05 || 1;
  const pts = comps.map(p => resampleClosed(p, Math.min(perComp, p.length / 3)));
  const size = 2 + pts.reduce((s, p) => s + 2 + 2 * p.length, 0) + 4;
  const buf = new ArrayBuffer(size), v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, VERSION); v.setUint8(o++, pts.length);
  for (const p of pts) {
    v.setUint16(o, p.length / 3, true); o += 2;
    for (let i = 0; i < p.length; i++) {
      const q = Math.round(((p[i] - c[i % 3]) / R) * 32767);
      v.setInt16(o, Math.max(-32767, Math.min(32767, q)), true); o += 2;
    }
  }
  v.setFloat32(o, R, true);
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeKnot(code) {
  const b = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  const v = new DataView(bytes.buffer);
  let o = 0;
  if (v.getUint8(o++) !== VERSION) throw new Error('unknown knot code version');
  const count = v.getUint8(o++);
  const raw = [];
  for (let k = 0; k < count; k++) {
    const n = v.getUint16(o, true); o += 2;
    if (n < 3) throw new Error('component too short');
    const p = new Float64Array(3 * n);
    for (let i = 0; i < 3 * n; i++) { p[i] = v.getInt16(o, true) / 32767; o += 2; }
    raw.push(p);
  }
  const R = v.getFloat32(o, true);
  if (!(R > 0) || o + 4 !== bytes.length) throw new Error('malformed knot code');
  return raw.map(p => p.map(x => x * R));
}

// ───────────── STL ─────────────
// geometries: [{ position: Float32Array, index: Uint16|Uint32Array|null }], in metres; written in mm.
export function binarySTL(geometries, { scale = 1000 } = {}) {
  let tris = 0;
  for (const g of geometries) tris += (g.index ? g.index.length : g.position.length / 3) / 3;
  const buf = new ArrayBuffer(84 + 50 * tris), v = new DataView(buf);
  const head = 'Knot Sculptor STL (mm)';
  for (let i = 0; i < head.length; i++) v.setUint8(i, head.charCodeAt(i));
  v.setUint32(80, tris, true);
  let o = 84;
  for (const { position: P, index: I } of geometries) {
    const n = I ? I.length : P.length / 3;
    for (let t = 0; t < n; t += 3) {
      const a = 3 * (I ? I[t] : t), b = 3 * (I ? I[t + 1] : t + 1), c = 3 * (I ? I[t + 2] : t + 2);
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz) || 1;
      v.setFloat32(o, nx / l, true); v.setFloat32(o + 4, ny / l, true); v.setFloat32(o + 8, nz / l, true); o += 12;
      for (const k of [a, b, c]) {
        v.setFloat32(o, P[k] * scale, true); v.setFloat32(o + 4, P[k + 1] * scale, true); v.setFloat32(o + 8, P[k + 2] * scale, true); o += 12;
      }
      o += 2; // attribute byte count
    }
  }
  return buf;
}

export function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ───────────── random knots ─────────────
// A random braid word on n strands whose closure is a knot (the permutation is an n-cycle)
// and is not obviously split (every generator occurs).
export function randomBraid(rand = Math.random) {
  for (;;) {
    const n = rand() < 0.6 ? 3 : 4;
    const len = n + 2 + Math.floor(rand() * (n + 3));
    const word = [];
    for (let k = 0; k < len; k++) {
      let g;
      do g = 1 + Math.floor(rand() * (n - 1)); while (word.length && Math.abs(word[word.length - 1]) === g && rand() < 0.5);
      // keep the same sign as the last time this generator appeared more often than not: fewer cancellations
      const prev = [...word].reverse().find(x => Math.abs(x) === g);
      const sign = prev && rand() < 0.75 ? Math.sign(prev) : rand() < 0.5 ? 1 : -1;
      word.push(sign * g);
    }
    // free reduction: σσ⁻¹ pairs, including the ones that meet after an earlier cancellation
    const reduced = [];
    for (const g of word) { if (reduced.length && reduced[reduced.length - 1] === -g) reduced.pop(); else reduced.push(g); }
    word.splice(0, word.length, ...reduced);
    if (new Set(word.map(Math.abs)).size !== n - 1) continue;
    const perm = [...Array(n).keys()];
    for (const g of word) { const i = Math.abs(g) - 1; [perm[i], perm[i + 1]] = [perm[i + 1], perm[i]]; }
    let p = 0, cycle = 0;
    do { p = perm[p]; cycle++; } while (p !== 0);
    if (cycle === n) return { n, word };
  }
}
