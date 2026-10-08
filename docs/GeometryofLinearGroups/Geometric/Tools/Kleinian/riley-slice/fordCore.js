/* fordCore.js -- exact Ford domains behind Riley's picture of the Riley slice.

   Gamma_rho = < A, B >,  A = (1 1; 0 1),  B = (1 0; rho 1)       (Riley)
   Gamma^    = < A, E >,  E : z -> 1/(rho z),  E^2 = 1,  E A E = B.

   Gamma_rho has TWO cusps, infinity = fix A and 0 = fix B.  E swaps them, so
   Gamma^ contains Gamma_rho with index 2, and the Ford domain of Gamma^ at
   infinity is the Ford domain of Gamma_rho taken with respect to both cusps:
   the points of the slab no closer to any horoball of either cusp orbit than
   to the horoball at infinity (horoballs at infinity and 0 swapped by E).
   Riley's colours count its faces: black 1, blue 3, green 5, red 7, ...

   Elements are words  E A^n1 E A^n2 ... A^nk E,  stored as [n1, ..., nk]
   ([] is E).  Left multiplication by A^m does not move an isometric circle and
   right multiplication translates it, so these words with circles taken mod 1
   are all the circles there are.  Odd k: the word is in Gamma_rho
   (E A^n E = B^n) and its face is the bisector with a horoball at an image of
   infinity.  Even k: the word is in the coset Gamma_rho E and its face is the
   bisector with a horoball at an image of 0 -- these are the faces a
   one-cusp Ford domain of Gamma_rho does not see.  Every exponent is +-1 on
   the exterior of the Riley slice (checked through length 6 with |n| <= 2).

   A circle is a FACE iff its hemisphere is the highest one somewhere: in the
   plane,  pow_i(p) = r_i^2 - |p - c_i|^2 > 0  and  pow_i >= pow_j  for all
   other circles j and their translates.  pow_i - pow_j is affine in p, so the
   face is a convex polygon (power cell) cut by the disk -- computed exactly
   by half-plane clipping, no sampling.

   Face sets are NOT closed under taking suffixes, so faces are found by
   Poincare-style closure: repeatedly add the products f A^(+-1) g of faces
   until nothing new is visible.  Seeded with the faces of a neighbouring
   parameter this converges in about one round.                             */

function fordCoreFactory() {
  "use strict";

  // ---- complex 2x2 matrices as flat [ar, ai, br, bi, cr, ci, dr, di] --------
  function makeE(rr, ri) {                 // E = (0 1/s; rho/s 0), s^2 = -rho
    const m = Math.hypot(rr, ri);
    const sr = Math.sqrt(Math.max(0, (m - rr) / 2));
    let si = Math.sqrt(Math.max(0, (m + rr) / 2));
    if (-ri < 0) si = -si;
    const s2 = sr * sr + si * si, ir = sr / s2, ii = -si / s2;   // 1/s
    return [0, 0, ir, ii, rr * ir - ri * ii, rr * ii + ri * ir, 0, 0];
  }
  // E * A^n * M
  function leftEAn(E, n, M) {
    const ar = M[0] + n * M[4], ai = M[1] + n * M[5];
    const br = M[2] + n * M[6], bi = M[3] + n * M[7];
    const er = E[2], ei = E[3], fr = E[4], fi = E[5];   // E = (0 e; f 0)
    return [er * M[4] - ei * M[5], er * M[5] + ei * M[4],
            er * M[6] - ei * M[7], er * M[7] + ei * M[6],
            fr * ar - fi * ai, fr * ai + fi * ar,
            fr * br - fi * bi, fr * bi + fi * br];
  }
  function wordMatrix(word, rr, ri) {
    const E = makeE(rr, ri);
    let M = E;
    for (let i = word.length - 1; i >= 0; i--) M = leftEAn(E, word[i], M);
    return M;
  }
  // isometric circle |cz + d| = 1: centre -d/c (x reduced mod 1), radius 1/|c|
  function circleOfMatrix(M) {
    const cr = M[4], ci = M[5], dr = M[6], di = M[7];
    const c2 = cr * cr + ci * ci;
    const x = -(dr * cr + di * ci) / c2, y = -(di * cr - dr * ci) / c2;
    return { x: x - Math.floor(x), y, r: 1 / Math.sqrt(c2) };
  }
  const circleOf = (word, rr, ri) => circleOfMatrix(wordMatrix(word, rr, ri));

  // ---- exact visibility ------------------------------------------------------
  function clip(poly, u, v, w) {           // keep u x + v y >= w
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
      const P = poly[i], Q = poly[(i + 1) % n];
      const fp = u * P[0] + v * P[1] - w, fq = u * Q[0] + v * Q[1] - w;
      if (fp >= 0) out.push(P);
      if ((fp >= 0) !== (fq >= 0)) {
        const t = fp / (fp - fq);
        out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
    return out;
  }
  function maxPow(poly, c) {               // max of r^2 - |p - c|^2 over poly
    const n = poly.length;
    if (n < 3) return -Infinity;
    let inside = true, d2 = Infinity;
    for (let i = 0; i < n; i++) {
      const P = poly[i], Q = poly[(i + 1) % n];
      const ex = Q[0] - P[0], ey = Q[1] - P[1];
      if (ex * (c.y - P[1]) - ey * (c.x - P[0]) < 0) inside = false;
      const L2 = ex * ex + ey * ey;
      let t = L2 > 0 ? ((c.x - P[0]) * ex + (c.y - P[1]) * ey) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = P[0] + t * ex - c.x, dy = P[1] + t * ey - c.y;
      d2 = Math.min(d2, dx * dx + dy * dy);
    }
    return inside ? c.r * c.r : c.r * c.r - d2;
  }

  const REL = 1e-9;
  /* circles: [{x in [0,1), y, r}] -> {vis: bool[], polys}.  Face i's polygon
     is in coordinates where circle i sits at its own x.                     */
  function visible(circles, wantPolys) {
    const n = circles.length;
    const vis = new Array(n).fill(false);
    const polys = wantPolys ? new Array(n).fill(null) : null;
    for (let i = 0; i < n; i++) {
      const ci = circles[i];
      const ki = ci.r * ci.r - ci.x * ci.x - ci.y * ci.y;
      let poly = [[ci.x - ci.r, ci.y - ci.r], [ci.x + ci.r, ci.y - ci.r],
                  [ci.x + ci.r, ci.y + ci.r], [ci.x - ci.r, ci.y + ci.r]];
      let dead = false;
      for (let j = 0; j < n && !dead; j++) {
        const cj = circles[j];
        const rs = ci.r + cj.r, dy = cj.y - ci.y;
        if (Math.abs(dy) >= rs) continue;
        const k0 = Math.ceil(ci.x - cj.x - rs), k1 = Math.floor(ci.x - cj.x + rs);
        for (let k = k0; k <= k1; k++) {
          if (j === i && k === 0) continue;
          const xj = cj.x + k, dx = xj - ci.x;
          const d = Math.hypot(dx, dy);
          if (d >= rs) continue;                          // disjoint disks
          if (d <= cj.r - ci.r + REL * ci.r) {            // i inside j
            const dup = Math.abs(cj.r - ci.r) <= REL * ci.r;
            if (!dup || j < i) { dead = true; break; }    // duplicates: keep first
            continue;
          }
          if (d <= ci.r - cj.r) continue;                 // j inside i
          const kj = cj.r * cj.r - xj * xj - cj.y * cj.y; // pow_i >= pow_j:
          poly = clip(poly, 2 * (ci.x - xj), 2 * (ci.y - cj.y), kj - ki);
          if (poly.length < 3) { dead = true; break; }
        }
      }
      if (dead) continue;
      if (maxPow(poly, ci) > REL * ci.r * ci.r) {
        vis[i] = true;
        if (polys) polys[i] = poly;
      }
    }
    return { vis, polys };
  }

  /* ---- closure internals ---------------------------------------------------
     A word is carried with its matrix (scalar complex entries, so products
     need no allocation) and a numeric hash.  The hash is polynomial in the
     letters, H(w) = sum code(w_t) B^t mod P, so it composes under the
     concatenation f A^k g used to make candidates; two primes below 2^26
     keep every product exact in doubles.  The matrix of f A^k g is
     M_f A^k M_g: one product, not a walk along the word.                  */
  const P1 = 67108859, P2 = 67108837, HB = 1000003, LMAXH = 512;
  const POW1 = new Float64Array(LMAXH), POW2 = new Float64Array(LMAXH);
  POW1[0] = POW2[0] = 1;
  for (let t = 1; t < LMAXH; t++) { POW1[t] = (POW1[t - 1] * HB) % P1; POW2[t] = (POW2[t - 1] * HB) % P2; }
  const code = n => n + 3;                      // letters -2..2 -> 1..5
  function wordItem(word, E) {
    const er = E[2], ei = E[3], fr = E[4], fi = E[5];
    let ar = 0, ai = 0, br = er, bi = ei, cr = fr, ci = fi, dr = 0, di = 0;
    for (let t = word.length - 1; t >= 0; t--) {
      const n = word[t];
      const pr = ar + n * cr, pi = ai + n * ci, qr = br + n * dr, qi = bi + n * di;
      ar = er * cr - ei * ci; ai = er * ci + ei * cr;
      br = er * dr - ei * di; bi = er * di + ei * dr;
      cr = fr * pr - fi * pi; ci = fr * pi + fi * pr;
      dr = fr * qr - fi * qi; di = fr * qi + fi * qr;
    }
    let h1 = 0, h2 = 0;
    for (let t = 0; t < word.length; t++) {
      h1 = (h1 + code(word[t]) * POW1[t]) % P1;
      h2 = (h2 + code(word[t]) * POW2[t]) % P2;
    }
    return finishItem({ w: word, len: word.length, h1, h2, ar, ai, br, bi, cr, ci, dr, di });
  }
  function productItem(f, k, g) {               // f A^k g
    const xar = g.ar + k * g.cr, xai = g.ai + k * g.ci, xbr = g.br + k * g.dr, xbi = g.bi + k * g.di;
    const it = {
      w: null, f, k, g, len: f.len + g.len + 1,
      h1: (f.h1 + code(k) * POW1[f.len] + g.h1 * POW1[f.len + 1]) % P1,
      h2: (f.h2 + code(k) * POW2[f.len] + g.h2 * POW2[f.len + 1]) % P2,
      ar: f.ar * xar - f.ai * xai + f.br * g.cr - f.bi * g.ci,
      ai: f.ar * xai + f.ai * xar + f.br * g.ci + f.bi * g.cr,
      br: f.ar * xbr - f.ai * xbi + f.br * g.dr - f.bi * g.di,
      bi: f.ar * xbi + f.ai * xbr + f.br * g.di + f.bi * g.dr,
      cr: f.cr * xar - f.ci * xai + f.dr * g.cr - f.di * g.ci,
      ci: f.cr * xai + f.ci * xar + f.dr * g.ci + f.di * g.cr,
      dr: f.cr * xbr - f.ci * xbi + f.dr * g.dr - f.di * g.di,
      di: f.cr * xbi + f.ci * xbr + f.dr * g.di + f.di * g.dr,
    };
    return finishItem(it);
  }
  function finishItem(it) {                    // circle |cz + d| = 1, key
    const c2 = it.cr * it.cr + it.ci * it.ci;
    const x = -(it.dr * it.cr + it.di * it.ci) / c2;
    it.x = x - Math.floor(x);
    it.y = -(it.di * it.cr - it.dr * it.ci) / c2;
    it.r = 1 / Math.sqrt(c2);
    it.key = it.h1 * P2 + it.h2;
    return it;
  }
  function wordOf(it) {
    if (!it.w) it.w = wordOf(it.f).concat([it.k], wordOf(it.g));
    return it.w;
  }
  // the items whose circles are faces (circles inside one bigger circle culled first)
  function visibleItems(items, wantPolys, keptOut) {
    const order = [];
    for (let i = 0; i < items.length; i++) {
      const c = items[i];
      if (c.r > 0 && isFinite(c.r) && isFinite(c.x)) order.push(i);
    }
    order.sort((a, b) => items[b].r - items[a].r);
    const kept = [];
    for (const i of order) {
      const c = items[i];
      let inside = false;
      for (let t = 0; t < kept.length; t++) {
        const d = items[kept[t]];
        if (d.r - c.r <= REL * c.r) break;     // sorted: the rest are no bigger
        let dx = Math.abs(c.x - d.x); if (dx > 0.5) dx = 1 - dx;
        if (Math.hypot(dx, c.y - d.y) <= d.r - c.r + REL * c.r) { inside = true; break; }
      }
      if (!inside) kept.push(i);
    }
    const { vis, polys } = visible(kept.map(i => items[i]), wantPolys);
    const out = [];
    kept.forEach((i, k) => {
      if (!vis[k]) { if (keptOut) keptOut.push(items[i]); return; }
      const it = items[i];
      if (polys) it.poly = polys[k];
      out.push(it);
    });
    return out;
  }
  const faceOut = it => ({ word: wordOf(it), x: it.x, y: it.y, r: it.r, poly: it.poly || null, key: it.key });

  // faces among a list of words
  function facesOf(words, rr, ri, wantPolys) {
    const E = makeE(rr, ri);
    return visibleItems(words.map(w => wordItem(w, E)), wantPolys).map(faceOut);
  }

  /* Ford domain at rho by closure.  group: "ext" (Gamma^, Riley's picture) or
     "gamma" (Gamma_rho at the cusp infinity only).  seed: words to start from
     (e.g. a neighbour's faces).  Returns {faces, complete}.                  */
  const key = w => w.join(",");
  function fordDomain(rr, ri, opts = {}) {
    const group = opts.group || "ext";
    const LCAP = Math.min(opts.maxLength ?? 48, LMAXH - 2);
    const FCAP = opts.maxFaces ?? 160;
    const JOIN = group === "gamma" ? [1, -1, 2, -2] : [1, -1];
    let seed = opts.seed && opts.seed.length ? opts.seed
             : group === "gamma" ? [[1], [-1]] : [[]];
    if (group === "gamma") seed = seed.filter(w => w.length % 2 === 1);
    if (!seed.length) seed = group === "gamma" ? [[1], [-1]] : [[]];
    const E = makeE(rr, ri);
    let faces = visibleItems(seed.map(w => wordItem(w, E)), false);
    let complete = false, hidden = null;
    for (let round = 0; round < 40; round++) {
      const have = new Set();
      for (const f of faces) have.add(f.key);
      const old = new Set(have);
      const cand = faces.slice();
      for (const f of faces) for (const g of faces) for (const k of JOIN) {
        if (f.len + g.len + 1 > LCAP) continue;
        const h1 = (f.h1 + code(k) * POW1[f.len] + g.h1 * POW1[f.len + 1]) % P1;
        const h2 = (f.h2 + code(k) * POW2[f.len] + g.h2 * POW2[f.len + 1]) % P2;
        const kk = h1 * P2 + h2;
        if (have.has(kk)) continue;
        have.add(kk);
        cand.push(productItem(f, k, g));
      }
      const hiddenItems = [];
      const nf = visibleItems(cand, false, hiddenItems);
      const same = nf.length === faces.length && nf.every(f => old.has(f.key));
      faces = nf;
      if (same) {
        complete = true;
        if (opts.hidden) {                     // the near misses: candidates no single
          const at = new Map(faces.map((f, t) => [f, t]));   // circle contains
          hidden = [];
          for (const it of hiddenItems)
            if (it.f && at.has(it.f) && at.has(it.g)) hidden.push([at.get(it.f), it.k, at.get(it.g)]);
        }
        break;
      }
      if (faces.length > FCAP) break;
    }
    if (opts.polys) faces = visibleItems(faces, true);
    return { faces: faces.map(faceOut), complete, hidden };
  }
  // a hash of the face set (order-free), for colouring by type
  function typeHash(faces) {
    const ks = faces.map(f => f.key).sort((a, b) => a - b);
    let h = 2166136261 >>> 0;
    for (const k of ks) {
      h = Math.imul(h ^ (k % 4294967296), 16777619) >>> 0;
      h = Math.imul(h ^ Math.floor(k / 4294967296), 16777619) >>> 0;
    }
    return h | 0;
  }

  // ---- names -------------------------------------------------------------------
  const sup = n => n === 1 ? "" : n === -1 ? "⁻¹" :
    String(n).replace(/-/g, "⁻").replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]);
  function wordName(w) {                   // E-form, A^-1 written a
    let s = "E";
    for (const n of w) s += (n > 0 ? "A" : "a").repeat(Math.abs(n)) + "E";
    return s;
  }
  function gammaName(w) {                  // in A, B (and a trailing E)
    if (!w.length) return "E";
    let s = "";
    for (let i = 0; i < w.length; i++) s += (i % 2 ? "A" : "B") + sup(w[i]);
    return w.length % 2 ? s : s + "E";
  }
  const inGamma = w => w.length % 2 === 1;
  const signature = faces => faces.map(f => key(f.word)).sort().join("|");

  // ---- the Riley slice boundary: cusps of the principal pleating rays --------
  /* Farey polynomial Phi_{p/q}(rho) and its derivative, by the recursion
     Phi_{L+R} = 8 - Phi_L Phi_R - Phi_{R-L} down the Stern-Brocot path
     (never from expanded coefficients: they reach 1e25).  Phi_{0/1} = 2 - rho,
     whose cusp is rho = 4.                                                   */
  function sbPath(p, q) {
    const path = [];
    let a = [0, 1], b = [1, 1];
    for (;;) {
      const m = [a[0] + b[0], a[1] + b[1]];
      if (m[0] * q === p * m[1]) return path;
      if (p * m[1] < m[0] * q) { path.push(0); b = m; } else { path.push(1); a = m; }
    }
  }
  function fareyEval(path) {
    return (zr, zi) => {
      let a = [2 - zr, -zi, -1, 0], b = [2 + zr, zi, 1, 0], c = [2, 0, 0, 0];
      const mid = (a, b, c) => {           // 8 - a b - c, with derivative
        const vr = 8 - (a[0] * b[0] - a[1] * b[1]) - c[0];
        const vi = -(a[0] * b[1] + a[1] * b[0]) - c[1];
        const dr = -(a[2] * b[0] - a[3] * b[1] + a[0] * b[2] - a[1] * b[3]) - c[2];
        const di = -(a[2] * b[1] + a[3] * b[0] + a[0] * b[3] + a[1] * b[2]) - c[3];
        return [vr, vi, dr, di];
      };
      let m = mid(a, b, c);
      for (const s of path) {
        if (s === 0) { c = b; b = m; } else { c = a; a = m; }
        m = mid(a, b, c);
      }
      return m;
    };
  }
  function cuspOf(p, q) {                  // landing point of the p/q ray
    if (p === 0) return [4, 0];
    if (p === q) return [-4, 0];
    const ev = fareyEval(sbPath(p, q));
    const R0 = 30;
    let zr = R0 * Math.cos(Math.PI * p / q), zi = R0 * Math.sin(Math.PI * p / q);
    const newton = (zr, zi, tr, ti, its) => {
      for (let it = 0; it < its; it++) {
        const e = ev(zr, zi), rr = e[0] - tr, ri = e[1] - ti;
        const den = e[2] * e[2] + e[3] * e[3] || 1e-300;
        zr -= (rr * e[2] + ri * e[3]) / den;
        zi -= (ri * e[2] - rr * e[3]) / den;
      }
      return [zr, zi];
    };
    let e = ev(zr, zi);
    const T = Math.hypot(e[0], e[1]);
    [zr, zi] = newton(zr, zi, -T, 0, 12);
    let t = T - 2, scale = 1;
    for (let step = 0; step < 3000 && t > 1e-10; step++) {
      e = ev(zr, zi);
      const gm = Math.hypot(e[2], e[3]);
      const cap = Math.max(0.06, 0.05 * Math.hypot(zr, zi));
      const dt = Math.min(scale * cap * gm, 0.6 * t), tn = t - dt;
      const den = e[2] * e[2] + e[3] * e[3] || 1e-300;
      let [nr, ni] = newton(zr + dt * e[2] / den, zi - dt * e[3] / den, -2 - tn, 0, 3);
      const f = ev(nr, ni);
      const err = Math.hypot(f[0] + 2 + tn, f[1]);
      if (err < 1e-7 * (3 + tn) && Math.hypot(nr - zr, ni - zi) < cap * 1.001) {
        zr = nr; zi = ni; t = tn; scale = Math.min(scale * 1.4, 1);
      } else if ((scale *= 0.5) < 1e-9) break;
    }
    return [zr, zi];
  }
  /* boundary of the slice in the closed upper half plane, from 4 to -4 */
  function sliceBoundary(qmax = 48) {
    const fr = [];
    for (let q = 1; q <= qmax; q++)
      for (let p = 0; p <= q; p++) if (gcd(p, q) === 1) fr.push([p, q]);
    fr.sort((u, v) => u[0] / u[1] - v[0] / v[1]);
    return fr.map(([p, q]) => cuspOf(p, q));
  }
  function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
  /* is rho in the lens (the complement of the closed Riley slice)? */
  function makeLensTest(boundary) {
    const P = boundary.concat(boundary.slice(1, -1).reverse().map(([x, y]) => [x, -y]));
    // even-odd test; edges bucketed by height so a query looks at a handful
    const NB = 256, Y0 = -2.05, H = 4.1 / NB, buckets = [];
    for (let b = 0; b < NB; b++) buckets.push([]);
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const lo = Math.min(P[i][1], P[j][1]), hi = Math.max(P[i][1], P[j][1]);
      const b0 = Math.max(0, Math.floor((lo - Y0) / H)), b1 = Math.min(NB - 1, Math.floor((hi - Y0) / H));
      for (let b = b0; b <= b1; b++) buckets[b].push(P[i][0], P[i][1], P[j][0], P[j][1]);
    }
    return (x, y) => {
      if (Math.abs(x) >= 4 || Math.abs(y) >= 2.05) return false;
      const E = buckets[Math.min(NB - 1, Math.max(0, Math.floor((y - Y0) / H)))];
      let ins = false;
      for (let e = 0; e < E.length; e += 4) {
        const xi = E[e], yi = E[e + 1], xj = E[e + 2], yj = E[e + 3];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    };
  }

  // ---- certificates: how long does a Ford domain keep its shape? -------------
  /* A Ford domain keeps its combinatorics -- and then, by Poincare's theorem,
     stays the Ford domain -- until one of finitely many "slacks" changes
     sign.  Each slack is a real algebraic function of rho once the isometric
     circles are (their centres and radii are rational in rho, rho-bar):
       out/cross/in  two nearby circles start to touch, cross or nest
       V             a vertex (three hemispheres meeting in H^3) sinks to the
                     sphere at infinity: power of the radical centre -> 0
       Vl            a fourth circle reaches a vertex
       Ql            a corner of the ideal boundary (two circles crossing on
                     the edge of the covered region) is covered by a third
     These are the walls of Riley's picture -- in practice nearly all of them
     are Ql events.  The circles watched near each vertex and corner are the
     faces AND the closure's near misses (candidates f A^(+-1) g that no
     single circle contains): a new face is born when a candidate's circle
     reaches a corner, and only sometimes does an existing face show it.  A
     slack that vanishes identically (tangencies at parabolic fixed points)
     is dropped.                                                            */
  function circlesAbs(words, rr, ri, into) {  // centres NOT reduced mod 1
    const E = makeE(rr, ri);
    const er = E[2], ei = E[3], fr = E[4], fi = E[5];         // E = (0 e; f 0)
    const C = into || words.map(() => ({ x: 0, y: 0, r: 0 }));
    for (let w = 0; w < words.length; w++) {
      const word = words[w];
      // M = E, then M <- E A^n M for the syllables right to left; scalar
      // complex arithmetic, no allocation
      let ar = 0, ai = 0, br = er, bi = ei, cr = fr, ci = fi, dr = 0, di = 0;
      for (let t = word.length - 1; t >= 0; t--) {
        const n = word[t];
        const pr = ar + n * cr, pi = ai + n * ci, qr = br + n * dr, qi = bi + n * di;
        ar = er * cr - ei * ci; ai = er * ci + ei * cr;
        br = er * dr - ei * di; bi = er * di + ei * dr;
        cr = fr * pr - fi * pi; ci = fr * pi + fi * pr;
        dr = fr * qr - fi * qi; di = fr * qi + fi * qr;
      }
      const c2 = cr * cr + ci * ci, o = C[w];
      o.x = -(dr * cr + di * ci) / c2; o.y = -(di * cr - dr * ci) / c2; o.r = 1 / Math.sqrt(c2);
      o.ar = ar; o.ai = ai; o.br = br; o.bi = bi; o.cr = cr; o.ci = ci; o.dr = dr; o.di = di;
    }
    return C;
  }
  // circle of f A^k g from the matrices of f and g (centre not reduced)
  function productCircle(f, k, g, o) {
    const xar = g.ar + k * g.cr, xai = g.ai + k * g.ci, xbr = g.br + k * g.dr, xbi = g.bi + k * g.di;
    const cr = f.cr * xar - f.ci * xai + f.dr * g.cr - f.di * g.ci;
    const ci = f.cr * xai + f.ci * xar + f.dr * g.ci + f.di * g.cr;
    const dr = f.cr * xbr - f.ci * xbi + f.dr * g.dr - f.di * g.di;
    const di = f.cr * xbi + f.ci * xbr + f.dr * g.di + f.di * g.dr;
    const c2 = cr * cr + ci * ci;
    o.x = -(dr * cr + di * ci) / c2; o.y = -(di * cr - dr * ci) / c2; o.r = 1 / Math.sqrt(c2);
    return o;
  }
  const powAt = (c, k, px, py) => c.r * c.r - (px - c.x - k) ** 2 - (py - c.y) ** 2;
  function radicalCentre(a, b, kb, c, kc) {   // of circles a, b + kb, c + kc
    const bx = b.x + kb, cx = c.x + kc;
    const ea = a.x * a.x + a.y * a.y - a.r * a.r;
    const m11 = 2 * (bx - a.x), m12 = 2 * (b.y - a.y), m21 = 2 * (cx - a.x), m22 = 2 * (c.y - a.y);
    const det = m11 * m22 - m12 * m21;
    if (!(Math.abs(det) > 1e-13 * (Math.abs(m11 * m22) + Math.abs(m12 * m21) + 1e-300))) return null;
    const r1 = bx * bx + b.y * b.y - b.r * b.r - ea, r2 = cx * cx + c.y * c.y - c.r * c.r - ea;
    return [(r1 * m22 - r2 * m12) / det, (m11 * r2 - m21 * r1) / det];
  }
  function circleMeet(a, b, kb, side) {       // crossing point of a and b + kb
    const dx = b.x + kb - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
    const t = (a.r * a.r - b.r * b.r + d2) / (2 * d), h2 = a.r * a.r - t * t;
    if (!(h2 > 0)) return null;
    const h = Math.sqrt(h2) * side;
    return [a.x + (t * dx - h * dy) / d, a.y + (t * dy + h * dx) / d];
  }
  /* certificate(words, rho): the slacks of the Ford domain with these faces.
     values(rho) returns them all (positive while the domain keeps its
     shape); drift is how far any circle has moved since rho, and a
     certificate is only trusted while drift < MARGIN / 2 -- beyond that,
     circles that were not near a vertex or corner could have become so.  */
  const MARGIN = 0.3;
  function certificate(words, rr, ri, group = "ext", hidden = null) {
    const C0 = circlesAbs(words, rr, ri), n = C0.length, TOL = 1e-10;
    const near = (m, km, px, py, slack) =>       // circle m + km reaches within slack of p
      Math.hypot(px - C0[m].x - km, py - C0[m].y) < C0[m].r + slack;
    const covered = (px, py, j, kj, N) => {    // inside some circle other than j + kj (and i)
      for (let w = 0; w < N.length; w += 2) {
        const m = N[w], km = N[w + 1];
        if (m === j && km === kj) continue;
        if (powAt(C0[m], km, px, py) > TOL * C0[m].r * C0[m].r) return true;
      }
      return false;
    };
    // a point buried MARGIN deep inside another circle cannot reach the ideal
    // boundary during the certificate's life; events there are harmless
    const buried = (px, py, i, j, kj, N) => {
      for (let w = 0; w < N.length; w += 2) {
        const m = N[w], km = N[w + 1];
        if ((m === j && km === kj)) continue;
        if (Math.hypot(px - C0[m].x - km, py - C0[m].y) < C0[m].r - MARGIN) return true;
      }
      return false;
    };
    const nb = [];                             // nearby translates of every circle
    for (let i = 0; i < n; i++) {
      const L = [];
      for (let j = 0; j < n; j++) {
        const reach = C0[i].r + C0[j].r + MARGIN;
        const k0 = Math.ceil(C0[i].x - C0[j].x - reach), k1 = Math.floor(C0[i].x - C0[j].x + reach);
        for (let k = k0; k <= k1; k++) {
          if (j === i && k === 0) continue;
          if (Math.hypot(C0[j].x + k - C0[i].x, C0[j].y - C0[i].y) < reach) L.push(j, k);
        }
      }
      nb.push(L);
    }
    const pairs = [];   // [kind, i, j, k]: 0 apart, 1 crossing, 2 nested (j inside i)
    const verts = [];   // [i, j, kj, l, kl, covers: [m, km, ...]]
    const corners = []; // [i, j, k, side, covers]
    for (let i = 0; i < n; i++) {
      const a = C0[i], N = nb[i], cross = [];
      for (let u = 0; u < N.length; u += 2) {
        const j = N[u], k = N[u + 1], b = C0[j], d = Math.hypot(b.x + k - a.x, b.y - a.y);
        const isCross = d < a.r + b.r && d > Math.abs(a.r - b.r);
        if (isCross) cross.push(j, k);
        if (j < i || (j === i && k < 0)) continue;           // each pair once
        const ux = (b.x + k - a.x) / d, uy = (b.y - a.y) / d;
        if (isCross) {
          // two crossing circles stop crossing when their crossing points
          // merge; generically both are then open corners or both covered by
          // the same circle, and only the first changes the domain
          let open = 0;
          for (const side of [1, -1]) {
            const q = circleMeet(a, b, k, side);
            if (q && !covered(q[0], q[1], j, k, N)) open++;
          }
          if (open === 2) pairs.push([1, i, j, k]);
        } else if (d >= a.r + b.r) {                         // apart: they would touch here
          if (!buried(a.x + ux * a.r, a.y + uy * a.r, i, j, k, N)) pairs.push([0, i, j, k]);
        } else {                                             // nested: inner touches outer here
          const big = a.r >= b.r, sgn = big ? 1 : -1;
          const px = (big ? a.x : b.x + k) + sgn * ux * (big ? a.r : b.r);
          const py = (big ? a.y : b.y) + sgn * uy * (big ? a.r : b.r);
          if (!buried(px, py, i, j, k, N)) pairs.push(big ? [2, i, j, k] : [2, j, i, -k]);
        }
      }
      for (let u = 0; u < cross.length; u += 2) {             // vertices in H^3
        const j = cross[u], kj = cross[u + 1];
        if (j < i) continue;                                   // found from the lowest face
        for (let v = u + 2; v < cross.length; v += 2) {
          const l = cross[v], kl = cross[v + 1];
          if (l < i) continue;
          const p = radicalCentre(a, C0[j], kj, C0[l], kl);
          if (!p) continue;
          const P = powAt(a, 0, p[0], p[1]);
          if (P <= TOL * a.r * a.r) continue;
          let top = true;
          const covers = [];
          for (let w = 0; w < N.length; w += 2) {
            const m = N[w], km = N[w + 1];
            if ((m === j && km === kj) || (m === l && km === kl)) continue;
            if (powAt(C0[m], km, p[0], p[1]) > P + TOL * a.r * a.r) { top = false; break; }
            if (near(m, km, p[0], p[1], MARGIN + Math.sqrt(P))) covers.push(m, km);
          }
          if (top) verts.push([i, j, kj, l, kl, covers]);
        }
      }
      for (let u = 0; u < cross.length; u += 2) {             // corners at infinity
        const j = cross[u], k = cross[u + 1];
        if (j < i || (j === i && k < 0)) continue;
        for (const side of [1, -1]) {
          const q = circleMeet(a, C0[j], k, side);
          if (!q) continue;
          let open = true;
          const covers = [];
          for (let w = 0; w < N.length; w += 2) {
            const m = N[w], km = N[w + 1];
            if (m === j && km === k) continue;
            if (powAt(C0[m], km, q[0], q[1]) > TOL * C0[m].r * C0[m].r) { open = false; break; }
            if (near(m, km, q[0], q[1], MARGIN)) covers.push(m, km);
          }
          if (open) corners.push([i, j, k, side, covers]);
        }
      }
    }
    // the closure's near-miss candidates f A^k g join the covers of nearby
    // vertices and corners (indices n..)
    const used = hidden || [];
    for (let u = 0; u < used.length; u++) C0.push({ x: 0, y: 0, r: 0 });
    for (let u = 0; u < used.length; u++) productCircle(C0[used[u][0]], used[u][1], C0[used[u][2]], C0[n + u]);
    const watch = (px, py, reach, list) => {
      for (let u = 0; u < used.length; u++) {
        const c = C0[n + u], k0 = Math.round(px - c.x);
        for (const km of [k0 - 1, k0, k0 + 1])
          if (Math.hypot(px - c.x - km, py - c.y) < c.r + reach) list.push(n + u, km);
      }
    };
    for (const v of verts) {
      const p = radicalCentre(C0[v[0]], C0[v[1]], v[2], C0[v[3]], v[4]);
      watch(p[0], p[1], MARGIN + Math.sqrt(Math.max(0, powAt(C0[v[0]], 0, p[0], p[1]))), v[5]);
    }
    for (const q of corners) {
      const p = circleMeet(C0[q[0]], C0[q[1]], q[2], q[3]);
      watch(p[0], p[1], MARGIN, q[4]);
    }
    const nAll = n + used.length;
    const withCands = (C) => {                   // faces' circles + watched candidates'
      for (let u = 0; u < used.length; u++) {
        const [f, k, g] = used[u];
        productCircle(C[f], k, C[g], C[n + u]);
      }
      return C;
    };
    let size = pairs.length;
    for (const v of verts) size += 1 + v[5].length / 2;
    for (const q of corners) size += q[4].length / 2;
    const out = new Float64Array(size);
    const fill = (C) => {
      let t = 0;
      for (const [kind, i, j, k] of pairs) {
        const a = C[i], b = C[j], d = Math.hypot(b.x + k - a.x, b.y - a.y), s = a.r + b.r;
        if (kind === 0) out[t++] = (d - s) / s;
        else if (kind === 1) out[t++] = Math.min(s - d, d - Math.abs(a.r - b.r)) / s;
        else out[t++] = (a.r - b.r - d) / a.r;
      }
      for (const [i, j, kj, l, kl, cv] of verts) {
        const a = C[i], p = radicalCentre(a, C[j], kj, C[l], kl);
        if (!p) { for (let w = 0; w <= cv.length; w += 2) out[t++] = -1; continue; }
        const P = powAt(a, 0, p[0], p[1]), r2 = a.r * a.r;
        out[t++] = P / r2;
        for (let w = 0; w < cv.length; w += 2) out[t++] = (P - powAt(C[cv[w]], cv[w + 1], p[0], p[1])) / r2;
      }
      for (const [i, j, k, side, cv] of corners) {
        const q = circleMeet(C[i], C[j], k, side);
        for (let w = 0; w < cv.length; w += 2) {
          const c = C[cv[w]];
          out[t++] = q ? -powAt(c, cv[w + 1], q[0], q[1]) / (c.r * c.r) : -1;
        }
      }
      return out;
    };
    // slacks vanishing identically (tangencies at parabolic points) are masked
    const eps = 1e-6 * (1 + Math.hypot(rr, ri));
    const blank = () => { const C = circlesAbs(words, rr, ri); for (let u = 0; u < used.length; u++) C.push({ x: 0, y: 0, r: 0 }); return C; };
    const v0 = Float64Array.from(fill(C0));
    const C1 = blank();
    const v1 = Float64Array.from(fill(withCands(circlesAbs(words, rr + eps, ri + 0.7 * eps, C1))));
    const mask = new Uint8Array(size);
    for (let t = 0; t < size; t++)
      mask[t] = (Math.abs(v0[t]) < 1e-9 && Math.abs(v1[t]) < 1e-9) || !(v0[t] > 0) ? 0 : 1;
    const Cw = blank();                        // reused workspace
    const cert = {
      size, drift: 0,
      values(r, i) {
        const C = withCands(circlesAbs(words, r, i, Cw));
        let dr = 0;
        for (let k = 0; k < nAll; k++)
          dr = Math.max(dr, Math.abs(C[k].x - C0[k].x), Math.abs(C[k].y - C0[k].y), Math.abs(C[k].r - C0[k].r));
        cert.drift = dr;
        fill(C);
        for (let t = 0; t < size; t++) if (!mask[t]) out[t] = 1;
        return out;
      },
    };
    return cert;
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h | 0;
  }

  /* Scan a row of n pixels, rho = rhoAt(t).  The Ford domain is computed
     once per region crossed; in between only its certificate is evaluated,
     with steps sized so no slack is predicted to reach zero, and a sign
     change is bisected down to the first pixel of the next region.
     Certificates watch the faces and the closure's near-miss candidates, but
     a face can still be born from a candidate that no single slack sees, so
     every VERIFY pixels a run is checked against a fresh Ford domain; on a
     mismatch the stretch since the run began is recomputed pixel by pixel.
     Returns face counts (0 = skipped) and type hashes per pixel.          */
  function scanRow(n, rhoAt, opts = {}) {
    const group = opts.group || "ext", skip = opts.skip || (() => false);
    const MAXSTEP = opts.maxStep ?? 16, VERIFY = opts.verify ?? 32;
    const counts = new Int16Array(n), hashes = new Int32Array(n);
    const stats = { closures: 0, checks: 0, missed: 0 };
    const minOf = a => { let m = Infinity; for (let k = 0; k < a.length; k++) if (a[k] < m) m = a[k]; return m; };
    const solve = (t, seed) => {
      const [a, b] = rhoAt(t);
      if (skip(a, b)) return null;
      stats.closures++;
      return fordDomain(a, b, { seed, group, hidden: true });
    };
    const record = (t, fd) => {
      const cnt = fd && fd.complete ? fd.faces.length : 0;
      counts[t] = cnt; hashes[t] = cnt ? typeHash(fd.faces) : 0;
      return cnt;
    };
    let c = 0, fd = null, seed = null;
    if (group !== "ext") {                    // certificates were tuned and tested for
      for (; c < n; c++) {                     // Riley's two-cusp domain only
        const f2 = solve(c, seed);
        record(c, f2);
        seed = f2 ? f2.faces.map(f => f.word) : null;
      }
      return { counts, hashes, stats };
    }
    while (c < n) {
      if (!fd) fd = solve(c, seed);
      if (!fd) { seed = null; c++; continue; }               // skipped (the lens)
      const cnt = record(c, fd), h = hashes[c];
      seed = fd.faces.map(f => f.word);
      const start = c;
      let last = c, expectSame = false;
      c++;
      const hidden = fd.hidden;
      fd = null;
      if (!cnt) continue;
      const [rr, ri] = rhoAt(start);
      const cert = certificate(seed, rr, ri, group, hidden);
      let prev = Float64Array.from(cert.values(rr, ri)), step = 1;
      for (;;) {
        if (c >= n) break;
        if (last - start >= VERIFY) { expectSame = true; break; }
        let target = Math.min(n - 1, last + step);
        for (let t = last + 1; t <= target; t++) {           // stop before skipped pixels
          const [a, b] = rhoAt(t);
          if (skip(a, b)) { target = t - 1; break; }
        }
        if (target <= last) break;
        const [ar, ai] = rhoAt(target);
        stats.checks++;
        const cur = cert.values(ar, ai);
        if (cert.drift > MARGIN / 2) { expectSame = true; break; }   // circles moved too far
        if (minOf(cur) <= 0) {                                // a wall in (last, target]
          let lo = last, hi = target;
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1, [mr, mi] = rhoAt(mid);
            stats.checks++;
            if (minOf(cert.values(mr, mi)) > 0) lo = mid; else hi = mid;
          }
          for (let t = last + 1; t <= lo; t++) { counts[t] = cnt; hashes[t] = h; }
          last = lo;
          c = hi;
          break;
        }
        for (let t = last + 1; t <= target; t++) { counts[t] = cnt; hashes[t] = h; }
        let s = MAXSTEP;
        const dt = target - last;
        for (let k = 0; k < cur.length; k++) {
          const rate = (prev[k] - cur[k]) / dt;
          if (rate > 0) s = Math.min(s, 0.5 * cur[k] / rate);
        }
        step = Math.max(1, Math.floor(s));
        prev.set(cur);
        last = target;
        c = target + 1;
      }
      if (!expectSame || c >= n) continue;
      // verification: the certificate says nothing changed up to here
      fd = solve(c, seed);
      if (fd && fd.complete && typeHash(fd.faces) === h) continue;
      const [vr, vi] = rhoAt(c);
      if (minOf(cert.values(vr, vi)) <= 0) continue;          // an ordinary wall at c
      stats.missed++;                                         // it missed a wall:
      let sd = seed;                                          // redo the stretch
      for (let t = start + 1; t < c; t++) {
        const f2 = solve(t, sd);
        record(t, f2);
        sd = f2 ? f2.faces.map(f => f.word) : null;
      }
      if (fd) seed = sd;
    }
    return { counts, hashes, stats };
  }

  // ---- Riley's palette, indexed by face count ---------------------------------
  // measured from Riley's picture: 1 black, 3 blue, 5 green, 7 red,
  // 9 aquamarine, 11 magenta, 13 azure, 15 yellow, then the cycle repeats.
  const RILEY = [[8, 10, 10], [4, 42, 245], [105, 236, 2], [245, 45, 110],
                 [135, 245, 195], [220, 45, 240], [40, 130, 224], [245, 245, 40]];
  function rileyColor(count) {
    const k = Math.max(0, (count - 1) >> 1);
    return k === 0 ? RILEY[0] : RILEY[1 + (k - 1) % 7];
  }

  /* More palettes.  All index k = (count - 1) >> 1, the step number of the
     region (0 = the outermost one), and paint k = 0 dark.
       cycle: bands per hue cycle (cyclic palettes)    hue: shift in degrees  */
  const CALM = [[46, 94, 126], [63, 143, 138], [125, 187, 138], [207, 220, 143],
                [244, 207, 122], [242, 161, 103], [224, 112, 106], [184, 85, 127], [124, 77, 143]];
  const OUTER = [10, 12, 22];
  function sinebow(t) {                   // smooth, evenly bright rainbow
    t = 0.5 - t;
    const f = x => Math.round(255 * Math.sin(Math.PI * x) ** 2);
    return [f(t), f(t + 1 / 3), f(t + 2 / 3)];
  }
  function hsv(h, s, v) {
    h = ((h % 1) + 1) % 1;
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return [r, g, b].map(x => Math.round(255 * x));
  }
  const PALETTES = {
    riley:    { label: "Riley (original)", cyclic: false, hue: false },
    rainbow:  { label: "Rainbow",          cyclic: true,  hue: true },
    spectrum: { label: "Spectrum (by depth)", cyclic: false, hue: true },
    pastel:   { label: "Pastel rainbow",   cyclic: true,  hue: true },
    calm:     { label: "Calm",             cyclic: false, hue: false },
  };
  function paletteColor(name, count, o = {}) {
    const k = Math.max(0, (count - 1) >> 1);
    const cycle = o.cycle || 9, shift = (o.hue || 0) / 360;
    switch (name) {
      case "rainbow":
        return k ? sinebow((k - 1) / cycle + shift) : OUTER;
      case "pastel": {
        if (!k) return [36, 40, 58];
        const c = sinebow((k - 1) / cycle + shift);
        return c.map(x => Math.round(0.55 * x + 0.45 * 255));
      }
      case "spectrum": {                 // red at the first wall, violet deep in the cusps
        if (!k) return OUTER;
        const t = Math.min(1, Math.log(k) / Math.log(48));
        return hsv(shift + 0.8 * t, 0.85, 1);
      }
      case "calm":
        return k ? CALM[(k - 1) % CALM.length] : [31, 42, 68];
      default:
        return rileyColor(count);
    }
  }

  const api = { makeE, wordMatrix, circleOf, visible, facesOf, fordDomain,
                wordName, gammaName, inGamma, signature,
                cuspOf, sliceBoundary, makeLensTest, RILEY, rileyColor,
                PALETTES, paletteColor, certificate, scanRow, hashString, typeHash };
  return api;
}
/* a factory, so a page can rebuild the module inside a Blob worker from
   fordCoreFactory.toString() -- that works from file:// too.                 */
if (typeof module !== "undefined" && module.exports) module.exports = fordCoreFactory();
else self.FordCore = fordCoreFactory();
