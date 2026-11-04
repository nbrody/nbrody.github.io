const base = new URL('../js/', import.meta.url).href;
const { setSettings } = await import(base + 'config.js');
const { PRESETS } = await import(base + 'presets.js');
const { replay, buildFoam } = await import(base + 'foam.js');
const { validate } = await import(base + 'web.js');
for (const P of PRESETS) {
  const st = P.make();
  setSettings({ N: st.N, mode: st.mode });
  st.dots ||= [];
  const t0 = performance.now();
  let R, F;
  try { R = replay(st); F = buildFoam(R, { slabH: 0.55 }); }
  catch (e) { console.log('!!', P.name, e.stack); continue; }
  const ms = (performance.now() - t0).toFixed(0);
  const v0 = validate(st.W0), v1 = validate(st.W1);
  console.log(`\n== ${P.name}  (${ms} ms)  W0 ok=${v0.ok} W1 ok=${v1.ok} ${v0.ok ? '' : JSON.stringify(v0.probs.map(p=>p.msg))} ${v1.ok ? '' : JSON.stringify(v1.probs.map(p=>p.msg))}`);
  console.log('  error:', R.error, ' complete:', F.complete, ' frames:', R.frames.length);
  R.valid.forEach((v, k) => { if (!v.ok) console.log('  frame', k, 'invalid:', v.probs.map(p => p.msg).join('; ')); });
  console.log('  facets:', F.facets.map(f => `#${f.id}[L${f.label} χ${f.chi} b${f.b} g${f.genus}]`).join(' '));
  console.log('  χ(foam)=', F.chi, ' seams', JSON.stringify(F.seamInfo), ' sing', F.sing.length);
}
