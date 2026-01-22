import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { QMath, formatQuaternion } from '../quaternionPackage/projectiveQuaternion.js';
import { areEquivalent } from '../quaternionPackage/factorization.js';

let factorScene, factorCamera, factorRenderer, factorControls;
let factorNodes = [], factorLinks = [], factorAxesMeshes = [];
let factorPrimeAxes = [];
let isDraggingAxis = -1;
let factorRaycaster, factorMouse;
let factorDataCache = null;
let factorCurrentPath = [];
let factorPathMeshes = [];

const units = [
    [1, 0, 0, 0], [-1, 0, 0, 0],
    [0, 1, 0, 0], [0, -1, 0, 0],
    [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 0, 0, 1], [0, 0, 0, -1]
];

export function initFactorVis(container) {
    factorScene = new THREE.Scene();
    factorScene.background = new THREE.Color(0xfdfdfd);

    const aspect = container.clientWidth / container.clientHeight;
    factorCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    factorCamera.position.set(0, 0, 400);

    factorRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    factorRenderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(factorRenderer.domElement);

    factorControls = new OrbitControls(factorCamera, factorRenderer.domElement);
    factorControls.enableDamping = true;

    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    factorScene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(100, 200, 100);
    factorScene.add(dir);

    factorRaycaster = new THREE.Raycaster();
    factorMouse = new THREE.Vector2();

    const canvas = factorRenderer.domElement;
    canvas.addEventListener('mousedown', onFactorMouseDown);
    canvas.addEventListener('mousemove', onFactorMouseMove);
    canvas.addEventListener('mouseup', onFactorMouseUp);

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (factorControls) factorControls.update();
    if (factorRenderer && factorScene) factorRenderer.render(factorScene, factorCamera);
}

export function handleFactorResize(container) {
    if (!factorRenderer || !factorCamera) return;
    factorCamera.aspect = container.clientWidth / container.clientHeight;
    factorCamera.updateProjectionMatrix();
    factorRenderer.setSize(container.clientWidth, container.clientHeight);
}

function createTextSprite(text, fontSize = 32, color = 'black') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    const w = metrics.width + 10;
    const h = fontSize + 10;
    canvas.width = w;
    canvas.height = h;

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    if (ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(0, 0, w, h, 8); ctx.fill();
    } else {
        ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: 0.95 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(w / 8, h / 8, 1);
    sprite.renderOrder = 999;
    return sprite;
}

export function drawFactorComplex(data, container, targetQ) {
    factorDataCache = { data, targetQ };
    container.innerHTML = '';

    if (!factorRenderer) {
        initFactorVis(container);
    } else {
        container.appendChild(factorRenderer.domElement);
    }

    // Clear old
    const toRemove = [];
    factorScene.traverse(obj => { if (obj.isMesh || obj.isLine || obj.isSprite) toRemove.push(obj); });
    toRemove.forEach(o => factorScene.remove(o));

    factorNodes = [];
    factorLinks = [];
    factorAxesMeshes = [];

    const { nodes, links, primes } = data;

    // Initialize Axes
    factorPrimeAxes = primes.map((p, i) => {
        const angle = (2 * Math.PI * i) / primes.length;
        const radius = 60, hStep = 60;
        return new THREE.Vector3(Math.cos(angle) * radius, hStep, Math.sin(angle) * radius);
    });

    // Create Axis Tips
    primes.forEach((p, i) => {
        const tip = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshLambertMaterial({ color: 0xe74c3c }));
        tip.userData = { axisIndex: i, isAxisHandle: true };
        const label = createTextSprite(`p=${p}`, 72, '#e74c3c');
        label.position.set(0, 25, 0);
        tip.add(label);
        tip.userData.label = label;
        factorScene.add(tip);
        factorAxesMeshes.push(tip);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 50, 0)]);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: `hsl(${(p * 40) % 360}, 40%, 70%)`, opacity: 0.4, transparent: true }));
        factorScene.add(line);
        tip.userData.line = line;
    });

    // Create Nodes
    const nodeGeom = new THREE.SphereGeometry(3, 16, 16);
    nodes.forEach(n => {
        const isStart = n.level === 0;
        const isTarget = targetQ && areEquivalent(n.q, targetQ);
        const mesh = new THREE.Mesh(nodeGeom, new THREE.MeshLambertMaterial({ color: isTarget ? 0xffd700 : (isStart ? 0xffffff : 0x3498db) }));
        mesh.userData = { node: n };
        const label = createTextSprite(formatQuaternion(n.q), 48);
        label.visible = false;
        mesh.add(label);
        mesh.userData.label = label;
        factorScene.add(mesh);
        factorNodes.push(mesh);
    });

    // Create Links
    links.forEach(l => {
        const hue = (l.prime * 40) % 360;
        const color = new THREE.Color(`hsl(${hue}, 70%, 50%)`);
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: 0.2 }));
        line.userData = { link: l, color: color };
        const label = createTextSprite(formatQuaternion(l.factor), 42, `hsl(${hue}, 70%, 50%)`);
        label.visible = false;
        factorScene.add(label);
        line.userData.label = label;
        factorScene.add(line);
        factorLinks.push(line);
    });

    updateFactorPositions();
    updateFactorVisLabels();
    factorControls.target.set(0, 100, 0);
}

export function setFactorCurrentPath(path) {
    factorCurrentPath = path;
    updatePathHighlight();
}

export function updatePathHighlight() {
    if (!factorDataCache) return;
    const { links } = factorDataCache.data;
    const targetQ = factorDataCache.targetQ;

    factorPathMeshes.forEach(m => factorScene.remove(m));
    factorPathMeshes = [];

    factorLinks.forEach(l => { l.material.opacity = 0.15; l.material.color.copy(l.userData.color); });
    factorNodes.forEach(m => {
        const n = m.userData.node;
        const isStart = n.level === 0, isTarget = targetQ && areEquivalent(n.q, targetQ);
        m.material.color.set((isStart || isTarget) ? (isTarget ? 0xffd700 : 0xffffff) : 0x3498db);
        m.scale.set(1, 1, 1);
    });

    const pathFactors = [], rawFactors = [];
    factorCurrentPath.forEach((nodeId, i) => {
        const mesh = factorNodes.find(m => m.userData.node.id === nodeId);
        if (mesh) { mesh.material.color.set(0x27ae60); mesh.scale.set(1.5, 1.5, 1.5); }
        if (i > 0) {
            const prevId = factorCurrentPath[i - 1];
            const prevNode = factorNodes.find(m => m.userData.node.id === prevId).userData.node;
            const currNode = mesh.userData.node;
            const nPrev = QMath.normSq(prevNode.q);
            const pi = QMath.multiply(QMath.conjugate(prevNode.q), currNode.q).map(v => v / nPrev);
            rawFactors.push(pi);

            const link = factorLinks.find(l => l.userData.link.source === prevId && l.userData.link.target === nodeId);
            if (link) {
                const sPos = factorNodes.find(m => m.userData.node.id === prevId).position;
                const tPos = mesh.position;
                const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, sPos.distanceTo(tPos), 8), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 }));
                tube.position.copy(sPos).add(tPos).multiplyScalar(0.5);
                tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tPos.clone().sub(sPos).normalize());
                factorScene.add(tube);
                factorPathMeshes.push(tube);
            }
        }
    });

    if (rawFactors.length > 0) {
        const canonicalFactors = [];
        let uTail = [1, 0, 0, 0];
        const lastId = factorCurrentPath[factorCurrentPath.length - 1];
        const lastNodeMesh = factorNodes.find(m => m.userData.node.id === lastId);
        if (lastNodeMesh && targetQ && areEquivalent(lastNodeMesh.userData.node.q, targetQ)) {
            const q = lastNodeMesh.userData.node.q;
            uTail = QMath.multiply(QMath.conjugate(q), targetQ).map(v => Math.round(v / QMath.normSq(q)));
        }

        for (let i = rawFactors.length - 1; i >= 0; i--) {
            const p = QMath.normSq(rawFactors[i]), rho = QMath.multiply(rawFactors[i], uTail);
            let bestV = null, bestPi = null;
            for (const v of units) {
                const piCan = QMath.multiply(QMath.conjugate(v), rho);
                if (!piCan.every(val => Number.isInteger(val))) continue;
                const [w, x, y, z] = piCan.map(val => Math.abs(val % 2));
                let satisfied = (p % 4 === 1) ? (w === 1 && x === 0 && y === 0 && z === 0) : (w === 1 && x === 1 && y === 1 && z === 0);
                if (satisfied) {
                    const first = piCan.findIndex(val => val !== 0);
                    if (first === -1 || piCan[first] > 0) { bestV = v; bestPi = piCan; break; }
                }
            }
            if (!bestV) {
                bestV = [1, 0, 0, 0]; bestPi = rho;
                const first = bestPi.findIndex(val => val !== 0);
                if (first !== -1 && bestPi[first] < 0) { bestPi = bestPi.map(val => -val); bestV = bestV.map(val => -val); }
            }
            canonicalFactors.unshift(bestPi); uTail = bestV;
        }
        pathFactors.push(`(${formatQuaternion(uTail)})`);
        canonicalFactors.forEach(f => pathFactors.push(`(${formatQuaternion(f)})`));
    }

    const lastId = factorCurrentPath[factorCurrentPath.length - 1];
    factorLinks.forEach(l => {
        if (l.userData.link.source === lastId) {
            l.material.opacity = 0.8;
            const target = factorNodes.find(m => m.userData.node.id === l.userData.link.target);
            if (target && !factorCurrentPath.includes(target.userData.node.id)) { target.material.color.set(0xe67e22); target.scale.set(1.2, 1.2, 1.2); }
        }
    });

    const display = document.getElementById('factor-path-display');
    if (display) {
        display.innerHTML = pathFactors.length === 0 ? "Click an orange node to start factoring..." : `<strong>Current Path:</strong><br>$${pathFactors.join('')}$`;
        if (window.MathJax) window.MathJax.typesetPromise([display]);
    }
}

export function updateFactorPositions() {
    if (!factorDataCache) return;
    const nodes = factorDataCache.data.nodes;
    factorPrimeAxes.forEach((vec, i) => {
        const tip = factorAxesMeshes[i]; if (!tip) return;
        const max = nodes.reduce((m, n) => Math.max(m, n.coord[i]), 0);
        tip.position.copy(vec).multiplyScalar(max + 0.8);
        const pos = new Float32Array([0, 0, 0, tip.position.x, tip.position.y, tip.position.z]);
        tip.userData.line.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        tip.userData.line.geometry.attributes.position.needsUpdate = true;
    });
    factorNodes.forEach(mesh => {
        const pos = new THREE.Vector3(0, 0, 0);
        mesh.userData.node.coord.forEach((v, i) => pos.addScaledVector(factorPrimeAxes[i], v));
        mesh.position.copy(pos);
    });
    factorLinks.forEach(line => {
        const l = line.userData.link, s = factorNodes.find(m => m.userData.node.id === l.source), t = factorNodes.find(m => m.userData.node.id === l.target);
        if (s && t) {
            line.geometry.attributes.position.setXYZ(0, s.position.x, s.position.y, s.position.z);
            line.geometry.attributes.position.setXYZ(1, t.position.x, t.position.y, t.position.z);
            line.geometry.attributes.position.needsUpdate = true;
            if (line.userData.label) line.userData.label.position.copy(s.position).add(t.position).multiplyScalar(0.5);
        }
    });
}

export function updateFactorVisLabels() {
    const showV = document.getElementById('factor-labels-vertices')?.checked;
    const showE = document.getElementById('factor-labels-edges')?.checked;
    const showA = document.getElementById('factor-labels-axes')?.checked;
    factorNodes.forEach(m => { if (m.userData.label) m.userData.label.visible = showV; });
    factorLinks.forEach(l => { if (l.userData.label) l.userData.label.visible = showE; });
    factorAxesMeshes.forEach(a => { if (a.userData.label) a.userData.label.visible = showA; });
}

function onFactorMouseDown(e) {
    const rect = factorRenderer.domElement.getBoundingClientRect();
    factorMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    factorMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    factorRaycaster.setFromCamera(factorMouse, factorCamera);

    const axisIntersects = factorRaycaster.intersectObjects(factorAxesMeshes);
    if (axisIntersects.length > 0) { factorControls.enabled = false; isDraggingAxis = axisIntersects[0].object.userData.axisIndex; return; }

    const nodeIntersects = factorRaycaster.intersectObjects(factorNodes);
    if (nodeIntersects.length > 0) {
        const clickedNode = nodeIntersects[0].object.userData.node, lastId = factorCurrentPath[factorCurrentPath.length - 1], idx = factorCurrentPath.indexOf(clickedNode.id);
        if (idx !== -1) {
            if (idx > 0 && idx < factorCurrentPath.length - 1) {
                const prevNode = factorNodes.find(m => m.userData.node.id === factorCurrentPath[idx - 1]).userData.node;
                const nextNode = factorNodes.find(m => m.userData.node.id === factorCurrentPath[idx + 1]).userData.node;
                let a1 = -1, a2 = -1;
                for (let k = 0; k < clickedNode.coord.length; k++) {
                    if (clickedNode.coord[k] > prevNode.coord[k]) a1 = k;
                    if (nextNode.coord[k] > clickedNode.coord[k]) a2 = k;
                }
                if (a1 !== -1 && a2 !== -1 && a1 !== a2) {
                    const altCoordKey = [...prevNode.coord].map((v, i) => i === a2 ? v + 1 : v).join(',');
                    const altNodeMesh = factorNodes.find(m => {
                        const n = m.userData.node; return n.coord.join(',') === altCoordKey && factorLinks.some(l => l.userData.link.source === factorCurrentPath[idx - 1] && l.userData.link.target === n.id) && factorLinks.some(l => l.userData.link.source === n.id && l.userData.link.target === factorCurrentPath[idx + 1]);
                    });
                    if (altNodeMesh) { factorCurrentPath[idx] = altNodeMesh.userData.node.id; updatePathHighlight(); return; }
                }
            }
            factorCurrentPath = factorCurrentPath.slice(0, idx + 1);
        } else {
            if (factorLinks.some(l => l.userData.link.source === lastId && l.userData.link.target === clickedNode.id)) factorCurrentPath.push(clickedNode.id);
            else if (clickedNode.level === 0) factorCurrentPath = [clickedNode.id];
        }
        updatePathHighlight();
    }
}

function onFactorMouseMove(e) {
    if (isDraggingAxis === -1) return;
    const rect = factorRenderer.domElement.getBoundingClientRect();
    factorMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    factorMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(factorCamera.quaternion);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, new THREE.Vector3(0, 0, 0));
    factorRaycaster.setFromCamera(factorMouse, factorCamera);
    const intersectPos = new THREE.Vector3();
    if (factorRaycaster.ray.intersectPlane(plane, intersectPos)) {
        factorPrimeAxes[isDraggingAxis].copy(intersectPos).normalize().multiplyScalar(60);
        updateFactorPositions();
    }
}

function onFactorMouseUp() { isDraggingAxis = -1; factorControls.enabled = true; }
