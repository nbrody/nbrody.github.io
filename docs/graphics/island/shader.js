import {treeGLSL} from './tree.js';
export const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
export const fragment = `#extension GL_EXT_frag_depth : require
precision highp float;
uniform vec2 uResolution;
uniform vec3 uCamera;
uniform float uOffset, uTarget;
uniform vec3 uFoliageColor, uBarkColor;
uniform vec4 uBounds;
${treeGLSL}
vec3 normalAt(vec3 p){vec2 e=vec2(.002,0.);return normalize(vec3(treeField(p+e.xyy).x-treeField(p-e.xyy).x,treeField(p+e.yxy).x-treeField(p-e.yxy).x,treeField(p+e.yyx).x-treeField(p-e.yyx).x));}
void main(){
 vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
 uv.x-=uOffset;
 vec3 target=vec3(0.,uTarget,0.);
 vec3 forward=normalize(target-uCamera),right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
 vec3 rd=normalize(forward*1.9+right*uv.x+up*uv.y);
 vec3 col=mix(vec3(.065,.115,.112),vec3(.19,.255,.23),clamp(.5+uv.y*.28,0.,1.));
 float ground=rd.y<-.0001 ? -uCamera.y/rd.y : 40.;
 if(ground>0.&&ground<40.){
   vec3 p=uCamera+rd*ground;
   float grid=pow(abs(sin(p.x*3.14159)*sin(p.z*3.14159)),.06);
   col=mix(vec3(.16,.215,.19),vec3(.18,.24,.21),grid);
   col*=1.-.32*exp(-dot(p.xz,p.xz)/2.3);
   col=mix(col,vec3(.10,.16,.15),1.-exp(-ground*.027));
 }
 vec3 oc=uCamera-uBounds.xyz;
 float projection=dot(oc,rd), discriminant=projection*projection-dot(oc,oc)+uBounds.w*uBounds.w;
 float t=max(0.,-projection-sqrt(max(0.,discriminant)));
 float end=min(ground,-projection+sqrt(max(0.,discriminant)));
 float bound=treeStepBound(); bool hit=false;
 for(int i=0;i<220;i++){
   if(discriminant<0. || t>end)break;
   vec3 p=uCamera+rd*t;float d=treeField(p).x;
   if(d<.002){hit=true;break;}
   t+=max(d/bound,.001);
   if(t>end)break;
 }
 if(hit){
   vec3 p=uCamera+rd*t,n=normalAt(p),light=normalize(vec3(-.6,1.,.7));
   float foliage=treeField(p).y;
   vec3 base=mix(uBarkColor,uFoliageColor,foliage);
   float diffuse=max(0.,dot(n,light));
   float ao=clamp(treeField(p+n*.18).x/.18,.25,1.);
   col=base*(.32+.8*diffuse)*(.65+.35*ao);
   col+=vec3(.30,.37,.18)*pow(1.-max(dot(n,-rd),0.),3.)*.3;
 }
 col=pow(col,vec3(.88));
 col*=1.-.12*dot(uv,uv)/4.;
 float depthDistance=hit?t:ground;
 float viewZ=depthDistance*dot(rd,forward);
 gl_FragDepthEXT=(viewZ>0.&&depthDistance<100.)?clamp(1.001001-.1001001/viewZ,0.,1.):1.;
 gl_FragColor=vec4(col,1.);
}`;
