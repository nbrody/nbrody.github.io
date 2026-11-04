// node tests/fig-sphere.test.mjs — the math behind Figure 1 (Lemma 2.1, the expansion formula).
import * as F from '../js/fig-sphere.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; if (fails < 40) console.log('FAIL', m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const J = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1];
const matNear = (A, B, tol) => A.every((a, i) => near(a, B[i], tol));
const transpose = (A) => A.map((_, k) => A[4 * (k % 4) + Math.floor(k / 4)]);
const o = [0, 0, 0, 1];
const t0 = Date.now();

// the walls: unit spacelike normals, o inside, neighbours perpendicular, the rest disjoint
F.NORMALS.forEach((n, i) => {
  ok(near(F.mink(n, n), 1, 1e-12), `<n,n> = 1 (face ${i})`);
  ok(F.mink(o, n) < 0, `o inside wall ${i}`);
  let nb = 0;
  F.NORMALS.forEach((m, j) => {
    if (i === j) return;
    const c = F.mink(n, m);
    if (Math.abs(c) < 1e-9) nb++;
    else ok(Math.abs(c) >= 1 - 1e-12, `non-adjacent walls ${i},${j} do not meet (|<n,m>| = ${c})`);
  });
  ok(nb === 5, `face ${i} has 5 perpendicular neighbours (${nb})`);
});

// reflections are involutions in O(3,1), of determinant −1
F.REFLECTIONS.forEach((r, i) => {
  ok(matNear(F.matMul(r, r), F.identity4(), 1e-12), `r_${i}^2 = 1`);
  ok(matNear(F.matMul(transpose(r), F.matMul(J, r)), J, 1e-12), `r_${i} preserves the form`);
  ok(near(F.det4(r), -1, 1e-12), `det r_${i} = -1`);
  ok(F.mink(F.matVec(r, F.NORMALS[i]), F.NORMALS[i]) < 0, `r_${i} sends n_${i} to -n_${i}`);
});

// circumradius: the vertex in the direction of three perpendicular faces lies on them and inside D
{
  const U = F.faceDirections();
  let found = 0;
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
    const adj = (p, q) => Math.abs(F.mink(F.NORMALS[p], F.NORMALS[q])) < 1e-9;
    if (!(adj(a, b) && adj(a, c) && adj(b, c))) continue;
    const u = F.norm3([0, 1, 2].map((k) => U[a][k] + U[b][k] + U[c][k]));
    const V = F.rayPoint(u, F.CIRCUMRADIUS);
    ok([a, b, c].every((k) => Math.abs(F.mink(V, F.NORMALS[k])) < 1e-12), `vertex ${a},${b},${c} on its faces`);
    ok(F.insideD(V, 1e-12), `vertex ${a},${b},${c} in D`);
    found++;
  }
  ok(found === 20, `20 vertices (${found})`);
  ok(F.CIRCUMRADIUS > F.INRADIUS, 'circumradius > inradius');
}

// the 60 crossing points lie on two face circles each
{
  const C = F.crossingPoints(), U = F.faceDirections();
  ok(C.length === 60, '60 crossing points');
  for (const c of C) {
    const on = U.filter((u) => Math.abs(F.dot3(u, c) - F.TANH_IN) < 1e-12).length;
    ok(on === 2 && near(Math.hypot(...c), 1, 1e-12), 'crossing point on exactly two face circles');
  }
}

// fold: lands in D, is reduced (same length and element in any order), sign = parity
const rng = F.mulberry32(2026);
const xs = [];
for (let k = 0; k < 40; k++) xs.push(F.randomUnit(rng));
xs.push(...F.crossingPoints().slice(0, 6));
let maxLen = 0;
for (const x of xs) for (const t of [0.5, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const P = F.rayPoint(x, t);
  const A = F.fold(P), B = F.fold(P, { order: 'last' }), C = F.fold(P, { order: 'max' });
  ok(F.insideD(A.Q, 1e-9) && F.insideD(B.Q, 1e-9) && F.insideD(C.Q, 1e-9), `fold lands in D (t=${t})`);
  ok(near(F.mink(A.Q, A.Q), -1, 1e-8) && A.Q[3] > 0, 'folded point on the hyperboloid');
  ok(A.word.length === B.word.length && A.word.length === C.word.length, `reduced: same length in any order (${A.word.length}, ${B.word.length}, ${C.word.length})`);
  ok(matNear(A.h, B.h, 1e-7) && matNear(A.h, C.h, 1e-7), 'the same group element in any order');
  ok(matNear(F.matVec(A.h, P), A.Q, 1e-8), 'h P = Q');
  for (let i = 1; i < A.word.length; i++) if (A.word[i] === A.word[i - 1]) ok(false, 'no ss in a reduced word');
  ok(near(F.mink(F.matVec(A.h, P), F.matVec(A.h, P)), -1, 1e-8), 'h preserves the hyperboloid');
  const E = F.expansionAt(x, t);
  ok(Math.sign(E.det) === (E.word.length % 2 ? -1 : 1) && near(Math.abs(E.det), 1, 1e-6), `orientation sign = parity of |v| (|v| = ${E.word.length}, det = ${E.det})`);
  ok(matNear(F.matMul(E.v, E.h), F.identity4(), 1e-8), 'v = h^{-1}');
  ok(E.delta <= F.CIRCUMRADIUS + 1e-9, `delta = d(o, hP_t) <= circumradius (${E.delta})`);
  // v carries D to the tile containing P_t: v(Q) = P_t, and v o is that tile's centre
  ok(matNear(F.matVec(E.v, E.Q), P, 1e-8), 'v Q = P_t');
  maxLen = Math.max(maxLen, E.word.length);
}

// h acts on the sphere at infinity: null vectors to null vectors, |hξ| = 1, and the exact distortion identity
for (const x of xs.slice(0, 12)) for (const t of [2, 4, 6, 8]) {
  const { h } = F.expansionAt(x, t);
  for (let k = 0; k < 30; k++) {
    const y = F.randomUnit(rng), z = F.randomUnit(rng);
    const a = F.actOnBoundary(h, y), b = F.actOnBoundary(h, z);
    ok(a.time > 0 && Math.abs(a.null) <= 1e-9 * a.time * a.time, 'h(y,1) is null and future-pointing');
    ok(near(Math.hypot(...a.point), 1, 1e-10), 'h maps S^2 to S^2');
    const lhs = F.dist(a.point, b.point) ** 2, rhs = a.lambda * b.lambda * F.dist(y, z) ** 2;
    ok(near(lhs, rhs, 1e-7), `|hy-hz|^2 = lambda(y) lambda(z) |y-z|^2 (${lhs} vs ${rhs})`);
  }
}

// (2.2) and (2.3): the band holds for every x and t, over many pairs; and the sharper per-h band
let gMin = Infinity, gMax = -Infinity, gP = -Infinity, gPn = Infinity;
for (const x of xs) for (const t of [2, 3, 4, 5, 6, 7, 8]) {
  let z0;
  do { z0 = F.randomUnit(rng); } while (F.dist(x, z0) < F.EPS_STAR);
  const E = F.expansionAt(x, t);
  const S = F.expansionStats(x, t, z0, { E, n: 1500, seed: 11 + Math.round(t) });
  ok(S.ok22, `(2.2) band at t=${t}: [${S.min}, ${S.max}] in [${F.C_E}, ${F.C_E_UP}]`);
  ok(S.min >= 0.5 * Math.exp(-E.delta) - 1e-9 && S.max <= Math.exp(E.delta) + 1e-9, `sharper band [e^-d/2, e^d] (d=${E.delta}): [${S.min}, ${S.max}]`);
  ok(S.ok23, `(2.3) at t=${t}: max ${S.pMax} <= ${F.PUNCT_UP}, near min ${S.pNearMin} >= ${F.PUNCT_LO}`);
  ok(S.nNear > 100, 'enough samples near x');
  gMin = Math.min(gMin, S.min); gMax = Math.max(gMax, S.max); gP = Math.max(gP, S.pMax); gPn = Math.min(gPn, S.pNearMin);
}

// the image of B(x,R) is the cap capImage predicts: boundary to boundary, centre side inside
for (const x of xs.slice(0, 10)) for (const t of [2, 5, 8]) {
  const { h } = F.expansionAt(x, t), R = Math.exp(-t);
  const cap = F.capImage(h, F.ballN(x, R)), far = F.capImage(h, F.farN(x, F.EPS_STAR));
  for (let k = 0; k < 10; k++) {
    const u = F.randomUnit(rng), e = F.norm3(F.cross3(x, u));
    const yb = F.act(h, F.pointAt(x, e, R)), yi = F.act(h, F.pointAt(x, e, 0.5 * R));
    ok(near(F.dot3(yb, cap.center), cap.cosA, 1e-7), 'h(boundary of B(x,R)) on the image circle');
    ok(F.dot3(yi, cap.center) > cap.cosA, 'h(inside) inside the image cap');
    const yf = F.act(h, F.pointAt(x, e, 0.9));
    ok(F.dot3(yf, far.center) >= far.cosA - 1e-9, 'h(far point) inside the image of the far region');
  }
  ok(cap.radius > 0.35, `h B(x,R) is macroscopic (radius ${cap.radius.toFixed(3)} at t=${t})`);
}

ok(F.wordTex([3, 8, 1]) === 's_{4}s_{9}s_{2}', 'wordTex');
ok(F.wordTex([]) === 'e', 'wordTex of the identity');

console.log(`band over all cases: (2.2) [${gMin.toFixed(3)}, ${gMax.toFixed(3)}] ⊂ [${F.C_E.toFixed(3)}, ${F.C_E_UP.toFixed(3)}]; (2.3) max ${gP.toFixed(3)} ≤ ${F.PUNCT_UP.toFixed(3)}, near-min ${gPn.toFixed(3)} ≥ ${F.PUNCT_LO.toFixed(3)}; longest |v| = ${maxLen}`);
console.log(`${passes} passed, ${fails} failed (${Date.now() - t0} ms)`);
if (fails) process.exit(1);
