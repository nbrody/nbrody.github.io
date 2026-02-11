// quaternion.js — Core quaternion arithmetic and projective quaternion class

// ============================================================
// Quaternion math on 4-tuples [w, x, y, z]
// ============================================================
export const QMath = {
    multiply(q1, q2) {
        const [w1, x1, y1, z1] = q1;
        const [w2, x2, y2, z2] = q2;
        return [
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
        ];
    },

    conjugate: (q) => [q[0], -q[1], -q[2], -q[3]],
    normSq: (q) => q[0] ** 2 + q[1] ** 2 + q[2] ** 2 + q[3] ** 2,

    inverse(q) {
        const n2 = this.normSq(q);
        if (n2 === 0) return [0, 0, 0, 0];
        const c = this.conjugate(q);
        return [c[0] / n2, c[1] / n2, c[2] / n2, c[3] / n2];
    },

    areEqual(q1, q2, eps = 1e-9) {
        return q1.every((v, i) => Math.abs(v - q2[i]) < eps);
    },

    scale(q, s) { return [q[0] * s, q[1] * s, q[2] * s, q[3] * s]; },

    // Act on pure quaternion v = (0, x, y, z) by conjugation: q v q^-1
    actOnPure(q, v) {
        const pure = [0, v[0], v[1], v[2]];
        const result = this.multiply(this.multiply(q, pure), this.inverse(q));
        return [result[1], result[2], result[3]];
    }
};

// ============================================================
// BigInt quaternion arithmetic
// ============================================================
export const QBig = {
    multiply(a, b) {
        return [
            a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
            a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
            a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
            a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
        ];
    },

    conjugate: (q) => [q[0], -q[1], -q[2], -q[3]],
    normSq: (q) => q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3],

    gcd(a, b) {
        a = a < 0n ? -a : a;
        b = b < 0n ? -b : b;
        while (b > 0n) { const t = b; b = a % b; a = t; }
        return a;
    },

    contentGcd(q) {
        return q.reduce((acc, v) => this.gcd(acc, v), 0n);
    },

    primitize(q) {
        const g = this.contentGcd(q);
        return g > 1n ? q.map(x => x / g) : q;
    }
};

// ============================================================
// Format quaternion for LaTeX
// ============================================================
export function formatQuaternion(q) {
    const [w, x, y, z] = q;
    const parts = [];
    if (w !== 0) parts.push(String(w));
    const term = (coef, sym) => {
        if (coef === 0) return;
        const sign = coef > 0 ? (parts.length ? '+' : '') : '';
        const abs = Math.abs(coef);
        let str = sign;
        if (coef < 0) str += '-';
        if (abs !== 1) str += abs;
        str += sym;
        parts.push(str);
    };
    term(x, '\\mathbf{i}');
    term(y, '\\mathbf{j}');
    term(z, '\\mathbf{k}');
    return parts.length > 0 ? parts.join('') : '0';
}

export function formatBigQuaternion(q) {
    const labels = ['', '\\mathbf{i}', '\\mathbf{j}', '\\mathbf{k}'];
    let s = '';
    for (let i = 0; i < 4; i++) {
        const n = q[i];
        if (n === 0n) continue;
        const val = n < 0n ? -n : n;
        if (s.length > 0) s += n > 0n ? ' + ' : ' - ';
        else if (n < 0n) s += '-';
        if (val !== 1n || i === 0) s += val.toString();
        s += labels[i];
    }
    return s || '0';
}

// ============================================================
// Parse quaternion from text input
// ============================================================
export function parseQuaternion(input) {
    if (!input || typeof input !== 'string') return [0, 0, 0, 0];
    if (input.includes(',')) return input.split(',').map(s => parseInt(s.trim()) || 0);

    const q = [0, 0, 0, 0];
    let s = input.replace(/\s+/g, '')
        .replace(/\\mathbf\{([ijk])\}/g, '$1')
        .replace(/\\text\{([ijk])\}/g, '$1')
        .replace(/\\times/g, '*').replace(/\\cdot/g, '*')
        .replace(/[{}\\]/g, '');
    if (!s.startsWith('+') && !s.startsWith('-')) s = '+' + s;
    for (const m of s.matchAll(/([+-])(\d*)([ijk]?)/g)) {
        const sign = m[1] === '-' ? -1 : 1;
        const val = m[2] === '' ? 1 : parseInt(m[2]);
        const coeff = sign * val;
        if (m[3] === 'i') q[1] += coeff;
        else if (m[3] === 'j') q[2] += coeff;
        else if (m[3] === 'k') q[3] += coeff;
        else q[0] += coeff;
    }
    return q;
}

export function parseBigQuaternion(input) {
    if (!input || typeof input !== 'string') return [0n, 0n, 0n, 0n];
    if (input.includes(',')) return input.split(',').map(s => BigInt(s.trim() || 0));

    const q = [0n, 0n, 0n, 0n];
    let s = input.replace(/\s+/g, '')
        .replace(/\\mathbf\{([ijk])\}/g, '$1')
        .replace(/\\text\{([ijk])\}/g, '$1')
        .replace(/\\times/g, '*').replace(/\\cdot/g, '*')
        .replace(/[{}\\]/g, '');
    if (!s.startsWith('+') && !s.startsWith('-')) s = '+' + s;
    for (const m of s.matchAll(/([+-])(\d*)([ijk]?)/g)) {
        const sign = m[1] === '-' ? -1n : 1n;
        const val = m[2] === '' ? 1n : BigInt(m[2]);
        const coeff = sign * val;
        if (m[3] === 'i') q[1] += coeff;
        else if (m[3] === 'j') q[2] += coeff;
        else if (m[3] === 'k') q[3] += coeff;
        else q[0] += coeff;
    }
    return q;
}

// ============================================================
// Modular arithmetic
// ============================================================
export function modInverse(a, m) {
    a = ((a % m) + m) % m;
    let [old_r, r] = [a, m];
    let [old_s, s] = [1, 0];
    while (r !== 0) {
        const quotient = Math.floor(old_r / r);
        [old_r, r] = [r, old_r - quotient * r];
        [old_s, s] = [s, old_s - quotient * s];
    }
    return old_r === 1 ? ((old_s % m) + m) % m : null;
}

export function findXYSolution(p) {
    if (p % 4 === 1) {
        for (let x = 1; x < p; x++) {
            if ((x * x) % p === (p - 1)) return { x, y: 0 };
        }
    }
    for (let x = 0; x < p; x++) {
        for (let y = 1; y < p; y++) {
            if ((x * x + y * y) % p === (p - 1)) return { x, y };
        }
    }
    return null;
}

// ============================================================
// Projective Quaternion (identifies q ~ lambda*q)
// ============================================================
export class ProjQ {
    constructor(w, x, y, z) {
        let q = [w, x, y, z];
        const idx = q.findIndex(c => Math.abs(c) > 1e-10);
        if (idx !== -1 && q[idx] < 0) q = q.map(c => -c);
        [this.w, this.x, this.y, this.z] = q;
    }

    static from(arr) { return new ProjQ(arr[0], arr[1], arr[2], arr[3]); }
    toArray() { return [this.w, this.x, this.y, this.z]; }

    normSq() { return this.w ** 2 + this.x ** 2 + this.y ** 2 + this.z ** 2; }

    multiply(other) {
        const q = QMath.multiply(this.toArray(), other.toArray());
        return ProjQ.from(q);
    }

    inverse() {
        const n2 = this.normSq();
        return new ProjQ(this.w / n2, -this.x / n2, -this.y / n2, -this.z / n2);
    }

    equals(other, eps = 1e-9) {
        const q1 = this.toArray(), q2 = other.toArray();
        const idx = q1.findIndex(c => Math.abs(c) > eps);
        if (idx === -1) return q2.every(c => Math.abs(c) < eps);
        if (Math.abs(q2[idx]) < eps) return false;
        const ratio = q2[idx] / q1[idx];
        return q1.every((v, i) => Math.abs(v * ratio - q2[i]) < eps);
    }

    hash() {
        const r = x => Math.round(x * 1e6) / 1e6;
        return `${r(this.w)},${r(this.x)},${r(this.y)},${r(this.z)}`;
    }

    // Act on pure quaternion (0,vx,vy,vz) by conjugation
    actOnPure(v) {
        const q = this.toArray();
        return QMath.actOnPure(q, v);
    }
}

// ============================================================
// Integer factorization
// ============================================================
export function getPrimeFactors(n) {
    const factors = {};
    let d = 2, temp = n;
    while (d * d <= temp) {
        while (temp % d === 0) { factors[d] = (factors[d] || 0) + 1; temp /= d; }
        d++;
    }
    if (temp > 1) factors[temp] = (factors[temp] || 0) + 1;
    return factors;
}

// Q8 units
const Q_UNITS = [
    [1, 0, 0, 0], [-1, 0, 0, 0],
    [0, 1, 0, 0], [0, -1, 0, 0],
    [0, 0, 1, 0], [0, 0, -1, 0],
    [0, 0, 0, 1], [0, 0, 0, -1]
];

export function areEquivalent(q1, q2) {
    if (!q1 || !q2) return false;
    for (const u of Q_UNITS) {
        if (QMath.areEqual(q1, QMath.multiply(q2, u))) return true;
    }
    return false;
}

export function canonicalize(q) {
    let best = q;
    for (const u of Q_UNITS) {
        const qu = QMath.multiply(q, u);
        if (qu.join(',') < best.join(',')) best = qu;
    }
    const first = best.find(x => x !== 0);
    if (first < 0) best = best.map(x => -x);
    return best;
}
