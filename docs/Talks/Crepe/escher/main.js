/* ================================================================
   Main Orchestration — Circle Limit IV Interactive Viewer
   
   Animation approach:
     Tiles are stored in canonical positions (after all completed
     transforms). During animation, a smooth family of Möbius
     transforms M(t) is computed and passed to drawScene().
     Every rendered frame shows an EXACT Möbius isometry — 
     guaranteeing truly isometric motion at all times.
   ================================================================ */

// ── State ────────────────────────────────────────────────────────

const State = {
    currentTransform: MOBIUS_IDENTITY,
    transformNames: [],
    
    // Active animation: { makeMobius, startTime, duration, name, onComplete, isReflection }
    anim: null,
    
    // Orbit sequence
    orbitAnimating: false,
    orbitStep: 0,
    orbitInterval: null,
    
    // Drag interaction
    isDragging: false,
    dragStart: null,
    
    // Precomputed hyperbolic translation distance (one tile step)
    translationDist: 0
};

// ── Initialization ───────────────────────────────────────────────

function init() {
    initDisplay();
    initTessellation();
    
    const apothemHyp = 2 * Math.atanh(Tess.apothemRadius);
    State.translationDist = 2 * apothemHyp;
    
    generateTiles(Tess.maxDepth);
    setupInteraction();
    requestAnimationFrame(renderLoop);
}

// ── Easing ───────────────────────────────────────────────────────

function easeInOutCubic(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
}

// ── Single Unified Render Loop ───────────────────────────────────

function renderLoop(time) {
    
    // ── Case 1: Reflection animation (anti-holomorphic, special path) ──
    if (State.anim && State.anim.isReflection) {
        const elapsed = time - State.anim.startTime;
        const rawT = Math.min(elapsed / State.anim.duration, 1);
        const t = easeInOutCubic(rawT);
        
        // Smoothly scale x from 1 → -1 (visual fold)
        const sx = 1 - 2*t;
        
        const { ctx, W, H } = Display;
        Display.time = time;
        ctx.clearRect(0, 0, W, H);
        drawDiskBackground();
        
        const renderList = [];
        for (const tile of Tess.tiles) {
            const tVerts = tile.vertices.map(v => [v[0]*sx, v[1]]);
            const tCenter = [tile.center[0]*sx, tile.center[1]];
            if (cAbs2(tCenter) > 0.999) continue;
            renderList.push({
                verts: tVerts, center: tCenter,
                colorIndex: tile.colorIndex, depth: tile.depth,
                dist2: cAbs2(tCenter)
            });
        }
        renderList.sort((a,b) => b.dist2 - a.dist2);
        for (const r of renderList)
            drawTile(r.verts, r.center, r.colorIndex, r.depth, time);
        
        const pc = toPixel([0,0]);
        ctx.beginPath(); ctx.arc(pc[0],pc[1],3,0,2*Math.PI);
        ctx.fillStyle='rgba(124,138,255,0.5)'; ctx.fill();
        document.getElementById('tile-count').textContent = renderList.length;
        
        if (rawT >= 1) {
            // Apply exact reflection
            for (const tile of Tess.tiles) {
                tile.vertices = tile.vertices.map(v => [-v[0], v[1]]);
                tile.center = [-tile.center[0], tile.center[1]];
            }
            State.anim = null;
        }
        
        requestAnimationFrame(renderLoop);
        return;
    }
    
    // ── Case 2: Möbius transform animation (isometric) ──
    let viewM = MOBIUS_IDENTITY;
    
    if (State.anim) {
        const elapsed = time - State.anim.startTime;
        const rawT = Math.min(elapsed / State.anim.duration, 1);
        const t = easeInOutCubic(rawT);
        
        viewM = State.anim.makeMobius(t);
        
        if (rawT >= 1) {
            const fullM = State.anim.makeMobius(1);
            State.currentTransform = mobiusCompose(fullM, State.currentTransform);
            
            regenerateTiles();
            transformAllTiles(State.currentTransform);
            
            const cb = State.anim.onComplete;
            State.anim = null;
            viewM = MOBIUS_IDENTITY;
            
            if (cb) cb();
        }
    }
    
    // ── Case 3: No animation — just render current state ──
    drawScene(time, viewM);
    requestAnimationFrame(renderLoop);
}

// ── Animation API ────────────────────────────────────────────────

function startAnim(makeMobius, name, duration, onComplete) {
    if (State.anim) return;
    State.anim = {
        makeMobius,
        name,
        startTime: performance.now(),
        duration: duration || 1000,
        onComplete: onComplete || null
    };
    State.transformNames.push(name);
    showTransformLabel(name);
    updateCompBox();
}

// ── User Actions ─────────────────────────────────────────────────

/**
 * Rotate by k×60° about the origin.
 * Interpolated family: R(t·k·π/3)  — exact Möbius isometry at every t.
 */
function applyRotation(k) {
    if (State.anim) return;
    const totalAngle = k * Math.PI / 3;
    startAnim(
        t => hypRotation(t * totalAngle),
        k > 0 ? 'R(+60°)' : 'R(-60°)',
        900
    );
}

/**
 * Hyperbolic translation in one of 4 directions.
 * Interpolated family: T(θ, t·d)  — exact Möbius isometry at every t.
 */
function applyTranslation(dir) {
    if (State.anim) return;
    const angles = [Math.PI/2, -Math.PI/2, Math.PI, 0];
    const labels = ['T(↑)', 'T(↓)', 'T(←)', 'T(→)'];
    const d = State.translationDist;
    startAnim(
        t => hypTranslationDir(angles[dir], t * d),
        labels[dir],
        1000
    );
}

/**
 * Reflection across the imaginary axis: z → [-re, im].
 */
function applyReflection() {
    if (State.anim) return;
    State.anim = {
        makeMobius: null,
        isReflection: true,
        name: 'σ',
        startTime: performance.now(),
        duration: 800,
        onComplete: null
    };
    State.transformNames.push('σ');
    showTransformLabel('σ (reflection)');
    updateCompBox();
}

function resetView() {
    if (State.anim) return;
    State.currentTransform = MOBIUS_IDENTITY;
    State.transformNames = [];
    regenerateTiles();
    showTransformLabel('Identity');
    hideCompBox();
}

function toggleFundamental() {
    Display.showFundamental = !Display.showFundamental;
    document.getElementById('btn-fund').classList.toggle('active', Display.showFundamental);
}

function animateOrbit() {
    if (State.anim || State.orbitAnimating) return;
    State.orbitAnimating = true;
    State.orbitStep = 0;
    Display.showFundamental = true;
    document.getElementById('btn-fund').classList.add('active');
    
    function nextStep() {
        if (State.orbitStep >= 6) {
            State.orbitAnimating = false;
            clearInterval(State.orbitInterval);
            setTimeout(resetView, 500);
            return;
        }
        if (!State.anim) {
            State.orbitStep++;
            startAnim(t => hypRotation(t * Math.PI/3), `R step ${State.orbitStep}`, 700);
        }
    }
    State.orbitInterval = setInterval(nextStep, 1000);
    nextStep();
}

function toggleColor() {
    Display.showColor = true;
    Display.showWireframe = false;
    document.getElementById('btn-color').classList.add('active');
    document.getElementById('btn-wireframe').classList.remove('active');
}

function toggleWireframe() {
    Display.showColor = false;
    Display.showWireframe = true;
    document.getElementById('btn-wireframe').classList.add('active');
    document.getElementById('btn-color').classList.remove('active');
}

function setDepth(val) {
    const depth = parseInt(val);
    document.getElementById('depth-value').textContent = depth;
    Tess.maxDepth = depth;
    regenerateTiles();
    transformAllTiles(State.currentTransform);
}

// ── UI Helpers ───────────────────────────────────────────────────

function showTransformLabel(text) {
    const label = document.getElementById('transform-label');
    label.textContent = text;
    label.classList.add('visible');
    clearTimeout(label._timeout);
    label._timeout = setTimeout(() => label.classList.remove('visible'), 2000);
}

function updateCompBox() {
    const box = document.getElementById('comp-box');
    if (State.transformNames.length === 0) { box.style.display='none'; return; }
    box.style.display = 'block';
    const names = State.transformNames.slice(-6);
    document.getElementById('comp-expr').textContent = names.join(' ∘ ');
    document.getElementById('comp-result').textContent =
        `${State.transformNames.length} isometries composed`;
}

function hideCompBox() {
    document.getElementById('comp-box').style.display = 'none';
}

// ── Mouse / Touch ────────────────────────────────────────────────

function setupInteraction() {
    const canvas = Display.canvas;
    
    canvas.addEventListener('mousedown', e => {
        if (State.anim) return;
        State.isDragging = true;
        State.dragStart = [e.clientX, e.clientY];
    });
    
    canvas.addEventListener('mousemove', e => {
        if (!State.isDragging || State.anim) return;
        const dx = e.clientX - State.dragStart[0];
        const dy = e.clientY - State.dragStart[1];
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
            const angle = Math.atan2(-dy, dx);
            const hd = dist / Display.R * 0.4;
            State.currentTransform = mobiusCompose(
                hypTranslationDir(angle, hd), State.currentTransform
            );
            regenerateTiles();
            transformAllTiles(State.currentTransform);
            State.dragStart = [e.clientX, e.clientY];
        }
    });
    
    canvas.addEventListener('mouseup',    () => { State.isDragging = false; });
    canvas.addEventListener('mouseleave', () => { State.isDragging = false; });
    
    canvas.addEventListener('wheel', e => {
        if (State.anim) return;
        e.preventDefault();
        const a = e.deltaY > 0 ? 0.08 : -0.08;
        State.currentTransform = mobiusCompose(hypRotation(a), State.currentTransform);
        regenerateTiles();
        transformAllTiles(State.currentTransform);
    }, { passive: false });
    
    // Touch
    let ts = null;
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) ts = [e.touches[0].clientX, e.touches[0].clientY];
    });
    canvas.addEventListener('touchmove', e => {
        if (!ts || State.anim || e.touches.length !== 1) return;
        e.preventDefault();
        const dx = e.touches[0].clientX - ts[0];
        const dy = e.touches[0].clientY - ts[1];
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
            const angle = Math.atan2(-dy, dx);
            const hd = dist / Display.R * 0.3;
            State.currentTransform = mobiusCompose(
                hypTranslationDir(angle, hd), State.currentTransform
            );
            regenerateTiles();
            transformAllTiles(State.currentTransform);
            ts = [e.touches[0].clientX, e.touches[0].clientY];
        }
    }, { passive: false });
    canvas.addEventListener('touchend', () => { ts = null; });
}

// ── Keyboard ─────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
    switch(e.key) {
        case 'ArrowUp':    applyTranslation(0); e.preventDefault(); break;
        case 'ArrowDown':  applyTranslation(1); e.preventDefault(); break;
        case 'ArrowLeft':  applyTranslation(2); e.preventDefault(); break;
        case 'ArrowRight': applyTranslation(3); e.preventDefault(); break;
        case 'r': applyRotation(1); break;
        case 'R': applyRotation(-1); break;
        case 'f': toggleFundamental(); break;
        case 'w': toggleWireframe(); break;
        case 'c': toggleColor(); break;
        case 'o': animateOrbit(); break;
        case 'Escape': resetView(); break;
    }
});

// ── Start ────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', init);
