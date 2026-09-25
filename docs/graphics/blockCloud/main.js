import { makeNoise, cameraAt, samplingAt } from './scene.js';
const $ = id => document.getElementById(id);
const canvas = $('cloudCanvas');
const status = $('renderStatus');
let gl;
try {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This sky needs WebGL 2. Enable hardware acceleration or try another browser.');
  const response = await fetch('cloud.frag');
  if (!response.ok) throw new Error('The cloud shader could not be loaded. Reload to retry.');
  const fragment = await response.text();
  const vertex = `#version 300 es
  in vec2 position;
  void main() { gl_Position=vec4(position,0.,1.); }`;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const program = gl.createProgram();
  const vs=compile(gl.VERTEX_SHADER,vertex), fs=compile(gl.FRAGMENT_SHADER,fragment);
  gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vs); gl.deleteShader(fs); gl.useProgram(program);
  const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const attr=gl.getAttribLocation(program,'position');
  gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
  const uniform = name => gl.getUniformLocation(program,name);
  const locations = Object.fromEntries(['uResolution','uCamera','uTarget','uNoise','uCell','uFullness','uDetail','uGlow','uLine','uHaze'].map(n=>[n,uniform(n)]));
  const mapping = { fullness:'uFullness',detail:'uDetail',frameGlow:'uGlow',lineWidth:'uLine',haze:'uHaze' };
  let flightTime=0, morphTime=0, dirty=true, applyingPreset=false;
  let noiseData;
  const noiseTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D,noiseTexture);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  for(const wrap of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D,wrap,gl.REPEAT);
  gl.uniform1i(locations.uNoise,0);
  const presets = {
    cumulus: {cellSize:1.5,fullness:0.35,detail:0.65,frameGlow:1.5,lineWidth:0.035,haze:0.3,altitude:6},
    citadel: {cellSize:2.7,fullness:0.65,detail:0.5,frameGlow:1.7,lineWidth:0.025,haze:0.4,altitude:6},
    drift: {cellSize:0.85,fullness:0.35,detail:0.8,frameGlow:1.1,lineWidth:0.025,haze:0.35,altitude:6},
  };
  function resize() {
    const scale=Number($('quality').value)||0.8;
    // Fixed pixel budget: large displays and high-DPI phones remain practical.
    const limit=scale===1 ? 1500000 : scale===0.55 ? 350000 : 750000;
    const factor=Math.min(devicePixelRatio,1.5,Math.sqrt(limit/(innerWidth*innerHeight)))*scale;
    canvas.width=Math.max(1,Math.round(innerWidth*factor));
    canvas.height=Math.max(1,Math.round(innerHeight*factor));
    gl.viewport(0,0,canvas.width,canvas.height);
    dirty=true;
  }
  function regenerate() {
    const seed=Math.max(1,Math.min(99999,Math.round(Number($('seed').value)||2718)));
    $('seed').value=seed;
    noiseData=makeNoise(seed);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.R8,32,32,32,0,gl.RED,gl.UNSIGNED_BYTE,noiseData);
    dirty=true;
  }
  function sync(node) {
    if (node.type==='range') {
      const output=document.querySelector(`label[for="${node.id}"] output`);
      if(output) output.textContent=Number(node.value).toFixed(2);
    }
    if(node.id==='quality') resize();
    if(node.id==='seed') regenerate();


    if(!applyingPreset && Object.hasOwn(presets.cumulus,node.id)) $('scenePreset').value='custom';
    dirty=true;
  }
  function preset(name) {
    if(!presets[name]) return;

    applyingPreset=true;
    for(const [id,value] of Object.entries(presets[name])) { $(id).value=value; sync($(id)); }
    $('scenePreset').value=name;
    applyingPreset=false;
  }
  for(const node of document.querySelectorAll('input,select')) {
    node.addEventListener('input',()=>node.id==='scenePreset'?preset(node.value):sync(node));
  }
  $('newCloud').onclick=()=> { $('seed').value=1+crypto.getRandomValues(new Uint32Array(1))[0]%99999; regenerate(); };
  $('resetFlight').onclick=()=>{ flightTime=0; dirty=true; };
  window.addEventListener('keydown',e=> {
    if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if(e.key===' ') { e.preventDefault(); $('flightToggle').checked=!$('flightToggle').checked; }
    if(e.key.toLowerCase()==='r') { flightTime=0; dirty=true; }
  });
  window.addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost', e=> { e.preventDefault(); status.hidden=false; status.textContent='Graphics paused. Reload this visualization to restore the sky.'; });
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) { $('flightToggle').checked=false; $('morphToggle').checked=false; }
  preset('cumulus'); regenerate(); resize();
  for(const node of document.querySelectorAll('input[type=range]')) {
    const output=document.querySelector(`label[for="${node.id}"] output`);
    if(output) output.textContent=Number(node.value).toFixed(2);
  }
  let previous=performance.now(), lastRender=0;
  function render(now) {
    requestAnimationFrame(render);
    const elapsed=(now-previous)/1000;
    const dt=Math.min(elapsed,0.08); previous=now;
    if(document.hidden||gl.isContextLost()) return;
    const flying=$('flightToggle').checked && +$('flightSpeed').value>0;
    const morphing=$('morphToggle').checked;
    if(flying) flightTime+=dt*+$('flightSpeed').value*3;
    if(morphing) morphTime+=elapsed;
    if((!dirty&&!flying&&!morphing)||now-lastRender<32) return;
    lastRender=now; dirty=false;
    const sampling=samplingAt(morphTime,+$('cellSize').value,+$('cycleSeconds').value);
    const camera=cameraAt(flightTime,noiseData,+$('cellSize').value,+$('altitude').value,+$('fullness').value,+$('detail').value);
    gl.uniform1f(locations.uCell,sampling.cell);
    gl.uniform2f(locations.uResolution,canvas.width,canvas.height);
    gl.uniform3fv(locations.uCamera,camera.position);
    gl.uniform3fv(locations.uTarget,camera.target);
    for(const [id,key] of Object.entries(mapping)) gl.uniform1f(locations[key],+$(id).value);
    gl.drawArrays(gl.TRIANGLES,0,3);
    canvas.dataset.ready='true';
    canvas.dataset.clearance=camera.clearance.toFixed(3);
    canvas.dataset.cell=sampling.cell.toFixed(5);
    canvas.dataset.density=sampling.density.toFixed(5);
    canvas.dataset.camera=JSON.stringify(camera.position);
    $('samplingReadout').textContent=`${sampling.scale}× cube size · spacing ${sampling.cell.toFixed(2)}`;
    canvas.dataset.seed=$('seed').value;
    $('clearance').textContent=`at least ${camera.clearance.toFixed(1)} units`;
    status.hidden=true;
  }
  requestAnimationFrame(render);
} catch(error) {
  status.hidden=false;
  status.textContent=error.message;
  console.error('Block Cloud:',error);
}
