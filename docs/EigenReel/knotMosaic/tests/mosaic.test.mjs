// node tests/mosaic.test.mjs — every library mosaic walks, alternates, and has the published Jones polynomial.
import { LIBRARY, walk, jones, formatJones, writhe, toArt, identify, fromArt, Poly } from '../mosaic.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('  FAIL', msg); } };
const eqV = (v, want) => {
  const w = new Map(Object.entries(want).map(([e, c]) => [+e, c]));
  if (v.size !== w.size) return false;
  for (const [e, c] of w) if (v.get(e) !== c) return false;
  return true;
};
const mirrorV = v => new Map([...v].map(([e, c]) => [-e, c]));
const evalV = (v, t) => [...v].reduce((s, [e, c]) => s + c * Math.pow(t, e), 0);

// a kinked unknot: V must be 1 whichever way the kink goes (checks smoothing vs writhe conventions)
for (const kink of ['┿', '╂']) {
  const g = fromArt([' ╭╮ ', `╭${kink}╯ `, '╰╯  ']);
  const { error } = walk(g);
  if (error) { console.log('kink art error', error); fail++; continue; }
  const v = jones(g);
  check(v.size === 1 && v.get(0) === 1, `kinked unknot ${kink}: V = ${formatJones(v)}`);
}

for (const e of LIBRARY) {
  const g = e.grid();
  const { comps, error } = walk(g);
  const v = jones(g), wr = writhe(g), id = identify(g);
  console.log(`\n${e.name}  ${g.length}×${g.length}  components ${comps.length}  writhe ${wr.w}  lk ${JSON.stringify(wr.lk)}`);
  console.log(toArt(g).map(l => '   ' + l).join('\n'));
  console.log('   V =', formatJones(v), '  →', id.name, id.mirror ? '(mirror)' : '');
  check(!error, `${e.key} walk: ${error}`);
  // over/under alternate along every strand
  if (e.key !== 'unknot') for (const c of comps) c.passes.forEach((p, i) => check(p.over === c.passes[(i + 1) % c.passes.length].over ? false : true, `${e.key} not alternating`));
  check(Math.abs(evalV(v, 1) - Math.pow(-2, comps.length - 1)) < 1e-9, `${e.key} V(1)`);
  if (e.V) check(eqV(v, e.V) || eqV(mirrorV(v), e.V), `${e.key}: V = ${formatJones(v)}`);
}
// right-handed trefoil: all crossings positive ⇒ V = t + t³ − t⁴
const tre = LIBRARY[1].grid(), wt = writhe(tre).w, vt = jones(tre);
check(wt === 3 ? eqV(vt, { 1: 1, 3: 1, 4: -1 }) : wt === -3 ? eqV(vt, { '-1': 1, '-3': 1, '-4': -1 }) : false, `trefoil chirality: w=${wt} V=${formatJones(vt)}`);
console.log(fail ? `\n${fail} failures` : '\nall good');
process.exit(fail ? 1 : 0);
