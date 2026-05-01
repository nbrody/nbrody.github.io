# Origins — A 10-Minute Visualization of the History of the Universe

A single continuous animation that climbs Comte's hierarchy of the sciences: **physics → chemistry → biology → psychology → sociology**. Each chapter is the emergent consequence of the previous one. The piece begins with diffuse gas and ends with people dancing to music.

Five chapters, no hard cuts — every transition is a zoom, a phase change, or a re-framing so the previous chapter's last frame and the next chapter's first frame are visually contiguous.

Total runtime target: ~10 minutes (600s), roughly 2 minutes per chapter. The animation plays straight through automatically — music is performed separately over the visuals and is not part of this codebase.

---

## Chapter 1 — Physics (0:00 – 2:00)

**What you see.** A dark field seeded with faint particles drifts under gravity, knots into a cosmic web, and resolves one bright knot into a spiral galaxy. We push through an arm into a star, through the photosphere, and into a single hydrogen atom: nucleus + electron cloud. Hold for a beat. Pull back: many atoms, accelerating inward, colliding. Hot collisions begin to *fuse* — flashes, released particles, a plasma. The chapter ends as a churning fusion plasma with a heartbeat-like pulse emerging from the fusion rate.

**Mechanic.** Each beat is its own mini-system stitched by zooms:
- Particle field with long-range attraction on a coarse density grid (~100k particles, additive blending, color shifts cool→hot with density).
- Procedural log-spiral galaxy with density-wave perturbation; star sprites with bloom.
- Hydrogen orbital rendered as |ψ|² volumetric cloud.
- Particle simulation with collision detection; temperature-dependent fusion probability; each fusion event spawns a flash + a sound trigger.

**Audio.** Sub-bass drone throughout, swelling. Percussive fusion hits in the last 30s coalesce into a steady pulse. **Layer introduced: rhythm.**

**Transition out.** The fusion plasma cools. Particles slow. As they slow they stop bouncing and start *sticking* — the first chemical bonds.

---

## Chapter 2 — Chemistry (2:00 – 4:00)

**What you see.** From the cooled plasma, atoms drift and bond. Simple molecules first: H₂, H₂O, CH₄, NH₃, each forming with a small visual snap. The palette of elements expands — a faint periodic-table motif may briefly overlay and dissolve. Complexity climbs: hydrocarbons grow into chains, rings close (a benzene hexagon clicks together with a satisfying chime), sugars and amino acids assemble, nucleotides line up into short strands. Lipid molecules drift toward each other and spontaneously wrap into a vesicle — a hollow bubble. Inside the bubble, a strand of RNA folds, then copies itself. The chapter ends on the first replication event.

**Mechanic.** Atoms are particles tagged with element + valence. Proximity + orientation rules trigger bond formation, rendered as glowing edges. Once bonded, sub-molecules become small constraint-based rigid bodies (mass-spring or Verlet). Catalysis is probability-driven: a hit roll on collision creates a more complex product. Camera zooms out as average molecule size grows. The lipid self-assembly is hardcoded as a directed event for narrative clarity, not emergent.

**Audio.** Crystalline pitched tones. Each bond = a chime; element types map to timbres so common reactions produce consistent melodic motifs. The drone from Ch.1 thins; rhythm continues underneath. **Layer introduced: harmony.**

**Transition out.** The replicating strand divides. Both copies divide. The vesicle pinches in two. Pull back — we are watching a cell divide in a primordial pond.

---

## Chapter 3 — Biology (4:00 – 6:00)

**What you see.** One cell becomes two, becomes a colony. Cells specialize — color-coded by function. Multicellular bodies emerge: sponges, then radial forms, then bilateral. The Cambrian fast-forward — a parade of body plans, each morphing into the next: fish, amphibian, reptile, bird, mammal. The camera pulls back to reveal ecosystems: a reef, a forest, a savannah. Time accelerates. Tree canopies sway through seasons in seconds. We settle on a small band of early hominids by a fire. They look up. A human face fills the frame, eyes catching the firelight.

**Mechanic.** Cells are particles with attachment rules; once multicellular, body plans are generated from a small library of skeletal/SDF templates that morph into one another. Environment is a scrolling/morphing background painted in broad strokes (gradients + shader noise + a few hero silhouettes per biome). Time-acceleration is explicit: a small clock or scale indicator fading in the corner is optional but probably unnecessary.

**Audio.** Organic textures: water, wind, breath, insect/bird layers. A slow heartbeat enters and locks loosely to the rhythm from Ch.1. A solo instrument — flute or voice — sketches a melodic motif over the harmony from Ch.2. **Layer introduced: melody.**

**Transition out.** Push into the human eye. Through the pupil. Into darkness. Then a single neuron fires.

---

## Chapter 4 — Psychology (6:00 – 8:00)

**What you see.** A neural network sparks awake. Sparse firings at first, then cascades. Brief flashes of representational imagery — a face glimpsed and gone, a remembered landscape, a word, a fear. Color carries emotion: warm gold for joy, deep blue for sadness, a quick red for anger. Streams of thought visualized as flowing rivers of small images and glyphs. Language emerges: text fragments fade in and out, then resolve into a single word — "I". A bright point forms at the center of the network. The mind dreams, then wakes, then *reaches outward* — wanting another.

**Mechanic.** The most abstract chapter and the one where pacing should slow. A 3D-ish neural graph with shader-driven activation propagation, layered over particle and fluid effects for the emotional washes. Brief representational inserts (faces, places, words) can be small sprite atlases — they should feel glimpsed, not shown. Type animation for the language beat. The whole chapter benefits from longer holds and quieter moments than the ones around it.

**Audio.** The melody from Ch.3 fully blooms — a clear theme, possibly a wordless vocal. Harmonic pads. Rhythm continues but softened. This melody is the seed of the dance track in Ch.5. **Layer introduced: voice / theme.**

**Transition out.** The lone mind reaches out. Another face appears across the dark. Then two more. Then the dark fills with people, and the bright point at the center of the mind becomes a single dancer in a crowd.

---

## Chapter 5 — Sociology (8:00 – 10:00)

**What you see.** A crowd of stylized figures on a dark stage, dancing. The lone dancer from the transition is one of them. Lights swing, color builds, the crowd grows. Cityscapes and network graphs may flicker briefly in the background — institutions, infrastructure, language, all the collective scaffolding — but the foreground stays human and kinetic. Final 30s is full ensemble at peak. The figures, if you look closely, are visibly made of the same particles we have been watching since Chapter 1.

**Mechanic.** 2D skeletal figures (or particle-based bodies) with a small library of looped dance animations, phase-offset across the crowd. A few colored point lights swing/strobe with the music. The "made of the same particles" callback uses the same particle shader from Ch.1 with different boundary forces — figures are particle clouds constrained to skeletal shapes.

**Audio.** All four prior layers — rhythm (Ch.1), harmony (Ch.2), melody (Ch.3), theme/voice (Ch.4) — playing together as a full track. This is the emotional payoff. Genre TBD; the brief is "music people actually dance to."

**End.** Beat drops out. One figure holds a pose. Fade to black on a held chord.

---

## Technical Approach

- **Rendering**: single full-window `<canvas>`. Starting with 2D canvas for the scaffold; promote individual scenes to WebGL2 when they need the throughput (Ch. 1 cosmic web and Ch. 5 crowd are the likely candidates).
- **Architecture**: one `Scene` class per chapter, each with `init()`, `update(dt, t, progress)`, `render()`, `dispose()`. `progress` is 0..1 within the chapter — scenes use it to drive their own internal evolution. A top-level `Director` owns the timeline, auto-advances between chapters, and crossfades (~2s) at boundaries.
- **Timing**: each scene declares its own `duration` (seconds). Director sums them and auto-advances. Default 120s × 5 = 600s.
- **Controls (development / rehearsal)**: Space = pause/play, →/← = next/previous chapter, 1–5 = jump, H = HUD toggle, F = fullscreen. Performance just lets it play.
- **Performance budget**: 60fps on a mid-range laptop. Chapter 1 (cosmic web) and Chapter 5 (crowd) are the stress tests.

## Open Questions

1. **Pacing**: are 2-min chapters right, or does Physics want longer (it has the most ground to cover) and Psychology want to breathe?
2. **Style**: photoreal-ish (bloom, lens flare) or stylized/painterly? The hierarchy is conceptual — stylized probably serves it better.
3. **Ch.4 → Ch.5 callback** ("the dancers are made of the original particles"): worth the engineering, or precious?
4. **Representational imagery in Ch.4**: how literal? Photographic inserts vs. abstract glyphs changes the whole tone.
5. **Loop or end?** When Ch.5 finishes, hold the last frame, fade to black, or loop back to Ch.1?

## File Layout (proposed)

```
origins/
  index.html
  style.css
  PLAN.md                  ← this file
  js/
    main.js                ← entry: canvas, loop, wires director + input
    director.js            ← scene management, timeline, crossfade
    input.js               ← keyboard controls (rehearsal)
    hud.js                 ← debug overlay (toggle with H)
    scenes/
      scene.js             ← base class
      ch1_physics.js
      ch2_chemistry.js
      ch3_biology.js
      ch4_psychology.js
      ch5_sociology.js
  assets/                  ← (later) sprites, etc.
```
