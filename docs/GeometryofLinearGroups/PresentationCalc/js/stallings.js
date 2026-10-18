/**
 * stallings.mjs — Stallings folding for finitely generated subgroups of PSL₂(ℤ) = ⟨S⟩ ∗ ⟨U⟩ ≅ ℤ/2 ∗ ℤ/3,
 * S = (0 −1; 1 0), U = (0 −1; 1 1), and through an index-2 step for subgroups of PGL₂(ℤ).
 *
 * The folded graph is the core of H∖(Bass–Serre tree of ℤ/2 ∗ ℤ/3): vertices are cosets Hg;
 * S acts as a partial involution, and every vertex touched by U lies on a complete U-orbit
 * (of size 3, or 1). Generator words are traced from the base vertex (creating vertices only
 * to complete factor orbits) and closed up; coincidences are propagated as in coset
 * enumeration. For a free product of finite groups this decides membership: g ∈ H iff the
 * normal form of g traces a closed path at the base. H has finite index iff S and U are
 * defined at every vertex.
 */
const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const mul = (A, B) => [A[0]*B[0]+A[1]*B[2], A[0]*B[1]+A[1]*B[3], A[2]*B[0]+A[3]*B[2], A[2]*B[1]+A[3]*B[3]];
const det = (A) => A[0]*A[3] - A[1]*A[2];
export const prim = (A) => { const g = A.map(BigInt).reduce((s, x) => bgcd(s, x), 0n); return A.map((x) => BigInt(x) / g); };
const projEq = (A, B) => A.every((x, i) => x === B[i]) || A.every((x, i) => x === -B[i]);

export const S = [0n, -1n, 1n, 0n], U = [0n, -1n, 1n, 1n], U2 = mul(U, U);
const T = [1n, 1n, 0n, 1n];

/**
 * The normal form of M ∈ PSL₂(ℤ) (det 1) as letters 's', 'u', 'U' (U = u²), alternating.
 * Euclid on the first column gives M = ±T^{k₁} S T^{k₂} S … T^{n}; then T = S U and T⁻¹ = U² S.
 */
/**
 * M = ±T^{k₁} S T^{k₂} S ⋯ S T^{k_n} by Euclid on the first column with truncated quotients
 * (O(log) blocks; the k's are the continued-fraction quotients up to sign).
 */
export function normalBlocks(M0) {
    let M = M0.map(BigInt);
    if (det(M) !== 1n) throw new Error('normalForm: det must be 1');
    const ks = [];
    while (M[2] !== 0n) {
        const k = M[0] / M[2];                           // truncated
        ks.push(k);
        M = [M[0] - k * M[2], M[1] - k * M[3], M[2], M[3]];
        M = [-M[2], -M[3], M[0], M[1]];                  // M ← S·M
    }
    ks.push(M[0] === 1n ? M[1] : -M[1]);
    return ks;                                           // T^{k₁} S T^{k₂} S ⋯ S T^{k_n}
}
export const blockLength = (ks) => ks.reduce((s, k) => s + 2n * babs(k), 0n) + BigInt(ks.length - 1);
export const MAX_WORD = 4000000n;

export function normalForm(M0) {
    const ks = normalBlocks(M0);
    if (blockLength(ks) > MAX_WORD) { const e = new Error('normalForm: word too long'); e.huge = ks; throw e; }
    const raw = [];
    ks.forEach((k, i) => {
        if (i) raw.push('s');
        const n = babs(k);
        for (let j = 0n; j < n; j++) raw.push(...(k > 0n ? ['s', 'u'] : ['U', 's']));
    });
    // reduce: s s = 1, u u = U, u U = 1, U U = u, …
    const out = [];
    const uval = { u: 1, U: 2 };
    for (const x of raw) {
        const last = out[out.length - 1];
        if (x === 's') { if (last === 's') out.pop(); else out.push('s'); continue; }
        if (last === 'u' || last === 'U') {
            const v = (uval[last] + uval[x]) % 3;
            out.pop();
            if (v) out.push(v === 1 ? 'u' : 'U');
        } else out.push(x);
    }
    // check, block by block: T^k = (1 k; 0 1)
    let W = [1n, 0n, 0n, 1n];
    ks.forEach((k, i) => { if (i) W = mul(W, S); W = mul(W, [1n, k, 0n, 1n]); });
    if (!projEq(W, M0.map(BigInt))) throw new Error('normalForm: check failed');
    return out;
}

/**
 * T^{k₁} S T^{k₂} S ⋯ S T^{k_n} as a freely reduced word in s, u, U, with the long T-powers kept as
 * { w: 'us' | 'sU', m } (m repetitions): T^k = s (us)^{k−1} u and T^{−k} = U (sU)^{k−1} s. A power
 * is peeled one period at a time only where a neighbouring letter cancels against its end.
 */
export function reducedTokens(ks) {
    const out = [];
    const val = { u: 1, U: 2 };
    const pushLetter = (x) => {
        for (;;) {
            const top = out[out.length - 1];
            if (top && typeof top !== 'string') {
                const last = top.w[top.w.length - 1];
                const interacts = (x === 's' && last === 's') || (x !== 's' && last !== 's');
                if (!interacts) break;
                // peel one period off the power
                out.pop();
                if (top.m > 1n) out.push({ w: top.w, m: top.m - 1n });
                for (const y of top.w) pushLetter(y);
                continue;
            }
            break;
        }
        const top = out[out.length - 1];
        if (x === 's') { if (top === 's') out.pop(); else out.push('s'); return; }
        if (top === 'u' || top === 'U') { const v = (val[top] + val[x]) % 3; out.pop(); if (v) pushLetter(v === 1 ? 'u' : 'U'); return; }
        out.push(x);
    };
    const pushPower = (w, m) => {
        // the power's first letter may interact with the top letter: peel its first period
        while (m > 0n) {
            const top = out[out.length - 1];
            const first = w[0];
            const interacts = typeof top === 'string' && ((first === 's' && top === 's') || (first !== 's' && top !== 's'));
            if (!interacts) break;
            for (const y of w) pushLetter(y);
            m -= 1n;
        }
        if (m <= 0n) return;
        const top = out[out.length - 1];
        if (top && typeof top !== 'string' && top.w === w) top.m += m; else out.push({ w, m });
    };
    ks.forEach((k, i) => {
        if (i) pushLetter('s');
        if (k > 0n) { pushLetter('s'); pushPower('us', k - 1n); pushLetter('u'); }
        else if (k < 0n) { const n = -k; pushLetter('U'); pushPower('sU', n - 1n); pushLetter('s'); }
    });
    return out;
}

export class Folded {
    constructor() { this.s = [-1]; this.u = [-1]; this.parent = [0]; this.n = 1; this.merged = 0; this.queue = []; }
    /** vertices still in the graph (allocated minus merged away) */
    get size() { return this.n - this.merged; }
    find(v) { while (this.parent[v] !== v) { this.parent[v] = this.parent[this.parent[v]]; v = this.parent[v]; } return v; }
    newVertex() { const v = this.n++; this.s.push(-1); this.u.push(-1); this.parent.push(v); return v; }
    /** ensure v lies on a complete U-orbit */
    ensureU(v) {
        v = this.find(v);
        if (this.u[v] >= 0) return;
        const a = this.newVertex(), b = this.newVertex();
        this.u[v] = a; this.u[a] = b; this.u[b] = v;
    }
    ensureS(v) {
        v = this.find(v);
        if (this.s[v] >= 0) return;
        const a = this.newVertex();
        this.s[v] = a; this.s[a] = v;
    }
    step(v, x, create) {
        v = this.find(v);
        if (x === 's') { if (this.s[v] < 0) { if (!create) return -1; this.ensureS(v); } return this.find(this.s[v]); }
        if (this.u[v] < 0) { if (!create) return -1; this.ensureU(v); }
        const a = this.find(this.u[v]);
        return x === 'u' ? a : this.find(this.u[a]);
    }
    addWord(word) {
        let v = 0;
        for (const x of word) v = this.step(v, x, true);
        this.merge(v, 0);
        if (this.n > 1000000 && this.n > 3 * this.size) this.compact();
    }
    /** renumber the live vertices 0, 1, … (0 stays the base: merges keep the smaller index) */
    compact() {
        const idx = new Int32Array(this.n).fill(-1);
        let m = 0;
        for (let v = 0; v < this.n; v++) if (this.find(v) === v) idx[v] = m++;
        const s = new Array(m), u = new Array(m), parent = new Array(m);
        for (let v = 0; v < this.n; v++) {
            const i = idx[v];
            if (i < 0) continue;
            s[i] = this.s[v] >= 0 ? idx[this.find(this.s[v])] : -1;
            u[i] = this.u[v] >= 0 ? idx[this.find(this.u[v])] : -1;
            parent[i] = i;
        }
        this.s = s; this.u = u; this.parent = parent; this.n = m; this.merged = 0;
    }
    merge(a, b) {
        const q = [[a, b]];
        while (q.length) {
            let [x, y] = q.pop();
            x = this.find(x); y = this.find(y);
            if (x === y) continue;
            if (y < x) [x, y] = [y, x];
            this.parent[y] = x;
            this.merged++;
            // S partners
            const sx = this.s[x], sy = this.s[y];
            if (sy >= 0) {
                if (sx >= 0) q.push([sx, sy]);
                else { this.s[x] = sy; }
                // the partner of y now points at x
                const py = this.find(sy);
                if (this.s[py] === y || this.find(this.s[py]) === x) this.s[py] = x;
            }
            // U orbits: if both are on U-orbits, the orbits are identified pointwise
            const ux = this.u[x], uy = this.u[y];
            if (uy >= 0) {
                if (ux >= 0) q.push([ux, uy]);
                else this.u[x] = uy;
                // predecessors pointing at y now point at x: the orbit of y is y → u y → u² y → y
                const a = this.find(uy), b = this.find(this.u[a]);
                if (this.find(this.u[b]) === x || this.u[b] === y) this.u[b] = x;
            }
        }
    }
    /** compact: live vertices with their S and U images, after normalizing pointers */
    live() {
        const out = [];
        for (let v = 0; v < this.n; v++) if (this.find(v) === v) out.push(v);
        return out;
    }
    /**
     * Membership of T^{k₁} S ⋯ S T^{k_n}: the word is freely reduced with the T-powers kept as
     * powers (reducedTokens), then traced, stepping through each power with cycle detection
     * (Brent: O(1) memory).
     */
    isMemberBlocks(ks) {
        let v = 0;
        const stepWord = (v, w) => { for (const x of w) { v = this.step(v, x, false); if (v < 0) return -1; } return v; };
        /** n repetitions of the word w from v, or −1 where the path leaves the graph */
        const walk = (v, w, n) => {
            if (n === 0n) return this.find(v);
            let tort = this.find(v), hare = stepWord(tort, w), j = 1n, power = 1n, lam = 1n;
            while (j < n) {
                if (hare < 0) return -1;
                if (hare === tort) {                     // a cycle of length lam: skip whole turns
                    let rest = (n - j) % lam;
                    while (rest-- > 0n) { hare = stepWord(hare, w); if (hare < 0) return -1; }
                    return hare;
                }
                if (power === lam) { tort = hare; power *= 2n; lam = 0n; }
                hare = stepWord(hare, w); lam++; j++;
            }
            return hare;
        };
        for (const t of reducedTokens(ks)) {
            v = typeof t === 'string' ? this.step(v, t, false) : walk(v, t.w, t.m);
            if (v < 0) return false;
        }
        return this.find(v) === this.find(0);
    }
    isMember(word) {
        let v = 0;
        for (const x of word) { v = this.step(v, x, false); if (v < 0) return false; }
        return this.find(v) === this.find(0);
    }
    stats() {
        const L = this.live();
        let sMissing = 0, uMissing = 0;
        for (const v of L) { if (this.s[v] < 0) sMissing++; if (this.u[v] < 0) uMissing++; }
        return { vertices: L.length, sMissing, uMissing, finiteIndex: sMissing === 0 && uMissing === 0 };
    }
}

/** H = ⟨mats⟩ ⊂ PGL₂(ℤ) (integer matrices, det ±1): its PSL₂ part H⁺ by Reidemeister–Schreier, folded. */
export function foldPGL2Z(mats) {
    const ms = mats.map(prim);
    const h0 = ms.find((m) => det(m) === -1n) || null;
    const h0inv = h0 ? [h0[3], -h0[1], -h0[2], h0[0]] : null;
    const plus = [];
    for (const g of ms) {
        if (det(g) === 1n) { plus.push(g); if (h0) plus.push(prim(mul(mul(h0, g), h0inv))); }
        else { plus.push(prim(mul(g, h0inv))); plus.push(prim(mul(h0, g))); }
    }
    const F = new Folded();
    for (const g of plus) { const w = normalForm(det(g) === 1n ? g : g.map((x) => -x)); F.addWord(w); }
    return { F, h0, h0inv, isMember(g0) {
        const g = prim(g0);
        if (det(g) === 1n) return F.isMember(normalForm(g));
        if (!h0) return false;
        return F.isMember(normalForm(prim(mul(g, h0inv))));
    }, stats: () => F.stats() };
}
