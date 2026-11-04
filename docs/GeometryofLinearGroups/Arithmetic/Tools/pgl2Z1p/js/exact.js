// Exact arithmetic for Γ = PGL₂(ℤ[1/p]) acting on H² × T_{p+1}.
//
// Everything here is BigInt-exact. Matrices are plain objects {a, b, c, d}.
// Tree vertices use the upper-half-plane model of the thesis (Prop. 17):
//   ⌊q⌋_n = [[pⁿ, q], [0, 1]]·o,  n ∈ ℤ,  q ∈ ℤ[1/p] / pⁿℤ,
// stored canonically with 0 ≤ q < pⁿ.

// ---------------------------------------------------------------- integers

const ZERO = 0n, ONE = 1n;
export const babs = (a) => (a < ZERO ? -a : a);

export function gcd(a, b) {
  a = babs(a); b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// floor(a / b) for BigInts of any sign
export function floorDiv(a, b) {
  const q = a / b;
  return (a % b !== ZERO && (a < ZERO) !== (b < ZERO)) ? q - ONE : q;
}

// a mod m in [0, m), m > 0
export function bmod(a, m) {
  const r = a % m;
  return r < ZERO ? r + m : r;
}

export function modInverse(a, m) {
  let [r0, r1] = [bmod(a, m), m];
  let [s0, s1] = [ONE, ZERO];
  while (r1) {
    const q = r0 / r1;
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== ONE) throw new Error(`${a} is not invertible mod ${m}`);
  return bmod(s0, m);
}

export const bpow = (p, e) => {
  let r = ONE, b = BigInt(p);
  for (let i = 0; i < e; i++) r *= b;
  return r;
};

// p-adic valuation of a nonzero BigInt
export function vInt(x, p) {
  if (x === ZERO) return Infinity;
  const P = BigInt(p);
  let v = 0;
  x = babs(x);
  while (x % P === ZERO) { x /= P; v++; }
  return v;
}

// ---------------------------------------------------------------- rationals

export class Q {
  constructor(num, den = ONE) {
    if (den === ZERO) throw new Error("division by zero");
    if (den < ZERO) { num = -num; den = -den; }
    const g = gcd(num, den) || ONE;
    this.n = num / g;
    this.d = den / g;
  }
  static of(x) {
    if (x instanceof Q) return x;
    if (typeof x === "bigint") return new Q(x);
    if (typeof x === "number") {
      if (!Number.isInteger(x)) throw new Error(`non-integer number ${x}`);
      return new Q(BigInt(x));
    }
    return Q.parse(String(x));
  }
  static parse(s) {
    s = s.replace(/\s+/g, "").replace(/−/g, "-");
    if (!s) throw new Error("empty entry");
    const m = s.match(/^([+-]?\d+)(?:\/(\d+))?$/);
    if (!m) throw new Error(`cannot read “${s}” as a rational number`);
    return new Q(BigInt(m[1]), m[2] ? BigInt(m[2]) : ONE);
  }
  add(o) { o = Q.of(o); return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = Q.of(o); return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = Q.of(o); return new Q(this.n * o.n, this.d * o.d); }
  div(o) { o = Q.of(o); return new Q(this.n * o.d, this.d * o.n); }
  neg() { return new Q(-this.n, this.d); }
  isZero() { return this.n === ZERO; }
  eq(o) { o = Q.of(o); return this.n === o.n && this.d === o.d; }
  cmp(o) { o = Q.of(o); const x = this.n * o.d - o.n * this.d; return x < ZERO ? -1 : x > ZERO ? 1 : 0; }
  v(p) { return this.n === ZERO ? Infinity : vInt(this.n, p) - vInt(this.d, p); }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === ONE ? `${this.n}` : `${this.n}/${this.d}`; }
  toTeX() {
    if (this.d === ONE) return `${this.n}`;
    const s = this.n < ZERO ? "-" : "";
    return `${s}\\tfrac{${babs(this.n)}}{${this.d}}`;
  }
}

// p^e as a rational, any integer e
export function qpow(p, e) {
  return e >= 0 ? new Q(bpow(p, e)) : new Q(ONE, bpow(p, -e));
}

// ---------------------------------------------------------------- matrices

export const M = (a, b, c, d) => ({ a: Q.of(a), b: Q.of(b), c: Q.of(c), d: Q.of(d) });

export function mmul(x, y) {
  return {
    a: x.a.mul(y.a).add(x.b.mul(y.c)), b: x.a.mul(y.b).add(x.b.mul(y.d)),
    c: x.c.mul(y.a).add(x.d.mul(y.c)), d: x.c.mul(y.b).add(x.d.mul(y.d)),
  };
}
export const mdet = (x) => x.a.mul(x.d).sub(x.b.mul(x.c));
// projective inverse (adjugate)
export const minv = (x) => ({ a: x.d, b: x.b.neg(), c: x.c.neg(), d: x.a });
export const mprod = (...ms) => ms.reduce((acc, m) => mmul(acc, m), M(1, 0, 0, 1));

// Integral representative with coprime entries, normalised so c > 0, or c = 0 and d > 0.
// Returned entries are BigInts.
export function primitive(x) {
  const ents = [x.a, x.b, x.c, x.d];
  let L = ONE;
  for (const e of ents) L = L / gcd(L, e.d) * e.d;
  let ints = ents.map((e) => e.n * (L / e.d));
  let g = ZERO;
  for (const e of ints) g = gcd(g, e);
  if (g === ZERO) throw new Error("zero matrix");
  ints = ints.map((e) => e / g);
  let [a, b, c, d] = ints;
  if (c < ZERO || (c === ZERO && d < ZERO)) { a = -a; b = -b; c = -c; d = -d; }
  return { a, b, c, d };
}
export const toQ = (m) => ({ a: new Q(m.a), b: new Q(m.b), c: new Q(m.c), d: new Q(m.d) });
export const bdet = (m) => m.a * m.d - m.b * m.c;

export function projEqual(x, y) {
  const P = primitive(x), R = primitive(y);
  return P.a === R.a && P.b === R.b && P.c === R.c && P.d === R.d;
}

// Is x in PGL₂(ℤ[1/p])?  Returns e = v_p(det) of the primitive integral rep, or throws.
export function checkInGamma(x, p) {
  const P = primitive(x);
  const D = bdet(P);
  if (D === ZERO) throw new Error("The matrix is singular.");
  const e = vInt(D, p);
  if (babs(D) !== bpow(p, e)) {
    throw new Error(`This is not in $\\PGL_2(\\Z[1/${p}])$: its primitive integral representative has determinant $${D}$, which is not $\\pm ${p}^e$.`);
  }
  return { P, e, det: D };
}

// ---------------------------------------------------------------- generators

export function generators(p) {
  return {
    t: M(p, 0, 0, 1),            // t_p
    T: M(1, 1, 0, 1),
    S: M(0, 1, -1, 0),
    R: M(-1, 0, 0, 1),
    J: M(0, 1, 1, 0),            // σ, the flip z ↦ 1/z̄
    W: M(0, 1, p, 0),            // Fricke / Atkin–Lehner W_p = σt
  };
}
export function power(m, k) {
  let base = k < 0 ? minv(m) : m;
  let r = M(1, 0, 0, 1);
  for (let i = 0; i < Math.abs(k); i++) r = mmul(r, base);
  return r;
}

// Parse words like  "t^-2 T t S T^3 t",  "σ t σ",  "W T^{-1}"
export function parseWord(src, p) {
  const G = generators(p);
  const s = src.replace(/σ/g, "J").replace(/⁻¹/g, "^-1").replace(/[·*]/g, " ").replace(/−/g, "-");
  const re = /\s*([tTSRJWw])\s*(?:\^\s*\{?\s*\(?\s*([+-]?\d+)\s*\)?\s*\}?)?/y;
  const letters = [];
  let pos = 0;
  while (pos < s.length) {
    if (/^\s*$/.test(s.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) throw new Error(`cannot read the word near “${s.slice(pos, pos + 8)}” (letters: t, T, S, R, σ or J, W)`);
    const L = m[1] === "w" ? "W" : m[1];
    const k = m[2] === undefined ? 1 : parseInt(m[2], 10);
    if (k !== 0) letters.push({ L, k });
    pos = re.lastIndex;
  }
  let mat = M(1, 0, 0, 1);
  for (const { L, k } of letters) mat = mmul(mat, power(G[L], k));
  return { letters, matrix: mat };
}

export function randomWord(len, rng = Math.random) {
  const pool = ["t", "t^-1", "T", "T^-1", "S", "R", "T^2", "t"];
  const out = [];
  for (let i = 0; i < len; i++) out.push(pool[Math.floor(rng() * pool.length)]);
  return out.join(" ");
}

// ---------------------------------------------------------------- tree vertices

export class Vertex {
  constructor(p, q, n) { this.p = p; this.q = q; this.n = n; }
  get key() { return `${this.n}|${this.q}`; }
  matrix() { return { a: qpow(this.p, this.n), b: this.q, c: new Q(ZERO), d: new Q(ONE) }; }
  parent() { return canonVertex(this.p, this.q, this.n - 1); }
  child(j) { return new Vertex(this.p, this.q.add(qpow(this.p, this.n).mul(BigInt(j))), this.n + 1); }
  children() { return Array.from({ length: this.p }, (_, j) => this.child(j)); }
  neighbors() { return [this.parent(), ...this.children()]; }
  eq(o) { return this.n === o.n && this.q.eq(o.q); }
  // which child of its parent this vertex is: the digit of q at p^{n-1}
  digit() {
    const par = this.parent();
    const x = this.q.sub(par.q).div(qpow(this.p, this.n - 1));
    return Number(x.n);
  }
}

export const origin = (p) => new Vertex(p, new Q(ZERO), 0);

// Reduce q ∈ ℚ modulo pⁿℤ_p to the unique representative in [0, pⁿ) ∩ ℤ[1/p].
// (Two rationals name the same vertex iff they differ by an element of pⁿℤ_p.)
export function canonVertex(p, q, n) {
  q = Q.of(q);
  if (q.isZero()) return new Vertex(p, new Q(ZERO), n);
  const t = q.v(p);
  if (t >= n) return new Vertex(p, new Q(ZERO), n);
  // q = p^t · u / w with u, w prime to p
  const P = BigInt(p);
  let u = q.n, w = q.d;
  while (u % P === ZERO) u /= P;
  while (w % P === ZERO) w /= P;
  const mod = bpow(p, n - t);
  const r = bmod(u * modInverse(w, mod), mod);
  return new Vertex(p, new Q(r).mul(qpow(p, t)), n);
}

// Prop. 17: the vertex g·o for g ∈ PGL₂(ℚ_p) with rational entries.
export function vertexOf(g, p) {
  let { a, b, c, d } = g;
  if (c.v(p) < d.v(p)) [a, b, c, d] = [b, a, d, c];   // Step 1: swap columns
  const n = mdet({ a, b, c, d }).v(p) - 2 * d.v(p);    // Steps 2–4
  return canonVertex(p, b.div(d), n);                  // Step 5
}

// Prop. 18 (thesis): g·⌊q⌋_n, computed as the vertex of g·[[pⁿ, q],[0,1]].
export function act(g, v) { return vertexOf(mmul(g, v.matrix()), v.p); }

export function treeDistance(v, w) {
  const diff = v.q.sub(w.q);
  const vq = diff.isZero() ? Infinity : diff.v(v.p);
  const meet = Math.min(v.n, w.n, vq);
  return v.n + w.n - 2 * meet;
}

// The geodesic from o to v = ⌊q⌋_n in the upper-half-plane model:
// m steps up to the meet ⌊0⌋_{-m}, then k steps down with base-p digits j_1 … j_k.
export function geodesicFromOrigin(v) {
  const p = v.p;
  const vq = v.q.isZero() ? Infinity : v.q.v(p);
  const meet = Math.min(0, v.n, vq);
  const m = -meet, k = v.n - meet;
  // Q = q · p^{m} is an integer in [0, p^k)
  const Qint = v.q.mul(qpow(p, m));
  if (Qint.d !== ONE) throw new Error("internal: non-integral digit string");
  let x = Qint.n;
  const P = BigInt(p);
  const digits = [];
  for (let i = 0; i < k; i++) { digits.push(Number(x % P)); x /= P; }
  const verts = [origin(p)];
  let cur = origin(p);
  for (let i = 0; i < m; i++) { cur = cur.parent(); verts.push(cur); }
  for (const j of digits) { cur = cur.child(j); verts.push(cur); }
  return { m, k, digits, vertices: verts };
}

// ---------------------------------------------------------------- the normal form

// Normal form:  g = t^{-m} · (T^{j_1} t)(T^{j_2} t)⋯(T^{j_k} t) · λ,   λ ∈ PGL₂(ℤ),
// with 0 ≤ j_i < p and j_1 ≠ 0 when m, k > 0.  Computed by peeling one edge at a time:
// the column space of g mod p is the edge at o through which the geodesic [o, g·o] leaves.
export function normalForm(g, p) {
  const P = BigInt(p);
  const { P: start, e: e0 } = checkInGamma(g, p);
  let cur = start, e = e0;
  const steps = [];
  let vertex = origin(p);
  while (e > 0) {
    const mod = { a: bmod(cur.a, P), b: bmod(cur.b, P), c: bmod(cur.c, P), d: bmod(cur.d, P) };
    const col = (mod.a !== ZERO || mod.c !== ZERO) ? [mod.a, mod.c] : [mod.b, mod.d];
    const colIndex = (mod.a !== ZERO || mod.c !== ZERO) ? 0 : 1;
    let step;
    if (col[1] === ZERO) {
      // line [1:0]: bottom row ≡ 0.  g = t^{-1}·(t g),  t g = p·(row₁ ; row₂/p)
      if (cur.c % P || cur.d % P) throw new Error("internal: bottom row not divisible by p");
      const next = { a: cur.a, b: cur.b, c: cur.c / P, d: cur.d / P };
      step = { kind: "up", j: null, line: [1, 0], letter: "t^{-1}", next };
    } else {
      // line [j:1]: row₁ ≡ j·row₂.  g = T^j t·(t^{-1}T^{-j} g),  t^{-1}T^{-j}g = p·((row₁−j·row₂)/p ; row₂)
      const j = bmod(col[0] * modInverse(col[1], P), P);
      const r1a = cur.a - j * cur.c, r1b = cur.b - j * cur.d;
      if (r1a % P || r1b % P) throw new Error("internal: row₁ − j·row₂ not divisible by p");
      const next = { a: r1a / P, b: r1b / P, c: cur.c, d: cur.d };
      step = { kind: "down", j: Number(j), line: [Number(j), 1], letter: `T^{${j}}t`, next };
    }
    const from = vertex;
    vertex = step.kind === "up" ? vertex.parent() : vertex.child(step.j);
    steps.push({ ...step, before: cur, mod, colIndex, e, from, to: vertex });
    cur = normalizeSign(step.next);
    e -= 1;
  }
  const ups = steps.filter((s) => s.kind === "up").length;
  const downs = steps.length - ups;
  // sanity: all t^{-1}'s come first (the geodesic goes up, then down)
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].kind === "up" && steps[i - 1].kind === "down") throw new Error("internal: up after down");
  }
  return {
    p, input: start, e: e0, steps, lambda: normalizeSign(cur), target: vertex,
    m: ups, k: downs, digits: steps.filter((s) => s.kind === "down").map((s) => s.j),
  };
}

export function normalizeSign(m) {
  let { a, b, c, d } = m;
  if (c < ZERO || (c === ZERO && d < ZERO)) { a = -a; b = -b; c = -c; d = -d; }
  return { a, b, c, d };
}

// Rebuild g from its normal form (used in tests and in the page's final check)
export function evalNormalForm(nf) {
  const G = generators(nf.p);
  let m = M(1, 0, 0, 1);
  for (const s of nf.steps) {
    m = s.kind === "up" ? mmul(m, minv(G.t)) : mprod(m, power(G.T, s.j), G.t);
  }
  return mmul(m, toQ(nf.lambda));
}

// λ ∈ PGL₂(ℤ) as a word T^{k₁} S T^{k₂} S ⋯ T^{x} [R] by the (nearest-integer) Euclidean algorithm on the first column
export function lambdaWord(lam) {
  let { a, b, c, d } = lam;
  const word = [];
  let guard = 0;
  while (c !== ZERO) {
    if (guard++ > 2000) throw new Error(`internal: Euclid did not terminate on ${lam.a} ${lam.b} ${lam.c} ${lam.d}`);
    // nearest-integer quotient, so |c| at least halves each round
    const s = c < ZERO ? -ONE : ONE;
    const k = floorDiv(2n * a * s + babs(c), 2n * babs(c));
    if (k !== ZERO) word.push({ L: "T", k: Number(k) });
    word.push({ L: "S", k: 1 });
    [a, b, c, d] = [-c, -d, a - k * c, b - k * d];
  }
  // (a b; 0 d) with a, d = ±1:  = T^{b/d} · (a/d ≠ 1 ? R : 1)
  const x = b / d;
  if (x !== ZERO) word.push({ L: "T", k: Number(x) });
  if (a !== d) word.push({ L: "R", k: 1 });
  return word;
}

export function wordMatrix(word, p) {
  const G = generators(p);
  return word.reduce((acc, { L, k }) => mmul(acc, power(G[L], k)), M(1, 0, 0, 1));
}

// ---------------------------------------------------------------- congruence subgroups

export const inLowerCongruence = (m, p) => m.c % BigInt(p) === ZERO;   // Λ₀(p)
export const inUpperCongruence = (m, p) => m.b % BigInt(p) === ZERO;   // Λ⁰(p)

// t g t^{-1} = [[a, p b], [c/p, d]]
export function conjugateByT(m, p) {
  const P = BigInt(p);
  if (m.c % P) throw new Error("not in Λ₀(p)");
  return { a: m.a, b: m.b * P, c: m.c / P, d: m.d };
}

export function randomLowerCongruence(p, len = 6, rng = Math.random) {
  const P = BigInt(p);
  const gens = [
    { a: 1n, b: 1n, c: 0n, d: 1n }, { a: 1n, b: -1n, c: 0n, d: 1n },
    { a: 1n, b: 0n, c: P, d: 1n }, { a: 1n, b: 0n, c: -P, d: 1n },
    { a: -1n, b: 0n, c: 0n, d: 1n },
  ];
  let m = { a: 1n, b: 0n, c: 0n, d: 1n };
  for (let i = 0; i < len; i++) {
    const g = gens[Math.floor(rng() * gens.length)];
    m = { a: m.a * g.a + m.b * g.c, b: m.a * g.b + m.b * g.d, c: m.c * g.a + m.d * g.c, d: m.c * g.b + m.d * g.d };
  }
  return normalizeSign(m);
}
