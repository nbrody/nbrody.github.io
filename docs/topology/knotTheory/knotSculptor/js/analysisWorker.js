// Module worker: knot invariants off the main thread (VR needs a steady frame rate).
// in:  { type: 'analyze', id, components, geometryOnly }
// out: { type: 'analysis', id, result } with polynomials as [[exponent, coefficient]] arrays.
import { P } from './poly.js';
import { bestDiagram } from './diagram.js';
import { diagramInvariants, geometricInvariants } from './invariants.js';
import { identify } from './identify.js';

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.type !== 'analyze') return;
  const t0 = performance.now();
  try {
    const comps = m.components;
    const result = { geometry: geometricInvariants(comps) };
    if (!m.geometryOnly) {
      if (!comps.length) {
        result.inv = { components: 0 };
        result.id = identify({ components: 0 });
      } else {
        const best = bestDiagram(comps);
        const inv = diagramInvariants(best.simplified, { simplify: false });
        const ident = identify(inv);
        delete ident.entry;
        result.inv = {
          components: inv.components, crossings: inv.crossings, writhe: inv.writhe,
          seifertCircles: inv.seifertCircles, seifertGenus: inv.seifertGenus, genusLower: inv.genusLower,
          determinant: inv.determinant, linking: inv.linking,
          jones: inv.jones ? P.toPairs(inv.jones) : null,
          alexander: inv.alexander ? P.toPairs(inv.alexander) : null,
          bestDir: best.dir, rawCrossings: best.diagram.crossings.length,
        };
        result.id = ident;
      }
    }
    result.ms = performance.now() - t0;
    self.postMessage({ type: 'analysis', id: m.id, geometryOnly: !!m.geometryOnly, result });
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.stack || err) });
  }
};
