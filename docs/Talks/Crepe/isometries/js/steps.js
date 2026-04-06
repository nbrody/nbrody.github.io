/**
 * Draw functions for each of the 7 walkthrough steps.
 *
 * Step 0: The Plane — axes, grid, basis vectors
 * Step 1: Translations — introduce e₁ (right), then e₂ (up)
 * Step 2: Combining — iterate & combine translations
 * Step 3: Placemat (dihedral group)
 * Step 4: Generators
 * Step 5: Commuting
 * Step 6: Lattices
 */
import { state } from './state.js';
import {
    C, clear, drawGrid, drawTransformedGrid, drawFrame,
    drawScreenArrow, drawDot, drawPoly, drawDashedLine, drawLabel,
    setInfo, ease, toS, vp, scale,
} from './drawing.js';
import {
    identityTf, translateTf, rotateTf, reflectTf,
    composeTf, inverseTf, lerpTf, applyTf,
} from './transforms.js';

/* ═══════════════════════════════════════════════════════
   STEP 0 — The Plane
   Just the coordinate plane with axes and basis vectors.
   ═══════════════════════════════════════════════════════ */

export function drawStep0() {
    clear();
    drawGrid();

    // Draw basis vectors with labels
    drawFrame(identityTf(), {
        showLabels: true,
        lw: 3.5,
        dotRadius: 6,
        dotColor: '#fff',
        size: 1,
    });

    // Extra axis labels at the edges
    const { w, h } = vp();
    const s = scale();
    const range = Math.ceil(Math.max(w, h) / s / 2);

    // Tick marks on axes
    for (let i = -range; i <= range; i++) {
        if (i === 0) continue;
        drawDot(i, 0, 2, 'rgba(124,138,255,0.3)');
        if (Math.abs(i) <= 5) {
            drawLabel(i, 0, `${i}`, 'rgba(124,138,255,0.4)', {
                dy: 16, align: 'center', font: '400 10px Inter, sans-serif',
            });
        }
    }
    for (let j = -range; j <= range; j++) {
        if (j === 0) continue;
        drawDot(0, j, 2, 'rgba(245,158,11,0.3)');
        if (Math.abs(j) <= 5) {
            drawLabel(0, j, `${j}`, 'rgba(245,158,11,0.4)', {
                dx: -16, align: 'center', font: '400 10px Inter, sans-serif',
            });
        }
    }

    // Origin label
    drawLabel(0, 0, '0', 'rgba(255,255,255,0.5)', {
        dx: -14, dy: 14, font: '500 11px Inter, sans-serif',
    });

    setInfo('The Euclidean plane ℝ² with standard basis vectors e₁ and e₂');
}

/* ═══════════════════════════════════════════════════════
   STEP 1 — Translations
   Sub-step 0: translation by e₁ (to the right)
   Sub-step 1: translation by e₂ (upward)
   Sub-step 2: both translations visible
   ═══════════════════════════════════════════════════════ */

export function drawStep1() {
    clear();
    drawGrid();

    const sub = state.transSubStep;
    const t = ease(state.transAnimT);

    // Origin frame (dim)
    drawFrame(identityTf(), {
        alpha: 0.2,
        showLabels: true,
        dotColor: 'rgba(255,255,255,0.25)',
        lw: 2,
        size: 1,
    });

    if (sub === 0) {
        // --- Translation to the right by e₁ ---
        _drawTranslationArrow(
            { x: 0, y: 0 }, { x: 1, y: 0 },
            C.accent, t, 'T₁'
        );

        // Show the translated frame
        const tfE1 = { a: 1, b: 0, c: 0, d: 1, tx: t, ty: 0 };
        drawFrame(tfE1, {
            showLabels: false, lw: 2.5, dotRadius: 5,
            dotColor: C.accent, alpha: t,
            color1: C.accent, color2: C.warm,
        });

        // Show a few iterated copies ghosted ahead
        for (let k = 2; k <= 4; k++) {
            const a = Math.max(0.06, 0.15 - k * 0.03);
            drawDot(k, 0, 3, `rgba(124,138,255,${a})`);
        }

        setInfo('T₁ : translate every point one unit to the right');

    } else if (sub === 1) {
        // --- Show e₁ translation (static) ---
        _drawTranslationArrow(
            { x: 0, y: 0 }, { x: 1, y: 0 },
            C.accent, 1, 'T₁', 0.3
        );
        const tfE1 = { a: 1, b: 0, c: 0, d: 1, tx: 1, ty: 0 };
        drawFrame(tfE1, {
            showLabels: false, lw: 1.5, dotRadius: 3,
            dotColor: C.accent, alpha: 0.25,
            color1: C.accent, color2: C.warm,
        });

        // --- Translation upward by e₂ ---
        _drawTranslationArrow(
            { x: 0, y: 0 }, { x: 0, y: 1 },
            C.warm, t, 'T₂'
        );

        const tfE2 = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: t };
        drawFrame(tfE2, {
            showLabels: false, lw: 2.5, dotRadius: 5,
            dotColor: C.warm, alpha: t,
            color1: C.accent, color2: C.warm,
        });

        // Ghost copies above
        for (let k = 2; k <= 4; k++) {
            const a = Math.max(0.06, 0.15 - k * 0.03);
            drawDot(0, k, 3, `rgba(245,158,11,${a})`);
        }

        setInfo('T₂ : translate every point one unit upward');

    } else {
        // sub === 2: both translations visible
        _drawTranslationArrow(
            { x: 0, y: 0 }, { x: 1, y: 0 },
            C.accent, 1, 'T₁'
        );
        _drawTranslationArrow(
            { x: 0, y: 0 }, { x: 0, y: 1 },
            C.warm, 1, 'T₂'
        );

        // Frames at (1,0) and (0,1)
        const tfE1 = { a: 1, b: 0, c: 0, d: 1, tx: 1, ty: 0 };
        const tfE2 = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 1 };
        drawFrame(tfE1, {
            showLabels: false, lw: 2, dotRadius: 4,
            dotColor: C.accent, alpha: 0.7,
            color1: C.accent, color2: C.warm,
        });
        drawFrame(tfE2, {
            showLabels: false, lw: 2, dotRadius: 4,
            dotColor: C.warm, alpha: 0.7,
            color1: C.accent, color2: C.warm,
        });

        setInfo('Two fundamental translations: T₁ (right) and T₂ (up)');
    }
}

/** Draw a big translation arrow with a label, fading in with parameter t. */
function _drawTranslationArrow(from, to, color, t, label, baseAlpha = 1.0) {
    const alpha = baseAlpha * t;
    const cur = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };

    // Translucent guide line
    drawDashedLine(from, to, color + '40', 1, [6, 4]);

    // Animated arrow
    drawScreenArrow(from, cur, color, 3);

    // Label near midpoint
    if (t > 0.3) {
        const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const dx = to.x === from.x ? -20 : 0;
        const dy = to.y === from.y ? -16 : 6;
        drawLabel(mid.x, mid.y, label, color, {
            dx, dy, font: '700 14px Inter, sans-serif',
            alpha,
        });
    }
}

/* ═══════════════════════════════════════════════════════
   STEP 2 — Combining Translations
   Show that we can iterate, and combine two translations.
   ═══════════════════════════════════════════════════════ */

export function drawStep2() {
    clear();
    drawGrid();

    const m = state.combineM;
    const n = state.combineN;
    const t = ease(state.combineT);

    // Dim origin frame
    drawFrame(identityTf(), {
        alpha: 0.15,
        showLabels: false,
        dotColor: 'rgba(255,255,255,0.2)',
        lw: 1.5,
        size: 0.8,
    });

    if (state.combinePhase === 'idle') {
        // Show the target point (m, n) and all lattice points faintly
        _drawLatticeFaint(m, n);

        // Mark origin
        drawDot(0, 0, 5, '#fff');
        drawLabel(0, 0, '(0, 0)', 'rgba(255,255,255,0.5)', {
            dx: -10, dy: 16, font: '500 11px Inter, sans-serif',
        });

        // Mark target
        drawDot(m, n, 6, C.violet);
        drawLabel(m, n, `(${m}, ${n})`, C.violet, {
            dx: 10, dy: -10, font: '600 12px Inter, sans-serif',
        });

        setInfo(`Press ▶ to build T₁^${m} ∘ T₂^${n}  →  translation to (${m}, ${n})`);

    } else if (state.combinePhase === 'iterating') {
        // Animate building up: first m steps right, then n steps up
        const totalSteps = m + n;
        const progress = t * totalSteps;
        const curStep = Math.floor(progress);
        const stepT = progress - curStep;

        // Draw completed steps
        let x = 0, y = 0;
        for (let k = 0; k < Math.min(curStep, totalSteps); k++) {
            const prevX = x, prevY = y;
            if (k < m) { x += 1; } else { y += 1; }
            const color = k < m ? C.accent : C.warm;
            drawScreenArrow({ x: prevX, y: prevY }, { x, y }, color, 2.5);
            drawDot(x, y, 4, color);
        }

        // Draw current step in progress
        if (curStep < totalSteps) {
            const prevX = x, prevY = y;
            let dx = 0, dy = 0;
            const color = curStep < m ? C.accent : C.warm;
            if (curStep < m) { dx = stepT; } else { dy = stepT; }
            drawScreenArrow(
                { x: prevX, y: prevY },
                { x: prevX + dx, y: prevY + dy },
                color, 2.5
            );
        }

        // Ghost lattice
        _drawLatticeFaint(m, n);

        // Origin dot
        drawDot(0, 0, 5, '#fff');

        // Target dot
        if (t >= 1) {
            drawDot(m, n, 7, C.violet);
            drawLabel(m, n, `(${m}, ${n})`, C.violet, {
                dx: 10, dy: -10, font: '600 13px Inter, sans-serif',
            });
        }

        const stepsStr = curStep < m
            ? `Applying T₁ (step ${curStep + 1} of ${m})…`
            : curStep < totalSteps
            ? `Applying T₂ (step ${curStep - m + 1} of ${n})…`
            : `Arrived at (${m}, ${n}) = T₁^${m} ∘ T₂^${n} !`;
        setInfo(stepsStr);

    } else if (state.combinePhase === 'combining') {
        // Animate a direct diagonal arrow from origin to (m, n)
        const curX = m * t;
        const curY = n * t;

        // Ghost the step-by-step path
        let px = 0, py = 0;
        for (let k = 0; k < m; k++) {
            drawScreenArrow({ x: px, y: py }, { x: px + 1, y: py }, C.accent + '30', 1.5);
            px += 1;
            drawDot(px, py, 2, C.accent + '30');
        }
        for (let k = 0; k < n; k++) {
            drawScreenArrow({ x: px, y: py }, { x: px, y: py + 1 }, C.warm + '30', 1.5);
            py += 1;
            drawDot(px, py, 2, C.warm + '30');
        }

        // The combined arrow
        drawScreenArrow({ x: 0, y: 0 }, { x: curX, y: curY }, C.violet, 3.5);

        // Parallelogram fill
        if (t > 0.2) {
            drawPoly(
                [{ x: 0, y: 0 }, { x: m, y: 0 }, { x: m, y: n }, { x: 0, y: n }],
                'rgba(167,139,250,0.04)', 'rgba(167,139,250,0.1)', 1
            );
        }

        _drawLatticeFaint(m, n);
        drawDot(0, 0, 5, '#fff');

        if (t >= 1) {
            drawDot(m, n, 7, C.violet);
            drawLabel(m, n, `(${m}, ${n})`, C.violet, {
                dx: 10, dy: -10, font: '700 13px Inter, sans-serif',
            });
        }

        // Show the formula
        drawLabel(curX / 2, curY / 2, `${m}·T₁ + ${n}·T₂`, C.violet, {
            dx: 12, dy: -12, font: '600 12px Inter, sans-serif',
        });

        setInfo(t >= 1
            ? `Combining: ${m}·T₁ + ${n}·T₂ is itself a new translation!`
            : 'Combining two translations into one…');
    }
}

/** Draw faint lattice dots for context */
function _drawLatticeFaint(mMax, nMax) {
    const limit = Math.max(mMax, nMax, 4) + 1;
    for (let i = -1; i <= limit; i++) {
        for (let j = -1; j <= limit; j++) {
            if (i === 0 && j === 0) continue;
            const dist = Math.sqrt(i * i + j * j);
            const a = Math.max(0.04, 0.18 - dist * 0.02);
            drawDot(i, j, 2, `rgba(167,139,250,${a})`);
        }
    }
}

/* ═══════════════════════════════════════════════════════
   STEP 3 — The Placemat (Dihedral Group)
   ═══════════════════════════════════════════════════════ */

const PM_W = 2.5, PM_H = 1.5;
const PM_RECT = [
    { x: -PM_W, y: -PM_H }, { x: PM_W, y: -PM_H },
    { x: PM_W, y: PM_H },   { x: -PM_W, y: PM_H },
];
const PM_CORNERS = [
    { base: { x: -PM_W, y: PM_H },  color: C.accent },
    { base: { x: PM_W, y: PM_H },   color: C.warm },
    { base: { x: PM_W, y: -PM_H },  color: C.teal },
    { base: { x: -PM_W, y: -PM_H }, color: C.violet },
];
const PM_TFS = {
    'pm-rot':   rotateTf(180),
    'pm-flipH': reflectTf(0),
    'pm-flipV': reflectTf(90),
};

export function drawStep3() {
    clear(); drawGrid();

    let acc = identityTf();
    const seq = state.pmSequence;
    const t = ease(state.pmT);

    if (state.pmPhase === 'playing') {
        const nn = seq.length;
        const p = t * nn;
        const ci = Math.floor(p);
        const ct = p - ci;
        for (let i = 0; i < Math.min(ci, nn); i++) acc = composeTf(acc, PM_TFS[seq[i]]);
        if (ci < nn) acc = composeTf(acc, lerpTf(PM_TFS[seq[ci]], ct));
        setInfo(ci < nn ? `Applying ${seq[ci].replace('pm-', '')}…` : 'Done! The result is another symmetry of the rectangle.');
    } else {
        for (const op of seq) acc = composeTf(acc, PM_TFS[op]);
        setInfo(seq.length
            ? `Sequence of ${seq.length} operations. Press Play to animate.`
            : 'Add symmetries to the sequence using the buttons above.');
    }

    drawPoly(PM_RECT, 'rgba(124,138,255,0.03)', 'rgba(124,138,255,0.08)', 1);
    const rect = PM_RECT.map(p => applyTf(acc, p));
    drawPoly(rect, 'rgba(245,158,11,0.06)', C.warm, 2);
    PM_CORNERS.forEach(({ base, color }) => {
        const tp = applyTf(acc, base);
        drawDot(tp.x, tp.y, 7, color);
    });
    PM_CORNERS.forEach(({ base, color }) => {
        drawDot(base.x, base.y, 4, color + '30');
    });
    drawFrame(acc, { size: 0.8, lw: 2.5, dotRadius: 4 });
}

/* ═══════════════════════════════════════════════════════
   STEP 4 — Groups from Generators
   ═══════════════════════════════════════════════════════ */

export function drawStep4() {
    clear(); drawGrid();

    let generator, infoStr;
    if (state.genType === 'gen-translate') {
        generator = translateTf(0, 1.5);
        infoStr = `Translation by 1.5 → generates ℤ (${state.genDepth * 2 + 1} elements shown)`;
    } else if (state.genType === 'gen-rot60') {
        generator = rotateTf(60);
        infoStr = 'Rotation 60° → generates ℤ/6 (cyclic group of order 6)';
    } else {
        generator = rotateTf(90);
        infoStr = 'Rotation 90° → generates ℤ/4 (cyclic group of order 4)';
    }
    setInfo(infoStr);

    const inv = inverseTf(generator);
    const elems = [identityTf()];
    let fwd = identityTf(), bwd = identityTf();
    for (let i = 0; i < state.genDepth; i++) {
        fwd = composeTf(fwd, generator);
        bwd = composeTf(bwd, inv);
        elems.push({ ...fwd }, { ...bwd });
    }

    drawFrame(identityTf(), { showLabels: true });
    elems.forEach((tf, idx) => {
        if (idx === 0) return;
        const hue = (idx / elems.length) * 360;
        const a = Math.max(0.15, 1 - idx / elems.length * 0.6);
        drawFrame(tf, {
            color1: `hsla(${hue}, 70%, 55%, ${a})`,
            color2: `hsla(${(hue + 40) % 360}, 70%, 55%, ${a})`,
            lw: 2, dotRadius: 3,
            dotColor: `hsla(${hue}, 70%, 75%, ${a * 0.8})`,
            alpha: a,
        });
    });

    if (state.genType === 'gen-translate') {
        drawScreenArrow({ x: 0, y: -0.5 }, { x: 1.5, y: -0.5 }, 'rgba(245,158,11,0.5)', 2);
    } else {
        drawDot(0, 0, 7, C.teal);
    }
}

/* ═══════════════════════════════════════════════════════
   STEP 5 — Commuting Translations
   ═══════════════════════════════════════════════════════ */

export function drawStep5() {
    clear(); drawGrid();

    const θ1 = state.commDir1 * Math.PI / 180;
    const θ2 = state.commDir2 * Math.PI / 180;
    const v1 = { x: state.commD1 * Math.cos(θ1), y: state.commD1 * Math.sin(θ1) };
    const v2 = { x: state.commD2 * Math.cos(θ2), y: state.commD2 * Math.sin(θ2) };

    const o  = { x: -1, y: -0.5 };
    const a  = { x: o.x + v1.x, y: o.y + v1.y };
    const b  = { x: o.x + v2.x, y: o.y + v2.y };
    const f  = { x: o.x + v1.x + v2.x, y: o.y + v1.y + v2.y };

    drawPoly([o, a, f, b], 'rgba(167,139,250,0.06)', null);
    drawScreenArrow(o, a, 'rgba(124,138,255,0.7)', 2.5);
    drawScreenArrow(a, f, 'rgba(124,138,255,0.35)', 2);
    drawScreenArrow(o, b, 'rgba(245,158,11,0.7)', 2.5);
    drawScreenArrow(b, f, 'rgba(245,158,11,0.35)', 2);
    drawLabel((o.x + a.x) / 2, (o.y + a.y) / 2, 'v₁', C.accent, { dx: 10, dy: -10 });
    drawLabel((o.x + b.x) / 2, (o.y + b.y) / 2, 'v₂', C.warm,   { dx: 10, dy: -10 });

    const tfO = translateTf(0, 0);
    tfO.tx = o.x; tfO.ty = o.y;
    drawFrame(tfO, { size: 0.5, lw: 2, dotRadius: 4 });
    const tfF = { ...tfO, tx: f.x, ty: f.y };
    drawFrame(tfF, { size: 0.5, lw: 2, dotRadius: 4, color1: C.violet, color2: C.violet, dotColor: C.violet });

    drawDot(a.x, a.y, 4, 'rgba(124,138,255,0.5)');
    drawDot(b.x, b.y, 4, 'rgba(245,158,11,0.5)');

    drawLabel(f.x, f.y, 'same endpoint!', C.violet, { dx: 12, dy: -8 });
    setInfo('v₁ + v₂ = v₂ + v₁ — translations commute!');
}

/* ═══════════════════════════════════════════════════════
   STEP 6 — Different Lattices
   ═══════════════════════════════════════════════════════ */

export function drawStep6() {
    clear(); drawGrid();

    const θ1 = state.latDir1 * Math.PI / 180;
    const θ2 = state.latDir2 * Math.PI / 180;
    const v1 = { x: state.latD1 * Math.cos(θ1), y: state.latD1 * Math.sin(θ1) };
    const v2 = { x: state.latD2 * Math.cos(θ2), y: state.latD2 * Math.sin(θ2) };

    const { w, h } = vp();
    const range = 8;

    const pts = [];
    for (let i = -range; i <= range; i++) {
        for (let j = -range; j <= range; j++) {
            const x = i * v1.x + j * v2.x;
            const y = i * v1.y + j * v2.y;
            const [sx] = toS(x, y);
            if (sx > -80 && sx < w + 80) {
                pts.push({ x, y, i, j });
            }
        }
    }

    pts.forEach(({ x, y, i, j }) => {
        const tile = [
            { x, y },
            { x: x + v1.x, y: y + v1.y },
            { x: x + v1.x + v2.x, y: y + v1.y + v2.y },
            { x: x + v2.x, y: y + v2.y },
        ];
        const hue = ((i + j + 20) * 37) % 360;
        drawPoly(tile, `hsla(${hue},45%,50%,0.04)`, `hsla(${hue},45%,50%,0.1)`, 0.5);
    });

    pts.forEach(({ x, y, i, j }) => {
        const dist = Math.sqrt(x * x + y * y);
        const a = Math.max(0.15, 1 - dist / 12);
        const hue = ((i + j + 20) * 37) % 360;
        const isOrigin = i === 0 && j === 0;
        drawDot(x, y, isOrigin ? 5 : 3, isOrigin ? C.accent : `hsla(${hue},60%,60%,${a})`);
    });

    drawScreenArrow({ x: 0, y: 0 }, v1, C.accent, 3);
    drawScreenArrow({ x: 0, y: 0 }, v2, C.warm, 3);
    drawLabel(v1.x / 2, v1.y / 2, 'v₁', C.accent, { dx: 10, dy: -10, font: '700 13px Inter, sans-serif' });
    drawLabel(v2.x / 2, v2.y / 2, 'v₂', C.warm, { dx: 10, dy: -10, font: '700 13px Inter, sans-serif' });

    drawPoly([{ x: 0, y: 0 }, v1, { x: v1.x + v2.x, y: v1.y + v2.y }, v2],
        'rgba(167,139,250,0.08)', C.violet, 2);
    drawLabel((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, 'fundamental', C.violet,
        { dy: -6, align: 'center', font: '500 11px Inter, sans-serif' });
    drawLabel((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, 'domain', C.violet,
        { dy: 8, align: 'center', font: '500 11px Inter, sans-serif' });

    drawFrame(identityTf(), { showLabels: false, size: 0.7, lw: 2 });

    setInfo('Lattice ℤv₁ + ℤv₂ — changing generators changes the pattern');
}
