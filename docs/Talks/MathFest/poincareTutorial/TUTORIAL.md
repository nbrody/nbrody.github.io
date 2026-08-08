# Poincaré Tutorial — step-through mode

**Status: built** (js/tutorial.js). A guided, step-through mode for the
Dirichlet-domain visualizer, used live in the MathFest talk (second ten
minutes). This document is the spec plus as-built notes.

Source: copied from the live tool at
`docs/GeometryofLinearGroups/Geometric/Tools/Kleinian/poincare2` (the actively
developed version — includes `canonical.js`, `certifier.js`, 3MF export), with the
GOLG site-nav bootstrap removed. This copy is free to diverge for talk purposes.

## The idea

The existing tool is a free-form explorer: matrix generators in, Dirichlet domain +
Cayley graph out. For the talk we add a **tutorial mode**: a fixed sequence of
steps, each one a prepared camera + state + one-line caption, advanced from the
phone remote. The audience watches one idea appear at a time instead of
confronting the full control panel.

Free exploration stays available — at any step Nic can grab the mouse and orbit,
and the tutorial resumes cleanly from wherever it was.

## How it runs during the talk

- The deck (`../index.html`, reveal.js) embeds this page on one slide as an
  iframe with `?embed=true&tutorial=true`.
- The phone remote sends `tut-next` / `tut-prev` / `tut-reset`; the deck forwards
  them into the iframe as `postMessage({ type: 'tutorial', cmd: 'next' | 'prev' | 'reset' })`.
- Keyboard fallback on the presenting machine: when the iframe has focus,
  `→` / `←` also advance/rewind steps (and we postMessage `iframeNav` back to the
  deck when stepping past either end, so arrows keep working seamlessly).

## Embed mode (`?embed=true`)

- Hide the control panel, isometry buttons, and face inspector; transparent/dark
  background to blend with the deck.
- Show only the **caption bar**: a single line of MathJax-capable text at the
  bottom, plus a subtle step counter (e.g. `4 / 9`).

## The step sequence (11 steps, all on the figure-eight knot group)

| # | State shown | Idea |
|---|-------------|------|
| 1 | Hyperbolic dust (ball shell + 9000-mote scatter) | Hyperbolic space, uniform in hyperbolic volume. |
| 2 | Matrices card, exact mode enabled (Q(w), w²+w+1=0, entry rewritten as w) | Entering matrices, with exact entries. |
| 3 | g₁ then g₂ animate; dust streams; axis + boundary flow lines | The isometries the matrices determine. |
| 4 | Orbit grows breadth-first from the basepoint | Growing the orbit. |
| 5 | Cayley edges join the orbit | The Cayley graph. |
| 6 | Dual bisector walls over the Cayley graph | The dual bisectors. |
| 7 | Domain fades in; everything else clears | Intersect: the Dirichlet domain. |
| 8 | Two face-pairing rolls | The face pairings. |
| 9 | Theorem card over the slowly rotating domain | The Poincaré Polyhedron Theorem. |
| 10 | Presentation + certificate card (relations exact over Q(w)) | Presentation and discreteness certificate. |
| 11 | Mirrored walls, slow rotate | Just for fun. |

Stepping past step 11 hands navigation to the deck, which lands on the
**full-app slide** — the same workbench with all controls, for free demo.
The caption bar has clickable ‹ › arrows; the phone remote's joystick
orbits the camera on any 3D slide (data-orbit).

## As built

New file `js/tutorial.js` (loaded only when `?tutorial=true`):

- `STEPS`: `{ caption, state, enter? }` objects. `state` is **declarative and
  idempotent** — `applyStep(k)` fully reconstructs step $k$ (group, domain
  visibility, walls/Cayley/tiling, overlay markers), so `prev`/`reset` are
  trivial and free mouse exploration can't wedge the sequence. If face-pairing
  rolls have drifted the view (`isViewDirty`), the next apply refreshes first.
  `enter` effects (basepoint flight, wall fades, pairing rolls) play only when
  arriving **forward**.
- Command queue: a `next`/`prev`/`reset` arriving mid-animation is **queued
  (latest wins) and flushed when free** — a presenter's tap is never swallowed,
  and impatient double-taps coalesce instead of double-skipping.
- Steps 0–4 hide the raymarched polyhedron (black with zero faces) and show a
  glassy graticule **ball shell** drawn in the tutorial's own overlay group.
- Debug: `window.__tutLog` records every command/step application.

`main.js` additions (additive only): `window.PoincareAPI` — state access,
opacity/walls/Cayley/tiling/auto-rotate setters, `setDomainVisible` (face-count
zeroing), `geodesic`, `buildBisectorMesh`, `animateMatrix`/`animateGenerator`/
`animateFacePairing`, `isAnimating`/`isViewDirty` — plus a
`poincare:refreshed` window event after every refresh.

`index.html`: `?embed` / `?tutorial` params → `embed-mode` / `tutorial-mode`
classes on `<html>`; embed mode hides the control panel, isometry buttons,
face inspector, and status banner (CSS at the bottom of `style.css`).

Keys (inside the iframe): `→`/`Space`/`PgDn` next · `←`/`PgUp` prev ·
`Home` reset. Past either end, the step handler posts `iframeNav` to the deck,
which maps it to `Reveal.next()/prev()` — so arrows feel seamless on stage.

Decisions taken (formerly open questions): the figure-eight knot group for all
11 steps; captions bottom-center with a step counter and clickable ‹ › arrows.
Step 2 enables **exact mode** by driving the app's own Group-tab controls
(minpoly `w^2+w+1`, root with Im > 0, the g₁ entry rewritten as `w`), so the
matrices card and the step-10 certificate both read live app state. Step 3
plays the isometry demos (`animateGenerator`); face pairings appear at step 8;
steps 9–10 lift the theorem and the already-typeset `#presentation-display`
HTML (plus the status banner, with tone) into fixed overlay cards; step 11 is
the mirrored polyhedron. Long–Reid moved out of the tutorial entirely — it
lives on the Computation slide (cayleyHeights).
