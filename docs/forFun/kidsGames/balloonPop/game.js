/* Balloon Pop — tap balloons; free pop, numbers & letters modes */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
    const menuOverlay = $('menu-overlay');
    const popChip = $('pop-chip'), popCountEl = $('pop-count');
    const targetChip = $('target-chip'), targetLabel = $('target-label');
    const backBtn = $('back-btn');

    let W = 0, H = 0, dpr = 1;
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = canvas.clientWidth; H = canvas.clientHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', resize);

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
    const sPop = pitch => { tone(pitch, .1, 'square', .18); tone(pitch * 2, .08, 'sine', .12, .02); };
    const sBoing = () => { tone(180, .18, 'sine', .2); tone(140, .22, 'sine', .15, .06); };
    const sYay = () => [523, 659, 784].forEach((f, i) => tone(f, .25, 'triangle', .22, i * .1));

    /* ── speech ── */
    function speak(text) {
        if (muted || !('speechSynthesis' in window)) return;
        try {
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = .9; u.pitch = 1.2;
            speechSynthesis.speak(u);
        } catch (e) { /* no-op */ }
    }

    /* ── state ── */
    const HUES = [350, 20, 45, 130, 190, 260, 300];
    let mode = 'free', running = false;
    let balloons = [], particles = [], clouds = [];
    let pops = 0, target = null, cascade = 0, cascadeTimer = 0;

    function labelPool() {
        if (mode === 'numbers') return Array.from({ length: 10 }, (_, i) => String(i + 1));
        if (mode === 'letters') return Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
        return null;
    }

    function newTarget() {
        const pool = labelPool();
        let t = pool[Math.floor(Math.random() * pool.length)];
        if (t === target && pool.length > 1) t = pool[(pool.indexOf(t) + 1) % pool.length];
        target = t;
        targetLabel.textContent = target;
        speak('Pop the ' + target + '!');
    }

    function spawnBalloon(label) {
        const r = 34 + Math.random() * 26;
        const pool = labelPool();
        const b = {
            x: r + Math.random() * (W - 2 * r),
            y: H + r + 20,
            r,
            hue: HUES[Math.floor(Math.random() * HUES.length)],
            vy: 40 + Math.random() * 45,
            phase: Math.random() * Math.PI * 2,
            amp: 12 + Math.random() * 18,
            wobble: 0,
            rainbow: false,
            label: label !== undefined ? label : (pool ? pool[Math.floor(Math.random() * pool.length)] : null)
        };
        // free mode: occasional rainbow balloon
        if (!pool && pops > 4 && !balloons.some(x => x.rainbow) && Math.random() < .08) {
            b.rainbow = true; b.label = '🌈'; b.r = 46;
        }
        balloons.push(b);
    }

    function ensureTargetOnScreen() {
        if (!target) return;
        if (!balloons.some(b => b.label === target && b.y > -b.r)) spawnBalloon(target);
    }

    function popBalloon(b, pitchBoost) {
        balloons.splice(balloons.indexOf(b), 1);
        sPop(240 + (70 - b.r) * 8 + (pitchBoost || 0));
        for (let i = 0; i < 22; i++) {
            const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
            particles.push({
                x: b.x, y: b.y,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
                life: .7 + Math.random() * .4,
                c: b.rainbow ? `hsl(${Math.random() * 360},85%,60%)` : `hsl(${b.hue},80%,${55 + Math.random() * 20}%)`,
                r: 3 + Math.random() * 4
            });
        }
    }

    /* ── input ── */
    canvas.addEventListener('pointerdown', e => {
        if (!running || cascade > 0) return;
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        let hit = null, best = Infinity;
        for (const b of balloons) {
            const sway = Math.sin(b.phase) * b.amp;
            const d = Math.hypot(px - (b.x + sway), py - b.y);
            if (d < b.r + 30 && d < best) { best = d; hit = b; }
        }
        if (!hit) return;
        if (target && hit.label !== target) {
            hit.wobble = .5;
            sBoing();
            return;
        }
        if (hit.rainbow) {
            popBalloon(hit);
            cascade = 1; cascadeTimer = 0;
            return;
        }
        popBalloon(hit);
        pops++;
        popCountEl.textContent = pops;
        if (target) { sYay(); setTimeout(newTarget, 600); }
    });
    $('say-btn').addEventListener('click', () => { if (target) speak('Pop the ' + target + '!'); });

    /* ── drawing ── */
    function drawBalloon(b) {
        const sway = Math.sin(b.phase) * b.amp;
        const wob = b.wobble > 0 ? Math.sin(b.wobble * 40) * 6 * b.wobble : 0;
        const x = b.x + sway + wob, y = b.y, r = b.r;
        ctx.save();
        // string
        ctx.strokeStyle = 'rgba(45,52,54,.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + r * 1.18);
        ctx.bezierCurveTo(x + 8, y + r * 1.6, x - 8, y + r * 2, x + Math.sin(b.phase * 1.3) * 10, y + r * 2.4);
        ctx.stroke();
        // body
        const grad = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r * 1.15);
        if (b.rainbow) {
            grad.addColorStop(0, '#fff');
            grad.addColorStop(.3, '#ffd93d');
            grad.addColorStop(.55, '#6bff8f');
            grad.addColorStop(.78, '#5ec8ff');
            grad.addColorStop(1, '#c86bff');
        } else {
            grad.addColorStop(0, `hsl(${b.hue},90%,82%)`);
            grad.addColorStop(.5, `hsl(${b.hue},80%,62%)`);
            grad.addColorStop(1, `hsl(${b.hue},75%,48%)`);
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(x, y, r * .88, r, 0, 0, Math.PI * 2);
        ctx.fill();
        // shine
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath();
        ctx.ellipse(x - r * .32, y - r * .38, r * .18, r * .28, -.5, 0, Math.PI * 2);
        ctx.fill();
        // knot
        ctx.fillStyle = b.rainbow ? '#c86bff' : `hsl(${b.hue},75%,45%)`;
        ctx.beginPath();
        ctx.moveTo(x, y + r * .98);
        ctx.lineTo(x - r * .14, y + r * 1.2);
        ctx.lineTo(x + r * .14, y + r * 1.2);
        ctx.closePath();
        ctx.fill();
        // label
        if (b.label) {
            ctx.fillStyle = '#fff';
            ctx.font = `700 ${Math.round(r * .8)}px Fredoka, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (!b.rainbow) {
                ctx.shadowColor = 'rgba(45,52,54,.4)';
                ctx.shadowBlur = 4;
            }
            ctx.fillText(b.label, x, y + 2);
        }
        ctx.restore();
    }

    function drawCloud(c) {
        ctx.fillStyle = `rgba(255,255,255,${c.o})`;
        for (const [dx, dy, cr] of [[0, 0, 1], [.8, .15, .7], [-.8, .15, .7], [.35, -.3, .75], [-.4, -.25, .65]]) {
            ctx.beginPath();
            ctx.arc(c.x + dx * c.r, c.y + dy * c.r, c.r * cr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /* ── loop ── */
    let last = performance.now();
    function step(now) {
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        ctx.clearRect(0, 0, W, H);

        for (const c of clouds) {
            c.x += c.v * dt;
            if (c.x - c.r * 2 > W) { c.x = -c.r * 2; c.y = 30 + Math.random() * H * .4; }
            drawCloud(c);
        }

        if (running) {
            // cascade pop (rainbow): pop everything one by one, rising pitch
            if (cascade > 0) {
                cascadeTimer -= dt;
                if (cascadeTimer <= 0) {
                    if (balloons.length) {
                        popBalloon(balloons[0], cascade * 60);
                        pops++;
                        popCountEl.textContent = pops;
                        cascade++;
                        cascadeTimer = .13;
                    } else {
                        cascade = 0;
                        sYay();
                    }
                }
            }
            const want = 6 + Math.floor(Math.random() * 2);
            if (balloons.length < want && cascade === 0) spawnBalloon();
            if (cascade === 0) ensureTargetOnScreen();
            for (const b of balloons) {
                b.y -= b.vy * dt;
                b.phase += dt * (1 + 40 / b.r);
                if (b.wobble > 0) b.wobble = Math.max(0, b.wobble - dt);
            }
            balloons = balloons.filter(b => b.y > -b.r * 2.6);
        }

        for (const b of balloons) drawBalloon(b);

        for (const p of particles) {
            p.vy += 500 * dt;
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.life -= dt;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.c;
            ctx.fillRect(p.x - p.r, p.y - p.r * .6, p.r * 2, p.r * 1.2);
        }
        ctx.globalAlpha = 1;
        particles = particles.filter(p => p.life > 0);

        requestAnimationFrame(step);
    }

    /* ── menu wiring ── */
    const modePicker = $('mode-picker');
    modePicker.addEventListener('click', e => {
        const btn = e.target.closest('.pick-btn');
        if (!btn) return;
        modePicker.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        mode = btn.dataset.mode;
        tone(520, .1, 'triangle', .15);
    });
    modePicker.querySelector('.pick-btn').classList.add('selected');

    $('play-btn').addEventListener('click', () => {
        balloons = []; particles = [];
        pops = 0; target = null; cascade = 0;
        popCountEl.textContent = '0';
        popChip.hidden = mode !== 'free';
        targetChip.hidden = mode === 'free';
        menuOverlay.classList.remove('show');
        backBtn.hidden = false;
        running = true;
        if (mode !== 'free') setTimeout(newTarget, 400);
    });

    backBtn.addEventListener('click', () => {
        running = false;
        target = null;
        balloons = [];
        popChip.hidden = true;
        targetChip.hidden = true;
        backBtn.hidden = true;
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        menuOverlay.classList.add('show');
    });

    /* ── init ── */
    resize();
    clouds = Array.from({ length: 4 }, () => ({
        x: Math.random() * W,
        y: 30 + Math.random() * H * .4,
        r: 28 + Math.random() * 30,
        v: 8 + Math.random() * 14,
        o: .5 + Math.random() * .3
    }));
    requestAnimationFrame(step);
})();
