/**
 * Pong — Two-Player iPad Touch Game
 * ─────────────────────────────────
 * Each player touches their half of the screen to control their paddle.
 *   • Player 1 (left,  cyan)    → left  half of screen
 *   • Player 2 (right, magenta) → right half of screen
 *
 * Touch Y position maps directly to paddle center.
 */

(() => {
    'use strict';

    /* ── DOM refs ──────────────────────────────────────── */
    const canvas = document.getElementById('pong-canvas');
    const ctx = canvas.getContext('2d');
    const menuOverlay = document.getElementById('menu-overlay');
    const winOverlay = document.getElementById('win-overlay');
    const winText = document.getElementById('win-text');
    const countdown = document.getElementById('countdown');
    const countText = document.getElementById('countdown-text');
    const scoreLeftEl = document.getElementById('score-left');
    const scoreRightEl = document.getElementById('score-right');
    const startBtn = document.getElementById('start-btn');
    const rematchBtn = document.getElementById('rematch-btn');
    const menuBtn = document.getElementById('menu-btn');
    const winScoreEl = document.getElementById('winning-score');

    /* ── Settings ──────────────────────────────────────── */
    let winningScore = 7;

    /* Score selector buttons */
    document.querySelectorAll('.score-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const d = parseInt(btn.dataset.delta, 10);
            winningScore = Math.max(1, Math.min(21, winningScore + d));
            winScoreEl.textContent = winningScore;
        });
    });

    /* ── Game constants ────────────────────────────────── */
    const PADDLE_WIDTH = 18;
    const PADDLE_HEIGHT = 130;
    const PADDLE_MARGIN = 36;
    const BALL_RADIUS = 12;
    const BALL_SPEED_INIT = 7;
    const BALL_SPEED_MAX = 16;
    const BALL_ACCEL = 0.35;   // speed increase per paddle hit

    /* Colors */
    const COL_CYAN = '#00f0ff';
    const COL_MAGENTA = '#ff2daa';
    const COL_BALL = '#ffffff';
    const COL_NET = 'rgba(255,255,255,0.06)';

    /* ── Game state ────────────────────────────────────── */
    let W, H;                           // canvas pixel size
    let dpr;                            // device-pixel-ratio
    let running = false;
    let animId = null;

    const paddle1 = { x: 0, y: 0, vy: 0, targetY: null, score: 0 };
    const paddle2 = { x: 0, y: 0, vy: 0, targetY: null, score: 0 };
    const ball = { x: 0, y: 0, vx: 0, vy: 0, speed: BALL_SPEED_INIT, trail: [] };

    /* Particles for goal effects */
    let particles = [];

    /* ── Canvas sizing ─────────────────────────────────── */
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        paddle1.x = PADDLE_MARGIN;
        paddle2.x = W - PADDLE_MARGIN - PADDLE_WIDTH;
        // If paddles haven't been placed yet, center them
        if (paddle1.y === 0) paddle1.y = H / 2 - PADDLE_HEIGHT / 2;
        if (paddle2.y === 0) paddle2.y = H / 2 - PADDLE_HEIGHT / 2;
    }
    window.addEventListener('resize', resize);
    resize();

    /* ── Touch handling ────────────────────────────────── */
    const activeTouches = {};  // identifier → { side: 'left'|'right' }

    function handleTouchStart(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            const side = t.clientX < W / 2 ? 'left' : 'right';
            activeTouches[t.identifier] = { side };
            setPaddleTarget(side, t.clientY);
        }
    }

    function handleTouchMove(e) {
        e.preventDefault();
        for (const t of e.changedTouches) {
            const info = activeTouches[t.identifier];
            if (info) setPaddleTarget(info.side, t.clientY);
        }
    }

    function handleTouchEnd(e) {
        for (const t of e.changedTouches) {
            const info = activeTouches[t.identifier];
            if (info) {
                const p = info.side === 'left' ? paddle1 : paddle2;
                p.targetY = null;
            }
            delete activeTouches[t.identifier];
        }
    }

    function setPaddleTarget(side, clientY) {
        const p = side === 'left' ? paddle1 : paddle2;
        p.targetY = Math.max(0, Math.min(H - PADDLE_HEIGHT, clientY - PADDLE_HEIGHT / 2));
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    /* ── Mouse fallback (for testing on desktop) ──────── */
    canvas.addEventListener('mousemove', e => {
        const side = e.clientX < W / 2 ? 'left' : 'right';
        setPaddleTarget(side, e.clientY);
    });

    /* ── Ball reset ────────────────────────────────────── */
    function resetBall(serveDirection) {
        ball.x = W / 2;
        ball.y = H / 2;
        ball.speed = BALL_SPEED_INIT;
        ball.trail = [];
        const angle = (Math.random() * 0.8 - 0.4); // ±~23°
        ball.vx = Math.cos(angle) * ball.speed * serveDirection;
        ball.vy = Math.sin(angle) * ball.speed;
    }

    /* ── Particles ─────────────────────────────────────── */
    function spawnGoalParticles(x, y, color) {
        for (let i = 0; i < 40; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 6;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.015 + Math.random() * 0.02,
                radius: 3 + Math.random() * 5,
                color
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    /* ── Update ────────────────────────────────────────── */
    function update() {
        /* Paddle smoothing */
        smoothPaddle(paddle1);
        smoothPaddle(paddle2);

        /* Ball movement */
        ball.x += ball.vx;
        ball.y += ball.vy;

        /* Trail */
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 18) ball.trail.shift();

        /* Top / bottom bounce */
        if (ball.y - BALL_RADIUS < 0) {
            ball.y = BALL_RADIUS;
            ball.vy *= -1;
        }
        if (ball.y + BALL_RADIUS > H) {
            ball.y = H - BALL_RADIUS;
            ball.vy *= -1;
        }

        /* Paddle collision – left */
        if (ball.vx < 0 &&
            ball.x - BALL_RADIUS <= paddle1.x + PADDLE_WIDTH &&
            ball.x - BALL_RADIUS >= paddle1.x &&
            ball.y >= paddle1.y && ball.y <= paddle1.y + PADDLE_HEIGHT) {
            deflect(paddle1, 1);
        }

        /* Paddle collision – right */
        if (ball.vx > 0 &&
            ball.x + BALL_RADIUS >= paddle2.x &&
            ball.x + BALL_RADIUS <= paddle2.x + PADDLE_WIDTH &&
            ball.y >= paddle2.y && ball.y <= paddle2.y + PADDLE_HEIGHT) {
            deflect(paddle2, -1);
        }

        /* Goal – right wall → player 1 scores */
        if (ball.x - BALL_RADIUS > W) {
            paddle1.score++;
            scoreLeftEl.textContent = paddle1.score;
            flashScore('left');
            spawnGoalParticles(W, ball.y, COL_CYAN);
            if (paddle1.score >= winningScore) return endGame(1);
            resetBall(-1);
        }

        /* Goal – left wall → player 2 scores */
        if (ball.x + BALL_RADIUS < 0) {
            paddle2.score++;
            scoreRightEl.textContent = paddle2.score;
            flashScore('right');
            spawnGoalParticles(0, ball.y, COL_MAGENTA);
            if (paddle2.score >= winningScore) return endGame(2);
            resetBall(1);
        }

        updateParticles();
    }

    function smoothPaddle(p) {
        if (p.targetY !== null) {
            const diff = p.targetY - p.y;
            p.y += diff * 0.25;   // smooth follow
        }
    }

    function deflect(paddle, dirX) {
        /* Where on the paddle the ball hit (–1 to 1) */
        const hitPos = ((ball.y - paddle.y) / PADDLE_HEIGHT) * 2 - 1;
        const angle = hitPos * (Math.PI / 3.2);  // max ~56°
        ball.speed = Math.min(BALL_SPEED_MAX, ball.speed + BALL_ACCEL);
        ball.vx = Math.cos(angle) * ball.speed * dirX;
        ball.vy = Math.sin(angle) * ball.speed;
        /* Nudge ball out of paddle */
        ball.x += ball.vx;
    }

    function flashScore(side) {
        const el = side === 'left' ? scoreLeftEl : scoreRightEl;
        el.classList.add('flash-' + side);
        setTimeout(() => el.classList.remove('flash-' + side), 300);
    }

    /* ── Draw ──────────────────────────────────────────── */
    function draw() {
        ctx.clearRect(0, 0, W, H);

        /* Background subtle radial glow */
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
        grad.addColorStop(0, 'rgba(20,20,50,1)');
        grad.addColorStop(1, 'rgba(10,10,26,1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        /* Center net */
        drawNet();

        /* Paddles */
        drawPaddle(paddle1, COL_CYAN);
        drawPaddle(paddle2, COL_MAGENTA);

        /* Ball trail */
        drawTrail();

        /* Ball */
        drawBall();

        /* Particles */
        drawParticles();

        /* Touch zone indicator (subtle) */
        drawTouchZones();
    }

    function drawNet() {
        const dashLen = 16, gap = 14;
        ctx.save();
        ctx.strokeStyle = COL_NET;
        ctx.lineWidth = 3;
        ctx.setLineDash([dashLen, gap]);
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    function drawPaddle(p, color) {
        const r = 8;
        ctx.save();

        /* Glow */
        ctx.shadowColor = color;
        ctx.shadowBlur = 24;

        /* Body */
        ctx.fillStyle = color;
        roundRect(ctx, p.x, p.y, PADDLE_WIDTH, PADDLE_HEIGHT, r);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawTrail() {
        for (let i = 0; i < ball.trail.length; i++) {
            const t = ball.trail[i];
            const alpha = (i / ball.trail.length) * 0.35;
            const radius = BALL_RADIUS * (0.3 + 0.7 * (i / ball.trail.length));
            ctx.beginPath();
            ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fill();
        }
    }

    function drawBall() {
        ctx.save();
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = COL_BALL;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawTouchZones() {
        /* Very faint vertical half-line at center */
        ctx.save();
        ctx.globalAlpha = 0.02;
        ctx.fillStyle = COL_CYAN;
        ctx.fillRect(0, 0, W / 2, H);
        ctx.fillStyle = COL_MAGENTA;
        ctx.fillRect(W / 2, 0, W / 2, H);
        ctx.restore();
    }

    function roundRect(c, x, y, w, h, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.lineTo(x + w - r, y);
        c.arcTo(x + w, y, x + w, y + r, r);
        c.lineTo(x + w, y + h - r);
        c.arcTo(x + w, y + h, x + w - r, y + h, r);
        c.lineTo(x + r, y + h);
        c.arcTo(x, y + h, x, y + h - r, r);
        c.lineTo(x, y + r);
        c.arcTo(x, y, x + r, y, r);
        c.closePath();
    }

    /* ── Game loop ─────────────────────────────────────── */
    function loop() {
        if (!running) return;
        update();
        draw();
        animId = requestAnimationFrame(loop);
    }

    /* ── Countdown & start ─────────────────────────────── */
    function startCountdown(cb) {
        countdown.classList.remove('hidden');
        let n = 3;
        countText.textContent = n;
        // Re-trigger animation
        countText.style.animation = 'none';
        void countText.offsetWidth;
        countText.style.animation = '';

        const iv = setInterval(() => {
            n--;
            if (n > 0) {
                countText.textContent = n;
                countText.style.animation = 'none';
                void countText.offsetWidth;
                countText.style.animation = '';
            } else {
                countText.textContent = 'GO';
                countText.style.animation = 'none';
                void countText.offsetWidth;
                countText.style.animation = '';
                clearInterval(iv);
                setTimeout(() => {
                    countdown.classList.add('hidden');
                    cb();
                }, 500);
            }
        }, 700);
    }

    function startGame() {
        menuOverlay.classList.add('hidden');
        winOverlay.classList.add('hidden');

        paddle1.score = 0;
        paddle2.score = 0;
        scoreLeftEl.textContent = '0';
        scoreRightEl.textContent = '0';
        paddle1.y = H / 2 - PADDLE_HEIGHT / 2;
        paddle2.y = H / 2 - PADDLE_HEIGHT / 2;
        paddle1.targetY = null;
        paddle2.targetY = null;
        particles = [];

        resetBall(Math.random() < 0.5 ? 1 : -1);

        // Draw initial frame behind countdown
        draw();

        startCountdown(() => {
            running = true;
            loop();
        });
    }

    function endGame(winner) {
        running = false;
        if (animId) cancelAnimationFrame(animId);
        winText.textContent = `Player ${winner} Wins!`;
        winOverlay.classList.remove('hidden');
    }

    /* ── Button wiring ─────────────────────────────────── */
    startBtn.addEventListener('click', startGame);
    rematchBtn.addEventListener('click', startGame);
    menuBtn.addEventListener('click', () => {
        winOverlay.classList.add('hidden');
        menuOverlay.classList.remove('hidden');
    });

    /* ── Prevent scroll / zoom on iOS ──────────────────── */
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });

    /* ── Initial paint (menu visible, canvas behind) ───── */
    draw();

})();
