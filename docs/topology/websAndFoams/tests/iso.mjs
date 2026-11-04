const base = new URL('../js/', import.meta.url).href;
const { setSettings, S } = await import(base + 'config.js');
const { PRESETS } = await import(base + 'presets.js');
const { prepareWeb } = await import(base + 'foam.js');
const { applyOp, MoveError, digonSplits } = await import(base + 'moves.js');
const { isoMap, validate, canonCode } = await import(base + 'web.js');
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const TYPES = ['cup', 'saddle', 'zip', 'unzip', 'dbirth', 'tbirth', 'assoc', 'ddeath'];
let pos = 0, posOK = 0, neg = 0, negOK = 0, mapBad = 0;
for (let run = 0; run < 300; run++) {
  const P = PRESETS[run % PRESETS.length].make(); setSettings({ N: P.N, mode: P.mode });
  let W = prepareWeb(P.W0);
  for (let step = 0; step < 10; step++) {
    const t = pick(TYPES), E = Object.keys(W.edges);
    const rp = () => { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.85; return [r * Math.cos(a), r * Math.sin(a)]; };
    let op = { uid: 'r' + step, type: t };
    if (t === 'cup') Object.assign(op, { p: rp(), label: 1, ccw: rnd() < 0.5 });
    else if (t === 'tbirth') Object.assign(op, { p: rp(), a: 1, b: 1 });
    else { if (!E.length) continue;
      if (t === 'saddle' || t === 'zip') Object.assign(op, { e1: pick(E), s1: rnd(), e2: pick(E), s2: rnd() });
      else if (t === 'dbirth') { const e = pick(E); const sp = digonSplits(W.edges[e].label); if (!sp.length) continue; const [p, q] = pick(sp); Object.assign(op, { e, s: rnd(), p, q }); }
      else op.e = pick(E); }
    try { const r = applyOp(W, op); if (validate(r.W).ok) W = r.W; } catch (e) { if (!(e instanceof MoveError)) throw e; }
  }
  // positive: rename ids + tiny perturbation of interior points
  const ren = x => 'Z' + x.split('').reverse().join('');
  const X = { verts: {}, edges: {} };
  for (const id in W.verts) { const v = W.verts[id]; const nid = v.bd ? id : ren(id); X.verts[nid] = { ...v, id: nid, x: v.x + (v.bd ? 0 : (rnd() - 0.5) * 1e-4), y: v.y + (v.bd ? 0 : (rnd() - 0.5) * 1e-4) }; }
  for (const id in W.edges) { const e = W.edges[id]; const a = W.verts[e.a].bd ? e.a : ren(e.a), b = W.verts[e.b].bd ? e.b : ren(e.b);
    X.edges[ren(id)] = { id: ren(id), a, b, label: e.label, ...(e.ov ? { ov: e.ov.slice() } : {}), pts: e.pts.map((p, i) => (i === 0 ? [X.verts[a].x, X.verts[a].y] : i === e.pts.length - 1 ? [X.verts[b].x, X.verts[b].y] : p)) }; }
  pos++; const m = isoMap(W, X);
  if (m) { posOK++;
    // check the map is a bijection on edges with matching endpoints
    const tos = Object.values(m.edges).map(x => x.to);
    if (new Set(tos).size !== Object.keys(W.edges).length || tos.length !== Object.keys(W.edges).length) mapBad++;
    for (const id in m.edges) { const e = W.edges[id], f = X.edges[m.edges[id].to]; const [fa, fb] = m.edges[id].flip ? [f.b, f.a] : [f.a, f.b];
      if (m.verts[e.a] !== fa || m.verts[e.b] !== fb) { mapBad++; break; } }
  } else console.log('positive FAILED run', run, canonCode(W) === canonCode(X));
  // negative: flip one non-self-dual edge, or change a label
  const ids = Object.keys(X.edges); if (!ids.length) continue;
  const Y = structuredClone(X); const e = Y.edges[pick(ids)];
  if (S.mode === 'gl' || 2 * e.label !== S.N) { [e.a, e.b] = [e.b, e.a]; e.pts.reverse(); neg++; if (!isoMap(W, Y)) negOK++; else console.log('negative matched run', run); }
}
console.log({ pos, posOK, neg, negOK, mapBad });
