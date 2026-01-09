import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';

let camera, scene, renderer;
let cube;
let container;

let isDragging = false;
let previousTouchPosition = { x: 0, y: 0 };
let currentRotation = { x: 0, y: 0 };

init();
animate();

function init() {
    container = document.createElement('div');
    document.body.appendChild(container);

    scene = new THREE.Scene();

    // The camera will be updated by WebXR, but we need an initial one
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Light
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    hemisphereLight.position.set(0.5, 1, 0.25);
    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    directionalLight.position.set(0, 10, 10);
    scene.add(directionalLight);

    // Cube
    // A foot is approx 30cm. 
    // We'll make the cube 15cm size (0.15)
    // Position it at z = -0.3
    const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);

    // Create a cool material
    // Using physical material for nice reflections if environment was present, but standard is good
    const material = new THREE.MeshNormalMaterial({
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
    });

    // We can also add edges to make it look techy
    cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0, -0.3); // 30cm in front

    // Add a wireframe cage slightly larger
    const wireGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 });
    const wireframe = new THREE.Mesh(wireGeo, wireMat);
    cube.add(wireframe);

    scene.add(cube);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    // AR Button
    const arButton = ARButton.createButton(renderer, {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });
    document.body.appendChild(arButton);

    // Add listeners to AR Button to toggle UI state
    arButton.addEventListener('click', () => {
        // Simple heuristic: if we clicked it, we are likely entering AR
        // Ideally we listen to session start event
    });

    // Listen for session start/end
    renderer.xr.addEventListener('sessionstart', () => {
        document.body.classList.add('ar-active');
        document.getElementById('interaction-prompt').classList.remove('hidden');
    });

    renderer.xr.addEventListener('sessionend', () => {
        document.body.classList.remove('ar-active');
        document.getElementById('interaction-prompt').classList.add('hidden');
        resetCube();
    });

    // User Interaction (Touch)
    // Because we used dom-overlay on document.body, standard touch events should work
    window.addEventListener('resize', onWindowResize);
    document.body.addEventListener('touchstart', onTouchStart, { passive: false });
    document.body.addEventListener('touchmove', onTouchMove, { passive: false });
    document.body.addEventListener('touchend', onTouchEnd);
}

function resetCube() {
    cube.rotation.set(0, 0, 0);
    currentRotation = { x: 0, y: 0 };
    cube.position.set(0, 0, -0.3);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onTouchStart(e) {
    if (e.touches.length === 1) {
        // Don't block the AR Button
        if (e.target.id === 'ARButton') return;

        isDragging = true;
        previousTouchPosition = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    }
}

function onTouchMove(e) {
    if (isDragging && e.touches.length === 1) {
        // Prevent default to stop scrolling if any
        e.preventDefault();

        const deltaMove = {
            x: e.touches[0].clientX - previousTouchPosition.x,
            y: e.touches[0].clientY - previousTouchPosition.y
        };

        const rotateSpeed = 0.01;

        // Rotate cube based on drag
        // Dragging X -> Rotate around Y
        // Dragging Y -> Rotate around X
        cube.rotation.y += deltaMove.x * rotateSpeed;
        cube.rotation.x += deltaMove.y * rotateSpeed;

        previousTouchPosition = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    }
}

function onTouchEnd() {
    isDragging = false;
}

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    // Optional: slight idle rotation if not dragging
    if (!isDragging && renderer.xr.isPresenting) {
        // cube.rotation.y += 0.005;
        // cube.rotation.z += 0.002;
    }

    // In AR, we just render. The camera is controlled by the device.
    renderer.render(scene, camera);
}
