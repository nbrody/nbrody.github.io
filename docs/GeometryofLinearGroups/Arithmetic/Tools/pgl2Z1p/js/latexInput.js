// Reading MathQuill's LaTeX. Two languages:
//   words    StTSt^{-1}StT,  \sigma t\sigma,  (St)^{3}W        → a matrix in PGL₂(ℤ[1/p])
//   entries  1+\frac{1}{p},  \frac{3}{4},  -2p^{-2},  (p+1)^2   → an exact rational (p is the prime)
import { Q, M, mmul, generators, power } from "./exact.js";

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "\\") {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      const name = m[1];
      i += m[0].length;
      if (/^[ ,;:!]$/.test(name) || name === "quad" || name === "qquad") continue;   // spacing
      out.push({ t: "cmd", v: name });
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue; }
    out.push({ t: "ch", v: c });
    i++;
  }
  return out;
}

class Reader {
  constructor(src) { this.toks = tokenize(src); this.i = 0; }
  peek() { return this.toks[this.i]; }
  next() { return this.toks[this.i++]; }
  done() { return this.i >= this.toks.length; }
  isCh(v) { const k = this.peek(); return k && k.t === "ch" && k.v === v; }
  isCmd(v) { const k = this.peek(); return k && k.t === "cmd" && k.v === v; }
  expectCh(v) { if (!this.isCh(v)) throw new Error(`expected “${v}”`); this.i++; }
  // \left( … \right) or ( … ) or { … }
  openGroup() {
    if (this.isCmd("left")) { this.i++; const k = this.next(); if (!k || k.v !== "(" && k.v !== "[") throw new Error("expected a bracket"); return k.v === "(" ? ")" : "]"; }
    if (this.isCh("(")) { this.i++; return ")"; }
    if (this.isCh("[")) { this.i++; return "]"; }
    if (this.isCh("{")) { this.i++; return "}"; }
    return null;
  }
  closeGroup(close) {
    if (close !== "}" && this.isCmd("right")) { this.i++; this.next(); return; }
    this.expectCh(close);
  }
  atClose(close) { return this.done() || this.isCh(close) || (close !== "}" && this.isCmd("right")); }
}

// an integer exponent after ^ : ^2, ^{-1}, ^{12}, ^-1
function readExponent(r) {
  if (r.isCh("{")) {
    r.i++;
    let sign = 1;
    if (r.isCh("-")) { sign = -1; r.i++; } else if (r.isCh("+")) r.i++;
    const k = r.next();
    if (!k || k.t !== "num" || k.v.includes(".")) throw new Error("powers must be integers");
    r.expectCh("}");
    return sign * parseInt(k.v, 10);
  }
  let sign = 1;
  if (r.isCh("-")) { sign = -1; r.i++; }
  const k = r.next();
  if (!k || k.t !== "num" || k.v.includes(".")) throw new Error("powers must be integers");
  // as in TeX, ^12 means ^1 followed by 2 (MathQuill writes x^{12} with braces)
  if (k.v.length > 1) r.toks.splice(r.i, 0, { t: "num", v: k.v.slice(1) });
  return sign * parseInt(k.v[0], 10);
}

// ---------------------------------------------------------------- words

const LETTER = { t: "t", T: "T", S: "S", R: "R", W: "W", w: "W", J: "J" };

export function parseWordLatex(src, p) {
  const G = generators(p);
  const r = new Reader(src);
  const letters = [];
  function word(close) {
    let m = M(1, 0, 0, 1);
    while (!r.atClose(close)) {
      const k = r.peek();
      if ((k.t === "cmd" && (k.v === "cdot" || k.v === "times")) || (k.t === "ch" && (k.v === "*" || k.v === ","))) { r.i++; continue; }
      let base;
      const c = r.openGroup();
      if (c) { base = word(c); r.closeGroup(c); }
      else if (k.t === "cmd" && k.v === "sigma") { r.i++; base = G.J; letters.push("\\sigma"); }
      else if (k.t === "ch" && LETTER[k.v]) { r.i++; base = G[LETTER[k.v]]; letters.push(k.v); }
      else throw new Error(`cannot read “${k.v}” in the word; the letters are $t, T, S, R, \\sigma, W$`);
      if (r.isCh("^")) {
        r.i++;
        // MathQuill keeps whatever is typed after "t^-1" inside the exponent unless one presses
        // space or →, and pasted text lands there too: t^{-1\ T\ t}. Exponents in a word are
        // integers, so anything after the integer is the rest of the word.
        if (r.isCh("{")) {
          r.i++;
          let sign = 1;
          if (r.isCh("-")) { sign = -1; r.i++; } else if (r.isCh("+")) r.i++;
          const n = r.next();
          if (!n || n.t !== "num" || n.v.includes(".")) throw new Error("powers in a word must be integers");
          m = mmul(m, power(base, sign * parseInt(n.v, 10)));
          if (!r.isCh("}")) m = mmul(m, word("}"));
          r.expectCh("}");
          continue;
        }
        base = power(base, readExponent(r));
      }
      m = mmul(m, base);
    }
    return m;
  }
  const matrix = word(null);
  if (!r.done()) throw new Error("unbalanced brackets in the word");
  if (!letters.length) throw new Error("the word is empty");
  return { matrix, letters };
}

// ---------------------------------------------------------------- entries

function qpowInt(q, k) {
  if (Math.abs(k) > 400) throw new Error("exponent too large");
  let out = new Q(1n);
  const b = k < 0 ? new Q(1n).div(q) : q;
  for (let i = 0; i < Math.abs(k); i++) out = out.mul(b);
  return out;
}

export function evalEntryLatex(src, p) {
  const r = new Reader(src);
  const P = new Q(BigInt(p));
  function expr(close) {
    let v = term(close);
    while (!r.atClose(close) && (r.isCh("+") || r.isCh("-"))) {
      const op = r.next().v;
      const w = term(close);
      v = op === "+" ? v.add(w) : v.sub(w);
    }
    return v;
  }
  function startsFactor() {
    const k = r.peek();
    if (!k) return false;
    if (k.t === "num") return true;
    if (k.t === "cmd") return k.v === "frac" || k.v === "dfrac" || k.v === "tfrac" || k.v === "left";
    return k.v === "p" || k.v === "(" || k.v === "{";
  }
  function term(close) {
    let v = unary(close);
    for (;;) {
      if (r.atClose(close)) return v;
      if (r.isCmd("cdot") || r.isCmd("times") || r.isCh("*")) { r.i++; v = v.mul(unary(close)); continue; }
      if (r.isCmd("div") || r.isCh("/")) { r.i++; const w = unary(close); if (w.isZero()) throw new Error("division by zero"); v = v.div(w); continue; }
      if (startsFactor()) { v = v.mul(unary(close)); continue; }   // implicit product, e.g. 2p
      return v;
    }
  }
  function unary(close) {
    if (r.isCh("-")) { r.i++; return unary(close).neg(); }
    if (r.isCh("+")) { r.i++; return unary(close); }
    let v = primary();
    if (r.isCh("^")) {
      r.i++;
      let k;
      if (r.isCh("{")) {
        r.i++;
        const e = expr("}");
        r.expectCh("}");
        if (e.d !== 1n) throw new Error("exponents must be integers");
        k = Number(e.n);
      } else k = readExponent(r);
      v = qpowInt(v, k);
    }
    return v;
  }
  function primary() {
    const k = r.peek();
    if (!k) throw new Error("the entry is incomplete");
    if (k.t === "num") {
      r.i++;
      const [a, b = ""] = k.v.split(".");
      return new Q(BigInt(a + b), 10n ** BigInt(b.length));
    }
    if (k.t === "cmd" && /^[dt]?frac$/.test(k.v)) {
      r.i++;
      r.expectCh("{"); const a = expr("}"); r.expectCh("}");
      r.expectCh("{"); const b = expr("}"); r.expectCh("}");
      if (b.isZero()) throw new Error("division by zero");
      return a.div(b);
    }
    if (k.t === "ch" && k.v === "p") { r.i++; return P; }
    const c = r.openGroup();
    if (c) { const v = expr(c); r.closeGroup(c); return v; }
    throw new Error(`cannot read “${k.v}” in a matrix entry`);
  }
  if (r.done()) throw new Error("a matrix entry is empty");
  const v = expr(null);
  if (!r.done()) throw new Error("could not read a matrix entry to the end");
  return v;
}

// the plain "t^-1 T S" syntax of exact.randomWord → LaTeX for MathQuill
export const plainWordToLatex = (w) => w.trim().split(/\s+/).map((tok) => {
  const m = /^([tTSRJW])(?:\^(-?\d+))?$/.exec(tok);
  if (!m) return tok;
  const L = m[1] === "J" ? "\\sigma " : m[1];
  return m[2] === undefined ? L : `${L}^{${m[2]}}`;
}).join("");
