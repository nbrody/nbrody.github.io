// Analytic markings: distances to curved vein segments, wing margins and spots.
// No raster textures or canvas painting. Uses the flower's world-space lighting.
export const monarchVertexShader = /* glsl */`
 varying vec2 vWing;
 varying vec3 vNormal;
 varying vec3 vPosition;
 varying vec2 vUv;
 void main(){
   vWing=position.xy;vUv=uv;
   vNormal=normalize(mat3(modelMatrix)*normal);
   vec4 world=modelMatrix*vec4(position,1.);
   vPosition=world.xyz;
   gl_Position=projectionMatrix*viewMatrix*world;
 }
`;
const light = /* glsl */`
 vec3 shade(vec3 color, vec3 n, float relief){
   vec3 light=normalize(vec3(-.5,.8,1.5));
   vec3 viewDir=normalize(cameraPosition-vPosition);
   float diffuse=max(dot(n,light),0.);
   float transmission=max(dot(-n,light),0.);
   float sheen=pow(max(dot(n,normalize(light+viewDir)),0.),26.);
   return color*(.40+.65*diffuse+.23*transmission)*relief+vec3(.9,.95,.76)*sheen*.025;
 }
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
`;
export function wingFragmentShader(veins, edges, spots, pigment, islands){return /* glsl */`
 uniform vec4 uVeins[${veins}];
 uniform float uWidths[${veins}];
 uniform vec4 uEdges[${edges}];
 uniform vec4 uSpots[${spots}];
 uniform float uHind;
 uniform vec2 uPigment[${pigment}];
 uniform vec4 uIslands[${islands}];
 uniform float uIslandAngles[${islands}];
 varying vec2 vWing;
 varying vec3 vNormal;
 varying vec3 vPosition;
 varying vec2 vUv;
 ${light}
 float segment(vec2 p,vec4 s){vec2 d=s.zw-s.xy;return length(p-s.xy-d*clamp(dot(p-s.xy,d)/max(dot(d,d),.000001),0.,1.));}
 void main(){
   vec2 p=vWing;
   float vein=10.;float edge=10.;float spot=10.;
   for(int i=0;i<${veins};i++)vein=min(vein,segment(p,uVeins[i])-uWidths[i]);
   for(int i=0;i<${edges};i++)edge=min(edge,segment(p,uEdges[i]));
   for(int i=0;i<${spots};i++){
     vec4 s=uSpots[i];vec2 q=p-s.xy;
     // Slightly irregular oval scales, not a row of identical circles.
     spot=min(spot,(length(q/vec2(s.z,s.w))-1.)*min(s.z,s.w));
   }
   float aa=max(length(fwidth(p))*.5,.0005);
   float root=length(p-vec2(.08,.19));
   float width=0.;
   float margin=mix(.065,.10,smoothstep(.75,1.5,p.x));
   // Broaden the lower hindwing band to meet the traced vein endpoints.
   margin+=uHind*.13*(1.-smoothstep(-1.,-.50,p.y));
   float orange=smoothstep(width-aa,width+aa,vein)*smoothstep(margin-aa,margin+aa,edge);
   if(uHind<.5){
     float boundary=10.;bool inside=false;
     for(int i=0;i<${pigment};i++){
       vec2 a=uPigment[i],b=uPigment[(i+1)%${pigment}];
       boundary=min(boundary,segment(p,vec4(a,b)));
       if((a.y>p.y)!=(b.y>p.y)){
         if(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
       }
     }
     float mask=smoothstep(-aa,aa,inside?boundary:-boundary);
     orange*=mask;
     for(int i=0;i<${islands};i++){
       vec4 s=uIslands[i];float a=uIslandAngles[i];
       vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*(p-s.xy);
       float d=(length(q/s.zw)-1.)*min(s.z,s.w);
       orange=max(orange,1.-smoothstep(-aa,aa,d));
     }
   }
   // Soft warm centers and darker pigment beside each vein.
   float cell=smoothstep(.002,.042,vein-width)*smoothstep(.06,.12,edge);
   vec3 amber=mix(vec3(.62,.080,.003),vec3(.84,.16,.007),cell);
   amber=mix(amber,vec3(.93,.27,.025),uHind*.20*cell);
   float grain=hash(floor(p*1600.));
   float ridges=.5+.5*sin(p.y*2200.+sin(p.x*54.)*2.);
   vec3 black=vec3(.007,.008,.011);
   vec3 color=mix(black,amber,orange);
   float white=(1.-smoothstep(-aa,aa,spot))*(1.-smoothstep(margin-.01,margin+.015,edge));
   color=mix(color,vec3(.84,.79,.62),white);
   color*=.93+.10*grain+.035*ridges;
   vec3 n=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
   // Delicate relief at vein borders, matching the flower's surface detail.
   float relief=1.-.12*exp(-abs(vein-width)*130.);
   gl_FragColor=vec4(shade(color,n,relief),1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }
`;}
export const bodyFragmentShader = /* glsl */`
 uniform vec3 uColor;
 varying vec2 vWing;varying vec2 vUv;
 varying vec3 vNormal;varying vec3 vPosition;
 ${light}
 void main(){
   vec3 n=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
   float fuzz=hash(floor(vUv*vec2(260.,520.)));
   float rings=pow(.5+.5*cos(vUv.y*95.),18.);
   vec3 c=uColor*(.80+.23*fuzz)+vec3(.012)*rings;
   gl_FragColor=vec4(shade(c,n,1.),1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
 }
`;
