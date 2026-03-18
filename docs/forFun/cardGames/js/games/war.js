// ===== GAME ENGINE: WAR =====
import { createDeck, shuffle, warValue, renderCard } from '../deck.js';

export const GAME_ID = 'war';
export const DISPLAY_NAME = 'War';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const DESCRIPTION = 'Highest card takes the round. Declare War on ties!';

export function initState(playerIds) {
  const deck = shuffle(createDeck());
  const perPlayer = Math.floor(deck.length / playerIds.length);
  const players = {};
  for (let i = 0; i < playerIds.length; i++) {
    players[playerIds[i]] = {
      deck: deck.slice(i * perPlayer, (i + 1) * perPlayer),
      played: null,
      warCards: [],
      wins: 0
    };
  }
  return {
    game: GAME_ID,
    phase: 'playing',
    players,
    playerOrder: playerIds,
    pot: [],
    warPot: [],
    isWar: false,
    lastWinner: null,
    message: 'Each player plays a card!',
    round: 0
  };
}

export function playCard(state, playerId) {
  const s = deepCopy(state);
  const player = s.players[playerId];
  if (!player.deck.length) return s;
  if (player.played) return s; // already played this round

  player.played = player.deck.pop();

  // Check if all have played
  const allPlayed = s.playerOrder.every(pid => s.players[pid].played !== null);
  if (allPlayed) resolveRound(s);
  return s;
}

function resolveRound(s) {
  s.round++;
  const plays = s.playerOrder.map(pid => ({ pid, card: s.players[pid].played }));
  const maxVal = Math.max(...plays.map(p => warValue(p.card.rank)));
  const winners = plays.filter(p => warValue(p.card.rank) === maxVal);

  // Collect played cards into pot
  for (const p of plays) {
    s.pot.push(p.card);
    s.players[p.pid].played = null;
  }

  if (winners.length > 1) {
    // WAR!
    s.isWar = true;
    s.warPot = [...s.pot];
    s.pot = [];
    const warPids = winners.map(w => w.pid);
    s.message = `⚔️ WAR! ${warPids.map(p => p).join(' vs ')} — Each plays 3 face-down cards!`;
    // Auto-burn 3 cards for war participants
    for (const pid of warPids) {
      const player = s.players[pid];
      const burned = player.deck.splice(-Math.min(3, player.deck.length));
      s.warPot.push(...burned);
    }
  } else {
    const winner = winners[0];
    const all = [...s.pot, ...s.warPot];
    s.players[winner.pid].deck.unshift(...shuffle(all));
    s.players[winner.pid].wins++;
    s.pot = [];
    s.warPot = [];
    s.isWar = false;
    s.lastWinner = winner.pid;
    s.message = `${winner.pid} wins ${all.length} cards! (${maxVal} high)`;
  }

  // Check game over
  const losers = s.playerOrder.filter(pid => s.players[pid].deck.length === 0);
  if (losers.length >= s.playerOrder.length - 1) {
    const champion = s.playerOrder.find(pid => s.players[pid].deck.length > 0);
    s.phase = 'done';
    s.message = `🏆 ${champion} wins the war! (${s.round} rounds played)`;
  }
}

export function getActions(state, playerId) {
  if (state.phase !== 'playing') return [];
  const player = state.players[playerId];
  if (!player || player.played) return [];
  if (!player.deck.length) return [];
  return ['play'];
}

export function renderTableView(state, container, playerNames) {
  container.innerHTML = '';

  // Round counter
  const round = document.createElement('div');
  round.style.cssText = 'text-align:center; font-size:12px; letter-spacing:2px; color:rgba(201,168,76,0.6); margin-bottom:12px; font-family:var(--font-display)';
  round.textContent = `ROUND ${state.round || 0}`;
  container.appendChild(round);

  // Battle display
  const battleArea = document.createElement('div');
  battleArea.style.cssText = 'display:flex; justify-content:center; align-items:center; gap:20px; margin-bottom:20px; flex-wrap:wrap;';

  for (const pid of state.playerOrder) {
    const player = state.players[pid];
    const name = playerNames?.[pid] || pid;
    const pArea = document.createElement('div');
    pArea.style.cssText = 'text-align:center;';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px; letter-spacing:1px; color:rgba(201,168,76,0.7); margin-bottom:8px; font-family:var(--font-display)';
    label.textContent = name.toUpperCase();
    pArea.appendChild(label);

    const cardSlot = document.createElement('div');
    cardSlot.style.cssText = 'display:flex; justify-content:center;';
    if (player.played) {
      cardSlot.appendChild(renderCard(player.played, { delay: 0 }));
    } else {
      cardSlot.innerHTML = player.deck.length ? '<div class="card-slot">?</div>' : '<div style="color:#e74c3c; font-size:24px">❌</div>';
    }
    pArea.appendChild(cardSlot);

    const cardsLeft = document.createElement('div');
    cardsLeft.style.cssText = 'font-size:10px; color:#888; margin-top:6px';
    cardsLeft.textContent = `${player.deck.length} cards`;
    pArea.appendChild(cardsLeft);

    if (state.lastWinner === pid && state.phase === 'playing') {
      const winBadge = document.createElement('div');
      winBadge.className = 'badge badge-active';
      winBadge.style.marginTop = '4px';
      winBadge.textContent = 'Won Round';
      pArea.appendChild(winBadge);
    }
    battleArea.appendChild(pArea);
  }
  container.appendChild(battleArea);
}

export function renderHandView(state, playerId, container) {
  container.innerHTML = '';
  const player = state.players?.[playerId];
  if (!player) return;

  const info = document.createElement('div');
  info.style.cssText = 'text-align:center; margin-bottom:16px;';
  info.innerHTML = `<div style="font-size:28px; font-family:var(--font-display); color:var(--gold)">${player.deck.length}</div>
    <div style="font-size:11px; letter-spacing:2px; color:rgba(201,168,76,0.6)">CARDS REMAINING</div>`;
  container.appendChild(info);

  if (player.played) {
    const playedEl = document.createElement('div');
    playedEl.style.cssText = 'text-align:center; margin-bottom:12px;';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:11px; color:#888; margin-bottom:8px; letter-spacing:1px';
    label.textContent = 'YOUR CARD';
    playedEl.appendChild(label);
    const cardRow = document.createElement('div');
    cardRow.style.cssText = 'display:flex; justify-content:center;';
    const { renderCardLarge } = window._deck;
    cardRow.appendChild(renderCardLarge(player.played));
    playedEl.appendChild(cardRow);
    container.appendChild(playedEl);
  }
  return { player };
}

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
