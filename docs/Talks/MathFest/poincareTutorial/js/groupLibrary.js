export const exampleLibrary = [
    {
        name: 'Jorgensen fibered (n=2)',
        mats: [['2.85011', '0', '0', '0.35086'],
        ['0.31415 - 0.78426i', '-0.50725 - 0.51641i', '1', '0.78426 + 0.31415i']]
    },
    {
        name: 'Apollonian Gasket',
        mats: [['1', '1+i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'quasiSchottky',
        mats: [['\\sqrt{2}', '1', '1', '\\sqrt{2}'], ['\\sqrt{2}', 'i', '-i', '\\sqrt{2}']]
    },
    {
        name: 'Modular group',
        mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Borromean rings group',
        mats: [['1', '2', '0', '1'], ['1', 'i', '0', '1'], ['1', '0', '-1-i', '1'], ['1', '0', '1-i', '1']]
    },
    {
        name: 'Z[i] congruence',
        mats: [['1', '2', '0', '1'], ['1', '2i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Surface group',
        mats: [['2', '-2', '0', '1/2'], ['3', '4', '2', '3']]
    },
    {
        name: 'Surface group 2',
        mats: [['\\sqrt{2}', '0', '0', '\\sqrt{\\frac{1}{2}}'], ['0', '-1', '1', '0'], ['1', '2',
            '2', '5']]
    },
    {
        name: 'Long-Reid Group',
        mats: [['3', '0', '0', '\\frac{1}{3}'], ['\\frac{1}{8}', '\\frac{9}{8}', '\\frac{2}{8}', '\\frac{82}{8}']]
    },
    {
        name: 'Figure eight knot group',
        mats: [['1', '\\frac{-1+ \\sqrt{3} i}{2}', '0', '1'], ['1', '0', '1', '1']]
    },
    {
        name: 'Dense circles',
        mats: [['1', '2i', '0', '1'], ['\\frac{1}{\\sqrt{2}}', '\\frac{-1}{\\sqrt{2}}',
            '\\frac{1}{\\sqrt{2}}', '\\frac{1}{\\sqrt{2}}']]
    },
    {
        name: 'P(1/3)',
        mats: [['1', '\\frac{\\sqrt{7}+i}{2}', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(1/4)',
        mats: [['1', '1.5291+0.2571i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'P(2/5)',
        mats: [['1', '1.1028+0.6655i', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Hecke group',
        mats: [['1', '2\\cos(\\frac{\\pi}{n})', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'Figure eight fiber',
        mats: [['\\frac{1+\\sqrt{3}i}{2}', '1', '\\frac{-1+\\sqrt{3}i}{2}', '1'],
        ['\\frac{1+\\sqrt{3}i}{2}', '-1', '\\frac{1-\\sqrt{3}i}{2}', '1']]
    },
    {
        name: 'PSL(2,Z[w])',
        mats: [['1', '1', '0', '1'], ['1', '\\frac{-1 +\\sqrt{3} i}{2}', '0', '1'], ['0', '-1', '1', '0']]
    },
    {
        name: 'PSL(2,Z[√-5])',
        mats: [['1', '1', '0', '1'], ['1', '\\sqrt{5}i', '0', '1'], ['2+\\sqrt{5}i', '4', '2', '2-\\sqrt{5}i'], ['0', '-1', '1', '0']]
    },
    {
        name: '(2,3,7) triangle group (cocompact Fuchsian)',
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
        name: 'Weeks manifold (closed)',
        consts: [
            ['rr', '\\sqrt[3]{\\frac{1}{2}+\\frac{\\sqrt{69}}{18}}+\\sqrt[3]{\\frac{1}{2}-\\frac{\\sqrt{69}}{18}}'],
            ['th', '\\frac{-rr-\\sqrt{4-3rr^2}}{2}'],
            ['zz', 'th^2-th'],
            ['bb', '\\frac{zz+\\sqrt{zz^2-4}}{2}']
        ],
        mats: [['th', '-1', '1', '0'],
        ['0', 'bb', '-\\frac{1}{bb}', 'th']]
    },
    {
        // Meyerhoff manifold = m003(-2,3), the second smallest closed
        // orientable hyperbolic 3-manifold (vol = 0.98136882...). Exact
        // presentation via the trace triple (xx, 1+xx-xx^2, xx^2-xx^3), where
        // xx is the root (Im > 0) of t^4 - t^3 - 1 (the quartic field of
        // discriminant -283), solved by Ferrari via the resolvent cubic
        // 8m^3 + 8m + 1 = 0. Normal form as for the Weeks manifold.
        name: 'Meyerhoff manifold (closed)',
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
    }
];
