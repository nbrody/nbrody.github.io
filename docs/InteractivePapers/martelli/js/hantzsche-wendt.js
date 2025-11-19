import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let hwScene, hwCamera, hwRenderer, hwControls;
let latticeGroup;
let clickableFaces = [];
let isAnimating = false;

export function initHantscheWendt() {
    const container = document.getElementById('hwContainer');
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    hwScene = new THREE.Scene();
    hwScene.background = new THREE.Color(0xf5f5f5);

    // Camera
    hwCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    hwCamera.position.set(4, 4, 6);
    hwCamera.lookAt(1, 0.5, 0.5); // Look at center of the 2-cube structure

    // Renderer
    hwRenderer = new THREE.WebGLRenderer({ antialias: true });
    hwRenderer.setSize(width, height);
    container.appendChild(hwRenderer.domElement);

    // Orbit controls
    hwControls = new OrbitControls(hwCamera, hwRenderer.domElement);
    hwControls.enableDamping = true;
    hwControls.dampingFactor = 0.05;
    hwControls.target.set(1, 0.5, 0.5);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    hwScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(5, 10, 7.5);
    hwScene.add(directionalLight);

    // Create lattice group
    latticeGroup = new THREE.Group();
    hwScene.add(latticeGroup);

    // Create two stacked cubes:
    // Cube 1: Center (0.5, 0.5, 0.5)
    // Cube 2: Center (1.5, 0.5, 0.5)
    createCube(0.5, 0.5, 0.5, 1);
    createCube(1.5, 0.5, 0.5, 2);

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(2);
    hwScene.add(axesHelper);

    // Mouse interaction for clicking faces
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    hwRenderer.domElement.addEventListener('click', (event) => {
        const rect = hwRenderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, hwCamera);
        const intersects = raycaster.intersectObjects(clickableFaces);

        if (intersects.length > 0) {
            const face = intersects[0].object;
            onFaceClick(face);
        }
    });

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        hwControls.update();
        hwRenderer.render(hwScene, hwCamera);
    }
    animate();
}

function createCube(centerX, centerY, centerZ, cubeId) {
    const cubeSize = 1;

    // Create highlighted edges for the cube
    const edgesGeometry = new THREE.EdgesGeometry(
        new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)
    );
    const edgesMaterial = new THREE.LineBasicMaterial({
        color: 0x3498db,
        linewidth: 2
    });
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.position.set(centerX, centerY, centerZ);
    latticeGroup.add(edges);

    // Create clickable faces
    // Use exact size but polygonOffset to avoid z-fighting without size mismatch
    const faceSize = cubeSize;
    const faceGeometry = new THREE.PlaneGeometry(faceSize, faceSize);

    // Define 6 faces
    const faceOffset = 0.5; // Exact edge
    const faces = [
        { normal: [1, 0, 0], position: [faceOffset, 0, 0], rotation: [0, Math.PI / 2, 0], name: 'right', axis: 'x', dir: 1 },
        { normal: [-1, 0, 0], position: [-faceOffset, 0, 0], rotation: [0, -Math.PI / 2, 0], name: 'left', axis: 'x', dir: -1 },
        { normal: [0, 1, 0], position: [0, faceOffset, 0], rotation: [-Math.PI / 2, 0, 0], name: 'top', axis: 'y', dir: 1 },
        { normal: [0, -1, 0], position: [0, -faceOffset, 0], rotation: [Math.PI / 2, 0, 0], name: 'bottom', axis: 'y', dir: -1 },
        { normal: [0, 0, 1], position: [0, 0, faceOffset], rotation: [0, 0, 0], name: 'front', axis: 'z', dir: 1 },
        { normal: [0, 0, -1], position: [0, 0, -faceOffset], rotation: [0, Math.PI, 0], name: 'back', axis: 'z', dir: -1 }
    ];

    faces.forEach(faceInfo => {
        // Determine face type for coloring
        let faceColor;
        let isExternal = false;

        if (faceInfo.axis === 'x') {
            if (cubeId === 1 && faceInfo.dir === -1) { isExternal = true; faceColor = 0xe74c3c; } // Left end
            else if (cubeId === 2 && faceInfo.dir === 1) { isExternal = true; faceColor = 0xe74c3c; } // Right end
            else { isExternal = false; faceColor = 0x95a5a6; } // Internal
        }
        else if (faceInfo.axis === 'y') {
            isExternal = true;
            faceColor = 0x2ecc71;
        }
        else if (faceInfo.axis === 'z') {
            isExternal = true;
            faceColor = 0xf39c12;
        }

        if (isExternal) {
            const faceMaterial = new THREE.MeshBasicMaterial({
                color: faceColor,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: 1, // Push back slightly
                polygonOffsetUnits: 1
            });
            const face = new THREE.Mesh(faceGeometry, faceMaterial);
            face.position.set(
                centerX + faceInfo.position[0],
                centerY + faceInfo.position[1],
                centerZ + faceInfo.position[2]
            );
            face.rotation.set(...faceInfo.rotation);

            face.userData = {
                cubeId: cubeId,
                name: faceInfo.name,
                axis: faceInfo.axis,
                dir: faceInfo.dir,
                color: faceColor,
                originalPosition: face.position.clone(),
                originalRotation: face.rotation.clone()
            };

            latticeGroup.add(face);
            clickableFaces.push(face);
        }
    });
}

function onFaceClick(face) {
    if (isAnimating) return;

    const u = face.userData;

    // Determine animation type based on clicked face
    if (u.axis === 'x') {
        // Ends
        animateGluingType('ends');
    } else if (u.axis === 'y') {
        // Top/Bottom
        animateGluingType('rotation');
    } else if (u.axis === 'z') {
        // Front/Back
        // If Cube 1 Front or Cube 2 Back -> Diagonal 1
        if ((u.cubeId === 1 && u.dir === 1) || (u.cubeId === 2 && u.dir === -1)) {
            animateGluingType('glide1');
        } else {
            animateGluingType('glide2');
        }
    }
}

// Expose to window for buttons
window.animateGluingType = (type) => {
    if (isAnimating) return;

    // Define transformation parameters
    // Center of the fundamental domain
    const center = new THREE.Vector3(1, 0.5, 0.5);

    let translation = new THREE.Vector3(0, 0, 0);
    let rotationAxis = null;
    let rotationAngle = 0;

    if (type === 'ends') {
        // Translate 2 units. Direction depends on which end, but for button we just show one.
        // Let's show Left -> Right (Translate +2)
        translation.set(2, 0, 0);
    } else if (type === 'rotation') {
        // Rotate 180 around X (long axis)
        rotationAxis = new THREE.Vector3(1, 0, 0);
        rotationAngle = Math.PI;
    } else if (type === 'glide1') {
        // Front 1 -> Back 2
        // Rotate 180 around Y
        rotationAxis = new THREE.Vector3(0, 1, 0);
        rotationAngle = Math.PI;
    } else if (type === 'glide2') {
        // Front 2 -> Back 1
        // Also Rotate 180 around Y (inverse is same)
        // To make it visually distinct or just consistent, use same rotation
        rotationAxis = new THREE.Vector3(0, 1, 0);
        rotationAngle = Math.PI;
    }

    animateWholeDomain(translation, rotationAxis, rotationAngle, center);
};

function animateWholeDomain(translation, rotationAxis, rotationAngle, center) {
    isAnimating = true;

    // Clone the ENTIRE lattice group to animate
    const animGroup = latticeGroup.clone();
    latticeGroup.add(animGroup);

    // Hide original? No, keep it as reference (ghost).
    // Maybe make original semi-transparent or wireframe?
    // Let's keep original as is, animate the clone "flying" to its destination.

    const duration = 2000;
    const startTime = Date.now();

    // Initial state
    animGroup.position.set(0, 0, 0);
    animGroup.rotation.set(0, 0, 0);

    function animateFrame() {
        const elapsed = Date.now() - startTime;
        let t = elapsed / duration;

        if (t >= 1) {
            t = 1;
            isAnimating = false;
            latticeGroup.remove(animGroup);
            return;
        }

        // Smooth step
        const s = t * t * (3 - 2 * t);

        // Apply transformation
        // We want to rotate around 'center' then translate.
        // Transform = T(translation) * T(center) * R(rotation) * T(-center)

        // Reset
        animGroup.position.set(0, 0, 0);
        animGroup.rotation.set(0, 0, 0);
        animGroup.updateMatrix();

        const m1 = new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z);
        const mRot = new THREE.Matrix4();
        if (rotationAxis) {
            mRot.makeRotationAxis(rotationAxis, rotationAngle * s);
        }
        const mTrans = new THREE.Matrix4().makeTranslation(
            center.x + translation.x * s,
            center.y + translation.y * s,
            center.z + translation.z * s
        );

        const finalMatrix = mTrans.multiply(mRot).multiply(m1);

        animGroup.applyMatrix4(finalMatrix);

        requestAnimationFrame(animateFrame);
    }

    animateFrame();
}
