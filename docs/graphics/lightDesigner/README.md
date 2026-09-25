# CK5 Virtual Rig

A virtual light rig in the spirit of Chris Kuroda's kinetic lighting for Phish,
over a bare stage and floor in a hazy black void (no band or audience). You can
choose from seven rig designs. Each keeps the same 72 heads: six kinetic units of
ten, plus twelve floor units along the upstage edge. So shows, groups, cues and
MIDI work on every rig. It's an impression, not a model of any real lighting plot.

## Scenes

The **Scenes** grid at the top of the Show tab has 20 complete looks, each with a
thumbnail. A scene is the whole rig: which rig, a held look, the pod shape, and
every Extras device. Click a thumbnail, press <kbd>1</kbd>–<kbd>0</kbd> for the first
ten, pick from **Launch scene** (the Studio remote sees this), play MIDI notes on
channel 16 from C2 up (one pad per scene), or link with `?scene=<id>`.

- **Morph**: when the new scene uses the same physical assets, colour and
  intensity crossfade over **Move time**. The heads pan and tilt there at motor
  speed and the pods travel at hoist speed, so the rig visibly flies to its new
  shape.
- **Cut**: when it needs different assets (another rig, a device switched on or
  off, tubes moved), it can't morph. It dips to black in 0.35 s, swaps, settles the
  hardware on its new marks and fades up over 0.8 s. Thumbnails marked **cut**
  show which scenes will do this from where you are now.
- **Auto-trigger** every 4–64 bars: in order, random, or *random, smooth moves
  only* (never cuts; if nothing reachable is smooth, it holds).
- The programmer, live FX and masters still apply on top of a scene. Pick a show
  to go back to timed playback.

Scenes are defined in `scenes.js`. Thumbnails are `scenes/<id>.webp` (480×300,
204 KB for all 20). Regenerate them with the repo served on port 8124:

```sh
node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs            # all scenes
node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs portal     # just some
```

## Rigs

The **Rig** selector is at the top of the Show tab; `?rig=<id>` in the URL also
picks one. Each rig decides what a unit is and what the kinetic *height* and
*roll* values do.

| Rig | id | Based on |
| --- | --- | --- |
| Kinetic pods | `pods` | This site's original sketch: six long pods front to back. |
| Circles | `circles` | Circular (and triangular) truss shapes from before 2018. By 2018 the band wanted to move away from the circle trusses. |
| Ovals | `ovals` | Kuroda's "ovals era", which he says "lasted like two weeks". |
| Squares | `squares` | Upright square portal frames. **Not sourced**: included by request; I found no published write-up of a squares rig. |
| Moving sticks | `sticks` | 2019–23: 30 separate sticks of 5′/8′/10′ truss, each on two hoists, on a 62′ grid, making zigzags, smiles, frowns and rooftops. |
| LED video wall | `wall2016` | Summer 2016: 78 LED panels reading as one ≈51′ × 5.6′ screen ≈22′ up, splitting apart in the second set. Sections show the colours their heads play. |
| Sphere | `sphere` | 2024: the virtual rig on Sphere's screen that "expands, contracts, shifts shapes, and spirals into infinity". Here, counter-rotating rings of light around a globe, with no hoists. |

Sources: [L4LM interview (2022)](https://liveforlivemusic.com/features/chris-kuroda-andrew-giffin-mobilizing-phish-lighting-operation-interview-2022/),
[JamBase on the 2016 LED rig](https://www.jambase.com/article/story-behind-new-phish-lighting-rig-featuring-led-panels),
[PLSN, December 2023](https://plsn.com/archives/december-2023/phish-fresh-performances-changing-looks/),
[Gateway on the 2022 tour](https://www.gsps.com/2022/10/05/phish-summer-tour-lighting-2022),
[5280 on Kuroda](https://5280.com/how-phishs-lighting-designer-keeps-the-fans-in-awe/),
[L4LM on the Sphere rig](https://liveforlivemusic.com/news/phish-sphere-virtual-lighting-rig-chris-kuroda-moment-factory-details-videos/).
Dimensions, head counts and exact motion are my own simplifications.

## Lasers (optional)

The **Extras** tab adds a laser package that works on any rig. It's in the spirit of
the Disco Biscuits, whose lighting designer Johnny R. Goode runs full-colour,
audience-scanning Lightwave International lasers alongside the moving heads
([Lightwave](https://lasershows.com/portfolio/disco-biscuits/)). There are six
projectors: the two upstage corners, upstage centre, the two wings and front of house.
Beams are razor-thin (drawn a fixed number of pixels wide), stop on the deck or the
floor, and otherwise run out into the haze.

- **Looks**: fans, sweeping fans, liquid sky (a rippling sheet just over the
  crowd), tunnel (a spinning cone), starburst, beam chase (jumps on the beat),
  crossfire (the wings plus front of house), and *follow the show*, which changes
  look by section and scales with how bright the show is.
- **Colour**: full-colour rotating, rainbow across each fan, classic green, the
  rig's dominant colour, or one colour.
- **Controls**: level, beams per fan, spread, scan period in beats, height over the
  crowd, and chop on the beat. The grand master, blackout, flash and haze level
  all apply to the lasers.
- In MIDI play mode, **Fire with MIDI notes** makes the lasers flash with your playing.
- `?lasers=1` turns them on from a link, and the page remembers the setting.

## Other devices (optional)

The **Extras** tab also holds the kit a jam-band LD reaches for. These devices work on
every rig and follow the grand master, blackout and flash. A **Quick kit** menu sets
them up in one step: arena, trance-fusion, psychedelic ’60s, everything, or nothing.
`?kit=phish|biscuits|dead|all` does the same from a link, and the page remembers the tab.

- **LED pixel tubes** (24 pixels each): a wall upstage, bars on the rig's truss
  (they ride the kinetics, like the LED bars on Phish's 2022 truss sticks),
  columns around the stage, or a canopy over the crowd. Looks: follow the nearest
  head, rain drips, rainbow wave, bar chase, sparkle, a level meter (show energy
  or MIDI), or flash on the beat.
- **Mirror balls**: one over the stage, or three with two over the crowd. Pin spots
  from the grid, faceted glints, rays through the haze, and spots sweeping the
  floor. Set spin, reflections, colour and level. *Drop the ball* lowers them from
  the grid; *Fly out* takes them away.
- **Blinders & strobes**: six 4-lite tungsten audience blinders (fast attack, slow,
  warming decay) and eight strobe bars. Hits can come on the drops (sections that
  cut in hard), every 4 bars, every beat, or with the show's own strobes. They fill
  the stage with light for an instant.
- **Liquid light show**: an oil-and-water projection on an upstage screen, with
  two dyes, oil and bubble walls. Palettes are classic, follow the rig, or acid,
  and it can pulse on the beat.
- **CO₂ jets**: six cryo jets downstage, fired on the drops, every 4 bars, every beat,
  or by *Blast now*.
- With **A MIDI crash cymbal fires…** on, a crash on channel 10 in MIDI play mode
  hits the blinders, strobes and CO₂.

## Files

- `layout.js`: the seven rigs (as poses of rigid bodies), fixtures, groups and aiming maths. A new rig is one object in `RIGS`.
- `engine.js`: the console. Each frame runs the show section (cross-faded with
  the one before it), then programmer overrides, live FX, the snapshot fade used by
  jumps and GO, highlight, masters, and finally physics (motor response, hoist speed).
- `shows.js`: six long shows (~58 min as a set), built from a small look vocabulary.
- `rig.js`: three.js renderer. It builds the stage, the floor and the selected rig's
  truss, panels and chains. Beams are instanced additive cones. Surfaces sample a
  per-fixture data texture, so beams leave pools on the deck and floor and catch the metal.
- `scenes.js`: the scene library and which controls count as physical assets.
- `devices.js`: LED tubes, mirror balls, blinders & strobes, liquid light show and CO₂ jets.
- `lasers.js`: the optional laser package (projectors, looks, beam list; no DOM).
- `midi.js`: MIDI play mode. `NoteLayer` turns MIDI bytes into per-fixture light (no DOM). `setupMidi` wires
  Web MIDI, the on-screen and computer keyboards, the test groove, the sweep and the monitor.
- `main.js`: panel, keyboard, cue list, MIDI learn and microphone sound-to-light.

## Writing a show

```js
{ id: 'myShow', name: 'My Show', bpm: 120, blurb: '…', sections: [
  sec('Intro', 60, 4, merge(L.dark({ cycCol: K.blue }), L.wash({ col: K.royal, dim: up(0, 0.5) }))),
  sec('Build', 90, 6, L.fan({ col: K.cyan, chase: { rate: steps([8, 4, 2]), by: 'x' } })),
] }
```

`sec(name, seconds, fadeIn, look)`. A look has `layers` (group assignments:
`dim`, `col`/`alt`, `pan`, `tilt`, `aim` + `spread`, `fan`, `zoom`, `frost`,
`strobe`, `hueSpread`), `fx` (`a` attribute, `w` waveform, `rate` beats/cycle,
`size`, `spread` degrees of phase, `by` order, `wings`, `off`), `kin` (pod shape)
and `cyc` (a backdrop colour: still accepted, but not drawn now there is no backdrop). Any value can be a function of `c = { p, t, T, beat }`. Use `up`,
`steps`, `blend`, `journey` and `every` for builds and colour journeys. Wrap
scaled function values with `mul(v, k)`, not `v * k`.

## Console

- **Show**: playback, section list, scrubbing, set/loop/hold, crossfade scale,
  masters (grand, pods, floor, haze), flash/strobe, blackout, tap tempo.
- **Program**: group chips or the fixture map (shift = range, ⌘/ctrl = toggle),
  intensity, colour, pan/tilt, position palettes (tracked aim points), zoom,
  frost, shutter. Double-click an attribute's label to release it.
- **FX**: stack live effects on any group: waveform, rate, size, phase spread
  and order, duty, wings, reverse.
- **Kinetic**: take over the pods (shape, trim, amplitude, roll, period),
  hoist speed and moving-head response.
- **Cues**: record programmer + FX + pods as cues, GO/Back, run the list as your
  own timed scene, export/import JSON (stored in this browser).
- **MIDI**: play mode, where every key fires lights (details below), plus MIDI
  learn for any fader, button or toggle.
- **Setup**: microphone beat-following and intensity pulse, stage & floor on/off, haze texture and render quality.

## MIDI play mode

Turn on **Notes fire lights** (any incoming note turns it on), or just connect a
keyboard and play. Notes are laid over the show just before the masters: the
brighter of the show and the note wins, and the note's colour wins in proportion
to its level. **Under the notes** sets how much of the show stays up (blackout,
12%, 35% or the full show).

- **Keys map to**: *keys across the stage* (a column of light at the key's
  position between the lowest and highest key), *octave → pod, note → head*
  (C1 octave = floor units, each higher octave one pod further downstage),
  *scatter* (each pitch class lights a spread of heads), or *whole rig*.
- **Colour**: pitch → hue (C red, 30° per semitone), velocity → heat, the show's
  own colour, or one fixed colour.
- Velocity → brightness. Sustain pedal (CC64) holds notes. The mod wheel (CC1)
  makes the tilt kicks bigger, and pitch bend rotates the hue ±60°. CC120/123 is
  all notes off. Response sets the held level, release, column width, tilt kick
  and how far pods dip.
- **Channel 10 plays the drum map** (General MIDI): the kick fires the floor and
  back pod, the snare the mid pods, hi-hats random heads, the toms one pod each
  (low toms at the back), crashes the whole rig, and the ride steps a column across.
- Learned MIDI mappings take priority: a learned note or CC drives its console
  control and doesn't fire lights.

**MIDI test** (no hardware needed): *Play test groove* loops 8 bars at 120 BPM
(pad, bass, arpeggio and a GM drum kit with a tom fill). *Sweep all notes* plays
C1–B7 and reports how many of the 72 fixtures the current mapping reached. There
is also a two-octave on-screen keyboard (click lower on a key for more velocity),
**Computer keys play notes** (A W S E D F T G Y H U J K, Shift = hard, Z/X change
octave, and these keys override the console shortcuts while it's on), an optional
monitor synth, a now-playing readout, a coverage count and a message log.

Automated test: serve the repo on port 8124, then run
`node docs/graphics/tests/lightDesigner-midi.mjs`. It mocks a Web MIDI keyboard in
headless Chrome over the DevTools protocol (no npm packages needed) and checks
connecting, mapping, colour, velocity, release, sustain, pitch bend, the drum map,
the channel filter, MIDI learn priority, the computer and on-screen keyboards,
the sweep reaching all 72 fixtures, the test groove, handing the rig back to
the show, switching rigs, all eight laser looks (including firing them with notes), the extras (kits, and a crash cymbal firing blinders, strobes and CO₂), and scenes (morph vs cut, keys, pads, smooth auto-trigger).

Keys: Space play · ←/→ section · T tap · X flash · S strobe · B blackout ·
G GO · H hide the panel. With *Computer keys play notes* on, the note
letters play the rig instead.
