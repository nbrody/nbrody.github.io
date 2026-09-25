# 3D Gyroid Smoke

A room that remembers the music. The scene opens as an empty, dark architectural
room viewed through its open front. MIDI notes add colored smoke to the room's
three-dimensional volume. Smoke accumulates and keeps moving after notes are
released or the demo stops; **Clear room** empties it.

Serve `docs/graphics` over HTTP and open `3dGyroidSmoke/index.html`. It joins the
Graphics Studio gallery, stage, playlists, and remote controls. Add
`?standalone=1` to use its floating local panel.

## Play and explore

Choose **Play MIDI demo** to hear the original 34-second **Gyroid Drift** study
and gradually fill the room. The demo loops by default. **Stop MIDI demo** stops
the music while leaving the smoke in place. **Connect MIDI** accepts a physical
or virtual keyboard through the shared MIDI controller. **Synth sound** provides
an optional browser instrument; switch it off when your keyboard already makes
sound. **Download MIDI** saves the included composition.

Drag the scene to orbit the camera and scroll to zoom. **Reset camera** restores
the opening view. The walls, floor, and lit seams provide depth references as you
look through the smoke. **Save image** exports the view without the controls.

- **Space** pauses or resumes smoke motion. Pausing also stops the MIDI demo.
- **R** clears the accumulated smoke; it does not reset the camera or music.
- **H** toggles the standalone controls.

## MIDI response

| Playing gesture | Room response |
| --- | --- |
| Note pitch | Smoke color and emission position |
| Note velocity | Amount of smoke emitted |
| Chords | Multiple plumes at once |
| Sustain pedal (CC64) | Holds released notes and their emission |
| Mod wheel (CC1) | Adds curl to the smoke motion |
| Pitch bend | Changes the lighting and bends the optional synth |
| Channel/polyphonic pressure | Adds expressive intensity |

**Smoke per note** sets the baseline emission and **MIDI response** scales the
playing gestures. **React to MIDI** turns off the visual response without
disconnecting the input. **All notes off** releases the voices and controllers;
it leaves the existing smoke in the room.

**Flow speed**, **Curl strength**, **Pulse**, and **Diffusion** shape the smoke's
motion. **Opacity** changes its appearance without clearing it. The simulation
stores smoke in a persistent 3D field, so orbiting changes the view through the
volume rather than rotating a flat picture. Render quality controls the cost of
drawing that volume.

## Volume and transport

The room starts with zero density and pigment in a 64 × 40 × 56 voxel grid.
The same layered `abs(dot(sin(p), cos(p.yzx)))` gyroid noise used in the 2D
shader supplies three vector potentials. Their three-dimensional curl drives
circulation, with an upward current and the original pulsing radial force.
The boundary flow is closed, so smoke cannot escape through the walls.

Density and density-weighted color move across shared voxel faces with
conservative transport. Four shorter transport steps per simulation frame
support room-scale velocities, and limited second-order reconstruction keeps
plume boundaries from being erased by first-order numerical diffusion.
There is no deliberate smoke decay. Half-float values are explicitly rounded
before storage to avoid cumulative truncation on affected GPU drivers.

The display raymarches the persistent volume, with absorption, noise-spaced
density-gradient lighting, fine gyroid folds, and smoke shadows on the room.
The cutaway follows the camera, exposing the near walls so the room stays
inspectable from different angles. Flow speed changes transport, while note
emission continues even at zero flow speed. Render quality and window resizing
only change the display; they never reset the stored smoke.

The room percentage is an approximate sampled fraction of voxels above a small
density threshold, not a percentage of opaque space. WebGL 2 and floating-point
render targets are required. The source is a visual gyroid-driven transport
model, not a full pressure-projected Navier–Stokes solver.

## Shared MIDI implementation

This project reuses [`../gyroidSmoke/midi.js`](../gyroidSmoke/midi.js), its MIDI
state interpreter and file parser, and the original
[`Gyroid Drift` MIDI file](../gyroidSmoke/demo/gyroid-smoke-demo.mid). The shared
controller handles live input, demo timing, sustain, expressive controls, and
the optional synth. The 3D renderer owns the room, smoke, camera, and lighting.

Live MIDI requires browser support and permission; use Chrome or Edge over
HTTPS or localhost. Permissions are requested only when **Connect MIDI** is
clicked. The demo works without a keyboard or MIDI-device permission. Hiding
the page stops the demo and releases active voices. No MIDI output is sent to
the keyboard.

Browser checks live in `tests/3dGyroidSmoke.mjs`, with the same Playwright and
local-server setup as the original smoke tests. They inspect actual GPU voxels
for empty startup, note emission, persistence, clear, and preservation while
resizing or orbiting. Physical keyboard behavior still needs a hardware check.
