const svg = document.getElementById('hyp-svg');
const gridGroup = document.getElementById('grid-group');
const tilingGroup = document.getElementById('tiling-group');
const guidesGroup = document.getElementById('guides-group');
const points = [];
const tiles = [];
let vizMode = 'grid'; // 'grid' or 'tiling'

const engine = new TilingEngine();

function initGrid() {
    gridGroup.innerHTML = '';
    tilingGroup.innerHTML = '';
    guidesGroup.innerHTML = '';
    points.length = 0;
    tiles.length = 0;

    if (vizMode === 'grid') {
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
    } else {
        initTiling();
    }
}

function initTiling() {
    tilingGroup.innerHTML = '';
    tiles.length = 0;

    const verts = engine.computeFundamentalDomain();
    console.log("Base vertices computed:", verts.length);
    if (verts.length === 0) {
        console.error("No fundamental domain vertices found! Check generators.");
    }

    const orbit = engine.getTilingOrbit(200);
    console.log("Tiling orbit size:", orbit.length);

    orbit.forEach(item => {
        const polyVertices = engine.baseVertices.map(v => item.g.action(v));
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "tile");
        path.style.cursor = "pointer";

        // Add click listener to animate the transformation for this tile
        path.addEventListener('click', () => {
            animateAction(item.g);
        });

        tilingGroup.appendChild(path);

        tiles.push({
            element: path,
            vertices: polyVertices,
            matrix: item.g
        });
    });

    renderTiling();
}

function renderTiling() {
    tiles.forEach(tile => {
        const d = drawPolygon(tile.vertices);
        tile.element.setAttribute("d", d);
    });
}

function drawPolygon(vertices) {
    if (vertices.length < 3) return "";

    let pathData = "";
    const displayPoints = vertices.map(v => currentModel === 'Disk' ? toDisk(v) : v);

    displayPoints.forEach((v, i) => {
        if (i === 0) {
            pathData += `M ${v.re} ${v.im} `;
        } else {
            const p1 = vertices[i - 1];
            const p2 = vertices[i];
            const d1 = displayPoints[i - 1];
            const d2 = displayPoints[i];

            if (currentModel === 'UHP') {
                const b = engine.getGeodesic(p1, p2);
                if (b.type === 'circle') {
                    const sweep = (p2.re > p1.re) ? 1 : 0;
                    pathData += `A ${b.r} ${b.r} 0 0 ${sweep} ${d2.re} ${d2.im} `;
                } else {
                    pathData += `L ${d2.re} ${d2.im} `;
                }
            } else {
                // Poincare Disk Geodesics
                // Center C satisfies C·P1 = (|P1|^2 + 1)/2 and C·P2 = (|P2|^2 + 1)/2
                const x1 = d1.re, y1 = d1.im;
                const x2 = d2.re, y2 = d2.im;
                const det = x1 * y2 - x2 * y1;
                if (Math.abs(det) < 1e-6) {
                    pathData += `L ${x2} ${y2} `;
                } else {
                    const r1sq = x1 * x1 + y1 * y1;
                    const r2sq = x2 * x2 + y2 * y2;
                    const b1 = (r1sq + 1) / 2;
                    const b2 = (r2sq + 1) / 2;
                    const cx = (b1 * y2 - b2 * y1) / det;
                    const cy = (x1 * b2 - x2 * b1) / det;
                    const r = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
                    // Determine sweep: oriented area of triangle (0, P1, P2)
                    const sweep = (det > 0) ? 0 : 1;
                    pathData += `A ${r} ${r} 0 0 ${sweep} ${x2} ${y2} `;
                }
            }
        }
    });

    // Final closing side
    const pStart = vertices[0];
    const pEnd = vertices[vertices.length - 1];
    const dStart = displayPoints[0];
    const dEnd = displayPoints[displayPoints.length - 1];

    if (currentModel === 'UHP') {
        const b = engine.getGeodesic(pEnd, pStart);
        if (b.type === 'circle') {
            const sweep = (pStart.re > pEnd.re) ? 1 : 0;
            pathData += `A ${b.r} ${b.r} 0 0 ${sweep} ${dStart.re} ${dStart.im} `;
        } else {
            pathData += `L ${dStart.re} ${dStart.im} `;
        }
    } else {
        const x1 = dEnd.re, y1 = dEnd.im;
        const x2 = dStart.re, y2 = dStart.im;
        const det = x1 * y2 - x2 * y1;
        if (Math.abs(det) < 1e-6) {
            pathData += `L ${x2} ${y2} `;
        } else {
            const b1 = (x1 * x1 + y1 * y1 + 1) / 2;
            const b2 = (x2 * x2 + y2 * y2 + 1) / 2;
            const cx = (b1 * y2 - b2 * y1) / det;
            const cy = (x1 * b2 - x2 * b1) / det;
            const r = Math.sqrt((x1 - cx) ** 2 + (y1 - cy) ** 2);
            const sweep = (det > 0) ? 0 : 1;
            pathData += `A ${r} ${r} 0 0 ${sweep} ${x2} ${y2} `;
        }
    }

    pathData += "Z";
    if (pathData.includes("NaN") || pathData.includes("Infinity")) {
        console.warn("Invalid path data detected, clipping.");
        return "";
    }
    return pathData;
}

function toggleViz() {
    vizMode = vizMode === 'grid' ? 'tiling' : 'grid';
    const btn = document.getElementById('toggle-viz-btn');
    btn.innerText = vizMode === 'grid' ? 'Switch to Tiling' : 'Switch to Grid';

    const pairingContainer = document.getElementById('face-pairings-container');
    pairingContainer.style.display = vizMode === 'grid' ? 'none' : 'block';

    initGrid();
}

function initSidePairingButtons() {
    const container = document.getElementById('pairing-buttons');
    container.innerHTML = '';
    const labels = ['a', 'A', 'aaB', 'aBa', 'AbA', 'bAA'];

    engine.domainGens.forEach((g, i) => {
        const btn = document.createElement('button');
        btn.style.padding = '0.5rem';
        btn.style.fontSize = '0.8rem';
        btn.style.background = 'rgba(99, 102, 241, 0.2)';
        btn.style.border = '1px solid var(--accent)';
        btn.innerText = labels[i];
        btn.onclick = () => animateAction(g);
        container.appendChild(btn);
    });
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
    if (Math.abs(c) < 1e-9) {
        if (Math.abs(d - a) < 1e-9) return [{ re: Infinity, im: 0 }];
        return [{ re: b / (d - a), im: 0 }, { re: Infinity, im: 0 }];
    }
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
let currentModel = 'UHP'; // 'UHP' or 'Disk'

function updatePoints() {
    if (vizMode === 'grid') {
        points.forEach(p => {
            let displayZ = p.currentZ;
            if (currentModel === 'Disk') {
                displayZ = toDisk(p.currentZ);
            }
            p.element.setAttribute("cx", displayZ.re);
            p.element.setAttribute("cy", displayZ.im);

            // Adjust point size/visibility based on model
            if (currentModel === 'UHP') {
                p.element.setAttribute("r", 0.04);
                p.element.style.opacity = (displayZ.im < 0.05 || Math.abs(displayZ.re) > 10) ? 0 : 1;
            } else {
                p.element.setAttribute("r", 0.02);
                const magSq = displayZ.re ** 2 + displayZ.im ** 2;
                p.element.style.opacity = magSq > 0.999 ? 0 : 1;
            }
        });
    } else {
        renderTiling();
    }
}

function toggleModel() {
    if (isAnimating) return;
    isAnimating = true;

    const targetModel = currentModel === 'UHP' ? 'Disk' : 'UHP';
    const btn = document.getElementById('toggle-model-btn');
    const title = document.getElementById('model-title');
    const svg = document.getElementById('hyp-svg');

    const duration = 1000;
    let startTime = null;

    const startDisplayPos = points.map(p => {
        const cx = parseFloat(p.element.getAttribute("cx"));
        const cy = parseFloat(p.element.getAttribute("cy"));
        return { re: cx, im: cy };
    });

    const targetDisplayPos = points.map(p => {
        return targetModel === 'Disk' ? toDisk(p.currentZ) : p.currentZ;
    });

    function animateTransition(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        points.forEach((p, i) => {
            const z = {
                re: startDisplayPos[i].re + (targetDisplayPos[i].re - startDisplayPos[i].re) * eased,
                im: startDisplayPos[i].im + (targetDisplayPos[i].im - startDisplayPos[i].im) * eased
            };
            p.element.setAttribute("cx", z.re);
            p.element.setAttribute("cy", z.im);
        });

        if (progress < 1) {
            requestAnimationFrame(animateTransition);
        } else {
            currentModel = targetModel;
            isAnimating = false;
            btn.innerText = currentModel === 'UHP' ? 'Switch to Poincare Disk' : 'Switch to Upper Half Plane';
            title.innerText = `Hyperbolic Action Animator (${currentModel})`;

            if (currentModel === 'Disk') {
                svg.setAttribute("viewBox", "-1.2 -1.2 2.4 2.4");
                const diskTransform = "scale(1, 1) translate(0, 0)";
                gridGroup.setAttribute("transform", diskTransform);
                tilingGroup.setAttribute("transform", diskTransform);
                guidesGroup.setAttribute("transform", diskTransform);
            } else {
                svg.setAttribute("viewBox", "-5 0 10 5");
                const uhpTransform = "scale(1, -1) translate(0, -5)";
                gridGroup.setAttribute("transform", uhpTransform);
                tilingGroup.setAttribute("transform", uhpTransform);
                guidesGroup.setAttribute("transform", uhpTransform);
            }
            updatePoints();
            guidesGroup.innerHTML = '';
        }
    }

    requestAnimationFrame(animateTransition);
}

function applyAction() {
    if (isAnimating) return;
    const a = document.getElementById('g-a').value, b = document.getElementById('g-b').value;
    const c = document.getElementById('g-c').value, d = document.getElementById('g-d').value;
    const mat = new BigMat(a, b, c, d);
    animateAction(mat);
}

function animateAction(mat) {
    if (isAnimating) return;
    updateMatrixDisplay(mat);
    guidesGroup.innerHTML = '';

    const { type, log: X } = getMatrixLog(mat);
    const fixed = getFixedPoints(mat);
    const startPositions = points.map(p => ({ ...p.currentZ }));
    const startTilePositions = tiles.map(t => t.vertices.map(v => ({ ...v })));
    isAnimating = true;

    // Create Guides
    let guideEl = null, arrowEl = null;
    if (currentModel === 'UHP') {
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
        } else if (type === 'hyperbolic' || type === 'parabolic') {
            guideEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            guideEl.setAttribute("class", "guide-axis");
            const z1 = fixed[0], z2 = fixed[1];
            if (!z2 || z2.re === Infinity) {
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
    } else {
        const border = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        border.setAttribute("cx", 0); border.setAttribute("cy", 0); border.setAttribute("r", 1);
        border.setAttribute("fill", "none"); border.setAttribute("stroke", "rgba(99, 102, 241, 0.4)");
        border.setAttribute("stroke-width", 0.02);
        guidesGroup.appendChild(border);

        if (type === 'elliptic' && fixed.length > 0) {
            const fp = toDisk(fixed[0]);
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", fp.re); dot.setAttribute("cy", fp.im); dot.setAttribute("r", 0.03);
            dot.setAttribute("class", "fixed-point");
            guidesGroup.appendChild(dot);
        }
    }

    let startTime = null;
    const duration = 1500;
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const G_t = matrixExp(X, progress);

        points.forEach((p, i) => {
            p.currentZ = applyRawAction(G_t, startPositions[i]);
        });

        tiles.forEach((tile, i) => {
            tile.vertices = startTilePositions[i].map(v => applyRawAction(G_t, v));
        });

        updatePoints();

        if (arrowEl && currentModel === 'UHP') {
            if (type === 'elliptic') {
                const fp = fixed[0], r = 0.5, angStart = 0, angEnd = progress * Math.PI * 0.8;
                const x1 = fp.re + r * Math.cos(angStart), y1 = fp.im + r * Math.sin(angStart);
                const x2 = fp.re + r * Math.cos(angEnd), y2 = fp.im + r * Math.sin(angEnd);
                arrowEl.setAttribute("d", `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`);
            } else if (type === 'hyperbolic' || type === 'parabolic') {
                const z1 = fixed[0], z2 = fixed[1];
                if (!z2 || z2.re === Infinity) {
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
document.getElementById('toggle-model-btn').addEventListener('click', toggleModel);
document.getElementById('toggle-viz-btn').addEventListener('click', toggleViz);
document.getElementById('reset-btn').addEventListener('click', resetView);
// --- Message Listener for Presentation Control ---
window.addEventListener('message', (event) => {
    if (event.data === 'elliptic') {
        document.getElementById('g-a').value = '0';
        document.getElementById('g-b').value = '-1';
        document.getElementById('g-c').value = '1';
        document.getElementById('g-d').value = '0';
        applyAction();
    } else if (event.data === 'parabolic') {
        document.getElementById('g-a').value = '1';
        document.getElementById('g-b').value = '1';
        document.getElementById('g-c').value = '0';
        document.getElementById('g-d').value = '1';
        applyAction();
    } else if (event.data === 'hyperbolic') {
        document.getElementById('g-a').value = '2';
        document.getElementById('g-b').value = '0';
        document.getElementById('g-c').value = '0';
        document.getElementById('g-d').value = '1';
        applyAction();
    }
});

window.onload = () => {
    initGrid();
    initSidePairingButtons();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('embed') === 'true') {
        document.body.classList.add('embedded');
    }
};

// --- UHP/Disk Transformation Functions ---

// Convert Upper Half Plane (z) to Poincare Disk (w)
// w = (z - i) / (z + i)
function toDisk(z) {
    if (!z || !isFinite(z.re) || !isFinite(z.im)) return { re: 1, im: 0 };
    const denR = z.re;
    const denI = z.im + 1;
    const numR = z.re;
    const numI = z.im - 1;
    const magSq = denR * denR + denI * denI;
    if (magSq < 1e-12) return { re: 1, im: 0 };
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
    if (magSq < 1e-12) return { re: 0, im: 1000 };
    return {
        re: (numR * denR + numI * denI) / magSq,
        im: (numI * denR - numR * denI) / magSq
    };
}
