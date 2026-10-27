// homology.js — H₁ of a Dehn filling from the presentation: abelianize the relators,
// add p·[m] + q·[l] for every filled cusp, and read off the Smith normal form.

/** Exponent sums of a word in the generators a, b, … (A = a⁻¹). */
export function abelianize(word, ngens) {
    const v = new Array(ngens).fill(0);
    for (const ch of word) {
        const lower = ch.toLowerCase();
        const k = lower.charCodeAt(0) - 97;
        if (k < 0 || k >= ngens) throw new Error(`letter ${ch} is not a generator`);
        v[k] += ch === lower ? 1 : -1;
    }
    return v;
}

/** Invariant factors (> 1) and the free rank of ℤⁿ / (row span). */
export function smithInvariants(rows, ncols) {
    const A = rows.map((r) => r.map((x) => BigInt(x)));
    const m = A.length;
    const abs = (x) => (x < 0n ? -x : x);
    let r = 0;
    const diag = [];
    for (let c = 0; c < ncols && r < m; c++) {
        // bring the smallest nonzero entry of the remaining block to (r, c), repeat until the
        // rest of its row and column vanish
        for (;;) {
            let bi = -1, bj = -1, best = 0n;
            for (let i = r; i < m; i++) for (let j = c; j < ncols; j++) {
                const v = abs(A[i][j]);
                if (v !== 0n && (best === 0n || v < best)) { best = v; bi = i; bj = j; }
            }
            if (bi < 0) return finish(diag, ncols);
            [A[r], A[bi]] = [A[bi], A[r]];
            for (const row of A) [row[c], row[bj]] = [row[bj], row[c]];
            let clean = true;
            for (let i = r + 1; i < m; i++) {
                const q = A[i][c] / A[r][c];
                if (q !== 0n) for (let j = c; j < ncols; j++) A[i][j] -= q * A[r][j];
                if (A[i][c] !== 0n) clean = false;
            }
            for (let j = c + 1; j < ncols; j++) {
                const q = A[r][j] / A[r][c];
                if (q !== 0n) for (let i = r; i < m; i++) A[i][j] -= q * A[i][c];
                if (A[r][j] !== 0n) clean = false;
            }
            if (!clean) continue;
            // divisibility: the pivot must divide every remaining entry
            let bad = -1;
            for (let i = r + 1; i < m && bad < 0; i++) for (let j = c + 1; j < ncols; j++) if (A[i][j] % A[r][c] !== 0n) { bad = i; break; }
            if (bad >= 0) { for (let j = c; j < ncols; j++) A[r][j] += A[bad][j]; continue; }
            break;
        }
        diag.push(abs(A[r][c]));
        r++;
    }
    return finish(diag, ncols);
}
function finish(diag, ncols) {
    const torsion = diag.filter((d) => d > 1n).map(Number);
    return { rank: ncols - diag.length, torsion };
}

/**
 * H₁ of the manifold with the given fillings (per cusp: null or {p, q}).
 * Returns {rank, torsion} with torsion the invariant factors > 1.
 */
export function fillingHomology(pres, fills) {
    const n = pres.gens.length;
    const rows = pres.rels.map((w) => abelianize(w, n));
    fills.forEach((f, k) => {
        if (!f) return;
        const m = abelianize(pres.periph[k][0], n), l = abelianize(pres.periph[k][1], n);
        rows.push(m.map((x, j) => f.p * x + f.q * l[j]));
    });
    return smithInvariants(rows, n);
}

/** TeX for a homology group: ℤ^r ⊕ ℤ/d₁ ⊕ …, or 0. */
export function homologyTex({ rank, torsion }) {
    const parts = [];
    if (rank === 1) parts.push('\\mathbb Z');
    else if (rank > 1) parts.push(`\\mathbb Z^{${rank}}`);
    for (const d of torsion) parts.push(`\\mathbb Z/${d}`);
    return parts.length ? parts.join(' \\oplus ') : '0';
}
/** SnapPy's spelling (Z/5 + Z), for comparisons in the tests. */
export function homologySnapPy({ rank, torsion }) {
    const parts = torsion.map((d) => `Z/${d}`);
    for (let i = 0; i < rank; i++) parts.push('Z');
    return parts.length ? parts.join('+') : '0';
}
