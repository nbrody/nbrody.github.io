/** Boundary circles on the sphere of a hyperbolic 3-space.
 * These use the same projective complex coordinates and circle transforms as
 * the 2dimFields desktop viewer. A circle carries three projective points;
 * an isometry maps those points, which determine its new plane on the sphere.
 */
import { planeThrough } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';
import { capply, sphereOf, cSingular } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/cmobius.js';

const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale = (a,s) => [a[0]*s,a[1]*s,a[2]*s];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize = a => { const d=Math.hypot(...a); return d > 1e-12 ? scale(a,1/d) : null; };

export function mapBoundaryCircle(circle, transform) {
  if (!transform) return circle;
  if (cSingular(transform)) return null;
  const points = circle.pts.map(p => sphereOf(capply(transform,p)));
  if (!points.every(p => p.every(Number.isFinite))) return null;
  return planeThrough(...points);
}

/** Appends line segment endpoints into `out` in the ball's world-space frame. */
export function appendBoundaryCircle(out, frame, circle, segments) {
  const {n,d,r}=circle;
  const a=normalize(cross(n,Math.abs(n[2])<.9?[0,0,1]:[1,0,0]));
  if (!a) return;
  const b=cross(n,a), R=frame.R*1.004;
  const world = v => add(frame.c,scale(add(add(scale(frame.e1,v[0]),scale(frame.e2,v[1])),scale(frame.u,v[2])),R));
  let prev=null;
  for (let j=0;j<=segments;j++) {
    const t=2*Math.PI*j/segments, ct=Math.cos(t)*r, st=Math.sin(t)*r;
    const next=world(add(scale(n,d),add(scale(a,ct),scale(b,st))));
    if(prev)out.push(...prev,...next);
    prev=next;
  }
}
