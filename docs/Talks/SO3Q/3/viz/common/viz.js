/**
 * viz.js — the small kit shared by the talk's visualizations.
 *
 *  • Embed contract (?embed=1, as in the Crepe/MathFest decks): the deck owns
 *    navigation.  The page never steps itself on arrow keys; it forwards them
 *    to the parent as {type:'iframeNav', direction}, and other deck shortcuts
 *    (S, F, B, O, Esc, …) as {type:'iframeKey', keyCode}.  The deck drives the
 *    page with {type:'goTo', step}, {type:'active', on}, 'toggle', 'reset'
 *    and {type:'orbit', dx, dy}.  Standalone, the page shows its own step
 *    arrows and answers the keyboard itself.
 *  • A virtual clock advanced by the render loop, so every animation is a
 *    pure function of it — and `window.viz.advance(seconds)` can drive the
 *    page deterministically when requestAnimationFrame is throttled.
 *  • Tweens (timed, eased) and Faders (exponential approach).
 *  • Captions, one per step, typeset once by MathJax and cross-faded.
 */
(function (root) {
    'use strict';

    const params = new URLSearchParams(location.search);
    const EMBED = params.has('embed') && params.get('embed') !== '0';
    if (EMBED) document.documentElement.classList.add('embed');

    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (e0, e1, x) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const ease = {
        linear: (t) => t,
        inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        out: (t) => 1 - Math.pow(1 - t, 3),
        inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    };

    const clock = { t: 0 };

    /** A scalar gliding to its target along a timed, eased path. */
    class Tween {
        constructor(v) {
            this.v = v; this.from = v; this.to = v;
            this.t0 = 0; this.dur = 0; this.fn = ease.inOut;
        }
        set(to, { dur = 1, delay = 0, fn = ease.inOut, instant = false } = {}) {
            if (instant || dur <= 0) {
                this.v = this.from = this.to = to; this.dur = 0;
                return this;
            }
            if (to === this.to && (this.dur > 0 || this.v === to)) return this;
            this.from = this.get(); this.to = to;
            this.t0 = clock.t + delay; this.dur = dur; this.fn = fn;
            return this;
        }
        get() {
            if (this.dur > 0) {
                const u = (clock.t - this.t0) / this.dur;
                if (u >= 1) { this.dur = 0; this.v = this.to; }
                else this.v = u <= 0 ? this.from : lerp(this.from, this.to, this.fn(u));
            } else this.v = this.to;
            return this.v;
        }
        get moving() { return this.dur > 0; }
    }

    /** A value approaching its target exponentially (time constant tau, seconds). */
    class Fader {
        constructor(v = 0, tau = 0.3) { this.v = v; this.target = v; this.tau = tau; }
        to(x, tau) { this.target = x; if (tau) this.tau = tau; return this; }
        snap(x) { this.v = this.target = x; return this; }
        step(dt) {
            this.v += (this.target - this.v) * (1 - Math.exp(-dt / this.tau));
            if (Math.abs(this.target - this.v) < 2e-3) this.v = this.target;
            return this.v;
        }
        get moving() { return this.v !== this.target; }
    }

    /** A DPR-aware canvas filling `host`. */
    function makeCanvas(host) {
        const cv = document.createElement('canvas');
        host.appendChild(cv);
        const ctx = cv.getContext('2d');
        const S = { cv, ctx, W: 0, H: 0, dpr: 1 };
        S.resize = function () {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const W = host.clientWidth, H = host.clientHeight;
            if (W === S.W && H === S.H && dpr === S.dpr) return false;
            S.W = W; S.H = H; S.dpr = dpr;
            cv.width = Math.max(1, Math.round(W * dpr));
            cv.height = Math.max(1, Math.round(H * dpr));
            cv.style.width = W + 'px';
            cv.style.height = H + 'px';
            return true;
        };
        S.begin = function () {
            ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
            ctx.clearRect(0, 0, S.W, S.H);
        };
        S.resize();
        return S;
    }

    /** A soft round glow sprite (drawn with drawImage — far cheaper than shadowBlur). */
    function glowSprite(rgb, size = 64) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.18, `rgba(${rgb},0.95)`);
        gr.addColorStop(0.5, `rgba(${rgb},0.28)`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(0, 0, size, size);
        return c;
    }

    /**
     * Run `frame(dt)` every animation frame.  Time only advances while the
     * page is active, and `advance()` steps it by hand.
     */
    function startLoop(frame) {
        let last = null, active = true;
        function tick(now) {
            requestAnimationFrame(tick);
            const dt = last == null ? 1 / 60 : Math.min(0.1, Math.max(0, (now - last) / 1000));
            last = now;
            if (!active) return;
            clock.t += dt;
            frame(dt);
        }
        requestAnimationFrame(tick);
        return {
            setActive(on) { active = on; },
            get active() { return active; },
            advance(seconds, fps = 60) {
                const n = Math.max(1, Math.round(seconds * fps));
                for (let i = 0; i < n; i++) { clock.t += 1 / fps; frame(1 / fps); }
            },
        };
    }

    function typeset(el) {
        const go = () => (window.MathJax && MathJax.typesetPromise
            ? MathJax.typesetPromise([el]).catch((e) => console.warn('MathJax', e)) : null);
        if (window.MathJax && MathJax.startup && MathJax.startup.promise) return MathJax.startup.promise.then(go);
        return new Promise((res) => window.addEventListener('load', () => {
            if (window.MathJax && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(go).then(res);
            else res();
        }));
    }

    /**
     * Steps + captions + the message/keyboard plumbing.
     *   defs: [{id, caption}] (caption: HTML with \( TeX \))
     *   handlers: {onStep(id, info), onCommand(cmd), onOrbit(dx, dy), onActive(on)}
     */
    function setup(defs, handlers) {
        const ids = defs.map((d) => d.id);
        const capBox = document.getElementById('captions');
        defs.forEach((d) => {
            const el = document.createElement('div');
            el.className = 'cap';
            el.innerHTML = d.caption;
            capBox.appendChild(el);
            d.el = el;
        });
        typeset(capBox).then(() => document.documentElement.classList.add('typeset'));

        const nav = document.getElementById('nav');
        let cur = -1, replay = false;

        function goTo(step, opts = {}) {
            let i = typeof step === 'number' ? step : ids.indexOf(String(step));
            if (i < 0 && /^\d+$/.test(String(step))) i = Number(step);
            if (i < 0 || i >= defs.length) return;
            const prev = cur;
            if (i === prev && !opts.force && !replay) return;
            replay = false;
            cur = i;
            defs.forEach((d, j) => d.el.classList.toggle('on', j === i));
            if (nav) nav.querySelector('.nav-count').textContent = `${i + 1} / ${defs.length}`;
            handlers.onStep(ids[i], { prev: prev >= 0 ? ids[prev] : null, instant: !!opts.instant, index: i });
        }

        if (nav) {
            nav.querySelector('.nav-prev').addEventListener('click', () => goTo(Math.max(0, cur - 1)));
            nav.querySelector('.nav-next').addEventListener('click', () => goTo(Math.min(defs.length - 1, cur + 1)));
        }

        window.addEventListener('keydown', (e) => {
            if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
            const k = e.key;
            const dir = (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ') ? 'next'
                : (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp') ? 'prev' : null;
            if (EMBED) {
                if (dir) {
                    e.preventDefault();
                    parent.postMessage({ type: 'iframeNav', direction: dir }, '*');
                } else if (!e.metaKey && !e.ctrlKey && !e.altKey &&
                    ['s', 'S', 'f', 'F', 'b', 'B', 'o', 'O', '.', 'Escape', 'Home', 'End'].includes(k)) {
                    e.preventDefault();
                    parent.postMessage({ type: 'iframeKey', keyCode: e.keyCode }, '*');
                }
                return;
            }
            if (dir === 'next') { e.preventDefault(); goTo(Math.min(defs.length - 1, cur + 1)); }
            else if (dir === 'prev') { e.preventDefault(); goTo(Math.max(0, cur - 1)); }
            else if (k === 'p' || k === 'P') handlers.onCommand && handlers.onCommand('toggle');
            else if (k === 'r' || k === 'R') handlers.onCommand && handlers.onCommand('reset');
        });

        window.addEventListener('message', (e) => {
            const d = e.data;
            if (d == null) return;
            if (typeof d === 'string') { handlers.onCommand && handlers.onCommand(d); return; }
            if (d.type === 'goTo') goTo(d.step, { instant: !!d.instant });
            else if (d.type === 'active') {
                // coming back on stage: the next goTo replays its step, even if it is the current one
                if (d.on && !isActive) replay = true;
                isActive = !!d.on;
                handlers.onActive && handlers.onActive(!!d.on);
            }
            else if (d.type === 'orbit') handlers.onOrbit && handlers.onOrbit(+d.dx || 0, +d.dy || 0);
            else if (typeof d.cmd === 'string') handlers.onCommand && handlers.onCommand(d.cmd);
        });

        let isActive = !EMBED;
        const start = params.get('step');
        goTo(start != null ? start : 0, { instant: true, force: true });
        if (EMBED && parent !== window) parent.postMessage({ type: 'vizReady', name: document.body.dataset.viz }, '*');

        return { goTo, get current() { return ids[cur]; }, ids };
    }

    root.VizKit = {
        EMBED, params, clamp, lerp, smooth, ease, clock,
        Tween, Fader, makeCanvas, glowSprite, startLoop, setup, typeset,
    };
})(window);
