import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// -----------------------------
// Parameters & State
// -----------------------------
const params = {
    depthT3: 3,
    depthT4: 3,
    sqOpacity: 0.15,
    vertexSize: 3,
    zMix: 1.0,
    spacingT3: 130,
    spacingT4: 130,
    speed: 5,
    showLink: false,
    linkRadius: 80
};

let time = 0;
window.isPlaying = true;
const speedMult = 0.002;

// -----------------------------
// Tree generation
// -----------------------------
function buildRegularTree(k, D, baseStep) {
    const nodes = [{ id: 0, depth: 0, parent: -1, children: [], pos: [0, 0], angle: 0, sector: 2 * Math.PI }];
    const edges = [];
    let nextId = 1;

    const radii = [0];
    let currentR = 0;
    let currentL = baseStep;
    for (let d = 1; d <= D; d++) {
        currentR += currentL;
        radii.push(currentR);
        currentL *= 0.55;
    }

    function addChildren(parentId, currentDepth) {
        if (currentDepth >= D) return;
        const parent = nodes[parentId];
        const isRoot = (currentDepth === 0);
        const numChildren = isRoot ? k : (k - 1);

        const startAngle = isRoot ? (-Math.PI / 2) - Math.PI : (parent.angle - parent.sector / 2);
        const slice = isRoot ? (2 * Math.PI / numChildren) : (parent.sector / numChildren);

        for (let i = 0; i < numChildren; i++) {
            const angle = startAngle + (i + 0.5) * slice;
            const child = {
                id: nextId++,
                depth: currentDepth + 1,
                parent: parentId,
                children: [],
                angle: angle,
                sector: slice,
                pos: [
                    radii[currentDepth + 1] * Math.cos(angle),
                    radii[currentDepth + 1] * Math.sin(angle)
                ]
            };
            nodes.push(child);
            parent.children.push(child.id);
            edges.push([parentId, child.id]);
            addChildren(child.id, currentDepth + 1);
        }
    }

    addChildren(0, 0);
    return { nodes, edges };
}

// -----------------------------
// 4D Projection Engine
// -----------------------------
function getProjectedPoint(p4) {
    let x = p4[0], y = p4[1], z = p4[2], w = p4[3];
    z *= params.zMix;
    w *= params.zMix;

    // Rotate blue tree in its xy-plane (keeps 2D spread)
    const a1 = time * 0.3;
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const rx = x * c1 - y * s1;
    const ry = x * s1 + y * c1;

    // Rotate red tree in its zw-plane (keeps 2D spread)
    const a2 = time * 0.2;
    const c2 = Math.cos(a2), s2 = Math.sin(a2);
    const rz = z * c2 - w * s2;
    const rw = z * s2 + w * c2;

    // Project 4D → 3D guaranteeing both trees stay 2D:
    //   Blue tree (rx, ry) → always spans (out_x, out_y)
    //   Red tree  (rz, rw) → always spans (out_z, out_y)
    // They share the y-axis for depth.

    // Gentle cross-plane tilt oscillation (max ~14°, never collapses)
    const tilt = 0.25 * Math.sin(time * 0.08);
    const ct = Math.cos(tilt), st = Math.sin(tilt);

    return new THREE.Vector3(
        rx * ct - rz * st,
        ry * 0.7 + rw * 0.7,
        rx * st + rz * ct
    );
}

// -----------------------------
// Scene Setup
// -----------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x020617, 300, 2500);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(400, 300, 800);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dir = new THREE.DirectionalLight(0xffffff, 1.5);
dir.position.set(100, 200, 100);
scene.add(dir);

const p1 = new THREE.PointLight(0x6366f1, 2, 2000);
p1.position.set(200, 300, 200);
scene.add(p1);

const blueMat = new THREE.MeshStandardMaterial({ color: 0x00ccff, roughness: 0.3, metalness: 0.8 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.3, metalness: 0.8 });
const squareMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: params.sqOpacity, depthWrite: false });
const vertexMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.9 });

const blueGroup = new THREE.Group();
const redGroup = new THREE.Group();
const squareGroup = new THREE.Group();
const vertexGroup = new THREE.Group();
const linkGroup = new THREE.Group();
scene.add(blueGroup, redGroup, squareGroup, vertexGroup, linkGroup);

let t1, t2, productNodes4D, nodeMap;
let blueEdges = [], redEdges = [], squareMeshes = [], vertexMesh;
let linkSphere, linkEdges = [], linkVertices = [];

function rebuild() {
    [blueGroup, redGroup, squareGroup, vertexGroup, linkGroup].forEach(g => {
        while (g.children.length) {
            const c = g.children.pop();
            if (c.geometry) c.geometry.dispose();
        }
    });
    blueEdges = []; redEdges = []; squareMeshes = []; linkEdges = []; linkVertices = [];

    t1 = buildRegularTree(3, params.depthT3, params.spacingT3);
    t2 = buildRegularTree(4, params.depthT4, params.spacingT4);

    productNodes4D = [];
    nodeMap = new Map();
    t1.nodes.forEach(u => {
        t2.nodes.forEach(v => {
            const id = productNodes4D.length;
            nodeMap.set(`${u.id},${v.id}`, id);
            productNodes4D.push([u.pos[0], u.pos[1], v.pos[0], v.pos[1]]);
        });
    });

    const cylGeo = new THREE.CylinderGeometry(1.5, 1.5, 1, 8);
    cylGeo.rotateX(Math.PI / 2);

    t1.edges.forEach(([u0, u1]) => {
        t2.nodes.forEach(v => {
            const mesh = new THREE.Mesh(cylGeo, blueMat);
            mesh.userData = { source: nodeMap.get(`${u0},${v.id}`), target: nodeMap.get(`${u1},${v.id}`) };
            blueEdges.push(mesh);
            blueGroup.add(mesh);
        });
    });

    t2.edges.forEach(([v0, v1]) => {
        t1.nodes.forEach(u => {
            const mesh = new THREE.Mesh(cylGeo, redMat);
            mesh.userData = { source: nodeMap.get(`${u.id},${v0}`), target: nodeMap.get(`${u.id},${v1}`) };
            redEdges.push(mesh);
            redGroup.add(mesh);
        });
    });

    if (params.sqOpacity > 0.001) {
        t1.edges.forEach(([u0, u1]) => {
            t2.edges.forEach(([v0, v1]) => {
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
                const mesh = new THREE.Mesh(geo, squareMat);
                mesh.userData = {
                    pts: [
                        nodeMap.get(`${u0},${v0}`),
                        nodeMap.get(`${u1},${v0}`),
                        nodeMap.get(`${u1},${v1}`),
                        nodeMap.get(`${u0},${v1}`)
                    ]
                };
                squareMeshes.push(mesh);
                squareGroup.add(mesh);
            });
        });
    }

    const sphereGeo = new THREE.SphereGeometry(1, 12, 12);
    vertexMesh = new THREE.InstancedMesh(sphereGeo, vertexMat, productNodes4D.length);
    vertexGroup.add(vertexMesh);

    if (params.showLink) {
        const linkSphGeo = new THREE.SphereGeometry(params.linkRadius, 64, 64);
        const linkSphMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide
        });
        linkSphere = new THREE.Mesh(linkSphGeo, linkSphMat);
        linkGroup.add(linkSphere);

        const n1 = t1.nodes[0].children;
        const n2 = t2.nodes[0].children;
        const linkVertexMat = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.8 });

        const pts1 = n1.map(() => ({ type: 'T3', mesh: new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), linkVertexMat.clone()) }));
        const pts2 = n2.map(() => ({ type: 'T4', mesh: new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), linkVertexMat.clone()) }));

        pts1.forEach((p, i) => { p.mesh.material.color.setHex(0x00ccff); linkGroup.add(p.mesh); p.idx = n1[i]; });
        pts2.forEach((p, j) => { p.mesh.material.color.setHex(0xff3366); linkGroup.add(p.mesh); p.idx = n2[j]; });
        linkVertices = [...pts1, ...pts2];

        pts1.forEach(p1 => {
            pts2.forEach(p2 => {
                const segments = 32;
                const arcGeo = new THREE.BufferGeometry();
                arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 3), 3));
                const edgeMesh = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
                edgeMesh.userData = { p1, p2, segments };
                linkEdges.push(edgeMesh);
                linkGroup.add(edgeMesh);
            });
        });
    }
    updatePositions();
}

function updatePositions() {
    if (!productNodes4D) return;
    const projectedPositions = productNodes4D.map(p => getProjectedPoint(p));

    [...blueEdges, ...redEdges].forEach(mesh => {
        const p1 = projectedPositions[mesh.userData.source], p2 = projectedPositions[mesh.userData.target];
        mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
        mesh.scale.set(1, 1, p1.distanceTo(p2));
        mesh.lookAt(p2);
    });

    squareMeshes.forEach(mesh => {
        const pts = mesh.userData.pts.map(idx => projectedPositions[idx]);
        const pos = mesh.geometry.attributes.position;
        pos.setXYZ(0, pts[0].x, pts[0].y, pts[0].z);
        pos.setXYZ(1, pts[1].x, pts[1].y, pts[1].z);
        pos.setXYZ(2, pts[2].x, pts[2].y, pts[2].z);
        pos.setXYZ(3, pts[0].x, pts[0].y, pts[0].z);
        pos.setXYZ(4, pts[2].x, pts[2].y, pts[2].z);
        pos.setXYZ(5, pts[3].x, pts[3].y, pts[3].z);
        pos.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
    });

    const dummy = new THREE.Object3D();
    const s = params.vertexSize / 2;
    for (let i = 0; i < projectedPositions.length; i++) {
        dummy.position.copy(projectedPositions[i]);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        vertexMesh.setMatrixAt(i, dummy.matrix);
    }
    vertexMesh.instanceMatrix.needsUpdate = true;

    if (params.showLink) {
        const p0 = projectedPositions[0];
        linkSphere.position.copy(p0);
        const getNormalizedProj = (v4) => getProjectedPoint(v4).sub(p0).normalize().multiplyScalar(params.linkRadius);

        const linkPts = new Map();
        t1.nodes[0].children.forEach(id => linkPts.set('T3-' + id, getNormalizedProj([t1.nodes[id].pos[0], t1.nodes[id].pos[1], 0, 0])));
        t2.nodes[0].children.forEach(id => linkPts.set('T4-' + id, getNormalizedProj([0, 0, t2.nodes[id].pos[0], t2.nodes[id].pos[1]])));

        linkVertices.forEach(v => v.mesh.position.copy(p0).add(linkPts.get((v.type === 'T3' ? 'T3-' : 'T4-') + v.idx)));

        linkEdges.forEach(e => {
            const pos1 = linkPts.get('T3-' + e.userData.p1.idx), pos2 = linkPts.get('T4-' + e.userData.p2.idx);
            const positions = e.geometry.attributes.position, segments = e.userData.segments;
            const v1 = pos1.clone().normalize(), v2 = pos2.clone().normalize();
            const theta = Math.acos(Math.min(1, Math.max(-1, v1.dot(v2))));

            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                let pt;
                if (theta < 0.001) pt = v1.clone().lerp(v2, t).normalize();
                else {
                    const s1 = Math.sin((1 - t) * theta) / Math.sin(theta), s2 = Math.sin(t * theta) / Math.sin(theta);
                    pt = v1.clone().multiplyScalar(s1).add(v2.clone().multiplyScalar(s2));
                }
                pt.multiplyScalar(params.linkRadius);
                positions.setXYZ(i, pt.x + p0.x, pt.y + p0.y, pt.z + p0.z);
            }
            positions.needsUpdate = true;
            e.geometry.computeBoundingSphere();
        });
    }
}

// -----------------------------
// UI Logic
// -----------------------------
const updateUI = () => {
    const showTrees = !params.showLink;
    document.getElementById('fill-t3').style.width = (params.depthT3 / 6 * 100) + '%';
    document.getElementById('display-t3').innerText = 'Depth ' + params.depthT3;
    document.getElementById('fill-t4').style.width = (params.depthT4 / 6 * 100) + '%';
    document.getElementById('display-t4').innerText = 'Depth ' + params.depthT4;
    document.getElementById('fill-squares').style.width = (params.sqOpacity * 100) + '%';
    document.getElementById('display-squares').innerText = 'Opacity ' + Math.round(params.sqOpacity * 100) + '%';

    document.getElementById('fill-vertex').style.width = (params.vertexSize * 10) + '%';
    document.getElementById('display-vertex').innerText = params.vertexSize.toFixed(1);

    document.getElementById('fill-link').style.width = params.showLink ? '100%' : '0%';
    document.getElementById('display-link').innerText = params.showLink ? 'Showing' : 'Off';
    document.getElementById('bar-link').style.borderColor = params.showLink ? 'rgba(255, 159, 122, 0.6)' : '';

    blueGroup.visible = showTrees && params.depthT3 > 0;
    redGroup.visible = showTrees && params.depthT4 > 0;
    vertexGroup.visible = showTrees;
    squareGroup.visible = showTrees && params.sqOpacity > 0;
    squareMat.opacity = params.sqOpacity;
    squareMat.transparent = params.sqOpacity < 0.99;
    squareMat.depthWrite = params.sqOpacity > 0.5;
    squareMat.needsUpdate = true;
    linkGroup.visible = params.showLink;
};

// Event Attachments
document.getElementById('range-t3').oninput = (e) => { params.depthT3 = parseInt(e.target.value); updateUI(); };
document.getElementById('range-t3').onchange = rebuild;
document.getElementById('range-t4').oninput = (e) => { params.depthT4 = parseInt(e.target.value); updateUI(); };
document.getElementById('range-t4').onchange = rebuild;
document.getElementById('range-squares').oninput = (e) => { params.sqOpacity = e.target.value / 100; updateUI(); if (squareMeshes.length === 0 && params.sqOpacity > 0.001) rebuild(); };
document.getElementById('range-vertex').oninput = (e) => { params.vertexSize = e.target.value / 10; updateUI(); updatePositions(); };
document.getElementById('check-link').onchange = (e) => { params.showLink = e.target.checked; updateUI(); rebuild(); };

document.getElementById('play-pause').onclick = (e) => { window.isPlaying = !window.isPlaying; e.target.innerText = window.isPlaying ? "Pause" : "Play"; };
const speedSlider = document.getElementById('speed');

function animate() {
    requestAnimationFrame(animate);
    if (window.isPlaying) { time += speedSlider.value * speedMult; updatePositions(); }
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

updateUI();
rebuild();
animate();

window.addEventListener('message', (e) => {
    console.log("ProductOfTrees received message:", e.data);
    if (e.data === 'play') window.isPlaying = true;
    if (e.data === 'pause') window.isPlaying = false;
    if (e.data === 'toggle') window.isPlaying = !window.isPlaying;
    if (e.data === 'toggle-link') {
        params.showLink = !params.showLink;
        updateUI();
        rebuild();
    }
    const btn = document.getElementById('play-pause');
    if (btn) btn.innerText = window.isPlaying ? "Pause" : "Play";
});
