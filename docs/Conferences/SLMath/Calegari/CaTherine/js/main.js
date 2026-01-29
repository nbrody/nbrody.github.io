import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getDirichletFaces, getCayleyGraph, Matrix2x2, getGenerators } from './math.js';
import { vertexShader, fragmentShader } from './shaders.js';

// --- Three.js Setup ---
const container = document.getElementById('viz-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.5, 1.5, 2.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

// Stop auto-rotate on interaction
controls.addEventListener('start', () => {
    controls.autoRotate = false;
});

// Raymarching Proxy Geometry
const geometry = new THREE.BoxGeometry(2.5, 2.5, 2.5);
let currentN = 2;
let currentMaxFaces = 64;
let viewMatrix = new Matrix2x2(1, 0, 0, 1);
let animatingIsometry = false;

const { faces: facesArr, count: actualCount } = getDirichletFaces(currentN, viewMatrix, currentMaxFaces);
let currentDepth = 8;

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_cameraPos: { value: new THREE.Vector3() },
        u_faces: { value: facesArr },
        u_faceCount: { value: actualCount },
        u_time: { value: 0 }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    side: THREE.BackSide
});

const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// Cayley Graph Objects
const cayleyGroup = new THREE.Group();
cayleyGroup.visible = false;
scene.add(cayleyGroup);
let showCayley = false;
let showPolyhedron = true;

function getHyperbolicGeodesic(p1, p2, segments = 16) {
    const cross = new THREE.Vector3().crossVectors(p1, p2);
    if (cross.length() < 1e-6) {
        // Collinear with origin -> straight line
        return [p1, p2];
    }

    // Inversion of p1 in unit sphere
    const p1Star = p1.clone().multiplyScalar(1 / p1.lengthSq());

    // Center of circle passing through p1, p2, p1Star
    // Formula for circumcenter of 3 points in 3D
    const a = p1.clone().sub(p1Star);
    const b = p2.clone().sub(p1Star);
    const aLine = a.clone().multiplyScalar(b.lengthSq() * a.dot(a) - a.dot(b) * b.lengthSq());
    const bLine = b.clone().multiplyScalar(a.lengthSq() * b.dot(b) - a.dot(b) * a.dot(a));
    const denom = 2 * (a.lengthSq() * b.lengthSq() - Math.pow(a.dot(b), 2));

    let center;
    if (Math.abs(denom) < 1e-9) {
        return [p1, p2];
    }

    // Standard formula for circumcenter center
    // C = p1Star + ( (||a||^2 b - ||b||^2 a) x (a x b) ) / (2 ||a x b||^2)
    const a_minus_b = p1.clone().sub(p2);
    const b_minus_p1s = p2.clone().sub(p1Star);
    const p1s_minus_a = p1Star.clone().sub(p1);

    const cross_ab = new THREE.Vector3().crossVectors(a_minus_b, b_minus_p1s);
    const denom_cc = 2 * cross_ab.lengthSq();

    const alpha = b_minus_p1s.lengthSq() * (a_minus_b.dot(p1s_minus_a)) / denom_cc; // Not this one

    // Simpler way: The center C resides in the plane and is equidistant from p1, p2, p1Star
    // Let's use the property that C must be the intersection of the perpendicular bisector planes.
    // Plane 1: mid(p1, p1Star) with normal (p1 - p1Star)
    // Plane 2: mid(p1, p2) with normal (p1 - p2)
    // Plane 3: The plane p1, p2, 0

    // Actually, because it's orthogonal to the unit sphere, the center C must satisfy:
    // ||C||^2 = R^2 + 1  (Pythagorean theorem)
    // And R^2 = ||C - p1||^2 = ||C||^2 + ||p1||^2 - 2 C.p1
    // So ||C||^2 + ||p1||^2 - 2 C.p1 = ||C||^2 - 1
    // => 2 C.p1 = ||p1||^2 + 1
    // Similarly, 2 C.p2 = ||p2||^2 + 1

    // We have two linear equations for C:
    // 1. C . p1 = (||p1||^2 + 1) / 2
    // 2. C . p2 = (||p2||^2 + 1) / 2
    // 3. C . (p1 x p2) = 0 (C is in the plane of p1, p2, 0)

    const v1 = p1.clone();
    const v2 = p2.clone();
    const v3 = new THREE.Vector3().crossVectors(p1, p2);

    const d1 = (p1.lengthSq() + 1) / 2;
    const d2 = (p2.lengthSq() + 1) / 2;
    const d3 = 0;

    // Solve the 3x3 system M * C = D
    // M = [p1.x p1.y p1.z; p2.x p2.y p2.z; v3.x v3.y v3.z]
    const detM = (v1.x * (v2.y * v3.z - v2.z * v3.y) -
        v1.y * (v2.x * v3.z - v2.z * v3.x) +
        v1.z * (v2.x * v3.y - v2.y * v3.x));

    if (Math.abs(detM) < 1e-9) return [p1, p2];

    center = new THREE.Vector3(
        (d1 * (v2.y * v3.z - v2.z * v3.y) - v1.y * (d2 * v3.z - v2.z * d3) + v1.z * (d2 * v3.y - v2.y * d3)) / detM,
        (v1.x * (d2 * v3.z - v2.z * d3) - d1 * (v2.x * v3.z - v2.z * v3.x) + v1.z * (v2.x * d3 - d2 * v3.x)) / detM,
        (v1.x * (v2.y * d3 - d2 * v3.y) - v1.y * (v2.x * d3 - d2 * v3.x) + d1 * (v2.x * v3.y - v2.y * v3.x)) / detM
    );

    const radius = Math.sqrt(center.lengthSq() - 1);
    const r1 = p1.clone().sub(center);
    const r2 = p2.clone().sub(center);

    const arcPoints = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        // Slerp or simple arc interpolation
        const p = new THREE.Vector3().lerpVectors(r1, r2, t).normalize().multiplyScalar(radius).add(center);
        arcPoints.push(p);
    }
    return arcPoints;
}

function updateCayley() {
    cayleyGroup.clear();
    const { points, edges } = getCayleyGraph(currentN, currentDepth, viewMatrix);

    // Vertices
    const ptGeom = new THREE.SphereGeometry(0.015, 8, 8);
    const ptMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    points.forEach(p => {
        const pt = new THREE.Mesh(ptGeom, ptMat);
        pt.position.copy(p);
        // Shrink proportional to distance from boundary
        const distToBoundary = 1.0 - p.length();
        pt.scale.setScalar(Math.max(0.1, distToBoundary * 1.5));
        cayleyGroup.add(pt);
    });

    // Color definitions
    const colors = [
        0x38bdf8, // T: Light Blue
        0xf472b6, // X: Pink
        0xfbbf24  // Y: Amber
    ];

    // Create a separate LineSegments object for each type
    for (let type = 0; type < 3; type++) {
        const typeEdges = edges.filter(e => e.type === type);
        if (typeEdges.length === 0) continue;

        const edgePoints = [];
        for (const { u, v } of typeEdges) {
            const geodesic = getHyperbolicGeodesic(points[u], points[v]);
            for (let i = 0; i < geodesic.length - 1; i++) {
                edgePoints.push(geodesic[i], geodesic[i + 1]);
            }
        }

        const lineGeom = new THREE.BufferGeometry().setFromPoints(edgePoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: colors[type],
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const lines = new THREE.LineSegments(lineGeom, lineMat);
        cayleyGroup.add(lines);
    }
}

window.toggleCayley = function () {
    showCayley = !showCayley;
    cayleyGroup.visible = showCayley;

    // Toggle depth control panel visibility
    const depthControl = document.getElementById('depth-control');
    if (depthControl) {
        depthControl.style.display = showCayley ? 'flex' : 'none';
    }

    if (showCayley) updateCayley();
};

window.togglePolyhedron = function () {
    showPolyhedron = !showPolyhedron;
    mesh.visible = showPolyhedron;
};

window.toggleAutoRotate = function () {
    controls.autoRotate = !controls.autoRotate;
};

window.resetCamera = function () {
    camera.position.set(2.5, 1.5, 2.5);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.autoRotate = false;
};

window.updateN = function () {
    const nInput = document.getElementById('n-input');
    const n = parseFloat(nInput.value);
    if (isNaN(n) || n < 1.0) return;
    currentN = n;

    updateDomain();
    if (showCayley) updateCayley();
};

function updateDomain() {
    const { faces, count } = getDirichletFaces(currentN, viewMatrix, currentMaxFaces);
    material.uniforms.u_faces.value = faces;
    material.uniforms.u_faceCount.value = count;
}

window.updateFaceCount = function () {
    const countInput = document.getElementById('face-count-input');
    const c = parseInt(countInput.value);
    if (isNaN(c) || c < 1) return;
    currentMaxFaces = c;
    updateDomain();
};

window.updateDepth = function () {
    const depthInput = document.getElementById('depth-input');
    const d = parseInt(depthInput.value);
    if (isNaN(d) || d < 1) return;
    currentDepth = d;
    if (showCayley) updateCayley();
};

window.animateIsometry = function (name, event) {
    if (animatingIsometry) return;

    const gens = getGenerators(currentN);
    let g;
    if (name === 'T') g = gens[0];
    else if (name === 'X') g = gens[2];
    else if (name === 'Y') g = gens[4];

    if (event.metaKey || event.ctrlKey) {
        g = g.inv();
    }

    const X = g.log();
    const startView = viewMatrix;
    const duration = 1000;
    const startTime = performance.now();
    animatingIsometry = true;

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = t * t * (3 - 2 * t);

        // M(t) = exp(t*X)
        const tX = new Matrix2x2(
            X.a.mul(eased), X.b.mul(eased),
            X.c.mul(eased), X.d.mul(eased)
        );
        const gt = Matrix2x2.exp(tX);
        viewMatrix = startView.mul(gt);

        // Update both Dirichlet domain and Cayley graph
        updateDomain();
        if (showCayley) updateCayley();

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            animatingIsometry = false;
        }
    }
    requestAnimationFrame(step);
};

function animate(time) {
    requestAnimationFrame(animate);
    controls.update();

    // Sync camera position with raymarching shader
    material.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_time.value = time * 0.001;

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

animate(0);
