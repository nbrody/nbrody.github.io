// main.js — Walkthrough controller + canvas integration
import { HypCanvas } from './canvas.js';
import { computeGamma0Data, conjugatingElement } from './arithmetic.js';
import { S, T } from './hyperbolic.js';

// ============================================================
// Canvas renderer
// ============================================================
const canvas = document.getElementById('canvas');
const renderer = new HypCanvas(canvas);

// ============================================================
// Prime selector
// ============================================================
const primeSelect = document.getElementById('prime-select');
const primeSelectExplore = document.getElementById('prime-select-explore');
let currentPrime = parseInt(primeSelect.value);
let groupData = computeGamma0Data(currentPrime);
renderer.setGroupData(groupData);

function onPrimeChange(newPrime) {
    currentPrime = newPrime;
    groupData = computeGamma0Data(currentPrime);
    renderer.setGroupData(groupData);
    updateBadge();
    updateDynamicMath();

    // Sync both selectors
    primeSelect.value = currentPrime;
    if (primeSelectExplore) primeSelectExplore.value = currentPrime;

    // Re-fit viewport if on a relevant slide
    const canvasMode = slides[currentSlide].dataset.canvas;
    if (['gamma0-domain', 'cusps', 'cutting', 'conjugation', 'explore'].includes(canvasMode)) {
        renderer.fitToGamma0(groupData);
    }
}

primeSelect.addEventListener('change', () => onPrimeChange(parseInt(primeSelect.value)));
if (primeSelectExplore) {
    primeSelectExplore.addEventListener('change', () => onPrimeChange(parseInt(primeSelectExplore.value)));
}

function updateBadge() {
    document.getElementById('group-name-badge').textContent =
        `Γ₀(${2 * currentPrime})`;
}

function updateDynamicMath() {
    document.querySelectorAll('.dynamic-p').forEach(el => {
        el.textContent = currentPrime;
    });
    document.querySelectorAll('.dynamic-2p').forEach(el => {
        el.textContent = 2 * currentPrime;
    });

    // Index display
    const idx = groupData.index;
    const idxEl = document.getElementById('index-display');
    const idxEl2 = document.getElementById('index-display-2');
    if (idxEl) idxEl.textContent = idx;
    if (idxEl2) idxEl2.textContent = idx;

    // Width sum
    const wsEl = document.getElementById('width-sum');
    if (wsEl) wsEl.textContent = idx;

    // g matrix entry: -2(p+2)
    const gEntry = document.getElementById('g-entry');
    if (gEntry) gEntry.textContent = -2 * (currentPrime + 2);

    // Re-typeset MathJax
    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}

// ============================================================
// Slide system
// ============================================================
const slides = document.querySelectorAll('.slide');
const totalSlides = slides.length;
let currentSlide = 0;

const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const dotsContainer = document.getElementById('progress-dots');

// Build progress dots
for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement('button');
    dot.className = 'progress-dot' + (i === 0 ? ' active' : '');
    dot.dataset.slide = i;
    dot.title = `Slide ${i + 1}`;
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
}

function goToSlide(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide) return;

    const prevSlideEl = slides[currentSlide];
    const nextSlideEl = slides[index];
    const goingForward = index > currentSlide;

    // Exit current slide
    resetSlideAnimations(prevSlideEl);
    prevSlideEl.classList.remove('active');
    const exitClass = goingForward ? 'exit-up' : 'exit-down';
    prevSlideEl.classList.add(exitClass);
    setTimeout(() => prevSlideEl.classList.remove(exitClass), 600);

    // Enter new slide
    const entryClass = goingForward ? 'enter-from-below' : 'enter-from-above';
    nextSlideEl.classList.add(entryClass);
    void nextSlideEl.offsetHeight; // force reflow
    nextSlideEl.classList.remove(entryClass);
    nextSlideEl.classList.add('active');

    currentSlide = index;

    // Update nav
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;

    // Update dots
    document.querySelectorAll('.progress-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
        if (i < currentSlide) d.classList.add('visited');
    });

    // Sync canvas
    onSlideActivated(currentSlide);

    // Trigger animations
    setTimeout(() => triggerSlideAnimations(nextSlideEl), 250);

    // Re-typeset MathJax
    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}

prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

// Keyboard navigation
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToSlide(currentSlide + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToSlide(currentSlide - 1);
    }
});

// ============================================================
// Slide animations
// ============================================================
function triggerSlideAnimations(slideEl) {
    slideEl.querySelectorAll('.reveal-list li').forEach((li, i) => {
        setTimeout(() => li.classList.add('visible'), i * 200);
    });
    slideEl.querySelectorAll('.stagger').forEach(el => el.classList.add('visible'));
    slideEl.querySelectorAll('.fade-in').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 150);
    });
}

function resetSlideAnimations(slideEl) {
    slideEl.querySelectorAll('.reveal-list li').forEach(li => li.classList.remove('visible'));
    slideEl.querySelectorAll('.stagger').forEach(el => el.classList.remove('visible'));
    slideEl.querySelectorAll('.fade-in').forEach(el => el.classList.remove('visible'));
}

// ============================================================
// Slide-canvas syncing
// ============================================================
function onSlideActivated(slideIndex) {
    const slide = slides[slideIndex];
    const canvasMode = slide.dataset.canvas;
    renderer.mode = canvasMode;

    switch (canvasMode) {
        case 'intro':
            renderer.showFarey = true;
            renderer.showDomain = false;
            renderer.showCusps = false;
            renderer.showCurves = false;
            renderer.showCosetTranslates = false;
            renderer.centerX = 0.5;
            renderer.scale = 250;
            break;

        case 'psl2z-tiling':
            renderer.showFarey = true;
            renderer.showDomain = true;
            renderer.showCusps = false;
            renderer.showCurves = false;
            renderer.showCosetTranslates = false;
            renderer.centerX = 0;
            renderer.scale = 250;
            break;

        case 'gamma0-domain':
            renderer.showFarey = true;
            renderer.showDomain = true;
            renderer.showCusps = false;
            renderer.showCurves = false;
            renderer.showCosetTranslates = true;
            renderer.fitToGamma0(groupData);
            break;

        case 'cusps':
            renderer.showFarey = true;
            renderer.showDomain = true;
            renderer.showCusps = true;
            renderer.showCurves = false;
            renderer.showCosetTranslates = true;
            renderer.fitToGamma0(groupData);
            break;

        case 'cutting':
            renderer.showFarey = true;
            renderer.showDomain = true;
            renderer.showCusps = true;
            renderer.showCurves = true;
            renderer.showCosetTranslates = true;
            renderer.fitToGamma0(groupData);
            break;

        case 'conjugation':
            renderer.showFarey = true;
            renderer.showDomain = true;
            renderer.showCusps = true;
            renderer.showCurves = true;
            renderer.showCosetTranslates = true;
            renderer.fitToGamma0(groupData);
            break;

        case 'explore':
            renderer.showFarey = true;
            renderer.showDomain = true;
            renderer.showCusps = true;
            renderer.showCurves = true;
            renderer.showCosetTranslates = true;
            renderer.fitToGamma0(groupData);
            break;
    }

    // Show/hide generator bar
    const genBar = document.getElementById('gen-bar');
    if (['psl2z-tiling', 'conjugation'].includes(canvasMode)) {
        genBar.classList.add('visible');
    } else {
        genBar.classList.remove('visible');
    }

    updateGeneratorButtons(canvasMode);
}

// ============================================================
// Generator buttons
// ============================================================
function updateGeneratorButtons(mode) {
    const container = document.getElementById('gen-bar');
    container.innerHTML = '';

    if (mode === 'psl2z-tiling') {
        makeGenButton(container, 'T', T, 0);
        makeGenButton(container, 'S', S, 1);
    } else if (mode === 'conjugation') {
        const g = conjugatingElement(currentPrime);
        makeGenButton(container, 'g', g, 2);
    }
}

function makeGenButton(container, label, matrix, colorIdx) {
    const btn = document.createElement('button');
    btn.className = 'gen-btn';
    btn.dataset.gen = String(colorIdx % 4);
    btn.textContent = label;
    btn.title = `Apply ${label}`;
    btn.addEventListener('click', () => {
        renderer.animateTransformation(matrix, colorIdx);
        document.getElementById('anim-status').textContent = `Applying ${label}...`;
        setTimeout(() => {
            document.getElementById('anim-status').textContent = '';
        }, renderer.animDuration + 200);
    });
    container.appendChild(btn);
}

// ============================================================
// Display settings (explore slide)
// ============================================================
const showFarey = document.getElementById('show-farey');
const showTranslates = document.getElementById('show-translates');
const showCusps = document.getElementById('show-cusps');
const showCurves = document.getElementById('show-curves');

if (showFarey) showFarey.addEventListener('change', e => { renderer.showFarey = e.target.checked; });
if (showTranslates) showTranslates.addEventListener('change', e => { renderer.showCosetTranslates = e.target.checked; });
if (showCusps) showCusps.addEventListener('change', e => { renderer.showCusps = e.target.checked; });
if (showCurves) showCurves.addEventListener('change', e => { renderer.showCurves = e.target.checked; });

// ============================================================
// Reset view button
// ============================================================
document.getElementById('reset-view-btn').addEventListener('click', () => {
    const canvasMode = slides[currentSlide].dataset.canvas;
    if (['gamma0-domain', 'cusps', 'cutting', 'conjugation', 'explore'].includes(canvasMode)) {
        renderer.fitToGamma0(groupData);
    } else {
        renderer.resetView();
    }
});

// ============================================================
// Initialize
// ============================================================
updateBadge();
updateDynamicMath();

// Initial slide animation
setTimeout(() => triggerSlideAnimations(slides[0]), 300);

// Typeset MathJax
setTimeout(() => {
    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}, 500);
