# Indra's Pearls — Figures 10.10, 10.13 and 12.1

Recreations of three figures from Mumford, Series & Wright, *Indra's Pearls*.
Pick the figure in the panel, or open `index.html?fig=10.10` (or `12.1`).

- `kleinian.js`: complex/Möbius arithmetic, Grandma's special parabolic
  commutator recipe (Box 21), the depth-first limit set walker,
  group-element enumeration, Farey words, cusp circle chains and disk orbits.
- `limitWorker.js`: Figs 10.10 and 10.13, rendered progressively by a pool of
  workers.
- `palette.js`: colour themes (OKLab-mixed) and colouring schemes.

## Performance

The limit-set DFS is split into subtrees by 4-letter prefix and walked by a
pool of up to 8 workers. The work is very uneven: two of the 108 subtrees,
spiralling into cusps, hold two-thirds of it. So whenever a thread is idle
with nothing queued, every busy worker is asked to donate the unstarted
sibling subtrees along its current path (`limitSetWalker().donate()`). Those
subtrees come after everything the donor still has to do, so the traced curve
stays continuous and the result is identical to a single walk. Measured in
Node on an M4 Pro, the 1-px pass of Fig 10.13 takes 18 s on one thread and
3.1 s on 8. Scaling is flat or worse beyond 8 threads (10 performance cores).

## Colouring

Workers label each leaf word with a class. The palette is applied to the
labels on the main thread, so changing it recolours instantly. The schemes:
- first to fourth letter, or the last letter of the leaf;
- consecutive letter pairs (12 classes: hue from the first letter, shade from
  the turn left, straight or right to the next);
- first three letters (36 classes);
- the turn pattern at letters 2–4 (27 classes);
- abelian drift, the angle of the net (a − A, b − B) exponents over the first
  24 letters;
- word length.

Themes give one anchor colour per generator; derived classes are mixed in
OKLab. Fig 12.1 uses the same theme as a cyclic ramp around arg f. The book's
colours remain as the "Book (original)" theme.
- `fig121.js`: Fig 12.1, a WebGL2 Poincaré-series shader.

## Fig 10.10 — A big double cusp

This uses the traces of the central pair (w₂₁/₃₄, w₁₃/₂₁) of the 987/1597 double
cusp group given on p. 332, fed into Grandma's recipe with the other root for
t_ab than Fig 10.13 (root +1). The frame is centre 0, half-width 1.5, which
matches the book's pixels about 95%. With these generators, the 21/34 Farey
words in (a, B) and in (b, a) are parabolic: they are the 21/34 and −34/21
cusps.

Each cusp's circle chain has two disks meeting at the fixed point of every
cyclic permutation σᵢ of its word. A disk is stabilised by a thrice-punctured
sphere group ⟨σᵢ, gσⱼg⁻¹⟩ whose product is also parabolic. Its circle passes
through the three parabolic fixed points, and is kept only if one side is empty
of sampled limit points (this rejects accidental Fuchsian subgroups). One disk
of the −34/21 chain is the component containing ∞ and is not drawn. Every other
ordinary-set component is an image of a chain disk. They are drawn exactly, as
the breadth-first orbit of the chain disks under a, b, A, B down to half a
pixel. The limit set underneath is coloured pale by its *first* letter.

## Fig 10.13 — Partition of the world

This is Jørgensen's doubly-degenerate group (the figure-eight knot's fiber
group). In the book's notation (a, B), t_a = (3−√3i)/2 and t_B = t_aB = conj(t_a).
In Grandma's (a, b) this means t_a = x, t_b = x̄, t_ab = x, where x = (3−√3i)/2.
Limit points are coloured by the third letter of their word: a red, b blue,
A green, B yellow. The default frame (centre 0.1, half-width 1.5) matches the
book's pixels about 96%.

The limit set is the whole sphere, but the book's termination test (consecutive
limit points within ε) stops at leaves whose pieces still hide long tentacles.
With that test alone, coverage stays at about 15% however deep you go. The
walker's `minNorm` option also requires ‖w‖² ≥ N before a leaf may terminate.
At N = 10⁴ this fills the picture for about 10% more leaves; much larger N
explodes near the cusps. After each pass, the remaining gaps are flood-filled
at the pass's resolution. The white disks that remain are cusp neighbourhoods
cut off at `maxLevel`.

## Fig 12.1 — fonction kleinéenne

The book prints the automorphic function as Σ(az+b)/(cz+d)³ / Σ(cz+d)⁻⁴. The
numerator is Σ γ(z)γ′(z), which has weight 2, not 4. The ratio is therefore not
invariant, and for Tr a = Tr b = 2.2 (critical exponent > 1) the numerator
diverges. The default instead uses Σ(az+b)/(cz+d)⁵ = Σ γ(z)γ′(z)². That ratio is
checked invariant numerically: f(az) = f(z) to 4 decimals at 10⁴ terms. The
printed version is still available under "numerator".

Elements are enumerated by |c|²+|d|² on the CPU each frame and summed per pixel
on the GPU. Cost scales with pixels × terms (about 33 G terms/s on an M4 Pro).
While the traces drift, the resolution adapts to keep about 30 fps; once
still, the view repaints at device resolution with 2.5× the terms.
