
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

// Input Handling
document.addEventListener('keydown', (e) => {
    if (isMoving) return;

    switch (e.key) {
        case 'ArrowLeft':
            moveDirection = 'left';
            triggerMove(Matrix.A);
            break;
        case 'ArrowRight':
            moveDirection = 'right';
            triggerMove(Matrix.A_inv);
            break;
        case 'ArrowUp':
            moveDirection = 'up';
            triggerMove(Matrix.B);
            break;
        case 'ArrowDown':
            moveDirection = 'down';
            triggerMove(Matrix.B_inv);
            break;
        case ',':
            // Auto-play next move in solution
            playNextSolutionMove();
            break;
    }
});

function playNextSolutionMove() {
    if (solutionIndex >= solutionWord.length) {
        console.log('Solution complete! Height:', currentHeight);
        return;
    }

    const move = solutionWord[solutionIndex];
    solutionIndex++;

    let matrix, direction;
    switch (move) {
        case 'a':
            matrix = Matrix.A;
            direction = 'left';
            break;
        case 'ai':
            matrix = Matrix.A_inv;
            direction = 'right';
            break;
        case 'b':
            matrix = Matrix.B;
            direction = 'up';
            break;
        case 'bi':
            matrix = Matrix.B_inv;
            direction = 'down';
            break;
    }

    moveDirection = direction;
    triggerMove(matrix);
}

function triggerMove(matrixOp) {
    isMoving = true;

    // Update Matrix immediately logic-wise, but visually wait
    currentMatrix = currentMatrix.mul(matrixOp);
    const newHeight = currentMatrix.getPrimeFactorCount();

    // Update UI
    updateUI(newHeight);

    // Animate
    let progress = 0;
    const animateMove = () => {
        progress += 0.05;
        distance += speed;

        // Visual car movement
        if (moveDirection === 'left') carX = -Math.sin(progress * Math.PI) * 1.5;
        if (moveDirection === 'right') carX = Math.sin(progress * Math.PI) * 1.5;
        if (moveDirection === 'up') carY = -Math.sin(progress * Math.PI) * 1.5;
        if (moveDirection === 'down') carY = Math.sin(progress * Math.PI) * 1.5;

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

    // Format matrix with large parentheses and no commas
    const m = currentMatrix.elements;
    const a = m[0][0].toString();
    const b = m[0][1].toString();
    const c = m[1][0].toString();
    const d = m[1][1].toString();

    matrixDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 5px;">
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
    const horizonY = 90 - currentHeight * 5; // Horizon moves up/down based on height
    const bottomY = 600;
    const centerX = canvas.width / 2;

    ctx.save();

    // Perspective transform simulation
    // We draw lines radiating from center
    ctx.strokeStyle = '#ff71ce';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff71ce';

    // Clip to below horizon
    ctx.beginPath();
    ctx.rect(0, horizonY, canvas.width, bottomY - horizonY);
    ctx.clip();

    // Vertical lines
    for (let i = -10; i <= 10; i++) {
        const xOffset = i * 100;
        ctx.beginPath();
        ctx.moveTo(centerX, horizonY);
        ctx.lineTo(centerX + xOffset * 4, bottomY);
        ctx.stroke();
    }

    // Horizontal lines (moving)
    // We need a non-linear function for y to create depth
    // y = bottomY - (bottomY - horizonY) / z

    const time = Date.now() / 100;
    const speedFactor = isMoving ? 0.2 : 0.05; // Move faster when "moving"
    const offset = (Date.now() * speedFactor % 100) / 100;

    for (let i = 0; i < 20; i++) {
        const z = i + (1 - offset); // Depth from 1 to 20
        if (z < 0.1) continue;

        const y = bottomY - (bottomY - horizonY) / z;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.restore();
}

function drawIntersectionRamps() {
    const horizonY = 90 - currentHeight * 5;
    const centerX = canvas.width / 2;

    // Define the three ramps: left (A), center (B), right (A_inv)
    // At intersection, controls are: L/R for a/A, U/D for b/B
    // So we show: Left ramp = 'a', Center ramp = 'b', Right ramp = 'A'
    const ramps = [
        { x: -300, label: 'a', matrix: Matrix.A, key: 'L' },
        { x: 0, label: 'b', matrix: Matrix.B, key: 'U' },
        { x: 300, label: 'A', matrix: Matrix.A_inv, key: 'R' }
    ];

    ramps.forEach(ramp => {
        const heightAfter = getHeightAfterMove(ramp.matrix);
        const heightDelta = heightAfter - currentHeight;

        // Calculate ramp position in perspective - much closer to viewer
        const rampZ = 2.5; // Closer distance = larger ramps
        const rampY = 600 - (600 - horizonY) / rampZ;
        const rampX = centerX + ramp.x / rampZ;
        const rampWidth = 150 / rampZ; // Wider ramps

        ctx.save();

        // Draw ramp
        ctx.fillStyle = 'rgba(1, 205, 254, 0.3)';
        ctx.strokeStyle = '#01cdfe';
        ctx.lineWidth = 3;

        // Ramp slopes up or down based on height change
        const slopeOffset = -heightDelta * 40; // More dramatic slope

        ctx.beginPath();
        ctx.moveTo(rampX - rampWidth, rampY);
        ctx.lineTo(rampX + rampWidth, rampY);
        ctx.lineTo(rampX + rampWidth, rampY + slopeOffset - 80);
        ctx.lineTo(rampX - rampWidth, rampY + slopeOffset - 80);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw sign - much larger
        ctx.fillStyle = '#fffb96';
        ctx.strokeStyle = '#ff71ce';
        ctx.lineWidth = 3;

        // Sign background
        const signY = rampY + slopeOffset - 140;
        const signWidth = 80;
        const signHeight = 50;
        ctx.fillRect(rampX - signWidth / 2, signY - signHeight / 2, signWidth, signHeight);
        ctx.strokeRect(rampX - signWidth / 2, signY - signHeight / 2, signWidth, signHeight);

        // Sign text
        ctx.fillStyle = '#000';
        ctx.font = 'bold 32px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ramp.label, rampX, signY);

        // Key hint
        ctx.fillStyle = '#b967ff';
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillText(ramp.key, rampX, signY + 50);

        ctx.restore();
    });
}

function drawCar() {
    const centerX = canvas.width / 2;
    const bottomY = 550;

    const x = centerX + carX * 50;
    const y = bottomY + carY * 20;

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
