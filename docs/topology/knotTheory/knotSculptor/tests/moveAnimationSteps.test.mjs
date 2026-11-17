import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDiagram } from '../js/diagram.js';
import { findReidemeisterMoves } from '../js/reidemeister.js';
import { findR2Moves } from '../js/reidemeister2.js';
import { findR3Moves } from '../js/reidemeister3.js';

const p=(points,z)=>Float64Array.from(points.flatMap(([x,y])=>[x,y,z]));
const view=c=>projectDiagram(c,[0,0,1]);
function pointOnCurve(point,curve) {
  const n=curve.length/3;
  for(let i=0;i<n;i++) {
    const j=(i+1)%n, a=[...curve.slice(3*i,3*i+3)], b=[...curve.slice(3*j,3*j+3)];
    const v=b.map((x,k)=>x-a[k]), w=point.map((x,k)=>x-a[k]);
    const d=v.reduce((s,x)=>s+x*x,0), t=d ? Math.max(0,Math.min(1,w.reduce((s,x,k)=>s+x*v[k],0)/d)) : 0;
    if(Math.hypot(...w.map((x,k)=>x-t*v[k]))<1e-9) return true;
  }
  return false;
}
function sameCurve(a,b) {
  if(a.length!==b.length) return false;
  return a.every((p,c)=>[...Array(p.length/3).keys()].every(i=>pointOnCurve([...p.slice(3*i,3*i+3)],b[c])) &&
    [...Array(b[c].length/3).keys()].every(i=>pointOnCurve([...b[c].slice(3*i,3*i+3)],p)));
}
function checkTrajectory(initial,move) {
  assert.ok(move?.steps?.length,'move supplies elementary animation steps');
  let previous=initial;
  for(const step of move.steps) {
    assert.ok(sameCurve(previous,step.from),'step begins on previous curve');
    assert.deepEqual(step.from.map(c=>c.length),step.to.map(c=>c.length));
    let moved=0;
    step.from.forEach((a,c)=>{for(let i=0;i<a.length;i+=3) if(a[i]!==step.to[c][i]||a[i+1]!==step.to[c][i+1]||a[i+2]!==step.to[c][i+2]) moved++;});
    assert.ok(moved<=1,'each step moves at most one vertex');
    previous=step.to;
  }
  assert.ok(sameCurve(previous,move.components),'last step ends on committed curve');
}
test('removal and slide animations follow their certified elementary moves',()=>{
  const r1=[Float64Array.from([-1,-1,0, 1.3,1,0, -1,1,1, 1,-1,1, 2,-2,1, -2,-2,0])];
  const r2=[p([[-3,0],[3,0],[3,-3],[-3,-3]],0),p([[-1,-1],[-1,1],[0,1.2],[1,1],[1,-1],[0,-1.2]],1)];
  const r3=[p([[-.31,0],[.71,0],[3,-5],[-3,-5]],2),p([[-.91,-.91],[1.09,1.09],[4,4],[4,-2],[-1,-2]],1),p([[-.93,1.23],[1.07,-.77],[4,-4],[-4,-4],[-4,3],[-1,3]],0)];
  checkTrajectory(r1,findReidemeisterMoves(r1,view(r1))[0]);
  checkTrajectory(r2,findR2Moves(r2,view(r2))[0]);
  checkTrajectory(r3,findR3Moves(r3,view(r3))[0]);
  const subdivide=(p,n)=>{const q=[];for(let i=0;i<p.length/3;i++)for(let j=0;j<n;j++)for(let k=0;k<3;k++)q.push(p[3*i+k]+(p[3*((i+1)%(p.length/3))+k]-p[3*i+k])*j/n);return Float64Array.from(q);};
  const denseR3=r3.map(p=>subdivide(p,4));
  checkTrajectory(denseR3,findR3Moves(denseR3,view(denseR3))[0]);
  for(let start=0;start<6;start++) {
    const rotated=[r2[0],Float64Array.from([...r2[1].slice(3*start),...r2[1].slice(0,3*start)])];
    checkTrajectory(rotated,findR2Moves(rotated,view(rotated))[0]);
  }
});
