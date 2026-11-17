// Conservative Reidemeister II removals for polygonal links. Every elementary
// operation replaces two consecutive edges by the third edge of a triangle.
// We only use a triangle when its swept interior is disjoint from the rest of
// the link, so the replacement is a PL ambient isotopy.
import { projectDiagram } from './diagram.js';
import { genericProjection } from './reidemeister.js';
import { removalStep } from './moveAnimationSteps.js';

const sub = (a,b) => a.map((x,i) => x-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((s,x,i) => s+x*b[i],0);
const vtx = (p,i) => [p[3*i],p[3*i+1],p[3*i+2]];

// Inclusive segment/triangle intersection. Coplanar or nearly degenerate
// cases are rejected conservatively, never treated as a clear sweep.
function intersectsTriangle(p,q,a,b,c,scale) {
  const e1=sub(b,a),e2=sub(c,a), n=cross(e1,e2), nn=Math.hypot(...n);
  const eps=scale*1e-10;
  if (nn < scale*scale*1e-12) return true;
  const d0=dot(sub(p,a),n)/nn, d1=dot(sub(q,a),n)/nn;
  if (Math.abs(d0)<eps && Math.abs(d1)<eps) {
    // Drop the dominant normal coordinate and test the closed 2D triangle.
    const drop=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
    const project=x=>x.filter((_,i)=>i!==drop), P=project(p),Q=project(q), A=project(a),B=project(b),C=project(c);
    const orient=(x,y,z)=>(y[0]-x[0])*(z[1]-x[1])-(y[1]-x[1])*(z[0]-x[0]);
    const tol=scale*scale*1e-10;
    const contains=x=>{const v=[orient(A,B,x),orient(B,C,x),orient(C,A,x)];return v.every(t=>t>=-tol)||v.every(t=>t<=tol);};
    if(contains(P)||contains(Q)) return true;
    const touches=(x,y,z,w)=>{
      if(Math.max(x[0],y[0])+eps<Math.min(z[0],w[0]) || Math.max(z[0],w[0])+eps<Math.min(x[0],y[0]) || Math.max(x[1],y[1])+eps<Math.min(z[1],w[1]) || Math.max(z[1],w[1])+eps<Math.min(x[1],y[1])) return false;
      const a=orient(x,y,z),b=orient(x,y,w),c=orient(z,w,x),d=orient(z,w,y);
      return ((a<=tol && b>=-tol)||(b<=tol && a>=-tol)) && ((c<=tol && d>=-tol)||(d<=tol && c>=-tol));
    };
    return touches(P,Q,A,B)||touches(P,Q,B,C)||touches(P,Q,C,A);
  }
  if ((d0>eps && d1>eps)||(d0< -eps && d1< -eps)) return false;
  const den=d0-d1;
  if (Math.abs(den)<eps) return true;
  const t=d0/den;
  if(t<0 || t>1) return false;
  const z=p.map((x,i)=>x+t*(q[i]-x)), w=sub(z,a);
  const u=dot(e1,e1),v=dot(e1,e2),w2=dot(e2,e2),r=dot(w,e1),s=dot(w,e2),det=u*w2-v*v;
  const alpha=(r*w2-s*v)/det,beta=(s*u-r*v)/det;
  return alpha>=-1e-10 && beta>=-1e-10 && alpha+beta<=1+1e-10;
}

export function clearTriangle(comps, ci, i) {
  const p=comps[ci],N=p.length/3, prev=(i+N-1)%N,next=(i+1)%N;
  const a=vtx(p,prev),b=vtx(p,i),c=vtx(p,next);
  const scale=Math.max(Math.hypot(...sub(a,b)),Math.hypot(...sub(b,c)),Math.hypot(...sub(a,c)));
  if(!scale) return false;
  if(Math.hypot(...cross(sub(b,a),sub(c,a))) < scale*scale*1e-12) return false;
  for(let k=0;k<comps.length;k++) {
    const arr=comps[k], n=arr.length/3;
    for(let j=0;j<n;j++) {
      if(k===ci && (j===prev || j===i)) continue;
      let x=vtx(arr,j),y=vtx(arr,(j+1)%n);
      // An incident edge meets the sweep at a fixed endpoint. If it is
      // coplanar, reject when its outgoing ray enters the triangle's tangent
      // cone; otherwise a straight edge can meet the plane only at that end.
      let corner=null, other=null, t1=null, t2=null;
      if(k===ci && (j+1)%n===prev) {corner=a;other=x;t1=b;t2=c;}
      if(k===ci && j===next) {corner=c;other=y;t1=a;t2=b;}
      if(corner) {
        const e1=sub(t1,corner),e2=sub(t2,corner),d=sub(other,corner),nrm=cross(e1,e2);
        const plane=Math.abs(dot(d,nrm))/Math.hypot(...nrm);
        if(plane<=scale*1e-10) {
          const aa=dot(e1,e1),ab=dot(e1,e2),bb=dot(e2,e2),ad=dot(e1,d),bd=dot(e2,d),det=aa*bb-ab*ab;
          const u=(ad*bb-bd*ab)/det,v=(bd*aa-ad*ab)/det;
          if(u>=-1e-10 && v>=-1e-10) return false;
        }
        continue;
      }
      if(intersectsTriangle(x,y,a,b,c,scale)) return false;
    }
  }
  return true;
}
function removeVertex(comps,ci,i) {
  const out=comps.slice(),p=comps[ci],q=new Float64Array(p.length-3);
  q.set(p.subarray(0,3*i)); q.set(p.subarray(3*i+3),3*i); out[ci]=q; return out;
}

// Compare signed Gauss codes up to cyclic shifts and crossing-label changes.
function sameGauss(a,b) {
  if(a.comps.length!==b.comps.length || a.sign.size!==b.sign.size) return false;
  function match(ci,ab,ba) {
    if(ci===a.comps.length) return true;
    const A=a.comps[ci],B=b.comps[ci],n=A.length;
    if(n!==B.length) return false;
    if(!n) return match(ci+1,ab,ba);
    for(let off=0;off<n;off++) {
      const m=new Map(ab),r=new Map(ba); let ok=true;
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


function arcPolyline(arc,diagram) {
  const P=diagram.proj[arc.ci],n=P.N,lookup=id=>diagram.crossings.find(X=>X.id===id);
  const first=lookup(arc.a.x),last=lookup(arc.b.x), points=[[first.x,first.y]],vertices=[];
  let end=arc.b.s; if(end<=arc.a.s) end+=n;
  for(let i=Math.floor(arc.a.s)+1;i<=Math.floor(end);i++) {
    const j=i%n; points.push([P.x[j],P.y[j]]);vertices.push(`${arc.ci}:${j}`);
  }
  points.push([last.x,last.y]); return {points,vertices};
}
function emptyBigon(first,second,diagram) {
  const p=arcPolyline(first,diagram),q=arcPolyline(second,diagram);
  const other=first.a.x===second.a.x ? q.points.slice().reverse() : q.points;
  const poly=p.points.concat(other.slice(1,-1));
  const onBoundary=new Set([...p.vertices,...q.vertices]);
  let area=0;
  for(let i=0;i<poly.length;i++) {const a=poly[i],b=poly[(i+1)%poly.length];area+=a[0]*b[1]-a[1]*b[0];}
  if(Math.abs(area)<1e-14) return false;
  for(let c=0;c<diagram.proj.length;c++) for(let j=0;j<diagram.proj[c].N;j++) {
    if(onBoundary.has(`${c}:${j}`)) continue;
    const x=diagram.proj[c].x[j], y=diagram.proj[c].y[j]; let inside=false;
    for(let i=0,k=poly.length-1;i<poly.length;k=i++) {
      const a=poly[i],b=poly[k];
      if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    if(inside) return false;
  }
  // Choose an interior point for the clickable marker, even for concave faces.
  const ys=[...new Set(poly.map(v=>v[1]))].sort((a,b)=>a-b); let best=null;
  for(let k=0;k<ys.length-1;k++) {
    const y=(ys[k]+ys[k+1])/2, xs=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length];
      if((a[1]>y)!==(b[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2) if(!best || xs[i+1]-xs[i]>best.width) best={x:(xs[i]+xs[i+1])/2,y,width:xs[i+1]-xs[i]};
  }
  return best;
}

export function findR2Moves(components,diagram) {
  if(!components.length || !diagram) return [];
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const p of components) for(let i=0;i<p.length;i++) {const j=i%3;lo[j]=Math.min(lo[j],p[i]);hi[j]=Math.max(hi[j],p[i]);}
  const scale=Math.max(...lo.map((x,i)=>hi[i]-x));
  if(!scale || !Number.isFinite(scale) || !genericProjection(diagram.proj,scale*1e-10)) return [];
  for(let i=0;i<diagram.crossings.length;i++) for(let j=i+1;j<diagram.crossings.length;j++)
    if(Math.hypot(diagram.crossings[i].x-diagram.crossings[j].x,diagram.crossings[i].y-diagram.crossings[j].y)<=scale*1e-9) return [];
  const g=diagram.gauss, adj=new Map();
  for(let ci=0;ci<g.comps.length;ci++) {
    const ev=g.comps[ci];
    for(let i=0;i<ev.length;i++) {
      const a=ev[i],b=ev[(i+1)%ev.length];
      if(a.x===b.x || a.over!==b.over) continue;
      const key=[a.x,b.x].sort((x,y)=>x-y).join(',');
      const group=adj.get(key)||[];
      group.push({ci,a,b,over:a.over}); adj.set(key,group);
    }
  }
  const result=[];
  for(const [key,arcs] of adj) {
    const [x,y]=key.split(',').map(Number);
    const X=diagram.crossings.find(z=>z.id===x),Y=diagram.crossings.find(z=>z.id===y);
    if(!X || !Y || X.sinAng<1e-5 || Y.sinAng<1e-5 || X.dz<scale*1e-8 || Y.dz<scale*1e-8 || g.sign.get(x)===g.sign.get(y) || !arcs.some(a=>a.over) || !arcs.some(a=>!a.over)) continue;
    const wanted={comps:g.comps.map(es=>es.filter(e=>e.x!==x && e.x!==y)),sign:new Map([...g.sign].filter(([id])=>id!==x&&id!==y))};
    // Restrict every operation to a side of an empty projected bigon.
    for(const arc of arcs) {
      let location=null;
      for(const other of arcs) if(other.over!==arc.over && (location=emptyBigon(arc,other,diagram))) break;
      if(!location) continue;
      const N=components[arc.ci].length/3;
      let end=arc.b.s; if(end<=arc.a.s) end+=N;
      // Include vertices on both crossed segments, preserving vertices beyond
      // the local arc. Indices are updated as vertices are deleted.
      let indices=[];
      for(let i=Math.floor(arc.a.s)+1;i<=Math.floor(end);i++) indices.push(i%N);
      if(indices.length===0 || indices.length>N-3) continue;
      let work=components.map(p=>Float64Array.from(p)), trajectory=[];
      while(indices.length) {
        let progressed=false;
        for(let j=0;j<indices.length;j++) {
          const idx=indices[j];
          if(!clearTriangle(work,arc.ci,idx)) continue;
          const next=removeVertex(work,arc.ci,idx),D=projectDiagram(next,diagram.basis.w,diagram.basis.v);
          if(!genericProjection(D.proj,scale*1e-10)) continue;
          if(D.crossings.length>g.sign.size || D.crossings.length<g.sign.size-2) continue;
          trajectory.push(removalStep(work,arc.ci,idx));
          work=next;indices=indices.filter((_,k)=>k!==j).map(v=>v>idx?v-1:v);
          progressed=true;
          if(D.crossings.length===g.sign.size-2 && sameGauss(wanted,D.gauss)) {
            result.push({type:'R2',x:location.x,y:location.y,components:work,steps:trajectory});
            break;
          }
          break;
        }
        if(!progressed || result.length && result[result.length-1].components===work) break;
      }
      if(result.length && result[result.length-1].components===work) break;
    }
  }
  return result;
}
