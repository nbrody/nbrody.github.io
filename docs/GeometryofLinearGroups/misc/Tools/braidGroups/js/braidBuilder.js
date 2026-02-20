/**
 * Braid Builder — Lightweight controller for the landing page.
 *
 * Provides:
 *  - Generator palette (σᵢ / σᵢ⁻¹ buttons)
 *  - Word display with undo / clear
 *  - Braid relation detection & application
 *  - 3D Braid Visualizer + Disk Mapping Class Visualizer
 *
 * Does NOT include: Burau matrices, quotient rings,
 * FlashBeam search, or word calculator.
 */

import { getStrandCount, setStrandCount, makeBurauGenerators } from './burau.js';
import { BraidVisualizer, getStrandColor } from './braidVisualizer.js';
import { DiskVisualizer } from './diskVisualizer.js';

// ============================================================
//  DOM References
// ============================================================

const strandSlider = document.getElementById('strand-slider');
const strandDisplay = document.getElementById('strand-display');
const heroTitle = document.getElementById('hero-title');
const genPalette = document.getElementById('gen-palette');
const wordDisplay = document.getElementById('word-display');
const wordBadge = document.getElementById('word-badge');
const btnUndo = document.getElementById('btn-undo');
const btnClear = document.getElementById('btn-clear');
const strandLegend = document.getElementById('braid-strand-legend');

// Relations
const relationsSection = document.getElementById('relations-section');
const relationsContainer = document.getElementById('relations-container');
const relationsCount = document.getElementById('relations-count');

// ============================================================
//  State
// ============================================================

let braidViz = null;
let diskViz = null;
let builderSymbols = [];
let generators, inverseMap;
let generatorBySymbol = {};

function rebuildGenerators() {
    const result = makeBurauGenerators();
    generators = result.generators;
    inverseMap = result.inverseMap;
    generatorBySymbol = {};
    for (const g of generators) {
        generatorBySymbol[g.symbol] = g;
    }
}
rebuildGenerators();

// ============================================================
//  Helpers
// ============================================================

function subscriptDigit(n) {
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).split('').map(d => subs[parseInt(d)]).join('');
}

function symbolToDisplayName(sym) {
    const gen = generatorBySymbol[sym];
    return gen ? gen.name : sym;
}

function genIndexOf(sym) {
    const m = sym.match(/[sS](\d+)/);
    return m ? parseInt(m[1]) : null;
}

function isInverseSymbol(sym) {
    return sym[0] === 'S';
}

// ============================================================
//  Generator Palette
// ============================================================

function renderPalette() {
    genPalette.innerHTML = '';

    const fwd = generators.filter(g => g.symbol[0] === 's');
    const inv = generators.filter(g => g.symbol[0] === 'S');

    for (let i = 0; i < fwd.length; i++) {
        const pair = document.createElement('div');
        pair.className = 'gen-pair';

        for (const gen of [fwd[i], inv[i]]) {
            const isInv = gen.symbol[0] === 'S';
            const btn = document.createElement('button');
            btn.className = `gen-btn ${isInv ? 'inv' : 'fwd'}`;
            btn.textContent = gen.name;
            btn.title = `Append ${gen.name}`;
            btn.addEventListener('click', () => appendSymbol(gen.symbol));
            pair.appendChild(btn);
        }

        genPalette.appendChild(pair);
    }
}

// ============================================================
//  Word Builder
// ============================================================

function appendSymbol(sym) {
    builderSymbols.push(sym);
    render('add');
}

function undo() {
    if (builderSymbols.length === 0) return;
    builderSymbols.pop();
    render('add');
}

function clear() {
    builderSymbols = [];
    render('add');
}

function render(transitionType = 'add') {
    const empty = builderSymbols.length === 0;

    btnUndo.disabled = empty;
    btnClear.disabled = empty;

    if (empty) {
        wordDisplay.innerHTML = '<span class="empty-word">click a generator to start…</span>';
        wordBadge.textContent = '';
        if (braidViz) braidViz.clear();
        if (diskViz) diskViz.clear();
        renderRelations([]);
        return;
    }

    // Build token spans
    wordDisplay.innerHTML = '';
    for (let i = 0; i < builderSymbols.length; i++) {
        const sym = builderSymbols[i];
        const isInverse = sym === sym.toUpperCase();
        const span = document.createElement('span');
        span.className = `letter-token ${isInverse ? 'gen-inv' : 'gen-fwd'}`;
        span.textContent = symbolToDisplayName(sym);
        span.dataset.idx = i;
        if (i < builderSymbols.length - 1) span.style.animation = 'none';
        wordDisplay.appendChild(span);
    }
    wordBadge.textContent = `(${builderSymbols.length})`;

    // Update visualizers
    if (braidViz) braidViz.setCrossings(builderSymbols, transitionType);
    if (diskViz) diskViz.setCrossings(builderSymbols, transitionType);

    // Relations
    renderRelations(findAllRelations(builderSymbols));
}

// ============================================================
//  Braid Relations
// ============================================================

function findAllRelations(symbols) {
    const rels = [];
    const n = symbols.length;

    for (let pos = 0; pos < n; pos++) {
        // 1. Free cancellation
        if (pos < n - 1) {
            const s1 = symbols[pos], s2 = symbols[pos + 1];
            if (inverseMap[s1] === s2) {
                rels.push({
                    type: 'cancel', pos, len: 2,
                    label: `${symbolToDisplayName(s1)}·${symbolToDisplayName(s2)} = 1`,
                    icon: '✕', replacement: []
                });
            }
        }
        // 2. Far commutativity
        if (pos < n - 1) {
            const s1 = symbols[pos], s2 = symbols[pos + 1];
            const g1 = genIndexOf(s1), g2 = genIndexOf(s2);
            if (g1 !== null && g2 !== null && Math.abs(g1 - g2) >= 2) {
                rels.push({
                    type: 'commute', pos, len: 2,
                    label: `${symbolToDisplayName(s1)} ↔ ${symbolToDisplayName(s2)}`,
                    icon: '⇄', replacement: [s2, s1]
                });
            }
        }
        // 3. Braid (Yang–Baxter)
        if (pos < n - 2) {
            const s1 = symbols[pos], s2 = symbols[pos + 1], s3 = symbols[pos + 2];
            if (s1 === s3) {
                const g1 = genIndexOf(s1), g2 = genIndexOf(s2);
                const inv1 = isInverseSymbol(s1), inv2 = isInverseSymbol(s2);
                if (g1 !== null && g2 !== null && Math.abs(g1 - g2) === 1 && inv1 === inv2) {
                    const n1 = symbolToDisplayName(s1), n2 = symbolToDisplayName(s2);
                    rels.push({
                        type: 'braid', pos, len: 3,
                        label: `${n1}${n2}${n1} ↔ ${n2}${n1}${n2}`,
                        icon: '⟳', replacement: [s2, s1, s2]
                    });
                }
            }
        }
    }
    return rels;
}

function applyRelation(rel) {
    const before = builderSymbols.slice(0, rel.pos);
    const after = builderSymbols.slice(rel.pos + rel.len);
    builderSymbols = [...before, ...rel.replacement, ...after];
    render('relation');
}

function highlightTokens(pos, len, type) {
    const tokens = wordDisplay.querySelectorAll('.letter-token');
    tokens.forEach(t => t.classList.remove('highlight-cancel', 'highlight-commute', 'highlight-braid'));
    for (let i = pos; i < pos + len; i++) {
        const tok = wordDisplay.querySelector(`.letter-token[data-idx="${i}"]`);
        if (tok) tok.classList.add(`highlight-${type}`);
    }
}

function clearHighlights() {
    wordDisplay.querySelectorAll('.letter-token').forEach(t =>
        t.classList.remove('highlight-cancel', 'highlight-commute', 'highlight-braid')
    );
}

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

        const posTag = document.createElement('span');
        posTag.style.opacity = '0.5';
        posTag.style.fontSize = '0.65rem';
        posTag.style.marginLeft = '0.2rem';
        posTag.textContent = `@${rel.pos + 1}`;
        chip.appendChild(posTag);

        chip.addEventListener('mouseenter', () => highlightTokens(rel.pos, rel.len, rel.type));
        chip.addEventListener('mouseleave', () => clearHighlights());
        chip.addEventListener('click', () => applyRelation(rel));

        relationsContainer.appendChild(chip);
    }
}

// ============================================================
//  Strand Count
// ============================================================

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

function handleStrandCountChange(n) {
    setStrandCount(n);
    rebuildGenerators();
    if (strandDisplay) strandDisplay.textContent = n;
    if (heroTitle) heroTitle.innerHTML = `Braid Group B<sub>${n}</sub>`;

    builderSymbols = [];
    render('add');
    renderPalette();
    updateStrandLegend();

    if (braidViz) braidViz.setStrandCount(n);
    if (diskViz) diskViz.setStrandCount(n);
}

// ============================================================
//  Init
// ============================================================

function init() {
    renderPalette();
    updateStrandLegend();

    if (strandSlider) {
        strandSlider.addEventListener('input', () => {
            handleStrandCountChange(parseInt(strandSlider.value));
        });
    }

    btnUndo.addEventListener('click', undo);
    btnClear.addEventListener('click', clear);

    // Init visualizers
    const braidCanvas = document.getElementById('braid-viz-canvas');
    if (braidCanvas) braidViz = new BraidVisualizer(braidCanvas);

    const diskCanvas = document.getElementById('disk-viz-canvas');
    if (diskCanvas) diskViz = new DiskVisualizer(diskCanvas);

    // Set initial title
    if (heroTitle) heroTitle.innerHTML = `Braid Group B<sub>${getStrandCount()}</sub>`;
}

init();
