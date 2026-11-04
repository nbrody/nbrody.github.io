// view3d.js — the surface view: the pretzel in three.js, with the curves on it.
// Everything drawn here is a picture of the hyperbolic state through the atlas: a point of the
// polygon D goes to a point of the pretzel. The view never changes the state itself.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { samplePoints } from './atlas.js';
import { pairHue, HUES } from './render.js';
import { lerpGeo } from './hyp.js';

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const light = () => document.documentElement.classList.contains('light');

let st = null, api = null, atlas = null;
let renderer, scene, camera, controls, world, root, box, labelBox;
let surface = null, needsRender = true, rect = { x: 0, y: 0, w: 1, h: 1 }, visible = false;
const mats = {};
const tubes = new Map();      // key → Tube
let band = null, bandKey = null;
let labels = [];
let drawMode = false, stroke = null, userMoved = false;

// ------------------------------------------------------------------ tubes
// A tube along polylines lying on the surface: each point comes with the surface normal, and
// the tube is lifted along it so that it rests on the surface.
class Tube {
    constructor(radius, material, sides = 8) {
        this.r = radius; this.sides = sides;
        this.geom = new THREE.BufferGeometry();
        this.mesh = new THREE.Mesh(this.geom, material);
        this.mesh.frustumCulled = false;
        this.capV = 0; this.capI = 0;
    }
    set(lines, radius = this.r) {
        needsRender = true;
        const S = this.sides;
        let nv = 0, ni = 0;
        for (const L of lines) { const n = L.pts.length; if (n < 2) continue; nv += n * S; ni += (L.closed ? n : n - 1) * S * 6; }
        if (nv > this.capV) {
            this.capV = Math.ceil(nv * 1.4);
            this.pos = new Float32Array(3 * this.capV); this.nrm = new Float32Array(3 * this.capV);
            this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
            this.geom.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
        }
        if (ni > this.capI) {
            this.capI = Math.ceil(ni * 1.4);
            this.idx = new Uint32Array(this.capI);
            this.geom.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
        }
        const P = this.pos, Nn = this.nrm, I = this.idx, lift = radius * 0.75;
        let v = 0, k = 0;
        const cs = [], sn = [];
        for (let q = 0; q < S; q++) { cs.push(Math.cos(2 * Math.PI * q / S)); sn.push(Math.sin(2 * Math.PI * q / S)); }
        for (const L of lines) {
            const n = L.pts.length;
            if (n < 2) continue;
            const v0 = v;
            for (let i = 0; i < n; i++) {
                const p = L.pts[i], s = L.nrm[i];
                const a = L.pts[i > 0 ? i - 1 : L.closed ? n - 1 : 0], b = L.pts[i < n - 1 ? i + 1 : L.closed ? 0 : n - 1];
                let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
                let tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
                // binormal = T × n, then the in-surface normal N' = B × T
                let bx = ty * s[2] - tz * s[1], by = tz * s[0] - tx * s[2], bz = tx * s[1] - ty * s[0];
                let bl = Math.hypot(bx, by, bz);
                if (bl < 1e-9) { bx = 1; by = 0; bz = 0; bl = 1; }
                bx /= bl; by /= bl; bz /= bl;
                const nx = by * tz - bz * ty, ny = bz * tx - bx * tz, nz = bx * ty - by * tx;
                const cx = p[0] + s[0] * lift, cy = p[1] + s[1] * lift, cz = p[2] + s[2] * lift;
                for (let q = 0; q < S; q++) {
                    const ox = cs[q] * nx + sn[q] * bx, oy = cs[q] * ny + sn[q] * by, oz = cs[q] * nz + sn[q] * bz;
                    P[3 * v] = cx + radius * ox; P[3 * v + 1] = cy + radius * oy; P[3 * v + 2] = cz + radius * oz;
                    Nn[3 * v] = ox; Nn[3 * v + 1] = oy; Nn[3 * v + 2] = oz;
                    v++;
                }
            }
            const segs = L.closed ? n : n - 1;
            for (let i = 0; i < segs; i++) {
                const r0 = v0 + i * S, r1 = v0 + ((i + 1) % n) * S;
                for (let q = 0; q < S; q++) {
                    const q1 = (q + 1) % S;
                    I[k++] = r0 + q; I[k++] = r1 + q; I[k++] = r1 + q1;
                    I[k++] = r0 + q; I[k++] = r1 + q1; I[k++] = r0 + q1;
                }
            }
        }
        this.geom.attributes.position.needsUpdate = true;
        this.geom.attributes.normal.needsUpdate = true;
        this.geom.index.needsUpdate = true;
        this.geom.setDrawRange(0, k);
        this.mesh.visible = k > 0;
    }
}

// points of D (a closed loop) → lines on the pretzel; tear[k] breaks the step k → k+1
function toLine(pts, closed = true, tear = null) {
    const n = pts.length, o = { pos: [0, 0, 0], nrm: [0, 0, 0] };
    const P = pts.map(p => { atlas.at(p, o); return [o.pos.slice(), o.nrm.slice()]; });
    const k0 = tear ? tear.indexOf(true) : -1;
    if (k0 < 0) return [{ pts: P.map(x => x[0]), nrm: P.map(x => x[1]), closed }];
    const out = [];
    let cur = null;
    for (let q = 1; q <= n; q++) {
        const i = (k0 + q) % n;
        if (!cur) cur = { pts: [], nrm: [], closed: false };
        cur.pts.push(P[i][0]); cur.nrm.push(P[i][1]);
        if (tear[i]) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
}
const curveLine = c => toLine(samplePoints(c, 0.02));

// ------------------------------------------------------------------ setup
export function init(el, state, actions) {
    st = state; api = actions; box = el;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.className = 'stage3d-canvas';
    el.appendChild(renderer.domElement);
    labelBox = document.createElement('div');
    labelBox.className = 'labels3d';
    el.appendChild(labelBox);
    scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
    camera.up.set(0, 0, 1);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.8;
    controls.addEventListener('change', () => { needsRender = true; });
    controls.addEventListener('start', () => { userMoved = true; });
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-3, -5, 8);
    scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8890a8, 0.5));
    world = new THREE.Group();
    scene.add(world);
    makeMaterials();
    document.addEventListener('themechange', () => { makeMaterials(true); needsRender = true; });
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', () => { stroke = null; controls.enabled = true; });
}

function makeMaterials(update = false) {
    const L = light();
    const spec = {
        surface: { color: L ? '#c3c9f2' : '#3a4270', roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.3, sheenColor: L ? '#ffffff' : '#8b93ff' },
    };
    if (!mats.surface) {
        mats.surface = new THREE.MeshPhysicalMaterial({ ...spec.surface, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        mats.ref = new THREE.MeshStandardMaterial({ roughness: 0.6 });
        mats.hot = new THREE.MeshStandardMaterial({ roughness: 0.35 });
        mats.glow = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false });
        mats.stroke = new THREE.MeshStandardMaterial({ roughness: 0.5 });
    } else for (const [k, v] of Object.entries(spec.surface)) mats.surface[k] = k.endsWith('olor') ? new THREE.Color(v) : v;
    mats.ref.color = new THREE.Color(L ? '#6e7590' : '#aeb5cf');
    mats.hot.color = new THREE.Color(css('--accent') || '#818cf8');
    mats.hot.emissive = new THREE.Color(css('--accent') || '#818cf8').multiplyScalar(0.25);
    mats.glow.color = new THREE.Color(L ? '#4f46e5' : '#c7d2fe');
    mats.stroke.color = new THREE.Color(L ? '#555b70' : '#c8cde0');
    if (band) band.material.uniforms.ink.value = new THREE.Color(css('--accent') || '#818cf8');
    applySeeThrough();
    if (update) for (const t of tubes.values()) t.version = -1;
}
function applySeeThrough() {
    const m = mats.surface;
    if (!m) return;
    m.transparent = !!st?.seeThrough;
    m.opacity = st?.seeThrough ? 0.4 : 1;
    m.depthWrite = !st?.seeThrough;
    m.needsUpdate = true;
}
const curveMat = new Map();
function matFor(hue) {
    const L = light(), key = hue + (L ? 'L' : 'D');
    if (!curveMat.has(key)) {
        const c = new THREE.Color(hue);
        curveMat.set(key, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, clearcoat: 0.6, emissive: c.clone().multiplyScalar(L ? 0.05 : 0.18) }));
    }
    return curveMat.get(key);
}

// ------------------------------------------------------------------ the atlas
export function setAtlas(a) {
    atlas = a;
    for (const t of tubes.values()) world.remove(t.mesh);
    tubes.clear();
    if (surface) { world.remove(surface); surface.geometry.dispose(); }
    clearBand();
    if (!a) { needsRender = true; return; }
    const { pos, nrm, tri } = a.pz;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(nrm), 3));
    g.setIndex(new THREE.BufferAttribute(Uint32Array.from(tri), 1));
    surface = new THREE.Mesh(g, mats.surface);
    world.add(surface);
    // the polygon's sides, glued in pairs: on the surface they are 2g loops through one point
    const S = a.S;
    for (let i = 0; i < S.n; i++) {
        if (S.partner[i] < i) continue;
        const pts = [];
        for (let k = 0; k <= 40; k++) pts.push(lerpGeo(S.vertices[(i + S.n - 1) % S.n], S.vertices[i], k / 40));
        const t = new Tube(0.0065, new THREE.MeshStandardMaterial({ color: new THREE.Color(pairHue(S, i)), roughness: 0.5 }), 6);
        t.set(toLine(pts, false));
        t.version = 0;
        tubes.set('side' + i, t);
        world.add(t.mesh);
    }
    frameCamera();
    makeLabels();
    needsRender = true;
}
function frameCamera() {
    const [x0, x1, y1] = atlas.pz.extent;
    const w = x1 - x0;
    const fit = Math.max(w / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(0.6, camera.aspect)), 2 * y1 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
    const d = 1.04 * fit + 0.6;
    camera.position.set(0, -0.82 * d, 0.58 * d);
    controls.target.set(0, 0, 0);
    controls.update();
}

export function resize(r) {
    rect = r;
    if (!renderer) return;
    box.style.left = `${r.x}px`; box.style.top = `${r.y}px`;
    box.style.width = `${r.w}px`; box.style.height = `${r.h}px`;
    renderer.setSize(r.w, r.h);
    camera.aspect = r.w / Math.max(1, r.h);
    camera.updateProjectionMatrix();
    if (atlas && !userMoved) frameCamera();
    needsRender = true;
}
export function resetCamera() { userMoved = false; if (atlas) frameCamera(); needsRender = true; }
export function show(v) {
    visible = v;
    box.style.display = v ? '' : 'none';
    needsRender = true;
}
export const isVisible = () => visible;
export function invalidate() { needsRender = true; }
export function setSeeThrough() { applySeeThrough(); needsRender = true; }
export function setDrawMode(v) { drawMode = v; renderer.domElement.classList.toggle('drawing', v); }

// ------------------------------------------------------------------ the twisting collar
const bandVert = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const bandFrag = `
uniform float t, e, K, fade;
uniform vec3 ink;
varying vec2 vUv;
void main() {
    float v = vUv.y, av = abs(v);
    float b = 1.0 - av; b = b * b * (3.0 - 2.0 * b);
    float shift = e * t * 0.5 * sign(v) * b;           // the slide, as a fraction of a turn
    float u = vUv.x - shift;                            // where this point was before the twist
    float f = fract(u * K);
    // the slide jumps across v = 0 (the tear), so take its derivative from the smooth part
    float x = 1.0 - av;
    float du = fwidth(vUv.x) + abs(e * t * 3.0 * x * (1.0 - x)) * fwidth(v);
    float w = clamp(du * K * 1.2, 1e-4, 0.25);
    float stripe = smoothstep(0.0, w, f) * (1.0 - smoothstep(0.3, 0.3 + w, f));
    float edge = smoothstep(1.0, 0.8, av);
    float a = (0.07 + 0.42 * stripe) * edge * fade;
    gl_FragColor = vec4(ink, a);
}`;
function clearBand() {
    if (band) { world.remove(band); band.geometry.dispose(); band = null; bandKey = null; }
}
// tw: a TwistMap; the band covers its collar, with stripes across it
function setBand(tw, key) {
    if (bandKey === key && band) return;
    clearBand();
    const ns = Math.max(64, Math.ceil(tw.L / 0.015)), nd = 36;
    const pos = new Float32Array(3 * (ns + 1) * (nd + 1)), uv = new Float32Array(2 * (ns + 1) * (nd + 1)), idx = [];
    const o = { pos: [0, 0, 0], nrm: [0, 0, 0] };
    let v = 0;
    for (let i = 0; i <= ns; i++)
        for (let j = 0; j <= nd; j++) {
            const vv = -1 + 2 * j / nd;
            atlas.at(tw.pointAt(tw.L * i / ns, vv * tw.w * 0.999), o);
            for (let q = 0; q < 3; q++) pos[3 * v + q] = o.pos[q] + 0.006 * o.nrm[q];
            uv[2 * v] = i / ns; uv[2 * v + 1] = vv;
            v++;
        }
    for (let i = 0; i < ns; i++)
        for (let j = 0; j < nd; j++) {
            const a = i * (nd + 1) + j, b = a + nd + 1;
            idx.push(a, b, b + 1, a, b + 1, a + 1);
        }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geom.setIndex(idx);
    const K = Math.max(6, Math.min(60, Math.round(tw.L / 0.16)));
    const mat = new THREE.ShaderMaterial({
        vertexShader: bandVert, fragmentShader: bandFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        uniforms: { t: { value: 0 }, e: { value: tw.e }, K: { value: K }, fade: { value: 1 }, ink: { value: new THREE.Color(css('--accent') || '#818cf8') } },
        extensions: { derivatives: true },
    });
    band = new THREE.Mesh(geom, mat);
    band.renderOrder = 2;
    bandKey = key;
    world.add(band);
}

// ------------------------------------------------------------------ labels
function makeLabels() {
    labelBox.innerHTML = '';
    labels = [];
    const { pz } = atlas;
    const tex = api.tex;
    for (let i = 1; i <= 2 * atlas.S.g + 1; i++) {
        const el = document.createElement('div');
        el.className = 'l3 ref';
        el.innerHTML = tex(`c_{${i}}`);
        labelBox.appendChild(el);
        const path = pz.chain[i];
        labels.push({ el, kind: 'ref', name: 'c' + i, anchors: path.filter((_, k) => k % 3 === 0).map(v => ({ p: [pz.pos[3 * v], pz.pos[3 * v + 1], pz.pos[3 * v + 2]], n: [pz.nrm[3 * v], pz.nrm[3 * v + 1], pz.nrm[3 * v + 2]] })) });
    }
}
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
function placeLabels() {
    const W = rect.w, H = rect.h;
    camera.getWorldPosition(_c);
    const showRefs = st.showRefs && !st.spinning;
    for (const L of labels) {
        const on = L.kind === 'ref' ? showRefs && !(st.g === 2 && L.name === 'c0') : !st.spinning;
        if (!on || !L.anchors.length) { L.el.style.display = 'none'; continue; }
        let best = null, bs = 0.25;
        for (const a of L.anchors) {
            _v.set(...a.p).applyMatrix4(world.matrixWorld);
            _n.set(...a.n).transformDirection(world.matrixWorld);
            const d = _c.clone().sub(_v).normalize();
            const s = d.dot(_n) + 0.15 * _n.z;
            if (s > bs) { bs = s; best = [_v.x + 0.07 * _n.x, _v.y + 0.07 * _n.y, _v.z + 0.07 * _n.z]; }
        }
        if (!best) { L.el.style.display = 'none'; continue; }
        _v.set(...best).project(camera);
        L.el.style.display = '';
        L.el.style.transform = `translate(${((_v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - _v.y) / 2 * H).toFixed(1)}px) translate(-50%, -50%)`;
    }
}
function userLabels() {
    // one label per user curve, anchored on its own points
    const want = st.curves.map(u => u.name).join('|');
    if (userLabels.key === want) return;
    userLabels.key = want;
    labels = labels.filter(L => { if (L.kind === 'user') L.el.remove(); return L.kind !== 'user'; });
    for (const u of st.curves) {
        const el = document.createElement('div');
        el.className = 'l3 user';
        el.innerHTML = api.tex(u.name);
        labelBox.appendChild(el);
        labels.push({ el, kind: 'user', u, anchors: [] });
    }
}

// ------------------------------------------------------------------ syncing with the state
function sync() {
    if (!atlas || atlas.S !== st.S) return;
    const a = st.anim;
    const hot = a && a.kind === 'twist' ? a.c : st.hotRef;
    // reference curves
    for (const [name, c] of Object.entries(st.refs)) {
        const isAux = !/^c\d+$/.test(name);
        const on = (isAux ? st.showAux : st.showRefs) && !(st.g === 2 && name === 'c0');
        const key = 'ref:' + name;
        let t = tubes.get(key);
        if (!on) { if (t) t.mesh.visible = false; continue; }
        const isHot = hot === c;
        if (!t) { t = new Tube(0.011, mats.ref, 6); tubes.set(key, t); world.add(t.mesh); t.version = -1; }
        if (t.version !== c.version) { t.set(curveLine(c)); t.version = c.version; }
        t.mesh.material = isHot ? mats.hot : mats.ref;
        t.mesh.visible = true;
        t.mesh.scale.setScalar(1);
    }
    for (const [k, t] of tubes) if (k.startsWith('ref:') && !(k.slice(4) in st.refs)) { world.remove(t.mesh); tubes.delete(k); }
    // polygon sides
    for (const [k, t] of tubes) if (k.startsWith('side')) t.mesh.visible = st.showPolygon3d && !st.spinning;
    // user curves
    const live = new Set();
    st.curves.forEach((u, i) => {
        const key = 'u:' + u.name;
        live.add(key);
        let t = tubes.get(key);
        if (!t) { t = new Tube(0.022, matFor(u.hue), 8); tubes.set(key, t); world.add(t.mesh); t.version = -1; }
        t.mesh.material = st.palette === 'ink' ? mats.stroke : matFor(u.hue);
        const img = a && a.kind === 'twist' && a.phase === 'wind' ? a.images?.get(u) : null;
        if (img) { t.set(toLine(img.pts, true, img.tear)); t.version = -2; }
        else if (t.version !== u.curve.version || t.curve !== u.curve) {
            const lines = u.curve.trivial ? [] : curveLine(u.curve);
            t.set(lines); t.version = u.curve.version; t.curve = u.curve;
            t.lines = lines;
        }
        // the selection glow
        const gk = 'glow:' + u.name;
        let gl = tubes.get(gk);
        if (i === st.sel && t.lines) {
            if (!gl) { gl = new Tube(0.046, mats.glow, 8); tubes.set(gk, gl); world.add(gl.mesh); }
            if (gl.version !== t.version || gl.curve !== u.curve) { gl.set(img ? toLine(img.pts, true, img.tear) : t.lines); gl.version = t.version; gl.curve = u.curve; }
            gl.mesh.visible = true;
        } else if (gl) gl.mesh.visible = false;
        if (!img) {
            const L = labels.find(l => l.kind === 'user' && l.u === u);
            if (L && t.lines && L.v !== t.version) {
                L.v = t.version;
                L.anchors = [];
                for (const line of t.lines) for (let k = 0; k < line.pts.length; k += 12) L.anchors.push({ p: line.pts[k], n: line.nrm[k] });
            }
        }
    });
    for (const [k, t] of tubes) if ((k.startsWith('u:') || k.startsWith('glow:')) && !live.has('u:' + k.split(':')[1])) { world.remove(t.mesh); tubes.delete(k); }
    // the collar of the twist, or of the generator under the mouse
    if (a && a.kind === 'twist' && a.tw) {
        setBand(a.tw, a);
        band.material.uniforms.t.value = a.phase === 'wind' ? a.t : 1;
        band.material.uniforms.e.value = a.tw.e;
        band.material.uniforms.fade.value = a.phase === 'wind' ? 1 : Math.max(0, 1 - (performance.now() - a.relaxStart) / 600);
    } else if (st.hotTw) {
        setBand(st.hotTw, st.hotTw);
        band.material.uniforms.t.value = 0;
        band.material.uniforms.fade.value = 0.8;
    } else clearBand();
    // a stroke drawn on the surface
    let sk = tubes.get('stroke');
    if (stroke && stroke.pts.length > 1) {
        if (!sk) { sk = new Tube(0.018, mats.stroke, 6); tubes.set('stroke', sk); world.add(sk.mesh); }
        sk.set([{ pts: stroke.xyz, nrm: stroke.nrm, closed: false }]);
        sk.mesh.visible = true;
    } else if (sk) sk.mesh.visible = false;
}

// the turn by π about an axis, at time t ∈ [0, 1] (0 or 1 is no turn)
export function spin(axis, t) {
    const ax = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    world.quaternion.setFromAxisAngle(ax, t >= 1 ? 0 : Math.PI * t);
    needsRender = true;
}

export function frame() {
    if (!visible || !renderer) return;
    controls.update();
    userLabels();
    sync();
    if (st.anim || needsRender || st.dirty3d || stroke) {
        renderer.render(scene, camera);
        placeLabels();
        needsRender = false;
        st.dirty3d = false;
    }
}

// ------------------------------------------------------------------ picking and drawing
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function cast(e, objs) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objs, false);
}
function surfacePoint(e) {
    if (!surface) return null;
    const hit = cast(e, [surface])[0];
    if (!hit) return null;
    const t = hit.faceIndex, { pos, tri } = atlas.pz;
    const local = world.worldToLocal(hit.point.clone());
    const V = q => new THREE.Vector3(pos[3 * tri[3 * t + q]], pos[3 * tri[3 * t + q] + 1], pos[3 * tri[3 * t + q] + 2]);
    const b = new THREE.Triangle(V(0), V(1), V(2)).getBarycoord(local, new THREE.Vector3());
    const bb = [b.x, b.y, b.z].map(x => Math.max(0, x)), z = bb[0] + bb[1] + bb[2];
    const p = atlas.fromSurface(t, bb.map(x => x / z));
    const o = atlas.at(p);
    return { p, xyz: o.pos, nrm: o.nrm };
}
let down = null;
function onDown(e) {
    if (!atlas || e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY };
    if (drawMode && !api.busy()) {
        const h = surfacePoint(e);
        if (h) {
            controls.enabled = false;
            stroke = { pts: [h.p], xyz: [h.xyz], nrm: [h.nrm], last: [e.clientX, e.clientY] };
            try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        }
    }
}
function onMove(e) {
    if (down) down.far = Math.max(down.far || 0, Math.hypot(e.clientX - down.x, e.clientY - down.y));
    if (!stroke) return;
    if (Math.hypot(e.clientX - stroke.last[0], e.clientY - stroke.last[1]) < 3) return;
    const h = surfacePoint(e);
    if (!h) return;
    stroke.last = [e.clientX, e.clientY];
    stroke.pts.push(h.p); stroke.xyz.push(h.xyz); stroke.nrm.push(h.nrm);
    needsRender = true;
}
function onUp(e) {
    const moved = down ? Math.max(down.far || 0, Math.hypot(e.clientX - down.x, e.clientY - down.y)) : 0;
    down = null;
    if (stroke) {
        const s = stroke;
        stroke = null;
        controls.enabled = true;
        if (moved > 8 && s.pts.length > 5) api.finishSurfaceStroke(s.pts);
        needsRender = true;
        if (moved > 8) return;
    }
    if (moved < 5) {
        // a click: select the curve under the mouse
        const objs = [];
        st.curves.forEach(u => { const t = tubes.get('u:' + u.name); if (t && t.mesh.visible) objs.push(t.mesh); });
        const hit = cast(e, objs)[0];
        const i = hit ? st.curves.findIndex(u => tubes.get('u:' + u.name)?.mesh === hit.object) : -1;
        api.select(i);
    }
}

export function snapshotPNG() {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
}
export { HUES };
// for debugging and screenshots: put the camera somewhere
export function lookFrom(p, target = [0, 0, 0]) {
    userMoved = true;
    camera.position.set(...p);
    controls.target.set(...target);
    controls.update();
    needsRender = true;
}
// for tests: a point of R³ (in the pretzel's frame) → client coordinates on the page
export function project(p) {
    const v = new THREE.Vector3(...p).applyMatrix4(world.matrixWorld).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}
