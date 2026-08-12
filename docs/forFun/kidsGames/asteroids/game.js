/* ═══════════════════════════════════════════════════════════════
   SPACE ROCKS — kid-friendly asteroids
   Pastel sleepy space rocks, bubble-shield rocket, friendly UFO.
   Touch: left half = joystick, right half = fire.
   Keys:  arrows / WASD fly, Space shoots, P or Esc pauses.
   ═══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    // ── DOM ──────────────────────────────────────────
    const wrapEl = document.getElementById('game-wrap');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    const hudEl = document.getElementById('hud');
    const hudScore = document.getElementById('hud-score');
    const hudWave = document.getElementById('hud-wave');
    const pips = [document.getElementById('pip-0'), document.getElementById('pip-1'), document.getElementById('pip-2')];
    const bannerEl = document.getElementById('wave-banner');
    const hintsEl = document.getElementById('touch-hints');

    const menuOverlay = document.getElementById('menu-overlay');
    const overOverlay = document.getElementById('over-overlay');
    const pauseOverlay = document.getElementById('pause-overlay');
    const menuBest = document.getElementById('menu-best');
    const overScore = document.getElementById('over-score');
    const overBest = document.getElementById('over-best');
    const newBestEl = document.getElementById('new-best');

    const playBtn = document.getElementById('play-btn');
    const retryBtn = document.getElementById('retry-btn');
    const overMenuBtn = document.getElementById('over-menu-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const restartBtn = document.getElementById('restart-btn');
    const pauseMenuBtn = document.getElementById('pause-menu-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const soundBtn = document.getElementById('sound-btn');

    // ── Constants ───────────────────────────────────
    const TAU = Math.PI * 2;
    const ROT_SPEED = 3.8;        // rad/s keyboard
    const JOY_ROT_SPEED = 7.5;    // rad/s joystick steering
    const ACCEL = 380;            // px/s^2 at u=1
    const DRAG = 0.9;             // /s
    const MAX_SPEED = 340;        // px/s at u=1
    const BULLET_SPEED = 500;
    const BULLET_LIFE = 1.05;
    const FIRE_COOLDOWN = 0.21;
    const JOY_R = 64;             // joystick radius (px)
    const SHIELD_MAX = 3;
    const MASTER_VOL = 0.5;

    const ROCK_R = { 3: 44, 2: 27, 1: 16 };
    const ROCK_SPD = { 3: [35, 65], 2: [55, 95], 1: [75, 125] };
    const ROCK_PTS = { 3: 10, 2: 20, 1: 30 };

    const PALETTE = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#55efc4'];
    const ROCK_COLORS = [
        { body: '#c3b8ff', edge: '#998ae8', crater: '#ab9df0' },
        { body: '#7fd8d2', edge: '#45b8af', crater: '#66c8c0' },
        { body: '#8ff3d3', edge: '#4fd6ab', crater: '#72e3bf' },
        { body: '#ffef9e', edge: '#e8ca4e', crater: '#f2df80' },
        { body: '#ffb3b3', edge: '#f28080', crater: '#ff9d9d' },
    ];
    const SHIELD_COLORS = { 3: '#55efc4', 2: '#ffe66d', 1: '#ff6b6b' };
    const FACE_INK = '#4a4458';

    // ── State ───────────────────────────────────────
    let W = 0, H = 0, u = 1;
    let state = 'menu';            // menu | playing | paused | dying | over
    let score = 0;
    let best = parseInt(localStorage.getItem('kidsGames.asteroids.best') || '0', 10) || 0;
    let wave = 1;
    let ship = null;
    let rocks = [];
    let bullets = [];
    let parts = [];
    let popups = [];
    let ufo = null;
    let starPickup = null;
    let pendingWave = false;
    let waveTimer = 0;
    let ufoTimer = -1;
    let dieT = 0;
    let nowT = 0;
    let lastShot = -9;
    let lastScoreShown = -1;
    let lastWaveShown = -1;
    let bannerTO = 0;
    let hintsShownThisLoad = false;
    let hintsTO1 = 0, hintsTO2 = 0;
    let starLayers = [];

    // input
    const keys = { left: false, right: false, up: false };
    let fireHeld = false;
    let joy = null;                 // {id, bx, by, dx, dy}
    const firePointers = new Set();

    const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // ── Helpers ─────────────────────────────────────
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function angDiff(d) { return ((d + Math.PI) % TAU + TAU) % TAU - Math.PI; }
    function rockRad(size) { return ROCK_R[size] * u; }
    function wrapObj(o, r) {
        if (o.x < -r) o.x += W + r * 2; else if (o.x > W + r) o.x -= W + r * 2;
        if (o.y < -r) o.y += H + r * 2; else if (o.y > H + r) o.y -= H + r * 2;
    }

    // ── Audio (WebAudio, synthesized) ───────────────
    let actx = null, master = null, thrustGain = null;
    let muted = localStorage.getItem('kidsGames.muted') === '1';

    function audioInit() {
        if (actx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try { actx = new AC(); } catch (e) { return; }
        master = actx.createGain();
        master.gain.value = muted ? 0 : MASTER_VOL;
        master.connect(actx.destination);
        // looping soft noise for the thruster
        const len = actx.sampleRate;
        const buf = actx.createBuffer(1, len, actx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = actx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filt = actx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 420;
        thrustGain = actx.createGain();
        thrustGain.gain.value = 0;
        src.connect(filt);
        filt.connect(thrustGain);
        thrustGain.connect(master);
        src.start();
    }

    function tone(f0, f1, dur, type, vol, delay) {
        if (!actx || muted) return;
        const t0 = actx.currentTime + (delay || 0);
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(Math.max(1, f0), t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(master);
        o.start(t0);
        o.stop(t0 + dur + 0.05);
    }

    function setThrustSound(level) {
        if (!actx || !thrustGain) return;
        thrustGain.gain.setTargetAtTime(muted ? 0 : level * 0.10, actx.currentTime, 0.06);
    }

    const sfxShoot = () => tone(700, 1050, 0.07, 'triangle', 0.10);
    const sfxPop = (size) => {
        const base = { 3: 240, 2: 340, 1: 470 }[size] || 340;
        tone(base, base * 0.55, 0.16, 'sine', 0.28);
        tone(base * 2.2, base * 1.3, 0.09, 'triangle', 0.09, 0.02);
    };
    const sfxBoing = () => tone(320, 110, 0.28, 'triangle', 0.3);
    const sfxWave = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'sine', 0.2, i * 0.09));
    const sfxSad = () => [392, 330, 262].forEach((f, i) => tone(f, f * 0.97, 0.24, 'sine', 0.18, i * 0.17));
    const sfxTwinkle = () => { tone(1318, 1568, 0.08, 'sine', 0.16); tone(1760, 2093, 0.1, 'sine', 0.14, 0.07); };
    const sfxUfo = () => [660, 880, 660].forEach((f, i) => tone(f, f, 0.07, 'triangle', 0.1, i * 0.08));

    function applyMuted() {
        soundBtn.textContent = muted ? '🔇' : '🔊';
        if (master) master.gain.value = muted ? 0 : MASTER_VOL;
        localStorage.setItem('kidsGames.muted', muted ? '1' : '0');
    }

    // ── Starfield ───────────────────────────────────
    const LAYERS = [
        { n: 38, size: 1.1, speed: 6, alpha: 0.5, par: 0.012 },
        { n: 26, size: 1.8, speed: 11, alpha: 0.72, par: 0.03 },
        { n: 14, size: 2.6, speed: 17, alpha: 0.95, par: 0.06 },
    ];

    function makeStars() {
        starLayers = LAYERS.map(cfg => {
            const arr = [];
            for (let i = 0; i < cfg.n; i++) {
                arr.push({ x: Math.random() * W, y: Math.random() * H, tw: Math.random() * TAU });
            }
            return { cfg, arr };
        });
    }

    function updateStars(dt) {
        for (const layer of starLayers) {
            for (const s of layer.arr) {
                s.y += layer.cfg.speed * dt;
                if (s.y > H + 4) { s.y = -4; s.x = Math.random() * W; }
            }
        }
    }

    // ── Entities ────────────────────────────────────
    function newShip() {
        return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, thrust: 0, shield: SHIELD_MAX, inv: 0, dead: false };
    }

    function newRock(x, y, size, ang, sp) {
        if (ang === undefined) ang = Math.random() * TAU;
        if (sp === undefined) {
            const boost = clamp(1 + 0.05 * (wave - 1), 1, 1.5);
            sp = rand(ROCK_SPD[size][0], ROCK_SPD[size][1]) * boost * u;
        }
        return {
            x, y, size,
            vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            rot: Math.random() * TAU, vr: rand(-0.7, 0.7),
            ci: Math.floor(Math.random() * ROCK_COLORS.length),
            ph: Math.random() * TAU,
            born: 0,
        };
    }

    function spawnRocks() {
        const count = Math.min(1 + wave, 6);
        for (let i = 0; i < count; i++) {
            let x = 0, y = 0, ok = false;
            for (let t = 0; t < 60 && !ok; t++) {
                x = Math.random() * W;
                y = Math.random() * H;
                ok = true;
                if (ship && Math.hypot(x - ship.x, y - ship.y) < 240 * u) ok = false;
                if (ok) {
                    for (const r of rocks) {
                        if (Math.hypot(x - r.x, y - r.y) < rockRad(3) * 2) { ok = false; break; }
                    }
                }
            }
            rocks.push(newRock(x, y, 3));
        }
    }

    function spawnMenuRocks() {
        rocks = [];
        for (const size of [3, 2, 2]) {
            const r = newRock(Math.random() * W, Math.random() * H, size);
            r.vx *= 0.5; r.vy *= 0.5;
            rocks.push(r);
        }
    }

    function scheduleUfo() {
        ufoTimer = rand(6, 15);
    }

    function spawnUfo() {
        const fromLeft = Math.random() < 0.5;
        ufo = {
            x: fromLeft ? -50 * u : W + 50 * u,
            y: H * rand(0.15, 0.55),
            vx: (fromLeft ? 1 : -1) * rand(70, 110) * u,
            t: 0,
        };
        sfxUfo();
    }

    // ── Particles / popups ──────────────────────────
    function addPart(p) { if (parts.length < 500) parts.push(p); }

    function confettiBurst(x, y, n) {
        for (let i = 0; i < n; i++) {
            const ang = Math.random() * TAU;
            const sp = rand(60, 280) * u;
            addPart({
                x, y,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 40 * u,
                rot: Math.random() * TAU, vr: rand(-9, 9),
                size: rand(5, 10) * u,
                color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
                life: rand(0.9, 1.7), maxLife: 1.7,
                shape: 'rect', grav: 150 * u, drag: 1.1,
            });
        }
    }

    function sparkleBurst(x, y, color, n, speedMax) {
        const sm = (speedMax || 190) * u;
        for (let i = 0; i < n; i++) {
            const ang = Math.random() * TAU;
            const sp = rand(30, sm);
            addPart({
                x, y,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                rot: 0, vr: 0,
                size: rand(2, 5) * u,
                color: Math.random() < 0.4 ? '#ffffff' : color,
                life: rand(0.35, 0.8), maxLife: 0.8,
                shape: 'dot', grav: 0, drag: 2.2,
            });
        }
    }

    function popup(x, y, txt, color) {
        popups.push({ x, y, txt, color: color || '#ffffff', t: 0, life: 0.9 });
    }

    function updateParticles(dt) {
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            p.life -= dt;
            if (p.life <= 0) { parts.splice(i, 1); continue; }
            const f = Math.exp(-p.drag * dt);
            p.vx *= f; p.vy *= f;
            p.vy += p.grav * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
        }
        for (let i = popups.length - 1; i >= 0; i--) {
            const p = popups[i];
            p.t += dt;
            if (p.t >= p.life) popups.splice(i, 1);
        }
    }

    // ── HUD ─────────────────────────────────────────
    function updateHud() {
        if (score !== lastScoreShown) { hudScore.textContent = score; lastScoreShown = score; }
        if (wave !== lastWaveShown) { hudWave.textContent = wave; lastWaveShown = wave; }
    }

    function updatePips() {
        const n = ship ? ship.shield : 0;
        const col = SHIELD_COLORS[n] || '#dfe6e9';
        pips.forEach((pip, i) => {
            const on = i < n;
            pip.classList.toggle('on', on);
            pip.style.background = on ? col : '#dfe6e9';
        });
    }

    function banner(txt) {
        bannerEl.textContent = txt;
        bannerEl.classList.remove('hidden');
        bannerEl.style.animation = 'none';
        void bannerEl.offsetWidth;
        bannerEl.style.animation = '';
        clearTimeout(bannerTO);
        bannerTO = setTimeout(() => bannerEl.classList.add('hidden'), 1800);
    }

    function showHints() {
        if (!hasTouch || hintsShownThisLoad) return;
        hintsShownThisLoad = true;
        hintsEl.classList.remove('hidden', 'fading');
        clearTimeout(hintsTO1);
        clearTimeout(hintsTO2);
        hintsTO1 = setTimeout(() => hintsEl.classList.add('fading'), 4000);
        hintsTO2 = setTimeout(() => hintsEl.classList.add('hidden'), 5200);
    }

    // ── Game flow ───────────────────────────────────
    function blurActive() {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    function clearInput() {
        joy = null;
        firePointers.clear();
        fireHeld = false;
        keys.left = keys.right = keys.up = false;
    }

    function startGame() {
        blurActive();
        score = 0;
        wave = 1;
        rocks = [];
        bullets = [];
        parts = [];
        popups = [];
        ufo = null;
        starPickup = null;
        ship = newShip();
        pendingWave = true;
        waveTimer = 1.0;
        ufoTimer = -1;
        dieT = 0;
        lastScoreShown = -1;
        lastWaveShown = -1;
        clearInput();
        state = 'playing';
        menuOverlay.classList.add('hidden');
        overOverlay.classList.add('hidden');
        pauseOverlay.classList.add('hidden');
        hudEl.classList.remove('hidden');
        pauseBtn.classList.remove('hidden');
        updateHud();
        updatePips();
        banner('Wave 1!');
        showHints();
    }

    function toMenu() {
        blurActive();
        state = 'menu';
        clearInput();
        setThrustSound(0);
        menuOverlay.classList.remove('hidden');
        overOverlay.classList.add('hidden');
        pauseOverlay.classList.add('hidden');
        hudEl.classList.add('hidden');
        pauseBtn.classList.add('hidden');
        hintsEl.classList.add('hidden');
        menuBest.textContent = 'Best: ' + best + ' ⭐';
        spawnMenuRocks();
    }

    function startDying() {
        state = 'dying';
        dieT = 0;
        ship.dead = true;
        setThrustSound(0);
        clearInput();
        sfxSad();
        sparkleBurst(ship.x, ship.y, '#ffb3b3', 26, 260);
        sparkleBurst(ship.x, ship.y, '#c3b8ff', 22, 200);
        confettiBurst(ship.x, ship.y, 14);
        popup(ship.x, ship.y - 40 * u, '💫');
    }

    function showOver() {
        state = 'over';
        const isNewBest = score > best;
        if (isNewBest) {
            best = score;
            localStorage.setItem('kidsGames.asteroids.best', String(best));
        }
        overScore.textContent = score;
        overBest.textContent = best;
        newBestEl.classList.toggle('hidden', !isNewBest);
        hudEl.classList.add('hidden');
        pauseBtn.classList.add('hidden');
        hintsEl.classList.add('hidden');
        overOverlay.classList.remove('hidden');
    }

    function setPaused(p) {
        if (p && state === 'playing') {
            state = 'paused';
            clearInput();
            setThrustSound(0);
            pauseOverlay.classList.remove('hidden');
        } else if (!p && state === 'paused') {
            blurActive();
            state = 'playing';
            pauseOverlay.classList.add('hidden');
        }
    }

    // ── Shooting ────────────────────────────────────
    function tryFire() {
        if (state !== 'playing' || !ship || ship.dead) return;
        if (nowT - lastShot < FIRE_COOLDOWN) return;
        lastShot = nowT;
        const nx = Math.cos(ship.a), ny = Math.sin(ship.a);
        bullets.push({
            x: ship.x + nx * 24 * u,
            y: ship.y + ny * 24 * u,
            vx: nx * BULLET_SPEED * u + ship.vx * 0.35,
            vy: ny * BULLET_SPEED * u + ship.vy * 0.35,
            life: BULLET_LIFE,
            rot: Math.random() * TAU,
        });
        sfxShoot();
    }

    // ── Scoring events ──────────────────────────────
    function popRock(j, cx, cy) {
        const r = rocks[j];
        rocks.splice(j, 1);
        const pts = ROCK_PTS[r.size];
        score += pts;
        popup(r.x, r.y, '+' + pts);
        sfxPop(r.size);
        sparkleBurst(r.x, r.y, ROCK_COLORS[r.ci].body, 10 + r.size * 7, 150 + r.size * 40);
        if (r.size > 1) {
            const base = Math.atan2(r.vy, r.vx);
            const psp = Math.hypot(r.vx, r.vy);
            for (const k of [-1, 1]) {
                const ang = base + k * rand(0.55, 1.1);
                const sp = psp * 1.12 + rand(18, 45) * u;
                rocks.push(newRock(r.x, r.y, r.size - 1, ang, sp));
            }
        }
        updateHud();
    }

    function popUfo() {
        score += 50;
        popup(ufo.x, ufo.y, '+50');
        sfxPop(2);
        sfxUfo();
        sparkleBurst(ufo.x, ufo.y, '#c3b8ff', 24, 220);
        starPickup = { x: ufo.x, y: ufo.y, vy: 26 * u, t: 0, life: 12 };
        ufo = null;
        updateHud();
    }

    function collectStar() {
        score += 100;
        popup(starPickup.x, starPickup.y, '+100', '#ffe66d');
        sfxTwinkle();
        confettiBurst(starPickup.x, starPickup.y, 26);
        starPickup = null;
        updateHud();
    }

    function shipHit(rock) {
        if (ship.shield > 0) {
            ship.shield--;
            updatePips();
            let nx = ship.x - rock.x, ny = ship.y - rock.y;
            const d = Math.hypot(nx, ny) || 1;
            nx /= d; ny /= d;
            ship.vx += nx * 270 * u;
            ship.vy += ny * 270 * u;
            rock.vx -= nx * 110 * u;
            rock.vy -= ny * 110 * u;
            ship.inv = 1.8;
            sfxBoing();
            sparkleBurst((ship.x + rock.x) / 2, (ship.y + rock.y) / 2, '#ffffff', 12, 160);
        } else {
            startDying();
        }
    }

    // ── Update ──────────────────────────────────────
    function handleShipControls(dt) {
        const s = ship;
        let thr = 0;
        if (joy) {
            const len = Math.hypot(joy.dx, joy.dy);
            if (len > 10) {
                const target = Math.atan2(joy.dy, joy.dx);
                const d = angDiff(target - s.a);
                s.a += clamp(d, -JOY_ROT_SPEED * dt, JOY_ROT_SPEED * dt);
                thr = clamp((len - 10) / (JOY_R - 10), 0, 1);
                if (Math.abs(d) > 2.1) thr *= 0.35; // ease off while turning around
            }
        } else {
            if (keys.left) s.a -= ROT_SPEED * dt;
            if (keys.right) s.a += ROT_SPEED * dt;
            thr = keys.up ? 1 : 0;
        }
        s.thrust = thr;
        setThrustSound(thr);
        if (thr > 0.05) {
            s.vx += Math.cos(s.a) * ACCEL * u * thr * dt;
            s.vy += Math.sin(s.a) * ACCEL * u * thr * dt;
            // flame puffs
            if (Math.random() < dt * 40 * thr) {
                const bx = s.x - Math.cos(s.a) * 22 * u;
                const by = s.y - Math.sin(s.a) * 22 * u;
                addPart({
                    x: bx + rand(-3, 3) * u, y: by + rand(-3, 3) * u,
                    vx: -Math.cos(s.a) * rand(50, 110) * u + s.vx * 0.5,
                    vy: -Math.sin(s.a) * rand(50, 110) * u + s.vy * 0.5,
                    rot: 0, vr: 0,
                    size: rand(2.5, 5) * u,
                    color: Math.random() < 0.5 ? '#ffe66d' : '#ffffff',
                    life: rand(0.2, 0.45), maxLife: 0.45,
                    shape: 'dot', grav: 0, drag: 2.5,
                });
            }
        }
        const f = Math.exp(-DRAG * dt);
        s.vx *= f; s.vy *= f;
        const sp = Math.hypot(s.vx, s.vy);
        const cap = MAX_SPEED * u;
        if (sp > cap) { s.vx *= cap / sp; s.vy *= cap / sp; }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        wrapObj(s, 20 * u);
        s.inv = Math.max(0, s.inv - dt);
    }

    function waveLogic(dt) {
        if (pendingWave) {
            waveTimer -= dt;
            if (waveTimer <= 0) {
                pendingWave = false;
                spawnRocks();
                scheduleUfo();
            }
            return;
        }
        if (rocks.length === 0) {
            wave++;
            updateHud();
            banner('Wave ' + wave + '!');
            sfxWave();
            confettiBurst(W / 2, H * 0.38, 90);
            ship.shield = SHIELD_MAX;
            updatePips();
            pendingWave = true;
            waveTimer = 1.6;
        }
    }

    function ufoLogic(dt) {
        if (!ufo && ufoTimer > 0) {
            ufoTimer -= dt;
            if (ufoTimer <= 0) spawnUfo();
        }
    }

    function moveEntities(dt) {
        for (const r of rocks) {
            r.x += r.vx * dt;
            r.y += r.vy * dt;
            r.rot += r.vr * dt;
            r.born += dt;
            wrapObj(r, rockRad(r.size));
        }
        if (state === 'menu') return;
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.life -= dt;
            if (b.life <= 0) { bullets.splice(i, 1); continue; }
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.rot += 10 * dt;
            wrapObj(b, 6 * u);
        }
        if (ufo) {
            ufo.t += dt;
            ufo.x += ufo.vx * dt;
            if (ufo.x < -70 * u || ufo.x > W + 70 * u) ufo = null;
        }
        if (starPickup) {
            starPickup.t += dt;
            starPickup.life -= dt;
            starPickup.y += starPickup.vy * dt;
            if (starPickup.y > H + 24 * u) starPickup.y = -24 * u;
            if (starPickup.life <= 0) starPickup = null;
        }
    }

    function collisions() {
        // bullets vs rocks / ufo
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            let hit = false;
            for (let j = rocks.length - 1; j >= 0; j--) {
                const r = rocks[j];
                const rr = rockRad(r.size) + 5 * u;
                const dx = b.x - r.x, dy = b.y - r.y;
                if (dx * dx + dy * dy < rr * rr) {
                    popRock(j, b.x, b.y);
                    hit = true;
                    break;
                }
            }
            if (!hit && ufo && Math.hypot(b.x - ufo.x, b.y - ufo.y) < 30 * u) {
                popUfo();
                hit = true;
            }
            if (hit) bullets.splice(i, 1);
        }
        if (!ship || ship.dead) return;
        // ship vs star
        if (starPickup && Math.hypot(ship.x - starPickup.x, ship.y - starPickup.y) < 36 * u) {
            collectStar();
        }
        // ship vs rocks
        if (ship.inv <= 0) {
            const hitR = (ship.shield > 0 ? 26 : 14) * u;
            for (const r of rocks) {
                const rr = rockRad(r.size) + hitR;
                const dx = ship.x - r.x, dy = ship.y - r.y;
                if (dx * dx + dy * dy < rr * rr) {
                    shipHit(r);
                    break;
                }
            }
        }
    }

    function update(dt) {
        updateStars(dt);
        if (state === 'playing') {
            handleShipControls(dt);
            if (fireHeld || firePointers.size > 0) tryFire();
            waveLogic(dt);
            ufoLogic(dt);
        }
        moveEntities(dt);
        if (state === 'playing') collisions();
        updateParticles(dt);
        if (state === 'dying') {
            dieT += dt;
            if (dieT > 1.1) showOver();
        }
    }

    // ── Drawing ─────────────────────────────────────
    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#241b4d');
        g.addColorStop(1, '#1b1440');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // soft nebulas
        let ng = ctx.createRadialGradient(W * 0.25, H * 0.3, 10, W * 0.25, H * 0.3, Math.min(W, H) * 0.45);
        ng.addColorStop(0, 'rgba(162,155,254,0.10)');
        ng.addColorStop(1, 'rgba(162,155,254,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, W, H);
        ng = ctx.createRadialGradient(W * 0.78, H * 0.72, 10, W * 0.78, H * 0.72, Math.min(W, H) * 0.4);
        ng.addColorStop(0, 'rgba(78,205,196,0.09)');
        ng.addColorStop(1, 'rgba(78,205,196,0)');
        ctx.fillStyle = ng;
        ctx.fillRect(0, 0, W, H);
    }

    function drawStars() {
        const svx = ship ? ship.vx : 0;
        const svy = ship ? ship.vy : 0;
        for (const layer of starLayers) {
            const c = layer.cfg;
            for (const s of layer.arr) {
                const tw = 0.55 + 0.45 * Math.sin(nowT * 2 + s.tw);
                ctx.globalAlpha = c.alpha * tw;
                ctx.fillStyle = '#ffffff';
                let x = s.x - svx * c.par, y = s.y - svy * c.par;
                if (x < 0) x += W; else if (x > W) x -= W;
                if (y < 0) y += H; else if (y > H) y -= H;
                ctx.beginPath();
                ctx.arc(x, y, c.size, 0, TAU);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawRock(r) {
        const rad = rockRad(r.size);
        const scaleIn = r.born < 0.25 ? 0.5 + 2 * r.born : 1;
        const c = ROCK_COLORS[r.ci];
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot);
        ctx.scale(scaleIn, scaleIn);
        // body
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, TAU);
        ctx.fillStyle = c.body;
        ctx.fill();
        ctx.lineWidth = Math.max(2, rad * 0.09);
        ctx.strokeStyle = c.edge;
        ctx.stroke();
        // craters
        ctx.fillStyle = c.crater;
        const craters = [
            [-0.45, -0.35, 0.18], [0.4, -0.5, 0.13], [0.55, 0.3, 0.16], [-0.2, 0.55, 0.12],
        ];
        for (const cr of craters) {
            ctx.beginPath();
            ctx.arc(cr[0] * rad, cr[1] * rad, cr[2] * rad, 0, TAU);
            ctx.fill();
        }
        // sleepy face
        ctx.strokeStyle = FACE_INK;
        ctx.lineWidth = Math.max(2, rad * 0.075);
        ctx.lineCap = 'round';
        for (const ex of [-0.3, 0.3]) {
            ctx.beginPath();
            ctx.arc(ex * rad, -0.02 * rad, rad * 0.15, Math.PI * 0.15, Math.PI * 0.85);
            ctx.stroke();
        }
        // snoring mouth
        ctx.fillStyle = FACE_INK;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(0, rad * 0.32, rad * 0.09, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        // blush
        ctx.fillStyle = 'rgba(255,130,150,0.35)';
        for (const bx of [-0.55, 0.55]) {
            ctx.beginPath();
            ctx.arc(bx * rad, rad * 0.16, rad * 0.13, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        // floating z z for big sleepy rocks
        if (r.size === 3) {
            const zf = (nowT + r.ph) % 2 / 2;
            ctx.globalAlpha = 0.5 * (1 - zf);
            ctx.fillStyle = '#ffffff';
            ctx.font = '600 ' + Math.round(rad * 0.34) + 'px Fredoka, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('z', r.x + rad * 0.75, r.y - rad * (0.75 + zf * 0.4));
            ctx.globalAlpha = 0.35 * (1 - zf);
            ctx.font = '600 ' + Math.round(rad * 0.24) + 'px Fredoka, sans-serif';
            ctx.fillText('z', r.x + rad * 1.0, r.y - rad * (1.0 + zf * 0.55));
            ctx.globalAlpha = 1;
        }
    }

    function drawShip() {
        const s = ship;
        if (!s || s.dead) return;
        const blink = s.inv > 0 ? (Math.sin(nowT * 22) > 0 ? 0.95 : 0.3) : 1;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.globalAlpha = blink;
        ctx.save();
        ctx.rotate(s.a + Math.PI / 2);
        // flame
        if (s.thrust > 0.05) {
            const fl = (0.75 + 0.25 * Math.sin(nowT * 40)) * (0.5 + 0.5 * s.thrust);
            ctx.fillStyle = '#ffe66d';
            ctx.beginPath();
            ctx.ellipse(0, 24 * u, 7 * u * fl, 13 * u * fl, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(0, 21 * u, 3.5 * u * fl, 7 * u * fl, 0, 0, TAU);
            ctx.fill();
        }
        // fins
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.moveTo(-9 * u, 2 * u);
        ctx.quadraticCurveTo(-19 * u, 12 * u, -15 * u, 20 * u);
        ctx.quadraticCurveTo(-11 * u, 17 * u, -8 * u, 15 * u);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(9 * u, 2 * u);
        ctx.quadraticCurveTo(19 * u, 12 * u, 15 * u, 20 * u);
        ctx.quadraticCurveTo(11 * u, 17 * u, 8 * u, 15 * u);
        ctx.closePath();
        ctx.fill();
        // body
        ctx.beginPath();
        ctx.moveTo(0, -26 * u);
        ctx.bezierCurveTo(12 * u, -18 * u, 13 * u, 0, 9 * u, 16 * u);
        ctx.lineTo(-9 * u, 16 * u);
        ctx.bezierCurveTo(-13 * u, 0, -12 * u, -18 * u, 0, -26 * u);
        ctx.closePath();
        ctx.fillStyle = '#ff6b6b';
        ctx.fill();
        // belly stripe
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(-9 * u, 12 * u, 18 * u, 5 * u, 3 * u);
        ctx.fill();
        // window
        ctx.beginPath();
        ctx.arc(0, -6 * u, 6.5 * u, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -6 * u, 4.5 * u, 0, TAU);
        ctx.fillStyle = '#bfe9ff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-1.5 * u, -7.5 * u, 1.5 * u, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
        // bubble shield
        if (s.shield > 0) {
            const col = SHIELD_COLORS[s.shield];
            const rr = 27 * u + Math.sin(nowT * 3) * 1.3 * u;
            ctx.beginPath();
            ctx.arc(0, 0, rr, 0, TAU);
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.12 * blink;
            ctx.fill();
            ctx.globalAlpha = 0.85 * blink;
            ctx.lineWidth = 3 * u;
            ctx.strokeStyle = col;
            ctx.stroke();
            // bubble highlight
            ctx.beginPath();
            ctx.arc(0, 0, rr - 4 * u, -Math.PI * 0.8, -Math.PI * 0.5);
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = 2 * u;
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawBullet(b) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rot);
        const r = 6 * u;
        ctx.fillStyle = '#ffe66d';
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(1.6 * u, -1.6 * u, r, 0);
        ctx.quadraticCurveTo(1.6 * u, 1.6 * u, 0, r);
        ctx.quadraticCurveTo(-1.6 * u, 1.6 * u, -r, 0);
        ctx.quadraticCurveTo(-1.6 * u, -1.6 * u, 0, -r);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 2 * u, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    function drawUfo() {
        if (!ufo) return;
        const bob = Math.sin(ufo.t * 2.4) * 8 * u;
        ctx.save();
        ctx.translate(ufo.x, ufo.y + bob);
        // dome
        ctx.beginPath();
        ctx.arc(0, -5 * u, 15 * u, Math.PI, 0);
        ctx.fillStyle = 'rgba(190,240,255,0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(-4 * u, -11 * u, 3 * u, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
        // body
        ctx.beginPath();
        ctx.ellipse(0, 0, 30 * u, 11 * u, 0, 0, TAU);
        ctx.fillStyle = '#d6cffb';
        ctx.fill();
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = '#a29bfe';
        ctx.stroke();
        // lights
        const lightCols = ['#ff6b6b', '#ffe66d', '#55efc4'];
        const active = Math.floor(nowT * 4) % 3;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc((i - 1) * 14 * u, 3 * u, 3.4 * u, 0, TAU);
            ctx.globalAlpha = i === active ? 1 : 0.35;
            ctx.fillStyle = lightCols[i];
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    function starPath(cx, cy, rOut, rIn, rot) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rr = i % 2 === 0 ? rOut : rIn;
            const a = rot + i * Math.PI / 5 - Math.PI / 2;
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    function drawStarPickup() {
        const st = starPickup;
        if (!st) return;
        const blinkOut = st.life < 3 ? (Math.sin(nowT * 12) > -0.3 ? 1 : 0.25) : 1;
        const pulse = 1 + 0.14 * Math.sin(st.t * 5);
        ctx.save();
        ctx.globalAlpha = blinkOut;
        ctx.shadowColor = '#ffe66d';
        ctx.shadowBlur = 18 * u;
        starPath(st.x, st.y, 15 * u * pulse, 6.5 * u * pulse, st.t * 0.8);
        ctx.fillStyle = '#ffe66d';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
    }

    function drawParticles() {
        for (const p of parts) {
            const a = clamp(p.life / p.maxLife, 0, 1);
            ctx.globalAlpha = a;
            ctx.fillStyle = p.color;
            if (p.shape === 'rect') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.5, p.size * a), 0, TAU);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawPopups() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const p of popups) {
            const k = p.t / p.life;
            ctx.globalAlpha = 1 - k;
            ctx.font = '700 ' + Math.round(19 * u) + 'px Fredoka, sans-serif';
            ctx.fillStyle = p.color;
            ctx.fillText(p.txt, p.x, p.y - k * 34 * u);
        }
        ctx.globalAlpha = 1;
    }

    function drawJoystick() {
        if (!joy || state !== 'playing') return;
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(joy.bx, joy.by, JOY_R, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(joy.bx + joy.dx, joy.by + joy.dy, 26, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    function render() {
        drawBackground();
        drawStars();
        drawStarPickup();
        drawUfo();
        for (const r of rocks) drawRock(r);
        for (const b of bullets) drawBullet(b);
        drawParticles();
        if (state !== 'menu') drawShip();
        drawPopups();
        drawJoystick();
    }

    // ── Main loop ───────────────────────────────────
    let lastTs = 0;
    function frame(ts) {
        requestAnimationFrame(frame);
        let dt = (ts - lastTs) / 1000;
        lastTs = ts;
        if (!(dt > 0)) dt = 0.016;
        dt = Math.min(dt, 0.05);
        if (state !== 'paused') {
            nowT += dt;
            update(dt);
        }
        render();
    }

    // ── Resize ──────────────────────────────────────
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        W = wrapEl.clientWidth;
        H = wrapEl.clientHeight;
        canvas.width = Math.max(1, Math.round(W * dpr));
        canvas.height = Math.max(1, Math.round(H * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        u = clamp(Math.min(W, H) / 720, 0.72, 1.2);
        makeStars();
        if (ship) { ship.x = clamp(ship.x, 0, W); ship.y = clamp(ship.y, 0, H); }
    }

    // ── Input: pointer ──────────────────────────────
    function canvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }

    canvas.addEventListener('pointerdown', (e) => {
        if (state !== 'playing') return;
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        const [x, y] = canvasPos(e);
        if (x < W / 2 && !joy) {
            joy = { id: e.pointerId, bx: x, by: y, dx: 0, dy: 0 };
        } else {
            firePointers.add(e.pointerId);
            tryFire();
        }
    });

    canvas.addEventListener('pointermove', (e) => {
        if (joy && e.pointerId === joy.id) {
            const [x, y] = canvasPos(e);
            let dx = x - joy.bx, dy = y - joy.by;
            const len = Math.hypot(dx, dy);
            if (len > JOY_R) { dx *= JOY_R / len; dy *= JOY_R / len; }
            joy.dx = dx;
            joy.dy = dy;
        }
    });

    function releasePointer(e) {
        if (joy && e.pointerId === joy.id) joy = null;
        firePointers.delete(e.pointerId);
    }
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    wrapEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // lazy audio init on any first tap
    document.addEventListener('pointerdown', () => {
        audioInit();
        if (actx && actx.state === 'suspended') actx.resume();
    }, true);

    // ── Input: keyboard ─────────────────────────────
    window.addEventListener('keydown', (e) => {
        const c = e.code;
        if (c === 'ArrowLeft' || c === 'KeyA') { keys.left = true; e.preventDefault(); }
        else if (c === 'ArrowRight' || c === 'KeyD') { keys.right = true; e.preventDefault(); }
        else if (c === 'ArrowUp' || c === 'KeyW') { keys.up = true; e.preventDefault(); }
        else if (c === 'Space') {
            e.preventDefault();
            if (state === 'playing') { fireHeld = true; tryFire(); }
        }
        else if (c === 'KeyP' || c === 'Escape') {
            if (state === 'playing') setPaused(true);
            else if (state === 'paused') setPaused(false);
        }
        else if (c === 'Enter') {
            if (state === 'menu' || state === 'over') startGame();
            else if (state === 'paused') setPaused(false);
        }
    });

    window.addEventListener('keyup', (e) => {
        const c = e.code;
        if (c === 'ArrowLeft' || c === 'KeyA') keys.left = false;
        else if (c === 'ArrowRight' || c === 'KeyD') keys.right = false;
        else if (c === 'ArrowUp' || c === 'KeyW') keys.up = false;
        else if (c === 'Space') fireHeld = false;
    });

    // ── Buttons ─────────────────────────────────────
    playBtn.addEventListener('click', startGame);
    retryBtn.addEventListener('click', startGame);
    restartBtn.addEventListener('click', startGame);
    overMenuBtn.addEventListener('click', toMenu);
    pauseMenuBtn.addEventListener('click', toMenu);
    resumeBtn.addEventListener('click', () => setPaused(false));
    pauseBtn.addEventListener('click', () => setPaused(true));
    soundBtn.addEventListener('click', () => {
        muted = !muted;
        applyMuted();
        if (!muted) tone(880, 880, 0.08, 'sine', 0.15);
    });

    // pause when the tab is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state === 'playing') setPaused(true);
    });

    window.addEventListener('resize', resize);

    // ── Init ────────────────────────────────────────
    applyMuted();
    menuBest.textContent = 'Best: ' + best + ' ⭐';
    resize();
    spawnMenuRocks();
    requestAnimationFrame(frame);
})();
