# Daily Math — Plate Queue

Maintained by each daily run: build the TOP entry, remove it from this list, and keep **at least 6** entries below. Alternate `defaultTheme` (`light` Parchment vs `dark` Obsidian) and vary `form` (`2D`, `panes+plot`, `3D`, `webgl2`) on consecutive days. Avoid duplicating plates already in `manifest.js` or tools in `docs/autoVisualization/`.

---

## Confocal Caustics of an Ellipse
- topics: geometry, dynamics · form: 2D stage · theme: light · modules: `draw`, `tex`
- idea: billiard trajectories inside an ellipse preserve a second conserved quantity and remain tangent to a single confocal conic — either a smaller ellipse or a hyperbola.
- gesture: drag the initial ray angle from a boundary point or drag eccentricity $e$.
- aha: crossing the focal line between the two foci switches the caustic catastrophically from a closed confocal ellipse to two branches of a confocal hyperbola.
- live check: Joachimsthal integral $\frac{\langle p, v\rangle_A}{|p|_A}$ and confocal parameter $\lambda$ preserved across all bounces (`DM.check`).
- tour: ray grazing an inner confocal ellipse -> aim between the foci to flip to a hyperbola -> launch through a focus to collapse onto the major axis -> eccentric limit.
- math: Birkhoff billiard integrability and Chasles's theorem; every tangent to a fixed confocal conic reflects across the ellipse normal into another tangent to the exact same confocal conic.

## The Klein Quartic & {3, 7} Tiling
- topics: hyperbolic, symmetry · form: WebGL2 Poincaré disk + overlay · theme: dark · modules: `gl`, `math-complex`, `tex`
- idea: gluing fourteen hyperbolic heptagons in the Poincaré disk creates the Klein quartic — a genus-3 surface saturating Hurwitz's maximum symmetry bound of $168 = 84(g-1)$ automorphisms.
- gesture: drag a base vertex or tap any generator to see the heptagonal reflections tile $\mathbb{D}$.
- aha: seven equilateral triangles meet at every vertex ($7 \cdot \pi/3 > 2\pi$), curving the surface negatively so $24$ heptagons fold into a closed surface of genus $3$.
- live check: vertex angle sum $\frac{2\pi}{3} \cdot \frac{3}{7}$ deficit and Euler characteristic $\chi = V - E + F = -4 = 2 - 2(3)$ (`DM.check`).
- tour: fundamental 14-gon in $\mathbb{D}$ -> zoom out along the $\{3,7\}$ hyperbolic tiling -> highlight paired boundary edges -> count $24$ heptagons giving $168$ symmetries.
- math: Felix Klein (1879) and Adolf Hurwitz (1893); no Riemann surface of genus $g \ge 2$ admits more than $84(g-1)$ conformal automorphisms, and the Klein quartic $x^3y + y^3z + z^3x = 0$ attains $168$ at $g=3$.

## Gershgorin's Circle Theorem
- topics: linear, geometry · form: panes (complex eigenvalue plane | coupling plot) · theme: light · modules: `draw`, `math-linalg`, `math-complex`, `tex`
- idea: every eigenvalue of an $n\times n$ matrix $A$ must lie inside the union of $n$ disks centered at its diagonal entries with radii equal to the off-diagonal row sums.
- gesture: drag the off-diagonal coupling scale $\varepsilon \in [0, 1.5]$.
- aha: as $\varepsilon \to 0$, each Gershgorin disk shrinks smoothly onto its diagonal entry; when a disk isolates itself from the others, it captures exactly one eigenvalue by continuity.
- live check: $\forall \lambda \in \sigma(A),\ \min_i |\lambda - a_{ii}| / R_i \le 1$ (`DM.check`).
- tour: decoupled diagonal matrix ($\varepsilon = 0$) -> grow off-diagonal coupling -> watch disconnected islands trap one eigenvalue each -> merge disks so eigenvalues cross components.
- math: Semyon Aranovich Gershgorin (1931); if a union of $k$ Gershgorin disks is disjoint from the remaining $n - k$ disks, continuity of eigenvalues implies it contains precisely $k$ eigenvalues counted with multiplicity.

## Steiner's Porism
- topics: geometry, hyperbolic · form: 2D inversive circle chain · theme: dark · modules: `draw`, `math-complex`, `tex`
- idea: if a ring of tangent circles closes smoothly around an inner circle inside an outer circle, every starting circle closes a chain of the exact same length.
- gesture: drag the first tangent circle around the annulus or drag the inner circle off-center.
- aha: applying a Möbius inversion maps the eccentric annulus to two concentric circles where all tangent circles have identical radius, revealing closure immediately.
- live check: inversive invariant $\Delta = \frac{(R - r)^2 - d^2}{4Rr} = \tan^2(\pi/n)$ (`DM.check`).
- tour: concentric $n=6$ Steiner chain -> slide inner circle off-center using exact inversive radius -> toggle inversion ghosts -> break closure between periods.
- math: Jakob Steiner (1826); Möbius inversion sends any pair of non-intersecting circles to concentric circles, reducing chain closure to the trivial angular condition $\Delta = \tan^2(\pi/n)$.

## The Perron–Frobenius Eigenmode
- topics: linear, dynamics · form: panes (Markov chain graph | probability simplex) · theme: light · modules: `draw`, `math-linalg`, `tex`
- idea: repeated multiplication by a positive transition matrix contracts every probability distribution exponentially onto a unique positive eigenvector with eigenvalue $1$.
- gesture: drag the starting probability vector inside the $3$-state simplex triangle.
- aha: a cloud of initial states across the entire triangle collapses along the subdominant eigen-directions onto a single glowing stationary point $\pi$.
- live check: $\pi P = \pi$ residual $< 10^{-12}$ and contraction ratio $|\lambda_2| < 1$ (`DM.check`).
- tour: scatter 12 states across the probability triangle -> iterate $P^k$ step by step -> inspect spectral gap $|\lambda_2|$ -> tune transition edge toward near-reducible slowdown.
- math: Oskar Perron (1907) and Georg Frobenius (1912); an irreducible aperiodic stochastic matrix has simple leading eigenvalue $\lambda_1 = 1$, strictly positive stationary distribution $\pi$, and $|\lambda_k| < 1$ for all $k \ge 2$.

## The Brachistochrone & Tautochrone
- topics: geometry, dynamics · form: 2D race + arrival-time chart · theme: dark · modules: `draw`, `plot`, `tex`
- idea: an inverted cycloid is both the curve of fastest gravity descent between two points and the unique ramp where balls released from any height arrive at the bottom simultaneously.
- gesture: drag the endpoint $(x_1, y_1)$ or toggle release heights along the cycloid.
- aha: the cycloid bead dives steeply first and overtakes straight-line, circular, and parabolic tracks; released from three different heights on the cycloid, all beads hit bottom in unison.
- live check: arrival time $T = \pi\sqrt{R/g}$ independent of release angle $\theta_0$ (`DM.check`).
- tour: race straight line, circle arc, and cycloid -> watch cycloid overtake halfway -> switch to tautochrone mode: three heights hit bottom together -> vary target endpoint.
- math: Johann Bernoulli (1696) and Christiaan Huygens (1673); Euler–Lagrange minimization of $\int \sqrt{(1+y'^2)/(2gy)}\,dx$ yields a cycloid $x = R(\theta - \sin\theta),\ y = R(1 - \cos\theta)$.

## Buffon's Needle & Barbier's Theorem
- topics: combinatorics, geometry · form: panes (needle board | π convergence plot) · theme: light · modules: `draw`, `plot`, `tex`
- idea: dropping needles of length $\ell \le d$ onto parallel strips crosses a line with probability $2\ell/(\pi d)$ — and bending the needle into any shape leaves the expected crossings unchanged.
- gesture: drag needle length $\ell/d$ or switch between straight needle, circle, and bent noodle.
- aha: by linearity of expectation ("Buffon's noodle"), every curve of total perimeter $\pi d$ averages exact $1$ crossing — immediately yielding Barbier's theorem that every constant-width curve has perimeter $\pi d$.
- live check: empirical crossing fraction converges toward $\frac{2L}{\pi d}$ (`DM.check`).
- tour: drop 50 straight needles -> stream 1,000 needles watching the $2/(\pi \hat{p})$ curve converge toward $\pi$ -> bend needle into a noodle -> closed circle of diameter $d$ averages $2$ crossings.
- math: Georges-Louis Leclerc, Comte de Buffon (1777) and Joseph-Émile Barbier (1860); decomposing any rectifiable curve of length $L$ into tiny segments yields $E[\text{crossings}] = \frac{2L}{\pi d}$ by linearity of expectation.
