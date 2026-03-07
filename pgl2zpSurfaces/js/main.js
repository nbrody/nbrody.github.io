/* ============================================================
   main.js – Application entry point and UI orchestration
   ============================================================ */

import { isPrime, fmtMat, wordToMatrix, inversePerm } from './math.js';
import { findRepresentation, schreierGenerators } from './search.js';
import { drawGraph } from './graph.js';
import { DirichletRenderer } from './dirichlet.js';

// ---------- DOM refs ----------
const els = {
    primeInput: document.getElementById('primeInput'),
    attemptsInput: document.getElementById('attemptsInput'),
    seedInput: document.getElementById('seedInput'),
    runBtn: document.getElementById('runBtn'),
    exampleBtn: document.getElementById('exampleBtn'),
    status: document.getElementById('status'),
    diag: document.getElementById('diag'),
    kpiIndex: document.getElementById('kpiIndex'),
    kpiOpen: document.getElementById('kpiOpen'),
    kpiClosed: document.getElementById('kpiClosed'),
    topologyText: document.getElementById('topologyText'),
    graphSvg: document.getElementById('graphSvg'),
    graphCaption: document.getElementById('graphCaption'),
    cycleText: document.getElementById('cycleText'),
    generatorsBody: document.getElementById('generatorsBody'),
    groupText: document.getElementById('groupText'),
    hypCanvas: document.getElementById('hypCanvas'),
    resetViewBtn: document.getElementById('resetViewBtn'),
    checkTiling: document.getElementById('checkTiling'),
    checkOrbit: document.getElementById('checkOrbit'),
};

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabGroup = btn.closest('.card').querySelectorAll('.tab-btn');
        const panels = btn.closest('.card').querySelectorAll('.tab-panel');
        tabGroup.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        document.getElementById(target).classList.add('active');
        // Resize canvas when Dirichlet tab becomes visible
        if (target === 'panelDirichlet' && dirichletRenderer) {
            requestAnimationFrame(() => dirichletRenderer._resize());
        }
    });
});

// ---------- Dirichlet renderer ----------
let dirichletRenderer = null;
if (els.hypCanvas) {
    dirichletRenderer = new DirichletRenderer(els.hypCanvas);
}

if (els.resetViewBtn) {
    els.resetViewBtn.addEventListener('click', () => {
        if (dirichletRenderer) dirichletRenderer.resetView();
    });
}

if (els.checkTiling) {
    els.checkTiling.addEventListener('change', (e) => {
        if (dirichletRenderer) {
            dirichletRenderer.showTiling = e.target.checked;
            dirichletRenderer.draw();
        }
    });
}
if (els.checkOrbit) {
    els.checkOrbit.addEventListener('change', (e) => {
        if (dirichletRenderer) {
            dirichletRenderer.showOrbit = e.target.checked;
            dirichletRenderer.draw();
        }
    });
}

// ---------- Accordion toggles ----------
document.querySelectorAll('.accordion-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.classList.toggle('open');
        const body = btn.nextElementSibling;
        body.classList.toggle('open');
    });
});

// ---------- Render results ----------
function render(result, p) {
    const n = 2 * p + 2;
    els.kpiIndex.textContent = String(n);
    els.kpiOpen.textContent = `Σ_{${p + 1},2}`;
    els.kpiClosed.textContent = `Σ_${p + 2}`;

    els.topologyText.textContent =
        `The subgroup H has index ${n} in the punctured-torus group Δ = ⟨A,B⟩.
The quotient surface H\ℍ is a surface Σ_{${p + 1},2} of genus ${p + 1} with 2 boundary components.
Indeed χ(Σ) = -[Δ:H] = -${n}, and with b=2 this gives 2 - 2g - 2 = -${n}, so g = ${p + 1}.
After gluing the two boundary curves by τ = [[${p},0],[0,1]], one obtains a closed surface Σ_${p + 2}.`;

    const cycles = result.cycles.slice().sort((x, y) => x.length - y.length);
    els.cycleText.textContent =
        `Cycle decomposition of u = [a,b] on cosets:
${cycles.map((c, i) => `Cycle ${i + 1} (length ${c.length}): (${c.map(x => x + 1).join(' ')})`).join('\n')}

This means the two peripheral subgroups of H are conjugate to ⟨U²⟩ and ⟨U^${2 * p}⟩.
Since τ U² τ⁻¹ = U^${2 * p}, the gluing by τ identifies the two boundary circles.`;

    els.graphCaption.textContent =
        `Transitive Schreier graph on ${n} vertices. Black arrows trace the boundary cycles of [a,b], of lengths 2 and ${2 * p}.`;

    drawGraph(els.graphSvg, result.a, result.b, result.u);

    // Generators table
    const gens = schreierGenerators(result.a, result.b);
    els.generatorsBody.innerHTML = gens.map((w, i) => {
        const wordAB = w.split('').map(ch => ({ a: 'A', A: 'A⁻¹', b: 'B', B: 'B⁻¹' })[ch]).join(' ');
        const M = wordToMatrix(w);
        return `<tr><td style="color:var(--accent);font-weight:600;">${i + 1}</td><td>${wordAB || '1'}</td><td>${fmtMat(M)}</td></tr>`;
    }).join('');

    els.groupText.textContent =
        `Take Δ = ⟨A,B⟩ with
A = [[2,1],[1,1]],   B = [[2,-1],[-1,1]],   U = [A,B] = [[1,6],[0,1]].

For p = ${p}, the program found a subgroup H < Δ of index ${n} whose boundary cycle data is (2)(${2 * p}).
Hence H is isomorphic to π₁(Σ_{${p + 1},2}).

Now adjoin
τ = [[${p},0],[0,1]] ∈ PGL₂(Z[1/${p}]).
Then τ U² τ⁻¹ = U^${2 * p}.
So the glued group is

Γ_p = ⟨ H, τ | τ U² τ⁻¹ = U^${2 * p} ⟩ < PGL₂(Z[1/${p}]),

and topologically Γ_p ≅ π₁(Σ_${p + 2}), the closed surface group of genus ${p + 2}.

A generating set for H is listed above; adjoining τ gives an explicit matrix generating set for Γ_p.`;

    // Build Dirichlet tiling
    if (dirichletRenderer) {
        const cosetPerms = {
            a: result.a,
            b: result.b,
            A: inversePerm(result.a),
            B: inversePerm(result.b),
        };
        dirichletRenderer.build(cosetPerms, n, p);
    }
}

// ---------- Main run ----------
async function run() {
    const p = Number(els.primeInput.value);
    const attempts = Number(els.attemptsInput.value);
    const seed = Number(els.seedInput.value);

    if (!isPrime(p)) {
        els.status.innerHTML = '<span class="warn">⚠ Please enter a prime.</span>';
        els.diag.textContent = '';
        return;
    }

    els.status.innerHTML = '<span class="searching"><span class="spinner"></span> Searching for transitive permutation model...</span>';
    els.diag.textContent = `p = ${p}, degree ${2 * p + 2}, seed ${seed}`;
    els.runBtn.disabled = true;

    await new Promise(r => setTimeout(r, 30));

    try {
        const res = findRepresentation(p, attempts, seed, (t, s) => {
            els.status.innerHTML = `<span class="searching"><span class="spinner"></span> Checked ${t} pairs (seed ${s})...</span>`;
        });

        if (!res) {
            els.status.innerHTML = '<span class="warn">⚠ No example found. Try increasing attempts or changing seed.</span>';
            els.diag.textContent = `Exhausted ${attempts} candidates.`;
            els.runBtn.disabled = false;
            return;
        }

        els.status.innerHTML = `<span class="good">✓ Found example after ${res.attempts} candidate(s).</span>`;
        els.diag.textContent = `Seed ${res.seedUsed}`;
        render(res, p);
    } catch (err) {
        els.status.innerHTML = '<span class="warn">⚠ Error during construction.</span>';
        els.diag.textContent = String(err?.message || err);
        console.error(err);
    }

    els.runBtn.disabled = false;
}

// ---------- Event listeners ----------
els.runBtn.addEventListener('click', run);

els.exampleBtn.addEventListener('click', () => {
    els.primeInput.value = 2;
    els.seedInput.value = 1;
    els.attemptsInput.value = 3000;
    run();
});

// Auto-run on load
run();
