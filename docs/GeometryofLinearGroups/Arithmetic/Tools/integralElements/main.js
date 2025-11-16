/**
 * Import example library
 */
import { exampleLibrary } from './exampleLibrary.js';
import { Rational } from './rational.js';
import {
    multiplyMatrices,
    invertMatrix,
    matrixToString,
    primeFactors,
    getInvertedPrimes,
    getPrimesUsedByMatrix,
    matrixAvoidsPrimes
} from './matrixUtils.js';
import { runMCTS } from './mcts.js';
import { PGLElement } from './pgl.js';

/**
 * Global state for selected primes
 */
let selectedPrimes = new Set();
let seenPrimes = new Set(); // Track primes we've seen before
let mctsResults = []; // Store MCTS search results


/**
 * Convert LaTeX to expression string for math.js
 */
function latexToExpr(latex) {
    if (!latex || typeof latex !== 'string') return '0';
    let parserString = String(latex);

    // Normalize common wrappers / symbols
    parserString = parserString.replace(/\\left|\\right/g, '');
    parserString = parserString.replace(/\u2212/g, '-');
    parserString = parserString.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1)/($2)');
    parserString = parserString.replace(/\\times/g, '*');
    parserString = parserString.replace(/\\div/g, '/');

    // Handle exponents: convert ^ to ** for math.js, but keep it as ^ for simple cases
    // math.js can handle both ^ and ** for exponentiation
    // No need to replace since math.js handles ^ natively

    return parserString;
}

/**
 * Evaluate rational expression with optional constants
 */
function evalRationalExpression(expr, constants = {}) {
    try {
        if (typeof expr !== 'string') expr = String(expr || '0');
        expr = expr.replace(/\u2212/g, '-');

        const val = math.evaluate(expr, constants);

        // Convert to rational - use math.js fraction type
        if (typeof val === 'number') {
            // For integers, just use them directly
            if (Number.isInteger(val)) {
                return new Rational(val, 1);
            }
            // For non-integers, use math.fraction to get exact representation
            const frac = math.fraction(val);
            return new Rational(frac.n, frac.d);
        } else if (val && typeof val === 'object' && 'n' in val && 'd' in val) {
            // Already a math.js fraction
            return new Rational(val.n, val.d);
        }

        return new Rational(0, 1);
    } catch (e) {
        console.error('Error evaluating expression:', expr, e);
        return new Rational(0, 1);
    }
}

/**
 * Generate all reduced words up to a given length
 */
function generateWords(matrices, maxLength) {
    if (maxLength < 0 || matrices.length === 0) return [];

    const words = [];
    const n = matrices.length;

    // Create generators with their inverses: g_1, g_1^-1, g_2, g_2^-1, ...
    const generators = [];
    for (let i = 0; i < n; i++) {
        generators.push({
            matrix: matrices[i],
            name: `g_{${i + 1}}`,
            inverse: false,
            index: i
        });
        generators.push({
            matrix: invertMatrix(matrices[i]),
            name: `g_{${i + 1}}^{-1}`,
            inverse: true,
            index: i
        });
    }

    // Identity word (length 0)
    const identity = [
        [new Rational(1), new Rational(0)],
        [new Rational(0), new Rational(1)]
    ];
    words.push({
        word: 'e',
        matrix: identity,
        length: 0,
        lastGen: null
    });

    // BFS to generate reduced words
    const queue = [];
    const seen = new Set();

    // Add generators (length 1)
    for (let i = 0; i < generators.length; i++) {
        const gen = generators[i];
        const key = matrixToString(gen.matrix);
        if (!seen.has(key)) {
            seen.add(key);
            words.push({
                word: gen.name,
                matrix: gen.matrix,
                length: 1,
                lastGen: i
            });
            if (maxLength > 1) {
                queue.push({
                    matrix: gen.matrix,
                    word: gen.name,
                    length: 1,
                    lastGen: i
                });
            }
        }
    }

    // Generate longer reduced words
    while (queue.length > 0) {
        const current = queue.shift();
        if (current.length >= maxLength) continue;

        for (let i = 0; i < generators.length; i++) {
            const gen = generators[i];

            // Skip if this generator is the inverse of the last one (reduction rule)
            if (current.lastGen !== null) {
                const lastGen = generators[current.lastGen];
                if (gen.index === lastGen.index && gen.inverse !== lastGen.inverse) {
                    continue; // This would create g * g^-1 or g^-1 * g, skip it
                }
            }

            const newMatrix = multiplyMatrices(current.matrix, gen.matrix);
            const key = matrixToString(newMatrix);

            if (!seen.has(key)) {
                seen.add(key);
                const newWord = current.word + gen.name;
                words.push({
                    word: newWord,
                    matrix: newMatrix,
                    length: current.length + 1,
                    lastGen: i
                });

                if (current.length + 1 < maxLength) {
                    queue.push({
                        matrix: newMatrix,
                        word: newWord,
                        length: current.length + 1,
                        lastGen: i
                    });
                }
            }
        }
    }

    return words.sort((a, b) => a.length - b.length);
}

/**
 * Get LaTeX from MathQuill field
 */
function getLatex(el) {
    try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api && typeof api.latex === 'function' ? api.latex() : (el ? el.textContent : '0');
    } catch {
        return '0';
    }
}

/**
 * Add a constant input UI element
 */
function addConstantInput(labelValue = '', exprValue = '') {
    const container = document.getElementById('constantsInputs');
    if (!container) return;

    const constantBlock = document.createElement('div');
    constantBlock.className = 'constant-block';
    constantBlock.innerHTML = `
        <span class="constant-label-input" data-initial="${labelValue}"></span>
        <span class="constant-equals">=</span>
        <span class="constant-expr-input" data-initial="${exprValue}"></span>
        <button class="delete-constant-btn">✖</button>
    `;

    constantBlock.querySelector('.delete-constant-btn').addEventListener('click', () => {
        constantBlock.remove();
        updateOutput();
    });

    container.appendChild(constantBlock);

    // Initialize MathQuill on the input fields
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (MQ) {
        const labelSpan = constantBlock.querySelector('.constant-label-input');
        const exprSpan = constantBlock.querySelector('.constant-expr-input');

        const labelField = MQ.MathField(labelSpan, {
            spaceBehavesLikeTab: true,
            handlers: { edit: () => updateOutput() }
        });
        const exprField = MQ.MathField(exprSpan, {
            spaceBehavesLikeTab: true,
            handlers: { edit: () => updateOutput() }
        });

        const labelInit = labelSpan.getAttribute('data-initial') || '';
        const exprInit = exprSpan.getAttribute('data-initial') || '';

        labelField.latex(String(labelInit));
        exprField.latex(String(exprInit));

        labelSpan.MathQuill = () => labelField;
        exprSpan.MathQuill = () => exprField;
    }

    updateOutput();
}

/**
 * Extract constants from UI
 */
function getConstantsFromUI() {
    const constants = {};
    const blocks = document.querySelectorAll('#constantsInputs .constant-block');

    for (const block of blocks) {
        const labelSpan = block.querySelector('.constant-label-input');
        const exprSpan = block.querySelector('.constant-expr-input');

        const labelLatex = getLatex(labelSpan);
        const exprLatex = getLatex(exprSpan);

        // Convert label LaTeX to plain variable name
        let varName = latexToExpr(labelLatex);
        // Simple cleanup for variable names
        varName = varName.replace(/[^a-zA-Z0-9_]/g, '');
        if (!varName) continue;

        // Evaluate expression with previously defined constants
        const exprString = latexToExpr(exprLatex);

        try {
            const val = math.evaluate(exprString, constants);
            constants[varName] = val;
        } catch (e) {
            console.error('Error evaluating constant:', varName, exprString, e);
        }
    }

    return constants;
}

/**
 * Add a matrix input UI element
 */
function addMatrixInput(values = ['2', '-2', '0', '\\frac{1}{2}']) {
    const container = document.getElementById('matrixInputs');
    if (!container) return;

    const idx = container.querySelectorAll('.matrix-block').length;
    const matrixBlock = document.createElement('div');
    matrixBlock.className = 'matrix-block';
    matrixBlock.innerHTML = `
        <div style="position:relative;padding-right:34px;">
            <label style="display:block;">
                <span class="matrix-label">$g_{${idx + 1}}$ = </span>
                <span class="matrix-bracket">(</span>
                <span class="matrix-grid-inline">
                    <span class="mq-matrix-input" data-initial="${values[0]}"></span>
                    <span class="mq-matrix-input" data-initial="${values[1]}"></span>
                    <span class="mq-matrix-input" data-initial="${values[2]}"></span>
                    <span class="mq-matrix-input" data-initial="${values[3]}"></span>
                </span>
                <span class="matrix-bracket">)</span>
            </label>
            <button class="delete-matrix-btn" style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:26px;height:30px;">✖</button>
        </div>`;

    matrixBlock.querySelector('.delete-matrix-btn').addEventListener('click', () => {
        matrixBlock.remove();
        updateMatrixLabels();
        updateOutput();
    });

    container.appendChild(matrixBlock);

    // Initialize MathQuill on the input fields
    const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
    if (MQ) {
        const spans = matrixBlock.querySelectorAll('.mq-matrix-input');
        spans.forEach(span => {
            const mf = MQ.MathField(span, {
                spaceBehavesLikeTab: true,
                handlers: {
                    edit: () => updateOutput()
                }
            });
            const init = span.getAttribute('data-initial') || '0';
            mf.latex(init);
            span.MathQuill = () => mf;
        });
    }
}

/**
 * Update matrix labels after deletion
 */
function updateMatrixLabels() {
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => {
        lbl.innerHTML = `$g_{${i + 1}}$ = `;
    });

    // Render LaTeX with MathJax if available
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise(labels).catch(err => console.warn('MathJax typeset error:', err));
    }
}

/**
 * Extract matrices from UI
 */
function getMatricesFromUI() {
    // First, extract all constants
    const constants = getConstantsFromUI();

    const matrices = [];
    const blocks = document.querySelectorAll('#matrixInputs .matrix-block');

    for (const block of blocks) {
        const spans = block.querySelectorAll('.mq-matrix-input');
        const toR = (latex) => evalRationalExpression(latexToExpr(String(latex || '0')), constants);

        const matrix = [
            [toR(getLatex(spans[0])), toR(getLatex(spans[1]))],
            [toR(getLatex(spans[2])), toR(getLatex(spans[3]))]
        ];

        matrices.push(matrix);
    }

    return matrices;
}

/**
 * Update primes display with clickable buttons
 */
function updatePrimesDisplay(invertedPrimes) {
    const primesDisplay = document.getElementById('primes-display');
    if (!primesDisplay) return;

    // Add only NEW primes to the selected set (default: all included)
    // Don't re-add primes that user has already excluded
    invertedPrimes.forEach(prime => {
        if (!seenPrimes.has(prime)) {
            // This is a new prime we haven't seen before
            seenPrimes.add(prime);
            selectedPrimes.add(prime);
        }
    });

    // Remove primes that are no longer inverted
    const currentPrimes = new Set(invertedPrimes);
    for (const prime of selectedPrimes) {
        if (!currentPrimes.has(prime)) {
            selectedPrimes.delete(prime);
            seenPrimes.delete(prime);
        }
    }

    primesDisplay.innerHTML = '';

    invertedPrimes.forEach(prime => {
        const btn = document.createElement('button');
        btn.className = 'prime-btn';
        btn.textContent = prime;
        btn.dataset.prime = prime;

        // Check if this prime is selected
        if (!selectedPrimes.has(prime)) {
            btn.classList.add('excluded');
        }

        btn.addEventListener('click', () => {
            if (selectedPrimes.has(prime)) {
                selectedPrimes.delete(prime);
                btn.classList.add('excluded');
            } else {
                selectedPrimes.add(prime);
                btn.classList.remove('excluded');
            }
            updateOutput();
        });

        primesDisplay.appendChild(btn);
    });

    // Update the ring display with LaTeX notation
    const ringDisplay = document.getElementById('ring-display');
    if (ringDisplay) {
        const selectedPrimesArray = Array.from(selectedPrimes).sort((a, b) => a - b);
        if (selectedPrimesArray.length > 0) {
            const primesLatex = selectedPrimesArray.map(p => `\\frac{1}{${p}}`).join(', ');
            ringDisplay.innerHTML = `$A = \\mathbb{Z}[${primesLatex}]$`;
        } else {
            ringDisplay.innerHTML = `$A = \\mathbb{Z}$`;
        }
        // Typeset the LaTeX
        if (window.MathJax) {
            MathJax.typesetPromise([ringDisplay]).catch((err) => console.log('MathJax error:', err));
        }
    }
}

/**
 * Render MathJax for generators display
 */
function renderGeneratorsMathJax() {
    const generatorsDisplay = document.getElementById('generators-display');
    if (generatorsDisplay && typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise([generatorsDisplay]).catch(err => console.warn('MathJax typeset error:', err));
    }
}

/**
 * Format determinant factor for display as 1/√d
 */
function formatDeterminantFactor(det) {
    const detVal = det.numerator / det.denominator;
    const absDetVal = Math.abs(detVal);

    if (absDetVal === 1) {
        return detVal < 0 ? '-' : '';
    }

    // Format as 1/√d or √d depending on whether det > 1 or < 1
    if (Math.abs(det.numerator) === 1 && det.denominator === 1) {
        return detVal < 0 ? '-' : '';
    }

    const sign = detVal < 0 ? '-' : '';

    // If det is a perfect square, simplify
    const sqrt = Math.sqrt(absDetVal);
    if (Number.isInteger(sqrt)) {
        if (sqrt === 1) return sign;
        return `${sign}\\frac{1}{${sqrt}}`;
    }

    // Display as fraction with square root
    if (det.denominator === 1) {
        return `${sign}\\frac{1}{\\sqrt{${Math.abs(det.numerator)}}}`;
    } else {
        return `${sign}\\frac{\\sqrt{${det.denominator}}}{\\sqrt{${Math.abs(det.numerator)}}}`;
    }
}

/**
 * Update output display
 */
function updateOutput() {
    const output = document.getElementById('output');
    const generatorsDisplay = document.getElementById('generators-display');
    if (!output) return;

    // Also update word evaluation when output changes
    evaluateWordInput();

    const constants = getConstantsFromUI();
    const matrices = getMatricesFromUI();
    const wordLengthInput = document.getElementById('word-length');
    const maxWordLength = wordLengthInput ? parseInt(wordLengthInput.value) : 2;

    // Compute inverted primes early (used in multiple places)
    const invertedPrimes = getInvertedPrimes(matrices);

    // Update generators display
    let generatorsHtml = '';
    if (Object.keys(constants).length > 0) {
        generatorsHtml += '<div class="output-section"><strong>Constants:</strong><br>';
        for (const [key, value] of Object.entries(constants)) {
            generatorsHtml += `&nbsp;&nbsp;${key} = ${value}<br>`;
        }
        generatorsHtml += '</div>';
    }

    matrices.forEach((matrix, index) => {
        // Get PGL canonical form for display
        const pglElem = new PGLElement(matrix);
        const canonical = pglElem.getMatrix();
        const canonicalDet = canonical[0][0].mul(canonical[1][1]).sub(canonical[0][1].mul(canonical[1][0]));

        generatorsHtml += `<div class="matrix-output">`;

        // Display as 1/√det × (coprime matrix)
        const detStr = formatDeterminantFactor(canonicalDet);
        generatorsHtml += `$g_{${index + 1}} = ${detStr} \\begin{pmatrix} ${canonical[0][0].toString()} & ${canonical[0][1].toString()} \\\\ ${canonical[1][0].toString()} & ${canonical[1][1].toString()} \\end{pmatrix}$`;

        generatorsHtml += `</div>`;
    });

    if (generatorsDisplay) {
        generatorsDisplay.innerHTML = generatorsHtml;
    }

    // Generate and display words
    let html = '';
    if (matrices.length > 0 && maxWordLength >= 0) {
        try {
            const allWords = generateWords(matrices, maxWordLength);

            // Determine which primes to avoid (deselected primes)
            const deselectedPrimes = new Set(
                invertedPrimes.filter(p => !selectedPrimes.has(p))
            );

            // Filter words that avoid deselected primes
            const words = deselectedPrimes.size > 0
                ? allWords.filter(w => matrixAvoidsPrimes(w.matrix, deselectedPrimes))
                : allWords;

            html += `<div class="output-section">`;
            if (deselectedPrimes.size > 0) {
                html += `<p class="text-sm text-gray-400 mb-3">Avoiding primes: {${Array.from(deselectedPrimes).join(', ')}}</p>`;
            }
            html += `<p class="text-sm text-gray-400 mb-3">Showing: ${words.length} of ${allWords.length} total words</p>`;

            // Group by length
            for (let len = 0; len <= maxWordLength; len++) {
                const wordsOfLength = words.filter(w => w.length === len);
                if (wordsOfLength.length > 0) {
                    html += `<strong>Length ${len}:</strong> ${wordsOfLength.length} word${wordsOfLength.length > 1 ? 's' : ''}<br>`;
                    wordsOfLength.forEach(w => {
                        // Get PGL canonical form
                        const pglElem = new PGLElement(w.matrix);
                        const canonical = pglElem.getMatrix();
                        const canonicalDet = canonical[0][0].mul(canonical[1][1]).sub(canonical[0][1].mul(canonical[1][0]));
                        const detStr = formatDeterminantFactor(canonicalDet);

                        html += `&nbsp;&nbsp;$${w.word} = ${detStr} \\begin{pmatrix} ${canonical[0][0]} & ${canonical[0][1]} \\\\ ${canonical[1][0]} & ${canonical[1][1]} \\end{pmatrix}$<br>`;
                    });
                    html += '<br>';
                }
            }
            html += '</div>';
        } catch (e) {
            html += `<div class="output-section">Error generating words: ${e.message}</div>`;
        }
    }

    output.innerHTML = html;

    // Update primes display UI
    updatePrimesDisplay(invertedPrimes);

    // Display MCTS results in separate section
    const mctsOutput = document.getElementById('mcts-output');
    if (mctsOutput) {
        if (mctsResults.length > 0) {
            const deselectedPrimes = new Set(
                invertedPrimes.filter(p => !selectedPrimes.has(p))
            );
            const localizationNote = deselectedPrimes.size > 0
                ? ` (avoiding primes {${Array.from(deselectedPrimes).join(', ')}})`
                : '';

            let mctsHtml = `<div class="output-section"><strong>PGL(2,A) Elements Found${localizationNote}:</strong><br>`;
            mctsHtml += `Total: ${mctsResults.length} distinct element${mctsResults.length > 1 ? 's' : ''}<br><br>`;

            // Sort by word length for clarity
            const sortedResults = [...mctsResults].sort((a, b) => {
                const lenA = a.word === 'e' ? 0 : a.word.length;
                const lenB = b.word === 'e' ? 0 : b.word.length;
                return lenA - lenB;
            });

            sortedResults.forEach((result, idx) => {
                const wordLength = result.word === 'e' ? 0 : result.word.split('g_').length - 1;

                // Get PGL canonical form
                const pglElem = new PGLElement(result.matrix);
                const canonical = pglElem.getMatrix();
                const canonicalDet = canonical[0][0].mul(canonical[1][1]).sub(canonical[0][1].mul(canonical[1][0]));
                const detStr = formatDeterminantFactor(canonicalDet);

                mctsHtml += `<div class="matrix-output">`;
                mctsHtml += `<strong>${idx + 1}.</strong> Word: $${result.word}$ (length ${wordLength})<br>`;
                mctsHtml += `&nbsp;&nbsp;&nbsp;&nbsp;Matrix: $${detStr} \\begin{pmatrix} ${canonical[0][0]} & ${canonical[0][1]} \\\\ ${canonical[1][0]} & ${canonical[1][1]} \\end{pmatrix}$`;
                mctsHtml += `</div>`;
            });
            mctsHtml += '</div>';
            mctsOutput.innerHTML = mctsHtml;
        } else {
            mctsOutput.innerHTML = '';
        }
    }

    // Render MathJax for all output sections
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        const elements = [output];
        if (mctsOutput) elements.push(mctsOutput);
        if (generatorsDisplay) elements.push(generatorsDisplay);
        MathJax.typesetPromise(elements).catch(err => console.warn('MathJax typeset error:', err));
    }
}

/**
 * Load an example
 */
function setExample(example) {
    const matrixContainer = document.getElementById('matrixInputs');
    const constantsContainer = document.getElementById('constantsInputs');
    if (!matrixContainer) return;

    // Clear matrices and constants
    matrixContainer.innerHTML = '';
    if (constantsContainer) {
        constantsContainer.innerHTML = '';
    }

    // Clear selected primes when loading new example
    selectedPrimes.clear();
    seenPrimes.clear();

    // Clear MCTS results
    mctsResults = [];

    // Add constants if any
    if (example.constants && Array.isArray(example.constants)) {
        example.constants.forEach(c => addConstantInput(c.label, c.value));
    }

    // Add all matrices
    example.mats.forEach(vals => addMatrixInput(vals));

    // Wait a tick for MathQuill to initialize, then update labels and output once
    setTimeout(() => {
        updateMatrixLabels();
        updateOutput();
    }, 100);
}

/**
 * Populate example dropdown
 */
function populateExampleDropdown() {
    const sel = document.getElementById('example-select');
    if (!sel) return;

    exampleLibrary.forEach((ex, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = ex.name;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        const idx = parseInt(sel.value, 10);
        if (idx >= 0 && idx < exampleLibrary.length) {
            const example = exampleLibrary[idx];
            setExample(example);
        }
    });
}

/**
 * Parse and evaluate a word string
 * Format: g1, g2, ... for generators, G1, G2, ... for inverses
 */
function parseAndEvaluateWord(wordStr, matrices) {
    const wordInput = wordStr.trim();
    if (!wordInput || wordInput === 'e') {
        // Return identity
        return [
            [new Rational(1), new Rational(0)],
            [new Rational(0), new Rational(1)]
        ];
    }

    // Parse the word: match g1, G1, g2, G2, etc.
    const tokenPattern = /([gG])(\d+)/g;
    const tokens = [];
    let match;

    while ((match = tokenPattern.exec(wordInput)) !== null) {
        const isInverse = match[1] === 'G';
        const index = parseInt(match[2]) - 1; // Convert to 0-based index

        if (index < 0 || index >= matrices.length) {
            throw new Error(`Invalid generator index: ${match[1]}${match[2]}`);
        }

        tokens.push({ index, isInverse });
    }

    if (tokens.length === 0) {
        throw new Error('No valid generators found in word');
    }

    // Start with identity
    let result = [
        [new Rational(1), new Rational(0)],
        [new Rational(0), new Rational(1)]
    ];

    // Multiply by each generator in sequence
    for (const token of tokens) {
        const matrix = token.isInverse
            ? invertMatrix(matrices[token.index])
            : matrices[token.index];
        result = multiplyMatrices(result, matrix);
    }

    return result;
}

/**
 * Update word evaluation display
 */
function evaluateWordInput() {
    const wordInput = document.getElementById('word-input');
    const wordResult = document.getElementById('word-result');

    if (!wordInput || !wordResult) return;

    const wordStr = wordInput.value.trim();
    if (!wordStr) {
        wordResult.innerHTML = '';
        return;
    }

    try {
        const matrices = getMatricesFromUI();
        if (matrices.length === 0) {
            wordResult.innerHTML = '<span class="text-red-400">No generators defined</span>';
            return;
        }

        const resultMatrix = parseAndEvaluateWord(wordStr, matrices);

        // Get PGL canonical form
        const pglElem = new PGLElement(resultMatrix);
        const canonical = pglElem.getMatrix();
        const canonicalDet = canonical[0][0].mul(canonical[1][1]).sub(canonical[0][1].mul(canonical[1][0]));
        const detStr = formatDeterminantFactor(canonicalDet);

        // Display result
        let html = `$${detStr} \\begin{pmatrix} ${canonical[0][0]} & ${canonical[0][1]} \\\\ ${canonical[1][0]} & ${canonical[1][1]} \\end{pmatrix}$`;

        wordResult.innerHTML = html;

        // Render MathJax
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
            MathJax.typesetPromise([wordResult]).catch(err => console.warn('MathJax typeset error:', err));
        }
    } catch (error) {
        wordResult.innerHTML = `<span class="text-red-400">Error: ${error.message}</span>`;
    }
}

/**
 * Setup matrix input UI
 */
function setupMatrixInput() {
    // Populate examples first
    populateExampleDropdown();

    // Add matrix button
    const addMatrixBtn = document.getElementById('addMatrixBtn');
    if (addMatrixBtn) {
        addMatrixBtn.addEventListener('click', () => addMatrixInput(['1', '0', '0', '1']));
    }

    // Add constant button
    const addConstantBtn = document.getElementById('addConstantBtn');
    if (addConstantBtn) {
        addConstantBtn.addEventListener('click', () => addConstantInput());
    }

    // Word length input
    const wordLengthInput = document.getElementById('word-length');
    if (wordLengthInput) {
        wordLengthInput.addEventListener('input', () => updateOutput());
    }

    // Word input evaluation
    const wordInput = document.getElementById('word-input');
    if (wordInput) {
        wordInput.addEventListener('input', () => evaluateWordInput());
    }

    // MCTS button
    const mctsButton = document.getElementById('run-mcts');
    const mctsStatus = document.getElementById('mcts-status');
    if (mctsButton && mctsStatus) {
        mctsButton.addEventListener('click', () => {
            const matrices = getMatricesFromUI();
            if (matrices.length === 0) {
                mctsStatus.textContent = 'Error: No matrices defined';
                return;
            }

            const iterationsInput = document.getElementById('mcts-iterations');
            const maxDepthInput = document.getElementById('mcts-max-depth');
            const iterations = iterationsInput ? parseInt(iterationsInput.value) : 1000;
            const maxDepth = maxDepthInput ? parseInt(maxDepthInput.value) : 10;

            // Get inverted primes and determine which to avoid (deselected primes)
            const invertedPrimes = getInvertedPrimes(matrices);
            const deselectedPrimes = new Set(
                invertedPrimes.filter(p => !selectedPrimes.has(p))
            );

            const primesList = deselectedPrimes.size > 0
                ? `avoiding {${Array.from(deselectedPrimes).join(', ')}}`
                : 'in full group';

            mctsStatus.textContent = `Running ${iterations} iterations ${primesList}...`;
            mctsButton.disabled = true;

            // Run MCTS asynchronously
            setTimeout(() => {
                try {
                    const startTime = performance.now();
                    const results = runMCTS(matrices, iterations, maxDepth, deselectedPrimes);
                    const endTime = performance.now();

                    mctsResults = results;
                    mctsStatus.textContent = `Found ${results.length} PGL(2,A) elements in ${((endTime - startTime) / 1000).toFixed(2)}s ${primesList}`;
                    updateOutput();
                } catch (e) {
                    mctsStatus.textContent = `Error: ${e.message}`;
                } finally {
                    mctsButton.disabled = false;
                }
            }, 100);
        });
    }

    // Initial MathJax rendering
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
        MathJax.typesetPromise().catch(err => console.warn('MathJax typeset error:', err));
    }

    // Setup collapse button
    setupCollapseButton();

    // Load Magnus curve example by default (t=9) - after a delay to ensure MathQuill is ready
    setTimeout(() => {
        if (exampleLibrary.length > 0) {
            const sel = document.getElementById('example-select');
            if (sel) {
                sel.selectedIndex = 1; // Select first example (index 0 is the placeholder)
            }
            setExample(exampleLibrary[0]); // Magnus curve
        }
    }, 150);
}

/**
 * Setup collapse button functionality
 */
function setupCollapseButton() {
    const collapseBtn = document.getElementById('collapse-btn');
    const controlPanel = document.getElementById('control-panel');

    if (collapseBtn && controlPanel) {
        collapseBtn.addEventListener('click', () => {
            controlPanel.classList.toggle('collapsed');
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for MathQuill to be ready
    function initWhenReady() {
        if (window.MathQuill && window.jQuery) {
            setupMatrixInput();
        } else {
            setTimeout(initWhenReady, 50);
        }
    }
    initWhenReady();
});
