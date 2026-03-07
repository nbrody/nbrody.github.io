// ── Optimized Riley Word Worker (frontier-based) ──
// Generators: g = [[1,a,b],[0,1,c],[0,0,1]]  (upper unipotent)
//             gᵀ = [[1,0,0],[a,1,0],[b,c,1]]  (transpose)
//
// Checks ALL alternating words up to maxAlt factors:
//   depth 1: g^p, (gᵀ)^q
//   depth 2: g^p·(gᵀ)^q, (gᵀ)^q·g^p
//   depth 3: g^p·(gᵀ)^q·g^r, (gᵀ)^q·g^p·(gᵀ)^r
//   ...
// Two frontiers (g-ending, gᵀ-ending) are extended alternately.
// Multiplying general×unipotent costs ~6 muls instead of 27.

self.onmessage = function (msg) {
    const { zStart, zEnd, N, maxAlt, maxExp, threshold } = msg.data;
    const lo = -2.1, hi = 2.1;
    const step = (hi - lo) / (N - 1);

    const exps = [];
    for (let e = -maxExp; e <= maxExp; e++) if (e !== 0) exps.push(e);
    const nE = exps.length;

    // Pre-allocate frontier buffers (each matrix = 9 doubles)
    // Max frontier size at depth d is nE^d. Pre-alloc for maxAlt.
    let maxFrontier = nE;
    for (let d = 1; d < maxAlt; d++) maxFrontier *= nE;
    const gEndA = new Float64Array(maxFrontier * 9);
    const gEndB = new Float64Array(maxFrontier * 9);
    const gtEndA = new Float64Array(maxFrontier * 9);
    const gtEndB = new Float64Array(maxFrontier * 9);

    // Unipotent power params (reused per grid point)
    const up1 = new Float64Array(nE); // p*a
    const up2 = new Float64Array(nE); // p*b + p(p-1)/2*ac
    const up3 = new Float64Array(nE); // p*c

    const size = (zEnd - zStart) * N * N;
    const result = new Float32Array(size);
    let idx = 0;

    for (let z = zStart; z < zEnd; z++) {
        const c = lo + z * step;
        for (let y = 0; y < N; y++) {
            const b = lo + y * step;
            for (let x = 0; x < N; x++) {
                const a = lo + x * step;
                if (a > 2 || a < -2 || b > 2 || b < -2 || c > 2 || c < -2) {
                    result[idx++] = 1;
                    continue;
                }
                result[idx++] = computePoint(a, b, c, exps, nE, maxAlt, threshold,
                    up1, up2, up3, gEndA, gEndB, gtEndA, gtEndB);
            }
        }
    }
    self.postMessage({ zStart, result }, [result.buffer]);
};

function computePoint(a, b, c, exps, nE, maxAlt, threshold,
    up1, up2, up3, gEndA, gEndB, gtEndA, gtEndB) {
    let minD = Infinity;
    const ac = a * c;

    // Precompute unipotent power parameters
    for (let i = 0; i < nE; i++) {
        const p = exps[i];
        up1[i] = p * a;
        up2[i] = p * b + p * (p - 1) * 0.5 * ac;
        up3[i] = p * c;
    }

    // ── Depth 1: single generators ──
    // g^p = [[1, u1, u2], [0, 1, u3], [0, 0, 1]]
    let gEndSize = nE, gtEndSize = nE;
    for (let i = 0; i < nE; i++) {
        const u1 = up1[i], u2 = up2[i], u3 = up3[i];
        const d = u1 * u1 + u2 * u2 + u3 * u3;
        if (d < minD) minD = d;

        const off = i * 9;
        gEndA[off] = 1; gEndA[off + 1] = u1; gEndA[off + 2] = u2;
        gEndA[off + 3] = 0; gEndA[off + 4] = 1; gEndA[off + 5] = u3;
        gEndA[off + 6] = 0; gEndA[off + 7] = 0; gEndA[off + 8] = 1;

        // (gᵀ)^q = [[1,0,0],[l1,1,0],[l2,l3,1]]
        const l1 = u1, l2 = u2, l3 = u3;
        const dg = l1 * l1 + l2 * l2 + l3 * l3;
        if (dg < minD) minD = dg;

        gtEndA[off] = 1; gtEndA[off + 1] = 0; gtEndA[off + 2] = 0;
        gtEndA[off + 3] = l1; gtEndA[off + 4] = 1; gtEndA[off + 5] = 0;
        gtEndA[off + 6] = l2; gtEndA[off + 7] = l3; gtEndA[off + 8] = 1;
    }
    if (minD < threshold) return minD / threshold;
    if (maxAlt < 2) return Math.min(1, minD / threshold);

    // ── Depth 2+: extend frontiers alternately ──
    // gEnd → extend with (gᵀ)^q → new gtEnd
    // gtEnd → extend with g^p → new gEnd
    let curGEnd = gEndA, curGtEnd = gtEndA;
    let newGEnd = gEndB, newGtEnd = gtEndB;

    for (let depth = 2; depth <= maxAlt; depth++) {
        let newGtSize = 0, newGSize = 0;

        // Extend g-ending words with (gᵀ)^q (right-multiply by lower unipotent)
        // A × L where L = [[1,0,0],[l1,1,0],[l2,l3,1]]:
        //   col0: A[i][0] + A[i][1]*l1 + A[i][2]*l2
        //   col1: A[i][1] + A[i][2]*l3
        //   col2: A[i][2]
        for (let f = 0; f < gEndSize; f++) {
            const fo = f * 9;
            const a0 = curGEnd[fo], a1 = curGEnd[fo + 1], a2 = curGEnd[fo + 2];
            const a3 = curGEnd[fo + 3], a4 = curGEnd[fo + 4], a5 = curGEnd[fo + 5];
            const a6 = curGEnd[fo + 6], a7 = curGEnd[fo + 7], a8 = curGEnd[fo + 8];

            for (let j = 0; j < nE; j++) {
                const l1 = up1[j], l2 = up2[j], l3 = up3[j];
                const r0 = a0 + a1 * l1 + a2 * l2, r1 = a1 + a2 * l3, r2 = a2;
                const r3 = a3 + a4 * l1 + a5 * l2, r4 = a4 + a5 * l3, r5 = a5;
                const r6 = a6 + a7 * l1 + a8 * l2, r7 = a7 + a8 * l3, r8 = a8;

                const e0 = r0 - 1, e4 = r4 - 1, e8 = r8 - 1;
                const d = e0 * e0 + r1 * r1 + r2 * r2 + r3 * r3 + e4 * e4 + r5 * r5 + r6 * r6 + r7 * r7 + e8 * e8;
                if (d < minD) minD = d;
                if (minD < threshold) return minD / threshold;

                const no = newGtSize * 9;
                newGtEnd[no] = r0; newGtEnd[no + 1] = r1; newGtEnd[no + 2] = r2;
                newGtEnd[no + 3] = r3; newGtEnd[no + 4] = r4; newGtEnd[no + 5] = r5;
                newGtEnd[no + 6] = r6; newGtEnd[no + 7] = r7; newGtEnd[no + 8] = r8;
                newGtSize++;
            }
        }

        // Extend gᵀ-ending words with g^p (right-multiply by upper unipotent)
        // A × U where U = [[1,u1,u2],[0,1,u3],[0,0,1]]:
        //   row stays same for col0; col1: A[i][0]*u1+A[i][1]; col2: A[i][0]*u2+A[i][1]*u3+A[i][2]
        for (let f = 0; f < gtEndSize; f++) {
            const fo = f * 9;
            const a0 = curGtEnd[fo], a1 = curGtEnd[fo + 1], a2 = curGtEnd[fo + 2];
            const a3 = curGtEnd[fo + 3], a4 = curGtEnd[fo + 4], a5 = curGtEnd[fo + 5];
            const a6 = curGtEnd[fo + 6], a7 = curGtEnd[fo + 7], a8 = curGtEnd[fo + 8];

            for (let j = 0; j < nE; j++) {
                const u1 = up1[j], u2 = up2[j], u3 = up3[j];
                const r0 = a0, r1 = a0 * u1 + a1, r2 = a0 * u2 + a1 * u3 + a2;
                const r3 = a3, r4 = a3 * u1 + a4, r5 = a3 * u2 + a4 * u3 + a5;
                const r6 = a6, r7 = a6 * u1 + a7, r8 = a6 * u2 + a7 * u3 + a8;

                const e0 = r0 - 1, e4 = r4 - 1, e8 = r8 - 1;
                const d = e0 * e0 + r1 * r1 + r2 * r2 + r3 * r3 + e4 * e4 + r5 * r5 + r6 * r6 + r7 * r7 + e8 * e8;
                if (d < minD) minD = d;
                if (minD < threshold) return minD / threshold;

                const no = newGSize * 9;
                newGEnd[no] = r0; newGEnd[no + 1] = r1; newGEnd[no + 2] = r2;
                newGEnd[no + 3] = r3; newGEnd[no + 4] = r4; newGEnd[no + 5] = r5;
                newGEnd[no + 6] = r6; newGEnd[no + 7] = r7; newGEnd[no + 8] = r8;
                newGSize++;
            }
        }

        // Swap buffers
        const tmpG = curGEnd; curGEnd = newGEnd; newGEnd = tmpG;
        const tmpGt = curGtEnd; curGtEnd = newGtEnd; newGtEnd = tmpGt;
        gEndSize = newGSize;
        gtEndSize = newGtSize;
    }

    return Math.min(1, minD / threshold);
}
