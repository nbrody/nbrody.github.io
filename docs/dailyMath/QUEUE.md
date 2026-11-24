# Daily Math — Plate Queue

Maintained by each daily run: build the TOP entry, remove it from this list, and keep **at least 6** entries below. Alternate `defaultTheme` (`light` Parchment vs `dark` Obsidian) and vary `form` (`2D`, `panes+plot`, `3D`, `webgl2`) on consecutive days. Avoid duplicating plates already in `manifest.js` or tools in `docs/autoVisualization/`.

---

## The Three-Gap Theorem
- topics: numbers, dynamics · form: 2D circle + gap-length strip · theme: light · modules: `draw`, `math-exact`, `tex`
- idea: placing $0, \alpha, 2\alpha, \dots, (N-1)\alpha$ around the unit circle always cuts it into arcs of at most three distinct lengths.
- gesture: drag $\alpha$ around the circle; slider for $N$.
- aha: gaps constantly reshuffle colors, yet never show a fourth length, and when three appear the longest equals the sum of the two shorter; at convergent denominators of $\alpha$ only two lengths survive.
- live check: distinct gap count $\le 3$ and $g_{\max} = g_1 + g_2$ (`DM.check`, exact BigInt arithmetic for rational $\alpha$).
- tour: $N = 5$ generic angle -> drag $\alpha$ -> $N = 8$ with golden ratio $\varphi^{-1}$ -> convergent denominator collapses 3 gaps to 2.
- math: Steinhaus's conjecture, proved independently by Vera Sós (1957), Świerczkowski (1958), and Surányi (1958); the gap sizes reflect best rational approximations from the continued fraction of $\alpha$.

## Volume of an Ideal Tetrahedron
- topics: hyperbolic, topology · form: WebGL2 shader + 2D overlay · theme: dark · modules: `gl`, `math-complex`, `tex`
- idea: every ideal hyperbolic tetrahedron is determined by a single complex shape parameter $z \in \mathbb{H}$, and its volume is the Bloch-Wigner dilogarithm $D(z)$.
- gesture: drag the shape parameter $z$ across the upper half-plane.
- aha: the volume landscape peaks uniquely at the regular ideal tetrahedron $z = e^{i\pi/3}$, while the six symmetry-equivalent shapes $z, 1/(1-z), 1-1/z$ and their reflections share the same $|D(z)|$.
- live check: $D(z) = \Lambda(\alpha) + \Lambda(\beta) + \Lambda(\gamma)$ across dihedral angles $\le 1.0149416$ (`DM.check`).
- tour: flat degenerate shape ($D \to 0$) -> drag toward $e^{i\pi/3}$ -> peak regular tetrahedron ($V_{\max} \approx 1.01494$) -> the sixfold orbit of equivalent shapes.
- math: Lobachevsky and Milnor (1982); $D(z) = \operatorname{Im}\operatorname{Li}_2(z) + \arg(1-z)\log|z|$ equals the sum of Lobachevsky functions of the dihedral angles, uniquely maximized by the equilateral ideal tetrahedron.

## Euler's Elastica
- topics: geometry, dynamics · form: panes (elastica curve | phase portrait) · theme: light · modules: `draw`, `plot`, `tex`
- idea: bending an elastic rod under end compression produces inflectional, figure-eight, and non-inflectional elasticae whose turning angle obeys the pendulum equation.
- gesture: drag the compression / modulus parameter $k$ or tap boundary presets.
- aha: at the critical separatrix $k^2 \approx 0.8261$ ($2E(k) = K(k)$), the rod's two ends touch to form a perfect closed figure-eight.
- live check: bending energy $\int \kappa^2\,ds$ and total curvature match pendulum first integral $\kappa^2/2 + \cos\theta = \text{const}$ (`DM.check`).
- tour: gentle buckled arch -> increase compression -> critical figure-eight separatrix -> non-inflectional looping coils.
- math: Leonhard Euler (1744, *Methodus Inveniendi*) classified plane elastic curves minimizing $\int \kappa^2\,ds$; Kirchhoff's kinetic analogy links arc-length curvature to the nonlinear mathematical pendulum.

## The Borromean Rings
- topics: topology, geometry · form: 3D orbit stage · theme: dark · modules: `draw`, `space3d`, `tex`
- idea: three mutually unlinked closed loops in $\mathbb{R}^3$ can nonetheless be inextricably linked together, and cannot be built from three flat circles.
- gesture: drag to orbit in 3D; slider for ellipse eccentricity $e$.
- aha: cutting or fading any single ring leaves the remaining two completely unlinked ($lk = 0$), yet as three flat circles ($e \to 0$) they cannot realize the link without intersecting.
- live check: all pairwise linking numbers $\operatorname{lk}(R_i, R_j) = 0$ while the Milnor triple invariant $\bar{\mu}(1,2,3) = \pm 1$ (`DM.check`).
- tour: orthogonal elliptical triad -> orbit along an axis -> fade one ring to free the others -> flatten eccentricity to see why circular Borromean rings are impossible.
- math: Brunnian link invariant studied via Massey products and Milnor's $\bar{\mu}$-invariants (1954); Lindström and Zetterström (1991) proved no realization exists using three flat circles.

## The Modular j-Invariant
- topics: numbers, hyperbolic · form: WebGL2 domain coloring + overlay fundamental domain · theme: dark · modules: `gl`, `math-complex`, `tex`
- idea: Klein's $j(\tau)$ maps the modular surface $\mathrm{SL}_2(\mathbb{Z})\backslash\mathbb{H}$ bijectively onto $\mathbb{C}$, revealing a fractal mosaic of fundamental domains under domain coloring.
- gesture: drag $\tau$ in the upper half-plane to evaluate $j(\tau)$ and highlight its $\mathrm{SL}_2(\mathbb{Z})$ orbit.
- aha: moving $\tau$ onto $\tau = i$ or $\tau = e^{2\pi i/3}$ hits exact algebraic values $j(i) = 1728$ and $j(\rho) = 0$ where the tiling angles double and triple.
- live check: $j(-1/\tau) = j(\tau)$ and $j(\tau+1) = j(\tau)$ to machine precision (`DM.check`).
- tour: fundamental keyhole domain -> drag $\tau$ across a boundary to see $S$ and $T$ invariance -> elliptic point $\tau = i$ ($1728$) -> cube-root corner $\tau = \rho$ ($0$).
- math: Dedekind and Klein (1877); $j(\tau) = 1728\,g_2(\tau)^3 / \Delta(\tau)$ is the unique normalized modular function of weight $0$, generating all rational functions on the moduli stack of elliptic curves.

## Confocal Caustics of an Ellipse
- topics: geometry, dynamics · form: 2D stage · theme: light · modules: `draw`, `tex`
- idea: billiard trajectories inside an ellipse preserve a second conserved quantity and remain tangent to a single confocal conic — either a smaller ellipse or a hyperbola.
- gesture: drag the initial ray angle from a boundary point or drag eccentricity $e$.
- aha: crossing the focal line between the two foci switches the caustic catastrophically from a closed confocal ellipse to two branches of a confocal hyperbola.
- live check: Joachimsthal integral $\frac{\langle p, v\rangle_A}{|p|_A}$ and confocal parameter $\lambda$ preserved across all bounces (`DM.check`).
- tour: ray grazing an inner confocal ellipse -> aim between the foci to flip to a hyperbola -> launch through a focus to collapse onto the major axis -> eccentric limit.
- math: Birkhoff billiard integrability and Chasles's theorem; every tangent to a fixed confocal conic reflects across the ellipse normal into another tangent to the exact same confocal conic.

## Gershgorin's Circle Theorem
- topics: linear, geometry · form: panes (complex eigenvalue plane | perturbation controls) · theme: light · modules: `draw`, `math-linalg`, `math-complex`, `tex`
- idea: every eigenvalue of an $n\times n$ matrix $A$ must lie inside the union of $n$ disks centered at its diagonal entries with radii equal to the off-diagonal row sums.
- gesture: drag the off-diagonal coupling scale $\varepsilon \in [0, 1.5]$.
- aha: as $\varepsilon \to 0$, each Gershgorin disk shrinks smoothly onto its diagonal entry; when a disk isolates itself from the others, it captures exactly one eigenvalue by continuity.
- live check: $\forall \lambda \in \sigma(A),\ \min_i |\lambda - a_{ii}| / R_i \le 1$ (`DM.check`).
- tour: decoupled diagonal matrix ($\varepsilon = 0$) -> grow off-diagonal coupling -> watch disconnected islands trap one eigenvalue each -> merge disks so eigenvalues cross components.
- math: Semyon Aranovich Gershgorin (1931); if a union of $k$ Gershgorin disks is disjoint from the remaining $n - k$ disks, continuity of eigenvalues implies it contains precisely $k$ eigenvalues counted with multiplicity.
