// ============================================================
//  level.js  –  Green Hill Zone level data & generation
// ============================================================
const Level = (() => {
    const TILE = 32;
    const GROUND_Y = 500; // default ground height in world coords

    // ─── Terrain Segments ───
    // Each: { x, y, w, h?, slope? }
    // y = top of terrain, h = depth (defaults 256)
    function generateTerrain() {
        const segs = [];
        const platforms = [];

        // Main ground – rolling terrain
        // Section 1: Flat start
        segs.push({ x: 0, y: GROUND_Y, w: 800, h: 300 });

        // Section 2: Small hill
        segs.push({ x: 800, y: GROUND_Y - 40, w: 320, h: 340 });
        segs.push({ x: 1120, y: GROUND_Y - 80, w: 192, h: 380 });
        segs.push({ x: 1312, y: GROUND_Y - 40, w: 320, h: 340 });

        // Section 3: Gap with floating platforms
        // (gap from 1632 to 1900)
        platforms.push({ x: 1700, y: GROUND_Y - 50, w: 96, h: 32 });
        platforms.push({ x: 1850, y: GROUND_Y - 100, w: 96, h: 32 });

        // Section 4: Elevated area
        segs.push({ x: 1980, y: GROUND_Y - 120, w: 640, h: 420 });

        // Section 5: Steps down
        segs.push({ x: 2620, y: GROUND_Y - 80, w: 192, h: 380 });
        segs.push({ x: 2812, y: GROUND_Y - 40, w: 192, h: 340 });
        segs.push({ x: 3004, y: GROUND_Y, w: 400, h: 300 });

        // Section 6: Loop area (flat for the loop)
        segs.push({ x: 3404, y: GROUND_Y, w: 800, h: 300 });

        // Section 7: Springs section
        segs.push({ x: 4204, y: GROUND_Y, w: 600, h: 300 });

        // Floating platforms above
        platforms.push({ x: 4350, y: GROUND_Y - 180, w: 128, h: 32 });
        platforms.push({ x: 4550, y: GROUND_Y - 250, w: 128, h: 32 });
        platforms.push({ x: 4350, y: GROUND_Y - 320, w: 128, h: 32 });

        // Section 8: Final descent and finish
        segs.push({ x: 4804, y: GROUND_Y - 60, w: 300, h: 360 });
        segs.push({ x: 5104, y: GROUND_Y, w: 600, h: 300 });

        // Section 9: Big hill
        segs.push({ x: 5704, y: GROUND_Y - 60, w: 256, h: 360 });
        segs.push({ x: 5960, y: GROUND_Y - 120, w: 256, h: 420 });
        segs.push({ x: 6216, y: GROUND_Y - 60, w: 256, h: 360 });
        segs.push({ x: 6472, y: GROUND_Y, w: 400, h: 300 });

        // Section 10: Speed section with ramp
        segs.push({ x: 6872, y: GROUND_Y, w: 1200, h: 300 });

        // More floating platforms
        platforms.push({ x: 7100, y: GROUND_Y - 150, w: 96, h: 32 });
        platforms.push({ x: 7300, y: GROUND_Y - 200, w: 96, h: 32 });
        platforms.push({ x: 7500, y: GROUND_Y - 150, w: 96, h: 32 });

        // Section 11: Final stretch to goal
        segs.push({ x: 8072, y: GROUND_Y - 40, w: 300, h: 340 });
        segs.push({ x: 8372, y: GROUND_Y, w: 800, h: 300 });

        return { segments: segs, platforms };
    }

    // ─── Rings ───
    function generateRings(terrain) {
        const rings = [];
        // Ring arcs over flat sections
        function addRingArc(startX, baseY, count, spacing, arcHeight) {
            for (let i = 0; i < count; i++) {
                const t = i / (count - 1);
                rings.push({
                    x: startX + i * spacing,
                    y: baseY - 24 - Math.sin(t * Math.PI) * arcHeight,
                    collected: false, collectTime: 0
                });
            }
        }
        function addRingLine(startX, y, count, spacing) {
            for (let i = 0; i < count; i++) {
                rings.push({ x: startX + i * spacing, y: y - 24, collected: false, collectTime: 0 });
            }
        }

        // Section 1: opening line
        addRingLine(200, GROUND_Y, 8, 36);

        // Section 2: arc over hill
        addRingArc(860, GROUND_Y - 40, 6, 40, 40);

        // Section 3: platforms
        addRingLine(1700, GROUND_Y - 50 - 30, 3, 28);
        addRingLine(1850, GROUND_Y - 100 - 30, 3, 28);

        // Section 4: elevated area
        addRingArc(2050, GROUND_Y - 120, 10, 36, 50);

        // Section 5: steps
        addRingLine(2650, GROUND_Y - 80 - 24, 4, 30);
        addRingLine(2850, GROUND_Y - 40 - 24, 3, 30);

        // Section 6: loop area
        addRingLine(3500, GROUND_Y - 24, 12, 36);

        // Section 7: spring area
        addRingLine(4350, GROUND_Y - 180 - 30, 3, 36);
        addRingLine(4550, GROUND_Y - 250 - 30, 3, 36);
        addRingLine(4350, GROUND_Y - 320 - 30, 3, 36);

        // Section 8
        addRingArc(4900, GROUND_Y - 60, 5, 36, 30);

        // Section 9: big hill
        addRingArc(5800, GROUND_Y - 60, 12, 36, 60);

        // Section 10: speed section
        addRingLine(6950, GROUND_Y - 24, 15, 36);
        addRingLine(7100, GROUND_Y - 150 - 30, 3, 28);
        addRingLine(7300, GROUND_Y - 200 - 30, 3, 28);
        addRingLine(7500, GROUND_Y - 150 - 30, 3, 28);

        // Section 11: final stretch
        addRingArc(8400, GROUND_Y, 10, 36, 40);

        return rings;
    }

    // ─── Enemies (Badniks: Motobugs & Buzz Bombers) ───
    function generateEnemies() {
        return [
            // Motobugs (ground)
            { type: 'motobug', x: 700, y: GROUND_Y - 20, w: 28, h: 20, vx: -1, alive: true, dir: -1, patrolL: 600, patrolR: 790 },
            { type: 'motobug', x: 1400, y: GROUND_Y - 60, w: 28, h: 20, vx: -1, alive: true, dir: -1, patrolL: 1320, patrolR: 1620 },
            { type: 'motobug', x: 3100, y: GROUND_Y - 20, w: 28, h: 20, vx: -1.5, alive: true, dir: -1, patrolL: 3010, patrolR: 3380 },
            { type: 'motobug', x: 3600, y: GROUND_Y - 20, w: 28, h: 20, vx: -1, alive: true, dir: -1, patrolL: 3420, patrolR: 4180 },
            { type: 'motobug', x: 5200, y: GROUND_Y - 20, w: 28, h: 20, vx: -1, alive: true, dir: -1, patrolL: 5110, patrolR: 5680 },
            { type: 'motobug', x: 6500, y: GROUND_Y - 20, w: 28, h: 20, vx: -1.2, alive: true, dir: -1, patrolL: 6478, patrolR: 6860 },
            { type: 'motobug', x: 7000, y: GROUND_Y - 20, w: 28, h: 20, vx: -1, alive: true, dir: -1, patrolL: 6880, patrolR: 8060 },
            { type: 'motobug', x: 8500, y: GROUND_Y - 20, w: 28, h: 20, vx: -1, alive: true, dir: -1, patrolL: 8380, patrolR: 9160 },

            // Buzz Bombers (flying)
            { type: 'buzzbomber', x: 1000, y: GROUND_Y - 160, w: 32, h: 20, vx: -1.5, alive: true, dir: -1, patrolL: 800, patrolR: 1300 },
            { type: 'buzzbomber', x: 2300, y: GROUND_Y - 200, w: 32, h: 20, vx: -1, alive: true, dir: -1, patrolL: 2050, patrolR: 2600 },
            { type: 'buzzbomber', x: 5500, y: GROUND_Y - 180, w: 32, h: 20, vx: -1.3, alive: true, dir: -1, patrolL: 5200, patrolR: 5700 },
            { type: 'buzzbomber', x: 7800, y: GROUND_Y - 160, w: 32, h: 20, vx: -1, alive: true, dir: -1, patrolL: 7500, patrolR: 8100 },
        ];
    }

    // ─── Springs ───
    function generateSprings() {
        return [
            { x: 4250, y: GROUND_Y - 8, power: -14, compressed: 0 },
            { x: 4680, y: GROUND_Y - 8, power: -16, compressed: 0 },
            { x: 6400, y: GROUND_Y - 60 - 8, power: -13, compressed: 0 },
            { x: 8050, y: GROUND_Y - 8, power: -15, compressed: 0 },
        ];
    }

    // ─── Checkpoints ───
    function generateCheckpoints() {
        return [
            { x: 2300, y: GROUND_Y - 120, activated: false },
            { x: 5400, y: GROUND_Y, activated: false },
            { x: 7600, y: GROUND_Y, activated: false },
        ];
    }

    // ─── Decorations ───
    function generateDecorations() {
        const decs = [];
        // Palm trees scattered around
        const palmPositions = [
            { x: 150, y: GROUND_Y, size: 1.2 },
            { x: 500, y: GROUND_Y, size: 0.9 },
            { x: 1100, y: GROUND_Y - 80, size: 1.0 },
            { x: 2000, y: GROUND_Y - 120, size: 1.3 },
            { x: 2500, y: GROUND_Y - 120, size: 0.8 },
            { x: 3200, y: GROUND_Y, size: 1.1 },
            { x: 3800, y: GROUND_Y, size: 0.9 },
            { x: 4500, y: GROUND_Y, size: 1.0 },
            { x: 5300, y: GROUND_Y, size: 1.2 },
            { x: 5800, y: GROUND_Y - 60, size: 0.8 },
            { x: 6600, y: GROUND_Y, size: 1.1 },
            { x: 7200, y: GROUND_Y, size: 0.9 },
            { x: 7900, y: GROUND_Y, size: 1.0 },
            { x: 8600, y: GROUND_Y, size: 1.2 },
        ];
        palmPositions.forEach(p => decs.push({ type: 'palm', ...p }));

        // Flowers
        const flowerColors = ['#FF4081', '#FF6E40', '#FFAB40', '#E040FB', '#FF5252'];
        for (let fx = 80; fx < 9000; fx += 140 + Math.random() * 200) {
            decs.push({ type: 'flower', x: fx, y: GROUND_Y, color: flowerColors[Math.floor(Math.random() * flowerColors.length)] });
        }

        // Goal signpost at end
        decs.push({ type: 'signpost', x: 9000, y: GROUND_Y });

        return decs;
    }

    // ─── Collision helpers ───
    function getGroundY(worldX, segments, platforms) {
        let bestY = 9999;
        const all = segments.concat(platforms);
        for (const seg of all) {
            if (worldX >= seg.x && worldX <= seg.x + seg.w) {
                if (seg.y < bestY) bestY = seg.y;
            }
        }
        return bestY;
    }

    // Check if a point is inside any terrain
    function isInsideTerrain(px, py, segments, platforms) {
        const all = segments.concat(platforms);
        for (const seg of all) {
            if (px >= seg.x && px <= seg.x + seg.w && py >= seg.y && py <= seg.y + (seg.h || 256)) {
                return true;
            }
        }
        return false;
    }

    // Find the terrain surface Y at a given x for a character at a vertical position
    function resolveGround(px, py, ph, segments, platforms) {
        const all = segments.concat(platforms);
        let bestSurface = null;
        const feetY = py + ph;

        for (const seg of all) {
            if (px >= seg.x && px <= seg.x + seg.w) {
                const segTop = seg.y;
                const segBot = seg.y + (seg.h || 256);
                // Character feet touching or penetrating this segment
                if (feetY >= segTop && py < segBot) {
                    if (bestSurface === null || segTop < bestSurface) {
                        bestSurface = segTop;
                    }
                }
            }
        }
        return bestSurface;
    }

    // Wall collision: check if horizontal movement is blocked
    function checkWallCollision(px, py, ph, pw, segments, platforms) {
        const all = segments.concat(platforms);
        for (const seg of all) {
            const segTop = seg.y;
            const segBot = seg.y + (seg.h || 256);
            // Check if the character box overlaps with segment
            if (px + pw > seg.x && px < seg.x + seg.w &&
                py + ph > segTop + 4 && py < segBot) {
                // Determine which side
                const overlapL = px + pw - seg.x;
                const overlapR = seg.x + seg.w - px;
                if (overlapL < overlapR && overlapL < 16) {
                    return { side: 'right', pushX: seg.x - pw };
                } else if (overlapR < 16) {
                    return { side: 'left', pushX: seg.x + seg.w };
                }
            }
        }
        return null;
    }

    // Ceiling collision
    function checkCeiling(px, py, pw, segments, platforms) {
        const all = segments.concat(platforms);
        for (const seg of all) {
            if (px + pw > seg.x && px < seg.x + seg.w) {
                const segBot = seg.y + (seg.h || 256);
                if (py < segBot && py > seg.y) {
                    return segBot;
                }
            }
        }
        return null;
    }

    const GOAL_X = 9000;
    const LEVEL_BOTTOM = GROUND_Y + 400; // death pit

    return {
        TILE, GROUND_Y, GOAL_X, LEVEL_BOTTOM,
        generateTerrain, generateRings, generateEnemies,
        generateSprings, generateCheckpoints, generateDecorations,
        getGroundY, isInsideTerrain, resolveGround, checkWallCollision, checkCeiling
    };
})();
