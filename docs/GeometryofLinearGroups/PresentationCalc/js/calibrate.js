/**
 * calibrate.js — how fast this thread runs JavaScript now, by a small fixed loop.
 *
 * The browser may run a page's workers several times slower than its main thread, for instance
 * while the page is in the background (Chromium on macOS then gives worker threads low priority,
 * on the efficiency cores). The page times this loop on its main thread and passes the time to
 * the FlashBeam worker, which times it again as it goes: the ratio is how much slower the worker
 * runs, and its time budget is counted in full-speed seconds (sarithWorker.js).
 */
let sink = 0;

/** The loop's time in ms, best of three. */
export function calibrationMs() {
    let best = Infinity, s = 0;
    for (let r = 0; r < 3; r++) {
        const t = performance.now();
        for (let i = 0; i < 500000; i++) s = (s + i * 7) % 1000003;
        best = Math.min(best, performance.now() - t);
    }
    sink = s;
    return best;
}

/** The loop's time after warming up (the optimizing compiler has seen it), best of several. */
export function referenceMs() {
    let best = Infinity;
    for (let i = 0; i < 8; i++) best = Math.min(best, calibrationMs());
    return best + 0 * sink;
}
