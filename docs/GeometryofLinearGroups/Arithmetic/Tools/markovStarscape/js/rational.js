'use strict';
// Exact rational arithmetic on {n: BigInt, d: BigInt > 0} with gcd(n,d)=1.

function bgcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

function frac(n, d = 1n) {
  if (d === 0n) throw new Error('division by zero');
  if (d < 0n) { n = -n; d = -d; }
  const g = bgcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

const F0 = frac(0n);
const F1 = frac(1n);
const F2 = frac(2n);

const Fadd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const Fsub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const Fmul = (a, b) => frac(a.n * b.n, a.d * b.d);
const Fdiv = (a, b) => frac(a.n * b.d, a.d * b.n);
const Fneg = (a) => ({ n: -a.n, d: a.d });
const Fabs = (a) => ({ n: a.n < 0n ? -a.n : a.n, d: a.d });
const Feq  = (a, b) => a.n === b.n && a.d === b.d;

function fnum(f) { return Number(f.n) / Number(f.d); }
function fheight(f) { const n = f.n < 0n ? -f.n : f.n; return n > f.d ? n : f.d; }
function fstr(f) { return f.d === 1n ? f.n.toString() : f.n + '/' + f.d; }
function ftex(f) {
  if (f.d === 1n) return f.n.toString();
  const s = f.n < 0n ? '-' : '';
  const a = f.n < 0n ? -f.n : f.n;
  return s + '\\tfrac{' + a + '}{' + f.d + '}';
}
// compare |a| vs |b|
function fcmpAbs(a, b) {
  const l = (a.n < 0n ? -a.n : a.n) * b.d;
  const r = (b.n < 0n ? -b.n : b.n) * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

function gcdInt(a, b) { while (b) { const t = a % b; a = b; b = t; } return a; }

// exact integer sqrt of a Number-integer (must be < 2^53); returns -1 if not a square
function isqrtExact(N) {
  if (N < 0) return -1;
  const s = Math.round(Math.sqrt(N));
  for (let c = s - 1; c <= s + 1; c++) if (c >= 0 && c * c === N) return c;
  return -1;
}
