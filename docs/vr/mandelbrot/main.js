/** VR Mandelbrot and Julia viewer with the GOLG fixed-point perturbation method. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInput } from '../questGOLG/poincare/js/xrInput.js';
import { createInteraction } from '../questGOLG/poincare/js/interact.js';
import { createPanel } from '../questGOLG/poincare/js/ui/panel.js?v=2026-11-12a';
import { encodeUV, decodeUV } from './math.js';
import { parseFx, fd, formatFx, pointAtUV } from './fixed.js';
import { createDeepZoom } from './deepzoom.js';
import { LANDMARKS, PALETTES } from './landmarks.js';

const canvas = document.querySelector('#scene'), status = document.querySelector('#status');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(.5);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.01,100);
camera.position.set(0,1.4,1.6);
const controls = new OrbitControls(camera,canvas); controls.target.set(0,1.35,0); controls.enableDamping=true; controls.minDistance=.45; controls.maxDistance=5; controls.update();
const env = new THREE.Group(); scene.add(env);
const sky = new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.MeshBasicMaterial({color:0xe9eef5,side:THREE.BackSide}));
const floor = new THREE.Mesh(new THREE.CircleGeometry(30,64).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xf5f6f8})); env.add(sky,floor);
const workbench = new THREE.Group(); workbench.position.set(0,1.35,0); scene.add(workbench);
const input = createInput({renderer,scene,camera,dom:canvas});
const initialCentre=[parseFx('-.5'),0n], initialSpan=3.4;
const state={centre:[...initialCentre],span:initialSpan,c:[parseFx('-.8'),parseFx('.156')],iterations:160,landmark:0,palette:0,renderStatus:'Starting…'};
const vertexShader=`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// The Julia view is computed in ordinary floating point. The parameter view below uses perturbation.
const fragmentShader=`precision highp float;
varying vec2 vUv;
uniform vec2 uCentre,uC; uniform float uSpan; uniform int uJulia,uIterations;
void main(){
  vec2 p=uCentre+(vUv-vec2(.5))*uSpan;
  vec2 c=uJulia==1?uC:p; vec2 z=uJulia==1?p:vec2(0.);
  float escaped=0.; float smoothN=0.;
  for(int i=0;i<256;i++){
    if(i>=uIterations)break;
    z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;
    float r2=dot(z,z);
    if(r2>256.){escaped=1.; float lz=.5*log(r2); smoothN=max(float(i+1)+1.-log2(lz),0.);break;}
  }
  vec3 color=vec3(.025,.035,.075);
  if(escaped>.5){float t=smoothN*.045;color=.52+.46*cos(6.28318*(t+vec3(.0,.22,.52)));color=pow(color,vec3(.8));}
  if(uJulia==0){vec2 mark=(uC-uCentre)/uSpan+vec2(.5);float d=length(vUv-mark);if(d>.008&&d<.013)color=vec3(1.);}
  gl_FragColor=vec4(color,1.);
}`;
function fractal(julia){
  const uniforms={uCentre:{value:new THREE.Vector2(0,0)},uC:{value:new THREE.Vector2(...state.c.map(fd))},uSpan:{value:3.4},uJulia:{value:julia?1:0},uIterations:{value:state.iterations}};
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.53,.53),new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:THREE.DoubleSide}));
  return {mesh,uniforms};
}
let deep,deepTexture;
try {
  deep=createDeepZoom({onUpdate:()=>{if(deepTexture)deepTexture.needsUpdate=true;},onStatus:text=>{state.renderStatus=text;status.textContent=text;menu.invalidate();}});
  deepTexture=new THREE.CanvasTexture(deep.canvas);deepTexture.colorSpace=THREE.SRGBColorSpace;
} catch(error) { state.renderStatus=`Deep zoom unavailable: ${error.message}`; console.error(error); }
const mandel={mesh:new THREE.Mesh(new THREE.PlaneGeometry(.53,.53),new THREE.MeshBasicMaterial({map:deepTexture||null,color:deepTexture?0xffffff:0x180818,side:THREE.DoubleSide}))};
const julia=fractal(true);
const marker=new THREE.Mesh(new THREE.RingGeometry(.0035,.0055,24),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,depthTest:false}));
marker.position.z=.002;mandel.mesh.add(marker);
mandel.mesh.position.set(-.20,.01,0);julia.mesh.position.set(.37,.01,0);
workbench.add(mandel.mesh,julia.mesh);
function label(text,x){
  const c=document.createElement('canvas');c.width=900;c.height=96;const g=c.getContext('2d');
  g.fillStyle='rgba(10,14,26,.96)';g.beginPath();g.roundRect(0,0,c.width,c.height,22);g.fill();
  g.font='600 48px Inter, sans-serif';g.fillStyle='#eef1f8';g.fillText(text,22,64);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(.53,.057),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
  m.position.set(x,.315,.005);workbench.add(m);
}
label('Mandelbrot · parameter c',-.20);label('Julia · dynamical plane',.37);
function digits(){return Math.min(34,Math.max(5,Math.ceil(-Math.log10(state.span))+3));}
let lastView='';
function sync(){
  julia.uniforms.uC.value.set(...state.c.map(fd));julia.uniforms.uIterations.value=state.iterations;
  const key=`${state.centre[0]},${state.centre[1]},${state.span}`;
  if(deep&&key!==lastView){lastView=key;deep.setView(state.centre,state.span);}
  const dx=fd(state.c[0]-state.centre[0])/state.span,dy=fd(state.c[1]-state.centre[1])/state.span;
  marker.visible=Math.abs(dx)<=.5&&Math.abs(dy)<=.5;marker.position.set(dx*.53,dy*.53,.002);
  status.textContent=`c = ${formatFx(state.c[0],digits())} ${state.c[1]<0n?'−':'+'} ${formatFx(state.c[1]<0n?-state.c[1]:state.c[1],digits())}i · ${state.renderStatus}`;
  menu.invalidate();
}
function goLandmark(i){
  state.landmark=(i+LANDMARKS.length)%LANDMARKS.length;
  const l=LANDMARKS[state.landmark];state.centre=[parseFx(l.re),parseFx(l.im)];state.span=l.box[0];
  state.c=l.pin?l.pin.map(parseFx):[...state.centre];sync();
}
const menu=createPanel({name:'fractal-controls',widthM:.39,heightM:.57,build(ui){
  ui.subheading('Mandelbrot & Julia');
  ui.richLine(['Iterate ',{tex:'z_{n+1}=z_n^2+c'},'.'],{muted:true,size:23*ui.s});
  ui.text('Choose c on the Mandelbrot image; zoom centers on the selection.',{size:21*ui.s});
  ui.text(`Re c: ${formatFx(state.c[0],digits())}`,{mono:true,size:19*ui.s});
  ui.text(`Im c: ${formatFx(state.c[1],digits())}`,{mono:true,size:19*ui.s});
  ui.row(r=>{r.button('in','Zoom in');r.button('out','Zoom out');});
  ui.text(`View width: ${state.span.toExponential(2)} · ${state.renderStatus}`,{muted:true,size:21*ui.s});
  ui.row(r=>{r.button('reset','Reset view');r.button('home','Recenter');});
  ui.button('iterations',`Julia iterations: ${state.iterations}`);
  ui.button('palette',`Mandelbrot palette: ${PALETTES[state.palette].name}`);
  ui.label('GOLG landmarks');
  ui.text(LANDMARKS[state.landmark].name.replace(/\$/g,''),{size:21*ui.s});
  ui.row(r=>{r.button('previous','Previous');r.button('next','Next');});
  ui.button('deep','Deep spiral (10⁻²⁴)');
  ui.text('Mandelbrot: fixed-point perturbation. Julia: floating point. Polynomial mode remains on desktop.',{muted:true,size:19*ui.s});
}});
menu.mesh.position.set(-.72,0,.03);menu.mesh.rotation.y=.25;workbench.add(menu.mesh);
menu.onAction(id=>{
  if(id==='home'){recenter();return;}
  if(id==='previous'){goLandmark(state.landmark-1);return;}if(id==='next'){goLandmark(state.landmark+1);return;}
  if(id==='deep'){goLandmark(LANDMARKS.length-1);return;}
  if(id==='in'){state.centre=[...state.c];state.span=Math.max(1e-30,state.span/2);}
  if(id==='out')state.span=Math.min(12,state.span*2);
  if(id==='reset'){state.centre=[...initialCentre];state.span=initialSpan;}
  if(id==='palette'){state.palette=(state.palette+1)%PALETTES.length;deep?.setPalette(state.palette);}
  if(id==='iterations')state.iterations=state.iterations===80?160:state.iterations===160?256:80;
  sync();
});
function select(tag){const [u,v]=decodeUV(tag);state.c=pointAtUV(u,v,state.centre,state.span);sync();}
const display={pick(ray){if(!deep?.ready)return {tag:-1,distance:Infinity};const h=ray.intersectObject(mandel.mesh,false)[0];return h?.uv?{tag:encodeUV(h.uv.x,h.uv.y),distance:h.distance}:{tag:-1,distance:Infinity};}};
const interaction=createInteraction({input,display,ballRoot:workbench,camera,controls,panels:()=>[menu],inside:()=>false,callbacks:{onHover:()=>{},onTap:select,onTapEmpty:()=>{},onDoubleTap:select,onFly:()=>{},onBallMoved:()=>{},onGrab:()=>{}}});
canvas.addEventListener('pointerdown',e=>{if(renderer.xr.isPresenting||e.button!==0)return;const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);if(ray.intersectObject(menu.mesh,false).length||display.pick(ray).tag>=0)controls.enabled=false;},true);
window.addEventListener('pointerup',()=>{if(!interaction.grabbing)controls.enabled=true;});
function recenter(){const c=renderer.xr.isPresenting?renderer.xr.getCamera():camera,p=c.getWorldPosition(new THREE.Vector3()),dir=new THREE.Vector3(0,0,-1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));dir.y=0;if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize();if(renderer.xr.isPresenting){workbench.position.copy(p).addScaledVector(dir,.9);workbench.position.y=Math.max(.8,p.y-.15);}else{workbench.position.set(0,1.35,0);dir.set(0,0,-1);}workbench.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);workbench.scale.setScalar(1);interaction.cancelMotion();}
const vr=document.querySelector('#vr'), ar=document.querySelector('#ar');let place=false;
async function enter(mode){if(renderer.xr.isPresenting){renderer.xr.getSession().end();return;}try{
  const session=await navigator.xr.requestSession(mode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','bounded-floor']});
  session.addEventListener('end',()=>{env.visible=true;renderer.setClearAlpha(1);input.setHandsVisible(true);vr.textContent='Enter VR';recenter();});
  await renderer.xr.setSession(session);const passthrough=mode==='immersive-ar';env.visible=!passthrough;renderer.setClearAlpha(passthrough?0:1);input.setHandsVisible(!passthrough);place=true;vr.textContent='Exit VR';
}catch(e){console.error(e);alert('Could not start VR: '+e.message);}}
if(navigator.xr){navigator.xr.isSessionSupported('immersive-vr').then(ok=>{vr.disabled=!ok;});navigator.xr.isSessionSupported('immersive-ar').then(ok=>{ar.hidden=!ok;});}
vr.addEventListener('click',()=>enter('immersive-vr'));ar.addEventListener('click',()=>enter('immersive-ar'));
document.querySelector('#home').addEventListener('click',recenter);
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&!e.repeat)recenter();});
function desktopView(){const a=innerWidth/Math.max(1,innerHeight),t=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));camera.position.set(0,1.38,Math.max(.4/t,1/(t*a))+.2);controls.target.set(0,1.35,0);controls.update();}
window.addEventListener('resize',()=>{if(renderer.xr.isPresenting)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);desktopView();});
let last=0;function frame(now){const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(place){place=false;recenter();}deep?.update(now);input.update();if(renderer.xr.isPresenting&&input.all().some(p=>p.kind==='controller'&&p.buttonAStart))recenter();interaction.update(now,dt);menu.update();if(!renderer.xr.isPresenting)controls.update();renderer.render(scene,camera);}renderer.setAnimationLoop(frame);
window.addEventListener('pagehide',event=>{if(!event.persisted)deep?.dispose();});
desktopView();sync();
