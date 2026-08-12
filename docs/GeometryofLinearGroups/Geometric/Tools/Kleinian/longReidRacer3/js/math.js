// math.js — exact arithmetic for the Long-Reid group (t = 9 Magnus curve),
// plus the complex / Möbius machinery the renderer needs.
//
// Every group element lives in SL2(Z[1/6]), so a matrix is stored as an
// integer (BigInt) matrix N together with exponents (e2, e3), meaning
//
//     M = N / (2^e2 · 3^e3),
//
// kept normalized so the exponents are minimal. The height of an element
// (its altitude in the game, = distance from the ground floor of T3 x T4)
// is then simply e2 + e3.

'use strict';

const LRMath = (() => {

    // ---------- exact 2x2 matrices over Z[1/6] ----------

    class Mat2 {
        // n00..n11: BigInt-able; e2, e3: non-negative integers
        constructor(n00, n01, n10, n11, e2 = 0, e3 = 0) {
            this.n = [BigInt(n00), BigInt(n01), BigInt(n10), BigInt(n11)];
            this.e2 = e2;
            this.e3 = e3;
            this._normalize();
        }

        _normalize() {
            const n = this.n;
            while (this.e2 > 0 && n[0] % 2n === 0n && n[1] % 2n === 0n && n[2] % 2n === 0n && n[3] % 2n === 0n) {
                for (let i = 0; i < 4; i++) n[i] /= 2n;
                this.e2--;
            }
            while (this.e3 > 0 && n[0] % 3n === 0n && n[1] % 3n === 0n && n[2] % 3n === 0n && n[3] % 3n === 0n) {
                for (let i = 0; i < 4; i++) n[i] /= 3n;
                this.e3--;
            }
        }

        static identity() {
            return new Mat2(1, 0, 0, 1);
        }

        mul(other) {
            const a = this.n, b = other.n;
            return new Mat2(
                a[0] * b[0] + a[1] * b[2],
                a[0] * b[1] + a[1] * b[3],
                a[2] * b[0] + a[3] * b[2],
                a[2] * b[1] + a[3] * b[3],
                this.e2 + other.e2,
                this.e3 + other.e3
            );
        }

        // Valid for det M = 1 (all group elements): inverse is the adjugate
        // with the same denominator.
        inverse() {
            const n = this.n;
            return new Mat2(n[3], -n[1], -n[2], n[0], this.e2, this.e3);
        }

        get height() {
            return this.e2 + this.e3;
        }

        get key() {
            return `${this.e2}.${this.e3}:${this.n.join(',')}`;
        }

        isIdentity() {
            return this.e2 === 0 && this.e3 === 0 &&
                this.n[0] === 1n && this.n[1] === 0n && this.n[2] === 0n && this.n[3] === 1n;
        }

        isNegIdentity() {
            return this.e2 === 0 && this.e3 === 0 &&
                this.n[0] === -1n && this.n[1] === 0n && this.n[2] === 0n && this.n[3] === -1n;
        }

        isPlusMinusIdentity() {
            return this.isIdentity() || this.isNegIdentity();
        }

        // { e2, e3, entries: [4 strings] } for the HUD / victory screen
        factored() {
            return { e2: this.e2, e3: this.e3, entries: this.n.map(x => x.toString()) };
        }

        // Float entries (for Möbius geometry). Only ever called on *relative*
        // matrices (short words), so no overflow concerns.
        toComplex() {
            const d = Math.pow(2, this.e2) * Math.pow(3, this.e3);
            return {
                a: new Complex(Number(this.n[0]) / d, 0),
                b: new Complex(Number(this.n[1]) / d, 0),
                c: new Complex(Number(this.n[2]) / d, 0),
                d: new Complex(Number(this.n[3]) / d, 0)
            };
        }
    }

    // ---------- generators ----------
    // A = diag(9, 1) and B = [[82, 2], [9, 1]] normalized into SL2:
    //   a = (1/3)[[9,0],[0,1]],  b = (1/8)[[82,2],[9,1]]  (det b = 64/64 = 1)
    const GEN = {
        a: new Mat2(9, 0, 0, 1, 0, 1),
        A: new Mat2(1, 0, 0, 9, 0, 1),
        b: new Mat2(82, 2, 9, 1, 3, 0),
        B: new Mat2(1, -2, -9, 82, 3, 0)
    };

    const INVERSE_LABEL = { a: 'A', A: 'a', b: 'B', B: 'b' };

    // ---------- complex numbers & Möbius maps (floats, renderer only) ----------

    class Complex {
        constructor(re, im) {
            this.re = re;
            this.im = im;
        }
        add(o) { return new Complex(this.re + o.re, this.im + o.im); }
        sub(o) { return new Complex(this.re - o.re, this.im - o.im); }
        mul(o) {
            return new Complex(
                this.re * o.re - this.im * o.im,
                this.re * o.im + this.im * o.re
            );
        }
        div(o) {
            const d = o.re * o.re + o.im * o.im;
            return new Complex(
                (this.re * o.re + this.im * o.im) / d,
                (this.im * o.re - this.re * o.im) / d
            );
        }
        conj() { return new Complex(this.re, -this.im); }
        absSq() { return this.re * this.re + this.im * this.im; }
    }

    const C = (re, im = 0) => new Complex(re, im);
    const IDENTITY_C = { a: C(1), b: C(0), c: C(0), d: C(1) };

    function applyMobius(m, z) {
        return m.a.mul(z).add(m.b).div(m.c.mul(z).add(m.d));
    }

    function composeC(m1, m2) {
        return {
            a: m1.a.mul(m2.a).add(m1.b.mul(m2.c)),
            b: m1.a.mul(m2.b).add(m1.b.mul(m2.d)),
            c: m1.c.mul(m2.a).add(m1.d.mul(m2.c)),
            d: m1.c.mul(m2.b).add(m1.d.mul(m2.d))
        };
    }

    // Upper half-plane -> Poincaré disk, z |-> (z - i)/(z + i)
    function toDisk(z) {
        const i = C(0, 1);
        return z.sub(i).div(z.add(i));
    }

    // Where a group element (as complex matrix) parks its node in the disk
    function nodeDiskPos(mc) {
        return toDisk(applyMobius(mc, C(0, 1)));
    }

    // Point at parameter t along the hyperbolic geodesic from z1 to z2 in the
    // disk model (translate z1 to 0, walk the straight ray, translate back).
    function geodesicPoint(z1, z2, t) {
        const one = C(1);
        const z1c = z1.conj();
        const target = z2.sub(z1).div(one.sub(z1c.mul(z2)));
        const w = C(target.re * t, target.im * t);
        return w.add(z1).div(one.add(z1c.mul(w)));
    }

    // Deterministic pseudo-random in [0,1) for scenery placement
    function pseudoRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    return {
        Mat2, Complex, C, GEN, INVERSE_LABEL, IDENTITY_C,
        applyMobius, composeC, toDisk, nodeDiskPos, geodesicPoint, pseudoRandom
    };
})();

// Allow the Node test harness to require() this file
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LRMath;
}
