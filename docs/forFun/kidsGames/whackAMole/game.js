/* Whack-a-Mole — bop hamsters, catch stars, avoid the skunk! */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const field = $('field'), boardArea = $('board-area');
    const scoreEl = $('score'), timeNum = $('time-num');
    const timerBar = $('timer-bar');
    const menuOverlay = $('menu-overlay'), endOverlay = $('end-overlay');
    const endTitle = $('end-title'), endStats = $('end-stats');
    const confettiCanvas = $('confetti-canvas'), cctx = confettiCanvas.getContext('2d');

    const MODES = {
        chill: { time: 60, gap0: 1300, gap1: 900, up0: 2000, up1: 1500, skunk: 0, star: .08, maxUp: 2 },
        normal: { time: 45, gap0: 950, gap1: 550, up0: 1500, up1: 1000, skunk: .12, star: .1, maxUp: 3 },
        speedy: { time: 45, gap0: 650, gap1: 380, up0: 1100, up1: 750, skunk: .15, star: .12, maxUp: 3 }
    };

    let mode = 'chill', cfg = MODES.chill;
    let score = 0, timeLeft = 0, running = false;
    let holes = [];          // {mound, critter, type, up, hideTimer}
    let timers = [], tickTimer = null;

    /* ── audio ── */
    let actx = null, master = null;
    let muted = localStorage.getItem('kidsGames.muted') === '1';
    const soundBtn = $('sound-btn');
    const updateSoundBtn = () => { soundBtn.textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : 1; };
    updateSoundBtn();
    soundBtn.addEventListener('click', () => {
        muted = !muted;
        localStorage.setItem('kidsGames.muted', muted ? '1' : '0');
        updateSoundBtn();
    });
    function ensureAudio() {
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            actx = new AC();
            master = actx.createGain();
            master.gain.value = muted ? 0 : 1;
            master.connect(actx.destination);
        }
        if (actx.state === 'suspended') actx.resume();
    }
    document.addEventListener('pointerdown', ensureAudio, { capture: true });
    function tone(freq, dur, type, vol, when) {
        if (!actx) return;
        const t = actx.currentTime + (when || 0);
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol || .25, t + .015);
        g.gain.exponentialRampToValueAtTime(.001, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + .05);
    }
    function boing(base) {
        if (!actx) return;
        const t = actx.currentTime;
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * 2.2, t + .12);
        g.gain.setValueAtTime(.3, t);
        g.gain.exponentialRampToValueAtTime(.001, t + .25);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + .3);
    }
    const sStar = () => { tone(880, .15, 'triangle', .25); tone(1320, .25, 'triangle', .25, .08); };
    const sSkunk = () => { tone(180, .25, 'sawtooth', .12); tone(150, .3, 'sawtooth', .1, .15); };
    const sWin = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, 'triangle', .25, i * .12));

    /* ── confetti ── */
    let confetti = [], confettiRunning = false;
    const CCOLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#55efc4'];
    function burstConfetti(n) {
        confettiCanvas.width = innerWidth;
        confettiCanvas.height = innerHeight;
        for (let i = 0; i < n; i++) {
            confetti.push({
                x: innerWidth / 2 + (Math.random() - .5) * 200,
                y: innerHeight * .35,
                vx: (Math.random() - .5) * 600,
                vy: -Math.random() * 500 - 100,
                r: 4 + Math.random() * 6,
                c: CCOLORS[i % CCOLORS.length],
                a: Math.random() * Math.PI,
                va: (Math.random() - .5) * 10
            });
        }
        if (!confettiRunning) { confettiRunning = true; let last = performance.now(); requestAnimationFrame(function step(now) {
            const dt = Math.min(.05, (now - last) / 1000); last = now;
            cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            confetti.forEach(p => {
                p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
            });
            confetti = confetti.filter(p => p.y < innerHeight + 30);
            confetti.forEach(p => {
                cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.a);
                cctx.fillStyle = p.c; cctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); cctx.restore();
            });
            if (confetti.length) requestAnimationFrame(step);
            else { confettiRunning = false; cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
        }); }
    }

    /* ── pickers ── */
    (function wireModePicker() {
        const el = $('mode-picker');
        el.addEventListener('click', e => {
            const btn = e.target.closest('.pick-btn');
            if (!btn) return;
            el.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            mode = btn.dataset.mode;
            boing(300);
        });
        el.querySelector('.pick-btn').classList.add('selected');
    })();

    /* ── board ── */
    for (let i = 0; i < 9; i++) {
        const m = document.createElement('div');
        m.className = 'mound';
        m.innerHTML = '<div class="hole"><div class="critter">🐹</div></div><div class="rim"></div>';
        field.appendChild(m);
        const h = { mound: m, critter: m.querySelector('.critter'), type: null, up: false, hideTimer: null };
        m.addEventListener('pointerdown', e => onBop(h, e));
        holes.push(h);
    }

    function layout() {
        const w = Math.min((boardArea.clientWidth - 24) / 3.35, (boardArea.clientHeight - 24) / 2.8, 150);
        field.style.setProperty('--hole-w', Math.max(80, Math.floor(w)) + 'px');
    }
    addEventListener('resize', layout);
    layout();

    /* ── particles ── */
    function starBurst(x, y, glyph) {
        for (let i = 0; i < 6; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.textContent = glyph;
            const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 50;
            p.style.left = x + 'px'; p.style.top = y + 'px';
            p.style.setProperty('--dx', Math.cos(a) * d + 'px');
            p.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 650);
        }
    }

    /* ── critters ── */
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const progress = () => 1 - timeLeft / cfg.time;   // 0 → 1 over the round
    const lerp = (a, b, k) => a + (b - a) * k;

    function popUp() {
        const free = holes.filter(h => !h.up);
        const upCount = holes.length - free.length;
        const maxUp = progress() > .5 ? cfg.maxUp : Math.min(2, cfg.maxUp);
        if (free.length && upCount < maxUp) {
            const h = free[Math.floor(Math.random() * free.length)];
            const r = Math.random();
            h.type = (r < cfg.star) ? 'star' : (r < cfg.star + cfg.skunk) ? 'skunk' : 'ham';
            h.critter.textContent = { ham: '🐹', star: '⭐', skunk: '🦨' }[h.type];
            h.critter.classList.remove('bopped');
            h.critter.classList.add('up');
            h.up = true;
            const upDur = h.type === 'star' ? lerp(cfg.up0, cfg.up1, progress()) * .6
                : lerp(cfg.up0, cfg.up1, progress());
            h.hideTimer = later(() => hide(h), upDur);
        }
        if (running) later(popUp, lerp(cfg.gap0, cfg.gap1, progress()) * (.7 + Math.random() * .6));
    }

    function hide(h) {
        h.up = false;
        h.critter.classList.remove('up');
        clearTimeout(h.hideTimer);
    }

    function onBop(h, e) {
        if (!running || !h.up) return;
        const type = h.type;
        h.up = false;
        clearTimeout(h.hideTimer);
        const r = h.critter.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (type === 'skunk') {
            score = Math.max(0, score - 1);
            h.critter.textContent = '🤭';
            sSkunk();
            starBurst(cx, cy, '💨');
        } else {
            score += type === 'star' ? 3 : 1;
            h.critter.textContent = '😵';
            if (type === 'star') sStar();
            else boing(180 + Math.random() * 140);
            starBurst(cx, cy, type === 'star' ? '✨' : '⭐');
        }
        scoreEl.textContent = score;
        h.critter.classList.remove('up');
        h.critter.classList.add('bopped');
    }

    /* ── timer / flow ── */
    function tick() {
        timeLeft -= .25;
        if (timeLeft <= 0) { timeLeft = 0; endGame(); }
        timeNum.textContent = Math.ceil(timeLeft);
        timerBar.style.width = (timeLeft / cfg.time * 100) + '%';
        timerBar.classList.toggle('low', timeLeft <= 10);
    }

    function startGame() {
        cfg = MODES[mode];
        score = 0; timeLeft = cfg.time; running = true;
        scoreEl.textContent = '0';
        timeNum.textContent = cfg.time;
        timerBar.style.width = '100%';
        timerBar.classList.remove('low');
        holes.forEach(h => { hide(h); h.critter.classList.remove('bopped'); });
        menuOverlay.classList.remove('show');
        endOverlay.classList.remove('show');
        layout();
        later(popUp, 700);
        tickTimer = setInterval(tick, 250);
    }

    function stopAll() {
        running = false;
        timers.forEach(clearTimeout);
        timers = [];
        clearInterval(tickTimer);
        holes.forEach(hide);
    }

    function endGame() {
        stopAll();
        const key = 'kidsGames.whackAMole.best.' + mode;
        const best = +(localStorage.getItem(key) || 0);
        const isBest = score > best;
        if (isBest) localStorage.setItem(key, score);
        endTitle.textContent = '⏰ Time\'s up!';
        endStats.innerHTML = 'Score: <b>' + score + '</b><br>' +
            (isBest ? '<span class="best">🏆 New record!</span>' : 'Best: <b>' + Math.max(best, score) + '</b>');
        if (isBest && score > 0) { burstConfetti(130); sWin(); }
        endOverlay.classList.add('show');
    }

    $('play-btn').addEventListener('click', startGame);
    $('again-btn').addEventListener('click', startGame);
    $('menu-btn').addEventListener('click', () => {
        endOverlay.classList.remove('show');
        menuOverlay.classList.add('show');
    });
})();
