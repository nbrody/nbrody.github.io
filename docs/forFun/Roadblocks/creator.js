/**
 * Roadblocks Level Creator
 * 
 * Advanced interactive level editor with:
 * - Click-to-place block palette
 * - Real-time solvability verification
 * - Test play mode
 * - Export/Import levels as JSON
 * - Grid resize
 */

class LevelCreator {
    constructor(containerEl, gridEl, options = {}) {
        this.container = containerEl;
        this.gridEl = gridEl;
        this.rows = options.rows || 6;
        this.cols = options.cols || 8;
        this.cellSize = options.cellSize || 40;
        this.gap = options.gap || 2;
        this.selectedTool = CELL.WALL;  // default tool
        this.grid = [];
        this.isDrawing = false;
        this.onSolvabilityChange = options.onSolvabilityChange || null;
        this.testGame = null;
        this.testMode = false;

        this._initGrid();
        this._setupPalette();
        this._render();
    }

    _initGrid() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid.push(new Array(this.cols).fill(CELL.EMPTY));
        }

        // Place default start and goal
        if (this.rows >= 2 && this.cols >= 2) {
            this.grid[1][1] = CELL.START;
            this.grid[this.rows - 2][this.cols - 2] = CELL.GOAL;
        }
    }

    _setupPalette() {
        const palette = this.container.querySelector('.block-palette');
        if (!palette) return;

        const tools = [
            { type: CELL.EMPTY, label: 'Erase', icon: '·', cls: 'rb-empty' },
            { type: CELL.WALL, label: 'Wall', icon: '█', cls: 'rb-wall' },
            { type: CELL.START, label: 'Start', icon: 'S', cls: 'preview-start' },
            { type: CELL.GOAL, label: 'Goal', icon: '★', cls: 'preview-goal' },
            { type: CELL.TRI_NW, label: 'Tri \\', icon: '\\', cls: 'preview-tri-nw' },
            { type: CELL.TRI_NE, label: 'Tri /', icon: '/', cls: 'preview-tri-ne' },
            { type: CELL.RAMP, label: 'Ramp', icon: '⤴', cls: 'preview-ramp' },
            { type: CELL.WORMHOLE, label: 'Wormhole', icon: '◉', cls: 'preview-wormhole' },
        ];

        palette.innerHTML = '';
        tools.forEach(t => {
            const item = document.createElement('button');
            item.className = 'palette-item' + (t.type === this.selectedTool ? ' selected' : '');
            item.dataset.type = t.type;

            const preview = document.createElement('div');
            preview.className = 'palette-preview';
            preview.textContent = t.icon;
            preview.style.cssText = this._getPreviewStyle(t.type);

            const label = document.createElement('span');
            label.textContent = t.label;

            item.appendChild(preview);
            item.appendChild(label);

            item.addEventListener('click', () => {
                palette.querySelectorAll('.palette-item').forEach(p => p.classList.remove('selected'));
                item.classList.add('selected');
                this.selectedTool = t.type;
            });

            palette.appendChild(item);
        });
    }

    _getPreviewStyle(type) {
        switch (type) {
            case CELL.WALL:
                return 'background: linear-gradient(135deg, #374151, #4b5563); color: white;';
            case CELL.START:
                return 'background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border-radius: 50%;';
            case CELL.GOAL:
                return 'background: rgba(245, 158, 11, 0.15); color: #f59e0b;';
            case CELL.TRI_NW:
                return 'background: rgba(245, 158, 11, 0.12); color: #f59e0b;';
            case CELL.TRI_NE:
                return 'background: rgba(6, 182, 212, 0.12); color: #06b6d4;';
            case CELL.RAMP:
                return 'background: rgba(16, 185, 129, 0.12); color: #10b981;';
            case CELL.WORMHOLE:
                return 'background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border-radius: 50%;';
            default:
                return 'background: rgba(255,255,255,0.05); color: #6b7280;';
        }
    }

    resize(rows, cols) {
        rows = Math.max(3, Math.min(20, rows));
        cols = Math.max(3, Math.min(20, cols));

        const newGrid = [];
        for (let r = 0; r < rows; r++) {
            newGrid.push([]);
            for (let c = 0; c < cols; c++) {
                if (r < this.rows && c < this.cols) {
                    newGrid[r].push(this.grid[r][c]);
                } else {
                    newGrid[r].push(CELL.EMPTY);
                }
            }
        }

        this.rows = rows;
        this.cols = cols;
        this.grid = newGrid;
        this._render();
        this._checkSolvability();
    }

    clear() {
        this._initGrid();
        this._render();
        this._checkSolvability();
    }

    fillBorder() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) {
                    if (this.grid[r][c] === CELL.EMPTY) {
                        this.grid[r][c] = CELL.WALL;
                    }
                }
            }
        }
        this._render();
        this._checkSolvability();
    }

    _placeCell(r, c) {
        const type = this.selectedTool;

        // Ensure only one start and one goal
        if (type === CELL.START) {
            for (let rr = 0; rr < this.rows; rr++)
                for (let cc = 0; cc < this.cols; cc++)
                    if (this.grid[rr][cc] === CELL.START) this.grid[rr][cc] = CELL.EMPTY;
        }
        if (type === CELL.GOAL) {
            for (let rr = 0; rr < this.rows; rr++)
                for (let cc = 0; cc < this.cols; cc++)
                    if (this.grid[rr][cc] === CELL.GOAL) this.grid[rr][cc] = CELL.EMPTY;
        }

        // Enforce max 2 wormholes
        if (type === CELL.WORMHOLE) {
            let count = 0;
            for (let rr = 0; rr < this.rows; rr++)
                for (let cc = 0; cc < this.cols; cc++)
                    if (this.grid[rr][cc] === CELL.WORMHOLE) count++;
            if (count >= 2 && this.grid[r][c] !== CELL.WORMHOLE) {
                // Remove the first wormhole found
                outer: for (let rr = 0; rr < this.rows; rr++)
                    for (let cc = 0; cc < this.cols; cc++)
                        if (this.grid[rr][cc] === CELL.WORMHOLE) {
                            this.grid[rr][cc] = CELL.EMPTY;
                            break outer;
                        }
            }
        }

        this.grid[r][c] = type;
        this._render();
        this._checkSolvability();
    }

    _render() {
        this.gridEl.innerHTML = '';
        const sz = this.cellSize;
        const gap = this.gap;

        this.gridEl.style.display = 'grid';
        this.gridEl.style.gridTemplateColumns = `repeat(${this.cols}, ${sz}px)`;
        this.gridEl.style.gridTemplateRows = `repeat(${this.rows}, ${sz}px)`;
        this.gridEl.style.gap = `${gap}px`;
        this.gridEl.style.width = 'fit-content';
        this.gridEl.style.padding = `${gap + 2}px`;
        this.gridEl.style.position = 'relative';
        this.gridEl.style.margin = '0 auto';
        this.gridEl.style.userSelect = 'none';
        this.gridEl.style.cursor = 'crosshair';

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
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

                // Mouse interaction
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.isDrawing = true;
                    this._placeCell(r, c);
                });
                cell.addEventListener('mouseenter', () => {
                    if (this.isDrawing) this._placeCell(r, c);
                });

                this.gridEl.appendChild(cell);
            }
        }

        // Global mouseup
        document.addEventListener('mouseup', () => { this.isDrawing = false; });
    }

    _styleCellType(cell, type) {
        switch (type) {
            case CELL.WALL:
                cell.classList.add('rb-wall');
                break;
            case CELL.START: {
                cell.classList.add('rb-empty');
                const marker = document.createElement('div');
                marker.className = 'rb-start-marker';
                cell.appendChild(marker);
                break;
            }
            case CELL.GOAL: {
                cell.classList.add('rb-empty');
                const goal = document.createElement('div');
                goal.className = 'rb-goal';
                cell.appendChild(goal);
                break;
            }
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

    _checkSolvability() {
        const result = isLevelSolvable(this.grid);
        if (this.onSolvabilityChange) this.onSolvabilityChange(result);
    }

    /** Get a clean copy of the grid for export */
    getGrid() {
        return this.grid.map(row => [...row]);
    }

    /** Load a grid into the editor */
    loadGrid(grid) {
        this.rows = grid.length;
        this.cols = grid[0].length;
        this.grid = grid.map(row => [...row]);
        this._render();
        this._checkSolvability();

        // Update size inputs if they exist
        const rowInput = this.container.querySelector('#creator-rows');
        const colInput = this.container.querySelector('#creator-cols');
        if (rowInput) rowInput.value = this.rows;
        if (colInput) colInput.value = this.cols;
    }

    exportJSON() {
        return JSON.stringify(this.getGrid());
    }

    importJSON(json) {
        try {
            const grid = JSON.parse(json);
            if (Array.isArray(grid) && grid.length > 0 && Array.isArray(grid[0])) {
                this.loadGrid(grid);
                return true;
            }
        } catch (e) { }
        return false;
    }
}
