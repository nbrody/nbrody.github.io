/* ===== Matching Game for Toddlers ===== */

const ITEMS = [
    { id: 'bear', name: 'Bear', src: 'images/bear.png' },
    { id: 'bunny', name: 'Bunny', src: 'images/bunny.png' },
    { id: 'elephant', name: 'Elephant', src: 'images/elephant.png' },
    { id: 'cat', name: 'Cat', src: 'images/cat.png' },
    { id: 'puppy', name: 'Puppy', src: 'images/puppy.png' },
    { id: 'penguin', name: 'Penguin', src: 'images/penguin.png' },
    { id: 'piano', name: 'Piano', src: 'images/piano.png' },
    { id: 'drums', name: 'Drums', src: 'images/drums.png' },
    { id: 'guitar', name: 'Guitar', src: 'images/guitar.png' },
    { id: 'trumpet', name: 'Trumpet', src: 'images/trumpet.png' },
];

// How many pairs to use (6 pairs = 12 cards)
const NUM_PAIRS = 6;

/* ===== Audio via Web Audio API ===== */
let audioCtx = null;

function ensureAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
    ensureAudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function playSelectSound() {
    playTone(523, 0.15, 'sine', 0.12);  // C5
}

function playFlipSound() {
    playTone(392, 0.1, 'sine', 0.08);  // G4 — subtle flip
}

function playMatchSound() {
    // Happy ascending arpeggio
    playTone(523, 0.2, 'sine', 0.12);   // C5
    setTimeout(() => playTone(659, 0.2, 'sine', 0.12), 100); // E5
    setTimeout(() => playTone(784, 0.3, 'sine', 0.15), 200); // G5
}

function playWrongSound() {
    playTone(220, 0.25, 'triangle', 0.08); // gentle low tone
}

function playVictorySound() {
    const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
    notes.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 0.3, 'sine', 0.1), i * 100);
    });
}

/* ===== State ===== */
let cards = [];
let selected = null;       // Currently selected card element (easy mode)
let flippedCards = [];     // Currently flipped cards (hard mode, max 2)
let isProcessing = false;  // Lock during animations
let matchCount = 0;
let totalPairs = 0;
let stars = 0;
let gameMode = 'easy';     // 'easy' or 'hard'

/* ===== DOM refs ===== */
const board = document.getElementById('game-board');
const starCounter = document.getElementById('star-counter');
const toyBox = document.getElementById('toy-box');
const boxItems = document.getElementById('box-items');
const victoryScreen = document.getElementById('victory-screen');
const subtitleText = document.getElementById('subtitle-text');

/* ===== Mode picker ===== */
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const newMode = btn.dataset.mode;
        if (newMode === gameMode) return;
        gameMode = newMode;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        initGame();
    });
});

/* ===== Init ===== */
function initGame() {
    // Reset state
    selected = null;
    flippedCards = [];
    isProcessing = false;
    matchCount = 0;
    stars = 0;
    starCounter.textContent = '';
    board.innerHTML = '';
    boxItems.innerHTML = '';
    victoryScreen.classList.remove('show');

    // Update subtitle based on mode
    if (gameMode === 'hard') {
        subtitleText.textContent = 'Flip two cards — find the pairs!';
    } else {
        subtitleText.textContent = 'Tap two that look the same!';
    }

    // Pick random items for this round
    const shuffledItems = [...ITEMS].sort(() => Math.random() - 0.5);
    const chosen = shuffledItems.slice(0, NUM_PAIRS);
    totalPairs = NUM_PAIRS;

    // Create pairs
    cards = [];
    chosen.forEach(item => {
        cards.push({ ...item, uid: item.id + '_a' });
        cards.push({ ...item, uid: item.id + '_b' });
    });

    // Shuffle cards
    shuffle(cards);

    // Set grid columns
    const numCards = cards.length;
    board.className = '';
    if (numCards <= 6) {
        board.classList.add('cols-3');
    } else if (numCards <= 12) {
        board.classList.add('cols-4');
    } else {
        board.classList.add('cols-5');
    }

    // Render cards with staggered entrance
    cards.forEach((card, index) => {
        const el = createCardElement(card);
        el.style.animationDelay = `${index * 0.07}s`;
        el.classList.add('entering');
        board.appendChild(el);
    });
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = card.id;
    el.dataset.uid = card.uid;
    el.id = `card-${card.uid}`;

    // In hard mode, add flip classes
    if (gameMode === 'hard') {
        el.classList.add('hard-mode');
    }

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const img = document.createElement('img');
    img.src = card.src;
    img.alt = card.name;
    img.draggable = false;

    inner.appendChild(img);
    el.appendChild(inner);

    // Card back (visible in hard mode when face-down)
    if (gameMode === 'hard') {
        const back = document.createElement('div');
        back.className = 'card-back';
        back.textContent = '❓';
        el.appendChild(back);
    }

    // Touch + click handler
    el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (gameMode === 'hard') {
            onCardTapHard(el);
        } else {
            onCardTap(el);
        }
    });

    return el;
}

/* ===== Card Tap Handler — EASY MODE ===== */
function onCardTap(el) {
    if (isProcessing) return;
    if (el.classList.contains('matched')) return;

    ensureAudioCtx();

    // If tapping the same card, deselect
    if (selected === el) {
        el.classList.remove('selected');
        selected = null;
        return;
    }

    // First selection
    if (!selected) {
        selected = el;
        el.classList.add('selected', 'wobble');
        playSelectSound();
        setTimeout(() => el.classList.remove('wobble'), 400);
        return;
    }

    // Second selection — check match
    const firstId = selected.dataset.id;
    const secondId = el.dataset.id;

    el.classList.add('selected');
    playSelectSound();

    if (firstId === secondId) {
        // Match found!
        handleMatch(selected, el);
    } else {
        // No match
        handleNoMatch(selected, el);
    }
}

/* ===== Card Tap Handler — HARD MODE ===== */
function onCardTapHard(el) {
    if (isProcessing) return;
    if (el.classList.contains('matched')) return;
    if (el.classList.contains('flipped')) return; // already face-up
    if (flippedCards.length >= 2) return;

    ensureAudioCtx();
    playFlipSound();

    // Flip the card face-up
    el.classList.add('flipped');
    flippedCards.push(el);

    // If two cards are now flipped, check for match
    if (flippedCards.length === 2) {
        isProcessing = true;
        const [card1, card2] = flippedCards;

        if (card1.dataset.id === card2.dataset.id) {
            // Match!
            handleMatchHard(card1, card2);
        } else {
            // No match — flip back after a delay
            handleNoMatchHard(card1, card2);
        }
    }
}

/* ===== Match — EASY MODE ===== */
function handleMatch(card1, card2) {
    isProcessing = true;
    matchCount++;
    stars++;
    updateStars();

    setTimeout(() => {
        playMatchSound();
        createSparkles(card1);
        createSparkles(card2);
    }, 100);

    // After a brief highlight, fly both cards to the toy box
    setTimeout(() => {
        card1.classList.remove('selected');
        card2.classList.remove('selected');

        // Fly card 1, then card 2 (staggered)
        flyCardToBox(card1, 0);
        flyCardToBox(card2, 150);

        // After both cards land, update toy box and check victory
        const totalFlyTime = 150 + 700 + 100; // stagger + transition + buffer
        setTimeout(() => {
            // Add thumbnail to toy box
            toyBox.classList.add('receiving');
            setTimeout(() => toyBox.classList.remove('receiving'), 600);

            const itemImg = document.createElement('img');
            itemImg.src = card1.querySelector('img').src;
            itemImg.alt = card1.dataset.id;
            boxItems.appendChild(itemImg);

            isProcessing = false;
            selected = null;

            if (matchCount >= totalPairs) {
                showVictory();
            }
        }, totalFlyTime);
    }, 300);
}

/* ===== Match — HARD MODE ===== */
function handleMatchHard(card1, card2) {
    matchCount++;
    stars++;
    updateStars();

    setTimeout(() => {
        playMatchSound();
        createSparkles(card1);
        createSparkles(card2);
    }, 300);

    // Mark as matched — they shrink/fade away
    setTimeout(() => {
        card1.classList.add('matched');
        card2.classList.add('matched');

        // Add to toy box
        toyBox.classList.add('receiving');
        setTimeout(() => toyBox.classList.remove('receiving'), 600);

        const itemImg = document.createElement('img');
        itemImg.src = card1.querySelector('img').src;
        itemImg.alt = card1.dataset.id;
        boxItems.appendChild(itemImg);

        flippedCards = [];
        isProcessing = false;

        if (matchCount >= totalPairs) {
            showVictory();
        }
    }, 700);
}

/* ===== No Match — EASY MODE ===== */
function handleNoMatch(card1, card2) {
    isProcessing = true;

    setTimeout(() => {
        playWrongSound();
        card1.classList.add('shake');
        card2.classList.add('shake');

        setTimeout(() => {
            card1.classList.remove('selected', 'shake');
            card2.classList.remove('selected', 'shake');
            isProcessing = false;
            selected = null;
        }, 600);
    }, 300);
}

/* ===== No Match — HARD MODE ===== */
function handleNoMatchHard(card1, card2) {
    // Let the player see both cards for a moment
    setTimeout(() => {
        playWrongSound();
        card1.classList.add('shake');
        card2.classList.add('shake');

        setTimeout(() => {
            card1.classList.remove('flipped', 'shake');
            card2.classList.remove('flipped', 'shake');
            flippedCards = [];
            isProcessing = false;
        }, 700);
    }, 800);
}

/* ===== Fly a card to the toy box (EASY mode only) ===== */
function flyCardToBox(card, delay) {
    const cardRect = card.getBoundingClientRect();
    const boxRect = toyBox.getBoundingClientRect();

    // Create a fixed-position clone
    const clone = document.createElement('div');
    clone.className = 'card-flying';

    const inner = document.createElement('div');
    inner.className = 'card-inner';
    const img = document.createElement('img');
    img.src = card.querySelector('img').src;
    img.alt = card.dataset.id;
    img.draggable = false;
    inner.appendChild(img);
    clone.appendChild(inner);

    // Position clone exactly where the card is
    clone.style.left = `${cardRect.left}px`;
    clone.style.top = `${cardRect.top}px`;
    clone.style.width = `${cardRect.width}px`;
    clone.style.height = `${cardRect.height}px`;
    clone.style.transform = 'scale(1) rotate(0deg)';
    clone.style.opacity = '1';

    document.body.appendChild(clone);

    // Hide the real card
    card.classList.add('matched');

    // Target: center of the toy box, shrunk to a small size
    const targetSize = 44;
    const targetLeft = boxRect.left + boxRect.width / 2 - targetSize / 2;
    const targetTop = boxRect.top + boxRect.height / 2 - targetSize / 2;

    setTimeout(() => {
        // First: pop up slightly
        clone.style.transform = 'scale(1.15) rotate(-5deg)';

        // Then fly to box
        setTimeout(() => {
            clone.style.left = `${targetLeft}px`;
            clone.style.top = `${targetTop}px`;
            clone.style.width = `${targetSize}px`;
            clone.style.height = `${targetSize}px`;
            clone.style.transform = 'scale(1) rotate(360deg)';
            clone.style.opacity = '0.6';
        }, 120);

        // Remove clone after transition completes
        setTimeout(() => {
            clone.remove();
        }, 120 + 750);
    }, delay);
}

/* ===== Stars ===== */
function updateStars() {
    starCounter.textContent = '⭐'.repeat(stars);
}

/* ===== Sparkles ===== */
function createSparkles(card) {
    const rect = card.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'sparkle';
        sparkle.style.left = `${rect.left + Math.random() * rect.width}px`;
        sparkle.style.top = `${rect.top + Math.random() * rect.height}px`;
        sparkle.style.position = 'fixed';
        document.body.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 700);
    }
}

/* ===== Victory ===== */
function showVictory() {
    setTimeout(() => {
        victoryScreen.classList.add('show');
        playVictorySound();
        launchConfetti();
    }, 400);
}

function launchConfetti() {
    const colors = ['#ab47bc', '#42a5f5', '#66bb6a', '#ff7043', '#ffca28', '#ec407a', '#7c4dff'];
    for (let i = 0; i < 60; i++) {
        setTimeout(() => {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = `${Math.random() * 100}vw`;
            piece.style.top = `${-10 - Math.random() * 20}px`;
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.width = `${8 + Math.random() * 10}px`;
            piece.style.height = `${8 + Math.random() * 10}px`;
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '3px';
            piece.style.animationDuration = `${2 + Math.random() * 2}s`;
            piece.style.animationDelay = `0s`;
            document.body.appendChild(piece);
            setTimeout(() => piece.remove(), 4000);
        }, i * 40);
    }
}

/* ===== Play Again ===== */
document.getElementById('play-again-btn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initGame();
});

/* ===== Prevent unwanted gestures ===== */
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend', e => e.preventDefault());

// Prevent double-tap zoom on iOS
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

/* ===== Start! ===== */
initGame();
