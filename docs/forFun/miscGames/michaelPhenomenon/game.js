/* ============================================
   MICHAEL vs. PHENOMENON — Game Logic
   ============================================ */

// ---- TRIVIA DATABASE ----
const ALL_QUESTIONS = [
    // --- MICHAEL questions ---
    {
        question: "In which movie does John Travolta literally smell like cookies?",
        answer: "michael",
        category: "Hygiene",
        detail: "In Michael, the archangel Michael smells like cookies. Multiple characters comment on it. He never explains why."
    },
    {
        question: "In which movie does Travolta's character have wings?",
        answer: "michael",
        category: "Anatomy",
        detail: "Michael is an angel with big, somewhat shabby-looking wings. He hides them under a trench coat like it's totally normal."
    },
    {
        question: "Which movie features a trip to the World's Largest Ball of Twine?",
        answer: "michael",
        category: "Tourism",
        detail: "The characters in Michael take a road trip detour to see the World's Largest Ball of Twine in Darwin, Minnesota. This is a real place."
    },
    {
        question: "In which movie does Travolta dance in a bar to 'Chain of Fools'?",
        answer: "michael",
        category: "Moves",
        detail: "Michael dances in a country bar and every woman in the place joins him. Aretha Franklin's 'Chain of Fools' plays. It's magnificent."
    },
    {
        question: "Which movie stars Andie MacDowell as the love interest?",
        answer: "michael",
        category: "Romance",
        detail: "Andie MacDowell plays Dorothy Winters, a dog trainer and 'angel expert' who joins the road trip in Michael."
    },
    {
        question: "In which film does Travolta's character fight a bull?",
        answer: "michael",
        category: "Livestock",
        detail: "In Michael, the archangel literally fights a bull in a field. He wins. Of course he wins. He's an archangel."
    },
    {
        question: "Which movie features a tabloid newspaper called the National Mirror?",
        answer: "michael",
        category: "Journalism",
        detail: "In Michael, reporters from the fictional National Mirror (a Weekly World News-type tabloid) are sent to investigate an angel sighting in Iowa."
    },
    {
        question: "In which movie does Travolta keep a running count of how many battles he's won?",
        answer: "michael",
        category: "Statistics",
        detail: "Michael claims to have fought in many battles and casually keeps a tally. His final count is something absurd. He's very proud of it."
    },
    {
        question: "Which movie features a dog named Sparky who dies and comes back to life?",
        answer: "michael",
        category: "Veterinary Miracles",
        detail: "In Michael, a little dog dies during the road trip and Michael uses his angel powers to bring it back to life. Peak cinema."
    },
    {
        question: "In which film does Travolta eat massive quantities of sugar?",
        answer: "michael",
        category: "Nutrition",
        detail: "Michael eats enormous amounts of sugar — cereal, pie, anything sweet. When asked why, he says 'I'm an angel, not a saint.'"
    },
    {
        question: "Which movie was directed by Nora Ephron?",
        answer: "michael",
        category: "Behind The Camera",
        detail: "Michael was directed by Nora Ephron, who also directed When Harry Met Sally and Sleepless in Seattle. This is her angel-fights-a-bull movie."
    },
    {
        question: "In which movie does Travolta play a character who lives in a motel in Iowa?",
        answer: "michael",
        category: "Real Estate",
        detail: "The archangel Michael is found living in a small motel room in Iowa, hosted by an old woman. His room is a mess."
    },
    {
        question: "Which movie features the song 'Heaven' by Bryan Adams... but played on a jukebox in a dive bar?",
        answer: "michael",
        category: "Soundtrack Choices",
        detail: "The jukebox scene in Michael features some truly inspired choices. The angel is a bar regular, apparently."
    },
    {
        question: "In which movie does Jean Stapleton (Edith Bunker from All in the Family) host an angel?",
        answer: "michael",
        category: "Casting Deep Cuts",
        detail: "Jean Stapleton plays Pansy Milbank, the Iowa woman who's been housing the archangel Michael. This was one of her final film roles."
    },

    // --- PHENOMENON questions ---
    {
        question: "In which movie does Travolta's character learn Portuguese overnight?",
        answer: "phenomenon",
        category: "Linguistics",
        detail: "George Malley learns Portuguese in about 20 minutes from a book. He also learns other languages basically instantly. Just a small-town mechanic thing."
    },
    {
        question: "Which movie features Travolta getting struck by a mysterious light from the sky?",
        answer: "phenomenon",
        category: "Astronomy",
        detail: "In Phenomenon, George sees a bright light in the sky on his 37th birthday and suddenly becomes a genius. Is it aliens? God? A tumor? Yes."
    },
    {
        question: "In which movie does Travolta move objects with his mind?",
        answer: "phenomenon",
        category: "Telekinesis",
        detail: "George Malley develops telekinetic powers in Phenomenon. He uses them for important things like making a pen roll across a table."
    },
    {
        question: "Which movie stars Kyra Sedgwick as the love interest?",
        answer: "phenomenon",
        category: "Romance",
        detail: "Kyra Sedgwick plays Lace Pennamin, a single mom who makes chairs. Yes, chairs. She's the love interest in Phenomenon."
    },
    {
        question: "In which film does Travolta's character predict an earthquake?",
        answer: "phenomenon",
        category: "Seismology",
        detail: "George Malley detects an approaching earthquake before the instruments do, because of course he does. He's becoming a human seismograph."
    },
    {
        question: "Which movie features Travolta as a small-town auto mechanic?",
        answer: "phenomenon",
        category: "Career",
        detail: "In Phenomenon, George Malley is a regular mechanic in a small California town before the flash of light turns him into a superbrain."
    },
    {
        question: "In which movie does the town turn against Travolta because he's too smart?",
        answer: "phenomenon",
        category: "Social Commentary",
        detail: "In Phenomenon, the townsfolk get hostile because George reads too many books and knows too much. Classic small-town energy."
    },
    {
        question: "Which movie was directed by Jon Turteltaub?",
        answer: "phenomenon",
        category: "Behind The Camera",
        detail: "Jon Turteltaub directed Phenomenon. He later directed National Treasure, which is basically the same movie but with Nicolas Cage stealing the Declaration of Independence."
    },
    {
        question: "In which movie does Travolta's character develop a new type of fertilizer?",
        answer: "phenomenon",
        category: "Agriculture",
        detail: "George invents a revolutionary organic fertilizer that grows amazing gardens. His supergenius brain chose gardening. Respect."
    },
    {
        question: "Which movie features Travolta solving a complex code for the military?",
        answer: "phenomenon",
        category: "Cryptography",
        detail: "The military shows up because George cracked a classified signal that turned out to be encrypted military communications. He thought it was just a fun puzzle."
    },
    {
        question: "In which movie does Travolta's character learn things by touching books without reading them?",
        answer: "phenomenon",
        category: "Speed Reading",
        detail: "By the end of Phenomenon, George can absorb a book by basically just holding it. This is presented as totally dramatic and not at all laughable."
    },
    {
        question: "Which movie has Robert Duvall as a kindly town doctor?",
        answer: "phenomenon",
        category: "Casting",
        detail: "Robert Duvall plays Doc Brunder, the town doctor who tries to figure out what's happening to George. He brings gravitas to this insane premise."
    },
    {
        question: "In which movie does Travolta make a mirror spin using his mind during a pool game?",
        answer: "phenomenon",
        category: "Party Tricks",
        detail: "George demonstrates his telekinesis in a bar by making things move. Nobody reacts appropriately."
    },
    {
        question: "Which movie features Travolta reading four or five books a day?",
        answer: "phenomenon",
        category: "Book Club",
        detail: "After the light hits him, George starts reading multiple books a day. He sends away for them by mail because this is 1996 and Amazon was just books."
    },

    // --- SHARED / TRICKY questions ---
    {
        question: "In which movie does Travolta die at the end?",
        answer: "both",
        category: "Spoiler Alert",
        detail: "Travolta's character dies in BOTH movies. Michael uses up his last trip to Earth, and George's powers were caused by a brain tumor. Two-for-two on tragic Travolta endings in '96."
    },
    {
        question: "Which movie was released in 1996?",
        answer: "both",
        category: "Calendar",
        detail: "Both movies came out in 1996 — the undisputed greatest year for 'John Travolta plays a magical guy in a small town' cinema."
    },
    {
        question: "In which movie does Travolta's character possess supernatural intelligence or knowledge?",
        answer: "both",
        category: "Brain Power",
        detail: "Both! Michael is literally an archangel with cosmic knowledge, and George becomes a telekinetic super-genius. 1996 Travolta simply could not be contained by mortal limitations."
    },
    {
        question: "In which movie are the townspeople initially skeptical of Travolta's abilities?",
        answer: "both",
        category: "Skepticism",
        detail: "In both movies! The tabloid reporters don't believe Michael is real, and George's neighbors think he's gone crazy. Nobody trusts magical Travolta."
    },
    {
        question: "Which movie features a love story where the woman is initially resistant to Travolta's charms?",
        answer: "both",
        category: "Romantic Subplot",
        detail: "In both movies! Andie MacDowell is prickly toward Michael, and Kyra Sedgwick keeps rejecting George. Supernatural powers don't help with dating, apparently."
    },
    {
        question: "In which movie does Travolta's character show kindness to animals?",
        answer: "both",
        category: "Animal Friends",
        detail: "Michael brings a dog back to life! George communicates with nature! Both magical Travoltas are Disney princes in different fonts."
    },
    {
        question: "Which movie involves Travolta inspiring an entire community by the end?",
        answer: "both",
        category: "Inspiration",
        detail: "Both! Michael teaches the reporters to believe in miracles, and George's whole town comes around to appreciate his genius. Maximum heartwarming on both fronts."
    },
    {
        question: "In which movie is there a significant scene at a birthday party?",
        answer: "phenomenon",
        category: "Celebrations",
        detail: "The flash of light hits George on his 37th birthday — right outside the bar during his party. Worst/best birthday ever."
    },
    {
        question: "In which movie does Travolta have terrible personal hygiene habits despite being magical?",
        answer: "michael",
        category: "Grooming",
        detail: "Michael is an absolute slob. He's an archangel with a stained undershirt, a messy room, and a cigarette habit. He smells like cookies though, so it evens out?"
    },
    {
        question: "Which movie features Travolta's character explicitly being studied by scientists or the government?",
        answer: "phenomenon",
        category: "Research",
        detail: "The government and scientists show up to study George in Phenomenon. They're not super friendly about it. Michael was only investigated by tabloid journalists."
    },
    {
        question: "In which movie does a key character own or operate a vehicle repair business?",
        answer: "phenomenon",
        category: "Small Business",
        detail: "George Malley runs an auto repair shop in Phenomenon. It's his whole identity before the brain-light incident."
    },
    {
        question: "Which movie features a scene where Travolta casually explains the entire universe to someone over dinner?",
        answer: "phenomenon",
        category: "Dinner Conversation",
        detail: "George starts casually solving physics problems and explaining cosmic concepts over meals. Just regular dinner talk."
    },
    {
        question: "In which movie does Travolta's character walk around without shoes?",
        answer: "michael",
        category: "Footwear",
        detail: "Michael frequently goes barefoot because he's an angel and also because shoes are apparently optional in Iowa."
    },
    {
        question: "Which movie has a scene involving a tractor or farming equipment moving on its own?",
        answer: "phenomenon",
        category: "Farm Equipment",
        detail: "George's telekinesis starts affecting objects around him, and farm equipment is not immune. Things move when George gets emotional."
    },
    {
        question: "In which movie does Travolta make an apple rise off a table?",
        answer: "phenomenon",
        category: "Produce",
        detail: "George makes objects levitate, including food. It's the clear sign that something supernatural is happening, beyond the 12 books a day."
    },
    {
        question: "Which movie features Forest Whitaker as Travolta's best friend?",
        answer: "phenomenon",
        category: "Best Friends",
        detail: "Forest Whitaker plays Nate Pope, George's loyal best friend in Phenomenon. He's supportive even when George starts predicting earthquakes."
    },
    {
        question: "In which movie does William Hurt appear?",
        answer: "michael",
        category: "Casting",
        detail: "William Hurt plays Frank Quinlan, the lead reporter who's cynical about the angel story until he actually meets Michael."
    },
    {
        question: "Which movie's tagline was 'He's an angel... not a saint'?",
        answer: "michael",
        category: "Marketing",
        detail: "Michael's tagline was 'He's an angel... not a saint.' This is because he smokes, drinks, fights bulls, and dances like nobody's watching."
    },
    {
        question: "Which movie's poster featured Travolta looking up at the sky?",
        answer: "phenomenon",
        category: "Movie Posters",
        detail: "The Phenomenon poster has Travolta looking up at a beam of light with a sense of wonder. The Michael poster has him with wings in a trench coat. Both are peak '90s."
    },
    {
        question: "In which movie does Travolta's character have a profound effect on plant growth?",
        answer: "phenomenon",
        category: "Botany",
        detail: "George's presence (and his fertilizer invention) causes plants to grow like crazy in Phenomenon. His garden becomes wildly lush."
    },
];

// Napkin doodles that appear randomly
const NAPKIN_DOODLES = [
    "travolta is in both??",
    "wait which one had the dog",
    "1996 was wild",
    "do angels eat pie",
    "kyra or andie??",
    "telekinesis ≠ wings",
    "both die at the end lol",
    "this napkin is getting full",
    "need more napkins",
    "cookies vs. brain tumor",
    "who greenlit both of these",
    "RIP george & michael",
    "they should do a crossover",
    "travolta cinematic universe",
    "why does he smell like cookies",
    "phenomenon was sad",
    "michael was weird",
    "both. both were weird.",
];

// ---- ROMAN NUMERAL CONVERTER (messy) ----
function toMessyRoman(num) {
    if (num === 0) return "—";
    const romanMap = [
        [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
    ];
    let result = "";
    let remaining = num;
    for (const [value, numeral] of romanMap) {
        while (remaining >= value) {
            result += numeral;
            remaining -= value;
        }
    }

    // Make it messy: randomly lowercase some, add spacing oddities
    let messy = "";
    for (let i = 0; i < result.length; i++) {
        const ch = result[i];
        // Randomly lowercase ~30% of characters
        if (Math.random() < 0.3) {
            messy += ch.toLowerCase();
        } else {
            messy += ch;
        }
        // Randomly add extra space or no space
        if (Math.random() < 0.15 && i < result.length - 1) {
            messy += " ";
        }
    }

    // Sometimes add a crossed-out wrong attempt before the real answer
    if (num > 2 && Math.random() < 0.3) {
        const wrongNum = num + (Math.random() < 0.5 ? 1 : -1);
        const wrongRoman = toCleanRoman(Math.max(1, wrongNum));
        // strikethrough via unicode combining
        const strikeout = [...wrongRoman].map(c => c + '\u0336').join('');
        messy = strikeout + " " + messy;
    }

    return messy;
}

function toCleanRoman(num) {
    if (num <= 0) return "";
    const romanMap = [
        [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
    ];
    let result = "";
    let remaining = num;
    for (const [value, numeral] of romanMap) {
        while (remaining >= value) {
            result += numeral;
            remaining -= value;
        }
    }
    return result;
}


// ---- GAME STATE ----
const state = {
    players: ["Player 1", "Player 2"],
    currentPlayer: 0,   // 0 or 1
    michaelScore: 0,
    phenomenonScore: 0,
    questionIndex: 0,
    questions: [],
    totalQuestions: 15,
    answered: false,
    playerCorrectCounts: [0, 0],
};

// ---- DOM REFS ----
const $ = id => document.getElementById(id);

const introScreen = $("intro-screen");
const gameScreen = $("game-screen");
const endScreen = $("end-screen");
const startBtn = $("start-btn");
const player1Input = $("player1-name");
const player2Input = $("player2-name");
const roundNum = $("round-number");
const totalRounds = $("total-rounds");
const turnIndicator = $("turn-indicator");
const questionCategory = $("question-category");
const questionText = $("question-text");
const questionCard = $("question-card");
const answersContainer = $("answers-container");
const answerMichael = $("answer-michael");
const answerPhenomenon = $("answer-phenomenon");
const answerBoth = $("answer-both");
const feedbackArea = $("feedback-area");
const feedbackText = $("feedback-text");
const feedbackDetail = $("feedback-detail");
const nextBtn = $("next-btn");
const michaelScoreEl = $("michael-score");
const phenomenonScoreEl = $("phenomenon-score");
const napkinDoodle = $("napkin-doodle");

// ---- SCREEN TRANSITIONS ----
function showScreen(screen) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    screen.classList.add("active");
}

// ---- SHUFFLE ----
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---- START GAME ----
function startGame() {
    state.players[0] = player1Input.value.trim() || "Player 1";
    state.players[1] = player2Input.value.trim() || "Player 2";
    state.currentPlayer = 0;
    state.michaelScore = 0;
    state.phenomenonScore = 0;
    state.questionIndex = 0;
    state.answered = false;
    state.playerCorrectCounts = [0, 0];

    // Pick random questions
    state.questions = shuffle(ALL_QUESTIONS).slice(0, state.totalQuestions);
    totalRounds.textContent = state.totalQuestions;

    updateNapkinScores();
    showScreen(gameScreen);
    loadQuestion();
}

// ---- LOAD QUESTION ----
function loadQuestion() {
    if (state.questionIndex >= state.questions.length) {
        endGame();
        return;
    }

    state.answered = false;
    const q = state.questions[state.questionIndex];

    roundNum.textContent = state.questionIndex + 1;
    questionCategory.textContent = q.category;
    questionText.textContent = q.question;

    // Alternate turns
    state.currentPlayer = state.questionIndex % 2;
    turnIndicator.textContent = `${state.players[state.currentPlayer]}'s turn`;
    turnIndicator.className = "turn-indicator player" + (state.currentPlayer + 1);

    // Reset buttons
    [answerMichael, answerPhenomenon, answerBoth].forEach(btn => {
        btn.disabled = false;
        btn.classList.remove("correct", "wrong");
    });

    feedbackArea.classList.remove("visible");
    questionCard.classList.remove("enter", "shake");
    void questionCard.offsetWidth; // force reflow
    questionCard.classList.add("enter");

    // Random doodle update
    if (Math.random() < 0.4 || state.questionIndex === 0) {
        napkinDoodle.textContent = NAPKIN_DOODLES[Math.floor(Math.random() * NAPKIN_DOODLES.length)];
    }
}

// ---- HANDLE ANSWER ----
function handleAnswer(chosen) {
    if (state.answered) return;
    state.answered = true;

    const q = state.questions[state.questionIndex];
    const correct = chosen === q.answer;

    // Disable all buttons
    [answerMichael, answerPhenomenon, answerBoth].forEach(btn => btn.disabled = true);

    // Highlight correct/wrong
    const chosenBtn = chosen === "michael" ? answerMichael :
                      chosen === "phenomenon" ? answerPhenomenon : answerBoth;
    const correctBtn = q.answer === "michael" ? answerMichael :
                       q.answer === "phenomenon" ? answerPhenomenon : answerBoth;

    if (correct) {
        chosenBtn.classList.add("correct");
        feedbackText.textContent = "✓ Correct!";
        feedbackText.className = "feedback-text correct";

        // Award point to the MOVIE, not the player
        if (q.answer === "michael") {
            state.michaelScore++;
        } else if (q.answer === "phenomenon") {
            state.phenomenonScore++;
        } else {
            // "both" — give a point to each
            state.michaelScore++;
            state.phenomenonScore++;
        }

        state.playerCorrectCounts[state.currentPlayer]++;
        updateNapkinScores();
        spawnCelebration(chosenBtn);
    } else {
        chosenBtn.classList.add("wrong");
        correctBtn.classList.add("correct");
        feedbackText.textContent = "✗ Nope!";
        feedbackText.className = "feedback-text wrong";
        questionCard.classList.add("shake");
    }

    const movieName = q.answer === "both" ? "Both movies" :
                      q.answer === "michael" ? "Michael" : "Phenomenon";
    feedbackDetail.textContent = q.detail;
    feedbackArea.classList.add("visible");
}

// ---- UPDATE NAPKIN ----
function updateNapkinScores() {
    const mScore = toMessyRoman(state.michaelScore);
    const pScore = toMessyRoman(state.phenomenonScore);

    michaelScoreEl.textContent = mScore;
    phenomenonScoreEl.textContent = pScore;

    // Trigger pop animation
    michaelScoreEl.classList.remove("pop");
    phenomenonScoreEl.classList.remove("pop");
    void michaelScoreEl.offsetWidth;
    if (state.michaelScore > 0) michaelScoreEl.classList.add("pop");
    if (state.phenomenonScore > 0) phenomenonScoreEl.classList.add("pop");
}

// ---- NEXT QUESTION ----
function nextQuestion() {
    state.questionIndex++;
    loadQuestion();
}

// ---- CELEBRATIONS ----
function spawnCelebration(btn) {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top;

    const colors = ["#f0c040", "#4ecb71", "#4a9eff", "#e04848", "#c474f0", "#ff7849"];
    for (let i = 0; i < 8; i++) {
        const dot = document.createElement("div");
        dot.className = "celebration-dot";
        dot.style.left = (cx + (Math.random() - 0.5) * 100) + "px";
        dot.style.top = (cy - Math.random() * 20) + "px";
        dot.style.background = colors[Math.floor(Math.random() * colors.length)];
        dot.style.animationDuration = (0.6 + Math.random() * 0.8) + "s";
        document.body.appendChild(dot);
        setTimeout(() => dot.remove(), 2000);
    }

    // If it's a Michael answer, spawn feathers
    const q = state.questions[state.questionIndex];
    if (q.answer === "michael" || q.answer === "both") {
        for (let i = 0; i < 3; i++) {
            const feather = document.createElement("div");
            feather.className = "wing-feather";
            feather.textContent = "🪶";
            feather.style.left = (cx + (Math.random() - 0.5) * 60) + "px";
            feather.style.top = (cy - 10) + "px";
            feather.style.animationDelay = (i * 0.2) + "s";
            document.body.appendChild(feather);
            setTimeout(() => feather.remove(), 3000);
        }
    }

    // If it's a Phenomenon answer, flash a light
    if (q.answer === "phenomenon" || q.answer === "both") {
        const flash = document.createElement("div");
        flash.style.cssText = `
            position: fixed; inset: 0; z-index: 99;
            background: radial-gradient(circle at ${cx}px ${cy}px,
                rgba(100, 180, 255, 0.15) 0%, transparent 50%);
            pointer-events: none;
            animation: flashOut 0.8s ease forwards;
        `;
        document.body.appendChild(flash);

        // Add the keyframe if it doesn't exist
        if (!document.getElementById("flash-keyframe")) {
            const style = document.createElement("style");
            style.id = "flash-keyframe";
            style.textContent = `
                @keyframes flashOut {
                    0% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        setTimeout(() => flash.remove(), 1000);
    }
}

// ---- END GAME ----
function endGame() {
    showScreen(endScreen);

    const fmScore = $("final-michael-score");
    const fpScore = $("final-phenomenon-score");
    const endTitle = $("end-title");
    const endFlavor = $("end-flavor");
    const endStats = $("end-stats");
    const napkinVerdict = $("napkin-verdict");

    fmScore.textContent = toMessyRoman(state.michaelScore);
    fpScore.textContent = toMessyRoman(state.phenomenonScore);

    // Determine winning movie
    let winnerMovie, loserMovie;
    if (state.michaelScore > state.phenomenonScore) {
        winnerMovie = "Michael";
        loserMovie = "Phenomenon";
        endTitle.textContent = "Michael Wins!";
        endFlavor.textContent = "The angel with the cookie smell and the bar dance moves has prevailed. He would've wanted it this way.";
        napkinVerdict.textContent = "michael is the better 1996 travolta movie. fight me.";
    } else if (state.phenomenonScore > state.michaelScore) {
        winnerMovie = "Phenomenon";
        loserMovie = "Michael";
        endTitle.textContent = "Phenomenon Wins!";
        endFlavor.textContent = "The genius mechanic from a small town has triumphed. George Malley would have predicted this with his mind powers.";
        napkinVerdict.textContent = "phenomenon > michael (sorry angels)";
    } else {
        winnerMovie = null;
        endTitle.textContent = "It's a Tie!";
        endFlavor.textContent = "Both movies are equally memorable (or forgettable). Travolta wins either way. Travolta always wins.";
        napkinVerdict.textContent = "tied. just like travolta would have wanted.";
    }

    // Player stats
    const p1correct = state.playerCorrectCounts[0];
    const p2correct = state.playerCorrectCounts[1];
    const p1total = Math.ceil(state.totalQuestions / 2);
    const p2total = Math.floor(state.totalQuestions / 2);

    endStats.innerHTML = `
        <div><span>${state.players[0]}</span> got ${p1correct} out of ${p1total} right</div>
        <div><span>${state.players[1]}</span> got ${p2correct} out of ${p2total} right</div>
        <div style="margin-top: 8px; font-style: italic; color: var(--text-dim);">
            (But remember — the points went to the movies, not you.)
        </div>
    `;
}

// ---- EVENT LISTENERS ----
startBtn.addEventListener("click", startGame);
nextBtn.addEventListener("click", nextQuestion);

answerMichael.addEventListener("click", () => handleAnswer("michael"));
answerPhenomenon.addEventListener("click", () => handleAnswer("phenomenon"));
answerBoth.addEventListener("click", () => handleAnswer("both"));

$("replay-btn").addEventListener("click", () => {
    showScreen(introScreen);
});

// Keyboard: Enter to start / advance
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        if (introScreen.classList.contains("active")) {
            startGame();
        } else if (gameScreen.classList.contains("active") && state.answered) {
            nextQuestion();
        }
    }
    // Number keys for answers during game
    if (gameScreen.classList.contains("active") && !state.answered) {
        if (e.key === "1") handleAnswer("michael");
        if (e.key === "2") handleAnswer("phenomenon");
        if (e.key === "3") handleAnswer("both");
    }
});
