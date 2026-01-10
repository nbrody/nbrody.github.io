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
            title: "Clue #2: The Desert Heist",
            text: "A childless couple, a quintuplet snatch. In the land of copper, we run from a bounty hunter named Leonard Smalls. What is my story?",
            type: "riddle",
            answer: "Raising Arizona",
            hint: "1987. H.I. McDunnough."
        },
        {
            id: 3,
            title: "Clue #3: The Neon Despair",
            text: "To the city of sin I drove, to shed my mortal coil. A love found in the bottle's bottom, a tragic, Oscar-winning end.",
            type: "riddle",
            answer: "Leaving Las Vegas",
            hint: "1995. Ben Sanderson."
        },
        {
            id: 4,
            title: "Clue #4: The Swap",
            text: "My face... it's gone. Put me back together.",
            type: "puzzle",
            image: "face_off_poster.png",
            answer: "face/off", // Not directly used for text input, but good for reference
            hint: "Click two pieces to swap them. Reconstruct the poster."
        },
        {
            id: 5,
            title: "Clue #5: The Meta-Morphosis",
            text: "A version of my younger self haunts me. I accept a million dollars to attend a birthday, only to become a CIA informant. Paddington 2 makes me cry.",
            type: "riddle",
            answer: "The Unbearable Weight of Massive Talent",
            hint: "2022. Nick Cage."
        },
        {
            id: 6,
            title: "Clue #6: The Secret Society",
            text: "The final step. The movie that started this specific hunt. It's not about the money, it's about the history. I'm going to steal the Declaration of Independence.",
            type: "riddle",
            answer: "National Treasure",
            hint: "2004. Benjamin Franklin Gates."
        }
    ];

    let currentClueIndex = 0;

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
        clueContainer.classList.remove('hidden');

        if (clue.type === 'puzzle') {
            initPuzzle(clue);
        } else {
            document.getElementById('submit-answer').addEventListener('click', () => checkAnswer(clue));
            document.getElementById('answer-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') checkAnswer(clue);
            });
        }

        // Update Background
        const bgOverlay = document.querySelector('.background-overlay');
        bgOverlay.style.backgroundImage = `url('bg_clue_${clue.id}.png')`;
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
            const feedback = document.getElementById('feedback');
            feedback.style.color = '#4CAF50';
            feedback.textContent = "Face... restored. Proceeding.";
            setTimeout(() => {
                currentClueIndex++;
                showClue(currentClueIndex);
            }, 1500);
        }
    }

    function checkAnswer(clue) {
        const input = document.getElementById('answer-input');
        const feedback = document.getElementById('feedback');

        // Normalize: remove non-alphanumeric characters and convert to lowercase
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

        const userVal = normalize(input.value);
        const answerVal = normalize(clue.answer);

        if (userVal === answerVal) {
            feedback.style.color = '#4CAF50';
            feedback.textContent = "Correct! The path reveals itself...";
            setTimeout(() => {
                currentClueIndex++;
                showClue(currentClueIndex);
            }, 1500);
        } else {
            feedback.style.color = '#f44336';
            feedback.textContent = "Incorrect. The treasure remains hidden.";
            const panel = document.querySelector('.glass-panel');
            if (panel) {
                panel.classList.add('shake');
                setTimeout(() => panel.classList.remove('shake'), 500);
            }
            setTimeout(() => feedback.textContent = "", 2000);
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
