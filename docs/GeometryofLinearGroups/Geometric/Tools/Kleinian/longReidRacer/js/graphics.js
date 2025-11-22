const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ============= 3D PROJECTION =============

// Camera State
const camera = {
    yaw: 0,      // Rotation around Y axis (horizontal)
    pitch: 0.1,  // Rotation around X axis (vertical)
    dist: 0.8,   // Distance from target
    heightOffset: 0.1 // Vertical offset
};

// Mouse State
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// Event Listeners
canvas.addEventListener('mousedown', e => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    camera.yaw -= dx * 0.01;
    camera.pitch += dy * 0.01;

    // Clamp pitch
    // Allow looking down (negative) but limit looking up to avoid going below ground visual
    camera.pitch = Math.max(-1.0, Math.min(0.2, camera.pitch));
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camera.dist += e.deltaY * 0.001;
    camera.dist = Math.max(0.1, Math.min(5.0, camera.dist));
});

function project3D(diskX, diskY, height) {
    // World coords relative to car (car at 0,0,0)
    // X = Right (diskY)
    // Y = Up (height scaled)
    // Z = Forward (-diskX)

    const wx = diskY;
    const wy = (height - currentHeight) * 0.15;
    const wz = -diskX;

    // 1. Rotate around Y axis (Yaw)
    const cosY = Math.cos(camera.yaw);
    const sinY = Math.sin(camera.yaw);

    const x1 = wx * cosY - wz * sinY;
    const z1 = wx * sinY + wz * cosY;
    const y1 = wy;

    // 2. Rotate around X axis (Pitch)
    const cosP = Math.cos(camera.pitch);
    const sinP = Math.sin(camera.pitch);

    const y2 = y1 * cosP - z1 * sinP;
    const z2 = y1 * sinP + z1 * cosP;
    const x2 = x1;

    // 3. Translate by distance
    const z_final = z2 + camera.dist;
    const x_final = x2;
    const y_final = y2 - camera.heightOffset;

    // Perspective Projection
    const fov = 600;
    const depth = Math.max(0.1, z_final);

    const screenX = canvas.width / 2 + (x_final * fov) / depth;
    const screenY = canvas.height / 2 - (y_final * fov) / depth + 50;
    const scale = fov / depth;

    return { x: screenX, y: screenY, scale: scale, depth: depth };
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

// Draw victory screen with celebration
function drawVictoryScreen() {
    console.log('drawVictoryScreen called, hasWon:', hasWon, 'moveHistory.length:', moveHistory.length);

    // Clear everything first with a solid color
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset any transforms
    ctx.fillStyle = '#050011';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Animated stars/particles
    const time = Date.now() / 1000;
    for (let i = 0; i < 50; i++) {
        const x = (i * 123.456) % canvas.width;
        const y = ((i * 789.012 + time * 50) % canvas.height);
        const size = (i % 3) + 1;
        const hue = (i * 30 + time * 50) % 360;

        ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fillRect(x, y, size, size);
    }

    ctx.shadowBlur = 0;

    // Main "VICTORY!" text
    ctx.save();
    ctx.font = 'bold 80px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Pulsing effect
    const pulse = 1 + Math.sin(time * 3) * 0.1;
    ctx.translate(canvas.width / 2, canvas.height / 3);
    ctx.scale(pulse, pulse);

    // Rainbow gradient
    const gradient = ctx.createLinearGradient(-200, 0, 200, 0);
    gradient.addColorStop(0, '#ff71ce');
    gradient.addColorStop(0.5, '#01cdfe');
    gradient.addColorStop(1, '#05ffa1');

    ctx.fillStyle = gradient;
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff71ce';
    ctx.fillText('VICTORY!', 0, 0);

    ctx.restore();

    // Scrolling winning word
    victoryScrollX -= 3; // Scroll speed

    // Build the word string from move history
    const winningWord = moveHistory.map(m => m.moveLabel).join(' ');

    // Reset scroll when off screen
    ctx.font = '24px "Press Start 2P", monospace';
    const wordWidth = ctx.measureText(winningWord).width;
    if (victoryScrollX < -wordWidth - 100) {
        victoryScrollX = canvas.width;
    }

    // Draw scrolling text
    ctx.fillStyle = '#fffb96';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#fffb96';
    ctx.textAlign = 'left';
    ctx.fillText(winningWord, victoryScrollX, canvas.height / 2 + 50);

    // "Winning Matrix" label
    ctx.shadowBlur = 0;
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.fillStyle = '#01cdfe';
    ctx.textAlign = 'center';
    ctx.fillText('Winning Matrix:', canvas.width / 2, canvas.height - 280);

    // Display the winning matrix with large parentheses
    const factored = currentMatrix.getFactoredForm();
    const { intMatrix } = factored;

    const a = intMatrix[0][0].toString();
    const b = intMatrix[0][1].toString();
    const c = intMatrix[1][0].toString();
    const d = intMatrix[1][1].toString();

    // Calculate font size based on longest entry
    const maxLen = Math.max(a.length, b.length, c.length, d.length);
    const baseFontSize = 28;
    const fontSize = Math.max(10, Math.min(baseFontSize, Math.floor(280 / maxLen)));
    const rowHeight = Math.max(20, fontSize + 5);
    const colGap = fontSize; // Gap between columns

    // Measure actual text widths
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    const leftColWidth = Math.max(ctx.measureText(a).width, ctx.measureText(c).width);
    const rightColWidth = Math.max(ctx.measureText(b).width, ctx.measureText(d).width);
    const matrixWidth = leftColWidth + colGap + rightColWidth;
    const matrixHeight = rowHeight * 2 + fontSize;

    // Parenthesis size proportional to matrix height
    const parenSize = Math.max(40, matrixHeight * 1.2);

    // Draw matrix with proper formatting
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height - 160);

    // Large parentheses - positioned to fit around matrix
    ctx.font = `${parenSize}px "Press Start 2P", monospace`;
    ctx.fillStyle = '#ff71ce';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const parenOffset = matrixWidth / 2 + fontSize;
    ctx.fillText('(', -parenOffset, 0);
    ctx.fillText(')', parenOffset, 0);

    // Matrix entries
    ctx.font = `${fontSize}px "Press Start 2P", monospace`;
    ctx.fillStyle = '#fffb96';

    // Left column (right-aligned)
    ctx.textAlign = 'right';
    ctx.fillText(a, -colGap / 2, -rowHeight);
    ctx.fillText(c, -colGap / 2, rowHeight);

    // Right column (left-aligned)
    ctx.textAlign = 'left';
    ctx.fillText(b, colGap / 2, -rowHeight);
    ctx.fillText(d, colGap / 2, rowHeight);

    ctx.restore();

    // Instructions
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillStyle = '#05ffa1';
    ctx.textAlign = 'center';
    ctx.fillText('Press R to restart', canvas.width / 2, canvas.height - 50);
}

function drawBackground() {
    // 1. Sunset Sky (Retro Gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height / 2);
    gradient.addColorStop(0, '#050011'); // Deep purple/black top
    gradient.addColorStop(0.5, '#2a003b'); // Purple mid
    gradient.addColorStop(1, '#ff71ce'); // Pink horizon
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height / 2 + 50); // Sky covers top half + overlap

    // 2. Sun (Retro Sun without stripes)
    const sunY = canvas.height / 2 - 50;
    const sunSize = 80;

    ctx.save();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, sunY, sunSize, 0, Math.PI * 2);
    const sunGrad = ctx.createLinearGradient(0, sunY - sunSize, 0, sunY + sunSize);
    sunGrad.addColorStop(0, '#ffff00');
    sunGrad.addColorStop(1, '#ff00ff');
    ctx.fillStyle = sunGrad;
    ctx.fill();

    ctx.restore();

    // 3. Distant Mountains (Parallax)
    // We can use currentHeight or moveHistory length to simulate parallax
    const offset = (moveHistory.length * 10) % canvas.width;

    ctx.fillStyle = '#120024'; // Dark purple mountains
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2 + 50);

    // Generate mountain peaks
    for (let x = -100; x < canvas.width + 100; x += 50) {
        const h = 30 + Math.sin((x + offset) * 0.01) * 20 + Math.sin((x + offset) * 0.03) * 15;
        ctx.lineTo(x, canvas.height / 2 + 50 - h);
    }
    ctx.lineTo(canvas.width, canvas.height / 2 + 50);
    ctx.fill();

    // Ground Plane (Grid)
    ctx.fillStyle = '#050011'; // Dark ground
    ctx.fillRect(0, canvas.height / 2 + 50, canvas.width, canvas.height / 2 - 50);
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
    document.getElementById('solution-progress').innerText = moveHistory.length;

    const arrowInstr = document.getElementById('arrow-instructions');
    if (arrowInstr) {
        arrowInstr.style.display = moveHistory.length > 5 ? 'none' : 'inline';
    }
}

function draw() {
    // Clear with dark background
    ctx.fillStyle = '#050011';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawBackground();

    if (hasWon) {
        try {
            drawVictoryScreen();
        } catch (e) {
            console.error('Error in drawVictoryScreen:', e);
        }
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
            case 'A': case 'ai': moveMat = GEN_A_INV; break;
            case 'b': moveMat = GEN_B; break;
            case 'B': case 'bi': moveMat = GEN_B_INV; break;
            default: moveMat = { a: new Complex(1, 0), b: new Complex(0, 0), c: new Complex(0, 0), d: new Complex(1, 0) }; break;
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
                            height2: node2.height,
                            disk1: z1_disk,
                            disk2: z2_disk
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

    // Draw desert scenery on the ground plane (height 0) - before roads
    const scrollOffset = (moveHistory.length + moveProgress) * 0.5;
    const rangeX = 4.0;
    const numItems = 40;

    for (let i = 0; i < numItems; i++) {
        const baseX = (pseudoRandom(i) * rangeX) - rangeX + 0.5;
        let baseY = (pseudoRandom(i + 100) * 4.0) - 2.0;
        if (Math.abs(baseY) < 0.6) {
            baseY = baseY > 0 ? baseY + 0.6 : baseY - 0.6;
        }

        const type = pseudoRandom(i + 200) > 0.7 ? 'tumbleweed' : 'cactus';
        let x = (baseX + scrollOffset) % rangeX;
        if (x > 0.5) x -= rangeX;

        const proj = project3D(x, baseY, 0);

        if (proj.depth > 0.2 && proj.x > -50 && proj.x < canvas.width + 50) {
            ctx.save();
            if (type === 'cactus') {
                const size = proj.scale * 0.02;
                ctx.fillStyle = '#2d5016';
                ctx.fillRect(proj.x - size / 2, proj.y - size * 2, size, size * 2);
                ctx.fillRect(proj.x - size * 1.5, proj.y - size, size, size * 0.8);
                ctx.fillRect(proj.x + size / 2, proj.y - size * 1.5, size, size * 0.8);
            } else {
                const size = proj.scale * 0.015;
                ctx.strokeStyle = '#8b7355';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(proj.x - size, proj.y);
                ctx.lineTo(proj.x + size, proj.y);
                ctx.moveTo(proj.x, proj.y - size);
                ctx.lineTo(proj.x, proj.y + size);
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    // Draw highway supports at each intersection - before roads
    cayleyGraph.forEach(node => {
        if (node.height === 0) return;

        const relM = invCurrent.mul(node.matrix);
        const relC = toComplexMatrix(relM);
        const i = new Complex(0, 1);
        const z_uhp = applyMobius(i, relC);
        const z_disk = mapToDisk(z_uhp);

        const hyperbolicFactor = 1 - (z_disk.re * z_disk.re + z_disk.im * z_disk.im);
        const supportOpacity = Math.min(1, Math.max(0.1, hyperbolicFactor * 1.5));

        const baseProj = project3D(z_disk.re, z_disk.im, 0);
        const topProj = project3D(z_disk.re, z_disk.im, node.height);

        if (baseProj.depth < 0.1 || topProj.depth < 0.1) return;

        ctx.save();
        ctx.strokeStyle = `rgba(100, 100, 120, ${supportOpacity})`;
        ctx.lineWidth = Math.max(1, baseProj.scale * 0.01);
        ctx.beginPath();
        ctx.moveTo(baseProj.x, baseProj.y);
        ctx.lineTo(topProj.x, topProj.y);
        ctx.stroke();

        for (let h = 1; h <= node.height; h++) {
            const notchProj = project3D(z_disk.re, z_disk.im, h);
            if (notchProj.depth < 0.1) continue;

            const notchWidth = Math.max(2, notchProj.scale * 0.015);
            ctx.strokeStyle = `rgba(150, 150, 170, ${supportOpacity})`;
            ctx.lineWidth = Math.max(0.5, notchProj.scale * 0.005);
            ctx.beginPath();
            ctx.moveTo(notchProj.x - notchWidth, notchProj.y);
            ctx.lineTo(notchProj.x + notchWidth, notchProj.y);
            ctx.stroke();
        }
        ctx.restore();
    });

    // Draw highways (Roads)
    edgesToDraw.forEach(edge => {
        const z1 = edge.disk1;
        const z2 = edge.disk2;
        const h1 = edge.height1;
        const h2 = edge.height2;

        // Calculate hyperbolic scaling factor based on distance from origin (approx by depth/scale)
        // We want distant roads to be thinner and fainter
        const distFactor = Math.max(0, 1 - (1 / edge.proj1.scale) * 50); // Rough approx
        const opacity = Math.min(1, Math.max(0.1, edge.proj1.scale / 200));

        // Colors with opacity
        const glowColor = `rgba(255, 113, 206, ${opacity})`;
        const laneColor = `rgba(255, 113, 206, ${opacity * 0.5})`;

        // Generate geodesic points with hyperbolic distance info
        const steps = 16;
        const points = [];

        const z1_conj = z1.conj();
        const den1 = new Complex(1, 0).sub(z1_conj.mul(z2));
        const target = z2.sub(z1).div(den1);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const w = new Complex(target.re * t, target.im * t);
            const den2 = new Complex(1, 0).add(z1_conj.mul(w));
            const z = w.add(z1).div(den2);
            const h = h1 + (h2 - h1) * t;
            const proj = project3D(z.re, z.im, h);
            // Store hyperbolic distance factor (1 - |z|^2) which shrinks near boundary
            proj.hyperbolicFactor = 1 - (z.re * z.re + z.im * z.im);
            points.push(proj);
        }

        // Calculate strip points
        const leftPoints = [];
        const rightPoints = [];

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            let dx, dy;
            if (i < points.length - 1) {
                dx = points[i + 1].x - p.x;
                dy = points[i + 1].y - p.y;
            } else {
                dx = p.x - points[i - 1].x;
                dy = p.y - points[i - 1].y;
            }

            // Smooth tangents
            if (i > 0 && i < points.length - 1) {
                const dx2 = points[i].x - points[i - 1].x;
                const dy2 = points[i].y - points[i - 1].y;
                dx = (dx + dx2) / 2;
                dy = (dy + dy2) / 2;
            }

            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            // Hyperbolic width scaling: width decreases as we approach disk boundary
            // p.hyperbolicFactor = (1 - |z|^2), which is the conformal factor in Poincaré disk
            const hyperbolicScale = Math.max(0.1, p.hyperbolicFactor);
            const width = p.scale * 0.08 * hyperbolicScale * (opacity * 0.8 + 0.2);

            leftPoints.push({ x: p.x + nx * width, y: p.y + ny * width, hyperbolicFactor: p.hyperbolicFactor });
            rightPoints.push({ x: p.x - nx * width, y: p.y - ny * width, hyperbolicFactor: p.hyperbolicFactor });
        }

        // Draw Road Surface (Black)
        ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
        ctx.beginPath();
        ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < leftPoints.length; i++) ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
        for (let i = rightPoints.length - 1; i >= 0; i--) ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
        ctx.closePath();
        ctx.fill();

        // Draw Rails and Center Line (Segments)
        for (let i = 0; i < points.length - 1; i++) {
            const scale = points[i].scale;
            // Per-segment opacity based on hyperbolic distance (fades toward disk boundary)
            const segmentOpacity = Math.min(1, Math.max(0.05, points[i].hyperbolicFactor * 1.2));
            const segmentGlowColor = `rgba(255, 113, 206, ${segmentOpacity})`;
            const segmentLaneColor = `rgba(255, 113, 206, ${segmentOpacity * 0.5})`;

            ctx.save();
            ctx.strokeStyle = segmentGlowColor;
            ctx.shadowBlur = 10 * segmentOpacity;
            ctx.shadowColor = segmentGlowColor;
            ctx.lineWidth = Math.max(0.5, 0.02 * scale * segmentOpacity);

            // Left Rail
            ctx.beginPath();
            ctx.moveTo(leftPoints[i].x, leftPoints[i].y);
            ctx.lineTo(leftPoints[i + 1].x, leftPoints[i + 1].y);
            ctx.stroke();

            // Right Rail
            ctx.beginPath();
            ctx.moveTo(rightPoints[i].x, rightPoints[i].y);
            ctx.lineTo(rightPoints[i + 1].x, rightPoints[i + 1].y);
            ctx.stroke();
            ctx.restore();

            // Center Line
            ctx.save();
            ctx.strokeStyle = segmentLaneColor;
            ctx.lineWidth = Math.max(0.5, 0.01 * scale * segmentOpacity);
            ctx.setLineDash([10 * (scale / 100), 10 * (scale / 100)]);
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[i + 1].x, points[i + 1].y);
            ctx.stroke();
            ctx.restore();
        }
    });

    // Draw Car at projected center position
    const carProj = project3D(0, 0, currentHeight);

    // Always draw the car
    if (carProj.depth > 0.1) {
        drawCar(carProj.x, carProj.y, carProj.scale);
    } else {
        // Fallback: draw car at bottom center with visible scale
        // Scale 600 corresponds to depth ~1.0, giving reasonable size
        drawCar(canvas.width / 2, canvas.height - 100, 600);
    }

    // Draw highway signs for next moves
    if (!isMoving) {
        const nextMoves = getNextMoves();
        const signs = [
            { move: nextMoves.left, label: '◄', key: '◄', offsetX: -180, desc: 'LEFT' },
            { move: nextMoves.up, label: '▲', key: '▲', offsetX: 0, desc: 'UP' },
            { move: nextMoves.right, label: '►', key: '►', offsetX: 180, desc: 'RIGHT' }
        ];

        signs.forEach(sign => {
            const nextMatrix = currentMatrix.mul(sign.move.matrix);
            const nextNode = cayleyGraph.find(n => n.matrix.toString() === nextMatrix.toString());

            if (nextNode) {
                // Calculate sign position
                const signX = canvas.width / 2 + sign.offsetX;
                const signY = 80;
                const heightDelta = nextNode.height - currentHeight;

                // Determine color based on height change with brightness by magnitude
                let signColor;
                const absDelta = Math.abs(heightDelta);
                const intensity = Math.min(1, 0.4 + absDelta * 0.2); // 0.4 for ±1, up to 1.0 for ±3+

                if (heightDelta > 0) {
                    // Red - brighter for larger positive delta
                    const r = Math.floor(255 * intensity);
                    const g = Math.floor(0 * intensity);
                    const b = Math.floor(85 * intensity);
                    signColor = `rgb(${r}, ${g}, ${b})`;
                } else if (heightDelta < 0) {
                    // Green - brighter for larger negative delta
                    const r = Math.floor(5 * intensity);
                    const g = Math.floor(255 * intensity);
                    const b = Math.floor(161 * intensity);
                    signColor = `rgb(${r}, ${g}, ${b})`;
                } else {
                    signColor = '#ff71ce'; // Pink (0 change)
                }

                // Sign background (colored by height change)
                ctx.fillStyle = signColor;
                ctx.shadowBlur = 15;
                ctx.shadowColor = signColor;
                ctx.fillRect(signX - 45, signY, 90, 90);
                ctx.shadowBlur = 0;

                // Matrix Label
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 28px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sign.move.label, signX, signY + 30);

                // Height change indicator (always show, including 0)
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px "Press Start 2P"';
                ctx.fillText((heightDelta > 0 ? '+' : '') + heightDelta, signX, signY + 55);

                // Arrow hint (drawn manually for consistency)
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                const arrowY = signY + 75;
                const arrowSize = 10;
                if (sign.desc === 'LEFT') {
                    ctx.moveTo(signX - arrowSize, arrowY);
                    ctx.lineTo(signX + arrowSize, arrowY - arrowSize);
                    ctx.lineTo(signX + arrowSize, arrowY + arrowSize);
                } else if (sign.desc === 'UP') {
                    ctx.moveTo(signX, arrowY - arrowSize);
                    ctx.lineTo(signX + arrowSize, arrowY + arrowSize);
                    ctx.lineTo(signX - arrowSize, arrowY + arrowSize);
                } else if (sign.desc === 'RIGHT') {
                    ctx.moveTo(signX + arrowSize, arrowY);
                    ctx.lineTo(signX - arrowSize, arrowY - arrowSize);
                    ctx.lineTo(signX - arrowSize, arrowY + arrowSize);
                }
                ctx.closePath();
                ctx.fill();
            }
        });
    }

    requestAnimationFrame(draw);
}
