// All colors, veins, banding and lighting are procedural GLSL.
export const vertexShader = /* glsl */`
uniform float uTime;
uniform float uBreeze;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
void main(){
 vUv=uv;
 vec3 p=position;
 float bend=sin(uTime*1.1+p.x*1.4+p.y*.7)*.016*uBreeze;
 p.z+=bend*length(p.xy);
 vec4 world=modelMatrix*vec4(p,1.0);
 vPosition=world.xyz;
 vNormal=normalize(mat3(modelMatrix)*normal);
 gl_Position=projectionMatrix*viewMatrix*world;
}`;
export const fragmentShader = /* glsl */`
uniform vec3 uColor;
uniform float uKind;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPosition;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 vec3 n=normalize(vNormal)*(gl_FrontFacing?1.0:-1.0);
 vec3 light=normalize(vec3(-.5,.8,1.5));
 float diffuse=max(dot(n,light),0.0);
 float back=max(dot(-n,light),0.0);
 float grain=hash(floor(vPosition*550.0));
 vec3 c=uColor;
 if(uKind<.5){
  float t=vUv.y;
  float edge=pow(abs(vUv.x*2.-1.),3.);
  c=mix(vec3(.32,.44,.18),vec3(.64,.72,.43),smoothstep(0.,.55,t));
  // Linear-light colors: a stronger sage wash survives the bright lighting
  // and tone mapping, matching the broad green ends in the reference.
  c=mix(c,vec3(.28,.42,.17),smoothstep(.48,.96,t)*.85);
  c=mix(c,vec3(.38,.49,.19),edge*.40);
  float veins=pow(.5+.5*cos((vUv.x-.5)*100.+sin(t*14.)*.8),16.);
  c*=1.-.10*veins;
  c+=.09*exp(-abs(vUv.x-.5)*95.);
 }else if(uKind<1.5){
  float t=vUv.x;
  c=mix(vec3(.12,.018,.17),vec3(.27,.05,.33),smoothstep(0.,.29,t));
  c=mix(c,vec3(.91,.89,.79),smoothstep(.29,.36,t));
  c=mix(c,vec3(.46,.30,.83),smoothstep(.45,.53,t));
  c=mix(c,vec3(.72,.62,.97),smoothstep(.58,.96,t));
  c=mix(c,vec3(.94,.91,1.),smoothstep(.965,1.,t));
  c*=.87+.16*sin(t*110.+grain*3.);
 }else if(uKind<2.5){
  c*=.78+.28*grain;
  c+=.09*pow(.5+.5*sin(vUv.x*110.),8.);
 }else if(uKind<3.5){
  float dots=step(.69,sin(vUv.x*165.)*sin(vUv.y*46.));
  c=mix(c,vec3(.19,.035,.16),dots*.9);
 }
 c*=.94+.09*grain;
 vec3 viewDir=normalize(cameraPosition-vPosition);
 float spec=pow(max(dot(n,normalize(light+viewDir)),0.),35.);
 vec3 result=c*(.40+.65*diffuse+.23*back)+vec3(.9,.95,.76)*spec*.15;
 gl_FragColor=vec4(result,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
