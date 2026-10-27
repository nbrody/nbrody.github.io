// surgeryPlot.js — Dehn surgery space: the slopes p/q (p ∈ ℤ, q ≥ 0, coprime) as dots,
// colored by the volume of the filled manifold (one-hue ramp, light = close to the cusped
// volume), with the exceptional slopes as open rings. Click a slope to fill it.

import { tex, mix, esc, cssVar, mixHex, showTooltip, hideTooltip, fmt } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => { const e = document.createElementNS(NS, name); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); return e; };

export class SurgeryPlot {
    constructor(container, { onPick } = {}) {
        this.box = container;
        this.onPick = onPick;
        this.points = [];
        this.current = null;
    }

    setData({ points, vmin, vmax, pmax, qmax, current }) {
        Object.assign(this, { points, vmin, vmax, pmax, qmax });
        this.current = current || null;
        this.render();
    }
    setCurrent(c) { this.current = c; this.render(); }

    render() {
        const box = this.box;
        box.innerHTML = '';
        if (!this.points.length) return;
        const W = 360, H = 30 + 34 * this.qmax + 26;
        const padL = 26, padR = 14, padT = 14, padB = 30;
        const X = (p) => padL + ((p + this.pmax) / (2 * this.pmax)) * (W - padL - padR);
        const Y = (q) => H - padB - (q / this.qmax) * (H - padT - padB);
        const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Dehn surgery space' });
        // grid and axes
        for (let q = 0; q <= this.qmax; q++) svg.appendChild(el('line', { class: q === 0 ? 'axis' : 'grid', x1: padL, x2: W - padR, y1: Y(q), y2: Y(q) }));
        svg.appendChild(el('line', { class: 'axis', x1: X(0), x2: X(0), y1: Y(0), y2: Y(this.qmax) }));
        const lo = cssVar('--seq-lo'), hi = cssVar('--seq-hi');
        const layer = document.createElement('div');
        layer.className = 'tex-layer';
        const label = (x, y, t) => { const d = document.createElement('div'); d.className = 'tex-label'; d.style.left = `${(x / W) * 100}%`; d.style.top = `${(y / H) * 100}%`; d.innerHTML = tex(t); layer.appendChild(d); };
        for (let p = -this.pmax; p <= this.pmax; p += 4) label(X(p), H - padB + 14, String(p));
        for (let q = 1; q <= this.qmax; q++) label(padL - 12, Y(q), String(q));
        label(W - padR + 4, Y(0) - 10, 'p');
        label(X(0) + 10, padT - 2, 'q');
        for (const pt of this.points) {
            const x = X(pt.p), y = Y(pt.q);
            if (pt.status === 'hyp') {
                const t = Math.max(0, Math.min(1, (pt.volume - this.vmin) / ((this.vmax - this.vmin) || 1)));
                svg.appendChild(el('circle', { class: 'dot', cx: x, cy: y, r: 4.6, fill: mixHex(lo, hi, t) }));
            } else {
                svg.appendChild(el('circle', { class: 'exc', cx: x, cy: y, r: 4.2, 'stroke-dasharray': pt.status === 'fail' ? '2 2' : null }));
                if (pt.status === 'exc') {
                    svg.appendChild(el('line', { class: 'exc-x', x1: x - 2.4, x2: x + 2.4, y1: y - 2.4, y2: y + 2.4 }));
                    svg.appendChild(el('line', { class: 'exc-x', x1: x - 2.4, x2: x + 2.4, y1: y + 2.4, y2: y - 2.4 }));
                }
            }
            if (this.current && this.current.p === pt.p && this.current.q === pt.q) svg.appendChild(el('circle', { class: 'cur', cx: x, cy: y, r: 8 }));
            const hit = el('circle', { class: 'hit', cx: x, cy: y, r: 9 });
            hit.addEventListener('mouseenter', (e) => showTooltip(this._tip(pt), e.clientX, e.clientY));
            hit.addEventListener('mousemove', (e) => showTooltip(this._tip(pt), e.clientX, e.clientY));
            hit.addEventListener('mouseleave', hideTooltip);
            hit.addEventListener('click', () => { hideTooltip(); this.onPick?.(pt); });
            svg.appendChild(hit);
        }
        box.appendChild(svg);
        box.appendChild(layer);
        const legend = document.createElement('div');
        legend.className = 'plot-legend';
        legend.innerHTML = `<span>volume ${tex(fmt(this.vmin, 2))}<span class="ramp"></span>${tex(fmt(this.vmax, 2))}</span>`
            + '<span><span class="ring"></span>exceptional</span><span><span class="ring cur"></span>current</span>';
        box.appendChild(legend);
    }

    _tip(pt) {
        const s = pt.q === 0 ? (pt.p === 1 ? '\\infty' : '?') : pt.q === 1 ? String(pt.p) : `${pt.p}/${pt.q}`;
        let h = `<div>${tex(`p/q = ${s}`)}</div>`;
        if (pt.status === 'hyp') h += `<div><span class="tt-k">volume</span> ${tex(fmt(pt.volume, 6))}</div>`;
        else if (pt.status === 'exc') h += `<div class="tt-k">${pt.q === 0 ? 'the trivial filling' : 'exceptional: SnapPy finds no hyperbolic structure'}</div>`;
        else h += `<div class="tt-k">the cone manifolds degenerate before ${tex('2\\pi')}</div>`;
        if (pt.homology) h += `<div><span class="tt-k">${tex('H_1')}</span> ${tex(pt.homology)}</div>`;
        if (pt.census) h += `<div><span class="tt-k">census</span> ${tex(`\\mathrm{${pt.census.replace(/\(/, '(').replace(/,/, ',\\,')}}`)}</div>`;
        if (pt.famous) h += `<div class="tt-k">${esc(pt.famous)}</div>`;
        return h;
    }
}

export { mix };
