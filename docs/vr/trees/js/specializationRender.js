/** Render a bounded specialization of the plane/ball tree.
 *
 * Records come from the exact desktop-derived specialization plan. Non-root
 * surfaces are ghosted as they fly to the base; their distinct, nonduplicate
 * boundary patterns remain on the resulting single space. This renderer owns
 * its objects and buffers, so ordinary tree rendering can be restored intact.
 */
import * as THREE from 'three';
import { B, baseDiskSet, diskSet } from './tree.js';
import { mapPlaneCusp } from './planeAnimation.js';
import { FIELDS, circles } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';
import { mapBoundaryCircle, appendBoundaryCircle } from './ballCircles.js';

const BALL_FILLS=[0xa8c8f3,0x94d7c6,0xd5b8ec,0xf2c89c,0x9ecbd8];
const PLANE_FILLS=[0xbdd6ef,0xc4e7dc,0xd9c7ed,0xf0d2b3];
const INKS=[0x273d5b,0x264f4b,0x593a69,0x75482b,0x315c73,0x923d58,0x536b34,0x54459b,0x984e28,0x17677d,0x703b5d];
const point=(F,a,b,lift=.003)=>{
  const angle=F.flip||0,x=a*Math.cos(angle);
  return [F.cx+F.R*(x*F.uy+b*F.ux),F.z+lift+F.R*a*Math.sin(angle),-(F.cy+F.R*(-x*F.ux+b*F.uy))];
};
const segment=(out,a,b)=>out.push(...a,...b);
function arc(out,F,fn,n,lift){let prev=point(F,...fn(0),lift);for(let j=1;j<=n;j++){const next=point(F,...fn(j/n),lift);segment(out,prev,next);prev=next;}}
function geodesic(out,F,A,C,lift){
  if(!A.every(Number.isFinite)||!C.every(Number.isFinite))return;
  const d=Math.acos(THREE.MathUtils.clamp(A[0]*C[0]+A[1]*C[1],-1,1));if(d<1e-8)return;
  if(Math.PI-d<1e-8){segment(out,point(F,...A,lift),point(F,...C,lift));return;}
  const l=Math.hypot(A[0]+C[0],A[1]+C[1]);if(l<1e-10)return;
  const distance=1/Math.cos(d/2),r=Math.tan(d/2),x=(A[0]+C[0])/l*distance,y=(A[1]+C[1])/l*distance,a=Math.atan2(A[1]-y,A[0]-x);
  let delta=Math.atan2(C[1]-y,C[0]-x)-a;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;
  const count=Math.max(3,Math.min(24,Math.ceil(r*Math.abs(delta)*12)));
  arc(out,F,s=>[x+r*Math.cos(a+delta*s),y+r*Math.sin(a+delta*s)],count,lift);
}
function colors(out,vertices,color){for(let n=0;n<vertices.length/3;n++)out.push(color.r,color.g,color.b);}
function updateBuffer(line,values,colourValues){
  const geometry=line.geometry,needed=values.length;let position=geometry.getAttribute('position'),colour=geometry.getAttribute('color');
  if(!position||position.array.length<needed){let cap=128;while(cap<needed)cap*=2;position=new THREE.BufferAttribute(new Float32Array(cap),3).setUsage(THREE.DynamicDrawUsage);colour=new THREE.BufferAttribute(new Float32Array(cap),3).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('position',position);geometry.setAttribute('color',colour);}
  position.array.set(values);position.needsUpdate=true;colour.array.set(colourValues);colour.needsUpdate=true;geometry.setDrawRange(0,needed/3);
}
/**
 * `update(records,{progress})` takes records from createSpecialization().at().
 * A persistent root and up to 24/10 nonduplicate patterns are drawn at the
 * endpoint; other pictures fade while they move to the shared base.
 */
export function createSpecializationScene({recs,settings,showFarey=true,maxSegments=18000}){
  const isBall=settings.field!=='Q',K=isBall?FIELDS[settings.field]:null;
  if(isBall&&!K)throw new Error('Unknown complex field');
  const group=new THREE.Group(),fills=isBall?BALL_FILLS:PLANE_FILLS;
  const geometry=isBall?new THREE.SphereGeometry(1,24,16):new THREE.CircleGeometry(1,48).rotateX(-Math.PI/2);
  const Material=isBall?THREE.MeshLambertMaterial:THREE.MeshBasicMaterial;
  const rootMaterial=new Material({color:0xffffff,side:THREE.DoubleSide,transparent:!isBall,opacity:isBall?1:.87});
  const ghostMaterial=new Material({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.82,depthWrite:false});
  const count=Math.max(1,recs.length),root=new THREE.InstancedMesh(geometry,rootMaterial,1),ghosts=new THREE.InstancedMesh(geometry,ghostMaterial,count);
  root.frustumCulled=ghosts.frustumCulled=false;root.instanceMatrix.setUsage(THREE.DynamicDrawUsage);ghosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(root,ghosts);
  function makeLines(){const geo=new THREE.BufferGeometry(),mat=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.9,depthWrite:false});const lines=new THREE.LineSegments(geo,mat);lines.frustumCulled=false;group.add(lines);return lines;}
  const retained=makeLines(),fading=makeLines(),edges=makeLines();
  const circleSet=isBall&&showFarey?circles(K,Math.min(settings.N,3)):[];
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),quat=new THREE.Quaternion(),axis=new THREE.Vector3(),color=new THREE.Color(),lineColor=new THREE.Color();
  let disposed=false;
  function setTransform(mesh,index,F){
    if(isBall){matrix.makeScale(F.R,F.R,F.R).setPosition(...F.c);}
    else{position.set(F.cx,F.z,-F.cy);scale.setScalar(F.R);axis.set(F.ux,0,-F.uy).normalize();quat.setFromAxisAngle(axis,-(F.flip||0));matrix.compose(position,quat,scale);}
    mesh.setMatrixAt(index,matrix);
  }
  function update(records,{progress=0}={}){
    if(disposed)return;
    const p=Math.max(0,Math.min(1,progress)),ordered=[...records.filter(r=>r.root),...records.filter(r=>!r.root&&r.overlay),...records.filter(r=>!r.root&&!r.overlay)];
    // Source identity stays fixed even when a different source becomes the root
    // after an action on the collapsed space. Preserve overlay depth and color.
    const retainedRecords=records.filter(r=>r.overlay).sort((a,b)=>(a.colorIndex??0)-(b.colorIndex??0));
    const layerOf=new Map(retainedRecords.map((r,i)=>[r,i]));
    const keep=[],keepColors=[],fade=[],fadeColors=[],edge=[],edgeColors=[];let rootCount=0,ghostCount=0,segments=0;
    // Reserve a fair share for every retained picture: later overlays must not
    // vanish merely because earlier spheres used the whole line budget.
    const retainedCount=Math.max(1,retainedRecords.length),share=Math.max(12,Math.floor(maxSegments/retainedCount));
    for(const rec of ordered){
      const F=rec.F;if(!F||!Number.isFinite(F.R)||F.R<=0)continue;
      const center=isBall?F.c:[F.cx,F.z,F.cy];if(!center?.every(Number.isFinite))continue;
      if(rec.root&&rootCount===0){setTransform(root,rootCount,F);root.setColorAt(rootCount++,color.setHex(fills[(rec.depth||0)%fills.length]));}
      else if(p<.999&&ghostCount<count){setTransform(ghosts,ghostCount,F);ghosts.setColorAt(ghostCount++,color.setHex(fills[(rec.depth||0)%fills.length]));}
      const keepPattern=!!rec.overlay,idx=keepPattern?(layerOf.get(rec)??0):0;
      // A root that is not one of the retained source images supplies the
      // base surface, not a new tessellation. Still draw its disk outline.
      if(p>=.999&&!keepPattern){
        if(rec.root&&!isBall){const outline=[];arc(outline,F,s=>[Math.cos(2*Math.PI*s),Math.sin(2*Math.PI*s)],48,.004);keep.push(...outline);colors(keepColors,outline,lineColor.setHex(INKS[0]));segments+=outline.length/6;}
        continue;
      }
      if(!showFarey||(!keepPattern&&F.R<.09)||segments>=maxSegments)continue;
      const coords=[],lift=.004+(keepPattern?idx*.002:0),localLimit=keepPattern?Math.min(share,maxSegments-segments):maxSegments-segments;
      if(isBall){
        const shifted=idx?{...F,R:F.R*(1+idx*.002)}:F;
        const circleSeg=F.R>=.5&&retainedCount<=5?24:12;
        for(const ci of circleSet){if(coords.length/6+circleSeg>localLimit)break;const mapped=mapBoundaryCircle(ci,rec.C);if(mapped)appendBoundaryCircle(coords,shifted,mapped,circleSeg);}
      }else{
        const farey=(rec.root?baseDiskSet(settings.N):diskSet(settings.N)).e;
        // The common outline is drawn once, while every retained picture gets its own tessellation.
        if(rec.root)arc(coords,F,s=>[Math.cos(2*Math.PI*s),Math.sin(2*Math.PI*s)],48,lift);
        for(const [a,b,c,d] of farey){if(coords.length/6>=localLimit)break;const A=mapPlaneCusp(rec.C,a,b),D=mapPlaneCusp(rec.C,c,d);if(Math.hypot(...A)>1e-12&&Math.hypot(...D)>1e-12)geodesic(coords,F,B(...A),B(...D),lift);}
      }
      segments+=coords.length/6;lineColor.setHex(keepPattern?INKS[(rec.colorIndex??idx)%INKS.length]:INKS[(rec.depth||0)%INKS.length]);
      if(keepPattern){keep.push(...coords);colors(keepColors,coords,lineColor);}else{fade.push(...coords);colors(fadeColors,coords,lineColor);}
      if(rec.gap&&p<.99){const a=isBall?F.c.map((x,i)=>x+F.u[i]*F.R):[F.cx+F.R*F.ux,F.z,-(F.cy+F.R*F.uy)];const b=isBall?a.map((x,i)=>x+F.u[i]*rec.gap):[a[0],a[1]-rec.gap,a[2]];segment(edge,a,b);colors(edgeColors,[...a,...b],lineColor.setHex(0x765f55));}
    }
    root.count=rootCount;ghosts.count=ghostCount;root.instanceMatrix.needsUpdate=true;ghosts.instanceMatrix.needsUpdate=true;
    if(root.instanceColor)root.instanceColor.needsUpdate=true;if(ghosts.instanceColor)ghosts.instanceColor.needsUpdate=true;
    ghostMaterial.opacity=(isBall?1:.87)*(1-p)*(1-p);ghostMaterial.depthWrite=p<.01;fading.material.opacity=.8*(1-p);edges.material.opacity=.8*(1-p);
    updateBuffer(retained,keep,keepColors);updateBuffer(fading,fade,fadeColors);updateBuffer(edges,edge,edgeColors);
  }
  update(recs,{progress:0});
  return {group,update,dispose(){if(disposed)return;disposed=true;group.removeFromParent();root.dispose();ghosts.dispose();geometry.dispose();rootMaterial.dispose();ghostMaterial.dispose();for(const line of [retained,fading,edges]){line.geometry.dispose();line.material.dispose();}}};
}
