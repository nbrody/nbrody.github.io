// ─────────────────────────────────────────────────
// Main — wires modules + UI controls
// ─────────────────────────────────────────────────

import {
    onChange, notify, foldAngles, params,
    setCreaseType, setCreaseAngle, creaseType, creaseAngle, corners
} from './state.js';
import { getOctagonVertices, to3D, rodrigues } from './geometry.js';
import * as editor from './editor2d.js';
import * as viewer from './viewer3d.js';
import * as THREE from 'three';

// 2D params → rebuild 3D
onChange(() => { viewer.rebuild(); });

// ── Fold angle sliders ───────────────────────────
for (let i = 0; i < 4; i++) {
    const slider = document.getElementById('fold-slider-' + i);
    const valEl = document.getElementById('fold-val-' + i);
    slider.addEventListener('input', () => {
        const deg = parseFloat(slider.value);
        foldAngles[i] = deg * Math.PI / 180;
        valEl.textContent = Math.round(deg) + '°';
        viewer.rebuild();
    });
}

// ── Crease toggle buttons ────────────────────────
const creaseButtons = document.querySelectorAll('.crease-btn');
const creaseSliderRow = document.getElementById('crease-slider-row');
const creaseSlider = document.getElementById('crease-slider');
const creaseVal = document.getElementById('crease-val');

creaseButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        creaseButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const type = btn.dataset.crease;
        setCreaseType(type);

        if (type === 'none') {
            creaseSliderRow.style.display = 'none';
            setCreaseAngle(0);
            creaseSlider.value = 0;
            creaseVal.textContent = '0°';
        } else {
            creaseSliderRow.style.display = 'flex';
        }
        viewer.rebuild();
    });
});

creaseSlider.addEventListener('input', () => {
    const deg = parseFloat(creaseSlider.value);
    setCreaseAngle(deg * Math.PI / 180);
    creaseVal.textContent = Math.round(deg) + '°';
    viewer.rebuild();
});

// ── Resize & init ────────────────────────────────
function onResize() {
    editor.resize();
    viewer.resize();
    editor.draw();
    viewer.rebuild();
}

window.addEventListener('resize', onResize);
onResize();
viewer.animate();

// ── Fold to Point ────────────────────────────────

const foldToPointBtn = document.getElementById('fold-to-point-btn');

foldToPointBtn.addEventListener('click', () => {
    // 1. Common Setup
    const verts2 = getOctagonVertices(corners, params.a, params.b, params.c, params.d);
    const Pa = to3D(verts2[1]), Pb = to3D(verts2[3]), Pc = to3D(verts2[5]), Pd = to3D(verts2[7]);
    const V0 = to3D(verts2[0]), V1 = to3D(verts2[2]), V2 = to3D(verts2[4]), V3 = to3D(verts2[6]);
    const Ra = V0.distanceTo(Pa), Rb = V1.distanceTo(Pb), Rc = V2.distanceTo(Pc), Rd = V3.distanceTo(Pd);

    function trySolve(diagType) {
        let fixedPts, fixedRadii, movedPt, movedRadius, movedIdx, axisPts;

        if (diagType === 'ac') {
            // axis Pa-Pc moves Pd(3)
            fixedPts = [Pa, Pb, Pc];
            fixedRadii = [Ra, Rb, Rc];
            movedPt = Pd;
            movedRadius = Rd;
            axisPts = [Pa, Pc];
        } else {
            // axis Pb-Pd moves Pc(2)
            fixedPts = [Pa, Pb, Pd];
            fixedRadii = [Ra, Rb, Rd];
            movedPt = Pc;
            movedRadius = Rc;
            axisPts = [Pb, Pd];
        }

        // Apex Q from fixed spheres
        const P1 = new THREE.Vector3(0, 0, 0);
        const P2 = new THREE.Vector3().subVectors(fixedPts[1], fixedPts[0]);
        const P3 = new THREE.Vector3().subVectors(fixedPts[2], fixedPts[0]);

        const d = P2.length();
        const ex = P2.clone().normalize();
        const i = P3.dot(ex);
        const ey = new THREE.Vector3().subVectors(P3, ex.clone().multiplyScalar(i)).normalize();
        const ez = new THREE.Vector3(0, 1, 0);
        const j = P3.dot(ey);

        const r1 = fixedRadii[0], r2 = fixedRadii[1], r3 = fixedRadii[2];
        const x = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const y = ((r1 * r1 - r3 * r3 + i * i + j * j) / (2 * j)) - (i / j) * x;
        const zSq = r1 * r1 - x * x - y * y;
        if (zSq < 0) return null;

        const Q = fixedPts[0].clone().add(ex.clone().multiplyScalar(x)).add(ey.clone().multiplyScalar(y)).add(ez.clone().multiplyScalar(Math.sqrt(zSq)));

        // Crease angle phi
        const axis = new THREE.Vector3().subVectors(axisPts[1], axisPts[0]).normalize();
        const pivot = axisPts[0];
        const relM = new THREE.Vector3().subVectors(movedPt, pivot);
        const projM = axis.clone().multiplyScalar(relM.dot(axis));
        const perpM = new THREE.Vector3().subVectors(relM, projM);
        const perpLen = perpM.length();

        const V = new THREE.Vector3().subVectors(Q, pivot).sub(projM);
        const dir = new THREE.Vector3().crossVectors(axis, perpM);
        const A = -2 * V.dot(perpM), B = -2 * V.dot(dir);
        const C = movedRadius * movedRadius - V.lengthSq() - perpLen * perpLen;

        const R = Math.sqrt(A * A + B * B);
        if (Math.abs(C) > R) return null;

        const phi = Math.atan2(B, A) + Math.acos(C / R);

        // Fold Angles
        function getFoldAngle(cornerFlat, h1, h2, target) {
            const axis = new THREE.Vector3().subVectors(h2, h1).normalize();
            const relC = new THREE.Vector3().subVectors(cornerFlat, h1);
            const relT = new THREE.Vector3().subVectors(target, h1);
            const perpC = new THREE.Vector3().subVectors(relC, axis.clone().multiplyScalar(relC.dot(axis)));
            const perpT = new THREE.Vector3().subVectors(relT, axis.clone().multiplyScalar(relT.dot(axis)));
            return perpC.angleTo(perpT);
        }

        const movedPtFinal = pivot.clone().add(rodrigues(relM, axis, phi));
        let theta;
        if (diagType === 'ac') {
            const V0c = Pa.clone().add(rodrigues(new THREE.Vector3().subVectors(V0, Pa), axis, phi));
            const V3c = Pa.clone().add(rodrigues(new THREE.Vector3().subVectors(V3, Pa), axis, phi));
            theta = [
                getFoldAngle(V0c, movedPtFinal, Pa, Q),
                getFoldAngle(V1, Pa, Pb, Q),
                getFoldAngle(V2, Pb, Pc, Q),
                getFoldAngle(V3c, Pc, movedPtFinal, Q)
            ];
        } else {
            const V2c = Pb.clone().add(rodrigues(new THREE.Vector3().subVectors(V2, Pb), axis, phi));
            const V3c = Pb.clone().add(rodrigues(new THREE.Vector3().subVectors(V3, Pb), axis, phi));
            theta = [
                getFoldAngle(V0, Pd, Pa, Q),
                getFoldAngle(V1, Pa, Pb, Q),
                getFoldAngle(V2c, Pb, movedPtFinal, Q),
                getFoldAngle(V3c, movedPtFinal, Pd, Q)
            ];
        }

        return { phi, theta, diagType };
    }

    let solution = trySolve('ac');
    if (!solution) solution = trySolve('bd');

    if (!solution) {
        alert("Parameters do not allow a closed polyhedron solution on either diagonal.");
        return;
    }

    // 5. Animate
    const { phi, theta, diagType } = solution;
    const startTheta = [...foldAngles];
    const startPhi = creaseType === diagType ? creaseAngle : 0;
    const duration = 1200;
    const startTime = performance.now();

    setCreaseType(diagType);
    document.querySelectorAll('.crease-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.crease === diagType);
    });
    creaseSliderRow.style.display = 'flex';

    function animateFold(time) {
        const t = Math.min(1, (time - startTime) / duration);
        const ease = t * t * (3 - 2 * t);
        for (let i = 0; i < 4; i++) foldAngles[i] = startTheta[i] + (theta[i] - startTheta[i]) * ease;
        setCreaseAngle(startPhi + (phi - startPhi) * ease);
        viewer.syncSlidersFromState();
        creaseSlider.value = Math.round(creaseAngle * 180 / Math.PI);
        creaseVal.textContent = creaseSlider.value + '°';
        viewer.rebuild();
        if (t < 1) requestAnimationFrame(animateFold);
    }
    requestAnimationFrame(animateFold);
});

// Typeset MathJax after DOM is ready
if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise();
}
