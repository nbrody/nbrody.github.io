/**
 * deck.js — SO₃(ℚ), part 3.
 *
 *  • reveal.js set-up (linear navigation).
 *  • Visualization stages: full-bleed iframes outside .reveal, driven from
 *    the slides' data-stage / data-step and their .stage-step fragments
 *    (re-derived from the DOM on every event, as in parts 1 and 2).
 *  • The rational sphere behind the title.
 *  • "The local portrait of a rotation": how R_q acts on each tree T_{p+1}.
 */
(function () {
    'use strict';
    if (window.IS_REMOTE) return;
    const Q = window.Quat;

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
                if (document.activeElement === frameOf(st)) { frameOf(st).blur(); window.focus(); }
            }
            wasActive.set(st.id, on);
        }
    }
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

    function typeset(el) {
        if (window.MathJax && MathJax.typesetPromise) return MathJax.typesetPromise([el]).catch((err) => console.warn('MathJax', err));
        return new Promise((res) => setTimeout(() => typeset(el).then(res), 250));
    }
    const PALETTE = [[124, 138, 255], [244, 114, 182], [45, 212, 191], [251, 191, 36], [125, 211, 252], [163, 230, 53],
        [192, 132, 252], [251, 146, 60], [52, 211, 153], [249, 168, 212], [250, 204, 21], [96, 165, 250]];
    const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

    // ── the local portrait of a rotation ───────────────────────────
    const pt = document.getElementById('portrait');
    if (pt) {
        const PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
        const PRESETS = [[1, 2, 0, 0], [3, 2, 0, 0], [2, 1, 1, 1], [1, 1, 1, 0], [3, 4, 0, 0], [5, 3, 4, 0], [1, 2, 2, 2], [4, 1, 2, 3]];
        const NAMES = ['a', 'b', 'c', 'd'];
        let q = [1, 2, 0, 0];
        const stepBox = document.getElementById('pt-steppers'), presetBox = document.getElementById('pt-presets');
        const summary = document.getElementById('pt-summary'), chips = document.getElementById('pt-chips');
        const vals = [];
        NAMES.forEach((n, t) => {
            const box = document.createElement('span');
            box.className = 'pt-step';
            box.innerHTML = `<b>${n}</b><button type="button" aria-label="decrease ${n}">−</button><span class="pt-val"></span><button type="button" aria-label="increase ${n}">+</button>`;
            const [minus, plus] = box.querySelectorAll('button');
            minus.addEventListener('click', () => { q[t] = Math.max(-9, q[t] - 1); render(); });
            plus.addEventListener('click', () => { q[t] = Math.min(9, q[t] + 1); render(); });
            vals.push(box.querySelector('.pt-val'));
            stepBox.appendChild(box);
        });
        const presetBtns = PRESETS.map((p) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = Q.html(p);
            b.addEventListener('click', () => { q = p.slice(); render(); });
            presetBox.appendChild(b);
            return b;
        });
        const fieldHTML = (sf) => (sf === 1 ? 'ℚ(<i>i</i>)' : `ℚ(√−${sf})`);
        function render() {
            vals.forEach((v, t) => { v.textContent = Q.minus(q[t]); });
            presetBtns.forEach((b, i) => b.classList.toggle('on', PRESETS[i].every((x, t) => x === q[t])));
            if (!q.some((x) => x)) { summary.textContent = 'Choose a nonzero quaternion.'; chips.replaceChildren(); return; }
            const qp = Q.projective(q);
            const { den } = Q.rot(qp), fld = Q.axisField(qp);
            const same = qp.every((x, t) => x === q[t]);
            summary.innerHTML = `<span class="q">q = ${Q.html(q)}</span>${same ? '' : ` &nbsp;(primitive: <span class="q">${Q.html(qp)}</span>)`}` +
                ` &nbsp;·&nbsp; denominator <b>${den}</b>` +
                (fld.n ? ` &nbsp;·&nbsp; axis (${Q.projective([0, ...qp.slice(1)]).slice(1).map(Q.minus).join(', ')}), <i>K</i> = ${fieldHTML(fld.sf)}` : ' &nbsp;·&nbsp; the identity');
            chips.replaceChildren(...PRIMES.map((p) => {
                const t = Q.localType(qp, p);
                const el = document.createElement('div');
                el.className = 'pt-chip ' + t.type;
                const label = t.type === 'hyp' ? `ℓ = ${t.ell}` : t.type === 'line' ? 'line' : t.type === 'bounded' ? (t.inversion ? 'edge' : 'point') : '—';
                el.innerHTML = `<span class="p">${p}</span><span class="t">${label}</span>`;
                el.title = t.type === 'hyp' ? `hyperbolic on T${p + 1}, translation length ${t.ell}` :
                    t.type === 'line' ? `elliptic on T${p + 1}: fixes a line (p splits)` : `elliptic on T${p + 1}: fixes a bounded set`;
                return el;
            }));
            typeset(summary);
        }
        render();
    }

    // ── the rational sphere behind the title ───────────────────────
    const crownCv = document.getElementById('title-crown');
    const crown = (() => {
        if (!crownCv) return { show() {} };
        const ctx = crownCv.getContext('2d');
        const pts = [];
        for (let d = 1; d <= 41; d += 2) {
            for (let a = -d; a <= d; a++) for (let b = -d; b <= d; b++) {
                const c2 = d * d - a * a - b * b;
                if (c2 < 0) continue;
                const c = Math.round(Math.sqrt(c2));
                if (c * c !== c2) continue;
                for (const cc of c ? [c, -c] : [0]) {
                    if (Q.gcd(Q.gcd(Q.gcd(a, b), cc), d) !== 1) continue;
                    pts.push({ v: [a / d, b / d, cc / d], d });
                }
            }
        }
        let W = 0, H = 0, dpr = 1, on = false, raf = 0;
        const t0 = performance.now();
        function frame(now) {
            raf = on ? requestAnimationFrame(frame) : 0;
            const d = Math.min(window.devicePixelRatio || 1, 2);
            if (window.innerWidth !== W || window.innerHeight !== H || d !== dpr) {
                W = window.innerWidth; H = window.innerHeight; dpr = d;
                crownCv.width = Math.round(W * dpr); crownCv.height = Math.round(H * dpr);
                crownCv.style.width = W + 'px'; crownCv.style.height = H + 'px';
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, crownCv.width, crownCv.height);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            const R = 0.4 * Math.min(W, H), t = (now - t0) / 1000;
            const yaw = t * 0.05, pitch = 0.42, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
            const proj = pts.map((p) => {
                const [x, y, z] = p.v;
                const X = -sy * x + cy * y, Y = -sp * cy * x - sp * sy * y + cp * z, Z = cp * cy * x + cp * sy * y + sp * z;
                return { X: W / 2 + X * R, Y: H / 2 - Y * R, Z, d: p.d };
            }).sort((a, b) => a.Z - b.Z);
            for (const p of proj) {
                const k = Math.min(1, Math.log(p.d + 1) / Math.log(42));
                const col = `${Math.round(253 - 140 * k)},${Math.round(224 - 100 * k)},${Math.round(140 + 75 * k)}`;
                ctx.fillStyle = `rgba(${col},${p.Z > 0 ? 0.95 : 0.3})`;
                ctx.beginPath(); ctx.arc(p.X, p.Y, (0.7 + 4.2 / Math.sqrt(p.d)) * (p.Z > 0 ? 1 : 0.8), 0, 2 * Math.PI); ctx.fill();
            }
        }
        return {
            show(v) {
                on = v;
                crownCv.classList.toggle('on', v);
                if (v && !raf) raf = requestAnimationFrame(frame);
            },
            count: pts.length,
        };
    })();

    // ── wiring ─────────────────────────────────────────────────────
    function sync() {
        syncStages();
        const slide = Reveal.getCurrentSlide();
        crown.show(!!slide && slide.id === 'title' && !Reveal.isOverview());
    }
    ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden', 'overviewshown', 'overviewhidden']
        .forEach((ev) => Reveal.on(ev, sync));
    Reveal.on('ready', () => setTimeout(() => stages.forEach(load), 1200));
})();
