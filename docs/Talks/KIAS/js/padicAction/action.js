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
        <div class="morph-box" id="morph-rhs" data-mode="${mode}">
            <!-- Floor Brackets -->
            <div class="floor-bracket left ${isMatrix || isMult ? 'hidden-morph' : ''}" style="left: 85px;">\u230A</div>
            <div class="floor-bracket right ${isMatrix || isMult ? 'hidden-morph' : ''}" style="right: 85px;">\u230B</div>
            
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
                transform: ${(isMatrix || isMult) ? 'translate(-65px, -40px)' : 'translate(75px, 35px)'};
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
        desc: "Computing the action of \(g\) on the vertex \(q\)."
    });

    // Step 1: Matrix conversion
    const bigP = BigInt(p);
    const pn = n >= 0 ? new BigFrac(bigP ** BigInt(n)) : new BigFrac(1n, bigP ** BigInt(-n));
    const matM = new BigMat(pn, q, 0, 1);
    steps.push({
        type: "morph",
        mode: "matrix",
        g: g, m: matM, q: q, n: n, p: p,
        desc: "Represent the vertex as a matrix \\(M(q)\\)."
    });

    // Step 2: Multiplication - FORMULA
    const formula = g.getMulFormula(matM);
    steps.push({
        type: "mult-formula",
        g: g, m: matM, formula: formula,
        desc: "Multiply \\(g \\cdot M(q)\\)"
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
        desc: `Check valuations: \\(v_p(c)=${vc}\\), \\(v_p(d)=${vd}\\). ${swapNeeded ? "Swap columns, since \\(v_p(c) < v_p(d)\\)." : "No swap needed, since \\(v_p(c) \\ge v_p(d)\\)."}`
    });

    // Step 5: Elimination
    const u = m3_after.c.div(m3_after.d);
    const m4 = new BigMat(
        m3_after.a.sub(u.mul(m3_after.b)), m3_after.b,
        new BigFrac(0), m3_after.d
    );
    steps.push({
        type: "elimination",
        matBefore: m3_after,
        matAfter: m4,
        u: u,
        content: createMatrixHTML(m3_after, "elim-mat"),
        desc: `Zero out \\(c\\) by subtracting a \\(\\mathbb{Z}_p\\)-multiple of Column 2: \\(c_{new} = c - (${u.toLatex()}) \\cdot d \\).`
    });

    // Step 6: Normalize
    const m5 = new BigMat(
        m4.a.div(m4.d), m4.b.div(m4.d),
        new BigFrac(0), new BigFrac(1)
    );
    steps.push({
        type: "normalize",
        matBefore: m4,
        matAfter: m5,
        divisor: m4.d,
        content: createMatrixHTML(m4, "norm-mat"),
        desc: `Normalize the matrix by dividing everything by \\(d = ${m4.d.toLatex()}\\).`
    });

    // Step 7: Scale
    const { v: mLevel, unit } = m5.a.getUP(p);
    const m6 = new BigMat(
        m5.a.div(unit), m5.b,
        new BigFrac(0), new BigFrac(1)
    );
    steps.push({
        type: "scale",
        matBefore: m5,
        matAfter: m6,
        unit: unit,
        level: mLevel,
        p: p,
        content: createMatrixHTML(m5, "scale-mat"),
        desc: `Factorize top-left: \\( ${m5.a.toLatex()} = ${unit.toLatex()} \\cdot ${p}^{${mLevel}} \\). We divide the first column by the unit part \\(u\\).`
    });

    // Step 8: Residue
    const qFinal = m6.b.modPn(p, mLevel);
    const qStep = new BigMat(m6.a, qFinal, new BigFrac(0), new BigFrac(1));
    steps.push({
        type: "single",
        mat: qStep,
        content: createMatrixHTML(qStep, "residue-mat"),
        desc: `Shift top-right entry into \\([0, p^{${mLevel}})\\). Then \\(q_{new} = ${m6.b.toLatex()} \\pmod{${p}^{${mLevel}}}\\).`
    });

    // Step 9: Result
    steps.push({
        type: "result",
        content: String.raw`
            <div style="display: flex; flex-direction: column; align-items: center; gap: 2rem;">
                <div class="result-equation">
                    ${createMatrixHTML(g)}
                    <div class="operator" style="font-size: 1.5rem;">\(\cdot\)</div>
                    <div class="vertex-notation">\(\lfloor ${q.toLatex()} \rfloor_{${n}}\)</div>
                    <div class="operator">\(=\)</div>
                    <div class="vertex-notation">\(\lfloor ${qFinal.toLatex()} \rfloor_{${mLevel}}\)</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 1.2rem; margin-top: 1rem;">
                    <div style="font-size: 1.8rem; color: var(--accent); opacity: 0.9;">
                        \[ g \cdot \lfloor q \rfloor_n = \left\lfloor \frac{aq+b}{cq+d} \right\rfloor_{n'} \]
                    </div>
                    <div style="font-size: 1.4rem; color: var(--text); opacity: 0.7;">
                        \[ n' = n + v_p(\det g) - 2 \min \bigl( v_p(cp^n), v_p(cq+d) \bigr) \]
                    </div>
                </div>
                <div style="font-size: 1rem; color: #94a3b8; max-width: 600px;">
                    The power \( n' \) reflects the \( p \)-adic norm of the denominator, 
                    analogous to how \( \text{Im}(gz) = \frac{\text{Im}(z)}{|cz+d|^2} \) in the hyperbolic plane.
                </div>
            </div>
        `,
        desc: "The action is complete! This formula describes how heights change in the tree."
    });

    actionData.steps = steps;
}

function updateDisplay() {
    if (!actionData) return;
    const step = actionData.steps[currentStep];
    const container = document.getElementById('math-content');
    const explanationPanel = document.getElementById('explanation');
    const oldRHS = document.getElementById('morph-rhs');

    document.getElementById('step-count').innerText = `Step ${currentStep}`;

    // Helper to finish update
    const finish = () => {
        explanationPanel.innerHTML = step.desc;
        MathJax.typesetPromise([container, explanationPanel]).catch(e => console.error(e));
        document.getElementById('prev-btn').disabled = currentStep === 0;
        document.getElementById('next-btn').innerText = currentStep === actionData.steps.length - 1 ? "Start Over" : "Next Step";
    };

    // Custom Animation for Step 0 -> Step 1
    if (currentStep === 1 && oldRHS && oldRHS.dataset.mode === "vertex") {
        const newRHSHTML = createMorphRHS(step.q, step.n, "matrix", step.p);
        const temp = document.createElement('div');
        temp.innerHTML = newRHSHTML;
        const newRHS = temp.firstElementChild;

        // Use precise positioning relative to container
        const containerRect = container.getBoundingClientRect();
        const oldRect = oldRHS.getBoundingClientRect();

        newRHS.style.position = 'absolute';
        newRHS.style.left = (oldRect.left - containerRect.left) + 'px';
        newRHS.style.top = (oldRect.top - containerRect.top + oldRect.height) + 'px';
        newRHS.style.width = oldRect.width + 'px';
        newRHS.style.height = oldRect.height + 'px';
        newRHS.style.opacity = '0';
        newRHS.id = "morph-rhs-new";

        container.appendChild(newRHS);

        MathJax.typesetPromise([newRHS]).then(() => {
            newRHS.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease';
            oldRHS.style.transition = 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease';

            requestAnimationFrame(() => {
                newRHS.style.opacity = '1';
                newRHS.style.transform = `translateY(-${oldRect.height}px)`;
                oldRHS.style.opacity = '0';
                oldRHS.style.transform = `translateY(-${oldRect.height}px)`;
            });

            setTimeout(() => {
                if (oldRHS.parentNode) oldRHS.parentNode.removeChild(oldRHS);
                newRHS.id = "morph-rhs";
                newRHS.style.position = '';
                newRHS.style.left = '';
                newRHS.style.top = '';
                newRHS.style.transform = '';
                newRHS.style.transition = '';
                finish();
            }, 850);
        });
        return;
    }

    if (currentStep === 0 && oldRHS && oldRHS.dataset.mode === "matrix") {
        container.innerHTML = `
            ${createMatrixHTML(step.g, "g-left")}
            <div class="operator" id="op-dot">\\(\\cdot\\)</div>
            ${createMorphRHS(step.q, step.n, "vertex", step.p)}
        `;
        finish();
        return;
    }

    // Default Step Rendering
    if (step.type === "morph") {
        container.innerHTML = `
            ${createMatrixHTML(step.g, "g-left")}
            <div class="operator" id="op-dot">\\(\\cdot\\)</div>
            ${createMorphRHS(step.q, step.n, step.mode, step.p)}
        `;
        const rhs = document.getElementById('morph-rhs');
        if (rhs) rhs.dataset.mode = step.mode;
        finish();
    } else if (step.type === "mult-formula") {
        container.innerHTML = `
            ${createMatrixHTML(step.g, "g-left")}
            <div class="operator" id="op-dot" style="opacity: 0;">\\(\\cdot\\)</div>
            ${createMatrixHTML(step.m, "m-right")}
        `;

        MathJax.typesetPromise([container]).then(() => {
            setTimeout(() => {
                const gLeft = document.getElementById('g-left');
                const mRight = document.getElementById('m-right');
                if (gLeft && mRight) {
                    gLeft.style.transition = 'opacity 0.6s ease-in, transform 0.6s ease-in';
                    mRight.style.transition = 'opacity 0.6s ease-in, transform 0.6s ease-in';
                    gLeft.style.opacity = "0";
                    gLeft.style.transform = "translateX(120px) scale(0.7) rotate(10deg)";
                    mRight.style.opacity = "0";
                    mRight.style.transform = "translateX(-120px) scale(0.7) rotate(-10deg)";
                }
                setTimeout(() => {
                    container.innerHTML = createMatrixHTML(step.formula, "formula-mat", true);
                    finish();
                }, 600);
            }, 500);
        });
    } else if (step.type === "elimination") {
        container.innerHTML = step.content;
        MathJax.typesetPromise([container]).then(() => {
            const mat = document.getElementById('elim-mat');
            if (!mat) return;
            const col1 = mat.querySelector('#elim-mat-col-0');
            const col2 = mat.querySelector('#elim-mat-col-1');

            // Create multiplier tag
            const tag = document.createElement('div');
            tag.className = 'multiplier-tag';
            tag.innerHTML = `\\(\\times -(${step.u.toLatex()})\\)`;
            tag.style.left = '75%';
            tag.style.top = '0';
            tag.style.opacity = '0';
            tag.style.transform = 'translateY(10px)';
            mat.querySelector('.matrix-body').appendChild(tag);

            MathJax.typesetPromise([tag]).then(() => {
                setTimeout(() => {
                    tag.style.opacity = '1';
                    tag.style.transform = 'translateY(0)';
                    tag.style.transition = 'all 0.5s ease';

                    // Animate multiplication and subtraction
                    setTimeout(() => {
                        const cells2 = col2.querySelectorAll('.matrix-cell');
                        cells2.forEach((c2, i) => {
                            const rect = c2.getBoundingClientRect();
                            const parentRect = container.getBoundingClientRect();
                            const ghost = document.createElement('div');
                            ghost.className = 'ghost-cell';
                            ghost.innerHTML = c2.innerHTML;
                            ghost.style.left = (rect.left - parentRect.left) + 'px';
                            ghost.style.top = (rect.top - parentRect.top) + 'px';
                            container.appendChild(ghost);

                            setTimeout(() => {
                                ghost.style.transform = 'translateX(-115px)';
                                ghost.style.opacity = '0';
                                if (i === 0) {
                                    col1.style.filter = 'drop-shadow(0 0 10px var(--accent))';
                                }
                            }, 50);
                        });

                        setTimeout(() => {
                            container.innerHTML = createMatrixHTML(step.matAfter, "elim-mat-final");
                            finish();
                        }, 1100);
                    }, 1500);
                }, 800);
            });
        });
    } else if (step.type === "normalize") {
        container.innerHTML = step.content;
        MathJax.typesetPromise([container]).then(() => {
            const mat = document.getElementById('norm-mat');
            if (!mat) return;

            // Create divisor tag on the left
            const tag = document.createElement('div');
            tag.className = 'multiplier-tag';
            tag.innerHTML = `\\(\\frac{1}{d} = \\frac{1}{${step.divisor.toLatex()}}\\)`;
            tag.style.left = '-120px';
            tag.style.top = '40%';
            tag.style.opacity = '0';
            mat.querySelector('.matrix-body').appendChild(tag);

            MathJax.typesetPromise([tag]).then(() => {
                setTimeout(() => {
                    tag.style.opacity = '1';
                    tag.style.left = '-80px';
                    tag.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';

                    setTimeout(() => {
                        tag.style.left = '40%';
                        tag.style.opacity = '0';
                        tag.style.transform = 'scale(0.5)';
                        mat.style.filter = 'brightness(1.5) saturate(1.2)';
                        mat.style.transition = 'all 0.5s ease';

                        setTimeout(() => {
                            container.innerHTML = createMatrixHTML(step.matAfter, "norm-mat-final");
                            finish();
                        }, 500);
                    }, 1500);
                }, 500);
            });
        });
    } else if (step.type === "scale") {
        container.innerHTML = step.content;
        MathJax.typesetPromise([container]).then(() => {
            const mat = document.getElementById('scale-mat');
            if (!mat) return;
            const cellA = mat.querySelector('#scale-mat-col-0 .matrix-cell');

            // Create factorization tag
            const tag = document.createElement('div');
            tag.className = 'multiplier-tag';
            tag.innerHTML = `\\( ${step.unit.toLatex()} \\cdot ${step.p}^{${step.level}} \\)`;
            tag.style.left = '-140px';
            tag.style.top = '0';
            tag.style.opacity = '0';
            cellA.parentNode.appendChild(tag);

            MathJax.typesetPromise([tag]).then(() => {
                setTimeout(() => {
                    cellA.style.color = 'var(--accent)';
                    cellA.style.transform = 'scale(1.1)';
                    cellA.style.transition = 'all 0.5s ease';
                    tag.style.opacity = '1';
                    tag.style.transform = 'translateX(20px)';
                    tag.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';

                    setTimeout(() => {
                        // "Remove" the unit - target the unit part of the string if possible, 
                        // but here we'll just fade the tag and update the cell.
                        tag.style.opacity = '0';
                        tag.style.transform = 'translateY(-20px) scale(0.8)';

                        setTimeout(() => {
                            container.innerHTML = createMatrixHTML(step.matAfter, "scale-mat-final");
                            finish();
                        }, 600);
                    }, 2000);
                }, 500);
            });
        });
    } else if (step.type === "swap") {
        container.innerHTML = step.content;
        MathJax.typesetPromise([container]).then(() => {
            if (step.needed) {
                setTimeout(() => {
                    const col0 = document.getElementById('swap-mat-col-0');
                    const col1 = document.getElementById('swap-mat-col-1');
                    if (col0 && col1) {
                        col0.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                        col1.style.transition = 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                        col0.style.transform = "translateX(150px)";
                        col1.style.transform = "translateX(-150px)";
                    }
                }, 500);
            }
            finish();
        });
    } else {
        container.innerHTML = step.content;
        finish();
    }
}

document.getElementById('start-btn').addEventListener('click', startAction);
document.getElementById('next-btn').addEventListener('click', () => {
    if (currentStep < actionData.steps.length - 1) {
        currentStep++;
        updateDisplay();
    } else {
        currentStep = 0;
        updateDisplay();
    }
});
document.getElementById('prev-btn').addEventListener('click', () => {
    if (currentStep > 0) {
        currentStep--;
        updateDisplay();
    }
});

window.onload = startAction;
window.addEventListener('message', (event) => {
    if (event.data === 'next') {
        if (actionData && currentStep < actionData.steps.length - 1) {
            currentStep++;
            updateDisplay();
        } else if (actionData) {
            currentStep = 0;
            updateDisplay();
        }
    } else if (event.data === 'prev') {
        if (actionData && currentStep > 0) {
            currentStep--;
            updateDisplay();
        }
    }
});
