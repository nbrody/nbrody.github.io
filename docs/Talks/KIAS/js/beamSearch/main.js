const PIECE_VALUES = {
    p: 1, n: 3.2, b: 3.3, r: 5, q: 9, k: 100
};

const PIECE_SYMBOLS = {
    w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
    b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
};

let game = new Chess();
let boardElement = document.getElementById('board');
let depthInput = document.getElementById('depth');
let widthInput = document.getElementById('beam-width');
let depthVal = document.getElementById('depth-val');
let widthVal = document.getElementById('width-val');
let frontierList = document.getElementById('frontier-list');
let currentScoreEl = document.getElementById('current-score');
let bestMoveEl = document.getElementById('best-move');

let autoPlayInterval = null;

// Initialize
function init() {
    setupBoard();
    updateBoard();

    depthInput.oninput = (e) => {
        depthVal.textContent = e.target.value;
    };
    widthInput.oninput = (e) => {
        widthVal.textContent = e.target.value;
    };

    document.getElementById('randomize-btn').onclick = randomizePosition;
    document.getElementById('step-btn').onclick = makeNextMove;
    document.getElementById('auto-btn').onclick = toggleAutoPlay;
}

function setupBoard() {
    boardElement.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            cell.className = `cell ${(r + c) % 2 === 0 ? 'white' : 'black'}`;
            cell.dataset.row = r;
            cell.dataset.col = c;
            boardElement.appendChild(cell);
        }
    }
}

function updateBoard() {
    const board = game.board();
    const cells = boardElement.querySelectorAll('.cell');

    cells.forEach((cell, index) => {
        const r = Math.floor(index / 8);
        const c = index % 8;
        const piece = board[r][c];

        cell.innerHTML = '';
        if (piece) {
            const pieceEl = document.createElement('span');
            pieceEl.className = 'piece';
            pieceEl.textContent = PIECE_SYMBOLS[piece.color][piece.type];
            cell.appendChild(pieceEl);
        }
    });

    const score = evaluate(game);
    currentScoreEl.textContent = score.toFixed(1);
}

function evaluate(gameInstance) {
    let score = 0;
    const board = gameInstance.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const val = PIECE_VALUES[piece.type];
                score += (piece.color === 'w' ? val : -val);
            }
        }
    }
    return score;
}

async function beamSearch(gameInstance, depth, beamWidth, visualize = false) {
    let frontier = [{
        fen: gameInstance.fen(),
        score: evaluate(gameInstance),
        path: [],
        displayScore: evaluate(gameInstance)
    }];

    const originalTurn = gameInstance.turn();

    for (let d = 0; d < depth; d++) {
        let nextFrontier = [];
        for (let node of frontier) {
            const tempGame = new Chess(node.fen);
            const moves = tempGame.moves();

            for (let move of moves) {
                tempGame.move(move);
                const score = evaluate(tempGame);
                const newNode = {
                    fen: tempGame.fen(),
                    score: score,
                    path: [...node.path, move],
                    displayScore: originalTurn === 'w' ? score : -score
                };
                nextFrontier.push(newNode);

                if (visualize && Math.random() < 0.05) { // Randomly show some candidates
                    updateBoard(tempGame.fen());
                    await new Promise(r => setTimeout(r, 10));
                }

                tempGame.undo();
            }
        }

        if (nextFrontier.length === 0) break;

        nextFrontier.sort((a, b) => b.displayScore - a.displayScore);
        frontier = nextFrontier.slice(0, beamWidth);

        if (visualize) {
            updateFrontierUI(frontier);
            // Show the current best at this depth
            updateBoard(frontier[0].fen);
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return frontier;
}

function updateFrontierUI(frontier) {
    frontierList.innerHTML = '';
    frontier.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = `frontier-item ${i === 0 ? 'best' : ''}`;

        const pathStr = f.path.join(' → ');
        item.innerHTML = `
            <span>${pathStr.length > 25 ? '...' + pathStr.slice(-25) : pathStr}</span>
            <span>${f.score.toFixed(1)}</span>
        `;
        frontierList.appendChild(item);
    });
}

async function makeNextMove() {
    const depth = parseInt(depthInput.value);
    const width = parseInt(widthInput.value);

    document.getElementById('step-btn').disabled = true;
    const results = await beamSearch(game, depth, width, true);
    document.getElementById('step-btn').disabled = false;

    updateFrontierUI(results);

    if (results.length > 0) {
        const best = results[0];
        const nextMove = best.path[0];
        bestMoveEl.textContent = nextMove;

        game.move(nextMove);
        updateBoard();

        if (game.game_over()) {
            stopAutoPlay();
            alert("Game Over!");
        }
    }
}

function randomizePosition() {
    stopAutoPlay();
    game = new Chess();
    // Make 20 random moves to get a "random position"
    for (let i = 0; i < 20; i++) {
        const moves = game.moves();
        if (moves.length === 0) break;
        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(randomMove);
    }
    updateBoard();
    frontierList.innerHTML = '';
    bestMoveEl.textContent = '-';
}

function toggleAutoPlay() {
    const btn = document.getElementById('auto-btn');
    if (autoPlayInterval) {
        stopAutoPlay();
    } else {
        btn.textContent = 'Stop';
        btn.style.background = '#ef4444';
        autoPlayInterval = setInterval(makeNextMove, 800);
    }
}

function stopAutoPlay() {
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }
    const btn = document.getElementById('auto-btn');
    btn.textContent = 'Auto Play';
    btn.style.background = '#10b981';
}

function updateBoard(fen = null) {
    const displayGame = fen ? new Chess(fen) : game;
    const board = displayGame.board();
    const cells = boardElement.querySelectorAll('.cell');

    // Clear highlights
    cells.forEach(c => c.classList.remove('last-move'));

    // Highlight last move if available
    const history = displayGame.history({ verbose: true });
    if (history.length > 0) {
        const last = history[history.length - 1];
        const fromIdx = (8 - parseInt(last.from[1])) * 8 + (last.from.charCodeAt(0) - 97);
        const toIdx = (8 - parseInt(last.to[1])) * 8 + (last.to.charCodeAt(0) - 97);
        // Only highlight if valid indices
        if (fromIdx >= 0 && fromIdx < 64) cells[fromIdx].classList.add('last-move');
        if (toIdx >= 0 && toIdx < 64) cells[toIdx].classList.add('last-move');
    }

    cells.forEach((cell, index) => {
        const r = Math.floor(index / 8);
        const c = index % 8;
        const piece = board[r][c];

        const existingPiece = cell.querySelector('.piece');
        const symbol = piece ? PIECE_SYMBOLS[piece.color][piece.type] : '';

        if (!existingPiece && symbol) {
            const pieceEl = document.createElement('span');
            pieceEl.className = 'piece';
            pieceEl.textContent = symbol;
            cell.appendChild(pieceEl);
        } else if (existingPiece && !symbol) {
            cell.innerHTML = '';
        } else if (existingPiece && existingPiece.textContent !== symbol) {
            existingPiece.textContent = symbol;
        }
    });

    const score = evaluate(displayGame);
    currentScoreEl.textContent = score.toFixed(1);
}

init();
