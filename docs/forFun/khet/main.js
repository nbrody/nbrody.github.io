// Khet - Main Application
import { KhetGame, COLS, ROWS, PLAYER, PIECE_TYPE, DIR } from './engine.js';
import { KhetRenderer } from './renderer.js';
import { KhetAI } from './ai.js';
import { KhetNN } from './nn.js';

let game, renderer, ai, nn;

let playerSide = PLAYER.SILVER; // Human plays silver by default
let aiThinking = false;
let gameMode = 'vs-ai'; // 'vs-ai', 'vs-human', 'training'
let isTraining = false;

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
    nn.loadWeights('khet_weights.json').then(loaded => {
        const nnStatusEl = document.getElementById('nnStatus');
        const nnTextEl = document.getElementById('nnStatusText');
        if (loaded) {
            updateStatus('Neural network loaded! AI is using trained weights.');
            console.log('NN loaded successfully');
            if (nnStatusEl) { nnStatusEl.className = 'nn-status active'; }
            if (nnTextEl) { nnTextEl.textContent = 'Neural network active'; }
        } else {
            updateStatus('NN weights not found — using heuristic AI.');
            console.log('NN not loaded, using heuristic fallback');
            if (nnStatusEl) { nnStatusEl.className = 'nn-status fallback'; }
            if (nnTextEl) { nnTextEl.textContent = 'Heuristic mode (no weights)'; }
        }
        // Create AI with NN reference
        ai = new KhetAI(difficulty, nn);
    }).catch(() => {
        const nnStatusEl = document.getElementById('nnStatus');
        const nnTextEl = document.getElementById('nnStatusText');
        if (nnStatusEl) { nnStatusEl.className = 'nn-status fallback'; }
        if (nnTextEl) { nnTextEl.textContent = 'Heuristic mode (weights failed)'; }
        ai = new KhetAI(difficulty, null);
    });

    // Create AI immediately (will be recreated when NN loads)
    ai = new KhetAI(difficulty, null);

    renderer.onClick(handleClick);

    // UI bindings
    document.getElementById('newGame')?.addEventListener('click', newGame);
    document.getElementById('difficulty')?.addEventListener('change', (e) => {
        ai = new KhetAI(e.target.value, nn);
        updateStatus('AI difficulty: ' + e.target.value + (ai.useNN ? ' (Neural Network)' : ' (Heuristic)'));
    });
    document.getElementById('trainBtn')?.addEventListener('click', startTraining);
    document.getElementById('stopTrainBtn')?.addEventListener('click', stopTraining);
    document.getElementById('resetWeights')?.addEventListener('click', () => {
        ai.resetWeights();
        updateStatus('AI weights reset to defaults');
    });
    document.getElementById('switchSides')?.addEventListener('click', switchSides);
    document.getElementById('modeSelect')?.addEventListener('change', (e) => {
        gameMode = e.target.value;
        newGame();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'q' || e.key === 'Q') {
            rotateSelected(-1);
        } else if (e.key === 'e' || e.key === 'E') {
            rotateSelected(1);
        } else if (e.key === 'Escape') {
            renderer.clearSelection();
        } else if (e.key === 'n' || e.key === 'N') {
            newGame();
        }
    });

    renderer.render();
    updateStatus('Your turn! Click a piece to select it.');
    updateTurnIndicator();
}

// ========================
// Game Logic
// ========================

function handleClick(cell, event) {
    if (!cell) return;
    if (aiThinking || game.winner !== null) return;
    if (gameMode === 'vs-ai' && game.currentPlayer !== playerSide) return;
    if (isTraining) return;

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
            return;
        }

        // Check if clicking on own piece (reselect)
        if (piece && piece.player === game.currentPlayer) {
            selectPiece(col, row);
            return;
        }

        renderer.clearSelection();
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

    renderer.setSelection(col, row, movementMoves);

    const piece = game.getAt(col, row);
    updateStatus(`Selected ${piece.type}. Click a highlighted square to move, or press Q/E to rotate.`);
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
// Self-Play Training
// ========================

async function startTraining() {
    if (isTraining) return;
    isTraining = true;

    const numGames = parseInt(document.getElementById('trainGames')?.value || '50');
    const trainBtn = document.getElementById('trainBtn');
    const stopBtn = document.getElementById('stopTrainBtn');
    if (trainBtn) trainBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    updateStatus(`Training: 0/${numGames} games...`);

    const progressEl = document.getElementById('trainProgress');
    const progressBar = document.getElementById('trainProgressBar');

    try {
        const results = await ai.trainSelfPlay(numGames, (progress) => {
            if (!isTraining) throw new Error('Training stopped');

            const pct = (progress.game / progress.total * 100).toFixed(0);
            if (progressBar) progressBar.style.width = pct + '%';
            if (progressEl) {
                progressEl.textContent = `Game ${progress.game}/${progress.total} | ` +
                    `Silver: ${progress.silver_wins} | Red: ${progress.red_wins} | ` +
                    `Avg moves: ${progress.avg_moves.toFixed(0)}`;
            }
            updateStatus(`Training: ${progress.game}/${progress.total} games...`);
        });

        updateStatus(`Training complete! Silver: ${results.silver_wins}, Red: ${results.red_wins}`);
    } catch (e) {
        if (e.message !== 'Training stopped') {
            console.error('Training error:', e);
            updateStatus('Training error: ' + e.message);
        }
    }

    isTraining = false;
    if (trainBtn) trainBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
}

function stopTraining() {
    isTraining = false;
    updateStatus('Training stopped.');
}

// ========================
// Start
// ========================

document.addEventListener('DOMContentLoaded', init);
