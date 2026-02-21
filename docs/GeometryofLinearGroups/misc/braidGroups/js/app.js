/**
 * App Controller — Burau Relation Finder
 * 
 * Wires up the UI controls to the FlashBeam solver and Burau math engine.
 * Generalized for B_n (n-strand braid group), defaulting to n=4.
 */

import {
    LaurentPoly,
    QuotientRing,
    parsePoly,
    matMul,
    matIdentity,
    matEquals,
    matToLatex,
    matToString,
    matDistFromIdentity,
    makeBurauGenerators,
    getQuotientRings,
    getStrandCount,
    setStrandCount
} from './burau.js';

import { FlashBeamSolver } from './flashbeam.js';
import { BraidVisualizer, getStrandColor } from './braidVisualizer.js';
import { DiskVisualizer } from './diskVisualizer.js';
import { handleReduction, formatHandleReductionResult } from './handleReduction.js';
import { inducedPermutation, isIdentityPermutation, permutationToCycleNotation } from './inducedPermutation.js';


// ============================================================
//  DOM References
// ============================================================

const ringSelect = document.getElementById('ring-select');
const customRingGroup = document.getElementById('custom-ring-group');
const customPolyInput = document.getElementById('custom-poly-input');
const customRingFeedback = document.getElementById('custom-ring-feedback');
const beamWidthInput = document.getElementById('beam-width');
const flashSizeInput = document.getElementById('flash-size');
const maxIterInput = document.getElementById('max-iterations');
const generatorCheckboxes = document.getElementById('generator-checkboxes');
const groupToggle = document.getElementById('group-toggle');
const groupDescription = document.getElementById('group-description');
const strandSlider = document.getElementById('strand-slider');
const strandDisplay = document.getElementById('strand-display');

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

const statusIteration = document.getElementById('status-iteration');
const statusBestScore = document.getElementById('status-best-score');
const statusExplored = document.getElementById('status-explored');
const statusSolutions = document.getElementById('status-solutions');
const statusElapsed = document.getElementById('status-elapsed');
const statusState = document.getElementById('status-state');

const flashPoolEl = document.getElementById('flash-pool');
const logArea = document.getElementById('log-area');
const solutionsList = document.getElementById('solutions-list');

const generatorCardsEl = document.getElementById('generator-cards');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Manual multiplier
const wordInputEl = document.getElementById('word-input');
const btnCompute = document.getElementById('btn-compute');
const manualResultEl = document.getElementById('manual-result');

// Word builder (Theory tab)
const builderWordEl = document.getElementById('builder-word');
const builderMatrixEl = document.getElementById('builder-matrix');
const builderVerdictEl = document.getElementById('builder-verdict');
const btnUndoLetter = document.getElementById('btn-undo-letter');
const btnClearWord = document.getElementById('btn-clear-word');

// Permutation & handle reduction (Theory tab)
const builderExtras = document.getElementById('builder-extras');
const builderPermutation = document.getElementById('builder-permutation');
const handleReduceToggle = document.getElementById('handle-reduce-toggle');
const builderHandleResult = document.getElementById('builder-handle-result');

// Handle reduction toggle (Word Calculator tab)
const calcHandleReduceToggle = document.getElementById('calc-handle-reduce-toggle');

// Relations panel
const relationsSection = document.getElementById('builder-relations-section');
const relationsContainer = document.getElementById('builder-relations');
const relationsCount = document.getElementById('relations-count');

// Dynamic text elements
const heroTitle = document.getElementById('hero-title');
const strandLegend = document.getElementById('braid-strand-legend');


// ============================================================
//  State
// ============================================================

let solver = null;
let currentRing = null;
let customParsedPoly = null; // Parsed custom polynomial (LaurentPoly or null)
let currentGroup = 'Bn'; // 'Bn' or 'F2'
let braidViz = null; // Three.js braid visualizer instance
let diskViz = null;  // Canvas2D mapping class visualizer

// Word builder state
let builderSymbols = [];  // array of symbol strings like ['s1', 'S2', 's3']

let generators, inverseMap;
const rings = getQuotientRings();

// Map from generator symbol to generator object — rebuilt when n changes
let generatorBySymbol = {};

/** Rebuild generators from current strand count */
function rebuildGenerators() {
    const result = makeBurauGenerators();
    generators = result.generators;
    inverseMap = result.inverseMap;
    generatorBySymbol = {};
    for (const g of generators) {
        generatorBySymbol[g.symbol] = g;
    }
}

// Initial build
rebuildGenerators();

/** Build the F₂ generator set: X = σ₁σ₃⁻¹, Y = σ₁σ₂σ₃σ₁⁻¹σ₂⁻¹σ₁⁻¹ */
function makeF2Generators() {
    const n = getStrandCount();
    const dim = n - 1;
    const genBySymbol = {};
    for (const g of generators) genBySymbol[g.symbol] = g.matrix;

    // Only valid for n >= 4 (need σ₃)
    if (n < 4 || !genBySymbol['s3']) return null;

    // X = σ₁ · σ₃⁻¹  = a · C
    const matX = matMul(genBySymbol['s1'], genBySymbol['S3']);
    // Y = σ₁ · σ₂ · σ₃ · σ₁⁻¹ · σ₂⁻¹ · σ₁⁻¹  = a·b·c·A·B·A
    let matY = matIdentity(dim);
    for (const s of ['s1', 's2', 's3', 'S1', 'S2', 'S1']) {
        matY = matMul(matY, genBySymbol[s]);
    }
    // X⁻¹ = σ₃ · σ₁⁻¹  = c · A
    const matXinv = matMul(genBySymbol['s3'], genBySymbol['S1']);
    // Y⁻¹ = (abcABA)⁻¹ = reverse & invert = a·b·a·C·B·A
    let matYinv = matIdentity(dim);
    for (const s of ['s1', 's2', 's1', 'S3', 'S2', 'S1']) {
        matYinv = matMul(matYinv, genBySymbol[s]);
    }

    return {
        generators: [
            { name: 'X', symbol: 'x', matrix: matX },
            { name: 'Y', symbol: 'y', matrix: matY },
            { name: 'X⁻¹', symbol: 'X', matrix: matXinv },
            { name: 'Y⁻¹', symbol: 'Y', matrix: matYinv },
        ],
        inverseMap: {
            'x': 'X', 'X': 'x',
            'y': 'Y', 'Y': 'y'
        }
    };
}


// ============================================================
//  Initialization
// ============================================================

function init() {
    // Populate ring selector
    for (const ring of rings) {
        const opt = document.createElement('option');
        opt.value = ring.value;
        opt.textContent = ring.name;
        ringSelect.appendChild(opt);
    }
    // Add 'Custom' option at the end
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '✏️ Custom polynomial…';
    ringSelect.appendChild(customOpt);

    // Show/hide custom input
    ringSelect.addEventListener('change', () => {
        const isCustom = ringSelect.value === 'custom';
        customRingGroup.style.display = isCustom ? 'block' : 'none';
        if (isCustom && customPolyInput.value) {
            updateCustomPolyFeedback();
        }
    });

    // Live parsing as user types
    customPolyInput.addEventListener('input', updateCustomPolyFeedback);

    // Example chips
    document.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            customPolyInput.value = chip.dataset.poly;
            updateCustomPolyFeedback();
        });
    });

    // Populate generator checkboxes
    populateGeneratorCheckboxes();

    // Group toggle
    groupToggle.querySelectorAll('.group-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            groupToggle.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentGroup = btn.dataset.group;
            updateGroupDescription();
            populateGeneratorCheckboxes();
        });
    });

    // Strand slider
    if (strandSlider) {
        strandSlider.addEventListener('input', () => {
            const n = parseInt(strandSlider.value);
            handleStrandCountChange(n);
        });
    }

    // Render generator cards
    renderGeneratorCards();

    // Tab logic
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(target).classList.add('active');
        });
    });

    // Buttons
    btnStart.addEventListener('click', startSearch);
    btnStop.addEventListener('click', stopSearch);

    if (btnCompute) {
        btnCompute.addEventListener('click', computeWord);
    }

    // Handle reduction toggle — re-render builder when toggled
    if (handleReduceToggle) {
        handleReduceToggle.addEventListener('change', () => builderRender());
    }

    // Typeset initial MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise();
    }

    // Initialize braid visualizer
    const braidCanvas = document.getElementById('braid-viz-canvas');
    if (braidCanvas) {
        braidViz = new BraidVisualizer(braidCanvas);
    }

    // Initialize disk (mapping class) visualizer
    const diskCanvas = document.getElementById('disk-viz-canvas');
    if (diskCanvas) {
        diskViz = new DiskVisualizer(diskCanvas);
    }

    // Update dynamic text for initial n
    updateDynamicText();
    updateStrandLegend();
}

/** Update group description based on current group and strand count */
function updateGroupDescription() {
    const n = getStrandCount();
    if (currentGroup === 'F2') {
        groupDescription.textContent = `Free group F₂ — generators X = σ₁σ₃⁻¹, Y = σ₁σ₂σ₃σ₁⁻¹σ₂⁻¹σ₁⁻¹ (requires n≥4)`;
    } else {
        const numGens = n - 1;
        const genList = Array.from({ length: numGens }, (_, i) => `σ${subscriptDigit(i + 1)}`).join(', ');
        groupDescription.textContent = `Braid group on ${n} strands — generators ${genList}`;
    }
}

/** Handle strand count changes from the slider */
function handleStrandCountChange(n) {
    // Stop any running search
    if (solver && solver.running) {
        solver.stop();
    }

    setStrandCount(n);
    rebuildGenerators();

    // Update UI
    if (strandDisplay) strandDisplay.textContent = n;
    updateDynamicText();
    updateStrandLegend();

    // Clear builder
    builderSymbols = [];
    builderRender();

    // Rebuild generator cards and checkboxes
    renderGeneratorCards();
    populateGeneratorCheckboxes();
    updateGroupDescription();

    // F₂ only available for n >= 4
    const f2Btn = groupToggle.querySelector('[data-group="F2"]');
    if (f2Btn) {
        f2Btn.disabled = n < 4;
        if (n < 4 && currentGroup === 'F2') {
            // Switch back to Bn
            currentGroup = 'Bn';
            groupToggle.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
            groupToggle.querySelector('[data-group="Bn"]').classList.add('active');
            updateGroupDescription();
            populateGeneratorCheckboxes();
        }
    }

    // Update visualizers
    if (braidViz) braidViz.setStrandCount(n);
    if (diskViz) diskViz.setStrandCount(n);
}

/** Update hero title and other dynamic text */
function updateDynamicText() {
    const n = getStrandCount();
    if (heroTitle) {
        heroTitle.innerHTML = `Burau Representation of B<sub>${n}</sub>`;
    }
}

/** Update the strand legend dots */
function updateStrandLegend() {
    if (!strandLegend) return;
    const n = getStrandCount();
    strandLegend.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const span = document.createElement('span');
        span.className = 'strand-dot';
        span.style.setProperty('--strand-color', '#' + getStrandColor(i).toString(16).padStart(6, '0'));
        span.textContent = String(i + 1);
        strandLegend.appendChild(span);
    }
}

/** Unicode subscript for a digit */
function subscriptDigit(n) {
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).split('').map(d => subs[parseInt(d)]).join('');
}

/** Populate generator checkboxes based on current group */
function populateGeneratorCheckboxes() {
    generatorCheckboxes.innerHTML = '';
    let allSymbols, allNames;
    if (currentGroup === 'F2') {
        allSymbols = ['x', 'y', 'X', 'Y'];
        allNames = ['X', 'Y', 'X⁻¹', 'Y⁻¹'];
    } else {
        const numGens = getStrandCount() - 1;
        allSymbols = [];
        allNames = [];
        for (let i = 1; i <= numGens; i++) {
            allSymbols.push(`s${i}`);
            allNames.push(`σ${subscriptDigit(i)}`);
        }
        for (let i = 1; i <= numGens; i++) {
            allSymbols.push(`S${i}`);
            allNames.push(`σ${subscriptDigit(i)}⁻¹`);
        }
    }
    for (let i = 0; i < allSymbols.length; i++) {
        const label = document.createElement('label');
        label.className = 'checkbox-label active';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.value = allSymbols[i];
        cb.name = 'generator';
        cb.addEventListener('change', () => {
            label.classList.toggle('active', cb.checked);
        });
        const span = document.createElement('span');
        span.textContent = allNames[i];
        label.appendChild(cb);
        label.appendChild(span);
        generatorCheckboxes.appendChild(label);
    }
}

/** Live-parse the custom polynomial and show feedback */
function updateCustomPolyFeedback() {
    const val = customPolyInput.value.trim();
    if (!val) {
        customRingFeedback.className = 'custom-ring-feedback';
        customRingFeedback.innerHTML = '';
        customParsedPoly = null;
        return;
    }
    const { poly, error } = parsePoly(val);
    if (error) {
        customRingFeedback.className = 'custom-ring-feedback invalid';
        customRingFeedback.textContent = `✗ ${error}`;
        customParsedPoly = null;
    } else {
        const deg = poly.degree();
        customRingFeedback.className = 'custom-ring-feedback valid';
        customRingFeedback.innerHTML = `✓ Z[t,t⁻¹] / (<span class="parsed-poly">${poly.toString()}</span>)  —  degree ${deg.max}`;
        customParsedPoly = poly;
    }
}

/** Build the active QuotientRing (or null) from the current UI state */
function getActiveRing() {
    if (ringSelect.value === 'custom') {
        if (customParsedPoly) {
            return new QuotientRing(customParsedPoly, `custom: ${customParsedPoly.toString()}`);
        }
        return null;
    }
    const ringDef = rings.find(r => r.value === ringSelect.value);
    return ringDef && ringDef.modPoly ? new QuotientRing(ringDef.modPoly, ringDef.name) : null;
}

function renderGeneratorCards() {
    generatorCardsEl.innerHTML = '';

    // Build paired columns: σᵢ on top, σᵢ⁻¹ below
    const fwd = generators.filter(g => g.symbol[0] === 's');
    const inv = generators.filter(g => g.symbol[0] === 'S');

    for (let i = 0; i < fwd.length; i++) {
        const pair = document.createElement('div');
        pair.className = 'gen-pair';

        for (const gen of [fwd[i], inv[i]]) {
            const card = document.createElement('div');
            const isInv = gen.symbol[0] === 'S';
            card.className = `gen-chip ${isInv ? 'gen-chip-inv' : ''}`;
            card.dataset.symbol = gen.symbol;

            const name = document.createElement('div');
            name.className = 'gen-name';
            name.textContent = gen.name;

            const matrixDiv = document.createElement('div');
            matrixDiv.className = 'gen-matrix';
            matrixDiv.innerHTML = `\\(${matToLatex(gen.matrix)}\\)`;

            card.appendChild(name);
            card.appendChild(matrixDiv);
            card.addEventListener('click', () => builderAppendSymbol(gen.symbol));
            pair.appendChild(card);
        }

        generatorCardsEl.appendChild(pair);
    }
    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([generatorCardsEl]);
    }

    // Wire undo/clear buttons (re-add if needed since they're persistent)
    btnUndoLetter.onclick = builderUndo;
    btnClearWord.onclick = builderClear;
}


// ============================================================
//  Word Builder (Theory Tab — interactive generator clicking)
// ============================================================

/** Format a symbol for display */
function symbolToDisplayName(sym) {
    const gen = generatorBySymbol[sym];
    return gen ? gen.name : sym;
}

/** Append a generator symbol to the builder */
function builderAppendSymbol(symbol) {
    builderSymbols.push(symbol);
    builderRender();
}

/** Undo the last letter */
function builderUndo() {
    if (builderSymbols.length === 0) return;
    builderSymbols.pop();
    builderRender();
}

/** Clear the word */
function builderClear() {
    builderSymbols = [];
    builderRender();
}

/** Compute the matrix product for the current word */
function builderComputeMatrix() {
    const ring = getActiveRing();
    const dim = getStrandCount() - 1;
    let result = matIdentity(dim);
    for (const sym of builderSymbols) {
        let m = generatorBySymbol[sym].matrix;
        if (ring) m = ring.reduceMatrix(m);
        result = matMul(result, m, ring);
    }
    return result;
}

/** Render the word builder display */
function builderRender(transitionType = 'add') {
    const empty = builderSymbols.length === 0;
    const n = getStrandCount();
    const dim = n - 1;

    // Update buttons
    btnUndoLetter.disabled = empty;
    btnClearWord.disabled = empty;

    // Render word tokens
    if (empty) {
        builderWordEl.innerHTML = '<span class="empty-word">click a generator to start…</span>';
        builderMatrixEl.innerHTML = '';
        builderVerdictEl.className = 'word-builder-verdict';
        builderVerdictEl.textContent = '';
        if (builderExtras) builderExtras.style.display = 'none';
        if (braidViz) braidViz.clear();
        if (diskViz) diskViz.clear();
        renderRelations([]);
        return;
    }

    // Build token display
    builderWordEl.innerHTML = '';
    for (let i = 0; i < builderSymbols.length; i++) {
        const sym = builderSymbols[i];
        const isInverse = sym === sym.toUpperCase(); // S1, S2, S3 are inverses
        const span = document.createElement('span');
        span.className = `letter-token ${isInverse ? 'gen-inv' : 'gen-fwd'}`;
        span.textContent = symbolToDisplayName(sym);
        span.dataset.idx = i; // for hover-highlighting
        // Only animate the last (newly added) token
        if (i < builderSymbols.length - 1) {
            span.style.animation = 'none';
        }
        builderWordEl.appendChild(span);
    }

    // Add length badge
    const badge = document.createElement('span');
    badge.className = 'word-length-badge';
    badge.textContent = `(${builderSymbols.length})`;
    builderWordEl.appendChild(badge);

    // Compute and display matrix
    const result = builderComputeMatrix();
    const latex = matToLatex(result);
    const isId = matEquals(result, matIdentity(dim));

    builderMatrixEl.innerHTML = `\\(${latex}\\)`;

    if (isId) {
        builderVerdictEl.className = 'word-builder-verdict is-identity';
        builderVerdictEl.textContent = '✅ Identity matrix — this is a relation!';
    } else {
        builderVerdictEl.className = 'word-builder-verdict not-identity';
        builderVerdictEl.textContent = '';
    }

    // Typeset
    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([builderMatrixEl]);
    }

    // --- Induced permutation ---
    if (builderExtras) {
        builderExtras.style.display = '';
        const perm = inducedPermutation(builderSymbols, n);
        const isPure = isIdentityPermutation(perm);
        const cycleStr = permutationToCycleNotation(perm);

        builderPermutation.innerHTML = isPure
            ? `<span class="perm-badge pure">🔗 Permutation: <strong>e</strong> (identity) — <em>pure braid</em></span>`
            : `<span class="perm-badge">🔗 Permutation: <strong>${cycleStr}</strong></span>`;
    }

    // --- Handle reduction ---
    if (builderHandleResult && handleReduceToggle) {
        if (handleReduceToggle.checked) {
            const hrResult = handleReduction(builderSymbols, n);
            const formattedHR = formatHandleReductionResult(hrResult);
            builderHandleResult.innerHTML = hrResult.isTrivial
                ? `<span class="hr-badge trivial">✅ ${formattedHR}</span>`
                : `<span class="hr-badge nontrivial">🔶 ${formattedHR}</span>`;
            builderHandleResult.style.display = '';
        } else {
            builderHandleResult.style.display = 'none';
        }
    }

    // Update braid visualizer
    if (braidViz) {
        braidViz.setCrossings(builderSymbols, transitionType);
    }

    // Update disk (mapping class) visualizer
    if (diskViz) {
        diskViz.setCrossings(builderSymbols, transitionType);
    }

    // Update available relations
    const relations = findAllRelations(builderSymbols);
    renderRelations(relations);
}


// ============================================================
//  Braid Relations Detection & Application
// ============================================================

/** Get the generator index from a symbol */
function genIndexOf(sym) {
    const m = sym.match(/[sS](\d+)/);
    return m ? parseInt(m[1]) : null;
}

/** Is this symbol an inverse generator? */
function isInverseSymbol(sym) {
    return sym[0] === 'S';
}

/**
 * Scan the word for ALL applicable braid relations.
 * Returns array of { type, pos, len, label, replacement, icon }
 */
function findAllRelations(symbols) {
    const rels = [];
    const n = symbols.length;

    for (let pos = 0; pos < n; pos++) {

        // ── 1. Free cancellation:  σᵢ σᵢ⁻¹ = 1  or  σᵢ⁻¹ σᵢ = 1 ──
        if (pos < n - 1) {
            const s1 = symbols[pos];
            const s2 = symbols[pos + 1];
            if (inverseMap[s1] === s2) {
                const name1 = symbolToDisplayName(s1);
                const name2 = symbolToDisplayName(s2);
                rels.push({
                    type: 'cancel',
                    pos,
                    len: 2,
                    label: `${name1}·${name2} = 1`,
                    icon: '✕',
                    replacement: []
                });
            }
        }

        // ── 2. Far commutativity:  σᵢ σⱼ ↔ σⱼ σᵢ  when |i−j| ≥ 2 ──
        if (pos < n - 1) {
            const s1 = symbols[pos];
            const s2 = symbols[pos + 1];
            const g1 = genIndexOf(s1);
            const g2 = genIndexOf(s2);
            if (g1 !== null && g2 !== null && Math.abs(g1 - g2) >= 2) {
                const name1 = symbolToDisplayName(s1);
                const name2 = symbolToDisplayName(s2);
                rels.push({
                    type: 'commute',
                    pos,
                    len: 2,
                    label: `${name1} ↔ ${name2}`,
                    icon: '⇄',
                    replacement: [s2, s1]
                });
            }
        }

        // ── 3. Braid (Yang–Baxter):  σᵢ σⱼ σᵢ ↔ σⱼ σᵢ σⱼ  when |i−j|=1, same sign ──
        if (pos < n - 2) {
            const s1 = symbols[pos];
            const s2 = symbols[pos + 1];
            const s3 = symbols[pos + 2];

            // Pattern: A B A → B A B  (outer two identical, middle adjacent, all same sign)
            if (s1 === s3) {
                const g1 = genIndexOf(s1);
                const g2 = genIndexOf(s2);
                const inv1 = isInverseSymbol(s1);
                const inv2 = isInverseSymbol(s2);

                if (g1 !== null && g2 !== null &&
                    Math.abs(g1 - g2) === 1 && inv1 === inv2) {
                    const n1 = symbolToDisplayName(s1);
                    const n2 = symbolToDisplayName(s2);
                    rels.push({
                        type: 'braid',
                        pos,
                        len: 3,
                        label: `${n1}${n2}${n1} ↔ ${n2}${n1}${n2}`,
                        icon: '⟳',
                        replacement: [s2, s1, s2]
                    });
                }
            }
        }
    }

    return rels;
}

/** Apply a relation: splice the replacement into builderSymbols */
function applyRelation(rel) {
    const before = builderSymbols.slice(0, rel.pos);
    const after = builderSymbols.slice(rel.pos + rel.len);
    builderSymbols = [...before, ...rel.replacement, ...after];
    builderRender('relation');
}

/** Highlight word tokens at [pos, pos+len) with a type-specific class */
function highlightTokens(pos, len, type) {
    const tokens = builderWordEl.querySelectorAll('.letter-token');
    tokens.forEach(t => {
        t.classList.remove('highlight-cancel', 'highlight-commute', 'highlight-braid');
    });
    for (let i = pos; i < pos + len; i++) {
        const tok = builderWordEl.querySelector(`.letter-token[data-idx="${i}"]`);
        if (tok) tok.classList.add(`highlight-${type}`);
    }
}

/** Clear all token highlights */
function clearHighlights() {
    const tokens = builderWordEl.querySelectorAll('.letter-token');
    tokens.forEach(t => {
        t.classList.remove('highlight-cancel', 'highlight-commute', 'highlight-braid');
    });
}

/** Render the relation chips into the relations panel */
function renderRelations(relations) {
    if (!relationsSection || !relationsContainer) return;

    if (relations.length === 0) {
        relationsSection.style.display = 'none';
        relationsContainer.innerHTML = '';
        return;
    }

    relationsSection.style.display = '';
    relationsCount.textContent = relations.length;
    relationsContainer.innerHTML = '';

    for (const rel of relations) {
        const chip = document.createElement('button');
        chip.className = `relation-chip ${rel.type}`;

        const icon = document.createElement('span');
        icon.className = 'rel-icon';
        icon.textContent = rel.icon;
        chip.appendChild(icon);

        const text = document.createElement('span');
        text.textContent = rel.label;
        chip.appendChild(text);

        // Position indicator
        const posTag = document.createElement('span');
        posTag.style.opacity = '0.5';
        posTag.style.fontSize = '0.65rem';
        posTag.style.marginLeft = '0.2rem';
        posTag.textContent = `@${rel.pos + 1}`;
        chip.appendChild(posTag);

        // Hover: highlight affected tokens
        chip.addEventListener('mouseenter', () => {
            highlightTokens(rel.pos, rel.len, rel.type);
        });
        chip.addEventListener('mouseleave', () => {
            clearHighlights();
        });

        // Click: apply the relation
        chip.addEventListener('click', () => {
            applyRelation(rel);
        });

        relationsContainer.appendChild(chip);
    }
}



// ============================================================
//  Search Control
// ============================================================

function getActiveGenerators() {
    const checkboxes = document.querySelectorAll('input[name="generator"]:checked');
    return [...checkboxes].map(cb => cb.value);
}

function startSearch() {
    if (solver && solver.running) return;

    // Validate custom ring if selected
    if (ringSelect.value === 'custom' && !customParsedPoly) {
        addLogLine('⚠️ Please enter a valid polynomial for the custom ring.', false);
        customPolyInput.focus();
        return;
    }

    // Clear previous results
    solutionsList.innerHTML = '';
    logArea.innerHTML = '';
    flashPoolEl.innerHTML = '';

    const activeRing = getActiveRing();
    const dim = getStrandCount() - 1;

    const config = {
        beamWidth: parseInt(beamWidthInput.value) || 500,
        flashSize: parseInt(flashSizeInput.value) || 30,
        maxIterations: parseInt(maxIterInput.value) || 100,
        ringValue: ringSelect.value === 'custom' ? 'none' : ringSelect.value,
        customRing: ringSelect.value === 'custom' ? activeRing : undefined,
        activeGenerators: getActiveGenerators(),
        onIteration: onIteration,
        onSolution: onSolution,
        onComplete: onComplete
    };

    // If F₂ mode, pass custom generators
    if (currentGroup === 'F2') {
        const f2 = makeF2Generators();
        if (!f2) {
            addLogLine('⚠️ F₂ mode requires at least 4 strands.', false);
            return;
        }
        config.customGenerators = f2;
    }

    solver = new FlashBeamSolver(config);

    btnStart.disabled = true;
    btnStop.disabled = false;
    statusState.textContent = 'RUNNING';
    statusState.classList.add('running');
    statusState.classList.remove('idle');

    const n = getStrandCount();
    const ringLabel = ringSelect.value === 'custom'
        ? `Custom: ${customParsedPoly.toString()}`
        : ringSelect.options[ringSelect.selectedIndex].text;
    const groupLabel = currentGroup === 'F2' ? 'F₂ (X=σ₁σ₃⁻¹, Y=σ₁σ₂σ₃σ₁⁻¹σ₂⁻¹σ₁⁻¹)' : `B${subscriptDigit(n)}`;
    addLogLine(`Search started — Group: ${groupLabel}, Ring: ${ringLabel}`);
    addLogLine(`Beam: ${config.beamWidth}, Flash: ${config.flashSize}, Max iter: ${config.maxIterations}`);
    addLogLine(`Generators: ${config.activeGenerators.join(', ')}`);

    solver.start();
}

function stopSearch() {
    if (solver) solver.stop();
}

function onIteration(data) {
    statusIteration.textContent = data.iteration;
    statusBestScore.textContent = data.bestScore === Infinity ? '∞' : data.bestScore.toFixed(2);
    statusExplored.textContent = data.nodesExplored.toLocaleString();
    statusSolutions.textContent = data.solutionsFound;

    // Update flash pool display
    flashPoolEl.innerHTML = '';
    for (const f of data.topFlash) {
        const tag = document.createElement('span');
        tag.className = 'flash-tag';
        tag.textContent = `${formatWord(f.word)} (${f.score})`;
        flashPoolEl.appendChild(tag);
    }

    // Periodic log
    if (data.iteration % 5 === 0 || data.iteration <= 3) {
        addLogLine(`Iter ${data.iteration}: best=${data.bestScore.toFixed(4)}, beam=${data.beamSize}, explored=${data.nodesExplored}`);
    }
}

function onSolution(node) {
    const dim = getStrandCount() - 1;
    addLogLine(`🎯 RELATION FOUND: ${formatWord(node.word)} (length ${node.wordLength})`, true);

    const card = document.createElement('div');
    card.className = 'solution-card';

    const wordEl = document.createElement('div');
    wordEl.className = 'word';
    wordEl.textContent = formatWord(node.word);

    const lenEl = document.createElement('div');
    lenEl.className = 'word-length';
    lenEl.textContent = `Word length: ${node.wordLength}`;

    const matEl = document.createElement('div');
    matEl.className = 'matrix-display';
    matEl.innerHTML = `Verified: \\(${matToLatex(node.matrix)} = I\\)`;

    card.appendChild(wordEl);
    card.appendChild(lenEl);
    card.appendChild(matEl);
    solutionsList.prepend(card);

    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([card]);
    }
}

function onComplete(stats) {
    btnStart.disabled = false;
    btnStop.disabled = true;
    statusState.textContent = 'IDLE';
    statusState.classList.remove('running');
    statusState.classList.add('idle');

    const elapsed = (stats.elapsed / 1000).toFixed(2);
    statusElapsed.textContent = `${elapsed}s`;
    addLogLine(`Search complete: ${stats.solutionsFound} relations found in ${elapsed}s (${stats.nodesExplored.toLocaleString()} nodes explored)`);
}


// ============================================================
//  Manual Word Computation
// ============================================================

function computeWord() {
    const input = wordInputEl.value.trim();
    if (!input) return;

    const tokens = input.split(/\s+/);
    const genMap = {};
    const symMap = {}; // token → canonical symbol for handle reduction
    for (const g of generators) {
        genMap[g.symbol] = g.matrix;
        genMap[g.name] = g.matrix;
        symMap[g.symbol] = g.symbol;
        symMap[g.name] = g.symbol;
    }
    // Also allow common aliases for the first 3 generators
    if (genMap['s1']) { genMap['a'] = genMap['s1']; genMap['A'] = genMap['S1']; symMap['a'] = 's1'; symMap['A'] = 'S1'; }
    if (genMap['s2']) { genMap['b'] = genMap['s2']; genMap['B'] = genMap['S2']; symMap['b'] = 's2'; symMap['B'] = 'S2'; }
    if (genMap['s3']) { genMap['c'] = genMap['s3']; genMap['C'] = genMap['S3']; symMap['c'] = 's3'; symMap['C'] = 'S3'; }

    // Get current ring (including custom)
    const ring = getActiveRing();
    const n = getStrandCount();
    const dim = n - 1;

    let result = matIdentity(dim);
    const canonicalSymbols = []; // for permutation and handle reduction
    for (const tok of tokens) {
        const mat = genMap[tok];
        if (!mat) {
            manualResultEl.innerHTML = `<span style="color:var(--accent-red)">Unknown generator: "${tok}"</span>`;
            return;
        }
        let m = mat;
        if (ring) m = ring.reduceMatrix(m);
        result = matMul(result, m, ring);
        canonicalSymbols.push(symMap[tok] || tok);
    }

    const isId = matEquals(result, matIdentity(dim));
    const latex = matToLatex(result);

    // Induced permutation
    const perm = inducedPermutation(canonicalSymbols, n);
    const isPure = isIdentityPermutation(perm);
    const cycleStr = permutationToCycleNotation(perm);
    const permHtml = isPure
        ? `<span class="perm-badge pure">🔗 Permutation: <strong>e</strong> (identity) — <em>pure braid</em></span>`
        : `<span class="perm-badge">🔗 Permutation: <strong>${cycleStr}</strong></span>`;

    // Handle reduction (if toggled on)
    let hrHtml = '';
    if (calcHandleReduceToggle && calcHandleReduceToggle.checked) {
        const hrResult = handleReduction(canonicalSymbols, n);
        const formattedHR = formatHandleReductionResult(hrResult);
        hrHtml = hrResult.isTrivial
            ? `<div style="margin-top: 0.75rem;"><span class="hr-badge trivial">✅ Handle Reduction: ${formattedHR}</span></div>`
            : `<div style="margin-top: 0.75rem;"><span class="hr-badge nontrivial">🔶 Handle Reduction: ${formattedHR}</span></div>`;
    }

    manualResultEl.innerHTML = `
    <p>Result of <code>${input}</code>:</p>
    <div class="math-block">\\(${latex}\\)</div>
    <p style="color: ${isId ? 'var(--accent-green)' : 'var(--text-secondary)'}">
      ${isId ? '✅ This is the identity — relation found!' : '❌ Not the identity'}
    </p>
    <div style="margin-top: 0.75rem;">${permHtml}</div>
    ${hrHtml}
  `;

    if (window.MathJax && window.MathJax.typesetPromise) {
        MathJax.typesetPromise([manualResultEl]);
    }
}


// ============================================================
//  Utilities
// ============================================================

function formatWord(word) {
    if (currentGroup === 'F2') {
        const map = { 'x': 'X', 'y': 'Y', 'X': 'X⁻¹', 'Y': 'Y⁻¹' };
        return word.split(' ').map(tok => map[tok] || tok).join(' ');
    }
    // General: replace s1→σ₁, s2→σ₂, ..., S1→σ₁⁻¹, etc.
    return word.replace(/[sS]\d+/g, tok => {
        const gen = generatorBySymbol[tok];
        return gen ? gen.name : tok;
    });
}

function addLogLine(text, isSolution = false) {
    const line = document.createElement('div');
    line.className = 'log-line' + (isSolution ? ' solution' : '');
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    line.innerHTML = `<span class="timestamp">[${ts}]</span> ${text}`;
    logArea.appendChild(line);
    logArea.scrollTop = logArea.scrollHeight;
}


// ============================================================
//  Boot
// ============================================================

document.addEventListener('DOMContentLoaded', init);
