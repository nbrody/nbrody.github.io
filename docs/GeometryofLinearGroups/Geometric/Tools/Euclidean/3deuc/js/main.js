// main.js — 3D Euclidean Groups walkthrough controller
import { Renderer3D } from './renderer3d.js';
import { groups3D, getGroup3DById, getExceptionalGroups } from './groups3d.js';

// ============================================================
// 3D Renderer
// ============================================================
const canvas = document.getElementById('three-canvas');
const renderer = new Renderer3D(canvas);
let currentGroup = null;

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

// Initial slide
slides[0].classList.add('active');

function goToSlide(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide) return;

    const prevSlide = slides[currentSlide];
    const nextSlideEl = slides[index];
    const goingForward = index > currentSlide;

    // Exit current slide
    resetSlideAnimations(prevSlide);
    prevSlide.classList.remove('active');
    const exitClass = goingForward ? 'exit-up' : 'exit-down';
    prevSlide.classList.add(exitClass);
    setTimeout(() => prevSlide.classList.remove(exitClass), 600);

    // Enter new slide
    const entryClass = goingForward ? 'enter-from-below' : 'enter-from-above';
    nextSlideEl.classList.add(entryClass);
    void nextSlideEl.offsetHeight;
    nextSlideEl.classList.remove(entryClass);
    nextSlideEl.classList.add('active');

    currentSlide = index;

    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;

    document.querySelectorAll('.progress-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
        if (i < currentSlide) d.classList.add('visited');
    });

    onSlideActivated(currentSlide);
    setTimeout(() => triggerSlideAnimations(nextSlideEl), 250);

    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}

prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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

setTimeout(() => triggerSlideAnimations(slides[0]), 300);

// ============================================================
// Slide → 3D scene syncing
// ============================================================
function onSlideActivated(slideIndex) {
    const canvasMode = slides[slideIndex].dataset.canvas;

    // Hide gen-bar by default
    const genBar = document.getElementById('gen-bar');
    if (genBar) genBar.classList.remove('visible');

    switch (canvasMode) {
        case 'intro':
            selectGroup('I');
            renderer.setMode('polyhedron');
            renderer.controls.autoRotate = true;
            break;
        case 'so3':
            selectGroup('O');
            renderer.setMode('polyhedron');
            renderer.controls.autoRotate = true;
            showGenBar();
            break;
        case 'finite':
            selectGroup('T');
            renderer.setMode('polyhedron');
            renderer.controls.autoRotate = false;
            showGenBar();
            break;
        case 'o3':
            selectGroup('O');
            renderer.setMode('polyhedron');
            renderer.controls.autoRotate = true;
            break;
        case 'crystal':
            selectGroup('O');
            renderer.setMode('tiling');
            renderer.controls.autoRotate = true;
            break;
        case 'bravais':
            selectGroup('O');
            renderer.setMode('tiling');
            renderer.controls.autoRotate = true;
            break;
        case 'space':
            selectGroup('T');
            renderer.setMode('tiling');
            renderer.controls.autoRotate = true;
            break;
        case 'explore':
            renderer.controls.autoRotate = false;
            showGenBar();
            break;
    }
}

// ============================================================
// Group selection
// ============================================================
function selectGroup(id) {
    const group = getGroup3DById(id);
    if (!group) return;
    currentGroup = group;

    renderer.setGroup(group);
    document.getElementById('group-name-badge').textContent =
        `${group.name} — ${group.fullName}`;
    updateAxisButtons();

    // Update gallery chips
    document.querySelectorAll('.group-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.groupId === id);
    });
}

// ============================================================
// Generator / Axis buttons (floating on canvas)
// ============================================================
function showGenBar() {
    const genBar = document.getElementById('gen-bar');
    if (!genBar) return;
    genBar.classList.add('visible');
}

function updateAxisButtons() {
    const genBar = document.getElementById('gen-bar');
    if (!genBar) return;
    genBar.innerHTML = '';

    if (!currentGroup || !currentGroup.axes) return;

    // Collect unique axis orders
    const orders = [...new Set(currentGroup.axes.map(a => a.order))].sort((a, b) => b - a);

    const AXIS_LABELS = { 2: 'C₂', 3: 'C₃', 4: 'C₄', 5: 'C₅' };
    const AXIS_HEX = { 2: '#22c55e', 3: '#f59e0b', 4: '#60a5fa', 5: '#f472b6' };

    for (const order of orders) {
        const axes = currentGroup.axes.filter(a => a.order === order);
        const btn = document.createElement('button');
        btn.className = 'gen-btn';
        btn.textContent = `${AXIS_LABELS[order] || 'C' + order} (×${axes.length})`;
        btn.style.borderColor = AXIS_HEX[order] || '#888';
        btn.style.color = AXIS_HEX[order] || '#888';

        btn.addEventListener('click', () => {
            // Rotate about a random axis of this order
            const axis = axes[Math.floor(Math.random() * axes.length)];
            const angle = (2 * Math.PI) / axis.order;
            renderer.animateRotation(axis.dir, angle);
            flashStatus(`Rotating 2π/${axis.order} about ${axis.label}`);
        });

        genBar.appendChild(btn);
    }

    // Tiling toggle
    const tilingBtn = document.createElement('button');
    tilingBtn.className = 'gen-btn';
    tilingBtn.textContent = renderer.mode === 'tiling' ? '◆ Solid' : '⬡ Tiling';
    tilingBtn.style.borderColor = '#a78bfa';
    tilingBtn.style.color = '#a78bfa';
    tilingBtn.addEventListener('click', () => {
        if (renderer.mode === 'tiling') {
            renderer.setMode('polyhedron');
            tilingBtn.textContent = '⬡ Tiling';
        } else {
            renderer.setMode('tiling');
            tilingBtn.textContent = '◆ Solid';
        }
    });
    genBar.appendChild(tilingBtn);
}

// ============================================================
// Animation status flash
// ============================================================
function flashStatus(text) {
    const status = document.getElementById('anim-status');
    if (!status) return;
    status.textContent = text;
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 1800);
}

// Wire up axis click callback from renderer
renderer.onAxisClicked = (axis) => {
    flashStatus(`${axis.label} rotation (order ${axis.order})`);
};

// ============================================================
// Gallery
// ============================================================
function populateSO3Gallery() {
    const container = document.getElementById('so3-gallery');
    if (!container) return;

    const exceptional = getExceptionalGroups();
    for (const group of exceptional) {
        const chip = document.createElement('button');
        chip.className = 'group-chip';
        chip.dataset.groupId = group.id;
        chip.innerHTML = `<strong>${group.name}</strong><span>${group.polyhedron?.name || ''}</span>`;
        chip.addEventListener('click', () => selectGroup(group.id));
        container.appendChild(chip);
    }

    // Add cyclic/dihedral groups too
    for (const group of groups3D.filter(g => g.category === 'cyclic' || g.category === 'dihedral')) {
        const chip = document.createElement('button');
        chip.className = 'group-chip small';
        chip.dataset.groupId = group.id;
        chip.textContent = group.name;
        chip.addEventListener('click', () => selectGroup(group.id));
        container.appendChild(chip);
    }
}

// ============================================================
// Settings
// ============================================================
const showAxesCb = document.getElementById('show-axes');
const showWireCb = document.getElementById('show-wireframe');
const showSymCb = document.getElementById('show-sym-axes');
const opacitySlider = document.getElementById('opacity-slider');

if (showAxesCb) showAxesCb.addEventListener('change', () => {
    // coordinate axes toggle
});
if (showSymCb) showSymCb.addEventListener('change', () => {
    renderer.showAxes = showSymCb.checked;
});
if (opacitySlider) opacitySlider.addEventListener('input', () => {
    renderer.setOpacity(parseInt(opacitySlider.value) / 100);
});

// ============================================================
// Canvas controls
// ============================================================
document.getElementById('reset-view-btn').addEventListener('click', () => {
    renderer.resetView();
});

window.addEventListener('resize', () => renderer.resize());

// ============================================================
// Initialize
// ============================================================
populateSO3Gallery();

selectGroup('I');
renderer.controls.autoRotate = true;

setTimeout(() => {
    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}, 500);
