// Beam search exploring G = <a,b> in the projective integer quaternions, to
// find a finite-index subgroup of PH(Z[1/p]) where p = prime of N(a).
//
//  * G acts on the Bruhat-Tits tree T_q (q = prime of N(b)).  a is elliptic
//    (N(a)=p^x is a unit at q -> fixes v0); b is hyperbolic.
//  * H_p := G n PH(Z[1/p]) = Stab_G(v0): elements whose primitive norm is a
//    power of p.
//  * Reidemeister-Schreier on the orbit of v0, ordered by tree distance (a
//    beam staying near v0): every fold gives a generator of H_p, translated
//    via LPS factorisation into a word in F_r = PH(Z[1/p]).
//  * Feed the words into a Stallings graph; completeness <=> finite index.

import { qmul, qconj, primitive, canonical, keyOf, isOne, qnorm, vP, ONE,
         lpsGenerators, letterScheme, lpsFactor } from "./quaternion.js";
import { PrimeTree } from "./tree.js";
import { Stallings } from "./stallings.js";

export function runSearch(opts) {
  const { a, b, p, q } = opts;
  const nodeBudget = opts.nodeBudget ?? 200000;
  const confirmNodes = opts.confirmNodes ?? 8000;
  const precision = opts.precision ?? 30;
  const onProgress = opts.onProgress ?? (() => {});
  const reportEvery = opts.reportEvery ?? 4000;

  const P = BigInt(p);
  const L = lpsGenerators(p);
  const scheme = letterScheme(L);
  const T = new PrimeTree(q, precision);

  const GENS = [
    ["a", a], ["A", qconj(a)], ["b", b], ["B", qconj(b)],
  ];
  const isPowP = (h) => { let nn = qnorm(primitive(h)); while (nn % P === 0n) nn /= P; return nn === 1n; };

  const S = new Stallings(scheme.nLetters);
  const seenH = new Set();
  let nGen = 0;

  function addH(h) {
    const k = keyOf(h);
    if (seenH.has(k) || isOne(h)) return;
    seenH.add(k);
    const word = lpsFactor(primitive(h), L, scheme);
    if (word && word.length) { S.addWord(word); nGen++; }
  }

  const v0 = T.vertex(ONE);
  const trans = new Map([[v0, ONE]]);
  // bucket queue keyed on tree distance
  const buckets = [[v0]];
  let curDist = 0;
  let visited = 0, firstComplete = null, lastIdx = null;
  // vertices are only exact for tree distance < precision; never explore past it
  const maxDist = precision - 2;
  let capHit = false, maxDistSeen = 0;

  function nextNode() {
    while (curDist < buckets.length) {
      const bk = buckets[curDist];
      if (bk.length) return bk.pop();
      curDist++;
    }
    return undefined;
  }

  while (visited < nodeBudget) {
    const v = nextNode();
    if (v === undefined) break;
    const W = trans.get(v);
    visited++;
    for (const [lab, g] of GENS) {
      const gW = primitive(qmul(g, W));
      const v2 = T.vertex(gW);
      if (!trans.has(v2)) {
        const d = (lab === "a" || lab === "A") ? curDist : curDist + 1;
        if (d > maxDist) { capHit = true; continue; }   // keep vertices exact
        if (d > maxDistSeen) maxDistSeen = d;
        trans.set(v2, canonical(gW));
        while (buckets.length <= d) buckets.push([]);
        buckets[d].push(v2);
      } else {
        const h = primitive(qmul(qconj(trans.get(v2)), gW));
        if (isPowP(h)) addH(h);
      }
    }
    lastIdx = nGen ? S.index() : null;
    if (lastIdx !== null && firstComplete === null) {
      firstComplete = { visited, index: lastIdx };
      onProgress({ phase: "complete", visited, orbit: trans.size, nGen, index: lastIdx, stats: S.stats() });
    }
    if (visited % reportEvery === 0) {
      onProgress({ phase: "search", visited, orbit: trans.size, nGen, index: lastIdx, stats: S.stats(), dist: curDist });
    }
    if (firstComplete && visited >= firstComplete.visited + confirmNodes) break;
  }

  return {
    p, q, rank: L.rank, nLetters: scheme.nLetters,
    visited, orbit: trans.size, nGen,
    index: S.index(), stats: S.stats(),
    firstComplete, graph: S.graph(),
    capHit, maxDistSeen,
    generators: L.gens.map((g) => g.map(String)),
  };
}
