/**
 * figure-eight.js — Three.js visualization of the figure-eight knot (4_1)
 * with premium rendering and auto-rotation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;
let knotMesh;

export function initFigureEight() {
    const container = document.getElementById('figureEightContainer');
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1e);

    // Add subtle fog for depth
    scene.fog = new THREE.FogExp2(0x0a0a1e, 0.03);

    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2, 8);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    // Lighting
    scene.add(new THREE.AmbientLight(0x8888cc, 0.3));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x667eea, 0.4);
    fillLight.position.set(-5, -2, -5);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf093fb, 0.3);
    rimLight.position.set(0, -5, 3);
    scene.add(rimLight);

    // Create the figure-eight knot
    createKnot();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();

        // Subtle color shift over time
        if (knotMesh) {
            const t = Date.now() * 0.0003;
            const hue = (Math.sin(t) * 0.05 + 0.75) % 1; // purple range
            knotMesh.material.color.setHSL(hue, 0.6, 0.5);
        }

        renderer.render(scene, camera);
    }
    animate();
}

function createKnot() {
    // A true figure-eight knot (4_1) parametrization
    // Using Lissajous-like parametric equations
    const curve = new THREE.Curve();
    curve.getPoint = function (t) {
        const angle = 2 * Math.PI * t;
        const x = (2 + Math.cos(2 * angle)) * Math.cos(3 * angle);
        const y = (2 + Math.cos(2 * angle)) * Math.sin(3 * angle);
        const z = Math.sin(4 * angle);
        return new THREE.Vector3(x * 0.8, y * 0.8, z * 0.8);
    };

    const geometry = new THREE.TubeGeometry(curve, 256, 0.25, 20, true);
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xa78bfa,
        metalness: 0.3,
        roughness: 0.35,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.5,
    });

    knotMesh = new THREE.Mesh(geometry, material);
    scene.add(knotMesh);

    // Add a subtle glow ring
    const glowGeo = new THREE.TubeGeometry(curve, 256, 0.45, 12, true);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x667eea,
        transparent: true,
        opacity: 0.04,
        side: THREE.BackSide
    });
    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glowMesh);
}
