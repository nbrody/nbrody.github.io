// gradient check with the contact barrier active
import { buildGraph, parseText } from '../js/model.js';
import { Relaxer } from '../js/engine.js';
const g = buildGraph(parseText('circle 1 0 0, 0 1 0.02, -1 0 0, 0 -1 -0.02, 0.98 0.03 0.05, 0 0.9 -0.05'), { totalBeads: 60 });
const r = new Relaxer(g, { barrier: 20 }); r.setParams({ barrier: 20 });
const x = g.x.slice(); const grad = new Float64Array(x.length); const res = r.energy(x, grad);
console.log('contact energy', res.parts.contact.toExponential(3));
let maxErr = 0, maxG = 0; const tmp = new Float64Array(x.length);
for (let i = 0; i < x.length; i++) { const h=1e-7; x[i]+=h; const Ep=r.energy(x,tmp).E; x[i]-=2*h; const Em=r.energy(x,tmp).E; x[i]+=h; maxErr=Math.max(maxErr,Math.abs((Ep-Em)/(2*h)-grad[i])); maxG=Math.max(maxG,Math.abs(grad[i])); }
console.log('max|g|', maxG.toExponential(3), 'maxErr', maxErr.toExponential(3));
