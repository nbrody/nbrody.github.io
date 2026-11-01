## Knot mosaics

**Entry notes.** Interactive · desktop and mobile · tap to interact on mobile (click on desktop).
Tags: Topology, Knot theory.
Palette: main `#818cf8`, secondary `#2dd4bf`, highlight `#fbbf24`, background `#060a14`, text `#eef1f8` (dark);
light theme main `#6d76f0`, secondary `#14b8a6`, highlight `#f59e0b`, background `#ffffff`, text `#16181e`.
Feed mode has no text. Esc (or ✕) returns from interact mode to the feed. `?embed=true` hides all chrome,
`?mode=interact` opens engaged (add `&knot=borromean`, `whitehead`, … to pick a mosaic), `?theme=light|dark`
overrides the system setting, `?t=` starts the feed at a given second.

Lomonaco and Kauffman draw knots with eleven square tiles: a blank tile, two straight pieces, four quarter
circles, two crossings (one with the horizontal strand on top, one with the vertical), and two tiles carrying a
pair of quarter circles. An *n*×*n* mosaic is a grid of these. When every piece meets a piece on the next tile,
the pieces close up into curves, and since each crossing tile says which strand is on top, the picture is a knot
diagram. Every knot can be drawn this way, and Kuriya and Shehab proved that two mosaics show the same knot
exactly when one can be turned into the other by a finite list of tile moves (letting the board grow). The smallest board a knot fits on
is its *mosaic number*: 4 for the trefoil, 5 for the figure-eight.

### What you're seeing
The board at the bottom is a mosaic. Its strand draws itself as a tube along the painted pieces, then lifts off:
each over strand is pushed up and each under strand down, which turns the diagram into an honest curve in space.
That curve then relaxes by flowing downhill on O'Hara's knot energy

    E(γ) = ∬ ( 1/|γ(s) − γ(t)|⁴ − 1/D(s, t)⁴ ) ds dt,

where *D*(*s*, *t*) is the distance between the two points measured along the curve. Two far-apart pieces of
the curve that come close cost a lot, so the strands push each other apart and the knot spreads into a round,
even shape. The energy blows up as two strands meet, so strands can never pass through each other and the knot
type never changes. The computer version (a polygon with a few hundred vertices, its length held fixed) caps every
step so that no edge can reach another, which keeps that promise exactly.

O'Hara's exponent-2 energy, the *Möbius energy* of Freedman, He and Wang, would be the classic choice, but it is
unchanged by inversions of space. An inversion turns the round three-lobed trefoil into a lopsided one with a big
loop and a small knotted part, with exactly the same energy, so that flow has no reason to round anything out.
Exponent 4 breaks the tie and lands on the symmetric shapes.

The feed shows the trefoil, the figure-eight knot and the Borromean rings. Each one rises, relaxes while it turns,
settles back into the tiles and sinks into the paint, and then the tiles flip over to show the next mosaic. The
knot's shadow falls on the mosaic below: at first it is the drawing on the tiles, and as the knot relaxes it
becomes a rounder drawing of the same knot.

### The name of the knot
In interact mode the card names what is on the board using the Jones polynomial, computed from Kauffman's bracket.
Each crossing can be smoothed in two ways, and on a mosaic that just means swapping the crossing tile for one of the
two-arc tiles. The bracket adds up all 2ᶜ ways of smoothing the *c* crossings,

    ⟨D⟩ = Σ_states A^{#A − #B} (−A² − A⁻²)^{loops − 1},

and V(t) = (−A³)^{−w} ⟨D⟩ at A = t^{−1/4}, where *w* is the writhe. It tells a knot from its mirror image: the
trefoil on the board is right-handed, V(t) = t + t³ − t⁴, and its mirror has V(t) = t⁻¹ + t⁻³ − t⁻⁴.

### Try this
- Tap any crossing of the trefoil (Switch it). The tile turns a quarter turn, which swaps over and under, and what
  lifts off is an unknot: it relaxes into a perfectly round circle.
- Switch one crossing of the cinquefoil: you get a trefoil. Switch a twist crossing of the stevedore knot: you get
  the figure-eight; switch one of its two clasp crossings instead: an unknot.
- Choose the Borromean rings. Every pair of rings is unlinked, yet the three hold together. Switch any one crossing
  and you get a Hopf link plus a separate circle; smooth one instead (Smooth it) and two rings merge into the
  Whitehead link.
- Switch the middle crossing of the Whitehead link: the two components come apart.
- Drag the Relax slider to watch the flow forwards and backwards. Drag the scene to turn it; Space lifts the knot or
  sets it down; the number keys 1–0 pick a mosaic.

**References.** S. J. Lomonaco and L. H. Kauffman, "Quantum knots and mosaics", *Quantum Inf. Process.* 7 (2008),
85–115. T. Kuriya and O. Shehab, "The Lomonaco–Kauffman conjecture", *J. Knot Theory Ramifications* 23 (2014).
J. O'Hara, "Energy of a knot", *Topology* 30 (1991), 241–247. M. H. Freedman, Z.-X. He and Z. Wang, "Möbius energy
of knots and unknots", *Ann. of Math.* 139 (1994), 1–50. L. H. Kauffman, "State models and the Jones polynomial",
*Topology* 26 (1987), 395–407.
