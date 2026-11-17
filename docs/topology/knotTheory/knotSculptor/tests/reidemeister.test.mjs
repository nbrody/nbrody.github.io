import assert from 'node:assert/strict';
import { projectDiagram } from '../js/diagram.js';
import { findReidemeisterMoves } from '../js/reidemeister.js';

const fixture = [-1,-1,0, 1.3,1,0, -1,1,1, 1,-1,1, 2,-2,1, -2,-2,0];
const subdivide = (pts,n) => {
  const q=[], N=pts.length/3;
  for(let i=0;i<N;i++) for(let k=0;k<n;k++) for(let d=0;d<3;d++)
    q.push(pts[3*i+d]+(pts[3*((i+1)%N)+d]-pts[3*i+d])*k/n);
  return Float64Array.from(q);
};
const diagram = c => projectDiagram(c,[0,0,1]);
for(const density of [1,2,4,8]) {
  const c=[subdivide(fixture,density)], original=Array.from(c[0]), before=diagram(c);
  assert.equal(before.crossings.length,1);
  const moves=findReidemeisterMoves(c,before);
  assert.equal(moves.length,1,`one executable R1 at subdivision ${density}`);
  assert.equal(diagram(moves[0].components).crossings.length,0);
  assert.deepEqual(Array.from(c[0]),original,'detection must not mutate input');
}
// Loop straddles the cyclic array boundary.
const rotated=fixture.slice(9).concat(fixture.slice(0,9));
assert.equal(findReidemeisterMoves([Float64Array.from(rotated)],diagram([Float64Array.from(rotated)])).length,1);
// An entirely enclosed component is not a valid empty monogon.
const inner=Float64Array.from([-.2,.5,2, .2,.5,2, 0,.8,2]);
const lower=Float64Array.from([-.2,-1.5,2, .2,-1.5,2, 0,-1.7,2]);
const occupied=[Float64Array.from(fixture),inner,lower];
assert.equal(findReidemeisterMoves(occupied,diagram(occupied)).length,0);
// Recognition should not depend on the position of the whole link in space.
const shifted=[Float64Array.from(fixture.map((x,i)=>x+[100,-30,80][i%3]))];
assert.equal(findReidemeisterMoves(shifted,diagram(shifted)).length,1);
for(const scale of [1e-3,1e3]) {
  const c=[Float64Array.from(fixture.map(x=>x*scale))];
  assert.equal(findReidemeisterMoves(c,diagram(c)).length,1,`scale ${scale}`);
}
console.log('Reidemeister I recognition: passed');
