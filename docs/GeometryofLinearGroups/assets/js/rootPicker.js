/**
 * rootPicker.js — choose a root of a polynomial by clicking it in a plot of the complex plane.
 * Used to pick the embedding of a number field Q(w) (Kleinian/poincare, Algebraic/zariskiClosure).
 *
 *   const picker = RootPicker.create(container, { onSelect: (i) => … });
 *   picker.set(roots, selectedIndex, name);   // roots: [{ re, im }], name: the generator, e.g. 'w'
 *
 * Roots are clickable and keyboard-selectable (Tab to focus, arrows to move, Enter or Space to pick).
 * Colours come from CSS variables so each page can theme it:
 *   --rp-accent (selected root), --rp-ink (other roots), --rp-dim (caption), --rp-faint (axes),
 *   --rp-bg (plot background), --rp-dot (fill of unselected roots), --rp-line (border), --rp-font.
 */
(function (root) {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const W = 320, H = 168, PAD = 20;

    const STYLE = `
.rp { margin-top: 2px; }
.rp-svg { display: block; width: 100%; max-width: 380px; height: auto; background: var(--rp-bg, transparent); border: 1px solid var(--rp-line, rgba(127,127,127,0.3)); border-radius: 8px; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.rp-axis { stroke: var(--rp-faint, #8a94a1); stroke-width: 1; opacity: 0.7; }
.rp-unit { stroke: var(--rp-faint, #8a94a1); stroke-width: 1; stroke-dasharray: 3 3; fill: none; opacity: 0.55; }
.rp-tick { stroke: var(--rp-faint, #8a94a1); stroke-width: 1; opacity: 0.7; }
.rp-label { fill: var(--rp-faint, #8a94a1); font: 10px var(--rp-font, -apple-system, BlinkMacSystemFont, sans-serif); }
.rp-root { cursor: pointer; outline: none; }
.rp-root .rp-hit { fill: transparent; }
.rp-root .rp-dot { fill: var(--rp-dot, var(--rp-bg, #fff)); stroke: var(--rp-ink, #1f2a37); stroke-width: 1.6; transition: r 0.12s ease; }
.rp-root:hover .rp-dot, .rp-root:focus-visible .rp-dot { stroke: var(--rp-accent, #2f5d8a); stroke-width: 2.4; }
.rp-root .rp-halo { fill: var(--rp-accent, #2f5d8a); opacity: 0; }
.rp-root.sel .rp-dot { fill: var(--rp-accent, #2f5d8a); stroke: var(--rp-accent, #2f5d8a); }
.rp-root.sel .rp-halo { opacity: 0.22; }
.rp-root:focus-visible .rp-halo { opacity: 0.32; }
.rp-caption { margin-top: 5px; font: 12.5px var(--rp-font, -apple-system, BlinkMacSystemFont, sans-serif); color: var(--rp-dim, #5f6b7a); font-variant-numeric: tabular-nums; }
.rp-caption b { color: var(--rp-ink, #1f2a37); font-weight: 600; }
.rp-empty { fill: var(--rp-faint, #8a94a1); font: 12px var(--rp-font, -apple-system, BlinkMacSystemFont, sans-serif); }
`;
    function injectStyle() {
        if (typeof document === 'undefined' || document.getElementById('root-picker-style')) return;
        const s = document.createElement('style');
        s.id = 'root-picker-style';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }
    const el = (tag, attrs = {}, parent = null) => {
        const e = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
        if (parent) parent.appendChild(e);
        return e;
    };
    const num = (x) => { const s = (Math.abs(x) < 5e-10 ? 0 : x).toFixed(6).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s.replace('-', '−'); };
    function fmt(z) {
        if (Math.abs(z.im) < 5e-10) return num(z.re);
        const im = `${num(Math.abs(z.im)) === '1' ? '' : num(Math.abs(z.im))}i`;
        if (Math.abs(z.re) < 5e-10) return (z.im < 0 ? '−' : '') + im;
        return `${num(z.re)} ${z.im < 0 ? '−' : '+'} ${im}`;
    }
    /** A "nice" tick value (1, 2 or 5 times a power of ten) at most x. */
    function niceBelow(x) {
        if (!(x > 0)) return 1;
        const p = Math.pow(10, Math.floor(Math.log10(x)));
        for (const m of [5, 2, 1]) if (m * p <= x) return m * p;
        return p;
    }

    function create(container, opts = {}) {
        injectStyle();
        const wrap = document.createElement('div');
        wrap.className = 'rp';
        const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rp-svg', role: 'radiogroup', 'aria-label': 'Roots in the complex plane' });
        const caption = document.createElement('div');
        caption.className = 'rp-caption';
        wrap.appendChild(svg);
        wrap.appendChild(caption);
        container.appendChild(wrap);
        const state = { roots: [], sel: 0, name: 'w' };
        let focusIndex = null;

        function render() {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const { roots, name } = state;
            if (!roots.length) {
                el('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', class: 'rp-empty' }, svg).textContent = 'no roots to show';
                caption.textContent = '';
                return;
            }
            // view: the roots and the origin, real axis centred vertically, equal scales
            let xmin = Math.min(0, ...roots.map((z) => z.re)), xmax = Math.max(0, ...roots.map((z) => z.re));
            const ymax = Math.max(...roots.map((z) => Math.abs(z.im)));
            const span = Math.max(xmax - xmin, 2 * ymax, 1e-9);
            const minSpan = Math.max(span * 0.35, 0.5);
            const sx = Math.max(xmax - xmin, minSpan), sy = Math.max(2 * ymax, minSpan);
            const k = Math.min((W - 2 * PAD) / sx, (H - 2 * PAD) / sy);
            const cx = (xmin + xmax) / 2;
            const X = (x) => W / 2 + (x - cx) * k, Y = (y) => H / 2 - y * k;
            const vis = { x0: cx - (W / 2) / k, x1: cx + (W / 2) / k, y1: (H / 2) / k };
            // axes, unit circle, ticks
            el('line', { x1: 0, y1: Y(0), x2: W, y2: Y(0), class: 'rp-axis' }, svg);
            if (vis.x0 < 0 && vis.x1 > 0) el('line', { x1: X(0), y1: 0, x2: X(0), y2: H, class: 'rp-axis' }, svg);
            if (k > 6) el('circle', { cx: X(0), cy: Y(0), r: k, class: 'rp-unit' }, svg);
            const t = niceBelow(Math.min(Math.max(Math.abs(vis.x0), Math.abs(vis.x1)), vis.y1) * 0.8);
            const label = (v) => (t >= 1 ? String(v) : v.toFixed(Math.max(0, -Math.floor(Math.log10(t))))).replace('-', '−');
            for (const s of [-1, 1]) {
                const xv = s * t;
                if (xv > vis.x0 + 4 / k && xv < vis.x1 - 4 / k) {
                    el('line', { x1: X(xv), y1: Y(0) - 3, x2: X(xv), y2: Y(0) + 3, class: 'rp-tick' }, svg);
                    el('text', { x: X(xv), y: Y(0) + 13, 'text-anchor': 'middle', class: 'rp-label' }, svg).textContent = label(xv);
                }
                if (vis.x0 < 0 && vis.x1 > 0 && t < vis.y1 - 4 / k) {
                    el('line', { x1: X(0) - 3, y1: Y(s * t), x2: X(0) + 3, y2: Y(s * t), class: 'rp-tick' }, svg);
                    el('text', { x: X(0) + 6, y: Y(s * t) + 3.5, class: 'rp-label' }, svg).textContent = `${s < 0 ? '−' : ''}${t === 1 ? '' : label(t)}i`;
                }
            }
            // roots
            roots.forEach((z, i) => {
                const sel = i === state.sel;
                const g = el('g', {
                    class: `rp-root${sel ? ' sel' : ''}`, tabindex: sel ? '0' : '-1', role: 'radio',
                    'aria-checked': sel ? 'true' : 'false', 'aria-label': `${name} ≈ ${fmt(z)}`,
                }, svg);
                el('title', {}, g).textContent = `${name} ≈ ${fmt(z)}`;
                el('circle', { cx: X(z.re), cy: Y(z.im), r: 11, class: 'rp-halo' }, g);
                el('circle', { cx: X(z.re), cy: Y(z.im), r: sel ? 6 : 5, class: 'rp-dot' }, g);
                el('circle', { cx: X(z.re), cy: Y(z.im), r: 13, class: 'rp-hit' }, g);
                g.addEventListener('click', () => choose(i));
                g.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(i); }
                    else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
                        e.preventDefault();
                        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
                        choose((i + d + roots.length) % roots.length, true);
                    }
                });
            });
            caption.innerHTML = '';
            const b = document.createElement('b');
            b.textContent = `${name} ≈ ${fmt(roots[state.sel])}`;
            caption.appendChild(b);
            caption.appendChild(document.createTextNode(roots.length > 1 ? ' · click a root to choose the embedding' : ''));
            if (focusIndex !== null) { const f = svg.querySelectorAll('.rp-root')[focusIndex]; if (f) f.focus(); focusIndex = null; }
        }
        function choose(i, keepFocus = false) {
            if (i === state.sel) return;
            state.sel = i;
            if (keepFocus) focusIndex = i;
            render();
            if (opts.onSelect) opts.onSelect(i);
        }
        return {
            el: wrap,
            set(roots, sel = 0, name = state.name) {
                state.roots = (roots || []).map((z) => ({ re: +z.re, im: +z.im || 0 }));
                state.sel = Math.min(Math.max(0, sel | 0), Math.max(0, state.roots.length - 1));
                state.name = name || 'w';
                render();
            },
            get selected() { return state.sel; },
        };
    }

    root.RootPicker = { create, format: fmt };
})(typeof window !== 'undefined' ? window : this);
