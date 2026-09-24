// Keyboard controls for development and rehearsal.
// Performance just lets it play — no input needed.

export function setupInput(h) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    switch (e.code) {
      case 'Space': e.preventDefault(); h.onTogglePause(); return;
      case 'ArrowRight': e.preventDefault(); e.shiftKey ? h.onScrub(10) : h.onNext(); return;
      case 'ArrowLeft': e.preventDefault(); e.shiftKey ? h.onScrub(-10) : h.onPrev(); return;
      case 'Period': h.onScrub(1); return;
      case 'Comma': h.onScrub(-1); return;
      case 'BracketRight': h.onSpeed(2); return;
      case 'BracketLeft': h.onSpeed(0.5); return;
      default: break;
    }

    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) { h.onJump(n - 1); return; }
    }

    switch (e.key.toLowerCase()) {
      case 'h': h.onToggleHud(); break;
      case 'f': h.onToggleFullscreen(); break;
      case 'c': h.onToggleCaptions(); break;
      case 't': h.onTap(); break;
      case 'r': h.onRestart(); break;
      default: break;
    }
  });
}
