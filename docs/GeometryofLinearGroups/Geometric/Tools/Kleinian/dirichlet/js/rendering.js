// rendering.js
// Three.js rendering code: scene setup, bisector drawing, polyhedron generation

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Complex, Matrix2, matrixToLatex, repWithNonnegativeRealTrace, keyFromNumber } from './geometry.js';
import { createWallMaterial, colorForIndex } from './textures.js';
import { imageOfBasepoint, computeOrbitPoints, computeDelaunayNeighbors, generateGroupElements } from './groups.js';

// Scene objects
let scene, camera, renderer, controls;
let polyhedronGroup = new THREE.Group();
let delaunayGroup = new THREE.Group();
let orbitGroup = new THREE.Group();
let limitSetGroup = new THREE.Group();
let floor;
const basepoint = new THREE.Vector3(0, 0, 1);

// Raycaster for picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Initialize Three.js scene
export function initScene(viewer) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, -5, 3);
  camera.up.set(0, 0, 1);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.localClippingEnabled = true;
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
  viewer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.copy(basepoint);

  // Enhanced lighting for more vibrant colors
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  // Hemisphere light for natural sky/ground fill
  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  // Additional rim light for definition
  const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
  backLight.position.set(-5, -5, 2);
  scene.add(backLight);

  const basepointGeom = new THREE.SphereGeometry(0.1, 16, 16);
  const basepointMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b });
  const basepointMesh = new THREE.Mesh(basepointGeom, basepointMat);
  basepointMesh.position.copy(basepoint);
  scene.add(basepointMesh);
  window.basepointMesh = basepointMesh;

  const bpBtn = document.getElementById('toggleBasepoint');
  basepointMesh.visible = bpBtn ? bpBtn.classList.contains('active') : false;

  // Opaque white plane slightly above the boundary (z = 0.05)
  const floorGeom = new THREE.PlaneGeometry(200, 200);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  floor = new THREE.Mesh(floorGeom, floorMat);
  floor.position.set(0, 0, 0.05);
  scene.add(floor);
  const floorBtn = document.getElementById('toggleFloor');
  floor.visible = floorBtn ? floorBtn.classList.contains('active') : false;

  scene.add(polyhedronGroup);
  scene.add(delaunayGroup);
  scene.add(orbitGroup);
  scene.add(limitSetGroup);

  window.addEventListener('resize', onWindowResize, false);
}

export function animate() {
  requestAnimationFrame(animate);
  controls.update();

  // Sort transparent walls back-to-front from camera to fix rendering artifacts
  if (polyhedronGroup && polyhedronGroup.children.length > 0) {
    polyhedronGroup.children.forEach(child => {
      if (child.isMesh) {
        child.renderOrder = 0;
      }
    });

    // Calculate distance from camera for each wall
    const cameraPos = camera.position;
    polyhedronGroup.children.forEach(child => {
      if (child.isMesh) {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        child._distanceToCamera = worldPos.distanceToSquared(cameraPos);
      }
    });

    // Sort back-to-front (farthest first)
    polyhedronGroup.children.sort((a, b) => {
      if (!a.isMesh || !b.isMesh) return 0;
      return (b._distanceToCamera || 0) - (a._distanceToCamera || 0);
    });
  }

  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Clear helper functions
function clearGroup(group) {
  while (group.children.length > 0) {
    const obj = group.children[0];
    group.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.dispose) obj.material.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m && m.dispose && m.dispose());
    }
  }
}

export function clearPolyhedron() { clearGroup(polyhedronGroup); }
export function clearDelaunay() { clearGroup(delaunayGroup); }
export function clearOrbit() { clearGroup(orbitGroup); }
export function clearLimitSet() { clearGroup(limitSetGroup); }

// Canonical key for the bisector between two points
function bisectorKeyFromPoints(p, q) {
  const eps = 1e-9;
  const xp = p.x, yp = p.y, zp = p.z;
  const xq = q.x, yq = q.y, zq = q.z;

  // Heights equal -> vertical plane with normal in xy-plane
  if (Math.abs(zp - zq) < eps) {
    const nx = xq - xp;
    const ny = yq - yp;
    const nlen = Math.hypot(nx, ny);
    if (nlen < eps) return null; // degenerate
    let n0x = nx / nlen, n0y = ny / nlen;

    const Sp = xp * xp + yp * yp + zp * zp;
    const Sq = xq * xq + yq * yq + zq * zq;
    const nlen2 = (xq - xp) * (xq - xp) + (yq - yp) * (yq - yp);
    const d = nlen2 < eps ? 0 : ((Sq - Sp) / 2) / nlen2;

    // Canonical orientation
    if (n0x < -eps || (Math.abs(n0x) <= eps && n0y < 0)) {
      n0x = -n0x; n0y = -n0y;
    }
    const kx = keyFromNumber(n0x);
    const ky = keyFromNumber(n0y);
    const kd = keyFromNumber(d);
    return `V:${kx}:${ky}:${kd}`;
  }

  // Hemisphere orthogonal to boundary
  const denom = (zq - zp);
  const cx = (zq * xp - zp * xq) / denom;
  const cy = (zq * yp - zp * yq) / denom;
  const Sp = xp * xp + yp * yp + zp * zp;
  const Sq = xq * xq + yq * yq + zq * zq;
  const c2 = cx * cx + cy * cy;
  const r2 = c2 - (zq * Sp - zp * Sq) / denom;
  if (!(r2 > eps)) return null;
  const r = Math.sqrt(r2);
  const kcx = keyFromNumber(cx);
  const kcy = keyFromNumber(cy);
  const kr = keyFromNumber(r);
  return `H:${kcx}:${kcy}:${kr}`;
}

// Draw the Dirichlet bisector (perpendicular bisector in H^3) between two points
export function drawBisector(p, q, material) {
  if (!p) return;
  q = q || basepoint;

  const xp = p.x, yp = p.y, zp = p.z;
  const xq = q.x, yq = q.y, zq = q.z;
  const eps = 1e-9;

  // If heights are equal, the bisector is a vertical plane
  if (Math.abs(zp - zq) < eps) {
    const nx = xq - xp;
    const ny = yq - yp;
    const n = new THREE.Vector3(nx, ny, 0);
    if (n.length() < eps) return;
    n.normalize();

    const Sp = xp * xp + yp * yp + zp * zp;
    const Sq = xq * xq + yq * yq + zq * zq;
    const d = (Sq - Sp) / 2;
    const nlen2 = (xq - xp) * (xq - xp) + (yq - yp) * (yq - yp);
    const scale = nlen2 < eps ? 0 : d / nlen2;
    const pointOnPlane = new THREE.Vector3((xq - xp) * scale, (yq - yp) * scale, (zp + zq) / 2);

    const planeGeom = new THREE.PlaneGeometry(40, 40);
    const planeMesh = new THREE.Mesh(planeGeom, material);
    planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    planeMesh.position.copy(pointOnPlane);
    polyhedronGroup.add(planeMesh);
    return planeMesh;
  }

  // Hemisphere orthogonal to boundary (center on z=0)
  const denom = (zq - zp);
  const cx = (zq * xp - zp * xq) / denom;
  const cy = (zq * yp - zp * yq) / denom;
  const cz = 0;

  const Sp = xp * xp + yp * yp + zp * zp;
  const Sq = xq * xq + yq * yq + zq * zq;
  const c2 = cx * cx + cy * cy + cz * cz;
  const r2 = c2 - (zq * Sp - zp * Sq) / denom;
  if (!(r2 > eps)) return;
  const r = Math.sqrt(r2);

  const geometry = new THREE.SphereGeometry(r, 64, 32, 0);
  const hemisphere = new THREE.Mesh(geometry, material);
  hemisphere.rotation.x = -Math.PI / 2;
  hemisphere.position.set(cx, cy, 0);
  polyhedronGroup.add(hemisphere);
  return hemisphere;
}

// Draw a hyperbolic geodesic arc between two points
export function drawGeodesicArc(p, q, material) {
  const eps = 1e-9;
  if (Math.hypot(p.x - q.x, p.y - q.y) < eps) {
    const geom = new THREE.BufferGeometry().setFromPoints([p, q]);
    const line = new THREE.Line(geom, material);
    delaunayGroup.add(line);
    return;
  }

  const k = new THREE.Vector3(0, 0, 1);
  const n = new THREE.Vector3().subVectors(p, q).cross(k);
  const nlen = n.length();
  if (nlen < eps) {
    const geom = new THREE.BufferGeometry().setFromPoints([p, q]);
    const line = new THREE.Line(geom, material);
    delaunayGroup.add(line);
    return;
  }
  n.divideScalar(nlen);

  const d = new THREE.Vector3().crossVectors(k, n);
  let C0 = new THREE.Vector3(p.x, p.y, 0);
  const alpha = n.dot(new THREE.Vector3().subVectors(p, C0));
  C0.addScaledVector(d, alpha / Math.max(d.lengthSq(), eps));

  const px = p.x, py = p.y, pz = p.z;
  const qx = q.x, qy = q.y, qz = q.z;
  const A = d.x * (qx - px) + d.y * (qy - py);
  const B = ((qx * qx - px * px) + (qy * qy - py * py) + (qz * qz - pz * pz)) * 0.5
    - (C0.x * (qx - px) + C0.y * (qy - py));
  const denom = A;
  let t = 0;
  if (Math.abs(denom) > eps) {
    t = B / denom;
  }
  const C = new THREE.Vector3(C0.x + t * d.x, C0.y + t * d.y, 0);

  const r = C.distanceTo(p);
  if (!(r > eps)) {
    const geom = new THREE.BufferGeometry().setFromPoints([p, q]);
    const line = new THREE.Line(geom, material);
    delaunayGroup.add(line);
    return;
  }
  const e1 = new THREE.Vector3().subVectors(p, C).divideScalar(r);
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();

  const qp = new THREE.Vector3().subVectors(q, C);
  const cosTh = THREE.MathUtils.clamp(qp.dot(e1) / r, -1, 1);
  const sinTh = THREE.MathUtils.clamp(qp.dot(e2) / r, -1, 1);
  let theta = Math.atan2(sinTh, cosTh);

  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;

  const segments = Math.max(16, Math.ceil(48 * Math.abs(theta) / Math.PI));
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const tA = (i / segments) * theta;
    const pt = new THREE.Vector3().copy(C)
      .addScaledVector(e1, Math.cos(tA) * r)
      .addScaledVector(e2, Math.sin(tA) * r);
    pts.push(pt);
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geom, material);
  delaunayGroup.add(line);
}

// Draw Delaunay edges (Cayley graph)
export function drawDelaunayEdges(neighbors) {
  clearDelaunay();
  const material = new THREE.LineBasicMaterial({ linewidth: 2 });
  for (const v of neighbors) {
    const vv = (v && v.v) ? v.v : v;
    drawGeodesicArc(basepoint, vv, material);
  }
}

// Draw orbit points
export function drawOrbitPoints(points) {
  clearOrbit();
  if (!points || points.length === 0) return;

  const sphereGeom = new THREE.SphereGeometry(0.02, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffebab });
  const mesh = new THREE.InstancedMesh(sphereGeom, sphereMat, points.length);
  const m = new THREE.Matrix4();
  for (let i = 0; i < points.length; i++) {
    m.makeTranslation(points[i].x, points[i].y, points[i].z);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  orbitGroup.add(mesh);
}

// Draw limit set points (projected to z=0)
export function drawLimitSet(groupElements) {
  clearLimitSet();
  if (!groupElements || groupElements.length === 0) return;

  const pts = [];
  // We'll just project the orbit of o to the boundary
  for (const item of groupElements) {
    const g = (item && item.m) ? item.m : item;
    if (!g) continue;
    const p = imageOfBasepoint(g);
    // Only draw if t is small enough to be "near" the boundary, or just draw everything projected
    // For a true limit set, we want the accumulation points as t -> 0.
    // We'll just plot (u.re, u.im, 0) for all points.
    if (isFinite(p.t)) {
      pts.push(new THREE.Vector3(p.u.re, p.u.im, 0.002)); // Slightly above z=0 to avoid z-fighting with floor if floor is at 0
    }
  }

  if (pts.length === 0) return;

  const geometry = new THREE.BufferGeometry().setFromPoints(pts);
  const material = new THREE.PointsMaterial({
    color: 0x00ff00,
    size: 0.015,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  limitSetGroup.add(points);
}

// Main function to generate and draw the polyhedron
// Main function to draw the polyhedron from pre-computed data
export function drawPolyhedronFromData(data, wallOpacity, colorPalette, coloringMode = 'index') {
  clearPolyhedron();
  clearDelaunay();
  clearOrbit();
  clearLimitSet();

  if (!data) return;

  const { orbitPts, limitSetPts, walls, delaunayEdges } = data;

  // Draw Walls
  if (walls) {
    walls.forEach(w => {
      const material = (colorPalette === 'random')
        ? createWallMaterial(w.randomSeed || Math.random(), 1, wallOpacity, colorPalette, coloringMode, w.word)
        : createWallMaterial(w.index, w.total, wallOpacity, colorPalette, coloringMode, w.word);

      // Re-hydrate points to Vector3 for Three.js
      const v1 = new THREE.Vector3(w.p1.x, w.p1.y, w.p1.z);
      const v2 = new THREE.Vector3(w.p2.x, w.p2.y, w.p2.z);

      const mesh = drawBisector(v1, v2, material);
      if (mesh) {
        // labelMatrix comes as a plain object, we can attach it directly or rehydrate if needed
        // matrixToLatex in ui.js/geometry.js handles plain objects fine as long as they have a,b,c,d
        mesh.userData.labelMatrix = w.labelMatrix;
        mesh.userData.latex = matrixToLatex(w.labelMatrix);
        mesh.userData.word = w.word;
      }
    });
  }

  // Draw Orbit
  const showOrbit = document.getElementById('toggleOrbit')?.classList.contains('active');
  if (showOrbit && orbitPts) {
    const pts = orbitPts.map(p => new THREE.Vector3(p.x, p.y, p.z));
    drawOrbitPoints(pts);
  }

  // Draw Limit Set
  const showLimit = document.getElementById('toggleLimitSet')?.classList.contains('active');
  if (showLimit && limitSetPts) {
    // drawLimitSet expects group elements to compute points, but we already have points
    // So we need to modify drawLimitSet or create a new one.
    // Actually, let's just inline the drawing here or modify drawLimitSet to take points.
    // For cleaner code, let's modify drawLimitSet to take points.
    drawLimitSetPoints(limitSetPts);
  }

  // Draw Delaunay
  const showDel = document.getElementById('toggleDelaunay')?.classList.contains('active');
  if (showDel && delaunayEdges) {
    delaunayEdges.forEach(edge => {
      const col = colorForIndex(edge.index, edge.total, colorPalette);
      const material = new THREE.LineBasicMaterial({ color: col });
      const v1 = new THREE.Vector3(edge.p1.x, edge.p1.y, edge.p1.z);
      const v2 = new THREE.Vector3(edge.p2.x, edge.p2.y, edge.p2.z);
      drawGeodesicArc(v1, v2, material);
    });
  }
}

// Helper to draw limit set from points
function drawLimitSetPoints(pts) {
  clearLimitSet();
  if (!pts || pts.length === 0) return;

  const vecPts = pts.map(p => new THREE.Vector3(p.x, p.y, p.z));
  const geometry = new THREE.BufferGeometry().setFromPoints(vecPts);
  const material = new THREE.PointsMaterial({
    color: 0x00ff00,
    size: 0.015,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  limitSetGroup.add(points);
}

// Canvas click handler for picking walls
export function onCanvasClick(event, showLatexInMessageBox) {
  if (!renderer || !camera) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(polyhedronGroup.children, true);
  if (!intersects || intersects.length === 0) return;

  let hit = intersects[0].object;
  let node = hit;
  while (node && node !== polyhedronGroup && !(node.userData && (node.userData.latex || node.userData.labelMatrix))) {
    node = node.parent;
  }
  const latex = node && node.userData && (node.userData.latex || (node.userData.labelMatrix && matrixToLatex(node.userData.labelMatrix)));
  if (latex) {
    showLatexInMessageBox(latex);
  }
}

// Reset camera view
export function resetView() {
  camera.position.set(0, -5, 3);
  controls.target.set(0, 0, 1);
  controls.update();
}

// Save image
export function saveImage() {
  try {
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    const dataURL = renderer && renderer.domElement ? renderer.domElement.toDataURL('image/png') : null;
    if (!dataURL) return null;

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const fname = `dirichlet-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`;

    return { dataURL, fname };
  } catch (e) {
    return null;
  }
}

// Export scene objects for external access
export function getSceneObjects() {
  return { scene, camera, renderer, controls, polyhedronGroup, delaunayGroup, orbitGroup, limitSetGroup, floor, basepoint };
}
