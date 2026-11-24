#!/usr/bin/env node
// Unit tests for Daily Math Atelier palette & math modules.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ATELIER = resolve(dirname(fileURLToPath(import.meta.url)), '../atelier');
const win = { DM: {} };

for (const file of ['palette.js', 'math-exact.js', 'math-linalg.js', 'math-complex.js']) {
  const src = readFileSync(join(ATELIER, file), 'utf8');
  new Function('window', 'globalThis', src)(win, win);
}

const { DM } = win;
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`\x1b[31m✗\x1b[0m ${name}`);
    console.error(' ', err.stack || err.message);
    process.exitCode = 1;
  }
}

/* ---------------- palette.js ---------------- */

test('palette: dual-mode text contrast >= 4.5:1 on both bg and bgAlt', () => {
  for (const mode of ['light', 'dark']) {
    const T = DM.THEMES[mode];
    for (const ground of [T.bg, T.bgAlt, T.surface]) {
      for (const fgKey of ['ink', 'ink2', 'muted']) {
        const cr = DM.contrastRatio(T[fgKey], ground);
        assert.ok(cr >= 4.5, `${mode} ${fgKey} on ${ground} contrast ${cr.toFixed(2)} < 4.5`);
      }
    }
  }
});

test('palette: mineral and luminous pigments maintain readable contrast', () => {
  for (const mode of ['light', 'dark']) {
    const T = DM.THEMES[mode];
    for (const key of ['cobalt', 'vermilion', 'verdigris', 'ochre', 'plum', 'slate']) {
      const cr = DM.contrastRatio(T[key], T.bg);
      assert.ok(cr >= 4.0, `${mode} ${key} on bg contrast ${cr.toFixed(2)} < 4.0`);
    }
  }
});

test('palette: OKLab mix endpoints and ramps work in both modes', () => {
  const a = DM.mix('#1f4e96', '#b83b28', 0);
  const b = DM.mix('#1f4e96', '#b83b28', 1);
  assert.deepEqual(a, [31, 78, 150]);
  assert.deepEqual(b, [184, 59, 40]);
  const mid = DM.mix('#1f4e96', '#b83b28', 0.5);
  assert.equal(mid.length, 3);
  for (const mode of ['light', 'dark']) {
    for (const name of ['mineral', 'thermal', 'phase', 'diverge']) {
      const c0 = DM.ramp(0, name, mode);
      const c1 = DM.ramp(0.73, name, mode);
      assert.equal(c0.length, 3);
      assert.equal(c1.length, 3);
    }
  }
});

/* ---------------- math-exact.js ---------------- */

test('exact: gcd, lcm, egcd Bezout identity, factor, divisors', () => {
  const { gcd, lcm, egcd, isPrime, factor, divisors } = DM.ex;
  assert.equal(gcd(1071n, 462n), 21n);
  assert.equal(lcm(21n, 6n), 42n);
  const { g, x, y } = egcd(240n, 46n);
  assert.equal(g, 2n);
  assert.equal(240n * x + 46n * y, g);
  assert.equal(isPrime(104729n), true);
  assert.equal(isPrime(104727n), false);
  const facs = factor(360n);
  const prod = facs.reduce((acc, [p, e]) => acc * (p ** BigInt(e)), 1n);
  assert.equal(prod, 360n);
  assert.equal(divisors(12n).length, 6);
});

test('exact: rationals Q arithmetic & continued fractions', () => {
  const { Q, ex } = DM;
  const a = Q.of(2, 6), b = Q.of(1, 2);
  assert.equal(Q.toString(Q.add(a, b)), '5/6');
  assert.equal(Q.toString(Q.sub(a, b)), '-1/6');
  assert.equal(Q.toString(Q.mul(a, b)), '1/6');
  assert.equal(Q.toString(Q.div(a, b)), '2/3');
  assert.equal(Q.toTex(Q.of(-3, 4)), '-\\frac{3}{4}');

  const cf = ex.cfrac(355, 113);
  assert.deepEqual(cf, [3, 7, 16]);
  const conv = ex.convergents(cf);
  assert.equal(Q.toString(conv[conv.length - 1]), '355/113');

  const fibConv = ex.convergents([1, 1, 1, 1, 1, 1, 1]);
  assert.equal(Q.toString(fibConv[fibConv.length - 1]), '21/13');
});

test('exact: SL2(Z) mat2 and Gaussian integer Zi gcd', () => {
  const { mat2 } = DM.ex;
  const S = mat2.of(0, -1, 1, 0);
  const T = mat2.of(1, 1, 0, 1);
  const ST = mat2.mul(S, T);
  assert.equal(mat2.det(ST), 1n);
  const inv = mat2.inv(ST);
  assert.deepEqual(mat2.mul(ST, inv), mat2.id());
  assert.deepEqual(mat2.pow(T, 5), mat2.of(1, 5, 0, 1));

  const g = DM.Zi.gcd(DM.Zi.of(11, 3), DM.Zi.of(1, 8));
  assert.equal(DM.Zi.norm(g) > 0n, true);
  // Check g divides 11+3i
  const q = DM.Zi.divRound(DM.Zi.of(11, 3), g);
  assert.equal(DM.Zi.eq(DM.Zi.mul(q, g), DM.Zi.of(11, 3)), true);
});

/* ---------------- math-linalg.js ---------------- */

test('linalg: det, inv, Gram-Schmidt, Jacobi, Cholesky, orderOf', () => {
  const { la } = DM;
  const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
  const invA = la.inv(A);
  const prod = la.mul(A, invA);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(prod[i][j] - (i === j ? 1 : 0)) < 1e-12);
    }
  }
  assert.ok(Math.abs(la.det(A) - 43) < 1e-12);

  const gs = la.gramSchmidt([[1, 1, 0], [1, 0, 1], [0, 1, 1]]);
  assert.equal(gs.length, 3);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs(la.dot(gs[i], gs[j]) - (i === j ? 1 : 0)) < 1e-12);
    }
  }

  const eig = la.jacobi(A);
  for (let k = 0; k < 3; k++) {
    const Av = la.mv(A, eig.vectors[k]);
    const lv = la.scale(eig.vectors[k], eig.values[k]);
    assert.ok(la.norm(la.sub(Av, lv)) < 1e-11);
  }

  const L = la.cholesky(A);
  const rec = la.mul(L, la.transpose(L));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) assert.ok(Math.abs(rec[i][j] - A[i][j]) < 1e-12);
  }

  assert.equal(la.orderOf(la.rot2(Math.PI / 2)), 4);
});

/* ---------------- math-complex.js ---------------- */

test('complex: Euler identity, Mobius fixed points & classification, hyperbolic isometries', () => {
  const { cx, mob, hyp } = DM;
  const eipi = cx.exp([0, Math.PI]);
  assert.ok(cx.eq(cx.add(eipi, [1, 0]), [0, 0], 1e-12));

  const rot = mob.of([Math.cos(0.4), Math.sin(0.4)], [0, 0], [0, 0], [1, 0]);
  assert.equal(mob.kind(rot), 'elliptic');

  const hypMap = mob.of([2, 0], [0, 0], [0, 0], [0.5, 0]);
  assert.equal(mob.kind(hypMap), 'hyperbolic');

  const para = mob.of([1, 0], [2, 0], [0, 0], [1, 0]);
  assert.equal(mob.kind(para), 'parabolic');
  assert.equal(mob.fixedPoints(para).length, 1);

  const z = [0.3, 1.4];
  const back = hyp.toUHP(hyp.toDisk(z));
  assert.ok(cx.eq(z, back, 1e-12));

  const p1 = [0.2, 0.15], p2 = [-0.35, 0.4];
  const iso = hyp.diskIsometry([0.4, -0.2], 0.9);
  const dBefore = hyp.diskDist(p1, p2);
  const dAfter = hyp.diskDist(mob.apply(iso, p1), mob.apply(iso, p2));
  assert.ok(Math.abs(dBefore - dAfter) < 1e-11);
});

console.log(`\n${passed} atelier test suites passed.`);
