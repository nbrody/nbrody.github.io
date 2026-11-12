/** Instanced finite plane tree with animated Farey decorations. */
import * as THREE from 'three';
import { B, baseDiskSet, diskSet } from './tree.js';
import { mapPlaneCusp } from './planeAnimation.js';
const COLORS=[0xbdd6ef,0xc4e7dc,0xd9c7ed,0xf0d2b3];
const point=(F,a,b,lift=.003)=>{
  const angle=F.flip||0, x=a*Math.cos(angle);
  return [F.cx+F.R*(x*F.uy+b*F.ux),F.z+lift+F.R*a*Math.sin(angle),-(F.cy+F.R*(-x*F.ux+b*F.uy))];
};
const segment=(out,a,b)=>out.push(...a,...b);
function arc(out,F,fn,n,lift=.003){let prev=point(F,...fn(0),lift);for(let i=1;i<=n;i++){const next=point(F,...fn(i/n),lift);segment(out,prev,next);prev=next;}}
function geodesic(out,F,A,C){
  const d=Math.acos(THREE.MathUtils.clamp(A[0]*C[0]+A[1]*C[1],-1,1));
  if(d<1e-8)return;
  if(Math.PI-d<1e-8){segment(out,point(F,...A),point(F,...C));return;}
  const l=Math.hypot(A[0]+C[0],A[1]+C[1]),dist=1/Math.cos(d/2),r=Math.tan(d/2),x=(A[0]+C[0])/l*dist,y=(A[1]+C[1])/l*dist,a=Math.atan2(A[1]-y,A[0]-x);
  let delta=Math.atan2(C[1]-y,C[0]-x)-a;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;
  const n=Math.max(3,Math.min(24,Math.ceil(r*Math.abs(delta)*12)));
  arc(out,F,s=>[x+r*Math.cos(a+delta*s),y+r*Math.sin(a+delta*s)],n);
}
function updateBuffer(line,values){
  const geometry=line.geometry,needed=values.length;let attr=geometry.getAttribute('position');
  if(!attr||attr.array.length<needed){let capacity=128;while(capacity<needed)capacity*=2;attr=new THREE.BufferAttribute(new Float32Array(capacity),3).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',attr);}
  attr.array.set(values);attr.needsUpdate=true;geometry.setDrawRange(0,needed/3);
}
export function createPlaneScene({recs,settings,showFarey=true,capacity}){
  const group=new THREE.Group(),geometry=new THREE.CircleGeometry(1,48).rotateX(-Math.PI/2);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.87});
  const mesh=new THREE.InstancedMesh(geometry,material,Math.max(capacity||0,recs.length));mesh.frustumCulled=false;group.add(mesh);
  const boundary=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x52667d,transparent:true,opacity:.8}));
  const links=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x9a6e53}));
  boundary.frustumCulled=links.frustumCulled=false;group.add(boundary,links);
  const m=new THREE.Matrix4(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),q=new THREE.Quaternion(),axis=new THREE.Vector3(),color=new THREE.Color(),targetColor=new THREE.Color();
  function update(next){
    if(next.length>mesh.instanceMatrix.count)throw new Error('Plane animation exceeds its allocated instance capacity');
    const lines=[],edges=[];
    next.forEach((rec,i)=>{
      const F=rec.F;pos.set(F.cx,F.z,-F.cy);scale.setScalar(F.R);axis.set(F.ux,0,-F.uy).normalize();q.setFromAxisAngle(axis,-(F.flip||0));
      mesh.setMatrixAt(i,m.compose(pos,q,scale));
      color.setHex(COLORS[(rec.depth||0)%COLORS.length]);
      if(Number.isInteger(rec.targetDepth)&&Number.isFinite(rec.colorMix))color.lerp(targetColor.setHex(COLORS[rec.targetDepth%COLORS.length]),Math.max(0,Math.min(1,rec.colorMix)));
      mesh.setColorAt(i,color);
      arc(lines,F,s=>[Math.cos(2*Math.PI*s),Math.sin(2*Math.PI*s)],48,.002);
      if(rec.gap){const x=F.cx+F.R*F.ux,z=-(F.cy+F.R*F.uy);segment(edges,[x,F.z,z],[x,F.z-rec.gap,z]);}
      if(showFarey&&F.R>=.08){
        const fares=(rec.depth?diskSet(settings.N):baseDiskSet(settings.N)).e;
        for(const [p,q,r,s] of fares){const a=mapPlaneCusp(rec.C,p,q),b=mapPlaneCusp(rec.C,r,s);geodesic(lines,F,B(...a),B(...b));}
      }
    });
    mesh.count=next.length;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
    updateBuffer(boundary,lines);updateBuffer(links,edges);
  }
  update(recs);
  return {group,meshes:[mesh],update,vertexOfHit:hit=>hit?.object===mesh&&Number.isInteger(hit.instanceId)?hit.instanceId:-1,
    dispose(){group.removeFromParent();geometry.dispose();material.dispose();boundary.geometry.dispose();boundary.material.dispose();links.geometry.dispose();links.material.dispose();}};
}
