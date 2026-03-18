/* ============================================================
   Navigation — Slide transitions, keyboard & button controls,
   mobile tab switching, and swipe navigation
   ============================================================ */

const TOTAL_SLIDES = 6;

let currentSlide = 0;
const visited = new Set([0]);

const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.progress-dot');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

let onChangeCallback = null;

export function getCurrentSlide() {
    return currentSlide;
}

export function onSlideChange(cb) {
    onChangeCallback = cb;
}

function goToSlide(n, direction = null) {
    if (n < 0 || n >= TOTAL_SLIDES || n === currentSlide) return;
    const dir = direction || (n > currentSlide ? 'down' : 'up');

    // Exit current
    const curSlide = slides[currentSlide];
    curSlide.classList.remove('active');
    curSlide.classList.add(dir === 'down' ? 'exit-up' : 'exit-down');

    // Enter new
    const newSlide = slides[n];
    newSlide.classList.remove('exit-up', 'exit-down');
    newSlide.classList.add(dir === 'down' ? 'enter-from-below' : 'enter-from-above');

    // Force reflow
    void newSlide.offsetHeight;

    newSlide.classList.remove('enter-from-below', 'enter-from-above');
    newSlide.classList.add('active');

    // Clean up old slide after transition
    setTimeout(() => {
        curSlide.classList.remove('exit-up', 'exit-down');
    }, 600);

    // Stagger children
    newSlide.querySelectorAll('.stagger').forEach(el => {
        el.classList.remove('visible');
        setTimeout(() => el.classList.add('visible'), 100);
    });

    visited.add(n);
    currentSlide = n;
    updateNav();
    if (onChangeCallback) onChangeCallback(n);
}

function updateNav() {
    btnPrev.disabled = currentSlide === 0;
    btnNext.disabled = currentSlide === TOTAL_SLIDES - 1;
    dots.forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
        d.classList.toggle('visited', visited.has(i) && i !== currentSlide);
    });
}

// ─── Mobile: Tab Switching ───────────────────────────────
function initMobileTabs() {
    const tabRead = document.getElementById('tab-read');
    const tabPlay = document.getElementById('tab-play');
    const walkthrough = document.getElementById('walkthrough');
    const canvasContainer = document.getElementById('canvas-container');

    if (!tabRead || !tabPlay) return;

    function switchToPanel(panel) {
        if (panel === 'read') {
            tabRead.classList.add('active');
            tabPlay.classList.remove('active');
            walkthrough.classList.remove('mobile-hidden');
            canvasContainer.classList.add('mobile-hidden');
        } else {
            tabPlay.classList.add('active');
            tabRead.classList.remove('active');
            canvasContainer.classList.remove('mobile-hidden');
            walkthrough.classList.add('mobile-hidden');
            // Trigger canvas resize after panel becomes visible
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        }
    }

    tabRead.addEventListener('click', () => switchToPanel('read'));
    tabPlay.addEventListener('click', () => switchToPanel('play'));

    // Start on "read" view on mobile
    if (window.innerWidth <= 768) {
        switchToPanel('read');
    }
}

// ─── Mobile: Swipe Navigation ────────────────────────────
function initSwipeNav() {
    const walkthrough = document.getElementById('walkthrough');
    if (!walkthrough) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    walkthrough.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    walkthrough.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        const dt = Date.now() - touchStartTime;

        // Must be a quick, mostly-horizontal swipe
        if (dt > 500) return;
        if (Math.abs(dy) > Math.abs(dx)) return;
        if (Math.abs(dx) < 50) return;

        if (dx < 0) {
            // Swipe left → next slide
            goToSlide(currentSlide + 1);
        } else {
            // Swipe right → prev slide
            goToSlide(currentSlide - 1);
        }
    }, { passive: true });
}

export function init() {
    btnPrev.addEventListener('click', () => goToSlide(currentSlide - 1));
    btnNext.addEventListener('click', () => goToSlide(currentSlide + 1));
    dots.forEach(d => d.addEventListener('click', () => goToSlide(+d.dataset.slide)));

    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            goToSlide(currentSlide + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            goToSlide(currentSlide - 1);
        }
    });

    initMobileTabs();
    initSwipeNav();
    updateNav();
}

