// render.js — drawing the Poincaré disk, the polygon, the curves and the twist animation.
import { toDisk, mapply, normPoint, lerpGeo } from './hyp.js';

export const HUES = ['#f472b6', '#38bdf8', '#fbbf24', '#34d399', '#a78bfa', '#fb923c', '#22d3ee', '#f87171'];
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// geodesic segment p→q (hyperboloid) as disk points
function sampleSeg(p, q, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(toDisk(i === 0 ? p : i === n ? q : lerpGeo(p, q, i / n)));
    return out;
}

// tessellation edges near D, as disk polylines (cached per surface)
export function tessellation(S, depth = 2) {
    const key = '_tess' + depth;
    if (S[key]) return S[key];
    const lines = [], seen = new Set();
    for (const t of S.tiles(depth)) {
        for (let i = 0; i < S.n; i++) {
            const a = mapply(t.M, S.vertices[(i + S.n - 1) % S.n]), b = mapply(t.M, S.vertices[i]);
            const da = toDisk(normPoint(a)), db = toDisk(normPoint(b));
            const k = [da, db].map(d => d.map(x => x.toFixed(4)).join(',')).sort().join('|');
            if (seen.has(k)) continue;
            seen.add(k);
            lines.push(sampleSeg(normPoint(a), normPoint(b), 16));
        }
    }
    S[key] = lines;
    return lines;
}
// D's own sides, side i running from vertex i−1 to vertex i
export function polygonSides(S) {
    if (S._sides) return S._sides;
    S._sides = Array.from({ length: S.n }, (_, i) => sampleSeg(S.vertices[(i + S.n - 1) % S.n], S.vertices[i], 24));
    return S._sides;
}

// a curve's pieces as disk polylines, optionally mapped by a tile matrix
export function curvePolylines(curve, M = null) {
    const lines = [];
    let cur = null, last = null;
    for (const pc of curve.pieces()) {
        const a = M ? normPoint(mapply(M, pc.a)) : pc.a, b = M ? normPoint(mapply(M, pc.b)) : pc.b;
        if (!cur || last !== pc.a) { cur = [toDisk(a)]; lines.push(cur); }
        cur.push(toDisk(b));
        last = pc.b;
    }
    return lines;
}
// lifts in the neighboring tiles, cached per curve version
export function liftPolylines(curve, S) {
    if (curve._liftV === curve.version && curve._lifts) return curve._lifts;
    const out = [];
    for (const t of S.tiles(2)) if (t.word.length) out.push(...curvePolylines(curve, t.M));
    curve._lifts = out; curve._liftV = curve.version;
    return out;
}

function strokeLines(ctx, lines, view) {
    ctx.beginPath();
    for (const l of lines) {
        for (let i = 0; i < l.length; i++) {
            const x = view.cx + l[i][0] * view.r, y = view.cy - l[i][1] * view.r;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
    }
    ctx.stroke();
}

export function pairHue(S, side) {
    const k = Math.min(side, S.partner[side]);
    const pair = (k >> 2) * 2 + (k % 4 === 0 ? 0 : 1);
    return `hsl(${Math.round(360 * pair / (2 * S.g))}, 70%, 62%)`;
}

export function draw(ctx, st) {
    const { S, view } = st;
    const W = st.W, H = st.H;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the disk
    ctx.fillStyle = css('--disk-fill');
    ctx.beginPath(); ctx.arc(view.cx, view.cy, view.r, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = css('--disk-edge'); ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = css('--tile-edge'); ctx.lineWidth = 1;
    strokeLines(ctx, tessellation(S, 2), view);
    // the polygon, each pair of glued sides in its own color
    const sides = polygonSides(S);
    ctx.lineWidth = 1.6;
    for (let i = 0; i < S.n; i++) {
        ctx.strokeStyle = pairHue(S, i);
        ctx.globalAlpha = 0.75;
        strokeLines(ctx, [sides[i]], view);
    }
    ctx.globalAlpha = 1;
    if (st.showVerts) {
        ctx.fillStyle = css('--poly-edge');
        for (const v of S.vertices) {
            const d = toDisk(v);
            ctx.beginPath(); ctx.arc(view.cx + d[0] * view.r, view.cy - d[1] * view.r, 2.5, 0, 2 * Math.PI); ctx.fill();
        }
    }
    const tw = st.anim && st.anim.kind === 'twist' && st.anim.phase === 'wind' ? st.anim : null;
    const hot = st.anim && st.anim.kind === 'twist' ? st.anim.c : st.hotRef;
    if (tw) drawCollar(ctx, tw.tw, tw.t, view);
    else if (st.hotTw) drawCollar(ctx, st.hotTw, 0, view, 0.6);
    // reference curves
    if (st.showRefs || st.showAux) {
        for (const [name, c] of Object.entries(st.refs)) {
            const isAux = !/^c\d+$/.test(name);
            if (isAux ? !st.showAux : !st.showRefs) continue;
            if (!isAux && st.g === 2 && name === 'c0') continue;
            const isHot = hot === c;
            ctx.strokeStyle = isHot ? css('--accent') : css('--ref-ink');
            ctx.lineWidth = isHot ? 2.2 : 1.3;
            ctx.setLineDash(isAux ? [2, 4] : isHot ? [] : [6, 4]);
            strokeLines(ctx, curvePolylines(c), view);
        }
        ctx.setLineDash([]);
    }
    // the twist curve, when it is a user curve
    if (st.anim && st.anim.kind === 'twist' && !Object.values(st.refs).includes(st.anim.c)) {
        ctx.strokeStyle = css('--accent'); ctx.lineWidth = 6; ctx.globalAlpha = 0.25;
        strokeLines(ctx, curvePolylines(st.anim.c), view);
        ctx.globalAlpha = 1;
    }
    // user curves: lifts first, then the curves in D
    st.curves.forEach((u, i) => {
        if (u.curve.trivial) return;
        const color = st.palette === 'ink' ? css('--curve-ink') : u.hue;
        const img = tw && tw.images.get(u);
        if (st.showLifts && !img) {
            ctx.strokeStyle = color; ctx.globalAlpha = 0.28; ctx.lineWidth = 1;
            strokeLines(ctx, liftPolylines(u.curve, S), view);
            ctx.globalAlpha = 1;
        }
        const lines = img ? pointLines(img.pts, img.tear) : curvePolylines(u.curve);
        if (i === st.sel) {
            ctx.strokeStyle = color; ctx.globalAlpha = 0.22; ctx.lineWidth = 7;
            strokeLines(ctx, lines, view);
            ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        strokeLines(ctx, lines, view);
        if (st.showVerts) {
            ctx.fillStyle = color;
            for (const p of u.curve.P) {
                const d = toDisk(p);
                ctx.fillRect(view.cx + d[0] * view.r - 1.5, view.cy - d[1] * view.r - 1.5, 3, 3);
            }
        }
    });
    // a stroke being drawn
    if (st.stroke) {
        const s = st.stroke;
        ctx.strokeStyle = css('--ink-faint') || '#888'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath();
        s.screen.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = st.palette === 'ink' ? css('--curve-ink') : HUES[st.nextHue % HUES.length];
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.pts.forEach((p, i) => {
            const d = toDisk(p), x = view.cx + d[0] * view.r, y = view.cy - d[1] * view.r;
            if (i === 0 || s.words[i - 1].length) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }
}

// points of D (a closed loop, as the twist map moves it) → disk polylines; break at the tears
// and wherever a step jumps across a side of D
function pointLines(pts, tear) {
    const lines = [];
    let cur = null;
    const n = pts.length;
    for (let i = 0; i <= n; i++) {
        const p = toDisk(pts[i % n]);
        const jump = !cur || (i && (tear[i - 1] || Math.hypot(p[0] - cur[cur.length - 1][0], p[1] - cur[cur.length - 1][1]) > 0.2));
        if (jump) { cur = [p]; lines.push(cur); } else cur.push(p);
    }
    return lines;
}

// the collar of a twist: its edges and stripes across it, slid along by the twist at time t
function drawCollar(ctx, tw, t, view, alpha = 1) {
    const K = Math.max(6, Math.min(60, Math.round(tw.L / 0.16)));
    const half = Math.max(4, Math.ceil(0.5 * t * tw.L / 0.03));
    const run = f => {
        const lines = [];
        let cur = null;
        for (const x of f) {
            const p = toDisk(x);
            if (!cur || Math.hypot(p[0] - cur[cur.length - 1][0], p[1] - cur[cur.length - 1][1]) > 0.2) { cur = [p]; lines.push(cur); }
            else cur.push(p);
        }
        return lines;
    };
    ctx.save();
    ctx.strokeStyle = css('--accent');
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.32 * alpha;
    const edge = [];
    for (const v of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 120; i++) pts.push(tw.stripePoint(i / 120, v, 0));
        edge.push(...run(pts));
    }
    strokeLines(ctx, edge, view);
    ctx.globalAlpha = 0.5 * alpha;
    const stripes = [];
    for (let j = 0; j < K; j++)
        for (const sg of [-1, 1]) {
            const pts = [];
            for (let i = 0; i <= half; i++) pts.push(tw.stripePoint(j / K, sg * (0.02 + 0.98 * i / half), t));
            stripes.push(...run(pts));
        }
    strokeLines(ctx, stripes, view);
    ctx.restore();
}

// ---------------------------------------------------------------- SVG
export function svgOf(st) {
    const { S } = st;
    const R = 400, c = 420, size = 2 * c;
    const P = l => l.map(([x, y], i) => `${i ? 'L' : 'M'}${(c + x * R).toFixed(2)},${(c - y * R).toFixed(2)}`).join('');
    const path = (lines, attrs) => `<path d="${lines.map(P).join('')}" fill="none" ${attrs}/>`;
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`,
        `<rect width="${size}" height="${size}" fill="#ffffff"/>`,
        `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#c8ccd6" stroke-width="1"/>`,
        path(tessellation(S, 2), 'stroke="#e3e6ec" stroke-width="1"')];
    polygonSides(S).forEach((s, i) => parts.push(path([s], `stroke="${pairHue(S, i)}" stroke-width="1.6"`)));
    if (st.showRefs) for (const [name, cv] of Object.entries(st.refs))
        if (/^c\d+$/.test(name) && !(st.g === 2 && name === 'c0')) parts.push(path(curvePolylines(cv), 'stroke="#9aa1b0" stroke-width="1.2" stroke-dasharray="6 4"'));
    st.curves.forEach(u => {
        if (u.curve.trivial) return;
        const col = st.palette === 'ink' ? '#23262e' : u.hue;
        if (st.showLifts) parts.push(path(liftPolylines(u.curve, S), `stroke="${col}" stroke-opacity="0.3" stroke-width="1"`));
        parts.push(path(curvePolylines(u.curve), `stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`));
    });
    parts.push('</svg>');
    return parts.join('\n');
}
