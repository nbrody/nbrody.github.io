/**
 * Roadblocks Engine — Core sliding block puzzle logic
 * 
 * Block Types:
 *   0: Empty    1: Wall       2: Start     3: Goal
 *   4: Triangle \ (NW-SE)     5: Triangle / (NE-SW)
 *   6: Ramp (jump over next)  7: Wormhole (teleport pair)
 *
 * Triangle Reflection Rules:
 *   Type 4 (\): (dr, dc) → (dc, dr)        — swaps row/col velocity
 *   Type 5 (/): (dr, dc) → (-dc, -dr)      — negates and swaps
 *
 * The player slides frictionlessly until hitting a wall, falling off
 * the grid (Abyss), or reaching the goal.
 */

const CELL = {
    EMPTY: 0,
    WALL: 1,
    START: 2,
    GOAL: 3,
    TRI_NW: 4,   // backslash \
    TRI_NE: 5,   // slash /
    RAMP: 6,
    WORMHOLE: 7
};

const CELL_NAMES = {
    [CELL.EMPTY]: 'Empty',
    [CELL.WALL]: 'Wall',
    [CELL.START]: 'Start',
    [CELL.GOAL]: 'Goal',
    [CELL.TRI_NW]: 'Triangle \\',
    [CELL.TRI_NE]: 'Triangle /',
    [CELL.RAMP]: 'Ramp',
    [CELL.WORMHOLE]: 'Wormhole'
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

        // 2. Wall — stop in place
        if (cell === CELL.WALL) {
            path.push({ target: { r, c }, distance: 0, status: 'stop' });
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

        // 4. Ramp — jump over next cell
        if (cell === CELL.RAMP) {
            const jr = nr + dr;
            const jc = nc + dc;
            path.push({ target: { r: jr, c: jc }, distance: 2, status: 'jump' });
            r = jr; c = jc;

            // Check win on landing
            if (r === goal.r && c === goal.c) {
                path[path.length - 1].status = 'win';
                return path;
            }
            // Check bounds on landing
            if (r < 0 || r >= rows || c < 0 || c >= cols) {
                path[path.length - 1].status = 'lost';
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
        this.cellSize = options.cellSize || 40;
        this.gap = options.gap || 2;
        this.moveCount = 0;
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

        // Find start and goal, clear start marker
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] === CELL.START) {
                    this.player = { r, c };
                    this.grid[r][c] = CELL.EMPTY;
                }
                if (this.grid[r][c] === CELL.GOAL) {
                    this.goal = { r, c };
                    // Keep goal in grid for visual reference but track logically
                }
            }
        }

        this.render();
    }

    // ── Input ──
    _setupInput() {
        this.moveQueue = [];
        this.isProcessingQueue = false;

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (!this.active) return;
            const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
            if (map[e.key]) {
                e.preventDefault();
                this._queueMove(map[e.key]);
            }
        });

        // Touch
        let startX = 0, startY = 0;
        this.container.addEventListener('touchstart', (e) => {
            startX = e.changedTouches[0].screenX;
            startY = e.changedTouches[0].screenY;
            // e.preventDefault(); // Might interfere with scrolling if not on board
        }, { passive: true });

        this.container.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].screenX - startX;
            const dy = e.changedTouches[0].screenY - startY;
            this._handleInputSwipe(dx, dy);
        }, { passive: true });

        // Mouse drag
        let dragging = false;
        this.container.addEventListener('mousedown', (e) => {
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
            if (Math.abs(dx) > 30) this._queueMove(dx > 0 ? 'right' : 'left');
        } else {
            if (Math.abs(dy) > 30) this._queueMove(dy > 0 ? 'down' : 'up');
        }
    }

    _queueMove(dir) {
        if (!this.active) return;
        this.moveQueue.push(dir);
        this._processQueue();
    }

    async _processQueue() {
        if (this.isProcessingQueue || this.moveQueue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.moveQueue.length > 0) {
            if (this.isMoving) {
                // Wait for current animation to finish
                await new Promise(resolve => {
                    this._onMoveCompleteOnce = resolve;
                });
            }

            const dir = this.moveQueue.shift();
            const { dr, dc } = DIRECTIONS[dir];
            const path = simulateSlide(this.grid, this.player.r, this.player.c, dr, dc, this.goal);

            if (path && path.length > 0 && !(path.length === 1 && path[0].distance === 0 && path[0].status !== 'lost')) {
                this.moveCount++;
                if (this.onMove) this.onMove(dir, this.moveCount);
                await this._animatePath(path);
            }

            // Small delay between moves in queue for "intended" feel
            if (this.moveQueue.length > 0) {
                await new Promise(r => setTimeout(r, 50));
            }
        }

        this.isProcessingQueue = false;
    }

    // Allow external calls to immediately queue a move
    move(dir) {
        this._queueMove(dir);
    }

    // ── Animation ──
    async _animatePath(path) {
        this.isMoving = true;
        const playerEl = this.container.querySelector('.rb-player');
        if (!playerEl) {
            this.isMoving = false;
            return;
        }

        for (let i = 0; i < path.length; i++) {
            const seg = path[i];

            // Timing constants
            let duration;
            if (seg.status === 'teleport') duration = 150;
            else if (seg.status === 'teleport_end') duration = 0;
            else if (seg.status === 'jump') duration = 120;
            else if (seg.status === 'reflect') duration = 100;
            else duration = Math.max(seg.distance * 40, 60);

            if (seg.status === 'teleport') {
                playerEl.style.transition = 'transform 0.15s ease-in, opacity 0.15s';
                playerEl.style.opacity = '0';
                playerEl.style.transform += ' scale(0.1) rotate(90deg)';
                await new Promise(r => setTimeout(r, 150));
            } else if (seg.status === 'teleport_end') {
                playerEl.style.transition = 'none';
                const { x, y } = this._cellPixel(seg.target.r, seg.target.c);
                playerEl.style.transform = `translate(${x}px, ${y}px)`;
                playerEl.getBoundingClientRect(); // reflow
                playerEl.style.transition = 'transform 0.15s ease-out, opacity 0.15s';
                playerEl.style.opacity = '1';
                await new Promise(r => setTimeout(r, 50));
            } else {
                playerEl.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
                playerEl.style.opacity = '1';
                const { x, y } = this._cellPixel(seg.target.r, seg.target.c);
                playerEl.style.transform = `translate(${x}px, ${y}px)`;
                // Wait for this segment to finish
                await new Promise(r => setTimeout(r, duration));
            }

            this.player = { r: seg.target.r, c: seg.target.c };

            // If it's the last segment, handle end state
            if (i === path.length - 1) {
                this.isMoving = false;
                this._handleMoveEnd(seg.status);
                if (this._onMoveCompleteOnce) {
                    const cb = this._onMoveCompleteOnce;
                    this._onMoveCompleteOnce = null;
                    cb();
                }
            }
        }
    }

    _cellPixel(r, c) {
        const pad = this.gap + 2;
        return {
            x: pad + c * (this.cellSize + this.gap),
            y: pad + r * (this.cellSize + this.gap)
        };
    }

    _handleMoveEnd(status) {
        if (status === 'lost') {
            this.active = false;
            if (this.onLost) this.onLost(this.currentLevel);

            const playerEl = this.container.querySelector('.rb-player');
            if (playerEl) {
                playerEl.style.transition = 'transform 0.5s ease-in, opacity 0.5s';
                playerEl.style.opacity = '0';
                playerEl.style.transform += ' scale(0) rotate(180deg)';
            }

            // Flash effect
            const flash = document.getElementById('flash-screen');
            if (flash) {
                flash.classList.add('flash-active');
                setTimeout(() => flash.classList.remove('flash-active'), 600);
            }

            // Shake
            this.container.closest('.glass-panel')?.classList.add('shake');
            setTimeout(() => {
                this.container.closest('.glass-panel')?.classList.remove('shake');
            }, 500);

            setTimeout(() => this._loadLevel(this.currentLevel), 800);

        } else if (status === 'win') {
            if (this.currentLevel < this.levels.length - 1) {
                this.active = false;
                if (this.onLevelComplete) this.onLevelComplete(this.currentLevel, this.moveCount);

                const playerEl = this.container.querySelector('.rb-player');
                if (playerEl) {
                    playerEl.style.transition = 'transform 0.5s ease-in, opacity 0.5s';
                    playerEl.style.transform += ' scale(0.5)';
                    playerEl.style.opacity = '0';
                }

                setTimeout(() => {
                    this.currentLevel++;
                    this._loadLevel(this.currentLevel);
                }, 800);
            } else {
                this.active = false;
                if (this.onWin) this.onWin(this.moveCount);
            }
        }
    }

    // ── Rendering ──
    render() {
        this.container.innerHTML = '';
        const rows = this.grid.length;
        const cols = this.grid[0].length;
        const sz = this.cellSize;
        const gap = this.gap;

        this.container.style.display = 'grid';
        this.container.style.gridTemplateColumns = `repeat(${cols}, ${sz}px)`;
        this.container.style.gridTemplateRows = `repeat(${rows}, ${sz}px)`;
        this.container.style.gap = `${gap}px`;
        this.container.style.width = 'fit-content';
        this.container.style.padding = `${gap + 2}px`;
        this.container.style.position = 'relative';
        this.container.style.margin = '0 auto';

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'rb-cell';
                cell.style.width = `${sz}px`;
                cell.style.height = `${sz}px`;
                cell.style.borderRadius = '4px';
                cell.style.position = 'relative';
                cell.dataset.r = r;
                cell.dataset.c = c;

                const type = this.grid[r][c];
                this._styleCellType(cell, type);

                // Goal overlay
                if (r === this.goal.r && c === this.goal.c) {
                    const goalEl = document.createElement('div');
                    goalEl.className = 'rb-goal';
                    cell.appendChild(goalEl);
                }

                this.container.appendChild(cell);
            }
        }

        // Player
        const playerEl = document.createElement('div');
        playerEl.className = 'rb-player';
        this.container.appendChild(playerEl);

        const { x, y } = this._cellPixel(this.player.r, this.player.c);
        playerEl.style.transform = `translate(${x}px, ${y}px)`;
    }

    _styleCellType(cell, type) {
        switch (type) {
            case CELL.WALL:
                cell.classList.add('rb-wall');
                break;
            case CELL.TRI_NW:
                cell.classList.add('rb-tri-nw');
                break;
            case CELL.TRI_NE:
                cell.classList.add('rb-tri-ne');
                break;
            case CELL.RAMP:
                cell.classList.add('rb-ramp');
                break;
            case CELL.WORMHOLE:
                cell.classList.add('rb-wormhole');
                break;
            default:
                cell.classList.add('rb-empty');
                break;
        }
    }
}
