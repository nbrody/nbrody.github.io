/**
 * tree.js — the rotations with denominator a power of p form a tree.
 *
 * Nodes are the reduced words in A_p (Nic's normalized primes of norm p);
 * the node for g sits either at R_g·x₀ on the sphere (the orbit of a point)
 * or in the tree layout, where the edge g → g·a points along the rotation
 * axis of a (so for p = 5 the edges run along i, j, k, and the powers of
 * 1 + 2i — last time's line — are the i-axis of the tree).
 *
 *   orbit   p = 5, words of length ≤ 3 applied to one point: a dense tangle
 *   tree    … which unfolds into the 6-regular tree T₆
 *   line    the powers of 1 ± 2i: rotations about the i-axis, last time's ℤ
 *   p3      p = 3: A₃ = {1 ± i ± j}, a planar 4-regular tree (an H-tree)
 *   p13     p = 13: 14 directions
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, lerp, ease } = VizKit;
    const { Camera, DrawList, V, UQ, quatLabel } = View3D;
    const Q = Quat;
    const TAU = 2 * Math.PI;

    const STEPS = [
        { id: 'orbit', caption: 'The rotations with denominator a power of 5, applied to one point of the sphere: a dense tangle again &hellip;' },
        { id: 'tree', caption: '&hellip; but it is really a <b>tree</b>: every rotation has \\(p + 1 = 6\\) neighbours, one for each prime in \\(A_5 = \\{1 \\pm 2i,\\ 1 \\pm 2j,\\ 1 \\pm 2k\\}\\).' },
        { id: 'line', caption: 'The powers of \\(1 + 2i\\) &mdash; rotations about the \\(i\\)-axis, last time’s line \\(\\mathbb Z\\) &mdash; are a single geodesic in this tree.' },
        { id: 'p3', caption: 'For \\(p = 3\\), \\(A_3 = \\{1 \\pm i \\pm j\\}\\): a 4-regular tree. The labels are the quaternions of norm \\(3^n\\).' },
        { id: 'p13', caption: 'For \\(p = 13\\): 14 directions. For every odd prime \\(p\\), the rotations with denominator \\(p^n\\) form a \\((p+1)\\)-regular tree \\(T_{p+1}\\).' },
    ];

    // ── the trees ───────────────────────────────────────────────────
    const RS = 2.2;                                   // sphere radius
    const X0 = V.norm([0.36, 0.52, 0.77]);            // the point we move around
    const HUES = {
        3: [[251, 191, 36], [251, 191, 36], [125, 211, 252], [125, 211, 252]],
        5: [[124, 138, 255], [124, 138, 255], [244, 114, 182], [244, 114, 182], [45, 212, 191], [45, 212, 191]],
    };
    function hue13(g) {       // 14 generators: coordinate axes teal-ish, diagonals warm
        const pal = [[251, 146, 60], [251, 146, 60], [250, 204, 21], [250, 204, 21], [163, 230, 53], [163, 230, 53],
            [192, 132, 252], [192, 132, 252], [124, 138, 255], [124, 138, 255], [244, 114, 182], [244, 114, 182], [45, 212, 191], [45, 212, 191]];
        return pal[g % pal.length];
    }
    const LAYOUT = { 5: { depth: 3, L0: 1.45, lambda: 0.46 }, 3: { depth: 4, L0: 1.75, lambda: 0.48 }, 13: { depth: 2, L0: 1.6, lambda: 0.36 } };

    function buildLayer(p) {
        const Ap = Q.A(p), cfg = LAYOUT[p];
        const { nodes, inv } = Q.tree(Ap, cfg.depth);
        const dirs = Ap.map((a) => V.norm([a[1], a[2], a[3]]));
        const color = (g) => (p === 13 ? hue13(g) : HUES[p][g]);
        for (const n of nodes) {
            n.R = Q.rotFloat(n.q);
            n.orbit = V.scale(Q.apply(n.R, X0), RS);
            n.tree = n.parent < 0 ? [0, 0, 0]
                : V.add(nodes[n.parent].tree, V.scale(dirs[n.gen], cfg.L0 * Math.pow(cfg.lambda, n.depth - 1)));
            n.col = n.gen < 0 ? [255, 255, 255] : color(n.gen);
        }
        // straight continuations g, g·a, g·a·a … are worth labelling
        for (const n of nodes) n.straight = n.word.length > 0 && n.word.every((g) => g === n.word[0]);
        return { p, Ap, nodes, inv, dirs, color, cfg };
    }
    const LAYERS = { 5: buildLayer(5), 3: buildLayer(3), 13: buildLayer(13) };
    // extra depth-4 points for p = 5, only to thicken the orbit
    const DUST = Q.tree(Q.A(5), 4).nodes.filter((n) => n.depth === 4).map((n) => V.scale(Q.apply(Q.rotFloat(n.q), X0), RS));
    const I_PLUS = 0, I_MINUS = 1;       // indices of 1 + 2i, 1 − 2i in A₅ (quat.js orders inverse pairs adjacently)

    // globe polylines
    const GLOBE = [];
    for (const lat of [-60, -30, 0, 30, 60]) {
        const r = Math.cos(lat * Math.PI / 180), z = Math.sin(lat * Math.PI / 180), pts = [];
        for (let i = 0; i <= 60; i++) { const t = i / 60 * TAU; pts.push([r * Math.cos(t) * RS, r * Math.sin(t) * RS, z * RS]); }
        GLOBE.push(pts);
    }
    for (let lon = 0; lon < 180; lon += 30) {
        const t0 = lon * Math.PI / 180, pts = [];
        for (let i = 0; i <= 60; i++) { const t = i / 60 * TAU; pts.push([Math.cos(t) * Math.cos(t0) * RS, Math.cos(t) * Math.sin(t0) * RS, Math.sin(t) * RS]); }
        GLOBE.push(pts);
    }

    // ── state ──────────────────────────────────────────────────────
    const cam = new Camera({ yaw: 0.7, pitch: 0.4, focal: 16 });
    const camYaw = new Tween(0.7), camPitch = new Tween(0.4), zoom = new Tween(1);
    const F = {
        globe: new Fader(1, 0.5), l5: new Fader(1, 0.45), l3: new Fader(0, 0.45), l13: new Fader(0, 0.45),
        dust: new Fader(1, 0.4), labels: new Fader(0, 0.4), line: new Fader(0, 0.4), intro: new Fader(0, 0.8),
    };
    const morph = { 5: new Tween(0), 3: new Tween(0), 13: new Tween(0) };
    let step = 'orbit', spin = true, paused = false, drag = null, hover = null, mouse = null, dirty = 3;

    const nearAngle = (target, cur) => target + TAU * Math.round((cur - target) / TAU);

    function onStep(id, info) {
        const inst = info.instant;
        step = id;
        const set = (tw, v, o = {}) => tw.set(v, Object.assign({ instant: inst }, o));
        F.globe.to(id === 'orbit' ? 1 : 0);
        F.dust.to(id === 'orbit' ? 1 : 0);
        F.l5.to(['orbit', 'tree', 'line'].includes(id) ? 1 : 0);
        F.l3.to(id === 'p3' ? 1 : 0);
        F.l13.to(id === 'p13' ? 1 : 0);
        F.labels.to(id === 'orbit' ? 0 : 1);
        F.line.to(id === 'line' ? 1 : 0);
        set(morph[5], id === 'orbit' ? 0 : 1, { dur: 3.0, delay: 0.2 });
        set(morph[3], id === 'p3' ? 1 : 0, { dur: id === 'p3' ? 2.6 : 0.8 });
        set(morph[13], id === 'p13' ? 1 : 0, { dur: id === 'p13' ? 2.6 : 0.8 });
        const view = { orbit: [0.7, 0.4, 1], tree: [0.75, 0.42, 1.05], line: [1.45, 0.3, 1.05], p3: [Math.PI / 4, 1.2, 1.1], p13: [0.7, 0.4, 1.02] }[id];
        set(camYaw, nearAngle(view[0], camYaw.get()), { dur: 2.2 });
        set(camPitch, view[1], { dur: 2.2 });
        set(zoom, view[2], { dur: 2.0 });
        spin = id !== 'line' && id !== 'p3';
        if (inst) Object.entries(F).forEach(([k, f]) => { if (k !== 'intro') f.snap(f.target); });
        updateLegend();
        dirty = 3;
    }

    // ── legend (top right) ─────────────────────────────────────────
    const legend = document.getElementById('legend');
    function updateLegend() {
        const p = step === 'p3' ? 3 : step === 'p13' ? 13 : 5;
        const L = LAYERS[p];
        if (step === 'orbit') { legend.classList.remove('on'); return; }
        const rows = [];
        for (let g = 0; g < L.Ap.length; g += 2) {
            const c = L.color(g);
            rows.push(`<div class="lg-row"><span class="lg-sw" style="background: rgb(${c})"></span>${Q.html(L.Ap[g])}, &nbsp;${Q.html(L.Ap[g + 1])}</div>`);
            if (p === 13 && g >= 12) break;
        }
        legend.innerHTML = `<div class="lg-title">A<sub>${p}</sub> &nbsp;·&nbsp; p + 1 = ${p + 1} neighbours</div>${p === 13 ? rows.slice(0, 7).join('') : rows.join('')}` +
            `<div class="lg-count">norm ${p} &nbsp;·&nbsp; 8(p + 1) = ${8 * (p + 1)} quaternions, up to ±1, ±i, ±j, ±k</div>`;
        legend.classList.add('on');
    }

    // ── canvas ─────────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    const dl = new DrawList();
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    let hits = [];

    const stag = (M, depth, maxD) => ease.inOut(clamp(M * 1.5 - 0.5 * depth / maxD, 0, 1));

    function drawLayer(L, alpha, M) {
        const maxD = L.cfg.depth;
        const pos = L.nodes.map((n) => V.lerp(n.orbit, n.tree, stag(M, n.depth, maxD)));
        const P = pos.map((p) => cam.proj(p));
        const lineHi = F.line.v;
        const onLine = (n) => L.p === 5 && n.word.length > 0 && (n.word.every((g) => g === I_PLUS) || n.word.every((g) => g === I_MINUS));
        // edges
        L.nodes.forEach((n, i) => {
            if (n.parent < 0) return;
            const A = P[n.parent], B = P[i];
            const hi = onLine(n) ? 1 : 0;
            const a = alpha * (0.3 + 0.55 * (1 - n.depth / (maxD + 1))) * (1 - 0.8 * lineHi * (1 - hi)) + alpha * 0.5 * lineHi * hi;
            const w = (M > 0.5 ? 2.6 : 1.5) * Math.pow(0.8, n.depth - 1) * (1 + 0.8 * lineHi * hi);
            dl.add((A[2] + B[2]) / 2 - 0.01, () => {
                ctx.strokeStyle = rgba(hi && lineHi > 0.02 ? [251, 191, 36] : n.col, Math.min(1, a));
                ctx.lineWidth = w;
                ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
            });
        });
        // nodes
        L.nodes.forEach((n, i) => {
            const S = P[i];
            const hi = onLine(n) || n.depth === 0;
            const r = (n.depth === 0 ? 7 : 5.2 * Math.pow(0.78, n.depth - 1)) * S[3];
            const a = alpha * (1 - 0.75 * lineHi * (hi ? 0 : 1));
            dl.add(S[2], () => {
                ctx.fillStyle = rgba(n.depth === 0 ? [255, 255, 255] : n.col.map((c) => Math.round(c * 0.6 + 100)), a);
                ctx.beginPath(); ctx.arc(S[0], S[1], r, 0, TAU); ctx.fill();
            });
            if (a > 0.3) hits.push([S[0], S[1], L, n]);
        });
        // labels
        const la = alpha * F.labels.v * clamp(M * 2 - 1, 0, 1);
        if (la > 0.02) {
            L.nodes.forEach((n, i) => {
                const S = P[i];
                const show = n.depth <= 1 || (n.depth === 2 && n.straight && L.p !== 13) || (lineHi > 0.5 && onLine(n));
                if (!show) return;
                const off = n.depth === 0 ? [0, -16] : labelOffset(pos[i], L, n);
                const size = n.depth === 0 ? 20 : n.depth === 1 ? 17 : 14;
                const a = la * (lineHi > 0.02 && !onLine(n) && n.depth > 0 ? 1 - 0.8 * lineHi : 1);
                dl.add(S[2] + 0.5, () => quatLabel(ctx, n.depth === 0 ? [1, 0, 0, 0] : n.q, S[0] + off[0], S[1] + off[1],
                    `rgba(232,236,247,${a})`, size));
            });
        }
    }
    /** Push labels outward along the edge direction on screen. */
    function labelOffset(p, L, n) {
        const d = L.dirs[n.gen];
        const A = cam.proj(p), B = cam.proj(V.add(p, V.scale(d, 0.3)));
        const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1;
        const k = n.depth === 1 ? 24 : 18;
        return [dx / l * k, dy / l * k - 2];
    }

    function draw() {
        cv.begin();
        const W = cv.W, H = cv.H;
        cam.setup(W / 2, H * 0.46, Math.min(W, H - 120) * 0.16 * zoom.get());
        hits = [];
        const intro = F.intro.v;
        if (F.globe.v > 0.01) {
            const a = F.globe.v * intro;
            for (const line of GLOBE) for (let i = 0; i + 1 < line.length; i++) {
                const A = cam.proj(line[i]), B = cam.proj(line[i + 1]);
                const front = (A[2] + B[2]) > 0;
                dl.add((A[2] + B[2]) / 2 - 0.05, () => {
                    ctx.strokeStyle = `rgba(150,165,215,${(front ? 0.26 : 0.08) * a})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
                });
            }
        }
        if (F.dust.v > 0.01) {
            const a = F.dust.v * intro;
            for (const p of DUST) {
                const S = cam.proj(p);
                dl.add(S[2] - 0.02, () => {
                    ctx.fillStyle = `rgba(165,175,235,${(S[2] > 0 ? 0.5 : 0.18) * a})`;
                    ctx.beginPath(); ctx.arc(S[0], S[1], 1.6 * S[3], 0, TAU); ctx.fill();
                });
            }
        }
        if (F.l5.v > 0.01) drawLayer(LAYERS[5], F.l5.v * intro, morph[5].get());
        if (F.l3.v > 0.01) drawLayer(LAYERS[3], F.l3.v * intro, morph[3].get());
        if (F.l13.v > 0.01) drawLayer(LAYERS[13], F.l13.v * intro, morph[13].get());
        dl.run();
    }

    // ── hover: the rotation at a node ──────────────────────────────
    const tip = document.getElementById('tip');
    function updateHover() {
        if (!mouse || drag) { if (hover) { hover = null; tip.classList.remove('on'); } return; }
        let best = null, bd = 13 * 13;
        for (const h of hits) {
            const d = (h[0] - mouse.x) ** 2 + (h[1] - mouse.y) ** 2;
            if (d < bd) { bd = d; best = h; }
        }
        if (!best) { if (hover) { hover = null; tip.classList.remove('on'); } return; }
        const [X, Y, L, n] = best;
        if (!hover || hover.n !== n) {
            hover = { n };
            const word = n.word.length ? n.word.map((g) => `(${Q.html(L.Ap[g])})`).join('') : '1';
            const { den } = Q.rot(n.q);
            tip.innerHTML = `<div class="t-word">${word}</div>` +
                (n.word.length > 1 ? `<div class="t-val">= ${Q.html(n.q)}</div>` : '') +
                `<div class="t-dim">norm ${L.p}${n.depth > 1 ? `<sup>${n.depth}</sup>` : ''} = ${Q.norm(n.q)} &nbsp;·&nbsp; rotation with denominator ${den}</div>`;
        }
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let x = X + 16, y = Y - th - 12;
        if (x + tw > cv.W - 10) x = X - tw - 16;
        if (y < 10) y = Y + 16;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
        tip.classList.add('on');
    }

    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointermove', (e) => {
        mouse = { x: e.clientX, y: e.clientY };
        if (drag) { orbitCamera(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; }
        dirty = 2;
    });
    stageEl.addEventListener('pointerleave', () => { mouse = null; dirty = 2; });
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
        for (const f of Object.values(F)) { f.step(dt); moving = moving || f.moving; }
        for (const t of [camYaw, camPitch, zoom, morph[3], morph[5], morph[13]]) { t.get(); moving = moving || t.moving; }
        if (spin && !paused && !drag && !camYaw.moving) { camYaw.set(camYaw.get() + dt * 0.09, { instant: true }); moving = true; }
        cam.yaw = camYaw.v; cam.pitch = camPitch.v;
        if (moving) dirty = 2;
        if (dirty > 0) { draw(); updateHover(); dirty--; }
    }

    const loop = VizKit.startLoop(frame);
    const steps = VizKit.setup(STEPS, {
        onStep, onCommand,
        onOrbit: (dx, dy) => orbitCamera(dx * 0.8, dy * 0.8),
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { dirty = 3; });

    // layout sanity (console): nearest pair of tree vertices, per prime
    function minGap(L) {
        let m = Infinity;
        for (let i = 0; i < L.nodes.length; i++) for (let j = i + 1; j < L.nodes.length; j++) m = Math.min(m, V.len(V.sub(L.nodes[i].tree, L.nodes[j].tree)));
        return +m.toFixed(4);
    }
    window.viz = {
        steps, loop, advance: loop.advance,
        get state() { return { step, yaw: cam.yaw, pitch: cam.pitch, sizes: { 3: LAYERS[3].nodes.length, 5: LAYERS[5].nodes.length, 13: LAYERS[13].nodes.length } }; },
        gaps: () => ({ 3: minGap(LAYERS[3]), 5: minGap(LAYERS[5]), 13: minGap(LAYERS[13]) }),
        hover(x, y) { mouse = { x, y }; dirty = 2; },
    };
})();
