/**
 * DOM event wiring for all 7 steps.
 * Accepts callbacks { draw, switchStep, animateProp, stopAnim }.
 */
import { state } from './state.js';

export function wireEvents({ draw, switchStep, animateProp, stopAnim }) {

    /* ── Nav tabs ──────────────────────────────────────── */
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchStep(parseInt(tab.dataset.step)));
    });

    /* ── Step 0: Rigid Motions ─────────────────────────── */
    document.querySelectorAll('[data-step="0"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-step="0"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.isoType = btn.dataset.action;
            document.getElementById('ctrl-translate-dir').classList.toggle('hidden', btn.dataset.action !== 'translation');
            document.getElementById('ctrl-translate-dist').classList.toggle('hidden', btn.dataset.action !== 'translation');
            document.getElementById('ctrl-rot-angle').classList.toggle('hidden', btn.dataset.action !== 'rotation');
            document.getElementById('ctrl-ref-axis').classList.toggle('hidden', btn.dataset.action !== 'reflection');
            draw();
        });
    });

    _slider('slider-dir',   v => { state.translateDir  = +v; _pv('pv-dir', v + '°'); draw(); });
    _slider('slider-dist',  v => { state.translateDist = +v; _pv('pv-dist', (+v).toFixed(1)); draw(); });
    _slider('slider-angle', v => { state.rotAngle      = +v; _pv('pv-angle', v + '°'); draw(); });
    _slider('slider-axis',  v => { state.refAxis       = +v; _pv('pv-axis', v + '°'); draw(); });

    /* ── Step 1: Inverses ──────────────────────────────── */
    document.querySelectorAll('[data-step="1"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-step="1"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.invType = btn.dataset.action;
            state.invPhase = 'idle'; state.invT = 0;
            stopAnim(); draw();
        });
    });

    document.getElementById('btn-apply').addEventListener('click', () => {
        if (state.animating) return;
        state.invPhase = 'applied';
        animateProp('invT', 1);
    });
    document.getElementById('btn-undo').addEventListener('click', () => {
        if (state.animating || state.invPhase !== 'applied') return;
        state.invPhase = 'undone';
        animateProp('invT', 1);
    });
    document.getElementById('btn-identity').addEventListener('click', () => {
        stopAnim(); state.invPhase = 'idle'; state.invT = 0; draw();
    });

    /* ── Step 2: Composition ───────────────────────────── */
    document.querySelectorAll('[data-step="2"] .btn-toggle[data-action^="comp-a"]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-step="2"] .btn-toggle[data-action^="comp-a"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.compA = btn.dataset.action.replace('comp-a-', '');
            state.compPhase = 'idle'; state.compT = 0; stopAnim(); draw();
        });
    });
    document.querySelectorAll('[data-step="2"] .btn-toggle[data-action^="comp-b"]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-step="2"] .btn-toggle[data-action^="comp-b"]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.compB = btn.dataset.action.replace('comp-b-', '');
            state.compPhase = 'idle'; state.compT = 0; stopAnim(); draw();
        });
    });

    _slider('slider-iter', v => {
        state.compIter = +v; _pv('pv-iter', v);
        state.compPhase = 'idle'; state.compT = 0; stopAnim(); draw();
    });
    document.getElementById('btn-compose').addEventListener('click', () => {
        if (state.animating) return;
        state.compPhase = 'playing';
        animateProp('compT', 0.8 * state.compIter);
    });
    document.getElementById('btn-compose-reset').addEventListener('click', () => {
        stopAnim(); state.compPhase = 'idle'; state.compT = 0; draw();
    });

    /* ── Step 3: Placemat ──────────────────────────────── */
    document.querySelectorAll('.placemat-btns .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            state.pmSequence.push(btn.dataset.action);
            _updatePmDisplay();
            draw();
        });
    });
    document.getElementById('btn-pm-play').addEventListener('click', () => {
        if (state.animating || !state.pmSequence.length) return;
        state.pmPhase = 'playing';
        animateProp('pmT', 0.7 * state.pmSequence.length, () => { state.pmPhase = 'idle'; });
    });
    document.getElementById('btn-pm-clear').addEventListener('click', () => {
        stopAnim(); state.pmSequence = []; state.pmPhase = 'idle'; state.pmT = 0;
        _updatePmDisplay(); draw();
    });

    /* ── Step 4: Generators ────────────────────────────── */
    document.querySelectorAll('[data-step="4"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-step="4"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.genType = btn.dataset.action;
            draw();
        });
    });
    _slider('slider-depth', v => { state.genDepth = +v; _pv('pv-depth', v); draw(); });

    /* ── Step 5: Commuting ─────────────────────────────── */
    _slider('slider-comm-dir1', v => { state.commDir1 = +v; _pv('pv-comm-dir1', v + '°'); draw(); });
    _slider('slider-comm-d1',   v => { state.commD1   = +v; _pv('pv-comm-d1', (+v).toFixed(1)); draw(); });
    _slider('slider-comm-dir2', v => { state.commDir2 = +v; _pv('pv-comm-dir2', v + '°'); draw(); });
    _slider('slider-comm-d2',   v => { state.commD2   = +v; _pv('pv-comm-d2', (+v).toFixed(1)); draw(); });

    /* ── Step 6: Lattices ──────────────────────────────── */
    _slider('slider-lat-dir1', v => { state.latDir1 = +v; _pv('pv-lat-dir1', v + '°'); draw(); });
    _slider('slider-lat-d1',   v => { state.latD1   = +v; _pv('pv-lat-d1', (+v).toFixed(1)); draw(); });
    _slider('slider-lat-dir2', v => { state.latDir2 = +v; _pv('pv-lat-dir2', v + '°'); draw(); });
    _slider('slider-lat-d2',   v => { state.latD2   = +v; _pv('pv-lat-d2', (+v).toFixed(1)); draw(); });

    document.querySelectorAll('[data-action^="lat-"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const presets = {
                'lat-square':  { d1: 0, l1: 2, d2: 90, l2: 2 },
                'lat-hex':     { d1: 0, l1: 2, d2: 60, l2: 2 },
                'lat-oblique': { d1: 10, l1: 2.5, d2: 70, l2: 1.8 },
                'lat-rect':    { d1: 0, l1: 3, d2: 90, l2: 1.5 },
            };
            const p = presets[btn.dataset.action];
            if (!p) return;
            state.latDir1 = p.d1; state.latD1 = p.l1;
            state.latDir2 = p.d2; state.latD2 = p.l2;
            _setSlider('slider-lat-dir1', p.d1); _setSlider('slider-lat-d1', p.l1);
            _setSlider('slider-lat-dir2', p.d2); _setSlider('slider-lat-d2', p.l2);
            _pv('pv-lat-dir1', p.d1 + '°'); _pv('pv-lat-d1', p.l1.toFixed(1));
            _pv('pv-lat-dir2', p.d2 + '°'); _pv('pv-lat-d2', p.l2.toFixed(1));
            draw();
        });
    });

    /* ── Keyboard ──────────────────────────────────────── */
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (state.step < 6) switchStep(state.step + 1); }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); if (state.step > 0) switchStep(state.step - 1); }
        if (e.key >= '1' && e.key <= '7') switchStep(+e.key - 1);
    });
}

/* ── Helpers ───────────────────────────────────────── */

function _slider(id, fn) {
    document.getElementById(id).addEventListener('input', e => fn(e.target.value));
}
function _pv(id, txt) { document.getElementById(id).textContent = txt; }
function _setSlider(id, v) { document.getElementById(id).value = v; }

function _updatePmDisplay() {
    const el = document.getElementById('pm-seq-items');
    if (!state.pmSequence.length) { el.innerHTML = '—'; return; }
    const labels = { 'pm-rot': 'R180', 'pm-flipH': 'Flip↔', 'pm-flipV': 'Flip↕' };
    const cls    = { 'pm-rot': 'rot',  'pm-flipH': 'flipH', 'pm-flipV': 'flipV' };
    el.innerHTML = state.pmSequence
        .map(op => `<span class="seq-chip ${cls[op]}">${labels[op]}</span>`)
        .join(' → ');
}
