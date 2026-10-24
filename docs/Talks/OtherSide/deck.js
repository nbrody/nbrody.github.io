// The other side of the prompt: reveal setup, live demo stages, presenter cue cards, two charts.
//
// Stages. A slide with data-stage="name" data-src="url" shows that app full-screen behind the
// slide (an iframe, same origin when served by serve.sh) and lets the pointer through to it, so
// Nic can use the app; the cue card and the reveal controls stay clickable. Apps load when their
// slide is current or next, and unload once the deck is 3+ slides away (WebGL contexts are scarce).
// Arrow keys pressed inside an app still drive the deck, except on slides with data-keys="app".
//
// Keys: C hides/shows every cue card; S speaker view (notes: timing, script, demo steps).
(function () {
    'use strict';
    if (window.IS_REMOTE) return;   // the phone remote (remote.js) shares this page

    Reveal.initialize({
        hash: true,
        controls: true,
        progress: true,
        center: true,
        width: 960,
        height: 700,
        margin: 0.04,
        navigationMode: 'linear',
        transition: 'slide',
        backgroundTransition: 'fade',
        pdfSeparateFragments: false,
        mathjax3: {
            mathjax: 'vendor/mathjax/tex-mml-chtml.js',
            tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] },
            options: { enableMenu: false },
        },
        plugins: [RevealMath.MathJax3, RevealNotes],
    });

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (ok, ms = 30000) => { const t0 = Date.now(); while (!ok()) { if (Date.now() - t0 > ms) return false; await sleep(60); } return true; };

    // Served from Dropbox/Code by serve.sh, nicjams.github.io is reachable by a relative path;
    // anywhere else (GitHub Pages) a data-src-public URL is used instead.
    const LOCAL_ROOT = /\/nbrody\.github\.io\/docs\//.test(location.pathname);
    const srcOf = (slide) => (!LOCAL_ROOT && slide.dataset.srcPublic) ? slide.dataset.srcPublic : slide.dataset.src;

    // First-visit popups in the apps would cover the demo. Same origin, so pre-dismiss them.
    try {
        localStorage.setItem('poincare.welcome.v2', '1');
    } catch (e) { /* private mode */ }

    // ── stages ───────────────────────────────────────────────────────
    const stages = {};            // name -> { el, frame, slides:[], loaded, ctrl }
    const controllers = {};       // name -> { go(step), reset() } for scripted stages
    const NAV = { ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev' };

    function bridgeKeys(name, win) {
        try {
            win.addEventListener('keydown', (e) => {
                const slide = Reveal.getCurrentSlide();
                if (slide && slide.dataset.keys === 'app') return;
                const go = NAV[e.key];
                if (!go || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
                const t = e.target, tag = (t && t.tagName) || '';
                if (/INPUT|TEXTAREA|SELECT/.test(tag) || (t && t.isContentEditable)) return;
                e.preventDefault();
                e.stopPropagation();
                Reveal[go]();
                window.focus();
            }, true);
        } catch (err) { /* cross-origin (public fallback): keys stay in the app */ }
    }

    function buildStages() {
        document.querySelectorAll('.reveal .slides section[data-stage]').forEach((slide) => {
            const name = slide.dataset.stage;
            if (!stages[name]) {
                const el = document.createElement('div');
                el.className = 'stage';
                el.id = 'stage-' + name;
                const fb = slide.dataset.fallback;
                el.innerHTML = `<div class="stage-fallback">${fb ? `<img src="${fb}" alt="">` : ''}<span>loading ${name}…</span></div>`;
                document.body.insertBefore(el, document.body.firstChild);
                stages[name] = { el, frame: null, slides: [], loaded: false, src: srcOf(slide) };
            }
            stages[name].slides.push(slide);
        });
    }

    function loadStage(name) {
        const st = stages[name];
        if (!st || st.frame) return;
        const f = document.createElement('iframe');
        f.title = name;
        f.allow = 'autoplay; fullscreen; midi';
        f.addEventListener('load', () => {
            st.loaded = true;
            st.el.classList.add('loaded');
            bridgeKeys(name, f.contentWindow);
            if (controllers[name]) controllers[name].frame = f;
            sync();
        });
        st.el.appendChild(f);
        st.frame = f;
        if (controllers[name]) controllers[name].frame = f;
        f.src = st.src;
    }
    function unloadStage(name) {
        const st = stages[name];
        if (!st || !st.frame) return;
        st.frame.remove();
        st.frame = null;
        st.loaded = false;
        st.el.classList.remove('loaded');
        if (controllers[name] && controllers[name].reset) controllers[name].reset();
    }

    function flatIndex(slide) {
        const all = Reveal.getSlides();
        return all.indexOf(slide);
    }
    function manageStages() {
        const cur = Reveal.getCurrentSlide();
        const i = flatIndex(cur);
        for (const [name, st] of Object.entries(stages)) {
            const d = Math.min(...st.slides.map((s) => {
                const j = flatIndex(s);
                return j >= i ? j - i : (i - j) + 0.5;   // ahead counts a bit more than behind
            }));
            if (d <= 1) loadStage(name);
            else if (d >= 3) unloadStage(name);
        }
    }

    // ── scripted stage: 2dimFields, the figure-eight double unwrapping (from Talks/Unwrapping) ──
    // depth 3, smaller children, longer edges, coloured by branch at v₀: the structure reads on a projector
    const FIG8 = 'Shalen: the double of the figure-eight knot complement';
    const LOOK = { lam: 0.75, h: -1.4, rule: 'branch' };
    const S2 = (extra) => ({ field: 'omega', example: FIG8, specA: 'pi', view: 'default', dep: 3, settings: LOOK, ...extra });
    controllers.unwrap = {
        frame: null, at: null, token: 0,
        states: [
            S2({ collapsed: true, view: 'collapsed' }),   // 0: one ℍ³, at t = π
            S2(),                                          // 1: the tree
            S2({ apply: [[0, false], [1, false]] }),       // 2: x, then y
            S2({ apply: [[2, false]] }),                   // 3: y_t
        ],
        reset() { this.at = null; this.token++; },
        async app() {
            await until(() => { try { return this.frame && this.frame.contentWindow && this.frame.contentWindow.__twoDim; } catch (e) { return false; } });
            await sleep(100);
            return this.frame.contentWindow.__twoDim;
        },
        async go(step) {
            if (!this.frame) return;
            const token = ++this.token, T = await this.app();
            if (!T || token !== this.token) return;
            const api = T.tutorialAPI;
            const from = this.at;
            this.at = step;
            if (from === step) return;
            if (from === step - 1) {                          // one step forward: play it
                if (step === 1) T.startSpecRun(0);            // t runs from π back to ∞
                else if (step === 2) await api.effect({ gens: [[0, false], [1, false]] });
                else if (step === 3) { api.prepare(this.states[1]); await api.settle(); if (token === this.token) await api.effect({ gens: [[2, false]] }); }
                return;
            }
            if (from === 1 && step === 0) { await api.effect({ collapse: true }); return; }
            api.prepare(this.states[step]);
        },
    };

    // ── sync with reveal ────────────────────────────────────────────
    function stepOf(slide) {
        let k = 0;
        slide.querySelectorAll('.fragment.visible[data-fragment-index]').forEach((f) => { k = Math.max(k, Number(f.dataset.fragmentIndex) + 1); });
        return k;
    }
    function sync() {
        const slide = Reveal.getCurrentSlide(), name = slide && slide.dataset.stage;
        for (const [n, st] of Object.entries(stages)) st.el.classList.toggle('on', n === name);
        document.body.classList.toggle('stage-live', !!name);
        if (name && controllers[name] && stages[name].loaded) controllers[name].go(stepOf(slide));
    }

    // ── cue cards ───────────────────────────────────────────────────
    function wireCues() {
        document.querySelectorAll('.cue').forEach((cue) => {
            const head = cue.querySelector('.cue-head');
            if (head) {
                if (!head.querySelector('.fold')) head.insertAdjacentHTML('beforeend', '<span class="fold">▾</span>');
                head.addEventListener('click', () => {
                    cue.classList.toggle('collapsed');
                    head.querySelector('.fold').textContent = cue.classList.contains('collapsed') ? '▸' : '▾';
                });
            }
            const slide = cue.closest('section');
            cue.querySelectorAll('[data-open]').forEach((a) => {
                // "Open in a new tab": the slide's own app, or a given path
                const target = a.dataset.open === 'stage' ? srcOf(slide) : a.dataset.open;
                a.href = new URL(target, location.href).href;
                a.target = '_blank';
                a.rel = 'noopener';
            });
            cue.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); Reveal[b.dataset.go](); }));
        });
    }
    Reveal.addKeyBinding({ keyCode: 67, key: 'C', description: 'Show / hide the cue cards' }, () => {
        document.body.classList.toggle('hide-cues');
    });

    // ── charts ──────────────────────────────────────────────────────
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs = {}, parent) => {
        const n = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (parent) parent.appendChild(n);
        return n;
    };
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    function tooltip(host) {
        const t = document.createElement('div');
        t.className = 'tip';
        host.appendChild(t);
        return {
            show(html, x, y) {
                t.innerHTML = html;
                t.classList.add('on');
                const w = t.offsetWidth, hw = host.clientWidth;
                t.style.left = Math.max(0, Math.min(hw - w, x - w / 2)) + 'px';
                t.style.top = (y - t.offsetHeight - 10) + 'px';
            },
            hide() { t.classList.remove('on'); },
        };
    }

    // Conversations per month, by model family (createdAt of each of the 289 sessions).
    function sessionsChart() {
        const host = document.getElementById('chart-sessions');
        if (!host) return;
        const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
        const series = [
            { key: 'o4', name: 'Opus 4.5 – 4.8', color: css('--series-1'), v: [18, 8, 21, 15, 15, 2, 0, 0, 0] },
            { key: 'f5', name: 'Fable 5, 5.1', color: css('--series-2'), v: [0, 0, 0, 0, 7, 22, 12, 5, 0] },
            { key: 'o5', name: 'Opus 5, 5.5', color: css('--series-3'), v: [0, 0, 0, 0, 0, 4, 27, 49, 77] },
            { key: 'so', name: 'Sonnet 5, 5.5', color: css('--series-4'), v: [0, 0, 0, 0, 0, 1, 0, 2, 4] },
        ];
        const W = 820, H = 228, L = 34, R = 6, T = 22, B = 26;
        const max = 90, bw = 54, gap = (W - L - R - months.length * bw) / (months.length - 1);
        const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Conversations per month, February to October 2026, stacked by model family' }, host);
        const y = (v) => T + (H - T - B) * (1 - v / max);
        const g = el('g', { class: 'grid' }, svg);
        [0, 30, 60, 90].forEach((v) => {
            el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'baseline' : '' }, g);
            const tx = el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'lbl' }, svg);
            tx.textContent = v;
        });
        const tip = tooltip(host);
        months.forEach((m, i) => {
            const x = L + i * (bw + gap);
            let acc = 0;
            const tot = series.reduce((s, se) => s + se.v[i], 0);
            const topKey = [...series].reverse().find((se) => se.v[i] > 0).key;
            series.forEach((se) => {
                const v = se.v[i];
                if (!v) return;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                const h = Math.max(0, y0 - y1 - 2);   // 2px surface gap between segments
                if (se.key === topKey) {
                    const r = Math.min(4, h);
                    el('path', { d: `M${x},${y0 - 2} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0 - 2} Z`, fill: se.color }, svg);
                } else {
                    el('rect', { x, y: y1, width: bw, height: h, fill: se.color }, svg);
                }
            });
            const tl = el('text', { x: x + bw / 2, y: y(tot) - 6, 'text-anchor': 'middle', class: 'val' }, svg);
            tl.textContent = tot;
            const ml = el('text', { x: x + bw / 2, y: H - 7, 'text-anchor': 'middle', class: 'lbl' }, svg);
            ml.textContent = m;
            const hit = el('rect', { x: x - gap / 2, y: T - 10, width: bw + gap, height: H - T - B + 10, class: 'hit' }, svg);
            hit.addEventListener('mousemove', () => {
                const rows = series.filter((se) => se.v[i]).map((se) => `<div><i style="background:${se.color}"></i>${se.name} <b>${se.v[i]}</b></div>`).join('');
                const box = host.getBoundingClientRect(), sb = svg.getBoundingClientRect();
                tip.show(`<div class="k">${m} 2026 · ${tot} conversations</div>${rows}`, (x + bw / 2) * sb.width / W + (sb.left - box.left), y(tot) * sb.height / H + (sb.top - box.top));
            });
            hit.addEventListener('mouseleave', () => tip.hide());
        });
        // selective direct labels, inside the tallest segment of three families
        [['o4', 2, 'Opus 4.x'], ['f5', 5, 'Fable 5'], ['o5', 8, 'Opus 5.x']].forEach(([k, i, txt]) => {
            const se = series.find((s) => s.key === k);
            const below = series.slice(0, series.indexOf(se)).reduce((s, x) => s + x.v[i], 0);
            const t = el('text', { x: L + i * (bw + gap) + bw / 2, y: y(below + se.v[i] / 2) + 4, 'text-anchor': 'middle', class: 'direct', fill: '#fff' }, svg);
            t.textContent = txt;
            t.setAttribute('style', 'fill:#fff;font-size:11px');
        });
        const leg = document.getElementById('legend-sessions');
        if (leg) leg.innerHTML = series.map((se) => `<span><i style="background:${se.color}"></i>${se.name}</span>`).join('');
    }

    // Share of Nic's prompts per month (847 distinct prompts, 27 June – 23 October).
    function shiftChart() {
        const host = document.getElementById('chart-shift');
        if (!host) return;
        const months = ['Jul', 'Aug', 'Sep', 'Oct'];
        const n = [139, 171, 164, 359];
        const series = [
            { name: 'make / create / build / add', short: 'make…', color: css('--series-1'), v: [46.0, 29.8, 28.0, 17.0], c: [64, 51, 46, 61] },
            { name: 'prove / proof / theorem / conjecture', short: 'prove…', color: css('--series-2'), v: [2.2, 2.3, 11.6, 5.6], c: [3, 4, 19, 20] },
            { name: 'commit / push', short: 'commit / push', color: css('--series-3'), v: [0.7, 3.5, 11.0, 11.1], c: [1, 6, 18, 40] },
        ];
        const W = 470, H = 270, L = 38, R = 104, T = 14, B = 26;
        const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Share of Nic’s prompts by month, July to October 2026' }, host);
        const x = (i) => L + i * (W - L - R) / (months.length - 1);
        const y = (v) => T + (H - T - B) * (1 - v / 50);
        const g = el('g', { class: 'grid' }, svg);
        [0, 10, 20, 30, 40, 50].forEach((v) => {
            el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? 'baseline' : '' }, g);
            const t = el('text', { x: L - 7, y: y(v) + 4, 'text-anchor': 'end', class: 'lbl' }, svg);
            t.textContent = v + '%';
        });
        months.forEach((m, i) => {
            const t = el('text', { x: x(i), y: H - 7, 'text-anchor': 'middle', class: 'lbl' }, svg);
            t.textContent = m;
        });
        const ends = [];
        series.forEach((se) => {
            el('path', { d: se.v.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: se.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
            se.v.forEach((v, i) => el('circle', { cx: x(i), cy: y(v), r: 4, fill: se.color, stroke: '#0b1120', 'stroke-width': 2 }, svg));
            ends.push({ se, yy: y(se.v[3]) });
        });
        // direct labels at the right end, nudged apart
        ends.sort((a, b) => a.yy - b.yy);
        for (let i = 1; i < ends.length; i++) if (ends[i].yy - ends[i - 1].yy < 15) ends[i].yy = ends[i - 1].yy + 15;
        ends.forEach(({ se, yy }) => {
            const t = el('text', { x: x(3) + 10, y: yy + 4, class: 'direct' }, svg);
            t.textContent = se.short;
            t.setAttribute('style', 'font-size:12px;fill:' + css('--text-primary'));
        });
        const tip = tooltip(host);
        const cross = el('line', { y1: T, y2: H - B, stroke: 'rgba(148,163,184,0.35)', 'stroke-width': 1, visibility: 'hidden' }, svg);
        months.forEach((m, i) => {
            const hit = el('rect', { x: x(i) - (W - L - R) / 6, y: T, width: (W - L - R) / 3, height: H - T - B, class: 'hit' }, svg);
            hit.addEventListener('mousemove', () => {
                cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
                const box = host.getBoundingClientRect(), sb = svg.getBoundingClientRect();
                const rows = series.map((se) => `<div><i style="background:${se.color}"></i>${se.name}: <b>${se.v[i]}%</b> <span class="k">(${se.c[i]})</span></div>`).join('');
                tip.show(`<div class="k">${m} 2026 · ${n[i]} prompts</div>${rows}`, x(i) * sb.width / W + (sb.left - box.left), T * sb.height / H + (sb.top - box.top) + 40);
            });
            hit.addEventListener('mouseleave', () => { tip.hide(); cross.setAttribute('visibility', 'hidden'); });
        });
        const leg = document.getElementById('legend-shift');
        if (leg) leg.innerHTML = series.map((se) => `<span><i style="background:${se.color}"></i>${se.name}</span>`).join('');
    }

    // ── boot ────────────────────────────────────────────────────────
    buildStages();
    Reveal.on('ready', () => {
        wireCues();
        sessionsChart();
        shiftChart();
        manageStages();
        sync();
    });
    Reveal.on('slidechanged', () => { manageStages(); sync(); });
    Reveal.on('fragmentshown', sync);
    Reveal.on('fragmenthidden', sync);

    window.__deck = { stages, controllers, sync, loadStage, unloadStage };
})();
