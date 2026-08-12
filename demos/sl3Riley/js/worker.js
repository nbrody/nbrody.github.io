// ── Beam-Search Riley Word Worker ──
// Generators: g = [[1,a,b],[0,1,c],[0,0,1]]  (upper unipotent)
//             gᵀ = [[1,0,0],[a,1,0],[b,c,1]]  (transpose)
//
// Every reduced word in ⟨g, gᵀ⟩ is an alternating product
//   g^{p₁}·(gᵀ)^{q₁}·g^{p₂}·… with nonzero exponents, so enumerating
// alternating words is complete. Exhaustive enumeration dies at ~6
// syllables (nE^depth); instead we run a BEAM SEARCH: at each depth keep
// the K words closest to the identity (per ending-letter parity) and
// extend only those. This reaches depth 14–24, which matters: e.g. on the
// Sanov line a=c=0 the relation at b=1 needs 9 syllables, and near the
// true boundary witnesses are longer still.
//
// The field value is min(1, minD/threshold) where minD is the smallest
// squared Frobenius distance to I over all words examined. Small minD
// means a relation or near-relation: the group is (numerically) not
// discrete-and-free. Large minD is only absence of evidence — no clip box
// or ping-pong shortcut is applied anywhere.

self.onmessage = function (msg) {
    const { zStart, zEnd, N, maxAlt, maxExp, threshold, beamK, lo, hi } = msg.data;
    const step = (hi - lo) / (N - 1);

    const exps = [];
    for (let e = -maxExp; e <= maxExp; e++) if (e !== 0) exps.push(e);
    const nE = exps.length;
    const K = Math.max(beamK | 0, nE);
    const maxCand = K * nE;

    // Beam buffers: frontier A = words ending in a g-power (extend by gᵀ),
    // frontier B = words ending in a gᵀ-power (extend by g). Candidates are
    // written to separate buffers so both extensions see the old frontiers.
    const frontA = new Float64Array(K * 9);
    const frontB = new Float64Array(K * 9);
    const candA = new Float64Array(maxCand * 9);
    const candB = new Float64Array(maxCand * 9);
    const distA = new Float64Array(maxCand);
    const distB = new Float64Array(maxCand);
    const scratch = new Float64Array(maxCand);

    // Unipotent power params (reused per grid point):
    // g^p = [[1,u1,u2],[0,1,u3],[0,0,1]], (gᵀ)^p is its transpose.
    const up1 = new Float64Array(nE);
    const up2 = new Float64Array(nE);
    const up3 = new Float64Array(nE);

    // k-th smallest (0-indexed) of arr[0..n-1]; partially reorders arr.
    function quickselect(arr, n, k) {
        let lo = 0, hi = n - 1;
        while (true) {
            if (lo === hi) return arr[lo];
            const pivot = arr[(lo + hi) >> 1];
            let i = lo, j = hi;
            while (i <= j) {
                while (arr[i] < pivot) i++;
                while (arr[j] > pivot) j--;
                if (i <= j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; i++; j--; }
            }
            if (k <= j) hi = j;
            else if (k >= i) lo = i;
            else return arr[k];
        }
    }

    // Keep the K candidates with smallest dist; write them into front.
    function pruneInto(cand, dist, n, front) {
        if (n <= K) {
            front.set(cand.subarray(0, n * 9));
            return n;
        }
        scratch.set(dist.subarray(0, n));
        const cutoff = quickselect(scratch, n, K - 1);
        let m = 0;
        for (let i = 0; i < n && m < K; i++) {
            if (dist[i] <= cutoff) {
                front.set(cand.subarray(i * 9, i * 9 + 9), m * 9);
                m++;
            }
        }
        return m;
    }

    function computePoint(a, b, c) {
        let minD = Infinity;
        const earlyExit = threshold * 0.2; // safely below the iso level 0.5·threshold
        const ac = a * c;

        for (let i = 0; i < nE; i++) {
            const p = exps[i];
            up1[i] = p * a;
            up2[i] = p * b + p * (p - 1) * 0.5 * ac;
            up3[i] = p * c;
        }

        // ── Depth 1: generator powers ──
        let sizeA = nE, sizeB = nE;
        for (let i = 0; i < nE; i++) {
            const u1 = up1[i], u2 = up2[i], u3 = up3[i];
            const d = u1 * u1 + u2 * u2 + u3 * u3; // same for g^p and (gᵀ)^p
            if (d < minD) minD = d;

            const off = i * 9;
            frontA[off] = 1; frontA[off + 1] = u1; frontA[off + 2] = u2;
            frontA[off + 3] = 0; frontA[off + 4] = 1; frontA[off + 5] = u3;
            frontA[off + 6] = 0; frontA[off + 7] = 0; frontA[off + 8] = 1;

            frontB[off] = 1; frontB[off + 1] = 0; frontB[off + 2] = 0;
            frontB[off + 3] = u1; frontB[off + 4] = 1; frontB[off + 5] = 0;
            frontB[off + 6] = u2; frontB[off + 7] = u3; frontB[off + 8] = 1;
        }
        if (minD < earlyExit) return minD / threshold;

        // ── Depth 2+: extend beams alternately ──
        for (let depth = 2; depth <= maxAlt; depth++) {
            let nCandB = 0, nCandA = 0;

            // A-words (g-ending) × (gᵀ)^q → B-candidates.
            // A × L, L = [[1,0,0],[l1,1,0],[l2,l3,1]]: only columns change.
            for (let f = 0; f < sizeA; f++) {
                const fo = f * 9;
                const a0 = frontA[fo], a1 = frontA[fo + 1], a2 = frontA[fo + 2];
                const a3 = frontA[fo + 3], a4 = frontA[fo + 4], a5 = frontA[fo + 5];
                const a6 = frontA[fo + 6], a7 = frontA[fo + 7], a8 = frontA[fo + 8];
                for (let j = 0; j < nE; j++) {
                    const l1 = up1[j], l2 = up2[j], l3 = up3[j];
                    const r0 = a0 + a1 * l1 + a2 * l2, r1 = a1 + a2 * l3, r2 = a2;
                    const r3 = a3 + a4 * l1 + a5 * l2, r4 = a4 + a5 * l3, r5 = a5;
                    const r6 = a6 + a7 * l1 + a8 * l2, r7 = a7 + a8 * l3, r8 = a8;

                    const e0 = r0 - 1, e4 = r4 - 1, e8 = r8 - 1;
                    const d = e0 * e0 + r1 * r1 + r2 * r2 + r3 * r3 + e4 * e4 + r5 * r5 + r6 * r6 + r7 * r7 + e8 * e8;
                    if (d < minD) { minD = d; if (minD < earlyExit) return minD / threshold; }

                    const no = nCandB * 9;
                    candB[no] = r0; candB[no + 1] = r1; candB[no + 2] = r2;
                    candB[no + 3] = r3; candB[no + 4] = r4; candB[no + 5] = r5;
                    candB[no + 6] = r6; candB[no + 7] = r7; candB[no + 8] = r8;
                    distB[nCandB++] = d;
                }
            }

            // B-words (gᵀ-ending) × g^p → A-candidates.
            // A × U, U = [[1,u1,u2],[0,1,u3],[0,0,1]].
            for (let f = 0; f < sizeB; f++) {
                const fo = f * 9;
                const a0 = frontB[fo], a1 = frontB[fo + 1], a2 = frontB[fo + 2];
                const a3 = frontB[fo + 3], a4 = frontB[fo + 4], a5 = frontB[fo + 5];
                const a6 = frontB[fo + 6], a7 = frontB[fo + 7], a8 = frontB[fo + 8];
                for (let j = 0; j < nE; j++) {
                    const u1 = up1[j], u2 = up2[j], u3 = up3[j];
                    const r0 = a0, r1 = a0 * u1 + a1, r2 = a0 * u2 + a1 * u3 + a2;
                    const r3 = a3, r4 = a3 * u1 + a4, r5 = a3 * u2 + a4 * u3 + a5;
                    const r6 = a6, r7 = a6 * u1 + a7, r8 = a6 * u2 + a7 * u3 + a8;

                    const e0 = r0 - 1, e4 = r4 - 1, e8 = r8 - 1;
                    const d = e0 * e0 + r1 * r1 + r2 * r2 + r3 * r3 + e4 * e4 + r5 * r5 + r6 * r6 + r7 * r7 + e8 * e8;
                    if (d < minD) { minD = d; if (minD < earlyExit) return minD / threshold; }

                    const no = nCandA * 9;
                    candA[no] = r0; candA[no + 1] = r1; candA[no + 2] = r2;
                    candA[no + 3] = r3; candA[no + 4] = r4; candA[no + 5] = r5;
                    candA[no + 6] = r6; candA[no + 7] = r7; candA[no + 8] = r8;
                    distA[nCandA++] = d;
                }
            }

            sizeB = pruneInto(candB, distB, nCandB, frontB);
            sizeA = pruneInto(candA, distA, nCandA, frontA);
        }

        return Math.min(1, minD / threshold);
    }

    const size = (zEnd - zStart) * N * N;
    const result = new Float32Array(size);
    let idx = 0;
    for (let z = zStart; z < zEnd; z++) {
        const c = lo + z * step;
        for (let y = 0; y < N; y++) {
            const b = lo + y * step;
            for (let x = 0; x < N; x++) {
                const a = lo + x * step;
                result[idx++] = computePoint(a, b, c);
            }
        }
    }
    self.postMessage({ zStart, result }, [result.buffer]);
};
