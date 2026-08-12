/**
 * Example subgroups of Isom(R^3), each generator a Seitz matrix {R | t}
 * given as 12 LaTeX entries, row-major 3×4:
 *   [r11, r12, r13, t1,  r21, r22, r23, t2,  r31, r32, r33, t3]
 *
 * Includes the lattices with pretty Dirichlet domains, the six orientable
 * Bieberbach groups (Conway's platycosms), non-orientable and orbifold
 * examples, and reflection (kaleidoscope) groups.
 */
export const exampleLibrary = [
    {
        // G1, the 3-torus: Dirichlet domain is the unit cube.
        name: 'Cubic lattice ℤ³ (3-torus)',
        mats: [
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '1', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '1']
        ]
    },
    {
        // Face-centered cubic: Dirichlet domain is the rhombic dodecahedron.
        name: 'FCC lattice (rhombic dodecahedron)',
        mats: [
            ['1', '0', '0', '1', '0', '1', '0', '1', '0', '0', '1', '0'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '1'],
            ['1', '0', '0', '0', '0', '1', '0', '1', '0', '0', '1', '1']
        ]
    },
    {
        // Body-centered cubic: Dirichlet domain is the truncated octahedron.
        name: 'BCC lattice (truncated octahedron)',
        mats: [
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '1', '0', '0', '1', '0'],
            ['1', '0', '0', '\\frac{1}{2}', '0', '1', '0', '\\frac{1}{2}', '0', '0', '1', '\\frac{1}{2}']
        ]
    },
    {
        // Hexagonal lattice: Dirichlet domain is a hexagonal prism.
        name: 'Hexagonal lattice (hex prism)',
        mats: [
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '-\\frac{1}{2}', '0', '1', '0', '\\frac{\\sqrt{3}}{2}', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '1']
        ]
    },
    {
        // G2 (dicosm): half-turn screw plus the horizontal lattice.
        name: 'Dicosm G₂ (half-turn space)',
        mats: [
            ['-1', '0', '0', '0', '0', '-1', '0', '0', '0', '0', '1', '\\frac{1}{2}'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '1', '0', '0', '1', '0']
        ]
    },
    {
        // G3 (tricosm): third-turn screw over the hexagonal lattice.
        name: 'Tricosm G₃ (third-turn space)',
        mats: [
            ['-\\frac{1}{2}', '-\\frac{\\sqrt{3}}{2}', '0', '0',
                '\\frac{\\sqrt{3}}{2}', '-\\frac{1}{2}', '0', '0',
                '0', '0', '1', '\\frac{1}{3}'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0']
        ]
    },
    {
        // G4 (tetracosm): quarter-turn screw.
        name: 'Tetracosm G₄ (quarter-turn space)',
        mats: [
            ['0', '-1', '0', '0', '1', '0', '0', '0', '0', '0', '1', '\\frac{1}{4}'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0']
        ]
    },
    {
        // G5 (hexacosm): sixth-turn screw over the hexagonal lattice.
        name: 'Hexacosm G₅ (sixth-turn space)',
        mats: [
            ['\\frac{1}{2}', '-\\frac{\\sqrt{3}}{2}', '0', '0',
                '\\frac{\\sqrt{3}}{2}', '\\frac{1}{2}', '0', '0',
                '0', '0', '1', '\\frac{1}{6}'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0']
        ]
    },
    {
        // G6 (didicosm) = Hantzsche–Wendt: the space group P2₁2₁2₁. Two
        // perpendicular screw motions generate it; holonomy Z/2 × Z/2. The
        // only closed flat 3-manifold that is a rational homology sphere.
        name: 'Hantzsche–Wendt space (didicosm)',
        mats: [
            ['1', '0', '0', '\\frac{1}{2}', '0', '-1', '0', '\\frac{1}{2}', '0', '0', '-1', '0'],
            ['-1', '0', '0', '0', '0', '1', '0', '\\frac{1}{2}', '0', '0', '-1', '\\frac{1}{2}']
        ]
    },
    {
        // B1 (first amphicosm) = Klein bottle × S¹: a glide reflection plus
        // the two perpendicular translations. Non-orientable.
        name: 'Klein bottle × S¹ (glide)',
        mats: [
            ['1', '0', '0', '\\frac{1}{2}', '0', '-1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '1', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '1']
        ]
    },
    {
        // P1̄: the cubic lattice extended by the point inversion −I. The
        // basepoint is a fixed point of the inversion (an orbifold point).
        name: 'Triclinic P1̄ (inversion)',
        mats: [
            ['-1', '0', '0', '0', '0', '-1', '0', '0', '0', '0', '-1', '0'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '1', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '1']
        ]
    },
    {
        // P4̄: fourfold rotoinversion S₄ about the z-axis plus translations.
        name: 'P4̄ (fourfold rotoinversion)',
        mats: [
            ['0', '-1', '0', '0', '1', '0', '0', '0', '0', '0', '-1', '0'],
            ['1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '1', '1']
        ]
    },
    {
        // Reflections in the six faces of the unit cube [-1/2, 1/2]³: every
        // face of the domain is a mirror, paired with itself.
        name: 'Mirror box (cube kaleidoscope)',
        mats: [
            ['-1', '0', '0', '-1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['-1', '0', '0', '1', '0', '1', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '-1', '0', '-1', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '-1', '0', '1', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '-1', '-1'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '-1', '1']
        ]
    },
    {
        // Pm3̄m: the full symmetry group of the cubic honeycomb, generated by
        // reflections in x=y, y=z, z=0, x=1. The canonical domain is the
        // characteristic orthoscheme (1/48 of a cube); the basepoint
        // stabilizer is the full octahedral group of order 48.
        name: 'Pm3̄m orthoscheme (cubic honeycomb)',
        mats: [
            ['0', '1', '0', '0', '1', '0', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '0', '1', '0', '0', '1', '0', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '-1', '0'],
            ['-1', '0', '0', '2', '0', '1', '0', '0', '0', '0', '1', '0']
        ]
    },
    {
        // Equilateral-triangle prism of mirrors: the (3,3,3) triangle group
        // times the infinite dihedral group in z.
        name: 'Triangular prism kaleidoscope',
        mats: [
            ['-\\frac{1}{2}', '-\\frac{\\sqrt{3}}{2}', '0', '\\frac{\\sqrt{3}}{2}',
                '-\\frac{\\sqrt{3}}{2}', '\\frac{1}{2}', '0', '\\frac{1}{2}',
                '0', '0', '1', '0'],
            ['-\\frac{1}{2}', '\\frac{\\sqrt{3}}{2}', '0', '-\\frac{\\sqrt{3}}{2}',
                '\\frac{\\sqrt{3}}{2}', '\\frac{1}{2}', '0', '\\frac{1}{2}',
                '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '-1', '0', '-1', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '-1', '-1'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '-1', '1']
        ]
    },
    {
        // A single screw motion (fivefold twist): an infinite cyclic rod
        // group. The Dirichlet domain at an axis point is an unbounded slab,
        // glued to itself with a twist.
        name: 'Screw motion (rod group)',
        mats: [
            ['\\cos(\\frac{2\\pi}{5})', '-\\sin(\\frac{2\\pi}{5})', '0', '0',
                '\\sin(\\frac{2\\pi}{5})', '\\cos(\\frac{2\\pi}{5})', '0', '0',
                '0', '0', '1', '\\frac{2}{5}']
        ]
    },
    {
        // The octahedral reflection group (order 48): a finite point group,
        // whose fundamental domain is an unbounded cone at the origin.
        name: 'Octahedral kaleidoscope (finite)',
        mats: [
            ['0', '1', '0', '0', '1', '0', '0', '0', '0', '0', '1', '0'],
            ['1', '0', '0', '0', '0', '0', '1', '0', '0', '1', '0', '0'],
            ['1', '0', '0', '0', '0', '1', '0', '0', '0', '0', '-1', '0']
        ]
    }
];
