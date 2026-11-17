// Conservative type III moves. A triangular face can be flipped when a
// topmost or bottommost side lies in one polygon edge. Replacing that edge by
// two edges sweeps a triangle; clearTriangle certifies the spatial isotopy.
import { projectDiagram } from './diagram.js';
import { genericProjection } from './reidemeister.js';
import { clearTriangle } from './reidemeister2.js';
import { clearTube } from './reidemeisterAdd2.js';
import { removalStep, insertionStep } from './moveAnimationSteps.js';

const vertex=(p,i)=>[p[3*i],p[3*i+1],p[3*i+2]];
const inside=(x,y,poly)=>{ let v=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++) { const a=poly[i],b=poly[j]; if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) v=!v; } return v; };
function sameGauss(a,b) {
  if(a.comps.length!==b.comps.length || a.sign.size!==b.sign.size) return false;
  function match(ci,ab,ba) {
    if(ci===a.comps.length) return true;
    const A=a.comps[ci],B=b.comps[ci],n=A.length;
    if(n!==B.length) return false;
    if(!n) return match(ci+1,ab,ba);
    for(let off=0;off<n;off++) {
      const m=new Map(ab),r=new Map(ba);let ok=true;
      for(let j=0;j<n;j++) {
        const x=A[j],y=B[(j+off)%n];
        if(x.over!==y.over || a.sign.get(x.x)!==b.sign.get(y.x) || (m.has(x.x)&&m.get(x.x)!==y.x) || (r.has(y.x)&&r.get(y.x)!==x.x)) {ok=false;break;}
        m.set(x.x,y.x);r.set(y.x,x.x);
      }
      if(ok && match(ci+1,m,r)) return true;
    }
    return false;
  }
  return match(0,new Map(),new Map());
}
function arcPath(arc,D) {
  const P=D.proj[arc.ci], n=P.N;
  const X=D.crossings[arc.a.x],Y=D.crossings[arc.b.x];
  const points=[[X.x,X.y]], vertices=[];
  let end=arc.b.s;if(end<=arc.a.s) end+=n;
  for(let i=Math.floor(arc.a.s)+1;i<=Math.floor(end);i++) {const j=i%n;points.push([P.x[j],P.y[j]]);vertices.push(`${arc.ci}:${j}`);}
  points.push([Y.x,Y.y]);return {points,vertices};
}
function face(arcs,D,scale) {
  // Orient all three boundary arcs into a cycle.
  let points=[],boundary=new Set(),last=arcs[0].a.x,start=last;
  for(const arc of arcs) {
    let {points:p,vertices}=arcPath(arc,D);
    if(arc.a.x!==last) { if(arc.b.x!==last) return null; p=p.reverse();last=arc.a.x; } else last=arc.b.x;
    if(points.length) p=p.slice(1);points.push(...p);vertices.forEach(v=>boundary.add(v));
  }
  if(last!==start) return null;
  points.pop();
  let area=0;for(let i=0;i<points.length;i++) {const a=points[i],b=points[(i+1)%points.length];area+=a[0]*b[1]-a[1]*b[0];}
  if(Math.abs(area)<scale*scale*1e-12) return null;
  for(let c=0;c<D.proj.length;c++) for(let i=0;i<D.proj[c].N;i++) {
    if(boundary.has(`${c}:${i}`)) continue;
    if(inside(D.proj[c].x[i],D.proj[c].y[i],points)) return null;
  }
  // Use an interior scanline point for the marker, including concave faces.
  const ys=[...new Set(points.map(p=>p[1]))].sort((a,b)=>a-b);let best=null;
  for(let k=0;k<ys.length-1;k++) {
    const y=(ys[k]+ys[k+1])/2,xs=[];
    for(let i=0;i<points.length;i++) {const a=points[i],b=points[(i+1)%points.length];if((a[1]>y)!==(b[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2) if(!best || xs[i+1]-xs[i]>best.width) best={x:(xs[i]+xs[i+1])/2,y,width:xs[i+1]-xs[i]};
  }
  return best && {...best,points};
}
function swappedGauss(g,arcs) {
  const comps=g.comps.map(es=>es.map(e=>({...e})));
  for(const {ci,index} of arcs) {const es=comps[ci],j=(index+1)%es.length;[es[index],es[j]]=[es[j],es[index]];}
  return {comps,sign:new Map(g.sign)};
}
function insert(comps,ci,index,p) {
  const out=comps.slice(),a=comps[ci],q=new Float64Array(a.length+3),at=3*(index+1);
  q.set(a.subarray(0,at));q.set(p,at);q.set(a.subarray(at),at+3);out[ci]=q;return out;
}
function remove(comps,ci,index) {
  const out=comps.slice(),a=comps[ci],q=new Float64Array(a.length-3),at=3*index;
  q.set(a.subarray(0,at));q.set(a.subarray(at+3),at);out[ci]=q;return out;
}
function clearOrStraight(comps,ci,i) {
  const p=comps[ci],n=p.length/3,a=vertex(p,(i+n-1)%n),b=vertex(p,i),c=vertex(p,(i+1)%n);
  const u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-b[k]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(cross.every(x=>x===0) && u.reduce((s,x,k)=>s+x*v[k],0)>0) return true;
  return clearTriangle(comps,ci,i);
}
function untouched(before,after,ids,tol) {
  const remaining=after.slice();
  for(const x of before) {
    if(ids.has(x.id)) continue;
    const k=remaining.findIndex(y=>Math.hypot(x.x-y.x,x.y-y.y)<tol && x.sign===y.sign &&
      ((x.A.c===y.A.c && x.B.c===y.B.c && x.overA===y.overA) || (x.A.c===y.B.c && x.B.c===y.A.c && x.overA!==y.overA)));
    if(k<0) return false;remaining.splice(k,1);
  }
  return true;
}
export function findR3Moves(components,D,options={}) {
  if(!D || !components.length || D.crossings.length<3) return [];
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of components) for(let i=0;i<p.length;i++){const j=i%3;lo[j]=Math.min(lo[j],p[i]);hi[j]=Math.max(hi[j],p[i]);}
  const scale=Math.max(...lo.map((x,i)=>hi[i]-x));
  if(!scale || !Number.isFinite(scale) || !genericProjection(D.proj,scale*1e-10)) return [];
  for(let i=0;i<D.crossings.length;i++) {
    const X=D.crossings[i];if(X.sinAng<1e-5 || X.dz<scale*1e-8) return [];
    for(let j=i+1;j<D.crossings.length;j++) if(Math.hypot(X.x-D.crossings[j].x,X.y-D.crossings[j].y)<scale*1e-9) return [];
  }
  const arcs=[];
  D.gauss.comps.forEach((ev,ci)=>ev.forEach((a,index)=>{const b=ev[(index+1)%ev.length];if(a.x!==b.x) arcs.push({ci,index,a,b});}));
  const out=[],seen=new Set();
  for(const first of arcs) for(const second of arcs) {
    const shared=[first.a.x,first.b.x].filter(x=>x===second.a.x || x===second.b.x);
    if(shared.length!==1) continue;
    if(first.b.x!==shared[0]) continue;
    const from=first.a.x===shared[0]?first.b.x:first.a.x;
    const to=second.a.x===shared[0]?second.b.x:second.a.x;
    if(from===to) continue;
    for(const third of arcs) {
      if(!((third.a.x===from && third.b.x===to)||(third.a.x===to && third.b.x===from))) continue;
      const triple=[first,second,third], ids=new Set([from,to,shared[0]]);
      const events=triple.flatMap(a=>[a.a,a.b]);if(new Set(events).size!==6) continue;
      const key=triple.map(a=>`${a.ci}:${a.index}`).sort().join('|');if(seen.has(key)) continue;seen.add(key);
      const location=face(triple,D,scale);if(!location) continue;
      const wanted=swappedGauss(D.gauss,triple);
      let found=false;
      for(const arc of triple) {
        if(arc.a.over!==arc.b.over) continue; // Only move a topmost or bottommost strand.
        const seg=Math.floor(arc.a.s),seg2=Math.floor(arc.b.s);
        if(seg!==seg2 || arc.b.s<=arc.a.s) {
          if(options.noPeel) continue;
          // Simplify only the selected face side, by collision-checked PL
          // vertex removals. Every intermediate diagram must have the same
          // signed Gauss code and all unrelated crossings fixed.
          const n=components[arc.ci].length/3;let end=arc.b.s;if(end<=arc.a.s) end+=n;
          let todo=[];for(let i=seg+1;i<=Math.floor(end);i++) todo.push(i%n);
          if(!todo.length || todo.length>100 || todo.length>n-3) continue;
          let work=components.map(p=>Float64Array.from(p)), trajectory=[];
          while(todo.length) {
            let progressed=false;
            for(let k=0;k<todo.length;k++) {
              const i=todo[k];if(work[arc.ci].length/3<=4 || !clearOrStraight(work,arc.ci,i)) continue;
              const next=remove(work,arc.ci,i),after=projectDiagram(next,D.basis.w,D.basis.v);
              if(!genericProjection(after.proj,scale*1e-10) || !sameGauss(D.gauss,after.gauss) || !untouched(D.crossings,after.crossings,ids,scale*1e-8) || !clearTube(next,arc.ci,(i+next[arc.ci].length/3-1)%(next[arc.ci].length/3),options.clearance ?? 0.0084)) continue;
              trajectory.push(removalStep(work,arc.ci,i));
              work=next;todo=todo.filter((_,j)=>j!==k).map(j=>j>i?j-1:j);progressed=true;
              const candidate=findR3Moves(work,after,{...options,noPeel:true}).find(m=>inside(m.x,m.y,location.points));
              if(candidate) {out.push({type:'R3',x:location.x,y:location.y,components:candidate.components,steps:[...trajectory,...candidate.steps]});found=true;}
              break;
            }
            if(found || !progressed) break;
          }
          if(found) break;
          continue;
        }
        const opposite=[...ids].find(id=>id!==arc.a.x && id!==arc.b.x),X=D.crossings[opposite];
        const P=D.proj[arc.ci],n=P.N,j=(seg+1)%n,dx=P.x[j]-P.x[seg],dy=P.y[j]-P.y[seg],len=dx*dx+dy*dy;
        if(len<scale*scale*1e-20) continue;
        const t=((X.x-P.x[seg])*dx+(X.y-P.y[seg])*dy)/len;
        if(t<=0 || t>=1) continue;
        const fx=P.x[seg]+t*dx,fy=P.y[seg]+t*dy,ox=X.x-fx,oy=X.y-fy;
        const A=vertex(components[arc.ci],seg),B=vertex(components[arc.ci],j);
        const base=A.map((x,i)=>x+t*(B[i]-x));
        for(const factor of [1.2,1.6,2.2,3,4]) {
          const p=base.map((v,i)=>v+factor*(ox*D.basis.u[i]+oy*D.basis.v[i]));
          const next=insert(components,arc.ci,seg,p);
          if(!clearTriangle(next,arc.ci,seg+1) || !clearTube(next,arc.ci,seg,options.clearance ?? 0.0084)) continue;
          const after=projectDiagram(next,D.basis.w,D.basis.v);
          if(after.crossings.length!==D.crossings.length || !genericProjection(after.proj,scale*1e-10) || !untouched(D.crossings,after.crossings,ids,scale*1e-8) || !sameGauss(wanted,after.gauss)) continue;
          out.push({type:'R3',x:location.x,y:location.y,components:next,steps:[insertionStep(next,arc.ci,seg+1)]});found=true;break;
        }
        if(found) break;
      }
    }
  }
  return out;
}
