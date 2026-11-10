// app.js — UI wiring for the GPS interbreeding constructor.

import { vinbergChamber } from './vinberg.js';
import { pieceInvariants, ramString, sameSet } from './arith.js';
import { triangleChamber, isArithmeticTriangle, triangleName } from './triangle.js';
import { tileHalfPlane } from './tiling.js';
import { Renderer } from './render.js';

const $ = id => document.getElementById(id);

// ─── Presets ───────────────────────────────────────────────────────────────
const QF_PRESETS = [
    { name: 'GPS classic — ⟨1,1,−2⟩ ⋈ ⟨1,3,−2⟩', s1: 1, s3: 2, a: 1, b: 3 },
    { name: 'Compact ⋈ compact — ⟨1,1,−3⟩ ⋈ ⟨1,5,−3⟩', s1: 1, s3: 3, a: 1, b: 5 },
    { name: 'Compact ⋈ compact — ⟨1,3,−2⟩ ⋈ ⟨1,5,−2⟩', s1: 1, s3: 2, a: 3, b: 5 },
    { name: 'Commensurable pieces — ⟨1,1,−1⟩ ⋈ ⟨1,5,−1⟩', s1: 1, s3: 1, a: 1, b: 5 },
    { name: 'Pentagon piece — ⟨1,7,−1⟩ ⋈ ⟨1,1,−1⟩', s1: 1, s3: 1, a: 7, b: 1 },
];
const TRI_PRESETS = [
    { name: '(2,4,∞) ⋈ (2,6,∞) → Δ(4,6,∞) non-arithmetic', p: 2, q1: 4, q2: 6 },
    { name: '(2,3,∞) ⋈ (2,∞,∞) → Δ(3,∞,∞) arithmetic!', p: 2, q1: 3, q2: Infinity },
    { name: '(2,5,∞) ⋈ (2,3,∞) — non-arithmetic piece', p: 2, q1: 5, q2: 3 },
    { name: '(4,3,∞) ⋈ (4,5,∞) — quadrilateral hybrid', p: 4, q1: 3, q2: 5 },
    { name: '(∞,3,∞) ⋈ (∞,4,∞) — ideal vertices on Σ', p: Infinity, q1: 3, q2: 4 },
];

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
    mode: 'qf',
    qf: { s1: 1, s3: 2, a: 1, b: 3 },
    tri: { p: 2, q1: 4, q2: 6 },
    depth: 6,
};

let renderer;

// ─── Construction ──────────────────────────────────────────────────────────
function construct() {
    if (state.mode === 'qf') constructQF();
    else constructTri();
    updateURL();
}

function formString([c1, c2, c3]) {
    const term = (c, v) => (c === 1 ? v : c === -1 ? `−${v}` : c < 0 ? `−${-c}${v}` : `${c}${v}`);
    return `${term(c1, 'x²')} ${c2 < 0 ? '−' : '+'} ${Math.abs(c2) === 1 ? '' : Math.abs(c2)}y² ${c3 < 0 ? '−' : '+'} ${Math.abs(c3) === 1 ? '' : Math.abs(c3)}z²`;
}

function polygonString(ch) {
    return '(' + ch.vertData.map(v => (v.m === Infinity ? '∞' : v.m)).join(', ') + ')';
}

function areaString(area) {
    const frac = area / Math.PI;
    for (let den = 1; den <= 24; den++) {
        const num = frac * den;
        if (Math.abs(num - Math.round(num)) < 1e-6) {
            const n = Math.round(num);
            return den === 1 ? `${n}π` : `${n}π/${den}`;
        }
    }
    return `${frac.toFixed(4)}π`;
}

function constructQF() {
    const { s1, s3, a, b } = state.qf;
    const label1 = `f₁ = ${formString([s1, a, -s3])}`;
    const label2 = `f₂ = ${formString([s1, b, -s3])}`;
    const inv1 = pieceInvariants(s1, a, s3);
    const inv2 = pieceInvariants(s1, b, s3);
    const ch1 = vinbergChamber(s1, a, s3);
    const ch2 = vinbergChamber(s1, b, s3);

    setPieceOnCanvas(0, ch1);
    setPieceOnCanvas(1, ch2);
    $('labelRight').textContent = label1;
    $('labelLeft').textContent = label2;

    const cards = [
        pieceCard('M₁⁺ (right)', label1, inv1, ch1),
        pieceCard('M₂⁻ (left)', label2, inv2, ch2),
    ];
    const verdict = qfVerdict(inv1, inv2, ch1, ch2);
    $('report').innerHTML = cards.join('') + verdict;
    updateStats();
}

function pieceCard(title, label, inv, ch) {
    const geom = ch.ok
        ? `polygon ${polygonString(ch)} · area ${areaString(ch.area)} · ${ch.cusps ? ch.cusps + ' cusp' + (ch.cusps > 1 ? 's' : '') : 'compact'}`
        : `<span class="bad">${ch.reason}</span>`;
    return `<div class="piece-card">
        <h4>${title}</h4>
        <div class="mono">${label}</div>
        <div class="inv">C₀(f) = (${inv.algebra[0]}, ${inv.algebra[1]} / ℚ) &nbsp; Ram = ${ramString(inv.ram)}</div>
        <div class="inv">${inv.cusped ? 'isotropic over ℚ → cusped' : 'anisotropic over ℚ → cocompact'}</div>
        <div class="inv">${geom}</div>
    </div>`;
}

function qfVerdict(inv1, inv2, ch1, ch2) {
    const { a, b } = state.qf;
    if (!ch1.ok || !ch2.ok) {
        return verdictBox('warn', 'Chamber not computed',
            `Vinberg's algorithm did not close a finite-area chamber for at least one form within the
             search bounds, so the tiling cannot be drawn. The arithmetic verdict below is still exact.` +
            arithVerdictText(inv1, inv2, a, b));
    }
    if (a === b) {
        return verdictBox('neutral', 'Identical pieces',
            `f₁ = f₂, so the “hybrid” is just the arithmetic orbifold ℍ²/Γ itself. Choose a ≠ b.`);
    }
    return arithVerdictBox(inv1, inv2);
}

function arithVerdictText(inv1, inv2, a, b) {
    if (a === b) return '';
    return sameSet(inv1.ram, inv2.ram)
        ? ' The two algebras coincide, so the pieces are commensurable.'
        : ' The two algebras differ, so the pieces are non-commensurable and the GPS hybrid is non-arithmetic.';
}

function arithVerdictBox(inv1, inv2) {
    if (sameSet(inv1.ram, inv2.ram)) {
        return verdictBox('warn', 'Commensurable pieces — GPS criterion does not apply',
            `C₀(f₁) ≅ C₀(f₂): both quaternion algebras have ramification ${ramString(inv1.ram)},
             so f₁ and f₂ are similar over ℚ and Γ₁, Γ₂ are <em>widely commensurable</em>.
             The GPS argument needs non-commensurable pieces — this hybrid may even be arithmetic.
             (Over ℚ any two cusped pieces are commensurable: both algebras are M₂(ℚ). To reach a
             non-arithmetic verdict, make at least one piece cocompact, e.g. increase s₃.)`);
    }
    const diff = [...new Set([...inv1.ram, ...inv2.ram])]
        .filter(p => inv1.ram.includes(p) !== inv2.ram.includes(p))
        .map(p => (p === Infinity ? '∞' : p));
    return verdictBox('good', 'Non-arithmetic hybrid — GPS criterion applies',
        `The even Clifford algebras C₀(f₁), C₀(f₂) have different ramification
         (they disagree at ${diff.join(', ')}), so f₁ ≁ f₂ over ℚ and the pieces are
         <em>non-commensurable</em> arithmetic lattices. By Gromov–Piatetski-Shapiro, a manifold
         glued from finite covers of these pieces along Σ is a lattice in no arithmetic
         commensurability class: the hybrid is <strong>non-arithmetic</strong>.`);
}

function verdictBox(cls, title, body) {
    return `<div class="verdict ${cls}"><h4>${title}</h4><p>${body}</p></div>`;
}

function setPieceOnCanvas(i, ch) {
    if (!ch.ok) { renderer.setPiece(i, null); return; }
    const tiles = tileHalfPlane(ch, { depth: state.depth, side: i === 0 ? 1 : -1 });
    renderer.setPiece(i, tiles, ch);
}

function constructTri() {
    const { p, q1, q2 } = state.tri;
    const ch1 = triangleChamber(p, q1);
    const ch2 = triangleChamber(p, q2);
    setPieceOnCanvas(0, ch1);
    setPieceOnCanvas(1, ch2);
    const n1 = triangleName(p, q1), n2 = triangleName(p, q2);
    $('labelRight').textContent = `M₁⁺: ${n1}`;
    $('labelLeft').textContent = `M₂⁻: ${n2}`;

    const card = (title, name, pp, qq, ch) => {
        const arith = isArithmeticTriangle(pp, qq);
        return `<div class="piece-card">
            <h4>${title}</h4>
            <div class="mono">${name}</div>
            <div class="inv">area ${areaString(ch.area)} · ${ch.cusps} ideal ${ch.cusps === 1 ? 'vertex' : 'vertices'}</div>
            <div class="inv">${arith
                ? '<span class="ok">arithmetic</span> (Takeuchi) — commensurable with PSL₂(ℤ)'
                : '<span class="bad">non-arithmetic</span> (invariant trace field ≠ ℚ)'}</div>
        </div>`;
    };
    let verdict;
    const f = x => (x === Infinity ? '∞' : x);
    if (p === 2) {
        const arith = isArithmeticTriangle(q1, q2);
        const both = isArithmeticTriangle(2, q1) && isArithmeticTriangle(2, q2);
        verdict = verdictBox(arith ? 'warn' : 'good',
            `Hybrid = Δ(${f(q1)}, ${f(q2)}, ∞) — ${arith ? 'arithmetic' : 'non-arithmetic'}`,
            `With a right angle on Σ the two triangles fuse across Σ into a single
             (${f(q1)}, ${f(q2)}, ∞) triangle, so the hybrid is precisely the triangle group
             Δ(${f(q1)}, ${f(q2)}, ∞) — which is <strong>${arith ? 'arithmetic' : 'non-arithmetic'}</strong>
             by Takeuchi's classification.
             ${both && !arith ? `Note the contrast with the GPS mechanism: here the pieces are
             <em>commensurable</em> arithmetic groups, yet the hybrid is non-arithmetic — in
             dimension 2 hyperbolic reflection groups are flexible. The quadratic-form mode shows
             the rigidity phenomenon GPS exploit in higher rank.` : ''}
             ${arith ? 'A hybrid of arithmetic pieces can perfectly well be arithmetic again — the GPS conclusion needs non-commensurable pieces.' : ''}`);
    } else {
        verdict = verdictBox('neutral', 'Quadrilateral hybrid',
            `The two triangles meet at angle 2π/${f(p)} on Σ, so the hybrid is the reflection group of a
             quadrilateral with angles (${p === Infinity ? '0' : '2π/' + p}, π/${f(q1)}, 0, π/${f(q2)}).
             Generic such quadrilateral groups are non-arithmetic, but there is no clean classification
             to cite — set p = 2 for exact verdicts via triangle groups.`);
    }
    $('report').innerHTML =
        card('M₁⁺ (right)', n1, p, q1, ch1) + card('M₂⁻ (left)', n2, p, q2, ch2) + verdict;
    updateStats();
}

function updateStats() {
    const n = (renderer.pieces[0]?.tiles.length || 0) + (renderer.pieces[1]?.tiles.length || 0);
    $('tileCount').textContent = `tiles: ${n}`;
}

// ─── UI plumbing ───────────────────────────────────────────────────────────
function fillPresets() {
    const sel = $('presetSelect');
    sel.innerHTML = '<option value="">— presets —</option>';
    const list = state.mode === 'qf' ? QF_PRESETS : TRI_PRESETS;
    list.forEach((p, i) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = p.name;
        sel.appendChild(o);
    });
}

function applyMode() {
    document.querySelectorAll('.tab').forEach(t =>
        t.classList.toggle('active', t.dataset.mode === state.mode));
    $('qfInputs').style.display = state.mode === 'qf' ? '' : 'none';
    $('triInputs').style.display = state.mode === 'tri' ? '' : 'none';
    fillPresets();
}

function readQFInputs() {
    const val = (id, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+$(id).value || lo)));
    state.qf.s1 = val('inS1', 1, 30);
    state.qf.s3 = val('inS3', 1, 30);
    state.qf.a = val('inA', 1, 100);
    state.qf.b = val('inB', 1, 100);
    ['inS1', 'inS3', 'inA', 'inB'].forEach((id, i) =>
        $(id).value = [state.qf.s1, state.qf.s3, state.qf.a, state.qf.b][i]);
}

function readTriInputs() {
    const parse = sel => (sel.value === 'inf' ? Infinity : +sel.value);
    state.tri.p = parse($('inP'));
    state.tri.q1 = parse($('inQ1'));
    state.tri.q2 = parse($('inQ2'));
}

function writeInputs() {
    $('inS1').value = state.qf.s1;
    $('inS3').value = state.qf.s3;
    $('inA').value = state.qf.a;
    $('inB').value = state.qf.b;
    const set = (sel, v) => { $(sel).value = v === Infinity ? 'inf' : String(v); };
    set('inP', state.tri.p);
    set('inQ1', state.tri.q1);
    set('inQ2', state.tri.q2);
}

function updateURL() {
    const u = new URLSearchParams();
    u.set('mode', state.mode);
    if (state.mode === 'qf') {
        const { s1, s3, a, b } = state.qf;
        u.set('s1', s1); u.set('s3', s3); u.set('a', a); u.set('b', b);
    } else {
        const f = x => (x === Infinity ? 'inf' : x);
        u.set('p', f(state.tri.p)); u.set('q1', f(state.tri.q1)); u.set('q2', f(state.tri.q2));
    }
    u.set('depth', state.depth);
    history.replaceState(null, '', '?' + u.toString());
}

function readURL() {
    const u = new URLSearchParams(location.search);
    if (u.get('mode') === 'tri') state.mode = 'tri';
    // Match readQFInputs bounds so deep-linked ?a=Infinity / overflow
    // values cannot reach pieceInvariants → factorize and hang the tab.
    const clampInt = (k, d, lo, hi) => {
        if (!u.has(k)) return d;
        const v = Number(u.get(k));
        if (!Number.isFinite(v)) return d;
        return Math.max(lo, Math.min(hi, Math.round(v)));
    };
    const inf = (k, d) => {
        if (!u.has(k)) return d;
        if (u.get(k) === 'inf') return Infinity;
        const v = Number(u.get(k));
        if (!Number.isFinite(v)) return d;
        const r = Math.round(v);
        return r === 0 ? d : r;
    };
    state.qf.s1 = clampInt('s1', 1, 1, 30);
    state.qf.s3 = clampInt('s3', 2, 1, 30);
    state.qf.a = clampInt('a', 1, 1, 100);
    state.qf.b = clampInt('b', 3, 1, 100);
    state.tri.p = inf('p', 2); state.tri.q1 = inf('q1', 4); state.tri.q2 = inf('q2', 6);
    state.depth = clampInt('depth', 6, 1, 9);
}

function fillQSelects() {
    const opts = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
    for (const id of ['inQ1', 'inQ2']) {
        const sel = $(id);
        sel.innerHTML = '';
        for (const v of opts) {
            const o = document.createElement('option');
            o.value = String(v);
            o.textContent = String(v);
            sel.appendChild(o);
        }
        const o = document.createElement('option');
        o.value = 'inf';
        o.textContent = '∞';
        sel.appendChild(o);
    }
}

function setupUI() {
    fillQSelects();
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
        state.mode = t.dataset.mode;
        applyMode();
        construct();
    }));

    $('presetSelect').addEventListener('change', e => {
        const i = e.target.value;
        if (i === '') return;
        if (state.mode === 'qf') Object.assign(state.qf, QF_PRESETS[i]);
        else Object.assign(state.tri, TRI_PRESETS[i]);
        writeInputs();
        construct();
    });

    $('constructBtn').addEventListener('click', () => {
        if (state.mode === 'qf') readQFInputs(); else readTriInputs();
        $('presetSelect').value = '';
        construct();
    });
    document.querySelectorAll('#qfInputs input').forEach(inp =>
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('constructBtn').click(); }));

    $('depthSlider').addEventListener('input', e => {
        state.depth = +e.target.value;
        $('depthValue').textContent = state.depth;
        construct();
    });
    $('sepSlider').addEventListener('input', e => {
        renderer.separation = +e.target.value;
        $('sepValue').textContent = (+e.target.value).toFixed(2);
    });
    $('opacitySlider').addEventListener('input', e => {
        renderer.opacity = +e.target.value;
        $('opacityValue').textContent = (+e.target.value).toFixed(2);
    });
    $('showWalls').addEventListener('change', e => renderer.showWalls = e.target.checked);
    $('showSigma').addEventListener('change', e => renderer.showSigma = e.target.checked);

    $('resetViewBtn').addEventListener('click', () => renderer.resetView());
    $('screenshotBtn').addEventListener('click', () => {
        renderer.draw();
        const a = document.createElement('a');
        a.download = 'gps-manifold.png';
        a.href = renderer.canvas.toDataURL('image/png');
        a.click();
    });

    // pan / zoom
    const canvas = renderer.canvas;
    let dragging = false, last = [0, 0];
    canvas.addEventListener('pointerdown', e => {
        dragging = true; last = [e.clientX, e.clientY];
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
        if (!dragging) return;
        renderer.pan[0] += e.clientX - last[0];
        renderer.pan[1] += e.clientY - last[1];
        last = [e.clientX, e.clientY];
    });
    canvas.addEventListener('pointerup', () => dragging = false);
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        const [wx, wy] = renderer.screenToWorld(e.clientX, e.clientY);
        renderer.scale *= factor;
        renderer.scale = Math.max(40, Math.min(2e5, renderer.scale));
        // keep cursor point fixed
        const cx = innerWidth / 2, cy = innerHeight / 2;
        renderer.pan[0] = e.clientX - cx - wx * renderer.scale;
        renderer.pan[1] = e.clientY - cy - wy * renderer.scale;
    }, { passive: false });

    addEventListener('keydown', e => {
        if (e.key === 'h' || e.key === 'H') $('controls').classList.toggle('hidden');
        if (e.key === 'i' || e.key === 'I') $('infoPanel').classList.toggle('collapsed');
        if (e.key === 'r' || e.key === 'R') renderer.resetView();
    });
    $('toggleInfo').addEventListener('click', () => $('infoPanel').classList.toggle('collapsed'));

    addEventListener('resize', () => renderer._resize());
}

// ─── Boot ──────────────────────────────────────────────────────────────────
function loop() {
    renderer.draw();
    frames++;
    const now = performance.now();
    if (now - lastFps > 1000) {
        $('fpsCounter').textContent = `${frames} fps`;
        frames = 0; lastFps = now;
    }
    requestAnimationFrame(loop);
}
let frames = 0, lastFps = performance.now();

readURL();
renderer = new Renderer($('gpsCanvas'));
window.__gps = { renderer, state };
setupUI();
applyMode();
writeInputs();
$('depthSlider').value = state.depth;
$('depthValue').textContent = state.depth;
construct();
loop();
