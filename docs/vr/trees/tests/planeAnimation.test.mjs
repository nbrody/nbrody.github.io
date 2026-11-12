import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTree, actions } from '../js/tree.js';
import { createPlaneAnimation, decoratePlaneRecords, mapPlaneCusp } from '../js/planeAnimation.js';
import { frameAt } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/layout.js';
import { IDENTITY, adj, isScalar } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { keyOf } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/treeAction.js';
const settings={base:'disk',lam:1,h:-.75,edges:'q',N:2,depth:2};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function frameClose(a,b){for(const k of ['cx','cy','z','R','ux','uy'])close(a[k],b[k]);}
function projectivelyEqual([p,q],[r,s]){return Math.abs(p*s-q*r)<1e-8;}
for(const name of ['S','T','U']) test(`${name}: all displayed planes start and finish at their exact image frames`,()=>{
 const recs=buildTree(settings,50).recs, anim=createPlaneAnimation({recs,settings,matrix:actions[name]});
 const start=anim.at(0), middle=anim.at(.5), end=anim.at(1);
 assert.ok(start.length>=recs.length);assert.equal(start.length,middle.length);assert.equal(start.length,end.length);
 const byKey=new Map(start.map(r=>[keyOf(r.labels),r]));
 for(const r of recs)frameClose(byKey.get(keyOf(r.labels)).F,r.F);
 for(const r of end)frameClose(r.F,frameAt(r.imageLabels,settings).F);
 // A map acting at the root must move its Farey boundary, even when the vertex is fixed.
 const root=end.find(r=>!r.labels.length);
 if(name==='T')assert.ok(projectivelyEqual(mapPlaneCusp(root.C,0,1),[1,1]));
 if(name==='S')assert.ok(projectivelyEqual(mapPlaneCusp(root.C,0,1),[1,0]));
});
test('successive actions carry the prior Farey picture and an inverse restores it',()=>{
 const recs=buildTree(settings,50).recs;
 const first=createPlaneAnimation({recs,settings,matrix:actions.T});
 const root=first.at(1).find(r=>!r.labels.length);
 const stationary=decoratePlaneRecords(recs,first.current).find(r=>!r.labels.length);
 assert.ok(projectivelyEqual(mapPlaneCusp(root.C,0,1),mapPlaneCusp(stationary.C,0,1)));
 const undo=createPlaneAnimation({recs,settings,matrix:adj(actions.T),current:first.current});
 assert.ok(isScalar(undo.current));
 const restored=decoratePlaneRecords(recs,undo.current).find(r=>!r.labels.length);
 assert.ok(projectivelyEqual(mapPlaneCusp(restored.C,0,1),[0,1]));
});


test('moving planes cross-fade from their source depth to image depth',()=>{
 const recs=buildTree(settings,50).recs;
 const anim=createPlaneAnimation({recs,settings,matrix:actions.U});
 for(const [t,mix] of [[0,0],[.5,.5],[1,1]]){
  const moving=anim.at(t).find(r=>r.depth!==r.imageLabels.length);
  assert.ok(moving,'U moves some vertices to a different depth');
  assert.equal(moving.targetDepth,moving.imageLabels.length);
  close(moving.colorMix,mix);
 }
});
