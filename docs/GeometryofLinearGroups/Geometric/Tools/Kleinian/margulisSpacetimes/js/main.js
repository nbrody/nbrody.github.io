/**
 * main.js — Orchestration: UI controls, panel logic, animations
 */
import { MargulisScene } from './scene.js';
import { computeTranslations, eigendata, A1, A2, lorentzDot } from './math.js';

/* =========================================
   INIT
   ========================================= */

const scene = new MargulisScene(document.getElementById('viz-container'));

// Compute and display initial Margulis invariants
updateInvariantDisplay();

/* =========================================
   THEORY PANEL
   ========================================= */

// Collapse/expand theory panel
document.getElementById('theory-collapse-btn').addEventListener('click', () => {
    document.getElementById('theory-panel').classList.toggle('collapsed');
});

// Collapsible sections
document.querySelectorAll('.section-title').forEach(title => {
    title.addEventListener('click', () => {
        title.parentElement.classList.toggle('collapsed');
    });
});

/* =========================================
   CONTROL PANEL
   ========================================= */

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
    });
});

// Collapse control panel
document.getElementById('ctrl-collapse-btn').addEventListener('click', () => {
    document.getElementById('control-panel').classList.toggle('collapsed');
});

/* =========================================
   VIEW TOGGLES
   ========================================= */

const toggleMap = {
    'toggle-light-cone': 'lightCone',
    'toggle-hyperboloid': 'hyperboloid',
    'toggle-axes': 'axes',
    'toggle-fundamental-domain': 'fundamentalDomain',
    'toggle-orbit': 'orbit'
};

Object.entries(toggleMap).forEach(([btnId, key]) => {
    document.getElementById(btnId).addEventListener('click', (e) => {
        const isActive = scene.toggleVisibility(key);
        e.target.classList.toggle('active', isActive);
    });
});

// Pair selection (radio-like)
function selectPair(pairIdx) {
    scene.setActivePair(pairIdx);
    document.getElementById('pair-0').classList.toggle('active', pairIdx === 0 || pairIdx === -1);
    document.getElementById('pair-1').classList.toggle('active', pairIdx === 1 || pairIdx === -1);
    document.getElementById('pair-both').classList.toggle('active', pairIdx === -1);
}

document.getElementById('pair-0').addEventListener('click', () => selectPair(0));
document.getElementById('pair-1').addEventListener('click', () => selectPair(1));
document.getElementById('pair-both').addEventListener('click', () => selectPair(-1));

document.getElementById('auto-rotate').addEventListener('click', (e) => {
    const isActive = e.target.classList.toggle('active');
    scene.setAutoRotate(isActive);
});

document.getElementById('reset-camera').addEventListener('click', () => {
    scene.resetCamera();
});

/* =========================================
   PARAMETER SLIDERS
   ========================================= */

function setupSlider(sliderId, valueId, paramKey) {
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);

    slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        valueEl.textContent = val.toFixed(val >= 10 ? 1 : 2);
        scene.updateParam(paramKey, val);
        if (paramKey === 'translationScale') updateInvariantDisplay();
    });
}

setupSlider('translation-scale', 'translation-value', 'translationScale');
setupSlider('plane-size', 'plane-size-value', 'planeSize');
setupSlider('plane-opacity', 'opacity-value', 'planeOpacity');
setupSlider('cone-height', 'cone-height-value', 'coneHeight');

/* =========================================
   ISOMETRY BUTTONS
   ========================================= */

const genLabels = ['γ₁', 'γ₁⁻¹', 'γ₂', 'γ₂⁻¹'];
const genColors = ['#38bdf8', '#818cf8', '#f472b6', '#fbbf24'];

document.querySelectorAll('.isometry-btn[data-gen]').forEach(btn => {
    btn.addEventListener('click', () => {
        const genIdx = parseInt(btn.dataset.gen);
        btn.classList.add('animating');
        
        // Auto-select the relevant pair
        const pairIdx = genIdx < 2 ? 0 : 1;
        selectPair(pairIdx);

        // Display info about this generator
        showGeneratorInfo(genIdx);

        scene.animateIsometry(genIdx, () => {
            btn.classList.remove('animating');
        });
    });
});

document.getElementById('animate-pairing-btn').addEventListener('click', (e) => {
    e.target.classList.add('animating');
    scene.animatePairing(() => {
        e.target.classList.remove('animating');
    });
});

document.getElementById('reset-btn').addEventListener('click', () => {
    scene.rebuild();
});

/* =========================================
   INFO DISPLAY
   ========================================= */

function updateInvariantDisplay() {
    const data = computeTranslations(parseFloat(document.getElementById('translation-scale').value));
    const alpha1El = document.getElementById('alpha1');
    const alpha2El = document.getElementById('alpha2');

    alpha1El.textContent = data.alpha1.toFixed(4);
    alpha2El.textContent = data.alpha2.toFixed(4);

    // Color based on sign
    alpha1El.style.color = data.alpha1 > 0 ? '#22c55e' : '#ef4444';
    alpha2El.style.color = data.alpha2 > 0 ? '#22c55e' : '#ef4444';

    // Retypeset MathJax if available
    if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([document.getElementById('invariant-info')]);
    }
}

function showGeneratorInfo(genIdx) {
    const infoEl = document.getElementById('generator-info');
    const matrices = [A1, A1, A2, A2]; // A1 for γ₁, γ₁⁻¹; A2 for γ₂, γ₂⁻¹
    const A = matrices[genIdx];
    const ed = eigendata(A);

    const scale = parseFloat(document.getElementById('translation-scale').value);
    const data = computeTranslations(scale);
    const b = genIdx < 2 ? data.b1 : data.b2;

    const fmtVec = v => `(${v.map(x => x.toFixed(3)).join(', ')})`;
    const fmtMat = M => M.map(row => row.map(x => {
        const r = Math.round(x);
        return Math.abs(x - r) < 1e-6 ? r.toString() : x.toFixed(3);
    }).join('  ')).join('\n');

    const isInverse = genIdx === 1 || genIdx === 3;
    const label = genLabels[genIdx];

    infoEl.innerHTML = `
        <div style="margin-bottom: 8px;">
            <span style="color: ${genColors[genIdx]}; font-weight: 700; font-size: 1.1rem;">${label}</span>
            <span style="color: var(--text-dim); font-size: 0.78rem;"> — ${isInverse ? 'Inverse of' : ''} ${genIdx < 2 ? 'Generator 1' : 'Generator 2'}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-dim); line-height: 1.6;">
            <div><strong style="color: var(--text);">Eigenvalues:</strong> λ⁺ = ${ed.lambdaPlus.toFixed(4)}, λ⁻ = ${ed.lambdaMinus.toFixed(4)}</div>
            <div><strong style="color: var(--text);">Translation length:</strong> log|λ| = ${ed.logLambda.toFixed(4)}</div>
            <div><strong style="color: var(--text);">Neutral eigenvector:</strong> v⁰ = ${fmtVec(ed.v0)}</div>
            <div><strong style="color: var(--text);">Translation:</strong> b = ${fmtVec(b)}</div>
            <div><strong style="color: var(--text);">⟨v⁰, v⁰⟩ =</strong> ${lorentzDot(ed.v0, ed.v0).toFixed(4)} <span style="color: var(--primary);">(spacelike)</span></div>
        </div>
    `;
}

/* =========================================
   KEYBOARD SHORTCUTS
   ========================================= */

document.addEventListener('keydown', (e) => {
    switch (e.key) {
        case '1': document.querySelector('[data-gen="0"]').click(); break;
        case '2': document.querySelector('[data-gen="1"]').click(); break;
        case '3': document.querySelector('[data-gen="2"]').click(); break;
        case '4': document.querySelector('[data-gen="3"]').click(); break;
        case 'p':
        case 'P': document.getElementById('animate-pairing-btn').click(); break;
        case 'r':
        case 'R': document.getElementById('reset-btn').click(); break;
        case 'l': document.getElementById('toggle-light-cone').click(); break;
        case 'h': document.getElementById('toggle-hyperboloid').click(); break;
        case 'c': selectPair(scene.activePair === 0 ? 1 : 0); break;
        case 'o': document.getElementById('toggle-orbit').click(); break;
    }
});

console.log(`
╔══════════════════════════════════════════╗
║     Margulis Spacetimes Visualizer       ║
║     Drumm's Crooked Planes              ║ 
╠══════════════════════════════════════════╣
║  Keys: 1-4 = isometries, P = pairing    ║
║        R = reset, L/H/C/O = toggles     ║
╚══════════════════════════════════════════╝
`);
