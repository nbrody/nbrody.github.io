/**
 * placeVolumes.js — the volume of Γ at every place at ∞, from one Dirichlet domain.
 *
 * Let D be Poincaré's Dirichlet domain for Γ at a complex place, compact, centered at o with Stab(o) = 1.
 * Wall i is the bisector of o and g_i·o, and the cell across it is g_i·D. The Delaunay cells of the orbit
 * Γ·o are dual to the vertices of the Dirichlet tessellation and tile ℍ³: a vertex v of D lies in the cells
 * γ·D for γ in a set E_v (|E_v| = m_v), and its Delaunay cell C_v is the convex hull of E_v·o. A Γ-orbit of
 * cells, with stabilizer H (acting freely on the m cells at v), meets D in m/|H| vertices, so
 *     vol(ℍ³/Γ) = Σ_v vol(C_v) / m_v.
 * At a simple vertex (on three walls i, j, k) C_v is the tetrahedron (1, g_i, g_j, g_k) and m_v = 4. Otherwise
 * C_v is cut into tetrahedra Γ-equivariantly, so that the pieces match across faces: coned from its
 * centroid, over its faces, each polygon (not a triangle) coned from its own centroid.
 *
 * The chain Σ_v (1/m_v)·C_v is a cycle, the fundamental class. Send each orbit point g·o to g·z for an ideal
 * point z, and a centroid to the average of its corners' images (a formal ℚ-combination: equivariant).
 * Each tetrahedron changes but the sum does not, so with D the Bloch–Wigner dilogarithm
 *     vol(ℍ³/Γ) = Σ ε · D(cr(the four images)),        ε = ±1 the orientation, weighted as above.
 * The cross-ratios lie in the field of definition F, and at another embedding σ of F the same sum is the
 * volume of the Galois conjugate ρ^σ: D(σβ) for the Bloch invariant β ∈ B(k) ⊗ ℚ (Neumann–Yang). It is 0 at
 * a real place (real cross-ratios) and wherever Γ is bounded (σ is real on the trace field k there).
 *
 * Numerical (double precision), with two checks: the sum does not depend on z, and at the discrete place
 * it is Poincaré's volume.
 */

const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const q = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };
const conj = (a) => cx(a.re, -a.im);
const abs = (a) => Math.hypot(a.re, a.im);

// ───────────────────────── the Bloch–Wigner dilogarithm ─────────────────────────

// B_{2n} / (2n+1)!, n = 1 … 15: Li₂(w) = u − u²/4 + Σ B_{2n} u^{2n+1}/(2n+1)!, u = −log(1 − w)
const BERN = [1 / 6, -1 / 30, 1 / 42, -1 / 30, 5 / 66, -691 / 2730, 7 / 6, -3617 / 510, 43867 / 798,
    -174611 / 330, 854513 / 138, -236364091 / 2730, 8553103 / 6, -23749461029 / 870, 8615841276005 / 14322];
const LI2_COEF = BERN.map((b, i) => { let f = 1; for (let k = 2; k <= 2 * i + 3; k++) f *= k; return b / f; });

/** Im Li₂(w) for |w| ≤ 1, Re w ≤ ½ (then |u| < 1.8 and the series converges fast). */
function imLi2Near0(w) {
    const om = cx(1 - w.re, -w.im);
    const u = cx(-Math.log(abs(om)), -Math.atan2(om.im, om.re));
    const u2 = mul(u, u);
    let s = cx(u.re - u2.re / 4, u.im - u2.im / 4);
    let p = mul(u, u2);                        // u³
    for (const c of LI2_COEF) {
        s = add(s, cx(c * p.re, c * p.im));
        p = mul(p, u2);
        if (abs(p) * Math.abs(c) < 1e-18) break;
    }
    return s.im;
}

/**
 * D(z) = Im Li₂(z) + arg(1 − z) log|z|, continuous on ℙ¹(ℂ), 0 on ℝ ∪ {∞}. The six substitutions
 * z ↦ z, 1 − z, 1/z, 1/(1 − z), z/(z − 1), (z − 1)/z change D by the sign shown; one of them lands in
 * |w| ≤ 1, Re w ≤ ½.
 */
export function blochWigner(z) {
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return 0;
    const one = cx(1);
    const cands = [];
    const push = (w, s) => { if (Number.isFinite(w.re) && Number.isFinite(w.im)) cands.push({ w, s }); };
    push(z, 1);
    push(sub(one, z), -1);
    if (abs(z) > 0) push(div(one, z), -1);
    if (abs(sub(one, z)) > 0) push(div(one, sub(one, z)), 1);
    if (abs(sub(z, one)) > 0) push(div(z, sub(z, one)), -1);
    if (abs(z) > 0) push(div(sub(z, one), z), 1);
    const ok = cands.find((c) => abs(c.w) <= 1 + 1e-12 && c.w.re <= 0.5 + 1e-12) || cands[0];
    const w = ok.w, r = abs(w);
    if (r < 1e-300 || Math.abs(w.im) < 1e-300) return 0;
    return ok.s * (imLi2Near0(w) + Math.atan2(-w.im, 1 - w.re) * Math.log(r));
}

// ───────────────────────── ℍ³ in poincare's coordinates ─────────────────────────
// A point is X = (x, y, z, t) with x² + y² + z² − t² = −1, t > 0; o = (0, 0, 0, 1). It is the Hermitian
// matrix [[t + z, x + iy], [x − iy, t − z]], and g acts by X ↦ g X g* / |det g| (checked against the walls:
// wall i is { X : ⟨cov_i, X⟩ = 0 }, with cov_i a positive multiple of g_i·o − o).

const arrMat = (e) => [cx(e[0], e[1]), cx(e[2], e[3]), cx(e[4], e[5]), cx(e[6], e[7])];
const madj = (M) => [M[3], cx(-M[1].re, -M[1].im), cx(-M[2].re, -M[2].im), M[0]];
const mmul = (A, B) => [
    add(mul(A[0], B[0]), mul(A[1], B[2])), add(mul(A[0], B[1]), mul(A[1], B[3])),
    add(mul(A[2], B[0]), mul(A[3], B[2])), add(mul(A[2], B[1]), mul(A[3], B[3])),
];
const mscale = (M) => { const s = Math.max(...M.map(abs)) || 1; return M.map((z) => cx(z.re / s, z.im / s)); };
const mdet = (M) => sub(mul(M[0], M[3]), mul(M[1], M[2]));

/** g·X. */
function act(g, X) {
    const [x, y, z, t] = X;
    const H = [cx(t + z), cx(x, y), cx(x, -y), cx(t - z)];
    const gs = [conj(g[0]), conj(g[2]), conj(g[1]), conj(g[3])];
    const K = mmul(mmul(g, H), gs);
    const d = abs(mdet(g));
    return [K[1].re / d, K[1].im / d, (K[0].re - K[3].re) / (2 * d), (K[0].re + K[3].re) / (2 * d)];
}
const O = [0, 0, 0, 1];

/** 4 × 4 determinant (rows). */
function det4(m) {
    const [a, b, c, d] = m;
    const s0 = a[0] * b[1] - a[1] * b[0], s1 = a[0] * b[2] - a[2] * b[0], s2 = a[0] * b[3] - a[3] * b[0];
    const s3 = a[1] * b[2] - a[2] * b[1], s4 = a[1] * b[3] - a[3] * b[1], s5 = a[2] * b[3] - a[3] * b[2];
    const c5 = c[2] * d[3] - c[3] * d[2], c4 = c[1] * d[3] - c[3] * d[1], c3 = c[1] * d[2] - c[2] * d[1];
    const c2 = c[0] * d[3] - c[3] * d[0], c1 = c[0] * d[2] - c[2] * d[0], c0 = c[0] * d[1] - c[1] * d[0];
    return s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
}

/** The kernel of three linear forms on ℝ⁴: the generalized cross product. */
function kernel3(p, q, r) {
    const minor = (i, j, k) => p[i] * (q[j] * r[k] - q[k] * r[j]) - p[j] * (q[i] * r[k] - q[k] * r[i]) + p[k] * (q[i] * r[j] - q[j] * r[i]);
    return [minor(1, 2, 3), -minor(0, 2, 3), minor(0, 1, 3), -minor(0, 1, 2)];
}

const vsum = (ps) => ps.reduce((s, p) => s.map((x, i) => x + p[i]), [0, 0, 0, 0]);
const near = (a, b, eps) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) < eps * Math.max(1, a[3]);

// ───────────────────────── the Delaunay cell of a vertex ─────────────────────────

/**
 * The faces of the convex hull of points P (on a sphere in ℍ³), in the Klein model: [[indices]], each face
 * a triangle or a polygon in cyclic order. null when degenerate.
 */
function hullFaces(P, tol = 1e-9) {
    const K = P.map((p) => [p[0] / p[3], p[1] / p[3], p[2] / p[3]]);
    const m = K.length;
    const d3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const faces = [], keys = new Set();
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) for (let c = b + 1; c < m; c++) {
        const n = cross(d3(K[b], K[a]), d3(K[c], K[a]));
        const ln = Math.hypot(...n);
        if (!(ln > 1e-14)) continue;
        const u = n.map((x) => x / ln);
        let pos = 0, neg = 0;
        const on = [];
        for (let i = 0; i < m; i++) {
            const s = dot3(u, d3(K[i], K[a]));
            if (Math.abs(s) <= tol) on.push(i); else if (s > 0) pos++; else neg++;
        }
        if (pos && neg) continue;
        const key = on.join(',');
        if (keys.has(key)) continue;
        keys.add(key);
        if (on.length > 3) {
            // cyclic order around the face's centroid
            const cen = [0, 1, 2].map((j) => on.reduce((s, i) => s + K[i][j], 0) / on.length);
            const e1 = d3(K[on[0]], cen), l1 = Math.hypot(...e1);
            const x1 = e1.map((x) => x / l1), y1 = cross(u, x1);
            on.sort((i, j) => {
                const vi = d3(K[i], cen), vj = d3(K[j], cen);
                return Math.atan2(dot3(vi, y1), dot3(vi, x1)) - Math.atan2(dot3(vj, y1), dot3(vj, x1));
            });
        }
        faces.push(on);
    }
    // Euler: V − E + F = 2, with E = (Σ face sizes)/2
    const E = faces.reduce((s, f) => s + f.length, 0) / 2;
    return m - E + faces.length === 2 ? faces : null;
}

// ───────────────────────── the cycle, from the domain ─────────────────────────

/**
 * The fundamental cycle of a compact Dirichlet domain, from poincare's serialized walls (cov, elem, word).
 * The domain is { X : ⟨cov, X⟩ ≤ 0 } for ⟨c, X⟩ = c₀X₀ + c₁X₁ + c₂X₂ − c₃X₃, with o = (0, 0, 0, 1).
 * Returns { ok: true, words, simplices: [{ w, pos }], vertices, simple } with pos four lists of indices into
 * words (a list of length > 1 is the formal average of its points) and w the signed weight; or
 * { ok: false, reason: 'ideal' | 'euler' | 'cell' | 'few', … }.
 */
export function dirichletCycle(walls, { tol = 1e-8 } = {}) {
    const n = walls.length;
    if (n < 4) return { ok: false, reason: 'few' };
    const F = walls.map((w) => {
        const [x, y, z, t] = w.cov;
        const s = Math.hypot(x, y, z, t) || 1;
        return [x / s, y / s, z / s, -t / s];
    });
    const dot = (f, X) => f[0] * X[0] + f[1] * X[1] + f[2] * X[2] + f[3] * X[3];
    const verts = [];
    let ideal = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
        let X = kernel3(F[i], F[j], F[k]);
        const e = Math.hypot(...X);
        if (!(e > 1e-12)) continue;
        X = X.map((x) => x / e);
        if (X[3] < 0) X = X.map((x) => -x);
        let inside = true;
        for (let m = 0; m < n; m++) {
            if (m === i || m === j || m === k) continue;
            if (dot(F[m], X) > tol) { inside = false; break; }
        }
        if (!inside) continue;
        const q = X[0] * X[0] + X[1] * X[1] + X[2] * X[2] - X[3] * X[3];
        if (q > -1e-9) { ideal++; continue; }         // on or beyond the sphere at ∞: D is not compact
        const s = Math.sqrt(-q);
        X = X.map((x) => x / s);
        if (verts.some((v) => near(v.X, X, 1e-7))) continue;
        const on = [];
        for (let m = 0; m < n; m++) if (Math.abs(dot(F[m], X)) <= tol * Math.max(1, X[3])) on.push(m);
        verts.push({ X, on });
    }
    if (ideal) return { ok: false, reason: 'ideal', vertices: verts.length };
    // Euler's formula for D: V − E + F = 2, each vertex on |on| edges
    const faceCount = new Set(verts.flatMap((v) => v.on)).size;
    const edges = verts.reduce((s, v) => s + v.on.length, 0) / 2;
    if (verts.length - edges + faceCount !== 2) return { ok: false, reason: 'euler', vertices: verts.length };

    const elems = walls.map((w) => mscale(arrMat(w.elem)));
    const P = elems.map((g) => act(g, O));
    const words = [[], ...walls.map((w) => w.word)];   // word index i + 1 is wall i
    const simplices = [];
    const orient = (pts) => (det4(pts) > 0 ? 1 : -1);
    let simple = 0;
    for (const v of verts) {
        // the cells γ·D around v, face to face: the walls of γ·D at v are γ·(the walls of D at γ⁻¹·v).
        // Three walls at v do not make v simple: in a square pyramid, a corner of the base is on three
        // walls of its cell, and the opposite corner's cell meets it only along an edge.
        const cells = [{ g: [cx(1), cx(0), cx(0), cx(1)], word: [], p: O }];
        for (let c = 0; c < cells.length && cells.length <= 64; c++) {
            const { g, word } = cells[c];
            const y = act(madj(g), v.X);
            const u = verts.find((x) => near(x.X, y, 1e-6));
            if (!u) return { ok: false, reason: 'cell', vertices: verts.length };
            for (const j of u.on) {
                const h = mscale(mmul(g, elems[j]));
                const p = act(h, O);
                if (cells.some((x) => near(x.p, p, 1e-6))) continue;
                cells.push({ g: h, word: [...word, ...walls[j].word], p });
            }
        }
        const r0 = v.X[3];                             // cosh d(v, o)
        if (cells.length > 64 || cells.some((x) => Math.abs((x.p[3] * v.X[3] - x.p[0] * v.X[0] - x.p[1] * v.X[1] - x.p[2] * v.X[2]) - r0) > 1e-6 * r0)) {
            return { ok: false, reason: 'cell', vertices: verts.length };
        }
        if (cells.length === 4) {
            // simple: the tetrahedron (1, g_i, g_j, g_k)
            const [i, j, k] = v.on;
            simplices.push({ w: orient([O, P[i], P[j], P[k]]) / 4, pos: [[0], [i + 1], [j + 1], [k + 1]] });
            simple++;
            continue;
        }
        const faces = hullFaces(cells.map((x) => x.p));
        if (!faces) return { ok: false, reason: 'cell', vertices: verts.length };
        const base = words.length;
        for (const x of cells) words.push(x.word);
        const all = cells.map((_, i) => base + i);
        const cC = vsum(cells.map((x) => x.p));
        const wt = 1 / cells.length;
        for (const f of faces) {
            if (f.length === 3) {
                const [a, b, c] = f;
                simplices.push({ w: orient([cC, cells[a].p, cells[b].p, cells[c].p]) * wt, pos: [all, [base + a], [base + b], [base + c]] });
                continue;
            }
            const cF = vsum(f.map((i) => cells[i].p));
            const fIdx = f.map((i) => base + i);
            for (let s = 0; s < f.length; s++) {
                const a = f[s], b = f[(s + 1) % f.length];
                simplices.push({ w: orient([cC, cF, cells[a].p, cells[b].p]) * wt, pos: [all, fIdx, [base + a], [base + b]] });
            }
        }
    }
    return { ok: true, words, simplices, vertices: verts.length, simple };
}

// ───────────────────────── the sum, at an embedding ─────────────────────────

/** The matrix of a word (letters ±1, ±2, …; −i is the inverse of generator i) in gens ([a, b, c, d] of { re, im }). */
export function wordMatrix(word, gens) {
    let M = [cx(1), cx(0), cx(0), cx(1)];
    for (const l of word) {
        const g = gens[Math.abs(l) - 1];
        M = mscale(mmul(M, l > 0 ? g : madj(g)));
    }
    return M;
}

/** Σ w · D(cr) over the cycle at one embedding (gens), for the ideal point z. */
export function cycleSum(cycle, gens, z) {
    const zv = [z, cx(1)];
    const pts = cycle.words.map((w) => {
        const M = wordMatrix(w, gens);
        const v = [add(mul(M[0], zv[0]), M[1]), add(mul(M[2], zv[0]), M[3])];
        const s = Math.max(abs(v[0]), abs(v[1])) || 1;
        return v.map((x) => cx(x.re / s, x.im / s));
    });
    const br = (u, v) => sub(mul(u[0], v[1]), mul(u[1], v[0]));
    // cr(z₀, z₁, z₂, z₃) = (z₃ − z₁)(z₂ − z₀) / ((z₃ − z₀)(z₂ − z₁)), in homogeneous coordinates
    const D4 = (v0, v1, v2, v3) => {
        const den = mul(br(v3, v0), br(v2, v1));
        if (abs(den) < 1e-300) return 0;               // degenerate: D = 0
        return blochWigner(div(mul(br(v3, v1), br(v2, v0)), den));
    };
    let sum = 0;
    for (const { w, pos } of cycle.simplices) {
        const [A, B, C, E] = pos;
        let s = 0;
        for (const a of A) for (const b of B) for (const c of C) for (const e of E) s += D4(pts[a], pts[b], pts[c], pts[e]);
        sum += w * s / (A.length * B.length * C.length * E.length);
    }
    return sum;
}

/** Σ c_i w^i for Frac coefficients c ({ p, q }, low → high), at w = root. */
function evalAt(coeffs, root) {
    let r = cx(0);
    for (let i = coeffs.length - 1; i >= 0; i--) {
        const c = coeffs[i];
        r = add(mul(r, root), cx(Number(c.p) / Number(c.q)));
    }
    return r;
}

/** The generators of the field model (field.js: mats of { coeffs }) at the embedding w ↦ root. */
export function gensAt(model, root) {
    return model.mats.map((row) => row.map((e) => evalAt(e.coeffs, root)));
}

const Z_TRIES = [cx(3 / 7), cx(-5 / 11)];

/**
 * The volume at each embedding: embeddings = [{ key, root }], discreteRoot = the root of the place where D
 * was computed, refVolume = Poincaré's volume there (or null). Returns
 *   { ok: true, value, at: Map(key → { value, err }), check: { z, ref } }, or { ok: false, reason }.
 * Values are signed so that the discrete place has +vol (its complex conjugate −vol); err is the spread over
 * the ideal points z tried, an estimate of the rounding (high powers of a large root lose digits).
 */
export function placeVolumes(cycle, model, embeddings, discreteRoot, refVolume = null) {
    if (!cycle || !cycle.ok) return { ok: false, reason: cycle ? cycle.reason : 'none' };
    const raw = (root) => Z_TRIES.map((z) => cycleSum(cycle, gensAt(model, root), z));
    const spread = (xs) => Math.max(...xs) - Math.min(...xs);
    const here = raw(discreteRoot);
    const v = here[0];
    if (!(Math.abs(v) > 1e-6)) return { ok: false, reason: 'zero' };
    const sign = v > 0 ? 1 : -1;
    let zErr = spread(here);
    const at = new Map();
    for (const e of embeddings) {
        const xs = raw(e.root);
        const err = spread(xs);
        zErr = Math.max(zErr, err);
        at.set(e.key, { value: sign * xs[0], err });
    }
    const refErr = refVolume != null ? Math.abs(Math.abs(v) - refVolume) / refVolume : null;
    if (!(zErr <= 1e-6 * Math.max(1, Math.abs(v)))) return { ok: false, reason: 'zdep', zErr };
    if (refErr != null && !(refErr < 1e-4)) return { ok: false, reason: 'ref', refErr, value: Math.abs(v) };
    return { ok: true, value: Math.abs(v), at, check: { z: zErr, ref: refErr } };
}

/** Decimal places worth showing for a value with error estimate err (4 to 10). */
export function volumeDigits(err) {
    return Math.max(4, Math.min(10, Math.floor(-Math.log10(Math.max(err, 1e-13))) - 1));
}
