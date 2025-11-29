import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

function createScene(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(5, 4, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x606060);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Add grid and axes
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // Handle resize
    window.addEventListener('resize', () => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
    });

    return { scene, camera, renderer };
}

class VectorArrow {
    constructor(scene, color, origin = new THREE.Vector3(0, 0, 0), dir = new THREE.Vector3(1, 0, 0)) {
        this.origin = origin;
        this.dir = dir;
        this.color = color;
        this.scene = scene;
        // ArrowHelper(dir, origin, length, color, headLength, headWidth)
        const length = dir.length();
        // Avoid zero length warnings
        const safeDir = length > 0.001 ? dir.clone().normalize() : new THREE.Vector3(0, 1, 0);
        const safeLen = length > 0.001 ? length : 0.001;

        this.arrowHelper = new THREE.ArrowHelper(safeDir, origin, safeLen, color, 0.2 * safeLen, 0.1 * safeLen);
        scene.add(this.arrowHelper);
    }

    update(newDir) {
        this.dir = newDir;
        const length = newDir.length();
        if (length > 0.001) {
            this.arrowHelper.setDirection(newDir.clone().normalize());
            this.arrowHelper.setLength(length, 0.2 * length, 0.1 * length);
            this.arrowHelper.visible = true;
        } else {
            this.arrowHelper.visible = false;
        }
    }

    setOpacity(opacity) {
        this.arrowHelper.line.material.transparent = true;
        this.arrowHelper.line.material.opacity = opacity;
        this.arrowHelper.cone.material.transparent = true;
        this.arrowHelper.cone.material.opacity = opacity;
        this.arrowHelper.line.material.depthWrite = false; // For proper transparency
        this.arrowHelper.cone.material.depthWrite = false;
    }
}

// Matrix definitions
// X = [[0, 1, 0], [1, 0, -1], [0, -1, -1]]
const X = new THREE.Matrix3().set(
    0, 1, 0,
    1, 0, -1,
    0, -1, -1
);

function applyMatrix(m, v) {
    return v.clone().applyMatrix3(m);
}

// Basis vectors
const stdBasis = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1)
];

// Eigenvectors from numpy (as columns)
// Eigenvector matrix:
// [[-0.59100905  0.73697623 -0.32798528]
//  [-0.73697623 -0.32798528  0.59100905]
//  [ 0.32798528  0.59100905  0.73697623]]
// Column 1 (λ ≈ 1.247): [-0.59100905, -0.73697623,  0.32798528]
// Column 2 (λ ≈ -0.445): [ 0.73697623, -0.32798528,  0.59100905]
// Column 3 (λ ≈ -1.802): [-0.32798528,  0.59100905,  0.73697623]
const eigenBasis = [
    new THREE.Vector3(-0.59100905, -0.73697623, 0.32798528),
    new THREE.Vector3(0.73697623, -0.32798528, 0.59100905),
    new THREE.Vector3(-0.32798528, 0.59100905, 0.73697623)
];

function createAnimation1(containerId, vectors) {
    const setup = createScene(containerId);
    if (!setup) return;
    const { scene, camera, renderer } = setup;

    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    const arrows = vectors.map((v, i) => new VectorArrow(scene, colors[i], new THREE.Vector3(0, 0, 0), v));

    let startTime = null;

    function animate(time) {
        requestAnimationFrame(animate);
        if (!startTime) startTime = time;
        const elapsed = (time - startTime) / 1000;

        // Cycle: 6 seconds
        const cycle = elapsed % 6;
        let p = 0;

        if (cycle < 1) p = 0;
        else if (cycle < 3) {
            const t = (cycle - 1) / 2;
            p = t * t * (3 - 2 * t);
        }
        else if (cycle < 5) p = 1;
        else {
            const t = (cycle - 5);
            p = 1 - t * t * (3 - 2 * t);
        }

        vectors.forEach((v, i) => {
            const target = applyMatrix(X, v);
            arrows[i].update(v.clone().lerp(target, p));
        });

        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
}

function createAnimation2(containerId, vectors) {
    const setup = createScene(containerId);
    if (!setup) return;
    const { scene, camera, renderer } = setup;

    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    const arrows = vectors.map((v, i) => new VectorArrow(scene, colors[i], new THREE.Vector3(0, 0, 0), v));

    // Ghosts
    const ghosts = vectors.map((v, i) => {
        const g = new VectorArrow(scene, colors[i], new THREE.Vector3(0, 0, 0), v);
        g.setOpacity(0);
        return g;
    });

    let startTime = null;

    function animate(time) {
        requestAnimationFrame(animate);
        if (!startTime) startTime = time;
        const elapsed = (time - startTime) / 1000;

        // Cycle: 14 seconds
        const cycle = elapsed % 14;

        const smooth = (t) => t * t * (3 - 2 * t);
        let ghostOpacity = 0;

        vectors.forEach((v, i) => {
            const xe = applyMatrix(X, v);
            const x2e = applyMatrix(X, xe);
            const ye = x2e.clone().sub(v.clone().multiplyScalar(2)); // Y = X^2 - 2I

            let current;

            if (cycle < 1) {
                current = v;
            } else if (cycle < 3) {
                const t = (cycle - 1) / 2;
                current = v.clone().lerp(xe, smooth(t));
            } else if (cycle < 4) {
                current = xe;
            } else if (cycle < 6) {
                const t = (cycle - 4) / 2;
                current = xe.clone().lerp(x2e, smooth(t));
            } else if (cycle < 7) {
                current = x2e;
            } else if (cycle < 8) {
                current = x2e;
                ghostOpacity = (cycle - 7);
            } else if (cycle < 10) {
                const t = (cycle - 8) / 2;
                current = x2e.clone().lerp(ye, smooth(t));
                ghostOpacity = 1;
            } else if (cycle < 13) {
                current = ye;
                ghostOpacity = 1;
            } else {
                current = v;
                ghostOpacity = 0;
            }

            arrows[i].update(current);

            // Update ghosts (always at X^2e position)
            ghosts[i].update(x2e);
            ghosts[i].setOpacity(ghostOpacity * 0.3);
        });

        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);
}

// Run animations
createAnimation1('viz1', stdBasis);
createAnimation1('viz1_eigen', eigenBasis);
createAnimation2('viz2', stdBasis);
createAnimation2('viz2_eigen', eigenBasis);
