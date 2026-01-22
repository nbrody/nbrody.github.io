// main.js - Entry point and UI management for the Quaternion Calculator

import { QMath, formatQuaternion, findXYSolution } from './quaternionPackage/projectiveQuaternion.js';
import { generateGeneratorsForPrimes, createGeneratorObject, computeProjectiveRelations } from './quaternionPackage/primeQuaternion.js';
import { computeFactorizationLattice, calculateTreePath, getPrimeFactors, areEquivalent } from './quaternionPackage/factorization.js';
import { generateSO3Z } from './quaternionPackage/so3z.js';

import * as MainVis from './vis/vis_main.js';
import * as FactorVis from './vis/vis_factor.js';
import * as TreeVis from './vis/vis_tree.js';
import * as SquareVis from './vis/vis_square.js';
import * as SO3ZVis from './vis/vis_so3z.js';
import * as GeneratorVis from './vis/vis_generators.js';

// Global State
let GENERATORS = {};
let RELATIONS = [];
let targetQ = null;
let MQ_FIELDS = {};
let XY_SOLUTIONS = {};

async function runComputation() {
    const primeInput = MQ_FIELDS['prime-input'] ? MQ_FIELDS['prime-input'].latex() : "";
    const primes = primeInput.replace(/\\/g, '').split(/[,;]/).map(s => parseInt(s.trim())).filter(p => !isNaN(p) && p > 1);

    if (primes.length === 0) return;

    const listDiv = document.getElementById('generators-list');
    listDiv.innerHTML = 'Computing...';

    const groupGenerators = await generateGeneratorsForPrimes(primes);
    GENERATORS = createGeneratorObject(groupGenerators);
    RELATIONS = computeProjectiveRelations(GENERATORS);

    // Store XY solutions for labeling
    primes.forEach(p => {
        XY_SOLUTIONS[p] = findXYSolution(p);
    });

    GeneratorVis.drawGenerators(GENERATORS, XY_SOLUTIONS);
    populateGenSelects();
    updateVisualizations();
}


function populateGenSelects() {
    const selX = document.getElementById('gen-x');
    const selY = document.getElementById('gen-y');
    selX.innerHTML = ''; selY.innerHTML = '';

    Object.keys(GENERATORS).filter(k => !k.endsWith('*')).forEach(key => {
        const opt = new Option(`${key}: ${formatQuaternion(GENERATORS[key].q)}`, key);
        selX.add(opt.cloneNode(true));
        selY.add(opt);
    });
}

function updateVisualizations() {
    const depth = parseInt(document.getElementById('depth-slider').value);
    const genX = document.getElementById('gen-x').value;
    const genY = document.getElementById('gen-y').value;

    MainVis.drawCayleyGraph(GENERATORS, depth, genX, genY);
    SquareVis.drawSquareComplex('square-complex-container', GENERATORS, RELATIONS, depth, genX, genY);
}

// Factorization
async function runFactorization() {
    const input = MQ_FIELDS['factor-q'] ? MQ_FIELDS['factor-q'].latex() : "";
    const resultDiv = document.getElementById('factor-result');
    const container = document.getElementById('factor-vis-container');

    try {
        const q = parseQuaternionInput(input);
        targetQ = q;
        const norm = QMath.normSq(q);
        const factors = getPrimeFactors(norm);
        const factorStr = Object.entries(factors).map(([p, e]) => `${p}<sup>${e}</sup>`).join(' · ');

        container.innerHTML = '<p>Computing Lattice...</p>';
        const data = await computeFactorizationLattice(q);

        const buildLowestPath = (nodes, links, primes) => {
            const dest = nodes.find(n => areEquivalent(n.q, q));
            if (!dest) return [];
            let curr = nodes.find(n => n.level === 0), path = [curr.id];

            while (curr.id !== dest.id) {
                let found = false;
                for (let p of primes) {
                    const edge = links.find(e => e.source === curr.id && e.prime === p && nodes.find(n => n.id === e.target).coord[primes.indexOf(p)] <= dest.coord[primes.indexOf(p)]);
                    if (edge) { curr = nodes.find(n => n.id === edge.target); path.push(curr.id); found = true; break; }
                }
                if (!found) break;
            }
            return path;
        };

        const path = buildLowestPath(data.nodes, data.links, data.primes);
        FactorVis.drawFactorComplex(data, container, q);
        FactorVis.setFactorCurrentPath(path);

        resultDiv.innerHTML = `Norm: ${norm} ($${factorStr}$)<br>Unique Paths: <strong>${countPaths(data.nodes, data.links)}</strong>`;
        if (window.MathJax) MathJax.typesetPromise([resultDiv]);
    } catch (err) {
        resultDiv.innerHTML = `<span style="color:red">${err.message}</span>`;
    }
}

function countPaths(nodes, links) {
    const memo = new Map();
    const adj = new Map();
    links.forEach(l => { if (!adj.has(l.source)) adj.set(l.source, []); adj.get(l.source).push(l.target); });

    // Target nodes are those at the max depth reachable
    const targetNodes = nodes.filter(n => areEquivalent(n.q, targetQ));
    if (targetNodes.length === 0) return 0n;
    const targetIds = new Set(targetNodes.map(n => n.id));

    function solve(curr) {
        if (targetIds.has(curr)) return 1n;
        if (memo.has(curr)) return memo.get(curr);
        let count = 0n;
        (adj.get(curr) || []).forEach(next => count += solve(next));
        memo.set(curr, count);
        return count;
    }
    const startNode = nodes.find(n => n.level === 0);
    return startNode ? solve(startNode.id) : 0n;
}

// Multiplication Logic
function runMultiplication() {
    const exprLatex = MQ_FIELDS['mult-expr'] ? MQ_FIELDS['mult-expr'].latex() : "";
    const resDiv = document.getElementById('mult-result');
    const primitize = document.getElementById('mult-primitize').checked;

    try {
        let s = exprLatex.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
            .replace(/\\cdot/g, '*')
            .replace(/\\times/g, '*')
            .replace(/\\text\{([ijk])\}/g, '$1')
            .replace(/\\mathbf\{([ijk])\}/g, '$1')
            .replace(/\\ /g, '')
            .replace(/\{/g, '').replace(/\}/g, '');

        // Extract factors in parentheses
        let factors = [];
        const parenMatches = [...s.matchAll(/\(([^)]+)\)/g)];
        if (parenMatches.length > 0) {
            factors = parenMatches.map(m => m[1]);
        } else {
            // Split by * or whitespace if no parentheses
            factors = s.split(/[\*]+/).filter(x => x.trim().length > 0);
        }

        if (factors.length === 0) {
            // Check if it's just a single quaternion without parentheses or stars
            if (s.trim().length > 0) {
                factors = [s.trim()];
            } else {
                throw new Error("No input");
            }
        }

        let result = [1n, 0n, 0n, 0n];
        for (let f of factors) {
            const q = parseBigQuaternionInput(f);
            result = bigMul(result, q);
        }

        const g = result.reduce((acc, v) => bigGcd(acc, v), 0n);
        let output = "";
        if (primitize && g > 1n) {
            const primQ = result.map(x => x / g);
            output = `Product: $${g} \\cdot (${formatBigQuaternion(primQ)})$`;
        } else {
            output = `Product: $${formatBigQuaternion(result)}$`;
        }

        resDiv.innerHTML = output;
        if (window.MathJax) MathJax.typesetPromise([resDiv]);
    } catch (err) {
        resDiv.innerHTML = `<span style="color:red">${err.message}</span>`;
    }
}

// Word Calculator Logic
function runWordCalculation() {
    const valA = MQ_FIELDS['word-gen-a'] ? MQ_FIELDS['word-gen-a'].latex() : "";
    const valB = MQ_FIELDS['word-gen-b'] ? MQ_FIELDS['word-gen-b'].latex() : "";
    const exprText = document.getElementById('word-expr').value;
    const resDiv = document.getElementById('word-result');

    try {
        const genMap = {};
        const processGen = (name, text) => {
            const val = parseQuaternionInput(text.trim());
            const bigVal = val.map(n => BigInt(Math.round(n)));
            const g = bigVal.reduce((acc, v) => bigGcd(acc, v), 0n);
            genMap[name] = bigVal.map(x => g === 0n ? x : x / g);
        };
        processGen('a', valA);
        processGen('b', valB);

        function evaluateSegment(seg) {
            seg = seg.trim();
            if (seg.length === 0) return [1n, 0n, 0n, 0n];
            const tokens = [];
            let depth = 0, current = '';
            for (let i = 0; i < seg.length; i++) {
                if (seg[i] === '(') depth++;
                if (seg[i] === ')') depth--;
                // Handle '.', '\cdot', and spaces as separators
                if ((seg[i] === '.' || seg.slice(i, i + 5) === 'cdot') && depth === 0) {
                    if (current.trim()) tokens.push(current.trim());
                    current = '';
                    if (seg.slice(i, i + 5) === 'cdot') i += 4; // skip 'cdot'
                } else current += seg[i];
            }
            if (current.trim()) tokens.push(current.trim());
            if (tokens.length === 0) return [1n, 0n, 0n, 0n];
            if (tokens.length > 1) {
                let res = [1n, 0n, 0n, 0n];
                for (let t of tokens) {
                    const val = evaluateSegment(t);
                    res = bigMul(res, val);
                    const g = res.reduce((acc, v) => bigGcd(acc, v), 0n);
                    if (g > 1n) res = res.map(x => x / g);
                }
                return res;
            }
            let token = tokens[0].replace(/_/g, '').replace(/\{/g, '').replace(/\}/g, '');
            if (token.startsWith('(') && token.endsWith(')')) return evaluateSegment(token.slice(1, -1));
            let isInv = token.endsWith('i'), key = isInv ? token.slice(0, -1) : token;
            if (!genMap[key]) throw new Error(`Unknown generator: ${token}`);
            let q = genMap[key];
            return isInv ? [q[0], -q[1], -q[2], -q[3]] : q;
        }

        let result = evaluateSegment(exprText);
        const gFinal = result.reduce((acc, v) => bigGcd(acc, v), 0n);
        if (gFinal > 1n) result = result.map(x => x / gFinal);

        let finalStr = formatBigQuaternion(result);
        resDiv.innerHTML = `Result: $${finalStr}$`;
        if (window.MathJax) MathJax.typesetPromise([resDiv]);
    } catch (err) {
        resDiv.innerHTML = `<span style="color:red">Error: ${err.message}</span>`;
    }
}

// Tree Logic
async function runTreeVis() {
    const resultDiv = document.getElementById('tree-result');
    const container = document.getElementById('tree-vis-container');

    try {
        const latex = MQ_FIELDS['tree-q-mq'] ? MQ_FIELDS['tree-q-mq'].latex() : "";
        const cleanLatex = latex.replace(/\\mathbf\{([ijk])\}/g, '$1').replace(/\\times/g, '*');
        const q = parseQuaternionInput(cleanLatex);
        const norm = QMath.normSq(q);

        const factors = getPrimeFactors(norm);
        const pValues = Object.keys(factors);
        if (pValues.length === 0) throw new Error("Norm is 1");

        const p = parseInt(pValues[0]);
        const data = await calculateTreePath(q, p);

        resultDiv.innerHTML = `Norm ${norm}, viewing tree for $p=${p}$. P1 Label: <strong>$${data.p1Label}$</strong>`;
        if (window.MathJax) MathJax.typesetPromise([resultDiv]);
        TreeVis.drawTree(container, p, data.pathIndices);
    } catch (err) {
        resultDiv.innerHTML = `<span style="color:red">${err.message}</span>`;
    }
}

// Helpers
function parseBigQuaternionInput(input) {
    if (!input) return [0n, 0n, 0n, 0n];
    if (typeof input !== 'string') return [1n, 0n, 0n, 0n];
    if (input.includes(',')) return input.split(',').map(s => BigInt(s.trim() || 0));

    const q = [0n, 0n, 0n, 0n];
    let s = input.replace(/\s+/g, '')
        .replace(/\\mathbf\{([ijk])\}/g, '$1')
        .replace(/\\text\{([ijk])\}/g, '$1')
        .replace(/\\times/g, '*')
        .replace(/\\cdot/g, '*')
        .replace(/\{/g, '')
        .replace(/\}/g, '')
        .replace(/\\/g, '');
    if (!s.startsWith('+') && !s.startsWith('-')) s = '+' + s;
    const matches = [...s.matchAll(/([+-])(\d*)([ijk]?)/g)];
    for (const m of matches) {
        const sign = m[1] === '-' ? -1n : 1n;
        const val = m[2] === '' ? 1n : BigInt(m[2]);
        const unit = m[3];
        const coeff = sign * val;
        if (unit === 'i') q[1] += coeff; else if (unit === 'j') q[2] += coeff; else if (unit === 'k') q[3] += coeff; else q[0] += coeff;
    }
    return q;
}

function parseQuaternionInput(input) {
    if (!input) return [0, 0, 0, 0];
    if (typeof input !== 'string') return [1, 0, 0, 0]; // Fallback
    if (input.includes(',')) return input.split(',').map(s => parseInt(s.trim()));

    const q = [0, 0, 0, 0];
    let s = input.replace(/\s+/g, '')
        .replace(/\\mathbf\{([ijk])\}/g, '$1')
        .replace(/\\times/g, '*')
        .replace(/\\cdot/g, '*')
        .replace(/\{/g, '')
        .replace(/\}/g, '')
        .replace(/\\/g, '');
    if (!s.startsWith('+') && !s.startsWith('-')) s = '+' + s;
    const matches = [...s.matchAll(/([+-])(\d*)([ijk]?)/g)];
    for (const m of matches) {
        const sign = m[1] === '-' ? -1 : 1;
        const val = m[2] === '' ? 1 : parseInt(m[2]);
        const unit = m[3];
        const coeff = sign * val;
        if (unit === 'i') q[1] += coeff; else if (unit === 'j') q[2] += coeff; else if (unit === 'k') q[3] += coeff; else q[0] += coeff;
    }
    return q;
}

// BigInt Utilities
function bigGcd(a, b) {
    a = a < 0n ? -a : a; b = b < 0n ? -b : b;
    while (b > 0n) { let t = b; b = a % b; a = t; }
    return a;
}

function bigMul(a, b) {
    return [
        a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
        a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
        a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
        a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
    ];
}

function formatBigQuaternion(q) {
    const labels = ['', '\\mathbf{i}', '\\mathbf{j}', '\\mathbf{k}'];
    let s = '';
    for (let i = 0; i < 4; i++) {
        let n = q[i]; if (n === 0n) continue;
        let val = n < 0n ? -n : n;
        if (s.length > 0) s += n > 0n ? ' + ' : ' - ';
        else if (n < 0n) s += '-';
        if (val !== 1n || i === 0) s += val.toString();
        s += labels[i];
    }
    return s || '0';
}

// Global Initialization
function init() {
    MainVis.initMainVis('vis-container');
    GeneratorVis.initGeneratorVis('generator-vis-container');

    document.getElementById('compute-button').addEventListener('click', runComputation);

    const depthSlider = document.getElementById('depth-slider');
    depthSlider.addEventListener('change', updateVisualizations);
    depthSlider.addEventListener('input', () => {
        document.getElementById('depth-value').textContent = depthSlider.value;
    });

    document.getElementById('gen-x').addEventListener('change', updateVisualizations);
    document.getElementById('gen-y').addEventListener('change', updateVisualizations);

    document.getElementById('btn-multiply').addEventListener('click', runMultiplication);
    document.getElementById('btn-calc-word').addEventListener('click', runWordCalculation);
    document.getElementById('btn-factor').addEventListener('click', runFactorization);
    document.getElementById('btn-tree').addEventListener('click', runTreeVis);

    document.getElementById('btn-gen-so3z').addEventListener('click', async () => {
        const group = await generateSO3Z();
        const list = document.getElementById('so3z-list');
        list.innerHTML = '';
        group.forEach((g, idx) => {
            const div = document.createElement('div');
            div.className = 'relation-square';
            div.style.cursor = 'pointer';
            div.innerHTML = `<strong>#${idx + 1}</strong><br>\\( ${formatQuaternion(g.q)} \\)`;
            div.onclick = () => {
                document.querySelectorAll('#so3z-list .relation-square').forEach(el => el.style.borderColor = '#ccc');
                div.style.borderColor = '#3498db';
                SO3ZVis.applySO3ZRotation(g.q);
            };
            list.appendChild(div);
        });
        if (window.MathJax) MathJax.typesetPromise([list]);
        SO3ZVis.initSO3ZVis('so3z-vis-container');
    });

    // Dark mode
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        const updateTheme = (newTheme) => {
            document.body.setAttribute('data-theme', newTheme);
            toggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('theme', newTheme);
        };
        toggle.onclick = () => {
            const theme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            updateTheme(theme);
        };
        const saved = localStorage.getItem('theme') || 'light';
        updateTheme(saved);
    }

    // Toggle sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
        header.onclick = () => {
            header.classList.toggle('collapsed');
            const content = header.nextElementSibling;
            if (content) content.classList.toggle('hidden');
            window.dispatchEvent(new Event('resize'));
        };
    });

    window.addEventListener('resize', () => {
        MainVis.handleResize('vis-container');
        GeneratorVis.handleGeneratorResize('generator-vis-container');
        FactorVis.handleFactorResize(document.getElementById('factor-vis-container'));
    });

    // MQ Init
    const mqIds = ['prime-input', 'mult-expr', 'word-gen-a', 'word-gen-b', 'factor-q', 'tree-q-mq'];
    mqIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && window.MQ) {
            MQ_FIELDS[id] = MQ.MathField(el, {
                autoCommands: 'pi tau theta phi',
                autoParenthesizedDelimiters: '()'
            });
        }
    });

    // Default Values
    if (MQ_FIELDS['prime-input']) MQ_FIELDS['prime-input'].latex('5, 13');
    if (MQ_FIELDS['mult-expr']) MQ_FIELDS['mult-expr'].latex('(1+2\\mathbf{i})(1+2\\mathbf{k})(3+2\\mathbf{i})');
    if (MQ_FIELDS['word-gen-a']) MQ_FIELDS['word-gen-a'].latex('4+5\\mathbf{j}');
    if (MQ_FIELDS['word-gen-b']) MQ_FIELDS['word-gen-b'].latex('3+\\mathbf{i}+3\\mathbf{j}+9\\mathbf{k}');
    document.getElementById('word-expr').value = 'b . ai . ai . bi . ai . b . b . b . b . a . a . bi . a . b . ai . b . a . bi . a . b . ai . ai . bi . bi . bi . a . b . a . bi . bi . bi . bi . ai . b . ai . bi . a . a . b . ai . b . a . bi . a . a . b . b . b . b . ai . bi . ai . ai . b . a . b . a . bi . a . b . ai . ai . bi . bi . bi . bi . a . b . a . bi . bi . bi . ai . ai . b . a . bi . a . b . ai . b . a . bi . a . a . b . b . b . b . ai . bi . ai . b . ai . ai . ai . bi . bi . bi . a . b . a . bi . bi . bi . bi . ai . ai . b . a . bi . a . b . ai . b . a . bi . a . a . b . b . b . b . ai . bi . ai . bi . bi . ai . ai . b . a . a . bi . ai . b . b . a . bi . a . a . b . b . b . b . ai . bi . ai . b . ai . ai . ai . bi . bi . bi . bi . a . b . a . a . bi . a . bi . ai . ai . b . a . bi . a . b . b . b . b . ai . ai . bi . bi . a . a . a . b . b . b . b . ai . bi . ai . ai . b . b . a . bi . a . b . a . bi . a . b . a . bi . bi . bi . bi . ai . ai . b . ai . bi . bi . a . b . a . a . bi . ai . bi . bi . a . a . b . a . bi . bi . bi . bi . ai . ai . b . b . ai . b . a . bi . bi . bi . ai . ai . b . a . bi . a . b . ai . b . a . bi . a . a . b . b . b . b . ai . bi . ai . ai . b . a . bi . bi . ai . bi . a . a . b . a . bi . bi . bi . bi . ai . ai . ai . b . ai . bi . ai . b . b . b . b . a . a . a . bi . a . b . a . bi . bi . bi . bi . ai . ai . ai . b . a . bi . bi . ai . ai . b . a . bi . a . b . b . b . ai . ai . bi . a . b . b . a . bi . bi . bi . bi . ai . ai . b . a . bi . a . b . ai . b . a . bi . a . a . b . b . b . b . ai . bi . ai . ai . b . a';
    if (MQ_FIELDS['factor-q']) MQ_FIELDS['factor-q'].latex('23+2\\mathbf{i}+4\\mathbf{j}+6\\mathbf{k}');
    if (MQ_FIELDS['tree-q-mq']) MQ_FIELDS['tree-q-mq'].latex('3+2\\mathbf{i}+6\\mathbf{j}+4\\mathbf{k}');


    // Auto-run initial computation
    runComputation();
}

document.addEventListener('DOMContentLoaded', () => {
    init();
});
