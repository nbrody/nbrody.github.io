/*
  grobner.js — Ideals in Z[x1,...,xk] and a basic Buchberger algorithm over Z
  ---------------------------------------------------------------------------
  Depends on the classes defined in polynomialRings.js:
    - MonomialOrder, Monomial, ZZPolynomial, PolynomialRingZ
  Coefficients are BigInt (integers). Monomials are exponent vectors (n1,...,nk).

  This file provides:
    - gcdBigInt, lcmBigInt, content, primitivePart, normalizePrimitive
    - SPolynomialZ(f, g, order)
    - reducePseudo(f, G, order)  // pseudo-reduction over Z (PID)
    - groebnerBasis(generators, order)
    - class ZZIdeal { groebner(orderName) }
  Abbreviations used: LM = leading monomial (exponent vector of leading term);
  LC = leading coefficient; LT = leading term (= LC * LM), all w.r.t. the chosen order.

  Notes on arithmetic over Z:
    We stay in Z by using c = lcm(|lc(f)|, |lc(g)|) when forming S-polynomials, and
    pseudo-reduction steps of the form:  p := lc(g)*p - lc(p)*x^(alpha-beta)*g.
    After major steps we divide by content and make leading coefficient positive
    to control coefficient growth.
    We frequently normalize polynomials to their primitive part and flip sign so that LC > 0.
*/

(function(root){
  const Rings = root.Rings || (root.Rings = {});
  const Monomial = Rings.Monomial;
  const MonomialOrder = Rings.MonomialOrder;
  const ZZPolynomial = Rings.ZZPolynomial;
  const PolynomialRingZ = Rings.PolynomialRingZ;

  // ---------- Basic BigInt arithmetic helpers ----------
  function absBI(a){ return a < 0n ? -a : a; }
  function gcdBigInt(a,b){ a = absBI(a); b = absBI(b); while (b !== 0n){ const t = a % b; a = b; b = t; } return a; }
  function lcmBigInt(a,b){ a = absBI(a); b = absBI(b); if (a === 0n || b === 0n) return 0n; return (a / gcdBigInt(a,b)) * b; }

  // ---------- Monomial helpers ----------
  function monSub(a, b){ return a.map((ai,i)=> ai - b[i]); }

  // ---------- Polynomial helpers over Z ----------
  function content(p){
    if (p.isZero()) return 0n;
    let g = 0n;
    for (const {coeff} of p.termsIter()) g = g === 0n ? absBI(coeff) : gcdBigInt(g, coeff);
    return g;
  }

  function primitivePart(p){
    if (p.isZero()) return p.clone();
    let c = content(p); if (c === 0n || c === 1n) return p.clone();
    const inv = 1n / c; // exact because c|coeff
    const out = new Map();
    for (const [k,c0] of p.terms) out.set(k, c0 / c);
    return new ZZPolynomial(p.k, out);
  }

  function normalizePrimitive(p, orderFn){
    // Make primitive and with positive leading coefficient
    let q = primitivePart(p);
    const lm = q.leadingMonomial(orderFn || MonomialOrder.grevlex);
    if (!lm) return q; // zero
    if (lm.coeff < 0n) q = q.mulScalar(-1n);
    return q;
  }

  function leadingTermPoly(p, orderFn){
    // LM = leading monomial (exp vector), LC = leading coefficient; LT = LC * x^LM
    const lm = p.leadingMonomial(orderFn || MonomialOrder.grevlex);
    if (!lm) return ZZPolynomial.zero(p.k);
    return ZZPolynomial.monomial(p.k, lm.exp, lm.coeff);
  }

  // S-polynomial over Z: scale to cancel leading terms using lcms of monomial and coefficients
  function SPolynomialZ(f, g, orderFn){
    // Leading data: lf = {exp: LM(f), coeff: LC(f)}, lg = {exp: LM(g), coeff: LC(g)}
    const lf = f.leadingMonomial(orderFn || MonomialOrder.grevlex);
    const lg = g.leadingMonomial(orderFn || MonomialOrder.grevlex);
    if (!lf || !lg) return ZZPolynomial.zero(f.k);
    // L = lcm of monomials to align LM(f) and LM(g)
    const lExp = Monomial.lcm(lf.exp, lg.exp);
    const mf = monSub(lExp, lf.exp);
    const mg = monSub(lExp, lg.exp);
    // Scale coefficients by c = lcm(|LC(f)|, |LC(g)|) to cancel LT
    const c = lcmBigInt(absBI(lf.coeff), absBI(lg.coeff));
    const A = c / lf.coeff; // may be negative BigInt
    const B = c / lg.coeff; // may be negative BigInt
    // S = (c/LC(f)) * x^{L-LM(f)} * f  −  (c/LC(g)) * x^{L-LM(g)} * g
    const term1 = f.mulMonomial(mf, A);
    const term2 = g.mulMonomial(mg, B);
    return term1.sub(term2);
  }

  // Pseudo-reduction over Z by a set G: while lm divisible, do lc(g)*p - lc(p)*x^(diff)*g
  function reducePseudo(f, G, orderFn){
    const order = orderFn || MonomialOrder.grevlex;
    let p = f.clone();
    let r = ZZPolynomial.zero(f.k);
    outer: while (!p.isZero()){
      // Leading data (LT(p) = LC(p) * x^{LM(p)}). We try to reduce LT(p) by some g \in G.
      const lt = p.leadingMonomial(order);
      // Correct reduction step:
      for (let i = 0; i < G.length; i++){
        const gi = G[i];
        if (gi.isZero()) continue;
        const ltG = gi.leadingMonomial(order);
        if (!Monomial.divides(ltG.exp, lt.exp)) continue;
        const diff = monSub(lt.exp, ltG.exp);
        // Pseudo-reduction over Z: p := LC(g)*p − LC(p)*x^{LM(p)-LM(g)} * g
        const left = p.mulScalar(ltG.coeff);
        const right = gi.mulMonomial(diff, lt.coeff);
        p = left.sub(right);
        // Normalize so content=1 and LC>0 (keeps coefficients manageable)
        p = normalizePrimitive(p, order);
        continue outer;
      }
      // Not reducible: move leading term to remainder
      const ltPoly = leadingTermPoly(p, order);
      r = r.add(ltPoly);
      p = p.sub(ltPoly);
    }
    return r; // normal form wrt G
  }

  // Basic (unoptimized) Buchberger algorithm over Z with pseudo-reduction
  function groebnerBasis(generators, orderFn){
    if (!Array.isArray(generators)) throw new Error("groebnerBasis: generators must be an array of ZZPolynomial");
    const order = orderFn || MonomialOrder.grevlex;
    if (generators.length === 0) return [];
    const k = generators[0].k;

    // Make generators primitive with positive LC (standardization)
    let G = generators
      .filter(g => !g.isZero())
      .map(g => normalizePrimitive(g, order));

    // Pair set as list of index pairs
    const pairs = [];
    for (let i = 0; i < G.length; i++){
      for (let j = i+1; j < G.length; j++) pairs.push([i,j]);
    }

    // Buchberger loop over pairs; reduce S-polynomials modulo current G
    while (pairs.length){
      const [i, j] = pairs.shift();
      const Si = SPolynomialZ(G[i], G[j], order);
      let h = reducePseudo( normalizePrimitive(Si, order), G, order );
      h = normalizePrimitive(h, order);
      if (!h.isZero()){
        const newIndex = G.length;
        G.push(h);
        for (let t = 0; t < newIndex; t++) pairs.push([t, newIndex]);
      }
    }

    // Interreduce to obtain a (nearly) reduced basis
    for (let i = 0; i < G.length; i++){
      const others = G.filter((_, idx) => idx !== i);
      const gi = reducePseudo(G[i], others, order);
      G[i] = normalizePrimitive(gi, order);
    }

    // Remove duplicates / zeros
    G = G.filter(g => !g.isZero());

    // Sort by leading monomial descending for consistency
    G.sort((a,b)=>{
      const la = a.leadingMonomial(order); const lb = b.leadingMonomial(order);
      if (!la && !lb) return 0; if (!la) return 1; if (!lb) return -1;
      return -Monomial.cmp(la.exp, lb.exp, order);
    });

    return G;
  }

  // Ideal wrapper -------------------------------------------------------------
  class ZZIdeal{
    constructor(R, generators){
      if (!(R instanceof PolynomialRingZ)) throw new Error("ZZIdeal: R must be a PolynomialRingZ");
      this.R = R;
      this.k = R.k;
      if (!Array.isArray(generators)) throw new Error("ZZIdeal: generators must be an array");
      this.generators = generators.map(g => (g instanceof ZZPolynomial) ? g : this.R.fromTerms(g));
    }
    groebner(orderName){
      const order = orderName === 'lex' ? MonomialOrder.lex : orderName === 'grlex' ? MonomialOrder.grlex : this.R.order;
      return groebnerBasis(this.generators, order);
    }
    reduce(f, basis){
      const G = basis || this.groebner();
      return reducePseudo(f, G, this.R.order);
    }
  }

  // Expose API
  Rings.Groebner = {
    gcdBigInt, lcmBigInt, content, primitivePart, normalizePrimitive,
    SPolynomialZ, reducePseudo, groebnerBasis, ZZIdeal
  };
  Rings.ZZIdeal = ZZIdeal;

})(typeof window !== 'undefined' ? window : globalThis);
