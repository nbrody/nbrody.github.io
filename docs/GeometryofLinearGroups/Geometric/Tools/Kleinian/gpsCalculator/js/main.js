// main.js — the page: input, results, picture, workbench.

import { coxeterSVG, graphSVG } from './diagram.js';
import { SplitRenderer } from './render.js';
import { glueCheck, assemble, fmtArea } from './glue.js';
import { EXAMPLES } from './examples.js';
import { parseForm, parseVector } from './gps.js';
import { bil, kernelOfRow, lll, signature, adjugateB, primitive } from './linalg.js';
import { isRoot } from './vinberg.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------- math formatting ----------------

const tex = (s, display = false) => {
    try { return window.katex.renderToString(s, { throwOnError: false, displayMode: display }); }
    catch { return esc(s); }
};
const sup = k => String(k).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c] || c).join('');
const isDiag = A => A.every((r, i) => r.every((x, j) => i === j || x === 0));
const formTex = A => isDiag(A) ? `\\langle ${A.map((r, i) => r[i]).join(',\\,')} \\rangle` : matTex(A);
const matTex = M => `\\begin{pmatrix}${M.map(r => r.join(' & ')).join(' \\\\ ')}\\end{pmatrix}`;
const vecTex = v => `(${v.join(',\\,')})`;
const fieldTex = d => d === -1 ? '\\mathbb Q(i)' : `\\mathbb Q(\\sqrt{${d}})`;
const texInt = k => String(k).replace(/\B(?=(\d{3})+(?!\d))/g, '{,}');
const numFmt = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d).replace(/\.?0+$/, '') : '∞');
const plural = (k, w, ws = w + 's') => `${k} ${k === 1 ? w : ws}`;
const PIECE_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function invariantsText(info, n) {
    if (!info || info.error) return `<span class="dim">${esc(info?.error || 'unavailable')}</span>`;
    if (info.kind === 'kleinian') {
        const A = info.ramAbove.length ? `ramified exactly at the primes of ${tex('k')} above ${info.ramAbove.join(', ')}` : `${tex('A \\cong M_2(k)')}`;
        return `invariant trace field ${tex('k = ' + fieldTex(info.field))}; invariant quaternion algebra ${A}`;
    }
    if (info.kind === 'fuchsian') {
        const [a, b] = info.algebra;
        const ram = info.ram.length ? `ramified at ${tex('\\{' + info.ram.map(p => (p === Infinity ? '\\infty' : p)).join(', ') + '\\}')}` : `split, ${tex('\\cong M_2(\\mathbb Q)')}`;
        return `quaternion algebra ${tex(`\\left(\\frac{${a},\\,${b}}{\\mathbb Q}\\right)`)}, ${ram}`;
    }
    const h = info.hasse && info.hasse.length ? `Hasse invariant −1 at ${info.hasse.join(', ')}` : 'all Hasse invariants +1';
    return `discriminant ${info.disc} (mod squares), ${h}${n === 1 ? '' : ''}`;
}

// ---------------- theme ----------------

const PALETTE = {
    light: ['#cfe0f1', '#f3d9c4', '#d8ecd6', '#e4dbf3', '#f3e6b6', '#d2ecee', '#f2d3dc', '#e2e2d6'],
    dark: ['#2e4a66', '#5e4331', '#30503a', '#463d62', '#5a5030', '#2b5157', '#5a3542', '#46463b'],
};
const hex = h => { const x = h.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16) / 255); };
function isDark() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function themeColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = name => hex(cs.getPropertyValue(name) || '#000000');
    const dark = isDark();
    return {
        palette: (dark ? PALETTE.dark : PALETTE.light).map(hex),
        bg: v('--card'), rim: v('--line'), edge: dark ? [0.55, 0.6, 0.68] : [0.45, 0.5, 0.58],
        sigma: v('--sigma'), sigma2: v('--sigma2'), lift: dark ? [0.62, 0.72, 0.95] : [0.25, 0.4, 0.7],
    };
}
const pieceColor = i => (isDark() ? PALETTE.dark : PALETTE.light)[i % 8];

// ---------------- state ----------------

const state = {
    worker: null, jobs: new Map(), jobId: 0, view: null, renderer: null,
    bench: { pieces: [], pairs: [] }, selected: null, lastGlue: null,
};

const BENCH_KEY = 'gpsCalc.bench.v1';
function loadBench() {
    try { const s = JSON.parse(localStorage.getItem(BENCH_KEY) || 'null'); if (s && Array.isArray(s.pieces)) state.bench = s; } catch { /* private mode */ }
}
function saveBench() { try { localStorage.setItem(BENCH_KEY, JSON.stringify(state.bench)); } catch { /* private mode */ } }

// ---------------- worker ----------------

function getWorker() {
    if (state.worker) return state.worker;
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = ev => {
        const { id, type } = ev.data;
        const job = state.jobs.get(id);
        if (!job) return;
        if (type === 'progress') { job.onProgress && job.onProgress(ev.data.progress); return; }
        state.jobs.delete(id);
        if (type === 'result') job.resolve(ev.data.view);
        else job.reject(new Error(type === 'fail' ? ev.data.reason : ev.data.message));
    };
    w.onerror = e => { for (const job of state.jobs.values()) job.reject(new Error(e.message || 'worker error')); state.jobs.clear(); state.worker = null; };
    state.worker = w;
    return w;
}

function runJob(input, onProgress) {
    const id = ++state.jobId;
    return new Promise((resolve, reject) => {
        state.jobs.set(id, { resolve, reject, onProgress });
        getWorker().postMessage({ id, input });
    });
}

function readInput() {
    return {
        formText: $('form-in').value, vText: $('v-in').value,
        N: parseInt($('n-in').value, 10), cut: $('cut-in').value, lattice: $('lattice-in').value,
        vinbergMs: 1000 * (parseFloat($('vin-ms').value) || 15), cap: parseInt($('cap-in').value, 10) || 800000,
    };
}

const STAGES = { lattice: 'setting up the lattice', vinberg: "running Vinberg's algorithm", group: 'enumerating Γ/Γ(N)', boundary: 'tracing the hypersurface', homology: 'computing H₁ of the pieces' };
function setStatus(html, bad = false) { const s = $('status'); s.innerHTML = html; s.classList.toggle('bad', bad); }

async function compute(input = readInput(), { quiet = false } = {}) {
    $('compute-btn').disabled = true;
    setStatus(`<span class="progress"></span>starting…`);
    try {
        const view = await runJob(input, p => {
            let msg = STAGES[p.stage] || p.stage;
            if (p.stage === 'group' && p.order) msg += ` — ${p.order.toLocaleString()} elements so far`;
            setStatus(`<span class="progress"></span>${msg}…`);
        });
        setStatus(`done in ${(view.ms / 1000).toFixed(2)} s`);
        if (!quiet) updateURL(input);
        showResults(view);
        return view;
    } catch (e) {
        setStatus(esc(e.message), true);
        throw e;
    } finally {
        $('compute-btn').disabled = false;
    }
}

function updateURL(input) {
    const p = new URLSearchParams({ f: input.formText, v: input.vText, N: input.N });
    if (input.cut === 'fix') p.set('cut', 'fix');
    if (input.lattice !== 'auto') p.set('lattice', input.lattice);
    history.replaceState(null, '', '?' + p.toString());
}

// ---------------- live preview of the input ----------------

function preview() {
    const fi = $('form-in'), vi = $('v-in');
    let A = null;
    try {
        A = parseForm(fi.value);
        const sig = signature(A);
        const n = A.length - 1;
        fi.classList.toggle('invalid', !(sig.neg === 1 && !sig.zero && n >= 2));
        $('form-hint').innerHTML = (sig.neg === 1 && !sig.zero && n >= 2)
            ? `signature ${tex(`(${n},1)`)} — ${tex('\\Gamma')} acts on ${tex(`\\mathbb H^{${n}}`)}`
            : `<span class="no">signature (${sig.pos}, ${sig.neg}${sig.zero ? `, ${sig.zero} null` : ''}) — need (n, 1) with n ≥ 2</span>`;
    } catch (e) {
        fi.classList.add('invalid');
        $('form-hint').innerHTML = `<span class="no">${esc(e.message)}</span>`;
        $('v-hint').textContent = '';
        return;
    }
    try {
        const v0 = parseVector(vi.value, A.length);
        const v = primitive(v0);
        const fv = bil(A, v, v);
        if (fv <= 0) { vi.classList.add('invalid'); $('v-hint').innerHTML = `<span class="no">f(v) = ${fv}: v must be spacelike</span>`; return; }
        vi.classList.remove('invalid');
        const row = A.map(r => r.reduce((s, x, j) => s + x * v[j], 0));
        const Lb = lll(kernelOfRow(row));
        const g = Lb.map(a => Lb.map(b => bil(A, a, b)));
        const root = isRoot(A, v);
        $('v-hint').innerHTML = `${tex(`f(v) = ${fv}`)}; ${tex('H = v^\\perp')} carries a form of determinant ${tex(String(detSmall(g)))}; ` +
            (root ? 'the reflection in v is integral' : `the reflection in v is not integral, so the split lattice ${tex('L_v \\oplus \\mathbb Z v')} is used`);
    } catch (e) {
        vi.classList.add('invalid');
        $('v-hint').innerHTML = `<span class="no">${esc(e.message)}</span>`;
    }
}
function detSmall(M) {
    const n = M.length;
    if (n === 1) return M[0][0];
    let s = 0;
    for (let j = 0; j < n; j++) s += (j % 2 ? -1 : 1) * M[0][j] * detSmall(M.slice(1).map(r => r.filter((_, t) => t !== j)));
    return s;
}

// ---------------- results ----------------

function showResults(view) {
    state.view = view;
    $('results').hidden = false;
    renderSummary(view);
    renderLattice(view);
    renderHyp(view);
    renderCover(view);
    renderSplit(view);
    renderPicture(view);
    typeset(document.getElementById('results'));
}

function typeset(root) {
    root.querySelectorAll('[data-tex]').forEach(el => { el.innerHTML = tex(el.getAttribute('data-tex')); el.removeAttribute('data-tex'); });
}

function splitPhrase(view) {
    const c = view.cover;
    const n = view.lattice.n;
    const S = n === 2 ? 'The geodesic' : 'The hypersurface';
    if (c.comps === 1) {
        const e = c.edges[0];
        if (e.plus === e.minus) return { kind: 'hnn', text: `${S} ${tex('\\Sigma_0')} does not separate ${tex("M'")}, so ${tex("\\pi_1 M' = \\pi_1 A \\ast_{\\pi_1 \\Sigma_0}")} is an HNN extension with one arithmetic piece ${tex('A')}.` };
        return { kind: 'amalgam', text: `${S} ${tex('\\Sigma_0')} separates ${tex("M'")}, so ${tex("\\pi_1 M' = \\pi_1 A \\ast_{\\pi_1 \\Sigma_0} \\pi_1 B")} is an amalgam of two arithmetic pieces.` };
    }
    return { kind: 'graph', text: `The fixed set of the involution induced by ${tex('r_v')} has ${c.comps} components ${tex('\\Sigma_0, \\dots, \\Sigma_{' + (c.comps - 1) + '}')}. Cutting along all of them gives a graph of groups with ${plural(c.nPieces, 'vertex', 'vertices')} and ${plural(c.comps, 'edge')}.` };
}

function pieceVolumeText(view, p) {
    const n = view.lattice.n, P = view.poly;
    const vol = p.tiles * P.volume;
    if (n === 2) return `area ${fmtArea(vol)}, ${tex(`\\chi = ${Math.round(-vol / (2 * Math.PI))}`)}`;
    if (n === 3) return `volume ${numFmt(vol, 4)}`;
    if (Number.isFinite(vol)) return `volume ${numFmt(vol, 4)}`;
    return '';
}

function renderSummary(view) {
    const c = view.cover, L = view.lattice, n = L.n;
    const ph = splitPhrase(view);
    const el = $('summary');
    const chips = c.pieces.map((p, i) => `<span class="piece-chip"><span class="swatch" style="background:${pieceColor(i)}"></span>` +
        `<b>${PIECE_NAMES[i]}</b> · ${plural(p.tiles, 'tile')} · ${pieceVolumeText(view, p)}` +
        `<button class="btn small" data-save="${i}">save</button></span>`).join('');
    el.innerHTML = `<div class="v-head">${tex('\\Sigma_0')} embeds in ${tex(`M' = \\mathbb H^{${n}}/\\Gamma(${c.N})`)}, a cover of degree ${c.order.toLocaleString()} of ${tex(`\\Gamma\\backslash\\mathbb H^{${n}}`)}.</div>` +
        `<p class="v-sub">${ph.text}</p>` +
        `<div class="chips">${chips}${c.pieces.length > 1 ? '<button class="btn small" data-save="all">save all</button>' : ''}</div>`;
    el.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => {
        const which = b.getAttribute('data-save');
        const recs = which === 'all' ? view.records : [view.records[+which]];
        for (const r of recs) addToBench(r);
        b.textContent = 'saved ✓';
    }));
}

function renderLattice(view) {
    const L = view.lattice, P = view.poly, n = L.n;
    const body = $('card-lattice').querySelector('.body');
    const nIdeal = P.vertices.filter(v => v.ideal).length;
    const covol = P.volume / view.sym;
    const latticeDesc = L.mode === 'given'
        ? `${tex(`\\Gamma = \\mathrm O'(f, \\mathbb Z^{${n + 1}})`)}, ${tex('f = ' + formTex(L.A))}`
        : `${tex(`\\Gamma = \\mathrm O'(\\Lambda_v)`)} for the split lattice ${tex('\\Lambda_v = L_v \\oplus \\mathbb Z v')} of index ${L.D} in ${tex(`\\mathbb Z^{${n + 1}}`)}, with Gram matrix ${tex(formTex(L.AL))}; it is commensurable with ${tex(`\\mathrm O'(f, \\mathbb Z^{${n + 1}})`)}`;
    const volLabel = n === 2 ? 'Coarea' : 'Covolume';
    const volText = Number.isFinite(P.volume)
        ? `${tex(`\\mathrm{vol}(\\Gamma\\backslash\\mathbb H^{${n}}) = \\mathrm{vol}(P)/|\\mathrm{Sym}\\,P|`)} = ${n === 2 ? fmtArea(covol) : numFmt(covol, 8)}`
        : `<span class="dim">not computed in dimension ${n}</span>`;
    const roots = P.roots.map((e, i) => `<tr><td>${i + 1}${i === view.i0 ? ' <span class="tag">H</span>' : view.mirrorClass.includes(i) ? ' <span class="dim">·</span>' : ''}</td><td class="mono">(${e.join(', ')})</td><td>${P.norms[i]}</td></tr>`).join('');
    body.innerHTML = `<div class="diagram">${coxeterSVG(P, { highlight: view.i0, cls: view.mirrorClass, width: 460 })}</div>` +
        `<dl class="facts">` +
        `<dt>Lattice</dt><dd>${latticeDesc}</dd>` +
        `<dt>Reflection chamber</dt><dd>Vinberg's algorithm closes after ${plural(P.k, 'wall')}: ${tex('P')} has ${plural(P.vertices.length, 'vertex', 'vertices')}${nIdeal ? `, ${nIdeal} of them ideal` : ', all finite'}. ${tex("\\Gamma = W \\rtimes \\mathrm{Sym}\\,P")} with ${tex(`|\\mathrm{Sym}\\,P| = ${view.sym}`)}.</dd>` +
        `<dt>${volLabel}</dt><dd>${volText}</dd>` +
        `<dt>Type</dt><dd>${P.vertices.some(v => v.ideal) ? 'non-cocompact — the form is isotropic over ℚ' : 'cocompact — the form is anisotropic over ℚ'}</dd>` +
        `<dt>Commensurability</dt><dd>${invariantsText(view.formInfo, n)}</dd>` +
        `</dl>` +
        `<details><summary>walls of ${tex('P')} (lattice coordinates)</summary><div class="scroll-x"><table class="t"><tr><th>wall</th><th>root e</th><th>f(e)</th></tr>${roots}</table></div></details>`;
}

function renderHyp(view) {
    const L = view.lattice, n = L.n;
    const body = $('card-hyp').querySelector('.body');
    const g = L.gH;
    const hInfo = view.hypInfo;
    const what = n === 2 ? 'geodesic' : n === 3 ? 'totally geodesic surface' : 'totally geodesic hypersurface';
    let stab;
    if (n === 2) {
        const closed = hInfo && !hInfo.error && !hInfo.cusped;
        stab = closed ? `${tex('g')} is anisotropic over ℚ, so the image of ${tex('H')} is a closed geodesic` : `${tex('g')} is isotropic over ℚ, so ${tex('H')} runs from cusp to cusp`;
    } else {
        stab = `${tex('\\mathrm{Stab}_\\Gamma(H)')} is an arithmetic lattice in ${tex(`\\mathrm{Isom}\\,\\mathbb H^{${n - 1}}`)}, commensurable with ${tex("\\mathrm O'(g, L_v)")}: ${invariantsText(hInfo, n - 1)}; ${hInfo && !hInfo.error ? (hInfo.cusped ? 'non-cocompact' : 'cocompact') : ''}`;
    }
    body.innerHTML = `<dl class="facts">` +
        `<dt>Hypersurface</dt><dd>${tex('H = v^\\perp')}, ${tex('v = ' + vecTex(L.v))}, ${tex(`f(v) = ${L.fv}`)} — a ${what}</dd>` +
        `<dt>Restricted form</dt><dd>${tex('g = f|_{L_v} = ' + matTex(g))} on ${tex(`L_v = v^\\perp \\cap \\mathbb Z^{${n + 1}}`)} with basis ${L.Lb.map(b => tex(vecTex(b))).join(', ')}</dd>` +
        `<dt>Stabilizer</dt><dd>${stab}</dd>` +
        `<dt>Reflection</dt><dd>${L.rootGiven ? `${tex('r_v(x) = x - \\tfrac{2B(x,v)}{f(v)}\\,v')} is integral: ${tex('v')} is a root, ${tex('r_v \\in \\Gamma')}` : `${tex('r_v')} is not integral on ${tex(`\\mathbb Z^{${n + 1}}`)}; it is on ${tex('\\Lambda_v')}, where ${tex('v')} is a coordinate root`}</dd>` +
        `<dt>In the orbifold</dt><dd>${tex('H')} is the mirror of wall ${view.i0 + 1} of ${tex('P')}. The immersed ${n === 2 ? 'geodesic' : 'hypersurface'} in ${tex(`\\Gamma\\backslash\\mathbb H^{${n}}`)} is made of the face${view.mirrorClass.length > 1 ? 's' : ''} ${view.mirrorClass.map(i => i + 1).join(', ')} of ${tex('P')} — the walls whose reflections are conjugate to ${tex('r_v')} in ${tex('\\Gamma')}.</dd>` +
        `</dl>`;
}

function exponentOf(M) {
    const MB = M.map(r => r.map(BigInt));
    const { adj, det } = adjugateB(MB);
    const ab = x => (x < 0n ? -x : x);
    const gcd = (a, b) => { a = ab(a); b = ab(b); while (b) [a, b] = [b, a % b]; return a; };
    let e = 1n;
    for (const r of adj) for (const x of r) { const t = ab(det) / gcd(det, x); e = e / gcd(e, t) * t; }
    return Number(e);
}

function renderCover(view) {
    const c = view.cover, L = view.lattice, n = L.n, P = view.poly;
    const body = $('card-cover').querySelector('.body');
    const vol = c.tiles * P.volume;
    const cert = c.certificates;
    let coversText = '';
    if (L.mode === 'split') {
        const e = exponentOf(L.M);
        coversText = `<dt>Over the given lattice</dt><dd>${c.N % e === 0
            ? `${tex(`${e} \\mid N`)}, so ${tex('\\Gamma(N) \\subset \\mathrm O\'(f, \\mathbb Z^{' + (n + 1) + '})')} and ${tex("M'")} also covers ${tex(`\\mathrm O'(f,\\mathbb Z^{${n + 1}})\\backslash\\mathbb H^{${n}}`)}`
            : `${tex("M'")} covers ${tex(`\\Lambda_v`)}'s orbifold, which is commensurable with the given one; a level divisible by ${e} gives a cover of the given orbifold itself`}</dd>`;
    }
    const cuspText = c.cusps ? plural(c.cusps.count, 'cusp') : 'closed';
    body.innerHTML = `<dl class="facts">` +
        `<dt>Subgroup</dt><dd>${tex(`K = \\Gamma(${c.N}) = \\ker\\big(\\Gamma \\to \\mathrm{GL}(\\Lambda/${c.N}\\Lambda)\\big)`)}, normal of index ${tex(`|\\Gamma/\\Gamma(${c.N})| = ${texInt(c.order)}`)}</dd>` +
        `<dt>Cover</dt><dd>${tex(`M' = \\mathbb H^{${n}}/K`)} is tiled by ${c.tiles.toLocaleString()} copies of ${tex('P')}; ${n === 2 ? `area ${fmtArea(vol)}, ${tex(`\\chi(M') = ${Math.round(-vol / (2 * Math.PI))}`)}` : Number.isFinite(vol) ? `volume ${numFmt(vol, 4)}` : ''}; ${cuspText}</dd>` +
        coversText +
        `</dl>` +
        `<ul class="cert">` +
        `<li class="${cert.torsionFree && cert.verticesInject ? '' : 'fail'}">${tex('K')} is torsion-free: ${tex('N \\ge 3')} (Minkowski). Checked: every finite vertex group of ${tex('P')} and every symmetry of ${tex('P')} survives mod ${c.N}.</li>` +
        `<li class="${cert.embedded ? '' : 'fail'}">${tex('H')} embeds: ${tex('r_v \\in \\Gamma')} normalizes ${tex('K')}, so an intersection point of ${tex('H')} with ${tex('kH')} would be fixed by ${tex('r_v k r_v k^{-1} \\in K')} (Millson). Checked: around every ridge of ${tex("M'")} at most one sheet passes (max ${cert.maxSheets} half-sheets).</li>` +
        `<li class="${cert.twoSided ? '' : 'fail'}">${tex('\\Sigma_0')} is two-sided: an element ${tex('\\equiv I \\bmod N')} cannot send ${tex('v')} to ${tex('-v')}. Checked: tracing ${tex('\\Sigma_0')} never reaches its own other side.</li>` +
        `</ul>`;
}

function surfaceText(sf, n) {
    if (!sf) return '';
    if (n === 2) return sf.closed ? `closed geodesic of length ${numFmt(sf.length, 6)}` : 'bi-infinite geodesic, cusp to cusp';
    if (n === 3) {
        const g = sf.genus !== null && sf.genus !== undefined ? `genus ${sf.genus}` : '';
        const p = sf.punctures ? `, ${plural(sf.punctures, 'puncture')}` : ', closed';
        return `${g}${p}, area ${fmtArea(sf.area)} (${tex(`\\chi = ${sf.chiExact ?? numFmt(sf.chi, 4)}`)})`;
    }
    return `${plural(sf.faces, 'face')} of ${tex('P')}`;
}

function homologyText(h) {
    if (!h) return '<span class="dim">—</span>';
    let t = h.b1 ? `\\mathbb Z^{${h.b1}}` : '0';
    for (const [p, r] of h.torsion || []) t += ` \\oplus T_{${p}}`;
    const tor = (h.torsion || []).map(([p, r]) => `${p}-rank ${r}`).join(', ');
    return tex(t) + (tor ? ` <span class="dim">(${tor})</span>` : '');
}

function renderSplit(view) {
    const c = view.cover, L = view.lattice, n = L.n, P = view.poly;
    const body = $('card-split').querySelector('.body');
    const sigmaName = i => `Σ${String(i).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('')}`;
    const gv = c.pieces.map((p, i) => ({ label: PIECE_NAMES[i], color: pieceColor(i), sub: `${p.tiles} tiles` }));
    const ge = c.edges.map((e, i) => ({ plus: e.plus, minus: e.minus, label: sigmaName(i) }));
    const rows = c.pieces.map((p, i) => {
        const bd = p.boundary.map(b => `${sigmaName(b.comp)}${b.side === '+' ? '⁺' : '⁻'}`).join(', ');
        let cusp = '—';
        if (p.cuspSections) {
            const tori = p.cuspSections - p.cutSections;
            cusp = n === 3 ? `${tori ? plural(tori, 'torus', 'tori') : ''}${tori && p.cutSections ? ', ' : ''}${p.cutSections ? plural(p.cutSections, 'annulus', 'annuli') : ''}`
                : n === 2 ? `${tori ? plural(tori, 'cusp') : ''}${tori && p.cutSections ? ', ' : ''}${p.cutSections ? plural(p.cutSections, 'spike') : ''}` : String(p.cuspSections);
        }
        return `<tr><td><span class="swatch" style="background:${pieceColor(i)}"></span> <b>${PIECE_NAMES[i]}</b></td><td>${p.tiles.toLocaleString()}</td><td>${pieceVolumeText(view, p)}</td><td>${bd}</td><td>${cusp}</td><td>${homologyText(p.homology)}</td></tr>`;
    }).join('');
    const surf = c.edges.map((e, i) => `<tr><td>${sigmaName(i)}</td><td>${surfaceText(c.surfaces[i], n)}</td><td>${PIECE_NAMES[e.plus]} | ${PIECE_NAMES[e.minus]}</td></tr>`).join('');
    const b0 = view.boundary.find(b => b.wall === c.edges[0].wall);
    const gensHtml = b0 ? b0.gens.slice(0, 24).map(M => tex(matTex(M))).join('') : '';
    const groupName = n === 2 ? 'cyclic' : n === 3 ? 'Fuchsian' : 'discrete';
    const ph = splitPhrase(view);
    body.innerHTML = `<div class="diagram">${graphSVG(gv, ge, { width: 460, height: c.pieces.length > 2 ? 230 : 170 })}</div>` +
        `<p>${ph.text}</p>` +
        `<div class="scroll-x"><table class="t"><tr><th>piece</th><th>tiles</th><th>${n === 2 ? 'area' : 'volume'}</th><th>boundary</th><th>${n === 2 ? 'ends' : 'cusp sections'}</th><th>${tex('H_1')}</th></tr>${rows}</table></div>` +
        `<p class="hint">${tex('H_1')} is computed from the dual cell complex of the tiling: the rank over ${tex('\\mathbb Q')} and the extra rank over ${tex('\\mathbb F_2, \\mathbb F_3')} (the 2- and 3-torsion).</p>` +
        `<h3>Edge ${c.edges.length > 1 ? 'groups' : 'group'}</h3>` +
        `<div class="scroll-x"><table class="t"><tr><th></th><th>${n === 2 ? 'geodesic' : 'surface'}</th><th>sides</th></tr>${surf}</table></div>` +
        (b0 ? `<p style="margin-top:10px">${tex('\\pi_1\\Sigma_0 = \\mathrm{Stab}_K(H)|_H')} is the ${groupName} group ${tex(`\\{\\delta \\in \\mathrm O'(g, L_v) : \\hat\\delta \\in \\Gamma(${c.N})\\}`)}, generated by ${plural(b0.gens.length, 'matrix', 'matrices')} on ${tex('L_v')} read off from the tiling of ${tex('\\Sigma_0')}.</p>` +
            `<details><summary>generators of ${tex('\\pi_1\\Sigma_0')} in the basis of ${tex('L_v')}${b0.gens.length > 24 ? ' (first 24)' : ''}</summary><div class="gens">${gensHtml || '<span class="dim">trivial group</span>'}</div></details>` : '');
}

// ---------------- picture ----------------

function renderPicture(view) {
    const card = $('card-picture');
    const n = view.lattice.n;
    if (n > 3) { card.hidden = true; return; }
    card.hidden = false;
    if (!state.renderer) {
        state.renderer = new SplitRenderer($('canvas'));
        if (state.renderer.failed) { $('pic-caption').innerHTML = `<span class="err">${esc(state.renderer.failed)}</span>`; return; }
    }
    const R = state.renderer;
    R.theme = themeColors();
    R.setData(view.render);
    const tools = $('pic-tools');
    const modes = n === 3 ? [['sphere', 'Sphere'], ['plane', 'Cross-section']] : [];
    tools.innerHTML = (modes.length ? `<span class="seg">${modes.map(([m, t]) => `<button data-mode="${m}" class="${R.mode === m ? 'on' : ''}">${t}</button>`).join('')}</span>` : '') +
        (n === 3 ? `<label class="rho" id="rho-wrap"${R.mode === 'sphere' ? '' : ' hidden'}>radius ${tex('\\rho')} <input id="rho-in" type="range" min="0.5" max="6" step="0.05" value="${R.rho}"><span id="rho-val">${R.rho.toFixed(2)}</span></label>` : '') +
        `<button class="btn small" id="reset-view">reset view</button>`;
    tools.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
        R.setMode(b.getAttribute('data-mode'));
        tools.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
        const rw = $('rho-wrap'); if (rw) rw.hidden = R.mode !== 'sphere';
        caption(view);
    }));
    const rin = $('rho-in');
    if (rin) rin.addEventListener('input', () => { R.rho = parseFloat(rin.value); $('rho-val').textContent = R.rho.toFixed(2); R.draw(); });
    $('reset-view').addEventListener('click', () => R.reset());
    $('pic-tag').textContent = n === 2 ? 'Poincaré disk' : 'ℍ³';
    caption(view);
    const c = view.cover;
    const multi = c.comps > 1;
    $('legend').innerHTML = c.pieces.map((p, i) => `<span><span class="swatch" style="background:${pieceColor(i)}"></span>${PIECE_NAMES[i]}</span>`).join('') +
        `<span><span class="ln"></span>lifts of ${tex('\\Sigma_0')}</span>` +
        (multi ? `<span><span class="ln mid"></span>lifts of the other ${tex('\\Sigma_i')}</span>` : '') +
        `<span><span class="ln thin" style="border-color:${isDark() ? '#9fb7f2' : '#4066b3'}"></span>other lifts of ${tex('H')}</span>`;
}

function caption(view) {
    const n = view.lattice.n, mode = state.renderer?.mode;
    const lifts = `Heavy lines are the lifts of ${tex('\\Sigma_0')} (the ${tex('K')}-orbit of ${tex('H')}), blue lines the other lifts of the immersed hypersurface.`;
    let t;
    if (n === 2) t = `The Poincaré disk tiled by copies of ${tex('P')}; each tile is coloured by the piece of ${tex("M'")} it covers. ${lifts} Drag to move; double-click to reset.`;
    else if (mode === 'sphere') t = `The sphere of radius ${tex('\\rho')} about a point of ${tex('P')}, seen as a globe. Each point is coloured by the piece of ${tex("M'")} it covers, and shaded by its distance in the Bass–Serre tree from ${tex('P')}; the red curves, where that distance jumps, are the lifts of ${tex('\\Sigma_0')}. As ${tex('\\rho \\to \\infty')} they become the circles at infinity. Drag to rotate, scroll to zoom.`;
    else t = `A totally geodesic cross-section of ${tex('\\mathbb H^3')} through ${tex('P')}, coloured by piece. ${lifts} Drag to move within the plane; shift-drag to tilt it.`;
    $('pic-caption').innerHTML = t;
}

// ---------------- workbench ----------------

function addToBench(rec) {
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.bench.pieces.push({ ...rec, id });
    saveBench();
    renderBench();
    return id;
}

function boundaryLabel(pc, b) {
    const bd = pc.boundary[b];
    const sf = pc.surfaces[bd.wall]?.surface;
    const nm = `Σ${String(bd.comp).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[d]).join('')}${bd.side === '+' ? '⁺' : '⁻'}`;
    if (!sf) return nm;
    if (pc.n === 2) return `${nm} · ${sf.closed ? `ℓ = ${numFmt(sf.length, 4)}` : 'line'}`;
    if (pc.n === 3) return `${nm} · g ${sf.genus}${sf.punctures ? `, ${sf.punctures} punct.` : ''}`;
    return nm;
}

function pairOf(id, b) {
    return state.bench.pairs.findIndex(p => (p.a.id === id && p.a.b === b) || (p.b.id === id && p.b.b === b));
}

function renderBench() {
    const { pieces, pairs } = state.bench;
    $('bench-tag').textContent = pieces.length ? plural(pieces.length, 'piece') : '';
    $('bench-hint').hidden = pieces.length > 0 && pairs.length > 0;
    const list = $('bench-list');
    if (!pieces.length) { list.innerHTML = ''; $('assembly').innerHTML = ''; return; }
    const idx = new Map(pieces.map((p, i) => [p.id, i]));
    list.innerHTML = pieces.map((pc, i) => {
        const meta = [`n = ${pc.n}`, plural(pc.tiles, 'tile'), pc.b1 != null ? `b₁ = ${pc.b1}` : null,
            pc.n === 2 ? `area ${fmtArea(pc.volume)}` : Number.isFinite(pc.volume) ? `vol ${numFmt(pc.volume, 3)}` : null,
            pc.cuspSections ? `${pc.cuspSections - pc.cutSections} cusp${pc.cuspSections - pc.cutSections === 1 ? '' : 's'}` : (pc.n >= 3 ? 'no cusps' : null),
        ].filter(Boolean).join(' · ');
        const chips = pc.boundary.map((bd, b) => {
            const k = pairOf(pc.id, b);
            const sel = state.selected && state.selected.id === pc.id && state.selected.b === b;
            let partner = '';
            if (k >= 0) {
                const pr = pairs[k];
                const other = pr.a.id === pc.id && pr.a.b === b ? pr.b : pr.a;
                const op = state.bench.pieces[idx.get(other.id)];
                partner = ` ↔ ${PIECE_NAMES[idx.get(other.id)] ?? '?'} ${op ? boundaryLabel(op, other.b).split(' · ')[0] : ''}`;
            }
            return `<button class="bchip${sel ? ' sel' : ''}${k >= 0 ? ' glued' : ''}" data-id="${pc.id}" data-b="${b}" title="${k >= 0 ? 'click to unglue' : 'click, then click a boundary component of another piece'}">${esc(boundaryLabel(pc, b))}${partner}</button>`;
        }).join('');
        return `<div class="bench-piece"><span class="swatch" style="background:${pieceColor(i)}"></span>` +
            `<div><div class="bp-title"><b>${PIECE_NAMES[i] ?? '#' + (i + 1)}</b> · ${esc(pc.label || '')}</div><div class="bp-meta">${meta}</div><div class="bp-bounds">${chips}</div></div>` +
            `<button class="del" data-del="${pc.id}" title="remove this piece" aria-label="remove">×</button></div>`;
    }).join('') + `<div class="bench-actions"><button class="btn small" id="unglue-all">clear gluings</button><button class="btn small" id="clear-bench">clear workbench</button></div>`;
    list.querySelectorAll('.bchip').forEach(b => b.addEventListener('click', () => chipClick(b.getAttribute('data-id'), +b.getAttribute('data-b'))));
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-del');
        state.bench.pieces = state.bench.pieces.filter(p => p.id !== id);
        state.bench.pairs = state.bench.pairs.filter(p => p.a.id !== id && p.b.id !== id);
        if (state.selected?.id === id) state.selected = null;
        saveBench(); renderBench();
    }));
    $('unglue-all').addEventListener('click', () => { state.bench.pairs = []; saveBench(); renderBench(); $('glue-msg').innerHTML = ''; });
    $('clear-bench').addEventListener('click', () => { state.bench = { pieces: [], pairs: [] }; state.selected = null; saveBench(); renderBench(); $('glue-msg').innerHTML = ''; });
    renderAssembly();
}

function chipClick(id, b) {
    const k = pairOf(id, b);
    if (k >= 0) { state.bench.pairs.splice(k, 1); saveBench(); renderBench(); return; }
    if (!state.selected) { state.selected = { id, b }; renderBench(); return; }
    const s = state.selected;
    state.selected = null;
    if (s.id === id && s.b === b) { renderBench(); return; }
    const pa = state.bench.pieces.find(p => p.id === s.id), pb = state.bench.pieces.find(p => p.id === id);
    const sa = pa.surfaces[pa.boundary[s.b].wall], sb = pb.surfaces[pb.boundary[b].wall];
    let v;
    try { v = glueCheck(sa, sb); } catch (e) { v = { status: 'open', reason: e.message }; }
    const idx = new Map(state.bench.pieces.map((p, i) => [p.id, i]));
    const nm = (pc, bb) => `${PIECE_NAMES[idx.get(pc.id)]} ${boundaryLabel(pc, bb).split(' · ')[0]}`;
    const head = { yes: 'They glue.', no: 'They do not glue.', open: 'Undecided.' }[v.status];
    const phi = v.phi ? ` The gluing map is ${tex('\\Phi = ' + matTex(v.phi))} on the hyperplane lattices.` : '';
    $('glue-msg').innerHTML = `<div class="verdict ${v.status}"><div class="vh">${nm(pa, s.b)} and ${nm(pb, b)}: ${head}</div><div>${esc(v.reason).replace(/Φ/g, 'Φ')}.${phi}</div></div>`;
    if (v.status === 'yes') {
        state.bench.pairs.push({ a: { id: s.id, b: s.b }, b: { id, b }, phi: v.phi || null });
        saveBench();
    }
    renderBench();
}

function renderAssembly() {
    const { pieces, pairs } = state.bench;
    const el = $('assembly');
    if (!pairs.length) { el.innerHTML = ''; return; }
    const involved = new Set(pairs.flatMap(p => [p.a.id, p.b.id]));
    const use = pieces.filter(p => involved.has(p.id));
    const pos = new Map(use.map((p, i) => [p.id, i]));
    const asm = assemble(use, pairs.map(p => ({ a: { piece: pos.get(p.a.id), b: p.a.b }, b: { piece: pos.get(p.b.id), b: p.b.b } })));
    const idx = new Map(pieces.map((p, i) => [p.id, i]));
    const names = use.map(p => PIECE_NAMES[idx.get(p.id)]).join(' ∪ ');
    const n = use[0].n;
    let head;
    if (asm.closedUp && asm.connected) {
        const cusped = use.some(p => p.cuspSections > 0);
        const size = n === 2 ? `area ${fmtArea(asm.volume)}, ${tex(`\\chi = ${Math.round(-asm.volume / (2 * Math.PI))}`)}` : Number.isFinite(asm.volume) ? `volume ${numFmt(asm.volume, 4)}` : '';
        const kind = n === 2 ? 'surface' : `${n}-manifold`;
        head = `${tex('M = ' + names.replace(/∪/g, '\\cup'))} is a ${cusped ? 'finite-volume, cusped' : 'closed'} hyperbolic ${kind}${size ? ` of ${size}` : ''}.`;
    } else {
        head = `${plural(pairs.length, 'gluing')} so far; ${plural(asm.open.length, 'boundary component')} still free${asm.connected ? '' : ', and the glued pieces are not yet connected'}.`;
    }
    const cls = asm.classes.map((c, i) => `${tex('[f_{' + (i + 1) + '}]')}: ${invariantsText(c.info, n)}`).join('<br>');
    el.innerHTML = `<div class="assembly"><div class="ah">${head}</div>` +
        (asm.closedUp && asm.connected ? `<p class="${asm.verdict.status === 'nonarithmetic' ? 'ah nonarith' : ''}" style="margin-top:6px">${esc(asm.verdict.text)}</p>` : '') +
        `<details${asm.classes.length > 1 ? ' open' : ''}><summary>commensurability classes of the ambient lattices (${asm.classes.length})</summary><p style="margin-top:6px">${cls}</p></details></div>`;
}

// ---------------- examples ----------------

function buildExamples() {
    const pop = $('ex-pop');
    let html = '', cat = null;
    EXAMPLES.forEach((ex, i) => {
        if (ex.cat !== cat) { cat = ex.cat; html += `<div class="ex-cat">${esc(cat)}</div>`; }
        html += `<button data-ex="${i}">${esc(ex.name)}</button>`;
    });
    pop.innerHTML = html;
    const btn = $('examples-btn');
    btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); });
    document.addEventListener('click', e => { if (!pop.contains(e.target)) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
    pop.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => {
        pop.hidden = true;
        loadExample(EXAMPLES[+b.getAttribute('data-ex')]);
    }));
}

function setInputs(ex) {
    $('form-in').value = ex.f; $('v-in').value = ex.v; $('n-in').value = ex.N; $('cut-in').value = ex.cut || 'one';
    $('lattice-in').value = ex.lattice || 'auto';
    preview();
}

async function loadExample(ex) {
    if (!ex.hybrid) { setInputs(ex); compute().catch(() => {}); return; }
    // a GPS hybrid: compute both, save the pieces, glue them
    const recs = [];
    try {
        for (const part of ex.hybrid) {
            setInputs(part);
            const view = await compute(readInput(), { quiet: true });
            recs.push(view.records);
        }
    } catch { return; }
    const [r1, r2] = recs;
    let A = [r1[0]], B = [r2[0]];
    const b1 = r1[0].boundary.length, b2 = r2[0].boundary.length;
    if (b1 === 1 && b2 === 2 && r1.length >= 2) A = [r1[0], r1[1]];
    if (b1 === 2 && b2 === 1 && r2.length >= 2) B = [r2[0], r2[1]];
    if (b1 === 1 && b2 === 1 && r1.length >= 2 && r2.length >= 2) { /* one piece from each side suffices */ }
    const idsA = A.map(addToBench), idsB = B.map(addToBench);
    const slotsA = A.flatMap((p, i) => p.boundary.map((bd, b) => ({ id: idsA[i], p, b, side: bd.side })));
    const slotsB = B.flatMap((p, i) => p.boundary.map((bd, b) => ({ id: idsB[i], p, b, side: bd.side })));
    const usedB = new Set();
    let glued = 0;
    for (const a of slotsA) {
        const order = slotsB.filter(x => !usedB.has(x)).sort((x, y) => (x.side === a.side) - (y.side === a.side));
        for (const bb of order) {
            const v = glueCheck(a.p.surfaces[a.p.boundary[a.b].wall], bb.p.surfaces[bb.p.boundary[bb.b].wall]);
            if (v.status === 'yes') { state.bench.pairs.push({ a: { id: a.id, b: a.b }, b: { id: bb.id, b: bb.b }, phi: v.phi || null }); usedB.add(bb); glued++; break; }
        }
    }
    saveBench();
    renderBench();
    const all = glued === slotsA.length && glued === slotsB.length;
    $('glue-msg').innerHTML = `<div class="verdict ${all ? 'yes' : 'open'}"><div class="vh">${esc(ex.name)}</div><div>Both lattices were computed and ${plural(A.length + B.length, 'piece')} saved. ${plural(glued, 'gluing')} certified by checking that the boundary groups are conjugate${all ? '; no boundary is left free' : `; ${slotsA.length + slotsB.length - 2 * glued} boundary components are still free`}.</div></div>`;
    $('card-bench').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- boot ----------------

function boot() {
    typeset(document.body);
    buildExamples();
    loadBench();
    renderBench();
    $('form-in').addEventListener('input', preview);
    $('v-in').addEventListener('input', preview);
    for (const id of ['form-in', 'v-in', 'n-in']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') compute().catch(() => {}); });
    $('compute-btn').addEventListener('click', () => compute().catch(() => {}));
    $('settings-btn').addEventListener('click', () => {
        const s = $('settings'); s.hidden = !s.hidden; $('settings-btn').setAttribute('aria-expanded', String(!s.hidden));
    });
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq) mq.addEventListener('change', () => {
        if (state.renderer) { state.renderer.setTheme(themeColors()); }
        if (state.view) { renderSummary(state.view); renderSplit(state.view); renderPicture(state.view); typeset($('results')); }
        renderBench();
    });
    const q = new URLSearchParams(location.search);
    if (q.has('f')) {
        $('form-in').value = q.get('f');
        if (q.has('v')) $('v-in').value = q.get('v');
        if (q.has('N')) $('n-in').value = q.get('N');
        if (q.has('cut')) $('cut-in').value = q.get('cut');
        if (q.has('lattice')) $('lattice-in').value = q.get('lattice');
        preview();
        compute().catch(() => {});
    } else preview();
    window.__gps = { state, compute, loadExample };
}

boot();
