// ===== DECK MODULE =====
export const SUITS = ['♠','♥','♦','♣'];
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const SUIT_NAMES = { '♠':'spades','♥':'hearts','♦':'diamonds','♣':'clubs' };
export const RED_SUITS = new Set(['♥','♦']);

/** Create a fresh 52-card deck */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle */
export function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Get numeric value of a card for blackjack */
export function blackjackValue(rank) {
  if (['J','Q','K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
}

/** Calculate blackjack hand total */
export function blackjackTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    let v = blackjackValue(c.rank);
    if (c.rank === 'A') aces++;
    total += v;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

/** Get war value of a card (A=14 high) */
export function warValue(rank) {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank);
}

/** Render a card element (face-up or face-down) */
export function renderCard(card, opts = {}) {
  const { faceDown = false, small = false, selected = false, delay = 0 } = opts;
  const el = document.createElement('div');
  el.className = 'card deal-anim' + (selected ? ' selected' : '');
  if (delay) el.style.animationDelay = delay + 'ms';

  if (faceDown || !card) {
    el.innerHTML = `<div class="card-back">🂠</div>`;
  } else {
    const isRed = RED_SUITS.has(card.suit);
    const suitClass = isRed ? 'red-suit' : 'black-suit';
    el.innerHTML = `
      <div class="card-face">
        <div class="card-tl ${suitClass}">
          <span class="rank">${card.rank}</span>
          <span class="suit-sm">${card.suit}</span>
        </div>
        <div class="card-center ${suitClass}">${card.suit}</div>
        <div class="card-br ${suitClass}">
          <span class="rank">${card.rank}</span>
          <span class="suit-sm">${card.suit}</span>
        </div>
      </div>`;
  }
  return el;
}

/** Render a compact inline card (for hand display on phone) */
export function renderCardLarge(card, opts = {}) {
  const { faceDown = false, selected = false, delay = 0 } = opts;
  const el = document.createElement('div');
  el.className = 'card deal-anim' + (selected ? ' selected' : '');
  el.style.width = '90px';
  el.style.height = '130px';
  if (delay) el.style.animationDelay = delay + 'ms';

  if (faceDown || !card) {
    el.innerHTML = `<div class="card-back" style="font-size:36px">🂠</div>`;
  } else {
    const isRed = RED_SUITS.has(card.suit);
    const suitClass = isRed ? 'red-suit' : 'black-suit';
    el.innerHTML = `
      <div class="card-face">
        <div class="card-tl ${suitClass}" style="font-size:18px">
          <span class="rank" style="font-size:20px">${card.rank}</span>
          <span class="suit-sm" style="font-size:14px">${card.suit}</span>
        </div>
        <div class="card-center ${suitClass}" style="font-size:40px">${card.suit}</div>
        <div class="card-br ${suitClass}" style="font-size:18px">
          <span class="rank" style="font-size:20px">${card.rank}</span>
          <span class="suit-sm" style="font-size:14px">${card.suit}</span>
        </div>
      </div>`;
  }
  return el;
}
