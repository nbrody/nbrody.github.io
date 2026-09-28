# sphereKit: full-sphere scenes

The Dead & Co · Sphere visualizations are ten separate pages. In each, you stand at
the centre of a scene that fills every direction, including straight up, straight
down and behind you. Each page plays one scene; to run several in a row, build a
playlist in the Graphics Studio.

| Folder | Scene | Its own controls |
| --- | --- | --- |
| `deadLiftoff/` | Haight Street Liftoff: Haight & Ashbury at golden hour, then up over the Panhandle, Golden Gate Park, the fog and the Bay to orbit | keep rising, street → orbit, back to the street |
| `deadWallOfSound/` | Wall of Sound: amps with blue meters at eye level, woofers, mids and tweeters to LED crowns at both poles | cabinets around, rotation, light wash |
| `deadDarkStar/` | Dark Star: a black hole lensing a surrounding nebula, with photon ring and accretion disk | size, disk openness, nebula glow |
| `deadTieDye/` | Tie-Dye Sky: one loxodrome spiral from the point ahead to the point behind | arms, twist, bleed, resist folds |
| `deadLiquidLight/` | Liquid Light Show: oil blobs over dye, one projector dish ahead and one behind | blob count, size, iridescence, dish rotation |
| `deadFireMountain/` | Fire on the Mountain: a caldera with a burning ridge, an erupting peak and a lava lake below | flame height, embers, lava glow, Erupt (<kbd>E</kbd>) |
| `deadBears/` | Marching Bears: five rings of dancing bears above and below, around a sunburst | rings, march speed, bear size |
| `deadEyes/` | Eyes of the World: one great eye and a sky of smaller ones | great eye, eyes around, blink rate |
| `deadBolt/` | Lightning Bolt: a red/blue disc split by a white bolt, arcs meeting in a plasma globe behind you | emblem size, arcs, coin flip, ring of bolts |
| `deadRoses/` | Scarlet Roses: a garden over the whole sky, a rose on each pole, one great bloom | great rose size, roses around, falling petals |

Every scene also has the shared controls:

- **View:** lens (natural or fisheye), look left/right and up/down, field of view, gaze drift, tilt-to-look, recenter.
- **Groove:** tempo, beat pulse, motion speed, trip warp, colour shift, and a microphone mode that locks the beat to music in the room.
- **Show:** ⚡ Lightning, pause, render quality.

On the device itself:

- Drag to look around.
- Pinch or scroll to zoom.
- Double-tap to strike lightning where you tapped.

Keys:

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Pause |
| <kbd>L</kbd> | Lightning |
| <kbd>R</kbd> | Recenter |
| Arrow keys | Look around |
| <kbd>H</kbd> | Hide the panel (standalone only) |

From a phone, open a scene in the Graphics Studio and pair it. The phone's Simple
page leads with the scene's own controls, followed by look, zoom, tempo, trip,
lightning and recenter (`sphereScene()` in `../app/curation.js`).

## How a scene is built

Each scene folder holds two files:

- `index.html` holds the panel with the scene's own controls.
- `scene.js` holds one GLSL function, `vec3 scene(vec3 d, float t)`, of the view direction and the scene's clock. It declares its own uniforms and passes `startSphere()` a getter for each.

`kit.js` adds the shared controls, canvas, input handling and render loop, and
compiles `glsl.js`'s `HEAD + scene + MAIN` into one program: one pass per
pixel. Values a scene drives itself are accumulated in `onFrame`, so changing a
speed never makes the picture jump. These are the liftoff's journey, the wall's
turn, the liquid dish's rotation and the bears' march. With **Render quality:
Auto**, the resolution adapts to hold the frame rate.

To add a scene:

1. Copy a folder.
2. Write its `scene()` and controls.
3. Register it in `../app/manifest.js` with `cat: 'sphere'` and in `../app/curation.js` with `sphereScene(...)`.
4. Capture its thumbnail.

`tests/sphereScenes.mjs` loads every scene in the stage and drives one from a
paired remote.

`window.__sphere` exposes `ready`, `seek`, `strike` and `state` for tests and
thumbnails.

A fan-made tribute; not affiliated with Dead & Company or Sphere Entertainment.
