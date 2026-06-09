// Von Dyck (rotational) generators for the (p,q,r) triangle group, in PSL(2,R).
//
// A = order-p rotation centered at i·m, B = order-q rotation centered at i/m,
// where m = e^h and cosh(2h) = (cos(π/p)cos(π/q) + cos(π/r)) / (sin(π/p)sin(π/q)).
// With this choice the basepoint i sits on the perpendicular bisector of the
// two rotation centers — interior to the fundamental domain — so the Dirichlet
// domain at i is non-degenerate. trace(AB) = -2cos(π/r), giving (AB) order r.
function vonDyck(p, q, r) {
    const cP = Math.cos(Math.PI / p), sP = Math.sin(Math.PI / p);
    const cQ = Math.cos(Math.PI / q), sQ = Math.sin(Math.PI / q);
    const cR = Math.cos(Math.PI / r);
    const K = (cP * cQ + cR) / (sP * sQ);
    const m = Math.sqrt(K + Math.sqrt(K * K - 1));
    const fmt = x => x.toFixed(10);
    return [
        [fmt(cP), fmt(-m * sP), fmt(sP / m), fmt(cP)],
        [fmt(cQ), fmt(-sQ / m), fmt(m * sQ), fmt(cQ)]
    ];
}

export const exampleLibrary = [
    {
        name: 'Modular group PSL(2,Z)',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: '(2,3,7) triangle group (von Dyck)',
        mats: vonDyck(2, 3, 7)
    },
    {
        name: '(2,3,8) triangle group (von Dyck)',
        mats: vonDyck(2, 3, 8)
    },
    {
        name: '(2,4,6) triangle group (von Dyck)',
        mats: vonDyck(2, 4, 6)
    },
    {
        name: '(3,3,4) triangle group (von Dyck)',
        mats: vonDyck(3, 3, 4)
    },
    {
        name: '(2,3,11) triangle group (von Dyck)',
        mats: vonDyck(2, 3, 11)
    },
    {
        name: 'Hecke group H(5)',
        mats: [['1', '\\frac{1+\\sqrt{5}}{2}', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Hecke group H(6)',
        mats: [['1', '\\sqrt{3}', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Hecke group H(7)',
        mats: [['1', '2\\cos(\\frac{\\pi}{7})', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Principal congruence Γ(2)',
        mats: [['1', '2', '0', '1'], ['1', '0', '2', '1']]
    },
    {
        name: 'Principal congruence Γ(3)',
        mats: [['1', '3', '0', '1'], ['1', '0', '3', '1'], ['4', '-3', '3', '-2']]
    },
    {
        name: 'Free group (2 generators)',
        mats: [['3', '0', '0', '1/3'], ['5/3', '4/3', '4/3', '5/3']]
    },
    {
        name: 'Long-Reid Group',
        mats: [['3', '0', '0', '\\frac{1}{3}'], ['\\frac{82}{8}', '\\frac{2}{8}', '\\frac{9}{8}', '\\frac{1}{8}']]
    },
    {
        name: 'Congruence subgroup Γ₀(2)',
        mats: [['1', '1', '0', '1'], ['1', '0', '2', '1']]
    },
    {
        name: 'Congruence subgroup Γ₀(3)',
        mats: [['1', '1', '0', '1'], ['1', '0', '3', '1']]
    },
    {
        name: 'Magnus Curve',
        mats: [['t', '0', '0', '1'], ['1+t^2', '2', 't', '1']],
        constants: { 't': '2' }
    }
];
