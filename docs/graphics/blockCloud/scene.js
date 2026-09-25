// Periodic noise shared by the shader's R8 3D texture and CPU flight clearance.
export const NOISE_SIZE = 32;
export const PERIOD = 768;
export const FIELD_LIPSCHITZ = 6;
export const CLOUD_BOTTOM = -8;
export const CLOUD_TOP = 42;
export function makeNoise(seed) {
  let state=seed>>>0;
  const data=new Uint8Array(NOISE_SIZE**3);
  for(let i=0;i<data.length;i++) { state=(Math.imul(state,1664525)+1013904223)>>>0; data[i]=state>>>24; }
  return data;
}
export function noiseAt(p,data) {
  const cell=p.map(Math.floor), f=p.map((v,i)=>v-cell[i]);
  let value=0;
  for(let z=0;z<2;z++) for(let y=0;y<2;y++) for(let x=0;x<2;x++) {
    const index=((cell[0]+x)&31)+32*(((cell[1]+y)&31)+32*((cell[2]+z)&31));
    value+=data[index]/255*(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);
  }
  return value;
}
export function cloudField(p,data,fullness=0.35,detail=0.65) {
  let n=0.5;
  for(const [scale,weight] of [[1,0.57],[2,0.29],[4,0.14*detail]]) n+=weight*(noiseAt(p.map(v=>v*scale/24),data)-0.5);
  const y=Math.max(CLOUD_BOTTOM,Math.min(CLOUD_TOP,p[1]));
  return Math.max((0.5-n)*34+0.018*(y-10)**2+1.5-fullness,CLOUD_BOTTOM-p[1],p[1]-CLOUD_TOP);
}
// Hold each cube scale for one interval, then switch without interpolation.
export function samplingAt(seconds,baseCell=1.5,intervalSeconds=10) {
  const scales=[1,0.25,4];
  const index=((Math.floor(seconds/intervalSeconds)%scales.length)+scales.length)%scales.length;
  const scale=scales[index];
  return {cell:baseCell*scale,density:scale**-3,scale};
}
export function clearanceAt(p,data,maxCell,fullness=0.35,detail=0.65) {
  // Field/L is a conservative empty-space radius. The slab distances are
  // tighter bounds above/below all clouds. Reserve half a voxel diagonal,
  // plus 0.15 world units for normalized R8 texture interpolation precision.
  const empty=Math.max(cloudField(p,data,fullness,detail)/FIELD_LIPSCHITZ,p[1]-CLOUD_TOP,CLOUD_BOTTOM-p[1]);
  return empty-Math.sqrt(3)*maxCell/2-0.15;
}
export const VIEW_PITCH = 12 * Math.PI / 180;
// Long straight stretches joined by gentle, eased left/right changes in course.
export function flightTrack(t) {
  const slopes=[0.18,-0.28,0.08,0.34,-0.12,-0.3,0.12,0.26];
  const segment=80, turn=20, cycle=segment*slopes.length;
  const integral=u=>u**6-3*u**5+2.5*u**4;
  const segmentDistance=(i,time)=>{
    const before=slopes[(i+slopes.length-1)%slopes.length], after=slopes[i];
    const u=Math.min(time/turn,1);
    return before*Math.min(time,turn)+(after-before)*turn*integral(u)+after*Math.max(0,time-turn);
  };
  const cycleDistance=slopes.reduce((sum,_,i)=>sum+segmentDistance(i,segment),0);
  const cycles=Math.floor(t/cycle), local=t-cycles*cycle;
  const index=Math.floor(local/segment), elapsed=local-index*segment;
  let z=26+cycles*cycleDistance;
  for(let i=0;i<index;i++) z+=segmentDistance(i,segment);
  z+=segmentDistance(index,elapsed);
  const u=Math.min(elapsed/turn,1), eased=u*u*u*(10+u*(-15+6*u));
  const before=slopes[(index+slopes.length-1)%slopes.length];
  return {x:t,z,slope:before+(slopes[index]-before)*eased};
}
export function cameraAt(t,data,baseCell=1.5,altitude=6,fullness=0.35,detail=0.65) {
  const maxCell=baseCell*4;
  // Global upper bound of this cloud layer: noise is in [0,1]. This fixed
  // ceiling includes the largest voxel of the density cycle, so resampling
  // never makes the camera bob or changes its clearance above the layer.
  const noiseWeight=0.57+0.29+0.14*detail;
  const smoothTop=Math.min(CLOUD_TOP,10+Math.sqrt(Math.max(0,(17*noiseWeight-1.5+fullness)/0.018)));
  const cloudCeiling=smoothTop+maxCell/2+0.15;
  const y=cloudCeiling+Math.max(2,altitude);
  const {x,z,slope}=flightTrack(t);
  const length=Math.hypot(1,slope), look=32;
  return {
    position:[x,y,z],
    target:[x+look/length,y-look*Math.tan(VIEW_PITCH),z+look*slope/length],
    clearance:y-cloudCeiling,
    cloudCeiling,
  };
}
