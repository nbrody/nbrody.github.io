/** Instanced, bounded 3D tree of hyperbolic spaces.
 * The movable boundary circles use the desktop viewer's Möbius geometry.
 * Updating a frame reuses the meshes and line buffers during animation.
 */
import * as THREE from 'three';
import { FIELDS, circles } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';
import { mapBoundaryCircle, appendBoundaryCircle } from './ballCircles.js';

const COLORS = [0xa8c8f3, 0x94d7c6, 0xd5b8ec, 0xf2c89c, 0x9ecbd8];
const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale = (a,s) => [a[0]*s,a[1]*s,a[2]*s];

/**
 * Create a Three.js view. `update(recs)` accepts animated records with F, gap,
 * depth and optional complex Möbius matrix C for the sphere's decoration.
 * For headset performance, small spheres use low-poly instancing and the circle
 * line budget is bounded. `vertexOfHit` maps either instanced mesh back to recs.
 */
export function createBallScene({recs,field,showCircles=true,maxCircleSegments=48000}) {
  const K=FIELDS[field];
  if (!K) throw new Error(`Unknown ball field: ${field}`);
  const group=new THREE.Group(), meshes=[], highGeo=new THREE.SphereGeometry(1,24,16),lowGeo=new THREE.SphereGeometry(1,10,7);
  // Opaque spheres make the front and back distinguishable, as in the desktop viewer.
  const material=new THREE.MeshLambertMaterial(), color=new THREE.Color(), targetColor=new THREE.Color(), matrix=new THREE.Matrix4();
  const resources=[highGeo,lowGeo,material], indexMaps=[[],[]];
  let capacity=0,disposed=false;
  function ensureCapacity(count) {
    if(count<=capacity)return;
    capacity=Math.max(1024,Math.ceil(count*2)+64);
    for(const m of meshes){group.remove(m);m.dispose();}
    meshes.length=0;
    for(const geo of [highGeo,lowGeo]) {
      const m=new THREE.InstancedMesh(geo,material,capacity);
      m.name='hyperbolic-balls';m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;
      group.add(m);meshes.push(m);
    }
  }
  function dynamicLines(hex,opacity) {
    const geo=new THREE.BufferGeometry(),mat=new THREE.LineBasicMaterial({color:hex,transparent:true,opacity,depthWrite:false});
    const lines=new THREE.LineSegments(geo,mat);lines.frustumCulled=false;group.add(lines);resources.push(geo,mat);
    let capacity=0;
    return data=>{
      if(data.length>capacity){capacity=Math.max(1024,2**Math.ceil(Math.log2(data.length)));const attr=new THREE.BufferAttribute(new Float32Array(capacity),3);attr.setUsage(THREE.DynamicDrawUsage);geo.setAttribute('position',attr);}
      const attr=geo.getAttribute('position');
      if(attr){attr.array.set(data);attr.needsUpdate=true;}
      geo.setDrawRange(0,data.length/3);
    };
  }
  const updateEdges=dynamicLines(0x765f55,.8), updateCircles=dynamicLines(0x405773,.72);
  // Desktop circles() is memoized. Cache only the three detail levels actually used.
  const byDetail=showCircles?{2:circles(K,2),3:circles(K,3),4:circles(K,4)}:{};
  function update(nextRecs, {animating=false}={}) {
    if(disposed)return;
    const budget=animating?Math.min(maxCircleSegments,9000):maxCircleSegments;
    ensureCapacity(nextRecs.length);
    const count=[0,0], edges=[], detail=[];
    indexMaps[0].length=0;indexMaps[1].length=0;
    // Ball trees are built largest-first. Animation retains record ordering,
    // spending the decoration budget on large, readable spheres first.
    for(let i=0;i<nextRecs.length;i++) {
      const rec=nextRecs[i],F=rec.F;
      if(!F || !Number.isFinite(F.R) || F.R<=0 || !F.c.every(Number.isFinite))continue;
      const tier=F.R>=.14?0:1, n=count[tier]++,m=meshes[tier];
      indexMaps[tier][n]=i;m.setMatrixAt(n,matrix.makeScale(F.R,F.R,F.R).setPosition(...F.c));
      color.setHex(COLORS[(rec.depth||0)%COLORS.length]);
      if(Number.isInteger(rec.targetDepth)&&Number.isFinite(rec.colorMix))color.lerp(targetColor.setHex(COLORS[rec.targetDepth%COLORS.length]),Math.max(0,Math.min(1,rec.colorMix)));
      m.setColorAt(n,color);
      if(rec.gap>0){const near=add(F.c,scale(F.u,F.R));edges.push(...near,...add(near,scale(F.u,rec.gap)));}
      if(!showCircles || F.R<(animating?.15:.09) || detail.length/6>=budget)continue;
      const level=animating?(F.R>=.5?3:2):(F.R>=.5?4:F.R>=.20?3:2);
      const segments=animating?(F.R>=.5?20:12):(F.R>=.5?32:F.R>=.20?20:12);
      for(const ci of byDetail[level]) {
        if(detail.length/6+segments>budget)break;
        const mapped=mapBoundaryCircle(ci,rec.C);
        if(mapped)appendBoundaryCircle(detail,F,mapped,segments);
      }
    }
    for(let tier=0;tier<2;tier++){meshes[tier].count=count[tier];meshes[tier].instanceMatrix.needsUpdate=true;meshes[tier].boundingSphere=null;if(meshes[tier].instanceColor)meshes[tier].instanceColor.needsUpdate=true;}
    updateEdges(edges);updateCircles(detail);
  }
  update(recs);
  return {
    group,meshes,update,
    vertexOfHit(hit){const tier=meshes.indexOf(hit?.object);return tier>=0&&Number.isInteger(hit.instanceId)?(indexMaps[tier][hit.instanceId]??-1):-1;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const m of meshes)m.dispose();for(const r of resources)r.dispose();},
  };
}
