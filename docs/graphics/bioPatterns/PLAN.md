# bioPatterns — Morphing Mathematical Patterns in Nature

A continuous animation that morphs a single particle field through a sequence of mathematical forms that recur across living and physical systems. The conceit: the same set of points keeps rearranging itself, suggesting that one shape underlies many faces of nature.

The whole piece is one shot — no cuts, no chapter cards. Each "movement" is a stable attractor the particles relax into for ~10–20 seconds, then a transition (~3–5s) carries them to the next.

---

## The Forms

Four primary attractors, each with two or three "skins" — visual evocations of where the form shows up in nature. The underlying geometry is the same; the texture, color, and camera framing change.

### 1. Circle / Disk
A bounded round region, optionally with concentric structure.

**Skins:**
- **Eye.** Iris striations, dark pupil, faint corneal highlight. Particles cluster radially with angular noise.
- **Ripple.** Concentric expanding rings on a still surface; particles ride wavefronts outward.
- **Cell.** Soft membrane with internal granularity.

**Math.** Polar coordinates; particle target is `(r·cos θ, r·sin θ)` with `r` drawn from a chosen radial density (uniform on disk, or banded for the iris).

### 2. Spiral
The form that signals growth.

**Skins:**
- **Nautilus.** Logarithmic spiral, tight at center, opening outward, with chamber walls.
- **Sunflower head.** Phyllotactic spiral — points placed at `(√n, n·φ)` in polar, where `φ` is the golden angle. Two families of Fibonacci spirals emerge for free.
- **Galaxy / hurricane.** Looser log spiral with arm density falling off, faint dust between arms.

**Math.**
- Log spiral: `r = a·e^(b·θ)`.
- Phyllotaxis: `(rₙ, θₙ) = (c·√n, n·137.508°)`.

### 3. Branching tree (dendritic)
Recursive bifurcation — the form of transport networks under a length/volume constraint.

**Skins:**
- **Lungs / bronchi.** Symmetric-ish binary branching, terminating in alveolar puffs.
- **River delta / canyon.** Branching seen from above, viewed as erosion lines on a faintly textured ground.
- **Neuron.** A single soma with dendrites and one long axon; sparser, more directional than the others.

**Math.** L-system or recursive bifurcation: at each node, split into two children with angle ±α and length scaled by `r < 1`. Particles distribute along edges with density proportional to local branch radius (so terminal twigs are sparse, trunks dense). Optional space-colonization algorithm for the river/canyon variant — gives more naturalistic, asymmetric branching than pure recursion.

### 4. Torus
Closed loops — circulation, recurrence.

**Skins:**
- **Smoke ring / vortex.** A torus seen at a 3/4 angle with particles flowing along the poloidal direction (the small circle), evoking vortex circulation.
- **Donut / fruit.** Same torus, lit and shaded for solid form.
- **Magnetosphere (optional).** Field lines as tori threading a central axis.

**Math.** Torus with major radius `R`, minor radius `r`, parametrized by `(u, v) ∈ [0,2π)²`:
```
x = (R + r·cos v)·cos u
y = (R + r·cos v)·sin u
z = r·sin v
```
Particles carry `(u, v)` and animate along `v` for the vortex skin.

---

## How morphing works

One particle pool of ~20–50k points, persistent for the whole animation. Each particle has a stable index `i`; that index determines its target position in *every* form via a parametrization keyed off `i`.

- Disk: `i → (r, θ)` where `r = √(i/N)`, `θ = i·φ` (golden angle, gives even coverage).
- Spiral: same `(r, θ)` but with `r = c·√i`, `θ = i·φ` — actually identical to the sunflower head, which is why the disk → sunflower transition is essentially free.
- Tree: assign each particle to a branch by `i mod (#branches)`, then position along the branch by `i / (#branches)`.
- Torus: `(u, v)` derived from `i` via a low-discrepancy 2D sequence (e.g. Halton or `(i·φ, i·φ²)`).

Morphing between two forms is a per-particle interpolation from one target to the next. Two interpolation modes:

- **Direct lerp** — fast, geometric, looks like a swarm.
- **Curved transit** — each particle takes a small arc through a shared "scratch space" (e.g. a brief spherical projection), so the whole field seems to inhale before exhaling into the next form. Better for the strong shape changes (disk → tree, tree → torus).

The transition timing function is asymmetric: slow start, fast middle, slow settle (smoothstep with a slight overshoot). Forms hold for ~12s, transitions take ~4s.

## Suggested sequence

A loop, ~70 seconds:

1. **Eye** (disk, banded radial) — opens the piece, holds, blinks once.
2. → **Ripple** (same disk, animated radial waves).
3. → **Sunflower** (disk reorganizes via golden-angle indexing — almost no motion needed, just rebalancing density).
4. → **Nautilus** (sunflower's points migrate onto the log-spiral curve).
5. → **Galaxy** (zoom out; spiral loosens, gains depth, dims at the edges).
6. → **Lungs** (radial galaxy arms become bifurcating branches; the center of the galaxy becomes the trachea).
7. → **River delta** (camera tilts to top-down; same branch structure, eroded skin).
8. → **Smoke ring** (branch tips lift off the plane and curl into a torus).
9. → **Eye** (torus shrinks along its major axis until the hole closes — back to a disk).

The eye → eye loop is the payoff: the closing torus is also the iris re-forming.

---

## Technical approach

- **Rendering**: WebGL2, single full-window `<canvas>`. Particles drawn as point sprites with additive blending and a soft falloff. ~30k particles is the target; the math is cheap, the bottleneck is fill rate from the additive blend.
- **Particle update**: GPU-side. Each particle stores `(currentPos, prevTargetPos, nextTargetPos)`; a uniform `mix` interpolates. Targets are recomputed on the CPU only at form transitions, then uploaded to a texture or buffer.
- **Form definitions**: each form is a function `target(i, N, t) → vec3` plus a `skin` (color, point size, blend mode, optional background). Forms are pure — no internal state — which makes the morph interpolation trivial.
- **Director**: a small timeline that owns the form sequence and current `t`. Holds and transitions are declared as `{form, holdSeconds, transitionSeconds}` pairs.
- **Camera**: gentle continuous motion (slow orbit or push), with per-form framing offsets so the torus reads as 3D and the disk reads as flat.
- **Color**: each form has a 2-color gradient sampled by particle radius or branch depth. Transitions cross-fade the gradients in parallel with position.
- **Controls**: Space = pause, →/← = step forms, H = HUD with current form name and progress.

## File layout

```
bioPatterns/
  index.html
  style.css
  PLAN.md                 ← this file
  js/
    main.js               ← canvas, loop, director wiring
    director.js           ← timeline, form sequence, transitions
    particles.js          ← particle pool, GPU buffers, render
    forms/
      disk.js             ← eye, ripple, cell skins
      spiral.js           ← nautilus, sunflower, galaxy skins
      tree.js             ← lungs, delta, neuron skins
      torus.js            ← smoke ring, donut skins
    shaders/
      particle.vert
      particle.frag
```

## Open questions

1. **2D or 3D?** The torus needs depth; the eye and delta read better flat. Plan is 3D throughout with per-form camera, but this commits us to a real depth pipeline.
2. **One pool or per-form pools?** One persistent pool gives the strongest "same matter, different shape" feeling but constrains particle counts (the tree wants fewer, the galaxy more). Compromise: one pool, but forms can hide a fraction of particles by sending them off-screen.
3. **Audio?** Likely not — this wants to read as a quiet ambient piece. Could pair with the `origins` soundtrack later.
4. **Loop seam.** The eye → eye closure is the natural loop point; do we hard-loop, or generate a fresh permutation of forms each cycle?
5. **More forms worth adding?** Hexagonal packing (honeycomb, basalt, compound eyes) and Voronoi cells (giraffe, mud cracks, leaf venation) are obvious candidates if four forms feel thin.
