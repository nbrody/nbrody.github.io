import * as THREE from 'three';
import { monarchTrace } from './monarch-trace.js';
import { monarchVertexShader, wingFragmentShader, bodyFragmentShader } from './monarch-shaders.js';

// JavaScript supplies anatomy and motion; GLSL supplies every surface marking.
export function createMonarch(scene, { reducedMotion = false } = {}) {
  const butterfly = new THREE.Group();
  butterfly.name = 'Monarch';
  butterfly.visible = false;
  butterfly.scale.setScalar(.72);
  scene.add(butterfly);
  function bodyMaterial(color){return new THREE.ShaderMaterial({
    vertexShader:monarchVertexShader,fragmentShader:bodyFragmentShader,
    uniforms:{uColor:{value:new THREE.Color(color)}},side:THREE.DoubleSide
  });}
  const ink=bodyMaterial('#25232a');
  const white=bodyMaterial('#fff0d1');
  // The committed data retains the reference's full-resolution pixel coordinates.
  // Undo the inspection resize/crop, rectify the body's slight lean, and scale.
  function fromPhoto([x,y]){
    const px=x*19/32-880, py=y*19/32-350;
    return new THREE.Vector2((px-40+.075*(py-100))/560,.20+(100-py)/560);
  }
  function tracedShape(data){
    const shape=new THREE.Shape();
    data.outline.forEach((points,i)=>{
      const [a,b,c,d]=points.map(fromPhoto);
      if(i===0)shape.moveTo(a.x,a.y);
      shape.bezierCurveTo(b.x,b.y,c.x,c.y,d.x,d.y);
    });
    return shape;
  }
  function wingMaterial(shape, data, hind) {
    const segments=[], widths=[];
    for(const {points,radii} of data.veins){
      const curve=new THREE.CubicBezierCurve(...points.map(fromPhoto));
      const samples=curve.getPoints(12);
      for(let i=0;i<samples.length-1;i++){
        segments.push(new THREE.Vector4(samples[i].x,samples[i].y,samples[i+1].x,samples[i+1].y));
        widths.push(THREE.MathUtils.lerp(radii[0],radii[1],(i+.5)/12)*19/32/560);
      }
    }
    const boundary=shape.getSpacedPoints(80);
    const edges=boundary.slice(0,-1).map((p,i)=>new THREE.Vector4(p.x,p.y,boundary[i+1].x,boundary[i+1].y));
    // Visible marginal spots measured on the same inspection crop.
    const measuredSpots=hind?
      [[440,660],[406,676],[408,720],[365,753],[311,804],[256,820],[183,837],[132,832],[74,817],[28,800],[5,710]]:
      [[502,116],[624,158],[657,180],[735,215],[792,269],[935,337],[940,380],[927,448],[906,516],[871,515],[836,523],[797,525],[750,532],[698,541],[645,560],[588,580],[538,599],[461,618]];
    const spots=measuredSpots.map(([x,y],i)=>{
      const p=fromPhoto([(x+880)*32/19,(y+350)*32/19]);
      const r=(!hind&&i<5?10:6)/560;
      return new THREE.Vector4(p.x,p.y,r*1.4,r);
    });
    const pigment=(data.pigmentBoundary||data.outline.map(c=>c[0])).map(fromPhoto);
    const islands=(data.orangeIslands||[]).map(({center,radii,angle})=>{
      const p=fromPhoto(center);return new THREE.Vector4(p.x,p.y,radii[0]*19/32/560,radii[1]*19/32/560);
    });
    const islandAngles=(data.orangeIslands||[]).map(p=>-p.angle);
    if(!islands.length){islands.push(new THREE.Vector4(-10,-10,.001,.001));islandAngles.push(0);}
    return new THREE.ShaderMaterial({side:THREE.DoubleSide,
      vertexShader:monarchVertexShader,
      fragmentShader:wingFragmentShader(segments.length,edges.length,spots.length,pigment.length,islands.length),
      uniforms:{uPigment:{value:pigment},uIslands:{value:islands},uIslandAngles:{value:islandAngles},uVeins:{value:segments},uWidths:{value:widths},uEdges:{value:edges},uSpots:{value:spots},uHind:{value:hind?1:0}}
    });
  }
  function ellipsoid(parent, position, scale, material) {
    const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),material);
    m.position.set(...position);m.scale.set(...scale);parent.add(m);return m;
  }
  function wire(parent, points, radius, material) {
    const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),20,radius,5,false);
    parent.add(new THREE.Mesh(geometry,material));
  }
  const fore=tracedShape(monarchTrace.fore);
  const hind=tracedShape(monarchTrace.hind);
  const hinges=[];
  const wings=[[hind,0,wingMaterial(hind,monarchTrace.hind,true)],[fore,.025,wingMaterial(fore,monarchTrace.fore,false)]];
  for(const side of [-1,1]){
    const hinge=new THREE.Group();butterfly.add(hinge);hinges.push({hinge,side});
    const half=new THREE.Group();half.scale.x=side;hinge.add(half);
    for(const [shape,z,material] of wings){
      const geometry=new THREE.ShapeGeometry(shape,60);
      // A shallow camber catches the light as each wing folds.
      const positions=geometry.attributes.position;
      for(let i=0;i<positions.count;i++)positions.setZ(i,.045*Math.sin(positions.getX(i)*2.5));
      geometry.computeVertexNormals();
      const wing=new THREE.Mesh(geometry,material);wing.position.z=z;half.add(wing);
    }
  }
  ellipsoid(butterfly,[0,-.32,.04],[.067,.52,.065],ink);
  ellipsoid(butterfly,[0,.20,.05],[.10,.15,.09],ink);
  ellipsoid(butterfly,[0,.36,.05],[.075,.075,.07],ink);
  for(const side of [-1,1]) {
    wire(butterfly,[[side*.04,.40,.06],[side*.17,.64,.09],[side*.31,.85,.09],[side*.35,.83,.09]],.009,ink);
    ellipsoid(butterfly,[side*.35,.83,.09],[.013,.025,.012],ink);
    for(let i=0;i<3;i++)wire(butterfly,[[side*.04,.16-i*.11,.02],[side*.20,.22-i*.18,-.12],[side*.26,.32-i*.24,-.31]],.009,ink);
    for(let i=0;i<3;i++)ellipsoid(butterfly,[side*.05,.23-i*.06,.13],[.015,.018,.008],white);
  }
  let state='hidden', start=0, route, landingAngle=0;
  const destination=new THREE.Vector3();
  function flyTo(point, time, camera) {
    if(state==='flying')return false;
    destination.copy(point);
    landingAngle=Math.atan2(point.y,point.x)+Math.PI/2;
    const origin=state==='landed'?butterfly.position.clone():new THREE.Vector3(-1.5,1.25,.5).unproject(camera);
    route=new THREE.CubicBezierCurve3(origin,
      origin.clone().lerp(destination,.35).add(new THREE.Vector3(0,.8,1.1)),
      destination.clone().add(new THREE.Vector3(-.8,.65,1.2)),destination.clone());
    start=time;state=reducedMotion?'landed':'flying';butterfly.visible=true;
    butterfly.position.copy(reducedMotion?destination:origin);
    return true;
  }
  function update(time) {
    if(state==='hidden')return;
    const duration=4.2;
    const progress=THREE.MathUtils.clamp((time-start)/duration,0,1);
    if(state==='flying') {
      const eased=1-Math.pow(1-progress,2);
      butterfly.position.copy(route.getPoint(eased));
      butterfly.position.z+=Math.sin(progress*Math.PI)*Math.sin(time*9)*.10;
      butterfly.rotation.z=landingAngle+Math.sin(progress*Math.PI)*Math.sin(time*3)*.22;
      if(progress===1){state='landed';butterfly.position.copy(destination);}
    } else butterfly.rotation.z=landingAngle;
    const fold=state==='flying'?.20+(Math.sin(time*33)+1)*.58:
      reducedMotion?.30:.30+(1-Math.cos((time-start-duration)*1.7))*.15;
    for(const {hinge,side} of hinges)hinge.rotation.y=-side*fold;
    butterfly.userData.state=state;
  }
  return {object:butterfly,flyTo,update,get state(){return state;}};
}
