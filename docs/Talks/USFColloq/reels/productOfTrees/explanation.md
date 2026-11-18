## A product of trees

**Entry notes.** Interactive · desktop and mobile · tap to interact on mobile (click on desktop).
Tags: Geometric group theory, Geometry.
Palette: first tree `#38bdf8` (blue), second tree `#d38ae7` (violet), squares `#818cf8`, flat `#fbbf24` (gold), background `#060a14`, text `#eef1f8` (dark);
light theme first tree `#0284c7`, second tree `#a347c6`, squares `#5f67cf`, flat `#d97706`, background `#ffffff`, text `#16181e`.
Feed mode has no text. Esc (or ✕) returns from interact mode to the feed. `?embed=true` hides all chrome,
`?mode=interact` opens engaged, `?theme=light|dark` overrides the system setting, `?t=` starts the feed loop at a given second,
`?m=`, `?n=` (3–5) pick the two trees and `?r=` (1–4) the radius.

### What you're seeing
Two trees: in the blue one, *T*₃, every vertex has 3 edges; in the violet one, *T*₄, every vertex has 4. Their **product** *T*₃ × *T*₄ has a vertex (*u*, *v*) for every pair of vertices, an edge whenever one coordinate moves along an edge while the other stays put, and a square *e* × *f* for every pair of edges. Each vertex has 3 + 4 = 7 edges and 3 · 4 = 12 squares around it.

The feed builds it by sliding. The two trees grow out of a white vertex, the "coordinate axes" of the product. Then copies of the blue tree slide out along every violet edge, splitting at each violet vertex, and every blue edge sweeps out a square. What is drawn is the ball of radius 3 around the white vertex in the product's own graph metric, |*u*| + |*v*| ≤ 3, so the two axes reach out the furthest and the copies shrink as they go.

Next the whole complex turns about the white vertex: a third of a turn in the blue tree and a quarter turn in the violet tree at the same time. Each tree is drawn in its own plane, so the product lives in ℝ² × ℝ² = ℝ⁴ and the picture is its shadow in ℝ³; the turn is a rotation of ℝ⁴ that happens to be a symmetry of the product, and it ends on exactly the picture it started from.

Then a line lights up gold in each tree, and both trees straighten along their lines. The product of two lines is a **flat**: a copy of the Euclidean plane tiled by squares, here the gold floor. Every other line of squares in the floor has more flats branching off it, the walls leaning up and down. Sliding one tree one step along its line (and then both at once, diagonally) moves the whole complex along the floor and lands on the same picture again: these are translations of the plane, and of the product.

Around each vertex the squares meet a small sphere in the complete bipartite graph *K*₃,₄, the **link** of the vertex. Its shortest cycles have length 4, which is exactly Gromov's condition for a square complex to have no positive curvature: the product of two trees is CAT(0), and between any two of its points there is a unique straight path. Flats are everywhere and branch everywhere, making it a two-dimensional **Euclidean building**.

The tree *T*_{p+1} is the Bruhat–Tits tree of SL₂(ℚ_p), so SL₂(ℚ₂) × SL₂(ℚ₃) acts on *T*₃ × *T*₄. Groups acting on products of trees with compact quotient include arithmetic groups built from quaternions (for odd primes *p* ≠ *q*, a lattice acting simply transitively on the vertices of *T*_{p+1} × *T*_{q+1}) and the finitely presented simple groups of Burger and Mozes; Wise found such a group that is not residually finite.

### Try this
- **Slide along the gold flat**: *g* moves the blue tree one step along its gold line, *h* the violet one, *gh* both at once. The trees straighten first if they need to.
- **Turn about the white vertex**: *r* turns the blue tree a third of a turn about the white vertex, *s* the violet tree a quarter turn. The gold flat moves to another flat; the trees round up first if they need to.
- Turn on **The link of the white vertex** to zoom in on the sphere and its *K*₃,₄; turning *r* or *s* then permutes its blue or violet points.
- Change the trees (3, 4 or 5 edges at a vertex) and the radius; the link is always *K*_{m,n}.
- Drag to look around; **Round / Straight** switches between the Cayley-graph picture of each tree and the picture drawn along its gold line.

**References.** M. Burger and S. Mozes, "Lattices in product of trees", *Publ. Math. IHÉS* 92 (2000), 151–194. D. T. Wise, "Complete square complexes", *Comment. Math. Helv.* 82 (2007), 683–724. J.-P. Serre, *Trees*, Springer (1980). M. R. Bridson and A. Haefliger, *Metric Spaces of Non-Positive Curvature*, Springer (1999), §II.5.
