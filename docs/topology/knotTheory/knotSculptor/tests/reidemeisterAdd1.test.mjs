import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../js/builders.js';
import { normalizeSize, resampleBySpacing } from '../js/knot.js';
import { projectDiagram } from '../js/diagram.js';
import { findReidemeisterMoves } from '../js/reidemeister.js';
import { findR1AddMoves } from '../js/reidemeisterAdd1.js';

const prepare = make => normalizeSize(make(),.13).map(p=>resampleBySpacing(p,.007,48,420));
const view = comps => projectDiagram(comps,[0,0,1]);

test('adds either handed kink to the normal-sized unknot without changing the source',()=>{
  const comps=prepare(PRESETS.unknot), before=comps.map(p=>Array.from(p)), D=view(comps);
  assert.equal(D.crossings.length,0);
  const moves=findR1AddMoves(comps,D);
  assert.ok(moves.length>=2);
  assert.deepEqual(new Set(moves.map(m=>m.sign)),new Set([-1,1]));
  for(const m of moves.slice(0,2)) {
    const after=view(m.components);
    assert.equal(after.crossings.length,1);
    assert.equal(after.crossings[0].sign,m.sign);
    assert.ok(after.crossings[0].dz>=.0084,'strands clear the displayed tube diameter');
    assert.ok(findReidemeisterMoves(m.components,after).length,'the new loop is removable by the certified R1 finder');
  }
  assert.deepEqual(comps.map(p=>Array.from(p)),before);
});

test('adds one crossing while retaining all crossings of an existing trefoil',()=>{
  const comps=prepare(PRESETS.trefoil), before=view(comps);
  const moves=findR1AddMoves(comps,before);
  assert.ok(moves.length);
  const after=view(moves[0].components);
  assert.equal(after.crossings.length,before.crossings.length+1);
  for(const old of before.crossings) assert.ok(after.crossings.some(x=>Math.hypot(x.x-old.x,x.y-old.y)<1e-9 && x.sign===old.sign));
});

test('declines degenerate projected segments and undersized loops',()=>{
  const p=Float64Array.from([0,0,0, 0,0,1, 1,0,0, 1,1,0, 0,1,0]);
  assert.equal(findR1AddMoves([p],view([p])).length,0);
  const tiny=prepare(PRESETS.unknot).map(p=>Float64Array.from(p,x=>x*.01));
  assert.equal(findR1AddMoves(tiny,view(tiny)).length,0);
});
