const base = new URL('../js/', import.meta.url).href;
const { setSettings, S } = await import(base + 'config.js');
const { PRESETS } = await import(base + 'presets.js');
const { replay, buildFoam, prepareWeb } = await import(base + 'foam.js');
const { applyOp, MoveError, digonSplits } = await import(base + 'moves.js');
const { validate } = await import(base + 'web.js');
let seed = +(process.argv[2] || 1);
globalThis.__wfStrict = true;
let netHits = 0; const cw = console.warn; console.warn = (...a) => { if (String(a[0]).startsWith('internal:')) { netHits++; if (netHits < 6) cw(...a); } else cw(...a); };
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const TYPES = ['cup', 'cap', 'saddle', 'zip', 'unzip', 'dbirth', 'ddeath', 'tbirth', 'tdeath', 'assoc', 'iso', 'lift', 'lift', 'r1', 'r1d', 'r5', 'r5', 'r5d'];
const stats = {}; let crashes = 0, invalid = 0, badFacet = 0, runs = 0;
for (let run = 0; run < +(process.argv[3] || 60); run++) {
  const P = PRESETS[run % PRESETS.length].make();
  setSettings({ N: P.N, mode: P.mode });
  let W = prepareWeb(P.W0);
  const ops = [];
  for (let step = 0; step < 14; step++) {
    const t = pick(TYPES);
    const E = Object.keys(W.edges);
    let op = { uid: 'f' + step, type: t };
    const rp = () => { const a = rnd() * 2 * Math.PI, r = Math.sqrt(rnd()) * 0.85; return [r * Math.cos(a), r * Math.sin(a)]; };
    if (t === 'cup') Object.assign(op, { p: rp(), label: 1 + Math.floor(rnd() * (S.mode === 'sl' ? S.N - 1 : S.N)), ccw: rnd() < 0.5 });
    else if (t === 'tbirth') Object.assign(op, { p: rp(), a: 1, b: 1 });
    else if (t === 'r5') {
      const inc = (await import(base + 'web.js')).incid(W);
      const vs = Object.keys(W.verts).filter(v => !W.verts[v].bd && !W.verts[v].cr && inc[v].length === 3);
      if (!vs.length) continue;
      const v = pick(vs), R = (await import(base + 'web.js')).rot(W, inc, v), k = Math.floor(rnd() * 3);
      Object.assign(op, { v, a: R[k].e, b: R[(k + 1) % 3].e, over: rnd() < 0.5 ? 1 : -1 });
    }
    else if (t === 'iso') {
      const vs = Object.keys(W.verts).filter(v => !W.verts[v].bd);
      if (!vs.length) continue;
      const v = pick(vs); const p = [W.verts[v].x + (rnd() - 0.5) * 0.15, W.verts[v].y + (rnd() - 0.5) * 0.15];
      op.verts = { [v]: p }; op.edges = {};
    } else {
      if (!E.length) continue;
      if (t === 'saddle' || t === 'zip') Object.assign(op, { e1: pick(E), s1: rnd(), e2: pick(E), s2: rnd() });
      else if (t === 'lift') Object.assign(op, { e: pick(E), s: rnd(), d: [(rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.9], level: rnd() < 0.5 ? 1 : -1 });
      else if (t === 'r1') Object.assign(op, { e: pick(E), s: rnd(), side: rnd() < 0.5 ? 1 : -1, over: rnd() < 0.5 ? 1 : -1 });
      else if (t === 'dbirth') { const e = pick(E); const sp = digonSplits(W.edges[e].label); if (!sp.length) continue; const [p, q] = pick(sp); Object.assign(op, { e, s: rnd(), p, q }); }
      else op.e = pick(E);
    }
    let r;
    try { r = applyOp(W, op); }
    catch (err) {
      if (err instanceof MoveError) { (stats[t] ||= { ok: 0, fail: 0 }).fail++; continue; }
      crashes++; console.log('CRASH', t, err.stack.split('\n').slice(0, 4).join(' | ')); continue;
    }
    (stats[t] ||= { ok: 0, fail: 0 }).ok++;
    const v = validate(r.W);
    if (!v.ok) { if (t === 'iso') continue; invalid++; if (invalid < 12) { console.log('INVALID after', t, 'run', run, PRESETS[run % PRESETS.length].name, v.probs.filter(p => !p.warn).map(p => p.msg + ' ' + (p.e||'') + ' ' + (p.e2||'')).join('; ')); console.log('OPS', JSON.stringify(ops.concat([op]))); } continue; }
    W = r.W; ops.push(op);
  }
  const st = { N: P.N, mode: P.mode, W0: P.W0, W1: P.W1, ops, dots: [] };
  try {
    const R = replay(st); const F = buildFoam(R, { slabH: 0.5 });
    runs++;
    if (R.error) console.log('REPLAY ERROR', R.error);
    for (const f of F.facets) if (!f.orientable || f.genus == null || f.genus < 0 || !Number.isInteger(f.genus)) { badFacet++; if (badFacet < 10) console.log('BAD FACET', run, PRESETS[run % PRESETS.length].name, JSON.stringify(ops), ops.map(o => o.type).join(','), JSON.stringify({ chi: f.chi, b: f.b, g: f.genus, or: f.orientable })); }
  } catch (err) { crashes++; console.log('BUILD CRASH', err.stack.split('\n').slice(0, 4).join(' | ')); }
}
console.log({ runs, crashes, invalid, badFacet, safetyNet: netHits });
console.log(stats);
