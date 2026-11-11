/**
 * Input sources as pointers: the two XR input sources (hands or
 * controllers) and, outside XR, the mouse. Each pointer has a world ray, a
 * "select" button (pinch, trigger or left button) with edges per frame, and
 * for grabbing a pose (pinch point and wrist for hands, grip for
 * controllers). Hands also report the index fingertip for poking panels.
 *
 * Quest gives hands a system target ray and fires select on pinch, so hands
 * and controllers share one code path; hand joints add the fingertip.
 */
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

class Pointer {
    constructor(id) {
        this.id = id;
        this.kind = 'none';         // hand | controller | mouse | none
        this.handedness = '';
        this.active = false;
        this.tracked = false;
        this._awaitSelectRelease = false; this._awaitSqueezeRelease = false;
        this.ray = new THREE.Ray();
        this.select = false;
        this.selectStart = false;
        this.selectEnd = false;
        this.squeeze = false;
        this.squeezeStart = false;
        this.squeezeEnd = false;
        this.pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
        this.tip = null;            // index fingertip (hands)
        this.anchor = new THREE.Vector3();  // a point that stays put while pinching (wrist / grip), for telling taps from drags
        this.axes = [0, 0];
        this.buttonA = false; this.buttonAStart = false;
        this.buttonB = false; this.buttonBStart = false;
        this.source = null;
        this._sel = false; this._sq = false;
        this.dblClick = false;
        this.wheel = 0;
    }
    haptic(strength = 0.3, ms = 18) {
        const a = this.source && this.source.gamepad && this.source.gamepad.hapticActuators;
        if (a && a[0] && a[0].pulse) { try { a[0].pulse(strength, ms); } catch (e) { /* ignore */ } }
    }
}

export function createInput({ renderer, scene, camera, dom }) {
    const pointers = [new Pointer('xr0'), new Pointer('xr1')];
    const mouse = new Pointer('mouse');
    mouse.kind = 'mouse';
    const handFactory = new XRHandModelFactory();
    const ctrlFactory = new XRControllerModelFactory();
    const rigs = [];
    let handsVisible = true;

    for (let i = 0; i < 2; i++) {
        const P = pointers[i];
        const ctrl = renderer.xr.getController(i);
        const grip = renderer.xr.getControllerGrip(i);
        const hand = renderer.xr.getHand(i);
        scene.add(ctrl, grip, hand);
        const handModel = handFactory.createHandModel(hand, 'mesh');
        hand.add(handModel);
        const ctrlModel = ctrlFactory.createControllerModel(grip);
        grip.add(ctrlModel);

        // The visible ray and cursor.
        const rayGeo = new THREE.CylinderGeometry(0.0015, 0.0015, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(-Math.PI / 2);
        const rayMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.55, depthWrite: false });
        const rayMesh = new THREE.Mesh(rayGeo, rayMat);
        rayMesh.renderOrder = 50;
        rayMesh.visible = false;
        scene.add(rayMesh);
        const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.0095, 24), new THREE.MeshBasicMaterial({ color: 0x5f67cf, transparent: true, depthTest: false, side: THREE.DoubleSide }));
        cursor.renderOrder = 51;
        cursor.visible = false;
        scene.add(cursor);
        // Two opposing jaws follow the real index finger and thumb. They are
        // independent of the target ray, so they remain visible while grabbing.
        const pinch = new THREE.Group();
        const jawMaterial = new THREE.MeshBasicMaterial({ color: 0x818cf8, depthTest: false });
        const jawGeometry = new THREE.CapsuleGeometry(0.0018, 0.012, 3, 6);
        const jaws = [new THREE.Mesh(jawGeometry, jawMaterial), new THREE.Mesh(jawGeometry, jawMaterial)];
        for (const jaw of jaws) { jaw.renderOrder = 52; pinch.add(jaw); }
        pinch.visible = false;
        scene.add(pinch);

        ctrl.addEventListener('connected', (e) => {
            P.source = e.data;
            P.handedness = e.data.handedness || '';
            P.kind = e.data.hand ? 'hand' : 'controller';
            P.active = true;
        });
        ctrl.addEventListener('disconnected', () => {
            P.active = false; P.kind = 'none'; P.source = null; P._sel = false; P._sq = false;
        });
        ctrl.addEventListener('selectstart', () => { P._sel = true; });
        ctrl.addEventListener('selectend', () => { P._sel = false; });
        ctrl.addEventListener('squeezestart', () => { P._sq = true; });
        ctrl.addEventListener('squeezeend', () => { P._sq = false; });
        rigs.push({ P, ctrl, grip, hand, handModel, ctrlModel, rayMesh, cursor, pinch, jaws });
    }

    // ---- the mouse (desktop) ----
    const ndc = new THREE.Vector2();
    // Button transitions are queued and played back one per frame, so a click
    // that presses and releases between two frames is still seen.
    let mouseIn = false, mouseDown = false, dbl = false, wheel = 0;
    const mq = [];
    dom.addEventListener('pointermove', (e) => {
        const r = dom.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        mouseIn = true;
    });
    dom.addEventListener('pointerleave', () => { mouseIn = false; });
    dom.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const r = dom.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        mouseIn = true;
        mq.push(true);
    });
    window.addEventListener('pointerup', (e) => { if (e.button === 0) mq.push(false); });
    dom.addEventListener('dblclick', () => { dbl = true; });
    dom.addEventListener('wheel', (e) => { wheel += e.deltaY; }, { passive: true });
    const raycaster = new THREE.Raycaster();

    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();

    function edges(P, sel, sq) {
        P.selectStart = sel && !P.select;
        P.selectEnd = !sel && P.select;
        P.select = sel;
        P.squeezeStart = sq && !P.squeeze;
        P.squeezeEnd = !sq && P.squeeze;
        P.squeeze = sq;
    }

    /** Read every source; call once per frame before interaction. */
    function update() {
        const xr = renderer.xr.isPresenting;
        for (const R of rigs) {
            const P = R.P;
            if (!xr || !P.active) {
                if (P.select || P._sel) P._awaitSelectRelease = true;
                if (P.squeeze || P._sq) P._awaitSqueezeRelease = true;
                P.tracked = false;
                edges(P, false, false);
                R.rayMesh.visible = R.cursor.visible = R.pinch.visible = false;
                continue;
            }
            // A connected hand can temporarily lose its joint poses. Treat
            // that as a vanished pointer, never as a grab at the ray origin.
            const joints = R.hand.joints || {};
            const tip = joints['index-finger-tip'], thumb = joints['thumb-tip'], wrist = joints['wrist'];
            P.tracked = P.kind !== 'hand' || !!(tip && thumb && tip.visible && thumb.visible);
            if (!P.tracked) {
                if (P.select || P._sel) P._awaitSelectRelease = true;
                if (P.squeeze || P._sq) P._awaitSqueezeRelease = true;
                edges(P, false, false);
                P.tip = null;
                R.rayMesh.visible = R.cursor.visible = R.pinch.visible = false;
                continue;
            }
            // A held pinch across a tracking gap must be released before it
            // can start a new interaction.
            if (!P._sel) P._awaitSelectRelease = false;
            if (!P._sq) P._awaitSqueezeRelease = false;
            // The target ray (system hand ray for hands).
            R.ctrl.updateMatrixWorld(true);
            R.ctrl.getWorldPosition(P.ray.origin);
            R.ctrl.getWorldQuaternion(tmpQ);
            P.ray.direction.set(0, 0, -1).applyQuaternion(tmpQ).normalize();
            edges(P, P._sel && !P._awaitSelectRelease, P._sq && !P._awaitSqueezeRelease);
            if (P.kind === 'hand') {
                P.tip = tip && tip.visible ? tip.getWorldPosition(P.tip || new THREE.Vector3()) : null;
                const tracked = tip && thumb && tip.visible && thumb.visible;
                R.pinch.visible = !!tracked;
                if (tracked) {
                    const indexPosition = tip.getWorldPosition(new THREE.Vector3());
                    const thumbPosition = thumb.getWorldPosition(new THREE.Vector3());
                    P.pose.position.copy(indexPosition).add(thumbPosition).multiplyScalar(0.5);
                    // Angle each jaw toward its opposite, giving clear open and
                    // closed feedback without substituting for the tracked hand.
                    const axis = indexPosition.clone().sub(thumbPosition).normalize();
                    const view = camera.getWorldPosition(new THREE.Vector3()).sub(P.pose.position).normalize();
                    let tangent = new THREE.Vector3().crossVectors(axis, view).normalize();
                    if (tangent.lengthSq() < 1e-6) tangent.set(0, 1, 0);
                    for (let j = 0; j < 2; j++) {
                        const jaw = R.jaws[j], sign = j === 0 ? 1 : -1;
                        jaw.position.copy(j === 0 ? indexPosition : thumbPosition);
                        const direction = tangent.clone().addScaledVector(axis, -sign * 0.7).normalize();
                        jaw.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
                        jaw.scale.setScalar(P.select ? 1.3 : 1);
                    }
                    jawMaterialColor(R, P.select);
                } else {
                    P.pose.position.copy(P.ray.origin);
                }
                if (wrist && wrist.visible) { wrist.getWorldQuaternion(P.pose.quaternion); wrist.getWorldPosition(P.anchor); }
                else { P.pose.quaternion.copy(tmpQ); P.anchor.copy(P.ray.origin); }
                R.handModel.visible = handsVisible;
            } else {
                R.pinch.visible = false;
                P.tip = null;
                R.grip.updateMatrixWorld(true);
                R.grip.getWorldPosition(P.pose.position);
                R.grip.getWorldQuaternion(P.pose.quaternion);
                P.anchor.copy(P.pose.position);
            }
            const gp = P.source && P.source.gamepad;
            if (gp) {
                P.axes[0] = gp.axes[2] || 0;
                P.axes[1] = gp.axes[3] || 0;
                const a = !!(gp.buttons[4] && gp.buttons[4].pressed), b = !!(gp.buttons[5] && gp.buttons[5].pressed);
                P.buttonAStart = a && !P.buttonA; P.buttonA = a;
                P.buttonBStart = b && !P.buttonB; P.buttonB = b;
            } else {
                P.axes[0] = P.axes[1] = 0;
            }
        }
        // Mouse.
        mouse.active = !xr && mouseIn;
        if (mouse.active) {
            raycaster.setFromCamera(ndc, camera);
            mouse.ray.copy(raycaster.ray);
        }
        if (mq.length) mouseDown = mq.shift();
        edges(mouse, !xr && mouseDown, false);
        // A double click waits until its clicks have played back.
        mouse.dblClick = dbl && !mq.length; if (mouse.dblClick) dbl = false;
        mouse.wheel = wheel; wheel = 0;
    }

    function jawMaterialColor(R, selected) { R.jaws[0].material.color.setHex(selected ? 0x34d399 : 0x818cf8); }

    /** Draw a pointer's ray up to `dist` (null hides it) with a cursor at the hit. */
    function showRay(P, dist, normal = null) {
        const R = rigs.find(r => r.P === P);
        if (!R) return;
        const show = dist !== null && dist !== undefined && P.active;
        R.rayMesh.visible = show;
        R.cursor.visible = show;
        if (!show) return;
        R.rayMesh.position.copy(P.ray.origin);
        R.rayMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), P.ray.direction);
        R.rayMesh.scale.set(1, 1, Math.max(0.01, dist));
        const hit = P.ray.at(dist, tmpV);
        R.cursor.position.copy(hit);
        if (normal) R.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        else R.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), P.ray.direction.clone().negate());
        R.rayMesh.material.opacity = P.select ? 0.9 : 0.5;
    }

    function setHandsVisible(v) {
        handsVisible = v;
        for (const R of rigs) R.handModel.visible = v;
    }

    return {
        pointers, mouse, update, showRay, setHandsVisible,
        all() { return renderer.xr.isPresenting ? pointers.filter(p => p.active && p.tracked) : (mouse.active || mouse.select || mouse.selectEnd ? [mouse] : []); },
    };
}
