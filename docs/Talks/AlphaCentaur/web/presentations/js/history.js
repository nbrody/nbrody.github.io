// Snapshot undo/redo. Snapshots exclude deck.assets (append-only image bytes),
// so even image-heavy decks undo cheaply.

const LIMIT = 200;

export function createHistory(getDeck, restore) {
  let past = [], future = [], present = null, lastKey = null, lastTime = 0;
  const snap = () => {
    const { assets, ...rest } = getDeck();
    return JSON.stringify(rest);
  };
  return {
    reset() { past = []; future = []; present = snap(); lastKey = null; },
    // Record the current state. Commits sharing a key within 1.2 s merge into
    // one undo step (typing in a field, nudging with arrow keys…).
    commit(key = null) {
      const now = snap();
      if (now === present) return false;
      const t = performance.now();
      if (!(key && key === lastKey && t - lastTime < 1200)) {
        past.push(present);
        if (past.length > LIMIT) past.shift();
      }
      present = now; future = []; lastKey = key; lastTime = t;
      return true;
    },
    // Adopt the current state without creating an undo step (derived values
    // such as auto-fitted text heights).
    amend() { present = snap(); },
    undo() {
      if (!past.length) return false;
      future.push(present); present = past.pop(); lastKey = null;
      restore(JSON.parse(present));
      return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(present); present = future.pop(); lastKey = null;
      restore(JSON.parse(present));
      return true;
    },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
