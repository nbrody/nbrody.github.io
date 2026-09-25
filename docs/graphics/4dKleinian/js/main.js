import { KleinianRenderer } from './render.js';
import {
    buildConfiguration,
    relationsFromGram,
    MAX_MIRRORS
} from './groups.js';
import { presets, presetsByKey, families, diagramShape } from './library.js';
import {
    generatePaletteCode,
    generateSchemeCode,
    paletteOptions,
    schemeOptions,
    paletteIndex,
    schemeIndex,
    schemes
} from './palettes.js';

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

const QUALITY = {
    draft: { stillScale: 0.7, motionScale: 0.4, maxSamples: 24, steps: 140, epsScale: 1.3, ao: 0.7, shadowSteps: 0, stepScale: 0.6 },
    balanced: { stillScale: 1.0, motionScale: 0.55, maxSamples: 96, steps: 220, epsScale: 0.8, ao: 1.0, shadowSteps: 16, stepScale: 0.55 },
    high: { stillScale: 1.0, motionScale: 0.6, maxSamples: 256, steps: 340, epsScale: 0.55, ao: 1.2, shadowSteps: 32, stepScale: 0.5 },
    print: { stillScale: 1.35, motionScale: 0.45, maxSamples: 512, steps: 480, epsScale: 0.4, ao: 1.3, shadowSteps: 40, stepScale: 0.45 }
};

const state = {
    presetKey: 'descartes',
    relations: null,
    radiusScale: 1,
    trapMode: 0,
    thickness: 0.02,
    trapRadius: 0.3,
    skipLevels: 0,
    hideOuter: true,
    cutaway: false,
    cutOffset: 0,
    cutAxis: 2,
    folds: 32,
    fov: 55,
    autoOrbit: false,
    orbitSpeed: 1,
    breathe: false,
    breatheAmount: 0.08,
    breathePeriod: 12,
    exportScale: 2,
    exportSamples: 128,
    palette: 'aurora',
    scheme: 'depth',
    modulus: 6,
    colorShift: 0,
    colorSpan: 1,
    exposure: 1.15,
    saturation: 1.04,
    vignette: 0.55,
    fog: 0.02,
    bgTop: '#0d1220',
    bgBottom: '#030407',
    quality: 'balanced',
    ...QUALITY.balanced
};

let renderer = null;
let config = null;
let breathePhase = 0;
let breatheFactor = 1;
let familyFilter = 'all';
let searchText = '';

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* configuration                                                       */
/* ------------------------------------------------------------------ */

function currentPreset() {
    return presetsByKey[state.presetKey] || presets[0];
}

/**
 * Every configuration is rescaled so the limit set has radius one, so the
 * preset's camera distance acts as a zoom factor rather than an absolute.
 */
function defaultView() {
    const radius = config ? config.frame.radius : 1;
    const center = config ? config.frame.center : [0, 0, 0];
    return { distance: (currentPreset().cameraDistance ?? 2.8) * radius, center };
}

function resetView() {
    const view = defaultView();
    renderer.resetView(view.distance, view.center);
}

function rebuild() {
    const preset = currentPreset();
    const source = state.relations ? { ...preset, relations: state.relations } : preset;
    const next = buildConfiguration(source, { radiusScale: state.radiusScale });
    const error = $('geometryError');
    if (!next.realized && config) {
        error.textContent = 'These relations cannot be realized in H⁴. Showing the last valid geometry; edit the table or press Reset to recover.';
        error.hidden = false;
        renderCoxeter();
        return;
    }
    config = next;
    error.hidden = config.realized;
    error.textContent = config.realized ? '' : 'These relations cannot be realized in H⁴. Press Reset or choose another group.';
    pushGeometryUniforms();
    updateGroupReadout();
    renderCoxeter();
    renderMirrorList();
    renderer.invalidate();
}

/**
 * Scaling every mirror about its own centre commutes with the similarity
 * used to frame the configuration, so the breathing animation can rescale
 * the radii in place instead of rebuilding (and re-framing) the group on
 * every frame.  Only the clip sphere and the trap's clearance depend on
 * the radii, and both are cheap to recompute.
 */
function breathingGeometry(factor) {
    if (factor === 1) {
        return { mirrors: config.mirrors, bound: config.bound, clearance: config.trapClearance };
    }
    const mirrors = config.mirrors.map((m) => (m.kind === 'sphere' ? { ...m, r: m.r * factor } : m));
    const c = config.bound.center;
    let radius = config.bound.radius;
    const p = config.trapCenter;
    let clearance = config.frame.radius - Math.hypot(p[0] - config.frame.center[0], p[1] - config.frame.center[1], p[2] - config.frame.center[2]);
    for (const m of mirrors) {
        if (m.kind === 'plane') {
            clearance = Math.min(clearance, m.h - (m.n[0] * p[0] + m.n[1] * p[1] + m.n[2] * p[2]));
            continue;
        }
        radius = Math.max(radius, (Math.hypot(m.c[0] - c[0], m.c[1] - c[1], m.c[2] - c[2]) + Math.abs(m.r)) * 1.001);
        const d = Math.hypot(p[0] - m.c[0], p[1] - m.c[1], p[2] - m.c[2]);
        clearance = Math.min(clearance, m.r > 0 ? d - m.r : -m.r - d);
    }
    return { mirrors, bound: { center: c, radius }, clearance: Math.max(clearance, 1e-3) };
}

function pushGeometryUniforms() {
    const uniforms = renderer.uniforms;
    const geometry = breathingGeometry(breatheFactor);
    const mirrors = geometry.mirrors.slice(0, MAX_MIRRORS);
    uniforms.uNumMirrors.value = mirrors.length;

    for (let i = 0; i < MAX_MIRRORS; i++) {
        const mirror = mirrors[i];
        if (!mirror) {
            uniforms.uMirror.value[i].set(0, 0, 0, 1);
            uniforms.uMirrorKind.value[i] = 0;
            continue;
        }
        if (mirror.kind === 'plane') {
            uniforms.uMirror.value[i].set(mirror.n[0], mirror.n[1], mirror.n[2], mirror.h);
            uniforms.uMirrorKind.value[i] = 1;
        } else {
            uniforms.uMirror.value[i].set(mirror.c[0], mirror.c[1], mirror.c[2], mirror.r);
            uniforms.uMirrorKind.value[i] = 0;
        }
    }

    uniforms.uClip.value.set(
        geometry.bound.center[0],
        geometry.bound.center[1],
        geometry.bound.center[2],
        geometry.bound.radius
    );
    uniforms.uTrapCenter.value.set(
        config.trapCenter[0],
        config.trapCenter[1],
        config.trapCenter[2]
    );
    uniforms.uTrapRadius.value = state.trapRadius * geometry.clearance;
}

/** Per-frame animation hook handed to the renderer. */
function animate(dt) {
    if (!config || !config.realized) return false;
    if (!state.breathe) {
        if (breatheFactor === 1) return false;
        breatheFactor = 1;
        pushGeometryUniforms();
        return true;
    }
    breathePhase = (breathePhase + dt / Math.max(state.breathePeriod, 0.5)) % 1;
    breatheFactor = 1 + state.breatheAmount * Math.sin(2 * Math.PI * breathePhase);
    pushGeometryUniforms();
    return true;
}

function pushRenderUniforms() {
    const uniforms = renderer.uniforms;
    uniforms.uMaxFold.value = state.folds;
    uniforms.uMaxSteps.value = state.steps;
    uniforms.uStepScale.value = state.stepScale;
    uniforms.uEpsScale.value = state.epsScale;
    uniforms.uTrapMode.value = state.trapMode;
    uniforms.uThickness.value = state.thickness;
    uniforms.uSkipLevels.value = state.skipLevels;
    uniforms.uHideOuter.value = state.hideOuter ? 1 : 0;
    uniforms.uCutaway.value = state.cutaway ? 1 : 0;
    uniforms.uCutPlane.value.set(
        state.cutAxis === 0 ? 1 : 0,
        state.cutAxis === 1 ? 1 : 0,
        state.cutAxis === 2 ? 1 : 0,
        (config ? config.frame.center[state.cutAxis] : 0) +
            state.cutOffset * (config ? config.frame.radius : 1)
    );
    uniforms.uTrapRadius.value = state.trapRadius * (config ? breathingGeometry(breatheFactor).clearance : 0.2);
    uniforms.uPalette.value = paletteIndex(state.palette);
    uniforms.uScheme.value = schemeIndex(state.scheme);
    uniforms.uModulus.value = state.modulus;
    uniforms.uColorShift.value = state.colorShift;
    uniforms.uColorSpan.value = state.colorSpan;
    uniforms.uAO.value = state.ao;
    uniforms.uShadowSteps.value = state.shadowSteps;
    uniforms.uFog.value = state.fog;
    uniforms.uBgTop.value.set(state.bgTop);
    uniforms.uBgBottom.value.set(state.bgBottom);

    renderer.presentMaterial.uniforms.uExposure.value = state.exposure;
    renderer.presentMaterial.uniforms.uSaturation.value = state.saturation;
    renderer.presentMaterial.uniforms.uVignette.value = state.vignette;

    renderer.setAutoRotate(state.autoOrbit, state.orbitSpeed);
    renderer.setQuality({
        stillScale: state.stillScale,
        motionScale: state.motionScale,
        autoScale: $('autoScale').checked,
        maxSamples: state.maxSamples
    });
    renderer.invalidate();
}

/* ------------------------------------------------------------------ */
/* readouts                                                            */
/* ------------------------------------------------------------------ */

function badge(text, tone = '') {
    return `<span class="badge ${tone}">${text}</span>`;
}

const VOLUME_LABEL = {
    compact: 'cocompact',
    finite: 'finite volume',
    infinite: 'infinite volume'
};

function updateGroupReadout() {
    const preset = currentPreset();
    const analysis = config.analysis;
    const sig = analysis.signature;

    $('groupName').textContent = preset.name;
    $('groupSubtitle').textContent = preset.subtitle || families[preset.family]?.label || '';
    $('groupDescription').textContent = preset.description;

    const badges = [];
    badges.push(badge(`${config.mirrors.length} mirrors`));
    badges.push(badge(`rank ${analysis.rank}`, analysis.rank === 5 ? 'good' : ''));
    badges.push(
        !config.realized
            ? badge('not realizable in H⁴', 'bad')
            : analysis.discrete
            ? badge('discrete', 'good')
            : badge('angle condition fails', 'bad')
    );
    if (analysis.cusped) badges.push(badge('cusped', 'warn'));
    if (analysis.schottky) badges.push(badge('Schottky', 'good'));
    if (analysis.volumeType !== 'infinite') {
        badges.push(badge(VOLUME_LABEL[analysis.volumeType], 'warn'));
    }
    if (state.relations) badges.push(badge('edited diagram'));
    $('groupBadges').innerHTML = badges.join('');

    const rows = [
        ['signature', `(${sig.positive}, ${sig.zero}, ${sig.negative})`],
        ['Gram rank', String(analysis.rank)],
        [
            'limit set',
            analysis.volumeType === 'compact' || analysis.volumeType === 'finite'
                ? 'the whole 3-sphere'
                : analysis.rank === 5
                    ? 'fractal in S³'
                    : analysis.rank === 4
                        ? 'fractal on a 2-sphere'
                        : 'fractal on a circle'
        ],
        ['min. inversive product', analysis.minProduct.toFixed(4)],
        ['bounding radius', config.bound.radius.toFixed(3)],
        ['chamber clearance', config.trapClearance.toFixed(3)]
    ];

    if (analysis.rank < 5) {
        rows.push([
            'note',
            `preserves a ${analysis.rank - 2}-sphere`
        ]);
    }

    $('groupReadout').innerHTML = rows
        .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
        .join('');
}

function renderMirrorList() {
    const lines = config.mirrors.map((mirror, index) => {
        if (mirror.kind === 'plane') {
            return `${String(index).padStart(2)}  plane  n=(${mirror.n
                .map((v) => v.toFixed(3))
                .join(', ')})  h=${mirror.h.toFixed(3)}`;
        }
        return `${String(index).padStart(2)}  c=(${mirror.c
            .map((v) => v.toFixed(3).padStart(6))
            .join(', ')})  r=${mirror.r.toFixed(3)}`;
    });
    $('mirrorList').innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
}

/* ------------------------------------------------------------------ */
/* Coxeter diagram + editable Gram                                     */
/* ------------------------------------------------------------------ */

function relationOf(i, j) {
    if (state.relations) return state.relations[i][j];
    const info = config.analysis.pairs.find((pair) => pair.i === Math.min(i, j) && pair.j === Math.max(i, j));
    if (!info) return { type: 'angle', m: 2 };
    if (info.relation === 'tangent') return { type: 'tangent' };
    if (info.relation === 'disjoint') return { type: 'disjoint', d: info.distance };
    if (info.relation === 'intersecting' && info.isCoxeter) return { type: 'angle', m: info.order };
    return { type: 'raw', value: info.value };
}

function relationToken(relation) {
    if (!relation) return 'a2';
    if (relation.type === 'tangent') return 't';
    if (relation.type === 'disjoint') return `d${relation.d.toFixed(3)}`;
    if (relation.type === 'raw') return `r${relation.value.toFixed(3)}`;
    return `a${relation.m}`;
}

function tokenToRelation(token) {
    if (token === 't') return { type: 'tangent' };
    if (token.startsWith('d')) return { type: 'disjoint', d: Number(token.slice(1)) };
    if (token.startsWith('r')) return { type: 'raw', value: Number(token.slice(1)) };
    return { type: 'angle', m: Number(token.slice(1)) };
}

function relationLabel(relation) {
    if (!relation) return '2';
    if (relation.type === 'tangent') return '∞';
    if (relation.type === 'disjoint') return relation.d.toFixed(2);
    if (relation.type === 'raw') return relation.value.toFixed(2);
    return String(relation.m);
}

const ANGLE_CHOICES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const DISTANCE_CHOICES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

function buildCellSelect(i, j, relation) {
    const select = document.createElement('select');
    const current = relationToken(relation);

    const angleGroup = document.createElement('optgroup');
    angleGroup.label = 'angle π/m';
    ANGLE_CHOICES.forEach((m) => {
        const option = document.createElement('option');
        option.value = `a${m}`;
        option.textContent = String(m);
        angleGroup.appendChild(option);
    });
    select.appendChild(angleGroup);

    const tangentOption = document.createElement('option');
    tangentOption.value = 't';
    tangentOption.textContent = '∞';
    select.appendChild(tangentOption);

    const distanceGroup = document.createElement('optgroup');
    distanceGroup.label = 'disjoint, distance';
    DISTANCE_CHOICES.forEach((d) => {
        const option = document.createElement('option');
        option.value = `d${d.toFixed(3)}`;
        option.textContent = d.toFixed(2);
        distanceGroup.appendChild(option);
    });
    select.appendChild(distanceGroup);

    if (!Array.from(select.options).some((option) => option.value === current)) {
        const option = document.createElement('option');
        option.value = current;
        option.textContent = relationLabel(relation);
        select.insertBefore(option, select.firstChild);
    }
    select.value = current;

    select.addEventListener('change', () => {
        if (!state.relations) {
            state.relations = relationsFromGram(config.baseGram);
        }
        const relationValue = tokenToRelation(select.value);
        state.relations[i][j] = relationValue;
        state.relations[j][i] = relationValue;
        rebuild();
        writePermalink();
    });

    return select;
}

function renderGramTable() {
    const n = state.relations ? state.relations.length : config.mirrors.length;
    const table = document.createElement('table');

    const head = document.createElement('tr');
    head.appendChild(document.createElement('th'));
    for (let j = 0; j < n; j++) {
        const th = document.createElement('th');
        th.textContent = String(j);
        head.appendChild(th);
    }
    table.appendChild(head);

    for (let i = 0; i < n; i++) {
        const row = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = String(i);
        row.appendChild(th);
        for (let j = 0; j < n; j++) {
            const cell = document.createElement('td');
            if (i === j) {
                cell.textContent = '·';
                cell.className = 'diag';
            } else if (j > i) {
                const relation = relationOf(i, j);
                cell.className = `rel-${relation.type}`;
                cell.appendChild(buildCellSelect(i, j, relation));
            }
            row.appendChild(cell);
        }
        table.appendChild(row);
    }

    const host = $('gramMatrix');
    host.innerHTML = '';
    host.appendChild(table);
}

function renderDiagramSvg() {
    const n = state.relations ? state.relations.length : config.mirrors.length;
    if (n > 9) {
        // the relation graph is complete enough at this size that a drawing
        // is less readable than the table below it
        $('coxeterDiagram').innerHTML =
            `<p class="hint">${n} mirrors — see the relation table below.</p>`;
        return;
    }
    const labels = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
            if (i === j) return 1;
            const relation = relationOf(i, j);
            if (relation.type === 'angle') return relation.m;
            return 0;
        })
    );

    const shape = diagramShape(labels);
    const width = 300;
    const height = n > 6 ? 150 : 110;
    const positions = [];

    if (shape.kind === 'path' && shape.order) {
        shape.order.forEach((node, index) => {
            positions[node] = [30 + (index * (width - 60)) / Math.max(n - 1, 1), height / 2];
        });
    } else {
        const radius = Math.min(width, height) * 0.36;
        for (let i = 0; i < n; i++) {
            const angle = (2 * Math.PI * i) / n - Math.PI / 2;
            positions[i] = [width / 2 + radius * Math.cos(angle), height / 2 + radius * Math.sin(angle)];
        }
    }

    const parts = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const relation = relationOf(i, j);
            if (relation.type === 'angle' && relation.m === 2) continue;
            const [x1, y1] = positions[i];
            const [x2, y2] = positions[j];
            const dashed = relation.type === 'disjoint';
            const stroke = dashed ? 'rgba(127,208,255,0.6)' : relation.type === 'tangent' ? 'rgba(255,184,107,0.85)' : 'rgba(255,255,255,0.55)';
            parts.push(
                `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="1.4"${dashed ? ' stroke-dasharray="4 3"' : ''} />`
            );
            const needsLabel = relation.type !== 'angle' || relation.m > 3;
            if (needsLabel) {
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                parts.push(
                    `<rect x="${(mx - 9).toFixed(1)}" y="${(my - 7).toFixed(1)}" width="18" height="14" rx="4" fill="rgba(11,14,20,0.92)" />`,
                    `<text x="${mx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="#e6ecf6" font-family="IBM Plex Mono, monospace">${relationLabel(relation)}</text>`
                );
            }
        }
    }

    for (let i = 0; i < n; i++) {
        const [x, y] = positions[i];
        parts.push(
            `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#0b0e14" stroke="rgba(255,255,255,0.6)" stroke-width="1.3" />`,
            `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="9" fill="rgba(226,232,242,0.8)" font-family="IBM Plex Mono, monospace">${i}</text>`
        );
    }

    const caption = shape.symbol ? `<text x="${width / 2}" y="${height - 4}" text-anchor="middle" font-size="11" fill="rgba(240,185,107,0.9)" font-family="IBM Plex Mono, monospace">${shape.symbol}</text>` : '';

    $('coxeterDiagram').innerHTML =
        `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}${caption}</svg>`;
}

function renderCoxeter() {
    if (!config) return;
    renderDiagramSvg();
    renderGramTable();
}

/* ------------------------------------------------------------------ */
/* library                                                             */
/* ------------------------------------------------------------------ */

const presetMeta = new Map();
let scrollTarget = null;

function metaFor(preset) {
    if (presetMeta.has(preset.key)) return presetMeta.get(preset.key);
    const built = buildConfiguration(preset, { radiusScale: preset.radiusScale });
    const meta = {
        mirrors: built.mirrors.length,
        rank: built.analysis.rank,
        cusped: built.analysis.cusped,
        schottky: built.analysis.schottky,
        volumeType: built.analysis.volumeType
    };
    presetMeta.set(preset.key, meta);
    return meta;
}

function renderLibrary() {
    const list = $('presetList');
    list.innerHTML = '';

    const needle = searchText.trim().toLowerCase();
    let shown = 0;

    Object.entries(families).forEach(([familyKey, family]) => {
        if (familyFilter !== 'all' && familyFilter !== familyKey) return;

        const members = presets.filter((preset) => {
            if (preset.family !== familyKey) return false;
            if (!needle) return true;
            return `${preset.name} ${preset.subtitle} ${preset.description} ${family.label}`
                .toLowerCase()
                .includes(needle);
        });
        if (members.length === 0) return;

        const heading = document.createElement('div');
        heading.className = 'family-heading';
        heading.innerHTML = `${family.label}<span>${family.blurb}</span>`;
        list.appendChild(heading);

        members.forEach((preset) => {
            shown += 1;
            const meta = metaFor(preset);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = `preset-card${preset.key === state.presetKey ? ' is-active' : ''}`;
            card.dataset.key = preset.key;

            const tags = [`<span class="tag">${meta.mirrors} mirrors</span>`];
            tags.push(`<span class="tag${meta.rank === 5 ? ' rank5' : ''}">rank ${meta.rank}</span>`);
            if (meta.cusped) tags.push('<span class="tag cusp">cusped</span>');
            if (meta.schottky) tags.push('<span class="tag">free</span>');
            if (meta.volumeType !== 'infinite') {
                tags.push(`<span class="tag">${VOLUME_LABEL[meta.volumeType]}</span>`);
            }

            card.innerHTML = `<strong>${preset.name}</strong><small>${preset.subtitle}</small><span class="tags">${tags.join('')}</span>`;
            card.addEventListener('click', () => {
                applyPreset(preset.key);
                if (window.matchMedia('(max-width: 860px)').matches) {
                    setDrawerHidden('Library', true);
                    setDrawerHidden('Panel', false);
                }
            });
            list.appendChild(card);
        });
    });

    $('libraryCount').textContent = `${shown} of ${presets.length} groups`;
    $('preset').value = state.presetKey;

    if (scrollTarget !== state.presetKey) {
        scrollTarget = state.presetKey;
        const active = list.querySelector('.preset-card.is-active');
        if (active) {
            requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest' }));
        }
    }
}

function populatePresetSelect() {
    const select = $('preset');
    Object.entries(families).forEach(([familyKey, family]) => {
        const group = document.createElement('optgroup');
        group.label = family.label;
        presets
            .filter((preset) => preset.family === familyKey)
            .forEach((preset) => {
                const option = document.createElement('option');
                option.value = preset.key;
                option.textContent = preset.name;
                group.appendChild(option);
            });
        if (group.children.length) select.appendChild(group);
    });
}

function stepPreset(direction) {
    const order = Object.keys(families).flatMap((family) => presets.filter((p) => p.family === family).map((p) => p.key));
    const index = order.indexOf(state.presetKey);
    applyPreset(order[(index + direction + order.length) % order.length]);
}

function renderFamilyFilter() {
    const host = $('familyFilter');
    host.innerHTML = '';
    const entries = [['all', { label: 'All' }], ...Object.entries(families)];
    entries.forEach(([key, family]) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `chip${familyFilter === key ? ' is-active' : ''}`;
        chip.textContent = family.label;
        chip.addEventListener('click', () => {
            familyFilter = key;
            renderFamilyFilter();
            renderLibrary();
        });
        host.appendChild(chip);
    });
}

/* ------------------------------------------------------------------ */
/* preset application                                                  */
/* ------------------------------------------------------------------ */

function applyPreset(key, { keepView = false, keepStyle = false } = {}) {
    const preset = presetsByKey[key];
    if (!preset) return;

    state.presetKey = key;
    state.relations = null;
    state.radiusScale = preset.radiusScale ?? 1;
    state.folds = preset.folds ?? 32;
    state.trapMode = preset.trapMode ?? 0;
    state.thickness = preset.thickness ?? 0.02;
    state.skipLevels = preset.skipLevels ?? 0;
    state.trapRadius = preset.trapRadius ?? 0.3;
    state.cutaway = preset.cutaway ?? false;
    state.cutOffset = preset.cutOffset ?? 0;
    state.cutAxis = preset.cutAxis ?? 2;
    state.hideOuter = preset.hideOuter ?? true;

    if (!keepStyle) {
        state.palette = preset.palette ?? 'aurora';
        state.scheme = preset.scheme ?? 'depth';
    }

    syncControls();
    rebuild();
    pushRenderUniforms();

    if (!keepView) {
        resetView();
    }

    renderLibrary();
    writePermalink();
}

/* ------------------------------------------------------------------ */
/* control wiring                                                      */
/* ------------------------------------------------------------------ */

const sliders = [
    ['radiusScale', 'radiusScaleValue', (v) => v.toFixed(3), true],
    ['thickness', 'thicknessValue', (v) => v.toFixed(3)],
    ['trapRadius', 'trapRadiusValue', (v) => v.toFixed(3)],
    ['folds', 'foldsValue', (v) => String(v)],
    ['skipLevels', 'skipLevelsValue', (v) => String(v)],
    ['cutOffset', 'cutOffsetValue', (v) => v.toFixed(2)],
    ['modulus', 'modulusValue', (v) => String(v)],
    ['colorShift', 'colorShiftValue', (v) => v.toFixed(2)],
    ['colorSpan', 'colorSpanValue', (v) => v.toFixed(2)],
    ['exposure', 'exposureValue', (v) => v.toFixed(2)],
    ['saturation', 'saturationValue', (v) => v.toFixed(2)],
    ['vignette', 'vignetteValue', (v) => v.toFixed(2)],
    ['fog', 'fogValue', (v) => v.toFixed(3)],
    ['stillScale', 'stillScaleValue', (v) => `${Math.round(v * 100)}%`],
    ['motionScale', 'motionScaleValue', (v) => `${Math.round(v * 100)}%`],
    ['maxSamples', 'maxSamplesValue', (v) => String(v)],
    ['steps', 'stepsValue', (v) => String(v)],
    ['stepScale', 'stepScaleValue', (v) => v.toFixed(2)],
    ['epsScale', 'epsScaleValue', (v) => v.toFixed(2)],
    ['ao', 'aoValue', (v) => v.toFixed(2)],
    ['shadowSteps', 'shadowValue', (v) => String(v)],
    ['orbitSpeed', 'orbitSpeedValue', (v) => `${v.toFixed(2)} rpm`],
    ['breatheAmount', 'breatheAmountValue', (v) => `±${Math.round(v * 100)}%`],
    ['breathePeriod', 'breathePeriodValue', (v) => `${v.toFixed(1)} s`],
    ['exportSamples', 'exportSamplesValue', (v) => String(v)]
];

function syncControls() {
    sliders.forEach(([id, valueId, format]) => {
        const input = $(id);
        if (!input) return;
        input.value = String(state[id]);
        if (valueId) $(valueId).textContent = format(state[id]);
    });
    $('fov').value = String(state.fov);
    $('fovValue').textContent = `${state.fov}°`;
    $('trapMode').value = String(state.trapMode);
    $('cutAxis').value = String(state.cutAxis);
    $('hideOuter').checked = state.hideOuter;
    $('cutaway').checked = state.cutaway;
    $('autoOrbit').checked = state.autoOrbit;
    $('breathe').checked = state.breathe;
    $('exportScale').value = String(state.exportScale);
    $('preset').value = state.presetKey;
    $('palette').value = state.palette;
    $('scheme').value = state.scheme;
    $('qualityPreset').value = state.quality;
    $('bgTop').value = state.bgTop;
    $('bgBottom').value = state.bgBottom;
    updateSchemeControls();
}

function updateSchemeControls() {
    const scheme = schemes[state.scheme];
    $('schemeHint').textContent = scheme ? scheme.description : '';
    $('modulusControl').hidden = !scheme || scheme.control !== 'modulus';
}

function setDrawerHidden(name, hidden) {
    document.body.classList.toggle(name === 'Library' ? 'no-library' : 'no-panel', hidden);
    $(name === 'Library' ? 'toggleLibrary' : 'togglePanel').setAttribute('aria-pressed', String(!hidden));
}

function bindControls() {
    sliders.forEach(([id, valueId, format, rebuildGeometry]) => {
        const input = $(id);
        if (!input) return;
        input.addEventListener('input', () => {
            state[id] = Number(input.value);
            if (valueId) $(valueId).textContent = format(state[id]);
            if (rebuildGeometry) {
                rebuild();
            }
            // these are read on the fly and must not restart refinement
            if (['breatheAmount', 'breathePeriod', 'exportSamples'].includes(id)) return;
            if (['stillScale', 'motionScale', 'maxSamples', 'steps', 'epsScale', 'ao', 'shadowSteps', 'stepScale'].includes(id)) {
                state.quality = 'custom';
                $('qualityPreset').value = 'custom';
            }
            pushRenderUniforms();
        });
        input.addEventListener('change', writePermalink);
    });

    $('fov').addEventListener('input', (event) => {
        state.fov = Number(event.target.value);
        $('fovValue').textContent = `${state.fov}°`;
        renderer.setFov(state.fov);
    });
    $('fov').addEventListener('change', writePermalink);

    $('trapMode').addEventListener('change', (event) => {
        state.trapMode = Number(event.target.value);
        pushRenderUniforms();
        writePermalink();
    });

    $('palette').addEventListener('change', (event) => {
        state.palette = event.target.value;
        pushRenderUniforms();
        writePermalink();
    });

    $('scheme').addEventListener('change', (event) => {
        state.scheme = event.target.value;
        updateSchemeControls();
        pushRenderUniforms();
        writePermalink();
    });

    $('qualityPreset').addEventListener('change', (event) => {
        const preset = QUALITY[event.target.value];
        state.quality = event.target.value;
        if (preset) {
            Object.assign(state, preset);
            syncControls();
            pushRenderUniforms();
        }
        writePermalink();
    });

    $('autoScale').addEventListener('change', () => pushRenderUniforms());

    $('preset').addEventListener('change', (event) => applyPreset(event.target.value));

    $('exportScale').addEventListener('change', (event) => {
        state.exportScale = Number(event.target.value);
        writePermalink();
    });

    $('exportImage').addEventListener('click', exportImage);

    ['hideOuter', 'cutaway', 'autoOrbit', 'breathe'].forEach((id) => {
        $(id).addEventListener('change', (event) => {
            state[id] = event.target.checked;
            pushRenderUniforms();
            writePermalink();
        });
    });

    $('cutAxis').addEventListener('change', (event) => {
        state.cutAxis = Number(event.target.value);
        pushRenderUniforms();
        writePermalink();
    });

    ['bgTop', 'bgBottom'].forEach((id) => {
        $(id).addEventListener('input', (event) => {
            state[id] = event.target.value;
            pushRenderUniforms();
        });
        $(id).addEventListener('change', writePermalink);
    });

    $('resetRelations').addEventListener('click', () => {
        state.relations = null;
        rebuild();
        writePermalink();
    });

    $('resetView').addEventListener('click', resetView);

    $('presetDefaults').addEventListener('click', () => applyPreset(state.presetKey));

    $('librarySearch').addEventListener('input', (event) => {
        searchText = event.target.value;
        renderLibrary();
    });

    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach((other) => other.classList.remove('is-active'));
            document.querySelectorAll('.tab-page').forEach((page) => page.classList.remove('is-active'));
            tab.classList.add('is-active');
            document.querySelector(`.tab-page[data-page="${tab.dataset.tab}"]`).classList.add('is-active');
        });
    });

    const toggle = (id, className) => {
        const button = $(id);
        button.addEventListener('click', () => {
            const hidden = document.body.classList.toggle(className);
            button.setAttribute('aria-pressed', String(!hidden));
            if (!hidden && window.matchMedia('(max-width: 860px)').matches) {
                setDrawerHidden(id === 'toggleLibrary' ? 'Panel' : 'Library', true);
            }
            setTimeout(() => renderer.resize(), 240);
        });
    };
    toggle('toggleLibrary', 'no-library');
    toggle('togglePanel', 'no-panel');

    $('toggleChrome').addEventListener('click', () => {
        document.body.classList.toggle('no-chrome');
    });

    $('saveImage').addEventListener('click', saveImage);

    window.addEventListener('keydown', (event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        if (target instanceof HTMLElement && target.matches('input, select, textarea')) return;

        if (event.code === 'KeyH') {
            event.preventDefault();
            document.body.classList.toggle('no-chrome');
        } else if (event.code === 'KeyL') {
            $('toggleLibrary').click();
        } else if (event.code === 'KeyP') {
            $('togglePanel').click();
        } else if (event.code === 'KeyS') {
            saveImage();
        } else if (event.code === 'KeyR') {
            resetView();
        } else if (event.code === 'KeyO') {
            $('autoOrbit').click();
        } else if (event.code === 'KeyB') {
            $('breathe').click();
        } else if (event.code === 'BracketRight' || event.key === ']') {
            stepPreset(1);
        } else if (event.code === 'BracketLeft' || event.key === '[') {
            stepPreset(-1);
        } else if (event.code === 'Escape') {
            renderer.cancelExport();
        }
    });
}

function downloadBlob(blob, suffix = '') {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.presetKey}${suffix}-${Date.now()}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function saveImage() {
    renderer.capture((blob) => downloadBlob(blob));
}

async function exportImage() {
    const button = $('exportImage');
    const status = $('exportStatus');
    if (renderer.exportJob) {
        renderer.cancelExport();
        return;
    }
    button.textContent = 'Cancel export';
    status.hidden = false;
    try {
        const blob = await renderer.exportImage({
            scale: state.exportScale,
            samples: state.exportSamples,
            onProgress: (done, total) => {
                status.textContent = `Rendering sample ${done} of ${total}…`;
            }
        });
        downloadBlob(blob, `-${state.exportScale}x`);
        status.textContent = 'Saved.';
    } catch (error) {
        status.textContent = error.message;
    } finally {
        button.textContent = 'Render & save PNG';
        setTimeout(() => {
            if (!renderer.exportJob) status.hidden = true;
        }, 2500);
    }
}

/* ------------------------------------------------------------------ */
/* permalink                                                           */
/* ------------------------------------------------------------------ */

let permalinkTimer = null;

function writePermalink() {
    clearTimeout(permalinkTimer);
    permalinkTimer = window.setTimeout(() => {
        const payload = { ...state };
        delete payload.exportScale;
        delete payload.exportSamples;
        try {
            location.replace(`#${btoa(JSON.stringify(payload))}`);
        } catch (error) {
            /* ignore */
        }
    }, 300);
}

function readPermalink() {
    if (!location.hash || location.hash.length < 4) return false;
    try {
        const payload = JSON.parse(atob(location.hash.slice(1)));
        if (!presetsByKey[payload.presetKey]) return false;
        Object.assign(state, payload);
        return true;
    } catch (error) {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

/**
 * Give each control a short accessible name.  The wrapping <label> would
 * otherwise contribute its live value and its hint paragraph as well.
 */
function labelControls() {
    document.querySelectorAll('label.control').forEach((label) => {
        const input = label.querySelector('input, select');
        const title = label.querySelector('.control-label');
        if (!input || !title || input.hasAttribute('aria-label')) return;
        const clone = title.cloneNode(true);
        clone.querySelectorAll('em').forEach((node) => node.remove());
        input.setAttribute('aria-label', clone.textContent.trim());
    });
    document.querySelectorAll('label.checkbox').forEach((label) => {
        const input = label.querySelector('input');
        const text = label.querySelector('span');
        if (input && text && !input.hasAttribute('aria-label')) {
            input.setAttribute('aria-label', text.dataset.short || text.textContent.trim());
        }
    });
}

function populateSelects() {
    populatePresetSelect();
    const paletteSelect = $('palette');
    paletteOptions().forEach((option) => {
        const element = document.createElement('option');
        element.value = option.key;
        element.textContent = option.name;
        element.title = option.description;
        paletteSelect.appendChild(element);
    });

    const schemeSelect = $('scheme');
    schemeOptions().forEach((option) => {
        const element = document.createElement('option');
        element.value = option.key;
        element.textContent = option.name;
        element.title = option.description;
        schemeSelect.appendChild(element);
    });
}

async function loadFragmentShader() {
    const response = await fetch('./shaders/kleinian.frag');
    if (!response.ok) throw new Error(`shader load failed: ${response.status}`);
    let source = await response.text();
    source = source.replace(
        /\/\/ PALETTE_SHADER_CODE_INJECTION_POINT_START[\s\S]*?\/\/ PALETTE_SHADER_CODE_INJECTION_POINT_END/,
        generatePaletteCode()
    );
    source = source.replace(
        /\/\/ COLOR_SCHEME_CODE_INJECTION_POINT_START[\s\S]*?\/\/ COLOR_SCHEME_CODE_INJECTION_POINT_END/,
        generateSchemeCode()
    );
    return source;
}

async function boot() {
    if (window.matchMedia('(max-width: 860px)').matches) {
        setDrawerHidden('Library', true);
    }
    populateSelects();
    labelControls();
    renderFamilyFilter();

    const hasPermalink = readPermalink();
    const fragmentShader = await loadFragmentShader();

    renderer = new KleinianRenderer($('stage'), fragmentShader, {
        onFrame: animate,
        onStats: (stats) => {
            if (stats.export) {
                const { sample, samples, width, height } = stats.export;
                $('stats').innerHTML =
                    `<span>exporting</span>` +
                    `<span>${width}×${height}</span>` +
                    `<span><b>${sample}</b>/${samples} samples</span>` +
                    `<span><kbd>Esc</kbd> cancels</span>`;
                return;
            }
            const rate = stats.active
                ? `<span><b>${stats.fps}</b> fps · ${stats.frameMs.toFixed(0)} ms</span>`
                : '<span>idle</span>';
            $('stats').innerHTML =
                rate +
                `<span>${stats.width}×${stats.height}</span>` +
                `<span><b>${Math.min(stats.samples, stats.maxSamples)}</b>/${stats.maxSamples} samples</span>` +
                `<span>${stats.converged ? 'converged' : 'refining'}</span>`;
        }
    });

    // console hook: kleinian.state, kleinian.applyPreset('descartes'), kleinian.rebuild()
    window.kleinian = {
        state,
        renderer,
        applyPreset,
        rebuild,
        pushRenderUniforms,
        get config() {
            return config;
        },
        set(patch) {
            Object.assign(state, patch);
            syncControls();
            rebuild();
            pushRenderUniforms();
        }
    };

    bindControls();
    renderer.setFov(state.fov);

    if (hasPermalink) {
        syncControls();
        rebuild();
        pushRenderUniforms();
        resetView();
        renderLibrary();
    } else {
        applyPreset(state.presetKey);
    }
}

boot().catch((error) => {
    console.error(error);
    const description = $('groupDescription');
    if (description) {
        description.textContent = `Failed to start: ${error.message}. Check the browser console.`;
    }
});
