// Analyze the structure of units in (-1, -x; Z[x])

const fs = require('fs');

// Include the AlgebraicNumber and Quaternion classes
class AlgebraicNumber {
    constructor(a0, a1 = 0, a2 = 0) {
        this.coeffs = [a0, a1, a2];
        this.reduce();
    }
    reduce() {
        while (this.coeffs.length > 3) {
            const c = this.coeffs.pop();
            if (this.coeffs.length >= 3) {
                this.coeffs[0] += c; this.coeffs[1] += 2 * c; this.coeffs[2] -= c;
            }
        }
        while (this.coeffs.length < 3) this.coeffs.push(0);
    }
    add(other) {
        return new AlgebraicNumber(
            this.coeffs[0] + other.coeffs[0],
            this.coeffs[1] + other.coeffs[1],
            this.coeffs[2] + other.coeffs[2]
        );
    }
    multiply(other) {
        const result = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }
        if (result[3]) { result[0] += result[3]; result[1] += 2 * result[3]; result[2] -= result[3]; }
        if (result[4]) { result[0] -= result[4]; result[1] -= result[4]; result[2] += 3 * result[4]; }
        if (result[5]) { result[0] += 3 * result[5]; result[1] += 5 * result[5]; result[2] -= 4 * result[5]; }
        return new AlgebraicNumber(result[0], result[1], result[2]);
    }
    negate() {
        return new AlgebraicNumber(-this.coeffs[0], -this.coeffs[1], -this.coeffs[2]);
    }
    equals(other) {
        return this.coeffs[0] === other.coeffs[0] &&
               this.coeffs[1] === other.coeffs[1] &&
               this.coeffs[2] === other.coeffs[2];
    }
    toString() {
        const terms = [];
        if (this.coeffs[0] !== 0) terms.push(this.coeffs[0].toString());
        if (this.coeffs[1] !== 0) {
            if (this.coeffs[1] === 1) terms.push('x');
            else if (this.coeffs[1] === -1) terms.push('-x');
            else terms.push(this.coeffs[1] + 'x');
        }
        if (this.coeffs[2] !== 0) {
            if (this.coeffs[2] === 1) terms.push('x²');
            else if (this.coeffs[2] === -1) terms.push('-x²');
            else terms.push(this.coeffs[2] + 'x²');
        }
        if (terms.length === 0) return '0';
        let result = terms[0];
        for (let i = 1; i < terms.length; i++) {
            if (terms[i].startsWith('-')) result += ' - ' + terms[i].substring(1);
            else result += ' + ' + terms[i];
        }
        return result;
    }
    toFloat() {
        const x_val = 2 * Math.cos(2 * Math.PI / 7);
        return this.coeffs[0] + this.coeffs[1] * x_val + this.coeffs[2] * x_val * x_val;
    }
}

class Quaternion {
    constructor(a, b, c, d) {
        this.a = a; this.b = b; this.c = c; this.d = d;
    }
    norm() {
        const x = new AlgebraicNumber(0, 1, 0);
        const a_sq = this.a.multiply(this.a);
        const b_sq = this.b.multiply(this.b);
        const c_sq = this.c.multiply(this.c);
        const d_sq = this.d.multiply(this.d);
        const xc_sq = x.multiply(c_sq);
        const xd_sq = x.multiply(d_sq);
        return a_sq.add(b_sq).add(xc_sq).add(xd_sq);
    }
    toString() {
        const parts = [];
        if (this.a.coeffs[0] !== 0 || this.a.coeffs[1] !== 0 || this.a.coeffs[2] !== 0) {
            parts.push(this.a.toString());
        }
        if (this.b.coeffs[0] !== 0 || this.b.coeffs[1] !== 0 || this.b.coeffs[2] !== 0) {
            const b_str = this.b.toString();
            if (b_str === '1') parts.push('i');
            else if (b_str === '-1') parts.push('-i');
            else parts.push('(' + b_str + ')i');
        }
        if (this.c.coeffs[0] !== 0 || this.c.coeffs[1] !== 0 || this.c.coeffs[2] !== 0) {
            const c_str = this.c.toString();
            if (c_str === '1') parts.push('j');
            else if (c_str === '-1') parts.push('-j');
            else parts.push('(' + c_str + ')j');
        }
        if (this.d.coeffs[0] !== 0 || this.d.coeffs[1] !== 0 || this.d.coeffs[2] !== 0) {
            const d_str = this.d.toString();
            if (d_str === '1') parts.push('k');
            else if (d_str === '-1') parts.push('-k');
            else parts.push('(' + d_str + ')k');
        }
        if (parts.length === 0) return '0';
        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            if (parts[i].startsWith('-')) result += ' - ' + parts[i].substring(1);
            else result += ' + ' + parts[i];
        }
        return result;
    }
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║   Unit Group Structure of (-1, -x; Z[x])                        ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// Focus on finding simple units
console.log('Finding small, simple units...\n');

const range = 2;
const one = new AlgebraicNumber(1, 0, 0);
const zero = new AlgebraicNumber(0, 0, 0);
const units = [];

// Search but focus on simpler cases
for (let a0 = -range; a0 <= range; a0++) {
    for (let a1 = -range; a1 <= range; a1++) {
        for (let a2 = -range; a2 <= range; a2++) {
            const a = new AlgebraicNumber(a0, a1, a2);
            for (let b0 = -range; b0 <= range; b0++) {
                for (let b1 = -range; b1 <= range; b1++) {
                    for (let b2 = -range; b2 <= range; b2++) {
                        const b = new AlgebraicNumber(b0, b1, b2);
                        for (let c0 = -range; c0 <= range; c0++) {
                            for (let c1 = -range; c1 <= range; c1++) {
                                for (let c2 = -range; c2 <= range; c2++) {
                                    const c = new AlgebraicNumber(c0, c1, c2);
                                    for (let d0 = -range; d0 <= range; d0++) {
                                        for (let d1 = -range; d1 <= range; d1++) {
                                            for (let d2 = -range; d2 <= range; d2++) {
                                                const d = new AlgebraicNumber(d0, d1, d2);
                                                const q = new Quaternion(a, b, c, d);
                                                const norm = q.norm();
                                                if (norm.equals(one)) {
                                                    // Compute "size"
                                                    const size = Math.abs(a0) + Math.abs(a1) + Math.abs(a2) +
                                                                Math.abs(b0) + Math.abs(b1) + Math.abs(b2) +
                                                                Math.abs(c0) + Math.abs(c1) + Math.abs(c2) +
                                                                Math.abs(d0) + Math.abs(d1) + Math.abs(d2);
                                                    units.push({ q, size });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

units.sort((a, b) => a.size - b.size);

console.log(`Total units found: ${units.length}\n`);

console.log('═'.repeat(70));
console.log('SMALLEST UNITS (by coefficient sum)');
console.log('═'.repeat(70));

units.slice(0, 30).forEach((u, i) => {
    console.log(`${i + 1}. ${u.q.toString()}`);
    console.log(`   Size: ${u.size}, Norm: ${u.q.norm().toString()}`);
});

console.log('\n' + '═'.repeat(70));
console.log('CONNECTION TO GEOMETRY');
console.log('═'.repeat(70));
console.log('\nThe quaternion algebra (-1, -x; Z[x]) gives:');
console.log('- A representation of rotations in hyperbolic 3-space');
console.log('- The norm equation a² + b² + xc² + xd² = 1');
console.log('- Units correspond to elements of PSL(2,ℂ) preserving H³');
console.log('\nThis is related to the Bianchi groups and arithmetic Kleinian groups!');
console.log('═'.repeat(70));
