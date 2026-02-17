import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// -----------------------------
// Scene Setup
// -----------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020617, 0.0012);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(100, 420, 550);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x020617, 1);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 50, 0);

// -----------------------------
// Lighting (cinematic 3-point)
// -----------------------------
scene.add(new THREE.AmbientLight(0x4466aa, 0.35));

// Key light — warm sun from upper-right
const sun = new THREE.DirectionalLight(0xffdbb5, 1.8);
sun.position.set(150, 300, 120);
scene.add(sun);

// Fill light — cool blue from left
const fill = new THREE.DirectionalLight(0x6688cc, 0.6);
fill.position.set(-200, 80, 50);
scene.add(fill);

// Rim light — purple accent from behind
const rim = new THREE.PointLight(0x9966ff, 1.5, 900);
rim.position.set(0, 100, -300);
scene.add(rim);

// -----------------------------
// Ground Plane
// -----------------------------
const groundGeo = new THREE.PlaneGeometry(2000, 2000);
const groundMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f1e,
    roughness: 1,
    metalness: 0,
});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -5;
scene.add(ground);

// -----------------------------
// Mountain System
// -----------------------------

// Vertex-colored mountain material — uses vertex colors for rock→snow blend
const mountainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0.05,
    flatShading: true,
});

const rockColor = new THREE.Color(0x2a3549);       // dark slate
const midRockColor = new THREE.Color(0x4a5568);     // lighter slate
const snowColor = new THREE.Color(0xe8ecf2);        // off-white snow
const iceColor = new THREE.Color(0xc8daf0);         // blueish ice highlights

function createMountainPeak(x, height, radius, z, segments) {
    const radSeg = segments || 12;
    const hSeg = 8;
    const geo = new THREE.ConeGeometry(radius, height, radSeg, hSeg);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const halfH = height / 2;

    // Noise & color pass
    for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        const normalizedH = (py + halfH) / height; // 0 at base, 1 at tip

        // Vertex displacement — stronger at mid-heights for craggy ridges
        const noiseMag = radius * 0.18 * Math.sin(normalizedH * Math.PI); // peaks at middle
        const dx = (Math.random() - 0.5) * noiseMag * 2;
        const dz = (Math.random() - 0.5) * noiseMag * 2;
        const dy = (Math.random() - 0.5) * noiseMag * 0.8;

        // Don't displace the very base ring so it sits flat
        if (normalizedH > 0.05) {
            pos.setX(i, pos.getX(i) + dx);
            pos.setZ(i, pos.getZ(i) + dz);
            pos.setY(i, pos.getY(i) + dy);
        }

        // Color gradient: rock at bottom → snow at top
        const snowLine = 0.55 + (Math.random() - 0.5) * 0.15; // jagged snow line
        let c;
        if (normalizedH > snowLine + 0.15) {
            // Snow zone — mix snow and ice for sparkle variation
            c = snowColor.clone().lerp(iceColor, Math.random() * 0.3);
        } else if (normalizedH > snowLine) {
            // Transition zone — patchy snow
            const t = (normalizedH - snowLine) / 0.15;
            c = midRockColor.clone().lerp(snowColor, t * (0.5 + Math.random() * 0.5));
        } else if (normalizedH > 0.25) {
            // Mid rock — slight color variation
            c = rockColor.clone().lerp(midRockColor, (normalizedH - 0.25) / 0.3 + (Math.random() - 0.5) * 0.15);
        } else {
            // Base — dark
            c = rockColor.clone().multiplyScalar(0.7 + Math.random() * 0.2);
        }

        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mountainMat);
    mesh.position.set(x, halfH + (z ? -2 : 0), z || 0);
    scene.add(mesh);
    return mesh;
}

// Build a mountain cluster: one tall main peak + several shoulder peaks
function createMountainCluster(centerX, mainHeight, mainRadius) {
    const group = [];

    // Main peak
    group.push(createMountainPeak(centerX, mainHeight, mainRadius, 0, 14));

    // Shoulder peaks — shorter, offset, different radii
    const shoulderCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < shoulderCount; i++) {
        const angle = (i / shoulderCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const dist = mainRadius * (0.5 + Math.random() * 0.6);
        const sx = centerX + Math.cos(angle) * dist;
        const sz = Math.sin(angle) * dist;
        const sh = mainHeight * (0.3 + Math.random() * 0.35);
        const sr = mainRadius * (0.3 + Math.random() * 0.3);
        group.push(createMountainPeak(sx, sh, sr, sz, 8));
    }

    // Far background ridges (very faint, large)
    for (let i = 0; i < 3; i++) {
        const bx = centerX + (Math.random() - 0.5) * 200;
        const bz = -100 - Math.random() * 150;
        const bh = mainHeight * (0.4 + Math.random() * 0.3);
        const br = mainRadius * (0.8 + Math.random() * 0.5);
        createMountainPeak(bx, bh, br, bz, 6);
    }

    return group;
}

const peakA = createMountainCluster(-180, 250, 120);
const peakB = createMountainCluster(180, 280, 110);

// Bridges
function createBridge(heightA, heightB, offsetZ, sag, color, bowZ) {
    const bowAmount = bowZ || 0;
    const bridgeGroup = new THREE.Group();

    function getPoint(t) {
        const x = -180 + t * 360;
        const y = heightA + t * (heightB - heightA) - sag * Math.sin(t * Math.PI);
        const z = offsetZ + bowAmount * Math.sin(t * Math.PI);
        return new THREE.Vector3(x, y, z);
    }

    function getTangent(t) {
        const dt = 0.001;
        const p0 = getPoint(Math.max(0, t - dt));
        const p1 = getPoint(Math.min(1, t + dt));
        return p1.clone().sub(p0).normalize();
    }

    const bridgeColor = new THREE.Color(color);
    const darkColor = bridgeColor.clone().lerp(new THREE.Color(0x000000), 0.5);

    const ropeWidth = 12;
    for (const side of [-1, 1]) {
        const ropePoints = [];
        for (let i = 0; i <= 60; i++) {
            const t = i / 60;
            const p = getPoint(t);
            const localSag = Math.sin(t * Math.PI) * (2 + Math.random() * 3);
            const wobble = Math.sin(t * 17 + side) * 1.5;
            ropePoints.push(new THREE.Vector3(
                p.x + wobble,
                p.y - localSag + (Math.random() - 0.5) * 1,
                p.z + side * ropeWidth
            ));
        }
        const ropeGeo = new THREE.BufferGeometry().setFromPoints(ropePoints);
        const ropeLine = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({
            color: darkColor, transparent: true, opacity: 0.7
        }));
        bridgeGroup.add(ropeLine);
    }

    const cablePoints = [];
    for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const p = getPoint(t);
        cablePoints.push(new THREE.Vector3(
            p.x + (Math.random() - 0.5) * 0.5,
            p.y + (Math.random() - 0.5) * 0.8,
            p.z
        ));
    }
    const cableGeo = new THREE.BufferGeometry().setFromPoints(cablePoints);
    bridgeGroup.add(new THREE.Line(cableGeo, new THREE.LineBasicMaterial({
        color: bridgeColor, transparent: true, opacity: 0.5
    })));

    const plankMat = new THREE.MeshStandardMaterial({
        color: darkColor,
        roughness: 0.95,
        metalness: 0,
    });

    const totalPlanks = 30;
    for (let i = 0; i <= totalPlanks; i++) {
        if (Math.random() < 0.18) continue;

        const t = i / totalPlanks;
        const pos = getPoint(t);
        const tangent = getTangent(t);

        const plankW = 10 + Math.random() * 6;
        const plankH = 1 + Math.random() * 0.8;
        const plankD = 20 + Math.random() * 10;
        const plankGeo = new THREE.BoxGeometry(plankW, plankH, plankD);

        const plank = new THREE.Mesh(plankGeo, plankMat);
        plank.position.copy(pos);
        plank.position.y -= Math.random() * 3;

        plank.lookAt(pos.clone().add(tangent));
        plank.rotateY(Math.PI / 2);
        plank.rotateZ((Math.random() - 0.5) * 0.45);
        plank.rotateX((Math.random() - 0.5) * 0.2);
        plank.rotateY((Math.random() - 0.5) * 0.15);

        bridgeGroup.add(plank);

        if (Math.random() < 0.5) {
            for (const side of [-1, 1]) {
                const supportPts = [
                    new THREE.Vector3(pos.x, pos.y + 3 + Math.random() * 4, pos.z + side * ropeWidth),
                    new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, pos.y - 1, pos.z + side * (ropeWidth * 0.3))
                ];
                const supGeo = new THREE.BufferGeometry().setFromPoints(supportPts);
                bridgeGroup.add(new THREE.Line(supGeo, new THREE.LineBasicMaterial({
                    color: darkColor, transparent: true, opacity: 0.35
                })));
            }
        }
    }

    scene.add(bridgeGroup);
    return { getPoint, getTangent, group: bridgeGroup };
}

// Theta graph: red bows toward -Z, blue bows toward +Z, green stays straight
const bridgeH = 245;
const bridge1 = createBridge(bridgeH, bridgeH - 10, 0, 35, 0xff3366, -60); // Red — bows out front
const bridge2 = createBridge(bridgeH, bridgeH - 5, 0, 40, 0x00ff99, 0); // Green — straight middle
const bridge3 = createBridge(bridgeH, bridgeH - 10, 0, 30, 0x00ccff, 60); // Blue — bows out back

// -----------------------------
// 3D Scene Animation State
// -----------------------------
const scene3D = {
    // Climber walk state: null = on peak, {bridge, t} = on bridge path
    popoState: null,
    nanaState: null,
    // Active tweens for 3D scene
    tweens: [],
    // Bridge breaking state
    bridgeFalling: null, // { bridge, startTime }
    bridgeBroken: false,
    // Original climber positions
    popoHome: new THREE.Vector3(-175, 250, -12),
    nanaHome: new THREE.Vector3(-190, 250, 8),
};

function easeInOutCubic3D(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function tweenClimber3D(who, bridge, t0, t1, duration, onDone) {
    const startTime = Date.now();
    if (who === 'popo') scene3D.popoState = { bridge, t: t0 };
    else scene3D.nanaState = { bridge, t: t0 };

    scene3D.tweens.push({
        update() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeInOutCubic3D(progress);
            const currentT = t0 + (t1 - t0) * eased;
            if (who === 'popo') scene3D.popoState = { bridge, t: currentT };
            else scene3D.nanaState = { bridge, t: currentT };
            return progress >= 1;
        },
        onDone,
    });
}

function breakBridge3D(bridge) {
    scene3D.bridgeFalling = { bridge, startTime: Date.now() };
    scene3D.bridgeBroken = true;
    // Return climbers to peak after falling
    setTimeout(() => {
        scene3D.popoState = null;
        scene3D.nanaState = null;
        climber1.position.copy(scene3D.popoHome);
        climber2.position.copy(scene3D.nanaHome);
        climber1.visible = true;
        climber2.visible = true;
    }, 2500);
}

function resetScene3D() {
    scene3D.popoState = null;
    scene3D.nanaState = null;
    scene3D.tweens = [];
    scene3D.bridgeFalling = null;
    scene3D.bridgeBroken = false;
    bridge1.group.position.set(0, 0, 0);
    bridge1.group.rotation.set(0, 0, 0);
    bridge1.group.visible = true;
    climber1.position.copy(scene3D.popoHome);
    climber2.position.copy(scene3D.nanaHome);
    climber1.visible = true;
    climber2.visible = true;
}

// -----------------------------
// Ice Climber Characters
// -----------------------------
function createIceClimber(parkaColor, isNana) {
    const group = new THREE.Group();

    const parkaMat = new THREE.MeshStandardMaterial({ color: parkaColor, roughness: 0.6, metalness: 0.1 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.8 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x3a2518, roughness: 0.9 });
    const malletWoodMat = new THREE.MeshStandardMaterial({ color: 0x8B5E3C, roughness: 0.7 });
    const malletHeadMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 });

    // --- Body (puffy parka) ---
    const bodyGeo = new THREE.SphereGeometry(5, 12, 10);
    bodyGeo.scale(1, 1.2, 0.9);
    const body = new THREE.Mesh(bodyGeo, parkaMat);
    body.position.y = 6;
    group.add(body);

    // --- Hood ---
    const hoodGeo = new THREE.SphereGeometry(4.5, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hood = new THREE.Mesh(hoodGeo, parkaMat);
    hood.position.y = 14;
    group.add(hood);

    // --- Face (small sphere peeking out of hood) ---
    const faceGeo = new THREE.SphereGeometry(3.2, 10, 8);
    const face = new THREE.Mesh(faceGeo, skinMat);
    face.position.set(0, 13, 2);
    group.add(face);

    // --- Eyes ---
    const eyeGeo = new THREE.SphereGeometry(0.5, 6, 6);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-1.2, 13.5, 4.5);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(1.2, 13.5, 4.5);
    group.add(eyeR);

    // --- Legs ---
    const legGeo = new THREE.CylinderGeometry(1.5, 1.8, 5, 8);
    const legL = new THREE.Mesh(legGeo, parkaMat);
    legL.position.set(-2, 0.5, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, parkaMat);
    legR.position.set(2, 0.5, 0);
    group.add(legR);

    // --- Boots ---
    const bootGeo = new THREE.BoxGeometry(3, 2, 4);
    const bootL = new THREE.Mesh(bootGeo, bootMat);
    bootL.position.set(-2, -2, 0.5);
    group.add(bootL);
    const bootR = new THREE.Mesh(bootGeo, bootMat);
    bootR.position.set(2, -2, 0.5);
    group.add(bootR);

    // --- Arms ---
    const armGeo = new THREE.CylinderGeometry(1.2, 1, 6, 8);

    // Left arm (resting)
    const armL = new THREE.Mesh(armGeo, parkaMat);
    armL.position.set(-6, 7, 0);
    armL.rotation.z = Math.PI * 0.3;
    group.add(armL);

    // Right arm (holding mallet, raised)
    const armR = new THREE.Mesh(armGeo, parkaMat);
    armR.position.set(6, 9, 0);
    armR.rotation.z = -Math.PI * 0.55;
    group.add(armR);

    // --- Mallet ---
    const malletGroup = new THREE.Group();
    // Handle
    const handleGeo = new THREE.CylinderGeometry(0.5, 0.5, 8, 6);
    const handle = new THREE.Mesh(handleGeo, malletWoodMat);
    handle.position.y = 4;
    malletGroup.add(handle);
    // Head
    const headGeo = new THREE.CylinderGeometry(1.8, 1.8, 4, 8);
    const head = new THREE.Mesh(headGeo, malletHeadMat);
    head.position.y = 9;
    head.rotation.z = Math.PI / 2;
    malletGroup.add(head);

    malletGroup.position.set(7.5, 12, 0);
    malletGroup.rotation.z = -Math.PI * 0.15;
    group.add(malletGroup);

    // --- Glow light ---
    const glow = new THREE.PointLight(parkaColor, 1.5, 60);
    glow.position.y = 10;
    group.add(glow);

    // Scale the whole character
    group.scale.setScalar(0.9);

    // Mirror Nana so they face each other slightly
    if (isNana) {
        group.rotation.y = Math.PI * 0.15;
    } else {
        group.rotation.y = -Math.PI * 0.15;
    }

    return group;
}

// Popo (blue) and Nana (pink)
const climber1 = createIceClimber(0x3388ff, false);  // Popo
const climber2 = createIceClimber(0xff6699, true);    // Nana

// Position on Peak A
climber1.position.set(-175, 250, -12);
climber2.position.set(-190, 250, 8);
scene.add(climber1, climber2);

// -----------------------------
// Scene Management
// -----------------------------

// Collect all 3D mountain-scene objects into a group for easy show/hide
const mountainSceneGroup = new THREE.Group();
// Move all current scene children into the group (except camera, lights stay)
const objectsToGroup = [];
scene.traverse((child) => {
    if (child !== scene && child.parent === scene &&
        !(child instanceof THREE.Light) &&
        !(child instanceof THREE.Camera)) {
        objectsToGroup.push(child);
    }
});
objectsToGroup.forEach(obj => {
    scene.remove(obj);
    mountainSceneGroup.add(obj);
});
scene.add(mountainSceneGroup);

// Abstract theta graph canvas (2D overlay)
const thetaCanvas = document.createElement('canvas');
thetaCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:5;pointer-events:none;display:none;';
document.body.appendChild(thetaCanvas);
const ctx = thetaCanvas.getContext('2d');

function resizeThetaCanvas() {
    thetaCanvas.width = window.innerWidth * window.devicePixelRatio;
    thetaCanvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}
resizeThetaCanvas();

// Animation state for Scene 2
const anim = {
    popo: { pos: 'vertex-a' },
    nana: { pos: 'vertex-a' },
    broken: {},
    tweens: [],
    fragments: [],
};

function resetAnim() {
    anim.popo.pos = 'vertex-a';
    anim.nana.pos = 'vertex-a';
    anim.broken = {};
    anim.tweens = [];
    anim.fragments = [];
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function tweenClimber(who, edgeIdx, t0, t1, duration, onDone) {
    const climber = who === 'popo' ? anim.popo : anim.nana;
    const startTime = Date.now();
    climber.pos = { edge: edgeIdx, t: t0 };
    anim.tweens.push({
        update() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            climber.pos = { edge: edgeIdx, t: t0 + (t1 - t0) * easeInOutCubic(progress) };
            return progress >= 1;
        },
        onDone,
    });
}

function breakEdge(edgeIdx) {
    anim.broken[edgeIdx] = true;
    const startTime = Date.now();
    anim.fragments.push(
        { edgeIdx, half: 'left', startTime },
        { edgeIdx, half: 'right', startTime },
    );
    if (typeof anim.popo.pos === 'object' && anim.popo.pos.edge === edgeIdx) {
        anim.popo.pos = 'falling';
    }
    if (typeof anim.nana.pos === 'object' && anim.nana.pos.edge === edgeIdx) {
        anim.nana.pos = 'falling';
    }
    setTimeout(() => {
        if (anim.popo.pos === 'falling') anim.popo.pos = 'vertex-a';
        if (anim.nana.pos === 'falling') anim.nana.pos = 'vertex-a';
    }, 1800);
}

function drawThetaGraph() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    const graphCx = w / 2;
    const graphCy = h / 2;
    const spread = Math.min(w, h) * 0.32;
    const leftX = graphCx - spread;
    const rightX = graphCx + spread;
    const vertexY = graphCy;

    const edges = [
        { color: '#ff3366', bow: -spread * 0.55, label: 'e\u2081', labelY: -1 },
        { color: '#00ff99', bow: 0, label: 'e\u2082', labelY: -1 },
        { color: '#00ccff', bow: spread * 0.55, label: 'e\u2083', labelY: 1 },
    ];

    function edgePoint(i, t) {
        const edge = edges[i];
        const s = 1 - t;
        const cpY = vertexY + edge.bow;
        return {
            x: s * s * leftX + 2 * s * t * graphCx + t * t * rightX,
            y: s * s * vertexY + 2 * s * t * cpY + t * t * vertexY,
        };
    }

    // Update tweens
    anim.tweens = anim.tweens.filter(tw => {
        const done = tw.update();
        if (done && tw.onDone) tw.onDone();
        return !done;
    });

    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';

    const now = Date.now();
    edges.forEach((edge, i) => {
        if (anim.broken[i]) {
            const frags = anim.fragments.filter(f => f.edgeIdx === i);
            for (const frag of frags) {
                const fallElapsed = (now - frag.startTime) / 1000;
                const fallDist = Math.min(fallElapsed * fallElapsed * 120, h);
                const rot = fallElapsed * (frag.half === 'left' ? -0.8 : 0.8);
                const fadeOut = Math.max(0, 1 - fallElapsed / 2.5);

                ctx.save();
                const pivotX = frag.half === 'left' ? leftX : rightX;
                ctx.translate(pivotX, vertexY + fallDist);
                ctx.rotate(rot);
                ctx.translate(-pivotX, -vertexY);
                ctx.globalAlpha = fadeOut;

                ctx.beginPath();
                const midPt = edgePoint(i, 0.5);
                const cpY = vertexY + edge.bow;
                if (frag.half === 'left') {
                    ctx.moveTo(leftX, vertexY);
                    ctx.quadraticCurveTo((leftX + graphCx) / 2, (vertexY + cpY) / 2, midPt.x, midPt.y);
                } else {
                    ctx.moveTo(midPt.x, midPt.y);
                    ctx.quadraticCurveTo((graphCx + rightX) / 2, (cpY + vertexY) / 2, rightX, vertexY);
                }
                ctx.strokeStyle = edge.color;
                ctx.shadowColor = edge.color;
                ctx.shadowBlur = 8;
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.restore();
                ctx.globalAlpha = 1;
            }
        } else {
            ctx.beginPath();
            ctx.moveTo(leftX, vertexY);
            ctx.quadraticCurveTo(graphCx, vertexY + edge.bow, rightX, vertexY);
            ctx.strokeStyle = edge.color;
            ctx.shadowColor = edge.color;
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    });

    // Edge labels
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = anim.broken[0] ? 'rgba(255,51,102,0.25)' : 'rgba(255,51,102,0.8)';
    ctx.fillText('e\u2081', graphCx, vertexY - spread * 0.55 * 0.55 - 10);
    ctx.fillStyle = anim.broken[1] ? 'rgba(0,255,153,0.25)' : 'rgba(0,255,153,0.8)';
    ctx.fillText('e\u2082', graphCx + spread * 0.15, vertexY - 10);
    ctx.fillStyle = anim.broken[2] ? 'rgba(0,204,255,0.25)' : 'rgba(0,204,255,0.8)';
    ctx.fillText('e\u2083', graphCx, vertexY + spread * 0.55 * 0.55 + 22);

    // Vertex dots
    const vertexR = 14;
    for (const vx of [leftX, rightX]) {
        ctx.beginPath();
        ctx.arc(vx, vertexY, vertexR, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // Vertex labels
    ctx.font = '16px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(226,232,240,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('A', leftX, vertexY + vertexR + 22);
    ctx.fillText('B', rightX, vertexY + vertexR + 22);

    // Draw climbers
    const time = now * 0.001;
    drawClimber(anim.popo, '#3388ff', leftX, rightX, vertexY, vertexR, time, -8, edgePoint);
    drawClimber(anim.nana, '#ff6699', leftX, rightX, vertexY, vertexR, time, 8, edgePoint);

    // Title
    ctx.font = 'bold 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200, 200, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('\u0398  (Theta Graph)', graphCx, h * 0.08);
}

function drawClimber(climber, color, leftX, rightX, vertexY, vertexR, time, offsetX, edgePoint) {
    const bob = Math.sin(time * 2.5 + offsetX) * 3;
    let px, py;
    let alpha = 1;

    if (climber.pos === 'vertex-a') {
        px = leftX + offsetX;
        py = vertexY - vertexR - 12 + bob;
    } else if (climber.pos === 'vertex-b') {
        px = rightX + offsetX;
        py = vertexY - vertexR - 12 + bob;
    } else if (climber.pos === 'falling') {
        px = leftX + offsetX + Math.sin(time * 8) * 15;
        const fallPhase = ((Date.now() % 2000) / 2000);
        py = vertexY + fallPhase * 250;
        alpha = Math.max(0, 1 - fallPhase);
    } else if (typeof climber.pos === 'object') {
        const pt = edgePoint(climber.pos.edge, climber.pos.t);
        px = pt.x + offsetX * 0.5;
        py = pt.y - 12 + bob;
    } else {
        return;
    }

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
}

// -----------------------------
// Canvas Mode + Product Complex
// -----------------------------
let canvasMode = 'theta'; // 'theta', 'product', 'removing', 'genus2'
let diagonalFadeStart = 0; // timestamp for fade animation

const edgeColors = ['#ff3366', '#00ff99', '#00ccff'];
const edgeRGB = [
    [255, 51, 102],
    [0, 255, 153],
    [0, 204, 255],
];

function drawProductComplex() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const sz = Math.min(w, h) * 0.3;
    const pad = sz * 0.15; // bow amount for outer edges

    // 4 vertices of Theta x Theta
    const verts = {
        AA: { x: cx - sz, y: cy - sz },  // top-left
        BA: { x: cx + sz, y: cy - sz },  // top-right
        AB: { x: cx - sz, y: cy + sz },  // bottom-left
        BB: { x: cx + sz, y: cy + sz },  // bottom-right
    };

    // Edge parametrization: 3 parallel curves along each side
    // bow offsets: edge 0 bows outward, edge 1 straight, edge 2 bows inward
    const bows = [-1, 0, 1];

    // Horizontal edge (left→right): point at parameter t
    function hEdge(i, fromV, toV, t) {
        const bow = bows[i] * pad;
        const s = 1 - t;
        const cpx = (fromV.x + toV.x) / 2;
        const cpy = (fromV.y + toV.y) / 2 + bow;
        return {
            x: s * s * fromV.x + 2 * s * t * cpx + t * t * toV.x,
            y: s * s * fromV.y + 2 * s * t * cpy + t * t * toV.y,
        };
    }

    // Vertical edge (top→bottom): point at parameter t
    function vEdge(j, fromV, toV, t) {
        const bow = bows[j] * pad;
        const s = 1 - t;
        const cpx = (fromV.x + toV.x) / 2 + bow;
        const cpy = (fromV.y + toV.y) / 2;
        return {
            x: s * s * fromV.x + 2 * s * t * cpx + t * t * toV.x,
            y: s * s * fromV.y + 2 * s * t * cpy + t * t * toV.y,
        };
    }

    // Point inside square (i, j) at parameters (s, t) via bilinear-ish interpolation
    // s = horizontal param (0→1, left to right)
    // t = vertical param (0→1, top to bottom)
    function squarePoint(i, j, s, t) {
        const top = hEdge(i, verts.AA, verts.BA, s);
        const bot = hEdge(i, verts.AB, verts.BB, s);
        const lft = vEdge(j, verts.AA, verts.AB, t);
        const rgt = vEdge(j, verts.BA, verts.BB, t);
        // Coons patch: bilinear boundary interpolation
        const bx = (1 - t) * top.x + t * bot.x + (1 - s) * lft.x + s * rgt.x
            - ((1 - s) * (1 - t) * verts.AA.x + s * (1 - t) * verts.BA.x
                + (1 - s) * t * verts.AB.x + s * t * verts.BB.x);
        const by = (1 - t) * top.y + t * bot.y + (1 - s) * lft.y + s * rgt.y
            - ((1 - s) * (1 - t) * verts.AA.y + s * (1 - t) * verts.BA.y
                + (1 - s) * t * verts.AB.y + s * t * verts.BB.y);
        return { x: bx, y: by };
    }

    // Determine diagonal fade
    const isDiagRemoving = canvasMode === 'removing';
    const isDiagRemoved = canvasMode === 'genus2';
    let diagAlpha = 1;
    if (isDiagRemoving) {
        const elapsed = (Date.now() - diagonalFadeStart) / 1000;
        diagAlpha = Math.max(0, 1 - elapsed / 1.5);
    }

    // Draw square faces
    const res = 15; // sampling resolution for Coons patch boundary
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const isDiag = (i === j);

            if (isDiag && isDiagRemoved) continue; // fully removed

            // Color: blend the two edge colors
            const r = Math.round((edgeRGB[i][0] + edgeRGB[j][0]) / 2);
            const g = Math.round((edgeRGB[i][1] + edgeRGB[j][1]) / 2);
            const b = Math.round((edgeRGB[i][2] + edgeRGB[j][2]) / 2);

            let alpha = isDiag ? 0.35 : 0.2;
            if (isDiag && isDiagRemoving) alpha *= diagAlpha;
            if (isDiagRemoved && !isDiag) alpha = 0.35; // highlight remaining

            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;

            // Trace the boundary of the square patch
            ctx.beginPath();
            // Top edge: left→right
            for (let k = 0; k <= res; k++) {
                const p = squarePoint(i, j, k / res, 0);
                k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
            }
            // Right edge: top→bottom
            for (let k = 1; k <= res; k++) {
                const p = squarePoint(i, j, 1, k / res);
                ctx.lineTo(p.x, p.y);
            }
            // Bottom edge: right→left
            for (let k = res - 1; k >= 0; k--) {
                const p = squarePoint(i, j, k / res, 1);
                ctx.lineTo(p.x, p.y);
            }
            // Left edge: bottom→top
            for (let k = res - 1; k >= 1; k--) {
                const p = squarePoint(i, j, 0, k / res);
                ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
            ctx.fill();

            // Diagonal marker: X pattern
            if (isDiag && !isDiagRemoved) {
                ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 * (isDiagRemoving ? diagAlpha : 1)})`;
                ctx.lineWidth = 2;
                const c0 = squarePoint(i, j, 0.15, 0.15);
                const c1 = squarePoint(i, j, 0.85, 0.85);
                const c2 = squarePoint(i, j, 0.85, 0.15);
                const c3 = squarePoint(i, j, 0.15, 0.85);
                ctx.beginPath();
                ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y);
                ctx.moveTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
                ctx.stroke();
            }
        }
    }

    // Draw edges
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';

    // Horizontal edges (top and bottom)
    for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = edgeColors[i];
        ctx.shadowColor = edgeColors[i];
        ctx.shadowBlur = 6;

        // Top: AA→BA
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
            const p = hEdge(i, verts.AA, verts.BA, k / 40);
            k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Bottom: AB→BB
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
            const p = hEdge(i, verts.AB, verts.BB, k / 40);
            k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Vertical edges (left and right)
    for (let j = 0; j < 3; j++) {
        ctx.strokeStyle = edgeColors[j];
        ctx.shadowColor = edgeColors[j];
        ctx.shadowBlur = 6;

        // Left: AA→AB
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
            const p = vEdge(j, verts.AA, verts.AB, k / 40);
            k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Right: BA→BB
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
            const p = vEdge(j, verts.BA, verts.BB, k / 40);
            k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Vertex dots
    const vertexR = 10;
    for (const [label, v] of Object.entries(verts)) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, vertexR, 0, Math.PI * 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.font = '13px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(226,232,240,0.8)';
        ctx.textAlign = 'center';
        const lx = v.x + (v.x < cx ? -18 : 18);
        const ly = v.y + (v.y < cy ? -14 : 20);
        const displayLabel = '(' + label[0] + ',' + label[1] + ')';
        ctx.fillText(displayLabel, lx, ly);
    }

    // Title and info
    ctx.font = 'bold 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200, 200, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('\u0398 \u00d7 \u0398   (Product Complex)', cx, h * 0.06);

    // Euler characteristic annotation for genus-2 reveal
    if (isDiagRemoved) {
        ctx.font = '16px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(200, 220, 255, 0.85)';
        ctx.textAlign = 'center';
        const baseY = h * 0.88;
        ctx.fillText('V = 4,   E = 12,   F = 6', cx, baseY);
        ctx.fillText('\u03c7 = 4 \u2212 12 + 6 = \u22122   \u21d2   genus 2 surface', cx, baseY + 24);
    }

    // Legend for diagonal squares
    if (canvasMode === 'product' || isDiagRemoving) {
        ctx.font = '13px Inter, system-ui, sans-serif';
        ctx.fillStyle = `rgba(255, 215, 0, ${isDiagRemoving ? diagAlpha : 0.7})`;
        ctx.textAlign = 'center';
        ctx.fillText('\u2716 = diagonal squares (e\u1d62 \u00d7 f\u1d62)', cx, h * 0.93);
    }
}

// ===================================
// 3D Product Complex  (Θ × Θ)
// ===================================
const productScene = new THREE.Scene();
productScene.background = new THREE.Color(0x020617);
productScene.add(new THREE.AmbientLight(0x445566, 0.8));
const pKey = new THREE.DirectionalLight(0xffffff, 1.0);
pKey.position.set(60, 100, 80);
productScene.add(pKey);
const pFill = new THREE.DirectionalLight(0x6688cc, 0.4);
pFill.position.set(-40, -30, -60);
productScene.add(pFill);

const productCamera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 2000
);
productCamera.position.set(0, 30, 220);
productCamera.lookAt(0, 0, 0);

const productControls = new OrbitControls(productCamera, renderer.domElement);
productControls.enableDamping = true;
productControls.enabled = false;

// --- Genus-2 surface: 3 spines at 120° on a cross-section circle ---
const HUB_X = 70;
const CROSS_R = 45;
// Spine angles: red at top (90°), green lower-left (210°), blue lower-right (330°)
const spineAngles = [Math.PI / 2, Math.PI / 2 + 2 * Math.PI / 3, Math.PI / 2 + 4 * Math.PI / 3];

function spinePt(idx, u) {
    const x = -HUB_X + 2 * HUB_X * u;
    const r = CROSS_R * Math.sin(Math.PI * u);
    const a = spineAngles[idx];
    return new THREE.Vector3(x, r * Math.sin(a), r * Math.cos(a));
}

// Tube i covers the 120° arc from spine i to spine (i+1)%3
function tubeSurfPt(ti, u, v) {
    const x = -HUB_X + 2 * HUB_X * u;
    const r = CROSS_R * Math.sin(Math.PI * u);
    const a1 = spineAngles[ti];
    const a2 = spineAngles[(ti + 1) % 3];
    let sweep = a2 - a1;
    if (sweep < 0) sweep += 2 * Math.PI;
    const angle = a1 + v * sweep;
    return new THREE.Vector3(x, r * Math.sin(angle), r * Math.cos(angle));
}

function buildTubePanel(ti, vStart, vEnd, color, opacity) {
    const RU = 40, RV = 20;
    const positions = [], indices = [];
    for (let ui = 0; ui <= RU; ui++) {
        for (let vi = 0; vi <= RV; vi++) {
            const p = tubeSurfPt(ti, ui / RU, vStart + (vEnd - vStart) * vi / RV);
            positions.push(p.x, p.y, p.z);
        }
    }
    for (let ui = 0; ui < RU; ui++) {
        for (let vi = 0; vi < RV; vi++) {
            const a = ui * (RV + 1) + vi;
            indices.push(a, a + 1, a + RV + 2);
            indices.push(a, a + RV + 2, a + RV + 1);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), side: THREE.DoubleSide,
        transparent: true, opacity, roughness: 0.35, metalness: 0.08,
    }));
}

function buildDiagPatch(spineIdx, color, opacity) {
    const RU = 40, halfW = 4;
    const positions = [], indices = [];
    for (let ui = 0; ui <= RU; ui++) {
        const u = ui / RU;
        const p = spinePt(spineIdx, u);
        const a = spineAngles[spineIdx];
        const hw = halfW * Math.sin(Math.PI * u);
        positions.push(p.x, p.y + hw * Math.cos(a), p.z - hw * Math.sin(a));
        positions.push(p.x, p.y - hw * Math.cos(a), p.z + hw * Math.sin(a));
    }
    for (let ui = 0; ui < RU; ui++) {
        const a = ui * 2;
        indices.push(a, a + 1, a + 3);
        indices.push(a, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), side: THREE.DoubleSide,
        transparent: true, opacity, roughness: 0.3, metalness: 0.1,
    }));
}

const prodRoot = new THREE.Group();
const diagFaces = new THREE.Group();
const tubeFaces = [new THREE.Group(), new THREE.Group(), new THREE.Group()];

const panelColors = [
    ['#c084fc', '#a855f7'],
    ['#5eead4', '#2dd4bf'],
    ['#fbbf24', '#f59e0b'],
];

for (let ti = 0; ti < 3; ti++) {
    tubeFaces[ti].add(buildTubePanel(ti, 0, 0.5, panelColors[ti][0], 0.75));
    tubeFaces[ti].add(buildTubePanel(ti, 0.5, 1, panelColors[ti][1], 0.75));
    prodRoot.add(tubeFaces[ti]);
}

for (let i = 0; i < 3; i++) {
    diagFaces.add(buildDiagPatch(i, edgeColors[i], 0.5));
}
prodRoot.add(diagFaces);

function addEdgeLine(pts, color, parent) {
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    parent.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(color), linewidth: 2
    })));
}
for (let i = 0; i < 3; i++) {
    const pts = [];
    for (let k = 0; k <= 60; k++) pts.push(spinePt(i, k / 60));
    addEdgeLine(pts, edgeColors[i], prodRoot);
}

const vSphGeo = new THREE.SphereGeometry(3.5, 20, 14);
const vSphMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x115522 });
const hubL = new THREE.Mesh(vSphGeo, vSphMat);
hubL.position.set(-HUB_X, 0, 0);
prodRoot.add(hubL);
const hubR = new THREE.Mesh(vSphGeo, vSphMat.clone());
hubR.position.set(HUB_X, 0, 0);
prodRoot.add(hubR);

productScene.add(prodRoot);

let prodShowDiag = true;
let prodDiagFadeStart = 0;
let prodDiagFading = false;

function resetProduct3D() {
    prodShowDiag = true;
    prodDiagFading = false;
    diagFaces.visible = true;
    diagFaces.children.forEach(m => { m.material.opacity = 0.5; });
    tubeFaces.forEach(g => g.children.forEach(m => { m.material.opacity = 0.75; }));
}

function startDiagFade() {
    prodDiagFading = true;
    prodDiagFadeStart = Date.now();
}

// -----------------------------
// Story Steps (two scenes)
// -----------------------------
const storySteps = [
    // Scene 1: Mountain narrative
    {
        text: "Once upon a time, two mountain climbers stood atop a mountain peak, looking across at another. Between the peaks lay three bridges...", scene: 1,
        onEnter: () => resetScene3D()
    },
    // Scene 1: Walking + bridge break animation
    {
        text: "The bridges were quite rickety...", scene: 1,
        onEnter: () => {
            resetScene3D();
            // Face Popo toward the bridge
            climber1.rotation.y = 0;
            tweenClimber3D('popo', bridge1, 0, 0.4, 2500);
        }
    },
    {
        text: "The bridges were quite rickety...", scene: 1,
        onEnter: () => {
            scene3D.tweens = [];
            scene3D.popoState = { bridge: bridge1, t: 0.4 };
            scene3D.bridgeFalling = null;
            scene3D.bridgeBroken = false;
            bridge1.group.position.set(0, 0, 0);
            bridge1.group.rotation.set(0, 0, 0);
            bridge1.group.visible = true;
            climber2.rotation.y = 0;
            tweenClimber3D('nana', bridge1, 0, 0.12, 1800, () => {
                setTimeout(() => breakBridge3D(bridge1), 500);
            });
        }
    },
    { text: "And could only support one at a time!", scene: 1 },
    {
        text: "Let's try again from the start. What if they each take a different bridge?", scene: 1,
        onEnter: () => {
            resetScene3D();
        }
    },
    {
        text: "Blue heads across the green bridge while red takes the blue bridge...", scene: 1,
        onEnter: () => {
            resetScene3D();
            climber1.rotation.y = 0;
            climber2.rotation.y = 0;
            tweenClimber3D('popo', bridge2, 0, 0.5, 3000);
            tweenClimber3D('nana', bridge3, 0, 0.5, 3000);
        }
    },
    // Scene 2: Abstract theta graph
    {
        text: "We can model this as a theta graph \u0398 \u2014 two vertices connected by three edges.", scene: 2,
        onEnter: () => { resetAnim(); canvasMode = 'theta'; }
    },
    { text: "Each edge represents a bridge. The two climbers start at vertex A and must reach vertex B.", scene: 2 },
    { text: "The question: can both traverse the graph from A to B, always remaining within distance 1 of each other?", scene: 2 },
    // Scene 3: Product complex in 3D
    {
        text: "Consider the product \u0398 \u00d7 \u0398. It has 4 vertices, 12 edges, and 9 square faces.", scene: 3,
        onEnter: () => resetProduct3D()
    },
    { text: "The 3 diagonal squares (e\u1d62 \u00d7 f\u1d62) are the flat sheets. They represent configurations where both climbers walk the same bridge.", scene: 3 },
    {
        text: "Remove the diagonal squares...", scene: 3,
        onEnter: () => startDiagFade()
    },
    { text: "What remains are 3 tubes, each formed from two off-diagonal squares. Together they form a genus 2 surface! (\u03c7 = 4 \u2212 12 + 6 = \u22122)", scene: 3 },
];

let currentStep = 0;
let currentScene = 1;
const storyEl = document.getElementById('story');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');


function setScene(sceneNum) {
    if (sceneNum === currentScene) return;
    currentScene = sceneNum;

    // Reset all
    mountainSceneGroup.visible = false;
    renderer.domElement.style.opacity = '0';
    thetaCanvas.style.display = 'none';
    controls.enabled = false;
    productControls.enabled = false;

    if (sceneNum === 1) {
        mountainSceneGroup.visible = true;
        renderer.domElement.style.opacity = '1';
        controls.enabled = true;
    } else if (sceneNum === 2) {
        thetaCanvas.style.display = 'block';
    } else if (sceneNum === 3) {
        renderer.domElement.style.opacity = '1';
        productControls.enabled = true;
    }
}

function updateStory() {
    const step = storySteps[currentStep];
    storyEl.innerText = step.text;
    prevBtn.disabled = currentStep === 0;
    nextBtn.innerText = currentStep === storySteps.length - 1 ? "Start Over" : "Next";
    setScene(step.scene);
    if (step.onEnter) step.onEnter();
}

nextBtn.onclick = () => {
    currentStep = (currentStep + 1) % storySteps.length;
    updateStory();
};

prevBtn.onclick = () => {
    if (currentStep > 0) {
        currentStep--;
        updateStory();
    }
};

// -----------------------------
// Animation Loop
// -----------------------------
function animate() {
    requestAnimationFrame(animate);
    const time = Date.now() * 0.001;

    if (currentScene === 1) {
        // Update 3D tweens
        scene3D.tweens = scene3D.tweens.filter(tw => {
            const done = tw.update();
            if (done && tw.onDone) tw.onDone();
            return !done;
        });

        // Position climbers based on state
        if (scene3D.popoState) {
            const pt = scene3D.popoState.bridge.getPoint(scene3D.popoState.t);
            climber1.position.set(pt.x, pt.y + 5, pt.z);
            // Face direction of travel
            const tan = scene3D.popoState.bridge.getTangent(scene3D.popoState.t);
            climber1.lookAt(climber1.position.clone().add(tan));
        } else if (climber1.visible) {
            const bob1 = Math.sin(time * 3) * 0.8;
            climber1.position.y = scene3D.popoHome.y + bob1;
        }

        if (scene3D.nanaState) {
            const pt = scene3D.nanaState.bridge.getPoint(scene3D.nanaState.t);
            climber2.position.set(pt.x, pt.y + 5, pt.z);
            const tan = scene3D.nanaState.bridge.getTangent(scene3D.nanaState.t);
            climber2.lookAt(climber2.position.clone().add(tan));
        } else if (climber2.visible) {
            const bob2 = Math.sin(time * 3 + 1.2) * 0.8;
            climber2.position.y = scene3D.nanaHome.y + bob2;
        }

        // Animate falling bridge
        if (scene3D.bridgeFalling) {
            const elapsed = (Date.now() - scene3D.bridgeFalling.startTime) / 1000;
            const bg = scene3D.bridgeFalling.bridge.group;
            // Gravity fall + slight rotation
            bg.position.y = -elapsed * elapsed * 80;
            bg.rotation.x = elapsed * 0.3;
            bg.rotation.z = elapsed * 0.15;
            // Fade climbers while bridge falls (they're on it!)
            if (elapsed < 1.5) {
                if (scene3D.popoState) {
                    climber1.position.y += bg.position.y;
                }
                if (scene3D.nanaState) {
                    climber2.position.y += bg.position.y;
                }
            }
            if (elapsed > 1.5) {
                climber1.visible = scene3D.popoState === null;
                climber2.visible = scene3D.nanaState === null;
            }
            if (elapsed > 3) {
                bg.visible = false;
            }
        }

        controls.update();
        renderer.render(scene, camera);
    } else if (currentScene === 2) {
        if (canvasMode === 'theta') drawThetaGraph();
        else drawProductComplex();
    } else if (currentScene === 3) {
        // Animate diagonal fade
        if (prodDiagFading) {
            const elapsed = (Date.now() - prodDiagFadeStart) / 1000;
            const alpha = Math.max(0, 1 - elapsed / 1.5);
            diagFaces.children.forEach(m => { m.material.opacity = 0.5 * alpha; });
            if (alpha <= 0) {
                prodDiagFading = false;
                prodShowDiag = false;
                diagFaces.visible = false;
                // Brighten remaining tubes
                tubeFaces.forEach(g => g.children.forEach(m => { m.material.opacity = 0.8; }));
            }
        }
        // Gentle auto-rotation
        prodRoot.rotation.y += 0.003;
        productControls.update();
        renderer.render(productScene, productCamera);
    }
}

window.addEventListener('resize', () => {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    productCamera.aspect = aspect;
    productCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeThetaCanvas();
});

window.addEventListener('message', (e) => {
    if (e.data === 'toggle' || e.data === 'next') {
        nextBtn.click();
    } else if (e.data === 'prev') {
        prevBtn.click();
    }
});

updateStory();
animate();
