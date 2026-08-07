// game.js — state, input, solution autoplay, victory logic, HUD.
//
// The Game object is the single source of truth the renderer reads from.
// Moves multiply the current matrix by a generator; a move that inverts the
// previous one pops it from the history instead, so the recorded word is
// always freely reduced.

'use strict';

const Game = {
    current: LRMath.Mat2.identity(),
    history: [],            // labels of the freely reduced word so far
    graph: null,            // { nodes, byKey, edges } with cached relC per node
    signs: null,            // { left, up, right : {label, delta} }

    hasWon: false,
    started: false,

    isMoving: false,
    moveProgress: 0,        // eased 0..1 while a move animates
    lastMoveLabel: null,
    displayHeight: 0,       // smoothed altitude for the renderer

    get heightValue() { return this.displayHeight; }
};

(() => {

    const GEN = LRMath.GEN;
    const INV = LRMath.INVERSE_LABEL;
    const CYCLE = ['a', 'b', 'A', 'B'];

    let animDuration = 800;
    let animFrom = 0, animTo = 0, animStart = 0;
    let solutionIndex = 0;
    let autoplayTimer = null;

    const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    // ---------- graph ----------

    function rebuildGraph() {
        const ball = Cayley.build(Game.current, Cayley.DEPTH);
        const inv = Game.current.inverse();
        for (const node of ball.nodes) {
            node.relC = inv.mul(node.matrix).toComplex();
        }
        const edges = [];
        for (const node of ball.nodes) {
            for (const label of ['a', 'b']) {
                const neighbor = ball.byKey.get(node.matrix.mul(GEN[label]).key);
                if (neighbor) edges.push({ from: node, to: neighbor });
            }
        }
        Game.graph = { nodes: ball.nodes, byKey: ball.byKey, edges };
    }

    // ---------- relative moves & signposts ----------

    function getRelativeMoves() {
        const last = Game.history.length > 0 ? Game.history[Game.history.length - 1] : 'a';
        let idx = CYCLE.indexOf(last);
        if (idx === -1) idx = 0;
        return {
            left: CYCLE[(idx + 3) % 4],
            up: CYCLE[idx],
            right: CYCLE[(idx + 1) % 4]
        };
    }

    function updateSigns() {
        const rel = getRelativeMoves();
        const h = Game.current.height;
        const sign = label => {
            const m = Game.current.mul(GEN[label]);
            return { label, delta: m.height - h, targetKey: m.key };
        };
        Game.signs = { left: sign(rel.left), up: sign(rel.up), right: sign(rel.right) };
    }

    // ---------- HUD ----------

    function updateHUD() {
        const { e2, e3, entries } = Game.current.factored();
        const [a, b, c, d] = entries;

        let denom = '';
        if (e2 > 0) denom += e2 === 1 ? '2' : `2<sup>${e2}</sup>`;
        if (e3 > 0) denom += (denom ? '·' : '') + (e3 === 1 ? '3' : `3<sup>${e3}</sup>`);

        const fractionHTML = denom ? `
            <div style="display: inline-flex; flex-direction: column; align-items: center; margin-right: 8px;">
                <div style="font-size: 14px;">1</div>
                <div style="border-top: 2px solid currentColor; width: 100%; margin: 2px 0;"></div>
                <div style="font-size: 14px;">${denom}</div>
            </div>` : '';

        // Shrink the font as the integer entries grow so the box stays sane
        const maxLen = Math.max(a.length, b.length, c.length, d.length);
        const fontSize = Math.max(7, Math.min(14, Math.floor(112 / maxLen)));

        document.getElementById('matrix-display').innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; font-size: ${fontSize}px;">
                ${fractionHTML}
                <div style="font-size: 40px; line-height: 0.6;">(</div>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <div>${a}  ${b}</div>
                    <div>${c}  ${d}</div>
                </div>
                <div style="font-size: 40px; line-height: 0.6;">)</div>
            </div>`;

        document.getElementById('height-value').innerText = Game.current.height;
        document.getElementById('solution-progress').innerText = Game.history.length;

        const arrowInstr = document.getElementById('arrow-instructions');
        if (arrowInstr) arrowInstr.style.display = Game.history.length > 5 ? 'none' : 'inline';
    }

    // ---------- moves ----------

    function triggerMove(label) {
        if (Game.isMoving || Game.hasWon || !label) return false;

        const prevHeight = Game.current.height;
        Game.current = Game.current.mul(GEN[label]);

        // Free reduction: undoing the last move shortens the word
        const last = Game.history[Game.history.length - 1];
        if (last && label === INV[last]) Game.history.pop();
        else Game.history.push(label);

        rebuildGraph();
        updateSigns();
        updateHUD();
        checkVictory();

        // Animate the world sliding into the new frame
        Game.isMoving = true;
        Game.moveProgress = 0;
        Game.lastMoveLabel = label;
        animFrom = prevHeight;
        animTo = Game.current.height;
        animStart = performance.now();

        const tick = () => {
            const t = Math.min((performance.now() - animStart) / animDuration, 1);
            Game.moveProgress = easeInOut(t);
            Game.displayHeight = animFrom + (animTo - animFrom) * Game.moveProgress;
            if (t < 1 && Game.isMoving) {
                requestAnimationFrame(tick);
            } else {
                Game.isMoving = false;
                Game.moveProgress = 0;
                Game.displayHeight = Game.current.height;
            }
        };
        requestAnimationFrame(tick);
        return true;
    }

    function undoMove() {
        const last = Game.history[Game.history.length - 1];
        if (last) triggerMove(INV[last]);
    }

    function checkVictory() {
        if (Game.current.height === 0 && Game.history.length > 0 &&
            !Game.current.isPlusMinusIdentity()) {
            Game.hasWon = true;
            Render.resetVictoryScroll();
            const ui = document.getElementById('ui-layer');
            if (ui) ui.style.display = 'none';
        }
    }

    function restart() {
        if (autoplayTimer) {
            clearTimeout(autoplayTimer);
            autoplayTimer = null;
        }
        Game.current = LRMath.Mat2.identity();
        Game.history = [];
        Game.hasWon = false;
        Game.isMoving = false;
        Game.moveProgress = 0;
        Game.lastMoveLabel = null;
        Game.displayHeight = 0;
        solutionIndex = 0;
        animDuration = 800;
        rebuildGraph();
        updateSigns();
        updateHUD();
        const ui = document.getElementById('ui-layer');
        if (ui) ui.style.display = 'block';
    }

    // ---------- built-in solution ----------

    function playNextSolutionMove() {
        if (solutionIndex >= SOLUTION_WORD.length) return;
        if (triggerMove(SOLUTION_WORD[solutionIndex])) solutionIndex++;
    }

    function autoplaySolution() {
        restart();
        const delay = 12000 / SOLUTION_WORD.length;
        animDuration = delay * 0.9;

        const step = () => {
            autoplayTimer = null;
            if (Game.hasWon || solutionIndex >= SOLUTION_WORD.length) {
                animDuration = 800;
                return;
            }
            Game.isMoving = false; // pre-empt the running slide
            triggerMove(SOLUTION_WORD[solutionIndex]);
            solutionIndex++;
            if (!Game.hasWon) autoplayTimer = setTimeout(step, delay);
            else animDuration = 800;
        };
        step();
    }

    // ---------- input ----------

    function startIfNeeded() {
        if (Game.started) return false;
        Game.started = true;
        const title = document.getElementById('title-screen');
        if (title) title.style.display = 'none';
        return true;
    }

    document.addEventListener('keydown', e => {
        if (startIfNeeded()) return;

        if (e.key === 'r' || e.key === 'R') { restart(); return; }
        if (Game.isMoving || Game.hasWon) return;

        // WASD: absolute moves
        switch (e.key.toLowerCase()) {
            case 'd': triggerMove('a'); return;
            case 'a': triggerMove('A'); return;
            case 'w': triggerMove('b'); return;
            case 's': triggerMove('B'); return;
        }

        // Arrows: relative moves; down = undo
        const rel = getRelativeMoves();
        switch (e.key) {
            case 'ArrowLeft': triggerMove(rel.left); break;
            case 'ArrowUp': triggerMove(rel.up); break;
            case 'ArrowRight': triggerMove(rel.right); break;
            case 'ArrowDown': undoMove(); break;
            case 'p': case 'P': case ',': playNextSolutionMove(); break;
            case '!': autoplaySolution(); break;
        }
    });

    function handleMobile(action) {
        if (startIfNeeded()) return;
        if (action === 'autoplay') { autoplaySolution(); return; }
        if (Game.isMoving || Game.hasWon) return;
        if (action === 'undo') { undoMove(); return; }
        const rel = getRelativeMoves();
        if (action in rel) triggerMove(rel[action]);
    }

    // Talk-embed bridge: the MathFest deck forwards phone-remote commands
    // into this iframe as {type:'tutorial', cmd}. next steps the built-in
    // solution, prev undoes, reset restarts.
    window.addEventListener('message', e => {
        const d = e.data;
        if (!d || d.type !== 'tutorial') return;
        switch (d.cmd) {
            case 'next':
                if (startIfNeeded()) return;
                if (!Game.isMoving && !Game.hasWon) playNextSolutionMove();
                break;
            case 'prev':
                if (!Game.isMoving && !Game.hasWon) undoMove();
                break;
            case 'reset': restart(); break;
            case 'autoplay':
                startIfNeeded();
                autoplaySolution();
                break;
        }
    });

    function bindButton(id, action) {
        const el = document.getElementById(id);
        if (!el) return;
        const fire = e => { e.preventDefault(); handleMobile(action); };
        el.addEventListener('touchstart', fire);
        el.addEventListener('mousedown', fire);
    }

    bindButton('btn-up', 'up');
    bindButton('btn-left', 'left');
    bindButton('btn-right', 'right');
    bindButton('btn-down', 'undo');
    bindButton('mobile-autoplay-btn', 'autoplay');

    const title = document.getElementById('title-screen');
    if (title) {
        const begin = e => {
            if (!Game.started) {
                e.preventDefault();
                startIfNeeded();
            }
        };
        title.addEventListener('touchstart', begin);
        title.addEventListener('click', begin);
    }

    // ---------- boot ----------

    rebuildGraph();
    updateSigns();
    updateHUD();
    Render.start(Game);
})();
