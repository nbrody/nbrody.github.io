// Add a Reidemeister II pair by pushing one polygon edge across a second
// projected edge. The inserted vertex is accepted only when the entire swept
// 3D triangle is disjoint from the link and the diagram changes as intended.
import { projectDiagram } from './diagram.js';
import { genericProjection } from './reidemeister.js';
import { clearTriangle } from './reidemeister2.js';
import { removalStep, insertionStep } from './moveAnimationSteps.js';

const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
function intersection(a,b,c,d) {
  const r=sub(b,a),s=sub(d,c),den=cross(r,s);
  if(Math.abs(den)<1e-14*Math.hypot(...r)*Math.hypot(...s)) return null;
  const t=cross(sub(c,a),s)/den,u=cross(sub(c,a),r)/den;
  return t>0.03 && t<0.97 && u>0.03 && u<0.97 ? [t,u] : null;
}
function insert(comps,c,i,point) {
  const out=comps.slice(),p=comps[c],q=new Float64Array(p.length+3),at=3*(i+1);
  q.set(p.subarray(0,at));q.set(point,at);q.set(p.subarray(at),at+3);out[c]=q;return out;
}
function remove(comps,c,i) {
  const out=comps.slice(),p=comps[c],q=new Float64Array(p.length-3),at=3*i;
  q.set(p.subarray(0,at));q.set(p.subarray(at+3),at);out[c]=q;return out;
}
function unchanged(before,after,tol) {
  if(before.length!==after.length) return false;
  const rest=after.slice();
  for(const x of before) {
    const k=rest.findIndex(y=>Math.hypot(x.x-y.x,x.y-y.y)<tol && x.sign===y.sign);
    if(k<0) return false; rest.splice(k,1);
  }
  return true;
}
function originalCrossingsUnchanged(before,after,tol) {
  const remaining=after.slice();
  for(const x of before) {
    const k=remaining.findIndex(y=>Math.hypot(x.x-y.x,x.y-y.y)<tol && x.sign===y.sign);
    if(k<0) return null;
    remaining.splice(k,1);
  }
  return remaining.length===2 ? remaining : null;
}
// Exact closest distance for a pair of nondegenerate 3D segments. The scale
// relative parallel test avoids discarding near-parallel configurations.
export function segmentDistance(a,b,c,d) {
  const sub3=(x,y)=>x.map((v,i)=>v-y[i]), dot=(x,y)=>x.reduce((s,v,i)=>s+v*y[i],0);
  const u=sub3(b,a),v=sub3(d,c),w=sub3(a,c),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),den=aa*cc-bb*bb;
  const clamp=x=>Math.max(0,Math.min(1,x));
  if(!aa || !cc) return 0;
  let s=den>aa*cc*1e-14?clamp((bb*ee-cc*dd)/den):0;
  let t=clamp((bb*s+ee)/cc);
  s=clamp((bb*t-dd)/aa); t=clamp((bb*s+ee)/cc);
  return Math.hypot(...w.map((x,i)=>x+s*u[i]-t*v[i]));
}
export function clearTube(comps,ci,i,clearance) {
  if(clearance<=0) return true;
  const p=comps[ci],n=p.length/3,point=(q,k)=>[q[3*k],q[3*k+1],q[3*k+2]];
  for(const edge of [i,(i+1)%n]) {
    const a=point(p,edge),b=point(p,(edge+1)%n);
    for(let c=0;c<comps.length;c++) {
      const q=comps[c],m=q.length/3;
      for(let j=0;j<m;j++) {
        // Nearby edges belong to the same continuous piece of tube.
        if(c===ci) {const d=Math.abs(edge-j);if(Math.min(d,n-d)<=3) continue;}
        if(segmentDistance(a,b,point(q,j),point(q,(j+1)%m))<clearance) return false;
      }
    }
  }
  return true;
}

// Returns a bounded set of clickable proposals. In particular, the initial
// segments must be crossing-free, and an over/under order must already exist
// in space; no strand is lifted through another one.
export function findR2AddMoves(components,diagram,{clearance=0.0084}={}) {
  if(!components.length || !diagram) return [];
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of components) for(let i=0;i<p.length;i++){const k=i%3;lo[k]=Math.min(lo[k],p[i]);hi[k]=Math.max(hi[k],p[i]);}
  const scale=Math.max(...lo.map((v,i)=>hi[i]-v));
  if(!scale || !Number.isFinite(scale) || !genericProjection(diagram.proj,scale*1e-10)) return [];
  const sources=[],span=4;
  for(let c=0;c<diagram.proj.length;c++) {
    const P=diagram.proj[c], events=diagram.gauss.comps[c];
    // Widen the moving arc to several sample edges, so the two new strands
    // are separated by more than the diameter of the rendered tube.
    for(let i=0;i+span<P.N;i++) {
      if(events.some(e=>e.s>=i && e.s<i+span)) continue;
      const a=[P.x[i],P.y[i]],b=[P.x[i+span],P.y[i+span]];
      if(Math.hypot(...sub(a,b))>=Math.max(scale*1e-8,clearance*2.1)) sources.push({c,i,n:P.N,a,b,span});
    }
  }
  const candidates=[];
  for(const s of sources) for(const t of sources) {
    if(s.c===t.c) {let near=false;for(let k=0;k<s.span;k++)for(let l=0;l<t.span;l++){const d=Math.abs((s.i+k)-(t.i+l));if(Math.min(d,s.n-d)<=3)near=true;}if(near)continue;}
    const m=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2], v=sub(t.b,t.a), l=v[0]*v[0]+v[1]*v[1];
    const u=((m[0]-t.a[0])*v[0]+(m[1]-t.a[1])*v[1])/l;
    if(u<0.1 || u>0.9) continue;
    const q=[t.a[0]+u*v[0],t.a[1]+u*v[1]], dist=Math.hypot(...sub(q,m));
    if(dist<scale*1e-6 || dist>scale*1.1) continue;
    const side1=cross(v,sub(s.a,t.a)),side2=cross(v,sub(s.b,t.a));
    if(side1*side2<=0) continue;
    const tip=[m[0]+2*(q[0]-m[0]),m[1]+2*(q[1]-m[1])];
    if(!intersection(s.a,tip,t.a,t.b) || !intersection(tip,s.b,t.a,t.b)) continue;
    candidates.push({s,t,m,q,tip,dist});
  }
  candidates.sort((a,b)=>a.dist-b.dist);
  const result=[];
  let attempted=0;
  for(const {s,t,m,q,tip,dist} of candidates) {
    // Suppress near-identical targets before attempting expensive checks.
    if(result.some(r=>Math.hypot(r.x-(m[0]+q[0])/2,r.y-(m[1]+q[1])/2)<Math.max(dist*0.5,scale*0.012))) continue;
    if(++attempted>200) break;
    let base=components,valid=true,peelSteps=[];
    for(let k=1;k<s.span;k++) {
      if(!clearTriangle(base,s.c,s.i+1)) {valid=false;break;}
      const shorter=remove(base,s.c,s.i+1),D=projectDiagram(shorter,diagram.basis.w,diagram.basis.v);
      if(!genericProjection(D.proj,scale*1e-10) || !unchanged(diagram.crossings,D.crossings,scale*1e-8)) {valid=false;break;}
      peelSteps.push(removalStep(base,s.c,s.i+1));
      base=shorter;
    }
    if(!valid) continue;
    const dx=tip[0]-m[0],dy=tip[1]-m[1],{u,v,w}=diagram.basis;
    // If the original strands have little or no depth separation, lift a
    // short bridge above or below them first. Each insertion is itself a
    // triangle sweep certified disjoint from the 3D link.
    const p=base[s.c], j=(s.i+1)%(p.length/3),a=[0,1,2].map(k=>p[3*s.i+k]),b=[0,1,2].map(k=>p[3*j+k]);
    let next=null,sourceIndex=s.i,addedBridge=0,moveSteps=null;
    for(const lift of [0,Math.max(scale*0.15,clearance*2),-Math.max(scale*0.15,clearance*2)]) {
      let bridge=base,si=s.i,extra=0,steps=peelSteps.slice();
      if(lift) {
        const at=t=>a.map((x,k)=>x+(b[k]-x)*t+lift*w[k]);
        bridge=insert(bridge,s.c,s.i,at(.12));
        if(!clearTriangle(bridge,s.c,s.i+1)) continue;
        steps.push(insertionStep(bridge,s.c,s.i+1));
        bridge=insert(bridge,s.c,s.i+1,at(.88));
        if(!clearTriangle(bridge,s.c,s.i+2)) continue;
        steps.push(insertionStep(bridge,s.c,s.i+2));
        si++;extra=2;
      }
      const pp=bridge[s.c],end=(si+1)%(pp.length/3);
      const mid=[0,1,2].map(k=>(pp[3*si+k]+pp[3*end+k])/2);
      const point=mid.map((x,k)=>x+dx*u[k]+dy*v[k]);
      const candidate=insert(bridge,s.c,si,point);
      if(!clearTriangle(candidate,s.c,si+1) || !clearTube(candidate,s.c,si,clearance)) continue;
      if(lift && (!clearTube(candidate,s.c,s.i,clearance) || !clearTube(candidate,s.c,si+2,clearance))) continue;
      // Ensure the trial really creates the intended pair before accepting it.
      const trial=projectDiagram(candidate,w,v);
      if(trial.crossings.length!==diagram.crossings.length+2 || !genericProjection(trial.proj,scale*1e-10)) continue;
      steps.push(insertionStep(candidate,s.c,si+1));
      next=candidate;sourceIndex=si;addedBridge=extra;moveSteps=steps;break;
    }
    if(!next) continue;
    const D=projectDiagram(next,w,v);
    if(D.crossings.length!==diagram.crossings.length+2 || !genericProjection(D.proj,scale*1e-10)) continue;
    const added=originalCrossingsUnchanged(diagram.crossings,D.crossings,scale*1e-8);
    if(!added || added[0].sign===added[1].sign) continue;
    const targetIndex=t.i+(s.c===t.c && t.i>s.i ? 2-s.span+addedBridge : 0);
    let sourceOver=null,ok=true;
    for(const X of added) {
      if(X.sinAng<1e-5 || X.dz<scale*1e-8) {ok=false;break;}
      const onSource=e=>e.c===s.c && (Math.floor(e.s)===sourceIndex || Math.floor(e.s)===sourceIndex+1);
      const onTarget=e=>e.c===t.c && Math.floor(e.s)>=targetIndex && Math.floor(e.s)<targetIndex+t.span;
      let over;
      if(onSource(X.A)&&onTarget(X.B)) over=X.overA;
      else if(onSource(X.B)&&onTarget(X.A)) over=!X.overA;
      else {ok=false;break;}
      if(sourceOver!==null && sourceOver!==over){ok=false;break;} sourceOver=over;
    }
    if(!ok || Math.hypot(added[0].x-added[1].x,added[0].y-added[1].y)<clearance) continue;
    result.push({type:'R2+',x:(m[0]+q[0])/2,y:(m[1]+q[1])/2,components:next,steps:moveSteps});
    if(result.length>=12) break;
  }
  return result;
}
