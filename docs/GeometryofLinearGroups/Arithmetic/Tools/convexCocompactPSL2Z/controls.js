function recomputeModel() {
    let p = parseInt(primeInput.value, 10);
    if (!Number.isFinite(p)) p = 3;
    p = Math.max(2, Math.floor(p));
    const parsedExtras = parseExtraMatrices(extraMatricesInput.value);

    state.p = p;
    state.depth = parseInt(depthInput.value, 10);
    state.tileCount = parseInt(tileInput.value, 10);
    state.extraMatrices = parsedExtras.parsed;
    state.extraMatrixWarnings = parsedExtras.warnings;
    state.hasExtraS = parsedExtras.hasS;
    state.showTiling = showTilingInput.checked;
    state.includeAB = includeABInput.checked;
    state.includeDiagP = includeDiagPInput.checked;
    state.fillTiles = fillTilesInput.checked;
    state.showOrbit = showOrbitInput.checked;
    state.showIOrbit = showIOrbitInput.checked;
    state.showIHull = showIHullInput.checked;
    state.showConvexCore = showConvexCoreInput.checked;
    state.showPSLOrbit = showPSLOrbitInput.checked;
    state.showGrid = showGridInput.checked;

    ensurePSLOrbitCache();
    state.model = buildSubgroupModel();

    legendItemA.style.display = state.includeAB ? 'flex' : 'none';
    legendItemB.style.display = state.includeAB ? 'flex' : 'none';
    legendItemOrbitA.style.display = (state.includeAB && state.showOrbit) ? 'flex' : 'none';
    legendItemOrbitB.style.display = (state.includeAB && state.showOrbit) ? 'flex' : 'none';

    updateStats();
    queueRender();
}

function setViewDefaults() {
    state.scale = Math.max(55, Math.min(state.width, state.height) / 5.2);
    state.offsetX = state.width * 0.5;
    state.offsetY = state.height * 0.92;
    queueRender();
}

function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    state.width = Math.max(1, Math.floor(rect.width));
    state.height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(state.width * dpr);
    canvas.height = Math.floor(state.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    queueRender();
}

function zoomAt(screenX, screenY, factor) {
    const before = fromCanvas(screenX, screenY);
    state.scale = Math.max(20, Math.min(1200, state.scale * factor));
    state.offsetX = screenX - before.re * state.scale;
    state.offsetY = screenY + before.im * state.scale;
    queueRender();
}

canvas.addEventListener('pointerdown', (event) => {
    state.dragging = true;
    state.dragPx = 0;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.dragPx += Math.hypot(dx, dy);
    state.offsetX += dx;
    state.offsetY += dy;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    queueRender();
});

const endDrag = () => {
    state.dragging = false;
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', endDrag);
canvas.addEventListener('click', (event) => {
    if (state.dragPx > 5) return;
    handleOrbitClick(event.clientX, event.clientY);
});

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    zoomAt(x, y, factor);
}, { passive: false });

window.addEventListener('resize', resize);

applyBtn.addEventListener('click', recomputeModel);

primeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        recomputeModel();
    }
});

depthInput.addEventListener('input', () => {
    depthVal.textContent = depthInput.value;
    recomputeModel();
});

tileInput.addEventListener('input', () => {
    tileVal.textContent = tileInput.value;
    state.tileCount = parseInt(tileInput.value, 10);
    state.tilingCacheCount = -1;
    state.pslOrbitCacheCount = -1;
    recomputeModel();
});

extraMatricesInput.addEventListener('input', recomputeModel);
addSBtn.addEventListener('click', () => {
    const appended = appendExtraMatrixIfNew(S);
    if (appended.added) {
        setClickStatus('Inserted S into extra generators.');
    } else {
        setClickStatus('S is already present in extras (up to sign).');
    }
    recomputeModel();
});
clearExtrasBtn.addEventListener('click', () => {
    extraMatricesInput.value = '';
    setClickStatus('Cleared extra generators.');
    recomputeModel();
});

showTilingInput.addEventListener('change', recomputeModel);
includeABInput.addEventListener('change', recomputeModel);
includeDiagPInput.addEventListener('change', recomputeModel);
fillTilesInput.addEventListener('change', recomputeModel);
showOrbitInput.addEventListener('change', recomputeModel);
showIOrbitInput.addEventListener('change', recomputeModel);
showIHullInput.addEventListener('change', recomputeModel);
showConvexCoreInput.addEventListener('change', recomputeModel);
showPSLOrbitInput.addEventListener('change', recomputeModel);
showGridInput.addEventListener('change', recomputeModel);

resetViewBtn.addEventListener('click', setViewDefaults);
zoomInBtn.addEventListener('click', () => zoomAt(state.width * 0.5, state.height * 0.5, 1.14));
zoomOutBtn.addEventListener('click', () => zoomAt(state.width * 0.5, state.height * 0.5, 0.88));

depthVal.textContent = depthInput.value;
tileVal.textContent = tileInput.value;

resize();
setViewDefaults();
recomputeModel();
