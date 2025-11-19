import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, camera, renderer, controls;

export function initFigureEight() {
    const container = document.getElementById('figureEightContainer');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);

    // Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Orbit controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-5, -5, -5);
    scene.add(backLight);

    // Create Figure-Eight Knot
    createKnot();

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

function createKnot() {
    // Parametric equation for Figure-Eight Knot (4_1)
    // x = (2 + cos(2t)) * cos(3t)
    // y = (2 + cos(2t)) * sin(3t)
    // z = sin(4t)

    const curve = new THREE.Curve();
    curve.getPoint = function (t) {
        // t goes from 0 to 1
        const angle = 2 * Math.PI * t;
        const x = (2 + Math.cos(2 * angle)) * Math.cos(3 * angle);
        const y = (2 + Math.cos(2 * angle)) * Math.sin(3 * angle);
        const z = Math.sin(4 * angle);

        // Scale down slightly to fit view
        const scale = 0.8;
        return new THREE.Vector3(x * scale, y * scale, z * scale);
    };

    const geometry = new THREE.TubeGeometry(curve, 200, 0.4, 16, true);
    const material = new THREE.MeshPhongMaterial({
        color: 0x8e44ad,
        shininess: 60,
        specular: 0x222222
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Add a "branching sheet" visualization (conceptual)
    // Just a translucent surface intersecting the knot to hint at the branched cover structure?
    // Or maybe just the knot is enough with the text description.
    // Let's stick to a clean knot for now to avoid clutter, as the branching topology is hard to show simply.
}
