// Exact arithmetic in Coxeter's integral octonions (the "octavians" O ≅ E8).
//
// Model. Basis 1 = e0, e1, …, e7 with e_i e_{i+1} = e_{i+3} (indices 1..7 taken mod 7).
// An octavian x is stored by its DOUBLED coordinates d = 2x ∈ Z^8 (BigInt), so the
// half-integers that make O an E8 lattice are exact.  O = Z^8 + ½C, where C is the
// extended Hamming code below: d ∈ Z^8 is an octavian iff the set of odd entries of d
// is a codeword.  Of the 30 Hamming codes giving an E8 between Z^8 and ½Z^8, exactly 7
// are closed under this multiplication; we use the one containing (1+e1+e2+e4)/2, so the
// Hurwitz quaternions on ⟨1, e1, e2, e4⟩ sit inside O.

export const DIM = 8;

// Multiplication table on basis indices: MT[i][j] = [sign, k] with e_i e_j = sign·e_k.
const MT = (() => {
  const t = Array.from({ length: 8 }, () => new Array(8));
  const idx = (i) => ((i - 1) % 7 + 7) % 7 + 1;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    if (i === 0) t[i][j] = [1, j];
    else if (j === 0) t[i][j] = [1, i];
    else if (i === j) t[i][j] = [-1, 0];
  }
  for (let i = 1; i <= 7; i++) {
    const a = i, b = idx(i + 1), c = idx(i + 3);
    for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) {
      t[x][y] = [1, z];
      t[y][x] = [-1, z];
    }
  }
  return t;
})();
export const MULT_TABLE = MT;

// Weight-4 codewords containing coordinate 0; the code is these, their complements, ∅ and all.
export const CODE_WORDS_0 = [[0, 1, 2, 4], [0, 1, 3, 6], [0, 1, 5, 7], [0, 2, 3, 5], [0, 2, 6, 7], [0, 3, 4, 7], [0, 4, 5, 6]];
const CODE = (() => {
  const s = new Set([0, 255]);
  for (const w of CODE_WORDS_0) {
    let m = 0;
    for (const i of w) m |= 1 << i;
    s.add(m);
    s.add(255 ^ m);
  }
  return s;
})();

const B = (x) => BigInt(x);
export const abs = (x) => (x < 0n ? -x : x);
export function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function oddMask(d) {
  let m = 0;
  for (let i = 0; i < 8; i++) if (d[i] & 1n) m |= 1 << i;
  return m;
}
export const isValid = (d) => d.length === 8 && CODE.has(oddMask(d));

export const ZERO = Object.freeze([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
export const ONE = Object.freeze([2n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);

// e_i as an octavian (doubled coords).
export function basisUnit(i) {
  const d = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
  d[i] = 2n;
  return d;
}

// Raw product of two doubled-coordinate vectors: returns 4·(xy) when inputs are 2x, 2y.
function mulRaw(a, b) {
  const r = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
  for (let i = 0; i < 8; i++) {
    const ai = a[i];
    if (!ai) continue;
    for (let j = 0; j < 8; j++) {
      const bj = b[j];
      if (!bj) continue;
      const [s, k] = MT[i][j];
      if (s > 0) r[k] += ai * bj; else r[k] -= ai * bj;
    }
  }
  return r;
}

// Product of octavians (doubled coords in and out).
export function mul(a, b) {
  const r = mulRaw(a, b);
  for (let i = 0; i < 8; i++) {
    if (r[i] & 1n) throw new Error("octavian product left the order (bad input?)");
    r[i] /= 2n;
  }
  return r;
}
// Product of arbitrary rational octonions given as doubled coords (result may be non-integral):
// returns doubled coords as a pair [numerators, denominator] reduced to denominator 1 or 2.
export function mulAny(a, b) {
  return mulRaw(a, b); // = 4xy ; caller divides by 2 to get doubled coords of xy
}

export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const neg = (a) => a.map((x) => -x);
export const scale = (k, a) => a.map((x) => B(k) * x);
export const conj = (a) => a.map((x, i) => (i === 0 ? x : -x));
export const equals = (a, b) => a.every((x, i) => x === b[i]);
export const key = (a) => a.join(",");
export const isZero = (a) => a.every((x) => x === 0n);

// Norm N(x) = x x̄ = Σ x_i² = Σ d_i² / 4  (always an integer for octavians).
export function norm(a) {
  let s = 0n;
  for (const x of a) s += x * x;
  if (s % 4n) throw new Error("not an octavian (norm not integral)");
  return s / 4n;
}
// Trace tr(x) = x + x̄ = 2·Re(x) = d0.
export const trace = (a) => a[0];
// Bilinear form B(x,y) = N(x+y) − N(x) − N(y) = 2Re(x ȳ) = (d·e)/2.
export function polar(a, b) {
  let s = 0n;
  for (let i = 0; i < 8; i++) s += a[i] * b[i];
  return s / 2n;
}

// x / m if that is again an octavian, else null.
export function divInt(a, m) {
  m = B(m);
  const r = new Array(8);
  for (let i = 0; i < 8; i++) {
    if (a[i] % m) return null;
    r[i] = a[i] / m;
  }
  return isValid(r) ? r : null;
}
export const divisibleBy = (a, m) => divInt(a, m) !== null;

// Content c(x): the largest integer n with x ∈ nO.  (If g = gcd of doubled coords, the
// content is g when d/g is a valid octavian and g/2 otherwise.)
export function content(a) {
  let g = 0n;
  for (const x of a) g = gcd(g, x);
  if (g === 0n) return 0n;
  const q = a.map((x) => x / g);
  return isValid(q) ? g : g / 2n;
}
export const isPrimitive = (a) => content(a) === 1n;

// Rehm's primary normalization for odd norm: μ ≡ 1 (mod 2O) and μ > 0 (first nonzero coordinate positive).
export function isOneMod2(a) {
  const x = sub(a, ONE);
  return divInt(x, 2n) !== null;
}
export function lexPositive(a) {
  for (const x of a) if (x) return x > 0n;
  return false;
}
export const isPrimary = (a) => isOneMod2(a) && lexPositive(a);

// Lexicographic compare of doubled coordinates (used for deterministic choices).
export function lexCompare(a, b) {
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

// Associator [x,y,z] = (xy)z − x(yz).
export const associator = (x, y, z) => sub(mul(mul(x, y), z), mul(x, mul(y, z)));

// ---------------------------------------------------------------------------------------
// Formatting

const SUB = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇"];
export const UNIT_NAMES = ["1", "e₁", "e₂", "e₃", "e₄", "e₅", "e₆", "e₇"];

function linComb(coeffs, { ascii = false } = {}) {
  let s = "";
  for (let i = 0; i < 8; i++) {
    const c = coeffs[i];
    if (!c) continue;
    const name = ascii ? (i === 0 ? "" : "e" + i) : (i === 0 ? "" : "e" + SUB[i]);
    const mag = abs(c);
    const sign = c < 0n ? "−" : "+";
    let term;
    if (i === 0) term = mag.toString();
    else term = (mag === 1n ? "" : mag.toString()) + name;
    if (!s) s = (c < 0n ? "−" : "") + term;
    else s += " " + (ascii ? (c < 0n ? "-" : "+") : sign) + " " + term;
  }
  if (ascii) s = s.replace(/−/g, "-");
  return s || "0";
}

// Human-readable form: integral coordinates as a plain sum, half-integral ones as ½(…).
export function format(a, opts = {}) {
  if (oddMask(a) === 0) return linComb(a.map((x) => x / 2n), opts);
  const inner = linComb(a, opts);
  return (opts.ascii ? "(" + inner + ")/2" : "½(" + inner + ")");
}
export const formatAscii = (a) => format(a, { ascii: true });

// Coordinates as strings (halves shown as n/2).
export function coordStrings(a) {
  return a.map((d) => (d % 2n === 0n ? (d / 2n).toString() : d.toString() + "/2"));
}

// ---------------------------------------------------------------------------------------
// Parsing: expressions such as  "2 + e1 - 3e5",  "(1+e1+e2+e4)/2",  "½(1+e1+e2+e4)",
// "(1+e1)(1+e2)" (products evaluated left to right), or a list of 8 coordinates
// "1, 0, 1/2, …".  Rational arithmetic is exact; the result must be an octavian.

class Rat {
  constructor(n, d = 1n) {
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  add(o) { return new Rat(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o) { return new Rat(this.n * o.n, this.d * o.d); }
  neg() { return new Rat(-this.n, this.d); }
  inv() { if (!this.n) throw new Error("division by zero"); return new Rat(this.d, this.n); }
}
const R0 = new Rat(0n), R1 = new Rat(1n);
const rvec = () => Array.from({ length: 8 }, () => R0);

function rmul(x, y) {
  const r = rvec();
  for (let i = 0; i < 8; i++) {
    if (!x[i].n) continue;
    for (let j = 0; j < 8; j++) {
      if (!y[j].n) continue;
      const [s, k] = MT[i][j];
      const t = x[i].mul(y[j]);
      r[k] = r[k].add(s > 0 ? t : t.neg());
    }
  }
  return r;
}
const isScalar = (x) => x.slice(1).every((c) => !c.n);

function parseNumberToken(tok) {
  if (/^\d+\.\d+$/.test(tok)) {
    const [ip, fp] = tok.split(".");
    return new Rat(BigInt(ip + fp), 10n ** BigInt(fp.length));
  }
  return new Rat(BigInt(tok));
}

export function parse(str) { return fromRational(parseToRat(str)); }

// Rational octonion from an expression: doubled coordinates over a common denominator, {d, q}.
export function parseRational(str) {
  const v = parseToRat(str).map((c) => c.mul(new Rat(2n)));
  let q = 1n;
  for (const c of v) q = (q / gcd(q, c.d)) * c.d;
  return { d: v.map((c) => c.n * (q / c.d)), q };
}

function parseToRat(str) {
  const src = String(str).trim();
  if (!src) throw new Error("empty input");
  // Coordinate list?
  const listMatch = src.replace(/^[\[(]\s*|\s*[\])]$/g, "");
  const parts = listMatch.split(/[\s,;]+/).filter(Boolean);
  if (parts.length === 8 && parts.every((p) => /^[−-]?\d+(\/\d+|\.\d+)?$/.test(p))) {
    const coords = parts.map((p) => {
      p = p.replace("−", "-");
      if (p.includes("/")) { const [a, b] = p.split("/"); return new Rat(BigInt(a), BigInt(b)); }
      return parseNumberToken(p.replace("-", "")).mul(p.startsWith("-") ? new Rat(-1n) : R1);
    });
    return coords;
  }
  // Expression.
  const s = src.replace(/−/g, "-").replace(/·|×|\*/g, "*").replace(/½/g, "(1/2)")
    .replace(/[₀₁₂₃₄₅₆₇]/g, (c) => String("₀₁₂₃₄₅₆₇".indexOf(c)));
  const toks = s.match(/\d+(?:\.\d+)?|e\d|[ijkl]|[()+\-*/]/g);
  if (!toks || toks.join("") !== s.replace(/\s+/g, "")) throw new Error("could not read “" + src + "”");
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const named = { i: 1, j: 2, k: 4, l: 3 }; // quaternion units of the Hurwitz subalgebra ⟨1,e1,e2,e4⟩ (k = e1e2 = e4)
  function atom() {
    const t = next();
    if (t === undefined) throw new Error("unexpected end of input");
    if (t === "(") {
      const v = expr();
      if (next() !== ")") throw new Error("missing )");
      return v;
    }
    if (/^\d/.test(t)) { const v = rvec(); v[0] = parseNumberToken(t); return v; }
    if (/^e\d$/.test(t)) {
      const i = +t[1];
      if (i > 7) throw new Error("only e0 … e7 exist");
      const v = rvec(); v[i] = R1; return v;
    }
    if (named[t] !== undefined) { const v = rvec(); v[named[t]] = R1; return v; }
    if (t === "-") return atom().map((c) => c.neg());
    if (t === "+") return atom();
    throw new Error("unexpected “" + t + "”");
  }
  function term() {
    let v = atom();
    for (;;) {
      const t = peek();
      if (t === "*") { next(); v = rmul(v, atom()); }
      else if (t === "/") {
        next();
        const d = atom();
        if (!isScalar(d)) throw new Error("can only divide by rational numbers");
        const inv = d[0].inv();
        v = v.map((c) => c.mul(inv));
      } else if (t === "(" || (t && (/^\d/.test(t) || /^e\d$/.test(t) || named[t] !== undefined))) {
        v = rmul(v, atom()); // implicit product, e.g. 3e1 or (1+e1)(1+e2)
      } else break;
    }
    return v;
  }
  function expr() {
    let v = term();
    for (;;) {
      const t = peek();
      if (t === "+") { next(); const w = term(); v = v.map((c, i) => c.add(w[i])); }
      else if (t === "-") { next(); const w = term(); v = v.map((c, i) => c.add(w[i].neg())); }
      else break;
    }
    return v;
  }
  const v = expr();
  if (pos !== toks.length) throw new Error("trailing input near “" + toks.slice(pos).join("") + "”");
  return v;
}

function fromRational(coords) {
  const d = coords.map((c) => {
    const x = c.mul(new Rat(2n));
    if (x.d !== 1n) throw new Error("coordinates must be integers or halves");
    return x.n;
  });
  if (!isValid(d)) throw new Error("not in the octavian order: the half-integer coordinates must sit on a codeword of C");
  return d;
}

// ---------------------------------------------------------------------------------------
// Units, Z-basis

// A Z-basis of O in doubled coordinates (rows), from ½(codewords) and e_i.  Computed once.
export const O_BASIS = (() => {
  const gens = [];
  for (let i = 0; i < 8; i++) gens.push(basisUnit(i));
  for (const w of CODE_WORDS_0) {
    const d = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
    for (const i of w) d[i] = 1n;
    gens.push(d);
    const c = [1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n];
    for (const i of w) c[i] = 0n;
    gens.push(c);
  }
  return hermiteRows(gens);
})();

// Integer row reduction (Hermite normal form, rows). Exported for lattice.js.
export function hermiteRows(rows) {
  const A = rows.map((r) => r.slice()).filter((r) => r.some((x) => x));
  const n = A[0].length;
  let r = 0;
  for (let c = 0; c < n && r < A.length; c++) {
    for (;;) {
      let piv = -1;
      for (let i = r; i < A.length; i++) if (A[i][c] && (piv < 0 || abs(A[i][c]) < abs(A[piv][c]))) piv = i;
      if (piv < 0) break;
      [A[r], A[piv]] = [A[piv], A[r]];
      let done = true;
      for (let i = r + 1; i < A.length; i++) {
        if (!A[i][c]) continue;
        const q = A[i][c] / A[r][c];
        if (q) for (let j = c; j < n; j++) A[i][j] -= q * A[r][j];
        if (A[i][c]) done = false;
      }
      if (done) break;
    }
    if (r < A.length && A[r][c]) {
      if (A[r][c] < 0n) A[r] = A[r].map((x) => -x);
      for (let i = 0; i < r; i++) {
        let q = A[i][c] / A[r][c];
        if (A[i][c] - q * A[r][c] < 0n) q -= 1n;
        if (q) for (let j = c; j < n; j++) A[i][j] -= q * A[r][j];
      }
      r++;
    }
  }
  return A.slice(0, r);
}
