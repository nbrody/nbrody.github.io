function drawAxis(axis, strokeStyle, width, alpha = 1, label = '') {
    if (!axis) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();

    if (axis.type === 'vertical') {
        const yTop = yVisibleMax();
        const c0 = toCanvas({ re: axis.x, im: 0 });
        const c1 = toCanvas({ re: axis.x, im: yTop });
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c1.x, c1.y);
    } else {
        const n = 64;
        for (let i = 0; i <= n; i += 1) {
            const t = i / n;
            const theta = Math.PI * (1 - t);
            const z = {
                re: axis.center + axis.radius * Math.cos(theta),
                im: axis.radius * Math.sin(theta)
            };
            const c = toCanvas(z);
            if (i === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
        }
    }

    ctx.stroke();

    if (label) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = strokeStyle;
        ctx.font = '12px "IBM Plex Mono"';
        let anchor;
        if (axis.type === 'vertical') {
            anchor = toCanvas({ re: axis.x + 0.05, im: yVisibleMax() * 0.7 });
        } else {
            anchor = toCanvas({ re: axis.center, im: axis.radius + 0.07 });
        }
        ctx.fillText(label, anchor.x + 4, anchor.y - 4);
    }

    ctx.restore();
}

function drawOrbitIPoints(points) {
    if (!points || points.length === 0) return;

    for (const point of points) {
        const c = toCanvas(point.z);
        if (c.x < -12 || c.x > state.width + 12 || c.y < -12 || c.y > state.height + 12) {
            continue;
        }

        const depthScale = Math.min(point.depth, 8);
        const radius = Math.max(1.3, 3.2 - 0.28 * depthScale);
        const alpha = Math.max(0.25, 0.9 - 0.08 * depthScale);

        ctx.beginPath();
        ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(142, 214, 255, ${alpha})`;
        ctx.fill();
    }
}

function drawPSLOrbitPoints(points) {
    if (!points || points.length === 0) return;

    for (const point of points) {
        const c = toCanvas(point.z);
        if (c.x < -12 || c.x > state.width + 12 || c.y < -12 || c.y > state.height + 12) {
            continue;
        }

        const depthScale = Math.min(point.depth, 10);
        const alpha = Math.max(0.28, 0.86 - 0.055 * depthScale);

        if (point.kind === 'i') {
            ctx.beginPath();
            ctx.arc(c.x, c.y, 2.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(120, 181, 255, ${alpha})`;
            ctx.fill();
        } else {
            const r = 2.6;
            ctx.beginPath();
            ctx.moveTo(c.x, c.y - r);
            ctx.lineTo(c.x + r, c.y);
            ctx.lineTo(c.x, c.y + r);
            ctx.lineTo(c.x - r, c.y);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 142, 194, ${alpha})`;
            ctx.fill();
        }
    }
}

function drawOrbitIHull(vertices) {
    if (!vertices || vertices.length < 3) return;

    ctx.save();
    const c0 = toCanvas(vertices[0]);
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);

    for (let i = 1; i < vertices.length; i += 1) {
        appendHyperbolicSegment(ctx, vertices[i - 1], vertices[i], 18);
    }
    appendHyperbolicSegment(ctx, vertices[vertices.length - 1], vertices[0], 18);
    ctx.closePath();

    ctx.fillStyle = 'rgba(156, 242, 222, 0.14)';
    ctx.strokeStyle = 'rgba(156, 242, 222, 0.9)';
    ctx.lineWidth = 2.1;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawConvexCore(vertices) {
    if (!vertices || vertices.length < 3) return;

    ctx.save();
    const c0 = toCanvas(vertices[0]);
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);

    for (let i = 1; i < vertices.length; i += 1) {
        appendHyperbolicSegment(ctx, vertices[i - 1], vertices[i], 18);
    }
    appendHyperbolicSegment(ctx, vertices[vertices.length - 1], vertices[0], 18);
    ctx.closePath();

    ctx.fillStyle = 'rgba(247, 164, 76, 0.22)';
    ctx.strokeStyle = 'rgba(247, 164, 76, 0.95)';
    ctx.lineWidth = 2.4;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawTile(tile, isFundamental = false) {
    const verts = FUNDAMENTAL_VERTICES.map(v => mobiusComplex(tile.m, v));

    if (verts.some(v => !Number.isFinite(v.re) || !Number.isFinite(v.im))) {
        return;
    }
    if (verts.some(v => v.im < -1e-8)) {
        return;
    }

    const c0 = toCanvas(verts[0]);
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    appendHyperbolicSegment(ctx, verts[0], verts[1], 8);
    appendHyperbolicSegment(ctx, verts[1], verts[2], 8);
    appendHyperbolicSegment(ctx, verts[2], verts[3], 8);
    appendHyperbolicSegment(ctx, verts[3], verts[0], 8);
    ctx.closePath();

    if (state.fillTiles) {
        const alpha = isFundamental ? 0.22 : (0.03 + 0.01 * (tile.depth % 4));
        const hue = 192 + (tile.depth * 11) % 28;
        ctx.fillStyle = `hsla(${hue}, 38%, 52%, ${alpha})`;
        ctx.fill();
    }

    ctx.strokeStyle = isFundamental ? 'rgba(218, 244, 255, 0.8)' : 'rgba(210, 237, 255, 0.16)';
    ctx.lineWidth = isFundamental ? 1.5 : 0.7;
    ctx.stroke();
}


function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, state.height);
    grad.addColorStop(0, '#102b43');
    grad.addColorStop(0.48, '#07172a');
    grad.addColorStop(1, '#030911');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, state.width, state.height);

    ctx.save();
    ctx.strokeStyle = 'rgba(121, 194, 235, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 20; y < state.height; y += 26) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(state.width, y);
        ctx.stroke();
    }
    ctx.restore();
}

function drawGuideGrid() {
    if (!state.showGrid) return;

    const left = fromCanvas(0, 0).re;
    const right = fromCanvas(state.width, 0).re;
    const topY = fromCanvas(0, 0).im;

    ctx.save();

    ctx.strokeStyle = 'rgba(155, 205, 232, 0.10)';
    ctx.lineWidth = 1;
    const xStart = Math.floor(left);
    const xEnd = Math.ceil(right);
    for (let x = xStart; x <= xEnd; x += 1) {
        const c0 = toCanvas({ re: x, im: 0 });
        const c1 = toCanvas({ re: x, im: topY });
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c1.x, c1.y);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(155, 205, 232, 0.08)';
    const yLines = Math.min(18, Math.floor(topY));
    for (let y = 1; y <= yLines; y += 1) {
        const c0 = toCanvas({ re: left, im: y });
        const c1 = toCanvas({ re: right, im: y });
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y);
        ctx.lineTo(c1.x, c1.y);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(245, 252, 255, 0.9)';
    ctx.lineWidth = 2;
    const a0 = toCanvas({ re: left, im: 0 });
    const a1 = toCanvas({ re: right, im: 0 });
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.stroke();

    ctx.restore();
}

function render() {
    state.renderQueued = false;
    drawBackground();
    drawGuideGrid();

    if (state.showTiling) {
        ensureTilingCache();
        for (let i = 0; i < state.tilingCache.length; i += 1) {
            drawTile(state.tilingCache[i], i === 0);
        }
    }

    const model = state.model;
    if (!model) return;

    if (state.showPSLOrbit) {
        ensurePSLOrbitCache();
        drawPSLOrbitPoints(state.pslOrbitCache);
    }

    if (state.showOrbit) {
        for (const mapped of model.orbitAxes) {
            if (mapped.source === 'a') {
                drawAxis(mapped.axis, 'rgba(255, 178, 63, 0.70)', 1.1, 0.48 - 0.03 * Math.min(mapped.depth, 8));
            } else {
                drawAxis(mapped.axis, 'rgba(88, 230, 182, 0.70)', 1.1, 0.48 - 0.03 * Math.min(mapped.depth, 8));
            }
        }
    }

    if (state.showIHull) {
        drawOrbitIHull(model.orbitIHull);
    }

    if (state.showConvexCore) {
        drawConvexCore(model.convexCore);
    }

    if (state.showIOrbit) {
        drawOrbitIPoints(model.orbitI);
    }

    if (state.includeAB) {
        drawAxis(model.axisA, '#ffb23f', 3.1, 1, 'axis(a)');
        drawAxis(model.axisB, '#58e6b6', 3.1, 1, 'axis(b)');
    }
}

function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(render);
}
