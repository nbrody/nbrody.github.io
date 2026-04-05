import { ANIM_MS, STEPS, TOTAL } from './config.js';
import { renderNaturals } from './sceneNaturals.js';
import { buildTree, renderTree } from './sceneTree.js';
import { initSphere, resizeSphere, tickSphere, applyRotation, resetSphere, isInitialized, showGeneratorAxes } from './sceneSphere.js';

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let step = 0, t = 1, animStart = 0;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W = 800, H = 500;

const threeContainer = document.getElementById('three-container');
let activeGenSet = null; // 'cube' | 'free' | null

// All sphere overlay elements
const overlayEls = {
    matrixCube:   document.getElementById('matrix-cube'),
    matrixFree:   document.getElementById('matrix-free'),
    controlsCube: document.getElementById('controls-cube'),
    controlsFree: document.getElementById('controls-free'),
    wordDisplay:  document.getElementById('word-display'),
};

// ═══════════════════════════════════════════════════════════
// CANVAS SETUP
// ═══════════════════════════════════════════════════════════
function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width; H = rect.height;
}
window.addEventListener('resize', resize);

// ═══════════════════════════════════════════════════════════
// SCENE SWITCHING
// ═══════════════════════════════════════════════════════════
function hideAllOverlays() {
    for (const el of Object.values(overlayEls)) el.style.display = 'none';
}

function switchToScene(sceneIdx, localStep) {
    const isSphere = sceneIdx === 2;
    canvas.style.display = isSphere ? 'none' : 'block';
    threeContainer.style.display = isSphere ? 'block' : 'none';

    if (!isSphere) {
        hideAllOverlays();
        activeGenSet = null;
        return;
    }

    // Initialize Three.js on first visit
    if (!isInitialized()) {
        initSphere(threeContainer, word => {
            document.getElementById('word-value').textContent = word;
        });
    }
    resizeSphere();

    // Determine which generator set to show
    let newGenSet = null;
    if (localStep === 0) newGenSet = 'cube';
    else if (localStep === 1) newGenSet = 'free';

    // Reset sphere when switching generator sets
    if (newGenSet !== activeGenSet && activeGenSet !== null) {
        resetSphere();
    }
    activeGenSet = newGenSet;

    // Toggle overlays
    overlayEls.matrixCube.style.display   = newGenSet === 'cube' ? 'block' : 'none';
    overlayEls.controlsCube.style.display = newGenSet === 'cube' ? 'flex'  : 'none';
    overlayEls.matrixFree.style.display   = newGenSet === 'free' ? 'block' : 'none';
    overlayEls.controlsFree.style.display = newGenSet === 'free' ? 'flex'  : 'none';
    overlayEls.wordDisplay.style.display  = newGenSet ? 'block' : 'none';

    // Show matching persistent axes
    showGeneratorAxes(newGenSet);
}

// ═══════════════════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════════════════
function render(now) {
    if (t < 1) t = Math.min(1, (now - animStart) / ANIM_MS);

    const s = STEPS[step];

    if (s.scene === 2) {
        tickSphere();
    } else {
        ctx.clearRect(0, 0, W, H);
        const sceneStart = STEPS.findIndex(st => st.scene === s.scene);
        const localStep = step - sceneStart;
        if (s.scene === 0) renderNaturals(ctx, W, H, localStep, t);
        else if (s.scene === 1) renderTree(ctx, W, H, localStep, t);
    }

    requestAnimationFrame(render);
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════
function goTo(n) {
    if (n < 0 || n >= TOTAL) return;
    step = n; t = 0; animStart = performance.now();
    updateUI();
}
window.next = () => goTo(step + 1);
window.prev = () => goTo(step - 1);

function updateUI() {
    const s = STEPS[step];
    document.getElementById('description').textContent = s.desc;
    document.getElementById('prev-btn').disabled = step === 0;
    document.getElementById('next-btn').disabled = step === TOTAL - 1;
    // Scene tabs
    document.querySelectorAll('.scene-tab').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.scene) === s.scene);
    });
    // Dots
    const dotsEl = document.getElementById('dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < TOTAL; i++) {
        const d = document.createElement('div');
        d.className = 'dot' + (i === step ? ' active' : '');
        d.onclick = () => goTo(i);
        d.style.cursor = 'pointer';
        dotsEl.appendChild(d);
    }
    // Scene switching with localStep awareness
    const sceneStart = STEPS.findIndex(st => st.scene === s.scene);
    switchToScene(s.scene, step - sceneStart);
}

// Scene tab clicks
document.querySelectorAll('.scene-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        const scene = parseInt(btn.dataset.scene);
        const idx = STEPS.findIndex(s => s.scene === scene);
        if (idx >= 0) goTo(idx);
    });
});

// Rotation button clicks (both control panels)
document.querySelectorAll('.rot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const rot = btn.dataset.rot;
        if (rot === 'reset') resetSphere();
        else applyRotation(rot);
    });
});

// Keyboard nav
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); window.prev(); }
});

// postMessage nav (for iframe embedding)
window.addEventListener('message', e => {
    if (e.data === 'next' || e.data === 'right') window.next();
    if (e.data === 'prev' || e.data === 'left') window.prev();
});

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
resize();
buildTree(W, H);
updateUI();
requestAnimationFrame(render);

window.addEventListener('resize', () => {
    buildTree(W, H);
    if (isInitialized()) resizeSphere();
});
