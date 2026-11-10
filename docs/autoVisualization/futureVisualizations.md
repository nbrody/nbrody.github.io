# Future visualizations — the queue

Maintained by the daily AutoViz run: build the TOP entry, delete it, and keep **at least 5**
entries below, in priority order. Consecutive entries should differ in topic *and* in form
(single stage, panes + chart, 3D, shader). Root ideas in the site's world (see HARNESS.md,
"Inspiration"); never queue something an existing site tool already does.

Every entry has the same shape — if a field is hard to fill, the idea is not ready:

```
## Title (≤ 7 words)
- topics: ids from AUTOVIZ_TOPICS · form: stage/panes/3D/shader + kit modules
- idea: the one phenomenon, one sentence
- gesture: the single direct interaction
- aha: what the user sees happen that makes the theorem click
- live check: the readout identity with ✓/✗
- tour: 3–5 beats (see → do → surprise → why)
- math: the exact theorem for the ⓘ sheet, with names
- site tie: which existing page/tool it complements
```

---

## Laminations on the Punctured Torus
- topics: topology, linear · form: panes (ML plane | torus picture); `exact`, `linalg`
- idea: measured laminations on the punctured torus are points of (ℝ² ∖ 0)/±1, and SL₂(ℤ) acts on them linearly.
- gesture: drag a point in the lamination plane; the torus shows the weighted train track.
- aha: rational rays are simple closed curves, irrational rays fill the surface densely, and an Anosov map pushes everything onto its unstable ray.
- live check: intersection i(λ, μ) = |det(λ, μ)| ✓ for the two drawn laminations.
- tour: the curve (1,0) → a slope-2/3 curve → an irrational ray, dense → apply the cat map repeatedly: convergence to the unstable direction.
- math: Thurston; for the once-punctured torus PML = S¹ = ∂ℍ with Mod = SL₂(ℤ) acting projectively; invariant laminations of Anosov maps are quadratic irrationals.
- site tie: continues the 2026-09-25 Dehn-twist page; the boundary the Riley slice's cusp rays are indexed by.

## The Three-Gap Theorem
- topics: numbers, dynamics · form: single 2D stage (a circle of points + a strip of gap lengths); `exact`, `tex`
- idea: the points 0, α, 2α, …, (N − 1)α on a circle cut it into gaps of at most three different lengths, whatever α and N are.
- gesture: drag α around the circle; one slider for N.
- aha: the gaps recolor constantly but never show a fourth length, and when there are three the longest is exactly the sum of the other two; at the denominators of the convergents of α only two lengths remain.
- live check: number of distinct gap lengths ≤ 3 ✓ and longest = sum of the other two ✓ (exact, for rational α with BigInt).
- tour: N = 5, three lengths → slide N: still three → N = a convergent denominator: two lengths → α = golden mean: the gaps are always in golden ratio.
- math: Steinhaus's conjecture, proved by Sós 1957, Świerczkowski 1958 and Surányi 1958; the lengths are ‖q_nα‖-type quantities read off the continued fraction of α.
- site tie: the cutting-sequence and Euclid pages: continued fractions seen as a rotation.

## Dehn Surgery on the Figure-Eight Knot
- topics: topology, hyperbolic · form: panes (surgery grid | shape plane); `complex`, `plot`
- idea: almost every Dehn filling of the figure-eight knot complement is hyperbolic, with volume increasing to the complete structure's 2.0298…
- gesture: tap a point (p, q) on the surgery grid.
- aha: the two tetrahedron shapes slide off e^{iπ/3} as Newton solves the gluing equations, and the ten exceptional slopes are exactly where a shape degenerates.
- live check: gluing equations satisfied (residual < 1e-12) ✓; volume ≤ 2.0298832 ✓.
- tour: the complete structure → (5,1) filling → approach an exceptional slope: degeneration → volumes over the grid.
- math: Thurston's hyperbolic Dehn surgery theorem; the figure-eight's exceptional slopes are 0, ±1, ±2, ±3, ±4, ∞.
- site tie: the Kleinian-groups section and the knot pages.

## Hurwitz's Complex Continued Fractions
- topics: numbers, dynamics · form: single 2D stage (Gaussian integer grid + orbit) ; `complex`, `exact`, `tex`
- idea: rounding to the nearest Gaussian integer and inverting expands every complex number as a continued fraction, and the tails fill a square with an invariant density.
- gesture: drag the point z; its convergents p_n/q_n hop toward it.
- aha: the convergents land on z at a geometric rate for almost every z, the expansion stops exactly on ℚ(i), and the orbit of the Gauss map paints a fractal-edged invariant measure.
- live check: |z − p_n/q_n| < 1/|q_n|² ✓ and |q_n| strictly increasing ✓ (exact Gaussian arithmetic).
- tour: z = (1 + 5i)/12: the expansion stops → an irrational z: convergents spiral in → 20 000 iterates of the Gauss map: the invariant density → quadratic irrationals are periodic.
- math: A. Hurwitz 1887 (nearest-integer complex continued fractions); |q_n| increases and convergence is geometric; Lagrange-type theorem for quadratic irrationals over ℚ(i).
- site tie: the 2026-11-09 Euclid page — its marble is one step of this map, here iterated forever.

## The Volume of an Ideal Tetrahedron
- topics: hyperbolic, topology · form: shader stage (the shape plane) + overlay tetrahedron; `gl`, `complex`, `tex`
- idea: an ideal hyperbolic tetrahedron is one complex number z, and its volume is the Bloch–Wigner dilogarithm D(z).
- gesture: drag the shape parameter z in the upper half-plane.
- aha: the volume landscape has a single peak, at the regular tetrahedron z = e^{iπ/3}, and the six shapes z, 1/(1 − z), 1 − 1/z and their mirror images all carry the same volume up to sign.
- live check: D(z) = Λ(α) + Λ(β) + Λ(γ) for the three dihedral angles ✓ (two independent series) and D(z) ≤ 1.0149416… ✓.
- tour: a thin tetrahedron, small volume → drag toward the peak → the regular one: 1.01494 → two of them make the figure-eight knot complement: 2.02988.
- math: Lobachevsky; Milnor 1982 (volume = sum of Lobachevsky functions of the dihedral angles); Bloch–Wigner D(z) = Im Li₂(z) + arg(1 − z) log|z|; the regular ideal tetrahedron is the unique maximum.
- site tie: the Kleinian section and the knot pages; pairs with the Dehn surgery entry below.
