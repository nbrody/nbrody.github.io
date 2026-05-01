// World coordinate system
const VIEW_W = 2400;
const VIEW_H = 1600;

// Continents — major fields of mathematics. Each has a center (cx,cy), base
// radius r, blob seed, color, description, and a list of topic "cities".
const continents = [
  {
    id: 'foundations',
    name: 'Foundations',
    description:
      'The bedrock of mathematics — the languages and systems used to formulate and reason about all mathematical objects.',
    color: '#7a5cb8',
    cx: 600, cy: 290, r: 270, seed: 11,
    topics: [
      { name: 'Logic',           x: 530, y: 230 },
      { name: 'Set Theory',      x: 670, y: 200 },
      { name: 'Category Theory', x: 730, y: 330 },
      { name: 'Model Theory',    x: 480, y: 340 },
      { name: 'Proof Theory',    x: 590, y: 400 },
      { name: 'Type Theory',     x: 640, y: 270 },
    ],
  },
  {
    id: 'combinatorics',
    name: 'Combinatorics',
    description:
      'The study of discrete structures — counting, arranging, and analyzing finite collections, networks, and patterns.',
    color: '#33a8a8',
    cx: 1990, cy: 290, r: 240, seed: 22,
    topics: [
      { name: 'Graph Theory',    x: 1900, y: 240 },
      { name: 'Enumerative',     x: 2050, y: 230 },
      { name: 'Algebraic Comb.', x: 1920, y: 360 },
      { name: 'Extremal',        x: 2070, y: 330 },
      { name: 'Design Theory',   x: 1970, y: 410 },
    ],
  },
  {
    id: 'algebra',
    name: 'Algebra',
    description:
      'The study of structures preserved by operations — groups, rings, fields, and the morphisms between them.',
    color: '#d39432',
    cx: 470, cy: 830, r: 360, seed: 33,
    topics: [
      { name: 'Group Theory',          x: 410, y: 730 },
      { name: 'Ring Theory',           x: 540, y: 760 },
      { name: 'Field Theory',          x: 660, y: 830 },
      { name: 'Galois Theory',         x: 690, y: 930 },
      { name: 'Linear Algebra',        x: 340, y: 820 },
      { name: 'Commutative Algebra',   x: 530, y: 970 },
      { name: 'Homological Algebra',   x: 400, y: 970 },
      { name: 'Lie Theory',            x: 270, y: 730 },
      { name: 'Representation Theory', x: 290, y: 920 },
    ],
  },
  {
    id: 'numberTheory',
    name: 'Number Theory',
    description:
      'The study of integers, rational numbers, and their generalizations — Gauss called it the queen of mathematics.',
    color: '#c45a5a',
    cx: 1110, cy: 590, r: 260, seed: 44,
    topics: [
      { name: 'Algebraic NT',         x: 1030, y: 540 },
      { name: 'Analytic NT',          x: 1180, y: 600 },
      { name: 'Elliptic Curves',      x: 1080, y: 680 },
      { name: 'Modular Forms',        x: 1000, y: 630 },
      { name: 'Diophantine',          x: 1190, y: 510 },
      { name: 'Arithmetic Geometry',  x: 1200, y: 690 },
    ],
  },
  {
    id: 'geometry',
    name: 'Geometry',
    description:
      'The study of shape, space, and form — from classical Euclid to modern algebraic varieties and curved manifolds.',
    color: '#6ba055',
    cx: 470, cy: 1290, r: 300, seed: 55,
    topics: [
      { name: 'Euclidean',            x: 360, y: 1220 },
      { name: 'Differential Geom.',   x: 540, y: 1230 },
      { name: 'Algebraic Geometry',   x: 470, y: 1340 },
      { name: 'Riemannian',           x: 600, y: 1340 },
      { name: 'Symplectic',           x: 350, y: 1340 },
      { name: 'Projective',           x: 450, y: 1170 },
      { name: 'Hyperbolic',           x: 600, y: 1430 },
      { name: 'Convex Geometry',      x: 350, y: 1430 },
    ],
  },
  {
    id: 'topology',
    name: 'Topology',
    description:
      'The study of properties preserved under continuous deformation — what mathematicians call rubber-sheet geometry.',
    color: '#a472bd',
    cx: 950, cy: 1140, r: 240, seed: 66,
    topics: [
      { name: 'Point-set',            x: 870, y: 1080 },
      { name: 'Algebraic Topology',   x: 1020, y: 1090 },
      { name: 'Differential Top.',    x: 950, y: 1180 },
      { name: 'Knot Theory',          x: 870, y: 1190 },
      { name: 'Geometric Topology',   x: 1030, y: 1200 },
    ],
  },
  {
    id: 'analysis',
    name: 'Analysis',
    description:
      'The rigorous study of limits, continuity, and infinite processes — the foundations of calculus and beyond.',
    color: '#5b8fd6',
    cx: 1530, cy: 920, r: 330, seed: 77,
    topics: [
      { name: 'Real Analysis',        x: 1440, y: 850 },
      { name: 'Complex Analysis',     x: 1600, y: 870 },
      { name: 'Functional Analysis', x: 1530, y: 970 },
      { name: 'Harmonic Analysis',    x: 1660, y: 950 },
      { name: 'Measure Theory',       x: 1410, y: 950 },
      { name: 'PDE',                  x: 1610, y: 1040 },
      { name: 'ODE',                  x: 1450, y: 1040 },
      { name: 'Dynamical Systems',    x: 1530, y: 1110 },
    ],
  },
  {
    id: 'probability',
    name: 'Probability',
    description:
      'The mathematical study of randomness and stochastic phenomena — and the bridge to statistics.',
    color: '#cf6da0',
    cx: 1770, cy: 1340, r: 230, seed: 88,
    topics: [
      { name: 'Stochastic Proc.',     x: 1700, y: 1290 },
      { name: 'Martingales',          x: 1840, y: 1290 },
      { name: 'Random Walks',         x: 1700, y: 1390 },
      { name: 'Ergodic Theory',       x: 1840, y: 1380 },
      { name: 'Statistics',           x: 1770, y: 1450 },
    ],
  },
  {
    id: 'applied',
    name: 'Applied Math',
    description:
      'Mathematics employed for real-world problems — from physics and biology to cryptography, optimization, and AI.',
    color: '#e08e4a',
    cx: 2120, cy: 1010, r: 290, seed: 99,
    topics: [
      { name: 'Numerical Analysis',   x: 2030, y: 950 },
      { name: 'Optimization',         x: 2160, y: 970 },
      { name: 'Math Physics',         x: 2070, y: 1060 },
      { name: 'Cryptography',         x: 2200, y: 1060 },
      { name: 'Game Theory',          x: 2050, y: 1130 },
      { name: 'Information Theory',   x: 2190, y: 880 },
      { name: 'Control Theory',       x: 2180, y: 1140 },
    ],
  },
];

// Subtle dashed lines drawn between centers of related fields, suggesting
// where the disciplines flow into each other.
const connections = [
  ['foundations', 'algebra'],
  ['foundations', 'combinatorics'],
  ['algebra', 'numberTheory'],
  ['algebra', 'geometry'],
  ['algebra', 'topology'],
  ['numberTheory', 'analysis'],
  ['numberTheory', 'combinatorics'],
  ['geometry', 'topology'],
  ['topology', 'analysis'],
  ['analysis', 'probability'],
  ['analysis', 'applied'],
  ['probability', 'applied'],
  ['combinatorics', 'applied'],
];
