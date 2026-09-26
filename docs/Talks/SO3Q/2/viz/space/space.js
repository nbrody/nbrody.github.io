/**
 * space.js — rotations of space.
 *
 *   lattice   the cubic lattice ℤ³ and a die at the origin
 *   cube      the die and a moving copy of ℤ³ run through all 24 symmetries
 *             (a Hamiltonian cycle of quarter turns); ℤ³ lands on itself each time
 *   count     e₁ has 6 places to go, then e₂ has 4: |SO₃(ℤ)| = 24
 *   pure      ℍ = ℝ·1 ⊕ ℝ³: a quaternion v = t + w, real gauge on the left
 *   conj      v ↦ q v q⁻¹ for q = 1 + i + j: the real part stays, ℝ³ turns
 *   axis      the axis (b, c, d) and the angle 2·arccos(a/√N)
 *   integer   R_{1+i+j} = ⅓(…): the images of i, j, k
 *   explore   any integer quaternion (steppers + presets)
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, lerp, ease, clock } = VizKit;
    const { Camera, DrawList, V, UQ, mathLabel } = View3D;
    const Q = Quat;
    const TAU = 2 * Math.PI;

    const STEPS = [
        { id: 'lattice', caption: 'The cubic lattice \\(\\mathbb Z^3 \\subset \\mathbb R^3\\), with a die at the origin.' },
        { id: 'cube', caption: 'Which rotations of space send \\(\\mathbb Z^3\\) back to itself? Only the symmetries of the cube: the <b>24</b> ways to set down a die.' },
        { id: 'count', caption: '\\(e_1\\) has <b>6</b> places to go, then \\(e_2\\) has <b>4</b>, and \\(e_3 = e_1 \\times e_2\\) is forced: \\(\\;|\\mathrm{SO}_3(\\mathbb Z)| = 6 \\cdot 4 = 24\\).' },
        { id: 'pure', caption: 'A quaternion is a real part plus a <b>pure</b> part: \\(\\;\\mathbb H = \\mathbb R \\cdot 1 \\,\\oplus\\, \\mathbb R^3\\), where \\(\\mathbb R^3 = \\{\\, bi + cj + dk \\,\\}\\).' },
        { id: 'conj', caption: 'Conjugation \\(v \\mapsto q\\,v\\,q^{-1}\\) (here \\(q = 1 + i + j\\)) <b>fixes the real part</b>, so it turns the pure quaternions: a rotation of \\(\\mathbb R^3\\).' },
        { id: 'axis', caption: '\\(q = a + bi + cj + dk\\) turns \\(\\mathbb R^3\\) about the axis \\((b, c, d)\\) by the angle \\(2\\arccos\\frac{a}{\\sqrt{N(q)}}\\).' },
        { id: 'integer', caption: 'An integer quaternion gives a <b>rational</b> rotation: \\(q = 1 + i + j\\) has \\(N(q) = 3\\), and \\(R_q\\) has denominator 3.' },
        { id: 'explore', caption: 'Any integer quaternion \\(q\\) gives a rational rotation \\(R_q\\), with denominator the odd part of \\(N(q)\\).' },
    ];

    // ── the 24 symmetries of the cube, as a cycle of quarter turns ───
    const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const QT = [];
    for (let a = 0; a < 3; a++) for (const s of [1, -1]) QT.push({ axis: AXES[a], sign: s, q: UQ.fromAxisAngle(AXES[a], s * Math.PI / 2) });
    const intKey = (q) => UQ.matrix(q).flat().map(Math.round).join(',');
    const CYCLE = (function hamilton() {
        const start = [1, 0, 0, 0];
        const path = [{ q: start, move: null }];
        const seen = new Set([intKey(start)]);
        let closing = null;
        (function dfs() {
            if (path.length === 24) {
                const last = path[23].q;
                for (const g of QT) if (intKey(UQ.mul(g.q, last)) === intKey(start)) { closing = g; return true; }
                return false;
            }
            const cur = path[path.length - 1].q;
            for (const g of QT) {
                const nq = UQ.normalize(UQ.mul(g.q, cur)), k = intKey(nq);
                if (seen.has(k)) continue;
                seen.add(k); path.push({ q: nq, move: g });
                if (dfs()) return true;
                path.pop(); seen.delete(k);
            }
            return false;
        })();
        path.push({ q: start, move: closing });
        return path;               // 25 entries: I, …, I
    })();
    const LOOP_DWELL = 0.8, LOOP_TURN = 1.15, LOOP_P = LOOP_DWELL + LOOP_TURN;

    // ── geometry ─────────────────────────────────────────────────────
    const RS = 1.75;                 // sphere radius
    const U = 1.4;                   // "unit" length for e₁, e₂, e₃
    const HALF = 0.5;                // the die is [−½, ½]³
    const Q_DEMO = [1, 1, 1, 0];     // q = 1 + i + j
    const W_PURE = [0.5, -0.46, 0.64];   // pure part of the sample quaternion v
    const T_REAL = 0.6;              // its real part
    const LIGHT = V.norm([0.35, 0.25, 0.9]);
    const AX_COL = [[124, 138, 255], [244, 114, 182], [45, 212, 191]];     // i, j, k
    const FACE_COL = [[98, 110, 236], [226, 92, 160], [32, 184, 164]];
    const PIPS = {
        1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
        4: [[-1, -1], [-1, 1], [1, -1], [1, 1]], 5: [[-1, -1], [-1, 1], [0, 0], [1, -1], [1, 1]],
        6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
    };
    // faces: normal, two tangents, pip count (opposite faces sum to 7)
    const FACES = [
        { n: [1, 0, 0], t1: [0, 1, 0], t2: [0, 0, 1], pips: 1, ax: 0 },
        { n: [-1, 0, 0], t1: [0, -1, 0], t2: [0, 0, 1], pips: 6, ax: 0 },
        { n: [0, 1, 0], t1: [-1, 0, 0], t2: [0, 0, 1], pips: 2, ax: 1 },
        { n: [0, -1, 0], t1: [1, 0, 0], t2: [0, 0, 1], pips: 5, ax: 1 },
        { n: [0, 0, 1], t1: [1, 0, 0], t2: [0, 1, 0], pips: 3, ax: 2 },
        { n: [0, 0, -1], t1: [1, 0, 0], t2: [0, -1, 0], pips: 4, ax: 2 },
    ];
    const LATTICE = [];
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) LATTICE.push([x, y, z]);
    // globe lines (unit sphere), as polylines
    const GLOBE = [];
    for (const lat of [-60, -30, 0, 30, 60]) {
        const r = Math.cos(lat * Math.PI / 180), z = Math.sin(lat * Math.PI / 180), pts = [];
        for (let i = 0; i <= 72; i++) { const t = i / 72 * TAU; pts.push([r * Math.cos(t), r * Math.sin(t), z]); }
        GLOBE.push({ pts, eq: lat === 0 });
    }
    for (let lon = 0; lon < 180; lon += 30) {
        const t0 = lon * Math.PI / 180, pts = [];
        for (let i = 0; i <= 72; i++) { const t = i / 72 * TAU; pts.push([Math.cos(t) * Math.cos(t0), Math.cos(t) * Math.sin(t0), Math.sin(t)]); }
        GLOBE.push({ pts, eq: false });
    }

    // ── state ──────────────────────────────────────────────────────
    const cam = new Camera({ yaw: 0.62, pitch: 0.34, focal: 13 });
    const F = {
        lattice: new Fader(0, 0.4), moving: new Fader(0, 0.4), die: new Fader(0, 0.4), glow: new Fader(0, 0.14),
        frame: new Fader(0, 0.35), targets: new Fader(0, 0.35), sphere: new Fader(0, 0.45), axes: new Fader(0, 0.4),
        pure: new Fader(0, 0.4), axisLine: new Fader(0, 0.4), images: new Fader(0, 0.4), intro: new Fader(0, 0.8),
    };
    const zoom = new Tween(1);
    const camYaw = new Tween(0.62), camPitch = new Tween(0.34);
    let step = 'lattice', mode = 'still';
    let loopT = 0, paused = false;
    const orientT = new Tween(1);
    let orientFrom = [1, 0, 0, 0], orientTo = [1, 0, 0, 0];
    let explorer = [1, 1, 1, 0];
    let drag = null, userCam = false, dirty = 3;

    function loopState() {
        const total = LOOP_P * 24;
        const u = ((loopT % total) + total) % total;
        const i = Math.floor(u / LOOP_P), f = u - i * LOOP_P;
        const from = CYCLE[i], to = CYCLE[i + 1];
        if (f < LOOP_DWELL) return { q: from.q, dwell: true, index: i, to };
        const t = ease.inOut((f - LOOP_DWELL) / LOOP_TURN);
        const g = to.move;
        return { q: UQ.normalize(UQ.mul(UQ.fromAxisAngle(g.axis, g.sign * t * Math.PI / 2), from.q)), dwell: false, index: i, to };
    }
    function orientation() {
        if (mode === 'loop') return loopState().q;
        return UQ.slerp(orientFrom, orientTo, orientT.get());
    }
    function slerpTo(q, { dur = 1.4, delay = 0, instant = false } = {}) {
        orientFrom = orientation();
        orientTo = q;
        mode = 'slerp';
        orientT.set(0, { instant: true });
        orientT.set(1, { dur, delay, instant });
    }
    const unitQ = (q) => UQ.normalize(q.slice());

    // ── steps ──────────────────────────────────────────────────────
    function onStep(id, info) {
        const inst = info.instant;
        const cur = orientation();
        step = id;
        const on = (names) => Object.entries(F).forEach(([k, f]) => { if (k !== 'intro' && k !== 'glow') f.to(names.includes(k) ? 1 : 0); });
        document.body.classList.toggle('explore', id === 'explore');
        document.getElementById('gauge').classList.toggle('on', id === 'pure' || id === 'conj');
        document.getElementById('gauge').classList.toggle('fixed', id === 'conj');
        if (mode === 'loop' && id !== 'cube' && id !== 'count') { orientFrom = cur; orientTo = cur; orientT.set(1, { instant: true }); mode = 'still'; }

        switch (id) {
            case 'lattice':
                on(['lattice', 'die', 'axes']);
                zoom.set(1, { dur: 1.4, instant: inst });
                slerpTo([1, 0, 0, 0], { dur: 1.2, instant: inst });
                break;
            case 'cube': case 'count':
                on(id === 'cube' ? ['lattice', 'moving', 'die', 'axes'] : ['die', 'frame', 'targets', 'axes']);
                zoom.set(id === 'cube' ? 1 : 1.18, { dur: 1.4, instant: inst });
                if (mode !== 'loop') {
                    // glide home first, then start the cycle
                    slerpTo([1, 0, 0, 0], { dur: 0.9, instant: inst });
                    loopT = inst ? 0 : -1.0;
                    mode = 'loop';
                }
                break;
            case 'pure':
                on(['sphere', 'die', 'axes', 'pure']);
                zoom.set(1.12, { dur: 1.4, instant: inst });
                slerpTo([1, 0, 0, 0], { dur: 1.2, instant: inst });
                break;
            case 'conj':
                on(['sphere', 'die', 'axes', 'pure']);
                zoom.set(1.12, { dur: 1.4, instant: inst });
                slerpTo([1, 0, 0, 0], { dur: 0.01, instant: true });
                slerpTo(unitQ(Q_DEMO), { dur: 3.2, delay: 0.6, instant: inst });
                break;
            case 'axis':
                on(['sphere', 'die', 'axes', 'axisLine']);
                zoom.set(1.12, { dur: 1.4, instant: inst });
                slerpTo(unitQ(Q_DEMO), { dur: 1.2, instant: inst });
                break;
            case 'integer':
                on(['sphere', 'die', 'axes', 'images']);
                zoom.set(1.12, { dur: 1.4, instant: inst });
                slerpTo(unitQ(Q_DEMO), { dur: 1.2, instant: inst });
                break;
            case 'explore':
                on(['sphere', 'die', 'axes', 'images', 'axisLine']);
                zoom.set(1.12, { dur: 1.4, instant: inst });
                slerpTo(unitQ(explorer), { dur: 1.2, instant: inst });
                break;
        }
        const view = { lattice: [0.62, 0.34], cube: [0.62, 0.34], count: [0.62, 0.34], pure: [0.62, 0.3] }[id] || [-0.2, 0.32];
        camYaw.set(nearAngle(view[0], camYaw.get()), { dur: 1.8, instant: inst });
        camPitch.set(view[1], { dur: 1.8, instant: inst });
        if (inst) Object.entries(F).forEach(([k, f]) => { if (k !== 'intro') f.snap(f.target); });
        document.body.classList.toggle('orbitable', true);
        updateReadout();
        dirty = 3;
    }

    // ── readout + explorer ─────────────────────────────────────────
    const readout = document.getElementById('readout');
    const m = Q.minus;
    function matHTML(M, den) {
        const cells = M.flat().map((x) => `<span>${m(x)}</span>`).join('');
        return (den === 1 ? '' : `<span class="frac"><span>1</span><span>${den}</span></span>`) +
            `<span class="mat mat3">${cells}</span>`;
    }
    const fmtAxis = (q) => {
        const [, b, c, d] = q;
        return `(${m(b)}, ${m(c)}, ${m(d)})`;
    };
    let readoutKey = '';
    function updateReadout() {
        let html = '', on = false;
        const q = step === 'explore' ? explorer : Q_DEMO;
        if (step === 'axis' || step === 'integer' || step === 'explore') {
            on = true;
            const N = Q.norm(q);
            const { angle } = Q.axisAngle(q);
            const { M, den } = Q.rot(q);
            const zero = N === 0;
            html = `<div class="ro-q"><i>q</i> = ${Q.html(q)} &nbsp;<span class="ro-row">N(<i>q</i>) = ${N}</span></div>`;
            if (zero) html += '<div class="ro-row">q = 0 is not invertible</div>';
            else {
                if (step !== 'axis') html += `<div class="ro-mat"><i>R</i><sub><i>q</i></sub> = ${matHTML(M, den)}</div>`;
                html += `<div class="ro-row">axis ${fmtAxis(q)} &nbsp;·&nbsp; angle ${(angle * 180 / Math.PI).toFixed(2)}°</div>`;
                if (step !== 'axis') html += `<div class="ro-den">denominator <b>${den}</b>${N !== den ? ` &nbsp;<span class="ro-row">(odd part of ${N})</span>` : ''}</div>`;
            }
        }
        if (html !== readoutKey) { readout.innerHTML = html; readoutKey = html; }
        readout.classList.toggle('on', on);
    }

    const PRESETS = [[1, 1, 1, 0], [1, 1, 0, 0], [1, 1, 1, 1], [3, 1, 1, 1], [2, 1, 0, 0], [1, 2, 0, 0], [1, 2, 2, 2], [4, 1, 2, 3]];
    const stepperHost = document.getElementById('steppers'), presetHost = document.getElementById('presets');
    const stepVals = [];
    ['a', 'b', 'c', 'd'].forEach((name, i) => {
        const el = document.createElement('div');
        el.className = 'stepper';
        el.innerHTML = `<span class="st-name">${name}</span><div class="st-box"><button aria-label="decrease ${name}">−</button><span class="st-val"></span><button aria-label="increase ${name}">+</button></div>`;
        const [dec, inc] = el.querySelectorAll('button');
        dec.addEventListener('click', () => setExplorer(explorer.map((v, j) => (j === i ? Math.max(-9, v - 1) : v))));
        inc.addEventListener('click', () => setExplorer(explorer.map((v, j) => (j === i ? Math.min(9, v + 1) : v))));
        stepVals.push(el.querySelector('.st-val'));
        stepperHost.appendChild(el);
    });
    PRESETS.forEach((q) => {
        const b = document.createElement('button');
        b.innerHTML = Q.html(q);
        b.addEventListener('click', () => setExplorer(q.slice()));
        presetHost.appendChild(b);
    });
    function syncControls() {
        explorer.forEach((v, i) => { stepVals[i].textContent = m(v); });
        [...presetHost.children].forEach((b, i) => b.classList.toggle('on', Q.eq(PRESETS[i], explorer)));
    }
    function setExplorer(q) {
        explorer = q;
        syncControls();
        if (Q.norm(q) > 0) slerpTo(unitQ(q), { dur: 1.1 });
        updateReadout();
        dirty = 3;
    }
    syncControls();

    // ── canvas ─────────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    const GLOW = VizKit.glowSprite('45,212,191');
    const dl = new DrawList();
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    function segment(a, b, color, width, depthBias = 0) {
        const A = cam.proj(a), B = cam.proj(b);
        dl.add((A[2] + B[2]) / 2 + depthBias, () => {
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        });
    }
    function arrow(a, b, color, width, headPx = 13) {
        const A = cam.proj(a), B = cam.proj(b);
        dl.add((A[2] + B[2]) / 2 + 0.02, () => {
            const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
            const hl = Math.min(headPx, L * 0.45), hw = hl * 0.52;
            ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0] - ux * hl * 0.8, B[1] - uy * hl * 0.8); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(B[0], B[1]);
            ctx.lineTo(B[0] - ux * hl - uy * hw, B[1] - uy * hl + ux * hw);
            ctx.lineTo(B[0] - ux * hl + uy * hw, B[1] - uy * hl - ux * hw);
            ctx.closePath(); ctx.fill();
        });
    }
    function label(p, parts, color, size, depthBias = 0.05) {
        const P = cam.proj(p);
        dl.add(P[2] + depthBias, () => mathLabel(ctx, parts, P[0], P[1], color, size));
    }

    function drawDie(R, alpha) {
        const center = [0, 0, 0];
        dl.add(cam.depthOf(center), () => {
            for (const f of FACES) {
                const n = UQ.apply(R, f.n);
                if (!cam.facing(n)) continue;
                const c = V.scale(n, HALF), t1 = V.scale(UQ.apply(R, f.t1), HALF), t2 = V.scale(UQ.apply(R, f.t2), HALF);
                const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => cam.proj(V.add(c, V.add(V.scale(t1, u), V.scale(t2, v)))));
                const lit = 0.5 + 0.5 * Math.max(0, V.dot(n, LIGHT));
                const base = FACE_COL[f.ax].map((x) => Math.round(x * (f.n[f.ax] > 0 ? 1 : 0.72) * lit));
                ctx.fillStyle = rgba(base, 0.94 * alpha);
                ctx.strokeStyle = `rgba(255,255,255,${0.5 * alpha})`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                corners.forEach(([X, Y], i) => (i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // pips, drawn in the face's (affine) frame
                const C = cam.proj(c), T1 = cam.proj(V.add(c, t1)), T2 = cam.proj(V.add(c, t2));
                ctx.save();
                ctx.setTransform(cv.dpr * (T1[0] - C[0]), cv.dpr * (T1[1] - C[1]), cv.dpr * (T2[0] - C[0]), cv.dpr * (T2[1] - C[1]), cv.dpr * C[0], cv.dpr * C[1]);
                ctx.fillStyle = `rgba(248,250,252,${0.95 * alpha})`;
                for (const [u, v] of PIPS[f.pips]) { ctx.beginPath(); ctx.arc(u * 0.5, v * 0.5, 0.15, 0, TAU); ctx.fill(); }
                ctx.restore();
            }
        });
    }

    function draw() {
        cv.begin();
        const W = cv.W, H = cv.H;
        cam.setup(W / 2, H * 0.47, Math.min(W, H - 120) * 0.17 * zoom.get());
        const R = UQ.matrix(orientation());
        const intro = F.intro.v;
        const loop = mode === 'loop' ? loopState() : null;

        // fixed lattice + the moving copy (with glows where it lands)
        if (F.lattice.v > 0.01) {
            const a = F.lattice.v * intro;
            for (const p of LATTICE) {
                if (!p[0] && !p[1] && !p[2]) continue;
                const P = cam.proj(p);
                dl.add(P[2] - 0.01, () => {
                    ctx.fillStyle = `rgba(140,156,190,${0.85 * a})`;
                    ctx.beginPath(); ctx.arc(P[0], P[1], 2.6 * P[3], 0, TAU); ctx.fill();
                });
            }
        }
        if (F.moving.v > 0.01) {
            const a = F.moving.v * intro;
            const glow = F.glow.v * a;
            for (const p of LATTICE) {
                if (!p[0] && !p[1] && !p[2]) continue;
                const P = cam.proj(UQ.apply(R, p));
                dl.add(P[2], () => {
                    ctx.fillStyle = `rgba(245,158,11,${0.95 * a})`;
                    ctx.beginPath(); ctx.arc(P[0], P[1], 2.9 * P[3], 0, TAU); ctx.fill();
                    if (glow > 0.02) {
                        const g = 20 * P[3];
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.globalAlpha = glow * 0.7;
                        ctx.drawImage(GLOW, P[0] - g / 2, P[1] - g / 2, g, g);
                        ctx.globalAlpha = 1;
                        ctx.globalCompositeOperation = 'source-over';
                    }
                });
            }
        }

        // the globe of pure quaternions
        if (F.sphere.v > 0.01) {
            const a = F.sphere.v * intro;
            const C = cam.proj([0, 0, 0]);
            dl.add(-50, () => {
                const r = RS * cam.k * C[3];
                const g = ctx.createRadialGradient(C[0] - r * 0.35, C[1] - r * 0.4, r * 0.1, C[0], C[1], r);
                g.addColorStop(0, `rgba(60,72,140,${0.32 * a})`);
                g.addColorStop(1, `rgba(20,26,56,${0.1 * a})`);
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.arc(C[0], C[1], r, 0, TAU); ctx.fill();
                ctx.strokeStyle = `rgba(160,172,220,${0.35 * a})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();
            });
            for (const line of GLOBE) {
                for (let i = 0; i + 1 < line.pts.length; i++) {
                    const p = V.scale(UQ.apply(R, line.pts[i]), RS), q = V.scale(UQ.apply(R, line.pts[i + 1]), RS);
                    const d = cam.depthOf(V.scale(V.add(p, q), 0.5));
                    const front = d > 0;
                    segment(p, q, `rgba(170,182,230,${(front ? 0.42 : 0.1) * a * (line.eq ? 1.4 : 1)})`, line.eq ? 1.5 : 1.1);
                }
            }
        }

        // fixed axes i, j, k
        if (F.axes.v > 0.01) {
            const a = F.axes.v * intro * (F.images.v > 0.5 ? 0.55 : 1);
            const L = F.sphere.v > 0.5 ? RS + 0.55 : 2.6;
            AXES.forEach((e, t) => {
                segment(V.scale(e, HALF), V.scale(e, L), rgba(AX_COL[t], 0.55 * a), 1.6, -0.02);
                segment(V.scale(e, -L), V.scale(e, -HALF), rgba(AX_COL[t], 0.25 * a), 1.2, -0.02);
                label(V.scale(e, L + 0.22), [{ t: 'ijk'[t], style: 'it' }], rgba(AX_COL[t], 0.95 * a), 22);
            });
        }

        // e₁, e₂, e₃ and their possible destinations
        if (F.targets.v > 0.01) {
            const a = F.targets.v * intro;
            const e1 = UQ.apply(R, [1, 0, 0]);
            for (const e of AXES) for (const s of [1, -1]) {
                const p = V.scale(e, s * U), P = cam.proj(p);
                const perp = Math.abs(V.dot(V.scale(e, s), e1)) < 0.2;       // a legal target for e₂
                dl.add(P[2] + 0.01, () => {
                    ctx.strokeStyle = perp ? `rgba(244,114,182,${0.95 * a})` : `rgba(124,138,255,${0.8 * a})`;
                    ctx.lineWidth = 2.4;
                    ctx.beginPath(); ctx.arc(P[0], P[1], 9 * P[3], 0, TAU); ctx.stroke();
                });
            }
        }
        if (F.frame.v > 0.01) {
            const a = F.frame.v * intro;
            const names = ['1', '2', '3'];
            AXES.forEach((e, t) => {
                const d = UQ.apply(R, e);
                arrow(V.scale(d, HALF), V.scale(d, U), rgba(AX_COL[t], a), 4);
                label(V.scale(d, U + 0.3), [{ t: 'e', style: 'it' }, { t: names[t], style: 'sub' }], rgba(AX_COL[t], a), 22);
            });
        }

        // the sample quaternion v = t + w: its pure part turns with the sphere
        if (F.pure.v > 0.01) {
            const a = F.pure.v * intro;
            const w = V.scale(UQ.apply(R, W_PURE), RS);
            arrow([0, 0, 0], w, `rgba(251,191,36,${0.95 * a})`, 3.2);
            const P = cam.proj(w);
            dl.add(P[2] + 0.03, () => {
                ctx.fillStyle = `rgba(251,191,36,${a})`;
                ctx.beginPath(); ctx.arc(P[0], P[1], 5.5, 0, TAU); ctx.fill();
            });
            label(V.scale(w, 1.13), [{ t: 'w', style: 'it' }], `rgba(251,191,36,${a})`, 22);
        }

        // the axis and angle of R_q
        if (F.axisLine.v > 0.01 && Q.norm(currentQ()) > 0) {
            const a = F.axisLine.v * intro;
            const { axis, angle } = Q.axisAngle(currentQ());
            if (angle > 1e-6) {
                arrow(V.scale(axis, -RS - 0.35), V.scale(axis, RS + 0.55), `rgba(251,191,36,${0.9 * a})`, 2.6, 15);
                // an arc of the rotation angle, on the great circle ⊥ axis
                const ref = V.norm(Math.abs(axis[2]) < 0.9 ? V.cross(axis, [0, 0, 1]) : V.cross(axis, [1, 0, 0]));
                const ref2 = V.cross(axis, ref);
                const arcR = RS * 0.62, pts = [];
                const tProg = step === 'axis' ? clamp(orientT.get() * 1.05, 0, 1) : 1;
                for (let s = 0; s <= 48; s++) {
                    const th = angle * s / 48 * tProg;
                    pts.push(V.add(V.scale(ref, arcR * Math.cos(th)), V.scale(ref2, arcR * Math.sin(th))));
                }
                for (let s = 0; s + 1 < pts.length; s++) segment(pts[s], pts[s + 1], `rgba(251,191,36,${0.95 * a})`, 3);
                const mid = pts[Math.floor(pts.length / 2)];
                label(V.scale(mid, 1.28), [{ t: (angle * 180 / Math.PI).toFixed(2) + '°', style: 'rm' }], `rgba(251,191,36,${a})`, 19);
            }
        }

        // the images R_q i, R_q j, R_q k with their rational coordinates
        if (F.images.v > 0.01 && Q.norm(currentQ()) > 0) {
            const a = F.images.v * intro;
            const { M, den } = Q.rot(currentQ());
            AXES.forEach((e, t) => {
                const d = UQ.apply(R, e);
                arrow([0, 0, 0], V.scale(d, RS), rgba(AX_COL[t], a), 3.6);
                const col = [M[0][t], M[1][t], M[2][t]].map(m).join(', ');
                const txt = den === 1 ? `(${col})` : `(${col})/${den}`;
                label(V.scale(d, RS + 0.34), [{ t: 'R', style: 'it' }, { t: 'q', style: 'sub' }, { t: ' ' + 'ijk'[t], style: 'it' }, { t: ' = ' + txt, style: 'rm' }], rgba(AX_COL[t], a), 17, 0.2);
            });
        }

        if (F.die.v > 0.01) drawDie(R, F.die.v * intro);
        dl.run();
    }
    const currentQ = () => (step === 'explore' ? explorer : Q_DEMO);

    // ── pointer: orbit ─────────────────────────────────────────────
    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        stageEl.setPointerCapture(e.pointerId);
        document.body.classList.add('dragging');
    });
    stageEl.addEventListener('pointermove', (e) => {
        if (!drag) return;
        orbitCamera(e.clientX - drag.x, e.clientY - drag.y);
        drag.x = e.clientX; drag.y = e.clientY;
    });
    const endDrag = () => { drag = null; document.body.classList.remove('dragging'); };
    stageEl.addEventListener('pointerup', endDrag);
    stageEl.addEventListener('pointercancel', endDrag);
    function orbitCamera(dx, dy) {
        userCam = true;
        camYaw.set(camYaw.get() - dx * 0.006, { instant: true });
        camPitch.set(clamp(camPitch.get() + dy * 0.005, -1.35, 1.35), { instant: true });
        dirty = 3;
    }
    /** The representative of `target` (mod 2π) nearest to `cur`. */
    const nearAngle = (target, cur) => target + TAU * Math.round((cur - target) / TAU);
    function onCommand(cmd) {
        if (cmd === 'toggle' || cmd === 'play' || cmd === 'pause') paused = cmd === 'pause' ? true : cmd === 'play' ? false : !paused;
        else if (cmd === 'reset') { onStep(step, { instant: false }); userCam = false; if (step === 'explore') setExplorer([1, 1, 1, 0]); }
        dirty = 3;
    }

    // ── loop ───────────────────────────────────────────────────────
    function frame(dt) {
        if (cv.resize()) dirty = 3;
        F.intro.to(1);
        let moving = false;
        for (const f of Object.values(F)) { f.step(dt); moving = moving || f.moving; }
        zoom.get();
        cam.yaw = camYaw.get(); cam.pitch = camPitch.get();
        moving = moving || zoom.moving || orientT.moving || camYaw.moving || camPitch.moving;
        if (mode === 'loop') {
            if (!paused || loopT < 0) loopT += dt;
            const L = loopState();
            F.glow.to(L.dwell && loopT > 0 ? 1 : 0);
            moving = true;
        } else F.glow.to(0);
        if (step === 'lattice' && !userCam && !paused && !camYaw.moving) { camYaw.set(camYaw.get() + dt * 0.07, { instant: true }); moving = true; }
        if (moving) dirty = 2;
        if (dirty > 0) { draw(); dirty--; }
    }

    const loop = VizKit.startLoop(frame);
    VizKit.typeset(document.getElementById('gauge'));
    const steps = VizKit.setup(STEPS, {
        onStep,
        onCommand,
        onOrbit: (dx, dy) => orbitCamera(dx * 0.8, dy * 0.8),
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { dirty = 3; });

    window.viz = {
        steps, loop, advance: loop.advance,
        get state() { return { step, mode, orient: orientation().map((v) => +v.toFixed(4)), explorer, cycle: CYCLE.length }; },
        setExplorer,
    };
})();
