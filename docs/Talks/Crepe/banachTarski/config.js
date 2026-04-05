// ═══════════════════════════════════════════════════════════
// COLORS & CONFIG
// ═══════════════════════════════════════════════════════════
export const C = {
    bg: '#060a14', text: '#f1f5f9', muted: '#94a3b8', dim: '#475569',
    accent: '#7c8aff', teal: '#2dd4bf', warm: '#f59e0b', rose: '#f472b6',
    node: '#151d2e', nodeBorder: 'rgba(124,138,255,0.3)',
    edge: 'rgba(148,163,184,0.25)', edgeHi: 'rgba(148,163,184,0.5)',
};

export const ANIM_MS = 650;
export const R = 21;   // node radius
export const SP = 58;  // number spacing
export const N = 12;   // how many numbers to show

// ═══════════════════════════════════════════════════════════
// STEPS
// ═══════════════════════════════════════════════════════════
export const STEPS = [
    // Scene 0: Naturals
    { scene: 0, title: 'The Natural Numbers',
      desc: 'The natural numbers ℕ = {1, 2, 3, 4, 5, …} form an infinite sequence.' },
    { scene: 0, title: 'Odds and Evens',
      desc: 'Color the odd numbers and even numbers differently.' },
    { scene: 0, title: 'Separate',
      desc: 'Pull them apart into two rows.' },
    { scene: 0, title: 'Two Copies of ℕ',
      desc: 'Relabel each row 1, 2, 3, … — each is a complete copy of ℕ. One infinity = two infinities!' },
    // Scene 1: Tree
    { scene: 1, title: 'An Infinite Binary Tree',
      desc: 'A binary tree T: each node has exactly two children, branching forever.' },
    { scene: 1, title: 'Left and Right Subtrees',
      desc: 'The root connects a left subtree (teal) and a right subtree (pink).' },
    { scene: 1, title: 'Remove the Root',
      desc: 'Take away the root. The tree splits into two separate pieces.' },
    { scene: 1, title: 'Each Subtree ≅ T',
      desc: 'Each piece is itself a complete binary tree! One tree → two trees (minus one point).' },
    // Scene 2: Sphere
    { scene: 2, title: 'Rotations of the Cube',
      desc: 'α rotates 90° around the z-axis. β cyclically permutes (x,y,z) → (z,x,y). Together they generate the 24 rotational symmetries of the cube — a finite group.' },
    { scene: 2, title: 'Generators of F₂',
      desc: 'Now consider a and b. These generate a free group F₂ ⊂ SO(3) — every non-trivial reduced word gives a different rotation!' },
    { scene: 2, title: 'Four Pieces',
      desc: 'Partition the sphere into four pieces by which generator "reaches" each point first.' },
    { scene: 2, title: 'Rearrange',
      desc: 'Pair them up: {Wₐ, Wₐ⁻¹} and {W_b, W_b⁻¹}. Rotate one piece in each pair.' },
    { scene: 2, title: 'Two Spheres!',
      desc: 'Each pair reassembles into a complete sphere. One sphere → two spheres!' },
];

export const TOTAL = STEPS.length;
