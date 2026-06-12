/**
 * Dynnikov coordinates for simple closed loops on the n-punctured disk.
 *
 * A loop (up to isotopy) is encoded by 2n-4 integers (a_1..a_{n-2},
 * b_1..b_{n-2}); braid generators act by exact piecewise-linear update
 * rules (Dynnikov 2002).  All arithmetic is BigInt, so arbitrarily long
 * braid words are handled exactly — coordinates grow, but never lose
 * fidelity.  A canonical embedded drawing is reconstructed from the
 * coordinates via intersection numbers (the algorithm follows braidlab's
 * loop plot: semicircles around punctures + straight segments, matched by
 * nesting index, cf. Thiffeault & Budišić, arXiv:1410.0849).
 *
 * Conventions (braidlab):
 *   nu_i  = intersections with the vertical line between punctures i, i+1
 *   mu    = intersections above/below interior punctures
 *   b_i   = (nu_i - nu_{i+1}) / 2
 *   sigma_i is the counterclockwise half-twist of punctures i, i+1.
 */

const pos = x => (x > 0n ? x : 0n);
const neg = x => (x < 0n ? x : 0n);
const bmax = (x, y) => (x > y ? x : y);
const babs = x => (x < 0n ? -x : x);

// ============================================================
//  Loop coordinates
// ============================================================

export class LoopCoords {
    /** a, b: arrays of BigInt, length n-2 (1-based math index j ↦ a[j-1]). */
    constructor(n, a, b) {
        this.n = n;
        this.a = a;
        this.b = b;
    }

    /** Loop encircling adjacent punctures g+1, g+2 (g = 0..n-2, 0-based). */
    static pairLoop(n, g) {
        const a = Array(n - 2).fill(0n);
        const b = Array(n - 2).fill(0n);
        if (g >= 1) b[g - 1] = -1n;
        if (g <= n - 3) b[g] = 1n;
        return new LoopCoords(n, a, b);
    }

    clone() {
        return new LoopCoords(this.n, this.a.slice(), this.b.slice());
    }

    equals(other) {
        return this.n === other.n &&
            this.a.every((x, i) => x === other.a[i]) &&
            this.b.every((x, i) => x === other.b[i]);
    }

    /**
     * Act by sigma_i (1-based i = 1..n-1), counterclockwise half-twist of
     * punctures i, i+1; inverse=true for sigma_i^{-1}.
     * Update rules from Dynnikov / braidlab loopsigma.m.
     */
    applySigma(i, inverse = false) {
        const { n } = this;
        const a = this.a.slice(), b = this.b.slice();
        const A = j => this.a[j - 1];   // 1-based accessors
        const B = j => this.b[j - 1];

        if (!inverse) {
            if (i === 1) {
                const bp = A(1) + pos(B(1));
                a[0] = -B(1) + pos(bp);
                b[0] = bp;
            } else if (i === n - 1) {
                const bp = A(n - 2) + neg(B(n - 2));
                a[n - 3] = -B(n - 2) + neg(bp);
                b[n - 3] = bp;
            } else {
                const c = A(i - 1) - A(i) - pos(B(i)) + neg(B(i - 1));
                a[i - 2] = A(i - 1) - pos(B(i - 1)) - pos(pos(B(i)) + c);
                b[i - 2] = B(i) + neg(c);
                a[i - 1] = A(i) - neg(B(i)) - neg(neg(B(i - 1)) - c);
                b[i - 1] = B(i - 1) - neg(c);
            }
        } else {
            if (i === 1) {
                const bp = -A(1) + pos(B(1));
                a[0] = B(1) - pos(bp);
                b[0] = bp;
            } else if (i === n - 1) {
                const bp = -A(n - 2) + neg(B(n - 2));
                a[n - 3] = B(n - 2) - neg(bp);
                b[n - 3] = bp;
            } else {
                const d = A(i - 1) - A(i) + pos(B(i)) - neg(B(i - 1));
                a[i - 2] = A(i - 1) + pos(B(i - 1)) + pos(pos(B(i)) - d);
                b[i - 2] = B(i) - pos(d);
                a[i - 1] = A(i) + neg(B(i)) + neg(neg(B(i - 1)) + d);
                b[i - 1] = B(i - 1) + pos(d);
            }
        }
        this.a = a;
        this.b = b;
        return this;
    }

    /**
     * Intersection numbers (mu, nu) as BigInt arrays
     * (mu length 2n-4, nu length n-1).  Port of braidlab intersec.m.
     */
    intersec() {
        const { n, a, b } = this;
        const m = n - 2;
        // prefix sums P_j = sum_{l<j} b_l  (1-based j)
        let run = 0n;
        let b0 = null;
        for (let j = 1; j <= m; j++) {
            const v = babs(a[j - 1]) + pos(b[j - 1]) + run;
            b0 = b0 === null ? v : bmax(b0, v);
            run += b[j - 1];
        }
        b0 = b0 === null ? 0n : -b0;

        // nu_1 = -2 b0;  nu_i = nu_{i-1} - 2 b_{i-1}
        const nu = [-2n * b0];
        for (let i = 2; i <= n - 1; i++) {
            nu.push(nu[i - 2] - 2n * b[i - 3 + 1]);   // b_{i-1} = b[(i-1)-1]
        }

        const mu = [];
        for (let i = 1; i <= 2 * n - 4; i++) {
            const ic = Math.ceil(i / 2);
            let v = (i % 2 === 1 ? -a[ic - 1] : a[ic - 1]);
            if (b[ic - 1] >= 0n) v += nu[ic - 1] / 2n;
            else v += nu[ic] / 2n;
            mu.push(v);
        }
        return { mu, nu };
    }

    /** Total intersection number with the real axis (complexity measure). */
    complexity() {
        const { nu } = this.intersec();
        return nu.reduce((s, v) => s + v, 0n);
    }
}

// ============================================================
//  Canonical drawing reconstruction
// ============================================================

function toNum(x) {
    const v = Number(x);
    if (!Number.isSafeInteger(v)) {
        throw new Error('Dynnikov coordinates exceed drawable size');
    }
    return v;
}

/**
 * Drawing data per puncture (1-based p = 1..n), braidlab getcoords:
 *   bC[p]: signed semicircle count, M[p]/N[p]: strands above/below.
 */
export function drawData(coords) {
    const { n } = coords;
    const { mu, nu } = coords.intersec();
    const bC = [null, toNum(-nu[0] / 2n)];
    for (let j = 1; j <= n - 2; j++) bC.push(toNum(coords.b[j - 1]));
    bC.push(toNum(nu[n - 2] / 2n));            // bC[1..n]

    const M = [null, toNum(nu[0] / 2n)];
    const N = [null, toNum(nu[0] / 2n)];
    for (let p = 2; p <= n - 1; p++) {
        M.push(toNum(mu[2 * (p - 1) - 2]));    // mu_{2(p-1)-1}
        N.push(toNum(mu[2 * (p - 1) - 1]));    // mu_{2(p-1)}
    }
    M.push(toNum(nu[n - 2] / 2n));
    N.push(toNum(nu[n - 2] / 2n));
    return { bC, M, N };
}

const SEMI_PTS = 24;

/**
 * Reconstruct an embedded polyline drawing of the loop.
 *
 * positions: array of n {x,y} (punctures on a horizontal line, in order).
 * pgap:      vertical spacing of strand slots (same for all loops).
 * offset:    per-loop fractional slot shift in (-0.5, 0.5), so several
 *            loops drawn together interleave instead of coinciding.
 *
 * Returns an array of polylines ([{x,y}, ...]) whose union is the loop.
 */
export function loopPrimitives(coords, positions, pgap, offset = 0) {
    const { n } = coords;
    const { bC, M, N } = drawData(coords);
    const prims = [];
    const slotY = (p, idx) =>
        positions[p - 1].y + Math.sign(idx) * (Math.abs(idx) + offset) * pgap;

    const line = (p1, i1, p2, i2) => {
        prims.push([
            { x: positions[p1 - 1].x, y: slotY(p1, i1) },
            { x: positions[p2 - 1].x, y: slotY(p2, i2) },
        ]);
    };

    // semicircles around punctures
    for (let p = 1; p <= n; p++) {
        const nl = (p === n) ? M[n] : bC[p];
        const side = Math.sign(nl);      // +1 → right half (D), -1 → left (C)
        for (let sc = 1; sc <= Math.abs(nl); sc++) {
            const r = (sc + offset) * pgap;
            const cx = positions[p - 1].x, cy = positions[p - 1].y;
            const pts = [];
            for (let k = 0; k <= SEMI_PTS; k++) {
                const th = -Math.PI / 2 + (k / SEMI_PTS) * Math.PI;
                // side=+1 → right half (D-shape), side=-1 → left half
                pts.push({ x: cx + side * r * Math.cos(th), y: cy + r * Math.sin(th) });
            }
            prims.push(pts);
        }
    }

    // segments above the puncture line
    for (let p = 1; p <= n - 1; p++) {
        const nr = (p === 1) ? 0 : Math.max(bC[p], 0);
        const tojoin = M[p] - nr;
        if (tojoin > 0) {
            const nl = (p < n - 1) ? -Math.min(bC[p + 1], 0) : 0;
            const tojoinup = M[p + 1] - nl;
            const tojoindown = Math.max(tojoin - tojoinup, 0);
            for (let s = 1; s <= tojoindown; s++) {
                line(p, nr + s, p + 1, -(nl - s + tojoindown + 1));
            }
            for (let s = tojoindown + 1; s <= tojoin; s++) {
                line(p, nr + s, p + 1, nl + s - (tojoin - tojoinup));
            }
        }
    }

    // segments below the puncture line
    for (let p = 1; p <= n - 1; p++) {
        const nr = (p === 1) ? 0 : Math.max(bC[p], 0);
        const tojoin = N[p] - nr;
        if (tojoin > 0) {
            const nl = (p < n - 1) ? -Math.min(bC[p + 1], 0) : 0;
            const tojoindown2 = N[p + 1] - nl;
            const tojoinup2 = Math.max(tojoin - tojoindown2, 0);
            for (let s = 1; s <= tojoinup2; s++) {
                line(p, -(nr + s), p + 1, nl - s + tojoinup2 + 1);
            }
            for (let s = tojoinup2 + 1; s <= tojoin; s++) {
                line(p, -(nr + s), p + 1, -(nl + s - (tojoin - tojoindown2)));
            }
        }
    }

    return prims;
}

/** Max strand count over all punctures (for slot spacing). */
export function maxStrandCount(coordsList) {
    let m = 1;
    for (const c of coordsList) {
        const { bC, M, N } = drawData(c);
        for (let p = 1; p <= c.n; p++) {
            m = Math.max(m, M[p], N[p], Math.abs(bC[p]));
        }
    }
    return m;
}
