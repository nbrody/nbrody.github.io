// WebXR input: tracked hands and controllers, reduced to one state object per hand.
//   pinching / pinchStart / pinchEnd — thumb-index pinch (hands) or trigger (controllers)
//   pos, quat   — smoothed pinch point (for drawing) and hand orientation
//   grip        — smoothed point on the palm (for grabbing): unlike the pinch point it stays put while the
//                 fingers close or open, so starting or ending a pinch doesn't nudge what you hold
//   tip         — index fingertip (for poking panels); for controllers, a point just ahead of the controller
//   palmToward  — how squarely the palm faces the head (hands only), for the palm-up menu
//   rayOrigin / rayDir — controller pointing ray (null for hands)
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// A pinch starts after the fingertips stay within PINCH_ON for ON_FRAMES frames and ends after they stay
// apart beyond PINCH_OFF for OFF_FRAMES frames, so tracking flicker doesn't start or break a pinch.
const PINCH_ON = 0.02, PINCH_OFF = 0.034, ON_FRAMES = 3, OFF_FRAMES = 2;

function makeState(side) {
  return {
    side, present: false, isHand: false, pinching: false, pinchStart: false, pinchEnd: false,
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), grip: new THREE.Vector3(), tip: new THREE.Vector3(), tipValid: false,
    palmCenter: new THREE.Vector3(), palmNormal: new THREE.Vector3(), palmToward: 0,
    rayOrigin: null, rayDir: null, squeezeStart: false, _inited: false, _trigger: false, _squeeze: false,
  };
}

export class XRInput {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.hands = { left: makeState('left'), right: makeState('right') };
    this.slots = [];
    const handFactory = new XRHandModelFactory();
    const ctrlFactory = new XRControllerModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      const slot = { controller, grip, hand, source: null, handModel: null };
      grip.add(ctrlFactory.createControllerModel(grip));
      slot.handModel = handFactory.createHandModel(hand, 'mesh');
      hand.add(slot.handModel);
      controller.addEventListener('connected', e => { slot.source = e.data; });
      controller.addEventListener('disconnected', () => { slot.source = null; });
      controller.addEventListener('selectstart', () => { slot.trigger = true; });
      controller.addEventListener('selectend', () => { slot.trigger = false; });
      controller.addEventListener('squeezestart', () => { slot.squeezeEdge = true; });
      scene.add(controller, grip, hand);
      this.slots.push(slot);
    }
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._u = new THREE.Vector3();
  }

  setHandModelsVisible(v) { for (const s of this.slots) s.handModel.visible = v; }

  update(headPos) {
    for (const st of Object.values(this.hands)) { st.present = false; st.pinchStart = st.pinchEnd = false; st.squeezeStart = false; }
    for (const slot of this.slots) {
      const src = slot.source;
      if (!src || (src.handedness !== 'left' && src.handedness !== 'right')) continue;
      const st = this.hands[src.handedness];
      if (src.hand) this._updateHand(st, slot, headPos);
      else this._updateController(st, slot);
    }
    for (const st of Object.values(this.hands)) if (!st.present && st.pinching) { st.pinching = false; st.pinchEnd = true; }
  }

  _updateHand(st, slot, headPos) {
    const J = slot.hand.joints;
    const thumb = J['thumb-tip'], index = J['index-finger-tip'], wrist = J.wrist;
    const imc = J['index-finger-metacarpal'], pmc = J['pinky-finger-metacarpal'], mprox = J['middle-finger-phalanx-proximal'];
    if (!thumb || !index || !wrist || !thumb.visible || !index.visible) return;
    st.present = true;
    st.isHand = true;
    st.rayOrigin = st.rayDir = null;
    const d = thumb.position.distanceTo(index.position);
    const was = st.pinching;
    if (!was) { st._on = d < PINCH_ON ? (st._on || 0) + 1 : 0; st.pinching = st._on >= ON_FRAMES; }
    else { st._off = d > PINCH_OFF ? (st._off || 0) + 1 : 0; st.pinching = st._off < OFF_FRAMES; }
    if (st.pinching !== was) st._on = st._off = 0;
    st.pinchStart = !was && st.pinching;
    st.pinchEnd = was && !st.pinching;
    const target = this._v.copy(thumb.position).add(index.position).multiplyScalar(0.5);
    const gripTarget = this._u.copy(wrist.position).add(mprox && mprox.visible ? mprox.position : index.position).multiplyScalar(0.5);
    if (!st._inited || st.pinchStart) { st.pos.copy(target); st.quat.copy(wrist.quaternion); st.grip.copy(gripTarget); st._inited = true; }
    else { st.pos.lerp(target, 0.55); st.quat.slerp(wrist.quaternion, 0.35); st.grip.lerp(gripTarget, 0.5); }
    st.tip.copy(index.position);
    st.tipValid = true;
    if (imc && pmc && imc.visible && pmc.visible) {
      const a = this._u.copy(imc.position).sub(wrist.position);
      const b = this._w.copy(pmc.position).sub(wrist.position);
      st.palmNormal.crossVectors(a, b).normalize();
      if (st.side === 'left') st.palmNormal.negate();
      st.palmCenter.copy(wrist.position).add(mprox && mprox.visible ? mprox.position : imc.position).multiplyScalar(0.5);
      if (headPos) {
        const toHead = this._v.copy(headPos).sub(st.palmCenter).normalize();
        st.palmToward = st.palmNormal.dot(toHead);
      }
    }
  }

  _updateController(st, slot) {
    const c = slot.controller;
    st.present = true;
    st.isHand = false;
    const was = st.pinching;
    st.pinching = !!slot.trigger;
    st.pinchStart = !was && st.pinching;
    st.pinchEnd = was && !st.pinching;
    st.squeezeStart = !!slot.squeezeEdge;
    slot.squeezeEdge = false;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(c.quaternion);
    const target = this._w.copy(c.position).addScaledVector(fwd, 0.05);
    if (!st._inited || st.pinchStart) { st.pos.copy(target); st.quat.copy(c.quaternion); st._inited = true; }
    else { st.pos.lerp(target, 0.7); st.quat.slerp(c.quaternion, 0.6); }
    st.grip.copy(st.pos);
    st.tip.copy(c.position).addScaledVector(fwd, 0.07);
    st.tipValid = true;
    st.rayOrigin = (st.rayOrigin || new THREE.Vector3()).copy(c.position);
    st.rayDir = (st.rayDir || new THREE.Vector3()).copy(fwd);
    st.palmToward = 0;
  }
}
