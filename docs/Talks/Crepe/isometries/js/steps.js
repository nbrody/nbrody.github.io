/**
 * Draw functions for each of the 7 walkthrough steps.
 */
import { state } from './state.js';
import {
    C, clear, drawGrid, drawTransformedGrid, drawFrame,
    drawScreenArrow, drawDot, drawPoly, drawDashedLine, drawLabel,
    setInfo, ease, toS, vp,
} from './drawing.js';
import {
    identityTf, translateTf, rotateTf, reflectTf,
    composeTf, inverseTf, lerpTf, applyTf,
} from './transforms.js';

/* ═══════════════════════════════════════════════════════
   STEP 0 — Rigid Motions
   ═══════════════════════════════════════════════════════ */

export function drawStep0() {
    clear(); drawGrid();

    let tf;
    if (state.isoType === 'translation') {
        tf = translateTf(state.translateDir, state.translateDist);
        setInfo(`Translation: dir ${state.translateDir}°, dist ${state.translateDist.toFixed(1)}`);
    } else if (state.isoType === 'rotation') {
        tf = rotateTf(state.rotAngle);
        setInfo(`Rotation: ${state.rotAngle}° about the origin`);
    } else {
        tf = reflectTf(state.refAxis);
        setInfo(`Reflection: mirror axis at ${state.refAxis}°`);
    }

    drawTransformedGrid(tf);
    drawFrame(identityTf(), { alpha: 0.2, showLabels: true, dotColor: 'rgba(255,255,255,0.25)' });
    drawFrame(tf, { showLabels: true });

    if (state.isoType === 'rotation') {
        drawDot(0, 0, 7, C.teal);
    }
    if (state.isoType === 'reflection') {
        const θ = state.refAxis * Math.PI / 180;
        const len = 8;
        drawDashedLine(
            { x: -len * Math.cos(θ), y: -len * Math.sin(θ) },
            { x: len * Math.cos(θ), y: len * Math.sin(θ) },
            C.teal
        );
    }
    if (state.isoType === 'translation') {
        const θ = state.translateDir * Math.PI / 180;
        const d = state.translateDist;
        drawScreenArrow({ x: 0, y: 0 },
            { x: d * Math.cos(θ), y: d * Math.sin(θ) },
            'rgba(245,158,11,0.45)', 2);
    }
}

/* ═══════════════════════════════════════════════════════
   STEP 1 — Inverses & Identity
   ═══════════════════════════════════════════════════════ */

function _invTf() {
    if (state.invType === 'inv-translate') return translateTf(30, 3);
    if (state.invType === 'inv-rotate')    return rotateTf(72);
    return reflectTf(45);
}

export function drawStep1() {
    clear(); drawGrid();
    const tf = _invTf();
    const t = ease(state.invT);

    if (state.invPhase === 'idle') {
        drawFrame(identityTf(), { showLabels: true });
        setInfo('Choose an isometry and press Apply');
    } else if (state.invPhase === 'applied') {
        const cur = lerpTf(tf, t);
        drawTransformedGrid(cur);
        drawFrame(identityTf(), { alpha: 0.15, dotColor: 'rgba(255,255,255,0.15)' });
        drawFrame(cur, { showLabels: true });
        setInfo(t >= 1 ? 'Applied! Now press Undo to see the inverse.' : 'Applying…');
    } else {
        const inv = inverseTf(tf);
        const combined = composeTf(tf, lerpTf(inv, t));
        drawTransformedGrid(combined);
        drawFrame(identityTf(), { alpha: 0.15, dotColor: 'rgba(255,255,255,0.15)' });
        drawFrame(tf, { alpha: 0.1, dotColor: 'rgba(255,255,255,0.1)' });
        drawFrame(combined, { showLabels: true });
        setInfo(t >= 1 ? 'Back to start! The inverse undid the motion.' : 'Undoing…');
    }
}

/* ═══════════════════════════════════════════════════════
   STEP 2 — Composing Symmetries
   ═══════════════════════════════════════════════════════ */

function _compA() { return state.compA === 'translate' ? translateTf(0, 2.5) : rotateTf(45); }
function _compB() { return state.compB === 'translate' ? translateTf(90, 2)  : rotateTf(30, 2, 0); }

export function drawStep2() {
    clear(); drawGrid();
    const tfA = _compA(), tfB = _compB();
    const t = ease(state.compT);

    if (state.compPhase === 'idle') {
        drawFrame(identityTf(), { showLabels: true });
        setInfo(`Compose ${state.compIter} isometr${state.compIter > 1 ? 'ies' : 'y'}. Press Compose.`);
        return;
    }

    const total = state.compIter;
    const progress = t * total;
    const cur = Math.floor(progress);
    const stepT = progress - cur;

    let acc = identityTf();
    for (let i = 0; i < Math.min(cur, total); i++) {
        acc = composeTf(acc, i % 2 === 0 ? tfA : tfB);
    }

    // ghost intermediate frames
    let ghost = identityTf();
    for (let i = 0; i < Math.min(cur, total); i++) {
        ghost = composeTf(ghost, i % 2 === 0 ? tfA : tfB);
        drawFrame(ghost, { alpha: 0.12, dotColor: 'rgba(255,255,255,0.1)', lw: 1.5 });
    }

    if (cur < total) {
        const which = cur % 2 === 0 ? tfA : tfB;
        acc = composeTf(acc, lerpTf(which, stepT));
    }

    drawTransformedGrid(acc);
    drawFrame(identityTf(), { alpha: 0.15, dotColor: 'rgba(255,255,255,0.15)' });
    drawFrame(acc, { showLabels: true });

    setInfo(t >= 1
        ? `Composed ${total} isometr${total > 1 ? 'ies' : 'y'} → a new symmetry!`
        : `Step ${cur + 1} of ${total}…`);
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
    { base: { x: -PM_W, y: PM_H },  color: C.accent },  // TL
    { base: { x: PM_W, y: PM_H },   color: C.warm },    // TR
    { base: { x: PM_W, y: -PM_H },  color: C.teal },    // BR
    { base: { x: -PM_W, y: -PM_H }, color: C.violet },  // BL
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
        const n = seq.length;
        const p = t * n;
        const ci = Math.floor(p);
        const ct = p - ci;

        for (let i = 0; i < Math.min(ci, n); i++) acc = composeTf(acc, PM_TFS[seq[i]]);
        if (ci < n) acc = composeTf(acc, lerpTf(PM_TFS[seq[ci]], ct));

        setInfo(ci < n ? `Applying ${seq[ci].replace('pm-', '')}…` : 'Done! The result is another symmetry of the rectangle.');
    } else {
        for (const op of seq) acc = composeTf(acc, PM_TFS[op]);
        setInfo(seq.length
            ? `Sequence of ${seq.length} operations. Press Play to animate.`
            : 'Add symmetries to the sequence using the buttons above.');
    }

    // ghost original
    drawPoly(PM_RECT, 'rgba(124,138,255,0.03)', 'rgba(124,138,255,0.08)', 1);

    // transformed rectangle
    const rect = PM_RECT.map(p => applyTf(acc, p));
    drawPoly(rect, 'rgba(245,158,11,0.06)', C.warm, 2);

    // colored corners
    PM_CORNERS.forEach(({ base, color }) => {
        const tp = applyTf(acc, base);
        drawDot(tp.x, tp.y, 7, color);
    });
    // ghost corners
    PM_CORNERS.forEach(({ base, color }) => {
        drawDot(base.x, base.y, 4, color + '30');
    });

    // frame at center
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

    // draw frames at each group element
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

    // parallelogram fill
    drawPoly([o, a, f, b], 'rgba(167,139,250,0.06)', null);

    // path 1: v₁ then v₂
    drawScreenArrow(o, a, 'rgba(124,138,255,0.7)', 2.5);
    drawScreenArrow(a, f, 'rgba(124,138,255,0.35)', 2);

    // path 2: v₂ then v₁
    drawScreenArrow(o, b, 'rgba(245,158,11,0.7)', 2.5);
    drawScreenArrow(b, f, 'rgba(245,158,11,0.35)', 2);

    // labels
    drawLabel((o.x + a.x) / 2, (o.y + a.y) / 2, 'v₁', C.accent, { dx: 10, dy: -10 });
    drawLabel((o.x + b.x) / 2, (o.y + b.y) / 2, 'v₂', C.warm,   { dx: 10, dy: -10 });

    // frames at corners
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

    // tiles + points
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

    // parallelogram tiles
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

    // lattice dots
    pts.forEach(({ x, y, i, j }) => {
        const dist = Math.sqrt(x * x + y * y);
        const a = Math.max(0.15, 1 - dist / 12);
        const hue = ((i + j + 20) * 37) % 360;
        const isOrigin = i === 0 && j === 0;
        drawDot(x, y, isOrigin ? 5 : 3, isOrigin ? C.accent : `hsla(${hue},60%,60%,${a})`);
    });

    // generator arrows
    drawScreenArrow({ x: 0, y: 0 }, v1, C.accent, 3);
    drawScreenArrow({ x: 0, y: 0 }, v2, C.warm, 3);
    drawLabel(v1.x / 2, v1.y / 2, 'v₁', C.accent, { dx: 10, dy: -10, font: '700 13px Inter, sans-serif' });
    drawLabel(v2.x / 2, v2.y / 2, 'v₂', C.warm, { dx: 10, dy: -10, font: '700 13px Inter, sans-serif' });

    // fundamental domain
    drawPoly([{ x: 0, y: 0 }, v1, { x: v1.x + v2.x, y: v1.y + v2.y }, v2],
        'rgba(167,139,250,0.08)', C.violet, 2);
    drawLabel((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, 'fundamental', C.violet,
        { dy: -6, align: 'center', font: '500 11px Inter, sans-serif' });
    drawLabel((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, 'domain', C.violet,
        { dy: 8, align: 'center', font: '500 11px Inter, sans-serif' });

    // frame at origin
    drawFrame(identityTf(), { showLabels: false, size: 0.7, lw: 2 });

    setInfo('Lattice ℤv₁ + ℤv₂ — changing generators changes the pattern');
}
