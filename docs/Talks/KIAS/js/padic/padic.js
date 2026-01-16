class PAdicTower3D {
    constructor(container) {
        this.container = container;
        this.p = 3;
        this.animPhase = 0;
        this.isAnimating = false;
        this.viewMode = 'fiber';

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 10000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        this.camera.position.set(1200, 600, 1200);
        this.controls.update();

        this.initScene();
        this.setupLabels();

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    initScene() {
        // Dispose of the entire scene properly
        while (this.scene.children.length > 0) {
            const child = this.scene.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
            this.scene.remove(child);
        }

        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);
        const point = new THREE.PointLight(0x6366f1, 1.2);
        point.position.set(500, 1000, 500);
        this.scene.add(point);

        this.p = parseInt(document.getElementById('prime-p').value) || 3;
        const maxN = parseInt(document.getElementById('max-n').value) || 3;
        const range = [];
        for (let i = -maxN; i <= maxN; i++) range.push(i);
        this.currentRange = range;

        const stepY = 250;
        const baseRadius = 250;

        range.forEach(n => {
            const r = baseRadius * Math.pow(this.p, -n);
            const torusGeo = new THREE.TorusGeometry(r, 0.5, 16, 64);
            const torusMat = new THREE.MeshBasicMaterial({
                color: n === 0 ? 0x6366f1 : 0x475569,
                transparent: true,
                opacity: 0.15
            });
            const torus = new THREE.Mesh(torusGeo, torusMat);
            torus.rotation.x = Math.PI / 2;
            torus.position.y = n * stepY;
            this.scene.add(torus);
        });

        // POOL PRE-ALLOCATION
        const maxPoints = 400000;
        const sphereGeo = new THREE.SphereGeometry(1, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8 });

        this.instancedPoints = new THREE.InstancedMesh(sphereGeo, sphereMat, maxPoints);
        this.instancedPoints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedPoints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxPoints * 3), 3);
        this.instancedPoints.instanceColor.setUsage(THREE.DynamicDrawUsage);
        this.scene.add(this.instancedPoints);

        const lineGeo = new THREE.BufferGeometry();
        this.linePositions = new Float32Array(maxPoints * 2 * 3);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.2 });
        this.fiberEdges = new THREE.LineSegments(lineGeo, lineMat);
        this.fiberEdges.frustumCulled = false;
        this.scene.add(this.fiberEdges);
    }

    setupLabels() {
        const overlay = document.getElementById('overlay-labels');
        overlay.innerHTML = '';
        const range = this.currentRange || [-3, -2, -1, 0, 1, 2, 3];
        this.labelElements = [];

        range.forEach(n => {
            const div = document.createElement('div');
            div.style.position = 'absolute';
            div.style.color = 'white';
            div.style.pointerEvents = 'none';
            div.style.fontFamily = 'monospace';
            div.style.fontSize = '12px';

            let labelStr;
            if (n === 0) labelStr = "\\(\\mathbb{R}/\\mathbb{Z}\\)";
            else labelStr = `\\(\\mathbb{R}/${this.p}^{${-n}}\\mathbb{Z}\\)`;

            div.innerHTML = labelStr;
            overlay.appendChild(div);
            this.labelElements.push({ el: div, n: n });
        });
        MathJax.typesetPromise();
    }

    onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    reset() {
        this.initScene();
        this.setupLabels();
    }

    resetCamera() {
        this.controls.reset();
        this.camera.position.set(1200, 600, 1200);
        this.controls.update();
    }

    toggleAnimation() {
        this.isAnimating = !this.isAnimating;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.isAnimating) this.animPhase += 0.0015;
        this.controls.update();
        this.updateDynamicElements();
        this.updateLabelPositions();
        this.renderer.render(this.scene, this.camera);
    }

    updateDynamicElements() {
        const stepY = 250;
        const baseRadius = 250;
        const range = this.currentRange || [-3, -2, -1, 0, 1, 2, 3];
        const maxN = (range.length - 1) / 2;
        const theta_base = this.animPhase * 2 * Math.PI;

        let pIdx = 0;
        let lIdx = 0;
        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();

        if (this.viewMode === 'trajectory') {
            range.forEach((n, i) => {
                const r = baseRadius * Math.pow(this.p, -n);
                const theta = theta_base * Math.pow(this.p, n + maxN);
                const x = Math.cos(theta) * r;
                const z = Math.sin(theta) * r;
                const y = n * stepY;

                matrix.makeTranslation(x, y, z);
                matrix.scale(new THREE.Vector3(15, 15, 15));
                this.instancedPoints.setMatrixAt(pIdx, matrix);

                color.setHSL(0.5 + n * 0.05, 0.9, 0.6);
                this.instancedPoints.instanceColor.setXYZ(pIdx, color.r, color.g, color.b);

                if (i > 0) {
                    const prevN = range[i - 1];
                    const prevR = baseRadius * Math.pow(this.p, -prevN);
                    const prevTheta = theta / this.p;
                    const px = Math.cos(prevTheta) * prevR;
                    const pz = Math.sin(prevTheta) * prevR;
                    const py = prevN * stepY;

                    this.linePositions[lIdx++] = x; this.linePositions[lIdx++] = y; this.linePositions[lIdx++] = z;
                    this.linePositions[lIdx++] = px; this.linePositions[lIdx++] = py; this.linePositions[lIdx++] = pz;
                }
                pIdx++;
            });
        } else {
            const maxN = (range.length - 1) / 2;
            const targetTheta = theta_base * Math.pow(this.p, 2 * maxN);
            const topR = baseRadius * Math.pow(this.p, -maxN);
            const topY = maxN * stepY;
            const tx = Math.cos(targetTheta) * topR;
            const tz = Math.sin(targetTheta) * topR;

            matrix.makeTranslation(tx, topY, tz);
            matrix.scale(new THREE.Vector3(15, 15, 15));
            this.instancedPoints.setMatrixAt(pIdx++, matrix);
            this.instancedPoints.instanceColor.setXYZ(0, 1, 1, 1);

            const calculateFiber = (nIdx, parentTheta, pX, pY, pZ, complexity) => {
                if (nIdx < 0 || pIdx >= 395000) return;
                const n = range[nIdx];
                const r = baseRadius * Math.pow(this.p, -n);
                const y = n * stepY;

                for (let k = 0; k < this.p; k++) {
                    const theta = (parentTheta + 2 * Math.PI * k) / this.p;
                    const isZeroBranch = (complexity === 0 && k === 0);
                    const newComplexity = isZeroBranch ? 0 : complexity + 1;
                    const x = Math.cos(theta) * r;
                    const z = Math.sin(theta) * r;

                    // Rate of shrinkage depends on p to keep spheres disjoint
                    const decay = Math.pow(this.p, -0.8);
                    const weight = Math.pow(decay, newComplexity);
                    const size = isZeroBranch ? 12 : (12 * weight);

                    // Matrix
                    matrix.makeTranslation(x, y, z);
                    matrix.scale(new THREE.Vector3(size, size, size));
                    this.instancedPoints.setMatrixAt(pIdx, matrix);

                    // Color based strictly on Complexity (Size/Order)
                    // newComplexity=0 (0-path) is one color, 1 is another, etc.
                    color.setHSL((0.6 + newComplexity * 0.15) % 1.0, isZeroBranch ? 1 : 0.8, 0.45 + weight * 0.2);
                    this.instancedPoints.instanceColor.setXYZ(pIdx, color.r, color.g, color.b);

                    // Edge
                    this.linePositions[lIdx++] = x; this.linePositions[lIdx++] = y; this.linePositions[lIdx++] = z;
                    this.linePositions[lIdx++] = pX; this.linePositions[lIdx++] = pY; this.linePositions[lIdx++] = pZ;

                    pIdx++;
                    if (nIdx > 0 && pIdx < 395000) calculateFiber(nIdx - 1, theta, x, y, z, newComplexity);
                }
            };

            calculateFiber(range.length - 2, targetTheta, tx, topY, tz, 0);
        }

        this.instancedPoints.count = pIdx;
        this.instancedPoints.instanceMatrix.needsUpdate = true;
        this.instancedPoints.instanceColor.needsUpdate = true;

        this.fiberEdges.geometry.attributes.position.needsUpdate = true;
        this.fiberEdges.geometry.setDrawRange(0, lIdx / 3);
    }

    updateLabelPositions() {
        const baseRadius = 250;
        const stepY = 250;

        this.labelElements.forEach(item => {
            const r = baseRadius * Math.pow(this.p, -item.n);
            const y = item.n * stepY;

            const vector = new THREE.Vector3(-r - 60, y, 0);
            vector.project(this.camera);

            const x = (vector.x * 0.5 + 0.5) * this.container.clientWidth;
            const y_screen = (vector.y * -0.5 + 0.5) * this.container.clientHeight;

            if (vector.z > 1) {
                item.el.style.display = 'none';
            } else {
                item.el.style.display = 'block';
                item.el.style.left = `${x}px`;
                item.el.style.top = `${y_screen}px`;
            }
        });
    }
}

let viz;
window.onload = () => {
    viz = new PAdicTower3D(document.getElementById('canvas-container'));
};

function toggleAnimation() { if (viz) viz.toggleAnimation(); }
function resetVisualization() { if (viz) viz.reset(); }
function resetCamera() { if (viz) viz.resetCamera(); }
function updateMode() {
    const modes = document.getElementsByName('view-mode');
    for (let m of modes) {
        if (m.checked) {
            viz.viewMode = m.value;
            break;
        }
    }
}
