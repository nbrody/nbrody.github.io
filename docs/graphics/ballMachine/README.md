# Glass House Ball Machine

A George Rhoads–style audiokinetic ball machine in the browser. Thirty resin balls ride a chain lift to the crown, where a tree of flip-flop switches sends each one down one of six routes, playing instruments on the way down. One of them is a water slide. The machine stands in a Victorian glass palm house with a time-of-day cycle.

## Run it

It's part of the Graphics Studio. Serve the repository over HTTP (ES modules don't load from `file://`), e.g. `python3 -m http.server 8124` from the repo root, and open `docs/graphics/ballMachine/`. That link enters the studio stage, which hides the machine's own panels and lists its controls in the studio panel and on the phone remote. The Simple page's **Watch** picker has two automatic views: **Follow a ball** and **Feature to feature** (the stage opens on the second). Add `?standalone=1` for the full-page app with its own Machine panel, camera dock and start card.

The page loads the modules from `js/` unbundled. `node tools/build-artifact.mjs [path-to-esbuild]` writes a single-file bundle to `dist/` (git-ignored) without the studio redirect. Use it when a server chokes on many parallel module requests, or to publish the machine on its own.

Controls: **1** whole machine (orbit), **2** chase a ball, **3** ride on a ball, **4** guided tour, **5** follow a ball (it chases one ball all the way home, then picks up the next to leave the lift), **6** feature to feature (cuts between the devices, to where a ball has just been switched), **[ ]** change ball, **N** follow the next ball off the lift, **Space** pause, **H** hide the interface. Click any ball to chase it. The Machine panel picks a route (or leaves it to the flip-flops), sets the time of day, time scale (slow motion), lift speed, ball count and sound.

## The routes

| Route | What happens |
|---|---|
| Marimba Run | A hopper funnel resets the ball's speed, and flip-flop F5 alternates two marimba lanes. Lane I plays the call of "Ode to Joy" and lane II the answer. After the lanes: a ball-driven overbalanced wheel, a glockenspiel spiral of tines, and a second hopper that drops the ball home. |
| Bell Tower | Nine switchback ramps. At every turn the ball flies off the ramp end, strikes a bronze bell, and drops to the level below (a descending D-major pentatonic). |
| Daredevil | A banked plunge, a caged loop-the-loop, a ski jump onto a landing ramp, a brush brake, a hyperbolic "gravity well" funnel, then two tilted tom-toms. |
| Water Slide | Flip-flop F6 splits the Daredevil's arm. Ten tuned water glasses play "Row, Row, Row Your Boat… gently down the stream", then the ball goes down the stream: a flume that spirals two and a quarter turns round the pump's copper riser, a glass tunnel for the last turn and a quarter, and a splash into a whirlpool bowl. It circles the whirlpool a few times, drops through the drain and rolls home. |
| Glockenspiel Plinko | A helix and a hopper, then a glass case of 14 rows of tuned pegs. |
| Gong Bucket | A counterweighted trough holds two balls; the third tips it. The gate opens and the train of balls runs a spiral chute into a bronze gong. |

## How the physics works (`js/sim/`, no three.js, runs in Node)

- **Tracks** are designed like railways (`path.js`): plan geometry (straights, arcs, Dubins connections) plus an elevation profile with smooth vertical curves, and vertical loops. They are sampled by arc length with a moving frame (`track.js`).
- **Rolling on two rails**: the ball turns about the line through both contact points, `d = R cos α` from its centre, so its effective inertia factor is `k = 1 + (2/5)(R/d)^2 ≈ 1.64` (vs 1.4 on a flat floor). Along-track motion uses gravity, rolling resistance ∝ contact force (including centripetal load) and quadratic air drag. After an impact the ball **skids**: translation and spin are tracked separately and friction brings them back to rolling. This is billiards' "natural roll".
- **Banking**: each track is pre-simulated at its design speed and the rails are twisted so they lean into the apparent gravity, capped at 50° (loops excepted). A design check flags crests where a ball would lift off.
- **Free flight**, with bounces off boxes, capsules and disks (Coulomb friction, spin coupling), and **landing** on capture zones (bounce or attach).
- **Funnels** (the gravity well, the hoppers and the whirlpool's floor) are surfaces of revolution; the gravity well is `y = y0 − A(1/r − 1/r_out)` with an upturned lip at the rim. On them the ball is a sphere rolling without slipping (Routh's problem). Its tangential acceleration is `(F_t/m − μ_r N v̂)·5/7`, plus a gyroscopic term `(2/7) R ω_n (n × ṅ)`: rolling round a doubly curved surface makes the ball spin about the surface normal (`dω_n/dt = v_m v_θ (κ_θ − κ_m)/R`), and that drilling spin steers it. It is integrated in Lagrange's form on (r, θ), so the ball stays exactly on the surface and loses energy only to rolling resistance, drag and the wall. Circular orbits need `v² = (5/7) g A / r`, so the ball speeds up as it spirals in, Kepler-style.
- **Speed control**: the gravity well's rim orbit is only 0.5 m/s, and a ball straight off the ski jump runs at 3.7 m/s. A brush brake (two bristle strips at the ball's waist, `dv/dt = −3.4 v`) on the last metre of the landing ramp brings it in at about 1.3 m/s. It then circles about 15 times over 15 s, the lap rate rising from 0.3 to over 3 Hz before it drops through. The hoppers are lined, so they have a higher rolling resistance and reset a ball's speed in 3 to 5 s.
- **Mechanisms**: chain lift, flip-flops, the overbalanced wheel (torque from carried balls, Coulomb + viscous friction, ratchet), and the tipping trough (counterweight torque; the third ball tips it).
- **Music is placed by physics**: a probe ball is run through the real integrator from the hopper outlet, and the marimba bars are placed where it will be on each beat. The water glasses are placed the same way, with a probe ball released from the top of the lift.
- **The water slide** (`_stepFlume` in `world.js`): the flume is a round-bottomed channel. Along it the ball rolls like on any track, but a pumped stream pulls it toward the water's own speed. The stream runs at its normal depth for the local slope (Manning's formula), about 2 cm deep and 2.3 m/s down the spiral, and it banks up the wall in bends. The drag is ½ρ C_d A for the part of the ball that is actually under water, with buoyancy for that part too. Around the channel the ball is a pendulum in the apparent gravity `g − v²K`, so it swings up the outside wall in the spiral (about 50° at 3 m/s), damped by the wall and the water. An open flume has a rim to fly over; the glass tunnel doesn't.
- **The whirlpool**: under water the ball weighs a third as much (it is 1.5× as dense as water), drags an added mass of water with it, and meets about 40× the drag it does in air. The splash is where it crosses the surface; the bowl's wall keeps it in even in flight. The floor is a gentle cone steepening into a hyperbolic throat at the drain, and the water turns in a Lamb–Oseen vortex kept slower than the ball's own orbital speed, so the ball is carried round a few times and spirals in rather than orbiting for ever.

Headless checks:

```bash
node tests/headless.mjs 1200 30
```

```bash
node tests/plot.mjs layout.png
```

The first runs 20 simulated minutes and reports routes, lost balls, derails and notes. The second draws the plan and elevations and reports track clearances. `node tests/water.mjs` sends one ball down the water slide and logs its speed, how far up the wall it rides, the splash and its laps of the whirlpool.

## Files

- `js/sim/` — physics, layout, devices, music (pure JS)
- `js/render/` — three.js meshes, cameras, materials (`waterMeshes.js`: flume, stream, tunnel, riser and tank, whirlpool, water glasses, spray)
- `js/environment.js`, `js/env/` — the glasshouse (sky, structure, plants, lighting, time of day)
- `js/audio.js` — Web Audio synthesis and spatialisation (everything synthesized)
- `dev/` — sound board and environment preview pages
