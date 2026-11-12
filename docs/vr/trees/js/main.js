/** VR tree of hyperbolic planes and 3-spaces, using the desktop 2dimFields engines. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInput } from '../../questGOLG/poincare/js/xrInput.js';
import { createInteraction } from '../../questGOLG/poincare/js/interact.js';
import { createPanel } from '../../questGOLG/poincare/js/ui/panel.js?v=2026-11-12a';
import { IDENTITY, mmul, adj, isScalar } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { localMap } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/treeAction.js';
import { buildTree, getFrame, labelText } from './tree.js';
import { ballEngine, buildBallTree, getBallFrame } from './ballTree.js';
import { prepareBallAnimation, ballAnimationFrame, decorateBallRecords } from './ballAnimation.js';
import { createPlaneAnimation, decoratePlaneRecords } from './planeAnimation.js';
import { createBallScene } from './ballRender.js';
import { createPlaneScene } from './planeRender.js';
import { fieldExamples, presetMatrix, matrixTex } from './presets.js';

const canvas=document.querySelector('#scene'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local-floor');renderer.xr.setFoveation(.5);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.01,100);camera.position.set(0,1.45,1.6);
const controls=new OrbitControls(camera,canvas);controls.target.set(0,1.25,0);controls.enableDamping=true;controls.minDistance=.3;controls.maxDistance=5;controls.update();
const env=new THREE.Group();scene.add(env);
const sky=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.MeshBasicMaterial({color:0xe9eef5,side:THREE.BackSide}));
const floor=new THREE.Mesh(new THREE.CircleGeometry(30,64).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xf5f6f8}));env.add(sky,floor);
scene.add(new THREE.HemisphereLight(0xffffff,0x8995aa,2));
const light=new THREE.DirectionalLight(0xffffff,1.3);light.position.set(1,3,2);scene.add(light);
const workbench=new THREE.Group();workbench.position.set(0,1.3,0);scene.add(workbench);
const modelRoot=new THREE.Group(),treeGroup=new THREE.Group(),markGroup=new THREE.Group();scene.add(modelRoot);modelRoot.add(treeGroup,markGroup);
const input=createInput({renderer,scene,camera,dom:canvas});
const settings={field:'i',base:'disk',lam:1,h:-.75,edges:'q',N:3,depth:2,budget:600};
const isBall=()=>settings.field!=='Q';
const identity=()=>isBall()?ballEngine(settings.field).IDENTITY:IDENTITY;
let current=identity(),recs=[],selected=[],showFarey=true,treeScene=null,animation=null,exampleIndex=0,truncated=false;
let lastAction='Choose a generator to animate the tree.';
const example=()=>fieldExamples(settings.field)[exampleIndex];
const selectedName=()=>isBall()?(selected.length?selected.map(ballEngine(settings.field).name).join(' → '):'v₀'):labelText(selected);
const markerMat=new THREE.LineBasicMaterial({color:0xe4701d});
function lineGeo(points){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return g;}
function clearMarkers(){while(markGroup.children.length){const o=markGroup.children[0];markGroup.remove(o);o.geometry?.dispose();}}
function marker(){
  clearMarkers();
  if(isBall()){
    const F=getBallFrame(selected,settings).F,sphere=new THREE.SphereGeometry(F.R*1.025,24,16);
    const outline=new THREE.LineSegments(new THREE.WireframeGeometry(sphere),markerMat);sphere.dispose();outline.position.set(...F.c);markGroup.add(outline);return;
  }
  const F=getFrame(selected,settings),points=[];
  for(let i=0;i<=64;i++){const a=2*Math.PI*i/64,x=Math.cos(a),y=Math.sin(a);points.push(F.cx+F.R*(x*F.uy+y*F.ux),F.z+.009,-(F.cy+F.R*(-x*F.ux+y*F.uy)));}
  markGroup.add(new THREE.Line(lineGeo(points),markerMat));
}
function refresh(){for(const p of panels)p.invalidate();}
function rebuild(){
  treeScene?.dispose();treeScene=null;
  const result=isBall()?buildBallTree(settings,settings.budget):buildTree(settings);truncated=result.truncated;
  recs=isBall()?decorateBallRecords(result.recs,settings,current):decoratePlaneRecords(result.recs,current);
  treeScene=isBall()?createBallScene({recs,field:settings.field,showCircles:showFarey}):createPlaneScene({recs,settings,showFarey,capacity:recs.length*2+4});
  treeGroup.add(treeScene.group);
  status.textContent=`${recs.length} ${isBall()?'balls':'planes'} · ${settings.field==='i'?'ℚ(i)':settings.field==='omega'?'ℚ(ω)':'ℚ'} · finite patch${result.truncated?' · display limit reached':''}`;
  markGroup.visible=true;marker();refresh();
}
function applyGenerator(matrix,label){
  if(animation)return;
  try {
    const action=isBall()?ballEngine(settings.field).tree.localMap(matrix,selected):localMap(matrix,selected);
    const plan=isBall()?prepareBallAnimation({recs,settings,matrix,current}):createPlaneAnimation({recs,settings,matrix,current});
    const nextCurrent=isBall()?ballEngine(settings.field).normalizePGL(mmul(matrix,current)):plan.current;
    animation={plan,nextCurrent,nextSelected:action.labels,label,start:null};
    markGroup.visible=false;lastAction=`Animating ${label} across the tree…`;refresh();
  } catch(error){console.error(error);lastAction=`Could not animate: ${error.message}`;refresh();}
}
function updateAnimation(now){
  if(!animation)return;
  if(animation.start===null)animation.start=now;
  const t=Math.min(1,Math.max(0,(now-animation.start)/1600));
  try {
    const frames=isBall()?ballAnimationFrame(animation.plan,t):animation.plan.at(t);
    treeScene.update(frames,{animating:true});
    if(t===1){const done=animation;animation=null;current=done.nextCurrent;selected=done.nextSelected;lastAction=`Applied ${done.label} to the tree.`;rebuild();}
  } catch(error){console.error(error);animation=null;lastAction=`Animation failed: ${error.message}`;rebuild();}
}
const left=createPanel({name:'tree-view',widthM:.44,heightM:.50,build(ui){
  ui.subheading('Tree of hyperbolic spaces');
  ui.segmented('field',[{value:'Q',tex:'\\mathbb{Q}'},{value:'i',tex:'\\mathbb{Q}(i)'},{value:'omega',tex:'\\mathbb{Q}(\\omega)'}],settings.field);
  ui.richLine(['Over ',{tex:settings.field==='Q'?'\\mathbb{Q}((1/t))':settings.field==='i'?'\\mathbb{Q}(i)((1/t))':'\\mathbb{Q}(\\omega)((1/t))'}],{muted:true,size:23*ui.s});
  ui.text(`Depth ${settings.depth} · cusp height ${settings.N}`,{size:23*ui.s});
  ui.row(r=>{r.button('depth','Change depth');r.button('height','Change height');});
  ui.button('edges',`Edges: ${settings.edges==='q'?'by cusp size':settings.edges==='levels'?'equal levels':'zero'}`);
  ui.toggle('farey',isBall()?'Boundary circles':'Farey geodesics',showFarey);
  if(isBall()){ui.label('Ball budget');ui.segmented('budget',[{value:600,label:'600'},{value:1200,label:'1200'}],settings.budget);}
  ui.text(`${recs.length} ${isBall()?'balls':'planes'} shown${truncated?' · limit reached':''}. The tree is infinite.`,{muted:true,size:21*ui.s});
  ui.row(r=>{r.button('base','Select base',{width:'42%'});r.button('home','Bring model back',{width:'54%'});});
}});
const right=createPanel({name:'tree-group',widthM:.45,heightM:.54,build(ui){
  ui.subheading('Group action');
  ui.text(`Selected: ${selectedName()}`,{muted:true,size:21*ui.s});
  ui.text(lastAction,{muted:true,size:21*ui.s});
  ui.label('Desktop example');ui.text(example().name,{size:22*ui.s});
  ui.row(r=>{r.button('previous','Previous');r.button('next','Next');r.button('reset','Reset');});
  ui.scrollArea('generators',null,u=>{
    example().gens.forEach((entries,i)=>{
      u.richLine([{tex:`g_{${i+1}} = ${matrixTex(entries)}`}],{size:24*u.s});
      u.row(r=>{r.button(`gen:${i}`,{tex:`g_{${i+1}}`},{width:'46%'});r.button(`inv:${i}`,{tex:`g_{${i+1}}^{-1}`},{width:'46%'});});
    });
  });
}});
left.mesh.position.set(-.48,0,.06);left.mesh.rotation.y=.5;right.mesh.position.set(.48,0,.06);right.mesh.rotation.y=-.5;workbench.add(left.mesh,right.mesh);
const panels=[left,right];for(const p of panels)p.material.depthTest=false;
function home(){workbench.updateMatrixWorld(true);workbench.getWorldPosition(modelRoot.position);workbench.getWorldQuaternion(modelRoot.quaternion);modelRoot.scale.setScalar(isBall()?.12:.19);}
function recenter(){const c=renderer.xr.isPresenting?renderer.xr.getCamera():camera,p=c.getWorldPosition(new THREE.Vector3()),d=new THREE.Vector3(0,0,-1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));d.y=0;if(d.lengthSq()<1e-6)d.set(0,0,-1);d.normalize();if(renderer.xr.isPresenting){workbench.position.copy(p).addScaledVector(d,.68);workbench.position.y=Math.max(.8,p.y-.22);}else{workbench.position.set(0,1.3,0);d.set(0,0,-1);}workbench.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),d);home();interaction.cancelMotion();}
for(const p of panels)p.onAction((id,value)=>{
  if(id==='home'){recenter();return;}
  if(animation){lastAction='Wait for the animation to finish.';refresh();return;}
  if(id==='base'){selected=[];lastAction='Selected the base vertex.';marker();refresh();return;}
  if(id==='field'){
    if(value===settings.field)return;
    settings.field=value;settings.depth=2;settings.N=3;exampleIndex=0;current=identity();selected=[];modelRoot.scale.setScalar(isBall()?.12:.19);lastAction='Choose a generator to animate the tree.';
  }else if(id==='budget')settings.budget=value;
  else if(id==='depth')settings.depth=settings.depth%4+1;
  else if(id==='height')settings.N=settings.N===4?2:settings.N+1;
  else if(id==='edges')settings.edges=settings.edges==='q'?'levels':settings.edges==='levels'?'zero':'q';
  else if(id==='farey')showFarey=value;
  else if(id==='previous'||id==='next'){
    const length=fieldExamples(settings.field).length;exampleIndex=(exampleIndex+(id==='next'?1:-1)+length)%length;
    current=identity();selected=[];lastAction='Choose a generator to animate the tree.';
  }else if(id==='reset'){
    if(!isScalar(current))applyGenerator(adj(current),'reset');return;
  }else if(id.startsWith('gen:')||id.startsWith('inv:')){
    const [kind,index]=id.split(':'),i=Number(index),entries=example().gens[i];
    if(entries)applyGenerator(presetMatrix(settings.field,entries,kind==='inv'),`g${i+1}${kind==='inv'?'⁻¹':''}`);return;
  }else return;
  rebuild();
});
const display={pick(ray){
  if(animation||!treeScene)return {tag:-1,distance:Infinity};
  const hits=ray.intersectObjects(treeScene.meshes,false);return hits.length?{tag:treeScene.vertexOfHit(hits[0]),distance:hits[0].distance}:{tag:-1,distance:Infinity};
}};
const interaction=createInteraction({input,display,ballRoot:modelRoot,camera,controls,panels:()=>panels,inside:()=>false,callbacks:{onHover:()=>{},onTap:i=>{if(!animation&&recs[i]){selected=recs[i].labels;lastAction='Choose a generator to animate the tree.';marker();refresh();}},onTapEmpty:()=>{},onDoubleTap:()=>{},onFly:()=>{},onBallMoved:()=>{},onGrab:()=>{}}});
canvas.addEventListener('pointerdown',e=>{if(renderer.xr.isPresenting||e.button!==0)return;const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);if(panels.some(p=>ray.intersectObject(p.mesh,false).length)||display.pick(ray).tag>=0)controls.enabled=false;},true);
canvas.addEventListener('wheel',e=>{if(renderer.xr.isPresenting)return;const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);for(const p of panels){const hit=ray.intersectObject(p.mesh,false)[0];if(hit&&p.scroll('mouse',p.uvFromIntersection(hit),e.deltaY)){e.preventDefault();e.stopImmediatePropagation();return;}}},{capture:true,passive:false});
window.addEventListener('pointerup',()=>{if(!interaction.grabbing)controls.enabled=true;});
const vr=document.querySelector('#vr'),ar=document.querySelector('#ar');let place=false;
async function enter(mode){if(renderer.xr.isPresenting){renderer.xr.getSession().end();return;}try{const session=await navigator.xr.requestSession(mode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','bounded-floor']});session.addEventListener('end',()=>{env.visible=true;renderer.setClearAlpha(1);input.setHandsVisible(true);vr.textContent='Enter VR';recenter();});await renderer.xr.setSession(session);const passthrough=mode==='immersive-ar';env.visible=!passthrough;renderer.setClearAlpha(passthrough?0:1);input.setHandsVisible(!passthrough);place=true;vr.textContent='Exit VR';}catch(e){console.error(e);alert('Could not start VR: '+e.message);}}
if(navigator.xr){navigator.xr.isSessionSupported('immersive-vr').then(ok=>{vr.disabled=!ok;});navigator.xr.isSessionSupported('immersive-ar').then(ok=>{ar.hidden=!ok;});}
vr.addEventListener('click',()=>enter('immersive-vr'));ar.addEventListener('click',()=>enter('immersive-ar'));
let last=0;function frame(now){const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(place){place=false;recenter();}input.update();interaction.update(now,dt);updateAnimation(now);panels.forEach(p=>p.update());if(!renderer.xr.isPresenting)controls.update();renderer.render(scene,camera);}renderer.setAnimationLoop(frame);
window.addEventListener('resize',()=>{if(renderer.xr.isPresenting)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
home();rebuild();
