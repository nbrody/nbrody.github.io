import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBallTree,ballEngine,getBallFrame} from '../js/ballTree.js';
import {prepareBallAnimation,ballAnimationFrame,decorateBallRecords} from '../js/ballAnimation.js';
import {mmul} from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import {capply,sphereOf} from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cmobius.js';
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
for(const field of ['i','omega']){
  const settings={field,N:2,depth:2,lam:1,h:-.75,edges:'q'};
  for(const [name,entries] of [['S',['0','-1','1','0']],['U',['1','t','0','1']],['V',['1',field==='i'?'i':'\\omega','0','1']]]){
    test(`${field} ${name}: all animated balls start and finish at exact tree frames`,()=>{
      const E=ballEngine(field),matrix=E.matrixOf(entries.map(E.parse));
      const recs=buildBallTree(settings,50,.025).recs;
      const plan=prepareBallAnimation({recs,settings,matrix});
      const start=ballAnimationFrame(plan,0),middle=ballAnimationFrame(plan,.5),end=ballAnimationFrame(plan,1);
      assert.equal(start.length,plan.order.length);assert.equal(end.length,start.length);
      let moved=false;
      for(let j=0;j<plan.order.length;j++){
        const item=plan.order[j],A=getBallFrame(item.labels,settings).F,B=getBallFrame(item.target,settings).F;
        assert.ok(distance(start[j].F.c,A.c)<1e-7,`${name} start ${j}`);
        assert.ok(distance(end[j].F.c,B.c)<1e-7,`${name} end ${j}`);
        assert.ok(Math.abs(start[j].F.R-A.R)<1e-7);assert.ok(Math.abs(end[j].F.R-B.R)<1e-7);
        assert.equal(start[j].targetDepth,item.target.length);assert.equal(start[j].colorMix,0);assert.equal(end[j].colorMix,1);
        assert.ok([...middle[j].F.c,middle[j].F.R,...middle[j].C.flat()].every(Number.isFinite));
        if(distance(start[j].F.c,middle[j].F.c)>1e-6)moved=true;
      }
      assert.ok(moved,`${name} should visibly move some balls`);
    });
  }
}

for(const field of ['i','omega']){
  test(`${field}: action end retains the composed stationary boundary decoration`,()=>{
    const settings={field,N:2,depth:2,lam:1,h:-.75,edges:'q'};
    const E=ballEngine(field),T=E.tree, recs=buildBallTree(settings,25,.025).recs;
    const U=E.matrixOf(['1','t','0','1'].map(E.parse));
    const V=E.matrixOf(['1',field==='i'?'i':'\\omega','0','1'].map(E.parse));
    const current=U, next=mmul(V,current),plan=prepareBallAnimation({recs,settings,matrix:V,current});
    const final=ballAnimationFrame(plan,1);
    const dst=plan.order.map(item=>({labels:item.target}));
    const stationary=decorateBallRecords(dst,settings,next);
    for(let j=0;j<final.length;j++){
      assert.ok(T.keyOf(dst[j].labels)===T.keyOf(plan.order[j].target));
      for(const p of [[ [0,0],[1,0] ],[ [1,0],[1,0] ],[ [1,0],[0,0] ]]){
        const a=sphereOf(capply(final[j].C,p)),b=sphereOf(capply(stationary[j].C,p));
        assert.ok(distance(a,b)<1e-7,`decoration mismatch ${j}`);
      }
    }
  });
}
