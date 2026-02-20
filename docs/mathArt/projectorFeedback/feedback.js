import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ── Constants ── */
const WALL_W = 16, WALL_H = 9, PROJ_Z = 2.5;
const TEX_W = 1024, TEX_H = 576;

/* ── Renderer ── */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(0x060610);
document.getElementById('container').appendChild(renderer.domElement);

/* ── Camera & Controls ── */
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 1, 14);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
orbit.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.enabled = false; // only active when Cmd is held
let cmdHeld = false;
window.addEventListener('keydown', e => { if (e.metaKey || e.key === 'Meta') { cmdHeld = true; orbit.enabled = true; } });
window.addEventListener('keyup', e => { if (e.key === 'Meta') { cmdHeld = false; orbit.enabled = false; } });

/* ── Scene ── */
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0x334, 0.6));
const dLight = new THREE.DirectionalLight(0xffffff, 0.4);
dLight.position.set(5, 8, 10);
scene.add(dLight);

/* ── Feedback Shader ── */
const fbVert = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const fbFrag = `
precision highp float;
uniform sampler2D uPrev;
uniform float uDecay, uGain, uAspect;
uniform vec2 uCamPos;
uniform float uCamS, uCamR;
uniform vec2 uP1Pos, uP2Pos, uP3Pos, uLightPos;
uniform float uP1S, uP1R, uP1On, uP1B, uP2S, uP2R, uP2On, uP2B, uP3S, uP3R, uP3On, uP3B;
uniform vec3 uP1C, uP2C, uP3C, uLightC;
uniform float uLightOn, uLightRad;
varying vec2 vUv;

// Full pipeline:
// Camera captures with its own scale/rotation centered at camPos.
// Each projector projects with its own scale/rotation centered at projPos.
// Forward: camView = camRot * (input - camPos) / camScale
//          output  = projPos + projScale * projRot(camView)
// Inverse: camView = invProjRot((output - projPos) / projScale)
//          input   = camPos + camScale * invCamRot(camView)
vec2 xform(vec2 uv, vec2 proj, vec2 cam, float ps, float pr, float cs, float cr){
  // Undo projector transform
  vec2 d = uv - proj;
  d.x *= uAspect;
  float co = cos(-pr), si = sin(-pr);
  d = vec2(co*d.x - si*d.y, si*d.x + co*d.y);
  d /= ps;
  // Apply camera inverse
  float co2 = cos(cr), si2 = sin(cr);
  d = vec2(co2*d.x - si2*d.y, si2*d.x + co2*d.y);
  d *= cs;
  d.x /= uAspect;
  return d + cam;
}

void main(){
  vec4 res = texture2D(uPrev, vUv) * uDecay;
  if(uP1On>0.5){ vec2 t=xform(vUv,uP1Pos,uCamPos,uP1S,uP1R,uCamS,uCamR);
    float m=step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.);
    res+=texture2D(uPrev,t)*vec4(uP1C,1.)*uGain*uP1B*m/3.; }
  if(uP2On>0.5){ vec2 t=xform(vUv,uP2Pos,uCamPos,uP2S,uP2R,uCamS,uCamR);
    float m=step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.);
    res+=texture2D(uPrev,t)*vec4(uP2C,1.)*uGain*uP2B*m/3.; }
  if(uP3On>0.5){ vec2 t=xform(vUv,uP3Pos,uCamPos,uP3S,uP3R,uCamS,uCamR);
    float m=step(0.,t.x)*step(t.x,1.)*step(0.,t.y)*step(t.y,1.);
    res+=texture2D(uPrev,t)*vec4(uP3C,1.)*uGain*uP3B*m/3.; }
  if(uLightOn>0.5){ vec2 d=vUv-uLightPos; d.x*=uAspect;
    float i=smoothstep(uLightRad,0.,length(d));
    res+=vec4(uLightC*i,i); }
  gl_FragColor=clamp(res,0.,1.);
}`;

/* ── Ping-pong render targets ── */
const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
let rtA = new THREE.WebGLRenderTarget(TEX_W, TEX_H, rtOpts);
let rtB = new THREE.WebGLRenderTarget(TEX_W, TEX_H, rtOpts);
let readRT = rtA, writeRT = rtB;

/* ── Feedback material & quad ── */
const fbUniforms = {
    uPrev: { value: null }, uDecay: { value: 0.9 }, uGain: { value: 0.6 },
    uAspect: { value: WALL_W / WALL_H },
    uCamPos: { value: new THREE.Vector2(0.5, 0.89) },
    uCamS: { value: 1.0 }, uCamR: { value: 0.0 },
    uP1Pos: { value: new THREE.Vector2() }, uP1S: { value: 0.5 }, uP1R: { value: 0.035 },
    uP1C: { value: new THREE.Vector3(1, 0.2, 0.33) }, uP1On: { value: 1 }, uP1B: { value: 1.0 },
    uP2Pos: { value: new THREE.Vector2() }, uP2S: { value: 0.5 }, uP2R: { value: -0.026 },
    uP2C: { value: new THREE.Vector3(0.2, 1, 0.53) }, uP2On: { value: 1 }, uP2B: { value: 1.0 },
    uP3Pos: { value: new THREE.Vector2() }, uP3S: { value: 0.5 }, uP3R: { value: 0.052 },
    uP3C: { value: new THREE.Vector3(0.33, 0.2, 1) }, uP3On: { value: 1 }, uP3B: { value: 1.0 },
    uLightPos: { value: new THREE.Vector2(0.5, 0.5) }, uLightRad: { value: 0.04 },
    uLightC: { value: new THREE.Vector3(1, 1, 1) }, uLightOn: { value: 0 },
};
const fbMat = new THREE.ShaderMaterial({ vertexShader: fbVert, fragmentShader: fbFrag, uniforms: fbUniforms });
const fbScene = new THREE.Scene();
const fbCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
fbScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fbMat));

/* ── Wall ── */
const wallMat = new THREE.MeshBasicMaterial({ map: readRT.texture });
const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), wallMat);
scene.add(wallMesh);
// subtle frame
const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(WALL_W + 0.3, WALL_H + 0.3)),
    new THREE.LineBasicMaterial({ color: 0x222244 })
);
frame.position.z = 0.01; scene.add(frame);

/* ── Installation Camera (the one hooked to projectors) ── */
const CAM_Z = 4.0;
const instCam = new THREE.Group();
// body
const camBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.6, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.7, roughness: 0.3 })
);
instCam.add(camBody);
// lens barrel
const camLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.35, 16),
    new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x88aaff, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.2 })
);
camLens.rotation.x = Math.PI / 2; camLens.position.z = 0.45;
instCam.add(camLens);
// viewfinder bump
const camVF = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.3 })
);
camVF.position.set(0, 0.35, -0.1);
instCam.add(camVF);
// small indicator light
const camLight = new THREE.PointLight(0x88aaff, 0.4, 3);
camLight.position.z = 0.5;
instCam.add(camLight);
// Face the wall (lens toward -z)
instCam.rotation.y = Math.PI;
instCam.position.set(0, 3.5, CAM_Z);
instCam.userData.isCamera = true;
instCam.userData.isDraggable = true;
scene.add(instCam);

/* ── Projector helpers ── */
function w2uv(x, y) { return new THREE.Vector2((x + WALL_W / 2) / WALL_W, (y + WALL_H / 2) / WALL_H); }

function makeProjector(hex, pos) {
    const g = new THREE.Group();
    // body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.45, 0.45),
        new THREE.MeshStandardMaterial({ color: 0x1a1a2e, metalness: 0.8, roughness: 0.3 })
    );
    g.add(body);
    // lens — built pointing +z, we'll rotate the whole group to face the wall
    const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.2, 0.25, 16),
        new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 2, metalness: 0.4, roughness: 0.2 })
    );
    lens.rotation.x = Math.PI / 2; lens.position.z = 0.35;
    g.add(lens);
    // glow light at front (lens side)
    const pl = new THREE.PointLight(hex, 0.8, 4); pl.position.z = 0.4; g.add(pl);
    g.position.copy(pos);
    // Rotate entire projector 180° around Y so lens faces the wall (-z direction)
    g.rotation.y = Math.PI;
    g.userData.isProjector = true;
    g.userData.isDraggable = true;
    scene.add(g);
    return g;
}

const projData = [
    { hex: 0xff3355, pos: new THREE.Vector3(-3, 1.5, PROJ_Z), uKey: '1' },
    { hex: 0x33ff88, pos: new THREE.Vector3(3, -1.5, PROJ_Z), uKey: '2' },
    { hex: 0x5533ff, pos: new THREE.Vector3(0, 3, PROJ_Z), uKey: '3' },
];
const projMeshes = projData.map(d => makeProjector(d.hex, d.pos));

/* ── Light beams (translucent cones) ── */
const beamMats = projData.map(d => new THREE.MeshBasicMaterial({
    color: d.hex, transparent: true, opacity: 0.025,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
}));
const beams = projData.map((d, i) => {
    const pz = projMeshes[i].position.z;
    const geo = new THREE.ConeGeometry(2, pz, 32, 1, true);
    const m = new THREE.Mesh(geo, beamMats[i]);
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
});

function syncBeam(i) {
    const p = projMeshes[i].position;
    const pz = p.z;
    // Rebuild beam geometry for new distance
    beams[i].geometry.dispose();
    beams[i].geometry = new THREE.ConeGeometry(2, pz, 32, 1, true);
    beams[i].position.set(p.x, p.y, pz / 2);
}
projMeshes.forEach((_, i) => syncBeam(i));

function syncUniforms() {
    projMeshes.forEach((m, i) => {
        const uv = w2uv(m.position.x, m.position.y);
        fbUniforms[`uP${i + 1}Pos`].value.copy(uv);
    });
    // Sync installation camera position
    fbUniforms.uCamPos.value.copy(w2uv(instCam.position.x, instCam.position.y));
}
syncUniforms();

/* ── Interaction ── */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const wallPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let dragging = null, painting = false, paused = false;

function getHit(e) {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
}

// All draggable groups (projectors + installation camera)
const allDraggable = [...projMeshes, instCam];
const allDraggableChildren = allDraggable.flatMap(g => g.children);

renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    // Cmd+Click → orbit (handled by OrbitControls)
    if (cmdHeld) return;
    getHit(e);
    // check draggable objects (projectors + camera)
    const hits = raycaster.intersectObjects(allDraggableChildren, true);
    if (hits.length) {
        dragging = hits[0].object;
        while (dragging.parent && !dragging.userData.isDraggable) dragging = dragging.parent;
        return;
    }
    // paint on wall
    const pt = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(wallPlane, pt)) {
        painting = true;
        const uv = w2uv(pt.x, pt.y);
        fbUniforms.uLightPos.value.copy(uv);
        fbUniforms.uLightOn.value = 1;
    }
});

renderer.domElement.addEventListener('pointermove', e => {
    if (dragging) {
        getHit(e);
        const pt = new THREE.Vector3();
        const dragZ = dragging.position.z;
        if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -dragZ), pt)) {
            dragging.position.x = THREE.MathUtils.clamp(pt.x, -WALL_W / 2 + 0.5, WALL_W / 2 - 0.5);
            dragging.position.y = THREE.MathUtils.clamp(pt.y, -WALL_H / 2 + 0.5, WALL_H / 2 - 0.5);
            const idx = projMeshes.indexOf(dragging);
            if (idx >= 0) { syncBeam(idx); syncUniforms(); }
            // Also sync if dragging the camera
            if (dragging === instCam) { syncUniforms(); }
        }
    } else if (painting) {
        getHit(e);
        const pt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(wallPlane, pt)) {
            fbUniforms.uLightPos.value.copy(w2uv(pt.x, pt.y));
        }
    }
});

window.addEventListener('pointerup', () => {
    dragging = null;
    painting = false;
    fbUniforms.uLightOn.value = 0;
});

/* ── Seed ── */
function injectSeed() {
    // single small white dot at center
    fbUniforms.uLightPos.value.set(0.5, 0.5);
    fbUniforms.uLightC.value.set(1, 1, 1);
    fbUniforms.uLightRad.value = 0.015;
    fbUniforms.uLightOn.value = 1;
    // turn off after a few frames
    setTimeout(() => { fbUniforms.uLightOn.value = 0; }, 120);
}

function resetAll() {
    renderer.setRenderTarget(rtA); renderer.clear();
    renderer.setRenderTarget(rtB); renderer.clear();
    renderer.setRenderTarget(null);
    setTimeout(injectSeed, 100);
}

/* ── UI Wiring ── */
function wire(id, cb) {
    const el = document.getElementById(id);
    const vEl = document.getElementById(id + '-val');
    el.addEventListener('input', () => { cb(parseFloat(el.value)); if (vEl) vEl.textContent = el.value; });
}
wire('decay', v => fbUniforms.uDecay.value = v);
wire('gain', v => fbUniforms.uGain.value = v);
wire('p1s', v => fbUniforms.uP1S.value = v);
wire('p1r', v => { const r = v * Math.PI / 180; fbUniforms.uP1R.value = r; projMeshes[0].rotation.z = -r; });
wire('p2s', v => fbUniforms.uP2S.value = v);
wire('p2r', v => { const r = v * Math.PI / 180; fbUniforms.uP2R.value = r; projMeshes[1].rotation.z = -r; });
wire('p3s', v => fbUniforms.uP3S.value = v);
wire('p3r', v => { const r = v * Math.PI / 180; fbUniforms.uP3R.value = r; projMeshes[2].rotation.z = -r; });
wire('p1d', v => { projMeshes[0].position.z = v; syncBeam(0); });
wire('p2d', v => { projMeshes[1].position.z = v; syncBeam(1); });
wire('p3d', v => { projMeshes[2].position.z = v; syncBeam(2); });
wire('p1b', v => fbUniforms.uP1B.value = v);
wire('p2b', v => fbUniforms.uP2B.value = v);
wire('p3b', v => fbUniforms.uP3B.value = v);
wire('cams', v => fbUniforms.uCamS.value = v);
wire('camr', v => { const r = v * Math.PI / 180; fbUniforms.uCamR.value = r; instCam.rotation.z = r; });
wire('camd', v => { instCam.position.z = v; });
wire('brush', v => fbUniforms.uLightRad.value = v);

// Projector color pickers
function wireColor(pickerId, uniformKey, beamIdx) {
    document.getElementById(pickerId).addEventListener('input', e => {
        const c = new THREE.Color(e.target.value);
        fbUniforms[uniformKey].value.set(c.r, c.g, c.b);
        // Update beam & projector lens color
        if (beamIdx >= 0) {
            beamMats[beamIdx].color.set(e.target.value);
            // Update lens emissive
            const lens = projMeshes[beamIdx].children[1];
            if (lens && lens.material) {
                lens.material.color.set(e.target.value);
                lens.material.emissive.set(e.target.value);
            }
            // Update point light
            const pl = projMeshes[beamIdx].children[2];
            if (pl && pl.color) pl.color.set(e.target.value);
        }
    });
}
wireColor('p1c', 'uP1C', 0);
wireColor('p2c', 'uP2C', 1);
wireColor('p3c', 'uP3C', 2);

document.getElementById('brush-color').addEventListener('input', e => {
    const c = new THREE.Color(e.target.value);
    fbUniforms.uLightC.value.set(c.r, c.g, c.b);
});
document.getElementById('controls-toggle').addEventListener('click', () =>
    document.getElementById('controls-panel').classList.toggle('hidden'));
document.getElementById('clear-btn').addEventListener('click', () => {
    renderer.setRenderTarget(rtA); renderer.clear();
    renderer.setRenderTarget(rtB); renderer.clear();
    renderer.setRenderTarget(null);
});
document.getElementById('seed-btn').addEventListener('click', injectSeed);
document.getElementById('reset-btn').addEventListener('click', resetAll);
document.getElementById('pause-btn').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('pause-btn').textContent = paused ? 'Resume' : 'Pause';
});

/* ── Installation Camera Auto-Drift ── */
let autoDrift = false;
function driftNoise(t, seed) {
    return Math.sin(t * 0.13 + seed) * 0.5
        + Math.sin(t * 0.07 + seed * 2.3) * 0.3
        + Math.sin(t * 0.03 + seed * 5.1) * 0.2;
}
// Save home state for all drifting params
const driftHome = {
    camPos: instCam.position.clone(),
    camS: fbUniforms.uCamS.value,
    camR: fbUniforms.uCamR.value,
    projPos: projMeshes.map(m => m.position.clone()),
};
document.getElementById('drift-btn').addEventListener('click', () => {
    autoDrift = !autoDrift;
    document.getElementById('drift-btn').textContent = autoDrift ? 'Stop Drift' : 'Auto Drift';
    if (!autoDrift) {
        // Restore home state
        instCam.position.copy(driftHome.camPos);
        fbUniforms.uCamS.value = driftHome.camS;
        fbUniforms.uCamR.value = driftHome.camR;
        projMeshes.forEach((m, i) => { m.position.copy(driftHome.projPos[i]); syncBeam(i); });
        syncUniforms();
    }
});

/* ── Resize ── */
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

/* ── Animation Loop ── */
let fc = 0, ft = 0;
function animate(t) {
    requestAnimationFrame(animate);
    fc++;
    if (t - ft > 1000) { document.getElementById('fps').textContent = fc + ' fps'; fc = 0; ft = t; }

    // Auto-drift: slowly modulate camera and projector params
    if (autoDrift) {
        const s = t * 0.001;
        // Camera position
        instCam.position.x = driftHome.camPos.x + driftNoise(s, 0) * 4;
        instCam.position.y = driftHome.camPos.y + driftNoise(s, 7) * 2.5;
        // Camera scale (oscillate gently around home)
        fbUniforms.uCamS.value = driftHome.camS + driftNoise(s, 17) * 0.3;
        // Camera rotation (gentle wobble)
        fbUniforms.uCamR.value = driftHome.camR + driftNoise(s, 23) * 0.15;
        // Projector positions (subtle wander)
        projMeshes.forEach((m, i) => {
            const home = driftHome.projPos[i];
            m.position.x = home.x + driftNoise(s, 30 + i * 11) * 1.5;
            m.position.y = home.y + driftNoise(s, 40 + i * 13) * 1.0;
            syncBeam(i);
        });
        syncUniforms();
    }

    orbit.update();
    if (!paused) {
        // feedback pass
        fbUniforms.uPrev.value = readRT.texture;
        renderer.setRenderTarget(writeRT);
        renderer.render(fbScene, fbCam);
        [readRT, writeRT] = [writeRT, readRT];
    }
    // display
    wallMat.map = readRT.texture;
    wallMat.needsUpdate = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
}

/* ── Boot ── */
renderer.setRenderTarget(rtA); renderer.clear();
renderer.setRenderTarget(rtB); renderer.clear();
renderer.setRenderTarget(null);
setTimeout(injectSeed, 300);
requestAnimationFrame(animate);
