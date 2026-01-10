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

function initOrbox(clue, onWin) {
    if (onWin) orboxOnWinCallback = onWin;
    currentOrboxClue = clue;

    // Determine levels
    if (clue.levels && clue.levels.length > 0) {
        orboxLevels = clue.levels; // Deep copy later per level
    } else {
        orboxLevels = [clue.grid];
    }

    currentOrboxLevelS = 0;
    loadOrboxLevel(currentOrboxLevelS);

    // Keyboard Support
    document.onkeydown = (e) => {
        if (!orboxActive || isMoving) return;
        switch (e.key) {
            case 'ArrowUp': handleOrboxMove('up'); break;
            case 'ArrowDown': handleOrboxMove('down'); break;
            case 'ArrowLeft': handleOrboxMove('left'); break;
            case 'ArrowRight': handleOrboxMove('right'); break;
        }
    };

    // Add Touch Support
    addOrboxTouchSupport();
}

function loadOrboxLevel(levelIndex) {
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

    let touchStartX = 0;
    let touchStartY = 0;

    container.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        e.preventDefault(); // Prevent scroll
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        if (!orboxActive || isMoving) return;

        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;

        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal
            if (Math.abs(dx) > 30) { // Threshold
                if (dx > 0) handleOrboxMove('right');
                else handleOrboxMove('left');
            }
        } else {
            // Vertical
            if (Math.abs(dy) > 30) {
                if (dy > 0) handleOrboxMove('down');
                else handleOrboxMove('up');
            }
        }
        e.preventDefault();
    }, { passive: false });
}

// Global Move Handler
window.handleOrboxMove = function (dir) {
    if (!orboxActive || isMoving) return;

    let dr = 0, dc = 0;
    if (dir === 'up') dr = -1;
    if (dir === 'down') dr = 1;
    if (dir === 'left') dc = -1;
    if (dir === 'right') dc = 1;

    const result = slideOrboxPreview(orboxPlayer.r, orboxPlayer.c, dr, dc);
    // Result contains: 
    // target: {r, c}
    // distance: number of steps
    // status: 'stop', 'win', 'lost'

    if (result.distance === 0 && result.status !== 'lost') return; // Didn't move

    animatePlayerMove(result, dr, dc);
};

function slideOrboxPreview(startR, startC, dr, dc) {
    let r = startR;
    let c = startC;
    let dist = 0;

    while (true) {
        let nr = r + dr;
        let nc = c + dc;

        // 1. Check Bounds -> Lost
        if (nr < 0 || nr >= orboxGrid.length || nc < 0 || nc >= orboxGrid[0].length) {
            // We return the coordinate "off grid" so we can act on it
            return { target: { r: nr, c: nc }, distance: dist + 1, status: 'lost' };
        }

        // 2. Check Wall -> Stop at (r,c)
        if (orboxGrid[nr][nc] === 1) {
            // Stopped. Check if this spot is goal.
            if (r === orboxGoal.r && c === orboxGoal.c) {
                return { target: { r, c }, distance: dist, status: 'win' };
            }
            return { target: { r, c }, distance: dist, status: 'stop' };
        }

        // 3. Move
        r = nr;
        c = nc;
        dist++;

        // Sticky Goal
        if (r === orboxGoal.r && c === orboxGoal.c) {
            return { target: { r, c }, distance: dist, status: 'win' };
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

    // Container Styling
    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${cols}, 30px)`;
    container.style.gridTemplateRows = `repeat(${rows}, 30px)`;
    container.style.gap = '2px';
    container.style.width = 'fit-content';
    container.style.padding = '5px';
    // Glassmorphic board
    container.style.border = '2px solid rgba(212, 175, 55, 0.5)';
    container.style.background = 'rgba(0, 0, 0, 0.4)';
    container.style.backdropFilter = 'blur(5px)';
    container.style.borderRadius = '10px';
    container.style.position = 'relative'; // For absolute player

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
            } else {
                cell.style.background = 'rgba(255, 255, 255, 0.05)';
            }

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

        // Spin out animation
        const playerEl = document.getElementById('orbox-player');
        if (playerEl) {
            playerEl.style.transition = 'transform 0.5s ease-in, opacity 0.5s';
            // Continue moving in same direction or scale down?
            playerEl.style.opacity = '0';
            playerEl.style.transform += ' scale(0)';
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
