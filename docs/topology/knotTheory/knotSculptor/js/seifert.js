// Knot Sculptor: solid-angle Seifert surfaces and the crossing-number globe.
//
// Pure functions with no DOM access, imported by js/seifertWorker.js and by
// tests/seifert.test.mjs.
//
// Knot input everywhere: `components` = array of closed polylines, each a
// Float64Array / Float32Array / plain array of length 3N (x,y,z per point; the
// last point connects back to the first, which is not repeated).
//
// The solid angle Omega(x) subtended by an oriented link is well defined mod 4pi
// and harmonic off the link; each level set Omega = c (mod 4pi) is a Seifert
// surface whose boundary is the link (Binysh & Alexander, "Maxwell's theory of
// solid angle and the construction of knotted fields", 2018).

const TWO_PI = 2 * Math.PI;
const FOUR_PI = 4 * Math.PI;

// Grid jitter and fan-apex offset, in units of the cell size h. They are
// irrational-looking fractions so that neither a symmetry plane of the knot
// (e.g. the plane of a flat circle) nor the fan apex lands exactly on grid points.
const GRID_JITTER = [0.0731, 0.0417, 0.0573];
const APEX_OFFSET = [0.3183, 0.2071, 0.4142];

// ---------------------------------------------------------------------------
// Polyline helpers
// ---------------------------------------------------------------------------

/**
 * Resample a closed polyline to at most `maxCount` points, evenly spaced by arc
 * length along the original polyline. Returns a new Float64Array (3M).
 * Polylines that already have <= maxCount points are copied unchanged.
 */
export function resampleClosed(points, maxCount) {
  const n = Math.floor(points.length / 3);
  if (n <= maxCount) {
    const out = new Float64Array(3 * n);
    for (let i = 0; i < 3 * n; i++) out[i] = points[i];
    return out;
  }
  const m = Math.max(3, maxCount | 0);
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const dx = points[3 * j] - points[3 * i];
    const dy = points[3 * j + 1] - points[3 * i + 1];
    const dz = points[3 * j + 2] - points[3 * i + 2];
    cum[i + 1] = cum[i] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const total = cum[n];
  const out = new Float64Array(3 * m);
  if (!(total > 0)) {
    // Degenerate (all points equal): fall back to sampling by index.
    for (let k = 0; k < m; k++) {
      const i = Math.floor((k * n) / m);
      out[3 * k] = points[3 * i]; out[3 * k + 1] = points[3 * i + 1]; out[3 * k + 2] = points[3 * i + 2];
    }
    return out;
  }
  let seg = 0;
  for (let k = 0; k < m; k++) {
    const s = (total * k) / m;
    while (seg < n - 1 && cum[seg + 1] <= s) seg++;
    const len = cum[seg + 1] - cum[seg];
    const t = len > 0 ? (s - cum[seg]) / len : 0;
    const i = seg, j = seg + 1 === n ? 0 : seg + 1;
    out[3 * k] = points[3 * i] + t * (points[3 * j] - points[3 * i]);
    out[3 * k + 1] = points[3 * i + 1] + t * (points[3 * j + 1] - points[3 * i + 1]);
    out[3 * k + 2] = points[3 * i + 2] + t * (points[3 * j + 2] - points[3 * i + 2]);
  }
  return out;
}

function prepareKnot(components, maxPoints) {
  const out = [];
  for (const c of components || []) {
    if (!c || c.length < 9) continue;
    out.push(resampleClosed(c, maxPoints));
  }
  return out;
}

// ---------------------------------------------------------------------------
// a) Solid-angle grid
// ---------------------------------------------------------------------------

/**
 * Sample the solid angle of the link on a regular grid.
 *
 * @returns {{nx:number, ny:number, nz:number, origin:number[], h:number,
 *            values:Float32Array, knot:Float64Array[], ms:number}}
 *   values[i + nx*(j + ny*k)] = Omega(origin + h*(i,j,k)) reduced to [0, 4pi).
 *   `knot` holds the resampled polylines the field was computed from (marchLevel
 *   uses them for its near-knot mask).
 */
export function solidAngleGrid(components, { res = 48, pad = 0.35, maxPoints = 160 } = {}) {
  const t0 = now();
  const knot = prepareKnot(components, maxPoints);
  if (!knot.length) throw new Error('solidAngleGrid: no component with at least 3 points');

  // Bounding box.
  let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
  for (const c of knot) {
    for (let p = 0; p < c.length; p += 3) {
      const x = c[p], y = c[p + 1], z = c[p + 2];
      if (x < lx) lx = x; if (x > hx) hx = x;
      if (y < ly) ly = y; if (y > hy) hy = y;
      if (z < lz) lz = z; if (z > hz) hz = z;
    }
  }
  const ext = Math.max(hx - lx, hy - ly, hz - lz) || 1e-3;
  const padLen = pad * ext;
  const sx = hx - lx + 2 * padLen, sy = hy - ly + 2 * padLen, sz = hz - lz + 2 * padLen;
  const h = Math.max(sx, sy, sz) / res;
  const nx = Math.ceil(sx / h - 1e-9) + 1;
  const ny = Math.ceil(sy / h - 1e-9) + 1;
  const nz = Math.ceil(sz / h - 1e-9) + 1;
  const ox = 0.5 * (lx + hx) - 0.5 * (nx - 1) * h + GRID_JITTER[0] * h;
  const oy = 0.5 * (ly + hy) - 0.5 * (ny - 1) * h + GRID_JITTER[1] * h;
  const oz = 0.5 * (lz + hz) - 0.5 * (nz - 1) * h + GRID_JITTER[2] * h;

  // Pack the components with the first point repeated at the end, so the
  // inner loop needs no wrap-around branch. One fan apex per component.
  const nc = knot.length;
  const start = new Int32Array(nc + 1);
  let total = 0;
  for (let c = 0; c < nc; c++) { start[c] = total; total += knot[c].length + 3; }
  start[nc] = total;
  const V = new Float64Array(total);
  const AX = new Float64Array(nc), AY = new Float64Array(nc), AZ = new Float64Array(nc);
  for (let c = 0; c < nc; c++) {
    const src = knot[c], s = start[c], n = src.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let p = 0; p < src.length; p += 3) {
      V[s + p] = src[p]; V[s + p + 1] = src[p + 1]; V[s + p + 2] = src[p + 2];
      cx += src[p]; cy += src[p + 1]; cz += src[p + 2];
    }
    V[s + src.length] = src[0]; V[s + src.length + 1] = src[1]; V[s + src.length + 2] = src[2];
    AX[c] = cx / n + APEX_OFFSET[0] * h;
    AY[c] = cy / n + APEX_OFFSET[1] * h;
    AZ[c] = cz / n + APEX_OFFSET[2] * h;
  }

  // Omega/2 = sum_i atan2(num_i, den_i) = arg prod_i (den_i + i num_i), so we
  // multiply complex numbers (renormalizing every 8 factors) and take a single
  // atan2 per grid point. 2*arg is exactly Omega mod 4pi.
  const values = new Float32Array(nx * ny * nz);
  let idx = 0;
  for (let kz = 0; kz < nz; kz++) {
    const z = oz + kz * h;
    for (let jy = 0; jy < ny; jy++) {
      const y = oy + jy * h;
      for (let ix = 0; ix < nx; ix++) {
        const x = ox + ix * h;
        let re = 1, im = 0;
        for (let c = 0; c < nc; c++) {
          const ax = AX[c] - x, ay = AY[c] - y, az = AZ[c] - z;
          const la = Math.sqrt(ax * ax + ay * ay + az * az);
          const s = start[c], e = start[c + 1];
          let bx = V[s] - x, by = V[s + 1] - y, bz = V[s + 2] - z;
          let lb = Math.sqrt(bx * bx + by * by + bz * bz);
          let ab = ax * bx + ay * by + az * bz;
          let cnt = 0;
          for (let p = s + 3; p < e; p += 3) {
            const cx = V[p] - x, cy = V[p + 1] - y, cz = V[p + 2] - z;
            const lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
            const ac = ax * cx + ay * cy + az * cz;
            const num = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
            const den = la * lb * lc + ab * lc + ac * lb + (bx * cx + by * cy + bz * cz) * la;
            const r = re * den - im * num;
            im = re * num + im * den;
            re = r;
            if ((++cnt & 7) === 0) {
              const mag = Math.abs(re) + Math.abs(im);
              if (mag > 0) { re /= mag; im /= mag; }
            }
            bx = cx; by = cy; bz = cz; lb = lc; ab = ac;
          }
          const mag = Math.abs(re) + Math.abs(im);
          if (mag > 0) { re /= mag; im /= mag; }
        }
        let w = 2 * Math.atan2(im, re);
        if (w < 0) w += FOUR_PI;
        values[idx++] = w;
      }
    }
  }
  return { nx, ny, nz, origin: [ox, oy, oz], h, values, knot, ms: now() - t0 };
}

// ---------------------------------------------------------------------------
// b) Marching tetrahedra on the circle-valued field
// ---------------------------------------------------------------------------

// Kuhn (Freudenthal) subdivision: 6 tets sharing the main diagonal 0-7 of the
// cube; corner c has offset bits (c&1, c>>1&1, c>>2&1). Each tet's corners form
// a chain 0 < a < b < 7 under bit inclusion, so every edge goes "upward".
const TETS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];

// TABLE[t*16 + mask] = flat list of corner pairs [lo,hi, lo,hi, ...] in cyclic
// order: 3 edges for a triangle, 4 for a quad. `mask` bit i = local corner i is
// above the level. The cyclic order is oriented so the polygon's normal points
// to the above side (increasing Omega). The orientation is combinatorial, so it
// stays consistent across tets even when a vertex lands exactly on a grid point.
const TABLE = (() => {
  const P = (c) => [c & 1, (c >> 1) & 1, (c >> 2) & 1];
  const mid = (a, b) => { const p = P(a), q = P(b); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]; };
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const centroid = (cs) => { const s = [0, 0, 0]; for (const c of cs) { const p = P(c); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map((v) => v / cs.length); };
  const edge = (a, b) => (a < b ? [a, b] : [b, a]);
  const table = new Array(96);
  for (let t = 0; t < 6; t++) {
    const C = TETS[t];
    for (let mask = 0; mask < 16; mask++) {
      const A = [], B = [];
      for (let i = 0; i < 4; i++) ((mask >> i) & 1 ? A : B).push(C[i]);
      if (!A.length || !B.length) { table[t * 16 + mask] = null; continue; }
      const up = sub(centroid(A), centroid(B));
      let poly;
      if (A.length === 2) {
        poly = [edge(A[0], B[0]), edge(A[0], B[1]), edge(A[1], B[1]), edge(A[1], B[0])];
        const q = poly.map(([a, b]) => mid(a, b));
        if (dot(cross(sub(q[2], q[0]), sub(q[3], q[1])), up) < 0) poly.reverse();
      } else {
        const lone = A.length === 1 ? A[0] : B[0];
        const others = A.length === 1 ? B : A;
        poly = others.map((o) => edge(lone, o));
        const q = poly.map(([a, b]) => mid(a, b));
        if (dot(cross(sub(q[1], q[0]), sub(q[2], q[0])), up) < 0) poly.reverse();
      }
      table[t * 16 + mask] = Int8Array.from(poly.flat());
    }
  }
  return table;
})();

// Per-cube mask: 1 = the cube center lies within r of the (resampled) knot.
function nearKnotCubeMask(grid, knot, r) {
  const { nx, ny, nz, h } = grid;
  const [ox, oy, oz] = grid.origin;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const mask = new Uint8Array(cx * cy * cz);
  const r2 = r * r;
  for (const c of knot) {
    const n = c.length / 3;
    for (let s = 0; s < n; s++) {
      const s2 = s + 1 === n ? 0 : s + 1;
      const px = c[3 * s], py = c[3 * s + 1], pz = c[3 * s + 2];
      const dx = c[3 * s2] - px, dy = c[3 * s2 + 1] - py, dz = c[3 * s2 + 2] - pz;
      const dd = dx * dx + dy * dy + dz * dz;
      const i0 = Math.max(0, Math.ceil((Math.min(px, px + dx) - r - ox) / h - 0.5));
      const i1 = Math.min(cx - 1, Math.floor((Math.max(px, px + dx) + r - ox) / h - 0.5));
      const j0 = Math.max(0, Math.ceil((Math.min(py, py + dy) - r - oy) / h - 0.5));
      const j1 = Math.min(cy - 1, Math.floor((Math.max(py, py + dy) + r - oy) / h - 0.5));
      const k0 = Math.max(0, Math.ceil((Math.min(pz, pz + dz) - r - oz) / h - 0.5));
      const k1 = Math.min(cz - 1, Math.floor((Math.max(pz, pz + dz) + r - oz) / h - 0.5));
      for (let k = k0; k <= k1; k++) {
        const qz = oz + (k + 0.5) * h - pz;
        for (let j = j0; j <= j1; j++) {
          const qy = oy + (j + 0.5) * h - py;
          for (let i = i0; i <= i1; i++) {
            const qx = ox + (i + 0.5) * h - px;
            let t = dd > 0 ? (qx * dx + qy * dy + qz * dz) / dd : 0;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            const ex = qx - t * dx, ey = qy - t * dy, ez = qz - t * dz;
            if (ex * ex + ey * ey + ez * ez < r2) mask[i + cx * (j + cy * k)] = 1;
          }
        }
      }
    }
  }
  return mask;
}

/**
 * Extract the level set Omega = level (mod 4pi) as an indexed triangle mesh.
 *
 * @param grid        result of solidAngleGrid
 * @param components  the link (only used if grid.knot is absent; the grid's own
 *                    resampled polyline is preferred so the mask matches the field)
 * @param level       any real; reduced mod 4pi. 2pi is the "spanning disk" level;
 *                    levels near 0 mod 4pi reach the grid boundary (Omega -> 0 at infinity).
 * @param options     skipRadiusCells: cubes whose center is within
 *                      skipRadiusCells * 1.2 * h of the knot are skipped (the knot
 *                      tube hides the ragged edge).
 *                    smooth: tangential relaxation passes (default 2, 0 = off).
 *                    minPieceFraction: drop connected pieces with fewer triangles
 *                      than this fraction of the total (default 0.01).
 *                    attachCells: boundary vertices within 3h of the knot are
 *                      pulled radially to this many cells from it (default 0.5,
 *                      inside a 1.2h tube; 0 = leave the raw ragged edge).
 * @returns {{positions:Float32Array, normals:Float32Array, indices:Uint32Array}}
 *   Triangles are wound counterclockwise (right-hand rule) around the normal that
 *   points toward increasing Omega; vertex normals agree with that orientation.
 */
export function marchLevel(grid, components, level = TWO_PI, { skipRadiusCells = 1.0, smooth = 2, minPieceFraction = 0.01, attachCells = 0.5 } = {}) {
  const { nx, ny, nz, h, values } = grid;
  const [ox, oy, oz] = grid.origin;
  const nxy = nx * ny;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const knot = grid.knot || prepareKnot(components, 160);

  // Near-knot mask (cached on the grid per radius).
  const r = skipRadiusCells * h * 1.2;
  let mask;
  if (grid._skip && grid._skip.r === r) mask = grid._skip.mask;
  else { mask = nearKnotCubeMask(grid, knot, r); grid._skip = { r, mask }; }

  // Edge -> vertex id table: key = (lower grid index)*7 + (direction code).
  const nKeys = nxy * nz * 7;
  let edgeVert = grid._edgeVert;
  if (!edgeVert || edgeVert.length !== nKeys) edgeVert = grid._edgeVert = new Int32Array(nKeys);
  edgeVert.fill(-1);

  const offs = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const u = new Float64Array(8);
  const maxSpread = 1.5 * Math.PI;
  let lev = level % FOUR_PI;
  if (lev < 0) lev += FOUR_PI;

  let pos = new Float64Array(3 * 4096);
  let nv = 0;
  let tris = new Int32Array(3 * 8192);
  let nt = 0;
  let i = 0, j = 0, k = 0, g0 = 0, L = 0;

  const vid = (lo, hi) => {
    const key = (g0 + offs[lo]) * 7 + (hi - lo - 1);
    let id = edgeVert[key];
    if (id < 0) {
      const ul = u[lo], uh = u[hi];
      const t = (L - ul) / (uh - ul);
      const lx = lo & 1, ly = (lo >> 1) & 1, lz = (lo >> 2) & 1;
      const hx = hi & 1, hy = (hi >> 1) & 1, hz = (hi >> 2) & 1;
      if (3 * nv + 3 > pos.length) { const p2 = new Float64Array(pos.length * 2); p2.set(pos); pos = p2; }
      pos[3 * nv] = ox + (i + lx + t * (hx - lx)) * h;
      pos[3 * nv + 1] = oy + (j + ly + t * (hy - ly)) * h;
      pos[3 * nv + 2] = oz + (k + lz + t * (hz - lz)) * h;
      id = nv++;
      edgeVert[key] = id;
    }
    return id;
  };
  const pushTri = (a, b, c) => {
    if (3 * nt + 3 > tris.length) { const t2 = new Int32Array(tris.length * 2); t2.set(tris); tris = t2; }
    tris[3 * nt] = a; tris[3 * nt + 1] = b; tris[3 * nt + 2] = c;
    nt++;
  };
  const d2 = (a, b) => {
    const dx = pos[3 * a] - pos[3 * b], dy = pos[3 * a + 1] - pos[3 * b + 1], dz = pos[3 * a + 2] - pos[3 * b + 2];
    return dx * dx + dy * dy + dz * dz;
  };

  for (k = 0; k < cz; k++) {
    for (j = 0; j < cy; j++) {
      for (i = 0; i < cx; i++) {
        if (mask[i + cx * (j + cy * k)]) continue;
        g0 = i + nx * (j + ny * k);
        const v0 = values[g0];
        let mn = v0, mx = v0;
        u[0] = v0;
        for (let c = 1; c < 8; c++) {
          let d = values[g0 + offs[c]] - v0;
          if (d > TWO_PI) d -= FOUR_PI; else if (d <= -TWO_PI) d += FOUR_PI;
          const w = v0 + d;
          u[c] = w;
          if (w < mn) mn = w; else if (w > mx) mx = w;
        }
        if (mx - mn > maxSpread) continue;
        L = lev + FOUR_PI * Math.ceil((mn - lev) / FOUR_PI);
        if (L >= mx) continue;
        for (let t = 0; t < 6; t++) {
          const C = TETS[t];
          const m = (u[C[0]] > L ? 1 : 0) | (u[C[1]] > L ? 2 : 0) | (u[C[2]] > L ? 4 : 0) | (u[C[3]] > L ? 8 : 0);
          if (m === 0 || m === 15) continue;
          const e = TABLE[t * 16 + m];
          if (e.length === 6) {
            pushTri(vid(e[0], e[1]), vid(e[2], e[3]), vid(e[4], e[5]));
          } else {
            const q0 = vid(e[0], e[1]), q1 = vid(e[2], e[3]), q2 = vid(e[4], e[5]), q3 = vid(e[6], e[7]);
            if (d2(q0, q2) <= d2(q1, q3)) { pushTri(q0, q1, q2); pushTri(q0, q2, q3); }
            else { pushTri(q1, q2, q3); pushTri(q1, q3, q0); }
          }
        }
      }
    }
  }

  let mesh = { pos: pos.subarray(0, 3 * nv), nv, tris: tris.subarray(0, 3 * nt), nt };
  mesh = splitPinchedVertices(mesh);
  mesh = fillSmallHoles(mesh, 16, 6 * h);
  mesh = dropSmallPieces(mesh, minPieceFraction);
  // Three sweeps: a pull blocked by the fold guard often goes through once its
  // boundary neighbors have moved (one sweep leaves ~8% of the edge outside the
  // tube, three leave ~0.3%).
  if (attachCells > 0) for (let pass = 0; pass < 3; pass++) attachBoundary(mesh, knot, attachCells * h, 3 * h);
  let normals = vertexNormals(mesh);
  if (smooth > 0 && mesh.nt) {
    relaxTangential(mesh, normals, smooth);
    normals = vertexNormals(mesh);
  }
  return {
    positions: Float32Array.from(mesh.pos),
    normals,
    indices: Uint32Array.from(mesh.tris),
  };
}

// --- mesh post-processing ---------------------------------------------------

function incidence(nv, tris, nt) {
  const start = new Int32Array(nv + 1);
  for (let a = 0; a < 3 * nt; a++) start[tris[a] + 1]++;
  for (let v = 0; v < nv; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nv);
  const list = new Int32Array(3 * nt);
  for (let f = 0; f < nt; f++) {
    list[fill[tris[3 * f]]++] = f;
    list[fill[tris[3 * f + 1]]++] = f;
    list[fill[tris[3 * f + 2]]++] = f;
  }
  return { start, list };
}

// A vertex whose incident triangles fall into several edge-connected fans (this
// happens where the skipped near-knot region pinches the boundary) is split into
// one copy per fan, so the mesh is a manifold with boundary.
function splitPinchedVertices(mesh) {
  const { tris, nt } = mesh;
  let { pos, nv } = mesh;
  const nv0 = nv;
  const { start, list } = incidence(nv0, tris, nt);
  const parent = new Int32Array(64), copyOf = new Int32Array(64);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const extra = [];
  for (let v = 0; v < nv0; v++) {
    const s = start[v], d = start[v + 1] - s;
    if (d < 2 || d > 64) continue;
    for (let a = 0; a < d; a++) parent[a] = a;
    for (let a = 0; a < d; a++) {
      const fa = list[s + a];
      for (let b = a + 1; b < d; b++) {
        const fb = list[s + b];
        // Do fa and fb share a vertex other than v (i.e. an edge at v)?
        let shared = false;
        for (let x = 0; x < 3 && !shared; x++) {
          const w = tris[3 * fa + x];
          if (w === v) continue;
          if (tris[3 * fb] === w || tris[3 * fb + 1] === w || tris[3 * fb + 2] === w) shared = true;
        }
        if (shared) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
      }
    }
    const root0 = find(0);
    for (let a = 0; a < d; a++) copyOf[a] = -1;
    for (let a = 1; a < d; a++) {
      const ra = find(a);
      if (ra === root0) continue;
      let nvId = copyOf[ra];
      if (nvId < 0) { nvId = copyOf[ra] = nv++; extra.push(v); }
      const f = list[s + a];
      for (let x = 0; x < 3; x++) if (tris[3 * f + x] === v) tris[3 * f + x] = nvId;
    }
  }
  if (extra.length) {
    const p2 = new Float64Array(3 * nv);
    p2.set(pos);
    for (let e = 0; e < extra.length; e++) {
      const v = extra[e], w = nv0 + e;
      p2[3 * w] = pos[3 * v]; p2[3 * w + 1] = pos[3 * v + 1]; p2[3 * w + 2] = pos[3 * v + 2];
    }
    pos = p2;
  }
  return { pos, nv, tris, nt };
}

// Directed boundary edges: bnext[v] = w when v->w is an edge of some triangle
// whose reverse w->v is in no triangle (-1 if v is interior). After
// splitPinchedVertices each boundary vertex has exactly one outgoing edge.
function boundaryNext(nv, tris, nt, inc = incidence(nv, tris, nt)) {
  const { start, list } = inc;
  const bnext = new Int32Array(nv).fill(-1);
  for (let v = 0; v < nv; v++) {
    const s = start[v], e = start[v + 1];
    for (let a = s; a < e; a++) {
      const f = list[a];
      const x = tris[3 * f] === v ? 0 : tris[3 * f + 1] === v ? 1 : 2;
      const w = tris[3 * f + (x + 1) % 3];
      let reversed = false;
      for (let b = s; b < e && !reversed; b++) {
        const g = list[b];
        const y = tris[3 * g] === v ? 0 : tris[3 * g + 1] === v ? 1 : 2;
        if (tris[3 * g + (y + 2) % 3] === w) reversed = true;
      }
      if (!reversed) bnext[v] = w;
    }
  }
  return bnext;
}

// Close tiny boundary loops (at most maxVerts vertices and maxPerimeter long).
// They are pinholes where the level set grazes a protruding cube of the skipped
// near-knot region; a knot component's own boundary loop is always far longer.
function fillSmallHoles(mesh, maxVerts, maxPerimeter) {
  const { pos, nv, nt } = mesh;
  let tris = mesh.tris;
  const bnext = boundaryNext(nv, tris, nt);
  const visited = new Uint8Array(nv);
  const added = [];
  const loop = [];
  for (let v0 = 0; v0 < nv; v0++) {
    if (bnext[v0] < 0 || visited[v0]) continue;
    loop.length = 0;
    let v = v0, perimeter = 0, closed = false;
    while (v >= 0 && !visited[v]) {
      visited[v] = 1;
      loop.push(v);
      const w = bnext[v];
      if (w >= 0) perimeter += Math.hypot(pos[3 * w] - pos[3 * v], pos[3 * w + 1] - pos[3 * v + 1], pos[3 * w + 2] - pos[3 * v + 2]);
      if (w === v0) { closed = true; break; }
      v = w;
    }
    if (!closed || loop.length < 3 || loop.length > maxVerts || perimeter > maxPerimeter) continue;
    // The loop runs along triangle edges v_i -> v_{i+1}; the patch must use the
    // reverse direction, so fan from v_0 as (v_0, v_{i+1}, v_i).
    for (let i = 1; i + 1 < loop.length; i++) added.push(loop[0], loop[i + 1], loop[i]);
  }
  if (!added.length) return mesh;
  const t2 = new Int32Array(3 * nt + added.length);
  t2.set(tris.subarray(0, 3 * nt));
  t2.set(added, 3 * nt);
  tris = t2;
  return { pos, nv, tris, nt: nt + added.length / 3 };
}

// The skipped near-knot cubes leave the boundary 0.5-2 cells from the knot,
// so it would peek out of the tube in notches. Near the knot the level set is
// close to a half-plane ruled by the radial segments to the knot, so sliding a
// boundary vertex radially toward its nearest knot point keeps it on the
// surface; we stop at distance `target` (inside the tube). Vertices farther than
// `maxDist` (the grid-box boundary of levels near 0) are left alone.
function attachBoundary(mesh, knot, target, maxDist) {
  const { pos, nv, tris, nt } = mesh;
  if (!nt) return;
  const inc = incidence(nv, tris, nt);
  const { start, list } = inc;
  const bnext = boundaryNext(nv, tris, nt, inc);
  const MAXDEG = 64;
  const old = new Float64Array(3 * MAXDEG), cur = new Float64Array(3);
  for (let v = 0; v < nv; v++) {
    if (bnext[v] < 0 || start[v + 1] - start[v] > MAXDEG) continue;
    const px = pos[3 * v], py = pos[3 * v + 1], pz = pos[3 * v + 2];
    let best = Infinity, qx = 0, qy = 0, qz = 0;
    for (const c of knot) {
      const n = c.length / 3;
      for (let s = 0; s < n; s++) {
        const s2 = s + 1 === n ? 0 : s + 1;
        const ax = c[3 * s], ay = c[3 * s + 1], az = c[3 * s + 2];
        const dx = c[3 * s2] - ax, dy = c[3 * s2 + 1] - ay, dz = c[3 * s2 + 2] - az;
        const dd = dx * dx + dy * dy + dz * dz;
        let t = dd > 0 ? ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / dd : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const cx = ax + t * dx, cy = ay + t * dy, cz = az + t * dz;
        const d2 = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2;
        if (d2 < best) { best = d2; qx = cx; qy = cy; qz = cz; }
      }
    }
    const d = Math.sqrt(best);
    if (d <= target || d > maxDist) continue;
    // Fold guard: take the full pull, else half, else a quarter, else nothing,
    // so that no incident triangle turns over.
    for (let a = start[v]; a < start[v + 1]; a++) faceNormalInto(pos, tris, list[a], old, 3 * (a - start[v]));
    const fx = qx + (px - qx) * (target / d) - px, fy = qy + (py - qy) * (target / d) - py, fz = qz + (pz - qz) * (target / d) - pz;
    let moved = false;
    for (let step = 1; step >= 0.25 && !moved; step *= 0.5) {
      pos[3 * v] = px + step * fx; pos[3 * v + 1] = py + step * fy; pos[3 * v + 2] = pz + step * fz;
      moved = true;
      for (let a = start[v]; a < start[v + 1] && moved; a++) {
        faceNormalInto(pos, tris, list[a], cur, 0);
        const o = 3 * (a - start[v]);
        if (cur[0] * old[o] + cur[1] * old[o + 1] + cur[2] * old[o + 2] <= 0) moved = false;
      }
    }
    if (!moved) { pos[3 * v] = px; pos[3 * v + 1] = py; pos[3 * v + 2] = pz; }
  }
}

// Unnormalized normal (b-a)x(c-a) of triangle f, written to out[o..o+2].
function faceNormalInto(pos, tris, f, out, o) {
  const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
  const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
  const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
  out[o] = uy * vz - uz * vy; out[o + 1] = uz * vx - ux * vz; out[o + 2] = ux * vy - uy * vx;
}

// Remove connected pieces with fewer than `fraction` of all triangles, and
// compact the vertex array.
function dropSmallPieces(mesh, fraction) {
  const { pos, nv, tris, nt } = mesh;
  if (!nt) return mesh;
  const parent = new Int32Array(nv);
  for (let v = 0; v < nv; v++) parent[v] = v;
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let f = 0; f < nt; f++) { unite(tris[3 * f], tris[3 * f + 1]); unite(tris[3 * f], tris[3 * f + 2]); }
  const count = new Int32Array(nv);
  for (let f = 0; f < nt; f++) count[find(tris[3 * f])]++;
  const minTris = fraction * nt;
  const remap = new Int32Array(nv).fill(-1);
  const outTris = new Int32Array(3 * nt);
  let n2 = 0, m2 = 0;
  for (let f = 0; f < nt; f++) {
    if (count[find(tris[3 * f])] < minTris) continue;
    for (let x = 0; x < 3; x++) {
      const v = tris[3 * f + x];
      if (remap[v] < 0) remap[v] = n2++;
      outTris[3 * m2 + x] = remap[v];
    }
    m2++;
  }
  const outPos = new Float64Array(3 * n2);
  for (let v = 0; v < nv; v++) {
    const w = remap[v];
    if (w >= 0) { outPos[3 * w] = pos[3 * v]; outPos[3 * w + 1] = pos[3 * v + 1]; outPos[3 * w + 2] = pos[3 * v + 2]; }
  }
  return { pos: outPos, nv: n2, tris: outTris.subarray(0, 3 * m2), nt: m2 };
}

// Area-weighted vertex normals (unnormalized face cross products), normalized.
function vertexNormals(mesh) {
  const { pos, nv, tris, nt } = mesh;
  const acc = new Float64Array(3 * nv);
  for (let f = 0; f < nt; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const ux = pos[3 * b] - pos[3 * a], uy = pos[3 * b + 1] - pos[3 * a + 1], uz = pos[3 * b + 2] - pos[3 * a + 2];
    const vx = pos[3 * c] - pos[3 * a], vy = pos[3 * c + 1] - pos[3 * a + 1], vz = pos[3 * c + 2] - pos[3 * a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    acc[3 * a] += fx; acc[3 * a + 1] += fy; acc[3 * a + 2] += fz;
    acc[3 * b] += fx; acc[3 * b + 1] += fy; acc[3 * b + 2] += fz;
    acc[3 * c] += fx; acc[3 * c + 1] += fy; acc[3 * c + 2] += fz;
  }
  const out = new Float32Array(3 * nv);
  for (let v = 0; v < nv; v++) {
    const x = acc[3 * v], y = acc[3 * v + 1], z = acc[3 * v + 2];
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 0) { out[3 * v] = x / l; out[3 * v + 1] = y / l; out[3 * v + 2] = z / l; }
    else out[3 * v + 2] = 1;
  }
  return out;
}

// Tangential relaxation: move each interior vertex toward the average of its
// neighbors, but only within its tangent plane. This evens out the slivers that
// marching tetrahedra produces without moving the surface off the level set or
// pulling the boundary away from the knot (boundary vertices stay fixed).
// Gauss-Seidel order with a fold guard: a move (or its half) that would flip an
// incident triangle is not made.
function relaxTangential(mesh, normals, iterations, lambda = 0.5) {
  const { pos, nv, tris, nt } = mesh;
  const { start, list } = incidence(nv, tris, nt);
  // Boundary vertices: some neighbor appears in exactly one incident triangle.
  const boundary = new Uint8Array(nv);
  const seen = new Map();
  for (let v = 0; v < nv; v++) {
    seen.clear();
    for (let a = start[v]; a < start[v + 1]; a++) {
      const f = list[a];
      for (let x = 0; x < 3; x++) {
        const w = tris[3 * f + x];
        if (w !== v) seen.set(w, (seen.get(w) || 0) + 1);
      }
    }
    for (const c of seen.values()) if (c !== 2) { boundary[v] = 1; break; }
  }
  const MAXDEG = 64;
  const old = new Float64Array(3 * MAXDEG);
  const faceNormal = (f, out, o) => faceNormalInto(pos, tris, f, out, o);
  const cur = new Float64Array(3);
  for (let it = 0; it < iterations; it++) {
    for (let v = 0; v < nv; v++) {
      if (boundary[v]) continue;
      const s = start[v], e = start[v + 1];
      if (e === s || e - s > MAXDEG) continue;
      // Each neighbor of an interior vertex appears in exactly two incident
      // triangles, so averaging over triangle corners is the neighbor average.
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let a = s; a < e; a++) {
        const f = list[a];
        for (let x = 0; x < 3; x++) {
          const w = tris[3 * f + x];
          if (w === v) continue;
          sx += pos[3 * w]; sy += pos[3 * w + 1]; sz += pos[3 * w + 2]; n++;
        }
      }
      let dx = sx / n - pos[3 * v], dy = sy / n - pos[3 * v + 1], dz = sz / n - pos[3 * v + 2];
      const nx = normals[3 * v], ny = normals[3 * v + 1], nz = normals[3 * v + 2];
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      for (let a = s; a < e; a++) faceNormal(list[a], old, 3 * (a - s));
      const px = pos[3 * v], py = pos[3 * v + 1], pz = pos[3 * v + 2];
      let step = lambda;
      for (let attempt = 0; attempt < 2; attempt++, step *= 0.5) {
        pos[3 * v] = px + step * dx; pos[3 * v + 1] = py + step * dy; pos[3 * v + 2] = pz + step * dz;
        let ok = true;
        for (let a = s; a < e && ok; a++) {
          faceNormal(list[a], cur, 0);
          const o = 3 * (a - s);
          const withOld = cur[0] * old[o] + cur[1] * old[o + 1] + cur[2] * old[o + 2];
          const oldUp = old[o] * nx + old[o + 1] * ny + old[o + 2] * nz;
          const newUp = cur[0] * nx + cur[1] * ny + cur[2] * nz;
          if (withOld <= 0 || (oldUp > 0 && newUp <= 0)) ok = false;
        }
        if (ok) break;
        pos[3 * v] = px; pos[3 * v + 1] = py; pos[3 * v + 2] = pz;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// c) Crossing-number globe
// ---------------------------------------------------------------------------

// Builds a reusable crossing counter for one link: count(dx,dy,dz) projects the
// polygon orthogonally onto the plane perpendicular to the unit vector d and
// counts pairs of non-adjacent segments whose projections cross. Segments are
// sorted by x-extent and swept, so a direction costs O(S log S + candidates).
// A projection where two non-adjacent segments touch or overlap (within a
// relative 1e-11 tolerance) is flagged degenerate.
function crossingCounter(knot) {
  let np = 0;
  for (const c of knot) np += c.length / 3;
  const P = new Float64Array(3 * np);
  const segA = new Int32Array(np), segB = new Int32Array(np);
  const nextSeg = new Int32Array(np), prevSeg = new Int32Array(np);
  let base = 0;
  let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity;
  for (const c of knot) {
    const n = c.length / 3;
    P.set(c, 3 * base);
    for (let s = 0; s < n; s++) {
      const a = base + s;
      segA[a] = a; segB[a] = base + (s + 1) % n;
      nextSeg[a] = base + (s + 1) % n;
      prevSeg[a] = base + (s - 1 + n) % n;
      const x = c[3 * s], y = c[3 * s + 1], z = c[3 * s + 2];
      if (x < lx) lx = x; if (x > hx) hx = x;
      if (y < ly) ly = y; if (y > hy) hy = y;
      if (z < lz) lz = z; if (z > hz) hz = z;
    }
    base += n;
  }
  const S = np;
  const diag2 = (hx - lx) ** 2 + (hy - ly) ** 2 + (hz - lz) ** 2;
  const eps = 1e-11 * diag2;
  const X = new Float64Array(np), Y = new Float64Array(np);
  const xmin = new Float64Array(S), xmax = new Float64Array(S), ymin = new Float64Array(S), ymax = new Float64Array(S);
  const order = new Int32Array(S);
  const cmp = (a, b) => xmin[a] - xmin[b];
  const sgn = (o) => (o > eps ? 1 : o < -eps ? -1 : 0);
  const result = { count: 0, degenerate: false };

  function count(dx, dy, dz) {
    // Orthonormal basis (e1, e2) of the plane perpendicular to d.
    let ux = 0, uy = 0, uz = 1;
    if (Math.abs(dz) > 0.9) { ux = 1; uz = 0; }
    let e1x = uy * dz - uz * dy, e1y = uz * dx - ux * dz, e1z = ux * dy - uy * dx;
    const l1 = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
    e1x /= l1; e1y /= l1; e1z /= l1;
    const e2x = dy * e1z - dz * e1y, e2y = dz * e1x - dx * e1z, e2z = dx * e1y - dy * e1x;
    for (let p = 0; p < np; p++) {
      const x = P[3 * p], y = P[3 * p + 1], z = P[3 * p + 2];
      X[p] = x * e1x + y * e1y + z * e1z;
      Y[p] = x * e2x + y * e2y + z * e2z;
    }
    for (let s = 0; s < S; s++) {
      const a = segA[s], b = segB[s];
      if (X[a] < X[b]) { xmin[s] = X[a]; xmax[s] = X[b]; } else { xmin[s] = X[b]; xmax[s] = X[a]; }
      if (Y[a] < Y[b]) { ymin[s] = Y[a]; ymax[s] = Y[b]; } else { ymin[s] = Y[b]; ymax[s] = Y[a]; }
      order[s] = s;
    }
    order.sort(cmp);
    let crossings = 0, degenerate = false;
    for (let oa = 0; oa < S; oa++) {
      const s = order[oa];
      const sxMax = xmax[s], syMin = ymin[s], syMax = ymax[s];
      const ax = X[segA[s]], ay = Y[segA[s]], bx = X[segB[s]], by = Y[segB[s]];
      const vx = bx - ax, vy = by - ay;
      for (let ob = oa + 1; ob < S; ob++) {
        const t = order[ob];
        if (xmin[t] > sxMax) break;
        if (ymin[t] > syMax || ymax[t] < syMin) continue;
        if (t === nextSeg[s] || t === prevSeg[s]) continue;
        const cx = X[segA[t]], cy = Y[segA[t]], ex = X[segB[t]], ey = Y[segB[t]];
        const s1 = sgn(vx * (cy - ay) - vy * (cx - ax));
        const s2 = sgn(vx * (ey - ay) - vy * (ex - ax));
        if (s1 * s2 > 0) continue;
        const wx = ex - cx, wy = ey - cy;
        const s3 = sgn(wx * (ay - cy) - wy * (ax - cx));
        const s4 = sgn(wx * (by - cy) - wy * (bx - cx));
        if (s3 * s4 > 0) continue;
        if (s1 === 0 || s2 === 0 || s3 === 0 || s4 === 0) degenerate = true;
        else crossings++;
      }
    }
    result.count = crossings;
    result.degenerate = degenerate;
    return result;
  }
  return count;
}

/**
 * Count projection crossings over Fibonacci directions on the upper hemisphere
 * (z > 0; d and -d give the same diagram up to mirror, so consumers mirror).
 * The lattice is rotated by an irrational azimuth so no direction lies exactly
 * in a coordinate plane (a flat curve in such a plane would project to a
 * segment); a direction whose projection is still degenerate is recounted at a
 * direction 1e-3 rad away.
 *
 * @returns {{dirs:Float32Array, counts:Uint16Array, best:number[], min:number,
 *            max:number, ms:number}}
 *   `best` is a min-count direction chosen to be robust and readable: it
 *   maximizes (angular clearance to the nearest direction with more crossings,
 *   with d ~ -d) x (0.3 + 0.7 openness), where openness = min over components of
 *   |cos| between d and the component's vector area, so no component that
 *   bounds a clear area is seen edge-on. When every direction ties, openness alone.
 */
export function crossingGlobe(components, { count = 1500, maxPoints = 100 } = {}) {
  const t0 = now();
  const knot = prepareKnot(components, maxPoints);
  const counter = crossingCounter(knot);
  // Unit vector areas of the components (A = 1/2 sum p_i x p_{i+1}; the
  // projected shoelace area along d is d.A). Components whose vector area is
  // small next to their length^2 (no clear "face") are ignored.
  const faces = [];
  for (const c of knot) {
    const n = c.length / 3;
    let Ax = 0, Ay = 0, Az = 0, len = 0;
    for (let s = 0; s < n; s++) {
      const q = (s + 1) % n;
      const px = c[3 * s], py = c[3 * s + 1], pz = c[3 * s + 2];
      const qx = c[3 * q], qy = c[3 * q + 1], qz = c[3 * q + 2];
      Ax += 0.5 * (py * qz - pz * qy); Ay += 0.5 * (pz * qx - px * qz); Az += 0.5 * (px * qy - py * qx);
      len += Math.hypot(qx - px, qy - py, qz - pz);
    }
    const a = Math.hypot(Ax, Ay, Az);
    if (a > 0.01 * len * len) faces.push([Ax / a, Ay / a, Az / a]);
  }
  const openness = (x, y, z) => {
    let o = 1;
    for (const f of faces) o = Math.min(o, Math.abs(x * f[0] + y * f[1] + z * f[2]));
    return o;
  };

  const M = Math.max(1, count | 0);
  const dirs = new Float32Array(3 * M);
  const counts = new Uint16Array(M);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phi0 = 0.5 * golden; // irrational azimuth offset
  let min = Infinity, max = -Infinity;

  for (let di = 0; di < M; di++) {
    const dz = 1 - (di + 0.5) / M;
    const rr = Math.sqrt(Math.max(0, 1 - dz * dz));
    const phi = phi0 + di * golden;
    const dx = rr * Math.cos(phi), dy = rr * Math.sin(phi);
    dirs[3 * di] = dx; dirs[3 * di + 1] = dy; dirs[3 * di + 2] = dz;
    let r = counter(dx, dy, dz);
    for (let attempt = 1; r.degenerate && attempt <= 4; attempt++) {
      // Nudge d by 1e-3 rad in a few different tangent directions.
      const a = attempt * 2.0;
      let tx = -dy, ty = dx, tz = 0;
      if (rr < 1e-6) { tx = 1; ty = 0; }
      const tl = Math.hypot(tx, ty, tz);
      tx /= tl; ty /= tl;
      const bx = dy * tz - dz * ty, by = dz * tx - dx * tz, bz = dx * ty - dy * tx;
      const ex = dx + 1e-3 * (Math.cos(a) * tx + Math.sin(a) * bx);
      const ey = dy + 1e-3 * (Math.cos(a) * ty + Math.sin(a) * by);
      const ez = dz + 1e-3 * (Math.cos(a) * tz + Math.sin(a) * bz);
      const el = Math.hypot(ex, ey, ez);
      r = counter(ex / el, ey / el, ez / el);
    }
    const c = Math.min(r.count, 65535);
    counts[di] = c;
    if (c < min) min = c;
    if (c > max) max = c;
  }

  // Choose `best` among the min-count directions (see the doc comment).
  let best = 0, bestScore = -Infinity;
  const otherIdx = [];
  for (let di = 0; di < M; di++) if (counts[di] !== min) otherIdx.push(di);
  for (let a = 0; a < M; a++) {
    if (counts[a] !== min) continue;
    const ax = dirs[3 * a], ay = dirs[3 * a + 1], az = dirs[3 * a + 2];
    let clearance = 1;
    if (otherIdx.length) {
      let near = 0;
      for (const b of otherIdx) {
        const c = Math.abs(ax * dirs[3 * b] + ay * dirs[3 * b + 1] + az * dirs[3 * b + 2]);
        if (c > near) near = c;
      }
      clearance = Math.acos(Math.min(1, near));
    }
    const score = clearance * (0.3 + 0.7 * openness(ax, ay, az));
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return {
    dirs,
    counts,
    best: [dirs[3 * best], dirs[3 * best + 1], dirs[3 * best + 2]],
    min: M ? min : 0,
    max: M ? max : 0,
    ms: now() - t0,
  };
}

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}
