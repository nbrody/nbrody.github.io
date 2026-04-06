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

// Phase system: 'sideBySide' | 'merging' | 'product'
let phase = 'sideBySide';
let mergeProgress = 0;
let mergeStartTime = 0;
const MERGE_DURATION = 3.0;

// Side-by-side separation
const SEPARATION = 350;

// Camera positions
const CAM_SIDE = new THREE.Vector3(0, 0, 1000);
const CAM_PRODUCT = new THREE.Vector3(400, 300, 800);

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
// Easing
// -----------------------------
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// -----------------------------
// Position helpers
// -----------------------------

// Blue tree rotation angle at current time
function blueAngle() { return time * 0.3; }
// Red tree rotation angle at current time
function redAngle() { return time * 0.2; }

// Get the 3D position of a blue tree node in the side-by-side view.
// The tree lives in the XY plane, offset to the left by SEPARATION.
function getBlueTreeSidePos(node, sep) {
    const a = blueAngle();
    const c = Math.cos(a), s = Math.sin(a);
    const rx = node.pos[0] * c - node.pos[1] * s;
    const ry = node.pos[0] * s + node.pos[1] * c;
    return new THREE.Vector3(rx - sep, ry, 0);
}

// Get the 3D position of a red tree node in the side-by-side view.
// The tree lives in the XY plane, offset to the right by SEPARATION.
function getRedTreeSidePos(node, sep) {
    const a = redAngle();
    const c = Math.cos(a), s = Math.sin(a);
    const rx = node.pos[0] * c - node.pos[1] * s;
    const ry = node.pos[0] * s + node.pos[1] * c;
    return new THREE.Vector3(rx + sep, ry, 0);
}

// Get the 3D position of a blue tree node at the origin (merged, in XY plane).
// This is the "blue component" of the 4D product projection at the origin.
function getBlueMergedPos(node) {
    const a = blueAngle();
    const c = Math.cos(a), s = Math.sin(a);
    const rx = node.pos[0] * c - node.pos[1] * s;
    const ry = node.pos[0] * s + node.pos[1] * c;
    // In the product projection, the blue tree contributes to the X and Y axes
    // with a cross-plane tilt
    const tilt = 0.25 * Math.sin(time * 0.08);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    return new THREE.Vector3(rx * ct, ry * 0.7, rx * st);
}

// Get the 3D position of a red tree node at the origin (merged, in ZW→projected plane).
function getRedMergedPos(node) {
    const a = redAngle();
    const c = Math.cos(a), s = Math.sin(a);
    const rz = node.pos[0] * c - node.pos[1] * s;
    const rw = node.pos[0] * s + node.pos[1] * c;
    const tilt = 0.25 * Math.sin(time * 0.08);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    return new THREE.Vector3(-rz * st, rw * 0.7, rz * ct);
}

// Full 4D product projection (product mode)
function getProjectedPoint(p4) {
    let x = p4[0], y = p4[1], z = p4[2], w = p4[3];
    z *= params.zMix;
    w *= params.zMix;

    const a1 = blueAngle();
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const rx = x * c1 - y * s1;
    const ry = x * s1 + y * c1;

    const a2 = redAngle();
    const c2 = Math.cos(a2), s2 = Math.sin(a2);
    const rz = z * c2 - w * s2;
    const rw = z * s2 + w * c2;

    const tilt = 0.25 * Math.sin(time * 0.08);
    const ct = Math.cos(tilt), st = Math.sin(tilt);

    return new THREE.Vector3(
        rx * ct - rz * st,
        ry * 0.7 + rw * 0.7,
        rx * st + rz * ct
    );
}

// During the merge: interpolate a side-by-side tree node toward its product-ready position
// For the blue tree: from getBlueTreeSidePos → getBlueMergedPos
function getBlueInterpolatedPos(node, t) {
    const side = getBlueTreeSidePos(node, SEPARATION * (1 - t));
    const merged = getBlueMergedPos(node);
    return side.lerp(merged, t);
}

// For the red tree: from getRedTreeSidePos → getRedMergedPos
function getRedInterpolatedPos(node, t) {
    const side = getRedTreeSidePos(node, SEPARATION * (1 - t));
    const merged = getRedMergedPos(node);
    return side.lerp(merged, t);
}

// For product nodes during merge: the position is the sum of the blue and red
// merged positions (which is exactly what getProjectedPoint computes).
// At t=0, each product node (u,v) should be at bluePos(u) + redPos(v) in a
// separated arrangement. At t=1 it should be at getProjectedPoint.
function getProductMergePos(p4, blueNode, redNode, t) {
    // At t=0: position = side-by-side blue node + side-by-side red node offset
    // We use the interpolated single-tree positions and sum them
    // (since getProjectedPoint = blueMerged + redMerged by linearity)
    const bluePos = getBlueInterpolatedPos(blueNode, t);
    const redPos = getRedInterpolatedPos(redNode, t);

    // At t=1, bluePos = getBlueMergedPos, redPos = getRedMergedPos
    // and bluePos + redPos = getProjectedPoint (by construction above)
    // At t=0, we want them near their side-by-side positions averaged
    // But actually the cleanest thing: at t=0 put the product node halfway
    // between the two trees, at t=1 put it at the true product position.

    if (t < 0.01) {
        // Pure side-by-side: place at midpoint of the two side positions
        const bSide = getBlueTreeSidePos(blueNode, SEPARATION);
        const rSide = getRedTreeSidePos(redNode, SEPARATION);
        return bSide.add(rSide).multiplyScalar(0.5);
    }

    // The product position at this point in the animation:
    // Sum of the blue-component and red-component
    return new THREE.Vector3().addVectors(bluePos, redPos);
}

// -----------------------------
// Scene Setup
// -----------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x020617, 300, 2500);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.copy(CAM_SIDE);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(100, 200, 100);
scene.add(dirLight);

const pointLight = new THREE.PointLight(0x6366f1, 2, 2000);
pointLight.position.set(200, 300, 200);
scene.add(pointLight);

const blueMat = new THREE.MeshStandardMaterial({ color: 0x00ccff, roughness: 0.3, metalness: 0.8 });
const redMat = new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.3, metalness: 0.8 });
const squareMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: params.sqOpacity, depthWrite: false });
const vertexMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.9 });
const blueVertexMat = new THREE.MeshStandardMaterial({ color: 0x00ccff, roughness: 0.2, metalness: 0.7 });
const redVertexMat = new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.2, metalness: 0.7 });

// Groups
const blueTreeGroup = new THREE.Group();
const redTreeGroup = new THREE.Group();
const blueGroup = new THREE.Group();
const redGroup = new THREE.Group();
const squareGroup = new THREE.Group();
const vertexGroup = new THREE.Group();
const linkGroup = new THREE.Group();
scene.add(blueTreeGroup, redTreeGroup, blueGroup, redGroup, squareGroup, vertexGroup, linkGroup);

let t1, t2, productNodes4D, nodeMap;
let blueEdges = [], redEdges = [], squareMeshes = [], vertexMesh;
let linkSphere, linkEdges = [], linkVertices = [];
let blueTreeEdges = [], blueTreeVertices, redTreeEdges = [], redTreeVertices;
let productNodeInfo = [];

// Shared cylinder geometry
const sharedCylGeo = new THREE.CylinderGeometry(2, 2, 1, 8);
sharedCylGeo.rotateX(Math.PI / 2);
const sharedSphereGeo = new THREE.SphereGeometry(1, 12, 12);

// -----------------------------
// Build side-by-side trees
// -----------------------------
function rebuildSideBySide() {
    [blueTreeGroup, redTreeGroup].forEach(g => {
        while (g.children.length) {
            const c = g.children.pop();
            if (c.geometry) c.geometry.dispose();
        }
    });
    blueTreeEdges = [];
    redTreeEdges = [];

    t1 = buildRegularTree(3, params.depthT3, params.spacingT3);
    t2 = buildRegularTree(4, params.depthT4, params.spacingT4);

    // Blue tree edges
    t1.edges.forEach(([u0, u1]) => {
        const mesh = new THREE.Mesh(sharedCylGeo, blueMat);
        mesh.userData = { sourceIdx: u0, targetIdx: u1 };
        blueTreeEdges.push(mesh);
        blueTreeGroup.add(mesh);
    });

    // Red tree edges
    t2.edges.forEach(([v0, v1]) => {
        const mesh = new THREE.Mesh(sharedCylGeo, redMat);
        mesh.userData = { sourceIdx: v0, targetIdx: v1 };
        redTreeEdges.push(mesh);
        redTreeGroup.add(mesh);
    });

    // Blue tree vertices
    blueTreeVertices = new THREE.InstancedMesh(sharedSphereGeo, blueVertexMat, t1.nodes.length);
    blueTreeGroup.add(blueTreeVertices);

    // Red tree vertices
    redTreeVertices = new THREE.InstancedMesh(sharedSphereGeo, redVertexMat, t2.nodes.length);
    redTreeGroup.add(redTreeVertices);
}

// -----------------------------
// Build product geometry
// -----------------------------
function rebuildProduct() {
    [blueGroup, redGroup, squareGroup, vertexGroup, linkGroup].forEach(g => {
        while (g.children.length) {
            const c = g.children.pop();
            if (c.geometry) c.geometry.dispose();
        }
    });
    blueEdges = []; redEdges = []; squareMeshes = []; linkEdges = []; linkVertices = [];

    if (!t1 || !t2) {
        t1 = buildRegularTree(3, params.depthT3, params.spacingT3);
        t2 = buildRegularTree(4, params.depthT4, params.spacingT4);
    }

    productNodes4D = [];
    nodeMap = new Map();
    productNodeInfo = [];
    t1.nodes.forEach(u => {
        t2.nodes.forEach(v => {
            const id = productNodes4D.length;
            nodeMap.set(`${u.id},${v.id}`, id);
            productNodes4D.push([u.pos[0], u.pos[1], v.pos[0], v.pos[1]]);
            productNodeInfo.push({ blueNodeIdx: u.id, redNodeIdx: v.id });
        });
    });

    const prodCylGeo = new THREE.CylinderGeometry(1.5, 1.5, 1, 8);
    prodCylGeo.rotateX(Math.PI / 2);

    t1.edges.forEach(([u0, u1]) => {
        t2.nodes.forEach(v => {
            const mesh = new THREE.Mesh(prodCylGeo, blueMat);
            mesh.userData = { source: nodeMap.get(`${u0},${v.id}`), target: nodeMap.get(`${u1},${v.id}`) };
            blueEdges.push(mesh);
            blueGroup.add(mesh);
        });
    });

    t2.edges.forEach(([v0, v1]) => {
        t1.nodes.forEach(u => {
            const mesh = new THREE.Mesh(prodCylGeo, redMat);
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

    vertexMesh = new THREE.InstancedMesh(sharedSphereGeo, vertexMat, productNodes4D.length);
    vertexGroup.add(vertexMesh);

    if (params.showLink) {
        buildLinkGeometry();
    }
}

function buildLinkGeometry() {
    const linkSphGeo = new THREE.SphereGeometry(params.linkRadius, 64, 64);
    const linkSphMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, transparent: true, opacity: 0.15,
        roughness: 0.1, metalness: 0.5, side: THREE.DoubleSide
    });
    linkSphere = new THREE.Mesh(linkSphGeo, linkSphMat);
    linkGroup.add(linkSphere);

    const n1 = t1.nodes[0].children;
    const n2 = t2.nodes[0].children;
    const lkVertMat = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.8 });

    const pts1 = n1.map(() => ({ type: 'T3', mesh: new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), lkVertMat.clone()) }));
    const pts2 = n2.map(() => ({ type: 'T4', mesh: new THREE.Mesh(new THREE.SphereGeometry(5, 16, 16), lkVertMat.clone()) }));

    pts1.forEach((p, i) => { p.mesh.material.color.setHex(0x00ccff); linkGroup.add(p.mesh); p.idx = n1[i]; });
    pts2.forEach((p, j) => { p.mesh.material.color.setHex(0xff3366); linkGroup.add(p.mesh); p.idx = n2[j]; });
    linkVertices = [...pts1, ...pts2];

    pts1.forEach(lv1 => {
        pts2.forEach(lv2 => {
            const segments = 32;
            const arcGeo = new THREE.BufferGeometry();
            arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 3), 3));
            const edgeMesh = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
            edgeMesh.userData = { p1: lv1, p2: lv2, segments };
            linkEdges.push(edgeMesh);
            linkGroup.add(edgeMesh);
        });
    });
}

// -----------------------------
// Position update: side-by-side
// -----------------------------
function updateSideBySidePositions() {
    if (!t1 || !t2) return;
    const dummy = new THREE.Object3D();
    const s = 4;

    blueTreeEdges.forEach(mesh => {
        const pa = getBlueTreeSidePos(t1.nodes[mesh.userData.sourceIdx], SEPARATION);
        const pb = getBlueTreeSidePos(t1.nodes[mesh.userData.targetIdx], SEPARATION);
        mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
        mesh.scale.set(1, 1, pa.distanceTo(pb));
        mesh.lookAt(pb);
    });

    for (let i = 0; i < t1.nodes.length; i++) {
        const pos = getBlueTreeSidePos(t1.nodes[i], SEPARATION);
        dummy.position.copy(pos);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        blueTreeVertices.setMatrixAt(i, dummy.matrix);
    }
    blueTreeVertices.instanceMatrix.needsUpdate = true;

    redTreeEdges.forEach(mesh => {
        const pa = getRedTreeSidePos(t2.nodes[mesh.userData.sourceIdx], SEPARATION);
        const pb = getRedTreeSidePos(t2.nodes[mesh.userData.targetIdx], SEPARATION);
        mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
        mesh.scale.set(1, 1, pa.distanceTo(pb));
        mesh.lookAt(pb);
    });

    for (let i = 0; i < t2.nodes.length; i++) {
        const pos = getRedTreeSidePos(t2.nodes[i], SEPARATION);
        dummy.position.copy(pos);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        redTreeVertices.setMatrixAt(i, dummy.matrix);
    }
    redTreeVertices.instanceMatrix.needsUpdate = true;
}

// Position update: merging side-by-side trees (they slide toward origin)
function updateMergingSideBySide(t) {
    if (!t1 || !t2) return;
    const dummy = new THREE.Object3D();
    // Shrink vertex size from side-by-side (4) toward something smaller
    const s = 4 * (1 - t) + 2 * t;
    const sep = SEPARATION * (1 - t);

    blueTreeEdges.forEach(mesh => {
        const pa = getBlueTreeSidePos(t1.nodes[mesh.userData.sourceIdx], sep);
        const pb = getBlueTreeSidePos(t1.nodes[mesh.userData.targetIdx], sep);
        mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
        mesh.scale.set(1, 1, pa.distanceTo(pb));
        mesh.lookAt(pb);
    });

    for (let i = 0; i < t1.nodes.length; i++) {
        const pos = getBlueTreeSidePos(t1.nodes[i], sep);
        dummy.position.copy(pos);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        blueTreeVertices.setMatrixAt(i, dummy.matrix);
    }
    blueTreeVertices.instanceMatrix.needsUpdate = true;

    redTreeEdges.forEach(mesh => {
        const pa = getRedTreeSidePos(t2.nodes[mesh.userData.sourceIdx], sep);
        const pb = getRedTreeSidePos(t2.nodes[mesh.userData.targetIdx], sep);
        mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
        mesh.scale.set(1, 1, pa.distanceTo(pb));
        mesh.lookAt(pb);
    });

    for (let i = 0; i < t2.nodes.length; i++) {
        const pos = getRedTreeSidePos(t2.nodes[i], sep);
        dummy.position.copy(pos);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        redTreeVertices.setMatrixAt(i, dummy.matrix);
    }
    redTreeVertices.instanceMatrix.needsUpdate = true;
}

// -----------------------------
// Position update: product
// -----------------------------
function updateProductPositions(mergeT) {
    if (!productNodes4D) return;

    const useMerge = typeof mergeT === 'number' && mergeT < 1;

    const projectedPositions = productNodes4D.map((p4, idx) => {
        if (useMerge) {
            const info = productNodeInfo[idx];
            return getProductMergePos(p4, t1.nodes[info.blueNodeIdx], t2.nodes[info.redNodeIdx], mergeT);
        }
        return getProjectedPoint(p4);
    });

    [...blueEdges, ...redEdges].forEach(mesh => {
        const pa = projectedPositions[mesh.userData.source];
        const pb = projectedPositions[mesh.userData.target];
        mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
        const dist = pa.distanceTo(pb);
        mesh.scale.set(1, 1, Math.max(dist, 0.01));
        if (dist > 0.01) mesh.lookAt(pb);
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

    if (params.showLink && !useMerge) {
        updateLinkPositions(projectedPositions);
    }
}

function updateLinkPositions(projectedPositions) {
    const p0 = projectedPositions[0];
    linkSphere.position.copy(p0);
    const getNormalizedProj = (v4) => getProjectedPoint(v4).sub(p0).normalize().multiplyScalar(params.linkRadius);

    const linkPts = new Map();
    t1.nodes[0].children.forEach(id => linkPts.set('T3-' + id, getNormalizedProj([t1.nodes[id].pos[0], t1.nodes[id].pos[1], 0, 0])));
    t2.nodes[0].children.forEach(id => linkPts.set('T4-' + id, getNormalizedProj([0, 0, t2.nodes[id].pos[0], t2.nodes[id].pos[1]])));

    linkVertices.forEach(v => v.mesh.position.copy(p0).add(linkPts.get((v.type === 'T3' ? 'T3-' : 'T4-') + v.idx)));

    linkEdges.forEach(e => {
        const pos1 = linkPts.get('T3-' + e.userData.p1.idx);
        const pos2 = linkPts.get('T4-' + e.userData.p2.idx);
        const positions = e.geometry.attributes.position;
        const segments = e.userData.segments;
        const v1 = pos1.clone().normalize(), v2 = pos2.clone().normalize();
        const theta = Math.acos(Math.min(1, Math.max(-1, v1.dot(v2))));

        for (let j = 0; j <= segments; j++) {
            const t = j / segments;
            let pt;
            if (theta < 0.001) pt = v1.clone().lerp(v2, t).normalize();
            else {
                const s1 = Math.sin((1 - t) * theta) / Math.sin(theta);
                const s2 = Math.sin(t * theta) / Math.sin(theta);
                pt = v1.clone().multiplyScalar(s1).add(v2.clone().multiplyScalar(s2));
            }
            pt.multiplyScalar(params.linkRadius);
            positions.setXYZ(j, pt.x + p0.x, pt.y + p0.y, pt.z + p0.z);
        }
        positions.needsUpdate = true;
        e.geometry.computeBoundingSphere();
    });
}

// -----------------------------
// Phase transitions
// -----------------------------
function startMerge() {
    if (phase !== 'sideBySide') return;
    phase = 'merging';
    mergeProgress = 0;
    mergeStartTime = performance.now() / 1000;

    // Build product geometry
    rebuildProduct();

    // Show product groups (they start at the side-by-side positions)
    blueGroup.visible = true;
    redGroup.visible = true;
    vertexGroup.visible = true;
    squareGroup.visible = params.sqOpacity > 0;

    // Fade out the × button and labels
    const crossBtn = document.getElementById('cross-btn');
    if (crossBtn) {
        crossBtn.style.opacity = '0';
        crossBtn.style.pointerEvents = 'none';
        crossBtn.style.transform = 'translate(-50%, -50%) scale(0.5)';
    }
    const labelT3 = document.getElementById('label-t3');
    const labelT4 = document.getElementById('label-t4');
    if (labelT3) { labelT3.style.opacity = '0'; labelT3.style.transform = 'translateX(-50%) translateY(20px)'; }
    if (labelT4) { labelT4.style.opacity = '0'; labelT4.style.transform = 'translateX(-50%) translateY(20px)'; }
}

function finishMerge() {
    phase = 'product';

    blueTreeGroup.visible = false;
    redTreeGroup.visible = false;

    // Show product UI controls
    const productControls = document.getElementById('product-controls');
    if (productControls) {
        productControls.style.display = '';
        setTimeout(() => productControls.style.opacity = '1', 50);
    }

    camera.position.copy(CAM_PRODUCT);
    controls.target.set(0, 0, 0);
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

    if (phase === 'product') {
        blueGroup.visible = showTrees && params.depthT3 > 0;
        redGroup.visible = showTrees && params.depthT4 > 0;
        vertexGroup.visible = showTrees;
        squareGroup.visible = showTrees && params.sqOpacity > 0;
        squareMat.opacity = params.sqOpacity;
        squareMat.transparent = params.sqOpacity < 0.99;
        squareMat.depthWrite = params.sqOpacity > 0.5;
        squareMat.needsUpdate = true;
        linkGroup.visible = params.showLink;
    }
};

// Event attachments
document.getElementById('range-t3').oninput = (e) => { params.depthT3 = parseInt(e.target.value); updateUI(); };
document.getElementById('range-t3').onchange = () => { if (phase === 'product') { rebuildProduct(); updateProductPositions(); } };
document.getElementById('range-t4').oninput = (e) => { params.depthT4 = parseInt(e.target.value); updateUI(); };
document.getElementById('range-t4').onchange = () => { if (phase === 'product') { rebuildProduct(); updateProductPositions(); } };
document.getElementById('range-squares').oninput = (e) => { params.sqOpacity = e.target.value / 100; updateUI(); if (phase === 'product' && squareMeshes.length === 0 && params.sqOpacity > 0.001) { rebuildProduct(); updateProductPositions(); } };
document.getElementById('range-vertex').oninput = (e) => { params.vertexSize = e.target.value / 10; updateUI(); if (phase === 'product') updateProductPositions(); };
document.getElementById('check-link').onchange = (e) => { params.showLink = e.target.checked; updateUI(); if (phase === 'product') { rebuildProduct(); updateProductPositions(); } };

document.getElementById('play-pause').onclick = (e) => { window.isPlaying = !window.isPlaying; e.target.innerText = window.isPlaying ? "Pause" : "Play"; };
const speedSlider = document.getElementById('speed');

// Cross button handler
document.getElementById('cross-btn').onclick = startMerge;

// Initially hide product controls
const productControls = document.getElementById('product-controls');
if (productControls) {
    productControls.style.display = 'none';
    productControls.style.opacity = '0';
    productControls.style.transition = 'opacity 0.6s ease';
}

// Initially hide product meshes
blueGroup.visible = false;
redGroup.visible = false;
squareGroup.visible = false;
vertexGroup.visible = false;
linkGroup.visible = false;

// -----------------------------
// Animation loop
// -----------------------------
function animate() {
    requestAnimationFrame(animate);

    if (window.isPlaying) {
        time += speedSlider.value * speedMult;
    }

    if (phase === 'sideBySide') {
        updateSideBySidePositions();
    } else if (phase === 'merging') {
        const now = performance.now() / 1000;
        const elapsed = now - mergeStartTime;
        mergeProgress = Math.min(elapsed / MERGE_DURATION, 1);
        const easedT = easeInOutCubic(mergeProgress);

        // Phase 1 (first 40%): Trees slide together, roots meet
        // Phase 2 (last 60%): Product geometry fades in as trees orient
        const slideT = Math.min(easedT / 0.4, 1);       // 0→1 during first 40%
        const productT = Math.max((easedT - 0.4) / 0.6, 0); // 0→1 during last 60%

        // Update side-by-side trees sliding toward center
        const sideOpacity = 1 - productT;
        blueTreeGroup.visible = sideOpacity > 0.01;
        redTreeGroup.visible = sideOpacity > 0.01;

        if (blueTreeGroup.visible) {
            updateMergingSideBySide(slideT);
            // Fade materials
            blueMat.opacity = sideOpacity;
            blueMat.transparent = true;
            redMat.opacity = sideOpacity;
            redMat.transparent = true;
            blueVertexMat.opacity = sideOpacity;
            blueVertexMat.transparent = true;
            redVertexMat.opacity = sideOpacity;
            redVertexMat.transparent = true;
        }

        // Product geometry: fade in during phase 2
        if (productT > 0.01) {
            blueGroup.visible = true;
            redGroup.visible = true;
            vertexGroup.visible = true;
            squareGroup.visible = params.sqOpacity > 0;
            updateProductPositions(productT);
        } else {
            blueGroup.visible = false;
            redGroup.visible = false;
            vertexGroup.visible = false;
            squareGroup.visible = false;
        }

        // Camera interpolation
        camera.position.lerpVectors(CAM_SIDE, CAM_PRODUCT, easedT);
        controls.target.set(0, 0, 0);

        if (mergeProgress >= 1) {
            // Restore material opacity
            blueMat.opacity = 1;
            blueMat.transparent = false;
            redMat.opacity = 1;
            redMat.transparent = false;
            blueVertexMat.opacity = 1;
            blueVertexMat.transparent = false;
            redVertexMat.opacity = 1;
            redVertexMat.transparent = false;
            finishMerge();
        }
    } else if (phase === 'product') {
        updateProductPositions();
    }

    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize
rebuildSideBySide();
animate();

window.addEventListener('message', (e) => {
    console.log("ProductOfTrees received message:", e.data);
    if (e.data === 'play') window.isPlaying = true;
    if (e.data === 'pause') window.isPlaying = false;
    if (e.data === 'toggle') window.isPlaying = !window.isPlaying;
    if (e.data === 'start-product' || e.data === 'toggle-link') {
        if (phase === 'sideBySide') {
            startMerge();
        } else if (e.data === 'toggle-link') {
            params.showLink = !params.showLink;
            updateUI();
            rebuildProduct();
            updateProductPositions();
        }
    }
    const btn = document.getElementById('play-pause');
    if (btn) btn.innerText = window.isPlaying ? "Pause" : "Play";
});
