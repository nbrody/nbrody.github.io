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
        }
        // More clues can be added here
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
        clueContainer.innerHTML = `
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

        clueContainer.classList.remove('hidden');

        document.getElementById('submit-answer').addEventListener('click', () => checkAnswer(clue));
        document.getElementById('answer-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkAnswer(clue);
        });
    }

    function checkAnswer(clue) {
        const input = document.getElementById('answer-input');
        const feedback = document.getElementById('feedback');
        const userVal = input.value.trim().toLowerCase();

        if (userVal === clue.answer.toLowerCase()) {
            feedback.style.color = '#4CAF50';
            feedback.textContent = "Correct! The path reveals itself...";
            setTimeout(() => {
                currentClueIndex++;
                showClue(currentClueIndex);
            }, 1500);
        } else {
            feedback.style.color = '#f44336';
            feedback.textContent = "Incorrect. The treasure remains hidden.";
            introCard.classList.add('shake'); // Add specific animation if needed, or just visual feedback
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
