let currentStep = 0;
let actionData = null;

const stepExplanations = [
    "Initial configuration: acting on a vertex with a matrix.",
    "First, we represent the vertex as a matrix.",
    "Multiply the action matrix with the vertex matrix.",
    "Check p-adic valuations. Swap columns if necessary.",
    "Eliminate the bottom-left entry.",
    "Normalize the matrix (divide by bottom-right).",
    "Scale first column by unit inverse.",
    "Reduce top-right residue.",
    "The action is complete!"
];

function createMatrixHTML(mat, id = "", isFormula = false) {
    const data = isFormula ? mat : {
        a: mat.a.toLatex(), b: mat.b.toLatex(),
        c: mat.c.toLatex(), d: mat.d.toLatex()
    };
    return `
        <div class="matrix-wrapper ${isFormula ? 'formula-mode' : ''}" ${id ? `id="${id}"` : ""}>
            <div class="matrix-bracket"></div>
            <div class="matrix-body">
                <div class="matrix-column" id="${id}-col-0">
                    <div class="matrix-cell">\\(${data.a}\\)</div>
                    <div class="matrix-cell">\\(${data.c}\\)</div>
                </div>
                <div class="matrix-column" id="${id}-col-1">
                    <div class="matrix-cell">\\(${data.b}\\)</div>
                    <div class="matrix-cell">\\(${data.d}\\)</div>
                </div>
            </div>
            <div class="matrix-bracket right"></div>
        </div>
    `;
}

function createMorphRHS(q, n, mode, p) {
    const bigP = BigInt(p);
    const pn = n >= 0 ? new BigFrac(bigP ** BigInt(n)) : new BigFrac(1n, bigP ** BigInt(-n));
    const isMatrix = mode === "matrix";
    const isMult = mode === "mult";

    return `
        <div class="morph-box" id="morph-rhs">
            <!-- Floor Brackets -->
            <div class="floor-bracket left ${isMatrix || isMult ? 'hidden-morph' : ''}" style="left: 60px;">\u230A</div>
            <div class="floor-bracket right ${isMatrix || isMult ? 'hidden-morph' : ''}" style="right: 60px;">\u230B</div>
            
            <!-- Matrix Parentheses -->
            <div class="matrix-bracket left ${isMatrix || isMult ? '' : 'hidden-morph'}" style="position: absolute; left: 20px;"></div>
            <div class="matrix-bracket right ${isMatrix || isMult ? '' : 'hidden-morph'}" style="position: absolute; right: 20px;"></div>
            
            <!-- Cells -->
            <div class="morph-item" id="morph-q" style="
                transform: ${(isMatrix || isMult) ? 'translate(65px, -40px)' : 'translate(0, 0)'};
                font-size: ${(isMatrix || isMult) ? '2.5rem' : '3.5rem'};
                opacity: ${isMult ? 0 : 1};
            ">\\(${q.toLatex()}\\)</div>
            
            <div class="morph-item" id="morph-n" style="
                transform: ${(isMatrix || isMult) ? 'translate(-65px, -40px)' : 'translate(65px, 20px)'};
                font-size: ${(isMatrix || isMult) ? '2.5rem' : '1.8rem'};
                color: ${(isMatrix || isMult) ? 'var(--text)' : 'var(--accent)'};
                opacity: ${isMult ? 0 : 1};
            ">\\(${isMatrix || isMult ? pn.toLatex() : n}\\)</div>
            
            <div class="morph-item ${isMatrix || isMult ? '' : 'hidden-morph'}" style="transform: translate(-65px, 40px); opacity: ${isMatrix ? 1 : 0};">\\(0\\)</div>
            <div class="morph-item ${isMatrix || isMult ? '' : 'hidden-morph'}" style="transform: translate(65px, 40px); opacity: ${isMatrix ? 1 : 0};">\\(1\\)</div>
        </div>
    `;
}

function startAction() {
    const p = parseInt(document.getElementById('prime-p').value);
    const qStr = document.getElementById('vertex-q').value;
    const n = parseInt(document.getElementById('vertex-n').value);

    const a = new BigFrac(document.getElementById('g-a').value);
    const b = new BigFrac(document.getElementById('g-b').value);
    const c = new BigFrac(document.getElementById('g-c').value);
    const d = new BigFrac(document.getElementById('g-d').value);

    const matG = new BigMat(a, b, c, d);
    const q = new BigFrac(qStr);

    actionData = {
        p, q, n, g: matG,
        steps: []
    };

    calculateSteps();
    currentStep = 0;
    updateDisplay();
}

function calculateSteps() {
    const { p, q, n, g } = actionData;
    const steps = [];

    // Step 0: Initial
    steps.push({
        type: "morph",
        mode: "vertex",
        g: g, q: q, n: n, p: p,
        desc: "Initial configuration: acting on a vertex."
    });

    // Step 1: Matrix conversion
    const bigP = BigInt(p);
    const pn = n >= 0 ? new BigFrac(bigP ** BigInt(n)) : new BigFrac(1n, bigP ** BigInt(-n));
    const matM = new BigMat(pn, q, 0, 1);
    steps.push({
        type: "morph",
        mode: "matrix",
        g: g, m: matM, q: q, n: n, p: p,
        desc: "Represent the vertex as a matrix $M(q)$."
    });

    // Step 2: Multiplication - FORMULA
    const formula = g.getMulFormula(matM);
    steps.push({
        type: "mult-formula",
        g: g, m: matM, formula: formula,
        desc: "Multiply $g \\cdot M(q)$. Combining entries: $(g_{11}m_{11} + g_{12}m_{21})$, etc."
    });

    // Step 3: Multiplication - RESULT
    const matProduct = g.mul(matM);
    steps.push({
        type: "single",
        mat: matProduct,
        content: createMatrixHTML(matProduct, "acting-mat"),
        desc: "Simplify the results of the multiplication."
    });

    // Step 4: Swap Check
    let m3 = matProduct;
    const vc = m3.c.val(p);
    const vd = m3.d.val(p);
    let swapNeeded = vc < vd;
    let m3_after = swapNeeded ? m3.swapCols() : m3;

    steps.push({
        type: "swap",
        matBefore: m3,
        matAfter: m3_after,
        needed: swapNeeded,
        content: createMatrixHTML(m3, "swap-mat"),
        desc: `Check valuations: \\(v_p(c)=${vc}\\), \\(v_p(d)=${vd}\\). ${swapNeeded ? "Swap columns." : "No swap needed."}`
    });

    // Step 5: Elimination
    const u = m3_after.c.div(m3_after.d);
    const m4 = new BigMat(
        m3_after.a.sub(u.mul(m3_after.b)), m3_after.b,
        new BigFrac(0), m3_after.d
    );
    steps.push({
        type: "single",
        mat: m4,
        content: createMatrixHTML(m4, "elim-mat"),
        desc: `Zero out $c$ by subtracting Column 2 contribution.`
    });

    // Step 6: Normalize
    const m5 = new BigMat(
        m4.a.div(m4.d), m4.b.div(m4.d),
        new BigFrac(0), new BigFrac(1)
    );
    steps.push({
        type: "single",
        mat: m5,
        content: createMatrixHTML(m5, "norm-mat"),
        desc: `Normalize the matrix by dividing by $d$.`
    });

    // Step 7: Scale
    const { v: mLevel, unit } = m5.a.getUP(p);
    const m6 = new BigMat(
        m5.a.div(unit), m5.b,
        new BigFrac(0), new BigFrac(1)
    );
    steps.push({
        type: "single",
        mat: m6,
        content: createMatrixHTML(m6, "scale-mat"),
        desc: `Scale first column to recover $p^{${mLevel}}$.`
    });

    // Step 8: Residue
    const qFinal = m6.b.modPn(p, mLevel);
    const qStep = new BigMat(m6.a, qFinal, new BigFrac(0), new BigFrac(1));
    steps.push({
        type: "single",
        mat: qStep,
        content: createMatrixHTML(qStep, "residue-mat"),
        desc: `Reduce top-right residue modulo $p^{${mLevel}}$.`
    });

    // Step 9: Result
    steps.push({
        type: "result",
        content: `
            <div class="result-equation">
                ${createMatrixHTML(g)}
                <div class="operator">\\(\\cdot\\)</div>
                <div class="vertex-notation">\\(\\lfloor ${q.toLatex()} \\rfloor_{${n}}\\)</div>
                <div class="operator">\\(=\\)</div>
                <div class="vertex-notation">\\(\\lfloor ${qFinal.toLatex()} \\rfloor_{${mLevel}}\\)</div>
            </div>
        `,
        desc: "The action is complete!"
    });

    actionData.steps = steps;
}

function updateDisplay() {
    if (!actionData) return;
    const step = actionData.steps[currentStep];
    const container = document.getElementById('math-content');

    document.getElementById('step-count').innerText = `Step ${currentStep}`;

    if (step.type === "morph") {
        container.innerHTML = `
            ${createMatrixHTML(step.g, "g-left")}
            <div class="operator" id="op-dot">\\(\\cdot\\)</div>
            ${createMorphRHS(step.q, step.n, step.mode, step.p)}
        `;
    } else if (step.type === "mult-formula") {
        // Prepare for collision
        container.innerHTML = `
            ${createMatrixHTML(step.g, "g-left")}
            <div class="operator" id="op-dot" style="opacity: 0;">\\(\\cdot\\)</div>
            ${createMatrixHTML(step.m, "m-right")}
        `;

        // Trigger collision and formula reveal
        setTimeout(() => {
            const gLeft = document.getElementById('g-left');
            const mRight = document.getElementById('m-right');
            if (gLeft && mRight) {
                gLeft.style.opacity = "0";
                gLeft.style.transform = "translateX(100px) scale(0.8)";
                mRight.style.opacity = "0";
                mRight.style.transform = "translateX(-100px) scale(0.8)";
            }

            setTimeout(() => {
                container.innerHTML = createMatrixHTML(step.formula, "formula-mat", true);
                MathJax.typesetPromise([container]);
            }, 400);
        }, 50);
    } else {
        container.innerHTML = step.content;
    }

    if (step.type === "swap" && step.needed) {
        setTimeout(() => {
            const col0 = document.getElementById('swap-mat-col-0');
            const col1 = document.getElementById('swap-mat-col-1');
            if (col0 && col1) {
                col0.style.transform = "translateX(130px)";
                col1.style.transform = "translateX(-130px)";
            }
        }, 50);
    }

    const explanationPanel = document.getElementById('explanation');
    explanationPanel.innerHTML = step.desc;

    MathJax.typesetPromise([container, explanationPanel]).catch(e => console.error(e));

    document.getElementById('prev-btn').disabled = currentStep === 0;
    document.getElementById('next-btn').innerText = currentStep === actionData.steps.length - 1 ? "Start Over" : "Next Step";
}

document.getElementById('start-btn').addEventListener('click', startAction);
document.getElementById('next-btn').addEventListener('click', () => {
    if (currentStep < actionData.steps.length - 1) currentStep++;
    else currentStep = 0;
    updateDisplay();
});
document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentStep > 0) currentStep--;
    updateDisplay();
});

window.onload = startAction;
