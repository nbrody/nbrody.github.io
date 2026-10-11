/**
 * exactCertificate.js — adds an EXACT discreteness / indiscreteness certificate to the
 * (float-based) /fuchsian/ viewer. It re-reads the MathQuill LaTeX + constants, and when
 * every entry is rational it builds an exact PGL₂(ℚ) group and runs the same engine as the
 * /fuchsianDiscreteness/ tool (Niven elliptic witness for non-discrete; Dirichlet domain +
 * Poincaré certificate for discrete) in a Web Worker. Irrational entries (√, cos, π, φ …)
 * can't be certified exactly, so it says so and leaves the float visualization untouched.
 */
import { parseRational } from './exact/rparse.js';
import { BigRational } from './exact/rational.js';
import { Mat2Q } from './exact/mat2.js';
import { analyzeLatexRows } from './exact/nfgroup.js';

function getLatex(el) {
    try { const a = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null; return a && a.latex ? a.latex() : (el ? el.textContent : '0'); }
    catch { return '0'; }
}

function latexRows() {
    return [...document.querySelectorAll('#matrixInputs .matrix-block')]
        .map(b => [...b.querySelectorAll('.mq-matrix-input')].map(getLatex));
}

function readConstants() {
    const scope = {};
    document.querySelectorAll('#constants-list .constant-row').forEach(row => {
        const name = row.querySelector('.constant-name')?.value.trim();
        const val = row.querySelector('.constant-value')?.value;
        if (!name) return;
        try { scope[name] = parseRational(val, scope); } catch { /* irrational constant: leave undefined */ }
    });
    return scope;
}

// A long decimal (≥5 fractional digits) is almost certainly a floating-point approximation
// of an irrational (e.g. the von Dyck/Hecke examples store toFixed(10) strings), not an
// intended exact value like 0.5 — treat such input as non-ℚ rather than certify a bogus
// rational approximation.
const looksApprox = latex => /\.\d{5,}/.test(String(latex || ''));

function readExactMatrices() {
    const blocks = [...document.querySelectorAll('#matrixInputs .matrix-block')];
    if (!blocks.length) return { ok: false, reason: 'empty' };
    const scope = readConstants();
    const mats = [];
    for (const b of blocks) {
        const latexes = [...b.querySelectorAll('.mq-matrix-input')].map(getLatex);
        if (latexes.some(looksApprox)) return { ok: false, reason: 'approx' };
        let e;
        try { e = latexes.map(l => parseRational(l, scope)); }
        catch (err) { return { ok: false, reason: 'irrational', detail: err.message }; }
        const det = e[0].mul(e[3]).sub(e[1].mul(e[2]));
        if (det.isZero()) return { ok: false, reason: 'singular' };
        mats.push(Mat2Q.fromRationals(e[0], e[1], e[2], e[3]));
    }
    return { ok: true, mats };
}

// ---------- rendering ----------
function kindLabel(c) {
    switch (c.kind) {
        case 'identity': return 'identity';
        case 'elliptic': return c.infiniteOrder ? 'elliptic · infinite order' : `elliptic · order ${c.order}`;
        case 'parabolic': return 'parabolic';
        case 'hyperbolic': return 'hyperbolic';
        case 'reflection': return 'reflection (order 2)';
        case 'glide': return 'glide reflection';
        default: return c.kind;
    }
}
const COLORS = {
    discrete: ['rgba(52,211,153,0.12)', 'rgba(52,211,153,0.45)', '#34d399'],
    nondiscrete: ['rgba(248,113,113,0.12)', 'rgba(248,113,113,0.45)', '#f87171'],
    inconclusive: ['rgba(251,191,36,0.12)', 'rgba(251,191,36,0.45)', '#fbbf24'],
    na: ['rgba(148,163,184,0.10)', 'rgba(148,163,184,0.35)', '#94a3b8'],
};
function box(kind, inner) {
    const [bg, br, fg] = COLORS[kind] || COLORS.na;
    return `<div style="background:${bg};border:1px solid ${br};border-radius:8px;padding:10px 12px;">${inner.replace('__FG__', fg)}</div>`;
}
function setHTML(html) {
    const el = document.getElementById('discreteness-result');
    if (!el) return;
    el.innerHTML = `<h3 class="text-sm font-medium text-gray-300 mb-2">Discreteness (exact, ℚ)</h3>${html}`;
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([el]).catch(() => { });
}

function renderBanner(kind, title, body = '') {
    setHTML(box(kind, `<div style="color:__FG__;font-weight:600;font-size:13px;">${title}</div>${body ? `<div style="color:#cbd5e1;font-size:12px;margin-top:5px;line-height:1.5;">${body}</div>` : ''}`));
}

function renderWire(w) {
    const cls = w.verdict === 'discrete' ? 'discrete' : w.verdict === 'non-discrete' ? 'nondiscrete' : 'inconclusive';
    const title = w.verdict === 'discrete' ? 'Discrete' : w.verdict === 'non-discrete' ? 'Not discrete' : 'Likely discrete (unconfirmed)';
    const badge = w.exact ? 'exact' : 'numeric';
    let body = `<span style="opacity:.85;">[${badge}]</span> ${w.reason || ''}`;
    if (w.field && w.field !== 'ℚ') body += `<div style="margin-top:5px;">exact arithmetic over <b style="color:#e2e8f0;">${w.field}</b></div>`;

    if (w.witness) {
        const wi = w.witness, c = wi.cls;
        body += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">`;
        body += `<div style="font-size:11px;color:#94a3b8;">witnessing word</div>`;
        body += `<div style="font-family:monospace;color:#22d3ee;font-size:15px;margin:2px 0 4px;word-break:break-all;">${wi.wordStr || '—'}</div>`;
        if (c) {
            body += `<div>type: <b style="color:#e2e8f0;">${kindLabel(c)}</b></div>`;
            if (c.tLatex) body += `<div>invariant \\(t=\\tfrac{\\operatorname{tr}^2}{\\det}=${c.tLatex}\\)</div>`;
            if (c.kind === 'elliptic' && wi.angleDeg != null) body += `<div>rotation angle: <b style="color:#e2e8f0;">${wi.angleDeg.toFixed(3)}°</b> = ${wi.angleOverPi.toFixed(5)}·π</div>`;
        }
        if (wi.translationLength != null) body += `<div>translation length: <b style="color:#e2e8f0;">${wi.translationLength.toExponential(3)}</b></div>`;
        if (wi.matLatex) body += `<div style="margin-top:4px;">\\(${wi.matLatex}\\)</div>`;
        body += `</div>`;
    }

    const cert = w.domain && w.domain.cert;
    if (w.verdict === 'discrete' && w.presentation && cert && cert.certified) {
        const p = w.presentation;
        const rels = p.relations.length ? p.relations.join(', ') : 'no relations (free)';
        body += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">`;
        body += `<div style="font-size:11px;color:#94a3b8;">Poincaré certificate · presentation</div>`;
        body += `<div style="font-family:monospace;color:#22d3ee;font-size:13px;margin:3px 0;">⟨ ${p.generators.join(', ')} | ${rels} ⟩</div>`;
        body += `<div style="font-size:11px;color:#94a3b8;">${w.domain.faceCount} sides · cone points: <code>${cert.cones && cert.cones.length ? cert.cones.join(', ') : 'none'}</code> · cusps: <code>${cert.cusps ?? 0}</code></div>`;
        body += `</div>`;
    }

    // per-generator classification
    if (w.generators && w.generators.length) {
        body += `<div style="margin-top:8px;font-size:11px;color:#94a3b8;">`;
        body += w.generators.map(g => `${g.label}: ${kindLabel(g.cls)}${g.cls.tStr ? ` (t=${g.cls.tStr})` : ''}`).join(' · ');
        body += `</div>`;
    }
    renderBanner(cls, title, body);
}

// ---------- worker plumbing (stale-job-safe, with sync fallback) ----------
let worker = null, jobId = 0, pending = false;
function makeWorker() {
    try {
        const w = new Worker(new URL('./exact/worker.js', import.meta.url), { type: 'module' });
        w.onmessage = e => onResult(e.data);
        w.onerror = () => { worker = null; pending = false; };
        return w;
    } catch { return null; }
}
function onResult(data) {
    if (!data || data.id !== jobId) return;
    pending = false;
    if (!data.ok) { renderBanner('na', 'Exact analysis failed', data.error || ''); return; }
    renderWire(data.wire);
}

export function runExactCertificate() {
    if (!document.getElementById('discreteness-result')) return;

    // Number-field path: √d / 2cos(π/q) entries ⇒ analyze exactly over ℚ(α) (synchronous).
    const nf = analyzeLatexRows(latexRows());
    if (nf.mode === 'nf') { renderWire(nf.wire); return; }
    if (nf.mode === 'error') {
        renderBanner('na', 'Exact certificate unavailable',
            nf.error === 'multiple'
                ? `Multiple algebraic generators (${nf.detail}) — only single-generator number fields ℚ(α) are supported. The float visualization still applies.`
                : nf.error === 'singular' ? 'A generator is singular (det = 0).' : `Could not parse algebraic entries: ${nf.detail || ''}`);
        return;
    }

    const r = readExactMatrices();
    if (!r.ok) {
        if (r.reason === 'irrational')
            renderBanner('na', 'Exact certificate unavailable',
                'This group has irrational/symbolic entries (e.g. √, cos, π, φ), so it is not in PGL₂(ℚ) and cannot be certified exactly. The float visualization still applies.');
        else if (r.reason === 'approx')
            renderBanner('na', 'Exact certificate unavailable',
                'Entries look like decimal approximations of irrational values (long decimals). Enter exact integers or fractions (e.g. 1/2, \\frac{a}{b}) for a ℚ certificate.');
        else if (r.reason === 'singular') renderBanner('na', 'A generator is singular (det = 0).');
        else renderBanner('na', 'Add one or more generators to analyze.');
        return;
    }
    const entries = r.mats.map(m => [m.a.toString(), m.b.toString(), m.c.toString(), m.d.toString()]);
    jobId++;
    renderBanner('inconclusive', 'Analyzing…');
    if (worker === null) worker = makeWorker();
    if (worker) {
        if (pending) { worker.terminate(); worker = makeWorker(); }
        pending = true;
        worker.postMessage({ id: jobId, entries, opts: {} });
    } else {
        import('./exact/compute.js').then(({ computeAnalysis, toWire }) => renderWire(toWire(computeAnalysis(r.mats, {}))))
            .catch(e => renderBanner('na', 'Exact analysis failed', String(e.message || e)));
    }
}
