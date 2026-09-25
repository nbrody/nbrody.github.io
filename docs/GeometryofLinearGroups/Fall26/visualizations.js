import { cayleyBall, orbitPoint, fareyEdges, fractionLabel, boundaryPoint, figureEight } from './visual-math.js';
const $=id=>document.getElementById(id);

// SVG stays usable even if WebGL is unavailable.
function initFarey() {
  const svg=$('farey'), ns='http://www.w3.org/2000/svg';
  let offset=[0,0], data=[], drag=null;
  const make=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const transform=z=>{
    const [x,y]=z,[u,v]=offset;
    const dr=1+u*x+v*y,di=u*y-v*x,n=dr*dr+di*di;
    return [((x+u)*dr+(y+v)*di)/n,((y+v)*dr-(x+u)*di)/n];
  };
  const pixel=([x,y])=>[220+180*x,220+180*y];
  function arc(a,b) {
    const dot=a[0]*b[0]+a[1]*b[1];
    if(Math.abs(1+dot)<1e-8)return `M${pixel(a)} L${pixel(b)}`;
    const c=[(a[0]+b[0])/(1+dot),(a[1]+b[1])/(1+dot)];
    const r=Math.hypot(a[0]-c[0],a[1]-c[1]);
    const start=Math.atan2(a[1]-c[1],a[0]-c[0]);
    let delta=Math.atan2(b[1]-c[1],b[0]-c[0])-start;
    if(delta>Math.PI)delta-=2*Math.PI;if(delta< -Math.PI)delta+=2*Math.PI;
    return 'M'+Array.from({length:25},(_,i)=>pixel([c[0]+r*Math.cos(start+delta*i/24),c[1]+r*Math.sin(start+delta*i/24)])).join(' L');
  }
  function draw() {
    const layer=$('farey-lines'), labels=$('farey-labels');layer.replaceChildren();labels.replaceChildren();
    for(const e of data){
      const line=make('path',{d:arc(transform(boundaryPoint(e.a)),transform(boundaryPoint(e.b))),class:'farey-edge','stroke-width':e.level<3?1.4:.8});
      const text=`${fractionLabel(e.a)} ↔ ${fractionLabel(e.b)} · |ps − qr| = 1`;
      const title=make('title',{});title.textContent=text;line.append(title);
      line.addEventListener('pointerenter',()=>{$('farey-readout').textContent=text;});layer.append(line);
    }
    for(const f of [[1,0],[0,1],[1,1],[-1,1],[1,2],[-1,2],[2,1],[-2,1]]) {
      const v=transform(boundaryPoint(f));const p=[220+199*v[0],220+199*v[1]];
      const label=make('text',{x:p[0],y:p[1],'text-anchor':'middle','dominant-baseline':'middle'});label.textContent=fractionLabel(f);labels.append(label);
    }
  }
  const load=()=>{data=fareyEdges(Number($('farey-depth').value));$('farey-depth-value').textContent=$('farey-depth').value;draw();};
  $('farey-depth').addEventListener('input',load);
  function reset(){offset=[0,0];draw();$('farey-readout').textContent='Hover over an edge to see its rational endpoints.';}
  $('farey-reset').addEventListener('click',reset);
  function move(dx,dy){offset[0]+=dx;offset[1]+=dy;const n=Math.hypot(...offset);if(n>.82)offset=offset.map(x=>x*.82/n);draw();}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;svg.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];svg.focus();});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const scale=440/svg.getBoundingClientRect().width/180;move((e.clientX-drag[0])*scale,(e.clientY-drag[1])*scale);drag=[e.clientX,e.clientY];});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,()=>drag=null);
  svg.addEventListener('keydown',e=>{const directions={ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]};if(directions[e.key]){e.preventDefault();move(...directions[e.key]);}else if(e.key==='Home'){e.preventDefault();reset();}});
  load();
}
initFarey();

async function initThree() {
  const THREE=await import('./vendor/three.module.js');
  const {OrbitControls}=await import('./vendor/OrbitControls.js');
  function viewer(id, distance) {
    const host=$(id), scene=new THREE.Scene();
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',host.dataset.label);host.replaceChildren(canvas);
    const camera=new THREE.PerspectiveCamera(36,1,.1,50);camera.position.set(0,0,distance);
    const controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.enableZoom=false;controls.autoRotate=false;controls.autoRotateSpeed=.65;
    const model=new THREE.Group();scene.add(model);
    scene.add(new THREE.HemisphereLight(0xfffbed,0x59634e,2.5));
    const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,4,5);scene.add(key);
    const fill=new THREE.DirectionalLight(0xcbd8bb,1.6);fill.position.set(-4,-1,2);scene.add(fill);
    let dirty=true,visible=true;
    controls.addEventListener('change',()=>dirty=true);
    const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();dirty=true;});resize.observe(host);
    const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;dirty=true;});intersection.observe(host);
    renderer.setAnimationLoop(()=>{if(!visible||document.hidden)return;controls.update();if(dirty||controls.autoRotate){renderer.render(scene,camera);dirty=false;}});
    const reset=()=>{model.rotation.set(0,0,0);controls.reset();dirty=true;};
    $(id+'-reset').addEventListener('click',reset);
    const spin=$(id+'-spin');spin.addEventListener('click',()=>{controls.autoRotate=!controls.autoRotate;spin.setAttribute('aria-pressed',String(controls.autoRotate));spin.textContent=controls.autoRotate?'Pause rotation':'Auto-rotate';dirty=true;});
    canvas.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();reset();return;}const axes={ArrowLeft:['y',-.12],ArrowRight:['y',.12],ArrowUp:['x',-.12],ArrowDown:['x',.12]};if(axes[e.key]){e.preventDefault();const [a,d]=axes[e.key];model.rotation[a]+=d;dirty=true;}});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$(id+'-note').textContent='Graphics paused. Reload the page to restore the 3D view.';});
    return {scene,model,refresh:()=>dirty=true};
  }
  function sphere() {
    const view=viewer('sphere-view',4.5);
    const surface=new THREE.Mesh(new THREE.SphereGeometry(.985,48,32),new THREE.MeshStandardMaterial({color:0xe3e8d5,roughness:1,metalness:0}));view.model.add(surface);
    const grid=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(.991,24,12)),new THREE.LineBasicMaterial({color:0x819471,transparent:true,opacity:.12}));view.model.add(grid);
    let graph;
    function rebuild(){
      if(graph){view.model.remove(graph);graph.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
      graph=new THREE.Group();view.model.add(graph);
      const depth=Number($('sphere-depth').value),{nodes,edges}=cayleyBall(depth),points=nodes.map(m=>new THREE.Vector3(...orbitPoint(m)));
      const colors=[0x3e644f,0xa6793b,0x527e97];
      for(let color=0;color<3;color++){
        const vertices=[];
        for(const e of edges.filter(e=>e.color===color)){
          const a=points[e.from],b=points[e.to],angle=a.angleTo(b),sin=Math.sin(angle);
          const curve=t=>sin<1e-8?a.clone().lerp(b,t).normalize():a.clone().multiplyScalar(Math.sin((1-t)*angle)/sin).addScaledVector(b,Math.sin(t*angle)/sin);
          for(let i=0;i<18;i++)vertices.push(...curve(i/18).multiplyScalar(1.003).toArray(),...curve((i+1)/18).multiplyScalar(1.003).toArray());
        }
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
        graph.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:colors[color],transparent:true,opacity:.8})));
      }
      const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(depth>3?.009:.014,8,6),new THREE.MeshStandardMaterial({color:0x2d4938,roughness:.7}),points.length);
      points.forEach((p,i)=>dots.setMatrixAt(i,new THREE.Matrix4().makeTranslation(...p.clone().multiplyScalar(1.006).toArray())));graph.add(dots);
      const origin=new THREE.Mesh(new THREE.SphereGeometry(.032,12,10),new THREE.MeshStandardMaterial({color:0xd6a650}));origin.position.copy(points[0]).multiplyScalar(1.02);graph.add(origin);
      $('sphere-count').textContent=`${nodes.length} vertices · ${edges.length} edges · word radius ${depth}`;
      view.refresh();
    }
    $('sphere-depth').addEventListener('change',rebuild);rebuild();
  }
  function knot(){
    const view=viewer('knot-view',10.7);
    class FigureEight extends THREE.Curve{getPoint(t,target=new THREE.Vector3()){return target.set(...figureEight(t*2*Math.PI));}}
    const geometry=new THREE.TubeGeometry(new FigureEight(),384,.115,16,true);
    const material=new THREE.MeshStandardMaterial({color:0x648274,roughness:.32,metalness:.2});
    view.model.add(new THREE.Mesh(geometry,material));view.refresh();
  }
  for(const [init,id] of [[sphere,'sphere-view'],[knot,'knot-view']])try{init();}catch(error){$(id).textContent='The 3D view needs WebGL enabled in your browser.';console.error(error);}
}
initThree().catch(error=>{for(const id of ['sphere-view','knot-view'])$(id).textContent='The 3D view could not load. Please reload to try again.';console.error(error);});
