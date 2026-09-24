# Origins — A 10-Minute Visual History of Everything

A single continuous animation that climbs Comte's hierarchy of the sciences: **physics → chemistry → biology → psychology → sociology**. Each chapter is the emergent consequence of the previous one. It begins with a single point of light in the void and ends with a room full of people dancing — made, visibly, of the same particles — and then that one point of light again.

Five chapters of 120 s each (≈ 10:00 total), no hard cuts: each chapter's last frames are designed to match the next chapter's first, and the director crossfades over 2.5 s. The piece plays straight through; music is performed live over it and is not part of this codebase. Every pulse in the piece (the fusing core, the heartbeat, the neural synchrony, the dance) locks to one shared tempo, which the performer can set or tap.

Captions tell the story (a chapter title card, a caption per beat, and a thin "cosmic timeline" along the bottom showing where we are in 13.8 billion years). Press **C** or use `?captions=0` for a clean screen.

---

## Running it

Serve the repository over http and open `docs/graphics/origins/?standalone=1` (without `standalone` the page opens inside the Graphics Studio stage, where the hidden controls below are exposed to the remote).

| Key | Action |
| --- | --- |
| Space | pause / play |
| ← / → | previous (or restart chapter) / next chapter |
| Shift + ← / → | scrub ±10 s  ·  `,` / `.` scrub ±1 s |
| 1 – 5 | jump to chapter |
| [ / ] | playback speed ÷2 / ×2 (rehearsal) |
| T | tap tempo (sets BPM, snaps the downbeat to the tap) |
| C | captions on / off |
| H | debug HUD (chapter, beat name, time, fps, BPM) |
| R | restart from the top |
| F | fullscreen |

URL parameters: `ch=3&t=40` (start there), `pause=1`, `speed=2`, `bpm=96`, `captions=0`, `hud=1`, `scale=1` (render-resolution cap; default 1.5× CSS px), `autoscale=0` (never lower resolution automatically).

The Graphics Studio remote sees a chapter select, play/pause, captions toggle, a BPM field and a tap-tempo button (`#controls`, hidden on the page).

---

## Chapter 1 — Physics (0:00 – 2:00)

| t (s) | Beat |
| --- | --- |
| 0 | The void. One quivering point; virtual particle pairs pop in and annihilate around it. |
| 6.2 | **The Big Bang** — white-out, expanding shell, lens aberration. |
| 8 | Quark–gluon plasma cooling from blue-white to red. Quarks drawn with their colour charge (red, green, blue sparks). |
| 11.5 | Quarks bind in threes into protons and neutrons — the three colours add to white. Pairs fuse into the first nuclei. |
| 22 | Recombination: electrons settle, the fog clears into the cosmic microwave background, which pulls back into the familiar Planck ellipse. |
| 28 | Dark ages → the **cosmic web** grows (Zel'dovich approximation, 885k particles, periodic box). |
| 44 | First stars ignite in the densest knots. |
| 50 | The richest knot collapses and spins up into a two-armed spiral galaxy (density-wave orbits, dust lanes, H II regions). |
| 70 | Dive through an arm into one star; its surface fills the frame (granulation, sunspots, prominences). |
| 84 | Inside the core: a proton–proton chain simulation (p+p→²H+e⁺+ν, ²H+p→³He+γ, ³He+³He→⁴He+2p). Random at first; from ~92 s reactions **lock to the beat** and the core pulses like a heart. |
| 99 | The forge: triple-alpha (3 ⁴He→¹²C) and ¹²C+⁴He→¹⁶O. |
| 105 | Pull back: the massive star's onion of shells (H, He, C, O, Ne, Si, Fe), labelled. |
| 112.5 | Core collapse → neutrino burst → bounce → **supernova**. The remnant expands as a limb-brightened shell of element-coloured debris. |

**Audio notes (unchanged from the original plan).** Sub-bass drone throughout, swelling. Percussive fusion hits coalesce into a steady pulse — the fusion events land on the shared tempo. **Layer introduced: rhythm.**

## Chapter 2 — Chemistry (2:00 – 4:00)

| t (s) | Beat |
| --- | --- |
| 0 | The debris cools into atoms (CPK colours shared with the supernova). A periodic table fades in, each cell tinted by where that element was made (Big Bang / stars & supernovae / neutron-star collisions); the elements just scattered light up. |
| 12 | Molecular cloud: atoms bond in a 3D simulation with real valence geometry — H₂, H₂O (104.5°), CH₄ (tetrahedral), NH₃ (pyramidal), CO. Helium and neon never bond. |
| 34 | The cloud collapses into a young Sun with a jet and a ringed, gapped disk (after ALMA's HL Tauri). |
| 40 | A planet gathers in one ring: the early Earth, molten with glowing cracks → cratered crust → oceans, clouds, an atmosphere. |
| 53.5 | Dive into the early ocean (god rays, caustics, a hydrothermal vent). |
| 54.5 | Building blocks assemble atom by atom from real bond geometry: a hydrocarbon chain, benzene (the ring snaps shut), ribose, glycine, a nucleotide. |
| 72 | Nucleotides link into a strand; oily lipids self-assemble into a two-layered vesicle around it. |
| 92 | RNA folds into a hairpin (G–C / A–U pairs across the stem). |
| 100 | It opens; complementary nucleotides pair along it and zip up an antiparallel copy. |
| 110.5 | The strands separate; the vesicle stretches and pinches into two. |

**Audio.** Crystalline pitched tones; each bond a chime. The drone thins; rhythm continues. **Layer introduced: harmony.**

## Chapter 3 — Biology (4:00 – 6:00)

| t (s) | Beat |
| --- | --- |
| 0 | The protocell finishes dividing; a colony grows by binary fission (signed-distance membranes that pinch naturally). |
| 13 | Cyanobacteria turn green; oxygen bubbles up; the murky, iron-green sea clears to blue. |
| 26 | Endosymbiosis: a large cell (nucleus, ER, mitochondria) engulfs a bacterium, which becomes a mitochondrion. |
| 33 | A Volvox-like sphere of cells, daughter colonies inside. |
| 38 | A jellyfish. |
| 44.5 | The parade of body plans, as morphing glowing outlines: trilobite → fish → tetrapod (onto land) → sauropod. |
| 65 | The asteroid. |
| 66 | Mammals. |
| 72 | Ecosystems in time-lapse: days, seasons (spring → summer → autumn → snow), a migrating herd, birds. |
| 90 | Night on the savanna under the Milky Way; a fire; people around it. |
| 100 | One stands and tips their head back to look at the stars. |
| 107 | Into their eye (procedural iris, the fire and the stars reflected); a blink; the pupil opens; we fall through it. |

**Audio.** Organic textures; a slow heartbeat enters, locked to the tempo; a solo instrument sketches a motif. **Layer introduced: melody.**

## Chapter 4 — Psychology (6:00 – 8:00)

| t (s) | Beat |
| --- | --- |
| 0 | Darkness. One neuron — soma, dendrites — fires, and fires again. |
| 10 | Pull back: 260 neurons in 3D wake up. Spikes race down axons; cascades are a branching process tuned near criticality (neuronal avalanches). |
| 36 | Emotion: a golden wave of joy, a blue fall of sadness, red flickers of fear. |
| 56 | Memory: the network lights up in constellations of the story so far — a galaxy, a double helix, a fish, a fire, an eye, a face. |
| 67 | Language: a river of words … that falls into the centre and becomes **"I"**. |
| 88 | A self: the network gathers into rings around a bright point and pulses in synchrony with the tempo; it dreams (colour drift). |
| 104 | It reaches out; another mind answers; then more. |

**Audio.** The melody blooms into a theme; harmonic pads; rhythm softened. **Layer introduced: voice / theme.**

## Chapter 5 — Sociology (8:00 – 10:00)

| t (s) | Beat |
| --- | --- |
| 0 | The minds from Chapter 4 multiply and link into a social network. |
| 12 | It settles into villages and towns joined by roads. |
| 22 | Pull back to the Earth at night: city lights, flight arcs. |
| 34 | Dive into one city → a dark room: a lone dancer in a single spotlight. |
| 45 | Others join row by row; moving-head beams come up, all on the beat. |
| 62 | The whole room at full energy (mild accent flashes on each downbeat). |
| 100 | The dancers glitter in the colours of the elements they are made of (by atom count: H, O, C, N, P, S). |
| 111.5 | The beat drops out: one dancer, one light, arms raised. Their particles rise like stars; the title **Origins**; everything fades to a single point — the point from the start of Chapter 1 — and then black. |

**Audio.** All four prior layers together as a full track — "music people actually dance to." End: beat drops out, one figure holds a pose, fade to black on a held chord.

---

## What is real in it

- **Zel'dovich approximation** for the cosmic web: particles move along fixed displacements ψ = −∇φ of a Gaussian random potential, x = q + Dψ, and each particle's density is exact from the eigenvalues of ∇∇φ. It's how cosmological simulations are seeded.
- **Density-wave spiral arms** (Lin & Shu): stars on ellipses whose orientation twists with radius; arms are where the orbits crowd.
- **Stellar nucleosynthesis:** the pp-chain and triple-alpha steps, positrons, neutrinos and gamma rays as their own particles; the massive-star onion; the neutrino burst preceding the explosion.
- **Chemistry:** real bond lengths (Å) and angles; benzene's alternating double bonds; ribose as a furanose ring; an AMP-like nucleotide; antiparallel, complementary RNA copying.
- **Biology:** binary fission, the Great Oxidation, endosymbiosis, Volvox, and the Cambrian → tetrapod → dinosaur → mammal sequence, with the K–Pg impact.
- **Neuroscience:** spikes as a critical branching process (σ ≈ 1), which produces avalanches of all sizes as recorded in real cortex.

## Technical approach

- **Rendering.** One WebGL2 canvas. Each chapter draws into an HDR (RGBA16F) target using instanced sprite and line batches, custom point-cloud shaders (cosmic web, galaxy, disk), fullscreen shaders (plasma, CMB, star, onion, planet, cells, eye, sky, beams) — soft ones at half resolution — and a 2D-canvas layer (periodic table, creature fills, landscapes, people, words) uploaded as a texture. Post: 13-tap bloom chain, exposure, soft-knee tonemap, flash, vignette, chromatic aberration, grain + dither.
- **Time.** Every scene is authored as a function of chapter time T, so seeking works anywhere. Simulations that need history either precompute (colony snapshots, spike schedule) or fast-forward on seek (fusion core, molecular cloud).
- **Tempo.** `tempo.js` holds BPM and phase as a function of show time; tap tempo re-aligns the downbeat.
- **Performance.** Chapter 1 (the heaviest on the GPU: 885k web particles, 140k galaxy stars) held 60 fps at 1280×720 in testing; per-frame JavaScript stays under ~4 ms in every chapter. If frames run slow on a given machine, the render scale steps down automatically (never up).

```
origins/
  index.html, style.css, PLAN.md
  js/
    main.js          entry: renderer, director, tempo, captions, input, HUD, studio controls
    director.js      timeline, auto-advance, crossfades, seek/scrub
    tempo.js         the shared pulse (BPM, tap tempo, heartbeat envelope)
    captions.js      title cards, beat captions, cosmic timeline
    input.js, hud.js
    lib/math.js      easing, envelopes, seeded RNG, noise, colour, mat4
    gfx/             gl.js (programs, targets, point clouds), glsl.js (noise, palettes), renderer.js
    scenes/
      scene.js
      common/elements.js                    one element palette shared across chapters
      ch1_physics.js    + ch1/  early, web, galaxy, star, fusion, supernova
      ch2_chemistry.js  + ch2/  cloud, periodic, worlds, molecules, life
      ch3_biology.js    + ch3/  cells, creatures, land, eye
      ch4_psychology.js + ch4/  network, mind
      ch5_sociology.js  + ch5/  world, dancers, stage
```

## Open questions

1. **Pacing.** All chapters are 120 s. Physics is dense; if it wants more room, raise its `duration` — beats would need retiming (they are authored in seconds).
2. **Captions in performance.** On by default for storytelling; off (`C`) may suit a concert better.
3. **Loop or end?** Currently it ends on black after the last point of light fades.
