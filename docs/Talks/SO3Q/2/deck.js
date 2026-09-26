/**
 * deck.js — SO₃(ℚ), part 2.
 *
 *  • reveal.js set-up (linear navigation).
 *  • Visualization stages: full-bleed iframes outside .reveal, driven from
 *    the slides' data-stage / data-step and their .stage-step fragments
 *    (re-derived from the DOM on every event, as in part 1).
 *  • The rational sphere behind the title.
 *  • "The p + 1 primes of norm p": the normalized sets A_p and their axes.
 *  • The square complex of SO₃(ℤ[1/65]): all 21 metacommutation squares.
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

    // ── the p + 1 primes of norm p ─────────────────────────────────
    const pw = document.getElementById('primes-widget');
    if (pw) {
        const PS = [3, 5, 7, 11, 13, 17, 19, 23];
        const btnBox = pw.querySelector('.pr-buttons'), countEl = pw.querySelector('.pr-count');
        const chipBox = pw.querySelector('.pr-chips'), svg = pw.querySelector('.pr-sphere');
        const NS = 'http://www.w3.org/2000/svg';
        const view = (() => {       // a fixed oblique view of the unit sphere
            const yaw = 0.62, pitch = 0.36, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
            return (v) => {
                const b = [cp * cy, cp * sy, sp], r = [-sy, cy, 0], u = [-sp * cy, -sp * sy, cp];
                return [v[0] * r[0] + v[1] * r[1] + v[2] * r[2], v[0] * u[0] + v[1] * u[1] + v[2] * u[2], v[0] * b[0] + v[1] * b[1] + v[2] * b[2]];
            };
        })();
        function el(name, attrs) {
            const e = document.createElementNS(NS, name);
            for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
            return e;
        }
        function drawSphere(p) {
            svg.replaceChildren();
            svg.appendChild(el('circle', { cx: 0, cy: 0, r: 98, fill: 'rgba(40,50,110,0.25)', stroke: 'rgba(160,172,220,0.45)', 'stroke-width': 1.5 }));
            // equator and a meridian, as polylines in the same view
            for (const ring of [(t) => [Math.cos(t), Math.sin(t), 0], (t) => [Math.cos(t), 0, Math.sin(t)], (t) => [0, Math.cos(t), Math.sin(t)]]) {
                let d = '';
                for (let i = 0; i <= 72; i++) {
                    const [x, y] = view(ring(i / 72 * 2 * Math.PI));
                    d += (i ? 'L' : 'M') + (x * 98).toFixed(1) + ' ' + (-y * 98).toFixed(1);
                }
                svg.appendChild(el('path', { d, fill: 'none', stroke: 'rgba(160,172,220,0.18)', 'stroke-width': 1 }));
            }
            const Ap = Q.A(p);
            const pts = Ap.map((q, i) => {
                const s = Math.hypot(q[1], q[2], q[3]);
                const [x, y, z] = view([q[1] / s, q[2] / s, q[3] / s]);
                return { x: x * 98, y: -y * 98, z, col: PALETTE[(i >> 1) % PALETTE.length] };
            }).sort((a, b) => a.z - b.z);
            for (const pt of pts) {
                svg.appendChild(el('circle', {
                    cx: pt.x.toFixed(1), cy: pt.y.toFixed(1), r: pt.z > 0 ? 7 : 5,
                    fill: rgb(pt.col), 'fill-opacity': pt.z > 0 ? 1 : 0.35, stroke: 'rgba(255,255,255,0.7)', 'stroke-width': pt.z > 0 ? 1.2 : 0,
                }));
            }
        }
        function render(p) {
            btnBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.p === p));
            const all = Q.allNorm(p).length, Ap = Q.A(p);
            countEl.innerHTML = `\\(p = ${p}\\): &nbsp;<b>${all}</b> quaternions of norm ${p} \\(= 8(p+1)\\), &nbsp;so <b>${Ap.length}</b> up to units. ` +
                `\\(p \\equiv ${p % 4} \\pmod 4\\)`;
            chipBox.replaceChildren(...Ap.map((q, i) => {
                const c = PALETTE[(i >> 1) % PALETTE.length];
                const s = document.createElement('span');
                s.innerHTML = Q.html(q);
                s.style.color = rgb(c.map((v) => Math.min(255, v + 30)));
                s.style.borderColor = `rgba(${c[0]},${c[1]},${c[2]},0.5)`;
                return s;
            }));
            drawSphere(p);
            typeset(countEl);
        }
        PS.forEach((p) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = p;
            b.dataset.p = p;
            b.addEventListener('click', () => render(p));
            btnBox.appendChild(b);
        });
        render(5);
    }

    // ── the 21 squares of SO₃(ℤ[1/65]) ─────────────────────────────
    const gal = document.getElementById('gallery-grid');
    if (gal) {
        const P = 5, R = 13, AP = Q.A(P), AR = Q.A(R);
        const ip = (x) => Q.indexIn(AP, x), ir = (x) => Q.indexIn(AR, x);
        const inv = ([f, i]) => [f, f === 'p' ? ip(Q.conj(AP[i])) : ir(Q.conj(AR[i]))];
        const squares = new Map();
        for (const x of AP) for (const y of AR) {
            const m = Q.metacommute(x, y);
            const cyc = [['p', ip(x)], ['q', ir(y)], ['p', ip(Q.conj(m.p2))], ['q', ir(Q.conj(m.s2))]];
            const vs = [];
            for (let r = 0; r < 4; r++) {
                const c = cyc.slice(r).concat(cyc.slice(0, r));
                vs.push(JSON.stringify(c), JSON.stringify(c.slice().reverse().map(inv)));
            }
            const key = vs.sort()[0];
            const reading = { x, y, m, score: (ip(x) % 2 === 0 ? 2 : 0) + (ir(y) % 2 === 0 ? 1 : 0) };
            const cur = squares.get(key);
            if (!cur || reading.score > cur.score) squares.set(key, reading);
        }
        const list = [...squares.values()].sort((a, b) => (ip(a.x) - ip(b.x)) || (ir(a.y) - ir(b.y)));
        const colP = (q) => PALETTE[ip(q) >> 1], colR = (q) => PALETTE[3 + (ir(q) >> 1)];
        const flatOf = (s) => Q.eqpm(s.m.s2, s.y) && Q.eqpm(s.m.p2, s.x);
        const relEl = document.getElementById('gallery-rel');
        function svgFor(s) {
            // left x (up), top y (right), bottom y' (right), right x' (up); an arrow flips for an inverse
            const E = [
                { a: [8, 52], b: [8, 8], q: s.x, c: colP(s.x), inv: ip(s.x) % 2 },
                { a: [8, 8], b: [52, 8], q: s.y, c: colR(s.y), inv: ir(s.y) % 2 },
                { a: [8, 52], b: [52, 52], q: s.m.s2, c: colR(s.m.s2), inv: ir(s.m.s2) % 2 },
                { a: [52, 52], b: [52, 8], q: s.m.p2, c: colP(s.m.p2), inv: ip(s.m.p2) % 2 },
            ];
            let out = '<svg viewBox="0 0 60 60">';
            for (const e of E) {
                const [a, b] = e.inv ? [e.b, e.a] : [e.a, e.b];
                const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ux = Math.sign(b[0] - a[0]), uy = Math.sign(b[1] - a[1]);
                out += `<line x1="${e.a[0]}" y1="${e.a[1]}" x2="${e.b[0]}" y2="${e.b[1]}" stroke="${rgb(e.c)}" stroke-width="3.2" stroke-linecap="round"/>`;
                out += `<path d="M${mx + ux * 6} ${my + uy * 6} L${mx - ux * 4 - uy * 5} ${my - uy * 4 + ux * 5} L${mx - ux * 4 + uy * 5} ${my - uy * 4 - ux * 5} Z" fill="${rgb(e.c)}"/>`;
            }
            return out + '</svg>';
        }
        function show(i) {
            gal.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
            const s = list[i];
            const sq = (q) => `<span style="white-space:nowrap;color:${rgb((Q.norm(q) === 5 ? colP(q) : colR(q)).map((v) => Math.min(255, v + 35)))}">(${Q.html(q)})</span>`;
            relEl.innerHTML = `${sq(s.x)}${sq(s.y)} = ${s.m.sign < 0 ? '−' : ''}${sq(s.m.s2)}${sq(s.m.p2)}` +
                (flatOf(s) ? '<span class="gal-note">These commute: rotations about one axis. Such squares tile periodic flats: last time’s lattice ⟨r₅, r₁₃⟩ ≅ ℤ² lives here.</span>'
                    : '<span class="gal-note" style="color: var(--text-muted)">A genuinely non-commuting square.</span>');
        }
        list.forEach((s, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.innerHTML = svgFor(s);
            b.title = `${Q.str(s.x)} · ${Q.str(s.y)}`;
            if (flatOf(s)) b.classList.add('flat');
            b.addEventListener('click', () => show(i));
            gal.appendChild(b);
        });
        const legend = document.getElementById('gallery-legend');
        legend.innerHTML = 'norm 5:' + [0, 2, 4].map((g) => `<span style="background:${rgb(colP(AP[g]))}"></span>${Q.html(AP[g])}`).join('') +
            ' &nbsp; norm 13: seven more colours; an arrow against the flow is an inverse.';
        show(list.findIndex(flatOf));
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
