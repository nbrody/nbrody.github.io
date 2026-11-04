// node tests/metric.test.mjs — checks of the hyperbolic metric on a punctured disk.
//  * once-punctured disk: exact metric |T'|/(|T| log(1/|T|)), T the Möbius map
//    of the disk onto the unit disk sending the puncture to 0
//  * a symmetric configuration gives a symmetric metric
//  * grid convergence for the mural's three punctures (∇u is what moves curves)
import { HyperbolicMetric } from '../js/hyperbolic.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok  ', msg); };

for (const p of [{ x: 0, y: 0 }, { x: 140, y: -90 }]) {
    const R = 400, disk = { cx: 0, cy: 0, R };
    const t0 = Date.now();
    const H = new HyperbolicMetric([p], disk);
    const ms = Date.now() - t0;
    let worst = 0;
    for (const [x, y] of [[50, 20], [-200, 100], [300, -150], [0, 350], [-100, -250], [150, -60]]) {
        // T(z) = R (z − p)/(R² − p̄ z), on the unit disk
        const zr = x - p.x, zi = y - p.y;                       // z − p
        const dr = R * R - (p.x * x + p.y * y), di = -(p.x * y - p.y * x);   // R² − p̄ z
        const dd = dr * dr + di * di;
        const T = R * Math.hypot(zr, zi) / Math.sqrt(dd);
        const Tp = R * (R * R - p.x * p.x - p.y * p.y) / dd;
        const exact = Tp / (T * Math.log(1 / T));
        worst = Math.max(worst, Math.abs(Math.log(H.rho(x, y) / exact)));
    }
    ok(worst < 0.02, `disk minus (${p.x}, ${p.y}): |log ρ/ρ_exact| ≤ ${worst.toFixed(4)} (${ms} ms, grid ${H.M})`);
}
{
    const R = 500, disk = { cx: 0, cy: 0, R };
    const H = new HyperbolicMetric([{ x: -150, y: 0 }, { x: 150, y: 0 }], disk);
    const a = H.rho(-60, 80), b = H.rho(60, 80), c = H.rho(-60, -80);
    ok(Math.abs(a / b - 1) < 0.01 && Math.abs(a / c - 1) < 0.01, `twice-punctured disk is symmetric (${(a / b).toFixed(4)}, ${(a / c).toFixed(4)})`);
}
{
    const P = [{ x: -320, y: 8 }, { x: -16, y: 0 }, { x: 320, y: -10 }];
    const t0 = Date.now();
    const A = new HyperbolicMetric(P), ms = Date.now() - t0;
    const B = new HyperbolicMetric(P, A.disk, { res: 22, maxM: 640 });
    let dLog = 0;
    const dg = [];
    const { cx, cy, R } = A.disk;
    for (let x = cx - R; x <= cx + R; x += 30) for (let y = cy - R; y <= cy + R; y += 30) {
        if (Math.hypot(x - cx, y - cy) > 0.9 * R || P.some(p => Math.hypot(p.x - x, p.y - y) < 4)) continue;
        const a = A.u(x, y), b = B.u(x, y);
        dLog = Math.max(dLog, Math.abs(a.val - b.val));
        dg.push(Math.hypot(a.gx - b.gx, a.gy - b.gy) / Math.hypot(b.gx, b.gy));
    }
    dg.sort((p, q) => p - q);
    const med = dg[dg.length >> 1], p90 = dg[Math.floor(0.9 * dg.length)];
    ok(dLog < 0.06 && med < 0.01 && p90 < 0.04, `mural punctures, grid ${A.M} (${ms} ms) vs ${B.M}: |Δ log ρ| ≤ ${dLog.toFixed(3)}, ∇u differs by ${(100 * med).toFixed(2)}% (median), ${(100 * p90).toFixed(2)}% (90%)`);
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
