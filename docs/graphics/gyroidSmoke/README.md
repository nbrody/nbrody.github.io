# Gyroid Smoke

Serve `docs/graphics` over HTTP and open `gyroidSmoke/index.html`. It joins the
Graphics Studio gallery, stage, playlists, and remote controls automatically.
Add `?standalone=1` for the floating local panel.

## Start states

**Start state** (Flow section) chooses the frame the flow begins from; choosing
one restarts. **Mode default** keeps the original behavior: an empty room in
MIDI mode, the full-screen color wash otherwise. The structured states are
**Rings**, **Stripes**, **Checker**, **Spiral**, **Color wheel**, **Gyroid
slice** (two phases of the gyroid field itself; follows Pattern scale), and
**Yin-yang**. Their colors use the note palette and follow Color phase. Gaps
between shapes are genuinely empty, so in MIDI mode notes fill the gaps while
the covered shapes carry their own color. Press **S** to cycle forward
(Shift+S back).

At default curl, sharp shapes are shredded within about a second, so
**Start hold** eases the ambient curl and pulse in from zero over the chosen
number of seconds (4 by default; 0 disables it). Shapes then fray, stretch, and
dissolve into smoke. MIDI note stirring is never held back. The hold applies
only to the structured states, not to the mode default or the color wash.

## Backward and back-and-forth

**Direction** (Flow section, **B** cycles) runs the smoke in reverse:
**Backward · assemble** starts from scrambled smoke that gathers into the start
state over **Assembly time**, then hands over to the live flow, which begins
dissolving it again. **Back and forth** keeps assembling and dissolving.

The live feedback pass cannot be run backwards: it resamples through a
many-to-one warp and blurs every step. Instead, backward mode uses the fact that
the ambient velocity depends only on position and time, never on the smoke.
After n steps the smoke at `uv` is the start frame at `G_n(uv)`, and
`G_n(uv) = G_{n-1}(uv + step_n(uv))` is one lookup per step, like the smoke itself
(`map.glsl`). Maps are built forward once at half resolution in RGBA16F,
spread over a few frames, keeping a checkpoint every 10 steps (about 40 maps for 6 s; ~50 MB at
Balanced quality). Playback rebuilds `G_n` from the checkpoint below it, at most
nine half-resolution steps per frame, and `compose.glsl` draws the procedural start
state at `G_n(uv)`. At n = 0 the map is the identity, so the start state lands
exactly and the handover to the live flow is seamless.

The map also carries the wash that the live flow paints into its border
outside MIDI mode (weight and phase in b/a), so edge color recedes back into the
edges as the shape assembles. A pattern-space blur that grows with n stands in for the
live flow's diffusion. The first few seconds match the live flow closely; later
frames agree in structure but are less diffused.

Backward maps use a snapshot of curl, pulse, scale, and start hold; releasing
any of those sliders (or Assembly time, quality, or MIDI mode) rebuilds them.
Changing the start state does not: the map is independent of the pattern, so
the smoke simply assembles into the new shape. MIDI notes still light the
smoke but do not stir it in these modes. They would make the flow depend on
what was played. Backward needs float render targets; without them the
Direction control is disabled.

## MIDI keyboard and demo

**MIDI mode** starts with an empty black rectangle. Each note adds a colored
plume; the smoke keeps circulating after notes end and gradually fills the room
as you play. There is no automatic edge or background emission in this mode.
**Restart flow** (R) clears the room. Stopping the demo, disconnecting a keyboard,
or choosing **All notes off** stops emission without clearing existing smoke.
Turning MIDI mode off restores the original full-color field; turning it back
on starts a fresh empty room. The mode is on by default.

Choose **Play MIDI demo** in the Actions section to play the included original
34-second piece, **Gyroid Drift**. It uses the actual
[`demo/gyroid-smoke-demo.mid`](demo/gyroid-smoke-demo.mid) file and routes its events
through the same note interpreter as live input. **Download MIDI** saves that
file for use in a DAW or another MIDI player. The demo loops by default; **Stop
MIDI demo** clears just its notes, leaving a connected keyboard available.

To use a USB or virtual MIDI keyboard, click **Connect MIDI**, allow the browser
MIDI prompt, and choose the input under **MIDI**. Inputs arriving later are
discovered automatically. Use Chrome or Edge on HTTPS or localhost; browser
support and permission requirements are documented in the
[Web MIDI API reference](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API).
The embedded stage delegates MIDI access to the visualization. MIDI permissions
are requested only when Connect MIDI is clicked, without SysEx access.

| Playing gesture | Smoke response |
| --- | --- |
| Note pitch | Plume position and note color |
| Note velocity | Burst brightness, injection strength, and turbulence |
| Chords | Up to eight simultaneous plumes |
| Sustain pedal (CC64) | Holds released notes until pedal-up |
| Mod wheel (CC1) | Adds curl |
| Pitch bend | Rotates the light; bends the monitor synth by up to two semitones |
| Channel/polyphonic pressure | Adds brightness |

**MIDI response** adjusts the effect depth. Manual flow and lighting
sliders remain the baseline. Notes have a fast attack and a soft release, and
their injected color remains in the moving smoke afterward.

**Synth sound** enables a lightweight browser instrument for both the demo and
live keys. Switch it off when using the keyboard's own sound or an external
synth. MIDI files contain note/controller instructions, not recorded audio.
Audio may need a direct click on the display when using a separate remote.
**All notes off** clears all local voices and controllers. Disconnecting or
switching an input clears only its voices. Hiding the page stops the demo and
clears voices; pausing animation stops the demo. No MIDI output is sent to the
keyboard. Physical-device behavior still needs checking with your keyboard;
browser tests exercise the same input handlers using simulated MIDI devices.

`common.glsl` (the gyroid velocity field and start states) is prepended to the
flow, map, and compose passes. The two main shader files adapt the supplied Shadertoy passes:

- `buffer.glsl`: sample the previous unlit frame along the curl of a layered
  gyroid field and add a radial pulse. MIDI mode stores coverage in alpha and
  premultiplied pigment in RGB; compact note sources add to the remaining
  unfilled coverage, with no fade term. Outside MIDI mode, the initial frame
  fills the whole screen with a cosine palette and new color enters at the edges.
- `image.glsl`: estimate normals from coverage in MIDI mode (the red channel
  otherwise) at a noise-driven sampling radius, then apply the supplied
  directional relief lighting.

The renderer injects Shadertoy uniforms and the `main` wrapper. `iChannel0` in
the buffer is the previous buffer; in the image it is the current buffer.
`iChannel1` is a locally generated, static 1024² high-pass noise texture with an
approximately uniform histogram. It substitutes for the unspecified blue-noise
asset in the original snippet; it is not the original texture.

Defaults preserve the supplied curl, pulse, palette, radius, and light direction.
The radial vector is guarded at the origin to prevent undefined normalization.
Flow runs in fixed 1/60-second steps (bounded catch-up on slower devices). Lighting
never feeds back into the simulation. Linear-filtered RGBA16F feedback preserves
subtle gradients; devices without float render targets use RGBA8 instead.
Resolution has a pixel budget, and resizing resamples the existing smoke.
As in the supplied shader, the field uses six octaves below 500 pixels high and
eight otherwise. Quality changes can therefore change its fine structure.

Space pauses, R restarts, S cycles start states, B cycles direction, and H toggles the standalone panel. Pausing freezes
smoke injection and flow. Color phase changes newly injected smoke (from notes
in MIDI mode, or from the edges otherwise). Save image exports
the canvas without controls. Reduced-motion preferences pause playback initially.

For browser regression checks, serve the repository on port 8124 and run
`node docs/graphics/tests/gyroidSmoke.mjs` from the repository root. The test uses
Playwright and installed Chrome; `PLAYWRIGHT_MODULE`, `CHROME_PATH`, and
`GRAPHICS_TEST_URL` override the defaults.

MIDI checks: `node tests/gyroidSmoke-midi-state.mjs` and
`node tests/gyroidSmoke-midi-file.mjs` from `docs/graphics`. Browser integration:
`node tests/gyroidSmoke-midi-browser.mjs` with the same Playwright setup.
