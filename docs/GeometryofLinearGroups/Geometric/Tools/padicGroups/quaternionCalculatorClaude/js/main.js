// main.js — Slide controller, computation engine, and UI wiring

import {
    QMath, QBig, formatQuaternion, formatBigQuaternion,
    parseQuaternion, parseBigQuaternion, getPrimeFactors
} from './quaternion.js';

import {
    buildGenerators, computeRelations, generateSO3Z,
    computeFactorizationLattice, calculateTreePath
} from './generators.js';

import * as CayleyVis from './vis_cayley.js';
import { drawSquareComplex } from './vis_square.js';
import { drawTree, drawFactorLattice } from './vis_tree.js';

// ============================================================
// Global state
// ============================================================
let GENERATORS = {};
let RELATIONS = [];
let XY_SOLUTIONS = {};
let SO3Z_GROUP = null;

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

    const prev = slides[currentSlide];
    const next = slides[index];
    const forward = index > currentSlide;

    // Exit current
    resetSlideAnimations(prev);
    prev.classList.remove('active');
    prev.classList.add(forward ? 'exit-up' : 'exit-down');
    setTimeout(() => prev.classList.remove('exit-up', 'exit-down'), 600);

    // Enter new
    next.classList.add(forward ? 'enter-from-below' : 'enter-from-above');
    void next.offsetHeight; // reflow
    next.classList.remove('enter-from-below', 'enter-from-above');
    next.classList.add('active');

    currentSlide = index;
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;

    document.querySelectorAll('.progress-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
        if (i < currentSlide) d.classList.add('visited');
    });

    onSlideActivated(currentSlide);
    setTimeout(() => triggerSlideAnimations(next), 250);
    retypeset();
}

prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

document.addEventListener('keydown', e => {
    // Don't navigate if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToSlide(currentSlide + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goToSlide(currentSlide - 1); }
});

// ============================================================
// Slide animations
// ============================================================
function triggerSlideAnimations(el) {
    el.querySelectorAll('.reveal-list li').forEach((li, i) => {
        setTimeout(() => li.classList.add('visible'), i * 200);
    });
    el.querySelectorAll('.stagger').forEach(el => el.classList.add('visible'));
    el.querySelectorAll('.fade-in').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 150);
    });
}

function resetSlideAnimations(el) {
    el.querySelectorAll('.reveal-list li').forEach(li => li.classList.remove('visible'));
    el.querySelectorAll('.stagger').forEach(el => el.classList.remove('visible'));
    el.querySelectorAll('.fade-in').forEach(el => el.classList.remove('visible'));
}

function retypeset() {
    if (window.MathJax?.typeset) {
        try { MathJax.typeset(); } catch (e) { /* ok */ }
    }
}

// ============================================================
// Canvas mode switching
// ============================================================
const threeCanvas = document.getElementById('three-canvas');
const svgCanvas = document.getElementById('svg-canvas');
const genBar = document.getElementById('gen-bar');

function showThree() { threeCanvas.style.display = 'block'; svgCanvas.style.display = 'none'; }
function showSvg() { threeCanvas.style.display = 'none'; svgCanvas.style.display = 'block'; }

function onSlideActivated(idx) {
    const mode = slides[idx].dataset.canvas;

    switch (mode) {
        case 'intro':
            showThree();
            genBar.classList.remove('visible');
            if (Object.keys(GENERATORS).length > 0) {
                updateCayley();
            }
            break;
        case 'so3z':
            showThree();
            genBar.classList.remove('visible');
            if (SO3Z_GROUP) {
                CayleyVis.drawSO3Z(threeCanvas, SO3Z_GROUP);
                setBadge('SO₃(Z) — 24 elements');
            }
            break;
        case 'generators':
            showThree();
            genBar.classList.add('visible');
            if (Object.keys(GENERATORS).length > 0) {
                updateCayley();
            }
            break;
        case 'square':
            showSvg();
            genBar.classList.remove('visible');
            updateSquareComplex();
            break;
        case 'cayley':
            showThree();
            genBar.classList.add('visible');
            updateCayley();
            break;
        case 'factor':
            showSvg();
            genBar.classList.remove('visible');
            break;
        case 'multiply':
            showThree();
            genBar.classList.remove('visible');
            break;
        case 'tree':
            showSvg();
            genBar.classList.remove('visible');
            break;
    }
}

function setBadge(text) {
    document.getElementById('canvas-badge').textContent = text;
}

function setStatus(text) {
    document.getElementById('canvas-status').textContent = text;
}

// ============================================================
// Computation: generators and relations
// ============================================================
async function runComputation() {
    const input = document.getElementById('prime-input').value;
    const primes = input.split(/[,;\s]+/).map(s => parseInt(s.trim())).filter(p => !isNaN(p) && p > 2);

    if (primes.length === 0) {
        document.getElementById('generator-status').textContent = 'Enter at least one odd prime.';
        return;
    }

    const statusEl = document.getElementById('generator-status');
    statusEl.textContent = 'Computing...';

    // Small delay to let UI update
    await new Promise(r => setTimeout(r, 10));

    try {
        const result = buildGenerators(primes);
        GENERATORS = result.generators;
        XY_SOLUTIONS = result.xySolutions;
        RELATIONS = computeRelations(GENERATORS);

        const genKeys = Object.keys(GENERATORS);
        statusEl.textContent = `${genKeys.length} generators, ${RELATIONS.length} relations`;

        // Build generator cards
        buildGeneratorCards();
        populateGenSelects();
        updateGenBar();
        updateCayley();

        setBadge(`SO₃(Z[1/${primes.join(',')}])`);
        retypeset();

    } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
    }
}

function buildGeneratorCards() {
    const container = document.getElementById('generator-cards');
    container.innerHTML = '';

    for (const [key, gen] of Object.entries(GENERATORS)) {
        const card = document.createElement('div');
        card.className = 'gen-card';
        card.style.borderColor = gen.color;

        card.innerHTML = `
            <div class="gen-label" style="color:${gen.color}">${key}</div>
            <div class="gen-quat">$${gen.formatted}$</div>
            <div class="gen-p1">P¹: ${gen.p1Label} | p=${gen.prime}</div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.gen-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
        });

        container.appendChild(card);
    }

    retypeset();
}

function populateGenSelects() {
    const selX = document.getElementById('gen-x');
    const selY = document.getElementById('gen-y');
    selX.innerHTML = '';
    selY.innerHTML = '';

    const keys = Object.keys(GENERATORS);

    // Group by prime
    const primeGroups = new Map();
    for (const key of keys) {
        const p = GENERATORS[key].prime;
        if (!primeGroups.has(p)) primeGroups.set(p, []);
        primeGroups.get(p).push(key);
    }

    const primes = [...primeGroups.keys()].sort((a, b) => a - b);

    for (const p of primes) {
        const group = primeGroups.get(p);
        for (const key of group) {
            const gen = GENERATORS[key];
            const label = `${key} (p=${p}): ${gen.p1Label}`;
            selX.add(new Option(label, key));
            selY.add(new Option(label, key));
        }
    }

    // Default: pick generators from different primes if possible
    if (primes.length >= 2) {
        const firstOfP1 = primeGroups.get(primes[0])[0];
        const firstOfP2 = primeGroups.get(primes[1])[0];
        selX.value = firstOfP1;
        selY.value = firstOfP2;
    } else if (keys.length >= 2) {
        selX.value = keys[0];
        selY.value = keys[1];
    }
}

function updateGenBar() {
    genBar.innerHTML = '';
    const keys = Object.keys(GENERATORS);

    for (const key of keys) {
        const gen = GENERATORS[key];
        const btn = document.createElement('button');
        btn.className = 'gen-btn';
        btn.style.borderColor = gen.color;
        btn.style.color = gen.color;
        btn.textContent = key;
        btn.title = `${gen.formatted} (p=${gen.prime})`;
        btn.addEventListener('click', () => {
            setStatus(`Applied ${key}`);
            setTimeout(() => setStatus(''), 1500);
        });
        genBar.appendChild(btn);
    }
}

// ============================================================
// Visualizations
// ============================================================
function updateCayley() {
    let depth = parseInt(document.getElementById('depth-slider').value) || 2;
    // For the intro slide, reduce points to a cleaner visual
    if (currentSlide === 0) depth = Math.min(depth, 2);
    const genX = document.getElementById('gen-x').value;
    const genY = document.getElementById('gen-y').value;

    CayleyVis.drawCayley(GENERATORS, depth, genX, genY);
}

function updateSquareComplex() {
    const depth = parseInt(document.getElementById('depth-slider').value) || 2;
    const genX = document.getElementById('gen-x').value;
    const genY = document.getElementById('gen-y').value;

    const stats = drawSquareComplex(svgCanvas, GENERATORS, RELATIONS, depth, genX, genY);

    if (stats) {
        const resultEl = document.getElementById('relation-stats');
        resultEl.style.display = 'block';

        // Count per-prime-pair expected relations
        const pX = GENERATORS[genX]?.prime;
        const pY = GENERATORS[genY]?.prime;
        const expected = pX && pY ? (pX + 1) * (pY + 1) : '?';

        resultEl.className = 'result-box info';
        resultEl.innerHTML = `
            <strong>Relations:</strong> ${stats.totalRelations} total
            (expected $(${pX}+1)(${pY}+1) = ${expected}$)<br>
            <strong>Degenerate:</strong> ${stats.degenerateCount} (generators commute)<br>
            <strong>Squares filled:</strong> ${stats.squaresFilled}
        `;
        retypeset();
    }
}

// ============================================================
// Multiplication
// ============================================================
function runMultiplication() {
    const input = document.getElementById('mult-input').value;
    const resDiv = document.getElementById('mult-result');
    const primitize = document.getElementById('mult-primitize').checked;

    try {
        let s = input.replace(/\s+/g, '');
        // Extract parenthesized factors
        let factors = [];
        const parenMatches = [...s.matchAll(/\(([^)]+)\)/g)];
        if (parenMatches.length > 0) {
            factors = parenMatches.map(m => m[1]);
        } else {
            factors = s.split(/\*+/).filter(x => x.length > 0);
        }
        if (factors.length === 0 && s.length > 0) factors = [s];

        let result = [1n, 0n, 0n, 0n];
        for (const f of factors) {
            result = QBig.multiply(result, parseBigQuaternion(f));
        }

        let output;
        const g = QBig.contentGcd(result);
        if (primitize && g > 1n) {
            const prim = result.map(x => x / g);
            output = `$${g} \\cdot (${formatBigQuaternion(prim)})$`;
        } else {
            output = `$${formatBigQuaternion(result)}$`;
        }

        resDiv.innerHTML = output;
        retypeset();
    } catch (err) {
        resDiv.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
    }
}

// ============================================================
// Word calculator
// ============================================================
function runWordCalculation() {
    const valA = document.getElementById('word-gen-a').value;
    const valB = document.getElementById('word-gen-b').value;
    const expr = document.getElementById('word-expr').value;
    const resDiv = document.getElementById('word-result');

    try {
        const genMap = {};
        const processGen = (name, text) => {
            const q = parseQuaternion(text);
            const bq = q.map(n => BigInt(Math.round(n)));
            genMap[name] = QBig.primitize(bq);
        };
        processGen('a', valA);
        processGen('b', valB);

        function evaluate(seg) {
            seg = seg.trim();
            if (!seg) return [1n, 0n, 0n, 0n];

            // Split by dots
            const tokens = [];
            let depth = 0, current = '';
            for (const ch of seg) {
                if (ch === '(') depth++;
                if (ch === ')') depth--;
                if (ch === '.' && depth === 0) {
                    if (current.trim()) tokens.push(current.trim());
                    current = '';
                } else current += ch;
            }
            if (current.trim()) tokens.push(current.trim());

            if (tokens.length > 1) {
                let res = [1n, 0n, 0n, 0n];
                for (const t of tokens) {
                    res = QBig.multiply(res, evaluate(t));
                    const g = QBig.contentGcd(res);
                    if (g > 1n) res = res.map(x => x / g);
                }
                return res;
            }

            let token = tokens[0].replace(/[_{}\s]/g, '');
            if (token.startsWith('(') && token.endsWith(')'))
                return evaluate(token.slice(1, -1));

            const isInv = token.endsWith('i');
            const key = isInv ? token.slice(0, -1) : token;
            if (!genMap[key]) throw new Error(`Unknown: ${token}`);
            const q = genMap[key];
            return isInv ? [q[0], -q[1], -q[2], -q[3]] : q;
        }

        let result = evaluate(expr);
        result = QBig.primitize(result);

        resDiv.innerHTML = `$${formatBigQuaternion(result)}$`;
        retypeset();
    } catch (err) {
        resDiv.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
    }
}

// ============================================================
// Factorization
// ============================================================
async function runFactorization() {
    const input = document.getElementById('factor-input').value;
    const resultEl = document.getElementById('factor-result');

    try {
        const q = parseQuaternion(input);
        const norm = QMath.normSq(q);
        const factors = getPrimeFactors(norm);
        const factorStr = Object.entries(factors).map(([p, e]) => `${p}^{${e}}`).join(' \\cdot ');

        resultEl.style.display = 'block';
        resultEl.className = 'result-box';
        resultEl.innerHTML = `Computing lattice for $${formatQuaternion(q)}$, norm $= ${norm} = ${factorStr}$...`;
        retypeset();

        const data = await computeFactorizationLattice(q);

        // Count paths
        const pathCount = countPaths(data.nodes, data.links, q);

        resultEl.className = 'result-box success';
        resultEl.innerHTML = `
            $q = ${formatQuaternion(q)}$, $\\quad |q|^2 = ${norm} = ${factorStr}$<br>
            <strong>${data.nodes.length}</strong> lattice nodes,
            <strong>${data.links.length}</strong> edges,
            <strong>${pathCount}</strong> distinct factorizations
        `;
        retypeset();

        // Draw on SVG
        drawFactorLattice(svgCanvas, data, q);
        showSvg();
        setBadge('Factor Complex');

    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.className = 'result-box';
        resultEl.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
    }
}

function countPaths(nodes, links, targetQ) {
    const adj = new Map();
    for (const l of links) {
        if (!adj.has(l.source)) adj.set(l.source, []);
        adj.get(l.source).push(l.target);
    }

    const maxLevel = Math.max(...nodes.map(n => n.level));
    const targetIds = new Set(nodes.filter(n => n.level === maxLevel).map(n => n.id));
    const memo = new Map();

    function solve(id) {
        if (targetIds.has(id)) return 1n;
        if (memo.has(id)) return memo.get(id);
        let count = 0n;
        for (const next of (adj.get(id) || [])) count += solve(next);
        memo.set(id, count);
        return count;
    }

    const start = nodes.find(n => n.level === 0);
    return start ? solve(start.id) : 0n;
}

// ============================================================
// Tree visualization
// ============================================================
async function runTreeVis() {
    const input = document.getElementById('tree-input').value;
    const resultEl = document.getElementById('tree-result');

    try {
        const q = parseQuaternion(input);
        const norm = QMath.normSq(q);
        const factors = getPrimeFactors(norm);
        const primeKeys = Object.keys(factors).map(Number);

        if (primeKeys.length === 0) throw new Error('Norm has no prime factors');

        const p = primeKeys[0];
        const data = await calculateTreePath(q, p);

        resultEl.innerHTML = `Tree for $p = ${p}$. Path: ${data.pathIndices.map(i => i === p ? '∞' : i).join(' → ')}`;
        retypeset();

        drawTree(svgCanvas, p, data.pathIndices, Math.min(data.pathIndices.length + 1, 5));
        showSvg();
        setBadge(`T_${p} — Bruhat–Tits Tree`);

    } catch (err) {
        resultEl.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
    }
}

// ============================================================
// Initialize
// ============================================================
function init() {
    // Init Three.js canvas
    CayleyVis.initCayley(threeCanvas);

    // Generate SO3(Z) eagerly
    SO3Z_GROUP = generateSO3Z();

    // Event listeners
    document.getElementById('compute-btn').addEventListener('click', runComputation);

    const depthSlider = document.getElementById('depth-slider');
    depthSlider.addEventListener('input', () => {
        document.getElementById('depth-value').textContent = depthSlider.value;
    });
    depthSlider.addEventListener('change', () => {
        const mode = slides[currentSlide].dataset.canvas;
        if (mode === 'square') updateSquareComplex();
        else if (mode === 'cayley') updateCayley();
    });

    document.getElementById('gen-x').addEventListener('change', () => {
        const mode = slides[currentSlide].dataset.canvas;
        if (mode === 'square') updateSquareComplex();
        else updateCayley();
    });
    document.getElementById('gen-y').addEventListener('change', () => {
        const mode = slides[currentSlide].dataset.canvas;
        if (mode === 'square') updateSquareComplex();
        else updateCayley();
    });

    document.getElementById('mult-btn').addEventListener('click', runMultiplication);
    document.getElementById('word-btn').addEventListener('click', runWordCalculation);
    document.getElementById('factor-btn').addEventListener('click', runFactorization);
    document.getElementById('tree-btn').addEventListener('click', runTreeVis);

    document.getElementById('reset-view-btn').addEventListener('click', () => {
        CayleyVis.resetView();
    });

    // Resize
    window.addEventListener('resize', () => {
        CayleyVis.handleResize(threeCanvas);
    });

    // Initial slide animations
    setTimeout(() => triggerSlideAnimations(slides[0]), 300);
    retypeset();

    // Auto-run computation after a beat
    setTimeout(() => runComputation(), 500);
}

document.addEventListener('DOMContentLoaded', init);
