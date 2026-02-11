/**
 * algebraicGroup.js — Algebraic group definitions via coordinate rings
 *
 * An algebraic group G ⊂ GL_n is specified by polynomial equations
 * in the matrix entry variables x_{ij} (1-indexed, row-major).
 */

class AlgebraicGroup {
    /**
     * @param {string} name - Display name
     * @param {number} n - Matrix size (G ⊂ GL_n)
     * @param {QMvPoly[]} equations - Defining equations (each = 0)
     * @param {string} latexName - LaTeX display name
     * @param {number} dim - Dimension of the group (-1 if unknown)
     */
    constructor(name, n, equations, latexName, dim = -1) {
        this.name = name;
        this.n = n;
        this.numVars = n * n; // variables x_{11}, x_{12}, ..., x_{nn}
        this.equations = equations;
        this.latexName = latexName || name;
        this._dim = dim;
    }

    dim() { return this._dim; }

    // Variable index for entry (i,j) (0-indexed row, col)
    static varIndex(i, j, n) {
        return i * n + j;
    }

    // Variable name for entry (i,j) in LaTeX
    static varName(i, j) {
        return `x_{${i + 1}${j + 1}}`;
    }

    // Check if a RatMatrix satisfies the defining equations
    containsMatrix(mat) {
        const point = mat.flatEntries();
        for (const eq of this.equations) {
            const val = AlgebraicGroup._evaluatePoly(eq, point);
            if (!val.isZero()) return false;
        }
        return true;
    }

    // Evaluate a QMvPoly at a point (array of BigRational)
    static _evaluatePoly(poly, point) {
        let result = BigRational.ZERO;
        for (const [key, coeff] of poly.terms) {
            const exp = Mono.fromKey(key);
            let term = coeff;
            for (let i = 0; i < exp.length; i++) {
                if (exp[i] > 0) {
                    term = term.mul(point[i].pow(exp[i]));
                }
            }
            result = result.add(term);
        }
        return result;
    }

    toLatex() {
        return this.latexName;
    }

    equationsLatex() {
        if (this.equations.length === 0) return '(\\text{no extra equations})';
        const varNames = [];
        for (let i = 0; i < this.n; i++) {
            for (let j = 0; j < this.n; j++) {
                varNames.push(`x_{${i + 1}${j + 1}}`);
            }
        }
        return this.equations.map(eq => eq.toLatex(varNames) + ' = 0').join(',\\quad ');
    }

    // ─── Preset Groups ───

    static GL(n) {
        return new AlgebraicGroup(
            `GL_${n}`, n, [],
            `\\mathrm{GL}_{${n}}`,
            n * n
        );
    }

    static SL(n) {
        // det(X) - 1 = 0
        const detPoly = AlgebraicGroup._detPolynomial(n);
        const detMinus1 = detPoly.sub(QMvPoly.fromConstant(n * n, 1));
        return new AlgebraicGroup(
            `SL_${n}`, n, [detMinus1],
            `\\mathrm{SL}_{${n}}`,
            n * n - 1
        );
    }

    static upperTriangular(n) {
        // x_{ij} = 0 for i > j
        const eqs = [];
        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                const idx = AlgebraicGroup.varIndex(i, j, n);
                const exp = new Array(n * n).fill(0);
                exp[idx] = 1;
                eqs.push(QMvPoly.monomial(n * n, exp, BigRational.ONE));
            }
        }
        return new AlgebraicGroup(
            `B_${n}`, n, eqs,
            `\\mathrm{B}_{${n}}`,
            n * (n + 1) / 2
        );
    }

    static unipotent(n) {
        // x_{ij} = 0 for i > j, and x_{ii} = 1 for all i
        const eqs = [];
        // Below diagonal
        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                const idx = AlgebraicGroup.varIndex(i, j, n);
                const exp = new Array(n * n).fill(0);
                exp[idx] = 1;
                eqs.push(QMvPoly.monomial(n * n, exp, BigRational.ONE));
            }
        }
        // Diagonal - 1
        for (let i = 0; i < n; i++) {
            const idx = AlgebraicGroup.varIndex(i, i, n);
            const exp = new Array(n * n).fill(0);
            exp[idx] = 1;
            const p = QMvPoly.monomial(n * n, exp, BigRational.ONE)
                .sub(QMvPoly.fromConstant(n * n, 1));
            eqs.push(p);
        }
        return new AlgebraicGroup(
            `U_${n}`, n, eqs,
            `\\mathrm{U}_{${n}}`,
            n * (n - 1) / 2
        );
    }

    static diagonal(n) {
        // x_{ij} = 0 for i != j
        const eqs = [];
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const idx = AlgebraicGroup.varIndex(i, j, n);
                const exp = new Array(n * n).fill(0);
                exp[idx] = 1;
                eqs.push(QMvPoly.monomial(n * n, exp, BigRational.ONE));
            }
        }
        return new AlgebraicGroup(
            `T_${n}`, n, eqs,
            `\\mathrm{T}_{${n}}`,
            n
        );
    }

    // ─── Determinant polynomial ───

    static _detPolynomial(n) {
        // Compute det as a polynomial in x_{ij} variables
        // Using Leibniz formula: det = sum_{sigma} sgn(sigma) * prod x_{i,sigma(i)}
        const numVars = n * n;

        if (n === 1) {
            const exp = new Array(numVars).fill(0);
            exp[0] = 1;
            return QMvPoly.monomial(numVars, exp, BigRational.ONE);
        }

        // Generate all permutations of {0, ..., n-1}
        const perms = [];
        const permute = (arr, l, r) => {
            if (l === r) { perms.push(arr.slice()); return; }
            for (let i = l; i <= r; i++) {
                [arr[l], arr[i]] = [arr[i], arr[l]];
                permute(arr, l + 1, r);
                [arr[l], arr[i]] = [arr[i], arr[l]];
            }
        };
        const indices = [];
        for (let i = 0; i < n; i++) indices.push(i);
        permute(indices, 0, n - 1);

        let detPoly = QMvPoly.zero(numVars);
        for (const perm of perms) {
            const sign = AlgebraicGroup._permSign(perm);
            const exp = new Array(numVars).fill(0);
            for (let i = 0; i < n; i++) {
                exp[AlgebraicGroup.varIndex(i, perm[i], n)] += 1;
            }
            const term = QMvPoly.monomial(numVars, exp,
                sign > 0 ? BigRational.ONE : BigRational.MINUS_ONE);
            detPoly = detPoly.add(term);
        }
        return detPoly;
    }

    static _permSign(perm) {
        const n = perm.length;
        let inversions = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (perm[i] > perm[j]) inversions++;
            }
        }
        return inversions % 2 === 0 ? 1 : -1;
    }

    // ─── Available presets ───

    static PRESETS = [
        { label: 'GL_n', latex: '\\mathrm{GL}_n', factory: (n) => AlgebraicGroup.GL(n) },
        { label: 'SL_n', latex: '\\mathrm{SL}_n', factory: (n) => AlgebraicGroup.SL(n) },
        { label: 'B_n (upper triangular)', latex: '\\mathrm{B}_n', factory: (n) => AlgebraicGroup.upperTriangular(n) },
        { label: 'U_n (unipotent)', latex: '\\mathrm{U}_n', factory: (n) => AlgebraicGroup.unipotent(n) },
        { label: 'T_n (diagonal torus)', latex: '\\mathrm{T}_n', factory: (n) => AlgebraicGroup.diagonal(n) },
    ];
}
