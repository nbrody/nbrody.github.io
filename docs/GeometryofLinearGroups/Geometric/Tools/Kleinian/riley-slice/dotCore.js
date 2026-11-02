/* dotCore.js -- the dots of the Riley slice: the roots of Phi_{p/q} + 2.

   Phi_{p/q} has degree q and its roots all lie in |rho| <= 4 (the group is
   free and discrete outside, with no accidental parabolics).  Aberth-Ehrlich
   iteration from seeds on circles, with Phi and Phi' from the Stern-Brocot
   recursion: never from the expanded coefficients, which reach 1e25 by
   q = 64.  Three guards make it converge for every slope to q = 128 (all
   430318 roots, none twice, Newton distance <= 5e-13):
     - P/P' is formed after scaling by |P'|, which passes 1e154 at the seeds
       of slopes near 0/1 and 1/1 (their Stern-Brocot paths are long);
     - a step is capped at length 1 and an iterate kept in |rho| <= 6, so none
       is thrown out to where Phi overflows -- its NaN would reach every other
       root through the Aberth sums;
     - a root stops moving once its NEWTON step is below 1e-14 |rho| (not its
       Aberth step: two iterates crowding each other make that tiny anywhere).
   The page runs this in a few workers, built from this function's source.  */

function dotCoreFactory() {
  "use strict";
  const OUT = [0, 0, 0, 0];
  function phiRec(pth, zr, zi) {
    let ar = 2 - zr, ai = -zi, br = 2 + zr, bi = zi, cr = 2, ci = 0;
    let dar = -1, dai = 0, dbr = 1, dbi = 0, dcr = 0, dci = 0;
    let mr = 0, mi = 0, dmr = 0, dmi = 0;
    for (let k = -1; k < pth.length; k++) {
      if (k >= 0) {
        if (pth[k] === 0) { cr = br; ci = bi; dcr = dbr; dci = dbi; br = mr; bi = mi; dbr = dmr; dbi = dmi; }
        else { cr = ar; ci = ai; dcr = dar; dci = dai; ar = mr; ai = mi; dar = dmr; dai = dmi; }
      }
      const pr = ar * br - ai * bi, pi = ar * bi + ai * br;
      mr = 8 - pr - cr; mi = -pi - ci;
      const t1r = dar * br - dai * bi, t1i = dar * bi + dai * br;
      const t2r = ar * dbr - ai * dbi, t2i = ar * dbi + ai * dbr;
      dmr = -(t1r + t2r) - dcr; dmi = -(t1i + t2i) - dci;
    }
    OUT[0] = mr; OUT[1] = mi; OUT[2] = dmr; OUT[3] = dmi;
    return OUT;
  }
  function sbPath(p, q) {
    const path = [];
    let a0 = 0, a1 = 1, b0 = 1, b1 = 1;
    for (;;) {
      const m0 = a0 + b0, m1 = a1 + b1;
      if (m0 * q === p * m1) return path;
      if (p * m1 < m0 * q) { path.push(0); b0 = m0; b1 = m1; } else { path.push(1); a0 = m0; a1 = m1; }
    }
  }
  /* roots of Phi_{p/q} + 2, a polynomial of degree q whose roots lie in |rho| <= 4;
     a root stops moving once its Aberth step is below 1e-14 |z| (frozen roots
     still enter the others' sums), so a cluster that will not converge in
     double precision costs O(q) per sweep, not O(q^2)                       */
  function roots(p, q, maxIter = 400) {
    if (q === 1) return { xy: new Float64Array([p === 0 ? 4 : -4, 0]), failed: 0 };
    const pth = sbPath(p, q), n = q, R = 4.4;
    const zr = new Float64Array(n), zi = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const th = 2 * Math.PI * k / n + 0.43, rad = R * (0.6 + 0.4 * (k % 3) / 2);
      zr[k] = rad * Math.cos(th); zi[k] = rad * Math.sin(th);
    }
    const last = new Float64Array(n).fill(1), done = new Uint8Array(n);
    let active = n;
    for (let iter = 0; iter < maxIter && active; iter++) {
      for (let k = 0; k < n; k++) {
        if (done[k]) continue;
        const e = phiRec(pth, zr[k], zi[k]);
        // w = P/P', scaled first: |Phi'| passes 1e154 at the seeds of long-path slopes
        const sc = Math.max(Math.abs(e[2]), Math.abs(e[3])) || 1e-300;
        const pr = (e[0] + 2) / sc, pi = e[1] / sc, gr = e[2] / sc, gi = e[3] / sc;
        const gden = gr * gr + gi * gi || 1e-300;
        const wr = (pr * gr + pi * gi) / gden, wi = (pi * gr - pr * gi) / gden;
        let sr = 0, si = 0;
        const xk = zr[k], yk = zi[k];
        for (let j = 0; j < n; j++) if (j !== k) {
          const xr = xk - zr[j], xi = yk - zi[j];
          const m = xr * xr + xi * xi || 1e-300;
          sr += xr / m; si -= xi / m;
        }
        const qr = 1 - (wr * sr - wi * si), qi = -(wr * si + wi * sr);
        const qm = qr * qr + qi * qi || 1e-300;
        let cr = (wr * qr + wi * qi) / qm, ci = (wi * qr - wr * qi) / qm;
        // an iterate thrown far out overflows Phi, and its NaN would reach every
        // other root through the sums: cap the step, keep |z| <= 6
        const cl = Math.hypot(cr, ci);
        if (!(cl <= 1)) { if (!isFinite(cl)) { cr = 0.1; ci = 0.1; } else { cr /= cl; ci /= cl; } }
        zr[k] -= cr; zi[k] -= ci;
        const zl = Math.hypot(zr[k], zi[k]);
        if (zl > 6) { zr[k] *= 6 / zl; zi[k] *= 6 / zl; }
        // converged when the Newton step itself is negligible (two iterates
        // crowding each other also make the Aberth step tiny, far from a root)
        last[k] = Math.hypot(wr, wi);
        if (last[k] < 1e-14 * Math.max(1, Math.hypot(zr[k], zi[k]))) { done[k] = 1; active--; }
      }
    }
    const out = [];
    let failed = 0;
    for (let k = 0; k < n; k++) {
      if (last[k] < 1e-7 * Math.max(1, Math.hypot(zr[k], zi[k]))) {
        if (Math.abs(zr[k]) <= 4.005 && Math.abs(zi[k]) <= 2.01) out.push(zr[k], zi[k]);
      } else failed++;
    }
    return { xy: new Float64Array(out), failed };
  }
  return { roots, sbPath, phiRec };
}
if (typeof module !== "undefined" && module.exports) module.exports = dotCoreFactory;
