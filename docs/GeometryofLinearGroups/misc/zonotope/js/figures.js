// figures.js — the seven live figures of the Hexa-Grid notes.
(function () {
    'use strict';
    const { el, html, pts, tween, ease, TilingView, WordChips, drawWiring, pairLabel } = HGR;
    const $ = id => document.getElementById(id);
    const SUB = '₀₁₂₃₄₅₆₇₈₉';
    const sub = k => String(k).split('').map(d => SUB[+d]).join('');
    const sWord = w => w.length ? w.map(s => 's' + sub(s + 1)).join('') : 'e';
    const plural = (k, a, b) => k + ' ' + (k === 1 ? a : b);
    function seg(id, onChange) {
        const host = $(id);
        host.addEventListener('click', e => {
            const b = e.target.closest('button');
            if (!b) return;
            host.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
            onChange(b.dataset.v);
        });
        return () => host.querySelector('.on').dataset.v;
    }
    const nFromLength = r => { const n = (1 + Math.sqrt(1 + 8 * r)) / 2; return Number.isInteger(n) ? n : null; };
    // Pairs whose tile differs between two tilings.
    function changedPairs(S, T) {
        const out = new Set();
        if (!S || !T || S.n !== T.n) return out;
        for (const [i, j] of HG.pairs(T.n)) if (S.base[HG.pairIndex(T.n, i, j)] !== T.base[HG.pairIndex(T.n, i, j)]) out.add(i + ',' + j);
        return out;
    }
    // The flip carrying S to T, if they differ by exactly one.
    function flipBetween(S, T) {
        const ch = changedPairs(S, T);
        if (ch.size !== 3) return null;
        const dirs = new Set();
        for (const k of ch) k.split(',').forEach(d => dirs.add(+d));
        if (dirs.size !== 3) return null;
        const [a, b, c] = [...dirs].sort((x, y) => x - y);
        return HG.flips(S).find(f => f.a === a && f.b === b && f.c === c) || null;
    }

    // ================================================================ Figure 1: the cube
    (function figCube() {
        const svg = $('cube-svg'), polySvg = $('poly-svg');
        if (!svg) return;
        const r2 = Math.SQRT1_2, L = [[1, 0, r2], [0.5, Math.sqrt(3) / 2, -r2], [-0.5, Math.sqrt(3) / 2, r2]];
        const C = [0, 1, 2].map(d => (L[0][d] + L[1][d] + L[2][d]) / 2);
        const P = m => { const p = [0, 0, 0]; for (let k = 0; k < 3; k++) if (m >> k & 1) for (let d = 0; d < 3; d++) p[d] += L[k][d]; return p.map((x, d) => x - C[d]); };
        const unit = 96, H = 150;
        svg.setAttribute('viewBox', `${-H} ${-H} ${2 * H} ${2 * H}`);
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        // the six faces, each a tile (i, j) on base 0 or e_k, front if it faces +z
        const faces = [];
        for (const [i, j, k] of [[0, 1, 2], [0, 2, 1], [1, 2, 0]]) for (const b of [0, 1]) {
            const base = b << k;
            let N = cross(L[i], L[j]);
            if ((dot(N, L[k]) > 0) !== (b === 1)) N = N.map(x => -x);
            faces.push({ i, j, base, front: N[2] > 0, corners: [base, base | 1 << i, base | 1 << i | 1 << j, base | 1 << j] });
        }
        const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
        let tilt = +$('cube-tilt').value, yaw0 = 0.35, half = 'front', pathIdx = 0, polyN = 3;
        const sel = $('cube-path');
        function fillPaths() {
            sel.innerHTML = '';
            const n = polyN;
            const opts = [];
            if (n <= 4) {
                const all = [];
                const rec = (pre, rest) => { if (!rest.length) all.push(pre); rest.forEach((x, q) => rec(pre.concat(x), rest.filter((_, r) => r !== q))); };
                rec([], HG.identity(n));
                for (const p of all) opts.push(p);
            } else {
                opts.push(HG.identity(n), HG.identity(n).reverse());
                for (let k = 0; k < 4; k++) opts.push(HG.identity(n).sort(() => Math.random() - 0.5));
            }
            opts.forEach((p, q) => {
                const o = html('option', { value: q }, sel);
                const name = p.map(x => x + 1).join('');
                const isP0 = p.every((x, r) => x === r), isP1 = p.every((x, r) => x === n - 1 - r);
                o.textContent = (isP0 ? 'p₀ = ' : isP1 ? 'p₁ = ' : '') + name;
                o._perm = p;
            });
            sel.value = '0';
        }
        const curPerm = () => sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex]._perm : null;
        // Look at the cube from the direction d = (sin θ cos φ, sin θ sin φ, cos θ); θ = 0 is
        // straight down ker π (the z-axis), which is exactly the projection π.
        function rot(p) {
            const th = tilt * 0.9, f = [Math.sin(th) * Math.cos(yaw0), Math.sin(th) * Math.sin(yaw0), Math.cos(th)];
            let r = [f[2], 0, -f[0]];
            const rl = Math.hypot(r[0], r[2]);
            r = [r[0] / rl, 0, r[2] / rl];
            const u = cross(f, r);
            return [dot(p, r), dot(p, u), dot(p, f)];
        }
        const scr = q => [q[0] * unit, -q[1] * unit];
        function drawCube() {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const R = {};
            for (let m = 0; m < 8; m++) R[m] = rot(P(m));
            const ordered = faces.map(f => ({ f, z: f.corners.reduce((s, m) => s + R[m][2], 0) / 4 }));
            const mine = ordered.filter(o => o.f.front === (half === 'front')), other = ordered.filter(o => o.f.front !== (half === 'front'));
            const draw = (o, cls) => {
                const g = el('g', { class: 'tile t-shape-' + (HG.pairIndex(3, o.f.i, o.f.j) + 1) }, svg);
                el('polygon', { points: pts(o.f.corners.map(m => scr(R[m]))), class: 'face ' + cls }, g);
            };
            other.sort((a, b) => a.z - b.z).forEach(o => draw(o, 'back'));
            mine.sort((a, b) => a.z - b.z).forEach(o => draw(o, ''));
            const perm = polyN === 3 ? curPerm() : null;
            if (perm) {
                let m = 0;
                const Q = [scr(R[0])];
                for (const k of perm) { m |= 1 << k; Q.push(scr(R[m])); }
                el('polyline', { points: pts(Q), class: 'edge-path' }, svg);
            }
            const z0 = scr(R[0]), z1 = scr(R[7]);
            el('text', { x: z0[0] - 4, y: z0[1] + 17, class: 'vlabel' }, svg).textContent = '0';
            el('text', { x: z1[0] + 4, y: z1[1] - 13, class: 'vlabel' }, svg).textContent = '1';
        }
        const pv = new TilingView(polySvg, { unit: 62, pad: 34, color: 'pair' });
        function drawPoly() {
            pv.setN(polyN);
            const perm = curPerm();
            const spec = {
                edgeLabels: true,
                paths: [{ perm: HG.identity(polyN), cls: 'p0' }, { perm: HG.identity(polyN).reverse(), cls: 'p1' }],
            };
            if (polyN === 3) {
                spec.tiles = faces.filter(f => f.front === (half === 'front')).map(f => ({ i: f.i, j: f.j, base: f.base }));
            }
            if (perm) spec.paths.push({ perm, cls: 'cur' });
            pv.render(spec);
        }
        const draw = () => { drawCube(); drawPoly(); };
        $('cube-tilt').addEventListener('input', e => { tilt = +e.target.value; drawCube(); });
        seg('cube-half', v => { half = v; draw(); });
        sel.addEventListener('change', draw);
        $('poly-n').addEventListener('input', e => { polyN = +e.target.value; $('poly-n-val').textContent = polyN; fillPaths(); draw(); });
        let anim = null;
        $('cube-snap').addEventListener('click', () => {
            if (anim) anim.cancel();
            const from = tilt, to = tilt > 0.01 ? 0 : 0.5;
            anim = tween(900, t => { tilt = from + (to - from) * ease(t); $('cube-tilt').value = tilt; drawCube(); });
        });
        // drag to turn: horizontal spins, vertical tilts
        let drag = null;
        svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, tilt, yaw0 }; svg.setPointerCapture(e.pointerId); });
        svg.addEventListener('pointermove', e => {
            if (!drag) return;
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            tilt = Math.max(0, Math.min(1, drag.tilt + dy / 260));
            yaw0 = drag.yaw0 - dx / 90;
            $('cube-tilt').value = tilt;
            drawCube();
        });
        svg.addEventListener('pointerup', () => { drag = null; });
        svg.style.cursor = 'grab';
        fillPaths();
        sel.value = '0';
        draw();
    })();

    // ================================================================ Figure 2: pushing paths
    const pushApi = (function figPush() {
        const svg = $('push-svg');
        if (!svg) return null;
        const view = new TilingView(svg, { unit: 62, pad: 32 });
        const chips = new WordChips($('push-word'), { moves: false });
        let n = 4, a, steps;
        function reset() { a = HG.identity(n); steps = []; render(); }
        function push(s) {
            if (a[s] > a[s + 1]) return;
            let pre = 0; for (let k = 0; k < s; k++) pre |= 1 << a[k];
            steps.push({ s, i: a[s], j: a[s + 1], base: pre });
            const t = a[s]; a[s] = a[s + 1]; a[s + 1] = t;
            render(true);
        }
        function undo() {
            const st = steps.pop();
            if (!st) return;
            const t = a[st.s]; a[st.s] = a[st.s + 1]; a[st.s + 1] = t;
            render();
        }
        function render(fresh) {
            view.setN(n);
            const ghosts = [];
            let pre = 0;
            for (let s = 0; s + 1 < n; s++) {
                if (a[s] < a[s + 1]) ghosts.push({ i: a[s], j: a[s + 1], base: pre, key: s, label: 's' + sub(s + 1) });
                pre |= 1 << a[s];
            }
            const tiles = steps.map((st, q) => ({ i: st.i, j: st.j, base: st.base, step: q, cls: fresh && q === steps.length - 1 ? 'fresh' : '' }));
            view.render({
                tiles, label: 'step', ghosts, edgeLabels: true,
                paths: [{ perm: a, cls: 'cur' }],
            });
            // one-line notation with buttons at the ascents
            const ol = $('push-oneline');
            ol.innerHTML = '';
            a.forEach((x, q) => {
                html('div', { class: 'v' }, ol, String(x + 1));
                if (q + 1 < n) {
                    const g = html('div', { class: 'gap' }, ol);
                    if (a[q] < a[q + 1]) {
                        const b = html('button', { type: 'button', title: 'push across: apply s' + (q + 1) }, g, 's' + (q + 1));
                        b.addEventListener('click', () => push(q));
                    }
                }
            });
            const inv = HG.inversions(a), N = n * (n - 1) / 2;
            let desc = 0; for (let q = 0; q + 1 < n; q++) if (a[q] > a[q + 1]) desc++;
            $('push-stats').innerHTML = `ℓ(w) = <span class="m">${inv}</span> of ${N} inversions · ${plural(n - 1 - desc, 'ascent', 'ascents')} left`;
            chips.render(steps.map(st => st.s));
            $('push-undo').disabled = !steps.length;
            const done = $('push-done');
            if (inv === N) {
                done.innerHTML = `<span class="ok">The path is p₁.</span> The word is an S-factorization of w₀ and the tiles cover P${sub(2 * n)}. `;
                const b = html('a', { href: '#fig-word' }, done, 'Open it in Figure 3 ↓');
                b.addEventListener('click', () => { if (wordApi) wordApi.set(n, steps.map(st => st.s)); });
            } else done.textContent = '';
        }
        view.on('pick', (kind, key) => { if (kind === 'ghost') push(+key); });
        $('push-n').addEventListener('input', e => { n = +e.target.value; $('push-n-val').textContent = n; reset(); });
        $('push-undo').addEventListener('click', undo);
        $('push-reset').addEventListener('click', reset);
        $('push-rand').addEventListener('click', () => {
            const asc = [];
            for (let s = 0; s + 1 < n; s++) if (a[s] < a[s + 1]) asc.push(s);
            if (asc.length) push(asc[Math.floor(Math.random() * asc.length)]);
        });
        reset();
        return {};
    })();

    // ================================================================ Figure 3: word ↔ tiling
    const FIG1_WORD = HG.parseWord('123454321234323');
    const wordApi = (function figWord() {
        const svg = $('word-svg');
        if (!svg) return null;
        const view = new TilingView(svg, { unit: 50, pad: 30 });
        const chips = new WordChips($('word-chips'));
        const input = $('word-input'), slider = $('word-step');
        let n = 6, word = FIG1_WORD.slice(), step = word.length, label = 'step', T = null, flash = null, hoverLetter = null, hoverPair = null, busy = false, player = null, epoch = 0;
        function set(nn, w, keepStep) {
            epoch++; busy = false;
            n = nn; word = w.slice();
            T = HG.tilingFromWord(n, word);
            slider.max = word.length;
            if (!keepStep) step = word.length;
            slider.value = step;
            input.value = HG.formatWord(word);
            input.classList.remove('bad');
            render();
        }
        function render() {
            view.setN(n);
            const sw = HG.sweep(n, word);
            const tiles = sw.steps.map((st, q) => ({ i: st.i, j: st.j, base: st.base, step: q, cls: q >= step ? 'dim' : '' }));
            const perm = step > 0 ? HG.permOf(n, word.slice(0, step)) : HG.identity(n);
            const hiPairs = new Set();
            if (hoverLetter != null) { const st = sw.steps[hoverLetter]; hiPairs.add(st.i + ',' + st.j); }
            if (flash) for (const q of flash) { const st = sw.steps[q]; hiPairs.add(st.i + ',' + st.j); }
            const F = HG.flips(T);
            view.render({
                T, tiles, label, hiPairs, edgeLabels: true,
                paths: step > 0 && step < word.length ? [{ perm, cls: 'cur' }] : [],
                markers: F.map((f, q) => ({ mask: f.vertex, key: q, cls: f.kind, title: '3-move: flip this hexagon' })),
            });
            view._flips = F;
            const hiLetters = new Set();
            if (hoverPair) sw.steps.forEach((st, q) => { if (st.i + ',' + st.j === hoverPair) hiLetters.add(q); });
            chips.render(word, { active: step < word.length ? step : null, hi: hiLetters, flash: flash ? new Set(flash) : null });
            flash = null;
            $('word-step-val').textContent = step + '/' + word.length;
            drawWiring($('word-wiring'), n, word, { active: step < word.length ? step : null });
            const M = HG.moves(word);
            const n2 = M.filter(m => m.kind === 2).length, n3 = M.filter(m => m.kind === 3).length;
            $('word-status').innerHTML = `w₀ ∈ Sym${sub(n)} · ${word.length} letters · ` +
                `<span style="color:var(--red)">${plural(n2, '2-move', '2-moves')}</span>, <span style="color:var(--blue)">${plural(n3, '3-move', '3-moves')}</span> available here · ${plural(F.length, 'vertex', 'vertices')} of degree 3`;
            const size = HG.classSize(word, 400000);
            const lf = HG.lexFirst(word);
            $('word-class').innerHTML = `commutation class: <span class="m">${size == null ? 'many' : size.toLocaleString()}</span> ${size === 1 ? 'word' : 'words'}` +
                ` · lexicographically first: <span class="m">${HG.formatWord(lf)}</span>`;
        }
        function applyFlip(f, newWord, flashFrom) {
            if (busy) return;
            busy = true;
            stopPlay();
            const ep = epoch;
            view.animateFlip(f, 420, () => {
                if (ep !== epoch) return;
                busy = false;
                word = newWord;
                T = HG.tilingFromWord(n, word);
                step = word.length; slider.value = step;
                input.value = HG.formatWord(word);
                flash = [flashFrom, flashFrom + 1, flashFrom + 2];
                render();
            });
        }
        chips.on('move', m => {
            if (busy) return;
            const w2 = HG.applyMove(word, m);
            if (m.kind === 2) { word = w2; input.value = HG.formatWord(word); flash = [m.p, m.p + 1]; render(); return; }
            const f = flipBetween(T, HG.tilingFromWord(n, w2));
            if (f) applyFlip(f, w2, m.p); else { word = w2; T = HG.tilingFromWord(n, word); render(); }
        });
        chips.on('hover', (kind, v) => {
            const h = kind === 'letter' ? v : null;
            if (h === hoverLetter) return;
            hoverLetter = h;
            if (!busy) render();
        });
        view.on('hover', (kind, key) => {
            const hp = kind === 'tile' ? key : null;
            if (hp === hoverPair) return;
            hoverPair = hp;
            const sw = HG.sweep(n, word), hi = new Set();
            if (hp) sw.steps.forEach((st, q) => { if (st.i + ',' + st.j === hp) hi.add(q); });
            chips.render(word, { active: step < word.length ? step : null, hi });
        });
        view.on('pick', (kind, key) => {
            if (kind !== 'marker' || busy) return;
            const f = view._flips[+key];
            const al = HG.alignFlip(n, word, f);
            const w2 = HG.applyMove(al.word, { p: al.p, kind: 3 });
            applyFlip(f, w2, al.p);
        });
        input.addEventListener('change', () => {
            const w = HG.parseWord(input.value);
            const nn = w ? nFromLength(w.length) : null;
            if (!w || !nn || nn < 2 || nn > 9 || !HG.isLongest(nn, w)) {
                input.classList.add('bad');
                $('word-status').innerHTML = `<span class="err">That is not a reduced word for the longest permutation w₀.</span> Its length must be n(n−1)/2 and every letter must create a new inversion.`;
                return;
            }
            set(nn, w);
        });
        slider.addEventListener('input', () => { stopPlay(); step = +slider.value; render(); });
        seg('word-label', v => { label = v; render(); });
        $('word-fig1').addEventListener('click', () => set(6, FIG1_WORD));
        $('word-rand').addEventListener('click', () => {
            const T = HG.randomTiling(n, 300);
            set(n, HG.wordFromTiling(T, av => av[Math.floor(Math.random() * av.length)]));
        });
        function stopPlay() { if (player) { clearInterval(player); player = null; $('word-play').textContent = '▶ build'; } }
        $('word-play').addEventListener('click', () => {
            if (player) return stopPlay();
            if (step >= word.length) step = 0;
            $('word-play').textContent = '❚❚ pause';
            render();
            player = setInterval(() => {
                step++; slider.value = step; render();
                if (step >= word.length) stopPlay();
            }, 420);
        });
        set(6, FIG1_WORD);
        return {
            set(nn, w) { set(nn, w); document.getElementById('fig-word').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        };
    })();

    // ================================================================ Figure 4: Proposition 2
    (function figTits() {
        const svg = $('tits-svg');
        if (!svg) return;
        const view = new TilingView(svg, { unit: 54, pad: 30 });
        const inU = $('tits-u'), inV = $('tits-v'), slider = $('tits-step'), diag = $('tits-diagram');
        let n = 4, u = HG.wordA(4), v = HG.wordB(4), chain = [u], trace = [], idx = 0, busy = false, player = null, gen = 0;
        function randomWord(nn) {
            return HG.wordFromTiling(HG.randomTiling(nn, 200), av => av[Math.floor(Math.random() * av.length)]);
        }
        function parse(inp) {
            const w = HG.parseWord(inp.value);
            if (!w || !HG.isReduced(n, w)) { inp.classList.add('bad'); return null; }
            inp.classList.remove('bad');
            return w;
        }
        function run() {
            stopPlay();
            const a = parse(inU), b = parse(inV);
            const st = $('tits-status');
            if (!a || !b) { st.innerHTML = `<span class="err">Both words must be reduced words in Sym${sub(n)} (letters 1–${n - 1}).</span>`; return; }
            const pa = HG.permOf(n, a), pb = HG.permOf(n, b);
            if (a.length !== b.length || pa.some((x, q) => x !== pb[q])) {
                st.innerHTML = `<span class="err">These words name different permutations</span> (${pa.map(x => x + 1).join('')} and ${pb.map(x => x + 1).join('')}), so no moves connect them.`;
                return;
            }
            u = a; v = b; trace = []; gen++; busy = false;
            chain = HG.connect(n, u, v, trace);
            idx = 0;
            slider.max = chain.length - 1; slider.value = 0;
            const k3 = chain.slice(1).filter((w, q) => HG.moveBetween(chain[q], w).kind === 3).length;
            const isW0 = HG.isLongest(n, u);
            st.innerHTML = `both words spell <span class="m">${pa.map(x => x + 1).join('')}</span>${isW0 ? ' = w₀' : ''} · the proof connects them in ` +
                `<b>${chain.length - 1}</b> moves: <span style="color:var(--red)">${chain.length - 1 - k3} commutations</span> and <span style="color:var(--blue)">${k3} braid moves</span>`;
            drawDiagram();
            drawChain();
            render();
        }
        function drawDiagram() {
            while (diag.firstChild) diag.removeChild(diag.firstChild);
            const r = u.length;
            let c = 0;
            while (c < r && u[c] === v[c]) c++;
            const dx = 42, dy = Math.max(17, Math.min(30, 330 / Math.max(1, r))), W = 7.6 * dx, Hh = r * dy + 50;
            diag.setAttribute('viewBox', `${-W / 2} ${-Hh + 24} ${W} ${Hh}`);
            const P = (x, l) => [x * dx, -l * dy];
            const line = (A, B, lab, cls, side) => {
                el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'chain-line' }, diag);
                if (lab != null) {
                    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
                    el('text', { x: mx + side * 9, y: my, class: 'lab ' + (cls || '') }, diag).textContent = lab;
                }
            };
            const dots = [];
            const vtx = p => dots.push(p);
            const e0 = P(0, 0);
            vtx(e0);
            el('text', { x: e0[0], y: e0[1] + 14, class: '' }, diag).textContent = 'e';
            if (c === r) {
                for (let l = 0; l < r; l++) { line(P(0, l), P(0, l + 1), u[l] + 1, '', 1); vtx(P(0, l + 1)); }
                el('text', { x: 0, y: -r * dy - 14 }, diag).textContent = 'w';
                for (const d of dots) el('circle', { cx: d[0], cy: d[1], r: 3, class: 'dot' }, diag);
                return;
            }
            for (let l = 0; l < c; l++) { line(P(0, l), P(0, l + 1), u[l] + 1, '', 1); vtx(P(0, l + 1)); }
            const t = trace[0], m = t.alpha.length;
            const S = P(0, c), A1 = P(-1.1, c + 1), B1 = P(1.1, c + 1), J = P(0, c + m), Wt = P(0, r);
            line(S, A1, t.a + 1, 'a', -1); line(S, B1, t.b + 1, 'b', 1); vtx(A1); vtx(B1);
            // outer chains: the rest of the two given words
            const outer = (w, x0, side, A) => {
                let prev = A;
                for (let l = c + 1; l < r; l++) {
                    const nx = l === r - 1 ? Wt : P(x0, l + 1);
                    line(prev, nx, w[l] + 1, '', side);
                    if (l < r - 1) vtx(nx);
                    prev = nx;
                }
            };
            outer(u, -2.5, -1, A1);
            outer(v, 2.5, 1, B1);
            // inner chains: α then α′, meeting at the join
            const inner = (al, x0, side, A) => {
                let prev = A;
                for (let q = 1; q < m; q++) {
                    const nx = q === m - 1 ? J : P(x0, c + q + 1);
                    line(prev, nx, al[q] + 1, '', side);
                    if (q < m - 1) vtx(nx);
                    prev = nx;
                }
            };
            inner(t.alpha, -0.7, 1, A1);
            inner(t.alphaP, 0.7, -1, B1);
            vtx(J);
            let prev = J;
            for (let q = 0; q < t.beta.length; q++) {
                const nx = P(0, c + m + q + 1);
                line(prev, nx, t.beta[q] + 1, '', 1);
                vtx(nx); prev = nx;
            }
            el('text', { x: J[0] - 22, y: J[1] + 2, class: 'region' }, diag).textContent = 'α';
            if (t.beta.length) el('text', { x: -16, y: P(0, c + m + t.beta.length / 2)[1], class: 'region' }, diag).textContent = 'β';
            const mid = (c + 1 + r) / 2;
            el('text', { x: -1.75 * dx, y: P(0, mid)[1], class: 'region' }, diag).textContent = 'induction';
            el('text', { x: 1.75 * dx, y: P(0, mid)[1], class: 'region' }, diag).textContent = 'induction';
            el('text', { x: 0, y: P(0, c + m / 2 + 0.15)[1], class: 'region' }, diag).textContent = m === 3 ? '3-move' : '2-move';
            el('text', { x: -3.4 * dx, y: P(0, mid)[1], style: 'font-family:var(--sans);font-size:15px' }, diag).textContent = 'w';
            el('text', { x: 3.4 * dx, y: P(0, mid)[1], style: 'font-family:var(--sans);font-size:15px' }, diag).textContent = 'w′';
            el('text', { x: 0, y: P(0, r)[1] - 16 }, diag).textContent = 'w';
            for (const d of dots) el('circle', { cx: d[0], cy: d[1], r: 3, class: 'dot' }, diag);
            el('circle', { cx: Wt[0], cy: Wt[1], r: 3.4, class: 'dot' }, diag);
        }
        function drawChain() {
            const host = $('tits-chain');
            host.innerHTML = '';
            chain.forEach((w, q) => {
                const row = html('div', { class: 'row' + (q === idx ? ' on' : ''), 'data-q': q }, host);
                html('span', { class: 'idx' }, row, String(q));
                const mv = q ? HG.moveBetween(chain[q - 1], w) : null;
                html('span', { class: 'kind ' + (mv ? 'k' + mv.kind : '') }, row, mv ? String(mv.kind) : '·');
                const ws = html('span', { class: 'w' }, row);
                w.forEach((s, p) => {
                    const sp = html('span', mv && p >= mv.p && p < mv.p + mv.kind ? { class: 'm' + mv.kind } : null, ws, String(s + 1));
                    if (n > 9) sp.textContent += ' ';
                });
            });
            host.onclick = e => { const r = e.target.closest('.row'); if (r) go(+r.dataset.q); };
        }
        function render() {
            view.setN(n);
            const w = chain[idx];
            const full = HG.isLongest(n, w);
            const sw = HG.sweep(n, w);
            const T = full ? HG.tilingFromWord(n, w) : null;
            const mv = idx ? HG.moveBetween(chain[idx - 1], w) : null;
            const hi = new Set();
            if (mv) for (let p = mv.p; p < mv.p + mv.kind; p++) { const st = sw.steps[p]; hi.add(st.i + ',' + st.j); }
            view.render({
                T, tiles: sw.steps.map((st, q) => ({ i: st.i, j: st.j, base: st.base, step: q })), label: 'step', hiPairs: hi,
                paths: full ? [] : [{ perm: sw.perm, cls: 'cur' }],
                markers: T ? HG.flips(T).map((f, q) => ({ mask: f.vertex, key: q, cls: 'inert' })) : [],
            });
            $('tits-step-val').textContent = idx + '/' + (chain.length - 1);
            const host = $('tits-chain');
            host.querySelectorAll('.row').forEach(r => r.classList.toggle('on', +r.dataset.q === idx));
            const on = host.querySelector('.row.on');
            if (on) { const top = on.offsetTop - host.clientHeight / 2; host.scrollTop = Math.max(0, top); }
        }
        function go(q, animate) {
            q = Math.max(0, Math.min(chain.length - 1, q));
            if (q === idx || busy) return;
            const prev = chain[idx], next = chain[q];
            if (animate && Math.abs(q - idx) === 1 && HG.isLongest(n, prev)) {
                const f = flipBetween(HG.tilingFromWord(n, prev), HG.tilingFromWord(n, next));
                if (f) {
                    busy = true;
                    const g = gen;
                    view.animateFlip(f, 380, () => { if (g !== gen) return; busy = false; idx = q; slider.value = q; render(); });
                    return;
                }
            }
            idx = q; slider.value = q; render();
        }
        function stopPlay() { if (player) { clearInterval(player); player = null; $('tits-play').textContent = '▶ play'; } }
        slider.addEventListener('input', () => { stopPlay(); go(+slider.value, Math.abs(+slider.value - idx) === 1); });
        $('tits-play').addEventListener('click', () => {
            if (player) return stopPlay();
            if (idx >= chain.length - 1) { idx = 0; slider.value = 0; render(); }
            $('tits-play').textContent = '❚❚ pause';
            player = setInterval(() => { if (busy) return; if (idx >= chain.length - 1) return stopPlay(); go(idx + 1, true); }, 520);
        });
        $('tits-n').addEventListener('change', e => {
            n = +e.target.value;
            inU.value = HG.formatWord(HG.wordA(n)); inV.value = HG.formatWord(HG.wordB(n));
            run();
        });
        inU.addEventListener('change', run);
        inV.addEventListener('change', run);
        $('tits-u-rand').addEventListener('click', () => { inU.value = HG.formatWord(randomWord(n)); run(); });
        $('tits-v-rand').addEventListener('click', () => { inV.value = HG.formatWord(randomWord(n)); run(); });
        inU.value = HG.formatWord(u); inV.value = HG.formatWord(v);
        run();
    })();

    // ================================================================ Figure 5: Γ_w and the counts
    (function figGraph() {
        const canvas = $('graph-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d'), tip = $('graph-tip');
        const tipView = { svg: null, view: null };
        let n = 4, G = null, X = null, Y = null, CX = null, CY = null, mode = 'words', mix = 0, hover = -1, anim = null;
        const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        // Each red class is drawn as a little cluster of its words; the clusters are laid
        // out as the flip graph (the blue edges between classes), spaced by their size.
        function layout() {
            G = HG.wordGraph(n, { edges: true });
            const N = G.count, K = G.nClasses, cls = G.classOf;
            const members = Array.from({ length: K }, () => []), redIn = Array.from({ length: K }, () => []);
            for (let q = 0; q < N; q++) members[cls[q]].push(q);
            for (let e = 0; e < G.red.length; e += 2) redIn[cls[G.red[e]]].push([G.red[e], G.red[e + 1]]);
            const cEdges = new Set();
            for (let e = 0; e < G.blue.length; e += 2) {
                const a = cls[G.blue[e]], b = cls[G.blue[e + 1]];
                if (a !== b) cEdges.add(Math.min(a, b) + ',' + Math.max(a, b));
            }
            const CE = [...cEdges].map(t => t.split(',').map(Number));
            const rad = members.map(m => 0.17 * Math.sqrt(m.length));
            const cx = new Float64Array(K), cy = new Float64Array(K);
            for (let k = 0; k < K; k++) { const t = 2 * Math.PI * k / K; cx[k] = 2 * Math.cos(t); cy[k] = 2 * Math.sin(t); }
            spring(cx, cy, CE, K, 0.55, K > 20 ? 600 : 300, rad);
            X = new Float64Array(N); Y = new Float64Array(N);
            for (let k = 0; k < K; k++) {
                const m = members[k], loc = new Map(m.map((q, i) => [q, i])), M = m.length;
                const lx = new Float64Array(M), ly = new Float64Array(M);
                for (let i = 0; i < M; i++) { const t = 2 * Math.PI * i / M; lx[i] = Math.cos(t); ly[i] = Math.sin(t); }
                if (M > 2) spring(lx, ly, redIn[k].map(([a, b]) => [loc.get(a), loc.get(b)]), M, 1, 250);
                let r = 0, mx = 0, my = 0;
                for (let i = 0; i < M; i++) { mx += lx[i] / M; my += ly[i] / M; }
                for (let i = 0; i < M; i++) r = Math.max(r, Math.hypot(lx[i] - mx, ly[i] - my));
                const sc = M > 1 ? 2.1 * rad[k] / (r || 1) : 0;
                for (let i = 0; i < M; i++) { X[m[i]] = cx[k] + (lx[i] - mx) * sc; Y[m[i]] = cy[k] + (ly[i] - my) * sc; }
            }
            // fit to the canvas
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (let q = 0; q < N; q++) { x0 = Math.min(x0, X[q]); x1 = Math.max(x1, X[q]); y0 = Math.min(y0, Y[q]); y1 = Math.max(y1, Y[q]); }
            const s = Math.min((canvas.width - 90) / (x1 - x0 || 1), (canvas.height - 90) / (y1 - y0 || 1));
            for (let q = 0; q < N; q++) { X[q] = canvas.width / 2 + (X[q] - (x0 + x1) / 2) * s; Y[q] = canvas.height / 2 + (Y[q] - (y0 + y1) / 2) * s; }
            CX = new Float64Array(K); CY = new Float64Array(K);
            for (let k = 0; k < K; k++) { CX[k] = canvas.width / 2 + (cx[k] - (x0 + x1) / 2) * s; CY[k] = canvas.height / 2 + (cy[k] - (y0 + y1) / 2) * s; }
            $('graph-stats').innerHTML = `n = ${n}: <span class="m">${G.count}</span> reduced words, <span style="color:var(--red)">${G.nRed} red</span> and <span style="color:var(--blue)">${G.nBlue} blue</span> edges, ` +
                `<span class="m">${G.nClasses}</span> red classes`;
        }
        // Fruchterman–Reingold, with optional node radii added to the ideal distances.
        function spring(x, y, E, N, L, iters, rad) {
            const R = i => rad ? rad[i] : 0;
            for (let it = 0; it < iters; it++) {
                const fx = new Float64Array(N), fy = new Float64Array(N), T = 0.12 * (1 - it / iters) + 0.003;
                for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
                    const dx = x[i] - x[j], dy = y[i] - y[j], d2 = dx * dx + dy * dy + 1e-4, l = L + R(i) + R(j);
                    const f = l * l / d2;
                    fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
                }
                for (const [i, j] of E) {
                    const dx = x[i] - x[j], dy = y[i] - y[j], d = Math.sqrt(dx * dx + dy * dy) + 1e-6, f = d / (L + R(i) + R(j));
                    fx[i] -= dx * f; fy[i] -= dy * f; fx[j] += dx * f; fy[j] += dy * f;
                }
                for (let i = 0; i < N; i++) {
                    const m = Math.hypot(fx[i], fy[i]) + 1e-9, st = Math.min(m, T * (1 + 2 * (rad ? 1 : 0))) / m;
                    x[i] += fx[i] * st; y[i] += fy[i] * st;
                }
            }
        }
        const px = q => X[q] + (CX[G.classOf[q]] - X[q]) * mix;
        const py = q => Y[q] + (CY[G.classOf[q]] - Y[q]) * mix;
        function draw() {
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            const red = css('--red'), blue = css('--blue'), ink = css('--ink'), paper = css('--paper'), gold = css('--gold');
            const big = G.count > 100;
            ctx.lineWidth = big ? 1.2 : 3;
            ctx.globalAlpha = (1 - mix) * (big ? 0.55 : 0.9);
            ctx.strokeStyle = red;
            ctx.beginPath();
            for (let e = 0; e < G.red.length; e += 2) { ctx.moveTo(px(G.red[e]), py(G.red[e])); ctx.lineTo(px(G.red[e + 1]), py(G.red[e + 1])); }
            ctx.stroke();
            ctx.globalAlpha = big ? 0.6 : 0.9;
            ctx.strokeStyle = blue;
            ctx.lineWidth = big ? 1.5 : 3.6;
            ctx.beginPath();
            for (let e = 0; e < G.blue.length; e += 2) { ctx.moveTo(px(G.blue[e]), py(G.blue[e])); ctx.lineTo(px(G.blue[e + 1]), py(G.blue[e + 1])); }
            ctx.stroke();
            ctx.globalAlpha = 1;
            const rr = big ? 3.6 : 10;
            const hc = hover >= 0 ? G.classOf[hover] : -1;
            for (let q = 0; q < G.count; q++) {
                ctx.beginPath();
                ctx.arc(px(q), py(q), q === hover ? rr + 3 : rr, 0, 2 * Math.PI);
                ctx.fillStyle = G.classOf[q] === hc ? gold : paper;
                ctx.fill();
                ctx.strokeStyle = ink; ctx.lineWidth = big ? 1.1 : 2.2;
                ctx.stroke();
            }
            if (mix > 0.98 && n <= 4) {
                ctx.font = '600 22px "JetBrains Mono", monospace';
                ctx.textAlign = 'center'; ctx.fillStyle = ink;
                G.reps.forEach((w, k) => ctx.fillText(HG.formatWord(w), CX[k], CY[k] - 22));
            }
            if (mix < 0.02 && n <= 3) {
                ctx.font = '600 22px "JetBrains Mono", monospace';
                ctx.textAlign = 'center'; ctx.fillStyle = ink;
                for (let q = 0; q < G.count; q++) ctx.fillText(HG.formatWord(G.words[q]), X[q], Y[q] - 22);
            }
        }
        function setMode(m) {
            mode = m;
            if (anim) anim.cancel();
            const from = mix, to = m === 'classes' ? 1 : 0;
            anim = tween(700, t => { mix = from + (to - from) * ease(t); draw(); });
        }
        canvas.addEventListener('pointermove', e => {
            const r = canvas.getBoundingClientRect(), sx = canvas.width / r.width;
            const x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sx;
            let best = -1, bd = (G.count > 100 ? 10 : 18) * sx;
            for (let q = 0; q < G.count; q++) { const d = Math.hypot(px(q) - x, py(q) - y); if (d < bd) { bd = d; best = q; } }
            if (best !== hover) { hover = best; draw(); }
            if (best < 0) { tip.style.display = 'none'; return; }
            const w = G.words[best], rep = G.reps[G.classOf[best]];
            tip.innerHTML = `<div>${HG.formatWord(w)}</div><div style="color:var(--ink-3)">class of ${HG.formatWord(rep)}</div>`;
            const s = el('svg', null, tip);
            const tv = new TilingView(s, { unit: 30, pad: 6 });
            tv.setN(n);
            tv.render({ T: HG.tilingFromWord(n, w), cornerLabels: false });
            tip.style.display = 'block';
            const host = canvas.parentElement.getBoundingClientRect();
            let lx = e.clientX - host.left + 14, ly = e.clientY - host.top + 14;
            if (lx + 150 > host.width) lx -= 170;
            if (ly + 170 > host.height) ly -= 190;
            tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
        });
        canvas.addEventListener('pointerleave', () => { hover = -1; tip.style.display = 'none'; draw(); });
        $('graph-n').addEventListener('change', e => { n = +e.target.value; hover = -1; layout(); draw(); });
        seg('graph-mode', setMode);
        if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());

        // ---- the table of counts
        const tbody = $('count-table').querySelector('tbody');
        const fmt = x => x.toLocaleString('en-US').replace(/,/g, ' ');
        const ok = (x, k) => x === k ? '<span class="ok" title="matches OEIS">✓</span>' : '<span class="err">≠ OEIS</span>';
        const cells = {};
        for (let m = 3; m <= 8; m++) {
            const tr = html('tr', null, tbody);
            html('td', null, tr, String(m));
            cells[m] = { w: html('td', null, tr), t: html('td', null, tr) };
        }
        function pump(iter, onProgress, onDone) {
            const go = () => {
                const t0 = performance.now();
                let r;
                do { r = iter.next(); } while (!r.done && performance.now() - t0 < 40);
                if (r.done) onDone(r.value); else { onProgress(r.value); setTimeout(go, 0); }
            };
            setTimeout(go, 30);
        }
        for (let m = 3; m <= 5; m++) {
            const g = HG.wordGraph(m);
            cells[m].w.innerHTML = `<span class="m">${fmt(g.count)}</span>${ok(g.count, HG.KNOWN.words[m])}`;
            cells[m].t.innerHTML = `<span class="m">${fmt(g.nClasses)}</span>${ok(g.nClasses, HG.KNOWN.tilings[m])}`;
        }
        const runBtn = (cell, label, fn) => { cell.innerHTML = ''; const b = html('button', { class: 'btn', type: 'button' }, cell, label); b.addEventListener('click', () => fn(b)); };
        runBtn(cells[6].w, 'run the algorithm', () => {
            cells[6].w.innerHTML = '<span class="m">…</span>'; cells[6].t.innerHTML = '<span class="m">…</span>';
            pump(HG.wordGraphIter(6, { keepWords: false }), p => {
                cells[6].w.innerHTML = `<span class="m">${fmt(p.seen)}…</span>`;
            }, g => {
                cells[6].w.innerHTML = `<span class="m">${fmt(g.count)}</span>${ok(g.count, HG.KNOWN.words[6])}`;
                cells[6].t.innerHTML = `<span class="m">${fmt(g.nClasses)}</span>${ok(g.nClasses, HG.KNOWN.tilings[6])}`;
            });
        });
        cells[6].t.innerHTML = '<span style="color:var(--ink-3)">←</span>';
        for (const m of [7, 8]) {
            cells[m].w.innerHTML = `<span class="m" style="color:var(--ink-3)">${fmt(HG.KNOWN.words[m])}</span>`;
            runBtn(cells[m].t, m === 8 ? 'flip (≈ 5 s)' : 'count by flips', () => {
                cells[m].t.innerHTML = '<span class="m">…</span>';
                pump(HG.tilingGraphIter(m), p => { cells[m].t.innerHTML = `<span class="m">${fmt(p.seen)}…</span>`; },
                    g => { cells[m].t.innerHTML = `<span class="m">${fmt(g.count)}</span>${ok(g.count, HG.KNOWN.tilings[m])}`; });
            });
        }
        layout();
        draw();
    })();

    // ================================================================ arrangements (Figures 6 and 7)
    const AU = 150; // svg units per unit of the big circle
    const axy = p => [p[0] * AU, -p[1] * AU];
    function svgPoint(svg, e) {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const q = pt.matrixTransform(svg.getScreenCTM().inverse());
        return [q.x / AU, -q.y / AU];
    }
    // Faces, as sign vectors, with their convex polygons and centroids.
    function faceData(arr) {
        const T = arr.tiling, masks = new Set([0, HG.full(arr.n)]);
        for (const t of HG.tilesOf(T)) for (const m of t.corners) masks.add(m);
        const faces = new Map();
        for (const m of masks) {
            const poly = HG.facePolygon(arr, m, 120);
            if (poly.length < 3) continue;
            // area centroid (the circle is sampled densely, so a vertex average would hug it)
            let A = 0, x = 0, y = 0;
            for (let q = 0; q < poly.length; q++) {
                const p = poly[q], r = poly[(q + 1) % poly.length], w = p[0] * r[1] - r[0] * p[1];
                A += w; x += (p[0] + r[0]) * w; y += (p[1] + r[1]) * w;
            }
            faces.set(m, { poly, c: Math.abs(A) > 1e-12 ? [x / (3 * A), y / (3 * A)] : poly[0] });
        }
        return faces;
    }
    // The dual of the arrangement: a vertex in each face, an edge across each segment.
    function dualEdges(arr, faces) {
        const out = [];
        const seen = new Set();
        for (const t of HG.tilesOf(arr.tiling)) {
            const c = t.corners;
            for (let q = 0; q < 4; q++) {
                const m1 = c[q], m2 = c[(q + 1) % 4], key = Math.min(m1, m2) + ':' + Math.max(m1, m2);
                if (seen.has(key)) continue;
                seen.add(key);
                const F1 = faces.get(m1), F2 = faces.get(m2);
                if (!F1 || !F2) continue;
                const k = Math.log2(m1 ^ m2), L = arr.lineOf[k], S = arr.S[L], E = arr.E[L];
                const f = x => (E[0] - S[0]) * (x[1] - S[1]) - (E[1] - S[1]) * (x[0] - S[0]);
                const on = F1.poly.filter(p => Math.abs(f(p)) < 1e-7);
                const mid = on.length >= 2 ? [(on[0][0] + on[on.length - 1][0]) / 2, (on[0][1] + on[on.length - 1][1]) / 2] : null;
                out.push({ m1, m2, k, pts: mid ? [F1.c, mid, F2.c] : [F1.c, F2.c] });
            }
        }
        return out;
    }

    // ================================================================ Figure 6: lines ↔ tilings
    (function figLines() {
        const svg = $('lines-svg');
        if (!svg) return;
        const tv = new TilingView($('lines-tiling'), { unit: 50, pad: 30 });
        const H = AU * 1.24;
        svg.setAttribute('viewBox', `${-H} ${-H} ${2 * H} ${2 * H}`);
        // The arrangement drawn in the notes (Hexalines.pdf), read off the picture.
        const NOTES = [[[300, 488], [297, 55]], [[367, 488], [152, 70]], [[478, 380], [90, 240]], [[510, 236], [105, 310]], [[480, 105], [100, 340]], [[343, 55], [115, 360]]];
        let chords, theta0, arr = null, last = null, prevT = null, fresh = new Set(), hover = null, drag = null;
        function notes() {
            const lines = NOTES.map(([a, b]) => [[a[0], -a[1]], [b[0], -b[1]]]);
            const fit = HG.chordsFromLines(lines, 1.12);
            chords = fit.chords;
            theta0 = Math.atan2(-398 - fit.center[1], 205 - fit.center[0]);
            $('lines-n').value = 6; $('lines-n-val').textContent = 6;
            prevT = null; update();
        }
        function random(n) {
            chords = HG.randomChords(n);
            theta0 = -Math.PI / 2 - 0.3;
            prevT = null; update();
        }
        function update() {
            arr = HG.arrangement(chords, theta0);
            if (arr.valid) {
                fresh = prevT && prevT.n === arr.n ? changedPairs(prevT, arr.tiling) : new Set();
                prevT = arr.tiling;
                last = arr;
            }
            render();
        }
        function render() {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const A = arr, n = A.n;
            el('circle', { cx: 0, cy: 0, r: AU, class: 'disk' }, svg);
            // arcs between consecutive endpoints; the 0-arc and the 1-arc are marked
            const ends = [];
            chords.forEach(c => { ends.push(c[0], c[1]); });
            const sorted = ends.map(t => ((t - theta0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
            const arcPath = (t1, t2, r) => {
                const p1 = [Math.cos(t1) * r, -Math.sin(t1) * r], p2 = [Math.cos(t2) * r, -Math.sin(t2) * r];
                const large = (t2 - t1) > Math.PI ? 1 : 0;
                return `M${p1[0].toFixed(2)},${p1[1].toFixed(2)} A${r},${r} 0 ${large} 0 ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
            };
            for (let q = 0; q < sorted.length; q++) {
                const t1 = theta0 + sorted[q], t2 = theta0 + (q + 1 < sorted.length ? sorted[q + 1] : sorted[0] + 2 * Math.PI);
                const hit = el('path', { d: arcPath(t1, t2, AU), class: 'arc-hit' }, svg);
                hit.addEventListener('click', () => { theta0 = (t1 + t2) / 2; prevT = null; update(); });
                el('title', null, hit).textContent = 'make this the 0-component';
            }
            const t0a = theta0 + sorted[sorted.length - 1] - 2 * Math.PI, t0b = theta0 + sorted[0];
            el('path', { d: arcPath(t0a + 0.02, t0b - 0.02, AU), class: 'zero-arc' }, svg);
            const zm = (t0a + t0b) / 2;
            el('text', { x: Math.cos(zm) * AU * 1.17, y: -Math.sin(zm) * AU * 1.17, class: 'zero-label' }, svg).textContent = '0';
            if (A.valid) {
                const oa = theta0 + sorted[n - 1], ob = theta0 + sorted[n], om = (oa + ob) / 2;
                el('path', { d: arcPath(oa + 0.02, ob - 0.02, AU), class: 'zero-arc' }, svg);
                el('text', { x: Math.cos(om) * AU * 1.17, y: -Math.sin(om) * AU * 1.17, class: 'zero-label' }, svg).textContent = '1';
            }
            const hiLine = hover && hover.kind === 'line' ? hover.k : null;
            const hiPair = hover && hover.kind === 'pair' ? hover.key : null;
            const hiMask = hover && hover.kind === 'face' ? hover.mask : null;
            if (A.valid && $('lines-tri').checked) for (const t of A.triangles) {
                el('polygon', { points: pts(t.pts.map(axy)), class: 'tri' + (hiMask === t.vertex ? ' hi' : '') }, svg);
            }
            if (A.valid && hiMask != null) {
                const poly = HG.facePolygon(A, hiMask, 160);
                if (poly.length > 2) el('polygon', { points: pts(poly.map(axy)), class: 'face-hi' }, svg);
            }
            if (A.valid && $('lines-dual').checked) {
                const faces = faceData(A);
                for (const d of dualEdges(A, faces)) el('polyline', { points: pts(d.pts.map(axy)), class: 'dual-edge' }, svg);
                for (const [m, F] of faces) { const c = axy(F.c); el('circle', { cx: c[0], cy: c[1], r: 3, class: 'dual-vertex' }, svg); }
            }
            const badLines = new Set();
            for (const [i, j] of A.bad) { badLines.add(A.lineOf[i]); badLines.add(A.lineOf[j]); }
            chords.forEach((c, L) => {
                const P = [Math.cos(c[0]), Math.sin(c[0])], Q = [Math.cos(c[1]), Math.sin(c[1])];
                const k = A.label[L];
                const a = axy(P), b = axy(Q);
                el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'line' + (hiLine === k ? ' hi' : '') + (badLines.has(L) ? ' bad' : '') }, svg);
                const hit = el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'line-hit', 'data-line': L }, svg);
                hit.addEventListener('pointerenter', () => setHover({ kind: 'line', k }));
                hit.addEventListener('pointerdown', e => startDrag(e, { type: 'line', L }));
                const S = A.S[L], lab = [S[0] * 1.09, S[1] * 1.09];
                const lp = axy(lab);
                el('text', { x: lp[0], y: lp[1], class: 'line-label' }, svg).textContent = k + 1;
            });
            chords.forEach((c, L) => {
                for (const end of [0, 1]) {
                    const p = axy([Math.cos(c[end]), Math.sin(c[end])]);
                    const h = el('circle', { cx: p[0], cy: p[1], r: 6, class: 'handle' }, svg);
                    h.addEventListener('pointerdown', e => startDrag(e, { type: 'end', L, end }));
                }
            });
            if (A.valid) {
                for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                    const p = axy(A.X[i + ',' + j]), key = i + ',' + j;
                    el('circle', { cx: p[0], cy: p[1], r: 3.6, class: 'xing' + (hiPair === key ? ' hi' : '') }, svg);
                    const hit = el('circle', { cx: p[0], cy: p[1], r: 9, class: 'xing-hit' }, svg);
                    hit.addEventListener('pointerenter', () => setHover({ kind: 'pair', key }));
                }
                if (hiLine != null) {
                    A.sequences[hiLine].forEach((j, q) => {
                        const x = A.X[Math.min(j, hiLine) + ',' + Math.max(j, hiLine)];
                        const L = A.lineOf[hiLine], d = [A.E[L][0] - A.S[L][0], A.E[L][1] - A.S[L][1]], dl = Math.hypot(d[0], d[1]);
                        const off = [-d[1] / dl * 0.06, d[0] / dl * 0.06];
                        const p = axy([x[0] + off[0], x[1] + off[1]]);
                        el('text', { x: p[0], y: p[1], class: 'seq-num' }, svg).textContent = j + 1;
                    });
                }
            }
            $('lines-warn').innerHTML = A.valid ? '' : `<span style="color:var(--red)">Lines ${A.bad.map(([i, j]) => `${i + 1} and ${j + 1}`).join(', ')} do not cross inside the circle.</span> Move them so every crossing is inside.`;
            renderTiling();
            renderSeqs();
        }
        function renderTiling() {
            const A = last;
            if (!A) return;
            tv.setN(A.n);
            const hi = new Set(fresh);
            let strand = null, list = null;
            if (hover && hover.kind === 'line') { strand = hover.k; list = HG.strand(A.tiling, strand); }
            if (hover && hover.kind === 'pair') hi.add(hover.key);
            const tiles = HG.tilesOf(A.tiling).map(t => ({ ...t, cls: (arr.valid ? '' : 'dim') + (fresh.has(t.i + ',' + t.j) ? ' fresh' : '') + (strand != null && (t.i === strand || t.j === strand) ? ' on-strand' : '') }));
            tv.render({
                T: A.tiling, tiles, label: 'pair', strand, strandTiles: list, edgeLabels: true,
                hiPairs: hover && hover.kind === 'pair' ? new Set([hover.key]) : null,
                hiMask: hover && hover.kind === 'face' ? hover.mask : null,
                markers: HG.flips(A.tiling).map((f, q) => ({ mask: f.vertex, key: f.vertex, cls: 'inert', title: 'degree 3: a triangle among the lines' })),
            });
        }
        function renderSeqs() {
            const host = $('lines-seqs'), A = last;
            host.innerHTML = '';
            if (!A) return;
            for (let k = 0; k < A.n; k++) {
                const row = html('div', { class: 'row' + (hover && hover.kind === 'line' && hover.k === k ? ' on' : '') }, host);
                html('span', { class: 'k' }, row, 'line ' + (k + 1));
                html('span', null, row, 'crosses ' + A.sequences[k].map(j => j + 1).join(', ') + '  →  tiles ' + A.sequences[k].map(j => pairLabel(A.n, Math.min(j, k), Math.max(j, k))).join(', '));
                row.addEventListener('pointerenter', () => setHover({ kind: 'line', k }));
                row.addEventListener('pointerleave', () => setHover(null));
            }
        }
        function setHover(h) {
            const same = JSON.stringify(h) === JSON.stringify(hover);
            hover = h;
            if (!same && !drag) render();
        }
        // faces: hovering the disk away from the lines picks out a vertex of the tiling
        svg.addEventListener('pointermove', e => {
            if (drag) return onDrag(e);
            if (!arr || !arr.valid) return;
            if (e.target.closest('.line-hit, .xing-hit, .handle, .arc-hit')) return;
            const p = svgPoint(svg, e);
            if (Math.hypot(p[0], p[1]) > 1) return setHover(null);
            setHover({ kind: 'face', mask: arr.sideMask(p) });
        });
        svg.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
        tv.on('hover', (kind, key) => {
            if (kind === 'tile') setHover({ kind: 'pair', key });
            else if (kind === 'marker') setHover({ kind: 'face', mask: +key });
            else setHover(null);
        });
        function startDrag(e, what) {
            e.preventDefault();
            const p = svgPoint(svg, e);
            drag = Object.assign({ p0: p, c0: chords[what.L].slice() }, what);
            svg.setPointerCapture(e.pointerId);
        }
        function onDrag(e) {
            const p = svgPoint(svg, e), L = drag.L;
            if (drag.type === 'end') {
                chords[L][drag.end] = Math.atan2(p[1], p[0]);
            } else {
                const c = drag.c0, P = [Math.cos(c[0]), Math.sin(c[0])], Q = [Math.cos(c[1]), Math.sin(c[1])];
                const d = [Q[0] - P[0], Q[1] - P[1]], dl = Math.hypot(d[0], d[1]), nrm = [-d[1] / dl, d[0] / dl];
                const s = (p[0] - drag.p0[0]) * nrm[0] + (p[1] - drag.p0[1]) * nrm[1];
                const ch = HG.chordThrough([P[0] + s * nrm[0], P[1] + s * nrm[1]], [Q[0] + s * nrm[0], Q[1] + s * nrm[1]]);
                if (!ch) return;
                // keep each endpoint attached to the same end
                const near = (t, u) => Math.abs(Math.atan2(Math.sin(t - u), Math.cos(t - u)));
                chords[L] = near(ch[0], c[0]) + near(ch[1], c[1]) <= near(ch[1], c[0]) + near(ch[0], c[1]) ? ch : [ch[1], ch[0]];
            }
            update();
        }
        svg.addEventListener('pointerup', () => { if (drag) { drag = null; render(); } });
        $('lines-reset').addEventListener('click', notes);
        $('lines-rand').addEventListener('click', () => random(+$('lines-n').value));
        $('lines-n').addEventListener('input', e => { $('lines-n-val').textContent = e.target.value; random(+e.target.value); });
        $('lines-dual').addEventListener('change', render);
        $('lines-tri').addEventListener('change', render);
        notes();
    })();

    // ================================================================ Figure 7: the braid move
    (function figBraid() {
        const svg = $('braid-svg');
        if (!svg) return;
        const tv = new TilingView($('braid-tiling'), { unit: 78, pad: 34, color: 'pair' });
        const H = AU * 1.18;
        svg.setAttribute('viewBox', `${-H} ${-H} ${2 * H} ${2 * H}`);
        const theta0 = -150 * Math.PI / 180;
        const diag = phi => [[-Math.cos(phi) * 2, -0.08 - Math.sin(phi) * 2], [Math.cos(phi) * 2, -0.08 + Math.sin(phi) * 2]];
        let t = +$('braid-t').value, T = null, busy = false, anim = null;
        function arrangementAt(t) {
            if (Math.abs(t) < 2e-3) t = t < 0 ? -2e-3 : 2e-3;
            const x = 0.42 * t;
            const lines = [diag(52 * Math.PI / 180), [[x, -0.08], [x + 0.03, 0.92]], diag(128 * Math.PI / 180)];
            return HG.arrangement(lines.map(([p, q]) => HG.chordThrough(p, q)), theta0);
        }
        function render() {
            const A = arrangementAt(t);
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            el('circle', { cx: 0, cy: 0, r: AU, class: 'disk' }, svg);
            if (!A.valid) return;
            for (const tri of A.triangles) el('polygon', { points: pts(tri.pts.map(axy)), class: 'tri' }, svg);
            A.chords.forEach((c, L) => {
                const a = axy([Math.cos(c[0]), Math.sin(c[0])]), b = axy([Math.cos(c[1]), Math.sin(c[1])]);
                el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'line' }, svg);
                const lp = axy([A.S[L][0] * 1.09, A.S[L][1] * 1.09]);
                el('text', { x: lp[0], y: lp[1], class: 'line-label' }, svg).textContent = A.label[L] + 1;
            });
            const faces = faceData(A);
            for (const d of dualEdges(A, faces)) {
                const outer = [d.m1, d.m2].every(m => HG.boundaryMasks(3).includes(m));
                el('polyline', { points: pts(d.pts.map(axy)), class: 'dual-edge', style: outer ? 'stroke:var(--ink);opacity:.9' : '' }, svg);
            }
            const inner = HG.flips(A.tiling)[0];
            if (inner && faces.get(inner.vertex)) { const c = axy(faces.get(inner.vertex).c); el('circle', { cx: c[0], cy: c[1], r: 4.5, class: 'dual-vertex' }, svg); }
            const zt = theta0, zp = [Math.cos(zt) * AU * 1.12, -Math.sin(zt) * AU * 1.12];
            el('text', { x: zp[0], y: zp[1], class: 'zero-label' }, svg).textContent = '0';
            const newT = A.tiling;
            if (T && !HG.sameTiling(T, newT) && !busy) {
                const f = flipBetween(T, newT);
                const old = T;
                T = newT;
                if (f) {
                    busy = true;
                    tv.setN(3);
                    tv.render({ T: old, label: 'pair' });
                    tv.animateFlip(f, 420, () => { busy = false; render(); });
                } else renderTiling();
            } else if (!T) { T = newT; renderTiling(); }
            else if (!busy) renderTiling();
            $('braid-word').innerHTML = `word: <span class="m">${sWord(HG.wordFromTiling(newT))}</span>`;
        }
        function renderTiling() {
            tv.setN(3);
            const F = HG.flips(T);
            tv.render({ T, label: 'pair', edgeLabels: true, markers: F.map(f => ({ mask: f.vertex, key: 0, cls: 'inert' })) });
        }
        $('braid-t').addEventListener('input', e => { if (anim) anim.cancel(); t = +e.target.value; render(); });
        $('braid-play').addEventListener('click', () => {
            if (anim) anim.cancel();
            const from = t, to = t < 0 ? 0.55 : -0.55;
            anim = tween(1800, s => { t = from + (to - from) * ease(s); $('braid-t').value = t; render(); });
        });
        render();
    })();
})();
