// ═══════════════════════════════════════════════════════
// Info Panel, Legend, and Hover Information
// ═══════════════════════════════════════════════════════

import { buildFareyTree, evaluateTraces, slopeHue } from './fareyTree.js';

// Cache the Farey tree used for hover-point classification
let cachedDepth = -1;
let cachedNodes = null;

function getNodes(depth) {
    if (depth !== cachedDepth) {
        cachedDepth = depth;
        cachedNodes = buildFareyTree(depth);
    }
    return cachedNodes;
}

/**
 * Wire up the collapsible sections of the info panel.
 */
export function setupInfoPanel() {
    const toggleFeature = document.getElementById('toggleFeatureInfo');
    const featureDetails = document.getElementById('featureDetails');
    const toggleMath = document.getElementById('toggleMathInfo');
    const mathDetails = document.getElementById('mathDetails');

    if (toggleFeature && featureDetails) {
        toggleFeature.addEventListener('click', () => {
            const isOpen = featureDetails.style.display !== 'none';
            featureDetails.style.display = isOpen ? 'none' : 'block';
            toggleFeature.classList.toggle('expanded', !isOpen);
        });
    }

    if (toggleMath && mathDetails) {
        toggleMath.addEventListener('click', () => {
            const isOpen = mathDetails.style.display !== 'none';
            mathDetails.style.display = isOpen ? 'none' : 'block';
            toggleMath.classList.toggle('expanded', !isOpen);
        });
    }
}

/**
 * Initialize and populate the legend panel with the low-denominator
 * slopes, colored exactly as the shader colors them.
 */
export function initializeLegend() {
    const legendContent = document.getElementById('legendContent');
    if (!legendContent) return;

    legendContent.innerHTML = '';
    for (const item of generateLegend()) {
        const itemEl = document.createElement('div');
        itemEl.className = 'legend-item';

        const colorEl = document.createElement('div');
        colorEl.className = 'legend-color';
        const rgb = hsv2rgb(item.hue, 0.85, 0.7);
        colorEl.style.backgroundColor = rgbToHex(rgb[0], rgb[1], rgb[2]);

        const labelEl = document.createElement('div');
        labelEl.className = 'legend-label';
        labelEl.textContent = item.label;

        itemEl.appendChild(colorEl);
        itemEl.appendChild(labelEl);
        legendContent.appendChild(itemEl);
    }
}

/**
 * Legend entries: slopes p/q ∈ [0,1] with q ≤ 5, in increasing order.
 */
export function generateLegend() {
    const fracs = [];
    for (let q = 1; q <= 5; q++) {
        for (let p = 0; p <= q; p++) {
            if (gcd(p, q) === 1) fracs.push({ p, q });
        }
    }
    fracs.sort((a, b) => a.p * b.q - b.p * a.q);
    return fracs.map(f => ({
        label: `${f.p}/${f.q}`,
        hue: slopeHue(f.p, f.q)
    }));
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/**
 * Update hover information: evaluate the actual Farey traces at the
 * cursor point and report which cusp region (if any) contains it.
 */
export function updateHoverInfo(event, canvas, renderer) {
    const hoverInfo = document.getElementById('hoverInfo');
    if (!hoverInfo) return;

    const c = renderer.cssToComplex(event.clientX, event.clientY);

    // In the symmetric parametrization the screen shows z with ρ = z²
    let rho;
    if (renderer.currentParam === 1) {
        rho = { re: c.x * c.x - c.y * c.y, im: 2 * c.x * c.y };
    } else {
        rho = { re: c.x, im: c.y };
    }

    const nodes = getNodes(renderer.depth || 5);
    const vals = evaluateTraces(nodes, rho.re, rho.im);

    // Classify the point, matching the shader. Gray = certified outside
    // the Riley slice: the Shimizu disk |ρ| < 1, the real segment
    // (−4,4), or within the Newton-distance threshold of a root of some
    // Q_{p/q} = 2 − Φ_{p/q} (root sets are dense in the complement).
    // Otherwise the dominant slope (argmin |Φ|) names the Riley-style
    // combinatorial region.
    const depth = renderer.depth || 5;
    const rootEps = 0.7 / Math.sqrt(2 ** depth);
    const h = 1e-5;
    const valsH = evaluateTraces(nodes, rho.re + h, rho.im);
    let dom = -1;        // word minimizing |Φ| (excluding 1/0)
    let domAbs = Infinity;
    let root = -1;       // word with the nearest root of 2 − Φ
    let rootDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
        if (i === 1) continue; // 1/0 has Φ ≡ 2
        const v = vals[i];
        const a = Math.hypot(v.re, v.im);
        if (a < domAbs) { domAbs = a; dom = i; }
        const dp = Math.hypot((valsH[i].re - v.re) / h, (valsH[i].im - v.im) / h);
        if (dp > 1e-12) {
            const d = Math.hypot(2 - v.re, v.im) / dp;
            if (d < rootDist) { rootDist = d; root = i; }
        }
    }
    const inSeed = Math.hypot(rho.re, rho.im) < 1
        || (Math.abs(rho.im) < 0.02 && Math.abs(rho.re) < 4);

    let statusHtml;
    if (inSeed) {
        statusHtml = `<span class="color-swatch" style="background:#9a9a9e"></span>` +
            `Outside the Riley slice — ` +
            (Math.hypot(rho.re, rho.im) < 1
                ? `|ρ| &lt; 1, excluded by Shimizu's lemma (no discrete group here)`
                : `ρ is on the real segment (−4, 4), where Γ<sub>ρ</sub> is never discrete and free`);
    } else if (rootDist < rootEps && root >= 0) {
        const n = nodes[root];
        statusHtml = `<span class="color-swatch" style="background:#9a9a9e"></span>` +
            `Outside the Riley slice (certified) — within ${rootDist.toFixed(4)} of a root of ` +
            `2 − Φ<sub>${n.p}/${n.q}</sub>; roots of Farey polynomials are dense in the complement (EMS)`;
    } else {
        const n = nodes[dom];
        const v = vals[dom];
        const rgb = hsv2rgb(slopeHue(n.p, n.q), 0.55, 0.92);
        const swatch = `<span class="color-swatch" style="background:${rgbToHex(rgb[0], rgb[1], rgb[2])}"></span>`;
        statusHtml = `${swatch}Riley slice, region <strong>${n.p}/${n.q}</strong> — ` +
            `W<sub>${n.p}/${n.q}</sub> has the minimal trace among Farey words ` +
            `(Φ<sub>${n.p}/${n.q}</sub> = ${fmtComplex(v)}, |Φ| = ${domAbs.toFixed(3)}), ` +
            `so slope ${n.p}/${n.q} dominates the combinatorics of the Dirichlet/Ford domain here.`;
    }

    const rhoStr = fmtComplex({ re: rho.re, im: rho.im });
    const zLine = renderer.currentParam === 1
        ? `<strong>z:</strong> ${fmtComplex({ re: c.x, im: c.y })} &nbsp;(ρ = z²)<br/>`
        : '';

    hoverInfo.innerHTML = `
        ${zLine}<strong>ρ:</strong> ${rhoStr}<br/>
        <strong>Status:</strong> ${statusHtml}
    `;
}

function fmtComplex(v) {
    const sign = v.im >= 0 ? '+' : '−';
    return `${v.re.toFixed(4)} ${sign} ${Math.abs(v.im).toFixed(4)}i`;
}

/**
 * Format description for specific trace type
 */
export function formatTraceDescription(traceType) {
    const descriptions = {
        'pleating': 'Pleating ray: Φ_{p/q} is real and ≤ −2 (exterior)',
        'extension': 'Elliptic extension: Φ_{p/q} is real in (−2, 2)',
        'boundary': 'Boundary approximation: |Φ_{p/q}| = 2',
        'region': 'Cusp region: |Φ_{p/q}| < 2'
    };
    return descriptions[traceType] || 'Unknown region type';
}

/**
 * HSV to RGB conversion (same as in shader)
 */
export function hsv2rgb(h, s, v) {
    h = ((h % 1) + 1) % 1;
    const c = v * s;
    const x = c * (1 - Math.abs((h * 6) % 2 - 1));
    const m = v - c;

    let rgb;
    if (h < 1 / 6) rgb = [c, x, 0];
    else if (h < 2 / 6) rgb = [x, c, 0];
    else if (h < 3 / 6) rgb = [0, c, x];
    else if (h < 4 / 6) rgb = [0, x, c];
    else if (h < 5 / 6) rgb = [x, 0, c];
    else rgb = [c, 0, x];

    return rgb.map(val => val + m);
}

/**
 * Format RGB to hex string
 */
export function rgbToHex(r, g, b) {
    const toHex = (v) => {
        const h = Math.round(v * 255).toString(16);
        return h.length === 1 ? '0' + h : h;
    };
    return '#' + toHex(r) + toHex(g) + toHex(b);
}
