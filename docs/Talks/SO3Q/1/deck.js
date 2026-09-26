/**
 * deck.js — SO₃(ℚ), part 1.
 *
 *  • reveal.js set-up (linear navigation: → and Space step through
 *    everything, vertical stacks included).
 *  • Visualization stages: full-bleed iframes outside .reveal.  A slide with
 *    data-stage="grid" shows #stage-grid; its step is the data-step of the
 *    last visible .stage-step fragment, else the slide's own data-step.
 *    Everything is re-derived from the DOM on every change, so jumping
 *    straight to a slide (hash, overview, remote) can never desync a scene.
 *  • The denominator sieve and the rotation factorizer (in-slide widgets).
 *  • The slowly turning crown of rational points behind the title.
 */
(function () {
    'use strict';
    if (window.IS_REMOTE) return;
    const G = window.Gauss;

    Reveal.initialize({
        hash: true,
        controls: true,
        progress: true,
        center: true,
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

    // ── stages ─────────────────────────────────────────────────────
    const stages = [...document.querySelectorAll('.stage')];
    const frameOf = (stage) => stage.querySelector('iframe');
    const wasActive = new Map();

    function load(stage) {
        const f = frameOf(stage);
        if (f && !f.getAttribute('src')) f.src = f.dataset.src;
    }
    function post(stage, msg) {
        const f = frameOf(stage);
        if (f && f.getAttribute('src') && f.contentWindow) f.contentWindow.postMessage(msg, '*');
    }
    function stepFor(slide) {
        let step = slide.dataset.step;
        slide.querySelectorAll('.fragment.stage-step').forEach((f) => {
            if (f.classList.contains('visible')) step = f.dataset.step;
        });
        return step;
    }

    function syncStages() {
        const slide = Reveal.getCurrentSlide();
        const want = slide && slide.dataset.stage && !Reveal.isOverview() ? 'stage-' + slide.dataset.stage : null;
        for (const st of stages) {
            const on = st.id === want;
            if (on) load(st);
            st.classList.toggle('active', on);
            if (on) {
                post(st, { type: 'active', on: true });
                post(st, { type: 'goTo', step: stepFor(slide) });
            } else if (wasActive.get(st.id)) {
                post(st, { type: 'active', on: false });
                // hand the keyboard back to the deck if the scene had it
                if (document.activeElement === frameOf(st)) { frameOf(st).blur(); window.focus(); }
            }
            wasActive.set(st.id, on);
        }
    }

    // Scenes talk back: arrow keys pressed inside a scene, other deck
    // shortcuts, and "I've loaded — tell me where we are".
    window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'iframeNav') {
            if (d.direction === 'prev') Reveal.prev(); else Reveal.next();
        } else if (d.type === 'iframeKey' && typeof d.keyCode === 'number') {
            Reveal.triggerKey(d.keyCode);
        } else if (d.type === 'vizReady') {
            const st = stages.find((s) => frameOf(s).contentWindow === e.source);
            if (st && !st.classList.contains('active')) post(st, { type: 'active', on: false });
            syncStages();
        }
    });

    // ── the denominator sieve ──────────────────────────────────────
    const sieve = document.getElementById('sieve');
    if (sieve) {
        const occurs = (n) => n === 1 || (n % 2 === 1 && G.factor(n).every(([p]) => p % 4 === 1));
        for (let n = 1; n <= 100; n++) {
            const d = document.createElement('div');
            d.className = 'n';
            d.textContent = n;
            if (occurs(n)) d.classList.add('occ');
            if (G.isPrime(n) && n % 4 === 1) d.classList.add('p1');
            if (G.isPrime(n) && n % 4 === 3) d.classList.add('p3');
            sieve.appendChild(d);
        }
    }
    function syncSieve() {
        const slide = Reveal.getCurrentSlide();
        if (!sieve || !slide || !slide.contains(sieve)) return;
        let phase = 0;
        slide.querySelectorAll('.fragment[data-sieve]').forEach((f) => {
            if (f.classList.contains('visible')) phase = Math.max(phase, Number(f.dataset.sieve));
        });
        sieve.dataset.phase = phase;
    }

    // ── the factorizer ─────────────────────────────────────────────
    function typeset(el) {
        if (window.MathJax && MathJax.typesetPromise) {
            return MathJax.typesetPromise([el]).catch((err) => console.warn('MathJax', err));
        }
        return new Promise((res) => setTimeout(() => typeset(el).then(res), 250));
    }

    const fz = document.getElementById('factorizer');
    if (fz) {
        const CHIPS = [[3, 4, 5], [4, 3, 5], [-7, 24, 25], [33, 56, 65], [-117, 44, 125], [119, 120, 169], [943, 576, 1105], [6, 8, 10]];
        const inputs = ['a', 'b', 'c'].map((k) => document.getElementById('fz-' + k));
        const out = document.getElementById('fz-out');
        const chipBox = fz.querySelector('.fz-chips');
        const minus = G.minus;
        CHIPS.forEach((t) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `(${t.map(minus).join(', ')})`;
            btn.addEventListener('click', () => {
                t.forEach((v, i) => { inputs[i].value = minus(v); });
                render();
            });
            chipBox.appendChild(btn);
        });

        const parse = (s) => {
            s = String(s).replace(/[\u2212\u2013\u2014]/g, '-').replace(/\s+/g, '');
            return /^-?\d{1,15}$/.test(s) ? BigInt(s) : null;
        };
        const texInt = (x) => String(x);
        function texFrac(a, b, c) {
            let num;
            if (b === 0n) num = texInt(a);
            else if (a === 0n) num = (b === 1n ? '' : b === -1n ? '-' : texInt(b)) + 'i';
            else num = `${texInt(a)} ${b < 0n ? '-' : '+'} ${(b < 0n ? -b : b) === 1n ? '' : texInt(b < 0n ? -b : b)}i`;
            return c === 1n ? num : `\\frac{${num}}{${c}}`;
        }
        const texFactor = (fs) => fs.map(([p, e]) => (e > 1 ? `${p}^{${e}}` : `${p}`)).join('\\cdot ');
        const composite = (c) => { const fs = c > 1n ? G.factor(c) : []; return fs.length > 1 || (fs.length === 1 && fs[0][1] > 1); };

        let pending = 0;
        function render() {
            const [a, b, c] = inputs.map((i) => parse(i.value));
            chipBox.querySelectorAll('button').forEach((btn, i) => {
                const t = CHIPS[i];
                btn.classList.toggle('on', a === BigInt(t[0]) && b === BigInt(t[1]) && c === BigInt(t[2]));
            });
            let html;
            if (a === null || b === null || c === null) {
                html = '<div class="fz-err">Enter integers \\(a, b, c\\) with \\(a^2 + b^2 = c^2\\).</div>';
            } else {
                const f = G.factorRotation(a, b, c);
                if (!f.ok) {
                    html = `<div class="fz-err">\\(${texInt(a)}^2 + ${texInt(b)}^2 \\ne ${texInt(c)}^2\\): not a rotation.</div>`;
                } else {
                    const reduced = f.c !== (c < 0n ? -c : c);
                    const lhs = texFrac(f.a, f.b, f.c);
                    const live = f.exps.filter(([, n]) => n);
                    const coords = live.length === 0 ? '\\text{the origin}'
                        : live.length === 1 ? `n_{${live[0][0]}} = ${live[0][1]}`
                        : `(${live.map(([p]) => `n_{${p}}`).join(', ')}) = (${live.map(([, n]) => n).join(', ')})`;
                    html = `<div class="fz-main">\\[ \\tfrac1{${f.c}}\\begin{pmatrix} ${f.a} & ${-f.b} \\\\ ${f.b} & ${f.a} \\end{pmatrix} \\;=\\; ${lhs} \\;=\\; ${G.wordTeX(f.u, f.exps)} \\]</div>` +
                        (reduced ? `<div class="fz-row">(in lowest terms)</div>` : '') +
                        `<div class="fz-row">denominator \\(${f.c}${composite(f.c) ? ' = ' + texFactor(G.factor(f.c)) : ''}\\)</div>` +
                        `<div class="fz-row">lattice point \\(${coords}\\)${live.length ? ', all other \\(n_p = 0\\)' : ''}</div>`;
                }
            }
            const ticket = ++pending;
            out.style.visibility = 'hidden';
            out.innerHTML = html;
            typeset(out).then(() => { if (ticket === pending) out.style.visibility = 'visible'; });
        }
        let timer = 0;
        inputs.forEach((inp) => {
            inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 280); });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); inp.blur(); render(); }
            });
        });
        CHIPS[3].forEach((v, i) => { inputs[i].value = minus(v); });
        render();
    }

    // ── the crown behind the title ─────────────────────────────────
    const crownCv = document.getElementById('title-crown');
    const crown = (() => {
        if (!crownCv) return { show() {} };
        const ctx = crownCv.getContext('2d');
        const pts = G.rationalPoints(1600).sort((p, q) => q.c - p.c);
        const img = document.createElement('canvas');
        let W = 0, H = 0, dpr = 1, R = 0, on = false, raf = 0, t0 = performance.now();

        function paintCrown() {
            const S = Math.ceil(2 * R * 1.42 + 20);
            img.width = img.height = Math.ceil(S * dpr);
            const g = img.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, S / 2 * dpr, S / 2 * dpr);
            g.strokeStyle = 'rgba(124,138,255,0.25)';
            g.lineWidth = 1;
            g.beginPath(); g.arc(0, 0, R, 0, 2 * Math.PI); g.stroke();
            for (const p of pts) {
                const t = Math.min(1, Math.log(p.c) / Math.log(1600));
                const col = `${Math.round(253 - 143 * t)},${Math.round(224 - 99 * t)},${Math.round(140 + 70 * t)}`;
                const len = p.c === 1 ? 0.3 * R : 0.21 * R * 5 / p.c;
                const ux = Math.cos(p.angle), uy = -Math.sin(p.angle);
                g.strokeStyle = `rgba(${col},${p.c <= 30 ? 0.9 : 0.55})`;
                g.lineWidth = p.c === 1 ? 2.2 : p.c <= 30 ? 1.6 : 1;
                g.beginPath(); g.moveTo(ux * R, uy * R); g.lineTo(ux * (R + len), uy * (R + len)); g.stroke();
                g.fillStyle = `rgba(${col},0.95)`;
                g.beginPath(); g.arc(ux * R, uy * R, 0.8 + 4.4 / Math.sqrt(p.c), 0, 2 * Math.PI); g.fill();
            }
        }
        function resize() {
            const d = Math.min(window.devicePixelRatio || 1, 2);
            if (window.innerWidth === W && window.innerHeight === H && d === dpr) return;
            W = window.innerWidth; H = window.innerHeight; dpr = d;
            crownCv.width = Math.round(W * dpr); crownCv.height = Math.round(H * dpr);
            crownCv.style.width = W + 'px'; crownCv.style.height = H + 'px';
            R = 0.37 * Math.min(W, H);
            paintCrown();
        }
        function frame(now) {
            raf = on ? requestAnimationFrame(frame) : 0;
            resize();
            const S = img.width / dpr;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, crownCv.width, crownCv.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.translate(W / 2, H / 2);
            ctx.rotate((now - t0) / 1000 * 0.02);
            ctx.drawImage(img, -S / 2, -S / 2, S, S);
        }
        return {
            show(v) {
                on = v;
                crownCv.classList.toggle('on', v);
                if (v && !raf) raf = requestAnimationFrame(frame);
            },
        };
    })();

    // ── wiring ─────────────────────────────────────────────────────
    function sync() {
        syncStages();
        syncSieve();
        const slide = Reveal.getCurrentSlide();
        crown.show(!!slide && slide.id === 'title' && !Reveal.isOverview());
    }
    ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden', 'overviewshown', 'overviewhidden']
        .forEach((ev) => Reveal.on(ev, sync));
    Reveal.on('ready', () => {
        // warm both scenes up in the background so the first visit is instant
        setTimeout(() => stages.forEach(load), 1200);
    });
})();
