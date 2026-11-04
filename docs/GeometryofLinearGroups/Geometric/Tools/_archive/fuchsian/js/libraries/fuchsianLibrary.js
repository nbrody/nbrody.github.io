// Von Dyck (rotational) generators for the (p,q,r) triangle group, in PSL(2,R), with EXACT entries.
//
//   A = [[cos(π/p), −m·sin(π/p)], [sin(π/p)/m, cos(π/p)]]   (order-p rotation centered at i·m)
//   B = [[cos(π/q), −sin(π/q)/m], [m·sin(π/q), cos(π/q)]]   (order-q rotation centered at i/m)
//   m = √(K + √(K²−1)),   K = (cos(π/p)cos(π/q) + cos(π/r)) / (sin(π/p)sin(π/q)).
// With this m the basepoint i sits on the perpendicular bisector of the two rotation centers
// (interior to the fundamental domain). trace(AB) = −2cos(π/r) ⇒ (AB) has order r.
//
// cos/sin(π/n) are emitted as exact fraction/radical LaTeX where elementary, else as \cos(π/n);
// the irrational translation parameter m (generally a nested radical) is emitted as a constant
// in math.js syntax. The entries are therefore exact rather than decimal approximations.
function vonDyck(p, q, r) {
    // exact cos/sin(π/n) as {num, den} LaTeX fragments (elementary where possible). Keeping numerator
    // and denominator separate lets us build NON-nested fractions (the LaTeX→math.js \frac regex is
    // non-greedy and mis-parses \frac{\frac{..}{..}}{..}).
    const trig = (fn, n) => {
        const table = {
            cos: { 2: ['0', '1'], 3: ['1', '2'], 4: ['\\sqrt{2}', '2'], 6: ['\\sqrt{3}', '2'] },
            sin: { 2: ['1', '1'], 3: ['\\sqrt{3}', '2'], 4: ['\\sqrt{2}', '2'], 6: ['1', '2'] }
        };
        const e = table[fn][n];
        return e ? { num: e[0], den: e[1] } : { num: `\\${fn}(\\frac{\\pi}{${n}})`, den: '1' };
    };
    const cP = trig('cos', p), sP = trig('sin', p), cQ = trig('cos', q), sQ = trig('sin', q);
    const val = c => (c.den === '1' ? c.num : `\\frac{${c.num}}{${c.den}}`);          // c
    const mTimes = c => {                                                              // m·c
        if (c.num === '0') return '0';
        const numer = (c.num === '1') ? 'm' : `m\\times ${c.num}`;                     // \times, since \cdot isn't parsed
        return (c.den === '1') ? numer : `\\frac{${numer}}{${c.den}}`;
    };
    const overM = c => {                                                               // c/m
        if (c.num === '0') return '0';
        return (c.den === '1') ? `\\frac{${c.num}}{m}` : `\\frac{${c.num}}{${c.den}m}`;
    };
    // m as a math.js-syntax constant (constant values are NOT LaTeX-parsed): √(K + √(K²−1)).
    const K = `(cos(pi/${p})*cos(pi/${q})+cos(pi/${r}))/(sin(pi/${p})*sin(pi/${q}))`;
    const m = `sqrt((${K})+sqrt((${K})^2-1))`;
    return {
        mats: [
            [val(cP), `-${mTimes(sP)}`, overM(sP), val(cP)],
            [val(cQ), `-${overM(sQ)}`, mTimes(sQ), val(cQ)]
        ],
        constants: { m }
    };
}

export const exampleLibrary = [
    {
        name: 'Modular group PSL(2,Z)',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: '(2,3,7) triangle group (von Dyck)',
        ...vonDyck(2, 3, 7)
    },
    {
        name: '(2,3,8) triangle group (von Dyck)',
        ...vonDyck(2, 3, 8)
    },
    {
        name: '(2,4,6) triangle group (von Dyck)',
        ...vonDyck(2, 4, 6)
    },
    {
        name: '(3,3,4) triangle group (von Dyck)',
        ...vonDyck(3, 3, 4)
    },
    {
        name: '(2,3,11) triangle group (von Dyck)',
        ...vonDyck(2, 3, 11)
    },
    {
        // Reflections in the three sides of the ideal triangle (−½, ½, ∞): x=−½, x=½, |z|=½.
        // All generators are orientation-reversing (det = −1, a reflection). Basepoint i is
        // interior to the triangle, off every reflection axis.
        name: 'Ideal triangle reflections',
        mats: [['-1', '-1', '0', '1'], ['-1', '1', '0', '1'], ['0', '1', '4', '0']]
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
