const svg = document.getElementById('hyp-svg');
const gridGroup = document.getElementById('grid-group');
const guidesGroup = document.getElementById('guides-group');
const points = [];

function initGrid() {
    gridGroup.innerHTML = '';
    guidesGroup.innerHTML = '';
    points.length = 0;

    const nx = 20;
    const ny = 10;
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            const x = -4 + (i / (nx - 1)) * 8;
            const y = 0.4 + (j / (ny - 1)) * 3;

            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", x);
            dot.setAttribute("cy", y);
            dot.setAttribute("r", 0.04);
            dot.setAttribute("class", "grid-point");
            gridGroup.appendChild(dot);

            points.push({
                element: dot,
                currentZ: { re: x, im: y }
            });
        }
    }
}

function getMatrixLog(mat) {
    const a = mat.a.toNumber();
    const b = mat.b.toNumber();
    const c = mat.c.toNumber();
    const d = mat.d.toNumber();
    const det = a * d - b * c;
    const s = Math.sqrt(Math.abs(det));
    const na = a / s, nb = b / s, nc = c / s, nd = d / s;
    const tr = na + nd;

    if (tr > 2.000001) { // Hyperbolic
        const phi = Math.acosh(tr / 2);
        const coeff = phi / Math.sinh(phi);
        return { type: 'hyperbolic', log: { a: coeff * (na - tr / 2), b: coeff * nb, c: coeff * nc, d: coeff * (nd - tr / 2) } };
    } else if (tr < 1.999999 && tr > -1.999999) { // Elliptic
        const phi = Math.acos(tr / 2);
        const coeff = phi / Math.sin(phi);
        return { type: 'elliptic', log: { a: coeff * (na - tr / 2), b: coeff * nb, c: coeff * nc, d: coeff * (nd - tr / 2) } };
    } else { // Parabolic
        return { type: 'parabolic', log: { a: na - 1, b: nb, c: nc, d: nd - 1 } };
    }
}

function matrixExp(X, t) {
    const a = X.a * t, b = X.b * t, c = X.c * t, d = X.d * t;
    const mdet = -(a * d - b * c);
    if (mdet > 1e-9) {
        const s = Math.sqrt(mdet);
        const co = Math.cosh(s), si = Math.sinh(s) / s;
        return { a: co + si * a, b: si * b, c: si * c, d: co + si * d };
    } else if (mdet < -1e-9) {
        const s = Math.sqrt(-mdet);
        const co = Math.cos(s), si = Math.sin(s) / s;
        return { a: co + si * a, b: si * b, c: si * c, d: co + si * d };
    } else {
        return { a: 1 + a, b: b, c: c, d: 1 + d };
    }
}

function applyRawAction(G, z) {
    const numR = G.a * z.re + G.b, numI = G.a * z.im;
    const denR = G.c * z.re + G.d, denI = G.c * z.im;
    const denMagSq = denR * denR + denI * denI;
    return { re: (numR * denR + numI * denI) / denMagSq, im: (numI * denR - numR * denI) / denMagSq };
}

function getFixedPoints(mat) {
    const a = mat.a.toNumber(), b = mat.b.toNumber(), c = mat.c.toNumber(), d = mat.d.toNumber();
    if (Math.abs(c) < 1e-9) return [{ re: b / (d - a), im: 0 }, { re: Infinity, im: 0 }];
    const disc = (a + d) * (a + d) - 4;
    if (disc < 0) { // Elliptic
        const re = (a - d) / (2 * c);
        const im = Math.sqrt(-disc) / (2 * Math.abs(c));
        return [{ re, im }];
    } else { // Hyperbolic/Parabolic
        const re1 = (a - d + Math.sqrt(disc)) / (2 * c);
        const re2 = (a - d - Math.sqrt(disc)) / (2 * c);
        return [{ re: re1, im: 0 }, { re: re2, im: 0 }];
    }
}

let isAnimating = false;
function applyAction() {
    if (isAnimating) return;
    const a = document.getElementById('g-a').value, b = document.getElementById('g-b').value;
    const c = document.getElementById('g-c').value, d = document.getElementById('g-d').value;
    const mat = new BigMat(a, b, c, d);
    updateMatrixDisplay(mat);
    guidesGroup.innerHTML = '';

    const { type, log: X } = getMatrixLog(mat);
    const fixed = getFixedPoints(mat);
    const startPositions = points.map(p => ({ ...p.currentZ }));
    isAnimating = true;

    // Create Guides
    let guideEl = null, arrowEl = null;
    if (type === 'elliptic' && fixed.length > 0) {
        const fp = fixed[0];
        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", fp.re); dot.setAttribute("cy", fp.im); dot.setAttribute("r", 0.08);
        dot.setAttribute("class", "fixed-point");
        guidesGroup.appendChild(dot);
        arrowEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowEl.setAttribute("class", "action-arrow");
        arrowEl.setAttribute("marker-end", "url(#arrowhead)");
        guidesGroup.appendChild(arrowEl);
    } else if (type === 'hyperbolic') {
        guideEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        guideEl.setAttribute("class", "guide-axis");
        const z1 = fixed[0], z2 = fixed[1];
        if (z2.re === Infinity) {
            guideEl.setAttribute("d", `M ${z1.re} 0 L ${z1.re} 10`);
        } else {
            const center = (z1.re + z2.re) / 2, radius = Math.abs(z1.re - z2.re) / 2;
            guideEl.setAttribute("d", `M ${center - radius} 0 A ${radius} ${radius} 0 0 1 ${center + radius} 0`);
        }
        guidesGroup.appendChild(guideEl);
        arrowEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowEl.setAttribute("class", "action-arrow");
        arrowEl.setAttribute("marker-end", "url(#arrowhead)");
        guidesGroup.appendChild(arrowEl);
    }

    let startTime = null;
    const duration = 1500;
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const G_t = matrixExp(X, progress);

        points.forEach((p, i) => {
            const zPrime = applyRawAction(G_t, startPositions[i]);
            p.element.setAttribute("cx", zPrime.re); p.element.setAttribute("cy", zPrime.im);
            if (progress === 1) p.currentZ = zPrime;
        });

        if (arrowEl) {
            if (type === 'elliptic') {
                const fp = fixed[0], r = 0.5, angStart = 0, angEnd = progress * Math.PI * 0.8;
                const x1 = fp.re + r * Math.cos(angStart), y1 = fp.im + r * Math.sin(angStart);
                const x2 = fp.re + r * Math.cos(angEnd), y2 = fp.im + r * Math.sin(angEnd);
                arrowEl.setAttribute("d", `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`);
            } else if (type === 'hyperbolic') {
                const z1 = fixed[0], z2 = fixed[1];
                if (z2.re === Infinity) {
                    const yStart = 1, yEnd = 1 + progress * 2;
                    arrowEl.setAttribute("d", `M ${z1.re} ${yStart} L ${z1.re} ${yEnd}`);
                } else {
                    const center = (z1.re + z2.re) / 2, radius = Math.abs(z1.re - z2.re) / 2;
                    const angStart = Math.PI * 0.8, angEnd = Math.PI * 0.8 - progress * Math.PI * 0.3;
                    const x1 = center + radius * Math.cos(angStart), y1 = radius * Math.sin(angStart);
                    const x2 = center + radius * Math.cos(angEnd), y2 = radius * Math.sin(angEnd);
                    arrowEl.setAttribute("d", `M ${x1} ${y1} A ${radius} ${radius} 0 0 0 ${x2} ${y2}`);
                }
            }
        }

        if (progress < 1) requestAnimationFrame(animate);
        else isAnimating = false;
    }
    requestAnimationFrame(animate);
}

function resetView() {
    if (isAnimating) return;
    initGrid();
    document.getElementById('matrix-display').innerHTML = '';
}

function updateMatrixDisplay(mat) {
    const display = document.getElementById('matrix-display');
    display.innerHTML = `\\( g = \\begin{pmatrix} ${mat.a.toLatex()} & ${mat.b.toLatex()} \\\\ ${mat.c.toLatex()} & ${mat.d.toLatex()} \\end{pmatrix} \\)`;
    MathJax.typesetPromise([display]);
}

document.getElementById('apply-btn').addEventListener('click', applyAction);
document.getElementById('reset-btn').addEventListener('click', resetView);
window.onload = initGrid;

// --- UHP/Disk Transformation Functions ---

// Convert Upper Half Plane (z) to Poincare Disk (w)
// w = (z - i) / (z + i)
function toDisk(z) {
    const denR = z.re;
    const denI = z.im + 1;
    const numR = z.re;
    const numI = z.im - 1;
    const magSq = denR * denR + denI * denI;
    return {
        re: (numR * denR + numI * denI) / magSq,
        im: (numI * denR - numR * denI) / magSq
    };
}

// Convert Poincare Disk (w) to Upper Half Plane (z)
// z = i(1 + w) / (1 - w)
function fromDisk(w) {
    const denR = 1 - w.re;
    const denI = -w.im;
    const numR = -w.im; // Re[i(1+w)] = Re[i + ire - im] = -im
    const numI = 1 + w.re; // Im[i(1+w)] = Im[i + ire - im] = 1 + re
    const magSq = denR * denR + denI * denI;
    return {
        re: (numR * denR + numI * denI) / magSq,
        im: (numI * denR - numR * denI) / magSq
    };
}
