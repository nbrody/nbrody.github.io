# Beach Ball Machine

A George Rhoads–style audiokinetic ball machine built on a beach. Thirty beach balls climb a spiral lift carved into the trunk of a coconut palm. Under the fronds, a tree of flip-flop switches (made of flip-flops) sends each ball down one of six routes, playing instruments on the way down. Two of the routes are water slides. The tracks dig into the sand as they go: trenches where a track runs just below the surface, and tunnels with carved mouths where the sand closes over it. One water slide spirals round the keep of a sandcastle, breaks out through the curtain wall and rides the moat. The other spirals round a young palm and dives through a dune into a tide pool. Every ball comes home along a return channel cut round the sand pie at the palm's foot, which feeds the lift.

It is a sibling of the [Glass House Ball Machine](../ballMachine/) and runs on its physics engine unchanged. This folder adds the lift, the new routes, the sand and the beach.

## Run it

It's part of the Graphics Studio. Serve the repository over HTTP (ES modules don't load from `file://`), e.g. `python3 -m http.server 8124` from the repo root, and open `docs/graphics/beachMachine/`. That link opens the studio stage, which hides the machine's own panels and lists its controls in the studio panel and on the phone remote. Add `?standalone=1` for the full-page app with its own Machine panel, camera dock and start card.

`node tools/build-artifact.mjs [path-to-esbuild]` writes a single-file bundle to `dist/` (git-ignored) without the studio redirect, the same as the Glass House machine's.

Controls: **1** whole machine (orbit), **2** chase a ball, **3** ride on a ball (through the tunnels too), **4** guided tour, **5** follow a ball, **6** feature to feature, **[ ]** change ball, **N** follow the next ball out of the palm, **Space** pause, **H** hide the interface. Click any ball to chase it. The Machine panel picks a route (or leaves it to the flip-flops), sets the time of day (with a Sunset preset; the lighthouse and tiki torches come on at dusk), time scale, lift speed, ball count, the surf-and-gulls ambience and the echo.

## The lift

The palm's trunk is hollow. A helical track runs 5¾ turns up the inside, and a spiral slot cut through the bark follows it, so you can watch the balls climb. A shaft down the middle turns two pusher bars. Each bar sweeps the waiting ball off the end of the return channel and pushes it round and up the helix. The helix's pitch eases in and out over a quarter turn, so the ball starts and finishes level, and at the top the bar hands it out through a mouth in the trunk to the crown switches at the speed it was pushed (`SpiralLift` in `js/sim/devices.js`). Chase view rides up inside the trunk with the ball.

## The routes

| Route | What happens |
|---|---|
| Boardwalk Marimba | A sand sieve (a lined hopper funnel) resets the ball's speed, and a flip-flop alternates two boardwalks whose planks are a marimba. Lane I plays the call of "Drunken Sailor" and lane II the answer; the bars are placed where a probe ball will be on each beat. Then a ball-driven Ferris wheel, a spiral of tines round the lighthouse, and a second sieve that drops the ball home. |
| Steel Band | Nine switchback ramps slung between two giant surfboards. At every turn the ball flies off the ramp end, strikes a hanging steel pan and drops to the level below (a descending pentatonic calypso). |
| Surf's Up | A banked plunge into a loop-the-loop inside a curling wave, a surfboard ski jump, a sea-grass brake, round and round a conch-shell vortex funnel, two bass pans, and home through a tunnel in the sand. |
| Tide Pool Slide | Tuned bottles play "Row, Row, Row Your Boat". Then an open water slide spirals 3¼ turns down round a young palm, dives into a tube through the dune and shoots the ball into a whirlpool dug in the sand. It circles, drops through the drain and runs home underground. |
| Sandcastle | A helter-skelter water slide winds almost four times round the keep, ringing twelve tubular chimes, then dives into a culvert through the plinth and bursts out of the curtain wall under a tower into the moat. The moat's current carries the ball round the castle to a sluice, and a tunnel through the sand takes it to the return channel. |
| Sand Pail | A toy pail on a see-saw holds two balls; the third tips it. The train of balls runs a spiral chute under a beach umbrella into a brass ship's bell. |

The Boardwalk, Steel Band, Surf's Up and Sand Pail routes keep the tuned geometry of the Glass House machine's Marimba Run, Bell Tower, Daredevil and Gong Bucket, re-dressed. The Tide Pool Slide replaces its water slide, and the Sandcastle is new.

## The sand (`js/sim/terrain.js`, pure JS)

`sandHeight(x, z)` is the sculpted beach before any digging: a flat beach that shelves into the sea to the north, a sand pie round the palm with the return channel running round its rim, the castle's plinth, and a dune ridge with the tide pool dug into its end.

`digEarthworks(machine)` then follows every track through a heightfield, using each track's cross-section (a flume's round channel, a trough, or a pair of rails):

1. Channels that aren't tracks, such as the calm half of the moat, are dug first.
2. Each track sample is classified as clear of the sand, a **trench** (the ball runs below the surface but is open to the sky; sloping sides are cut back from it) or a **tunnel** (the sand closes over it). The moat is always open.
3. Trenches are dug and the tunnel samples are checked again, because a neighbouring trench may have cut the sand away over what was a tunnel. This repeats until nothing changes (at most four rounds).
4. Runs of tunnel samples become tunnels, each with its two mouths. Where a tunnel starts or ends at a hand-over from one track to the next, it gets a mouth only if the neighbouring track is in the open.

The renderer (`js/render/sand.js`) builds the sand mesh from the dug heightfield. It lines each tunnel with a tube of packed wet sand with glowing plankton specks, and cuts the mouths open with a shader that discards the sand inside a capsule round the track. The same carving shader pierces the castle's walls and towers where the slide passes through.

## Headless checks

```bash
node tests/headless.mjs 900 30       # 15 simulated minutes: routes, lost balls, derails, notes, pail tips, lift count
node tests/routes-locked.mjs         # every ball down one route at a time
node tests/route.mjs castle          # one ball down one route, logged: speed, how far up the wall, how wet
node tests/plot.mjs layout.svg       # plan and elevation, tunnels dashed
```

Over 15 minutes nothing derails or is lost. The locked-route test drops a few balls on the marimba and daredevil runs, the same number as the Glass House machine, whose tuned geometry those routes share.

The studio test (`docs/graphics/tests/beachMachine.mjs`) also checks the tunnels are dug and the palm lift runs. Set `THREE_DIR` to a local `three@0.169.0` package to run it offline.

## Files

- `js/sim/layout.js`: the layout (lift, crown, six routes, return channel); `devices.js`: the spiral lift, steel pans, ship's bell; `terrain.js`: the sand and the earthworks; `music.js`: the shanty.
- `js/render/`: `palm.js` (palms, and the lift palm's hollow slotted trunk), `sand.js` (sand, trenches, tunnels, mouths), `castle.js`, `water.js` (flumes, streams, moat, tide pool), `devices.js` (flip-flops, steel band, Ferris wheel, lighthouse, pail, umbrella, ship's bell, wave, bottles, chimes), `machineView.js` (the whole machine), `shaderBits.js` (shared GLSL and the carving shader).
- `js/env/`: `beach.js` (sky, sun, fog, decorative palms, umbrellas, towels, shells, beach grass, gulls, tiki torches, time of day), `sea.js` (swell, swash, foam and glitter).
- `js/cameras.js`: camera presets, riding through tunnels, the lift chase view, and the tour's beach itinerary. `js/audio.js`: the steel pan voice and the surf, gull and breeze ambience, on the Glass House machine's audio engine.
- Shared with `../ballMachine/`: the physics (`js/sim/`), the camera rig, the audio engine and its instruments, and the sky model.
