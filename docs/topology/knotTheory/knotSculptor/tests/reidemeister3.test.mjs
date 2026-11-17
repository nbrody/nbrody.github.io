import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDiagram } from '../js/diagram.js';
import { normalizeSize, resampleBySpacing } from '../js/knot.js';
import { findR3Moves } from '../js/reidemeister3.js';
const poly=(p,z)=>Float64Array.from(p.flatMap(([x,y])=>[x,y,z]));
const fixture=()=>[poly([[-.31,0],[.71,0],[3,-5],[-3,-5]],2),poly([[-.91,-.91],[1.09,1.09],[4,4],[4,-2],[-1,-2]],1),poly([[-.93,1.23],[1.07,-.77],[4,-4],[-4,-4],[-4,3],[-1,3]],0)];
const view=c=>projectDiagram(c,[0,0,1]);
const atFace=m=>m.x>.05&&m.x<.25&&m.y>0&&m.y<.15;
const subdivide=(p,n)=>{let q=[];const N=p.length/3;for(let i=0;i<N;i++)for(let k=0;k<n;k++)for(let d=0;d<3;d++)q.push(p[3*i+d]+(p[3*((i+1)%N)+d]-p[3*i+d])*k/n);return Float64Array.from(q);};
test('flips an empty type III face by a spatial isotopy without changing the input',()=>{
  const c=fixture(),original=c.map(p=>Array.from(p)),D=view(c),m=findR3Moves(c,D).find(atFace);
  assert.ok(m,'expected the central triangle');
  assert.equal(m.type,'R3');assert.deepEqual(c.map(p=>Array.from(p)),original);
  const after=view(m.components);assert.equal(after.crossings.length,D.crossings.length);
  assert.deepEqual([...after.gauss.sign.values()].sort(),[...D.gauss.sign.values()].sort());
  assert.equal(m.components.length,c.length);
  assert.notDeepEqual(after.gauss.comps.map(e=>e.map(x=>x.over)),D.gauss.comps.map(e=>e.map(x=>x.over)));
});
test('recognizes the same face after subdividing the polygon',()=>{
  for(const n of [2,4,8]) { const c=fixture().map(p=>subdivide(p,n));assert.ok(findR3Moves(c,view(c)).some(atFace),`subdivision ${n}`); }
});
test('recognizes moves on a normalized, spacing-resampled link',()=>{
  const c=normalizeSize(fixture()).map(p=>resampleBySpacing(p,.007));
  assert.ok(findR3Moves(c,view(c)).length);
});
test('does not offer a triangular region occupied by a closed component',()=>{
  const c=fixture();c.push(poly([[.13,.04],[.17,.04],[.15,.06]],3));
  assert.ok(!findR3Moves(c,view(c)).some(atFace));
});
test('rejects singular projections',()=>{
  const c=fixture();c.push(poly([[.15,.15],[.2,.18],[.21,.21]],3));
  assert.equal(findR3Moves(c,view(c)).length,0);
});
test('supports opposite depth ordering and cyclic reindexing',()=>{
  const c=fixture().map((p,ci)=>{const q=Float64Array.from(p);for(let i=2;i<q.length;i+=3) q[i]=-q[i];const shift=3*(ci+1);return Float64Array.from([...q.slice(shift),...q.slice(0,shift)]);});
  assert.ok(findR3Moves(c,view(c)).some(atFace));
});
test('does not offer a move when its final tube cannot meet requested clearance',()=>{
  const c=fixture();assert.equal(findR3Moves(c,view(c),{clearance:100}).length,0);
});
