import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELDS,circles} from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';
import {CID,capply,sphereOf} from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cmobius.js';
import {baseBall} from '../js/ballTree.js';
import {mapBoundaryCircle,appendBoundaryCircle} from '../js/ballCircles.js';
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
for(const field of ['i','omega']) {
 test(`${field}: moving a boundary circle agrees with the desktop projective transform`,()=>{
  const c=circles(FIELDS[field],2)[0];
  const identity=mapBoundaryCircle(c,CID);
  close(identity.r,c.r);
  const T=[[1,0],[.5,.25],[0,0],[1,0]], moved=mapBoundaryCircle(c,T);
  assert.ok(moved);
  for(const p of c.pts){const q=sphereOf(capply(T,p));close(q[0]*moved.n[0]+q[1]*moved.n[1]+q[2]*moved.n[2],moved.d);}
  const lines=[];appendBoundaryCircle(lines,baseBall(),moved,24);
  assert.equal(lines.length,24*6);assert.ok(lines.every(Number.isFinite));
 });
}
test('singular decoration transforms are skipped',()=>{
 const c=circles(FIELDS.i,2)[0];assert.equal(mapBoundaryCircle(c,[[0,0],[0,0],[0,0],[0,0]]),null);
});
