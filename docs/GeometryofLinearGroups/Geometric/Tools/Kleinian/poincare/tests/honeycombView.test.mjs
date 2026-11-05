import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHoneycombView } from '../js/honeycombView.js';
import { Matrix2x2 } from '../js/math.js';
import { buildGroup } from '../js/matrixInput.js';
import { exampleLibrary } from '../js/groupLibrary.js';
import { runCompute, matToArr } from '../js/compute.js';
import { serializeTowerContext } from '../js/tower.js';
import { deserializeDomain } from '../js/domain.js';
import { computeDelaunayDomain } from '../js/delaunay.js';

test('honeycomb renders both domains, adjusts faces, and clears old geometry', () => {
    const ex = exampleLibrary.find(e => e.name === 'Figure eight knot group');
    const { matrices, exactCtx } = buildGroup({ mats: ex.mats, anti: ex.anti || [], consts: ex.consts || [] });
    const out = runCompute(JSON.parse(JSON.stringify({ gens: matrices.map(matToArr), origGens: matrices.map(matToArr), B: matToArr(Matrix2x2.identity()), maxFaces: 96, maxDepth: ex.depth || 8, fullDirichlet: false, exact: exactCtx ? serializeTowerContext(exactCtx) : null })));
    const home = deserializeDomain(out.domain);
    const dl = computeDelaunayDomain(home, { dim: 3 });
    assert.ok(dl.ok);
    const scene = new THREE.Scene(), view = createHoneycombView(scene);
    const colors = home.walls.map(() => [0.5, 0.6, 0.8]);
    const dlColors = dl.sides.map(() => [0.5, 0.6, 0.8]);
    for (const domain of [null, dl]) {
        view.rebuild(home, out.report, colors, domain, dlColors, 'dark');
        view.setFrame(Matrix2x2.identity());
        view.setWalls(0.5); view.setFaces(0.8); view.setVisible(true);
        const group = scene.children[0];
        assert.ok(group.visible);
        assert.ok(group.children.every(m => m.isInstancedMesh));
        assert.ok(group.children[0].count > 1);
        assert.ok(Math.abs(group.children[1].material.uniforms.u_opacity.value - 0.08) < 1e-9);
        const material = group.children[2].material;
        assert.equal(material.uniforms.u_faceFill.value, 0.8);
        assert.equal(material.uniforms.u_banded.value, !domain);
        if (!domain) {
            const values = group.children[2].geometry.getAttribute('a_faceDistance').array;
            assert.ok(values.some(x => x < 0.05), 'face edges start unfilled');
            assert.ok(values.some(x => x > 0.5), 'face centers fill later');
        } else assert.ok(Math.abs(material.uniforms.u_opacity.value - 0.52) < 1e-9);
    }
    view.rebuild(null, null, [], null, [], 'light');
    assert.equal(scene.children[0].children.length, 0);
});
