const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

// Animation state
let moveProgress = 0;
let animStartTime = 0;
const ANIM_DURATION = 800;
let animFromNode = null;
let animToNode = null;

// ============= HYPERBOLIC GEOMETRY =============

class Complex {
    constructor(re, im) {
        this.re = re;
        this.im = im;
    }
    add(other) { return new Complex(this.re + other.re, this.im + other.im); }
    sub(other) { return new Complex(this.re - other.re, this.im - other.im); }
    mul(other) {
        return new Complex(
            this.re * other.re - this.im * other.im,
            this.re * other.im + this.im * other.re
        );
    }
    div(other) {
        const d = other.re * other.re + other.im * other.im;
        return new Complex(
            (this.re * other.re + this.im * other.im) / d,
            (this.im * other.re - this.re * other.im) / d
        );
    }
    abs() { return Math.sqrt(this.re * this.re + this.im * this.im); }
    conj() { return new Complex(this.re, -this.im); }
}

function toComplexMatrix(m) {
    return {
        a: new Complex(m.elements[0][0].toNumber(), 0),
        b: new Complex(m.elements[0][1].toNumber(), 0),
        c: new Complex(m.elements[1][0].toNumber(), 0),
        d: new Complex(m.elements[1][1].toNumber(), 0)
    };
}

function applyMobius(z, m) {
    const num = m.a.mul(z).add(m.b);
    const den = m.c.mul(z).add(m.d);
    return num.div(den);
}

function mapToDisk(z) {
    const i = new Complex(0, 1);
    return z.sub(i).div(z.add(i));
}

const GEN_A = toComplexMatrix(Matrix.A);
const GEN_A_INV = toComplexMatrix(Matrix.A_inv);
const GEN_B = toComplexMatrix(Matrix.B);
const GEN_B_INV = toComplexMatrix(Matrix.B_inv);

// Cayley graph with hyperbolic positions
let cayleyGraph = [];

function buildCayleyGraph(depth, center = Matrix.identity()) {
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

// ============= 3D PROJECTION =============

function project3D(diskX, diskY, height) {
    // Camera setup
    const camHeightOffset = 0.3; // Camera is above the car
    const pitch = 0.4; // Look down angle (radians)
    const camDist = 0.3;

    // World Coordinates relative to camera base
    // We treat diskX as depth axis (inverted), diskY as horizontal, height as vertical

    // Raw Camera Coordinates (before rotation)
    // Forward (Depth) axis: aligned with negative diskX
    const z_raw = camDist - diskX + 1.5;
    // Right axis: diskY
    const x_raw = diskY;
    // Up axis: height relative to camera
    const y_raw = (height - currentHeight) * 0.15 - camHeightOffset;

    // Apply Pitch Rotation (around X axis)
    // y' = y*cos(p) - z*sin(p)  <-- Standard rotation? 
    // Usually: 
    // y' = y*cos - z*sin
    // z' = y*sin + z*cos
    // But here z is depth.

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    const y_rot = y_raw * cosP + z_raw * sinP; // Rotated Up
    const z_rot = -y_raw * sinP + z_raw * cosP; // Rotated Depth

    // Perspective Projection
    const fov = 600;
    const depth = Math.max(0.1, z_rot);

    const screenX = canvas.width / 2 + (x_raw * fov) / depth;
    // Screen Y grows downwards, so we subtract y_rot
    // Increased offset to 250 to lower the car on screen
    const screenY = canvas.height / 2 - (y_rot * fov) / depth + 250;
    const scale = fov / depth;

    return { x: screenX, y: screenY, scale: scale, depth: depth };
}

// ============= GAME LOGIC =============

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
        case 'A': return Matrix.A_inv;
        case 'B': return Matrix.B_inv;
    }
}

// Input Handling
document.addEventListener('keydown', (e) => {
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
    }
});

function restartGame() {
    currentMatrix = Matrix.identity();
    currentHeight = 0;
    moveHistory = [];
    solutionIndex = 0;
    hasWon = false;
    isMoving = false;
    buildCayleyGraph(3, Matrix.identity());
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
    buildCayleyGraph(3, currentMatrix);
    updateUI(currentHeight);
}

function playNextSolutionMove() {
    if (solutionIndex >= solutionWord.length) return;
    const nextLabel = solutionWord[solutionIndex];
    triggerMove(getMatrixFromLabel(nextLabel), nextLabel);
    solutionIndex++;
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
    buildCayleyGraph(3, currentMatrix);
    updateUI(currentHeight);
    checkVictory();

    animStartTime = Date.now();

    function animate() {
        const elapsed = Date.now() - animStartTime;
        moveProgress = Math.min(elapsed / ANIM_DURATION, 1);

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
    if (currentHeight === 0 && moveHistory.length > 0) {
        hasWon = true;
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.style.display = 'none';
    }
}

function updateUI(height) {
    const matrixDiv = document.getElementById('matrix-display');
    const factored = currentMatrix.getFactoredForm();
    const { power2, power3, intMatrix } = factored;

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

    document.getElementById('height-value').innerText = height;
    document.getElementById('solution-progress').innerText = solutionIndex;
}

function invertMatrix(m) {
    const a = m.elements[0][0];
    const b = m.elements[0][1];
    const c = m.elements[1][0];
    const d = m.elements[1][1];
    return new Matrix(
        d, new Fraction(-b.numerator, b.denominator),
        new Fraction(-c.numerator, c.denominator), a
    );
}

function drawCar(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    // Car width is 80 units in local coords. We want it to be ~0.16 units in world space.
    // So scale factor = (0.16 * scale) / 80 = 0.002 * scale
    const s = Math.max(0.05, scale * 0.002);
    ctx.scale(s, s);

    // Car Body (Retro Boxy)
    ctx.fillStyle = '#01cdfe'; // Cyan
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#01cdfe';
    ctx.fillRect(-40, -20, 80, 20); // Main body
    ctx.fillRect(-30, -35, 60, 15); // Top

    // Tail lights
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(-35, -15, 10, 5);
    ctx.fillRect(25, -15, 10, 5);

    // Wheels
    ctx.fillStyle = '#000';
    ctx.fillRect(-35, 0, 15, 10);
    ctx.fillRect(20, 0, 15, 10);

    ctx.restore();
}

// ============= RENDERING =============

function drawVictoryScreen() {
    ctx.fillStyle = '#050011';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 60px "Press Start 2P", monospace';
    ctx.fillStyle = '#ff71ce';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff71ce';
    ctx.textAlign = 'center';
    ctx.fillText('VICTORY!', canvas.width / 2, 150);

    ctx.font = '20px "Press Start 2P", monospace';
    ctx.fillStyle = '#01cdfe';
    ctx.shadowColor = '#01cdfe';
    ctx.fillText('Identity Matrix Found!', canvas.width / 2, 220);

    ctx.shadowBlur = 0;
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#05ffa1';
    ctx.fillText('Press R to restart', canvas.width / 2, canvas.height - 50);
}

function draw() {
    // Clear with dark background
    ctx.fillStyle = '#050011';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (hasWon) {
        drawVictoryScreen();
        requestAnimationFrame(draw);
        return;
    }

    // Calculate View Transform (Inverse of Current Matrix)
    // This centers the world on the car
    const invCurrent = invertMatrix(currentMatrix);
    const invCurrentComplex = toComplexMatrix(invCurrent);

    // Animation interpolation
    let animTransform = { a: new Complex(1, 0), b: new Complex(0, 0), c: new Complex(0, 0), d: new Complex(1, 0) };

    if (isMoving && moveHistory.length > 0) {
        const lastMove = moveHistory[moveHistory.length - 1];
        let moveMat;
        switch (lastMove.moveLabel) {
            case 'a': moveMat = GEN_A; break;
            case 'A': moveMat = GEN_A_INV; break;
            case 'b': moveMat = GEN_B; break;
            case 'B': moveMat = GEN_B_INV; break;
        }

        const startMat = moveMat;
        const t = moveProgress;
        // Linear interpolation of matrix elements
        animTransform = {
            a: startMat.a.mul(new Complex(1 - t, 0)).add(new Complex(t, 0)),
            b: startMat.b.mul(new Complex(1 - t, 0)),
            c: startMat.c.mul(new Complex(1 - t, 0)),
            d: startMat.d.mul(new Complex(1 - t, 0)).add(new Complex(t, 0))
        };
    }

    // Draw Cayley graph edges as highways
    const drawnEdges = new Set();
    const edgesToDraw = [];

    cayleyGraph.forEach(node1 => {
        const moves = [
            { m: Matrix.A, l: 'a' },
            { m: Matrix.B, l: 'b' }
        ];

        // Calculate relative position of node1
        const relM1 = invCurrent.mul(node1.matrix);
        const relC1 = toComplexMatrix(relM1);

        // Apply animation transform (Mobius composition)
        const finalC1 = {
            a: animTransform.a.mul(relC1.a).add(animTransform.b.mul(relC1.c)),
            b: animTransform.a.mul(relC1.b).add(animTransform.b.mul(relC1.d)),
            c: animTransform.c.mul(relC1.a).add(animTransform.d.mul(relC1.c)),
            d: animTransform.c.mul(relC1.b).add(animTransform.d.mul(relC1.d))
        };

        const i = new Complex(0, 1);
        const z1_uhp = applyMobius(i, finalC1);
        const z1_disk = mapToDisk(z1_uhp);

        moves.forEach(move => {
            const nextMatrix = node1.matrix.mul(move.m);
            const node2 = cayleyGraph.find(n => n.matrix.toString() === nextMatrix.toString());

            if (node2) {
                const edgeKey = [node1.matrix.toString(), node2.matrix.toString()].sort().join('|');
                if (!drawnEdges.has(edgeKey)) {
                    drawnEdges.add(edgeKey);

                    // Calculate relative position of node2
                    const relM2 = invCurrent.mul(node2.matrix);
                    const relC2 = toComplexMatrix(relM2);
                    const finalC2 = {
                        a: animTransform.a.mul(relC2.a).add(animTransform.b.mul(relC2.c)),
                        b: animTransform.a.mul(relC2.b).add(animTransform.b.mul(relC2.d)),
                        c: animTransform.c.mul(relC2.a).add(animTransform.d.mul(relC2.c)),
                        d: animTransform.c.mul(relC2.b).add(animTransform.d.mul(relC2.d))
                    };

                    const z2_uhp = applyMobius(i, finalC2);
                    const z2_disk = mapToDisk(z2_uhp);

                    // Project 3D
                    const p1 = { x: z1_disk.re, y: z1_disk.im, z: node1.height };
                    const p2 = { x: z2_disk.re, y: z2_disk.im, z: node2.height };

                    const proj1 = project3D(p1.x, p1.y, p1.z);
                    const proj2 = project3D(p2.x, p2.y, p2.z);

                    // Only draw if in front of camera
                    if (proj1.depth > 0.1 && proj2.depth > 0.1) {
                        edgesToDraw.push({
                            proj1, proj2,
                            avgDepth: (proj1.depth + proj2.depth) / 2,
                            height1: node1.height,
                            height2: node2.height
                        });
                    }
                }
            }
        });

        // Store node projection for later
        node1.proj = project3D(z1_disk.re, z1_disk.im, node1.height);
    });

    // Sort edges by depth (far to near)
    edgesToDraw.sort((a, b) => b.avgDepth - a.avgDepth);

    // Draw highways (Roads)
    edgesToDraw.forEach(edge => {
        const avgHeight = (edge.height1 + edge.height2) / 2;

        // Colors
        let glowColor, laneColor;
        if (avgHeight === 0) {
            glowColor = '#05ffa1'; // Green for ground
            laneColor = 'rgba(5, 255, 161, 0.5)';
        } else {
            const hue = Math.max(0, 120 - Math.min(avgHeight / 6 * 120, 120));
            glowColor = `hsl(${hue}, 100%, 50%)`;
            laneColor = `hsla(${hue}, 100%, 70%, 0.6)`;
        }

        const p1 = edge.proj1;
        const p2 = edge.proj2;

        // Calculate road width based on scale
        const avgScale = (p1.scale + p2.scale) / 2;
        const roadWidth = Math.max(2, 0.15 * avgScale);

        // Direction vector for width
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        const nx = -dy / len * roadWidth;
        const ny = dx / len * roadWidth;

        // Draw Road Surface (Asphalt)
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.moveTo(p1.x + nx, p1.y + ny);
        ctx.lineTo(p2.x + nx, p2.y + ny);
        ctx.lineTo(p2.x - nx, p2.y - ny);
        ctx.lineTo(p1.x - nx, p1.y - ny);
        ctx.fill();

        // Draw Side Rails (Neon Glow)
        ctx.save();
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = Math.max(1, 0.02 * avgScale);
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor;

        ctx.beginPath();
        ctx.moveTo(p1.x + nx, p1.y + ny);
        ctx.lineTo(p2.x + nx, p2.y + ny);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x - nx, p1.y - ny);
        ctx.lineTo(p2.x - nx, p2.y - ny);
        ctx.stroke();
        ctx.restore();

        // Draw Center Lines (Dashed)
        ctx.save();
        ctx.strokeStyle = laneColor;
        ctx.lineWidth = Math.max(1, 0.01 * avgScale);
        ctx.setLineDash([10 * (avgScale / 100), 10 * (avgScale / 100)]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
    });

    // Draw nodes as Intersections (Simple Asphalt Junctions)
    cayleyGraph.forEach(node => {
        if (node.proj && node.proj.depth > 0.1) {
            const scale = node.proj.scale;
            // Radius matches road half-width (0.15 * scale) to create smooth joins
            const size = Math.max(2, 0.15 * scale);

            ctx.save();
            ctx.translate(node.proj.x, node.proj.y);

            // Junction surface (Asphalt) - matches road color to blend seamlessly
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    });

    // Draw Car at projected center position
    // Project (0,0) relative to current view (which is the car's position)
    const carProj = project3D(0, 0, currentHeight);
    drawCar(carProj.x, carProj.y, carProj.scale);

    // Draw highway signs for next moves
    if (!isMoving) {
        const nextMoves = getNextMoves();
        const signs = [
            { move: nextMoves.left, label: '◄', key: '←', offsetX: -180, desc: 'LEFT' },
            { move: nextMoves.up, label: '▲', key: '↑', offsetX: 0, desc: 'UP' },
            { move: nextMoves.right, label: '►', key: '→', offsetX: 180, desc: 'RIGHT' }
        ];

        signs.forEach(sign => {
            const nextMatrix = currentMatrix.mul(sign.move.matrix);
            const nextNode = cayleyGraph.find(n => n.matrix.toString() === nextMatrix.toString());

            if (nextNode) {
                const heightDelta = nextNode.height - currentHeight;
                const signY = 80;
                const signX = canvas.width / 2 + sign.offsetX;

                // Sign background
                ctx.fillStyle = 'rgba(5, 0, 17, 0.9)';
                ctx.fillRect(signX - 45, signY, 90, 90);

                // Sign border (glow)
                ctx.strokeStyle = '#ff71ce';
                ctx.lineWidth = 3;
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#ff71ce';
                ctx.strokeRect(signX - 45, signY, 90, 90);
                ctx.shadowBlur = 0;

                // Matrix Label
                ctx.fillStyle = '#01cdfe';
                ctx.font = 'bold 28px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sign.move.label, signX, signY + 30);

                // Height change indicator
                if (heightDelta !== 0) {
                    const deltaColor = heightDelta > 0 ? '#ff0055' : '#05ffa1';
                    ctx.fillStyle = deltaColor;
                    ctx.font = 'bold 16px "Press Start 2P"';
                    ctx.fillText((heightDelta > 0 ? '+' : '') + heightDelta, signX, signY + 55);
                }

                // Arrow hint
                ctx.fillStyle = '#fffb96';
                ctx.font = '20px "Press Start 2P"';
                ctx.fillText(sign.key, signX, signY + 75);
            }
        });
    }

    requestAnimationFrame(draw);
}

// Initialize
buildCayleyGraph(3, Matrix.identity());
updateUI(0);
draw();
