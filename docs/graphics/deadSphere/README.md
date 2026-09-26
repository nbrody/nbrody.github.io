# Dead & Company · Sphere

A seat inside the Las Vegas Sphere during *Dead Forever*. The dome screen plays
ten scenes. Below it are the band on stage, beams cutting through the haze, and
rows of dancers in front of you, lit by whatever is on the screen.

| Scene | What plays |
| --- | --- |
| Haight Street Liftoff | Painted ladies at Haight & Ashbury at golden hour. The view then rises over the Panhandle and Golden Gate Park, past the marine layer and the Bay, up to orbit. |
| Wall of Sound | Amps with blue meters, then woofers, mids and tweeters up to a glowing crown. The cones pump on the kick and a ring of light rolls out from the stage on every beat. |
| Dark Star | A black hole over the stage: lensed nebula, photon ring, a Doppler-bright accretion disk and ripples on the beat. |
| Tie-Dye Sky | One loxodrome spiral, pole to pole, with bleeding dye and white resist folds. |
| Liquid Light Show | Oil blobs with thin-film edges drifting over domain-warped dye. |
| Fire on the Mountain | A ridge ringing the dome, an erupting peak ahead, lava running downhill, embers rising. |
| Marching Bears | Three rings of dancing bears circling a seventies sunburst. |
| Eyes of the World | One great eye where you look, with smaller eyes all around that blink and wander. |
| Lightning Bolt | A red/blue disc split by a white bolt that flips like a coin every 16 beats, with arcs crackling on the beat. |
| Scarlet Roses | One great bloom, a garden of roses and leaves, falling petals. |

## Controls

**From a phone (recommended).** Open the visualization in the Graphics Studio on
the big screen, then use **Studio → Pair a phone** (see `../README.md`). The
phone's Simple page has the scene picker, seat chips, and look, zoom, tempo and
trip sliders. It also has tiles for autopilot, ⚡ Lightning, Next scene,
Surprise me and Recenter. Every other control is on Advanced.

**On the device itself.**

- Drag to look around.
- Pinch or scroll to zoom.
- Double-tap to strike lightning where you tapped.
- Turn on **Tilt this device to look** to steer with a phone or tablet's motion
  sensor. iOS asks for permission first.
- **React to music in the room** listens through the microphone. Kicks drive
  the pulse and pull the beat clock into phase with the music.

**Keys:**

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Pause |
| <kbd>N</kbd> / <kbd>P</kbd> | Next / previous scene |
| <kbd>L</kbd> | Lightning |
| <kbd>A</kbd> | Autopilot |
| <kbd>S</kbd> | Next seat |
| <kbd>R</kbd> | Recenter |
| Arrow keys | Look around |
| <kbd>H</kbd> | Hide the panel (standalone only) |

Seats: Floor (GA), Sections 100/200/300, or floating at the center. The lens is
*Natural* (rectilinear) or *Fisheye* (up to 170°). Autopilot plays the list
above as a setlist with an iris wipe between scenes.

A playlist payload might look like:

```json
{"#scene": "darkStar", "#seat": "floor", "#bpm": 96, "#trip": 0.3, "#autopilot": false}
```

## How it renders

The interior is the unit sphere, about 70 m per unit, with the stage toward −z.
Rendering takes two passes per frame (`shaders.js`):

1. **The screen.** The scene program traces each pixel's ray to the dome and
   shades the scene for the direction seen from the sphere's centre. It writes
   the result to a mipmapped texture. During a crossfade, a second scene is
   blended over the first through a noisy iris opening from where the eye rests.
2. **The venue.** A second program traces the same rays against the floor, a
   ray-marched stage and band (drawn at 1.6× life size so the players read),
   rows of dancers (2D silhouettes in row planes), stage beams and lightning.
   It reads the screen texture's smallest mip as the room's ambient light and
   middle mips as glow, so the crowd is rim-lit by what is behind them.

Each scene in `scenes.js` is a single `vec3 scene(vec3 d, float t)` compiled
into its own program. Programs compile in the background, in parallel when
`KHR_parallel_shader_compile` is available. With **Render quality: Auto**, the
resolution adapts to hold the frame rate.

`window.__sphere` exposes `goTo`, `seek`, `strike`, `compileAll` and `state`
for tests and thumbnails. Run `tests/deadSphere.mjs` with the Playwright setup
described in the parent README.

A fan-made tribute; not affiliated with Dead & Company or Sphere Entertainment.
