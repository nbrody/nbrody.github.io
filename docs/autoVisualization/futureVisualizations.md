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
1. **Lagrange–Gauss Lattice Reduction** — lattices · linear groups over ℤ.
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

2. **Alexander Polynomials from Braid Closures** — knots and braids.
   The reduced Burau representation β_n → GL_{n−1}(ℤ[t,t⁻¹]) computes the Alexander
   polynomial of the closure of a braid β by Δ(t) ≐ det(I − Burau(β))·(1−t)/(1−tⁿ);
   Markov moves change the braid but not the link, and so not the polynomial.
   *Interaction:* build a braid word by clicking crossings on strands, see the closure
   drawn live and the Burau matrix and Δ(t) recomputed exactly over ℤ[t,t⁻¹]; a "Markov
   move" button demonstrates the invariance.
   *Site tie:* the Burau tool (which hunts kernel words) and knotMosaics / knot energies —
   this is the representation-theoretic side of the same braid story.

3. **Kesten's Criterion: Random Walks and Amenability** — probability · geometric group theory.
   The n-step return probability of the simple random walk on a Cayley graph decays like
   ρ^n, and Kesten's theorem says the spectral radius ρ equals 1 exactly when the group is
   amenable — so ℤ² and the Heisenberg group give ρ = 1 while F₂ gives ρ = √3/2 = 0.866…,
   the value forced by the 4-regular tree.
   *Interaction:* group selector (ℤ², H₃(ℤ), F₂, lamplighter ℤ₂≀ℤ) with a live cloud of
   walkers animating on the graph, a plot of p₂ₙ(e)^{1/2n} converging to ρ, and an exact
   transfer-matrix computation of p₂ₙ for the tree to check the limit.
   *Site tie:* the Cayley-graph thread (cayleyLaplacian) and the ping-pong/free-group
   material — amenability is the analytic shadow of the same dichotomy.

4. **The Rauzy Fractal of the Tribonacci Substitution** — tilings · dynamics.
   The substitution a→ab, b→ac, c→a has abelianisation matrix of Pisot type; projecting the
   broken line of its fixed point onto the contracting plane gives the Rauzy fractal, which
   tiles that plane by ℤ² translates and conjugates the substitution to a rotation of the
   two-torus by the Tribonacci constant.
   *Interaction:* iterate the substitution step by step and watch the fractal assemble from
   the projected letters; a slider for the number of iterations, a toggle for the three
   subtiles, and a click that follows a point through the domain exchange to expose the
   torus rotation.
   *Site tie:* the tilings/Penrose material in docs/graphics and the continued-fraction
   thread — Tribonacci is the cubic analogue of the golden ratio.

5. **Conway–Coxeter Frieze Patterns** — combinatorics · cluster algebras.
   A frieze pattern is an array of positive integers bordered by 1s in which every diamond
   satisfies *ad* − *bc* = 1; Conway and Coxeter proved that friezes of width *n* − 3
   correspond bijectively to triangulations of a convex *n*-gon, the first row being the
   number of triangles at each vertex. The unimodular rule is exactly an SL₂ relation,
   which is why the entries are the continuant / Markov-style solutions of a Diophantine system.
   *Interaction:* drag diagonals to retriangulate the polygon and watch the frieze recompute
   entry by entry, with the diamond rule verified in exact integers and a flip animation
   showing the mutation; a glide-symmetry toggle exhibits the period 2n.
   *Site tie:* the Markov starscape and continued-fraction threads — friezes are the
   combinatorial shadow of the same SL₂(ℤ) unimodularity.

6. **Dehn Twists and the Mapping Class Group of the Torus** — low-dimensional topology · linear groups over ℤ.
   Mod(T²) ≅ SL₂(ℤ), with the twists about the meridian and longitude going to the
   elementary matrices [[1,1],[0,1]] and [[1,0],[1,1]]; an essential simple closed curve is
   determined by its slope *p*/*q* ∈ ℚ ∪ {∞}, and Nielsen–Thurston type is read off the
   trace: |tr| < 2 periodic, |tr| = 2 reducible, |tr| > 2 Anosov with expansion factor
   (|tr| + √(tr²−4))/2.
   *Interaction:* click twist buttons to build a word, watch the curve on the flat torus deform
   under each twist while its slope updates as an exact fraction; a trace readout gives the
   live Nielsen–Thurston verdict and, for Anosov maps, draws the stable/unstable foliations.
   *Site tie:* the modular-surface and cutting-sequence material, and the linear-groups-over-ℤ
   thread — this is the topological face of SL₂(ℤ).

7. **Hyperbolic Dehn Surgery on the Figure-Eight Knot** — 3-manifolds · Kleinian groups.
   Thurston's hyperbolic Dehn surgery theorem: all but finitely many fillings of the
   figure-eight knot complement are hyperbolic, and the gluing/completeness equations of its
   two ideal tetrahedra deform in a one-complex-dimensional family, the shape z of a
   tetrahedron moving off the regular value z = e^{iπ/3} as the cone angle changes; volume
   is maximal exactly at the complete structure (Milnor's Lobachevsky function).
   *Interaction:* drag the surgery coefficient (p, q) on a grid and watch Newton's method
   solve the gluing equations live, with the two tetrahedron shapes plotted in the upper
   half-plane, the volume 2Λ(π/3)-decreasing readout, and a flag when a shape degenerates.
   *Site tie:* the Kleinian-groups section, GPS manifolds, and the knot-theory pages.

8. **Continued Fractions and the Modular Flow** — number theory · dynamics.
   The Gauss map x ↦ {1/x} is the cross-section of the geodesic flow on the modular surface:
   the continued-fraction digits of a real number are the cutting sequence of the
   corresponding geodesic, and x is badly approximable (bounded digits) exactly when its
   geodesic stays in a compact part of ℍ/SL₂(ℤ) — Hurwitz's constant 1/√5 being realised by
   the golden ratio's all-ones expansion.
   *Interaction:* drag a real number on a line, watch its continued fraction unfold digit by
   digit while the geodesic is traced on the modular surface and the Stern–Brocot path is
   highlighted; a "badly approximable" gauge tracks max digit and the Markov value.
   *Site tie:* the Markov starscape and cutting-sequences pages — this is their shared engine.
