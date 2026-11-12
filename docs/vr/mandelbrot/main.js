/** Quadratic Mandelbrot/Julia viewer. The escape-time recurrence and smooth
 * coloring follow the desktop explorer; bounded single-precision zoom only. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInput } from '../questGOLG/poincare/js/xrInput.js';
import { createInteraction } from '../questGOLG/poincare/js/interact.js';
import { createPanel } from '../questGOLG/poincare/js/ui/panel.js?v=2026-11-12a';
import { pointFromUV, encodeUV, decodeUV } from './math.js';

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
const state={centre:[-.5,0],span:3.4,c:[-.8,.156],iterations:160};
const initialCentre=[-.5,0], initialSpan=3.4;
const vertexShader=`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// The desktop explorer iterates z²+c and uses a logarithmic escape count. This
// deliberately omits its perturbation deep zoom and polynomial mode.
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
  const uniforms={uCentre:{value:new THREE.Vector2(...(julia?[0,0]:state.centre))},uC:{value:new THREE.Vector2(...state.c)},uSpan:{value:julia?3.4:state.span},uJulia:{value:julia?1:0},uIterations:{value:state.iterations}};
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.53,.53),new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:THREE.DoubleSide}));
  return {mesh,uniforms};
}
const mandel=fractal(false), julia=fractal(true);
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
function sync(){
  mandel.uniforms.uCentre.value.set(...state.centre);mandel.uniforms.uSpan.value=state.span;
  for(const f of [mandel,julia]){f.uniforms.uC.value.set(...state.c);f.uniforms.uIterations.value=state.iterations;}
  status.textContent=`c = ${state.c[0].toFixed(5)} ${state.c[1]<0?'−':'+'} ${Math.abs(state.c[1]).toFixed(5)}i · ${state.iterations} iterations`;
  menu.invalidate();
}
const menu=createPanel({name:'fractal-controls',widthM:.38,heightM:.48,build(ui){
  ui.subheading('Mandelbrot & Julia');
  ui.richLine(['Iterate ',{tex:'z_{n+1}=z_n^2+c'},'.'],{muted:true,size:24*ui.s});
  ui.text('Select a point on the Mandelbrot image to update the Julia set.',{size:23*ui.s});
  ui.richLine([{tex:`c = ${state.c[0].toFixed(4)} ${state.c[1]<0?'-':'+'} ${Math.abs(state.c[1]).toFixed(4)}i`}],{size:25*ui.s});
  ui.row(r=>{r.button('in','Zoom in');r.button('out','Zoom out');});
  ui.text(`Mandelbrot width: ${state.span.toPrecision(3)}`,{muted:true,size:22*ui.s});
  ui.row(r=>{r.button('reset','Reset view');r.button('home','Recenter');});
  ui.button('iterations',`Iterations: ${state.iterations}`);
  ui.label('Parameters');
  ui.row(r=>{r.button('zero',{tex:'0'});r.button('rabbit',{tex:'-0.123+0.745i'});r.button('spiral',{tex:'-0.8+0.156i'});});
  ui.text('Quadratic, single precision. Use the desktop explorer for deep zoom and other polynomials.',{muted:true,size:20*ui.s});
}});
menu.mesh.position.set(-.72,0,.03);menu.mesh.rotation.y=.25;workbench.add(menu.mesh);
menu.onAction(id=>{
  if(id==='home'){recenter();return;}
  if(id==='in'){state.centre=[...state.c];state.span=Math.max(1e-4,state.span/2);}
  if(id==='out')state.span=Math.min(initialSpan,state.span*2);
  if(id==='reset'){state.centre=[...initialCentre];state.span=initialSpan;}
  if(id==='iterations')state.iterations=state.iterations===80?160:state.iterations===160?256:80;
  if(id==='zero')state.c=[0,0];if(id==='rabbit')state.c=[-.123,.745];if(id==='spiral')state.c=[-.8,.156];
  sync();
});
function select(tag){const [u,v]=decodeUV(tag);state.c=pointFromUV(u,v,state.centre,state.span);sync();}
const display={pick(ray){const h=ray.intersectObject(mandel.mesh,false)[0];return h?.uv?{tag:encodeUV(h.uv.x,h.uv.y),distance:h.distance}:{tag:-1,distance:Infinity};}};
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
let last=0;function frame(now){const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(place){place=false;recenter();}input.update();if(renderer.xr.isPresenting&&input.all().some(p=>p.kind==='controller'&&p.buttonAStart))recenter();interaction.update(now,dt);menu.update();if(!renderer.xr.isPresenting)controls.update();renderer.render(scene,camera);}renderer.setAnimationLoop(frame);
desktopView();sync();
