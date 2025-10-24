// Initialize MathQuill
const MQ = MathQuill.getInterface(2);

// MathQuill fields
let idealField, elementAField, elementBField;

// Initialize when document is ready
$(document).ready(function() {
    // Initialize MathQuill input fields
    idealField = MQ.MathField(document.getElementById('ideal-input'), {
        spaceBehavesLikeTab: true,
        handlers: {
            edit: function() {
                // Optional: handle real-time editing
            }
        }
    });

    elementAField = MQ.MathField(document.getElementById('element-a'), {
        spaceBehavesLikeTab: true
    });

    elementBField = MQ.MathField(document.getElementById('element-b'), {
        spaceBehavesLikeTab: true
    });

    // Set default example values for (-1,-1)/ℤ[∛2]
    idealField.latex('x^3-2');
    elementAField.latex('-1');
    elementBField.latex('-1');

    // Compute button handler
    document.getElementById('compute-btn').addEventListener('click', computeProjectiveUnits);
});

function computeProjectiveUnits() {
    try {
        // Get input values
        const idealLatex = idealField.latex();
        const elementA = elementAField.latex();
        const elementB = elementBField.latex();

        // Validate inputs
        if (!idealLatex || !elementA || !elementB) {
            showError('Please fill in all fields');
            return;
        }

        // Parse the ideal to determine the ring
        const ring = parseRingDefinition(idealLatex);

        // Parse the elements
        const a = parseElement(elementA, ring);
        const b = parseElement(elementB, ring);

        // Compute the quaternion algebra structure
        const quaternionAlgebra = {
            ring: ring,
            a: a,
            b: b,
            relations: {
                i_squared: a,
                j_squared: b,
                ij: 'anticommute'
            }
        };

        // Compute projective units (generators)
        const generators = computeGenerators(quaternionAlgebra);

        // Display results
        displayResults(generators, ring, a, b);

    } catch (error) {
        showError(error.message);
    }
}

function parseRingDefinition(idealLatex) {
    // Parse the ideal definition
    // For now, handle simple cases like x^2-n

    const ring = {
        type: 'number_field',
        ideal: idealLatex,
        variables: [],
        relations: []
    };

    // Extract variables (simple pattern matching)
    const varMatch = idealLatex.match(/[a-z]/g);
    if (varMatch) {
        ring.variables = [...new Set(varMatch)];
    }

    // Parse polynomials (split by comma)
    const polynomials = idealLatex.split(',').map(p => p.trim());
    ring.relations = polynomials;

    return ring;
}

function parseElement(latex, ring) {
    // Parse an element in the ring
    return {
        latex: latex,
        representation: latex
    };
}

function computeGenerators(quaternionAlgebra) {
    // This is where the main mathematical computation happens
    // For a quaternion algebra (a,b)_A, we need to find generators for the projective units

    const { ring, a, b } = quaternionAlgebra;

    // Check for special case: (-1,-1) over any field
    const isHamiltonQuaternions = (a.latex === '-1' && b.latex === '-1');

    // Check if this is a cubic field x³-n
    const cubicMatch = ring.ideal.match(/x\^3-(\d+)/);
    const isCubicField = cubicMatch !== null;

    const generators = [];

    // Special handling for (-1,-1)/ℤ[∛2]
    if (isHamiltonQuaternions && isCubicField && cubicMatch[1] === '2') {
        return computeHamiltonQuaternionsOverCubicRoot2();
    }

    // General case for (-1,-1) (Hamilton quaternions)
    if (isHamiltonQuaternions) {
        return computeHamiltonQuaternionsGeneral(ring);
    }

    // General quaternion algebra case
    return computeGeneralQuaternionUnits(ring, a, b);
}

function computeHamiltonQuaternionsOverCubicRoot2() {
    // Compute units of (-1,-1)/ℤ[∛2]
    // Elements: a + bi + cj + dk where a,b,c,d ∈ ℤ[∛2]
    // Reduced norm: N(a + bi + cj + dk) = a² + b² + c² + d²
    // Units: elements with N = 1

    const alpha = '\\sqrt[3]{2}';
    const alpha2 = '\\sqrt[3]{4}';

    const generators = [];

    // TORSION ELEMENTS (finite order)
    generators.push({
        name: '±1',
        description: 'Scalar units (center of algebra)',
        element: {
            basis: '1, -1',
            norm: '1',
            explicit: '±1',
            inverse: '(±1)⁻¹ = ±1'
        },
        order: '2',
        type: 'torsion'
    });

    generators.push({
        name: 'i',
        description: 'Quaternion unit: i² = -1, N(i) = 1',
        element: {
            basis: '0 + 1·i + 0·j + 0·k',
            norm: '1',
            explicit: 'i',
            inverse: 'i⁻¹ = -i'
        },
        order: '4',
        type: 'torsion'
    });

    generators.push({
        name: 'j',
        description: 'Quaternion unit: j² = -1, N(j) = 1',
        element: {
            basis: '0 + 0·i + 1·j + 0·k',
            norm: '1',
            explicit: 'j',
            inverse: 'j⁻¹ = -j'
        },
        order: '4',
        type: 'torsion'
    });

    generators.push({
        name: 'k = ij',
        description: 'Quaternion unit: k² = -1, N(k) = 1. Note: ij = k but ji = -k (nonabelian!)',
        element: {
            basis: '0 + 0·i + 0·j + 1·k',
            norm: '1',
            explicit: 'k = ij',
            inverse: 'k⁻¹ = -k'
        },
        order: '4',
        type: 'torsion'
    });

    // FUNDAMENTAL UNIT FROM BASE FIELD
    generators.push({
        name: `ε = -1 + ${alpha} + ${alpha2}`,
        description: 'Fundamental unit of ℤ[∛2] (norm = -1)',
        element: {
            basis: `(-1 + ${alpha} + ${alpha2}) + 0·i + 0·j + 0·k`,
            norm: '-1',
            explicit: `-1 + ${alpha} + ${alpha2} (scalar)`,
            inverse: `ε⁻¹ = 1 - ${alpha} + ${alpha2}`
        },
        order: '∞',
        type: 'base_field_unit'
    });

    // KNOWN INTERESTING UNITS (add these first)
    const knownUnits = getKnownUnits();
    generators.push(...knownUnits);

    // SEARCH FOR MIXED UNITS
    // These are the interesting ones: combinations of quaternion and field structure
    const mixedUnits = searchForMixedUnits();
    generators.push(...mixedUnits);

    // Add explanation
    generators.push({
        name: 'About Nonabelian Structure',
        description: 'The unit group is NONABELIAN because ij ≠ ji. The full unit group contains infinitely many elements generated by products like ε·i, ε·j, ε²·i·j, etc. We list some explicit generators found by solving a² + b² + c² + d² = 1.',
        element: {
            basis: 'See examples above',
            norm: '1'
        },
        order: 'N/A',
        type: 'note'
    });

    return generators;
}

function getKnownUnits() {
    // Manually add known interesting units that might be outside small search ranges
    const alpha = '\\sqrt[3]{2}';
    const alpha2 = '\\sqrt[3]{4}';

    const units = [];

    // Unit: Let u = ∛2 - 1, then (u-1) + (u²+2u)i + (u²+u)j
    // Substituting u = t-1 where t = ∛2:
    // a = u - 1 = t - 2
    // b = u² + 2u = (t-1)² + 2(t-1) = t² - 1
    // c = u² + u = (t-1)² + (t-1) = t² - t
    // Verification: a² + b² + c² = (t²-4t+4) + (2t-2t²+1) + (2t-4+t²) = 1 ✓

    units.push({
        name: `u₁ = (${alpha}-2) + (${alpha2}-1)i + (${alpha2}-${alpha})j`,
        description: 'Nontrivial mixed unit discovered by user',
        element: {
            basis: `(${alpha} - 2) + (${alpha2} - 1)i + (${alpha2} - ${alpha})j`,
            norm: '1 (verified)',
            explicit: `Coefficients: a=(-2,1,0), b=(-1,0,1), c=(0,-1,1), d=(0,0,0)`,
            inverse: `Conjugate: (${alpha}-2) - (${alpha2}-1)i - (${alpha2}-${alpha})j`
        },
        order: '∞',
        type: 'known_example'
    });

    // Could also express as: if u = ∛2 - 1, then (u-1) + (u²+2u)i + (u²+u)j
    units.push({
        name: `Alternative form: u = ${alpha}-1`,
        description: 'Same unit expressed as (u-1) + (u²+2u)i + (u²+u)j',
        element: {
            basis: 'With u = ∛2 - 1: a=u-1, b=u²+2u, c=u²+u, d=0',
            norm: '1',
            explicit: 'This gives the same element as above'
        },
        order: '∞',
        type: 'note'
    });

    // Unit: (2-t) + (t²-t-1)i where t = ∛2
    // a = 2 - t = (2, -1, 0)
    // b = t² - t - 1 = (-1, -1, 1)
    // c = 0, d = 0
    // Verification: a² + b² should equal 1
    // a² = (2-t)² = 4 - 4t + t²
    // b² = (t²-t-1)² = t⁴ - 2t³ - t² + 2t + 1 = 2t - 4 - t² + 2t + 1 = 4t - t² - 3
    // Sum = (4 - 4t + t²) + (4t - t² - 3) = 1 ✓

    units.push({
        name: `u₂ = (2-${alpha}) + (${alpha2}-${alpha}-1)i`,
        description: 'Mixed unit with only i-component (verified!)',
        element: {
            basis: `(2 - ${alpha}) + (${alpha2} - ${alpha} - 1)i + 0j + 0k`,
            norm: '1 (verified)',
            explicit: `Coefficients: a=(2,-1,0), b=(-1,-1,1), c=(0,0,0), d=(0,0,0)`,
            inverse: `Conjugate: (2-${alpha}) - (${alpha2}-${alpha}-1)i`
        },
        order: '∞',
        type: 'known_example'
    });

    // Try to find a square root of u₂
    console.log('Searching for square root of u₂...');
    const sqrtU2 = findSquareRoot([2, -1, 0], [-1, -1, 1], [0, 0, 0], [0, 0, 0]);
    console.log('Square root search result:', sqrtU2);

    if (sqrtU2) {
        const formatElement = (coeffs) => {
            const [c0, c1, c2] = coeffs;
            if (c0 === 0 && c1 === 0 && c2 === 0) return '0';

            const formatCoeff = (val) => {
                // Check if it's a half-integer
                if (Math.abs(val * 2 - Math.round(val * 2)) < 0.0001) {
                    const numerator = Math.round(val * 2);
                    if (numerator === 2) return '';
                    if (numerator === -2) return '-';
                    if (numerator === 1) return '1/2';
                    if (numerator === -1) return '-1/2';
                    return `${numerator}/2`;
                }
                return val.toString();
            };

            let parts = [];
            if (c0 !== 0) {
                parts.push(formatCoeff(c0));
            }
            if (c1 !== 0) {
                const coeff = formatCoeff(c1);
                if (coeff === '' || coeff === '1') parts.push(alpha);
                else if (coeff === '-' || coeff === '-1') parts.push(`-${alpha}`);
                else parts.push(`${coeff}${alpha}`);
            }
            if (c2 !== 0) {
                const coeff = formatCoeff(c2);
                if (coeff === '' || coeff === '1') parts.push(alpha2);
                else if (coeff === '-' || coeff === '-1') parts.push(`-${alpha2}`);
                else parts.push(`${coeff}${alpha2}`);
            }
            return parts.join(' + ').replace(/\+ -/g, '- ');
        };

        const aStr = formatElement(sqrtU2.a);
        const bStr = formatElement(sqrtU2.b);
        const cStr = formatElement(sqrtU2.c);
        const dStr = formatElement(sqrtU2.d);

        let basisStr = '';
        if (aStr !== '0') basisStr += `(${aStr})`;
        if (bStr !== '0') basisStr += (basisStr ? ' + ' : '') + `(${bStr})i`;
        if (cStr !== '0') basisStr += (basisStr ? ' + ' : '') + `(${cStr})j`;
        if (dStr !== '0') basisStr += (basisStr ? ' + ' : '') + `(${dStr})k`;

        units.push({
            name: `√u₂`,
            description: 'Square root of u₂ found by search',
            element: {
                basis: basisStr,
                norm: `Norm of (√u₂)² = norm of u₂ = 1`,
                explicit: `Coefficients: a=${JSON.stringify(sqrtU2.a)}, b=${JSON.stringify(sqrtU2.b)}, c=${JSON.stringify(sqrtU2.c)}, d=${JSON.stringify(sqrtU2.d)}`,
                inverse: 'Compute via conjugate'
            },
            order: '∞',
            type: 'known_example'
        });
    } else {
        console.log('No square root found in search range');
        units.push({
            name: `√u₂ - Not found in search`,
            description: 'Square root not found with small coefficients (range ±5)',
            element: {
                basis: 'May require coefficients outside search range',
                norm: 'Should equal 1',
                explicit: 'Try expanding search or computing algebraically'
            },
            order: 'Unknown',
            type: 'note'
        });
    }

    return units;
}

function findSquareRoot(targetA, targetB, targetC, targetD) {
    // Search for v such that v² = target
    // v² = (a² - b² - c² - d²) + 2abi + 2acj + 2adk

    // Key insight: Since targetC and targetD are both [0,0,0], we have 2ac = 0 and 2ad = 0.
    // Since targetB ≠ 0, we need 2ab ≠ 0, so a ≠ 0.
    // Therefore c = 0 and d = 0, and we only need v = a + bi!

    // Allow half-integer coefficients: search for (n/2) where n ∈ ℤ
    const searchRange = 10; // Search numerators from -10 to 10 (gives -5 to 5 after dividing by 2)

    const fieldSquare = (m, n, p) => {
        // ((m + n·t + p·t²)/2)² = (m + n·t + p·t²)²/4 where t³ = 2
        // Numerator: m² + 4np + (2mn + 4p²)t + (2mp + n²)t²
        return {
            c0: m*m + 4*n*p,
            c1: 2*m*n + 4*p*p,
            c2: 2*m*p + n*n
        };
    };

    const fieldProduct = (a, b) => {
        // ((a0 + a1·t + a2·t²)/2)·((b0 + b1·t + b2·t²)/2) = product/4
        const [a0, a1, a2] = a;
        const [b0, b1, b2] = b;
        return {
            c0: a0*b0 + 2*a1*b2 + 2*a2*b1,
            c1: a0*b1 + a1*b0 + 2*a2*b2,
            c2: a0*b2 + a1*b1 + a2*b0
        };
    };

    const fieldSubtract = (a, b) => {
        return {
            c0: a.c0 - b.c0,
            c1: a.c1 - b.c1,
            c2: a.c2 - b.c2
        };
    };

    const fieldEquals = (a, targetCoeffs, denom) => {
        // Check if a/denom equals target
        return a.c0 === targetCoeffs[0] * denom &&
               a.c1 === targetCoeffs[1] * denom &&
               a.c2 === targetCoeffs[2] * denom;
    };

    // Search for v = (a0 + a1·t + a2·t²)/2 + (b0 + b1·t + b2·t²)/2 · i
    for (let a0 = -searchRange; a0 <= searchRange; a0++) {
        for (let a1 = -searchRange; a1 <= searchRange; a1++) {
            for (let a2 = -searchRange; a2 <= searchRange; a2++) {
                for (let b0 = -searchRange; b0 <= searchRange; b0++) {
                    for (let b1 = -searchRange; b1 <= searchRange; b1++) {
                        for (let b2 = -searchRange; b2 <= searchRange; b2++) {
                            // Compute v² where v = a/2 + (b/2)i
                            // v² = (a²/4 - b²/4) + 2(a/2)(b/2)i = (a² - b²)/4 + (ab)/2 · i
                            const a = [a0, a1, a2];
                            const b = [b0, b1, b2];

                            const a2_sq = fieldSquare(a0, a1, a2);  // numerator of a²
                            const b2_sq = fieldSquare(b0, b1, b2);  // numerator of b²

                            // Real part: (a² - b²)/4 should equal target
                            const realPart = fieldSubtract(a2_sq, b2_sq);

                            // i part: ab/2 should equal targetB
                            const iPart = fieldProduct(a, b);

                            // Check if realPart/4 = targetA and iPart/2 = targetB
                            if (fieldEquals(realPart, targetA, 4) && fieldEquals(iPart, targetB, 2)) {
                                // Return with denominator info
                                return {
                                    a: a.map(x => x/2),
                                    b: b.map(x => x/2),
                                    c: [0, 0, 0],
                                    d: [0, 0, 0],
                                    hasHalves: true
                                };
                            }
                        }
                    }
                }
            }
        }
    }

    return null;
}

function searchForMixedUnits() {
    // Search for norm-1 elements: a + bi + cj + dk where a,b,c,d ∈ ℤ[∛2]
    // Elements of ℤ[∛2] have form: m + n·∛2 + p·∛4 where m,n,p ∈ ℤ

    const alpha = '\\sqrt[3]{2}';
    const alpha2 = '\\sqrt[3]{4}';
    const units = [];

    // Helper to compute norm of element in ℤ[∛2]: (m + n·∛2 + p·∛4)²
    const normOfFieldElement = (m, n, p) => {
        // (m + n·α + p·α²)² = m² + n²·α² + p²·α⁴ + 2mn·α + 2mp·α² + 2np·α³
        // where α³ = 2
        return {
            c0: m*m + 2*n*p*2, // constant term (including 2np·α³ = 2np·2)
            c1: 2*m*n + 2*p*p*2, // coefficient of α (including 2p²·α⁴ = 2p²·α·2)
            c2: 2*m*p + n*n // coefficient of α²
        };
    };

    // Sum four norms to get total norm
    const totalNorm = (a, b, c, d) => {
        const na = normOfFieldElement(a[0], a[1], a[2]);
        const nb = normOfFieldElement(b[0], b[1], b[2]);
        const nc = normOfFieldElement(c[0], c[1], c[2]);
        const nd = normOfFieldElement(d[0], d[1], d[2]);

        return {
            c0: na.c0 + nb.c0 + nc.c0 + nd.c0,
            c1: na.c1 + nb.c1 + nc.c1 + nd.c1,
            c2: na.c2 + nb.c2 + nc.c2 + nd.c2
        };
    };

    // Search through small coefficients
    // Note: searchRange = 2 gives 5^12 ≈ 244M iterations - too slow!
    // searchRange = 1 gives 3^12 ≈ 531K iterations - manageable
    // Let's use range 2 but with early termination
    const searchRange = 2;
    const maxUnitsToFind = 30; // Stop after finding this many to save time

    for (let a0 = -searchRange; a0 <= searchRange; a0++) {
        if (units.length >= maxUnitsToFind) break;
        for (let a1 = -searchRange; a1 <= searchRange; a1++) {
            if (units.length >= maxUnitsToFind) break;
            for (let a2 = -searchRange; a2 <= searchRange; a2++) {
                if (units.length >= maxUnitsToFind) break;
                for (let b0 = -searchRange; b0 <= searchRange; b0++) {
                    if (units.length >= maxUnitsToFind) break;
                    for (let b1 = -searchRange; b1 <= searchRange; b1++) {
                        if (units.length >= maxUnitsToFind) break;
                        for (let b2 = -searchRange; b2 <= searchRange; b2++) {
                            if (units.length >= maxUnitsToFind) break;
                            for (let c0 = -searchRange; c0 <= searchRange; c0++) {
                                if (units.length >= maxUnitsToFind) break;
                                for (let c1 = -searchRange; c1 <= searchRange; c1++) {
                                    if (units.length >= maxUnitsToFind) break;
                                    for (let c2 = -searchRange; c2 <= searchRange; c2++) {
                                        if (units.length >= maxUnitsToFind) break;
                                        for (let d0 = -searchRange; d0 <= searchRange; d0++) {
                                            if (units.length >= maxUnitsToFind) break;
                                            for (let d1 = -searchRange; d1 <= searchRange; d1++) {
                                                if (units.length >= maxUnitsToFind) break;
                                                for (let d2 = -searchRange; d2 <= searchRange; d2++) {
                                                    const norm = totalNorm(
                                                        [a0, a1, a2],
                                                        [b0, b1, b2],
                                                        [c0, c1, c2],
                                                        [d0, d1, d2]
                                                    );

                                                    // Check if norm = 1 (i.e., 1 + 0·α + 0·α²)
                                                    if (norm.c0 === 1 && norm.c1 === 0 && norm.c2 === 0) {
                                                        // Skip trivial cases we already have
                                                        const isScalar = (b0===0 && b1===0 && b2===0 && c0===0 && c1===0 && c2===0 && d0===0 && d1===0 && d2===0);
                                                        const isPureI = (a0===0 && a1===0 && a2===0 && c0===0 && c1===0 && c2===0 && d0===0 && d1===0 && d2===0);
                                                        const isPureJ = (a0===0 && a1===0 && a2===0 && b0===0 && b1===0 && b2===0 && d0===0 && d1===0 && d2===0);
                                                        const isPureK = (a0===0 && a1===0 && a2===0 && b0===0 && b1===0 && b2===0 && c0===0 && c1===0 && c2===0);

                                                        if (!isScalar && !isPureI && !isPureJ && !isPureK) {
                                                            units.push({
                                                                a: [a0, a1, a2],
                                                                b: [b0, b1, b2],
                                                                c: [c0, c1, c2],
                                                                d: [d0, d1, d2]
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Format found units for display
    const formattedUnits = [];
    const maxDisplay = 10; // Limit display

    for (let i = 0; i < Math.min(units.length, maxDisplay); i++) {
        const u = units[i];
        const formatElement = (coeffs) => {
            const [c0, c1, c2] = coeffs;
            if (c0 === 0 && c1 === 0 && c2 === 0) return '0';
            let parts = [];
            if (c0 !== 0) parts.push(c0.toString());
            if (c1 !== 0) parts.push(c1 === 1 ? alpha : c1 === -1 ? `-${alpha}` : `${c1}${alpha}`);
            if (c2 !== 0) parts.push(c2 === 1 ? alpha2 : c2 === -1 ? `-${alpha2}` : `${c2}${alpha2}`);
            return parts.join(' + ').replace('+ -', '- ');
        };

        const aStr = formatElement(u.a);
        const bStr = formatElement(u.b);
        const cStr = formatElement(u.c);
        const dStr = formatElement(u.d);

        let basisStr = '';
        if (aStr !== '0') basisStr += `(${aStr})`;
        if (bStr !== '0') basisStr += ` + (${bStr})i`;
        if (cStr !== '0') basisStr += ` + (${cStr})j`;
        if (dStr !== '0') basisStr += ` + (${dStr})k`;

        formattedUnits.push({
            name: `Mixed unit #${i+1}`,
            description: `Norm-1 element combining quaternion and field structure`,
            element: {
                basis: basisStr,
                norm: '1',
                explicit: basisStr,
                inverse: 'Compute via conjugate/norm formula'
            },
            order: 'Likely ∞',
            type: 'mixed'
        });
    }

    if (units.length > maxDisplay) {
        formattedUnits.push({
            name: `... and ${units.length - maxDisplay} more`,
            description: `Found ${units.length} total mixed units with small coefficients (range ±${searchRange})`,
            element: {
                basis: 'Additional units exist',
                norm: '1'
            },
            order: 'Various',
            type: 'note'
        });
    }

    return formattedUnits;
}

function computeHamiltonQuaternionsGeneral(ring) {
    const generators = [];

    // Standard Hamilton quaternion units
    generators.push({
        name: 'i',
        description: 'Quaternion unit with i² = -1',
        element: {
            basis: 'i',
            norm: '-1'
        },
        order: '4'
    });

    generators.push({
        name: 'j',
        description: 'Quaternion unit with j² = -1',
        element: {
            basis: 'j',
            norm: '-1'
        },
        order: '4'
    });

    generators.push({
        name: 'k = ij',
        description: 'Quaternion unit with k² = -1',
        element: {
            basis: 'k = ij',
            norm: '-1'
        },
        order: '4'
    });

    // Units from the base ring
    generators.push({
        name: 'Units from A',
        description: `Fundamental units of ${ring.ideal}`,
        element: {
            basis: 'Embedded as scalars',
            norm: '1'
        },
        order: 'Depends on unit rank of A'
    });

    return generators;
}

function computeGeneralQuaternionUnits(ring, a, b) {
    const generators = [];

    generators.push({
        name: 'i',
        description: `Quaternion unit with i² = ${a.latex}`,
        element: {
            basis: 'i',
            norm: a.latex
        },
        order: 'infinite (unless a = -1)'
    });

    generators.push({
        name: 'j',
        description: `Quaternion unit with j² = ${b.latex}`,
        element: {
            basis: 'j',
            norm: b.latex
        },
        order: 'infinite (unless b = -1)'
    });

    generators.push({
        name: 'k = ij',
        description: 'Product unit with ij = -ji',
        element: {
            basis: 'k = ij',
            norm: `-(${a.latex})(${b.latex})`
        },
        order: 'infinite'
    });

    generators.push({
        name: 'Units from A',
        description: 'Fundamental units of the base ring',
        element: {
            basis: 'Embedded as scalars',
            norm: '1'
        },
        order: 'From unit group of A'
    });

    return generators;
}

function displayResults(generators, ring, a, b) {
    const outputSection = document.getElementById('output-section');
    const output = document.getElementById('output');

    // Group generators by type
    const torsion = generators.filter(g => g.type === 'torsion');
    const baseFieldUnits = generators.filter(g => g.type === 'base_field_unit');
    const knownExamples = generators.filter(g => g.type === 'known_example');
    const mixedUnits = generators.filter(g => g.type === 'mixed');
    const notes = generators.filter(g => g.type === 'note');
    const other = generators.filter(g => !g.type);

    let html = `
        <div style="margin-bottom: 20px; padding: 15px; background: #ebf8ff; border-radius: 6px;">
            <strong>Ring A:</strong> ℤ[${ring.variables.join(', ')}] / ⟨${ring.ideal}⟩<br>
            <strong>Quaternion Algebra:</strong> (${a.latex}, ${b.latex})<sub>A</sub><br>
            <strong>⚠️ Unit group is NONABELIAN</strong> (ij = -ji)
        </div>
    `;

    // Display torsion elements
    if (torsion.length > 0) {
        html += `<h3 style="margin-top: 20px; margin-bottom: 15px; color: #2d3748;">Torsion Elements (Finite Order):</h3>`;
        torsion.forEach((gen, index) => {
            html += generateGeneratorHTML(gen, index + 1);
        });
    }

    // Display base field units
    if (baseFieldUnits.length > 0) {
        html += `<h3 style="margin-top: 20px; margin-bottom: 15px; color: #2d3748;">Base Field Units (Infinite Order):</h3>`;
        baseFieldUnits.forEach((gen, index) => {
            html += generateGeneratorHTML(gen, index + 1);
        });
    }

    // Display known example units
    if (knownExamples.length > 0) {
        html += `<h3 style="margin-top: 20px; margin-bottom: 15px; color: #2d3748;">Known Example Units:</h3>`;
        html += `<p style="color: #718096; margin-bottom: 10px;">Units that have been identified but may require norm verification:</p>`;
        knownExamples.forEach((gen, index) => {
            html += generateGeneratorHTML(gen, index + 1);
        });
    }

    // Display mixed units
    if (mixedUnits.length > 0) {
        html += `<h3 style="margin-top: 20px; margin-bottom: 15px; color: #2d3748;">Additional Mixed Units (Found by Search):</h3>`;
        html += `<p style="color: #718096; margin-bottom: 10px;">These combine quaternion and field structure in nontrivial ways:</p>`;
        mixedUnits.forEach((gen, index) => {
            html += generateGeneratorHTML(gen, index + 1);
        });
    }

    // Display other generators
    if (other.length > 0) {
        html += `<h3 style="margin-top: 20px; margin-bottom: 15px; color: #2d3748;">Other Generators:</h3>`;
        other.forEach((gen, index) => {
            html += generateGeneratorHTML(gen, index + 1);
        });
    }

    // Display notes
    if (notes.length > 0) {
        notes.forEach((gen) => {
            html += `
                <div style="margin-top: 15px; padding: 12px; background: #fef5e7; border-radius: 6px; border-left: 3px solid #f39c12;">
                    <strong>${gen.name}:</strong> ${gen.description}
                </div>
            `;
        });
    }

    // Check if this is the Hamilton quaternions case
    const isHamilton = (a.latex === '-1' && b.latex === '-1');
    const cubicMatch = ring.ideal.match(/x\^3-2/);

    if (isHamilton && cubicMatch) {
        html += `
            <div style="margin-top: 20px; padding: 15px; background: #f0fff4; border-radius: 6px; border-left: 4px solid #48bb78;">
                <h4 style="color: #2d3748; margin-bottom: 10px;">Unit Group Structure (Nonabelian!)</h4>
                <p style="color: #2d3748; margin: 5px 0;">
                    The unit group of (-1,-1)/ℤ[∛2] is a <strong>nonabelian</strong> infinite group.
                </p>
                <p style="color: #2d3748; margin: 10px 0 5px 0;">
                    <strong>Key Relations:</strong>
                </p>
                <ul style="margin-left: 20px; color: #2d3748; font-family: 'Courier New', monospace;">
                    <li>ij = k, but ji = -k (noncommutative!)</li>
                    <li>i² = j² = k² = -1</li>
                    <li>ε commutes with i, j, k (scalar)</li>
                </ul>
                <p style="color: #2d3748; margin: 10px 0 5px 0;">
                    <strong>Some generating elements:</strong>
                </p>
                <ul style="margin-left: 20px; color: #2d3748;">
                    <li>Torsion: {±1, ±i, ±j, ±k} (8-element subgroup, all of order ≤ 4)</li>
                    <li>Base field: ε = -1 + ∛2 + ∛4 (fundamental unit, infinite order)</li>
                    <li>Mixed: Various combinations found by solving a² + b² + c² + d² = 1</li>
                </ul>
                <p style="color: #2d3748; margin: 10px 0 5px 0;">
                    The full group contains infinitely many elements like εⁿ·i, εⁿ·j, εⁿ·i·j·εᵐ, etc.
                </p>
                <p style="color: #718096; margin: 10px 0 0 0; font-size: 0.9em;">
                    Note: Q(∛2) has r=1 real embedding, s=1 complex pair → Dirichlet rank = r+s-1 = 1.
                </p>
            </div>
        `;
    }

    html += `
        <div style="margin-top: 20px; padding: 15px; background: #fffaf0; border-radius: 6px; border-left: 4px solid #ed8936;">
            <strong>Important:</strong> The unit group is <strong>NOT</strong> a simple product because it's nonabelian.
            Products like (εⁱ·i)·(εʲ·j) ≠ (εʲ·j)·(εⁱ·i) in general. The search above finds explicit
            norm-1 elements by exhaustive search over small coefficients. A complete set of generators
            for this nonabelian group would require more sophisticated algebraic methods.
        </div>
    `;

    output.innerHTML = html;
    outputSection.classList.add('visible');
    outputSection.style.display = 'block';

    // Scroll to results
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function generateGeneratorHTML(gen, index) {
    const explicitForm = gen.element.explicit ?
        `<br><strong>Explicit:</strong> ${gen.element.explicit}` : '';

    const inverseForm = gen.element.inverse ?
        `<br><strong>Inverse:</strong> ${gen.element.inverse}` : '';

    return `
        <div class="generator">
            <div class="generator-title">${gen.name}</div>
            <div style="color: #718096; margin: 5px 0;">${gen.description}</div>
            <div class="generator-value">
                <strong>Form:</strong> ${gen.element.basis}<br>
                <strong>Reduced norm:</strong> ${gen.element.norm}${explicitForm}${inverseForm}<br>
                <strong>Order:</strong> ${gen.order}
            </div>
        </div>
    `;
}

function showError(message) {
    const output = document.getElementById('output');
    const outputSection = document.getElementById('output-section');

    output.innerHTML = `<div class="error"><strong>Error:</strong> ${message}</div>`;
    outputSection.style.display = 'block';
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
