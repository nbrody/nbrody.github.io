/** VR adaptation of the GOLG explorer's fixed-point reference orbit,
 * perturbation/rebasing, float-data pass, adaptive palette, and relief shading.
 * Work is issued in fenced bands; the offscreen buffer is preserved for XR.
 */
import { BITS, fx, fd } from './fixed.js';
import { PALETTES, paletteLUT } from './landmarks.js';
const VS=`#version 300 es
const vec2 P[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
void main(){gl_Position=vec4(P[gl_VertexID],0.,1.);}`;
const DATA=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D u_ref;uniform int u_refLen,u_maxIter;uniform bool u_refEscaped,u_debug;
uniform vec2 u_dc0;uniform float u_span,u_res;out vec4 o;
vec2 cmul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 refZ(int m){return texelFetch(u_ref,ivec2(m & 4095,m >> 12),0).rg;}
void main(){
 vec2 dc=u_dc0+(gl_FragCoord.xy/u_res-.5)*u_span;
 vec2 d=vec2(0.),z=vec2(0.),D=vec2(0.),Z=vec2(0.);int m=0,n=0,state=0;float r2=0.;
 for(n=0;n<u_maxIter;n++){
  D=2.*cmul(z,D)+vec2(u_span,0.);d=cmul(2.*Z+d,d)+dc;m++;Z=refZ(m);z=Z+d;r2=dot(z,z);
  if(r2>1.e6){state=1;break;}
  if(r2<dot(d,d)){d=z;m=0;Z=vec2(0.);}
  else if(m>=u_refLen-1){if(u_refEscaped){state=2;break;}d=z;m=0;Z=vec2(0.);}
 }
 if(state==2){o=vec4(-2.,0.,0.,0.);return;}
 if(state==0){o=vec4(-1.,0.,0.,0.);return;}
 if(u_debug){o=vec4(float(n+1),0.,0.,0.);return;}
 float lz=.5*log(r2),nu=max(float(n+1)+1.-log2(lz),0.);
 float Dmax=max(abs(D.x),abs(D.y));vec2 Ds=D/Dmax;
 float b=2.*sqrt(r2)*lz/(Dmax*length(Ds));if(!(b>=0.)||b>1.e30)b=1.e30;
 vec2 u=vec2(z.x*Ds.x+z.y*Ds.y,z.y*Ds.x-z.x*Ds.y);float ul=length(u);
 o=vec4(nu,b,ul>0.?u/ul:vec2(0.));
}`;
const COLOR=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D u_data,u_previous,u_pal;uniform vec3 u_interior,u_edge;uniform vec2 u_win;uniform float u_res,u_dataRes,u_prevRes,u_done;uniform bool u_debug,u_hasPrev;out vec4 o;
void main(){
 vec2 uv=gl_FragCoord.xy/u_res;ivec2 xy=ivec2(uv*u_dataRes);
 vec4 d=(u_hasPrev&&float(xy.y)>=u_done)?texelFetch(u_previous,ivec2(uv*u_prevRes),0):texelFetch(u_data,xy,0);
 if(d.x < -1.5){o=vec4(1.,0.,.75,.5);return;}
 if(u_debug){int count=d.x<0.?16777215:int(d.x);o=vec4(float(count&255)/255.,float((count>>8)&255)/255.,float((count>>16)&255)/255.,1.);return;}
 if(d.x<0.){o=vec4(u_interior,1.);return;}
 float t=max(d.x-u_win.x,0.)*u_win.y;vec3 c=texture(u_pal,vec2(t,.5)).rgb;
 float l=(dot(d.zw,vec2(.70710678)) + 1.4)/2.4;c*=.42+.72*clamp(l,0.,1.);
 float px=d.y*u_res;c=mix(c,u_edge,.8*(1.-smoothstep(.15,.9,px)));
 o=vec4(c,1.);
}`;
const MIN_WIDTH=1e-30,MAX_ITER=250000,BAIL2=1e6,RETRIES=3;
function compile(gl,type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
function makeProgram(gl,fs){const p=gl.createProgram(),v=compile(gl,gl.VERTEX_SHADER,VS),f=compile(gl,gl.FRAGMENT_SHADER,fs);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));gl.deleteShader(v);gl.deleteShader(f);return p;}
export const iterationsFor=w=>Math.min(MAX_ITER,Math.max(64,Math.round(400+70*Math.max(0,Math.log10(4/w))**1.7)));
export const precisionFor=w=>w>1e-11?53:32*Math.ceil((Math.log2(1/w)+64)/32);
export function createDeepZoom({size=384,onUpdate=()=>{},onStatus=()=>{},debug=false,fixedIterations=null,previewSize=null}={}){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
 const gl=canvas.getContext('webgl2',{antialias:false,alpha:true,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
 if(!gl)throw new Error('Deep zoom requires WebGL 2.');
 if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('Deep zoom requires EXT_color_buffer_float.');
 if(gl.getParameter(gl.MAX_TEXTURE_SIZE)<4096)throw new Error('This GPU cannot hold the reference orbit texture.');
 gl.disable(gl.DITHER);
 const dataProgram=makeProgram(gl,DATA),colorProgram=makeProgram(gl,COLOR);
 const U=Object.fromEntries(['u_ref','u_refLen','u_maxIter','u_refEscaped','u_dc0','u_span','u_res','u_debug'].map(n=>[n,gl.getUniformLocation(dataProgram,n)]));
 const C=Object.fromEntries(['u_data','u_previous','u_pal','u_interior','u_edge','u_win','u_res','u_dataRes','u_prevRes','u_done','u_debug','u_hasPrev'].map(n=>[n,gl.getUniformLocation(colorProgram,n)]));
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);
 const layers=Array.from({length:2},()=>{
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA32F,size,size);
  const fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Float render target unavailable.');return {tex,fbo};
 });gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 const lowRes=previewSize===null?(debug?size:Math.min(size,128)):Math.min(size,Math.max(1,previewSize));let display={layer:0,res:lowRes,done:0,prev:false};
 function clearLayer(index){gl.bindFramebuffer(gl.FRAMEBUFFER,layers[index].fbo);gl.disable(gl.SCISSOR_TEST);gl.clearBufferfv(gl.COLOR,0,new Float32Array([-1,0,0,0]));gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
 const paletteTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,paletteTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
 let palette=0,windowRange=[1.5,40];
 function uploadPalette(){gl.bindTexture(gl.TEXTURE_2D,paletteTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,512,1,0,gl.RGBA,gl.UNSIGNED_BYTE,paletteLUT(PALETTES[palette]));}
 const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);uploadPalette();
 let worker=null,workerPending=false,texture=null,fence=null,sequence=0,view=null,job=null,disposed=false,dirty=false,lastUpload=0,hasPreview=false;
 canvas.addEventListener('webglcontextlost',()=>{sequence++;hasPreview=false;workerPending=false;job=null;fence=null;if(worker)worker.terminate();onStatus('Graphics context lost. Reload to continue.');});
 const cleanFence=()=>{if(fence){gl.deleteSync(fence);fence=null;}};
 function paint(){
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,size,size);gl.disable(gl.SCISSOR_TEST);gl.useProgram(colorProgram);gl.bindVertexArray(vao);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,layers[display.layer].tex);gl.uniform1i(C.u_data,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,paletteTexture);gl.uniform1i(C.u_pal,1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,layers[0].tex);gl.uniform1i(C.u_previous,2);
  gl.uniform1f(C.u_dataRes,display.res);gl.uniform1f(C.u_prevRes,lowRes);gl.uniform1f(C.u_done,display.done);gl.uniform1i(C.u_hasPrev,display.prev?1:0);
  gl.uniform3fv(C.u_interior,rgb(PALETTES[palette].interior));gl.uniform3fv(C.u_edge,rgb(PALETTES[palette].edge));
  gl.uniform2f(C.u_win,windowRange[0],1/Math.max(1,windowRange[1]-windowRange[0]));gl.uniform1f(C.u_res,size);gl.uniform1i(C.u_debug,debug?1:0);gl.drawArrays(gl.TRIANGLES,0,3);dirty=true;
 }
 function request(refCenter){
  if(worker)worker.terminate();worker=new Worker(new URL('./orbit-worker.js',import.meta.url),{type:'module'});
  const id=++sequence,snap=view,N=fixedIterations??iterationsFor(snap.width),prec=precisionFor(snap.width/64);
  workerPending=true;onStatus('Computing reference orbit…');
  worker.onmessage=e=>{
   if(disposed||id!==sequence)return;
   workerPending=false;const r=e.data,rows=Math.ceil(r.len/4096),data=new Float32Array(4096*rows*2);data.set(r.orbit);
   if(texture)gl.deleteTexture(texture);texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texImage2D(gl.TEXTURE_2D,0,gl.RG32F,4096,rows,0,gl.RG,gl.FLOAT,data);
   job={id,N,refCenter,len:r.len,escaped:r.escaped,row:0,res:lowRes,layer:0};display={layer:0,res:lowRes,done:0,prev:false};cleanFence();
   clearLayer(0);paint();onStatus('Rendering preview…');
  };
  worker.onerror=()=>{if(id===sequence){workerPending=false;onStatus('Reference orbit failed.');}};
  worker.postMessage({id,cx:refCenter[0].toString(),cy:refCenter[1].toString(),bits:BITS,prec,maxIter:N,bail2:BAIL2});
 }
 function setView(center,width){if(disposed)return;width=Math.max(MIN_WIDTH,Math.min(12,width));view={center:[...center],width,retries:0};job=null;hasPreview=false;cleanFence();display={layer:0,res:lowRes,done:0,prev:false};clearLayer(0);paint();onUpdate();request(view.center);}
 function inspect(j){
  const n=j.res;const data=new Float32Array(n*n*4);gl.bindFramebuffer(gl.FRAMEBUFFER,layers[j.layer].fbo);gl.readPixels(0,0,n,n,gl.RGBA,gl.FLOAT,data);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  let best=-1,dist=Infinity;const sample=[];const step=Math.max(1,Math.floor(n*n/30000));
  for(let i=0;i<n*n;i++){const v=data[4*i];if(v===-2){const x=i%n-n/2,y=Math.floor(i/n)-n/2,d=x*x+y*y;if(d<dist){dist=d;best=i;}}else if(v>=0&&i%step===0)sample.push(v);}
  if(!debug&&sample.length>20){sample.sort((a,b)=>a-b);const lo=sample[Math.floor(sample.length*.03)],hi=sample[Math.floor(sample.length*.97)];windowRange=[lo,Math.max(hi,lo+4)];}
  return best;
 }
 function update(now=performance.now()){
  if(disposed||!view)return;
  if(fence){const ready=gl.clientWaitSync(fence,0,0);if(ready===gl.TIMEOUT_EXPIRED)return;cleanFence();if(ready===gl.WAIT_FAILED){onStatus('GPU synchronization failed.');job=null;return;}}
  if(job&&job.row>=job.res){
   const finished=job,bad=inspect(finished);job=null;
   if(bad>=0&&view.retries<RETRIES){view.retries++;const u=((bad%finished.res)+.5)/finished.res,v=(Math.floor(bad/finished.res)+.5)/finished.res;request([view.center[0]+fx((u-.5)*view.width),view.center[1]+fx((v-.5)*view.width)]);return;}
   if(finished.layer===0)hasPreview=true;
   if(finished.layer===0&&lowRes<size&&bad<0){
    paint();onUpdate();clearLayer(1);
    job={...finished,row:0,res:size,layer:1};display={layer:1,res:size,done:0,prev:true};onStatus('Rendering detail…');
   }else{paint();onStatus(bad>=0?'Some magenta pixels could not be resolved.':'Ready');}
  }
  if(job){
   const rows=Math.min(job.res-job.row,Math.max(1,Math.floor(2e6/(job.res*job.N))));
   gl.bindFramebuffer(gl.FRAMEBUFFER,layers[job.layer].fbo);gl.useProgram(dataProgram);gl.bindVertexArray(vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.uniform1i(U.u_debug,debug?1:0);gl.uniform1i(U.u_ref,0);gl.uniform1i(U.u_refLen,job.len);gl.uniform1i(U.u_refEscaped,job.escaped?1:0);gl.uniform1i(U.u_maxIter,job.N);
   gl.uniform2f(U.u_dc0,fd(view.center[0]-job.refCenter[0]),fd(view.center[1]-job.refCenter[1]));gl.uniform1f(U.u_span,view.width);gl.uniform1f(U.u_res,job.res);
   gl.viewport(0,0,job.res,job.res);gl.enable(gl.SCISSOR_TEST);gl.scissor(0,job.row,job.res,rows);gl.drawArrays(gl.TRIANGLES,0,3);gl.disable(gl.SCISSOR_TEST);job.row+=rows;display.done=job.row;
   paint();fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
  }
  if(dirty&&(now-lastUpload>100||!job)){dirty=false;lastUpload=now;onUpdate();}
 }
 return {canvas,setView,update,setPalette(i){palette=((i%PALETTES.length)+PALETTES.length)%PALETTES.length;uploadPalette();paint();onUpdate();},
  readPixel(x,y){const p=new Uint8Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(p);},
  get busy(){return !!job||!!workerPending;},
  get ready(){return hasPreview;},
  dispose(){disposed=true;sequence++;if(worker)worker.terminate();cleanFence();if(texture)gl.deleteTexture(texture);for(const l of layers){gl.deleteTexture(l.tex);gl.deleteFramebuffer(l.fbo);}gl.deleteTexture(paletteTexture);gl.deleteProgram(dataProgram);gl.deleteProgram(colorProgram);gl.deleteVertexArray(vao);}};
}
