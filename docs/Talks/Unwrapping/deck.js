// Unwrapping an indiscrete group: reveal setup, and the two live stages behind the slides.
//
// A slide with data-stage="poincare" or "tree" shows that app (an iframe on the same origin)
// and lets the pointer through to it. Its state is a function of the slide's step, the number
// of fragment groups shown, so jumping around or stepping back stays in sync: each controller's
// go(step) plays the change when it is one step forward and otherwise sets the state at once.
(function () {
    'use strict';

    Reveal.initialize({
        hash: true,
        controls: true,
        progress: true,
        center: true,
        width: 960,
        height: 700,
        navigationMode: 'linear',
        transition: 'slide',
        backgroundTransition: 'fade',
        mathjax3: {
            mathjax: 'vendor/mathjax/tex-mml-chtml.js',
            tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] },
            options: { enableMenu: false },
        },
        plugins: [RevealMath.MathJax3, RevealNotes],
    });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (ok, ms = 30000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) return false; await sleep(60); } return true; };

    // The group: Riley's figure-eight generators, and y conjugated by z ↦ z + π (poincare's syntax).
    const G8 = [['1', '1', '0', '1'], ['1', '0', '-\\omega', '1']];
    const GPI = [...G8, ['1-\\omega\\pi', '\\omega\\pi^2', '-\\omega', '1+\\omega\\pi']];
    // the same group over ℚ(ω)(t) in 2dimFields, at t = π
    const FIG8 = 'Shalen: the double of the figure-eight knot complement';

    // ── stages ───────────────────────────────────────────────────────
    const stages = {};
    function addStage(name, ctrl) {
        const el = document.getElementById(`stage-${name}`), frame = el.querySelector('iframe');
        stages[name] = { el, frame, ctrl };
        ctrl.frame = frame;
    }
    // Arrow keys and the like still drive the deck after a click into an app.
    const NAV = { ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev' };
    function bridgeKeys(win) {
        win.addEventListener('keydown', (e) => {
            const go = NAV[e.key];
            if (!go || e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = (e.target && e.target.tagName) || '';
            if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
            e.preventDefault();
            e.stopPropagation();
            Reveal[go]();
            window.focus();
        }, true);
    }
    function loadStages() {
        for (const { frame } of Object.values(stages)) {
            if (frame.src) continue;
            frame.addEventListener('load', () => bridgeKeys(frame.contentWindow));
            frame.src = frame.dataset.src;
        }
    }

    // ── poincare: ⟨x, y⟩ and its domain, its orbit, then Γ = ⟨x, y, y_π⟩ ────
    const poincare = {
        frame: null, group: null, token: 0, last: null,
        async api() {
            await until(() => this.frame.contentWindow && this.frame.contentWindow.PoincareAPI);
            const API = this.frame.contentWindow.PoincareAPI;
            await until(() => API.state().report);                // the default group is in
            return API;
        },
        // Replace the generators through the app's own input module (same module instance as its main.js).
        async setGroup(key, mats) {
            if (this.group === key) return;
            this.group = key;
            const w = this.frame.contentWindow, d = w.document;
            w.__deckState = { mats, anti: mats.map(() => false), consts: [] };
            const done = new Promise((res) => { w.addEventListener('poincare:refreshed', res, { once: true }); setTimeout(res, 20000); });
            const s = d.createElement('script');
            s.type = 'module';
            s.textContent = "import { applyInputState } from './js/matrixInput.js';\n"
                + 'applyInputState(window.__deckState);\nsetTimeout(() => PoincareAPI.refresh(), 50);';
            d.body.appendChild(s);
            await done;
            await sleep(150);
        },
        async go(step) {
            const token = ++this.token, API = await this.api();
            await this.setGroup(step >= 2 ? 'pi' : 'g8', step >= 2 ? GPI : G8);
            if (token !== this.token) return;
            API.setOrbit(step >= 1);
            if (API.setAutoRotate) API.setAutoRotate(step === 0);
            this.caption(API.state().report);
        },
        // What the app concluded, in the captions: the polyhedron, or its non-discreteness witness.
        caption(R) {
            let html = '';
            if (R && R.status === 'verified') {
                const poly = (R.log || []).find((l) => /faces, .* edges/.test(l)) || '';
                html = `✓ certified: ${poly.replace(/;.*$/, '')}`;
            } else if (R && R.nondiscrete && R.nondiscrete.headline) {
                const name = (s) => s.replace(/g1/g, 'x').replace(/g2/g, 'y').replace(/g3/g, 'y<sub>π</sub>');
                const rot = (R.log || []).map((l) => /rotating by θ ≈ ([0-9.e-]+)π/.exec(l)).find(Boolean);
                html = `${name(R.nondiscrete.headline)}${rot ? `, rotating by θ ≈ ${Number(rot[1]).toPrecision(2)}π` : ''}`;
            } else if (R) html = `no domain (${R.status})`;
            document.querySelectorAll('[data-live="poincare"]').forEach((el) => { el.innerHTML = html; });
        },
    };

    // ── 2dimFields: the double at t = π, unwrapped into the tree of ℍ³'s ────
    // depth 3, smaller children, longer edges, coloured by branch at v₀: the structure reads on a projector
    const LOOK = { lam: 0.75, h: -1.4, rule: 'branch' };
    const S = (extra) => ({ field: 'omega', example: FIG8, specA: 'pi', view: 'default', dep: 3, settings: LOOK, ...extra });
    const tree = {
        frame: null, at: null, token: 0,
        states: [
            S({ collapsed: true, view: 'collapsed' }),   // 0: one ℍ³, at t = π
            S(),                                         // 1: the tree
            S({ apply: [[0, false], [1, false]] }),      // 2: x, then y
            S({ apply: [[2, false]] }),                  // 3: y_t
        ],
        async app() {
            await until(() => this.frame.contentWindow && this.frame.contentWindow.__twoDim);
            await sleep(100);
            return this.frame.contentWindow.__twoDim;
        },
        async go(step) {
            const token = ++this.token, T = await this.app(), api = T.tutorialAPI;
            if (token !== this.token) return;
            const from = this.at;
            this.at = step;
            if (from === step) return;
            if (from === step - 1) {                         // one step forward: play it
                if (step === 1) T.startSpecRun(0);           // t runs from π back to ∞
                else if (step === 2) await api.effect({ gens: [[0, false], [1, false]] });
                else if (step === 3) { api.prepare(this.states[1]); await api.settle(); if (token === this.token) await api.effect({ gens: [[2, false]] }); }
                return;
            }
            if (from === 1 && step === 0) { await api.effect({ collapse: true }); return; }   // back: collapse again
            api.prepare(this.states[step]);
        },
    };

    // A separate instance keeps the first view independent of the later domain demo.
    const orbit = {
        frame: null, group: null, ready: null,
        api: poincare.api,
        setGroup: poincare.setGroup,
        async go() {
            if (this.ready) return this.ready;
            this.ready = (async () => {
                const API = await this.api();
                await this.setGroup('pi', GPI);
                API.setDomainVisible(false);
                API.setPolyhedronOpacity(0);
                API.setDual('off');
                API.setDust(true);
                API.setOrbit(true);
                API.setCayleyMode('S');
                API.setAutoRotate(false);
            })().catch(e => { this.ready = null; console.error('Unwrapping orbit:', e); });
            return this.ready;
        },
    };
    document.querySelectorAll('[data-generator]').forEach(button => {
        button.addEventListener('click', async e => {
            await orbit.go();
            const api = orbit.frame.contentWindow.PoincareAPI;
            if (api) api.animateGenerator(Number(button.dataset.generator), e);
        });
    });

    addStage('orbit', orbit);
    addStage('poincare', poincare);
    addStage('tree', tree);

    // ── sync with reveal ────────────────────────────────────────────
    function stepOf(slide) {
        let k = 0;
        slide.querySelectorAll('.fragment.visible[data-fragment-index]').forEach((f) => { k = Math.max(k, Number(f.dataset.fragmentIndex) + 1); });
        return k;
    }
    function sync() {
        const slide = Reveal.getCurrentSlide(), requested = slide && slide.dataset.stage;
        const step = slide ? stepOf(slide) : 0;
        const name = requested === 'tree' && step === 0 ? 'orbit' : requested;
        for (const [n, st] of Object.entries(stages)) st.el.classList.toggle('on', n === name);
        document.body.classList.toggle('stage-live', !!name);
        if (name) stages[name].ctrl.go(name === 'tree' ? Math.max(0, step - 1) : step);
    }
    Reveal.on('ready', () => {
        sync();
        // load the apps once the first slide is up, and put each in its first state
        setTimeout(() => {
            loadStages();
            const cur = Reveal.getCurrentSlide();
            for (const [n, st] of Object.entries(stages)) if (!cur || cur.dataset.stage !== n) st.ctrl.go(0);
        }, 400);
    });
    Reveal.on('slidechanged', sync);
    Reveal.on('fragmentshown', sync);
    Reveal.on('fragmenthidden', sync);

    window.__deck = { stages, poincare, tree, sync };
})();
