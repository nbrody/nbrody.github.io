#!/usr/bin/env node
// Unit tests for the kit's math modules (linalg, exact, complex, hyperbolic, plot ticks, colour).
//   node tools/test-kit.mjs
// Runs in plain Node: the modules are loaded into a sandbox with a minimal window stub.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const KIT = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit');
const sandbox = { location: { search: '' }, matchMedia: () => ({ matches: false }), URLSearchParams, console, BigInt, Math, Number };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['av.js', 'draw.js', 'plot.js', 'linalg.js', 'exact.js', 'complex.js', 'hyperbolic.js', 'space3d.js', 'gl.js']) {
  vm.runInContext(readFileSync(join(KIT, f), 'utf8'), sandbox, { filename: f });
}
const { AV } = sandbox;
const { la, ex, Q, cx, mob, hyp } = AV;

let pass = 0, fail = 0;
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
function t(name, cond, detail = '') {
  if (cond) pass++; else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + name + (detail ? ' — ' + detail : '')); }
}
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

/* linalg */
{
  const n = 6, A = la.zeros(n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) A[i][j] = A[j][i] = rnd();
  const eig = la.jacobi(A);
  t('jacobi: A v = λ v', eig.every(e => la.norm(la.sub(la.mulVec(A, e.vector), la.scale(e.vector, e.value))) < 1e-9));
  t('jacobi: sorted, orthonormal', eig.every((e, i) => !i || eig[i - 1].value >= e.value) &&
    eig.every((e, i) => eig.every((f, j) => near(la.dot(e.vector, f.vector), +(i === j)))));
  const B = A.map(r => r.map(x => x + 0.1));
  t('inv: B·B⁻¹ = I', la.maxAbsDiff(la.mul(B, la.inv(B)), la.eye(n)) < 1e-9);
  t('det: det(B)·det(B⁻¹) = 1', near(la.det(B) * la.det(la.inv(B)), 1, 1e-8));
  const G = la.mul(B, la.transpose(B));
  const L = la.cholesky(G);
  t('cholesky: L Lᵀ = G', la.maxAbsDiff(la.mul(L, la.transpose(L)), G) < 1e-9);
  const th = 2 * Math.PI / 7, Rot = [[Math.cos(th), -Math.sin(th)], [Math.sin(th), Math.cos(th)]];
  t('orderOf rotation by 2π/7 is 7', la.orderOf(Rot) === 7);
  t('pow: R⁷ = I', la.maxAbsDiff(la.pow(Rot, 7), la.eye(2)) < 1e-9);
  const F = la.gramSchmidt([[1, 1, 0], [1, 0, 1], [0, 1, 1]]);
  t('gramSchmidt orthonormal', F.every((u, i) => F.every((v, j) => near(la.dot(u, v), +(i === j)))));
  t('reflect is an involution fixing the mirror', la.norm(la.sub(la.reflect(la.reflect([1, 2, 3], [0, 1, 1]), [0, 1, 1]), [1, 2, 3])) < 1e-12 &&
    near(la.dot(la.reflect([1, 0, 0], [0, 1, 1]), [1, 0, 0]), 1));
  t('planeAngle of a plane with itself is 0', near(la.planeAngle([1, 0, 0], [0, 1, 0], [0, 1, 0], [-1, 0, 0]), 0, 1e-7));
  t('planeAngle of xy vs xz is π/2', near(la.planeAngle([1, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]), Math.PI / 2, 1e-7));
}

/* exact */
{
  t('gcd', ex.gcd(12, 18) === 6n && ex.gcd(-12n, 0) === 12n);
  const [g, x, y] = ex.egcd(240, 46);
  t('egcd Bézout', g === 2n && 240n * x + 46n * y === 2n);
  t('modPow', ex.modPow(3, 200, 1000003) === 3n ** 200n % 1000003n);
  t('isPrime', ex.isPrime(2n ** 61n - 1n) && !ex.isPrime(561) && ex.isPrime(1000003) && !ex.isPrime(1));
  const f = ex.factor(2n ** 32n + 1n);
  t('factor F₅ = 641·6700417', f.length === 2 && f[0][0] === 641n && f[1][0] === 6700417n, JSON.stringify(f.map(p => [String(p[0]), p[1]])));
  t('factor 360 = 2³·3²·5', JSON.stringify(ex.factor(360).map(([p, e]) => [Number(p), e])) === '[[2,3],[3,2],[5,1]]');
  t('σ(12) = 28, σ₂(6) = 50', ex.sigma(12) === 28n && ex.sigma(6, 2) === 50n);
  t('Q: 1/2 + 1/3 = 5/6', new Q(1, 2).add(new Q(1, 3)).eq(new Q(5, 6)));
  t('Q normalises sign', new Q(3, -6).toString() === '−1/2');
  t('Q.floor', new Q(-7, 2).floor() === -4n && new Q(7, 2).floor() === 3n);
  t('Q.fromNumber(0.375) = 3/8', Q.fromNumber(0.375).eq(new Q(3, 8)));
  t('contFrac(415/93) = [4;2,6,7]', ex.contFrac(new Q(415, 93)).join(',') === '4,2,6,7');
  const cv = ex.convergents([4, 2, 6, 7]);
  t('convergents end at 415/93', cv[cv.length - 1].eq(new Q(415, 93)) && cv[1].eq(new Q(9, 2)));
  t('contFrac(√2) = [1;2,2,…]', ex.contFrac(Math.SQRT2, 6).join(',') === '1,2,2,2,2,2');
  t('|F₅| = 11', ex.farey(5).length === 11 && ex.farey(5)[1].eq(new Q(1, 5)));
  t('Stern–Brocot 3/5 = LRL', ex.sternBrocot(new Q(3, 5)) === 'LRL');
  const { m2 } = ex, S = m2.of(0, -1, 1, 0), T = m2.of(1, 1, 0, 1);
  t('(ST)³ = −I in SL₂(ℤ)', m2.eq(m2.pow(m2.mul(S, T), 3), m2.of(-1, 0, 0, -1)));
  t('T·(1/2) = 3/2, S·0 = ∞', m2.act(T, new Q(1, 2)).eq(new Q(3, 2)) && m2.act(S, new Q(0)) === null);
}

/* complex + Möbius */
{
  const a = [1.5, -2], b = [0.3, 0.7];
  t('cx: (a·b)/b = a', cx.eq(cx.div(cx.mul(a, b), b), a));
  t('cx: exp(log z) = z', cx.eq(cx.exp(cx.log(a)), a));
  t('cx: sqrt(z)² = z', cx.eq(cx.mul(cx.sqrt(a), cx.sqrt(a)), a));
  const M = mob.of([2, 1], [0, -1], [1, 1], [3, 0]), N = mob.of([1, 0], [2, 0], [0, 1], [1, 1]);
  const z = [0.4, 0.9];
  t('mob: (MN)z = M(Nz)', cx.eq(mob.apply(mob.mul(M, N), z), mob.apply(M, mob.apply(N, z))));
  t('mob: M⁻¹Mz = z', cx.eq(mob.apply(mob.inv(M), mob.apply(M, z)), z));
  t('mob: fixed points are fixed', mob.fixed(M).every(p => cx.eq(mob.apply(M, p), p, 1e-8)));
  t('mob: ∞ handling', mob.apply(mob.of(1, 0, 1, 0), [0, 0]) === null && cx.eq(mob.apply(mob.of(2, 0, 1, 1), null), [2, 0]));
  t('mob.kind', mob.kind(mob.of(2, 0, 0, 0.5)) === 'hyperbolic' && mob.kind(mob.of(1, 1, 0, 1)) === 'parabolic' &&
    mob.kind(mob.of(Math.cos(1), -Math.sin(1), Math.sin(1), Math.cos(1))) === 'elliptic' &&
    mob.kind(mob.of([2, 1], 0, 0, cx.inv([2, 1]))) === 'loxodromic' && mob.kind(mob.of(3, 0, 0, 3)) === 'identity');
  const c1 = mob.circle(mob.of(2, 1, 0, 1), { center: [0, 0], r: 1 });
  t('mob.circle: z ↦ 2z+1 sends S¹ to |z−1| = 2', cx.eq(c1.center, [1, 0]) && near(c1.r, 2));
  const c2 = mob.circle(mob.of(0, 1, 1, 0), { center: [1, 0], r: 1 });
  t('mob.circle: 1/z sends |z−1| = 1 to the line Re z = 1/2', !!c2.p && near(c2.p[0], 0.5) && near(c2.q[0], 0.5));
}

/* hyperbolic */
{
  t('diskDist(0, t) = 2 artanh t', near(hyp.diskDist([0, 0], [0.6, 0]), 2 * Math.atanh(0.6)));
  t('Cayley: i ↦ 0, round trip', cx.eq(hyp.toDisk([0, 1]), [0, 0]) && cx.eq(hyp.toUHP(hyp.toDisk([0.7, 2.1])), [0.7, 2.1]));
  t('uhpDist matches diskDist under Cayley', near(hyp.uhpDist([0.2, 1], [1.4, 0.5]), hyp.diskDist(hyp.toDisk([0.2, 1]), hyp.toDisk([1.4, 0.5])), 1e-9));
  const p = [0.3, 0.4], q = [-0.5, 0.2];
  const g = hyp.diskGeodesic(p, q);
  t('disk geodesic ⟂ unit circle and through p, q', near(cx.abs2(g.center), g.r * g.r + 1) && near(cx.abs(cx.sub(g.center, p)), g.r) && near(cx.abs(cx.sub(g.center, q)), g.r));
  t('disk geodesic through ideal points', (() => { const h = hyp.diskGeodesic([1, 0], [0, 1]); return cx.eq(h.center, [1, 1]) && near(h.r, 1); })());
  const u = hyp.uhpGeodesic([0, 1], [2, 1]);
  t('uhp geodesic centre on ℝ', cx.eq(u.center, [1, 0]) && near(u.r, Math.SQRT2));
  t('uhp geodesics to and from ∞ keep their orientation', (() => { const a = hyp.uhpGeodesic([1, 1], null).line, b = hyp.uhpGeodesic(null, [1, 1]).line; return a[1] === null && b[0] === null && cx.eq(a[0], [1, 1]) && cx.eq(b[1], [1, 1]); })());
  const A = hyp.diskMove([0.3, -0.2], 0.7);
  t('diskMove sends a to 0', cx.eq(mob.apply(A, [0.3, -0.2]), [0, 0]));
  t('diskMove is an isometry', near(hyp.diskDist(mob.apply(A, p), mob.apply(A, q)), hyp.diskDist(p, q), 1e-9));
  const circ = hyp.diskCircle(p, 0.8);
  const onC = [0, 1, 2, 3].map(k => cx.add(circ.center, cx.polar(circ.r, k)));
  t('diskCircle: points at distance ρ', onC.every(z => near(hyp.diskDist(z, p), 0.8, 1e-9)));
}

/* plot + colour */
{
  t('ticks(0,1,5)', AV.ticks(0, 1, 5).map(x => +x.toFixed(6)).join(',') === '0,0.2,0.4,0.6,0.8,1');
  t('ramp endpoints are the ramp stops', AV.ramp(0).every((v, i) => Math.abs(v - AV.hexRgb('#5a63e8')[i]) < 1.5) && AV.ramp(1).every((v, i) => Math.abs(v - AV.hexRgb('#ff7a93')[i]) < 1.5));
  t('fmt uses a true minus and trims', AV.fmt(-1.5) === '−1.5' && AV.fmt(2.000) === '2' && AV.int(1234567) === '1 234 567');
  t('sub/sup digits', AV.sub(12) === '₁₂' && AV.sup(-3) === '⁻³');
}

/* space3d */
{
  const cam = AV.orbit3d({ yaw: 0, pitch: 0, ortho: true }).fit({ x: 0, y: 0, w: 200, h: 200 }, 1);
  const [sx, sy] = cam.project([0, 0, 0]);
  const [ux, uy] = cam.project([0, 1, 0]);
  t('orbit3d: origin at centre, +y is up', near(sx, 100) && near(sy, 100) && uy < sy && near(ux, 100));
}

console.log(fail ? `\x1b[31m${fail} failed\x1b[0m, ${pass} passed` : `\x1b[32mall ${pass} kit tests passed\x1b[0m`);
process.exit(fail ? 1 : 0);
