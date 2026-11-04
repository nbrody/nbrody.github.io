/**
 * What the pointers do, in priority order:
 *   1. a fingertip near a panel pokes it (hands);
 *   2. a ray on a panel hovers it, and select presses it;
 *   3. a ray on a face of the domain hovers it; a quick select is a tap
 *      (select the face), two taps go through it;
 *   4. select held (or moved) anywhere else, or a controller's grip, grabs:
 *      one hand carries and turns the ball, two hands also scale it. In the
 *      inside view a grab pulls you through hyperbolic space instead.
 * Thumbsticks zoom/turn the ball, or fly in the inside view.
 */
import * as THREE from 'three';

const POKE_DOWN = 0.012, POKE_UP = 0.025, POKE_RANGE = 0.07;
const TAP_MS = 450, TAP_MOVE = 0.02, DOUBLE_MS = 500;

export function createInteraction({ input, display, ballRoot, panels, camera, controls = null, inside, callbacks }) {
    const raycaster = new THREE.Raycaster();
    const st = new Map();       // pointer id → state
    const state = (p) => {
        if (!st.has(p.id)) st.set(p.id, { mode: 'idle', hoverPanel: null, pokePanel: null, poked: false, lastTap: { t: 0, tag: -9 } });
        return st.get(p.id);
    };
    let grab = null;            // { ids: [...], start… }
    const tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

    const poseMatrix = (p, out = new THREE.Matrix4()) => out.compose(p.pose.position, p.pose.quaternion, new THREE.Vector3(1, 1, 1));

    function visiblePanels() { return panels().filter(P => P.mesh.visible && P.mesh.parent && isShown(P.mesh)); }
    function isShown(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }

    function leavePanel(p, s) {
        if (s.hoverPanel) { s.hoverPanel.pointerMove(p.id, null); s.hoverPanel = null; }
    }

    // ---------------- grabbing ----------------

    function beginGrab(p, by) {
        const s = state(p);
        s.mode = 'grab';
        s.grabBy = by;
        leavePanel(p, s);
        restartGrab();
        p.haptic(0.25, 14);
        callbacks.onGrab && callbacks.onGrab(true);
    }

    function endGrab(p) {
        const s = state(p);
        s.mode = 'idle';
        restartGrab();
        if (!grabbers().length) callbacks.onGrab && callbacks.onGrab(false);
    }

    function grabbers() {
        return input.all().filter(p => state(p).mode === 'grab');
    }

    /** Re-anchor the grab whenever the set of grabbing pointers changes. */
    function restartGrab() {
        const G = grabbers();
        if (!G.length) { grab = null; return; }
        ballRoot.updateMatrixWorld(true);
        grab = { ids: G.map(p => p.id), ball0: ballRoot.matrix.clone(), last: G.map(p => p.pose.position.clone()) };
        if (G.length === 1) {
            grab.rel = poseMatrix(G[0]).invert().multiply(ballRoot.matrix);
        } else {
            const a = G[0].pose.position, b = G[1].pose.position;
            grab.mid0 = a.clone().add(b).multiplyScalar(0.5);
            grab.v0 = b.clone().sub(a);
        }
    }

    function updateGrab() {
        const G = grabbers();
        if (!G.length || !grab) return;
        if (G.map(p => p.id).join() !== grab.ids.join()) { restartGrab(); return; }
        if (inside()) {
            // Pull through space: the world follows the hands.
            const d = new THREE.Vector3();
            G.forEach((p, i) => { d.add(p.pose.position.clone().sub(grab.last[i])); grab.last[i].copy(p.pose.position); });
            d.multiplyScalar(1 / G.length);
            if (d.lengthSq() > 0) callbacks.onFly(d, false);
            return;
        }
        if (G.length === 1) {
            tmpM.copy(poseMatrix(G[0])).multiply(grab.rel);
        } else {
            const a = G[0].pose.position, b = G[1].pose.position;
            const mid = a.clone().add(b).multiplyScalar(0.5);
            const v = b.clone().sub(a);
            let k = v.length() / Math.max(1e-4, grab.v0.length());
            // Keep the ball between 8 cm and 1.2 m across.
            const s0 = new THREE.Vector3().setFromMatrixScale(grab.ball0).x;
            k = THREE.MathUtils.clamp(k, 0.04 / s0, 0.6 / s0);
            const q = new THREE.Quaternion().setFromUnitVectors(grab.v0.clone().normalize(), v.clone().normalize());
            tmpM.makeTranslation(mid.x, mid.y, mid.z)
                .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
                .multiply(new THREE.Matrix4().makeScale(k, k, k))
                .multiply(new THREE.Matrix4().makeTranslation(-grab.mid0.x, -grab.mid0.y, -grab.mid0.z))
                .multiply(grab.ball0);
        }
        const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
        tmpM.decompose(pos, quat, scl);
        ballRoot.position.lerp(pos, 0.6);
        ballRoot.quaternion.slerp(quat, 0.6);
        const sc = THREE.MathUtils.lerp(ballRoot.scale.x, scl.x, 0.6);
        ballRoot.scale.setScalar(sc);
        callbacks.onBallMoved && callbacks.onBallMoved();
    }

    // ---------------- per frame ----------------

    function update(now, dt) {
        const ps = input.all();
        for (const p of ps) step(p, now);
        // Pointers that vanished: release whatever they held.
        for (const [id, s] of st) {
            if (ps.some(p => p.id === id)) continue;
            if (s.hoverPanel) { s.hoverPanel.pointerMove(id, null); s.hoverPanel = null; }
            if (s.pokePanel) { if (s.poked) s.pokePanel.pointerUp(id, null); s.pokePanel = null; s.poked = false; }
            if (s.mode === 'panelPress' && s.panel) s.panel.pointerUp(id, null);
            if (s.mode === 'grab') { s.mode = 'idle'; restartGrab(); }
            s.mode = 'idle';
        }
        updateGrab();
        sticks(ps, dt);
    }

    function step(p, now) {
        const s = state(p);

        // 1. Poke with the index fingertip.
        if (p.tip && s.mode !== 'grab' && s.mode !== 'press' && s.mode !== 'panelPress') {
            let best = null;
            for (const P of visiblePanels()) {
                const lp = P.localPoke(p.tip);
                if (!lp || lp.depth > POKE_RANGE || lp.depth < -0.04) continue;
                if (!best || Math.abs(lp.depth) < Math.abs(best.lp.depth)) best = { P, lp };
            }
            if (best) {
                if (s.pokePanel && s.pokePanel !== best.P) {
                    if (s.poked) s.pokePanel.pointerUp(p.id, null);
                    s.pokePanel.pointerMove(p.id, null);
                    s.poked = false;
                }
                leavePanel(p, s);
                s.pokePanel = best.P;
                best.P.pointerMove(p.id, best.lp.uv);
                if (!s.poked && best.lp.depth < POKE_DOWN) { best.P.pointerDown(p.id, best.lp.uv); s.poked = true; }
                else if (s.poked && best.lp.depth > POKE_UP) { best.P.pointerUp(p.id, best.lp.uv); s.poked = false; }
                input.showRay(p, null);
                return;
            }
            if (s.pokePanel) {
                if (s.poked) s.pokePanel.pointerUp(p.id, null);
                s.pokePanel.pointerMove(p.id, null);
                s.pokePanel = null;
                s.poked = false;
            }
        }

        raycaster.set(p.ray.origin, p.ray.direction);
        raycaster.far = 20;

        // A mouse double click goes through the face under it (whatever mode the press left us in).
        if (p.kind === 'mouse' && p.dblClick) {
            const f = display.pick(raycaster);
            if (f.tag >= 0) callbacks.onDoubleTap(f.tag);
        }

        // Controller grip grabs at once.
        if (p.squeezeStart && s.mode !== 'grab') { beginGrab(p, 'squeeze'); }
        if (s.mode === 'grab') {
            if ((s.grabBy === 'squeeze' && p.squeezeEnd) || (s.grabBy === 'select' && p.selectEnd)) endGrab(p);
            input.showRay(p, null);
            return;
        }

        // A press held on a panel goes on to that panel.
        if (s.mode === 'panelPress') {
            const hit = raycaster.intersectObject(s.panel.mesh, false)[0];
            const uv = hit ? s.panel.uvFromIntersection(hit) : null;
            if (uv) s.panel.pointerMove(p.id, uv);
            input.showRay(p, hit ? hit.distance : 0.6);
            if (p.selectEnd) { s.panel.pointerUp(p.id, uv); s.mode = 'idle'; if (controls) controls.enabled = true; }
            return;
        }

        // 2./3. What the ray meets.
        let panelHit = null;
        for (const P of visiblePanels()) {
            const h = raycaster.intersectObject(P.mesh, false)[0];
            if (h && (!panelHit || h.distance < panelHit.h.distance)) panelHit = { P, h };
        }
        const face = display.pick(raycaster);
        const faceFirst = face.tag >= 0 && (!panelHit || face.distance < panelHit.h.distance);

        if (s.mode === 'press') {
            const moved = p.anchor.distanceTo(s.pressPos);
            // A release ends the press as a tap (checked first, so a slow frame can't turn it into a grab).
            if (p.selectEnd) {
                s.mode = 'idle';
                if (controls) controls.enabled = true;
                const still = p.kind === 'mouse' ? p.ray.direction.angleTo(s.pressDir) < 0.01 : moved < TAP_MOVE;
                if (still) tap(p, s, s.pressTag, now);
                input.showRay(p, faceFirst ? face.distance : null);
                return;
            }
            if (p.kind !== 'mouse' && (now - s.pressT > TAP_MS || moved > TAP_MOVE)) {
                beginGrab(p, 'select');
                return;
            }
            input.showRay(p, faceFirst ? face.distance : null);
            return;
        }

        if (panelHit && !faceFirst) {
            if (s.hoverPanel && s.hoverPanel !== panelHit.P) s.hoverPanel.pointerMove(p.id, null);
            s.hoverPanel = panelHit.P;
            const uv = panelHit.P.uvFromIntersection(panelHit.h);
            panelHit.P.pointerMove(p.id, uv);
            setHover(p, -1);
            input.showRay(p, panelHit.h.distance);
            if (p.selectStart) {
                panelHit.P.pointerDown(p.id, uv);
                s.mode = 'panelPress';
                s.panel = panelHit.P;
                if (controls) controls.enabled = false;
            }
            if (p.kind === 'mouse' && p.wheel && panelHit.P.scroll) panelHit.P.scroll(p.id, uv, p.wheel);
            return;
        }
        leavePanel(p, s);
        setHover(p, faceFirst ? face.tag : -1);
        input.showRay(p, faceFirst ? face.distance : (p.kind === 'controller' ? 1.2 : null));
        if (p.selectStart) {
            s.mode = 'press';
            s.pressT = now;
            s.pressPos = p.anchor.clone();
            s.pressDir = p.ray.direction.clone();
            s.pressTag = faceFirst ? face.tag : -1;
            if (controls && p.kind === 'mouse' && s.pressTag >= 0) controls.enabled = false;
        }
    }

    const hovers = new Map();
    function setHover(p, tag) {
        hovers.set(p.id, tag);
        let h = -1;
        for (const v of hovers.values()) if (v >= 0) h = v;
        callbacks.onHover(h);
    }

    function tap(p, s, tag, now) {
        if (p.kind === 'mouse') {
            if (tag >= 0) callbacks.onTap(tag); else callbacks.onTapEmpty();
            return;
        }
        if (tag >= 0 && s.lastTap.tag === tag && now - s.lastTap.t < DOUBLE_MS) {
            s.lastTap = { t: 0, tag: -9 };
            callbacks.onDoubleTap(tag);
            p.haptic(0.6, 30);
            return;
        }
        s.lastTap = { t: now, tag };
        if (tag >= 0) { callbacks.onTap(tag); p.haptic(0.35, 16); }
        else callbacks.onTapEmpty();
    }

    function sticks(ps, dt) {
        for (const p of ps) {
            if (p.kind !== 'controller') continue;
            const [x, y] = p.axes;
            if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) continue;
            if (inside()) {
                // Fly along the gaze.
                const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(tmpQ));
                callbacks.onFly(dir.multiplyScalar(y * 0.6 * dt), true);
            } else {
                const k = Math.exp(-y * dt * 1.2);
                const s = THREE.MathUtils.clamp(ballRoot.scale.x * k, 0.04, 0.6);
                ballRoot.scale.setScalar(s);
                ballRoot.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), x * dt * 1.6);
                callbacks.onBallMoved && callbacks.onBallMoved();
            }
        }
    }

    return { update, get grabbing() { return grabbers().length > 0; } };
}
