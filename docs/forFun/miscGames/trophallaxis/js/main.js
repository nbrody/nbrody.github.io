/* ============================================================
   TROPHALLAXIS — boot, input, the loop
   ============================================================ */

(function () {
    const canvas = document.getElementById('screen');
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const game = new Game(canvas);
    window.__troph = game; // handy for poking at it from the console

    const input = { up: false, down: false, left: false, right: false, action: false, reverse: false };
    const held = new Set();

    const KEYMAP = {
        ArrowUp: 'up', KeyW: 'up',
        ArrowDown: 'down', KeyS: 'down',
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        Space: 'action', KeyZ: 'action', KeyK: 'action', KeyJ: 'action',
        ShiftLeft: 'reverse', ShiftRight: 'reverse', KeyX: 'reverse', KeyL: 'reverse',
    };

    function confirmPress() {
        Chip.unlock();
        if (game.state === 'title') {
            game.newGame();
            return true;
        }
        if (game.state === 'gameover' && game.overT > 0.8) {
            game.newGame();
            return true;
        }
        return false;
    }

    window.addEventListener('keydown', (e) => {
        if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
        const slot = KEYMAP[e.code];
        if (slot) {
            e.preventDefault();
            held.add(e.code);
            input[slot] = true;
            if (slot === 'action') confirmPress();
        }
        if (e.code === 'KeyP' || e.code === 'Escape') {
            if (game.state === 'play') {
                game.paused = !game.paused;
                if (game.paused) Chip.stopMusic(); else Chip.startMusic(120 + game.wave * 6);
            }
        }
        if (e.code === 'KeyM') {
            const muted = Chip.toggleMute();
            const btn = document.getElementById('mute');
            if (btn) btn.textContent = muted ? '🔇 sound off' : '🔊 sound on';
        }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
        const slot = KEYMAP[e.code];
        if (!slot) return;
        held.delete(e.code);
        // another key may still be holding this slot down
        input[slot] = [...held].some(c => KEYMAP[c] === slot);
    });

    window.addEventListener('blur', () => {
        for (const k in input) input[k] = false;
        held.clear();
    });

    /* ---- touch pad ---- */
    function bindTouch(id, slot) {
        const el = document.getElementById(id);
        if (!el) return;
        const on = (e) => { e.preventDefault(); Chip.unlock(); input[slot] = true; el.classList.add('down'); if (slot === 'action') confirmPress(); };
        const off = (e) => { e.preventDefault(); input[slot] = false; el.classList.remove('down'); };
        el.addEventListener('pointerdown', on);
        el.addEventListener('pointerup', off);
        el.addEventListener('pointercancel', off);
        el.addEventListener('pointerleave', off);
        el.addEventListener('contextmenu', e => e.preventDefault());
    }
    bindTouch('pad-up', 'up'); bindTouch('pad-down', 'down');
    bindTouch('pad-left', 'left'); bindTouch('pad-right', 'right');
    bindTouch('btn-a', 'action'); bindTouch('btn-b', 'reverse');

    canvas.addEventListener('pointerdown', () => { Chip.unlock(); confirmPress(); });

    const muteBtn = document.getElementById('mute');
    if (muteBtn) {
        muteBtn.textContent = Chip.isMuted() ? '🔇 sound off' : '🔊 sound on';
        muteBtn.addEventListener('click', () => {
            const muted = Chip.toggleMute();
            muteBtn.textContent = muted ? '🔇 sound off' : '🔊 sound on';
        });
    }

    /* ---- integer-scale the cabinet screen ---- */
    function fit() {
        const wrap = canvas.parentElement;
        const availW = wrap.clientWidth;
        const availH = Math.max(240, window.innerHeight - 200);
        let s = Math.min(availW / SCREEN_W, availH / SCREEN_H);
        s = Math.max(1, Math.floor(s * 2) / 2); // half steps still land on whole pixels at 2x dpr
        canvas.style.width = (SCREEN_W * s) + 'px';
        canvas.style.height = (SCREEN_H * s) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();

    /* ---- main loop ---- */
    let last = performance.now();
    function frame(now) {
        let dt = (now - last) / 1000;
        last = now;
        if (dt > 0.06) dt = 0.06;   // a tab switch must not teleport the ants
        game.update(dt, input);
        game.render();
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();
