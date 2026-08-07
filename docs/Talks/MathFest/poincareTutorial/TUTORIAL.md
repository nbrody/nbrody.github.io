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

## The step sequence (draft — ~5 minutes on stage)

| # | State shown | Caption (one line) |
|---|-------------|--------------------|
| 0 | Empty Poincaré ball, slow auto-rotate | Hyperbolic 3-space, packed into a ball: distances blow up near the boundary. |
| 1 | Two generator matrices appear (preset group), basepoint marked | A group of isometries, given by two matrices. |
| 2 | One isometry animates: basepoint ↦ image | One element $g$ moves the basepoint. |
| 3 | The bisector wall between basepoint and image fades in | Halfway between: the wall of points equidistant from $x_0$ and $g x_0$. |
| 4 | All walls for short words fade in, intersection highlighted | Every group element contributes a wall… |
| 5 | Dirichlet domain solidifies (walls fade out) | …and the innermost region is the Dirichlet domain: one tile of the tessellation. |
| 6 | Face-pairing animation: click through 2–3 pairings | Faces come in pairs — each pairing is a generator recovered from pure geometry. |
| 7 | Mirror mode: the domain's walls turn reflective (slow auto-rotate) | Turn the walls into mirrors — the reflections carry one tile to the whole tessellation. |
| 8 | Cayley graph toggles on, domain translates around | The pattern of tiles **is** the group: its Cayley graph, drawn in hyperbolic space. |
| 9 | Long–Reid group loaded | And here is the group we were hunting in — the tool and the theorem meet. |

Step 9 bridges back to Part I and the closing slides. `groupLibrary.js` already
has a `Long-Reid Group` preset, and it is exactly the $t=9$ group from Part I,
normalized into $\mathrm{SL}_2$: $a = \mathrm{diag}(3, 1/3)$,
$b = \frac{1}{8}\begin{pmatrix}1&9\\2&82\end{pmatrix}$ (entries in
$\mathbb{Z}[1/6]$, same as the Racer).

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

Decisions taken (formerly open questions): figure-eight knot group for steps
0–7; captions bottom-center with a step counter; step 2 uses a basepoint-orbit
flight along the geodesic (not the face-pairing machinery — that appears at
step 6 where it belongs). Step 9 shows Long–Reid with its Cayley graph and a
slow auto-rotate.
