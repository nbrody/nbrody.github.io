// The beach machine: a spiral lift inside a palm tree, a tree of flip-flops
// under its fronds, six routes down, and a return channel carved round the
// sand mound at the palm's foot that feeds the lift.
//
// Plan convention (see path.js): x east, z south, headings in degrees
// counter-clockwise from east (90 = north, 270 = south). The sea is to the north.
//
// The physics engine (tracks, balls, flumes, funnels, the whirlpool, the
// wheel, the tipping bucket, flip-flops) is the Glass House Ball Machine's; so
// are the Boardwalk, Steel Band, Surf and Sand Pail routes' skeletons, which
// keep its tuned geometry. The lift, the Sandcastle and the Tide Pool are new.

import { PathBuilder } from '../../../ballMachine/js/sim/path.js';
import { Track } from '../../../ballMachine/js/sim/track.js';
import { World, Ball } from '../../../ballMachine/js/sim/world.js';
import { FlipFlop, Funnel, Pool, Wheel, TipBucket, BarRun } from '../../../ballMachine/js/sim/devices.js';
import { BoxCollider } from '../../../ballMachine/js/sim/colliders.js';
import { BALL } from '../../../ballMachine/js/sim/constants.js';
import { pent, ROW } from '../../../ballMachine/js/sim/music.js';
import { deg } from '../../../ballMachine/js/sim/math.js';
import { predictFlight, probe, probeTrack, probeFrom, placeMelodyTimed, queueBalls, rescue } from '../../../ballMachine/js/sim/layout.js';
import { SpiralLift, SteelPan, ShipBell } from './devices.js';
import { SHANTY_I, SHANTY_II } from './music.js';

export { rescue };
const R = BALL.R;

export const BRANCHES = {
  top:       { name: 'Flip-flop switches', color: '#8a4fbf', short: 'Crown' },
  marimba:   { name: 'Boardwalk Marimba', color: '#e56b1f', short: 'Boardwalk', blurb: 'A sand sieve tames the ball; a flip-flop sends it down one of two boardwalks whose planks are a marimba — lane I plays the call of “Drunken Sailor”, lane II the answer — then a ball-driven Ferris wheel and a spiral of tines round the lighthouse.' },
  bells:     { name: 'Steel Band',        color: '#e8b406', short: 'Steel Band', blurb: 'Nine switchback ramps slung between two surfboards. At every turn the ball flies off the end, strikes a steel pan and drops to the ramp below — a descending pentatonic calypso.' },
  daredevil: { name: 'Surf’s Up',         color: '#e0314b', short: 'Surf', blurb: 'A plunge into a loop inside a curling wave, a surfboard ski jump, a sea-grass brake, round and round a conch-shell vortex, two bass pans, and home through a tunnel in the sand.' },
  water:     { name: 'Tide Pool Slide',   color: '#119fc4', short: 'Tide Pool', blurb: 'Tuned bottles play “Row, Row, Row Your Boat”; then a water slide spirals round a young palm, dives into a tunnel through the dune and shoots out into a whirlpool dug in the sand.' },
  castle:    { name: 'Sandcastle',        color: '#c7862e', short: 'Sandcastle', blurb: 'A helter-skelter water slide spirals four times round the keep, ringing its chimes, bursts through the curtain wall, rides the current round the moat, and drains through a tunnel in the sand.' },
  gong:      { name: 'Sand Pail',         color: '#1d9e6c', short: 'Sand Pail', blurb: 'A toy pail on a see-saw waits for three balls, tips, and fires them down a spiral chute under a beach umbrella at a brass ship’s bell.' },
  collector: { name: 'Return channel',    color: '#b08a55', short: 'Return' },
};

// The palm: its axis, and the spiral lift inside the trunk. The helix starts
// at the east point of the trunk (entered from the feed) and after 5¾ turns
// hands the ball out of the trunk heading east at (0, 4.92, 0).
export const PALM = { cx: 0, cz: -0.235, r: 0.235, yLoad: 1.08, yRelease: 4.92, turns: 5.75, bars: 2, trunkR: 0.3, top: 6.25 };
// The return channel: a ring round the sand mound at the palm's foot, falling
// gently from RING.T0 to RING.T1 (degrees, anticlockwise from east).
export const RING = { R: 1.38, T0: -62, T1: 270, Y0: 1.44, G: 0.024 };
export const ringY = (thDeg) => RING.Y0 - RING.G * RING.R * (thDeg - RING.T0) * deg;
export const CASTLE = { cx: -3.0, cz: -3.8, base: 1.7, keepR: 0.5, keepTop: 4.6, wallR: 1.1, wallTop: 2.3, towerR: 0.24, towerTop: 2.72, moatR: 1.55, plinthR: 1.8, turretR: 0.2, turretTop: 4.8, turretAt: 270, towers: [40, 130, 220, 310] };
export const TIDEPOOL = { palm: { x: 3.6, z: -2.25 } };

export function buildMachine(opts = {}) {
  const world = new World(opts.seed ?? 7);
  const tracks = {};
  const devices = {};
  const columns = [];     // support columns for helices: {x,z,y0,y1,r,branch,kind}
  const warnings = [];

  const make = (name, pb, o = {}) => {
    warnings.push(...pb.warnings.map((w) => `${name}: ${w}`));
    const t = new Track(pb.points(), { name, ...o });
    if (!t.caged && !t.flume?.tube && t.minFn < 2.5) warnings.push(`${name}: crest — normal force ${t.minFn.toFixed(1)} m/s² at s=${t.minFnS.toFixed(2)} (v=${t.vnom[Math.round(t.minFnS / t.ds)].toFixed(2)})`);
    if (!t.caged && !t.flume && t.maxLat > 1.2) warnings.push(`${name}: lateral/normal ${t.maxLat.toFixed(2)} at s=${t.maxLatS.toFixed(2)}`);
    world.addTrack(t);
    tracks[name] = t;
    return t;
  };
  const PB = (p, heading, grade = 0) => new PathBuilder(p.x, p.y, p.z, heading, grade);
  const endPose = (t) => {
    const e = t.end, T = t.endTangent();
    return { p: e, heading: Math.atan2(-T.z, T.x) / deg, grade: -T.y / Math.hypot(T.x, T.z) };
  };
  const from = (t) => { const e = endPose(t); return PB(e.p, e.heading, e.grade); };

  // ---------------------------------------------------------------- the palm-tree lift
  const lift = new SpiralLift(world, { cx: PALM.cx, cz: PALM.cz, r: PALM.r, yLoad: PALM.yLoad, yRelease: PALM.yRelease, turns: PALM.turns, bars: PALM.bars, speed: opts.liftSpeed ?? 0.25 });
  world.addDevice(lift);
  devices.lift = lift;
  const rel = lift.releasePoint;

  // ---------------------------------------------------------------- crown: flip-flop tree
  const exit = make('exit', PB(rel, 0, 0.035).straight(0.42), { branch: 'top', v0: lift.omega * lift.r, bank: 'none' });
  lift.exit = exit;
  const f1a = make('f1a', from(exit).turn(0.36, -90).straight(0.3), { branch: 'top', v0: exit.vEnd });
  const f1b = make('f1b', from(exit).turn(0.36, 90).straight(0.3), { branch: 'top', v0: exit.vEnd });
  const F1 = world.addDevice(new FlipFlop(world, { name: 'F1', input: exit, outs: [f1a, f1b], labels: ['south', 'north'] }));

  // F2 (south): steel band (west) / boardwalk (south)
  const bellArm0 = make('bellArm0', from(f1a).turn(0.4, -90), { branch: 'bells', v0: f1a.vEnd });
  const marArm0 = make('marArm0', from(f1a).straight(0.15), { branch: 'marimba', v0: f1a.vEnd });
  const F2 = world.addDevice(new FlipFlop(world, { name: 'F2', input: f1a, outs: [marArm0, bellArm0], labels: ['boardwalk', 'steel band'] }));

  // F3 (north): F6 (east: surf / tide pool) / F4 (west: sandcastle / sand pail)
  const darArm0 = make('darArm0', from(f1b).turn(0.4, -90), { branch: 'top', v0: f1b.vEnd });
  const f3b = make('f3b', from(f1b).turn(0.4, 90).straight(0.25), { branch: 'top', v0: f1b.vEnd });
  const F3 = world.addDevice(new FlipFlop(world, { name: 'F3', input: f1b, outs: [darArm0, f3b], labels: ['east', 'west'] }));

  const cArm0 = make('cArm0', from(f3b).turn(0.5, 25).turn(0.5, -25), { branch: 'castle', v0: f3b.vEnd });
  const gongArm0 = make('gongArm0', from(f3b).turn(0.4, -90), { branch: 'gong', v0: f3b.vEnd });
  const F4 = world.addDevice(new FlipFlop(world, { name: 'F4', input: f3b, outs: [cArm0, gongArm0], labels: ['sandcastle', 'sand pail'] }));

  // ---------------------------------------------------------------- return channel round the mound
  const { R: RING_R, T0: RING_T0, T1: RING_T1, G: RING_G } = RING;
  const ringPoint = (thDeg) => ({ x: RING_R * Math.cos(thDeg * deg), y: ringY(thDeg), z: -RING_R * Math.sin(thDeg * deg) });
  const r0 = ringPoint(RING_T0);
  const collectorPB = PB(r0, RING_T0 + 90, RING_G).turn(RING_R, RING_T1 - RING_T0);
  const lp = lift.loadPoint;
  collectorPB.connectTo(lp.x, lp.y, lp.z, 90, { r: 0.42, gEnd: 0.03, trans: 0.3 });
  const ringLen = RING_R * (RING_T1 - RING_T0) * deg;
  const collector = make('collector', collectorPB, {
    branch: 'collector', kind: 'trough', v0: 0.3, bank: 'none', mu: 0.019, caged: true,
    endStop: { e: 0.15, sound: 'click' }, startStop: { e: 0.2 },
    capture: { s0: 0, s1: ringLen + 0.1, lat: 0.065, e: 0.25, bounceAbove: 0.9, sound: 'thud' },
  });
  lift.feed = collector;
  const ringS = (thDeg) => RING_R * (thDeg - RING_T0) * deg;
  // branches join the channel tangentially, like a railway merge
  const toRing = (name, pb, thDeg, branch, o = {}) => {
    const p = ringPoint(thDeg);
    pb.connectTo(p.x, p.y, p.z, thDeg + 90, { r: o.r ?? 0.45, gEnd: RING_G });
    const t = make(name, pb, { branch, ...o });
    t.next = { track: collector, s: ringS(thDeg) };
    t.meta.merge = thDeg;
    return t;
  };

  // ================================================================ BOARDWALK MARIMBA (south)
  const hopper = new Funnel(world, { name: 'sieve', cx: 0.95, cz: 1.42, yRim: 4.73, rOut: 0.3, rHole: 0.045, depth: 0.22, mu: 0.05 });
  world.addSurface(hopper); world.addDevice(hopper); devices.hopperM = hopper;
  const hopEntry = { x: hopper.cx + 0.285, y: hopper.hy(0.285), z: hopper.cz };
  const marArm = make('marArm', from(marArm0).connectTo(hopEntry.x, hopEntry.y, hopEntry.z, 270, { r: 0.3, gEnd: 0.02 }), { branch: 'marimba', v0: marArm0.vEnd });
  marArm0.connect(marArm);
  hopper.attachEntry(marArm);
  const holeY = hopper.hy(hopper.rHole);
  const feeder = make('marFeed', PB({ x: hopper.cx, y: holeY - 0.1, z: hopper.cz - 0.07 }, 270, 0.04).straight(0.5), {
    branch: 'marimba', v0: 0.15, bank: 'none', startStop: { e: 0.2 },
    capture: { s0: 0, s1: 0.3, lat: 0.04, e: 0.25 },
  });
  const LANE_G = opts.laneGrade ?? 0.019;
  const laneI = make('laneI', from(feeder).grade(LANE_G, 0.2).turn(0.35, -90).straight(1.45).turn(0.5, 180).straight(1.1).turn(0.35, -90), { branch: 'marimba', v0: feeder.vEnd, meta: { lane: 'I' } });
  const laneII = make('laneII', from(feeder).grade(LANE_G, 0.2).turn(0.35, 90).straight(1.45).turn(0.5, -180).straight(1.1).turn(0.35, 90), { branch: 'marimba', v0: feeder.vEnd, meta: { lane: 'II' } });
  const F5 = world.addDevice(new FlipFlop(world, { name: 'F5', input: feeder, outs: [laneI, laneII], labels: ['lane I', 'lane II'] }));
  const mergeP = { x: hopper.cx, y: Math.min(laneI.end.y, laneII.end.y) - 0.07, z: laneI.end.z + 0.95 };
  const mergeI = make('laneIend', from(laneI).connectTo(mergeP.x, mergeP.y, mergeP.z, 270, { r: 0.35 }), { branch: 'marimba', v0: laneI.vEnd });
  const mergeII = make('laneIIend', from(laneII).connectTo(mergeP.x, mergeP.y, mergeP.z, 270, { r: 0.35 }), { branch: 'marimba', v0: laneII.vEnd });
  laneI.connect(mergeI); laneII.connect(mergeII);
  // the Ferris wheel, turned by the balls riding in its gondolas
  const wheel = new Wheel(world, { cx: -0.6, cy: 3.72, cz: 4.85, axis: { x: 0, z: -1 }, radius: 0.4, pockets: 8, loadAngle: 100 * deg, dumpAngle: 250 * deg });
  world.addDevice(wheel); devices.wheel = wheel;
  const wLoad = wheel.pointAt(wheel.loadAngle);
  const wheelFeed = make('wheelFeed', PB(mergeP, 270, 0.03).connectTo(wLoad.x, wLoad.y, wLoad.z, 180, { r: 0.4, gEnd: 0.03 }), {
    branch: 'marimba', v0: Math.max(mergeI.vEnd, mergeII.vEnd), endStop: { e: 0.2, sound: 'clunk' },
  });
  mergeI.connect(wheelFeed); mergeII.connect(wheelFeed);
  wheel.feed = wheelFeed;
  const wDump = wheel.pointAt(wheel.dumpAngle);
  // the lighthouse: a spiral of glockenspiel tines round its tower
  const GX = -2.05, GZ = 3.85, GR = 0.55;
  const wheelOut = make('wheelOut', PB({ x: wDump.x, y: wDump.y - 0.02, z: wDump.z }, 180, 0.06).straight(0.15).connectTo(GX, wDump.y - 0.12, GZ + GR, 180, { r: 0.45, gEnd: 0.08 }), { branch: 'marimba', v0: 0.25 });
  wheel.exit = wheelOut;
  const glock = make('glockHelix', from(wheelOut).grade(0.12, 0.3).helix(GR, 2.25, -1), { branch: 'marimba', v0: wheelOut.vEnd, meta: { column: { x: GX, z: GZ, r: GR } } });
  wheelOut.connect(glock);
  columns.push({ x: GX, z: GZ, y0: 0, y1: wDump.y + 0.1, r: 0.2, branch: 'marimba', kind: 'lighthouse' });
  // a second sieve right above the return channel: the ball drops straight in
  const m2p = { x: 2.05 * Math.cos(236 * deg), z: -2.05 * Math.sin(236 * deg) };
  const hopper2 = new Funnel(world, { name: 'sieve2', cx: m2p.x, cz: m2p.z, yRim: 1.74, rOut: 0.27, rHole: 0.045, depth: 0.2, mu: 0.05 });
  world.addSurface(hopper2); world.addDevice(hopper2); devices.hopperM2 = hopper2;
  const h2Entry = { x: hopper2.cx - 0.255, y: hopper2.hy(0.255), z: hopper2.cz };
  const marOut = make('marOut', from(glock).connectTo(h2Entry.x, h2Entry.y, h2Entry.z, 90, { r: 0.45, gEnd: 0.03 }), { branch: 'marimba', v0: glock.vEnd });
  glock.connect(marOut);
  hopper2.attachEntry(marOut);
  const h2y = hopper2.hy(hopper2.rHole) - 0.1;
  const m2dir = { x: Math.cos(236 * deg), z: -Math.sin(236 * deg) }; // outward
  toRing('marDrop', PB({ x: m2p.x + 0.07 * m2dir.x, y: h2y, z: m2p.z + 0.07 * m2dir.z }, 236 + 180 - 25, 0.06).straight(0.2), 258, 'marimba', {
    v0: 0.2, r: 0.35, startStop: { e: 0.2 },
    capture: { s0: 0, s1: 0.25, lat: 0.045, e: 0.25 },
  });

  // ================================================================ STEEL BAND (west)
  const LX = -3.35, LEN = 0.95, LVL = 9, DY = 0.30, RG = 0.08;
  const bellArm = make('bellArm', from(bellArm0).straight(0.2).connectTo(LX, 4.7, 0.46, 90, { r: 0.6, gEnd: RG }), { branch: 'bells', v0: bellArm0.vEnd });
  bellArm0.connect(bellArm);
  const panNotes = [86, 83, 81, 78, 76, 74, 71, 69, 66];
  let prev = bellArm;
  devices.pans = [];
  const zS = 0.46, zN = zS - LEN;
  for (let i = 0; i < LVL; i++) {
    const north = i % 2 === 0;
    const y0 = 4.7 - i * (RG * LEN + DY) - (i ? 0.02 * RG : 0);
    const z0 = north ? zS + (i ? 0.02 : 0) : zN - 0.02;
    const ramp = make(`bellRamp${i}`, PB({ x: LX, y: y0, z: z0 }, north ? 90 : 270, RG).straight(LEN + (i ? 0.02 : 0)), {
      branch: 'bells', v0: i ? 0.3 : bellArm.vEnd, bank: 'none',
      capture: i ? { s0: 0, s1: 0.4, lat: 0.04, e: 0.28, bounceAbove: 0.5 } : null,
      meta: { ladder: i },
    });
    if (i === 0) prev.connect(ramp);
    if (i < LVL - 1) {
      const e = ramp.end, dir = north ? -1 : 1;
      // a pan hung face-on at the end of the ramp: the ball strikes it and drops back onto the ramp below
      const pan = new SteelPan(world, {
        name: `pan${i}`, midi: panNotes[i], r: 0.085,
        center: { x: LX, y: e.y + 0.015, z: e.z + dir * 0.055 }, normal: { x: 0, y: 0, z: -dir },
        hang: { x: LX, y: e.y + 0.16, z: e.z + dir * 0.07 }, e: 0.45, vref: 1.6,
      });
      world.addDevice(pan); devices.pans.push(pan);
    }
    prev = ramp;
  }
  const bellOut = toRing('bellOut', from(prev).turn(0.5, -90), 178, 'bells', { v0: prev.vEnd });
  prev.connect(bellOut);

  // ================================================================ SURF'S UP (south-east)
  const darArm = make('darArm', from(darArm0).straight(0.85), { branch: 'daredevil', v0: darArm0.vEnd });
  darArm0.connect(darArm);
  const plungePB = from(darArm).grade(0.55, 0.55).turn(0.75, -90).straight(0.25).grade(0.0, 0.9).straight(1.1);
  const plunge = make('plunge', plungePB, { branch: 'daredevil', v0: darArm.vEnd });
  darArm.connect(plunge);
  // the loop-the-loop, inside a curling wave
  const loopT = make('loop', from(plunge).straight(0.15).loop(0.26, 0.16).straight(0.1), { branch: 'daredevil', v0: plunge.vEnd, caged: true, render: { cage: true } });
  plunge.connect(loopT);
  const jump = make('jump', from(loopT).straight(0.3).grade(-0.5, 0.26).straight(0.02), { branch: 'daredevil', v0: loopT.vEnd });
  loopT.connect(jump);
  const flight = predictFlight(jump, 0.14);
  const landDir = norm2(flight.vel.x, flight.vel.z);
  const landHeading = Math.atan2(-landDir.z, landDir.x) / deg;
  const landGrade = Math.min(0.75, -flight.vel.y / Math.hypot(flight.vel.x, flight.vel.z) * 0.85);
  const landStart = { x: flight.p.x - landDir.x * 0.6, y: flight.p.y - 0.01 + landGrade * 0.6, z: flight.p.z - landDir.z * 0.6 };
  devices.jumpInfo = { flight, landHeading, landGrade };
  // the conch: a hyperbolic "gravity well" funnel with an upturned lip
  const funnel = new Funnel(world, { name: 'conch', cx: 3.35, cz: 3.05, yRim: 3.2, rOut: 0.6, rHole: 0.05, depth: 0.42, mu: 0.012, lip: { r0: 0.48, height: 0.1 } });
  world.addSurface(funnel); world.addDevice(funnel); devices.funnel = funnel;
  const fEntry = { x: funnel.cx + 0.585, y: funnel.hy(0.585), z: funnel.cz };
  // after the landing the ball pushes through a brake of sea-grass bristles, so
  // it reaches the conch at a speed the conch can hold
  const landPB = PB(landStart, landHeading, landGrade).straight(1.0).grade(0.06, 0.6).connectTo(fEntry.x, fEntry.y, fEntry.z, 90, { r: 0.45, gEnd: 0.03 });
  const landRamp = make('landing', landPB, {
    branch: 'daredevil', v0: Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z) * 0.92,
    capture: { s0: 0, s1: 1.3, lat: 0.1, e: 0.18, bounceAbove: 1.3 },
    render: { guard: [0, 1.0] },
  });
  landRamp.brake = { s0: landRamp.L - 1.15, s1: landRamp.L - 0.25, rate: opts.brakeRate ?? 3.4 };
  funnel.attachEntry(landRamp);
  // two bass pans below the conch, placed by probing the real physics
  const holeP = { x: funnel.cx, y: funnel.hy(funnel.rHole), z: funnel.cz };
  const t1 = 15 * deg;
  const drum1 = world.addDevice(new SteelPan(world, { name: 'bass1', center: { x: holeP.x, y: holeP.y - 0.5, z: holeP.z }, normal: { x: -Math.sin(t1), y: Math.cos(t1), z: 0 }, r: 0.16, midi: 50, e: 0.7, vref: 3 }));
  world.finalize();
  const pr1 = probe(world, { x: holeP.x, y: holeP.y - 0.015, z: holeP.z }, { x: 0, y: -0.4, z: 0 }, (p, v) => v.y < 0 && p.y < drum1.center.y - 0.24);
  const t2 = 22 * deg;
  const drum2C = { x: pr1.p.x - 0.02, y: pr1.p.y - R - 0.01, z: pr1.p.z };
  const drum2 = world.addDevice(new SteelPan(world, { name: 'bass2', center: drum2C, normal: { x: -Math.sin(t2), y: Math.cos(t2), z: 0 }, r: 0.19, midi: 43, e: 0.55, vref: 3 }));
  world.finalize();
  const pr2 = probe(world, { x: holeP.x, y: holeP.y - 0.015, z: holeP.z }, { x: 0, y: -0.4, z: 0 }, (p, v) => v.y < 0 && p.y < drum2C.y - 0.22);
  devices.drum1 = drum1; devices.drum2 = drum2;
  devices.drumPath = [pr1.path, pr2.path];
  const cp = pr2.p;
  const cv = norm2(pr2.v.x, pr2.v.z);
  const catchHeading = Math.atan2(-cv.z, cv.x) / deg;
  const darCatchPB = PB({ x: cp.x - cv.x * 0.25, y: cp.y - 0.01, z: cp.z - cv.z * 0.25 }, catchHeading, 0.05).straight(0.45);
  toRing('darCatch', darCatchPB, -50, 'daredevil', {
    kind: 'trough', v0: 0.6,
    capture: { s0: 0, s1: 0.7, lat: 0.1, e: 0.2, bounceAbove: 1.5, sound: 'thud' },
  });
  columns.push({ x: funnel.cx, z: funnel.cz, y0: 0, y1: drum2C.y - 0.2, r: 0.05, branch: 'daredevil', skip: true });

  // ================================================================ TIDE POOL SLIDE (north-east)
  // F6 splits the surf arm: straight on to the plunge, or left past a row of
  // tuned bottles to the head of a flume that spirals down round a young palm,
  // dives into a tunnel through the dune, and shoots into a whirlpool dug in
  // the sand at the dune's end.
  const wsArm0 = make('wsArm0', from(darArm0).turn(0.4, 90), { branch: 'water', v0: darArm0.vEnd });
  const F6 = world.addDevice(new FlipFlop(world, { name: 'F6', input: darArm0, outs: [darArm, wsArm0], labels: ['surf', 'tide pool'] }));
  const WS = { x: TIDEPOOL.palm.x, z: TIDEPOOL.palm.z, r: 1.0 };
  const wsGlass = make('wsGlass', from(wsArm0).grade(0.012, 0.2).straight(1.34).turn(0.45, -90).straight(1.395), { branch: 'water', v0: wsArm0.vEnd });
  wsArm0.connect(wsGlass);
  // open flume: three and a quarter turns down round the palm
  const column = { x: WS.x, z: WS.z, r: WS.r, step: 0.9 };
  const wsHelix = make('wsHelix', from(wsGlass).grade(0.12, 0.5).helix(WS.r, 3.25, -1), {
    branch: 'water', kind: 'flume', v0: wsGlass.vEnd, flume: { u0: 0.5 }, meta: { column },
  });
  wsGlass.connect(wsHelix);
  const pool = new Pool(world, { name: 'pool', cx: 2.1, cz: -1.45, yRim: 1.77, rOut: 0.45, rHole: 0.045, depth: 0.08, cone: 0.12 });
  world.addSurface(pool); world.addDevice(pool); devices.pool = pool;
  // the tube through the dune: a drop that shoots the ball in along the
  // pool's south side, so it goes round the whirlpool
  const tubeEnd = { x: pool.cx + 0.12, y: pool.ySurf + 0.075, z: pool.cz + 0.38 };
  const wsTube = make('wsTube', from(wsHelix).connectTo(tubeEnd.x, tubeEnd.y, tubeEnd.z, 165, { r: 0.5, gEnd: 0.08 }), {
    branch: 'water', kind: 'flume', v0: wsHelix.vEnd,
    flume: { tube: true, u0: wsHelix.flume.uEnd, beta0: wsHelix.flume.betaEnd, tau0: wsHelix.flume.tauEnd },
    meta: { tunnel: true },
  });
  wsHelix.connect(wsTube);
  devices.waterSlide = { palm: WS, head: wsHelix.start, glass: wsGlass, flumes: [wsHelix, wsTube], pool };
  // down the drain, then home through the sand to the return channel
  const outDir = { x: Math.cos(205 * deg), z: -Math.sin(205 * deg) };
  const drainY = pool.hy(pool.rHole) - 0.1;
  const wsOut = toRing('wsOut', PB({ x: pool.cx - 0.07 * outDir.x, y: drainY, z: pool.cz - 0.07 * outDir.z }, 205, 0.06).straight(0.25), 52, 'water', {
    v0: 0.2, r: 0.45, startStop: { e: 0.2 },
    capture: { s0: 0, s1: 0.3, lat: 0.045, e: 0.25 },
  });
  devices.waterSlide.out = wsOut;

  // ================================================================ SANDCASTLE (north-west)
  // A helter-skelter flume winds anticlockwise down round the keep, ringing
  // the keep's chimes, breaks out through the curtain wall, and runs into the
  // moat, a channel dug round the castle's plinth whose current carries the
  // ball two hundred degrees round. A sluice lets it into a tunnel through
  // the sand that joins the return channel.
  const C = CASTLE;
  const HR = 0.72, HG = 0.15, HTURNS = 3.875;
  const helixTop = { x: C.cx, y: 4.35, z: C.cz - HR };        // north point, heading west
  const cArm = make('cArm', from(cArm0).straight(0.2).connectTo(helixTop.x, helixTop.y, helixTop.z, 180, { r: 0.5, gEnd: 0.05 }), { branch: 'castle', v0: cArm0.vEnd });
  cArm0.connect(cArm);
  const keepColumn = { x: C.cx, z: C.cz, r: HR, step: 0.8 };
  const cHelix = make('cHelix', from(cArm).grade(HG, 0.5).helix(HR, HTURNS, 1), {
    branch: 'castle', kind: 'flume', v0: cArm.vEnd, flume: { u0: 0.5 }, meta: { column: keepColumn },
  });
  cArm.connect(cHelix);
  // Out of the helix the flume dives into a culvert through the plinth: it
  // unwinds through two wider arcs (a transition curve, so the ball riding
  // high on the outer wall settles back down rather than swinging across),
  // runs straight out under the curtain wall, then bends left onto the moat's
  // circle — every bend turning the same way as the
  // helix and the moat. The last arc's centre O lies GTR to the left of the
  // straight, and the arc meets the moat tangentially when |CO| = moatR − GTR.
  const GTR = 0.75;
  const gatePB = from(cHelix).grade(0.14, 0.3).turn(0.95, 25).turn(1.4, 20);
  const gp = gatePB.pose(), gh = gp.heading * deg;
  const hx = Math.cos(gh), hn = Math.sin(gh);                      // heading (east, north)
  const ax = gp.x - C.cx + GTR * -hn, an = -(gp.z - C.cz) + GTR * hx; // O at L1 = 0, relative to C
  const co = C.moatR - GTR, bq = ax * hx + an * hn;
  const gL1 = -bq + Math.sqrt(bq * bq - (ax * ax + an * an - co * co));
  const oAng = Math.atan2(an + gL1 * hn, ax + gL1 * hx) / deg;
  const gA = ((oAng + 90 - gp.heading) % 360 + 360) % 360;        // how far the last arc turns (deg)
  const cGate = make('cGate', gatePB.straight(gL1).grade(0.03, 0.4).turn(GTR, gA), {
    branch: 'castle', kind: 'flume', v0: cHelix.vEnd,
    flume: { tube: true, u0: cHelix.flume.uEnd, beta0: cHelix.flume.betaEnd, tau0: cHelix.flume.tauEnd },
    meta: { tunnel: true },
  });
  cHelix.connect(cGate);
  const gEnd = cGate.end;
  const MOAT_IN = Math.atan2(-(gEnd.z - C.cz), gEnd.x - C.cx) / deg, MOAT_OUT = 310;
  const MOAT_SPAN = ((MOAT_OUT - MOAT_IN) % 360 + 360) % 360;
  const moat = make('moat', from(cGate).grade(0.02, 0.1).turn(C.moatR, MOAT_SPAN), {
    branch: 'castle', kind: 'flume', v0: cGate.vEnd,
    flume: { Rc: 0.1, rim: 1.35, q: 0.005, u0: cGate.flume.uEnd, beta0: cGate.flume.betaEnd, tau0: cGate.flume.tauEnd },
    meta: { moat: true, open: true },
  });
  cGate.connect(moat);
  const cDrain = toRing('cDrain', from(moat).straight(0.12), 130, 'castle', { v0: moat.vEnd, r: 0.45 });
  moat.connect(cDrain);
  devices.castle = { ...C, helix: cHelix, gate: cGate, moat, drain: cDrain, flumes: [cHelix, cGate, moat] };
  // the keep's chimes: tubular chimes hung round the keep, rung as the ball passes
  const chimes = [];
  const nC = 12;
  for (let i = 0; i < nC; i++) chimes.push({ s: 0.9 + i * (cHelix.L - 1.6) / (nC - 1), midi: pent(11 - i, 62) });
  devices.chimes = world.addDevice(new BarRun(world, cHelix, chimes, { name: 'Keep chimes', kind: 'chimes', instrument: 'chime', gain: 0.6 }));

  // ================================================================ SAND PAIL (north)
  const bucket = new TipBucket(world, { pivot: { x: -0.1, y: 4.62, z: -2.3 }, dir: { x: 0, z: -1 }, Lb: 0.36, cap: 3 });
  world.addDevice(bucket); devices.bucket = bucket;
  const feedEnd = bucket._rot(bucket.slotLocal(bucket.cap - 1).d - 0.07, bucket.yOff, {});
  const gongArm = make('gongArm', from(gongArm0).connectTo(feedEnd.x, feedEnd.y, feedEnd.z, 90, { r: 0.4, gEnd: 0.02 }), { branch: 'gong', v0: gongArm0.vEnd });
  gongArm0.connect(gongArm);
  gongArm.onEnd = (b, w, over) => bucket.receive(b, w, over);
  bucket.feed = gongArm;
  const lip = bucket.lipPoint(bucket.dumpAngle);
  const GCX = 0.9, GCZ = -3.3, GCR = 0.6;
  const chutePB = PB(lip, 90, Math.tan(bucket.dumpAngle)).straight(0.06).connectTo(GCX - GCR, 4.12, GCZ, 90, { r: 0.3, gEnd: 0.17, trans: 0.25 }).helix(GCR, -2.0, 1).grade(0.0, 0.9).straight(0.3);
  const chute = make('chute', chutePB, { branch: 'gong', v0: 0.25 });
  bucket.chute = chute;
  columns.push({ x: GCX, z: GCZ, y0: 0, y1: 4.2, r: 0.035, branch: 'gong', kind: 'umbrella' });
  const bellAt = { x: chute.end.x, y: chute.end.y + 0.14, z: chute.end.z - 0.28 };
  const shipBell = world.addDevice(new ShipBell(world, { hang: bellAt, r: 0.15, height: 0.3, midi: 50, axis: { x: 1, y: 0, z: 0 } }));
  devices.shipBell = shipBell;
  const gongC = { x: chute.end.x, y: chute.end.y + 0.02, z: chute.end.z - 0.17 };
  const gongCatch = toRing('gongCatch', PB({ x: gongC.x, y: gongC.y - 0.62, z: gongC.z + 0.06 }, 270, 0.07).straight(0.55), 66, 'gong', {
    kind: 'trough', v0: 0.4,
    capture: { s0: 0, s1: 0.75, lat: 0.2, e: 0.2, bounceAbove: 1.2, sound: 'thud' },
    render: { wide: 0.2 },
  });
  devices.gongCatch = gongCatch;

  // ---------------------------------------------------------------- music
  const beat = opts.beat ?? 0.4;
  // Time the lanes with a probe ball dropped from the sieve's outlet through
  // the real physics, so the planks land exactly on the beat.
  world.finalize();
  const holeStart = { x: hopper.cx, y: hopper.hy(hopper.rHole) - 0.015, z: hopper.cz };
  const timeI = probeTrack(world, holeStart, { x: 0, y: -0.4, z: 0 }, laneI, () => { F5.lock = 0; }, () => { F5.lock = null; F5.state = 0; });
  const timeII = probeTrack(world, holeStart, { x: 0, y: -0.4, z: 0 }, laneII, () => { F5.lock = 1; }, () => { F5.lock = null; F5.state = 0; });
  const barsI = placeMelodyTimed(timeI, SHANTY_I, beat, 0.4);
  const barsII = placeMelodyTimed(timeII, SHANTY_II, beat, 0.4);
  for (const [nm, bars, lane] of [['I', barsI, laneI], ['II', barsII, laneII]]) {
    if (bars.short) warnings.push(`lane ${nm} too short: ${bars.short} notes missing (L=${lane.L.toFixed(2)}, t=${lane.tEnd.toFixed(2)}s, v ${lane.v0.toFixed(2)}→${lane.vEnd.toFixed(2)})`);
  }
  devices.marimbaI = world.addDevice(new BarRun(world, laneI, barsI, { name: 'Boardwalk I — “What shall we do with a drunken sailor?”', kind: 'marimba' }));
  devices.marimbaII = world.addDevice(new BarRun(world, laneII, barsII, { name: 'Boardwalk II — “…early in the morning”', kind: 'marimba' }));
  // the bottles: a probe ball from the top of the lift, switched onto the
  // tide pool route, finds where the ball will be on each eighth note
  const tGlass = probeFrom(world, exit, 0.001, exit.v0, wsGlass,
    () => { F1.lock = 1; F3.lock = 0; F6.lock = 1; },
    () => { for (const ff of [F1, F3, F6]) { ff.lock = null; ff.state = 0; ff.angle = ff.targetAngle(); ff.angVel = 0; } });
  const glassNotes = placeMelodyTimed(tGlass, ROW, opts.glassEighth ?? 0.17, 0.3);
  if (glassNotes.short) warnings.push(`bottles: ${glassNotes.short} notes missing (L=${wsGlass.L.toFixed(2)})`);
  devices.glasses = world.addDevice(new BarRun(world, wsGlass, glassNotes, { name: 'Bottles', kind: 'glasses', instrument: 'glass', gain: 0.85 }));
  const tines = [];
  const nT = 15;
  for (let i = 0; i < nT; i++) tines.push({ s: 0.4 + i * (glock.L - 0.8) / (nT - 1), midi: pent(i, 74) });
  devices.tines = world.addDevice(new BarRun(world, glock, tines, { name: 'Lighthouse tines', kind: 'tines', instrument: 'glock', gain: 0.65 }));

  // the sand: strays land, bounce and roll before being gathered up
  world.addCollider(new BoxCollider({
    center: { x: 0, y: -0.05, z: 0 }, axes: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
    half: [7, 0.05, 7], e: 0.2, mu: 0.5, tag: 'floor', instrument: 'thud', gain: 0.6, vref: 3,
  }));

  // ---------------------------------------------------------------- balls
  const nBalls = opts.balls ?? 30;
  for (let i = 0; i < nBalls; i++) world.balls.push(new Ball(i + 1, BALL_COLORS[i % BALL_COLORS.length], (i % 15) + 1));
  queueBalls(world, collector, world.balls);
  world.lostHandler = (b, w) => { rescue(w, collector, b); };
  world.finalize();

  const flipflops = { F1, F2, F3, F4, F5, F6 };
  const routes = {
    marimba: [[F1, 0], [F2, 0]],
    bells: [[F1, 0], [F2, 1]],
    daredevil: [[F1, 1], [F3, 0], [F6, 0]],
    water: [[F1, 1], [F3, 0], [F6, 1]],
    castle: [[F1, 1], [F3, 1], [F4, 0]],
    gong: [[F1, 1], [F3, 1], [F4, 1]],
  };
  const tag = { F2: ['marimba', 'bells'], F4: ['castle', 'gong'], F6: ['daredevil', 'water'] };
  for (const [name, arr] of Object.entries(tag)) {
    flipflops[name].onRoute = (b, k, w) => { if (arr[k]) { b.branch = arr[k]; w.info('branch', { ball: b.id, branch: arr[k] }); } };
  }
  F5.onRoute = (b, k, w) => w.info('lane', { ball: b.id, lane: k ? 'II' : 'I' });

  return { world, tracks, devices, flipflops, routes, lift, collector, columns, warnings, ringPoint, RING, BRANCHES };

  function norm2(x, z) { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; }
}

// Beach balls: each is striped in its own colour and white.
export const BALL_COLORS = [
  0xe8332c, 0x2a6fd6, 0xf5c518, 0x21a35b, 0xf07a1c, 0x8a4fbf, 0x16a6b8, 0xe0457b,
  0xe8332c, 0x2a6fd6, 0xf5c518, 0x21a35b, 0xf07a1c, 0x8a4fbf, 0x16a6b8,
];
