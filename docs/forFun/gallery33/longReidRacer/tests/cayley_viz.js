import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============= MATH HELPERS (Copied from game.js) =============

class Complex {
    constructor(re, im) {
        this.re = re;
        this.im = im;
    }
    add(other) { return new Complex(this.re + other.re, this.im + other.im); }
    sub(other) { return new Complex(this.re - other.re, this.im - other.im); }
    mul(other) {
        return new Complex(
            this.re * other.re - this.im * other.im,
            this.re * other.im + this.im * other.re
        );
    }
    div(other) {
        const d = other.re * other.re + other.im * other.im;
        return new Complex(
            (this.re * other.re + this.im * other.im) / d,
            (this.im * other.re - this.re * other.im) / d
        );
    }
    abs() { return Math.sqrt(this.re * this.re + this.im * this.im); }
    conj() { return new Complex(this.re, -this.im); }
}

function toComplexMatrix(m) {
    return {
        a: new Complex(m.elements[0][0].toNumber(), 0),
        b: new Complex(m.elements[0][1].toNumber(), 0),
        c: new Complex(m.elements[1][0].toNumber(), 0),
        d: new Complex(m.elements[1][1].toNumber(), 0)
    };
}

function applyMobius(z, m) {
    const num = m.a.mul(z).add(m.b);
    const den = m.c.mul(z).add(m.d);
    return num.div(den);
}

function mapToDisk(z) {
    const i = new Complex(0, 1);
    return z.sub(i).div(z.add(i));
}

// ============= THREE.JS SETUP =============

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// Add fog for depth perception (simulates hyperbolic distance attenuation)
// Exponential fog works well for hyperbolic space since volume grows exponentially
scene.fog = new THREE.FogExp2(0x000000, 0.08); // Density controls how quickly things fade

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Position camera at the origin (identity matrix) at ground level, looking forward
camera.position.set(0, 0.5, 0); // Slightly above ground
camera.lookAt(0, 0.5, -10); // Look forward into the space

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, -10); // Look forward
controls.update();

// Lights - Enhanced for better visibility
const ambientLight = new THREE.AmbientLight(0x808080, 1.5); // Brighter ambient
scene.add(ambientLight);

// Main directional light from above
const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight1.position.set(5, 10, 5);
scene.add(dirLight1);

// Fill light from the side
const dirLight2 = new THREE.DirectionalLight(0x6699ff, 0.8);
dirLight2.position.set(-5, 5, -5);
scene.add(dirLight2);

// Back light for depth
const dirLight3 = new THREE.DirectionalLight(0xff9966, 0.5);
dirLight3.position.set(0, 5, -10);
scene.add(dirLight3);

// Point light for highlights
const pointLight = new THREE.PointLight(0xffffff, 2, 100);
pointLight.position.set(10, 15, 10);
scene.add(pointLight);

// Helpers
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Ground plane (Poincaré disk boundary approximation)
const diskGeometry = new THREE.CircleGeometry(10, 64);
const diskMaterial = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
const disk = new THREE.Mesh(diskGeometry, diskMaterial);
disk.rotation.x = -Math.PI / 2;
scene.add(disk);

// ============= GRAPH GENERATION =============

const queue = [];
const visited = new Set();
const SCALE = 10; // Radius of disk in 3D units
const HEIGHT_SCALE = 1;

// Initialize BFS
const center = Matrix.identity();
const i = new Complex(0, 1);
const initialPos = mapToDisk(applyMobius(i, toComplexMatrix(center)));

const rootNode = {
    matrix: center,
    level: 0,
    pos: initialPos,
    height: center.getPrimeFactorCount(),
    parentPos: null
};

queue.push(rootNode);
visited.add(center.toString());

// Visuals
const nodeGeometry = new THREE.SphereGeometry(0.3, 16, 16); // Slightly larger nodes
const nodeMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x888888,
    transparent: true,
    opacity: 0.8,
    linewidth: 2 // Note: linewidth > 1 only works with WebGLRenderer on some platforms
});

let nodeCount = 0;
const MAX_NODES = 2000; // Limit to prevent crash
const GENERATION_SPEED = 5; // Nodes per frame

function processQueue() {
    if (queue.length === 0 || nodeCount >= MAX_NODES) return;

    for (let k = 0; k < GENERATION_SPEED; k++) {
        if (queue.length === 0) break;

        const current = queue.shift();
        nodeCount++;

        // Draw Node
        // Map disk (x, y) to 3D (x, z) and height to y
        const x = current.pos.re * SCALE;
        const z = current.pos.im * SCALE;
        const y = current.height * HEIGHT_SCALE;

        // Calculate hyperbolic scaling factor
        // In Poincaré disk model, hyperbolic distance from origin relates to Euclidean radius r
        // The metric factor is 2/(1-r²), so objects should scale by (1-r²)/2 to maintain constant hyperbolic size
        const r = current.pos.abs(); // Euclidean distance from origin in disk
        const hyperbolicScale = (1 - r * r) / 2;
        const scaledRadius = 0.3 * Math.max(0.1, hyperbolicScale); // Clamp to avoid too-small spheres

        const scaledGeometry = new THREE.SphereGeometry(scaledRadius, 16, 16);
        const nodeMesh = new THREE.Mesh(scaledGeometry, nodeMaterial);
        nodeMesh.position.set(x, y, z);

        // Color based on word length (level in BFS)
        // Rainbow gradient: red (0) -> orange -> yellow -> green -> blue -> violet
        const hue = (current.level * 30) % 360; // 30 degrees per level
        nodeMesh.material = new THREE.MeshPhongMaterial({ color: `hsl(${hue}, 100%, 50%)` });

        scene.add(nodeMesh);

        // Draw Edge to Parent
        if (current.parentPos) {
            const px = current.parentPos.re * SCALE;
            const pz = current.parentPos.im * SCALE;
            const py = current.parentHeight * HEIGHT_SCALE;

            const points = [];
            points.push(new THREE.Vector3(px, py, pz));
            points.push(new THREE.Vector3(x, y, z));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, edgeMaterial);
            scene.add(line);
        }

        // Add neighbors
        if (current.level < 6) { // Depth limit
            const moves = [
                { m: Matrix.A },
                { m: Matrix.A_inv },
                { m: Matrix.B },
                { m: Matrix.B_inv }
            ];

            for (let move of moves) {
                const nextM = current.matrix.mul(move.m);
                const key = nextM.toString();
                if (!visited.has(key)) {
                    visited.add(key);
                    const nextPos = mapToDisk(applyMobius(i, toComplexMatrix(nextM)));
                    queue.push({
                        matrix: nextM,
                        level: current.level + 1,
                        pos: nextPos,
                        height: nextM.getPrimeFactorCount(),
                        parentPos: current.pos,
                        parentHeight: current.height
                    });
                }
            }
        }
    }

    document.getElementById('status').innerText = `${nodeCount} nodes`;
}

// ============= ANIMATION LOOP =============

function animate() {
    requestAnimationFrame(animate);

    processQueue();
    controls.update();
    renderer.render(scene, camera);
}

animate();

// Handle resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
