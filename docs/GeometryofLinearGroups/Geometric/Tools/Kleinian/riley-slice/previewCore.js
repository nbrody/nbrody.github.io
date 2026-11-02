/* previewCore.js -- the limit set of the Riley group behind the hover preview.

   Gamma_rho = < X, Y >,  X = (1 1; 0 1),  Y = (1 0; rho 1).

   The limit set is X-periodic, so it is drawn as the translates of the piece
   L0 cut out by the reduced words that START with Y or Y^-1 (together with
   the point at infinity).  Each such word W is one node of a depth-first
   search over the free group (Indra's Pearls, ch. 7): the limit points
   below W are the images under W of the limit points of the words that may
   follow its last letter k, and three of them stand in for the lot --
       fix of g[k+1] g[k+2] g[k+3] g[k],   fix of g[k],   fix of g[k-1] g[k-2] g[k-3] g[k]
   (the leftmost, the middle and the rightmost infinite continuation; the
   generators are cyclically ordered X, Y, X^-1, Y^-1 and the inverse of g[k]
   is g[k+2]).  A branch stops once the three images lie within eps of each
   other, and its points are plotted.

   Right multiplication by a generator is a column operation, so a node costs
   a few multiply-adds and three Moebius evaluations.  Points are kept in
   homogeneous coordinates (u : v) so that infinity, the fixed point of X,
   needs no special case.

   On the exterior of the Riley slice the group is free and every word is a
   different element.  At the discrete but non-free parameters inside (knot
   and Heckoid groups at the dots and beads) an element has many words, and a
   relator traced around and around never shrinks; there the search keys each
   (element, last letter) and skips repeats, and a depth cap backs it up.    */

function previewCoreFactory() {
  "use strict";

  /* ---- complex 2x2 matrices as flat [ar, ai, br, bi, cr, ci, dr, di] ---- */
  function gen(k, rr, ri) {
    switch (k) {
      case 0: return [1, 0, 1, 0, 0, 0, 1, 0];          // X
      case 1: return [1, 0, 0, 0, rr, ri, 1, 0];        // Y
      case 2: return [1, 0, -1, 0, 0, 0, 1, 0];         // X^-1
      default: return [1, 0, 0, 0, -rr, -ri, 1, 0];     // Y^-1
    }
  }
  function mul(M, N) {
    const cm = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
    const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
    const a = add(cm(M[0], M[1], N[0], N[1]), cm(M[2], M[3], N[4], N[5]));
    const b = add(cm(M[0], M[1], N[2], N[3]), cm(M[2], M[3], N[6], N[7]));
    const c = add(cm(M[4], M[5], N[0], N[1]), cm(M[6], M[7], N[4], N[5]));
    const d = add(cm(M[4], M[5], N[2], N[3]), cm(M[6], M[7], N[6], N[7]));
    return [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]];
  }
  function csqrt(x, y) {
    const r = Math.hypot(x, y);
    const wr = Math.sqrt(Math.max((r + x) / 2, 0));
    let wi = Math.sqrt(Math.max((r - x) / 2, 0));
    if (y < 0) wi = -wi;
    return [wr, wi];
  }
  /* attracting fixed point of M, homogeneous [ur, ui, vr, vi] */
  function attractingFix(M) {
    const [ar, ai, br, bi, cr, ci, dr, di] = M;
    const c2 = cr * cr + ci * ci;
    const scale = ar * ar + ai * ai + br * br + bi * bi + c2 + dr * dr + di * di;
    if (c2 < 1e-24 * scale) {                 // M fixes infinity
      return (ar * ar + ai * ai > dr * dr + di * di) ? [1, 0, 0, 0] : [br, bi, dr - ar, di - ai];
    }
    // c z^2 + (d - a) z - b = 0
    const er = ar - dr, ei = ai - di;
    const Dr = er * er - ei * ei + 4 * (br * cr - bi * ci);
    const Di = 2 * er * ei + 4 * (br * ci + bi * cr);
    const [sr, si] = csqrt(Dr, Di);
    let best = null, bestM = -1;
    for (const sg of [1, -1]) {
      const nr = er + sg * sr, ni = ei + sg * si;           // z = n / (2c)
      const zr = (nr * cr + ni * ci) / (2 * c2), zi = (ni * cr - nr * ci) / (2 * c2);
      const mr = cr * zr - ci * zi + dr, mi = cr * zi + ci * zr + di;
      const m = mr * mr + mi * mi;                          // |cz + d|^2 > 1: attracting
      if (m > bestM) { bestM = m; best = [zr, zi, 1, 0]; }
    }
    return best;
  }
  /* the three stand-ins for the limit points below a word ending in g[k] */
  function repPoints(rr, ri) {
    const G = [0, 1, 2, 3].map(k => gen(k, rr, ri));
    const P = [];
    for (let k = 0; k < 4; k++) {
      const w1 = mul(mul(mul(G[(k + 1) % 4], G[(k + 2) % 4]), G[(k + 3) % 4]), G[k]);
      const w3 = mul(mul(mul(G[(k + 3) % 4], G[(k + 2) % 4]), G[(k + 1) % 4]), G[k]);
      const par = k % 2 === 0 ? [1, 0, 0, 0] : [0, 0, 1, 0];   // X: infinity, Y: 0
      P.push([attractingFix(w1), par, attractingFix(w3)]);
    }
    return P;
  }

  /* Depth-first search.  Calls leaf(x, y, cls) for the three plotted points
     of every finished branch; cls in 0..5 records the first two letters
     (first Y or Y^-1, then X, the same Y-letter, or X^-1).
     Returns {nodes, leaves, truncated}.                                     */
  function search(rr, ri, eps, opts, leaf) {
    const budget = opts.budget || 2e6;
    const maxDepth = opts.maxDepth || 3000;
    const dedup = !!opts.dedup;
    const P = repPoints(rr, ri);
    const eps2 = eps * eps;
    let cap = 4096;
    let M = new Float64Array(8 * cap);
    let L = new Int32Array(cap), C = new Int32Array(cap), D = new Int32Array(cap);
    let sp = 0;
    const push = (ar, ai, br, bi, cr, ci, dr, di, last, cls, depth) => {
      if (sp >= cap) {
        cap *= 2;
        const M2 = new Float64Array(8 * cap); M2.set(M); M = M2;
        const L2 = new Int32Array(cap); L2.set(L); L = L2;
        const C2 = new Int32Array(cap); C2.set(C); C = C2;
        const D2 = new Int32Array(cap); D2.set(D); D = D2;
      }
      const o = 8 * sp;
      M[o] = ar; M[o + 1] = ai; M[o + 2] = br; M[o + 3] = bi;
      M[o + 4] = cr; M[o + 5] = ci; M[o + 6] = dr; M[o + 7] = di;
      L[sp] = last; C[sp] = cls; D[sp] = depth;
      sp++;
    };
    const seen = dedup ? new Set() : null;
    const keyOf = (ar, ai, br, bi, cr, ci, dr, di, last) => {
      // PSL: fix the sign by the first entry that is clearly nonzero
      let s = 1;
      const v = [cr, ci, dr, di, ar, ai];
      for (const t of v) if (Math.abs(t) > 1e-6) { s = t > 0 ? 1 : -1; break; }
      const q = t => Math.round(s * t * 1e5);
      return `${last}|${q(ar)},${q(ai)},${q(br)},${q(bi)},${q(cr)},${q(ci)},${q(dr)},${q(di)}`;
    };
    // roots: Y (cls 0..2) and Y^-1 (cls 3..5)
    push(1, 0, 0, 0, rr, ri, 1, 0, 1, 0, 1);
    push(1, 0, 0, 0, -rr, -ri, 1, 0, 3, 3, 1);
    let nodes = 0, leaves = 0, truncated = false;
    const qx = [0, 0, 0], qy = [0, 0, 0];
    while (sp > 0) {
      sp--;
      const o = 8 * sp;
      const ar = M[o], ai = M[o + 1], br = M[o + 2], bi = M[o + 3];
      const cr = M[o + 4], ci = M[o + 5], dr = M[o + 6], di = M[o + 7];
      const last = L[sp], cls = C[sp], depth = D[sp];
      if (++nodes > budget) { truncated = true; break; }
      if (seen) {
        const key = keyOf(ar, ai, br, bi, cr, ci, dr, di, last);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      // images of the three stand-in points
      const Pk = P[last];
      let finite = true;
      for (let j = 0; j < 3; j++) {
        const p = Pk[j];
        const nr = ar * p[0] - ai * p[1] + br * p[2] - bi * p[3];
        const ni = ar * p[1] + ai * p[0] + br * p[3] + bi * p[2];
        const er = cr * p[0] - ci * p[1] + dr * p[2] - di * p[3];
        const ei = cr * p[1] + ci * p[0] + dr * p[3] + di * p[2];
        const den = er * er + ei * ei;
        if (!(den > 1e-300)) { finite = false; break; }
        qx[j] = (nr * er + ni * ei) / den;
        qy[j] = (ni * er - nr * ei) / den;
      }
      if (finite) {
        const d01 = (qx[0] - qx[1]) ** 2 + (qy[0] - qy[1]) ** 2;
        const d12 = (qx[1] - qx[2]) ** 2 + (qy[1] - qy[2]) ** 2;
        const d02 = (qx[0] - qx[2]) ** 2 + (qy[0] - qy[2]) ** 2;
        if (d01 < eps2 && d12 < eps2 && d02 < eps2) {
          leaves++;
          leaf(qx[0], qy[0], cls); leaf(qx[1], qy[1], cls); leaf(qx[2], qy[2], cls);
          continue;
        }
        if (depth >= maxDepth) { truncated = true; leaf(qx[1], qy[1], cls); continue; }
      } else if (depth >= maxDepth) { truncated = true; continue; }
      // children: every letter but the inverse of the last
      for (const k of [(last + 3) & 3, last, (last + 1) & 3]) {
        const c2 = depth === 1 ? cls + (k === last ? 1 : k === 0 ? 0 : 2) : cls;
        switch (k) {
          case 0: push(ar, ai, br + ar, bi + ai, cr, ci, dr + cr, di + ci, 0, c2, depth + 1); break;
          case 2: push(ar, ai, br - ar, bi - ai, cr, ci, dr - cr, di - ci, 2, c2, depth + 1); break;
          case 1: push(ar + br * rr - bi * ri, ai + br * ri + bi * rr, br, bi,
                       cr + dr * rr - di * ri, ci + dr * ri + di * rr, dr, di, 1, c2, depth + 1); break;
          default: push(ar - br * rr + bi * ri, ai - br * ri - bi * rr, br, bi,
                        cr - dr * rr + di * ri, ci - dr * ri - di * rr, dr, di, 3, c2, depth + 1);
        }
      }
    }
    return { nodes, leaves, truncated };
  }

  /* Six inks: first letter Y (indigo family) or Y^-1 (teal family), then the
     second letter shades it. */
  const INKS = [
    [79, 70, 229], [124, 58, 237], [37, 99, 235],        // Y X, Y Y, Y X^-1
    [13, 148, 136], [5, 150, 105], [8, 145, 178],        // Y^-1 X, Y^-1 Y^-1, Y^-1 X^-1
  ];

  /* The whole picture, rasterized into W x H RGBA.  A coarse search first
     measures L0 to frame the view, then the fine search runs at `px` device
     pixels.  `frame` (optional) pins the view instead.                     */
  function limitSetImage(rr, ri, o) {
    const W = o.W, H = o.H;
    const t0 = Date.now();
    const rabs = Math.hypot(rr, ri) || 1;
    let frame = o.frame;
    if (!frame) {
      let ymax = 0, xmin = Infinity, xmax = -Infinity;
      search(rr, ri, 0.02 * Math.min(1, 2 / rabs), { budget: 60000, dedup: o.dedup, maxDepth: 400 },
        (x, y) => {
          if (Math.abs(y) > ymax && Math.abs(y) < 50) ymax = Math.abs(y);
          if (x < xmin && x > -50) xmin = x;
          if (x > xmax && x < 50) xmax = x;
        });
      // fit L0's height, but always show a little more than one period
      const halfH0 = Math.max(1.14 * ymax, 0.02);
      const halfW = Math.max(halfH0 * W / H, 0.62);
      frame = { cx: 0, cy: 0, s: W / (2 * halfW) };
    }
    const s = frame.s, cx = frame.cx, cy = frame.cy;
    const inks = o.inks || INKS;                     // e.g. lighter tints on a dark stage
    const x0 = cx - W / (2 * s), x1 = cx + W / (2 * s);
    const acc = new Float32Array(W * H), cr = new Float32Array(W * H),
          cg = new Float32Array(W * H), cb = new Float32Array(W * H);
    const splat = (x, y, cls) => {
      const fx = W / 2 + (x - cx) * s - 0.5, fy = H / 2 - (y - cy) * s - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      if (iy < -1 || iy >= H || ix < -1 || ix >= W) return;
      const tx = fx - ix, ty = fy - iy, ink = inks[cls];
      for (let dy = 0; dy < 2; dy++) {
        const yy = iy + dy;
        if (yy < 0 || yy >= H) continue;
        const wy = dy ? ty : 1 - ty;
        for (let dx = 0; dx < 2; dx++) {
          const xx = ix + dx;
          if (xx < 0 || xx >= W) continue;
          const w = wy * (dx ? tx : 1 - tx), i = yy * W + xx;
          acc[i] += w; cr[i] += w * ink[0]; cg[i] += w * ink[1]; cb[i] += w * ink[2];
        }
      }
    };
    const n0 = Math.floor(x0 - 3), n1 = Math.ceil(x1 + 3);
    const res = search(rr, ri, (o.px || 0.8) / s,
      { budget: o.budget || 2.5e6, dedup: o.dedup, maxDepth: o.maxDepth || 3000 },
      (x, y, cls) => {
        if (!(Math.abs(x) < 1e3 && Math.abs(y) < 1e3)) return;
        for (let n = n0; n <= n1; n++) {
          const xn = x + n;
          if (xn >= x0 - 1 / s && xn <= x1 + 1 / s) splat(xn, y, cls);
        }
      });
    const rgba = new Uint8ClampedArray(4 * W * H);
    const gain = o.gain || 1.1;
    for (let i = 0; i < W * H; i++) {
      const a = acc[i];
      if (!a) continue;
      rgba[4 * i] = cr[i] / a; rgba[4 * i + 1] = cg[i] / a; rgba[4 * i + 2] = cb[i] / a;
      rgba[4 * i + 3] = 255 * (1 - Math.exp(-gain * a));
    }
    return { rgba, frame, nodes: res.nodes, leaves: res.leaves, truncated: res.truncated,
             ms: Date.now() - t0 };
  }

  /* When the cusp at infinity has rank 2 (translations 1 and lambda), the
     Ford domain is a polyhedron over the period parallelogram.  If its faces
     cover that whole floor there are no free sides: finite volume, and the
     limit set is the whole sphere.  faces: [{x, y, r}], x taken mod 1.     */
  function floorCovered(faces, lr, li, n = 56) {
    if (!(Math.abs(li) > 1e-9) || !faces.length) return false;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const t = (b + 0.5) / n, px = (a + 0.5) / n + t * lr, py = t * li;
        let inside = false;
        for (let i = 0; i < faces.length && !inside; i++) {
          const f = faces[i], r2 = f.r * f.r;
          const m0 = Math.round((py - f.y) / li);
          for (let m = m0 - 1; m <= m0 + 1 && !inside; m++) {
            const dy = py - f.y - m * li;
            if (dy * dy >= r2) continue;
            const cx = f.x + m * lr, k0 = Math.round(px - cx);
            for (let k = k0 - 1; k <= k0 + 1; k++) {
              const dx = px - cx - k;
              if (dx * dx + dy * dy < r2) { inside = true; break; }
            }
          }
        }
        if (!inside) return false;
      }
    }
    return true;
  }

  return { search, limitSetImage, floorCovered, repPoints, attractingFix, INKS };
}

if (typeof module !== "undefined" && module.exports) module.exports = previewCoreFactory;
else if (typeof self !== "undefined") self.PreviewCore = previewCoreFactory();
