/**
 * Smooth after folding a sphere mosaic: CUBE_ADJ (smooth3d.js) must glue
 * the cube faces the way cube3d.js folds them.
 *
 * For each of the 8 cube vertices it draws the little loop around that
 * vertex (one corner arc in each of the three faces meeting there), folds
 * the cube, and walks it with the sphere extractor. A wrong `flip` sends
 * the strand to the opposite end of the shared edge, so the walk either
 * throws "Connection mismatch" or jumps across the cube.
 *
 * Run: node docs/topology/knotTheory/knotMosaics/test_sphere_fold.js
 * (uses the site's vendored three.js module from the Kleinian tools).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const el = () => ({
    style: {}, textContent: '', classList: { toggle() {} },
    addEventListener() {},
});
const ctx = {
    console, Math, Map, Set, Array, Object, Float32Array, Float64Array,
    document: { getElementById: el },
    addEventListener() {},
};
ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
const THREE_PATH = path.join(dir,
    '../../../GeometryofLinearGroups/Geometric/Tools/Kleinian/vendor/three/three.module.js');

(async () => {
const THREE = await import(require('url').pathToFileURL(THREE_PATH).href);
ctx.THREE = THREE;
vm.runInContext(fs.readFileSync(path.join(dir, 'smooth3d.js'), 'utf8'), ctx);

// The folded cube exactly as cube3d.js builds it (buildNet + FOLD_TARGETS).
const H = Math.PI / 2;
const root = new THREE.Group();
const pivots = {}, meshPos = { front: [0, 0, 0] };
for (const [n, px, py, mx, my, axis, angle] of [
    ['top', 0, 0.5, 0, 0.5, 'x', -H], ['bottom', 0, -0.5, 0, -0.5, 'x', H],
    ['left', -0.5, 0, -0.5, 0, 'y', -H], ['right', 0.5, 0, 0.5, 0, 'y', H]]) {
    pivots[n] = new THREE.Group();
    pivots[n].position.set(px, py, 0);
    pivots[n].rotation[axis] = angle;
    root.add(pivots[n]);
    meshPos[n] = [mx, my, 0];
}
pivots.back = new THREE.Group();
pivots.back.position.set(1, 0, 0);
pivots.back.rotation.y = H;
pivots.right.add(pivots.back);
meshPos.back = [0.5, 0, 0];
root.updateMatrixWorld(true);
const faceToWorld = (face, v) => {
    const parent = face === 'front' ? root : pivots[face];
    const [x, y, z] = meshPos[face];
    return new THREE.Vector3(v.x + x, v.y + y, v.z + z).applyMatrix4(parent.matrixWorld);
};
ctx.__cubeRoot = () => ({ isFolded: () => true, faceToWorld });

const FACES = ['front', 'top', 'bottom', 'left', 'right', 'back'];
// Corner arcs (smooth3d.js tile ids): NE 3, NW 4, SE 5, SW 6.
const CORNERS = { NW: [-0.5, 0.5, 4], NE: [0.5, 0.5, 3], SW: [-0.5, -0.5, 6], SE: [0.5, -0.5, 5] };

let failed = 0;
for (const n of [2, 3]) {
    const vertices = new Map();
    for (const face of FACES) for (const [corner, [x, y]] of Object.entries(CORNERS)) {
        const w = faceToWorld(face, new THREE.Vector3(x, y, 0));
        const key = [w.x, w.y, w.z].map(t => Math.round(t * 1e6)).join(',');
        if (!vertices.has(key)) vertices.set(key, []);
        vertices.get(key).push([face, corner]);
    }
    if (vertices.size !== 8) throw new Error('fold geometry: expected 8 vertices');
    for (const [key, around] of vertices) {
        const faces = {};
        for (const f of FACES) faces[f] = Array.from({ length: n }, () => new Array(n).fill(0));
        for (const [face, corner] of around) {
            const row = corner[0] === 'N' ? 0 : n - 1;
            const col = corner[1] === 'W' ? 0 : n - 1;
            faces[face][row][col] = CORNERS[corner][2];
        }
        const name = `n=${n} vertex ${around.map(a => a.join(' ')).join(' / ')}`;
        let loops;
        try {
            loops = ctx.__smoothExtract.sphere(faces);
        } catch (e) {
            failed++; console.error('FAIL', name, '—', e.message); continue;
        }
        const pts = loops.length === 1 ? loops[0] : null;
        let maxStep = 0;
        if (pts) for (let k = 0; k < pts.length; k++) {
            maxStep = Math.max(maxStep, pts[k].distanceTo(pts[(k + 1) % pts.length]));
        }
        if (!pts || maxStep > 0.5 / n) {
            failed++; console.error('FAIL', name, '— loops', loops.length, 'max step', maxStep.toFixed(3));
        } else console.log('ok', name);
    }
}
if (failed) { console.error(failed + ' failed'); process.exit(1); }
console.log('all passed');
})();
