# Future visualizations — rolling queue

Maintained by the daily AutoViz run. Rules:

- Keep **at least 5** upcoming entries, in priority order. The daily run builds the top
  entry, removes it, and appends replacements the same day.
- Every entry must name its **planned interactive/dynamic component** — an entry with no
  interaction planned doesn't belong in the queue.
- Root ideas in this site's existing mathematical world (see the Inspiration section of
  `HARNESS.md`): linear groups, arithmetic subgroups, hyperbolic geometry, Kleinian and
  Fuchsian groups, character varieties, knots and braids, Cayley graphs, tilings and
  Coxeter groups, dynamics with exact arithmetic underneath.
- Vary the area across consecutive days; never queue something an existing site tool
  already does — build something adjacent that complements it.

Entry format: title, area, the phenomenon and the honest theorem behind it, the planned
interaction, and the connection to existing site content.

## Queue

1. **Polynomial Growth of the Heisenberg Group** — geometric group theory.
   Balls in the integer Heisenberg group grow like R⁴, not R³ (Bass–Guivarc'h: the growth
   degree is Σ k·rank of the k-th lower central quotient) — the first stop beyond abelian
   in Gromov's polynomial-growth world.
   *Interaction:* side-by-side animated BFS filling of Cayley-graph balls for ℤ³ and the
   Heisenberg group with a log-log growth plot fitting the exponent live; generator-set
   selector to see the exponent is invariant.
   *Site tie:* cayleyLaplacian and the Cayley-graph theme; lattices in Lie groups (BHC).

2. **Unfolding Billiards in Polygons** — dynamics.
   Reflecting the table instead of the ball straightens a billiard trajectory into a line:
   unfolding conjugates polygonal billiards to straight-line flow on a translation
   surface, and for the square this proves a trajectory is periodic iff its slope is
   rational.
   *Interaction:* aim the ball with a drag (angle readout), watch the bounce animation and
   the unfolded straight line side by side; polygon selector (square, equilateral,
   right triangles); rational/irrational slope verdict with orbit closure shading.
   *Site tie:* the dynamics register of xiaTheorem/billiard-adjacent graphics; translation
   surfaces neighbor the Talks' flat-geometry material.

3. **Jacobi's Four-Square Theorem, Quaternionically** — arithmetic.
   r₄(n) = 8·(sum of divisors of n not divisible by 4): every n is a sum of four squares,
   with a count governed by a modular form — and the four-square lattice points are
   exactly the Lipschitz quaternions of norm n.
   *Interaction:* slider for n showing the lattice points of norm n projected from the
   3-sphere of radius √n (rotatable), with the count checked live against 8σ(n); a running
   plot of r₄(n)/8 against the divisor sum as n sweeps.
   *Site tie:* quaternion algebras (quaternionBeamSearch, GPS ramification) and the
   arithmetic section.

4. **The Bruhat–Tits Tree for SL₂(ℚ_p)** — p-adic groups · geometric group theory.
   Homothety classes of ℤ_p-lattices in ℚ_p² are the vertices of a (p+1)-regular tree on
   which SL₂(ℚ_p) acts by isometries; Serre's classification says an element is elliptic
   (a fixed point) exactly when |tr g|_p ≤ 1 fails to force a translation, and otherwise it
   translates along an axis by 2·v_p of the eigenvalue ratio.
   *Interaction:* p selector (2, 3, 5, 7) redrawing the tree; enter a matrix in SL₂(ℚ_p)
   and watch its orbit of a base vertex animate along its axis, with a live elliptic /
   hyperbolic verdict and translation length from the valuation of the trace.
   *Site tie:* the arithmetic section, lattices in Lie groups (BHC), and the ping-pong /
   discreteness thread — the tree is the p-adic analogue of the hyperbolic plane.

5. **Lagrange–Gauss Lattice Reduction** — lattices · linear groups over ℤ.
   The two-dimensional analogue of Euclid's algorithm: repeatedly subtract the nearest
   multiple of the shorter vector from the longer one. It terminates in a basis realising
   the successive minima, and every step is an elementary matrix, so the whole run is a
   factorisation of the change of basis in SL₂(ℤ); the worst possible shortest vector is
   the hexagonal lattice's, giving Hermite's constant γ₂ = 2/√3.
   *Interaction:* drag the two basis vectors; the algorithm animates step by step with the
   SL₂(ℤ) word accumulating, the Gram matrix shown exactly, and the reduced fundamental
   domain drawn against the modular-surface picture of the same lattice.
   *Site tie:* linear groups over ℚ/ℤ, the modular surface (cutting sequences), and the
   arithmetic-subgroup material.

6. **Alexander Polynomials from Braid Closures** — knots and braids.
   The reduced Burau representation β_n → GL_{n−1}(ℤ[t,t⁻¹]) computes the Alexander
   polynomial of the closure of a braid β by Δ(t) ≐ det(I − Burau(β))·(1−t)/(1−tⁿ);
   Markov moves change the braid but not the link, and so not the polynomial.
   *Interaction:* build a braid word by clicking crossings on strands, see the closure
   drawn live and the Burau matrix and Δ(t) recomputed exactly over ℤ[t,t⁻¹]; a "Markov
   move" button demonstrates the invariance.
   *Site tie:* the Burau tool (which hunts kernel words) and knotMosaics / knot energies —
   this is the representation-theoretic side of the same braid story.
