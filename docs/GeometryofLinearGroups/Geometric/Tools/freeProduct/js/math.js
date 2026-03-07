// 3x3 Matrix arithmetic for SL_3(Z[1/2])
// All entries are dyadic rationals — exact as IEEE 754 doubles for moderate word lengths.

export class Mat3 {
    constructor(e) { this.e = e; } // e = [[a00,a01,a02],[a10,a11,a12],[a20,a21,a22]]

    static id() { return new Mat3([[1, 0, 0], [0, 1, 0], [0, 0, 1]]); }
    static diag(a, b, c) { return new Mat3([[a, 0, 0], [0, b, 0], [0, 0, c]]); }

    mul(B) {
        const A = this.e, b = B.e, r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
                for (let k = 0; k < 3; k++)
                    r[i][j] += A[i][k] * b[k][j];
        return new Mat3(r);
    }

    det() {
        const e = this.e;
        return e[0][0] * (e[1][1] * e[2][2] - e[1][2] * e[2][1])
            - e[0][1] * (e[1][0] * e[2][2] - e[1][2] * e[2][0])
            + e[0][2] * (e[1][0] * e[2][1] - e[1][1] * e[2][0]);
    }

    inv() {
        const e = this.e, d = this.det();
        if (Math.abs(d) < 1e-15) throw new Error("Singular matrix");
        const c = [
            [e[1][1] * e[2][2] - e[1][2] * e[2][1], -(e[0][1] * e[2][2] - e[0][2] * e[2][1]), e[0][1] * e[1][2] - e[0][2] * e[1][1]],
            [-(e[1][0] * e[2][2] - e[1][2] * e[2][0]), e[0][0] * e[2][2] - e[0][2] * e[2][0], -(e[0][0] * e[1][2] - e[0][2] * e[1][0])],
            [e[1][0] * e[2][1] - e[1][1] * e[2][0], -(e[0][0] * e[2][1] - e[0][1] * e[2][0]), e[0][0] * e[1][1] - e[0][1] * e[1][0]]
        ];
        return new Mat3(c.map(row => row.map(x => x / d)));
    }

    apply(v) {
        const e = this.e;
        return [
            e[0][0] * v[0] + e[0][1] * v[1] + e[0][2] * v[2],
            e[1][0] * v[0] + e[1][1] * v[1] + e[1][2] * v[2],
            e[2][0] * v[0] + e[2][1] * v[1] + e[2][2] * v[2]
        ];
    }

    isIdentity(tol = 1e-9) {
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
                if (Math.abs(this.e[i][j] - (i === j ? 1 : 0)) > tol) return false;
        return true;
    }

    trace() { return this.e[0][0] + this.e[1][1] + this.e[2][2]; }

    key() { return this.e.flat().map(x => x.toFixed(10)).join(','); }

    eigenvalues() {
        // Characteristic polynomial: -λ³ + tr·λ² - q·λ + det = 0
        // Equivalently: λ³ + p·λ² + q·λ + r = 0 where p=-tr, r=-det
        const e = this.e;
        const tr = this.trace();
        const q = e[0][0] * e[1][1] - e[0][1] * e[1][0]
            + e[0][0] * e[2][2] - e[0][2] * e[2][0]
            + e[1][1] * e[2][2] - e[1][2] * e[2][1];
        return solveCubic(-tr, q, -this.det());
    }

    spectralRadius() { return Math.max(...this.eigenvalues().map(Math.abs)); }

    toLatex() {
        return '\\begin{pmatrix} ' +
            this.e.map(row => row.map(fmtEntry).join(' & ')).join(' \\\\ ') +
            ' \\end{pmatrix}';
    }
}

function fmtEntry(x) {
    if (Math.abs(x - Math.round(x)) < 1e-10) return Math.round(x).toString();
    for (let k = 1; k <= 20; k++) {
        const s = x * (1 << k);
        if (Math.abs(s - Math.round(s)) < 1e-8) {
            const num = Math.round(s), den = 1 << k;
            const g = gcd(Math.abs(num), den);
            return `\\frac{${num / g}}{${den / g}}`;
        }
    }
    return x.toPrecision(4);
}

export function fmtEntryPlain(x) {
    if (Math.abs(x - Math.round(x)) < 1e-10) return Math.round(x).toString();
    for (let k = 1; k <= 20; k++) {
        const s = x * (1 << k);
        if (Math.abs(s - Math.round(s)) < 1e-8) {
            const num = Math.round(s), den = 1 << k;
            const g = gcd(Math.abs(num), den);
            return `${num / g}/${den / g}`;
        }
    }
    return x.toPrecision(4);
}

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }

function solveCubic(a, b, c) {
    // x³ + ax² + bx + c = 0
    const p = b - a * a / 3;
    const q = 2 * a * a * a / 27 - a * b / 3 + c;
    const D = q * q / 4 + p * p * p / 27;
    if (D < -1e-10) {
        const r = Math.sqrt(-p * p * p / 27);
        const theta = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r))));
        const m = 2 * Math.cbrt(r);
        return [
            m * Math.cos(theta / 3) - a / 3,
            m * Math.cos((theta + 2 * Math.PI) / 3) - a / 3,
            m * Math.cos((theta + 4 * Math.PI) / 3) - a / 3
        ];
    } else {
        const sqD = Math.sqrt(Math.max(0, D));
        const u = Math.cbrt(-q / 2 + sqD);
        const v = Math.cbrt(-q / 2 - sqD);
        if (Math.abs(D) < 1e-10) {
            return [u + v - a / 3, -(u + v) / 2 - a / 3, -(u + v) / 2 - a / 3];
        }
        // One real + two complex; return moduli for all
        const realRoot = u + v - a / 3;
        const re2 = -(u + v) / 2 - a / 3;
        const im2 = Math.abs(u - v) * Math.sqrt(3) / 2;
        const mod2 = Math.sqrt(re2 * re2 + im2 * im2);
        return [realRoot, mod2, mod2];
    }
}

// ===== Generators =====
export const genA = Mat3.diag(2, 0.25, 2);
export const genB = Mat3.diag(0.25, 2, 2);
export const genT = new Mat3([[6, 3, 2], [3, 2, 1], [2, 1, 1]]);

// Generator array: [a, a⁻¹, b, b⁻¹, t, t⁻¹]
export const gens = [genA, genA.inv(), genB, genB.inv(), genT, genT.inv()];
export const genLabels = ['a', 'b', 't'];

// Word encoding: 1=a, -1=a⁻¹, 2=b, -2=b⁻¹, 3=t, -3=t⁻¹
export function genIdxToWord(i) { return (i % 2 === 0) ? (i / 2 + 1) : -(Math.floor(i / 2) + 1); }
export function wordToGenIdx(w) { return w > 0 ? (w - 1) * 2 : (-w - 1) * 2 + 1; }

export function evalWord(word) {
    let M = Mat3.id();
    for (const w of word) M = M.mul(gens[wordToGenIdx(w)]);
    return M;
}

export function wordToLatex(word) {
    if (word.length === 0) return 'e';
    const groups = [];
    let i = 0;
    while (i < word.length) {
        let j = i + 1;
        while (j < word.length && word[j] === word[i]) j++;
        groups.push({ gen: word[i], count: j - i });
        i = j;
    }
    return groups.map(g => {
        const name = genLabels[Math.abs(g.gen) - 1];
        const exp = g.gen < 0 ? -g.count : g.count;
        if (exp === 1) return name;
        if (exp === -1) return name + '^{-1}';
        return name + '^{' + exp + '}';
    }).join('\\,');
}

export function reduceWord(word) {
    let w = [...word], changed = true;
    while (changed) {
        changed = false;
        const r = [];
        for (let i = 0; i < w.length; i++) {
            if (r.length > 0 && r[r.length - 1] === -w[i]) { r.pop(); changed = true; }
            else r.push(w[i]);
        }
        w = r;
    }
    return w;
}

// Classify word structure: count "t-syllables" (transitions between <a,b> and <t>)
export function treeDepth(word) {
    let depth = 0;
    for (const w of word) if (Math.abs(w) === 3) depth++;
    return depth;
}

// ===== BFS Group Enumeration =====
export function enumerate(maxLen) {
    const elts = new Map(); // key -> {mat, word, depth}
    const id = Mat3.id();
    elts.set(id.key(), { mat: id, word: [], depth: 0 });
    const queue = [{ mat: id, word: [], depth: 0, lastGen: -1 }];
    const edges = [];
    let head = 0;
    while (head < queue.length) {
        const { mat, word, depth, lastGen } = queue[head++];
        if (depth >= maxLen) continue;
        for (let i = 0; i < 6; i++) {
            if (lastGen >= 0 && i === (lastGen ^ 1)) continue;
            const next = mat.mul(gens[i]);
            const key = next.key();
            if (!elts.has(key)) {
                const nw = [...word, genIdxToWord(i)];
                elts.set(key, { mat: next, word: nw, depth: depth + 1 });
                queue.push({ mat: next, word: nw, depth: depth + 1, lastGen: i });
            }
            // edge
            const srcKey = mat.key();
            if (srcKey !== key) {
                edges.push({ src: srcKey, tgt: key, type: Math.floor(i / 2) });
            }
        }
    }
    return { elts, edges };
}

export function growthCounts(maxLen) {
    const counts = new Array(maxLen + 1).fill(0);
    const { elts } = enumerate(maxLen);
    for (const [, { depth }] of elts) counts[depth]++;
    return counts;
}

// ===== Sphere/Projective dynamics =====
export function normalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return len < 1e-15 ? [1, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

export function eigenvectors(M) {
    const evals = M.eigenvalues();
    return evals.map(lam => {
        const A = M.e.map((row, i) => row.map((x, j) => x - (i === j ? lam : 0)));
        // Null vector from cross products of rows
        let v = cross(A[0], A[1]);
        if (vnorm(v) < 1e-8) v = cross(A[0], A[2]);
        if (vnorm(v) < 1e-8) v = cross(A[1], A[2]);
        if (vnorm(v) < 1e-8) v = [1, 0, 0];
        return { eigenvalue: lam, eigenvector: normalize(v) };
    });
}

function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vnorm(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
