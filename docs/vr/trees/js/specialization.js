/** Specialization t ↦ a of the desktop 2dimFields tree, adapted for VR.
 * Values over Q remain exact rationals; complex values use the desktop's
 * floating-point evaluation. Each source space is identified with the common
 * base by g(a) g_v(a), while its boundary pattern follows the corresponding
 * local Möbius path. The renderer receives a finite set of overlays.
 */
import * as THREE from '../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/vendor/three/three.module.js';
import { IDENTITY, mmul, adj, isScalar, normalizePGL } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { frameOf, localMap, keyOf, toFloat, fmul, finv, fdet, fnorm, RHO, mobiusPath } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/treeAction.js';
import { rootFrame, frameAt, lerpFrame } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/layout.js';
import { specMat, specMatC, qdet, qmul, latticeKey } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/specialize.js';
import { CID, cmul, cinv, cnorm, cSingular, cpath } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cmobius.js';
import { ballEngine, baseBall, getBallFrame } from './ballTree.js';

const REAL_ID=[1,0,0,1];
const clamp=x=>Math.max(0,Math.min(1,x));
const finiteReal=M=>M.length===4&&M.every(Number.isFinite)&&Number.isFinite(fdet(M))&&Math.abs(fdet(M))>1e-280;
function normalizeReal(M, message){const nums=M.map(x=>x.toNumber());if(!finiteReal(nums))throw new Error(message);const n=fnorm(nums);if(!n.every(Number.isFinite))throw new Error(message);return n;}
function normalizeComplex(M,message){if(cSingular(M))throw new Error(message);const n=cnorm(M);if(n.some(z=>!z.every(Number.isFinite)))throw new Error(message);return n;}
const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),basis=new THREE.Matrix4();
function quat(F,q){return q.setFromRotationMatrix(basis.makeBasis(new THREE.Vector3(...F.e1),new THREE.Vector3(...F.e2),new THREE.Vector3(...F.u)));}
function lerpBall(A,B,s){quat(A,qa);quat(B,qb);qa.slerp(qb,s);const v=(x,y,z)=>new THREE.Vector3(x,y,z).applyQuaternion(qa).toArray();return {ball:true,c:A.c.map((x,i)=>x+(B.c[i]-x)*s),R:A.R+(B.R-A.R)*s,e1:v(1,0,0),e2:v(0,1,0),u:v(0,0,1)};}

/**
 * `value` is Q for the rational field or [real,imag] for complex fields.
 * `current` is the exact cumulative group element used by the tree viewer.
 * `at(s)` returns standard scene records; s=0 is the tree, s=1 the common
 * specialized space. `startAction(matrix)` animates the specialized action
 * while collapsed; call its commit() when that animation reaches 1.
 */
export function createSpecialization({recs,settings,current,value,_sources=null}){
 if(!Array.isArray(recs)||!recs.length)throw new Error('No tree is available to specialize.');
 const complex=settings.field!=='Q', E=complex?ballEngine(settings.field):null;
 if(complex){if(!Array.isArray(value)||value.length!==2||!value.every(Number.isFinite)||Math.hypot(...value)===0)throw new Error('The specialization value must be a finite nonzero complex number.');}
 else if(!value||typeof value.isZero!=='function'||value.isZero())throw new Error('The specialization value must be a nonzero rational number.');
 if(!complex&&settings.base!=='disk')throw new Error('VR specialization requires the disk layout.');
 const T=complex?E.tree:{frameOf,localMap,keyOf}, root=complex?baseBall():rootFrame(settings);
 let accumulated=current||(complex?E.IDENTITY:IDENTITY);
 const inverse=adj(accumulated),sources=[],seen=new Set();
 // Retain the original source spaces when the specialization value changes;
 // reconstructing from the visible patch after a group action picks a
 // different finite set and causes boundary patterns to jump.
 const sourceList=_sources??recs.map(rec=>isScalar(accumulated)?rec.labels:T.localMap(inverse,rec.labels).labels);
 for(const labels of sourceList){const key=T.keyOf(labels);if(!seen.has(key)){seen.add(key);sources.push(labels);}}
 let items=[];
 function buildItems(){
   const oldOverlays=new Map(items.map(it=>[it.key,it.overlay]));
   const ga=complex?specMatC(accumulated,value):specMat(accumulated,value);
   if(complex)normalizeComplex(ga,'The current group element is singular at this value of t.');
   else if(qdet(ga).isZero())throw new Error('The current group element is singular at this value of t.');
   const built=sources.map((v,colorIndex)=>{
     const lm=T.localMap(accumulated,v),u=lm.labels, isRoot=u.length===0;
     if(complex){
       const d=normalizeComplex(E.toComplex(lm.h),'The tree boundary map is not finite.');
       const M=normalizeComplex(cmul(ga,specMatC(T.frameOf(v),value)),'A tree frame is singular at this value of t.');
       const rel=normalizeComplex(cmul(M,cinv(d)),'The collapse map is singular.');
       const {F,gap}=getBallFrame(u,settings);
       return {v,u,root:isRoot,depth:u.length,F0:F,gap0:gap,d,M,P:cpath(rel),key:T.keyOf(v),colorIndex};
     }
     const d=normalizeReal(lm.h,'The tree boundary map is not finite.');
     const Mq=qmul(ga,specMat(T.frameOf(v),value));if(qdet(Mq).isZero())throw new Error('A tree frame is singular at this value of t.');
     const M=normalizeReal(Mq,'The specialized matrix is too large to display.');
     const rel=fnorm(fmul(M,finv(d))),flip=fdet(rel)<0;
     if(!finiteReal(rel))throw new Error('The collapse map is not finite.');
     const {F,gap}=frameAt(u,settings);
     return {v,u,root:isRoot,depth:u.length,F0:F,gap0:gap,d,M,Mq,flip,P:mobiusPath(flip?fmul(RHO,rel):rel),key:T.keyOf(v),colorIndex};
   });
   // Keep the largest distinct Q lattices, as the desktop does; complex fields
   // retain the largest non-root boundary pictures. Preserve that selection
   // across collapsed actions so overlays do not pop when an action ends.
   if(oldOverlays.size){for(const it of built)it.overlay=!!oldOverlays.get(it.key);}
   else {
     const ordered=[...built].sort((a,b)=>(b.root?Infinity:b.F0.R)-(a.root?Infinity:a.F0.R));
     const lattices=new Set();let kept=0;
     for(const it of ordered){
       if(complex){it.overlay=it.root||kept<10;if(it.overlay&&!it.root)kept++;}
       else {const k=latticeKey(it.Mq);it.overlay=k!=null&&!lattices.has(k)&&lattices.size<24;if(it.overlay)lattices.add(k);}
     }
   }
   items=built;
 }
 buildItems();
 function at(amount){
   const s=clamp(amount),out=items.map(it=>{
     const F=complex?lerpBall(it.F0,root,s):lerpFrame(it.F0,root,s);
     const C=s===1?it.M:(complex?cmul(it.P(s),it.d):fmul(it.P(s),it.d));
     if(!complex&&s<1&&it.flip)F.flip=Math.PI*s;
     return {F,gap:it.gap0*(1-s),depth:it.depth,labels:it.u,sourceKey:it.key,colorIndex:it.colorIndex,C,root:it.root,overlay:!!it.overlay,alpha:it.root?1:1-s};
   });
   if(!items.some(it=>it.root))out.unshift({F:root,gap:0,depth:0,labels:[],C:complex?CID:REAL_ID,root:true,overlay:false,alpha:1});
   return out;
 }
 function startAction(matrix){
   // Validate before changing state so a singular specialized generator has no effect.
   let H,flip=false;
   if(complex)H=cpath(normalizeComplex(specMatC(matrix,value),'This generator is singular at this value of t.'));
   else {const Mq=specMat(matrix,value);if(qdet(Mq).isZero())throw new Error('This generator is singular at this value of t.');const M=normalizeReal(Mq,'The specialized generator is too large to display.');flip=fdet(M)<0;H=mobiusPath(flip?fmul(RHO,M):M);}
   const base=at(1);let committed=false;
   return {
     at(amount){const s=clamp(amount),h=H(s);return base.map(rec=>{const F={...rec.F};if(!complex&&flip)F.flip=Math.PI*s;return {...rec,F,C:complex?cmul(h,rec.C):fmul(h,rec.C)};});},
     commit(){if(committed)return accumulated;const next=complex?E.normalizePGL(mmul(matrix,accumulated)):normalizePGL(mmul(matrix,accumulated));const old=accumulated;accumulated=next;try{buildItems();}catch(e){accumulated=old;throw e;}committed=true;return accumulated;}
   };
 }
 return {at,startAction,withValue(nextValue){return createSpecialization({recs,settings,current:accumulated,value:nextValue,_sources:sources});},get current(){return accumulated;},get value(){return value;},get count(){return items.length;}};
}
