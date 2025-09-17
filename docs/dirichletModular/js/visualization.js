
// Visualization Functions - Three.js rendering

let scene, camera, renderer, controls;
let polyhedronGroup = new THREE.Group();
let delaunayGroup = new THREE.Group();
let orbitGroup = new THREE.Group();
let dirichletGroup = new THREE.Group();
let floor;
const basepoint = new THREE.Vector3(0, 0, 1);
let wallOpacity = 0.4;
let colorPalette = 'bluegold';

function initVisualization() {
    const viewer = document.getElementById('viewer');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, -5, 3);
    camera.up.set(0, 0, 1);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.localClippingEnabled = true;
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)];
    viewer.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.copy(basepoint);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xcccccc, 1.0);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(2, 3, 5);
    scene.add(directionalLight);
    const fixedLight = new THREE.PointLight(0xffffff, 0.8);
    fixedLight.position.set(-3, 4, 10);
    scene.add(fixedLight);

    // Basepoint sphere
    const basepointGeom = new THREE.SphereGeometry(0.1, 16, 16);
    const basepointMat = new THREE.MeshStandardMaterial({ color: 0xffeb3b });
    const basepointMesh = new THREE.Mesh(basepointGeom, basepointMat);
    basepointMesh.position.copy(basepoint);
    scene.add(basepointMesh);
    window.basepointMesh = basepointMesh;

    const bpCb = document.getElementById('toggleBasepoint');
    basepointMesh.visible = bpCb ? bpCb.checked : false;

    // Floor plane
    const floorGeom = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    floor = new THREE.Mesh(floorGeom, floorMat);
    floor.position.set(0, 0, 0.05);
    scene.add(floor);
    const floorCb = document.getElementById('toggleFloor');
    floor.visible = floorCb ? floorCb.checked : false;

    scene.add(polyhedronGroup);
    scene.add(delaunayGroup);
    scene.add(orbitGroup);
    scene.add(dirichletGroup);

    window.addEventListener('resize', onWindowResize, false);
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function clearGroup(group) {
    while (group.children.length > 0) {
        const obj = group.children[0];
        group.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (obj.material.dispose) obj.material.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach(m => m && m.dispose && m.dispose());
        }
    }
}

function clearDelaunay() { clearGroup(delaunayGroup); }
function clearOrbit() { clearGroup(orbitGroup); }
function clearPolyhedron() { clearGroup(polyhedronGroup); }

function lerpColorHex(hex1, hex2, t) {
    const c1 = new THREE.Color(hex1);
    const c2 = new THREE.Color(hex2);
    const u = Math.min(1, Math.max(0, t || 0));
    return c1.lerp(c2, u);
}

function colorForIndex(si, total) {
    if (colorPalette === 'monochrome') {
        return new THREE.Color('skyblue');
    }
    if (colorPalette === 'random') {
        return new THREE.Color(Math.random() * 0xffffff);
    }
    if (colorPalette === 'bluegold') {
        const start = 0x003660;
        const end = 0xFEBC11;
        const denom = Math.max(1, (total || 1) - 1);
        const t = (typeof si === 'number') ? (si / denom) : 0.5;
        return lerpColorHex(start, end, t);
    }
    if (colorPalette === 'tealfuchsia') {
        const stops = [0x23bbad, 0x25d9c8, 0x2abed9, 0xff6da2, 0xf92672];
        const denom = Math.max(1, (total || 1) - 1);
        let t = (typeof si === 'number') ? (si / denom) : 0.5;
        t = Math.pow(t, 0.65);
        const seg = 1 / (stops.length - 1);
        const idx = Math.min(stops.length - 2, Math.floor(t / seg));
        const localT = (t - idx * seg) / seg;
        return lerpColorHex(stops[idx], stops[idx + 1], localT);
    }
    if (colorPalette === 'ucpure') {
        return (si % 2 === 0) ? new THREE.Color(0x003660) : new THREE.Color(0xFEBC11);
    }
    // default: harmonic
    const c = new THREE.Color();
    c.setHSL(si / Math.max(1, total), 0.65, 0.58);
    return c;
}

function drawBisector(p, q, material) {
    if (!p) return;
    q = q || basepoint;

    const xp = p.x, yp = p.y, zp = p.z;
    const xq = q.x, yq = q.y, zq = q.z;
    const eps = 1e-9;

    if (Math.abs(zp - zq) < eps) {
        const nx = xq - xp;
        const ny = yq - yp;
        const n = new THREE.Vector3(nx, ny, 0);
        if (n.length() < eps) return;
        n.normalize();

        const Sp = xp * xp + yp * yp + zp * zp;
        const Sq = xq * xq + yq * yq + zq * zq;
        const d = (Sq - Sp) / 2;
        const nlen2 = (xq - xp) * (xq - xp) + (yq - yp) * (yq - yp);
        const scale = nlen2 < eps ? 0 : d / nlen2;
        const pointOnPlane = new THREE.Vector3((xq - xp) * scale, (yq - yp) * scale, (zp + zq) / 2);

        const planeGeom = new THREE.PlaneGeometry(40, 40);
        const planeMesh = new THREE.Mesh(planeGeom, material);
        planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        planeMesh.position.copy(pointOnPlane);
        polyhedronGroup.add(planeMesh);
        return;
    }

    const denom = (zq - zp);
    const cx = (zq * xp - zp * xq) / denom;
    const cy = (zq * yp - zp * yq) / denom;
    const cz = 0;

    const Sp = xp * xp + yp * yp + zp * zp;
    const Sq = xq * xq + yq * yq + zq * zq;
    const c2 = cx * cx + cy * cy + cz * cz;
    const r2 = c2 - (zq * Sp - zp * Sq) / denom;
    if (!(r2 > eps)) return;
    const r = Math.sqrt(r2);

    const geometry = new THREE.SphereGeometry(r, 64, 32, 0);
    const hemisphere = new THREE.Mesh(geometry, material);
    hemisphere.rotation.x = -Math.PI / 2;
    hemisphere.position.set(cx, cy, 0);
    polyhedronGroup.add(hemisphere);
}

function drawGeodesicArc(p, q, material) {
    const eps = 1e-9;
    if (Math.hypot(p.x - q.x, p.y - q.y) < eps) {
        const geom = new THREE.BufferGeometry().setFromPoints([p, q]);
        const line = new THREE.Line(geom, material);
        delaunayGroup.add(line);
        return;
    }

    const k = new THREE.Vector3(0, 0, 1);
    const n = new THREE.Vector3().subVectors(p, q).cross(k);
    const nlen = n.length();
    if (nlen < eps) {
        const geom = new THREE.BufferGeometry().setFromPoints([p, q]);
        const line = new THREE.Line(geom, material);
        delaunayGroup.add(line);
        return;
    }
    n.divideScalar(nlen);

    const d = new THREE.Vector3().crossVectors(k, n);
    let C0 = new THREE.Vector3(p.x, p.y, 0);
    const alpha = n.dot(new THREE.Vector3().subVectors(p, C0));
    C0.addScaledVector(d, alpha / Math.max(d.lengthSq(), eps));

    const px = p.x, py = p.y, pz = p.z;
    const qx = q.x, qy = q.y, qz = q.z;
    const A = d.x * (qx - px) + d.y * (qy - py);
    const B = ((qx * qx - px * px) + (qy * qy - py * py) + (qz * qz - pz * pz)) * 0.5
        - (C0.x * (qx - px) + C0.y * (qy - py));
    const denom = A;
    let t = 0;
    if (Math.abs(denom) > eps) {
        t = B / denom;
    }
    const C = new THREE.Vector3(C0.x + t * d.x, C0.y + t * d.y, 0);

    const r = C.distanceTo(p);
    if (!(r > eps)) {
        const geom = new THREE.BufferGeometry().setFromPoints([p, q]);
        const line = new THREE.Line(geom, material);
        delaunayGroup.add(line);
        return;
    }
    const e1 = new THREE.Vector3().subVectors(p, C).divideScalar(r);
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();

    const qp = new THREE.Vector3().subVectors(q, C);
    const cosTh = THREE.MathUtils.clamp(qp.dot(e1) / r, -1, 1);
    const sinTh = THREE.MathUtils.clamp(qp.dot(e2) / r, -1, 1);
    let theta = Math.atan2(sinTh, cosTh);

    if (theta > Math.PI) theta -= 2 * Math.PI;
    if (theta < -Math.PI) theta += 2 * Math.PI;

    const segments = Math.max(16, Math.ceil(48 * Math.abs(theta) / Math.PI));
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const tA = (i / segments) * theta;
        const pt = new THREE.Vector3().copy(C)
            .addScaledVector(e1, Math.cos(tA) * r)
            .addScaledVector(e2, Math.sin(tA) * r);
        pts.push(pt);
    }
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geom, material);
    delaunayGroup.add(line);
}

function drawDelaunayEdges(neighbors) {
    clearDelaunay();
    const material = new THREE.LineBasicMaterial({ linewidth: 2 });
    for (const v of neighbors) {
        const vv = (v && v.v) ? v.v : v;
        drawGeodesicArc(basepoint, vv, material);
    }
}

function drawOrbitPoints(points) {
    clearOrbit();
    if (!points || points.length === 0) return;

    const sphereGeom = new THREE.SphereGeometry(0.02, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffebab });
    const mesh = new THREE.InstancedMesh(sphereGeom, sphereMat, points.length);
    const m = new THREE.Matrix4();
    for (let i = 0; i < points.length; i++) {
        m.makeTranslation(points[i].x, points[i].y, points[i].z);
        mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    orbitGroup.add(mesh);
}

// Export functions
window.initVisualization = initVisualization;
window.clearPolyhedron = clearPolyhedron;
window.clearDelaunay = clearDelaunay;
window.clearOrbit = clearOrbit;
window.drawBisector = drawBisector;
window.drawGeodesicArc = drawGeodesicArc;
window.drawDelaunayEdges = drawDelaunayEdges;
window.drawOrbitPoints = drawOrbitPoints;
window.colorForIndex = colorForIndex;
window.polyhedronGroup = polyhedronGroup;
window.delaunayGroup = delaunayGroup;
window.orbitGroup = orbitGroup;
window.dirichletGroup = dirichletGroup;
window.scene = scene;
window.camera = camera;
window.renderer = renderer;
window.controls = controls;
window.floor = floor;
window.basepoint = basepoint;
