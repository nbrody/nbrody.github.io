import assert from 'node:assert/strict';
import {SPECIES,GROWTH_SPECS,buildTree,MAX_BRANCHES,MAX_CROWNS} from '../island/species.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function pointSegment(p,a,b){const d=sub(b,a),q=sub(p,a),t=Math.max(0,Math.min(1,dot(q,d)/dot(d,d)));return Math.hypot(...q.map((v,i)=>v-t*d[i]));}
let cases=0;
for(const id of ['redwood','juniper','cypress']){
 const defaults=SPECIES[id].defaults;
 const samples=[defaults];
 for(const [key,,min,max] of GROWTH_SPECS)for(const value of [min,max])samples.push({...defaults,[key]:value});
 for(const [height,radius,spread] of [[.7,.45,.3],[2.4,1.2,1.3]])samples.push({...defaults,height,radius,spread});
 for(let stage=0;stage<4;stage++)for(const values of samples){
  const g=buildTree(id,values,stage);cases++;
  assert(g.branches.length<=MAX_BRANCHES&&g.crowns.length<=MAX_CROWNS);
  for(const buffer of [g.a,g.b,g.c,g.r])assert([...buffer].every(Number.isFinite));
  assert(Number.isFinite(g.branchBound)&&g.branchBound>=1);
  for(const c of g.crowns)assert(c.radii.every(x=>x>0));
  // Every non-root limb connects to an already built segment, including fractional attachments.
  for(let i=1;i<g.branches.length;i++){
   const limb=g.branches[i];assert(Math.min(...g.branches.slice(0,i).map(b=>pointSegment(limb.a,b.a,b.b)))<1e-8,`${id}: disconnected limb ${i}`);
   assert(Math.hypot(...sub(limb.b,limb.a))>1e-5);
  }
 }
 for(const [key,,min,max] of GROWTH_SPECS){
  const low=buildTree(id,{...defaults,[key]:min}),high=buildTree(id,{...defaults,[key]:max});
  assert.notEqual(JSON.stringify([low.a,low.b,low.c,low.r]),JSON.stringify([high.a,high.b,high.c,high.r]),`${id}: inert ${key}`);
 }
 assert(buildTree(id,{...defaults,maturity:.2}).height<buildTree(id,{...defaults,maturity:1}).height);
 assert.deepEqual(buildTree(id,defaults),buildTree(id,defaults),'Deterministic recipes');
}
console.log(`PASS: ${cases} species/stage/parameter cases; connected skeletons, positive radii, finite uniforms, effective controls, deterministic growth.`);

const {buildFoliage,studyGeometry}=await import('../island/foliage.js');
for(const id of ['study','redwood','juniper','cypress']){
 const params={height:1.45,radius:.85,spread:.85,...SPECIES[id].defaults};
 const geometry=id==='study'?studyGeometry(params):buildTree(id,params,3);
 const sparse=buildFoliage(geometry,id,1,20),dense=buildFoliage(geometry,id,1,120);
 assert(dense.shoots>sparse.shoots,`${id}: density must add twigs`);
 assert.equal(sparse.vertices.length,sparse.shoots*6*12);
 assert([...dense.vertices].every(Number.isFinite));
 assert.deepEqual(sparse,buildFoliage(geometry,id,1,20));
 assert.notDeepEqual(sparse.vertices,buildFoliage(geometry,id,1.8,20).vertices);
 for(let i=0;i<sparse.vertices.length;i+=72){
  const v=sparse.vertices,root=[0,1,2].map(j=>(v[i+j]+v[i+12+j])/2);
  assert(Math.min(...geometry.branches.map(b=>pointSegment(root,b.a,b.b)))<1e-6,`${id}: floating foliage`);
  assert(Math.abs(Math.hypot(v[i+9],v[i+10],v[i+11])-1)<1e-6);
 }
}
console.log('PASS: all four foliage types are deterministic, branch-attached, finite, and respond to size and density.');
