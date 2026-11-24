# Daily Math — Specification & Pipeline Harness

One numbered mathematical plate every day (`PLATE 001`, `PLATE 002`, ...): an interactive, exact, dual-mode visualization of one theorem or phenomenon across geometry, groups, topology, dynamics, number theory, linear algebra, or combinatorics.

```
docs/dailyMath/
  SPEC.md              <- this pipeline specification
  QUEUE.md             <- prioritized backlog (>= 6 varied plates)
  TEMPLATE.html        <- copy this to start a new plate
  manifest.js          <- DM_TOPICS + DM_PLATES (newest first)
  index.html           <- editorial gallery (live hero + topic filters + archive)
  atelier/             <- shared Dual-Mode Atelier design system & math library
    README.md          <- module API reference
    palette.js         <- Parchment (light) & Obsidian (dark) mineral/luminous tokens
    atelier.css        <- typography, plate frame, floating chrome, native <dialog>
    atelier.js         <- DM.page shell, theme toggle, tour, dock, loop, pointer, DM.test
    draw.js            <- 2D canvas primitives & y-up camera
    plot.js            <- editorial charts for panes
    math-exact.js      <- BigInt, rationals Q, continued fractions, SL2(Z), Z[i]
    math-linalg.js     <- matrices, Jacobi eigen, Cholesky, Gram-Schmidt, rotations
    math-complex.js    <- complex numbers, Mobius maps, Poincare disk & UHP
    space3d.js         <- 3D inertia orbit camera & depth-cued strokes
    gl.js              <- WebGL2 shader helper with //#DM_PALETTE
    tex.js             <- vendored KaTeX + pinned DM.texLabels
    vendor/katex/      <- offline KaTeX fonts, CSS & JS
  tools/
    test-atelier.mjs   <- unit tests for palette contrast & atelier math modules
    verify.mjs         <- headless Chrome CDP verifier, budgets, dual-mode & mobile shots
  plates/              <- YYYY-MM-DD-<slug>.html
  thumbs/              <- WebP gallery thumbnails written by verify.mjs
```

## The Dual-Mode Atelier Aesthetic

Every plate belongs to one museum-grade visual family and **must render cleanly in both modes** (switchable at any moment with the theme button or `T`):

- **Museum Parchment (`light`)**: warm rag paper (`#f5f1e8` -> `#ece5d7`), iron-gall charcoal (`#1c1915`), mineral pigments (`cobalt`, `vermilion`, `verdigris`, `ochre`, `plum`, `slate`), fine compass/engraving hairlines. Ideal for classical Euclidean/projective geometry, continued fractions, curves, tilings, and graphs.
- **Observatory Obsidian (`dark`)**: deep indigo-obsidian (`#0a0c12` -> `#131826`), starlight ivory (`#eeeae0`), luminous matching pigments. Ideal for WebGL2 phase/domain fields, dense caustics, hyperbolic tilings, and 3D filaments.

Set `defaultTheme: 'light'` or `'dark'` per plate based on its natural medium, and always read colors from `app.palette` inside `draw(app)` (never hardcode theme hex values once at startup) so toggling modes looks intentional in both grounds.

## Design Principles

1. **One theorem, one picture.** No "and also" clutter; let the geometry breathe inside `app.fitCircle()` / `app.fitRect()` / `app.panes`.
2. **Direct manipulation first.** Drag a vertex, slide a parameter, tap a point on the diagram. Keep dock controls between 1 and 4 (plus optional `play`).
3. **Live invariant check.** Use `app.readout(...)` with `DM.check(bool, label)` to compute and verify a genuine mathematical identity live as the user plays.
4. **Tour as choreography.** 3–5 concise steps (`see -> gesture -> surprise -> theorem`). Each step updates state, animates (`app.tween`), or highlights a control (`app.pulse`).
5. **Typeset mathematics.** Every formula on stage, in readouts, in tour captions, and in notes goes through `DM.tex` / `DM.texify` / `DM.texLabels` — never raw Unicode math stand-ins.
6. **Rigorous self-checks.** Register `>= 2` independent `DM.test(...)` mathematical assertions per plate verifying identities, invariants, or boundary cases against exact arithmetic or machine precision.

## Enforced Budgets (`tools/verify.mjs`)

| Element | Budget |
|---|---|
| `title` | `<= 7` words |
| `hook` | `5–16` plain words |
| `tour` | `3–5` steps, each `<= 26` words |
| `math` (inside `ⓘ` `<dialog>`) | `25–130` words, naming theorem & origin |
| dock controls | `1–4` (excluding `play`) |
| stray non-chrome stage text | `<= 14` words |
| self-tests (`DM.test`) | `>= 2`, all passing |
| console errors / external network | `0` |
| dual-mode + mobile `390x844` | non-blank in both themes, zero overlap, zero horizontal scroll |

## Daily Procedure

0. **Recover orphans.** Check `git status docs/dailyMath` — if an unregistered `plates/*.html` exists from an interrupted run, verify it, inspect its screenshots, register it in `manifest.js`, and check `QUEUE.md`.
1. **Pick the top entry** of `QUEUE.md` (check `manifest.js` to confirm no duplication; determine the next `PLATE NNN` number = `DM_PLATES.length + 1` zero-padded to 3 digits).
2. **Plan mentally** before writing code: the one theorem, the direct gesture, the aha beat, the live `DM.check` invariant, the form (`2D` / `panes+plot` / `3D` / `webgl2`), `defaultTheme` (`light` or `dark`), and `>= 2` `DM.test` checks.
3. **Build** `plates/YYYY-MM-DD-<slug>.html` from `TEMPLATE.html` using `atelier/README.md`. Load only the modules needed. Keep pure math functions separate at the top, then state, `draw(app)`, `DM.page({...})`, pointer handlers, and `DM.test(...)`.
4. **Register** by prepending the entry to `window.DM_PLATES` in `manifest.js` (including `plate`, `date`, `file`, `title`, `hook`, `topics`, `defaultTheme`, `form`).
5. **Verify**:
   - `node docs/dailyMath/tools/verify.mjs docs/dailyMath/plates/<file>`
   - `node docs/dailyMath/tools/verify.mjs --gallery`
   Fix every FAIL and WARN.
6. **Visual critique & polish (mandatory).** Open all generated images with `read_file`:
   - `docs/dailyMath/.verify/<stem>/step-1.png` ... `step-N.png`
   - `docs/dailyMath/.verify/<stem>/alt-theme.png`
   - `docs/dailyMath/.verify/<stem>/mobile.png`
   Critique composition, contrast in both Parchment & Obsidian, label legibility, KaTeX placement, and mobile spacing. Perform at least one genuine polish edit and re-run `verify.mjs`.
7. **Replenish `QUEUE.md`**: remove the built entry and keep `>= 6` queued entries alternating themes and varying forms & topics.
8. **Commit locally (never push)**:
   - Run `git status`.
   - Stage **only** `docs/dailyMath/`: `git add docs/dailyMath/`
   - Commit with `dailyMath: Plate NNN — <Title>`

## Never

- Touch any file outside `docs/dailyMath/`.
- Load remote fonts, CDNs, or external scripts/images (must pass 100% offline over `file://`).
- Build chrome by hand or bypass `DM.page` / native `<dialog>`.
- Use Unicode math (`ℚ`, `x²`) instead of `DM.tex` / `DM.texify` / `DM.texLabels`.
- Ship without passing `verify.mjs`, passing all `DM.test` checks, and reading every verification screenshot.
- Auto-push commits.
