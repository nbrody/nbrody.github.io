// Bounded generation of Z[1/m] sample points and O2(Z[1/m]) rotation angles.
// The Explore slide lets m run up to 1000 and depth k up to 6; naive enumeration
// of every a/m^k in [-2, 2] is Θ(m^k) and freezes the tab (m=1000, k=3 is ~4e9
// loop iterations; m=65, k=6 is ~3e11).

export const M_MIN = 2;
export const M_MAX = 1000;
export const DEPTH_MIN = 1;
export const DEPTH_MAX = 6;
export const DEFAULT_M = 65;
export const DEFAULT_DEPTH = 3;

// Enough points to look dense on a canvas; well below a main-thread hang.
export const MAX_ZINV_POINTS_PER_LEVEL = 4000;
export const MAX_ROTATION_COS_SAMPLES = 2000;

export function clampM(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_M;
    return Math.max(M_MIN, Math.min(M_MAX, n));
}

export function clampDepth(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return DEFAULT_DEPTH;
    return Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, n));
}

export function factorize(n) {
    const factors = [];
    n = Math.abs(n);
    if (!Number.isFinite(n) || n < 2) return factors;
    // After clampM, n ≤ 1000; still refuse values that would make trial division hang.
    if (n > M_MAX) n = M_MAX;
    let d = 2;
    while (d * d <= n) {
        while (n % d === 0) {
            if (!factors.includes(d)) factors.push(d);
            n /= d;
        }
        d++;
    }
    if (n > 1) factors.push(n);
    return factors;
}

export function generateZinvM(m, maxK) {
    // Sample a/m^k in [-2, 2] for 0 ≤ k ≤ maxK, striding so each level stays bounded.
    const points = new Set();
    m = Math.abs(m);
    if (!Number.isFinite(m) || m < 1) return [];
    maxK = Math.max(0, Math.min(DEPTH_MAX, maxK | 0));

    for (let k = 0; k <= maxK; k++) {
        const denom = m ** k;
        if (!Number.isFinite(denom) || denom <= 0) break;
        const maxA = Math.ceil(2 * denom);
        if (!Number.isFinite(maxA) || maxA < 0) break;
        const count = 2 * maxA + 1;
        const stride = Math.max(1, Math.ceil(count / MAX_ZINV_POINTS_PER_LEVEL));
        for (let a = -maxA; a <= maxA; a += stride) {
            const val = a / denom;
            if (val >= -2 && val <= 2) points.add(val);
        }
        points.add(0);
    }
    return Array.from(points).sort((a, b) => a - b);
}

export function generateO2Rotations(m, maxK) {
    // Find angles θ where cos(θ) and sin(θ) are in Z[1/m], sampling cosines.
    const angles = new Set();
    m = Math.abs(m);
    if (!Number.isFinite(m) || m < 1) return [];
    maxK = Math.max(0, Math.min(DEPTH_MAX, maxK | 0));

    for (let k = 0; k <= maxK; k++) {
        const denom = m ** k;
        if (!Number.isFinite(denom) || denom <= 0) break;
        const stride = Math.max(1, Math.ceil((2 * denom + 1) / MAX_ROTATION_COS_SAMPLES));
        for (let a = -denom; a <= denom; a += stride) {
            const cosVal = a / denom;
            const sinSq = 1 - cosVal * cosVal;
            if (sinSq < 0) continue;
            const sinVal = Math.sqrt(sinSq);
            for (let k2 = 0; k2 <= maxK; k2++) {
                const denom2 = m ** k2;
                if (!Number.isFinite(denom2) || denom2 <= 0) break;
                const sinRound = Math.round(sinVal * denom2) / denom2;
                if (Math.abs(sinRound - sinVal) < 1e-10 && sinRound !== 0) {
                    const angle = Math.atan2(sinRound, cosVal);
                    angles.add(angle);
                    angles.add(-angle);
                    angles.add(Math.PI - angle);
                    angles.add(-Math.PI + angle);
                }
            }
        }
    }
    return Array.from(angles).sort((a, b) => a - b);
}
