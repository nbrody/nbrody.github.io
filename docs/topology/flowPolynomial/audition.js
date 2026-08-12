#!/usr/bin/env node
/*
 * audition.js — audition random cubic graphs against the golden identity.
 *
 * Generates random simple, connected, bridgeless cubic graphs via the
 * configuration model, computes their flow polynomials exactly, and
 * evaluates both sides of Tutte's golden identity
 *     F(G, phi+2)  vs  phi^|E| * F(G, phi+1)^2
 * in Z[phi]. By Tutte's theorem the identity HOLDS for every planar cubic
 * graph, so a failure certifies non-planarity. The Agol-Krushkal conjecture
 * (arXiv:1801.00502) says the converse: a non-planar cubic graph should
 * always FAIL the identity — so any "holds" row here is either planar or a
 * counterexample worth a very close look.
 *
 * Usage: node audition.js [perSize] [seed] [maxN] [jsonOut]
 * If jsonOut is given, every audited graph is written there with its
 * verdict, for independent cross-checking (e.g. networkx planarity).
 */
'use strict';
const FP = require('./flowpoly.js');
const fs = require('fs');

const perSize = parseInt(process.argv[2] || '3', 10);
const seed = parseInt(process.argv[3] || '20260709', 10);
const maxN = parseInt(process.argv[4] || '28', 10);
const jsonOut = process.argv[5] || null;
const records = [];

function makeRng(s) {
  let x = s >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
const rng = makeRng(seed);

// random simple cubic graph on n vertices (configuration model + rejection)
function randCubic(n) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const stubs = [];
    for (let v = 0; v < n; v++) stubs.push(v, v, v);
    for (let i = stubs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [stubs[i], stubs[j]] = [stubs[j], stubs[i]];
    }
    const edges = [];
    const seen = new Set();
    let ok = true;
    for (let i = 0; i < stubs.length; i += 2) {
      const a = stubs[i], b = stubs[i + 1];
      if (a === b) { ok = false; break; }
      const k = Math.min(a, b) + '|' + Math.max(a, b);
      if (seen.has(k)) { ok = false; break; }
      seen.add(k);
      edges.push([a, b]);
    }
    if (ok) return edges;
  }
  throw new Error('configuration model kept rejecting for n=' + n);
}

function randGoodCubic(n) {
  for (;;) {
    const edges = randCubic(n);
    if (FP.componentsOf(edges).length !== 1) continue;
    if (FP.hasBridge(edges)) continue;
    return edges;
  }
}

function fmtRatio(x) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  return a >= 1e-3 && a < 1e4 ? x.toPrecision(4) : x.toExponential(3);
}

console.log('seed=' + seed + '  perSize=' + perSize + '  sizes: n = 10.. ' + maxN + ' (E = 3n/2)');
console.log('');
console.log('   n   E     ms  deg  maxCoef   F(4)      F(5)        F(phi+2)              ratio F(phi+2)/phi^E F(phi+1)^2   identity');
console.log('  ' + '-'.repeat(120));

let anyHolds = [];
let slow = false;
for (let n = 10; n <= maxN && !slow; n += 2) {
  for (let k = 0; k < perSize; k++) {
    const edges = randGoodCubic(n);
    const E = edges.length;
    const t0 = Date.now();
    let poly;
    try {
      poly = FP.flowPoly(edges, { limit: 50e6 });
    } catch (err) {
      console.log(String(n).padStart(4) + String(E).padStart(4) + '   computation budget exceeded — stopping at this size');
      slow = true;
      break;
    }
    const ms = Date.now() - t0;
    const safe = poly.every(Number.isSafeInteger);
    const maxCoef = poly.reduce((m, c) => Math.max(m, Math.abs(c)), 0);
    const f1 = FP.pEvalGolden(poly, [1, 1]);
    const f2 = FP.pEvalGolden(poly, [2, 1]);
    const rhs = FP.gMul(FP.gPow([0, 1], E), FP.gMul(f1, f1));
    const holds = FP.gEq(f2, rhs);
    const rhsSafe = rhs.every(Number.isSafeInteger) && f2.every(Number.isSafeInteger);
    const ratio = FP.gToNumber(f2) / FP.gToNumber(rhs);
    const F4 = FP.pEval(poly, 4);
    const F5 = FP.pEval(poly, 5);
    const snark = F4 === 0 ? ' SNARK!' : '';
    if (holds) anyHolds.push({ n, edges });
    // gToString: the ring values are BigInt pairs, which JSON can't serialize
    records.push({ n, E, edges, holds, ratio, F4, F5, f2: FP.gToString(f2), rhs: FP.gToString(rhs) });
    console.log(
      String(n).padStart(4) + String(E).padStart(4) + String(ms).padStart(7) +
      String(poly.length - 1).padStart(5) +
      ('  ' + maxCoef.toExponential(1)).padStart(9) +
      String(F4).padStart(7) + snark +
      String(F5).padStart(10) +
      ('  ' + FP.gToString(f2)).padEnd(24) +
      ('  ' + fmtRatio(ratio)).padEnd(14) +
      (holds ? '  *** HOLDS ***' : '  fails (certifies non-planar)') +
      (safe && rhsSafe ? '' : '  [!] overflow risk')
    );
    if (ms > 30000) { slow = true; }
  }
  console.log('');
}

if (anyHolds.length) {
  console.log('\n*** Graphs where the identity HELD (planar, or Agol-Krushkal counterexamples!): ***');
  for (const g of anyHolds) console.log('n=' + g.n + ': ' + JSON.stringify(g.edges));
} else {
  console.log('Golden identity failed for every audited graph — all certified non-planar,');
  console.log('consistent with the Agol-Krushkal conjecture (and with random cubic graphs being a.a.s. non-planar).');
}

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(records));
  console.log('\nwrote ' + records.length + ' records to ' + jsonOut);
}
