/**
 * A bounded tree of hyperbolic 3-spaces, rendered as spheres in the workbench.
 * Frames and cusp locations come from the desktop 2dimFields construction; the
 * scene here is deliberately independent of camera and input handling.
 */
import * as THREE from 'three';
import { FIELDS, circles } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';

const COLORS = [0xa8c8f3, 0x94d7c6, 0xd5b8ec, 0xf2c89c, 0x9ecbd8];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = a => scale(a, 1 / Math.hypot(...a));
const direction = (F, d) => add(add(scale(F.e1, d[0]), scale(F.e2, d[1])), scale(F.u, d[2]));
const point = (F, d) => add(F.c, scale(direction(F, d), F.R * 1.004));
const segment = (vertices, a, b) => vertices.push(...a, ...b);

/**
 * Create a disposable Three.js group for the precomputed finite tree.
 * @param {{recs: Array, field: 'i'|'omega', showCircles?: boolean}} options
 * @returns {{group: THREE.Group, meshes: THREE.InstancedMesh[], vertexOfHit: function, dispose: function}}
 */
export function createBallScene({ recs, field, showCircles = true }) {
  const K = FIELDS[field];
  if (!K) throw new Error(`Unknown ball field: ${field}`);
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const material = new THREE.MeshLambertMaterial({ transparent: true, opacity: .42, depthWrite: false });
  const balls = new THREE.InstancedMesh(geometry, material, recs.length);
  balls.name = 'hyperbolic-balls';
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const edges = [], decoration = [];
  // Circle enumeration is cached by the desktop field engine. Use the largest
  // circles and only decorate visible-sized spheres to keep Quest draw cost low.
  const decorations = showCircles ? circles(K, 2).slice(0, 30) : [];
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i], F = rec.F;
    balls.setMatrixAt(i, matrix.makeScale(F.R, F.R, F.R).setPosition(...F.c));
    balls.setColorAt(i, color.setHex(COLORS[rec.depth % COLORS.length]));
    if (rec.gap > 0) {
      const near = add(F.c, scale(F.u, F.R));
      segment(edges, near, add(near, scale(F.u, rec.gap)));
    }
    if (F.R < .1) continue;
    for (const { n, d, r } of decorations) {
      const axis = Math.abs(n[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
      const a = normalize(cross(n, axis)), b = cross(n, a);
      let previous = null;
      for (let j = 0; j <= 32; j++) {
        const t = 2 * Math.PI * j / 32;
        const local = add(scale(n, d), add(scale(a, r * Math.cos(t)), scale(b, r * Math.sin(t))));
        const next = point(F, local);
        if (previous) segment(decoration, previous, next);
        previous = next;
      }
    }
  }
  balls.instanceMatrix.needsUpdate = true;
  if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  group.add(balls);
  const resources = [geometry, material];
  function addLines(vertices, color, opacity) {
    if (!vertices.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    group.add(new THREE.LineSegments(g, m));
    resources.push(g, m);
  }
  addLines(edges, 0x765f55, .78);
  addLines(decoration, 0x405773, .68);
  let disposed = false;
  return {
    group,
    meshes: [balls],
    vertexOfHit: hit => hit?.object === balls && Number.isInteger(hit.instanceId) ? hit.instanceId : -1,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
