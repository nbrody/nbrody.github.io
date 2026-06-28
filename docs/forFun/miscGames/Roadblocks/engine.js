/**
 * Roadblocks Engine — Core sliding block puzzle logic
 *
 * Block Types:
 *   0: Floor    1: Wall       2: Start     3: Goal
 *   4: Mirror \ (NW-SE)       5: Mirror / (NE-SW)
 *   6: Jump pad (leap over next cell)
 *   7: Portal (teleport pair)
 *   8: Void  (interior abyss — falling in is fatal, same as off-grid)
 *   9: Sand  (friction — the slide halts the instant you enter)
 *
 * Mirror Reflection Rules:
 *   Type 4 (\): (dr, dc) → (dc, dr)        — swaps row/col velocity
 *   Type 5 (/): (dr, dc) → (-dc, -dr)      — negates and swaps
 *
 * The player slides frictionlessly until hitting a wall, stopping on sand,
 * falling into the void (off-grid or an interior hole), or reaching the goal.
 */

const CELL = {
    EMPTY: 0,
    WALL: 1,
    START: 2,
    GOAL: 3,
    TRI_NW: 4,   // backslash \
    TRI_NE: 5,   // slash /
    RAMP: 6,     // jump pad
    WORMHOLE: 7, // portal
    VOID: 8,     // interior abyss
    SAND: 9      // friction / stop tile
};

const CELL_NAMES = {
    [CELL.EMPTY]: 'Floor',
    [CELL.WALL]: 'Wall',
    [CELL.START]: 'Start',
    [CELL.GOAL]: 'Goal',
    [CELL.TRI_NW]: 'Mirror \\',
    [CELL.TRI_NE]: 'Mirror /',
    [CELL.RAMP]: 'Jump Pad',
    [CELL.WORMHOLE]: 'Portal',
    [CELL.VOID]: 'Void',
    [CELL.SAND]: 'Sand'
};

const DIRECTIONS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
};

const DIR_LIST = [
    { dr: -1, dc: 0, name: 'up' },
    { dr: 1, dc: 0, name: 'down' },
    { dr: 0, dc: -1, name: 'left' },
    { dr: 0, dc: 1, name: 'right' }
];

// ──────────────────────────────────────────────
// Slide Simulation (pure — no DOM)
// ──────────────────────────────────────────────

/**
 * Simulate a slide from (startR, startC) in direction (dr, dc).
 * Returns an array of path segments for animation.
 */
function simulateSlide(grid, startR, startC, dr, dc, goal) {
    const rows = grid.length;
    const cols = grid[0].length;
    let r = startR, c = startC;
    let path = [];
    let visited = new Set();

    while (true) {
        const key = `${r},${c},${dr},${dc}`;
        if (visited.has(key)) return path; // infinite loop
        visited.add(key);

        const nr = r + dr;
        const nc = c + dc;

        // 1. Bounds check — Abyss
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
            path.push({ target: { r: nr, c: nc }, distance: 1, status: 'lost' });
            return path;
        }

        const cell = grid[nr][nc];

        // 2. Wall — stop in place (don't enter)
        if (cell === CELL.WALL) {
            path.push({ target: { r, c }, distance: 0, status: 'stop' });
            return path;
        }

        // 2b. Void — slide in and fall (fatal, like the Abyss)
        if (cell === CELL.VOID) {
            path.push({ target: { r: nr, c: nc }, distance: 1, status: 'lost' });
            return path;
        }

        // 2c. Sand — friction: enter the cell, then halt
        if (cell === CELL.SAND) {
            r = nr; c = nc;
            const last = path[path.length - 1];
            if (last && last.status === 'moving' && last.dr === dr && last.dc === dc) {
                last.target = { r, c };
                last.distance++;
                last.status = 'stop';
            } else {
                path.push({ target: { r, c }, distance: 1, status: 'stop' });
            }
            return path;
        }

        // 3. Triangle reflectors — bounce at right angle
        if (cell === CELL.TRI_NW || cell === CELL.TRI_NE) {
            let nextDr, nextDc;
            if (cell === CELL.TRI_NW) {
                // Backslash \ : swap dr and dc
                nextDr = dc;
                nextDc = dr;
            } else {
                // Slash / : negate and swap
                nextDr = -dc;
                nextDc = -dr;
            }
            path.push({ target: { r: nr, c: nc }, distance: 1, status: 'reflect' });
            r = nr; c = nc;
            dr = nextDr; dc = nextDc;
            continue;
        }

        // 4. Jump pad — vault the cell immediately after the pad, landing
        //    two cells beyond the pad. This cleanly leaps over a single wall
        //    or void gap. (The vaulted cell can be anything.)
        if (cell === CELL.RAMP) {
            const landR = nr + 2 * dr;
            const landC = nc + 2 * dc;
            const landOOB = landR < 0 || landR >= rows || landC < 0 || landC >= cols;
            const landCell = landOOB ? null : grid[landR][landC];

            // Can't land on a wall — ride up onto the pad and stop.
            if (!landOOB && landCell === CELL.WALL) {
                path.push({ target: { r: nr, c: nc }, distance: 1, status: 'stop' });
                return path;
            }

            path.push({ target: { r: landR, c: landC }, distance: 2, status: 'jump' });
            r = landR; c = landC;

            if (r === goal.r && c === goal.c) {
                path[path.length - 1].status = 'win';
                return path;
            }
            // Overshot into the abyss (edge or interior hole) — fatal.
            if (landOOB || landCell === CELL.VOID) {
                path[path.length - 1].status = 'lost';
                return path;
            }
            // Landed on sand — friction halts the leap.
            if (landCell === CELL.SAND) {
                path[path.length - 1].status = 'stop';
                return path;
            }
            continue;
        }

        // 5. Wormhole — teleport to partner
        if (cell === CELL.WORMHOLE) {
            let targetWormhole = null;
            for (let tr = 0; tr < rows; tr++) {
                for (let tc = 0; tc < cols; tc++) {
                    if (grid[tr][tc] === CELL.WORMHOLE && (tr !== nr || tc !== nc)) {
                        targetWormhole = { r: tr, c: tc };
                        break;
                    }
                }
                if (targetWormhole) break;
            }
            if (targetWormhole) {
                path.push({ target: { r: nr, c: nc }, distance: 1, status: 'teleport' });
                r = targetWormhole.r;
                c = targetWormhole.c;
                path.push({ target: { r, c }, distance: 0, status: 'teleport_end' });
                continue;
            }
        }

        // 6. Normal movement
        r = nr; c = nc;

        // Check goal
        if (r === goal.r && c === goal.c) {
            path.push({ target: { r, c }, distance: 1, status: 'win' });
            return path;
        }

        // Merge consecutive moving segments
        const last = path[path.length - 1];
        if (last && last.status === 'moving' && last.dr === dr && last.dc === dc) {
            last.target = { r, c };
            last.distance++;
        } else {
            path.push({ target: { r, c }, distance: 1, status: 'moving', dr, dc });
        }
    }
}

// ──────────────────────────────────────────────
// BFS Solver (pure — no DOM)
// ──────────────────────────────────────────────

/**
 * Solve a level using BFS. Returns the solution as an array of
 * direction names ['up', 'right', ...] or null if unsolvable.
 */
function solveBFS(grid) {
    let start = null, goal = null;
    const rows = grid.length;
    const cols = grid[0].length;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === CELL.START) start = { r, c };
            if (grid[r][c] === CELL.GOAL) goal = { r, c };
        }
    }
    if (!start || !goal) return null;

    // For simulation, temporarily clear start marker
    const simGrid = grid.map(row => [...row]);
    simGrid[start.r][start.c] = CELL.EMPTY;

    const queue = [{ r: start.r, c: start.c, moves: [] }];
    const visited = new Set([`${start.r},${start.c}`]);

    while (queue.length > 0) {
        const { r, c, moves } = queue.shift();

        for (const dir of DIR_LIST) {
            const path = simulateSlide(simGrid, r, c, dir.dr, dir.dc, goal);
            if (!path || path.length === 0) continue;

            const last = path[path.length - 1];
            if (last.status === 'win') return [...moves, dir.name];
            if (last.status === 'lost') continue;

            // Find final resting position
            const finalPos = last.target;
            const key = `${finalPos.r},${finalPos.c}`;
            if (!visited.has(key)) {
                visited.add(key);
                queue.push({ r: finalPos.r, c: finalPos.c, moves: [...moves, dir.name] });
            }
        }
    }
    return null; // unsolvable
}

/**
 * Quick check: is this level solvable?
 */
function isLevelSolvable(grid) {
    return solveBFS(grid) !== null;
}

// ──────────────────────────────────────────────
// Game State Manager
// ──────────────────────────────────────────────

class RoadblocksGame {
    constructor(containerEl, options = {}) {
        this.container = containerEl;
        this.levels = [];
        this.currentLevel = 0;
        this.grid = [];
        this.player = { r: 0, c: 0 };
        this.goal = { r: 0, c: 0 };
        this.active = false;
        this.isMoving = false;
        this.onWin = options.onWin || null;
        this.onLevelComplete = options.onLevelComplete || null;
        this.onLost = options.onLost || null;
        this.onMove = options.onMove || null;
        this.cellSize = options.cellSize || 46;
        this.gap = options.gap || 5;
        this.moveCount = 0;

        this.renderer = new BoardRenderer(containerEl, { cellSize: this.cellSize, gap: this.gap });
        this.moveQueue = [];
        this.isProcessingQueue = false;
        this._setupInput();
    }

    loadLevels(levels) {
        this.levels = levels;
        this.currentLevel = 0;
        this._loadLevel(0);
    }

    goToLevel(idx) {
        if (idx >= 0 && idx < this.levels.length) {
            this.currentLevel = idx;
            this._loadLevel(idx);
        }
    }

    _loadLevel(idx) {
        this.currentLevel = idx;
        this.grid = JSON.parse(JSON.stringify(this.levels[idx]));
        this.active = true;
        this.isMoving = false;
        this.moveCount = 0;
        this.moveQueue = [];

        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] === CELL.START) {
                    this.player = { r, c };
                    this.grid[r][c] = CELL.EMPTY;
                }
                if (this.grid[r][c] === CELL.GOAL) {
                    this.goal = { r, c };
                }
            }
        }

        this.renderer.setGrid(this.grid);
        this.renderer.setPlayerCell(this.player.r, this.player.c);
    }

    // ── Input ──
    _setupInput() {
        // Keyboard
        if (!RoadblocksGame._keyBound) RoadblocksGame._keyBound = [];
        const keyHandler = (e) => {
            if (!this.active) return;
            const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
            if (map[e.key]) {
                e.preventDefault();
                this._queueMove(map[e.key]);
            }
        };
        document.addEventListener('keydown', keyHandler);

        const target = this.renderer.canvas;

        // Touch
        let startX = 0, startY = 0;
        target.addEventListener('touchstart', (e) => {
            startX = e.changedTouches[0].screenX;
            startY = e.changedTouches[0].screenY;
        }, { passive: true });
        target.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].screenX - startX;
            const dy = e.changedTouches[0].screenY - startY;
            this._handleInputSwipe(dx, dy);
        }, { passive: true });

        // Mouse drag
        let dragging = false;
        target.addEventListener('mousedown', (e) => {
            startX = e.screenX; startY = e.screenY; dragging = true;
        });
        window.addEventListener('mouseup', (e) => {
            if (!dragging) return;
            const dx = e.screenX - startX;
            const dy = e.screenY - startY;
            this._handleInputSwipe(dx, dy);
            dragging = false;
        });
    }

    _handleInputSwipe(dx, dy) {
        if (!this.active) return;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(dx) > 24) this._queueMove(dx > 0 ? 'right' : 'left');
        } else {
            if (Math.abs(dy) > 24) this._queueMove(dy > 0 ? 'down' : 'up');
        }
    }

    _queueMove(dir) {
        if (!this.active) return;
        this.moveQueue.push(dir);
        this._processQueue();
    }

    move(dir) { this._queueMove(dir); }

    async _processQueue() {
        if (this.isProcessingQueue || this.moveQueue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.moveQueue.length > 0 && this.active) {
            const dir = this.moveQueue.shift();
            const { dr, dc } = DIRECTIONS[dir];
            const path = simulateSlide(this.grid, this.player.r, this.player.c, dr, dc, this.goal);

            // Ignore no-op moves (immediately blocked by a wall)
            const noop = path.length === 1 && path[0].distance === 0 && path[0].status === 'stop';
            if (path && path.length > 0 && !noop) {
                this.moveCount++;
                if (this.onMove) this.onMove(dir, this.moveCount);
                this.isMoving = true;
                const status = await this.renderer.tweenPath(path);
                this.isMoving = false;
                const last = path[path.length - 1];
                this.player = { r: last.target.r, c: last.target.c };
                this._handleMoveEnd(status);
            }
            if (this.moveQueue.length > 0) {
                await new Promise(r => setTimeout(r, 40));
            }
        }
        this.isProcessingQueue = false;
    }

    _handleMoveEnd(status) {
        if (status === 'lost') {
            this.active = false;
            this.moveQueue = [];
            if (this.onLost) this.onLost(this.currentLevel);
            this.renderer.playDeath();

            const flash = document.getElementById('flash-screen');
            if (flash) {
                flash.classList.add('flash-active');
                setTimeout(() => flash.classList.remove('flash-active'), 600);
            }
            this.container.closest('.glass-panel')?.classList.add('shake');
            setTimeout(() => this.container.closest('.glass-panel')?.classList.remove('shake'), 500);

            setTimeout(() => this._loadLevel(this.currentLevel), 900);

        } else if (status === 'win') {
            this.active = false;
            this.moveQueue = [];
            this.renderer.playWin();
            if (this.currentLevel < this.levels.length - 1) {
                if (this.onLevelComplete) this.onLevelComplete(this.currentLevel, this.moveCount);
                setTimeout(() => {
                    this.currentLevel++;
                    this._loadLevel(this.currentLevel);
                }, 1000);
            } else {
                if (this.onWin) this.onWin(this.moveCount);
            }
        }
    }
}
