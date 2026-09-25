import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConfiguration, gramFromRelations, relationsFromGram } from '../js/groups.js';
import { presets } from '../js/library.js';

test('all presets rebuild identically and keep their visible mirrors inside the clip', () => {
    for (const preset of presets) {
        const config = buildConfiguration(preset);
        assert.deepEqual(buildConfiguration(preset), config, preset.key);
        assert.ok(config.realized, preset.key);
        assert.ok(config.gram.flat().every(Number.isFinite), preset.key);
        const enclosing = config.mirrors.some(m => m.kind === 'sphere' && m.r < 0);
        if (enclosing) continue;
        for (const mirror of config.mirrors) {
            if (mirror.kind !== 'sphere') continue;
            const distance = Math.hypot(...mirror.c.map((v, k) => v - config.bound.center[k]));
            assert.ok(distance + mirror.r <= config.bound.radius + 1e-7, preset.key);
        }
    }
});

test('raw inversive products survive editing a different relation', () => {
    const gram = [[1, 0.42, -1.2], [0.42, 1, -1], [-1.2, -1, 1]];
    const relations = relationsFromGram(gram);
    relations[1][2] = relations[2][1] = { type: 'angle', m: 3 };
    const edited = gramFromRelations(relations);
    assert.equal(edited[0][1], 0.42);
    assert.ok(edited.flat().every(Number.isFinite));
    assert.ok(Math.abs(edited[1][2] + 0.5) < 1e-12);
});

test('five mutually orthogonal mirrors report an unrealizable configuration', () => {
    const relations = Array.from({ length: 5 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => i === j ? null : { type: 'angle', m: 2 }));
    const config = buildConfiguration({ relations });
    assert.equal(config.realized, false);
    assert.deepEqual(config.mirrors, []);
});
