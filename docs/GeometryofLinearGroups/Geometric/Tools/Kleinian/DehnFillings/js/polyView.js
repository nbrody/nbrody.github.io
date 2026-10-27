// polyView.js — the ideal tetrahedra in the ball (Klein or Poincaré model).
//
// Assembled, the tetrahedra developed along SnapPy's maximal tree form a fundamental
// polyhedron D for the holonomy; the faces left on ∂D come in pairs, glued by the
// face-pairing generators g_k. Exploded, each tetrahedron sits on its own, and faces of
// the same color are the ones glued together. The assembly parameter docks them one by
// one in tree order.

import * as THREE from 'three';
import { developTets, holonomy } from './develop.js';
import { mapply, mmul, abs } from './complex.js';
import { toSphere, centering, modelPoint, geodesicPoints, mobiusPath, fixedPoints } from './hyperbolic.js';
import { tex } from './ui.js';

const FACE_VERTS = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]];   // face f: the vertices ≠ f, oriented
const EDGE_PAIRS = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const SUB = 10;                                                       // Poincaré face subdivision

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class PolyView {
    constructor(stage, texLayer) {
        this.stage = stage;
        this.texLayer = texLayer;
        this.group = new THREE.Group();
        this.ghost = new THREE.Group();
        stage.scene.add(this.group);
        stage.scene.add(this.ghost);
        this.model = 'poincare';
        this.opts = { arrows: true, labels: true, core: true, sphere: true };
        this.assembly = 1;
        this.highlight = -1;
        this.labels = [];
        this._sphere();
    }

    _sphere() {
        const mat = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, side: THREE.FrontSide,
            uniforms: { color: { value: new THREE.Color(0x8fa3ff) }, strength: { value: 0.55 } },
            vertexShader: `varying vec3 vN; varying vec3 vV;
                void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
            fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vV;
                void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(color, f*strength + 0.025); }`,
        });
        this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
        this.sphere.renderOrder = -1;
        this.group.add(this.sphere);
    }

    setVisible(v) {
        this.group.visible = v;
        this.ghost.visible = v;
        if (!v) this.labels.forEach((l) => { l.el.style.display = 'none'; });
    }

    setColors({ pair, edge, core, ink, sphere, light }) {
        this.colors = { pair, edge, core, ink, sphere, light };
        this.sphere.material.uniforms.color.value.set(sphere);
        this.sphere.material.uniforms.strength.value = light ? 0.35 : 0.55;
        if (this.tri) this._applyMaterials();
    }

    /** Build meshes for a triangulation (shapes come with update()). */
    setManifold(tri) {
        this.tri = tri;
        // clear the old meshes
        for (const obj of [...this.group.children]) if (obj !== this.sphere) { this.group.remove(obj); obj.geometry?.dispose(); }
        this.labels.forEach((l) => l.el.remove());
        this.labels = [];
        const n = tri.n;
        this.faceMeshes = [];
        for (let t = 0; t < n; t++) {
            const row = [];
            for (let f = 0; f < 4; f++) {
                const geo = new THREE.BufferGeometry();
                const mat = new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.55, metalness: 0.05 });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.userData = { tet: t, face: f, pair: tri.pairOf[t][f] };
                this.group.add(mesh);
                row.push(mesh);
            }
            this.faceMeshes.push(row);
        }
        // edges: one tube per (tet, edge)
        this.edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
        this.edgeMeshes = [];
        for (let t = 0; t < n; t++) for (let e = 0; e < 6; e++) {
            const m = new THREE.Mesh(new THREE.BufferGeometry(), this.edgeMat);
            this.group.add(m);
            this.edgeMeshes.push(m);
        }
        // arrows (Thurston's marks for the edge classes)
        const cone = new THREE.ConeGeometry(0.022, 0.06, 10);
        cone.translate(0, 0.03, 0);
        this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.arrows = new THREE.InstancedMesh(cone, this.arrowMat, n * 6 * 4);
        this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(this.arrows);
        // ideal vertices
        this.vertMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.verts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 12, 8), this.vertMat, n * 4);
        this.group.add(this.verts);
        // the core geodesic
        this.coreMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
        this.core = new THREE.Mesh(new THREE.BufferGeometry(), this.coreMat);
        this.group.add(this.core);
        this.cuspDot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), this.coreMat);
        this.group.add(this.cuspDot);
        // edge class and direction of each (tet, edge)
        this.edgeInfo = Array.from({ length: n }, () => new Array(6));
        tri.edgeClasses.forEach((cycle, c) => {
            for (const o of cycle) this.edgeInfo[o.tet][o.edge] = { cls: c, from: o.a, to: o.b };
        });
        // labels: one per face
        for (let t = 0; t < n; t++) for (let f = 0; f < 4; f++) {
            const el = document.createElement('div');
            el.className = 'lbl face';
            this.texLayer.appendChild(el);
            this.labels.push({ el, tet: t, face: f, tex: '' });
        }
        this.order = null;
        if (this.colors) this._applyMaterials();
    }

    /** Face-pair colors: generators take the categorical slots; tree faces too while slots last. */
    _pairColor(pairIndex) {
        const tri = this.tri, fp = tri.facePairs[pairIndex];
        const P = this.colors.pair;
        if (fp.gen > 0) return P[(fp.gen - 1) % P.length];
        const treeIdx = tri.facePairs.filter((x) => x.gen === 0).indexOf(fp);
        const slot = tri.nOrig + treeIdx;
        return slot < P.length ? P[slot] : this.colors.edge;
    }

    _applyMaterials() {
        for (const row of this.faceMeshes) for (const m of row) m.material.color.set(this._pairColor(m.userData.pair));
        this.edgeMat.color.set(this.colors.ink);
        this.arrowMat.color.set(this.colors.ink);
        this.vertMat.color.set(this.colors.ink);
        this.coreMat.color.set(this.colors.core);
        // label texts
        for (const L of this.labels) {
            const fp = this.tri.facePairs[this.tri.pairOf[L.tet][L.face]];
            const g = this.tri.tets[L.tet].gen[L.face];
            L.tex = g > 0 ? `g_{${g}}` : g < 0 ? `g_{${-g}}^{-1}` : '';
            L.treeTex = fp.gen === 0 ? `t_{${this.tri.facePairs.filter((x) => x.gen === 0).indexOf(fp) + 1}}` : '';
            L.el.innerHTML = tex(L.tex || L.treeTex);
            L.el.style.setProperty('--pair', this._pairColor(fp.index));
        }
    }

    setModel(model) { this.model = model; }
    setOptions(o) { Object.assign(this.opts, o); }
    setAssembly(a) { this.assembly = a; }
    setHighlight(pairIndex) { this.highlight = pairIndex; }

    /** Recompute the picture for shapes z (and the filling spec, for the core). */
    update(z, frame = null) {
        const tri = this.tri;
        if (!tri) return;
        const dev = developTets(tri, z);
        this.order = dev.order;
        const all = [];
        for (const P of dev.P) all.push(...P);
        const G = centering(all);
        this.G = G;
        this.dev = dev;
        const n = tri.n;
        const A = this.assembly;
        const exploded = A < 1;
        // each tetrahedron: its ideal vertices on the sphere (Klein = sphere coordinates) and a
        // placement x ↦ off + s·x of its own ball (the identity once docked)
        const sphPts = new Array(n), place = new Array(n);
        const dock = new Array(n).fill(1);
        if (!exploded) {
            for (let t = 0; t < n; t++) {
                sphPts[t] = dev.P[t].map((p) => toSphere(mapply(G, p)));
                place[t] = { off: [0, 0, 0], s: 1 };
            }
        } else {
            // exploded: a ring inside the ball's outline, in the plane facing the default camera
            const ringR = n <= 2 ? 0.52 : 0.64, sc = n <= 2 ? 0.44 : n <= 4 ? 0.34 : 0.27;
            dev.order.forEach((o, j) => {
                const t = o.tet;
                const u = smooth(A * n - j);
                dock[t] = u;
                const N = centering(dev.P[t]);
                const X = mmul(mobiusPath(mmul(G, adjugate(N)), u), N);
                const ang = Math.PI - (2 * Math.PI * j) / n;
                sphPts[t] = dev.P[t].map((p) => toSphere(mapply(X, p)));
                place[t] = { off: [ringR * Math.cos(ang) * (1 - u), 0, ringR * Math.sin(ang) * (1 - u)], s: sc + (1 - sc) * u };
            });
        }
        this.sphPts = sphPts;
        this.place = place;
        /** a point of tetrahedron t's Klein ball → world coordinates in the current model */
        this.toWorld = (t, k) => {
            const m = modelPoint(k, this.model), { off, s } = place[t];
            return [off[0] + s * m[0], off[1] + s * m[1], off[2] + s * m[2]];
        };
        const pos = sphPts.map((P, t) => P.map((u) => this.toWorld(t, u)));
        this.positions = pos;
        // which faces are interior to D (glued along the tree) once both sides have docked
        const parentFace = new Map();
        for (const o of dev.order) if (o.parent >= 0) {
            parentFace.set(`${o.parent}:${o.face}`, o.tet);
            parentFace.set(`${o.tet}:${o.face2}`, o.tet);
        }
        // faces
        for (let t = 0; t < n; t++) {
            for (let f = 0; f < 4; f++) {
                const mesh = this.faceMeshes[t][f];
                this._faceGeometry(mesh.geometry, FACE_VERTS[f].map((i) => sphPts[t][i]), t);
                const key = `${t}:${f}`;
                const isTree = parentFace.has(key);
                const pairIdx = mesh.userData.pair;
                const base = this.colors?.light ? 0.5 : 0.6;
                let op = base;
                if (isTree) {
                    const child = parentFace.get(key);
                    const d = Math.min(dock[child], dock[t]);
                    op = base - (base - 0.05) * smooth((d - 0.85) / 0.15);
                }
                const hl = pairIdx === this.highlight;
                if (this.highlight >= 0) op = hl ? 0.92 : op * 0.4;
                mesh.material.opacity = op;
                mesh.material.emissive.copy(mesh.material.color);
                mesh.material.emissiveIntensity = hl ? 0.55 : this.colors?.light ? 0.08 : 0.3;
                mesh.renderOrder = isTree ? 1 : 2;
            }
        }
        // edges and arrows
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        let ai = 0;
        const edgeR = exploded ? 0.0035 : 0.0045;
        for (let t = 0; t < n; t++) {
            for (let e = 0; e < 6; e++) {
                const [a, b] = EDGE_PAIRS[e];
                const pts = this.model === 'klein' ? [pos[t][a], pos[t][b]]
                    : geodesicPoints(sphPts[t][a], sphPts[t][b], 'klein', 24).map((k) => this.toWorld(t, k));
                const mesh = this.edgeMeshes[t * 6 + e];
                mesh.geometry.dispose();
                mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), pts.length > 2 ? 24 : 1, edgeR, 6, false);
                if (this.opts.arrows) {
                    const info = this.edgeInfo[t][e];
                    const cnt = Math.min(info.cls + 1, 4);
                    const P0 = info.from === a ? pts : pts.slice().reverse();
                    for (let c = 0; c < cnt; c++) {
                        const s = 0.5 + (c - (cnt - 1) / 2) * 0.07;
                        const [p, dir] = alongPolyline(P0, s);
                        q.setFromUnitVectors(up, new THREE.Vector3(...dir).normalize());
                        const sc = exploded ? 0.8 : 1;
                        m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(sc, sc, sc));
                        this.arrows.setMatrixAt(ai++, m4);
                    }
                }
            }
        }
        this.arrows.count = ai;
        this.arrows.instanceMatrix.needsUpdate = true;
        // ideal vertices
        let vi = 0;
        for (let t = 0; t < n; t++) for (let v = 0; v < 4; v++) {
            m4.makeTranslation(...pos[t][v]);
            this.verts.setMatrixAt(vi++, m4);
        }
        this.verts.count = vi;
        this.verts.instanceMatrix.needsUpdate = true;
        // the core geodesic (incomplete structures) or the cusp point (complete)
        this.core.visible = false;
        this.cuspDot.visible = false;
        if (this.opts.core && !exploded && frame) {
            const H = holonomy(tri, z);
            const k = 0;
            const M = H.periph[k].m;
            const fps = fixedPoints(M);
            const filled = frame.spec && frame.spec[k] && frame.spec[k].t > 1e-4;
            if (filled && fps.length === 2) {
                const ends = fps.map((p) => toSphere(mapply(G, p)));
                const pts = geodesicPoints(ends[0], ends[1], this.model, 48);
                this.core.geometry.dispose();
                this.core.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 64, 0.011, 8, false);
                this.core.visible = true;
            } else if (fps.length >= 1) {
                this.cuspDot.position.set(...toSphere(mapply(G, fps[0])));
                this.cuspDot.visible = true;
            }
        }
        this.sphere.visible = this.opts.sphere;
        this.exploded = exploded;
        this.dockState = dock;
    }

    /** A face from its three ideal vertices (sphere points of tetrahedron t): flat in the Klein model, curved in the Poincaré ball. */
    _faceGeometry(geo, ks, t) {
        const { positions, index } = this.model === 'klein'
            ? { positions: new Float32Array(ks.flatMap((k) => this.toWorld(t, k))), index: [0, 1, 2] }
            : subdividedFace(ks, (k) => this.toWorld(t, k), SUB);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setIndex(index);
        geo.computeVertexNormals();
        geo.attributes.position.needsUpdate = true;
        geo.computeBoundingSphere();
    }

    /** Place the face labels (call after the camera moves). */
    placeLabels() {
        const show = this.group.visible && this.opts.labels && this.positions;
        const cam = this.stage.camera.position;
        for (const L of this.labels) {
            if (!show) { L.el.style.display = 'none'; continue; }
            const g = this.tri.tets[L.tet].gen[L.face];
            const isGen = g !== 0;
            if (!this.exploded && !isGen) { L.el.style.display = 'none'; continue; }
            const P = this.positions[L.tet], K = this.sphPts[L.tet];
            const ks = FACE_VERTS[L.face].map((i) => K[i]);
            // the face's centre in the model (on the curved face in the Poincaré ball)
            const c = this.toWorld(L.tet, [0, 1, 2].map((i) => (ks[0][i] + ks[1][i] + ks[2][i]) / 3));
            // push the label a little off the face, toward the outside of the tetrahedron
            const opp = P[L.face];
            const out = [0, 1, 2].map((i) => c[i] - opp[i]);
            const ol = Math.hypot(...out) || 1;
            const pos = [0, 1, 2].map((i) => c[i] + 0.04 * out[i] / ol);
            const s = this.stage.project(pos);
            const facing = (out[0] * (cam.x - c[0]) + out[1] * (cam.y - c[1]) + out[2] * (cam.z - c[2])) > 0;
            L.el.style.display = s.front ? '' : 'none';
            L.el.style.left = `${s.x}px`;
            L.el.style.top = `${s.y}px`;
            const hl = this.highlight >= 0 && this.tri.pairOf[L.tet][L.face] === this.highlight;
            L.el.style.opacity = hl ? 1 : facing ? 0.95 : 0.35;
            L.el.style.fontWeight = hl ? '700' : '';
        }
    }

    /** The translate g(D) of the domain by a 2×2 matrix, as a ghost (null clears it). */
    showGhost(M) {
        for (const obj of [...this.ghost.children]) { this.ghost.remove(obj); obj.geometry.dispose(); obj.material.dispose(); }
        if (!M || !this.dev || this.exploded) return;
        const mat = new THREE.MeshStandardMaterial({ color: this.colors?.ink || '#ffffff', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
        const GM = mmul(this.G, M);
        for (let t = 0; t < this.tri.n; t++) {
            const ks = this.dev.P[t].map((p) => toSphere(mapply(GM, p)));
            for (let f = 0; f < 4; f++) {
                const geo = new THREE.BufferGeometry();
                const vs = FACE_VERTS[f].map((i) => ks[i]);
                const { positions, index } = this.model === 'klein'
                    ? { positions: new Float32Array([...vs[0], ...vs[1], ...vs[2]]), index: [0, 1, 2] }
                    : subdividedFace(vs, (k) => modelPoint(k, 'poincare'), SUB);
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setIndex(index);
                geo.computeVertexNormals();
                this.ghost.add(new THREE.Mesh(geo, mat));
            }
        }
    }
}

function adjugate(A) { return [A[3], { re: -A[1].re, im: -A[1].im }, { re: -A[2].re, im: -A[2].im }, A[0]]; }

/** A triangle subdivided SUB times (barycentric grid), each point mapped by f. */
function subdividedFace(vs, f, n) {
    const pts = [], index = [];
    const id = (i, j) => (i * (i + 1)) / 2 + j;
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= i; j++) {
            const a = 1 - i / n, b = (i - j) / n, c = j / n;
            const k = [0, 1, 2].map((d) => a * vs[0][d] + b * vs[1][d] + c * vs[2][d]);
            pts.push(...f(k));
        }
    }
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            index.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
            if (j < i) index.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
        }
    }
    return { positions: new Float32Array(pts), index };
}

/** The point at fraction s of a polyline's length, and the direction there. */
function alongPolyline(P, s) {
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
    const target = s * L[L.length - 1];
    let i = 1;
    while (i < P.length - 1 && L[i] < target) i++;
    const t = (target - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
    const p = [0, 1, 2].map((d) => P[i - 1][d] + t * (P[i][d] - P[i - 1][d]));
    const dir = [0, 1, 2].map((d) => P[i][d] - P[i - 1][d]);
    return [p, dir];
}

export { abs };
