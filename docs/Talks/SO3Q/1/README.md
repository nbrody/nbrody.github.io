# SO₃(ℚ) · Part 1 — One dimension down

The first of three talks on SO₃(ℚ). This one is Section 1 of the outline in
`../script.md`: the rotations of the plane with rational entries, Pythagorean
triples, primes ≡ 1 (mod 4), and the infinite-dimensional lattice hiding
inside SO₂(ℚ).

It's a reveal.js deck in the style of `../../MathFest/`, with the same design
system, the same Firebase phone remote, and full-bleed interactive
visualizations.

## Presenting

```bash
./serve.sh        # then open http://localhost:8778/Talks/SO3Q/1/
```

Or use the `so3qTalk1` launch config (repo-rooted, no-store, port 8778; open
`/docs/Talks/SO3Q/1/`). `file://` also works, apart from the remote.

- **Navigation is linear.** → / Space / PageDown / the remote's Next step through
  every slide and fragment, vertical stacks included.
- **Present** (title slide) shows a QR code for the phone remote (Firebase; needs
  network). For a same-machine remote, open `?remote=1` in a second window
  (BroadcastChannel, works offline).
- **S** opens the speaker view. The notes carry the outline's sentences verbatim,
  plus facts for questions.
- Clicking into a visualization gives it the mouse. Arrow keys pressed there are
  forwarded to the deck, so the talk keeps advancing.
- After typing in the factorizer, press Enter or Esc (or click the background)
  to hand the arrow keys back to the deck.

## The slides

| # | Slide | What happens |
|---|---|---|
| 1 | Title | The crown of rational points of the circle turns behind the title |
| 2 | One of my favorite groups | SO₃(ℚ), with the example of the rotation by 60° about (1,1,1) |
| 3 | Geometric, arithmetic, topological | Three words light up |
| 4 | One dimension down | SO₂(ℚ) |
| 5 | *grid* scene | The grid ℤ² → rotated copies land back only at quarter turns → e₁ has 4 places to go |
| 6 | A finite group | SO₂(ℤ) ≅ ℤ/4; "what if only a third, or a fifth?" |
| 7 | *grid* scene | A generic rotation (only the origin lands) → two index-5 sub-grids → arccos(3/5) carries one onto the other → R² (1/25) → R³ (1/125) |
| 8 | Rotations with rational entries | ⟺ Pythagorean triples; exactly 1/c of the grid lands |
| 9 | Which denominators occur? | A 1–100 sieve: denominators light up, then primes ≡ 1 / ≡ 3 (mod 4) |
| 10 | *grid* scene, explorable | The spectrum: every rational rotation at its angle, with a spike of height 1/c. Drag it, or turn the grid, and it snaps to rational rotations |
| 11 | *unfold* scene | The powers of r₅ appear one at a time around the circle |
| 12 | Unravelling SO₂(ℚ) | Generators r_p = (x+iy)²/p; SO₂(ℚ) = SO₂(ℤ) × ⟨r₅⟩ × ⟨r₁₃⟩ × ⋯ |
| 13 | Every rotation factors uniquely | Live factorizer: chips, or type any a, b, c |
| 14 | A striking observation | Obvious geometry vs intrinsic geometry |
| 15 | *unfold* scene | Circle → powers of r₅ → unwrap to ℤ → ⟨r₅, r₁₃⟩ tangle → ℤ² → denominators as taxicab distance → ℤ³ → one axis per prime |
| 16 | …an infinite-dimensional lattice! | SO₂(ℚ)/SO₂(ℤ) ≅ ⊕ ℤ |
| 17 | Next time / Thank you | |
| 18 | Appendix | Why primes ≡ 1 (mod 4) (backup for questions) |

## Files

- `index.html`: the slides, speaker notes, remote UI, and the two scene iframes
- `deck.js`: reveal set-up, scene sync, the sieve, the factorizer, the title crown
- `remote.js`: the phone remote (Firebase + BroadcastChannel; commands are deduplicated)
- `style.css`: the theme (MathFest tokens) and the widgets
- `viz/common/gauss.js`: exact arithmetic for SO₂(ℚ): factor any rotation as ±iᵏ∏r_p^{n_p}, generators, Euclid's rational points. Shared by the deck and both scenes
- `viz/common/viz.js`, `viz.css`: the scene kit, with the embed contract, captions, tweens, and a steppable clock
- `viz/grid/`: *Rotating the grid* (9 steps). Glows mark exactly the points that land, computed as the sub-grid β̄ℤ[i], never from a distance tolerance
- `viz/unfold/`: *Unfolding the circle* (8 steps). Hover any dot for its exact value, denominator and factorization; drag to orbit in 3D
- `vendor/`: reveal.js 5.2, MathJax 3, Inter + Playfair Display (copied from MathFest)

Each scene also works standalone (`viz/grid/`, `viz/unfold/`), with its own step
arrows and keys (←/→, P pause, R reset). `?step=<id>` starts at a step.

## Embed contract (deck ↔ scene)

- The deck sends `{type:'goTo', step}`, `{type:'active', on}`, `'toggle'`,
  `'reset'`, and `{type:'orbit', dx, dy}`.
- The scene sends back `{type:'iframeNav', direction}` for arrow keys,
  `{type:'iframeKey', keyCode}` for S/F/B/O/Esc, and `{type:'vizReady'}`.
- The step is always re-derived from the DOM: the current slide's
  `data-stage`/`data-step`, plus its last visible `.stage-step` fragment. So
  jumping around (hash, overview, remote) never desyncs a scene.
- For testing when requestAnimationFrame is throttled, `window.viz.advance(seconds)`
  steps a scene's clock by hand.

## The math, verified

The math was checked by exhaustive tests in Node. Every rational point with
c ≤ 3000 (3,820 points) factors and round-trips exactly, with denominator
∏p^{|n_p|}. For all 504 rotations with c < 400, the points landing on the grid
are exactly β̄ℤ[i], of index c.
