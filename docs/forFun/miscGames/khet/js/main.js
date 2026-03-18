// Khet - Main Application
import { KhetGame, COLS, ROWS, PLAYER, PIECE_TYPE, DIR } from './engine.js';
import { KhetRenderer } from './renderer.js';
import { KhetAI } from './ai.js';
import { KhetNN } from './nn.js';

let game, renderer, ai, nn;

let playerSide = PLAYER.SILVER; // Human plays silver by default
let aiThinking = false;
let gameMode = 'vs-ai'; // 'vs-ai', 'vs-human'

// ========================
// Initialization
// ========================

function init() {
    game = new KhetGame();
    const canvas = document.getElementById('board');
    renderer = new KhetRenderer(canvas, game);

    const difficulty = document.getElementById('difficulty')?.value || 'medium';

    // Load neural network weights
    nn = new KhetNN();
    nn.loadWeights('data/khet_weights.json').then(loaded => {
        if (loaded) {
            updateStatus('Your turn! Click a piece to select it.');
        } else {
            updateStatus('AI unavailable — try 2-player mode.');
        }
        ai = new KhetAI(difficulty, nn);
    }).catch(() => {
        updateStatus('⚠️ Could not load neural network — AI unavailable.');
        ai = new KhetAI(difficulty, null);
    });

    // Create AI immediately (will be recreated when NN loads)
    ai = new KhetAI(difficulty, null);

    renderer.onClick(handleClick);

    // UI bindings
    document.getElementById('newGame')?.addEventListener('click', newGame);
    document.getElementById('difficulty')?.addEventListener('change', (e) => {
        ai = new KhetAI(e.target.value, nn);
        updateStatus('AI difficulty: ' + e.target.value);
    });
    document.getElementById('switchSides')?.addEventListener('click', switchSides);
    document.getElementById('modeSelect')?.addEventListener('change', (e) => {
        gameMode = e.target.value;
        newGame();
    });

    // Rotate buttons
    document.getElementById('rotateCCW')?.addEventListener('click', () => rotateSelected(-1));
    document.getElementById('rotateCW')?.addEventListener('click', () => rotateSelected(1));

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'q' || e.key === 'Q') {
            rotateSelected(-1);
        } else if (e.key === 'e' || e.key === 'E') {
            rotateSelected(1);
        } else if (e.key === 'Escape') {
            renderer.clearSelection();
            hideRotateControls();
        } else if (e.key === 'n' || e.key === 'N') {
            newGame();
        }
    });

    renderer.render();
    updateStatus('Click a piece to select it.');
    updateTurnIndicator();
}

// ========================
// Game Logic
// ========================

function handleClick(cell, event) {
    if (!cell) return;
    if (aiThinking || game.winner !== null) return;
    if (gameMode === 'vs-ai' && game.currentPlayer !== playerSide) return;

    const { col, row } = cell;
    const piece = game.getAt(col, row);

    if (renderer.selectedPiece) {
        // Check if clicking on a valid move target
        const validMoveTarget = renderer.validMoves.find(
            m => (m.type === 'move' || m.type === 'swap') && m.toCol === col && m.toRow === row
        );

        if (validMoveTarget) {
            executeMove(validMoveTarget);
            return;
        }

        // Check if clicking on the same piece (deselect)
        if (renderer.selectedPiece.col === col && renderer.selectedPiece.row === row) {
            renderer.clearSelection();
            hideRotateControls();
            return;
        }

        // Check if clicking on own piece (reselect)
        if (piece && piece.player === game.currentPlayer) {
            selectPiece(col, row);
            return;
        }

        renderer.clearSelection();
        hideRotateControls();
        return;
    }

    // Select a piece
    if (piece && piece.player === game.currentPlayer) {
        selectPiece(col, row);
    }
}

function selectPiece(col, row) {
    const moves = game.getLegalMoves();
    const pieceMoves = moves.filter(m => m.col === col && m.row === row);

    // Filter to show movement targets (not rotations in the valid moves display)
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
    const el = document.getElementById('rotateControls');
    if (el) el.classList.add('hidden');
}

// ========================
// Audio System
// ========================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'move') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'rotate') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    } else if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    } else if (type === 'win') {
        osc.type = 'square';
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'square';
            o.connect(g);
            g.connect(audioCtx.destination);
            o.frequency.setValueAtTime(freq, now + i * 0.1);
            g.gain.setValueAtTime(0.1, now + i * 0.1);
            g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
            o.start(now + i * 0.1);
            o.stop(now + i * 0.1 + 0.3);
        });
    }
}

function rotateSelected(dir) {
    if (!renderer.selectedPiece) return;
    if (aiThinking || game.winner !== null) return;
    if (gameMode === 'vs-ai' && game.currentPlayer !== playerSide) return;

    const { col, row } = renderer.selectedPiece;
    const moves = game.getLegalMoves();

    // Find a rotation move for this piece
    let rotateMove = moves.find(
        m => m.type === 'rotate' && m.col === col && m.row === row && m.dir === dir
    );

    // If no dir-based move, check for fixed facing moves (Sphinx)
    if (!rotateMove) {
        rotateMove = moves.find(
            m => m.type === 'rotate' && m.col === col && m.row === row && m.toFacing !== undefined
        );
    }

    if (rotateMove) {
        playSound('rotate');
        executeMove(rotateMove);
    }
}

async function executeMove(move) {
    if (move.type === 'move' || move.type === 'swap') {
        playSound('move');
    }
    renderer.clearSelection();
    hideRotateControls();

    // Animate the piece moving/rotating physically call this BEFORE applying to engine
    await renderer.animatePiece(move);

    game.applyMove(move);

    // Animate laser
    const laserPromise = renderer.animateLaser();
    playSound('laser');
    await laserPromise;

    game.resolveLaserHit();
    renderer.render();

    if (game.winner !== null) {
        playSound('win');
        const winnerName = game.winner === PLAYER.SILVER ? 'Silver' : 'Red';
        updateStatus(`🎉 ${winnerName} wins!`);
        updateTurnIndicator();
        showWinOverlay(winnerName);
        return;
    }

    updateTurnIndicator();

    // AI move
    if (gameMode === 'vs-ai' && game.currentPlayer !== playerSide) {
        aiThinking = true;
        updateStatus('AI is thinking...');

        // Small delay so the UI updates
        await new Promise(r => setTimeout(r, 100));

        const aiMove = ai.chooseMove(game);
        if (aiMove) {
            if (aiMove.type === 'move' || aiMove.type === 'swap') playSound('move');
            if (aiMove.type === 'rotate') playSound('rotate');

            game.applyMove(aiMove);
            const laserPromise = renderer.animateLaser();
            playSound('laser');
            await laserPromise;
            game.resolveLaserHit();
            renderer.render();

            if (game.winner !== null) {
                playSound('win');
                const winnerName = game.winner === PLAYER.SILVER ? 'Silver' : 'Red';
                updateStatus(`🎉 ${winnerName} wins!`);
                updateTurnIndicator();
                showWinOverlay(winnerName);
                aiThinking = false;
                return;
            }
        }

        aiThinking = false;
        updateStatus('Your turn!');
        updateTurnIndicator();
    } else {
        const playerName = game.currentPlayer === PLAYER.SILVER ? 'Silver' : 'Red';
        updateStatus(`${playerName}'s turn`);
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

function showWinOverlay(winner) {
    const overlay = document.getElementById('winOverlay');
    const winText = document.getElementById('winText');
    if (overlay && winText) {
        winText.textContent = `${winner} Wins!`;
        overlay.classList.add('visible');
    }
}

function newGame() {
    const overlay = document.getElementById('winOverlay');
    if (overlay) overlay.classList.remove('visible');

    game = new KhetGame();
    renderer.game = game;
    renderer.clearSelection();
    renderer.render();
    aiThinking = false;

    updateTurnIndicator();

    if (gameMode === 'vs-ai' && game.currentPlayer !== playerSide) {
        // AI goes first
        setTimeout(async () => {
            aiThinking = true;
            updateStatus('AI is thinking...');
            await new Promise(r => setTimeout(r, 100));

            const aiMove = ai.chooseMove(game);
            if (aiMove) {
                game.applyMove(aiMove);
                await renderer.animateLaser();
                game.resolveLaserHit();
                renderer.render();
            }
            aiThinking = false;
            updateStatus('Your turn!');
            updateTurnIndicator();
        }, 300);
    } else {
        updateStatus('Your turn! Click a piece to select it.');
    }
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
