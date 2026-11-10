// AutoViz manifest — read by index.html (the gallery) and tools/verify.mjs.
//
// AUTOVIZ_TOPICS: the fixed topic taxonomy used by the gallery filters. Add a topic only
// when a new page genuinely fits none of these (and give it an unused colour).
//
// AUTOVIZ: one entry per page, NEWEST FIRST. The daily run PREPENDS exactly one entry:
//   date    "YYYY-MM-DD" (the file name starts with it)
//   file    name inside days/
//   title   Title Case, ≤ 7 words (matches the page's h1)
//   hook    one sentence, ≤ 16 words: the phenomenon, in plain words
//   topics  1–3 ids from AUTOVIZ_TOPICS, most relevant first
//   v       2 for pages built on kit/ (the gallery embeds them live); omitted for legacy pages
// Thumbnails live at thumbs/<file stem>.webp and are written by tools/verify.mjs.

window.AUTOVIZ_TOPICS = [
  { id: 'groups',        label: 'Group theory',        color: '#6ee7d8' },
  { id: 'hyperbolic',    label: 'Hyperbolic geometry', color: '#86aaff' },
  { id: 'linear',        label: 'Linear groups',       color: '#b49cff' },
  { id: 'numbers',       label: 'Number theory',       color: '#ffb86b' },
  { id: 'topology',      label: 'Topology & knots',    color: '#ff7a93' },
  { id: 'dynamics',      label: 'Dynamics',            color: '#8fe3a0' },
  { id: 'symmetry',      label: 'Symmetry & tilings',  color: '#f3dd9a' },
  { id: 'combinatorics', label: 'Combinatorics',       color: '#6cc7f0' },
];

window.AUTOVIZ = [
  {
    date: "2026-11-09",
    file: "2026-11-09-baumslag-solitar.html",
    title: "The Cayley Graph of BS(1, 2)",
    hook: "One relation folds a tree and a hyperbolic plane into a single group.",
    topics: ["groups", "hyperbolic"],
    v: 2
  },
  {
    date: "2026-11-09",
    file: "2026-11-09-coxeter-growth-salem.html",
    title: "Growth Series and Salem Numbers",
    hook: "Count a reflection group's elements by word length: the growth rate is a very special number.",
    topics: ["symmetry", "groups", "numbers"],
    v: 2
  },
  {
    date: "2026-11-09",
    file: "2026-11-09-24-cell-hurwitz-units.html",
    title: "The 24-Cell and the Hurwitz Units",
    hook: "The 24 unit Hurwitz quaternions are the corners of a perfect four-dimensional solid.",
    topics: ["numbers", "symmetry", "groups"],
    v: 2
  },
  {
    date: "2026-11-09",
    file: "2026-11-09-arctic-circle.html",
    title: "The Arctic Circle of Domino Tilings",
    hook: "A random domino tiling freezes into brick walls outside a perfect circle.",
    topics: ["combinatorics", "dynamics"],
    v: 2
  },
  {
    date: "2026-11-09",
    file: "2026-11-09-euclid-gets-stuck.html",
    title: "Where Euclid's Algorithm Gets Stuck",
    hook: "Domes over a ring of integers leave pits exactly where unique factorization fails.",
    topics: ["numbers", "hyperbolic", "linear"],
    v: 2
  },
  {
    date: "2026-10-07",
    file: "2026-10-07-jorgensen-inequality.html",
    title: "Jørgensen's Inequality",
    hook: "A discrete group cannot have two generators that almost commute.",
    topics: ["hyperbolic", "groups", "dynamics"],
    v: 2
  },
  {
    date: "2026-10-06",
    file: "2026-10-06-lorenz-knots.html",
    title: "Knots in the Lorenz Attractor",
    hook: "Every periodic orbit of the Lorenz flow is a knot, and a positive braid.",
    topics: ["dynamics", "topology"],
    v: 2
  },
  {
    date: "2026-10-01",
    file: "2026-10-01-thompson-tree-pairs.html",
    title: "Thompson's Group F",
    hook: "Two binary trees with matching leaves make a piecewise-linear map of [0, 1].",
    topics: ["groups", "combinatorics"],
    v: 2
  },
  {
    date: "2026-09-29",
    file: "2026-09-29-hecke-groups.html",
    title: "Hecke Groups",
    hook: "Slide by λ, then flip: the copies tile only at magic values of λ.",
    topics: ["hyperbolic", "numbers"],
    v: 2
  },
  {
    date: "2026-09-29",
    file: "2026-09-29-coxeter-plane.html",
    title: "The Coxeter Plane",
    hook: "Every finite reflection group hides one plane where it is simply a rotation.",
    topics: ["symmetry", "linear"],
    v: 2
  },
  {
    date: "2026-09-25",
    file: "2026-09-25-torus-dehn-twists.html",
    title: "Dehn Twists and the Mapping Class Group of the Torus",
    hook: "Twisting a torus is a matrix: its mapping class group is exactly SL₂(ℤ).",
    topics: ["topology", "linear"]
  },
  {
    date: "2026-09-24",
    file: "2026-09-24-frieze-patterns.html",
    title: "Conway–Coxeter Frieze Patterns",
    hook: "Integer friezes whose every diamond has ad − bc = 1 are secretly triangulated polygons.",
    topics: ["combinatorics", "numbers"]
  },
  {
    date: "2026-09-03",
    file: "2026-09-03-rauzy-fractal.html",
    title: "The Rauzy Fractal of the Tribonacci Substitution",
    hook: "Project the Tribonacci word and a three-piece fractal appears that tiles the plane.",
    topics: ["dynamics", "symmetry"]
  },
  {
    date: "2026-08-31",
    file: "2026-08-31-kesten-amenability.html",
    title: "Kesten's Criterion: Random Walks and Amenability",
    hook: "A random walk returns home subexponentially often exactly when its group is amenable.",
    topics: ["groups", "dynamics"]
  },
  {
    date: "2026-08-23",
    file: "2026-08-23-alexander-from-braids.html",
    title: "Alexander Polynomials from Braid Closures",
    hook: "Read a knot's Alexander polynomial straight off the Burau matrix of a braid.",
    topics: ["topology", "linear"]
  },
  {
    date: "2026-08-20",
    file: "2026-08-20-lagrange-gauss-reduction.html",
    title: "Lagrange–Gauss Lattice Reduction",
    hook: "Euclid's algorithm in two dimensions finds the shortest vectors of any plane lattice.",
    topics: ["numbers", "linear"]
  },
  {
    date: "2026-08-19",
    file: "2026-08-19-bruhat-tits-tree.html",
    title: "The Bruhat–Tits Tree for SL₂(ℚ_p)",
    hook: "Lattices in ℚ_p² form an infinite tree, and SL₂(ℚ_p) slides along it.",
    topics: ["numbers", "groups", "linear"]
  },
  {
    date: "2026-08-17",
    file: "2026-08-17-four-square-quaternions.html",
    title: "Jacobi's Four-Square Theorem, Quaternionically",
    hook: "Count the ways to write n as four squares — quaternions explain the answer.",
    topics: ["numbers"]
  },
  {
    date: "2026-08-13",
    file: "2026-08-13-unfolding-billiards.html",
    title: "Unfolding Billiards in Polygons",
    hook: "Reflect the table, not the ball, and a billiard path becomes a straight line.",
    topics: ["dynamics", "symmetry"]
  },
  {
    date: "2026-08-13",
    file: "2026-08-13-heisenberg-growth.html",
    title: "Polynomial Growth of the Heisenberg Group",
    hook: "Balls in the Heisenberg group grow like R⁴, because moving up costs area.",
    topics: ["groups"]
  },
  {
    date: "2026-08-11",
    file: "2026-08-11-triangle-group-kaleidoscopes.html",
    title: "Triangle-Group Kaleidoscopes",
    hook: "Three mirrors at angles π/p, π/q, π/r tile a sphere, a plane, or hyperbolic space.",
    topics: ["symmetry", "hyperbolic", "groups"]
  },
  {
    date: "2026-08-10",
    file: "2026-08-10-schottky-limit-sets.html",
    title: "Schottky Groups and Their Limit Sets",
    hook: "Pair up circles by Möbius maps and a Cantor dust of limit points appears.",
    topics: ["hyperbolic", "groups"]
  },
  {
    date: "2026-08-09",
    file: "2026-08-09-apollonian-gasket.html",
    title: "The Apollonian Gasket",
    hook: "Keep filling the gaps between tangent circles: every curvature is an integer.",
    topics: ["hyperbolic", "numbers"]
  },
  {
    date: "2026-08-08",
    file: "2026-08-08-rational-tangles.html",
    title: "Conway's Rational Tangles",
    hook: "Twist and rotate two strands; a single fraction tells you exactly which tangle you built.",
    topics: ["topology"]
  },
  {
    date: "2026-08-07",
    file: "2026-08-07-hopf-fibration.html",
    title: "The Hopf Fibration",
    hook: "The 3-sphere is a bundle of circles over the 2-sphere, any two of them linked.",
    topics: ["topology"]
  },
  {
    date: "2026-08-06",
    file: "2026-08-06-sandpile-identity.html",
    title: "The Abelian Sandpile Identity",
    hook: "Recurrent sandpiles form a group, and its identity element is a fractal.",
    topics: ["combinatorics", "dynamics"]
  },
  {
    date: "2026-08-05",
    file: "2026-08-05-cutting-sequences.html",
    title: "Cutting Sequences on the Modular Surface",
    hook: "A geodesic crossing the Farey tessellation spells out a continued fraction.",
    topics: ["numbers", "hyperbolic", "dynamics"]
  },
  {
    date: "2026-08-04",
    file: "2026-08-04-ping-pong-free-groups.html",
    title: "Ping-Pong and Free Groups",
    hook: "For |t| ≥ 2, a game of ping-pong proves two unipotent matrices generate a free group.",
    topics: ["groups", "hyperbolic", "linear"]
  }
];
