# Glasshouse Excogitation

A George Rhoads–style audiokinetic ball machine in the browser. Thirty resin balls ride a chain lift to the crown, where a tree of flip-flop switches sends each one down one of five routes, playing instruments on the way down. The machine stands in a Victorian glass palm house with a time-of-day cycle.

## Run it

It's part of the Graphics Studio. Serve the repository over HTTP (ES modules don't load from `file://`), e.g. `python3 -m http.server 8124` from the repo root, and open `docs/graphics/ballMachine/`. That link enters the studio stage, which hides the machine's own panels and lists its controls in the studio panel and on the phone remote. Add `?standalone=1` for the full-page app with its own Machine panel, camera dock and start card.

The page loads the modules from `js/` unbundled. `node tools/build-artifact.mjs [path-to-esbuild]` writes a single-file bundle to `dist/` (git-ignored) without the studio redirect. Use it when a server chokes on many parallel module requests, or to publish the machine on its own.

Controls: **1** whole machine (orbit), **2** chase a ball, **3** ride on a ball, **4** guided tour, **[ ]** change ball, **N** follow the next ball off the lift, **Space** pause, **H** hide the interface. Click any ball to chase it. The Machine panel picks a route (or leaves it to the flip-flops), sets the time of day, time scale (slow motion), lift speed, ball count and sound.

## The routes

| Route | What happens |
|---|---|
| Marimba Run | A hopper funnel resets the ball's speed, and flip-flop F5 alternates two marimba lanes. Lane I plays the call of "Ode to Joy" and lane II the answer. After the lanes: a ball-driven overbalanced wheel, a glockenspiel spiral of tines, and a second hopper that drops the ball home. |
| Bell Tower | Nine switchback ramps. At every turn the ball flies off the ramp end, strikes a bronze bell, and drops to the level below (a descending D-major pentatonic). |
| Daredevil | A banked plunge, a caged loop-the-loop, a ski jump onto a landing ramp, a hyperbolic "gravity well" funnel, then two tilted tom-toms. |
| Glockenspiel Plinko | A helix and a hopper, then a glass case of 14 rows of tuned pegs. |
| Gong Bucket | A counterweighted trough holds two balls; the third tips it. The gate opens and the train of balls runs a spiral chute into a bronze gong. |

## How the physics works (`js/sim/`, no three.js, runs in Node)

- **Tracks** are designed like railways (`path.js`): plan geometry (straights, arcs, Dubins connections) plus an elevation profile with smooth vertical curves, and vertical loops. They are sampled by arc length with a moving frame (`track.js`).
- **Rolling on two rails**: the ball turns about the line through both contact points, `d = R cos α` from its centre, so its effective inertia factor is `k = 1 + (2/5)(R/d)^2 ≈ 1.64` (vs 1.4 on a flat floor). Along-track motion uses gravity, rolling resistance ∝ contact force (including centripetal load) and quadratic air drag. After an impact the ball **skids**: translation and spin are tracked separately and friction brings them back to rolling. This is billiards' "natural roll".
- **Banking**: each track is pre-simulated at its design speed and the rails are twisted so they lean into the apparent gravity, capped at 50° (loops excepted). A design check flags crests where a ball would lift off.
- **Free flight**, with bounces off boxes, capsules and disks (Coulomb friction, spin coupling), and **landing** on capture zones (bounce or attach).
- **Funnels** are surfaces of revolution `y = y0 − A(1/r − 1/r_out)`, integrated with explicit energy bookkeeping. Orbits speed up as they tighten, Kepler-style, and rim friction models the "wall of death".
- **Mechanisms**: chain lift, flip-flops, the overbalanced wheel (torque from carried balls, Coulomb + viscous friction, ratchet), and the tipping trough (counterweight torque; the third ball tips it).
- **Music is placed by physics**: a probe ball is run through the real integrator from the hopper outlet, and the marimba bars are placed where it will be on each beat.

Headless checks:

```bash
node tests/headless.mjs 1200 30
```

```bash
node tests/plot.mjs layout.png
```

The first runs 20 simulated minutes and reports routes, lost balls, derails and notes. The second draws the plan and elevations and reports track clearances.

## Files

- `js/sim/` — physics, layout, devices, music (pure JS)
- `js/render/` — three.js meshes, cameras, materials
- `js/environment.js`, `js/env/` — the glasshouse (sky, structure, plants, lighting, time of day)
- `js/audio.js` — Web Audio synthesis and spatialisation (everything synthesized)
- `dev/` — sound board and environment preview pages
