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

  // faces among a list of words (circles inside a single bigger one culled first)
  function facesOf(words, rr, ri, wantPolys) {
    const E = makeE(rr, ri);
    const C = words.map(w => {
      let M = E;
      for (let i = w.length - 1; i >= 0; i--) M = leftEAn(E, w[i], M);
      return circleOfMatrix(M);
    });
    const order = C.map((_, i) => i).sort((a, b) => C[b].r - C[a].r);
    const kept = [];
    for (const i of order) {
      const c = C[i];
      if (!(c.r > 0 && isFinite(c.r) && isFinite(c.x))) continue;
      let inside = false;
      for (const j of kept) {
        const d = C[j];
        let dx = Math.abs(c.x - d.x); if (dx > 0.5) dx = 1 - dx;
        if (Math.hypot(dx, c.y - d.y) <= d.r - c.r + REL * c.r && d.r - c.r > REL * c.r) { inside = true; break; }
      }
      if (!inside) kept.push(i);
    }
    const { vis, polys } = visible(kept.map(i => C[i]), wantPolys);
    const out = [];
    kept.forEach((i, k) => {
      if (vis[k]) out.push({ word: words[i], ...C[i], poly: polys ? polys[k] : null });
    });
    return out;
  }

  /* Ford domain at rho by closure.  group: "ext" (Gamma^, Riley's picture) or
     "gamma" (Gamma_rho at the cusp infinity only).  seed: words to start from
     (e.g. a neighbour's faces).  Returns {faces, complete}.                  */
  const key = w => w.join(",");
  function fordDomain(rr, ri, opts = {}) {
    const group = opts.group || "ext";
    const LCAP = opts.maxLength ?? 48;
    const FCAP = opts.maxFaces ?? 160;
    const JOIN = group === "gamma" ? [1, -1, 2, -2] : [1, -1];
    let seed = opts.seed && opts.seed.length ? opts.seed
             : group === "gamma" ? [[1], [-1]] : [[]];
    if (group === "gamma") seed = seed.filter(w => w.length % 2 === 1);
    if (!seed.length) seed = group === "gamma" ? [[1], [-1]] : [[]];
    let faces = facesOf(seed, rr, ri, false);
    let complete = false;
    for (let round = 0; round < 40; round++) {
      const have = new Set(faces.map(f => key(f.word)));
      const cand = faces.map(f => f.word);
      for (const f of faces) for (const g of faces) for (const k of JOIN) {
        if (f.word.length + g.word.length + 1 > LCAP) continue;
        const w = f.word.concat([k], g.word), s = key(w);
        if (!have.has(s)) { have.add(s); cand.push(w); }
      }
      const nf = facesOf(cand, rr, ri, false);
      const old = new Set(faces.map(f => key(f.word)));
      const same = nf.length === faces.length && nf.every(f => old.has(key(f.word)));
      faces = nf;
      if (same) { complete = true; break; }
      if (faces.length > FCAP) break;
    }
    if (opts.polys) faces = facesOf(faces.map(f => f.word), rr, ri, true);
    return { faces, complete };
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
    return (x, y) => {
      if (Math.abs(x) >= 4 || Math.abs(y) >= 2.05) return false;
      let ins = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
      }
      return ins;
    };
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
                PALETTES, paletteColor };
  return api;
}
/* a factory, so a page can rebuild the module inside a Blob worker from
   fordCoreFactory.toString() -- that works from file:// too.                 */
if (typeof module !== "undefined" && module.exports) module.exports = fordCoreFactory();
else self.FordCore = fordCoreFactory();
