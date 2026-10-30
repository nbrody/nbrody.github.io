import { buildGraph, parseText } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
const g = buildGraph(parseText('graph theta3\nlayout random 3'), { totalBeads: 40 });
for (const params of [{range:0}, {range:0.5}, {range:0, bend:0, junction:0, equal:0}, {range:0, bend:1, junction:0, equal:0}, {range:0, bend:0, junction:1, equal:0}, {range:0,bend:0,junction:0,equal:1}]) {
  const r = new Relaxer(g, params); r.setParams(params);
  const x = g.x.slice(); const grad = new Float64Array(x.length);
  const E0 = r.energy(x, grad).E;
  let maxErr = 0, maxG = 0;
  const tmp = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const h = 1e-6; x[i] += h; const Ep = r.energy(x, tmp).E; x[i] -= 2*h; const Em = r.energy(x, tmp).E; x[i] += h;
    const fd = (Ep - Em) / (2*h);
    maxErr = Math.max(maxErr, Math.abs(fd - grad[i])); maxG = Math.max(maxG, Math.abs(grad[i]));
  }
  console.log(JSON.stringify(params), 'E', E0.toFixed(4), 'max|g|', maxG.toExponential(3), 'maxErr', maxErr.toExponential(3));
}
