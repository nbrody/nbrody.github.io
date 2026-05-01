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

    // Subtle ground glow under the chassis
    const glowGrad = ctx.createRadialGradient(0, 8, 4, 0, 8, 70);
    glowGrad.addColorStop(0, 'rgba(1, 205, 254, 0.55)');
    glowGrad.addColorStop(1, 'rgba(1, 205, 254, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-70, -10, 140, 40);

    // Lower chassis (dark plate)
    ctx.fillStyle = '#0a1530';
    ctx.fillRect(-44, -4, 88, 12);

    // Car Body (Retro Boxy) — main cyan body
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#01cdfe';
    ctx.fillStyle = '#01cdfe';
    ctx.fillRect(-40, -22, 80, 22); // Main body
    ctx.shadowBlur = 0;

    // Cabin / cockpit roof
    ctx.fillStyle = '#062a4d';
    ctx.fillRect(-28, -38, 56, 16);
    // Windshield strip (magenta tinted glass)
    const glassGrad = ctx.createLinearGradient(0, -36, 0, -22);
    glassGrad.addColorStop(0, '#ff71ce');
    glassGrad.addColorStop(1, '#732858');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(-24, -35, 48, 10);

    // Body outline (white pixel rim)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-40, -22, 80, 22);
    ctx.strokeRect(-28, -38, 56, 16);

    // Side stripe accent
    ctx.fillStyle = '#ff71ce';
    ctx.fillRect(-40, -8, 80, 2);

    // Headlights (front)
    ctx.fillStyle = '#fffb96';
    ctx.fillRect(36, -16, 4, 6);
    ctx.fillRect(-40, -16, 4, 6);

    // Tail lights (rear strip)
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(-36, -2, 8, 4);
    ctx.fillRect(28, -2, 8, 4);

    // Wheel housing (vents instead of literal wheels for hover-car feel)
    ctx.fillStyle = '#000';
    ctx.fillRect(-35, 4, 14, 6);
    ctx.fillRect(21, 4, 14, 6);

    // Vent stripes
    ctx.strokeStyle = '#01cdfe';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-33 + i * 4, 5);
        ctx.lineTo(-33 + i * 4, 9);
        ctx.moveTo(23 + i * 4, 5);
        ctx.lineTo(23 + i * 4, 9);
        ctx.stroke();
    }

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

// Pre-baked star field — sprinkled in the upper sky for night-mood synthwave
const _stars = (function () {
    const out = [];
    let s = 1234567;
    function r() { s = (s * 1103515245 + 12345) | 0; return ((s >>> 0) % 1000) / 1000; }
    for (let i = 0; i < 70; i++) {
        out.push({
            x: r() * 800,
            y: r() * 220,                 // upper portion of the sky only
            size: r() < 0.85 ? 1 : 2,
            offset: r() * 6.28,
            color: r() < 0.6 ? '#ffffff' : (r() < 0.5 ? '#01cdfe' : '#ff71ce')
        });
    }
    return out;
})();

function drawBackground() {
    const horizonY = canvas.height / 2 + 50;

    // 1. Sky gradient — deep cosmic top fading down through purple to a hot pink horizon
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#070018');
    skyGrad.addColorStop(0.45, '#2a003b');
    skyGrad.addColorStop(0.85, '#9c1f6e');
    skyGrad.addColorStop(1, '#ff71ce');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, horizonY);

    // 2. Stars (subtle twinkle so the upper sky has texture)
    const t = Date.now() / 1000;
    for (const star of _stars) {
        const a = 0.5 + 0.5 * Math.sin(t * 2 + star.offset);
        ctx.globalAlpha = a;
        ctx.fillStyle = star.color;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;

    // 3. Synthwave Sun — gradient orb with horizontal slits in the lower half + halo
    const sunCx = canvas.width / 2;
    const sunCy = horizonY - 50;
    const sunR = 84;

    // Halo behind the sun
    const halo = ctx.createRadialGradient(sunCx, sunCy, sunR * 0.7, sunCx, sunCy, sunR * 2.2);
    halo.addColorStop(0, 'rgba(255, 138, 60, 0.35)');
    halo.addColorStop(1, 'rgba(255, 138, 60, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sunCx - sunR * 2.2, sunCy - sunR * 2.2, sunR * 4.4, sunR * 4.4);

    // Sun disc (yellow-to-magenta vertical gradient)
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
    const sunGrad = ctx.createLinearGradient(0, sunCy - sunR, 0, sunCy + sunR);
    sunGrad.addColorStop(0, '#fff36b');
    sunGrad.addColorStop(0.45, '#ff8a3c');
    sunGrad.addColorStop(1, '#ff2a8d');
    ctx.fillStyle = sunGrad;
    ctx.fill();

    // Horizontal slits — punch out increasingly thick bands toward the bottom
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    for (let i = 0; i < 6; i++) {
        const yy = sunCy + 8 + i * 12;
        const yh = 3 + i * 1.4;
        ctx.fillRect(sunCx - sunR, yy, sunR * 2, yh);
    }
    ctx.restore();

    // 4. Distant Mountains — two parallax layers for depth
    // Layer A (far): low and faded
    const farOffset = (moveHistory.length * 4 + moveProgress * 4) % canvas.width;
    ctx.fillStyle = '#3b0d4f';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = -120; x <= canvas.width + 120; x += 30) {
        const h = 22 + Math.sin((x + farOffset) * 0.013) * 14 + Math.sin((x + farOffset) * 0.041) * 7;
        ctx.lineTo(x, horizonY - h);
    }
    ctx.lineTo(canvas.width, horizonY);
    ctx.fill();

    // Faint pink rim along far range
    ctx.strokeStyle = 'rgba(255, 113, 206, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -120; x <= canvas.width + 120; x += 30) {
        const h = 22 + Math.sin((x + farOffset) * 0.013) * 14 + Math.sin((x + farOffset) * 0.041) * 7;
        const px = x;
        const py = horizonY - h;
        if (x === -120) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Layer B (near): taller, darker, scrolls faster
    const nearOffset = (moveHistory.length * 10 + moveProgress * 10) % canvas.width;
    ctx.fillStyle = '#160028';
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let x = -120; x <= canvas.width + 120; x += 50) {
        const h = 36 + Math.sin((x + nearOffset) * 0.011) * 22 + Math.sin((x + nearOffset) * 0.031) * 12;
        ctx.lineTo(x, horizonY - h);
    }
    ctx.lineTo(canvas.width, horizonY);
    ctx.fill();

    // Bright neon outline along the near silhouette
    ctx.strokeStyle = 'rgba(255, 113, 206, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = -120; x <= canvas.width + 120; x += 50) {
        const h = 36 + Math.sin((x + nearOffset) * 0.011) * 22 + Math.sin((x + nearOffset) * 0.031) * 12;
        const px = x;
        const py = horizonY - h;
        if (x === -120) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 5. Ground Plane fill (dark, the actual desert grid is drawn over this in draw())
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
    groundGrad.addColorStop(0, '#1a002e');
    groundGrad.addColorStop(1, '#050011');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

    // 6. Glowing horizon line where ground meets sky
    const horizonGlow = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 8);
    horizonGlow.addColorStop(0, 'rgba(255, 251, 150, 0)');
    horizonGlow.addColorStop(0.5, 'rgba(255, 251, 150, 0.45)');
    horizonGlow.addColorStop(1, 'rgba(255, 251, 150, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, horizonY - 4, canvas.width, 12);
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

// ============== DESERT SCENERY ==============
// Replaces the original cactus/tumbleweed sprites with retro synthwave
// silhouettes: pyramids (wireframe), palm trees, and tall obelisks.
// Items are placed pseudo-randomly along the ground (height 0) and parallax-scroll.
function drawSceneryItem(type, proj) {
    const scale = proj.scale;
    if (scale < 6) return; // way too far, skip

    if (type === 'pyramid') {
        // Wireframe pyramid: triangle outline with neon edge + faint fill
        const w = scale * 0.045;
        const h = scale * 0.055;
        const cx = proj.x;
        const baseY = proj.y;
        const apexY = baseY - h;

        // Filled silhouette (very dark, slightly translucent)
        ctx.fillStyle = 'rgba(8, 0, 24, 0.85)';
        ctx.beginPath();
        ctx.moveTo(cx - w, baseY);
        ctx.lineTo(cx + w, baseY);
        ctx.lineTo(cx, apexY);
        ctx.closePath();
        ctx.fill();

        // Neon outline
        ctx.strokeStyle = 'rgba(1, 205, 254, 0.9)';
        ctx.lineWidth = Math.max(1, scale * 0.0035);
        ctx.beginPath();
        ctx.moveTo(cx - w, baseY);
        ctx.lineTo(cx + w, baseY);
        ctx.lineTo(cx, apexY);
        ctx.closePath();
        ctx.stroke();

        // Center vertical edge for the "front face"
        ctx.strokeStyle = 'rgba(1, 205, 254, 0.55)';
        ctx.lineWidth = Math.max(0.5, scale * 0.002);
        ctx.beginPath();
        ctx.moveTo(cx, baseY);
        ctx.lineTo(cx, apexY);
        ctx.stroke();
    } else if (type === 'palm') {
        // Retro palm: dark trunk with a curve, and 5 fronds at the top
        const trunkH = scale * 0.075;
        const trunkW = Math.max(1, scale * 0.005);
        const cx = proj.x;
        const baseY = proj.y;
        const topY = baseY - trunkH;

        // Trunk (dark with magenta rim)
        ctx.strokeStyle = '#1a0a18';
        ctx.lineWidth = trunkW * 2.2;
        ctx.beginPath();
        ctx.moveTo(cx, baseY);
        ctx.quadraticCurveTo(cx + trunkH * 0.07, baseY - trunkH * 0.55, cx, topY);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 113, 206, 0.85)';
        ctx.lineWidth = Math.max(1, trunkW);
        ctx.stroke();

        // Fronds
        const frondLen = scale * 0.038;
        const frondAngles = [-1.05, -0.55, 0, 0.55, 1.05];
        ctx.strokeStyle = 'rgba(5, 255, 161, 0.9)';
        ctx.lineWidth = Math.max(1, scale * 0.0028);
        for (const ang of frondAngles) {
            const fx = cx + Math.sin(ang) * frondLen;
            const fy = topY - Math.cos(ang) * frondLen * 0.85;
            // Curve down-and-out: control point pulls fronds into a droop
            const mx = cx + Math.sin(ang) * frondLen * 0.55;
            const my = topY - Math.cos(ang) * frondLen * 0.95;
            ctx.beginPath();
            ctx.moveTo(cx, topY);
            ctx.quadraticCurveTo(mx, my, fx, fy);
            ctx.stroke();
        }

        // Bright dot at the canopy crown
        ctx.fillStyle = 'rgba(255, 251, 150, 0.85)';
        ctx.beginPath();
        ctx.arc(cx, topY, Math.max(1.2, scale * 0.004), 0, Math.PI * 2);
        ctx.fill();
    } else { // 'obelisk'
        // Glowing obelisk: a tall thin rectangle with a triangular cap and side light strips
        const w = scale * 0.014;
        const h = scale * 0.085;
        const cx = proj.x;
        const baseY = proj.y;
        const topY = baseY - h;

        // Body
        ctx.fillStyle = 'rgba(10, 0, 28, 0.92)';
        ctx.fillRect(cx - w, topY + h * 0.18, w * 2, h * 0.82);

        // Cap (triangle)
        ctx.beginPath();
        ctx.moveTo(cx - w, topY + h * 0.18);
        ctx.lineTo(cx + w, topY + h * 0.18);
        ctx.lineTo(cx, topY);
        ctx.closePath();
        ctx.fill();

        // Side light strips
        ctx.strokeStyle = 'rgba(255, 113, 206, 0.95)';
        ctx.lineWidth = Math.max(1, scale * 0.003);
        ctx.beginPath();
        ctx.moveTo(cx - w, topY + h * 0.18);
        ctx.lineTo(cx - w, baseY);
        ctx.moveTo(cx + w, topY + h * 0.18);
        ctx.lineTo(cx + w, baseY);
        ctx.stroke();

        // Cap outline
        ctx.strokeStyle = 'rgba(1, 205, 254, 0.9)';
        ctx.lineWidth = Math.max(1, scale * 0.0028);
        ctx.beginPath();
        ctx.moveTo(cx - w, topY + h * 0.18);
        ctx.lineTo(cx + w, topY + h * 0.18);
        ctx.lineTo(cx, topY);
        ctx.closePath();
        ctx.stroke();

        // Crown glow dot
        ctx.fillStyle = 'rgba(255, 251, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(cx, topY + h * 0.05, Math.max(1.3, scale * 0.004), 0, Math.PI * 2);
        ctx.fill();
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
    const invCurrent = invertMatrix(currentMatrix);
    const i_complex = new Complex(0, 1);

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

    // 1. Prepare Nodes (Project all nodes first)
    // Map matrix string -> { z_disk, proj, height }
    const nodeData = new Map();

    cayleyGraph.forEach(node => {
        // Calculate relative position
        const relM = invCurrent.mul(node.matrix);
        // Optimization: In a real heavy app, we'd cache toComplexMatrix(relM)
        // if !isMoving, but this first pass is already a big improvement.
        const relC = toComplexMatrix(relM);

        // Apply animation transform (Mobius composition)
        const finalC = {
            a: animTransform.a.mul(relC.a).add(animTransform.b.mul(relC.c)),
            b: animTransform.a.mul(relC.b).add(animTransform.b.mul(relC.d)),
            c: animTransform.c.mul(relC.a).add(animTransform.d.mul(relC.c)),
            d: animTransform.c.mul(relC.b).add(animTransform.d.mul(relC.d))
        };

        const z_uhp = applyMobius(i_complex, finalC);
        const z_disk = mapToDisk(z_uhp);
        const proj = project3D(z_disk.re, z_disk.im, node.height);

        // Store for edge lookup
        nodeData.set(node.matrix.toString(), {
            node: node,
            z_disk: z_disk,
            proj: proj,
            height: node.height
        });

        // Store node proj for later usages (labels, etc)
        node.proj = proj;
    });

    // 2. Collect Edges
    const drawnEdges = new Set();
    const edgesToDraw = [];
    const moves = [
        { m: Matrix.A, l: 'a' },
        { m: Matrix.B, l: 'b' }
    ];

    cayleyGraph.forEach(node1 => {
        const d1 = nodeData.get(node1.matrix.toString());
        if (!d1) return;

        moves.forEach(move => {
            const nextMatrix = node1.matrix.mul(move.m);
            const key2 = nextMatrix.toString();
            const d2 = nodeData.get(key2);

            if (d2) {
                const edgeKey = [node1.matrix.toString(), key2].sort().join('|');
                if (!drawnEdges.has(edgeKey)) {
                    drawnEdges.add(edgeKey);

                    // Visibility Check
                    if (d1.proj.depth > 0.1 && d2.proj.depth > 0.1) {
                        edgesToDraw.push({
                            proj1: d1.proj,
                            proj2: d2.proj,
                            avgDepth: (d1.proj.depth + d2.proj.depth) / 2,
                            height1: d1.height,
                            height2: d2.height,
                            disk1: d1.z_disk,
                            disk2: d2.z_disk
                        });
                    }
                }
            }
        });
    });

    // Sort edges by depth (far to near)
    edgesToDraw.sort((a, b) => b.avgDepth - a.avgDepth);

    // ============== DESERT SCENERY (drawn before roads so roads sit on top) ==============
    // Three item types — pyramids, palms, obelisks — placed deterministically by index
    // so they don't jitter, but parallax-scroll with progress through the level.
    const scrollOffset = (moveHistory.length + moveProgress) * 0.5;
    const rangeX = 4.0;
    const numItems = 44;
    const itemTypes = ['pyramid', 'palm', 'obelisk'];

    // Build a list of projected items sorted by depth so far ones render before near ones.
    const sceneryItems = [];
    for (let i = 0; i < numItems; i++) {
        // Place across width, push items off the central road corridor
        const baseX = (pseudoRandom(i) * rangeX) - rangeX + 0.5;
        let baseY = (pseudoRandom(i + 100) * 4.0) - 2.0;
        if (Math.abs(baseY) < 0.7) {
            baseY = baseY > 0 ? baseY + 0.7 : baseY - 0.7;
        }

        // Type chosen by hashing the index into 0/1/2
        const typeIdx = Math.floor(pseudoRandom(i + 200) * 3);
        const type = itemTypes[typeIdx];

        // Parallax scroll
        let x = (baseX + scrollOffset) % rangeX;
        if (x > 0.5) x -= rangeX;

        const proj = project3D(x, baseY, 0);
        if (proj.depth > 0.2 && proj.x > -100 && proj.x < canvas.width + 100) {
            sceneryItems.push({ type, proj });
        }
    }
    sceneryItems.sort((a, b) => b.proj.depth - a.proj.depth);
    for (const item of sceneryItems) {
        drawSceneryItem(item.type, item.proj);
    }

    // ============== HIGHWAY SUPPORTS ==============
    // Vertical struts under each elevated node (height > 0), with notch markers per level
    cayleyGraph.forEach(node => {
        if (node.height === 0) return;
        const d = nodeData.get(node.matrix.toString());
        if (!d || d.proj.depth < 0.1) return;

        const z_disk = d.z_disk;
        const baseProj = project3D(z_disk.re, z_disk.im, 0);
        if (baseProj.depth < 0.1) return;

        const hyperbolicFactor = 1 - (z_disk.re * z_disk.re + z_disk.im * z_disk.im);
        const supportOpacity = Math.min(1, Math.max(0.1, hyperbolicFactor * 1.5));

        const topProj = d.proj;

        ctx.save();
        // Strut shaft — slim purple, with a faint magenta rim
        ctx.strokeStyle = `rgba(120, 90, 160, ${supportOpacity})`;
        ctx.lineWidth = Math.max(1, baseProj.scale * 0.012);
        ctx.beginPath();
        ctx.moveTo(baseProj.x, baseProj.y);
        ctx.lineTo(topProj.x, topProj.y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 113, 206, ${supportOpacity * 0.55})`;
        ctx.lineWidth = Math.max(0.5, baseProj.scale * 0.005);
        ctx.beginPath();
        ctx.moveTo(baseProj.x, baseProj.y);
        ctx.lineTo(topProj.x, topProj.y);
        ctx.stroke();

        for (let h = 1; h <= node.height; h++) {
            const notchProj = project3D(z_disk.re, z_disk.im, h);
            if (notchProj.depth < 0.1) continue;

            const notchWidth = Math.max(2, notchProj.scale * 0.015);
            ctx.strokeStyle = `rgba(180, 160, 220, ${supportOpacity})`;
            ctx.lineWidth = Math.max(0.6, notchProj.scale * 0.005);
            ctx.beginPath();
            ctx.moveTo(notchProj.x - notchWidth, notchProj.y);
            ctx.lineTo(notchProj.x + notchWidth, notchProj.y);
            ctx.stroke();
        }
        ctx.restore();
    });

    // ============== HIGHWAYS (roads / Cayley graph edges) ==============
    // Each edge becomes a curved hyperbolic geodesic strip. The strip has:
    //   - a dark surface gradient (darker in the middle, slightly lighter edges)
    //   - magenta neon rails (with a wide soft pass + a tight bright core)
    //   - a scrolling dashed center line in cyan
    const lineDashPhase = (moveHistory.length * 4 + moveProgress * 24) % 1;

    edgesToDraw.forEach(edge => {
        const z1 = edge.disk1;
        const z2 = edge.disk2;
        const h1 = edge.height1;
        const h2 = edge.height2;

        const opacity = Math.min(1, Math.max(0.12, edge.proj1.scale / 200));

        const steps = 12;
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
            proj.hyperbolicFactor = 1 - (z.re * z.re + z.im * z.im);
            points.push(proj);
        }

        // Build the road strip: parallel offsets to left/right of the spine
        const leftPoints = [];
        const rightPoints = [];

        for (let i = 0; i < points.length; i++) {
            const p = points[i];

            if (p.depth < 0.1) {
                leftPoints.push({ x: p.x, y: p.y, hyperbolicFactor: p.hyperbolicFactor });
                rightPoints.push({ x: p.x, y: p.y, hyperbolicFactor: p.hyperbolicFactor });
                continue;
            }

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

            const hyperbolicScale = Math.max(0.1, p.hyperbolicFactor);
            const width = p.scale * 0.085 * hyperbolicScale * (opacity * 0.8 + 0.2);

            leftPoints.push({ x: p.x + nx * width, y: p.y + ny * width, hyperbolicFactor: p.hyperbolicFactor });
            rightPoints.push({ x: p.x - nx * width, y: p.y - ny * width, hyperbolicFactor: p.hyperbolicFactor });
        }

        // --- Road surface fill (subtle gradient) ---
        if (leftPoints.length > 1) {
            const midIdx = Math.floor(leftPoints.length / 2);
            const surfGrad = ctx.createLinearGradient(
                leftPoints[midIdx].x, leftPoints[midIdx].y,
                rightPoints[midIdx].x, rightPoints[midIdx].y
            );
            surfGrad.addColorStop(0, `rgba(60, 16, 78, ${opacity * 0.95})`);
            surfGrad.addColorStop(0.5, `rgba(8, 0, 24, ${opacity * 0.95})`);
            surfGrad.addColorStop(1, `rgba(60, 16, 78, ${opacity * 0.95})`);
            ctx.fillStyle = surfGrad;
            ctx.beginPath();
            ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
            for (let i = 1; i < leftPoints.length; i++) ctx.lineTo(leftPoints[i].x, leftPoints[i].y);
            for (let i = rightPoints.length - 1; i >= 0; i--) ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
            ctx.closePath();
            ctx.fill();
        }

        // --- Tick marks across the road every couple segments (zebra texture) ---
        ctx.strokeStyle = `rgba(180, 60, 140, ${opacity * 0.35})`;
        for (let i = 1; i < points.length - 1; i += 2) {
            const segScale = points[i].scale;
            ctx.lineWidth = Math.max(0.5, segScale * 0.004);
            ctx.beginPath();
            ctx.moveTo(leftPoints[i].x, leftPoints[i].y);
            ctx.lineTo(rightPoints[i].x, rightPoints[i].y);
            ctx.stroke();
        }

        // --- Rails: wide soft pass + tight bright core ---
        for (let i = 0; i < points.length - 1; i++) {
            if (points[i].depth < 0.1 && points[i + 1].depth < 0.1) continue;

            const scale = points[i].scale;
            const segOpacity = Math.min(1, Math.max(0.05, points[i].hyperbolicFactor * 1.2));

            // Soft outer glow
            ctx.lineWidth = Math.max(1.2, 0.075 * scale * segOpacity);
            ctx.strokeStyle = `rgba(255, 113, 206, ${segOpacity * 0.22})`;
            ctx.beginPath();
            ctx.moveTo(leftPoints[i].x, leftPoints[i].y);
            ctx.lineTo(leftPoints[i + 1].x, leftPoints[i + 1].y);
            ctx.moveTo(rightPoints[i].x, rightPoints[i].y);
            ctx.lineTo(rightPoints[i + 1].x, rightPoints[i + 1].y);
            ctx.stroke();

            // Tight bright core
            ctx.lineWidth = Math.max(0.7, 0.025 * scale * segOpacity);
            ctx.strokeStyle = `rgba(255, 200, 240, ${segOpacity})`;
            ctx.beginPath();
            ctx.moveTo(leftPoints[i].x, leftPoints[i].y);
            ctx.lineTo(leftPoints[i + 1].x, leftPoints[i + 1].y);
            ctx.moveTo(rightPoints[i].x, rightPoints[i].y);
            ctx.lineTo(rightPoints[i + 1].x, rightPoints[i + 1].y);
            ctx.stroke();
        }

        // --- Center dashed line — animated cyan, scrolls with progress ---
        ctx.save();
        for (let i = 0; i < points.length - 1; i++) {
            if (points[i].depth < 0.1 && points[i + 1].depth < 0.1) continue;
            const scale = points[i].scale;
            const segOpacity = Math.min(1, Math.max(0.05, points[i].hyperbolicFactor * 1.2));
            const dashLen = Math.max(4, 12 * (scale / 100));
            const dashOff = lineDashPhase * dashLen * 2;
            ctx.setLineDash([dashLen, dashLen]);
            ctx.lineDashOffset = -dashOff;
            ctx.strokeStyle = `rgba(1, 205, 254, ${segOpacity * 0.85})`;
            ctx.lineWidth = Math.max(0.7, 0.018 * scale * segOpacity);
            ctx.beginPath();
            ctx.moveTo(points[i].x, points[i].y);
            ctx.lineTo(points[i + 1].x, points[i + 1].y);
            ctx.stroke();
        }
        ctx.restore();
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
