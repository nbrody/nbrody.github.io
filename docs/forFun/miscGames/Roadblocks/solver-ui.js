/**
 * Roadblocks — Visual Solver
 *
 * Runs the BFS solver from engine.js and plays the solution back through the
 * shared canvas BoardRenderer, one move at a time, highlighting each step.
 */

class LevelSolver {
    constructor(containerEl, boardEl, options = {}) {
        this.container = containerEl;
        this.renderer = new BoardRenderer(boardEl, {
            cellSize: options.cellSize || 46,
            gap: options.gap || 5
        });
        this.solution = null;
        this.currentStep = 0;
        this.grid = null;
        this.start = null;
        this.goal = null;
        this.playerCell = null;
        this.isPlaying = false;
        this.isAnimating = false;
        this.playTimer = null;
        this.playSpeed = 600;
    }

    loadLevel(grid) {
        this.stop();
        this.grid = grid.map(row => row.slice());
        this.currentStep = 0;

        this.start = null; this.goal = null;
        for (let r = 0; r < this.grid.length; r++) {
            for (let c = 0; c < this.grid[0].length; c++) {
                if (this.grid[r][c] === CELL.START) this.start = { r, c };
                if (this.grid[r][c] === CELL.GOAL) this.goal = { r, c };
            }
        }

        // Simulation grid: clear the start marker so it reads as floor.
        this.simGrid = this.grid.map(row => row.slice());
        if (this.start) this.simGrid[this.start.r][this.start.c] = CELL.EMPTY;

        this.solution = solveBFS(this.grid);

        this.renderer.setGrid(this.grid);
        if (this.start) {
            this.playerCell = { ...this.start };
            this.renderer.setPlayerCell(this.start.r, this.start.c);
        }
        this._renderSolution();
        this._updateStepDisplay();
    }

    loadLevelByIndex(idx) {
        if (idx >= 0 && idx < LEVEL_PACK.length) this.loadLevel(LEVEL_PACK[idx]);
    }

    _renderSolution() {
        const display = this.container.querySelector('.solution-display');
        if (!display) return;

        if (!this.solution) {
            display.innerHTML = `
                <div class="status-indicator status-unsolvable">
                    <span class="status-dot"></span> Level is unsolvable
                </div>`;
            return;
        }
        const n = this.solution.length;
        let html = `
            <div class="status-indicator status-solvable">
                <span class="status-dot"></span>
                Optimal: ${n} move${n !== 1 ? 's' : ''}
            </div>
            <div class="solution-steps" id="solver-steps">`;
        const arrow = { up: '↑', down: '↓', left: '←', right: '→' };
        this.solution.forEach((dir, i) => {
            html += `<div class="step-badge" data-step="${i}">${arrow[dir]} ${dir}</div>`;
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

    async step() {
        if (!this.solution || this.currentStep >= this.solution.length) return;
        if (!this.playerCell || this.isAnimating) return;

        const dir = this.solution[this.currentStep];
        const { dr, dc } = DIRECTIONS[dir];
        const path = simulateSlide(this.simGrid, this.playerCell.r, this.playerCell.c, dr, dc, this.goal);
        if (!path || path.length === 0) return;

        this.isAnimating = true;
        const status = await this.renderer.tweenPath(path);
        const last = path[path.length - 1];
        this.playerCell = { r: last.target.r, c: last.target.c };
        this.isAnimating = false;

        this.currentStep++;
        this._updateStepDisplay();
        if (status === 'win') this.renderer.playWin();

        if (this.isPlaying && this.currentStep < this.solution.length) {
            this.playTimer = setTimeout(() => this.step(), this.playSpeed);
        } else {
            this.isPlaying = false;
        }
    }

    play() {
        if (!this.solution) return;
        if (this.currentStep >= this.solution.length) this.reset();
        this.isPlaying = true;
        this.step();
    }

    stop() {
        this.isPlaying = false;
        if (this.playTimer) { clearTimeout(this.playTimer); this.playTimer = null; }
    }

    reset() {
        this.stop();
        this.currentStep = 0;
        if (this.start) {
            this.playerCell = { ...this.start };
            this.renderer.setPlayerCell(this.start.r, this.start.c);
        }
        this._updateStepDisplay();
    }

    setSpeed(ms) { this.playSpeed = ms; }
}
