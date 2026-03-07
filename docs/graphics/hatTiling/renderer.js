// ────────────────────────────────────────────────────────────────
//  renderer.js — Canvas renderer for hat monotile tiling
// ────────────────────────────────────────────────────────────────

(() => {
    const canvas = document.getElementById('tilingCanvas');
    const ctx = canvas.getContext('2d');

    // ── Color palettes ─────────────────────────────────────────
    const PALETTES = [
        {
            name: 'Midnight',
            bg: '#0a0a1a',
            H1: '#2d7dd2', H: '#5fa8d3', T: '#1a1a2e', P: '#3a506b', F: '#6b7fd7',
            stroke: '#14142a'
        },
        {
            name: 'Sunset',
            bg: '#1a0a1e',
            H1: '#ff6b6b', H: '#ffa07a', T: '#2d1b33', P: '#c06c84', F: '#f8b500',
            stroke: '#1a0a1e'
        },
        {
            name: 'Forest',
            bg: '#0a1a12',
            H1: '#2d936c', H: '#88d498', T: '#1a2e23', P: '#5b8c5a', F: '#a8dadc',
            stroke: '#081510'
        },
        {
            name: 'Neon',
            bg: '#0a0a0f',
            H1: '#ff006e', H: '#8338ec', T: '#14141f', P: '#3a86ff', F: '#fb5607',
            stroke: '#060609'
        },
        {
            name: 'Cream',
            bg: '#f5f0e8',
            H1: '#0089b6', H: '#94d2e6', T: '#f0ebe3', P: '#e8e0d0', F: '#b8b0a0',
            stroke: '#3a3530'
        },
        {
            name: 'Vapor',
            bg: '#12062a',
            H1: '#ff71ce', H: '#b967ff', T: '#1a0e33', P: '#01cdfe', F: '#05ffa1',
            stroke: '#0d0420'
        },
        {
            name: 'Mono',
            bg: '#111111',
            H1: '#ffffff', H: '#cccccc', T: '#1a1a1a', P: '#888888', F: '#555555',
            stroke: '#000000'
        },
        {
            name: 'Ember',
            bg: '#0f0806',
            H1: '#ff4500', H: '#ff8c42', T: '#1a0e08', P: '#ffd700', F: '#cc3300',
            stroke: '#0a0504'
        }
    ];

    // ── State ──────────────────────────────────────────────────
    let currentLevel = 3;
    let currentPalette = 0;
    let drawHats = true;
    let drawOutlines = false;
    let strokeWidth = 1.0;
    let bgColor = PALETTES[0].bg;
    let animating = false;
    let rotSpeed = 0.10;
    let rotation = 0;

    // View transform
    let viewX = 0, viewY = 0, viewScale = 1;
    let isDragging = false;
    let dragStartX, dragStartY, dragViewX, dragViewY;

    // Tiling cache
    let cachedHats = null;
    let cachedOutlines = null;
    let cachedLevel = -1;
    let tileCount = 0;

    // ── DPR-aware resize ───────────────────────────────────────
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = window.innerWidth + 'px';
        canvas.style.height = window.innerHeight + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        document.getElementById('resolution').textContent =
            `${canvas.width}×${canvas.height}`;
    }

    // ── Build tiling data ──────────────────────────────────────
    function rebuildTiling() {
        if (cachedLevel === currentLevel) return;
        cachedLevel = currentLevel;

        const tiles = buildTiling(currentLevel);
        // Use H metatile (index 0) as the root
        const root = tiles[0];

        cachedHats = [];
        collectHats(root, ident, currentLevel, cachedHats);
        tileCount = cachedHats.length;

        cachedOutlines = [];
        for (let lev = currentLevel - 1; lev >= 0; lev--) {
            const outlines = [];
            collectOutlines(root, ident, currentLevel, lev, outlines);
            cachedOutlines.push(outlines);
        }

        // Auto-fit view
        autoFitView();

        document.getElementById('tileCount').textContent = `${tileCount} tiles`;
        document.getElementById('levelValue').textContent = currentLevel;
    }

    function autoFitView() {
        if (!cachedHats || cachedHats.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const hat of cachedHats) {
            for (const p of hat_outline) {
                const tp = transPt(hat.T, p);
                minX = Math.min(minX, tp.x);
                minY = Math.min(minY, tp.y);
                maxX = Math.max(maxX, tp.x);
                maxY = Math.max(maxY, tp.y);
            }
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const w = maxX - minX;
        const h = maxY - minY;
        const scaleX = window.innerWidth / (w * 1.1);
        const scaleY = window.innerHeight / (h * 1.1);
        viewScale = Math.min(scaleX, scaleY);
        viewX = window.innerWidth / 2 - cx * viewScale;
        viewY = window.innerHeight / 2 + cy * viewScale; // flip y
    }

    // ── Drawing ────────────────────────────────────────────────
    function drawFrame(timestamp) {
        if (animating) {
            rotation += rotSpeed * 0.02;
        }

        const pal = PALETTES[currentPalette];
        const W = window.innerWidth;
        const H = window.innerHeight;

        // Clear
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(rotation);
        ctx.translate(-W / 2, -H / 2);

        // Draw hats
        if (drawHats && cachedHats) {
            for (const hat of cachedHats) {
                drawHatTile(hat, pal);
            }
        }

        // Draw supertile outlines
        if (drawOutlines && cachedOutlines) {
            for (let i = 0; i < cachedOutlines.length; i++) {
                const alpha = 0.3 + 0.4 * (i / cachedOutlines.length);
                ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                ctx.lineWidth = (1 + i * 1.5) * viewScale * 0.02;
                for (const outline of cachedOutlines[i]) {
                    ctx.beginPath();
                    for (let j = 0; j < outline.shape.length; j++) {
                        const p = outline.shape[j];
                        const sx = viewX + p.x * viewScale;
                        const sy = viewY - p.y * viewScale;
                        if (j === 0) ctx.moveTo(sx, sy);
                        else ctx.lineTo(sx, sy);
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }

        ctx.restore();

        requestAnimationFrame(drawFrame);
    }

    function drawHatTile(hat, pal) {
        ctx.beginPath();
        for (let i = 0; i < hat_outline.length; i++) {
            const p = transPt(hat.T, hat_outline[i]);
            const sx = viewX + p.x * viewScale;
            const sy = viewY - p.y * viewScale;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();

        ctx.fillStyle = pal[hat.label] || pal.H;
        ctx.fill();

        if (strokeWidth > 0) {
            ctx.strokeStyle = pal.stroke;
            ctx.lineWidth = strokeWidth;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
    }

    // ── Interaction ────────────────────────────────────────────
    canvas.addEventListener('mousedown', e => {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragViewX = viewX;
        dragViewY = viewY;
    });

    canvas.addEventListener('mousemove', e => {
        if (!isDragging) return;
        viewX = dragViewX + (e.clientX - dragStartX);
        viewY = dragViewY + (e.clientY - dragStartY);
    });

    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        const mx = e.clientX, my = e.clientY;
        viewX = mx - (mx - viewX) * factor;
        viewY = my - (my - viewY) * factor;
        viewScale *= factor;
    }, { passive: false });

    // Touch support
    let lastTouchDist = 0;
    canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            dragViewX = viewX;
            dragViewY = viewY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastTouchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        if (e.touches.length === 1 && isDragging) {
            viewX = dragViewX + (e.touches[0].clientX - dragStartX);
            viewY = dragViewY + (e.touches[0].clientY - dragStartY);
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const factor = dist / lastTouchDist;
            const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            viewX = mx - (mx - viewX) * factor;
            viewY = my - (my - viewY) * factor;
            viewScale *= factor;
            lastTouchDist = dist;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { isDragging = false; });

    // ── Keyboard shortcuts ─────────────────────────────────────
    document.addEventListener('keydown', e => {
        if (e.key === 'h' || e.key === 'H') {
            document.getElementById('controls').classList.toggle('hidden');
        }
        if (e.key === '=' || e.key === '+') {
            changeLevel(1);
        }
        if (e.key === '-' || e.key === '_') {
            changeLevel(-1);
        }
    });

    // ── UI wiring ──────────────────────────────────────────────
    function changeLevel(delta) {
        const newLevel = Math.max(1, Math.min(6, currentLevel + delta));
        if (newLevel !== currentLevel) {
            currentLevel = newLevel;
            cachedLevel = -1;
            rebuildTiling();
        }
    }

    document.getElementById('levelUp').addEventListener('click', () => changeLevel(1));
    document.getElementById('levelDown').addEventListener('click', () => changeLevel(-1));

    document.getElementById('drawHatsToggle').addEventListener('change', e => {
        drawHats = e.target.checked;
    });

    document.getElementById('drawOutlinesToggle').addEventListener('change', e => {
        drawOutlines = e.target.checked;
    });

    document.getElementById('strokeSlider').addEventListener('input', e => {
        strokeWidth = parseFloat(e.target.value);
        document.getElementById('strokeValue').textContent = strokeWidth.toFixed(1);
    });

    document.getElementById('bgPicker').addEventListener('input', e => {
        bgColor = e.target.value;
    });

    document.getElementById('animateToggle').addEventListener('change', e => {
        animating = e.target.checked;
    });

    document.getElementById('rotSpeedSlider').addEventListener('input', e => {
        rotSpeed = parseFloat(e.target.value);
        document.getElementById('rotSpeedValue').textContent = rotSpeed.toFixed(2);
    });

    document.getElementById('screenshotBtn').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `hat-tiling-level${currentLevel}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        rotation = 0;
        autoFitView();
    });

    // ── Build palette swatches ─────────────────────────────────
    function buildPaletteUI() {
        const container = document.getElementById('paletteSwatches');
        PALETTES.forEach((pal, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'swatch' + (i === currentPalette ? ' active' : '');
            swatch.title = pal.name;
            swatch.style.background =
                `linear-gradient(135deg, ${pal.H1} 0%, ${pal.H} 35%, ${pal.F} 65%, ${pal.P} 100%)`;
            swatch.addEventListener('click', () => {
                document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
                currentPalette = i;
                bgColor = pal.bg;
                document.getElementById('bgPicker').value = pal.bg;
            });
            container.appendChild(swatch);
        });
    }

    // ── Init ───────────────────────────────────────────────────
    function init() {
        resize();
        buildPaletteUI();
        rebuildTiling();
        requestAnimationFrame(drawFrame);

        // Fade instructions after 5 seconds
        setTimeout(() => {
            const instr = document.getElementById('instructions');
            if (instr) instr.style.opacity = '0';
        }, 5000);
    }

    window.addEventListener('resize', () => {
        resize();
    });

    init();
})();
