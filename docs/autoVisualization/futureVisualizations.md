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
1. **Hyperbolic Dehn Surgery on the Figure-Eight Knot** — 3-manifolds · Kleinian groups.
   Thurston's hyperbolic Dehn surgery theorem: all but finitely many fillings of the
   figure-eight knot complement are hyperbolic, and the gluing/completeness equations of its
   two ideal tetrahedra deform in a one-complex-dimensional family, the shape z of a
   tetrahedron moving off the regular value z = e^{iπ/3} as the cone angle changes; volume
   is maximal exactly at the complete structure (Milnor's Lobachevsky function).
   *Interaction:* drag the surgery coefficient (p, q) on a grid and watch Newton's method
   solve the gluing equations live, with the two tetrahedron shapes plotted in the upper
   half-plane, the volume 2Λ(π/3)-decreasing readout, and a flag when a shape degenerates.
   *Site tie:* the Kleinian-groups section, GPS manifolds, and the knot-theory pages.

2. **Growth Series of Coxeter Groups and Salem Numbers** — Coxeter groups · exact arithmetic.
   Steinberg's formula computes the growth series W(t) = Σ t^{ℓ(w)} of a Coxeter group as a
   rational function assembled from the finite parabolic subgroups, 1/W(1/t) = Σ_{W_S finite}
   (−1)^{|S|}/W_S(t); it is a rational function with integer coefficients, and for a cocompact
   hyperbolic Coxeter group in rank 4 the reciprocal of its smallest positive root is a Salem
   number — Cannon–Wagreich's growth of the (2,3,7)-triangle group being the classic example.
   *Interaction:* edit the Coxeter diagram (drag edge labels m_ij) and watch the growth series
   recomputed exactly over ℤ as the ball sizes in the Cayley graph enumerate alongside; the
   roots animate in the complex plane, crossing onto the unit circle as the group leaves the
   spherical/affine range.
   *Site tie:* the triangle-group kaleidoscopes page and the space-groups tool — this is the
   arithmetic invariant hiding inside those tilings.

3. **Thompson's Group F: Tree Pairs and Dyadic Rearrangements** — geometric group theory.
   F is the group of piecewise-linear homeomorphisms of [0,1] with dyadic breakpoints and
   slopes powers of 2; it is presented by ⟨x₀, x₁, … | x_k^{-1} x_n x_k = x_{n+1}, k < n⟩, is
   torsion-free of infinite geometric dimension, and every element is a reduced tree pair
   (T₋, T₊) with the same number of leaves — composition being the "common refinement" of the
   two trees.
   *Interaction:* build two binary trees by clicking to split leaves, see the resulting PL
   graph of the homeomorphism and its action animated on a row of dyadic points; compose two
   elements and watch the refinement/reduction cancel carets in real time.
   *Site tie:* the Cayley-graph and amenability threads — F is the standing open question
   those tools circle around.

4. **Lorenz Knots from the Geometric Model** — dynamics · knot theory.
   Birman–Williams: periodic orbits of the Lorenz flow, collapsed along the stable foliation
   onto the branched-surface template, are exactly the closures of *Lorenz braids* — positive
   braids whose underlying permutation moves an initial block of strands rightwards past the
   rest, order-preserving on each block. Every Lorenz knot is therefore fibered and prime, and
   its genus is given by Bennequin's formula 2g = c − n + 1 for the positive braid; the trefoil
   is the simplest one.
   *Interaction:* integrate the Lorenz equations live, capture a near-periodic orbit, and watch
   it project onto the template while the Lorenz permutation and its positive braid word are
   read off; a slider on ρ moves through the parameter family and changes which knots appear.
   *Site tie:* the knot-theory pages (mosaics, energies) and the dynamics thread — a bridge
   between the two that no existing tool covers.

5. **Bianchi Groups: Cusps and Class Numbers** — arithmetic Kleinian groups · algebraic number theory.
   PSL₂(O_d) acts on hyperbolic 3-space with finite covolume, and its cusps are in bijection
   with the ideal class group of O_d = the ring of integers of ℚ(√−d) — so PSL₂(ℤ[i]) has one
   cusp while PSL₂(O₅) has h(−20) = 2. The isometric spheres |cz + d| = 1 over the lattice O_d
   cut out the Bianchi fundamental polyhedron, whose floor is exactly where no sphere covers.
   *Interaction:* select d from the squarefree list, watch the isometric hemispheres accumulate
   over the ℂ-plane as the (c,d) pairs enumerate in order of |c|, with the exposed floor shaded
   live; cusp representatives (non-principal ideals) appear as marked points, and the counter
   checks the count against the class number computed by exact ideal reduction.
   *Site tie:* the Kleinian section, GPS manifolds, and the quaternion-algebra pages — this is
   the arithmetic lattice those tools take for granted.

6. **The Coxeter Plane and the Coxeter Number** — Coxeter groups · root systems.
   Every finite Coxeter group W has a Coxeter element c (a product of all simple reflections)
   of order the Coxeter number h, and it acts on a distinguished 2-plane — the Coxeter plane —
   as rotation by exactly 2π/h; projecting the root system onto that plane gives the familiar
   h-fold rosettes (h = 30 for E₈, its 240 roots landing in 8 concentric 30-gons). The exponents
   m₁ ≤ ⋯ ≤ mₙ are the eigenvalue data, with Σmᵢ = number of positive roots.
   *Interaction:* pick a root system (A_n, B_n, D_n, E₆, E₇, E₈, H₃, H₄) and watch c act, roots
   stepping 2π/h per click or animating continuously; a slider reorders the simple reflections to
   show every Coxeter element is conjugate, and a readout checks h, the exponents, and |Φ⁺| = Σmᵢ.
   *Site tie:* the triangle-group kaleidoscopes and space-groups tool — the linear-algebraic
   skeleton behind those reflection tilings.
7. **Jørgensen's Inequality and the Shape of Discreteness** — Kleinian groups · discreteness.
   If ⟨A, B⟩ ⊂ SL₂(ℂ) is discrete and non-elementary then |tr²A − 4| + |tr[A,B] − 2| ≥ 1, with
   equality attained e.g. by the modular group and the figure-eight knot group; for A
   parabolic this is Shimizu–Leutbecher's bound |c| ≥ 1 on the lower-left entry of B.
   *Interaction:* drag (tr A, tr B, tr AB) in a slice of the character variety; the Jørgensen
   quantity is shaded live, and a small orbit plot of the group acting on ℂ̂ turns chaotic as the
   point crosses into the forbidden region; presets land on the extremal groups.
   *Site tie:* the discreteness-certificate and Riley-slice tools — this is the universal
   necessary condition those tools test against.
8. **Hecke Groups and Discreteness at λ = 2cos(π/q)** — Fuchsian groups · number theory.
   Hecke's theorem: the group generated by z ↦ −1/z and z ↦ z + λ (λ > 0) is discrete if and only
   if λ ≥ 2 or λ = 2cos(π/q) for an integer q ≥ 3; at those values it is the (2, q, ∞) triangle
   group, and its cusp set is the field of λ-continued fractions (Rosen), all of ℚ(λ) ∪ {∞} exactly
   when q ∈ {3, 4, 6} (Leutbecher).
   *Interaction:* a λ slider sweeps continuously; the orbit of a fundamental strip is drawn in the
   upper half-plane and visibly tiles for the Hecke values while overlapping elsewhere; a readout
   runs the Rosen continued-fraction algorithm on a chosen point with exact arithmetic in ℤ[λ].
   *Site tie:* the Fuchsian discreteness calculator and cutting-sequence pages — the one-parameter
   family where discreteness is decided by a single trigonometric number.
9. **Measured Laminations on the Punctured Torus and Thurston's Circle at Infinity** — Teichmüller theory · piecewise-linear dynamics.
   Measured laminations on the once-punctured torus are parametrised by ML ≅ (ℝ² ∖ 0)/±1 (Dehn–Thurston
   / train-track coordinates), with the simple closed curves as the primitive integer points and
   PML = S¹ compactifying Teichmüller space ℍ; Mod = SL₂(ℤ) acts *linearly* on these coordinates
   (the punctured torus is special), so projective classes of Anosov invariant laminations are
   quadratic irrationals, and intersection number i(λ, μ) = |det| extends continuously to ML.
   *Interaction:* drag a point in the ML plane and see the lamination drawn as a fat train track
   of weighted parallel strands on the punctured torus (integer points = curves, irrational rays =
   minimal laminations filling densely); apply twists to watch the point move and a Farey-disc
   inset show the same class on ∂ℍ, with a slider sampling rational approximants p/q → the ray.
   *Site tie:* the natural continuation of the 2026-09-25 Dehn-twist page and the Farey / Riley-slice
   pictures — the boundary that the Riley slice's cusp rays are indexed by.
