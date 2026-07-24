/**
 * Smoke test: MathQuill-style exponents must parse as positive-degree polynomials.
 * Run: node test_parse_exponents.js
 */
const { parsePolynomial } = require('./numberRing.js');

function convertLatexToPolynomial(latex) {
  let poly = latex;
  poly = poly.replace(/x_\{(\d+)\}/g, 'x_$1');
  poly = poly.replace(/x_(\d+)/g, 'x_$1');
  poly = poly.replace(/\\cdot/g, '*');
  poly = poly.replace(/\\times/g, '*');
  poly = poly.replace(/\\left/g, '');
  poly = poly.replace(/\\right/g, '');
  poly = poly.replace(/\\/g, '');
  poly = poly.replace(/frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  poly = poly.replace(/\^\{([^}]+)\}/g, '**$1');
  poly = poly.replace(/\^([A-Za-z0-9_]+)/g, '**$1');
  poly = poly.replace(/\s+/g, ' ').trim();
  return poly;
}

function assertDegree(label, str, expectDeg) {
  const poly = parsePolynomial(str, 'x_1', 'Q');
  const deg = poly.degree();
  const ok = deg === expectDeg;
  console.log(`${ok ? 'OK' : 'FAIL'}: ${label} -> ${str} degree=${deg} (want ${expectDeg})`);
  return ok ? 0 : 1;
}

let failed = 0;
failed += assertDegree('MathQuill x_{1}^{2}-2', convertLatexToPolynomial('x_{1}^{2}-2'), 2);
failed += assertDegree('preset-style x_1^2 - 2', convertLatexToPolynomial('x_1^2 - 2'), 2);
failed += assertDegree('MathQuill x_{1}^{3}-2', convertLatexToPolynomial('x_{1}^{3}-2'), 3);
failed += assertDegree('legacy paren form x_1^(2)-2', 'x_1^(2)-2', 2);
failed += assertDegree('legacy paren via ** x_1**(4)+1', 'x_1**(4)+1', 4);

// Riley-style zero-avoidance unit check (mirrors setZFromEvent fix)
function cabs(a) { return Math.hypot(a[0], a[1]); }
function cscale(a, s) { return [a[0] * s, a[1] * s]; }
function avoidZero(z) {
  const az = cabs(z);
  if (az < 0.08) return az < 1e-12 ? [0.08, 0] : cscale(z, 0.08 / az);
  return z;
}
const z0 = avoidZero([0, 0]);
const zSmall = avoidZero([0.01, 0]);
const rileyOk = cabs(z0) >= 0.08 - 1e-12 && cabs(zSmall) >= 0.08 - 1e-12 && Number.isFinite(z0[0]);
console.log(`${rileyOk ? 'OK' : 'FAIL'}: Riley zero-avoidance z0=${z0} zSmall=${zSmall}`);
if (!rileyOk) failed++;

if (failed) {
  console.error(`\n${failed} failing assertion(s)`);
  process.exit(1);
}
console.log('\nAll critical parse/avoidance checks passed.');
