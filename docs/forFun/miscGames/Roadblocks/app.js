/**
 * Roadblocks — Application Orchestrator
 * 
 * Wires together the game engine, level pack, level creator,
 * and solver UI into a unified tabbed interface.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ══════════════════════════════════════════
    // Tab Navigation
    // ══════════════════════════════════════════
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tab-${target}`);
            });
        });
    });

    // ══════════════════════════════════════════
    // TAB 1: Play
    // ══════════════════════════════════════════
    const gameBoard = document.getElementById('game-board');
    const feedback = document.getElementById('feedback');
    const levelTitle = document.getElementById('level-title');
    const tierBadge = document.getElementById('tier-badge');
    const moveCounter = document.getElementById('move-counter');
    const levelSelect = document.getElementById('level-select');

    const game = new RoadblocksGame(gameBoard, {
        cellSize: 40,
        gap: 2,
        onWin: (moves) => {
            feedback.textContent = `ALL LEVELS COMPLETE! Total moves: ${moves}`;
            document.getElementById('game-section').classList.add('hidden');
            document.getElementById('victory-screen').classList.remove('hidden');
        },
        onLevelComplete: (levelIdx, moves) => {
            feedback.textContent = `LEVEL COMPLETE! (${moves} moves)`;
            setTimeout(() => {
                feedback.textContent = '';
                updateLevelUI(levelIdx + 1);
            }, 800);
        },
        onLost: (levelIdx) => {
            feedback.textContent = 'LOST IN THE VOID!';
            setTimeout(() => { feedback.textContent = ''; }, 1200);
        },
        onMove: (dir, count) => {
            moveCounter.textContent = `Moves: ${count}`;
        }
    });

    // Populate level select
    LEVEL_PACK.forEach((_, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i + 1}. ${getLevelName(i)}`;
        levelSelect.appendChild(opt);
    });

    levelSelect.addEventListener('change', () => {
        const idx = parseInt(levelSelect.value);
        game.goToLevel(idx);
        updateLevelUI(idx);
    });

    function updateLevelUI(idx) {
        levelTitle.textContent = `${idx + 1}. ${getLevelName(idx)}`;
        tierBadge.textContent = getTierName(idx);
        levelSelect.value = idx;
        moveCounter.textContent = 'Moves: 0';
    }

    game.loadLevels(LEVEL_PACK);
    updateLevelUI(0);

    // ══════════════════════════════════════════
    // TAB 2: Create
    // ══════════════════════════════════════════
    const creatorGrid = document.getElementById('creator-grid');
    const creatorToolbar = document.getElementById('creator-toolbar');
    const creatorStatus = document.getElementById('creator-status');

    const creator = new LevelCreator(creatorToolbar, creatorGrid, {
        rows: 6,
        cols: 8,
        cellSize: 40,
        gap: 2,
        onSolvabilityChange: (solvable) => {
            if (solvable) {
                creatorStatus.className = 'status-indicator status-solvable';
                creatorStatus.innerHTML = '<span class="status-dot"></span> Solvable ✓';
            } else {
                creatorStatus.className = 'status-indicator status-unsolvable';
                creatorStatus.innerHTML = '<span class="status-dot"></span> Unsolvable';
            }
        }
    });

    // Grid Size
    document.getElementById('creator-rows').addEventListener('change', (e) => {
        creator.resize(parseInt(e.target.value), creator.cols);
    });
    document.getElementById('creator-cols').addEventListener('change', (e) => {
        creator.resize(creator.rows, parseInt(e.target.value));
    });

    // Actions
    document.getElementById('btn-fill-border').addEventListener('click', () => creator.fillBorder());
    document.getElementById('btn-clear').addEventListener('click', () => creator.clear());
    document.getElementById('btn-generate').addEventListener('click', () => creator.generate());

    // Export
    document.getElementById('btn-export').addEventListener('click', () => {
        const json = creator.exportJSON();
        document.getElementById('export-output').value = json;
        document.getElementById('export-modal').classList.remove('hidden');
    });

    document.getElementById('btn-copy-export').addEventListener('click', () => {
        const textarea = document.getElementById('export-output');
        textarea.select();
        navigator.clipboard.writeText(textarea.value);
        document.getElementById('btn-copy-export').textContent = '✓ Copied!';
        setTimeout(() => {
            document.getElementById('btn-copy-export').textContent = '📋 Copy';
        }, 1500);
    });

    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('export-modal').classList.add('hidden');
    });

    // Import
    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('import-input').value = '';
        document.getElementById('import-modal').classList.remove('hidden');
    });

    document.getElementById('btn-do-import').addEventListener('click', () => {
        const json = document.getElementById('import-input').value;
        if (creator.importJSON(json)) {
            document.getElementById('import-modal').classList.add('hidden');
        } else {
            alert('Invalid level JSON. Expected a 2D array like [[1,1,1],[1,2,3],[1,1,1]]');
        }
    });

    document.getElementById('btn-close-import').addEventListener('click', () => {
        document.getElementById('import-modal').classList.add('hidden');
    });

    // Close modals on backdrop click
    document.getElementById('export-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('export-modal'))
            document.getElementById('export-modal').classList.add('hidden');
    });
    document.getElementById('import-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('import-modal'))
            document.getElementById('import-modal').classList.add('hidden');
    });

    // Test Play
    let testGame = null;
    document.getElementById('btn-test-play').addEventListener('click', () => {
        const grid = creator.getGrid();
        const testOverlay = document.getElementById('test-play-overlay');
        const testBoard = document.getElementById('test-board');
        const testFeedback = document.getElementById('test-feedback');

        testOverlay.classList.remove('hidden');
        testFeedback.textContent = '';

        testGame = new RoadblocksGame(testBoard, {
            cellSize: 40,
            gap: 2,
            onWin: () => {
                testFeedback.textContent = 'LEVEL COMPLETE! ✓';
                testFeedback.style.color = 'var(--accent-success)';
            },
            onLost: () => {
                testFeedback.textContent = 'LOST IN THE VOID!';
                testFeedback.style.color = 'var(--accent-danger)';
                setTimeout(() => { testFeedback.textContent = ''; }, 1200);
            },
            onMove: () => { }
        });

        testGame.loadLevels([grid]);
    });

    document.getElementById('btn-stop-test').addEventListener('click', () => {
        document.getElementById('test-play-overlay').classList.add('hidden');
        if (testGame) {
            testGame.active = false;
            testGame = null;
        }
    });

    // Solve from Creator
    document.getElementById('btn-solve-creator').addEventListener('click', () => {
        const grid = creator.getGrid();
        const solution = solveBFS(grid);
        if (solution) {
            // Switch to solve tab and load
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelector('[data-tab="solve"]').classList.add('active');
            tabContents.forEach(c => c.classList.add('hidden'));
            document.getElementById('tab-solve').classList.remove('hidden');
            solver.loadLevel(grid);
            document.getElementById('solver-level-title').textContent = 'Custom Level';
        } else {
            alert('This level is unsolvable. Adjust the layout and try again.');
        }
    });

    // ══════════════════════════════════════════
    // TAB 3: Solve
    // ══════════════════════════════════════════
    const solverBoard = document.getElementById('solver-board');
    const solverLevelSelect = document.getElementById('solver-level-select');
    const solverLevelTitle = document.getElementById('solver-level-title');

    const solver = new LevelSolver(
        document.getElementById('tab-solve').querySelector('.glass-panel'),
        solverBoard,
        { cellSize: 40, gap: 2 }
    );

    // Populate solver level select
    LEVEL_PACK.forEach((_, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${i + 1}. ${getLevelName(i)}`;
        solverLevelSelect.appendChild(opt);
    });

    solverLevelSelect.addEventListener('change', () => {
        const idx = parseInt(solverLevelSelect.value);
        solver.loadLevelByIndex(idx);
        solverLevelTitle.textContent = `${idx + 1}. ${getLevelName(idx)}`;
    });

    // Load first level
    solver.loadLevelByIndex(0);

    // Solver controls
    document.getElementById('btn-solver-play').addEventListener('click', () => {
        if (solver.isPlaying) {
            solver.stop();
            document.getElementById('btn-solver-play').textContent = '▶ Play';
        } else {
            solver.play();
            document.getElementById('btn-solver-play').textContent = '⏸ Pause';
        }
    });

    document.getElementById('btn-solver-step').addEventListener('click', () => {
        solver.stop();
        document.getElementById('btn-solver-play').textContent = '▶ Play';
        solver.step();
    });

    document.getElementById('btn-solver-reset').addEventListener('click', () => {
        solver.reset();
        document.getElementById('btn-solver-play').textContent = '▶ Play';
    });

    document.getElementById('solver-speed').addEventListener('input', (e) => {
        // Invert: slider left = fast, right = slow feels wrong; fix it
        solver.setSpeed(parseInt(e.target.value));
    });

    // Custom level solve
    document.getElementById('btn-solve-custom').addEventListener('click', () => {
        const input = document.getElementById('custom-level-input').value.trim();
        if (!input) return;
        let grid = null;
        if (input[0] === '[') {
            try {
                const parsed = JSON.parse(input);
                if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) grid = parsed;
            } catch (e) { /* fall through */ }
        } else {
            grid = parseLevel(input.split('\n'));
        }
        if (grid) {
            solver.loadLevel(grid);
            solverLevelTitle.textContent = 'Custom Level';
        } else {
            alert('Invalid level. Paste ASCII art (one row per line) or a JSON 2D array.');
        }
    });
});
