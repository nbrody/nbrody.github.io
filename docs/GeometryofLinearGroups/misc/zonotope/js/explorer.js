// explorer.js — the full-screen sandbox. State is a tiling T together with one word w
// of its commutation class; every action keeps the two in step.
(function () {
    'use strict';
    const { TilingView, WordChips, drawWiring } = HGR;
    const $ = id => document.getElementById(id);
    const view = new TilingView($('ex-svg'), { unit: 60, pad: 34 });
    const chips = new WordChips($('ex-word'));

    let n = 6, word = HG.wordA(6), T = HG.tilingFromWord(6, word), history = [], busy = false;
    let flash = null, hoverPair = null, hoverLetter = null, sweepStep = null, timer = null, flips = 0, walking = false;
    const speed = () => +$('ex-speed').value;
    const randWord = TT => HG.wordFromTiling(TT, av => av[Math.floor(Math.random() * av.length)]);

    function setTiling(w, keepHistory) {
        if (!keepHistory) history = [];
        word = w.slice();
        T = HG.tilingFromWord(n, word);
        render();
    }
    function render() {
        view.opts.color = $('ex-color').value;
        view.setN(n);
        const sw = HG.sweep(n, word);
        const stepOf = new Map(sw.steps.map((st, q) => [st.i + ',' + st.j, q]));
        const tiles = sw.steps.map((st, q) => ({
            i: st.i, j: st.j, base: st.base, step: q,
            cls: sweepStep != null && q >= sweepStep ? 'dim' : sweepStep != null && q === sweepStep - 1 ? 'fresh' : '',
        }));
        const hi = new Set();
        if (hoverLetter != null) { const st = sw.steps[hoverLetter]; hi.add(st.i + ',' + st.j); }
        if (flash) for (const q of flash) { const st = sw.steps[q]; if (st) hi.add(st.i + ',' + st.j); }
        const F = HG.flips(T);
        view._flips = F;
        const sv = $('ex-strand').value;
        const strand = sv === '' ? null : +sv;
        view.render({
            T, tiles, label: $('ex-label').value, hiPairs: hi, edgeLabels: $('ex-edges').checked,
            strand, strandTiles: strand != null ? HG.strand(T, strand) : null,
            paths: sweepStep != null && sweepStep < word.length ? [{ perm: HG.permOf(n, word.slice(0, sweepStep)), cls: 'cur' }] : [],
            markers: $('ex-dots').checked && sweepStep == null ? F.map((f, q) => ({ mask: f.vertex, key: q, title: `flip the hexagon ${f.a + 1}${f.b + 1}${f.c + 1}` })) : [],
        });
        const hiLetters = new Set();
        if (hoverPair && stepOf.has(hoverPair)) hiLetters.add(stepOf.get(hoverPair));
        chips.render(word, { active: sweepStep != null ? sweepStep : null, hi: hiLetters, flash: flash ? new Set(flash) : null });
        flash = null;
        drawWiring($('ex-wiring'), n, word, { active: sweepStep, hiWire: strand });
        const size = n <= 7 ? HG.classSize(word, 300000) : null;
        const known = HG.KNOWN.tilings[n];
        $('ex-info').innerHTML =
            `${F.length} ${F.length === 1 ? 'vertex' : 'vertices'} of degree 3 · ${flips} ${flips === 1 ? 'flip' : 'flips'} so far<br>` +
            (size != null ? `${size.toLocaleString()} ${size === 1 ? 'word' : 'words'} in this commutation class<br>` : '') +
            `lexicographically first: <span class="m">${HG.formatWord(HG.lexFirst(word))}</span>`;
        $('ex-size').innerHTML = `${2 * n}-gon · ${n * (n - 1) / 2} tiles${known ? ` · ${known.toLocaleString()} tilings` : ''}`;
        $('ex-undo').disabled = !history.length || busy;
        writeUrl();
    }
    // Flip f, changing the word by a literal 3-move on a commutation-equivalent word.
    function doFlip(f, after) {
        if (busy) return;
        const al = HG.alignFlip(n, word, f);
        const w2 = HG.applyMove(al.word, { p: al.p, kind: 3 });
        history.push(word);
        busy = true;
        view.animateFlip(f, 420 / speed(), () => {
            busy = false;
            word = w2; T = HG.tilingFromWord(n, word); flips++;
            flash = [al.p, al.p + 1, al.p + 2];
            render();
            if (after) after();
        });
    }
    view.on('pick', (kind, key) => { if (kind === 'marker') { stop(); doFlip(view._flips[+key]); } });
    view.on('hover', (kind, key) => {
        const hp = kind === 'tile' ? key : null;
        if (hp === hoverPair) return;
        hoverPair = hp;
        if (!busy) render();
    });
    chips.on('move', m => {
        if (busy) return;
        stop();
        const w2 = HG.applyMove(word, m);
        if (m.kind === 2) { history.push(word); word = w2; flash = [m.p, m.p + 1]; render(); return; }
        const S = HG.tilingFromWord(n, w2);
        const f = HG.flips(T).find(g => {
            const U = HG.flip(T, g);
            return HG.sameTiling(U, S);
        });
        if (!f) return;
        history.push(word);
        busy = true;
        view.animateFlip(f, 420 / speed(), () => { busy = false; word = w2; T = S; flips++; flash = [m.p, m.p + 1, m.p + 2]; render(); });
    });
    chips.on('hover', (kind, v) => {
        const h = kind === 'letter' ? v : null;
        if (h === hoverLetter) return;
        hoverLetter = h;
        if (!busy) render();
    });

    // ---- animations
    function stop() {
        if (timer) { clearTimeout(timer); timer = null; }
        sweepStep = null;
        $('ex-sweep').textContent = '▶ sweep p₀ → p₁';
        $('ex-walk').textContent = '▶ flip to the other end';
        walking = false;
    }
    $('ex-sweep').addEventListener('click', () => {
        if (sweepStep != null) { stop(); render(); return; }
        stop();
        sweepStep = 0;
        $('ex-sweep').textContent = '■ stop';
        const tick = () => {
            render();
            if (sweepStep >= word.length) { timer = setTimeout(() => { stop(); render(); }, 700); return; }
            sweepStep++;
            timer = setTimeout(tick, 380 / speed());
        };
        tick();
    });
    $('ex-walk').addEventListener('click', () => {
        if (walking) { stop(); render(); return; }
        stop();
        walking = true;
        $('ex-walk').textContent = '■ stop';
        const C = view.world(0);
        const next = () => {
            if (!walking) return;
            const low = HG.flips(T).filter(f => f.kind === 'low');
            if (!low.length) { stop(); render(); return; }
            // nearest the vertex 0 first, so the walk sweeps across the polygon
            low.sort((f, g) => {
                const a = view.world(f.vertex), b = view.world(g.vertex);
                return Math.hypot(a[0] - C[0], a[1] - C[1]) - Math.hypot(b[0] - C[0], b[1] - C[1]);
            });
            doFlip(low[0], () => { if (walking) timer = setTimeout(next, 120 / speed()); });
        };
        next();
    });

    // ---- controls
    function fillStrands() {
        const sel = $('ex-strand'), was = sel.value;
        sel.innerHTML = '<option value="">none</option>';
        for (let k = 0; k < n; k++) { const o = document.createElement('option'); o.value = k; o.textContent = 'direction ' + (k + 1); sel.appendChild(o); }
        sel.value = was !== '' && +was < n ? was : '';
    }
    $('ex-n').addEventListener('input', e => {
        stop();
        n = +e.target.value; $('ex-n-val').textContent = n; flips = 0;
        fillStrands();
        setTiling(HG.wordA(n));
    });
    $('ex-a').addEventListener('click', () => { stop(); flips = 0; setTiling(HG.wordA(n)); });
    $('ex-b').addEventListener('click', () => { stop(); flips = 0; setTiling(HG.wordB(n)); });
    $('ex-rand').addEventListener('click', () => { stop(); flips = 0; setTiling(randWord(HG.randomTiling(n, 30 * n * n))); });
    $('ex-undo').addEventListener('click', () => {
        if (busy || !history.length) return;
        stop();
        word = history.pop(); T = HG.tilingFromWord(n, word);
        render();
    });
    $('ex-speed').addEventListener('input', e => { $('ex-speed-val').textContent = (+e.target.value).toFixed(1) + '×'; });
    for (const id of ['ex-color', 'ex-label', 'ex-strand', 'ex-dots', 'ex-edges']) $(id).addEventListener('change', render);
    document.addEventListener('keydown', e => {
        if (e.target.closest('input, select, textarea')) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); $('ex-undo').click(); }
    });

    // ---- ?n=6&w=123454321234323 to share a tiling
    function writeUrl() {
        const q = new URLSearchParams();
        q.set('n', n);
        q.set('w', HG.formatWord(word, n > 10 ? '.' : ''));
        try { window.history.replaceState(null, '', '?' + q.toString()); } catch (e) { /* file:// */ }
    }
    (function readUrl() {
        const q = new URLSearchParams(location.search);
        const nn = +q.get('n');
        if (nn >= 3 && nn <= 12) n = nn;
        $('ex-n').value = n; $('ex-n-val').textContent = n;
        fillStrands();
        const w = q.get('w') ? HG.parseWord(q.get('w')) : null;
        setTiling(w && HG.isLongest(n, w) ? w : HG.wordA(n));
    })();
})();
