document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const introCard = document.querySelector('.intro-card');
    const clueContainer = document.getElementById('clue-container');

    const clues = [
        {
            id: 1,
            title: "Clue #1: The Declaration",
            text: "I am not just a map, I am a declaration. To proceed, you must unlock the year of our independence.",
            type: "riddle",
            answer: "1776",
            hint: "National Treasure, Ben Gates."
        },
        {
            id: 2,
            title: "Puzzle #2: The Cage Search",
            text: "Find the hidden truths within the grid. Words can be scattered in any direction.",
            type: "wordsearch",
            grid: [
                "OGFACEOFFU",
                "NSQEDILCRT",
                "AACDVZOOBR",
                "TBBAAWNNQE",
                "IGEORVGAAA",
                "OTEYIFLIVS",
                "NESVZIERLU",
                "AVTCOTGVMR",
                "LVEPNVSGEE",
                "SVHCAKHXYR"
            ],
            words: ["ARIZONA", "BEES", "CONAIR", "FACEOFF", "LONGLEGS", "NATIONAL", "OSCARFEVER", "TREASURE"],
            displayWords: ["ARIZONA", "BEES", "CON AIR", "FACE OFF", "LONGLEGS", "NATIONAL", "OSCAR FEVER", "TREASURE"],
            hint: "Drag to select. Words can be backwards!"
        },
        {
            id: 3,
            title: "Clue #3: The Neon Despair",
            text: "To the city of sin I drove, to shed my mortal coil. A love found in the bottle's bottom, a tragic, Oscar-winning end.",
            type: "riddle",
            answer: "italy",
            hint: "1995. Ben Sanderson. (But the answer is a place)"
        },
        {
            id: 4,
            title: "Puzzle #4",
            text: "Face back on, please",
            type: "puzzle",
            image: "face_off_poster.png",
            answer: "face/off", // Not directly used for text input, but good for reference
            hint: "Click two pieces to swap them. Reconstruct the poster."
        },
        {
            id: 5,
            title: "Puzzle #5: The Agent",
            text: "Decipher the location code:<br><br><span style='font-family: monospace; font-size: 1.5em; letter-spacing: 5px; color: #d4af37;'>XPPEIPVTF</span><br><br>Decode this to find the agent's name. Enter the name to confirm you've identified the target.",
            type: "riddle",
            answer: "woodhouse",
            hint: "The code is a name shifted by one. Decode 'XPPEIPVTF'."
        },
        {
            id: 6,
            title: "Puzzle #6: The Cage Slide",
            text: "Slide to the target. But beware, once you start moving, you can't stop until you hit a wall!",
            type: "orbox",
            // 3 Levels:
            // 0: Empty, 1: Wall, 2: Start, 3: Target (Ladder or Scroll)
            levels: [
                // Level 1: The Descent (Simple)
                [
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
                    [1, 0, 1, 0, 2, 0, 0, 0, 0, 1],
                    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
                    [1, 0, 1, 1, 0, 0, 0, 0, 0, 1],
                    [1, 0, 0, 0, 0, 1, 0, 1, 0, 1],
                    [1, 0, 0, 3, 0, 0, 0, 0, 0, 1], // Goal accessible
                    [1, 0, 1, 0, 0, 0, 1, 0, 0, 1],
                    [1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
                ],
                // Level 2: The Catacombs (Medium)
                [
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                    [1, 3, 0, 0, 1, 0, 0, 0, 2, 1], // Goal top left, start top right
                    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                    [1, 0, 1, 0, 1, 0, 1, 0, 0, 1],
                    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                    [1, 1, 0, 1, 0, 0, 0, 1, 0, 1],
                    [1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
                    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
                    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1], // Tricky slide at bottom
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
                ],
                // Level 3: The Vault (Hard) - Declaration
                [
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
                    [1, 2, 0, 0, 0, 1, 0, 0, 0, 1], // Start top left
                    [1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
                    [1, 0, 1, 1, 0, 0, 0, 0, 0, 1],
                    [1, 0, 0, 0, 0, 0, 3, 0, 0, 1], // Goal in middle? No, make it harder
                    [1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
                    [1, 0, 0, 0, 1, 0, 0, 1, 0, 1],
                    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
                    [1, 1, 0, 0, 0, 1, 0, 0, 0, 1],
                    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
                ]
            ],
            answer: "italy", // Legacy field, not used for Orbox
            hint: "Level 1: Find the ladder. Level 2: Go deeper. Level 3: Steal it."
        },
        {
            id: 7,
            title: "Clue #7: The Secret Society",
            text: "The final step. The movie that started this specific hunt. It's not about the money, it's about the history. I'm going to steal the Declaration of Independence.",
            type: "riddle",
            answer: "National Treasure",
            hint: "2004. Benjamin Franklin Gates."
        }
    ];

    let currentClueIndex = 0;

    // --- DEV NAV ---
    const nav = document.createElement('div');
    nav.style.position = 'fixed';
    nav.style.top = '0';
    nav.style.left = '0';
    nav.style.zIndex = '9999';
    nav.style.background = 'rgba(0,0,0,0.8)';
    nav.style.padding = '5px';
    nav.innerHTML = clues.map((c, i) => `<button onclick="window.jumpTo(${i})" style="margin: 0 5px;">${i + 1}</button>`).join('');
    document.body.appendChild(nav);

    window.jumpTo = function (i) {
        currentClueIndex = i;
        const intro = document.getElementById('intro-card');
        if (intro) intro.classList.add('hidden');
        showClue(i);
    };
    // ---------------

    startBtn.addEventListener('click', () => {
        introCard.style.animation = 'zoomIn 0.5s ease-in reverse forwards';
        setTimeout(() => {
            introCard.classList.add('hidden');
            showClue(currentClueIndex);
        }, 500);
    });

    function showClue(index) {
        if (index >= clues.length) {
            showVictory();
            return;
        }

        const clue = clues[index];

        // Update Background immediately
        const bgOverlay = document.querySelector('.background-overlay');
        if (bgOverlay) bgOverlay.style.backgroundImage = `url('bg_clue_${clue.id}.png')`;

        // Clear previous content and show container (empty)
        clueContainer.innerHTML = '';
        clueContainer.classList.remove('hidden');

        // Wait 2 seconds for background appreciation
        setTimeout(() => {
            let contentHtml = '';

            if (clue.type === 'puzzle') {
                contentHtml = `
                    <div class="glass-panel" style="animation: zoomIn 0.6s ease-out;">
                        <h2>${clue.title}</h2>
                        <p>${clue.text}</p>
                        <div id="puzzle-container" class="puzzle-grid"></div>
                        <p class="hint-text" style="margin-top: 15px; font-size: 0.9rem; opacity: 0.8;">${clue.hint}</p>
                        <p id="feedback" style="margin-top: 15px; font-weight: bold; min-height: 1.5em;"></p>
                    </div>
                `;
            } else if (clue.type === 'wordsearch') {
                contentHtml = `
                    <div class="glass-panel" style="animation: zoomIn 0.6s ease-out;">
                        <h2>${clue.title}</h2>
                        <p>${clue.text}</p>
                        <div class="wordsearch-container">
                            <div class="ws-grid-wrapper">
                                <div id="ws-grid" class="wordsearch-grid"></div>
                                <svg id="ws-svg" class="ws-svg-layer"></svg>
                            </div>
                            <div id="ws-words" class="word-list"></div>
                        </div>
                        <p class="hint-text" style="margin-top: 15px; font-size: 0.9rem; opacity: 0.8;">${clue.hint}</p>
                        <p id="feedback" style="margin-top: 15px; font-weight: bold; min-height: 1.5em;"></p>
                    </div>
                    </div>
                `;
            } else if (clue.type === 'orbox') {
                contentHtml = `
                    <div class="glass-panel" style="animation: zoomIn 0.6s ease-out;">
                        <h2>${clue.title}</h2>
                        <p>${clue.text}</p>
                        <div id="orbox-container" style="margin: 20px auto;"></div>
                        <div id="orbox-controls" style="margin-top: 15px; display: grid; gap: 5px; grid-template-areas: '. U .' 'L D R'; justify-content: center;">
                             <button class="cta-button" onclick="handleOrboxMove('up')" style="grid-area: U;">▲</button>
                             <button class="cta-button" onclick="handleOrboxMove('left')" style="grid-area: L;">◀</button>
                             <button class="cta-button" onclick="handleOrboxMove('down')" style="grid-area: D;">▼</button>
                             <button class="cta-button" onclick="handleOrboxMove('right')" style="grid-area: R;">▶</button>
                        </div>
                        <p class="hint-text" style="margin-top: 15px; font-size: 0.9rem; opacity: 0.8;">${clue.hint} (Use Arrow Keys)</p>
                         <p id="feedback" style="margin-top: 15px; font-weight: bold; min-height: 1.5em;"></p>
                    </div>
                `;
            } else {
                contentHtml = `
                    <div class="glass-panel" style="animation: zoomIn 0.6s ease-out;">
                        <h2>${clue.title}</h2>
                        <p>${clue.text}</p>
                        <div class="input-group" style="margin-bottom: 20px;">
                            <input type="text" id="answer-input" placeholder="Type your answer..." style="
                                width: 100%;
                                padding: 15px;
                                border-radius: 8px;
                                border: 1px solid var(--glass-border);
                                background: rgba(0,0,0,0.3);
                                color: var(--text-light);
                                font-family: 'Lato', sans-serif;
                                font-size: 1.1rem;
                            ">
                        </div>
                        <button id="submit-answer" class="cta-button">Unlock</button>
                        <p id="feedback" style="margin-top: 15px; font-weight: bold; min-height: 1.5em;"></p>
                    </div>
                `;
            }

            clueContainer.innerHTML = contentHtml;

            if (clue.type === 'puzzle') {
                initPuzzle(clue);
            } else if (clue.type === 'wordsearch') {
                initWordSearch(clue);
            } else if (clue.type === 'orbox') {
                initOrbox(clue, () => {
                    currentClueIndex++;
                    showClue(currentClueIndex);
                });
            } else {
                const input = document.getElementById('answer-input');
                document.getElementById('submit-answer').addEventListener('click', () => checkAnswer(clue));
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') checkAnswer(clue);
                });
                input.focus();
            }
        }, 100);
    }

    let puzzleState = [];
    let selectedTile = null;

    function initPuzzle(clue) {
        const container = document.getElementById('puzzle-container');
        // Initialize state 0..15
        puzzleState = Array.from({ length: 16 }, (_, i) => i);

        // Shuffle
        for (let i = puzzleState.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [puzzleState[i], puzzleState[j]] = [puzzleState[j], puzzleState[i]];
        }

        renderPuzzle(clue.image);
    }

    function renderPuzzle(imageSrc) {
        const container = document.getElementById('puzzle-container');
        container.innerHTML = '';

        puzzleState.forEach((correctIndex, currentIndex) => {
            const tile = document.createElement('div');
            tile.className = 'puzzle-tile';
            if (selectedTile === currentIndex) {
                tile.classList.add('selected');
            }

            // Calculate position of the correct piece in the original image (4x4 grid)
            const row = Math.floor(correctIndex / 4);
            const col = correctIndex % 4;

            tile.style.backgroundImage = `url('${imageSrc}')`;
            tile.style.backgroundPosition = `${col * 33.33}% ${row * 33.33}%`; // 33.33% because 100% / 3 gaps? No, background-position percentage logic is weird. 
            // Correct logic for 4x4 sprite sheet: 0%, 33.33%, 66.66%, 100%

            tile.dataset.index = currentIndex;

            tile.addEventListener('click', () => handleTileClick(currentIndex));
            container.appendChild(tile);
        });
    }

    function handleTileClick(index) {
        const feedback = document.getElementById('feedback');
        if (selectedTile === null) {
            selectedTile = index;
            // sound effect?
        } else if (selectedTile === index) {
            selectedTile = null; // Deselect
        } else {
            // Swap
            [puzzleState[selectedTile], puzzleState[index]] = [puzzleState[index], puzzleState[selectedTile]];
            selectedTile = null;

            // Check win
            checkPuzzleWin();
        }
        renderPuzzle(clues[currentClueIndex].image); // Re-render
    }

    function checkPuzzleWin() {
        const isSolved = puzzleState.every((val, index) => val === index);
        if (isSolved) {
            const panel = document.querySelector('.glass-panel');
            if (panel) panel.style.animation = 'zoomOut 0.5s ease-in forwards';

            setTimeout(() => {
                currentClueIndex++;
                showClue(currentClueIndex);
            }, 500);
        }
    }

    function checkAnswer(clue) {
        const input = document.getElementById('answer-input');
        const feedback = document.getElementById('feedback');

        // Normalize: trim and lowercase. Simple is robust.
        const normalize = (str) => str.trim().toLowerCase();

        const userVal = normalize(input.value);
        const answerVal = normalize(clue.answer);

        if (userVal === answerVal) {
            const panel = document.querySelector('.glass-panel');
            if (panel) panel.style.animation = 'zoomOut 0.5s ease-in forwards';

            setTimeout(() => {
                currentClueIndex++;
                showClue(currentClueIndex);
            }, 500);
        } else {
            // Immediate Trap Trigger
            startTicTacToeTrap();
        }
    }

    // --- Word Search Logic ---
    let wsGrid = [];
    let wsFoundWords = new Set();
    let wsSelection = { start: null, end: null, active: false, line: null };

    function initWordSearch(clue) {
        const gridEl = document.getElementById('ws-grid');
        const wordsEl = document.getElementById('ws-words');
        const svgEl = document.getElementById('ws-svg');

        wsGrid = clue.grid;
        wsFoundWords.clear();
        wsSelection = { start: null, end: null, active: false, line: null };

        // Render Words
        wordsEl.innerHTML = clue.displayWords.map(w => `<span class="word-item" data-word="${w.replace(/\s/g, '')}">${w}</span>`).join('');

        // Render Grid
        gridEl.innerHTML = '';
        svgEl.innerHTML = ''; // Clear lines

        // Set grid columns dynamically
        const rows = wsGrid.length;
        const cols = wsGrid[0].length;
        gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        // Dynamic grid generation
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'ws-cell';
                cell.textContent = wsGrid[r][c];
                cell.dataset.r = r;
                cell.dataset.c = c;

                // Event Listeners
                cell.addEventListener('mousedown', (e) => startWsSelection(r, c, e));
                cell.addEventListener('mouseenter', () => updateWsSelection(r, c));
                cell.addEventListener('mouseup', endWsSelection);

                // Touch support
                cell.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    startWsSelection(r, c, e);
                });

                // Allow touch move to update selection
                cell.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    const touch = e.touches[0];
                    const target = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (target && target.classList.contains('ws-cell')) {
                        const tr = parseInt(target.dataset.r);
                        const tc = parseInt(target.dataset.c);
                        updateWsSelection(tr, tc);
                    }
                });

                cell.addEventListener('touchend', endWsSelection);

                gridEl.appendChild(cell);
            }
        }

        // Global mouseup to catch releases outside grid
        document.addEventListener('mouseup', endWsSelection);
    }

    function startWsSelection(r, c, e) {
        wsSelection.active = true;
        wsSelection.start = { r, c };
        wsSelection.end = { r, c };

        // Create temp line
        const svgEl = document.getElementById('ws-svg');
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'ws-line');
        svgEl.appendChild(line);
        wsSelection.line = line;

        updateWsLine();
    }

    function updateWsSelection(r, c) {
        if (!wsSelection.active) return;
        wsSelection.end = { r, c };
        updateWsLine();
    }

    function updateWsLine() {
        if (!wsSelection.line || !wsSelection.start || !wsSelection.end) return;

        // Snap to valid diagonal/straight lines?
        // Let's allow free movement but highlight logic will define correctness
        // Actually, for visual feedback, snapping to 45 degrees is better.
        // getWsPath already enforces straight lines, let's use that logic to get the 'snapped' end coordinate

        const path = getWsPath();
        let endR, endC;

        if (path.length > 0) {
            endR = path[path.length - 1].r;
            endC = path[path.length - 1].c;
        } else {
            // If invalid path, just draw to current mouse pos? No, keep it pinned to start or snap to closest valid?
            // Let's just draw to the cell even if invalid, for responsiveness, 
            // OR stick to the last valid cell?
            endR = wsSelection.end.r;
            endC = wsSelection.end.c;
        }

        const startCell = document.querySelector(`.ws-cell[data-r="${wsSelection.start.r}"][data-c="${wsSelection.start.c}"]`);
        const endCell = document.querySelector(`.ws-cell[data-r="${endR}"][data-c="${endC}"]`);

        if (startCell && endCell) {
            // Coordinates relative to grid wrapper
            // Grid has padding 10px + gap 2px. 
            // Best way: Use offsetLeft/Top

            const x1 = startCell.offsetLeft + startCell.offsetWidth / 2;
            const y1 = startCell.offsetTop + startCell.offsetHeight / 2;
            const x2 = endCell.offsetLeft + endCell.offsetWidth / 2;
            const y2 = endCell.offsetTop + endCell.offsetHeight / 2;

            wsSelection.line.setAttribute('x1', x1);
            wsSelection.line.setAttribute('y1', y1);
            wsSelection.line.setAttribute('x2', x2);
            wsSelection.line.setAttribute('y2', y2);
        }
    }

    function endWsSelection() {
        if (!wsSelection.active) return;
        wsSelection.active = false;

        const valid = checkWsWord(clues[currentClueIndex]);
        if (!valid && wsSelection.line) {
            wsSelection.line.remove();
        }
        wsSelection.line = null;
    }

    function getWsPath() {
        if (!wsSelection.start || !wsSelection.end) return [];
        const start = wsSelection.start;
        const end = wsSelection.end;

        const dr = end.r - start.r;
        const dc = end.c - start.c;

        const steps = Math.max(Math.abs(dr), Math.abs(dc));
        if (steps === 0) return [{ r: start.r, c: start.c }];

        // Ensure strictly horizontal, vertical, or diagonal
        if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return []; // Invalid path

        const rStep = dr === 0 ? 0 : dr / steps;
        const cStep = dc === 0 ? 0 : dc / steps;

        const path = [];
        for (let i = 0; i <= steps; i++) {
            path.push({
                r: Math.round(start.r + i * rStep),
                c: Math.round(start.c + i * cStep)
            });
        }
        return path;
    }

    function checkWsWord(clue) {
        const path = getWsPath();
        if (path.length === 0) return false;

        const selectedWord = path.map(({ r, c }) => wsGrid[r][c]).join('');
        const reversedWord = selectedWord.split('').reverse().join('');

        const validWord = clue.words.find(w => w === selectedWord || w === reversedWord);

        if (validWord && !wsFoundWords.has(validWord)) {
            wsFoundWords.add(validWord);

            // Solidify line
            if (wsSelection.line) {
                wsSelection.line.classList.add('found');
            }
            // Mark cells as found (optional, just specific color)
            path.forEach(({ r, c }) => {
                const cell = document.querySelector(`.ws-cell[data-r="${r}"][data-c="${c}"]`);
                cell.classList.add('found');
            });

            // Mark word in list
            const listWord = document.querySelector(`.word-item[data-word="${validWord}"]`);
            if (listWord) listWord.classList.add('found');

            // Check Win
            if (wsFoundWords.size === clue.words.length) {
                const panel = document.querySelector('.glass-panel');
                if (panel) panel.style.animation = 'zoomOut 0.5s ease-in forwards';
                setTimeout(() => {
                    currentClueIndex++;
                    showClue(currentClueIndex);
                }, 500);
            }
            return true;
        }
        return false;
    }

    // --- Tic-Tac-Toe Trap Logic ---
    const nicCageQuotes = [
        "NOT THE BEES!",
        "I'm a vampire! I'm a vampire! I'm a vampire!",
        "Put the bunny back in the box.",
        "I'm going to steal the Declaration of Independence.",
        "A, B, C, D... E, F, G! H, I, J, K!",
        "HOW'D IT GET BURNED? HOW'D IT GET BURNED?!",
        "I lost my hand! I lost my hand!",
        "You don't have a lucky crack pipe?",
        "Peach... I could eat a peach for hours.",
        "I'll be taking these Huggies and whatever cash you got.",
        "Shoot him again! His soul is still dancing!",
        "Killing me won't bring back your goddamn honey!",
        "This is my Mecca!",
        "Have you ever been dragged by a sidewalk and beaten till you PISSED BLOOD!",
        "I'm a cat! I'm a sexy cat!",
        "Everything's burnt! Everything's burnt!"
    ];

    let tttBoard = Array(9).fill(null);
    let tttGameActive = false;

    function startTicTacToeTrap() {
        const trapContainer = document.createElement('div');
        trapContainer.id = 'ttt-trap-overlay';
        trapContainer.className = 'trap-overlay';
        trapContainer.innerHTML = `
            <div class="ttt-container glass-panel">
                <h2 class="ttt-title">THE CAGE</h2>
                <p>Defeat the Cage to return... if you can.</p>
                <div id="ttt-board" class="ttt-board"></div>
                <div id="ttt-taunt" class="ttt-taunt">"I can eat a peach for hours..."</div>
            </div>
        `;
        document.body.appendChild(trapContainer);

        // Prevent background scrolling
        document.body.style.overflow = 'hidden';

        initTicTacToe();
    }

    function initTicTacToe() {
        tttBoard = Array(9).fill(null);
        tttGameActive = true;
        renderTicTacToe();
    }

    function renderTicTacToe() {
        const boardEl = document.getElementById('ttt-board');
        boardEl.innerHTML = '';
        tttBoard.forEach((cell, index) => {
            const cellEl = document.createElement('div');
            cellEl.className = 'ttt-cell';
            if (cell) {
                cellEl.textContent = cell;
                cellEl.classList.add(cell === 'X' ? 'x-mark' : 'o-mark');
            }
            cellEl.addEventListener('click', () => handleTTTClick(index));
            boardEl.appendChild(cellEl);
        });
    }

    function handleTTTClick(index) {
        if (!tttGameActive || tttBoard[index] !== null) return;

        // Player Move (X)
        tttBoard[index] = 'X';
        renderTicTacToe();

        if (checkTTTWin('X')) {
            endTTT("IMPOSSIBLE! YOU WON!");
            return;
        }
        if (tttBoard.every(c => c !== null)) {
            endTTT("DRAW! The Cage is merciful...");
            return;
        }

        // AI Turn (O) - Unbeatable
        tttGameActive = false; // block input
        tauntPlayer();

        setTimeout(() => {
            const aiMove = getBestMove();
            tttBoard[aiMove] = 'O';
            renderTicTacToe();
            tttGameActive = true;

            if (checkTTTWin('O')) {
                endTTT("THE CAGE WINS AGAIN!");
            } else if (tttBoard.every(c => c !== null)) {
                endTTT("DRAW! You survive... for now.");
            }
        }, 600);
    }

    function tauntPlayer() {
        const tauntEl = document.getElementById('ttt-taunt');
        const randomQuote = nicCageQuotes[Math.floor(Math.random() * nicCageQuotes.length)];
        tauntEl.textContent = `"${randomQuote}"`;
        tauntEl.classList.add('pop');
        setTimeout(() => tauntEl.classList.remove('pop'), 300);
    }

    function endTTT(message) {
        tttGameActive = false;
        const tauntEl = document.getElementById('ttt-taunt');
        tauntEl.textContent = message;
        tauntEl.style.color = message.includes("WON") || message.includes("DRAW") ? "#4CAF50" : "#F44336";

        const container = document.querySelector('.ttt-container');
        if (document.getElementById('ttt-retry-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'ttt-retry-btn';
        btn.className = 'cta-button';
        btn.style.marginTop = '20px';
        btn.style.animation = 'fadeIn 0.5s ease-out';

        // If Player Wins or Draws, they escape
        if (message.includes("WON") || message.includes("DRAW") || message.includes("survive")) {
            btn.textContent = "Escape The Cage";
            btn.addEventListener('click', () => {
                document.body.style.overflow = '';
                document.querySelector('.trap-overlay').remove();
            });
        } else {
            // Loss
            btn.textContent = "Try Again";
            btn.addEventListener('click', () => {
                btn.remove();
                tauntEl.textContent = '"I can eat a peach for hours..."';
                tauntEl.style.color = '#ff6666';
                initTicTacToe();
            });
        }

        container.appendChild(btn);
    }


    function checkTTTWin(player) {
        const wins = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
            [0, 4, 8], [2, 4, 6]           // Diags
        ];
        return wins.some(combo => combo.every(i => tttBoard[i] === player));
    }

    function getBestMove() {
        let bestScore = -Infinity;
        let move;
        const available = tttBoard.map((v, i) => v === null ? i : null).filter(v => v !== null);

        // Optimization: If center is empty, take it (saves recursion depth early game)
        if (tttBoard[4] === null) return 4;

        for (let i of available) {
            tttBoard[i] = 'O';
            let score = minimax(tttBoard, 0, false);
            tttBoard[i] = null;
            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
        return move;
    }

    function minimax(board, depth, isMaximizing) {
        if (checkTTTWin('O')) return 10 - depth;
        if (checkTTTWin('X')) return depth - 10;
        if (board.every(c => c !== null)) return 0;

        const available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);

        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i of available) {
                board[i] = 'O';
                let score = minimax(board, depth + 1, false);
                board[i] = null;
                bestScore = Math.max(score, bestScore);
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i of available) {
                board[i] = 'X';
                let score = minimax(board, depth + 1, true);
                board[i] = null;
                bestScore = Math.min(score, bestScore);
            }
            return bestScore;
        }
    }

    function showVictory() {
        clueContainer.innerHTML = `
            <div class="glass-panel" style="animation: zoomIn 0.8s ease-out;">
                <h2>Mission Accomplished!</h2>
                <p>You have successfully decoded the secrets of the Cage. Happy 62nd Birthday!</p>
                <p>Enjoy the bees. NOT THE BEES!</p>
            </div>
        `;
    }
});
