/**
 * fields.js — the database's standard number fields K = ℚ(w) with O_K = ℤ[w] and class number 1.
 *
 * Shared by database/db.js (browser) and batch/enumerateNF.mjs / batch/presentations.mjs (Node).
 */

/** Minimal polynomial of w (monic, low → high), a root to embed by, labels, and Galois automorphisms. */
export const FIELDS = {
    i:   { poly: [1, 0, 1],      root: { re: 0, im: 1 },                  tex: '\\mathbb{Q}(i)',                      name: 'ℚ(i)',           gal: [[0, -1]] },
    m2:  { poly: [2, 0, 1],      root: { re: 0, im: Math.SQRT2 },         tex: '\\mathbb{Q}(\\sqrt{-2})',             name: 'ℚ(√−2)',         gal: [[0, -1]] },
    m3:  { poly: [1, -1, 1],     root: { re: 0.5, im: Math.sqrt(3) / 2 }, tex: '\\mathbb{Q}(\\sqrt{-3})',             name: 'ℚ(√−3)',         gal: [[1, -1]] },
    r2:  { poly: [-2, 0, 1],     root: { re: Math.SQRT2, im: 0 },         tex: '\\mathbb{Q}(\\sqrt{2})',              name: 'ℚ(√2)',          gal: [[0, -1]] },
    r3:  { poly: [-3, 0, 1],     root: { re: Math.sqrt(3), im: 0 },       tex: '\\mathbb{Q}(\\sqrt{3})',              name: 'ℚ(√3)',          gal: [[0, -1]] },
    r5:  { poly: [-1, -1, 1],    root: { re: (1 + Math.sqrt(5)) / 2, im: 0 }, tex: '\\mathbb{Q}(\\sqrt{5})',          name: 'ℚ(√5)',          gal: [[1, -1]] },
    c2:  { poly: [-2, 0, 0, 1],  root: { re: Math.cbrt(2), im: 0 },       tex: '\\mathbb{Q}(\\sqrt[3]{2})',           name: 'ℚ(∛2)',          gal: [] },
    c23: { poly: [-1, -1, 0, 1], root: { re: 1.324717957244746, im: 0 },  tex: '\\mathbb{Q}(\\theta),\\ \\theta^3=\\theta+1', name: 'ℚ(θ), θ³=θ+1', gal: [] },
    c7:  { poly: [-1, -2, 1, 1], root: { re: 2 * Math.cos(2 * Math.PI / 7), im: 0 }, tex: '\\mathbb{Q}(\\zeta_7)^+',  name: 'ℚ(ζ₇)⁺',         gal: [[-2, 0, 1], [1, -1, -1]] },
};

/** Format low → high polynomial coefficients as ringEngine text in `w` (e.g. "w^2+1", "w^3-w-1"). */
export function polyText(c) {
    return c.map((x, k) => ({ x: Number(x), k }))
        .filter((t) => t.x)
        .reverse()
        .map(({ x, k }, i) => `${x < 0 ? '-' : i ? '+' : ''}${Math.abs(x) === 1 && k ? '' : Math.abs(x)}${k ? (k === 1 ? 'w' : `w^${k}`) : ''}`)
        .join('');
}
