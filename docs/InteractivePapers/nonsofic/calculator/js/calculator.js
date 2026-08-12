'use strict';
/* Full calculator UI: registers A, B, Result, each with its own tree.
 * Editing: type syntax, or click nodes (vertex mode toggles e_a, arrow mode
 * clicks source b then target a to toggle s_a t_b). Operations animate into
 * the Result panel. Skipped entirely in ?embed=1 (walkthrough) mode.
 */
(function () {
    const params = new URLSearchParams(location.search);
    if (params.get('embed') === '1') return;
    const $ = sel => document.querySelector(sel);

    document.addEventListener('DOMContentLoaded', init);

    const L = Leavitt;
    const regs = { A: L.make([]), B: L.make([]), R: L.make([]) };
    const rawStore = { A: L.make([]), B: L.make([]) };
    const trees = {}, els = {};
    const editMode = { A: 'vertex', B: 'vertex' };
    const pendingSrc = { A: null, B: null };
    let running = false;

    const U_SYN = 's0000t000 + s0010t001 + s010t01 + s0001t1000 + s0011t1001 + s011t101 + s100t1100 + s101t1101 + s11t111';
    const TAU_SYN = '1 + e0 + e10 + s0t10 + s10t0';

    function init() {
        document.body.classList.add('full');
        $('#calcRoot').hidden = false;

        for (const reg of ['A', 'B']) setupPanel(reg, true);
        setupPanel('R', false);

        $('#opAdd').addEventListener('click', () => guard(opAdd));
        $('#opMulAB').addEventListener('click', () => guard(() => opMul('A', 'B', 'A · B')));
        $('#opMulBA').addEventListener('click', () => guard(() => opMul('B', 'A', 'B · A')));
        $('#opSqA').addEventListener('click', () => guard(() => opMul('A', 'A', 'A²')));
        $('#opInv').addEventListener('click', () => guard(opInverseCheck));
        $('#speed').addEventListener('change', e => {
            const v = parseFloat(e.target.value);
            for (const k in trees) trees[k].speed = v;
        });
        $('#toA').addEventListener('click', () => copyResult('A'));
        $('#toB').addEventListener('click', () => copyResult('B'));

        buildPresets();
        // friendly start state
        els.A.input.value = 's0t0 + s1t1';
        els.B.input.value = TAU_SYN;
        parseReg('A'); parseReg('B');
        showResult(L.make([]));
    }

    function setupPanel(reg, editable) {
        const root = $('#panel' + reg);
        els[reg] = {
            root,
            input: root.querySelector('.f-input'),
            err: root.querySelector('.f-err'),
            canon: root.querySelector('.f-canon'),
            svg: root.querySelector('svg'),
        };
        trees[reg] = new TreeViz(els[reg].svg, {
            width: reg === 'R' ? 760 : 520,
            height: reg === 'R' ? 320 : 280,
            onNodeClick: editable ? w => nodeClick(reg, w) : null,
        });
        if (!editable) return;
        els[reg].input.addEventListener('keydown', e => { if (e.key === 'Enter') parseReg(reg); });
        root.querySelector('.go').addEventListener('click', () => parseReg(reg));
        root.querySelector('.clear').addEventListener('click', () => {
            regs[reg] = L.make([]); rawStore[reg] = L.make([]);
            els[reg].input.value = ''; refresh(reg);
        });
        root.querySelector('.star').addEventListener('click', () => {
            regs[reg] = L.transpose(regs[reg]); rawStore[reg] = regs[reg];
            els[reg].input.value = L.toSyntax(regs[reg]); refresh(reg);
        });
        root.querySelector('.reduce').addEventListener('click', () => guard(() => reduceAnim(reg)));
        root.querySelectorAll('.modes button').forEach(b => {
            b.addEventListener('click', () => {
                editMode[reg] = b.dataset.mode;
                pendingSrc[reg] = null; trees[reg].setPending(null);
                root.querySelectorAll('.modes button').forEach(x => x.classList.toggle('on', x === b));
            });
        });
    }

    async function guard(fn) {
        if (running) return;
        running = true;
        try { await fn(); } finally { running = false; }
    }

    function parseReg(reg) {
        try {
            const raw = L.parse(els[reg].input.value);
            rawStore[reg] = raw;
            regs[reg] = L.canonicalize(raw);
            els[reg].err.textContent = '';
            const base = raw.size ? raw : regs[reg];
            trees[reg].setDepth(trees[reg].neededDepth(base));
            trees[reg].showElement(regs[reg]);
            els[reg].canon.innerHTML = '= ' + L.toHTML(regs[reg]);
        } catch (e) {
            els[reg].err.textContent = e.message;
        }
    }

    function refresh(reg) {
        trees[reg].setDepth(trees[reg].neededDepth(regs[reg]));
        trees[reg].showElement(regs[reg]);
        els[reg].canon.innerHTML = '= ' + L.toHTML(regs[reg]);
        els[reg].err.textContent = '';
    }

    async function nodeClick(reg, w) {
        if (running) return;
        let pr;
        if (editMode[reg] === 'vertex') {
            pr = L.mono(w, w);
        } else {
            if (pendingSrc[reg] === null) {
                pendingSrc[reg] = w;
                trees[reg].setPending(w);
                return;
            }
            pr = L.mono(w, pendingSrc[reg]);       // target a = w, source b = pending
            pendingSrc[reg] = null;
            trees[reg].setPending(null);
        }
        const raw = L.make([...regs[reg].values()]);
        L.xor(raw, pr);
        const trace = [];
        const res = L.canonicalize(raw, trace);
        regs[reg] = res; rawStore[reg] = res;
        els[reg].input.value = L.toSyntax(res);
        trees[reg].setDepth(trees[reg].neededDepth(raw.size ? raw : res));
        trees[reg].showElement(raw);
        if (trace.length) await guard(() => trees[reg].playSteps(trace));
        refresh(reg);
    }

    async function reduceAnim(reg) {
        const raw = rawStore[reg] && rawStore[reg].size ? rawStore[reg] : regs[reg];
        const trace = [];
        const res = L.canonicalize(raw, trace);
        trees[reg].setDepth(trees[reg].neededDepth(raw));
        trees[reg].showElement(raw);
        await trees[reg].sleep(400);
        await trees[reg].playSteps(trace);
        trees[reg].showElement(res);
        els[reg].canon.innerHTML = '= ' + L.toHTML(res);
    }

    function showResult(el, label) {
        regs.R = el;
        trees.R.setDepth(trees.R.neededDepth(el));
        trees.R.showElement(el);
        $('#fR').innerHTML = (label ? label + ' = ' : '') + L.toHTML(el);
    }
    const liveFormula = tv => { $('#fR').innerHTML = L.toHTML(L.make(tv.currentPairs())); };

    async function opAdd() {
        $('#verdict').textContent = '';
        const traces = { canon: [] };
        const res = L.add(regs.A, regs.B, traces);
        const rawPairs = [...regs.A.values(), ...regs.B.values()];
        trees.R.setDepth(trees.R.neededDepth(rawPairs.length ? rawPairs : res));
        trees.R.showPairs(rawPairs);
        // duplicates across A and B collapse visually; the cancel steps handle them
        await trees.R.sleep(400);
        await trees.R.playSteps(traces.canon, liveFormula);
        showResult(res, 'A + B');
    }

    async function opMul(x, y, label) {
        $('#verdict').textContent = '';
        const traces = { pairs: [], canon: [] };
        const res = L.mul(regs[x], regs[y], traces);
        const big = traces.pairs.length > 12;
        const oldSpeeds = [trees.R.speed, trees[x].speed, trees[y].speed];
        if (big && trees.R.speed > 0) { trees.R.speed = 3; trees[x].speed = 3; trees[y].speed = 3; }
        trees.R.setDepth(trees.R.neededDepth(regs[x].size + regs[y].size ? [...regs[x].values(), ...regs[y].values()] : res));
        trees.R.clearMarkers();
        $('#fR').innerHTML = '&hellip;';
        for (const st of traces.pairs) {
            const kp = L.key(st.p), kq = L.key(st.q);
            trees[x].setHL(kp, true); trees[y].setHL(kq, true);
            if (st.r) { await trees.R.spawn(st.r); liveFormula(trees.R); }
            else if (!big) await trees.R.flashZero('0');
            await trees.R.sleep(70);
            trees[x].setHL(kp, false); trees[y].setHL(kq, false);
        }
        await trees.R.sleep(250);
        await trees.R.playSteps(traces.canon, liveFormula);
        [trees.R.speed, trees[x].speed, trees[y].speed] = oldSpeeds;
        showResult(res, label);
    }

    async function opInverseCheck() {
        const ab = L.mul(regs.A, regs.B);
        const ba = L.mul(regs.B, regs.A);
        const okAB = L.equalsOne(ab), okBA = L.equalsOne(ba);
        showResult(ab, 'A · B');
        $('#verdict').innerHTML =
            `A·B = ${L.toHTML(ab)} &nbsp;&nbsp; B·A = ${L.toHTML(ba)} &nbsp;&nbsp; ` +
            (okAB && okBA ? '<span class="ok">✓ B = A⁻¹ in R×</span>'
                          : '<span class="no">not mutually inverse</span>');
    }

    function copyResult(reg) {
        regs[reg] = L.make([...regs.R.values()]);
        rawStore[reg] = regs[reg];
        els[reg].input.value = L.toSyntax(regs[reg]);
        refresh(reg);
    }

    function buildPresets() {
        const uT = L.toSyntax(L.transpose(L.parse(U_SYN)));
        const presets = [
            { label: 'relation s₀t₀+s₁t₁', A: 's0t0 + s1t1', note: 'reduce A to see it equal 1' },
            { label: 'one-sided: t₀, s₀', A: 't0', B: 's0', note: 'A·B = 1 but B·A = e₀' },
            { label: 'swap τ: [0]↔[10]', A: TAU_SYN, B: TAU_SYN, note: 'A² = 1 — an involution in R×' },
            { label: 'elementary 1+s₀₀t₀₁', A: '1 + s00t01', B: '1 + s00t01', note: 'elementary roots square to 1' },
            { label: 'contraction u (paper)', A: U_SYN, B: uT, note: 'B = u*; check A·B = B·A = 1' },
        ];
        const bar = $('#presets');
        for (const p of presets) {
            const b = document.createElement('button');
            b.textContent = p.label;
            b.title = p.note;
            b.addEventListener('click', () => {
                if (running) return;
                els.A.input.value = p.A; parseReg('A');
                if (p.B !== undefined) { els.B.input.value = p.B; parseReg('B'); }
                $('#verdict').textContent = '';
            });
            bar.appendChild(b);
        }
    }
})();
