import test from 'node:test';
import assert from 'node:assert/strict';
import { Q } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/rational.js';
import { IDENTITY, mmul, adj, isScalar } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { frameOf, localMap, fmul, fdet } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/treeAction.js';
import { specMat, qmul, latticeKey } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/specialize.js';
import { capply, sphereOf } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cmobius.js';
import { buildTree } from '../js/tree.js';
import { ballEngine, buildBallTree } from '../js/ballTree.js';
import { presetMatrix } from '../js/presets.js';
import { decoratePlaneRecords } from '../js/planeAnimation.js';
import { decorateBallRecords } from '../js/ballAnimation.js';
import { createSpecialization } from '../js/specialization.js';
const settings=field=>({field,base:'disk',lam:1,h:-.75,edges:'q',N:2,depth:1});
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const realPoint=(M,x)=>{const den=M[2]*x+M[3];return (M[0]*x+M[1])/den;};
const complexPoint=(M,x)=>sphereOf(capply(M,[[x,0],[1,0]]));
for(const field of ['Q','i','omega']){
 const s=settings(field),isQ=field==='Q',value=isQ?Q.of(2n):[Math.PI,.4],E=isQ?null:ballEngine(field),ident=isQ?IDENTITY:E.IDENTITY;
 const recs=(isQ?buildTree(s,30):buildBallTree(s,30)).recs;
 const current=presetMatrix(field,['1','t','0','1']);
 test(`${field}: collapse preserves the current tree and lands on a common base`,()=>{
   const decorated=isQ?decoratePlaneRecords(recs,current):decorateBallRecords(recs,s,current);
   const plan=createSpecialization({recs,settings:s,current,value}),before=plan.at(0),after=plan.at(1);
   assert.equal(plan.count,recs.length);assert.equal(before.length,recs.length);assert.ok(after.some(r=>r.root));
   for(let i=0;i<recs.length;i++){
     const a=before[i],b=decorated[i];assert.deepEqual(a.labels,b.labels);
     if(isQ){near(a.F.cx,b.F.cx);near(a.F.cy,b.F.cy);near(a.F.R,b.F.R);near(realPoint(a.C,.31),realPoint(b.C,.31));near(after[i].F.cx,0);near(after[i].F.cy,0);}
     else {a.F.c.forEach((x,k)=>near(x,b.F.c[k]));complexPoint(a.C,.31).forEach((x,k)=>near(x,complexPoint(b.C,.31)[k]));after[i].F.c.forEach(x=>near(x,0));}
     near(after[i].F.R,1);if(!a.root)near(a.alpha,1);if(!after[i].root)near(after[i].alpha,0);
   }
   assert.ok(after.filter(x=>x.overlay).length<=(isQ?24:11));
 });
 test(`${field}: collapsed generator action and inverse remain consistent`,()=>{
   const plan=createSpecialization({recs,settings:s,current:ident,value});
   const M=presetMatrix(field,['1','1','0','1']);const action=plan.startAction(M),before=plan.at(1),start=action.at(0),end=action.at(1);
   for(let i=0;i<before.length;i++){
     if(isQ){near(realPoint(start[i].C,.37),realPoint(before[i].C,.37));near(realPoint(end[i].C,.37),realPoint(before[i].C,.37)+1);}
     else {const expected=sphereOf(capply(before[i].C,[[.37,0],[1,0]]));const actual=complexPoint(start[i].C,.37);expected.forEach((x,k)=>near(x,actual[k]));}
   }
   const committed=action.commit();assert.ok(!isScalar(committed));assert.equal(action.commit(),committed);
   const landed=new Map(plan.at(1).filter(r=>r.sourceKey!==undefined).map(r=>[r.sourceKey,r]));
   for(const old of end.filter(r=>r.sourceKey!==undefined)){
     const next=landed.get(old.sourceKey);assert.ok(next);assert.equal(next.overlay,old.overlay);assert.equal(next.colorIndex,old.colorIndex);
     if(isQ)near(realPoint(old.C,.37),realPoint(next.C,.37));
     else complexPoint(old.C,.37).forEach((x,k)=>near(x,complexPoint(next.C,.37)[k]));
   }
   const undone=plan.startAction(presetMatrix(field,['1','1','0','1'],true));undone.commit();assert.ok(isScalar(plan.current));
 });
 test(`${field}: rejects a generator that is singular at t=1`,()=>{
   const unit=isQ?Q.ONE:[1,0],plan=createSpecialization({recs,settings:s,current:ident,value:unit});
   const M=presetMatrix(field,['1','t/(t-1)','0','1']);assert.throws(()=>plan.startAction(M),/singular/i);assert.ok(isScalar(plan.current));
   assert.throws(()=>createSpecialization({recs,settings:s,current:M,value:unit}),/singular/i);
 });
}

test('Q: orientation-reversing specialization finishes at the same picture after commit',()=>{
 const s=settings('Q'),recs=buildTree(s,30).recs,plan=createSpecialization({recs,settings:s,current:IDENTITY,value:Q.ONE});
 const M=presetMatrix('Q',['-1','0','0','1']),action=plan.startAction(M),end=action.at(1);action.commit();
 const after=new Map(plan.at(1).filter(r=>r.sourceKey!==undefined).map(r=>[r.sourceKey,r]));
 const boundary=r=>{const p=r.C[0]*.37+r.C[1],q=r.C[2]*.37+r.C[3],den=p*p+q*q;return [2*p*q/den*Math.cos(r.F.flip||0),(p*p-q*q)/den];};
 for(const a of end.filter(r=>r.sourceKey!==undefined)){const b=after.get(a.sourceKey),x=boundary(a),y=boundary(b);near(x[0],y[0]);near(x[1],y[1]);}
});

test('Q: collapsed overlays represent distinct exact specialized lattices',()=>{
 const s={...settings('Q'),N:3,depth:2},recs=buildTree(s,100).recs,current=presetMatrix('Q',['1','t','0','1']),value=Q.of(2n);
 const plan=createSpecialization({recs,settings:s,current,value}),out=plan.at(1),keys=[];
 for(let i=0;i<recs.length;i++)if(out[i].overlay){
   const source=localMap(adj(current),recs[i].labels).labels;
   keys.push(latticeKey(qmul(specMat(current,value),specMat(frameOf(source),value))));
 }
 assert.ok(keys.length>1);assert.ok(keys.length<=24);assert.equal(new Set(keys).size,keys.length);
});

for(const field of ['Q','i','omega'])test(`${field}: changing t after a collapsed action preserves its source spaces`,()=>{
 const s={...settings(field),N:3,depth:2},isQ=field==='Q',recs=(isQ?buildTree(s,75):buildBallTree(s,75)).recs;
 const identity=isQ?IDENTITY:ballEngine(field).IDENTITY,one=isQ?Q.ONE:[1,0],next=isQ?Q.of(2n):[2,.3];
 const plan=createSpecialization({recs,settings:s,current:identity,value:one});
 const keys=plan.at(1).filter(r=>r.sourceKey!==undefined).map(r=>r.sourceKey);
 const move=presetMatrix(field,['1','t','0','1']);plan.startAction(move).commit();
 const old=plan.current,replaced=plan.withValue(next);
 assert.equal(replaced.current,old);
 assert.deepEqual(replaced.at(1).filter(r=>r.sourceKey!==undefined).map(r=>r.sourceKey),keys);
 const zeros=isQ?Q.ZERO:[0,0];assert.throws(()=>plan.withValue(zeros),/nonzero/i);assert.equal(plan.current,old);
});
