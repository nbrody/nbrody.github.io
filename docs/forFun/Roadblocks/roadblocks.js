// --- ORBOX LOGIC ---
let orboxGrid = [];
let orboxPlayer = { r: 0, c: 0 };
let orboxGoal = { r: 0, c: 0 };
let orboxActive = false;
let orboxOnWinCallback = null;
let currentOrboxClue = null;

// Multi-level state
let orboxLevels = [];
let currentOrboxLevelS = 0; // S for State to avoid conflict

// Track if we are currently animating
let isMoving = false;

// Assets
const IMG_WALL = 'orbox_wall_block_1768062748163.png';
const IMG_LADDER = 'orbox_ladder_down_1768062763769.png';
const IMG_DECLARATION = 'orbox_declaration_scroll_1768062777667.png';
const IMG_PLAYER = 'orbox_nic_cage_face_1768064030507.jpeg';
const IMG_TRI_NW = 'tri_backslash.png';
const IMG_TRI_NE = 'tri_slash.png';
const IMG_RAMP = 'jump_pad.png';
const IMG_WORMHOLE = 'wormhole.png';

/**
 * Block Types:
 * 0: Empty
 * 1: Wall
 * 2: Start
 * 3: Goal
 * 4: Triangle \ (Reflects: Up<->Left, Down<->Right)
 * 5: Triangle / (Reflects: Up<->Right, Down<->Left)
 * 6: Ramp (Jump 2 spaces)
 * 7: Wormhole (Teleports to the other #7)
 */

function initOrbox(clue, onWin) {
    if (onWin) orboxOnWinCallback = onWin;
    currentOrboxClue = clue;

    // Determine levels
    if (clue.levels && clue.levels.length > 0) {
        orboxLevels = clue.levels;
    } else {
        orboxLevels = [clue.grid];
    }

    currentOrboxLevelS = 0;
    loadOrboxLevel(currentOrboxLevelS);

    // Keyboard Support
    document.onkeydown = (e) => {
        if (!orboxActive || isMoving) return;
        switch (e.key) {
            case 'ArrowUp': e.preventDefault(); handleOrboxMove('up'); break;
            case 'ArrowDown': e.preventDefault(); handleOrboxMove('down'); break;
            case 'ArrowLeft': e.preventDefault(); handleOrboxMove('left'); break;
            case 'ArrowRight': e.preventDefault(); handleOrboxMove('right'); break;
        }
    };

    // Touch Support
    addOrboxTouchSupport();
}

function loadOrboxLevel(levelIndex) {
    currentOrboxLevelS = levelIndex; // Keep state in sync for progression
    // Deep copy grid for this level
    orboxGrid = JSON.parse(JSON.stringify(orboxLevels[levelIndex]));
    orboxActive = true;
    isMoving = false;

    // Find Start and Goal
    for (let r = 0; r < orboxGrid.length; r++) {
        for (let c = 0; c < orboxGrid[0].length; c++) {
            if (orboxGrid[r][c] === 2) {
                orboxPlayer = { r, c };
                orboxGrid[r][c] = 0;
            } else if (orboxGrid[r][c] === 3) {
                orboxGoal = { r, c };
                orboxGrid[r][c] = 0;
            }
        }
    }

    renderOrboxStructure();
}

function addOrboxTouchSupport() {
    const container = document.getElementById('orbox-container');
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    // Touch events
    container.addEventListener('touchstart', (e) => {
        startX = e.changedTouches[0].screenX;
        startY = e.changedTouches[0].screenY;
        e.preventDefault();
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].screenX;
        const endY = e.changedTouches[0].screenY;
        handleSwipe(startX, startY, endX, endY);
        e.preventDefault();
    }, { passive: false });

    // Mouse events (for desktop "swipe")
    container.addEventListener('mousedown', (e) => {
        startX = e.screenX;
        startY = e.screenY;
        isDragging = true;
    });

    window.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        const endX = e.screenX;
        const endY = e.screenY;
        handleSwipe(startX, startY, endX, endY);
        isDragging = false;
    });

    function handleSwipe(sX, sY, eX, eY) {
        if (!orboxActive || isMoving) return;

        const dx = eX - sX;
        const dy = eY - sY;

        if (Math.abs(dx) > Math.abs(dy)) {
            if (Math.abs(dx) > 30) {
                if (dx > 0) handleOrboxMove('right');
                else handleOrboxMove('left');
            }
        } else {
            if (Math.abs(dy) > 30) {
                if (dy > 0) handleOrboxMove('down');
                else handleOrboxMove('up');
            }
        }
    }
}

// Global Move Handler
window.handleOrboxMove = function (dir) {
    if (!orboxActive || isMoving) return;

    let dr = 0, dc = 0;
    if (dir === 'up') dr = -1;
    if (dir === 'down') dr = 1;
    if (dir === 'left') dc = -1;
    if (dir === 'right') dc = 1;

    const path = slideOrboxPreview(orboxPlayer.r, orboxPlayer.c, dr, dc);
    if (!path || path.length === 0) return;
    if (path.length === 1 && path[0].distance === 0 && path[0].status !== 'lost') return;

    animatePath(path);
};

function slideOrboxPreview(startR, startC, initialDr, initialDc) {
    let r = startR;
    let c = startC;
    let dr = initialDr;
    let dc = initialDc;
    let path = [];
    let visitedNodes = new Set(); // Prevent infinite loops in reflections

    while (true) {
        let nodeKey = `${r},${c},${dr},${dc}`;
        if (visitedNodes.has(nodeKey)) return path; // Loop detected
        visitedNodes.add(nodeKey);

        let nr = r + dr;
        let nc = c + dc;
        let dist = 1;

        // 1. Check Bounds -> Lost
        if (nr < 0 || nr >= orboxGrid.length || nc < 0 || nc >= orboxGrid[0].length) {
            path.push({ target: { r: nr, c: nc }, distance: 1, status: 'lost' });
            return path;
        }

        const cell = orboxGrid[nr][nc];

        // 2. Check Wall
        if (cell === 1) {
            path.push({ target: { r, c }, distance: 0, status: 'stop' });
            return path;
        }

        // 3. Check Triangle
        if (cell === 4 || cell === 5) {
            let nextDr, nextDc;
            if (cell === 4) { // \
                nextDr = dc; nextDc = dr;
            } else { // /
                nextDr = -dc; nextDc = -dr;
            }
            path.push({ target: { r: nr, c: nc }, distance: 1, status: 'reflect' });
            r = nr; c = nc; dr = nextDr; dc = nextDc;
            continue;
        }

        // 4. Check Ramp
        if (cell === 6) {
            let jr = nr + dr;
            let jc = nc + dc;
            path.push({ target: { r: jr, c: jc }, distance: 2, status: 'jump' });
            r = jr; c = jc;
            // Note: Jump lands on a cell, if that cell is goal, win.
            if (r === orboxGoal.r && c === orboxGoal.c) {
                path[path.length - 1].status = 'win';
                return path;
            }
            // Check if landed off grid
            if (r < 0 || r >= orboxGrid.length || c < 0 || c >= orboxGrid[0].length) {
                path[path.length - 1].status = 'lost';
                return path;
            }
            continue;
        }

        // 5. Check Wormhole
        if (cell === 7) {
            // Find the other wormhole
            let targetWormhole = null;
            for (let tr = 0; tr < orboxGrid.length; tr++) {
                for (let tc = 0; tc < orboxGrid[0].length; tc++) {
                    if (orboxGrid[tr][tc] === 7 && (tr !== nr || tc !== nc)) {
                        targetWormhole = { r: tr, c: tc };
                        break;
                    }
                }
                if (targetWormhole) break;
            }

            if (targetWormhole) {
                path.push({ target: { r: nr, c: nc }, distance: 1, status: 'teleport' });
                // Instantly move to target wormhole
                r = targetWormhole.r;
                c = targetWormhole.c;
                path.push({ target: { r, c }, distance: 0, status: 'teleport_end' });
                continue;
            }
        }

        // 6. Normal Step
        r = nr; c = nc;
        if (r === orboxGoal.r && c === orboxGoal.c) {
            path.push({ target: { r, c }, distance: 1, status: 'win' });
            return path;
        }

        // Peek ahead to see if we can continue or if we should condense
        // For simplicity, we'll just step one by one in the logic but the path will be condensed below
        let currentSegment = path[path.length - 1];
        if (currentSegment && currentSegment.status === 'moving' && currentSegment.dr === dr && currentSegment.dc === dc) {
            currentSegment.target = { r, c };
            currentSegment.distance++;
        } else {
            path.push({ target: { r, c }, distance: 1, status: 'moving', dr, dc });
        }
    }
}

function animatePath(path) {
    if (!path || path.length === 0) {
        isMoving = false;
        return;
    }
    isMoving = true;

    const playerEl = document.getElementById('orbox-player');
    const segment = path.shift();
    const duration = segment.status === 'teleport' ? 150 : (segment.status === 'teleport_end' ? 0 : Math.max(segment.distance * 60, 100));

    if (segment.status === 'teleport') {
        playerEl.style.transition = `transform 0.15s ease-in, opacity 0.15s`;
        playerEl.style.opacity = '0';
        playerEl.style.transform += ' scale(0.1) rotate(90deg)';
    } else if (segment.status === 'teleport_end') {
        playerEl.style.transition = 'none';
        const x = 5 + segment.target.c * 32;
        const y = 5 + segment.target.r * 32;
        playerEl.style.transform = `translate(${x}px, ${y}px)`;
        playerEl.getBoundingClientRect(); // Reflow
        playerEl.style.transition = `transform 0.15s ease-out, opacity 0.15s`;
        playerEl.style.opacity = '1';
        // We call animatePath immediately as this segment is instant
        setTimeout(() => animatePath(path), 50);
        return;
    } else {
        playerEl.style.transition = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        playerEl.style.opacity = '1';
        const x = 5 + segment.target.c * 32;
        const y = 5 + segment.target.r * 32;
        playerEl.style.transform = `translate(${x}px, ${y}px)`;
    }

    setTimeout(() => {
        orboxPlayer = { r: segment.target.r, c: segment.target.c };
        if (path.length > 0) {
            animatePath(path);
        } else {
            isMoving = false;
            handleMoveEnd(segment.status);
        }
    }, duration);
}

function renderOrboxStructure() {
    const container = document.getElementById('orbox-container');
    if (!container) return;

    container.innerHTML = '';
    const rows = orboxGrid.length;
    const cols = orboxGrid[0].length;

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
    container.style.gridTemplateRows = `repeat(${rows}, 30px)`;
    container.style.gap = '2px';
    container.style.width = 'fit-content';
    container.style.padding = '5px';
    container.style.position = 'relative';

    const isFinalLevel = (currentOrboxLevelS === orboxLevels.length - 1);
    const goalImg = isFinalLevel ? IMG_DECLARATION : IMG_LADDER;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.style.width = '30px';
            cell.style.height = '30px';
            cell.style.background = 'rgba(255, 255, 255, 0.03)';
            cell.style.borderRadius = '4px';
            cell.style.position = 'relative';

            const type = orboxGrid[r][c];
            if (type === 1) {
                cell.style.backgroundImage = `url('${IMG_WALL}')`;
                cell.style.backgroundSize = 'cover';
                cell.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
            } else if (type === 4) {
                cell.style.backgroundImage = `url('${IMG_TRI_NW}')`;
                cell.style.backgroundSize = 'cover';
            } else if (type === 5) {
                cell.style.backgroundImage = `url('${IMG_TRI_NE}')`;
                cell.style.backgroundSize = 'cover';
            } else if (type === 6) {
                cell.style.backgroundImage = `url('${IMG_RAMP}')`;
                cell.style.backgroundSize = 'cover';
            } else if (type === 7) {
                cell.style.backgroundImage = `url('${IMG_WORMHOLE}')`;
                cell.style.backgroundSize = 'cover';
                cell.style.borderRadius = '50%';
                cell.style.boxShadow = '0 0 10px purple';
                cell.style.animation = 'pulseWormhole 2s infinite alternate';
            }

            if (r === orboxGoal.r && c === orboxGoal.c) {
                const goalEl = document.createElement('div');
                goalEl.style.width = '100%';
                goalEl.style.height = '100%';
                goalEl.style.backgroundImage = `url('${goalImg}')`;
                goalEl.style.backgroundSize = 'contain';
                goalEl.style.backgroundRepeat = 'no-repeat';
                goalEl.style.backgroundPosition = 'center';
                goalEl.style.filter = isFinalLevel ? 'drop-shadow(0 0 5px gold)' : 'drop-shadow(0 0 3px #0ff)';
                cell.appendChild(goalEl);
            }
            container.appendChild(cell);
        }
    }

    const playerEl = document.createElement('div');
    playerEl.id = 'orbox-player';
    playerEl.style.position = 'absolute';
    playerEl.style.width = '30px';
    playerEl.style.height = '30px';
    playerEl.style.zIndex = '10';
    playerEl.style.backgroundImage = `url('${IMG_PLAYER}')`;
    playerEl.style.backgroundSize = 'cover';
    playerEl.style.borderRadius = '50%';
    playerEl.style.boxShadow = '0 0 5px gold';
    container.appendChild(playerEl);
    setPlayerPosition(orboxPlayer.r, orboxPlayer.c);
}

// AI SOLVER (BFS)
window.isLevelSolvable = function (grid, start, goal) {
    const rows = grid.length;
    const cols = grid[0].length;
    const queue = [{ r: start.r, c: start.c, path: [] }];
    const visited = new Set();
    visited.add(`${start.r},${start.c}`);

    const directions = ['up', 'down', 'left', 'right'];

    while (queue.length > 0) {
        const { r, c } = queue.shift();

        for (const dir of directions) {
            let dr = 0, dc = 0;
            if (dir === 'up') dr = -1;
            if (dir === 'down') dr = 1;
            if (dir === 'left') dc = -1;
            if (dir === 'right') dc = 1;

            // Use logic from slideOrboxPreview but simplified for solver
            // We need a version of slideOrboxPreview that uses a temporary grid
            const resultPath = simulateSlideForSolver(grid, r, c, dr, dc, goal);
            if (!resultPath || resultPath.length === 0) continue;

            const lastNode = resultPath[resultPath.length - 1];
            if (lastNode.status === 'win') return true;
            if (lastNode.status === 'lost') continue;

            const nextPosKey = `${lastNode.target.r},${lastNode.target.c}`;
            if (!visited.has(nextPosKey)) {
                visited.add(nextPosKey);
                queue.push({ r: lastNode.target.r, c: lastNode.target.c });
            }
        }
    }
    return false;
};

function simulateSlideForSolver(grid, startR, startC, dr, dc, goal) {
    let r = startR; let c = startC;
    let path = [];
    let visitedNodes = new Set();

    while (true) {
        let nodeKey = `${r},${c},${dr},${dc}`;
        if (visitedNodes.has(nodeKey)) return path;
        visitedNodes.add(nodeKey);

        let nr = r + dr;
        let nc = c + dc;

        if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) {
            path.push({ target: { r: nr, c: nc }, status: 'lost' });
            return path;
        }

        const cell = grid[nr][nc];
        if (cell === 1) {
            path.push({ target: { r, c }, status: 'stop' });
            return path;
        }

        if (cell === 4 || cell === 5) {
            let nextDr, nextDc;
            if (cell === 4) { nextDr = dc; nextDc = dr; }
            else { nextDr = -dc; nextDc = -dr; }
            r = nr; c = nc; dr = nextDr; dc = nextDc;
            continue;
        }

        if (cell === 6) {
            r = nr + dr; c = nc + dc;
            if (r === goal.r && c === goal.c) return [{ target: { r, c }, status: 'win' }];
            if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return [{ target: { r, c }, status: 'lost' }];
            continue;
        }

        r = nr; c = nc;
        if (r === goal.r && c === goal.c) {
            path.push({ target: { r, c }, status: 'win' });
            return path;
        }
    }
}


function renderOrboxStructure() {
    const container = document.getElementById('orbox-container');
    if (!container) return;

    // Clear and Setup
    container.innerHTML = '';

    const rows = orboxGrid.length;
    const cols = orboxGrid[0].length;

    // Simplified Abyss Container
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
    container.style.gridTemplateRows = `repeat(${rows}, 30px)`;
    container.style.gap = '2px';
    container.style.width = 'fit-content';
    container.style.padding = '5px';
    container.style.position = 'relative';
    container.style.background = 'transparent';
    container.style.border = 'none';
    container.style.backdropFilter = 'none';
    container.style.boxShadow = 'none';

    // Determine Goal Image based on level
    const isFinalLevel = (currentOrboxLevelS === orboxLevels.length - 1);
    const goalImg = isFinalLevel ? IMG_DECLARATION : IMG_LADDER;

    // Render Static Grid
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.style.width = '30px';
            cell.style.height = '30px';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.borderRadius = '4px';
            cell.style.position = 'relative';

            // Wall
            if (orboxGrid[r][c] === 1) {
                cell.style.backgroundImage = `url('${IMG_WALL}')`;
                cell.style.backgroundSize = 'cover';
                cell.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
                cell.style.zIndex = '1';
            }
            // Removed else branch for cell background

            // Goal Marker 
            if (r === orboxGoal.r && c === orboxGoal.c) {
                const goalEl = document.createElement('div');
                goalEl.style.width = '100%';
                goalEl.style.height = '100%';
                goalEl.style.backgroundImage = `url('${goalImg}')`;
                goalEl.style.backgroundSize = 'contain';
                goalEl.style.backgroundRepeat = 'no-repeat';
                goalEl.style.backgroundPosition = 'center';
                // Add glow
                goalEl.style.filter = isFinalLevel ? 'drop-shadow(0 0 5px gold)' : 'drop-shadow(0 0 3px #0ff)';
                cell.appendChild(goalEl);
            }

            container.appendChild(cell);
        }
    }

    // Render Player (Absolute)
    const playerEl = document.createElement('div');
    playerEl.id = 'orbox-player';
    // playerEl.innerText = '😎'; // Removed emoji

    // Styles
    playerEl.style.position = 'absolute';
    playerEl.style.width = '30px';
    playerEl.style.height = '30px';
    playerEl.style.display = 'flex';
    playerEl.style.alignItems = 'center';
    playerEl.style.justifyContent = 'center';
    playerEl.style.zIndex = '10';
    playerEl.style.transition = 'transform 0.05s linear';

    // Image styling
    playerEl.style.backgroundImage = `url('${IMG_PLAYER}')`;
    playerEl.style.backgroundSize = 'cover';
    playerEl.style.borderRadius = '50%'; // Circular token
    playerEl.style.boxShadow = '0 0 5px gold';

    container.appendChild(playerEl);

    // Initial Position
    setPlayerPosition(orboxPlayer.r, orboxPlayer.c);
}

function setPlayerPosition(r, c) {
    const playerEl = document.getElementById('orbox-player');
    if (!playerEl) return;

    // Calculate pixels based on grid: gap is 2px, padding is 5px, cell 30px
    // x = 5 + c * (30 + 2)
    // y = 5 + r * (30 + 2)
    const x = 5 + c * 32;
    const y = 5 + r * 32;

    playerEl.style.transform = `translate(${x}px, ${y}px)`;
}

function animatePlayerMove(result, dr, dc) {
    const playerEl = document.getElementById('orbox-player');
    if (!playerEl) return;

    isMoving = true;

    const durationPerStep = 60; // ms
    const totalTime = Math.max(result.distance * durationPerStep, 100);

    playerEl.style.transition = `transform ${totalTime}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;

    // Calculate final pixel pos
    // Note: if status is 'lost', we slide OFF the grid
    let targetR = result.target.r;
    let targetC = result.target.c;

    const x = 5 + targetC * 32;
    const y = 5 + targetR * 32;

    // Trigger Reflow?
    playerEl.getBoundingClientRect();

    playerEl.style.transform = `translate(${x}px, ${y}px)`;

    // Wait for end
    setTimeout(() => {
        isMoving = false;
        orboxPlayer = { r: result.target.r, c: result.target.c }; // Update logical pos

        handleMoveEnd(result.status);
    }, totalTime);
}

function handleMoveEnd(status) {
    const feedback = document.getElementById('feedback');

    if (status === 'lost') {
        if (feedback) feedback.textContent = "LOST IN THE VOID!";
        orboxActive = false;

        // Visual Feedback
        const flash = document.getElementById('flash-screen');
        if (flash) {
            flash.classList.add('flash-active');
            setTimeout(() => flash.classList.remove('flash-active'), 600);
        }

        const gameSection = document.getElementById('game-section');
        if (gameSection) {
            gameSection.classList.add('shake');
            setTimeout(() => gameSection.classList.remove('shake'), 500);
        }

        // Spin out animation
        const playerEl = document.getElementById('orbox-player');
        if (playerEl) {
            playerEl.style.transition = 'transform 0.5s ease-in, opacity 0.5s';
            playerEl.style.opacity = '0';
            playerEl.style.transform += ' scale(0) rotate(180deg)';
        }

        setTimeout(() => {
            loadOrboxLevel(currentOrboxLevelS); // Restart current level
            if (feedback) feedback.textContent = "";
        }, 800);

    } else if (status === 'win') {
        // Check if more levels
        if (currentOrboxLevelS < orboxLevels.length - 1) {
            if (feedback) feedback.textContent = "LEVEL COMPLETE! DESCENDING...";
            orboxActive = false;

            // Animation for descending?
            const playerEl = document.getElementById('orbox-player');
            if (playerEl) {
                playerEl.style.transition = 'transform 0.5s ease-in, opacity 0.5s';
                playerEl.style.transform += ' scale(0.5)';
                playerEl.style.opacity = '0';
            }

            setTimeout(() => {
                currentOrboxLevelS++;
                loadOrboxLevel(currentOrboxLevelS);
                if (feedback) feedback.textContent = "";
            }, 1000);

        } else {
            // Final Win
            if (feedback) feedback.textContent = "DECLARATION STOLEN!";
            orboxActive = false;
            const playerEl = document.getElementById('orbox-player');
            if (playerEl) playerEl.innerText = '📜';

            setTimeout(() => {
                if (orboxOnWinCallback) orboxOnWinCallback();
            }, 1500);
        }
    }
}
