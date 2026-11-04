// node tl.test.js — checks the exact engine against known identities and knot data
const TL = require('./tl.js');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL', msg); } };
const time = (label, f) => { const t = Date.now(); const r = f(); console.log(`  ${label}: ${Date.now() - t} ms`); return r; };

// --- dimensions: Catalan numbers, Σ dim(W_{n,k})² = C_n
const CAT = [1, 1, 2, 5, 14, 42, 132, 429, 1430];
for (let n = 1; n <= 8; n++) {
  const B = TL.basis(n);
  ok(B.size === CAT[n], `dim TL_${n} = C_${n}`);
  let s = 0;
  for (let k = n % 2; k <= n; k += 2) {
    const C = TL.cellModule(B, k);
    ok(C.size === TL.cellDim(n, k), `dim W_{${n},${k}}`);
    s += C.size * C.size;
  }
  ok(s === CAT[n], `Σ dim² = C_${n}`);
  for (const code of B.codes) ok(TL.matchToDyck(TL.dyckToMatch(code, n), n) === code, 'dyck roundtrip');
  const W = TL.words(B);
  ok(W.every(w => w !== null), `every diagram of TL_${n} is a word in the e_i`);
}

const fields = [TL.makeField('delta'), TL.makeField('A'), TL.makeField('num', '3/2'), TL.makeField('num', '-5')];
for (const F of fields) {
  const n = 5, T = new TL.Algebra(n, F), d = F.delta;
  for (let i = 1; i < n; i++) {
    ok(T.eq(T.mul(T.e(i), T.e(i)), T.scale(T.e(i), d)), `${F.label}: e${i}² = δe${i}`);
    if (i + 1 < n) {
      ok(T.eq(T.mul(T.mul(T.e(i), T.e(i + 1)), T.e(i)), T.e(i)), `${F.label}: e${i}e${i + 1}e${i} = e${i}`);
      ok(T.eq(T.mul(T.mul(T.e(i + 1), T.e(i)), T.e(i + 1)), T.e(i + 1)), `${F.label}: e${i + 1}e${i}e${i + 1} = e${i + 1}`);
    }
    for (let j = i + 2; j < n; j++) ok(T.eq(T.mul(T.e(i), T.e(j)), T.mul(T.e(j), T.e(i))), `${F.label}: far commutation`);
  }
  // * is an anti-automorphism, mirror an automorphism, rot has order 2n
  const x = T.add(T.mul(T.e(1), T.e(2)), T.scale(T.mul(T.e(3), T.e(2)), F.fromInt(3)));
  const y = T.add(T.e(4), T.mul(T.e(2), T.e(1)));
  ok(T.eq(T.star(T.mul(x, y)), T.mul(T.star(y), T.star(x))), `${F.label}: (xy)* = y*x*`);
  ok(T.eq(T.mirror(T.mul(x, y)), T.mul(T.mirror(x), T.mirror(y))), `${F.label}: mirror is multiplicative`);
  let r = x; for (let i = 0; i < 2 * n; i++) r = T.rot(r);
  ok(T.eq(r, x), `${F.label}: rot^(2n) = id`);
  // trace: tr(xy) = tr(yx), and the cell decomposition tr = Σ_k [k+1] χ_k
  ok(F.eq(T.trace(T.mul(x, y)), T.trace(T.mul(y, x))), `${F.label}: tr(xy) = tr(yx)`);
  const z = T.mul(T.add(x, T.identity()), y);
  let s = F.zero;
  for (let k = n % 2; k <= n; k += 2) s = F.add(s, F.mul(F.qint(k + 1), T.cellChar(z, k)));
  ok(F.eq(s, T.trace(z)), `${F.label}: tr = Σ [k+1] χ_k`);
  // cell matrices are a representation
  for (let k = n % 2; k <= n; k += 2) {
    const Mx = T.cellMatrix(x, k), My = T.cellMatrix(y, k), Mxy = T.cellMatrix(T.mul(x, y), k);
    const m = Mx.length;
    let good = true;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
      let t = F.zero;
      for (let l = 0; l < m; l++) t = F.add(t, F.mul(Mx[i][l], My[l][j]));
      if (!F.eq(t, Mxy[i][j])) good = false;
    }
    ok(good, `${F.label}: ρ_${k}(xy) = ρ_${k}(x)ρ_${k}(y)`);
  }
}

// --- Jones–Wenzl: idempotent, killed by caps, trace [k+1], agrees with Wenzl's recursion
for (const F of fields.slice(0, 3)) {
  for (let k = 2; k <= 6; k++) {
    const T = new TL.Algebra(k, F), p = T.jw(k);
    ok(T.eq(T.mul(p, p), p), `${F.label}: p${k}² = p${k}`);
    let killed = true;
    for (let i = 1; i < k; i++) if (T.mul(T.e(i), p).size || T.mul(p, T.e(i)).size) killed = false;
    ok(killed, `${F.label}: e_i p${k} = p${k} e_i = 0`);
    ok(F.eq(T.trace(p), F.qint(k + 1)), `${F.label}: tr(p${k}) = [${k + 1}]`);
    const q = T.jw(k - 1), q1 = T.embed(TL.jwIn(F, k - 1), k - 1, 0);
    const wenzl = T.sub(q1, T.scale(T.mul(T.mul(q1, T.e(k - 1)), q1), F.div(F.qint(k - 1), F.qint(k))));
    ok(T.eq(wenzl, p), `${F.label}: Wenzl recursion agrees for p${k}`);
    ok(T.eq(T.star(p), p) && T.eq(T.mirror(p), p), `${F.label}: p${k} is * and mirror invariant`);
    void q;
  }
}
{
  const F = fields[0], T = new TL.Algebra(3, F), p = T.jw(3);
  console.log('  p3 =', [...p].map(([id, c]) => (w => (w ? F.text(c) + '*' + w : F.text(c)))(TL.words(T.B)[id].map(i => 'e' + i).join(''))).join('  +  '));
}
{
  // [3] = 0 when δ = 1  ⇒  p3 should refuse
  const F = TL.makeField('num', '1');
  let threw = false; try { new TL.Algebra(3, F).jw(3); } catch (e) { threw = /\[3\] = 0/.test(e.message); }
  ok(threw, 'p3 undefined at δ = 1');
  const T = new TL.Algebra(2, F); ok(T.eq(T.mul(T.jw(2), T.jw(2)), T.jw(2)), 'p2 fine at δ = 1');
}

// --- braids (ℚ(A))
{
  const F = fields[1], T = new TL.Algebra(4, F);
  const s = (i, e = 1) => T.sigma(i, e);
  ok(T.eq(T.mul(T.mul(s(1), s(2)), s(1)), T.mul(T.mul(s(2), s(1)), s(2))), 'σ1σ2σ1 = σ2σ1σ2');
  ok(T.eq(T.mul(s(1), s(1, -1)), T.identity()), 'σσ⁻¹ = 1');
  ok(T.eq(T.mul(s(1), s(3)), T.mul(s(3), s(1))), 'σ1σ3 = σ3σ1');
  // skein: σ − σ⁻¹ = (A − A⁻¹)(1 − e)
  ok(T.eq(T.sub(s(2), s(2, -1)), T.scale(T.sub(T.identity(), T.e(2)), F.sub(F.A, F.Ainv))), 'skein relation');
  // quadratic: (σ − A)(σ + A⁻³) = 0
  const A3 = F.pow(F.A, -3);
  ok(T.mul(T.sub(s(1), T.scale(T.identity(), F.A)), T.add(s(1), T.scale(T.identity(), A3))).size === 0, '(σ−A)(σ+A⁻³) = 0');
  // the full twist is central
  const ft = T.braid([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
  ok(T.commutesWithAll(ft), 'full twist Δ² is central in TL_4');
  // the full twist acts on W_{4,k} by a scalar
  for (let k = 0; k <= 4; k += 2) {
    const M = T.cellMatrix(ft, k);
    let scalar = true;
    for (let i = 0; i < M.length; i++) for (let j = 0; j < M.length; j++) if (i === j ? !F.eq(M[i][j], M[0][0]) : !F.isZero(M[i][j])) scalar = false;
    ok(scalar, `Δ² acts by a scalar on W_{4,${k}}: ${F.text(M[0][0], { deltaForm: false })}`);
  }
}

// --- Jones polynomials of closures
function jones(n, word, plat) {
  const F = fields[1], T = new TL.Algebra(n, F), x = T.braid(word);
  const br = F.div(plat ? T.plat(x) : T.trace(x), F.delta);
  const { writhe, components } = TL.braidClosure(word, n, plat);
  return { V: TL.laurentT(TL.jonesFromBracket(br, writhe), false), components, br: F.text(br, { deltaForm: false }) };
}
const knots = [
  ['unknot σ1', 2, [1], false, '1'],
  ['right trefoil σ1³', 2, [1, 1, 1], false, 't + t^(3) - t^(4)'],
  ['left trefoil σ1⁻³', 2, [-1, -1, -1], false, '-t^(-4) + t^(-3) + t^(-1)'],
  ['figure eight (σ1σ2⁻¹)²', 3, [1, -2, 1, -2], false, 't^(-2) - t^(-1) + 1 - t + t^(2)'],
  ['Hopf σ1²', 2, [1, 1], false, '-t^(1/2) - t^(5/2)'],
  ['Borromean (σ1σ2⁻¹)³', 3, [1, -2, 1, -2, 1, -2], false, '-t^(-3) + 3*t^(-2) - 2*t^(-1) + 4 - 2*t + 3*t^(2) - t^(3)'],
  ['T(3,4) = 8_19', 3, [1, 2, 1, 2, 1, 2, 1, 2], false, 't^(3) + t^(5) - t^(8)'],
  ['cinquefoil σ1⁵', 2, [1, 1, 1, 1, 1], false, 't^(2) + t^(4) - t^(5) + t^(6) - t^(7)'],
  // Sage cross-checks: Link(BraidGroup(n)(w)).jones_polynomial()
  ['T(3,3) full twist (Sage)', 3, [1, 2, 1, 2, 1, 2], false, 't^(2) + t^(4) + 2*t^(6)'],
  ['random 4-braid (Sage)', 4, [1, 2, 3, -2, 1, -3, 2, 2, -1], false, 't + t^(3) - t^(4)'],
  ['random 4-braid link (Sage)', 4, [1, 1, 2, -3, 2, 1, 3, 3], false, '-t^(3/2) + t^(5/2) - 2*t^(7/2) + 2*t^(9/2) - 3*t^(11/2) + t^(13/2) - t^(15/2) + t^(17/2)'],
  ['random 5-braid (Sage)', 5, [1, 2, -3, 4, -1, 2, 3, -4, 2], false, '-t^(1/2) - t^(5/2)'],
  ['plat σ2 = unknot', 4, [2], true, '1'],
  ['plat σ2²σ1⁻¹σ2 = figure eight', 4, [2, 2, -1, 2], true, 't^(-2) - t^(-1) + 1 - t + t^(2)'],
  ['plat σ2³ = trefoil', 4, [2, 2, 2], true, null],
  ['plat σ2² = Hopf', 4, [2, 2], true, null],
  ['plat σ2σ1⁻¹σ2 = left trefoil', 4, [2, -1, 2], true, '-t^(-4) + t^(-3) + t^(-1)'],
];
for (const [name, n, w, plat, want] of knots) {
  const r = jones(n, w, plat);
  if (want !== null) ok(r.V === want, `${name}: V = ${r.V}${r.V === want ? '' : '   (want ' + want + ')'}`);
  console.log(`  ${name}: ${r.components} comp, ⟨⟩ = ${r.br}, V = ${r.V}`);
}

// --- Gram determinants vs the Ridout–Saint-Aubin product formula
{
  const F = fields[0];
  for (let n = 1; n <= 7; n++) for (let k = n % 2; k <= n; k += 2) {
    const det = TL.gramDet(n, k);
    let f = F.one;
    for (let j = 1; j <= (n - k) / 2; j++)
      f = F.mul(f, F.pow(F.div(F.qint(k + j + 1), F.qint(j)), TL.cellDim(n, k + 2 * j)));
    const got = { v: 0, n: det, d: [1n] };
    const g = TL.RF.mul(got, TL.RF.one);
    ok(F.eq(g, f), `det G_{${n},${k}} = Π ([k+j+1]/[j])^{dim W_{n,k+2j}}`);
  }
  console.log('  det G_{6,0} =', TL.rfText(TL.rfFromPoly(TL.gramDet(6, 0)), 'd', 'delta', true));
}

// --- minimal polynomials / inverses / field conversions
{
  const F = fields[1], T = new TL.Algebra(3, F);
  const mp = T.minpoly(T.e(1));
  ok(mp.length === 3 && F.isZero(mp[0]) && F.eq(mp[1], F.neg(F.delta)) && F.isOne(mp[2]), 'minpoly(e1) = X² − δX');
  const ms = T.minpoly(T.sigma(1, 1));
  console.log('  minpoly σ1:', ms.map(c => F.text(c, { deltaForm: false })).join(', '));
  ok(ms.length === 3, 'σ1 has a quadratic minimal polynomial');
  const x = T.add(T.identity(), T.scale(T.e(1), F.fromInt(2)));
  ok(T.eq(T.mul(x, T.inverse(x)), T.identity()), '(1 + 2e1)⁻¹');
  const b = T.braid([1, -2, 1]);
  ok(T.eq(T.mul(b, T.inverse(b)), T.identity()), 'inverse of a braid via its minimal polynomial');
  const c = F.div(F.qint(2), F.qint(3));
  console.log('  [2]/[3] in δ-form:', F.text(c), '| factored:', F.text(c, { factored: true }), '| A-form:', F.text(c, { deltaForm: false }));
  ok(F.text(c) === 'd/(d^2 - 1)' || F.text(c) === '(d)/(d^2 - 1)', 'δ-form conversion of [2]/[3]');
}

// --- timing
console.log('timings');
for (const F of [fields[0], fields[1]]) {
  for (let k = 7; k <= 8; k++) {
    const T = new TL.Algebra(k, F);
    const p = time(`${F.label} p${k}`, () => T.jw(k));
    if (k === 7) time(`${F.label} p7·p7`, () => T.mul(p, p));
    console.log(`    p${k} has ${p.size} terms`);
  }
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
