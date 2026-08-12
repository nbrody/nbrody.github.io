// machine.js — the kinetic sculpture, powered by real rigid-body physics (Rapier).
//
// Every ball is a dynamic sphere with continuous collision detection. Rails are
// chains of capsule colliders, bowls/funnels/gutter are trimeshes, chime bars are
// tilted boxes, trampolines are high-restitution discs. Nothing is scripted:
// balls roll in the rail grooves, fly between elements, ring the bars and the
// bell, and knock into each other purely through contact dynamics. Sounds are
// triggered by the engine's contact-force events. Wire guard rails, corridor
// fences, catch funnels, and a collector gutter keep the chaos on the sculpture
// — same as on a real Rhoads machine.

import * as THREE from 'three';
import RAPIER from 'rapier';
import { Track, catmullDense, helixPts, loopPts, joinPts } from './track.js';

const G = 9.81;
const BALL_R = 0.14;
const RAIL_R = 0.024;
const GAUGE = 0.17;
const BALL_H = Math.sqrt((BALL_R + RAIL_R) ** 2 - (GAUGE / 2) ** 2);
const SUB = 1 / 240;

const BALL_COLORS = [0xf6c90e, 0x1976d2, 0xd7263d, 0x7b2d8b, 0xf46d1b, 0x1e9e4a, 0x8d1e2d];

// contact-force sound thresholds (N) — ball mass ≈ 2.3 kg, resting contact ≈ 22 N
const F_CHIME = 120, F_BELL = 55, F_BOING = 150, F_CLICK = 100, F_THUNK = 420;

// ---- layout constants ----
const LIFT_X = -4.6, LIFT_Z_UP = 0.30, LIFT_Y_BOT = 0.18, LIFT_Y_TOP = 7.1, SPROCKET_R = 0.2;
const LIFT_SPEED = 0.65;
const N_CUPS = 7;
const PICKUP = new THREE.Vector3(-4.62, 0.20, 0.12);

// tipping-arm switch: pivot of the V-tray the dispatch drops balls onto.
// The tray sits well below the dispatch mouth — its swinging wall tips must
// never reach the channel shell, or balls get pinched between them.
const SWITCH_C = new THREE.Vector3(-3.28, 6.70, 0);
const TEETER = { pivot: new THREE.Vector3(-3.28, 6.58, 0), tilt: 0.18, halfLen: 0.72 };

const VORTEX = { cx: 2.8, cz: 1.4, R: 1.25, rt: 0.24, rimY: 3.95, depth: 0.80, exp: 1.6 };
// tube ends well above the bell: the ball wall-hugs the tube as it corkscrews
// down, so it needs free-fall distance below to actually STRIKE the bell
const TUBE_BOTTOM = 2.95;
// big dome dead-centered under the vortex drop tube — the ball exits the tube
// on a wide spiral, so the strike target must cover the scatter
const BELL = { c: new THREE.Vector3(2.8, 2.15, 1.4), r: 0.42 };

const BARS = [];
{
    const xs = [-2.30, -2.66, -2.98, -3.28, -3.55, -3.80, -4.02, -4.22];
    const tops = [1.00, 0.92, 0.83, 0.74, 0.65, 0.56, 0.47, 0.38];
    for (let i = 0; i < 8; i++) BARS.push({ x: xs[i], z: 0.95, top: tops[i], note: i, lastFire: -1 });
}
const BAR_TILT = 0.14; // rad, tops lean toward -x so bounces march down the staircase

// trampolines: {p, r, surface normal}. Relay geometry (18° pads): the funnel
// drop of ~0.4 m rebounds at 54° for a ~0.6 m hop, so T2 sits 0.6 m along -x
// and the second, flatter bounce skims the ball into chute C's flared mouth.
const TRAMPS = [
    { p: new THREE.Vector3(2.90, 0.62, 1.45), r: 0.36, n: new THREE.Vector3(-Math.sin(0.314), Math.cos(0.314), 0) },
    { p: new THREE.Vector3(2.30, 0.52, 1.44), r: 0.36, n: new THREE.Vector3(-Math.sin(0.314), Math.cos(0.314), 0) },
    { p: new THREE.Vector3(-4.62, 0.20, 0.95), r: 0.30, n: new THREE.Vector3(0.93 * Math.sin(0.24), Math.cos(0.24), 0.37 * Math.sin(0.24)).normalize() },
];
// throat tube kills most of the ball's spiral velocity before the trampoline drop
const FUNNEL = { cx: 2.95, cz: 1.45, throatR: 0.20, throatY0: 1.15, throatY1: 1.35, rimR: 0.85, rimY: 1.78 };

function vortexY(r) {
    const f = Math.max(0, (r - VORTEX.rt) / (VORTEX.R - VORTEX.rt));
    // linear term keeps the throat draining — a pure power law goes flat at the
    // bottom and balls park next to the hole
    return (VORTEX.rimY - VORTEX.depth) + VORTEX.depth * (0.8 * Math.pow(f, VORTEX.exp) + 0.2 * f);
}

let rapierReady = false;

export class Machine {
    static async create(scene, audio) {
        if (!rapierReady) { await RAPIER.init(); rapierReady = true; }
        return new Machine(scene, audio);
    }

    constructor(scene, audio) {
        this.scene = scene;
        this.audio = audio;
        this.silent = false;
        this.time = 0;
        this.stats = { laps: 0, chimes: 0, bells: 0, boings: 0, respawns: 0, switchA: 0, switchB: 0 };
        this._acc = 0;
        this._tmp = new THREE.Vector3();
        this._tmp2 = new THREE.Vector3();
        this._soundBudget = 8;
        this.debugForces = false;
        this._forceLog = [];

        this.world = new RAPIER.World({ x: 0, y: -G, z: 0 });
        this.world.timestep = SUB;
        this.eventQueue = new RAPIER.EventQueue(true);
        this.tags = new Map();

        this._defineTracks();
        this._buildChannels();
        this._buildGutter();
        this._buildBalls();
        this._buildScenery();
        this._buildLift();
        this._buildSwitch();
        this._buildVortex();
        this._buildBell();
        this._buildBars();
        this._buildTrampolines();
        this._buildFences();
        this._buildBrushes();
        this._buildZones();
    }

    _tag(collider, obj) { this.tags.set(collider.handle, obj); }

    // ------------------------------------------------------------------ layout
    _defineTracks() {
        this.dispatch = new Track('dispatch', catmullDense([
            [-4.6, 7.06, 0.12], [-4.25, 7.01, 0.05], [-3.8, 6.96, 0], [-3.4, 6.93, 0],
        ]), { color: 0x9d4edd });

        // Route A leaves the -z end of the switch tray, winds down the helix, and
        // exits pointing +x into ONE wide 180° dive that lines up straight with
        // the loop — tight S-bends before a loop scrub away all the speed.
        const aPts = joinPts(
            catmullDense([
                [-3.28, 6.30, -0.85], [-3.05, 6.26, -1.15], [-2.55, 6.22, -1.15],
                [-2.0, 6.20, -0.7], [-1.7, 6.19, -0.3],
            ]),
            helixPts(-1.0, -1.4, 1.3, 6.18, 5.3, 90, 2.0, -1),
            // shed altitude on the long straight diagonal, then swing the 180°
            // through the EMPTY front of the machine (z 0.2-0.6) — the space at
            // z≈1.4 is the bell/funnel/drop-tube column and route A must not
            // come near it. Design slopes stay under |t.y|≈0.8 so the frame
            // rule never trips into its transport branch mid-turn.
            // Dive, loop, and exit as ONE Catmull-Rom curve: C1-continuous by
            // construction. Concatenated analytic arcs always leave a tangent
            // kink at the joint, and any kink either necks the tube shut or
            // launches the ball ballistic. The loop is 9 waypoints on a r=0.32
            // circle with a smoothstepped z-drift of 0.75 (shell separation).
            catmullDense([
                [-1.0, 5.3, -0.1], [0.2, 4.7, 0.05], [1.05, 4.15, 0.18], [1.85, 3.6, 0.4],
                [2.6, 2.9, 0.62], [2.85, 2.55, 0.5], [2.85, 2.2, 0.3], [2.55, 1.95, 0.18],
                [2.1, 1.75, 0.3], [1.6, 1.55, 0.5], [1.05, 1.28, 0.62], [0.55, 1.10, 0.64],
                [0.15, 0.95, 0.62],
                // r=0.46 loop: the swept tube's own windings self-intersect when
                // the loop radius drops under ~2.3x the tube radius (0.2) — the
                // side sections' walls then slice through the entry passage.
                // Dip entry at 0.85 covers the extra climb energy.
                [-0.2, 0.85, 0.60], [-0.525, 0.985, 0.632], [-0.66, 1.31, 0.717],
                [-0.525, 1.635, 0.837], [-0.2, 1.77, 0.975], [0.125, 1.635, 1.113],
                [0.26, 1.31, 1.233], [0.125, 0.985, 1.318], [-0.2, 0.85, 1.35],
                [-0.9, 1.0, 1.22], [-1.5, 1.08, 1.05], [-1.9, 1.11, 0.95],
            ]),
        );
        this.trackA = new Track('routeA', aPts, { color: 0xd62828 });

        // route B leaves the +z end of the switch tray
        this.trackB = new Track('routeB', catmullDense([
            [-3.28, 6.30, 0.85], [-3.3, 6.24, 1.3], [-3.75, 6.19, 1.35],
            [-4.22, 6.13, 0.9], [-4.33, 6.06, 0.0], [-4.28, 5.98, -0.9], [-3.9, 5.90, -1.3],
            [-3.45, 5.82, -1.0], [-3.35, 5.74, -0.1], [-3.42, 5.66, 0.8], [-3.72, 5.58, 1.15],
            [-4.15, 5.50, 0.9], [-4.25, 5.42, 0.0], [-4.18, 5.34, -0.8], [-3.8, 5.26, -1.15],
            [-3.5, 5.18, -0.8], [-3.0, 5.06, 0.2], [-2.0, 4.84, 1.3], [-0.5, 4.42, 2.0],
            [0.8, 4.10, 2.15], [1.35, 3.99, 1.78], [1.72, 3.97, 1.33],
        ]), { color: 0xf4a819 });

        // chute from the catch basin to the collector gutter — needs a real
        // grade throughout: balls stop rolling over trimesh facet seams under ~2%
        // Chute C's flared mouth is the relay catcher: the second trampoline
        // bounce skims the ball straight into it at ~0.55 height. It ends short
        // of the gutter (overlapping shells wall each other off) so the ball
        // hops the last 30 cm into the gutter's flared mouth.
        this.trackC = new Track('chute', catmullDense([
            [1.75, 0.50, 1.44], [0.4, 0.41, 1.45], [-1.2, 0.33, 1.4],
            [-2.8, 0.25, 1.28], [-4.1, 0.16, 1.08],
        ]), { color: 0x2a9d8f });

        // gutter path (rendered/collided as a half-pipe channel, not rails)
        this.trough = new Track('trough', catmullDense([
            [-4.42, 0.14, 1.03], [-4.8, 0.11, 0.72], [-4.9, 0.08, 0.3], [-4.62, 0.06, 0.12],
        ]), { color: 0x4361ee });

        this.railTracks = [this.dispatch, this.trackA, this.trackB, this.trackC];
        for (const tr of this.railTracks) this.scene.add(tr.buildMesh());
        this._addStruts();
    }

    // Swept channel profile along a track: rings of points around the ball line.
    // Returns {pos, idx} for trimesh colliders / meshes. The channel bottom is
    // placed so a resting ball's center sits exactly at rail height (BALL_H).
    _sweepChannel(tr, rCh, halfAngDeg, step = 2, profileN = 14, iStart = 0, flareRings = 0, iEnd = -1) {
        if (iEnd < 0) iEnd = tr.n;
        const half = halfAngDeg * Math.PI / 180;
        const rings = [];
        let ringIdx = 0;
        for (let i = iStart; i <= iEnd; i += step) {
            // trumpet-flared mouth: the first rings widen so arriving balls are
            // scooped in even when the hand-off is a little off-axis
            const scale = ringIdx < flareRings ? 1 + 0.6 * (1 - ringIdx / flareRings) : 1;
            ringIdx++;
            const r = rCh * scale;
            // flare opens upward/sideways only — the ring center rises so the
            // bottom stays flush with the floor (a sunken belly traps slow balls)
            const c = new THREE.Vector3().copy(tr.P[i]).addScaledVector(tr.N[i], BALL_H + r - BALL_R);
            const ring = [];
            for (let k = 0; k <= profileN; k++) {
                const a = -half + (2 * half * k) / profileN;
                ring.push(new THREE.Vector3()
                    .copy(c)
                    .addScaledVector(tr.S[i], Math.sin(a) * r)
                    .addScaledVector(tr.N[i], -Math.cos(a) * r));
            }
            rings.push(ring);
        }
        const pos = [], idx = [];
        rings.forEach(ring => ring.forEach(v => pos.push(v.x, v.y, v.z)));
        const W = profileN + 1;
        for (let i = 0; i < rings.length - 1; i++) {
            for (let k = 0; k < profileN; k++) {
                const a = i * W + k, b = a + W;
                idx.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
        return { pos, idx };
    }

    // Physics for the routes: smooth invisible channel trimeshes. Capsule-chain
    // rails are scalloped (a joint bump every 15 cm) — they bleed speed and fling
    // fast balls; a smooth swept channel rolls clean and cannot derail. The
    // visible rails/ties/guard wires stay purely cosmetic, matching ball height.
    _buildChannels() {
        const guardMat = new THREE.MeshStandardMaterial({ color: 0x3a3d46, metalness: 0.85, roughness: 0.4 });
        for (const tr of this.railTracks) {
            const fast = tr === this.trackA || tr === this.trackB;
            const flare = tr === this.dispatch ? 0 : 5; // dispatch is fed directly by the lift
            // fast routes are near-tubes: at ±155° the top opening is narrower than
            // the ball, so no bend can throw it out; ends stay open for hand-offs
            // dense rings on fast routes AND the shallow chute: every facet seam
            // is a tiny bump — it costs speed at 7 m/s and stalls balls at 1 m/s.
            // Fast routes are FULL 360° tubes: the collider is invisible anyway,
            // and a closed tube is rotationally symmetric, so frame twist through
            // helix/dive cannot create seams or inverted openings at all.
            const smooth = fast || tr === this.trackC;
            // near-frictionless on the fast routes: scrub scales with v²/r, so a
            // tight loop at speed eats its own entry energy unless the tube is
            // polished. Rolling needs almost no traction; brakes set hand-offs.
            const fric = fast ? 0.03 : tr === this.trackC ? 0.25 : 0.35;
            const addTube = (i0, i1) => {
                const { pos, idx } = this._sweepChannel(tr, 0.2, fast ? 180 : 100,
                    smooth ? 1 : 2, smooth ? 20 : 14, i0, i0 === 0 && tr !== this.dispatch ? 10 : 0, i1);
                const col = this.world.createCollider(
                    RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx))
                        .setFriction(fric).setRestitution(0.0));
                this._tag(col, { kind: 'rail' });
            };
            // One continuous tube per route. This is valid because the paths are
            // C1-continuous CR curves whose radius everywhere exceeds the tube
            // radius — ring edges then never cross, so no interior walls.
            addTube(0, tr.n);

            // decorative guard wires over the fast sections
            let g0 = 0.15, g1 = tr.length - 0.15;
            if (tr === this.trackA) g1 = tr.length - 0.55;
            else if (tr === this.trackB) g1 = tr.length - 0.35;
            else continue;
            const i0 = Math.max(0, Math.round(g0 / 0.05)), i1 = Math.min(tr.n, Math.round(g1 / 0.05));
            for (const sign of [-1, 1]) {
                const pts = [];
                for (let i = i0; i <= i1; i += 4) {
                    pts.push(new THREE.Vector3().copy(tr.P[i])
                        .addScaledVector(tr.S[i], sign * BALL_R * 1.05)
                        .addScaledVector(tr.N[i], BALL_H + BALL_R * 1.05));
                }
                const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
                const mesh = new THREE.Mesh(
                    new THREE.TubeGeometry(curve, Math.max(12, Math.round((g1 - g0) * 8)), 0.008, 5),
                    guardMat);
                this.scene.add(mesh);
            }
        }
    }

    // Rail + guard-wire cage over the loop window: capsule chains along the
    // running rails plus four frictionless guard wires around the ball line.
    // Capsules have no swept-solid failure mode at high curvature.
    _buildLoopCage(tr, i0, i1) {
        const Y = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion();
        const addChain = (offS, offN, radius, friction) => {
            const pts = [];
            for (let i = i0; i <= i1; i += 2) {
                pts.push(new THREE.Vector3().copy(tr.P[i])
                    .addScaledVector(tr.S[i], offS)
                    .addScaledVector(tr.N[i], offN));
            }
            for (let k = 0; k + 1 < pts.length; k++) {
                const a = pts[k], b = pts[k + 1];
                const len = a.distanceTo(b);
                if (len < 1e-5) continue;
                const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
                const dir = new THREE.Vector3().subVectors(b, a).normalize();
                q.setFromUnitVectors(Y, dir);
                const col = this.world.createCollider(
                    RAPIER.ColliderDesc.capsule(len / 2, radius)
                        .setTranslation(mid.x, mid.y, mid.z)
                        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
                        .setFriction(friction).setRestitution(0.0));
                this._tag(col, { kind: 'rail' });
            }
        };
        // running rails + two frictionless upper wires. No side wires: balls
        // arrive from the tube mouth up to ±6 cm off-center and side wires
        // that close leave less clearance than that — arrivals jam in them.
        for (const sign of [-1, 1]) addChain(sign * GAUGE / 2, 0, RAIL_R, 0.35);
        for (const sign of [-1, 1]) {
            addChain(sign * BALL_R * 1.05, BALL_H + BALL_R * 1.05, 0.013, 0.0);
        }
    }

    // collector gutter: swept half-pipe, trimesh collider + rendered shell
    _buildGutter() {
        const tr = this.trough;
        const { pos, idx } = this._sweepChannel(tr, 0.20, 110);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: 0x4361ee, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide,
        }));
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        const col = this.world.createCollider(
            RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx))
                .setFriction(0.4).setRestitution(0.1));
        this._tag(col, { kind: 'gutter' });

        // end cap at the lift end only — a cap at the start would wall off the
        // hand-off from chute C, whose mouth points straight at it
        const capMat = new THREE.MeshStandardMaterial({ color: 0x2b3a8c, metalness: 0.8, roughness: 0.35 });
        const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion();
        for (const [s, dir] of [[tr.length - 0.03, 1]]) {
            const f = tr.frameAt(s, {});
            const p = new THREE.Vector3().copy(f.p).addScaledVector(f.nrm, BALL_H).addScaledVector(f.t, dir * 0.16);
            q.setFromUnitVectors(Z, f.t);
            const col2 = this.world.createCollider(
                RAPIER.ColliderDesc.cuboid(0.17, 0.17, 0.02)
                    .setTranslation(p.x, p.y, p.z)
                    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
                    .setFriction(0.4).setRestitution(0.1));
            this._tag(col2, { kind: 'gutter' });
            const cm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04), capMat);
            cm.position.copy(p);
            cm.quaternion.copy(q);
            this.scene.add(cm);
        }

        // stray-detection reference line
        this.gutterSamples = [];
        for (let s = 0; s < tr.length; s += 0.12)
            this.gutterSamples.push(tr.ballCenterAt(s, BALL_H, new THREE.Vector3()));

        // per-ball respawn drop points, spread along the DOWNSTREAM half of the
        // gutter: distinct slots (stacked respawns depenetrate explosively) and
        // clear of trampoline T0, which hovers over the gutter mouth and would
        // bounce respawned balls right back off the sculpture
        this.respawnPts = [];
        for (let i = 0; i < 7; i++) {
            this.respawnPts.push(tr.ballCenterAt(0.55 + i * 0.10, BALL_H, new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)));
        }
    }

    _buildBalls() {
        this.balls = [];
        const geo = new THREE.SphereGeometry(BALL_R, 28, 20);
        const starts = [
            this.trough.ballCenterAt(0.15, BALL_H, new THREE.Vector3()).add({ x: 0, y: 0.05, z: 0 }),
            this.trough.ballCenterAt(0.55, BALL_H, new THREE.Vector3()).add({ x: 0, y: 0.05, z: 0 }),
            this.trough.ballCenterAt(0.95, BALL_H, new THREE.Vector3()).add({ x: 0, y: 0.05, z: 0 }),
            this.trackC.ballCenterAt(this.trackC.length * 0.25, BALL_H, new THREE.Vector3()),
            this.trackC.ballCenterAt(this.trackC.length * 0.60, BALL_H, new THREE.Vector3()),
            new THREE.Vector3(1.75, 0.95, 1.44),                                // drops into the chute mouth
            new THREE.Vector3(FUNNEL.cx - 0.55, FUNNEL.rimY + 0.8, FUNNEL.cz),  // clear of the bell, falls into the funnel
        ];
        for (let i = 0; i < 7; i++) {
            const body = this.world.createRigidBody(
                RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(starts[i].x, starts[i].y, starts[i].z)
                    .setLinearDamping(0.02)
                    .setAngularDamping(0.10)
                    .setCanSleep(false)   // gravity never wakes a sleeping body — the machine must keep running
                    .setCcdEnabled(true));
            const col = this.world.createCollider(
                RAPIER.ColliderDesc.ball(BALL_R)
                    .setDensity(200)
                    .setFriction(0.55)
                    .setRestitution(0.3)
                    .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
                    .setContactForceEventThreshold(4), body);
            const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
                color: BALL_COLORS[i], metalness: 0.15, roughness: 0.18,
            }));
            mesh.castShadow = true;
            this.scene.add(mesh);
            const ball = {
                id: i, body, mesh,
                pos: new THREE.Vector3().copy(starts[i]),
                carried: -1, lastContact: -1, strayTime: 0,
                clickCool: -1, thunkCool: -1, inSwitch: false,
            };
            this._tag(col, { kind: 'ball', ball });
            this.balls.push(ball);
        }
    }

    // ------------------------------------------------------------------ update
    update(dt) {
        this._soundBudget = 8;
        this._acc += Math.min(dt, 0.05);
        while (this._acc >= SUB) {
            this._acc -= SUB;
            this.step(SUB);
        }
        this._render(dt);
    }

    fastForward(seconds) {
        this.silent = true;
        const n = Math.round(seconds / SUB);
        for (let i = 0; i < n; i++) { this._soundBudget = 0; this.step(SUB); }
        this.silent = false;
        for (const b of this.balls) { const p = b.body.translation(); b.pos.set(p.x, p.y, p.z); }
    }

    step(dt) {
        this.time += dt;
        this._applyZones(dt);
        this._stepLift(dt);
        this._stepSwitch(dt);
        this.world.step(this.eventQueue);
        this._drainEvents();
        if ((this._safetyTick = (this._safetyTick || 0) + 1) % 12 === 0) this._safetyChecks(dt * 12);
    }

    _applyZones(dt) {
        for (const z of this.zones) {
            for (const b of this.balls) {
                if (b.carried >= 0) continue;
                const p = b.body.translation();
                const dx = p.x - z.c.x, dy = p.y - z.c.y, dz = p.z - z.c.z;
                if (dx * dx + dy * dy + dz * dz > z.r * z.r) continue;
                const v = b.body.linvel();
                const sp = Math.hypot(v.x, v.y, v.z);
                if (sp > z.vmax) {
                    const k = Math.max(z.vmax / sp, 1 - 7 * dt);
                    b.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
                }
            }
        }
        // felt-lined vortex bowl: damp ONLY balls rolling on the bowl surface —
        // a spherical zone here would strangle both routes passing nearby
        for (const b of this.balls) {
            if (b.carried >= 0) continue;
            const p = b.body.translation();
            const rxz = Math.hypot(p.x - VORTEX.cx, p.z - VORTEX.cz);
            if (rxz > VORTEX.R + 0.1 || p.y > VORTEX.rimY + 0.15 || p.y < VORTEX.rimY - VORTEX.depth - 0.1) continue;
            const surf = vortexY(Math.max(VORTEX.rt, Math.min(VORTEX.R, rxz))) + BALL_R;
            if (Math.abs(p.y - surf) < 0.12) {
                const v = b.body.linvel();
                const k = Math.max(0, 1 - 0.45 * dt);
                b.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
            }
        }
    }

    _buildZones() {
        this.zones = [
            { c: this.trackA.ballCenterAt(this.trackA.length - 0.5, BALL_H, new THREE.Vector3()), r: 0.5, vmax: 2.4 },
            { c: this.trackB.ballCenterAt(this.trackB.length - 0.55, BALL_H, new THREE.Vector3()), r: 0.55, vmax: 2.2 },
            // arrive gently at the route switch (must land ON the tray, not past it)
            { c: this.dispatch.ballCenterAt(this.dispatch.length - 0.3, BALL_H, new THREE.Vector3()), r: 0.4, vmax: 0.8 },
        ];
    }

    // ------------------------------------------------------------------ events
    _drainEvents() {
        this.eventQueue.drainContactForceEvents(ev => {
            const t1 = this.tags.get(ev.collider1());
            const t2 = this.tags.get(ev.collider2());
            const f = ev.totalForceMagnitude();
            const b1 = t1 && t1.kind === 'ball' ? t1.ball : null;
            const b2 = t2 && t2.kind === 'ball' ? t2.ball : null;
            if (b1) b1.lastContact = this.time;
            if (b2) b2.lastContact = this.time;
            if (this.debugForces && f > 40) {
                const other = b1 ? (b2 ? 'ball' : (t2 ? t2.kind : '?')) : (t1 ? t1.kind : '?');
                if (this._forceLog.length < 400) this._forceLog.push([other, Math.round(f)]);
            }
            if (b1 && b2) {
                if (f > F_CLICK && this.time > b1.clickCool) {
                    b1.clickCool = b2.clickCool = this.time + 0.09;
                    this._sound('click', (b1.pos.x + b2.pos.x) / 2, Math.min(1, f / 900));
                }
                return;
            }
            const ball = b1 || b2;
            const other = b1 ? t2 : t1;
            if (!ball || !other) return;
            switch (other.kind) {
                case 'bar': {
                    const bar = other.bar;
                    if (f > F_CHIME && this.time > bar.lastFire + 0.09) {
                        bar.lastFire = this.time;
                        this.stats.chimes++;
                        this.barFlash[bar.note] = 1;
                        this._sound('chime', bar.x, Math.min(1, f / 1200), bar.note);
                    }
                    break;
                }
                case 'bell':
                    if (f > F_BELL && this.time > (this._bellFire || -1) + 0.35) {
                        this._bellFire = this.time;
                        this.stats.bells++;
                        this.bellWobble = 1;
                        this._sound('bell', BELL.c.x);
                    }
                    break;
                case 'tramp': {
                    const tr = other.tramp;
                    if (f > F_BOING && this.time > tr.lastFire + 0.18) {
                        tr.lastFire = this.time;
                        this.stats.boings++;
                        tr.dip = 1;
                        this._sound('boing', tr.p.x);
                    }
                    break;
                }
                case 'gutter':
                    if (f > F_THUNK && this.time > ball.thunkCool) {
                        ball.thunkCool = this.time + 0.3;
                        this._sound('thunk', ball.pos.x, Math.min(1, f / 1600));
                    }
                    break;
            }
        });
    }

    _sound(type, x, vel = 1, note = 0) {
        if (this.silent || this._soundBudget <= 0) return;
        this._soundBudget--;
        if (type === 'chime') this.audio.chime(note, x, vel);
        else if (type === 'bell') this.audio.bell(x);
        else if (type === 'boing') this.audio.boing(x);
        else if (type === 'click') this.audio.click(x, vel);
        else if (type === 'thunk') this.audio.thunk(x, vel);
        else if (type === 'clank') this.audio.clank(x);
        else if (type === 'tick') this.audio.tick(x);
    }

    // ------------------------------------------------------------------ safety
    _safetyChecks(dt) {
        for (const b of this.balls) {
            if (b.carried >= 0) { b.strayTime = 0; b.stillTime = 0; continue; }
            const p = b.body.translation();
            if (p.y < -0.5) { this._respawn(b); continue; }
            let nearGutter = false;
            for (const g of this.gutterSamples) {
                const dx = p.x - g.x, dy = p.y - g.y, dz = p.z - g.z;
                if (dx * dx + dy * dy + dz * dz < 0.16) { nearGutter = true; break; }
            }
            // fell off the sculpture
            if (p.y < 0.30 && !nearGutter) {
                b.strayTime += dt;
                if (b.strayTime > 1.5) this._respawn(b);
            } else b.strayTime = 0;
            // Confinement rescue: a ball that fails an element rolls back and
            // oscillates forever in the low-friction tube — its speed never
            // stays under any threshold, so test POSITION confinement instead.
            // A confined ball is an immortal wall that every arrival piles onto.
            if (!nearGutter) {
                if (!b.anchor) b.anchor = new THREE.Vector3(p.x, p.y, p.z);
                if (Math.hypot(p.x - b.anchor.x, p.y - b.anchor.y, p.z - b.anchor.z) > 0.45) {
                    b.anchor.set(p.x, p.y, p.z);
                    b.confined = 0;
                } else {
                    b.confined = (b.confined || 0) + dt;
                    if (b.confined > 5) { b.confined = 0; b.anchor = null; this._respawn(b); }
                }
            } else { b.confined = 0; b.anchor = null; }
        }
    }

    _respawn(b) {
        this.stats.respawns++;
        b.strayTime = 0;
        // drop into the OPEN middle of the gutter at this ball's own slot
        const rp = this.respawnPts[b.id];
        b.body.setTranslation({ x: rp.x, y: rp.y, z: rp.z }, true);
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    // ------------------------------------------------------------------ lift
    _stepLift(dt) {
        const H = LIFT_Y_TOP - LIFT_Y_BOT;
        const P = 2 * H + 2 * Math.PI * SPROCKET_R;
        this.liftPos = (this.liftPos + LIFT_SPEED * dt) % P;
        for (let c = 0; c < N_CUPS; c++) {
            const dPrev = this.cupD[c];
            const d = (this.liftPos + c * P / N_CUPS) % P;
            this.cupD[c] = d;
            if (d < H && dPrev < H && dPrev <= d) {
                const yPrev = LIFT_Y_BOT + dPrev, y = LIFT_Y_BOT + d;
                if (yPrev < 0.34 && y >= 0.34) {
                    // scoop the ball waiting at the gutter end
                    let best = null, bestD = 0.30;
                    for (const b of this.balls) {
                        if (b.carried >= 0) continue;
                        const p = b.body.translation();
                        const dd = Math.hypot(p.x - PICKUP.x, p.y - PICKUP.y, p.z - PICKUP.z);
                        if (dd < bestD) { bestD = dd; best = b; }
                    }
                    if (best) {
                        best.carried = c;
                        best.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
                        // ghost through the queue — a kinematic ball rising through
                        // the pile pinches its neighbors and ejects them
                        best.body.collider(0).setSensor(true);
                        this._sound('clank', LIFT_X);
                    }
                }
                if (yPrev < 6.96 && y >= 6.96) {
                    const ball = this.balls.find(bb => bb.carried === c);
                    if (ball) {
                        ball.carried = -1;
                        const f = this.dispatch.frameAt(0.06, {});
                        const p = this.dispatch.ballCenterAt(0.06, BALL_H, this._tmp);
                        ball.body.collider(0).setSensor(false);
                        ball.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
                        ball.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
                        ball.body.setLinvel({ x: f.t.x * 0.7, y: f.t.y * 0.7, z: f.t.z * 0.7 }, true);
                        ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
                        this.stats.laps++;
                        this._sound('clank', LIFT_X);
                    }
                }
            }
        }
        for (const b of this.balls) {
            if (b.carried >= 0) {
                const d = Math.min(this.cupD[b.carried], H);
                b.body.setNextKinematicTranslation({ x: LIFT_X, y: LIFT_Y_BOT + d + 0.13, z: 0.12 });
            }
        }
    }

    // ------------------------------------------------------------------ switch
    _stepSwitch(dt) {
        for (const b of this.balls) {
            if (b.carried >= 0) continue;
            const p = b.body.translation();
            const dx = p.x - SWITCH_C.x, dy = p.y - SWITCH_C.y, dz = p.z - SWITCH_C.z;
            const inside = dx * dx + dy * dy + dz * dz < 0.55; // past the tray ends
            if (b.inSwitch && !inside) {
                // ball has left — queue the flip, but don't move the tray yet
                if (this.switchNext === 0) this.stats.switchA++; else this.stats.switchB++;
                this._pendingFlip = true;
            }
            b.inSwitch = inside;
        }
        // flip only once the tray area is clear — tilting under a departing ball
        // catapults it off the end
        if (this._pendingFlip) {
            let clear = true;
            for (const b of this.balls) {
                if (b.carried >= 0) continue;
                const p = b.body.translation();
                const dx = p.x - SWITCH_C.x, dy = p.y - SWITCH_C.y, dz = p.z - SWITCH_C.z;
                if (dx * dx + dy * dy + dz * dz < 1.0) { clear = false; break; }
            }
            if (clear) {
                this._pendingFlip = false;
                this.switchNext = 1 - this.switchNext;
                this._sound('tick', SWITCH_C.x);
            }
        }
        // -tilt drops the -z end (route A), +tilt the +z end (route B)
        const target = this.switchNext === 0 ? -TEETER.tilt : TEETER.tilt;
        this.switchAngle += (target - this.switchAngle) * Math.min(1, 6 * dt);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.switchAngle);
        this.switchBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }

    // ------------------------------------------------------------------ builders
    _buildScenery() {
        const plinth = new THREE.Mesh(
            new THREE.BoxGeometry(11.4, 0.26, 6.0),
            new THREE.MeshStandardMaterial({ color: 0x191a20, metalness: 0.4, roughness: 0.6 }));
        plinth.position.set(-0.6, -0.13, 0);
        plinth.receiveShadow = true;
        this.scene.add(plinth);
        const pc = this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(5.7, 0.13, 3.0).setTranslation(-0.6, -0.13, 0)
                .setFriction(0.5).setRestitution(0.2));
        this._tag(pc, { kind: 'floor' });

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(30, 48),
            new THREE.MeshStandardMaterial({ color: 0x0d0d12, roughness: 0.95 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.27;
        floor.receiveShadow = true;
        this.scene.add(floor);
        const fc = this.world.createCollider(
            RAPIER.ColliderDesc.cuboid(30, 0.05, 30).setTranslation(0, -0.32, 0).setFriction(0.6));
        this._tag(fc, { kind: 'floor' });

        const postMat = new THREE.MeshStandardMaterial({ color: 0x15161b, metalness: 0.8, roughness: 0.35 });
        const corners = [[-5.9, -2.7], [-5.9, 2.7], [4.7, -2.7], [4.7, 2.7]];
        for (const [x, z] of corners) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.9, 10), postMat);
            post.position.set(x, 3.95, z);
            post.castShadow = true;
            this.scene.add(post);
        }
        const beam = (a, b) => {
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const m = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), postMat);
            m.position.set((a[0] + b[0]) / 2, 7.85, (a[1] + b[1]) / 2);
            m.rotation.z = Math.PI / 2;
            m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
            this.scene.add(m);
        };
        beam(corners[0], corners[1]); beam(corners[2], corners[3]);
        beam(corners[0], corners[2]); beam(corners[1], corners[3]);

        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.8, 10), postMat);
        col.position.set(-1.0, 3.4, -1.4);
        col.castShadow = true;
        this.scene.add(col);
    }

    _addStruts() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.7, roughness: 0.5 });
        for (const tr of this.railTracks) {
            for (let s = 1.2; s < tr.length - 0.5; s += 3.0) {
                const f = tr.frameAt(s, {});
                if (Math.abs(f.t.y) > 0.45 || f.p.y < 0.55) continue;
                const h = f.p.y;
                const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, h, 6), mat);
                strut.position.set(f.p.x, h / 2, f.p.z);
                this.scene.add(strut);
            }
        }
    }

    _buildLift() {
        this.liftPos = 0;
        this.cupD = new Array(N_CUPS).fill(0);
        const H = LIFT_Y_TOP - LIFT_Y_BOT;
        const P = 2 * H + 2 * Math.PI * SPROCKET_R;
        for (let c = 0; c < N_CUPS; c++) this.cupD[c] = (c * P / N_CUPS) % P;

        const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d46, metalness: 0.9, roughness: 0.35 });
        const zm = LIFT_Z_UP - SPROCKET_R;
        for (const y of [LIFT_Y_TOP, LIFT_Y_BOT]) {
            const sp = new THREE.Mesh(new THREE.CylinderGeometry(SPROCKET_R, SPROCKET_R, 0.06, 20), steel);
            sp.rotation.z = Math.PI / 2;
            sp.position.set(LIFT_X, y, zm);
            sp.castShadow = true;
            this.scene.add(sp);
        }
        for (const z of [LIFT_Z_UP, zm - SPROCKET_R]) {
            const g = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, H, 6), steel);
            g.position.set(LIFT_X, (LIFT_Y_TOP + LIFT_Y_BOT) / 2, z);
            this.scene.add(g);
        }
        const mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, H + 0.8, 0.1), steel);
        mast.position.set(LIFT_X - 0.22, (LIFT_Y_TOP + LIFT_Y_BOT) / 2, zm);
        mast.castShadow = true;
        this.scene.add(mast);

        this.cupMeshes = [];
        const cupMat = new THREE.MeshStandardMaterial({ color: 0xd62828, metalness: 0.6, roughness: 0.35 });
        for (let c = 0; c < N_CUPS; c++) {
            const grp = new THREE.Group();
            const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.26), cupMat);
            tray.position.set(0, 0, -0.17);
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.04), cupMat);
            back.position.set(0, 0.06, -0.03);
            grp.add(tray, back);
            grp.traverse(o => { o.castShadow = true; });
            this.scene.add(grp);
            this.cupMeshes.push(grp);
        }
    }

    cupWorldPos(c, out) {
        const H = LIFT_Y_TOP - LIFT_Y_BOT;
        const d = this.cupD[c];
        const zm = LIFT_Z_UP - SPROCKET_R;
        if (d < H) return out.set(LIFT_X, LIFT_Y_BOT + d, LIFT_Z_UP);
        let r = d - H;
        if (r < Math.PI * SPROCKET_R) {
            const a = r / SPROCKET_R;
            return out.set(LIFT_X, LIFT_Y_TOP + SPROCKET_R * Math.sin(a), zm + SPROCKET_R * Math.cos(a));
        }
        r -= Math.PI * SPROCKET_R;
        if (r < H) return out.set(LIFT_X, LIFT_Y_TOP - r, zm - SPROCKET_R);
        r -= H;
        const a = r / SPROCKET_R;
        return out.set(LIFT_X, LIFT_Y_BOT - SPROCKET_R * Math.sin(a), zm - SPROCKET_R * Math.cos(a));
    }

    _buildSwitch() {
        // Rhoads-style tipping-arm switch: the dispatch drops the ball onto a
        // V-tray whose groove runs across the flow (along z). The tray tilts to
        // one end; the ball rolls along the groove and exits axis-aligned into
        // that route's flared channel mouth. The tray is kinematic, but it's an
        // open surface — nothing can be pinched against it.
        this.switchNext = 0;
        this.switchAngle = -TEETER.tilt;

        this.switchBody = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.kinematicPositionBased()
                .setTranslation(TEETER.pivot.x, TEETER.pivot.y, TEETER.pivot.z));
        // deep V: wall tops must reach the ball's equator or it sloshes over the side
        const wallRot = 0.85;
        const mat = new THREE.MeshStandardMaterial({ color: 0xf6c90e, metalness: 0.7, roughness: 0.3 });
        const grp = new THREE.Group();
        for (const sign of [-1, 1]) {
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sign * wallRot);
            const cx = sign * 0.26 * Math.cos(wallRot), cy = -0.06 + 0.26 * Math.sin(wallRot);
            const col = this.world.createCollider(
                RAPIER.ColliderDesc.cuboid(0.26, 0.015, TEETER.halfLen)
                    .setTranslation(cx, cy, 0)
                    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
                    .setFriction(0.4).setRestitution(0.1), this.switchBody);
            this._tag(col, { kind: 'rail' });
            const wall = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.03, TEETER.halfLen * 2), mat);
            wall.position.set(cx, cy, 0);
            wall.rotation.z = sign * wallRot;
            wall.castShadow = true;
            grp.add(wall);
        }
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8),
            new THREE.MeshStandardMaterial({ color: 0x3a3d46, metalness: 0.9, roughness: 0.35 }));
        axle.rotation.z = Math.PI / 2;
        grp.add(axle);
        grp.position.copy(TEETER.pivot);
        this.scene.add(grp);
        this.switchMesh = grp;

        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.045, TEETER.pivot.y - 0.1, 8),
            new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.8, roughness: 0.4 }));
        post.position.set(TEETER.pivot.x, (TEETER.pivot.y - 0.1) / 2, TEETER.pivot.z);
        this.scene.add(post);
    }

    _latheTrimesh(profile, cx, cz, material, tagKind, props = {}) {
        const geo = new THREE.LatheGeometry(profile, 48);
        geo.translate(cx, 0, cz);
        const mesh = new THREE.Mesh(geo, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        const col = this.world.createCollider(
            RAPIER.ColliderDesc.trimesh(
                new Float32Array(geo.attributes.position.array),
                new Uint32Array(geo.index.array))
                .setFriction(props.friction ?? 0.45)
                .setRestitution(props.restitution ?? 0.1));
        this._tag(col, { kind: tagKind });
        return mesh;
    }

    _buildVortex() {
        const profile = [];
        for (let i = 0; i <= 26; i++) {
            const r = VORTEX.rt + (VORTEX.R - VORTEX.rt) * i / 26;
            profile.push(new THREE.Vector2(r, vortexY(r)));
        }
        // minimal lip: a wide flared lip at r=1.35 pierces route A's tube passing by
        profile.push(new THREE.Vector2(VORTEX.R + 0.02, VORTEX.rimY + 0.01));
        this._latheTrimesh(profile, VORTEX.cx, VORTEX.cz,
            new THREE.MeshPhysicalMaterial({ color: 0x9fb4c8, metalness: 0.9, roughness: 0.16, side: THREE.DoubleSide }),
            'bowl', { friction: 0.3 });

        // wire fence around the rim (gap at the west entry) so a hot ball can't
        // ride up the far wall and sail out of the bowl
        // arc covers east/north/northwest only: the southwest quadrant is the
        // track entry AND route A's tube passes under the fence circle there —
        // a ring segment above that tube wedges stray balls against its shell
        const fencePts = [];
        for (let k = 0; k <= 36; k++) {
            const az = (270 + 230 * k / 36) * Math.PI / 180;
            fencePts.push(new THREE.Vector3(VORTEX.cx + 1.30 * Math.cos(az), 0, VORTEX.cz + 1.30 * Math.sin(az)));
        }
        const Yup = new THREE.Vector3(0, 1, 0), qf = new THREE.Quaternion();
        const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3a3d46, metalness: 0.85, roughness: 0.4 });
        for (const fy of [4.06, 4.18]) {
            for (let k = 0; k + 1 < fencePts.length; k++) {
                const a = fencePts[k], b = fencePts[k + 1];
                const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).setY(fy);
                const dir = new THREE.Vector3().subVectors(b, a).normalize();
                qf.setFromUnitVectors(Yup, dir);
                const col2 = this.world.createCollider(
                    RAPIER.ColliderDesc.capsule(a.distanceTo(b) / 2, 0.013)
                        .setTranslation(mid.x, mid.y, mid.z)
                        .setRotation({ x: qf.x, y: qf.y, z: qf.z, w: qf.w })
                        .setFriction(0.0).setRestitution(0.3));
                this._tag(col2, { kind: 'rail' });
            }
            const ringPts = fencePts.map(p => new THREE.Vector3(p.x, fy, p.z));
            const tube = new THREE.Mesh(
                new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts, false, 'catmullrom', 0), 60, 0.011, 5),
                fenceMat);
            this.scene.add(tube);
        }

        // throat tube
        // flush with the bowl bottom — a protruding lip catches balls at the throat
        const tubeGeo = new THREE.CylinderGeometry(VORTEX.rt + 0.03, VORTEX.rt + 0.03,
            vortexY(VORTEX.rt) - TUBE_BOTTOM, 20, 1, true);
        tubeGeo.translate(VORTEX.cx, (vortexY(VORTEX.rt) + TUBE_BOTTOM) / 2 - 0.05, VORTEX.cz);
        const tube = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({
            color: 0x7d8ea0, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide,
        }));
        this.scene.add(tube);
        const tc = this.world.createCollider(
            RAPIER.ColliderDesc.trimesh(
                new Float32Array(tubeGeo.attributes.position.array),
                new Uint32Array(tubeGeo.index.array)).setFriction(0.3));
        this._tag(tc, { kind: 'rail' });

        const legMat = new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.7, roughness: 0.5 });
        for (let i = 0; i < 3; i++) {
            const a = i / 3 * Math.PI * 2 + 0.5;
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, VORTEX.rimY - 0.5, 8), legMat);
            leg.position.set(VORTEX.cx + Math.cos(a) * 0.9, (VORTEX.rimY - 0.5) / 2, VORTEX.cz + Math.sin(a) * 0.9);
            leg.rotation.x = Math.sin(a) * 0.12;
            leg.rotation.z = -Math.cos(a) * 0.12;
            this.scene.add(leg);
        }
    }

    _buildBell() {
        const pts = [];
        for (let i = 0; i <= 20; i++) {
            const a = i / 20 * Math.PI / 2;
            pts.push(new THREE.Vector2(Math.cos(a) * BELL.r, Math.sin(a) * BELL.r * 0.92));
        }
        pts.reverse();
        const dome = new THREE.Mesh(
            new THREE.LatheGeometry(pts, 40),
            new THREE.MeshStandardMaterial({ color: 0xc9962a, metalness: 0.95, roughness: 0.22 }));
        dome.castShadow = true;
        const grp = new THREE.Group();
        grp.add(dome);
        const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.045, BELL.c.y, 10),
            new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.8, roughness: 0.4 }));
        post.position.y = -BELL.c.y / 2;
        grp.add(post);
        grp.position.copy(BELL.c);
        this.scene.add(grp);
        this.bellMesh = grp;
        this.bellWobble = 0;

        const bc = this.world.createCollider(
            RAPIER.ColliderDesc.ball(BELL.r * 0.96).setTranslation(BELL.c.x, BELL.c.y, BELL.c.z)
                .setFriction(0.2).setRestitution(0.8)
                .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max));
        this._tag(bc, { kind: 'bell' });

        // catch funnel around/below the bell, feeding the trampoline relay
        const fp = [
            new THREE.Vector2(FUNNEL.throatR, FUNNEL.throatY0),
            new THREE.Vector2(FUNNEL.throatR, FUNNEL.throatY1),
            new THREE.Vector2(FUNNEL.throatR + 0.12, FUNNEL.throatY1 + 0.10),
            new THREE.Vector2(FUNNEL.rimR * 0.6, FUNNEL.rimY - 0.18),
            new THREE.Vector2(FUNNEL.rimR, FUNNEL.rimY),
        ];
        this._latheTrimesh(fp, FUNNEL.cx, FUNNEL.cz,
            new THREE.MeshStandardMaterial({ color: 0x6b7a8c, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }),
            'funnel', { friction: 0.35 });
    }

    _buildBars() {
        this.barMeshes = [];
        this.barFlash = new Array(BARS.length).fill(0);
        const postMat = new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.7, roughness: 0.5 });
        const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), BAR_TILT);
        BARS.forEach((bar, i) => {
            const hue = i / BARS.length;
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(hue, 0.75, 0.55),
                metalness: 0.85, roughness: 0.25,
                emissive: new THREE.Color().setHSL(hue, 0.75, 0.4), emissiveIntensity: 0,
            });
            const hz = 0.17 + i * 0.015;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, hz * 2), mat);
            mesh.position.set(bar.x, bar.top - 0.02, bar.z);
            mesh.quaternion.copy(qTilt);
            mesh.castShadow = true;
            this.scene.add(mesh);
            this.barMeshes.push(mesh);
            const bc = this.world.createCollider(
                RAPIER.ColliderDesc.cuboid(0.09, 0.02, hz)
                    .setTranslation(bar.x, bar.top - 0.02, bar.z)
                    .setRotation({ x: qTilt.x, y: qTilt.y, z: qTilt.z, w: qTilt.w })
                    .setFriction(0.35).setRestitution(0.72)
                    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max));
            this._tag(bc, { kind: 'bar', bar });
            for (const dz of [-0.12, 0.12]) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, bar.top, 6), postMat);
                post.position.set(bar.x, bar.top / 2 - 0.03, bar.z + dz);
                this.scene.add(post);
            }
        });
    }

    _buildTrampolines() {
        this.trampMeshes = [];
        const Y = new THREE.Vector3(0, 1, 0);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xd62828, metalness: 0.7, roughness: 0.3 });
        const skinMat = new THREE.MeshStandardMaterial({ color: 0x23242c, metalness: 0.1, roughness: 0.85, side: THREE.DoubleSide });
        const legMat = new THREE.MeshStandardMaterial({ color: 0x24252c, metalness: 0.7, roughness: 0.5 });
        for (const tr of TRAMPS) {
            tr.lastFire = -1;
            tr.dip = 0;
            const q = new THREE.Quaternion().setFromUnitVectors(Y, tr.n);
            const col = this.world.createCollider(
                RAPIER.ColliderDesc.cylinder(0.02, tr.r)
                    .setTranslation(tr.p.x, tr.p.y, tr.p.z)
                    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
                    .setFriction(0.35).setRestitution(0.93)
                    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max));
            this._tag(col, { kind: 'tramp', tramp: tr });

            const grp = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.TorusGeometry(tr.r, 0.028, 10, 32), frameMat);
            ring.rotation.x = Math.PI / 2;
            const skin = new THREE.Mesh(new THREE.CircleGeometry(tr.r - 0.015, 28), skinMat);
            skin.rotation.x = -Math.PI / 2;
            grp.add(ring, skin);
            grp.traverse(o => { o.castShadow = true; });
            grp.position.copy(tr.p);
            grp.quaternion.copy(q);
            this.scene.add(grp);
            tr.skin = skin;
            this.trampMeshes.push(grp);
            // legs
            for (const a of [0.6, 2.7, 4.6]) {
                const lx = tr.p.x + Math.cos(a) * tr.r * 0.85, lz = tr.p.z + Math.sin(a) * tr.r * 0.85;
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, tr.p.y, 6), legMat);
                leg.position.set(lx, tr.p.y / 2, lz);
                this.scene.add(leg);
            }
        }

    }

    _buildFences() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x3a3d46, metalness: 0.85, roughness: 0.4 });
        const Y = new THREE.Vector3(0, 1, 0);
        const addFence = (a, b, r = 0.012) => {
            const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
            const mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
            const dir = new THREE.Vector3().subVectors(B, A);
            const len = dir.length();
            dir.normalize();
            const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
            const col = this.world.createCollider(
                RAPIER.ColliderDesc.capsule(len / 2, r)
                    .setTranslation(mid.x, mid.y, mid.z)
                    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
                    .setFriction(0.2).setRestitution(0.2));
            this._tag(col, { kind: 'rail' });
            const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, len, 6), mat);
            m.position.copy(mid);
            m.quaternion.copy(q);
            this.scene.add(m);
        };
        // chime staircase corridor
        for (const dz of [-0.33, 0.33]) {
            addFence([-2.0, 1.42, 0.95 + dz], [-4.75, 0.55, 0.95 + dz]);
            addFence([-2.0, 1.20, 0.95 + dz], [-4.75, 0.38, 0.95 + dz]);
        }
        // trampoline relay corridor
        for (const dz of [-0.4, 0.4]) {
            addFence([3.1, 0.95, 1.44 + dz], [1.5, 0.85, 1.44 + dz]);
            addFence([3.1, 1.2, 1.44 + dz], [1.5, 1.1, 1.44 + dz]);
        }
    }

    _buildBrushes() {
        const mat = new THREE.MeshStandardMaterial({ color: 0xe07b39, roughness: 0.95 });
        for (const [tr, sMid] of [[this.trackA, this.trackA.length - 0.45], [this.trackB, this.trackB.length - 0.55]]) {
            const f = tr.frameAt(sMid, {});
            const brush = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.2), mat);
            brush.position.copy(f.p).addScaledVector(f.nrm, BALL_H + BALL_R + 0.06);
            brush.lookAt(this._tmp.copy(brush.position).add(f.t));
            brush.castShadow = true;
            this.scene.add(brush);
        }
    }

    // ------------------------------------------------------------------ render
    _render(dt) {
        for (const b of this.balls) {
            const p = b.body.translation();
            b.pos.set(p.x, p.y, p.z);
            b.mesh.position.copy(b.pos);
            const r = b.body.rotation();
            b.mesh.quaternion.set(r.x, r.y, r.z, r.w);
        }
        const H = LIFT_Y_TOP - LIFT_Y_BOT;
        for (let c = 0; c < N_CUPS; c++) {
            this.cupWorldPos(c, this._tmp);
            this.cupMeshes[c].position.copy(this._tmp);
            this.cupMeshes[c].visible = this.cupD[c] < H + 0.3 || this.cupD[c] > H + Math.PI * SPROCKET_R - 0.3;
        }
        this.switchMesh.rotation.x = this.switchAngle;
        if (this.bellWobble > 0.001) {
            this.bellWobble *= Math.exp(-3.5 * dt);
            this.bellMesh.rotation.x = Math.sin(this.time * 42) * 0.05 * this.bellWobble;
            this.bellMesh.rotation.z = Math.cos(this.time * 38) * 0.05 * this.bellWobble;
        }
        for (let i = 0; i < BARS.length; i++) {
            if (this.barFlash[i] > 0.002) {
                this.barFlash[i] *= Math.exp(-6 * dt);
                this.barMeshes[i].material.emissiveIntensity = this.barFlash[i] * 1.6;
            }
        }
        for (const tr of TRAMPS) {
            if (tr.dip > 0.002) {
                tr.dip *= Math.exp(-7 * dt);
                tr.skin.position.y = -tr.dip * 0.09;
                tr.skin.scale.setScalar(1 - tr.dip * 0.06);
            }
        }
        if (!this.silent) {
            for (const b of this.balls) {
                const v = b.body.linvel();
                const sp = Math.hypot(v.x, v.y, v.z);
                const rolling = (this.time - b.lastContact < 0.15) && b.carried < 0 ? sp : 0;
                this.audio.setRolling(b.id, rolling, b.pos.x);
            }
        }
    }
}
