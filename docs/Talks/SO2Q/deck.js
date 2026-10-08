/**
 * deck.js — SO₂(ℚ) is prime factorization in ℤ[i].
 *
 *  • reveal.js set-up (linear navigation; the backup slide sits below the last).
 *  • Slide 2: stereographic projection from −1, cycling through rational slopes.
 *  • Slide 5: Euclid's rounding picture (disks of radius √2/2 cover the plane).
 *  • Slides 6, 7: the Gaussian primes. On 6 the three kinds light up one per
 *    click; on 7 the plane flips over the real axis (complex conjugation), so
 *    the blue π's land where the pink π̄'s were while the gold and teal primes
 *    land on their own kind.
 *  • Slide 9: the factorizer, with a ledger of the exponent of every Gaussian
 *    prime: the ramified and inert columns are always 0, split pairs mirror.
 *  • The slowly turning crown of rational points behind the title.
 *
 * Every widget's state is re-derived from the DOM (current slide + visible
 * fragments) on every reveal event, so jumping around never desyncs anything.
 */
(function () {
    'use strict';
    if (window.IS_REMOTE) return;
    const G = window.Gauss;
    const NS = 'http://www.w3.org/2000/svg';

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

    const token = (name, fallback) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const visibleMax = (root, attr) => {
        let v = 0;
        root.querySelectorAll(`.fragment[${attr}]`).forEach((f) => {
            if (f.classList.contains('visible')) v = Math.max(v, Number(f.getAttribute(attr)));
        });
        return v;
    };
    function svgAdd(parent, tag, attrs) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        parent.appendChild(e);
        return e;
    }
    function typeset(el) {
        if (window.MathJax && MathJax.typesetPromise) {
            return MathJax.typesetPromise([el]).catch((err) => console.warn('MathJax', err));
        }
        return new Promise((res) => setTimeout(() => typeset(el).then(res), 250));
    }

    // ── slide 2: stereographic projection ──────────────────────────
    const stereo = (() => {
        const svg = document.getElementById('stereo');
        if (!svg) return { show() {} };
        const readout = document.getElementById('stereo-readout');
        svgAdd(svg, 'line', { class: 'axis', x1: -1.4, y1: 0, x2: 1.4, y2: 0 });
        svgAdd(svg, 'line', { class: 'axis', x1: 0, y1: -1.28, x2: 0, y2: 1.28 });
        svgAdd(svg, 'circle', { class: 'circle', cx: 0, cy: 0, r: 1 });
        for (const p of G.rationalPoints(300)) {
            svgAdd(svg, 'circle', { class: 'rp', cx: p.a / p.c, cy: -p.b / p.c, r: 0.006 + 0.04 / Math.sqrt(p.c) });
        }
        const secant = svgAdd(svg, 'line', { class: 'secant' });
        svgAdd(svg, 'circle', { class: 'pole', cx: -1, cy: 0, r: 0.045 });
        svgAdd(svg, 'text', { class: 'lab', x: -1.4, y: 0.17 }).textContent = '−1';
        const hit = svgAdd(svg, 'circle', { class: 'hit', r: 0.05 });

        // t = p/q  ↦  ((q² − p²) + 2pq·i)/(q² + p²), the point at angle 2·arctan t
        const SLOPES = [[1, 2], [2, 3], [1, 4], [3, 4], [2, 5], [4, 5], [3, 2], [-2, 3]];
        const pts = SLOPES.map(([p, q]) => {
            let x = q * q - p * p, y = 2 * p * q, c = q * q + p * p;
            const g = G.gcd(G.gcd(x, y), c);
            return { p, q, x: x / g, y: y / g, c: c / g, phi: Math.atan2(p, q) };
        });
        function place(phi) {
            const X = Math.cos(2 * phi), Y = Math.sin(2 * phi);
            const dx = X + 1, dy = Y, L = Math.hypot(dx, dy), k = (L + 0.32) / L;
            secant.setAttribute('x1', -1); secant.setAttribute('y1', 0);
            secant.setAttribute('x2', -1 + dx * k); secant.setAttribute('y2', -dy * k);
            hit.setAttribute('cx', X); hit.setAttribute('cy', -Y);
        }
        function label(i) {
            const { p, q, x, y, c } = pts[i];
            readout.innerHTML = `<span class="t">t = ${G.minus(p)}/${q}</span> &nbsp;⟼&nbsp; ` +
                `(${G.minus(x)}/${c}, ${G.minus(y)}/${c}) &nbsp;·&nbsp; ${Math.abs(x)}-${Math.abs(y)}-${c}`;
        }

        const HOLD = 2200, MOVE = 900;
        let on = false, raf = 0, i = 0, t0 = 0;
        place(pts[0].phi); label(0);
        function frame(now) {
            raf = on ? requestAnimationFrame(frame) : 0;
            const dt = now - t0;
            if (dt < HOLD) return;
            const j = (i + 1) % pts.length;
            const s = Math.min(1, (dt - HOLD) / MOVE);
            place(pts[i].phi + (pts[j].phi - pts[i].phi) * ease(s));
            readout.style.opacity = s < 1 ? 0.3 : 1;
            if (s >= 1) { i = j; t0 = now; label(i); }
        }
        return {
            show(v) {
                if (v === on) return;
                on = v;
                if (on) { t0 = performance.now(); raf = requestAnimationFrame(frame); }
            },
        };
    })();

    // ── slide 5: Euclid's rounding picture ─────────────────────────
    (() => {
        const svg = document.getElementById('euclid');
        if (!svg) return;
        svg.style.overflow = 'hidden';
        for (let a = -1; a <= 3; a++)
            for (let b = -1; b <= 3; b++) svgAdd(svg, 'circle', { class: 'disc', cx: a, cy: b, r: Math.SQRT1_2 });
        for (let a = 0; a <= 2; a++)
            for (let b = 0; b <= 2; b++) svgAdd(svg, 'circle', { class: 'lat', cx: a, cy: b, r: 0.055 });
        const q = [1.42, 0.62];
        svgAdd(svg, 'line', { class: 'seg', x1: 1, y1: 1, x2: q[0], y2: q[1] });
        svgAdd(svg, 'circle', { class: 'q', cx: q[0], cy: q[1], r: 0.075 });
        svgAdd(svg, 'text', { x: 0.62, y: 1.27 }).textContent = 'κ';
        svgAdd(svg, 'text', { x: 1.55, y: 0.5 }).textContent = 'α/β';
        svgAdd(svg, 'text', { class: 'dim', x: 1.3, y: 0.98 }).textContent = '< 1';
    })();

    // ── slides 6, 7: the Gaussian primes ───────────────────────────
    const KIND_COLOR = {
        ram: token('--c-ram', '#fbbf24'),
        inert: token('--c-inert', '#2dd4bf'),
        pi: token('--c-pi', '#7c8aff'),
        pibar: token('--c-pibar', '#f472b6'),
    };
    const DIM = '#334155';
    const KINDS = ['ram', 'inert', 'pi', 'pibar'];

    /** 'ram' | 'inert' | 'pi' | 'pibar' | null for the Gaussian integer a + bi. */
    function primeKind(a, b) {
        if (a === 0 || b === 0) {
            const n = Math.abs(a + b);
            return G.isPrime(n) && n % 4 === 3 ? 'inert' : null;
        }
        const N = a * a + b * b;
        if (N === 2) return 'ram';
        if (!G.isPrime(N)) return null;
        // the associate in the open first quadrant is x + yi (a π) or y + xi (i·π̄), with x > y
        let x = a, y = b;
        while (!(x > 0 && y > 0)) [x, y] = [-y, x];
        return x > y ? 'pi' : 'pibar';
    }

    const PLOT_R = 10;
    const PRIMES = [];
    for (let a = -PLOT_R; a <= PLOT_R; a++)
        for (let b = -PLOT_R; b <= PLOT_R; b++) {
            const kind = primeKind(a, b);
            if (kind) PRIMES.push({ a, b, kind });
        }
    // Labels sit at fixed positions: under the flip the dots move, the names don't.
    // (dx, dy in grid units from the point, screen-down positive; align of the text)
    const LABELS = [
        { a: 1, b: 1, text: '1+i', kind: 'ram', dx: -0.4, dy: -0.45, align: 'right' },
        { a: 7, b: 0, text: '7', kind: 'inert', dx: 0.38, dy: 0.62, align: 'left' },
        { a: 2, b: 1, text: '2+i', kind: 'pi', dx: 0.42, dy: 0, align: 'left' },
        { a: 2, b: -1, text: '2−i', kind: 'pibar', dx: 0.42, dy: 0, align: 'left' },
        { a: 3, b: 2, text: '3+2i', kind: 'pi', dx: 0.42, dy: 0, align: 'left' },
        { a: 3, b: -2, text: '3−2i', kind: 'pibar', dx: 0.42, dy: 0, align: 'left' },
    ];

    function makePrimePlot(canvas, { mirror }) {
        const CSS = 420;
        const ctx = canvas.getContext('2d');
        const lit = { ram: 0, inert: 0, pi: 0, pibar: 0 };
        const litTarget = { ...lit };
        let flip = 0, flipTarget = 0, flipFrom = 0, flipStart = 0, raf = 0;
        const FLIP_MS = 1500, LIT_RATE = 1 / 450;   // lit: 0 → 1 in 450 ms
        let last = 0;

        function fit() {
            const k = Math.min(4, Math.max(2, (window.devicePixelRatio || 1) * Reveal.getScale()));
            const px = Math.round(CSS * k);
            if (canvas.width !== px) { canvas.width = canvas.height = px; }
            draw();
        }

        function draw() {
            const k = canvas.width / CSS;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(k, 0, 0, k, 0, 0);
            const s = CSS / (2 * PLOT_R + 2.4), c0 = CSS / 2;
            const cosF = Math.cos(Math.PI * flip), sinF = Math.sin(Math.PI * flip);
            const X = (a) => c0 + a * s, Y = (b) => c0 - b * s;

            // grid and axes
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
            ctx.beginPath();
            for (let n = -PLOT_R; n <= PLOT_R; n++) {
                ctx.moveTo(X(n), Y(-PLOT_R - 0.6)); ctx.lineTo(X(n), Y(PLOT_R + 0.6));
                ctx.moveTo(X(-PLOT_R - 0.6), Y(n)); ctx.lineTo(X(PLOT_R + 0.6), Y(n));
            }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
            ctx.beginPath();
            ctx.moveTo(X(0), Y(-PLOT_R - 1)); ctx.lineTo(X(0), Y(PLOT_R + 1));
            ctx.stroke();
            if (mirror) {
                ctx.save();
                ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
                ctx.lineWidth = 1.6;
                ctx.setLineDash([7, 5]);
                ctx.beginPath(); ctx.moveTo(X(-PLOT_R - 1), Y(0)); ctx.lineTo(X(PLOT_R + 1), Y(0)); ctx.stroke();
                ctx.restore();
            } else {
                ctx.beginPath(); ctx.moveTo(X(-PLOT_R - 1), Y(0)); ctx.lineTo(X(PLOT_R + 1), Y(0)); ctx.stroke();
            }

            // the primes, back to front (the flip is a half-turn about the real axis)
            const pts = PRIMES.map((p) => ({ ...p, y: p.b * cosF, z: p.b * sinF }))
                .sort((p, q) => p.z - q.z);
            for (const p of pts) {
                const L = lit[p.kind];
                const r = s * 0.3 * (1 + 0.18 * p.z / PLOT_R);
                ctx.globalAlpha = 0.55 + 0.45 * L;
                ctx.fillStyle = L > 0.01 ? mixColor(DIM, KIND_COLOR[p.kind], L) : DIM;
                ctx.shadowColor = KIND_COLOR[p.kind];
                ctx.shadowBlur = 9 * L;
                ctx.beginPath();
                ctx.arc(X(p.a), Y(p.y), r, 0, 2 * Math.PI);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;

            // names of a few positions
            ctx.font = '600 13px Inter, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(6, 10, 20, 0.85)';
            for (const l of LABELS) {
                const L = mirror ? 1 : lit[l.kind];
                if (L < 0.02) continue;
                ctx.globalAlpha = L;
                ctx.fillStyle = mixColor('#ffffff', KIND_COLOR[l.kind], 0.4);
                ctx.textAlign = l.align;
                const tx = X(l.a) + s * l.dx, ty = Y(l.b) + s * l.dy;
                ctx.strokeText(l.text, tx, ty);
                ctx.fillText(l.text, tx, ty);
            }
            ctx.globalAlpha = 1;
        }

        function tick(now) {
            const dt = last ? now - last : 16;
            last = now;
            let busy = false;
            for (const kd of KINDS) {
                const d = litTarget[kd] - lit[kd];
                if (Math.abs(d) > 1e-3) {
                    lit[kd] += Math.sign(d) * Math.min(Math.abs(d), dt * LIT_RATE);
                    busy = true;
                } else lit[kd] = litTarget[kd];
            }
            if (flip !== flipTarget) {
                const s = Math.min(1, (now - flipStart) / FLIP_MS);
                flip = flipFrom + (flipTarget - flipFrom) * ease(s);
                if (s >= 1) flip = flipTarget; else busy = true;
            }
            draw();
            raf = busy ? requestAnimationFrame(tick) : 0;
            if (!busy) last = 0;
        }

        return {
            fit,
            draw,
            /** Set the targets; animate=false snaps (used when arriving on the slide). */
            set(litKinds, flipTo, animate) {
                for (const kd of KINDS) litTarget[kd] = litKinds.includes(kd) ? 1 : 0;
                if (!animate) {
                    Object.assign(lit, litTarget);
                    flip = flipTarget = flipTo;
                    if (raf) { cancelAnimationFrame(raf); raf = 0; last = 0; }
                    draw();
                    return;
                }
                if (flipTo !== flipTarget) { flipFrom = flip; flipTarget = flipTo; flipStart = performance.now(); }
                if (!raf) raf = requestAnimationFrame(tick);
            },
        };
    }

    function mixColor(c1, c2, t) {
        const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
        const a = h(c1), b = h(c2);
        return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
    }

    const kindsSlide = document.getElementById('step3');
    const mirrorSlide = document.getElementById('step4');
    const kindsPlot = makePrimePlot(document.getElementById('primes-kinds'), { mirror: false });
    const mirrorPlot = makePrimePlot(document.getElementById('primes-mirror'), { mirror: true });

    function syncPlots(animate) {
        const phase = visibleMax(kindsSlide, 'data-kinds');
        const litKinds = [phase >= 1 && 'ram', phase >= 2 && 'inert', phase >= 3 && 'pi', phase >= 3 && 'pibar'].filter(Boolean);
        kindsPlot.set(litKinds, 0, animate === kindsSlide);
        mirrorPlot.set(KINDS, visibleMax(mirrorSlide, 'data-flip') >= 1 ? 1 : 0, animate === mirrorSlide);
    }

    // ── slide 9: the factorizer and its ledger ─────────────────────
    const fz = document.getElementById('factorizer');
    if (fz) {
        const CHIPS = [[3, 4, 5], [5, 12, 13], [-33, 56, 65], [63, -16, 65], [-117, 44, 125], [943, 576, 1105]];
        const inputs = ['a', 'b', 'c'].map((k) => document.getElementById('fz-' + k));
        const out = document.getElementById('fz-out');
        const ledger = document.getElementById('ledger');
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
        function texFrac(a, b, c) {
            let num;
            const ab = b < 0n ? -b : b;
            if (b === 0n) num = String(a);
            else if (a === 0n) num = (b === 1n ? '' : b === -1n ? '-' : String(b)) + 'i';
            else num = `${a} ${b < 0n ? '-' : '+'} ${ab === 1n ? '' : ab}i`;
            return c === 1n ? num : `\\frac{${num}}{${c}}`;
        }
        // π_p = x + yi, π̄_p = x − yi, to a power
        const piTeX = (x, y, conj, k) => {
            const base = `(${x}${conj ? '-' : '+'}${y === 1 ? '' : y}i)`;
            return k === 1 ? base : `${base}^{${k}}`;
        };
        const piHTML = (x, y, conj) => `${x}${conj ? '−' : '+'}${y === 1 ? '' : y}<i>i</i>`;
        const UNIT_TEX = ['', 'i\\,', '-', '-i\\,'];
        const UNIT_ALONE = ['1', 'i', '-1', '-i'];

        function gaussianTeX(u, live) {
            if (!live.length) return UNIT_ALONE[u];
            const num = [], den = [];
            for (const [p, e] of live) {
                const { x, y } = G.generator(p);
                num.push(piTeX(x, y, e < 0, Math.abs(e)));
                den.push(piTeX(x, y, e > 0, Math.abs(e)));
            }
            return `${UNIT_TEX[u]}\\dfrac{${num.join('')}}{${den.join('')}}`;
        }

        // One column per Gaussian prime; bar height ∝ exponent, up = numerator.
        function column(cls, lab, e) {
            const h = Math.min(Math.abs(e), 2.5) * 0.8;
            const dir = e > 0 ? 'up' : 'down';
            const num = e === 0 ? '<div class="lg-num zero">0</div>'
                // .lg-num is set at 0.78em, so convert the bar's ems into its own
                : `<div class="lg-num" style="${e > 0 ? 'bottom' : 'top'}: calc(50% + ${((h + 0.12) / 0.78).toFixed(3)}em)">${minus(e)}</div>`;
            return `<div class="lg-col ${cls}"><div class="lg-area">` +
                (e ? `<div class="lg-bar ${dir}" data-h="${h}"></div>` : '') +
                `${num}</div><div class="lg-lab">${lab}</div></div>`;
        }
        function renderLedger(exps) {
            const e = new Map(exps);
            const livePrimes = exps.filter(([, n]) => n).map(([p]) => p);
            const shown = [...livePrimes];
            for (const p of [5, 13, 17, 29]) if (shown.length < 4 && !shown.includes(p)) shown.push(p);
            shown.sort((p, q) => p - q);
            let html = `<div class="lg-group"><div class="lg-cols">${column('ram', '1+<i>i</i>', 0)}</div><div class="lg-glab">2</div></div>`;
            html += `<div class="lg-group"><div class="lg-cols">${[3, 7, 11].map((q) => column('inert', q, 0)).join('')}</div><div class="lg-glab">≡ 3 mod 4</div></div>`;
            for (const p of shown) {
                const { x, y } = G.generator(p);
                const n = e.get(p) || 0;
                html += `<div class="lg-group${n ? ' live' : ''}"><div class="lg-cols">` +
                    column('pi', piHTML(x, y, false), n) + column('pibar', piHTML(x, y, true), -n) +
                    `</div><div class="lg-glab">${p}</div></div>`;
            }
            ledger.innerHTML = html;
            // grow the bars from the zero line
            requestAnimationFrame(() => requestAnimationFrame(() => {
                ledger.querySelectorAll('.lg-bar').forEach((b) => { b.style.height = b.dataset.h + 'em'; });
            }));
        }

        // Shrink a long equation (big audience triples) to the width of the box.
        function fitMain() {
            const main = out.querySelector('.fz-main');
            const math = main && main.querySelector('mjx-math');
            if (!math) return;
            main.style.fontSize = '';
            const avail = out.getBoundingClientRect().width, w = math.getBoundingClientRect().width;
            if (w > avail) main.style.fontSize = (1.15 * 0.97 * avail / w).toFixed(3) + 'em';
        }

        let pending = 0;
        function render() {
            const [a, b, c] = inputs.map((i) => parse(i.value));
            chipBox.querySelectorAll('button').forEach((btn, i) => {
                const t = CHIPS[i];
                btn.classList.toggle('on', a === BigInt(t[0]) && b === BigInt(t[1]) && c === BigInt(t[2]));
            });
            let html, exps = [];
            if (a === null || b === null || c === null) {
                html = '<div class="fz-err">Enter integers \\(a, b, c\\) with \\(a^2 + b^2 = c^2\\).</div>';
            } else {
                const f = G.factorRotation(a, b, c);
                if (!f.ok) {
                    html = `<div class="fz-err">\\(${a}^2 + ${b}^2 \\ne ${c}^2\\): not a rotation.</div>`;
                } else {
                    exps = f.exps;
                    const live = f.exps.filter(([, n]) => n);
                    const reduced = f.c !== (c < 0n ? -c : c);
                    const gauss = gaussianTeX(f.u, live);
                    const word = G.wordTeX(f.u, f.exps);
                    const rhs = live.length ? `${gauss} \\;=\\; ${word}` : gauss;
                    const denom = live.length
                        ? live.map(([p, n]) => (Math.abs(n) > 1 ? `${p}^{${Math.abs(n)}}` : `${p}`)).join(' \\cdot ')
                        : '1';
                    html = `<div class="fz-main">\\[ ${texFrac(f.a, f.b, f.c)} \\;=\\; ${rhs} \\]</div>` +
                        `<div class="fz-row">${reduced ? '(in lowest terms) · ' : ''}denominator ` +
                        `\\(${f.c}${live.length && denom !== String(f.c) ? ' = ' + denom : ''} = \\prod p^{|e_p|}\\)</div>`;
                }
            }
            renderLedger(exps);
            ledger.classList.toggle('off', !/fz-main/.test(html));
            const ticket = ++pending;
            out.style.visibility = 'hidden';
            out.innerHTML = html;
            typeset(out).then(() => {
                if (ticket !== pending) return;
                fitMain();
                out.style.visibility = 'visible';
            });
        }
        let timer = 0;
        inputs.forEach((inp) => {
            inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 280); });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); inp.blur(); render(); }
            });
        });
        CHIPS[0].forEach((v, i) => { inputs[i].value = minus(v); });
        Reveal.on('ready', render);
    }

    // ── the crown behind the title ─────────────────────────────────
    const crownCv = document.getElementById('title-crown');
    const crown = (() => {
        if (!crownCv) return { show() {} };
        const ctx = crownCv.getContext('2d');
        const pts = G.rationalPoints(1600).sort((p, q) => q.c - p.c);
        const img = document.createElement('canvas');
        let W = 0, H = 0, dpr = 1, R = 0, on = false, raf = 0;
        const t0 = performance.now();

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
    let lastSlide = null;
    function sync() {
        const slide = Reveal.getCurrentSlide();
        const overview = Reveal.isOverview();
        // fragment steps on the slide we were already on animate; arrivals snap
        const animate = slide === lastSlide && !overview ? slide : null;
        lastSlide = slide;
        crown.show(!!slide && slide.id === 'title' && !overview);
        stereo.show(!!slide && slide.id === 'rational' && !overview);
        syncPlots(animate);
    }
    ['ready', 'slidechanged', 'fragmentshown', 'fragmenthidden', 'overviewshown', 'overviewhidden']
        .forEach((ev) => Reveal.on(ev, sync));
    Reveal.on('ready', () => { kindsPlot.fit(); mirrorPlot.fit(); });
    Reveal.on('resize', () => { kindsPlot.fit(); mirrorPlot.fit(); });
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => { kindsPlot.draw(); mirrorPlot.draw(); });
    }
})();
