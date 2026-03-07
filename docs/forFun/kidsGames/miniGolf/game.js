/* ═══════════════════════════════════════════════════════════════
   MINI GOLF — 2D Top-Down, 9 Holes
   Click ball → drag back → release to putt
   ═══════════════════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ── DOM ──────────────────────────────────────────
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const menuOverlay = document.getElementById('menu-overlay');
    const holeOverlay = document.getElementById('hole-overlay');
    const scoreOverlay = document.getElementById('score-overlay');
    const hud = document.getElementById('hud');
    const backBtn = document.getElementById('back-btn');
    const startBtn = document.getElementById('start-btn');
    const nextHoleBtn = document.getElementById('next-hole-btn');
    const playAgainBtn = document.getElementById('play-again-btn');

    const elHoleNum = document.getElementById('hole-num');
    const elHolePar = document.getElementById('hole-par');
    const elStrokeCount = document.getElementById('stroke-count');
    const elTotalStrokes = document.getElementById('total-strokes');
    const elHoleStars = document.getElementById('hole-stars');
    const elHoleResultText = document.getElementById('hole-result-text');
    const elHoleStats = document.getElementById('hole-stats');
    const elScorecard = document.getElementById('scorecard');
    const elFinalScore = document.getElementById('final-score');

    // ── Constants ───────────────────────────────────
    const BALL_RADIUS = 7;
    const HOLE_RADIUS = 12;
    const FRICTION = 0.985;
    const MIN_SPEED = 0.15;
    const MAX_POWER = 18;
    const POWER_SCALE = 0.12;
    const WALL_BOUNCE = 0.65;
    const SAND_FRICTION = 0.955;
    const WATER_PENALTY = true;

    // ── Colors ──────────────────────────────────────
    const COLORS = {
        turf: '#1a6b3c',
        turfDark: '#15592f',
        turfLight: '#22844a',
        rough: '#0e4a28',
        fringe: '#2a8f50',
        sand: '#d4a843',
        sandDark: '#b8923a',
        water: '#1a5f8f',
        waterLight: '#2a7fb8',
        wall: '#3a3a5c',
        wallTop: '#5a5a7c',
        wallEdge: '#2a2a42',
        hole: '#0a0a0a',
        holeRim: '#333',
        flag: '#ff2daa',
        flagPole: '#ccc',
        ball: '#f0f0f0',
        ballShadow: 'rgba(0,0,0,0.3)',
        arrow: 'rgba(0, 240, 255, 0.7)',
        arrowFade: 'rgba(0, 240, 255, 0.05)',
        powerDot: 'rgba(255, 45, 170, 0.8)',
    };

    // ── Game State ──────────────────────────────────
    let W, H, scale;
    // Course dimensions (design space)
    const CW = 400;
    const CH = 700;

    let currentHole = 0;
    let strokes = 0;
    let totalStrokes = 0;
    let scores = [];
    let gameActive = false;
    let ballX, ballY, ballVX, ballVY;
    let ballMoving = false;
    let ballInHole = false;
    let dragging = false;
    let dragStartX, dragStartY;
    let dragCurrentX, dragCurrentY;
    let mouseX, mouseY;

    // Trail particles
    let trail = [];

    // Water splash particles
    let splashes = [];

    // Sink animation
    let sinkAnim = 0;
    let sinkX, sinkY;

    // Obstacles for current hole
    let walls = [];
    let sandTraps = [];
    let waterHazards = [];
    let holeX, holeY;
    let teeX, teeY;
    let courseShape = []; // polygon for the course outline

    // ── Hole Definitions ────────────────────────────
    // Each hole: { par, tee:[x,y], hole:[x,y], course:[polygon], walls:[[x,y,w,h],...], sand:[[cx,cy,r],...], water:[[cx,cy,r],...] }
    // Coordinates in design space (CW x CH)
    const HOLES = [
        // ─── Hole 1: Straight Shot ───
        {
            par: 2,
            tee: [200, 580],
            hole: [200, 150],
            course: [[100, 80], [300, 80], [300, 650], [100, 650]],
            walls: [],
            sand: [],
            water: [],
        },
        // ─── Hole 2: Dogleg Right ───
        {
            par: 3,
            tee: [120, 580],
            hole: [300, 150],
            course: [[50, 80], [350, 80], [350, 350], [250, 350], [250, 450], [200, 450], [200, 650], [50, 650]],
            walls: [
                [200, 350, 60, 12],
            ],
            sand: [[300, 250, 30]],
            water: [],
        },
        // ─── Hole 3: Island Green ───
        {
            par: 3,
            tee: [200, 600],
            hole: [200, 180],
            course: [[60, 70], [340, 70], [340, 660], [60, 660]],
            walls: [],
            sand: [[130, 180, 28], [270, 180, 28]],
            water: [[200, 180, 65]],
        },
        // ─── Hole 4: Narrow Channel ───
        {
            par: 3,
            tee: [200, 600],
            hole: [200, 130],
            course: [[50, 60], [350, 60], [350, 660], [50, 660]],
            walls: [
                [50, 400, 120, 14],
                [230, 400, 120, 14],
                [50, 260, 120, 14],
                [230, 260, 120, 14],
            ],
            sand: [],
            water: [],
        },
        // ─── Hole 5: Sand Trap Alley ───
        {
            par: 3,
            tee: [100, 600],
            hole: [300, 130],
            course: [[40, 60], [360, 60], [360, 660], [40, 660]],
            walls: [
                [170, 200, 14, 140],
                [220, 370, 14, 140],
            ],
            sand: [[100, 300, 35], [300, 440, 35], [200, 130, 25]],
            water: [],
        },
        // ─── Hole 6: Water Wrap ───
        {
            par: 3,
            tee: [200, 600],
            hole: [200, 140],
            course: [[50, 60], [350, 60], [350, 660], [50, 660]],
            walls: [
                [140, 320, 120, 14],
            ],
            sand: [[110, 140, 25]],
            water: [[200, 460, 50], [310, 300, 30]],
        },
        // ─── Hole 7: Zigzag ───
        {
            par: 4,
            tee: [80, 600],
            hole: [320, 120],
            course: [[30, 50], [370, 50], [370, 660], [30, 660]],
            walls: [
                [30, 510, 240, 14],
                [130, 390, 240, 14],
                [30, 270, 240, 14],
                [130, 150, 240, 14],
            ],
            sand: [[320, 560, 25], [80, 340, 25]],
            water: [[320, 210, 28]],
        },
        // ─── Hole 8: Round the Bend ───
        {
            par: 4,
            tee: [100, 580],
            hole: [100, 140],
            course: [[40, 70], [360, 70], [360, 440], [250, 440], [250, 340], [180, 340], [180, 440], [180, 650], [40, 650]],
            walls: [
                [180, 250, 14, 100],
                [250, 170, 14, 180],
            ],
            sand: [[310, 350, 30], [160, 140, 25]],
            water: [[310, 140, 30]],
        },
        // ─── Hole 9: The Gauntlet ───
        {
            par: 5,
            tee: [200, 630],
            hole: [200, 100],
            course: [[40, 40], [360, 40], [360, 670], [40, 670]],
            walls: [
                [40, 560, 160, 12],
                [240, 560, 120, 12],
                [120, 450, 160, 12],
                [40, 340, 160, 12],
                [240, 340, 120, 12],
                [120, 230, 160, 12],
                [40, 140, 100, 12],
                [260, 140, 100, 12],
            ],
            sand: [[320, 500, 22], [80, 400, 22], [320, 290, 22], [80, 190, 22]],
            water: [[200, 500, 25], [200, 290, 25]],
        },
    ];

    // ── Resize ──────────────────────────────────────
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Calculate scale to fit course in viewport with padding
        const padX = 40, padY = 100;
        const scaleX = (W - padX * 2) / CW;
        const scaleY = (H - padY * 2) / CH;
        scale = Math.min(scaleX, scaleY);
    }

    // Transform from design coords to screen coords
    function toScreen(x, y) {
        const ox = (W - CW * scale) / 2;
        const oy = (H - CH * scale) / 2 + 20;
        return [ox + x * scale, oy + y * scale];
    }

    function fromScreen(sx, sy) {
        const ox = (W - CW * scale) / 2;
        const oy = (H - CH * scale) / 2 + 20;
        return [(sx - ox) / scale, (sy - oy) / scale];
    }

    function designDist(sx, sy, dx, dy) {
        return Math.hypot((sx - dx), (sy - dy));
    }

    // ── Point in Polygon ────────────────────────────
    function pointInPolygon(x, y, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i][0], yi = poly[i][1];
            const xj = poly[j][0], yj = poly[j][1];
            if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    // ── Segment-circle collision ────────────────────
    function lineCircle(x1, y1, x2, y2, cx, cy, r) {
        const dx = x2 - x1, dy = y2 - y1;
        const fx = x1 - cx, fy = y1 - cy;
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - r * r;
        let disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        disc = Math.sqrt(disc);
        const t1 = (-b - disc) / (2 * a);
        const t2 = (-b + disc) / (2 * a);
        if (t1 >= 0 && t1 <= 1) return t1;
        if (t2 >= 0 && t2 <= 1) return t2;
        return null;
    }

    // ── Wall collision ──────────────────────────────
    function collideWalls() {
        for (const w of walls) {
            const [wx, wy, ww, wh] = w;
            // Expand wall by ball radius for collision
            const left = wx - BALL_RADIUS;
            const right = wx + ww + BALL_RADIUS;
            const top = wy - BALL_RADIUS;
            const bottom = wy + wh + BALL_RADIUS;

            if (ballX >= left && ballX <= right && ballY >= top && ballY <= bottom) {
                // Determine which side we're hitting
                const overlapLeft = ballX - left;
                const overlapRight = right - ballX;
                const overlapTop = ballY - top;
                const overlapBottom = bottom - ballY;

                const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

                if (minOverlap === overlapLeft || minOverlap === overlapRight) {
                    ballVX *= -WALL_BOUNCE;
                    ballVY *= WALL_BOUNCE;
                    ballX = minOverlap === overlapLeft ? left - 0.5 : right + 0.5;
                } else {
                    ballVY *= -WALL_BOUNCE;
                    ballVX *= WALL_BOUNCE;
                    ballY = minOverlap === overlapTop ? top - 0.5 : bottom + 0.5;
                }
            }
        }
    }

    // ── Course boundary collision ────────────────────
    function collideCourse() {
        const poly = courseShape;
        if (poly.length < 3) return;

        if (!pointInPolygon(ballX, ballY, poly)) {
            // Find nearest edge and bounce
            let minDist = Infinity;
            let nearestNx = 0, nearestNy = 0;
            let nearestPx = ballX, nearestPy = ballY;

            for (let i = 0; i < poly.length; i++) {
                const j = (i + 1) % poly.length;
                const ax = poly[i][0], ay = poly[i][1];
                const bx = poly[j][0], by = poly[j][1];

                const abx = bx - ax, aby = by - ay;
                const len2 = abx * abx + aby * aby;
                let t = ((ballX - ax) * abx + (ballY - ay) * aby) / len2;
                t = Math.max(0, Math.min(1, t));

                const px = ax + t * abx;
                const py = ay + t * aby;
                const d = Math.hypot(ballX - px, ballY - py);

                if (d < minDist) {
                    minDist = d;
                    nearestPx = px;
                    nearestPy = py;
                    // Normal pointing inward
                    nearestNx = ballX - px;
                    nearestNy = ballY - py;
                    const nl = Math.hypot(nearestNx, nearestNy) || 1;
                    nearestNx /= nl;
                    nearestNy /= nl;
                }
            }

            // Reflect inside
            // The normal should point into the polygon
            const cx = (poly.reduce((s, p) => s + p[0], 0)) / poly.length;
            const cy = (poly.reduce((s, p) => s + p[1], 0)) / poly.length;
            const toCenterX = cx - nearestPx;
            const toCenterY = cy - nearestPy;
            if (nearestNx * toCenterX + nearestNy * toCenterY < 0) {
                nearestNx = -nearestNx;
                nearestNy = -nearestNy;
            }

            // Push ball inside
            ballX = nearestPx + nearestNx * (BALL_RADIUS + 1);
            ballY = nearestPy + nearestNy * (BALL_RADIUS + 1);

            // Reflect velocity
            const dot = ballVX * nearestNx + ballVY * nearestNy;
            ballVX = (ballVX - 2 * dot * nearestNx) * WALL_BOUNCE;
            ballVY = (ballVY - 2 * dot * nearestNy) * WALL_BOUNCE;
        }
    }

    // ── Check hazards ───────────────────────────────
    function checkSand() {
        for (const s of sandTraps) {
            const d = Math.hypot(ballX - s[0], ballY - s[1]);
            if (d < s[2]) return true;
        }
        return false;
    }

    function checkWater() {
        for (const w of waterHazards) {
            const d = Math.hypot(ballX - w[0], ballY - w[1]);
            if (d < w[2] - 5) return true;
        }
        return false;
    }

    // ── Load Hole ───────────────────────────────────
    function loadHole(index) {
        const h = HOLES[index];
        teeX = h.tee[0];
        teeY = h.tee[1];
        holeX = h.hole[0];
        holeY = h.hole[1];

        ballX = teeX;
        ballY = teeY;
        ballVX = 0;
        ballVY = 0;
        ballMoving = false;
        ballInHole = false;
        dragging = false;
        strokes = 0;
        trail = [];
        splashes = [];
        sinkAnim = 0;

        walls = h.walls.slice();
        sandTraps = h.sand.slice();
        waterHazards = h.water.slice();
        courseShape = h.course.slice();

        elHoleNum.textContent = index + 1;
        elHolePar.textContent = h.par;
        elStrokeCount.textContent = '0';
    }

    // ── Score name ──────────────────────────────────
    function scoreName(strokes, par) {
        const diff = strokes - par;
        if (strokes === 1) return 'Hole in One!';
        if (diff <= -3) return 'Albatross!';
        if (diff === -2) return 'Eagle!';
        if (diff === -1) return 'Birdie!';
        if (diff === 0) return 'Par';
        if (diff === 1) return 'Bogey';
        if (diff === 2) return 'Double Bogey';
        return `+${diff}`;
    }

    function starsForScore(strokes, par) {
        const diff = strokes - par;
        if (strokes === 1) return '★★★';
        if (diff <= -1) return '★★★';
        if (diff === 0) return '★★☆';
        if (diff === 1) return '★☆☆';
        return '☆☆☆';
    }

    // ── Show hole complete ──────────────────────────
    function showHoleComplete() {
        const h = HOLES[currentHole];
        const name = scoreName(strokes, h.par);
        const stars = starsForScore(strokes, h.par);

        elHoleStars.textContent = stars;
        elHoleResultText.textContent = name;
        elHoleStats.innerHTML = `Hole ${currentHole + 1} — ${strokes} stroke${strokes !== 1 ? 's' : ''} (Par ${h.par})`;

        if (currentHole === HOLES.length - 1) {
            nextHoleBtn.textContent = 'SCORECARD';
        } else {
            nextHoleBtn.textContent = 'NEXT HOLE';
        }

        holeOverlay.classList.remove('hidden');
    }

    // ── Show scorecard ──────────────────────────────
    function showScorecard() {
        let html = '<table class="scorecard-table"><tr><th>Hole</th>';
        for (let i = 0; i < 9; i++) html += `<th>${i + 1}</th>`;
        html += '<th>TOT</th></tr>';

        // Par row
        html += '<tr><td>Par</td>';
        let totalPar = 0;
        for (let i = 0; i < 9; i++) {
            html += `<td>${HOLES[i].par}</td>`;
            totalPar += HOLES[i].par;
        }
        html += `<td>${totalPar}</td></tr>`;

        // Score row
        html += '<tr><td>Score</td>';
        for (let i = 0; i < 9; i++) {
            const s = scores[i] || 0;
            const diff = s - HOLES[i].par;
            let cls = 'even';
            if (s === 1) cls = 'ace';
            else if (diff < 0) cls = 'under';
            else if (diff > 0) cls = 'over';
            html += `<td class="${cls}">${s}</td>`;
        }
        const diff = totalStrokes - totalPar;
        let totalClass = diff < 0 ? 'under' : diff > 0 ? 'over' : 'even';
        html += `<td class="${totalClass}">${totalStrokes}</td></tr>`;

        html += '</table>';
        elScorecard.innerHTML = html;

        const scoreText = diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : `${diff}`);
        elFinalScore.textContent = `${totalStrokes} (${scoreText})`;

        scoreOverlay.classList.remove('hidden');
    }

    // ── Drawing ─────────────────────────────────────

    function drawCourse() {
        if (!gameActive || courseShape.length < 3) return;

        // Draw rough background (full canvas area around course)
        ctx.fillStyle = COLORS.rough;
        ctx.fillRect(0, 0, W, H);

        // Draw course polygon (fairway)
        ctx.beginPath();
        const [sx0, sy0] = toScreen(courseShape[0][0], courseShape[0][1]);
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < courseShape.length; i++) {
            const [sx, sy] = toScreen(courseShape[i][0], courseShape[i][1]);
            ctx.lineTo(sx, sy);
        }
        ctx.closePath();

        // Turf gradient
        const [tl] = toScreen(0, 0);
        const [, br] = toScreen(0, CH);
        const grad = ctx.createLinearGradient(0, tl, 0, br);
        grad.addColorStop(0, COLORS.turfLight);
        grad.addColorStop(0.5, COLORS.turf);
        grad.addColorStop(1, COLORS.turfDark);
        ctx.fillStyle = grad;
        ctx.fill();

        // Draw mowing stripes
        ctx.save();
        ctx.clip();
        const stripeWidth = 20 * scale;
        const [courseLeft] = toScreen(0, 0);
        const [courseRight] = toScreen(CW, 0);
        for (let x = courseLeft; x < courseRight; x += stripeWidth * 2) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(x, 0, stripeWidth, H);
        }
        ctx.restore();

        // Course border
        ctx.beginPath();
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < courseShape.length; i++) {
            const [sx, sy] = toScreen(courseShape[i][0], courseShape[i][1]);
            ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.strokeStyle = COLORS.fringe;
        ctx.lineWidth = 4 * scale;
        ctx.stroke();
    }

    function drawSandTraps() {
        if (!gameActive) return;
        for (const s of sandTraps) {
            const [sx, sy] = toScreen(s[0], s[1]);
            const r = s[2] * scale;

            // Sand gradient
            const grad = ctx.createRadialGradient(sx - r * 0.2, sy - r * 0.2, r * 0.1, sx, sy, r);
            grad.addColorStop(0, '#e8c05a');
            grad.addColorStop(0.7, COLORS.sand);
            grad.addColorStop(1, COLORS.sandDark);
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            // Sand specks
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2 + s[0];
                const d = r * (0.3 + Math.sin(i * 7.3) * 0.5);
                ctx.beginPath();
                ctx.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    function drawWaterHazards(t) {
        if (!gameActive) return;
        for (const w of waterHazards) {
            const [sx, sy] = toScreen(w[0], w[1]);
            const r = w[2] * scale;

            // Water gradient
            const grad = ctx.createRadialGradient(sx, sy, r * 0.1, sx, sy, r);
            grad.addColorStop(0, COLORS.waterLight);
            grad.addColorStop(1, COLORS.water);
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();

            // Animated ripples
            const numRipples = 3;
            for (let i = 0; i < numRipples; i++) {
                const phase = (t * 0.001 + i / numRipples) % 1;
                const rippleR = r * 0.2 + phase * r * 0.6;
                ctx.beginPath();
                ctx.arc(sx, sy, rippleR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(120, 200, 255, ${0.3 * (1 - phase)})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    }

    function drawWalls() {
        if (!gameActive) return;
        for (const w of walls) {
            const [sx, sy] = toScreen(w[0], w[1]);
            const sw = w[2] * scale;
            const sh = w[3] * scale;

            // Wall shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sx + 3, sy + 3, sw, sh);

            // Wall body
            ctx.fillStyle = COLORS.wall;
            ctx.fillRect(sx, sy, sw, sh);

            // Wall top highlight
            ctx.fillStyle = COLORS.wallTop;
            ctx.fillRect(sx, sy, sw, 3 * scale);

            // Wall edge
            ctx.fillStyle = COLORS.wallEdge;
            ctx.fillRect(sx, sy + sh - 2 * scale, sw, 2 * scale);
        }
    }

    function drawHole(t) {
        if (!gameActive) return;
        const [sx, sy] = toScreen(holeX, holeY);
        const r = HOLE_RADIUS * scale;

        // Hole shadow
        ctx.beginPath();
        ctx.arc(sx + 2, sy + 2, r + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Hole
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.hole;
        ctx.fill();

        // Rim
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.holeRim;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner rim highlight
        ctx.beginPath();
        ctx.arc(sx, sy, r - 2, Math.PI * 1.2, Math.PI * 1.8);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Flag
        if (!ballInHole) {
            const flagH = 40 * scale;
            const poleX = sx + 2;
            const poleBaseY = sy;
            const poleTopY = sy - flagH;

            // Pole shadow
            ctx.beginPath();
            ctx.moveTo(poleX + 2, poleBaseY);
            ctx.lineTo(poleX + 2, poleTopY + 4);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Pole
            ctx.beginPath();
            ctx.moveTo(poleX, poleBaseY);
            ctx.lineTo(poleX, poleTopY);
            ctx.strokeStyle = COLORS.flagPole;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Flag pennant (waving)
            const wave = Math.sin(t * 0.003) * 3 * scale;
            ctx.beginPath();
            ctx.moveTo(poleX, poleTopY);
            ctx.quadraticCurveTo(poleX + 12 * scale + wave, poleTopY + 5 * scale, poleX + 18 * scale + wave * 0.5, poleTopY + 10 * scale);
            ctx.lineTo(poleX, poleTopY + 18 * scale);
            ctx.closePath();
            ctx.fillStyle = COLORS.flag;
            ctx.fill();

            // Hole number on flag
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${8 * scale}px ${getComputedStyle(document.body).getPropertyValue('--font-display')}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(currentHole + 1, poleX + 8 * scale + wave * 0.3, poleTopY + 10 * scale);
        }
    }

    function drawTrail() {
        for (let i = trail.length - 1; i >= 0; i--) {
            const p = trail[i];
            p.life -= 0.02;
            if (p.life <= 0) {
                trail.splice(i, 1);
                continue;
            }
            const [sx, sy] = toScreen(p.x, p.y);
            ctx.beginPath();
            ctx.arc(sx, sy, 2 * scale * p.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.3})`;
            ctx.fill();
        }
    }

    function drawSplashes() {
        for (let i = splashes.length - 1; i >= 0; i--) {
            const s = splashes[i];
            s.life -= 0.03;
            s.x += s.vx;
            s.y += s.vy;
            s.vy += 0.1;
            if (s.life <= 0) {
                splashes.splice(i, 1);
                continue;
            }
            const [sx, sy] = toScreen(s.x, s.y);
            ctx.beginPath();
            ctx.arc(sx, sy, 3 * scale * s.life, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(120, 200, 255, ${s.life * 0.7})`;
            ctx.fill();
        }
    }

    function drawBall() {
        if (!gameActive) return;
        if (ballInHole && sinkAnim >= 1) return;

        const [sx, sy] = toScreen(ballX, ballY);
        let r = BALL_RADIUS * scale;

        // Sink animation (shrink into hole)
        if (ballInHole) {
            r *= (1 - sinkAnim);
        }

        // Shadow
        ctx.beginPath();
        ctx.arc(sx + 3, sy + 3, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ballShadow;
        ctx.fill();

        // Ball body
        const grad = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.5, COLORS.ball);
        grad.addColorStop(1, '#c0c0c0');
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Shine
        ctx.beginPath();
        ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
    }

    function drawAimArrow() {
        if (!gameActive || !dragging) return;

        const [bsx, bsy] = toScreen(ballX, ballY);

        // Direction from ball to drag point (arrow shoots opposite)
        const dx = dragCurrentX - bsx;
        const dy = dragCurrentY - bsy;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) return;

        const power = Math.min(dist * POWER_SCALE / scale, MAX_POWER);
        const powerRatio = power / MAX_POWER;

        // Arrow direction (opposite of drag)
        const ax = -dx / dist;
        const ay = -dy / dist;

        // Draw power line from ball
        const arrowLen = 60 * scale * powerRatio + 20 * scale;
        const endX = bsx + ax * arrowLen;
        const endY = bsy + ay * arrowLen;

        // Dotted trajectory line
        const numDots = Math.floor(8 + powerRatio * 12);
        for (let i = 0; i < numDots; i++) {
            const t = i / numDots;
            const px = bsx + ax * arrowLen * t;
            const py = bsy + ay * arrowLen * t;
            const alpha = (1 - t) * 0.8;
            const dotR = (1 - t * 0.5) * 3 * scale;

            ctx.beginPath();
            ctx.arc(px, py, dotR, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
            ctx.fill();
        }

        // Arrow head
        const headSize = 8 * scale;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - ax * headSize + ay * headSize * 0.5, endY - ay * headSize - ax * headSize * 0.5);
        ctx.lineTo(endX - ax * headSize - ay * headSize * 0.5, endY - ay * headSize + ax * headSize * 0.5);
        ctx.closePath();
        ctx.fillStyle = COLORS.arrow;
        ctx.fill();

        // Power indicator (drag line)
        ctx.beginPath();
        ctx.moveTo(bsx, bsy);
        ctx.lineTo(dragCurrentX, dragCurrentY);
        ctx.strokeStyle = `rgba(255, 45, 170, ${0.3 + powerRatio * 0.4})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Power circle on ball
        ctx.beginPath();
        ctx.arc(bsx, bsy, BALL_RADIUS * scale + 4 + powerRatio * 6, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.2 + powerRatio * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawTeeMarker() {
        if (!gameActive) return;
        const [sx, sy] = toScreen(teeX, teeY);
        // Small tee marker
        ctx.beginPath();
        ctx.arc(sx, sy, 4 * scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function drawHoleLabel() {
        if (!gameActive) return;
        // Hole number and par at bottom
        const [sx, sy] = toScreen(CW / 2, CH - 15);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = `${9 * scale}px ${getComputedStyle(document.body).getPropertyValue('--font-display')}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`HOLE ${currentHole + 1}  •  PAR ${HOLES[currentHole].par}`, sx, sy);
    }

    // ── Physics Update ──────────────────────────────
    function updatePhysics() {
        if (!ballMoving || ballInHole) return;

        // Apply friction
        const inSand = checkSand();
        const friction = inSand ? SAND_FRICTION : FRICTION;
        ballVX *= friction;
        ballVY *= friction;

        // Move ball
        ballX += ballVX;
        ballY += ballVY;

        // Trail
        if (Math.hypot(ballVX, ballVY) > 1) {
            trail.push({ x: ballX, y: ballY, life: 1 });
        }

        // Collide walls
        collideWalls();

        // Collide course boundary
        collideCourse();

        // Check water
        if (checkWater()) {
            // Splash effect
            for (let i = 0; i < 15; i++) {
                const a = Math.random() * Math.PI * 2;
                const spd = 1 + Math.random() * 3;
                splashes.push({
                    x: ballX,
                    y: ballY,
                    vx: Math.cos(a) * spd,
                    vy: Math.sin(a) * spd - 2,
                    life: 1,
                });
            }

            // Reset to tee with penalty stroke
            strokes++;
            elStrokeCount.textContent = strokes;
            flashHudValue(elStrokeCount);
            ballX = teeX;
            ballY = teeY;
            ballVX = 0;
            ballVY = 0;
            ballMoving = false;
            return;
        }

        // Check if in hole
        const distToHole = Math.hypot(ballX - holeX, ballY - holeY);
        const speed = Math.hypot(ballVX, ballVY);
        if (distToHole < HOLE_RADIUS - BALL_RADIUS * 0.5 && speed < 8) {
            ballInHole = true;
            ballMoving = false;
            ballVX = 0;
            ballVY = 0;
            sinkAnim = 0;
            sinkX = holeX;
            sinkY = holeY;
            return;
        }

        // Check if stopped
        if (speed < MIN_SPEED) {
            ballVX = 0;
            ballVY = 0;
            ballMoving = false;
        }
    }

    function flashHudValue(el) {
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 200);
    }

    // ── Input Handling ──────────────────────────────
    function getEventPos(e) {
        if (e.touches) {
            return [e.touches[0].clientX, e.touches[0].clientY];
        }
        return [e.clientX, e.clientY];
    }

    function onPointerDown(e) {
        if (ballMoving || ballInHole) return;

        const [px, py] = getEventPos(e);
        const [bsx, bsy] = toScreen(ballX, ballY);
        const dist = Math.hypot(px - bsx, py - bsy);

        // Must click near the ball (generous hit area)
        if (dist < BALL_RADIUS * scale * 4) {
            dragging = true;
            dragStartX = px;
            dragStartY = py;
            dragCurrentX = px;
            dragCurrentY = py;
            e.preventDefault();
        }
    }

    function onPointerMove(e) {
        const [px, py] = getEventPos(e);
        mouseX = px;
        mouseY = py;

        if (dragging) {
            dragCurrentX = px;
            dragCurrentY = py;
            e.preventDefault();
        }
    }

    function onPointerUp(e) {
        if (!dragging) return;
        dragging = false;

        const [bsx, bsy] = toScreen(ballX, ballY);
        const dx = dragCurrentX - bsx;
        const dy = dragCurrentY - bsy;
        const dist = Math.hypot(dx, dy);

        if (dist < 8) return; // Too small — ignore

        const power = Math.min(dist * POWER_SCALE / scale, MAX_POWER);

        // Direction is opposite of drag
        const ax = -dx / dist;
        const ay = -dy / dist;

        ballVX = ax * power;
        ballVY = ay * power;
        ballMoving = true;
        strokes++;
        totalStrokes++;
        elStrokeCount.textContent = strokes;
        elTotalStrokes.textContent = totalStrokes;
        flashHudValue(elStrokeCount);
    }

    // ── Main Loop ───────────────────────────────────
    let lastTime = 0;
    function gameLoop(timestamp) {
        const dt = timestamp - lastTime;
        lastTime = timestamp;

        // Physics (multiple substeps for stability)
        if (ballMoving) {
            const steps = 3;
            for (let i = 0; i < steps; i++) {
                updatePhysics();
            }
        }

        // Sink animation
        if (ballInHole && sinkAnim < 1) {
            sinkAnim += 0.04;
            ballX += (sinkX - ballX) * 0.2;
            ballY += (sinkY - ballY) * 0.2;
            if (sinkAnim >= 1) {
                scores[currentHole] = strokes;
                setTimeout(() => showHoleComplete(), 400);
            }
        }

        // Draw
        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = '#060612';
        ctx.fillRect(0, 0, W, H);

        drawCourse();
        drawSandTraps();
        drawWaterHazards(timestamp);
        drawWalls();
        drawTeeMarker();
        drawHole(timestamp);
        drawTrail();
        drawSplashes();
        drawBall();
        drawAimArrow();
        drawHoleLabel();

        requestAnimationFrame(gameLoop);
    }

    // ── Start / Transitions ─────────────────────────
    function startGame() {
        currentHole = 0;
        totalStrokes = 0;
        scores = [];
        elTotalStrokes.textContent = '0';
        menuOverlay.classList.add('hidden');
        hud.classList.remove('hidden');
        backBtn.classList.remove('hidden');
        gameActive = true;
        loadHole(0);
    }

    function nextHole() {
        holeOverlay.classList.add('hidden');
        if (currentHole >= HOLES.length - 1) {
            showScorecard();
            return;
        }
        currentHole++;
        loadHole(currentHole);
    }

    function resetToMenu() {
        gameActive = false;
        menuOverlay.classList.remove('hidden');
        holeOverlay.classList.add('hidden');
        scoreOverlay.classList.add('hidden');
        hud.classList.add('hidden');
        backBtn.classList.add('hidden');
    }

    // ── Event Listeners ─────────────────────────────
    startBtn.addEventListener('click', startGame);
    nextHoleBtn.addEventListener('click', nextHole);
    playAgainBtn.addEventListener('click', () => {
        scoreOverlay.classList.add('hidden');
        startGame();
    });
    backBtn.addEventListener('click', resetToMenu);

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchmove', onPointerMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);

    window.addEventListener('resize', resize);

    // ── Init ────────────────────────────────────────
    resize();
    requestAnimationFrame(gameLoop);
})();
