// ── Three.js Scene for SL₃(ℝ) Riley Slice ──

let scene, camera, renderer, controls;
let surfaceMesh, wireframeMesh, boxHelper;
let clipEnabled = false, wireEnabled = false, boxVisible = true;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 2);

export function getClipState() { return { clipEnabled, clipPlane }; }

export function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050a15);
    scene.fog = new THREE.FogExp2(0x050a15, 0.04);

    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
    camera.position.set(5, 4, 6);

    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.localClippingEnabled = true;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Lights
    scene.add(new THREE.AmbientLight(0x8892b0, 0.4));
    const dl = new THREE.DirectionalLight(0x64ffda, 0.8);
    dl.position.set(5, 8, 6); scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xff6b9d, 0.4);
    dl2.position.set(-4, -3, 5); scene.add(dl2);
    const pl = new THREE.PointLight(0xa78bfa, 0.6, 20);
    pl.position.set(0, 0, 0); scene.add(pl);

    // Axes
    const axes = new THREE.AxesHelper(2.5);
    axes.material.opacity = 0.5; axes.material.transparent = true;
    scene.add(axes);

    // [-2,2]³ bounding box wireframe
    const boxGeo = new THREE.BoxGeometry(4, 4, 4);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    boxHelper = new THREE.LineSegments(boxEdges,
        new THREE.LineBasicMaterial({ color: 0x64ffda, transparent: true, opacity: 0.15 }));
    scene.add(boxHelper);

    // Axis labels
    addLabel('a', 2.6, 0, 0);
    addLabel('b', 0, 2.6, 0);
    addLabel('c', 0, 0, 2.6);

    animate();
}

function addLabel(text, x, y, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 48px Outfit';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7 }));
    sprite.position.set(x, y, z); sprite.scale.set(0.4, 0.4, 1);
    scene.add(sprite);
}

export function buildMesh(verts, faces) {
    if (surfaceMesh) { scene.remove(surfaceMesh); surfaceMesh.geometry.dispose(); }
    if (wireframeMesh) { scene.remove(wireframeMesh); wireframeMesh.geometry.dispose(); }

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(faces.length * 9);
    for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        for (let j = 0; j < 3; j++) {
            pos[i * 9 + j * 3] = verts[f[j]][0];
            pos[i * 9 + j * 3 + 1] = verts[f[j]][1];
            pos[i * 9 + j * 3 + 2] = verts[f[j]][2];
        }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();

    // Position-based vertex colors: cyan → magenta → purple gradient
    const colors = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        const r = Math.sqrt(x * x + y * y + z * z) / 3.5;
        const h = (Math.atan2(z, x) / Math.PI + 1) / 2;
        const c = new THREE.Color().setHSL(0.45 + h * 0.35, 0.8, 0.45 + r * 0.15);
        colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshPhysicalMaterial({
        vertexColors: true, metalness: 0.3, roughness: 0.3,
        transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, clearcoat: 0.4, clearcoatRoughness: 0.2,
        clippingPlanes: clipEnabled ? [clipPlane] : []
    });
    surfaceMesh = new THREE.Mesh(geo, mat);
    scene.add(surfaceMesh);

    const wireMat = new THREE.MeshBasicMaterial({
        wireframe: true, color: 0x64ffda, transparent: true, opacity: 0.08,
        clippingPlanes: clipEnabled ? [clipPlane] : []
    });
    wireframeMesh = new THREE.Mesh(geo.clone(), wireMat);
    wireframeMesh.visible = wireEnabled;
    scene.add(wireframeMesh);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (clipEnabled) {
        const cv = parseFloat(document.getElementById('clipY').value) / 100;
        clipPlane.constant = cv * 2;
        document.getElementById('clipYVal').textContent = cv.toFixed(1);
    }
    renderer.render(scene, camera);
}

export function toggleWire() {
    wireEnabled = !wireEnabled;
    if (wireframeMesh) wireframeMesh.visible = wireEnabled;
    document.getElementById('btnWire').classList.toggle('active', wireEnabled);
}

export function toggleClip() {
    clipEnabled = !clipEnabled;
    document.getElementById('btnClip').classList.toggle('active', clipEnabled);
    if (surfaceMesh) {
        surfaceMesh.material.clippingPlanes = clipEnabled ? [clipPlane] : [];
        surfaceMesh.material.needsUpdate = true;
    }
    if (wireframeMesh) {
        wireframeMesh.material.clippingPlanes = clipEnabled ? [clipPlane] : [];
        wireframeMesh.material.needsUpdate = true;
    }
    document.getElementById('clipYVal').textContent = clipEnabled ? '0.0' : 'off';
}

export function toggleBox() {
    boxVisible = !boxVisible;
    boxHelper.visible = boxVisible;
    document.getElementById('btnBox').classList.toggle('active', !boxVisible);
}

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
