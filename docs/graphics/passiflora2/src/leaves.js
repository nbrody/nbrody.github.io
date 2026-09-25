import * as THREE from 'three';
import { leafVertex, leafFragment } from './shaders/leaf.js';

// placements: [{ pos:[x,y,z], rot:[x,y,z], scale }]
export function createLeaves(shared, placements) {
  const plane = new THREE.PlaneGeometry(1, 1, 64, 24);
  const geo = new THREE.BufferGeometry();
  geo.index = plane.index;
  geo.setAttribute('position', plane.attributes.position);
  geo.setAttribute('uv', plane.attributes.uv);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(
    new Float32Array(placements.map((_, i) => i * 1.37 + 0.2)), 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: leafVertex, fragmentShader: leafFragment,
    uniforms: shared, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  placements.forEach((p, i) => {
    q.setFromEuler(e.set(...p.rot));
    m.compose(new THREE.Vector3(...p.pos), q, new THREE.Vector3(p.scale, p.scale, p.scale));
    mesh.setMatrixAt(i, m);
  });
  mesh.frustumCulled = false;
  return mesh;
}
