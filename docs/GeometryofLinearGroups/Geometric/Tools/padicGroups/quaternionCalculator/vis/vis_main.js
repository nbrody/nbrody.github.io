import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { QMath } from '../quaternionPackage/projectiveQuaternion.js';

let scene, camera, renderer, controls, cayleyGroup;

export function initMainVis(containerId) {
    const container = document.getElementById(containerId);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 2.5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1);
    camera.add(pointLight);
    scene.add(camera);

    const sphereGeom = new THREE.SphereGeometry(1, 64, 32);
    const sphereMat = new THREE.MeshPhongMaterial({
        color: 0x156289, emissive: 0x072534, side: THREE.BackSide,
        transparent: true, opacity: 0.1, shininess: 50
    });
    const boundarySphere = new THREE.Mesh(sphereGeom, sphereMat);
    scene.add(boundarySphere);

    cayleyGroup = new THREE.Group();
    scene.add(cayleyGroup);

    animate();
    return { scene, camera, renderer, controls };
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

export function handleResize(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !renderer || !camera) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

export function drawCayleyGraph(generators, depth, genXKey, genYKey) {
    if (!cayleyGroup) return;

    // Clear old
    while (cayleyGroup.children.length > 0) {
        cayleyGroup.remove(cayleyGroup.children[0]);
    }

    if (!genXKey || !genYKey || !generators[genXKey] || !generators[genYKey]) return;

    const baseRadius = Math.max(0.05, 0.05 * (3 / (depth + 2)));
    const radiusFor = (lvl) => Math.max(0.003, baseRadius * Math.pow(0.65, Math.max(0, lvl)));
    const edgeOpacityFor = (lvl) => Math.max(0.1, 1 - .75 * (Math.max(0, lvl) / Math.max(1, depth)));

    const q_x = generators[genXKey];
    const q_y = generators[genYKey];

    const findConjugate = (targetQ) => {
        const conj = [targetQ[0], -targetQ[1], -targetQ[2], -targetQ[3]];
        return Object.values(generators).find(g => QMath.areEqual(g.q, conj));
    };

    const q_x_inv = findConjugate(q_x.q);
    const q_y_inv = findConjugate(q_y.q);

    if (!q_x_inv || !q_y_inv) return;

    const gens = [
        { q: q_x.q, color: q_x.color },
        { q: q_y.q, color: q_y.color },
        { q: q_x_inv.q, color: q_x.color },
        { q: q_y_inv.q, color: q_y.color }
    ];

    const basePointVec = new THREE.Vector3(0, 0, 1);

    // Quaternion action on vectors
    const act = (q, v) => {
        const vQuat = [0, v.x, v.y, v.z];
        const n2 = QMath.normSq(q);
        const qInv = [q[0] / n2, -q[1] / n2, -q[2] / n2, -q[3] / n2];
        const res = QMath.multiply(QMath.multiply(q, vQuat), qInv);
        return new THREE.Vector3(res[1], res[2], res[3]);
    };

    const queue = [{ q: [1, 0, 0, 0], pos: basePointVec, level: 0 }];
    const visited = new Set();
    visited.add(basePointVec.toArray().map(v => v.toFixed(5)).join(','));

    // Origin vertex
    const startMesh = new THREE.Mesh(
        new THREE.SphereGeometry(radiusFor(0), 20, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
    );
    startMesh.position.copy(basePointVec);
    cayleyGroup.add(startMesh);

    while (queue.length > 0) {
        const { q, pos, level } = queue.shift();
        if (level >= depth) continue;

        for (const gen of gens) {
            const next_q = QMath.multiply(gen.q, q);
            const next_pos = act(gen.q, pos);
            const posKey = next_pos.toArray().map(v => v.toFixed(5)).join(',');

            if (!visited.has(posKey)) {
                visited.add(posKey);

                const vertex = new THREE.Mesh(
                    new THREE.SphereGeometry(radiusFor(level + 1), 16, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: edgeOpacityFor(level + 1) })
                );
                vertex.position.copy(next_pos);
                cayleyGroup.add(vertex);

                // Edge curve
                const mid = pos.clone().add(next_pos).normalize();
                const curve = new THREE.CatmullRomCurve3([
                    pos.clone().multiplyScalar(0.99),
                    mid,
                    next_pos.clone().multiplyScalar(0.99)
                ]);
                const edge = new THREE.Line(
                    new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
                    new THREE.LineBasicMaterial({ color: gen.color, linewidth: 2, transparent: true, opacity: edgeOpacityFor(level + 1) })
                );
                cayleyGroup.add(edge);

                queue.push({ q: next_q, pos: next_pos, level: level + 1 });
            }
        }
    }
}
