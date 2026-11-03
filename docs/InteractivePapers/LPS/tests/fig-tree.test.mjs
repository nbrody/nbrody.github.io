// node tests/fig-tree.test.mjs — checks the pure math behind Figures 1 and 2.
import { generatorData, quatTex, projClass, P_CHOICES, Q_CHOICES } from '../js/fig-generators.js';
import { treeLayout, peelSteps, oddQuaternionsOfNorm, expressionCount, countingCheck, TREE_CHOICES } from '../js/fig-tree.js';
import { generators, wordToQuaternion, inverseIndex, sigma } from '../js/lps.js';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL', m); } };

// Figure 1: every (p, q) offered passes its checks
for (const p of P_CHOICES) for (const q of Q_CHOICES) {
  if (p === q) continue;
  const d = generatorData(p, q);
  ok(d.count === p + 1 && d.r4 / 8 === p + 1 && d.sols === 8 * (p + 1), `count (${p},${q})`);
  ok(d.detOk && d.invOk && d.pairsAntipodal, `det/inverse/antipodal (${p},${q})`);
  ok(d.distinct <= d.count && d.distinct >= 1, `distinct classes (${p},${q}): ${d.distinct}`);
}
ok(generatorData(13, 17).distinct === 14 && generatorData(13, 17).leg === 1, 'default (13,17): 14 distinct, PSL');
ok(quatTex([1, -2, 0, 2]) === '1 - 2\\mathbf{i} + 2\\mathbf{k}', 'quatTex');
ok(quatTex([-1, 1, -1, 0]) === '-1 + \\mathbf{i} - \\mathbf{j}', 'quatTex units');
ok(projClass([2, 0, 0, 2], 5) === '1,0,0,1', 'projClass scalar');

// Figure 2: layout sizes, no re-centring data, factorization
for (const [p, depth] of TREE_CHOICES) {
  const L = treeLayout(p, depth);
  let expect = 1, layer = p + 1;
  for (let d = 1; d <= depth; d++) { expect += layer; layer *= p; }
  ok(L.nodes.length === expect, `tree size p=${p} depth=${depth}: ${L.nodes.length}`);
  ok(L.nodes.every((n) => Math.hypot(n.x, n.y) <= 1 + 1e-12), 'inside the unit disk');
  const inv = inverseIndex(L.S);
  ok(L.nodes.every((n) => n.word.every((s, i) => i === 0 || s !== inv[n.word[i - 1]])), 'all words reduced');
  for (const n of L.nodes) {
    const f = peelSteps(wordToQuaternion(n.word, L.S), p, L.S);
    if (!(f.ok && f.unique && f.sign === 1 && f.r === 0 && f.word.join() === n.word.join())) { ok(false, `peel word ${n.word}`); break; }
  }
  ok(true, 'every vertex word peels back to itself');
  const neg = peelSteps(wordToQuaternion([0, 3], L.S).map((c) => -p * c), p, L.S);
  ok(neg.ok && neg.sign === -1 && neg.r === 1 && neg.word.join() === '0,3' && neg.rows[0].kind === 'p', '−p·word');
  for (let k = 1; k <= (p === 5 ? 4 : 3); k++) ok(expressionCount(p, k) === 2 * sigma(p ** k), `expressionCount = 2σ (p=${p}, k=${k})`);
  const rows = countingCheck(p, p === 5 ? 4 : 3);
  ok(rows.every((r) => r.count === r.expressions && r.unique === r.count), `counting check p=${p}: ${rows.map((r) => r.count).join(', ')}`);
}
ok(oddQuaternionsOfNorm(5).length === 12, 'the six generators of norm 5, with both signs');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
