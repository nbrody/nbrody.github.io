// Game State
let currentMatrix = Matrix.identity();
let currentHeight = 0;
let isMoving = false;
let moveHistory = [];
const GENERATOR_CYCLE = ['a', 'b', 'A', 'B'];

// Victory State
let hasWon = false;
let victoryScrollX = 0;

// Solution word
const solutionWord = ['a', 'a', 'b', 'ai', 'ai', 'bi', 'a', 'b', 'a', 'a', 'bi', 'ai', 'bi', 'a', 'a', 'b',
    'ai', 'b', 'a', 'a', 'bi', 'ai', 'bi', 'a', 'b', 'a', 'bi', 'a', 'b', 'ai', 'b', 'a',
    'a', 'bi', 'a', 'a', 'a', 'b', 'ai', 'ai', 'bi', 'a', 'bi', 'ai', 'ai', 'b', 'b', 'a',
    'bi', 'ai', 'ai', 'b', 'ai', 'bi', 'a', 'bi', 'ai', 'ai', 'b', 'a', 'bi', 'a', 'a',
    'b', 'ai', 'b', 'a', 'bi', 'a', 'b', 'ai', 'b', 'a', 'a', 'bi', 'a', 'a', 'a', 'b',
    'ai', 'ai', 'bi'];
let solutionIndex = 0;
let autoPlayInterval = null;


// Animation state
let moveProgress = 0;
let animStartTime = 0;
let animDuration = 800;
let animFromNode = null;
let animToNode = null;

// Configuration
const VIEW_DEPTH = 4; // Depth of the Cayley graph to render (lower = faster)

// Cayley graph with hyperbolic positions
let cayleyGraph = [];

function buildCayleyGraph(depth = VIEW_DEPTH, center = Matrix.identity()) {
    const i = new Complex(0, 1);
    const queue = [{ matrix: center, level: 0, pos: mapToDisk(applyMobius(i, toComplexMatrix(center))), height: center.getPrimeFactorCount() }];
    const visited = new Set([center.toString()]);
    cayleyGraph = [queue[0]];

    let head = 0;
    while (head < queue.length && queue[head].level < depth) {
        const current = queue[head++];
        const moves = [
            { m: Matrix.A, mc: GEN_A, l: 'a' },
            { m: Matrix.A_inv, mc: GEN_A_INV, l: 'A' },
            { m: Matrix.B, mc: GEN_B, l: 'b' },
            { m: Matrix.B_inv, mc: GEN_B_INV, l: 'B' }
        ];

        for (let move of moves) {
            const nextM = current.matrix.mul(move.m);
            const key = nextM.toString();
            if (!visited.has(key)) {
                visited.add(key);
                const nextPos = mapToDisk(applyMobius(i, toComplexMatrix(nextM)));
                const node = {
                    matrix: nextM,
                    level: current.level + 1,
                    pos: nextPos,
                    height: nextM.getPrimeFactorCount()
                };
                queue.push(node);
                cayleyGraph.push(node);
            }
        }
    }
}

function getNextMoves() {
    const lastMoveLabel = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].moveLabel : 'a';
    let idx = GENERATOR_CYCLE.indexOf(lastMoveLabel);
    if (idx === -1) idx = 0;

    const nextIdx = (idx + 1) % 4;
    const prevIdx = (idx - 1 + 4) % 4;

    return {
        left: { label: GENERATOR_CYCLE[prevIdx], matrix: getMatrixFromLabel(GENERATOR_CYCLE[prevIdx]) },
        up: { label: lastMoveLabel, matrix: getMatrixFromLabel(lastMoveLabel) },
        right: { label: GENERATOR_CYCLE[nextIdx], matrix: getMatrixFromLabel(GENERATOR_CYCLE[nextIdx]) }
    };
}

function getMatrixFromLabel(label) {
    switch (label) {
        case 'a': return Matrix.A;
        case 'b': return Matrix.B;
        case 'A': case 'ai': return Matrix.A_inv;
        case 'B': case 'bi': return Matrix.B_inv;
    }
}

let gameStarted = false;

// Input Handling
document.addEventListener('keydown', (e) => {
    console.log('Keydown event:', e.key);
    if (!gameStarted) {
        console.log('Starting game via key press');
        gameStarted = true;
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) titleScreen.style.display = 'none';
        return;
    }

    if (isMoving || hasWon) return;

    // WASD: Global/Absolute controls
    // d = a, a = A, w = b, s = B
    switch (e.key.toLowerCase()) {
        case 'd': triggerMove(Matrix.A, 'a'); break;
        case 'a': triggerMove(Matrix.A_inv, 'A'); break;
        case 'w': triggerMove(Matrix.B, 'b'); break;
        case 's': triggerMove(Matrix.B_inv, 'B'); break;
    }

    // Arrow Keys: Relative controls (depend on previous move)
    const nextMoves = getNextMoves();
    switch (e.key) {
        case 'ArrowLeft': triggerMove(nextMoves.left.matrix, nextMoves.left.label); break;
        case 'ArrowUp': triggerMove(nextMoves.up.matrix, nextMoves.up.label); break;
        case 'ArrowRight': triggerMove(nextMoves.right.matrix, nextMoves.right.label); break;
        case 'ArrowDown': undoMove(); break;
        case 'r': case 'R': restartGame(); break;
        case 'p': case 'P': playNextSolutionMove(); break;
        case ',': playNextSolutionMove(); break;
        case '!': autoPlaySolution(); break;
    }
});

// Mobile Controls
function handleMobileInput(action) {
    if (!gameStarted) {
        console.log('Starting game via mobile input');
        gameStarted = true;
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) titleScreen.style.display = 'none';
        return;
    }

    if (isMoving || hasWon) return;

    if (action === 'autoplay') {
        autoPlaySolution();
        return;
    }

    if (action === 'undo') {
        undoMove();
        return;
    }

    // Relative moves
    const nextMoves = getNextMoves();
    if (action === 'left') triggerMove(nextMoves.left.matrix, nextMoves.left.label);
    if (action === 'up') triggerMove(nextMoves.up.matrix, nextMoves.up.label);
    if (action === 'right') triggerMove(nextMoves.right.matrix, nextMoves.right.label);
}

// Add listeners when DOM is loaded (or immediately if script runs after DOM)
// Since this is at end of body in index.html, elements should exist.
const mobileBtnUp = document.getElementById('btn-up');
const mobileBtnLeft = document.getElementById('btn-left');
const mobileBtnRight = document.getElementById('btn-right');
const mobileBtnDown = document.getElementById('btn-down');
const mobileBtnAuto = document.getElementById('mobile-autoplay-btn');

if (mobileBtnUp) {
    mobileBtnUp.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileInput('up'); });
    mobileBtnUp.addEventListener('mousedown', (e) => { e.preventDefault(); handleMobileInput('up'); });
}
if (mobileBtnLeft) {
    mobileBtnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileInput('left'); });
    mobileBtnLeft.addEventListener('mousedown', (e) => { e.preventDefault(); handleMobileInput('left'); });
}
if (mobileBtnRight) {
    mobileBtnRight.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileInput('right'); });
    mobileBtnRight.addEventListener('mousedown', (e) => { e.preventDefault(); handleMobileInput('right'); });
}
if (mobileBtnDown) {
    mobileBtnDown.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileInput('undo'); });
    mobileBtnDown.addEventListener('mousedown', (e) => { e.preventDefault(); handleMobileInput('undo'); });
}
if (mobileBtnAuto) {
    mobileBtnAuto.addEventListener('touchstart', (e) => { e.preventDefault(); handleMobileInput('autoplay'); });
    mobileBtnAuto.addEventListener('mousedown', (e) => { e.preventDefault(); handleMobileInput('autoplay'); });
}

// Tap title screen to start
const titleScreen = document.getElementById('title-screen');
if (titleScreen) {
    const startGame = (e) => {
        if (!gameStarted) {
            e.preventDefault(); // Prevent ghost clicks
            console.log('Starting game via title screen tap');
            gameStarted = true;
            titleScreen.style.display = 'none';
        }
    };
    titleScreen.addEventListener('touchstart', startGame);
    titleScreen.addEventListener('click', startGame);
}



function restartGame() {
    currentMatrix = Matrix.identity();
    currentHeight = 0;
    moveHistory = [];
    solutionIndex = 0;
    hasWon = false;
    isMoving = false;
    buildCayleyGraph(VIEW_DEPTH, Matrix.identity());
    updateUI(0);
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.style.display = 'block';
}

function undoMove() {
    if (moveHistory.length === 0) return;
    const lastState = moveHistory.pop();
    let invMatrix;
    switch (lastState.moveLabel) {
        case 'a': invMatrix = Matrix.A_inv; break;
        case 'b': invMatrix = Matrix.B_inv; break;
        case 'A': invMatrix = Matrix.A; break;
        case 'B': invMatrix = Matrix.B; break;
    }
    currentMatrix = currentMatrix.mul(invMatrix);
    currentHeight = currentMatrix.getPrimeFactorCount();
    buildCayleyGraph(VIEW_DEPTH, currentMatrix);
    updateUI(currentHeight);
}

function playNextSolutionMove() {
    if (solutionIndex >= solutionWord.length) return;
    const nextLabel = solutionWord[solutionIndex];
    triggerMove(getMatrixFromLabel(nextLabel), nextLabel);
    solutionIndex++;
}

function autoPlaySolution() {
    // Stop any existing auto-play
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
    }

    // Reset game to start position
    currentMatrix = Matrix.identity();
    currentHeight = 0;
    moveHistory = [];
    hasWon = false;
    isMoving = false;
    solutionIndex = 0;
    buildCayleyGraph(VIEW_DEPTH, Matrix.identity());
    updateUI(0);
    const uiLayer = document.getElementById('ui-layer');
    if (uiLayer) uiLayer.style.display = 'block';

    // Calculate delay: 12000ms / number of moves
    const totalMoves = solutionWord.length;
    const delayPerMove = 12000 / totalMoves;

    // Set animation duration to match delay (slightly faster to be safe)
    animDuration = delayPerMove * 0.9;

    function playNext() {
        // Stop if victory achieved or solution complete
        if (hasWon || solutionIndex >= solutionWord.length) {
            // Finished, reset animation duration
            animDuration = 800;
            return;
        }
        const nextLabel = solutionWord[solutionIndex];
        const matrix = getMatrixFromLabel(nextLabel);

        // Force move even if animation is running
        isMoving = false;

        // Trigger the move
        triggerMove(matrix, nextLabel);
        solutionIndex++;

        // Schedule next move only if not won
        if (!hasWon) {
            setTimeout(playNext, delayPerMove);
        }
    }

    playNext();
}


function triggerMove(matrixOp, label) {
    if (isMoving) return;

    // Find current and next node in graph
    const currentNode = cayleyGraph.find(n => n.matrix.toString() === currentMatrix.toString());
    const nextMatrix = currentMatrix.mul(matrixOp);
    const nextNode = cayleyGraph.find(n => n.matrix.toString() === nextMatrix.toString());

    isMoving = true;
    moveProgress = 0;
    moveHistory.push({ moveLabel: label });

    animFromNode = currentNode || { pos: new Complex(0, 0), height: currentHeight };
    animToNode = nextNode || { pos: new Complex(0, 0), height: nextMatrix.getPrimeFactorCount() };

    currentMatrix = nextMatrix;
    currentHeight = currentMatrix.getPrimeFactorCount();
    buildCayleyGraph(VIEW_DEPTH, currentMatrix);
    updateUI(currentHeight);
    checkVictory();

    animStartTime = Date.now();

    function animate() {
        const elapsed = Date.now() - animStartTime;
        moveProgress = Math.min(elapsed / animDuration, 1);

        if (moveProgress < 1) {
            requestAnimationFrame(animate);
        } else {
            isMoving = false;
            moveProgress = 0;
        }
    }
    animate();
}

function checkVictory() {
    console.log('checkVictory called - currentHeight:', currentHeight, 'moveHistory.length:', moveHistory.length);

    // Win condition: height 0 (integer matrix) but NOT the identity matrix
    if (currentHeight === 0 && moveHistory.length > 0) {
        // Check if it's NOT the identity matrix OR negative identity
        const a = currentMatrix.elements[0][0].toNumber();
        const b = currentMatrix.elements[0][1].toNumber();
        const c = currentMatrix.elements[1][0].toNumber();
        const d = currentMatrix.elements[1][1].toNumber();

        const isIdentity = a === 1 && b === 0 && c === 0 && d === 1;
        const isNegIdentity = a === -1 && b === 0 && c === 0 && d === -1;

        console.log('Height 0 reached! isIdentity:', isIdentity, 'isNegIdentity:', isNegIdentity, 'Matrix:', currentMatrix.toString());
        console.log('Matrix values: a=', a, 'b=', b, 'c=', c, 'd=', d);

        if (!isIdentity && !isNegIdentity) {
            hasWon = true;
            victoryScrollX = canvas.width; // Start from right edge
            console.log('VICTORY! Setting hasWon = true');
            const uiLayer = document.getElementById('ui-layer');
            if (uiLayer) uiLayer.style.display = 'none';
        }
    }
}

// Initialize
buildCayleyGraph(VIEW_DEPTH, Matrix.identity());
updateUI(0);
draw();
