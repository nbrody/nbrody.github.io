// ============================================================
//  renderer.js  –  Background parallax layers & terrain drawing
// ============================================================
const Renderer = (() => {

    // ─── Colour palettes ───
    const SKY_GRADIENT = ['#3CA0E8', '#5CBCF6', '#88D4FF', '#B0E4FF', '#D4F0FF'];
    const WATER_COL = 'rgba(0,80,200,0.35)';
    const CLOUD_COL = 'rgba(255,255,255,0.85)';

    // Green Hill Zone checkered ground colours
    const CHECKER_A1 = '#2DC828'; // lighter green
    const CHECKER_A2 = '#188B14'; // darker green
    const CHECKER_B1 = '#D47800'; // light brown
    const CHECKER_B2 = '#A05000'; // dark brown

    // pre-generated clouds
    let clouds = [];
    function initClouds() {
        clouds = [];
        for (let i = 0; i < 28; i++) {
            clouds.push({
                x: Math.random() * 8000,
                y: 30 + Math.random() * 180,
                w: 60 + Math.random() * 120,
                h: 20 + Math.random() * 30,
                speed: 0.05 + Math.random() * 0.12
            });
        }
    }
    initClouds();

    // ─── Mountains (background layer) ───
    let mountains = [];
    function initMountains() {
        mountains = [];
        let mx = 0;
        while (mx < 10000) {
            const w = 200 + Math.random() * 300;
            const h = 100 + Math.random() * 200;
            mountains.push({ x: mx, w, h, color: `hsl(${130 + Math.random() * 30}, ${40 + Math.random() * 20}%, ${30 + Math.random() * 15}%)` });
            mx += w * 0.7;
        }
    }
    initMountains();

    // ─── Draw sky gradient ───
    function drawSky(ctx, W, H) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        SKY_GRADIENT.forEach((c, i) => grad.addColorStop(i / (SKY_GRADIENT.length - 1), c));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // ─── Parallax layers ───
    function drawBackground(ctx, W, H, camX, camY) {
        drawSky(ctx, W, H);

        // Clouds (very slow parallax)
        const cParallax = 0.05;
        ctx.fillStyle = CLOUD_COL;
        clouds.forEach(c => {
            const sx = ((c.x - camX * cParallax) % (W + c.w * 2)) - c.w;
            // draw fluffy cloud shape
            ctx.beginPath();
            ctx.ellipse(sx, c.y - camY * 0.02, c.w * 0.5, c.h * 0.5, 0, 0, Math.PI * 2);
            ctx.ellipse(sx - c.w * 0.25, c.y + c.h * 0.15 - camY * 0.02, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
            ctx.ellipse(sx + c.w * 0.25, c.y + c.h * 0.1 - camY * 0.02, c.w * 0.3, c.h * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
        });

        // Mountains (slow parallax)
        const mParallax = 0.15;
        mountains.forEach(m => {
            const sx = m.x - camX * mParallax;
            if (sx > -m.w && sx < W + m.w) {
                ctx.fillStyle = m.color;
                ctx.beginPath();
                ctx.moveTo(sx, H * 0.65 - camY * 0.1);
                ctx.lineTo(sx + m.w * 0.5, H * 0.65 - m.h - camY * 0.1);
                ctx.lineTo(sx + m.w, H * 0.65 - camY * 0.1);
                ctx.fill();
            }
        });

        // Distant green hills (medium parallax)
        drawHills(ctx, W, H, camX * 0.3, camY * 0.15, '#2AA52A', H * 0.7);
        drawHills(ctx, W, H, camX * 0.5, camY * 0.2, '#36C836', H * 0.75);
    }

    function drawHills(ctx, W, H, offsetX, offsetY, color, baseY) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-10, H);
        for (let x = -10; x <= W + 10; x += 5) {
            const worldX = x + offsetX;
            const y = baseY - offsetY +
                Math.sin(worldX * 0.003) * 40 +
                Math.sin(worldX * 0.007 + 1) * 25 +
                Math.sin(worldX * 0.013 + 2) * 15;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(W + 10, H);
        ctx.fill();
    }

    // ─── Checkered terrain ───
    function drawTerrain(ctx, W, H, camX, camY, terrainSegments) {
        const TILE = 32;
        terrainSegments.forEach(seg => {
            const sx = seg.x - camX;
            const sy = seg.y - camY;
            const sw = seg.w;
            const sh = seg.h || 256;

            if (sx + sw < -64 || sx > W + 64) return;

            // Draw checkered pattern
            const startCol = Math.floor(Math.max(0, -sx) / TILE);
            const endCol = Math.ceil(Math.min(sw, W - sx + 64) / TILE);
            const startRow = 0;
            const endRow = Math.ceil(sh / TILE);

            for (let r = startRow; r < endRow; r++) {
                for (let c = startCol; c < endCol; c++) {
                    const tx = sx + c * TILE;
                    const ty = sy + r * TILE;
                    if (tx > W + TILE || tx < -TILE || ty > H + TILE || ty < -TILE) continue;
                    const checker = (c + r) % 2 === 0;
                    if (r === 0) {
                        ctx.fillStyle = checker ? CHECKER_A1 : CHECKER_A2;
                    } else {
                        ctx.fillStyle = checker ? CHECKER_B1 : CHECKER_B2;
                    }
                    ctx.fillRect(tx, ty, TILE + 1, TILE + 1);
                }
            }

            // Grass tufts on top edge
            ctx.fillStyle = '#00C800';
            for (let gx = 0; gx < sw; gx += 12) {
                const px = sx + gx;
                if (px < -20 || px > W + 20) continue;
                const py = sy;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(px + 4, py - 8 - Math.sin(gx * 0.5) * 3);
                ctx.lineTo(px + 8, py);
                ctx.fill();
            }
        });
    }

    // ─── Decorative palm trees ───
    function drawDecorations(ctx, W, H, camX, camY, decorations) {
        decorations.forEach(d => {
            const sx = d.x - camX;
            const sy = d.y - camY;
            if (sx < -100 || sx > W + 100) return;

            if (d.type === 'palm') {
                drawPalmTree(ctx, sx, sy, d.size || 1);
            } else if (d.type === 'flower') {
                drawFlower(ctx, sx, sy, d.color || '#FF4081');
            } else if (d.type === 'signpost') {
                drawSignpost(ctx, sx, sy);
            }
        });
    }

    function drawPalmTree(ctx, x, y, scale) {
        const s = scale;
        // Trunk
        ctx.strokeStyle = '#6D4C41';
        ctx.lineWidth = 8 * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 15 * s, y - 60 * s, x + 5 * s, y - 120 * s);
        ctx.stroke();

        // Leaves
        const leafColors = ['#1B5E20', '#2E7D32', '#388E3C', '#43A047'];
        const leafTop = { x: x + 5 * s, y: y - 120 * s };
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + Math.sin(Date.now() * 0.001 + i) * 0.05;
            const lx = Math.cos(angle) * 50 * s;
            const ly = Math.sin(angle) * 30 * s - 15 * s;
            ctx.fillStyle = leafColors[i % leafColors.length];
            ctx.beginPath();
            ctx.moveTo(leafTop.x, leafTop.y);
            ctx.quadraticCurveTo(leafTop.x + lx * 0.6, leafTop.y + ly * 0.4, leafTop.x + lx, leafTop.y + ly);
            ctx.quadraticCurveTo(leafTop.x + lx * 0.6, leafTop.y + ly * 0.6 - 5 * s, leafTop.x, leafTop.y);
            ctx.fill();
        }

        // Coconuts
        ctx.fillStyle = '#5D4037';
        ctx.beginPath();
        ctx.arc(leafTop.x - 4 * s, leafTop.y + 5 * s, 4 * s, 0, Math.PI * 2);
        ctx.arc(leafTop.x + 6 * s, leafTop.y + 4 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawFlower(ctx, x, y, color) {
        // Stem
        ctx.strokeStyle = '#2E7D32';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - 16);
        ctx.stroke();
        // Petals
        ctx.fillStyle = color;
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(x + Math.cos(a) * 5, y - 16 + Math.sin(a) * 5, 4, 3, a, 0, Math.PI * 2);
            ctx.fill();
        }
        // Centre
        ctx.fillStyle = '#FFEB3B';
        ctx.beginPath();
        ctx.arc(x, y - 16, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawSignpost(ctx, x, y) {
        // Pole
        ctx.fillStyle = '#757575';
        ctx.fillRect(x - 3, y - 50, 6, 50);
        // Sign
        ctx.fillStyle = '#2196F3';
        ctx.fillRect(x - 20, y - 60, 40, 18);
        ctx.fillStyle = '#FFF';
        ctx.font = '8px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('GOAL', x, y - 47);
        ctx.textAlign = 'left';
    }

    // ─── Water ───
    function drawWater(ctx, W, H, camX, time) {
        const waterY = H * 0.85;
        ctx.fillStyle = WATER_COL;
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) {
            const wy = waterY + Math.sin((x + camX * 0.3 + time * 0.002) * 0.02) * 8 +
                Math.sin((x + time * 0.004) * 0.05) * 4;
            ctx.lineTo(x, wy);
        }
        ctx.lineTo(W, H);
        ctx.fill();

        // Sparkles
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 20; i++) {
            const sx = ((i * 137 + time * 0.05) % W);
            const sy = waterY + Math.sin(sx * 0.03 + time * 0.003) * 6 + 10;
            ctx.fillRect(sx, sy, 3, 2);
        }
    }

    return { drawBackground, drawTerrain, drawDecorations, drawWater, initClouds, initMountains };
})();
