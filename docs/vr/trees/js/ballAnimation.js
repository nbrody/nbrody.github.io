/** Animate the whole finite ball tree under a complex-field isometry.
 * The source, target and induced boundary maps are the exact same tree actions
 * as 2dimFields. Children travel along their parent's moving sphere, while
 * vertices on the changing-parent spine interpolate between their frames.
 */
import * as THREE from '../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/vendor/three/three.module.js';
import { mmul, adj } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { cpath, cmul, cinv, capply, sphereOf } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cmobius.js';
import { ballEngine, getBallFrame, ballDirection } from './ballTree.js';

const add=(a,b)=>a.map((x,i)=>x+b[i]), scale=(a,k)=>a.map(x=>x*k);
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?2*t*t:1-(-2*t+2)**2/2;
const gapFor=(ell,R,settings)=>settings.edges==='zero'?0:Math.abs(settings.h)*(settings.edges==='levels'?1:ell*R);
const childSize=(c,base,settings)=>({sigma:settings.lam*c.D/2,ell:base?Math.sqrt(c.D):1/c.absq});
function childFrame(F,dir,r,gap){
  const n=ballDirection(F,dir),u=scale(n,-1);
  let e1=add(F.e1,scale(u,-dot(F.e1,u)));
  if(Math.hypot(...e1)<1e-6)e1=add(F.e2,scale(u,-dot(F.e2,u)));
  e1=scale(e1,1/Math.hypot(...e1));
  return {ball:true,c:add(F.c,scale(n,F.R+gap+r)),R:r,u,e1,e2:cross(u,e1)};
}
const qa=new THREE.Quaternion(),qb=new THREE.Quaternion(),basis=new THREE.Matrix4();
function quat(F,q){return q.setFromRotationMatrix(basis.makeBasis(new THREE.Vector3(...F.e1),new THREE.Vector3(...F.e2),new THREE.Vector3(...F.u)));}
function interpolateFrame(A,B,t){
  quat(A,qa);quat(B,qb);qa.slerp(qb,t);
  const axis=(x,y,z)=>new THREE.Vector3(x,y,z).applyQuaternion(qa).toArray();
  return {ball:true,c:A.c.map((x,i)=>mix(x,B.c[i],t)),R:mix(A.R,B.R,t),e1:axis(1,0,0),e2:axis(0,1,0),u:axis(0,0,1)};
}

/** Build a parent-first animation plan for the visible records and preimages.
 * `current` is the accumulated group element before applying `matrix`.
 */
export function prepareBallAnimation({recs,settings,matrix,current}){
  const E=ballEngine(settings.field),T=E.tree,K=E.K;
  const inverse=adj(matrix),currentInverse=adj(current || E.IDENTITY),items=new Map();
  const addPath=labels=>{const key=T.keyOf(labels);if(!items.has(key))items.set(key,{key,labels});};
  for(const rec of recs)addPath(rec.labels);
  for(const rec of recs)addPath(T.vertexOf(mmul(inverse,T.frameOf(rec.labels))));
  const spine=T.vertexOf(inverse);
  for(const item of items.values()){
    const {labels:target,h}=T.localMap(matrix,item.labels);
    const previous=T.localMap(currentInverse,item.labels);
    const F0=getBallFrame(item.labels,settings),F1=getBallFrame(target,settings);
    Object.assign(item,{target,dep:item.labels.length,H:cpath(E.toComplex(h)),
      decor:cinv(E.toComplex(previous.h)),F0:F0.F,F1:F1.F,gap0:F0.gap,gap1:F1.gap,
      spine:T.isPrefix(item.labels,spine)});
    if(item.spine)continue;
    item.parentKey=T.keyOf(item.labels.slice(0,-1));
    const c0=E.cuspOfLabel(item.labels.at(-1)),c1=E.cuspOfLabel(target.at(-1));
    const a=childSize(c0,item.labels.length===1,settings),b=childSize(c1,target.length===1,settings);
    Object.assign(item,{w:[K.toC(c0.p),K.toC(c0.q)],sig0:a.sigma,sig1:b.sigma,ell0:a.ell,ell1:b.ell});
  }
  const order=[...items.values()].sort((a,b)=>a.dep-b.dep);
  for(const item of order)if(!item.spine&&!items.has(item.parentKey))item.spine=true;
  return {order,items,settings};
}

/** Interpolate an action at t in [0,1]. Records remain source-labelled. */
export function ballAnimationFrame(plan,t){
  const e=ease(Math.max(0,Math.min(1,t))),frames=new Map(),out=[];
  for(const item of plan.order){
    let F,gap;
    if(item.spine){F=interpolateFrame(item.F0,item.F1,e);gap=mix(item.gap0,item.gap1,e);}
    else{
      const parent=frames.get(item.parentKey),parentH=plan.items.get(item.parentKey).Hs;
      const sig=Math.exp(mix(Math.log(item.sig0),Math.log(item.sig1),e));
      gap=gapFor(mix(item.ell0,item.ell1,e),parent.R,plan.settings);
      F=childFrame(parent,sphereOf(capply(parentH,item.w)),sig*parent.R,gap);
    }
    item.Hs=item.H(e);frames.set(item.key,F);
    out.push({F,gap,depth:item.dep,targetDepth:item.target.length,colorMix:e,labels:item.labels,C:cmul(item.Hs,item.decor)});
  }
  return out;
}

/** Carry the original boundary decoration by the accumulated group action.
 * Coordinates at a destination vertex come from its inverse-image vertex;
 * the inverse of the induced local map carries that decoration into place.
 */
export function decorateBallRecords(recs,settings,current){
  const E=ballEngine(settings.field),T=E.tree,inverse=adj(current || E.IDENTITY);
  return recs.map(rec=>{
    const {h}=T.localMap(inverse,rec.labels);
    return {...rec,C:cinv(E.toComplex(h))};
  });
}
