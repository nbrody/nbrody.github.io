/**
 * grid.js — which rotations send the square grid ℤ² back to itself, or at
 * least a fraction of it?
 *
 * Steps (the deck sends {type:'goTo', step}; standalone, use the arrows):
 *   grid      the grid ℤ²
 *   quarter   a rotated copy: it lands back on the grid only at quarter turns
 *   unit      e₁ has four places to go, and then everything is decided: SO₂(ℤ) ≅ ℤ/4
 *   question  a generic rotation: only the origin lands on the grid
 *   subgrid   the sub-grids A = β̄ℤ[i] (indigo) and B = βℤ[i] (rose), β = 2 + i
 *   r5        R = rotation by arccos(3/5) carries A exactly onto B: 1/5 of the grid
 *   r5sq      R²: β = (2 + i)², index 25
 *   r5cube    R³: β = (2 + i)³, index 125
 *   explore   every rational rotation on a spectrum (height 1/c); pick one
 *
 * The moving copy is drawn in amber.  Glows mark grid points that land on
 * grid points; they are computed exactly (never by a distance tolerance):
 * the rotation u·β/β̄ carries exactly the sub-grid β̄ℤ[i] onto βℤ[i].
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, ease, clock } = VizKit;
    const G = Gauss;
    const TAU = 2 * Math.PI, QUARTER = Math.PI / 2, DEG = Math.PI / 180;

    const STEPS = [
        { id: 'grid', caption: 'The standard square grid \\(\\mathbb{Z}^2 \\subset \\mathbb{R}^2\\).' },
        { id: 'quarter', caption: 'Rotate the plane. When does the <span class="k-amber">rotated grid</span> land back on the grid?' },
        { id: 'unit', caption: 'A unit vector can only land on one of the <b>four</b> grid points at distance 1 &mdash; and once \\(e_1\\) and \\(e_2\\) have landed, the whole rotation is decided.' },
        { id: 'question', caption: 'A typical rotation (here by 24°): only the origin lands back on the grid.' },
        { id: 'subgrid', caption: 'Sending a fifth of the grid to the grid means sending one <b>sub-grid</b> onto another. The <span class="k-indigo">indigo</span> and <span class="k-rose">pink</span> sub-grids each contain exactly \\(\\tfrac15\\) of the points.' },
        { id: 'r5', caption: 'The rotation by \\(\\arccos\\tfrac35 \\approx 53.13^\\circ\\) carries the <span class="k-indigo">indigo</span> sub-grid exactly onto the <span class="k-rose">pink</span> one: \\(\\tfrac15\\) of the grid lands on the grid.' },
        { id: 'r5sq', caption: 'Iterate: \\(R^2\\) carries a sub-grid holding \\(\\tfrac1{25}\\) of the points onto another &hellip;' },
        { id: 'r5cube', caption: '&hellip; \\(R^3\\) one holding \\(\\tfrac1{125}\\), and so on forever: \\(R\\) never returns to the identity.' },
        { id: 'explore', caption: 'Every rational rotation, at its angle: the height of its spike is the fraction of the grid it sends to the grid. Never \\(\\tfrac13\\); apart from the quarter turns, never more than \\(\\tfrac15\\).' },
    ];

    // ── the rotations of the story ──────────────────────────────────
    const TH5 = G.generator(5).angle;               // arccos(3/5)
    const GENERIC = 24 * DEG;                        // cos 24° is irrational
    /** Rᵏ = r₅ᵏ exactly, with β = (2 + i)ᵏ: Rᵏ carries β̄ℤ[i] onto βℤ[i]. */
    const POW5 = [1, 2, 3].map((k) => {
        const w = G.rotation([[5, k]]);
        const [bx, by] = G.beta([[5, k]]).map(Number);
        return { k, a: Number(w.re), b: Number(w.im), c: Number(w.den), bx, by, theta: k * TH5,
                 word: G.wordHTML(0, [[5, k]]) };
    });
    const QUARTER_TURN = { a: 1, b: 0, c: 1, bx: 1, by: 0 };

    /** Spikes: every rational rotation with angle in [0°, 90°] and c ≤ 6000. */
    const SPIKES = G.rationalPoints(6000)
        .filter((p) => p.a > 0 && p.b >= 0)
        .concat([{ a: 0, b: 1, c: 1, angle: QUARTER }])
        .map((p) => ({ a: p.a, b: p.b, c: p.c, angle: p.angle }))
        .sort((x, y) => x.angle - y.angle);
    const SPIKES_DRAW = SPIKES.slice().sort((x, y) => y.c - x.c);   // big c (short) first

    // ── state ──────────────────────────────────────────────────────
    const theta = new Tween(0);
    const zoom = new Tween(1);
    const oyFrac = new Tween(0.47);
    const F = {
        rot: new Fader(0, 0.35),
        glow: new Fader(0, 0.16),
        unit: new Fader(0, 0.35),
        sub: new Fader(0, 0.35),
        intro: new Fader(0, 0.7),
    };
    const subMix = new Fader(1, 0.28);
    let subCur = null, subOld = null;
    let step = 'grid';
    let mode = 'static';          // 'static' | 'loop' | 'explore'
    let loopT = 0, loopBase = 0;  // loop clock (pausable) and its starting angle
    let paused = false;
    let exact = null;             // {a, b, c, bx, by}: the exact rotation theta rests on / heads to
    let sel = null;               // explore: {k, spike}
    let drag = null;              // explore: angular drag in progress
    let curTheta = 0;
    let dirty = 3;

    const LOOP_DWELL = 1.5, LOOP_TURN = 2.1, LOOP_P = LOOP_DWELL + LOOP_TURN;

    const nearestRep = (target, cur, period = TAU) => target + period * Math.round((cur - target) / period);

    function loopState() {
        if (loopT < 0) return { th: theta.get(), dwell: false };
        const k = Math.floor(loopT / LOOP_P), f = loopT - k * LOOP_P;
        const base = loopBase + k * QUARTER;
        if (f < LOOP_DWELL) return { th: base, dwell: true };
        return { th: base + QUARTER * ease.inOut((f - LOOP_DWELL) / LOOP_TURN), dwell: false };
    }

    function enterLoop(instant) {
        if (mode === 'loop') return;
        mode = 'loop';
        const q = Math.round(curTheta / QUARTER) * QUARTER;
        theta.set(q, { dur: 0.9, instant });
        loopBase = q;
        loopT = instant ? 0 : -0.9;
    }

    // ── steps ──────────────────────────────────────────────────────
    function onStep(id, info) {
        const inst = info.instant;
        if (mode === 'loop') theta.set(curTheta, { instant: true });
        const wasLoop = mode === 'loop';
        step = id;
        document.body.classList.toggle('explore', id === 'explore');
        if (id !== 'explore') { sel = null; drag = null; document.body.classList.remove('dragging'); }
        let z = 1, rot = 0, unit = 0, sub = 0, subP = null;
        exact = null;
        if (id !== 'quarter' && id !== 'unit') mode = 'static';
        const toTheta = (target, o) => theta.set(nearestRep(target, curTheta), Object.assign({ instant: inst }, o));

        switch (id) {
            case 'grid':
                break;
            case 'quarter':
                rot = 1;
                if (!wasLoop) enterLoop(inst);
                break;
            case 'unit':
                rot = 1; unit = 1; z = 3;
                if (!wasLoop) enterLoop(inst);
                break;
            case 'question':
                rot = 1;
                toTheta(GENERIC, { dur: 1.7 });
                break;
            case 'subgrid':
                sub = 1; subP = POW5[0];
                toTheta(0, { dur: 1.3 });
                break;
            case 'r5': case 'r5sq': case 'r5cube': {
                const P = POW5[{ r5: 0, r5sq: 1, r5cube: 2 }[id]];
                rot = id === 'r5cube' ? 0.7 : 1;
                sub = 1; subP = P;
                z = { r5: 1, r5sq: 0.8, r5cube: 0.44 }[id];
                const waitForSub = subCur && subCur !== P;
                toTheta(P.theta, { dur: 2.3, delay: waitForSub ? 0.6 : 0.3 });
                exact = P;
                break;
            }
            case 'explore': {
                mode = 'explore';
                rot = 1;
                sub = 1;
                // stay on the rotation we arrived at if it is rational (R³, say); else R
                const s0 = spikeForTheta(curTheta);
                const s = s0 && s0.spike.c > 1 ? s0 : { k: 0, spike: spikeOf(3, 4) };
                select(s.k, s.spike, { instant: inst, keepZoom: false });
                z = zoomFor(s.spike.c);
                subP = subCur;
                break;
            }
        }
        F.rot.to(rot); F.unit.to(unit); F.sub.to(sub);
        setSub(subP, inst);
        zoom.set(z, { dur: 1.6, instant: inst });
        oyFrac.set(id === 'explore' ? 0.6 : 0.47, { dur: 1.0, instant: inst });
        if (inst) Object.values(F).forEach((f) => f.snap(f.target));
        updateReadout();
        dirty = 3;
    }

    function setSub(P, instant) {
        if (P === subCur) return;
        subOld = subCur; subCur = P;
        if (instant || !subOld) { subOld = null; subMix.snap(1); }
        else subMix.snap(0).to(1);
    }

    // ── explore: spikes, selection, snapping ───────────────────────
    function spikeOf(a, b) { return SPIKES.find((s) => s.a === a && s.b === b); }

    /** The exact rotation iᵏ·(a + bi)/c as {a, b, c, bx, by} (β for its sub-grids). */
    function exactFor(k, spike) {
        let a = spike.a, b = spike.b;
        for (let j = 0; j < ((k % 4) + 4) % 4; j++) [a, b] = [-b, a];
        if (spike.c === 1) return { a, b, c: 1, bx: 1, by: 0 };
        const f = G.factorRotation(a, b, spike.c);
        const [bx, by] = G.beta(f.exps).map(Number);
        return { a, b, c: spike.c, bx, by, u: f.u, exps: f.exps };
    }
    /** If θ is (within 1e-9) one of the spikes, return it with its quarter-turn count. */
    function spikeForTheta(th) {
        const k = Math.floor((th + 1e-9) / QUARTER);
        const phi = th - k * QUARTER;
        for (const s of SPIKES) if (Math.abs(s.angle - phi) < 1e-9) return { k, spike: s };
        return null;
    }

    function zoomFor(c) {
        const s0 = spacing();
        return clamp(Math.min(cv.W, cv.H) * 0.4 / (s0 * Math.sqrt(c)), 0.36, 1);
    }

    /** Pick the spike nearest to angle φ ∈ [0°, 90°], where big spikes pull harder. */
    function pickSpike(phi, pxPerRad) {
        let best = null, bestD = Infinity;
        for (const s of SPIKES) {
            const d = Math.abs(s.angle - phi) * pxPerRad - (2 + 80 / s.c);
            if (d < bestD) { bestD = d; best = s; }
        }
        return best;
    }

    function select(k, spike, { instant = false, keepZoom = true } = {}) {
        sel = { k, spike };
        const target = k * QUARTER + spike.angle;
        theta.set(nearestRep(target, curTheta), { dur: instant ? 0 : 0.45, instant, fn: ease.out });
        const ex = exactFor(k, spike);
        exact = ex;
        setSub(spike.c === 1 ? null : ex, instant);
        if (keepZoom) zoom.set(zoomFor(spike.c), { dur: 0.9 });
        updateReadout();
        drawSpectrum();
        dirty = 3;
    }

    // ── readout ────────────────────────────────────────────────────
    const readout = document.getElementById('readout');
    const m = G.minus;
    const matHTML = (a, b, c) =>
        (c === 1 ? '' : `<span class="frac"><span>1</span><span>${c}</span></span>`) +
        `<span class="mat"><span>${m(a)}</span><span>${m(-b)}</span><span>${m(b)}</span><span>${m(a)}</span></span>`;
    const degStr = (th) => {
        let d = (th / DEG) % 360;
        if (d < 0) d += 360;
        return d.toFixed(2) + '°';
    };
    let readoutKey = '';

    function updateReadout() {
        let html = '', on = false;
        if (step === 'question') {
            on = true;
            html = `<div class="ro-mat"><i>R</i> = rotation by 24°</div>
                    <div class="ro-row">cos 24° is irrational</div>
                    <div class="ro-land">lands on the grid: <b>only the origin</b></div>`;
        } else if (step === 'r5' || step === 'r5sq' || step === 'r5cube') {
            on = true;
            const P = POW5[{ r5: 0, r5sq: 1, r5cube: 2 }[step]];
            const name = ['<i>R</i>', '<i>R</i><sup>2</sup>', '<i>R</i><sup>3</sup>'][P.k - 1];
            html = `<div class="ro-mat">${name} = ${matHTML(P.a, P.b, P.c)}</div>
                    <div class="ro-row">${P.k === 1 ? '<i>θ</i> = arccos(3/5) ≈ 53.13°' : `<i>θ</i> ≈ ${degStr(P.theta)}`}</div>
                    <div class="ro-land">lands on the grid: <b>1/${P.c}</b> of the points</div>`;
        } else if (step === 'explore') {
            on = true;
            if (drag) {
                html = `<div class="ro-mat"><i>θ</i> ≈ ${degStr(curTheta)}</div>
                        <div class="ro-row">release to snap to a rational rotation</div>`;
            } else if (sel && exact) {
                const e = exact;
                const land = e.c === 1 ? '<b>all</b> of the points' : `<b>1/${e.c}</b> of the points`;
                const word = e.c === 1 ? G.wordHTML(((sel.k % 4) + 4) % 4, []) : G.wordHTML(e.u, e.exps);
                const fs = G.factor(e.c);
                const cRow = e.c === 1 ? '' : ` &nbsp;·&nbsp; <i>c</i> = ${e.c}` +
                    (fs.length > 1 || fs[0][1] > 1 ? ' = ' + G.factorText(fs) : '');
                html = `<div class="ro-mat"><i>R</i> = ${matHTML(e.a, e.b, e.c)}</div>
                        <div class="ro-row"><i>θ</i> ≈ ${degStr(sel.k * QUARTER + sel.spike.angle)}${cRow}</div>
                        <div class="ro-word"><i>R</i> = <span>${word}</span></div>
                        <div class="ro-land">lands on the grid: ${land}</div>`;
            }
        }
        if (html !== readoutKey) { readout.innerHTML = html; readoutKey = html; }
        readout.classList.toggle('on', on);
    }

    // ── canvas ─────────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    const GLOW = VizKit.glowSprite('45,212,191');
    const spacing = () => clamp(Math.min(cv.W, cv.H) / 21, 26, 58);

    function draw() {
        cv.begin();
        const W = cv.W, H = cv.H;
        const s = spacing() * zoom.get();
        const ox = W / 2, oy = H * oyFrac.get();
        const th = curTheta, co = Math.cos(th), sn = Math.sin(th);
        const Rw = Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy)) / s + 1.5;
        const intro = F.intro.v, rot = F.rot.v;
        const P = (x, y) => [ox + x * s, oy - y * s];
        const PR = (x, y) => [ox + (co * x - sn * y) * s, oy - (sn * x + co * y) * s];

        // grid lines: the fixed grid, then the rotated one
        const x0 = Math.floor(-ox / s) - 1, x1 = Math.ceil((W - ox) / s) + 1;
        const y0 = Math.floor(-(H - oy) / s) - 1, y1 = Math.ceil(oy / s) + 1;
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(148,163,184,${0.075 * intro})`;
        ctx.beginPath();
        for (let i = x0; i <= x1; i++) { const X = ox + i * s; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
        for (let j = y0; j <= y1; j++) { const Y = oy - j * s; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
        ctx.stroke();
        const M = Math.ceil(Rw);
        if (rot > 0.01) {
            ctx.strokeStyle = `rgba(245,158,11,${0.085 * rot})`;
            ctx.beginPath();
            for (let i = -M; i <= M; i++) {
                const L = Math.sqrt(Math.max(0, Rw * Rw - i * i));
                let a = PR(i, -L), b = PR(i, L); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                a = PR(-L, i); b = PR(L, i); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
            }
            ctx.stroke();
        }

        // sub-grids (under the dots): tilings, drawn on a layer that fades
        // radially so the eye stays near the origin
        const subA = F.sub.v;
        if (subA > 0.01) {
            const L = layer();
            const lc = L.getContext('2d');
            lc.setTransform(1, 0, 0, 1, 0, 0);
            lc.clearRect(0, 0, L.width, L.height);
            lc.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
            if (subOld) drawSubTiling(lc, subOld, subA * (1 - subMix.v));
            if (subCur) drawSubTiling(lc, subCur, subA * subMix.v);
            const R0 = 0.52 * Math.min(W, H);
            const rg = lc.createRadialGradient(ox, oy, 0, ox, oy, R0);
            rg.addColorStop(0, 'rgba(0,0,0,1)');
            rg.addColorStop(0.5, 'rgba(0,0,0,0.9)');
            rg.addColorStop(1, 'rgba(0,0,0,0.16)');
            lc.globalCompositeOperation = 'destination-in';
            lc.fillStyle = rg;
            lc.fillRect(0, 0, W, H);
            lc.globalCompositeOperation = 'source-over';
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(L, 0, 0);
            ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        }

        // fixed grid points
        const rb = clamp(s * 0.058, 1.05, 2.9);
        ctx.fillStyle = `rgba(132,148,182,${0.85 * intro})`;
        ctx.beginPath();
        for (let i = x0; i <= x1; i++) {
            const X = ox + i * s;
            for (let j = y0; j <= y1; j++) {
                const Y = oy - j * s;
                ctx.moveTo(X + rb, Y); ctx.arc(X, Y, rb, 0, TAU);
            }
        }
        ctx.fill();

        // rotated grid points
        if (rot > 0.01) {
            const rr = clamp(s * 0.066, 1.15, 3.2);
            ctx.fillStyle = `rgba(245,158,11,${0.92 * rot})`;
            ctx.beginPath();
            for (let i = -M; i <= M; i++) {
                const L = Math.floor(Math.sqrt(Math.max(0, Rw * Rw - i * i)));
                for (let j = -L; j <= L; j++) {
                    const X = ox + (co * i - sn * j) * s, Y = oy - (sn * i + co * j) * s;
                    if (X < -6 || X > W + 6 || Y < -6 || Y > H + 6) continue;
                    ctx.moveTo(X + rr, Y); ctx.arc(X, Y, rr, 0, TAU);
                }
            }
            ctx.fill();
        }

        // sub-grid points on top
        if (subA > 0.01) {
            if (subOld) drawSubPoints(subOld, subA * (1 - subMix.v));
            if (subCur) drawSubPoints(subCur, subA * subMix.v);
        }

        // glows: exactly the points that land on grid points
        ctx.globalCompositeOperation = 'lighter';
        const g = F.glow.v * rot;
        const gs = clamp(s * 0.8, 18, 44);
        if (g > 0.01 && exact) {
            const big = exact.c === 1;
            ctx.globalAlpha = g * (big ? 0.42 : 0.95);
            // the sub-grid β̄ℤ[i] of the moving copy — it lands on βℤ[i]
            forLattice(exact.bx, -exact.by, Rw, (x, y) => {
                const [X, Y] = PR(x, y);
                if (X > -gs && X < W + gs && Y > -gs && Y < H + gs) ctx.drawImage(GLOW, X - gs / 2, Y - gs / 2, gs, gs);
            });
        }
        if (rot > 0.01) {   // the origin always stays put
            ctx.globalAlpha = rot * Math.max(0.85, g);
            ctx.drawImage(GLOW, ox - gs / 2, oy - gs / 2, gs, gs);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        if (F.unit.v > 0.01) drawUnit(ox, oy, s, co, sn, F.unit.v);

        // ---- helpers bound to this frame ----
        function drawSubTiling(c2, Q, a) {
            if (a < 0.01) return;
            c2.lineWidth = 1.5;
            c2.strokeStyle = `rgba(244,114,182,${0.55 * a})`;       // B = βℤ[i], fixed
            c2.beginPath(); tiling(c2, Q.bx, Q.by, P); c2.stroke();
            c2.strokeStyle = `rgba(124,138,255,${0.65 * a})`;       // A = β̄ℤ[i], moving
            c2.beginPath(); tiling(c2, Q.bx, -Q.by, PR); c2.stroke();
        }
        function tiling(c2, ux, uy, map) {   // lines of the square lattice (ux + i·uy)·ℤ[i]
            const len = Math.hypot(ux, uy);
            const n = Math.ceil(Rw / len);
            for (let k = -n; k <= n; k++) {
                const off = k * len;
                if (Math.abs(off) > Rw) continue;
                const half = Math.sqrt(Rw * Rw - off * off) / len;
                // along u, offset k·v with v = (−uy, ux)
                let a = map(-uy * k - ux * half, ux * k - uy * half), b = map(-uy * k + ux * half, ux * k + uy * half);
                c2.moveTo(a[0], a[1]); c2.lineTo(b[0], b[1]);
                // along v, offset k·u
                a = map(ux * k + uy * half, uy * k - ux * half); b = map(ux * k - uy * half, uy * k + ux * half);
                c2.moveTo(a[0], a[1]); c2.lineTo(b[0], b[1]);
            }
        }
        function drawSubPoints(Q, a) {
            if (a < 0.01) return;
            const rB = clamp(s * 0.21, 4.5, 10), rA = clamp(s * 0.13, 3, 6.5);
            ctx.globalAlpha = a;
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#f472b6';
            ctx.beginPath();
            forLattice(Q.bx, Q.by, Rw, (x, y) => {
                const [X, Y] = P(x, y);
                if (X < -12 || X > W + 12 || Y < -12 || Y > H + 12) return;
                ctx.moveTo(X + rB, Y); ctx.arc(X, Y, rB, 0, TAU);
            });
            ctx.stroke();
            ctx.fillStyle = '#7c8aff';
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            forLattice(Q.bx, -Q.by, Rw, (x, y) => {
                const [X, Y] = PR(x, y);
                if (X < -12 || X > W + 12 || Y < -12 || Y > H + 12) return;
                ctx.moveTo(X + rA, Y); ctx.arc(X, Y, rA, 0, TAU);
            });
            ctx.fill(); ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    let layerCanvas = null;
    /** An offscreen canvas the size of the stage (for masked layers). */
    function layer() {
        if (!layerCanvas) layerCanvas = document.createElement('canvas');
        if (layerCanvas.width !== cv.cv.width || layerCanvas.height !== cv.cv.height) {
            layerCanvas.width = cv.cv.width;
            layerCanvas.height = cv.cv.height;
        }
        return layerCanvas;
    }

    /** Visit the points of (ux + i·uy)·ℤ[i] within radius R. */
    function forLattice(ux, uy, R, fn) {
        const len = Math.hypot(ux, uy);
        const n = Math.ceil(R / len) + 1;
        for (let mm = -n; mm <= n; mm++) {
            for (let nn = -n; nn <= n; nn++) {
                const x = mm * ux - nn * uy, y = mm * uy + nn * ux;
                if (x * x + y * y <= R * R) fn(x, y);
            }
        }
    }

    function arrow(x0, y0, x1, y1, color, width) {
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
        if (L < 1) return;
        const ux = dx / L, uy = dy / L, hl = Math.min(16, L * 0.3), hw = hl * 0.5;
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - ux * hl * 0.8, y1 - uy * hl * 0.8); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw);
        ctx.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw);
        ctx.closePath(); ctx.fill();
    }

    function mathLabel(base, sub, x, y, color, size = 23, prefix = '') {
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        let cx = x;
        if (prefix) {
            ctx.font = `italic ${size}px "Times New Roman", Times, serif`;
            ctx.fillText(prefix, cx, y); cx += ctx.measureText(prefix).width + 1;
        }
        ctx.font = `italic ${size}px "Times New Roman", Times, serif`;
        ctx.fillText(base, cx, y); cx += ctx.measureText(base).width;
        ctx.font = `${Math.round(size * 0.66)}px "Times New Roman", Times, serif`;
        ctx.fillText(sub, cx + 1, y + size * 0.3);
    }

    function drawUnit(ox, oy, s, co, sn, a) {
        ctx.globalAlpha = a;
        // the unit circle
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(232,236,247,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ox, oy, s, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        // the four grid points on it
        const pulse = 0.75 + 0.25 * Math.sin(clock.t * 3);
        ctx.strokeStyle = `rgba(45,212,191,${pulse})`;
        ctx.lineWidth = 2.5;
        for (const [x, y] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            ctx.beginPath(); ctx.arc(ox + x * s, oy - y * s, 10, 0, TAU); ctx.stroke();
        }
        // e₁, e₂ (fixed) and their images (moving, amber)
        arrow(ox, oy, ox + s, oy, 'rgba(232,236,247,0.4)', 2.5);
        arrow(ox, oy, ox, oy - s, 'rgba(232,236,247,0.4)', 2.5);
        mathLabel('e', '1', ox + s + 16, oy + 18, 'rgba(232,236,247,0.55)', 21);
        mathLabel('e', '2', ox + 12, oy - s - 20, 'rgba(232,236,247,0.55)', 21);
        const e1 = [ox + co * s, oy - sn * s], e2 = [ox - sn * s, oy - co * s];
        arrow(ox, oy, e1[0], e1[1], '#f59e0b', 4);
        arrow(ox, oy, e2[0], e2[1], '#fbbf24', 4);
        const lab = (pt, sub) => {
            const dx = pt[0] - ox, dy = pt[1] - oy, L = Math.hypot(dx, dy) || 1;
            mathLabel('e', sub, pt[0] + dx / L * 26 - 16, pt[1] + dy / L * 26, '#fbbf24', 24, 'R');
        };
        lab(e1, '1'); lab(e2, '2');
        ctx.globalAlpha = 1;
    }

    // ── the spectrum ───────────────────────────────────────────────
    const specHost = document.querySelector('#spectrum .sp-plot');
    const sc = VizKit.makeCanvas(specHost);
    const SP = { l: 38, r: 10, t: 12, b: 20 };
    const spW = () => sc.W - SP.l - SP.r;
    const spX = (ang) => SP.l + ang / QUARTER * spW();
    const spY = (f) => SP.t + (sc.H - SP.t - SP.b) * (1 - Math.min(f, 1 / 3) * 3);

    function spikeColor(c, alpha) {
        const t = clamp(Math.log(c / 5) / Math.log(800 / 5), 0, 1);   // 5 → gold, 800+ → dim indigo
        const r = Math.round(251 + (98 - 251) * t), g = Math.round(191 + (112 - 191) * t), b = Math.round(36 + (190 - 36) * t);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function drawSpectrum() {
        sc.resize();
        sc.begin();
        const c2 = sc.ctx, Hb = sc.H - SP.b;
        c2.font = '11px Inter, sans-serif';
        c2.textBaseline = 'middle';
        // reference levels
        for (const [f, lab] of [[1 / 3, '1/3'], [1 / 4, '1/4'], [1 / 5, '1/5']]) {
            const y = spY(f);
            c2.strokeStyle = f === 1 / 5 ? 'rgba(45,212,191,0.35)' : 'rgba(255,255,255,0.13)';
            c2.setLineDash([4, 5]); c2.lineWidth = 1;
            c2.beginPath(); c2.moveTo(SP.l, y); c2.lineTo(sc.W - SP.r, y); c2.stroke();
            c2.setLineDash([]);
            c2.fillStyle = f === 1 / 5 ? 'rgba(45,212,191,0.9)' : 'rgba(154,165,191,0.75)';
            c2.textAlign = 'right';
            c2.fillText(lab, SP.l - 7, y);
        }
        // baseline + degree ticks
        c2.strokeStyle = 'rgba(255,255,255,0.22)';
        c2.beginPath(); c2.moveTo(SP.l, Hb); c2.lineTo(sc.W - SP.r, Hb); c2.stroke();
        c2.fillStyle = 'rgba(154,165,191,0.7)';
        c2.textAlign = 'center';
        for (let d = 0; d <= 90; d += 15) {
            const x = spX(d * DEG);
            c2.beginPath(); c2.moveTo(x, Hb); c2.lineTo(x, Hb + 3); c2.stroke();
            c2.fillText(d + '°', x, Hb + 11);
        }
        // spikes, short ones first
        for (const s of SPIKES_DRAW) {
            if (s.c === 1) continue;
            const x = spX(s.angle), y = spY(1 / s.c);
            c2.strokeStyle = spikeColor(s.c, s.c <= 30 ? 1 : 0.85);
            c2.lineWidth = s.c <= 30 ? 2 : s.c <= 200 ? 1.3 : 1;
            c2.beginPath(); c2.moveTo(x, Hb); c2.lineTo(x, Math.min(y, Hb - 0.6)); c2.stroke();
        }
        // quarter turns: all of the grid (off the chart)
        for (const ang of [0, QUARTER]) {
            const x = spX(ang);
            c2.strokeStyle = 'rgba(255,255,255,0.9)'; c2.lineWidth = 2.2;
            c2.beginPath(); c2.moveTo(x, Hb); c2.lineTo(x, SP.t - 2); c2.stroke();
            c2.fillStyle = 'rgba(255,255,255,0.9)';
            c2.beginPath(); c2.moveTo(x, SP.t - 8); c2.lineTo(x - 4, SP.t); c2.lineTo(x + 4, SP.t); c2.closePath(); c2.fill();
        }
        // labels on the tallest spikes
        c2.font = '600 11px Inter, sans-serif';
        c2.textAlign = 'center';
        for (const s of SPIKES) {
            if (![5, 13, 17, 25].includes(s.c)) continue;
            c2.fillStyle = spikeColor(s.c, 0.95);
            c2.fillText('1/' + s.c, spX(s.angle), spY(1 / s.c) - 9);
        }
        // the selection: a faint playhead, then its spike in teal
        if (sel) {
            const x = spX(sel.spike.angle);
            c2.strokeStyle = 'rgba(45,212,191,0.28)'; c2.lineWidth = 1;
            c2.setLineDash([3, 4]);
            c2.beginPath(); c2.moveTo(x, Hb); c2.lineTo(x, SP.t - 2); c2.stroke();
            c2.setLineDash([]);
            c2.strokeStyle = 'rgba(45,212,191,0.95)'; c2.lineWidth = 3;
            c2.beginPath(); c2.moveTo(x, Hb); c2.lineTo(x, Math.max(SP.t - 2, spY(1 / sel.spike.c))); c2.stroke();
            c2.fillStyle = '#2dd4bf';
            c2.beginPath(); c2.arc(x, Hb, 4.5, 0, TAU); c2.fill();
        } else if (drag) {
            let phi = curTheta % QUARTER; if (phi < 0) phi += QUARTER;
            const x = spX(phi);
            c2.strokeStyle = 'rgba(245,158,11,0.9)'; c2.lineWidth = 2;
            c2.beginPath(); c2.moveTo(x, Hb); c2.lineTo(x, SP.t); c2.stroke();
        }
    }

    // spectrum scrubbing: always lands on a spike
    let scrubbing = false;
    function scrubAt(clientX) {
        const r = specHost.getBoundingClientRect();
        const phi = clamp((clientX - r.left - SP.l) / spW(), 0, 1) * QUARTER;
        const s = pickSpike(phi, spW() / QUARTER);
        const k = Math.floor((curTheta + 1e-9) / QUARTER);
        if (!sel || sel.spike !== s) select(k, s);
    }
    specHost.addEventListener('pointerdown', (e) => {
        if (step !== 'explore') return;
        scrubbing = true; specHost.setPointerCapture(e.pointerId); scrubAt(e.clientX);
    });
    specHost.addEventListener('pointermove', (e) => { if (scrubbing) scrubAt(e.clientX); });
    const endScrub = () => { scrubbing = false; };
    specHost.addEventListener('pointerup', endScrub);
    specHost.addEventListener('pointercancel', endScrub);

    // turning the grid by hand: free while dragging, snaps on release
    const stageEl = document.getElementById('stage');
    const pointerAngle = (e) => {
        const r = stageEl.getBoundingClientRect();
        return Math.atan2(-(e.clientY - r.top - cv.H * oyFrac.get()), e.clientX - r.left - cv.W / 2);
    };
    stageEl.addEventListener('pointerdown', (e) => {
        if (step !== 'explore') return;
        stageEl.setPointerCapture(e.pointerId);
        drag = { a0: pointerAngle(e), th0: curTheta };
        sel = null; exact = null;
        theta.set(curTheta, { instant: true });
        F.sub.to(0);
        document.body.classList.add('dragging');
        updateReadout(); drawSpectrum(); dirty = 3;
    });
    stageEl.addEventListener('pointermove', (e) => {
        if (!drag) return;
        let d = pointerAngle(e) - drag.a0;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        drag.a0 += d; drag.th0 += d;
        theta.set(drag.th0, { instant: true });
        updateReadout(); drawSpectrum(); dirty = 3;
    });
    const endDrag = () => {
        if (!drag) return;
        drag = null;
        document.body.classList.remove('dragging');
        const k = Math.floor(curTheta / QUARTER);
        const phi = curTheta - k * QUARTER;
        F.sub.to(1);
        select(k, pickSpike(phi, spW() / QUARTER));
    };
    stageEl.addEventListener('pointerup', endDrag);
    stageEl.addEventListener('pointercancel', endDrag);

    // ── commands ───────────────────────────────────────────────────
    function onCommand(cmd) {
        if (cmd === 'toggle' || cmd === 'play' || cmd === 'pause') paused = cmd === 'pause' ? true : cmd === 'play' ? false : !paused;
        else if (cmd === 'reset') {
            if (step === 'explore') select(0, spikeOf(3, 4));
            else if (mode === 'loop') { loopT = 0; paused = false; }
        }
        dirty = 3;
    }

    // ── frame loop ─────────────────────────────────────────────────
    function frame(dt) {
        if (cv.resize()) { drawSpectrum(); dirty = 3; }
        F.intro.to(1);
        let moving = false;
        for (const f of Object.values(F)) { f.step(dt); moving = moving || f.moving; }
        subMix.step(dt); moving = moving || subMix.moving;
        if (subMix.v === 1 && subOld) subOld = null;

        if (mode === 'loop') {
            if (!paused || loopT < 0) loopT += dt;
            const L = loopState();
            curTheta = L.th;
            exact = L.dwell ? QUARTER_TURN : null;
            F.glow.to(L.dwell ? 1 : 0);
            moving = true;
        } else {
            curTheta = theta.get();
            F.glow.to(exact && !theta.moving && !drag ? 1 : 0);
            moving = moving || theta.moving;
        }
        zoom.get(); oyFrac.get();
        moving = moving || zoom.moving || oyFrac.moving || F.unit.v > 0;   // the unit targets pulse
        if (moving) dirty = 2;
        if (dirty > 0) { draw(); dirty--; }
    }

    const loop = VizKit.startLoop(frame);
    const steps = VizKit.setup(STEPS, {
        onStep,
        onCommand,
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); drawSpectrum(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { drawSpectrum(); dirty = 3; });
    drawSpectrum();

    // console / test handle
    window.viz = {
        steps, loop, advance: loop.advance,
        get state() {
            return { step, mode, theta: curTheta / DEG, zoom: zoom.v, exact, sel: sel && { k: sel.k, c: sel.spike.c, a: sel.spike.a, b: sel.spike.b } };
        },
        select: (a, b, k = 0) => select(k, spikeOf(a, b)),
    };
})();
