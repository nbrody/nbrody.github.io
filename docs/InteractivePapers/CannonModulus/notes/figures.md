# Figure plan

Eight figures, one per load-bearing step, in page order. Each computes the paper's construction on an exact or explicit model and checks a numbered statement live. Colour roles (`style.css`, `palette()` in `js/common.js`): `P.u` cobalt = the scalar function, its levels, crossings; `P.w` teal = a second function or transform, the partner; `P.mu` violet = measure, energy, cost, punctures; `P.mesh` gray = cells, tiles, nets. `P.good`/`P.bad` only for checks.

The October page (`../cannon/js/fig-*.js`) has sound math for most of these in the older helper API; port it, don't import it.

The paper has two figures of its own (level continuum, p. 11; pair cost, p. 28). Page figures are numbered 1–8 in page order; the captions of Figures 5 and 8 say "the paper's first figure" / "the paper's second figure, made live". Prose never writes "Figure 1" for the paper's figure.

---

## Figure 1 · `fig-sphere` · §2, Lemma 2.1 (expansion formula)

- **Model.** The right-angled dodecahedral reflection group $\Gamma\subset\mathrm{Isom}(\mathbb H^3)$ (12 reflections; cocompact; boundary the round $S^2$; contains orientation-reversing elements, which the paper allows). Its Cayley graph is quasi-isometric to $\mathbb H^3$; the chordal metric on $S^2$ is a visual metric.
- **Computes.** Click a boundary point $x$; slider depth $t$ (hyperbolic distance, the stand-in for $k$). The point at distance $t$ on the ray $o\to x$ is folded into the fundamental dodecahedron, recording the reflections: that word is $v$, an actual group element, and $h=v^{-1}$ acts on $S^2$ as a Möbius or anti-Möbius map (4×4 Lorentz matrix). Two panels: source sphere with the ball $B(x,R)$, $R\asymp e^{-t}$, and the target sphere $hS^2$, where the ball has become macroscopic and everything far from $x$ is squeezed toward the puncture $p=hz_0$.
- **Live check.** (2.2): over ~200 random pairs $y,z$, the ratio $d(hy,hz)\,D_yD_z/(R\,d(y,z))$ lies in a fixed band $[c_E,C_E]$; show min and max, ✓ while the band holds as $t$ grows. Also (2.3): $d(hy,p)\,D_y/R$ bounded.
- **Default.** $x$ at a generic point, $t$ large enough that the ball is visibly small and the image visibly fills.
- **Presets.** "Deeper" (larger $t$); "x at a tile vertex".
- **Port from** `cannon/js/fig-sphere.js` (WebGL folding shader, face normals, boost helpers). Replace its boost by the folded group element.

## Figure 2 · `fig-structure` · §2, Proposition 2.6 (Sullivan–Tukia)

- **Model.** The hyperbolic plane $\mathcal C_x$ of conformal structures at a point (positive definite $2\times2$ forms mod scalars ≅ the Poincaré disk). A finite set of linear maps (bounded distortion $K$), including orientation-reversing ones, generating a finite group's orbit (or a finite symmetric orbit closed under the chosen maps).
- **Computes.** The orbit $\{f^*q_{\rm round}\}$ as points in the disk (draw each as a small ellipse too); its unique hyperbolic circumcenter $q$ (minimal enclosing ball).
- **Live check.** Pulling back by each generator permutes the orbit and fixes the circumcenter: $d_{\mathbb H}(f^*q,q)\approx0$ for every $f$ ✓; the orbit radius is bounded by $\log K$-type bound ✓.
- **Presets.** a rotation group; a dihedral group with reflections (orientation-reversing kept, the paper's point); a non-closed set (center not invariant: ✗, the hypothesis that the orbit is a group orbit matters).
- **Port from** `cannon/js/fig-structures.js`.

## Figure 3 · `fig-blocker` · §3, Lemma 3.2(ii)

- **Model.** A square grid on a rectangle; the reader paints a compact set $K$ (marked squares).
- **Computes.** The paper's labelling: $A$ = unmarked squares reachable from the top (plus an appended top row), $B$ = the rest (plus an appended bottom row); interfaces between unlike labels; ends on each lateral side; the interface component joining the lateral sides; its adjacent $B$ squares (a lateral crossing inside $K$).
- **Live check.** If $K$ blocks every top–bottom chain: the number of ends on each lateral side is odd ✓, some component joins left to right ✓, its $B$ squares are all marked and form a connected lateral crossing ✓. If $K$ does not block, say so and show an unmarked top–bottom chain.
- **Presets.** a wavy wall (default); a wall with a gap (does not block); two walls; random blocker.
- **Port from** `cannon/js/fig-blocker.js`.

## Figure 4 · `fig-modulus` · §3, Lemma 3.3 (crossing dual weights)

- **Model.** A hexagonal board (Hex: a left–right crossing and a top–bottom crossing must share a cell, which is Lemma 3.2(i) here); cells are the $B(q,2r_n)$.
- **Computes.** The proof of Lemma 3.3 as an algorithm: the least-norm point $P$ of the convex hull of left–right crossing incidence vectors, by (pairwise) Frank–Wolfe with a shortest-path oracle. Show $P$ as a heat map on cells, the current cheapest crossing, and $\mathrm{Mod}_{LR}=\|P\|^{-2}$ with certified lower and upper bounds.
- **Live check.** (a) $P/\|P\|^2$ is admissible for left–right crossings (cheapest crossing cost ≥ 1 up to the gap) ✓; (b) $\rho=P$ is admissible for top–bottom crossings (cheapest top–bottom cost under $P$ ≥ 1) ✓; (c) $\sum\rho^2\cdot\mathrm{Mod}_{LR}=1$, so $\mathrm{Mod}_{TB}\le1/\mathrm{Mod}_{LR}$, which is (3.2) ✓.
- **Presets.** square board; long board; a board with a narrow neck (holes in the domain).
- **Port from** `cannon/js/fig-modulus.js` (pairwise Frank–Wolfe, `shortestChain`, `costFromTop`).

## Figure 5 · `fig-levels` · §3, Lemma 3.4 (the paper's first figure, made live) — NEW

- **Model.** A grid triangulation of $\widehat{\mathcal Q}=[0,1]\times[-1,2]$ (top band, $\mathcal Q$, bottom band; $y$ drawn downward, top band at the top). Cell weights $\rho_q\ge0$ on $\mathcal Q$ (presets below).
- **Computes, exactly as the paper:** raw $b_N(x)$ = cheapest cell-cost of a path from the top edge to $x$ (Dijkstra on cells), raw value $\min\{1,b_N\}$, $0$ on the top band and $1$ on the bottom band; PL interpolation $U^0_N$; $F_N(x)=\min_{\text{paths }x\to\text{top}}\max U^0_N$ (bottleneck Dijkstra); $H_N(x)=\max_{\text{paths }x\to\text{bottom}}\min F_N$ (bottleneck Dijkstra). Show a chosen function ($U^0$, $F$, $H$) as a colour field with the level set at $t$ (marching triangles), and the lateral component $C_{N,t}$ of $\{H_N=t\}$ highlighted.
- **Interaction.** Slider $t\in(0,1)$; segmented control $U^0$ / $F$ / $H$; a draggable path $\eta$ (two or three handles, polyline).
- **Live check.** (3.3) along $\eta$: $\osc H\le\osc F\le\osc U^0$ ✓; if the endpoint values of $\eta$ strictly straddle $t$, $\eta$ meets $C_{N,t}$ ✓ (and the readout says so). Also a batch check over ~500 random straddling segments: all meet $C_{N,t}$ ✓. On $U^0$, show a level set with an island: a straddling path inside the island misses the lateral component (why the envelopes are needed).
- **Presets.** weights = dual weights of Figure 4's square board (default); rough random weights (islands in $U^0$); a channel of cheap cells.
- **Tests.** envelopes satisfy (3.3) on random paths; band values; every straddling random segment meets the lateral component; $F\ge U^0$, $H\le F$.

## Figure 6 · `fig-transverse` · §3, Lemma 3.8 (used in Lemma 4.3 and Lemma 6.4)

- **Model.** Two magnified functions with punctures, as in §4: $f=\mathrm{Re}\,(e^{i\theta}/(z-b))$ and $w=\mathrm{Re}\,(e^{i\varphi}/(z-c))$ on a disk avoiding $b,c$. Level sets of $f$ are circles through $b$.
- **Computes.** For a value interval $I$, the level continua $D_t=\{f=t\}\cap K$ and $b_0=\min_t\osc_{D_t}w$; the finite-cell sum $S_n=\sum_q\osc f\cdot\osc w$ over cells of mesh $1/n$, for several $n$.
- **Live check.** (3.7) $b_0|I|\le S_n$ at every mesh ✓; chart of $S_n$ against $n$ staying above the line $b_0|I|$.
- **Presets.** different punctures (default); same puncture, same angle ($w=f$: $b_0=0$, no constraint, which is why §4 needs a different puncture); punctures close together.
- **Port from** `cannon/js/fig-transverse.js`.

## Figure 7 · `fig-flow` · §5, Lemma 5.3 (the Jensen budget)

- **Model.** A random tree satisfying the transition bounds (5.8)–(5.9) with the paper's exponents (5.7) ($b_*=1/2$, $\tau=1/20$), a chosen $D$ and $a$, and an adversary that decides which nodes are good (slider: target bad fraction per generation; presets).
- **Computes.** For every node: $P_i$, $\Delta_i$, $m_i$; per generation: bad mass, $\sum_i\Delta_i^2$, and the Jensen lower bound $\Delta_0^2a^{D((b_*+\tau)\sum P_im_i-\tau n)}$.
- **Live check.** (5.21) holds at every node ✓ (count); the running average bad mass is $\le\tau/(b_*+\tau)+O(1/n)=1/11+O(1/n)$ whenever the energy stays within the budget $E_0$; an adversary that keeps bad mass above $1/2$ exceeds $E_0$ at a finite generation (marked ✗ for the adversary, i.e. the lemma wins). Chart: generations on the x-axis, bad mass bars, the 1/11 line, energy against budget.
- **Port from** `cannon/js/fig-flow.js` (budget chart); add the explicit tree.

## Figure 8 · `fig-pairs` · §6, (6.8)–(6.11) (the paper's second figure, made live)

- **Model.** Exact Möbius expansions: $h_i(z)=R/(z-x_i)$-type maps on the Riemann sphere (disks go to disks exactly). Punctures $p_i,p_j$ at distance $d_{ij}\gg R$.
- **Computes.** $E_j=\overline B(p_j,A_hR)$; its preimage $h_i^{-1}E_j$ (an exact disk); $z_{ij}=h_i^{-1}p_j$; $s_{ij}$; the enlargement $\mathcal D_{ij}=\overline B(z_{ij},C_\mu s_{ij})$ and its image. Source and target panels as in the paper's figure.
- **Live check.** (6.8) $D_{z_{ij}}d_{ij}/R$ in a band ✓; (6.9) $h_i^{-1}E_j\subseteq\overline B(z_{ij},s_{ij})$ with $s_{ij}d_{ij}^2/R^2$ in a band ✓; (6.11) $h_i\mathcal D_{ij}\subseteq\overline B(p_j,C_3R)$ ✓. Drag $p_j$; slider $R$; as $d_{ij}$ shrinks toward $R$ the scale separation fails (readout turns ✗ when $R/d_{ij}$ is not small — the far-pair hypothesis (6.5) matters).
- **Port from** `cannon/js/fig-pairs.js`.
