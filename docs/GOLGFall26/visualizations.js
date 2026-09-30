import { cayleyBall, orbitPoint, fareyEdges, fractionLabel, boundaryPoint, figureEight, vertexRadius, treeLayout, wrapPoint, slerp } from './visual-math.js';
const $=id=>document.getElementById(id);

// SVG stays usable even if WebGL is unavailable.
function initFarey() {
  const svg=$('farey'), ns='http://www.w3.org/2000/svg';
  let offset=[0,0], depth=6, data=[], drag=null;
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
    const layer=$('farey-lines');layer.replaceChildren();
    for(const e of data){
      const line=make('path',{d:arc(transform(boundaryPoint(e.a)),transform(boundaryPoint(e.b))),class:'farey-edge','stroke-width':e.level<3?1.4:.8});
      const text=`${fractionLabel(e.a)} ↔ ${fractionLabel(e.b)} · |ps − qr| = 1`;
      const title=make('title',{});title.textContent=text;line.append(title);
      layer.append(line);
    }
  }
  const load=()=>{data=fareyEdges(depth);draw();};
  function reset(){offset=[0,0];draw();}
  svg.addEventListener('dblclick',reset);
  function move(dx,dy){offset[0]+=dx;offset[1]+=dy;const n=Math.hypot(...offset);if(n>.82)offset=offset.map(x=>x*.82/n);draw();}
  svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;svg.setPointerCapture(e.pointerId);drag=[e.clientX,e.clientY];svg.focus();});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const scale=440/svg.getBoundingClientRect().width/180;move((e.clientX-drag[0])*scale,(e.clientY-drag[1])*scale);drag=[e.clientX,e.clientY];});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,()=>drag=null);
  svg.addEventListener('keydown',e=>{const directions={ArrowLeft:[-.06,0],ArrowRight:[.06,0],ArrowUp:[0,-.06],ArrowDown:[0,.06]};if(directions[e.key]){e.preventDefault();move(...directions[e.key]);}else if(e.key==='Home'){e.preventDefault();reset();}else if(['+','=','-'].includes(e.key)){e.preventDefault();depth=Math.max(2,Math.min(7,depth+(e.key==='-'?-1:1)));load();}});
  load();
}
initFarey();

async function initThree() {
  const THREE=await import('./vendor/three.module.js');
  function viewer(id, distance, onTap) {
    const host=$(id), scene=new THREE.Scene();
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',host.dataset.label);host.replaceChildren(canvas);
    const camera=new THREE.PerspectiveCamera(36,1,.1,50);camera.position.set(0,0,distance);
    const model=new THREE.Group();scene.add(model);
    scene.add(new THREE.HemisphereLight(0xfffbed,0x4f616f,2.5));
    const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(3,4,5);scene.add(key);
    const fill=new THREE.DirectionalLight(0xbcd6e7,1.6);fill.position.set(-4,-1,2);scene.add(fill);
    let frame=0;
    function render(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;renderer.render(scene,camera);});}
    const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();render();});resize.observe(host);
    // A single quaternion rotates the object in camera coordinates. No camera-up
    // singularity, competing Euler rotation, momentum, or latitude clamp.
    const rotation=new THREE.Quaternion();
    let pointer=null,previous=null,last=null,travel=0,tapTimer=0;
    function onBall(x,y){
      const r=canvas.getBoundingClientRect(),radius=Math.min(r.width,r.height)*.43;
      const v=new THREE.Vector3((x-r.left-r.width/2)/radius,(r.top+r.height/2-y)/radius,0);
      const d=v.x*v.x+v.y*v.y;
      if(d<=1)v.z=Math.sqrt(1-d);else v.normalize();
      return v;
    }
    canvas.addEventListener('pointerdown',e=>{
      if(pointer!==null||e.button!==0)return;
      e.preventDefault();pointer=e.pointerId;previous=onBall(e.clientX,e.clientY);last=[e.clientX,e.clientY];travel=0;
      canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});
    });
    canvas.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointer)return;
      travel+=Math.hypot(e.clientX-last[0],e.clientY-last[1]);last=[e.clientX,e.clientY];
      const current=onBall(e.clientX,e.clientY);
      rotation.setFromUnitVectors(previous,current);
      model.quaternion.premultiply(rotation).normalize();previous=current;render();
    });
    function release(e){if(e.pointerId!==pointer)return;pointer=null;previous=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
    window.addEventListener('blur',()=>{if(pointer!==null)release({pointerId:pointer});});
    const reset=()=>{if(pointer!==null)release({pointerId:pointer});model.quaternion.identity();render();};
    canvas.addEventListener('dblclick',()=>{clearTimeout(tapTimer);reset();});
    // A click that did not drag is a tap; wait briefly so a double-click only resets.
    if(onTap)canvas.addEventListener('click',e=>{clearTimeout(tapTimer);if(travel<6&&e.detail<2)tapTimer=setTimeout(onTap,250);});
    canvas.addEventListener('keydown',e=>{
      if(e.key==='Home'){e.preventDefault();reset();return;}
      if(onTap&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onTap();return;}
      const axes={ArrowLeft:[0,1,0,-.12],ArrowRight:[0,1,0,.12],ArrowUp:[1,0,0,-.12],ArrowDown:[1,0,0,.12]};
      if(axes[e.key]){e.preventDefault();const [x,y,z,angle]=axes[e.key];rotation.setFromAxisAngle(new THREE.Vector3(x,y,z),angle);model.quaternion.premultiply(rotation).normalize();render();}
    });
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.setAttribute('aria-label','Graphics paused. Reload to restore the view.');});
    canvas.addEventListener('webglcontextrestored',render);
    return {scene,model,host,refresh:render,draw:()=>renderer.render(scene,camera)};
  }
  function sphere() {
    // Timeline u: 0 is the flat spanning tree, 1 the Cayley graph on the sphere. The tree
    // bends onto the ball (u < .35), each vertex slides to its orbit point g·x₀ (shorter
    // words first), and then the relation edges outside the tree fade in.
    const depth=6,SECONDS=3.2,SEGMENTS=24,LIFT=1.004,{nodes,edges}=cayleyBall(depth);
    const ease=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
    const bend=u=>ease(u/.35),shade=u=>ease((u-.05)/.3),settle=(u,d)=>ease((u-.35-.12*d/depth)/.45),close=u=>ease((u-.88)/.12);
    const view=viewer('sphere-view',3.9,toggle),reduce=matchMedia('(prefers-reduced-motion: reduce)'),IDENTITY=new THREE.Quaternion();
    let u=0,target=0,frame=0,last=0,turnFrom=IDENTITY,turnSpan=0;
    // Drawn first among transparent objects, so it hides edges behind the ball while fading in.
    const surface=new THREE.Mesh(new THREE.SphereGeometry(.985,48,32),new THREE.MeshStandardMaterial({color:0xd7e8f0,roughness:1,metalness:0,transparent:true}));
    surface.renderOrder=-1;view.model.add(surface);
    const grid=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(.991,24,12)),new THREE.LineBasicMaterial({color:0x7191a8,transparent:true}));view.model.add(grid);
    // Turn the orbit so the identity's point faces the viewer; the flat tree is tangent there.
    const toFront=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...orbitPoint(nodes[0])),new THREE.Vector3(0,0,1));
    const onSphere=nodes.map(m=>new THREE.Vector3(...orbitPoint(m)).applyQuaternion(toFront).toArray());
    const flat=treeLayout(nodes,onSphere.map(([x,y])=>Math.atan2(y,x)),.8);
    const colors=[0x455c75,0xa6793b,0x8c6685],treeGroups=[],relationGroups=[];
    for(let color=0;color<3;color++) for(let shell=1;shell<=depth;shell++) for(const tree of [true,false]){
      const list=edges.filter(e=>e.color===color&&e.tree===tree&&Math.max(nodes[e.from].depth,nodes[e.to].depth)===shell)
        .map(e=>({a:e.from,b:e.to,arc:Array.from({length:SEGMENTS+1},(_,i)=>slerp(onSphere[e.from],onSphere[e.to],i/SEGMENTS))}));
      if(!list.length)continue;
      const positions=new Float32Array(list.length*SEGMENTS*6),geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      const opacity=.8*.72**(shell-1),lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:colors[color],transparent:true,opacity,depthWrite:false}));
      lines.frustumCulled=false;view.model.add(lines);
      (tree?treeGroups:relationGroups).push({list,positions,lines,opacity});
    }
    const write=(g,points)=>{for(let i=0;i<SEGMENTS;i++)for(const p of [points[i],points[i+1]]){g.positions[g.at++]=p[0]*LIFT;g.positions[g.at++]=p[1]*LIFT;g.positions[g.at++]=p[2]*LIFT;}};
    for(const g of relationGroups){g.at=0;for(const e of g.list)write(g,e.arc);}
    const dots=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial({color:0x314356,roughness:.7}),nodes.length);
    dots.frustumCulled=false;view.model.add(dots);
    const origin=new THREE.Mesh(new THREE.SphereGeometry(.032,12,10),new THREE.MeshStandardMaterial({color:0xd6a650}));origin.position.set(0,0,1.02);view.model.add(origin);
    const transform=new THREE.Matrix4(),progress=new Float32Array(nodes.length),samples=new Array(SEGMENTS+1);
    // Before a point starts to slide it rides the bending plane; afterwards it follows a
    // great circle from its wrapped spot to its place on the Cayley arc.
    const at=(q,t,k,destination)=>t>0?slerp(wrapPoint(q,1),destination,t):wrapPoint(q,k);
    function apply(){
      const k=bend(u),fade=shade(u),closing=close(u);
      surface.material.opacity=fade;grid.material.opacity=.12*fade;surface.visible=grid.visible=fade>0;
      nodes.forEach((n,i)=>{
        progress[i]=settle(u,n.depth);
        // Outer rings of the flat tree are crowded, so their dots start smaller.
        const p=at(flat[i],progress[i],k,onSphere[i]),r=vertexRadius(n.depth)*(.72**Math.max(0,n.depth-3)*(1-progress[i])+progress[i]);
        transform.makeScale(r,r,r);transform.setPosition(p[0]*LIFT,p[1]*LIFT,p[2]*LIFT);dots.setMatrixAt(i,transform);
      });
      dots.instanceMatrix.needsUpdate=true;
      for(const g of treeGroups){
        g.at=0;
        for(const e of g.list){
          const [ax,ay]=flat[e.a],[bx,by]=flat[e.b],ta=progress[e.a],tb=progress[e.b];
          for(let i=0;i<=SEGMENTS;i++){const s=i/SEGMENTS;samples[i]=at([ax+(bx-ax)*s,ay+(by-ay)*s],ta+(tb-ta)*s,k,e.arc[i]);}
          write(g,samples);
        }
        g.lines.geometry.attributes.position.needsUpdate=true;
      }
      for(const g of relationGroups){g.lines.material.opacity=g.opacity*closing;g.lines.visible=closing>0;}
    }
    function tick(now){
      const dt=last?Math.min(.1,(now-last)/1000):1/60;last=now;
      u=target?Math.min(1,u+dt/SECONDS):Math.max(0,u-dt/SECONDS);
      // Unwrapping also turns the tree back to face the viewer.
      if(!target&&turnSpan)view.model.quaternion.slerpQuaternions(turnFrom,IDENTITY,ease(1-u/turnSpan));
      apply();view.draw();
      frame=u===target?0:requestAnimationFrame(tick);if(!frame)last=0;
    }
    function toggle(){
      target=1-target;view.host.dataset.state=target?'sphere':'tree';
      turnFrom=view.model.quaternion.clone();turnSpan=target?0:u;
      if(reduce.matches){u=target;if(!target)view.model.quaternion.identity();apply();view.refresh();return;}
      if(!frame)frame=requestAnimationFrame(tick);
    }
    apply();view.refresh();
    Object.assign(view.host.dataset,{vertices:String(nodes.length),wordRadius:String(depth),state:'tree'});
  }
  function knot(){
    const view=viewer('knot-view',10.4);
    class FigureEight extends THREE.Curve{getPoint(t,target=new THREE.Vector3()){return target.set(...figureEight(t*2*Math.PI));}}
    const geometry=new THREE.TubeGeometry(new FigureEight(),384,.115,16,true);
    const material=new THREE.MeshStandardMaterial({color:0x6b7b8e,roughness:.32,metalness:.2});
    view.model.add(new THREE.Mesh(geometry,material));view.refresh();
  }
  for(const [init,id] of [[sphere,'sphere-view'],[knot,'knot-view']])try{init();}catch(error){$(id).textContent='The 3D view needs WebGL enabled in your browser.';console.error(error);}
}
initThree().catch(error=>{for(const id of ['sphere-view','knot-view'])$(id).textContent='The 3D view could not load. Please reload to try again.';console.error(error);});
