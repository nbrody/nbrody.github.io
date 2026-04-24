/* ------------------------------------------------------------------ *
 *  Penrose tiling via de Bruijn's pentagrid
 *
 *  Five families of parallel lines in ℝ²:
 *     L_{j,k} :  x · e_j  +  γ_j  =  k,       j = 0..4,   k ∈ ℤ
 *  where e_j = (cos 2πj/5, sin 2πj/5).
 *  Each intersection of L_{j,k} and L_{j',k'} yields one rhombus.
 *  The 5-vector K = (K_0,…,K_4), K_i = ⌈ x · e_i + γ_i ⌉, is the
 *  integer point in ℤ⁵; its projection Σ K_i e_i gives a rhombus vertex.
 * ------------------------------------------------------------------ */

import { N, E, state, view } from './state.js';

export function generateRhombi() {
    const γ = state.gamma;
    const R = Math.hypot(view.W, view.H) / (2 * state.scale) + 1.5;
    const P = [state.cx, state.cy];
    const rhombi = [];

    for (let j = 0; j < N; j++) {
        const ej = E[j];
        for (let jp = j + 1; jp < N; jp++) {
            const ejp = E[jp];
            const det = ej[0] * ejp[1] - ej[1] * ejp[0];
            const idet = 1 / det;

            const cj = P[0] * ej[0] + P[1] * ej[1] + γ[j];
            const cjp = P[0] * ejp[0] + P[1] * ejp[1] + γ[jp];
            const kMin = Math.floor(cj - R);
            const kMax = Math.ceil(cj + R);
            const kpMin = Math.floor(cjp - R);
            const kpMax = Math.ceil(cjp + R);

            const d = (jp - j) % N;
            const type = (d === 1 || d === 4) ? 0 : 1;   // 0 = fat, 1 = thin

            for (let k = kMin; k <= kMax; k++) {
                const u = k - γ[j];
                for (let kp = kpMin; kp <= kpMax; kp++) {
                    const v = kp - γ[jp];

                    const x0 = (ejp[1] * u - ej[1] * v) * idet;
                    const y0 = (-ejp[0] * u + ej[0] * v) * idet;

                    const dx = x0 - P[0], dy = y0 - P[1];
                    if (dx * dx + dy * dy > (R + 1.2) * (R + 1.2)) continue;

                    const Kj0 = k, Kjp0 = kp;
                    let vx = Kj0 * ej[0] + Kjp0 * ejp[0];
                    let vy = Kj0 * ej[1] + Kjp0 * ejp[1];
                    let Ksum = Kj0 + Kjp0;

                    // nudge slightly into the SW face to avoid triple-intersection ties
                    const eps = 1e-7;
                    const px = x0 - eps * (ej[0] + ejp[0]);
                    const py = y0 - eps * (ej[1] + ejp[1]);

                    for (let i = 0; i < N; i++) {
                        if (i === j || i === jp) continue;
                        const Ki = Math.ceil(px * E[i][0] + py * E[i][1] + γ[i]);
                        vx += Ki * E[i][0];
                        vy += Ki * E[i][1];
                        Ksum += Ki;
                    }

                    rhombi.push({
                        x1: vx, y1: vy,
                        x2: vx + ej[0], y2: vy + ej[1],
                        x3: vx + ej[0] + ejp[0], y3: vy + ej[1] + ejp[1],
                        x4: vx + ejp[0], y4: vy + ejp[1],
                        type, j, jp,
                        h: Ksum
                    });
                }
            }
        }
    }
    return rhombi;
}
