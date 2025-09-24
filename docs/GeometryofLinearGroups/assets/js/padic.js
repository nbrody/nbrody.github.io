const DEFAULT_PRECISION = 20;

const isObject = value => value !== null && typeof value === 'object';

const padicZero = (p, precision) => ({ p, valuation: Infinity, digits: new Array(precision).fill(0), precision });

const padicOne = (p, precision) => {
    const digits = new Array(precision).fill(0);
    if (precision > 0) digits[0] = 1;
    return { p, valuation: 0, digits, precision };
};

const clonePadic = x => ({ p: x.p, valuation: x.valuation, digits: x.digits.slice(), precision: x.precision });

const normalizeDigits = (arr, p, start = 0) => {
    const len = arr.length;
    let carry = 0;
    for (let i = start; i < len; i++) {
        let val = arr[i] + carry;
        if (val >= 0) {
            carry = Math.trunc(val / p);
            val -= carry * p;
        } else {
            carry = -Math.trunc((-val + p - 1) / p);
            val -= carry * p;
        }
        arr[i] = val;
    }
};

const normalizePadic = x => {
    if (x.valuation === Infinity) {
        x.digits.fill(0);
        return x;
    }
    normalizeDigits(x.digits, x.p, 0);
    const { digits, precision } = x;
    let shift = 0;
    while (shift < precision && digits[shift] === 0) shift++;
    if (shift >= precision) {
        x.valuation = Infinity;
        digits.fill(0);
        return x;
    }
    if (shift > 0) {
        x.valuation += shift;
        for (let i = 0; i < precision - shift; i++) digits[i] = digits[i + shift];
        for (let i = precision - shift; i < precision; i++) digits[i] = 0;
    }
    return x;
};

const modInverse = (a, p) => {
    a %= p;
    if (a < 0) a += p;
    if (a === 0) throw new Error('Element not invertible modulo p');
    let t = 0;
    let newT = 1;
    let r = p;
    let newR = a;
    while (newR !== 0) {
        const q = Math.trunc(r / newR);
        [t, newT] = [newT, t - q * newT];
        [r, newR] = [newR, r - q * newR];
    }
    if (r > 1) throw new Error('Element not invertible modulo p');
    if (t < 0) t += p;
    return t;
};

const invertUnitDigits = (uDigits, p, precision) => {
    const invDigits = new Array(precision).fill(0);
    const product = new Array(precision * 2 + 2).fill(0);
    const u0 = uDigits[0] % p;
    if (u0 === 0) throw new Error('Not a unit in Z_p');
    const u0Inv = modInverse(u0, p);
    for (let k = 0; k < precision; k++) {
        const target = k === 0 ? 1 : 0;
        let current = product[k];
        if (current < 0 || current >= p) {
            current %= p;
            if (current < 0) current += p;
        }
        const delta = ((target - current) % p + p) % p;
        if (delta === 0) {
            invDigits[k] = 0;
            continue;
        }
        const digit = (delta * u0Inv) % p;
        invDigits[k] = digit;
        if (digit === 0) continue;
        for (let m = 0; m < precision && k + m < product.length; m++) {
            const ud = m < uDigits.length ? uDigits[m] : 0;
            if (ud !== 0) product[k + m] += ud * digit;
        }
        normalizeDigits(product, p, k);
    }
    return invDigits;
};

const padicFromBigInt = (value, p, precision) => {
    if (value === 0n) return padicZero(p, precision);
    const pBig = BigInt(p);
    let val = value;
    let valuation = 0;
    while (val % pBig === 0n) {
        val /= pBig;
        valuation++;
    }
    const digits = new Array(precision).fill(0);
    for (let i = 0; i < precision; i++) {
        let digit = Number(val % pBig);
        if (digit < 0) digit += p;
        digits[i] = digit;
        val = (val - BigInt(digit)) / pBig;
    }
    return normalizePadic({ p, valuation, digits, precision });
};

const padicFromNumber = (value, p, precision) => {
    if (!Number.isFinite(value)) throw new Error('Invalid numeric value');
    if (!Number.isInteger(value)) throw new Error('Only integers can be embedded into Z_p');
    return padicFromBigInt(BigInt(value), p, precision);
};

const ensurePadic = (entry, p, precision) => {
    if (entry === null || entry === undefined) return padicZero(p, precision);
    if (typeof entry === 'number') return padicFromNumber(entry, p, precision);
    if (typeof entry === 'bigint') return padicFromBigInt(entry, p, precision);
    if (isObject(entry)) {
        const digitsSource = Array.isArray(entry.digits) ? entry.digits : [];
        const digits = new Array(precision).fill(0);
        for (let i = 0; i < precision && i < digitsSource.length; i++) digits[i] = Number(digitsSource[i]);
        const valuation = entry.valuation === Infinity ? Infinity : Number(entry.valuation ?? entry.v ?? 0);
        const prime = Number(entry.p ?? entry.prime ?? p);
        if (!Number.isInteger(prime) || prime < 2) throw new Error('Invalid prime for p-adic entry');
        const cand = { p: prime, valuation, digits, precision };
        return normalizePadic(cand);
    }
    throw new Error('Unsupported p-adic entry type');
};

const valuationValue = x => (x.valuation === Infinity ? Infinity : x.valuation);

const padicLinearCombination = (terms, precision) => {
    const active = terms.filter(term => term.coeff !== 0 && term.value.valuation !== Infinity);
    if (active.length === 0) {
        const base = terms.find(term => term.value) ?? { value: { p: 2 } };
        return padicZero(base.value.p, precision);
    }
    let vmin = active[0].value.valuation;
    for (let i = 1; i < active.length; i++) vmin = Math.min(vmin, active[i].value.valuation);
    let maxShift = 0;
    for (const term of active) {
        const shift = term.value.valuation - vmin;
        if (shift > maxShift) maxShift = shift;
    }
    const workLen = precision + maxShift + 2;
    const acc = new Array(workLen).fill(0);
    for (const term of active) {
        const { value, coeff } = term;
        const shift = value.valuation - vmin;
        for (let i = 0; i < precision && shift + i < workLen; i++) {
            const digit = value.digits[i];
            if (digit !== 0) acc[shift + i] += coeff * digit;
        }
    }
    const p = active[0].value.p;
    normalizeDigits(acc, p, 0);
    let first = 0;
    while (first < workLen && acc[first] === 0) first++;
    if (first >= workLen) return padicZero(p, precision);
    const digits = new Array(precision).fill(0);
    for (let i = 0; i < precision && first + i < workLen; i++) digits[i] = acc[first + i];
    return normalizePadic({ p, valuation: vmin + first, digits, precision });
};

const padicAdd = (xIn, yIn, precision) => padicLinearCombination([
    { value: xIn, coeff: 1 },
    { value: yIn, coeff: 1 },
], precision);

const padicSub = (xIn, yIn, precision) => padicLinearCombination([
    { value: xIn, coeff: 1 },
    { value: yIn, coeff: -1 },
], precision);

const padicMul = (xIn, yIn, precision) => {
    if (xIn.valuation === Infinity || yIn.valuation === Infinity) return padicZero(xIn.p, precision);
    const p = xIn.p;
    let valuation = xIn.valuation + yIn.valuation;
    const workLen = precision + 2;
    const out = new Array(workLen).fill(0);
    for (let i = 0; i < precision; i++) {
        const xi = xIn.digits[i];
        if (xi === 0) continue;
        for (let j = 0; j < precision && i + j < workLen; j++) {
            const yj = yIn.digits[j];
            if (yj === 0) continue;
            out[i + j] += xi * yj;
        }
    }
    normalizeDigits(out, p, 0);
    let shift = 0;
    while (shift < workLen && out[shift] === 0) {
        shift++;
        valuation++;
    }
    if (shift >= workLen) return padicZero(p, precision);
    const digits = new Array(precision).fill(0);
    for (let i = 0; i < precision && shift + i < workLen; i++) digits[i] = out[shift + i];
    return normalizePadic({ p, valuation, digits, precision });
};

const padicInv = (xIn, precision) => {
    if (xIn.valuation === Infinity) throw new Error('Zero matrix entry not invertible');
    const invDigits = invertUnitDigits(xIn.digits, xIn.p, precision);
    return normalizePadic({ p: xIn.p, valuation: -xIn.valuation, digits: invDigits, precision });
};

const padicDiv = (xIn, yIn, precision) => {
    if (xIn.valuation === Infinity) return padicZero(xIn.p, precision);
    return padicMul(xIn, padicInv(yIn, precision), precision);
};

const truncatePadicAt = (xIn, n) => {
    if (xIn.valuation === Infinity) return clonePadic(xIn);
    const cutoff = n - xIn.valuation;
    if (cutoff <= 0) return padicZero(xIn.p, xIn.precision);
    if (cutoff >= xIn.precision) return clonePadic(xIn);
    const digits = xIn.digits.slice();
    for (let i = cutoff; i < digits.length; i++) digits[i] = 0;
    return normalizePadic({ p: xIn.p, valuation: xIn.valuation, digits, precision: xIn.precision });
};

const extractMatrix = g => {
    if (Array.isArray(g) && Array.isArray(g[0])) return { matrix: g, wrapper: null };
    if (isObject(g) && Array.isArray(g.matrix)) return { matrix: g.matrix, wrapper: g };
    throw new Error('matrixToVertex expects a 2x2 matrix input');
};

const inferPrime = (g, entries) => {
    const candidates = [];
    if (isObject(g)) {
        if (Number.isInteger(g.p)) candidates.push(g.p);
        if (Number.isInteger(g.prime)) candidates.push(g.prime);
        if (Number.isInteger(g.padicPrime)) candidates.push(g.padicPrime);
    }
    for (const entry of entries) {
        if (isObject(entry) && Number.isInteger(entry.p)) candidates.push(entry.p);
        else if (isObject(entry) && Number.isInteger(entry.prime)) candidates.push(entry.prime);
    }
    if (typeof globalThis !== 'undefined' && Number.isInteger(globalThis.pprime)) candidates.push(globalThis.pprime);
    const prime = candidates.find(v => v >= 2);
    if (!prime) throw new Error('Unable to determine prime p for Q_p entries');
    return prime;
};

const inferPrecision = entries => {
    let precision = 0;
    for (const entry of entries) {
        if (isObject(entry)) {
            if (Number.isInteger(entry.precision)) precision = Math.max(precision, entry.precision);
            else if (Array.isArray(entry.digits)) precision = Math.max(precision, entry.digits.length);
        }
    }
    return precision > 0 ? precision : DEFAULT_PRECISION;
};

export function matrixToVertex(g){
    // Convert a 2x2 matrix g with entries in Q_p to an upper-triangular matrix
    // ((p^n, q), (0, 1)) representing a vertex in the Bruhat-Tits tree.
    const { matrix, wrapper } = extractMatrix(g);
    if (!Array.isArray(matrix) || matrix.length !== 2 || !Array.isArray(matrix[0]) || !Array.isArray(matrix[1]) || matrix[0].length !== 2 || matrix[1].length !== 2) {
        throw new Error('matrixToVertex expects a 2x2 matrix');
    }
    const entries = [matrix[0][0], matrix[0][1], matrix[1][0], matrix[1][1]];
    const p = inferPrime(g, entries);
    const precision = inferPrecision(entries);

    let a = ensurePadic(matrix[0][0], p, precision);
    let b = ensurePadic(matrix[0][1], p, precision);
    let c = ensurePadic(matrix[1][0], p, precision);
    let d = ensurePadic(matrix[1][1], p, precision);

    if (d.valuation === Infinity && c.valuation === Infinity) {
        throw new Error('Matrix has zero bottom row; cannot determine vertex');
    }

    const valC = valuationValue(c);
    const valD = valuationValue(d);
    if (valC < valD) {
        [a, b, c, d] = [b, a, d, c];
    }

    if (d.valuation === Infinity) {
        throw new Error('Bottom-right entry is zero after reduction; cannot invert');
    }

    const u = padicDiv(c, d, precision);
    const du = padicMul(d, u, precision);
    const bu = padicMul(b, u, precision);
    c = padicSub(c, du, precision);
    a = padicSub(a, bu, precision);
    c = padicZero(p, precision);

    const dInv = padicInv(d, precision);
    a = padicMul(a, dInv, precision);
    b = padicMul(b, dInv, precision);
    c = padicMul(c, dInv, precision);
    d = padicMul(d, dInv, precision);
    d = padicOne(p, precision);

    if (a.valuation === Infinity) throw new Error('First column vanished during reduction');
    const unit = { p, valuation: 0, digits: a.digits.slice(), precision };
    const unitInv = padicInv(unit, precision);
    a = padicMul(a, unitInv, precision);
    c = padicMul(c, unitInv, precision);
    c = padicZero(p, precision);

    const n = a.valuation === Infinity ? Infinity : a.valuation;
    if (n === Infinity) throw new Error('First column vanished during reduction');

    const canonicalA = padicOne(p, precision);
    canonicalA.valuation = n;
    a = canonicalA;

    b = truncatePadicAt(b, n);

    const result = [[a, b], [c, d]];
    if (wrapper) {
        return { ...wrapper, matrix: result, p, precision };
    }
    return result;
}
