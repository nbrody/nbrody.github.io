// ────────────────────────────────────────────────────────────────
//  renderer.js — frame loop, camera, overlay, captions and UI
// ────────────────────────────────────────────────────────────────

(() => {
    const glCanvas = document.getElementById('tilingCanvas');
    const ovCanvas = document.getElementById('overlayCanvas');
    const unCanvas = document.getElementById('underCanvas');
    const octx = ovCanvas.getContext('2d');
    const uctx = unCanvas.getContext('2d');
    const $ = id => document.getElementById(id);

    // ── Color palettes ─────────────────────────────────────────
    const PALETTES = [
        { name: 'Midnight', bg: '#0a0a1a', H1: '#2d7dd2', H: '#5fa8d3', T: '#1a1a2e', P: '#3a506b', F: '#6b7fd7', stroke: '#14142a' },
        { name: 'Sunset', bg: '#1a0a1e', H1: '#ff6b6b', H: '#ffa07a', T: '#2d1b33', P: '#c06c84', F: '#f8b500', stroke: '#1a0a1e' },
        { name: 'Forest', bg: '#0a1a12', H1: '#2d936c', H: '#88d498', T: '#1a2e23', P: '#5b8c5a', F: '#a8dadc', stroke: '#081510' },
        { name: 'Neon', bg: '#0a0a0f', H1: '#ff006e', H: '#8338ec', T: '#14141f', P: '#3a86ff', F: '#fb5607', stroke: '#060609' },
        { name: 'Cream', bg: '#f5f0e8', H1: '#0089b6', H: '#94d2e6', T: '#f0ebe3', P: '#e8e0d0', F: '#b8b0a0', stroke: '#3a3530' },
        { name: 'Vapor', bg: '#12062a', H1: '#ff71ce', H: '#b967ff', T: '#1a0e33', P: '#01cdfe', F: '#05ffa1', stroke: '#0d0420' },
        { name: 'Mono', bg: '#111111', H1: '#ffffff', H: '#cccccc', T: '#1a1a1a', P: '#888888', F: '#555555', stroke: '#000000' },
        { name: 'Ember', bg: '#0f0806', H1: '#ff4500', H: '#ff8c42', T: '#1a0e08', P: '#ffd700', F: '#cc3300', stroke: '#0a0504' }
    ];

    const params = new URLSearchParams(location.search);
    let paletteIdx = 0;
    if (params.has('palette')) {
        const v = params.get('palette');
        const i = isNaN(+v) ? PALETTES.findIndex(p => p.name.toLowerCase() === v.toLowerCase()) : +v;
        if (i >= 0 && i < PALETTES.length) paletteIdx = i;
    }
    let bgHex = PALETTES[paletteIdx].bg;
    let strokeWidth = 1.0;
    let drawOutlines = false;
    let captions = params.get('captions') !== '0';
    let playing = params.get('paused') !== '1';
    let speed = Math.min(2, Math.max(0.25, +(params.get('speed') || 1)));
    let pal = null;

    function makePal() {
        const p = PALETTES[paletteIdx];
        const bg = hexRgb(bgHex);
        const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        const light = lum(bg) > 0.5;
        const stroke = hexRgb(p.stroke);
        const byLabel = ['H1', 'H', 'T', 'P', 'F'].map(k => hexRgb(p[k]));
        const ink = light ? [0.12, 0.11, 0.14] : [1, 1, 1];
        // Colours that stay visible when a hat stands alone on the background.
        const solo = byLabel.map(c => Math.abs(lum(c) - lum(bg)) < 0.1
            ? c.map((v, i) => v + (ink[i] - v) * 0.3) : c);
        const diff = Math.abs(stroke[0] - bg[0]) + Math.abs(stroke[1] - bg[1]) + Math.abs(stroke[2] - bg[2]);
        pal = {
            bg, stroke, byLabel: solo, ink, light, panel: light ? [1, 1, 1] : [0.03, 0.04, 0.09], backing: diff > 0.15,
            // Annotation accents (edge classes, focus outlines), darkened on light backgrounds.
            gold: light ? [0.78, 0.47, 0] : GOLD, cyan: light ? [0, 0.42, 0.72] : CYAN
        };
        document.documentElement.style.setProperty('--page-bg', bgHex);
    }
    makePal();

    // ── GL ─────────────────────────────────────────────────────
    let hg;
    try { hg = new HatGL(glCanvas); }
    catch (err) {
        $('loading').textContent = 'This tour needs WebGL2, which this browser does not provide.';
        return;
    }

    // ── Canvas sizing ──────────────────────────────────────────
    let W = window.innerWidth, H = window.innerHeight, dpr = 1;
    function resize() {
        W = window.innerWidth; H = window.innerHeight;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        for (const c of [unCanvas, glCanvas, ovCanvas]) {
            c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
            c.style.width = W + 'px'; c.style.height = H + 'px';
        }
        $('resolution').textContent = `${glCanvas.width}×${glCanvas.height}`;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── Patch + tour ───────────────────────────────────────────
    let P = null, tour = null, mainSet = null, extraSet = null, F = null;
    let tourT = 0, chapterIdx = -1, snapCam = true;
    const HOME_SPAN = 40;

    function build() {
        P = analyzePatch(5);
        tour = makeTour(P);
        mainSet = hg.createSet(P.n);
        mainSet.count = P.n;
        extraSet = hg.createSet(160);
        const n = P.n;
        F = {
            P, n, col: new Float32Array(n * 4), anim: new Float32Array(n * 4), off: new Float32Array(n * 2),
            cam: {}, home: { x: P.cx[P.center], y: P.cy[P.center], span: HOME_SPAN },
            extras: [], over: [], under: [], ghost: null, morph: null, stat: '', t: 0, dur: 1, dt: 0, W, H, pal
        };
        // Static part of every instance: the hat's linear map.
        for (let i = 0; i < n; i++) {
            const T = P.hats[i].T, o = i * INST_FLOATS;
            mainSet.data[o] = T[0]; mainSet.data[o + 1] = T[1]; mainSet.data[o + 2] = T[3]; mainSet.data[o + 3] = T[4];
        }
        const sel = $('chapterSelect');
        tour.chapters.forEach((ch, i) => {
            const o = document.createElement('option');
            o.value = ch.id;
            o.textContent = `${i + 1}. ${ch.title}`;
            sel.appendChild(o);
        });
        buildProgress();
        $('tileCount').textContent = `${fmt(n)} hats`;
        // Start position from the URL.
        const want = params.get('chapter');
        if (want) {
            const i = isNaN(+want) ? tour.chapters.findIndex(c => c.id === want) : +want - 1;
            if (i >= 0 && i < tour.chapters.length) tourT = tour.chapters[i].start;
        }
        if (params.has('t')) tourT += Math.max(0, +params.get('t') || 0);
        tourT %= tour.total;
        $('loading').classList.add('done');
        document.body.classList.add('ready');
        syncPlayUI();
    }

    // ── Camera ─────────────────────────────────────────────────
    const camS = { x: 0, y: 0, ls: Math.log(10), rot: 0 };
    const userCam = { x: 0, y: 0, z: 0 };
    let lastInteract = -1e9;
    let view = { cx: 0, cy: 0, scale: 1, rot: 0, W, H, oy: 0 };
    let capOff = 0;      // screen px kept clear for the caption card (eased)

    function viewFrom(cx, cy, span, rot) {
        return { cx, cy, scale: Math.min(W, H - capOff) / span, rot, W, H, oy: capOff / 2 };
    }
    function screenToWorld(v, sx, sy) {
        const rx = (sx - W / 2) / v.scale, ry = -(sy - (H / 2 - v.oy)) / v.scale;
        const c = Math.cos(-v.rot), s = Math.sin(-v.rot);
        return pt(v.cx + c * rx - s * ry, v.cy + s * rx + c * ry);
    }

    // ── Overlay API handed to chapters ─────────────────────────
    const ov = {
        ctx: octx, W, H, scale: 1,
        toS(x, y) {
            const dx = x - view.cx, dy = y - view.cy, c = Math.cos(view.rot), s = Math.sin(view.rot);
            return { x: W / 2 + (c * dx - s * dy) * view.scale, y: H / 2 - view.oy - (s * dx + c * dy) * view.scale };
        },
        visible(pts) {
            const b = polyBox(pts);
            const R = Math.hypot(W, H) / 2 / view.scale;
            return mag(b.cx - view.cx, b.cy - view.cy) < R + Math.hypot(b.w, b.h) / 2;
        }
    };

    // ── Frame ──────────────────────────────────────────────────
    let last = performance.now(), wantShot = false;
    let capKey = '', statText = '';

    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!tour) return;
        if (playing) tourT = (tourT + dt * speed) % tour.total;

        let ci = tour.chapters.findIndex(c => tourT < c.start + c.dur);
        if (ci < 0) ci = tour.chapters.length - 1;
        const ch = tour.chapters[ci];
        if (ci !== chapterIdx) {
            chapterIdx = ci;
            $('chapterSelect').value = ch.id;
        }

        // Reset every hat to the palette at rest.
        const n = P.n, col = F.col, anim = F.anim, off = F.off;
        for (let i = 0; i < n; i++) {
            const c = pal.byLabel[P.labelIdx[i]], o = i * 4;
            col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; col[o + 3] = 1;
            anim[o] = 1; anim[o + 1] = 0; anim[o + 2] = 0; anim[o + 3] = 0;
            off[i * 2] = 0; off[i * 2 + 1] = 0;
        }
        F.cam.x = F.home.x; F.cam.y = F.home.y; F.cam.span = F.home.span; F.cam.rot = 0;
        F.extras.length = 0; F.over.length = 0; F.under.length = 0;
        F.ghost = null; F.morph = null; F.stat = '';
        const card = $('tourCaption');
        const capWant = captions && card.offsetHeight ? Math.min(0.4 * H, card.offsetHeight + 24) : 0;
        capOff += (capWant - capOff) * (snapCam ? 1 : 1 - Math.exp(-dt * 4));
        F.t = tourT - ch.start; F.dur = ch.dur; F.dt = dt; F.W = W; F.H = H - capOff; F.pal = pal;
        ch.frame(F);

        // Camera: ease toward the chapter's camera, then apply the viewer's own pan/zoom.
        const k = snapCam ? 1 : 1 - Math.exp(-dt * 10);
        snapCam = false;
        camS.x += (F.cam.x - camS.x) * k;
        camS.y += (F.cam.y - camS.y) * k;
        camS.ls += (Math.log(F.cam.span) - camS.ls) * k;
        camS.rot += (F.cam.rot - camS.rot) * k;
        if (playing && now - lastInteract > 3500) {
            const d = Math.exp(-dt * 1.6);
            userCam.x *= d; userCam.y *= d; userCam.z *= d;
        }
        view = viewFrom(camS.x + userCam.x, camS.y + userCam.y, Math.exp(camS.ls - userCam.z), camS.rot);
        ov.W = W; ov.H = H; ov.scale = view.scale;

        // Pack instances.
        const d = mainSet.data;
        const morph = F.morph;
        hg.setShape(morph ? morph.alpha : 1, morph ? morph.beta : 1);
        const Tc = P.hats[P.center].T;
        let anyLifted = false;
        for (let i = 0; i < n; i++) {
            const o = i * INST_FLOATS, T = P.hats[i].T, a4 = i * 4;
            if (morph) {
                d[o + 4] = Tc[2] + morph.alpha * P.A[2 * i] + morph.beta * P.B[2 * i];
                d[o + 5] = Tc[5] + morph.alpha * P.A[2 * i + 1] + morph.beta * P.B[2 * i + 1];
            } else { d[o + 4] = T[2]; d[o + 5] = T[5]; }
            d[o + 6] = off[i * 2]; d[o + 7] = off[i * 2 + 1];
            d[o + 8] = anim[a4]; d[o + 9] = anim[a4 + 1]; d[o + 10] = anim[a4 + 2]; d[o + 11] = anim[a4 + 3];
            d[o + 12] = col[a4]; d[o + 13] = col[a4 + 1]; d[o + 14] = col[a4 + 2]; d[o + 15] = col[a4 + 3];
            if (anim[a4 + 3] > 0.002 && col[a4 + 3] > 0.003) anyLifted = true;
        }
        hg.upload(mainSet);

        const ex = F.extras, ed = extraSet.data;
        extraSet.count = Math.min(ex.length, extraSet.capacity);
        for (let j = 0; j < extraSet.count; j++) {
            const e = ex[j], T = e.T, o = j * INST_FLOATS;
            ed[o] = T[0]; ed[o + 1] = T[1]; ed[o + 2] = T[3]; ed[o + 3] = T[4];
            ed[o + 4] = T[2]; ed[o + 5] = T[5]; ed[o + 6] = 0; ed[o + 7] = 0;
            ed[o + 8] = e.s ?? 1; ed[o + 9] = e.r ?? 0; ed[o + 10] = e.f ?? 0; ed[o + 11] = e.l ?? 0;
            ed[o + 12] = e.rgb[0]; ed[o + 13] = e.rgb[1]; ed[o + 14] = e.rgb[2]; ed[o + 15] = e.a;
        }
        if (extraSet.count) hg.upload(extraSet);

        const opts = { strokePx: strokeWidth * dpr, stroke: pal.stroke, backing: pal.backing, anyLifted, dpr };
        hg.begin(view);
        hg.drawSet(mainSet, opts);
        if (F.ghost && F.ghost.rgba[3] > 0.01) hg.drawGhost(mainSet, F.ghost.dx, F.ghost.dy, F.ghost.rgba);
        hg.drawSet(extraSet, { ...opts, anyLifted: true });

        // Underlay (background, grids) and overlay (outlines, labels).
        uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        uctx.fillStyle = cssRgb(pal.bg);
        uctx.fillRect(0, 0, W, H);
        ov.ctx = uctx;
        for (const fn of F.under) { uctx.save(); fn(ov); uctx.restore(); }
        ov.ctx = octx;
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.clearRect(0, 0, W, H);
        if (drawOutlines && !morph) drawSupertileOutlines();
        for (const fn of F.over) { octx.save(); fn(ov); octx.restore(); }

        updateCaption(ch, ci);
        if (wantShot) { wantShot = false; saveShot(); }
    }

    // User toggle: supertile outlines at every level, weighted by level.
    function drawSupertileOutlines() {
        const c = octx;
        c.lineJoin = 'round';
        const L = P.level;
        for (let k = 1; k <= L; k++) {
            const size = polyBox(P.levels[L][0].shape).w / Math.pow(2.618, L - k);
            const a = smooth(6, 24, size * view.scale) * (0.35 + 0.1 * k);
            if (a < 0.02) continue;
            c.lineWidth = 0.6 + 0.7 * (k - 1);
            c.strokeStyle = cssRgb(pal.ink, Math.min(0.9, a));
            for (const s of P.levels[k]) {
                if (!ov.visible(s.shape)) continue;
                tracePoly(ov, s.shape);
                c.stroke();
            }
        }
    }

    // ── Captions and progress ──────────────────────────────────
    function buildProgress() {
        const bar = $('capProgress');
        bar.innerHTML = '';
        tour.chapters.forEach((ch, i) => {
            const seg = document.createElement('button');
            seg.className = 'seg';
            seg.style.flexGrow = ch.dur;
            seg.title = `${i + 1}. ${ch.title}`;
            seg.setAttribute('aria-label', `Jump to chapter ${i + 1}: ${ch.title}`);
            seg.innerHTML = '<span class="fill"></span>';
            seg.addEventListener('click', e => {
                const r = seg.getBoundingClientRect();
                const f = clamp01((e.clientX - r.left) / r.width);
                jumpTo(ch.start + f * ch.dur);
            });
            bar.appendChild(seg);
        });
    }

    function updateCaption(ch, ci) {
        const text = typeof ch.text === 'function' ? ch.text(F) : ch.text;
        const key = ci + '|' + text;
        if (key !== capKey) {
            const chapterChanged = !capKey.startsWith(ci + '|');
            capKey = key;
            $('capNum').textContent = `${String(ci + 1).padStart(2, '0')} / ${tour.chapters.length}`;
            $('capTitle').textContent = ch.title;
            const el = $('capText');
            el.classList.remove('swap');
            void el.offsetWidth;
            el.classList.add('swap');
            el.textContent = text;
            if (chapterChanged) {
                const card = $('tourCaption');
                card.classList.remove('enter');
                void card.offsetWidth;
                card.classList.add('enter');
            }
        }
        if (F.stat !== statText) { statText = F.stat; $('capStat').textContent = statText; }
        const segs = $('capProgress').children;
        for (let i = 0; i < segs.length; i++) {
            const c = tour.chapters[i];
            const f = i < ci ? 1 : i > ci ? 0 : clamp01((tourT - c.start) / c.dur);
            segs[i].firstChild.style.transform = `scaleX(${f})`;
            segs[i].classList.toggle('current', i === ci);
        }
    }

    // ── Controls ───────────────────────────────────────────────
    function jumpTo(t) {
        tourT = ((t % tour.total) + tour.total) % tour.total;
        userCam.x = userCam.y = userCam.z = 0;
    }
    function stepChapter(dir) {
        if (!tour) return;
        const i = (chapterIdx + dir + tour.chapters.length) % tour.chapters.length;
        jumpTo(tour.chapters[i].start);
    }
    function setPlaying(v) { playing = v; syncPlayUI(); }
    function syncPlayUI() {
        $('tourToggle').checked = playing;
        $('playBtn').textContent = playing ? '❚❚' : '▶';
        $('playBtn').setAttribute('aria-label', playing ? 'Pause tour' : 'Play tour');
        document.body.classList.toggle('paused', !playing);
    }
    function setCaptions(v) {
        captions = v;
        $('captionsToggle').checked = v;
        document.body.classList.toggle('no-captions', !v);
    }
    setCaptions(captions);

    $('tourToggle').addEventListener('change', e => setPlaying(e.target.checked));
    $('playBtn').addEventListener('click', () => setPlaying(!playing));
    $('prevBtn').addEventListener('click', () => stepChapter(-1));
    $('nextBtn').addEventListener('click', () => stepChapter(1));
    $('capPrev').addEventListener('click', () => stepChapter(-1));
    $('capNext').addEventListener('click', () => stepChapter(1));
    $('chapterSelect').addEventListener('change', e => {
        const ch = tour.chapters.find(c => c.id === e.target.value);
        if (ch) jumpTo(ch.start);
    });
    $('speedSlider').value = speed;
    $('speedValue').textContent = speed.toFixed(2) + '×';
    $('speedSlider').addEventListener('input', e => {
        speed = parseFloat(e.target.value);
        $('speedValue').textContent = speed.toFixed(2) + '×';
    });
    $('captionsToggle').addEventListener('change', e => setCaptions(e.target.checked));
    $('drawOutlinesToggle').addEventListener('change', e => { drawOutlines = e.target.checked; });
    $('strokeSlider').addEventListener('input', e => {
        strokeWidth = parseFloat(e.target.value);
        $('strokeValue').textContent = strokeWidth.toFixed(1);
    });
    $('bgPicker').value = bgHex;
    $('bgPicker').addEventListener('input', e => { bgHex = e.target.value; makePal(); });
    $('screenshotBtn').addEventListener('click', () => { wantShot = true; });
    $('resetBtn').addEventListener('click', () => { userCam.x = userCam.y = userCam.z = 0; });

    function saveShot() {
        const c = document.createElement('canvas');
        c.width = glCanvas.width; c.height = glCanvas.height;
        const x = c.getContext('2d');
        x.drawImage(unCanvas, 0, 0);
        x.drawImage(glCanvas, 0, 0);
        x.drawImage(ovCanvas, 0, 0);
        const link = document.createElement('a');
        link.download = `hat-tiling-${tour.chapters[chapterIdx].id}.png`;
        link.href = c.toDataURL('image/png');
        link.click();
    }

    (function buildPaletteUI() {
        const container = $('paletteSwatches');
        PALETTES.forEach((p, i) => {
            const sw = document.createElement('button');
            sw.className = 'swatch' + (i === paletteIdx ? ' active' : '');
            sw.title = p.name;
            sw.setAttribute('aria-label', `${p.name} palette`);
            sw.style.background = `linear-gradient(135deg, ${p.H1} 0%, ${p.H} 35%, ${p.F} 65%, ${p.P} 100%)`;
            sw.addEventListener('click', () => {
                container.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
                paletteIdx = i;
                bgHex = p.bg;
                $('bgPicker').value = p.bg;
                makePal();
            });
            container.appendChild(sw);
        });
    })();

    // ── Pan / zoom ─────────────────────────────────────────────
    let drag = null;
    function panBy(dx, dy) {
        const c = Math.cos(-view.rot), s = Math.sin(-view.rot);
        const wx = -dx / view.scale, wy = dy / view.scale;
        userCam.x += c * wx - s * wy;
        userCam.y += s * wx + c * wy;
        lastInteract = performance.now();
    }
    function zoomAt(sx, sy, factor) {
        const before = screenToWorld(view, sx, sy);
        userCam.z += Math.log(factor);
        const v2 = viewFrom(view.cx, view.cy, Math.exp(camS.ls - userCam.z), view.rot);
        const after = screenToWorld(v2, sx, sy);
        userCam.x += before.x - after.x;
        userCam.y += before.y - after.y;
        view = viewFrom(camS.x + userCam.x, camS.y + userCam.y, Math.exp(camS.ls - userCam.z), camS.rot);
        lastInteract = performance.now();
    }
    ovCanvas.addEventListener('pointerdown', e => {
        drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
        ovCanvas.setPointerCapture(e.pointerId);
    });
    ovCanvas.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id || pinch) return;
        panBy(e.clientX - drag.x, e.clientY - drag.y);
        drag.x = e.clientX; drag.y = e.clientY;
    });
    const endDrag = () => { drag = null; };
    ovCanvas.addEventListener('pointerup', endDrag);
    ovCanvas.addEventListener('pointercancel', endDrag);
    ovCanvas.addEventListener('wheel', e => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    let pinch = null;
    ovCanvas.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            const [a, b] = e.touches;
            pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
        }
    }, { passive: true });
    ovCanvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && pinch) {
            e.preventDefault();
            const [a, b] = e.touches;
            const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, d / pinch.d);
            pinch.d = d;
        }
    }, { passive: false });
    ovCanvas.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });

    // ── Keyboard ───────────────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.target.closest && e.target.closest('input, select, textarea, button')) {
            if (e.key !== 'h' && e.key !== 'H') return;
        }
        const k = e.key;
        if (k === ' ') { e.preventDefault(); setPlaying(!playing); }
        else if (k === 'ArrowRight' || k === 'n' || k === 'N') stepChapter(1);
        else if (k === 'ArrowLeft' || k === 'p' || k === 'P') stepChapter(-1);
        else if (k === 't' || k === 'T') setCaptions(!captions);
        else if (k === 'o' || k === 'O') { drawOutlines = !drawOutlines; $('drawOutlinesToggle').checked = drawOutlines; }
        else if (k === 'h' || k === 'H') setPanel($('controls').classList.contains('hidden'));
    });

    function setPanel(open) {
        $('controls').classList.toggle('hidden', !open);
        document.body.classList.toggle('panel-open', open);
    }
    $('panelToggle').addEventListener('click', () => setPanel(true));
    $('panelClose').addEventListener('click', () => setPanel(false));
    if (window.self !== window.top) document.body.classList.add('embedded');
    setPanel(window.innerWidth > 700 && params.get('panel') !== '0');

    // Scripting hook (thumbnails, tests): seek to a chapter and time, pause or play.
    window.hatTour = {
        seek(id, t = 0) {
            const ch = tour && tour.chapters.find(c => c.id === id);
            if (ch) { jumpTo(ch.start + t); snapCam = true; }
            return !!ch;
        },
        play(v = true) { setPlaying(v); },
        captions(v = true) { setCaptions(v); },
        get ready() { return !!tour; },
        get chapters() { return tour ? tour.chapters.map(c => ({ id: c.id, title: c.title, dur: c.dur })) : []; }
    };

    // ── Boot ───────────────────────────────────────────────────
    requestAnimationFrame(frame);
    requestAnimationFrame(() => setTimeout(build, 30));
    setTimeout(() => { const el = $('instructions'); if (el) el.style.opacity = '0'; }, 7000);
})();
