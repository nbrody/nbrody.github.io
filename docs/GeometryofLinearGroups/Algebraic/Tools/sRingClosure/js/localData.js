/**
 * localData.js — Analyze local completions: which places have unbounded image
 */

class LocalFieldData {
    constructor(field, integralBasis, invertedPrimes) {
        this.field = field;
        this.integralBasis = integralBasis;
        this.invertedPrimes = invertedPrimes;
        this.archimedean = [];
        this.nonArchimedean = [];
    }

    compute() {
        this._computeArchimedean();
        this._computeNonArchimedean();
        return this;
    }

    _computeArchimedean() {
        const sig = this.field.signature();
        const roots = this.field.roots();

        // All archimedean places have unbounded image (since Z ⊂ R is unbounded in R)
        let idx = 0;

        // Real embeddings
        for (let i = 0; i < sig.r; i++) {
            this.archimedean.push({
                index: i + 1,
                isReal: true,
                isUnbounded: true,
                root: roots[idx],
                completionField: 'ℝ',
                completionLatex: '\\mathbb{R}',
                description: sig.r === 1 && sig.s === 0
                    ? 'Standard embedding in ℝ'
                    : `Real embedding σ_{${i + 1}}`
            });
            idx++;
        }

        // Complex conjugate pairs
        for (let i = 0; i < sig.s; i++) {
            this.archimedean.push({
                index: sig.r + i + 1,
                isReal: false,
                isUnbounded: true,
                root: roots[idx],
                completionField: 'ℂ',
                completionLatex: '\\mathbb{C}',
                description: `Complex embedding σ_{${sig.r + i + 1}}`
            });
            idx += 2; // skip conjugate
        }
    }

    _computeNonArchimedean() {
        // For each prime p ∈ S, the ring is unbounded at all places above p
        // Factor (p) in O_K to find the places

        for (const p of this.invertedPrimes) {
            const splitting = factorPrimeInField(p, this.field.minPoly);

            for (let i = 0; i < splitting.length; i++) {
                const factor = splitting[i];
                const e = factor.e;  // ramification index
                const f = factor.f;  // residue degree

                let completionField, completionLatex;
                if (this.field.n === 1) {
                    // K = Q
                    completionField = `ℚ_${p}`;
                    completionLatex = `\\mathbb{Q}_{${p}}`;
                } else if (e === 1 && f === 1) {
                    completionField = `ℚ_${p}`;
                    completionLatex = `\\mathbb{Q}_{${p}}`;
                } else {
                    const extDeg = e * f;
                    completionField = `K_{𝔭|${p}}`;
                    completionLatex = `K_{\\mathfrak{p}|${p}}`;
                    if (splitting.length > 1) {
                        completionField = `K_{𝔭_{${i + 1}}|${p}}`;
                        completionLatex = `K_{\\mathfrak{p}_{${i + 1}}|${p}}`;
                    }
                }

                this.nonArchimedean.push({
                    prime: p,
                    factorIndex: i,
                    ramification: e,
                    residueDegree: f,
                    localDegree: e * f,
                    isUnbounded: true, // p ∈ S means unbounded
                    completionField,
                    completionLatex,
                    description: this._primeDescription(p, e, f, splitting.length, i)
                });
            }
        }
    }

    _primeDescription(p, e, f, numFactors, idx) {
        const parts = [];
        if (e > 1) parts.push(`e = ${e}`);
        if (f > 1) parts.push(`f = ${f}`);

        let desc = '';
        if (numFactors === 1 && e === 1 && f === this.field.n) {
            desc = `${p} is inert`;
        } else if (numFactors === this.field.n && e === 1 && f === 1) {
            desc = `${p} splits completely`;
        } else if (e === this.field.n && f === 1 && numFactors === 1) {
            desc = `${p} is totally ramified`;
        } else {
            desc = parts.length > 0 ? `(${parts.join(', ')})` : '';
        }
        return desc;
    }

    // The product of all completions with unbounded image
    unboundedProduct() {
        const parts = [];
        for (const a of this.archimedean) {
            parts.push(a.completionField);
        }
        for (const na of this.nonArchimedean) {
            parts.push(na.completionField);
        }
        return parts.join(' × ') || 'none';
    }

    unboundedProductLatex() {
        const parts = [];
        for (const a of this.archimedean) {
            parts.push(a.completionLatex);
        }
        for (const na of this.nonArchimedean) {
            parts.push(na.completionLatex);
        }
        return parts.join(' \\times ') || '\\emptyset';
    }

    // Total number of unbounded places
    totalUnboundedPlaces() {
        return this.archimedean.length + this.nonArchimedean.length;
    }

    // Places where O_{K,S} is bounded (complement of unbounded)
    // These are the non-archimedean primes NOT in S
    boundedDescription() {
        if (this.field.n === 1) {
            return `Bounded at ℚ_p for all primes p ∉ {${this.invertedPrimes.join(', ')}}`;
        }
        return `Bounded at all non-archimedean places above primes p ∉ {${this.invertedPrimes.join(', ')}}`;
    }
}
