import {vertex, fragment} from './shader.js';
import {buildFoliage,studyGeometry,foliageVertex,foliageFragment} from './foliage.js';
import {SPECIES,GROWTH_SPECS,buildTree} from './species.js';
document.body.classList.toggle('embedded', window.self !== window.top);
const $ = id => document.getElementById(id);
const shapeSpecs = [
  ['height','Trunk height',.7,2.4,1.45,0],
  ['radius','Crown radius',.45,1.2,.85,0],
  ['spread','Branch spread',.3,1.3,.85,1],
  ['amplitude','Wave amplitude',0,.3,.14,2],
  ['frequency','Wave frequency',1,7,3.5,2],
  ['detail','Leaf size',.5,1.8,1,3],
  ['leafDensity','Foliage density',20,120,65,3],
];
const specs = [...shapeSpecs,...GROWTH_SPECS];
const stages = [
  ['Simple primitives','A capsule makes the trunk; a sphere makes the crown. Change their proportions to find the simplest silhouette of a tree.','trunk = capsule(p, height, 0.13)\ncrown = length(p − center) − radius\ntree  = min(trunk, crown)'],
  ['A branching silhouette','Five capsule branches reach into smaller spheres. Smooth unions merge the crown clusters into one organic shape.','branchᵢ = capsule(p, root, tipᵢ, 0.065)\ncrown = smin(crown, clusterᵢ, 0.22)\nwood  = smin(trunk, branches, 0.12)\ntree  = min(wood, crown)'],
  ['Shape from sine waves','Add two weighted products of sine waves to the crown field. Amplitude controls depth; frequency controls the size of its lobes.','W(p,f) = [sin(fx+.5)sin(fy)sin(fz+1)\n + ½sin(1.93fx−1)sin(1.93fy+.7)\n     sin(1.93fz)] / 1.5\ncrown += amplitude × W(p, frequency)'],
  ['Leaves & needles','Twigs carry individual SDF-cut leaves. Redwood uses two rows of flat needles; juniper and cypress use overlapping scale-leaved branchlets. Leaf size and density control the foliage, with real gaps between shoots.','twig = capsule(root, tip)\nleaf = tapered ellipse on twig plane\nfoliage = union(twig, repeated leaves)\ndepth test against the woody skeleton'],
];
const values = Object.fromEntries(specs.map(s=>[s[0],s[4]]));
let species='redwood';
let playing=false, elapsed=0, stage=0, yaw=.5, pitch=.12, distance=8.3;
let dirty=true, visible=true, contextLost=false;
const inputs = {};
for(const [key,label,min,max,value,level,hint] of specs){
 const row=document.createElement('div');row.className='parameter';row.id=`row-${key}`;
 row.innerHTML=`<label for="${key}">${label}<output id="value-${key}" for="${key}">${value.toFixed(2)}</output></label><input type="range" id="${key}" min="${min}" max="${max}" step="${key==='leafDensity'?1:.001}" value="${value}">`;
 if(hint){const help=document.createElement('small');help.textContent=hint;row.append(help);}
 $(hint?'growthParameters':'parameters').append(row);inputs[key]=$(key);
 if(hint){const option=document.createElement('option');option.value=key;option.textContent=label;$('animate').append(option);}
 inputs[key].addEventListener('input',()=>{setPlaying(false);values[key]=+inputs[key].value;updateValues();});
}
function updateValues(){for(const [key] of specs){inputs[key].value=values[key];$(`value-${key}`).value=key==='angle'?`${values[key].toFixed(0)}°`:values[key].toFixed(key==='leafDensity'?0:2);}dirty=true;}
function setPlaying(value){playing=value;$('play').textContent=value?'Ⅱ Pause variation':'▶ Play variation';$('play').setAttribute('aria-pressed',String(value));for(const [key] of specs)$(`row-${key}`).classList.toggle('active',value&&$('animate').value===key);}
function selectStage(){
 stage=Math.max(0,Math.min(3,Number.parseInt($('stage').value,10)||0));$('stage').value=stage;setPlaying(false);
 const native=species!=='study';
 const title=native?['Trunk & crown envelope','Branch architecture','Broad sine waves','Leaves & needles'][stage]:stages[stage][0];
 const description=stage===3?stages[3][1]:native?(stage===0?'A tapered trunk and one ellipsoid describe the overall proportions. Add the next layer to reveal the species architecture.':SPECIES[species].description):stages[stage][1];
 $('lessonTitle').textContent=`${SPECIES[species].name} · ${title}`;$('lessonText').textContent=description;
 $('stageNumber').textContent=`0${stage+1} / 04`;
 $('stageCaption').textContent=title;$('explanation').textContent=description;
 $('formula').textContent=native&&stage<2?'wood = union(tapered branch segments)\ncrown = smoothUnion(ellipsoid clusters)\ntree = min(wood, crown)':stages[stage][2];
 for(const [key,,,,,level,hint] of specs){
  const disabled=level>stage||Boolean(hint&&!native)||(stage===3&&['amplitude','frequency'].includes(key));
  inputs[key].disabled=disabled;$(`row-${key}`).classList.toggle('inactive',disabled);
  $('animate').querySelector(`option[value="${key}"]`).disabled=disabled;
 }
 if(inputs[$('animate').value].disabled)$('animate').value='height';
 $('closeup').disabled=stage!==3;if(stage!==3)$('closeup').checked=false;
 $('growthSection').hidden=!native;
 $('previous').disabled=stage===0;$('next').disabled=stage===3;dirty=true;
}
function resetParameters(){
 setPlaying(false);for(const s of specs)values[s[0]]=SPECIES[species].defaults[s[0]]??s[4];
 yaw=.5;pitch=.12;distance=species==='study'?7.5:8.3;
 $('orbit').checked=false;$('skeleton').checked=false;$('closeup').checked=false;updateValues();
}
function selectSpecies(){
 if(!Object.hasOwn(SPECIES,$('species').value)){$('species').value=species;return;}
 species=$('species').value;const data=SPECIES[species];resetParameters();
 $('latin').textContent=data.latin;$('speciesDescription').textContent=data.description;$('drivers').textContent=data.drivers;
 $('specimenName').textContent=data.name.toUpperCase();$('sources').replaceChildren();
 for(const [label,url] of data.sources){const li=document.createElement('li'),a=document.createElement('a');a.href=url;a.textContent=label;a.target='_blank';a.rel='noopener';li.append(a);$('sources').append(li);}
 // Open species with their explicit foliage visible.
 $('stage').value=species==='study'?0:3;selectStage();
}
$('species').addEventListener('change',selectSpecies);
$('skeleton').addEventListener('change',()=>dirty=true);
$('closeup').addEventListener('change',()=>dirty=true);
$('stage').addEventListener('change',selectStage);
$('previous').onclick=()=>{$('stage').value=Math.max(0,stage-1);selectStage();};
$('next').onclick=()=>{$('stage').value=Math.min(3,stage+1);selectStage();};
function startVariation(){const s=specs.find(s=>s[0]===$('animate').value);if(s[6]&&species==='study')return;
 if(stage===3&&['amplitude','frequency'].includes(s[0])){$('stage').value=2;selectStage();}
 if(s[5]>stage){$('stage').value=s[5];selectStage();}
 $('animate').value=s[0];elapsed=Math.acos(Math.max(-1,Math.min(1,1-2*(values[s[0]]-s[2])/(s[3]-s[2]))))/.6;setPlaying(true);}
$('play').onclick=()=>playing?setPlaying(false):startVariation();
$('animate').onchange=()=>{if(playing)startVariation();};
$('reset').onclick=resetParameters;
selectSpecies();
const canvas=$('scene');
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;$('renderStatus').textContent='Graphics context lost. Reload this page to restart the tree.';});
let drag;
canvas.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.007;pitch=Math.max(-.12,Math.min(.85,pitch+(e.clientY-drag.y)*.006));drag.x=e.clientX;drag.y=e.clientY;dirty=true;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(5.,Math.min(18.,distance+e.deltaY*.007));dirty=true;},{passive:false});
window.addEventListener('resize',()=>dirty=true);
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;dirty=true;});
try {
 const gl=canvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:true});
 if(!gl)throw new Error('WebGL is unavailable. Enable hardware acceleration or try another browser.');
 if(!gl.getExtension('EXT_frag_depth'))throw new Error('This tree renderer needs WebGL fragment depth support.');
 if(!gl.getExtension('OES_standard_derivatives'))throw new Error('This tree renderer needs WebGL shader derivatives.');
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
 function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;}
 const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
 gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const uniform=name=>gl.getUniformLocation(program,name);
 const uniforms=Object.fromEntries([...shapeSpecs.map(s=>'u'+s[0][0].toUpperCase()+s[0].slice(1)),'uStage','uResolution','uCamera','uOffset','uTarget','uSpecies','uBranchCount','uCrownCount','uBranchA[0]','uBranchB[0]','uCrown[0]','uCrownR[0]','uBranchBound','uSkeleton','uFoliageColor','uBarkColor','uBounds'].map(name=>[name,uniform(name)]));
 const leaves=gl.createProgram();gl.attachShader(leaves,compile(gl.VERTEX_SHADER,foliageVertex));gl.attachShader(leaves,compile(gl.FRAGMENT_SHADER,foliageFragment));gl.linkProgram(leaves);
 if(!gl.getProgramParameter(leaves,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(leaves));
 const leafBuffer=gl.createBuffer(),leafAttributes=[['aPosition',3,0],['aUV',2,3],['aInfo',4,5],['aNormal',3,9]].map(([name,size,offset])=>[gl.getAttribLocation(leaves,name),size,offset]);
 const leafUniforms=Object.fromEntries(['uCamera','uResolution','uOffset','uTarget','uFoliageColor','uBarkColor'].map(name=>[name,gl.getUniformLocation(leaves,name)]));
 let foliageKey='',leafCount=0;
 let last=0;
 function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;if(!visible||contextLost)return;
  if(playing){elapsed+=dt;const s=specs.find(s=>s[0]===$('animate').value);values[s[0]]=s[2]+(s[3]-s[2])*(.5-.5*Math.cos(elapsed*.6));updateValues();}
  if($('orbit').checked){yaw+=dt*.16;dirty=true;}
  if(!dirty)return;dirty=false;
  const rect=canvas.getBoundingClientRect(),scale=Math.min(devicePixelRatio,1.5,1000/rect.width);
  const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  for(const [location] of leafAttributes)gl.disableVertexAttribArray(location);
  gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.uniform2f(uniforms.uResolution,width,height);
  const panelVisible=getComputedStyle($('controls')).display!=='none'&&rect.width>700;
  gl.uniform1f(uniforms.uOffset,panelVisible?350/rect.height:0);
  const geometry=species==='study'?studyGeometry(values):buildTree(species,values,stage);
  const target=$('closeup').checked?geometry.crowns[0].center[1]:(species==='study'?1.65:2.0);
  const cameraDistance=($('closeup').checked?2.3:distance)*Math.max(1,.75/(rect.width/rect.height));
  gl.uniform1f(uniforms.uTarget,target);
  gl.uniform3f(uniforms.uCamera,Math.sin(yaw)*cameraDistance*Math.cos(pitch),target+Math.sin(pitch)*cameraDistance,Math.cos(yaw)*cameraDistance*Math.cos(pitch));
  gl.uniform1i(uniforms.uSpecies,species==='study'?0:1);
  gl.uniform1f(uniforms.uSkeleton,$('skeleton').checked?1:0);
  gl.uniform3fv(uniforms.uFoliageColor,SPECIES[species].foliage);gl.uniform3fv(uniforms.uBarkColor,SPECIES[species].bark);
  if(species!=='study'){
   gl.uniform1i(uniforms.uBranchCount,geometry.branches.length);gl.uniform1i(uniforms.uCrownCount,geometry.crowns.length);
   gl.uniform4fv(uniforms['uBranchA[0]'],geometry.a);gl.uniform4fv(uniforms['uBranchB[0]'],geometry.b);
   gl.uniform4fv(uniforms['uCrown[0]'],geometry.c);gl.uniform4fv(uniforms['uCrownR[0]'],geometry.r);
   gl.uniform1f(uniforms.uBranchBound,geometry.branchBound);
   // Conservative sphere includes the most stretched ellipsoid displacement.
   let radius=1;
   for(const branch of geometry.branches)for(const point of [branch.a,branch.b])radius=Math.max(radius,Math.hypot(point[0],point[1]-target,point[2])+Math.max(branch.r1,branch.r2)+.02);
   for(const crown of geometry.crowns){const max=Math.max(...crown.radii),min=Math.min(...crown.radii);const relief=(stage===2?values.amplitude:0)+.06;radius=Math.max(radius,Math.hypot(crown.center[0],crown.center[1]-target,crown.center[2])+max*(1+relief/min));}
   gl.uniform4f(uniforms.uBounds,0,target,0,radius);
  }else{gl.uniform1f(uniforms.uBranchBound,1);gl.uniform4f(uniforms.uBounds,0,1.65,0,4.5);}
  gl.uniform1i(uniforms.uStage,stage);
  for(const [key] of shapeSpecs)gl.uniform1f(uniforms['u'+key[0].toUpperCase()+key.slice(1)],values[key]);
  gl.drawArrays(gl.TRIANGLES,0,3);
  if(stage===3&&!$('skeleton').checked){
   const key=JSON.stringify([species,values]);
   gl.bindBuffer(gl.ARRAY_BUFFER,leafBuffer);
   if(key!==foliageKey){const data=buildFoliage(geometry,species,values.detail,values.leafDensity);gl.bufferData(gl.ARRAY_BUFFER,data.vertices,gl.DYNAMIC_DRAW);leafCount=data.vertices.length/12;foliageKey=key;canvas.dataset.shoots=data.shoots;}
   gl.useProgram(leaves);gl.disableVertexAttribArray(position);
   for(const [location,size,offset] of leafAttributes){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,48,offset*4);}
   gl.uniform2f(leafUniforms.uResolution,width,height);gl.uniform1f(leafUniforms.uOffset,panelVisible?350/rect.height:0);gl.uniform1f(leafUniforms.uTarget,target);
   gl.uniform3f(leafUniforms.uCamera,Math.sin(yaw)*cameraDistance*Math.cos(pitch),target+Math.sin(pitch)*cameraDistance,Math.cos(yaw)*cameraDistance*Math.cos(pitch));
   gl.uniform3fv(leafUniforms.uFoliageColor,SPECIES[species].foliage);gl.uniform3fv(leafUniforms.uBarkColor,SPECIES[species].bark);
   gl.drawArrays(gl.TRIANGLES,0,leafCount);
  }
  canvas.dataset.ready='true';$('renderStatus').textContent='';
 }
 requestAnimationFrame(frame);
} catch(error){$('renderStatus').textContent=`Unable to render: ${error.message}`;console.error(error);}
