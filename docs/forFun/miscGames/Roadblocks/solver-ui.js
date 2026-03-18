/**
 * Roadblocks Level Solver (Visual)
 * 
 * Provides step-by-step animated solution playback.
 * Uses the BFS solver from engine.js and animates through
 * the solution one move at a time with visual feedback.
 */

class LevelSolver {
    constructor(containerEl, boardEl, options = {}) {
        this.container = containerEl;
        this.boardEl = boardEl;
        this.cellSize = options.cellSize || 40;
        this.gap = options.gap || 2;
        this.solution = null;
        this.currentStep = 0;
        this.game = null;
        this.grid = null;
        this.isPlaying = false;
        this.playTimer = null;
        this.playSpeed = 800; // ms between steps
    }

    /** Load a level (grid array) and attempt to solve */
    loadLevel(grid) {
        this.stop();
        this.grid = grid.map(row => [...row]);
        this.currentStep = 0;
        this.solution = solveBFS(grid);

        // Render the grid
        this._renderGrid();
        this._renderSolution();
        this._updateStepDisplay();
    }

    /** Load from the main level pack by index */
    loadLevelByIndex(idx) {
        if (idx >= 0 && idx < LEVEL_PACK.length) {
            this.loadLevel(LEVEL_PACK[idx]);
        }
    }

    _renderGrid() {
        this.boardEl.innerHTML = '';
        const grid = this.grid;
        const rows = grid.length;
        const cols = grid[0].length;
        const sz = this.cellSize;
        const gap = this.gap;

        // Find start and goal
        let start = null, goal = null;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] === CELL.START) start = { r, c };
                if (grid[r][c] === CELL.GOAL) goal = { r, c };
            }
        }

        this.boardEl.style.display = 'grid';
        this.boardEl.style.gridTemplateColumns = `repeat(${cols}, ${sz}px)`;
        this.boardEl.style.gridTemplateRows = `repeat(${rows}, ${sz}px)`;
        this.boardEl.style.gap = `${gap}px`;
        this.boardEl.style.width = 'fit-content';
        this.boardEl.style.padding = `${gap + 2}px`;
        this.boardEl.style.position = 'relative';
        this.boardEl.style.margin = '0 auto';

        // Prepare simulation grid (clear start marker)
        const simGrid = grid.map(row => [...row]);
        if (start) simGrid[start.r][start.c] = CELL.EMPTY;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'rb-cell';
                cell.style.width = `${sz}px`;
                cell.style.height = `${sz}px`;
                cell.style.borderRadius = '4px';
                cell.style.position = 'relative';

                const type = simGrid[r][c];
                this._styleCellType(cell, type);

                // Goal overlay
                if (goal && r === goal.r && c === goal.c) {
                    const goalEl = document.createElement('div');
                    goalEl.className = 'rb-goal';
                    cell.appendChild(goalEl);
                }

                this.boardEl.appendChild(cell);
            }
        }

        // Player
        if (start) {
            const playerEl = document.createElement('div');
            playerEl.className = 'rb-player';
            playerEl.id = 'solver-player';
            this.boardEl.appendChild(playerEl);

            const pad = gap + 2;
            const x = pad + start.c * (sz + gap);
            const y = pad + start.r * (sz + gap);
            playerEl.style.transform = `translate(${x}px, ${y}px)`;
        }

        this._playerPos = start ? { ...start } : null;
    }

    _styleCellType(cell, type) {
        switch (type) {
            case CELL.WALL: cell.classList.add('rb-wall'); break;
            case CELL.TRI_NW: cell.classList.add('rb-tri-nw'); break;
            case CELL.TRI_NE: cell.classList.add('rb-tri-ne'); break;
            case CELL.RAMP: cell.classList.add('rb-ramp'); break;
            case CELL.WORMHOLE: cell.classList.add('rb-wormhole'); break;
            default: cell.classList.add('rb-empty'); break;
        }
    }

    _renderSolution() {
        const display = this.container.querySelector('.solution-display');
        if (!display) return;

        if (!this.solution) {
            display.innerHTML = `
                <div class="status-indicator status-unsolvable">
                    <span class="status-dot"></span>
                    Level is unsolvable
                </div>`;
            return;
        }

        let html = `
            <div class="status-indicator status-solvable">
                <span class="status-dot"></span>
                Solvable in ${this.solution.length} move${this.solution.length !== 1 ? 's' : ''}
            </div>
            <div class="solution-steps" id="solver-steps">`;

        this.solution.forEach((dir, i) => {
            const arrowMap = { up: '↑', down: '↓', left: '←', right: '→' };
            html += `<div class="step-badge" data-step="${i}">${arrowMap[dir]} ${dir}</div>`;
        });

        html += '</div>';
        display.innerHTML = html;
    }

    _updateStepDisplay() {
        const steps = this.container.querySelectorAll('.step-badge');
        steps.forEach((step, i) => {
            step.classList.remove('active', 'done');
            if (i < this.currentStep) step.classList.add('done');
            if (i === this.currentStep) step.classList.add('active');
        });
    }

    /** Execute one step of the solution */
    step() {
        if (!this.solution || this.currentStep >= this.solution.length) return;
        if (!this._playerPos) return;

        const dir = this.solution[this.currentStep];
        const { dr, dc } = DIRECTIONS[dir];

        // Find goal
        let goal = null;
        for (let r = 0; r < this.grid.length; r++)
            for (let c = 0; c < this.grid[0].length; c++)
                if (this.grid[r][c] === CELL.GOAL) goal = { r, c };

        // Simulate grid (clear start)
        const simGrid = this.grid.map(row => [...row]);
        for (let r = 0; r < simGrid.length; r++)
            for (let c = 0; c < simGrid[0].length; c++)
                if (simGrid[r][c] === CELL.START) simGrid[r][c] = CELL.EMPTY;

        const path = simulateSlide(simGrid, this._playerPos.r, this._playerPos.c, dr, dc, goal);
        if (!path || path.length === 0) return;

        // Animate the path
        this._animateSolverPath(path, () => {
            this.currentStep++;
            this._updateStepDisplay();

            if (this.isPlaying && this.currentStep < this.solution.length) {
                this.playTimer = setTimeout(() => this.step(), this.playSpeed);
            } else {
                this.isPlaying = false;
            }
        });
    }

    _animateSolverPath(pathSegments, onComplete) {
        const playerEl = document.getElementById('solver-player');
        if (!playerEl || pathSegments.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        const seg = pathSegments.shift();
        const duration = seg.status === 'teleport' ? 150 :
            seg.status === 'teleport_end' ? 0 :
                Math.max(seg.distance * 50, 80);
        const sz = this.cellSize;
        const gap = this.gap;
        const pad = gap + 2;

        if (seg.status === 'teleport') {
            playerEl.style.transition = 'transform 0.15s ease-in, opacity 0.15s';
            playerEl.style.opacity = '0';
            playerEl.style.transform += ' scale(0.1) rotate(90deg)';
        } else if (seg.status === 'teleport_end') {
            playerEl.style.transition = 'none';
            const x = pad + seg.target.c * (sz + gap);
            const y = pad + seg.target.r * (sz + gap);
            playerEl.style.transform = `translate(${x}px, ${y}px)`;
            playerEl.getBoundingClientRect();
            playerEl.style.transition = 'transform 0.15s ease-out, opacity 0.15s';
            playerEl.style.opacity = '1';
            setTimeout(() => this._animateSolverPath(pathSegments, onComplete), 50);
            return;
        } else {
            playerEl.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
            playerEl.style.opacity = '1';
            const x = pad + seg.target.c * (sz + gap);
            const y = pad + seg.target.r * (sz + gap);
            playerEl.style.transform = `translate(${x}px, ${y}px)`;
        }

        setTimeout(() => {
            this._playerPos = { r: seg.target.r, c: seg.target.c };
            if (pathSegments.length > 0) {
                this._animateSolverPath(pathSegments, onComplete);
            } else {
                if (onComplete) onComplete();
            }
        }, duration);
    }

    /** Play the full solution automatically */
    play() {
        if (!this.solution) return;
        if (this.currentStep >= this.solution.length) {
            this.reset();
        }
        this.isPlaying = true;
        this.step();
    }

    /** Stop auto-play */
    stop() {
        this.isPlaying = false;
        if (this.playTimer) {
            clearTimeout(this.playTimer);
            this.playTimer = null;
        }
    }

    /** Reset to start */
    reset() {
        this.stop();
        this.currentStep = 0;
        this._renderGrid();
        this._updateStepDisplay();
    }

    setSpeed(ms) {
        this.playSpeed = ms;
    }
}
