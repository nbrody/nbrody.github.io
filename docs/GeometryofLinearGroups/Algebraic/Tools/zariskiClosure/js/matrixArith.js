/**
 * matrixArith.js — Matrix arithmetic over number fields and Q
 */

// ─── RatMatrix: n x n matrix with BigRational entries ───

class RatMatrix {
    constructor(n, entries) {
        this.n = n;
        // entries[i][j] = BigRational
        this.entries = entries.map(row =>
            row.map(e => e instanceof BigRational ? e : BigRational.fromInt(e))
        );
    }

    static identity(n) {
        const entries = [];
        for (let i = 0; i < n; i++) {
            const row = new Array(n).fill(null).map(() => BigRational.ZERO);
            row[i] = BigRational.ONE;
            entries.push(row);
        }
        return new RatMatrix(n, entries);
    }

    static zero(n) {
        const entries = [];
        for (let i = 0; i < n; i++) {
            entries.push(new Array(n).fill(null).map(() => BigRational.ZERO));
        }
        return new RatMatrix(n, entries);
    }

    clone() {
        return new RatMatrix(this.n, this.entries.map(r => r.map(e => e.clone())));
    }

    get(i, j) { return this.entries[i][j]; }

    set(i, j, v) {
        this.entries[i][j] = v instanceof BigRational ? v : BigRational.fromInt(v);
    }

    add(other) {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < this.n; j++) {
                result[i].push(this.entries[i][j].add(other.entries[i][j]));
            }
        }
        return new RatMatrix(this.n, result);
    }

    sub(other) {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < this.n; j++) {
                result[i].push(this.entries[i][j].sub(other.entries[i][j]));
            }
        }
        return new RatMatrix(this.n, result);
    }

    mul(other) {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < other.n; j++) {
                let s = BigRational.ZERO;
                for (let k = 0; k < this.n; k++) {
                    s = s.add(this.entries[i][k].mul(other.entries[k][j]));
                }
                result[i].push(s);
            }
        }
        return new RatMatrix(this.n, result);
    }

    scale(r) {
        if (!(r instanceof BigRational)) r = BigRational.fromInt(r);
        return new RatMatrix(this.n,
            this.entries.map(row => row.map(e => e.mul(r)))
        );
    }

    transpose() {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < this.n; j++) {
                result[i].push(this.entries[j][i].clone());
            }
        }
        return new RatMatrix(this.n, result);
    }

    // Determinant via Gaussian elimination
    det() {
        const n = this.n;
        const m = this.entries.map(r => r.map(e => e.clone()));
        let d = BigRational.ONE;

        for (let col = 0; col < n; col++) {
            let pivotRow = -1;
            for (let row = col; row < n; row++) {
                if (!m[row][col].isZero()) { pivotRow = row; break; }
            }
            if (pivotRow === -1) return BigRational.ZERO;
            if (pivotRow !== col) {
                [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
                d = d.neg();
            }
            d = d.mul(m[col][col]);
            const pivotInv = m[col][col].inv();
            for (let row = col + 1; row < n; row++) {
                if (m[row][col].isZero()) continue;
                const factor = m[row][col].mul(pivotInv);
                for (let j = col; j < n; j++) {
                    m[row][j] = m[row][j].sub(factor.mul(m[col][j]));
                }
            }
        }
        return d;
    }

    // Inverse via augmented matrix Gaussian elimination
    inv() {
        const n = this.n;
        // Build [A | I]
        const aug = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) row.push(this.entries[i][j].clone());
            for (let j = 0; j < n; j++) row.push(i === j ? BigRational.ONE : BigRational.ZERO);
            aug.push(row);
        }

        // Forward elimination
        for (let col = 0; col < n; col++) {
            let pivotRow = -1;
            for (let row = col; row < n; row++) {
                if (!aug[row][col].isZero()) { pivotRow = row; break; }
            }
            if (pivotRow === -1) throw new Error('Matrix is singular');
            if (pivotRow !== col) [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

            const pivotInv = aug[col][col].inv();
            for (let j = col; j < 2 * n; j++) aug[col][j] = aug[col][j].mul(pivotInv);

            for (let row = 0; row < n; row++) {
                if (row === col || aug[row][col].isZero()) continue;
                const factor = aug[row][col];
                for (let j = col; j < 2 * n; j++) {
                    aug[row][j] = aug[row][j].sub(factor.mul(aug[col][j]));
                }
            }
        }

        // Extract inverse
        const result = [];
        for (let i = 0; i < n; i++) {
            result.push(aug[i].slice(n));
        }
        return new RatMatrix(n, result);
    }

    isIdentity() {
        for (let i = 0; i < this.n; i++) {
            for (let j = 0; j < this.n; j++) {
                const expected = i === j ? BigRational.ONE : BigRational.ZERO;
                if (!this.entries[i][j].equals(expected)) return false;
            }
        }
        return true;
    }

    isZero() {
        return this.entries.every(row => row.every(e => e.isZero()));
    }

    equals(other) {
        if (this.n !== other.n) return false;
        for (let i = 0; i < this.n; i++) {
            for (let j = 0; j < this.n; j++) {
                if (!this.entries[i][j].equals(other.entries[i][j])) return false;
            }
        }
        return true;
    }

    // Flat array of all entries (row-major) for polynomial evaluation
    flatEntries() {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            for (let j = 0; j < this.n; j++) {
                result.push(this.entries[i][j]);
            }
        }
        return result;
    }

    toLatex() {
        let s = '\\begin{pmatrix}';
        for (let i = 0; i < this.n; i++) {
            if (i > 0) s += ' \\\\ ';
            s += this.entries[i].map(e => e.toLatex()).join(' & ');
        }
        s += '\\end{pmatrix}';
        return s;
    }

    toString() {
        return this.entries.map(row =>
            '[' + row.map(e => e.toString()).join(', ') + ']'
        ).join('\n');
    }
}

// ─── NFMatrix: n x n matrix with NFElement entries ───

class NFMatrix {
    constructor(n, entries, field) {
        this.n = n;
        this.field = field;
        // entries[i][j] = NFElement
        this.entries = entries;
    }

    static identity(n, field) {
        const entries = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                row.push(i === j ? field.one() : field.zero());
            }
            entries.push(row);
        }
        return new NFMatrix(n, entries, field);
    }

    static zero(n, field) {
        const entries = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) row.push(field.zero());
            entries.push(row);
        }
        return new NFMatrix(n, entries, field);
    }

    clone() {
        return new NFMatrix(this.n,
            this.entries.map(r => r.map(e => e.clone())),
            this.field
        );
    }

    get(i, j) { return this.entries[i][j]; }

    add(other) {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < this.n; j++) {
                result[i].push(this.entries[i][j].add(other.entries[i][j]));
            }
        }
        return new NFMatrix(this.n, result, this.field);
    }

    sub(other) {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < this.n; j++) {
                result[i].push(this.entries[i][j].sub(other.entries[i][j]));
            }
        }
        return new NFMatrix(this.n, result, this.field);
    }

    mul(other) {
        const result = [];
        for (let i = 0; i < this.n; i++) {
            result.push([]);
            for (let j = 0; j < other.n; j++) {
                let s = this.field.zero();
                for (let k = 0; k < this.n; k++) {
                    s = s.add(this.entries[i][k].mul(other.entries[k][j]));
                }
                result[i].push(s);
            }
        }
        return new NFMatrix(this.n, result, this.field);
    }

    scale(r) {
        return new NFMatrix(this.n,
            this.entries.map(row => row.map(e => e.mul(r))),
            this.field
        );
    }

    // Determinant via cofactor expansion (for small matrices)
    // or Bareiss-like algorithm for larger ones
    det() {
        const n = this.n;
        if (n === 1) return this.entries[0][0];
        if (n === 2) {
            return this.entries[0][0].mul(this.entries[1][1])
                .sub(this.entries[0][1].mul(this.entries[1][0]));
        }
        if (n === 3) {
            const m = this.entries;
            return m[0][0].mul(m[1][1].mul(m[2][2]).sub(m[1][2].mul(m[2][1])))
                .sub(m[0][1].mul(m[1][0].mul(m[2][2]).sub(m[1][2].mul(m[2][0]))))
                .add(m[0][2].mul(m[1][0].mul(m[2][1]).sub(m[1][1].mul(m[2][0]))));
        }
        // General case: Gaussian elimination over the number field
        const m = this.entries.map(r => r.map(e => e.clone()));
        let d = this.field.one();
        for (let col = 0; col < n; col++) {
            let pivotRow = -1;
            for (let row = col; row < n; row++) {
                if (!m[row][col].isZero()) { pivotRow = row; break; }
            }
            if (pivotRow === -1) return this.field.zero();
            if (pivotRow !== col) {
                [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
                d = d.neg();
            }
            d = d.mul(m[col][col]);
            const pivotInv = m[col][col].inv();
            for (let row = col + 1; row < n; row++) {
                if (m[row][col].isZero()) continue;
                const factor = m[row][col].mul(pivotInv);
                for (let j = col; j < n; j++) {
                    m[row][j] = m[row][j].sub(factor.mul(m[col][j]));
                }
            }
        }
        return d;
    }

    // Inverse via augmented Gaussian elimination over number field
    inv() {
        const n = this.n;
        const aug = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) row.push(this.entries[i][j].clone());
            for (let j = 0; j < n; j++) row.push(i === j ? this.field.one() : this.field.zero());
            aug.push(row);
        }

        for (let col = 0; col < n; col++) {
            let pivotRow = -1;
            for (let row = col; row < n; row++) {
                if (!aug[row][col].isZero()) { pivotRow = row; break; }
            }
            if (pivotRow === -1) throw new Error('Matrix is singular');
            if (pivotRow !== col) [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

            const pivotInv = aug[col][col].inv();
            for (let j = col; j < 2 * n; j++) aug[col][j] = aug[col][j].mul(pivotInv);

            for (let row = 0; row < n; row++) {
                if (row === col || aug[row][col].isZero()) continue;
                const factor = aug[row][col];
                for (let j = col; j < 2 * n; j++) {
                    aug[row][j] = aug[row][j].sub(factor.mul(aug[col][j]));
                }
            }
        }

        const result = [];
        for (let i = 0; i < n; i++) {
            result.push(aug[i].slice(n));
        }
        return new NFMatrix(n, result, this.field);
    }

    isIdentity() {
        for (let i = 0; i < this.n; i++) {
            for (let j = 0; j < this.n; j++) {
                const expected = i === j ? this.field.one() : this.field.zero();
                if (!this.entries[i][j].equals(expected)) return false;
            }
        }
        return true;
    }

    isZero() {
        return this.entries.every(row => row.every(e => e.isZero()));
    }

    equals(other) {
        if (this.n !== other.n) return false;
        for (let i = 0; i < this.n; i++) {
            for (let j = 0; j < this.n; j++) {
                if (!this.entries[i][j].equals(other.entries[i][j])) return false;
            }
        }
        return true;
    }

    toLatex() {
        let s = '\\begin{pmatrix}';
        for (let i = 0; i < this.n; i++) {
            if (i > 0) s += ' \\\\ ';
            s += this.entries[i].map(e => e.toLatex()).join(' & ');
        }
        s += '\\end{pmatrix}';
        return s;
    }

    toString() {
        return this.entries.map(row =>
            '[' + row.map(e => e.toString()).join(', ') + ']'
        ).join('\n');
    }
}
