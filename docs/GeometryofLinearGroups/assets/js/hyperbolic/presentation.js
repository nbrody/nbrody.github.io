/**
 * Finite presentations: Tietze simplification, abelianization, and rewriting
 * a Poincaré presentation (in face-pairing generators s_i) into the user's
 * own generators g_j.
 *
 * A presentation is { n, relators: [{enc, m}] }: generators 1..n, and each
 * relator the word enc (signed 1-based indices) raised to the m-th power.
 */

// ---------------- words ----------------

/** Free reduction, then cyclic reduction. */
export function cyclicReduce(word) {
    const out = [];
    for (const x of word) {
        if (out.length && out[out.length - 1] === -x) out.pop();
        else out.push(x);
    }
    let a = 0, b = out.length - 1;
    while (a < b && out[a] === -out[b]) { a++; b--; }
    return out.slice(a, b + 1);
}

export function freeReduce(word) {
    const out = [];
    for (const x of word) {
        if (out.length && out[out.length - 1] === -x) out.pop();
        else out.push(x);
    }
    return out;
}

const inverse = (w) => w.slice().reverse().map(x => -x);

/** Canonical key of a relator up to cyclic permutation and inversion. */
function relatorKey(enc, m) {
    if (enc.length === 0) return `|${m}`;
    let best = null;
    for (const w of [enc, inverse(enc)]) {
        for (let r = 0; r < w.length; r++) {
            const s = [...w.slice(r), ...w.slice(0, r)].join(',');
            if (best === null || s < best) best = s;
        }
    }
    return `${best}|${m}`;
}

/**
 * The same relator set with trivial relators dropped and duplicates (up to
 * cyclic permutation and inversion) removed. A relator w^m with w itself a
 * proper power is left alone; only exact duplicates merge.
 */
export function tidyRelators(relators) {
    const seen = new Set();
    const out = [];
    for (const R of relators) {
        let enc = cyclicReduce(R.enc);
        if (enc.length === 0) continue;
        // A relator that is a proper power u^k is written (u)^(k·m).
        let m = R.m;
        for (let p = 1; p <= enc.length / 2; p++) {
            if (enc.length % p) continue;
            let periodic = true;
            for (let i = p; i < enc.length && periodic; i++) if (enc[i] !== enc[i - p]) periodic = false;
            if (periodic) { m *= enc.length / p; enc = enc.slice(0, p); break; }
        }
        const key = relatorKey(enc, m);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ enc, m });
    }
    out.sort((a, b) => a.enc.length * a.m - b.enc.length * b.m);
    return out;
}

/** Substitute generator g (1-based) by the word `sub` everywhere in `word`. */
function substitute(word, g, sub) {
    const inv = inverse(sub);
    const out = [];
    for (const x of word) {
        if (x === g) out.push(...sub);
        else if (x === -g) out.push(...inv);
        else out.push(x);
    }
    return freeReduce(out);
}

// ---------------- Tietze simplification ----------------

/**
 * Greedy Tietze simplification: repeatedly pick a relator (with m = 1) in
 * which some generator occurs exactly once, solve it for that generator, and
 * substitute the solution everywhere. Shortest relators first; stops when no
 * generator can be eliminated or the words would grow past `maxLen`.
 *
 * @returns {{
 *   n, relators, kept: number[],       // kept[k] = original index of new gen k+1
 *   express: number[][]                 // express[i] = original gen i+1 as a word in new gens
 * }}
 */
export function simplifyPresentation(pres, { maxLen = 400 } = {}) {
    const n0 = pres.n;
    let rels = tidyRelators(pres.relators);
    // Working generators keep their ORIGINAL numbering until the end.
    const alive = new Set(Array.from({ length: n0 }, (_, i) => i + 1));
    // express[g] = word (original numbering) currently representing g.
    const express = new Map([...alive].map(g => [g, [g]]));

    for (let pass = 0; pass < 10 * n0 + 10; pass++) {
        let choice = null;
        for (let r = 0; r < rels.length && !choice; r++) {
            const R = rels[r];
            if (R.m !== 1) continue;
            const count = new Map();
            for (const x of R.enc) count.set(Math.abs(x), (count.get(Math.abs(x)) || 0) + 1);
            // Prefer the generator that appears in the fewest other relators.
            let bestG = 0, bestUse = Infinity;
            for (const [g, c] of count) {
                if (c !== 1) continue;
                let use = 0;
                for (const S of rels) if (S !== R && S.enc.some(x => Math.abs(x) === g)) use += S.enc.length;
                if (use < bestUse) { bestUse = use; bestG = g; }
            }
            if (bestG) choice = { r, g: bestG };
        }
        if (!choice) break;
        const R = rels[choice.r];
        const g = choice.g;
        // Rotate so g^ε is last: R = w·g^ε  ⇒  g = (w^{-1})^ε.
        const pos = R.enc.findIndex(x => Math.abs(x) === g);
        const rot = [...R.enc.slice(pos + 1), ...R.enc.slice(0, pos + 1)];
        const eps = rot[rot.length - 1] > 0 ? 1 : -1;
        const w = rot.slice(0, -1);
        const sub = eps > 0 ? inverse(w) : w;
        const next = [];
        let tooLong = false;
        for (let s = 0; s < rels.length; s++) {
            if (s === choice.r) continue;
            const enc = substitute(rels[s].enc, g, sub);
            if (enc.length > maxLen) { tooLong = true; break; }
            next.push({ enc, m: rels[s].m });
        }
        if (tooLong) break;
        rels = tidyRelators(next);
        alive.delete(g);
        // `sub` only involves surviving generators (it is part of a relator),
        // so one substitution keeps every recorded expression current.
        for (const [h, word] of express) express.set(h, substitute(word, g, sub));
        express.set(g, sub);
    }

    // Renumber the survivors 1..n.
    const kept = [...alive].sort((a, b) => a - b);
    const idx = new Map(kept.map((g, k) => [g, k + 1]));
    const renum = (w) => w.map(x => (x > 0 ? 1 : -1) * idx.get(Math.abs(x)));
    const relators = rels.map(R => ({ enc: renum(R.enc), m: R.m }));
    const expressOut = [];
    for (let g = 1; g <= n0; g++) {
        const w = express.get(g);
        expressOut.push(w && w.every(x => idx.has(Math.abs(x))) ? renum(w) : null);
    }
    return { n: kept.length, relators, kept, express: expressOut };
}

// ---------------- rewriting into the input generators ----------------

/**
 * Presentation of G on the user's generators g_1..g_k.
 *
 * Poincaré gives Γ = ⟨s | R(s)⟩, each s_i a word w_i(g). If every g_j is also
 * a word v_j(s) (the membership check), then G = Γ and Tietze moves give
 *     G = ⟨ g | R(w(g)),  g_j^{-1}·v_j(w(g)) ⟩,
 * which only needs free/cyclic reduction and de-duplication to become
 * readable. Returns null when some generator's expression is missing.
 */
export function presentationInInputGenerators(pres, k) {
    if (!pres || !pres.generatorExpressions || pres.generatorExpressions.length !== k) return null;
    if (pres.generatorExpressions.some(e => !e)) return null;
    const wOf = (x) => {
        const w = pres.generators[Math.abs(x) - 1].word;
        return x > 0 ? w : inverse(w);
    };
    const rewrite = (enc) => freeReduce(enc.flatMap(wOf));
    const rels = pres.relatorsEnc.map(R => ({ enc: rewrite(R.enc), m: R.m }));
    pres.generatorExpressions.forEach((v, j) => {
        rels.push({ enc: [-(j + 1), ...rewrite(v)], m: 1 });
    });
    return { n: k, relators: tidyRelators(rels) };
}

// ---------------- abelianization ----------------

function smithNormalForm(rows, n) {
    // rows: BigInt arrays of length n. Returns the nonzero diagonal.
    const A = rows.map(r => r.slice());
    const m = A.length;
    const abs = x => (x < 0n ? -x : x);
    const diag = [];
    let t = 0;
    while (t < Math.min(m, n)) {
        let pr = -1, pc = -1, best = 0n;
        for (let i = t; i < m; i++) for (let j = t; j < n; j++) {
            if (A[i][j] !== 0n && (best === 0n || abs(A[i][j]) < best)) { best = abs(A[i][j]); pr = i; pc = j; }
        }
        if (pr < 0) break;
        [A[t], A[pr]] = [A[pr], A[t]];
        for (const r of A) [r[t], r[pc]] = [r[pc], r[t]];
        for (let guard = 0; guard < 10000; guard++) {
            let dirty = false;
            for (let i = t + 1; i < m; i++) {
                const q = A[i][t] / A[t][t];
                if (q) for (let j = t; j < n; j++) A[i][j] -= q * A[t][j];
                if (A[i][t] !== 0n) dirty = true;
            }
            for (let j = t + 1; j < n; j++) {
                const q = A[t][j] / A[t][t];
                if (q) for (let i = t; i < m; i++) A[i][j] -= q * A[i][t];
                if (A[t][j] !== 0n) dirty = true;
            }
            if (!dirty) {
                // Divisibility: the pivot must divide the rest of the block.
                let fix = -1;
                for (let i = t + 1; i < m && fix < 0; i++) for (let j = t + 1; j < n; j++) {
                    if (A[i][j] % A[t][t] !== 0n) { fix = i; break; }
                }
                if (fix < 0) break;
                for (let j = t; j < n; j++) A[t][j] += A[fix][j];
                continue;
            }
            // Move the smallest nonzero entry of row/column t to the pivot.
            let bi = t, bj = t, bv = abs(A[t][t]);
            for (let i = t + 1; i < m; i++) if (A[i][t] !== 0n && abs(A[i][t]) < bv) { bv = abs(A[i][t]); bi = i; bj = t; }
            for (let j = t + 1; j < n; j++) if (A[t][j] !== 0n && abs(A[t][j]) < bv) { bv = abs(A[t][j]); bi = t; bj = j; }
            [A[t], A[bi]] = [A[bi], A[t]];
            for (const r of A) [r[t], r[bj]] = [r[bj], r[t]];
        }
        diag.push(abs(A[t][t]));
        t++;
    }
    return diag;
}

/**
 * First homology H₁ = G/[G,G] of a presentation: {free, torsion: BigInt[]}
 * with torsion the invariant factors > 1.
 */
export function abelianization(pres) {
    const n = pres.n;
    if (n === 0) return { free: 0, torsion: [] };
    const rows = pres.relators.map(R => {
        const row = new Array(n).fill(0n);
        for (const x of R.enc) row[Math.abs(x) - 1] += BigInt(x > 0 ? R.m : -R.m);
        return row;
    }).filter(r => r.some(v => v !== 0n));
    const diag = smithNormalForm(rows, n);
    const rank = diag.filter(d => d !== 0n).length;
    return { free: n - rank, torsion: diag.filter(d => d > 1n) };
}

export function abelianizationString(ab, { tex = false } = {}) {
    const Z = tex ? '\\mathbb{Z}' : 'ℤ';
    const parts = [];
    if (ab.free === 1) parts.push(Z);
    else if (ab.free > 1) parts.push(tex ? `${Z}^{${ab.free}}` : `ℤ${superscript(ab.free)}`);
    for (const d of ab.torsion) parts.push(tex ? `${Z}/${d}` : `ℤ/${d}`);
    if (!parts.length) return tex ? '0' : '0';
    return parts.join(tex ? ' \\oplus ' : ' ⊕ ');
}

function superscript(n) {
    const map = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    return String(n).split('').map(d => map[+d]).join('');
}

// ---------------- display ----------------

/** LaTeX word in generators `letter_i`, compressing runs (a a a → a³). */
export function wordTex(enc, names) {
    const parts = [];
    let i = 0;
    while (i < enc.length) {
        let j = i;
        while (j < enc.length && enc[j] === enc[i]) j++;
        const g = Math.abs(enc[i]), c = j - i;
        const e = enc[i] > 0 ? c : -c;
        const base = names(g);
        parts.push(e === 1 ? base : `${base}^{${e}}`);
        i = j;
    }
    return parts.length ? parts.join('\\,') : '1';
}

/** LaTeX ⟨ gens | relators ⟩ with generator names from `names(i)` (1-based). */
export function presentationTex(pres, names, { maxRelators = 12 } = {}) {
    const gens = Array.from({ length: pres.n }, (_, i) => names(i + 1)).join(',\\, ');
    const rel = (R) => {
        const w = wordTex(R.enc, names);
        if (R.m === 1) return w;
        if (R.enc.length === 1 && R.enc[0] > 0) return `${names(R.enc[0])}^{${R.m}}`;
        return `\\left(${w}\\right)^{${R.m}}`;
    };
    if (pres.relators.length === 0) {
        return `\\left\\langle\\; ${gens} \\;\\right\\rangle` + (pres.n > 0 ? `\\ \\cong\\ F_{${pres.n}}` : '');
    }
    const shown = pres.relators.slice(0, maxRelators).map(rel);
    if (pres.relators.length > maxRelators) shown.push(`\\ldots\\ (${pres.relators.length - maxRelators}\\text{ more})`);
    return `\\left\\langle\\; ${gens} \\;\\middle|\\; ${shown.join(',\\;\\; ')} \\;\\right\\rangle`;
}

/** Plain-text relator list (GAP-style words), for export. */
export function presentationText(pres, names) {
    const word = (enc) => enc.map(x => names(Math.abs(x)) + (x < 0 ? '^-1' : '')).join('*') || 'One';
    return pres.relators.map(R => R.m === 1 ? word(R.enc) : `(${word(R.enc)})^${R.m}`);
}
