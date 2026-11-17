import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDiagram} from '../js/diagram.js';
import {PRESETS} from '../js/builders.js';
import {normalizeSize,resampleBySpacing} from '../js/knot.js';
import {findR2AddMoves} from '../js/reidemeisterAdd2.js';
import {diagramInvariants} from '../js/invariants.js';
import {P} from '../js/poly.js';
const fixture=name=>normalizeSize(PRESETS[name](),.13).map(p=>resampleBySpacing(p,.007,48,420));
for(const name of ['unknot','trefoil']) test(`type II addition on sampled ${name} preserves the knot`,()=>{
  const comps=fixture(name),before=comps.map(p=>Array.from(p)),D=projectDiagram(comps,[0,0,1]);
  const moves=findR2AddMoves(comps,D);
  assert.ok(moves.length,`no additions on ${name}`);
  const jones=diagramInvariants(D.gauss).jones;
  for(const move of moves){
    const after=projectDiagram(move.components,[0,0,1]);
    assert.equal(after.crossings.length,D.crossings.length+2);
    assert.ok(P.equal(diagramInvariants(after.gauss).jones,jones));
  }
  assert.deepEqual(comps.map(p=>Array.from(p)),before);
});
test('tube clearance can reject moves that would be too narrow',()=>{
  const c=fixture('trefoil'),d=projectDiagram(c,[0,0,1]);
  assert.equal(findR2AddMoves(c,d,{clearance:1}).length,0);
});
