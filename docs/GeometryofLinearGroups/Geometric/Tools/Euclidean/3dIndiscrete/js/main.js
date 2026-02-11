// main.js — Indiscrete Isometry Groups walkthrough controller + 2D canvas

// ============================================================
// Canvas setup
// ============================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, dpr;

function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ============================================================
// Colors
// ============================================================
const COLORS = {
    bg: '#080c18',
    grid: 'rgba(255,255,255,0.04)',
    axis: 'rgba(255,255,255,0.1)',
    primary: '#60a5fa',
    secondary: '#a78bfa',
    warm: '#f59e0b',
    rose: '#f472b6',
    cyan: '#22d3ee',
    green: '#34d399',
    text: '#94a3b8',
    textDim: '#475569',
};

// ============================================================
// Math utilities
// ============================================================
function factorize(n) {
    const factors = [];
    let d = 2;
    while (d * d <= n) {
        while (n % d === 0) {
            if (!factors.includes(d)) factors.push(d);
            n /= d;
        }
        d++;
    }
    if (n > 1) factors.push(n);
    return factors;
}

function generateZinvM(m, maxK) {
    // Generate all a/m^k in [-2, 2] for 0 ≤ k ≤ maxK
    const points = new Set();
    for (let k = 0; k <= maxK; k++) {
        const denom = m ** k;
        const maxA = Math.ceil(2 * denom);
        for (let a = -maxA; a <= maxA; a++) {
            const val = a / denom;
            if (val >= -2 && val <= 2) {
                points.add(val);
            }
        }
    }
    return Array.from(points).sort((a, b) => a - b);
}

// Generate some elements of O_2(Z[1/m]) — 2x2 rotations with rational entries
function generateO2Rotations(m, maxK) {
    const angles = new Set();
    // Find angles θ where cos(θ) and sin(θ) are in Z[1/m]
    for (let k = 0; k <= maxK; k++) {
        const denom = m ** k;
        for (let a = -denom; a <= denom; a++) {
            const cosVal = a / denom;
            const sinSq = 1 - cosVal * cosVal;
            if (sinSq < 0) continue;
            const sinVal = Math.sqrt(sinSq);
            // Check if sinVal is also in Z[1/m]
            for (let k2 = 0; k2 <= maxK; k2++) {
                const denom2 = m ** k2;
                const sinRound = Math.round(sinVal * denom2) / denom2;
                if (Math.abs(sinRound - sinVal) < 1e-10 && sinRound !== 0) {
                    const angle = Math.atan2(sinRound, cosVal);
                    angles.add(angle);
                    angles.add(-angle);
                    angles.add(Math.PI - angle);
                    angles.add(-Math.PI + angle);
                }
            }
        }
    }
    return Array.from(angles).sort((a, b) => a - b);
}

// ============================================================
// Drawing functions
// ============================================================

function drawNumberLine(points, m, depth) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const scale = W / 5; // [-2.5, 2.5]

    // Grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let x = -2; x <= 2; x++) {
        const sx = cx + x * scale;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
        ctx.stroke();
    }

    // Axis
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.stroke();

    // Title
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`ℤ[1/${m}] on the real line, depth k = ${depth}`, cx, 30);

    // Tick labels
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px JetBrains Mono, monospace';
    for (let x = -2; x <= 2; x++) {
        ctx.fillText(x.toString(), cx + x * scale, cy + 20);
    }

    // Points — color by depth
    const colorsByDepth = [COLORS.primary, COLORS.secondary, COLORS.rose, COLORS.warm, COLORS.cyan, COLORS.green];

    for (let k = 0; k <= depth; k++) {
        const denom = m ** k;
        const color = colorsByDepth[k % colorsByDepth.length];
        const radius = Math.max(1.5, 4 - k * 0.5);
        const alpha = Math.max(0.3, 1 - k * 0.12);

        for (const p of points) {
            // Check if this point "belongs" to depth k (not a lower depth)
            const a = p * denom;
            if (Math.abs(a - Math.round(a)) > 1e-9) continue;
            // Check it's not representable at a lower depth
            let isThisDepth = true;
            for (let j = 0; j < k; j++) {
                const d2 = m ** j;
                const a2 = p * d2;
                if (Math.abs(a2 - Math.round(a2)) < 1e-9) {
                    isThisDepth = false;
                    break;
                }
            }
            if (!isThisDepth) continue;

            const sx = cx + p * scale;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(sx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;

    // Legend
    const legendY = H - 30;
    ctx.font = '11px Inter, sans-serif';
    for (let k = 0; k <= Math.min(depth, 5); k++) {
        const color = colorsByDepth[k % colorsByDepth.length];
        const lx = 20 + k * 90;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(lx, legendY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.textDim;
        ctx.textAlign = 'left';
        ctx.fillText(`k = ${k}`, lx + 10, legendY + 4);
    }

    // Count
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillText(`${points.length} points in [-2, 2]`, W - 20, 30);
}

function drawCircleOrbits(angles, m) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.35;

    // Title
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`O₂(ℤ[1/${m}]) acting on S¹`, cx, 30);

    // Circle
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Axes
    ctx.strokeStyle = COLORS.axis;
    ctx.beginPath();
    ctx.moveTo(cx - r - 20, cy);
    ctx.lineTo(cx + r + 20, cy);
    ctx.moveTo(cx, cy - r - 20);
    ctx.lineTo(cx, cy + r + 20);
    ctx.stroke();

    // Plot orbit of (1, 0) under all rotations
    for (const angle of angles) {
        const x = cx + r * Math.cos(angle);
        const y = cy - r * Math.sin(angle);

        ctx.fillStyle = COLORS.cyan;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Highlight (1,0)
    ctx.fillStyle = COLORS.warm;
    ctx.beginPath();
    ctx.arc(cx + r, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('(1, 0)', cx + r + 10, cy + 4);

    // Count
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'right';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.fillText(`${angles.length} rotations found`, W - 20, 30);
}

function drawSArithmeticDiagram(m) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H / 2;
    const primes = factorize(m);

    // Title
    ctx.fillStyle = COLORS.text;
    ctx.font = '16px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('S-Arithmetic Diagonal Embedding', cx, 40);

    // Draw the product structure
    const boxW = 160;
    const boxH = 70;
    const gap = 40;
    const totalW = boxW + primes.length * (boxW + gap);
    const startX = cx - totalW / 2;

    // Real place
    drawCompletionBox(startX, cy - boxH / 2, boxW, boxH, `Isom₃(ℝ)`, COLORS.primary, 'Real place');

    // p-adic places
    for (let i = 0; i < primes.length; i++) {
        const x = startX + (i + 1) * (boxW + gap);
        const p = primes[i];
        drawCompletionBox(x, cy - boxH / 2, boxW, boxH, `Isom₃(ℚ${subscript(p)})`, COLORS.rose, `p = ${p}`);

        // × symbol
        ctx.fillStyle = COLORS.textDim;
        ctx.font = '20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('×', x - gap / 2, cy + 4);
    }

    // Source group at top
    const srcX = cx - 100;
    const srcY = cy - 140;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 2;
    roundRect(ctx, srcX, srcY, 200, 50, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = COLORS.warm;
    ctx.font = '15px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Isom₃(ℤ[1/${m}])`, cx, srcY + 30);

    // Arrows from source to each place
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Arrow to real place
    drawArrow(cx, srcY + 50, startX + boxW / 2, cy - boxH / 2);

    // Arrows to p-adic places
    for (let i = 0; i < primes.length; i++) {
        const x = startX + (i + 1) * (boxW + gap) + boxW / 2;
        drawArrow(cx, srcY + 50, x, cy - boxH / 2);
    }

    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('diagonal embedding', cx, srcY + 75);

    // Bottom: rank info
    const primeStr = primes.join(', ');
    ctx.fillStyle = COLORS.text;
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText(`S = {${primeStr}} — |S| + 1 = ${primes.length + 1} places — ` +
        (primes.length >= 2 ? 'Higher rank ✓' : 'Rank 1 ✗ (not enough primes)'),
        cx, cy + boxH / 2 + 60);

    if (primes.length >= 2) {
        ctx.fillStyle = COLORS.green;
        ctx.fillText('→ Property FAb holds!', cx, cy + boxH / 2 + 85);
    } else {
        ctx.fillStyle = COLORS.rose;
        ctx.fillText('→ Need ≥ 2 primes for higher rank rigidity', cx, cy + boxH / 2 + 85);
    }
}

function drawCompletionBox(x, y, w, h, label, color, sublabel) {
    ctx.fillStyle = color.replace(')', ', 0.08)').replace('rgb', 'rgba').replace('#', '');
    // Use hex to rgba
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    ctx.fillStyle = `rgba(${r},${g},${b},0.08)`;
    ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '14px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 - 4);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(sublabel, x + w / 2, y + h / 2 + 16);
}

function subscript(n) {
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).split('').map(d => subs[parseInt(d)]).join('');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

function drawArrow(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 8;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
    ctx.stroke();
}

function drawHierarchy() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const levels = [
        { label: 'Property (T)', color: COLORS.rose, y: 80 },
        { label: 'Property FA', color: COLORS.secondary, y: 180 },
        { label: 'Property FAb', color: COLORS.primary, y: 280, highlight: true },
        { label: 'Finitely generated', color: COLORS.green, y: 380 },
    ];

    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Rigidity Hierarchy', cx, 30);

    for (let i = 0; i < levels.length; i++) {
        const lvl = levels[i];
        const w = lvl.highlight ? 220 : 200;
        const h = 50;
        const x = cx - w / 2;
        const y = lvl.y;

        const cr = parseInt(lvl.color.slice(1, 3), 16);
        const cg = parseInt(lvl.color.slice(3, 5), 16);
        const cb = parseInt(lvl.color.slice(5, 7), 16);

        ctx.fillStyle = `rgba(${cr},${cg},${cb},${lvl.highlight ? 0.12 : 0.06})`;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${lvl.highlight ? 0.6 : 0.3})`;
        ctx.lineWidth = lvl.highlight ? 2 : 1;
        roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = lvl.color;
        ctx.font = `${lvl.highlight ? 'bold ' : ''}14px JetBrains Mono, monospace`;
        ctx.fillText(lvl.label, cx, y + h / 2 + 5);

        // Arrow down
        if (i < levels.length - 1) {
            const ny = levels[i + 1].y;
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            drawArrow(cx, y + h, cx, ny);
            ctx.setLineDash([]);

            ctx.fillStyle = COLORS.textDim;
            ctx.font = '11px Inter, sans-serif';
            ctx.fillText('⟹', cx, (y + h + ny) / 2 + 4);
        }
    }
}

function drawTheorem(m) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const primes = factorize(m);

    // Golden theorem box
    const boxW = Math.min(500, W - 80);
    const boxH = 200;
    const bx = cx - boxW / 2;
    const by = H / 2 - boxH / 2 - 30;

    ctx.fillStyle = 'rgba(245, 158, 11, 0.06)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, boxW, boxH, 16);
    ctx.fill();
    ctx.stroke();

    // Left accent bar
    ctx.fillStyle = COLORS.warm;
    roundRect(ctx, bx, by, 4, boxH, 2);
    ctx.fill();

    // Label
    ctx.fillStyle = COLORS.warm;
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '2px';
    ctx.fillText('THEOREM', cx, by + 30);

    // Main text
    ctx.fillStyle = COLORS.text;
    ctx.font = '16px Inter, sans-serif';
    ctx.fillText(`Isom₃(ℤ[1/${m}]) has Property FAb`, cx, by + 70);

    // Explanation
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '13px Inter, sans-serif';
    ctx.fillText('Every finite-index subgroup has', cx, by + 110);
    ctx.fillText('finite abelianization.', cx, by + 130);

    // Primes
    ctx.fillStyle = COLORS.rose;
    ctx.font = '13px JetBrains Mono, monospace';
    ctx.fillText(`m = ${m} = ${primes.join(' · ')}`, cx, by + 170);

    // Check mark or X
    const hasFAb = primes.length >= 2;
    if (hasFAb) {
        ctx.fillStyle = COLORS.green;
        ctx.font = '48px sans-serif';
        ctx.fillText('✓', cx, by + boxH + 70);
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('Higher rank → FAb', cx, by + boxH + 95);
    }
}

// ============================================================
// Canvas mode management
// ============================================================
let currentMode = 'intro';
let currentM = 65;
let currentDepth = 3;

function drawCanvas() {
    resizeCanvas();
    switch (currentMode) {
        case 'intro':
        case 'ring':
        case 'explore': {
            const points = generateZinvM(currentM, currentDepth);
            drawNumberLine(points, currentM, currentDepth);
            break;
        }
        case 'isom':
        case 'orthogonal': {
            const angles = generateO2Rotations(currentM, Math.min(currentDepth, 2));
            drawCircleOrbits(angles, currentM);
            break;
        }
        case 'fab':
        case 'proof':
            drawSArithmeticDiagram(currentM);
            break;
        case 'hierarchy':
            drawHierarchy();
            break;
        case 'theorem':
            drawTheorem(currentM);
            break;
    }
}

// ============================================================
// Slide system
// ============================================================
const slides = document.querySelectorAll('.slide');
const totalSlides = slides.length;
let currentSlide = 0;

const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const dotsContainer = document.getElementById('progress-dots');

for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement('button');
    dot.className = 'progress-dot' + (i === 0 ? ' active' : '');
    dot.dataset.slide = i;
    dot.title = `Slide ${i + 1}`;
    dot.addEventListener('click', () => goToSlide(i));
    dotsContainer.appendChild(dot);
}

slides[0].classList.add('active');

function goToSlide(index) {
    if (index < 0 || index >= totalSlides || index === currentSlide) return;

    const prevSlideEl = slides[currentSlide];
    const nextSlideEl = slides[index];
    const goingForward = index > currentSlide;

    resetSlideAnimations(prevSlideEl);
    prevSlideEl.classList.remove('active');
    const exitClass = goingForward ? 'exit-up' : 'exit-down';
    prevSlideEl.classList.add(exitClass);
    setTimeout(() => prevSlideEl.classList.remove(exitClass), 600);

    const entryClass = goingForward ? 'enter-from-below' : 'enter-from-above';
    nextSlideEl.classList.add(entryClass);
    void nextSlideEl.offsetHeight;
    nextSlideEl.classList.remove(entryClass);
    nextSlideEl.classList.add('active');

    currentSlide = index;

    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;

    document.querySelectorAll('.progress-dot').forEach((d, i) => {
        d.classList.toggle('active', i === currentSlide);
        if (i < currentSlide) d.classList.add('visited');
    });

    onSlideActivated(currentSlide);
    setTimeout(() => triggerSlideAnimations(nextSlideEl), 250);

    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}

prevBtn.addEventListener('click', () => goToSlide(currentSlide - 1));
nextBtn.addEventListener('click', () => goToSlide(currentSlide + 1));

document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToSlide(currentSlide + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToSlide(currentSlide - 1);
    }
});

// ============================================================
// Slide animations
// ============================================================
function triggerSlideAnimations(slideEl) {
    slideEl.querySelectorAll('.reveal-list li').forEach((li, i) => {
        setTimeout(() => li.classList.add('visible'), i * 200);
    });
    slideEl.querySelectorAll('.stagger').forEach(el => el.classList.add('visible'));
    slideEl.querySelectorAll('.fade-in').forEach((el, i) => {
        setTimeout(() => el.classList.add('visible'), i * 150);
    });
}

function resetSlideAnimations(slideEl) {
    slideEl.querySelectorAll('.reveal-list li').forEach(li => li.classList.remove('visible'));
    slideEl.querySelectorAll('.stagger').forEach(el => el.classList.remove('visible'));
    slideEl.querySelectorAll('.fade-in').forEach(el => el.classList.remove('visible'));
}

setTimeout(() => triggerSlideAnimations(slides[0]), 300);

// ============================================================
// Slide → canvas syncing
// ============================================================
function onSlideActivated(slideIndex) {
    const canvasMode = slides[slideIndex].dataset.canvas;
    currentMode = canvasMode;

    // Update badge
    const badge = document.getElementById('group-name-badge');
    switch (canvasMode) {
        case 'intro':
            badge.textContent = `ℤ[1/${currentM}]`;
            break;
        case 'ring':
            badge.textContent = `ℤ[1/${currentM}] density`;
            break;
        case 'isom':
            badge.textContent = `Isom₃(ℤ[1/${currentM}])`;
            break;
        case 'orthogonal':
            badge.textContent = `O₂(ℤ[1/${currentM}])`;
            break;
        case 'fab':
        case 'proof':
            badge.textContent = `S-arithmetic structure`;
            break;
        case 'hierarchy':
            badge.textContent = 'Rigidity hierarchy';
            break;
        case 'theorem':
            badge.textContent = `FAb for Isom₃(ℤ[1/${currentM}])`;
            break;
        case 'explore':
            badge.textContent = `Exploring ℤ[1/${currentM}]`;
            break;
    }

    drawCanvas();
}

// ============================================================
// Settings / Explore controls
// ============================================================
const mInput = document.getElementById('m-input');
const depthSlider = document.getElementById('depth-slider');
const dimSlider = document.getElementById('dim-slider');
const exploreInfo = document.getElementById('explore-info');

function updateExploreInfo() {
    if (!exploreInfo) return;
    const primes = factorize(currentM);
    const n = dimSlider ? parseInt(dimSlider.value) : 3;
    const sRank = primes.length + 1;
    const hasFAb = primes.length >= 2 && n >= 3;

    exploreInfo.className = 'result-box ' + (hasFAb ? 'success' : 'warning');

    const title = exploreInfo.querySelector('.result-title');
    const subtitle = exploreInfo.querySelector('.result-subtitle');
    const details = exploreInfo.querySelector('.result-details');

    if (title) title.textContent = `Isom${subscriptHTML(n)}(ℤ[1/${currentM}])`;
    if (subtitle) subtitle.textContent = `Primes of m: ${primes.join(', ')} · S-arithmetic rank: ${sRank}`;
    if (details) {
        if (hasFAb) {
            details.textContent = `This group has Property FAb because |S| = ${primes.length} ≥ 2 gives a higher-rank lattice in the adelic product.`;
        } else if (primes.length < 2) {
            details.textContent = `Only ${primes.length} prime(s) — this is rank 1. Need ≥ 2 distinct primes for higher-rank rigidity and FAb.`;
        } else {
            details.textContent = `Dimension n = ${n} may be too low. Results are strongest for n ≥ 3.`;
        }
    }
}

function subscriptHTML(n) {
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    return String(n).split('').map(d => subs[parseInt(d)]).join('');
}

if (mInput) mInput.addEventListener('change', () => {
    currentM = Math.max(2, parseInt(mInput.value) || 65);
    mInput.value = currentM;
    updateExploreInfo();
    drawCanvas();
});

if (depthSlider) depthSlider.addEventListener('input', () => {
    currentDepth = parseInt(depthSlider.value);
    drawCanvas();
});

if (dimSlider) dimSlider.addEventListener('input', () => {
    updateExploreInfo();
});

// ============================================================
// Canvas controls
// ============================================================
document.getElementById('reset-view-btn')?.addEventListener('click', () => {
    currentM = 65;
    currentDepth = 3;
    if (mInput) mInput.value = 65;
    if (depthSlider) depthSlider.value = 3;
    if (dimSlider) dimSlider.value = 3;
    updateExploreInfo();
    drawCanvas();
});

// ============================================================
// Initialize
// ============================================================
updateExploreInfo();
drawCanvas();

setTimeout(() => {
    if (window.MathJax && window.MathJax.typeset) {
        try { MathJax.typeset(); } catch (e) { }
    }
}, 500);
