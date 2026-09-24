// AutoViz manifest — newest first. The daily run PREPENDS exactly one entry.
// Fields: date (YYYY-MM-DD), file (relative to days/), title, area, blurb.
window.AUTOVIZ = [
  {
    date: "2026-09-24",
    file: "2026-09-24-frieze-patterns.html",
    title: "Conway–Coxeter Frieze Patterns",
    area: "Combinatorics · cluster algebras",
    blurb: "Positive-integer friezes bounded by rows of 1s in which every diamond satisfies ad − bc = 1 are in bijection with triangulations of a convex n-gon (Conway–Coxeter): the quiddity row counts triangles at each vertex, each entry is the Ptolemy length of a chord, the interior 1s are exactly the diagonals, and the pattern has a glide symmetry of period n. Click diagonals to flip them — a cluster mutation — or let a random walk on the flip graph run, and watch the frieze recompute in exact integers; a brute-force search over quiddity cycles recovers the Catalan counts Cₙ₋₂ up to n = 9."
  },
  {
    date: "2026-09-03",
    file: "2026-09-03-rauzy-fractal.html",
    title: "The Rauzy Fractal of the Tribonacci Substitution",
    area: "Tilings · symbolic dynamics",
    blurb: "The substitution a→ab, b→ac, c→a has Perron root the Tribonacci constant β = 1.8392867552…, a Pisot number whose conjugates have modulus β^(−1/2). Draw the fixed point as a staircase in ℤ³ and project along the expanding eigendirection: the vertices stay bounded and fill Rauzy's fractal, split into three subtiles by the following letter. Watch it assemble iteration by iteration, tile the plane by the lattice Γ = φ(ker Σ), and follow a point under the exchange of the three subtiles — which is exactly the shift on the Tribonacci word, and on ℂ/Γ exactly translation by (1−1/β, 1/β³)."
  },
  {
    date: "2026-08-31",
    file: "2026-08-31-kesten-amenability.html",
    title: "Kesten's Criterion: Random Walks and Amenability",
    area: "Probability · geometric group theory",
    blurb: "The even return probabilities of the simple random walk are supermultiplicative, so p₂ₙ(e)^{1/2n} increases to the ℓ²-norm ρ of the Markov operator — and Kesten's theorem says ρ = 1 exactly when the group is amenable. Five Cayley graphs side by side with live walker clouds: ℤ, ℤ², and the Heisenberg group creep toward 1 while F₂ stalls at √3/2 and ℤ₂∗ℤ₂∗ℤ₂ at 2√2/3, the tree value 2√(d−1)/d. Loop counts are exact (BigInt binomials, a transfer recursion on the tree, a pruned integer DP on H₃(ℤ)) and checked against brute-force enumeration of all dᵐ words."
  },
  {
    date: "2026-08-23",
    file: "2026-08-23-alexander-from-braids.html",
    title: "Alexander Polynomials from Braid Closures",
    area: "Knots and braids · linear groups over ℤ[t,t⁻¹]",
    blurb: "The reduced Burau representation sends a braid to a matrix over ℤ[t,t⁻¹], and the Burau–Alexander theorem reads the Alexander polynomial of its closure off it: Δ(t) ≐ det(I − β̄(β))·(1−t)/(1−tⁿ). Build braid words by hand, watch the closure and its components flow, and check the theorem live — the exact division by 1+t+⋯+tⁿ⁻¹, det β̄ = (−t)^{e(β)}, the palindromic symmetry Δ(t) ≐ Δ(1/t), and Markov's conjugation and stabilisation moves leaving Δ untouched."
  },
  {
    date: "2026-08-20",
    file: "2026-08-20-lagrange-gauss-reduction.html",
    title: "Lagrange–Gauss Lattice Reduction",
    area: "Lattices · linear groups over ℤ",
    blurb: "Euclid's algorithm in two dimensions: swap so ‖b₁‖ ≤ ‖b₂‖, subtract the nearest multiple, repeat. The output realises the successive minima λ₁, λ₂, every step is an elementary matrix so the run factors the change of basis into S and T in SL₂(ℤ), and for τ = b₂/b₁ the two reduction inequalities are exactly |τ| ≥ 1 and |Re τ| ≤ ½ — the descent into the fundamental domain on ℍ, with λ₁²/covol = 1/Im τ ≤ 2/√3, Hermite's constant."
  },
  {
    date: "2026-08-19",
    file: "2026-08-19-bruhat-tits-tree.html",
    title: "The Bruhat\u2013Tits Tree for SL\u2082(\u211a_p)",
    area: "p-adic groups \u00b7 geometric group theory",
    blurb: "Homothety classes of \u2124_p-lattices in \u211a_p\u00b2 are the vertices of the (p+1)-regular tree on which SL\u2082(\u211a_p) acts. Every vertex here is an exact integer matrix, shaded by its displacement d(v, gv); the minimum is the translation length \u2113(g) = |v_p(\u03bb\u2081) \u2212 v_p(\u03bb\u2082)| from the Newton polygon, so g fixes a subtree exactly when tr g \u2208 \u2124_p and otherwise marches along an axis by \u22122v_p(tr g)."
  },
  {
    date: "2026-08-17",
    file: "2026-08-17-four-square-quaternions.html",
    title: "Jacobi's Four-Square Theorem, Quaternionically",
    area: "Arithmetic \u00b7 quaternion algebras",
    blurb: "The r\u2084(n) = 8\u00b7\u03a3(divisors of n not divisible by 4) representations of n as a sum of four squares are exactly the Lipschitz quaternions of norm n, and the 8 is the order of the unit group acting freely on them. Sweep n, watch the sphere of norm-n quaternions turn under the Hopf flow, and check the count against the divisor sum."
  },
  {
    date: "2026-08-13",
    file: "2026-08-13-unfolding-billiards.html",
    title: "Unfolding Billiards in Polygons",
    area: "Dynamics \u00b7 translation surfaces",
    blurb: "Reflect the table instead of the ball and a billiard trajectory straightens into a line. For a kaleidoscopic polygon the Katok\u2013Zemlyakov unfolding turns the flow into linear flow on the torus \u211d\u00b2/L, so an orbit closes exactly when its direction is parallel to a lattice vector \u2014 the square's slope-p/q rule, with period 2\u221a(p\u00b2+q\u00b2), checked live against the simulated orbit."
  },
  {
    date: "2026-08-13",
    file: "2026-08-13-heisenberg-growth.html",
    title: "Polynomial Growth of the Heisenberg Group",
    area: "Geometric group theory",
    blurb: "Balls in the integer Heisenberg group grow like R\u2074, not R\u00b3: Bass\u2013Guivarc'h reads the degree off the lower central series, and the commutator direction costs quadratically because a word's z-coordinate is the area its projection sweeps. Breadth-first search both Cayley graphs and watch the log\u2013log slopes separate."
  },
  {
    date: "2026-08-11",
    file: "2026-08-11-triangle-group-kaleidoscopes.html",
    title: "Triangle-Group Kaleidoscopes",
    area: "Coxeter groups · hyperbolic geometry",
    blurb: "Reflections in a triangle with angles π/p, π/q, π/r tile the sphere, the plane, or the hyperbolic plane according to the sign of 1/p + 1/q + 1/r − 1. Dial the three integers, watch the ball in the Cayley graph cascade outward, and click any tile to read its word in the mirrors."
  },
  {
    date: "2026-08-10",
    file: "2026-08-10-schottky-limit-sets.html",
    title: "Schottky Groups and Their Limit Sets",
    area: "Kleinian groups · fractal geometry",
    blurb: "Pair two disjoint pairs of circles by Möbius maps and ping-pong certifies ⟨A,B⟩ is discrete and free of rank two; its limit set is a Cantor dust whose dimension you can watch move as you drag the circles."
  },
  {
    date: "2026-08-09",
    file: "2026-08-09-apollonian-gasket.html",
    title: "The Apollonian Gasket",
    area: "Hyperbolic geometry · number theory",
    blurb: "Descartes' circle theorem lets three mutually tangent circles determine a fourth — iterated forever, it fills the disk with an infinite packing in which every circle has integer curvature."
  },
  {
    date: "2026-08-08",
    file: "2026-08-08-rational-tangles.html",
    title: "Conway's Rational Tangles",
    area: "Knot theory",
    blurb: "Twist and rotate two strands to build any rational tangle; Conway's theorem says the resulting fraction in ℚ ∪ {∞} is a complete isotopy invariant. Build tangles and chase a target fraction."
  },
  {
    date: "2026-08-07",
    file: "2026-08-07-hopf-fibration.html",
    title: "The Hopf Fibration",
    area: "Topology",
    blurb: "S³ fibers over S² in circles, any two of them linked — the first homotopically nontrivial map between spheres of different dimensions. Sweep a latitude of base points and watch the fibers foliate tori."
  },
  {
    date: "2026-08-06",
    file: "2026-08-06-sandpile-identity.html",
    title: "The Abelian Sandpile Identity",
    area: "Combinatorics · dynamics",
    blurb: "Recurrent sandpiles on a grid form a finite abelian group, and its identity element is a fractal. Drop grains, trigger avalanches, and compute the identity live."
  },
  {
    date: "2026-08-05",
    file: "2026-08-05-cutting-sequences.html",
    title: "Cutting Sequences on the Modular Surface",
    area: "Number theory · dynamics",
    blurb: "Series' theorem: a geodesic crossing the Farey tessellation transcribes the continued fraction of its endpoint as a sequence of lefts and rights. Ride the descent and read off the digits."
  },
  {
    date: "2026-08-04",
    file: "2026-08-04-ping-pong-free-groups.html",
    title: "Ping-Pong and Free Groups",
    area: "Group theory · hyperbolic geometry",
    blurb: "Sanov's ping-pong certificate for freeness of ⟨[[1,t],[0,1]], [[1,0],[t,1]]⟩ works exactly when |t| ≥ 2 — watch the intervals on the circle at infinity collide as t shrinks."
  }
];
