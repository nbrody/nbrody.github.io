/**
 * Inside view: a first-person camera standing inside the domain.
 *
 * The Poincaré ball is conformal, and the geodesics through the ball origin
 * are exactly the Euclidean straight lines through it. So a pinhole camera
 * pinned AT THE ORIGIN renders a geometrically correct hyperbolic view — no
 * shader change is needed, because the raymarcher already traces straight rays
 * from u_cameraPos. Anywhere else in the ball this would be wrong: geodesics
 * through an off-centre point are circular arcs, and a straight-ray render
 * would show a picture no hyperbolic observer ever sees.
 *
 * Keeping that guarantee is what shapes this module. The camera never leaves
 * the origin. Instead:
 *
 *   - LOOKING rotates the camera. A rotation about the origin is an isometry
 *     that fixes the observer, so this is exact and free.
 *   - MOVING transforms the scene. Walking a distance δ toward the direction
 *     the camera faces is the same picture as pulling hyperbolic space δ the
 *     other way, so we hand main.js the isometry to compose into the fly
 *     matrix and stay put ourselves.
 *
 * The module owns input and the camera; it produces isometries and never
 * touches the domain.
 */
// Relative (not the bare 'three' specifier) so the engine also loads in a Web
// Worker, where import maps do not apply. Same URL as the pages' import maps.
import * as THREE from '../../../Geometric/Tools/Kleinian/vendor/three/three.module.js';
import { translationTowards } from './math.js';

const SPEED = 0.9;              // hyperbolic distance per second
const BOOST = 3.0;              // ×, while Shift is held
const CREEP = 0.28;             // ×, while Alt is held
const ROLL_RATE = 1.5;          // radians per second (Q / E)
const LOOK_SENS = 0.0022;       // radians per pixel of mouse motion
const INSIDE_FOV = 72;          // degrees; wider than the orbiting view
const INSIDE_NEAR = 0.002;      // walls come very close to the eye
const MAX_DT = 0.05;            // clamp long frames (tab switch, GC pause)

// Local axes: Three's camera looks down its own −z, with +x right and +y up.
const LOCAL_X = new THREE.Vector3(1, 0, 0);
const LOCAL_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);

/**
 * @param {object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {object} opts.controls    OrbitControls, disabled while inside
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {() => void} [opts.onExit] called when the mode ends of its own accord
 */
export function createInsideView({ camera, controls, renderer, onExit }) {
    const keys = new Set();
    let active = false;
    let saved = null;           // camera/controls state to restore on exit
    let pending = { dx: 0, dy: 0 };   // unconsumed mouse motion
    let dragging = false;       // look-by-drag, for when the lock is unavailable

    const canvas = renderer.domElement;
    const locked = () => document.pointerLockElement === canvas;

    // Pointer lock is a request, not a guarantee: it needs a user gesture, and
    // it is refused outright in a sandboxed iframe — which is how the talk deck
    // embeds this page. Swallow the rejection and fall back to drag-to-look, so
    // the mode is usable either way.
    const requestLock = () => {
        try {
            const p = canvas.requestPointerLock?.();
            if (p && typeof p.catch === 'function') p.catch(() => { });
        } catch { /* older browsers throw instead of rejecting */ }
    };

    // --- input ---------------------------------------------------------
    const onKeyDown = (e) => {
        if (!active) return;
        // Escape leaves the mode — but the browser spends the first press
        // releasing the pointer lock, so only act once the mouse is already free.
        // Movement reads e.code so the WASD block stays put on any layout;
        // Escape takes either, since synthetic events often carry only e.key.
        if ((e.code === 'Escape' || e.key === 'Escape') && !locked()) {
            exit();
            return;
        }
        // Let the browser keep its own shortcuts, and let the panel's fields
        // keep theirs while the mouse is released.
        if (e.metaKey || e.ctrlKey) return;
        if (e.target instanceof Element &&
            e.target.matches('input, textarea, [contenteditable], .mq-editable-field')) return;
        keys.add(e.code);
        if (CLAIMED_CODES.has(e.code)) e.preventDefault();
    };
    const onKeyUp = (e) => { keys.delete(e.code); };
    const onBlur = () => { keys.clear(); dragging = false; pending.dx = pending.dy = 0; };

    const onMouseMove = (e) => {
        if (!active || !(locked() || dragging)) return;
        pending.dx += e.movementX || 0;
        pending.dy += e.movementY || 0;
    };
    // Clicking the scene re-captures the mouse; clicking the control panel to
    // change a setting drops it without leaving the mode.
    const onCanvasDown = () => {
        if (!active) return;
        dragging = true;
        if (!locked()) requestLock();
    };
    const onPointerUp = () => { dragging = false; };
    const onLockChange = () => { if (!locked()) onBlur(); };

    // --- lifecycle -----------------------------------------------------
    function enter() {
        if (active) return;
        active = true;

        saved = {
            position: camera.position.clone(),
            quaternion: camera.quaternion.clone(),
            fov: camera.fov,
            near: camera.near,
            target: controls.target.clone(),
            controlsEnabled: controls.enabled,
            autoRotate: controls.autoRotate,
        };

        // Keep facing the way the orbiting camera was pointed, so stepping
        // inside reads as a move rather than a cut.
        const heading = controls.target.clone().sub(camera.position);
        if (heading.lengthSq() < 1e-12) heading.set(0, 0, -1);
        heading.normalize();

        controls.autoRotate = false;
        controls.enabled = false;
        camera.position.set(0, 0, 0);
        camera.up.set(0, 1, 0);
        camera.lookAt(heading);           // camera is at the origin: aim at the direction
        camera.fov = INSIDE_FOV;
        camera.near = INSIDE_NEAR;
        camera.updateProjectionMatrix();

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointerlockchange', onLockChange);
        canvas.addEventListener('pointerdown', onCanvasDown);
        requestLock();
    }

    function exit() {
        if (!active) return;
        active = false;
        keys.clear();
        pending.dx = pending.dy = 0;

        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointerlockchange', onLockChange);
        canvas.removeEventListener('pointerdown', onCanvasDown);
        dragging = false;
        if (locked()) document.exitPointerLock();

        camera.position.copy(saved.position);
        camera.quaternion.copy(saved.quaternion);
        camera.fov = saved.fov;
        camera.near = saved.near;
        camera.updateProjectionMatrix();
        controls.target.copy(saved.target);
        controls.enabled = saved.controlsEnabled;
        controls.autoRotate = saved.autoRotate;
        controls.update();
        saved = null;
        if (onExit) onExit();
    }

    /**
     * Advance one frame. Rotates the camera in place, and returns the
     * hyperbolic isometry to compose into the scene's fly matrix (null when
     * the observer did not move).
     */
    function step(dt) {
        if (!active) return null;
        dt = Math.min(dt, MAX_DT);

        // Look: yaw and pitch about the camera's OWN axes. Composing on the
        // right keeps them local, so there is no gimbal lock and no forced
        // horizon — roll accumulates, which is honest for a free flyer.
        if (pending.dx || pending.dy) {
            const q = camera.quaternion;
            q.multiply(_q.setFromAxisAngle(LOCAL_Y, -pending.dx * LOOK_SENS));
            q.multiply(_q.setFromAxisAngle(LOCAL_X, -pending.dy * LOOK_SENS));
            pending.dx = pending.dy = 0;
        }
        const roll = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
        if (roll) camera.quaternion.multiply(_q.setFromAxisAngle(LOCAL_Z, roll * ROLL_RATE * dt));
        camera.quaternion.normalize();

        // Travel: sum the held axes in the camera frame, then translate once
        // along the result. Per-frame steps are small enough that the
        // difference from composing the axes separately is far below a pixel.
        const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0)
            - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        const strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
            - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        const rise = (keys.has('KeyR') ? 1 : 0) - (keys.has('KeyF') ? 1 : 0);
        if (!fwd && !strafe && !rise) return null;

        _dir.set(0, 0, 0);
        if (fwd) _dir.addScaledVector(_axis.set(0, 0, -1).applyQuaternion(camera.quaternion), fwd);
        if (strafe) _dir.addScaledVector(_axis.set(1, 0, 0).applyQuaternion(camera.quaternion), strafe);
        if (rise) _dir.addScaledVector(_axis.set(0, 1, 0).applyQuaternion(camera.quaternion), rise);
        const len = _dir.length();
        if (len < 1e-9) return null;
        _dir.divideScalar(len);

        let speed = SPEED;
        if (keys.has('ShiftLeft') || keys.has('ShiftRight')) speed *= BOOST;
        if (keys.has('AltLeft') || keys.has('AltRight')) speed *= CREEP;
        const delta = Math.min(len, 1) * speed * dt;

        // Walking δ toward _dir shows the same picture as moving hyperbolic
        // space δ the other way, so hand back the inverse translation.
        return translationTowards(_dir, -delta);
    }

    return {
        enter, exit, step,
        isActive: () => active,
        isLocked: locked,
    };
}

// Keys we swallow so the page does not also act on them. Space is in here not
// because it moves anything but because the mode is usually entered by clicking
// the Inside View button, which then holds focus — an unclaimed Space would
// press it again and drop straight back out.
const CLAIMED_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

// Scratch objects: step() runs every frame, so it allocates nothing.
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
