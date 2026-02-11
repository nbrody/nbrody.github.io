/**
 * parser.js — Parse LaTeX polynomial input to internal representation
 */

function extractBraceGroup(source, startIndex) {
    let index = startIndex;
    while (index < source.length && source[index] === ' ') index++;
    if (source[index] !== '{') throw new Error('Expected brace group');
    let depth = 0, cursor = index, content = '';
    while (cursor < source.length) {
        const ch = source[cursor];
        if (ch === '{') { depth++; if (depth > 1) content += ch; }
        else if (ch === '}') { depth--; if (depth === 0) return { content, endIndex: cursor + 1 }; content += ch; }
        else content += ch;
        cursor++;
    }
    throw new Error('Unbalanced braces');
}

function replaceFractions(expr) {
    let result = '', cursor = 0;
    while (cursor < expr.length) {
        const fi = expr.indexOf('\\frac', cursor);
        if (fi === -1) { result += expr.slice(cursor); break; }
        result += expr.slice(cursor, fi);
        let ni = fi + 5;
        while (expr[ni] === ' ') ni++;
        const num = extractBraceGroup(expr, ni);
        ni = num.endIndex;
        while (expr[ni] === ' ') ni++;
        const den = extractBraceGroup(expr, ni);
        ni = den.endIndex;
        result += `(${replaceFractions(num.content)})/(${replaceFractions(den.content)})`;
        cursor = ni;
    }
    return result;
}

function replaceSquareRoots(expr) {
    let result = '', cursor = 0;
    while (cursor < expr.length) {
        const si = expr.indexOf('\\sqrt', cursor);
        if (si === -1) { result += expr.slice(cursor); break; }
        result += expr.slice(cursor, si);
        let ni = si + 5;
        while (ni < expr.length && expr[ni] === ' ') ni++;
        if (expr[ni] === '{') {
            const group = extractBraceGroup(expr, ni);
            result += `sqrt(${replaceSquareRoots(group.content)})`;
            cursor = group.endIndex;
        } else {
            result += `sqrt(${expr[ni]})`;
            cursor = ni + 1;
        }
    }
    return result;
}

function replaceExponents(expr) {
    return expr.replace(/\^{([^}]+)}/g, '^($1)').replace(/\^(\d+)/g, '^$1');
}

function replaceLatexOps(expr) {
    return expr
        .replace(/\\cdot/g, '*')
        .replace(/\\times/g, '*')
        .replace(/\\left/g, '')
        .replace(/\\right/g, '')
        .replace(/\\,/g, '')
        .replace(/\\ /g, '')
        .replace(/\\{/g, '{')
        .replace(/\\}/g, '}');
}

function replaceSubscripts(expr) {
    // x_{1} → x_1, x_{12} → x_12
    return expr.replace(/x_\{(\d+)\}/g, 'x_$1');
}

/**
 * Convert MathQuill LaTeX to a clean polynomial string
 * suitable for QMvPoly.parse() or _parseUnivariateQ()
 */
function latexToPolynomial(latex) {
    let s = latex;
    s = replaceFractions(s);
    s = replaceSquareRoots(s);
    s = replaceExponents(s);
    s = replaceLatexOps(s);
    s = replaceSubscripts(s);

    // Replace ** with ^
    s = s.replace(/\*\*/g, '^');

    // Replace ² ³ etc with ^2 ^3
    s = s.replace(/²/g, '^2').replace(/³/g, '^3');

    // Clean up implicit multiplication: "3x" → "3*x", ")x" → ")*x"
    s = s.replace(/(\d)(x_)/g, '$1*$2');
    s = s.replace(/(\))(x_)/g, '$1*$2');

    // Remove remaining backslashes
    s = s.replace(/\\/g, '');

    // Normalize whitespace
    s = s.replace(/\s+/g, '').trim();

    return s;
}

/**
 * Extract variable names from a polynomial string
 * Returns sorted array like ["x_1", "x_2"]
 */
function extractVariables(str) {
    const varSet = new Set();
    const pattern = /x_(\d+)/g;
    let match;
    while ((match = pattern.exec(str)) !== null) {
        varSet.add(`x_${match[1]}`);
    }
    return [...varSet].sort((a, b) => {
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
    });
}

/**
 * Count the number of distinct variables in a polynomial string
 */
function countVariables(str) {
    return extractVariables(str).length;
}
