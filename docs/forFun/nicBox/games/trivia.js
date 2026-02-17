// ═══════════════════════════════════════════════════════════
// Trivia Showdown — TV-side game logic
// ═══════════════════════════════════════════════════════════

class TriviaGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.currentQuestionIndex = 0;
        this.timer = null;
        this.timeLeft = 20;
        this.answers = {};
        this.listeners = [];

        // Trivia question bank
        this.questions = [
            {
                category: 'Science',
                question: 'What planet is known as the Red Planet?',
                answers: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
                correct: 1
            },
            {
                category: 'Geography',
                question: 'What is the largest ocean on Earth?',
                answers: ['Atlantic', 'Indian', 'Pacific', 'Arctic'],
                correct: 2
            },
            {
                category: 'History',
                question: 'In what year did World War II end?',
                answers: ['1943', '1944', '1945', '1946'],
                correct: 2
            },
            {
                category: 'Pop Culture',
                question: 'Who directed the movie "Inception"?',
                answers: ['Steven Spielberg', 'Christopher Nolan', 'James Cameron', 'Ridley Scott'],
                correct: 1
            },
            {
                category: 'Science',
                question: 'What is the chemical symbol for gold?',
                answers: ['Go', 'Gd', 'Au', 'Ag'],
                correct: 2
            },
            {
                category: 'Sports',
                question: 'How many players are on a basketball team on the court?',
                answers: ['4', '5', '6', '7'],
                correct: 1
            },
            {
                category: 'Music',
                question: 'Which band performed "Bohemian Rhapsody"?',
                answers: ['The Beatles', 'Led Zeppelin', 'Queen', 'Pink Floyd'],
                correct: 2
            },
            {
                category: 'Food',
                question: 'What country is sushi originally from?',
                answers: ['China', 'Korea', 'Thailand', 'Japan'],
                correct: 3
            },
            {
                category: 'Nature',
                question: 'What is the fastest land animal?',
                answers: ['Lion', 'Cheetah', 'Gazelle', 'Horse'],
                correct: 1
            },
            {
                category: 'Technology',
                question: 'What year was the first iPhone released?',
                answers: ['2005', '2006', '2007', '2008'],
                correct: 2
            },
            {
                category: 'Geography',
                question: 'What is the smallest country in the world?',
                answers: ['Monaco', 'Vatican City', 'San Marino', 'Liechtenstein'],
                correct: 1
            },
            {
                category: 'Movies',
                question: 'What is the highest-grossing film of all time (adjusted)?',
                answers: ['Avengers: Endgame', 'Avatar', 'Titanic', 'Star Wars'],
                correct: 1
            },
            {
                category: 'Science',
                question: 'What gas do plants absorb from the atmosphere?',
                answers: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'],
                correct: 2
            },
            {
                category: 'Literature',
                question: 'Who wrote "1984"?',
                answers: ['Aldous Huxley', 'George Orwell', 'Ray Bradbury', 'H.G. Wells'],
                correct: 1
            },
            {
                category: 'History',
                question: 'What ancient wonder was located in Alexandria, Egypt?',
                answers: ['Colossus', 'Hanging Gardens', 'Lighthouse', 'Temple of Artemis'],
                correct: 2
            }
        ];

        // Shuffle questions
        this.questions = this.questions.sort(() => Math.random() - 0.5);
        this.totalQuestions = Math.min(10, this.questions.length);

        this.init();
    }

    init() {
        this.render();
        this.listenForAnswers();
        this.showQuestion();
    }

    render() {
        this.container.innerHTML = `
            <div class="trivia-container">
                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                    <span id="trivia-progress" style="color: var(--text-muted); font-size: 0.85rem;">
                        Question 1 / ${this.totalQuestions}
                    </span>
                    <div class="trivia-timer" id="trivia-timer">${this.timeLeft}</div>
                </div>

                <div class="trivia-question" id="trivia-question">
                    <span class="trivia-category" id="trivia-category"></span>
                    <span id="trivia-text"></span>
                </div>

                <div class="trivia-answers-grid" id="trivia-answers"></div>

                <div id="answer-tally" style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
                </div>
            </div>
        `;
    }

    showQuestion() {
        if (this.currentQuestionIndex >= this.totalQuestions) {
            this.endTrivia();
            return;
        }

        const q = this.questions[this.currentQuestionIndex];
        this.answers = {};

        // Update Firebase
        updateGameState(this.roomCode, {
            currentQuestion: this.currentQuestionIndex,
            revealAnswer: null
        });

        // Update UI
        document.getElementById('trivia-progress').textContent =
            `Question ${this.currentQuestionIndex + 1} / ${this.totalQuestions}`;
        document.getElementById('trivia-category').textContent = q.category;
        document.getElementById('trivia-text').textContent = q.question;

        const answersEl = document.getElementById('trivia-answers');
        const labels = ['A', 'B', 'C', 'D'];
        answersEl.innerHTML = q.answers.map((a, i) => `
            <div class="trivia-answer-btn" id="trivia-ans-${i}">
                <strong>${labels[i]}.</strong> ${a}
                <div class="answer-responses" id="ans-responses-${i}"></div>
            </div>
        `).join('');

        document.getElementById('answer-tally').innerHTML = '';

        // Start timer
        this.timeLeft = 20;
        this.updateTimerDisplay();
        this.startTimer();
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.revealAnswer();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const el = document.getElementById('trivia-timer');
        if (!el) return;
        el.textContent = this.timeLeft;
        el.className = 'trivia-timer';
        if (this.timeLeft <= 5) el.classList.add('danger');
        else if (this.timeLeft <= 10) el.classList.add('warning');
    }

    listenForAnswers() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');

        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data.action?.type === 'trivia_answer' && !this.answers[data.playerId]) {
                this.answers[data.playerId] = {
                    answer: data.action.answer,
                    timestamp: data.action.timestamp
                };
                this.showPlayerAnswered(data.playerId);

                // Check if all players answered
                if (Object.keys(this.answers).length >= Object.keys(this.players).length) {
                    clearInterval(this.timer);
                    setTimeout(() => this.revealAnswer(), 500);
                }
            }
        });

        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    showPlayerAnswered(playerId) {
        const player = this.players[playerId];
        if (!player) return;

        const tally = document.getElementById('answer-tally');
        const badge = document.createElement('span');
        badge.style.cssText = `
            display: inline-flex; align-items: center; gap: 4px;
            padding: 4px 12px; border-radius: 999px;
            background: ${player.color}22; border: 1px solid ${player.color}44;
            font-size: 0.8rem; animation: playerJoin 0.3s ease forwards;
        `;
        badge.innerHTML = `${player.avatar} ${player.name} ✓`;
        tally.appendChild(badge);

        // Show dot on their answer
        const answerData = this.answers[playerId];
        const responsesEl = document.getElementById(`ans-responses-${answerData.answer}`);
        if (responsesEl) {
            const dot = document.createElement('span');
            dot.style.cssText = `
                width: 24px; height: 24px; border-radius: 50%;
                background: ${player.color}; display: inline-flex;
                align-items: center; justify-content: center;
                font-size: 0.7rem;
            `;
            dot.textContent = player.avatar;
            responsesEl.appendChild(dot);
        }
    }

    revealAnswer() {
        const q = this.questions[this.currentQuestionIndex];
        const correct = q.correct;

        // Update Firebase with correct answer
        updateGameState(this.roomCode, { revealAnswer: correct });

        // Highlight correct/incorrect
        q.answers.forEach((_, i) => {
            const el = document.getElementById(`trivia-ans-${i}`);
            if (!el) return;
            if (i === correct) {
                el.classList.add('correct');
            } else {
                el.classList.add('incorrect');
            }
        });

        // Score players who got it right (faster = more points)
        const correctPlayers = [];
        Object.entries(this.answers).forEach(([pid, data]) => {
            if (data.answer === correct) {
                correctPlayers.push({ pid, timestamp: data.timestamp });
            }
        });

        // Sort by timestamp (fastest first), award points
        correctPlayers.sort((a, b) => a.timestamp - b.timestamp);
        correctPlayers.forEach((p, index) => {
            const points = Math.max(100 - index * 20, 20); // 100, 80, 60, 40, 20
            const currentScore = this.players[p.pid]?.score || 0;
            this.players[p.pid].score = currentScore + points;
            updateScoreDisplay(p.pid, this.players[p.pid].score);
        });

        renderScoreboard();

        // Clear actions for next question
        setTimeout(() => {
            getRoomRef(this.roomCode).child('gameState/actions').remove();
            this.currentQuestionIndex++;
            this.showQuestion();
        }, 4000);
    }

    endTrivia() {
        this.cleanup();
        endGame();
    }

    cleanup() {
        if (this.timer) clearInterval(this.timer);
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}
