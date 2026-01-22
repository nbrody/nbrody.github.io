import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let so3zScene, so3zCamera, so3zRenderer, so3zCube;

export function initSO3ZVis(containerId) {
    const container = document.getElementById(containerId);
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 500;

    so3zScene = new THREE.Scene();
    so3zScene.background = new THREE.Color(0x111111);
    so3zCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    so3zCamera.position.set(3, 3, 5);
    so3zCamera.lookAt(0, 0, 0);

    so3zRenderer = new THREE.WebGLRenderer({ antialias: true });
    so3zRenderer.setSize(w, h);
    container.appendChild(so3zRenderer.domElement);

    const controls = new OrbitControls(so3zCamera, so3zRenderer.domElement);
    controls.enableDamping = true;

    // Lights
    so3zScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    so3zScene.add(dir);

    // Objects
    so3zCube = new THREE.Group();
    so3zCube.add(new THREE.AxesHelper(1.5));

    // Sphere
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 32, 32),
        new THREE.MeshPhongMaterial({ color: 0x3498db, transparent: true, opacity: 0.1, shininess: 100 })
    );
    so3zCube.add(sphere);

    // Cube Frame
    const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 })
    );
    so3zCube.add(box);

    // Axis Orientation Cones
    const addCone = (pos, rotAxis, color) => {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4), new THREE.MeshPhongMaterial({ color }));
        c.position.set(...pos);
        if (rotAxis === 'z') c.rotation.z = -Math.PI / 2;
        if (rotAxis === 'x') c.rotation.x = Math.PI / 2;
        so3zCube.add(c);
    };
    addCone([1, 0, 0], 'z', 0xff0000); // X
    addCone([0, 1, 0], '', 0x00ff00);  // Y
    addCone([0, 0, 1], 'x', 0x0000ff); // Z

    so3zScene.add(so3zCube);

    const animate = () => {
        requestAnimationFrame(animate);
        controls.update();
        so3zRenderer.render(so3zScene, so3zCamera);
    };
    animate();

    new ResizeObserver(() => {
        so3zRenderer.setSize(container.clientWidth, container.clientHeight);
        so3zCamera.aspect = container.clientWidth / container.clientHeight;
        so3zCamera.updateProjectionMatrix();
    }).observe(container);
}

export function applySO3ZRotation(q) {
    if (!so3zCube) return;

    // Normalize and convert to Three.js quaternion (x, y, z, w)
    const norm = Math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2);
    const targetQ = new THREE.Quaternion(q[1] / norm, q[2] / norm, q[3] / norm, q[0] / norm);

    const startQ = so3zCube.quaternion.clone();
    let t = 0;
    const anim = () => {
        t += 0.05;
        if (t > 1) t = 1;
        THREE.Quaternion.slerp(startQ, targetQ, so3zCube.quaternion, t);
        if (t < 1) requestAnimationFrame(anim);
    };
    anim();
}
