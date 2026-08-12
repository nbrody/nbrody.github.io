'use strict';
/* Binary-tree SVG visualizer for Leavitt algebra elements.
 * Diagonal monomials e_a render as filled vertices; s_a t_b (a != b) renders
 * as a curved arrow from node b to node a. playSteps() animates the engine's
 * canonicalization traces (subdivide / cancel / merge). speed = 0 => instant.
 */
class TreeViz {
    static NS = 'http://www.w3.org/2000/svg';
    static PALETTE = ['#00f2ff', '#b48cff', '#ffc861', '#7dff9c', '#ff8ca8',
                      '#8cb4ff', '#ffe9a8', '#a8ffe9', '#ff9d5d', '#5dff8f'];

    constructor(svg, opts = {}) {
        this.svg = svg;
        this.W = opts.width || 520;
        this.H = opts.height || 300;
        this.pad = opts.pad || 22;
        this.depth = opts.depth || 3;
        this.onNodeClick = opts.onNodeClick || null;
        this.speed = 1;
        this.markers = new Map();   // key -> {pair, el, color}
        this.ci = 0;
        this._uid = 'tv' + Math.floor(Math.random() * 1e6);
        svg.setAttribute('viewBox', `0 0 ${this.W} ${this.H}`);
        this._build();
    }

    dur(ms) { return this.speed > 0 ? ms / this.speed : 0; }
    key(p) { return p.a + '|' + p.b; }
    pos(w) {
        const l = w.length, idx = w ? parseInt(w, 2) : 0;
        return { x: (idx + 0.5) * this.W / (1 << l),
                 y: this.pad + l * (this.H - 2 * this.pad) / Math.max(this.depth, 1) };
    }
    el(tag, attrs, parent) {
        const e = document.createElementNS(TreeViz.NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        (parent || this.svg).appendChild(e);
        return e;
    }
    _mid(i) { return this._uid + '-ah-' + i; }

    setDepth(d) {
        d = Math.max(2, Math.min(6, d));
        if (d === this.depth) return;
        this.depth = d;
        const pairs = [...this.markers.values()].map(m => m.pair);
        this._build();
        this.showPairs(pairs);
    }
    neededDepth(elm) {
        let n = 2;
        const it = elm.values ? elm.values() : elm;
        for (const p of it) n = Math.max(n, p.a.length, p.b.length);
        return Math.min(6, Math.max(2, n + 1));
    }

    _build() {
        this.svg.innerHTML = '';
        const defs = this.el('defs', {});
        TreeViz.PALETTE.forEach((c, i) => {
            const m = this.el('marker', { id: this._mid(i), viewBox: '0 0 10 10',
                refX: 8, refY: 5, markerWidth: 5.5, markerHeight: 5.5,
                orient: 'auto-start-reverse' }, defs);
            this.el('path', { d: 'M0,0 L10,5 L0,10 z', fill: c }, m);
        });
        this.gEdges = this.el('g', { class: 'tv-edges' });
        this.gMk = this.el('g', { class: 'tv-mk' });
        this.gNodes = this.el('g', { class: 'tv-nodes' });
        this.gFx = this.el('g', { class: 'tv-fx' });
        this.markers.clear(); this.ci = 0;
        this._pendEl = null;

        const walk = w => {
            const P = this.pos(w);
            if (w.length < this.depth) for (const b of '01') {
                const C = this.pos(w + b);
                this.el('line', { x1: P.x, y1: P.y, x2: C.x, y2: C.y, class: 'tv-edge' }, this.gEdges);
                if (w.length < 2) {
                    const t = this.el('text', {
                        x: (P.x + C.x) / 2 + (b === '0' ? -8 : 8),
                        y: (P.y + C.y) / 2, class: 'tv-elabel', 'text-anchor': 'middle'
                    }, this.gEdges);
                    t.textContent = b;
                }
                walk(w + b);
            }
            this.el('circle', { cx: P.x, cy: P.y, r: 2.6, class: 'tv-node' }, this.gNodes);
            const hit = this.el('circle', { cx: P.x, cy: P.y, r: 11,
                class: 'tv-hit' + (this.onNodeClick ? ' clickable' : '') }, this.gNodes);
            this.el('title', {}, hit).textContent = w === '' ? 'ε (root)' : w;
            if (this.onNodeClick) hit.addEventListener('click', () => this.onNodeClick(w));
        };
        walk('');
    }

    nextColor() { return TreeViz.PALETTE[this.ci++ % TreeViz.PALETTE.length]; }
    clearMarkers() { this.gMk.innerHTML = ''; this.gFx.innerHTML = ''; this.markers.clear(); this.ci = 0; }
    showElement(elm) { this.showPairs(Leavitt.sortPairs(elm)); }
    showPairs(pairs) { this.clearMarkers(); for (const p of pairs) this.addMarker(p); }
    currentPairs() { return [...this.markers.values()].map(m => m.pair); }

    monoText(p) {
        if (p.a === '' && p.b === '') return '1';
        if (p.a === p.b) return 'e_' + p.a;
        return (p.a ? 's_' + p.a : '') + (p.a && p.b ? ' ' : '') + (p.b ? 't_' + p.b : '');
    }

    addMarker(p, color) {
        const k = this.key(p);
        if (this.markers.has(k)) return this.markers.get(k);
        color = color || this.nextColor();
        let node;
        if (p.a === p.b) {
            const P = this.pos(p.a);
            node = this.el('g', { transform: `translate(${P.x},${P.y})`, class: 'tv-vx' }, this.gMk);
            this.el('circle', { r: 7, fill: color, 'fill-opacity': 0.9,
                stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1.2 }, node);
        } else {
            let mi = TreeViz.PALETTE.indexOf(color); if (mi < 0) mi = 0;
            node = this.el('path', { d: this.arrowPath(p), class: 'tv-arrow', fill: 'none',
                stroke: color, 'stroke-width': 2.4, 'marker-end': `url(#${this._mid(mi)})` }, this.gMk);
        }
        this.el('title', {}, node).textContent = this.monoText(p);
        const rec = { pair: p, el: node, color };
        this.markers.set(k, rec);
        return rec;
    }
    arrowPath(p) {   // from node b to node a
        const A = this.pos(p.b), B = this.pos(p.a);
        let dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const a0 = { x: A.x + dx * 9, y: A.y + dy * 9 };
        const b0 = { x: B.x - dx * 12, y: B.y - dy * 12 };
        const k = Math.min(46, 12 + d * 0.22);
        const mx = (a0.x + b0.x) / 2 - dy * k, my = (a0.y + b0.y) / 2 + dx * k;
        return `M${a0.x},${a0.y} Q${mx},${my} ${b0.x},${b0.y}`;
    }
    removeMarker(k) { const m = this.markers.get(k); if (m) { m.el.remove(); this.markers.delete(k); } }
    setHL(k, on) { const m = this.markers.get(k); if (m) m.el.classList.toggle('hl', !!on); }
    dimAll(op = 0.18) { for (const m of this.markers.values()) m.el.setAttribute('opacity', op); }

    setPending(word) {
        if (this._pendEl) { this._pendEl.remove(); this._pendEl = null; }
        if (word !== null && word !== undefined) {
            const P = this.pos(word);
            this._pendEl = this.el('circle', { cx: P.x, cy: P.y, r: 10, class: 'tv-pending' }, this.gFx);
        }
    }

    async anim(el, kf, ms, easing = 'ease-in-out') {
        const d = this.dur(ms);
        if (d <= 0) return;
        try { await el.animate(kf, { duration: d, easing }).finished; }
        catch (e) { /* cancelled */ }
    }
    sleep(ms) { return new Promise(r => setTimeout(r, this.dur(ms))); }

    async pulse(k) {
        const m = this.markers.get(k); if (!m) return;
        if (m.el.tagName === 'g') {
            const c = m.el.querySelector('circle');
            await this.anim(c, [{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }], 360);
        } else {
            await this.anim(m.el, [{ strokeWidth: '2.4px' }, { strokeWidth: '5.5px' }, { strokeWidth: '2.4px' }], 360);
        }
    }
    async fadeOut(k) {
        const m = this.markers.get(k); if (!m) return;
        await this.anim(m.el, [{ opacity: 1 }, { opacity: 0 }], 280);
        this.removeMarker(k);
    }
    async spawn(p, color, fromPos) {
        const k = this.key(p);
        if (this.markers.has(k)) return this.markers.get(k);
        const rec = this.addMarker(p, color);
        if (rec.el.tagName === 'g' && fromPos) {
            const P = this.pos(p.a);
            rec.el.setAttribute('transform', `translate(${fromPos.x},${fromPos.y})`);
            await this.anim(rec.el,
                [{ transform: `translate(${fromPos.x}px,${fromPos.y}px)` },
                 { transform: `translate(${P.x}px,${P.y}px)` }], 420);
            rec.el.setAttribute('transform', `translate(${P.x},${P.y})`);
        } else {
            await this.anim(rec.el, [{ opacity: 0 }, { opacity: 1 }], 280);
        }
        return rec;
    }
    async flashZero(msg = '0') {
        const t = this.el('text', { x: this.W / 2, y: this.H / 2, class: 'tv-zero',
            'text-anchor': 'middle' }, this.gFx);
        t.textContent = msg;
        const d = this.dur(650);
        if (d > 0) {
            try { await t.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }],
                { duration: d }).finished; } catch (e) {}
        }
        t.remove();
    }

    // Play an engine canonicalization trace against the currently shown markers.
    async playSteps(steps, onChange) {
        for (const st of steps) {
            if (st.type === 'subdivide') {
                const k = this.key(st.p);
                const m = this.markers.get(k);
                const col = m ? m.color : this.nextColor();
                const from = (st.p.a === st.p.b) ? this.pos(st.p.a) : null;
                if (m) { this.setHL(k, true); await this.sleep(160); }
                this.removeMarker(k);
                await Promise.all(st.into.map(c =>
                    this.markers.has(this.key(c)) ? Promise.resolve() : this.spawn(c, col, from)));
            } else if (st.type === 'cancel') {
                const k = this.key(st.p);
                await this.pulse(k);
                await this.fadeOut(k);
            } else if (st.type === 'merge') {
                const col = (this.markers.get(this.key(st.from[0])) || {}).color;
                const P = this.pos(st.into.a);
                await Promise.all(st.from.map(async c => {
                    const m = this.markers.get(this.key(c)); if (!m) return;
                    if (m.el.tagName === 'g' && st.into.a === st.into.b) {
                        const C = this.pos(c.a);
                        await this.anim(m.el,
                            [{ transform: `translate(${C.x}px,${C.y}px)` },
                             { transform: `translate(${P.x}px,${P.y}px)` }], 380);
                    } else {
                        await this.anim(m.el, [{ opacity: 1 }, { opacity: 0.1 }], 280);
                    }
                    this.removeMarker(this.key(c));
                }));
                if (!this.markers.has(this.key(st.into))) await this.spawn(st.into, col);
            }
            if (onChange) onChange(this);
            await this.sleep(90);
        }
    }
}
