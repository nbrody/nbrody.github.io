# CK5 Virtual Rig

A virtual light rig in the spirit of Chris Kuroda's kinetic lighting for Phish,
over a bare stage and floor in a hazy black void (no band or audience): 30 moving
truss sticks carrying 60 moving heads, 12 floor units, haze, and optional extras.
It's an impression, not a model of any real lighting plot.

## The rig: moving sticks

The rig follows Phish's 2019–23 design: 30 separate sticks of 5′, 8′ and 10′ truss,
none pinned together, each on its own hoists, hung in six rows of five across a
62′ grid, making zigzags, smiles, frowns and rooftops. Each row carries ten moving
heads (two per stick). The Kinetic tab and every show and scene drive three things
per row:

- **Height**: trims the row (rows 1–6 from front to back).
- **Roll**: bends the row into a smile or frown; alternate rows zigzag.
- **Flip**: turns sticks toward vertical (the real sticks could fly vertical). The
  *flip pattern* decides which ones: all (columns), alternate (zigzags, and
  diamonds at half-way), a lattice with rows opposed, the outer legs only (each row
  becomes a portal frame), the inner three, or a fan. A *flip wave* rolls flips
  through the rows over time.

Flips are what make the one rig do what earlier eras needed different trusses
for: the pre-2018 circles become arches and domes (a strong frown), squares become
portal frames, and the 2016 video wall becomes rows of LED bars on the truss.
Flips travel at about 60°/s, like a hoist lifting one end.

Sources: [L4LM interview (2022)](https://liveforlivemusic.com/features/chris-kuroda-andrew-giffin-mobilizing-phish-lighting-operation-interview-2022/),
[PLSN, December 2023](https://plsn.com/archives/december-2023/phish-fresh-performances-changing-looks/),
[Gateway on the 2022 tour](https://www.gsps.com/2022/10/05/phish-summer-tour-lighting-2022).
Dimensions, head counts and exact motion are my own simplifications.

## Scenes

The **Scenes** grid at the top of the Show tab has 21 complete looks, each with a
thumbnail. A scene is the whole rig: a held look, a stick formation, and every
Extras device. Click a thumbnail, press <kbd>1</kbd>–<kbd>0</kbd> for the first ten,
pick from **Launch scene** (the Studio remote sees this), play MIDI notes on channel
16 from C2 up (one pad per scene), or link with `?scene=<id>`.

Every launch moves; nothing cuts. Colour and intensity crossfade over **Move time**,
the heads pan and tilt there at motor speed, and the sticks fly and flip at hoist
speed. Devices the new scene adds or drops travel too:

- **LED tubes** rise out of the deck (the wall and the columns), grow out of the
  truss (bars on the sticks), or fly in over the crowd (canopy). They light once
  they're nearly in place. If the new scene wants a different tube layout, the old
  tubes leave before the new ones arrive.
- **Mirror balls** fly in from the grid (about 3 s) and back out; the pin spots
  open once a ball is at its trim.
- **Lasers, blinders, strobes and CO₂ nozzles** lift out of the deck before they
  fire and stop before they sink. A hit asked for while they're rising waits.
- **The projection screen** flies in from above, and the liquid light show starts
  once it's in place.

While anything is still travelling, the live thumbnail pulses and the status says
*Moving to …*. **Auto-trigger** launches a scene every 4–64 bars, in order or at
random. The programmer, live FX and masters still apply on top of a scene; pick a
show to go back to timed playback.

Scenes are defined in `scenes.js`. Thumbnails are `scenes/<id>.webp` (480×300,
about 180 KB for all 21). Regenerate them with the repo served on port 8124:

```sh
node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs            # all scenes
node docs/graphics/scripts/lightDesigner-scene-thumbs.mjs portal     # just some
```

## Venue, house lights and fairy lights

The **Venue** tab puts the rig in a room. The default is **Empty**: the stage and
floor in a hazy black void, as before. `?venue=club|theater|stadium` picks one from a
link, and the page remembers the tab.

- **Club**: a brick box with a low steel ceiling, concrete pillars, a bar with
  backlit bottles, a flickering neon sign and exit signs.
- **Theater**: a proscenium arch with a red house curtain (**House curtain
  closed** draws it in about 3.5 s, and it catches the beams), raked velvet seats,
  opera boxes, a balcony, crystal chandeliers and wall sconces.
- **Stadium**: an open-air bowl under a starry sky, with a stage roof on truss
  towers, a field with yard lines, two decks of seats, a ribbon board showing the
  rig's colours, and four floodlight towers.

In the club and theater, walls, ceilings and the curtain stop beams, lasers and
mirror-ball rays, and the moving heads leave pools of light on them. Camera
presets move to suit each room (a real balcony in the theater, the upper deck at
the stadium).

**House lights** are each venue's ceiling fixtures: cans in the void, Edison
pendants in the club, chandeliers and sconces in the theater, floodlight towers at
the stadium. *Showtime* fades them out over 8 s, *Walk-in* brings them to half,
and *House up* brings them full. They also have a level and fade time; white with
a warmth control from candle to daylight, one colour, or the rig's colour; and
effects: steady, breathing, old-tungsten flicker, a chase around the room, pulse on
the beat, twinkle or rainbow. While they're up they fill the room and wash the
beams out a little. Blackout takes them out; the grand master doesn't.

**Fairy lights** hang as swags or drops: a canopy over the crowd, spokes from a hub,
swags between the truss sticks (they ride the kinetics), or a starcloth curtain
upstage. Each venue has its own anchor points. Strands are catenaries that sway in
a **breeze**, and bulbs switch on running along each string. Colours are warm or
cool white, classic C9 multicolour, pastel, rainbow along the string, the rig's
colour, or one colour. Effects are steady, twinkle, chase, wave, breathing,
sparkle, pulse on the beat, or rain. You can also set level, speed, bulbs per
metre, sag and bulb size.

**Camera**: the page opens *In the audience*, at eye height (1.7 m) on the floor,
centred, 15 ft (4.6 m) back from the front of the stage, with a wider lens because
the rig fills the sky from that close. The other presets are still under View.

## Lasers (optional)

The **Extras** tab adds an optional laser package. It's in the spirit of
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

The **Extras** tab also holds the kit a jam-band LD reaches for. These devices
follow the grand master, blackout and flash, and travel in and out rather than
popping (see *Scenes*). A **Quick kit** menu sets
them up in one step: arena, trance-fusion, psychedelic ’60s, everything, or nothing.
`?kit=phish|biscuits|dead|all` does the same from a link, and the page remembers the tab.

- **LED pixel tubes** (24 pixels each): a wall upstage, bars on the truss sticks
  (they ride the kinetics, like the LED bars on Phish's 2022 truss sticks),
  columns around the stage, or a canopy over the crowd. Looks: follow the nearest
  head, rain drips, rainbow wave, bar chase, sparkle, a level meter (show energy
  or MIDI), or flash on the beat. Like the lasers, they're drawn in screen space
  with anti-aliased edges and seams, so they stay crisp at any distance.
- **Mirror balls**: one over the stage, or three with two over the crowd. Pin spots
  from the grid, faceted glints, rays through the haze, and spots sweeping the
  floor. Set spin, reflections, colour and level. *Drop the ball* flies them out
  and back in again; *Fly out* takes them away.
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

- `layout.js`: the moving-sticks rig (30 posed rigid bodies with height, roll and flip), fixtures, groups and aiming maths.
- `engine.js`: the console. Each frame runs the show section (cross-faded with
  the one before it), then programmer overrides, live FX, the snapshot fade used by
  jumps and GO, highlight, masters, and finally physics (motor response, hoist and
  flip speed).
- `shows.js`: six long shows (~58 min as a set), built from a small look vocabulary.
- `rig.js`: three.js renderer. It builds the stage, the floor, the truss sticks and
  their chains. Beams are instanced additive cones. Surfaces sample a
  per-fixture data texture, so beams leave pools on the deck and floor and catch the metal.
- `scenes.js`: the scene library (looks, stick formations and device settings).
- `devices.js`: LED tubes, mirror balls, blinders & strobes, liquid light show and CO₂
  jets, each with a *presence* that travels in and out.
- `lasers.js`: the optional laser package (projectors, looks, beam list; no DOM).
- `venue.js`: the four venues (architecture, what stops beams, house-light and fairy-light anchors, camera tweaks).
- `ambient.js`: house lights and fairy lights.
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
the show, stick flips (portal legs stand vertical and travel back smoothly), all eight laser looks (projectors rising, and firing them with notes), the extras (kits, and a crash cymbal firing blinders, strobes and CO₂), venues (the empty default with the audience camera, the club ceiling and theater curtain stopping beams, stadium floodlights, the Showtime fade, fairy lights riding the truss), and scenes (every launch moves, truss bars grow in, the tube wall rises from the deck only after the bars leave, the ball flies in, keys, pads, auto-trigger).

Keys: Space play · ←/→ section · T tap · X flash · S strobe · B blackout ·
G GO · H hide the panel. With *Computer keys play notes* on, the note
letters play the rig instead.
