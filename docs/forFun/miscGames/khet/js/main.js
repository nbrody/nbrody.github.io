// Khet - Main Application
import { KhetGame, PLAYER, PIECE_TYPE } from './engine.js';
import { KhetRenderer } from './renderer.js';
import { AIClient } from './ai-client.js';

let game, renderer, aiClient;

let playerSide = PLAYER.SILVER; // Human plays silver by default
let aiThinking = false;
/** True while a human/AI move animation (piece + laser) is in flight. */
let moveInProgress = false;
/** Bumped on newGame so stale async move/AI completions are ignored. */
let playGeneration = 0;
let gameMode = 'vs-ai';         // 'vs-ai', 'vs-human'
let difficulty = 'medium';
const undoStack = [];           // serialized snapshots taken before each human move

// ========================
// Initialization
// ========================

function init() {
    game = new KhetGame();
    const canvas = document.getElementById('board');
    renderer = new KhetRenderer(canvas, game);

    difficulty = document.getElementById('difficulty')?.value || 'medium';

    // Spin up the AI worker (loads NN weights off-thread).
    const weightsUrl = new URL('data/khet_weights.json', window.location.href).href;
    aiClient = new AIClient(weightsUrl);
    aiClient.ready.then((loaded) => {
        if (loaded) {
            updateStatus('Your turn! Click a piece to select it.');
        } else {
            updateStatus('AI weights unavailable — try 2-player mode.');
        }
        maybeStartAITurn();
    });

    renderer.onClick(handleClick);

    // UI bindings
    document.getElementById('newGame')?.addEventListener('click', newGame);
    document.getElementById('undo')?.addEventListener('click', undoMove);
    document.getElementById('difficulty')?.addEventListener('change', (e) => {
        difficulty = e.target.value;
        updateStatus('AI difficulty: ' + difficulty);
    });
    document.getElementById('switchSides')?.addEventListener('click', switchSides);
    document.getElementById('modeSelect')?.addEventListener('change', (e) => {
        gameMode = e.target.value;
        newGame();
    });

    document.getElementById('rotateCCW')?.addEventListener('click', () => rotateSelected(-1));
    document.getElementById('rotateCW')?.addEventListener('click', () => rotateSelected(1));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'q' || e.key === 'Q') rotateSelected(-1);
        else if (e.key === 'e' || e.key === 'E') rotateSelected(1);
        else if (e.key === 'Escape') { renderer.clearSelection(); hideRotateControls(); }
        else if (e.key === 'n' || e.key === 'N') newGame();
        else if ((e.key === 'z' || e.key === 'Z') && !aiThinking && !moveInProgress) undoMove();
    });

    renderer.render();
    updateStatus('Click a piece to select it.');
    updateTurnIndicator();
    updateUndoButton();
}

// ========================
// Game Logic
// ========================

function isHumanTurn() {
    if (game.winner !== null || aiThinking || moveInProgress) return false;
    if (gameMode === 'vs-ai' && game.currentPlayer !== playerSide) return false;
    return true;
}

function handleClick(cell) {
    if (!cell || !isHumanTurn()) return;

    const { col, row } = cell;
    const piece = game.getAt(col, row);

    if (renderer.selectedPiece) {
        const validMoveTarget = renderer.validMoves.find(
            m => (m.type === 'move' || m.type === 'swap') && m.toCol === col && m.toRow === row
        );
        if (validMoveTarget) { executeMove(validMoveTarget); return; }

        // Click same piece → deselect
        if (renderer.selectedPiece.col === col && renderer.selectedPiece.row === row) {
            renderer.clearSelection();
            hideRotateControls();
            return;
        }
        // Click own piece → reselect
        if (piece && piece.player === game.currentPlayer) { selectPiece(col, row); return; }

        renderer.clearSelection();
        hideRotateControls();
        return;
    }

    if (piece && piece.player === game.currentPlayer) selectPiece(col, row);
}

function selectPiece(col, row) {
    const pieceMoves = game.getLegalMoves().filter(m => m.col === col && m.row === row);
    const movementMoves = pieceMoves.filter(m => m.type === 'move' || m.type === 'swap');
    const hasRotation = pieceMoves.some(m => m.type === 'rotate');

    renderer.setSelection(col, row, movementMoves);

    const piece = game.getAt(col, row);
    const name = piece.type.charAt(0).toUpperCase() + piece.type.slice(1);
    showRotateControls(name, hasRotation);

    if (piece.type === PIECE_TYPE.SPHINX) {
        updateStatus(`${name} selected — can only rotate.`);
    } else if (movementMoves.length > 0) {
        updateStatus(`${name} selected — click a highlighted square to move, or rotate.`);
    } else {
        updateStatus(`${name} selected — rotate only (no moves available).`);
    }
}

function showRotateControls(pieceName, canRotate) {
    const el = document.getElementById('rotateControls');
    const label = document.getElementById('selectedPieceLabel');
    if (el) {
        el.classList.remove('hidden');
        if (label) label.textContent = pieceName;
    }
    const ccw = document.getElementById('rotateCCW');
    const cw = document.getElementById('rotateCW');
    if (ccw) ccw.disabled = !canRotate;
    if (cw) cw.disabled = !canRotate;
}

function hideRotateControls() {
    document.getElementById('rotateControls')?.classList.add('hidden');
}

function rotateSelected(dir) {
    if (!renderer.selectedPiece || !isHumanTurn()) return;

    const { col, row } = renderer.selectedPiece;
    const moves = game.getLegalMoves();

    let rotateMove = moves.find(
        m => m.type === 'rotate' && m.col === col && m.row === row && m.dir === dir
    );
    if (!rotateMove) {
        rotateMove = moves.find(
            m => m.type === 'rotate' && m.col === col && m.row === row && m.toFacing !== undefined
        );
    }
    if (rotateMove) executeMove(rotateMove);
}

function moveSquares(move) {
    return {
        from: { col: move.col, row: move.row },
        to: { col: move.toCol ?? move.col, row: move.toRow ?? move.row },
    };
}

// ---- A full human action: animate piece, fire laser, then let the AI reply ----
async function executeMove(move) {
    if (moveInProgress || game.winner !== null) return;
    const gen = playGeneration;
    moveInProgress = true;

    // Snapshot so this whole round (human + AI reply) can be undone.
    undoStack.push(game.serialize());
    updateUndoButton();

    if (move.type === 'move' || move.type === 'swap') playSound('move');
    else playSound('rotate');

    renderer.clearSelection();
    hideRotateControls();

    try {
        await renderer.animatePiece(move);
        if (gen !== playGeneration) return;

        game.applyMove(move);
        renderer.setLastMove(moveSquares(move));

        const laserPromise = renderer.animateLaser();
        playSound('laser');
        await laserPromise;
        if (gen !== playGeneration) return;

        game.resolveLaserHit();
        renderer.render();

        if (checkGameOver()) return;

        updateTurnIndicator();
        await maybeStartAITurn(gen);
    } finally {
        if (gen === playGeneration) moveInProgress = false;
        updateUndoButton();
    }
}

async function maybeStartAITurn(expectedGen = playGeneration) {
    if (expectedGen !== playGeneration) return;
    if (gameMode !== 'vs-ai' || game.winner !== null) {
        if (game.winner === null) {
            const name = game.currentPlayer === PLAYER.SILVER ? 'Silver' : 'Red';
            updateStatus(`${name}'s turn`);
        }
        return;
    }
    if (game.currentPlayer === playerSide) {
        updateStatus('Your turn!');
        return;
    }

    aiThinking = true;
    updateUndoButton();
    showThinking(true);

    await aiClient.ready;
    if (expectedGen !== playGeneration) return;

    const move = await aiClient.chooseMove(game, difficulty, ({ iterations, total }) => {
        setThinkingProgress(iterations / total);
    });
    if (expectedGen !== playGeneration) return;

    if (move) {
        if (move.type === 'rotate') playSound('rotate'); else playSound('move');
        game.applyMove(move);
        renderer.setLastMove(moveSquares(move));
        const laserPromise = renderer.animateLaser();
        playSound('laser');
        await laserPromise;
        if (expectedGen !== playGeneration) return;
        game.resolveLaserHit();
        renderer.render();
    }

    if (expectedGen !== playGeneration) return;
    aiThinking = false;
    showThinking(false);
    updateUndoButton();

    if (checkGameOver()) return;
    updateStatus('Your turn!');
    updateTurnIndicator();
}

function checkGameOver() {
    if (game.winner === null) return false;
    playSound('win');
    const winnerName = game.winner === PLAYER.SILVER ? 'Silver' : 'Red';
    updateStatus(`🎉 ${winnerName} wins!`);
    updateTurnIndicator();
    showWinOverlay(winnerName);
    return true;
}

function undoMove() {
    if (aiThinking || moveInProgress || undoStack.length === 0) return;
    const snapshot = undoStack.pop();
    game = KhetGame.fromSerialized(snapshot);
    renderer.game = game;
    renderer.clearSelection();
    renderer.setLastMove(null);
    hideRotateControls();
    renderer.render();
    updateTurnIndicator();
    updateUndoButton();
    updateStatus('Move undone — your turn.');
}

// ========================
// Audio System
// ========================

let audioCtx = null;
function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    const ctx = getAudio();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'move') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'rotate') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    } else if (type === 'win') {
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'square';
            o.connect(g); g.connect(ctx.destination);
            o.frequency.setValueAtTime(freq, now + i * 0.1);
            g.gain.setValueAtTime(0.1, now + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
            o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.3);
        });
    }
}

// ========================
// UI Updates
// ========================

function updateStatus(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
}

function updateTurnIndicator() {
    const indicator = document.getElementById('turnIndicator');
    if (!indicator) return;
    if (game.winner !== null) {
        indicator.className = 'turn-indicator ' + (game.winner === PLAYER.SILVER ? 'silver' : 'red');
        indicator.textContent = (game.winner === PLAYER.SILVER ? 'Silver' : 'Red') + ' Wins!';
    } else {
        indicator.className = 'turn-indicator ' + (game.currentPlayer === PLAYER.SILVER ? 'silver' : 'red');
        indicator.textContent = (game.currentPlayer === PLAYER.SILVER ? 'Silver' : 'Red') + "'s Turn";
    }
}

function updateUndoButton() {
    const btn = document.getElementById('undo');
    if (btn) btn.disabled = aiThinking || moveInProgress || undoStack.length === 0;
}

function showThinking(on) {
    const el = document.getElementById('thinking');
    if (el) el.classList.toggle('visible', on);
    if (on) {
        setThinkingProgress(0);
        updateStatus('AI is thinking…');
    }
}

function setThinkingProgress(frac) {
    const bar = document.getElementById('thinkingBar');
    if (bar) bar.style.width = Math.round(Math.min(1, Math.max(0, frac)) * 100) + '%';
}

function showWinOverlay(winner) {
    const overlay = document.getElementById('winOverlay');
    const winText = document.getElementById('winText');
    if (overlay && winText) {
        winText.textContent = `${winner} Wins!`;
        overlay.classList.add('visible');
    }
}

function newGame() {
    document.getElementById('winOverlay')?.classList.remove('visible');

    // Invalidate any in-flight human/AI animation so it cannot mutate the
    // fresh board after applyMove / resolveLaserHit.
    playGeneration++;
    moveInProgress = false;
    aiThinking = false;

    game = new KhetGame();
    renderer.game = game;
    renderer.clearSelection();
    renderer.setLastMove(null);
    hideRotateControls();
    renderer.render();
    undoStack.length = 0;
    showThinking(false);

    updateTurnIndicator();
    updateUndoButton();

    maybeStartAITurn(playGeneration);
    if (isHumanTurn()) updateStatus('Your turn! Click a piece to select it.');
}

function switchSides() {
    playerSide = 1 - playerSide;
    updateStatus(`You are now playing as ${playerSide === PLAYER.SILVER ? 'Silver' : 'Red'}`);
    newGame();
}

// ========================
// Start
// ========================

document.addEventListener('DOMContentLoaded', init);
