/**
 * While an isometry animates, show its geometry: the axis and boundary fixed
 * points (loxodromic, with a marker sliding along the axis), the rotation arc
 * (elliptic), or the single fixed point with an orbit trail (parabolic), plus
 * the flow lines it traces on the sphere at infinity.
 */
import * as THREE from 'three';
import { Matrix2x2, Complex, applyMatrixToBall, uhsToBall } from './math.js';
import { theme, toWorld, geomToWorld, disposeGroup, layer } from './scene.js';
import { geodesicPoints } from './overlays.js';

const group = layer(true);
let lingerTimer = null;

const ISO_AXIS_COLOR = 0xfbbf24;   // amber axis / fixed points
const ISO_MARK_COLOR = 0xf472b6;   // rose moving marker / rotation arc

const cplx = (re, im) => new Complex(re, im);
const scaleMat = (X, s) => new Matrix2x2(X.a.mul(s), X.b.mul(s), X.c.mul(s), X.d.mul(s));

function classifyIsometry(G) {
    const eps = 1e-6;
    const tr = G.a.add(G.d);
    const disc = tr.mul(tr).sub(new Complex(4, 0));
    let type;
    if (Math.sqrt(disc.normSq()) < 1e-4) type = 'parabolic';
    else if (Math.abs(tr.im) < 1e-4 && Math.abs(tr.re) < 2) type = 'elliptic';
    else type = 'hyperbolic';
    const zToBall = (z) => uhsToBall({ x: z.re, y: z.im, t: 0 });
    let p1, p2;
    if (Math.sqrt(G.c.normSq()) < eps) {
        p1 = new THREE.Vector3(0, 0, 1);
        const da = G.d.sub(G.a);
        p2 = Math.sqrt(da.normSq()) < eps ? null : zToBall(G.b.div(da));
    } else {
        const s = Complex.sqrt(disc), amd = G.a.sub(G.d), twoC = G.c.mul(2);
        p1 = zToBall(amd.add(s).div(twoC));
        p2 = zToBall(amd.sub(s).div(twoC));
    }
    if (type === 'parabolic') p2 = null;
    return { type, p1, p2 };
}

function projImage(M, num, den) {
    return [M.a.mul(num).add(M.b.mul(den)), M.c.mul(num).add(M.d.mul(den))];
}

function projToBall(num, den) {
    if (den.normSq() < 1e-22) return new THREE.Vector3(0, 0, 1);
    const z = num.div(den);
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return new THREE.Vector3(0, 0, 1);
    return uhsToBall({ x: z.re, y: z.im, t: 0 });
}

function eigenFrame(G) {
    const tr = G.a.add(G.d);
    const disc = tr.mul(tr).sub(cplx(4, 0));
    const parabolic = Math.sqrt(disc.normSq()) < 1e-9;
    const two = cplx(2, 0), sq = Complex.sqrt(disc);
    const k1 = tr.add(sq).div(two), k2 = tr.sub(sq).div(two);
    const evec = (k) => {
        const u = [G.b, k.sub(G.a)], v = [k.sub(G.d), G.c];
        return (u[0].normSq() + u[1].normSq()) >= (v[0].normSq() + v[1].normSq()) ? u : v;
    };
    const v1 = evec(k1);
    const v2 = parabolic
        ? (v1[1].normSq() >= v1[0].normSq() ? [cplx(1, 0), cplx(0, 0)] : [cplx(0, 0), cplx(1, 0)])
        : evec(k2);
    const P = new Matrix2x2(v1[0], v2[0], v1[1], v2[1]);
    if (Math.sqrt(P.det().normSq()) < 1e-12) return null;
    let N;
    try { N = P.inv(); } catch (e) { return null; }
    return { P, M: N.mul(G).mul(P), parabolic };
}

function tube(points, color, radius = 0.008) {
    const geom = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(32, points.length), radius, 8, false);
    geomToWorld(geom);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.2,
        transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
    }));
    mesh.renderOrder = 7;
    return mesh;
}

function marker(p, color, r = 0.03) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.1,
        transparent: true, depthTest: false, depthWrite: false
    }));
    m.position.copy(toWorld(p));
    m.renderOrder = 7;
    return m;
}

function flowLines(G, flowAt) {
    const fr = eigenFrame(G);
    if (!fr) return;
    const { P, M, parabolic } = fr;
    let sMin, sMax;
    const seeds = [];
    if (parabolic) {
        const c = M.b.div(M.d);
        const cAbs = Math.sqrt(c.normSq());
        if (!(cAbs > 1e-9)) return;
        const span = 26 / cAbs;
        sMin = -span; sMax = span;
        const perp = cplx(-c.im, c.re).div(cplx(cAbs, 0));
        for (let k = 0; k < 13; k++) {
            const d = 0.35 * Math.pow(1.52, k);
            seeds.push(perp.mul(cplx(d, 0)), perp.mul(cplx(-d, 0)));
        }
    } else {
        const mu = M.a.div(M.d);
        const ell = 0.5 * Math.log(Math.max(1e-30, mu.normSq()));
        const theta = Math.atan2(mu.im, mu.re);
        if (Math.abs(ell) < 1e-6) {
            if (Math.abs(theta) < 1e-6) return;
            sMin = 0; sMax = 2 * Math.PI / Math.abs(theta);
            for (let k = 0; k < 20; k++) seeds.push(cplx(0.08 * Math.pow(150, k / 19), 0));
        } else {
            const span = Math.log(600) / Math.abs(ell);
            sMin = -span; sMax = span;
            for (let i = 0; i < 32; i++) {
                const ph = 2 * Math.PI * i / 32;
                seeds.push(cplx(Math.cos(ph), Math.sin(ph)));
            }
        }
    }
    const STEPS = 220;
    const mats = [];
    for (let k = 0; k <= STEPS; k++) mats.push(flowAt(sMin + (sMax - sMin) * k / STEPS));
    const color = theme().isoFlow;
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
    const curves = [];
    for (const z0 of seeds) {
        const s0 = projImage(P, z0, cplx(1, 0));
        const ball = [];
        for (const W of mats) {
            const [n1, d1] = projImage(W, s0[0], s0[1]);
            const b = projToBall(n1, d1);
            if (Number.isFinite(b.x)) ball.push(b.multiplyScalar(1.002));
        }
        if (ball.length >= 2) curves.push({ ball, mid: ball[Math.floor(ball.length / 2)] });
    }
    if (!curves.length) return;
    // Farthest-point sampling spreads the accented curves over the sphere.
    const nAccents = Math.max(1, Math.round(curves.length / 4));
    const accent = new Set([0]);
    while (accent.size < nAccents) {
        let best = -1, bestD = -1;
        curves.forEach((c, i) => {
            if (accent.has(i)) return;
            let d = Infinity;
            for (const j of accent) d = Math.min(d, c.mid.distanceToSquared(curves[j].mid));
            if (d > bestD) { bestD = d; best = i; }
        });
        if (best < 0) break;
        accent.add(best);
    }
    curves.forEach(({ ball }, idx) => {
        if (!accent.has(idx)) {
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ball.map(toWorld)), lineMat);
            line.renderOrder = 6;
            group.add(line);
            return;
        }
        const t = tube(ball, color, 0.0032);
        t.material.opacity = 0.82;
        t.renderOrder = 6;
        group.add(t);
        const m = Math.floor(ball.length / 2);
        const wMid = toWorld(ball[m]);
        const dir = toWorld(ball[Math.min(ball.length - 1, m + 1)]).sub(wMid);
        if (dir.lengthSq() > 1e-12) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.048, 10), new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false
            }));
            cone.position.copy(wMid);
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            cone.renderOrder = 6;
            group.add(cone);
        }
    });
}

/**
 * Axis visualisation for an animation. The scene moves by W(t) = S(t)·S₀⁻¹,
 * which is the conjugated flow G_t = P₀·exp(tX)·P₀⁻¹ (P₀ the outer frame at
 * the start), so the axis and fixed points are static; only the probe moves.
 * @param g   the element (actual)   @param P0  outer frame at the start
 * @param X   log g                  @param S0  scene matrix at the start
 * @param getScene  () => current scene matrix
 */
export function showIsometryAxis(g, P0, X, S0, getScene, enabled) {
    if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
    disposeGroup(group);
    const noop = { onFrame() { }, finish() { } };
    if (!enabled) return noop;
    let G, P0i;
    try {
        P0i = P0.inv().normalized();
        G = P0.mul(g).mul(P0i).normalized();
    } catch (e) { return noop; }
    const { type, p1, p2 } = classifyIsometry(G);
    if (!p1) return noop;
    const flowAt = (s) => P0.mul(Matrix2x2.exp(scaleMat(X, s))).mul(P0i).normalized();
    try { flowLines(G, flowAt); } catch (e) { console.warn('flow lines:', e); }

    let probe;
    if (p2) {
        let samples = geodesicPoints(p1, p2, 96);
        group.add(tube(samples, ISO_AXIS_COLOR, type === 'elliptic' ? 0.006 : 0.009));
        group.add(marker(p1, ISO_AXIS_COLOR, 0.022));
        group.add(marker(p2, ISO_AXIS_COLOR, 0.022));
        let A0 = samples[0], iA = 0;
        samples.forEach((s, i) => { if (s.lengthSq() < A0.lengthSq()) { A0 = s.clone(); iA = i; } });
        if (A0.length() > 0.985) A0.setLength(0.985);
        if (type === 'elliptic') {
            const tan = samples[Math.min(iA + 1, samples.length - 1)].clone().sub(samples[Math.max(iA - 1, 0)]).normalize();
            const n = Math.abs(tan.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            n.sub(tan.clone().multiplyScalar(n.dot(tan))).normalize();
            probe = A0.clone().addScaledVector(n, 0.12 + 0.35 * (1 - A0.length()));
            const arc = [];
            for (let k = 0; k <= 48; k++) arc.push(applyMatrixToBall(flowAt(k / 48), probe));
            group.add(tube(arc, ISO_MARK_COLOR, 0.007));
            const dir = arc[48].clone().sub(arc[47]).normalize();
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 12), new THREE.MeshBasicMaterial({
                color: ISO_MARK_COLOR, transparent: true, depthTest: false, depthWrite: false
            }));
            cone.position.copy(toWorld(arc[48]));
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            cone.renderOrder = 7;
            group.add(cone);
        } else {
            probe = A0.clone();
        }
    } else {
        group.add(marker(p1, ISO_AXIS_COLOR, 0.03));
        probe = new THREE.Vector3(0, 0, 0);
        const arc = [];
        for (let k = 0; k <= 48; k++) arc.push(applyMatrixToBall(flowAt(k / 48), probe));
        group.add(tube(arc, ISO_MARK_COLOR, 0.007));
    }
    const mk = marker(probe, ISO_MARK_COLOR, 0.034);
    group.add(mk);
    const S0i = S0.inv().normalized();
    return {
        onFrame() {
            const Wt = getScene().mul(S0i).normalized();
            mk.position.copy(toWorld(applyMatrixToBall(Wt, probe)));
        },
        finish() {
            lingerTimer = setTimeout(() => disposeGroup(group), window.__isoLinger || 2500);
        }
    };
}

export function clearIsometryAxis() {
    if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
    disposeGroup(group);
}

// ───────────── a persistent mark: the characteristic set of one element ─────────────

const markGroup = layer(true);

/** An arrowhead at the end of a polyline of ball points, pointing along its last segment. */
function arrowHead(pts, color, size = 1) {
    const n = pts.length;
    if (n < 2) return null;
    const end = toWorld(pts[n - 1]), dir = end.clone().sub(toWorld(pts[n - 2]));
    if (dir.lengthSq() < 1e-14) return null;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.026 * size, 0.07 * size, 12), new THREE.MeshBasicMaterial({
        color, transparent: true, depthTest: false, depthWrite: false
    }));
    cone.position.copy(end);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    cone.renderOrder = 7;
    return cone;
}

/**
 * Keep the characteristic set of G (an element as it acts in the scene, det 1) drawn until the
 * next call: the axis between its fixed points, with an arrow toward the attracting one
 * (hyperbolic, loxodromic); the rotation axis, with an arc for the turn (elliptic); or the fixed
 * point at infinity, with an arc of an orbit (parabolic). planar: the 2D view, whose plane y = 0
 * the group preserves; an elliptic turning that plane is marked by its fixed point there, where
 * its axis crosses the plane. G = null clears the mark. Returns the type, or null.
 */
export function showCharacteristicSet(G, { planar = false } = {}) {
    disposeGroup(markGroup);
    if (!G || G.anti) return null;
    const eps = 1e-9;
    const half = (z) => z.div(new Complex(2, 0));
    const tr = G.a.add(G.d);
    const disc = tr.mul(tr).sub(cplx(4, 0));
    // the fixed points in Ĉ (null for ∞), each with its eigenvalue
    let fixed;
    if (Math.sqrt(G.c.normSq()) < eps) {
        const da = G.d.sub(G.a);
        fixed = [{ z: null, k: G.a }];
        if (Math.sqrt(da.normSq()) >= eps) fixed.push({ z: G.b.div(da), k: G.d });
    } else {
        const s = Complex.sqrt(disc), amd = G.a.sub(G.d), twoC = G.c.mul(2);
        fixed = [{ z: amd.add(s).div(twoC), k: half(tr.add(s)) }, { z: amd.sub(s).div(twoC), k: half(tr.sub(s)) }];
    }
    const type = Math.sqrt(disc.normSq()) < 1e-4 || fixed.length < 2 ? 'parabolic'
        : Math.abs(tr.im) < 1e-4 && Math.abs(tr.re) < 2 ? 'elliptic' : 'hyperbolic';
    const ball = (z) => (z === null ? new THREE.Vector3(0, 0, 1) : uhsToBall({ x: z.re, y: z.im, t: 0 }));
    let X = null;
    try { X = G.log(); } catch (e) { /* no flow: no arcs */ }
    const arcFrom = (p, n = 48) => {
        if (!X) return [];
        const pts = [];
        for (let k = 0; k <= n; k++) pts.push(applyMatrixToBall(Matrix2x2.exp(scaleMat(X, k / n)), p));
        return pts.filter((q) => Number.isFinite(q.x));
    };
    const addArc = (pts) => {
        if (pts.length < 2) return;
        markGroup.add(tube(pts, ISO_MARK_COLOR, 0.006));
        const head = arrowHead(pts, ISO_MARK_COLOR);
        if (head) markGroup.add(head);
    };

    if (type === 'parabolic') {
        markGroup.add(marker(ball(fixed[0].z), ISO_AXIS_COLOR, 0.035));
        addArc(arcFrom(new THREE.Vector3(0, 0, 0)));
        return type;
    }
    const [u, w] = fixed;
    if (type === 'hyperbolic') {
        const [att, rep] = u.k.normSq() >= w.k.normSq() ? [u, w] : [w, u];
        const samples = geodesicPoints(ball(rep.z), ball(att.z), 96);
        markGroup.add(tube(samples, ISO_AXIS_COLOR, 0.009));
        markGroup.add(marker(ball(att.z), ISO_AXIS_COLOR, 0.03));
        markGroup.add(marker(ball(rep.z), ISO_AXIS_COLOR, 0.02));
        // an arrow toward the attracting end, where the axis comes nearest the center
        let i0 = 0;
        samples.forEach((s, i) => { if (s.lengthSq() < samples[i0].lengthSq()) i0 = i; });
        const i1 = Math.min(samples.length - 1, Math.max(1, i0 + 1));
        const head = arrowHead([samples[i1 - 1], samples[i1]], ISO_AXIS_COLOR, 1.2);
        if (head) markGroup.add(head);
        return type;
    }
    // elliptic: a turn of the plane is marked at its fixed point in the plane
    const offPlane = (f) => f.z !== null && Math.abs(f.z.im) > 1e-7 * Math.max(1, Math.sqrt(f.z.normSq()));
    if (planar && offPlane(u) && offPlane(w)) {
        const z = u.z.im > 0 ? u.z : w.z, h = Math.abs(z.im);
        markGroup.add(marker(uhsToBall({ x: z.re, y: 0, t: h }), ISO_AXIS_COLOR, 0.032));
        addArc(arcFrom(uhsToBall({ x: z.re + 0.45 * h, y: 0, t: h * 0.9 })));
        return type;
    }
    const samples = geodesicPoints(ball(u.z), ball(w.z), 96);
    markGroup.add(tube(samples, ISO_AXIS_COLOR, 0.006));
    markGroup.add(marker(ball(u.z), ISO_AXIS_COLOR, 0.02));
    markGroup.add(marker(ball(w.z), ISO_AXIS_COLOR, 0.02));
    if (!planar) {
        // an arc around the axis, from a point beside the axis where it comes nearest the center
        let A0 = samples[0], iA = 0;
        samples.forEach((s, i) => { if (s.lengthSq() < A0.lengthSq()) { A0 = s.clone(); iA = i; } });
        if (A0.length() > 0.985) A0.setLength(0.985);
        const tan = samples[Math.min(iA + 1, samples.length - 1)].clone().sub(samples[Math.max(iA - 1, 0)]).normalize();
        const nrm = Math.abs(tan.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        nrm.sub(tan.clone().multiplyScalar(nrm.dot(tan))).normalize();
        addArc(arcFrom(A0.clone().addScaledVector(nrm, 0.12 + 0.35 * (1 - A0.length()))));
    }
    return type;
}
