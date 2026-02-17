/**
 * 🎸 Rockstar — Shared module
 * AudioContext, particles, screen navigation.
 * Exposes window.Rockstar for other modules.
 */

(function () {
    'use strict';

    // ── AudioContext Logic ──────────────────────
    let ctx = null;

    function updateAudioIndicator() {
        const icon = document.getElementById('sound-status-icon');
        const label = document.getElementById('sound-status-label');
        if (!ctx) return;

        if (ctx.state === 'running') {
            icon.textContent = '🔊';
            icon.classList.add('audio-active');
            if (label) label.textContent = 'Sound: Ready!';
        } else {
            icon.textContent = '🔇';
            icon.classList.remove('audio-active');
            if (label) label.textContent = 'Sound: Tap to start';
        }
    }

    async function ensureAudio() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            ctx.onstatechange = () => updateAudioIndicator();
        }
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        updateAudioIndicator();
        return ctx;
    }

    // Try to wake on any interaction
    ['click', 'touchstart', 'mousedown'].forEach(evt => {
        window.addEventListener(evt, () => {
            if (ctx && ctx.state === 'suspended') ensureAudio();
        }, { once: true });
    });

    // ── FX Canvas (particle bursts on hit) ──────────────────
    const fxCanvas = document.getElementById('fx-canvas');
    const fxCtx = fxCanvas.getContext('2d');
    const particles = [];

    function resizeFxCanvas() {
        fxCanvas.width = window.innerWidth * devicePixelRatio;
        fxCanvas.height = window.innerHeight * devicePixelRatio;
        fxCtx.scale(devicePixelRatio, devicePixelRatio);
    }
    window.addEventListener('resize', resizeFxCanvas);
    resizeFxCanvas();

    function spawnParticles(x, y, color) {
        const count = 18;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const speed = 2 + Math.random() * 4;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color,
                size: 4 + Math.random() * 6,
            });
        }
    }

    function tickParticles() {
        fxCtx.clearRect(0, 0, fxCanvas.width / devicePixelRatio, fxCanvas.height / devicePixelRatio);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;
            p.life -= 0.025;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            fxCtx.globalAlpha = p.life;
            fxCtx.fillStyle = p.color;
            fxCtx.beginPath();
            fxCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            fxCtx.fill();
        }
        fxCtx.globalAlpha = 1;
        requestAnimationFrame(tickParticles);
    }
    tickParticles();

    // ── Screen Navigation ───────────────────────────────────
    const screens = {};
    document.querySelectorAll('.screen').forEach(s => {
        screens[s.id.replace('-screen', '')] = s;
    });

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        if (screens[name]) screens[name].classList.add('active');
    }

    // Picker buttons
    document.querySelectorAll('.instrument-card').forEach(card => {
        card.addEventListener('click', () => {
            ensureAudio();
            showScreen(card.dataset.instrument);
        });
    });

    // Back buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => showScreen('picker'));
    });

    // Manual Sound initialization button
    const soundBtn = document.getElementById('sound-status-btn');
    if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ensureAudio().then(() => {
                if (ctx.state === 'running') {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.frequency.setTargetAtTime(440, ctx.currentTime, 0.01);
                    g.gain.setTargetAtTime(0.1, ctx.currentTime, 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
                    osc.connect(g).connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.1);
                }
            });
        });
    }

    // Synchronous ctx access (for scheduling — ensureAudio is async)
    function getCtx() { return ctx; }

    // ── Public API ──
    window.Rockstar = {
        ensureAudio,
        getCtx,
        spawnParticles,
        showScreen,
    };

})();
