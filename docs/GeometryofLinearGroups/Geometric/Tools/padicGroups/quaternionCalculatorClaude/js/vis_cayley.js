// vis_cayley.js — Three.js Cayley graph on S^2

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { QMath } from './quaternion.js';

let scene, camera, renderer, controls;
let sphereGroup, edgeGroup, vertexGroup;
let animating = false;

export function initCayley(container) {
    const W = container.clientWidth;
    const H = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080c18);

    camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 100);
    camera.position.set(0, 0, 3.5);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;

    // Lights
    scene.add(new THREE.AmbientLight(0x404060, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(3, 5, 3);
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x60a5fa, 0x080c18, 0.3));

    // Reference sphere (wireframe)
    const sphereGeo = new THREE.SphereGeometry(1, 48, 48);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x1a2444,
        wireframe: true,
        transparent: true,
        opacity: 0.08
    });
    scene.add(new THREE.Mesh(sphereGeo, sphereMat));

    sphereGroup = new THREE.Group();
    edgeGroup = new THREE.Group();
    vertexGroup = new THREE.Group();
    scene.add(sphereGroup);
    sphereGroup.add(edgeGroup);
    sphereGroup.add(vertexGroup);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls?.update();
    renderer?.render(scene, camera);
}

export function handleResize(container) {
    if (!renderer) return;
    const W = container.clientWidth;
    const H = container.clientHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
}

export function resetView() {
    if (!camera) return;
    camera.position.set(0, 0, 3.5);
    camera.lookAt(0, 0, 0);
    controls?.reset();
}

/**
 * Build Cayley graph on S^2.
 * Each group element g is placed at g(k) where k = (0,0,1).
 * Edges connect g to g*alpha_i for each generator.
 */
export function drawCayley(generators, depth, genXKey, genYKey) {
    if (!scene) return;

    // Clear old
    while (edgeGroup.children.length) edgeGroup.remove(edgeGroup.children[0]);
    while (vertexGroup.children.length) vertexGroup.remove(vertexGroup.children[0]);

    const genKeys = Object.keys(generators);
    if (genKeys.length === 0) return;

    // BFS to build group elements up to given depth
    const baseVec = [0, 0, 1]; // k direction in pure quaternion space
    const visited = new Map(); // hash -> { pos, depth }
    const queue = [];

    const identity = [1, 0, 0, 0];
    const idPos = QMath.actOnPure(identity, baseVec);
    const idHash = posHash(idPos);
    visited.set(idHash, { q: identity, pos: idPos, depth: 0 });
    queue.push({ q: identity, pos: idPos, depth: 0, hash: idHash });

    const edges = [];

    while (queue.length > 0) {
        const current = queue.shift();
        if (current.depth >= depth) continue;

        for (const gk of genKeys) {
            const gen = generators[gk];
            const newQ = QMath.multiply(current.q, gen.q);
            const newPos = QMath.actOnPure(newQ, baseVec);
            const hash = posHash(newPos);

            if (!visited.has(hash)) {
                visited.set(hash, { q: newQ, pos: newPos, depth: current.depth + 1 });
                queue.push({ q: newQ, pos: newPos, depth: current.depth + 1, hash });
            }

            edges.push({
                from: current.pos,
                to: visited.get(hash).pos,
                color: gen.color,
                fromDepth: current.depth,
                toDepth: current.depth + 1
            });
        }
    }

    // Draw edges as curves on the sphere
    const maxDepth = depth;
    for (const edge of edges) {
        const opacity = Math.max(0.1, 1 - edge.fromDepth / maxDepth);
        drawSphericalEdge(edge.from, edge.to, edge.color, opacity);
    }

    // Draw vertices
    for (const [, data] of visited) {
        const r = data.depth === 0 ? 0.035 : Math.max(0.01, 0.025 - data.depth * 0.003);
        const opacity = Math.max(0.2, 1 - data.depth / maxDepth);
        const color = data.depth === 0 ? 0xffd700 : 0xffffff;

        const geo = new THREE.SphereGeometry(r, 8, 8);
        const mat = new THREE.MeshPhongMaterial({
            color, transparent: true, opacity,
            emissive: data.depth === 0 ? 0xffd700 : 0x000000,
            emissiveIntensity: data.depth === 0 ? 0.5 : 0
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...data.pos);
        vertexGroup.add(mesh);
    }
}

function drawSphericalEdge(from, to, colorStr, opacity) {
    const color = cssColorToHex(colorStr);

    // Great circle arc between two points on S^2
    const v1 = new THREE.Vector3(...from).normalize();
    const v2 = new THREE.Vector3(...to).normalize();

    const points = [];
    const n = 16;
    for (let t = 0; t <= n; t++) {
        const frac = t / n;
        const p = new THREE.Vector3().lerpVectors(v1, v2, frac).normalize();
        points.push(p);
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: opacity * 0.6,
        linewidth: 1
    });
    edgeGroup.add(new THREE.Line(geo, mat));
}

function posHash(pos) {
    return pos.map(v => Math.round(v * 1000) / 1000).join(',');
}

function cssColorToHex(str) {
    if (!str) return 0xffffff;
    if (str.startsWith('#')) return parseInt(str.slice(1), 16);
    if (str.startsWith('hsl')) {
        // Parse hsl(h, s%, l%)
        const m = str.match(/hsl\((\d+(?:\.\d+)?),\s*(\d+)%?,\s*(\d+)%?\)/);
        if (m) {
            const c = new THREE.Color();
            c.setHSL(parseFloat(m[1]) / 360, parseInt(m[2]) / 100, parseInt(m[3]) / 100);
            return c.getHex();
        }
    }
    return 0xffffff;
}

/**
 * Draw SO3(Z) visualization — 24 element cube with rotation highlighting
 */
export function drawSO3Z(container, group) {
    if (!scene) initCayley(container);

    while (edgeGroup.children.length) edgeGroup.remove(edgeGroup.children[0]);
    while (vertexGroup.children.length) vertexGroup.remove(vertexGroup.children[0]);

    const baseVec = [0, 0, 1];

    // Draw all 24 elements as points on S^2
    for (const elem of group) {
        const pos = QMath.actOnPure(elem.q, baseVec);
        const r = 0.04;
        const hue = elem.norm === 1 ? 0.1 : elem.norm === 2 ? 0.55 : 0.8;

        const geo = new THREE.SphereGeometry(r, 12, 12);
        const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color().setHSL(hue, 0.7, 0.6),
            emissive: new THREE.Color().setHSL(hue, 0.5, 0.2),
            emissiveIntensity: 0.3
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...pos);
        mesh.userData = elem;
        vertexGroup.add(mesh);
    }

    // Draw edges from generators
    const SO3Z_GENS = [
        [0, 1, 0, 0], [0, 0, 1, 0],
        [1, 1, 0, 0], [1, 0, 1, 0]
    ];

    const genColors = [0x38bdf8, 0xf472b6, 0xfbbf24, 0x22c55e];

    for (const elem of group) {
        const fromPos = QMath.actOnPure(elem.q, baseVec);
        for (let gi = 0; gi < SO3Z_GENS.length; gi++) {
            const product = QMath.multiply(elem.q, SO3Z_GENS[gi]);
            const toPos = QMath.actOnPure(product, baseVec);
            drawSphericalEdge(fromPos, toPos, '#' + genColors[gi].toString(16).padStart(6, '0'), 0.3);
        }
    }
}
