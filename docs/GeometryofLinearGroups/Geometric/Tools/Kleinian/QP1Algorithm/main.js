const runBtn = document.getElementById('runBtn');
const heightRange = document.getElementById('heightRange');
const heightInput = document.getElementById('heightInput');
const maxStepsInput = document.getElementById('maxSteps');
const resultsBody = document.getElementById('resultsBody') ;
const totalCountVal = document.getElementById('totalCount');
const terminatedCountVal = document.getElementById('terminatedCount');
const avgStepsVal = document.getElementById('avgSteps');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const canvas = document.getElementById('vizCanvas');
const ctx = canvas.getContext('2d');
const adicCanvas = document.getElementById('adicCanvas');
const adicCtx = adicCanvas.getContext('2d');
const hypCanvas = document.getElementById('hypCanvas');
const hypCtx = hypCanvas.getContext('2d');
const hoverInfo = document.getElementById('hoverInfo');
const filterStepsInput = document.getElementById('filterSteps');
const showEdgesBtn = document.getElementById('showEdges');
const targetPathInput = document.getElementById('targetPath');
const exploreBtn = document.getElementById('exploreBtn');
let currentPoints = [];
let hypZoom = 1.0;
let hypOffsetX = 0;
let isPanning = false;
let startPanX = 0;

heightRange.oninput = () => heightInput.value = heightRange.value;
heightInput.oninput = () => heightRange.value = heightInput.value;

function getVizCoords(p, q, N) {
    const size = canvas.width;
    const center = size / 2;
    const scale = (size * 0.45) / (N + 1);
    return {
        x: center + Number(p) * scale,
        y: center - Number(q) * scale
    };
}

function getAdicCoords(p, q) {
    const r = new Rational(p, q);
    const xReal = r.q === 0n ? (r.p < 0n ? -10 : 10) : Number(r.p) / Number(r.q);
    const yAdic = r.get2AdicHeight();
    const aSize = adicCanvas.width;
    const aScaleX = aSize / 6;
    const aScaleY = aSize / 15;
    return {
        x: aSize / 2 + xReal * aScaleX,
        y: aSize - 50 - yAdic * aScaleY
    };
}

function getHypCoords(p, q) {
    const r = new Rational(p, q);
    const x = r.q === 0n ? 0 : Number(r.p) / Number(r.q);
    const size = hypCanvas.width;
    const h = hypCanvas.height;
    const scaleX = (size / 8) * hypZoom;

    return {
        x: size / 2 + (x * scaleX) + hypOffsetX,
        y: h - 50
    };
}

function drawGeodesic(p1, q1, p2, q2, color, alpha) {
    const r1 = new Rational(p1, q1);
    const r2 = new Rational(p2, q2);

    const size = hypCanvas.width;
    const h = hypCanvas.height;
    const scaleX = (size / 8) * hypZoom;
    const centerScreen = size / 2 + hypOffsetX;

    hypCtx.strokeStyle = color;
    hypCtx.globalAlpha = alpha;
    hypCtx.lineWidth = alpha > 0.5 ? 2 : 1;

    if (r1.isInf() || r2.isInf()) {
        const finP = r1.isInf() ? p2 : p1;
        const finQ = r1.isInf() ? q2 : q1;
        const coords = getHypCoords(finP, finQ);
        hypCtx.beginPath();
        hypCtx.moveTo(coords.x, coords.y);
        hypCtx.lineTo(coords.x, 0);
        hypCtx.stroke();
    } else {
        const x1 = Number(p1) / Number(q1);
        const x2 = Number(p2) / Number(q2);
        const center = (x1 + x2) / 2;
        const radius = Math.abs(x1 - x2) / 2;

        const cx = centerScreen + center * scaleX;
        const cy = h - 50;
        const r = radius * scaleX;

        // Don't draw if completely off-screen
        if (cx + r < 0 || cx - r > size) return;

        hypCtx.beginPath();
        hypCtx.arc(cx, cy, r, Math.PI, 0, false);
        hypCtx.stroke();
    }
}

function drawPath(path, color, alpha, N) {
    if (path.length < 2) return;

    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = alpha > 0.5 ? 2 : 1;
    ctx.beginPath();
    let start = getVizCoords(path[0].p, path[0].q, N);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < path.length; i++) {
        let p = getVizCoords(path[i].p, path[i].q, N);
        ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    adicCtx.strokeStyle = color;
    adicCtx.globalAlpha = alpha;
    adicCtx.lineWidth = alpha > 0.5 ? 2 : 1;
    adicCtx.beginPath();
    let aStart = getAdicCoords(path[0].p, path[0].q);
    adicCtx.moveTo(aStart.x, aStart.y);
    for (let i = 1; i < path.length; i++) {
        let p = getAdicCoords(path[i].p, path[i].q);
        adicCtx.lineTo(p.x, p.y);
    }
    adicCtx.stroke();

    // Hyperbolic path
    for (let i = 0; i < path.length - 1; i++) {
        drawGeodesic(path[i].p, path[i].q, path[i + 1].p, path[i + 1].q, color, alpha);
    }

    ctx.globalAlpha = 1.0;
    adicCtx.globalAlpha = 1.0;
    hypCtx.globalAlpha = 1.0;
}

function drawPoint(p, q, status, xCount, N, isFiltered = false) {
    const pt = getVizCoords(p, q, N);
    const apt = getAdicCoords(p, q);

    const getColor = () => {
        if (status === 'Terminated') {
            const hue = Math.max(120, 240 - xCount * 10);
            return `hsl(${hue}, 80%, 60%)`;
        }
        return '#f87171';
    };

    const color = getColor();

    // Lattice View
    const size = canvas.width;
    const scale = (size * 0.45) / (N + 1);
    ctx.fillStyle = isFiltered ? '#fde047' : color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isFiltered ? Math.max(2, scale * 0.6) : Math.max(1, scale * 0.4), 0, Math.PI * 2);
    ctx.fill();

    // 2-adic View
    adicCtx.fillStyle = isFiltered ? '#fde047' : color;
    adicCtx.beginPath();
    adicCtx.arc(apt.x, apt.y, isFiltered ? 5 : 3, 0, Math.PI * 2);
    adicCtx.fill();
}

// Global drawing helper that doesn't rely on scale being in scope
function drawPointFixed(p, q, status, xCount, N, isFiltered = false) {
    const pt = getVizCoords(p, q, N);
    const apt = getAdicCoords(p, q);
    const size = canvas.width;
    const scale = (size * 0.45) / (N + 1);

    const getColor = () => {
        if (status === 'Terminated') {
            const hue = Math.max(120, 240 - xCount * 10);
            return `hsl(${hue}, 80%, 60%)`;
        }
        return '#f87171';
    };
    const color = getColor();

    ctx.fillStyle = isFiltered ? '#fde047' : color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, isFiltered ? Math.max(3, scale * 0.8) : Math.max(1, scale * 0.4), 0, Math.PI * 2);
    ctx.fill();

    adicCtx.fillStyle = isFiltered ? '#fde047' : color;
    adicCtx.beginPath();
    adicCtx.arc(apt.x, apt.y, isFiltered ? 6 : 3, 0, Math.PI * 2);
    adicCtx.fill();
}

let manualExploredPath = null;

function clearCanvases() {
    [ctx, adicCtx, hypCtx].forEach((c, idx) => {
        const can = [canvas, adicCanvas, hypCanvas][idx];
        c.clearRect(0, 0, can.width, can.height);
        c.strokeStyle = 'rgba(255,255,255,0.1)';
        c.lineWidth = 1;

        if (idx === 0) {
            c.beginPath();
            c.moveTo(0, can.height / 2); c.lineTo(can.width, can.height / 2);
            c.moveTo(can.width / 2, 0); c.lineTo(can.width / 2, can.height);
            c.stroke();
        } else if (idx === 1) {
            c.beginPath();
            c.moveTo(0, can.height - 50); c.lineTo(can.width, can.height - 50);
            c.moveTo(can.width / 2, 0); c.lineTo(can.width / 2, can.height);
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,0.3)';
            const sX = can.width / 6;
            c.fillText('0', can.width / 2 + 5, can.height - 35);
            c.fillText('1', can.width / 2 + sX - 5, can.height - 35);
            c.fillText('-1', can.width / 2 - sX - 5, can.height - 35);
            c.fillText('v₂(q)', 10, 20);
        } else {
            // Hyperbolic axes
            c.beginPath();
            c.moveTo(0, can.height - 50); c.lineTo(can.width, can.height - 50);
            c.stroke();

            c.fillStyle = 'rgba(255,255,255,0.3)';
            const sX = (can.width / 8) * hypZoom;
            const center = can.width / 2 + hypOffsetX;

            // Draw integer tick marks
            const startIdx = Math.floor((-center) / sX);
            const endIdx = Math.ceil((can.width - center) / sX);

            for (let i = startIdx; i <= endIdx; i++) {
                const tx = center + i * sX;
                c.fillText(i.toString(), tx - 5, can.height - 35);
                c.beginPath();
                c.moveTo(tx, can.height - 50);
                c.lineTo(tx, can.height - 55);
                c.stroke();
            }
            c.fillText('∞', center - 5, 20);
        }
    });
}

hypCanvas.onwheel = (e) => {
    e.preventDefault();
    const rect = hypCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const canvasX = mouseX * (hypCanvas.width / rect.width);

    // Zoom around mouse cursor
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(100, hypZoom * zoomFactor));

    // Adjust offset to keep mouse point fixed
    const xBefore = (canvasX - (hypCanvas.width / 2) - hypOffsetX) / hypZoom;
    hypZoom = newZoom;
    hypOffsetX = canvasX - (hypCanvas.width / 2) - (xBefore * hypZoom);

    updateDisplay();
};

hypCanvas.onmousedown = (e) => {
    isPanning = true;
    startPanX = e.clientX - hypOffsetX;
    hypCanvas.style.cursor = 'grabbing';
};

window.onmousemove = (e) => {
    if (isPanning) {
        hypOffsetX = e.clientX - startPanX;
        updateDisplay();
    }
};

window.onmouseup = () => {
    isPanning = false;
    hypCanvas.style.cursor = 'crosshair';
};

function updateDisplay(hoveredPt = null) {
    resultsBody.innerHTML = '';
    const filter = filterStepsInput.value === '' ? null : parseInt(filterStepsInput.value);
    const N = parseInt(heightInput.value);
    const showEdges = showEdgesBtn.checked;

    clearCanvases();

    // 1. Draw Background Edges
    if (showEdges) {
        currentPoints.forEach(pt => {
            const matchesFilter = filter === null || pt.xCount === filter;
            if (matchesFilter) {
                drawPath(pt.path, 'rgba(255,255,255,0.1)', 0.1, N);
            }
        });
    }

    // 2. Draw Points
    currentPoints.forEach(pt => {
        const matchesFilter = filter === null || pt.xCount === filter;
        drawPointFixed(pt.p, pt.q, pt.status, pt.xCount, N, filter !== null && matchesFilter);
    });

    // 3. Highlight Hovered Path
    if (hoveredPt) {
        drawPath(hoveredPt.path, '#fde047', 1.0, N);
        drawPointFixed(hoveredPt.p, hoveredPt.q, hoveredPt.status, hoveredPt.xCount, N, true);
    }

    // 4. Draw Manually Explored Path
    if (manualExploredPath) {
        drawPath(manualExploredPath.path, '#3b82f6', 1.0, N);
        drawPointFixed(manualExploredPath.p, manualExploredPath.q, manualExploredPath.status, manualExploredPath.xCount, N, true);
    }

    const filteredPoints = filter === null ? currentPoints : currentPoints.filter(pt => pt.xCount === filter);
    const displayResults = [...filteredPoints].sort((a, b) => Number(a.height - b.height)).slice(0, 500);

    displayResults.forEach(res => {
        const tr = document.createElement('tr');
        const rStart = new Rational(res.p, res.q);
        const pOverQ = rStart.toString();
        const pathStrs = res.path.map(p => new Rational(p.p, p.q).toString());
        tr.innerHTML = `<td>${pOverQ}</td><td>${res.height}</td><td><span class="status-pill status-${res.status === 'Terminated' ? 'success' : 'fail'}">${res.status}</span></td><td>${res.xCount}</td><td class="path-display" title="${pathStrs.join(' → ')}">${pathStrs.join(' → ')}</td>`;
        resultsBody.appendChild(tr);
    });

    document.getElementById('statusText').innerText = filter === null ?
        `Showing all ${currentPoints.length} points.` :
        `Showing ${filteredPoints.length} points with ${filter} steps.`;
}

async function simulate() {
    const N = parseInt(heightInput.value);
    const maxSteps = parseInt(maxStepsInput.value);
    runBtn.disabled = true;
    progressBar.style.display = 'block';

    clearCanvases();

    const rationals = enumRationals(N);
    totalCountVal.innerText = rationals.length;
    let terminated = 0, totalXSteps = 0;
    currentPoints = [];
    const chunkSize = 150;
    for (let i = 0; i < rationals.length; i += chunkSize) {
        const chunk = rationals.slice(i, i + chunkSize);
        for (const r of chunk) {
            const res = runAlgorithm(r.p, r.q, maxSteps);
            const point = { p: r.p, q: r.q, height: new Rational(r.p, r.q).getHeight(), ...res };
            currentPoints.push(point);
            drawPointFixed(r.p, r.q, res.status, res.xCount, N);
            if (res.status === 'Terminated') { terminated++; totalXSteps += res.xCount; }
        }
        progressFill.style.width = `${((i + chunk.length) / rationals.length) * 100}%`;
        await new Promise(r => setTimeout(r, 0));
    }

    updateDisplay();

    terminatedCountVal.innerText = terminated;
    avgStepsVal.innerText = terminated > 0 ? (totalXSteps / terminated).toFixed(2) : '0';
    progressBar.style.display = 'none';
    runBtn.disabled = false;
}

function handleMouseMove(e, isAdic) {
    if (currentPoints.length === 0) return;
    const can = isAdic ? adicCanvas : canvas;
    const rect = can.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const size = rect.width;

    let best = null;
    let minDist = 20; // Pixels

    currentPoints.forEach(pt => {
        let coords = isAdic ? getAdicCoords(pt.p, pt.q) : getVizCoords(pt.p, pt.q, parseInt(heightInput.value));
        // Simple pixel distance
        const dx = (coords.x / (can.width / size)) - x;
        const dy = (coords.y / (can.height / size)) - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
            minDist = dist;
            best = pt;
        }
    });

    if (best) {
        hoverInfo.innerText = `${new Rational(best.p, best.q).toString()} | ${best.status} | X-Steps: ${best.xCount}`;
        updateDisplay(best);
    } else {
        hoverInfo.innerText = "Hover over a point";
        updateDisplay(null);
    }
}

canvas.onmousemove = (e) => handleMouseMove(e, false);
adicCanvas.onmousemove = (e) => handleMouseMove(e, true);

filterStepsInput.oninput = () => updateDisplay();
showEdgesBtn.onchange = () => updateDisplay();
runBtn.onclick = simulate;

exploreBtn.onclick = () => {
    const val = targetPathInput.value.trim();
    if (!val) return;

    let p, q;
    if (val.includes('/')) {
        const parts = val.split('/');
        p = BigInt(parts[0]);
        q = BigInt(parts[1]);
    } else {
        p = BigInt(val);
        q = 1n;
    }

    const maxSteps = parseInt(maxStepsInput.value);
    const res = runAlgorithm(p, q, maxSteps);
    manualExploredPath = { p, q, ...res };
    updateDisplay();
};

setTimeout(simulate, 500);
