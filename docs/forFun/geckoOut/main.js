import { Board, Gecko } from './game.js';
import { Renderer } from './renderer.js';
import { Vision } from './vision.js';
import { Solver } from './solver.js';
import { MCTSSolver } from './MCTSSolver.js';
import { SubgoalSolver } from './SubgoalSolver.js';
import { getLevel1389 } from './level1389.js';

class App {
    constructor() {
        this.board = new Board(10, 9);
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas, this.board);
        this.solverSolution = null;
        this.currentMoveIndex = 0;
        this.solverPaused = false;  // Pause state for AI solver
        this.solverRunning = false; // Is solver currently running?

        this.initEventListeners();
        this.renderer.resize();
        this.renderer.draw();

        // Automatically load Level 1389 on startup
        this.handleLevelSelect('1389');
        document.getElementById('levelDropdown').value = '1389';
    }

    initEventListeners() {
        const imageInput = document.getElementById('imageInput');
        const uploadZone = document.getElementById('uploadZone');
        const solveBtn = document.getElementById('solveBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const resetBtn = document.getElementById('resetBtn');
        const stepForward = document.getElementById('stepForward');
        const stepBack = document.getElementById('stepBack');
        const levelDropdown = document.getElementById('levelDropdown');

        levelDropdown.onchange = (e) => this.handleLevelSelect(e.target.value);
        uploadZone.onclick = () => imageInput.click();
        imageInput.onchange = (e) => this.handleImageUpload(e);

        solveBtn.onclick = () => this.solve();
        pauseBtn.onclick = () => this.togglePause();
        resetBtn.onclick = () => this.reset();

        stepForward.onclick = () => this.nextMove();
        stepBack.onclick = () => this.prevMove();

        // Interactive Play
        this.selectedGecko = null;
        this.selectedEnd = null;

        this.canvas.onmousedown = (e) => this.handleMouseDown(e);
        window.onmousemove = (e) => this.handleMouseMove(e);
        window.onmouseup = () => { this.selectedGecko = null; this.selectedEnd = null; };

        // Keyboard controls for playing
        window.onkeydown = (e) => this.handleKeyDown(e);

        // Drag and drop
        uploadZone.ondragover = (e) => { e.preventDefault(); uploadZone.style.borderColor = '#4ade80'; };
        uploadZone.ondragleave = () => { uploadZone.style.borderColor = 'rgba(255,255,255,0.1)'; };
        uploadZone.ondrop = (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) this.processFile(file);
        };
    }

    getGridPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const pad = this.renderer.labelPadding || 0;
        const x = e.clientX - rect.left - pad;
        const y = e.clientY - rect.top - pad;
        return {
            r: Math.floor(y / this.renderer.cellSize),
            c: Math.floor(x / this.renderer.cellSize)
        };
    }

    handleKeyDown(e) {
        if (!this.selectedGecko) return;

        const dirMap = {
            'ArrowUp': { r: -1, c: 0 },
            'ArrowDown': { r: 1, c: 0 },
            'ArrowLeft': { r: 0, c: -1 },
            'ArrowRight': { r: 0, c: 1 }
        };

        const dir = dirMap[e.key];
        if (!dir) return;

        e.preventDefault();

        const end = this.selectedEnd || 'head';
        const currentPos = end === 'head' ? this.selectedGecko.head : this.selectedGecko.tail;
        const targetPos = { r: currentPos.r + dir.r, c: currentPos.c + dir.c };

        if (this.board.moveGecko(this.selectedGecko.id, targetPos, end)) {
            this.renderer.draw(this.selectedGecko.id);
            document.getElementById('moveCount').textContent = parseInt(document.getElementById('moveCount').textContent) + 1;

            if (this.board.isSolved()) {
                this.updateStatus("🌟 Level Solved! You're a gecko master.");
                this.selectedGecko = null;
            }
        }
    }

    handleMouseDown(e) {
        const pos = this.getGridPos(e);
        this.draggingFromHole = false; // Reset
        this.holePosition = null;

        // Find if we clicked a head or tail
        for (const gecko of this.board.geckos) {
            if (gecko.head.r === pos.r && gecko.head.c === pos.c) {
                this.selectedGecko = gecko;
                this.selectedEnd = 'head';
                this.renderer.draw(gecko.id);
                this.updateStatus(`Selected ${gecko.color} gecko (head). Use arrow keys or drag to move.`);
                return;
            }
            if (gecko.tail.r === pos.r && gecko.tail.c === pos.c) {
                this.selectedGecko = gecko;
                this.selectedEnd = 'tail';
                this.renderer.draw(gecko.id);
                this.updateStatus(`Selected ${gecko.color} gecko (tail). Use arrow keys or drag to move.`);
                return;
            }
        }

        // Check if we clicked on an attached hole (rope hole)
        // If so, select the gecko that's attached to it - hole leads when dragging
        for (const gecko of this.board.geckos) {
            if (gecko.attachedHole) {
                const attachedHoleObj = this.board.holes.find(h => h.color === gecko.attachedHole.color && !h.isPermanent);
                if (attachedHoleObj && attachedHoleObj.r === pos.r && attachedHoleObj.c === pos.c) {
                    this.selectedGecko = gecko;
                    this.selectedEnd = 'tail'; // Pulling from hole affects tail direction
                    this.draggingFromHole = true; // Special mode: hole leads
                    this.holePosition = { r: attachedHoleObj.r, c: attachedHoleObj.c };
                    this.renderer.draw(gecko.id);
                    this.updateStatus(`Pulling ${gecko.color} gecko by rope. Drag hole to pull.`);
                    return;
                }
            }
        }

        // Clicked empty space - deselect
        this.selectedGecko = null;
        this.selectedEnd = null;
        this.renderer.draw();
    }

    handleMouseMove(e) {
        if (!this.selectedGecko) return;

        // Check if gecko still exists (might have been completed)
        if (!this.board.geckos.find(g => g.id === this.selectedGecko.id)) {
            this.selectedGecko = null;
            this.selectedEnd = null;
            this.draggingFromHole = false;
            return;
        }

        const pos = this.getGridPos(e);
        const end = this.selectedEnd || 'head';

        // Determine reference position for drag calculation
        // When dragging from hole, use hole position as reference
        // Otherwise use gecko head/tail
        let referencePos;
        if (this.draggingFromHole && this.holePosition) {
            // Update hole position in case it moved
            const attachedHoleObj = this.board.holes.find(h =>
                h.color === this.selectedGecko.attachedHole.color && !h.isPermanent
            );
            if (attachedHoleObj) {
                this.holePosition = { r: attachedHoleObj.r, c: attachedHoleObj.c };
            }
            referencePos = this.holePosition;
        } else {
            referencePos = end === 'head' ? this.selectedGecko.head : this.selectedGecko.tail;
        }

        // If already at target position, nothing to do
        if (pos.r === referencePos.r && pos.c === referencePos.c) return;

        // Calculate direction based on where mouse is relative to reference position
        const dr = pos.r - referencePos.r;
        const dc = pos.c - referencePos.c;

        // Determine intended direction (prioritize larger delta for corner-cutting)
        let moveDir;
        if (Math.abs(dr) >= Math.abs(dc)) {
            moveDir = { r: Math.sign(dr), c: 0 };
        } else {
            moveDir = { r: 0, c: Math.sign(dc) };
        }

        // The gecko moves its tail in the drag direction
        const geckoEnd = this.draggingFromHole ? 'tail' : end;
        const geckoCurrentPos = geckoEnd === 'head' ? this.selectedGecko.head : this.selectedGecko.tail;
        const targetPos = { r: geckoCurrentPos.r + moveDir.r, c: geckoCurrentPos.c + moveDir.c };

        // Try to make the move in the intended direction
        if (this.board.isValidMove(this.selectedGecko.id, targetPos, geckoEnd)) {
            this.board.moveGecko(this.selectedGecko.id, targetPos, geckoEnd);
            this.renderer.draw(this.selectedGecko.id);
            document.getElementById('moveCount').textContent = parseInt(document.getElementById('moveCount').textContent) + 1;

            if (this.board.isSolved()) {
                this.updateStatus("🌟 Level Solved! You're a gecko master.");
                this.selectedGecko = null;
                this.selectedEnd = null;
                this.draggingFromHole = false;
            }
        }
    }

    async handleLevelSelect(level) {
        if (level === '1389') {
            this.board = getLevel1389();
            this.updateStatus("Level 1389 loaded! Ready to solve.");
            this.renderer.board = this.board;
            this.renderer.resize();
            this.renderer.draw();
            document.getElementById('solveBtn').disabled = false;
            document.getElementById('geckoCount').textContent = this.board.geckos.length;
        } else if (level === 'demo') {
            this.createDemoLevel();
        }
    }

    async loadLocalImage(filename) {
        try {
            this.updateStatus(`Loading ${filename}...`);
            const response = await fetch(filename);
            const blob = await response.blob();
            const file = new File([blob], filename, { type: 'image/png' });
            await this.processFile(file);
        } catch (e) {
            this.updateStatus(`Error loading ${filename}: ${e.message}`);
        }
    }

    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (file) await this.processFile(file);
    }

    async processFile(file) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise(r => img.onload = r);

        this.updateStatus("Processing screenshot...");
        const result = await Vision.process(img);

        // Re-initialize board with exact 10x14 grid
        this.board = new Board(result.rows, result.cols);

        // Add geckos from vision
        result.geckos.forEach(data => {
            const properties = { ...data.properties };
            if (properties.innerGecko) {
                properties.innerGecko = new Gecko(data.id + 1000, properties.innerGecko.color, []);
            }
            const gecko = new Gecko(data.id, data.color, data.body, properties);
            this.board.geckos.push(gecko);

            // If it has an attached hole, we need a hole at the tail
            if (properties.attachedHole) {
                // Heuristic: matching color or specific color
                this.board.addHole(gecko.tail.r, gecko.tail.c, 'yellow', false);
            }
        });

        // Add detected holes
        if (result.standaloneHoles) {
            result.standaloneHoles.forEach((h, i) => {
                // Determine the hole color based on nearest gecko head if unknown
                // For now, heuristic or random valid color
                this.board.addHole(h.r, h.c, 'blue', true);
            });
        }

        this.updateStatus(`${result.geckos.length} geckos detected! Solving Level 1389...`);

        this.renderer.board = this.board;
        this.renderer.resize();
        this.renderer.draw();

        this.solve();
    }

    createDemoLevel() {
        this.board = new Board(9, 9);

        // 1. Nested Gecko: Pink outside, Blue inside
        const blueGecko = new Gecko(101, 'blue', [], {});
        const pinkGecko = new Gecko(1, 'pink', [{ r: 2, c: 2 }, { r: 3, c: 2 }, { r: 4, c: 2 }], {
            innerGecko: blueGecko
        });
        this.board.addHole(1, 2, 'pink', true); // Permanent pink hole
        this.board.addHole(6, 2, 'blue', true); // Permanent blue hole
        this.board.geckos.push(pinkGecko);

        // 2. Rope Gecko: Green gecko dragging a Yellow hole
        const greenGecko = new Gecko(2, 'green', [{ r: 2, c: 6 }, { r: 3, c: 6 }, { r: 4, c: 6 }], {
            attachedHole: { color: 'yellow' }
        });
        this.board.geckos.push(greenGecko);

        // Add the yellow hole at the green gecko's tail
        this.board.addHole(4, 6, 'yellow', false); // Non-permanent hole tied to green

        // 3. A separate Yellow gecko that needs to reach that moving hole
        const yellowGecko = new Gecko(3, 'yellow', [{ r: 6, c: 6 }, { r: 7, c: 6 }], {});
        this.board.geckos.push(yellowGecko);

        // Add some walls to make it a puzzle
        for (let i = 0; i < 9; i++) {
            this.board.setCell(0, i, 'wall');
            this.board.setCell(8, i, 'wall');
            this.board.setCell(i, 0, 'wall');
            this.board.setCell(i, 8, 'wall');
        }

        this.renderer.board = this.board;
        this.renderer.resize();
        this.renderer.draw();
        document.getElementById('solveBtn').disabled = false;
        document.getElementById('geckoCount').textContent = this.board.geckos.length;
    }

    async solve() {
        // If paused, resume from current board instead
        if (this.solverPaused) {
            this.solverPaused = false;
            document.getElementById('pauseBtn').textContent = 'Pause';
        }

        this.updateStatus("AI is thinking...");
        document.getElementById('scoreValue').textContent = '-';
        document.getElementById('iterValue').textContent = '-';
        document.getElementById('solveBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;

        this.solverRunning = true;

        const solverType = document.getElementById('solverDropdown').value;
        let solver;

        if (solverType === 'subgoal') {
            solver = new SubgoalSolver(this.board.clone(), { maxStepsPerGoal: 1000, maxTotalMoves: 5000 });
            this.updateStatus("Subgoal Solver: targeting one gecko at a time...");
        } else if (solverType === 'mcts') {
            solver = new MCTSSolver(this.board.clone(), { maxIterations: 5000, maxRolloutDepth: 50 });
            this.updateStatus("MCTS is exploring...");
        } else {
            solver = new Solver(this.board.clone(), { beamWidth: 1000, maxIterations: 2000, randomness: 0.4 });
            this.updateStatus("Beam Search is exploring...");
        }

        const startTime = performance.now();

        // Progress callback to update UI and render best board
        const onProgress = async (progress) => {
            // Check for pause
            if (this.solverPaused) {
                return 'paused';
            }

            document.getElementById('scoreValue').textContent = progress.score.toFixed(1);
            document.getElementById('iterValue').textContent = progress.iteration;
            document.getElementById('geckoCount').textContent = progress.geckos;
            document.getElementById('moveCount').textContent = progress.bestMoves ? progress.bestMoves.length : 0;

            // Show target gecko color for subgoal solver
            const targetInfo = progress.targetColor ? ` → ${progress.targetColor}` : '';
            this.updateStatus(`${solverType.toUpperCase()} Iter ${progress.iteration}${targetInfo}: moves=${progress.bestMoves ? progress.bestMoves.length : 0}`);

            // Render the current best board state - geckos move live!
            if (progress.bestBoard) {
                this.renderer.board = progress.bestBoard;
                this.renderer.draw();
            }
        };

        const solution = await solver.solveAsync(onProgress);
        const endTime = performance.now();

        this.solverRunning = false;
        document.getElementById('solveBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;

        if (this.solverPaused) {
            this.updateStatus("⏸️ Paused - play moves, then click Solve to continue");
            return;
        }

        if (solution) {
            this.solverSolution = solution;
            this.currentMoveIndex = 0;
            this.updateStatus(`✅ Solved in ${solution.length} moves (${(endTime - startTime).toFixed(0)}ms)`);
            document.getElementById('moveCount').textContent = solution.length;

            // Reset to start and animate the actual solution
            this.board = getLevel1389(); // Reset board
            this.renderer.board = this.board;
            this.animateSolution();
        } else {
            this.updateStatus("❌ No solution found!");
            // Restore original board
            this.renderer.board = this.board;
            this.renderer.draw();
        }
    }

    togglePause() {
        if (!this.solverRunning) return;

        this.solverPaused = true;
        document.getElementById('pauseBtn').textContent = 'Resume';
        document.getElementById('solveBtn').disabled = false;
        this.updateStatus('⏸️ Pausing... play your moves, then click Solve');
    }

    animateSolution() {
        if (!this.solverSolution || this.currentMoveIndex >= this.solverSolution.length) return;

        const move = this.solverSolution[this.currentMoveIndex];
        this.board.moveGecko(move.geckoId, move.pos, move.end);
        this.currentMoveIndex++;
        this.renderer.draw();

        setTimeout(() => this.animateSolution(), 200);
    }

    nextMove() {
        if (!this.solverSolution || this.currentMoveIndex >= this.solverSolution.length) return;
        const move = this.solverSolution[this.currentMoveIndex];
        this.board.moveGecko(move.geckoId, move.pos, move.end);
        this.currentMoveIndex++;
        this.renderer.draw();
    }

    reset() {
        this.createDemoLevel();
        this.solverSolution = null;
        this.currentMoveIndex = 0;
        document.getElementById('moveCount').textContent = 0;
        this.updateStatus("Ready for input...");
    }

    updateStatus(text) {
        document.getElementById('solverStatus').textContent = text;
    }
}

window.onload = () => new App();
