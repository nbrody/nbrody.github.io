/* ------------------------------------------------------------------ *
 *  UI: γ sliders, sum pill, radar, readout, projection matrix,
 *  preset & palette buttons.
 * ------------------------------------------------------------------ */

import { N, E, state, schedule } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let slidersDiv;

export function initUI() {
    slidersDiv = document.getElementById('sliders');
    buildSliders();
    bindPresets();
    bindPalette();
    showProj();
}

/* ---- γ sliders -------------------------------------------------- */
function buildSliders() {
    for (let i = 0; i < N; i++) {
        const row = document.createElement('div');
        row.className = 'slider-row';
        row.innerHTML = `
      <span class="name">γ<sub>${i}</sub></span>
      <input type="range" min="0" max="1" step="0.001" value="${state.gamma[i]}" data-i="${i}">
      <span class="val" data-val="${i}">${state.gamma[i].toFixed(3)}</span>
    `;
        slidersDiv.appendChild(row);
    }
    slidersDiv.addEventListener('input', e => {
        if (e.target.dataset.i === undefined) return;
        const i = +e.target.dataset.i;
        state.gamma[i] = +e.target.value;
        // User interaction – damp out any residual wander velocity on this axis.
        state.wanderVel[i] = 0;
        document.querySelector(`[data-val="${i}"]`).textContent = state.gamma[i].toFixed(3);
        schedule();
    });
}

export function syncSliders() {
    for (let i = 0; i < N; i++) {
        const inp = slidersDiv.querySelector(`[data-i="${i}"]`);
        inp.value = state.gamma[i];
        document.querySelector(`[data-val="${i}"]`).textContent = state.gamma[i].toFixed(3);
    }
}

/* ---- Sum pill --------------------------------------------------- */
export function updateSumPill() {
    const s = state.gamma.reduce((a, b) => a + b, 0);
    document.getElementById('sumVal').textContent = s.toFixed(3);
    const near = Math.abs(s - Math.round(s)) < 0.005;
    document.getElementById('sumPill').classList.toggle('integer', near);
}

/* ---- Readout ---------------------------------------------------- */
export function updateReadout() {
    document.getElementById('readout').innerHTML =
        `<b>center</b>  (${state.cx.toFixed(2)}, ${state.cy.toFixed(2)})<br>` +
        `<b>scale</b>   ${state.scale.toFixed(1)} px/edge`;
}

/* ---- Rhombus count meta --------------------------------------- */
export function updateRhombCount(n) {
    document.getElementById('rhombCount').textContent = n.toLocaleString() + ' rhombi';
}

/* ---- Radar visualization of γ ---------------------------------- */
export function updateRadar() {
    const svg = document.getElementById('radarSvg');
    svg.innerHTML = '';

    // background concentric pentagons
    for (let r = 0.25; r <= 1.0; r += 0.25) {
        const poly = document.createElementNS(SVG_NS, 'polygon');
        let pts = [];
        for (let k = 0; k < N; k++) {
            pts.push(`${r * E[k][0]},${-r * E[k][1]}`);
        }
        poly.setAttribute('points', pts.join(' '));
        poly.setAttribute('fill', 'none');
        poly.setAttribute('stroke', '#2a2319');
        poly.setAttribute('stroke-width', r === 1 ? '0.015' : '0.008');
        svg.appendChild(poly);
    }

    // axes
    for (let k = 0; k < N; k++) {
        const ln = document.createElementNS(SVG_NS, 'line');
        ln.setAttribute('x1', 0); ln.setAttribute('y1', 0);
        ln.setAttribute('x2', E[k][0]); ln.setAttribute('y2', -E[k][1]);
        ln.setAttribute('stroke', '#2a2319');
        ln.setAttribute('stroke-width', '0.01');
        svg.appendChild(ln);
    }

    // γ polygon
    const poly = document.createElementNS(SVG_NS, 'polygon');
    let pts = [];
    for (let k = 0; k < N; k++) {
        pts.push(`${state.gamma[k] * E[k][0]},${-state.gamma[k] * E[k][1]}`);
    }
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('fill', 'rgba(216,168,74,0.18)');
    poly.setAttribute('stroke', '#d8a84a');
    poly.setAttribute('stroke-width', '0.015');
    poly.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(poly);

    // γ points
    for (let k = 0; k < N; k++) {
        const c = document.createElementNS(SVG_NS, 'circle');
        c.setAttribute('cx', state.gamma[k] * E[k][0]);
        c.setAttribute('cy', -state.gamma[k] * E[k][1]);
        c.setAttribute('r', '0.045');
        c.setAttribute('fill', '#d8a84a');
        svg.appendChild(c);
    }

    // labels
    for (let k = 0; k < N; k++) {
        const t = document.createElementNS(SVG_NS, 'text');
        t.textContent = k;
        t.setAttribute('x', 1.15 * E[k][0]);
        t.setAttribute('y', -1.15 * E[k][1] + 0.04);
        t.setAttribute('fill', '#625a4a');
        t.setAttribute('font-size', '0.14');
        t.setAttribute('font-family', 'JetBrains Mono, monospace');
        t.setAttribute('text-anchor', 'middle');
        svg.appendChild(t);
    }
}

/* ---- Projection matrix display --------------------------------- */
function showProj() {
    const div = document.getElementById('projMat');
    let html = '';
    for (let k = 0; k < N; k++) html += `<span>${E[k][0].toFixed(2)}</span>`;
    for (let k = 0; k < N; k++) html += `<span>${E[k][1].toFixed(2)}</span>`;
    div.innerHTML = html;
}

/* ---- Presets ---------------------------------------------------- */
function bindPresets() {
    document.querySelectorAll('[data-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = btn.dataset.preset;
            if (p === 'sunny')   state.gamma = [0.2, 0.2, 0.2, 0.2, 0.2];
            if (p === 'starry')  state.gamma = [0.4, 0.4, 0.4, 0.4, 0.4];
            if (p === 'half')    state.gamma = [0.5, 0.5, 0.5, 0.5, 0.5];
            if (p === 'graded')  state.gamma = [0.1, 0.3, 0.5, 0.7, 0.9];
            if (p === 'generic') state.gamma = [0.13, 0.41, 0.27, 0.82, 0.56];
            if (p === 'random')  state.gamma = state.gamma.map(() => Math.random());
            state.wanderVel = [0, 0, 0, 0, 0];
            syncSliders();
            schedule();
        });
    });
}

/* ---- Palette toggle --------------------------------------------- */
function bindPalette() {
    document.querySelectorAll('[data-palette]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-palette]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.palette = btn.dataset.palette;
            schedule();
        });
    });
}
