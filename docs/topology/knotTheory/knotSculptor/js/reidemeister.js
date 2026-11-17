// Conservative Reidemeister I recognition on a projected polygonal link.
// Each proposed edit is one elementary PL isotopy: a vertex is removed only
// when its entire swept triangle is clear of every other edge in 3D.
import { projectPoints, findCrossings } from './diagram.js';
import { removalStep } from './moveAnimationSteps.js';

const sub = (a,b) => a.map((x,i)=>x-b[i]);
const dot = (a,b) => a.reduce((s,x,i)=>s+x*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const point = (p,i) => [p[3*i],p[3*i+1],p[3*i+2]];
const mix = (a,b,t) => a.map((x,i)=>x+(b[i]-x)*t);

// Closest squared distance from a point to a nondegenerate triangle.
function pointTriangle2(p,a,b,c) {
  const ab=sub(b,a), ac=sub(c,a), ap=sub(p,a), d1=dot(ab,ap), d2=dot(ac,ap);
  if(d1<=0 && d2<=0) return dot(ap,ap);
  const bp=sub(p,b), d3=dot(ab,bp), d4=dot(ac,bp);
  if(d3>=0 && d4<=d3) return dot(bp,bp);
  const vc=d1*d4-d3*d2;
  if(vc<=0 && d1>=0 && d3<=0) { const q=mix(a,b,d1/(d1-d3)); return dot(sub(p,q),sub(p,q)); }
  const cp=sub(p,c), d5=dot(ab,cp), d6=dot(ac,cp);
  if(d6>=0 && d5<=d6) return dot(cp,cp);
  const vb=d5*d2-d1*d6;
  if(vb<=0 && d2>=0 && d6<=0) { const q=mix(a,c,d2/(d2-d6)); return dot(sub(p,q),sub(p,q)); }
  const va=d3*d6-d5*d4;
  if(va<=0 && d4-d3>=0 && d5-d6>=0) { const q=mix(b,c,(d4-d3)/((d4-d3)+(d5-d6))); return dot(sub(p,q),sub(p,q)); }
  const n=cross(ab,ac), h=dot(ap,n); return h*h/dot(n,n);
}
// A conservative segment/segment distance. Near-parallel overlapping boxes
// are treated as blocked, avoiding unstable divisions at small scales.
function segmentSegment2(p,q,a,b,eps) {
  let box=0;
  for(let k=0;k<3;k++) {
    const gap=Math.max(0,Math.min(p[k],q[k])-Math.max(a[k],b[k]),Math.min(a[k],b[k])-Math.max(p[k],q[k]));
    box+=gap*gap;
  }
  if(box>eps*eps) return box;
  const u=sub(q,p),v=sub(b,a),w=sub(p,a), aa=dot(u,u), bb=dot(u,v), cc=dot(v,v), dd=dot(u,w), ee=dot(v,w);
  const det=aa*cc-bb*bb;
  if(aa===0 || cc===0 || det<=1e-12*aa*cc) return 0;
  let s=Math.max(0,Math.min(1,(bb*ee-cc*dd)/det));
  let t=(bb*s+ee)/cc;
  if(t<0) {t=0;s=Math.max(0,Math.min(1,-dd/aa));}
  else if(t>1) {t=1;s=Math.max(0,Math.min(1,(bb-dd)/aa));}
  const delta=sub(mix(p,q,s),mix(a,b,t));
  return dot(delta,delta);
}
function segmentTriangle2(p,q,a,b,c,eps) {
  const n=cross(sub(b,a),sub(c,a)), np=dot(sub(p,a),n), nq=dot(sub(q,a),n);
  if((np!==0 || nq!==0) && ((np<=0 && nq>=0) || (np>=0 && nq<=0))) {
    if(Math.abs(np-nq)<=eps*Math.sqrt(dot(n,n))*1e-6) return 0;
    const x=mix(p,q,np/(np-nq));
    if(pointTriangle2(x,a,b,c)<=eps*eps) return 0;
  }
  let d=Math.min(pointTriangle2(p,a,b,c),pointTriangle2(q,a,b,c));
  for(const [u,v] of [[a,b],[b,c],[c,a]]) d=Math.min(d,segmentSegment2(p,q,u,v,eps));
  return d;
}
export function clearTriangle(components,ci,i,scale) {
  const p=components[ci], n=p.length/3, prev=(i+n-1)%n, next=(i+1)%n;
  const a=point(p,prev), b=point(p,i), c=point(p,next), normal=cross(sub(b,a),sub(c,a));
  if(dot(normal,normal)<(scale*scale*1e-10)**2) {
    // Exact straight subdivisions can be removed without moving the curve.
    const ab=sub(b,a), bc=sub(c,b), ac=sub(c,a);
    return dot(ab,bc)>0 && normal.every(x=>x===0);
  }
  const eps=scale*1e-9;
  for(let k=0;k<components.length;k++) {
    const q=components[k], m=q.length/3;
    for(let j=0;j<m;j++) {
      const j1=(j+1)%m;
      if(k===ci && (j===prev || j===i)) continue;
      let u=point(q,j), v=point(q,j1);
      // An incident straight edge meets the triangle's plane only at its
      // shared endpoint unless it is coplanar. Reject the coplanar and
      // nearly-coplanar cases rather than trimming an unsafe short piece.
      if(k===ci && (j1===prev || j===next)) {
        const other=j1===prev ? u : v;
        if(Math.abs(dot(sub(other,a),normal)) <= eps*Math.sqrt(dot(normal,normal))) {
          const origin=j1===prev ? a : c;
          const e1=sub(b,origin), e2=sub(j1===prev ? c : a,origin), r=sub(other,origin);
          const d11=dot(e1,e1), d12=dot(e1,e2), d22=dot(e2,e2), den=d11*d22-d12*d12;
          const alpha=(dot(r,e1)*d22-dot(r,e2)*d12)/den;
          const beta=(dot(r,e2)*d11-dot(r,e1)*d12)/den;
          // Outside the tangent cone is safe even when coplanar.
          if(alpha>=-1e-9 && beta>=-1e-9) return false;
        }
        continue;
      }
      if(segmentTriangle2(u,v,a,b,c,eps)<=eps*eps) return false;
    }
  }
  return true;
}
function inside(x,y,poly) {
  let inP=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inP=!inP;
  }
  return inP;
}
// The crossing finder assumes transverse intersections away from vertices.
// Decline singular projections instead of making claims about their faces.
export function genericProjection(proj,eps) {
  for(let c=0;c<proj.length;c++) {
    const p=proj[c];
    for(let i=0;i<p.N;i++) {
      const x=p.x[i],y=p.y[i];
      for(let d=0;d<proj.length;d++) {
        const q=proj[d];
        for(let j=0;j<q.N;j++) {
          const k=(j+1)%q.N;
          if(c===d && (i===j || i===k)) continue;
          const dx=q.x[k]-q.x[j],dy=q.y[k]-q.y[j],len=dx*dx+dy*dy;
          if(len<=eps*eps) return false;
          const t=Math.max(0,Math.min(1,((x-q.x[j])*dx+(y-q.y[j])*dy)/len));
          if(Math.hypot(x-q.x[j]-t*dx,y-q.y[j]-t*dy)<=eps) return false;
        }
      }
    }
  }
  return true;
}
function loopVertices(P,a,b,X) {
  const n=P.N, poly=[[X.x,X.y]], vertices=[];
  let v=(Math.floor(a)+1)%n, end=Math.floor(b);
  for(let guard=0;guard<n && v!==(end+1)%n;guard++,v=(v+1)%n) {
    poly.push([P.x[v],P.y[v]]); vertices.push(v);
  }
  return {poly,vertices};
}
function matchCrossings(before,after,target,tol) {
  if(after.length!==before.length && after.length!==before.length-1) return null;
  const remaining=after.slice();
  for(const x of before) {
    if(x.id===target.id) continue;
    const k=remaining.findIndex(y=>Math.hypot(x.x-y.x,x.y-y.y)<tol && x.sign===y.sign &&
      ((x.A.c===y.A.c && x.B.c===y.B.c) || (x.A.c===y.B.c && x.B.c===y.A.c)));
    if(k<0) return null;
    remaining.splice(k,1);
  }
  if(!remaining.length) return {removed:true};
  const x=remaining[0];
  if(x.sign!==target.sign || x.A.c!==target.A.c || x.B.c!==target.B.c) return null;
  return {removed:false,target:x};
}

// diagram is the current projectDiagram result. The result contains only
// actually executable moves, with freshly allocated transformed components.
export function findReidemeisterMoves(components, diagram) {
  if(!diagram || !components.length) return [];
  const {proj,crossings,gauss,basis}=diagram;
  const lo=[Infinity,Infinity,Infinity], hi=[-Infinity,-Infinity,-Infinity];
  for(const p of components) for(let i=0;i<p.length;i++) { const j=i%3; lo[j]=Math.min(lo[j],p[i]); hi[j]=Math.max(hi[j],p[i]); }
  const scale=Math.max(...lo.map((x,i)=>hi[i]-x));
  if(!scale || !Number.isFinite(scale) || !genericProjection(proj,scale*1e-10)) return [];
  for(let i=0;i<crossings.length;i++) for(let j=i+1;j<crossings.length;j++)
    if(Math.hypot(crossings[i].x-crossings[j].x,crossings[i].y-crossings[j].y)<=scale*1e-9) return [];
  const result=[];
  for(let ci=0;ci<gauss.comps.length;ci++) {
    const events=gauss.comps[ci], n=events.length;
    for(let k=0;k<n;k++) {
      const a=events[k],b=events[(k+1)%n];
      if(n<2 || a.x!==b.x) continue;
      const X=crossings.find(x=>x.id===a.x);
      if(!X || X.sinAng<1e-5 || X.dz<scale*1e-8 || X.A.c!==ci || X.B.c!==ci) continue;
      const {poly,vertices}=loopVertices(proj[ci],a.s,b.s,X);
      if(poly.length<3 || vertices.length>100) continue;
      // A closed strand entirely inside the projected disk is not visible in
      // the Gauss adjacency test; reject it and any other interior vertex.
      let occupied=false;
      const own=new Set(vertices);
      for(let c=0;c<proj.length && !occupied;c++) for(let j=0;j<proj[c].N;j++) {
        if(c===ci && own.has(j)) continue;
        if(inside(proj[c].x[j],proj[c].y[j],poly)) { occupied=true; break; }
      }
      if(occupied) continue;
      // Peel away vertices of this loop by certified elementary moves. Each
      // intermediate projection may only retain the target crossing or remove
      // it; all other crossings stay fixed. No change is made to the input.
      let current=components.map(p=>Float64Array.from(p)), currentCrossings=crossings, target=X;
      let todo=vertices.slice(), steps=0, finished=null, trajectory=[];
      while(todo.length && steps++<100) {
        let progressed=false;
        for(let vi=0;vi<todo.length;vi++) {
          const i=todo[vi];
          if(current[ci].length/3<=4 || !clearTriangle(current,ci,i,scale)) continue;
          const next=current.map(p=>Float64Array.from(p));
          next[ci]=Float64Array.from(Array.from(next[ci]).filter((_,j)=>Math.floor(j/3)!==i));
          const projected=projectPoints(next,basis);
          if(!genericProjection(projected,scale*1e-10)) continue;
          const after=findCrossings(projected);
          const match=matchCrossings(currentCrossings,after,target,scale*1e-8);
          if(!match) continue;
          trajectory.push(removalStep(current,ci,i));
          current=next; currentCrossings=after;
          if(match.removed) { finished=next; break; }
          target=match.target;
          todo=todo.filter((_,j)=>j!==vi).map(j=>j>i?j-1:j);
          progressed=true; break;
        }
        if(finished || !progressed) break;
      }
      if(finished && !result.some(move=>move.crossing===X.id)) result.push({type:'R1',crossing:X.id,x:X.x,y:X.y,components:finished,steps:trajectory});
    }
  }
  return result;
}
