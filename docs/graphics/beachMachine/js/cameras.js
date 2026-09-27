// Cameras for the beach machine: the Glass House machine's rig (orbit, chase,
// ride) with the beach's named views, a chase view that circles the palm with
// a ball riding the spiral lift, a chase view that follows a ball down into
// the tunnels, and a tour director that knows the beach's routes.
import { CameraRig } from '../../ballMachine/js/render/cameras.js';

export const PRESETS = {
  overview:   { pos: [1.4, 5.9, 10.0], target: [-0.3, 2.3, -1.6], label: 'Whole machine' },
  crown:      { pos: [2.5, 5.9, 2.4], target: [0.5, 4.8, -0.1], label: 'Flip-flops' },
  lift:       { pos: [1.5, 2.9, 1.9], target: [0.0, 2.4, -0.24], label: 'Palm-tree lift' },
  marimba:    { pos: [2.6, 4.9, 5.4], target: [0.8, 4.2, 2.7], label: 'Boardwalk marimba' },
  wheel:      { pos: [0.9, 3.6, 6.6], target: [-0.6, 3.6, 4.85], label: 'Ferris wheel' },
  lighthouse: { pos: [-0.2, 3.4, 6.1], target: [-2.05, 2.9, 3.85], label: 'Lighthouse' },
  bells:      { pos: [-1.1, 3.4, 2.7], target: [-3.35, 3.1, 0.0], label: 'Steel band' },
  loop:       { pos: [5.4, 4.0, 0.1], target: [3.1, 4.0, 1.2], label: 'Curling wave' },
  funnel:     { pos: [5.0, 3.9, 4.6], target: [3.35, 2.8, 3.05], label: 'Conch' },
  waterslide: { pos: [6.6, 4.3, 0.9], target: [3.6, 3.4, -2.25], label: 'Tide pool slide' },
  dune:       { pos: [5.0, 3.1, 0.9], target: [3.3, 2.2, -1.6], label: 'Dune tunnel' },
  whirlpool:  { pos: [3.2, 2.85, 0.35], target: [2.1, 1.9, -1.45], label: 'Tide pool' },
  castle:     { pos: [0.6, 4.4, -0.3], target: [-3.0, 2.9, -3.8], label: 'Sandcastle' },
  keep:       { pos: [-0.8, 3.9, -1.7], target: [-3.0, 3.2, -3.8], label: 'Helter-skelter' },
  moat:       { pos: [-0.7, 2.7, -1.3], target: [-2.5, 1.6, -3.2], label: 'Moat' },
  gong:       { pos: [2.0, 5.0, -0.5], target: [0.0, 4.5, -2.5], label: 'Sand pail' },
  shipbell:   { pos: [2.2, 3.1, -1.6], target: [0.3, 2.9, -3.9], label: 'Ship’s bell' },
  sea:        { pos: [3.4, 2.1, 6.6], target: [-1.5, 1.4, -12], label: 'The sea' },
};


export function makeRig(camera, dom, env, tunnels) {
  const f = {};
  // a ball in a tunnel: ride along inside it a little way behind the ball
  const adjust = (b, want, look) => {
    if (b.mode !== 'track') return false;
    const list = tunnels.get(b.track);
    if (!list) return false;
    const t = b.track;
    for (const tn of list) {
      if (b.s < tn.s0 - 0.35 || b.s > tn.s1 + 0.05) continue;
      const s = Math.max(0, b.s - 0.3);
      t.sample(s, f);
      const up = tn.body.axis + 0.025;
      want.set(f.px + f.ux * up, f.py + f.uy * up, f.pz + f.uz * up);
      look.set(b.p.x, b.p.y + 0.01, b.p.z);
      return true;
    }
    return false;
  };
  const rig = new CameraRig(camera, dom, env, { presets: PRESETS, adjust });
  rig.controls.maxDistance = 17;
  rig.controls.minDistance = 0.5;
  return rig;
}

// Circle the trunk with a ball on the spiral lift, looking in through the slot.
export function liftChaseView(lift) {
  lift.chaseView = (b, want) => {
    const e = b.slot, phi = lift.phiLoad + (e?.a ?? 0);
    const rx = Math.cos(phi), rz = -Math.sin(phi), tx = -Math.sin(phi), tz = -Math.cos(phi);
    want.set(lift.cx + rx * 0.95 - tx * 0.35, b.p.y + 0.22, lift.cz + rz * 0.95 - tz * 0.35);
  };
}

// The director picks a ball or a feature about to do something worth seeing
// and cuts between chase, ride and the named views.
export class TourDirector {
  constructor(rig, machine) {
    this.rig = rig; this.machine = machine;
    this.timer = 0; this.shotLen = 9; this.pending = null; this.active = false; this.shot = '';
    this.rand = Math.random;
  }
  start(style = 'mix') {
    this.style = style;
    this.active = true; this.timer = 0; this.clock = 0;
    this.pending = null; this.waitTop = null; this.due = []; this.recent = [];
    if (style === 'follow') { this._follow(this._freshBall()); return; }
    if (style === 'features') { this.queue = [{ kind: 'preset', name: 'overview', len: 8 }]; this._next(); return; }
    this.queue = [{ kind: 'preset', name: 'overview', len: 11 }, { kind: 'top', mode: 'ride', len: 22 }, { kind: 'preset', name: 'castle', len: 9 }];
    this._next();
  }
  stop() { this.active = false; this.waitTop = null; }
  _home(b) { return !b || (b.mode === 'track' && b.track === this.machine.collector) || (b.mode === 'carried' && b.carrier.kind === 'lift'); }
  _freshBall() {
    const balls = this.machine.world.balls;
    const b = this.lastTop != null && balls.find((x) => x.id === this.lastTop);
    if (b && !this._home(b)) return b;
    return balls.find((x) => x.branch && !this._home(x)) || null;
  }
  _follow(b) {
    this.waitTop = null;
    if (!b) { this.waitTop = { kind: 'follow' }; this.timer = 0; this.shot = 'waiting at the top of the palm'; this.rig.flyTo('crown'); return; }
    this.followBall = b; this.idleT = 0;
    this.rig.controls.autoRotate = false;
    this.rig.setMode('chase', b);
    this.shot = `following ball ${b.id}`;
  }
  _expect(name, delay, len, pri = 1) { this.due.push({ name, at: this.clock + delay, len, pri }); }
  _anticipate(e) {
    switch (e.type) {
      case 'switch':
        if (e.name === 'F2') this._expect(e.out ? 'bells' : 'marimba', e.out ? 1.2 : 5.5, 10);
        else if (e.name === 'F6') this._expect(e.out ? 'waterslide' : 'loop', e.out ? 3.5 : 1.0, e.out ? 11 : 6);
        else if (e.name === 'F4' && !e.out) this._expect('keep', 4.0, 11);
        break;
      case 'funnelEnter': if (e.name === 'conch') this._expect('funnel', 0, 12, 2); break;
      case 'splash': this._expect('whirlpool', 0, 7, 2); break;
      case 'bucket': if (e.count === 2) this._expect('gong', 0, 12, 3); break;
      case 'wheel': this._expect('wheel', 0, 7); break;
    }
  }
  onEvent(e) {
    if (e.type === 'top') this.lastTop = e.ball;
    if (!this.active) return;
    if (this.style === 'follow') { if (e.type === 'top' && this.waitTop) this._follow(this.machine.world.balls.find((x) => x.id === e.ball)); return; }
    if (this.style === 'features') { this._anticipate(e); return; }
    if (e.type === 'top' && this.waitTop) {
      const b = this.machine.world.balls.find((x) => x.id === e.ball);
      if (b) { const w = this.waitTop; this.waitTop = null; this._cut({ kind: w.mode, ball: b, len: w.len }); }
      return;
    }
    if (e.type === 'bucket' && e.count === 2) this.pending = { kind: 'preset', name: 'gong', len: 12 };
    else if (e.type === 'lane' && this.rand() < 0.5) this.pending = { kind: 'preset', name: 'marimba', len: 9 };
    else if (e.type === 'switch' && (e.name === 'F6' || e.name === 'F4') && e.out === (e.name === 'F6' ? 1 : 0) && this.rand() < 0.55) {
      // a ball heading for a water slide: go down it with the ball
      const b = this.machine.world.balls.find((x) => x.id === e.ball);
      if (b) this.pending = { kind: this.rand() < 0.6 ? 'ride' : 'chase', ball: b, len: 18 };
    } else if (e.type === 'top' && this.rand() < 0.2) {
      const b = this.machine.world.balls.find((x) => x.id === e.ball);
      if (b) this.pending = { kind: this.rand() < 0.5 ? 'ride' : 'chase', ball: b, len: 16 };
    }
  }
  update(dt) {
    if (!this.active) return;
    this.timer += dt; this.clock += dt;
    if (this.style === 'follow') {
      if (!this.waitTop && this._home(this.followBall)) { this.waitTop = { kind: 'follow' }; this.timer = 0; }
      if (this.waitTop && this.timer > 4) this._follow(this._freshBall());
      const fb = this.followBall;
      this.idleT = fb && fb.speed < 0.05 ? this.idleT + dt : 0;
      if (!this.waitTop && this.idleT > 6) this._follow(this._freshBall() !== fb ? this._freshBall() : null);
      return;
    }
    if (this.style === 'features') {
      this.due = this.due.filter((d) => this.clock - d.at < 4);
      const ready = this.due.filter((d) => d.at <= this.clock && (d.pri >= 3 ? d.name !== this.recent[0] : !this.recent.slice(0, 3).includes(d.name)))
        .sort((a, b) => b.pri - a.pri || a.at - b.at);
      if (ready.length && this.timer > (ready[0].pri >= 3 ? 3.5 : 6)) {
        this.due.splice(this.due.indexOf(ready[0]), 1);
        this._featureCut(ready[0]);
      } else if (this.timer > this.shotLen) {
        const order = ['crown', 'castle', 'marimba', 'bells', 'waterslide', 'lift', 'loop', 'moat', 'funnel', 'wheel', 'dune', 'lighthouse', 'shipbell', 'whirlpool', 'keep', 'sea', 'overview'];
        const next = order.find((n) => !this.recent.includes(n)) ?? order[Math.floor(this.rand() * order.length)];
        this._featureCut({ name: next, len: 10 });
      }
      return;
    }
    if (this.waitTop) { if (this.timer > 8) { this.waitTop = null; this._next(); } return; }
    if (this.pending && this.timer > 4) { this._cut(this.pending); this.pending = null; return; }
    if (this.timer > this.shotLen) this._next();
  }
  _featureCut(d) {
    this.recent.unshift(d.name); this.recent.length = Math.min(this.recent.length, 8);
    this._cut({ kind: 'preset', name: d.name, len: d.len });
  }
  _next() {
    const q = this.queue?.shift();
    if (q) {
      if (q.kind === 'top') { this.waitTop = q; this.timer = 0; this.shot = 'waiting at the top of the palm'; this.rig.flyTo('crown'); return; }
      return this._cut(q);
    }
    const balls = this.machine.world.balls;
    if (this.rand() < 0.35) {
      const moving = balls.filter((b) => b.mode === 'track' && b.speed > 0.4 && b.branch);
      if (moving.length) return this._cut({ kind: this.rand() < 0.55 ? 'chase' : 'ride', ball: moving[Math.floor(this.rand() * moving.length)], len: 11 });
    }
    const names = Object.keys(PRESETS);
    this._cut({ kind: 'preset', name: names[Math.floor(this.rand() * names.length)], len: 8 });
  }
  _cut(shot) {
    this.timer = 0; this.shotLen = shot.len;
    this.shot = shot.kind === 'preset' ? shot.name : `${shot.kind} ball ${shot.ball.id}`;
    if (shot.kind === 'preset') { this.rig.flyTo(shot.name); this.rig.controls.autoRotate = true; }
    else { this.rig.controls.autoRotate = false; this.rig.setMode(shot.kind, shot.ball); }
  }
}
