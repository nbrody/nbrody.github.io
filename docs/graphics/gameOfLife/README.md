# Game of Life in (ℤ/2)²

Conway’s Life, told as a series of scripted stories. In the three-state mode,
every live cell carries a “charge” in the Klein four-group V = (ℤ/2ℤ)². The
three nonzero elements a, b, c are drawn in three colours. Dependency-free
Canvas 2D. Open `index.html` over HTTP to enter Graphics Studio, or add
`?standalone=1` for the page with its own panel. Add `&story=<id>` to start a
particular story.

## States and laws

Cells are encoded as `0, a = 1, b = 2, c = 3`, so addition in V is bitwise XOR.
The birth/survival rule (B3/S23 by default) counts live neighbours without
regard to colour. So the field’s black-and-white shadow is ordinary Life, and
the colours are extra structure on top. The one exception is triad
cancellation. A birth whose parents include all of a, b and c sums to zero,
and under the laws that cancel it is stillborn. Only then does colour change
the shadow.

| Law | Births | Survivors |
| --- | --- | --- |
| Heredity | sum of the parents (a + a + b = b); triads stillborn | keep their colour |
| Alchemy | as Heredity | x becomes x + Σ neighbours, unless that is 0 |
| Predation | with only x and σ(x) present, σ(x) wins; otherwise majority | each σ(x) neighbour converts x with probability *bite* |
| Tribes | majority colour | defect to a colour that outnumbers theirs (≥ 2) |

σ : a → b → c → a is an order-3 automorphism of V, one of the 3-cycles in
Aut(V) = GL₂(𝔽₂) ≅ S₃. A one-colour pattern evolves exactly as in Life under
every law. **Mutation** re-colours each newborn at random with the given
probability.

The **lens** recolours the display without touching the state. *Quotient by
⟨g⟩* shows the image in V/⟨g⟩ ≅ ℤ/2: cells equal to g are drawn grey, the
other two in one colour. *Shadow* shows alive/dead only.

## Stories

Each story in `stories.js` is a list of beats at fixed generations. A beat
places patterns, scatters soups, changes the rule, law, mutation or bite, and
shows a chapter caption. Positions are fractions of the field, so stories adapt
to any aspect ratio. *Cells across: Auto* uses each story’s preferred scale.

- **Genesis**: an R-pentomino, a burst of mutation that splits one live state
  into three, heredity, an acorn, a visiting fleet, then Alchemy.
- **Three Forges**: three Gosper guns, one per colour. A mutation fever makes
  triads cancel inside the guns until they fail. Then three new guns are lit.
- **Seasons**: a soup under Life, then Life without death, Maze and Coral,
  followed by a thaw back to Life.
- **Three Kingdoms**: single-colour soups flooded into Day & Night continents.
  Predation fronts, then mutation-driven waves, then Tribes territories.
- **The Garden**: pulsars and pentadecathlons, a glider squall, diehards, Alchemy.

When a story ends, the page plays the next one by default. You can also
replay it or keep running. Painting and stamping work at any time.

Keys: Space pause, `n` step, `r` restart, `s` next story, `h` hide panel,
`t` rotate stamp. Open edges keep a hidden 12-cell margin whose outer ring is
held dead, so escaping ships vanish instead of piling up.

## Verification

```sh
node --test gameOfLife/*.test.mjs
```

The tests cover the group laws and σ, rule parsing, and spaceship and gun
periods. They check that one-colour runs match plain Life under every law,
test each law’s colour arithmetic and edge absorption, and run every story to
completion on two grid shapes.
