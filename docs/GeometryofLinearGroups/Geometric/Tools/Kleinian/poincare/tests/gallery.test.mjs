import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { encodeState, decodeState } from '../js/permalink.js';
import { buildGroup } from '../js/matrixInput.js';
import { runCompute, matToArr } from '../js/compute.js';
import { serializeTowerContext } from '../js/tower.js';
import { Matrix2x2, translationTowards } from '../js/math.js';
import * as THREE from 'three';
import { GALLERY_ITEMS, GALLERY_CATEGORIES } from '../js/gallery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POINCARE_DIR = path.resolve(__dirname, '..');

test('permalink encodeState / decodeState round-trips view modes and camera pose', () => {
    const sample = {
        v: 1,
        mats: [['1', '1+i', '0', '1'], ['0', '-1', '1', '0']],
        limit: true,
        limitDepth: 96,
        poly: 0.25,
        cycles: true,
        palette: 'tokyoNight',
        model: 'uhs',
        cut: 1.8,
        spin: false,
        cam: { pos: [1.4, 2.2, 1.8], tgt: [0, 0.3, 0] },
    };
    const hash = encodeState(sample);
    assert.ok(hash.startsWith('#s='), 'encoded payload starts with #s=');
    const decoded = decodeState(hash);
    assert.deepEqual(decoded, sample);
    // Also accepts full URL or bare base64url
    assert.deepEqual(decodeState(`https://example.org/poincare/index.html${hash}`), sample);
    assert.deepEqual(decodeState(hash.slice(3)), sample);
    assert.equal(decodeState('#invalid'), null);
});

test('every gallery item stores a valid #s= link payload, preview image, and category', () => {
    assert.ok(GALLERY_ITEMS.length >= 12, 'gallery should have a rich set of curated scenes');
    const validCats = new Set(GALLERY_CATEGORIES.map(c => c.id));
    const seenIds = new Set();
    const seenPayloads = new Set();

    for (const item of GALLERY_ITEMS) {
        assert.ok(item.id && !seenIds.has(item.id), `unique id required: ${item.id}`);
        seenIds.add(item.id);
        assert.ok(item.title && item.desc && item.group, `metadata required for ${item.id}`);
        assert.ok(validCats.has(item.cat), `valid category required for ${item.id}: ${item.cat}`);
        assert.equal(typeof item.payload, 'string', `payload must be a link string for ${item.id}`);
        assert.ok(item.payload.startsWith('#s='), `payload must start with #s= for ${item.id}`);
        assert.equal('state' in item, false, `gallery item ${item.id} should store only the link payload, not raw state`);
        assert.ok(!seenPayloads.has(item.payload), `duplicate payload on ${item.id}`);
        seenPayloads.add(item.payload);

        const imgPath = path.join(POINCARE_DIR, 'gallery', `${item.id}.webp`);
        assert.ok(fs.existsSync(imgPath), `preview image missing for ${item.id}: ${imgPath}`);
        const stat = fs.statSync(imgPath);
        assert.ok(stat.size > 1000, `preview image appears empty for ${item.id}`);
    }
});

test('every gallery payload decodes, parses its group, and computes a non-empty domain', () => {
    const models = new Set();
    const modes = new Set();

    for (const item of GALLERY_ITEMS) {
        const st = decodeState(item.payload);
        assert.ok(st && st.v === 1, `failed to decode payload for ${item.id}`);

        models.add(st.model || 'ball');
        if (st.limit) modes.add('limit');
        if (st.mirror) modes.add('mirror');
        if (st.tieDye) modes.add('tieDye');
        if (st.honeycomb) modes.add('honeycomb');
        if (st.tiling) modes.add('tiling');
        if (st.manifold) modes.add('manifold');
        if (st.insideHc) modes.add('insideHc');
        if (st.dom === 'delaunay') modes.add('delaunay');
        if (st.cusp !== undefined) modes.add('cusp');
        if (st.plane) modes.add('plane');

        const built = buildGroup(st);
        assert.ok(built.matrices.length >= 1, `no generators parsed for ${item.id}`);

        let B = Matrix2x2.identity();
        if (Array.isArray(st.bp) && st.bp.length === 3) {
            const r = Math.hypot(...st.bp);
            if (r > 1e-9) {
                B = translationTowards(
                    new THREE.Vector3(st.bp[0] / r, st.bp[1] / r, st.bp[2] / r),
                    2 * Math.atanh(Math.min(r, 0.999))
                );
            }
        }
        const Bi = B.inv().normalized();
        const homeGens = built.matrices.map(g => Bi.mul(g).mul(B).normalized());

        const res = runCompute({
            gens: homeGens.map(matToArr),
            origGens: built.matrices.map(matToArr),
            B: matToArr(B),
            maxFaces: st.faces || 96,
            maxDepth: st.depth || 8,
            fullDirichlet: !!st.full,
            exact: built.exactCtx ? serializeTowerContext(built.exactCtx) : null,
            ford: st.cusp !== undefined ? { cusp: st.cusp } : null,
        });
        assert.ok(res.domain && res.domain.walls.length >= 3, `domain failed for ${item.id}`);
    }

    assert.ok(models.has('ball') && models.has('uhs'), 'gallery should cover both ball and upper half-space models');
    for (const m of ['limit', 'mirror', 'tieDye', 'honeycomb', 'manifold', 'delaunay', 'cusp', 'plane']) {
        assert.ok(modes.has(m), `gallery should include ${m} mode`);
    }
});
