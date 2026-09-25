// build-cascade.mjs — precompute the tuned Xia cascade shipped in js/cascade.js.
//
//   node docs/graphics/xiaTheorem/tools/build-cascade.mjs [--workers 6] [--restarts 10]
//
// Stage 0 searches binary A's initial phase M_A (with binary B's phase M_B on a
// coarse grid) for initial data whose first two encounters are both *good*
// bounces: Q₅ is flung back faster by a near triple collision. That is a
// nested search: each good bounce lives inside a sliver of the previous one's
// window, sitting next to an exact triple collision, and two or three levels
// use up the 16 digits of a double.
//
// To continue, the builder restarts at a mid-flight checkpoint before the
// deepest resolved bounce. There the approaching binary's Kepler phase is the
// new parameter: p = 0 is already good, and the search picks, inside that
// window, the trim nearest 0 that makes the next bounces good too. The result
// is a pseudo-orbit whose jumps (trims) are recorded and shown in the HUD. By
// shadowing, it stands in for the true orbit that exact initial data would
// give.

import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { classifySim, familySim, stateFor, pairA, BUILD_OPTS } from './xia-lib.mjs';
import { NBody } from '../js/nbody.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? Number(argv[i + 1]) : dflt; };
const WORKERS = arg('workers', 6), TARGET = arg('target', 10), BUDGET = arg('budget', 36);
const BASE = { m: 1, mu: 0.1, a: 1, e: 0.9999, Z: 8, MB: 1.0, w: 2.5, rotB: Math.PI / 2 };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── worker pool ──
class Pool {
  constructor(n) {
    this.workers = Array.from({ length: n }, () => new Worker(path.join(here, 'cascade-worker.mjs')));
    this.id = 0; this.pending = new Map();
    for (const w of this.workers) w.on('message', (m) => { const f = this.pending.get(m.id); this.pending.delete(m.id); f(m); });
  }
  call(w, msg) { return new Promise(res => { const id = ++this.id; this.pending.set(id, res); w.postMessage({ ...msg, id }); }); }
  async setFamily(fam) { await Promise.all(this.workers.map(w => this.call(w, { type: 'family', fam }))); }
  async evalMany(ps) {
    const n = this.workers.length, chunks = Array.from({ length: n }, () => []);
    ps.forEach((p, i) => chunks[i % n].push(p));
    const res = await Promise.all(chunks.map((c, k) => c.length ? this.call(this.workers[k], { type: 'eval', ps: c }) : { out: [] }));
    const out = new Array(ps.length);
    res.forEach((r, k) => r.out.forEach((o, j) => { out[k + j * n] = o; }));
    return out;
  }
  close() { this.workers.forEach(w => w.terminate()); }
}

const show = (r) => r.enc.map(e => e.vrel !== undefined ? `${e.X}${e.type[0]}:${e.v0.toFixed(2)}→${e.vrel.toFixed(2)} a${e.a0.toPrecision(3)}→${e.a1.toPrecision(3)} t${e.t.toFixed(4)}` : e.type).join(' | ');

// ── nested search over one family ──
async function nested(pool, fam, mode, depth, maxPicks = 1) {
  const picks = [];
  await pool.setFamily(fam);
  const memo = new Map();
  let evals = 0;
  const run = async (ps) => {
    const need = [...new Set(ps.filter(p => !memo.has(p)))];
    if (need.length) { const out = await pool.evalMany(need); need.forEach((p, i) => memo.set(p, out[i])); evals += need.length; }
    return ps.map(p => memo.get(p));
  };
  const fk = (r, k) => (r.score < k - 1 || !r.enc[k - 1]) ? NaN : (r.enc[k - 1].minR ?? NaN);
  let best = null;
  const consider = (p, r) => { if (!best || r.score > best.r.score || (r.score === best.r.score && Math.abs(p) < Math.abs(best.p))) best = { p, r }; };

  // Parallel bracketing of a minimum of minR_k on [a, b].
  async function refineMin(k, a, b) {
    for (let round = 0; round < 11; round++) {
      const pts = Array.from({ length: 13 }, (_, i) => a + (b - a) * i / 12);
      const rs = await run(pts);
      rs.forEach((r, i) => consider(pts[i], r));
      const f = rs.map(r => { const v = fk(r, k); return Number.isNaN(v) ? 1e9 : v; });
      let i = 0; for (let j = 1; j < 13; j++) if (f[j] < f[i]) i = j;
      const na = pts[Math.max(0, i - 1)], nb = pts[Math.min(12, i + 1)];
      if (nb - na >= b - a || nb - na < 4e-16 * Math.max(Math.abs(na), Math.abs(nb), 1e-300)) return { p: pts[i], f: f[i] };
      a = na; b = nb;
    }
    return { p: 0.5 * (a + b), f: fk(memo.get(a) || { score: -1, enc: [] }, k) };
  }

  async function explore(k, cands) {
    const fs_ = cands.map(c => fk(c.r, k));
    const mins = [];
    for (let i = 1; i < cands.length - 1; i++) {
      const a0 = cands[i].r.enc[k - 1]?.a0 ?? 1;
      if (fs_[i] <= fs_[i - 1] && fs_[i] <= fs_[i + 1] && fs_[i] < 0.35 * a0) mins.push(i);
    }
    // Restarts prefer the smallest trim; the initial search prefers the deepest triple collision.
    if (mode.restart) mins.sort((x, y) => Math.abs(cands[x].p) - Math.abs(cands[y].p));
    else mins.sort((x, y) => fs_[x] - fs_[y]);
    log(`${'  '.repeat(k)}level ${k}: ${cands.length} samples, ${mins.length} candidate triple collisions (evals ${evals})`);
    for (const i of mins.slice(0, 6)) {
      const g = await refineMin(k, cands[i - 1].p, cands[i + 1].p);
      const W = Math.abs(cands[i + 1].p - cands[i - 1].p);
      const sides = [];
      for (const sgn of [-1, 1]) {
        const ds = []; for (let j = 0; j <= 150; j++) { const d = W * 2 ** (-j / 3); if (g.p + sgn * d === g.p) break; ds.push(d); }
        const ps = ds.map(d => g.p + sgn * d);
        const rs = await run(ps);
        const pts = [];
        rs.forEach((r, j) => { consider(ps[j], r); if (r.score >= k) pts.push({ p: ps[j], d: ds[j], r }); });
        if (pts.length) sides.push({ sgn, pts });
      }
      const nGood = sides.reduce((s, w) => s + w.pts.length, 0);
      log(`${'  '.repeat(k)} p*=${g.p.toPrecision(17)} minR=${g.f.toExponential(2)} good=${nGood}`);
      if (!nGood) continue;
      if (k >= depth) {
        // Pick a robust bounce: moderate gain, and in the log-middle of its window,
        // so the next restart has room on both sides.
        const all = sides.flatMap(w => w.pts);
        const gain = (q) => Math.abs(q.r.enc[k - 1].vrel / q.r.enc[k - 1].v0);
        const pref = all.filter(q => gain(q) >= 1.4 && gain(q) <= 3.5);
        const pool_ = (pref.length ? pref : all).sort((a, b) => a.d - b.d);
        const pick = pool_[Math.floor(pool_.length / 2)];
        best = { p: pick.p, r: pick.r };
        if (!picks.some(q => Math.abs(q.p - pick.p) <= 1e-3 * Math.abs(pick.p - g.p))) picks.push({ p: pick.p, r: pick.r });
        if (picks.length >= maxPicks) return true;
        continue;
      }
      for (const w of sides) {
        if (w.pts.length < 2) continue;
        const dHi = w.pts[0].d, dLo = w.pts[w.pts.length - 1].d;
        const ps = Array.from({ length: 481 }, (_, j) => g.p + w.sgn * dHi * (dLo / dHi) ** (j / 480));
        const rs = await run(ps);
        const dense = [];
        rs.forEach((r, j) => { consider(ps[j], r); if (r.score >= k) dense.push({ p: ps[j], r }); });
        dense.sort((a, b) => a.p - b.p);
        if (dense.length > 2 && await explore(k + 1, dense)) return true;
      }
    }
    return false;
  }

  if (mode.restart) {
    // p = 0 already makes encounter 1 good: bracket that window, search deeper levels inside it.
    const [r0] = await run([0]); consider(0, r0);
    if (r0.score < 1) { log('restart: p = 0 is not good'); return best; }
    const edge = async (sgn) => {
      const ds = Array.from({ length: 70 }, (_, j) => 1e-15 * 2 ** (j / 2)).filter(d => d < mode.range);
      const rs = await run(ds.map(d => sgn * d));
      let good = 0, bad = null;
      for (let j = 0; j < ds.length; j++) { if (rs[j].score >= 1) good = sgn * ds[j]; else { bad = sgn * ds[j]; break; } }
      if (bad === null) return good;
      for (let round = 0; round < 14; round++) {
        const pts = Array.from({ length: 11 }, (_, i) => good + (bad - good) * i / 10);
        const rr = await run(pts);
        let j = 0; while (j < 10 && rr[j + 1].score >= 1) j++;
        const ng = pts[j], nb = pts[Math.min(10, j + 1)];
        if (ng === good && nb === bad) break;
        good = ng; bad = nb;
      }
      return good;
    };
    const L = await edge(-1), Rr = await edge(1);
    log(`  window around 0: [${L.toExponential(3)}, ${Rr.toExponential(3)}] (fraction of a period)`);
    const W = Rr - L, ps = [];
    for (let j = 0; j <= 170; j++) { const u = 0.5 * 2 ** (-j / 4); ps.push(L + W * u, Rr - W * u); }
    for (let j = 1; j < 120; j++) ps.push(L + W * j / 120);
    const inside = ps.filter(p => p > L && p < Rr);
    const rs = await run(inside);
    const dense = [];
    rs.forEach((r, j) => { consider(inside[j], r); if (r.score >= 1) dense.push({ p: inside[j], r }); });
    dense.sort((a, b) => a.p - b.p);
    await explore(2, dense);
  } else {
    const ps = Array.from({ length: 241 }, (_, i) => mode.lo + (mode.hi - mode.lo) * i / 240);
    const rs = await run(ps);
    rs.forEach((r, i) => consider(ps[i], r));
    await explore(1, ps.map((p, i) => ({ p, r: rs[i] })));
  }
  log(`  search done: ${evals} evaluations, best score ${best?.r.score} at p = ${best?.p}, ${picks.length} pick(s)`);
  if (best) best.picks = picks.length ? picks : [{ p: best.p, r: best.r }];
  return best;
}

// ── main ──
const pool = new Pool(WORKERS);
try {
  // Stage 0: coarse scan of M_A for the first triple collision.
  let MB = BASE.MB, best = null, bestMB = MB;
  const fam0 = (mb) => ({ kind: 'MA', base: BASE, MB: mb });
  await pool.setFamily(fam0(MB));
  const coarse = Array.from({ length: 181 }, (_, i) => 2 * Math.PI * i / 180);
  const cr = await pool.evalMany(coarse);
  const f = cr.map(r => r.enc[0]?.minR ?? 9);
  const seeds = coarse.map((p, i) => ({ p, f: f[i] })).filter((s, i) => i > 0 && i < 180 && s.f <= f[i - 1] && s.f <= f[i + 1] && s.f < 0.1).sort((a, b) => a.f - b.f);
  log('stage 0 seeds', seeds.map(s => `${s.p.toFixed(4)}:${s.f.toExponential(1)}`).join(' '));
  const h = 2 * Math.PI / 180;
  outer: for (let k = arg('mbk', 0); k < 24; k++) {
    MB = BASE.MB + k * 2 * Math.PI / 24;
    for (const sd of seeds.slice(0, 2)) {
      const b = await nested(pool, fam0(MB), { lo: sd.p - h, hi: sd.p + h }, 2);
      log(`M_B = ${MB.toFixed(4)}: score ${b?.r.score}  ${b ? show(b.r) : ''}`);
      if (b && (!best || b.r.score > best.r.score)) { best = b; bestMB = MB; }
      if (best && best.r.score >= 2) break outer;
    }
  }
  if (!best || best.r.score < 2) throw new Error('stage 0 found no double bounce');
  const base = { ...BASE, MA: best.p, MB: bestMB };
  log('stage 0:', best.p, show(best.r));

  // Depth-first search over restarts: each restart offers a few robust picks;
  // if a branch dies, back up and try the next pick. Keep the longest chain.
  const root = { fam: { kind: 'MA', base: BASE, MB: bestMB }, p: best.p, r: best.r,
    cps: [{ t: 0, trim: 0, X: null, state: stateFor({ kind: 'MA', base: BASE, MB: bestMB }, best.p) }] };
  let bestChain = root, searches = 0;
  const chainLength = (node) => node.len ?? node.r.score;
  root.len = root.r.score; root.hist = [];
  async function dfs(node) {
    if (chainLength(node) > chainLength(bestChain)) { bestChain = node; log(`  ★ chain of ${chainLength(node)} bounces`); fs.writeFileSync(path.join(os.tmpdir(), 'xia-cascade-progress.json'), JSON.stringify({ len: node.len, cps: node.cps })); }
    if (chainLength(node) >= TARGET || searches >= BUDGET) return;
    const r = node.r, sc = r.score;
    if (sc < 2) return;
    const target = r.enc[sc - 1], tPrev = r.enc[sc - 2].t;
    const tcp = 0.5 * (tPrev + target.t0);
    const s = familySim(node.fam, node.p);
    while (s.t < tcp) s.step();
    const st = { m: Array.from(s.m), t: s.t, x: Array.from(s.x), v: Array.from(s.v) };
    const ij = target.X === 'A' ? [0, 1] : [2, 3];
    const b = pairA(s, ij[0], ij[1]);
    const P = 2 * Math.PI * Math.sqrt(b.a ** 3 / (s.m[ij[0]] + s.m[ij[1]]));
    const nf = { kind: 'shift', state: st, ij, P };
    searches++;
    log(`restart #${searches} (chain ${chainLength(node)}): checkpoint t = ${st.t.toFixed(6)}, next binary ${target.X} (a = ${b.a.toPrecision(4)})`);
    const nb = await nested(pool, nf, { restart: true, range: 0.05 }, 2, 3);
    if (!nb || nb.r.score < 2) { log('  dead end'); return; }
    for (const pick of nb.picks) {
      if (pick.r.score < 2) continue;
      const child = { fam: nf, p: pick.p, r: pick.r, cps: [...node.cps, { t: st.t, trim: pick.p, X: target.X, state: stateFor(nf, pick.p) }],
        hist: [...node.hist, ...r.enc.slice(0, sc - 1)] };
      child.len = child.hist.length + pick.r.score;
      log(`  pick trim ${pick.p.toExponential(3)} of P_${target.X}: ${show(pick.r)}`);
      await dfs(child);
      if (chainLength(bestChain) >= TARGET || searches >= BUDGET) return;
    }
  }
  await dfs(root);
  const cps = bestChain.cps, r = bestChain.r;
  const history = [...bestChain.hist];
  const record = (enc, upto) => { for (const e of enc.slice(0, upto)) if (!history.some(h => Math.abs(h.t - e.t) < 1e-9)) history.push(e); };
  record(r.enc, r.score);
  history.sort((a, b) => a.t - b.t);

  // Sync checkpoints: one mid-flight state before every bounce, so a browser run
  // never carries round-off through more than one near triple collision.
  for (let k = 1; k < history.length; k++) {
    const tm = 0.5 * (history[k - 1].t + history[k].t0);
    const owner = [...cps].reverse().find(c => c.t <= tm);
    const next = cps.find(c => c.t > owner.t);
    if (owner.t > history[k - 1].t || (next && next.t <= history[k].t0)) continue;   // this flight already has one
    const s = NBody.fromState(owner.state, BUILD_OPTS);
    while (s.t < tm) s.step();
    cps.push({ t: s.t, trim: 0, X: null, state: { m: Array.from(s.m), t: s.t, x: Array.from(s.x), v: Array.from(s.v) } });
    cps.sort((a, b) => a.t - b.t);
  }

  // Finite-time estimate from the last bounce intervals: t_k ≈ t* − Cλᵏ.
  const T = history.map(e => e.t);
  let tStar = null;
  if (T.length >= 4) {
    const dts = T.slice(1).map((t, i) => t - T[i]);
    const ratios = dts.slice(1).map((d, i) => d / dts[i]).slice(-3);
    const lam = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    tStar = T[T.length - 1] + dts[dts.length - 1] * lam / (1 - lam);
  }
  const tEnd = history.length ? history[history.length - 1].t : 0;
  const bounces = history.map(e => ({ t: e.t, X: e.X, v0: Math.abs(e.v0), v1: Math.abs(e.vrel), a0: e.a0, a1: e.a1 }));
  log(`cascade: ${bounces.length} bounces, ${cps.length - 1} trims, t* ≈ ${tStar}`);
  bounces.forEach((e, i) => log(`  ${i + 1}. ${e.X} t=${e.t.toFixed(6)} |v| ${e.v0.toFixed(2)} → ${e.v1.toFixed(2)} (×${(e.v1 / e.v0).toFixed(2)}), a ${e.a0.toPrecision(3)} → ${e.a1.toPrecision(3)}`));
  const out = `// Generated by tools/build-cascade.mjs — do not edit by hand.\n// ${bounces.length} bounces; ${cps.filter(c => c.trim).length} trims (fraction of the approaching binary's period) + sync checkpoints.\nexport const CASCADE = ${JSON.stringify({ base, tStar, tEnd, bounces, cps })};\n`;
  fs.writeFileSync(path.join(here, '..', 'js', 'cascade.js'), out);
  log('wrote js/cascade.js');
} finally {
  pool.close();
}
