import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('marble');
const error = document.getElementById('error');
try {
  const response = await fetch('./scene.json');
  if (!response.ok) throw new Error('The tiling could not be loaded.');
  const data = await response.json();
  const marble = new THREE.ObjectLoader().parse(data.object);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0f1218');
  scene.add(marble);
  const camera = new THREE.PerspectiveCamera(data.camera.fov, 1, 0.05, 100);
  const direction = new THREE.Vector3(...data.camera.position).sub(new THREE.Vector3(...data.camera.target)).normalize();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0, 0);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;
  controls.minDistance = 1.45;
  controls.maxDistance = 12;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  let initial = true;
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (initial) {
      const v = THREE.MathUtils.degToRad(camera.fov / 2);
      const horizontal = Math.atan(Math.tan(v) * camera.aspect);
      const distance = 1.18 / Math.sin(Math.min(v, horizontal));
      camera.position.copy(direction).multiplyScalar(Math.max(3.1, distance));
      controls.update();
      initial = false;
    }
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  let raf = 0, running = true;
  function frame() { if (!running) return; controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) frame(); else cancelAnimationFrame(raf); });
  frame();
} catch (e) {
  error.textContent = 'The marble could not be displayed.';
  error.style.display = 'grid';
  console.error(e);
}
