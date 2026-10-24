/**
 * Unwrapping the domain along an edge or a vertex: the tiles h·D of the
 * tessellation that meet there (gluing.js). The picture
 *
 *   1. brings the edge (or vertex) to the middle and looks down it;
 *   2. draws the cells one after another — round an edge in the order a walk
 *      round it meets them, at a vertex outward from D — each shrunk a little
 *      toward its centre so they stand apart;
 *   3. closes the gaps, and
 *   4. glides the domain (and the camera) back to where they were, the cells
 *      staying put round it. "Wrap back up" fades them out.
 *
 * Round an edge a soft glow keeps cycling through the cells once all are in.
 *
 * The centring is `app.focus` (app.js): an isometry outside every other
 * frame, never a group element. Cells are stored in their own home-frame
 * coordinates and the scene isometry is applied in the vertex shader, so they
 * ride every frame of a move. In cusp view the picture stays put (∞ keeps the
 * cusp).
 */
import * as THREE from 'three';
import {
    Matrix2x2, translationTowards, applyMatrixToBall, lorentzMatrix, projectToWall
} from './math.js';
import { edgeSamples, kleinToBall } from './polyhedron.js';
import { app, sceneMatrix, fordSceneMatrix } from './app.js';
import { displayedDomain, displayedHome, faceColors } from './domain.js';
import { camera, controls, renderer, toWorld, view, layer, disposeGroup } from './scene.js';
import { buildClippedFace } from './overlays.js';
import { edgeTiles, vertexTiles, edgeCentre, faceCentreHome } from './gluing.js';

const group = layer(true);
const hooks = { onSceneMoved: () => { }, setDomainHidden: () => { } };

/** main.js supplies the scene refresh and the switch for the raymarched domain. */
export function setUnwrapHooks(h) { Object.assign(hooks, h); }

// Timeline (seconds): each cell fades in over APPEAR, `interval` after the
// last; then a HOLD, the gaps CLOSE, and the view goes back.
const APPEAR = 0.5, HOLD = 0.6, CLOSE = 0.8, FADE = 0.35;
const CENTRE_MS = 900, BACK_MS = 1100;

let run = null;                // the unwrap on show (see startUnwrap)
let focusAnim = 0;             // id of the running focus animation (0: none)
let returnTo = null;           // { focus, dir, dist, target }: the view before centring

export function unwrapActive() { return !!run; }

/** What is unwrapped: { kind, index, count, closed, ford, built } or null. */
export function unwrapInfo() {
    return run ? { kind: run.kind, index: run.index, count: run.tiles.length, closed: run.closed, ford: run.ford, built: run.t0 !== null } : null;
}

function displayedScene() {
    return app.fordOn && app.fordScene ? fordSceneMatrix() : sceneMatrix();
}

// ---------------- the cells ----------------

// The scene isometry, as a Lorentz matrix, shared by every cell and updated
// once per frame.
const shared = { u_L: { value: new THREE.Matrix4() }, u_uhs: { value: false } };
let sharedFrame = -1;
function syncShared() {
    const f = renderer.info.render.frame;
    if (f === sharedFrame) return;
    sharedFrame = f;
    shared.u_L.value.set(...lorentzMatrix(displayedScene()));
    shared.u_uhs.value = view.model === 'uhs';
}

// Ball point (cell coordinates) → world point, and the shrink about the
// cell's centre.
const MAP_GLSL = `
uniform mat4 u_L;
uniform bool u_uhs;
uniform vec3 u_ctr;
uniform float u_scale;
vec3 toScene(vec3 p) {
    float r2 = min(dot(p, p), 0.9999995);
    float f = 1.0 / (1.0 - r2);
    vec4 H = u_L * vec4(2.0 * p * f, (1.0 + r2) * f);
    vec3 b = H.xyz / (1.0 + H.w);
    if (u_uhs) {
        float D = max(b.x * b.x + b.y * b.y + (1.0 - b.z) * (1.0 - b.z), 1e-12);
        return vec3(2.0 * b.x / D, (1.0 - dot(b, b)) / D, 2.0 * b.y / D);
    }
    return b;
}
vec3 shrink(vec3 w) {
    vec3 c = toScene(u_ctr);
    return c + u_scale * (w - c);
}`;

const TILE_VS = MAP_GLSL + `
attribute vec3 a_color;
attribute vec3 a_dir;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
    vec3 w = toScene(position);
    float r2 = dot(position, position);
    vec3 n = toScene(position + a_dir * 1e-3 * max(1.0 - r2, 1e-2)) - w;   // conformal: normals map along
    vN = normalize(normalMatrix * (dot(n, n) > 1e-20 ? n : vec3(0.0, 1.0, 0.0)));
    vec4 mv = modelViewMatrix * vec4(shrink(w), 1.0);
    vV = -mv.xyz;
    vW = w;
    vC = a_color;
    gl_Position = projectionMatrix * mv;
}`;

const TILE_FS = `
uniform bool u_uhs;
uniform float u_opacity;
uniform float u_glow;
uniform vec3 u_hot;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying vec3 vW;
void main() {
    if (u_uhs && any(greaterThan(abs(vW), vec3(40.0)))) discard;
    vec3 N = normalize(vN), V = normalize(vV);
    vec3 L = normalize(vec3(0.35, 0.6, 1.0));
    float ndl = abs(dot(N, L)), ndv = abs(dot(N, V));
    float spec = pow(abs(dot(N, normalize(L + V))), 36.0);
    float rim = pow(1.0 - ndv, 2.0);
    vec3 col = vC * (0.32 + 0.68 * ndl) + vec3(0.16 * spec) + vC * rim * 0.25;
    col = mix(col, u_hot, u_glow * (0.4 + 0.6 * rim));
    gl_FragColor = vec4(col, u_opacity);
}`;

const LINE_VS = MAP_GLSL + `
varying vec3 vW;
void main() {
    vW = toScene(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(shrink(vW), 1.0);
}`;

const LINE_FS = `
uniform bool u_uhs;
uniform vec3 u_color;
uniform float u_opacity;
varying vec3 vW;
void main() {
    if (u_uhs && any(greaterThan(abs(vW), vec3(40.0)))) discard;
    gl_FragColor = vec4(u_color, u_opacity);
}`;

const raw = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

/** Each wall's face of the home domain, triangulated once per unwrap (ball coordinates, with normals). */
function homeFaces(H) {
    const covs = H.walls.map(w => w.cov);
    return H.walls.map((w, j) => {
        const geom = w.geom;
        const others = covs.filter((_, k) => k !== j);
        const out = [];
        const c = faceCentreHome(H, j);
        const corners = H.poly.faces[j].vertices.map(v => kleinToBall(H.poly.vertices[v].k.clone().multiplyScalar(0.999999)));
        if (c) buildClippedFace(geom, projectToWall(c, geom), others, out, 36, 3, corners);
        if (!out.length && H.conePoint) buildClippedFace(geom, projectToWall(H.conePoint, geom), others, out, 36, 3, corners);
        const nrm = new Float64Array(out.length);
        for (let i = 0; i < out.length; i += 3) {
            if (geom.type === 'sphere') {
                nrm[i] = (out[i] - geom.c.x) / geom.r;
                nrm[i + 1] = (out[i + 1] - geom.c.y) / geom.r;
                nrm[i + 2] = (out[i + 2] - geom.c.z) / geom.r;
            } else {
                nrm[i] = geom.n.x; nrm[i + 1] = geom.n.y; nrm[i + 2] = geom.n.z;
            }
        }
        return { pos: out, nrm };
    });
}

/** Ball → ball by the Lorentz matrix L (double precision). */
function ballMap(L) {
    return (x, y, z, out) => {
        const r2 = x * x + y * y + z * z, f = 1 / (1 - r2);
        const hx = 2 * x * f, hy = 2 * y * f, hz = 2 * z * f, ht = (1 + r2) * f;
        const s = 1 / (1 + L[12] * hx + L[13] * hy + L[14] * hz + L[15] * ht);
        out[0] = (L[0] * hx + L[1] * hy + L[2] * hz + L[3] * ht) * s;
        out[1] = (L[4] * hx + L[5] * hy + L[6] * hz + L[7] * ht) * s;
        out[2] = (L[8] * hx + L[9] * hy + L[10] * hz + L[11] * ht) * s;
        return out;
    };
}

/** Cell T·D: a mesh (and its outline) in its own ball coordinates; the shader places it. */
function buildTile(r, colors, T, k) {
    const map = ballMap(lorentzMatrix(T));
    const pos = [], dir = [], col = [];
    const a = [0, 0, 0], b = [0, 0, 0], ctr = [0, 0, 0];
    const eps = 1e-5;
    r.faces.forEach((f, j) => {
        const c = colors[j] || [0.7, 0.7, 0.8];
        const P = f.pos, Nn = f.nrm;
        for (let i = 0; i < P.length; i += 3) {
            map(P[i], P[i + 1], P[i + 2], a);
            map(P[i] + eps * Nn[i], P[i + 1] + eps * Nn[i + 1], P[i + 2] + eps * Nn[i + 2], b);
            const nx = b[0] - a[0], ny = b[1] - a[1], nz = b[2] - a[2], nl = Math.hypot(nx, ny, nz) || 1;
            pos.push(a[0], a[1], a[2]);
            dir.push(nx / nl, ny / nl, nz / nl);
            col.push(c[0], c[1], c[2]);
            ctr[0] += a[0]; ctr[1] += a[1]; ctr[2] += a[2];
        }
    });
    if (!pos.length) return null;
    const nv = pos.length / 3;
    const tileUniforms = {
        u_ctr: { value: new THREE.Vector3(ctr[0] / nv, ctr[1] / nv, ctr[2] / nv) },
        u_scale: { value: 1 },
        u_L: shared.u_L, u_uhs: shared.u_uhs,
    };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('a_dir', new THREE.Float32BufferAttribute(dir, 3));
    g.setAttribute('a_color', new THREE.Float32BufferAttribute(col, 3));
    const light = view.theme === 'light';
    const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
        uniforms: {
            ...tileUniforms,
            u_opacity: { value: 0 }, u_glow: { value: 0 },
            u_hot: { value: raw(light ? 0xffffff : 0xfff3c4) },
        },
        vertexShader: TILE_VS, fragmentShader: TILE_FS,
        side: THREE.DoubleSide, transparent: true, depthWrite: true, depthTest: true,
        // Faces sit a hair behind, so outlines lying on them (coplanar faces of
        // neighbouring cells) draw clean instead of dotted.
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    }));
    mesh.frustumCulled = false;            // the geometry is not where the shader puts it
    mesh.renderOrder = 2;

    // The cell's edges, for a crisp outline.
    const seg = [], p = [0, 0, 0], q = [0, 0, 0];
    for (const e of r.H.poly.edges) {
        const pts = edgeSamples(e, 20);
        for (let i = 0; i + 1 < pts.length; i++) {
            map(pts[i].x, pts[i].y, pts[i].z, p);
            map(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z, q);
            seg.push(p[0], p[1], p[2], q[0], q[1], q[2]);
        }
    }
    if (seg.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
        const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({
            uniforms: { ...tileUniforms, u_color: { value: raw(light ? 0x1f2937 : 0x05070f) }, u_opacity: { value: 0 } },
            vertexShader: LINE_VS, fragmentShader: LINE_FS,
            transparent: true, depthWrite: false,
        }));
        lines.frustumCulled = false;
        lines.renderOrder = 3;
        mesh.add(lines);
    }
    mesh.onBeforeRender = () => animateTile(r, mesh, k);
    return mesh;
}

const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/** When the cells are all in, when the gaps start to close, and when the view starts back. */
function timeline(r) {
    const built = r.t0 + (r.tiles.length - 1) * r.interval + APPEAR;
    return { built, close: built + HOLD, back: built + HOLD + CLOSE };
}

/** Per frame: a cell fades and grows in on its turn, the gaps close, and (round an edge) the glow cycles. */
function animateTile(r, mesh, k) {
    if (r.t0 === null) return;
    syncShared();
    const now = performance.now() / 1000;
    const T = timeline(r);
    const a = clamp01((now - r.t0 - k * r.interval) / APPEAR);
    const ease = 1 - (1 - a) ** 3;
    // D replaces the raymarched domain at full size and shrinks with the rest.
    let s = k === 0 ? 1 + (r.gap - 1) * ease : r.gap * (0.55 + 0.45 * ease);
    s += (1 - r.gap) * smooth(clamp01((now - T.close) / CLOSE));
    let opacity = k === 0 ? 1 : smooth(a);
    if (r.fadeStart) opacity *= 1 - clamp01((now - r.fadeStart) / FADE);
    const u = mesh.material.uniforms;
    u.u_scale.value = s;
    u.u_opacity.value = opacity;
    const lines = mesh.children[0];
    if (lines) lines.material.uniforms.u_opacity.value = 0.5 * opacity;
    let glow = k === 0 && !r.settled ? 0.1 : 0;
    const n = r.tiles.length;
    if (r.kind === 'edge' && n > 1 && now > T.built) {
        const period = Math.max(2.4, 0.42 * n);
        const phase = ((now - T.built) / period) % 1;
        let d = phase - k / n;
        d -= Math.round(d);
        glow += 0.24 * Math.min(1, (now - T.built) / 0.6) * Math.exp(-((d * n) ** 2) / 0.6);
    }
    u.u_glow.value = glow;
}

function buildRun(r) {
    disposeRun(r);
    r.group = new THREE.Group();
    group.add(r.group);
    r.colors = faceColors(displayedDomain());
    r.theme = view.theme;
    r.meshes = r.tiles.map((t, k) => {
        const m = buildTile(r, r.colors, t.T, k);
        if (m) r.group.add(m);
        return m;
    });
    if (r.settled && r.meshes[0]) r.meshes[0].visible = false;
}

function disposeRun(r) {
    if (!r.group) return;
    disposeGroup(r.group);
    group.remove(r.group);
    r.group = null;
}

/** After the view moves the cells follow by themselves; a theme or palette change rebuilds them. */
export function refreshUnwrap() {
    const r = run;
    if (!r || r.t0 === null) return;
    if (r.theme !== view.theme || r.colors !== faceColors(displayedDomain())) buildRun(r);
}

// ---------------- moving the view ----------------

/**
 * Animate app.focus to `target` (null = none), easing the camera to `cam`
 * ({ dir, dist, target }) on the way; `done` runs at the end.
 */
function animateFocus(target, ms, cam, done) {
    const I = Matrix2x2.identity();
    const F0 = app.focus || I, F1 = target || I;
    const G = F1.mul(F0.inv()).normalized();
    let X = null;
    try { X = G.log(); } catch (e) { X = null; }
    const id = ++focusAnim;
    app.animating = true;
    const c0 = camera.position.clone(), t0 = controls.target.clone();
    const u0 = c0.clone().sub(t0), r0 = u0.length();
    u0.normalize();
    const q = cam ? new THREE.Quaternion().setFromUnitVectors(u0, cam.dir) : null;
    const qt = new THREE.Quaternion();
    const start = performance.now();
    const step = (now) => {
        if (id !== focusAnim) return;
        const t = Math.min(1, (now - start) / ms), e = smooth(t);
        if (t < 1) {
            app.focus = X ? Matrix2x2.exp(new Matrix2x2(X.a.mul(e), X.b.mul(e), X.c.mul(e), X.d.mul(e))).mul(F0).normalized() : F0;
            if (cam) {
                qt.identity().slerp(q, e);
                const tg = t0.clone().lerp(cam.target, e);
                controls.target.copy(tg);
                camera.position.copy(tg).addScaledVector(u0.clone().applyQuaternion(qt), r0 + (cam.dist - r0) * e);
            }
            hooks.onSceneMoved({ fast: true });
            requestAnimationFrame(step);
            return;
        }
        focusAnim = 0;
        app.focus = target;
        app.animating = false;
        if (cam) {
            controls.target.copy(cam.target);
            camera.position.copy(cam.target).addScaledVector(cam.dir, cam.dist);
        }
        hooks.onSceneMoved();
        if (done) done();
    };
    requestAnimationFrame(step);
}

/** Look down the edge — the cells round it then sit in sectors — tilted ~10° so it still shows. */
function edgeViewDir(tangent, current) {
    const a = tangent.clone().normalize();
    if (a.dot(current) < 0) a.negate();
    let w = current.clone().addScaledVector(a, -current.dot(a));
    if (w.lengthSq() < 1e-6) w = new THREE.Vector3(0, 1, 0).addScaledVector(a, -a.y);
    if (w.lengthSq() < 1e-6) w = new THREE.Vector3(1, 0, 0);
    w.normalize();
    return a.multiplyScalar(Math.cos(0.18)).addScaledVector(w, Math.sin(0.18)).normalize();
}

/** The camera as it is now, in animateFocus's terms. */
function currentCamera() {
    const d = camera.position.clone().sub(controls.target);
    return { dir: d.clone().normalize(), dist: d.length(), target: controls.target.clone() };
}

function sameFocus(a, b) {
    if (!a || !b) return !a && !b;
    const d = (z, w) => Math.abs(z.re - w.re) + Math.abs(z.im - w.im);
    return d(a.a, b.a) + d(a.b, b.b) + d(a.c, b.c) + d(a.d, b.d) < 1e-12;
}

// ---------------- start / stop ----------------

/**
 * Unwrap along edge `index` (kind 'edge') or vertex `index` (kind 'vertex')
 * of the displayed domain. `onChange` runs when the cells start appearing and
 * again when the view is back.
 */
export function startUnwrap(kind, index, onChange) {
    if (app.animating) return false;
    const H = displayedHome();
    if (!H) return false;
    const ford = !!(app.fordOn && app.fordHome);
    const res = kind === 'edge' ? edgeTiles(H, index, { ford }) : vertexTiles(H, index, { ford });
    const n = res.tiles.length;
    const r = run = {
        kind, index, ford, H, tiles: res.tiles,
        closed: kind === 'edge' ? res.closed : res.complete,
        faces: homeFaces(H),
        gap: kind === 'edge' ? 0.94 : 0.92,
        interval: Math.max(0.12, Math.min(0.45, 2.8 / Math.max(1, n))),
        t0: null, settled: false, group: null, meshes: [],
    };
    const settle = () => {
        if (run !== r) return;
        returnTo = null;
        r.settled = true;
        hooks.setDomainHidden(false);          // the domain itself again, its neighbours round it
        if (r.meshes[0]) r.meshes[0].visible = false;
        if (onChange) onChange();
    };
    const goBack = () => {
        if (run !== r) return;
        if (!returnTo) { settle(); return; }
        if (app.animating) { setTimeout(goBack, 200); return; }   // another move is on: wait for it
        animateFocus(returnTo.focus, BACK_MS, returnTo, settle);
    };
    const begin = () => {
        if (run !== r) return;
        hooks.setDomainHidden(true);
        r.t0 = performance.now() / 1000;
        buildRun(r);
        setTimeout(goBack, Math.max(0, timeline(r).back * 1000 - performance.now()));
        if (onChange) onChange();
    };
    returnTo = null;
    if (app.fordOn) { begin(); return true; }

    // Bring the edge's midpoint (or the vertex) to the centre of the ball.
    returnTo = { focus: app.focus, ...currentCamera() };
    const S = displayedScene();
    const pHome = kind === 'edge' ? edgeCentre(H, index) : kleinToBall(H.poly.vertices[index].k);
    const p = applyMatrixToBall(S, pHome);
    const rad = p.length();
    const C = rad > 1e-9 ? translationTowards(p.clone().multiplyScalar(1 / rad), -2 * Math.atanh(Math.min(rad, 0.999999))) : Matrix2x2.identity();
    const S1 = C.mul(S).normalized();
    const uhs = view.model === 'uhs';
    const centre = uhs ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 0);
    const current = returnTo.dir;
    let dir;
    if (kind === 'edge') {
        const pts = edgeSamples(H.poly.edges[index], 40).map(x => toWorld(applyMatrixToBall(S1, x)));
        let i = 0;
        pts.forEach((x, j) => { if (x.distanceToSquared(centre) < pts[i].distanceToSquared(centre)) i = j; });
        const tangent = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]);
        dir = edgeViewDir(tangent, current);
    } else {
        // Keep D off the line of sight to the vertex.
        const d = toWorld(applyMatrixToBall(S1, H.conePoint || new THREE.Vector3())).sub(centre);
        dir = current.clone();
        if (d.lengthSq() > 1e-9) {
            d.normalize();
            dir.addScaledVector(d, -Math.max(0, dir.dot(d)));
            if (dir.lengthSq() < 1e-6) dir = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y);
            dir.normalize();
        }
    }
    const r0 = returnTo.dist;
    const dist = uhs ? Math.max(2.2, Math.min(3.4, r0)) : Math.max(2.5, Math.min(3.2, r0));
    animateFocus(C.mul(app.focus || Matrix2x2.identity()).normalized(), CENTRE_MS, { dir, dist, target: centre }, begin);
    return true;
}

/**
 * End the unwrap: the cells fade out (or go at once), the domain comes back,
 * and if the view is still centred it goes back too — animated, or at once
 * (when the group or the view changes under it).
 */
export function stopUnwrap({ animate = false } = {}) {
    const r = run;
    if (r) {
        run = null;
        if (animate && r.group && r.t0 !== null) {
            r.fadeStart = performance.now() / 1000;
            setTimeout(() => disposeRun(r), FADE * 1000 + 60);
        } else {
            disposeRun(r);
        }
        hooks.setDomainHidden(false);
    }
    // Where the view belongs: as it was before centring, if it has not got back yet.
    const back = returnTo;
    returnTo = null;
    const target = back ? back.focus : (r ? app.focus : null);
    if (!focusAnim && sameFocus(app.focus, target)) return !!r;
    if (animate && !app.animating) {
        animateFocus(target, BACK_MS, back, null);
    } else {
        if (focusAnim) { focusAnim = 0; app.animating = false; }
        app.focus = target;
        hooks.onSceneMoved();
    }
    return !!r;
}
