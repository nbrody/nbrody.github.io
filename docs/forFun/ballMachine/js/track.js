// track.js — polyline rail tracks with arc-length frames for ball physics.
import * as THREE from 'three';

export const DS = 0.05; // uniform resample spacing (m)
const UP = new THREE.Vector3(0, 1, 0);

// Dense points through waypoints via centripetal Catmull-Rom.
export function catmullDense(waypoints) {
    const pts = waypoints.map(p => Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const L = curve.getLength();
    return curve.getSpacedPoints(Math.max(8, Math.ceil(L * 18)));
}

// Analytic helix sample points (returned as Vector3 list).
export function helixPts(cx, cz, radius, y0, y1, th0deg, turns, dir = 1, perTurn = 44) {
    const th0 = th0deg * Math.PI / 180;
    const n = Math.max(6, Math.round(turns * perTurn));
    const out = [];
    for (let i = 0; i <= n; i++) {
        const f = i / n;
        const th = th0 + dir * f * turns * Math.PI * 2;
        out.push(new THREE.Vector3(cx + radius * Math.cos(th), y0 + (y1 - y0) * f, cz + radius * Math.sin(th)));
    }
    return out;
}

// Vertical loop in the x-y plane, entered at (cx, yb, z0) moving -x,
// with a lateral drift dz over the full circle so the tubes don't self-intersect.
// The drift is smoothstepped: zero z-slope at entry and exit, so the loop's
// end tangents are planar and the joints to the approach/exit runs don't kink
// (a z-kink at the joint necks the swept tube narrower than the ball).
// The arc extends past the bottom on both sides (phi0 < 0, phi1 > 2π): those
// lead-in/lead-out arcs are fillets whose tangents match a descending approach
// and a climbing exit — a sharp joint elbow necks the swept tube shut.
// phi0/phi1 lead arcs must stay SHALLOW: if the lead-in tangent is steeper than
// the approach, the junction is convex — a launch ramp that sends the ball
// ballistic across the dip and head-on into the far side of the loop.
export function loopPts(cx, z0, yb, r, dz, per = 72, phi0 = -0.35, phi1 = Math.PI * 2 + 0.35) {
    const out = [];
    for (let i = 0; i <= per; i++) {
        const phi = phi0 + (phi1 - phi0) * i / per;
        const u = i / per;
        out.push(new THREE.Vector3(
            cx - r * Math.sin(phi),
            yb + r * (1 - Math.cos(phi)),
            z0 + dz * u * u * (3 - 2 * u)
        ));
    }
    return out;
}

// Concatenate point lists, dropping near-duplicate joints.
export function joinPts(...lists) {
    const out = [];
    for (const list of lists) {
        for (const p of list) {
            const v = Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p;
            if (out.length === 0 || out[out.length - 1].distanceToSquared(v) > 1e-6) out.push(v.clone());
        }
    }
    return out;
}

export class Track {
    constructor(name, points, opts = {}) {
        this.name = name;
        this.gauge = opts.gauge ?? 0.17;
        this.railR = opts.railR ?? 0.024;
        this.color = opts.color ?? 0xcc3344;
        this.captureAlong = opts.captureAlong ?? false;
        this.onEnd = { type: 'rest' };   // set by the machine after construction
        this.brakes = [];                // {s0, s1, vmax}
        this._resample(points);
    }

    _resample(raw) {
        // cumulative arc length of the raw polyline
        const cum = [0];
        for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]));
        const total = cum[cum.length - 1];
        const n = Math.max(4, Math.round(total / DS));
        this.length = n * DS;
        const P = [];
        let j = 0;
        for (let i = 0; i <= n; i++) {
            const s = Math.min(total, i * DS);
            while (j < cum.length - 2 && cum[j + 1] < s) j++;
            const seg = Math.max(1e-9, cum[j + 1] - cum[j]);
            const f = (s - cum[j]) / seg;
            P.push(new THREE.Vector3().lerpVectors(raw[j], raw[j + 1], f));
        }
        this.P = P;

        // unit tangents (central differences)
        const T = [];
        for (let i = 0; i <= n; i++) {
            const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
            T.push(new THREE.Vector3().subVectors(b, a).normalize());
        }
        this.T = T;

        // curvature first — the frame rule depends on it
        const K = [];
        const tmp = new THREE.Vector3();
        for (let i = 0; i <= n; i++) {
            const a = T[Math.max(0, i - 1)], b = T[Math.min(n, i + 1)];
            K.push(tmp.subVectors(b, a).length() / (2 * DS));
        }
        this.K = K;

        // Side vectors. On flat-ish, gently curved track use the exact horizontal
        // frame cross(T, up): it is a continuous function of T, so it can never
        // flip sign. Parallel transport is used ONLY through steep or tightly
        // curved stretches (loop sides/top, hard bends) — transporting through a
        // steep 180° turn rotates the frame upside down and a sign-preserving
        // relevel then locks the whole downstream channel in inverted.
        // Frame rule: the exact horizontal frame cross(T, up) everywhere — it is
        // continuous through hairpins and steep dives alike and can never flip.
        // Parallel transport engages ONLY while the track is near-vertical (the
        // sides of a vertical loop, the one place cross(T, up) degenerates) and
        // hands back to the flat frame only once the two frames agree again — a
        // planar loop has zero holonomy, so the rejoin at the bottom is seamless.
        // Any other switching scheme leaves a twist-seam wall inside the tube.
        const S = [];
        const flatS = new THREE.Vector3();
        let side = new THREE.Vector3().crossVectors(T[0], UP);
        if (side.lengthSq() < 1e-6) side.set(0, 0, -1); else side.normalize();
        let transporting = false;
        for (let i = 0; i <= n; i++) {
            const t = T[i];
            const horiz = Math.hypot(t.x, t.z);
            if (!transporting) {
                if (horiz < 0.35) {
                    transporting = true;
                    side.addScaledVector(t, -side.dot(t)).normalize();
                } else {
                    side.crossVectors(t, UP).normalize();
                }
            } else {
                side.addScaledVector(t, -side.dot(t)).normalize();
                if (horiz > 0.35) {
                    flatS.crossVectors(t, UP).normalize();
                    if (flatS.dot(side) > 0.95) { transporting = false; side.copy(flatS); }
                }
            }
            S.push(side.clone());
        }
        this.S = S;

        // normals (direction from rail pair toward ball center)
        const N = [];
        for (let i = 0; i <= n; i++) {
            N.push(new THREE.Vector3().crossVectors(S[i], T[i]).normalize());
        }
        this.N = N;
        this.n = n;
    }

    frameAt(s, out = {}) {
        s = Math.max(0, Math.min(this.length - 1e-6, s));
        const u = s / DS, i = Math.floor(u), f = u - i, i1 = Math.min(this.n, i + 1);
        out.p = (out.p || new THREE.Vector3()).lerpVectors(this.P[i], this.P[i1], f);
        out.t = (out.t || new THREE.Vector3()).lerpVectors(this.T[i], this.T[i1], f).normalize();
        out.nrm = (out.nrm || new THREE.Vector3()).lerpVectors(this.N[i], this.N[i1], f).normalize();
        out.side = (out.side || new THREE.Vector3()).lerpVectors(this.S[i], this.S[i1], f).normalize();
        out.kappa = this.K[i] * (1 - f) + this.K[i1] * f;
        return out;
    }

    ballCenterAt(s, h, out = new THREE.Vector3()) {
        const f = this.frameAt(s, this._fc = this._fc || {});
        return out.copy(f.p).addScaledVector(f.nrm, h);
    }

    // nearest sample (coarse) to a world point; returns {s, d} or null
    nearestOnTrack(pos, maxD, h = 0) {
        let best = null, bestD = maxD;
        const tmp = new THREE.Vector3();
        for (let i = 0; i <= this.n; i += 3) {
            tmp.copy(this.P[i]).addScaledVector(this.N[i], h);
            const d = tmp.distanceTo(pos);
            if (d < bestD) { bestD = d; best = i; }
        }
        if (best === null) return null;
        return { s: best * DS, d: bestD };
    }

    addBrake(s0, s1, vmax) { this.brakes.push({ s0, s1, vmax }); }

    // ---- rendering ----
    buildMesh(opts = {}) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
            color: this.color, metalness: 0.75, roughness: 0.32,
        });
        for (const sign of [-1, 1]) {
            const pts = [];
            for (let i = 0; i <= this.n; i += 1) {
                pts.push(new THREE.Vector3().copy(this.P[i]).addScaledVector(this.S[i], sign * this.gauge / 2));
            }
            const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
            const segs = Math.min(2000, Math.max(16, Math.round(this.length * 14)));
            const tube = new THREE.TubeGeometry(curve, segs, this.railR, 7, false);
            const mesh = new THREE.Mesh(tube, mat);
            mesh.castShadow = true;
            group.add(mesh);
        }
        // crossties
        const tieEvery = opts.tieEvery ?? 0.38;
        const count = Math.max(1, Math.floor(this.length / tieEvery));
        const tieGeo = new THREE.CylinderGeometry(0.013, 0.013, this.gauge + 0.06, 6);
        const tieMat = new THREE.MeshStandardMaterial({ color: 0x30323a, metalness: 0.8, roughness: 0.4 });
        const ties = new THREE.InstancedMesh(tieGeo, tieMat, count);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
        const f = {};
        for (let k = 0; k < count; k++) {
            this.frameAt((k + 0.5) * tieEvery, f);
            q.setFromUnitVectors(Y, f.side);
            m.compose(new THREE.Vector3().copy(f.p).addScaledVector(f.nrm, -0.012), q, new THREE.Vector3(1, 1, 1));
            ties.setMatrixAt(k, m);
        }
        ties.castShadow = true;
        group.add(ties);
        return group;
    }
}
