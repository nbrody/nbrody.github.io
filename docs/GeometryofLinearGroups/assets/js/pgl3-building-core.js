const ZERO = 0n;
const ONE = 1n;

function absBigInt(value) {
    return value < ZERO ? -value : value;
}

export function gcd(a, b) {
    let x = absBigInt(BigInt(a));
    let y = absBigInt(BigInt(b));
    while (y !== ZERO) {
        [x, y] = [y, x % y];
    }
    return x;
}

function egcd(a, b) {
    let oldR = BigInt(a);
    let r = BigInt(b);
    let oldS = ONE;
    let s = ZERO;
    let oldT = ZERO;
    let t = ONE;

    while (r !== ZERO) {
        const quotient = oldR / r;
        [oldR, r] = [r, oldR - quotient * r];
        [oldS, s] = [s, oldS - quotient * s];
        [oldT, t] = [t, oldT - quotient * t];
    }

    return [oldR, oldS, oldT];
}

function mod(a, m) {
    const modulus = BigInt(m);
    const residue = BigInt(a) % modulus;
    return residue >= ZERO ? residue : residue + modulus;
}

function modInverse(a, m) {
    const [g, x] = egcd(mod(a, m), m);
    if (absBigInt(g) !== ONE) {
        throw new Error('Modular inverse does not exist.');
    }
    return mod(x, m);
}

export class Rational {
    constructor(num, den = ONE) {
        if (num instanceof Rational) {
            this.num = num.num;
            this.den = num.den;
        } else if (typeof num === 'string') {
            const trimmed = num.trim();
            if (trimmed.includes('/')) {
                const [left, right] = trimmed.split('/').map((part) => part.trim());
                this.num = BigInt(left);
                this.den = BigInt(right);
            } else {
                this.num = BigInt(trimmed);
                this.den = ONE;
            }
        } else {
            this.num = BigInt(num);
            this.den = BigInt(den);
        }

        if (this.den === ZERO) {
            throw new Error('Denominator cannot be zero.');
        }

        this.simplify();
    }

    static from(value) {
        return value instanceof Rational ? value.clone() : new Rational(value);
    }

    clone() {
        return new Rational(this.num, this.den);
    }

    simplify() {
        if (this.num === ZERO) {
            this.den = ONE;
            return;
        }

        const divisor = gcd(this.num, this.den);
        this.num /= divisor;
        this.den /= divisor;

        if (this.den < ZERO) {
            this.num = -this.num;
            this.den = -this.den;
        }
    }

    isZero() {
        return this.num === ZERO;
    }

    negate() {
        return new Rational(-this.num, this.den);
    }

    add(other) {
        const rhs = Rational.from(other);
        return new Rational(this.num * rhs.den + rhs.num * this.den, this.den * rhs.den);
    }

    sub(other) {
        const rhs = Rational.from(other);
        return new Rational(this.num * rhs.den - rhs.num * this.den, this.den * rhs.den);
    }

    mul(other) {
        const rhs = Rational.from(other);
        return new Rational(this.num * rhs.num, this.den * rhs.den);
    }

    div(other) {
        const rhs = Rational.from(other);
        if (rhs.num === ZERO) {
            throw new Error('Division by zero.');
        }
        return new Rational(this.num * rhs.den, this.den * rhs.num);
    }

    equals(other) {
        const rhs = Rational.from(other);
        return this.num === rhs.num && this.den === rhs.den;
    }

    toString() {
        return this.den === ONE ? `${this.num}` : `${this.num}/${this.den}`;
    }
}

export function parseRational(input) {
    const raw = String(input ?? '').trim();
    if (!raw) {
        return new Rational(0n, 1n);
    }

    const normalized = raw.replace(/\s+/g, '');
    if (!/^[-+]?\d+(\/[-+]?\d+)?$/.test(normalized)) {
        throw new Error(`Unsupported entry "${raw}". Use integers or fractions a/b.`);
    }

    return new Rational(normalized);
}

export function integerExponent(n, p) {
    const prime = BigInt(p);
    let value = BigInt(n);
    if (value === ZERO) {
        return Infinity;
    }
    value = absBigInt(value);

    let count = 0;
    while (value % prime === ZERO) {
        value /= prime;
        count += 1;
    }
    return count;
}

export function val(q, p) {
    const rational = Rational.from(q);
    if (rational.num === ZERO) {
        return Infinity;
    }
    return integerExponent(rational.num, p) - integerExponent(rational.den, p);
}

function powBigInt(base, exponent) {
    const b = BigInt(base);
    let e = BigInt(exponent);
    let out = ONE;
    while (e > ZERO) {
        if (e & ONE) {
            out *= b;
        }
        e >>= ONE;
        if (e > ZERO) {
            base = b * b;
        }
    }
    return b ** BigInt(exponent);
}

export function stepRational(p, k) {
    const prime = BigInt(p);
    if (k >= 0) {
        return new Rational(prime ** BigInt(k), ONE);
    }
    return new Rational(ONE, prime ** BigInt(-k));
}

function pApprox(q, p, modulus) {
    const prime = BigInt(p);
    const modulusBig = BigInt(modulus);
    const exponent = integerExponent(modulusBig, prime);
    const valuation = val(q, p);
    if (valuation === Infinity || exponent < valuation) {
        return ZERO;
    }

    const rational = Rational.from(q);
    const vNum = integerExponent(rational.num, prime);
    const vDen = integerExponent(rational.den, prime);
    const pPowNum = prime ** BigInt(vNum);
    const pPowDen = prime ** BigInt(vDen);

    const unitNum = rational.num / pPowNum;
    const unitDen = rational.den / pPowDen;

    const residuePower = exponent - valuation;
    const residueModulus = prime ** BigInt(residuePower);

    const unitNumMod = mod(unitNum, residueModulus);
    const unitDenMod = mod(unitDen, residueModulus);
    const inverseDen = modInverse(unitDenMod, residueModulus);
    const unitPart = mod(unitNumMod * inverseDen, residueModulus);

    if (valuation >= 0) {
        const scale = prime ** BigInt(valuation);
        return mod(unitPart * scale, modulusBig);
    }

    return ZERO;
}

function floorDivRational(a, b) {
    const lhs = Rational.from(a);
    const rhs = Rational.from(b);
    const numerator = lhs.num * rhs.den;
    const denominator = lhs.den * rhs.num;
    return numerator / denominator;
}

function modRational(a, b) {
    const quotient = floorDivRational(a, b);
    return Rational.from(a).sub(new Rational(quotient).mul(b));
}

export function canonicalizeQ(q, k, p) {
    const rational = Rational.from(q);

    if (k >= 0) {
        const valuation = val(rational, p);
        if (valuation !== Infinity && valuation >= 0) {
            const modulus = BigInt(p) ** BigInt(k);
            return new Rational(pApprox(rational, p, modulus), ONE);
        }
    }

    const step = stepRational(p, k);
    let residue = rational.clone();

    if (residue.num < ZERO) {
        const numerator = (-residue.num) * step.den + residue.den * step.num - ONE;
        const denominator = residue.den * step.num;
        const translate = numerator / denominator;
        residue = residue.add(new Rational(translate).mul(step));
    }

    return modRational(residue, step);
}

export function isPrimeBigInt(n) {
    const value = BigInt(n);
    if (value < 2n) {
        return false;
    }
    for (let divisor = 2n; divisor * divisor <= value; divisor += 1n) {
        if (value % divisor === ZERO) {
            return false;
        }
    }
    return true;
}

function cloneMatrix(matrix) {
    return matrix.map((row) => row.map((entry) => Rational.from(entry)));
}

export function identityMatrix3() {
    return [
        [new Rational(1n), new Rational(0n), new Rational(0n)],
        [new Rational(0n), new Rational(1n), new Rational(0n)],
        [new Rational(0n), new Rational(0n), new Rational(1n)],
    ];
}

export function multiplyMatrices(a, b) {
    const out = [
        [new Rational(0n), new Rational(0n), new Rational(0n)],
        [new Rational(0n), new Rational(0n), new Rational(0n)],
        [new Rational(0n), new Rational(0n), new Rational(0n)],
    ];

    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            let sum = new Rational(0n);
            for (let k = 0; k < 3; k += 1) {
                sum = sum.add(Rational.from(a[row][k]).mul(b[k][col]));
            }
            out[row][col] = sum;
        }
    }

    return out;
}

export function determinant3(matrix) {
    const m = cloneMatrix(matrix);
    const term1 = m[0][0].mul(m[1][1].mul(m[2][2]).sub(m[1][2].mul(m[2][1])));
    const term2 = m[0][1].mul(m[1][0].mul(m[2][2]).sub(m[1][2].mul(m[2][0])));
    const term3 = m[0][2].mul(m[1][0].mul(m[2][1]).sub(m[1][1].mul(m[2][0])));
    return term1.sub(term2).add(term3);
}

function matrixMinor(matrix, skipRow, skipCol) {
    const rows = [];
    for (let row = 0; row < 3; row += 1) {
        if (row === skipRow) {
            continue;
        }
        const entries = [];
        for (let col = 0; col < 3; col += 1) {
            if (col === skipCol) {
                continue;
            }
            entries.push(Rational.from(matrix[row][col]));
        }
        rows.push(entries);
    }
    return rows[0][0].mul(rows[1][1]).sub(rows[0][1].mul(rows[1][0]));
}

export function invertMatrix3(matrix) {
    const determinant = determinant3(matrix);
    if (determinant.isZero()) {
        throw new Error('Matrix is not invertible.');
    }

    const cofactors = [
        [null, null, null],
        [null, null, null],
        [null, null, null],
    ];

    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            const sign = (row + col) % 2 === 0 ? 1n : -1n;
            cofactors[row][col] = matrixMinor(matrix, row, col).mul(new Rational(sign));
        }
    }

    const adjugate = [
        [cofactors[0][0], cofactors[1][0], cofactors[2][0]],
        [cofactors[0][1], cofactors[1][1], cofactors[2][1]],
        [cofactors[0][2], cofactors[1][2], cofactors[2][2]],
    ];

    return adjugate.map((row) => row.map((entry) => entry.div(determinant)));
}

function swapColumns(matrix, left, right) {
    if (left === right) {
        return;
    }
    for (let row = 0; row < 3; row += 1) {
        [matrix[row][left], matrix[row][right]] = [matrix[row][right], matrix[row][left]];
    }
}

function scaleColumn(matrix, col, scalar) {
    const factor = Rational.from(scalar);
    for (let row = 0; row < 3; row += 1) {
        matrix[row][col] = matrix[row][col].mul(factor);
    }
}

function addColumnMultiple(matrix, target, source, coeff) {
    const scale = Rational.from(coeff);
    if (scale.isZero()) {
        return;
    }
    for (let row = 0; row < 3; row += 1) {
        matrix[row][target] = matrix[row][target].sub(scale.mul(matrix[row][source]));
    }
}

function scaleMatrix(matrix, scalar) {
    const factor = Rational.from(scalar);
    for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
            matrix[row][col] = matrix[row][col].mul(factor);
        }
    }
}

function unitInverse(q, p) {
    const rational = Rational.from(q);
    const pivotVal = val(rational, p);
    const pPower = stepRational(p, pivotVal);
    const unit = rational.div(pPower);
    return new Rational(unit.den, unit.num);
}

function cleanUpperTriangular(matrix) {
    for (let row = 1; row < 3; row += 1) {
        for (let col = 0; col < row; col += 1) {
            matrix[row][col] = new Rational(0n);
        }
    }
}

export function hermiteNormalForm3(matrix, p) {
    const prime = BigInt(p);
    const work = cloneMatrix(matrix);

    for (let pivotRow = 2; pivotRow >= 0; pivotRow -= 1) {
        let bestCol = -1;
        let bestVal = Infinity;

        for (let col = 0; col <= pivotRow; col += 1) {
            const entry = work[pivotRow][col];
            if (entry.isZero()) {
                continue;
            }
            const entryVal = val(entry, prime);
            if (entryVal < bestVal) {
                bestVal = entryVal;
                bestCol = col;
            }
        }

        if (bestCol === -1) {
            throw new Error('Matrix does not have full rank over Q_p.');
        }

        swapColumns(work, bestCol, pivotRow);
        scaleColumn(work, pivotRow, unitInverse(work[pivotRow][pivotRow], prime));

        for (let col = 0; col < pivotRow; col += 1) {
            if (work[pivotRow][col].isZero()) {
                continue;
            }
            const coeff = work[pivotRow][col].div(work[pivotRow][pivotRow]);
            if (val(coeff, prime) < 0) {
                throw new Error('Hermite reduction produced a non-integral coefficient.');
            }
            addColumnMultiple(work, col, pivotRow, coeff);
            work[pivotRow][col] = new Rational(0n);
        }
    }

    let diagonalVals = [0, 1, 2].map((idx) => val(work[idx][idx], prime));
    const minDiagonal = Math.min(...diagonalVals);
    if (minDiagonal !== 0) {
        scaleMatrix(work, stepRational(prime, -minDiagonal));
        diagonalVals = diagonalVals.map((entry) => entry - minDiagonal);
    }

    for (let col = 1; col < 3; col += 1) {
        for (let row = col - 1; row >= 0; row -= 1) {
            const residue = canonicalizeQ(work[row][col], diagonalVals[row], prime);
            const delta = work[row][col].sub(residue).div(work[row][row]);
            addColumnMultiple(work, col, row, delta);
            work[row][col] = residue;
        }
    }

    cleanUpperTriangular(work);
    return work;
}

function formatMatrixKey(matrix) {
    const entries = [];
    for (let row = 0; row < 3; row += 1) {
        for (let col = row; col < 3; col += 1) {
            entries.push(matrix[row][col].toString());
        }
    }
    return entries.join('|');
}

export function matrixToRows(matrix) {
    return matrix.map((row) => row.map((entry) => Rational.from(entry).toString()));
}

export function canonicalizeLatticeClass(matrix, p) {
    const prime = BigInt(p);
    const canonicalMatrix = hermiteNormalForm3(matrix, prime);
    const diagonal = [0, 1, 2].map((idx) => val(canonicalMatrix[idx][idx], prime));
    const determinantVal = diagonal[0] + diagonal[1] + diagonal[2];
    const type = ((determinantVal % 3) + 3) % 3;
    const id = `v:${formatMatrixKey(canonicalMatrix)}`;

    return {
        id,
        matrix: canonicalMatrix,
        diagonal,
        determinantVal,
        type,
        rows: matrixToRows(canonicalMatrix),
    };
}

function hashTemplateKey(parts) {
    return parts.join(':');
}

function modInt(value, p) {
    const modulus = Number(p);
    const residue = value % modulus;
    return residue >= 0 ? residue : residue + modulus;
}

function inverseModInt(value, p) {
    const modulus = Number(p);
    let a = modInt(value, modulus);
    if (a === 0) {
        throw new Error('Cannot invert zero modulo p.');
    }

    let t = 0;
    let newT = 1;
    let r = modulus;
    let newR = a;

    while (newR !== 0) {
        const quotient = Math.floor(r / newR);
        [t, newT] = [newT, t - quotient * newT];
        [r, newR] = [newR, r - quotient * newR];
    }

    if (r !== 1) {
        throw new Error('Value is not invertible modulo p.');
    }

    return modInt(t, modulus);
}

function vectorDotMod(left, right, p) {
    return modInt(left[0] * right[0] + left[1] * right[1] + left[2] * right[2], p);
}

function rankModP(vectors, p) {
    if (vectors.length === 0) {
        return 0;
    }

    const matrix = vectors.map((vector) => vector.map((entry) => modInt(entry, p)));
    let rank = 0;
    let pivotRow = 0;

    for (let col = 0; col < 3 && pivotRow < matrix.length; col += 1) {
        let best = -1;
        for (let row = pivotRow; row < matrix.length; row += 1) {
            if (matrix[row][col] !== 0) {
                best = row;
                break;
            }
        }
        if (best === -1) {
            continue;
        }

        [matrix[pivotRow], matrix[best]] = [matrix[best], matrix[pivotRow]];
        const inv = inverseModInt(matrix[pivotRow][col], p);

        for (let entry = col; entry < 3; entry += 1) {
            matrix[pivotRow][entry] = modInt(matrix[pivotRow][entry] * inv, p);
        }

        for (let row = 0; row < matrix.length; row += 1) {
            if (row === pivotRow || matrix[row][col] === 0) {
                continue;
            }
            const factor = matrix[row][col];
            for (let entry = col; entry < 3; entry += 1) {
                matrix[row][entry] = modInt(matrix[row][entry] - factor * matrix[pivotRow][entry], p);
            }
        }

        rank += 1;
        pivotRow += 1;
    }

    return rank;
}

function standardBasis() {
    return [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ];
}

function completeBasis(seedVectors, p) {
    const basis = seedVectors.map((vector) => vector.slice());
    for (const candidate of standardBasis()) {
        if (rankModP([...basis, candidate], p) > basis.length) {
            basis.push(candidate.slice());
        }
        if (basis.length === 3) {
            break;
        }
    }

    if (basis.length !== 3) {
        throw new Error('Unable to extend a basis over F_p.');
    }

    return basis;
}

function columnVectorsToMatrix(columns) {
    return [
        columns.map((column) => new Rational(BigInt(column[0]))),
        columns.map((column) => new Rational(BigInt(column[1]))),
        columns.map((column) => new Rational(BigInt(column[2]))),
    ];
}

function scaledIntegerVector(vector, scalar) {
    const scale = BigInt(scalar);
    return vector.map((entry) => scale * BigInt(entry));
}

function buildLineTemplate(vector, p) {
    const basis = completeBasis([vector], p);
    const columns = [
        basis[0].map((entry) => BigInt(entry)),
        scaledIntegerVector(basis[1], p),
        scaledIntegerVector(basis[2], p),
    ];

    return {
        key: hashTemplateKey(['line', ...vector]),
        vector: vector.slice(),
        matrix: columnVectorsToMatrix(columns),
    };
}

function buildPlaneTemplate(normal, p) {
    let planeBasis;

    if (normal[2] !== 0) {
        const inv = inverseModInt(normal[2], p);
        planeBasis = [
            [1, 0, modInt(-normal[0] * inv, p)],
            [0, 1, modInt(-normal[1] * inv, p)],
        ];
    } else if (normal[1] !== 0) {
        const inv = inverseModInt(normal[1], p);
        planeBasis = [
            [1, modInt(-normal[0] * inv, p), 0],
            [0, 0, 1],
        ];
    } else {
        planeBasis = [
            [0, 1, 0],
            [0, 0, 1],
        ];
    }

    const fullBasis = completeBasis(planeBasis, p);
    const columns = [
        fullBasis[0].map((entry) => BigInt(entry)),
        fullBasis[1].map((entry) => BigInt(entry)),
        scaledIntegerVector(fullBasis[2], p),
    ];

    return {
        key: hashTemplateKey(['plane', ...normal]),
        normal: normal.slice(),
        matrix: columnVectorsToMatrix(columns),
    };
}

const subspaceCache = new Map();

export function enumerateSubspaceTemplates(p) {
    const prime = Number(p);
    const cacheKey = String(prime);
    if (subspaceCache.has(cacheKey)) {
        return subspaceCache.get(cacheKey);
    }

    const lines = [];
    for (let a = 0; a < prime; a += 1) {
        for (let b = 0; b < prime; b += 1) {
            lines.push(buildLineTemplate([1, a, b], prime));
        }
    }
    for (let a = 0; a < prime; a += 1) {
        lines.push(buildLineTemplate([0, 1, a], prime));
    }
    lines.push(buildLineTemplate([0, 0, 1], prime));

    const planes = [];
    for (let a = 0; a < prime; a += 1) {
        for (let b = 0; b < prime; b += 1) {
            planes.push(buildPlaneTemplate([1, a, b], prime));
        }
    }
    for (let a = 0; a < prime; a += 1) {
        planes.push(buildPlaneTemplate([0, 1, a], prime));
    }
    planes.push(buildPlaneTemplate([0, 0, 1], prime));

    const planeLookup = new Map(planes.map((plane) => [plane.key, plane]));
    const flags = [];
    for (const line of lines) {
        for (const plane of planes) {
            if (vectorDotMod(line.vector, plane.normal, prime) === 0) {
                flags.push([line.key, plane.key]);
            }
        }
    }

    const out = { lines, planes, planeLookup, flags };
    subspaceCache.set(cacheKey, out);
    return out;
}

function edgeKey(a, b) {
    return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function wordKeyToTokens(key) {
    if (!key) {
        return [];
    }
    return key.split(',');
}

export function formatWordKey(key) {
    const tokens = wordKeyToTokens(key);
    return tokens.length === 0 ? 'e' : tokens.join(' ');
}

function inverseLetterId(letterId) {
    return letterId.endsWith('^-1') ? letterId.slice(0, -4) : `${letterId}^-1`;
}

function buildGeneratorLetters(generators) {
    return generators.flatMap((generator, index) => {
        const label = `g${index + 1}`;
        return [
            { id: label, matrix: generator, generatorIndex: index, inverse: false, inverseOf: `${label}^-1` },
            { id: `${label}^-1`, matrix: invertMatrix3(generator), generatorIndex: index, inverse: true, inverseOf: label },
        ];
    });
}

function createOrbitEntry(vertexId, word, length) {
    return {
        vertexId,
        minLength: length,
        wordCount: 1,
        words: [word],
    };
}

function maybeStoreWord(entry, word) {
    entry.wordCount += 1;
    if (entry.words.length < 8) {
        entry.words.push(word);
    }
}

function getNeighborhood(vertex, prime, templates, cache) {
    if (cache.has(vertex.id)) {
        return cache.get(vertex.id);
    }

    const neighbors = [];
    const lineIds = new Map();
    const planeIds = new Map();

    for (const line of templates.lines) {
        const image = canonicalizeLatticeClass(multiplyMatrices(vertex.matrix, line.matrix), prime);
        neighbors.push({ kind: 'line', templateKey: line.key, vertex: image });
        lineIds.set(line.key, image.id);
    }

    for (const plane of templates.planes) {
        const image = canonicalizeLatticeClass(multiplyMatrices(vertex.matrix, plane.matrix), prime);
        neighbors.push({ kind: 'plane', templateKey: plane.key, vertex: image });
        planeIds.set(plane.key, image.id);
    }

    const chambers = [];
    for (const [lineKey, planeKey] of templates.flags) {
        chambers.push([vertex.id, lineIds.get(lineKey), planeIds.get(planeKey)]);
    }

    const out = { neighbors, chambers };
    cache.set(vertex.id, out);
    return out;
}

export function buildBuildingModel({
    prime,
    generators,
    wordLength,
    neighborRadius,
    maxOrbitStates = 420,
    maxPatchVertices = 900,
} = {}) {
    const p = BigInt(prime);
    if (!isPrimeBigInt(p)) {
        throw new Error(`${prime} is not prime.`);
    }

    if (!Array.isArray(generators) || generators.length === 0) {
        throw new Error('Add at least one invertible 3x3 matrix.');
    }

    const warnings = [];
    if (p > 11n) {
        warnings.push('Large primes produce extremely dense local chamber fans. This viewer is intended for small primes.');
    }

    const templates = enumerateSubspaceTemplates(p);
    const letters = buildGeneratorLetters(generators);
    const vertexPool = new Map();
    const baseVertex = canonicalizeLatticeClass(identityMatrix3(), p);
    vertexPool.set(baseVertex.id, baseVertex);

    const orbitMap = new Map();
    orbitMap.set(baseVertex.id, createOrbitEntry(baseVertex.id, 'e', 0));

    const states = new Map();
    states.set('', {
        key: '',
        vertexId: baseVertex.id,
        parent: null,
        lastLetter: null,
        length: 0,
    });

    const queue = [''];
    let orbitLimitHit = false;

    while (queue.length > 0 && !orbitLimitHit) {
        const key = queue.shift();
        const state = states.get(key);
        if (state.length >= wordLength) {
            continue;
        }

        const currentVertex = vertexPool.get(state.vertexId);
        for (const letter of letters) {
            if (state.lastLetter && letter.id === inverseLetterId(state.lastLetter)) {
                continue;
            }

            const nextKey = key ? `${key},${letter.id}` : letter.id;
            if (states.has(nextKey)) {
                continue;
            }

            const image = canonicalizeLatticeClass(multiplyMatrices(letter.matrix, currentVertex.matrix), p);
            if (!vertexPool.has(image.id)) {
                vertexPool.set(image.id, image);
            }

            const nextState = {
                key: nextKey,
                vertexId: image.id,
                parent: key,
                lastLetter: letter.id,
                length: state.length + 1,
            };
            states.set(nextKey, nextState);
            queue.push(nextKey);

            const displayWord = formatWordKey(nextKey);
            if (!orbitMap.has(image.id)) {
                orbitMap.set(image.id, createOrbitEntry(image.id, displayWord, nextState.length));
            } else {
                const entry = orbitMap.get(image.id);
                if (nextState.length < entry.minLength) {
                    entry.minLength = nextState.length;
                }
                maybeStoreWord(entry, displayWord);
            }

            if (states.size >= maxOrbitStates) {
                orbitLimitHit = true;
                warnings.push(`Orbit truncated after ${maxOrbitStates} reduced words. Lower the word length or number of generators for a fuller picture.`);
                break;
            }
        }
    }

    const nodes = new Map();
    for (const vertexId of orbitMap.keys()) {
        nodes.set(vertexId, vertexPool.get(vertexId));
    }

    const edges = new Map();
    const chambers = new Set();
    const patchDistance = new Map();
    const patchQueue = [];

    for (const vertexId of orbitMap.keys()) {
        patchDistance.set(vertexId, 0);
        patchQueue.push(vertexId);
    }

    const neighborhoodCache = new Map();
    let patchLimitHit = false;

    while (patchQueue.length > 0 && !patchLimitHit) {
        const originId = patchQueue.shift();
        const origin = nodes.get(originId) || vertexPool.get(originId);
        const dist = patchDistance.get(originId) ?? 0;
        if (dist >= neighborRadius) {
            continue;
        }
        const neighborhood = getNeighborhood(origin, p, templates, neighborhoodCache);

        for (const neighbor of neighborhood.neighbors) {
            if (!vertexPool.has(neighbor.vertex.id)) {
                vertexPool.set(neighbor.vertex.id, neighbor.vertex);
            }
            if (!nodes.has(neighbor.vertex.id)) {
                nodes.set(neighbor.vertex.id, neighbor.vertex);
                if (nodes.size >= maxPatchVertices) {
                    patchLimitHit = true;
                    warnings.push(`Local building patch truncated after ${maxPatchVertices} vertices. Reduce the radius or word length to keep the picture legible.`);
                    break;
                }
            }

            const key = edgeKey(originId, neighbor.vertex.id);
            if (!edges.has(key)) {
                edges.set(key, {
                    id: key,
                    source: originId,
                    target: neighbor.vertex.id,
                });
            }

            if (!patchDistance.has(neighbor.vertex.id)) {
                patchDistance.set(neighbor.vertex.id, dist + 1);
                patchQueue.push(neighbor.vertex.id);
            }
        }

        if (patchLimitHit) {
            break;
        }

        for (const chamber of neighborhood.chambers) {
            if (chamber.every((vertexId) => nodes.has(vertexId))) {
                chambers.add(chamber.slice().sort().join('::'));
            }
        }
    }

    const nodeList = Array.from(nodes.values()).map((vertex) => {
        const orbitEntry = orbitMap.get(vertex.id);
        return {
            ...vertex,
            inOrbit: Boolean(orbitEntry),
            minLength: orbitEntry ? orbitEntry.minLength : Infinity,
            words: orbitEntry ? orbitEntry.words.slice() : [],
            wordCount: orbitEntry ? orbitEntry.wordCount : 0,
        };
    });

    const chamberList = Array.from(chambers).map((key) => {
        const [a, b, c] = key.split('::');
        return { id: key, vertices: [a, b, c] };
    });

    return {
        prime: p,
        warnings,
        letters,
        baseVertexId: baseVertex.id,
        nodes: nodeList,
        edges: Array.from(edges.values()),
        chambers: chamberList,
        orbitMap,
        states,
        vertexPool,
    };
}
