// Exact entries for the right-angled dodecahedron over K = Q(i, φ, √φ),
// presented as Q(w) with w = √φ·(1+i), minpoly w⁸+12w⁴+16, and complex
// conjugation σ(w) = −i·w = w⁷/8 + w³. In this basis:
//   i  = −w⁶/8 − w²        φ  = −w⁴/4 − 1
//   √φ = w⁷/16 + w³/2 + w/2   φi = w²/2
const DOD_I = '-\\frac{w^6}{8}-w^2';                                    // i
const DOD_NI = '\\frac{w^6}{8}+w^2';                                    // −i
const DOD_P = '-\\frac{w^4}{4}-1';                                      // φ
const DOD_NP = '\\frac{w^4}{4}+1';                                      // −φ
const DOD_Q = '\\frac{w^7}{16}+\\frac{w^3}{2}+\\frac{w}{2}';            // √φ
const DOD_NQ = '-\\frac{w^7}{16}-\\frac{w^3}{2}-\\frac{w}{2}';          // −√φ
const DOD_PpQ = '\\frac{w^7}{16}-\\frac{w^4}{4}+\\frac{w^3}{2}+\\frac{w}{2}-1';   // φ+√φ
const DOD_PmQ = '-\\frac{w^7}{16}-\\frac{w^4}{4}-\\frac{w^3}{2}-\\frac{w}{2}-1';  // φ−√φ
const DOD_NPpQ = '\\frac{w^7}{16}+\\frac{w^4}{4}+\\frac{w^3}{2}+\\frac{w}{2}+1';  // −φ+√φ
const DOD_NPmQ = '-\\frac{w^7}{16}+\\frac{w^4}{4}-\\frac{w^3}{2}-\\frac{w}{2}+1'; // −φ−√φ
const DOD_1pQ = '\\frac{w^7}{16}+\\frac{w^3}{2}+\\frac{w}{2}+1';        // 1+√φ
const DOD_1mQ = '-\\frac{w^7}{16}-\\frac{w^3}{2}-\\frac{w}{2}+1';       // 1−√φ
const DOD_N1pQ = '\\frac{w^7}{16}+\\frac{w^3}{2}+\\frac{w}{2}-1';       // −1+√φ
const DOD_N1mQ = '-\\frac{w^7}{16}-\\frac{w^3}{2}-\\frac{w}{2}-1';      // −1−√φ
const DOD_1pM = '\\frac{w^2}{2}+1';                                     // 1+φi
const DOD_1mM = '1-\\frac{w^2}{2}';                                     // 1−φi
const DOD_N1pM = '\\frac{w^2}{2}-1';                                    // −1+φi
const DOD_N1mM = '-\\frac{w^2}{2}-1';                                   // −1−φi

export const exampleLibrary = [
    {
        name: 'Jorgensen fibered (n=2)',
        cat: 'Knots, links & bundles',
        desc: 'Once-punctured-torus bundle (Jørgensen’s fibered example)',
        mats: [['2.85011', '0', '0', '0.35086'],
        ['0.31415 - 0.78426i', '-0.50725 - 0.51641i', '1', '0.78426 + 0.31415i']]
    },
    {
        name: 'Apollonian Gasket',
        cat: 'Fractal limit sets',
        desc: 'Limit set is the Apollonian gasket',
        exact: { minpoly: 'w^2+1', root: { re: 0, im: 1 } },     // w = i
        mats: [['1', '1+w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // Entries in Q(√2, i) = Q(ζ₈): w = ζ₈, √2 = w−w³, i = w²;
        // σ(w) = w̄ = w⁻¹ = −w³ realizes conjugation.
        name: 'quasiSchottky',
        cat: 'Fractal limit sets',
        desc: 'Free two-generator group with fractal limit set',
        exact: {
            minpoly: 'w^4+1',
            root: { re: 0.70710678, im: 0.70710678 },
            conj: '-w^3'
        },
        mats: [['w-w^3', '1', '1', 'w-w^3'], ['w-w^3', 'w^2', '-w^2', 'w-w^3']]
    },
    {
        name: 'Modular group',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'PSL(2,Z) — the modular group',
        exact: { minpoly: 'w' },                                 // plain Q
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Borromean rings group',
        cat: 'Knots, links & bundles',
        desc: 'Complement of the Borromean rings',
        exact: { minpoly: 'w^2+1', root: { re: 0, im: 1 } },     // w = i
        mats: [['1', '2', '0', '1'], ['1', 'w', '0', '1'], ['1', '0', '-1-w', '1'], ['1', '0', '1-w', '1']]
    },
    {
        name: 'Z[i] congruence',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Congruence subgroup of the Bianchi group PSL(2,Z[i])',
        exact: { minpoly: 'w^2+1', root: { re: 0, im: 1 } },     // w = i
        mats: [['1', '2', '0', '1'], ['1', '2w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Surface group',
        cat: 'Surfaces & Fuchsian groups',
        desc: 'Fuchsian surface group with rational entries',
        exact: { minpoly: 'w' },                                 // plain Q
        mats: [['2', '-2', '0', '1/2'], ['3', '4', '2', '3']]
    },
    {
        name: 'Surface group 2',
        cat: 'Surfaces & Fuchsian groups',
        desc: 'Fuchsian surface group over Q(√2)',
        exact: { minpoly: 'w^2-2', root: { re: 1.41421356, im: 0 } },   // w = √2
        mats: [['w', '0', '0', '\\frac{w}{2}'], ['0', '-1', '1', '0'], ['1', '2',
            '2', '5']]
    },
    {
        name: 'Long-Reid Group',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Integral two-generator group from the Long–Reid family',
        exact: { minpoly: 'w' },                                 // plain Q
        mats: [['3', '0', '0', '\\frac{1}{3}'], ['\\frac{1}{8}', '\\frac{9}{8}', '\\frac{2}{8}', '\\frac{82}{8}']]
    },
    {
        // Kept in float form deliberately: this is the tutorial's opening
        // group, and step 2 of the talk demonstrates enabling exact mode
        // live (minpoly w^2+w+1, entry rewritten as w).
        name: 'Figure eight knot group',
        cat: 'Knots, links & bundles',
        desc: 'Complement of the figure-eight knot (the default group)',
        mats: [['1', '\\frac{-1+ \\sqrt{3} i}{2}', '0', '1'], ['1', '0', '1', '1']]
    },
    {
        // Q(ζ₈) again: 2i = 2w², 1/√2 = (w−w³)/2.
        name: 'Dense circles',
        cat: 'Fractal limit sets',
        desc: 'Limit set a dense pattern of circles',
        exact: {
            minpoly: 'w^4+1',
            root: { re: 0.70710678, im: 0.70710678 },
            conj: '-w^3'
        },
        mats: [['1', '2w^2', '0', '1'], ['\\frac{w-w^3}{2}', '\\frac{w^3-w}{2}',
            '\\frac{w-w^3}{2}', '\\frac{w-w^3}{2}']]
    },
    {
        // The parabolic entry (√7+i)/2 is itself a primitive element:
        // w = (√7+i)/2 has minpoly w⁴−3w²+4, with √7 = (5w−w³)/2,
        // i = (w³−w)/2, and conjugation σ(w) = √7 − w = (3w−w³)/2.
        name: 'P(1/3)',
        cat: 'Knots, links & bundles',
        desc: 'Two-parabolic (Riley) group at slope 1/3',
        exact: {
            minpoly: 'w^4-3w^2+4',
            root: { re: 1.32287566, im: 0.5 },
            conj: '(3w-w^3)/2'
        },
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(1/4)',
        cat: 'Knots, links & bundles',
        desc: 'Two-parabolic (Riley) group at slope 1/4',
        mats: [['1', '1.5291+0.2571i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(2/5)',
        cat: 'Knots, links & bundles',
        desc: 'Two-parabolic (Riley) group at slope 2/5',
        mats: [['1', '1.1028+0.6655i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Hecke group',
        cat: 'Surfaces & Fuchsian groups',
        desc: 'Hecke group H(n) — a random n on each load',
        mats: [['1', '2\\cos(\\frac{\\pi}{n})', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // w = ω = (−1+√3i)/2: (1+√3i)/2 = 1+w, (1−√3i)/2 = −w.
        name: 'Figure eight fiber',
        cat: 'Knots, links & bundles',
        desc: 'Fiber surface subgroup — geometrically infinite, so certification fails (as it should)',
        exact: { minpoly: 'w^2+w+1', root: { re: -0.5, im: 0.86602540 } },
        mats: [['w+1', '1', 'w', '1'],
        ['w+1', '-1', '-w', '1']]
    },
    {
        name: 'PSL(2,Z[w])',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Bianchi group over the Eisenstein integers Z[ω]',
        exact: { minpoly: 'w^2+w+1', root: { re: -0.5, im: 0.86602540 } },
        mats: [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'PSL(2,Z[√-5])',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Bianchi-type group over Z[√−5]',
        exact: { minpoly: 'w^2+5', root: { re: 0, im: 2.23606798 } },    // w = √−5
        mats: [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['2+w', '4', '2', '2-w'], ['0', '-1', '1', '0']]
    },
    {
        name: '(2,3,7) triangle group (cocompact Fuchsian)',
        cat: 'Surfaces & Fuchsian groups',
        desc: 'Cocompact (2,3,7) triangle rotation group',
        consts: [
            ['u', '\\frac{2\\cos(\\frac{\\pi}{7})}{\\sqrt{3}}'],
            ['t', 'u+\\sqrt{u^2-1}']
        ],
        mats: [['0', '1', '-1', '0'],
        ['\\frac{1}{2}', '\\frac{\\sqrt{3}}{2}t', '-\\frac{\\sqrt{3}}{2t}', '\\frac{1}{2}']]
    },
    {
        // Weeks manifold = m003(-3,1), the smallest closed orientable
        // hyperbolic 3-manifold (vol = 0.94270736...). Exact presentation via
        // the trace triple (tr g1, tr g2, tr g1g2) = (th, th, th^2-th), where
        // th is the complex root (Im < 0) of t^3 - t - 1 (the cubic field of
        // discriminant -23) and rr is the plastic number (its real root).
        // Normal form: g1 = [[th,-1],[1,0]], g2 = [[0,bb],[-1/bb,th]] with
        // bb + 1/bb = tr g1g2.
        // EXACT form: everything lives in Q(bb). With w = bb, the relation
        // bb + 1/bb = zz and the resolvent cubic zz³−2zz²+3zz−1 = 0 give the
        // sextic minpoly w⁶−2w⁵+6w⁴−5w³+6w²−2w+1 (irreducible: no real
        // roots, no rational quadratic factors), and th = 1/zz − 1 =
        // w/(w²+1) − 1. No conj: Q(bb) is not conjugation-stable (the cubic
        // is non-Galois) — fine, the group is orientation-preserving.
        name: 'Weeks manifold (closed)',
        cat: 'Closed 3-manifolds',
        desc: 'Smallest closed hyperbolic 3-manifold — exact over a sextic field',
        exact: {
            minpoly: 'w^6-2w^5+6w^4-5w^3+6w^2-2w+1',
            root: { re: 0.61547315, im: 1.80372911 }
        },
        mats: [['\\frac{w}{w^2+1}-1', '-1', '1', '0'],
        ['0', 'w', '-\\frac{1}{w}', '\\frac{w}{w^2+1}-1']]
    },
    {
        // Meyerhoff manifold = m003(-2,3), the second smallest closed
        // orientable hyperbolic 3-manifold (vol = 0.98136882...). Exact
        // presentation via the trace triple (xx, 1+xx-xx^2, xx^2-xx^3), where
        // xx is the root (Im > 0) of t^4 - t^3 - 1 (the quartic field of
        // discriminant -283), solved by Ferrari via the resolvent cubic
        // 8m^3 + 8m + 1 = 0. Normal form as for the Weeks manifold.
        // Float form: an exact preset would need a primitive element for
        // Q(xx, bb) (likely degree 8) with xx expressed in it — the Weeks
        // trick (th ∈ Q(zz)) has no obvious analogue for the quartic xx.
        name: 'Meyerhoff manifold (closed)',
        cat: 'Closed 3-manifolds',
        desc: 'Second-smallest closed hyperbolic 3-manifold',
        consts: [
            ['mm', '\\sqrt[3]{-\\frac{1}{16}+\\frac{\\sqrt{849}}{144}}+\\sqrt[3]{-\\frac{1}{16}-\\frac{\\sqrt{849}}{144}}'],
            ['ww', '\\sqrt{2mm+\\frac{1}{4}}'],
            ['xx', '\\frac{\\frac{1}{2}-ww+\\sqrt{(\\frac{1}{2}-ww)^2-4(mm-\\frac{mm}{2ww})}}{2}'],
            ['yy', '1+xx-xx^2'],
            ['zz', 'xx^2-xx^3'],
            ['bb', '\\frac{zz+\\sqrt{zz^2-4}}{2}']
        ],
        mats: [['xx', '-1', '1', '0'],
        ['0', 'bb', '-\\frac{1}{bb}', 'yy']]
    },
    // --- Reflection groups (anti: orientation-reversing generators z ↦ M·z̄) ---
    // Mirror configurations are translated so the basepoint (0,0,1) ∈ UHS sits
    // in the interior of a chamber (a generic basepoint's Dirichlet domain IS
    // its chamber; a basepoint ON a mirror would degenerate that wall into a
    // stabilizer element).
    {
        // Reflections in the sides of the ideal triangle with vertices
        // −1/2, 1/2, ∞: the planes x = ∓1/2 and the hemisphere |z| = 1/2.
        // The chamber is the ideal-triangle chimney (all three cusps).
        name: 'Ideal triangle kaleidoscope (3 mirrors)',
        cat: 'Kaleidoscopes — reflection groups',
        desc: 'Mirrors on the sides of an ideal triangle',
        exact: { minpoly: 'w' },     // rational entries; σ = id (real field)
        anti: [true, true, true],
        mats: [['-1', '-1', '0', '1'],
        ['-1', '1', '0', '1'],
        ['0', '\\frac{1}{4}', '1', '0']]
    },
    {
        // The (2,3,∞) triangle kaleidoscope: extended modular group PGL(2,Z),
        // conjugated by z ↦ z − 1/4. Mirrors: planes x = ∓1/4 and the
        // hemisphere |z + 1/4| = 1 (angles π/2, π/3, cusp at ∞).
        name: 'Modular kaleidoscope (2,3,∞ mirrors)',
        cat: 'Kaleidoscopes — reflection groups',
        desc: 'Extended PGL(2,Z): the (2,3,∞) mirror triangle',
        exact: { minpoly: 'w' },     // rational entries; σ = id (real field)
        anti: [true, true, true],
        mats: [['-1', '-\\frac{1}{2}', '0', '1'],
        ['-1', '\\frac{1}{2}', '0', '1'],
        ['-\\frac{1}{4}', '\\frac{15}{16}', '1', '\\frac{1}{4}']]
    },
    {
        // Coxeter mirror box over the Z[i] half-cell, conjugated by
        // z ↦ z − (1+i)/4: planes x = ∓1/4, y = ∓1/4 and the hemisphere
        // |z + (1+i)/4| = 1. Finite covolume, one cusp; the rotation subgroup
        // sits inside PGL(2,Z[i]).
        name: 'Z[i] kaleidoscope (mirror box)',
        cat: 'Kaleidoscopes — reflection groups',
        desc: 'Coxeter mirror box over the Gaussian integers',
        exact: { minpoly: 'w^2+1', root: { re: 0, im: 1 } },   // w = i; σ(w) = −w auto
        anti: [true, true, true, true, true],
        mats: [['-1', '-\\frac{1}{2}', '0', '1'],
        ['-1', '\\frac{1}{2}', '0', '1'],
        ['1', '-\\frac{w}{2}', '0', '1'],
        ['1', '\\frac{w}{2}', '0', '1'],
        ['\\frac{-1-w}{4}', '\\frac{7}{8}', '1', '\\frac{1-w}{4}']]
    },
    {
        // Reflections in the 12 faces of the COMPACT right-angled regular
        // dodecahedron centered at the ball origin (basepoint). Faces sit over
        // the icosahedral directions v ∈ {(0,±1,±p), (±1,±p,0), (±p,0,±1)},
        // p = golden ratio; the right-angle condition forces the boundary
        // circles {B·v = √p} on S², whose stereographic reflections are
        //   z ↦ M·z̄,  M = [[−(v₁+iv₂), v₃+√p], [v₃−√p, v₁−iv₂]]  (det = −2).
        // Exact entries in Q(i, p, √p): p = φ, q = √φ, m = φi (= √(−p²)).
        // M·M̄ = 2·I (exact involutions); adjacent faces meet at exactly π/2.
        name: 'Right-angled dodecahedron (12 mirrors)',
        cat: 'Kaleidoscopes — reflection groups',
        desc: 'Compact right-angled Coxeter chamber (float entries)',
        consts: [
            ['p', '\\frac{1+\\sqrt{5}}{2}'],
            ['q', '\\sqrt{p}'],
            ['m', '\\sqrt{-p^2}']
        ],
        anti: [true, true, true, true, true, true, true, true, true, true, true, true],
        mats: [
            // v = (0, ±1, ±p): M = [[∓i, ±p+q], [±p−q, ∓i]]
            ['-i', 'p+q', 'p-q', '-i'],
            ['-i', '-p+q', '-p-q', '-i'],
            ['i', 'p+q', 'p-q', 'i'],
            ['i', '-p+q', '-p-q', 'i'],
            // v = (±1, ±p, 0): M = [[∓1∓pi, q], [−q, ±1∓pi]]
            ['-1-m', 'q', '-q', '1-m'],
            ['-1+m', 'q', '-q', '1+m'],
            ['1-m', 'q', '-q', '-1-m'],
            ['1+m', 'q', '-q', '-1+m'],
            // v = (±p, 0, ±1): M = [[∓p, ±1+q], [±1−q, ±p]]
            ['-p', '1+q', '1-q', 'p'],
            ['-p', '-1+q', '-1-q', 'p'],
            ['p', '1+q', '1-q', '-p'],
            ['p', '-1+q', '-1-q', '-p']
        ]
    },
    {
        // Same group with EXACT entries over Q(w), w = √φ·(1+i): selecting
        // this preset auto-enables exact mode, so the certifier verifies all
        // Poincaré relations (rᵢ² = 1 and the 30 right-angle relations
        // (rᵢrⱼ)² = 1) exactly in PGL₂(K). The root hint picks the embedding
        // w ≈ 1.272(1+i); σ(w) = −i·w = w⁷/8 + w³ realizes conjugation.
        name: 'Right-angled dodecahedron (exact, 12 mirrors)',
        cat: 'Kaleidoscopes — reflection groups',
        desc: 'The same chamber, exact over Q(w) — fully certified',
        exact: {
            gen: 'w',
            minpoly: 'w^8+12w^4+16',
            root: { re: 1.272019649514, im: 1.272019649514 },
            conj: 'w^7/8+w^3'
        },
        anti: [true, true, true, true, true, true, true, true, true, true, true, true],
        mats: [
            // v = (0, ±1, ±φ): [[∓i, ±φ+√φ], [±φ−√φ, ∓i]]
            [DOD_NI, DOD_PpQ, DOD_PmQ, DOD_NI],
            [DOD_NI, DOD_NPpQ, DOD_NPmQ, DOD_NI],
            [DOD_I, DOD_PpQ, DOD_PmQ, DOD_I],
            [DOD_I, DOD_NPpQ, DOD_NPmQ, DOD_I],
            // v = (±1, ±φ, 0): [[∓1∓φi, √φ], [−√φ, ±1∓φi]]
            [DOD_N1mM, DOD_Q, DOD_NQ, DOD_1mM],
            [DOD_N1pM, DOD_Q, DOD_NQ, DOD_1pM],
            [DOD_1mM, DOD_Q, DOD_NQ, DOD_N1mM],
            [DOD_1pM, DOD_Q, DOD_NQ, DOD_N1pM],
            // v = (±φ, 0, ±1): [[∓φ, ±1+√φ], [±1−√φ, ±φ]]
            [DOD_NP, DOD_1pQ, DOD_1mQ, DOD_P],
            [DOD_NP, DOD_N1pQ, DOD_N1mQ, DOD_P],
            [DOD_P, DOD_1pQ, DOD_1mQ, DOD_NP],
            [DOD_P, DOD_N1pQ, DOD_N1mQ, DOD_NP]
        ]
    }
];
