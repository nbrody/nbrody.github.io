import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDiagram } from '../js/diagram.js';
import { findR2Moves } from '../js/reidemeister2.js';
const poly=(p,z)=>Float64Array.from(p.flatMap(([x,y])=>[x,y,z]));
const fixture=()=>[
  poly([[-3,0],[3,0],[3,-3],[-3,-3]],0),
  poly([[-1,-1],[-1,1],[0,1.2],[1,1],[1,-1],[0,-1.2]],1),
];
test('certified R2 removes a pair of crossings and keeps the input unchanged',()=>{
  const comps=fixture(), original=comps.map(p=>Array.from(p));
  const D=projectDiagram(comps,[0,0,1]);
  assert.equal(D.crossings.length,2);
  const moves=findR2Moves(comps,D);
  assert.ok(moves.length>0);
  assert.equal(projectDiagram(moves[0].components,[0,0,1]).crossings.length,0);
  assert.deepEqual(comps.map(p=>Array.from(p)),original);
  assert.equal(moves[0].components.length,2);
});
test('does not remove the two crossings of a Hopf link',()=>{
  const comps=fixture();
  // Reverse depth across one crossing so that the two crossings have the same sign.
  comps[1][2]=-1; comps[1][5]=-1; comps[1][8]=-1;
  const D=projectDiagram(comps,[0,0,1]);
  assert.equal(D.crossings.length,2);
  assert.equal(D.crossings[0].sign,D.crossings[1].sign);
  assert.equal(findR2Moves(comps,D).length,0);
});
test('does not offer a bigon occupied by another component',()=>{
  const comps=fixture();
  comps.push(poly([[-.2,.3],[.2,.3],[.2,.6],[-.2,.6]],2));
  const D=projectDiagram(comps,[0,0,1]);
  const moves=findR2Moves(comps,D);
  assert.ok(moves.length>0); // the lower bigon is still empty
  assert.ok(moves.every(m=>m.y<0));
});
test('finds the same move when component indexing wraps through the bigon',()=>{
  for(let start=0;start<6;start++) {
    const comps=fixture(),p=comps[1];
    comps[1]=Float64Array.from([...p.slice(3*start),...p.slice(0,3*start)]);
    assert.ok(findR2Moves(comps,projectDiagram(comps,[0,0,1])).length>0,`start ${start}`);
  }
});
test('declines nongeneric vertex-on-edge projections',()=>{
  const comps=fixture();
  comps.push(poly([[0,0],[.2,.3],[-.2,.3]],2));
  assert.equal(findR2Moves(comps,projectDiagram(comps,[0,0,1])).length,0);
});
