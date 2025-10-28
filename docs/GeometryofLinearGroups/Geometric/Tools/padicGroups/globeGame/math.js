// === Exact rational arithmetic (BigInt) and 3x3 matrix utilities ===

const BI = (x) => BigInt(x);
const gcdBI = (a, b) => {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) {
        const t = a % b;
        a = b;
        b = t;
    }
    return a;
};

export class Frac {
    constructor(num, den = 1n) {
        if (den === 0n) throw new Error('Zero denominator');
        if (den < 0n) { num = -num; den = -den; }
        const g = gcdBI(num, den);
        this.n = num / g;
        this.d = den / g;
    }

    static from(a, b = 1) {
        return new Frac(BI(a), BI(b));
    }

    add(o) {
        return new Frac(this.n*o.d + o.n*this.d, this.d*o.d);
    }

    sub(o) {
        return new Frac(this.n*o.d - o.n*this.d, this.d*o.d);
    }

    mul(o) {
        return new Frac(this.n*o.n, this.d*o.d);
    }

    inv() {
        return new Frac(this.d, this.n);
    }

    toLatex() {
        if (this.d === 1n) return `${this.n}`;
        let d = this.d;
        let a = 0, b = 0;
        while (d % 5n === 0n) { d /= 5n; a++; }
        while (d % 13n === 0n) { d /= 13n; b++; }
        let factors = [];
        if (a > 0) factors.push(`5^{${a}}`);
        if (b > 0) factors.push(`13^{${b}}`);
        let denomStr = factors.length > 0 ? factors.join(' ') : `${this.d}`;
        return `\\frac{${this.n}}{${denomStr}}`;
    }
}

export const F = (a, b = 1) => Frac.from(a, b);

export const I3 = () => [[F(1),F(0),F(0)],[F(0),F(1),F(0)],[F(0),F(0),F(1)]];

export const matMul3 = (A, B) => {
    const C = [[F(0),F(0),F(0)],[F(0),F(0),F(0)],[F(0),F(0),F(0)]];
    for (let i=0; i<3; i++) {
        for (let j=0; j<3; j++) {
            let s = F(0);
            for (let k=0; k<3; k++) {
                s = s.add(A[i][k].mul(B[k][j]));
            }
            C[i][j] = s;
        }
    }
    return C;
};

export const cloneFrac = (f) => new Frac(f.n, f.d);

export const cloneMat3 = (M) => M.map(row => row.map(cloneFrac));

export const transpose3 = (M) => [
    [cloneFrac(M[0][0]), cloneFrac(M[1][0]), cloneFrac(M[2][0])],
    [cloneFrac(M[0][1]), cloneFrac(M[1][1]), cloneFrac(M[2][1])],
    [cloneFrac(M[0][2]), cloneFrac(M[1][2]), cloneFrac(M[2][2])]
];
