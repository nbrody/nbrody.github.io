#version 300 es
precision highp float;
precision highp sampler3D;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec3 uCamera, uTarget;
uniform sampler3D uNoise;
uniform float uCell, uFullness, uDetail, uGlow, uLine, uHaze;
const float PERIOD=768.;
float periodicNoise(vec3 p) { return texture(uNoise,p/PERIOD+vec3(0.5/32.)).r; }
float cloud(vec3 p) {
  float n=0.5+0.57*(periodicNoise(p)-0.5)+0.29*(periodicNoise(p*2.)-0.5)+0.14*uDetail*(periodicNoise(p*4.)-0.5);
  float y=clamp(p.y,-8.,42.);
  return max((0.5-n)*34.+0.018*(y-10.)*(y-10.)+1.5-uFullness,max(-8.-p.y,p.y-42.));
}
// Occupancy alone determines geometry: one full cube per interior sample.
bool occupied(vec3 cell) { return cloud((cell+0.5)*uCell)<0.; }
float trace(vec3 ro,vec3 rd,out vec3 normal) {
  float t=0.;
  vec3 stepSign=sign(rd);
  vec3 inv=1./max(abs(rd),vec3(1e-7));
  normal=vec3(0.,1.,0.);
  for(int i=0;i<2048;i++) {
    vec3 p=ro+rd*(t+0.0002);
    vec3 cell=floor(p/uCell);
    if(occupied(cell)) return t;
    vec3 face=(cell+step(vec3(0.),rd))*uCell;
    vec3 distances=(face-p)*stepSign*inv;
    float next=min(distances.x,min(distances.y,distances.z));
    vec3 axis=vec3(0.);
    if(distances.x<=distances.y && distances.x<=distances.z) axis.x=1.;
    else if(distances.y<=distances.z) axis.y=1.;
    else axis.z=1.;
    normal=-axis*stepSign;
    t+=max(next+0.0002,0.0003);
    if(t>190.) break;
    // No clouds outside the vertical slab, including voxel extension.
    if((p.y>42.+uCell && rd.y>=0.) || (p.y< -8.-uCell && rd.y<=0.)) break;
  }
  return -1.;
}
float occlusion(vec3 p, vec3 n) {
  float a=0.;
  for(int i=1;i<=4;i++) {
    float h=float(i)*0.45;
    a += max(0.,h-cloud(p+n*h)) / (1.+float(i));
  }
  return clamp(1.-a*0.22,0.35,1.);
}
vec3 sky(vec3 rd) {
  float horizon=exp(-abs(rd.y+0.05)*5.);
  vec3 c=mix(vec3(0.014,0.024,0.043),vec3(0.10,0.07,0.055),horizon*0.6);
  vec3 sun=normalize(vec3(-0.65,0.35,-0.7));
  c += vec3(0.4,0.13,0.022)*pow(max(dot(rd,sun),0.),16.);
  return c * 0.24;
}
void main() {
  vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
  vec3 forward=normalize(uTarget-uCamera);
  vec3 right=normalize(cross(forward,vec3(0.,1.,0.)));
  vec3 up=cross(right,forward);
  vec3 rd=normalize(forward*1.9+right*uv.x+up*uv.y);
  vec3 color=sky(rd);
  vec3 n;
  float t=trace(uCamera,rd,n);
  if(t>0.) {
    vec3 p=uCamera+rd*t;

    vec3 light=normalize(vec3(-0.65,0.8,0.45));
    float diffuse=max(dot(n,light),0.);
    float ao=occlusion(p,n);
    vec3 graphite=vec3(0.055,0.084,0.098);
    color=graphite*(0.25+diffuse*1.5+max(n.y,0.)*0.35)*ao;
    color+=vec3(0.12,0.045,0.012)*pow(max(dot(reflect(-light,n),-rd),0.),24.);
    vec3 edgeDistance=abs(fract(p/uCell)-0.5);
    edgeDistance=(0.5-edgeDistance)*uCell;
    vec3 faceEdge=vec3(min(edgeDistance.y,edgeDistance.z),min(edgeDistance.x,edgeDistance.z),min(edgeDistance.x,edgeDistance.y));
    vec3 weights=pow(abs(n),vec3(6.));
    weights/=max(dot(weights,vec3(1.)),0.0001);
    float width=uLine*uCell;
    float ink=dot(weights,vec3(1.)-smoothstep(vec3(width*0.35),vec3(width*1.35),faceEdge));
    float glow=dot(weights,exp(-faceEdge/max(width*4.,0.001)));

    // Orange is the only emissive palette, across the entire morph range.
    vec3 orange=vec3(1.,0.105,0.006);
    color += uGlow*orange*(ink*2.3 + glow*0.22)*(0.7+ao*0.3);

    float fog=1.-exp(-t*t*0.00013*(0.3+uHaze));
    color=mix(color,sky(rd),fog);
  }
  color=vec3(1.)-exp(-color*1.35);
  color=pow(color,vec3(1./2.2));
  float vignette=1.-0.12*dot(uv,uv)/(1.+dot(uv,uv));
  fragColor=vec4(color*vignette,1.);
}
