/**
 * app.js — Main application: UI wiring, matrix input, results display
 */

// ─── State ───

let MQ = null;
let ringMathField = null;
const ringPolynomials = [];   // { latex, readable, id }

let currentRingResult = null; // SRingClosureResult or null
let currentField = null;      // NumberField or null

const generatorMatrices = []; // { id, inputElements: [[input DOM]], nfMatrix: NFMatrix }

// ─── Ring Presets ───

const RING_PRESETS = [
    { label: 'Z',              polys: [] },
    { label: 'Z[sqrt(2)]',    polys: ['x_1^2-2'] },
    { label: 'Z[sqrt(-1)]',   polys: ['x_1^2+1'] },
    { label: 'Z[sqrt(5)]',    polys: ['x_1^2-5'] },
    { label: 'Z[cbrt(2)]',    polys: ['x_1^3-2'] },
    { label: 'Z[zeta_5]',     polys: ['x_1^4+x_1^3+x_1^2+x_1+1'] },
    { label: 'Z[sqrt(2),sqrt(3)]', polys: ['x_1^2-2', 'x_2^2-3'] },
];

// ─── Full Presets (ring + group + generators) ───

const FULL_PRESETS = [
    {
        label: 'Z[sqrt(2)], GL_2, unipotent',
        ring: ['x_1^2-2'],
        group: 'GL', n: 2,
        generators: [
            [['1', '1'], ['0', '1']]
        ]
    },
    {
        label: 'Z, GL_2, SL_2(Z) gens',
        ring: [],
        group: 'GL', n: 2,
        generators: [
            [['1', '1'], ['0', '1']],
            [['1', '0'], ['1', '1']]
        ]
    },
    {
        label: 'Z, SL_2, upper unipotent',
        ring: [],
        group: 'SL', n: 2,
        generators: [
            [['1', '1'], ['0', '1']]
        ]
    },
    {
        label: 'Z[sqrt(2)], GL_2, diagonal',
        ring: ['x_1^2-2'],
        group: 'GL', n: 2,
        generators: [
            [['x_1', '0'], ['0', '1']]
        ]
    },
    {
        label: 'Z[i], SL_2, rotation',
        ring: ['x_1^2+1'],
        group: 'SL', n: 2,
        generators: [
            [['x_1', '0'], ['0', '-x_1']]
        ]
    },
    {
        label: 'Z, GL_3, upper unipotent',
        ring: [],
        group: 'GL', n: 3,
        generators: [
            [['1', '1', '0'], ['0', '1', '0'], ['0', '0', '1']],
            [['1', '0', '0'], ['0', '1', '1'], ['0', '0', '1']]
        ]
    },
];

// ─── Init ───

$(document).ready(function () {
    MQ = MathQuill.getInterface(2);
    ringMathField = MQ.MathField(document.getElementById('mq-ring-input'), {
        spaceBehavesLikeTab: true,
        handlers: { enter: () => addRingPolynomial() }
    });
    ringMathField.focus();

    // Ring buttons
    document.getElementById('btn-add-poly').addEventListener('click', addRingPolynomial);
    document.getElementById('btn-clear-polys').addEventListener('click', clearRingPolynomials);
    document.getElementById('btn-compute-ring').addEventListener('click', computeRing);

    // Generator buttons
    document.getElementById('btn-add-gen').addEventListener('click', () => addGenerator());
    document.getElementById('btn-clear-gens').addEventListener('click', clearGenerators);

    // Group selector
    document.getElementById('group-select').addEventListener('change', updateGroupInfo);
    document.getElementById('matrix-size').addEventListener('change', () => {
        updateGroupInfo();
        rebuildGeneratorGrids();
    });

    // Compute button
    document.getElementById('btn-compute').addEventListener('click', computeZariskiClosureUI);

    // Build ring presets
    const ringPresetsEl = document.getElementById('ring-presets');
    for (const preset of RING_PRESETS) {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => loadRingPreset(preset));
        ringPresetsEl.appendChild(btn);
    }

    // Build full presets
    const fullPresetsEl = document.getElementById('full-presets');
    for (const preset of FULL_PRESETS) {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => loadFullPreset(preset));
        fullPresetsEl.appendChild(btn);
    }

    updateGroupInfo();
    updateComputeButton();
});

// ─── Ring polynomial management ───

function addRingPolynomial() {
    const latex = ringMathField.latex();
    if (!latex.trim()) return;
    const readable = latexToPolynomial(latex);
    if (!readable) return;
    ringPolynomials.push({ latex, readable, id: Date.now() });
    updateRingPolyList();
    ringMathField.latex('');
    ringMathField.focus();
    updateRingComputeButton();
    resetRingResult();
}

function removeRingPolynomial(id) {
    const idx = ringPolynomials.findIndex(p => p.id === id);
    if (idx !== -1) ringPolynomials.splice(idx, 1);
    updateRingPolyList();
    updateRingComputeButton();
    resetRingResult();
}

function clearRingPolynomials() {
    ringPolynomials.length = 0;
    updateRingPolyList();
    updateRingComputeButton();
    resetRingResult();
    ringMathField.latex('');
    ringMathField.focus();
}

function loadRingPreset(preset) {
    ringPolynomials.length = 0;
    preset.polys.forEach((p, i) => {
        ringPolynomials.push({ latex: p, readable: latexToPolynomial(p), id: Date.now() + i });
    });
    updateRingPolyList();
    updateRingComputeButton();
    resetRingResult();
    ringMathField.latex('');
    // Auto-compute if there are polynomials (or if it's Z)
    if (preset.polys.length === 0) {
        // A = Z: trivial field
        setTrivialField();
    }
}

function updateRingPolyList() {
    const el = document.getElementById('ring-poly-list');
    el.innerHTML = '';
    ringPolynomials.forEach((poly, i) => {
        const item = document.createElement('div');
        item.className = 'poly-item';
        item.innerHTML = `
            <span class="poly-item__math">\\(f_{${i + 1}} = ${poly.latex} = 0\\)</span>
            <button class="poly-item__remove" data-id="${poly.id}">Remove</button>
        `;
        item.querySelector('.poly-item__remove').addEventListener('click', () => removeRingPolynomial(poly.id));
        el.appendChild(item);
    });
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]);
}

function updateRingComputeButton() {
    document.getElementById('btn-compute-ring').disabled = (ringPolynomials.length === 0);
}

function resetRingResult() {
    currentRingResult = null;
    currentField = null;
    hide('ring-status');
    updateComputeButton();
}

function setTrivialField() {
    const trivField = new NumberField(QPolynomial.fromIntCoeffs([-1, 1]), '1');
    currentField = trivField;
    currentRingResult = new SRingClosureResult();
    currentRingResult.field = trivField;
    currentRingResult.integralBasis = computeIntegralBasis(trivField);

    const statusEl = document.getElementById('ring-status-inner');
    statusEl.innerHTML = '\\(A = \\mathbb{Z}\\), \\(K = \\mathbb{Q}\\), \\([K:\\mathbb{Q}] = 1\\)';
    show('ring-status');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([statusEl]);
    updateComputeButton();
}

// ─── Compute ring ───

function computeRing() {
    if (ringPolynomials.length === 0) return;
    hideResults();

    try {
        const allVarsSet = new Set();
        for (const p of ringPolynomials) {
            for (const v of extractVariables(p.readable)) allVarsSet.add(v);
        }
        const allVars = [...allVarsSet].sort((a, b) =>
            parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0])
        );

        const polyData = ringPolynomials.map(p => ({ latex: p.latex, readable: p.readable }));
        const sResult = computeSRingClosure(polyData, allVars);

        currentRingResult = sResult;
        currentField = sResult.field;

        const K = sResult.field;
        const sig = K.signature();
        let html = `\\(K = ${K.toLatex()}\\), \\([K:\\mathbb{Q}] = ${K.n}\\)`;
        if (K.n > 1) {
            html += `, \\(f(x) = ${K.minPoly.toLatex(K.name)}\\)`;
            html += `, \\((r,s) = (${sig.r}, ${sig.s})\\)`;
        }

        const statusEl = document.getElementById('ring-status-inner');
        statusEl.innerHTML = html;
        show('ring-status');
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([statusEl]);
        updateComputeButton();

    } catch (err) {
        console.error(err);
        const statusEl = document.getElementById('ring-status-inner');
        statusEl.className = 'status status--pending';
        statusEl.innerHTML = `Error: ${err.message}`;
        show('ring-status');
    }
}

// ─── Group info ───

function updateGroupInfo() {
    const groupType = document.getElementById('group-select').value;
    const n = parseInt(document.getElementById('matrix-size').value) || 2;
    const group = _makeGroup(groupType, n);

    let html = `\\(\\mathbb{G} = ${group.toLatex()}\\)`;
    if (group.equations.length > 0) {
        html += `, defined by \\(${group.equationsLatex()}\\)`;
    }
    if (group.dim() >= 0) {
        html += `, \\(\\dim = ${group.dim()}\\)`;
    }

    const el = document.getElementById('group-info');
    el.innerHTML = html;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]);
}

function _makeGroup(type, n) {
    switch (type) {
        case 'GL': return AlgebraicGroup.GL(n);
        case 'SL': return AlgebraicGroup.SL(n);
        case 'B':  return AlgebraicGroup.upperTriangular(n);
        case 'U':  return AlgebraicGroup.unipotent(n);
        case 'T':  return AlgebraicGroup.diagonal(n);
        default:   return AlgebraicGroup.GL(n);
    }
}

// ─── Generator management ───

function getMatrixSize() {
    return parseInt(document.getElementById('matrix-size').value) || 2;
}

function addGenerator(values) {
    const n = getMatrixSize();
    const id = Date.now();
    const genIndex = generatorMatrices.length + 1;

    const container = document.createElement('div');
    container.className = 'generator-item';
    container.id = `gen-${id}`;

    // Label
    const label = document.createElement('div');
    label.className = 'generator-item__label';
    label.textContent = `g${genIndex}`;
    container.appendChild(label);

    // Matrix grid
    const matDiv = document.createElement('div');
    matDiv.className = 'generator-item__matrix';
    const grid = document.createElement('div');
    grid.className = 'matrix-grid';
    grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;

    const inputElements = [];
    for (let i = 0; i < n; i++) {
        inputElements.push([]);
        for (let j = 0; j < n; j++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = i === j ? '1' : '0';
            if (values && values[i] && values[i][j]) {
                input.value = values[i][j];
            }
            input.addEventListener('change', updateComputeButton);
            inputElements[i].push(input);
            grid.appendChild(input);
        }
    }
    matDiv.appendChild(grid);
    container.appendChild(matDiv);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'generator-item__actions';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'button button--tiny button--danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => removeGenerator(id));
    actions.appendChild(removeBtn);
    container.appendChild(actions);

    document.getElementById('generator-list').appendChild(container);
    generatorMatrices.push({ id, inputElements, n });
    updateComputeButton();
}

function removeGenerator(id) {
    const idx = generatorMatrices.findIndex(g => g.id === id);
    if (idx !== -1) {
        generatorMatrices.splice(idx, 1);
        const el = document.getElementById(`gen-${id}`);
        if (el) el.remove();
    }
    // Renumber labels
    const labels = document.querySelectorAll('.generator-item__label');
    labels.forEach((lbl, i) => { lbl.textContent = `g${i + 1}`; });
    updateComputeButton();
}

function clearGenerators() {
    generatorMatrices.length = 0;
    document.getElementById('generator-list').innerHTML = '';
    updateComputeButton();
}

function rebuildGeneratorGrids() {
    // When matrix size changes, clear existing generators
    clearGenerators();
}

// ─── Full preset loading ───

function loadFullPreset(preset) {
    // Load ring
    ringPolynomials.length = 0;
    preset.ring.forEach((p, i) => {
        ringPolynomials.push({ latex: p, readable: latexToPolynomial(p), id: Date.now() + i });
    });
    updateRingPolyList();
    updateRingComputeButton();

    if (preset.ring.length === 0) {
        setTrivialField();
    } else {
        computeRing();
    }

    // Set group
    document.getElementById('group-select').value = preset.group;
    document.getElementById('matrix-size').value = preset.n;
    updateGroupInfo();

    // Load generators
    clearGenerators();
    for (const genValues of preset.generators) {
        addGenerator(genValues);
    }

    ringMathField.latex('');
    updateComputeButton();
}

// ─── Parse matrix entries ───

/**
 * Parse a string entry as an NFElement in the current field.
 * Supports: integers, fractions, and expressions with x_1 (the generator).
 */
function parseEntry(str, field) {
    str = str.trim();
    if (!str || str === '') {
        return field.zero();
    }

    // Handle simple integers
    if (/^-?\d+$/.test(str)) {
        return field.fromRational(BigRational.fromInt(parseInt(str)));
    }

    // Handle fractions like "1/2"
    if (/^-?\d+\/\d+$/.test(str)) {
        const parts = str.split('/');
        return field.fromRational(new BigRational(BigInt(parseInt(parts[0])), BigInt(parseInt(parts[1]))));
    }

    // Handle expressions with the generator (x_1 or sqrt notation)
    // Convert to NFElement by parsing as a polynomial in the generator
    if (field.n === 1) {
        // K = Q, no generator
        throw new Error(`Cannot parse "${str}" as a rational number`);
    }

    // Attempt to parse as a polynomial in the generator
    // Supported formats:
    //   "x_1", "2*x_1", "x_1^2", "1+x_1", "1+2*x_1+3*x_1^2"
    //   "sqrt(2)" => x_1 (if field is Q(sqrt(2)))
    //   "i" => x_1 (if field is Q(i))

    // Normalize: replace sqrt(...) with x_1
    let normalized = str.replace(/sqrt\([^)]+\)/g, 'x_1');
    // Replace bare 'i' (but not in 'sin', 'in', etc.) with x_1 if field is Q(i)-like
    if (field.n === 2 && /^[^a-hj-z]*i[^a-hj-z]*$/i.test(str)) {
        normalized = str.replace(/\bi\b/g, 'x_1');
    }
    // Replace alpha, a with x_1
    normalized = normalized.replace(/\\alpha/g, 'x_1').replace(/\balpha\b/g, 'x_1');

    // Parse as polynomial
    normalized = normalized.replace(/\s+/g, '');
    normalized = normalized.replace(/\*\*/g, '^');
    // Implicit multiplication: "2x" -> "2*x"
    normalized = normalized.replace(/(\d)(x_)/g, '$1*$2');

    // Split into terms
    normalized = normalized.replace(/-/g, '+-');
    const terms = normalized.split('+').filter(t => t.length > 0);

    const coeffs = new Array(field.n).fill(null).map(() => BigRational.ZERO);

    for (const term of terms) {
        const varMatch = term.match(/x_(\d+)(\^(\d+))?/);
        if (!varMatch) {
            // Constant term
            const val = _parseRatStr(term);
            coeffs[0] = coeffs[0].add(val);
        } else {
            const power = varMatch[3] ? parseInt(varMatch[3]) : 1;
            if (power >= field.n) {
                throw new Error(`Power x_1^${power} too large for field of degree ${field.n}`);
            }
            // Extract coefficient
            let coeffStr = term.replace(/x_\d+(\^\d+)?/, '').replace(/\*/g, '');
            if (coeffStr === '' || coeffStr === '+') coeffStr = '1';
            if (coeffStr === '-') coeffStr = '-1';
            const val = _parseRatStr(coeffStr);
            coeffs[power] = coeffs[power].add(val);
        }
    }

    return field.fromCoeffs(coeffs);
}

function _parseRatStr(s) {
    s = s.trim();
    if (s.includes('/')) {
        const parts = s.split('/');
        return new BigRational(BigInt(parseInt(parts[0])), BigInt(parseInt(parts[1])));
    }
    return BigRational.fromInt(parseInt(s) || 0);
}

// ─── Build NFMatrix from UI inputs ───

function buildNFMatrix(gen) {
    const n = gen.n;
    const field = currentField;
    const entries = [];
    for (let i = 0; i < n; i++) {
        entries.push([]);
        for (let j = 0; j < n; j++) {
            const str = gen.inputElements[i][j].value || (i === j ? '1' : '0');
            entries[i].push(parseEntry(str, field));
        }
    }
    return new NFMatrix(n, entries, field);
}

// ─── Compute button state ───

function updateComputeButton() {
    const hasField = currentField !== null;
    const hasGens = generatorMatrices.length > 0;
    document.getElementById('btn-compute').disabled = !(hasField && hasGens);
}

// ─── Compute Zariski closure ───

function computeZariskiClosureUI() {
    if (!currentField || generatorMatrices.length === 0) return;

    hideResults();
    show('loading-card');

    setTimeout(() => {
        try {
            const groupType = document.getElementById('group-select').value;
            const n = getMatrixSize();
            const group = _makeGroup(groupType, n);
            const field = currentField;
            const d = field.n;
            const maxDeg = parseInt(document.getElementById('max-deg').value) || 2;
            const maxWordLen = parseInt(document.getElementById('max-word-len').value) || 6;

            // Parse generators
            const nfGenerators = [];
            for (const gen of generatorMatrices) {
                nfGenerators.push(buildNFMatrix(gen));
            }

            // Progress callback
            const loadingText = document.getElementById('loading-text');
            const progress = (msg) => { loadingText.textContent = msg; };

            // Compute
            const result = computeZariskiClosure(nfGenerators, group, field, {
                maxDeg,
                maxWordLength: maxWordLen,
                maxPoints: 300,
                progressCallback: progress
            });

            hide('loading-card');

            // Display results
            displayRingResult(field, d);
            displayResScalarsResult(result, group, field);
            displayClosureResult(result, group);
            displayIdealResult(result);

        } catch (err) {
            hide('loading-card');
            console.error(err);
            show('result-closure-card');
            document.querySelector('#result-closure .result-box__content').innerHTML =
                `<p style="color: #ff8a9a;">Error: ${err.message}</p>`;
            if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
        }
    }, 50);
}

// ─── Display results ───

function displayRingResult(field, d) {
    let html = '';
    html += `<p><strong>Number field:</strong> \\(K = ${field.toLatex()}\\), \\([K:\\mathbb{Q}] = ${d}\\)</p>`;
    if (field.n > 1) {
        html += `<p><strong>Minimal polynomial:</strong> \\(${field.minPoly.toLatex(field.name)}\\)</p>`;
    }
    if (currentRingResult && currentRingResult.integralBasis && field.n > 1) {
        const basisElems = currentRingResult.integralBasis.basis();
        const basisStrs = basisElems.map(e => e.toLatex());
        html += `<p><strong>Ring of integers:</strong> \\(\\mathcal{O}_K = \\mathbb{Z}\\text{-span}\\{${basisStrs.join(', ')}\\}\\)</p>`;
    }

    document.querySelector('#result-ring .result-box__content').innerHTML = html;
    show('result-ring-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function displayResScalarsResult(result, group, field) {
    const n = group.n;
    const d = field.n;
    const N = result.matrixSize;

    let html = '';
    html += `<p><strong>Original group:</strong> \\(${group.toLatex()}\\) (\\(${n} \\times ${n}\\) matrices over \\(K\\))</p>`;
    html += `<p><strong>Restriction of scalars:</strong> \\(\\mathrm{Res}_{K/\\mathbb{Q}}(${group.toLatex()})\\) `;
    html += `(\\(${N} \\times ${N}\\) matrices over \\(\\mathbb{Q}\\))</p>`;

    // Show restricted generators
    if (result.generators.length > 0 && N <= 6) {
        html += `<p><strong>Restricted generators:</strong></p>`;
        result.generators.forEach((g, i) => {
            html += `<p>\\(g_{${i + 1}} = ${g.toLatex()}\\)</p>`;
        });
    }

    html += `<p><strong>Group elements enumerated:</strong> ${result.numPoints}</p>`;
    html += `<p><strong>Max word length:</strong> ${result.maxWordLength}</p>`;

    document.querySelector('#result-res .result-box__content').innerHTML = html;
    show('result-res-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function displayClosureResult(result, group) {
    let html = '';

    html += `<p>${result.description}</p>`;
    if (result.dimension >= 0) {
        html += `<p><strong>Estimated dimension:</strong> ${result.dimension}</p>`;
    }
    html += `<p><strong>Number of defining equations:</strong> ${result.ideal.length}</p>`;

    // Interpret the result
    if (result.ideal.length === 0) {
        html += `<p class="hint">No non-trivial vanishing conditions found. `;
        html += `The group \\(\\langle S \\rangle\\) may be Zariski-dense in \\(\\mathrm{Res}_{K/\\mathbb{Q}}(${group.toLatex()})\\), `;
        html += `or a higher polynomial degree bound may be needed.</p>`;
    }

    document.querySelector('#result-closure .result-box__content').innerHTML = html;
    show('result-closure-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function displayIdealResult(result) {
    if (result.ideal.length === 0) {
        hide('result-ideal-card');
        return;
    }

    const N = result.matrixSize;
    const varNames = zariskiVarNames(N);

    let html = '';
    html += `<p><strong>Degree bound:</strong> ${result.degBound}</p>`;
    html += `<p><strong>Vanishing ideal generators:</strong></p>`;

    const maxToShow = 20;
    const toShow = result.ideal.slice(0, maxToShow);
    html += '<div style="margin: 0.5rem 0;">';
    toShow.forEach((p, i) => {
        html += `<p>\\(p_{${i + 1}} = ${p.toLatex(varNames)} = 0\\)</p>`;
    });
    if (result.ideal.length > maxToShow) {
        html += `<p class="hint">... and ${result.ideal.length - maxToShow} more equations</p>`;
    }
    html += '</div>';

    if (result.stats && result.stats.iterations) {
        html += '<p class="hint">';
        html += `Gr&ouml;bner basis stats: ${result.stats.iterations} iterations, `;
        html += `${result.stats.sPolys} S-polys, `;
        html += `${result.stats.basisAdded} basis additions`;
        html += '</p>';
    }

    document.querySelector('#result-ideal .result-box__content').innerHTML = html;
    show('result-ideal-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

// ─── Visibility ───

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function hideResults() {
    ['loading-card', 'result-ring-card', 'result-res-card', 'result-closure-card', 'result-ideal-card']
        .forEach(hide);
}
