/**
 * sphere.js — abelian subgroups (fix an axis), and the maximality of O₂.
 *
 *   axis-z     rotations about k: last time's SO₂(ℚ), moving e₁ through the
 *              rational points of the equator (a bright point hops by 2 + k)
 *   axis-111   rotations about (1,1,1): the field ℚ(√−3); the hop is 2 + i + j + k,
 *              a rotation with denominator 7
 *   axes       six axes, six fields, six circles of rational points
 *   block      Nic's proof that O₂(ℝ) is maximal: the part P₀ ∋ e₁ of an
 *              invariant partition contains the green circle through x
 *   sweep      … and, spun about x, an open cap
 *   rational   over A = ℤ[1/65]: a countable circle and a scatter of rational
 *              points instead of an open set
 *
 * Rotations about an axis v (a primitive integer vector, n = |v|²) are the
 * R_q with q = a + b·v; N(q) = a² + n b², so they are the norm-one elements of
 * K = ℚ(√−n).  Every point drawn is exact: R_q applied to a rational point.
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, lerp, ease } = VizKit;
    const { Camera, DrawList, V, UQ, quatLabel, mathLabel } = View3D;
    const Q = Quat;
    const TAU = 2 * Math.PI;
    const RS = 2.25;                                   // sphere radius (world units)

    const STEPS = [
        { id: 'axis-z', caption: '<b>Algebra:</b> fix an axis. The rotations about \\(k\\) are last time’s \\(\\mathrm{SO}_2(\\mathbb Q) \\cong \\mathbb Z/4 \\times \\bigoplus_{p \\equiv 1\\,(4)} \\mathbb Z\\), carrying \\(e_1\\) through the rational points of the equator.' },
        { id: 'axis-111', caption: 'About \\((1,1,1)\\) the field is \\(\\mathbb Q(\\sqrt{-3})\\): torsion \\(\\mathbb Z/6\\) and a generator for each prime \\(p \\equiv 1 \\pmod 3\\), such as \\(2+i+j+k\\) of norm 7 &mdash; a denominator never seen about \\(k\\).' },
        { id: 'axes', caption: 'Each rational axis \\(v\\) gives \\(\\cong \\mu_K \\times \\bigoplus_{p \\text{ split in } K} \\mathbb Z\\) with \\(K = \\mathbb Q(\\sqrt{-|v|^2})\\). Commuting rotations share an axis, so every infinite abelian subgroup lives (virtually) in one of these.' },
        { id: 'block', caption: 'Over \\(\\mathbb R\\): take an \\(\\mathrm{SO}_3\\)-invariant partition of \\(S^2\\) and \\(x\\) in the part \\(P_0\\) of \\(e_1\\). Rotations fixing \\(e_1\\) preserve \\(P_0\\), so the whole <span class="k-teal">green circle</span> lies in \\(P_0\\).' },
        { id: 'sweep', caption: 'Rotations fixing \\(x\\) preserve \\(P_0\\) too: spinning the circle about \\(x\\) sweeps out an <b>open set</b>. So \\(P_0\\) has positive measure, the partition is finite, and in fact \\(P_0 = S^2\\): \\(\\mathrm O_2(\\mathbb R)\\) is maximal.' },
        { id: 'rational', caption: 'Over \\(A = \\mathbb Z[\\tfrac1{65}]\\) the circle is a countable orbit and the sweep a scatter of rational points: no open sets, no measure. But rational points <b>equidistribute</b> (Linnik, Duke) &mdash; a possible substitute.' },
    ];

    // ── exact orbits ───────────────────────────────────────────────
    /** R_q u (u an integer unit vector) as floats, with its exact denominator. */
    function applyExact(q, j) {                         // u = e_{j+1}
        const { M, den } = Q.rot(q);
        let g = den;
        for (let r = 0; r < 3; r++) g = Q.gcd(g, M[r][j]);
        return { p: [M[0][j] / den, M[1][j] / den, M[2][j] / den], den: den / g };
    }
    /** All rotations about the integer axis v with q = a + b·v primitive and N(q) ≤ maxN. */
    function rotationsAbout(v, maxN, accept = () => true) {
        const n = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], out = [];
        const B = Math.floor(Math.sqrt(maxN / n)), Amax = Math.floor(Math.sqrt(maxN));
        for (let b = 0; b <= B; b++) for (let a = -Amax; a <= Amax; a++) {
            if (b === 0 && a !== 1) continue;
            if (Q.gcd(a, b) !== 1) continue;
            const N = a * a + n * b * b;
            if (N > maxN) continue;
            const q = [a, b * v[0], b * v[1], b * v[2]];
            if (!accept(q)) continue;
            out.push(q);
            if (b > 0 && a !== 0) out.push([a, -b * v[0], -b * v[1], -b * v[2]]);
        }
        return out;
    }
    function orbit(v, j, maxN) {
        const seen = new Map();
        for (const q of rotationsAbout(v, maxN)) {
            const pt = applyExact(q, j);
            const key = pt.p.map((x) => x.toFixed(9)).join(',');
            if (!seen.has(key) || seen.get(key).den > pt.den) seen.set(key, pt);
        }
        return [...seen.values()];
    }
    // the six axes of the hedgehog
    const AXES = [
        { v: [0, 0, 1], j: 0, col: [251, 191, 36] },
        { v: [1, 1, 1], j: 0, col: [45, 212, 191] },
        { v: [1, 1, 0], j: 2, col: [124, 138, 255] },
        { v: [1, 2, 0], j: 2, col: [244, 114, 182] },
        { v: [1, 1, 2], j: 0, col: [163, 230, 53] },
        { v: [1, 2, 3], j: 0, col: [251, 146, 60] },
    ];
    const SPLIT_LIST = (sf) => { const out = []; for (let p = 3; out.length < 6 && p < 200; p += 2) if (Q.isPrime(p) && Q.splits(sf, p)) out.push(p); return out; };
    for (const ax of AXES) {
        ax.dir = V.norm(ax.v);
        ax.field = Q.axisField([0, ...ax.v]);
        ax.pts = orbit(ax.v, ax.j, ax.v[2] === 1 && ax.v[0] === 0 ? 1200 : 700);
        ax.split = SPLIT_LIST(ax.field.sf);
        // the circle through e_{j+1} about v: centre (u·v̂)v̂, radius √(1 − (u·v̂)²)
        const u = [0, 0, 0]; u[ax.j] = 1;
        const c = V.dot(u, ax.dir), cen = V.scale(ax.dir, c), rad = Math.sqrt(Math.max(0, 1 - c * c));
        const e1 = V.norm(V.sub(u, cen)), e2 = V.cross(ax.dir, e1);
        ax.circle = [];
        for (let i = 0; i <= 96; i++) { const t = i / 96 * TAU; ax.circle.push(V.scale(V.add(cen, V.add(V.scale(e1, rad * Math.cos(t)), V.scale(e2, rad * Math.sin(t)))), RS)); }
        // a hop generator: the smallest-norm infinite-order rotation a + v (a ≥ 1)
        for (let a = 1; a < 40; a++) {
            const q = [a, ...ax.v];
            const cos = a / Math.sqrt(Q.norm(q));
            const ang = 2 * Math.acos(cos);
            const order = [TAU / 2, TAU / 3, TAU / 4, TAU / 6].some((t) => Math.abs(ang - t) < 1e-9 || Math.abs(ang - 2 * t) < 1e-9);
            if (!order) { ax.gen = q; ax.genDen = Q.rot(q).den; break; }
        }
        ax.genR = Q.rotFloat(ax.gen);
    }
    AXES[0].gen = [2, 0, 0, 1]; AXES[0].genDen = 5; AXES[0].genR = Q.rotFloat([2, 0, 0, 1]);

    // the partition picture
    const E1 = [1, 0, 0];
    const XQ = [3, 0, 4];                                 // x = (3/5, 0, 4/5), 53.13° from e₁
    const X = V.norm(XQ);
    const THETA = Math.acos(V.dot(E1, X));
    const onlyS = (q) => Q.factor(Q.rot(q).den).every(([p]) => p === 5 || p === 13);
    const ROT_E1 = rotationsAbout([1, 0, 0], 4225, onlyS);
    const ROT_X = rotationsAbout(XQ, 4225 * 25, onlyS);
    const toFloat = (M, den) => M.map((r) => r.map((x) => x / den));
    const GREEN_PTS = (() => {                          // rational points of the green circle
        const seen = new Map();
        for (const q of ROT_E1) {
            const R = Q.rotFloat(q), p = Q.apply(R, X), key = p.map((x) => x.toFixed(9)).join(',');
            if (!seen.has(key)) seen.set(key, { p, den: Q.rot(q).den });
        }
        return [...seen.values()];
    })();
    const SWEEP_PTS = (() => {
        const seen = new Map();
        const RX = ROT_X.map((q) => ({ R: Q.rotFloat(q), den: Q.rot(q).den })).filter((r) => r.den <= 325);
        for (const g of GREEN_PTS) {
            if (g.den > 325) continue;
            for (const r of RX) {
                const p = Q.apply(r.R, g.p), key = p.map((x) => x.toFixed(7)).join(',');
                if (!seen.has(key)) seen.set(key, { p });
            }
        }
        return [...seen.values()];
    })();
    const BACK_PTS = (() => {                           // S²(ℤ[1/65]) with denominator dividing 65
        const out = [];
        for (const d of [1, 5, 13, 65]) {
            for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) {
                const c2 = d * d - a * a - b * b;
                if (c2 < 0) continue;
                const c = Math.round(Math.sqrt(c2));
                if (c * c !== c2) continue;
                for (const cc of c ? [c, -c] : [0]) if (Q.gcd(Q.gcd(Q.gcd(a, b), cc), d) === 1) out.push({ p: [a / d, b / d, cc / d], den: d });
            }
        }
        return out;
    })();
    // the real sweep: copies of the green circle rotated about x
    const GREEN_CIRCLE = [];
    {
        const c = Math.cos(THETA), cen = V.scale(E1, c), rad = Math.sin(THETA);
        const e1 = V.norm(V.sub(X, cen)), e2 = V.cross(E1, e1);
        for (let i = 0; i <= 120; i++) { const t = i / 120 * TAU; GREEN_CIRCLE.push(V.add(cen, V.add(V.scale(e1, rad * Math.cos(t)), V.scale(e2, rad * Math.sin(t))))); }
    }

    // globe
    const GLOBE = [];
    for (const lat of [-60, -30, 0, 30, 60]) {
        const r = Math.cos(lat * Math.PI / 180), z = Math.sin(lat * Math.PI / 180), pts = [];
        for (let i = 0; i <= 72; i++) { const t = i / 72 * TAU; pts.push([r * Math.cos(t) * RS, r * Math.sin(t) * RS, z * RS]); }
        GLOBE.push(pts);
    }
    for (let lon = 0; lon < 180; lon += 30) {
        const t0 = lon * Math.PI / 180, pts = [];
        for (let i = 0; i <= 72; i++) { const t = i / 72 * TAU; pts.push([Math.cos(t) * Math.cos(t0) * RS, Math.cos(t) * Math.sin(t0) * RS, Math.sin(t) * RS]); }
        GLOBE.push(pts);
    }

    // ── state ──────────────────────────────────────────────────────
    const cam = new Camera({ yaw: 0.55, pitch: 0.32, focal: 14 });
    const camYaw = new Tween(0.55), camPitch = new Tween(0.32);
    const F = {
        intro: new Fader(0, 0.8), globe: new Fader(1, 0.5),
        ax: AXES.map((_, i) => new Fader(i === 0 ? 1 : 0, 0.5)), axLabels: new Fader(0, 0.5),
        block: new Fader(0, 0.5), sweep: new Fader(0, 0.5), rational: new Fader(0, 0.5), real: new Fader(0, 0.5),
    };
    const circleDraw = new Tween(0), sweepT = new Tween(0), ratT = new Tween(0);
    let step = 'axis-z', spin = true, paused = false, drag = null, dirty = 3;
    // the hop: a bright point walking along an orbit by one generator
    const hop = { axis: 0, cur: [1, 0, 0], prev: [1, 0, 0], t: 1, timer: 0.8, trail: [] };

    const nearAngle = (target, c) => target + TAU * Math.round((c - target) / TAU);
    function onStep(id, info) {
        const inst = info.instant;
        step = id;
        const set = (tw, v, o = {}) => tw.set(v, Object.assign({ instant: inst }, o));
        const showAx = id === 'axis-z' ? [0] : id === 'axis-111' ? [1] : id === 'axes' ? [0, 1, 2, 3, 4, 5] : [];
        F.ax.forEach((f, i) => f.to(showAx.includes(i) ? 1 : 0));
        F.axLabels.to(id === 'axes' ? 1 : 0);
        F.globe.to(1);
        F.block.to(['block', 'sweep', 'rational'].includes(id) ? 1 : 0);
        F.real.to(id === 'block' || id === 'sweep' ? 1 : 0);
        F.sweep.to(id === 'sweep' ? 1 : 0);
        F.rational.to(id === 'rational' ? 1 : 0);
        if (id === 'axis-z' || id === 'axis-111') {
            const i = id === 'axis-z' ? 0 : 1;
            hop.axis = i; hop.cur = hop.prev = AXES[i].j === 0 ? [1, 0, 0] : [0, 0, 1]; hop.t = 1; hop.timer = 0.9; hop.trail = [hop.cur];
        }
        set(circleDraw, 0, { instant: true });
        if (id === 'block') set(circleDraw, 1, { dur: 2.4, delay: 0.5 });
        else if (id === 'sweep' || id === 'rational') set(circleDraw, 1, { instant: true });
        set(sweepT, 0, { instant: true });
        if (id === 'sweep') set(sweepT, 1, { dur: 4.5, delay: 0.4, fn: ease.inOutSine });
        set(ratT, 0, { instant: true });
        if (id === 'rational') set(ratT, 1, { dur: 3.5, delay: 0.3, fn: ease.linear });
        const view = {
            'axis-z': [0.55, 0.42], 'axis-111': [0.78, 0.2], axes: [0.62, 0.3],
            block: [0.62, 0.3], sweep: [0.62, 0.3], rational: [0.62, 0.3],
        }[id];
        set(camYaw, nearAngle(view[0], camYaw.get()), { dur: 2.0 });
        set(camPitch, view[1], { dur: 2.0 });
        spin = id === 'axes';
        if (inst) {
            for (const [k, f] of Object.entries(F)) { if (k === 'intro') continue; (Array.isArray(f) ? f : [f]).forEach((x) => x.snap(x.target)); }
            if (id === 'block') circleDraw.set(1, { instant: true });
            if (id === 'sweep') sweepT.set(1, { instant: true });
            if (id === 'rational') ratT.set(1, { instant: true });
        }
        updateReadout();
        dirty = 3;
    }

    // ── readout ────────────────────────────────────────────────────
    const readout = document.getElementById('readout');
    const fieldTeX = (sf) => (sf === 1 ? 'ℚ(<i>i</i>)' : `ℚ(√−${sf})`);
    const vecStr = (v) => `(${v.join(', ')})`;
    function updateReadout() {
        let html = '';
        if (step === 'axis-z' || step === 'axis-111') {
            const ax = AXES[step === 'axis-z' ? 0 : 1];
            html = `<div class="r-title">rotations about ${vecStr(ax.v)}</div>` +
                `<table><tr><td>field</td><td class="f">K = ${fieldTeX(ax.field.sf)}</td></tr>` +
                `<tr><td>torsion</td><td class="f">ℤ/${ax.field.torsion}</td></tr>` +
                `<tr><td>split primes</td><td class="f">${ax.split.join(', ')}, …</td></tr>` +
                `<tr><td>the hop</td><td class="f">${Q.html(ax.gen)} &nbsp;<span style="color: var(--ink-dim); font-family: Inter, sans-serif; font-size: 0.8rem">denominator ${ax.genDen}</span></td></tr></table>`;
        } else if (step === 'axes') {
            html = '<div class="r-title">six axes, six fields</div><table>' + AXES.map((ax) =>
                `<tr><td><span class="sw" style="background: rgb(${ax.col})"></span></td><td class="f">${vecStr(ax.v)}</td><td class="f">${fieldTeX(ax.field.sf)}</td><td>${ax.split.slice(0, 4).join(', ')}, …</td></tr>`).join('') + '</table>';
        } else if (step === 'rational') {
            html = `<div class="r-title">over ℤ[1/65]</div><div class="r-dim">${GREEN_PTS.length} points of the green circle (denominators 5<sup>a</sup>13<sup>b</sup> ≤ 65²)<br>${SWEEP_PTS.length} of their images under rotations about <i>x</i><br>${BACK_PTS.length} points of S²(ℤ[1/65]) with denominator dividing 65</div>`;
        }
        readout.innerHTML = html;
        readout.classList.toggle('on', !!html);
    }

    // ── drawing ────────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    const dl = new DrawList();
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const GREEN = [52, 211, 153], RED = [248, 113, 113];

    function polyline(pts, col, alpha, width, scale = 1, depthBias = 0) {
        for (let i = 0; i + 1 < pts.length; i++) {
            const A = cam.proj(V.scale(pts[i], scale)), B = cam.proj(V.scale(pts[i + 1], scale));
            const front = A[2] + B[2] > 0;
            dl.add((A[2] + B[2]) / 2 + depthBias, () => {
                ctx.strokeStyle = rgba(col, alpha * (front ? 1 : 0.28));
                ctx.lineWidth = width * (front ? 1 : 0.7);
                ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
            });
        }
    }
    function dot(p, col, alpha, r) {
        const S = cam.proj(V.scale(p, RS));
        dl.add(S[2], () => {
            ctx.fillStyle = rgba(col, alpha * (S[2] > 0 ? 1 : 0.3));
            ctx.beginPath(); ctx.arc(S[0], S[1], r * S[3] * (S[2] > 0 ? 1 : 0.8), 0, TAU); ctx.fill();
        });
    }
    function arrowAxis(dir, col, alpha, label) {
        const a = V.scale(dir, -RS * 1.28), b = V.scale(dir, RS * 1.38);
        const A = cam.proj(a), B = cam.proj(b), M = cam.proj([0, 0, 0]);
        dl.add(Math.min(A[2], 0) - 0.5, () => {        // the back half, under the sphere
            ctx.strokeStyle = rgba(col, alpha * 0.35); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(M[0], M[1]); ctx.stroke();
        });
        dl.add(Math.max(B[2], 0) + 0.5, () => {
            ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = 2.6;
            ctx.beginPath(); ctx.moveTo(M[0], M[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
            const dx = B[0] - M[0], dy = B[1] - M[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
            ctx.fillStyle = rgba(col, alpha);
            ctx.beginPath(); ctx.moveTo(B[0] + ux * 12, B[1] + uy * 12); ctx.lineTo(B[0] - uy * 6, B[1] + ux * 6); ctx.lineTo(B[0] + uy * 6, B[1] - ux * 6); ctx.fill();
            if (label) { ctx.globalAlpha = alpha; label(B[0] + ux * 30, B[1] + uy * 30); ctx.globalAlpha = 1; }
        });
    }

    function draw() {
        cv.begin();
        const W = cv.W, H = cv.H;
        cam.setup(W / 2, H * 0.47, Math.min(W, H - 150) * 0.165);
        const intro = F.intro.v;
        // the body of the sphere
        const C = cam.proj([0, 0, 0]), rr = RS * cam.k;
        const grad = ctx.createRadialGradient(C[0] - rr * 0.3, C[1] - rr * 0.35, rr * 0.1, C[0], C[1], rr);
        grad.addColorStop(0, `rgba(60,72,140,${0.32 * intro})`);
        grad.addColorStop(1, `rgba(20,26,60,${0.2 * intro})`);
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(C[0], C[1], rr, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(150,165,215,${0.35 * intro})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(C[0], C[1], rr, 0, TAU); ctx.stroke();
        for (const line of GLOBE) polyline(line, [150, 165, 215], 0.14 * F.globe.v * intro, 1, 1, -0.2);

        // axes and their orbits
        AXES.forEach((ax, i) => {
            const a = F.ax[i].v * intro;
            if (a < 0.01) return;
            polyline(ax.circle, ax.col, 0.34 * a, 1.3);
            for (const pt of ax.pts) dot(pt.p, ax.col.map((c) => Math.min(255, c + 30)), 0.9 * a, 1.1 + 5 / Math.sqrt(pt.den));
            const lab = F.axLabels.v > 0.02
                ? (x, y) => mathLabel(ctx, ax.field.sf === 1 ? [{ t: 'ℚ(', style: 'rm' }, { t: 'i', style: 'it' }, { t: ')', style: 'rm' }] : [{ t: `ℚ(√−${ax.field.sf})`, style: 'rm' }], x, y, rgba(ax.col, F.axLabels.v), 18)
                : (i === 0 ? (x, y) => mathLabel(ctx, [{ t: 'k', style: 'it' }], x, y, rgba(ax.col, 1), 22) : (x, y) => mathLabel(ctx, [{ t: '(1,1,1)', style: 'rm' }], x, y, rgba(ax.col, 1), 20));
            arrowAxis(ax.dir, ax.col, a, lab);
        });
        // the hop
        if ((step === 'axis-z' || step === 'axis-111') && F.ax[hop.axis].v > 0.3) {
            const ax = AXES[hop.axis];
            const a = F.ax[hop.axis].v * intro;
            const t = ease.inOut(clamp(hop.t, 0, 1));
            // slerp-free: rotate prev about the axis by t·angle
            const ang = 2 * Math.acos(ax.gen[0] / Math.sqrt(Q.norm(ax.gen)));
            const pos = Q.apply(Q.axisRot(ax.dir, ang * t), hop.prev);
            const trail = hop.trail.slice(-7);
            trail.forEach((p, k) => dot(p, [255, 255, 255], a * (0.25 + 0.5 * k / trail.length), 3.2));
            dot(pos, [255, 255, 255], a, 6.5);
        }

        // the partition proof
        const blk = F.block.v * intro;
        if (blk > 0.01) {
            dot(E1, RED, blk, 7.5);
            dot(X, GREEN, blk, 7.5);
            const eS = cam.proj(V.scale(E1, RS * 1.13)), xS = cam.proj(V.scale(X, RS * 1.13));
            dl.add(9, () => {
                ctx.globalAlpha = blk;
                mathLabel(ctx, [{ t: 'e', style: 'it' }, { t: '1', style: 'sub' }], eS[0] + 6, eS[1] + 4, rgba(RED, 1), 22);
                mathLabel(ctx, [{ t: 'x', style: 'it' }], xS[0] + 4, xS[1] - 6, rgba(GREEN, 1), 22);
                ctx.globalAlpha = 1;
            });
            const real = F.real.v * blk;
            if (real > 0.01) {
                const n = Math.max(2, Math.round(circleDraw.get() * (GREEN_CIRCLE.length - 1)) + 1);
                polyline(GREEN_CIRCLE.slice(0, n), GREEN, 0.95 * real, 3, RS, 0.1);
                const sw = sweepT.get() * F.sweep.v;
                if (sw > 0.001) {
                    const copies = 36;
                    for (let c = 1; c <= copies; c++) {
                        const ang = c / copies * TAU;
                        if (ang > sw * TAU + 1e-9) break;
                        const R = Q.axisRot(X, ang);
                        polyline(GREEN_CIRCLE.filter((_, k) => k % 2 === 0).map((p) => Q.apply(R, p)), GREEN, 0.18 * real, 1.4, RS);
                    }
                    const R = Q.axisRot(X, sw * TAU);
                    polyline(GREEN_CIRCLE.map((p) => Q.apply(R, p)), GREEN, 0.9 * real, 2.4, RS, 0.1);
                }
            }
            const rat = F.rational.v * blk;
            if (rat > 0.01) {
                for (const b of BACK_PTS) dot(b.p, [150, 165, 215], 0.45 * rat, 1.1 + 3 / Math.sqrt(b.den));
                for (const g of GREEN_PTS) dot(g.p, GREEN, 0.95 * rat, 1.2 + 6 / Math.sqrt(g.den));
                const k = Math.floor(ratT.get() * SWEEP_PTS.length);
                for (let i = 0; i < k; i++) dot(SWEEP_PTS[i].p, [167, 243, 208], 0.55 * rat, 1.3);
            }
        }
        dl.run();
    }

    // ── interaction ────────────────────────────────────────────────
    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointermove', (e) => {
        if (drag) { orbitCamera(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
    });
    stageEl.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        stageEl.setPointerCapture(e.pointerId);
        document.body.classList.add('dragging');
    });
    const endDrag = () => { drag = null; document.body.classList.remove('dragging'); };
    stageEl.addEventListener('pointerup', endDrag);
    stageEl.addEventListener('pointercancel', endDrag);
    document.body.classList.add('orbitable');
    function orbitCamera(dx, dy) {
        camYaw.set(camYaw.get() - dx * 0.006, { instant: true });
        camPitch.set(clamp(camPitch.get() + dy * 0.005, -1.4, 1.4), { instant: true });
        dirty = 3;
    }
    function onCommand(cmd) {
        if (cmd === 'toggle' || cmd === 'play' || cmd === 'pause') paused = cmd === 'pause' ? true : cmd === 'play' ? false : !paused;
        else if (cmd === 'reset') onStep(step, { instant: false });
        dirty = 3;
    }

    function frame(dt) {
        if (cv.resize()) dirty = 3;
        F.intro.to(1);
        let moving = false;
        for (const f of Object.values(F)) for (const x of Array.isArray(f) ? f : [f]) { x.step(dt); moving = moving || x.moving; }
        for (const t of [camYaw, camPitch, circleDraw, sweepT, ratT]) { t.get(); moving = moving || t.moving; }
        if ((step === 'axis-z' || step === 'axis-111') && !paused) {
            if (hop.t < 1) hop.t = Math.min(1, hop.t + dt / 1.1);
            else if ((hop.timer -= dt) <= 0) {
                const ax = AXES[hop.axis];
                hop.prev = hop.cur;
                hop.cur = Q.apply(ax.genR, hop.cur);
                hop.trail.push(hop.prev);
                if (hop.trail.length > 40) hop.trail.shift();
                hop.t = 0; hop.timer = 0.55;
            }
            moving = true;
        }
        if (spin && !paused && !drag && !camYaw.moving) { camYaw.set(camYaw.get() + dt * 0.08, { instant: true }); moving = true; }
        cam.yaw = camYaw.v; cam.pitch = camPitch.v;
        if (moving) dirty = 2;
        if (dirty > 0) { draw(); dirty--; }
    }

    const loop = VizKit.startLoop(frame);
    const steps = VizKit.setup(STEPS, {
        onStep, onCommand,
        onOrbit: (dx, dy) => orbitCamera(dx * 0.8, dy * 0.8),
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { dirty = 3; });

    function checks() {
        // every orbit point is on its circle and on the sphere; the sweep points are rational points of S²(ℤ[1/65])
        const onCircle = AXES.every((ax) => ax.pts.every((pt) => {
            const u = [0, 0, 0]; u[ax.j] = 1;
            return Math.abs(V.dot(pt.p, ax.dir) - V.dot(u, ax.dir)) < 1e-9 && Math.abs(V.len(pt.p) - 1) < 1e-9;
        }));
        return {
            orbitSizes: AXES.map((ax) => ax.pts.length), gens: AXES.map((ax) => Q.str(ax.gen) + ' /' + ax.genDen),
            fields: AXES.map((ax) => ax.field.sf), onCircle,
            green: GREEN_PTS.length, sweep: SWEEP_PTS.length, back: BACK_PTS.length, rotE1: ROT_E1.length, rotX: ROT_X.length,
        };
    }
    window.viz = { steps, loop, advance: loop.advance, checks, get state() { return { step, yaw: cam.yaw }; } };
})();
