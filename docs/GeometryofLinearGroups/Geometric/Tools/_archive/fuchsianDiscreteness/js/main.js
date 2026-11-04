/**
 * main.js — wire the rational input, the (worker-backed) discreteness analysis, and the H² view.
 * Heavy computation (beam search + Dirichlet domain + Poincaré certificate) runs in a Web Worker
 * so the canvas and inputs stay responsive; a synchronous fallback covers environments without it.
 */
import { HypView } from './view.js';
import { setupMatrixInput, getMatricesFromUI, getLatexRows, setMatrixReadouts } from './matrixInput.js';
import { computeAnalysis, toWire, rehydrate } from './compute.js';
import { analyzeLatexRows } from './nfgroup.js';

const PALETTE = ['#38bdf8', '#f472b6', '#a78bfa', '#22c55e', '#fbbf24', '#fb7185', '#2dd4bf', '#c084fc'];
const view = new HypView(document.getElementById('canvas'));
const banner = document.getElementById('status-banner');

function kindLabel(cls) {
    switch (cls.kind) {
        case 'identity': return 'identity';
        case 'elliptic': return cls.infiniteOrder ? 'elliptic · infinite order' : `elliptic · order ${cls.order}`;
        case 'parabolic': return 'parabolic';
        case 'hyperbolic': return 'hyperbolic';
        case 'reflection': return 'reflection (order 2)';
        case 'glide': return 'glide reflection';
        default: return cls.kind;
    }
}
const tex = s => `\\(${s}\\)`;
function typeset(el) { if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([el]).catch(() => { }); }

function setBanner(verdict) {
    const map = {
        'discrete': ['discrete', 'Discrete group'],
        'non-discrete': ['nondiscrete', 'Not discrete'],
        'inconclusive': ['inconclusive', 'Likely discrete (unconfirmed)'],
    };
    const [cls, txt] = map[verdict] || ['inconclusive', verdict];
    banner.className = `status-banner ${cls}`; banner.textContent = txt; banner.style.display = 'block';
}

function renderResults(res) {
    const root = document.getElementById('results');
    const vClass = res.verdict === 'discrete' ? 'discrete' : res.verdict === 'non-discrete' ? 'nondiscrete' : 'inconclusive';
    const vTitle = res.verdict === 'discrete' ? 'Discrete' : res.verdict === 'non-discrete' ? 'Not discrete' : 'Inconclusive';
    const badge = res.exact ? '<span class="badge exact">exact</span>' : '<span class="badge numeric">numeric</span>';

    let html = `<div class="verdict ${vClass}">
        <div class="tag">verdict ${badge}</div>
        <h2>${vTitle}</h2>
        <p>${res.reason}</p>
        ${res.field && res.field !== 'ℚ' ? `<p style="margin-top:6px;font-size:12px;">exact arithmetic over <b>${res.field}</b></p>` : ''}
    </div>`;

    if (res.witness) {
        const w = res.witness, cls = w.cls;
        let kv = '';
        if (cls) {
            kv += `<div class="kv">type: <b>${kindLabel(cls)}</b></div>`;
            if (cls.tLatex) kv += `<div class="kv">invariant ${tex('t=\\tfrac{\\operatorname{tr}^2}{\\det}=' + cls.tLatex)}</div>`;
            if (cls.kind === 'elliptic' && w.angleDeg != null)
                kv += `<div class="kv">rotation angle: <b>${w.angleDeg.toFixed(4)}°</b> (${w.angleOverPi.toFixed(5)}·π)</div>`;
        }
        if (w.translationLength != null) kv += `<div class="kv">translation length: <b>${w.translationLength.toExponential(3)}</b></div>`;
        if (w.dist != null) kv += `<div class="kv">distance to identity: <b>${w.dist.toExponential(3)}</b></div>`;
        if (w.matLatex) kv += `<div class="kv">${tex(w.matLatex)}</div>`;
        html += `<div class="witness">
            <div class="wlabel">witnessing word</div>
            <div class="word">${w.wordStr || '—'}</div>
            ${kv}
        </div>`;
    }

    // Poincaré certificate: presentation + cone points / cusps
    if (res.cert && res.cert.certified && res.presentation) {
        const p = res.presentation;
        const cones = res.cert.cones || [];
        const rels = p.relations.length ? p.relations.join(', ') : 'no relations (free)';
        html += `<div class="card" style="margin-top:12px;"><div class="card-title">Poincaré certificate</div>
            <div class="kv">presentation: <b class="word" style="font-size:13px;">⟨ ${p.generators.join(', ')} | ${rels} ⟩</b></div>
            <div class="subtle" style="margin-top:6px;">${p.genCount} side-pairing generators · cone points: <code>${cones.length ? cones.join(', ') : 'none'}</code> · cusps: <code>${res.cert.cusps}</code></div></div>`;
    } else if (res.cert && res.cert.reasons && res.cert.reasons.length && res.verdict !== 'non-discrete') {
        html += `<div class="card" style="margin-top:12px;"><div class="card-title">Poincaré certificate</div><div class="subtle">Domain built but not certified: ${res.cert.reasons[0]}</div></div>`;
    }

    // generators
    html += `<div class="card" style="margin-top:12px;"><div class="card-title">Generators</div><div class="gen-list">`;
    res.generators.forEach((g, i) => {
        const color = PALETTE[i % PALETTE.length];
        html += `<div class="gen-item">
            <span class="gen-dot" style="background:${color}"></span>
            <span class="nm">${g.label}</span>
            <span class="ty">${kindLabel(g.cls)}${g.cls.orientationReversing ? ' ↺' : ''}</span>
            <span class="tinv">t=${g.cls.tStr ?? '—'}</span>
        </div>`;
    });
    html += `</div>`;
    if (res.minJorgensen != null)
        html += `<div class="subtle">Jørgensen min over generator pairs: <code>${res.minJorgensen.toFixed(4)}</code>${res.minJorgensen < 1 ? ' (&lt;1 ⇒ supports non-discrete)' : ''}.</div>`;
    if (res.elementCount != null)
        html += `<div class="subtle">Searched <code>${res.elementCount}</code> distinct group elements.</div>`;
    html += `</div>`;

    html += `<div class="subtle">Method: an orientation-preserving element is elliptic of <em>infinite</em> order — impossible in a discrete group — exactly when its rational invariant <code>t=tr²/det ∈ (0,4)</code> is not one of <code>0,1,2,3</code> (Niven). The beam search hunts for such a word; if the orbit closes the group is finite; reducible groups are handled by an exact common-axis / multiplier analysis. Discrete groups are then certified by building a Dirichlet domain and verifying Poincaré's polygon theorem.</div>`;

    root.innerHTML = html;
    typeset(root);
}

function render(res) {
    setMatrixReadouts(res.generators.map(g =>
        `<span class="k">${kindLabel(g.cls)}</span> · t = ${g.cls.tStr ?? '—'}${g.cls.orientationReversing ? ' · orientation-reversing' : ''}`));
    setBanner(res.verdict);
    renderResults(res);
    view.setScene({
        generators: res.generators.map((g, i) => ({ mat: g.mat, label: g.label, color: PALETTE[i % PALETTE.length], cls: g.cls })),
        witness: res.witness || null,
        domain: res.domain || null,
    });
}

function showError(msg) {
    banner.style.display = 'none';
    document.getElementById('results').innerHTML = `<div class="verdict inconclusive"><div class="tag">input error</div><p>${msg}</p></div>`;
}

// ---- worker plumbing (with sync fallback + stale-job cancellation) ----
let worker = null, jobId = 0, pending = false, computingTimer = null;
function makeWorker() {
    try {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = e => onResult(e.data);
        w.onerror = () => { worker = null; pending = false; };   // fall back to sync next run
        return w;
    } catch { return null; }
}
function onResult(data) {
    if (!data || data.id !== jobId) return;                    // ignore stale results
    pending = false; clearTimeout(computingTimer);
    if (!data.ok) { showError(data.error || 'computation failed'); return; }
    render(rehydrate(data.wire));
}

function run() {
    // Number-field path: if entries contain √d or 2cos(π/q), analyze exactly over ℚ(α)
    // (synchronously — these are fast and the worker only speaks ℚ).
    const nf = analyzeLatexRows(getLatexRows());
    if (nf.mode === 'nf') { clearTimeout(computingTimer); render(rehydrate(nf.wire)); return; }
    if (nf.mode === 'error') {
        clearTimeout(computingTimer);
        showError(nf.error === 'multiple'
            ? `Multiple algebraic generators (${nf.detail}) — only single-generator number fields ℚ(α) are supported.`
            : nf.error === 'singular' ? 'A generator is singular (det = 0).' : `Could not parse algebraic entries: ${nf.detail || ''}`);
        return;
    }

    let mats;
    try { mats = getMatricesFromUI(); }
    catch (e) { showError(e.message); return; }
    const entries = mats.map(m => [m.a.toString(), m.b.toString(), m.c.toString(), m.d.toString()]);
    jobId++;

    clearTimeout(computingTimer);
    computingTimer = setTimeout(() => { banner.className = 'status-banner inconclusive'; banner.textContent = 'Analyzing…'; banner.style.display = 'block'; }, 150);

    if (worker === null) worker = makeWorker();
    if (worker) {
        if (pending) { worker.terminate(); worker = makeWorker(); }  // cancel an in-flight heavy job
        pending = true;
        worker.postMessage({ id: jobId, entries, opts: {} });
    } else {
        clearTimeout(computingTimer);
        try { render(rehydrate(toWire(computeAnalysis(mats, {})))); }
        catch (e) { showError(String(e.message || e)); }
    }
}

// ---- view controls ----
document.getElementById('model-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn'); if (!btn) return;
    document.querySelectorAll('#model-toggle .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    view.setModel(btn.dataset.model);
});
const optMap = { 'opt-domain': 'domain', 'opt-iso': 'isoCircles', 'opt-axes': 'axes', 'opt-fp': 'fixedPoints', 'opt-base': 'basepoint', 'opt-tess': 'tessellation' };
Object.entries(optMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) { view.setOpt(key, el.checked); el.addEventListener('change', e => view.setOpt(key, e.target.checked)); }
});
document.getElementById('reset-view').addEventListener('click', () => view.resetView());
document.getElementById('collapse-btn').addEventListener('click', () => {
    const collapsed = document.getElementById('panel').classList.toggle('collapsed');
    document.getElementById('collapse-btn').textContent = collapsed ? '☰' : '✕';
});

setupMatrixInput(run);
setTimeout(run, 120);
