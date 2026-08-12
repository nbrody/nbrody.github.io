/* ============================================================
   TROPHALLAXIS — nest layouts
   16 x 13 tiles of 16px = 256 x 208 playfield.
   '#' carton wall, '.' gallery floor, 'Q' royal cell.
   ============================================================ */

const TILE = 16, COLS = 16, ROWS = 13;
const FIELD_W = COLS * TILE, FIELD_H = ROWS * TILE;

const MAPS = [
    {
        name: 'NURSERY GALLERY',
        rows: [
            '################',
            '#..............#',
            '#.####.##.####.#',
            '#.#..........#.#',
            '#.#.##.QQ.##.#.#',
            '#...#..QQ..#...#',
            '##.....##.....##',
            '#...#......#...#',
            '#.#.#.####.#.#.#',
            '#.#........#.#.#',
            '#.####.##.####.#',
            '#..............#',
            '################',
        ],
    },
    {
        name: 'FUNGUS COMBS',
        rows: [
            '################',
            '#..#........#..#',
            '#..#.QQ..#..#..#',
            '#....QQ..#.....#',
            '###..........###',
            '#....######....#',
            '#.#..........#.#',
            '#....######....#',
            '###..........###',
            '#.....#..#.....#',
            '#..#..#..#..#..#',
            '#..#........#..#',
            '################',
        ],
    },
    {
        name: 'DEEP TUNNELS',
        rows: [
            '################',
            '#......#.......#',
            '#.####.#.####..#',
            '#.#..........#.#',
            '#.#.##....##.#.#',
            '#...#.QQ..#....#',
            '##..#.QQ..#...##',
            '#...#.....#....#',
            '#.#.##....##.#.#',
            '#.#..........#.#',
            '#..####.#####..#',
            '#......#.......#',
            '################',
        ],
    },
];

class NestMap {
    constructor(def) {
        this.name = def.name;
        this.rows = def.rows;
        this.queen = this.findQueen();
        this.open = [];
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (!this.solidTile(c, r)) this.open.push({ c, r });
        this.bg = this.render();
    }

    findQueen() {
        for (let r = 0; r < ROWS; r++) {
            const c = this.rows[r].indexOf('Q');
            if (c >= 0) return { c, r, x: (c + 1) * TILE, y: (r + 1) * TILE };
        }
        return { c: 7, r: 6, x: 8 * TILE, y: 7 * TILE };
    }

    solidTile(c, r) {
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
        return this.rows[r][c] === '#';
    }

    solidAt(x, y) { return this.solidTile(Math.floor(x / TILE), Math.floor(y / TILE)); }

    /* Axis-aligned box against the tile grid. */
    boxHits(x, y, half) {
        return this.solidAt(x - half, y - half) || this.solidAt(x + half, y - half) ||
            this.solidAt(x - half, y + half) || this.solidAt(x + half, y + half);
    }

    randomOpen(rng, minDistFrom, minDist) {
        for (let i = 0; i < 200; i++) {
            const t = this.open[(rng() * this.open.length) | 0];
            const x = t.c * TILE + 8, y = t.r * TILE + 8;
            if (minDistFrom) {
                let ok = true;
                for (const p of minDistFrom) if (Math.hypot(p.x - x, p.y - y) < (minDist || 40)) { ok = false; break; }
                if (!ok) continue;
            }
            return { x, y };
        }
        const t = this.open[0];
        return { x: t.c * TILE + 8, y: t.r * TILE + 8 };
    }

    /* Open tiles hugging the border — where raiders break in. */
    edgeSpawns() {
        return this.open
            .filter(t => t.c <= 1 || t.r <= 1 || t.c >= COLS - 2 || t.r >= ROWS - 2)
            .map(t => ({ x: t.c * TILE + 8, y: t.r * TILE + 8 }));
    }

    render() {
        const cv = document.createElement('canvas');
        cv.width = FIELD_W; cv.height = FIELD_H;
        const g = cv.getContext('2d');
        const hash = (c, r, s) => {
            let h = (c * 374761393 + r * 668265263 + s * 2246822519) >>> 0;
            h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
            return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        };
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const x = c * TILE, y = r * TILE;
                if (this.solidTile(c, r)) {
                    g.fillStyle = '#6b4423';
                    g.fillRect(x, y, TILE, TILE);
                    g.fillStyle = '#8a5c30';
                    g.fillRect(x, y, TILE, 2);
                    g.fillStyle = '#3d2411';
                    g.fillRect(x, y + TILE - 3, TILE, 3);
                    g.fillStyle = '#4f3018';
                    g.fillRect(x + TILE - 2, y, 2, TILE);
                    for (let i = 0; i < 7; i++) {
                        const h1 = hash(c, r, i), h2 = hash(c, r, i + 40);
                        g.fillStyle = h1 > 0.5 ? '#7d5228' : '#553418';
                        g.fillRect(x + ((h1 * 13) | 0) + 1, y + ((h2 * 11) | 0) + 3, 2, 1);
                    }
                } else {
                    g.fillStyle = '#241608';
                    g.fillRect(x, y, TILE, TILE);
                    for (let i = 0; i < 5; i++) {
                        const h1 = hash(c, r, i + 90), h2 = hash(c, r, i + 130);
                        g.fillStyle = h1 > 0.72 ? '#33200c' : '#1b1006';
                        g.fillRect(x + ((h1 * 15) | 0), y + ((h2 * 15) | 0), 1, 1);
                    }
                    // occasional fungus comb speck
                    if (hash(c, r, 7) > 0.86) {
                        g.fillStyle = '#3a5a22';
                        g.fillRect(x + 5, y + 6, 3, 2);
                        g.fillStyle = '#57813a';
                        g.fillRect(x + 6, y + 5, 2, 1);
                    }
                    // soft shadow under walls
                    if (this.solidTile(c, r - 1)) {
                        g.fillStyle = 'rgba(0,0,0,0.45)';
                        g.fillRect(x, y, TILE, 3);
                    }
                }
            }
        }
        // royal cell floor tint
        const q = this.queen;
        g.fillStyle = 'rgba(120,80,30,0.30)';
        g.fillRect(q.c * TILE - 4, q.r * TILE - 4, TILE * 2 + 8, TILE * 2 + 8);
        return cv;
    }
}
