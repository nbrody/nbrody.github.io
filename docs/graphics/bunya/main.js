import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const time={value:0}, wind={value:reduced?0:.3};
let renderer;
try {renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,preserveDrawingBuffer:true});}
catch(e){$('status').textContent='This study needs a browser with WebGL enabled.';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene();scene.background=new THREE.Color('#e8e8df');
scene.fog=new THREE.Fog('#e8e8df',55,110);
const camera=new THREE.PerspectiveCamera(35,1,.1,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=75;
controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.45;
scene.add(new THREE.HemisphereLight('#f6f5dd','#6b7055',2));
const sun=new THREE.DirectionalLight('#fff1cd',3.3);sun.position.set(-10,24,12);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-14,right:14,top:22,bottom:-12,near:.5,far:60});sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun);
const fill=new THREE.DirectionalLight('#c8dbdc',.65);fill.position.set(6,7,-7);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:'#e8e6da',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.035;ground.receiveShadow=true;scene.add(ground);
const tree=new THREE.Group();scene.add(tree);
let seed=32771;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
const range=(a,b)=>a+(b-a)*rand(), V=(x,y,z)=>new THREE.Vector3(x,y,z);
const up=V(0,1,0), dummy=new THREE.Object3D();

// Shared object-space bending keeps the wood, sprays, and their shadows together.
const bend=`
vec3 breeze(vec3 p){
 float h=max(p.y,0.0);float w=h*h*.0007*uWind;
 p.x+=w*(sin(uTime*.85+h*.68)+.3*sin(uTime*1.9+p.z*2.0));
 p.z+=w*.4*sin(uTime*.65+h*.7);return p;
}`;
function animateMaterial(material,kind){
 material.onBeforeCompile=s=>{
  s.uniforms.uTime=time;s.uniforms.uWind=wind;
  s.vertexShader='uniform float uTime;uniform float uWind;varying vec3 vBotanical;\n'+bend+'\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <project_vertex>',`vec4 botanicalPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
 botanicalPosition=instanceMatrix*botanicalPosition;
#endif
 vBotanical=botanicalPosition.xyz;
 vec4 mvPosition=modelViewMatrix*vec4(breeze(botanicalPosition.xyz),1.0);
 gl_Position=projectionMatrix*mvPosition;`);
  s.vertexShader=s.vertexShader.replace('#include <worldpos_vertex>',`vec4 worldPosition=modelMatrix*vec4(breeze(botanicalPosition.xyz),1.0);`);
  s.fragmentShader='varying vec3 vBotanical;\n'+s.fragmentShader;
  if(kind==='bark')s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float bands=sin(vBotanical.y*45.0+sin(vBotanical.x*6.0+vBotanical.z*8.0)*.65);
   float flecks=sin(vBotanical.x*85.0+vBotanical.z*71.0)*sin(vBotanical.y*102.0);
   diffuseColor.rgb*=.82+.12*bands+.07*flecks;
`);
  if(kind==='leaf')s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float scales=sin(vBotanical.y*190.0+vBotanical.x*90.0)*sin(vBotanical.z*150.0-vBotanical.y*65.0);
   diffuseColor.rgb*=.9+.14*scales;`);
 };
 material.customProgramCacheKey=()=>`bunya-${kind}`;
 return material;
}
const bark=animateMaterial(new THREE.MeshStandardMaterial({color:'#82786a',roughness:.98}),'bark');
const leafMaterial=animateMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.6,side:THREE.DoubleSide}),'leaf');
const depth=animateMaterial(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),'depth');
const leaves=[];
function tube(curve,radius,segments=24,tipRatio=.04){
 const frames=curve.computeFrenetFrames(segments,false),positions=[],normals=[],indices=[],sides=9;
 for(let i=0;i<=segments;i++){
  const t=i/segments,p=curve.getPoint(t),r=radius*(Math.pow(1-t,.85)*(1-tipRatio)+tipRatio);
  for(let j=0;j<=sides;j++){
   const a=j/sides*Math.PI*2,n=frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i],Math.sin(a));
   const ridge=1+.14*Math.sin(a*5+t*17)+.07*Math.cos(a*3-t*23);
   positions.push(p.x+n.x*r*ridge,p.y+n.y*r*ridge,p.z+n.z*r*ridge);normals.push(n.x,n.y,n.z);
   if(i<segments&&j<sides){const k=i*(sides+1)+j;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
  }
 }
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setIndex(indices);
 const mesh=new THREE.Mesh(geo,bark);mesh.castShadow=true;mesh.receiveShadow=true;mesh.customDepthMaterial=depth;tree.add(mesh);
}
function curve(points){return new THREE.CatmullRomCurve3(points.map(p=>Array.isArray(p)?V(...p):p));}
// Photo-guided proportions: tall central shaft, irregular radial tiers,
// exposed branch interiors, pendant leafy branchlets, and a compact rounded head.
const trunk=curve([[0,-.14,0],[.05,3,.02],[-.12,7,.03],[.06,11,-.08],[.13,15,0],[.05,18.35,.02]]);
tube(trunk,.48,120,.11);
for(let i=0;i<7;i++){
 const a=i*Math.PI*2/7;
 tube(curve([[0,.4,0],[Math.cos(a)*.36,.13,Math.sin(a)*.36],[Math.cos(a)*.83,-.04,Math.sin(a)*.83]]),.18,12,.04);
}
function leaf(p,d,l,shade){leaves.push({p,d:d.clone().normalize(),l,w:l*range(.19,.26),shade});}
function leafyShoot(c,length){
 tube(c,.012,7,.1);
 const n=Math.ceil(length*29);
 for(let k=0;k<n;k++){
  const t=k/n,p=c.getPoint(t),axis=c.getTangent(t);
  const u=V(0,0,1).cross(axis).normalize();if(u.lengthSq()<.1)u.set(1,0,0);
  const v=axis.clone().cross(u);
  for(let side=0;side<2;side++){
   const angle=(side?Math.PI:0)+Math.sin(k*.8)*.35;
   const radial=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
   const direction=radial.multiplyScalar(.86).addScaledVector(axis,.52).normalize();
   leaf(p.clone(),direction,range(.15,.24)*(1-t*.35),rand());
  }
 }
}
function hangingSpray(origin,radial,length,spread=1){
 // Each rosette sends several gently curved leafy straps down under its own weight.
 const tangent=V(-radial.z,0,radial.x);
 const count=5+Math.floor(rand()*4);
 for(let k=0;k<count;k++){
  const a=k/count*Math.PI*2;
  const lateral=radial.clone().multiplyScalar(Math.cos(a)).addScaledVector(tangent,Math.sin(a));
  const l=length*range(.65,1.12),offset=range(.18,.48)*spread;
  const c=curve([origin,
   origin.clone().addScaledVector(lateral,offset*.7).add(V(0,.13,0)),
   origin.clone().addScaledVector(lateral,offset).add(V(0,-l*.48,0)),
   origin.clone().addScaledVector(lateral,offset*.65).add(V(0,-l,0))]);
  leafyShoot(c,l+offset);
 }
 // A few fresh upward-pointing shoots break the regular outline of the rosette.
 for(let k=0;k<3;k++){
  const tip=origin.clone().addScaledVector(radial,range(-.25,.25)).addScaledVector(tangent,range(-.25,.25)).add(V(0,range(.25,.48),0));
  leafyShoot(curve([origin,origin.clone().lerp(tip,.6),tip]),.45);
 }
}
for(let tier=0;tier<16;tier++){
 const y=3.4+tier*.94;
 const radius=(tier<3?2.45+tier*.35:tier<9?3.55-(tier-3)*.08:3.05-(tier-9)*.36);
 const count=tier>11?5:6;
 for(let j=0;j<count;j++){
  const angle=j/count*Math.PI*2+tier*.74+range(-.14,.14);
  const radial=V(Math.cos(angle),0,Math.sin(angle));
  const r=radius*range(.82,1.12),base=trunk.getPointAt(y/18.5);
  const end=base.clone().addScaledVector(radial,r).add(V(0,range(-.4,.05),0));
  const limb=curve([base,base.clone().addScaledVector(radial,r*.35).add(V(0,.25,0)),base.clone().addScaledVector(radial,r*.72).add(V(0,.13,0)),end]);
  tube(limb,.11*(1-tier/23),22,.10);
  hangingSpray(end,radial,range(.8,1.65)*(tier>11?.65:1));
  for(let k=0;k<(tier%3===1?1:2);k++){
   const t=.55+k*.22,root=limb.getPoint(t),side=(k%2?1:-1);
   const out=radial.clone().multiplyScalar(.35).add(V(-radial.z*.7*side,0,radial.x*.7*side));
   const tip=root.clone().addScaledVector(out,range(.35,.75)).add(V(0,-.08,0));
   tube(curve([root,root.clone().lerp(tip,.6).add(V(0,.07,0)),tip]),.03,8,.1);
   hangingSpray(tip,radial,range(.45,1.05),.7);
  }
 }
}
// Short ascending shoots form the rounded upper cap visible in the reference.
for(let i=0;i<12;i++){
 const angle=i*2.39996,r=range(.2,1),radial=V(Math.cos(angle),0,Math.sin(angle));
 const root=trunk.getPointAt(.93),tip=V(radial.x*r,18.1+Math.sqrt(1-r*r)*.4,radial.z*r);
 tube(curve([root,root.clone().lerp(tip,.5),tip]),.04,10,.08);
 hangingSpray(tip,radial,range(.35,.65),.65);
}
// All wood is already in tree coordinates; consolidate thousands of twigs into one draw.
{
 const parts=[...tree.children],positions=[],normals=[],indices=[];let offset=0;
 for(const mesh of parts){
  const g=mesh.geometry,p=g.attributes.position.array,n=g.attributes.normal.array;
  for(const x of p)positions.push(x);for(const x of n)normals.push(x);
  for(const x of g.index.array)indices.push(x+offset);offset+=p.length/3;
  tree.remove(mesh);g.dispose();
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);
 const wood=new THREE.Mesh(g,bark);wood.castShadow=true;wood.receiveShadow=true;wood.customDepthMaterial=depth;tree.add(wood);
}
// Instancing lets tens of thousands of tiny, volumetric scale sprays share one draw call.
// Folded lanceolate blades: a raised midrib and pointed tip, rather than needles.
const leafGeo=new THREE.BufferGeometry();
leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([
 0,0,0, -.72,.28,0, 0,.34,.14, .72,.28,0,
 -.65,.62,.015, 0,.65,.12, .65,.62,.015, 0,1,-.03
],3));
leafGeo.setIndex([0,2,1,0,3,2,1,2,4,2,5,4,2,3,5,3,6,5,4,5,7,5,6,7]);
leafGeo.computeVertexNormals();
const foliage=new THREE.InstancedMesh(leafGeo,leafMaterial,leaves.length);
const color=new THREE.Color();
leaves.forEach((leaf,i)=>{
 dummy.position.copy(leaf.p);dummy.quaternion.setFromUnitVectors(up,leaf.d);dummy.rotateY(leaf.shade*Math.PI);dummy.scale.set(leaf.w,leaf.l,leaf.l);dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);
 color.setHSL(.26+leaf.shade*.025,.32+leaf.shade*.17,.105+leaf.shade*.12);foliage.setColorAt(i,color);
});
foliage.castShadow=true;foliage.receiveShadow=true;foliage.customDepthMaterial=depth;foliage.instanceMatrix.needsUpdate=true;foliage.computeBoundingSphere();tree.add(foliage);
// Shuffle the draw order so thinning removes foliage evenly throughout the crown.
for(let i=leaves.length-1;i>0;i--){
 const j=Math.floor(rand()*(i+1));
 for(let n=0;n<16;n++){const a=i*16+n,b=j*16+n,tmp=foliage.instanceMatrix.array[a];foliage.instanceMatrix.array[a]=foliage.instanceMatrix.array[b];foliage.instanceMatrix.array[b]=tmp;}
 for(let n=0;n<3;n++){const a=i*3+n,b=j*3+n,tmp=foliage.instanceColor.array[a];foliage.instanceColor.array[a]=foliage.instanceColor.array[b];foliage.instanceColor.array[b]=tmp;}
}
foliage.instanceColor.needsUpdate=true;
// A restrained ground vignette keeps the complete root-to-crown model legible.
const soil=new THREE.Mesh(new THREE.CircleGeometry(1.8,64),new THREE.MeshStandardMaterial({color:'#a79b80',roughness:1}));
soil.rotation.x=-Math.PI/2;soil.position.y=-.018;soil.receiveShadow=true;scene.add(soil);
function active(id){for(const name of ['portrait','profile','wood'])$(name).classList.toggle('active',name===id);}
function density(value){foliage.count=Math.round(leaves.length*value);$('foliage').value=value;$('foliageValue').textContent=Math.round(value*100)+'%';}
let profileView=false;
function view(profile=false){
 profileView=profile;
 const mobile=innerWidth<700;
 // Fit both the complete crown and the ground plane, including in profile.
 const distance=Math.max(39,10.5/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect)*1.18);
 const target=V(mobile?0:-1.9,9,0);
 const direction=(profile?V(1,.10,.24):V(.12,.075,1)).normalize();
 controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,distance);controls.update();
}
$('portrait').onclick=()=>{view();density(1);active('portrait');};
$('profile').onclick=()=>{view(true);density(1);active('profile');};
$('wood').onclick=()=>{density(.03);active('wood');};
$('foliage').oninput=e=>{density(+e.target.value);active('');};
$('wind').oninput=e=>{wind.value=+e.target.value;$('windValue').textContent=Math.round(wind.value*100)+'%';};
$('rotate').onchange=e=>controls.autoRotate=e.target.checked;
$('reset').onclick=()=>{view();density(1);wind.value=reduced?0:.3;$('wind').value=wind.value;$('windValue').textContent=Math.round(wind.value*100)+'%';controls.autoRotate=false;$('rotate').checked=false;active('portrait');};
$('collapse').onclick=()=>{const hidden=!$('controls').hidden;$('controls').hidden=hidden;$('collapse').textContent=hidden?'+':'−';$('collapse').setAttribute('aria-expanded',String(!hidden));};
$('save').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='walnut-avenue-bunya.png';a.href=renderer.domElement.toDataURL('image/png');a.click();};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
window.addEventListener('resize',()=>{resize();view(profileView);});resize();view();
if(reduced){$('wind').value=0;$('windValue').textContent='0%';}
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{time.value+=Math.min(clock.getDelta(),.05);controls.update();renderer.render(scene,camera);});
$('status').hidden=true;
if(innerWidth<700){$('controls').hidden=true;$('collapse').textContent='+';$('collapse').setAttribute('aria-expanded','false');}
window.bunya={scene,camera,renderer,controls,foliage,leafCount:leaves.length};
