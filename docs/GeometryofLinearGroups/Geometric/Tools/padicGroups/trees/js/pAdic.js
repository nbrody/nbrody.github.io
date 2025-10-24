// --- BigInt Math Utilities ---

export const gcd = (a, b) => { a = a > 0n ? a : -a; b = b > 0n ? b : -b; while (b) { [a, b] = [b, a % b]; } return a; };
export const egcd = (a, m) => { if (a === 0n) return [m, 0n, 1n]; const [g, x1, y1] = egcd(m % a, a); return [g, y1 - (m / a) * x1, x1]; };
export const modInverse = (a, m) => { const [g, x] = egcd(a, m); if (g !== 1n) throw new Error('Modular inverse does not exist'); return (x % m + m) % m; };

// --- Rational Number Class ---

export class Rational {
    constructor(num, den = 1n) {
        if (typeof num === 'string') {
            const parts = num.split('/');
            this.num = BigInt(parts[0]);
            this.den = parts.length > 1 ? BigInt(parts[1]) : 1n;
        } else {
            this.num = BigInt(num);
            this.den = BigInt(den);
        }
        if (this.den === 0n) throw new Error("Denominator cannot be zero.");
        this.simplify();
    }
    simplify() {
        if (this.num === 0n) { this.den = 1n; return; }
        const common = gcd(this.num, this.den);
        this.num /= common; this.den /= common;
        if (this.den < 0n) { this.num = -this.num; this.den = -this.den; }
    }
    add(o) { return new Rational(this.num * o.den + o.num * this.den, this.den * o.den); }
    sub(o) { return new Rational(this.num * o.den - o.num * this.den, this.den * o.den); }
    mul(o) { return new Rational(this.num * o.num, this.den * o.den); }
    div(o) { return new Rational(this.num * o.den, this.den * o.num); }
    toString() { return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`; }
}

// --- p-adic Functions ---

export const integerExponent = (n, p) => {
    if (n === 0n || p <= 1n) return Infinity; n = n > 0n ? n : -n; let count = 0;
    while (n > 0n && n % p === 0n) { count++; n /= p; } return count;
};

export const val = (q, p) => integerExponent(q.num, p) - integerExponent(q.den, p);

export const pApprox = (q, p, pn) => {
    const n = integerExponent(pn, p);
    const t = val(q, p);
    if (n < t) return 0n;

    const vNum = integerExponent(q.num, p);
    const vDen = integerExponent(q.den, p);
    const pPowNum = p ** BigInt(vNum);
    const pPowDen = p ** BigInt(vDen);

    const u = q.num / pPowNum;
    const v = q.den / pPowDen;

    const mExp = n - t;
    const modUV = p ** BigInt(mExp);

    const uNorm = (u % modUV + modUV) % modUV;
    const vNorm = (v % modUV + modUV) % modUV;
    const vInv = modInverse(vNorm, modUV);

    const unitPart = (uNorm * vInv) % modUV;

    if (t >= 0) {
        const pPowT = p ** BigInt(t);
        return (unitPart * pPowT) % pn;
    } else {
        return 0n;
    }
};

export const Vert = (x, p) => {
    const [a, b, c, d] = [x[0][0], x[0][1], x[1][0], x[1][1]];
    const det = a.mul(d).sub(b.mul(c));
    if (val(c, p) < val(d, p)) {
        const k = val(det.div(c.mul(c)), p);
        const frac = a.div(c);
        return { k, q: canonicalizeQ(frac, k, p) };
    } else {
        const k = val(det.div(d.mul(d)), p);
        const frac = b.div(d);
        return { k, q: canonicalizeQ(frac, k, p) };
    }
};

export const ReduceVert = (v, p) => {
    const k = ('k' in v) ? v.k : integerExponent(v.pk, p);
    const qCanon = (v.q instanceof Rational) ? canonicalizeQ(v.q, k, p) : canonicalizeQ(new Rational(v.q), k, p);
    return { k, q: qCanon };
};

export const Act = (a, v, p) => {
    const pkRat = stepRational(p, v.k);
    const x = [
        [a[0][0].mul(pkRat), a[0][0].mul(v.q).add(a[0][1])],
        [a[1][0].mul(pkRat), a[1][0].mul(v.q).add(a[1][1])]
    ];
    const acted = Vert(x, p);
    return acted;
};

export const TDist = (v1, v2, p) => {
    const val_q_diff = val(v2.q.sub(v1.q), p);
    if (val_q_diff < Math.min(v1.k, v2.k)) {
        return v1.k + v2.k - 2 * val_q_diff;
    } else {
        return Math.abs(v1.k - v2.k);
    }
};

export const getNodeID = (k, q) => {
    const asStr = (q instanceof Rational) ? q.toString() : String(q);
    return `${k}-${asStr}`;
};

const powBig = (p, eAbs) => (p ** BigInt(eAbs));
export const stepRational = (p, k) => (k >= 0 ? new Rational(powBig(p, k), 1n) : new Rational(1n, powBig(p, -k)));

const floorDivRational = (a, b) => {
    const num = a.num * b.den;
    const den = a.den * b.num;
    return num / den;
};

const modRational = (a, b) => {
    const t = floorDivRational(a, b);
    return a.sub(new Rational(t).mul(b));
};

export const canonicalizeQ = (q, k, p) => {
    const asRat = (q instanceof Rational) ? q : new Rational(q);

    if (k >= 0) {
        const t = val(asRat, p);
        if (t >= 0) {
            const pk = p ** BigInt(k);
            const residue = pApprox(asRat, p, pk);
            return new Rational(residue, 1n);
        }
    }

    const step = stepRational(p, k);
    let r = asRat;
    if (r.num < 0n) {
        const t = ((-r.num) * step.den + (r.den * step.num) - 1n) / (r.den * step.num);
        r = r.add(new Rational(t).mul(step));
    }
    return modRational(r, step);
};

export function generateSubtree(p, k, q, currentDepth, maxDepth, nodeMap) {
    if (currentDepth > maxDepth) return null;
    const qCanon = (q instanceof Rational) ? canonicalizeQ(q, k, p) : canonicalizeQ(new Rational(q), k, p);
    const id = getNodeID(k, qCanon);
    if (nodeMap.has(id)) return nodeMap.get(id);

    const node = {
        name: `⌊${qCanon.toString()}⌋<sub>${k}</sub>`,
        id,
        k,
        q_num: qCanon.num,
        q_den: qCanon.den,
        children: []
    };
    nodeMap.set(id, node);

    if (currentDepth < maxDepth) {
        const step = stepRational(p, k);
        for (let i = 0n; i < p; i++) {
            const childQ = qCanon.add(step.mul(new Rational(i)));
            const childNode = generateSubtree(p, k + 1, childQ, currentDepth + 1, maxDepth, nodeMap);
            if (childNode) node.children.push(childNode);
        }
    }
    return node;
}
