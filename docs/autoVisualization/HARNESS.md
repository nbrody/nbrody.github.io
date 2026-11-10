# AutoViz — daily visualization harness

One page a day: an interactive, beautiful, mathematically exact visualization of one
phenomenon in geometry, groups, topology, dynamics, number theory or combinatorics.
This file is the complete spec for the daily scheduled run. Follow it exactly.

```
docs/autoVisualization/
  HARNESS.md               ← this spec
  TEMPLATE.html            ← copy this to start a page
  index.html               ← gallery (featured page, topic filters, month grid) — do not restructure
  manifest.js              ← AUTOVIZ_TOPICS + AUTOVIZ entries, newest first
  futureVisualizations.md  ← the queue: ≥ 5 planned pages
  kit/                     ← shared design system + library (README.md = API reference)
    av.css  av.js          ← core: page shell, chrome, tour, controls, panes, loop, tests
    draw.js plot.js        ← canvas drawing, charts
    linalg.js exact.js     ← dense linear algebra; BigInt, rationals, SL₂(ℤ), continued fractions
    complex.js hyperbolic.js ← complex numbers, Möbius maps; Poincaré disk + half-plane
    space3d.js gl.js       ← 3D orbit camera; WebGL2 helpers
    tex.js vendor/katex/   ← typeset mathematics (KaTeX, vendored: no network)
    examples/              ← working reference pages for each kind of layout
  tools/verify.mjs         ← headless checks, budgets, screenshots, thumbnails
  tools/test-kit.mjs       ← unit tests for the kit's maths
  days/                    ← one HTML file per day
  thumbs/                  ← gallery thumbnails (written by verify.mjs)
```

## What makes a great page

1. **One idea.** A page shows one phenomenon — one theorem made visible. If the plan needs
   "and also", that is two pages.
2. **The picture is the page.** The stage is full-bleed; the chrome floats at the edges.
   No paragraphs on screen. The kit draws all chrome: never add your own panels or headings.
3. **One gesture.** The core interaction is direct manipulation of the mathematics — drag,
   tap, or one slider. At most 4 dock controls; fewer is better.
4. **Show the theorem happening.** The readout (top right) is a *live check*: an identity or
   invariant recomputed as the user plays, with ✓/✗ (`AV.ok`). The best readouts flip to ✗
   exactly when the user breaks a hypothesis.
5. **Teach with a tour, not text.** 3–5 steps. Each step is one sentence *and changes the
   picture* (its `enter` sets state, starts motion, or pulses a control). The arc:
   **see** (what am I looking at) → **do** (use the gesture) → **surprise** (the phenomenon)
   → **why / in general** (the theorem, other cases).
6. **Motion is mathematics.** Animate orbits, flows, group actions, limits — not decoration.
   Every state change tweens (300–1400 ms, `app.tween`); nothing jumps.
7. **Restraint.** Dark ground, hairline strokes, at most four hues from the kit palette
   (`AV.C`, `AV.PALETTE`, `AV.ramp`), on-canvas labels only where needed and ≤ 3 words.
   Leave breathing room: fit the drawing into `app.fitCircle()` / `app.fitRect()` / panes.
8. **Mathematics is typeset.** Every formula on the page (captions, readout, slider values,
   labels on the picture) goes through `AV.tex` / `AV.texify` / `AV.texLabels`; never Unicode
   stand-ins such as `ℚ(√−5)` or `x²`. Title and hook stay plain words.
9. **Precision lives behind ⓘ.** The info sheet states the theorem exactly, with names and
   years, in 25–130 words. Nothing on screen may contradict it.
10. **The mathematics is right.** Compute real objects (exact arithmetic where feasible:
   `AV.ex`, `AV.Q`). Register `AV.test` self-checks against known facts — they run on every
   load and fail verification if wrong.

## Budgets (enforced by `tools/verify.mjs`)

| element | budget |
|---|---|
| title | ≤ 7 words (aim for 2–5) |
| hook (under the title, and in the manifest) | 5–16 words, plain language |
| tour | 3–5 steps, each ≤ 26 words |
| info sheet (`math`) | 25–130 words |
| dock controls | 1–4 (play and ⓘ not counted) |
| other on-screen text outside the kit chrome | ≤ 14 words |
| self-tests | ≥ 1, all passing |
| console errors, network requests | none |

Verification also requires: every control visibly changes the stage (mark a control
`verify: false` only when it is idempotent at the default state, like "reset view"), the stage
is not blank, the phone layout (390×844) has no overlaps or horizontal scroll.

## Choosing the form

Start from the closest example; they all pass verification and show the idioms.

| the mathematics is… | form | start from |
|---|---|---|
| one geometric picture (orbits, tilings, projections) | single 2D stage, `app.fitCircle()` | `TEMPLATE.html`, `days/2026-09-29-coxeter-plane.html` |
| a picture plus a quantity that converges/grows | `panes` + `plot.js` | `kit/examples/split-panes.html` |
| two views of one object (surface ↔ cover, group ↔ graph) | `panes` (2 × weight 1) | `kit/examples/split-panes.html` |
| a curve/surface/polytope in space | 2D stage + `space3d.js` | `kit/examples/space3d.html` |
| a field over the plane (colourings, fractals, per-pixel tilings) | `stage: 'webgl2'` + `gl.js`, labels on `app.octx`, `edgeScrim: true` | `kit/examples/shader.html` |
| hyperbolic geometry | `hyperbolic.js` in any 2D form | `kit/examples/split-panes.html` |

Vary the form from day to day as much as the topic.

## Daily procedure

0. **Recover orphans.** `git status docs/autoVisualization` — if a `days/` page exists with
   no manifest entry (a previous run died), verify it and register it under its own date.
1. **Pick the topic:** the TOP entry of `futureVisualizations.md`. Deviate only for a clearly
   better idea (say so in the commit message); check `manifest.js` it isn't already covered.
2. **Plan before coding** (in your head or scratch, not in the page): the one idea, the
   gesture, the *aha* moment, the live check, the 3–5 tour beats, the form, the self-tests.
   If you cannot name the aha in one sentence, re-plan.
3. **Build** `days/YYYY-MM-DD-<slug>.html` from `TEMPLATE.html` (today's date, short kebab
   slug). Use the kit — read `kit/README.md` — and load only the modules you need. Page
   code: pure maths functions first, then state, then `draw`, then `AV.page({...})`, then
   `AV.test`s. Never reset mathematical state in `onResize` (screenshots fire resizes).
4. **Register** it: prepend an entry to `window.AUTOVIZ` in `manifest.js` (format below).
5. **Verify:** `node tools/verify.mjs days/<file>` — fix every ✗ and every WARN you can.
   It also writes `thumbs/<stem>.webp` and checks the gallery.
6. **Critique and polish (required).** Open the screenshots with the Read tool:
   `.verify/<stem>/step-1.png … step-N.png` and `mobile.png`. For each ask: Is there one
   clear focal point? Is the aha visible *in the picture* at that step? Anything crowded,
   overlapping, clipped, or illegible? Too many colours? Does the ✓/✗ make sense? Then
   improve and re-run verify. Do at least one polish pass even if everything passes.
7. **Replenish the queue:** remove the built entry from `futureVisualizations.md` and keep
   ≥ 5 entries in the format described there, varied in topic and in form.
8. **Commit** (see Git).

Unattended runs cannot use `preview_start` (nobody can approve it); `verify.mjs` drives
headless Chrome directly over `file://`, so no server is needed.

## Manifest entry

Prepend to `window.AUTOVIZ` in `manifest.js`:

```js
{
  date: "YYYY-MM-DD",
  file: "YYYY-MM-DD-slug.html",
  title: "Title Case Name",                 // same as the page title
  hook: "One plain sentence, ≤ 16 words.",  // same as (or a close variant of) the page hook
  topics: ["hyperbolic", "numbers"],        // 1–3 ids from AUTOVIZ_TOPICS, most relevant first
  v: 2                                      // kit page: the gallery embeds it live
}
```

Topics: `groups`, `hyperbolic`, `linear`, `numbers`, `topology`, `dynamics`, `symmetry`,
`combinatorics`. Add a new topic to `AUTOVIZ_TOPICS` only if a page fits none of them.

## The kit

- Daily runs may make **additive, backwards-compatible** improvements to `kit/` (a new
  helper, a new module) when several future pages would use them. Never change existing
  behaviour or the look of the chrome in a daily run.
- After touching `kit/`: `node tools/test-kit.mjs` and `node tools/verify.mjs --all`
  (re-checks every kit page and regenerates all thumbnails) must pass.
- Legacy pages (August–September 2026, no `v: 2`) are self-contained and are not edited by
  daily runs.

## Inspiration — tie it to this site

The gallery lives inside Nic Brody's site; pages should resonate with what is already there:

- `docs/GeometryofLinearGroups/` — Zariski closures, quaternion algebras, Fuchsian and
  Kleinian groups, the Riley slice, Dirichlet domains and Poincaré certificates, Markov
  starscapes on character varieties, Cayley-graph Laplacians, space groups, braids and Burau.
- `docs/topology/knotTheory/` — knot mosaics, knot energies.
- `docs/graphics/`, `docs/mathArt/`, `docs/Talks/` — Penrose tilings, hat monotile, Turing
  patterns, hyperbolic tessellations, orbifolds.

Recurring interests: linear groups over ℚ, arithmetic lattices, hyperbolic geometry in
dimensions 2–3, discreteness, character varieties, continued fractions, knots and braids,
Cayley graphs, tilings and Coxeter groups — with exact arithmetic behind the pictures. Do not
duplicate an existing site tool; build something adjacent.

## Git

- Commit **only** files under `docs/autoVisualization/` (never `.verify/`, which is ignored),
  with message `autoViz: YYYY-MM-DD <Title>`.
- Do NOT push. (Change this line to "Push after committing." to auto-deploy to GitHub Pages.)

## Never

- Modify anything outside `docs/autoVisualization/`.
- Use CDNs, remote fonts, or any network request; every page must work offline.
- Write paragraphs on the stage, or build chrome by hand instead of through `AV.page`.
- Write a formula in Unicode instead of typesetting it with `kit/tex.js`.
- Ship with a failing `verify.mjs`, a failing self-test, or without looking at the screenshots.
- Repeat a topic already in the manifest, or duplicate an existing site tool.
- Leave `futureVisualizations.md` with fewer than 5 entries.
