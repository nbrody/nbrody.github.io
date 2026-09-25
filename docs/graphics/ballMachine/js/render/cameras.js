// Camera modes: orbit the whole machine, chase a ball, ride on a ball, or let
// the director drive: follow one ball after another down their routes, cut
// from feature to feature as things are about to happen, or (the tour) mix
// the two.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
const FLAT = new THREE.Vector3(), WANT = new THREE.Vector3();

export const PRESETS = {
  overview:  { pos: [6.1, 3.7, 6.5], target: [0, 2.45, 0.3], label: 'Whole machine' },
  crown:     { pos: [2.2, 5.6, 2.4], target: [0.6, 4.7, 0.0], label: 'Crown switches' },
  marimba:   { pos: [2.6, 4.9, 5.4], target: [0.8, 4.2, 2.7], label: 'Marimba lanes' },
  bells:     { pos: [-1.2, 3.3, 2.6], target: [-3.35, 3.1, 0.0], label: 'Bell tower' },
  loop:      { pos: [5.4, 3.9, 0.2], target: [3.1, 3.9, 1.2], label: 'Loop & jump' },
  funnel:    { pos: [5.0, 3.9, 4.6], target: [3.35, 2.8, 3.05], label: 'Vortex funnel' },
  plinko:    { pos: [-2.2, 2.9, -1.2], target: [-2.45, 2.7, -3.15], label: 'Plinko case' },
  gong:      { pos: [1.9, 2.7, -2.2], target: [0.3, 2.9, -4.3], label: 'Gong bucket' },
  wheel:     { pos: [0.9, 3.5, 6.5], target: [-0.6, 3.6, 4.85], label: 'Ball wheel' },
  lift:      { pos: [1.6, 1.6, 1.8], target: [0.17, 1.4, 0.0], label: 'Lift & return' },
  waterslide: { pos: [5.9, 3.6, 0.2], target: [3.3, 3.2, -2.1], label: 'Water slide' },
  whirlpool: { pos: [3.1, 2.55, 0.1], target: [2.1, 1.85, -1.45], label: 'Whirlpool' },
};

export class CameraRig {
  constructor(camera, dom, env) {
    this.camera = camera;
    this.env = env;
    this.mode = 'orbit';
    this.ball = null;
    this.controls = new OrbitControls(camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 13;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.target.set(...PRESETS.overview.target);
    camera.position.set(...PRESETS.overview.pos);
    this.fly = null;               // preset fly-to animation
    this.dir = new THREE.Vector3(1, 0, 0);
    this.hdir = new THREE.Vector3(1, 0, 0);
    this.camUp = new THREE.Vector3(0, 1, 0);
    this.smoothPos = new THREE.Vector3().copy(camera.position);
    this.smoothLook = new THREE.Vector3();
    this.baseFov = camera.fov;
    this.onModeChange = null;
  }

  setMode(mode, ball) {
    if (ball) this.ball = ball;
    const prev = this.mode;
    this.mode = mode;
    this.controls.enabled = mode === 'orbit';
    if (mode === 'orbit' && prev !== 'orbit') {
      // resume orbiting around what we were looking at
      const look = this.camera.getWorldDirection(tmp).multiplyScalar(2).add(this.camera.position);
      this.controls.target.copy(look);
      this.camera.up.set(0, 1, 0);
    }
    if (mode !== 'orbit') {
      this.smoothPos.copy(this.camera.position);
      this.camera.getWorldDirection(tmp);
      this.smoothLook.copy(this.camera.position).addScaledVector(tmp, 1);
    }
    this.camera.near = mode === 'ride' ? 0.004 : 0.02;
    this.camera.updateProjectionMatrix();
    this.onModeChange?.(mode);
  }

  flyTo(name) {
    const p = PRESETS[name];
    if (!p) return;
    if (this.mode !== 'orbit') this.setMode('orbit');
    this.fly = {
      t: 0, dur: 1.6,
      p0: this.camera.position.clone(), t0: this.controls.target.clone(),
      p1: new THREE.Vector3(...p.pos), t1: new THREE.Vector3(...p.target),
    };
  }

  // fly to look at a point from `dist` metres, keeping the current bearing
  flyToPoint(target, dist = 2.2) {
    if (this.mode !== 'orbit') this.setMode('orbit');
    const t1 = new THREE.Vector3(target.x, target.y, target.z);
    const dir = this.camera.position.clone().sub(t1);
    dir.y = Math.max(0.25, dir.y / Math.max(0.001, dir.length()) * 0.7 + 0.25);
    dir.normalize();
    const p1 = t1.clone().addScaledVector(dir, dist);
    this.fly = { t: 0, dur: 1.5, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1, t1 };
  }

  update(dt) {
    const cam = this.camera;
    if (this.mode === 'orbit') {
      if (this.fly) {
        const f = this.fly;
        f.t += dt / f.dur;
        const k = f.t >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * f.t);
        cam.position.lerpVectors(f.p0, f.p1, k);
        // arc the camera up a little mid-flight
        cam.position.y += Math.sin(Math.PI * k) * 0.8;
        this.controls.target.lerpVectors(f.t0, f.t1, k);
        if (f.t >= 1) this.fly = null;
      }
      this.controls.update();
      this._clamp(cam.position);
      this._fov(this.baseFov, dt);
      return;
    }
    const b = this.ball;
    if (!b) return;
    const p = tmp3.set(b.p.x, b.p.y, b.p.z);
    // smoothed direction of travel
    const sp = b.speed;
    if (b.mode === 'carried') {
      tmp.set(b.vel.x, 0, b.vel.z);
      if (tmp.lengthSq() < 1e-4) tmp.set(p.x + 0.4, 0, p.z + 0.3).normalize(); // riding up: look out over the machine
    } else tmp.set(b.vel.x, b.vel.y, b.vel.z);
    if (tmp.lengthSq() > 0.0025) {
      tmp.normalize();
      const k = 1 - Math.exp(-dt * (this.mode === 'ride' ? 7 : 3.5));
      this.dir.lerp(tmp, k).normalize();
    }
    if (this.mode === 'chase') {
      const back = b.mode === 'carried' ? 0.55 : 0.38 + Math.min(0.5, sp * 0.1);
      // trail behind the ball's horizontal heading (kept through vertical drops)
      const hs = Math.hypot(b.vel.x, b.vel.z);
      if (hs > 0.12) {
        FLAT.set(b.vel.x / hs, 0, b.vel.z / hs);
        this.hdir.lerp(FLAT, 1 - Math.exp(-dt * 3)).normalize();
      }
      const want = WANT.copy(p).addScaledVector(this.hdir, -back);
      want.y += 0.15 + Math.min(0.15, sp * 0.03) + Math.max(0, -b.vel.y) * 0.08;
      if (b.mode === 'carried') {
        // riding a mechanism: hold a steady three-quarter view close to the ball
        const k = b.carrier.kind === 'lift' ? 0.42 : 0.55;
        want.set(p.x + k * 0.8, p.y + 0.06, p.z + k * 0.6);
      }
      const k = 1 - Math.exp(-dt * 5);
      this.smoothPos.lerp(want, k);
      const look = tmp2.copy(p).addScaledVector(this.dir, 0.25);
      this.smoothLook.lerp(look, 1 - Math.exp(-dt * 9));
      cam.position.copy(this.smoothPos);
      this._clamp(cam.position);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.smoothLook);
      this._fov(this.baseFov + Math.min(14, sp * 3), dt);
    } else if (this.mode === 'ride') {
      // sit on top of the ball, lean with the track's banking
      const bu = tmp2.set(b.up.x, b.up.y, b.up.z);
      if (b.mode !== 'track' && b.mode !== 'surface') bu.set(0, 1, 0);
      this.camUp.lerp(bu, 1 - Math.exp(-dt * 4)).normalize();
      const eye = tmp.copy(p).addScaledVector(this.camUp, 0.034).addScaledVector(this.dir, -0.05);
      cam.position.copy(eye);
      cam.up.copy(this.camUp);
      const look = tmp2.copy(eye).addScaledVector(this.dir, 1);
      cam.lookAt(look);
      this._fov(74 + Math.min(16, sp * 4), dt);
    }
  }

  _fov(target, dt) {
    const cam = this.camera;
    const f = cam.fov + (target - cam.fov) * (1 - Math.exp(-dt * 3));
    if (Math.abs(f - cam.fov) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  _clamp(p) {
    const rMax = (this.env?.interiorRadius ?? 13.5) - 0.8;
    const r = Math.hypot(p.x, p.z);
    if (r > rMax) { p.x *= rMax / r; p.z *= rMax / r; }
    if (p.y < 0.35) p.y = 0.35;
    const top = (this.env?.domeHeight ?? 18) - 1.5;
    if (p.y > top) p.y = top;
  }
}

// The tour director picks a ball or a device that is about to do something
// worth seeing, and cuts between chase, ride and preset views.
export class TourDirector {
  constructor(rig, machine) {
    this.rig = rig;
    this.machine = machine;
    this.timer = 0;
    this.shotLen = 9;
    this.pending = null;
    this.active = false;
    this.shot = '';
    this.rand = Math.random;
  }
  // style: 'mix' (the tour), 'follow' (one ball after another, all the way
  // down) or 'features' (feature to feature, never riding a ball)
  start(style = 'mix') {
    this.style = style;
    this.active = true; this.timer = 0; this.clock = 0;
    this.pending = null; this.waitTop = null; this.due = []; this.recent = [];
    if (style === 'follow') { this.queue = null; this._follow(this._freshBall()); return; }
    if (style === 'features') { this.queue = [{ kind: 'preset', name: 'overview', len: 8 }]; this._next(); return; }
    // opening: establishing orbit, then ride the next ball off the lift
    this.queue = [{ kind: 'preset', name: 'overview', len: 11 }, { kind: 'top', mode: 'ride', len: 22 }, { kind: 'preset', name: 'marimba', len: 9 }];
    this._next();
  }
  stop() { this.active = false; this.waitTop = null; }

  // ---- follow a ball: chase it all the way home, then take the next one off the lift
  _home(b) { return !b || (b.mode === 'track' && b.track === this.machine.collector) || (b.mode === 'carried' && b.carrier.kind === 'lift'); }
  _freshBall() {
    // the ball that most recently left the top of the lift and is still on its way down
    const balls = this.machine.world.balls;
    const b = this.lastTop != null && balls.find((x) => x.id === this.lastTop);
    if (b && !this._home(b)) return b;
    return balls.find((x) => x.branch && !this._home(x)) || null;
  }
  _follow(b) {
    this.waitTop = null;
    if (!b) { this.waitTop = { kind: 'follow' }; this.timer = 0; this.shot = 'waiting at the top of the lift'; this.rig.flyTo('crown'); return; }
    this.followBall = b; this.idleT = 0;
    this.rig.controls.autoRotate = false;
    this.rig.setMode('chase', b);
    this.shot = `following ball ${b.id}`;
  }

  // ---- feature to feature: cut to where something is about to happen
  _expect(name, delay, len, pri = 1) { this.due.push({ name, at: this.clock + delay, len, pri }); }
  _anticipate(e) {
    switch (e.type) {
      case 'switch':
        if (e.name === 'F2') this._expect(e.out ? 'bells' : 'marimba', e.out ? 1.2 : 5.5, 10);
        else if (e.name === 'F6') this._expect(e.out ? 'waterslide' : 'loop', e.out ? 3.5 : 1.0, e.out ? 11 : 6);
        else if (e.name === 'F4' && !e.out) this._expect('plinko', 6.5, 9);
        break;
      case 'funnelEnter': if (e.name === 'vortex') this._expect('funnel', 0, 12, 2); break;
      case 'splash': this._expect('whirlpool', 0, 7, 2); break;
      case 'bucket': if (e.count === 2) this._expect('gong', 0, 12, 3); break;
      case 'wheel': this._expect('wheel', 0, 7); break;
    }
  }
  _featureCut(d) {
    this.recent.unshift(d.name); this.recent.length = Math.min(this.recent.length, 6);
    this._cut({ kind: 'preset', name: d.name, len: d.len });
  }

  onEvent(e) {
    if (e.type === 'top') this.lastTop = e.ball;
    if (!this.active) return;
    if (this.style === 'follow') {
      if (e.type === 'top' && this.waitTop) this._follow(this.machine.world.balls.find((x) => x.id === e.ball));
      return;
    }
    if (this.style === 'features') { this._anticipate(e); return; }
    if (e.type === 'top' && this.waitTop) {
      const b = this.machine.world.balls.find((x) => x.id === e.ball);
      if (b) { const w = this.waitTop; this.waitTop = null; this._cut({ kind: w.mode, ball: b, len: w.len }); }
      return;
    }
    // interesting moments get priority
    if (e.type === 'bucket' && e.count === 2) this.pending = { kind: 'preset', name: 'gong', len: 12 };
    else if (e.type === 'lane' && this.rand() < 0.6) this.pending = { kind: 'preset', name: 'marimba', len: 9 };
    else if (e.type === 'switch' && e.name === 'F6' && e.out === 1 && this.rand() < 0.55) {
      // a ball is heading for the water slide: go down it with the ball
      const b = this.machine.world.balls.find((x) => x.id === e.ball);
      if (b) this.pending = { kind: this.rand() < 0.6 ? 'ride' : 'chase', ball: b, len: 17 };
    }
    else if (e.type === 'top' && this.rand() < 0.25) {
      const b = this.machine.world.balls.find((x) => x.id === e.ball);
      if (b) this.pending = { kind: this.rand() < 0.5 ? 'ride' : 'chase', ball: b, len: 16 };
    }
  }
  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    this.clock += dt;
    if (this.style === 'follow') {
      // home again (or back on the lift): pick up the next ball to leave the top
      if (!this.waitTop && this._home(this.followBall)) { this.waitTop = { kind: 'follow' }; this.timer = 0; }
      if (this.waitTop && this.timer > 4) this._follow(this._freshBall());
      // waiting a long time (say, in the gong bucket for two more balls)? find livelier company
      const fb = this.followBall;
      this.idleT = fb && fb.speed < 0.05 ? this.idleT + dt : 0;
      if (!this.waitTop && this.idleT > 6) this._follow(this._freshBall() !== fb ? this._freshBall() : null);
      return;
    }
    if (this.style === 'features') {
      // a shot runs at least 6 s (3.5 s if the gong is about to tip), and a
      // feature seen in the last three shots waits its turn unless it's the gong
      this.due = this.due.filter((d) => this.clock - d.at < 4);
      const ready = this.due.filter((d) => d.at <= this.clock && (d.pri >= 3 ? d.name !== this.recent[0] : !this.recent.slice(0, 3).includes(d.name)))
        .sort((a, b) => b.pri - a.pri || a.at - b.at);
      if (ready.length && this.timer > (ready[0].pri >= 3 ? 3.5 : 6)) {
        this.due.splice(this.due.indexOf(ready[0]), 1);
        this._featureCut(ready[0]);
      } else if (this.timer > this.shotLen) {
        const order = ['crown', 'marimba', 'bells', 'waterslide', 'loop', 'funnel', 'wheel', 'plinko', 'gong', 'whirlpool', 'lift', 'overview'];
        const next = order.find((n) => !this.recent.includes(n)) ?? order[Math.floor(this.rand() * order.length)];
        this._featureCut({ name: next, len: 10 });
      }
      return;
    }
    if (this.waitTop) { if (this.timer > 8) { this.waitTop = null; this._next(); } return; }
    if (this.pending && this.timer > 4) { this._cut(this.pending); this.pending = null; return; }
    if (this.timer > this.shotLen) this._next();
  }
  _next() {
    const q = this.queue?.shift();
    if (q) {
      if (q.kind === 'top') { this.waitTop = q; this.timer = 0; this.shot = 'waiting at the top of the lift'; this.rig.flyTo('crown'); return; }
      return this._cut(q);
    }
    const r = this.rand();
    const balls = this.machine.world.balls;
    if (r < 0.35) {
      const moving = balls.filter((b) => b.mode === 'track' && b.speed > 0.4 && b.branch);
      if (moving.length) return this._cut({ kind: this.rand() < 0.55 ? 'chase' : 'ride', ball: moving[Math.floor(this.rand() * moving.length)], len: 11 });
    }
    const names = ['overview', 'crown', 'marimba', 'bells', 'loop', 'funnel', 'waterslide', 'whirlpool', 'plinko', 'gong', 'wheel', 'lift'];
    const name = names[Math.floor(this.rand() * names.length)];
    this._cut({ kind: 'preset', name, len: 8 });
  }
  _cut(shot) {
    this.timer = 0;
    this.shotLen = shot.len;
    this.shot = shot.kind === 'preset' ? shot.name : `${shot.kind} ball ${shot.ball.id}`;
    if (shot.kind === 'preset') {
      this.rig.flyTo(shot.name);
      this.rig.controls.autoRotate = true;
    } else {
      this.rig.controls.autoRotate = false;
      this.rig.setMode(shot.kind, shot.ball);
    }
  }
}
