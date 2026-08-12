/* ═══════════════════════════════════════════════════
   Snakey Snack Time — a cute kid-friendly snake game
   ═══════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ── tiny helpers ─────────────────────────────── */
    var TAU = Math.PI * 2;
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(n) { return Math.floor(Math.random() * n); }
    function pick(arr) { return arr[randInt(arr.length)]; }

    var store = {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: function (k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode */ } }
    };

    function hexRgb(hex) {
        return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    }
    function mixRgb(a, b, t) {
        return 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';
    }
    function rrect(c, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    /* ── sound (WebAudio, synthesized) ────────────── */
    var Sound = (function () {
        var ctx = null, master = null;
        var muted = store.get('kidsGames.muted') === '1';
        function ensure() {
            if (!ctx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) { return; }
                ctx = new AC();
                master = ctx.createGain();
                master.gain.value = muted ? 0 : 0.5;
                master.connect(ctx.destination);
            }
            if (ctx.state === 'suspended') { ctx.resume(); }
        }
        function tone(f0, f1, dur, type, gain, delay) {
            if (!ctx || muted) { return; }
            var t0 = ctx.currentTime + (delay || 0);
            var osc = ctx.createOscillator();
            var g = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(f0, t0);
            if (f1 && f1 !== f0) { osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur); }
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g).connect(master);
            osc.start(t0);
            osc.stop(t0 + dur + 0.05);
        }
        function puffNoise(dur, cutoff, gain, delay) {
            if (!ctx || muted) { return; }
            var t0 = ctx.currentTime + (delay || 0);
            var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
            var buf = ctx.createBuffer(1, len, ctx.sampleRate);
            var data = buf.getChannelData(0);
            for (var i = 0; i < len; i++) { data[i] = Math.random() * 2 - 1; }
            var src = ctx.createBufferSource();
            src.buffer = buf;
            var filt = ctx.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = cutoff;
            var g = ctx.createGain();
            g.gain.setValueAtTime(gain, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            src.connect(filt).connect(g).connect(master);
            src.start(t0);
        }
        return {
            ensure: ensure,
            isMuted: function () { return muted; },
            setMuted: function (m) {
                muted = m;
                store.set('kidsGames.muted', m ? '1' : '0');
                if (master) { master.gain.value = m ? 0 : 0.5; }
            },
            click: function () { tone(660, 660, 0.06, 'triangle', 0.15); },
            pop: function (len) {
                var f = 460 * Math.pow(1.025, Math.min(len, 24));
                tone(f, f * 1.8, 0.12, 'triangle', 0.25);
                tone(f * 2, f * 2.6, 0.09, 'sine', 0.08, 0.02);
            },
            crash: function () {
                tone(300, 150, 0.4, 'sine', 0.25);
                puffNoise(0.3, 700, 0.12);
            },
            start: function () {
                var n = [392, 523.25, 659.25];
                for (var i = 0; i < n.length; i++) { tone(n[i], n[i], 0.12, 'triangle', 0.18, i * 0.09); }
            },
            fanfare: function () {
                var n = [523.25, 659.25, 783.99, 1046.5];
                for (var i = 0; i < n.length; i++) { tone(n[i], n[i], 0.22, 'triangle', 0.2, i * 0.1); }
                puffNoise(0.4, 4000, 0.05, 0.1);
            }
        };
    })();
    document.addEventListener('pointerdown', function () { Sound.ensure(); }, true);

    /* ── DOM refs ─────────────────────────────────── */
    var canvas = document.getElementById('board');
    var ctx = canvas.getContext('2d');
    var boardArea = document.getElementById('board-area');
    var boardFrame = document.getElementById('board-frame');
    var fxCanvas = document.getElementById('fx');
    var fxCtx = fxCanvas.getContext('2d');
    var scoreVal = document.getElementById('score-val');
    var bestVal = document.getElementById('best-val');
    var menuBestVal = document.getElementById('menu-best-val');
    var pauseBtn = document.getElementById('pause-btn');
    var soundBtn = document.getElementById('sound-btn');
    var dpad = document.getElementById('dpad');
    var menuOverlay = document.getElementById('menu-overlay');
    var pauseOverlay = document.getElementById('pause-overlay');
    var overOverlay = document.getElementById('over-overlay');
    var overEmoji = document.getElementById('over-emoji');
    var overTitle = document.getElementById('over-title');
    var overMsg = document.getElementById('over-msg');
    var overScoreVal = document.getElementById('over-score-val');
    var overBestVal = document.getElementById('over-best-val');
    var newBestBadge = document.getElementById('new-best-badge');
    var playBtn = document.getElementById('play-btn');
    var retryBtn = document.getElementById('retry-btn');
    var resumeBtn = document.getElementById('resume-btn');
    var pauseMenuBtn = document.getElementById('pause-menu-btn');
    var overMenuBtn = document.getElementById('over-menu-btn');
    var speedRow = document.getElementById('speed-row');
    var wallsRow = document.getElementById('walls-row');

    /* ── constants & settings ─────────────────────── */
    var N = 20;                                   // 20 x 20 grid
    var SPEEDS = { slow: 0.21, fast: 0.15, zoom: 0.105 };
    var FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍉', '🥕', '🍊', '🍑', '🥝', '🍒'];
    var SPARK_COLORS = ['#ff6b6b', '#ffe66d', '#4ecdc4', '#a29bfe', '#55efc4', '#fd79a8'];
    var HEAD_RGB = hexRgb('#2ec4b6');
    var TAIL_RGB = hexRgb('#7ceec9');
    var OUTLINE = '#17a294';

    var speedKey = store.get('kidsGames.snake.speed') || 'slow';
    if (!SPEEDS[speedKey]) { speedKey = 'slow'; }
    var wallsKey = store.get('kidsGames.snake.walls') || 'off';
    if (wallsKey !== 'on' && wallsKey !== 'off') { wallsKey = 'off'; }
    var best = parseInt(store.get('kidsGames.snake.best') || '0', 10) || 0;

    /* ── game state ───────────────────────────────── */
    var state = 'menu';         // menu | playing | paused | over
    var snake = [];             // head first, {x,y}
    var prevSnake = [];
    var dir = { x: 1, y: 0 };
    var queue = [];
    var food = { x: 14, y: 10 };
    var foodEmoji = '🍎';
    var score = 0;
    var stepAcc = 0;
    var interval = SPEEDS[speedKey];
    var eatAnim = 0;            // squash on eating (1 → 0)
    var dead = false;
    var deathCause = 'self';
    var overlayAt = 0;          // when to reveal the game-over card
    var overlayPending = false;
    var overIsWin = false;
    var tNow = 0;
    var nextBlink = 2.5;
    var blinkUntil = 0;
    var nextTongue = 4;
    var tongueUntil = 0;

    var size = 300;             // css px of the square canvas
    var cell = size / N;
    var isTouch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        (navigator.maxTouchPoints || 0) > 0;

    /* ── particles (board space) ──────────────────── */
    var particles = [];
    function sparkleBurst(px, py, colors, n) {
        for (var i = 0; i < n; i++) {
            var a = rand(0, TAU), sp = rand(30, 150) * (cell / 24);
            particles.push({
                x: px, y: py,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
                life: rand(0.4, 0.8), ttl: 0.8,
                r: rand(2, 5) * (cell / 24),
                color: pick(colors),
                star: Math.random() < 0.4,
                rot: rand(0, TAU), vrot: rand(-6, 6)
            });
        }
    }
    function updateParticles(dt) {
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 260 * (cell / 24) * dt;
            p.rot += p.vrot * dt;
        }
    }
    function drawStarShape(c, x, y, r, rot) {
        c.beginPath();
        for (var i = 0; i < 8; i++) {
            var rr = (i % 2 === 0) ? r : r * 0.42;
            var a = rot + i * Math.PI / 4;
            var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
            if (i === 0) { c.moveTo(px, py); } else { c.lineTo(px, py); }
        }
        c.closePath();
        c.fill();
    }
    function drawParticles() {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            ctx.globalAlpha = clamp(p.life / p.ttl, 0, 1);
            ctx.fillStyle = p.color;
            if (p.star) {
                drawStarShape(ctx, p.x, p.y, p.r * 1.6, p.rot);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, TAU);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    /* ── confetti (full-screen fx canvas) ─────────── */
    var confetti = [];
    function fxResize() {
        var dpr = window.devicePixelRatio || 1;
        fxCanvas.width = Math.round(window.innerWidth * dpr);
        fxCanvas.height = Math.round(window.innerHeight * dpr);
        fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function confettiBurst(cx, cy, n, angle, spread) {
        for (var i = 0; i < n; i++) {
            var a = angle + rand(-spread, spread);
            var sp = rand(260, 720);
            confetti.push({
                x: cx, y: cy,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                w: rand(6, 12), h: rand(8, 16),
                rot: rand(0, TAU), vrot: rand(-9, 9),
                color: pick(SPARK_COLORS),
                life: rand(1.3, 2.1), ttl: 2.1
            });
        }
    }
    function celebrate() {
        var w = window.innerWidth, h = window.innerHeight;
        confettiBurst(w * 0.2, h * 0.75, 70, -Math.PI / 2.6, 0.5);
        confettiBurst(w * 0.8, h * 0.75, 70, -Math.PI + Math.PI / 2.6, 0.5);
        confettiBurst(w * 0.5, h * 0.6, 50, -Math.PI / 2, 0.9);
    }
    function updateConfetti(dt) {
        for (var i = confetti.length - 1; i >= 0; i--) {
            var p = confetti[i];
            p.life -= dt;
            if (p.life <= 0 || p.y > window.innerHeight + 40) { confetti.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 1050 * dt;
            p.vx *= (1 - 1.6 * dt);
            p.rot += p.vrot * dt;
        }
    }
    function drawConfetti() {
        fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
        for (var i = 0; i < confetti.length; i++) {
            var p = confetti[i];
            fxCtx.save();
            fxCtx.globalAlpha = clamp(p.life / 0.5, 0, 1);
            fxCtx.translate(p.x, p.y);
            fxCtx.rotate(p.rot);
            fxCtx.fillStyle = p.color;
            fxCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.sin(p.rot * 1.7))));
            fxCtx.restore();
        }
    }

    /* ── sizing ───────────────────────────────────── */
    function fit() {
        var rect = boardArea.getBoundingClientRect();
        var s = Math.floor(Math.min(rect.width, rect.height)) - 30; // frame padding + border
        s = clamp(s, 180, 760);
        size = s;
        cell = size / N;
        var dpr = window.devicePixelRatio || 1;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fxResize();
    }

    /* ── game setup ───────────────────────────────── */
    function resetGame() {
        snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        prevSnake = snake.map(function (s) { return { x: s.x, y: s.y }; });
        dir = { x: 1, y: 0 };
        queue = [];
        score = 0;
        stepAcc = 0;
        eatAnim = 0;
        dead = false;
        overlayPending = false;
        overIsWin = false;
        particles.length = 0;
        interval = SPEEDS[speedKey];
        spawnFood();
        updateHud();
    }

    function spawnFood() {
        var used = {};
        for (var i = 0; i < snake.length; i++) { used[snake[i].x + ',' + snake[i].y] = true; }
        var free = [];
        for (var y = 0; y < N; y++) {
            for (var x = 0; x < N; x++) {
                if (!used[x + ',' + y]) { free.push({ x: x, y: y }); }
            }
        }
        if (free.length === 0) { winGame(); return; }
        food = pick(free);
        var f = pick(FRUITS);
        if (f === foodEmoji && FRUITS.length > 1) { f = pick(FRUITS); }
        foodEmoji = f;
    }

    function updateHud() {
        scoreVal.textContent = score;
        bestVal.textContent = Math.max(best, score);
        menuBestVal.textContent = best;
    }

    /* ── stepping ─────────────────────────────────── */
    function pushDir(nx, ny) {
        if (state !== 'playing') { return; }
        var base = queue.length ? queue[queue.length - 1] : dir;
        if (nx === base.x && ny === base.y) { return; }
        if (nx === -base.x && ny === -base.y) { return; }
        if (queue.length >= 2) { return; }
        queue.push({ x: nx, y: ny });
    }

    function doStep() {
        if (queue.length) {
            var nd = queue.shift();
            if (!(nd.x === -dir.x && nd.y === -dir.y)) { dir = nd; }
        }
        var head = snake[0];
        var nx = head.x + dir.x;
        var ny = head.y + dir.y;
        if (wallsKey === 'on') {
            if (nx < 0 || nx >= N || ny < 0 || ny >= N) { die('wall'); return; }
        } else {
            nx = (nx + N) % N;
            ny = (ny + N) % N;
        }
        var growing = (nx === food.x && ny === food.y);
        var checkLen = snake.length - (growing ? 0 : 1);
        for (var i = 0; i < checkLen; i++) {
            if (snake[i].x === nx && snake[i].y === ny) { die('self'); return; }
        }
        prevSnake = snake.map(function (s) { return { x: s.x, y: s.y }; });
        snake.unshift({ x: nx, y: ny });
        if (growing) {
            score += 1;
            eatAnim = 1;
            Sound.pop(snake.length);
            sparkleBurst((nx + 0.5) * cell, (ny + 0.5) * cell, SPARK_COLORS, 12);
            spawnFood();
            updateHud();
        } else {
            snake.pop();
        }
    }

    function die(cause) {
        dead = true;
        deathCause = cause || 'self';
        state = 'over';
        overIsWin = false;
        Sound.crash();
        var h = snake[0];
        sparkleBurst((h.x + 0.5) * cell, (h.y + 0.5) * cell, ['#c8bfe7', '#a29bfe', '#e4dcf5'], 16);
        finishRun();
    }

    function winGame() {
        state = 'over';
        overIsWin = true;
        finishRun();
    }

    function finishRun() {
        overlayPending = true;
        overlayAt = tNow + 0.6;
        pauseBtn.classList.add('hidden');
        updateDpad();
    }

    function showOverCard() {
        overlayPending = false;
        var isBest = score > best;
        if (score > best) {
            best = score;
            store.set('kidsGames.snake.best', best);
        }
        if (overIsWin) {
            overEmoji.textContent = '🤩';
            overTitle.textContent = 'WOW! You win!';
            overMsg.textContent = 'Your snake filled the whole garden!';
        } else {
            overEmoji.textContent = '🙈';
            overTitle.textContent = 'Oopsie!';
            overMsg.textContent = (deathCause === 'wall') ? 'Bonk! You hit the wall. Try again?' : 'Ouch, a snakey tangle! Try again?';
        }
        overScoreVal.textContent = score;
        overBestVal.textContent = best;
        newBestBadge.classList.toggle('hidden', !(isBest && score > 0));
        if ((isBest && score > 0) || overIsWin) {
            celebrate();
            Sound.fanfare();
        }
        updateHud();
        showOverlay(overOverlay);
    }

    /* ── overlays & flow ──────────────────────────── */
    function showOverlay(el) {
        menuOverlay.classList.add('hidden');
        pauseOverlay.classList.add('hidden');
        overOverlay.classList.add('hidden');
        if (el) { el.classList.remove('hidden'); }
    }

    function updateDpad() {
        dpad.classList.toggle('hidden', !(isTouch && state === 'playing'));
        document.body.classList.toggle('touch', isTouch);
    }

    function startGame() {
        resetGame();
        state = 'playing';
        showOverlay(null);
        pauseBtn.classList.remove('hidden');
        updateDpad();
        Sound.start();
    }

    function pauseGame() {
        if (state !== 'playing') { return; }
        state = 'paused';
        showOverlay(pauseOverlay);
        updateDpad();
    }

    function resumeGame() {
        if (state !== 'paused') { return; }
        state = 'playing';
        showOverlay(null);
        updateDpad();
        Sound.click();
    }

    function goMenu() {
        state = 'menu';
        resetGame();
        showOverlay(menuOverlay);
        pauseBtn.classList.add('hidden');
        updateDpad();
    }

    /* ── drawing ──────────────────────────────────── */
    function segPos(i, t) {
        var cur = snake[i];
        var prev = prevSnake[Math.min(i, prevSnake.length - 1)] || cur;
        var dx = cur.x - prev.x, dy = cur.y - prev.y;
        if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {   // wrapped — snap
            return { x: (cur.x + 0.5) * cell, y: (cur.y + 0.5) * cell };
        }
        return {
            x: (lerp(prev.x, cur.x, t) + 0.5) * cell,
            y: (lerp(prev.y, cur.y, t) + 0.5) * cell
        };
    }

    function draw() {
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        rrect(ctx, 0, 0, size, size, 16);
        ctx.clip();

        // board
        ctx.fillStyle = '#fffdfe';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#f7f0fb';
        for (var y = 0; y < N; y++) {
            for (var x = (y % 2); x < N; x += 2) {
                ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
            }
        }

        drawFood();
        drawSnake();
        drawParticles();
        ctx.restore();
    }

    function drawFood() {
        var fx = (food.x + 0.5) * cell;
        var fy = (food.y + 0.5) * cell + Math.sin(tNow * 3) * cell * 0.05;
        var s = 1 + 0.07 * Math.sin(tNow * 4);
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#a29bfe';
        ctx.beginPath();
        ctx.ellipse(fx, (food.y + 0.86) * cell, cell * 0.32, cell * 0.1, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.translate(fx, fy);
        ctx.scale(s, s);
        ctx.font = Math.round(cell * 0.82) + 'px "Fredoka", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(foodEmoji, 0, cell * 0.03);
        ctx.restore();
    }

    function drawSnake() {
        var t = (state === 'playing') ? clamp(stepAcc / interval, 0, 1) : 1;
        var n = snake.length;
        var pts = [];
        for (var i = 0; i < n; i++) { pts.push(segPos(i, t)); }

        // split into runs (a wrap makes a big gap)
        var runs = [];
        var run = [pts[0]];
        var maxGap = cell * 1.7;
        for (i = 1; i < n; i++) {
            var d = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
            if (d > maxGap) { runs.push(run); run = []; }
            run.push(pts[i]);
        }
        runs.push(run);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // cartoon outline pass
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = cell * 0.86;
        var r, k;
        for (r = 0; r < runs.length; r++) {
            var rp = runs[r];
            ctx.beginPath();
            ctx.moveTo(rp[0].x, rp[0].y);
            if (rp.length === 1) { ctx.lineTo(rp[0].x + 0.01, rp[0].y); }
            for (k = 1; k < rp.length; k++) { ctx.lineTo(rp[k].x, rp[k].y); }
            ctx.stroke();
        }

        // gradient body pass (tail → head so the head end sits on top)
        var idx = n - 1;
        for (r = runs.length - 1; r >= 0; r--) {
            var rq = runs[r];
            for (k = rq.length - 1; k >= 1; k--) {
                var segT = idx / Math.max(1, n - 1);
                ctx.strokeStyle = mixRgb(HEAD_RGB, TAIL_RGB, segT);
                ctx.lineWidth = cell * 0.68;
                ctx.beginPath();
                ctx.moveTo(rq[k].x, rq[k].y);
                ctx.lineTo(rq[k - 1].x, rq[k - 1].y);
                ctx.stroke();
                idx--;
            }
            // lone segment in its own run (wrap edge)
            if (rq.length === 1) {
                ctx.fillStyle = mixRgb(HEAD_RGB, TAIL_RGB, idx / Math.max(1, n - 1));
                ctx.beginPath();
                ctx.arc(rq[0].x, rq[0].y, cell * 0.34, 0, TAU);
                ctx.fill();
                idx--;
            }
        }

        drawHead(pts[0]);
    }

    function drawHead(hp) {
        var squash = 1 + 0.28 * eatAnim;
        var hr = cell * 0.5 * squash;
        var dx = dir.x, dy = dir.y;
        var px = -dy, py = dx;   // perpendicular

        // head ball
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, hr + cell * 0.07, 0, TAU);
        ctx.fill();
        ctx.fillStyle = mixRgb(HEAD_RGB, TAIL_RGB, 0);
        ctx.beginPath();
        ctx.arc(hp.x, hp.y, hr, 0, TAU);
        ctx.fill();

        // tongue
        if (!dead && tNow < tongueUntil) {
            var tp = 1 - (tongueUntil - tNow) / 0.35;
            var ext = Math.sin(Math.PI * clamp(tp, 0, 1)) * cell * 0.55;
            var nx = hp.x + dx * hr, ny = hp.y + dy * hr;
            ctx.strokeStyle = '#ff8fa3';
            ctx.lineWidth = cell * 0.09;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.lineTo(nx + dx * ext, ny + dy * ext);
            ctx.moveTo(nx + dx * ext, ny + dy * ext);
            ctx.lineTo(nx + dx * ext + (dx * 0.5 + px * 0.5) * cell * 0.14, ny + dy * ext + (dy * 0.5 + py * 0.5) * cell * 0.14);
            ctx.moveTo(nx + dx * ext, ny + dy * ext);
            ctx.lineTo(nx + dx * ext + (dx * 0.5 - px * 0.5) * cell * 0.14, ny + dy * ext + (dy * 0.5 - py * 0.5) * cell * 0.14);
            ctx.stroke();
        }

        // cheeks
        ctx.fillStyle = 'rgba(255,143,163,0.55)';
        ctx.beginPath();
        ctx.arc(hp.x + px * cell * 0.34 - dx * cell * 0.06, hp.y + py * cell * 0.34 - dy * cell * 0.06, cell * 0.09, 0, TAU);
        ctx.arc(hp.x - px * cell * 0.34 - dx * cell * 0.06, hp.y - py * cell * 0.34 - dy * cell * 0.06, cell * 0.09, 0, TAU);
        ctx.fill();

        // eyes
        var e1x = hp.x + dx * cell * 0.12 + px * cell * 0.19;
        var e1y = hp.y + dy * cell * 0.12 + py * cell * 0.19;
        var e2x = hp.x + dx * cell * 0.12 - px * cell * 0.19;
        var e2y = hp.y + dy * cell * 0.12 - py * cell * 0.19;
        if (dead) {
            ctx.strokeStyle = '#2d3436';
            ctx.lineWidth = cell * 0.07;
            ctx.lineCap = 'round';
            var xr = cell * 0.1;
            [[e1x, e1y], [e2x, e2y]].forEach(function (e) {
                ctx.beginPath();
                ctx.moveTo(e[0] - xr, e[1] - xr); ctx.lineTo(e[0] + xr, e[1] + xr);
                ctx.moveTo(e[0] + xr, e[1] - xr); ctx.lineTo(e[0] - xr, e[1] + xr);
                ctx.stroke();
            });
        } else {
            var blink = 1;
            if (tNow < blinkUntil) {
                var bp = 1 - (blinkUntil - tNow) / 0.16;
                blink = clamp(Math.abs(1 - 2 * bp), 0.08, 1);
            }
            var er = cell * 0.155;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(e1x, e1y, er, er * blink, 0, 0, TAU);
            ctx.ellipse(e2x, e2y, er, er * blink, 0, 0, TAU);
            ctx.fill();
            if (blink > 0.3) {
                ctx.fillStyle = '#2d3436';
                ctx.beginPath();
                ctx.ellipse(e1x + dx * cell * 0.05, e1y + dy * cell * 0.05, cell * 0.075, cell * 0.075 * blink, 0, 0, TAU);
                ctx.ellipse(e2x + dx * cell * 0.05, e2y + dy * cell * 0.05, cell * 0.075, cell * 0.075 * blink, 0, 0, TAU);
                ctx.fill();
            }
        }
    }

    /* ── main loop ────────────────────────────────── */
    var last = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        var dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        tNow = now / 1000;

        if (state === 'playing') {
            stepAcc += dt;
            var guard = 0;
            while (stepAcc >= interval && state === 'playing' && guard < 4) {
                doStep();
                stepAcc -= interval;
                guard++;
            }
        }
        if (eatAnim > 0) { eatAnim = Math.max(0, eatAnim - dt * 4); }
        if (tNow > nextBlink) {
            blinkUntil = tNow + 0.16;
            nextBlink = tNow + rand(2.2, 4.5);
        }
        if (tNow > nextTongue) {
            tongueUntil = tNow + 0.35;
            nextTongue = tNow + rand(2.5, 6);
        }
        updateParticles(dt);
        updateConfetti(dt);
        if (state === 'over' && overlayPending && tNow >= overlayAt) { showOverCard(); }

        draw();
        drawConfetti();
    }

    /* ── input: keyboard ──────────────────────────── */
    document.addEventListener('keydown', function (e) {
        var k = e.key;
        var handled = true;
        switch (k) {
            case 'ArrowUp': case 'w': case 'W': pushDir(0, -1); break;
            case 'ArrowDown': case 's': case 'S': pushDir(0, 1); break;
            case 'ArrowLeft': case 'a': case 'A': pushDir(-1, 0); break;
            case 'ArrowRight': case 'd': case 'D': pushDir(1, 0); break;
            case 'Escape': case 'p': case 'P':
                if (state === 'playing') { pauseGame(); }
                else if (state === 'paused') { resumeGame(); }
                break;
            case 'Enter': case ' ':
                if (state === 'menu') { startGame(); }
                else if (state === 'paused') { resumeGame(); }
                else if (state === 'over' && !overOverlay.classList.contains('hidden')) { startGame(); }
                else { handled = false; }
                break;
            default: handled = false;
        }
        if (handled) { e.preventDefault(); }
    });

    /* ── input: swipe on the play area ────────────── */
    var swipe = { active: false, id: -1, x: 0, y: 0 };
    boardArea.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') { setTouchMode(); }
        swipe.active = true;
        swipe.id = e.pointerId;
        swipe.x = e.clientX;
        swipe.y = e.clientY;
        try { boardArea.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    });
    boardArea.addEventListener('pointermove', function (e) {
        if (!swipe.active || e.pointerId !== swipe.id) { return; }
        var dx = e.clientX - swipe.x;
        var dy = e.clientY - swipe.y;
        var TH = 24;
        if (Math.abs(dx) < TH && Math.abs(dy) < TH) { return; }
        if (Math.abs(dx) > Math.abs(dy)) { pushDir(dx > 0 ? 1 : -1, 0); }
        else { pushDir(0, dy > 0 ? 1 : -1); }
        swipe.x = e.clientX;   // allow chained swipes without lifting
        swipe.y = e.clientY;
    });
    function endSwipe(e) {
        if (e.pointerId === swipe.id) { swipe.active = false; }
    }
    boardArea.addEventListener('pointerup', endSwipe);
    boardArea.addEventListener('pointercancel', endSwipe);
    boardArea.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    dpad.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function setTouchMode() {
        if (!isTouch) {
            isTouch = true;
            updateDpad();
        }
    }
    document.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') { setTouchMode(); }
    }, true);

    /* ── input: D-pad ─────────────────────────────── */
    var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    Array.prototype.forEach.call(dpad.querySelectorAll('.dpad-btn'), function (btn) {
        btn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            var d = DIRS[btn.getAttribute('data-dir')];
            if (d) { pushDir(d[0], d[1]); }
        });
    });

    /* ── buttons ──────────────────────────────────── */
    playBtn.addEventListener('click', function () { startGame(); });
    retryBtn.addEventListener('click', function () { startGame(); });
    resumeBtn.addEventListener('click', function () { resumeGame(); });
    pauseBtn.addEventListener('click', function () { Sound.click(); pauseGame(); });
    pauseMenuBtn.addEventListener('click', function () { Sound.click(); goMenu(); });
    overMenuBtn.addEventListener('click', function () { Sound.click(); goMenu(); });

    function refreshSoundBtn() {
        soundBtn.textContent = Sound.isMuted() ? '🔇' : '🔊';
    }
    soundBtn.addEventListener('click', function () {
        Sound.ensure();
        Sound.setMuted(!Sound.isMuted());
        refreshSoundBtn();
        if (!Sound.isMuted()) { Sound.click(); }
    });

    /* ── settings chips ───────────────────────────── */
    function refreshChips() {
        Array.prototype.forEach.call(speedRow.querySelectorAll('.chip'), function (c) {
            c.classList.toggle('active', c.getAttribute('data-speed') === speedKey);
        });
        Array.prototype.forEach.call(wallsRow.querySelectorAll('.chip'), function (c) {
            c.classList.toggle('active', c.getAttribute('data-walls') === wallsKey);
        });
        boardFrame.classList.toggle('walls-on', wallsKey === 'on');
        boardFrame.classList.toggle('walls-off', wallsKey !== 'on');
    }
    speedRow.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) { return; }
        speedKey = chip.getAttribute('data-speed');
        store.set('kidsGames.snake.speed', speedKey);
        interval = SPEEDS[speedKey];
        Sound.click();
        refreshChips();
    });
    wallsRow.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (!chip) { return; }
        wallsKey = chip.getAttribute('data-walls');
        store.set('kidsGames.snake.walls', wallsKey);
        Sound.click();
        refreshChips();
    });

    /* ── lifecycle ────────────────────────────────── */
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 120); });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && state === 'playing') { pauseGame(); }
    });

    /* ── boot ─────────────────────────────────────── */
    refreshSoundBtn();
    refreshChips();
    updateDpad();
    fit();
    resetGame();
    showOverlay(menuOverlay);
    requestAnimationFrame(frame);
})();
