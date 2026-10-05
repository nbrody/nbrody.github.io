// Presets are plain data: generators (LaTeX entries), optional mirror flags,
// and constants. A constant is either ['name', 'expression'] or a root of a
// polynomial, root(poly, re, im, name): the root nearest re + im·i. Entries
// are read exactly whenever they are algebraic (expr.js).
const root = (poly, re = 0, im = 0, name = 'w') => ({ name, poly, near: { re, im } });

const RILEY = 'Riley slice — pleating-ray cusps';

export const exampleLibrary = [
    {
        // Five-digit decimals of a finite-covolume group. Such a group is
        // locally rigid: nearby representations are (generically) not
        // discrete, so certification is EXPECTED to fail — the example shows
        // what an approximate input looks like, not a certified domain.
        name: 'Jorgensen fibered (n=2)',
        cat: 'Knots, links & bundles',
        desc: 'Once-punctured-torus bundle, entries rounded to 5 digits — rounding breaks discreteness, so certification fails (as it should)',
        mats: [['2.85011', '0', '0', '0.35086'],
        ['0.31415 - 0.78426i', '-0.50725 - 0.51641i', '1', '0.78426 + 0.31415i']]
    },
    {
        name: 'Apollonian Gasket',
        cat: 'Fractal limit sets',
        desc: 'Limit set is the Apollonian gasket',
        mats: [['1', '1+i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // Entries in Q(√2, i) = Q(ζ₈).
        name: 'quasiSchottky',
        cat: 'Fractal limit sets',
        desc: 'Free two-generator group with fractal limit set',
        mats: [['\\sqrt{2}', '1', '1', '\\sqrt{2}'], ['\\sqrt{2}', 'i', '-i', '\\sqrt{2}']]
    },
    {
        name: 'Modular group',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'PSL(2,Z) — the modular group',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // SnapPy's meridians a, b, c of L6a4 (relators aBAcabABCb,
        // aCBcbABCbc), conjugated by diag(δ, 1/δ) with δ² = 1/β, where
        // b = (−1 β; 0 −1) and c = (1 0; γ 1). Then βγ = −2i puts every
        // entry in Z[i]: a = (−i 1; −2i 2+i), b ~ (1 1; 0 1), c = (1 0; −2i 1).
        // Certifies with covolume 7.32772 (two regular ideal octahedra),
        // H₁ = ℤ³, three cusps, torsion-free.
        name: 'Borromean rings group',
        cat: 'Knots, links & bundles',
        desc: 'Complement of the Borromean rings — three meridians in PSL(2,Z[i])',
        mats: [['-i', '1', '-2i', '2+i'], ['1', '1', '0', '1'], ['1', '0', '-2i', '1']]
    },
    {
        // This preset was once labelled "Borromean rings group", but it is not:
        // g1·g1·g3·g2⁻¹·g4 = (−i 3i; 0 i) has trace 0 (order 2), and the
        // certified covolume 1.83193 is a quarter of the Borromean rings'
        // 7.32772 — six times that of PSL(2,Z[i]).
        name: 'Index-6 subgroup of PSL(2,Z[i])',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Four parabolics over Z[i]: covolume ¼ of the Borromean rings, with order-2 torsion',
        mats: [['1', '2', '0', '1'], ['1', 'i', '0', '1'], ['1', '0', '-1-i', '1'], ['1', '0', '1-i', '1']]
    },
    {
        name: 'Z[i] congruence',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Congruence subgroup of the Bianchi group PSL(2,Z[i])',
        mats: [['1', '2', '0', '1'], ['1', '2i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Surface group',
        cat: 'Surfaces & Fuchsian groups',
        desc: 'Fuchsian surface group with rational entries',
        mats: [['2', '-2', '0', '1/2'], ['3', '4', '2', '3']]
    },
    {
        name: 'Surface group 2',
        cat: 'Surfaces & Fuchsian groups',
        desc: 'Fuchsian surface group over Q(√2)',
        mats: [['\\sqrt{2}', '0', '0', '\\frac{\\sqrt{2}}{2}'], ['0', '-1', '1', '0'], ['1', '2',
            '2', '5']]
    },
    {
        name: 'Long-Reid Group',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Integral two-generator group from the Long–Reid family',
        mats: [['3', '0', '0', '\\frac{1}{3}'], ['\\frac{1}{8}', '\\frac{9}{8}', '\\frac{2}{8}', '\\frac{82}{8}']]
    },
    {
        // The tutorial's opening group: step 2 of the talk rewrites the entry
        // as w, a root of w² + w + 1.
        name: 'Figure eight knot group',
        cat: 'Knots, links & bundles',
        desc: 'Complement of the figure-eight knot (the default group)',
        mats: [['1', '\\frac{-1+\\sqrt{-3}}{2}', '0', '1'], ['1', '0', '1', '1']]
    },
    {
        // Q(√2, i) = Q(ζ₈) again.
        name: 'Dense circles',
        cat: 'Fractal limit sets',
        desc: 'Limit set a dense pattern of circles',
        mats: [['1', '2i', '0', '1'], ['\\frac{\\sqrt{2}}{2}', '-\\frac{\\sqrt{2}}{2}',
            '\\frac{\\sqrt{2}}{2}', '\\frac{\\sqrt{2}}{2}']]
    },
    // ── Riley slice: the cusp groups at the ends of pleating rays ──
    // Γ_z = ⟨X = (1 z; 0 1), S⟩ ≅ ℤ ∗ ℤ/2 contains the two-parabolic Riley group
    // ⟨X, SXS⁻¹⟩, conjugate to ⟨(1 1; 0 1), (1 0; ρ 1)⟩ with ρ = −z². The Farey
    // word W_{p/q} = X Y^ε₁ X^ε₂ ⋯ Y^ε_{2q−1}, ε_i = (−1)^⌊ip/q⌋, has trace
    // Φ_{p/q}(ρ) ∈ ℤ[ρ] of degree q. The p/q pleating ray, the branch of
    // Φ_{p/q}⁻¹((−∞, −2]) asymptotic to arg ρ = π(1 − p/q), ends at the cusp
    // group P(p/q): there Φ_{p/q}(ρ) = −2 and W_{p/q} is an accidental parabolic.
    // The presets use the mirror image z² = −ρ̄ with Re z > 0, exactly: w = z is a
    // root of the factor of Φ_{p/q}(−w²) + 2 shown as its minimal polynomial.
    // Along Farey sequences the cusps converge: P(n/(2n+1)) → P(1/2) and
    // P(n/(3n+1)) → P(1/3). Along the Fibonacci slopes 3/5, 5/8, 8/13, 13/21, …
    // → 1/φ they converge to the geometrically infinite group at the end of the
    // irrational pleating ray of slope 1/φ. Some cusps, e.g. P(1/5), P(1/6),
    // P(5/13), P(8/21) and P(8/13), leave two edge cycles unresolved at the
    // default basepoint; conjugating S by (1 w/2; 0 1), which moves the basepoint
    // over the midpoint between S's fixed axis and its X-translate, fixes this
    // (P(8/13) below is presented that way).
    {
        name: 'P(1/2)',
        cat: RILEY,
        desc: 'Riley cusp at slope 1/2: z = 1 + i, a subgroup of PSL(2,Z[i]) whose commutator [X, SXS] is parabolic',
        consts: [root('w^2-2w+2', 1, 1)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // The cusp group at slope 2/5: XsXsXsxsxs (X = (1 z; 0 1), s = S)
        // has trace −(z⁵ − z³ + z), and tr² = 4 cuts out the cubic
        // z³ − z² − z + 2 = 0 at the root z ≈ 1.10278 + 0.66546i. The old
        // four-digit decimal missed the cusp and did not certify.
        name: 'P(2/5)',
        cat: RILEY,
        desc: 'Riley cusp at slope 2/5 — exact over a cubic field; first of 2/5, 3/7, 4/9, … → 1/2',
        consts: [root('w^3-w^2-w+2', 1.1027847152, 0.6654569512)],
        depth: 10,                  // the 10-letter parabolic's walls need depth ≥ 10
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(3/7)',
        cat: RILEY,
        desc: 'Riley cusp at slope 3/7 — degree 8; the cusps n/(2n+1) close in on P(1/2)',
        consts: [root('w^8-3w^6+6w^4-7w^2+4', 1.0148989720, 0.7762184924)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(4/9)',
        cat: RILEY,
        desc: 'Riley cusp at slope 4/9 — degree 4; the cusps n/(2n+1) close in on P(1/2)',
        consts: [root('w^4-w^2+w+2', 0.9840858578, 0.8499810880)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(5/11)',
        cat: RILEY,
        desc: 'Riley cusp at slope 5/11 — degree 12; the closest of these to P(1/2)',
        consts: [root('w^12-3w^10+8w^8-13w^6+15w^4-11w^2+4', 0.9760382799, 0.8964375672)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // z = (√7 + i)/2, a root of z⁴ − 3z² + 4.
        name: 'P(1/3)',
        cat: RILEY,
        desc: 'Riley cusp at slope 1/3 — exact over Q(√7, i); the limit of 1/4, 2/7, 3/10, …',
        mats: [['1', '\\frac{\\sqrt{7}+i}{2}', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(1/4)',
        cat: RILEY,
        desc: 'Riley cusp at slope 1/4 — degree 4; first of 1/4, 2/7, 3/10, … → 1/3',
        consts: [root('w^4-2w^3+2', 1.5290855136, 0.2570658641)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(2/7)',
        cat: RILEY,
        desc: 'Riley cusp at slope 2/7 — degree 4; needs a deeper search (depth 14)',
        consts: [root('w^4-w^3-2w^2+w+2', 1.3992317464, 0.3256401823)],
        depth: 14,
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(3/10)',
        cat: RILEY,
        desc: 'Riley cusp at slope 3/10 — degree 10; the cusps n/(3n+1) close in on P(1/3)',
        consts: [root('w^10-2w^9-2w^8+4w^7+3w^6-2w^5-2w^4-4w^3+w^2+2w+2', 1.3425671751, 0.3765215068)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(3/8)',
        cat: RILEY,
        desc: 'Riley cusp at slope 3/8, between 1/3 and 2/5 — degree 8',
        consts: [root('w^8-2w^7+4w^5-4w^4+4w^2-4w+2', 1.1691979002, 0.5573202322)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(2/9)',
        cat: RILEY,
        desc: 'Riley cusp at slope 2/9 — degree 5',
        consts: [root('w^5-w^4-3w^3+2w^2+w+2', 1.5888206698, 0.1693607858)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(5/8)',
        cat: RILEY,
        desc: 'Riley cusp at slope 5/8, the mirror image of P(3/8) — degree 8; Fibonacci slopes 3/5, 5/8, 8/13, 13/21, … → 1/φ',
        consts: [root('w^8-2w^7+4w^6-4w^5+4w^4-4w^3+4w^2-4w+2', 0.5573202322, 1.1691979002)],
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // S is conjugated by (1 w/2; 0 1): (w/2, −w²/4 − 1; 1, −w/2) is the same
        // half-turn about an axis over w/2 ± i. At the default basepoint (S itself)
        // two edge cycles stay unresolved; this presentation certifies at depth 8.
        name: 'P(8/13)',
        cat: RILEY,
        desc: 'Riley cusp at slope 8/13 — degree 7; S conjugated by (1 w/2; 0 1) so the domain certifies',
        consts: [root('w^7-w^6+3w^5-2w^4+4w^3-3w^2+3w-2', 0.5910175297, 1.1218555814)],
        mats: [['1', 'w', '0', '1'], ['\\frac{w}{2}', '-\\frac{w^2}{4}-1', '1', '-\\frac{w}{2}']]
    },
    {
        name: 'P(13/21)',
        cat: RILEY,
        desc: 'Riley cusp at slope 13/21 — degree 20; the closest of the Fibonacci cusps to the golden degenerate group',
        consts: [root('w^20+6w^18+19w^16+37w^14+47w^12+36w^10+11w^8-7w^6-6w^4+w^2+4', 0.5683136416, 1.1360444385)],
        depth: 14,
        mats: [['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // P(1/4) rounded to four digits: the cusp is w ≈ 1.52909 + 0.25707i
        // with w⁴ − 2w³ + 2 = 0. The rounding moves it off the boundary into the
        // interior of the Riley slice: no word with up to 14 letters is
        // parabolic, and the group is discrete and ≅ ℤ ∗ ℤ/2 (certifies as such).
        name: 'Riley group (z ≈ 1.529+0.257i)',
        cat: RILEY,
        desc: 'Riley slice interior next to P(1/4): ⟨(1 z; 0 1), S⟩ is discrete and free, ℤ ∗ ℤ/2',
        mats: [['1', '1.5291+0.2571i', '0', '1'], ['0', '-1', '1', '0']]
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
        consts: [root('w^2+w+1', -0.5, 0.86602540)],
        mats: [['w+1', '1', 'w', '1'],
        ['w+1', '-1', '-w', '1']]
    },
    {
        name: 'PSL(2,Z[w])',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Bianchi group over the Eisenstein integers Z[ω]',
        consts: [root('w^2+w+1', -0.5, 0.86602540)],
        mats: [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        // The first four generators span only an infinite-covolume subgroup
        // (Z[√−5] is not Euclidean, so elementary matrices do not generate).
        // The membership check found (−4−w, −2w; 2w, −4+w) ∉ that subgroup;
        // with it the domain closes up to the Humbert covolume
        // |D|^{3/2} ζ_K(2)/4π² = 4.2039693 (D = −20).
        name: 'PSL(2,Z[√-5])',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Bianchi group over Z[√−5] — covolume 4.20397 (class number 2)',
        consts: [root('w^2+5', 0, 2.23606798)],    // w = √−5
        mats: [['1', '1', '0', '1'], ['1', 'w', '0', '1'], ['2+w', '4', '2', '2-w'], ['0', '-1', '1', '0'],
            ['-4-w', '-2w', '2w', '-4+w']]
    },
    {
        // Generators Rz, A, B, Rx at the complex place b = 2^(1/3)·e^(2πi/3):
        //   Rz = (1 i; i 1)/√2              A = √((b−1)/2)·diag(1+b²+i, 1+b²−i)
        //   Rx = diag(1+i, 1−i)/√2          B = (√(b−1)/2)·(1+2b−i  −1−i; 1−i  1+2b+i)
        // The scalar prefactors are dropped (floats are normalized to det 1,
        // exact checks are projective), leaving entries in K = Q(b, i) of
        // degree 6. Rz, Rx ∈ SU(2) generate the octahedral group fixing the
        // basepoint (perturbed-basepoint domain).
        name: 'SO₃(Z[2<sup>1/3</sup>])',
        cat: 'Arithmetic & Bianchi groups',
        desc: 'Cocompact arithmetic group over Q(∛2) — exact over a sextic field',
        consts: [root('b^3-2', -0.62996052495, 1.09112363597, 'b')],
        mats: [
            ['1', 'i', 'i', '1'],                                  // Rz
            ['1+b^2+i', '0', '0', '1+b^2-i'],                      // A
            ['1+2b-i', '-1-i', '1-i', '1+2b+i'],                   // B
            ['1+i', '0', '0', '1-i']                               // Rx
        ]
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
        // w/(w²+1) − 1. Q(bb) is not closed under complex conjugation, so a
        // mirror generator would make the tower adjoin conj(w) as well.
        name: 'Weeks manifold (closed)',
        cat: 'Closed 3-manifolds',
        desc: 'Smallest closed hyperbolic 3-manifold — exact over a sextic field',
        consts: [root('w^6-2w^5+6w^4-5w^3+6w^2-2w+1', 0.61547315, 1.80372911)],
        mats: [['\\frac{w}{w^2+1}-1', '-1', '1', '0'],
        ['0', 'w', '-\\frac{1}{w}', '\\frac{w}{w^2+1}-1']]
    },
    {
        // Meyerhoff manifold = m003(-2,3), the second smallest closed
        // orientable hyperbolic 3-manifold (vol = 0.98136882...). Exact
        // presentation via the trace triple (xx, 1+xx-xx^2, xx^2-xx^3), where
        // xx is the root (Im > 0) of t^4 - t^3 - 1 (the quartic field of
        // discriminant -283). Normal form as for the Weeks manifold, with
        // bb + 1/bb = zz. Exact over Q(x, √(z² − 4)), of degree 8.
        name: 'Meyerhoff manifold (closed)',
        cat: 'Closed 3-manifolds',
        desc: 'Second-smallest closed hyperbolic 3-manifold — exact over a field of degree 8',
        consts: [
            root('x^4-x^3-1', 0.2194474721, 0.9144736630, 'x'),
            ['y', '1+x-x^2'],
            ['z', 'x^2-x^3'],
            ['b', '\\frac{z+\\sqrt{z^2-4}}{2}']
        ],
        mats: [['x', '-1', '1', '0'],
        ['0', 'b', '-\\frac{1}{b}', 'y']]
    },
    {
        // FLMS Example 6.3 = m003(-4,1), the non-arithmetic closed manifold
        // of volume 1.4236119003... with no immersed finite-area totally
        // geodesic surfaces.  Start with trace-field generator t satisfying
        // t^5-t^3-t^2+t+1 = 0 and the geometric embedding
        // t ≈ -0.69931101899+0.81126840450i.  The normal-form lift is
        //   A = [[t^4-t^2-t+1,-1],[1,0]],
        //   B = [[0,-u],[-t-u,1-t^2]],  u^2+tu+1 = 0.
        // Exact mode needs one primitive element, so take w=u.  Eliminating t
        // gives the degree-10 minpoly below and
        //   t = w^9+4w^7+w^6+8w^5+w^4+8w^3+w^2+3w.
        // The displayed entries are reduced modulo that minpoly.  They satisfy
        // the two SnapPy relators ababAbbAb and aaBaaBaaBaabAb exactly.
        name: 'FLMS',
        cat: 'Closed 3-manifolds',
        desc: 'm003(-4,1) — non-arithmetic closed manifold with no totally geodesic surfaces',
        consts: [root('w^10+4w^8+w^7+8w^6+w^5+8w^4+w^3+4w^2+1', 0.487334922689059, -1.435797175535177)],
        mats: [
            ['w^8+3w^6+w^5+5w^4+3w^2+w+1', '-1', '1', '0'],
            ['0', '-w', '-w^9-4w^7-w^6-8w^5-w^4-8w^3-w^2-4w',
                'w^8+4w^6+w^5+8w^4+w^3+7w^2+w+3']
        ]
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
        anti: [true, true, true, true, true],
        mats: [['-1', '-\\frac{1}{2}', '0', '1'],
        ['-1', '\\frac{1}{2}', '0', '1'],
        ['1', '-\\frac{i}{2}', '0', '1'],
        ['1', '\\frac{i}{2}', '0', '1'],
        ['\\frac{-1-i}{4}', '\\frac{7}{8}', '1', '\\frac{1-i}{4}']]
    },
    {
        // Reflections in the 12 faces of the COMPACT right-angled regular
        // dodecahedron centered at the ball origin (basepoint). Faces sit over
        // the icosahedral directions v ∈ {(0,±1,±p), (±1,±p,0), (±p,0,±1)},
        // p = golden ratio; the right-angle condition forces the boundary
        // circles {B·v = √p} on S², whose stereographic reflections are
        //   z ↦ M·z̄,  M = [[−(v₁+iv₂), v₃+√p], [v₃−√p, v₁−iv₂]]  (det = −2).
        // Exact entries in Q(√5, √p, i): p = φ, q = √φ, m = φi.
        // M·M̄ = 2·I (exact involutions); adjacent faces meet at exactly π/2,
        // and the certifier verifies rᵢ² = 1 and the 30 right-angle
        // relations (rᵢrⱼ)² = 1 exactly in PGL₂(K).
        name: 'Right-angled dodecahedron (12 mirrors)',
        cat: 'Kaleidoscopes — reflection groups',
        desc: 'Compact right-angled Coxeter chamber — exact over Q(√5, √φ, i)',
        consts: [
            ['p', '\\frac{1+\\sqrt{5}}{2}'],
            ['q', '\\sqrt{p}'],
            ['m', 'ip']
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
    }
];
