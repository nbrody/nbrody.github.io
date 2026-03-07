class PAdicTower3D {
    constructor(container) {
        this.container = container;
        this.p = 3;
        this.animPhase = 0;
        this.isAnimating = false;
        this.growthDist = 100;
        this.targetGrowthDist = 100;

        // PGL2 State
        this.resetWorldMatrix();

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 1, 1000000); // Increased far plane
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.maxDistance = 500000; // Allow sufficient zoom out for large p, but stay within far plane

        this.camera.position.set(1200, 600, 1200);
        this.controls.update();

        this.initScene();
        this.setupLabels();

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    resetWorldMatrix() {
        this.worldMatrix = new BigMat(1n, 0n, 0n, 1n);
        this.updateMatrixDisplay();
    }

    updateMatrixDisplay() {
        const el = document.getElementById('matrix-display');
        if (!el) return;
        const pad = (s) => s.padStart(5, ' ');
        el.textContent = `[ ${pad(this.worldMatrix.a.toString())}  ${pad(this.worldMatrix.b.toString())} ]\n[ ${pad(this.worldMatrix.c.toString())}  ${pad(this.worldMatrix.d.toString())} ]`;
    }

    initScene() {
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
        const point1 = new THREE.PointLight(0x6366f1, 1.2);
        point1.position.set(500, 1000, 500);
        this.scene.add(point1);
        const point2 = new THREE.PointLight(0xffffff, 0.8);
        point2.position.set(-500, -500, -500);
        this.scene.add(point2);

        this.p = parseInt(document.getElementById('prime-p').value) || 3;
        const maxN = parseInt(document.getElementById('max-n').value) || 3;
        const range = [];
        for (let i = -maxN; i <= maxN; i++) range.push(i);
        this.currentRange = range;

        const stepY = 250;
        const baseRadius = 250;

        range.forEach(n => {
            const r = baseRadius * Math.pow(this.p, n);
            const torusGeo = new THREE.TorusGeometry(r, 0.5, 16, 64);
            const torusMat = new THREE.MeshBasicMaterial({
                color: n === 0 ? 0x6366f1 : 0x475569,
                transparent: true,
                opacity: 0.1
            });
            const torus = new THREE.Mesh(torusGeo, torusMat);
            torus.rotation.x = Math.PI / 2;
            torus.position.y = -n * stepY;
            this.scene.add(torus);
        });

        const maxPoints = 400000;
        const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
        const sphereMat = new THREE.MeshPhongMaterial({
            transparent: true,
            opacity: 0.9,
            shininess: 100,
            specular: 0x444444
        });

        this.instancedPoints = new THREE.InstancedMesh(sphereGeo, sphereMat, maxPoints);
        this.instancedPoints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedPoints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxPoints * 3), 3);
        this.instancedPoints.instanceColor.setUsage(THREE.DynamicDrawUsage);
        this.instancedPoints.frustumCulled = false; // Prevent premature culling of bulk particles
        this.scene.add(this.instancedPoints);

        const lineGeo = new THREE.BufferGeometry();
        this.linePositions = new Float32Array(maxPoints * 2 * 3);
        this.lineColors = new Float32Array(maxPoints * 2 * 3);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
        lineGeo.setAttribute('color', new THREE.BufferAttribute(this.lineColors, 3));
        const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
        this.fiberEdges = new THREE.LineSegments(lineGeo, lineMat);
        this.fiberEdges.frustumCulled = false;
        this.scene.add(this.fiberEdges);
    }

    setupLabels() {
        const overlay = document.getElementById('overlay-labels');
        overlay.innerHTML = '';
        const range = this.currentRange || [-3, -2, -1, 0, 1, 2, 3];
        this.labelElements = [];
        this.showLabels = false;

        range.forEach(n => {
            const div = document.createElement('div');
            div.className = 'layer-label';
            div.style.position = 'absolute';
            div.style.color = 'white';
            div.style.pointerEvents = 'none';
            div.style.fontFamily = 'monospace';
            div.style.fontSize = '12px';
            div.style.opacity = '0.8';

            let labelStr;
            if (n === 0) labelStr = "\\(\\mathbb{R}/\\mathbb{Z}\\)";
            else if (n > 0) labelStr = `\\(\\mathbb{R}/p^{${n}}\\mathbb{Z}\\)`;
            else labelStr = `\\(\\mathbb{R}/p^{${n}}\\mathbb{Z}\\)`; // Handling negative n consistently

            div.innerHTML = labelStr;
            overlay.appendChild(div);
            this.labelElements.push({ el: div, n: n });
        });
        MathJax.typesetPromise();

        // Listen for drag events to show/hide labels
        this.controls.addEventListener('start', () => {
            this.showLabels = true;
            this.updateLabelVisibility();
        });
        this.controls.addEventListener('end', () => {
            this.showLabels = false;
            this.updateLabelVisibility();
        });

        this.updateLabelVisibility();
    }

    updateLabelVisibility() {
        const overlay = document.getElementById('overlay-labels');
        if (overlay) overlay.style.display = this.showLabels ? 'block' : 'none';
    }

    onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    reset() {
        this.growthDist = 100;
        this.targetGrowthDist = 100;
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

    growTree() {
        if (this.targetGrowthDist >= 14) {
            this.growthDist = 0;
            this.targetGrowthDist = 0;
        }
        this.targetGrowthDist += 1;
        this.isAnimating = false;
    }

    applyAction(a, b, c, d) {
        const M = new BigMat(a, b, c, d);
        this.prevWorldMatrix = this.worldMatrix;
        this.worldMatrix = M.mul(this.worldMatrix);
        this.transitionTime = 0;
        this.isTransitioning = true;
        this.updateMatrixDisplay();
    }

    resetAction() {
        this.prevWorldMatrix = this.worldMatrix;
        this.worldMatrix = new BigMat(1n, 0n, 0n, 1n);
        this.transitionTime = 0;
        this.isTransitioning = true;
        this.updateMatrixDisplay();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (this.isAnimating) this.animPhase += 0.001;

        if (this.isTransitioning) {
            this.transitionTime += 0.015; // Animation speed
            if (this.transitionTime >= 1.0) {
                this.transitionTime = 1.0;
                this.isTransitioning = false;
            }
        }

        if (this.growthDist < this.targetGrowthDist) {
            this.growthDist += Math.min(0.04, this.targetGrowthDist - this.growthDist);
        }

        this.controls.update();
        this.updateDynamicElements();
        this.updateLabelPositions();
        this.renderer.render(this.scene, this.camera);
    }

    getTreeDistance(q, n) {
        const vn = n;
        const vq = q.val(this.p);
        const vmin = Math.min(vn, vq, 0);
        return n - 2 * vmin;
    }

    qToTheta(qFrac, n) {
        const bigP = BigInt(this.p);
        const pn = new BigFrac(bigP ** BigInt(Math.max(0, n)), bigP ** BigInt(Math.max(0, -n)));
        const ratio = qFrac.div(pn).toNumber();
        return (ratio % 1.0) * 2 * Math.PI;
    }

    getTransformedVertex(matrix, q, n) {
        const bigP = BigInt(this.p);
        const pn = new BigFrac(bigP ** BigInt(Math.max(0, n)), bigP ** BigInt(Math.max(0, -n)));
        const V = new BigMat(pn, q, 0n, 1n);
        const MPrime = matrix.mul(V);
        return MPrime.getOrientedIwasawa(this.p);
    }

    getPosForMatrix(matrix, q, n, t_offset) {
        const stepY = 250;
        const baseRadius = 250;
        const { n: nPrime, q: qPrime } = this.getTransformedVertex(matrix, q, n);
        const r = baseRadius * Math.pow(this.p, nPrime);
        const y = -nPrime * stepY;
        const theta = this.qToTheta(qPrime, nPrime);
        return {
            x: Math.cos(theta + t_offset) * r,
            y: y,
            z: Math.sin(theta + t_offset) * r,
            nPrime,
            qPrime
        };
    }

    updateDynamicElements() {
        const range = this.currentRange || [-3, -2, -1, 0, 1, 2, 3];
        const t_offset = this.animPhase * 2 * Math.PI;

        let pIdx = 0;
        let lIdx = 0;
        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();
        this.vertexMetaData = [];

        const renderVertex = (q, n, complexity, pX, pY, pZ, pColor, pGrowFactor, isRoot = false) => {
            let pos;
            let nForColor;
            let qMeta, nMeta;

            if (this.isTransitioning && this.prevWorldMatrix) {
                const posA = this.getPosForMatrix(this.prevWorldMatrix, q, n, t_offset);
                const posB = this.getPosForMatrix(this.worldMatrix, q, n, t_offset);
                const t = this.transitionTime;
                const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                pos = {
                    x: posA.x + (posB.x - posA.x) * ease,
                    y: posA.y + (posB.y - posA.y) * ease,
                    z: posA.z + (posB.z - posA.z) * ease
                };
                nForColor = posA.nPrime + (posB.nPrime - posA.nPrime) * ease;
                qMeta = posB.qPrime;
                nMeta = posB.nPrime;
            } else {
                const posFinal = this.getPosForMatrix(this.worldMatrix, q, n, t_offset);
                pos = posFinal;
                nForColor = posFinal.nPrime;
                qMeta = posFinal.qPrime;
                nMeta = posFinal.nPrime;
            }

            const dist = this.getTreeDistance(qMeta, nMeta);
            const denom = Number(qMeta.d);
            const simplicity = 1.0 / Math.sqrt(denom);
            const growFactor = Math.max(0, Math.min(1, (this.growthDist - dist) * 2));
            const size = (35 / (1 + 0.4 * dist)) * growFactor;

            matrix.makeTranslation(pos.x, pos.y, pos.z);
            matrix.scale(new THREE.Vector3(size, size, size));
            this.instancedPoints.setMatrixAt(pIdx, matrix);

            const logic = document.getElementById('color-logic')?.value || 'distance';
            let v = 0;
            if (logic === 'distance') v = (dist % 10) / 10.0;
            else if (logic === 'metric') v = (dist * 0.05) % 1.0;
            else if (logic === 'level') v = (nForColor * 0.15 + 10.0) % 1.0;
            else if (logic === 'residue') v = this.qToTheta(qMeta, nMeta) / (2 * Math.PI);

            const palette = document.getElementById('color-palette')?.value || 'vibrant';
            let hue = 0, sat = 0.8, bri = 0.35 + 0.45 * simplicity;

            if (palette === 'vibrant') { hue = (0.6 - v + 1.0) % 1.0; sat = 0.85; }
            else if (palette === 'rainbow') { hue = (v < 0.05) ? 0 : (v - 0.05) * 0.9; sat = 1.0; bri = 0.4; }
            else if (palette === 'vaporwave') { hue = (0.8 - v * 0.3 + 1.0) % 1.0; sat = 0.95; bri = 0.4 + 0.4 * simplicity; }
            else if (palette === 'ocean') { hue = 0.5 + v * 0.2; sat = 0.7; }
            else if (palette === 'fire') { hue = 0.0 + v * 0.15; sat = 0.9; }
            else if (palette === 'forest') { hue = 0.2 + v * 0.2; sat = 0.6; }
            else if (palette === 'slate') { hue = 0.6; sat = 0.1 + v * 0.3; bri = 0.2 + 0.5 * simplicity + v * 0.1; }

            color.setHSL(hue % 1.0, sat, bri);
            const vColor = color.clone();
            this.instancedPoints.instanceColor.setXYZ(pIdx, vColor.r, vColor.g, vColor.b);

            if (pX !== undefined) {
                this.linePositions[lIdx] = pos.x; this.linePositions[lIdx + 1] = pos.y; this.linePositions[lIdx + 2] = pos.z;
                this.linePositions[lIdx + 3] = pX; this.linePositions[lIdx + 4] = pY; this.linePositions[lIdx + 5] = pZ;
                const weight = (0.1 + 0.6 * simplicity * (size / 35)) * growFactor * (pGrowFactor || 0);
                const pc = pColor || vColor;
                this.lineColors[lIdx] = vColor.r * weight; this.lineColors[lIdx + 1] = vColor.g * weight; this.lineColors[lIdx + 2] = vColor.b * weight;
                this.lineColors[lIdx + 3] = pc.r * weight; this.lineColors[lIdx + 4] = pc.g * weight; this.lineColors[lIdx + 5] = pc.b * weight;
                lIdx += 6;
            }

            this.vertexMetaData[pIdx] = { q: qMeta, n: nMeta };
            pIdx++;
            return { pos, color: vColor, growFactor };
        };

        const drawMode = document.getElementById('draw-mode')?.value || 'levels';
        const maxNodes = 80000;

        if (drawMode === 'levels') {
            const rootN = range[0];
            const bigP = BigInt(this.p);
            const buildTree = (q, n, nIdx, complexity, pX, pY, pZ, pColor, pGrowFactor) => {
                if (nIdx >= range.length || pIdx >= maxNodes) return;
                const result = renderVertex(q, n, complexity, pX, pY, pZ, pColor, pGrowFactor, (complexity === 0));
                const nextNIdx = nIdx + 1;
                if (nextNIdx < range.length) {
                    const nextN = range[nextNIdx];
                    const pPowN = new BigFrac(bigP ** BigInt(Math.max(0, n)), bigP ** BigInt(Math.max(0, -n)));
                    for (let k = 0; k < this.p; k++) {
                        buildTree(q.add(new BigFrac(BigInt(k)).mul(pPowN)), nextN, nextNIdx, complexity + 1, result.pos.x, result.pos.y, result.pos.z, result.color, result.growFactor);
                    }
                }
            };
            buildTree(new BigFrac(0n), rootN, 0, 0, undefined, undefined, undefined, undefined, 1.0);
        } else {
            const bigP = BigInt(this.p);
            const visited = new Set();
            let maxRad = Math.min(parseInt(document.getElementById('max-n').value) || 3, 8);
            if (this.p >= 5) maxRad = Math.min(maxRad, 5);

            const queue = [{ q: new BigFrac(0n), n: 0, dist: 0, px: undefined, py: undefined, pz: undefined, pc: undefined, pgf: 1.0 }];
            visited.add("0/1_0");
            let head = 0;

            while (head < queue.length && pIdx < maxNodes) {
                const item = queue[head++];
                const result = renderVertex(item.q, item.n, item.dist, item.px, item.py, item.pz, item.pc, item.pgf, (item.dist === 0));
                if (item.dist < maxRad) {
                    const neighbors = [{ q: item.q.modPn(this.p, item.n - 1), n: item.n - 1 }];
                    const pPowN = new BigFrac(bigP ** BigInt(Math.max(0, item.n)), bigP ** BigInt(Math.max(0, -item.n)));
                    for (let k = 0; k < this.p; k++) neighbors.push({ q: item.q.add(new BigFrac(BigInt(k)).mul(pPowN)), n: item.n + 1 });

                    for (const nb of neighbors) {
                        const key = `${nb.q.n}/${nb.q.d}_${nb.n}`;
                        if (!visited.has(key)) {
                            visited.add(key);
                            queue.push({ q: nb.q, n: nb.n, dist: item.dist + 1, px: result.pos.x, py: result.pos.y, pz: result.pos.z, pc: result.color, pgf: result.growFactor });
                        }
                    }
                }
            }
        }

        this.instancedPoints.count = pIdx;
        this.instancedPoints.instanceMatrix.needsUpdate = true;
        this.instancedPoints.instanceColor.needsUpdate = true;
        this.fiberEdges.geometry.attributes.position.needsUpdate = true;
        this.fiberEdges.geometry.attributes.color.needsUpdate = true;
        this.fiberEdges.geometry.setDrawRange(0, lIdx / 3);
    }

    updateLabelPositions() {
        const baseRadius = 250;
        const stepY = 250;
        this.labelElements.forEach(item => {
            const r = baseRadius * Math.pow(this.p, item.n);
            const y = -item.n * stepY;
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

        // Handle Hover Tooltip with MathJax
        if (this.hoverInfo) {
            const vector = this.hoverInfo.worldPos.clone().project(this.camera);
            const x = (vector.x * 0.5 + 0.5) * this.container.clientWidth;
            const y = (vector.y * -0.5 + 0.5) * this.container.clientHeight;
            if (vector.z > 1 || x < 0 || y < 0) {
                if (this.tooltip) this.tooltip.style.display = 'none';
            } else if (this.tooltip) {
                this.tooltip.style.display = 'block';
                this.tooltip.style.left = `${x + 10}px`;
                this.tooltip.style.top = `${y - 20}px`;

                const tex = `\\(\\lfloor ${this.hoverInfo.q.toString()} \\rfloor_{${this.hoverInfo.n}}\\)`;
                if (this.tooltip.innerHTML !== tex) {
                    this.tooltip.innerHTML = tex;
                    if (window.MathJax) {
                        MathJax.typesetPromise([this.tooltip]);
                    }
                }
            }
        } else if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
    }

    pulseIsometry(a, b, c, d) {
        const M = new BigMat(a, b, c, d);
        const Minv = M.inv();
        this.applyAction(M.a, M.b, M.c, M.d);
        setTimeout(() => {
            this.applyAction(Minv.a, Minv.b, Minv.c, Minv.d);
        }, 1500); // 1.5s delay before inverse action
    }
}

let viz;
window.onload = () => {
    viz = new PAdicTower3D(document.getElementById('canvas-container'));

    // Create Tooltip
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'rgba(15, 23, 42, 0.9)';
    tooltip.style.padding = '6px 10px';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '12px';
    tooltip.style.color = 'white';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.fontFamily = 'monospace';
    tooltip.style.border = '1px solid #334155';
    tooltip.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.5)';
    document.body.appendChild(tooltip);
    viz.tooltip = tooltip;

    // Mouse events for raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('mousemove', (e) => {
        const rect = viz.renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, viz.camera);
        const intersects = raycaster.intersectObject(viz.instancedPoints);
        if (intersects.length > 0) {
            const id = intersects[0].instanceId;
            const meta = viz.vertexMetaData[id];
            if (meta) {
                const worldMatrix = new THREE.Matrix4();
                viz.instancedPoints.getMatrixAt(id, worldMatrix);
                const pos = new THREE.Vector3();
                pos.setFromMatrixPosition(worldMatrix);
                viz.hoverInfo = { q: meta.q, n: meta.n, worldPos: pos };
            }
        } else {
            viz.hoverInfo = null;
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('embed') === 'true') {
        document.body.classList.add('embedded');
    }
    if (urlParams.get('grow') === '1') {
        viz.growTree();
    }
};

window.addEventListener('message', (event) => {
    if (event.data === 'grow') {
        if (viz) viz.growTree();
    } else if (event.data === 'toggle') {
        if (viz) viz.toggleAnimation();
    } else if (event.data === 'isoA') {
        if (viz) viz.pulseIsometry(3n, 0n, 0n, 1n);
    } else if (event.data === 'isoT') {
        if (viz) viz.pulseIsometry(1n, 1n, 0n, 1n);
    } else if (event.data === 'isoS') {
        if (viz) viz.pulseIsometry(0n, -1n, 1n, 0n);
    }
});

function toggleAnimation() { if (viz) viz.toggleAnimation(); }
function resetVisualization() { if (viz) viz.reset(); }
function resetCamera() { if (viz) viz.resetCamera(); }
function applyAction() {
    if (!viz) return;
    const a = document.getElementById('mat-a').value;
    const b = document.getElementById('mat-b').value;
    const c = document.getElementById('mat-c').value;
    const d = document.getElementById('mat-d').value;
    viz.applyAction(a, b, c, d);
}
function resetAction() { if (viz) viz.resetAction(); }
function growTree() { if (viz) viz.growTree(); }
function toggleLabels() { if (viz) viz.updateLabelVisibility(); }
function updateColors() { if (viz) viz.updateDynamicElements(); }

