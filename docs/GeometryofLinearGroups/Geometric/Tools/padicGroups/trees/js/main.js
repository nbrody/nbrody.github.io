import { Rational, ReduceVert, Act, TDist, integerExponent, generateSubtree } from './pAdic.js';
import { drawTree, resetZoom } from './treeVis.js';
import { setupMatrixInput, getMatricesFromUI } from './matrixInput.js';
import { computeOrbit, formatOrbitInfo, computeStabilizer, formatStabilizerInfo } from './groupWords.js';
import { generateTreeAroundOrbit } from './treeGeneration.js';

let resetZoomFunction = null;
let currentOrbitMap = null;
let currentStabilizer = null;

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            // Remove active class from all tabs and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            btn.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });
}

// Panel collapse
function setupCollapse() {
    const collapseBtn = document.getElementById('collapse-btn');
    const panel = document.getElementById('control-panel');

    collapseBtn.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
    });
}

// Calculate and update visualization
function calculate() {
    try {
        const p = BigInt(document.getElementById('prime').value);
        const k_in = parseInt(document.getElementById('vertex_k').value);
        const q_in = new Rational(document.getElementById('vertex_q').value);
        const wordLength = parseInt(document.getElementById('wordLength').value) || 0;

        // Validate prime
        function isPrime(n) {
            if (n < 2n) return false;
            for (let i = 2n; i * i <= n; i++) {
                if (n % i === 0n) return false;
            }
            return true;
        }

        if (!isPrime(p)) {
            document.getElementById('output').innerHTML = `<span style="color: #ef4444;">Error: ${p} is not prime. Please enter a prime number.</span>`;
            return;
        }

        // Get matrices from UI
        const matrices = getMatricesFromUI();
        if (matrices.length === 0) {
            document.getElementById('output').innerHTML = `<span style="color: #ef4444;">Error: Please add at least one matrix.</span>`;
            return;
        }

        const v_reduced = ReduceVert({ k: k_in, q: q_in }, p);

        // Compute orbit
        currentOrbitMap = computeOrbit(v_reduced, matrices, p, wordLength);

        // Compute stabilizer
        currentStabilizer = computeStabilizer(v_reduced, currentOrbitMap);

        // Use the first matrix for single action display
        const a = matrices[0];
        const v_acted = Act(a, v_reduced, p);
        const dist = TDist(v_reduced, v_acted, p);

        document.getElementById('output').innerHTML = `
            <p class="mb-2"><strong>Base Vertex:</strong> $v = \\lfloor ${v_reduced.q.toString()} \\rfloor_{${v_reduced.k}}$</p>
            <p class="mb-2"><strong>$g_1 \\cdot v$:</strong> $\\lfloor ${v_acted.q.toString()} \\rfloor_{${v_acted.k}}$</p>
            <p><strong>Distance:</strong> $d(v, g_1 \\cdot v) = ${dist}$</p>`;

        // Display orbit information
        const orbitInfoHTML = formatOrbitInfo(currentOrbitMap);
        document.getElementById('orbit-info').innerHTML = orbitInfoHTML;

        // Display stabilizer information
        const stabilizerInfoHTML = formatStabilizerInfo(currentStabilizer);
        document.getElementById('stabilizer-elements').innerHTML = stabilizerInfoHTML;

        if (window.MathJax) {
            MathJax.typeset([document.getElementById('output'), document.getElementById('orbit-info')]);
        }

        updateVisualization(p, v_reduced, v_acted, currentOrbitMap);

    } catch (e) {
        console.error('Calculation error:', e);
        document.getElementById('output').innerHTML = `<span style="color: #ef4444;">Error: ${e.message}</span>`;
        document.getElementById('orbit-info').innerHTML = `<span style="color: #ef4444;">Error computing orbit</span>`;
        d3.select("#tree-vis").selectAll("*").remove();
    }
}

function updateVisualization(p, v_reduced, v_acted, orbitMap) {
    // Get max distance from UI
    const maxDistance = parseInt(document.getElementById('maxDistance').value) || 2;

    // Generate tree only around orbit vertices
    const treeData = generateTreeAroundOrbit(p, orbitMap, maxDistance);

    if (treeData) {
        resetZoomFunction = drawTree(treeData, v_reduced, v_acted, p, orbitMap, populateInputsFromNode);
    }
}

function populateInputsFromNode(k, qNum, qDen) {
    try {
        const pEl = document.getElementById('prime');
        const kEl = document.getElementById('vertex_k');
        const qEl = document.getElementById('vertex_q');
        if (!pEl || !kEl || !qEl) return;

        const qRat = new Rational(BigInt(qNum), BigInt(qDen));
        kEl.value = String(k);
        qEl.value = qRat.toString();

        calculate();
    } catch (e) {
        console.error('Error populating inputs:', e);
    }
}

// Setup stabilizer toggle
function setupStabilizerToggle() {
    const toggleBtn = document.getElementById('toggle-stabilizer');
    const stabilizerInfo = document.getElementById('stabilizer-info');

    if (toggleBtn && stabilizerInfo) {
        toggleBtn.addEventListener('click', () => {
            stabilizerInfo.classList.toggle('hidden');
            toggleBtn.classList.toggle('active');

            if (stabilizerInfo.classList.contains('hidden')) {
                toggleBtn.textContent = 'Show Stabilizer Elements';
            } else {
                toggleBtn.textContent = 'Hide Stabilizer Elements';
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupCollapse();
    setupMatrixInput();
    setupStabilizerToggle();

    // Calculate button
    document.getElementById('calculateBtn').addEventListener('click', calculate);

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', calculate);

    // Reset zoom button
    document.getElementById('reset-zoom').addEventListener('click', () => {
        if (resetZoomFunction) {
            resetZoomFunction();
        }
    });

    // Max distance change listener
    document.getElementById('maxDistance').addEventListener('change', calculate);

    // Initial calculation
    calculate();
});
