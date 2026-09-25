/**
 * The horoball packing of a cusp, in cusp view. The maximal horoball at ∞
 * has height H = 1/min|c|; an element (a b; c d) carries it to the ball
 * tangent to C at a/c with diameter 1/(|c|²H) (compute.js / invariants.js).
 * Balls live in the Ford frame (cusp at ∞) and move with the scene like
 * everything else: each is a horoball, so its image is the horoball at the
 * image of its base point through the image of its top point.
 */
import * as THREE from 'three';
import { Complex, applyMatrixToUHS, uhsToBall } from './math.js';
import { app, fordSceneMatrix } from './app.js';
import { view, disposeGroup, layer } from './scene.js';

const group = layer(false);
export const horo = { on: false };

function mobius(m, z) {
    const w = m.anti ? z.conj() : z;
    const den = m.c.mul(w).add(m.d);
    if (Math.sqrt(den.normSq()) < 1e-14) return null;            // ∞
    return m.a.mul(w).add(m.b).div(den);
}

export function updateHoroballs() {
    disposeGroup(group);
    group.visible = horo.on && app.fordOn;
    const hb = app.ford && app.ford.horoballs;
    if (!group.visible || !hb) return;
    const S = fordSceneMatrix();
    const identity = Math.abs(S.a.re - 1) + Math.abs(S.a.im) + Math.hypot(S.b.re, S.b.im) +
        Math.hypot(S.c.re, S.c.im) + Math.abs(S.d.re - 1) + Math.abs(S.d.im) < 1e-12;
    const balls = [];
    const dmax = hb.balls.length ? hb.balls[0][2] : 1;
    for (const [re, im, D] of hb.balls) {
        let base = new Complex(re, im), top = { x: re, y: im, t: D };
        let d = D;
        if (!identity) {
            base = mobius(S, base);
            if (!base) continue;                                   // sent to ∞: skip
            const t = applyMatrixToUHS(S, top);
            const dz = Math.hypot(t.x - base.re, t.y - base.im);
            d = (dz * dz + t.t * t.t) / t.t;
        }
        balls.push({ base, d, size: Math.log(D / dmax) });
    }
    if (!balls.length) return;
    const mesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 28, 18),
        new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05, emissive: 0x1a1a24 }),   // opaque: drawn before the translucent domain
        balls.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    balls.forEach((b, i) => {
        if (view.model === 'uhs') {
            dummy.position.set(b.base.re, b.d / 2, b.base.im);     // world (x, t, y)
            dummy.scale.setScalar(b.d / 2);
        } else {
            // Ball model: tangent at ξ, through the image p of the top point.
            const xi = uhsToBall({ x: b.base.re, y: b.base.im, t: 0 });
            const p = uhsToBall({ x: b.base.re, y: b.base.im, t: b.d });
            const r = p.distanceToSquared(xi) / (2 * (1 - p.dot(xi)));
            dummy.position.copy(xi.clone().multiplyScalar(1 - r));
            dummy.scale.setScalar(r);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Size classes: the largest balls warm, smaller ones cooling.
        const t = Math.min(1, -b.size / 4);
        col.setHSL(0.08 + 0.55 * t, 0.8, 0.66 - 0.1 * t);
        mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
}
