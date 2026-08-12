/* ============================================================
   Paddle Party — kid-friendly pong for the Kids' Games hub
   1P vs a cute robot (3 speeds) or 2P shared-screen.
   Touch-first (each player drags their half), keyboard too.
   ============================================================ */
(function () {
    'use strict';

    /* ---------- DOM ---------- */
    var canvas = document.getElementById('game-canvas');
    var ctx = canvas.getContext('2d');
    var fxCanvas = document.getElementById('fx-canvas');
    var fxCtx = fxCanvas.getContext('2d');

    var menuOverlay = document.getElementById('menu-overlay');
    var pauseOverlay = document.getElementById('pause-overlay');
    var winOverlay = document.getElementById('win-overlay');
    var countdownEl = document.getElementById('countdown');
    var countdownText = document.getElementById('countdown-text');
    var winEmoji = document.getElementById('win-emoji');
    var winText = document.getElementById('win-text');
    var winSub = document.getElementById('win-sub');

    var playBtn = document.getElementById('play-btn');
    var rematchBtn = document.getElementById('rematch-btn');
    var winMenuBtn = document.getElementById('win-menu-btn');
    var pauseBtn = document.getElementById('pause-btn');
    var resumeBtn = document.getElementById('resume-btn');
    var pauseMenuBtn = document.getElementById('pause-menu-btn');
    var soundBtn = document.getElementById('sound-btn');
    var modeRow = document.getElementById('mode-row');
    var difficultySetting = document.getElementById('difficulty-setting');
    var difficultyRow = document.getElementById('difficulty-row');
    var pointsRow = document.getElementById('points-row');

    /* ---------- Palette ---------- */
    var CORAL = '#ff6b6b';
    var PURPLE = '#a29bfe';
    var YELLOW = '#ffe66d';
    var TEAL = '#4ecdc4';
    var MINT = '#55efc4';
    var INK = '#2d3436';
    var CONFETTI_COLORS = [CORAL, TEAL, YELLOW, PURPLE, MINT, '#ff9ff3', '#74b9ff'];

    /* ---------- Settings (persisted) ---------- */
    var LS = 'kidsGames.pong.';
    var settings = {
        mode: localStorage.getItem(LS + 'mode') || '1p',
        diff: localStorage.getItem(LS + 'diff') || 'easy',
        points: parseInt(localStorage.getItem(LS + 'points') || '5', 10)
    };
    if ([5, 7, 11].indexOf(settings.points) < 0) settings.points = 5;
    if (['1p', '2p'].indexOf(settings.mode) < 0) settings.mode = '1p';
    if (['easy', 'medium', 'fast'].indexOf(settings.diff) < 0) settings.diff = 'easy';

    var DIFFS = {
        easy: { speed: 0.42, errFrac: 0.55, react: 0.40, predict: false, ballMul: 0.85 },
        medium: { speed: 0.62, errFrac: 0.32, react: 0.24, predict: false, ballMul: 1.0 },
        fast: { speed: 0.88, errFrac: 0.20, react: 0.13, predict: true, ballMul: 1.14 }
    };

    /* ---------- Audio ---------- */
    var audio = (function () {
        var actx = null, master = null;
        var muted = localStorage.getItem('kidsGames.muted') === '1';

        function unlock() {
            if (!actx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                actx = new AC();
                master = actx.createGain();
                master.gain.value = muted ? 0 : 1;
                master.connect(actx.destination);
            }
            if (actx.state === 'suspended') actx.resume();
        }

        function tone(freq, dur, opts) {
            if (!actx || muted) return;
            opts = opts || {};
            var t0 = actx.currentTime + (opts.delay || 0);
            var osc = actx.createOscillator();
            var g = actx.createGain();
            osc.type = opts.type || 'sine';
            osc.frequency.setValueAtTime(freq, t0);
            if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
            var vol = opts.vol || 0.18;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g);
            g.connect(master);
            osc.start(t0);
            osc.stop(t0 + dur + 0.05);
        }

        function setMuted(m) {
            muted = m;
            localStorage.setItem('kidsGames.muted', m ? '1' : '0');
            if (master && actx) master.gain.setTargetAtTime(m ? 0 : 1, actx.currentTime, 0.01);
        }

        return {
            unlock: unlock,
            setMuted: setMuted,
            isMuted: function () { return muted; },
            click: function () { tone(520, 0.06, { type: 'triangle', vol: 0.12 }); },
            paddle: function (rally) {
                var f = 300 * Math.pow(1.059463, Math.min(rally, 18));
                tone(f, 0.09, { type: 'triangle', vol: 0.22, slide: f * 1.3 });
            },
            wall: function () { tone(215, 0.05, { type: 'sine', vol: 0.1 }); },
            score: function () {
                tone(523, 0.12, { type: 'sine', vol: 0.18 });
                tone(659, 0.16, { type: 'sine', vol: 0.18, delay: 0.1 });
            },
            beep: function () { tone(440, 0.1, { type: 'sine', vol: 0.14 }); },
            go: function () { tone(700, 0.2, { type: 'triangle', vol: 0.2, slide: 880 }); },
            win: function () {
                var notes = [523, 659, 784, 1047];
                for (var i = 0; i < notes.length; i++) {
                    tone(notes[i], 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.13 });
                    tone(notes[i] * 2, 0.2, { type: 'sine', vol: 0.07, delay: i * 0.13 });
                }
            },
            lose: function () {
                var notes = [392, 349, 311];
                for (var i = 0; i < notes.length; i++) {
                    tone(notes[i], 0.3, { type: 'sine', vol: 0.13, delay: i * 0.22 });
                }
            }
        };
    })();

    document.addEventListener('pointerdown', function () { audio.unlock(); });

    /* ---------- Geometry ---------- */
    var W = 0, H = 0, dpr = 1;
    var court = { x: 0, y: 0, w: 0, h: 0 };   // white card play area
    var U = 0;                                 // scale unit = min(W,H)
    var diag = 0;
    var PADDLE_W = 22, PADDLE_H = 150, BALL_R = 11, PADDLE_INSET = 34;

    function resize() {
        var oldCourt = { x: court.x, y: court.y, w: court.w, h: court.h };
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fxCanvas.width = canvas.width;
        fxCanvas.height = canvas.height;
        fxCanvas.style.width = W + 'px';
        fxCanvas.style.height = H + 'px';
        fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var m = 8;
        court = { x: m, y: m, w: W - 2 * m, h: H - 2 * m };
        U = Math.min(W, H);
        diag = Math.hypot(court.w, court.h);
        PADDLE_W = Math.max(18, Math.min(30, U * 0.028));
        PADDLE_H = Math.max(96, U * 0.23);
        BALL_R = Math.max(9, Math.min(15, U * 0.018));
        PADDLE_INSET = Math.max(26, U * 0.045);

        pLeft.x = court.x + PADDLE_INSET;
        pRight.x = court.x + court.w - PADDLE_INSET;

        if (oldCourt.w > 0) {
            // keep everything proportional through a resize
            var fy = court.h / oldCourt.h, fx = court.w / oldCourt.w;
            pLeft.y = court.y + (pLeft.y - oldCourt.y) * fy;
            pRight.y = court.y + (pRight.y - oldCourt.y) * fy;
            ball.x = court.x + (ball.x - oldCourt.x) * fx;
            ball.y = court.y + (ball.y - oldCourt.y) * fy;
            var sp = ballSpeedFrac * diag;
            var ang = Math.atan2(ball.vy, ball.vx);
            ball.vx = Math.cos(ang) * sp;
            ball.vy = Math.sin(ang) * sp;
        } else {
            pLeft.y = court.y + court.h / 2;
            pRight.y = court.y + court.h / 2;
            ball.x = W / 2;
            ball.y = H / 2;
        }
        clampPaddles();
    }

    /* ---------- Entities ---------- */
    function makePaddle(side) {
        return {
            side: side,               // 'left' | 'right'
            x: 0, y: 0,               // y = center
            targetY: null,            // pointer target (center)
            score: 0,
            popT: 0,                  // score pop animation
            squash: 0,                // hit squash animation
            isRobot: false,
            blinkT: 2 + Math.random() * 3
        };
    }

    var pLeft = makePaddle('left');
    var pRight = makePaddle('right');
    var ball = { x: 0, y: 0, vx: 0, vy: 0, trail: [] };
    var ballSpeedFrac = 0.38;      // current speed as fraction of court diagonal
    var BASE_SPEED_FRAC = 0.36;
    var MAX_SPEED_FRAC = 0.72;
    var rally = 0;
    var hueBase = 0;

    var robot = { aimY: 0, err: 0, reactT: 0, tracking: false };

    var particles = [];
    var confetti = [];
    var confettiBursts = 0, confettiTimer = 0;

    /* ---------- State machine ---------- */
    // menu | serve | play | point | win   (+ paused flag on top)
    var state = 'menu';
    var stateT = 0;
    var paused = false;
    var serveDir = 1;
    var serveStep = -1;
    var pointSide = null;      // who just scored
    var winnerSide = null;
    var celebrate = true;

    function setState(s) {
        state = s;
        stateT = 0;
        pauseBtn.classList.toggle('hidden', !(s === 'serve' || s === 'play' || s === 'point'));
        if (s !== 'serve') countdownEl.classList.add('hidden');
    }

    /* ---------- Helpers ---------- */
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function rand(a, b) { return a + Math.random() * (b - a); }

    function clampPaddles() {
        var half = PADDLE_H / 2;
        pLeft.y = clamp(pLeft.y, court.y + half, court.y + court.h - half);
        pRight.y = clamp(pRight.y, court.y + half, court.y + court.h - half);
    }

    function resetBall(dir) {
        ball.x = court.x + court.w / 2;
        ball.y = court.y + court.h / 2;
        ball.trail = [];
        ballSpeedFrac = BASE_SPEED_FRAC * (settings.mode === '1p' ? DIFFS[settings.diff].ballMul : 1);
        var ang = rand(-0.35, 0.35);
        var sp = ballSpeedFrac * diag;
        ball.vx = Math.cos(ang) * sp * dir;
        ball.vy = Math.sin(ang) * sp;
        rally = 0;
        rollRobotError();
    }

    function rollRobotError() {
        var d = DIFFS[settings.diff];
        robot.err = rand(-1, 1) * d.errFrac * PADDLE_H;
        robot.reactT = d.react;
    }

    /* ---------- Input: pointers ---------- */
    var pointerMap = {};   // pointerId -> paddle

    function paddleForPointer(clientX) {
        if (settings.mode === '1p' || state === 'menu') return pLeft;
        return clientX < W / 2 ? pLeft : pRight;
    }

    canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (paused || state === 'win') return;
        var p = paddleForPointer(e.clientX);
        pointerMap[e.pointerId] = p;
        p.targetY = e.clientY;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    });

    canvas.addEventListener('pointermove', function (e) {
        if (paused || state === 'win') return;
        var p = pointerMap[e.pointerId];
        if (!p && e.pointerType === 'mouse') p = paddleForPointer(e.clientX);
        if (p && !(settings.mode === '1p' && p === pRight)) p.targetY = e.clientY;
    });

    function releasePointer(e) {
        var p = pointerMap[e.pointerId];
        if (p) p.targetY = null;
        delete pointerMap[e.pointerId];
    }
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* ---------- Input: keyboard ---------- */
    var keys = {};
    window.addEventListener('keydown', function (e) {
        var k = e.key;
        if (k === ' ' || k.indexOf('Arrow') === 0) e.preventDefault();
        keys[k.length === 1 ? k.toLowerCase() : k] = true;
        if ((k === 'p' || k === 'P' || k === 'Escape') &&
            (state === 'serve' || state === 'play' || state === 'point')) {
            togglePause();
        }
        if ((k === 'Enter' || k === ' ') && state === 'menu' && !menuOverlay.classList.contains('hidden')) {
            startMatch();
        }
    });
    window.addEventListener('keyup', function (e) {
        var k = e.key;
        keys[k.length === 1 ? k.toLowerCase() : k] = false;
    });

    /* ---------- Menu wiring ---------- */
    function selectIn(row, attr, value) {
        var btns = row.querySelectorAll('.pick-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('selected', btns[i].getAttribute(attr) === String(value));
        }
    }

    function refreshMenuUI() {
        selectIn(modeRow, 'data-mode', settings.mode);
        selectIn(difficultyRow, 'data-diff', settings.diff);
        selectIn(pointsRow, 'data-points', settings.points);
        difficultySetting.classList.toggle('hidden', settings.mode !== '1p');
    }

    modeRow.addEventListener('click', function (e) {
        var b = e.target.closest('.pick-btn');
        if (!b) return;
        settings.mode = b.getAttribute('data-mode');
        localStorage.setItem(LS + 'mode', settings.mode);
        refreshMenuUI();
        audio.click();
    });
    difficultyRow.addEventListener('click', function (e) {
        var b = e.target.closest('.pick-btn');
        if (!b) return;
        settings.diff = b.getAttribute('data-diff');
        localStorage.setItem(LS + 'diff', settings.diff);
        refreshMenuUI();
        audio.click();
    });
    pointsRow.addEventListener('click', function (e) {
        var b = e.target.closest('.pick-btn');
        if (!b) return;
        settings.points = parseInt(b.getAttribute('data-points'), 10);
        localStorage.setItem(LS + 'points', settings.points);
        refreshMenuUI();
        audio.click();
    });

    playBtn.addEventListener('click', function () { audio.click(); startMatch(); });
    rematchBtn.addEventListener('click', function () { audio.click(); startMatch(); });
    winMenuBtn.addEventListener('click', function () { audio.click(); goMenu(); });
    pauseBtn.addEventListener('click', function () { audio.click(); togglePause(); });
    resumeBtn.addEventListener('click', function () { audio.click(); togglePause(); });
    pauseMenuBtn.addEventListener('click', function () {
        audio.click();
        paused = false;
        pauseOverlay.classList.add('hidden');
        goMenu();
    });

    /* ---------- Sound toggle ---------- */
    function refreshSoundBtn() {
        soundBtn.textContent = audio.isMuted() ? '🔇' : '🔊';
        soundBtn.setAttribute('aria-label', audio.isMuted() ? 'Sound off' : 'Sound on');
    }
    soundBtn.addEventListener('click', function () {
        audio.setMuted(!audio.isMuted());
        refreshSoundBtn();
        audio.click();
    });
    refreshSoundBtn();

    /* ---------- Flow ---------- */
    function startMatch() {
        menuOverlay.classList.add('hidden');
        winOverlay.classList.add('hidden');
        pLeft.score = 0;
        pRight.score = 0;
        pLeft.popT = 0;
        pRight.popT = 0;
        pLeft.y = court.y + court.h / 2;
        pRight.y = court.y + court.h / 2;
        pLeft.targetY = null;
        pRight.targetY = null;
        pRight.isRobot = settings.mode === '1p';
        particles = [];
        confetti = [];
        serveDir = Math.random() < 0.5 ? 1 : -1;
        beginServe();
    }

    function beginServe() {
        resetBall(serveDir);
        serveStep = -1;
        setState('serve');
        countdownEl.classList.remove('hidden');
    }

    function goMenu() {
        winOverlay.classList.add('hidden');
        menuOverlay.classList.remove('hidden');
        pRight.isRobot = true;   // attract mode: both sides drift
        pLeft.targetY = null;
        pRight.targetY = null;
        confetti = [];
        resetBall(Math.random() < 0.5 ? 1 : -1);
        refreshMenuUI();
        setState('menu');
    }

    function togglePause() {
        if (state === 'menu' || state === 'win') return;
        paused = !paused;
        pauseOverlay.classList.toggle('hidden', !paused);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && !paused && (state === 'serve' || state === 'play' || state === 'point')) {
            togglePause();
        }
    });

    function playerName(side) {
        if (settings.mode === '1p') return side === 'left' ? 'You' : 'Robot';
        return side === 'left' ? 'Coral' : 'Purple';
    }

    function scorePoint(side) {
        var p = side === 'left' ? pLeft : pRight;
        p.score++;
        p.popT = 1;
        pointSide = side;
        audio.score();
        var gx = side === 'left' ? court.x + court.w : court.x;
        burstParticles(gx, ball.y, side === 'left' ? CORAL : PURPLE, 26);
        setState('point');
    }

    function endMatch(side) {
        winnerSide = side;
        celebrate = !(settings.mode === '1p' && side === 'right');
        if (celebrate) {
            winEmoji.textContent = '🎉';
            if (settings.mode === '1p') {
                winText.textContent = 'You beat the robot!';
                winSub.textContent = 'Amazing paddling! 🏓';
            } else {
                winText.textContent = (side === 'left' ? '🍓 Coral' : '🍇 Purple') + ' Player wins!';
                winSub.textContent = 'What a match! High five! ✋';
            }
            audio.win();
            confettiBursts = 4;
            confettiTimer = 0;
            spawnConfetti(W / 2, H * 0.3, 90);
        } else {
            winEmoji.textContent = '🤖';
            winText.textContent = 'Robot wins this time!';
            winSub.textContent = 'Oopsie! Try again — you almost had it!';
            audio.lose();
        }
        winOverlay.classList.remove('hidden');
        setState('win');
    }

    /* ---------- Particles & confetti ---------- */
    function burstParticles(x, y, color, n) {
        for (var i = 0; i < n; i++) {
            var a = Math.random() * Math.PI * 2;
            var sp = rand(60, 380);
            particles.push({
                x: x, y: y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp,
                life: 1,
                decay: rand(1.2, 2.6),
                r: rand(2.5, 6.5),
                color: color === 'rainbow' ? CONFETTI_COLORS[i % CONFETTI_COLORS.length] : color
            });
        }
    }

    function spawnConfetti(x, y, n) {
        for (var i = 0; i < n; i++) {
            confetti.push({
                x: x + rand(-40, 40),
                y: y + rand(-20, 20),
                vx: rand(-360, 360),
                vy: rand(-620, -120),
                rot: Math.random() * Math.PI * 2,
                vr: rand(-9, 9),
                size: rand(6, 13),
                color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                life: rand(1.7, 2.7),
                shape: i % 3
            });
        }
    }

    function updateParticles(dt) {
        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= (1 - 2.2 * dt);
            p.vy += 500 * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function updateConfetti(dt) {
        if (state === 'win' && celebrate && confettiBursts > 0) {
            confettiTimer -= dt;
            if (confettiTimer <= 0) {
                spawnConfetti(rand(W * 0.25, W * 0.75), H * 0.25, 55);
                confettiBursts--;
                confettiTimer = 1.3;
            }
        }
        for (var i = confetti.length - 1; i >= 0; i--) {
            var c = confetti[i];
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.vy += 880 * dt;
            c.vx *= (1 - 0.8 * dt);
            c.rot += c.vr * dt;
            c.life -= dt;
            if (c.life <= 0 || c.y > H + 40) confetti.splice(i, 1);
        }
    }

    /* ---------- Robot AI ---------- */
    function predictBallY(targetX) {
        if (Math.abs(ball.vx) < 1) return ball.y;
        var t = (targetX - ball.x) / ball.vx;
        if (t < 0) return ball.y;
        var yRaw = ball.y + ball.vy * t;
        // fold reflections off top/bottom walls
        var top = court.y + BALL_R, bot = court.y + court.h - BALL_R;
        var span = bot - top;
        var yy = (yRaw - top) % (2 * span);
        if (yy < 0) yy += 2 * span;
        return yy <= span ? top + yy : top + (2 * span - yy);
    }

    function updateRobot(pad, dt, attract) {
        var d = DIFFS[settings.diff];
        var maxV = (attract ? 0.35 : d.speed) * court.h;
        var toward = pad.side === 'right' ? ball.vx > 0 : ball.vx < 0;
        if (toward || attract) {
            if (robot.reactT > 0 && !attract) {
                robot.reactT -= dt;
            } else {
                var aim = (d.predict && !attract) ? predictBallY(pad.x) : ball.y;
                robot.aimY = aim + (attract ? 0 : robot.err);
            }
        } else {
            robot.aimY = court.y + court.h / 2 + Math.sin(perfT * 1.3) * court.h * 0.08;
        }
        var dy = robot.aimY - pad.y;
        var step = clamp(dy * 6 * dt, -maxV * dt, maxV * dt);
        pad.y += step;
    }

    /* ---------- Update ---------- */
    var perfT = 0;

    function movePaddleByInput(pad, dt, upKeys, downKeys) {
        var kv = 0;
        for (var i = 0; i < upKeys.length; i++) if (keys[upKeys[i]]) kv -= 1;
        for (var j = 0; j < downKeys.length; j++) if (keys[downKeys[j]]) kv += 1;
        if (kv !== 0) {
            pad.targetY = null;
            pad.y += kv * court.h * 1.05 * dt;
        } else if (pad.targetY !== null) {
            var diff = pad.targetY - pad.y;
            pad.y += diff * Math.min(1, dt * 16);
        }
    }

    function updatePaddles(dt) {
        var attract = state === 'menu';
        if (attract) {
            // both paddles lazily chase the ball for the menu backdrop
            pLeft.y += clamp((ball.y - pLeft.y) * 2.2 * dt, -court.h * 0.3 * dt, court.h * 0.3 * dt);
            updateRobot(pRight, dt, true);
        } else {
            if (settings.mode === '1p') {
                movePaddleByInput(pLeft, dt, ['w', 'ArrowUp'], ['s', 'ArrowDown']);
                updateRobot(pRight, dt, false);
            } else {
                movePaddleByInput(pLeft, dt, ['w'], ['s']);
                movePaddleByInput(pRight, dt, ['ArrowUp'], ['ArrowDown']);
            }
        }
        clampPaddles();
        pLeft.squash = Math.max(0, pLeft.squash - dt * 4);
        pRight.squash = Math.max(0, pRight.squash - dt * 4);
        pLeft.popT = Math.max(0, pLeft.popT - dt * 2);
        pRight.popT = Math.max(0, pRight.popT - dt * 2);
        pLeft.blinkT -= dt;
        pRight.blinkT -= dt;
        if (pLeft.blinkT < -0.15) pLeft.blinkT = 2 + Math.random() * 3;
        if (pRight.blinkT < -0.15) pRight.blinkT = 2 + Math.random() * 3;
    }

    function deflect(pad, dir, hitY) {
        var half = PADDLE_H / 2 + BALL_R;
        var hitPos = clamp((hitY - pad.y) / half, -1, 1);
        var ang = hitPos * (Math.PI / 3);   // up to 60 degrees
        ballSpeedFrac = Math.min(MAX_SPEED_FRAC, ballSpeedFrac * 1.05);
        var sp = ballSpeedFrac * diag;
        ball.vx = Math.cos(ang) * sp * dir;
        ball.vy = Math.sin(ang) * sp;
        rally++;
        pad.squash = 1;
        audio.paddle(rally);
        burstParticles(pad.x + dir * (PADDLE_W / 2 + BALL_R), hitY,
            pad.side === 'left' ? CORAL : PURPLE, 10);
        if (pad === pLeft) rollRobotError();   // robot re-reads the ball each rally
    }

    function updateBall(dt) {
        var ox = ball.x, oy = ball.y;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 24) ball.trail.shift();

        // top/bottom walls
        if (ball.y - BALL_R < court.y) {
            ball.y = court.y + BALL_R;
            if (ball.vy < 0) { ball.vy *= -1; audio.wall(); burstParticles(ball.x, court.y + 2, YELLOW, 6); }
        }
        if (ball.y + BALL_R > court.y + court.h) {
            ball.y = court.y + court.h - BALL_R;
            if (ball.vy > 0) { ball.vy *= -1; audio.wall(); burstParticles(ball.x, court.y + court.h - 2, YELLOW, 6); }
        }

        // paddles (swept so a fast ball can't tunnel through)
        if (ball.vx < 0) {
            var face = pLeft.x + PADDLE_W / 2;
            if (ox - BALL_R >= face && ball.x - BALL_R <= face) {
                var t = ((ox - BALL_R) - face) / ((ox - BALL_R) - (ball.x - BALL_R));
                var hy = oy + (ball.y - oy) * t;
                if (Math.abs(hy - pLeft.y) <= PADDLE_H / 2 + BALL_R) {
                    ball.x = face + BALL_R + 0.5;
                    ball.y = hy;
                    deflect(pLeft, 1, hy);
                }
            }
        } else if (ball.vx > 0) {
            var face2 = pRight.x - PADDLE_W / 2;
            if (ox + BALL_R <= face2 && ball.x + BALL_R >= face2) {
                var t2 = (face2 - (ox + BALL_R)) / ((ball.x + BALL_R) - (ox + BALL_R));
                var hy2 = oy + (ball.y - oy) * t2;
                if (Math.abs(hy2 - pRight.y) <= PADDLE_H / 2 + BALL_R) {
                    ball.x = face2 - BALL_R - 0.5;
                    ball.y = hy2;
                    deflect(pRight, -1, hy2);
                }
            }
        }

        if (state === 'menu') {
            // attract mode: never score, just rebound at the goal lines
            if (ball.x - BALL_R < court.x && ball.vx < 0) { ball.x = court.x + BALL_R; ball.vx *= -1; }
            if (ball.x + BALL_R > court.x + court.w && ball.vx > 0) { ball.x = court.x + court.w - BALL_R; ball.vx *= -1; }
            return;
        }

        // goals
        if (ball.x + BALL_R < court.x - 30) scorePoint('right');
        else if (ball.x - BALL_R > court.x + court.w + 30) scorePoint('left');
    }

    function updateServe(dt) {
        // ball waits in the middle; countdown 3-2-1-GO
        var step = Math.floor(stateT / 0.7);
        if (step !== serveStep) {
            serveStep = step;
            var labels = ['3', '2', '1', 'GO!'];
            if (step < 3) {
                countdownText.textContent = labels[step];
                countdownText.classList.remove('go');
                audio.beep();
            } else if (step === 3) {
                countdownText.textContent = 'GO!';
                countdownText.classList.add('go');
                audio.go();
            }
            countdownText.style.animation = 'none';
            void countdownText.offsetWidth;
            countdownText.style.animation = '';
        }
        if (stateT >= 2.55) {
            countdownEl.classList.add('hidden');
            setState('play');
        }
    }

    function update(dt) {
        perfT += dt;
        hueBase = (hueBase + dt * 160) % 360;
        updateParticles(dt);
        updateConfetti(dt);

        if (paused) return;

        switch (state) {
            case 'menu':
                updatePaddles(dt);
                updateBall(dt);
                break;
            case 'serve':
                updatePaddles(dt);
                updateServe(dt);
                break;
            case 'play':
                updatePaddles(dt);
                updateBall(dt);
                break;
            case 'point':
                updatePaddles(dt);
                if (stateT > 0.9) {
                    var scorer = pointSide === 'left' ? pLeft : pRight;
                    if (scorer.score >= settings.points) {
                        endMatch(pointSide);
                    } else {
                        serveDir = pointSide === 'left' ? 1 : -1;  // loser receives
                        beginServe();
                    }
                }
                break;
            case 'win':
                break;
        }
        stateT += dt;
    }

    /* ---------- Drawing ---------- */
    function roundRectPath(c, x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
    }

    function drawCourt() {
        ctx.save();
        ctx.shadowColor = 'rgba(162, 155, 254, 0.3)';
        ctx.shadowBlur = 26;
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        roundRectPath(ctx, court.x, court.y, court.w, court.h, 30);
        ctx.fill();
        ctx.restore();

        // soft team-half tints
        ctx.save();
        roundRectPath(ctx, court.x, court.y, court.w, court.h, 30);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,107,107,0.045)';
        ctx.fillRect(court.x, court.y, court.w / 2, court.h);
        ctx.fillStyle = 'rgba(162,155,254,0.055)';
        ctx.fillRect(court.x + court.w / 2, court.y, court.w / 2, court.h);

        // dashed net + center circle
        ctx.strokeStyle = 'rgba(45,52,54,0.10)';
        ctx.lineWidth = 4;
        ctx.setLineDash([14, 16]);
        ctx.beginPath();
        ctx.moveTo(court.x + court.w / 2, court.y + 8);
        ctx.lineTo(court.x + court.w / 2, court.y + court.h - 8);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(court.x + court.w / 2, court.y + court.h / 2, U * 0.09, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function drawScores() {
        if (state === 'menu') return;
        var fs = Math.round(U * 0.15);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var lScale = 1 + 0.55 * easeOut(pLeft.popT);
        var rScale = 1 + 0.55 * easeOut(pRight.popT);
        var y = court.y + U * 0.13;

        ctx.font = '700 ' + fs + 'px Fredoka, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,107,107,' + (0.3 + 0.45 * pLeft.popT) + ')';
        ctx.save();
        ctx.translate(court.x + court.w * 0.25, y);
        ctx.scale(lScale, lScale);
        ctx.fillText(String(pLeft.score), 0, 0);
        ctx.restore();

        ctx.fillStyle = 'rgba(162,155,254,' + (0.35 + 0.45 * pRight.popT) + ')';
        ctx.save();
        ctx.translate(court.x + court.w * 0.75, y);
        ctx.scale(rScale, rScale);
        ctx.fillText(String(pRight.score), 0, 0);
        ctx.restore();

        if (state === 'serve') {
            ctx.font = '600 ' + Math.round(U * 0.032) + 'px Fredoka, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(45,52,54,0.4)';
            ctx.fillText(playerName('left'), court.x + court.w * 0.25, y + fs * 0.72);
            ctx.fillText(playerName('right') + (pRight.isRobot ? ' 🤖' : ''), court.x + court.w * 0.75, y + fs * 0.72);
        }
        ctx.restore();
    }

    function easeOut(t) { return 1 - Math.pow(1 - clamp(t, 0, 1), 3); }

    function drawPaddle(pad) {
        var color = pad.side === 'left' ? CORAL : PURPLE;
        var s = easeOut(pad.squash);
        var w = PADDLE_W * (1 + 0.65 * s);
        var h = PADDLE_H * (1 - 0.16 * s);
        var x = pad.x - w / 2;
        var y = pad.y - h / 2;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = color;
        roundRectPath(ctx, x, y, w, h, w / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // gloss stripe
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        roundRectPath(ctx, x + w * 0.18, y + h * 0.05, w * 0.28, h * 0.9, w * 0.14);
        ctx.fill();
        ctx.restore();

        if (pad.isRobot && settings.mode === '1p' && state !== 'menu') drawRobotFace(pad);
    }

    function drawRobotFace(pad) {
        var r = Math.max(16, PADDLE_W * 1.35);
        var cx = pad.x, cy = pad.y;
        ctx.save();

        // antenna
        ctx.strokeStyle = '#8478f0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r + 2);
        ctx.lineTo(cx, cy - r - 10);
        ctx.stroke();
        ctx.fillStyle = YELLOW;
        ctx.beginPath();
        ctx.arc(cx, cy - r - 14, 5 + Math.sin(perfT * 6) * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // head
        ctx.fillStyle = '#b7aefe';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(cx - r * 0.25, cy - r * 0.3, r * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // eyes track the ball
        var dx = ball.x - cx, dy = ball.y - cy;
        var len = Math.hypot(dx, dy) || 1;
        var px = (dx / len) * r * 0.14, py = (dy / len) * r * 0.14;
        var blink = pad.blinkT < 0 ? 0.15 : 1;
        var er = r * 0.3;
        for (var side = -1; side <= 1; side += 2) {
            var ex = cx + side * r * 0.38, ey = cy - r * 0.12;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(ex, ey, er, er * blink, 0, 0, Math.PI * 2);
            ctx.fill();
            if (blink === 1) {
                ctx.fillStyle = INK;
                ctx.beginPath();
                ctx.arc(ex + px, ey + py, er * 0.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(ex + px - er * 0.15, ey + py - er * 0.15, er * 0.14, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // smile
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy + r * 0.25, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.restore();
    }

    function drawBall() {
        if (state === 'point' || state === 'win') return;
        // rainbow trail
        for (var i = 0; i < ball.trail.length; i++) {
            var t = ball.trail[i];
            var f = i / ball.trail.length;
            ctx.beginPath();
            ctx.arc(t.x, t.y, BALL_R * (0.25 + 0.75 * f), 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(' + ((hueBase + i * 14) % 360) + ', 85%, 65%, ' + (f * 0.45) + ')';
            ctx.fill();
        }
        ctx.save();
        ctx.shadowColor = 'rgba(45,52,54,0.35)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'hsl(' + hueBase + ', 85%, 62%)';
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.restore();
    }

    function drawParticles() {
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i];
            ctx.globalAlpha = clamp(p.life, 0, 1);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawConfetti() {
        fxCtx.clearRect(0, 0, W, H);
        for (var i = 0; i < confetti.length; i++) {
            var c = confetti[i];
            fxCtx.save();
            fxCtx.translate(c.x, c.y);
            fxCtx.rotate(c.rot);
            fxCtx.globalAlpha = clamp(c.life, 0, 1);
            fxCtx.fillStyle = c.color;
            if (c.shape === 0) {
                fxCtx.fillRect(-c.size / 2, -c.size / 3, c.size, c.size * 0.66);
            } else if (c.shape === 1) {
                fxCtx.beginPath();
                fxCtx.arc(0, 0, c.size / 2, 0, Math.PI * 2);
                fxCtx.fill();
            } else {
                fxCtx.beginPath();
                fxCtx.moveTo(0, -c.size / 2);
                fxCtx.lineTo(c.size / 2, c.size / 2);
                fxCtx.lineTo(-c.size / 2, c.size / 2);
                fxCtx.closePath();
                fxCtx.fill();
            }
            fxCtx.restore();
        }
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        drawCourt();
        drawScores();
        drawPaddle(pLeft);
        drawPaddle(pRight);
        drawBall();
        drawParticles();
        drawConfetti();
    }

    /* ---------- Main loop ---------- */
    var lastT = performance.now();
    function loop(now) {
        var dt = Math.min((now - lastT) / 1000, 0.05);
        lastT = now;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    /* ---------- Boot ---------- */
    window.addEventListener('resize', resize);
    resize();
    goMenu();
    requestAnimationFrame(loop);
})();
