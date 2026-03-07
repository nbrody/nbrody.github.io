/* ============================================================
   Navigation — Slide transitions, keyboard & button controls
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

    updateNav();
}
