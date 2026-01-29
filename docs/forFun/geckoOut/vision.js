export class Vision {
    static async process(image) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);

        // 1. Detect Grid
        // For simplicity, let's assume a square board for now or try to detect it.
        // We'll look for the bounding box of the actual game area.
        const bounds = this.detectBounds(ctx, canvas.width, canvas.height);

        // 2. Guess Grid Dimensions (usually 6x6 or 8x8 in these games)
        const rows = 10; // Default or detected
        const cols = 9;  // Default or detected
        const cellW = bounds.width / cols;
        const cellH = bounds.height / rows;

        const grid = [];
        for (let r = 0; r < rows; r++) {
            grid[r] = [];
            for (let c = 0; c < cols; c++) {
                const centerX = bounds.x + c * cellW + cellW / 2;
                const centerY = bounds.y + r * cellH + cellH / 2;
                const centerColor = this.getPixelColor(ctx, centerX, centerY);

                // Sample slightly offset to see if it's nested
                const outerColor = this.getPixelColor(ctx, centerX + cellW / 4, centerY);

                const centerType = this.classifyColor(centerColor);
                const outerType = this.classifyColor(outerColor);

                grid[r][c] = { r, c, type: outerType, innerType: centerType !== outerType ? centerType : null };
            }
        }

        // 3. Group colors into Geckos and find Holes
        const geckosByColor = {};
        const standaloneHoles = [];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = grid[r][c];
                if (cell.type === 'hole') {
                    standaloneHoles.push({ r, c });
                } else if (cell.type !== 'empty' && cell.type !== 'unknown') {
                    const key = cell.type + (cell.innerType ? '-' + cell.innerType : '');
                    if (!geckosByColor[key]) geckosByColor[key] = { segments: [], inner: cell.innerType, outer: cell.type };
                    geckosByColor[key].segments.push({ r, c });
                }
            }
        }

        // 4. Order segments and identify properties
        const geckos = [];
        let idCount = 1;
        for (const [key, data] of Object.entries(geckosByColor)) {
            const body = this.orderSegments(data.segments);
            if (body.length > 0) {
                const properties = {};
                if (data.inner) {
                    properties.innerGecko = { color: data.inner };
                }

                // Heuristic for ropes: look for a hole near the tail
                const tail = body[body.length - 1];
                const nearbyHole = standaloneHoles.find(h =>
                    Math.abs(h.r - tail.r) + Math.abs(h.c - tail.c) === 1
                );
                if (nearbyHole) {
                    properties.attachedHole = { color: 'unknown' }; // Color determined by hole detection
                    // Note: We'd need to sample hole rim color for perfection
                }

                geckos.push({ id: idCount++, color: data.outer, body, properties });
            }
        }

        return { rows, cols, geckos, grid, standaloneHoles };
    }

    static orderSegments(segments) {
        if (segments.length === 0) return [];
        // Find an end (segment with only one neighbor in the set)
        let start = segments[0];
        for (const s of segments) {
            const neighbors = segments.filter(other =>
                Math.abs(other.r - s.r) + Math.abs(other.c - s.c) === 1
            );
            if (neighbors.length === 1) {
                start = s;
                break;
            }
        }

        const ordered = [start];
        const remaining = segments.filter(s => s !== start);

        while (remaining.length > 0) {
            const last = ordered[ordered.length - 1];
            const nextIdx = remaining.findIndex(other =>
                Math.abs(other.r - last.r) + Math.abs(other.c - last.c) === 1
            );
            if (nextIdx === -1) break;
            ordered.push(remaining.splice(nextIdx, 1)[0]);
        }
        return ordered;
    }

    static detectBounds(ctx, w, h) {
        const data = ctx.getImageData(0, 0, w, h).data;

        // Mobile screenshots often have icons @ top and bottom
        // We look for the game board which starts around 15% and ends around 85%
        const topSearch = Math.floor(h * 0.15);
        const bottomSearch = Math.floor(h * 0.85);

        // Level 1389 specific: The board has a white/light-gray border
        let boardTop = topSearch;
        let boardBottom = bottomSearch;

        for (let y = topSearch; y < h / 2; y++) {
            const p = this.getPixelColorFromData(data, w, w / 2, y);
            if (p.r > 240 && p.g > 240 && p.b > 240) { // White border
                boardTop = y;
                break;
            }
        }

        for (let y = bottomSearch; y > h / 2; y--) {
            const p = this.getPixelColorFromData(data, w, w / 2, y);
            if (p.r > 240 && p.g > 240 && p.b > 240) {
                boardBottom = y;
                break;
            }
        }

        return { x: 20, y: boardTop, width: w - 40, height: boardBottom - boardTop };
    }

    static getPixelColorFromData(data, width, x, y) {
        const i = (Math.floor(y) * width + Math.floor(x)) * 4;
        return { r: data[i], g: data[i + 1], b: data[i + 2] };
    }

    static guessDimensions(ctx, bounds) {
        // User confirmed 10 x 14
        return { rows: 14, cols: 10 };
    }

    static getPixelColor(ctx, x, y) {
        const p = ctx.getImageData(x, y, 1, 1).data;
        return { r: p[0], g: p[1], b: p[2] };
    }

    static classifyColor(rgb) {
        const { r, g, b } = rgb;
        // Background is light gray/blue/tiled
        if (r > 150 && g > 170 && b > 185) return 'empty';
        if (r < 70 && g < 70 && b < 70) return 'hole';

        const colors = {
            green: [74, 222, 128],
            blue: [59, 130, 246],
            red: [239, 68, 68],
            yellow: [234, 179, 8],
            pink: [236, 72, 153],
            orange: [251, 146, 60],
            purple: [168, 85, 247],
            maroon: [140, 45, 45],
            tan: [210, 180, 140],
            cyan: [100, 200, 255],
            magenta: [217, 70, 239],
            charcoal: [40, 40, 45],
            navy: [20, 40, 120],
            salmon: [230, 140, 140],
            gold: [255, 200, 0]
        };

        let minDist = Infinity;
        let closest = 'unknown';

        for (const [name, val] of Object.entries(colors)) {
            const d = Math.sqrt((r - val[0]) ** 2 + (g - val[1]) ** 2 + (b - val[2]) ** 2);
            if (d < minDist) {
                minDist = d;
                closest = name;
            }
        }

        return minDist < 100 ? closest : 'wall';
    }
}
