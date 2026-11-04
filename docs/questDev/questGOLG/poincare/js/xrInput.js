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
        rigs.push({ P, ctrl, grip, hand, handModel, ctrlModel, rayMesh, cursor });
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
                edges(P, false, false);
                R.rayMesh.visible = R.cursor.visible = false;
                continue;
            }
            // The target ray (system hand ray for hands).
            R.ctrl.updateMatrixWorld(true);
            R.ctrl.getWorldPosition(P.ray.origin);
            R.ctrl.getWorldQuaternion(tmpQ);
            P.ray.direction.set(0, 0, -1).applyQuaternion(tmpQ).normalize();
            edges(P, P._sel, P._sq);
            if (P.kind === 'hand') {
                const j = R.hand.joints || {};
                const tip = j['index-finger-tip'], thumb = j['thumb-tip'], wrist = j['wrist'];
                P.tip = tip ? tip.getWorldPosition(P.tip || new THREE.Vector3()) : null;
                if (tip && thumb) {
                    P.pose.position.copy(tip.getWorldPosition(tmpV)).add(thumb.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
                } else {
                    P.pose.position.copy(P.ray.origin);
                }
                if (wrist) { wrist.getWorldQuaternion(P.pose.quaternion); wrist.getWorldPosition(P.anchor); }
                else { P.pose.quaternion.copy(tmpQ); P.anchor.copy(P.ray.origin); }
                R.handModel.visible = true;
            } else {
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
        for (const R of rigs) R.handModel.visible = v;
    }

    return {
        pointers, mouse, update, showRay, setHandsVisible,
        all() { return renderer.xr.isPresenting ? pointers.filter(p => p.active) : (mouse.active || mouse.select || mouse.selectEnd ? [mouse] : []); },
    };
}
