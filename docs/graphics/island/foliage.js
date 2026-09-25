// Oriented twig planes, cut into individual leaves by analytic 2D distance fields.
// Every twig begins on the existing woody skeleton; no camera-facing particles.
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
export function buildFoliage(geometry,species,size=1,density=65){
 const vertices=[];
 const type=species==='redwood'?1:species==='juniper'?2:species==='cypress'?3:0;
 const corners=[[-1,0],[1,0],[-1,1.15],[-1,1.15],[1,0],[1,1.15]];
 let shoots=0;
 for(const [ci,crown] of geometry.crowns.entries()){
  const count=Math.max(12,Math.round(density*(.65+Math.min(1,Math.max(...crown.radii)))));
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,theta=i*2.3999632297+ci*1.73,ring=Math.sqrt(1-y*y);
   const local=[ring*Math.cos(theta)*crown.radii[0],y*crown.radii[1],ring*Math.sin(theta)*crown.radii[2]];
   const c=Math.cos(crown.angle),s=Math.sin(crown.angle);
   const tip=[crown.center[0]+c*local[0]-s*local[2],crown.center[1]+local[1],crown.center[2]+s*local[0]];
   // Closest attachment on a structural branch, rather than floating leaf clusters.
   let root=null,best=Infinity;
   for(const branch of geometry.branches){
    const d=sub(branch.b,branch.a),t=Math.max(0,Math.min(1,dot(sub(crown.center,branch.a),d)/dot(d,d)));
    const p=branch.a.map((v,j)=>v+t*d[j]),dist=Math.hypot(...sub(p,crown.center));
    if(dist<best){root=p;best=dist;}
   }
   const axis=sub(tip,root),length=Math.hypot(...axis);
   if(length<.06)continue;
   const along=unit(axis),reference=Math.abs(along[1])>.92?[0,0,1]:[0,1,0];
   let side=unit(cross(along,reference));
   // Variation changes the plane orientation, not the repeatable leaf arrangement.
   const other=cross(along,side),roll=(species==='redwood'?.25:.9)*Math.sin(i*1.71+ci);
   side=side.map((v,j)=>v*Math.cos(roll)+other[j]*Math.sin(roll));
   const width=Math.min(.23,Math.max(.08,length*.38))*size;
   const normal=unit(cross(side,along));
   const shade=.82+.18*((i*17+ci*13)%23)/22;
   for(const [x,t] of corners){
    const p=root.map((v,j)=>v+axis[j]*t+side[j]*x*width);
    vertices.push(...p,x*width,t*length,length,width,type,shade,...normal);
   }
   shoots++;
  }
 }
 return {vertices:new Float32Array(vertices),shoots};
}
export const foliageVertex=`
attribute vec3 aPosition, aNormal;
attribute vec2 aUV;
attribute vec4 aInfo;
uniform vec3 uCamera;
uniform vec2 uResolution;
uniform float uOffset,uTarget;
varying vec2 vUV;
varying vec4 vInfo;
varying vec3 vNormal;
void main(){
 vec3 forward=normalize(vec3(0.,uTarget,0.)-uCamera);
 vec3 right=normalize(cross(forward,vec3(0.,1.,0.))),up=cross(right,forward);
 vec3 d=aPosition-uCamera;
 float z=dot(d,forward),aspect=uResolution.x/uResolution.y;
 gl_Position=vec4((1.9*dot(d,right)+uOffset*z)/aspect,1.9*dot(d,up),1.002002*z-.2002002,z);
 vUV=aUV;vInfo=aInfo;vNormal=aNormal;
}`;
export const foliageFragment=`
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUV;
varying vec4 vInfo;
varying vec3 vNormal;
uniform vec3 uFoliageColor,uBarkColor;
float segment(vec2 p,vec2 a,vec2 b,float r){vec2 d=b-a;float t=clamp(dot(p-a,d)/dot(d,d),0.,1.);return length(p-a-t*d)-r;}
float blade(vec2 p,vec2 a,vec2 b,float width){
 vec2 axis=b-a;float len=length(axis);vec2 dir=axis/len;
 vec2 q=vec2(dot(p-(a+b)*.5,vec2(-dir.y,dir.x)),dot(p-(a+b)*.5,dir));
 return (length(q/vec2(width,len*.52))-1.)*min(width,len*.52);
}
void main(){
 float len=vInfo.x,w=vInfo.y,type=vInfo.z;
 vec2 p=vUV;
 float stem=segment(p,vec2(0.,0.),vec2(0.,len),.0025);
 float leaf=10.;
 // Redwood: two ranks of narrow flat needles on the outer portion of each twig.
 if(type<1.5){
  for(int i=0;i<9;i++){
   float t=float(i)/8.,y=len*(.26+.68*t),reach=w*(.94-.54*t);
   for(int side=0;side<2;side++){
    float signX=float(side)*2.-1.;
    vec2 a=vec2(0.,y),b=vec2(signX*reach,y+len*.08);
    leaf=min(leaf,blade(p,a,b,type<.5?w*.25:w*.13));
   }
  }
 }else{
  // Scale-leaved conifers: lateral branchlets with overlapping pointed scales.
  for(int j=0;j<5;j++){
   float t=float(j)/4.;
   for(int side=0;side<2;side++){
    float sx=float(side)*2.-1.;
    vec2 a=vec2(0.,len*(.24+.56*t));
    vec2 b=a+vec2(sx*w*(.92-.38*t),len*(type>2.5?.18:.26));
    stem=min(stem,segment(p,a,b,.0018));
    vec2 d=normalize(b-a),perp=vec2(-d.y,d.x);
    for(int k=0;k<5;k++){
     vec2 center=mix(a,b,(float(k)+.5)/5.);
     float stagger=mod(float(k),2.)*2.-1.;
     leaf=min(leaf,blade(p,center-d*w*.11,center+d*w*.22+perp*stagger*w*.1,w*.15));
    }
   }
  }
 }
 float d=min(stem,leaf),aa=max(fwidth(d),.00025);
 if(d>aa)discard;
 float foliage=step(leaf,stem);
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 float light=.45+.55*abs(dot(n,normalize(vec3(-.6,1.,.7))));
 vec3 col=mix(uBarkColor,uFoliageColor*vInfo.w*1.5,foliage)*light;
 col+=uFoliageColor*.14*foliage;
 gl_FragColor=vec4(pow(col,vec3(.88)),1.-smoothstep(-aa,aa,d));
}`;
export function studyGeometry(p){
 const branches=[{a:[0,.13,0],b:[0,p.height+.25,0],r1:.13,r2:.13}];
 const crowns=[{center:[0,p.height+p.radius*.65,0],radii:[p.radius,p.radius,p.radius],angle:0}];
 for(let i=0;i<5;i++){
  const angle=i*2.39996,tip=[Math.cos(angle)*p.spread,p.height+.15+i*.14,Math.sin(angle)*p.spread];
  branches.push({a:[0,p.height*.55,0],b:tip,r1:.065,r2:.065});
  crowns.push({center:tip.map((v,j)=>v+(j===1?p.radius*.35:0)),radii:Array(3).fill(p.radius*.68),angle:0});
 }
 return {branches,crowns};
}
