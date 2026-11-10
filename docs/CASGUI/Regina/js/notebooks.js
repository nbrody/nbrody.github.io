// The example notebooks. Text cells are Markdown with $...$ math; code cells
// run against the API in nbapi.js (see the reference in notebook.js).

const md = (s) => ({ md: (s.raw ? String.raw(s) : s).replace(/\\`/g, '`') });
const code = (s) => ({ code: s.raw ? String.raw(s) : s });

export const NOTEBOOKS = [
  {
    id: 'poincare',
    title: 'The Poincaré homology sphere',
    blurb: 'Same homology as $S^3$, different manifold. Build it, find its fundamental group’s subgroups, and tell it apart from the sphere three ways.',
    tags: ['homology', 'covers', 'Turaev–Viro'],
    cells: [
      md`In 1900 Poincaré conjectured that a closed 3-manifold with the homology of the 3-sphere *is* the 3-sphere. Four years later he found a counterexample, the manifold below, and replaced homology by the fundamental group in what became the Poincaré conjecture.

Run the cells in order with **Shift+Enter**, or press **Run all** above.`,
      code`const P = await tri('poincare')
P`,
      md`Regina triangulates it with five tetrahedra. Its first homology vanishes, exactly like the 3-sphere's:`,
      code`const S = await tri('threeSphere')
show(P.homology(), S.homology())`,
      md`## The fundamental group

The difference is in $\pi_1$. Regina finds a two-generator presentation. The group is the binary icosahedral group, of order 120, which Regina's group recognition does not name.`,
      code`P.group()`,
      md`A way to see that a group is nontrivial: find its subgroups of small index. A subgroup of index $k$ is the same thing as a connected $k$-sheeted cover, and the homology of each cover is an invariant we can compute.

The binary icosahedral group maps onto $A_5$, which acts on five points. The stabilizer of a point pulls back to an index-5 subgroup, the binary tetrahedral group, whose abelianization is $\mathbb{Z}_3$:`,
      code`P.covers(5)`,
      code`P.covers(6)`,
      md`The 3-sphere is simply connected, so it has no connected covers at all:`,
      code`S.covers(5)`,
      md`## Regina's own tests

Regina recognizes this triangulation by name. It can also *decide* whether a triangulation is the 3-sphere, using the Rubinstein–Thompson algorithm and normal surface theory:`,
      code`P.recognize()`,
      code`({ 'Poincaré sphere': P.isSphere(), '3-sphere': S.isSphere() })`,
      md`## A quantum invariant

Turaev–Viro invariants are computed from a triangulation as a state sum, yet don't depend on the triangulation. At $r = 3, 4, 6$ they agree for these two manifolds; at $r = 5$ and $r = 7$ they don't.`,
      code`table([3, 4, 5, 6, 7].map(r => ({
  r,
  'Poincaré sphere': P.turaevViro(r).value,
  '3-sphere': S.turaevViro(r).value,
})))`,
      md`The exact values live in a cyclotomic field:`,
      code`P.turaevViro(5)`,
    ],
  },

  {
    id: 'figure-eight',
    title: 'The figure-eight knot, from diagram to geometry',
    blurb: 'Polynomials, the knot complement, regular ideal tetrahedra, symmetries, and the Gieseking manifold hiding underneath.',
    tags: ['knots', 'hyperbolic', 'symmetry'],
    cells: [
      md`The figure-eight knot is the simplest knot after the trefoil, and the simplest hyperbolic one. This notebook goes from its diagram to the hyperbolic geometry of its complement.`,
      code`const K = await link('figureEight')
K.diagram()`,
      md`## Polynomials

Mirroring a knot replaces $t$ by $t^{-1}$ in the Jones polynomial. The figure-eight knot is isotopic to its mirror image, so its Jones polynomial must be symmetric:`,
      code`K.jones()`,
      code`K.jones().equals(K.mirror().jones())`,
      code`show(K.alexander(), K.homfly())`,
      md`## The complement

Regina triangulates the complement $S^3 \setminus K$ with two ideal tetrahedra, whose vertices are removed. The result is a census manifold: it is $\mathtt{m004}$ in the cusped census, and $\mathtt{L104001}$ (one component, four crossings) in Christy's knot table.`,
      code`const C = await K.complement()
C.census()`,
      md`SnapPea, inside Regina, finds the complete hyperbolic structure. Each tetrahedron has shape $z = \tfrac12 + \tfrac{\sqrt3}{2}i = e^{i\pi/3}$, so both are *regular* ideal tetrahedra.`,
      code`C.hyperbolic()`,
      md`A regular ideal tetrahedron has the largest volume of any ideal tetrahedron, $3\Lambda(\pi/3) \approx 1.0149416$. So the volume of the complement is twice that:`,
      code`({ 'Volume of the complement': C.volume(), 'Twice the regular tetrahedron': 2 * 1.0149416064096536 })`,
      md`## Symmetries

For a cusped hyperbolic manifold, SnapPea computes the canonical (Epstein–Penner) cell decomposition. Its combinatorial automorphisms are exactly the isometries of the manifold. Half of the eight isometries reverse orientation, which confirms again that the knot is amphichiral.`,
      code`C.symmetries()`,
      md`## The Gieseking manifold

The Gieseking manifold is built from a *single* regular ideal tetrahedron, and it is non-orientable. Its orientable double cover is the figure-eight knot complement, and not just up to homeomorphism: Regina builds exactly the same triangulation.`,
      code`const G = await tri('gieseking')
G.doubleCover().isIsomorphicTo(C)`,
      md`## Taut angle structures

A taut angle structure puts angles $0$ or $\pi$ on each edge of each tetrahedron. One of the three on $\mathtt{m004}$ is *veering*, which is the start of Agol's theory of veering triangulations.`,
      code`C.angles({ taut: true })`,
    ],
  },

  {
    id: 'surgery',
    title: 'Dehn surgery on the figure-eight knot',
    blurb: 'Fill the cusp along every small slope, find the ten exceptional ones, and watch volumes converge, as Thurston’s hyperbolic Dehn surgery theorem predicts.',
    tags: ['Dehn filling', 'hyperbolic', 'plots'],
    cells: [
      md`Remove a neighborhood of a knot and glue a solid torus back in so that its meridian goes to the curve $p\mu + q\lambda$ on the boundary torus. This is $p/q$ Dehn surgery, written $M(p, q)$. Thurston proved that for a hyperbolic knot all but finitely many surgeries give closed hyperbolic manifolds.

On $\mathtt{m004}$, SnapPea's meridian and longitude are the knot's own, so $(1, 0)$ glues the solid torus back the way it was and gives back $S^3$:`,
      code`const C = await census('m004')
C.fill(1, 0).isSphere()`,
      md`## Many fillings at once

\`fillings\` asks SnapPea for the hyperbolic structure on each filled manifold, without building triangulations. \`slopes(6, 3)\` lists the coprime pairs $(p, q)$ with $|p| \le 6$ and $1 \le q \le 3$, plus $(1, 0)$.`,
      code`const F = await C.fillings(slopes(6, 3))
F`,
      md`The first homology of $M(p, q)$ is always $\mathbb{Z}_{|p|}$. The slopes where SnapPea finds no hyperbolic structure are the **exceptional** slopes. For the figure-eight knot there are exactly ten: $\infty$, $0$, $\pm1$, $\pm2$, $\pm3$, $\pm4$.`,
      code`F.filter(r => r.type !== 'geometric').map(r => r.slope)`,
      md`## Volumes converge

Volume goes down under filling, and $\operatorname{vol} M(p, q) \to \operatorname{vol} M$ as $p^2 + q^2 \to \infty$. Here are about a hundred more fillings, colored by the denominator $q$. The picture is symmetric because the knot is amphichiral: $M(p, q)$ and $M(-p, q)$ are mirror images. Hover over a point to see its slope.`,
      code`const G = await C.fillings(slopes(20, 4))
const byQ = {}
for (const r of G.filter(r => r.volume && r.l > 0)) {
  const key = 'q = ' + r.l
  byQ[key] = byQ[key] || []
  byQ[key].push([r.m / r.l, r.volume, '(' + r.m + ', ' + r.l + ')'])
}
plot(byQ, {
  x: 'slope $p/q$',
  y: 'volume',
  hlines: [{ y: 2.029883212819307, label: 'volume of m004' }],
})`,
      md`## The smallest closed hyperbolic manifolds

The Hodgson–Weeks census lists closed hyperbolic manifolds in order of volume. The smallest is the Weeks manifold, $\mathtt{m003}(-3, 1)$; Gabai, Meyerhoff and Milley proved that nothing has smaller volume. The second smallest is the Meyerhoff manifold.`,
      code`const small = await censusList('closed-hyperbolic', 5)
table(small.map(M => ({
  volume: Number(M.name.split(' : ')[0]),
  filling: M.name.split(' : ')[1],
  homology: M.homology(),
})))`,
      md`The Meyerhoff manifold is also $5/1$ surgery on the figure-eight knot. The volume matches the census entry, and so does the homology:`,
      code`C.fillings([[5, 1], [-5, 1]])`,
      md`Both of these fillings give the Meyerhoff manifold, with opposite orientations, because the figure-eight knot is amphichiral. To see the Weeks manifold, fill the census manifold $\mathtt{m003}$:`,
      code`census('m003').fillings([[-3, 1]])`,
    ],
  },

  {
    id: 'lens-spaces',
    title: 'Lens spaces: homotopy is not homeomorphism',
    blurb: 'Lens spaces with the same fundamental group, some homotopy equivalent and still different. Turaev–Viro invariants tell them apart.',
    tags: ['lens spaces', 'Turaev–Viro', 'classification'],
    cells: [
      md`The lens space $L(p, q)$ is the quotient of $S^3 \subset \mathbb{C}^2$ by $(z, w) \mapsto (\zeta z, \zeta^q w)$ with $\zeta = e^{2\pi i/p}$. Its fundamental group is $\mathbb{Z}_p$ whatever $q$ is. The classical facts:

- $L(p, q) \cong L(p, q')$ exactly when $q' \equiv \pm q^{\pm 1} \pmod p$ (Reidemeister, Brody);
- they are homotopy equivalent exactly when $qq' \equiv \pm n^2 \pmod p$ for some $n$ (Whitehead).`,
      code`const Ls = await all([lens(5, 1), lens(5, 2), lens(7, 1), lens(7, 2), lens(7, 3)])
table(Ls.map(L => ({
  space: L,
  tetrahedra: L.size,
  homology: L.homology(),
  fundamentalGroup: L.group().name,
})))`,
      md`Homology and the fundamental group see no difference. Turaev–Viro invariants do:`,
      code`table(Ls.map(L => ({
  space: L,
  r5: L.turaevViro(5).value,
  r7: L.turaevViro(7).value,
})), { headers: ['', '$\\mathrm{TV}_5$', '$\\mathrm{TV}_7$'] })`,
      md`Reading the table:

- $L(5,1)$ and $L(5,2)$ differ at $r = 5$. They are not even homotopy equivalent: $\pm 2$ is not a square mod 5.
- $L(7,1)$ and $L(7,2)$ differ at $r = 7$. They *are* homotopy equivalent, since $1 \cdot 2 \equiv 3^2 \pmod 7$. So the invariant sees more than homotopy type.
- $L(7,2)$ and $L(7,3)$ agree. They are homeomorphic, because $3 \equiv -2^{-1} \pmod 7$.

For the last pair, Regina's layered construction even produces the identical triangulation:`,
      code`Ls[3].isIsomorphicTo(Ls[4])`,
      md`## More lens spaces

Try your own: edit the list and run the cell again. Larger $r$ distinguishes more pairs, but the cost grows quickly with $r$.`,
      code`const more = await all([lens(11, 1), lens(11, 2), lens(11, 3)])
table(more.map(L => ({ space: L, r5: L.turaevViro(5).value, r6: L.turaevViro(6).value })),
  { headers: ['', '$\\mathrm{TV}_5$', '$\\mathrm{TV}_6$'] })`,
    ],
  },

  {
    id: 'mutants',
    title: 'Mutants: Conway and Kinoshita–Terasaka',
    blurb: 'Two 11-crossing knots with identical polynomials and identical hyperbolic volumes. Canonical triangulations and covers of index 6 tell them apart.',
    tags: ['knots', 'mutation', 'covers'],
    cells: [
      md`Cut a knot diagram along a circle meeting it in four points, rotate the inside by a half turn, and glue back. This is **mutation**. The Conway knot and the Kinoshita–Terasaka knot are mutants of each other.`,
      code`const Cw = await link('conway'), KT = await link('kinoshitaTerasaka')
show(Cw.diagram(), KT.diagram())`,
      md`## Polynomials can't tell them apart

Mutation preserves the Jones, Alexander and HOMFLY-PT polynomials. Here the Alexander polynomial is even trivial, as it is for the unknot.`,
      code`({
  'Same Jones polynomial': Cw.jones().equals(KT.jones()),
  'Same Alexander polynomial': Cw.alexander().equals(KT.alexander()),
  'Same HOMFLY-PT polynomial': Cw.homfly().equals(KT.homfly()),
})`,
      code`show(Cw.alexander(), Cw.jones())`,
      md`## Neither can volume

Mutation along a Conway sphere also preserves hyperbolic volume (Ruberman).`,
      code`const CC = await Cw.complement(), KC = await KT.complement()
({ 'Conway': CC.volume(), 'Kinoshita–Terasaka': KC.volume() })`,
      md`## Canonical triangulations can

The canonical triangulation of a cusped hyperbolic manifold depends only on the manifold. By Mostow rigidity, two such manifolds are homeomorphic exactly when their canonical triangulations are isomorphic. These differ, so the complements are different, and by Gordon–Luecke so are the knots.`,
      code`CC.isIsometricTo(KC)`,
      code`show(CC.canonical(), KC.canonical())`,
      md`## So can covers

The knot groups are different too. Counting subgroups of each index (each with the homology of its cover) separates them at index 6.`,
      code`table([2, 3, 4, 5, 6].map(k => ({
  index: k,
  'Conway': Cw.covers(k).count,
  'Kinoshita–Terasaka': KT.covers(k).count,
  'Same homology of covers': Cw.covers(k).equals(KT.covers(k)),
})))`,
      md`Genus also distinguishes them: Gabai showed the Conway knot has genus 3 and the Kinoshita–Terasaka knot genus 2. Whether the Conway knot is slice was open until Piccirillo proved in 2018 that it is not.`,
    ],
  },

  {
    id: 'granny-square',
    title: 'The granny knot and the square knot',
    blurb: 'Two connected sums of trefoils with isomorphic knot groups. The Jones polynomial separates them even though no cover can.',
    tags: ['knots', 'connected sum', 'groups'],
    cells: [
      md`The **granny knot** is the connected sum of two trefoils of the same handedness; the **square knot** (reef knot) uses a trefoil and its mirror image.`,
      code`const T = await link('trefoilRight')
const granny = await T.connectedSum(T).as('Granny knot')
const square = await T.connectedSum(T.mirror()).as('Square knot')
show(granny.diagram(), square.diagram())`,
      md`## Alexander agrees, Jones doesn't

The Alexander polynomial can't see mirror images, so both are $\Delta_{3_1}(t)^2$. The Jones polynomial can.`,
      code`({
  alexander: granny.alexander().equals(square.alexander()),
  jones: granny.jones().equals(square.jones()),
})`,
      code`show(granny.jones(), square.jones())`,
      md`The square knot is its own mirror image, and its Jones polynomial is symmetric under $t \leftrightarrow t^{-1}$:`,
      code`({ square: square.jones().equals(square.mirror().jones()), granny: granny.jones().equals(granny.mirror().jones()) })`,
      md`## The groups are isomorphic

Both knot groups are an amalgam of two copies of the trefoil group along $\mathbb{Z}$, and the two amalgams are isomorphic. So any invariant of the group alone, such as the number of subgroups of each index and the homology of the corresponding covers, must agree:`,
      code`table([2, 3, 4, 5].map(k => ({
  index: k,
  granny: granny.covers(k).count,
  square: square.covers(k).count,
  'Same homology of covers': granny.covers(k).equals(square.covers(k)),
})))`,
      md`The complements are still not homeomorphic: the meridian and longitude, the *peripheral structure*, sit differently in the two groups. Composite knots are not hyperbolic, so the canonical triangulation test of the mutants notebook doesn't apply. SnapPea finds no hyperbolic structure:`,
      code`({ granny: granny.complement().volume(), square: square.complement().volume() })`,
    ],
  },

  {
    id: 'unknotting',
    title: 'Is it the unknot? Braids and recognition',
    blurb: 'Untangle the monster unknot, meet a knot with trivial Alexander polynomial, and build knots as closures of braids.',
    tags: ['unknot', 'braids', 'algorithms'],
    cells: [
      md`Deciding whether a diagram is the unknot is a hard problem, but it is decidable (Haken): a knot is trivial exactly when its complement is a solid torus, and normal surface theory can find the disc that proves it.

Here is a diagram of the unknot with ten crossings that can't be untangled without first making it more complicated:`,
      code`const monster = await link('monster')
monster.diagram()`,
      code`monster.jones()`,
      md`A trivial Jones polynomial is suggestive, but nobody knows whether the Jones polynomial detects the unknot. Regina's simplification, which uses Reidemeister moves and searches through larger diagrams when it gets stuck, finds the untangling:`,
      code`monster.simplify()`,
      md`And the decision procedure, which doesn't depend on finding a good diagram:`,
      code`monster.isUnknot()`,
      md`## A knotted knot with trivial Alexander polynomial

The Whitehead double of the trefoil has Alexander polynomial $1$, like the unknot. Its complement is not a solid torus, though:`,
      code`const W = await link('trefoilRight').whiteheadDouble()
({ crossings: W.crossings, alexander: W.alexander(), isUnknot: W.isUnknot() })`,
      md`## Braids

Every knot is the closure of a braid (Alexander). Write $\sigma_i$ as \`i\` and $\sigma_i^{-1}$ as \`-i\`. The closure of $\sigma_1\sigma_2^{-1}\sigma_1\sigma_2^{-1}$ is the figure-eight knot:`,
      code`const b = await braid('1 -2 1 -2')
show(b.diagram(), b.jones().equals(link('figureEight').jones()))`,
      md`The closure of $(\sigma_1\sigma_2\cdots\sigma_{p-1})^q$ is the torus knot $T(p, q)$. Compare with Regina's own torus knots:`,
      code`const torusBraid = (p, q) => braid(range(q).flatMap(() => range(1, p)))
table([[2, 3], [2, 5], [3, 4], [3, 5], [2, 7]].map(([p, q]) => ({
  knot: tex('T(' + p + ',' + q + ')'),
  crossings: torusBraid(p, q).crossings,
  sameJones: torusBraid(p, q).jones().equals(torusKnot(p, q).jones()),
})))`,
      md`Torus knot complements are Seifert fibered, not hyperbolic. Their groups have the presentation $\langle a, b \mid a^p = b^q \rangle$, and Regina's simplified presentation shows exactly that:`,
      code`torusKnot(3, 5).complement().group()`,
    ],
  },

  {
    id: 'normal-surfaces',
    title: 'Normal surfaces and boundary slopes',
    blurb: 'Enumerate the vertex normal surfaces of the 3-torus, cut along an incompressible torus, and read off the boundary slopes of spun-normal surfaces.',
    tags: ['normal surfaces', 'Haken', 'boundary slopes'],
    cells: [
      md`A normal surface meets each tetrahedron in triangles and quadrilaterals. Haken and Kneser showed that the interesting surfaces in a 3-manifold (essential spheres, discs and tori) can be put in normal form. The normal surfaces form a cone, so a finite list of **vertex surfaces** generates them, and Regina enumerates these exactly.`,
      code`const T3 = await tri('threeTorus')
const S = await T3.surfaces()
S`,
      md`Apart from the vertex link (the sphere around the single vertex), most of the vertex surfaces of $T^3$ are tori. Some are incompressible, so $T^3$ is Haken:`,
      code`T3.isHaken()`,
      md`## Cutting along a surface

Cutting $T^3$ along a non-separating incompressible torus leaves $T^2 \times I$. Regina retriangulates the result, and its $T^2 \times I$ recognition confirms it:`,
      code`const torus = S.filter(s => s.euler === 0 && s.orientable)[0]
const piece = await torus.cutAlong()
({ tetrahedra: piece.size, isTxI: piece.isTxI() })`,
      md`## 0-efficiency

A triangulation is **0-efficient** if its only normal spheres are vertex links. Jaco and Rubinstein showed that every closed orientable irreducible manifold other than $\mathbb{R}P^3$ has a 0-efficient triangulation. $S^2 \times S^1$ is not irreducible: it contains an essential sphere, which shows up as a normal sphere.`,
      code`({
  '$L(7,1)$': lens(7, 1).isZeroEfficient(),
  'Poincaré sphere': tri('poincare').isZeroEfficient(),
  '$S^2 \times S^1$': tri('s2xs1').isZeroEfficient(),
})`,
      md`## Spun-normal surfaces and boundary slopes

In an ideal triangulation, quadrilateral coordinates also allow *spun-normal* surfaces, which spiral into the cusps. Each meets the cusp torus in curves of a fixed **boundary slope**. Regina computes these with SnapPea's meridian and longitude.

For the figure-eight knot complement, the four vertex spun-normal surfaces have slopes $\pm 4$, the two nonzero boundary slopes of the figure-eight knot.`,
      code`census('m004').surfaces({ coords: 'quad' })`,
      md`The Whitehead link complement has two cusps, so each surface has a slope at each cusp (a dash means the surface misses that cusp):`,
      code`tri('whitehead').surfaces({ coords: 'quad' })`,
    ],
  },

  {
    id: 'census',
    title: 'A walk through the censuses',
    blurb: 'Volumes, homology and symmetry groups of the smallest cusped hyperbolic manifolds and knot complements, as tables and plots.',
    tags: ['census', 'volume', 'plots'],
    cells: [
      md`Regina ships with censuses of small triangulations. The cusped orientable census lists hyperbolic manifolds with at most 9 ideal tetrahedra, ordered by number of tetrahedra, with names like $\mathtt{m004}$ and $\mathtt{s912}$. Here are the first 40, with volume, homology and the order of the isometry group.`,
      code`const cusped = await censusList('cusped', 40)
const rows = await all(cusped.map(M => ({
  manifold: M,
  tetrahedra: M.size,
  volume: M.volume(),
  homology: M.homology(),
  symmetries: M.symmetries().order,
})))
table(rows)`,
      md`$\mathtt{m003}$ and $\mathtt{m004}$ share the smallest volume, $2.0298832\ldots$, the smallest possible for a cusped orientable hyperbolic 3-manifold (Cao and Meyerhoff). Volume is not monotone in the number of tetrahedra, but it tends to grow:`,
      code`plot(rows.map(r => [r.tetrahedra + (Math.random() - 0.5) * 0.3, r.volume, r.manifold.name]), {
  x: 'ideal tetrahedra (jittered)',
  y: 'volume',
})`,
      md`## Knot complements

Christy's census lists the complements of knots and links with up to 10 crossings. A name like $\mathtt{L106002}$ means one component, 6 crossings, entry 2. The \`isAmphichiral\` column asks the canonical triangulation for an orientation-reversing isometry.`,
      code`const knots = await censusList('knots', 15)
table(await all(knots.map(K => ({
  knot: K,
  volume: K.volume(),
  symmetries: K.symmetries().order,
  amphichiral: K.isAmphichiral(),
}))))`,
      md`Which census manifolds have the same volume? Equal volumes often come from mutation or from commensurability. A quick search through the first 200 cusped manifolds:`,
      code`const many = await censusList('cusped', 200)
const vols = await all(many.map(M => M.volume()))
const groups = new Map()
many.forEach((M, i) => {
  const key = vols[i].toFixed(8)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(M.name)
})
table([...groups].filter(([, names]) => names.length > 2)
  .map(([v, names]) => ({ volume: Number(v), count: names.length, manifolds: names.join(', ') })))`,
    ],
  },
];
