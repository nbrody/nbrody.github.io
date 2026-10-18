/**
 * Pairs of elements of PGL₂(K) of small height, for number fields K = ℚ(w) with O_K = ℤ[w] and
 * class number 1 (so every point of P³(K) has a representative with entries in O_K generating
 * the unit ideal).
 *
 * Elements are matrices with entries in ℤ[w], coefficients in [−c, c], whose entries generate
 * (1). The height is the absolute logarithmic Weil height of [a : b : c : d] with the operator
 * norm at the places at ∞:
 *     h(g) = (1/[K:ℚ]) Σ_σ n_σ log σ₁(σ(g)),   n_σ = 1 (real), 2 (complex),
 * the finite places contributing nothing for such a representative. Over ℚ this is log σ₁, as in
 * enumerate.mjs. A pair is listed once per orbit of: g ↦ g⁻¹, the swap, conjugation by the Klein
 * four-group, and the automorphisms of K (which permute the places and change no verdict).
 *
 *   node batch/enumerateNF.mjs i 1.6       elements and pairs of ℚ(i) with e^h ≤ 1.6
 */

/** The fields: minimal polynomial of w (monic, low → high), a root to embed by, and labels. */
export const FIELDS = {
    i:   { poly: [1, 0, 1],      root: { re: 0, im: 1 },            tex: '\\mathbb{Q}(i)',          name: 'ℚ(i)',       gal: [[0, -1]] },
    m2:  { poly: [2, 0, 1],      root: { re: 0, im: Math.SQRT2 },   tex: '\\mathbb{Q}(\\sqrt{-2})', name: 'ℚ(√−2)',     gal: [[0, -1]] },
    m3:  { poly: [1, -1, 1],     root: { re: 0.5, im: Math.sqrt(3) / 2 }, tex: '\\mathbb{Q}(\\sqrt{-3})', name: 'ℚ(√−3)', gal: [[1, -1]] },
    r2:  { poly: [-2, 0, 1],     root: { re: Math.SQRT2, im: 0 },   tex: '\\mathbb{Q}(\\sqrt{2})',  name: 'ℚ(√2)',      gal: [[0, -1]] },
    r3:  { poly: [-3, 0, 1],     root: { re: Math.sqrt(3), im: 0 }, tex: '\\mathbb{Q}(\\sqrt{3})',  name: 'ℚ(√3)',      gal: [[0, -1]] },
    r5:  { poly: [-1, -1, 1],    root: { re: (1 + Math.sqrt(5)) / 2, im: 0 }, tex: '\\mathbb{Q}(\\sqrt{5})', name: 'ℚ(√5)', gal: [[1, -1]] },
    c2:  { poly: [-2, 0, 0, 1],  root: { re: Math.cbrt(2), im: 0 },  tex: '\\mathbb{Q}(\\sqrt[3]{2})', name: 'ℚ(∛2)',   gal: [] },
    c23: { poly: [-1, -1, 0, 1], root: { re: 1.324717957244746, im: 0 }, tex: '\\mathbb{Q}(\\theta),\\ \\theta^3=\\theta+1', name: 'ℚ(θ), θ³=θ+1', gal: [] },
    c7:  { poly: [-1, -2, 1, 1], root: { re: 2 * Math.cos(2 * Math.PI / 7), im: 0 }, tex: '\\mathbb{Q}(\\zeta_7)^+', name: 'ℚ(ζ₇)⁺', gal: [[-2, 0, 1], [1, -1, -1]] },
};

// ── arithmetic in ℤ[w] and ℚ(w), coefficient vectors low → high ──
const reduce = (v, P) => {
    const d = P.length - 1, r = v.slice();
    for (let k = r.length - 1; k >= d; k--) { const c = r[k]; if (!c) continue; for (let j = 0; j < d; j++) r[k - d + j] -= c * P[j]; r[k] = 0; }
    return r.slice(0, d).concat(Array(Math.max(0, d - r.length)).fill(0)).slice(0, d);
};
const pmul = (a, b, P) => { const r = Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] += x * y; })); return reduce(r, P); };
const padd = (a, b) => a.map((x, i) => x + b[i]);
const psub = (a, b) => a.map((x, i) => x - b[i]);
const isZero = (a) => a.every((x) => x === 0);

/** The field's embeddings: one per real place, one per pair of complex places (weight 2). */
export function embeddings(F) {
    const P = F.poly, d = P.length - 1;
    // Durand–Kerner on the monic polynomial
    let z = Array.from({ length: d }, (_, k) => ({ re: Math.cos(0.4 + 2 * Math.PI * k / d) * 1.3, im: Math.sin(0.4 + 2 * Math.PI * k / d) * 1.3 }));
    const ev = (x) => { let r = { re: 0, im: 0 }; for (let k = d; k >= 0; k--) r = { re: r.re * x.re - r.im * x.im + P[k], im: r.re * x.im + r.im * x.re }; return r; };
    for (let it = 0; it < 500; it++) {
        z = z.map((zi, i) => {
            let den = { re: 1, im: 0 };
            z.forEach((zj, j) => { if (j === i) return; const t = { re: zi.re - zj.re, im: zi.im - zj.im }; den = { re: den.re * t.re - den.im * t.im, im: den.re * t.im + den.im * t.re }; });
            const n = ev(zi), q = den.re * den.re + den.im * den.im;
            return { re: zi.re - (n.re * den.re + n.im * den.im) / q, im: zi.im - (n.im * den.re - n.re * den.im) / q };
        });
    }
    const out = [];
    for (const r of z) {
        if (Math.abs(r.im) < 1e-9) out.push({ re: r.re, im: 0, n: 1 });
        else if (r.im > 0) out.push({ re: r.re, im: r.im, n: 2 });
    }
    return out;
}
const evalAt = (a, x) => { let re = 0, im = 0; for (let k = a.length - 1; k >= 0; k--) { const r = re * x.re - im * x.im + a[k], i = re * x.im + im * x.re; re = r; im = i; } return { re, im }; };

/** σ₁ of a complex 2×2 matrix. */
function sigma1C(m) {
    const f = m.reduce((s, z) => s + z.re * z.re + z.im * z.im, 0);
    const D = { re: m[0].re * m[3].re - m[0].im * m[3].im - (m[1].re * m[2].re - m[1].im * m[2].im), im: m[0].re * m[3].im + m[0].im * m[3].re - (m[1].re * m[2].im + m[1].im * m[2].re) };
    const D2 = D.re * D.re + D.im * D.im;
    return Math.sqrt((f + Math.sqrt(Math.max(f * f - 4 * D2, 0))) / 2);
}

/** h(g) for g with entries in O_K generating (1). */
export function height(F, g) {
    const E = F._emb || (F._emb = embeddings(F));
    const d = F.poly.length - 1;
    let s = 0;
    for (const e of E) s += e.n * Math.log(sigma1C(g.map((a) => evalAt(a, e))));
    return s / d;
}

/** det g ∈ ℤ[w]. */
export const detNF = (F, [a, b, c, d]) => psub(pmul(a, d, F.poly), pmul(b, c, F.poly));

/** N(ideal generated by the entries): the index in ℤ^d of the span of {e·w^j}, as the gcd of the d×d minors. */
function contentNorm(F, g) {
    const d = F.poly.length - 1;
    const cols = [];
    for (const e of g) { let x = e.slice(); for (let j = 0; j < d; j++) { cols.push(x); x = pmul(x, [0, 1], F.poly); } }
    const det = (M) => (M.length === 1 ? M[0][0] : M.length === 2 ? M[0][0] * M[1][1] - M[0][1] * M[1][0]
        : M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]));
    const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
    let G = 0;
    const pick = (start, chosen) => {
        if (G === 1) return;
        if (chosen.length === d) { G = gcd(G, det(Array.from({ length: d }, (_, r) => chosen.map((c) => cols[c][r])))); return; }
        for (let k = start; k < cols.length; k++) pick(k + 1, chosen.concat(k));
    };
    pick(0, []);
    return G;
}

// ── exact ℚ(w) for keys: x / y as a rational vector ──
const fr = (n, d = 1n) => { const g = ((a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; })(n, d) || 1n; return d < 0n ? [-n / g, -d / g] : [n / g, d / g]; };
/** x / y in ℚ(w): solve (multiplication by y) · q = x over ℚ by Gaussian elimination. */
function divide(F, x, y) {
    const d = F.poly.length - 1;
    const M = [];
    let col = Array(d).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    const cols = [];
    for (let j = 0; j < d; j++) { cols.push(pmul(y, col, F.poly)); col = pmul(col, [0, 1], F.poly); }
    for (let r = 0; r < d; r++) M.push(cols.map((c) => fr(BigInt(c[r]))).concat([fr(BigInt(x[r]))]));
    const sub = (a, b) => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]), mul = (a, b) => fr(a[0] * b[0], a[1] * b[1]), div = (a, b) => fr(a[0] * b[1], a[1] * b[0]);
    for (let c = 0; c < d; c++) {
        let p = c; while (M[p][c][0] === 0n) p++;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < d; r++) {
            if (r === c || M[r][c][0] === 0n) continue;
            const f = div(M[r][c], M[c][c]);
            M[r] = M[r].map((v, k) => sub(v, mul(f, M[c][k])));
        }
    }
    return M.map((row, r) => div(row[d], row[r]));
}
/** The projective key: every entry divided by the first nonzero one. */
export function projKey(F, g) {
    const f = g.find((e) => !isZero(e));
    return g.map((e) => divide(F, e, f).map(([n, d]) => (d === 1n ? `${n}` : `${n}/${d}`)).join(' ')).join(';');
}

// ── symmetries ──
const adjM = ([a, b, c, d]) => [d, b.map((x) => -x), c.map((x) => -x), a];
const KLEIN = [
    (m) => m,
    ([a, b, c, d]) => [d, c, b, a],
    ([a, b, c, d]) => [a, b.map((x) => -x), c.map((x) => -x), d],
    ([a, b, c, d]) => [d, c.map((x) => -x), b.map((x) => -x), a],
];
/** σ(e) for the automorphism w ↦ s (s a coefficient vector). */
function applyGal(F, e, s) {
    let r = Array(F.poly.length - 1).fill(0), pw = r.map((_, i) => (i === 0 ? 1 : 0));
    for (let k = 0; k < e.length; k++) { r = padd(r, pw.map((x) => x * e[k])); pw = pmul(pw, s.concat(Array(Math.max(0, F.poly.length - 1 - s.length)).fill(0)), F.poly); }
    return r;
}
function galoisGroup(F) {
    const d = F.poly.length - 1, id = Array(d).fill(0).map((_, i) => (i === 1 ? 1 : 0));
    const maps = [id.length ? id : [0]];
    for (const s of F.gal) maps.push(s.concat(Array(Math.max(0, d - s.length)).fill(0)));
    return maps;
}

/** The least key of the pair under the symmetries; and the pair as written there. */
export function canonPairNF(F, g, h) {
    const gal = galoisGroup(F);
    let best = null;
    for (const s of gal) {
        const G = s === gal[0] ? g : g.map((e) => applyGal(F, e, s)), H = s === gal[0] ? h : h.map((e) => applyGal(F, e, s));
        for (const K of KLEIN) {
            const a = K(G), b = K(H);
            for (const x of [a, adjM(a)]) for (const y of [b, adjM(b)]) {
                for (const [u, v] of [[x, y], [y, x]]) {
                    const key = `${projKey(F, u)}|${projKey(F, v)}`;
                    if (!best || key < best.key) best = { key, pair: [u, v] };
                }
            }
        }
    }
    return best;
}

/** Every element with coefficients in [−c, c], content (1), not scalar, invertible, and e^h ≤ B. */
export function elementsNF(F, B, c = 2) {
    const d = F.poly.length - 1;
    const coeffs = [];
    const rec = (pre) => { if (pre.length === d) { coeffs.push(pre); return; } for (let x = -c; x <= c; x++) rec(pre.concat(x)); };
    rec([]);
    const out = new Map();
    const logB = Math.log(B) + 1e-9;
    // prune by the height of single entries: σ₁ ≥ max |σ(entry)|
    const E = F._emb || (F._emb = embeddings(F));
    const entryH = (a) => E.reduce((s, e) => { const z = evalAt(a, e); return s + e.n * Math.log(Math.max(Math.hypot(z.re, z.im), 1e-300)); }, 0) / d;
    const small = coeffs.filter((a) => isZero(a) || entryH(a) <= logB);
    for (const a of small) for (const b of small) for (const cc of small) for (const dd of small) {
        const g = [a, b, cc, dd];
        if (isZero(detNF(F, g))) continue;
        if (isZero(b) && isZero(cc) && psub(a, dd).every((x) => x === 0)) continue;
        if (g.every(isZero)) continue;
        const h = height(F, g);
        if (h > logB) continue;
        if (contentNorm(F, g) !== 1) continue;
        const k = projKey(F, g), size = g.reduce((t, e) => t + e.reduce((u, x) => u + Math.abs(x), 0), 0);
        const old = out.get(k);
        if (!old || size < old.size) out.set(k, { g, h, size });          // the smallest unit multiple
    }
    return [...out.values()].sort((x, y) => x.h - y.h);
}

/** TeX for an entry of ℤ[w], in the poincare reader's syntax. */
export function entryTex(a) {
    const terms = [];
    a.forEach((c, k) => {
        if (!c) return;
        const mon = k === 0 ? '' : k === 1 ? 'w' : `w^{${k}}`;
        const coef = k === 0 ? String(Math.abs(c)) : Math.abs(c) === 1 ? '' : String(Math.abs(c));
        terms.push({ s: c < 0 ? '-' : '+', t: coef + mon });
    });
    if (!terms.length) return '0';
    return terms.map((x, i) => (i === 0 ? (x.s === '-' ? '-' : '') : x.s) + x.t).join('');
}
export const matTex = (g) => g.map(entryTex);

/** A seeded PRNG (mulberry32). */
export function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** n pairs from the elements with e^h ≤ B, one per symmetry class (all of them when there are fewer). */
export function samplePairsNF(F, B, n, seed = 1, c = 2) {
    const els = elementsNF(F, B, c), rand = rng(seed);
    const seen = new Set(), out = [];
    const total = els.length * (els.length - 1) / 2;
    const add = (i, j) => {
        const g = els[i].g, h = els[j].g;
        if (projKey(F, g) === projKey(F, adjM(h))) return;
        const p = canonPairNF(F, g, h);
        if (seen.has(p.key)) return;
        seen.add(p.key);
        const hs = p.pair.map((m) => height(F, m));
        out.push({ key: p.key, g: p.pair, h: hs, hmax: Math.max(...hs), hsum: hs[0] + hs[1] });
    };
    if (total <= 3 * n) { for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) add(i, j); }
    else for (let tries = 0; out.length < n && tries < 50 * n; tries++) {
        const i = Math.floor(rand() * els.length), j = Math.floor(rand() * els.length);
        if (i !== j) add(Math.min(i, j), Math.max(i, j));
    }
    out.sort((x, y) => x.hmax - y.hmax || x.hsum - y.hsum || (x.key < y.key ? -1 : 1));
    return { elements: els.length, pairs: out.slice(0, n) };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
    const [f, Bs, cs] = process.argv.slice(2);
    const F = FIELDS[f];
    const t0 = Date.now();
    const els = elementsNF(F, Number(Bs), Number(cs || 2));
    console.log(`${F.name}: ${els.length} elements with e^h ≤ ${Bs} (${Date.now() - t0} ms); embeddings`, embeddings(F).map((e) => `${e.re.toFixed(3)}${e.im ? `+${e.im.toFixed(3)}i` : ''}`).join(', '));
    for (const e of els.slice(0, 6)) console.log('  ', matTex(e.g).join(', '), Math.exp(e.h).toFixed(3));
}
