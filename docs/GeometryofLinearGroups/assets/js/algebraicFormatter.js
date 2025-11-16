/**
 * Algebraic Number Formatter
 * Converts decimal approximations to exact algebraic expressions (rationals, radicals, etc.)
 * for LaTeX display
 */

const EPSILON = 1e-9;
const MAX_DENOMINATOR = 1000;

/**
 * Common algebraic constants to recognize
 */
const ALGEBRAIC_CONSTANTS = [
    { value: Math.sqrt(2), latex: '\\sqrt{2}', name: 'sqrt2' },
    { value: Math.sqrt(3), latex: '\\sqrt{3}', name: 'sqrt3' },
    { value: Math.sqrt(5), latex: '\\sqrt{5}', name: 'sqrt5' },
    { value: Math.sqrt(6), latex: '\\sqrt{6}', name: 'sqrt6' },
    { value: Math.sqrt(7), latex: '\\sqrt{7}', name: 'sqrt7' },
    { value: 1/Math.sqrt(2), latex: '\\frac{1}{\\sqrt{2}}', name: '1/sqrt2' },
    { value: 1/Math.sqrt(3), latex: '\\frac{1}{\\sqrt{3}}', name: '1/sqrt3' },
    { value: Math.sqrt(3)/2, latex: '\\frac{\\sqrt{3}}{2}', name: 'sqrt3/2' },
    { value: (1 + Math.sqrt(5))/2, latex: '\\frac{1+\\sqrt{5}}{2}', name: 'phi' }, // Golden ratio
    { value: (1 - Math.sqrt(5))/2, latex: '\\frac{1-\\sqrt{5}}{2}', name: 'phi_conjugate' },
];

/**
 * Find the best rational approximation using continued fractions
 */
function approximateRational(x, maxDenominator = MAX_DENOMINATOR) {
    if (!Number.isFinite(x)) return null;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    let a = Math.floor(x);
    let h1 = 1, k1 = 0;
    let h = a, k = 1;

    let remainder = x - a;

    while (k <= maxDenominator && Math.abs(remainder) > EPSILON) {
        remainder = 1 / remainder;
        a = Math.floor(remainder);
        remainder = remainder - a;

        const h2 = h1, k2 = k1;
        h1 = h, k1 = k;
        h = a * h1 + h2;
        k = a * k1 + k2;

        if (k > maxDenominator) break;

        // Check if we have a good approximation
        if (Math.abs(x - h/k) < EPSILON) {
            return { numerator: sign * h, denominator: k };
        }
    }

    // Return best approximation found
    if (k <= maxDenominator && Math.abs(x - h/k) < EPSILON) {
        return { numerator: sign * h, denominator: k };
    }

    return null;
}

/**
 * Try to express a number as a rational multiple of an algebraic constant
 */
function tryAlgebraicForm(x) {
    if (!Number.isFinite(x) || Math.abs(x) < EPSILON) return null;

    // Try each algebraic constant
    for (const constant of ALGEBRAIC_CONSTANTS) {
        const ratio = x / constant.value;
        const rational = approximateRational(ratio, 20); // Use smaller denominator for cleaner results

        if (rational) {
            return { rational, constant };
        }
    }

    return null;
}

/**
 * Format a real number as LaTeX with algebraic expressions when possible
 */
export function formatReal(x, precision = 3) {
    if (!Number.isFinite(x)) return String(x);

    // Check if it's essentially zero
    if (Math.abs(x) < EPSILON) return '0';

    // Try to recognize as a simple rational
    const rational = approximateRational(x);
    if (rational) {
        if (rational.denominator === 1) {
            return String(rational.numerator);
        }
        return `\\frac{${rational.numerator}}{${rational.denominator}}`;
    }

    // Try to recognize as algebraic form (rational * sqrt(n))
    const algebraic = tryAlgebraicForm(x);
    if (algebraic) {
        const { rational, constant } = algebraic;

        if (rational.numerator === 1 && rational.denominator === 1) {
            return constant.latex;
        } else if (rational.numerator === -1 && rational.denominator === 1) {
            return `-${constant.latex}`;
        } else if (rational.denominator === 1) {
            return `${rational.numerator}${constant.latex}`;
        } else if (rational.numerator === 1) {
            return `\\frac{${constant.latex}}{${rational.denominator}}`;
        } else if (rational.numerator === -1) {
            return `-\\frac{${constant.latex}}{${rational.denominator}}`;
        } else {
            return `\\frac{${rational.numerator}${constant.latex}}{${rational.denominator}}`;
        }
    }

    // Fall back to decimal approximation
    if (Math.abs(x - Math.round(x)) < EPSILON) {
        return String(Math.round(x));
    }
    return x.toFixed(precision);
}

/**
 * Format a complex number as LaTeX with algebraic expressions
 */
export function formatComplex(c, precision = 3) {
    if (!c) return '0';

    const re = c.re !== undefined ? c.re : (c.real !== undefined ? c.real : 0);
    const im = c.im !== undefined ? c.im : (c.imag !== undefined ? c.imag : 0);

    const reStr = formatReal(re, precision);
    const imAbs = Math.abs(im);

    // Real number
    if (imAbs < EPSILON) return reStr;

    const imStr = formatReal(imAbs, precision);
    const sign = im > 0 ? '+' : '-';

    // Pure imaginary
    if (Math.abs(re) < EPSILON) {
        if (imAbs === 1 || Math.abs(imAbs - 1) < EPSILON) {
            return im > 0 ? 'i' : '-i';
        }
        return im > 0 ? `${imStr}i` : `-${imStr}i`;
    }

    // Complex number with both parts
    const imPart = (imAbs === 1 || Math.abs(imAbs - 1) < EPSILON) ? 'i' : `${imStr}i`;
    return `${reStr}${sign}${imPart}`;
}

/**
 * Format a 2x2 matrix as LaTeX pmatrix with algebraic expressions
 */
export function formatMatrix2x2(matrix, precision = 3) {
    if (!matrix) return '';

    // Handle both {a, b, c, d} and [[a, b], [c, d]] formats
    let a, b, c, d;

    if (matrix.a !== undefined) {
        // Object format: {a, b, c, d}
        a = matrix.a;
        b = matrix.b;
        c = matrix.c;
        d = matrix.d;
    } else if (Array.isArray(matrix) && matrix.length === 2) {
        // Array format: [[a, b], [c, d]]
        a = matrix[0][0];
        b = matrix[0][1];
        c = matrix[1][0];
        d = matrix[1][1];
    } else {
        return '';
    }

    // Check if entries are complex or real
    const isComplex = (x) => x && (x.im !== undefined || x.imag !== undefined);

    const formatEntry = (x) => {
        if (isComplex(x)) {
            return formatComplex(x, precision);
        } else if (typeof x === 'number') {
            return formatReal(x, precision);
        } else if (x && x.toLatex) {
            // Support objects with toLatex method (like Rational class)
            return x.toLatex();
        } else {
            return String(x);
        }
    };

    const aStr = formatEntry(a);
    const bStr = formatEntry(b);
    const cStr = formatEntry(c);
    const dStr = formatEntry(d);

    return `\\begin{pmatrix} ${aStr} & ${bStr} \\\\ ${cStr} & ${dStr} \\end{pmatrix}`;
}

/**
 * Format an NxN matrix as LaTeX pmatrix with algebraic expressions
 */
export function formatMatrix(matrix, precision = 3) {
    if (!matrix || !Array.isArray(matrix) || matrix.length === 0) return '';

    const rows = matrix.length;
    const cols = matrix[0].length;

    // Use specialized 2x2 formatter for common case
    if (rows === 2 && cols === 2) {
        return formatMatrix2x2(matrix, precision);
    }

    const isComplex = (x) => x && (x.im !== undefined || x.imag !== undefined);

    const formatEntry = (x) => {
        if (isComplex(x)) {
            return formatComplex(x, precision);
        } else if (typeof x === 'number') {
            return formatReal(x, precision);
        } else if (x && x.toLatex) {
            return x.toLatex();
        } else {
            return String(x);
        }
    };

    const rowStrings = matrix.map(row =>
        row.map(formatEntry).join(' & ')
    );

    return `\\begin{pmatrix} ${rowStrings.join(' \\\\ ')} \\end{pmatrix}`;
}
