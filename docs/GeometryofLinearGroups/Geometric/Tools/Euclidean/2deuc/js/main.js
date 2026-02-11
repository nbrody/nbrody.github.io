// main.js — Walkthrough controller + canvas integration
import { Renderer } from './canvas.js';
import { allGroups, getGroupById, getGroupsByRank } from './groups.js';
import { parseMatrix, classifyGroup } from './classify.js';

// ============================================================
// Canvas renderer
// ============================================================
const canvas = document.getElementById('canvas');
const renderer = new Renderer(canvas);
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

function goToSlide(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide) return;

    const prevSlide = slides[currentSlide];
    const nextSlideEl = slides[index];

    // Determine direction
    const goingForward = index > currentSlide;

    // --- Exit the current slide ---
    // Reset any sub-animations so they can replay when the slide is revisited
    resetSlideAnimations(prevSlide);
    prevSlide.classList.remove('active');
    // Add directional exit class
    const exitClass = goingForward ? 'exit-up' : 'exit-down';
    prevSlide.classList.add(exitClass);
    setTimeout(() => {
        prevSlide.classList.remove(exitClass);
    }, 600);

    // --- Enter the new slide ---
    // Prepare the entry direction: set initial position before activating
    const entryClass = goingForward ? 'enter-from-below' : 'enter-from-above';
    nextSlideEl.classList.add(entryClass);
    // Force a reflow so the initial position takes effect before transition
    void nextSlideEl.offsetHeight;
    nextSlideEl.classList.remove(entryClass);
    nextSlideEl.classList.add('active');

    currentSlide = index;

    // Update nav buttons
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;

    // Update dots
    document.querySelectorAll('.progress-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
        if (i < currentSlide) d.classList.add('visited');
    });

    // Trigger slide-specific canvas state
    onSlideActivated(currentSlide);

    // Animate reveal lists and stagger elements after the slide settles in
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
    // Reveal list items one by one
    slideEl.querySelectorAll('.reveal-list li').forEach((li, i) => {
        setTimeout(() => li.classList.add('visible'), i * 200);
    });

    // Stagger animations
    slideEl.querySelectorAll('.stagger').forEach(el => {
        el.classList.add('visible');
    });

    // Fade-in elements
    slideEl.querySelectorAll('.fade-in').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 150);
    });
}

// Reset animations so they replay when the slide is revisited
function resetSlideAnimations(slideEl) {
    slideEl.querySelectorAll('.reveal-list li').forEach(li => {
        li.classList.remove('visible');
    });
    slideEl.querySelectorAll('.stagger').forEach(el => {
        el.classList.remove('visible');
    });
    slideEl.querySelectorAll('.fade-in').forEach(el => {
        el.classList.remove('visible');
    });
}

// Trigger initial animations for slide 0
setTimeout(() => triggerSlideAnimations(slides[0]), 300);

// ============================================================
// Slide-canvas syncing
// ============================================================
function onSlideActivated(slideIndex) {
    const slide = slides[slideIndex];
    const canvasMode = slide.dataset.canvas;

    switch (canvasMode) {
        case 'intro':
            // Show a nice wallpaper group on the intro slide
            selectGroup('p4mm');
            renderer.scale = 100;
            break;
        case 'isometries':
            // Show C4 for isometry demo
            selectGroup('C4');
            renderer.scale = 120;
            break;
        case 'semidirect':
            // Show p1 wallpaper (pure translations) to illustrate the translation subgroup
            selectGroup('p1');
            renderer.scale = 100;
            break;
        case 'strategy':
            // Show p4 for a balanced view
            selectGroup('p4');
            renderer.scale = 100;
            break;
        case 'pointgroup':
            selectGroup('C4');
            renderer.scale = 120;
            break;
        case 'frieze':
            selectGroup('p1_frieze');
            renderer.scale = 100;
            break;
        case 'wallpaper':
            selectGroup('p4mm');
            renderer.scale = 100;
            break;
        case 'explore':
            // Keep current group
            break;
        case 'classify':
            // Keep canvas showing whatever was last loaded
            break;
    }

    // Show/hide generator bar
    const genBar = document.getElementById('gen-bar');
    if (['pointgroup', 'frieze', 'wallpaper', 'explore', 'isometries', 'classify'].includes(canvasMode)) {
        genBar.classList.add('visible');
    } else {
        genBar.classList.remove('visible');
    }
}

// ============================================================
// Group selection
// ============================================================
function selectGroup(id) {
    const group = getGroupById(id);
    if (!group) return;
    currentGroup = group;

    renderer.setGroup(group);
    renderer.resetView();

    // Adjust scale by rank
    if (group.rank === 0) {
        renderer.scale = 120;
    } else if (group.rank === 1) {
        renderer.scale = 100;
    } else {
        renderer.scale = 120;
    }

    // Update canvas badge
    document.getElementById('group-name-badge').textContent = `${group.name} — ${group.fullName}`;

    // Update generator buttons
    updateGeneratorButtons();

    // Update active chips in all galleries
    document.querySelectorAll('.group-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.groupId === id);
    });

    // Update active rank cards
    document.querySelectorAll('.rank-card').forEach(card => {
        card.classList.toggle('active', parseInt(card.dataset.rank) === group.rank);
    });
}

// ============================================================
// Generator buttons (floating on canvas)
// ============================================================
function updateGeneratorButtons() {
    const container = document.getElementById('gen-bar');
    container.innerHTML = '';
    if (!currentGroup) return;

    currentGroup.generators.forEach((gen, i) => {
        const btn = document.createElement('button');
        btn.className = 'gen-btn';
        btn.dataset.gen = String(i % 4);
        btn.textContent = currentGroup.genLabels[i] || `g${i + 1}`;
        btn.title = `Click to animate`;
        btn.addEventListener('click', () => {
            renderer.animateGenerator(i);
            document.getElementById('anim-status').textContent =
                `Applying ${currentGroup.genLabels[i] || 'g' + (i + 1)}...`;
            setTimeout(() => {
                document.getElementById('anim-status').textContent = '';
            }, renderer.animDuration / renderer.animSpeed + 200);
        });
        container.appendChild(btn);
    });
}

// ============================================================
// Populate galleries
// ============================================================
function populatePointGroupGallery() {
    const container = document.getElementById('point-group-gallery');
    if (!container) return;

    const groups = getGroupsByRank(0);
    // Show a curated selection: C₁–C₆, D₁–D₆
    const selection = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    selection.forEach(id => {
        const g = getGroupById(id);
        if (!g) return;
        const chip = document.createElement('button');
        chip.className = 'group-chip';
        chip.dataset.groupId = id;
        chip.textContent = g.name;
        chip.title = g.fullName;
        chip.addEventListener('click', () => selectGroup(id));
        container.appendChild(chip);
    });
}

function populateFriezeGallery() {
    const container = document.getElementById('frieze-gallery');
    if (!container) return;

    getGroupsByRank(1).forEach(g => {
        const chip = document.createElement('button');
        chip.className = 'group-chip';
        chip.dataset.groupId = g.id;
        chip.textContent = `${g.name} (${g.fullName})`;
        chip.title = g.description;
        chip.addEventListener('click', () => selectGroup(g.id));
        container.appendChild(chip);
    });
}

function populateWallpaperGallery() {
    const container = document.getElementById('wallpaper-gallery');
    if (!container) return;

    getGroupsByRank(2).forEach(g => {
        const chip = document.createElement('button');
        chip.className = 'group-chip';
        chip.dataset.groupId = g.id;
        chip.textContent = g.name;
        chip.title = `${g.fullName}: ${g.description}`;
        chip.addEventListener('click', () => selectGroup(g.id));
        container.appendChild(chip);
    });
}

// ============================================================
// Isometry cards — visual demo
// ============================================================
document.querySelectorAll('.iso-card').forEach(card => {
    card.addEventListener('click', () => {
        const type = card.dataset.iso;
        // Highlight the card
        document.querySelectorAll('.iso-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        // Show an appropriate group for each isometry type
        switch (type) {
            case 'translation':
                selectGroup('p1');
                renderer.scale = 100;
                break;
            case 'rotation':
                selectGroup('C4');
                renderer.scale = 120;
                break;
            case 'reflection':
                selectGroup('D1');
                renderer.scale = 120;
                break;
            case 'glide':
                selectGroup('p11g');
                renderer.scale = 100;
                break;
        }
    });
});

// ============================================================
// Rank cards — jump to relevant slide
// ============================================================
document.querySelectorAll('.rank-card').forEach(card => {
    card.addEventListener('click', () => {
        const rank = parseInt(card.dataset.rank);
        // Jump to appropriate slide: rank 0 → slide 4, rank 1 → slide 5, rank 2 → slide 6
        goToSlide(4 + rank);
    });
});

// ============================================================
// Display settings (on explore slide)
// ============================================================
const showLattice = document.getElementById('show-lattice');
const showDomain = document.getElementById('show-domain');
const showAxes = document.getElementById('show-axes');
const showMotif = document.getElementById('show-motif');
const copiesSlider = document.getElementById('copies-slider');

if (showLattice) showLattice.addEventListener('change', e => { renderer.showLattice = e.target.checked; });
if (showDomain) showDomain.addEventListener('change', e => { renderer.showDomain = e.target.checked; });
if (showAxes) showAxes.addEventListener('change', e => { renderer.showAxes = e.target.checked; });
if (showMotif) showMotif.addEventListener('change', e => { renderer.showMotif = e.target.checked; });
if (copiesSlider) copiesSlider.addEventListener('input', e => { renderer.setCopies(parseInt(e.target.value)); });

// ============================================================
// Reset view button
// ============================================================
document.getElementById('reset-view-btn').addEventListener('click', () => {
    renderer.resetView();
});

// ============================================================
// Initialize
// ============================================================
populatePointGroupGallery();
populateFriezeGallery();
populateWallpaperGallery();

// Show initial group
selectGroup('p4mm');
renderer.scale = 100;

// Typeset MathJax after a short delay
setTimeout(() => {
    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}, 500);

// ============================================================
// Classify Lab — Matrix Input UI
// ============================================================
const genList = document.getElementById('generator-list');
const classifyBtn = document.getElementById('classify-btn');
const addGenBtn = document.getElementById('add-gen-btn');
const resultBox = document.getElementById('classify-result');

let genCardCount = 0;

function createGenCard(values = [1, 0, 0, 0, 1, 0]) {
    genCardCount++;
    const card = document.createElement('div');
    card.className = 'gen-card';
    card.dataset.idx = genCardCount;

    const header = document.createElement('div');
    header.className = 'gen-card-header';
    const title = document.createElement('span');
    title.className = 'gen-card-title';
    title.textContent = `Generator ${genList.children.length + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'gen-remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
        card.remove();
        renumberCards();
    });
    header.appendChild(title);
    header.appendChild(removeBtn);

    const grid = document.createElement('div');
    grid.className = 'matrix-grid';

    // Row 1: a, b, tx
    // Row 2: c, d, ty
    // Row 3: 0, 0, 1 (fixed)
    const labels = ['a', 'b', 'tₓ', 'c', 'd', 'tᵧ', '0', '0', '1'];
    for (let i = 0; i < 9; i++) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = labels[i];
        if (i >= 6) {
            inp.classList.add('fixed');
            inp.value = i < 8 ? '0' : '1';
            inp.readOnly = true;
            inp.tabIndex = -1;
        } else {
            inp.value = values[i];
            inp.classList.add('mat-entry');
            if (i === 2 || i === 5) inp.classList.add('translation-col');
        }
        grid.appendChild(inp);
    }

    card.appendChild(header);
    card.appendChild(grid);
    genList.appendChild(card);
}

function renumberCards() {
    genList.querySelectorAll('.gen-card').forEach((card, i) => {
        card.querySelector('.gen-card-title').textContent = `Generator ${i + 1}`;
    });
}

function getGeneratorsFromUI() {
    const gens = [];
    genList.querySelectorAll('.gen-card').forEach(card => {
        const inputs = card.querySelectorAll('.mat-entry');
        const vals = Array.from(inputs).map(inp => inp.value.trim());
        // Evaluate simple math expressions (e.g. "sqrt(3)/2")
        const nums = vals.map(v => {
            try {
                const expr = v.replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
                    .replace(/pi/gi, 'Math.PI')
                    .replace(/π/g, 'Math.PI');
                return Function('"use strict"; return (' + expr + ')')();
            } catch { return NaN; }
        });
        const parsed = parseMatrix(nums);
        gens.push({ vals: nums, parsed });
    });
    return gens;
}

// Preset handlers
const c60 = Math.cos(Math.PI / 3), s60 = Math.sin(Math.PI / 3);
const presets = {
    'preset-trans': [1, 0, 1, 0, 1, 0],
    'preset-rot90': [0, -1, 0, 1, 0, 0],
    'preset-rot60': [c60, -s60, 0, s60, c60, 0],
    'preset-reflx': [1, 0, 0, 0, -1, 0],
    'preset-glidex': [1, 0, 0.5, 0, -1, 0],
};

for (const [id, vals] of Object.entries(presets)) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => createGenCard(vals.map(v => +v.toFixed(6))));
}

addGenBtn.addEventListener('click', () => createGenCard());

// Classify button
classifyBtn.addEventListener('click', () => {
    const entries = getGeneratorsFromUI();
    if (entries.length === 0) {
        showResult('error', 'No generators', 'Add at least one generator matrix.', '');
        return;
    }

    // Validate parsing
    for (let i = 0; i < entries.length; i++) {
        if (!entries[i].parsed || entries[i].vals.some(isNaN)) {
            showResult('error', 'Parse error', `Generator ${i + 1} has invalid entries. Use numbers or expressions like sqrt(3)/2, pi.`, '');
            return;
        }
    }

    const generators = entries.map(e => e.parsed);
    const result = classifyGroup(generators);

    if (!result.success) {
        showResult('error', 'Invalid Input', result.reason, '');
    } else if (!result.discrete) {
        showResult('warning', 'Not Discrete', result.reason, '');
    } else {
        showResult('success', result.groupName, result.details,
            result.genLabels.map((l, i) => `g${i + 1}: ${l}`).join('\n'),
            result.groupId);
    }
});

function showResult(type, title, subtitle, details, groupId) {
    resultBox.style.display = 'block';
    resultBox.className = 'result-box ' + type;

    let html = `<div class="result-title">${title}</div>`;
    html += `<div class="result-subtitle">${subtitle}</div>`;
    if (details) html += `<div class="result-details">${details}</div>`;

    if (type === 'success' && groupId) {
        // Check if we have this group pre-defined
        const predef = getGroupById(groupId);
        if (predef) {
            html += `<button class="result-show-btn" id="show-classified-btn">Show on Canvas →</button>`;
        }
    }

    resultBox.innerHTML = html;

    // Wire up show button
    const showBtn = document.getElementById('show-classified-btn');
    if (showBtn && groupId) {
        showBtn.addEventListener('click', () => {
            selectGroup(groupId);
        });
    }

    // Re-animate
    resultBox.style.animation = 'none';
    void resultBox.offsetHeight;
    resultBox.style.animation = '';
}

// Add one default generator card on load
createGenCard([1, 0, 1, 0, 1, 0]);

