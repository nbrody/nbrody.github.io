
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let currentMatrix = Matrix.identity();
let currentHeight = 0;
let targetHeight = 0; // Visual height for smooth transition
let speed = 5;
let distance = 0;
let segmentLength = 200; // Distance between intersections
let carX = 0; // -1 (Left), 0 (Center), 1 (Right)
let carY = 0; // -1 (Down), 0 (Center), 1 (Up) - Visual offset
let isMoving = false;
let moveDirection = null; // 'left', 'right', 'up', 'down'

// Move History for Undo and Relative Controls
let moveHistory = []; // Stack of { matrix, height, moveLabel }
const GENERATOR_CYCLE = ['a', 'b', 'A', 'B']; // Cycle for relative controls

// Mobile Support
let signHitboxes = []; // Hitboxes for tappable signs

// Victory State
let hasWon = false;
let victoryScrollX = 0;

// Solution word - 'ai' means A inverse, 'bi' means B inverse
const solutionWord = ['a', 'a', 'b', 'ai', 'ai', 'bi', 'a', 'b', 'a', 'a', 'bi', 'ai', 'bi', 'a', 'a', 'b',
    'ai', 'b', 'a', 'a', 'bi', 'ai', 'bi', 'a', 'b', 'a', 'bi', 'a', 'b', 'ai', 'b', 'a',
    'a', 'bi', 'a', 'a', 'a', 'b', 'ai', 'ai', 'bi', 'a', 'bi', 'ai', 'ai', 'b', 'b', 'a',
    'bi', 'ai', 'ai', 'b', 'ai', 'bi', 'a', 'bi', 'ai', 'ai', 'b', 'a', 'bi', 'a', 'a',
    'b', 'ai', 'b', 'a', 'bi', 'a', 'b', 'ai', 'b', 'a', 'a', 'bi', 'a', 'a', 'a', 'b',
    'ai', 'ai', 'bi'];
let solutionIndex = 0;
let autoPlay = false;

// Assets (Procedural for now)
const sunGradient = ctx.createLinearGradient(0, 0, 0, 200);
sunGradient.addColorStop(0, "#ff71ce");
sunGradient.addColorStop(1, "#ffb967");

// Helper to get next available moves based on last move
function getNextMoves() {
    const lastMoveLabel = moveHistory.length > 0 ? moveHistory[moveHistory.length - 1].moveLabel : 'a'; // Default to 'a' start context

    // Find index in cycle
    let idx = GENERATOR_CYCLE.indexOf(lastMoveLabel);
    if (idx === -1) idx = 0; // Fallback

    // Cycle: a -> b -> A -> B -> a
    // Left: Next in cycle
    // Right: Previous in cycle
    // Up: Repeat last move

    const nextIdx = (idx + 1) % 4;
    const prevIdx = (idx - 1 + 4) % 4;

    const leftLabel = GENERATOR_CYCLE[nextIdx];
    const rightLabel = GENERATOR_CYCLE[prevIdx];
    const upLabel = lastMoveLabel;

    return {
        left: { label: leftLabel, matrix: getMatrixFromLabel(leftLabel) },
        right: { label: rightLabel, matrix: getMatrixFromLabel(rightLabel) },
        up: { label: upLabel, matrix: getMatrixFromLabel(upLabel) }
    };
}

function getMatrixFromLabel(label) {
    switch (label) {
        case 'a': return Matrix.A;
        case 'b': return Matrix.B;
        case 'A': return Matrix.A_inv;
        case 'B': return Matrix.B_inv;
    }
}

// Input Handling
document.addEventListener('keydown', (e) => {
    if (isMoving) return;

    const nextMoves = getNextMoves();

    switch (e.key) {
        case 'ArrowLeft':
            moveDirection = 'left';
            triggerMove(nextMoves.left.matrix, nextMoves.left.label);
            break;
        case 'ArrowRight':
            moveDirection = 'right';
            triggerMove(nextMoves.right.matrix, nextMoves.right.label);
            break;
        case 'ArrowUp':
            moveDirection = 'up';
            triggerMove(nextMoves.up.matrix, nextMoves.up.label);
            break;
        case 'ArrowDown':
            undoMove();
            break;
        case ',':
            // Auto-play next move in solution
            playNextSolutionMove();
            break;
    }
});

function undoMove() {
    if (moveHistory.length === 0) return;

    const lastState = moveHistory.pop();
    // To undo, we multiply by the inverse of the last move
    // Or simpler: we could reconstruct from history, but since we only store relative moves,
    // we need to actually invert the operation on the current matrix.
    // Wait, better design: moveHistory should store the STATE *before* the move?
    // Or we just invert the move.

    let invMatrix;
    switch (lastState.moveLabel) {
        case 'a': invMatrix = Matrix.A_inv; break;
        case 'b': invMatrix = Matrix.B_inv; break;
        case 'A': invMatrix = Matrix.A; break;
        case 'B': invMatrix = Matrix.B; break;
    }

    currentMatrix = currentMatrix.mul(invMatrix);
    currentHeight = currentMatrix.getPrimeFactorCount();
    updateUI(currentHeight);

    // Visual feedback for undo? Maybe just snap for now.
}

function playNextSolutionMove() {
    if (solutionIndex >= solutionWord.length) {
        console.log('Solution complete! Height:', currentHeight);
        return;
    }

    const move = solutionWord[solutionIndex];
    solutionIndex++;

    // Map solution move (a, ai, b, bi) to our labels (a, A, b, B)
    let label;
    if (move === 'a') label = 'a';
    else if (move === 'ai') label = 'A';
    else if (move === 'b') label = 'b';
    else if (move === 'bi') label = 'B';

    // Determine direction based on current relative controls
    const nextMoves = getNextMoves();
    let direction = 'up'; // Default

    if (nextMoves.left.label === label) direction = 'left';
    else if (nextMoves.right.label === label) direction = 'right';
    else if (nextMoves.up.label === label) direction = 'up';

    moveDirection = direction;
    triggerMove(getMatrixFromLabel(label), label);
}

function triggerMove(matrixOp, label) {
    isMoving = true;

    // Push to history
    moveHistory.push({ moveLabel: label });

    // Update Matrix immediately logic-wise, but visually wait
    currentMatrix = currentMatrix.mul(matrixOp);
    const newHeight = currentMatrix.getPrimeFactorCount();

    // Update UI
    updateUI(newHeight);

    // Animate
    let progress = 0;
    const animateMove = () => {
        progress += 0.03; // Slower animation for driving into distance
        distance += speed;

        // Visual car movement - Drive INTO the screen towards the fork
        // Z-depth simulation: scale down car?
        // For now, just move X and maybe Y slightly

        // Target positions for each fork
        // Left: -1, Center: 0 (up), Right: 1
        let targetX = 0;
        let targetY = 0;

        if (moveDirection === 'left') {
            targetX = -1.25; // Move to left fork
            targetY = -1; // Move towards horizon
        } else if (moveDirection === 'right') {
            targetX = 1.25; // Move to right fork
            targetY = -1; // Move towards horizon
        } else if (moveDirection === 'up') {
            targetX = 0; // Stay centered
            targetY = -1; // Move forward towards horizon
        }

        carX = targetX * Math.sin(progress * Math.PI / 2); // Ease out
        carY = targetY * Math.sin(progress * Math.PI / 2); // Move towards horizon

        if (progress >= 1) {
            isMoving = false;
            carX = 0;
            carY = 0;
            distance = 0; // Reset distance for infinite road illusion
            currentHeight = newHeight; // Snap to new height
        } else {
            requestAnimationFrame(animateMove);
        }
    };
    requestAnimationFrame(animateMove);
}

function updateUI(height) {
    const matrixDiv = document.getElementById('matrix-display');

    // Get factored form: 1/(2^m * 3^n) * integer matrix
    const factored = currentMatrix.getFactoredForm();
    const { power2, power3, intMatrix } = factored;

    // Build denominator string
    let denomStr = '';
    if (power2 === 0 && power3 === 0) {
        denomStr = '1';
    } else {
        const parts = [];
        if (power2 > 0) parts.push(power2 === 1 ? '2' : `2<sup>${power2}</sup>`);
        if (power3 > 0) parts.push(power3 === 1 ? '3' : `3<sup>${power3}</sup>`);
        denomStr = parts.join('·');
    }

    const a = intMatrix[0][0].toString();
    const b = intMatrix[0][1].toString();
    const c = intMatrix[1][0].toString();
    const d = intMatrix[1][1].toString();

    // Create fraction with horizontal bar
    const fractionHTML = (power2 === 0 && power3 === 0) ? '' : `
        <div style="display: inline-flex; flex-direction: column; align-items: center; margin-right: 8px;">
            <div style="font-size: 14px;">1</div>
            <div style="border-top: 2px solid currentColor; width: 100%; margin: 2px 0;"></div>
            <div style="font-size: 14px;">${denomStr}</div>
        </div>
    `;

    matrixDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 14px;">
            ${fractionHTML}
            <div style="font-size: 40px; line-height: 0.6;">(</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
                <div>${a}  ${b}</div>
                <div>${c}  ${d}</div>
            </div>
            <div style="font-size: 40px; line-height: 0.6;">)</div>
        </div>
    `;

    const heightSpan = document.getElementById('height-value');
    heightSpan.innerText = height;

    // Update solution progress
    const progressSpan = document.getElementById('solution-progress');
    progressSpan.innerText = `${solutionIndex}`;
}


// Helper function to calculate what height would be after a move
function getHeightAfterMove(matrixOp) {
    const testMatrix = currentMatrix.mul(matrixOp);
    return testMatrix.getPrimeFactorCount();
}

// Rendering
function draw() {
    ctx.fillStyle = '#050011';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Smoothly interpolate visual height
    targetHeight = currentHeight; // In a real game we might want to lag this

    drawBackground();
    drawRoad();

    // Draw intersection ramps when not moving
    if (!isMoving) {
        drawIntersectionRamps();
    }

    drawCar();

    requestAnimationFrame(draw);
}


function drawBackground() {
    // Background takes top 15% (90px of 600px)
    const bgHeight = 90;

    // Sun - smaller and in top area
    ctx.save();
    ctx.translate(canvas.width / 2, 45 - currentHeight * 2); // Sun moves with height
    ctx.beginPath();
    ctx.arc(0, 0, 35, 0, Math.PI * 2);
    ctx.fillStyle = sunGradient;
    ctx.fill();

    // Sun stripes
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = '#050011';
        ctx.fillRect(-40, 5 + i * 4, 80, 1 + i * 0.3);
    }
    ctx.restore();

    // Mountains (Simple) - compressed to top area
    ctx.fillStyle = '#1a0033';
    ctx.save();
    ctx.translate(0, -currentHeight * 2); // Mountains move slightly
    ctx.beginPath();
    ctx.moveTo(0, bgHeight);
    ctx.lineTo(200, 30);
    ctx.lineTo(400, bgHeight);
    ctx.lineTo(600, 50);
    ctx.lineTo(800, bgHeight);
    ctx.lineTo(800, 600);
    ctx.lineTo(0, 600);
    ctx.fill();
    ctx.restore();
}

function drawRoad() {
    // Horizon is now just below the background (15% = 90px)
    const horizonY = 90 - currentHeight * 5;
    const bottomY = 600;
    const centerX = canvas.width / 2;

    ctx.save();

    // 1. Draw Ground (Deep Purple Void)
    ctx.fillStyle = '#050011';
    ctx.fillRect(0, horizonY, canvas.width, bottomY - horizonY);

    // 2. Setup Vaporwave Grid Style
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff71ce';
    ctx.strokeStyle = '#ff71ce'; // Neon Pink Grid
    ctx.lineWidth = 2;

    // 3. Draw Main Road (Bottom part)
    // We'll use a gradient fill for the road to give it that "glow"
    const roadGradient = ctx.createLinearGradient(0, horizonY, 0, bottomY);
    roadGradient.addColorStop(0, "rgba(255, 113, 206, 0.1)");
    roadGradient.addColorStop(1, "rgba(255, 113, 206, 0.4)");
    ctx.fillStyle = roadGradient;

    // Define the road shape
    const splitY = horizonY + 350; // Where the forks start (lowered to car level)

    // Main trunk
    ctx.beginPath();
    ctx.moveTo(centerX - 100, splitY);
    ctx.lineTo(centerX - 300, bottomY); // Wide base
    ctx.lineTo(centerX + 300, bottomY); // Wide base
    ctx.lineTo(centerX + 100, splitY);
    ctx.fill();

    // Draw grid lines on main trunk
    // Verticals
    ctx.beginPath();
    ctx.moveTo(centerX - 100, splitY); ctx.lineTo(centerX - 300, bottomY);
    ctx.moveTo(centerX + 100, splitY); ctx.lineTo(centerX + 300, bottomY);
    ctx.moveTo(centerX, splitY); ctx.lineTo(centerX, bottomY); // Center line
    ctx.stroke();

    // 4. Draw Forking Paths (Neon Grid)
    // Left Path
    ctx.beginPath();
    ctx.moveTo(centerX - 100, splitY);
    ctx.lineTo(centerX - 350, horizonY); // Vanishing point left
    ctx.lineTo(centerX - 150, horizonY);
    ctx.lineTo(centerX, splitY);
    ctx.fill(); // Reuse gradient
    ctx.stroke(); // Outline

    // Center Path
    ctx.beginPath();
    ctx.moveTo(centerX - 100, splitY);
    ctx.lineTo(centerX - 50, horizonY);
    ctx.lineTo(centerX + 50, horizonY);
    ctx.lineTo(centerX + 100, splitY);
    ctx.fill();
    ctx.stroke();

    // Right Path
    ctx.beginPath();
    ctx.moveTo(centerX, splitY);
    ctx.lineTo(centerX + 150, horizonY);
    ctx.lineTo(centerX + 350, horizonY); // Vanishing point right
    ctx.lineTo(centerX + 100, splitY);
    ctx.fill();
    ctx.stroke();

    // 5. Horizontal Grid Lines (Moving)
    const time = Date.now() / 100;
    const speedFactor = isMoving ? 0.2 : 0.05;
    const offset = (Date.now() * speedFactor % 100) / 100;

    ctx.strokeStyle = 'rgba(1, 205, 254, 0.8)'; // Cyan for horizontals

    for (let i = 0; i < 20; i++) {
        const z = i + (1 - offset);
        if (z < 0.1) continue;

        // Perspective math for horizontal lines
        // We need to map 'z' to screen Y, but respect the forks
        // This is tricky with forks. Let's just draw simple horizontals across the whole view
        // masked by the road shape?
        // Or just draw them on the main trunk and approximate on forks.

        const y = bottomY - (bottomY - horizonY) / z;

        // Only draw if below splitY for main trunk, or adjust for forks
        if (y > splitY) {
            // Main trunk
            const widthAtY = 600 * (y - horizonY) / (bottomY - horizonY); // Approx
            ctx.beginPath();
            ctx.moveTo(0, y); // Just draw across for full grid effect? 
            // No, let's clip.
            // Actually, simpler: just draw lines across the screen but clip to road region
        }
    }

    // Re-drawing horizontals properly with clipping
    ctx.save();
    // Define clip region (Union of all paths)
    ctx.beginPath();
    ctx.moveTo(centerX - 300, bottomY);
    ctx.lineTo(centerX - 100, splitY);
    ctx.lineTo(centerX - 350, horizonY);
    ctx.lineTo(centerX + 350, horizonY);
    ctx.lineTo(centerX + 100, splitY);
    ctx.lineTo(centerX + 300, bottomY);
    ctx.clip();

    for (let i = 0; i < 20; i++) {
        const z = i + (1 - offset);
        if (z < 0.1) continue;
        const y = bottomY - (bottomY - horizonY) / z;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
}

function drawIntersectionRamps() {
    const horizonY = 90 - currentHeight * 5;
    const centerX = canvas.width / 2;
    const bottomY = 600;

    const nextMoves = getNextMoves();

    const ramps = [
        { x: centerX - 250, label: nextMoves.left.label, matrix: nextMoves.left.matrix, key: 'L' },
        { x: centerX, label: nextMoves.up.label, matrix: nextMoves.up.matrix, key: 'U' },
        { x: centerX + 250, label: nextMoves.right.label, matrix: nextMoves.right.matrix, key: 'R' }
    ];

    // Draw Neon Gantry (Floating Grid Beam)
    const gantryY = 160;
    const postX_Left = 50;
    const postX_Right = 550;

    ctx.save();

    // Neon Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#01cdfe'; // Cyan Glow
    ctx.strokeStyle = '#01cdfe';
    ctx.lineWidth = 3;

    // Gantry Beam (Floating)
    ctx.beginPath();
    ctx.moveTo(postX_Left, gantryY);
    ctx.lineTo(postX_Right, gantryY);
    ctx.stroke();

    // Vertical supports (faint)
    ctx.strokeStyle = 'rgba(1, 205, 254, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(postX_Left, gantryY); ctx.lineTo(postX_Left, bottomY);
    ctx.moveTo(postX_Right, gantryY); ctx.lineTo(postX_Right, bottomY);
    ctx.stroke();

    // Store hitboxes for mobile
    signHitboxes = [];

    ramps.forEach(ramp => {
        const heightAfter = getHeightAfterMove(ramp.matrix);
        const heightDelta = heightAfter - currentHeight;

        // Draw Sign Board (Neon Style)
        const signW = 80;
        const signH = 60;
        const signX = ramp.x - signW / 2;
        const signY = gantryY - 30; // Centered on beam

        // Store hitbox
        signHitboxes.push({
            x: signX,
            y: signY,
            width: signW,
            height: signH
        });

        // Sign Background (Dark)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(signX, signY, signW, signH);

        // Sign Border (Pink)
        ctx.shadowColor = '#ff71ce';
        ctx.strokeStyle = '#ff71ce';
        ctx.lineWidth = 2;
        ctx.strokeRect(signX, signY, signW, signH);

        // Text (Cyan)
        ctx.fillStyle = '#01cdfe';
        ctx.shadowColor = '#01cdfe';
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ramp.label, ramp.x, signY + 20);

        // Key Hint (Yellow)
        ctx.fillStyle = '#fffb96';
        ctx.shadowColor = '#fffb96';
        ctx.font = '10px "Press Start 2P", monospace';
        ctx.fillText(`[${ramp.key}]`, ramp.x, signY + 45);

        // Height Indicator (Arrow)
        if (heightDelta !== 0) {
            ctx.fillStyle = heightDelta > 0 ? '#ff0055' : '#00ff55'; // Neon Red/Green
            ctx.shadowColor = ctx.fillStyle;
            const arrowY = signY - 15;
            ctx.beginPath();
            if (heightDelta > 0) { // Up arrow
                ctx.moveTo(ramp.x, arrowY - 8);
                ctx.lineTo(ramp.x - 8, arrowY + 4);
                ctx.lineTo(ramp.x + 8, arrowY + 4);
            } else { // Down arrow
                ctx.moveTo(ramp.x, arrowY + 8);
                ctx.lineTo(ramp.x - 8, arrowY - 4);
                ctx.lineTo(ramp.x + 8, arrowY - 4);
            }
            ctx.fill();
        }

        // Height Change Text (below sign)
        if (heightDelta !== 0) {
            ctx.fillStyle = heightDelta > 0 ? '#ff0055' : '#00ff55';
            ctx.shadowColor = ctx.fillStyle;
            ctx.font = 'bold 10px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const heightText = heightDelta > 0 ? `+${heightDelta}` : `${heightDelta}`;
            ctx.fillText(heightText, ramp.x, signY + signH + 5);
        }
    });

    ctx.restore();
}

function drawCar() {
    const horizonY = 90 - currentHeight * 5;
    const splitY = horizonY + 350; // Match the fork position
    const centerX = canvas.width / 2;

    const x = centerX + carX * 200; // Increased for wider movement
    const y = splitY + carY * 150; // Start at fork, move towards horizon

    ctx.save();
    ctx.translate(x, y);

    // Car Body (Retro Boxy)
    ctx.fillStyle = '#01cdfe'; // Cyan
    ctx.fillRect(-40, -20, 80, 20); // Main body
    ctx.fillRect(-30, -35, 60, 15); // Top

    // Tail lights
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(-35, -15, 10, 5);
    ctx.fillRect(25, -15, 10, 5);

    // Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#01cdfe';

    ctx.restore();
}

// Start loop
draw();

// Mobile Support - Touch Events
let touchStartY = null;
let touchStartX = null;
let touchStartTime = null;

// Sign hitboxes are initialized at the top of the file

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
    touchStartTime = Date.now();
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();

    if (!touchStartY || !touchStartX) return;

    const touch = e.changedTouches[0];
    const touchEndY = touch.clientY;
    const touchEndX = touch.clientX;
    const touchEndTime = Date.now();

    const deltaY = touchEndY - touchStartY;
    const deltaX = touchEndX - touchStartX;
    const deltaTime = touchEndTime - touchStartTime;

    // Detect swipe down (for auto-play)
    if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY > 50 && deltaTime < 500) {
        // Swipe down detected
        playNextSolutionMove();
    } else if (deltaTime < 300 && Math.abs(deltaY) < 30 && Math.abs(deltaX) < 30) {
        // Tap detected - check if it's on a sign
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (touchEndX - rect.left) * scaleX;
        const canvasY = (touchEndY - rect.top) * scaleY;

        handleTapOnCanvas(canvasX, canvasY);
    }

    touchStartY = null;
    touchStartX = null;
    touchStartTime = null;
});

function handleTapOnCanvas(x, y) {
    if (isMoving) return;

    // Check if tap is on any sign
    for (let i = 0; i < signHitboxes.length; i++) {
        const hitbox = signHitboxes[i];
        if (x >= hitbox.x && x <= hitbox.x + hitbox.width &&
            y >= hitbox.y && y <= hitbox.y + hitbox.height) {
            // Tapped on sign i
            const nextMoves = getNextMoves();
            const signs = [nextMoves.left, nextMoves.up, nextMoves.right];
            const move = signs[i];

            const directions = ['left', 'up', 'right'];
            moveDirection = directions[i];
            triggerMove(move.matrix, move.label);
            break;
        }
    }
}

// Update drawIntersectionRamps to populate hitboxes
function updateSignHitboxes() {
    const horizonY = 90 - currentHeight * 5;
    const centerX = canvas.width / 2;
    const gantryY = 160;

    const nextMoves = getNextMoves();
    const ramps = [
        { x: centerX - 250, label: nextMoves.left.label, matrix: nextMoves.left.matrix, key: 'L' },
        { x: centerX, label: nextMoves.up.label, matrix: nextMoves.up.matrix, key: 'U' },
        { x: centerX + 250, label: nextMoves.right.label, matrix: nextMoves.right.matrix, key: 'R' }
    ];

    signHitboxes = [];
    ramps.forEach(ramp => {
        const signW = 80;
        const signH = 60;
        const signX = ramp.x - signW / 2;
        const signY = gantryY - 30;

        signHitboxes.push({
            x: signX,
            y: signY,
            width: signW,
            height: signH
        });
    });
}
