/* ================================================================
   Drawing Module — Canvas rendering for the Circle Limit IV tiling
   
   Renders the hyperbolic tessellation with angel/devil figures,
   geodesic arcs, fundamental domain highlights, and animations.
   
   Key design: drawScene() accepts an optional `viewTransform`
   Möbius transform that is applied to every tile vertex at render
   time. This is how animations work: the stored tile data never
   changes during an animation — only the viewTransform varies.
   ================================================================ */

// ── Canvas & Display State ───────────────────────────────────────

const Display = {
    canvas: null,
    ctx: null,
    W: 0, H: 0,
    cx: 0, cy: 0,
    R: 0,
    dpr: 1,
    showColor: true,
    showWireframe: false,
    showFundamental: false,
    time: 0
};

// ── Color Palettes ───────────────────────────────────────────────

const Palette = {
    angel:  { outline: 'rgba(217, 119, 6, 0.35)' },
    devil:  { outline: 'rgba(99, 102, 241, 0.3)' },
    diskBorder: 'rgba(124, 138, 255, 0.4)'
};

// ── Initialization ───────────────────────────────────────────────

function initDisplay() {
    Display.canvas = document.getElementById('canvas');
    Display.ctx = Display.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    Display.dpr = dpr;
    const rect = Display.canvas.parentElement.getBoundingClientRect();
    Display.W = rect.width;
    Display.H = rect.height;
    Display.canvas.width = Display.W * dpr;
    Display.canvas.height = Display.H * dpr;
    Display.canvas.style.width  = Display.W + 'px';
    Display.canvas.style.height = Display.H + 'px';
    Display.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Display.cx = Display.W / 2;
    Display.cy = Display.H / 2;
    Display.R  = Math.min(Display.W, Display.H) * 0.44;
}

// ── Coordinate conversions ──────────────────────────────────────

function toPixel(z) {
    return [
        Display.cx + z[0] * Display.R,
        Display.cy - z[1] * Display.R
    ];
}

// ── Background ──────────────────────────────────────────────────

function drawDiskBackground() {
    const { ctx, W, H, cx, cy, R } = Display;
    
    ctx.fillStyle = '#050810';
    ctx.fillRect(0, 0, W, H);
    
    // Ambient glow
    const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
    g1.addColorStop(0, 'rgba(99, 102, 241, 0.04)');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    
    // Disk interior
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g2.addColorStop(0, '#0c1020');
    g2.addColorStop(1, '#060a14');
    ctx.fillStyle = g2;
    ctx.fill();
    
    // Disk border
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.strokeStyle = Palette.diskBorder;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Outer glow
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(124, 138, 255, 0.08)';
    ctx.lineWidth = 6;
    ctx.stroke();
}

// ── Geodesic path tracing ───────────────────────────────────────

/**
 * Trace a tile polygon path using geodesic subdivisions.
 * `verts` are already in the correct (possibly transformed) frame.
 */
function traceTilePath(ctx, verts, subdivs) {
    const n = verts.length;
    const p0 = toPixel(verts[0]);
    ctx.moveTo(p0[0], p0[1]);
    
    for (let i = 0; i < n; i++) {
        const z1 = verts[i];
        const z2 = verts[(i + 1) % n];
        for (let j = 1; j <= subdivs; j++) {
            const t = j / subdivs;
            const z = geodesicInterp(z1, z2, t);
            const p = toPixel(z);
            ctx.lineTo(p[0], p[1]);
        }
    }
    ctx.closePath();
}

function adaptiveSubdivisions(pixSize) {
    if (pixSize > 100) return 14;
    if (pixSize > 40)  return 8;
    if (pixSize > 15)  return 5;
    return 2;
}

// ── Tile Drawing ─────────────────────────────────────────────────

function drawTile(verts, center, colorIndex, depth, time) {
    const { ctx, R } = Display;
    
    // Tile pixel size for LOD
    const pc = toPixel(center);
    const pv = toPixel(verts[0]);
    const pixSize = Math.hypot(pc[0]-pv[0], pc[1]-pv[1]);
    
    if (pixSize < 1.5) return;
    
    const subdivs = adaptiveSubdivisions(pixSize);
    const isAngel = colorIndex === 0;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(Display.cx, Display.cy, R - 0.5, 0, 2 * Math.PI);
    ctx.clip();
    
    if (Display.showColor) {
        // ── Gradient fill ──
        const grad = ctx.createRadialGradient(
            pc[0], pc[1], 0, pc[0], pc[1], pixSize * 1.3
        );
        const pulse = 0.012 * Math.sin(time * 0.0008 + depth * 0.7);
        
        if (isAngel) {
            grad.addColorStop(0,   `rgba(254,252,232,${0.97+pulse})`);
            grad.addColorStop(0.4, `rgba(254,243,199,${0.92+pulse})`);
            grad.addColorStop(0.8, `rgba(253,230,138,${0.85+pulse})`);
            grad.addColorStop(1,   `rgba(252,211,77,${0.75+pulse})`);
        } else {
            grad.addColorStop(0,   `rgba(49,46,129,${0.97+pulse})`);
            grad.addColorStop(0.35,`rgba(30,27,75,${0.93+pulse})`);
            grad.addColorStop(0.7, `rgba(22,20,60,${0.88+pulse})`);
            grad.addColorStop(1,   `rgba(15,13,50,${0.82+pulse})`);
        }
        
        ctx.beginPath();
        traceTilePath(ctx, verts, subdivs);
        ctx.fillStyle = grad;
        ctx.fill();
        
        // Figure silhouette
        if (pixSize > 12) {
            drawFigure(ctx, verts, center, isAngel, pixSize, time);
        }
        
        // Border
        ctx.beginPath();
        traceTilePath(ctx, verts, subdivs);
        ctx.strokeStyle = isAngel ? Palette.angel.outline : Palette.devil.outline;
        ctx.lineWidth = pixSize > 20 ? 1.5 : 0.5;
        ctx.stroke();
    } else {
        // Wireframe
        ctx.beginPath();
        traceTilePath(ctx, verts, subdivs);
        ctx.strokeStyle = isAngel
            ? 'rgba(253,230,138,0.45)'
            : 'rgba(99,102,241,0.4)';
        ctx.lineWidth = pixSize > 20 ? 1.2 : 0.6;
        ctx.stroke();
    }
    
    ctx.restore();
}

// ── Figure silhouettes ──────────────────────────────────────────

function drawFigure(ctx, verts, center, isAngel, size, time) {
    const pc = toPixel(center);
    const s = size * 0.26;
    if (s < 3) return;
    
    const pv0 = toPixel(verts[0]);
    const angle = Math.atan2(pv0[1]-pc[1], pv0[0]-pc[0]);
    
    ctx.save();
    ctx.translate(pc[0], pc[1]);
    ctx.rotate(angle - Math.PI/2);
    
    const alpha = Math.min(1, s / 15);
    const wingFlap = Math.sin(time * 0.0015 + (isAngel ? 0 : Math.PI)) * 0.1;
    
    if (isAngel) {
        // Wings
        ctx.fillStyle = `rgba(252,211,77,${0.35*alpha})`;
        ctx.beginPath();
        ctx.moveTo(0, -s*0.05);
        ctx.bezierCurveTo(-s*(0.4+wingFlap),-s*0.4, -s*(0.7+wingFlap),-s*0.25, -s*0.6,s*0.15);
        ctx.bezierCurveTo(-s*0.35,s*0.05, -s*0.15,0, 0,s*0.05);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -s*0.05);
        ctx.bezierCurveTo(s*(0.4+wingFlap),-s*0.4, s*(0.7+wingFlap),-s*0.25, s*0.6,s*0.15);
        ctx.bezierCurveTo(s*0.35,s*0.05, s*0.15,0, 0,s*0.05);
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.ellipse(0,s*0.08, s*0.18,s*0.4, 0,0,2*Math.PI);
        ctx.fillStyle = `rgba(255,251,235,${0.45*alpha})`;
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(0,-s*0.28, s*0.11, 0,2*Math.PI);
        ctx.fillStyle = `rgba(254,243,199,${0.55*alpha})`;
        ctx.fill();
        // Halo
        if (s > 8) {
            ctx.beginPath();
            ctx.ellipse(0,-s*0.42, s*0.16,s*0.06, 0,0,2*Math.PI);
            ctx.strokeStyle = `rgba(245,158,11,${0.5*alpha})`;
            ctx.lineWidth = Math.max(0.5, s*0.03);
            ctx.stroke();
        }
    } else {
        // Bat wings
        ctx.fillStyle = `rgba(55,48,163,${0.4*alpha})`;
        ctx.beginPath();
        ctx.moveTo(-s*0.04,-s*0.08);
        ctx.bezierCurveTo(-s*(0.35+wingFlap),-s*0.45, -s*(0.65+wingFlap),-s*0.35, -s*0.72,-s*0.05);
        ctx.lineTo(-s*0.55,s*0.02); ctx.lineTo(-s*0.5,-s*0.1);
        ctx.lineTo(-s*0.38,s*0.04); ctx.lineTo(-s*0.28,-s*0.05);
        ctx.lineTo(-s*0.15,s*0.02); ctx.lineTo(0,s*0.04);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s*0.04,-s*0.08);
        ctx.bezierCurveTo(s*(0.35+wingFlap),-s*0.45, s*(0.65+wingFlap),-s*0.35, s*0.72,-s*0.05);
        ctx.lineTo(s*0.55,s*0.02); ctx.lineTo(s*0.5,-s*0.1);
        ctx.lineTo(s*0.38,s*0.04); ctx.lineTo(s*0.28,-s*0.05);
        ctx.lineTo(s*0.15,s*0.02); ctx.lineTo(0,s*0.04);
        ctx.fill();
        // Body
        ctx.beginPath();
        ctx.ellipse(0,s*0.08, s*0.17,s*0.38, 0,0,2*Math.PI);
        ctx.fillStyle = `rgba(67,56,202,${0.35*alpha})`;
        ctx.fill();
        // Head
        ctx.beginPath();
        ctx.arc(0,-s*0.26, s*0.1, 0,2*Math.PI);
        ctx.fillStyle = `rgba(49,46,129,${0.5*alpha})`;
        ctx.fill();
        // Horns
        if (s > 8) {
            ctx.strokeStyle = `rgba(129,120,255,${0.5*alpha})`;
            ctx.lineWidth = Math.max(0.5, s*0.035);
            ctx.beginPath(); ctx.moveTo(-s*0.07,-s*0.34);
            ctx.quadraticCurveTo(-s*0.12,-s*0.48, -s*0.2,-s*0.52); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s*0.07,-s*0.34);
            ctx.quadraticCurveTo(s*0.12,-s*0.48, s*0.2,-s*0.52); ctx.stroke();
        }
        // Glowing eyes
        if (s > 15) {
            const eg = 0.4 + 0.2*Math.sin(time*0.003);
            ctx.fillStyle = `rgba(251,191,36,${eg*alpha})`;
            ctx.beginPath(); ctx.arc(-s*0.04,-s*0.27, s*0.02, 0,2*Math.PI); ctx.fill();
            ctx.beginPath(); ctx.arc( s*0.04,-s*0.27, s*0.02, 0,2*Math.PI); ctx.fill();
        }
    }
    
    ctx.restore();
}

// ── Fundamental Domain ──────────────────────────────────────────

function drawFundamentalDomain(time, viewM) {
    if (!Display.showFundamental) return;
    
    const { ctx, R } = Display;
    const verts = Tess.centralVertices;
    
    // Fundamental triangle: center, vertex 0, midpoint of edge 0
    const O = [0, 0];
    const V = verts[0];
    const M = hypMidpoint(verts[0], verts[1]);
    
    // Apply accumulated transform + current view
    const fullM = viewM;
    const tO = mobius(fullM, mobius(State.currentTransform, O));
    const tV = mobius(fullM, mobius(State.currentTransform, V));
    const tM = mobius(fullM, mobius(State.currentTransform, M));
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(Display.cx, Display.cy, R - 0.5, 0, 2*Math.PI);
    ctx.clip();
    
    const pulse = 0.5 + 0.25 * Math.sin(time * 0.002);
    
    // Draw the fundamental triangle
    ctx.beginPath();
    const pts = [];
    // O→V
    for (let i = 0; i <= 10; i++) {
        const z = geodesicInterp(tO, tV, i/10);
        pts.push(toPixel(z));
    }
    // V→M
    for (let i = 1; i <= 10; i++) {
        const z = geodesicInterp(tV, tM, i/10);
        pts.push(toPixel(z));
    }
    // M→O
    for (let i = 1; i <= 10; i++) {
        const z = geodesicInterp(tM, tO, i/10);
        pts.push(toPixel(z));
    }
    
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    
    ctx.fillStyle = `rgba(244,114,182,${0.18*pulse})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(244,114,182,${0.65*pulse})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Angle labels
    if (R > 150) {
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(244,114,182,${0.85*pulse})`;
        
        const mid2 = geodesicInterp(tV, tM, 0.5);
        const lC = toPixel(geodesicInterp(tO, mid2, 0.28));
        ctx.fillText('π/6', lC[0], lC[1]);
        
        const lV = toPixel(geodesicInterp(tV, tO, 0.2));
        ctx.fillText('π/4', lV[0]+10, lV[1]);
        
        const lM = toPixel(geodesicInterp(tM, tO, 0.22));
        ctx.fillText('π/2', lM[0]-10, lM[1]);
    }
    
    // 5 more copies under rotation to show how hexagon decomposes
    ctx.globalAlpha = 0.3;
    for (let k = 1; k < 6; k++) {
        const rot = hypRotation(k * Math.PI / 3);
        const kTransform = mobiusCompose(viewM, mobiusCompose(State.currentTransform, rot));
        const kV = mobius(kTransform, V);
        const kM = mobius(kTransform, M);
        
        ctx.beginPath();
        let first = true;
        for (let i = 0; i <= 6; i++) {
            const z = geodesicInterp(tO, kV, i/6);
            const p = toPixel(z);
            first ? ctx.moveTo(p[0],p[1]) : ctx.lineTo(p[0],p[1]);
            first = false;
        }
        for (let i = 1; i <= 6; i++) {
            const z = geodesicInterp(kV, kM, i/6);
            const p = toPixel(z);
            ctx.lineTo(p[0],p[1]);
        }
        for (let i = 1; i <= 6; i++) {
            const z = geodesicInterp(kM, tO, i/6);
            const p = toPixel(z);
            ctx.lineTo(p[0],p[1]);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(167,139,250,${0.35*pulse})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    
    ctx.restore();
}

// ── Full Scene Render ────────────────────────────────────────────

/**
 * Draw the complete scene.
 * @param {number} time  - animation timestamp (ms)
 * @param {object} viewM - Möbius transform applied to every tile at render time
 */
function drawScene(time, viewM) {
    const { ctx, W, H } = Display;
    Display.time = time;
    viewM = viewM || MOBIUS_IDENTITY;
    
    ctx.clearRect(0, 0, W, H);
    drawDiskBackground();
    
    // Build render list with transformed positions
    const renderList = [];
    for (const tile of Tess.tiles) {
        const tVerts = tile.vertices.map(v => mobius(viewM, v));
        const tCenter = mobius(viewM, tile.center);
        
        // Cull tiles outside the disk
        if (cAbs2(tCenter) > 0.999) continue;
        
        renderList.push({
            verts:      tVerts,
            center:     tCenter,
            colorIndex: tile.colorIndex,
            depth:      tile.depth,
            dist2:      cAbs2(tCenter)
        });
    }
    
    // Painter's algorithm: draw farthest first
    renderList.sort((a, b) => b.dist2 - a.dist2);
    
    for (const r of renderList) {
        drawTile(r.verts, r.center, r.colorIndex, r.depth, time);
    }
    
    // Fundamental domain
    drawFundamentalDomain(time, viewM);
    
    // Center marker
    const pc = toPixel(mobius(viewM, [0,0]));
    ctx.beginPath();
    ctx.arc(pc[0], pc[1], 3, 0, 2*Math.PI);
    ctx.fillStyle = 'rgba(124,138,255,0.5)';
    ctx.fill();
    
    // Boundary label
    if (Display.R > 200) {
        ctx.font = '400 11px "Inter", sans-serif';
        ctx.fillStyle = 'rgba(148,163,184,0.4)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('∂∞ℍ²', Display.cx + Display.R + 22, Display.cy);
    }
    
    document.getElementById('tile-count').textContent = renderList.length;
}
