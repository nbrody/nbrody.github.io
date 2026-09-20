import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vertexShader, fragmentShader } from './shaders.js';

const $ = id => document.getElementById(id);
const viewport = $('viewport');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
$('breeze').checked = !reducedMotion;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas:$('flower'), antialias:true, preserveDrawingBuffer:true});
} catch (error) {
  $('status').textContent = 'This specimen needs WebGL. Please open it in a browser with hardware acceleration enabled.';
  $('status').className = 'error';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#172c25');
const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
camera.position.set(0,-3.2,11.8);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3.1;
controls.maxDistance = 19;
controls.autoRotateSpeed = .35;
controls.target.set(0,0,.15);
const flower = new THREE.Group();
scene.add(flower);
const materials = [];
function material(color,kind){
 const m = new THREE.ShaderMaterial({vertexShader,fragmentShader,side:THREE.DoubleSide,
 uniforms:{uColor:{value:new THREE.Color(color)},uKind:{value:kind},uTime:{value:0},uBreeze:{value:reducedMotion?0:1}}});
 materials.push(m); return m;
}
const petalMat=material('#e0e5b3',0), filamentMat=material('#a294ed',1);
const greenMat=material('#afbc51',2), pollenMat=material('#c3cb61',2);
const purpleMat=material('#793652',2), cupMat=material('#a8ac57',3);
const stemMat=material('#506739',2);
function mesh(geometry,mat,parent=flower){const m=new THREE.Mesh(geometry,mat);parent.add(m);return m;}
function ellipsoid(position,scale,mat){const m=mesh(new THREE.SphereGeometry(1,32,20),mat);m.position.copy(position);m.scale.set(...scale);return m;}
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const polar=(r,a,z)=>V(r*Math.cos(a),r*Math.sin(a),z);
function tube(points,radius,mat,segments=32){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,8,false),mat);}
// A seeded, deterministic variation makes the radial repetition organic.
const rand = n => {const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const petals=new THREE.Group();flower.add(petals);
function petalGeometry(index,opening){
 const positions=[],uvs=[],indices=[];
 const angle=index*Math.PI/5+.12;
 const length=2.5+(index%2)*.17+rand(index)*.12;
 for(let j=0;j<=36;j++){
  const t=j/36;
  const width=Math.pow(Math.sin(Math.PI*t),.72)*(.48+(index%2)*.035);
  for(let k=0;k<=16;k++){
   const s=k/16*2-1;
   const r=.25+length*t*(.48+.52*opening);
   const x=width*s;
   const z=-.13-.32*Math.sin(t*Math.PI)+.16*t*t+.16*s*s*Math.sin(t*Math.PI)+(1-opening)*2.5*t*t;
   positions.push(Math.cos(angle)*r-Math.sin(angle)*x,Math.sin(angle)*r+Math.cos(angle)*x,z);
   uvs.push(k/16,t);
   if(j<36&&k<16){const a=j*17+k;indices.push(a,a+1,a+17,a+1,a+18,a+17);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function clear(group){for(const m of [...group.children]){m.geometry.dispose();group.remove(m);}}
function buildPetals(){clear(petals);for(let i=0;i<10;i++)mesh(petalGeometry(i,+$('bloom').value),petalMat,petals);}
const corona=new THREE.Group();flower.add(corona);
// Merge the tubes into one draw call while preserving their longitudinal UVs.
function merge(geometries){
 const positions=[],normals=[],uvs=[];
 for(const indexed of geometries){const g=indexed.toNonIndexed();positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);uvs.push(...g.attributes.uv.array);g.dispose();indexed.dispose();}
 const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return result;
}
function buildCorona(){
 clear(corona);const geometries=[];const length=+$('length').value,curl=+$('curl').value;
 for(let ring=0;ring<3;ring++){
  const count=ring===0?100:ring===1?85:70;
  for(let i=0;i<count;i++){
   const seed=i+ring*123;
   const a=i/count*Math.PI*2+ring*.031;
   const reach=(ring===0?1.68:ring===1?1.34:.54)*length*(.93+.14*rand(seed));
   const points=[];
   for(let j=0;j<=12;j++){
    const t=j/12;
    const r=.68+reach*t;
    const theta=a+Math.sin(t*6+seed)*.012*t+curl*.11*t*t*Math.sin(seed*4.);
    const z=.01+ring*.018+.12*Math.sin(t*Math.PI)+(.08+curl*.45)*t*t+.025*Math.sin(t*17+seed)*t;
    points.push(polar(r,theta,z));
   }
   const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,ring===2?.012:.018,5,false);
   geometries.push(g);
  }
 }
 mesh(merge(geometries),filamentMat,corona);
}
buildPetals();buildCorona();
// Receptacle, annular center, stalk, five stamens and three styles.
mesh(new THREE.TorusGeometry(.60,.145,24,96),cupMat).position.z=.045;
ellipsoid(V(0,0,-.10),[.69,.69,.13],greenMat);
tube([V(0,0,-.13),V(.08,.04,-.65),V(.15,.22,-1.5),V(.3,.5,-2.0)],.085,stemMat);
tube([V(0,0,0),V(-.015,0,.42),V(0,0,.88)],.095,greenMat);
ellipsoid(V(0,0,.91),[.21,.21,.27],greenMat);
for(let i=0;i<5;i++){
 const a=i*Math.PI*2/5+.25;
 tube([polar(.08,a,.68),polar(.35,a,.83),polar(.70,a,.77)],.048,greenMat);
 const anther=ellipsoid(polar(.73,a,.77),[.27,.095,.085],pollenMat);anther.rotation.z=a+Math.PI/2;
}
for(let i=0;i<3;i++){
 const a=i*Math.PI*2/3+.48;
 tube([V(0,0,1.05),polar(.26,a,1.17),polar(.62,a,1.30)],.047,purpleMat);
 tube([polar(.56,a,1.28),polar(.70,a,1.32)],.059,greenMat,10);
 const stigma=ellipsoid(polar(.73,a,1.32),[.13,.10,.085],pollenMat);stigma.rotation.z=a;
}
// A tiny inner fringe breaks the smooth annulus into botanical detail.
for(let i=0;i<60;i++){
 const a=i*Math.PI/30;
 tube([polar(.46,a,.09),polar(.49,a,.20),polar(.54,a,.24)],.012,purpleMat,6);
}
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(18))/Math.min(1,camera.aspect)));camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport);resize();
let rebuildPending=false;
for(const id of ['bloom','length','curl']) $(id).addEventListener('input',()=>{
 $(id+'Value').textContent=Math.round(+$(id).value*100)+'%';
 if(!rebuildPending){rebuildPending=true;requestAnimationFrame(()=>{buildPetals();buildCorona();rebuildPending=false;});}
});
function view(name){
 const positions={front:[0,-3.2,11.8],side:[0,-10,3.1],detail:[0,-1.2,4.4]};
 camera.position.set(...positions[name]);controls.target.set(0,0,name==='detail'?.60:.15);controls.update();
 for(const id of Object.keys(positions))$(id).classList.toggle('active',id===name);
}
for(const id of ['front','side','detail'])$(id).onclick=()=>view(id);
controls.addEventListener('start',()=>document.querySelectorAll('.views button').forEach(b=>b.classList.remove('active')));
$('rotate').onchange=()=>controls.autoRotate=$('rotate').checked;
$('breeze').onchange=()=>materials.forEach(m=>m.uniforms.uBreeze.value=$('breeze').checked?1:0);
$('reset').onclick=()=>{
 for(const [id,value] of Object.entries({bloom:1,length:1,curl:.35})){$(id).value=value;$(id+'Value').textContent=Math.round(value*100)+'%';}
 buildPetals();buildCorona();$('rotate').checked=false;controls.autoRotate=false;$('breeze').checked=!reducedMotion;$('breeze').onchange();view('front');
};
$('save').onclick=()=>{renderer.render(scene,camera);const link=document.createElement('a');link.download='passiflora.png';link.href=renderer.domElement.toDataURL('image/png');link.click();};
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{const t=clock.getElapsedTime();materials.forEach(m=>m.uniforms.uTime.value=t);controls.update();renderer.render(scene,camera);});
$('status').hidden=true;
// Useful for inspecting draw-call count and geometry from the browser console.
window.passiflora={scene,camera,renderer,controls};
