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
scene.fog=new THREE.Fog('#e8e8df',28,65);
const camera=new THREE.PerspectiveCamera(35,1,.1,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=42;
controls.maxPolarAngle=Math.PI*.49;controls.autoRotateSpeed=.45;
scene.add(new THREE.HemisphereLight('#f6f5dd','#6b7055',2));
const sun=new THREE.DirectionalLight('#fff1cd',3.3);sun.position.set(-6,13,8);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-9,right:9,top:13,bottom:-7,near:.5,far:35});sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(sun);
const fill=new THREE.DirectionalLight('#c8dbdc',.65);fill.position.set(6,7,-7);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:'#e8e6da',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.035;ground.receiveShadow=true;scene.add(ground);
const tree=new THREE.Group();scene.add(tree);
let seed=32771;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
const range=(a,b)=>a+(b-a)*rand(), V=(x,y,z)=>new THREE.Vector3(x,y,z);
const up=V(0,1,0), dummy=new THREE.Object3D();

// Shared object-space bending keeps the wood, sprays, and their shadows together.
const bend=`
vec3 breeze(vec3 p){
 float h=max(p.y,0.0);float w=h*h*.0019*uWind;
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
   float grain=sin(vBotanical.y*3.0+sin(vBotanical.y*1.4+vBotanical.z*9.0)*2.0+vBotanical.x*75.0+vBotanical.z*48.0);
   float fine=sin(vBotanical.x*210.0+vBotanical.y*8.0+vBotanical.z*160.0);
   diffuseColor.rgb*=.70+.24*grain+.12*fine;
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.29,.16),.13*(sin(vBotanical.y*6.0)+1.0));`);
  if(kind==='leaf')s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float scales=sin(vBotanical.y*190.0+vBotanical.x*90.0)*sin(vBotanical.z*150.0-vBotanical.y*65.0);
   diffuseColor.rgb*=.9+.14*scales;`);
 };
 material.customProgramCacheKey=()=>`juniper-${kind}`;
 return material;
}
const bark=animateMaterial(new THREE.MeshStandardMaterial({color:'#716550',roughness:.98}),'bark');
const leafMaterial=animateMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.91}),'leaf');
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
// A hand-shaped scaffold, including the separated left crown and dominant right leader.
const scaffolds=[
 [[-.18,0,0],[-.55,.8,.1],[-.45,1.6,.1],[.12,2.9,0],[.45,4.4,0],[1.25,6.2,-.1],[2.15,8.1,-.15],[3.05,10.6,-.1]],
 [[-.32,0,.12],[-1,.9,.05],[-1.3,2.5,.05],[-1.5,4.2,.1],[-1.8,5.8,.05],[-1.65,7.1,.1],[-2.05,7.9,.1]],
 [[.02,.05,.1],[.45,.8,.3],[.6,2.1,.2],[1.15,3.7,.4],[1.7,5.1,.25],[2.8,6.3,.2]],
 [[-.3,1.05,0],[-.6,2.4,-.55],[-.35,4.2,-.8],[.1,5.8,-.7],[.7,7.65,-.65]],
 [[-.52,1.3,.1],[-1.6,1.7,.6],[-2.05,2.8,.7],[-2.35,4.2,.7],[-2.9,5.5,.7]],
 [[.35,1.7,.2],[.9,2.4,-.6],[1.7,3.5,-.9],[2.35,5.3,-.9]],
 [[-.9,2.4,.05],[-1.8,3.2,-.4],[-2.5,4.35,-.5],[-3,5.25,-.5]],
 [[.1,2.9,0],[.65,4.4,.7],[1.2,5.8,.8],[1.5,7.3,.7]]
];
// The uncropped references reveal a shared basal trunk below the open forks.
// Lift the old crown to preserve its silhouette while restoring the missing bole.
for(const points of scaffolds)for(const p of points)p[1]+=1.15;
scaffolds[0][0]=[-.18,.75,.02];
scaffolds[0][1]=[.02,1.95,.10];
scaffolds[1][0]=[-.24,.78,.06];
scaffolds[2][0]=[-.08,.72,.10];
tube(curve([[-.10,-.14,0],[-.13,.25,.01],[-.19,.65,.04],[-.18,1.05,.06]]),.39,20,.66);
// Short root flares disappear into the planting bed rather than ending in midair.
for(let i=0;i<6;i++){
 const angle=i*Math.PI/3+.25;
 tube(curve([[-.14,.22,.02],[-.14+Math.cos(angle)*.31,.08,Math.sin(angle)*.24],
  [-.14+Math.cos(angle)*.64,-.035,Math.sin(angle)*.48]]),.13,10,.08);
}
function tuft(p,direction,size){
 // Opposite scale-leaf sprays wrap a short shoot, leaving a finely serrated outline.
 const axis=direction.clone().normalize(),u=V(0,0,1).cross(axis).normalize();if(u.lengthSq()<.1)u.set(1,0,0);
 const v=axis.clone().cross(u);
 for(let j=0;j<11;j++){
  const t=j/11,a=j*2.39996+range(-.35,.35),side=u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v,Math.sin(a));
  const pos=p.clone().addScaledVector(axis,t*size*.9).addScaledVector(side,(1-t)*size*.19);
  const dir=axis.clone().multiplyScalar(.8).addScaledVector(side,.65*(1-t)).normalize();
  leaves.push({p:pos,d:dir,w:size*range(.10,.17)*(1-t*.6),l:size*range(.32,.52),shade:rand()});
 }
}
function dress(c,length,width){
 const count=Math.ceil(length*38);
 for(let k=0;k<count;k++){
  const t=k/count,p=c.getPoint(t),d=c.getTangent(t),a=k*2.39996;
  const radial=V(Math.cos(a),range(-.2,.3),Math.sin(a));
  const taper=Math.pow(1-t,.6);
  const shoot=d.clone().multiplyScalar(.65).addScaledVector(radial,.65).addScaledVector(up,.35).normalize();
  const size=range(.16,.3)*width*(.4+.6*taper);
  tuft(p,shoot,size);
 }
}
for(let m=0;m<scaffolds.length;m++){
 const c=curve(scaffolds[m]),len=c.getLength();tube(c,m===0?.29:m===1?.21:.14,Math.ceil(len*7));
 const branches=Math.ceil(len*5);
 for(let j=0;j<branches;j++){
  const t=.19+j/branches*.80,p=c.getPoint(t),tangent=c.getTangent(t),a=j*2.39996+m*1.5;
  const reach=(.25+1.15*Math.pow(Math.sin(t*Math.PI),.8))*range(.65,1.1)*(m<2?1:.8);
  const dir=V(Math.cos(a)*.78,.65+rand()*.6,Math.sin(a)*.68).addScaledVector(tangent,.35).normalize();
  const end=p.clone().addScaledVector(dir,reach),mid=p.clone().addScaledVector(dir,reach*.5).add(V(-.1,-.12,.07));
  const b=curve([p,mid,end]);tube(b,.025*(1-t)+.009,8);dress(b,reach,1);
  for(let q=0;q<5;q++){
   const s=.22+q*.15,base=b.getPoint(s),angle=a+q*2.4;
   const side=V(Math.cos(angle)*.6,.7,Math.sin(angle)*.6).addScaledVector(dir,.5).normalize();
   const l=reach*range(.28,.55)*(1-s*.6),tip=base.clone().addScaledVector(side,l);
   const twig=curve([base,base.clone().lerp(tip,.5).add(V(0,-.05,0)),tip]);
   dress(twig,l,.8);
  }
 }
 const tip=curve([c.getPoint(.84),c.getPoint(.93),c.getPoint(1)]);dress(tip,len*.16,.8);
}
// Instancing lets tens of thousands of tiny, volumetric scale sprays share one draw call.
const leafGeo=new THREE.ConeGeometry(1,1,5,2);leafGeo.translate(0,.5,0);
const foliage=new THREE.InstancedMesh(leafGeo,leafMaterial,leaves.length);
const color=new THREE.Color();
leaves.forEach((leaf,i)=>{
 dummy.position.copy(leaf.p);dummy.quaternion.setFromUnitVectors(up,leaf.d);dummy.scale.set(leaf.w,leaf.l,leaf.w*.7);dummy.updateMatrix();foliage.setMatrixAt(i,dummy.matrix);
 color.setHSL(.205+leaf.shade*.035,.30+leaf.shade*.18,.16+leaf.shade*.13);foliage.setColorAt(i,color);
});
foliage.castShadow=true;foliage.receiveShadow=true;foliage.customDepthMaterial=depth;foliage.instanceMatrix.needsUpdate=true;foliage.computeBoundingSphere();tree.add(foliage);
// Shuffle the draw order so thinning removes foliage evenly throughout the crown.
for(let i=leaves.length-1;i>0;i--){
 const j=Math.floor(rand()*(i+1));
 for(let n=0;n<16;n++){const a=i*16+n,b=j*16+n,tmp=foliage.instanceMatrix.array[a];foliage.instanceMatrix.array[a]=foliage.instanceMatrix.array[b];foliage.instanceMatrix.array[b]=tmp;}
 for(let n=0;n<3;n++){const a=i*3+n,b=j*3+n,tmp=foliage.instanceColor.array[a];foliage.instanceColor.array[a]=foliage.instanceColor.array[b];foliage.instanceColor.array[b]=tmp;}
}
foliage.instanceColor.needsUpdate=true;
// A small street-tree planting cutout establishes the true ground contact.
const bed=new THREE.Group();scene.add(bed);
const soil=new THREE.Mesh(new THREE.BoxGeometry(3.5,.055,2.1),new THREE.MeshStandardMaterial({color:'#93836a',roughness:1}));
soil.position.set(-.1,-.008,0);soil.receiveShadow=true;bed.add(soil);
const edging=new THREE.MeshStandardMaterial({color:'#bbb9aa',roughness:1});
for(const [x,z,w,d] of [[-.1,-1.10,3.7,.12],[-.1,1.10,3.7,.12],[-1.90,0,.12,2.1],[1.70,0,.12,2.1]]){
 const rim=new THREE.Mesh(new THREE.BoxGeometry(w,.085,d),edging);rim.position.set(x,.006,z);rim.receiveShadow=true;rim.castShadow=true;bed.add(rim);
}
const grit=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#ac9778',roughness:1}),650);
for(let i=0;i<grit.count;i++){
 dummy.position.set(range(-1.82,1.62),.025,range(-1.01,1.01));dummy.rotation.set(rand()*3,rand()*6,rand()*3);
 dummy.scale.set(range(.012,.043),range(.009,.024),range(.012,.04));dummy.updateMatrix();grit.setMatrixAt(i,dummy.matrix);
}
grit.receiveShadow=true;bed.add(grit);

function active(id){for(const name of ['portrait','profile','wood'])$(name).classList.toggle('active',name===id);}
function density(value){foliage.count=Math.round(leaves.length*value);$('foliage').value=value;$('foliageValue').textContent=Math.round(value*100)+'%';}
let profileView=false;
function view(profile=false){
 profileView=profile;
 const mobile=innerWidth<700;
 // Fit both the complete crown and the ground plane, including in profile.
 const distance=Math.max(24.8,7.8/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect)*1.18);
 const target=V(mobile?0:-1.05,5.7,0);
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
$('save').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='hollywood-juniper.png';a.href=renderer.domElement.toDataURL('image/png');a.click();};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
window.addEventListener('resize',()=>{resize();view(profileView);});resize();view();
if(reduced){$('wind').value=0;$('windValue').textContent='0%';}
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{time.value+=Math.min(clock.getDelta(),.05);controls.update();renderer.render(scene,camera);});
$('status').hidden=true;
if(innerWidth<700){$('controls').hidden=true;$('collapse').textContent='+';$('collapse').setAttribute('aria-expanded','false');}
window.juniper={scene,camera,renderer,controls,foliage,leafCount:leaves.length};
