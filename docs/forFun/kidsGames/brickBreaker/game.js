/**
 * Brick Breaker — Canvas Arcade Game
 * ───────────────────────────────────
 * Classic brick-breaking action with neon aesthetics.
 * Touch, mouse, or keyboard to control the paddle.
 * Features multiple levels, power-ups, and particle effects.
 */

(() => {
    'use strict';

    /* ── DOM refs ──────────────────────────────────────── */
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const menuOverlay = document.getElementById('menu-overlay');
    const levelOverlay = document.getElementById('level-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const levelText = document.getElementById('level-text');
    const levelScoreText = document.getElementById('level-score-text');
    const finalScoreText = document.getElementById('final-score-text');
    const countdown = document.getElementById('countdown');
    const countText = document.getElementById('countdown-text');
    const scoreEl = document.getElementById('score-display');
    const levelEl = document.getElementById('level-display');
    const livesEl = document.getElementById('lives-display');
    const startBtn = document.getElementById('start-btn');
    const nextLevelBtn = document.getElementById('next-level-btn');
    const retryBtn = document.getElementById('retry-btn');
    const menuBtn = document.getElementById('menu-btn');

    /* ── Game constants ────────────────────────────────── */
    const PADDLE_HEIGHT = 18;
    const PADDLE_RADIUS = 9;
    const BALL_RADIUS = 8;
    const BALL_SPEED_INIT = 5.5;
    const BALL_SPEED_MAX = 12;
    const BALL_ACCEL = 0.15;

    const BRICK_ROWS = 6;
    const BRICK_COLS = 10;
    const BRICK_HEIGHT = 24;
    const BRICK_PADDING = 4;
    const BRICK_TOP_OFFSET = 80;

    const POWERUP_SIZE = 20;
    const POWERUP_SPEED = 2.5;
    const POWERUP_CHANCE = 0.18;

    const MAX_LIVES = 5;

    /* ── Neon color palette for bricks ────────────────── */
    const ROW_COLORS = [
        { fill: '#ff2daa', glow: 'rgba(255, 45, 170, 0.5)' },   // magenta
        { fill: '#ff6a00', glow: 'rgba(255, 106, 0, 0.5)' },     // orange
        { fill: '#ffd700', glow: 'rgba(255, 215, 0, 0.5)' },     // gold
        { fill: '#39ff14', glow: 'rgba(57, 255, 20, 0.5)' },     // lime
        { fill: '#00f0ff', glow: 'rgba(0, 240, 255, 0.5)' },     // cyan
        { fill: '#a855f7', glow: 'rgba(168, 85, 247, 0.5)' },    // violet
    ];

    /* Power-up types */
    const PU_TYPES = {
        WIDE: { color: '#39ff14', label: 'W', effect: 'wide' },
        MULTI: { color: '#ffd700', label: 'M', effect: 'multi' },
        LIFE: { color: '#ff2daa', label: '♥', effect: 'life' },
        FAST: { color: '#ff6a00', label: 'F', effect: 'fast' },
    };
    const PU_LIST = Object.values(PU_TYPES);

    /* ── Game state ────────────────────────────────────── */
    let W, H, dpr;
    let running = false;
    let animId = null;

    let score = 0;
    let level = 1;
    let lives = 3;
    let combo = 0;

    let paddleX, paddleW, paddleTargetX;
    let balls = [];
    let bricks = [];
    let particles = [];
    let powerups = [];
    let shakeTime = 0;

    let wideTimer = 0;
    const WIDE_DURATION = 600; // frames
    let basePaddleW;

    /* Ball attached to paddle (pre-launch) */
    let ballAttached = true;

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

        basePaddleW = Math.min(140, W * 0.18);
        if (wideTimer > 0) {
            paddleW = basePaddleW * 1.6;
        } else {
            paddleW = basePaddleW;
        }
        if (paddleX === undefined) paddleX = W / 2 - paddleW / 2;
    }
    window.addEventListener('resize', resize);
    resize();

    /* ── Input handling ────────────────────────────────── */
    function setTarget(clientX) {
        paddleTargetX = Math.max(0, Math.min(W - paddleW, clientX - paddleW / 2));
    }

    /* Touch */
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        if (ballAttached && running) launchBall();
        for (const t of e.changedTouches) setTarget(t.clientX);
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const t of e.changedTouches) setTarget(t.clientX);
    }, { passive: false });

    /* Mouse */
    canvas.addEventListener('mousemove', e => {
        setTarget(e.clientX);
    });
    canvas.addEventListener('click', () => {
        if (ballAttached && running) launchBall();
    });

    /* Keyboard */
    const keys = {};
    window.addEventListener('keydown', e => {
        keys[e.key] = true;
        if (e.key === ' ' && ballAttached && running) launchBall();
    });
    window.addEventListener('keyup', e => {
        keys[e.key] = false;
    });

    /* ── Brick generation ─────────────────────────────── */
    function generateBricks() {
        bricks = [];
        const brickW = (W - BRICK_PADDING * (BRICK_COLS + 1)) / BRICK_COLS;
        const extraRows = Math.min(Math.floor((level - 1) / 2), 4);
        const rows = BRICK_ROWS + extraRows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < BRICK_COLS; c++) {
                // Some levels have gaps for variety
                if (level >= 3 && ((r + c) % (8 - Math.min(level, 6))) === 0) continue;

                const x = BRICK_PADDING + c * (brickW + BRICK_PADDING);
                const y = BRICK_TOP_OFFSET + r * (BRICK_HEIGHT + BRICK_PADDING);
                const colorIdx = r % ROW_COLORS.length;

                // Higher rows can require more hits
                let hp = 1;
                if (level >= 2 && r < 2) hp = 2;
                if (level >= 4 && r < 1) hp = 3;

                bricks.push({
                    x, y,
                    w: brickW,
                    h: BRICK_HEIGHT,
                    hp,
                    maxHp: hp,
                    color: ROW_COLORS[colorIdx],
                    alive: true,
                    shatter: 0,
                });
            }
        }
    }

    /* ── Ball management ──────────────────────────────── */
    function createBall(x, y, vx, vy) {
        return {
            x, y, vx, vy,
            speed: BALL_SPEED_INIT + (level - 1) * 0.3,
            trail: [],
            radius: BALL_RADIUS,
        };
    }

    function launchBall() {
        if (!ballAttached || balls.length === 0) return;
        ballAttached = false;
        const b = balls[0];
        const angle = -Math.PI / 2 + (Math.random() * 0.6 - 0.3);
        b.vx = Math.cos(angle) * b.speed;
        b.vy = Math.sin(angle) * b.speed;
    }

    function resetBallOnPaddle() {
        ballAttached = true;
        balls = [createBall(
            paddleX + paddleW / 2,
            H - 50 - PADDLE_HEIGHT - BALL_RADIUS,
            0, 0
        )];
    }

    /* ── Power-ups ────────────────────────────────────── */
    function spawnPowerup(x, y) {
        if (Math.random() > POWERUP_CHANCE) return;
        const type = PU_LIST[Math.floor(Math.random() * PU_LIST.length)];
        powerups.push({ x, y, type, vy: POWERUP_SPEED, rotation: 0 });
    }

    function applyPowerup(pu) {
        switch (pu.type.effect) {
            case 'wide':
                wideTimer = WIDE_DURATION;
                paddleW = basePaddleW * 1.6;
                break;
            case 'multi':
                // Duplicate each existing ball
                const newBalls = [];
                for (const b of balls) {
                    if (b.vx === 0 && b.vy === 0) continue;
                    const angle1 = Math.atan2(b.vy, b.vx) + 0.3;
                    const angle2 = Math.atan2(b.vy, b.vx) - 0.3;
                    newBalls.push(createBall(b.x, b.y,
                        Math.cos(angle1) * b.speed, Math.sin(angle1) * b.speed));
                    newBalls.push(createBall(b.x, b.y,
                        Math.cos(angle2) * b.speed, Math.sin(angle2) * b.speed));
                }
                balls.push(...newBalls);
                break;
            case 'life':
                lives = Math.min(MAX_LIVES, lives + 1);
                updateLivesDisplay();
                break;
            case 'fast':
                for (const b of balls) {
                    b.speed = Math.min(BALL_SPEED_MAX, b.speed + 2);
                    const angle = Math.atan2(b.vy, b.vx);
                    b.vx = Math.cos(angle) * b.speed;
                    b.vy = Math.sin(angle) * b.speed;
                }
                break;
        }
    }

    /* ── Particles ─────────────────────────────────────── */
    function spawnBrickParticles(x, y, w, h, color) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.5 + Math.random() * 4;
            particles.push({
                x: cx + (Math.random() - 0.5) * w,
                y: cy + (Math.random() - 0.5) * h,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.018 + Math.random() * 0.02,
                radius: 2 + Math.random() * 4,
                color: color.fill,
            });
        }
    }

    function spawnPaddleHitParticles(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
            const speed = 1 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.03 + Math.random() * 0.03,
                radius: 2 + Math.random() * 3,
                color: '#00f0ff',
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // slight gravity
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    /* ── Collision detection ───────────────────────────── */
    function ballBrickCollision(b, brick) {
        // AABB vs circle
        const cx = Math.max(brick.x, Math.min(b.x, brick.x + brick.w));
        const cy = Math.max(brick.y, Math.min(b.y, brick.y + brick.h));
        const dx = b.x - cx;
        const dy = b.y - cy;
        return (dx * dx + dy * dy) < (b.radius * b.radius);
    }

    /* ── Update ────────────────────────────────────────── */
    function update() {
        /* Keyboard paddle control */
        const kbSpeed = 10;
        if (keys['ArrowLeft'] || keys['a']) {
            paddleTargetX = Math.max(0, (paddleTargetX ?? paddleX) - kbSpeed);
        }
        if (keys['ArrowRight'] || keys['d']) {
            paddleTargetX = Math.max(0, Math.min(W - paddleW, (paddleTargetX ?? paddleX) + kbSpeed));
        }

        /* Paddle smoothing */
        if (paddleTargetX !== undefined) {
            const diff = paddleTargetX - paddleX;
            paddleX += diff * 0.25;
        }

        /* Wide paddle timer */
        if (wideTimer > 0) {
            wideTimer--;
            if (wideTimer === 0) {
                paddleW = basePaddleW;
            }
        }

        /* Paddle Y */
        const paddleY = H - 50;

        /* Ball on paddle */
        if (ballAttached && balls.length > 0) {
            balls[0].x = paddleX + paddleW / 2;
            balls[0].y = paddleY - PADDLE_HEIGHT - BALL_RADIUS;
        }

        /* Update balls */
        for (let bi = balls.length - 1; bi >= 0; bi--) {
            const b = balls[bi];
            if (ballAttached && bi === 0) continue;

            b.x += b.vx;
            b.y += b.vy;

            /* Trail */
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 14) b.trail.shift();

            /* Wall bounces */
            if (b.x - b.radius < 0) {
                b.x = b.radius;
                b.vx = Math.abs(b.vx);
            }
            if (b.x + b.radius > W) {
                b.x = W - b.radius;
                b.vx = -Math.abs(b.vx);
            }
            if (b.y - b.radius < 0) {
                b.y = b.radius;
                b.vy = Math.abs(b.vy);
            }

            /* Paddle collision */
            if (b.vy > 0 &&
                b.y + b.radius >= paddleY &&
                b.y + b.radius <= paddleY + PADDLE_HEIGHT + b.speed &&
                b.x >= paddleX - b.radius &&
                b.x <= paddleX + paddleW + b.radius) {

                const hitPos = (b.x - paddleX) / paddleW; // 0..1
                const angle = (hitPos - 0.5) * Math.PI * 0.7; // -63° to +63°
                b.speed = Math.min(BALL_SPEED_MAX, b.speed + BALL_ACCEL);
                b.vx = Math.sin(angle) * b.speed;
                b.vy = -Math.cos(angle) * b.speed;
                b.y = paddleY - b.radius;
                combo = 0;
                spawnPaddleHitParticles(b.x, paddleY);
            }

            /* Brick collision */
            for (const brick of bricks) {
                if (!brick.alive) continue;
                if (ballBrickCollision(b, brick)) {
                    brick.hp--;
                    if (brick.hp <= 0) {
                        brick.alive = false;
                        combo++;
                        const points = (10 + combo * 2) * level;
                        score += points;
                        scoreEl.textContent = score;
                        flashHud(scoreEl);
                        spawnBrickParticles(brick.x, brick.y, brick.w, brick.h, brick.color);
                        spawnPowerup(brick.x + brick.w / 2, brick.y + brick.h / 2);
                        shakeTime = 6;
                    } else {
                        // Visual crack effect
                        spawnBrickParticles(brick.x, brick.y, brick.w, brick.h, brick.color);
                        shakeTime = 3;
                    }

                    // Reflect ball
                    const bCX = brick.x + brick.w / 2;
                    const bCY = brick.y + brick.h / 2;
                    const overlapX = (brick.w / 2 + b.radius) - Math.abs(b.x - bCX);
                    const overlapY = (brick.h / 2 + b.radius) - Math.abs(b.y - bCY);

                    if (overlapX < overlapY) {
                        b.vx *= -1;
                        b.x += b.vx > 0 ? overlapX : -overlapX;
                    } else {
                        b.vy *= -1;
                        b.y += b.vy > 0 ? overlapY : -overlapY;
                    }
                    break; // one brick per ball per frame
                }
            }

            /* Ball fell off bottom */
            if (b.y - b.radius > H) {
                balls.splice(bi, 1);
            }
        }

        /* All balls lost */
        if (balls.length === 0 && !ballAttached) {
            lives--;
            combo = 0;
            updateLivesDisplay();
            flashHud(livesEl);
            shakeTime = 12;

            if (lives <= 0) {
                endGame();
                return;
            }
            resetBallOnPaddle();
        }

        /* Power-ups */
        for (let i = powerups.length - 1; i >= 0; i--) {
            const pu = powerups[i];
            pu.y += pu.vy;
            pu.rotation += 0.03;

            // Catch with paddle
            if (pu.y + POWERUP_SIZE >= paddleY &&
                pu.y <= paddleY + PADDLE_HEIGHT &&
                pu.x + POWERUP_SIZE >= paddleX &&
                pu.x - POWERUP_SIZE <= paddleX + paddleW) {
                applyPowerup(pu);
                powerups.splice(i, 1);
                continue;
            }

            // Off screen
            if (pu.y > H + POWERUP_SIZE) {
                powerups.splice(i, 1);
            }
        }

        /* Level cleared */
        if (bricks.every(b => !b.alive)) {
            levelCleared();
        }

        updateParticles();

        /* Shake decay */
        if (shakeTime > 0) shakeTime--;
    }

    /* ── Draw ──────────────────────────────────────────── */
    function draw() {
        ctx.save();

        /* Screen shake */
        if (shakeTime > 0) {
            const intensity = shakeTime * 0.8;
            ctx.translate(
                (Math.random() - 0.5) * intensity,
                (Math.random() - 0.5) * intensity
            );
        }

        ctx.clearRect(-10, -10, W + 20, H + 20);

        /* Background */
        const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
        grad.addColorStop(0, 'rgba(20, 20, 50, 1)');
        grad.addColorStop(1, 'rgba(10, 10, 26, 1)');
        ctx.fillStyle = grad;
        ctx.fillRect(-10, -10, W + 20, H + 20);

        /* Subtle grid */
        drawGrid();

        /* Bricks */
        drawBricks();

        /* Power-ups */
        drawPowerups();

        /* Paddle */
        drawPaddle();

        /* Balls */
        for (const b of balls) {
            drawTrail(b);
            drawBall(b);
        }

        /* Particles */
        drawParticles();

        ctx.restore();
    }

    function drawGrid() {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.lineWidth = 1;
        const gridSize = 60;
        for (let x = 0; x < W; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y < H; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawBricks() {
        for (const brick of bricks) {
            if (!brick.alive) continue;

            const { x, y, w, h, hp, maxHp, color } = brick;
            const damageAlpha = hp / maxHp;

            ctx.save();

            /* Glow */
            ctx.shadowColor = color.glow;
            ctx.shadowBlur = 12;

            /* Body */
            const bodyAlpha = 0.5 + 0.5 * damageAlpha;
            ctx.globalAlpha = bodyAlpha;
            ctx.fillStyle = color.fill;
            roundRect(ctx, x, y, w, h, 4);
            ctx.fill();

            /* Inner highlight */
            ctx.globalAlpha = 0.15 * damageAlpha;
            ctx.fillStyle = '#ffffff';
            roundRect(ctx, x + 2, y + 2, w - 4, h / 2 - 2, 3);
            ctx.fill();

            /* HP indicator for multi-hit bricks */
            if (maxHp > 1) {
                ctx.globalAlpha = 0.8;
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.min(14, h - 6)}px 'Orbitron', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(hp, x + w / 2, y + h / 2);
            }

            /* Crack lines for damaged bricks */
            if (hp < maxHp) {
                ctx.globalAlpha = 0.4;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x + w * 0.3, y);
                ctx.lineTo(x + w * 0.5, y + h * 0.5);
                ctx.lineTo(x + w * 0.7, y + h);
                ctx.stroke();
            }

            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    function drawPowerups() {
        for (const pu of powerups) {
            ctx.save();
            ctx.translate(pu.x, pu.y);
            ctx.rotate(pu.rotation);

            /* Glow */
            ctx.shadowColor = pu.type.color;
            ctx.shadowBlur = 16;

            /* Diamond shape */
            ctx.fillStyle = pu.type.color;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.moveTo(0, -POWERUP_SIZE);
            ctx.lineTo(POWERUP_SIZE * 0.7, 0);
            ctx.lineTo(0, POWERUP_SIZE);
            ctx.lineTo(-POWERUP_SIZE * 0.7, 0);
            ctx.closePath();
            ctx.fill();

            /* Label */
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#0a0a1a';
            ctx.font = `bold 12px 'Orbitron', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pu.type.label, 0, 1);

            ctx.restore();
        }
    }

    function drawPaddle() {
        const paddleY = H - 50;
        const r = PADDLE_RADIUS;

        ctx.save();

        /* Glow */
        ctx.shadowColor = wideTimer > 0 ? '#39ff14' : '#00f0ff';
        ctx.shadowBlur = 20;

        /* Gradient fill */
        const pgrd = ctx.createLinearGradient(paddleX, paddleY, paddleX + paddleW, paddleY);
        if (wideTimer > 0) {
            pgrd.addColorStop(0, '#39ff14');
            pgrd.addColorStop(1, '#00f0ff');
        } else {
            pgrd.addColorStop(0, '#00f0ff');
            pgrd.addColorStop(0.5, '#00d4ff');
            pgrd.addColorStop(1, '#0088ff');
        }
        ctx.fillStyle = pgrd;
        roundRect(ctx, paddleX, paddleY, paddleW, PADDLE_HEIGHT, r);
        ctx.fill();

        /* Top highlight */
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, paddleX + 4, paddleY + 2, paddleW - 8, PADDLE_HEIGHT / 2 - 2, r / 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function drawTrail(b) {
        for (let i = 0; i < b.trail.length; i++) {
            const t = b.trail[i];
            const alpha = (i / b.trail.length) * 0.3;
            const radius = b.radius * (0.3 + 0.7 * (i / b.trail.length));
            ctx.beginPath();
            ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fill();
        }
    }

    function drawBall(b) {
        ctx.save();
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);

        const bgrd = ctx.createRadialGradient(b.x - 2, b.y - 2, 0, b.x, b.y, b.radius);
        bgrd.addColorStop(0, '#ffffff');
        bgrd.addColorStop(1, '#ccddff');
        ctx.fillStyle = bgrd;
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

    /* ── HUD helpers ───────────────────────────────────── */
    function updateLivesDisplay() {
        livesEl.textContent = '♥'.repeat(lives);
    }

    function flashHud(el) {
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 250);
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
        levelOverlay.classList.add('hidden');
        gameoverOverlay.classList.add('hidden');

        score = 0;
        level = 1;
        lives = 3;
        combo = 0;
        wideTimer = 0;
        particles = [];
        powerups = [];
        paddleW = basePaddleW;

        scoreEl.textContent = '0';
        levelEl.textContent = '1';
        updateLivesDisplay();

        initLevel();
    }

    function initLevel() {
        levelEl.textContent = level;
        generateBricks();
        paddleX = W / 2 - paddleW / 2;
        paddleTargetX = paddleX;
        particles = [];
        powerups = [];
        wideTimer = 0;
        paddleW = basePaddleW;

        resetBallOnPaddle();

        draw(); // show state behind countdown

        startCountdown(() => {
            running = true;
            loop();
        });
    }

    function levelCleared() {
        running = false;
        if (animId) cancelAnimationFrame(animId);

        // Bonus points for remaining lives
        const bonus = lives * 100 * level;
        score += bonus;
        scoreEl.textContent = score;

        levelText.textContent = `Level ${level} Complete!`;
        levelScoreText.textContent = `Bonus: +${bonus} • Total: ${score}`;
        levelOverlay.classList.remove('hidden');
    }

    function nextLevel() {
        levelOverlay.classList.add('hidden');
        level++;
        initLevel();
    }

    function endGame() {
        running = false;
        if (animId) cancelAnimationFrame(animId);
        finalScoreText.textContent = `Final Score: ${score}`;
        gameoverOverlay.classList.remove('hidden');
    }

    /* ── Button wiring ─────────────────────────────────── */
    startBtn.addEventListener('click', startGame);
    nextLevelBtn.addEventListener('click', nextLevel);
    retryBtn.addEventListener('click', startGame);
    menuBtn.addEventListener('click', () => {
        gameoverOverlay.classList.add('hidden');
        menuOverlay.classList.remove('hidden');
    });

    /* ── Prevent scroll / zoom on iOS ──────────────────── */
    document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
    document.addEventListener('gestureend', e => e.preventDefault(), { passive: false });

    /* ── Initial paint ─────────────────────────────────── */
    paddleX = W / 2 - paddleW / 2;
    paddleTargetX = paddleX;
    generateBricks();
    resetBallOnPaddle();
    draw();

})();
