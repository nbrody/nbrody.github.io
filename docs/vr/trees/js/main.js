/** Finite Q-tree explorer. Geometry and matrix action use the desktop tool's engines. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInput } from '../../questGOLG/poincare/js/xrInput.js';
import { createInteraction } from '../../questGOLG/poincare/js/interact.js';
import { createPanel } from '../../questGOLG/poincare/js/ui/panel.js';
import { B, baseDiskSet, diskSet, labelText, applyAction, getFrame, buildTree } from './tree.js';

const canvas=document.querySelector('#scene'), status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
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
const settings={base:'disk',lam:1,h:-.75,edges:'q',N:3,depth:2};
let recs=[],selected=[],showFarey=true,truncated=false,lastAction='Choose a plane, then apply a matrix.';
const fillGeo=new THREE.CircleGeometry(1,48).rotateX(-Math.PI/2);
const fills=[0xbdd6ef,0xc4e7dc,0xd9c7ed,0xf0d2b3];
const fillsMat=fills.map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.87}));
const lineMat=new THREE.LineBasicMaterial({color:0x52667d,transparent:true,opacity:.8});
const edgeMat=new THREE.LineBasicMaterial({color:0x9a6e53});
const markerMat=new THREE.LineBasicMaterial({color:0xf09a30});
const key=labels=>labels.map(([p,q])=>`${p}/${q}`).join(' ');
function clear(g){while(g.children.length){const o=g.children[0];g.remove(o);if(o.geometry&&o.geometry!==fillGeo)o.geometry.dispose();}}
function point(F,a,b,y=0){return [F.cx+F.R*(a*F.uy+b*F.ux),F.z+y,-(F.cy+F.R*(-a*F.ux+b*F.uy))];}
function segment(out,a,b){out.push(...a,...b);}
function lineGeo(points){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return geo;}
function arc(out,F,fn,n,y=.003){let prev=point(F,...fn(0),y);for(let i=1;i<=n;i++){const next=point(F,...fn(i/n),y);segment(out,prev,next);prev=next;}}
function geodesic(out,F,A,C){
    const d=Math.acos(THREE.MathUtils.clamp(A[0]*C[0]+A[1]*C[1],-1,1));
    if(d<1e-8)return;
    if(Math.PI-d<1e-8){segment(out,point(F,...A,.003),point(F,...C,.003));return;}
    const l=Math.hypot(A[0]+C[0],A[1]+C[1]),dist=1/Math.cos(d/2),r=Math.tan(d/2);
    const x=(A[0]+C[0])/l*dist,y=(A[1]+C[1])/l*dist,a=Math.atan2(A[1]-y,A[0]-x);
    let delta=Math.atan2(C[1]-y,C[0]-x)-a;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;
    const n=Math.max(3,Math.min(24,Math.ceil(r*Math.abs(delta)*12)));
    arc(out,F,s=>[x+r*Math.cos(a+delta*s),y+r*Math.sin(a+delta*s)],n);
}
function rebuild(){
    clear(treeGroup);const result=buildTree(settings);recs=result.recs;truncated=result.truncated;
    const boundary=[],links=[],farey=[];
    recs.forEach((rec,i)=>{
        const F=rec.F,m=new THREE.Mesh(fillGeo,fillsMat[rec.depth%fillsMat.length]);m.position.set(F.cx,F.z,-F.cy);m.scale.setScalar(F.R);m.userData.vertex=i;treeGroup.add(m);
        arc(boundary,F,s=>[Math.cos(2*Math.PI*s),Math.sin(2*Math.PI*s)],48,.002);
        if(rec.parent>=0&&rec.gap){const x=F.cx+F.R*F.ux,z=-(F.cy+F.R*F.uy);segment(links,[x,F.z,z],[x,F.z-rec.gap,z]);}
        if(showFarey&&F.R>=.10){const edges=(rec.depth?diskSet(settings.N):baseDiskSet(settings.N)).e;for(const [p,q,r,s] of edges)geodesic(farey,F,B(p,q),B(r,s));}
    });
    treeGroup.add(new THREE.LineSegments(lineGeo(boundary),lineMat),new THREE.LineSegments(lineGeo(links),edgeMat));
    if(showFarey)treeGroup.add(new THREE.LineSegments(lineGeo(farey),lineMat));
    status.textContent=`${recs.length} planes · finite patch${truncated?' · display limit reached':''}`;
    drawMarker();refresh();
}
function drawMarker(from=null){
    clear(markGroup);const F=getFrame(selected,settings),v=[];
    arc(v,F,s=>[Math.cos(2*Math.PI*s),Math.sin(2*Math.PI*s)],64,.009);
    markGroup.add(new THREE.LineSegments(lineGeo(v),markerMat));
    if(from){const A=getFrame(from,settings),a=[A.cx,A.z+.01,-A.cy],b=[F.cx,F.z+.01,-F.cy];markGroup.add(new THREE.Line(lineGeo([...a,...b]),markerMat));}
}
function act(which){
    const next=applyAction(which,selected);
    if(next.length>8){lastAction='Image is beyond eight edges; reset or choose another plane.';refresh();return;}
    const from=selected;selected=next;lastAction=`${which} maps the selected vertex to ${labelText(next)}.`;drawMarker(from);refresh();
}
const left=createPanel({name:'tree-view',widthM:.43,heightM:.43,build(ui){
    ui.subheading('Tree of planes');ui.text('Finite patch over ℚ((1/t))',{muted:true,size:23*ui.s});ui.space(6*ui.s);
    ui.text(`Depth: ${settings.depth}   ·   max denominator: ${settings.N}`);
    ui.button('depth','Change depth (1–3)');ui.button('den','Change max q (2–4)');
    ui.button('edges',`Edges: ${settings.edges==='q'?'length 1/q':settings.edges==='levels'?'equal levels':'zero'}`);
    ui.toggle('farey','Farey geodesics',showFarey);ui.text('The 3D layout illustrates the tree; it is not an intrinsic embedding.',{muted:true,size:21*ui.s});
}});
const right=createPanel({name:'tree-action',widthM:.43,heightM:.48,build(ui){
    ui.subheading('Selected vertex');ui.text(labelText(selected),{size:25*ui.s});ui.text(`${selected.length} edge${selected.length===1?'':'s'} from v₀`,{muted:true});
    ui.text('Apply a matrix to this vertex. S and T fix v₀; U moves it.',{muted:true,size:23*ui.s});
    ui.button('S','S: z ↦ −1/z');ui.button('T','T: z ↦ z + 1');ui.button('U','U: z ↦ z + t');
    ui.text(lastAction,{muted:true,size:21*ui.s});ui.text('Orange links the before and after; it is not the tree path.',{muted:true,size:21*ui.s});ui.button('base','Select v₀');ui.button('home','Bring model back');
}});
left.mesh.position.set(-.48,0,.06);left.mesh.rotation.y=.5;right.mesh.position.set(.48,0,.06);right.mesh.rotation.y=-.5;workbench.add(left.mesh,right.mesh);
const panels=[left,right];function refresh(){panels.forEach(p=>p.invalidate());}
function home(){workbench.updateMatrixWorld(true);workbench.getWorldPosition(modelRoot.position);workbench.getWorldQuaternion(modelRoot.quaternion);modelRoot.scale.setScalar(.19);}
function recenter(){const c=renderer.xr.isPresenting?renderer.xr.getCamera():camera,p=c.getWorldPosition(new THREE.Vector3()),d=new THREE.Vector3(0,0,-1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));d.y=0;if(d.lengthSq()<1e-6)d.set(0,0,-1);d.normalize();if(renderer.xr.isPresenting){workbench.position.copy(p).addScaledVector(d,.68);workbench.position.y=Math.max(.8,p.y-.22);}else{workbench.position.set(0,1.3,0);d.set(0,0,-1);}workbench.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),d);home();interaction.cancelMotion();}
for(const p of panels)p.onAction((id,value)=>{
    if(id==='depth')settings.depth=settings.depth%3+1;
    else if(id==='den')settings.N=settings.N===4?2:settings.N+1;
    else if(id==='edges')settings.edges=settings.edges==='q'?'levels':settings.edges==='levels'?'zero':'q';
    else if(id==='farey')showFarey=value;
    else if(id==='base'){selected=[];lastAction='Selected the base vertex v₀.';drawMarker();refresh();return;}
    else if(id==='home'){recenter();return;}
    else if(['S','T','U'].includes(id)){act(id);return;}
    rebuild();
});
const display={pick(ray){const hits=ray.intersectObjects(treeGroup.children.filter(x=>x.isMesh),false);return hits.length?{tag:hits[0].object.userData.vertex,distance:hits[0].distance}:{tag:-1,distance:Infinity};}};
const interaction=createInteraction({input,display,ballRoot:modelRoot,camera,controls,panels:()=>panels,inside:()=>false,callbacks:{onHover:()=>{},onTap:i=>{selected=recs[i].labels;lastAction='Plane selected. Apply a matrix to follow its image.';drawMarker();refresh();},onTapEmpty:()=>{},onDoubleTap:()=>{},onFly:()=>{},onBallMoved:()=>{},onGrab:()=>{}}});
canvas.addEventListener('pointerdown',e=>{if(renderer.xr.isPresenting||e.button!==0)return;const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);if(panels.some(p=>ray.intersectObject(p.mesh,false).length)||display.pick(ray).tag>=0)controls.enabled=false;},true);
window.addEventListener('pointerup',()=>{if(!interaction.grabbing)controls.enabled=true;});
const vr=document.querySelector('#vr'),ar=document.querySelector('#ar');let place=false;
async function enter(mode){if(renderer.xr.isPresenting){renderer.xr.getSession().end();return;}try{const session=await navigator.xr.requestSession(mode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','bounded-floor']});session.addEventListener('end',()=>{env.visible=true;renderer.setClearAlpha(1);input.setHandsVisible(true);vr.textContent='Enter VR';recenter();});await renderer.xr.setSession(session);const passthrough=mode==='immersive-ar';env.visible=!passthrough;renderer.setClearAlpha(passthrough?0:1);input.setHandsVisible(!passthrough);place=true;vr.textContent='Exit VR';}catch(e){console.error(e);alert('Could not start VR: '+e.message);}}
if(navigator.xr){navigator.xr.isSessionSupported('immersive-vr').then(ok=>{vr.disabled=!ok;});navigator.xr.isSessionSupported('immersive-ar').then(ok=>{ar.hidden=!ok;});}
vr.addEventListener('click',()=>enter('immersive-vr'));ar.addEventListener('click',()=>enter('immersive-ar'));
let last=0;function frame(now){const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(place){place=false;recenter();}input.update();interaction.update(now,dt);panels.forEach(p=>p.update());if(!renderer.xr.isPresenting)controls.update();renderer.render(scene,camera);}renderer.setAnimationLoop(frame);
window.addEventListener('resize',()=>{if(renderer.xr.isPresenting)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
home();rebuild();
