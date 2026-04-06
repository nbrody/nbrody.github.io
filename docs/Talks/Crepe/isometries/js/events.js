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

    /* ── Step 0: The Plane (no controls) ──────────────── */
    // Nothing to wire — purely static

    /* ── Step 1: Translations ─────────────────────────── */
    document.querySelectorAll('[data-step="1"] .btn-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-step="1"] .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const map = { 'trans-e1': 0, 'trans-e2': 1, 'trans-both': 2 };
            state.transSubStep = map[btn.dataset.action] ?? 0;
            state.transAnimT = (state.transSubStep === 2) ? 1 : 0;
            stopAnim();
            draw();
        });
    });

    document.getElementById('btn-trans-animate').addEventListener('click', () => {
        if (state.animating) return;
        state.transAnimT = 0;
        animateProp('transAnimT', 0.8);
    });

    /* ── Step 2: Combining Translations ───────────────── */
    _slider('slider-combine-m', v => {
        state.combineM = +v; _pv('pv-combine-m', v);
        state.combinePhase = 'idle'; state.combineT = 0;
        stopAnim(); draw();
    });
    _slider('slider-combine-n', v => {
        state.combineN = +v; _pv('pv-combine-n', v);
        state.combinePhase = 'idle'; state.combineT = 0;
        stopAnim(); draw();
    });

    document.getElementById('btn-iterate').addEventListener('click', () => {
        if (state.animating) return;
        state.combinePhase = 'iterating';
        state.combineT = 0;
        const totalDuration = 0.4 * (state.combineM + state.combineN);
        animateProp('combineT', totalDuration);
    });

    document.getElementById('btn-combine').addEventListener('click', () => {
        if (state.animating) return;
        state.combinePhase = 'combining';
        state.combineT = 0;
        animateProp('combineT', 1.2);
    });

    document.getElementById('btn-combine-reset').addEventListener('click', () => {
        stopAnim();
        state.combinePhase = 'idle'; state.combineT = 0;
        draw();
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
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', e => fn(e.target.value));
}
function _pv(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
}
function _setSlider(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v;
}

function _updatePmDisplay() {
    const el = document.getElementById('pm-seq-items');
    if (!state.pmSequence.length) { el.innerHTML = '—'; return; }
    const labels = { 'pm-rot': 'R180', 'pm-flipH': 'Flip↔', 'pm-flipV': 'Flip↕' };
    const cls    = { 'pm-rot': 'rot',  'pm-flipH': 'flipH', 'pm-flipV': 'flipV' };
    el.innerHTML = state.pmSequence
        .map(op => `<span class="seq-chip ${cls[op]}">${labels[op]}</span>`)
        .join(' → ');
}
