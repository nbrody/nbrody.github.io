// Glasshouse environment — shared helpers: RNG, noise, canvas textures, geometry building.
import * as THREE from 'three';

// ---------------------------------------------------------------- random ---
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed = 1) { this._r = mulberry32(seed); }
  next() { return this._r(); }
  range(a, b) { return a + (b - a) * this._r(); }
  int(a, b) { return a + Math.floor(this._r() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this._r() * arr.length)]; }
  chance(p) { return this._r() < p; }
  sign() { return this._r() < 0.5 ? -1 : 1; }
  jit(v, amt) { return v + (this._r() * 2 - 1) * amt; }
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// ----------------------------------------------------------------- noise ---
/** Tileable fbm value noise, normalised to [0,1]. Returns Float32Array(size*size). */
export function fbm2D(size, { cells = 4, octaves = 5, gain = 0.5, seed = 1 } = {}) {
  const out = new Float32Array(size * size);
  const rng = new Rng(seed);
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const c = Math.min(size, cells << o);
    const lat = new Float32Array(c * c);
    for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
    const inv = c / size;
    for (let y = 0; y < size; y++) {
      const fy = y * inv; const iy = Math.floor(fy); let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
      const r0 = (iy % c) * c, r1 = ((iy + 1) % c) * c;
      const row = y * size;
      for (let x = 0; x < size; x++) {
        const fx = x * inv; const ix = Math.floor(fx); let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
        const c0 = ix % c, c1 = (ix + 1) % c;
        const a = lat[r0 + c0], b = lat[r0 + c1], cc = lat[r1 + c0], d = lat[r1 + c1];
        out[row + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (cc + (d - cc) * tx) * ty);
      }
    }
    amp *= gain;
  }
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < out.length; i++) { const v = out[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const k = 1 / (mx - mn || 1);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * k;
  return out;
}

/** Smooth 1D periodic noise (sum of sines with random phases) — for silhouettes. */
export function periodicNoise1D(seed, terms = 6) {
  const rng = new Rng(seed);
  const t = [];
  for (let i = 0; i < terms; i++) t.push({ f: 1 + i * 2 + rng.int(0, 2), p: rng.range(0, TAU), a: 1 / (1 + i * 0.9) });
  const norm = t.reduce((s, e) => s + e.a, 0);
  return (x) => { // x in [0,1) periodic
    let v = 0;
    for (const e of t) v += e.a * Math.sin(x * TAU * e.f + e.p);
    return v / norm; // ~[-1,1]
  };
}

// ---------------------------------------------------------------- canvas ---
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** Paint a noise field into a canvas via a colour function (v in [0,1], x, y) -> [r,g,b]. */
export function noiseCanvas(size, noise, colorFn) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0, p = 0; i < noise.length; i++, p += 4) {
    const col = colorFn(noise[i], i % size, (i / size) | 0);
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Draw fn at (x,y) and at wrapped copies so the canvas tiles seamlessly. */
export function drawWrapped(w, h, x, y, r, fn) {
  for (let ox = -1; ox <= 1; ox++) {
    const xx = x + ox * w;
    if (xx + r < 0 || xx - r > w) continue;
    for (let oy = -1; oy <= 1; oy++) {
      const yy = y + oy * h;
      if (yy + r < 0 || yy - r > h) continue;
      fn(xx, yy);
    }
  }
}

export function canvasTexture(canvas, { srgb = true, repeat = true, anisotropy = 1, mips = true, flipY = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = anisotropy;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.flipY = flipY;
  t.needsUpdate = true;
  return t;
}

/**
 * Alpha (grey) canvas -> texture with a hand-built mip chain whose alpha is rescaled
 * per level so the fraction of texels above `threshold` stays constant
 * (prevents alpha-tested foliage from thinning out with distance).
 */
export function coverageAlphaTexture(canvas, { threshold = 0.5, anisotropy = 1, repeat = false } = {}) {
  const thr = threshold * 255;
  const w0 = canvas.width, h0 = canvas.height;
  const base = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w0, h0).data;
  let cov = 0;
  for (let i = 1; i < base.length; i += 4) if (base[i] > thr) cov++;
  const coverage = cov / (w0 * h0);

  const levels = [canvas];
  let raw = canvas, w = w0, h = h0;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1);
    const rc = makeCanvas(nw, nh);
    const rctx = rc.getContext('2d', { willReadFrequently: true });
    rctx.imageSmoothingEnabled = true;
    rctx.imageSmoothingQuality = 'high';
    rctx.drawImage(raw, 0, 0, nw, nh);
    // scaled copy for upload
    const sc = makeCanvas(nw, nh);
    const sctx = sc.getContext('2d');
    const img = rctx.getImageData(0, 0, nw, nh);
    const d = img.data;
    if (nw * nh >= 4 && coverage > 0) {
      const hist = new Uint32Array(256);
      for (let i = 1; i < d.length; i += 4) hist[d[i]]++;
      const target = coverage * nw * nh;
      let acc = 0, q = 255;
      for (let v = 255; v >= 1; v--) { acc += hist[v]; if (acc >= target) { q = v; break; } }
      const s = q > 0 ? Math.min(4, thr / q) : 1;
      if (s > 1.0001) {
        for (let i = 0; i < d.length; i += 4) {
          const a = Math.min(255, d[i + 1] * s);
          d[i] = d[i + 1] = d[i + 2] = a; d[i + 3] = 255;
        }
      }
    }
    sctx.putImageData(img, 0, 0);
    levels.push(sc);
    raw = rc; w = nw; h = nh;
  }
  const t = new THREE.Texture(canvas);
  t.mipmaps = levels;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// -------------------------------------------------------------- geometry ---
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/**
 * Accumulates triangles (position/normal/uv + optional extra attributes) for merging
 * static geometry per material. Extra attributes are set as "current" values.
 */
export class GeoBuilder {
  constructor(extra = {}) {
    this.P = []; this.N = []; this.U = []; this.I = [];
    this.extraSize = extra;
    this.E = {}; this.cur = {};
    for (const k in extra) {
      this.E[k] = [];
      this.cur[k] = new Array(extra[k]).fill(k === 'color' ? 1 : 0);
    }
  }
  get vcount() { return this.P.length / 3; }
  set(key, a, b = 0, c = 0, d = 0) {
    const arr = this.cur[key];
    if (!arr) return this;
    arr[0] = a; if (arr.length > 1) arr[1] = b; if (arr.length > 2) arr[2] = c; if (arr.length > 3) arr[3] = d;
    return this;
  }
  setColor(col) { return this.set('color', col.r, col.g, col.b); }
  v(px, py, pz, nx, ny, nz, u = 0, w = 0) {
    this.P.push(px, py, pz); this.N.push(nx, ny, nz); this.U.push(u, w);
    for (const k in this.E) { const src = this.cur[k], dst = this.E[k]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
    return this.vcount - 1;
  }
  tri(a, b, c) { this.I.push(a, b, c); }
  /** Quad a-b-c-d; winding auto-corrected so the face agrees with vertex normals. */
  quad(a, b, c, d) {
    const P = this.P, N = this.N;
    _a.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
    _b.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
    _c.crossVectors(_a, _b);
    const nx = N[a * 3] + N[c * 3], ny = N[a * 3 + 1] + N[c * 3 + 1], nz = N[a * 3 + 2] + N[c * 3 + 2];
    if (_c.x * nx + _c.y * ny + _c.z * nz >= 0) this.I.push(a, b, c, a, c, d);
    else this.I.push(a, c, b, a, d, c);
  }
  /** Append a BufferGeometry transformed by matrix. opts.uv(u,v,pos)->[u,v] optional. */
  addGeometry(geo, matrix, opts = {}) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    _nm.getNormalMatrix(matrix);
    const base = this.vcount;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      if (nor) _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize(); else _n.set(0, 1, 0);
      let u = uv ? uv.getX(i) : 0, w = uv ? uv.getY(i) : 0;
      if (opts.uv) { const r = opts.uv(u, w, _v, _n); u = r[0]; w = r[1]; }
      if (opts.perVertex) opts.perVertex(this, _v, _n, i);
      this.v(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, u, w);
    }
    const flip = matrix.determinant() < 0;
    if (geo.index) {
      const idx = geo.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        if (flip) this.I.push(base + idx[i], base + idx[i + 2], base + idx[i + 1]);
        else this.I.push(base + idx[i], base + idx[i + 1], base + idx[i + 2]);
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        if (flip) this.I.push(base + i, base + i + 2, base + i + 1);
        else this.I.push(base + i, base + i + 1, base + i + 2);
      }
    }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    for (const k in this.E) g.setAttribute(k, new THREE.Float32BufferAttribute(this.E[k], this.extraSize[k]));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Sweep a closed 2D cross-section along a polyline with frames.
 * pts: Vector3[]; frames: [{b, n}] per point (section x -> b, section y -> n).
 * section: [[x,y],...] CCW. Hard edges (flat per side). uv: u = along-curve metres, v = around.
 */
export function sweepSection(gb, pts, frames, section, { capStart = false, capEnd = false, uScale = 1 } = {}) {
  const m = section.length;
  // cumulative length
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  let per = 0;
  const secLen = [0];
  for (let j = 0; j < m; j++) {
    const a = section[j], b = section[(j + 1) % m];
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    secLen.push(per);
  }
  for (let j = 0; j < m; j++) {
    const a = section[j], b = section[(j + 1) % m];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const snx = dy / len, sny = -dx / len; // outward normal for CCW
    let prev = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], f = frames[i];
      const nx = f.b.x * snx + f.n.x * sny, ny = f.b.y * snx + f.n.y * sny, nz = f.b.z * snx + f.n.z * sny;
      const i0 = gb.v(p.x + f.b.x * a[0] + f.n.x * a[1], p.y + f.b.y * a[0] + f.n.y * a[1], p.z + f.b.z * a[0] + f.n.z * a[1], nx, ny, nz, L[i] * uScale, secLen[j]);
      const i1 = gb.v(p.x + f.b.x * b[0] + f.n.x * b[1], p.y + f.b.y * b[0] + f.n.y * b[1], p.z + f.b.z * b[0] + f.n.z * b[1], nx, ny, nz, L[i] * uScale, secLen[j + 1]);
      if (i > 0) gb.quad(prev[0], prev[1], i1, i0);
      prev = [i0, i1];
    }
  }
  const cap = (i, sgn) => {
    const p = pts[i], f = frames[i];
    const t = new THREE.Vector3().crossVectors(f.b, f.n).multiplyScalar(sgn);
    const ids = section.map(([x, y]) => gb.v(p.x + f.b.x * x + f.n.x * y, p.y + f.b.y * x + f.n.y * y, p.z + f.b.z * x + f.n.z * y, t.x, t.y, t.z, x, y));
    for (let j = 1; j < m - 1; j++) {
      // orient
      _a.set(gb.P[ids[j] * 3] - gb.P[ids[0] * 3], gb.P[ids[j] * 3 + 1] - gb.P[ids[0] * 3 + 1], gb.P[ids[j] * 3 + 2] - gb.P[ids[0] * 3 + 2]);
      _b.set(gb.P[ids[j + 1] * 3] - gb.P[ids[0] * 3], gb.P[ids[j + 1] * 3 + 1] - gb.P[ids[0] * 3 + 1], gb.P[ids[j + 1] * 3 + 2] - gb.P[ids[0] * 3 + 2]);
      _c.crossVectors(_a, _b);
      if (_c.dot(t) >= 0) gb.tri(ids[0], ids[j], ids[j + 1]); else gb.tri(ids[0], ids[j + 1], ids[j]);
    }
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(pts.length - 1, 1);
}

/** Frames for a curve given a fixed "side" hint vector function: b = side, n = t x b. */
export function framesFromSide(pts, sideFn) {
  const frames = [];
  for (let i = 0; i < pts.length; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === pts.length - 1) t.subVectors(pts[i], pts[i - 1]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    t.normalize();
    const b = sideFn(i, pts[i], t).clone();
    b.addScaledVector(t, -b.dot(t)).normalize();
    const n = new THREE.Vector3().crossVectors(t, b).normalize();
    frames.push({ t, b, n });
  }
  return frames;
}

/** Parallel-transport frames (for tubes whose roll doesn't matter). */
export function transportFrames(pts, up = new THREE.Vector3(0, 0, 1)) {
  const frames = [];
  let prevB = null;
  for (let i = 0; i < pts.length; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === pts.length - 1) t.subVectors(pts[i], pts[i - 1]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    t.normalize();
    let b;
    if (!prevB) {
      b = up.clone();
      if (Math.abs(b.dot(t)) > 0.95) b.set(1, 0, 0);
    } else b = prevB.clone();
    b.addScaledVector(t, -b.dot(t)).normalize();
    const n = new THREE.Vector3().crossVectors(t, b).normalize();
    frames.push({ t, b, n });
    prevB = b;
  }
  return frames;
}

/** Smooth round tube along points with per-point radius. Returns nothing; appends to gb. */
export function tube(gb, pts, radiusFn, { sides = 8, frames = null, uScale = 1, vScale = 1, u0 = 0, u1 = 1, capEnd = false } = {}) {
  const fr = frames || transportFrames(pts);
  let L = 0;
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) L += pts[i].distanceTo(pts[i - 1]);
    const r = radiusFn(i / (pts.length - 1), i);
    const ring = [];
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const f = fr[i];
      const nx = f.b.x * ca + f.n.x * sa, ny = f.b.y * ca + f.n.y * sa, nz = f.b.z * ca + f.n.z * sa;
      ring.push(gb.v(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r, nx, ny, nz,
        u0 + (u1 - u0) * (j / sides), L * vScale));
    }
    rings.push(ring);
  }
  for (let i = 1; i < rings.length; i++) {
    for (let j = 0; j < sides; j++) gb.quad(rings[i - 1][j], rings[i - 1][j + 1], rings[i][j + 1], rings[i][j]);
  }
  if (capEnd) {
    const i = pts.length - 1, f = fr[i];
    const c = gb.v(pts[i].x + f.t.x * radiusFn(1, i) * 0.6, pts[i].y + f.t.y * radiusFn(1, i) * 0.6, pts[i].z + f.t.z * radiusFn(1, i) * 0.6, f.t.x, f.t.y, f.t.z, (u0 + u1) / 2, L * vScale);
    for (let j = 0; j < sides; j++) {
      const a = rings[i][j], b = rings[i][j + 1];
      _a.set(gb.P[a * 3] - gb.P[c * 3], gb.P[a * 3 + 1] - gb.P[c * 3 + 1], gb.P[a * 3 + 2] - gb.P[c * 3 + 2]);
      _b.set(gb.P[b * 3] - gb.P[c * 3], gb.P[b * 3 + 1] - gb.P[c * 3 + 1], gb.P[b * 3 + 2] - gb.P[c * 3 + 2]);
      _c.crossVectors(_a, _b);
      if (_c.dot(f.t) >= 0) gb.tri(c, a, b); else gb.tri(c, b, a);
    }
  }
  return L;
}

/** Evaluate a cubic Bezier in 2D arrays. */
export function bezier2(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Dispose everything under an Object3D (geometries, materials, textures). */
export function disposeTree(root) {
  const mats = new Set(), geos = new Set(), texs = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    if (o.customDepthMaterial) mats.add(o.customDepthMaterial);
  });
  for (const m of mats) {
    for (const k in m) { const v = m[k]; if (v && v.isTexture) texs.add(v); }
    if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k]?.value; if (v && v.isTexture) texs.add(v); }
    m.dispose();
  }
  for (const g of geos) g.dispose();
  for (const t of texs) t.dispose();
}
