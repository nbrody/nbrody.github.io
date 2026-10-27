// knotView.js — the knot in S³ as a tube, the boundary torus of its neighbourhood, and the
// filling slope p·m + q·l drawn on that torus.
//
// The curve is the census diagram relaxed by Möbius energy (tools/knot_curves.mjs; checked
// against SnapPy, chirality included, by tools/check_curves.py). The longitude is the
// Seifert one: a rotation-minimizing frame, twisted so the push-off links the knot 0 times.
// The meridian turns right-handedly about the knot's direction (linking number +1).

import * as THREE from 'three';
import { tex } from './ui.js';
import { linkingNumber } from './linking.js';

export class KnotView {
    constructor(stage, texLayer) {
        this.stage = stage;
        this.texLayer = texLayer;
        this.group = new THREE.Group();
        stage.scene.add(this.group);
        this.knotMat = new THREE.MeshStandardMaterial({ color: 0xdfe6f5, roughness: 0.35, metalness: 0.25 });
        this.torusMat = new THREE.MeshStandardMaterial({ color: 0x8fa3ff, transparent: true, opacity: 0.16, roughness: 0.4, depthWrite: false, side: THREE.DoubleSide });
        this.slopeMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0xf472b6, emissiveIntensity: 0.35, roughness: 0.4 });
        this.merMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9 });
        this.lonMat = new THREE.MeshBasicMaterial({ color: 0xa3e635 });
        this.labels = ['m', 'l', 'slope'].map((cls) => {
            const el = document.createElement('div');
            el.className = `lbl ${cls === 'm' ? 'mer' : cls === 'l' ? 'lon' : 'slope'}`;
            texLayer.appendChild(el);
            return el;
        });
        this.slope = null;
        this.showCurves = true;
    }

    setVisible(v) {
        this.group.visible = v;
        if (!v) this.labels.forEach((el) => { el.style.display = 'none'; });
    }

    setColors({ knot, torus, slope, mer, lon }) {
        this.knotMat.color.set(knot);
        this.torusMat.color.set(torus);
        this.slopeMat.color.set(slope); this.slopeMat.emissive.set(slope);
        this.merMat.color.set(mer);
        this.lonMat.color.set(lon);
    }

    clear() {
        for (const obj of [...this.group.children]) { this.group.remove(obj); obj.geometry?.dispose(); }
    }

    /** Set the knot (array of [x, y, z] points, closed), or null for no diagram. */
    setKnot(points) {
        this.clear();
        this.has = !!points;
        if (!points) return;
        // centre and scale to radius ≈ 1.15
        const N = points.length;
        const c = [0, 0, 0];
        for (const p of points) { c[0] += p[0] / N; c[1] += p[1] / N; c[2] += p[2] / N; }
        let R = 0;
        for (const p of points) R = Math.max(R, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
        const s = 1.15 / R;
        // view the diagram from the front: the census curves lie near the xy-plane (over-strands at
        // larger z) and the camera looks along +y with z up, so rotate (x, y, z) ↦ (x, −z, y) — a
        // rotation, not a reflection, so the chirality is kept
        this.P = points.map((p) => new THREE.Vector3((p[0] - c[0]) * s, -(p[2] - c[2]) * s, (p[1] - c[1]) * s));
        this.curve = new THREE.CatmullRomCurve3(this.P, true, 'centripetal');
        const L = this.curve.getLength();
        this.L = L;
        this.rKnot = 0.045;
        this.rTorus = 0.105;
        const M = Math.max(400, Math.round(L / 0.012));
        this.frames = seifertFrames(this.curve, M);
        this.group.add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, M, this.rKnot, 14, true), this.knotMat));
        const torus = new THREE.Mesh(this.tubeAlongFrames(this.rTorus, 40), this.torusMat);
        torus.renderOrder = 3;
        this.group.add(torus);
        this.curvesGroup = new THREE.Group();
        this.group.add(this.curvesGroup);
        this.setSlope(this.slope);
    }

    /** A tube of radius r around the knot using the Seifert frames (so its seam is the longitude). */
    tubeAlongFrames(r, radial) {
        const { pts, nor, bin } = this.frames;
        const M = pts.length;
        const pos = [], idx = [];
        for (let i = 0; i <= M; i++) {
            const k = i % M;
            for (let j = 0; j <= radial; j++) {
                const a = (2 * Math.PI * j) / radial;
                const ca = Math.cos(a), sa = Math.sin(a);
                pos.push(pts[k].x + r * (ca * nor[k].x + sa * bin[k].x), pts[k].y + r * (ca * nor[k].y + sa * bin[k].y), pts[k].z + r * (ca * nor[k].z + sa * bin[k].z));
            }
        }
        for (let i = 0; i < M; i++) for (let j = 0; j < radial; j++) {
            const a = i * (radial + 1) + j, b = a + radial + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
    }

    /** A curve on the boundary torus: u goes q times around, φ turns p times (s ∈ [0, 1]). */
    torusCurve(p, q, r) {
        const { pts, nor, bin } = this.frames;
        const M = pts.length;
        const n = Math.max(160, Math.round((Math.abs(p) * 48 + Math.max(1, Math.abs(q)) * M / 2)));
        const out = [];
        for (let i = 0; i <= n; i++) {
            const s = i / n;
            const u = s * q * M;
            const k0 = Math.floor(u), f = u - k0;
            const k = ((k0 % M) + M) % M, k1 = (k + 1) % M;
            const lerp = (A, B) => new THREE.Vector3().lerpVectors(A[k], A[k1], f);
            const P = lerp(pts), Nn = lerp(nor).normalize(), B = lerp(bin).normalize();
            const phi = 2 * Math.PI * p * s;
            out.push(P.add(Nn.multiplyScalar(r * Math.cos(phi))).add(B.multiplyScalar(r * Math.sin(phi))));
        }
        return out;
    }

    /** Draw the slope {p, q} (or null). */
    setSlope(slope) {
        this.slope = slope;
        if (!this.has) return;
        for (const obj of [...this.curvesGroup.children]) { this.curvesGroup.remove(obj); obj.geometry.dispose(); }
        const r = this.rTorus * 1.02;
        if (this.showCurves) {
            const mer = this.torusCurve(1, 0, r), lon = this.torusCurve(0, 1, r);
            this.curvesGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mer, true), 48, 0.006, 6, true), this.merMat));
            this.curvesGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lon, true), 400, 0.005, 6, true), this.lonMat));
            this.merAt = mer[Math.round(mer.length * 0.25)];
            this.lonAt = lon[Math.round(lon.length * 0.62)];
        }
        if (slope && (slope.p !== 0 || slope.q !== 0)) {
            const pts = this.torusCurve(slope.p, slope.q, r * 1.01);
            const segs = Math.min(4000, pts.length * 2);
            this.curvesGroup.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), segs, 0.011, 8, true), this.slopeMat));
            this.slopeAt = pts[Math.round(pts.length * 0.4)];
            this.labels[2].innerHTML = tex(`${slope.p}\\,m ${slope.q < 0 ? '-' : '+'} ${Math.abs(slope.q)}\\,l`);
        } else {
            this.slopeAt = null;
        }
        this.labels[0].innerHTML = tex('m');
        this.labels[1].innerHTML = tex('l');
    }

    placeLabels() {
        const items = [[this.labels[0], this.showCurves && this.merAt], [this.labels[1], this.showCurves && this.lonAt], [this.labels[2], this.slopeAt]];
        for (const [el, v] of items) {
            if (!this.group.visible || !this.has || !v) { el.style.display = 'none'; continue; }
            const s = this.stage.project([v.x, v.y, v.z]);
            el.style.display = s.front ? '' : 'none';
            el.style.left = `${s.x + 14}px`;
            el.style.top = `${s.y - 12}px`;
        }
    }
}

/**
 * Rotation-minimizing frames along a closed curve (double reflection), with the closing
 * twist spread out and then an integer number of turns so the push-off along the normal
 * links the curve 0 times: the normal then traces the Seifert longitude.
 */
function seifertFrames(curve, M) {
    const pts = [], tan = [];
    for (let i = 0; i < M; i++) {
        pts.push(curve.getPointAt(i / M));
        tan.push(curve.getTangentAt(i / M).normalize());
    }
    const nor = new Array(M), bin = new Array(M);
    let r = new THREE.Vector3(0, 0, 1);
    if (Math.abs(r.dot(tan[0])) > 0.9) r.set(1, 0, 0);
    nor[0] = r.clone().sub(tan[0].clone().multiplyScalar(r.dot(tan[0]))).normalize();
    for (let i = 0; i < M; i++) {
        const j = (i + 1) % M;
        const v1 = pts[j].clone().sub(pts[i]);
        const c1 = v1.dot(v1);
        const rL = nor[i].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(nor[i])));
        const tL = tan[i].clone().sub(v1.clone().multiplyScalar((2 / c1) * v1.dot(tan[i])));
        const v2 = tan[j].clone().sub(tL);
        const c2 = v2.dot(v2);
        const next = rL.sub(v2.clone().multiplyScalar((2 / c2) * v2.dot(rL))).normalize();
        if (j === 0) {
            // closing angle between the transported frame and the first one
            const b0 = new THREE.Vector3().crossVectors(tan[0], nor[0]);
            var alpha = Math.atan2(next.dot(b0), next.dot(nor[0]));
        } else nor[j] = next;
    }
    const rotateAll = (turnsPerLoop) => {
        const N2 = [], B2 = [];
        for (let i = 0; i < M; i++) {
            const a = -alpha * (i / M) + 2 * Math.PI * turnsPerLoop * (i / M);
            const b = new THREE.Vector3().crossVectors(tan[i], nor[i]);
            const n2 = nor[i].clone().multiplyScalar(Math.cos(a)).add(b.clone().multiplyScalar(Math.sin(a)));
            N2.push(n2);
            B2.push(new THREE.Vector3().crossVectors(tan[i], n2));
        }
        return { N2, B2 };
    };
    let { N2 } = rotateAll(0);
    const eps = 0.02;
    const push = pts.map((p, i) => p.clone().add(N2[i].clone().multiplyScalar(eps)));
    const lk = Math.round(linkingNumber(pts, push));
    const fr = rotateAll(-lk);
    return { pts, tan, nor: fr.N2, bin: fr.B2, lk };
}
