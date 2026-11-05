import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createQuestTiling } from '../js/questTiling.js';
import { Matrix2x2 } from '../js/math.js';
import { buildGroup } from '../js/matrixInput.js';
import { exampleLibrary } from '../js/groupLibrary.js';
import { runCompute, matToArr } from '../js/compute.js';
import { serializeTowerContext } from '../js/tower.js';
import { deserializeDomain } from '../js/domain.js';

test('Quest outside tiling builds and updates for closed and cusped domains', () => {
    for (const name of ['Weeks manifold (closed)', 'PSL(2,Z[w])']) {
        const ex = exampleLibrary.find(e => e.name === name);
        const { matrices, exactCtx } = buildGroup({ mats: ex.mats, anti: ex.anti || [], consts: ex.consts || [] });
        const result = runCompute(JSON.parse(JSON.stringify({ gens: matrices.map(matToArr), origGens: matrices.map(matToArr), B: matToArr(Matrix2x2.identity()), maxFaces: 96, maxDepth: ex.depth || 8, fullDirichlet: false, exact: exactCtx ? serializeTowerContext(exactCtx) : null })));
        const home = deserializeDomain(result.domain);
        const scene = new THREE.Scene();
        const honey = createQuestTiling(scene);
        honey.rebuild(home, result.report, home.walls.map(() => [0.6, 0.6, 0.8]), 'light');
        honey.setFrame(Matrix2x2.identity());
        honey.setVisible(true);
        assert.equal(scene.children[0].visible, true);
        assert.ok(scene.children[0].children.some(x => x.isInstancedMesh && x.count > 1), name);
        assert.equal(scene.children[1].visible, true);
        honey.rebuild(null, null, [], 'dark');
        assert.equal(scene.children[0].children.length, 0);
    }
});
