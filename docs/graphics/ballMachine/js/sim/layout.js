// The machine: a chain lift in the middle of a round plinth, a tree of
// flip-flops at the crown, six routes down, and a return trough ringing the
// pedestal that feeds the lift.
//
// Plan convention (see path.js): x east, z south, headings in degrees
// counter-clockwise from east (90 = north, 270 = south).

import { PathBuilder } from './path.js';
import { Track } from './track.js';
import { World, Ball } from './world.js';
import { ChainLift, FlipFlop, Funnel, Pool, Wheel, TipBucket, Bell, Drum, Gong, Plinko, BarRun } from './devices.js';
import { BoxCollider } from './colliders.js';
import { BALL } from './constants.js';
import { pent, ODE_I, ODE_II, ROW, placeMelody } from './music.js';
import { deg } from './math.js';

const R = BALL.R;

export const BRANCHES = {
  top:       { name: 'Crown switches', color: '#7b4bb3', short: 'Crown' },
  marimba:   { name: 'Marimba Run',      color: '#e2711d', short: 'Marimba', blurb: 'A hopper tames the ball; a flip-flop sends it down one of two marimba lanes — lane I plays the call of “Ode to Joy”, lane II the answer — then a ball-driven wheel and a glockenspiel spiral.' },
  bells:     { name: 'Bell Tower',       color: '#e3b505', short: 'Bells', blurb: 'Nine switchback ramps. At every turn the ball strikes a bronze bell and drops to the level below — a descending pentatonic peal.' },
  daredevil: { name: 'Daredevil',        color: '#d1263b', short: 'Daredevil', blurb: 'A banked plunge into a loop-the-loop, a ski jump across open air, the gravity-well funnel, then two tom-toms on the way out.' },
  water:     { name: 'Water Slide',      color: '#15a9c6', short: 'Water', blurb: 'Tuned water glasses play “Row, Row, Row Your Boat”, then down the stream: a flume spiralling round the pump’s riser, a glass tunnel, and a splash into a whirlpool.' },
  plinko:    { name: 'Glockenspiel Plinko', color: '#2b62c9', short: 'Plinko', blurb: 'A spiral, a hopper, then a glass case of tuned steel pegs: every bounce is a note, every run a new tune.' },
  gong:      { name: 'Gong Bucket',      color: '#1f9a6a', short: 'Gong', blurb: 'A counterweighted trough waits for three balls, tips, and fires them down a spiral chute at a big bronze gong.' },
  collector: { name: 'Return trough',    color: '#9a6a3a', short: 'Return' },
};

export const LIFT = { cx: 0, cz: 0, yB: 0.9, yT: 5.1, rs: 0.1, out: 0.075, loadY: 1.08, releaseY: 4.92 };
export const PEDESTAL = { r: 1.62, top: 0.95 };

export function buildMachine(opts = {}) {
  const world = new World(opts.seed ?? 7);
  const tracks = {};
  const devices = {};
  const columns = [];     // decorative/support columns for helices etc. {x,z,y0,y1,r,color}
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

  // ---------------------------------------------------------------- lift
  const lift = new ChainLift(world, { ...LIFT, ax: 1, az: 0, spacing: 0.5, speed: opts.liftSpeed ?? 0.35 });
  world.addDevice(lift);
  devices.lift = lift;
  const rel = lift.releasePoint;

  // ---------------------------------------------------------------- crown: flip-flop tree
  const exit = make('exit', PB(rel, 0, 0.035).straight(0.42), { branch: 'top', v0: 0.06, bank: 'none' });
  lift.exit = exit;
  const f1a = make('f1a', from(exit).turn(0.36, -90).straight(0.3), { branch: 'top', v0: exit.vEnd });
  const f1b = make('f1b', from(exit).turn(0.36, 90).straight(0.3), { branch: 'top', v0: exit.vEnd });
  const F1 = world.addDevice(new FlipFlop(world, { name: 'F1', input: exit, outs: [f1a, f1b], labels: ['south', 'north'] }));

  // F2 (south): bells (west) / marimba (south)
  const bellArm0 = make('bellArm0', from(f1a).turn(0.4, -90), { branch: 'bells', v0: f1a.vEnd });
  const marArm0 = make('marArm0', from(f1a).straight(0.15), { branch: 'marimba', v0: f1a.vEnd });
  const F2 = world.addDevice(new FlipFlop(world, { name: 'F2', input: f1a, outs: [marArm0, bellArm0], labels: ['marimba', 'bells'] }));

  // F3 (north): F6 (east: daredevil / water slide) / F4 (west)
  const darArm0 = make('darArm0', from(f1b).turn(0.4, -90), { branch: 'top', v0: f1b.vEnd });
  const f3b = make('f3b', from(f1b).turn(0.4, 90).straight(0.25), { branch: 'top', v0: f1b.vEnd });
  const F3 = world.addDevice(new FlipFlop(world, { name: 'F3', input: f1b, outs: [darArm0, f3b], labels: ['east', 'west'] }));

  // F4 (north-west): plinko (west) / gong (north)
  const plkArm0 = make('plkArm0', from(f3b).turn(0.5, 25).turn(0.5, -25), { branch: 'plinko', v0: f3b.vEnd });
  const gongArm0 = make('gongArm0', from(f3b).turn(0.4, -90), { branch: 'gong', v0: f3b.vEnd });
  const F4 = world.addDevice(new FlipFlop(world, { name: 'F4', input: f3b, outs: [plkArm0, gongArm0], labels: ['plinko', 'gong'] }));

  // ---------------------------------------------------------------- return trough around the pedestal
  const RING_R = 1.38, RING_T0 = -62, RING_T1 = 270, RING_Y0 = 1.44, RING_G = 0.024;
  const ringY = (thDeg) => RING_Y0 - RING_G * RING_R * (thDeg - RING_T0) * deg;
  const ringPoint = (thDeg) => ({ x: RING_R * Math.cos(thDeg * deg), y: ringY(thDeg), z: -RING_R * Math.sin(thDeg * deg) });
  const r0 = ringPoint(RING_T0);
  const collectorPB = PB(r0, RING_T0 + 90, RING_G).turn(RING_R, RING_T1 - RING_T0);
  collectorPB.connectTo(lift.lineX, lift.loadY, lift.lineZ, 90, { r: 0.42, gEnd: 0.03, trans: 0.3 });
  const ringLen = RING_R * (RING_T1 - RING_T0) * deg;
  const collector = make('collector', collectorPB, {
    branch: 'collector', kind: 'trough', v0: 0.3, bank: 'none', mu: 0.019, caged: true,
    endStop: { e: 0.15, sound: 'click' }, startStop: { e: 0.2 },
    capture: { s0: 0, s1: ringLen + 0.1, lat: 0.065, e: 0.25, bounceAbove: 0.9, sound: 'thud' },
  });
  lift.feed = collector;
  const ringS = (thDeg) => RING_R * (thDeg - RING_T0) * deg;
  // branches join the trough tangentially, like a railway merge
  const toRing = (name, pb, thDeg, branch, o = {}) => {
    const p = ringPoint(thDeg);
    pb.connectTo(p.x, p.y, p.z, thDeg + 90, { r: o.r ?? 0.45, gEnd: RING_G });
    const t = make(name, pb, { branch, ...o });
    t.next = { track: collector, s: ringS(thDeg) };
    t.meta.merge = thDeg;
    return t;
  };

  // ================================================================ MARIMBA (south)
  const hopper = new Funnel(world, { name: 'hopper-m', cx: 0.95, cz: 1.42, yRim: 4.73, rOut: 0.3, rHole: 0.045, depth: 0.22, mu: 0.05 });
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
  // wheel driven by the balls
  const wheel = new Wheel(world, { cx: -0.6, cy: 3.72, cz: 4.85, axis: { x: 0, z: -1 }, radius: 0.4, pockets: 8, loadAngle: 100 * deg, dumpAngle: 250 * deg });
  world.addDevice(wheel); devices.wheel = wheel;
  const wLoad = wheel.pointAt(wheel.loadAngle);
  const wheelFeed = make('wheelFeed', PB(mergeP, 270, 0.03).connectTo(wLoad.x, wLoad.y, wLoad.z, 180, { r: 0.4, gEnd: 0.03 }), {
    branch: 'marimba', v0: Math.max(mergeI.vEnd, mergeII.vEnd), endStop: { e: 0.2, sound: 'clunk' },
  });
  mergeI.connect(wheelFeed); mergeII.connect(wheelFeed);
  wheel.feed = wheelFeed;
  const wDump = wheel.pointAt(wheel.dumpAngle);
  // glockenspiel spiral after the wheel
  const GX = -2.05, GZ = 3.85, GR = 0.55;
  const wheelOut = make('wheelOut', PB({ x: wDump.x, y: wDump.y - 0.02, z: wDump.z }, 180, 0.06).straight(0.15).connectTo(GX, wDump.y - 0.12, GZ + GR, 180, { r: 0.45, gEnd: 0.08 }), { branch: 'marimba', v0: 0.25 });
  wheel.exit = wheelOut;
  const glock = make('glockHelix', from(wheelOut).grade(0.12, 0.3).helix(GR, 2.25, -1), { branch: 'marimba', v0: wheelOut.vEnd, meta: { column: { x: GX, z: GZ, r: GR } } });
  wheelOut.connect(glock);
  columns.push({ x: GX, z: GZ, y0: 0.25, y1: wDump.y + 0.1, r: 0.05, branch: 'marimba' });
  // second hopper right above the return trough: the ball drops straight in
  const m2p = { x: 2.05 * Math.cos(236 * deg), z: -2.05 * Math.sin(236 * deg) };
  const hopper2 = new Funnel(world, { name: 'hopper-m2', cx: m2p.x, cz: m2p.z, yRim: 1.74, rOut: 0.27, rHole: 0.045, depth: 0.2, mu: 0.05 });
  world.addSurface(hopper2); world.addDevice(hopper2); devices.hopperM2 = hopper2;
  const h2Entry = { x: hopper2.cx - 0.255, y: hopper2.hy(0.255), z: hopper2.cz };
  const marOut = make('marOut', from(glock).connectTo(h2Entry.x, h2Entry.y, h2Entry.z, 90, { r: 0.45, gEnd: 0.03 }), { branch: 'marimba', v0: glock.vEnd });
  glock.connect(marOut);
  hopper2.attachEntry(marOut);
  const h2y = hopper2.hy(hopper2.rHole) - 0.1;
  const m2dir = { x: Math.cos(236 * deg), z: -Math.sin(236 * deg) }; // outward
  const marDrop = toRing('marDrop', PB({ x: m2p.x + 0.07 * m2dir.x, y: h2y, z: m2p.z + 0.07 * m2dir.z }, 236 + 180 - 25, 0.06).straight(0.2), 258, 'marimba', {
    v0: 0.2, r: 0.35, startStop: { e: 0.2 },
    capture: { s0: 0, s1: 0.25, lat: 0.045, e: 0.25 },
  });

  // ================================================================ BELLS (west)
  const LX = -3.35, LEN = 0.95, LVL = 9, DY = 0.30, RG = 0.08;
  const bellArm = make('bellArm', from(bellArm0).straight(0.2).connectTo(LX, 4.7, 0.46, 90, { r: 0.6, gEnd: RG }), { branch: 'bells', v0: bellArm0.vEnd });
  bellArm0.connect(bellArm);
  const bellNotes = [86, 83, 81, 78, 76, 74, 71, 69, 66];
  let prev = bellArm;
  devices.bells = [];
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
      const bell = new Bell(world, {
        name: `bell${i}`, midi: bellNotes[i],
        hang: { x: LX, y: e.y + 0.1, z: e.z + dir * 0.1 }, r: 0.068, height: 0.13,
      });
      world.addDevice(bell); devices.bells.push(bell);
    }
    prev = ramp;
  }
  const bellOut = toRing('bellOut', from(prev).turn(0.5, -90), 178, 'bells', { v0: prev.vEnd });
  prev.connect(bellOut);

  // ================================================================ DAREDEVIL (east)
  const darArm = make('darArm', from(darArm0).straight(0.85), { branch: 'daredevil', v0: darArm0.vEnd });
  darArm0.connect(darArm);
  const loopZ = 0.35;
  const plungePB = from(darArm).grade(0.55, 0.55).turn(0.75, -90).straight(0.25).grade(0.0, 0.9).straight(1.1);
  const plunge = make('plunge', plungePB, { branch: 'daredevil', v0: darArm.vEnd });
  darArm.connect(plunge);
  void loopZ;
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
  // The gravity well: a hyperbolic funnel whose rim turns up in a lip. A ball
  // rolled in near the rim's orbital speed circles for a long time, speeding
  // up as it spirals in, and whirs down the throat.
  const funnel = new Funnel(world, { name: 'vortex', cx: 3.35, cz: 3.05, yRim: 3.2, rOut: 0.6, rHole: 0.05, depth: 0.42, mu: 0.012, lip: { r0: 0.48, height: 0.1 } });
  world.addSurface(funnel); world.addDevice(funnel); devices.funnel = funnel;
  const fEntry = { x: funnel.cx + 0.585, y: funnel.hy(0.585), z: funnel.cz };
  // after the landing the ball runs through a brush brake (a sleeve of
  // bristles, like the brake run before a roller coaster's station), so it
  // reaches the funnel at a speed the funnel can hold
  const landPB = PB(landStart, landHeading, landGrade).straight(1.0).grade(0.06, 0.6).connectTo(fEntry.x, fEntry.y, fEntry.z, 90, { r: 0.45, gEnd: 0.03 });
  const landL = landPB.d * 1.0;
  const landRamp = make('landing', landPB, {
    branch: 'daredevil', v0: Math.hypot(flight.vel.x, flight.vel.y, flight.vel.z) * 0.92,
    capture: { s0: 0, s1: 1.3, lat: 0.1, e: 0.18, bounceAbove: 1.3 },
    render: { guard: [0, 1.0] },
  });
  landRamp.brake = { s0: landRamp.L - 1.15, s1: landRamp.L - 0.25, rate: opts.brakeRate ?? 3.4 };
  void landL;
  funnel.attachEntry(landRamp);
  // drums below the funnel, found by probing the real physics
  const holeP = { x: funnel.cx, y: funnel.hy(funnel.rHole), z: funnel.cz };
  const t1 = 15 * deg;
  const drum1 = world.addDevice(new Drum(world, { name: 'tom1', center: { x: holeP.x, y: holeP.y - 0.5, z: holeP.z }, normal: { x: -Math.sin(t1), y: Math.cos(t1), z: 0 }, r: 0.16, midi: 50, e: 0.7, color: 0xc0392b }));
  world.finalize();
  const pr1 = probe(world, { x: holeP.x, y: holeP.y - 0.015, z: holeP.z }, { x: 0, y: -0.4, z: 0 }, (p, v) => v.y < 0 && p.y < drum1.center.y - 0.24);
  const t2 = 22 * deg;
  const drum2C = { x: pr1.p.x - 0.02, y: pr1.p.y - R - 0.01, z: pr1.p.z };
  const drum2 = world.addDevice(new Drum(world, { name: 'tom2', center: drum2C, normal: { x: -Math.sin(t2), y: Math.cos(t2), z: 0 }, r: 0.19, midi: 43, e: 0.55, color: 0x6c3483 }));
  world.finalize();
  const pr2 = probe(world, { x: holeP.x, y: holeP.y - 0.015, z: holeP.z }, { x: 0, y: -0.4, z: 0 }, (p, v) => v.y < 0 && p.y < drum2C.y - 0.22);
  devices.drum1 = drum1; devices.drum2 = drum2;
  devices.drumPath = [pr1.path, pr2.path];
  const cp = pr2.p;
  const cv = norm2(pr2.v.x, pr2.v.z);
  const catchHeading = Math.atan2(-cv.z, cv.x) / deg;
  const darCatchPB = PB({ x: cp.x - cv.x * 0.25, y: cp.y - 0.01, z: cp.z - cv.z * 0.25 }, catchHeading, 0.05).straight(0.45);
  const darCatch = toRing('darCatch', darCatchPB, -50, 'daredevil', {
    kind: 'trough', v0: 0.6,
    capture: { s0: 0, s1: 0.7, lat: 0.1, e: 0.2, bounceAbove: 1.5, sound: 'thud' },
  });
  columns.push({ x: funnel.cx, z: funnel.cz, y0: 0.25, y1: drum2C.y - 0.2, r: 0.05, branch: 'daredevil', skip: true });

  // ================================================================ WATER SLIDE (north-east)
  // F6 splits the daredevil arm: straight on to the plunge, or left past a run
  // of tuned water glasses to the head of a flume that spirals down round the
  // pump's riser pipe, through a glass tunnel, into a whirlpool splash pool.
  const wsArm0 = make('wsArm0', from(darArm0).turn(0.4, 90), { branch: 'water', v0: darArm0.vEnd });
  const F6 = world.addDevice(new FlipFlop(world, { name: 'F6', input: darArm0, outs: [darArm, wsArm0], labels: ['daredevil', 'water slide'] }));
  const WS = { x: 3.6, z: -2.25, r: 1.0 };
  const wsGlass = make('wsGlass', from(wsArm0).grade(0.012, 0.2).straight(1.34).turn(0.45, -90).straight(1.395), { branch: 'water', v0: wsArm0.vEnd });
  wsArm0.connect(wsGlass);
  // open flume: two and a quarter turns down round the riser
  const column = { x: WS.x, z: WS.z, r: WS.r, step: 0.9 };
  const wsHelix = make('wsHelix', from(wsGlass).grade(0.12, 0.5).helix(WS.r, 2.25, -1), {
    branch: 'water', kind: 'flume', v0: wsGlass.vEnd, flume: { u0: 0.5 }, meta: { column },
  });
  wsGlass.connect(wsHelix);
  const pool = new Pool(world, { name: 'pool', cx: 2.1, cz: -1.45, yRim: 1.77, rOut: 0.45, rHole: 0.045, depth: 0.08, cone: 0.12 });
  world.addSurface(pool); world.addDevice(pool); devices.pool = pool;
  // glass tunnel: the last turn and a quarter, then a drop that shoots the
  // ball in along the pool's south side, so it goes round the whirlpool
  const tubeEnd = { x: pool.cx + 0.12, y: pool.ySurf + 0.075, z: pool.cz + 0.38 };
  const wsTube = make('wsTube', from(wsHelix).helix(WS.r, 1.25, -1).connectTo(tubeEnd.x, tubeEnd.y, tubeEnd.z, 165, { r: 0.5, gEnd: 0.08 }), {
    branch: 'water', kind: 'flume', v0: wsHelix.vEnd, meta: { column: { ...column, s1: 1.25 * 2 * Math.PI * WS.r * Math.hypot(1, 0.12) } },
    flume: { tube: true, u0: wsHelix.flume.uEnd, beta0: wsHelix.flume.betaEnd, tau0: wsHelix.flume.tauEnd },
  });
  wsHelix.connect(wsTube);
  devices.waterSlide = { riser: WS, head: wsHelix.start, glass: wsGlass, flumes: [wsHelix, wsTube], pool };
  // down the drain, then home to the return trough
  const outDir = { x: Math.cos(205 * deg), z: -Math.sin(205 * deg) };
  const drainY = pool.hy(pool.rHole) - 0.1;
  const wsOut = toRing('wsOut', PB({ x: pool.cx - 0.07 * outDir.x, y: drainY, z: pool.cz - 0.07 * outDir.z }, 205, 0.06).straight(0.25), 52, 'water', {
    v0: 0.2, r: 0.45, startStop: { e: 0.2 },
    capture: { s0: 0, s1: 0.3, lat: 0.045, e: 0.25 },
  });
  devices.waterSlide.out = wsOut;

  // ================================================================ PLINKO (north-west)
  const PHX = -1.45, PHZ = -2.0, PHR = 0.5;
  const plkArm = make('plkArm', from(plkArm0).straight(0.3).connectTo(PHX, 4.72, PHZ + PHR, 180, { r: 0.5, gEnd: 0.1 }), { branch: 'plinko', v0: plkArm0.vEnd });
  plkArm0.connect(plkArm);
  const plkHelix = make('plkHelix', from(plkArm).grade(0.12, 0.3).helix(PHR, 2.25, -1), { branch: 'plinko', v0: plkArm.vEnd, meta: { column: { x: PHX, z: PHZ, r: PHR } } });
  plkArm.connect(plkHelix);
  columns.push({ x: PHX, z: PHZ, y0: 0.25, y1: 4.9, r: 0.05, branch: 'plinko' });
  const PBX = -2.45, PBZ = -3.15, PBW = 0.92, PBH = 1.62;
  const hopP = new Funnel(world, { name: 'hopper-p', cx: PBX, cz: PBZ, yRim: 3.74, rOut: 0.28, rHole: 0.045, depth: 0.22, mu: 0.05, jitter: 0.012 });
  world.addSurface(hopP); world.addDevice(hopP); devices.hopperP = hopP;
  const hpEntry = { x: hopP.cx + 0.265, y: hopP.hy(0.265), z: hopP.cz };
  const plkIn = make('plkIn', from(plkHelix).connectTo(hpEntry.x, hpEntry.y, hpEntry.z, 90, { r: 0.4, gEnd: 0.03 }), { branch: 'plinko', v0: plkHelix.vEnd });
  plkHelix.connect(plkIn);
  hopP.attachEntry(plkIn);
  const PTOP = hopP.hy(hopP.rHole) - 0.07;
  const plinko = new Plinko(world, {
    center: { x: PBX, y: PTOP - PBH / 2, z: PBZ }, right: { x: 1, y: 0, z: 0 },
    width: PBW, height: PBH, depth: 0.075, rows: 14, cols: 8, dx: 0.108, dy: 0.094, topMargin: 0.16,
    noteFor: (r, c) => pent(((c + 2 * r) % 5) + 5 * Math.floor((13 - r) / 5), 74),
  });
  world.addDevice(plinko); devices.plinko = plinko;
  const pb0 = PTOP - PBH;
  const vAng = 13 * deg;
  for (const s of [-1, 1]) {
    world.addCollider(new BoxCollider({
      center: { x: PBX + s * (PBW / 4 + 0.03), y: pb0 + Math.tan(vAng) * PBW / 4 + 0.01, z: PBZ },
      axes: [{ x: Math.cos(vAng) * s, y: Math.sin(vAng), z: 0 }, { x: -Math.sin(vAng) * s, y: Math.cos(vAng), z: 0 }, { x: 0, y: 0, z: 1 }],
      half: [PBW / 4 - 0.02, 0.008, 0.06], e: 0.2, mu: 0.3, tag: 'plinkoFloor', instrument: 'thud', gain: 0.3,
    }));
  }
  // the slot at the bottom lets the ball drop onto the out-track, which runs south
  const plkOutPB = PB({ x: PBX, y: pb0 - 0.05, z: PBZ - 0.1 }, 270, 0.08).straight(0.4).turn(0.5, 90);
  const plkOut = toRing('plkOut', plkOutPB, 132, 'plinko', {
    v0: 0.2, capture: { s0: 0, s1: 0.25, lat: 0.06, e: 0.2 },
  });
  devices.plinkoExit = plkOut;

  // ================================================================ GONG (north)
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
  const gongC = { x: chute.end.x, y: chute.end.y + 0.02, z: chute.end.z - 0.17 };
  bucket.chute = chute;
  columns.push({ x: GCX, z: GCZ, y0: 0.25, y1: 4.2, r: 0.05, branch: 'gong' });
  const gong = world.addDevice(new Gong(world, { center: gongC, normal: { x: 0, y: 0, z: 1 }, r: 0.42, midi: 38 }));
  devices.gong = gong;
  const gongCatch = toRing('gongCatch', PB({ x: gongC.x, y: gongC.y - 0.62, z: gongC.z + 0.06 }, 270, 0.07).straight(0.55), 66, 'gong', {
    kind: 'trough', v0: 0.4,
    capture: { s0: 0, s1: 0.75, lat: 0.2, e: 0.2, bounceAbove: 1.2, sound: 'thud' },
    render: { wide: 0.2 },
  });
  devices.gongCatch = gongCatch;

  // ---------------------------------------------------------------- music
  const beat = opts.beat ?? 0.42;
  // Time the lanes with a probe ball dropped from the hopper outlet through
  // the real physics, so the bars land exactly on the beat.
  world.finalize();
  const holeStart = { x: hopper.cx, y: hopper.hy(hopper.rHole) - 0.015, z: hopper.cz };
  const timeI = probeTrack(world, holeStart, { x: 0, y: -0.4, z: 0 }, laneI, () => { F5.lock = 0; }, () => { F5.lock = null; F5.state = 0; });
  const timeII = probeTrack(world, holeStart, { x: 0, y: -0.4, z: 0 }, laneII, () => { F5.lock = 1; }, () => { F5.lock = null; F5.state = 0; });
  const barsI = placeMelodyTimed(timeI, ODE_I, beat, 0.5);
  const barsII = placeMelodyTimed(timeII, ODE_II, beat, 0.5);
  for (const [nm, bars, lane] of [['I', barsI, laneI], ['II', barsII, laneII]]) {
    if (bars.short) warnings.push(`lane ${nm} too short: ${bars.short} notes missing (L=${lane.L.toFixed(2)}, t=${lane.tEnd.toFixed(2)}s, v ${lane.v0.toFixed(2)}→${lane.vEnd.toFixed(2)})`);
  }
  devices.marimbaI = world.addDevice(new BarRun(world, laneI, barsI, { name: 'Marimba lane I — the call', kind: 'marimba' }));
  devices.marimbaII = world.addDevice(new BarRun(world, laneII, barsII, { name: 'Marimba lane II — the answer', kind: 'marimba' }));
  // the water glasses: a probe ball from the top of the lift, switched onto
  // the water slide, finds where the ball will be on each eighth note
  const tGlass = probeFrom(world, exit, 0.001, 0.06, wsGlass,
    () => { F1.lock = 1; F3.lock = 0; F6.lock = 1; },
    () => { for (const ff of [F1, F3, F6]) { ff.lock = null; ff.state = 0; ff.angle = ff.targetAngle(); ff.angVel = 0; } });
  const glassNotes = placeMelodyTimed(tGlass, ROW, opts.glassEighth ?? 0.19, 0.3);
  if (glassNotes.short) warnings.push(`water glasses: ${glassNotes.short} notes missing (L=${wsGlass.L.toFixed(2)})`);
  devices.glasses = world.addDevice(new BarRun(world, wsGlass, glassNotes, { name: 'Water glasses', kind: 'glasses', instrument: 'glass', gain: 0.85 }));
  const tines = [];
  const nT = 15;
  for (let i = 0; i < nT; i++) tines.push({ s: 0.4 + i * (glock.L - 0.8) / (nT - 1), midi: pent(i, 74) });
  devices.tines = world.addDevice(new BarRun(world, glock, tines, { name: 'Glockenspiel spiral', kind: 'tines', instrument: 'glock', gain: 0.65 }));

  // the plinth floor: strays land, bounce and roll before being gathered up
  world.addCollider(new BoxCollider({
    center: { x: 0, y: 0.25 - 0.05, z: 0 }, axes: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
    half: [6.2, 0.05, 6.2], e: 0.45, mu: 0.35, tag: 'floor', instrument: 'thud', gain: 0.9, vref: 3,
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
    plinko: [[F1, 1], [F3, 1], [F4, 0]],
    gong: [[F1, 1], [F3, 1], [F4, 1]],
  };
  const tag = { F2: ['marimba', 'bells'], F4: ['plinko', 'gong'], F6: ['daredevil', 'water'] };
  for (const [name, arr] of Object.entries(tag)) {
    flipflops[name].onRoute = (b, k, w) => { if (arr[k]) { b.branch = arr[k]; w.info('branch', { ball: b.id, branch: arr[k] }); } };
  }
  F5.onRoute = (b, k, w) => w.info('lane', { ball: b.id, lane: k ? 'II' : 'I' });

  return { world, tracks, devices, flipflops, routes, lift, collector, columns, warnings, ringPoint, RING: { R: RING_R, T0: RING_T0, T1: RING_T1 }, BRANCHES };

  function norm2(x, z) { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; }
}

export const BALL_COLORS = [
  0xf2c230, 0x1f5fbf, 0xd62d20, 0x6a2c91, 0xf07d1a, 0x138a50, 0x8b1a1a, 0x222222,
  0xf2c230, 0x1f5fbf, 0xd62d20, 0x6a2c91, 0xf07d1a, 0x138a50, 0x8b1a1a,
];

export function queueBalls(world, collector, balls) {
  let s = collector.L - 0.002;
  for (const b of balls) {
    world.placeOnTrack(b, collector, s, 0);
    s -= 2 * R + 0.003;
  }
}

export function rescue(world, collector, b) {
  let sMin = collector.L;
  for (const o of world.balls) if (o !== b && o.mode === 'track' && o.track === collector) sMin = Math.min(sMin, o.s);
  world.placeOnTrack(b, collector, Math.max(0.3, Math.min(collector.L - 0.1, sMin - 3 * R)), 0);
  world.stats.recovered++;
}

function predictFlight(track, below = 0.12) {
  const f = {};
  track.sample(track.L, f);
  const v = track.vEnd;
  let p = { x: f.px, y: f.py, z: f.pz }, vel = { x: v * f.tx, y: v * f.ty, z: v * f.tz };
  const h = 0.001;
  let apex = p.y;
  for (let t = 0; t < 3; t += h) {
    const sp = Math.hypot(vel.x, vel.y, vel.z), dk = 1 - BALL.drag * sp * h;
    vel = { x: vel.x * dk, y: (vel.y - 9.81 * h) * dk, z: vel.z * dk };
    p = { x: p.x + vel.x * h, y: p.y + vel.y * h, z: p.z + vel.z * h };
    apex = Math.max(apex, p.y);
    if (p.y < apex - below && vel.y < 0) return { p, vel, t, apex };
  }
  return { p, vel, t: 3, apex };
}

// Run a single probe ball through the whole world from a free launch and
// record (t, s) while it is on `track`.
function probeTrack(world, p, v, track, setup, restore) {
  const saveBalls = world.balls, saveT = world.t, saveEv = world.events.length;
  const lift = world.devices.find((d) => d.kind === 'lift');
  const savePhase = lift?.phase;
  const b = new Ball(-1, 0, 0);
  world.balls = [b];
  setup();
  world.launch(b, p, v);
  const samples = [];
  let t = 0;
  for (; t < 30; t += 0.001) {
    world.step(0.001);
    if (b.mode === 'track' && b.track === track) samples.push({ t, s: b.s });
    else if (samples.length) break;
  }
  restore();
  world.balls = saveBalls; world.t = saveT; world.events.length = saveEv;
  if (lift) lift.phase = savePhase;
  return samples;
}

// Same, but the probe starts rolling on a track (e.g. just off the lift).
function probeFrom(world, start, s0, v0, track, setup, restore) {
  const saveBalls = world.balls, saveT = world.t, saveEv = world.events.length;
  const lift = world.devices.find((d) => d.kind === 'lift');
  const savePhase = lift?.phase;
  const b = new Ball(-1, 0, 0);
  world.balls = [b];
  setup();
  world.placeOnTrack(b, start, s0, v0);
  const samples = [];
  for (let t = 0; t < 30; t += 0.001) {
    world.step(0.001);
    if (b.mode === 'track' && b.track === track) samples.push({ t, s: b.s });
    else if (samples.length) break;
  }
  restore();
  world.balls = saveBalls; world.t = saveT; world.events.length = saveEv;
  if (lift) lift.phase = savePhase;
  return samples;
}

function placeMelodyTimed(samples, melody, beat, sStart) {
  const out = [];
  if (!samples.length) { out.short = melody.length; return out; }
  let i = 0;
  while (i < samples.length - 1 && samples[i].s < sStart) i++;
  const t0 = samples[i].t;
  let tb = 0;
  for (const [midi, beats] of melody) {
    const target = t0 + tb * beat;
    while (i < samples.length - 1 && samples[i].t < target) i++;
    if (i >= samples.length - 1) { out.short = melody.length - out.length; return out; }
    out.push({ s: samples[i].s, midi, t: target - t0 });
    tb += beats;
  }
  return out;
}

// Fly a probe ball through the world's colliders (build-time only).
export function probe(world, p, v, stop, maxT = 3) {
  const b = new Ball(-1, 0, 0);
  world.launch(b, p, v);
  const path = [];
  const saveEvents = world.events.length;
  for (let t = 0; t < maxT; t += 0.001) {
    world._stepFree(b, 0.001);
    if ((t * 1000 | 0) % 10 === 0) path.push({ x: b.p.x, y: b.p.y, z: b.p.z });
    if (b.mode !== 'free' || stop(b.p, b.vel)) break;
  }
  world.events.length = saveEvents;
  for (const d of world.devices) { if (d.amp !== undefined) d.amp = 0; }
  return { p: { ...b.p }, v: { ...b.vel }, path };
}
