# Gyroid Drift

An original 16-bar MIDI study for Gyroid Smoke: 4/4 at 112 BPM, about 34.29 seconds.
The A-minor arpeggio, sustained chords, and bass grow from a quiet opening into a
bright middle passage and soften for the close.

- Channel 1: melody and arpeggio, including gentle pitch bends.
- Channel 2: chords with sustain pedal (CC64).
- Channel 3: bass.

Modulation (CC1) swells through the piece. All notes, sustain, modulation, and
pitch bend are released or reset at the end. The file is Standard MIDI format 1
with 480 ticks per quarter note; it contains note/controller data, not audio.

Regenerate the bundled file deterministically with:

```sh
node docs/graphics/gyroidSmoke/demo/generate-demo.mjs
```
