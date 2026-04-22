(function () {
    'use strict';

    const FUCH = { ta: 3, tb: 3, tab: 6 };

    const state = {
        ta: { re: FUCH.ta, im: 0 },
        tb: { re: FUCH.tb, im: 0 },
        pathS: 0,
        cuspTarget: '1/1',
        depth: 10,
        pointSize: 1.0,
        colorMode: 'ct',
        view: { x: 0, y: 0, scale: 90 },
        param: { scale: 70 },
        playing: false,
        playDir: 1,
        isDraggingParam: false,
        isDraggingView: false,
        isInteracting: false,
        lastMouse: { x: 0, y: 0 },
        cached: null,
        bufSize: 900000
    };

    const buffers = {
        re: new Float64Array(state.bufSize),
        im: new Float64Array(state.bufSize),
        last: new Int8Array(state.bufSize),
        first: new Int8Array(state.bufSize),
        fRe: new Float64Array(state.bufSize),
        fIm: new Float64Array(state.bufSize),
        nRe: new Float64Array(state.bufSize),
        nIm: new Float64Array(state.bufSize),
        nLast: new Int8Array(state.bufSize),
        nFirst: new Int8Array(state.bufSize),
        nFRe: new Float64Array(state.bufSize),
        nFIm: new Float64Array(state.bufSize),
        out: new Float32Array(state.bufSize * 5)
    };

    function cAdd(a, b) { return { re: a.re + b.re, im: a.im + b.im }; }
    function cSub(a, b) { return { re: a.re - b.re, im: a.im - b.im }; }
    function cMul(a, b) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }; }
    function cInv(a) {
        const d = a.re * a.re + a.im * a.im;
        return { re: a.re / d, im: -a.im / d };
    }
    function cDiv(a, b) { return cMul(a, cInv(b)); }
    function cNeg(a) { return { re: -a.re, im: -a.im }; }
    function cScale(a, s) { return { re: a.re * s, im: a.im * s }; }
    function cSqrt(a) {
        const r = Math.hypot(a.re, a.im);
        const s = Math.sqrt((r + a.re) / 2);
        const t = Math.sign(a.im || 1) * Math.sqrt((r - a.re) / 2);
        return { re: s, im: t };
    }

    function solveMarkov(ta, tb) {
        const ta2 = cMul(ta, ta);
        const tb2 = cMul(tb, tb);
        const prod = cMul(ta, tb);
        const disc = cSub(cMul(prod, prod), cScale(cAdd(ta2, tb2), 4));
        const sq = cSqrt(disc);
        return cScale(cAdd(prod, sq), 0.5);
    }

    function solveBeta(tab) {
        const disc = cSub(cMul(tab, tab), { re: 4, im: 0 });
        const sq = cSqrt(disc);
        return cScale(cAdd(tab, sq), 0.5);
    }

    function buildMatrices(ta, tb) {
        const tab = solveMarkov(ta, tb);
        const beta = solveBeta(tab);
        const invBeta = cInv(beta);
        const negInvBeta = cNeg(invBeta);
        const one = { re: 1, im: 0 };
        const negOne = { re: -1, im: 0 };
        const zero = { re: 0, im: 0 };

        const A = [ta, negOne, one, zero];
        const B = [zero, beta, negInvBeta, tb];
        const Ainv = [zero, one, negOne, ta];
        const Binv = [tb, cNeg(beta), invBeta, zero];

        return { A, B, Ainv, Binv, tab, beta };
    }

    function applyMobius(M, w) {
        const num = cAdd(cMul(M[0], w), M[1]);
        const den = cAdd(cMul(M[2], w), M[3]);
        return cDiv(num, den);
    }

    function applyMobiusReal(M, x) {
        const a = M[0].re, b = M[1].re, c = M[2].re, d = M[3].re;
        const denom = c * x + d;
        if (Math.abs(denom) < 1e-300) return Infinity;
        return (a * x + b) / denom;
    }

    function seedPoints(mats, fmats) {
        const seeds = [];
        const aFp = attractingFp(mats.A);
        const bFp = attractingFp(mats.B);
        const aFpInv = attractingFp(mats.Ainv);
        const bFpInv = attractingFp(mats.Binv);

        const aFpF = attractingFpReal(fmats.A);
        const bFpF = attractingFpReal(fmats.B);
        const aFpInvF = attractingFpReal(fmats.Ainv);
        const bFpInvF = attractingFpReal(fmats.Binv);

        seeds.push({ p: aFp, fp: aFpF, first: 0, last: 0 });
        seeds.push({ p: aFpInv, fp: aFpInvF, first: 1, last: 1 });
        seeds.push({ p: bFp, fp: bFpF, first: 2, last: 2 });
        seeds.push({ p: bFpInv, fp: bFpInvF, first: 3, last: 3 });
        return seeds;
    }

    function attractingFp(M) {
        const a = M[0], b = M[1], c = M[2], d = M[3];
        if (Math.abs(c.re) + Math.abs(c.im) < 1e-15) {
            const denom = cSub(a, d);
            if (Math.abs(denom.re) + Math.abs(denom.im) < 1e-15) return { re: 0, im: 0 };
            return cDiv(cNeg(b), denom);
        }
        const tr = cAdd(a, d);
        const disc = cSub(cMul(tr, tr), { re: 4, im: 0 });
        const sq = cSqrt(disc);
        const num1 = cAdd(cSub(a, d), sq);
        return cDiv(num1, cScale(c, 2));
    }

    function attractingFpReal(M) {
        const a = M[0].re, b = M[1].re, c = M[2].re, d = M[3].re;
        if (Math.abs(c) < 1e-15) {
            if (Math.abs(a - d) < 1e-15) return 0;
            return -b / (a - d);
        }
        const tr = a + d;
        const disc = tr * tr - 4;
        if (disc < 0) return 0;
        const sq = Math.sqrt(disc);
        return ((a - d) + sq) / (2 * c);
    }

    function generateOrbit(ta, tb, maxDepth) {
        const mats = buildMatrices(ta, tb);
        const fTa = { re: FUCH.ta, im: 0 }, fTb = { re: FUCH.tb, im: 0 };
        const fmats = buildMatrices(fTa, fTb);

        const gens = [mats.A, mats.Ainv, mats.B, mats.Binv];
        const fgens = [fmats.A, fmats.Ainv, fmats.B, fmats.Binv];
        const inverseOf = [1, 0, 3, 2];

        const seeds = seedPoints(mats, fmats);

        let curLen = seeds.length;
        for (let i = 0; i < curLen; i++) {
            buffers.re[i] = seeds[i].p.re;
            buffers.im[i] = seeds[i].p.im;
            buffers.last[i] = seeds[i].last;
            buffers.first[i] = seeds[i].first;
            buffers.fRe[i] = isFinite(seeds[i].fp) ? seeds[i].fp : 1e18;
            buffers.fIm[i] = 0;
        }

        let outCount = 0;
        const out = buffers.out;
        const bufCap = state.bufSize;

        for (let d = 0; d < maxDepth; d++) {
            let nextLen = 0;
            for (let i = 0; i < curLen; i++) {
                if (nextLen >= bufCap - 4) break;
                const wRe = buffers.re[i], wIm = buffers.im[i];
                const last = buffers.last[i];
                const first = buffers.first[i];
                const fx = buffers.fRe[i];
                const w = { re: wRe, im: wIm };

                for (let g = 0; g < 4; g++) {
                    if (g === inverseOf[last]) continue;
                    const M = gens[g];
                    const num = cAdd(cMul(M[0], w), M[1]);
                    const den = cAdd(cMul(M[2], w), M[3]);
                    const dmag = den.re * den.re + den.im * den.im;
                    if (dmag < 1e-30) continue;
                    const inv = { re: den.re / dmag, im: -den.im / dmag };
                    const nw = {
                        re: num.re * inv.re - num.im * inv.im,
                        im: num.re * inv.im + num.im * inv.re
                    };
                    if (!isFinite(nw.re) || !isFinite(nw.im)) continue;
                    if (nw.re * nw.re + nw.im * nw.im > 1e14) continue;

                    const Mf = fgens[g];
                    const fa = Mf[0].re, fb = Mf[1].re, fc = Mf[2].re, fd = Mf[3].re;
                    const fden = fc * fx + fd;
                    let nfx;
                    if (Math.abs(fden) < 1e-15) nfx = 1e18;
                    else nfx = (fa * fx + fb) / fden;

                    buffers.nRe[nextLen] = nw.re;
                    buffers.nIm[nextLen] = nw.im;
                    buffers.nLast[nextLen] = g;
                    buffers.nFirst[nextLen] = first;
                    buffers.nFRe[nextLen] = nfx;
                    buffers.nFIm[nextLen] = 0;
                    nextLen++;

                    if (d >= 3 && outCount + 5 <= out.length) {
                        out[outCount++] = nw.re;
                        out[outCount++] = nw.im;
                        out[outCount++] = nfx;
                        out[outCount++] = d;
                        out[outCount++] = first;
                    }
                    if (nextLen >= bufCap - 4) break;
                }
            }

            [buffers.re, buffers.nRe] = [buffers.nRe, buffers.re];
            [buffers.im, buffers.nIm] = [buffers.nIm, buffers.im];
            [buffers.last, buffers.nLast] = [buffers.nLast, buffers.last];
            [buffers.first, buffers.nFirst] = [buffers.nFirst, buffers.first];
            [buffers.fRe, buffers.nFRe] = [buffers.nFRe, buffers.fRe];
            [buffers.fIm, buffers.nFIm] = [buffers.nFIm, buffers.fIm];
            curLen = nextLen;
            if (curLen === 0) break;
        }

        return { out, count: outCount, mats };
    }

    function ctHue(fx) {
        if (!isFinite(fx) || Math.abs(fx) > 1e10) return 0;
        const angle = 2 * Math.atan(fx);
        return (angle / (2 * Math.PI) + 0.5);
    }

    function hslToRgb(h, s, l) {
        h = ((h % 1) + 1) % 1;
        const a = s * Math.min(l, 1 - l);
        const f = (n) => {
            const k = (n + h * 12) % 12;
            return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        };
        return [f(0) * 255, f(8) * 255, f(4) * 255];
    }

    const firstColors = [
        [255, 90, 110],
        [110, 200, 255],
        [255, 200, 80],
        [180, 120, 255]
    ];

    function renderLimit(canvas, ctx, result) {
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2 + state.view.x;
        const cy = H / 2 + state.view.y;
        const scale = state.view.scale;

        const img = ctx.createImageData(W, H);
        const data = img.data;
        const { out, count } = result;
        const ptRadius = Math.max(0, Math.floor(state.pointSize - 0.5));

        for (let i = 0; i < count; i += 5) {
            const re = out[i];
            const im = out[i + 1];
            const fx = out[i + 2];
            const depth = out[i + 3];
            const first = out[i + 4];

            const sx = (cx + re * scale) | 0;
            const sy = (cy - im * scale) | 0;
            if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;

            let r, g, b;
            if (state.colorMode === 'ct') {
                const h = ctHue(fx);
                const rgb = hslToRgb(h, 0.85, 0.55);
                r = rgb[0] | 0; g = rgb[1] | 0; b = rgb[2] | 0;
            } else if (state.colorMode === 'first') {
                const c = firstColors[first | 0];
                r = c[0]; g = c[1]; b = c[2];
            } else {
                const t = Math.min(1, (depth - 3) / 10);
                r = (60 + 180 * t) | 0;
                g = (100 + 60 * t) | 0;
                b = (220 - 100 * t) | 0;
            }

            for (let dx = -ptRadius; dx <= ptRadius; dx++) {
                for (let dy = -ptRadius; dy <= ptRadius; dy++) {
                    const px = sx + dx, py = sy + dy;
                    if (px < 0 || px >= W || py < 0 || py >= H) continue;
                    const idx = (py * W + px) << 2;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = 255;
                }
            }
        }
        ctx.putImageData(img, 0, 0);

        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(W, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
        ctx.stroke();
    }

    function renderParam(canvas, ctx) {
        const W = canvas.width, H = canvas.height;
        const cx = W / 2, cy = H / 2;
        const scale = state.param.scale;

        ctx.fillStyle = '#060610';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(W, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(79,172,254,0.18)';
        ctx.beginPath();
        for (let r = 1; r <= 3; r++) {
            ctx.moveTo(cx + r * scale, cy);
            ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
        }
        ctx.stroke();

        const fxPx = cx + FUCH.ta * scale / 2;
        const fyPx = cy;
        ctx.fillStyle = '#6ee7b7';
        ctx.beginPath();
        ctx.arc(fxPx, fyPx, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(110,231,183,0.85)';
        ctx.font = '11px monospace';
        ctx.fillText('F', fxPx + 8, fyPx + 4);

        const cusps = cuspTargets();
        ctx.font = '10px monospace';
        for (const name in cusps) {
            const z = cusps[name];
            const px = cx + z.re * scale / 2;
            const py = cy - z.im * scale / 2;
            ctx.fillStyle = 'rgba(251,146,60,0.85)';
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(251,191,120,0.85)';
            ctx.fillText(name, px + 6, py - 4);
        }

        const px = cx + state.ta.re * scale / 2;
        const py = cy - state.ta.im * scale / 2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(79,172,254,0.8)';
        ctx.fill();

        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#888';
        ctx.fillText('Re(t_a)', W - 55, cy - 4);
        ctx.fillText('Im(t_a)', cx + 4, 12);
    }

    function cuspTargets() {
        return {
            '1/1': { re: 3.5, im: 3.0 },
            '1/2': { re: 2.8, im: 2.6 },
            '1/3': { re: 2.3, im: 2.2 },
            '2/3': { re: 3.2, im: 2.8 }
        };
    }

    function lerp(a, b, t) { return a + (b - a) * t; }

    function updateFromPath() {
        const s = state.pathS;
        const target = cuspTargets()[state.cuspTarget];
        state.ta = {
            re: lerp(FUCH.ta, target.re, s),
            im: lerp(0, target.im, s)
        };
        state.tb = { re: FUCH.tb, im: 0 };
    }

    let renderScheduled = false;
    let highDetailTimer = null;

    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;
        requestAnimationFrame(() => {
            renderScheduled = false;
            doRender();
        });
    }

    function doRender() {
        const depth = state.isInteracting ? Math.min(state.depth, 9) : state.depth;
        const result = generateOrbit(state.ta, state.tb, depth);
        state.cached = result;
        renderLimit(limitCanvas, limitCtx, result);
        renderParam(paramCanvas, paramCtx);

        document.getElementById('param-status').textContent =
            `t_a = ${state.ta.re.toFixed(3)} ${state.ta.im >= 0 ? '+' : '-'} ${Math.abs(state.ta.im).toFixed(3)}i`;
        document.getElementById('limit-status').textContent =
            `depth ${depth}  •  ${(result.count / 5) | 0} orbit pts  •  tab ≈ ${result.mats.tab.re.toFixed(2)} ${result.mats.tab.im >= 0 ? '+' : '-'} ${Math.abs(result.mats.tab.im).toFixed(2)}i`;

        if (state.isInteracting) {
            clearTimeout(highDetailTimer);
            highDetailTimer = setTimeout(() => {
                state.isInteracting = false;
                scheduleRender();
            }, 220);
        }
    }

    let limitCanvas, limitCtx, paramCanvas, paramCtx;

    function resizeCanvases() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (const c of [limitCanvas, paramCanvas]) {
            const rect = c.getBoundingClientRect();
            c.width = Math.max(1, Math.floor(rect.width * dpr));
            c.height = Math.max(1, Math.floor(rect.height * dpr));
        }
        scheduleRender();
    }

    function setupParamEvents() {
        paramCanvas.addEventListener('mousedown', (e) => {
            state.isDraggingParam = true;
            state.isInteracting = true;
            handleParamMouse(e);
        });
        window.addEventListener('mousemove', (e) => {
            if (!state.isDraggingParam) return;
            handleParamMouse(e);
        });
        window.addEventListener('mouseup', () => {
            state.isDraggingParam = false;
        });
    }

    function handleParamMouse(e) {
        const rect = paramCanvas.getBoundingClientRect();
        const dpr = paramCanvas.width / rect.width;
        const x = (e.clientX - rect.left) * dpr;
        const y = (e.clientY - rect.top) * dpr;
        const cx = paramCanvas.width / 2, cy = paramCanvas.height / 2;
        const scale = state.param.scale;
        state.ta.re = (x - cx) * 2 / scale;
        state.ta.im = -(y - cy) * 2 / scale;
        state.playing = false;
        updatePlayBtn();
        scheduleRender();
    }

    function setupViewEvents() {
        const container = document.getElementById('limit-canvas-container');
        container.addEventListener('mousedown', (e) => {
            state.isDraggingView = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mousemove', (e) => {
            if (!state.isDraggingView) return;
            const dpr = limitCanvas.width / limitCanvas.getBoundingClientRect().width;
            state.view.x += (e.clientX - state.lastMouse.x) * dpr;
            state.view.y += (e.clientY - state.lastMouse.y) * dpr;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            state.isInteracting = true;
            scheduleRender();
        });
        window.addEventListener('mouseup', () => {
            state.isDraggingView = false;
        });
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = limitCanvas.getBoundingClientRect();
            const dpr = limitCanvas.width / rect.width;
            const mx = (e.clientX - rect.left) * dpr - limitCanvas.width / 2;
            const my = (e.clientY - rect.top) * dpr - limitCanvas.height / 2;
            const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            state.view.x = mx - (mx - state.view.x) * f;
            state.view.y = my - (my - state.view.y) * f;
            state.view.scale *= f;
            state.isInteracting = true;
            scheduleRender();
        }, { passive: false });
    }

    function setupControls() {
        const sSlider = document.getElementById('s-slider');
        const sVal = document.getElementById('s-val');
        sSlider.addEventListener('input', () => {
            state.pathS = parseInt(sSlider.value, 10) / 1000;
            sVal.textContent = state.pathS.toFixed(2);
            updateFromPath();
            state.isInteracting = true;
            scheduleRender();
        });

        const depthSlider = document.getElementById('depth-slider');
        const depthVal = document.getElementById('depth-val');
        depthSlider.addEventListener('input', () => {
            state.depth = parseInt(depthSlider.value, 10);
            depthVal.textContent = state.depth;
            scheduleRender();
        });

        const ptszSlider = document.getElementById('ptsz-slider');
        const ptszVal = document.getElementById('ptsz-val');
        ptszSlider.addEventListener('input', () => {
            state.pointSize = parseInt(ptszSlider.value, 10) / 10;
            ptszVal.textContent = state.pointSize.toFixed(1);
            scheduleRender();
        });

        document.querySelectorAll('[data-cusp]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const name = btn.getAttribute('data-cusp');
                if (name === '0/1') {
                    state.pathS = 0;
                    sSlider.value = 0;
                    sVal.textContent = '0.00';
                    updateFromPath();
                } else {
                    state.cuspTarget = name;
                }
                updateFromPath();
                scheduleRender();
            });
        });

        document.querySelectorAll('[data-color]').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-color]').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                state.colorMode = btn.getAttribute('data-color');
                scheduleRender();
            });
        });

        document.getElementById('play-btn').addEventListener('click', togglePlay);
    }

    function updatePlayBtn() {
        const btn = document.getElementById('play-btn');
        if (state.playing) {
            btn.textContent = '⏸ Pause';
            btn.classList.add('playing');
        } else {
            btn.textContent = '▶ Animate to cusp';
            btn.classList.remove('playing');
        }
    }

    let animFrame = null;
    function togglePlay() {
        state.playing = !state.playing;
        updatePlayBtn();
        if (state.playing) animate();
        else if (animFrame) cancelAnimationFrame(animFrame);
    }

    function animate() {
        if (!state.playing) return;
        state.pathS += 0.003 * state.playDir;
        if (state.pathS >= 0.995) { state.pathS = 0.995; state.playDir = -1; }
        else if (state.pathS <= 0) { state.pathS = 0; state.playDir = 1; }
        document.getElementById('s-slider').value = state.pathS * 1000;
        document.getElementById('s-val').textContent = state.pathS.toFixed(2);
        updateFromPath();
        state.isInteracting = true;
        doRender();
        animFrame = requestAnimationFrame(animate);
    }

    function init() {
        limitCanvas = document.getElementById('limit-canvas');
        paramCanvas = document.getElementById('param-canvas');
        limitCtx = limitCanvas.getContext('2d');
        paramCtx = paramCanvas.getContext('2d');

        setupControls();
        setupParamEvents();
        setupViewEvents();

        window.addEventListener('resize', resizeCanvases);
        resizeCanvases();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
