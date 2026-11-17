import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../js/builders.js';
import { normalizeSize, resampleBySpacing } from '../js/knot.js';
import { projectDiagram } from '../js/diagram.js';
import { findR1AddMoves } from '../js/reidemeisterAdd1.js';
import { findR2AddMoves } from '../js/reidemeisterAdd2.js';

const fixture = (name = 'unknot') => normalizeSize(PRESETS[name](), .13).map(p => resampleBySpacing(p, .007, 48, 420));
const vertex = (p,i) => Array.from(p.subarray(3*i,3*i+3));
function pointSegmentDistance(p,a,b) {
  const d=b.map((x,i)=>x-a[i]), q=p.map((x,i)=>x-a[i]);
  const dd=d.reduce((s,x)=>s+x*x,0);
  const t=dd ? Math.max(0,Math.min(1,q.reduce((s,x,i)=>s+x*d[i],0)/dd)) : 0;
  return Math.hypot(...q.map((x,i)=>x-t*d[i]));
}
function sameCurve(a,b) {
  if(a.length!==b.length) return false;
  const covered=(p,q)=>{
    for(let i=0;i<p.length/3;i++) {
      const v=vertex(p,i); let nearest=Infinity;
      for(let j=0;j<q.length/3;j++) nearest=Math.min(nearest,pointSegmentDistance(v,vertex(q,j),vertex(q,(j+1)%(q.length/3))));
      if(nearest>1e-10) return false;
    }
    return true;
  };
  return a.every((p,i)=>covered(p,b[i])&&covered(b[i],p));
}
for(const [name,find,knot] of [['type I',findR1AddMoves,'unknot'],['type II',findR2AddMoves,'unknot'],['type II',findR2AddMoves,'trefoil']]) {
  test(`${name} addition on ${knot} exposes continuous certified animation steps`,()=>{
    const original=fixture(knot), diagram=projectDiagram(original,[0,0,1]);
    const moves=find(original,diagram).slice(0,name==='type I'?2:1);
    assert.ok(moves.length);
    for(const move of moves) {
      assert.ok(move.steps?.length);
      assert.ok(sameCurve(original,move.steps[0].from),'first step begins on the original curve');
      for(let i=0;i<move.steps.length;i++) {
        const {from,to}=move.steps[i];
        assert.deepEqual(from.map(p=>p.length),to.map(p=>p.length),'each step interpolates matching vertices');
        if(i) assert.ok(sameCurve(move.steps[i-1].to,from),'consecutive steps share a geometric endpoint');
      }
      assert.ok(sameCurve(move.steps.at(-1).to,move.components),'final step reaches the proposed curve');
    }
  });
}
