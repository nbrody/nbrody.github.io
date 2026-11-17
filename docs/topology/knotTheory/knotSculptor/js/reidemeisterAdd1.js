// Add a Reidemeister I kink to a short, clear arc of a polygonal link.
// The existing arc is shortened through certified elementary triangle moves;
// the inserted kink is accepted only if the reverse sequence of triangle
// moves removes its extra vertices without touching any other edge in 3D.
import { projectDiagram } from './diagram.js';
import { clearTriangle, genericProjection } from './reidemeister.js';
import { removalStep } from './moveAnimationSteps.js';

const point = (p,i) => [p[3*i],p[3*i+1],p[3*i+2]];
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const add = (a,b) => a.map((v,i)=>v+b[i]);
const mul = (a,t) => a.map(v=>v*t);
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const remove = (cs,c,i) => {const out=cs.slice(),p=cs[c],q=new Float64Array(p.length-3);q.set(p.subarray(0,3*i));q.set(p.subarray(3*i+3),3*i);out[c]=q;return out;};
const insert = (cs,c,i,points) => {const out=cs.slice(),p=cs[c],q=new Float64Array(p.length+3*points.length);q.set(p.subarray(0,3*(i+1)));q.set(points.flat(),3*(i+1));q.set(p.subarray(3*(i+1)),3*(i+1+points.length));out[c]=q;return out;};

// Conservative segment clearance; near-parallel close bounding boxes are
// rejected instead of risking an unstable closest-points calculation.
function edgesClear(a,b,c,d,gap) {
  let box2=0;
  for(let k=0;k<3;k++) {const x=Math.max(0,Math.min(a[k],b[k])-Math.max(c[k],d[k]),Math.min(c[k],d[k])-Math.max(a[k],b[k]));box2+=x*x;}
  if(box2>=gap*gap) return true;
  const u=sub(b,a),v=sub(d,c),w=sub(a,c), A=dot(u,u),B=dot(u,v),C=dot(v,v),D=dot(u,w),E=dot(v,w),den=A*C-B*B;
  if(!A || !C || den<=A*C*1e-12) return false;
  let min=Infinity;
  const dist=(s,t)=>{const z=sub(add(a,mul(u,s)),add(c,mul(v,t)));return dot(z,z);};
  const clamp=x=>Math.max(0,Math.min(1,x));
  min=Math.min(dist(0,clamp(E/C)),dist(1,clamp((E+B)/C)),dist(clamp(-D/A),0),dist(clamp((B-D)/A),1));
  const sp=(B*E-C*D)/den,tp=(A*E-B*D)/den;
  if(sp>=0 && sp<=1 && tp>=0 && tp<=1) min=Math.min(min,dist(sp,tp));
  return min>=gap*gap;
}
function tubeClear(cs,ci,start,count,gap,crossing) {
  if(gap<=0) return true;
  const p=cs[ci],n=p.length/3, ia=Math.floor(crossing.A.s),ib=Math.floor(crossing.B.s);
  if(!edgesClear(point(p,ia),point(p,(ia+1)%n),point(p,ib),point(p,(ib+1)%n),gap)) return false;
  for(let i=start;i<=start+count;i++) for(let c=0;c<cs.length;c++) {
    const q=cs[c],m=q.length/3;
    for(let j=0;j<m;j++) {
      if(c===ci && Math.min(Math.abs(i-j),n-Math.abs(i-j))<=3) continue;
      if(!edgesClear(point(p,i),point(p,(i+1)%n),point(q,j),point(q,(j+1)%m),gap)) return false;
    }
  }
  return true;
}

function matchOld(before,after,tol) {
  const left=after.slice();
  for(const x of before) {
    const k=left.findIndex(y=>Math.hypot(x.x-y.x,x.y-y.y)<tol && x.sign===y.sign &&
      ((x.A.c===y.A.c && x.B.c===y.B.c && x.overA===y.overA) ||
       (x.A.c===y.B.c && x.B.c===y.A.c && x.overA!==y.overA)));
    if(k<0) return null;
    left.splice(k,1);
  }
  return left.length===1?left[0]:null;
}
function certifyInserted(cs,ci,first,count,scale) {
  // A sequence of elementary PL moves from the new polygon back to its chord.
  // Greedy search is conservative: failing to find an order rejects the move.
  let work=cs, indices=Array.from({length:count},(_,j)=>first+j), steps=[];
  while(indices.length) {
    let found=false;
    for(let k=0;k<indices.length;k++) {
      const i=indices[k];
      if(!clearTriangle(work,ci,i,scale)) continue;
      steps.push(removalStep(work,ci,i));
      work=remove(work,ci,i);
      indices=indices.filter((_,j)=>j!==k).map(j=>j>i?j-1:j);
      found=true; break;
    }
    if(!found) return null;
  }
  // Reverse the certified removal sequence to animate the insertion.
  return steps.reverse().map(({from,to})=>({from:to,to:from}));
}

// The optional maxMoves bounds visual clutter and the amount of work done.
export function findR1AddMoves(components,diagram,{maxMoves=6, tubeDiameter=0.0084}={}) {
  if(!components.length || !diagram) return [];
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of components) for(let i=0;i<p.length;i++){let j=i%3;lo[j]=Math.min(lo[j],p[i]);hi[j]=Math.max(hi[j],p[i]);}
  const scale=Math.max(...lo.map((x,i)=>hi[i]-x));
  if(!scale || !Number.isFinite(scale) || !genericProjection(diagram.proj,scale*1e-10)) return [];
  const {u,v,w}=diagram.basis, result=[];
  for(let ci=0;ci<components.length && result.length<maxMoves;ci++) {
    const p=components[ci],N=p.length/3;
    if(N<5) continue;
    // Sample separated arcs across the component. Long, crossing-free arcs
    // give a visible kink even when the original polyline is finely sampled.
    const stride=Math.max(1,Math.floor(N/18));
    for(let start=0;start<N-2 && result.length<maxMoves;start+=stride) {
      for(const span of [12,8,5,3,1]) {
        const end=start+span;
        if(end>=N) continue;
        if(diagram.gauss.comps[ci].some(e=>e.s>=start-1e-8 && e.s<=end+1e-8)) continue;
        let work=components.map(q=>Float64Array.from(q)), ok=true, peelSteps=[];
        for(let j=1;j<span;j++) {
          if(!clearTriangle(work,ci,start+1,scale)){ok=false;break;}
          peelSteps.push(removalStep(work,ci,start+1));
          work=remove(work,ci,start+1);
        }
        if(!ok) continue;
        const a=point(work[ci],start),b=point(work[ci],start+1),d=sub(b,a);
        const dx=dot(d,u),dy=dot(d,v),L=Math.hypot(dx,dy);
        if(L<scale*0.012) continue;
        const perp=add(mul(u,-dy/L),mul(v,dx/L));
        // Two small planar lobes cross once; depth separates their branches.
        const template=[[.16,0,0],[.24,0,.08],[.75,.28,.08],[.25,.28,-.08],[.76,0,-.08],[.84,0,0]];
        const variants=[];
        for(const depthSign of [1,-1]) {
          const pts=template.map(([t,h,z])=>add(add(add(a,mul(d,t)),mul(perp,h*L)),mul(w,z*L*depthSign)));
          const next=insert(work,ci,start,pts);
          const insertSteps=certifyInserted(next,ci,start+1,pts.length,scale);
          if(!insertSteps) continue;
          const D=projectDiagram(next,w,v);
          if(D.crossings.length!==diagram.crossings.length+1 || !genericProjection(D.proj,scale*1e-10)) continue;
          const x=matchOld(diagram.crossings,D.crossings,scale*1e-8);
          if(!x || x.sinAng<1e-4 || x.dz<Math.max(scale*1e-8,tubeDiameter)) continue;
          const ev=D.gauss.comps[ci], k=ev.findIndex(e=>e.x===x.id);
          if(k<0 || (ev[(k+1)%ev.length].x!==x.id && ev[(k+ev.length-1)%ev.length].x!==x.id)) continue;
          if(!tubeClear(next,ci,start,pts.length,tubeDiameter,x)) continue;
          variants.push({type:'R1+',sign:x.sign,label:`Add ${x.sign>0?'positive':'negative'} kink`,x:x.x,y:x.y,components:next,steps:[...peelSteps,...insertSteps]});
        }
        if(variants.length) { result.push(...variants); break; }
      }
    }
  }
  return result;
}
