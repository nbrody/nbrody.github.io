/**
 * tree.js — the hidden tree: rational rotations acting on T₆, the tree at p = 5.
 *
 * Vertices are the reduced words W in A₅ = {1 ± 2i, 1 ± 2j, 1 ± 2k}: the
 * rotations with denominator a power of 5, up to SO₃(ℤ).  Any rational rotation
 * g acts, W·o ↦ pWord(g·W)·o, the 5-part of the quaternion g·W (Hurwitz: its
 * normalized left divisors are unique).  The picture is the ball of radius 4,
 * drawn as a disk with the powers of each prime on straight rays.
 *
 *   tree      the tree, o = SO₃(ℤ) in the middle
 *   hyp       1 + 2k (denominator 5): hyperbolic, sliding its axis by one
 *   line      3 + 2i (denominator 13): fixes the axis of 1 + 2i and spins the rest
 *   point     2 + i + j + k (denominator 7): fixes o alone (−3 is not a square mod 5)
 *   pingpong  1 + 2k and 1 + 2i play ping pong: a free group acting properly
 *   full      ⟨1 + 2i, 3 + 2j⟩: the powers of 3 + 2j fix fatter and fatter tubes
 *
 * Colours in the element steps show the displacement d(v, g·v), which is
 * g-invariant, so the picture looks the same after each move and only the
 * white tracer (the image of o) visibly travels.
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, lerp, ease } = VizKit;
    const { quatLabel, mathLabel } = View3D;
    const Q = Quat, QB = Quat.big;
    const TAU = 2 * Math.PI;
    const P = 5, D = 4;

    const STEPS = [
        { id: 'tree', caption: 'The hidden tree at \\(p = 5\\): its vertices are the rotations with denominator \\(5^n\\), up to \\(\\mathrm{SO}_3(\\mathbb Z)\\). <b>Every</b> rational rotation \\(g\\) acts, and \\(d(o, g\\cdot o)\\) is the power of 5 in its denominator.' },
        { id: 'hyp', caption: '\\(g = 1+2k\\), denominator 5, is <b>hyperbolic</b>: it slides its axis (the powers of \\(1 \\pm 2k\\)) one step. The colours show how far each vertex moves.' },
        { id: 'line', caption: '\\(g = 3+2i\\), denominator 13, fixes \\(o\\). It commutes with \\(1+2i\\), so it <b>fixes that whole axis</b> and spins the branches around it.' },
        { id: 'point', caption: '\\(g = 2+i+j+k\\), denominator 7, turns about \\((1,1,1)\\). As \\(-3\\) is not a square mod 5, it fixes <b>only</b> \\(o\\), cycling all six branches.' },
        { id: 'pingpong', caption: 'Ping pong: \\(1+2k\\) and \\(1+2i\\) each push the complement of one half-tree into another, so they generate a free group acting <b>properly</b> on \\(T_6\\): a <b>primary</b> group.' },
        { id: 'full', caption: '\\(\\langle 1+2i,\\ 3+2j\\rangle\\): the powers \\(h^4, h^{20}, h^{100}\\) of \\(h = 3+2j\\) fix fatter and fatter tubes, so they tend to 1 in \\(\\mathrm{PGL}_2(\\mathbb Q_5)\\). Not discrete at 5, nor at 13: <b>full</b>.' },
    ];

    // ── the ball of radius D ───────────────────────────────────────
    const A5 = Q.A(P);                                   // 1+2i, 1−2i, 1+2j, 1−2j, 1+2k, 1−2k
    const CYC = [0, 2, 4, 1, 3, 5];                       // letters counterclockwise from the right: +i +j +k −i −j −k
    const cpos = (g) => CYC.indexOf(g);
    const LETTER_ANGLE = A5.map((_, g) => cpos(g) * TAU / 6);
    const RADII = [0, 0.33, 0.6, 0.8, 0.935];
    const PAIR_COL = [[124, 138, 255], [124, 138, 255], [244, 114, 182], [244, 114, 182], [45, 212, 191], [45, 212, 191]];
    const GOLD = [251, 191, 36], ROSE = [244, 114, 182], WHITE = [255, 255, 255];

    const nodes = [], byKey = new Map();
    function addNode(n) {
        n.i = nodes.length; n.key = n.w.join('');
        nodes.push(n); byKey.set(n.key, n.i);
        return n;
    }
    addNode({ w: [], q: [1n, 0n, 0n, 0n], depth: 0, parent: -1, th: 0, om: TAU, letter: -1 });
    {
        let frontier = [nodes[0]];
        for (let d = 1; d <= D; d++) {
            const next = [];
            for (const v of frontier) {
                const kids = v.depth === 0
                    ? CYC.map((g) => ({ g, th: LETTER_ANGLE[g], om: TAU / 6 }))
                    // five children in cyclic order, the straight continuation in the middle
                    : [4, 5, 0, 1, 2].map((k, j) => ({ g: CYC[(cpos(v.letter) + k) % 6], th: v.th - v.om / 2 + (j + 0.5) * v.om / 5, om: v.om / 5 }));
                for (const c of kids) {
                    next.push(addNode({ w: v.w.concat(c.g), q: QB.mul(v.q, QB.from(A5[c.g])), depth: d, parent: v.i, th: c.th, om: c.om, letter: c.g }));
                }
            }
            frontier = next;
        }
    }
    const treeDist = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return a.length + b.length - 2 * k; };
    const qNum = (q) => q.map((v) => Number(v));

    /** How the rotation with quaternion gq moves every vertex of the ball. */
    function actionOf(gq) {
        const img = new Int32Array(nodes.length), disp = new Int32Array(nodes.length);
        const hasPre = new Uint8Array(nodes.length);
        let dmin = Infinity;
        for (const v of nodes) {
            const w = QB.pWord(QB.mul(gq, v.q), P);
            img[v.i] = w.length <= D ? byKey.get(w.join('')) : -1;
            disp[v.i] = treeDist(v.w, w);
            if (img[v.i] >= 0) hasPre[img[v.i]] = 1;
            dmin = Math.min(dmin, disp[v.i]);
        }
        // edges of the ball that are images of edges of the ball
        const edgeCovered = new Uint8Array(nodes.length);
        for (const v of nodes) {
            if (v.parent < 0) continue;
            const a = img[v.parent], b = img[v.i];
            if (a < 0 || b < 0) continue;
            edgeCovered[nodes[a].depth > nodes[b].depth ? a : b] = 1;
        }
        return { img, disp, dmin, hasPre, edgeCovered };
    }
    const fixedSet = (act) => nodes.filter((v) => act.disp[v.i] === 0).map((v) => v.i);

    // the elements of the story
    const EL = {
        hyp: { q: [1, 0, 0, 2] },
        line: { q: [3, 2, 0, 0] },
        point: { q: [2, 1, 1, 1] },
        g: { q: [1, 0, 0, 2] }, h: { q: [1, 2, 0, 0] },
        fullG: { q: [1, 2, 0, 0] },
    };
    for (const e of Object.values(EL)) { e.big = QB.from(e.q); e.act = actionOf(e.big); e.local = Q.localType(e.q, P); e.den = Q.rot(e.q).den; }
    // tubes: Fix(h^N) for h = 3 + 2j
    const HQ = QB.from([3, 0, 2, 0]);
    const TUBES = [1, 4, 20, 100].map((N) => ({ N, fix: new Set(fixedSet(actionOf(QB.pow(HQ, N)))) }));
    // ping pong: the orbit of o under ⟨1+2k, 1+2i⟩ = words in the letters 0, 1, 4, 5
    const PP_LETTERS = new Set([0, 1, 4, 5]);
    const inPP = (v) => v.w.every((g) => PP_LETTERS.has(g));
    const HALF = { 4: 'g⁺', 5: 'g⁻', 0: 'h⁺', 1: 'h⁻' };

    // ── state ──────────────────────────────────────────────────────
    let step = 'tree', paused = false, dirty = 3;
    const F = {
        intro: new Fader(0, 0.7), heat: new Fader(0, 0.45), labels: new Fader(1, 0.4),
        pp: new Fader(0, 0.5), full: new Fader(0, 0.5),
    };
    const morph = new Tween(0);
    let cur = null;                 // the element being applied (EL entry)
    let phase = 'idle', phaseT = 0;
    let tracers = [];               // vertex indices carrying the white ring
    let ppGrow = new Tween(0), tubeT = new Tween(0);
    let hover = null, mouse = null;

    const MORPH_STEPS = { hyp: 'hyp', line: 'line', point: 'point' };

    function onStep(id, info) {
        const inst = info.instant;
        step = id;
        cur = MORPH_STEPS[id] ? EL[MORPH_STEPS[id]] : id === 'full' ? EL.fullG : null;
        F.heat.to(MORPH_STEPS[id] || id === 'full' ? 1 : 0);
        F.pp.to(id === 'pingpong' ? 1 : 0);
        F.full.to(id === 'full' ? 1 : 0);
        F.labels.to(1);
        morph.set(0, { instant: true });
        tracers = MORPH_STEPS[id] ? [0] : [];
        phase = MORPH_STEPS[id] ? 'wait' : 'idle';
        phaseT = 1.1;
        ppGrow.set(0, { instant: true });
        if (id === 'pingpong') ppGrow.set(1, { dur: 3.2, delay: 0.4, fn: ease.linear });
        tubeT.set(0, { instant: true });
        if (id === 'full') tubeT.set(4, { dur: 5.2, delay: 0.6, fn: ease.linear });
        if (inst) {
            Object.entries(F).forEach(([k, f]) => { if (k !== 'intro') f.snap(f.target); });
            if (id === 'pingpong') ppGrow.set(1, { instant: true });
            if (id === 'full') tubeT.set(4, { instant: true });
        }
        updateCards();
        dirty = 3;
    }

    // ── cards ──────────────────────────────────────────────────────
    const readout = document.getElementById('readout'), key = document.getElementById('key');
    const kindText = (t) => t.type === 'hyp' ? `<span class="kind-hyp">hyperbolic, translation length ${t.ell}</span>`
        : t.type === 'line' ? '<span class="kind-line">elliptic, fixes a line</span>'
            : '<span class="kind-bounded">elliptic, fixes a bounded set</span>';
    function row(e, name) {
        return `<div class="r-row"><span class="r-q">${name ? name + ' = ' : ''}${Q.html(e.q)}</span><span class="r-kind">${kindText(e.local)}</span></div>` +
            `<div class="r-dim">denominator ${e.den} &nbsp;·&nbsp; moves o by ${e.local.d}</div>`;
    }
    function updateCards() {
        let r = '', k = '';
        if (MORPH_STEPS[step]) {
            const e = cur;
            r = `<div class="r-title">acting on T<sub>6</sub> &nbsp;(p = 5)</div>${row(e)}`;
            k = `<div><span class="sw" style="background: rgb(${GOLD})"></span>fixed</div>` +
                (e.local.type === 'hyp' ? `<div><span class="sw" style="background: rgb(${ROSE})"></span>the axis: moved by ${e.act.dmin}</div>` : '') +
                `<div><span class="sw" style="background: linear-gradient(90deg, rgb(125,211,252), rgb(70,82,160))"></span>moved further</div>` +
                `<div><span class="sw" style="background: #fff"></span>the image of <i>o</i></div>`;
        } else if (step === 'pingpong') {
            r = `<div class="r-title">ping pong in T<sub>6</sub></div>${row(EL.g, '<i>g</i>')}${row(EL.h, '<i>h</i>')}`;
            k = `<div><span class="sw" style="background: rgb(${ROSE})"></span>half-trees of <i>g</i><sup>±1</sup></div>` +
                `<div><span class="sw" style="background: rgb(124,138,255)"></span>half-trees of <i>h</i><sup>±1</sup></div>` +
                `<div><span class="sw" style="background: #fff"></span>the orbit ⟨<i>g</i>, <i>h</i>⟩·<i>o</i></div>`;
        } else if (step === 'full') {
            const h = { q: [3, 0, 2, 0], local: Q.localType([3, 0, 2, 0], P), den: 13 };
            r = `<div class="r-title">a full group, at p = 5</div>${row(EL.fullG, '<i>g</i>')}${row(h, '<i>h</i>')}`;
            k = `<div><span class="sw" style="background: rgb(${ROSE})"></span>the axis of <i>g</i></div>` +
                TUBES.map((t, j) => `<div><span class="sw" style="background: ${tubeCol(j, 1)}"></span>fixed by <i>h</i>${t.N > 1 ? `<sup>${t.N}</sup>` : ''}</div>`).join('');
        }
        readout.innerHTML = r; key.innerHTML = k;
        readout.classList.toggle('on', !!r); key.classList.toggle('on', !!k);
    }
    const TUBE_COLS = [[251, 191, 36], [251, 146, 60], [244, 114, 182], [192, 132, 252]];
    const tubeCol = (j, a) => `rgba(${TUBE_COLS[j]},${a})`;

    // ── drawing ────────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    let CX = 0, CY = 0, R = 1;
    const base = (i) => { const v = nodes[i]; const r = RADII[v.depth] * R; return [CX + r * Math.cos(v.th), CY - r * Math.sin(v.th)]; };
    let POS = [];
    function layout() {
        CX = cv.W / 2; CY = cv.H * 0.47;
        R = Math.min(cv.W * 0.36, (cv.H - 170) * 0.5);
        POS = nodes.map((v) => base(v.i));
    }
    function heatColor(d, dmin) {
        if (d === 0) return GOLD;
        if (d === dmin) return ROSE;
        const t = clamp((d - Math.max(1, dmin) - 1) / 4, 0, 1);
        return [Math.round(lerp(125, 58, t)), Math.round(lerp(200, 70, t)), Math.round(lerp(252, 138, t))];
    }
    const DOT = [7, 5.5, 3.6, 2.2, 1.2], EDGE_A = [0, 0.85, 0.62, 0.36, 0.15], EDGE_W = [0, 3, 2, 1.2, 0.7];
    const dotR = (v) => DOT[v.depth];
    // polar interpolation about the centre: branches swing round o instead of cutting across it
    const toPolar = (p) => [Math.hypot(p[0] - CX, p[1] - CY), Math.atan2(CY - p[1], p[0] - CX)];
    function polarLerp(p, q, t) {
        const [r0, a0] = toPolar(p), [r1, a1] = toPolar(q);
        const A0 = r0 < 1e-6 ? a1 : a0, A1 = r1 < 1e-6 ? A0 : a1;
        let da = A1 - A0;
        while (da > Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        const r = lerp(r0, r1, t), a = A0 + da * t;
        return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
    }

    function draw() {
        cv.begin();
        const intro = F.intro.v, heat = F.heat.v, pp = F.pp.v, full = F.full.v;
        const m = ease.inOut(morph.get());
        const act = cur ? cur.act : null;
        const moving = !!(act && m > 0 && MORPH_STEPS[step]);
        // where each vertex is drawn, and how visible
        const at = new Array(nodes.length), alpha = new Float32Array(nodes.length).fill(1);
        for (const v of nodes) {
            if (!moving) { at[v.i] = POS[v.i]; continue; }
            let t = act.img[v.i];
            if (t >= 0) { at[v.i] = polarLerp(POS[v.i], POS[t], m); continue; }
            // leaving the ball: collapse onto the image of the nearest ancestor that stays
            let u = v.parent;
            while (u >= 0 && act.img[u] < 0) u = nodes[u].parent;
            at[v.i] = polarLerp(POS[v.i], u >= 0 ? POS[act.img[u]] : POS[v.i], m);
            alpha[v.i] = 1 - m;
        }
        const fringe = moving ? 1 - 0.75 * Math.sin(Math.PI * m) : 1;
        const colOf = (v) => {
            const plain = v.depth === 0 ? WHITE : PAIR_COL[v.letter];
            if (!act || heat < 0.01 || !MORPH_STEPS[step]) return step === 'full' ? plain.map((c) => Math.round(c * (1 - 0.45 * full))) : plain;
            const h = heatColor(act.disp[v.i], act.dmin);
            return plain.map((c, k) => Math.round(lerp(c, h[k], heat)));
        };
        const ppDim = (v) => (pp > 0 && !inPP(v) ? 1 - 0.8 * pp : 1);
        const ppShown = (v) => ppGrow.get() * (D + 0.999) >= v.depth;

        // ping-pong half-trees: shaded sectors
        if (pp > 0.01) {
            for (const [g, col] of [[4, ROSE], [5, ROSE], [0, [124, 138, 255]], [1, [124, 138, 255]]]) {
                const v = nodes[byKey.get(String(g))];
                const a0 = v.th - v.om / 2 + 0.01, a1 = v.th + v.om / 2 - 0.01;
                ctx.fillStyle = rgba(col, 0.08 * pp * intro);
                ctx.beginPath();
                ctx.arc(CX, CY, RADII[1] * R * 0.62, -a1, -a0);
                ctx.arc(CX, CY, R * 1.04, -a0, -a1, true);
                ctx.closePath(); ctx.fill();
                const mid = v.th, lr = R * 1.1;
                ctx.globalAlpha = pp * intro;
                mathLabel(ctx, [{ t: 'U', style: 'it' }, { t: HALF[g], style: 'sub' }], CX + lr * Math.cos(mid), CY - lr * Math.sin(mid), rgba(col, 0.95), 19);
                ctx.globalAlpha = 1;
            }
        }
        // edges
        for (const v of nodes) {
            if (v.parent < 0) continue;
            const u = nodes[v.parent];
            let a = intro * EDGE_A[v.depth] * (v.depth === D ? fringe : 1);
            let col = PAIR_COL[v.letter], w = EDGE_W[v.depth];
            let hi = 0;
            if (act && heat > 0.01 && MORPH_STEPS[step]) {
                const du = act.disp[u.i], dv = act.disp[v.i];
                const hc = heatColor(Math.max(du, dv), act.dmin);
                col = col.map((c, k) => Math.round(lerp(c, hc[k], heat)));
                if (du === act.dmin && dv === act.dmin) hi = heat;
                if (moving) a *= Math.min(alpha[u.i], alpha[v.i]);
            }
            if (pp > 0.01) { a *= ppDim(v); if (inPP(v) && ppShown(v)) { hi = pp; col = col.map((c) => Math.round(lerp(c, 255, 0.35 * pp))); } }
            if (full > 0.01 && step === 'full') {
                const onAxis = v.w.every((g) => g === 0) || v.w.every((g) => g === 1);
                a *= 1 - 0.55 * full;
                if (onAxis) { hi = full; col = ROSE; a = intro; }
            }
            const A = at[u.i], B = at[v.i];
            ctx.strokeStyle = rgba(col, Math.min(1, a * (1 + 0.8 * hi)));
            ctx.lineWidth = w * (1 + 1.4 * hi);
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
        }
        // edges and vertices arriving from outside the ball sprout from their parents
        if (moving) {
            for (const v of nodes) {
                if (v.parent < 0 || act.hasPre[v.i]) continue;
                const u = nodes[v.parent];
                const from = act.hasPre[u.i] ? POS[u.i] : POS[u.i];
                const p = polarLerp(from, POS[v.i], m);
                const hc = heatColor(Math.max(act.disp[u.i], act.disp[v.i]), act.dmin);
                ctx.strokeStyle = rgba(hc, intro * m * EDGE_A[v.depth] * (v.depth === D ? fringe : 1));
                ctx.lineWidth = EDGE_W[v.depth];
                ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
                ctx.fillStyle = rgba(colOf(v), intro * m);
                ctx.beginPath(); ctx.arc(p[0], p[1], dotR(v), 0, TAU); ctx.fill();
            }
        }
        // tubes
        if (full > 0.01 && step === 'full') {
            const T = tubeT.get();
            for (let j = TUBES.length - 1; j >= 0; j--) {
                const a = clamp(T - j, 0, 1) * full * intro * [1, 0.85, 0.7, 0.55][j];
                if (a < 0.01) continue;
                const S = TUBES[j].fix;
                ctx.strokeStyle = tubeCol(j, a);
                for (const v of nodes) {
                    if (v.parent < 0 || !S.has(v.i) || !S.has(v.parent)) continue;
                    const A = POS[v.parent], B = POS[v.i];
                    ctx.lineWidth = (j === 0 ? 5 : 3) * Math.pow(0.72, v.depth - 1);
                    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
                }
                ctx.fillStyle = tubeCol(j, a);
                for (const i of S) { const p = POS[i]; ctx.beginPath(); ctx.arc(p[0], p[1], dotR(nodes[i]) + 0.8, 0, TAU); ctx.fill(); }
            }
        }
        // vertices
        for (const v of nodes) {
            let a = intro * alpha[v.i] * (v.depth === D ? fringe : 1);
            if (pp > 0.01) a *= inPP(v) && ppShown(v) ? 1 : ppDim(v);
            const col = pp > 0.01 && inPP(v) && ppShown(v) ? WHITE : colOf(v);
            const p = at[v.i];
            ctx.fillStyle = rgba(col, a);
            ctx.beginPath(); ctx.arc(p[0], p[1], dotR(v), 0, TAU); ctx.fill();
        }
        // tracers (the image of o)
        for (const t of tracers) {
            const p = at[t];
            ctx.strokeStyle = `rgba(255,255,255,${0.95 * intro * alpha[t]})`;
            ctx.lineWidth = 2.4;
            ctx.beginPath(); ctx.arc(p[0], p[1], dotR(nodes[t]) + 6, 0, TAU); ctx.stroke();
        }
        // labels
        const la = F.labels.v * intro;
        if (la > 0.02) {
            const oP = at[0];
            mathLabel(ctx, [{ t: 'o', style: 'it' }], oP[0] - 15, oP[1] - 15, `rgba(255,255,255,${la})`, 22);
            for (const v of nodes) {
                if (v.depth !== 1) continue;
                const p = at[v.i], r = 30;
                const dimmed = (pp > 0.01 && !inPP(v)) || (step === 'full' && !(v.letter === 0 || v.letter === 1 || v.letter === 2 || v.letter === 3));
                const aa = la * alpha[v.i] * (dimmed ? 0.45 : 1);
                quatLabel(ctx, A5[v.letter], p[0] + r * Math.cos(v.th) * 0.9, p[1] - r * Math.sin(v.th) * 0.9 - 4, `rgba(232,236,247,${aa})`, 18);
            }
        }
    }

    // ── hover: the rotation at a vertex ────────────────────────────
    const tip = document.getElementById('tip');
    function updateHover() {
        if (!mouse) { if (hover != null) { hover = null; tip.classList.remove('on'); } return; }
        let best = -1, bd = 12 * 12;
        for (const v of nodes) {
            const p = POS[v.i], d = (p[0] - mouse.x) ** 2 + (p[1] - mouse.y) ** 2;
            if (d < bd) { bd = d; best = v.i; }
        }
        if (best < 0 || morph.moving) { if (hover != null) { hover = null; tip.classList.remove('on'); } return; }
        if (hover !== best) {
            hover = best;
            const v = nodes[best];
            const word = v.w.length ? v.w.map((g) => `(${Q.html(A5[g])})`).join('') : '1 &nbsp;(the vertex <i>o</i> = SO<sub>3</sub>(ℤ))';
            let html = `<div class="t-word">${word}</div>`;
            if (v.depth > 1) html += `<div class="t-val">= ${Q.html(qNum(v.q))}</div>`;
            if (v.depth > 0) html += `<div class="t-dim">rotation with denominator 5${v.depth > 1 ? `<sup>${v.depth}</sup>` : ''}</div>`;
            if (cur && MORPH_STEPS[step]) html += `<div class="t-dim">moved by ${cur.act.disp[best]} by <i>g</i></div>`;
            tip.innerHTML = html;
        }
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let x = mouse.x + 16, y = mouse.y - th - 12;
        if (x + tw > cv.W - 10) x = mouse.x - tw - 16;
        if (y < 10) y = mouse.y + 16;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
        tip.classList.add('on');
    }
    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointermove', (e) => { mouse = { x: e.clientX, y: e.clientY }; dirty = 2; });
    stageEl.addEventListener('pointerleave', () => { mouse = null; dirty = 2; });

    function onCommand(cmd) {
        if (cmd === 'toggle' || cmd === 'play' || cmd === 'pause') paused = cmd === 'pause' ? true : cmd === 'play' ? false : !paused;
        else if (cmd === 'reset') onStep(step, { instant: false });
        dirty = 3;
    }

    // ── the loop ───────────────────────────────────────────────────
    function frame(dt) {
        if (cv.resize()) { layout(); dirty = 3; }
        F.intro.to(1);
        let moving = false;
        for (const f of Object.values(F)) { f.step(dt); moving = moving || f.moving; }
        for (const t of [morph, ppGrow, tubeT]) { t.get(); moving = moving || t.moving; }
        if (MORPH_STEPS[step] && !paused) {
            if (phase === 'wait') {
                phaseT -= dt;
                if (phaseT <= 0) { phase = 'morph'; morph.set(0, { instant: true }); morph.set(1, { dur: 1.7 }); }
            } else if (phase === 'morph' && !morph.moving) {
                const act = cur.act;
                tracers = tracers.map((t) => act.img[t]).filter((t) => t >= 0);
                if (!tracers.length) tracers = [0];
                morph.set(0, { instant: true });
                phase = 'wait'; phaseT = 1.3;
            }
            moving = true;
        }
        if (moving) dirty = 2;
        if (dirty > 0) { draw(); updateHover(); dirty--; }
    }

    layout();
    const loop = VizKit.startLoop(frame);
    const steps = VizKit.setup(STEPS, {
        onStep, onCommand,
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); layout(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { dirty = 3; });

    // checks (console): every vertex word is its own normal form; the facts in the captions
    function checks() {
        const selfOK = nodes.every((v) => QB.pWord(v.q, P).join('') === v.key);
        const axisK = nodes.filter((v) => v.w.length && (v.w.every((g) => g === 4) || v.w.every((g) => g === 5))).map((v) => v.i);
        const hypOK = EL.hyp.act.dmin === 1 && axisK.every((i) => EL.hyp.act.disp[i] === 1);
        const lineFix = fixedSet(EL.line.act);
        const axisI = nodes.filter((v) => v.w.every((g) => g === 0) || v.w.every((g) => g === 1)).map((v) => v.i);
        const lineOK = lineFix.length === axisI.length && axisI.every((i) => EL.line.act.disp[i] === 0);
        const pointOK = fixedSet(EL.point.act).length === 1 && EL.point.act.disp[0] === 0;
        const tubes = TUBES.map((t) => t.fix.size);
        return { vertices: nodes.length, selfOK, hypOK, lineOK, pointOK, tubes };
    }
    window.viz = {
        steps, loop, advance: loop.advance, checks,
        get state() { return { step, phase, tracers, paused }; },
        hover(x, y) { mouse = { x, y }; dirty = 2; },
    };
})();
