// Builds js/knotTable.js: reference invariants for prime knots up to 8 crossings, small composites and
// a few links, computed with this app's own pipeline from 3D reference curves (projected along z).
// node tools/buildTable.mjs
import { writeFileSync } from 'node:fs';
import { P } from '../js/poly.js';
import { projectDiagram } from '../js/diagram.js';
import { diagramInvariants } from '../js/invariants.js';
import { rationalCurves, pretzelCurves, braidClosureCurves, torusKnotCurves } from '../js/builders.js';

const curvesOf = r => r.rational ? rationalCurves(r.rational) : r.pretzel ? pretzelCurves(r.pretzel)
  : r.braid ? braidClosureCurves(r.braid[0], r.braid[1]) : r.torus ? torusKnotCurves(...r.torus) : null;
const invOf = r => diagramInvariants(projectDiagram(curvesOf(r), [0, 0, 1]).gauss);

// [name, recipe, expected determinant, expected Alexander coefficients (soft check), nickname]
const KNOTS = [
  ['3_1', { torus: [2, 3] }, 3, [1, -1, 1], 'trefoil'],
  ['4_1', { rational: [2, 2] }, 5, [-1, 3, -1], 'figure-eight knot'],
  ['5_1', { torus: [2, 5] }, 5, [1, -1, 1, -1, 1], 'cinquefoil'],
  ['5_2', { rational: [3, 2] }, 7, [2, -3, 2], 'three-twist knot'],
  ['6_1', { rational: [4, 2] }, 9, [-2, 5, -2], 'stevedore knot'],
  ['6_2', { rational: [3, 1, 2] }, 11, [-1, 3, -3, 3, -1], ''],
  ['6_3', { rational: [2, 1, 1, 2] }, 13, [1, -3, 5, -3, 1], ''],
  ['7_1', { torus: [2, 7] }, 7, [1, -1, 1, -1, 1, -1, 1], 'septafoil'],
  ['7_2', { rational: [5, 2] }, 11, [3, -5, 3], ''],
  ['7_3', { rational: [4, 3] }, 13, [2, -3, 3, -3, 2], ''],
  ['7_4', { rational: [3, 1, 3] }, 15, [4, -7, 4], ''],
  ['7_5', { rational: [3, 2, 2] }, 17, [2, -4, 5, -4, 2], ''],
  ['7_6', { rational: [2, 2, 1, 2] }, 19, [1, -5, 7, -5, 1], ''],
  ['7_7', { rational: [2, 1, 1, 1, 2] }, 21, [1, -5, 9, -5, 1], ''],
  ['8_1', { rational: [6, 2] }, 13, [-3, 7, -3], ''],
  ['8_2', { rational: [5, 1, 2] }, 17, [-1, 3, -3, 3, -3, 3, -1], ''],
  ['8_3', { rational: [4, 4] }, 17, [-4, 9, -4], ''],
  ['8_4', { rational: [4, 1, 3] }, 19, [-2, 5, -5, 5, -2], ''],
  ['8_5', { pretzel: [3, 3, 2] }, 21, [-1, 3, -4, 5, -4, 3, -1], ''],
  ['8_6', { rational: [3, 3, 2] }, 23, [-2, 6, -7, 6, -2], ''],
  ['8_7', { rational: [4, 1, 1, 2] }, 23, [1, -3, 5, -5, 5, -3, 1], ''],
  ['8_8', { rational: [2, 3, 1, 2] }, 25, [2, -6, 9, -6, 2], ''],
  ['8_9', { rational: [3, 1, 1, 3] }, 25, [-1, 3, -5, 7, -5, 3, -1], ''],
  ['8_11', { rational: [3, 2, 1, 2] }, 27, [-2, 7, -9, 7, -2], ''],
  ['8_12', { rational: [2, 2, 2, 2] }, 29, [1, -7, 13, -7, 1], ''],
  ['8_13', { rational: [3, 1, 1, 1, 2] }, 29, [2, -7, 11, -7, 2], ''],
  ['8_14', { rational: [2, 2, 1, 1, 2] }, 31, [-2, 8, -11, 8, -2], ''],
  ['8_19', { torus: [3, 4] }, 3, [1, -1, 0, 1, 0, -1, 1], 'torus knot $T(3,4)$'],
  ['8_20', { pretzel: [3, -3, 2] }, 9, [1, -2, 3, -2, 1], ''],
];
const LINKS = [
  ['2^2_1', { torus: [2, 2] }, 2, 'Hopf link'],
  ['4^2_1', { torus: [2, 4] }, 4, 'Solomon link'],
  ['5^2_1', { rational: [2, 1, 2] }, 8, 'Whitehead link'],
  ['6^2_1', { torus: [2, 6] }, 6, 'torus link $T(2,6)$'],
  ['6^2_2', { rational: [3, 3] }, 10, ''],
  ['6^2_3', { rational: [2, 2, 2] }, 12, ''],
  ['6^3_2', { braid: [3, [1, -2, 1, -2, 1, -2]] }, 16, 'Borromean rings'],
];

const pairs = p => P.toPairs(p);
const coeffs = p => { // dense, lowest power first
  const pr = pairs(p); if (!pr.length) return [];
  const lo = pr[0][0], out = new Array(pr[pr.length - 1][0] - lo + 1).fill(0);
  for (const [e, c] of pr) out[e - lo] = c;
  return out;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let problems = 0;
const entries = [];

for (const [name, recipe, det, alex, nick] of KNOTS) {
  const r = invOf(recipe);
  const crossing = +name.split('_')[0];
  const a = coeffs(r.alexander);
  const msgs = [];
  if (r.components !== 1) msgs.push(`components ${r.components}`);
  if (r.determinant !== det) msgs.push(`det ${r.determinant} ≠ ${det}`);
  if (!same(a, alex) && !same(a.map(x => -x), alex)) msgs.push(`Δ [${a}] ≠ [${alex}] (soft)`);
  if (msgs.length) { problems++; console.log('PROBLEM', name, msgs.join('; ')); }
  const V = r.jones;
  entries.push({
    name, nick, kind: 'knot', crossing, det: r.determinant,
    jones: pairs(V), alexander: pairs(r.alexander),
    amphichiral: P.equal(V, P.mirror(V)), genus: r.genusLower === r.seifertGenus ? r.genusLower : null,
    recipe, ...(recipe.torus ? { torus: recipe.torus, positiveWrithe: r.writhe > 0 } : {}),
  });
  console.log(name.padEnd(5), 'det', String(r.determinant).padStart(2), 'Δ', P.tex(r.alexander).padEnd(36), 'V', P.tex(V));
}

// Non-rational 8-crossing knots: search 3-braid words of length 8 and pin each knot down by determinant
// (8_16: 35, 8_17: 37, 8_18: 45 are unique among ≤8-crossing knots; 8_10: 27 but not 8_11; 8_21: 15 but
// not 7_4, 3_1#4_1 or 3_1#5_1).
const jonesOf = name => P.from(entries.find(e => e.name === name).jones);
const eqUpToMirror = (a, b) => P.equal(a, b) || P.equal(a, P.mirror(b));
const want = { '8_10': 27, '8_16': 35, '8_17': 37, '8_18': 45, '8_21': 15 };
const found = {};
const letters = [1, -1, 2, -2];
const seen = new Set();
const t0 = Date.now();
for (let code = 0; code < 4 ** 8 && Object.keys(found).length < 5; code++) {
  const w = [];
  let c = code;
  for (let i = 0; i < 8; i++) { w.push(letters[c % 4]); c = Math.floor(c / 4); }
  if (!w.some(x => Math.abs(x) === 1) || !w.some(x => Math.abs(x) === 2)) continue;
  let can = null; // canonical rotation
  for (let r = 0; r < 8; r++) { const s = w.slice(r).concat(w.slice(0, r)).join(','); if (can === null || s < can) can = s; }
  if (seen.has(can)) continue;
  seen.add(can);
  const recipe = { braid: [3, w] };
  const curves = curvesOf(recipe);
  if (curves.length !== 1) continue;
  const r = diagramInvariants(projectDiagram(curves, [0, 0, 1]).gauss);
  for (const [name, det] of Object.entries(want)) {
    if (found[name] || r.determinant !== det) continue;
    if (name === '8_10' && eqUpToMirror(r.jones, jonesOf('8_11'))) continue;
    if (name === '8_21') {
      const t31 = jonesOf('3_1'), t41 = jonesOf('4_1'), t51 = jonesOf('5_1');
      const bad = [jonesOf('7_4'), P.mul(t31, t41), P.mul(t31, t51), P.mul(t31, P.mirror(t51))];
      if (bad.some(b => eqUpToMirror(r.jones, b))) continue;
    }
    if (P.span(r.jones) > 8) continue;
    found[name] = { w, r };
  }
}
console.log(`braid search: ${seen.size} words, ${Date.now() - t0} ms`);
for (const name of Object.keys(want)) {
  const f = found[name];
  if (!f) { problems++; console.log('PROBLEM: no braid found for', name); continue; }
  const r = f.r;
  entries.push({
    name, nick: '', kind: 'knot', crossing: 8, det: r.determinant, jones: pairs(r.jones), alexander: pairs(r.alexander),
    amphichiral: P.equal(r.jones, P.mirror(r.jones)), genus: r.genusLower === r.seifertGenus ? r.genusLower : null,
    recipe: { braid: [3, f.w] },
  });
  console.log(name.padEnd(5), 'braid', f.w.join(' '), 'Δ', P.tex(r.alexander), 'V', P.tex(r.jones));
}

// composites (Jones and Alexander are multiplicative under connected sum)
const byName = n => entries.find(e => e.name === n);
const COMPOSITES = [
  ['3_1', '3_1', false, 'granny knot'], ['3_1', '3_1', true, 'square knot'], ['3_1', '4_1', false, ''],
  ['4_1', '4_1', false, ''], ['3_1', '5_1', false, ''], ['3_1', '5_1', true, ''], ['3_1', '5_2', false, ''], ['3_1', '5_2', true, ''],
];
for (const [a, b, mirrorB, nick] of COMPOSITES) {
  const A = byName(a), B = byName(b);
  const VB = mirrorB ? P.mirror(P.from(B.jones)) : P.from(B.jones);
  if (B.amphichiral && mirrorB) continue;
  const V = P.mul(P.from(A.jones), VB);
  const D = P.mul(P.from(A.alexander), P.from(B.alexander));
  entries.push({
    name: `${a}#${b}${mirrorB ? '*' : ''}`, nick, kind: 'composite', crossing: A.crossing + B.crossing,
    det: A.det * B.det, jones: pairs(V), alexander: pairs(D), amphichiral: P.equal(V, P.mirror(V)),
    genus: (A.genus ?? NaN) + (B.genus ?? NaN), parts: [a, b], mirrorB,
  });
}

for (const [name, recipe, det, nick] of LINKS) {
  const r = invOf(recipe);
  const comps = +name.split('^')[1].split('_')[0];
  if (r.determinant !== det || r.components !== comps) { problems++; console.log('PROBLEM', name, 'det', r.determinant, 'components', r.components); }
  entries.push({
    name, nick, kind: 'link', crossing: +name.split('^')[0], components: r.components, det: r.determinant,
    bracket: pairs(P.normalizeUnit(r.bracket)), jones: pairs(r.jones), recipe,
  });
  console.log(name.padEnd(6), 'μ', r.components, 'det', r.determinant, '⟨D⟩', P.tex(P.normalizeUnit(r.bracket), 'A'));
}

const header = `// Generated by tools/buildTable.mjs — do not edit by hand.
// Invariants computed by this app's own pipeline from reference curves (4-plats, pretzels, braid closures).
// Jones: [[exponent of t, coefficient]]; links store the Kauffman bracket up to ±A^k (orientation-free).
`;
writeFileSync(new URL('../js/knotTable.js', import.meta.url), `${header}export const KNOT_TABLE = ${JSON.stringify(entries)};\n`);
console.log(`\n${entries.length} entries written; ${problems} problem(s)`);
