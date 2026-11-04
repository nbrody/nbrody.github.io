// Content for the companion pages of the Cannon page. Plain data: HTML strings with $…$ math.
// Numbered references written as plain text ("Lemma 3.4", "(3.7)", "§5") become links with previews.
const R = String.raw;

// ───────────────────────── dependency graph ─────────────────────────
// kind: def | lemma | prop | thm | goal | eq | remark | input; target: id on the page;
// cite: a CITED key for inputs that live only on the Cited results page; uses: ids this rests on
export const DEP_NODES = [
  // inputs from the literature
  { id: 'thin', kind: 'input', label: 'Thin triangles', gist: 'visual metrics, Gromov products', cite: 'bh', uses: [] },
  { id: 'bk', kind: 'input', label: 'Bonk–Kleiner; Bourdon–Kleiner', gist: 'bounded modulus ⇒ round', cite: 'bk', uses: [] },
  { id: 'sullivan', kind: 'input', label: 'Sullivan–Tukia', gist: 'invariant conformal structure', cite: 'sullivan', uses: [] },
  { id: 'mrmt', kind: 'input', label: 'Ahlfors–Bers', gist: 'measurable Riemann mapping', cite: 'ahlforsbers', uses: [] },
  { id: 'hk', kind: 'input', label: 'Heinonen–Koskela', gist: 'metric quasiconformality', cite: 'hk', uses: [] },
  { id: 'jordan', kind: 'input', label: 'Jordan curve theorem', gist: 'crossings meet', cite: 'jordan', uses: [] },
  { id: 'agol', kind: 'input', label: 'Agol; Bergeron–Wise', gist: 'fibering, specialness', cite: 'agol', uses: [] },
  // §2
  { id: 'l21', kind: 'lemma', label: 'Lemma 2.1', gist: 'expansion formula', target: 'lem-2-1', uses: ['thin'] },
  { id: 'l22', kind: 'lemma', label: 'Lemma 2.2', gist: 'prefixes', target: 'lem-2-2', uses: ['thin', 'l21'] },
  { id: 'l23', kind: 'lemma', label: 'Lemma 2.3', gist: 'packing', target: 'lem-2-3', uses: ['l22'] },
  { id: 'l24', kind: 'lemma', label: 'Lemma 2.4', gist: R`controlled paths (uses $\partial G\cong\mathbb S^2$)`, target: 'lem-2-4', uses: ['l21'] },
  { id: 'e25', kind: 'def', label: '(2.5)', gist: R`the modulus $M(n)$`, target: 'eq-2-5', uses: ['l21'] },
  { id: 't25', kind: 'thm', label: 'Theorem 2.5', gist: 'uniformization', target: 'thm-2-5', uses: ['bk', 'l21', 'e25'] },
  { id: 'p26', kind: 'prop', label: 'Proposition 2.6', gist: R`the action on $\mathbb H^3$`, target: 'prop-2-6', uses: ['sullivan', 'mrmt', 'hk', 'l21'] },
  // §3
  { id: 'e31', kind: 'eq', label: '(3.1)', gist: 'record scales', target: 'eq-3-1', uses: ['e25'] },
  { id: 'l31', kind: 'lemma', label: 'Lemma 3.1', gist: 'localize to a rectangle', target: 'lem-3-1', uses: ['e25'] },
  { id: 'l32', kind: 'lemma', label: 'Lemma 3.2', gist: 'crossings and blockers', target: 'lem-3-2', uses: ['jordan'] },
  { id: 'l33', kind: 'lemma', label: 'Lemma 3.3', gist: 'crossing dual weights', target: 'lem-3-3', uses: ['l31', 'l32'] },
  { id: 'l34', kind: 'lemma', label: 'Lemma 3.4', gist: 'separating levels', target: 'lem-3-4', uses: ['l33', 'l32'] },
  { id: 'l35', kind: 'lemma', label: 'Lemma 3.5', gist: 'local oscillation', target: 'lem-3-5', uses: ['l34', 'l24', 'l23'] },
  { id: 'l36', kind: 'lemma', label: 'Lemma 3.6', gist: 'annular estimate', target: 'lem-3-6', uses: ['l34', 'l35', 'l21', 'l24'] },
  { id: 'p37', kind: 'prop', label: 'Proposition 3.7', gist: R`scalar limit $u$, measure $\mu$`, target: 'prop-3-7', uses: ['l36', 'e31', 'l34'] },
  { id: 'l38', kind: 'lemma', label: 'Lemma 3.8', gist: 'level comparison', target: 'lem-3-8', uses: [] },
  { id: 'l39', kind: 'lemma', label: 'Lemma 3.9', gist: 'stopping a continuum', target: 'lem-3-9', uses: [] },
  // §4
  { id: 'l41', kind: 'lemma', label: 'Lemma 4.1', gist: 'Hölder magnification', target: 'lem-4-1', uses: ['l21', 'l23', 'l24'] },
  { id: 'l42', kind: 'lemma', label: 'Lemma 4.2', gist: 'diagonal approximants', target: 'lem-4-2', uses: ['l41', 'p37', 'l35', 'l34'] },
  { id: 'l43', kind: 'lemma', label: 'Lemma 4.3', gist: 'transform comparison', target: 'lem-4-3', uses: ['l42', 'l38', 'l39'] },
  { id: 'l44', kind: 'lemma', label: 'Lemma 4.4', gist: 'stabilizer directions', target: 'lem-4-4', uses: ['thin', 'l22'] },
  { id: 'p45', kind: 'prop', label: 'Proposition 4.5', gist: 'no exponential records', target: 'prop-4-5', uses: ['l41', 'l43', 'l44'] },
  // §5
  { id: 'l51', kind: 'lemma', label: 'Lemma 5.1', gist: 'many children', target: 'lem-5-1', uses: ['p37', 'l23'] },
  { id: 'l52', kind: 'lemma', label: 'Lemma 5.2', gist: 'separated capacity', target: 'lem-5-2', uses: ['p37', 'l21', 'l24', 'e25'] },
  { id: 'e520', kind: 'eq', label: '(5.20)', gist: 'level energy', target: 'eq-5-20', uses: ['p37'] },
  { id: 'e521', kind: 'eq', label: '(5.21)', gist: 'the flow inequalities', target: 'eq-5-21', uses: ['l51', 'l52'] },
  { id: 'l53', kind: 'lemma', label: 'Lemma 5.3', gist: 'good mass at many levels', target: 'lem-5-3', uses: ['e521', 'e520'] },
  { id: 'p54', kind: 'prop', label: 'Proposition 5.4', gist: 'the flow', target: 'prop-5-4', uses: ['l53', 'l51', 'l52'] },
  // §6
  { id: 'l62', kind: 'lemma', label: 'Lemma 6.2', gist: 'puncture multiplicity', target: 'lem-6-2', uses: ['l21', 'l22', 'l23'] },
  { id: 'l63', kind: 'lemma', label: 'Lemma 6.3', gist: 'probability near a puncture', target: 'lem-6-3', uses: ['p54', 'l21', 'l22', 'l62'] },
  { id: 'l64', kind: 'lemma', label: 'Lemma 6.4', gist: 'pair alternative', target: 'lem-6-4', uses: ['p54', 'l38', 'l39', 'l35', 'l34'] },
  { id: 'e69', kind: 'eq', label: '(6.9)–(6.11)', gist: 'cost balls', target: 'eq-6-9', uses: ['l21', 'p37'] },
  { id: 'p61', kind: 'prop', label: 'Proposition 6.1', gist: 'no subexponential records', target: 'prop-6-1', uses: ['l63', 'l64', 'e69', 'l62'] },
  // completion
  { id: 'main', kind: 'goal', label: 'Theorem 1.1', gist: "Cannon's conjecture", target: 'thm-1-1', uses: ['p45', 'p61', 't25', 'p26', 'e31'] },
  { id: 'c81', kind: 'remark', label: 'Corollary 8.1', gist: 'closed hyperbolic manifold', target: 'cor-8-1', uses: ['main'] },
  { id: 'c82', kind: 'remark', label: 'Corollary 8.2', gist: 'virtual structure', target: 'cor-8-2', uses: ['c81', 'agol'] },
];

// ───────────────────────── definitions ─────────────────────────
export const DEF_TOPICS = ['Hyperbolic groups', 'Metric spheres and maps', 'Modulus', 'The scalar limit', 'Magnification (§4)', 'The flow and pairs (§5–6)'];

// level: basic | intermediate | specialized; origin: paper | background; topic: index into DEF_TOPICS
export const DEFINITIONS = [
  { key: 'cayley', topic: 0, level: 'basic', origin: 'background', term: 'Cayley graph',
    text: R`For a group $G$ with a finite symmetric generating set $S$: vertices the elements of $G$, an edge from $g$ to $gs$ for each $s\in S$, all of length one. Its graph metric is the word metric.`, where: '§2' },
  { key: 'hyperbolic', topic: 0, level: 'intermediate', origin: 'background', term: 'Hyperbolic group',
    text: R`A finitely generated group whose Cayley graph has uniformly thin geodesic triangles: each side lies in the $\delta$-neighbourhood of the other two. Independent of the generating set.`, where: 'Theorem 1.1' },
  { key: 'gromov', topic: 0, level: 'intermediate', origin: 'background', term: 'Gromov product',
    text: R`$(y|z)_o=\tfrac12\bigl(d(o,y)+d(o,z)-d(y,z)\bigr)$: roughly how long geodesics from $o$ to $y$ and to $z$ travel together. Extended to boundary points by limits along rays, up to bounded error.`, where: '(2.1)' },
  { key: 'boundary', topic: 0, level: 'intermediate', origin: 'background', term: R`Boundary $\partial G$`,
    text: R`Geodesic rays from the identity, two rays identified when they stay a bounded distance apart, with the visual topology. A free group has a Cantor set, a surface group a circle, a cocompact Kleinian group the round sphere.`, where: 'Theorem 1.1' },
  { key: 'geometric', topic: 0, level: 'basic', origin: 'paper', term: 'Geometric action (proper, cocompact)',
    text: R`Proper: only finitely many group elements bring a compact set back to meet itself. Cocompact: the translates of one compact set cover the space.`, where: 'Theorem 1.1' },
  { key: 'loxodromic', topic: 0, level: 'intermediate', origin: 'background', term: 'Loxodromic element',
    text: R`An infinite-order element of a hyperbolic group; it acts on the boundary with exactly two fixed points, one attracting and one repelling.`, where: 'Lemma 4.4' },
  { key: 'visual', topic: 1, level: 'intermediate', origin: 'paper', term: 'Visual metric',
    text: R`A metric on $\partial G$ comparable to $a^{-(y|z)_e}$ for some $a\gt1$, as in (2.1). Scales are $r_k=a^{-k}$.`, where: '(2.1)' },
  { key: 'expansion', topic: 1, level: 'intermediate', origin: 'paper', term: 'Expansion',
    text: R`For the depth-$k$ vertex $v$ on a ray to $x$, the map $h=v^{-1}$ on $\partial G$. It magnifies $B(x,r_k)$ to macroscopic size and squeezes the rest toward the puncture $p=hz_0$ (Lemma 2.1, Figure 1).`, where: 'Lemma 2.1' },
  { key: 'puncture', topic: 1, level: 'intermediate', origin: 'paper', term: 'Puncture',
    text: R`The image $p=hz_0$ of a fixed far point under an expansion. Everything far from the expansion center lands near it, by (2.3).`, where: '(2.3)' },
  { key: 'doubling', topic: 1, level: 'basic', origin: 'paper', term: 'Packing, doubling',
    text: R`An $s$-separated set in a ball of radius $t$ has at most $C(t/s)^Q$ points (Lemma 2.3). $Q$ plays the role of a dimension.`, where: 'Lemma 2.3' },
  { key: 'continuum', topic: 1, level: 'basic', origin: 'paper', term: 'Continuum',
    text: R`A nonempty compact connected set. It need not be path connected; the paper never assumes level sets are curves.`, where: 'Lemma 3.2' },
  { key: 'qm', topic: 1, level: 'specialized', origin: 'background', term: 'Quasi-Möbius, quasisymmetric',
    text: R`A homeomorphism is quasi-Möbius if it distorts cross-ratios $\frac{d(x,z)d(y,w)}{d(x,w)d(y,z)}$ by a controlled function; quasisymmetric if it distorts ratios of distances from a common point by a controlled function. On compact spaces the two notions agree.`, where: 'Theorem 2.5' },
  { key: 'qc', topic: 1, level: 'specialized', origin: 'background', term: 'Quasiconformal map',
    text: R`A homeomorphism that maps infinitesimal circles to ellipses of bounded eccentricity; equivalently (Heinonen–Koskela) one whose metric distortion at small scales is bounded.`, where: 'Proposition 2.6' },
  { key: 'conformalstructure', topic: 1, level: 'specialized', origin: 'background', term: 'Measurable conformal structure',
    text: R`A choice, at almost every point, of a positive definite quadratic form up to scale. At one point these form a hyperbolic plane $\mathcal C_x$, on which linear maps act by isometries (Figure 2).`, where: 'Proposition 2.6' },
  { key: 'selfsimilar', topic: 1, level: 'specialized', origin: 'paper', term: 'Approximately self-similar',
    text: R`Every ball, with distances divided by its radius, is uniformly bi-Lipschitz to an open subset of the space. Expansions give this for $\partial G$.`, where: 'Theorem 2.5' },
  { key: 'modulus', topic: 2, level: 'intermediate', origin: 'paper', term: R`Combinatorial modulus $\operatorname{Mod}_2$`,
    text: R`For a family of paths and the cells $B(q,2r_n)$: the least $\sum\omega(q)^2$ over weights $\omega\ge0$ giving total weight at least $1$ to the cells met by every path. The cost of blocking the family.`, where: '(2.5)' },
  { key: 'admissible', topic: 2, level: 'basic', origin: 'paper', term: 'Admissible weights',
    text: R`Weights on cells for which every path of the family meets cells of total weight at least $1$.`, where: '(2.5)' },
  { key: 'macroscopic', topic: 2, level: 'basic', origin: 'paper', term: R`Macroscopic paths, $M(n)$`,
    text: R`$\mathcal F_0$ is the family of paths of diameter at least $d_0$; $M(n)$ is its modulus at scale $r_n$, (2.5).`, where: '(2.5)' },
  { key: 'records', topic: 2, level: 'intermediate', origin: 'paper', term: 'Record indices',
    text: R`Indices $N$ at which $M(N)/\lambda^N$ exceeds all earlier values, so $M(N-l)\le\lambda^{-l}M(N)$, (3.1). $\lambda\gt1$ is the exponential case, $\lambda=1$ the subexponential one.`, where: '(3.1)' },
  { key: 'crossing', topic: 2, level: 'basic', origin: 'paper', term: 'Crossing, lateral continuum',
    text: R`A left-to-right (lateral) or top-to-bottom crossing of a coordinate rectangle. A lateral continuum meets both lateral edges.`, where: 'Lemma 3.2' },
  { key: 'blocker', topic: 2, level: 'basic', origin: 'paper', term: 'Blocker',
    text: R`A compact set meeting every top-to-bottom path. By Lemma 3.2(ii) it contains a lateral continuum (Figure 3).`, where: 'Lemma 3.2' },
  { key: 'duality', topic: 2, level: 'intermediate', origin: 'paper', term: 'Crossing duality',
    text: R`The least-norm point $P$ of the convex hull of left-to-right incidence vectors has $\operatorname{Mod}_{LR}=\|P\|^{-2}$, and $\rho=P$ blocks top-to-bottom paths (Lemma 3.3, Figure 4).`, where: 'Lemma 3.3' },
  { key: 'envelopes', topic: 3, level: 'specialized', origin: 'paper', term: R`Envelopes $F_N$, $H_N$`,
    text: R`$F_N(x)$ is the least maximum of $U_N^0$ along paths from $x$ to the top; $H_N(x)$ the greatest minimum of $F_N$ along paths from $x$ to the bottom. They make level sets separate without increasing oscillation (Lemma 3.4, Figure 5).`, where: 'Lemma 3.4' },
  { key: 'levelcontinuum', topic: 3, level: 'intermediate', origin: 'paper', term: R`Level continuum $C_{N,t}$, $C_t$`,
    text: R`A lateral continuum inside $\{H_N=t\}$ of diameter at least $d_1$, met by every path straddling $t$; $C_t$ is its limit for $u$.`, where: 'Lemma 3.4' },
  { key: 'osc', topic: 3, level: 'basic', origin: 'paper', term: 'Oscillation',
    text: R`$\operatorname{osc}_Af=\sup_Af-\inf_Af$.`, where: 'Lemma 3.4' },
  { key: 'energy', topic: 3, level: 'intermediate', origin: 'paper', term: R`Local oscillation energy $\mathcal E_n^{(J)}$`,
    text: R`$\sum_q\bigl(\operatorname{osc}_{\overline B(q,Jr_n)}f\bigr)^2$ over cells meeting $K$. For $H_N$ and each fixed translate it is $O(1/M(N))$ (Lemma 3.5).`, where: 'Lemma 3.5' },
  { key: 'scalarlimit', topic: 3, level: 'intermediate', origin: 'paper', term: R`Scalar limit $u$, measure $\mu$`,
    text: R`The locally uniform limit of the $H_N$ and the weak limit of $\mu_N=M(N)\sum\rho_q^2\delta_q$, with $(\operatorname{osc}u)^2\le C\mu$ on balls, (3.6).`, where: 'Proposition 3.7' },
  { key: 'holder', topic: 4, level: 'basic', origin: 'background', term: 'Hölder continuity',
    text: R`$|f(x)-f(y)|\le Cd(x,y)^\alpha$ locally. Exponential records make $u$ Hölder with exponent $\log\lambda/(2\log a)$.`, where: 'Proposition 3.7' },
  { key: 'magnification', topic: 4, level: 'intermediate', origin: 'paper', term: 'Magnification',
    text: R`The rescaled transforms $(f\circ h_i^{-1}-f(x_i))/\sigma_i$ of (4.1), converging off a puncture $b$ to a nonconstant $F$.`, where: 'Lemma 4.1' },
  { key: 'variationset', topic: 4, level: 'basic', origin: 'paper', term: R`$\mathcal N(F)$`,
    text: R`The points where a continuous function is not locally constant.`, where: 'Lemma 4.3' },
  { key: 'node', topic: 5, level: 'intermediate', origin: 'paper', term: 'Node, candidate',
    text: R`A node is a center $x$, scale $R$ and value interval $J$ with (5.2). Candidates are an $r$-net, $r=\theta R$, in an annulus around $x$; each carries a child interval of relative length $t_y$.`, where: '(5.2)' },
  { key: 'good', topic: 5, level: 'intermediate', origin: 'paper', term: 'Good node',
    text: R`One with two candidates varying in the bottom and top quarters of $J$ whose outer ranges are $\Delta/4$ apart, (5.5)–(5.6): two separated regions of variation.`, where: '(5.5)' },
  { key: 'flow', topic: 5, level: 'intermediate', origin: 'paper', term: 'Probability flow',
    text: R`Transition probabilities on children obeying (5.8)–(5.9); $P_i$ is the product along the branch to node $i$, and each generation has total probability one.`, where: '(5.21)' },
  { key: 'pattern', topic: 5, level: 'specialized', origin: 'paper', term: 'Pattern',
    text: R`The ordered pair of target balls, from a fixed finite list, into which a good node's two variations expand (5.18).`, where: '(5.18)' },
  { key: 'farpair', topic: 5, level: 'intermediate', origin: 'paper', term: 'Far pair',
    text: R`Two nodes of one class whose punctures are at distance more than $a^{-l}$, (6.5). At least $c\mathcal N^2$ pairs are far.`, where: '(6.5)' },
  { key: 'costball', topic: 5, level: 'specialized', origin: 'paper', term: R`Cost ball $\mathcal D_{ij}$`,
    text: R`The ball $\overline B(z_{ij},C_\mu s_{ij})$, $s_{ij}=C_2R^2/d_{ij}^2$, around the preimage of the partner's puncture. It carries $\mu$-mass at least $c\kappa^2\Delta_i^2$ (6.10) and maps into $\overline B(p_j,C_3R)$ (6.11).`, where: '(6.9)' },
];

// ───────────────────────── notation ─────────────────────────
// rows: [symbol, meaning, first appearance, note ('Not …', 'Also …', 'Distinct …' mark a clash)]
export const NOTATION_GROUPS = [
  { title: 'Boundary geometry (§2)', rows: [
    [R`$G,\ \Gamma,\ e,\ |v|$`, 'the group, its Cayley graph, the identity vertex, word length', '§2', ''],
    [R`$Z=\partial G$, $d$`, 'the boundary with a visual metric', '(2.1)', ''],
    [R`$(y|z)_o$`, 'Gromov product based at $o$', '§2', ''],
    [R`$a,\ r_k=a^{-k},\ C_v$`, 'visual parameter, scale $k$, visual constant', '(2.1)', ''],
    [R`$v,\ h=v^{-1},\ R=r_k$`, 'a depth-$k$ vertex on a ray to $x$, the expansion, its scale', 'Lemma 2.1', ''],
    [R`$D_y$`, R`$\max\{R,d(x,y)\}$, the expansion denominator`, 'Lemma 2.1', R`Distinct from the subdivision depth $D$ (§5), the continua $D_t$ (Lemma 3.8) and the cost balls $\mathcal D_{ij}$ (§6).`],
    [R`$c_E,\ C_E$`, 'expansion constants', '(2.2)', ''],
    [R`$z_0,\ p=hz_0$`, 'a far point and its image, the puncture', '(2.3)', ''],
    [R`$Q,\ C_P$`, 'packing exponent and constant', 'Lemma 2.3', R`Not the rectangle $\mathcal Q$ (§3).`],
    [R`$L$`, 'controlled-path constant', 'Lemma 2.4', ''],
    [R`$T_n$`, R`a maximal $r_n$-separated set; cells $B(q,2r_n)$`, '(2.5)', ''],
    [R`$\mathcal F_0,\ d_0,\ M(n)$`, 'macroscopic paths, their minimum diameter, their modulus', '(2.5)', ''],
    [R`$\psi,\ \mathcal C_x,\ q$`, 'the uniformizing map, conformal structures at $x$, the invariant structure', 'Proposition 2.6', R`Also $q\in T_n$ names net points.`],
  ] },
  { title: 'The scalar limit (§3)', rows: [
    [R`$\lambda$`, R`$\gt1$ in the exponential case, $=1$ in the subexponential one`, '(3.1)', ''],
    [R`$N$`, 'a record index', '(3.1)', R`Not the class size $\mathcal N$ or the variation set $\mathcal N(F)$.`],
    [R`$\mathcal Q,\ \widehat{\mathcal Q}$`, R`$[0,1]^2\subset[0,1]\times[-1,2]$, coordinate rectangles; $y=0$ is the top`, 'Lemma 3.1', ''],
    [R`$\rho_q$`, 'dual weights, admissible for top-to-bottom crossings', 'Lemma 3.3', ''],
    [R`$b_N,\ U_N^0,\ F_N,\ H_N$`, 'path cost, its interpolant, the two envelopes', 'Lemma 3.4', R`Not the separation constant $H$ (§5).`],
    [R`$C_{N,t},\ C_t,\ d_1$`, 'level continua and their minimum diameter', 'Lemma 3.4', R`Not the generic constant $C$.`],
    [R`$U$`, R`the interior of $\widehat{\mathcal Q}$ in $Z$`, 'Lemma 3.5', R`Not $U_N^0$.`],
    [R`$\mathcal E_n^{(J)}(f;K)$`, 'local oscillation energy', 'Lemma 3.5', R`Distinct from $E$ (a stabilizer), $E_i$ (puncture balls) and $E_0$ (the energy budget).`],
    [R`$\mu_N,\ \mu,\ C_\mu$`, 'the measures and the enlargement constant', 'Proposition 3.7', ''],
    [R`$u$`, 'the scalar limit', 'Proposition 3.7', ''],
    [R`$f,\ w,\ D_t,\ b_0,\ I$`, 'the two functions, level continua, oscillation floor, value interval', 'Lemma 3.8', ''],
  ] },
  { title: 'Exponential records (§4)', rows: [
    [R`$F_i,\ \sigma_i,\ k_i,\ x_i$`, 'magnified functions, normalizations, depths, centers', '(4.1)', R`Also $F_i=u\circ h_i^{-1}$ in §6.`],
    [R`$W,\ b$`, 'the magnified limit of $u$ and its puncture', 'Lemma 4.2', ''],
    [R`$f_j,\ N_j,\ D_{j,t}$`, 'diagonal approximants, their indices, their level continua', 'Lemma 4.2', ''],
    [R`$\mathcal N(F)$`, 'where $F$ is not locally constant', 'Lemma 4.3', ''],
    [R`$V,\ c,\ W_s,\ p_s$`, 'transforms and their punctures', 'Lemma 4.3', ''],
    [R`$E=\operatorname{Stab}_G(b)$`, 'the stabilizer of a point', 'Lemma 4.4', ''],
  ] },
  { title: 'The flow and pairs (§5–6)', rows: [
    [R`$x,\ R,\ J,\ \Delta$`, 'a node: center, scale, value interval, its length', '(5.2)', ''],
    [R`$D,\ \theta=a^{-D},\ r=\theta R$`, 'subdivision depth and child scale', '§5', R`Not $D_y$.`],
    [R`$c_0,\ A,\ B_0,\ H,\ c_{\rm pat}$`, 'geometric constants', '(5.10)', R`Also $A$ is an ancestor node in Lemma 6.3.`],
    [R`$Y,\ t_y,\ J_y,\ I_y^{\rm in},\ I_y^{\rm out}$`, 'candidates, relative child lengths, child intervals, range intervals', '(5.3)', ''],
    [R`$\kappa,\ b_*,\ \tau,\ \beta,\ \gamma$`, 'goodness threshold and exponents', '(5.7)', ''],
    [R`$p_y,\ P_i,\ m_i,\ E_0$`, 'transition probabilities, branch probabilities, bad ancestors, energy budget', '(5.21)', R`Not the punctures $p_i$.`],
    [R`$k,\ l,\ m,\ \zeta$`, R`depth $k_0+Dn$, puncture scale $l=Dm$, $m=\lfloor\zeta n\rfloor$`, '§6', ''],
    [R`$\mathcal I,\ \mathcal N,\ P_*$`, 'a probability class, its size, its probability level', '(6.2)', ''],
    [R`$d_{ij},\ E_i,\ A_h$`, 'puncture distance, puncture balls, their radius factor', '(6.5)', ''],
    [R`$z_{ij},\ s_{ij},\ \mathcal D_{ij}$`, 'pulled-back puncture, cost radius, cost ball', '(6.8)', ''],
  ] },
];

// ───────────────────────── cited results ─────────────────────────
export const CITED = [
  { key: 'bk', name: 'Bonk–Kleiner uniformization, in Bourdon–Kleiner\'s form', who: 'Bonk–Kleiner, Invent. Math. 2002 (their Theorem 10.4); Bourdon–Kleiner, Groups Geom. Dyn. 2013 (their Corollary 3.5)',
    statement: R`On an arcwise connected, approximately self-similar metric $2$-sphere, if the combinatorial $2$-modulus of paths of diameter at least a sufficiently small $d_0$ is bounded uniformly over a sequence of approximations, the sphere is quasi-Möbius equivalent to the round sphere.`, used: 'Theorem 2.5' },
  { key: 'sullivan', name: 'Invariant conformal structures', who: 'Sullivan (Stony Brook conference 1978, published 1981); Tukia, 1980',
    statement: R`A group of uniformly quasiconformal maps of the sphere preserves a bounded measurable conformal structure, built pointwise as the circumcenter of the orbit of the round structure in the hyperbolic plane of structures; so it is quasiconformally conjugate to a group of Möbius and anti-Möbius maps.`, used: 'Proposition 2.6' },
  { key: 'ahlforsbers', name: 'Measurable Riemann mapping theorem', who: 'Ahlfors–Bers, Ann. of Math. 1960',
    statement: R`Every bounded measurable conformal structure on the sphere is the pullback of the round one by a quasiconformal homeomorphism.`, used: 'Proposition 2.6' },
  { key: 'hk', name: 'Metric definition of quasiconformality', who: 'Heinonen–Koskela, Invent. Math. 1995; Astala–Iwaniec–Martin, 2009',
    statement: R`A homeomorphism of planar domains with bounded infinitesimal metric distortion is quasiconformal.`, used: 'Proposition 2.6' },
  { key: 'bh', name: 'Visual metrics and thin ideal triangles', who: 'Bridson–Haefliger, III.H.3',
    statement: R`The boundary of a hyperbolic group carries visual metrics comparable to $a^{-(y|z)_e}$ for $a\gt1$ close to $1$; ideal triangles are uniformly thin; Gromov products satisfy $(y|z)\ge\min\{(y|w),(w|z)\}-O(1)$.`, used: 'Lemma 2.1, Lemma 2.2, Lemma 4.4' },
  { key: 'jordan', name: 'Jordan curve theorem', who: 'classical',
    statement: R`A simple closed curve separates the plane into two components. Used in the form: a simple top-to-bottom arc separates the lateral edges of a rectangle.`, used: 'Lemma 3.2' },
  { key: 'duality', name: 'Discrete extremal-length duality', who: 'Cannon–Floyd–Parry, 1994; Albin–Poggi-Corradini, 2016',
    statement: R`The modulus of a family of crossings is the inverse squared norm of the least-norm point in the convex hull of their incidence vectors. The paper reproves this for its cells as Lemma 3.3.`, used: 'Lemma 3.3' },
  { key: 'agol', name: 'Virtual fibering, specialness, cubulation', who: 'Agol, Doc. Math. 2013; Bergeron–Wise, Amer. J. Math. 2012',
    statement: R`A closed hyperbolic $3$-manifold has a finite cover fibering over the circle; its group acts properly and cocompactly on a CAT(0) cube complex and is virtually compact special, hence residually finite.`, used: 'Corollary 8.2' },
];

export const SLIPS = [];

// ───────────────────────── reading guide ─────────────────────────
export const GUIDE_HTML = R`<h3 class="cmp-h3" id="guide-parts">Status of each part</h3>
<div class="table-scroll"><table class="params">
<tr><th>Part</th><th>Status</th><th>Where the weight sits</th></tr>
<tr><td>§2: Lemmas 2.1–2.4, (2.5)</td><td>routine</td><td>Lemma 2.1's control of the complement (the puncture) is used everywhere later.</td></tr>
<tr><td>Theorem 2.5, Proposition 2.6</td><td>cited, hypotheses checked</td><td>Matching the cells to Bourdon–Kleiner's approximations; keeping orientation-reversing elements.</td></tr>
<tr><td>Lemmas 3.1–3.3</td><td>classical, reproved</td><td>Discrete duality on the paper's cells.</td></tr>
<tr><td>Lemma 3.4</td><td>new</td><td>The envelopes $F_N$, $H_N$: separating level continua without losing the oscillation bound.</td></tr>
<tr><td>Lemmas 3.5–3.6, Proposition 3.7</td><td>new</td><td>Vanishing energy after every fixed translate; records in the annular estimate.</td></tr>
<tr><td>Lemma 3.8</td><td>new, elementary</td><td>The engine of both contradictions.</td></tr>
<tr><td>§4</td><td>new</td><td>The order of choices in Lemma 4.2; distinct punctures via Lemma 4.4.</td></tr>
<tr><td>§5</td><td>new</td><td>Lemma 5.2, the only use of subexponential growth inside the tree; the Jensen budget of Lemma 5.3.</td></tr>
<tr><td>§6</td><td>new</td><td>Lemma 6.3's word splitting; the scale separation (6.8)–(6.12); the final count (6.13)–(6.14).</td></tr>
<tr><td>§8</td><td>cited</td><td>Agol; Bergeron–Wise.</td></tr>
</table></div>
<h3 class="cmp-h3" id="guide-ways">Three ways through the paper</h3>
<ol>
<li><b>The reduction only.</b> §1, Lemma 2.1, (2.5), Theorem 2.5 and Proposition 2.6, with Figures 1 and 2: what has to be proved, and why it suffices.</li>
<li><b>The analytic core.</b> §3 in order, with Figures 3–6, then Lemma 4.3 and Lemma 6.4, the two places Lemma 3.8 is applied.</li>
<li><b>Checking the argument.</b> Lemma 3.4, Lemma 3.5, Lemma 4.2, Lemma 5.2, Lemma 5.3 and Lemma 6.3 carry the new weight. Read their proofs in the PDF with Figures 5, 7 and 8 open.</li>
</ol>
<p>Neither branch is a formality. The exponential branch (§4) is short but depends on the order of limits in Lemma 4.2. The subexponential branch (§5–§6) is long and quantitative; its constants are chosen in a careful order (geometry, then $D$, then the root scale), and that order is worth checking.</p>`;

export const TEXT = {
  kicker: "Cannon's Conjecture · companion",
  trace: 'Trace what Theorem 1.1 rests on',
  intro: {
    defs: 'Every definition the paper makes, and the background it assumes. Filter by level — <b>basic</b> (a first course in metric spaces), <b>intermediate</b> (geometric group theory), <b>specialized</b> (quasiconformal analysis) — or search.',
    notation: 'Every symbol in the paper, where it first appears, and where the paper uses one letter for two things (marked <span class="clash">clash</span>). The letter $D$ alone has four meanings.',
    cited: 'The results the paper takes from elsewhere, with where each one is used. The deep ones are Bonk–Kleiner uniformization and the Sullivan–Tukia conformal structure; everything new is in §3–§6.',
  },
};
