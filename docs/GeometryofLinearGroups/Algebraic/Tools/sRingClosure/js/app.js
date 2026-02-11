/**
 * app.js — Main application: UI wiring, MathQuill, results display
 */

// ─── State ───

let MQ = null;
let mathField = null;
const polynomials = [];  // { latex, readable, id }

// ─── Presets ───

const PRESETS = [
    { label: 'ℤ[√2]',          polys: ['x_1^2-2'] },
    { label: 'ℤ[√8/3]',        polys: ['3x_1-1', 'x_2^2-8'] },
    { label: 'ℤ[1/6]',         polys: ['6x_1-1'] },
    { label: 'ℤ[(1+√5)/2]',    polys: ['x_1^2-x_1-1'] },
    { label: 'ℤ[√-1]',         polys: ['x_1^2+1'] },
    { label: 'ℤ[ζ₅]',          polys: ['x_1^4+x_1^3+x_1^2+x_1+1'] },
    { label: 'ℤ[∛2]',          polys: ['x_1^3-2'] },
    { label: 'ℤ[√2, √3]',     polys: ['x_1^2-2', 'x_2^2-3'] },
    { label: 'ℤ[√2, 1/5]',    polys: ['x_1^2-2', '5x_2-1'] },
];

// ─── Init ───

$(document).ready(function () {
    MQ = MathQuill.getInterface(2);
    mathField = MQ.MathField(document.getElementById('mq-input'), {
        spaceBehavesLikeTab: true,
        handlers: { enter: () => addPolynomial() }
    });
    mathField.focus();

    document.getElementById('btn-add').addEventListener('click', addPolynomial);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    document.getElementById('btn-compute').addEventListener('click', compute);

    // Build presets
    const presetsEl = document.getElementById('presets');
    for (const preset of PRESETS) {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => loadPreset(preset));
        presetsEl.appendChild(btn);
    }
});

// ─── Polynomial list ───

function addPolynomial() {
    const latex = mathField.latex();
    if (!latex.trim()) return;

    const readable = latexToPolynomial(latex);
    if (!readable) return;

    polynomials.push({ latex, readable, id: Date.now() });
    updatePolyList();
    mathField.latex('');
    mathField.focus();
    updateComputeButton();
}

function removePolynomial(id) {
    const idx = polynomials.findIndex(p => p.id === id);
    if (idx !== -1) polynomials.splice(idx, 1);
    updatePolyList();
    updateComputeButton();
}

function clearAll() {
    polynomials.length = 0;
    updatePolyList();
    updateComputeButton();
    hideResults();
    mathField.latex('');
    mathField.focus();
}

function loadPreset(preset) {
    polynomials.length = 0;
    hideResults();
    preset.polys.forEach((p, i) => {
        polynomials.push({ latex: p, readable: latexToPolynomial(p), id: Date.now() + i });
    });
    updatePolyList();
    updateComputeButton();
    mathField.latex('');
}

function updatePolyList() {
    const el = document.getElementById('poly-list');
    el.innerHTML = '';
    polynomials.forEach((poly, i) => {
        const item = document.createElement('div');
        item.className = 'poly-item';
        item.innerHTML = `
            <span class="poly-item__math">\\(f_{${i + 1}} = ${poly.latex} = 0\\)</span>
            <button class="poly-item__remove" data-id="${poly.id}">Remove</button>
        `;
        item.querySelector('.poly-item__remove').addEventListener('click', () => removePolynomial(poly.id));
        el.appendChild(item);
    });
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]);
}

function updateComputeButton() {
    document.getElementById('btn-compute').disabled = polynomials.length === 0;
}

// ─── Compute ───

function compute() {
    if (polynomials.length === 0) return;

    hideResults();
    show('loading-card');

    // Defer to let spinner render
    setTimeout(() => {
        try {
            const ordering = document.getElementById('ordering').value;
            const doGrobner = document.getElementById('compute-grobner').checked;

            // Extract all variables
            const allVarsSet = new Set();
            for (const p of polynomials) {
                for (const v of extractVariables(p.readable)) allVarsSet.add(v);
            }
            const allVars = [...allVarsSet].sort((a, b) =>
                parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0])
            );

            // Compute S-ring closure
            const polyData = polynomials.map(p => ({ latex: p.latex, readable: p.readable }));
            const sResult = computeSRingClosure(polyData, allVars);

            // Compute local data
            const localData = new LocalFieldData(sResult.field, sResult.integralBasis, sResult.invertedPrimes);
            localData.compute();

            // Compute Gröbner basis if requested
            let grobnerResult = null;
            if (doGrobner && polynomials.length > 0) {
                const numVars = allVars.length || 1;
                const mvPolys = polynomials.map(p => QMvPoly.parse(p.readable, numVars));
                grobnerResult = buchbergerQ(mvPolys, ordering);
            }

            // Display
            hide('loading-card');
            displayFieldResult(sResult);
            displaySRingResult(sResult);
            displayLocalResult(localData, sResult);
            if (grobnerResult) displayGrobnerResult(grobnerResult, allVars);

        } catch (err) {
            hide('loading-card');
            console.error(err);
            show('result-field-card');
            document.querySelector('#result-field .result-box__content').innerHTML =
                `<p style="color: #ff8a9a;">Error: ${err.message}</p>`;
            if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
        }
    }, 50);
}

// ─── Display helpers ───

function displayFieldResult(res) {
    const K = res.field;
    const sig = K.signature();
    const disc = K.n > 1 ? res.integralBasis.disc : BigRational.ONE;

    let html = '';
    html += `<p><strong>Field:</strong> \\(K = ${K.toLatex()}\\)</p>`;
    if (K.n > 1) {
        html += `<p><strong>Minimal polynomial:</strong> \\(${K.minPoly.toLatex(K.name)}\\)</p>`;
    }
    html += `<p><strong>Degree:</strong> \\([K : \\mathbb{Q}] = ${K.n}\\)</p>`;
    html += `<p><strong>Signature:</strong> \\((r, s) = (${sig.r},\\, ${sig.s})\\)</p>`;
    if (K.n > 1) {
        html += `<p><strong>Discriminant:</strong> \\(\\Delta_K = ${disc.toLatex()}\\)</p>`;
    }

    // Generators
    if (res.generators.length > 0) {
        const genStrs = res.generators.map((g, i) =>
            `${res.generatorLabels[i]} = ${g.toLatex()}`
        );
        html += `<p><strong>Generators:</strong> \\(${genStrs.join(',\\quad ')}\\)</p>`;
    }

    if (res.warnings.length > 0) {
        for (const w of res.warnings) {
            html += `<p style="color: #ffcc88;">${w}</p>`;
        }
    }

    document.querySelector('#result-field .result-box__content').innerHTML = html;
    show('result-field-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function displaySRingResult(res) {
    const S = res.invertedPrimes;
    let html = '';

    // Input ring
    html += `<p><strong>Input ring:</strong> \\(R \\subseteq ${res.ringLatex()}\\)</p>`;

    // Integral basis
    if (res.field.n > 1) {
        const basisElems = res.integralBasis.basis();
        const basisStrs = basisElems.map(e => e.toLatex());
        html += `<p><strong>Ring of integers:</strong> \\(\\mathcal{O}_K = \\mathbb{Z}\\text{-span}\\{${basisStrs.join(', ')}\\}\\)</p>`;
    }

    // Inverted primes
    if (S.length > 0) {
        html += `<p><strong>Inverted primes:</strong> \\(S = \\{${S.join(', ')}\\}\\)</p>`;
    } else {
        html += `<p><strong>Inverted primes:</strong> \\(S = \\emptyset\\) (the ring is integral)</p>`;
    }

    // S-ring closure
    html += `<p><strong>S-ring closure:</strong> \\(${res.ringLatex()}\\)</p>`;

    if (S.length > 0) {
        const prod = S.reduce((a, b) => a * b, 1n);
        html += `<p class="hint">This is the ring of \\(S\\)-integers: elements of \\(K\\) integral at all primes \\(\\mathfrak{p} \\nmid ${prod}\\).</p>`;
    } else {
        html += `<p class="hint">All generators are algebraic integers, so the S-ring closure is the full ring of integers.</p>`;
    }

    document.querySelector('#result-sring .result-box__content').innerHTML = html;
    show('result-sring-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function displayLocalResult(localData, res) {
    let html = '';

    html += `<p><strong>Unbounded completions:</strong> \\(${localData.unboundedProductLatex()}\\)</p>`;
    html += `<p><strong>Total places:</strong> ${localData.totalUnboundedPlaces()}</p>`;

    // Table
    html += '<table class="places-table"><thead><tr>';
    html += '<th>Place</th><th>Type</th><th>Completion</th><th>Info</th>';
    html += '</tr></thead><tbody>';

    for (const a of localData.archimedean) {
        html += '<tr>';
        html += `<td>\\(v_{${a.index}}\\)</td>`;
        html += `<td><span class="tag tag--arch">${a.isReal ? 'Real' : 'Complex'}</span></td>`;
        html += `<td>\\(${a.completionLatex}\\)</td>`;
        html += `<td>${a.description}</td>`;
        html += '</tr>';
    }

    for (const na of localData.nonArchimedean) {
        html += '<tr>';
        html += `<td>\\(v_{${na.prime}}\\)</td>`;
        html += `<td><span class="tag tag--nonarch">\\(${na.prime}\\)-adic</span></td>`;
        html += `<td>\\(${na.completionLatex}\\)</td>`;
        html += `<td>${na.description}${na.ramification > 1 ? ` (ramified, e=${na.ramification})` : ''}${na.residueDegree > 1 ? ` (f=${na.residueDegree})` : ''}</td>`;
        html += '</tr>';
    }

    html += '</tbody></table>';

    // Bounded places
    if (res.invertedPrimes.length > 0 || res.field.n > 1) {
        html += `<p class="hint" style="margin-top: 0.75rem;">${localData.boundedDescription()}</p>`;
    }

    document.querySelector('#result-local .result-box__content').innerHTML = html;
    show('result-local-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

function displayGrobnerResult(gResult, varNames) {
    const basis = gResult.basis;
    const stats = gResult.stats;
    let html = '';

    html += `<p><strong>Order:</strong> ${gResult.order}</p>`;
    html += `<p><strong>Basis size:</strong> ${basis.length}</p>`;

    if (basis.length > 0) {
        html += '<div style="margin: 0.5rem 0;">';
        basis.forEach((g, i) => {
            html += `<p>\\(g_{${i + 1}} = ${g.toLatex(varNames)}\\)</p>`;
        });
        html += '</div>';
    } else {
        html += '<p>Empty basis (zero ideal)</p>';
    }

    // Check if ideal contains a constant
    const hasConst = basis.some(g => {
        const lt = g.leadingTerm(gResult.order);
        return lt && Mono.isZero(lt.exp);
    });
    if (hasConst) {
        html += '<p style="color: #ff8a9a; font-weight: 600;">The ideal contains a nonzero constant — it is the entire ring.</p>';
    }

    html += '<p class="hint" style="margin-top: 0.5rem;">';
    html += `Iterations: ${stats.iterations}, S-polys: ${stats.sPolys}, `;
    html += `Reductions: ${stats.reductions}, Basis additions: ${stats.basisAdded}`;
    html += '</p>';

    document.querySelector('#result-grobner .result-box__content').innerHTML = html;
    show('result-grobner-card');
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise();
}

// ─── Visibility ───

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function hideResults() {
    ['loading-card', 'result-field-card', 'result-sring-card', 'result-local-card', 'result-grobner-card']
        .forEach(hide);
}
