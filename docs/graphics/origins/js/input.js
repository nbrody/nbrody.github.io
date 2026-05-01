// Keyboard controls for development and rehearsal.
// Performance just lets it play — no input needed.

export function setupInput({
  onTogglePause,
  onNext,
  onPrev,
  onJump,
  onToggleHud,
  onToggleFullscreen,
}) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;

    if (e.code === 'Space') {
      e.preventDefault();
      onTogglePause();
      return;
    }

    if (e.code === 'ArrowRight') { onNext(); return; }
    if (e.code === 'ArrowLeft')  { onPrev(); return; }

    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) { onJump(n - 1); return; }
    }

    switch (e.key.toLowerCase()) {
      case 'h': onToggleHud(); break;
      case 'f': onToggleFullscreen(); break;
    }
  });
}
