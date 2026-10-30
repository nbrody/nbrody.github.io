// render.js — the three.js picture: smooth tubes along the edges, balls at the
// vertices, and (optionally) the symmetry elements.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const PALETTES = {
    aurora: { name: 'Aurora', colors: ['#818cf8', '#22d3ee', '#f472b6', '#fbbf24', '#4ade80', '#fb923c', '#a78bfa', '#2dd4bf', '#f87171', '#60a5fa'] },
    jewel: { name: 'Jewel', colors: ['#4f46e5', '#0891b2', '#db2777', '#d97706', '#16a34a', '#ea580c', '#7c3aed', '#0d9488', '#dc2626', '#2563eb'] },
    pastel: { name: 'Pastel', colors: ['#a5b4fc', '#67e8f9', '#f9a8d4', '#fde68a', '#86efac', '#fdba74', '#c4b5fd', '#5eead4', '#fca5a5', '#93c5fd'] },
    porcelain: { name: 'Porcelain', colors: ['#e8ebf3'], light: ['#3b4256'] },
    indigo: { name: 'Indigo', colors: ['#a5b4fc'], light: ['#4f46e5'] },
};

const AXIS_COLORS = { 2: '#22d3ee', 3: '#fbbf24', 4: '#f472b6', 5: '#4ade80', 6: '#a78bfa' };

const SUB = 3;          // render subdivisions per bead segment
const RADIAL = 14;

/** A tube whose geometry is rewritten in place every frame. */
class Tube {
    constructor(material) {
        this.geometry = new THREE.BufferGeometry();
        this.mesh = new THREE.Mesh(this.geometry, material);
        this.rings = 0;
        this.closed = false;
    }

    alloc(rings, closed) {
        this.rings = rings; this.closed = closed;
        const nv = rings * (RADIAL + 1);
        this.pos = new Float32Array(3 * nv);
        this.nor = new Float32Array(3 * nv);
        const idx = [];
        for (let k = 0; k + 1 < rings; k++) for (let j = 0; j < RADIAL; j++) {
            const a = k * (RADIAL + 1) + j, b = a + RADIAL + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        this.geometry.dispose();
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setIndex(idx);
        this.mesh.geometry = this.geometry;
    }

    /** pts: bead positions (a circle repeats its first point at the end). */
    update(pts, closed, radius) {
        const P = subdivide(pts, closed);
        if (P.length !== this.rings || closed !== this.closed) this.alloc(P.length, closed);
        const n = P.length;
        // tangents
        const T = P.map((p, k) => {
            const a = closed ? P[(k - 1 + n - 1) % (n - 1)] : P[Math.max(0, k - 1)];
            const b = closed ? P[(k + 1) % (n - 1)] : P[Math.min(n - 1, k + 1)];
            return norm(sub3(b, a));
        });
        if (closed) T[n - 1] = T[0];
        // parallel transport frames
        const N = new Array(n);
        let t0 = T[0];
        let n0 = norm(cross(t0, Math.abs(t0[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0]));
        N[0] = n0;
        for (let k = 1; k < n; k++) {
            const prev = N[k - 1];
            const d = dot(prev, T[k]);
            let v = [prev[0] - d * T[k][0], prev[1] - d * T[k][1], prev[2] - d * T[k][2]];
            const l = Math.hypot(...v);
            v = l > 1e-9 ? v.map(c => c / l) : norm(cross(T[k], [0, 0, 1]));
            N[k] = v;
        }
        if (closed) {
            // spread the holonomy so the seam matches
            const B0 = cross(T[0], N[0]);
            const ang = Math.atan2(dot(N[n - 1], B0), dot(N[n - 1], N[0]));
            for (let k = 0; k < n; k++) N[k] = rotateAbout(N[k], T[k], -ang * k / (n - 1));
        }
        const pos = this.pos, nor = this.nor;
        let o = 0;
        for (let k = 0; k < n; k++) {
            const t = T[k], nn = N[k], b = cross(t, nn), p = P[k];
            for (let j = 0; j <= RADIAL; j++) {
                const th = (2 * Math.PI * j) / RADIAL;
                const c = Math.cos(th), s = Math.sin(th);
                const nx = c * nn[0] + s * b[0], ny = c * nn[1] + s * b[1], nz = c * nn[2] + s * b[2];
                pos[o] = p[0] + radius * nx; pos[o + 1] = p[1] + radius * ny; pos[o + 2] = p[2] + radius * nz;
                nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
                o += 3;
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.normal.needsUpdate = true;
        this.geometry.computeBoundingSphere();
    }
}

/** Uniform Catmull–Rom subdivision of a bead polyline. */
function subdivide(pts, closed) {
    const n = pts.length;
    const m = closed ? n - 1 : n;           // distinct points
    const at = i => closed ? pts[((i % m) + m) % m] : pts[Math.max(0, Math.min(n - 1, i))];
    const out = [];
    const spans = closed ? m : n - 1;
    for (let i = 0; i < spans; i++) {
        const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
        for (let s = 0; s < SUB; s++) {
            const u = s / SUB, u2 = u * u, u3 = u2 * u;
            out.push([0, 1, 2].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3)));
        }
    }
    out.push(closed ? out[0].slice() : pts[n - 1].slice());
    return out;
}

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function rotateAbout(v, k, th) {
    const c = Math.cos(th), s = Math.sin(th), kv = cross(k, v), d = dot(k, v);
    return [0, 1, 2].map(i => v[i] * c + kv[i] * s + k[i] * d * (1 - c));
}

export class View {
    constructor(container) {
        this.container = container;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        container.appendChild(renderer.domElement);
        this.renderer = renderer;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 500);
        this.camera.position.set(0, 0.6, 9);
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.autoRotateSpeed = 0.8;

        const pmrem = new THREE.PMREMGenerator(renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1530, 0.7));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(3, 5, 4);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x9fb4ff, 0.6);
        rim.position.set(-4, -2, -3);
        this.scene.add(rim);

        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.symGroup = new THREE.Group();
        this.scene.add(this.symGroup);

        this.tubes = [];
        this.balls = [];
        this.ballGeo = new THREE.SphereGeometry(1, 28, 18);
        this.palette = 'aurora';
        this.theme = 'dark';
        this.radiusScale = 1;
        this.panelSpace = 0;
        this.ray = new THREE.Raycaster();

        this.resize();
        window.addEventListener('resize', () => this.resize());
        // follow the shape's size until the user zooms
        this.autoZoom = true;
        renderer.domElement.addEventListener('wheel', () => { this.autoZoom = false; }, { passive: true });
        renderer.domElement.addEventListener('pointerdown', e => { if (!e.isPrimary) this.autoZoom = false; });
    }

    /** Distance at which a ball of radius R fits the free part of the window, with a margin. */
    fitDistance(R) {
        const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
        const P = w > 760 ? this.panelSpace : 0;
        const halfV = (this.camera.fov * Math.PI) / 360;
        const halfH = Math.atan(Math.tan(halfV) * ((w - P) / h));
        return (1.3 * R) / Math.sin(Math.min(halfV, halfH));
    }

    /** Ease the camera distance toward one that fits the shape. */
    follow(g) {
        if (!this.autoZoom) return;
        let R = 0;
        for (let i = 0; i < g.N; i++) R = Math.max(R, Math.hypot(g.x[3 * i], g.x[3 * i + 1], g.x[3 * i + 2]));
        if (!R) return;
        const want = this.fitDistance(R);
        const off = this.camera.position.clone().sub(this.controls.target);
        const d = off.length();
        const nd = d + 0.06 * (want - d);
        this.camera.position.copy(this.controls.target).add(off.multiplyScalar(nd / d));
        this.camera.near = nd / 100; this.camera.far = nd * 20;
        this.camera.updateProjectionMatrix();
        this.boundR = R;
    }

    resize() {
        const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
        this.applyOffset();
    }

    /** Centre the picture in the part of the window the panel leaves free. */
    setPanelSpace(px) { this.panelSpace = px; this.applyOffset(); }
    applyOffset() {
        const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
        const P = w > 760 ? this.panelSpace : 0;
        // the frustum is that of a wider virtual window, of which we show the part right of the panel
        this.camera.aspect = (w + P) / h;
        if (P > 0) this.camera.setViewOffset(w + P, h, P, 0, w, h);
        else this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
    }

    color(i) {
        const pal = PALETTES[this.palette] || PALETTES.aurora;
        const list = this.theme === 'light' && pal.light ? pal.light : pal.colors;
        return list[i % list.length];
    }

    setTheme(theme) {
        this.theme = theme;
        this.renderer.toneMappingExposure = theme === 'light' ? 0.95 : 1.05;
        this.recolor();
    }

    setPalette(p) { this.palette = p; this.recolor(); }

    recolor() {
        this.tubes.forEach((t, i) => t.mesh.material.color.set(this.color(i)));
        const vc = this.theme === 'light' ? '#2a3045' : '#f4f6fb';
        this.balls.forEach(b => b.material.color.set(vc));
    }

    /** (Re)build meshes for graph g. */
    setGraph(g) {
        for (const t of this.tubes) { this.root.remove(t.mesh); t.geometry.dispose(); t.mesh.material.dispose(); }
        for (const b of this.balls) { this.root.remove(b); b.material.dispose(); }
        this.tubes = g.edges.map((e, i) => {
            const mat = new THREE.MeshPhysicalMaterial({ color: this.color(i), roughness: 0.34, metalness: 0.05, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
            const t = new Tube(mat);
            t.mesh.userData = { edge: i };
            this.root.add(t.mesh);
            return t;
        });
        this.balls = g.vertexNodes.map((n, v) => {
            const m = new THREE.Mesh(this.ballGeo, new THREE.MeshPhysicalMaterial({ color: '#f4f6fb', roughness: 0.25, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
            m.userData = { vertex: v };
            this.root.add(m);
            return m;
        });
        this.recolor();
    }

    /** Dim everything but the given edges (a Set of edge indices), or clear with null. */
    highlight(edges, g) {
        this.tubes.forEach((t, i) => {
            const on = !edges || edges.has(i);
            t.mesh.material.transparent = !on;
            t.mesh.material.opacity = on ? 1 : 0.13;
            t.mesh.material.depthWrite = on;
        });
        const live = new Set();
        if (edges && g) for (const i of edges) { const e = g.edges[i]; if (!e.circle) { live.add(e.a); live.add(e.b); } }
        this.balls.forEach((b, v) => {
            const on = !edges || live.has(v);
            b.material.transparent = !on;
            b.material.opacity = on ? 1 : 0.13;
            b.material.depthWrite = on;
        });
    }

    /** Push the current positions into the meshes. `clear` caps the tube radius. */
    update(g, clear = Infinity) {
        const Ltot = g.totalLength();
        const base = 0.022 * Ltot / Math.sqrt(Math.max(1, g.edges.length)) * this.radiusScale;
        const r = Math.max(0.004 * Ltot / Math.sqrt(g.edges.length), Math.min(base, 0.48 * clear));
        this.radius = r;
        g.edges.forEach((e, i) => {
            if (!this.tubes[i]) return;
            this.tubes[i].update(g.edgePoints(i), e.circle, r);
        });
        g.vertexNodes.forEach((n, v) => {
            const b = this.balls[v];
            if (!b) return;
            b.position.set(g.x[3 * n], g.x[3 * n + 1], g.x[3 * n + 2]);
            const deg = g.stars[v].length;
            b.scale.setScalar(r * (deg === 1 ? 1.25 : 1.75));
        });
    }

    /** Fit the camera to the graph (keeps the direction of view). */
    frame(g) {
        this.autoZoom = true;
        let R = 0;
        for (let i = 0; i < g.N; i++) R = Math.max(R, Math.hypot(g.x[3 * i], g.x[3 * i + 1], g.x[3 * i + 2]));
        R = R || 1;
        const dist = this.fitDistance(R);
        const dir = this.camera.position.clone().sub(this.controls.target).normalize();
        if (!Number.isFinite(dir.x) || dir.lengthSq() < 0.5) dir.set(0, 0.15, 1).normalize();
        this.controls.target.set(0, 0, 0);
        this.camera.position.copy(dir.multiplyScalar(dist));
        this.camera.near = dist / 100; this.camera.far = dist * 20;
        this.camera.updateProjectionMatrix();
        this.boundR = R;
    }

    lookAlong(axis) {
        const d = this.camera.position.length();
        const v = new THREE.Vector3(...axis).normalize();
        if (v.dot(this.camera.position) < 0) v.negate();
        this.camera.position.copy(v.multiplyScalar(d));
        this.controls.target.set(0, 0, 0);
        this.camera.up.set(0, 1, 0);
        if (Math.abs(v.y) > 0.98 * v.length()) this.camera.up.set(0, 0, -1);
        this.controls.update();
    }

    /** What is under the pointer: { edge, vertex, point } or null. */
    pick(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.ray.setFromCamera(ndc, this.camera);
        const hits = this.ray.intersectObjects([...this.balls, ...this.tubes.map(t => t.mesh)], false);
        if (!hits.length) return null;
        const h = hits[0];
        return { ...h.object.userData, point: h.point.toArray() };
    }

    /** The point under the pointer on the plane through p facing the camera. */
    pointOnPlane(clientX, clientY, p) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        this.ray.setFromCamera(ndc, this.camera);
        const n = this.camera.getWorldDirection(new THREE.Vector3());
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...p));
        const out = new THREE.Vector3();
        return this.ray.ray.intersectPlane(plane, out) ? out.toArray() : null;
    }

    /** Screen position of a world point (CSS px). */
    project(p) {
        const v = new THREE.Vector3(...p).project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        return [rect.left + (v.x + 1) / 2 * rect.width, rect.top + (1 - v.y) / 2 * rect.height, v.z];
    }

    /** Draw axes (coloured by order) and mirror planes of a detected symmetry group. */
    showSymmetry(sym, on) {
        const grp = this.symGroup;
        while (grp.children.length) {
            const c = grp.children.pop();
            c.geometry?.dispose(); c.material?.dispose();
        }
        if (!on || !sym) return;
        const R = (this.boundR || 2) * 1.25;
        const c = new THREE.Vector3(...sym.center);
        const thin = 0.006 * R;
        const seen = [];
        for (const e of sym.elements) {
            if (e.kind === 'rotation' || e.kind === 'rotoreflection') {
                const a = new THREE.Vector3(...e.axis).normalize();
                const prev = seen.find(s => Math.abs(s.a.dot(a)) > 0.98);
                const order = e.kind === 'rotation' ? e.order : 0;
                if (prev) { prev.order = Math.max(prev.order, order); continue; }
                seen.push({ a, order });
            }
        }
        for (const s of seen) {
            if (!s.order) continue;
            const col = AXIS_COLORS[Math.min(6, s.order)] || '#e2e8f0';
            const geo = new THREE.CylinderGeometry(thin, thin, 2 * R, 8, 1, true);
            const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false }));
            m.position.copy(c);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.a);
            grp.add(m);
            for (const sgn of [1, -1]) {
                const tip = new THREE.Mesh(new THREE.SphereGeometry(thin * 3.2, 12, 8), new THREE.MeshBasicMaterial({ color: col }));
                tip.position.copy(c).addScaledVector(s.a, sgn * R);
                grp.add(tip);
            }
        }
        for (const e of sym.elements) {
            if (e.kind !== 'mirror') continue;
            const n = new THREE.Vector3(...e.axis).normalize();
            const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 64), new THREE.MeshBasicMaterial({ color: this.theme === 'light' ? '#6366f1' : '#a5b4fc', transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
            disc.position.copy(c);
            disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
            grp.add(disc);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.95, thin * 0.8, 6, 96), new THREE.MeshBasicMaterial({ color: this.theme === 'light' ? '#6366f1' : '#a5b4fc', transparent: true, opacity: 0.35, depthWrite: false }));
            ring.position.copy(c);
            ring.quaternion.copy(disc.quaternion);
            grp.add(ring);
        }
        if (sym.elements.some(e => e.kind === 'inversion')) {
            const dotm = new THREE.Mesh(new THREE.SphereGeometry(thin * 4, 14, 10), new THREE.MeshBasicMaterial({ color: '#fb7185' }));
            dotm.position.copy(c);
            grp.add(dotm);
        }
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
