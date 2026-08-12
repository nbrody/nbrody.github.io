/* Simon — watch the pattern, tap it back. One heart of mercy per game. */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const boardArea = $('board-area'), wheel = $('wheel');
    const pads = [...document.querySelectorAll('.pad')];
    const statusLine = $('status-line'), lifeChip = $('life-chip');
    const roundNum = $('round-num');
    const menuOverlay = $('menu-overlay'), endOverlay = $('end-overlay');
    const endTitle = $('end-title'), endStats = $('end-stats');
    const menuBest = $('menu-best');
    const confettiCanvas = $('confetti-canvas'), cctx = confettiCanvas.getContext('2d');

    const BEST_KEY = 'kidsGames.simon.best';
    const FREQS = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5

    let seq = [], inputPos = 0, round = 0;
    let accepting = false, playing = false, lifeUsed = false, gameOn = false;
    let timers = [];

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
        g.gain.linearRampToValueAtTime(vol || .25, t + .02);
        g.gain.exponentialRampToValueAtTime(.001, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + .05);
    }
    const sPad = i => tone(FREQS[i], .35, 'sine', .3);
    const sOops = () => { tone(196, .3, 'sine', .18); tone(147, .4, 'sine', .18, .18); };
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

    /* ── layout ── */
    function layout() {
        const s = Math.min(boardArea.clientWidth - 16, boardArea.clientHeight - 16, 440);
        wheel.style.setProperty('--wheel-s', Math.max(220, Math.floor(s)) + 'px');
    }
    addEventListener('resize', layout);
    layout();

    /* ── helpers ── */
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
    const stepTime = () => Math.max(350, 700 - (round - 1) * 35);

    function flashPad(i, dur) {
        pads[i].classList.add('lit');
        sPad(i);
        later(() => pads[i].classList.remove('lit'), dur);
    }

    function setStatus(txt) { statusLine.textContent = txt; }
    function updateLife() { lifeChip.classList.toggle('used', lifeUsed); lifeChip.textContent = lifeUsed ? '💔 Second chance used' : '❤️ Second chance ready'; }

    /* ── game flow ── */
    function startGame() {
        clearTimers();
        seq = []; round = 0; lifeUsed = false; gameOn = true;
        updateLife();
        menuOverlay.classList.remove('show');
        endOverlay.classList.remove('show');
        nextRound();
    }

    function nextRound() {
        round++;
        roundNum.textContent = round;
        seq.push(Math.floor(Math.random() * 4));
        if (round === 5 || round === 10 || round === 15) { burstConfetti(100); sWin(); }
        later(playback, 900);
    }

    function playback() {
        playing = true; accepting = false;
        setStatus('Watch… 👀');
        const st = stepTime();
        seq.forEach((p, i) => later(() => flashPad(p, st * .6), 400 + i * st));
        later(() => {
            playing = false; accepting = true; inputPos = 0;
            setStatus('Your turn! 👆');
        }, 400 + seq.length * st);
    }

    function onPad(i) {
        if (!gameOn || !accepting) return;
        flashPad(i, 250);
        if (seq[inputPos] === i) {
            inputPos++;
            if (inputPos === seq.length) {
                accepting = false;
                setStatus('Yes! 🎉');
                later(nextRound, 700);
            }
            return;
        }
        // wrong pad
        accepting = false;
        sOops();
        if (!lifeUsed) {
            lifeUsed = true;
            updateLife();
            setStatus('Almost! Watch again ❤️');
            later(playback, 1400);
        } else {
            gameOn = false;
            later(gameOver, 900);
        }
    }
    pads.forEach((pad, i) => pad.addEventListener('pointerdown', () => onPad(i)));

    function gameOver() {
        const reached = round;
        const best = +(localStorage.getItem(BEST_KEY) || 0);
        const isBest = reached > best;
        if (isBest) localStorage.setItem(BEST_KEY, reached);
        endTitle.textContent = reached >= 5 ? '🌟 Great memory!' : '💜 Good try!';
        endStats.innerHTML = 'You reached round <b>' + reached + '</b><br>' +
            (isBest ? '<span class="best">🏆 New best!</span>' : 'Best: <b>' + Math.max(best, reached) + '</b>');
        if (isBest && reached >= 3) { burstConfetti(120); sWin(); }
        endOverlay.classList.add('show');
    }

    function showMenu() {
        clearTimers();
        gameOn = false; accepting = false;
        const best = +(localStorage.getItem(BEST_KEY) || 0);
        menuBest.textContent = best > 0 ? best : '–';
        endOverlay.classList.remove('show');
        menuOverlay.classList.add('show');
    }

    $('play-btn').addEventListener('click', startGame);
    $('again-btn').addEventListener('click', startGame);
    $('menu-btn').addEventListener('click', showMenu);
    showMenu();
})();
