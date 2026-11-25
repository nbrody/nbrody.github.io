# Daily Math — Plate Queue

Maintained by each daily run: build the TOP entry, remove it from this list, and keep **at least 6** entries below. Alternate `defaultTheme` (`light` Parchment vs `dark` Obsidian) and vary `form` (`2D`, `panes+plot`, `3D`, `webgl2`) on consecutive days. Avoid duplicating plates already in `manifest.js` or tools in `docs/autoVisualization/`.

**Editorial focus**: Concentrate ~2/3 of the queue on **geometric group theory, hyperbolic geometry, and low-dimensional topology** (discrete linear groups, Fuchsian/Kleinian groups, 3-manifolds, knots, surfaces, mapping class groups, arithmetic groups, and hyperbolic tilings), balanced with ~1/3 **broader mathematics** (number theory, linear algebra, dynamics, differential geometry, combinatorics).

---

## Dehn Surgery on the Figure-Eight Knot
- topics: topology, hyperbolic · form: panes (surgery grid | complex shape plane) · theme: light · modules: `draw`, `math-complex`, `plot`, `tex`
- idea: almost every $(p, q)$ Dehn filling of the figure-eight knot complement admits a hyperbolic metric whose volume climbs monotonically toward the complete structure's $2.0298832\ldots$
- gesture: tap any coprime slope $(p, q)$ on the surgery lattice to solve Thurston's gluing equations live.
- aha: the two ideal tetrahedron shapes $(z, w)$ slide off $e^{i\pi/3}$ as Newton's method solves the completeness equation, degenerating precisely on the ten exceptional non-hyperbolic slopes.
- live check: Thurston gluing residual $< 10^{-12}$ and $\mathrm{Vol}(M_{p,q}) \le 2 V_3$ (`DM.check`).
- tour: complete structure at $z = w = e^{i\pi/3}$ -> tap $(5,1)$ hyperbolic filling -> tap an exceptional slope $(4,1)$ to watch tetrahedra flatten -> compare volumes across the lattice.
- math: William Thurston (1978); all but finitely many Dehn fillings of a cusped hyperbolic 3-manifold are hyperbolic, with strictly smaller volume; for the figure-eight knot the ten exceptional slopes are $0, \pm 1, \pm 2, \pm 3, \pm 4, \infty$.

## The Farey Graph & Curve Complex
- topics: topology, groups · form: 2D Poincaré disk tessellation · theme: dark · modules: `draw`, `math-exact`, `math-complex`, `tex`
- idea: the curve complex of the once-punctured torus is the Farey graph — two slopes $p/q, r/s \in \mathbb{Q} \cup \{\infty\}$ share an edge iff $|ps - qr| = 1$.
- gesture: tap two rational slopes on $\partial\mathbb{D}$ to highlight the shortest geodesic path in the curve complex.
- aha: $\mathrm{SL}_2(\mathbb{Z})$ acts by hyperbolic isometries preserving every Farey triangle, and the combinatorial distance between two curves is read directly from their continued-fraction fan.
- live check: unimodular determinant $|ps - qr| = 1$ along every edge of the geodesic (`DM.check`).
- tour: standard triangle $\{0/1, 1/0, 1/1\}$ -> subdivide by mediants $(p+r)/(q+s)$ -> pick two slopes to trace a curve-complex geodesic -> apply $T$ and $S$ generators of $\mathrm{SL}_2(\mathbb{Z})$.
- math: William Harvey (1981) and Howard Masur–Yair Minsky (1999); the curve complex $\mathcal{C}(S_{1,1})$ is $\delta$-hyperbolic and isomorphic to the Farey tessellation of $\mathbb{H}^2$.

## Laminations on the Punctured Torus
- topics: topology, linear · form: panes ($\mathcal{ML}$ slope plane | punctured torus) · theme: light · modules: `draw`, `math-exact`, `math-linalg`, `tex`
- idea: measured laminations on the once-punctured torus are rays in $(\mathbb{R}^2 \setminus 0)/\pm 1$, and $\mathrm{SL}_2(\mathbb{Z})$ acts on them linearly.
- gesture: drag a vector in the lamination plane to watch the weighted train track and foliation update on the torus.
- aha: rational rays are simple closed curves, irrational rays fill the surface densely, and iterating a hyperbolic matrix $A \in \mathrm{SL}_2(\mathbb{Z})$ drives every curve onto its unstable eigen-foliation.
- live check: geometric intersection number $i(\lambda, \mu) = |\det(\lambda, \mu)|$ (`DM.check`).
- tour: simple curve $(1, 0)$ -> slope $2/3$ curve -> irrational ray filling the torus -> iterate the Arnold cat map $\begin{psmallmatrix}2&1\\1&1\end{psmallmatrix}$ toward its unstable lamination.
- math: William Thurston (1976); projective measured laminations $\mathcal{PML}(S_{1,1}) \cong S^1 = \partial\mathbb{H}^2$ compactify Teichmüller space, with pseudo-Anosov maps fixing a north–south pair of quadratic irrational foliations.

## The Riley Slice & Parabolic Commutators
- topics: hyperbolic, groups · form: WebGL2 complex parameter plane + limit set inset · theme: dark · modules: `gl`, `math-complex`, `tex`
- idea: the Riley slice is the exterior of a fractal-bounded region in $\mathbb{C}$ where two parabolic Möbius maps $A = \begin{psmallmatrix}1&1\\0&1\end{psmallmatrix}$ and $B_\mu = \begin{psmallmatrix}1&0\\\mu&1\end{psmallmatrix}$ generate a discrete free group.
- gesture: drag $\mu \in \mathbb{C}$ across the Riley boundary to watch the Kleinian limit set pinch along a cusp ray.
- aha: every rational slope $p/q$ indexes a Keen–Series pleating ray landing at a parabolic cusp on the boundary where the corresponding word becomes accidentally parabolic.
- live check: trace polynomial $P_{p/q}(\mu) = \pm 2$ on boundary cusps and Jørgensen's inequality $|\operatorname{tr}^2(A)-4| + |\operatorname{tr}(ABA^{-1}B^{-1})-2| \ge 1$ (`DM.check`).
- tour: Schottky-like exterior at $|\mu| > 4$ -> slide $\mu$ toward the real cusp $\mu = -4$ -> follow a rational pleating ray -> cross inside where discreteness fails.
- math: Robert Riley (1972) and Linda Keen–Caroline Series (1994); the Riley slice parametrizes faithful discrete representations of the two-bridge link group complement with parabolic generators.

## Gershgorin's Circle Theorem
- topics: linear, geometry · form: panes (complex eigenvalue plane | coupling plot) · theme: light · modules: `draw`, `math-linalg`, `math-complex`, `tex`
- idea: every eigenvalue of an $n\times n$ matrix $A$ must lie inside the union of $n$ disks centered at its diagonal entries with radii equal to the off-diagonal row sums.
- gesture: drag the off-diagonal coupling scale $\varepsilon \in [0, 1.5]$.
- aha: as $\varepsilon \to 0$, each Gershgorin disk shrinks smoothly onto its diagonal entry; when a disk isolates itself from the others, it captures exactly one eigenvalue by continuity.
- live check: $\forall \lambda \in \sigma(A),\ \min_i |\lambda - a_{ii}| / R_i \le 1$ (`DM.check`).
- tour: decoupled diagonal matrix ($\varepsilon = 0$) -> grow off-diagonal coupling -> watch disconnected islands trap one eigenvalue each -> merge disks so eigenvalues cross components.
- math: Semyon Aranovich Gershgorin (1931); if a union of $k$ Gershgorin disks is disjoint from the remaining $n - k$ disks, continuity of eigenvalues implies it contains precisely $k$ eigenvalues counted with multiplicity.

## Fox p-Coloring & Knot Determinant
- topics: topology, combinatorics · form: 2D interactive knot diagram · theme: dark · modules: `draw`, `math-linalg`, `math-exact`, `tex`
- idea: assigning colors in $\mathbb{Z}/p\mathbb{Z}$ to arcs of a knot diagram so that $2a \equiv b + c \pmod p$ at every crossing yields a topological invariant whose nontriviality is controlled by $\det(K)$.
- gesture: switch between trefoil, figure-eight, cinquefoil, and $6_1$ knots or tap arcs to solve the coloring system mod $p$.
- aha: applying a Reidemeister move preserves the exact number of valid $p$-colorings; nontrivial colorings appear if and only if $p \mid \det(K)$.
- live check: crossing relation $2a - b - c \equiv 0 \pmod p$ at every crossing and $p \mid \det(K)$ (`DM.check`).
- tour: trefoil knot 3-colored mod $3$ -> try mod $5$ (only trivial) -> switch to figure-eight ($\det = 5$) -> verify invariance under a Reidemeister move.
- math: Ralph Fox (1961); the space of Fox $p$-colorings is isomorphic to $\mathrm{Hom}(\pi_1(S^3 \setminus K), D_{2p})$ and has dimension determined by the rank of the Alexander–Fox coloring matrix over $\mathbb{F}_p$.

## Markov Triples & the Cohn Tree
- topics: numbers, hyperbolic · form: panes (Markov binary tree | punctured torus traces) · theme: light · modules: `draw`, `math-exact`, `tex`
- idea: positive integer solutions to $x^2 + y^2 + z^2 = 3xyz$ form an infinite binary tree generated by Vieta jumping, matching the traces of simple closed geodesics on the modular punctured torus.
- gesture: tap any node of the Markov tree to branch via $(x, y, z) \mapsto (x, y, 3xy - z)$ and inspect its $\mathrm{SL}_2(\mathbb{Z})$ matrix.
- aha: Fricke's trace identity $\operatorname{tr}(A)^2 + \operatorname{tr}(B)^2 + \operatorname{tr}(AB)^2 = \operatorname{tr}(A)\operatorname{tr}(B)\operatorname{tr}(AB)$ turns the Diophantine equation into hyperbolic geometry on $S_{1,1}$.
- live check: exact BigInt identity $x^2 + y^2 + z^2 = 3xyz$ and $\operatorname{tr}(A)/3 = x$ (`DM.check`).
- tour: root triple $(1, 1, 1)$ -> branch to $(1, 2, 5)$ and $(2, 5, 29)$ -> inspect the Fibonacci and Pell spines -> link each triple to its hyperbolic geodesic length $2\operatorname{acosh}(3x/2)$.
- math: Andrey Markov (1879) and Harvey Cohn (1955); Markov numbers govern Lagrange's Diophantine approximation spectrum below $3$ and arise as one-third traces of primitive elements of the modular torus group.

## Gauss–Bonnet Curvature of a Torus
- topics: geometry, topology · form: 3D orbit surface · theme: dark · modules: `space3d`, `draw`, `tex`
- idea: on any torus of revolution, positive outer Gaussian curvature and negative inner saddle curvature cancel to zero identically, independent of shape or thickness.
- gesture: drag to orbit in 3D or slide the aspect ratio $r/R$ and vertical pinch deformation.
- aha: flattening or pinching the torus redistributes positive and negative curvature dramatically, yet the integrated positive outer cap always equals $+4\pi$ and the inner saddle $-4\pi$.
- live check: $\iint_{T^2} K\,dA = 2\pi\chi(T^2) = 0$ computed numerically across the mesh (`DM.check`).
- tour: standard torus colored by $K > 0$ outer vs $K < 0$ inner -> orbit to inspect the parabolic rings $K = 0$ -> thicken $r/R$ -> deform profile and watch $+4\pi$ and $-4\pi$ still cancel.
- math: Carl Friedrich Gauss (1827) and Pierre Ossian Bonnet (1848); for any closed orientable surface $M$, $\iint_M K\,dA = 2\pi\chi(M)$, so every embedded torus integrates to $0$.

## The Perron–Frobenius Eigenmode
- topics: linear, dynamics · form: panes (Markov chain graph | probability simplex) · theme: light · modules: `draw`, `math-linalg`, `tex`
- idea: repeated multiplication by a positive transition matrix contracts every probability distribution exponentially onto a unique positive eigenvector with eigenvalue $1$.
- gesture: drag the starting probability vector inside the $3$-state simplex triangle.
- aha: a cloud of initial states across the entire triangle collapses along the subdominant eigen-directions onto a single glowing stationary point $\pi$.
- live check: $\pi P = \pi$ residual $< 10^{-12}$ and contraction ratio $|\lambda_2| < 1$ (`DM.check`).
- tour: scatter 12 states across the probability triangle -> iterate $P^k$ step by step -> inspect spectral gap $|\lambda_2|$ -> tune transition edge toward near-reducible slowdown.
- math: Oskar Perron (1907) and Georg Frobenius (1912); an irreducible aperiodic stochastic matrix has simple leading eigenvalue $\lambda_1 = 1$, strictly positive stationary distribution $\pi$, and $|\lambda_k| < 1$ for all $k \ge 2$.
