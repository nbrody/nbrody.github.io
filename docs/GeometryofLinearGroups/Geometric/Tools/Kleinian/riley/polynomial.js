// Polynomial class for operations
class Polynomial {
    constructor(coeffs) {
        // coeffs[i] is coefficient of z^i
        this.coeffs = coeffs.slice();
        this.trim();
    }

    trim() {
        while (this.coeffs.length > 1 && Math.abs(this.coeffs[this.coeffs.length - 1]) < 1e-10) {
            this.coeffs.pop();
        }
        if (this.coeffs.length === 0) {
            this.coeffs = [0];
        }
    }

    static fromConstant(c) {
        return new Polynomial([c]);
    }

    add(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = new Array(maxLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            result[i] += this.coeffs[i];
        }
        for (let i = 0; i < other.coeffs.length; i++) {
            result[i] += other.coeffs[i];
        }
        return new Polynomial(result);
    }

    subtract(other) {
        const maxLen = Math.max(this.coeffs.length, other.coeffs.length);
        const result = new Array(maxLen).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            result[i] += this.coeffs[i];
        }
        for (let i = 0; i < other.coeffs.length; i++) {
            result[i] -= other.coeffs[i];
        }
        return new Polynomial(result);
    }

    multiply(other) {
        const result = new Array(this.coeffs.length + other.coeffs.length - 1).fill(0);
        for (let i = 0; i < this.coeffs.length; i++) {
            for (let j = 0; j < other.coeffs.length; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }
        return new Polynomial(result);
    }

    toString() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (Math.abs(coeff) < 1e-10) continue;

            let term = '';
            const absCoeff = Math.abs(coeff);

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1) {
                    term = 'z';
                } else {
                    term = `${absCoeff}z`;
                }
            } else {
                if (absCoeff === 1) {
                    term = `z^${i}`;
                } else {
                    term = `${absCoeff}z^${i}`;
                }
            }

            if (coeff < 0) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }

    // Convert to LaTeX format for MathJax
    toLatex() {
        const terms = [];
        for (let i = this.coeffs.length - 1; i >= 0; i--) {
            const coeff = this.coeffs[i];
            if (Math.abs(coeff) < 1e-10) continue;

            let term = '';
            const absCoeff = Math.abs(coeff);

            if (i === 0) {
                term = absCoeff.toString();
            } else if (i === 1) {
                if (absCoeff === 1) {
                    term = 'z';
                } else {
                    term = `${absCoeff}z`;
                }
            } else {
                if (absCoeff === 1) {
                    term = `z^{${i}}`;
                } else {
                    term = `${absCoeff}z^{${i}}`;
                }
            }

            if (coeff < 0) {
                term = terms.length > 0 ? `- ${term}` : `-${term}`;
            } else if (terms.length > 0) {
                term = `+ ${term}`;
            }

            terms.push(term);
        }
        return terms.length > 0 ? terms.join(' ') : '0';
    }

    // Evaluate polynomial at complex number z = re + im*i
    evaluateComplex(re, im) {
        let resultRe = 0;
        let resultIm = 0;
        let powerRe = 1;
        let powerIm = 0;

        for (let i = 0; i < this.coeffs.length; i++) {
            // Add coeff * power to result
            resultRe += this.coeffs[i] * powerRe;
            resultIm += this.coeffs[i] * powerIm;

            // Multiply power by z
            const newPowerRe = powerRe * re - powerIm * im;
            const newPowerIm = powerRe * im + powerIm * re;
            powerRe = newPowerRe;
            powerIm = newPowerIm;
        }

        return { re: resultRe, im: resultIm };
    }

    // Find roots using Durand-Kerner method
    // accurate: if true, uses more iterations and stricter validation (for selected fractions)
    findRoots(accurate = false) {
        const degree = this.coeffs.length - 1;
        if (degree < 1) return [];

        // Normalize polynomial (make it monic)
        const leadCoeff = this.coeffs[degree];
        if (Math.abs(leadCoeff) < 1e-10) return [];

        const p = this.coeffs.map(c => c / leadCoeff);

        // Special cases
        if (degree === 1) {
            return [{ re: -p[0], im: 0 }];
        }
        if (degree === 2) {
            const a = 1;
            const b = p[1];  // linear coefficient
            const c = p[0];  // constant term
            const discriminant = b * b - 4 * a * c;
            if (discriminant >= 0) {
                return [
                    { re: (-b + Math.sqrt(discriminant)) / (2 * a), im: 0 },
                    { re: (-b - Math.sqrt(discriminant)) / (2 * a), im: 0 }
                ];
            } else {
                const sqrtDisc = Math.sqrt(-discriminant);
                return [
                    { re: -b / (2 * a), im: sqrtDisc / (2 * a) },
                    { re: -b / (2 * a), im: -sqrtDisc / (2 * a) }
                ];
            }
        }

        // Durand-Kerner method for higher degrees
        // Use more iterations and better initial guesses for accurate mode
        const MAX_ITER = accurate ? 1000 : 200;
        const TOLERANCE = accurate ? 1e-12 : 1e-10;
        const NUM_ATTEMPTS = accurate ? 5 : 1; // Try multiple initial configurations in accurate mode

        let bestRoots = [];
        let bestCount = 0;

        for (let attempt = 0; attempt < NUM_ATTEMPTS; attempt++) {
            let roots = [];
            // Better initial guesses - spread on circles with varying radii
            // Use Cauchy bound: max root magnitude ≤ 1 + max|coeff|
            const maxCoeff = Math.max(...p.slice(0, -1).map(c => Math.abs(c)));
            const radius = (1 + maxCoeff) * (1 + attempt * 0.3); // Try different radii

            for (let i = 0; i < degree; i++) {
                const angle = (2 * Math.PI * i) / degree + 0.4 + attempt * 0.7;
                roots.push({
                    re: radius * Math.cos(angle),
                    im: radius * Math.sin(angle)
                });
            }

            for (let iter = 0; iter < MAX_ITER; iter++) {
                let maxChange = 0;
                const newRoots = roots.map(root => ({ ...root }));

                for (let i = 0; i < degree; i++) {
                    // Evaluate polynomial at roots[i]
                    let p_val = this.evaluateComplex(roots[i].re, roots[i].im);

                    // Compute denominator: product of (roots[i] - roots[j]) for j != i
                    let denominator = { re: 1, im: 0 };
                    for (let j = 0; j < degree; j++) {
                        if (i === j) continue;
                        const diff = {
                            re: roots[i].re - roots[j].re,
                            im: roots[i].im - roots[j].im
                        };
                        const newDenom = {
                            re: denominator.re * diff.re - denominator.im * diff.im,
                            im: denominator.re * diff.im + denominator.im * diff.re
                        };
                        denominator = newDenom;
                    }

                    // Divide p_val by denominator
                    const den_mag_sq = denominator.re * denominator.re + denominator.im * denominator.im;
                    if (den_mag_sq < 1e-15) continue;

                    const correction = {
                        re: (p_val.re * denominator.re + p_val.im * denominator.im) / den_mag_sq,
                        im: (p_val.im * denominator.re - p_val.re * denominator.im) / den_mag_sq
                    };

                    newRoots[i].re -= correction.re;
                    newRoots[i].im -= correction.im;

                    const change = correction.re * correction.re + correction.im * correction.im;
                    if (change > maxChange) maxChange = change;
                }

                roots = newRoots;
                if (Math.sqrt(maxChange) < TOLERANCE) break;
            }

            // Filter out roots that don't actually satisfy p(z) ≈ 0
            const ERROR_THRESHOLD = accurate ? 1e-6 : 1e-3;
            const validRoots = [];

            for (const root of roots) {
                const val = this.evaluateComplex(root.re, root.im);
                const magnitude = Math.sqrt(val.re * val.re + val.im * val.im);
                if (magnitude < ERROR_THRESHOLD) {
                    validRoots.push(root);
                }
            }

            // Keep the best attempt (most roots found)
            if (validRoots.length > bestCount) {
                bestCount = validRoots.length;
                bestRoots = validRoots;
            }

            // If we found all expected roots, stop early
            if (bestCount === degree) break;
        }

        return bestRoots;
    }
}
