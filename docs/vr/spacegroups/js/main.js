/** Space Groups VR shares the desktop canonical-domain engine and the Poincaré VR input system. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createInput } from '../../questGOLG/poincare/js/xrInput.js';
import { createInteraction } from '../../questGOLG/poincare/js/interact.js';
import { createPanel } from '../../questGOLG/poincare/js/ui/panel.js?v=2026-11-12a';
import { Iso, isoKey, wallF } from '../../../GeometryofLinearGroups/Geometric/Tools/Euclidean/spacegroups/js/math.js';
import { computeCanonicalDomain } from '../../../GeometryofLinearGroups/Geometric/Tools/Euclidean/spacegroups/js/canonical.js';
import { domainIsBounded } from '../../../GeometryofLinearGroups/Geometric/Tools/Euclidean/spacegroups/js/certifier.js';
import { exampleLibrary, latexToExpr, evalRealExpression } from '../../../GeometryofLinearGroups/Geometric/Tools/Euclidean/spacegroups/js/matrixInput.js';

const canvas = document.querySelector('#scene'), status = document.querySelector('#status');
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(.5);
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, .01, 100);
camera.position.set(0,1.4,1.5);
const controls = new OrbitControls(camera,canvas); controls.target.set(0,1.3,0); controls.enableDamping=true; controls.minDistance=.3; controls.maxDistance=5; controls.update();
const env = new THREE.Group(); scene.add(env);
const sky = new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.MeshBasicMaterial({color:0xe9eef5,side:THREE.BackSide}));
const floor = new THREE.Mesh(new THREE.CircleGeometry(30,64).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xf5f6f8})); env.add(sky,floor);
scene.add(new THREE.HemisphereLight(0xffffff,0x8995aa,2));
const light = new THREE.DirectionalLight(0xffffff,1.3); light.position.set(1,3,2); scene.add(light);
const workbench = new THREE.Group(); workbench.position.set(0,1.3,0); scene.add(workbench);
const modelRoot = new THREE.Group(); scene.add(modelRoot);
const domainGroup = new THREE.Group(), tilesGroup = new THREE.Group(); modelRoot.add(domainGroup,tilesGroup);
const input = createInput({renderer,scene,camera,dom:canvas});
let selected=-1, preset=0, showTiles=false, domain=null, clipped=false, computeToken=0;
const palette=[0x6778e8,0x00a9b5,0xe18b5a,0xb97bd3,0x66ae78,0xe2b44d,0xd56587,0x4c9ccc];

// Each face is the exact intersection of its plane with the other wall
// half-spaces. A cube of radius 3 clips unbounded or very large domains.
const LIMIT=3;
function clip(poly,w) {
    const out=[];
    for (let i=0;i<poly.length;i++) {
        const a=poly[i],b=poly[(i+1)%poly.length],fa=wallF(a,w),fb=wallF(b,w);
        if (fa<=1e-7) out.push(a);
        if ((fa<0 && fb>0)||(fa>0 && fb<0)) out.push(a.clone().lerp(b,fa/(fa-fb)));
    }
    return out;
}
function facePolygon(w,walls) {
    const n=w.geom.n, origin=n.clone().multiplyScalar(w.geom.d);
    let a=Math.abs(n.x)>.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
    a.addScaledVector(n,-a.dot(n)).normalize(); const b=new THREE.Vector3().crossVectors(n,a).normalize();
    const r=LIMIT*4;
    let poly=[[-r,-r],[r,-r],[r,r],[-r,r]].map(([x,y])=>origin.clone().addScaledVector(a,x).addScaledVector(b,y));
    const bounds=[new THREE.Vector4(1,0,0,LIMIT),new THREE.Vector4(-1,0,0,LIMIT),new THREE.Vector4(0,1,0,LIMIT),new THREE.Vector4(0,-1,0,LIMIT),new THREE.Vector4(0,0,1,LIMIT),new THREE.Vector4(0,0,-1,LIMIT)];
    for (const v of [...walls.map(x=>x.cov),...bounds]) { if (v===w.cov) continue; poly=clip(poly,v); if (poly.length<3) return []; }
    return poly;
}
function disposeGroup(g) { while(g.children.length){const o=g.children.pop();o.parent=null;o.traverse(x=>{if(x.geometry)x.geometry.dispose();if(x.material){for(const m of Array.isArray(x.material)?x.material:[x.material])m.dispose();}});} }
function isoMatrix(g){const r=g.R,t=g.t;return new THREE.Matrix4().set(r[0],r[1],r[2],t.x,r[3],r[4],r[5],t.y,r[6],r[7],r[8],t.z,0,0,0,1);}
function faceColor(i){const partner=domain.walls[i].pairing?.partner;return palette[(partner==null?i:Math.min(i,partner))%palette.length];}
function meshFor(poly,i,alpha) {
    const pts=[]; for(let j=1;j<poly.length-1;j++)for(const p of [poly[0],poly[j],poly[j+1]])pts.push(p.x,p.y,p.z);
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));geo.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({color:faceColor(i),roughness:.8,transparent:alpha<1,opacity:alpha,side:THREE.DoubleSide,depthWrite:alpha>=1});
    const m=new THREE.Mesh(geo,mat); m.userData.face=i; return m;
}
let polygons=[];
function rebuild() {
    disposeGroup(domainGroup); disposeGroup(tilesGroup); polygons=[]; if(!domain)return;
    clipped=!domainIsBounded(domain.walls);
    domain.walls.forEach((w,i)=>{
        const poly=facePolygon(w,domain.walls); polygons[i]=poly; if(poly.length<3)return;
        if(poly.some(p=>Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))>LIMIT-1e-4))clipped=true;
        const face=meshFor(poly,i,.78); domainGroup.add(face);
        const points=[...poly,poly[0]]; const edge=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x34415d,transparent:true,opacity:.7}));domainGroup.add(edge);
    });
    if(showTiles){
        const seen=new Set([isoKey(Iso.identity())]);
        for(const w of domain.walls){
            const h=w.elem;const key=isoKey(h);if(seen.has(key))continue;seen.add(key);
            const tile=new THREE.Group();tile.matrixAutoUpdate=false;tile.matrix.copy(isoMatrix(h));
            polygons.forEach((p,i)=>{if(p.length>=3)tile.add(meshFor(p,i,.13));});tilesGroup.add(tile);
            if(tilesGroup.children.length>=20)break;
        }
    }
    refresh();
}
function generators(item) {
    const out=[];
    for(const mat of item.mats){
        const vals=mat.map(x=>evalRealExpression(latexToExpr(x)));
        if(vals.some(x=>!Number.isFinite(x))) throw Error('Could not read preset generator');
        const g=new Iso([vals[0],vals[1],vals[2],vals[4],vals[5],vals[6],vals[8],vals[9],vals[10]],new THREE.Vector3(vals[3],vals[7],vals[11])).normalized();
        out.push(g,g.inv());
    }
    return out;
}
function loadPreset(i){
    preset=i; selected=-1; status.textContent='Computing '+exampleLibrary[i].name+'…';
    const token=++computeToken; refresh();
    // Let the status paint before the bounded orbit search.
    setTimeout(()=>{if(token!==computeToken)return;try{
        domain=computeCanonicalDomain(generators(exampleLibrary[i]),Iso.identity(),96,{maxDepth:8});
        rebuild(); status.textContent=exampleLibrary[i].name+' · '+domain.count+' faces'+(clipped?' · display clipped at ±3':'');
    }catch(e){console.error(e);domain=null;disposeGroup(domainGroup);disposeGroup(tilesGroup);status.textContent='Could not compute this domain: '+e.message;refresh();}},40);
}
function word(w){return w?.length?w.map(i=>'g'+Math.abs(i)+(i<0?'⁻¹':'')).join(' '):'identity';}
const left=createPanel({name:'library',widthM:.43,heightM:.47,build(ui){
    ui.subheading('Space groups');ui.text('Choose a group', {muted:true});ui.space(8*ui.s);
    ui.scrollArea('library',null,u=>{exampleLibrary.forEach((e,i)=>{u.button('preset:'+i,e.name,{value:i,active:preset===i,align:'left',size:24*ui.s,height:58*ui.s});u.space(5*ui.s);});});
}});
const right=createPanel({name:'details',widthM:.4,heightM:.39,build(ui){
    ui.subheading(exampleLibrary[preset].name);ui.space(8*ui.s);
    if(!domain){ui.text('Computing the domain…',{muted:true});return;}
    ui.text(`Canonical domain candidate · ${domain.count} faces`);
    ui.text(`Basepoint stabilizer: order ${domain.stabilizer.order}`,{muted:true});
    ui.text('Numerical search; discreteness is not certified here.',{muted:true,size:21*ui.s});
    if(clipped)ui.text('Display clipped to the cube ±3; some faces extend beyond it.',{color:ui.theme.warn,size:23*ui.s});
    ui.space(12*ui.s);ui.toggle('tiles','Show neighboring copies',showTiles);
    ui.text('Tap a colored face to inspect its pairing.',{muted:true,size:23*ui.s});ui.space(8*ui.s);
    if(selected>=0){const w=domain.walls[selected],p=w.pairing;
        ui.label(`Face ${selected+1} · ${w.kind==='cone'?'stabilizer':'domain'} wall`);
        ui.text(`Orbit word: ${word(w.word)}`,{size:23*ui.s});
        ui.text(p?`Pairs with face ${p.partner+1} via ${word(p.word)}`:'Pairing not resolved by the numerical search.',{size:23*ui.s});
    }
    ui.space(12*ui.s);ui.button('recenter','Bring model back');
}});
left.mesh.position.set(-.47,0,.08);left.mesh.rotation.y=.5;right.mesh.position.set(.46,0,.08);right.mesh.rotation.y=-.5;workbench.add(left.mesh,right.mesh);
const panels=[left,right];
function refresh(){panels.forEach(p=>p.invalidate());}
function home(){workbench.updateMatrixWorld(true);workbench.getWorldPosition(modelRoot.position);workbench.getWorldQuaternion(modelRoot.quaternion);modelRoot.scale.setScalar(.22);}
function recenter(){
    const c=renderer.xr.isPresenting?renderer.xr.getCamera():camera;
    const p=c.getWorldPosition(new THREE.Vector3()),dir=new THREE.Vector3(0,0,-1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));dir.y=0;if(dir.lengthSq()<1e-6)dir.set(0,0,-1);dir.normalize();
    if(renderer.xr.isPresenting){workbench.position.copy(p).addScaledVector(dir,.65);workbench.position.y=Math.max(.8,p.y-.22);}else{workbench.position.set(0,1.3,0);dir.set(0,0,-1);}
    workbench.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);home();interaction.cancelMotion();
}
for(const p of panels)p.onAction((id,value)=>{
    if(id.startsWith('preset:'))loadPreset(value);
    else if(id==='tiles'){showTiles=value;rebuild();}
    else if(id==='recenter')recenter();refresh();
});
const display={pick(ray){const hits=ray.intersectObjects(domainGroup.children.filter(x=>x.isMesh),false);return hits.length?{tag:hits[0].object.userData.face,distance:hits[0].distance}:{tag:-1,distance:Infinity};}};
const interaction=createInteraction({input,display,ballRoot:modelRoot,camera,controls,panels:()=>panels,inside:()=>false,callbacks:{
    onHover:()=>{},onTap:i=>{selected=i;refresh();},onTapEmpty:()=>{selected=-1;refresh();},onDoubleTap:i=>{selected=i;refresh();},onFly:()=>{},onBallMoved:()=>{},onGrab:()=>{}
}});
canvas.addEventListener('pointerdown',e=>{if(renderer.xr.isPresenting||e.button!==0)return;const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);if(panels.some(p=>ray.intersectObject(p.mesh,false).length)||display.pick(ray).tag>=0)controls.enabled=false;},true);
// OrbitControls otherwise zooms on a wheel meant for the library's scroll area.
canvas.addEventListener('wheel',e=>{
    if(renderer.xr.isPresenting)return;
    const r=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
    for(const p of panels){const hit=ray.intersectObject(p.mesh,false)[0];if(hit&&p.scroll('mouse',p.uvFromIntersection(hit),e.deltaY)){e.preventDefault();e.stopImmediatePropagation();return;}}
},{capture:true,passive:false});
window.addEventListener('pointerup',()=>{if(!interaction.grabbing)controls.enabled=true;});
const vr=document.querySelector('#vr'), ar=document.querySelector('#ar');let place=false;
async function enter(mode){if(renderer.xr.isPresenting){renderer.xr.getSession().end();return;}try{
    const session=await navigator.xr.requestSession(mode,{requiredFeatures:['local-floor'],optionalFeatures:['hand-tracking','bounded-floor']});
    session.addEventListener('end',()=>{env.visible=true;renderer.setClearAlpha(1);input.setHandsVisible(true);vr.textContent='Enter VR';recenter();});
    await renderer.xr.setSession(session);const passthrough=mode==='immersive-ar';env.visible=!passthrough;renderer.setClearAlpha(passthrough?0:1);input.setHandsVisible(!passthrough);place=true;vr.textContent='Exit VR';
}catch(e){console.error(e);alert('Could not start VR: '+e.message);}}
if(navigator.xr){navigator.xr.isSessionSupported('immersive-vr').then(ok=>{vr.disabled=!ok;});navigator.xr.isSessionSupported('immersive-ar').then(ok=>{ar.hidden=!ok;});}
vr.addEventListener('click',()=>enter('immersive-vr'));ar.addEventListener('click',()=>enter('immersive-ar'));
let last=0;function frame(now){const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(place){place=false;recenter();}input.update();interaction.update(now,dt);panels.forEach(p=>p.update());if(!renderer.xr.isPresenting)controls.update();renderer.render(scene,camera);}renderer.setAnimationLoop(frame);
function desktopView(){
    const aspect=innerWidth/Math.max(1,innerHeight), t=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const d=Math.max(.45/t,.78/(t*aspect))+.12;
    camera.position.set(0,1.36,d); controls.target.set(0,1.3,0);controls.update();
}
window.addEventListener('resize',()=>{if(renderer.xr.isPresenting)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);desktopView();});
home();desktopView();loadPreset(0);
