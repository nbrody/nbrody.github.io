// render.js — SVG views shared by the notes and the explorer. The views set classes,
// never theme colours, so light/dark lives entirely in style.css.
(function (root) {
    'use strict';
    const HG = root.HG;
    const NS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs, parent) {
        const e = document.createElementNS(NS, tag);
        if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function html(tag, attrs, parent, text) {
        const e = document.createElement(tag);
        if (attrs) for (const k in attrs) if (attrs[k] != null) {
            if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
        }
        if (text != null) e.textContent = text;
        if (parent) parent.appendChild(e);
        return e;
    }
    const pts = P => P.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
    const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // A tween that never strands its caller: requestAnimationFrame does not fire in a
    // hidden tab (and can stall in a backgrounded pane without the page being told), so
    // a hidden document or reduced motion finishes at once, and a watchdog finishes late
    // frames.
    function tween(ms, frame, done) {
        if (document.hidden || reduceMotion() || ms <= 0) { frame(1); if (done) done(); return { cancel() {} }; }
        let t0 = null, live = true;
        const finish = () => {
            if (!live) return;
            live = false;
            clearTimeout(watchdog);
            document.removeEventListener('visibilitychange', vis);
            frame(1);
            if (done) done();
        };
        const step = now => {
            if (!live) return;
            if (t0 == null) t0 = now;
            const t = Math.min(1, (now - t0) / ms);
            if (t < 1) { frame(t); requestAnimationFrame(step); } else finish();
        };
        const vis = () => { if (document.hidden) finish(); };
        const watchdog = setTimeout(finish, ms + 300);
        document.addEventListener('visibilitychange', vis);
        requestAnimationFrame(step);
        return { cancel() { live = false; clearTimeout(watchdog); document.removeEventListener('visibilitychange', vis); } };
    }
    const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const pairLabel = (n, i, j) => n > 9 ? (i + 1) + ',' + (j + 1) : '' + (i + 1) + (j + 1);
    const shapeOf = (n, i, j) => Math.min(j - i, n - (j - i));

    // ---------------------------------------------------------------- tiling view
    // render(spec) redraws everything from a plain description:
    //   T | tiles                the tiling, or an explicit list [{i, j, base, step, cls}]
    //   label                    'none' | 'pair' | 'step'
    //   paths   [{perm, cls}]    monotone paths 0 → 1 given by their reading words
    //   ghosts  [{i, j, base, key, label}]   clickable outlines (ascents to push across)
    //   markers [{mask, key, cls, title}]    clickable vertices (degree-3 vertices)
    //   strand  k | null         the zone of direction k, drawn through edge midpoints
    //   hiPairs Set of pair keys 'i,j' to emphasise;  hiMask  a vertex to ring
    //   edgeLabels, cornerLabels booleans
    class TilingView {
        constructor(svg, opts) {
            this.svg = svg;
            this.opts = Object.assign({ unit: 60, pad: 30, color: 'shape' }, opts || {});
            this.handlers = {};
            this.n = 0;
            svg.classList.add('tiling-view');
            svg.addEventListener('click', e => {
                const t = e.target.closest('[data-pick]');
                if (t) this.emit('pick', t.dataset.pick, t.dataset.key);
            });
            svg.addEventListener('pointerover', e => {
                const t = e.target.closest('[data-hover]');
                this.emit('hover', t ? t.dataset.hover : null, t ? t.dataset.key : null);
            });
            svg.addEventListener('pointerleave', () => this.emit('hover', null, null));
        }
        on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
        emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
        setN(n) {
            if (n === this.n) return;
            this.n = n;
            this.V = HG.vectors(n);
            const C = HG.pos(HG.full(n), this.V);
            this.C = [C[0] / 2, C[1] / 2];
            let R = 0;
            for (const m of HG.boundaryMasks(n)) { const p = this.world(m); R = Math.max(R, Math.hypot(p[0], p[1])); }
            this.R = R;
            const u = this.opts.unit, h = R * u + this.opts.pad;
            this.svg.setAttribute('viewBox', `${-h} ${-h} ${2 * h} ${2 * h}`);
        }
        world(mask) { const p = HG.pos(mask, this.V); return [p[0] - this.C[0], p[1] - this.C[1]]; }
        xy(mask) { const p = this.world(mask), u = this.opts.unit; return [p[0] * u, -p[1] * u]; }
        xyw(p) { const u = this.opts.unit; return [p[0] * u, -p[1] * u]; }
        tileClass(i, j) {
            const n = this.n, mode = this.opts.color;
            if (mode === 'plain') return 'tile t-plain';
            if (mode === 'pair') return n * (n - 1) / 2 <= 6 ? 'tile t-shape-' + (HG.pairIndex(n, i, j) + 1) : 'tile t-pair';
            return 'tile t-shape-' + shapeOf(n, i, j);
        }
        tileFill(i, j) {
            const n = this.n, N = n * (n - 1) / 2;
            if (this.opts.color !== 'pair' || N <= 6) return null;
            const k = HG.pairIndex(n, i, j);
            return `hsl(${(k * 360 / N * 7) % 360} var(--pair-s) var(--pair-l))`;
        }
        render(spec) {
            spec = spec || {};
            const n = this.n, svg = this.svg, u = this.opts.unit;
            this.spec = spec;
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const gTiles = el('g', { class: 'g-tiles' }, svg);
            const gOver = el('g', { class: 'g-over' }, svg);
            const gTop = el('g', { class: 'g-top' }, svg);
            this.gTiles = gTiles;

            // boundary
            const B = HG.boundaryMasks(n).map(m => this.xy(m));
            el('polygon', { points: pts(B), class: 'boundary-fill' }, gTiles);

            const tiles = spec.tiles || (spec.T ? HG.tilesOf(spec.T) : []);
            const hide = spec.hidePairs || null;
            for (const t of tiles) {
                if (hide && hide.has(t.i + ',' + t.j)) continue;
                this.drawTile(t, spec, gTiles);
            }
            // ghosts: parallelograms a path could be pushed across
            for (const g of spec.ghosts || []) {
                const c = [g.base, g.base | 1 << g.i, g.base | 1 << g.i | 1 << g.j, g.base | 1 << g.j].map(m => this.xy(m));
                const grp = el('g', { class: 'ghost', 'data-pick': 'ghost', 'data-key': g.key, 'data-hover': 'ghost' }, gOver);
                el('polygon', { points: pts(c) }, grp);
                if (g.label) {
                    const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2;
                    el('text', { x: cx, y: cy, class: 'ghost-label' }, grp).textContent = g.label;
                }
            }
            el('polygon', { points: pts(B), class: 'boundary' }, gOver);

            if (spec.strand != null) this.drawStrand(spec.strand, spec.strandTiles, gOver);

            for (const p of spec.paths || []) {
                let m = 0;
                const P = [this.xy(0)];
                for (const k of p.perm) { m |= 1 << k; P.push(this.xy(m)); }
                el('polyline', { points: pts(P), class: 'path ' + (p.cls || '') }, gOver);
            }
            if (spec.edgeLabels) this.drawEdgeLabels(gTop);
            if (spec.cornerLabels !== false) {
                const z = this.xy(0), o = this.xy(HG.full(n));
                el('text', { x: z[0], y: z[1] + 20, class: 'corner-label' }, gTop).textContent = '0';
                el('text', { x: o[0], y: o[1] - 9, class: 'corner-label' }, gTop).textContent = '1';
            }
            if (spec.hiMask != null) {
                const p = this.xy(spec.hiMask);
                el('circle', { cx: p[0], cy: p[1], r: 9, class: 'vertex-ring' }, gTop);
            }
            for (const mk of spec.markers || []) {
                const p = this.xy(mk.mask);
                const grp = el('g', { class: 'marker ' + (mk.cls || ''), 'data-pick': 'marker', 'data-key': mk.key, 'data-hover': 'marker' }, gTop);
                el('circle', { cx: p[0], cy: p[1], r: 13, class: 'marker-hit' }, grp);
                el('circle', { cx: p[0], cy: p[1], r: 5.2, class: 'marker-dot' }, grp);
                if (mk.title) el('title', null, grp).textContent = mk.title;
            }
        }
        drawTile(t, spec, parent) {
            const n = this.n;
            const c = [t.base, t.base | 1 << t.i, t.base | 1 << t.i | 1 << t.j, t.base | 1 << t.j].map(m => this.xy(m));
            const key = t.i + ',' + t.j;
            let cls = this.tileClass(t.i, t.j);
            if (t.cls) cls += ' ' + t.cls;
            if (spec.hiPairs && spec.hiPairs.has(key)) cls += ' hi';
            const g = el('g', { class: cls, 'data-hover': 'tile', 'data-key': key }, parent);
            const poly = el('polygon', { points: pts(c) }, g);
            const f = this.tileFill(t.i, t.j);
            if (f) poly.style.fill = f;
            const lab = spec.label === 'pair' ? pairLabel(n, t.i, t.j) : spec.label === 'step' && t.step != null ? String(t.step + 1) : null;
            if (lab) {
                const cx = (c[0][0] + c[2][0]) / 2, cy = (c[0][1] + c[2][1]) / 2;
                el('text', { x: cx, y: cy, class: 'tile-label' }, g).textContent = lab;
            }
            return g;
        }
        drawEdgeLabels(parent) {
            const n = this.n, R = this.R * this.opts.unit;
            for (let k = 0; k < n; k++) {
                // the edge v_k on p_0 and the edge −v_k on p_1
                for (const [a, b, lab] of [[HG.full(k), HG.full(k + 1), k + 1], [HG.full(n) & ~HG.full(k), HG.full(n) & ~HG.full(k + 1), k + 1]]) {
                    const A = this.xy(a), Bq = this.xy(b), mx = (A[0] + Bq[0]) / 2, my = (A[1] + Bq[1]) / 2;
                    const r = Math.hypot(mx, my), s = (r + 13) / r;
                    el('text', { x: mx * s, y: my * s, class: 'edge-label' }, parent).textContent = lab;
                }
            }
        }
        strandPoints(k, list) {
            const n = this.n, V = this.V, out = [];
            const half = m => { const p = this.world(m); return this.xyw([p[0] + V[k][0] / 2, p[1] + V[k][1] / 2]); };
            out.push(half(HG.full(k)));
            for (const t of list) out.push(half(t.base | 1 << t.other));
            return out;
        }
        drawStrand(k, list, parent) {
            if (!list) return;
            const P = this.strandPoints(k, list);
            el('polyline', { points: pts(P), class: 'strand' }, parent);
            el('circle', { cx: P[0][0], cy: P[0][1], r: 3.5, class: 'strand-end' }, parent);
        }
        // Rotate the hexagon of flip f by π about its centre — the antipodal map of the
        // 3-cube, which carries the front half of its boundary to the back half.
        animateFlip(f, ms, done) {
            const n = this.n, T = this.spec.T;
            if (!T) { if (done) done(); return; }
            const keys = new Set([f.a + ',' + f.b, f.a + ',' + f.c, f.b + ',' + f.c]);
            const spec = Object.assign({}, this.spec, { hidePairs: keys, markers: [], ghosts: [] });
            this.render(spec);
            this.spec = Object.assign({}, spec, { hidePairs: null });
            const H = HG.hexagonCorners(f).map(m => this.xy(m));
            const cx = (H[0][0] + H[3][0]) / 2, cy = (H[0][1] + H[3][1]) / 2;
            const g = el('g', { class: 'flipping' }, this.gTiles);
            for (const t of HG.tilesOf(T)) if (keys.has(t.i + ',' + t.j)) this.drawTile(t, { label: spec.label }, g);
            return tween(ms, t => {
                const e = ease(t);
                g.setAttribute('transform', `rotate(${(180 * e).toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})`);
            }, done);
        }
    }

    // ---------------------------------------------------------------- word chips
    // The word as a row of letters, with a red bracket under every available 2-move and a
    // blue bracket under every available 3-move. Brackets are buttons.
    class WordChips {
        constructor(host, opts) {
            this.host = host;
            this.opts = Object.assign({ moves: true, prefix: '' }, opts || {});
            this.handlers = {};
            host.classList.add('word-chips');
            host.addEventListener('click', e => {
                const b = e.target.closest('[data-move]');
                if (b) { const [p, kind] = b.dataset.move.split(':').map(Number); this.emit('move', { p, kind }); return; }
                const l = e.target.closest('[data-letter]');
                if (l) this.emit('letter', +l.dataset.letter);
            });
            host.addEventListener('pointerover', e => {
                const b = e.target.closest('[data-move]');
                const l = e.target.closest('[data-letter]');
                this.emit('hover', b ? 'move' : l ? 'letter' : null, b ? b.dataset.move : l ? +l.dataset.letter : null);
            });
            host.addEventListener('pointerleave', () => this.emit('hover', null, null));
        }
        on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
        emit(ev, ...a) { for (const f of this.handlers[ev] || []) f(...a); }
        render(word, o) {
            o = o || {};
            const host = this.host;
            host.innerHTML = '';
            const row = html('div', { class: 'wc-row' }, host);
            row.style.setProperty('--len', word.length);
            word.forEach((s, q) => {
                let cls = 'wc-letter';
                if (o.active != null && q < o.active) cls += ' done';
                if (o.active != null && q === o.active - 1) cls += ' current';
                if (o.hi && o.hi.has(q)) cls += ' hi';
                if (o.flash && o.flash.has(q)) cls += ' flash';
                const b = html('button', { class: cls, 'data-letter': q, type: 'button', title: 's' + (s + 1) }, row);
                b.textContent = s + 1;
            });
            if (!this.opts.moves) return;
            const M = HG.moves(word);
            // stack brackets into lanes so overlapping ones stay readable
            const lanes = [];
            for (const m of M) {
                const a = m.p, b = m.p + m.kind - 1;
                let L = 0;
                while (lanes[L] && lanes[L].some(([x, y]) => !(b < x || a > y))) L++;
                (lanes[L] = lanes[L] || []).push([a, b]);
                m.lane = L;
            }
            const br = html('div', { class: 'wc-brackets' }, host);
            br.style.setProperty('--len', word.length);
            br.style.setProperty('--lanes', Math.max(1, lanes.length));
            for (const m of M) {
                const b = html('button', {
                    class: 'wc-move k' + m.kind, type: 'button', 'data-move': m.p + ':' + m.kind,
                    title: m.kind === 2 ? `2-move: s${word[m.p] + 1}s${word[m.p + 1] + 1} → s${word[m.p + 1] + 1}s${word[m.p] + 1}`
                        : `3-move: s${word[m.p] + 1}s${word[m.p + 1] + 1}s${word[m.p] + 1} → s${word[m.p + 1] + 1}s${word[m.p] + 1}s${word[m.p + 1] + 1}`,
                }, br);
                b.style.gridColumn = `${m.p + 1} / span ${m.kind}`;
                b.style.gridRow = String(m.lane + 1);
            }
        }
    }

    // ---------------------------------------------------------------- wiring diagram
    // n horizontal wires; the letter s_i crosses the wires at heights i and i+1. Wire k
    // is the strand of direction k, so this is the tiling's pseudoline arrangement.
    function drawWiring(svg, n, word, o) {
        o = o || {};
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const r = word.length, dx = 26, dy = 22, W = (r + 1) * dx + 40, H = (n - 1) * dy + 24;
        svg.setAttribute('viewBox', `-24 -12 ${W} ${H}`);
        const y = lvl => (n - 1 - lvl) * dy;
        const pos = HG.identity(n), track = Array.from({ length: n }, () => []);
        for (let k = 0; k < n; k++) track[k].push([0, y(k)]);
        word.forEach((s, q) => {
            const x0 = q * dx + dx * 0.5, x1 = x0 + dx;
            const a = pos[s], b = pos[s + 1];
            for (let lvl = 0; lvl < n; lvl++) if (lvl !== s && lvl !== s + 1) track[pos[lvl]].push([x1, y(lvl)]);
            track[a].push([x0, y(s)], [x1, y(s + 1)]);
            track[b].push([x0, y(s + 1)], [x1, y(s)]);
            pos[s] = b; pos[s + 1] = a;
        });
        for (let k = 0; k < n; k++) {
            const P = track[k];
            P.push([(r + 1) * dx, P[P.length - 1][1]]);
            const cls = 'wire' + (o.hiWire === k ? ' hi' : '');
            el('polyline', { points: pts(P), class: cls, 'data-wire': k }, svg);
            el('text', { x: -8, y: y(k), class: 'wire-label' }, svg).textContent = k + 1;
            el('text', { x: (r + 1) * dx + 10, y: P[P.length - 1][1], class: 'wire-label' }, svg).textContent = k + 1;
        }
        if (o.active != null && o.active > 0 && o.active <= r) {
            const x = (o.active - 1) * dx + dx;
            el('line', { x1: x, x2: x, y1: -8, y2: y(0) + 8, class: 'wire-cursor' }, svg);
        }
    }

    root.HGR = { el, html, pts, tween, ease, TilingView, WordChips, drawWiring, pairLabel, shapeOf };
})(typeof globalThis !== 'undefined' ? globalThis : this);
