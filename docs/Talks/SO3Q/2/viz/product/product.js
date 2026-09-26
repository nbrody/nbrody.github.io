/**
 * product.js — metacommutation assembles SO₃(ℚ) into a product of trees.
 *
 *   square    (1+i+j)(1+2i) = −(1+2k)(1−i+j): one metacommutation square
 *   sort      a staircase word in A₃ ∪ A₅, sorted one square at a time into
 *             (5-word)·(3-word); the whole 3×3 grid is a flat
 *   product   T₄ × T₆ (a 4-dimensional picture, projected), with that flat
 *   cube      three primes 3, 5, 7: a cube whose faces are squares
 *   infinite  one more tree direction for every odd prime
 *
 * All labels are computed with Quat.metacommute (Hurwitz's theorem): given
 * π ∈ A_p, σ ∈ A_q there are unique σ' ∈ A_q, π' ∈ A_p with πσ = ±σ'π'.
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, lerp, ease } = VizKit;
    const { Camera, DrawList, V, quatLabel, mathLabel } = View3D;
    const Q = Quat;
    const TAU = 2 * Math.PI;

    const STEPS = [
        { id: 'square', caption: 'Primes don’t commute &mdash; they <b>metacommute</b>. By Hurwitz’s theorem, \\((1+i+j)(1+2i)\\) has a unique left factor of norm 5 in \\(A_5\\), giving a square.' },
        { id: 'sort', caption: 'So any word in \\(A_3 \\cup A_5\\) can be sorted, one square at a time: every rotation with denominator \\(3^a 5^b\\) is uniquely a 5-word times a 3-word.' },
        { id: 'product', caption: 'The squares assemble into a <b>product of trees</b> \\(T_4 \\times T_6\\) (a 4-dimensional picture, projected); the grid we just sorted is a flat inside it.' },
        { id: 'cube', caption: 'Three primes give cubes: every face is a metacommutation square (here \\(p = 3, 5, 7\\)).' },
        { id: 'infinite', caption: 'And one more tree for every odd prime: \\(\\mathrm{SO}_3(\\mathbb Q)\\) acts on the infinite-dimensional product \\(\\prod′_{p\\ \\mathrm{odd}}\\, T_{p+1}\\).' },
    ];

    const A3 = Q.A(3), A5 = Q.A(5), A7 = Q.A(7);
    const COL3 = [[251, 191, 36], [251, 191, 36], [125, 211, 252], [125, 211, 252]];
    const COL5 = [[124, 138, 255], [124, 138, 255], [244, 114, 182], [244, 114, 182], [45, 212, 191], [45, 212, 191]];
    const COL7 = [[192, 132, 252], [192, 132, 252], [163, 230, 53], [163, 230, 53], [251, 146, 60], [251, 146, 60], [52, 211, 153], [52, 211, 153]];
    function colOf(q) {
        const n = Q.norm(q);
        const [S, C] = n === 3 ? [A3, COL3] : n === 5 ? [A5, COL5] : [A7, COL7];
        return C[Q.indexIn(S, q)];
    }
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    // ── the sorting grid: h[x][y] ∈ A₅ (east), v[x][y] ∈ A₃ (north) ──
    const N = 3;
    const STAIR = [[0, 0], [0, 2], [2, 4]];       // (A₃, A₅) indices: (1+i+j)(1+2i)(1+i+j)(1+2j)(1+i−j)(1+2k)
    const GRID = (function fill() {
        const h = Array.from({ length: N }, () => Array(N + 1).fill(null));
        const v = Array.from({ length: N + 1 }, () => Array(N).fill(null));
        for (let t = 0; t < N; t++) { v[t][t] = STAIR[t][0]; h[t][t + 1] = STAIR[t][1]; }
        let changed = true;
        while (changed) {
            changed = false;
            for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
                const L = v[x][y], T = h[x][y + 1], B = h[x][y], R = v[x + 1][y];
                if (L !== null && T !== null && (B === null || R === null)) {
                    const m = Q.metacommute(A3[L], A5[T]);
                    h[x][y] = Q.indexIn(A5, m.s2); v[x + 1][y] = Q.indexIn(A3, m.p2); changed = true;
                } else if (B !== null && R !== null && (L === null || T === null)) {
                    const m = Q.metacommute(A5[B], A3[R]);
                    v[x][y] = Q.indexIn(A3, m.s2); h[x][y + 1] = Q.indexIn(A5, m.p2); changed = true;
                }
            }
        }
        return { h, v };
    })();
    /** Flip the first "north then east" corner until the path is east…east north…north. */
    const FLIPS = (function () {
        const moves = [];
        for (let t = 0; t < N; t++) moves.push('N', 'E');
        const flips = [];
        let sign = 1;
        for (;;) {
            let k = -1;
            for (let i = 0; i + 1 < moves.length; i++) if (moves[i] === 'N' && moves[i + 1] === 'E') { k = i; break; }
            if (k < 0) break;
            let x = 0, y = 0;
            for (let i = 0; i < k; i++) (moves[i] === 'E' ? x++ : y++);
            const m = Q.metacommute(A3[GRID.v[x][y]], A5[GRID.h[x][y + 1]]);
            sign *= m.sign;
            const before = moves.slice();
            moves[k] = 'E'; moves[k + 1] = 'N';
            flips.push({ cell: [x, y], k, before, after: moves.slice(), sign });
        }
        return flips;
    })();
    const START_MOVES = FLIPS[0].before;
    function pathLabels(moves) {
        let x = 0, y = 0;
        return moves.map((mv) => {
            const e = mv === 'E' ? { from: [x, y], to: [x + 1, y], q: A5[GRID.h[x][y]] } : { from: [x, y], to: [x, y + 1], q: A3[GRID.v[x][y]] };
            if (mv === 'E') x++; else y++;
            return e;
        });
    }

    // ── the product T₄ × T₆ (balls of radius 2, plus the flat's words) ──
    function treeWith(Ap, depth, word) {
        const t = Q.tree(Ap, depth);
        const nodes = t.nodes;
        let cur = 0;
        const path = [0];
        word.forEach((g, i) => {
            let nx = nodes.findIndex((n) => n.parent === cur && n.gen === g);
            if (nx < 0) {
                const p = nodes[cur];
                nodes.push({ q: Q.mul(p.q, Ap[g]), gen: g, parent: cur, depth: p.depth + 1, word: p.word.concat(g) });
                nx = nodes.length - 1;
            }
            cur = nx; path.push(cur);
        });
        return { nodes, path };
    }
    const LEFT_WORD = [0, 1, 2].map((y) => GRID.v[0][y]);          // T₄ coordinate of the flat
    const BOTTOM_WORD = [0, 1, 2].map((x) => GRID.h[x][0]);        // T₆ coordinate of the flat
    const T4 = treeWith(A3, 2, LEFT_WORD), T6 = treeWith(A5, 1, BOTTOM_WORD);
    (function layout() {
        for (const n of T4.nodes) {
            if (n.parent < 0) { n.p2 = [0, 0]; continue; }
            const a = A3[n.gen], d = [a[1], a[2]], l = Math.hypot(d[0], d[1]);
            const L = 1.3 * Math.pow(0.5, n.depth - 1);
            n.p2 = [T4.nodes[n.parent].p2[0] + d[0] / l * L, T4.nodes[n.parent].p2[1] + d[1] / l * L];
        }
        for (const n of T6.nodes) {
            if (n.parent < 0) { n.p2 = [0, 0]; continue; }
            const th = (n.gen >> 1) * Math.PI / 3 + (n.gen & 1) * Math.PI + Math.PI / 2;
            const L = 1.35 * Math.pow(0.55, n.depth - 1);
            n.p2 = [T6.nodes[n.parent].p2[0] + Math.cos(th) * L, T6.nodes[n.parent].p2[1] + Math.sin(th) * L];
        }
    })();
    const FLAT4 = new Set(T4.path), FLAT6 = new Set(T6.path);

    // ── the cube for 3, 5, 7 ──
    const CUBE = (function () {
        // edge label maps keyed "dir:x,y,z" (the edge from (x,y,z) in direction dir)
        const L = new Map();
        const k = (d, p) => d + ':' + p.join(',');
        L.set(k(0, [0, 0, 0]), A3[0]);             // π = 1 + i + j   along x
        L.set(k(1, [1, 0, 0]), A5[0]);             // σ = 1 + 2i      along y
        L.set(k(2, [1, 1, 0]), A7[0]);             // τ = 1+i+j+2k    along z
        const step = (p, d) => p.map((v, i) => v + (i === d ? 1 : 0));
        let changed = true;
        while (changed) {
            changed = false;
            for (const [d1, d2] of [[0, 1], [0, 2], [1, 2]]) {
                for (const b of [[0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]]) {
                    if (b[d1] || b[d2]) continue;
                    const e1 = k(d1, b), e2 = k(d2, step(b, d1)), e3 = k(d2, b), e4 = k(d1, step(b, d2));
                    // path d1 then d2  ==  path d2 then d1
                    if (L.has(e1) && L.has(e2) && !(L.has(e3) && L.has(e4))) {
                        const m = Q.metacommute(L.get(e1), L.get(e2)); L.set(e3, m.s2); L.set(e4, m.p2); changed = true;
                    } else if (L.has(e3) && L.has(e4) && !(L.has(e1) && L.has(e2))) {
                        const m = Q.metacommute(L.get(e3), L.get(e4)); L.set(e1, m.s2); L.set(e2, m.p2); changed = true;
                    }
                }
            }
        }
        const edges = [];
        for (const [key, q] of L) {
            const [d, rest] = key.split(':');
            const p = rest.split(',').map(Number);
            edges.push({ d: +d, from: p, to: step(p, +d), q });
        }
        return edges;
    })();
    const EXTRA = [11, 13, 17, 19, 23, 29, 31, 37].map((p) => ({ p, q: Q.A(p)[0] }));
    const EXTRA_DIRS = (function () {
        const out = [], M = 300, gold = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < M && out.length < EXTRA.length; i++) {
            const y = 1 - (i + 0.5) / M * 2, r = Math.sqrt(1 - y * y), t = gold * i;
            const d = [Math.cos(t) * r, Math.sin(t) * r, y];
            if (d[0] + d[1] + d[2] > -0.35) continue;                               // point away from the cube
            if (out.some((e) => V.dot(e, d) > 0.8)) continue;
            out.push(d);
        }
        return out;
    })();

    // ── state ──────────────────────────────────────────────────────
    const cam = new Camera({ yaw: 0.6, pitch: 0.3, focal: 14 });
    const camYaw = new Tween(0.6), camPitch = new Tween(0.3);
    const G = { cx: new Tween(0.5), cy: new Tween(0.5), s: new Tween(1) };         // the 2D grid view
    const F = {
        grid2d: new Fader(1, 0.4), prod: new Fader(0, 0.5), cube: new Fader(0, 0.5), extra: new Fader(0, 0.6),
        word: new Fader(0, 0.4), intro: new Fader(0, 0.8),
    };
    let step = 'square', stepT = 0, paused = false, drag = null, dirty = 3, spin = true, t4d = 0;

    const nearAngle = (target, cur) => target + TAU * Math.round((cur - target) / TAU);
    const SORT_T0 = 1.0, FLIP_DUR = 1.0, FLIP_GAP = 0.5;
    const SORT_END = SORT_T0 + FLIPS.length * (FLIP_DUR + FLIP_GAP);

    function onStep(id, info) {
        const inst = info.instant;
        const order = STEPS.map((s) => s.id);
        const back = info.prev && order.indexOf(info.prev) > order.indexOf(id);
        step = id;
        stepT = back || inst ? 1e3 : 0;
        const set = (tw, v, o = {}) => tw.set(v, Object.assign({ instant: inst }, o));
        F.grid2d.to(id === 'square' || id === 'sort' ? 1 : 0);
        F.prod.to(id === 'product' ? 1 : 0);
        F.cube.to(id === 'cube' || id === 'infinite' ? 1 : 0);
        F.extra.to(id === 'infinite' ? 1 : 0);
        if (id === 'square') { set(G.cx, 0.5, { dur: 1.2 }); set(G.cy, 0.5, { dur: 1.2 }); set(G.s, 2.15, { dur: 1.2 }); }
        else { set(G.cx, N / 2, { dur: 1.4 }); set(G.cy, N / 2, { dur: 1.4 }); set(G.s, 1, { dur: 1.4 }); }
        const view = { product: [0.55, 0.3], cube: [0.72, 0.42], infinite: [0.72, 0.36] }[id];
        if (view) { set(camYaw, nearAngle(view[0], camYaw.get()), { dur: 1.6 }); set(camPitch, view[1], { dur: 1.6 }); }
        spin = id === 'product' || id === 'cube' || id === 'infinite';
        document.body.classList.toggle('orbitable', spin);
        if (inst) Object.entries(F).forEach(([k, f]) => { if (k !== 'intro') f.snap(f.target); });
        dirty = 3;
    }

    // ── the word card ──────────────────────────────────────────────
    const wordEl = document.getElementById('word');
    const qspan = (q) => { const c = colOf(q); return `<span style="color: rgb(${c})">(${Q.html(q)})</span>`; };
    let wordKey = '';
    function updateWord() {
        let html = '';
        if (step === 'square') {
            const m = Q.metacommute(A3[0], A5[0]);
            const t = stepT;
            html = `<div class="w-q">${qspan(A3[0])}${qspan(A5[0])}` +
                (t > 1.4 ? ` = ${Q.html(m.product)}` : '') +
                (t > 2.7 ? ` = ${m.sign < 0 ? '−' : ''}${qspan(m.s2)}${qspan(m.p2)}` : '') + '</div>';
        } else if (step === 'sort') {
            const { moves, done, sign } = sortState();
            const labels = pathLabels(moves);
            const east = labels.filter((e) => Q.norm(e.q) === 5), north = labels.filter((e) => Q.norm(e.q) === 3);
            const sorted = done === FLIPS.length;
            html = `<div class="w-lab">${sorted ? 'normal form: a 5-word times a 3-word' : 'the word along the path'}</div>` +
                `<div class="w-q">${sign < 0 ? '− ' : ''}${sorted ? east.map((e) => qspan(e.q)).join('') + ' · ' + north.map((e) => qspan(e.q)).join('') : labels.map((e) => qspan(e.q)).join('')}</div>` +
                `<div class="w-count">${done} of ${FLIPS.length} metacommutations</div>`;
        }
        if (html !== wordKey) { wordEl.innerHTML = html; wordKey = html; }
        wordEl.classList.toggle('on', !!html);
    }

    /** The sorting animation at time stepT: moves, completed flips, the flip in progress. */
    function sortState() {
        const t = stepT - SORT_T0;
        if (t < 0) return { moves: START_MOVES, done: 0, sign: 1, active: null };
        const i = Math.min(FLIPS.length, Math.floor(t / (FLIP_DUR + FLIP_GAP)));
        if (i >= FLIPS.length) return { moves: FLIPS[FLIPS.length - 1].after, done: FLIPS.length, sign: FLIPS[FLIPS.length - 1].sign, active: null };
        const f = t - i * (FLIP_DUR + FLIP_GAP);
        const fl = FLIPS[i];
        if (f >= FLIP_DUR) return { moves: fl.after, done: i + 1, sign: fl.sign, active: null };
        return { moves: fl.before, done: i, sign: i ? FLIPS[i - 1].sign : 1, active: { flip: fl, u: ease.inOut(f / FLIP_DUR) } };
    }

    // ── canvas ─────────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    const dl = new DrawList();

    function draw2D(alpha) {
        const W = cv.W, H = cv.H;
        const S = Math.min(W, H - 230) * 0.19 * G.s.get();
        const cx = G.cx.get(), cy = G.cy.get();
        const X = (x) => W / 2 + (x - cx) * S, Y = (y) => H * 0.5 - (y - cy) * S;
        const P = ([x, y]) => [X(x), Y(y)];
        ctx.lineCap = 'round';
        const sq = step === 'square';
        const st = sortState();
        // faint grid
        if (!sq || G.s.v < 2) {
            const a = alpha * (sq ? 0.3 : 1);
            ctx.strokeStyle = `rgba(150,165,215,${0.14 * a})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i <= N; i++) { ctx.moveTo(X(i), Y(0)); ctx.lineTo(X(i), Y(N)); ctx.moveTo(X(0), Y(i)); ctx.lineTo(X(N), Y(i)); }
            ctx.stroke();
        }
        const edge = (e, a, prog = 1) => {
            const [x0, y0] = P(e.from), [x1, y1] = P(e.to);
            ctx.strokeStyle = rgba(colOf(e.q), a);
            ctx.lineWidth = Math.max(3, S * 0.035);
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * prog, y0 + (y1 - y0) * prog); ctx.stroke();
        };
        const edgeLabel = (e, a, side = 1) => {
            const [x0, y0] = P(e.from), [x1, y1] = P(e.to);
            const horiz = y0 === y1;
            const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
            const off = S * 0.13 + 8;
            const size = Math.max(16, Math.min(26, S * 0.14));
            quatLabel(ctx, e.q, mx + (horiz ? 0 : side * off * 1.25), my + (horiz ? side * off * 0.8 : 0), rgba(colOf(e.q).map((c) => Math.min(255, c + 40)), a), size);
        };
        const dot = ([x, y], a, r = 5) => { ctx.fillStyle = `rgba(232,236,247,${a})`; ctx.beginPath(); ctx.arc(X(x), Y(y), r, 0, TAU); ctx.fill(); };

        if (sq) {
            const t = stepT;
            const m = Q.metacommute(A3[0], A5[0]);
            const left = { from: [0, 0], to: [0, 1], q: A3[0] }, top = { from: [0, 1], to: [1, 1], q: A5[0] };
            const bottom = { from: [0, 0], to: [1, 0], q: m.s2 }, right = { from: [1, 0], to: [1, 1], q: m.p2 };
            const pr = (t0) => clamp((t - t0) / 0.55, 0, 1);
            const fillA = clamp((t - 2.7) / 0.6, 0, 1);
            if (fillA > 0) { ctx.fillStyle = `rgba(251,191,36,${0.1 * fillA * alpha})`; ctx.fillRect(X(0), Y(1), S, S); }
            edge(left, alpha, pr(0.3)); edge(top, alpha, pr(0.85));
            edge(bottom, alpha, pr(1.6)); edge(right, alpha, pr(2.15));
            if (pr(0.3) > 0.5) edgeLabel(left, alpha, -1);
            if (pr(0.85) > 0.5) edgeLabel(top, alpha, -1);
            if (pr(1.6) > 0.5) edgeLabel(bottom, alpha, 1);
            if (pr(2.15) > 0.5) edgeLabel(right, alpha, 1);
            dot([0, 0], alpha, 6);
            const cs = Math.max(13, Math.min(18, S * 0.08));
            mathLabel(ctx, [{ t: '1', style: 'rm' }], X(0) - 16, Y(0) + 16, `rgba(232,236,247,${alpha})`, cs + 4);
            if (pr(0.3) >= 1) { dot([0, 1], alpha); }
            if (pr(0.85) >= 1) { dot([1, 1], alpha, 6); quatLabel(ctx, m.product, X(1) + 14, Y(1) - 18, `rgba(251,191,36,${alpha})`, cs + 2, 'left'); }
            if (pr(1.6) >= 1) dot([1, 0], alpha);
            return;
        }

        // sorting: flipped cells, the path, the flip in progress
        const doneCells = FLIPS.slice(0, st.done).map((f) => f.cell);
        for (const [x, y] of doneCells) { ctx.fillStyle = `rgba(251,191,36,${0.07 * alpha})`; ctx.fillRect(X(x), Y(y + 1), S, S); }
        const labels = pathLabels(st.moves);
        let skip = -1;
        if (st.active) {
            const { flip, u } = st.active;
            const [x, y] = flip.cell;
            ctx.fillStyle = `rgba(251,191,36,${(0.1 + 0.18 * Math.sin(Math.PI * u)) * alpha})`;
            ctx.fillRect(X(x), Y(y + 1), S, S);
            skip = flip.k;
            // the corner slides from (x, y+1) to (x+1, y)
            const mid = [x + u, y + 1 - u];
            const oldN = labels[flip.k], oldE = labels[flip.k + 1];
            const newE = { from: [x, y], to: [x + 1, y], q: A5[GRID.h[x][y]] }, newN = { from: [x + 1, y], to: [x + 1, y + 1], q: A3[GRID.v[x + 1][y]] };
            const segA = { from: [x, y], to: mid, q: u < 0.5 ? oldN.q : newE.q }, segB = { from: mid, to: [x + 1, y + 1], q: u < 0.5 ? oldE.q : newN.q };
            edge(segA, alpha); edge(segB, alpha);
            const la = Math.abs(1 - 2 * u);
            if (u < 0.5) { edgeLabel(oldN, alpha * la, -1); edgeLabel(oldE, alpha * la, -1); }
            else { edgeLabel(newE, alpha * la, 1); edgeLabel(newN, alpha * la, 1); }
            dot(mid, alpha);
        }
        labels.forEach((e, i) => {
            if (skip >= 0 && (i === skip || i === skip + 1)) return;
            edge(e, alpha);
            const side = e.to[0] - e.from[0] ? (e.from[1] === 0 ? 1 : -1) : (e.from[0] === N ? 1 : -1);
            edgeLabel(e, alpha, side);
        });
        // path vertices
        let x = 0, y = 0;
        dot([0, 0], alpha, 6);
        st.moves.forEach((mv, i) => {
            if (mv === 'E') x++; else y++;
            if (skip >= 0 && i === skip) return;
            dot([x, y], alpha, i === st.moves.length - 1 ? 6 : 4.5);
        });
        mathLabel(ctx, [{ t: '1', style: 'rm' }], X(0) - 16, Y(0) + 16, `rgba(232,236,247,${alpha})`, 20);
    }

    function prodPoint(u, v) {
        const a = T4.nodes[u].p2, b = T6.nodes[v].p2;
        const al = t4d * 0.07, be = -t4d * 0.05;
        const ax = a[0] * Math.cos(al) - a[1] * Math.sin(al), ay = a[0] * Math.sin(al) + a[1] * Math.cos(al);
        const bx = b[0] * Math.cos(be) - b[1] * Math.sin(be), by = b[0] * Math.sin(be) + b[1] * Math.cos(be);
        const tl = 0.5 + 0.18 * Math.sin(t4d * 0.13);
        const ct = Math.cos(tl), st = Math.sin(tl);
        return [ax * ct - bx * st, ax * st + bx * ct, 0.7 * (ay + by)];
    }

    function drawProduct(alpha) {
        const n4 = T4.nodes.length, n6 = T6.nodes.length;
        const P = [];
        for (let u = 0; u < n4; u++) { P.push([]); for (let v = 0; v < n6; v++) P[u].push(cam.proj(prodPoint(u, v))); }
        const e4 = T4.nodes.map((n, i) => [n.parent, i]).filter(([p]) => p >= 0);
        const e6 = T6.nodes.map((n, i) => [n.parent, i]).filter(([p]) => p >= 0);
        const inFlat4 = (a, b) => FLAT4.has(a) && FLAT4.has(b), inFlat6 = (a, b) => FLAT6.has(a) && FLAT6.has(b);
        // squares
        for (const [a, b] of e4) for (const [c, d] of e6) {
            const q = [P[a][c], P[b][c], P[b][d], P[a][d]];
            const flat = inFlat4(a, b) && inFlat6(c, d);
            dl.add((q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 - 0.02, () => {
                ctx.fillStyle = flat ? `rgba(251,191,36,${0.3 * alpha})` : `rgba(190,200,255,${0.06 * alpha})`;
                ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
            });
        }
        // T₄ edges (one copy through every vertex of T₆), T₆ edges likewise
        for (const [a, b] of e4) for (let v = 0; v < n6; v++) {
            const A = P[a][v], B = P[b][v], flat = inFlat4(a, b) && FLAT6.has(v);
            const col = COL3[T4.nodes[b].gen];
            dl.add((A[2] + B[2]) / 2, () => {
                ctx.strokeStyle = rgba(flat ? [255, 214, 102] : col, (flat ? 0.95 : 0.32) * alpha);
                ctx.lineWidth = flat ? 2.6 : 1.1;
                ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
            });
        }
        for (const [c, d] of e6) for (let u = 0; u < n4; u++) {
            const A = P[u][c], B = P[u][d], flat = inFlat6(c, d) && FLAT4.has(u);
            const col = COL5[T6.nodes[d].gen];
            dl.add((A[2] + B[2]) / 2, () => {
                ctx.strokeStyle = rgba(flat ? [255, 214, 102] : col, (flat ? 0.95 : 0.32) * alpha);
                ctx.lineWidth = flat ? 2.6 : 1.1;
                ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
            });
        }
        // the two trees through the base vertex, labelled
        const lastL = T4.path[T4.path.length - 1], lastB = T6.path[T6.path.length - 1];
        const L4 = P[lastL][0], L6 = P[0][lastB], O = P[0][0];
        dl.add(10, () => {
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.beginPath(); ctx.arc(O[0], O[1], 6, 0, TAU); ctx.fill();
            mathLabel(ctx, [{ t: 'T', style: 'it' }, { t: '4', style: 'sub' }, { t: '  (p = 3)', style: 'rm' }], L4[0], L4[1] - 22, `rgba(251,191,36,${alpha})`, 20);
            mathLabel(ctx, [{ t: 'T', style: 'it' }, { t: '6', style: 'sub' }, { t: '  (p = 5)', style: 'rm' }], L6[0], L6[1] - 22, `rgba(160,172,255,${alpha})`, 20);
        });
    }

    function drawCube(alpha, extra, extraAlpha = alpha) {
        const SZ = 2.5;
        const W3 = (p) => p.map((v) => (v - 0.5) * SZ);
        const C = cam.proj([0, 0, 0]);
        // faces, very faint
        const faces = [[0, [0, 0, 0]], [0, [1, 0, 0]], [1, [0, 0, 0]], [1, [0, 1, 0]], [2, [0, 0, 0]], [2, [0, 0, 1]]];
        const fCorners = (axis, base) => {
            const d = [0, 1, 2].filter((i) => i !== axis);
            return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, t]) => { const p = base.slice(); p[d[0]] += s; p[d[1]] += t; return cam.proj(W3(p)); });
        };
        for (const [axis, base] of faces) {
            const q = fCorners(axis, base);
            dl.add((q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4 - 0.05, () => {
                ctx.fillStyle = `rgba(190,200,255,${0.05 * alpha})`;
                ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.fill();
            });
        }
        for (const e of CUBE) {
            const A = cam.proj(W3(e.from)), B = cam.proj(W3(e.to));
            const col = colOf(e.q);
            const mid = V.lerp(W3(e.from), W3(e.to), 0.5);
            const out = V.norm(V.sub(mid, [0, 0, 0]));
            const Lp = cam.proj(V.add(mid, V.scale(out, 0.42)));
            dl.add((A[2] + B[2]) / 2, () => {
                ctx.strokeStyle = rgba(col, 0.95 * alpha);
                ctx.lineWidth = 3.4;
                ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
                // an arrowhead at the middle, pointing along the edge
                const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
                const mx = (A[0] + B[0]) / 2 + ux * 6, my = (A[1] + B[1]) / 2 + uy * 6;
                ctx.fillStyle = rgba(col, alpha);
                ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - ux * 12 - uy * 6, my - uy * 12 + ux * 6); ctx.lineTo(mx - ux * 12 + uy * 6, my - uy * 12 - ux * 6); ctx.closePath(); ctx.fill();
            });
            dl.add(Lp[2] + 5, () => quatLabel(ctx, e.q, Lp[0], Lp[1], rgba(col.map((c) => Math.min(255, c + 45)), alpha), 16));
        }
        const O = cam.proj(W3([0, 0, 0]));
        dl.add(O[2] + 6, () => {
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.beginPath(); ctx.arc(O[0], O[1], 6, 0, TAU); ctx.fill();
            mathLabel(ctx, [{ t: '1', style: 'rm' }], O[0] - 14, O[1] + 14, `rgba(232,236,247,${alpha})`, 20);
        });
        if (extra > 0.01) {
            const o = W3([0, 0, 0]);
            EXTRA.forEach((x, i) => {
                const g = clamp(extra * (EXTRA.length + 2) / 3 - i * 0.35, 0, 1);
                if (g <= 0) return;
                const d = EXTRA_DIRS[i], len = 1.9 * ease.out(g);
                const end = V.add(o, V.scale(d, len));
                const A = cam.proj(o), B = cam.proj(end), T = cam.proj(V.add(o, V.scale(d, len + 0.55)));
                const col = [[125, 211, 252], [244, 114, 182], [52, 211, 153], [251, 146, 60], [192, 132, 252], [250, 204, 21], [163, 230, 53], [124, 138, 255]][i];
                dl.add((A[2] + B[2]) / 2, () => {
                    const gr = ctx.createLinearGradient(A[0], A[1], B[0], B[1]);
                    gr.addColorStop(0, rgba(col, 0.95 * g * extraAlpha)); gr.addColorStop(1, rgba(col, 0.2 * g * extraAlpha));
                    ctx.strokeStyle = gr; ctx.lineWidth = 2.6;
                    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
                });
                dl.add(T[2] + 5, () => mathLabel(ctx, [{ t: 'T', style: 'it' }, { t: String(x.p + 1), style: 'sub' }], T[0], T[1], rgba(col, g * extraAlpha), 21));
            });
        }
    }

    function draw() {
        cv.begin();
        const W = cv.W, H = cv.H, intro = F.intro.v;
        if (F.grid2d.v > 0.01) draw2D(F.grid2d.v * intro);
        cam.setup(W / 2, H * 0.47, Math.min(W, H - 120) * (step === 'product' ? 0.24 : 0.2));
        if (F.prod.v > 0.01) drawProduct(F.prod.v * intro);
        if (F.cube.v > 0.01) drawCube(F.cube.v * intro * (1 - 0.45 * F.extra.v), F.extra.v, F.cube.v * intro);
        dl.run();
    }

    // ── pointer: orbit in the 3D steps ─────────────────────────────
    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointerdown', (e) => {
        if (!spin) return;
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
        camYaw.set(camYaw.get() - dx * 0.006, { instant: true });
        camPitch.set(clamp(camPitch.get() + dy * 0.005, -1.4, 1.4), { instant: true });
        dirty = 3;
    }
    function onCommand(cmd) {
        if (cmd === 'toggle' || cmd === 'play' || cmd === 'pause') paused = cmd === 'pause' ? true : cmd === 'play' ? false : !paused;
        else if (cmd === 'reset') stepT = 0;
        dirty = 3;
    }

    function frame(dt) {
        if (cv.resize()) dirty = 3;
        F.intro.to(1);
        let moving = false;
        for (const f of Object.values(F)) { f.step(dt); moving = moving || f.moving; }
        for (const t of [camYaw, camPitch, G.cx, G.cy, G.s]) { t.get(); moving = moving || t.moving; }
        if (!paused) {
            if ((step === 'square' && stepT < 4) || (step === 'sort' && stepT < SORT_END + 0.5)) { stepT += dt; moving = true; }
            if (spin && !drag) {
                t4d += dt;
                if (!camYaw.moving) camYaw.set(camYaw.get() + dt * 0.06, { instant: true });
                moving = true;
            }
        }
        cam.yaw = camYaw.v; cam.pitch = camPitch.v;
        if (moving) dirty = 2;
        if (dirty > 0) { draw(); updateWord(); dirty--; }
    }

    const loop = VizKit.startLoop(frame);
    const steps = VizKit.setup(STEPS, {
        onStep, onCommand,
        onOrbit: (dx, dy) => orbitCamera(dx * 0.8, dy * 0.8),
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { dirty = 3; });

    window.viz = {
        steps, loop, advance: loop.advance,
        get state() { return { step, stepT: +stepT.toFixed(2), flips: FLIPS.length, product: [T4.nodes.length, T6.nodes.length], cube: CUBE.length }; },
        grid: GRID, flips: FLIPS,
    };
})();
