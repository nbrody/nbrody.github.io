import {
    buildBuildingModel,
    determinant3,
    formatWordKey,
    isPrimeBigInt,
    parseRational,
} from './pgl3-building-core.js';

const TYPE_COLORS = ['#ffcf6e', '#67d6ff', '#ff8ca1'];
const DEFAULT_MATRICES = [
    ['3', '0', '0', '0', '1', '0', '0', '0', '1'],
    ['1', '1', '0', '0', '3', '0', '0', '0', '1'],
];

const state = {
    model: null,
    currentWordKey: '',
    selectedVertexId: null,
    zoomTransform: null,
    zoomBehavior: null,
    layout: null,
    positionCache: new Map(),
    isAnimating: false,
    sequenceToken: 0,
};

function keyToTokens(key) {
    return key ? key.split(',') : [];
}

function tokensToKey(tokens) {
    return tokens.join(',');
}

function inverseToken(token) {
    return token.endsWith('^-1') ? token.slice(0, -4) : `${token}^-1`;
}

function reduceWordWithLetter(tokens, nextToken) {
    const next = tokens.slice();
    if (next.length > 0 && inverseToken(next[next.length - 1]) === nextToken) {
        next.pop();
    } else {
        next.push(nextToken);
    }
    return next;
}

function escapeHtml(text) {
    return String(text)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function hashString(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function vertexRadius(node) {
    if (!state.model) {
        return 6;
    }
    if (node.id === state.model.baseVertexId) {
        return 8;
    }
    if (node.inOrbit) {
        return 6.5;
    }
    return 4.8;
}

function setupTabs() {
    const buttons = Array.from(document.querySelectorAll('.tab-button'));
    const panels = Array.from(document.querySelectorAll('.tab-panel'));

    for (const button of buttons) {
        button.addEventListener('click', () => {
            const target = button.dataset.tab;
            buttons.forEach((entry) => entry.classList.toggle('active', entry === button));
            panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${target}`));
        });
    }
}

function refreshMatrixLabels() {
    const blocks = Array.from(document.querySelectorAll('#matrixInputs .matrix-block'));
    blocks.forEach((block, index) => {
        const header = block.querySelector('.matrix-label');
        if (header) {
            header.textContent = `g${index + 1}`;
        }
    });
}

function addMatrixBlock(values = ['1', '0', '0', '0', '1', '0', '0', '0', '1']) {
    const container = document.getElementById('matrixInputs');
    const block = document.createElement('div');
    block.className = 'matrix-block';

    const topLine = document.createElement('div');
    topLine.className = 'matrix-topline';

    const label = document.createElement('div');
    label.className = 'matrix-label inline-heading';
    topLine.appendChild(label);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'chip-button';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
        block.remove();
        refreshMatrixLabels();
    });
    topLine.appendChild(removeButton);
    block.appendChild(topLine);

    const grid = document.createElement('div');
    grid.className = 'matrix-grid';

    values.forEach((value) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.spellcheck = false;
        grid.appendChild(input);
    });

    block.appendChild(grid);
    container.appendChild(block);
    refreshMatrixLabels();
}

function getMatricesFromUI() {
    const blocks = Array.from(document.querySelectorAll('#matrixInputs .matrix-block'));
    if (blocks.length === 0) {
        throw new Error('Add at least one matrix.');
    }

    return blocks.map((block) => {
        const entries = Array.from(block.querySelectorAll('input')).map((input) => parseRational(input.value));
        const matrix = [
            entries.slice(0, 3),
            entries.slice(3, 6),
            entries.slice(6, 9),
        ];
        const determinant = determinant3(matrix);
        if (determinant.isZero()) {
            throw new Error('One of the matrices has determinant 0.');
        }
        return matrix;
    });
}

function renderWarnings(warnings = []) {
    const container = document.getElementById('warningList');
    if (!container) {
        return;
    }

    if (warnings.length === 0) {
        container.innerHTML = '<div class="help-text">No warnings.</div>';
        return;
    }

    container.innerHTML = warnings
        .map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`)
        .join('');
}

function renderSummary() {
    const container = document.getElementById('orbitSummary');
    if (!container || !state.model) {
        return;
    }

    const reducedWords = state.model.states.size;
    const orbitVertices = state.model.nodes.filter((node) => node.inOrbit).length;

    const items = [
        ['Orbit vertices', orbitVertices],
        ['Reduced words', reducedWords],
        ['Patch vertices', state.model.nodes.length],
        ['Chambers', state.model.chambers.length],
    ];

    container.innerHTML = items
        .map(([label, value]) => `
            <div class="summary-card">
                <span class="summary-label">${escapeHtml(label)}</span>
                <span class="summary-value">${escapeHtml(value)}</span>
            </div>
        `)
        .join('');
}

function renderGeneratorControls() {
    const container = document.getElementById('generatorControls');
    if (!container) {
        return;
    }

    if (!state.model) {
        container.innerHTML = '<div class="help-text">Build the orbit to populate generator controls.</div>';
        return;
    }

    const generatorCount = state.model.letters.length / 2;
    const rows = [];
    for (let index = 0; index < generatorCount; index += 1) {
        const direct = `g${index + 1}`;
        const inverse = `${direct}^-1`;
        rows.push(`
            <div class="button-row">
                <button class="generator-button" type="button" data-letter="${direct}">Apply ${direct}</button>
                <button class="generator-button inverse" type="button" data-letter="${inverse}">Apply ${inverse}</button>
            </div>
        `);
    }

    container.innerHTML = rows.join('');
    Array.from(container.querySelectorAll('[data-letter]')).forEach((button) => {
        button.addEventListener('click', () => {
            void applyLetter(button.dataset.letter);
        });
    });
}

function currentVertex() {
    if (!state.model) {
        return null;
    }
    const wordState = state.model.states.get(state.currentWordKey) || state.model.states.get('');
    return state.model.vertexPool.get(wordState.vertexId);
}

function renderSelectedVertex() {
    const container = document.getElementById('selectedVertex');
    if (!container || !state.model) {
        return;
    }

    const vertex = state.model.vertexPool.get(state.selectedVertexId || state.model.baseVertexId);
    if (!vertex) {
        container.innerHTML = '<div class="help-text">Select a vertex in the picture.</div>';
        return;
    }

    const orbitEntry = state.model.orbitMap.get(vertex.id);
    const words = orbitEntry ? orbitEntry.words.join(', ') : 'Not in the displayed orbit';
    const wordSuffix = orbitEntry && orbitEntry.wordCount > orbitEntry.words.length
        ? ` (+${orbitEntry.wordCount - orbitEntry.words.length} more)`
        : '';

    const rows = vertex.rows
        .map((row) => `
            <div class="matrix-display-row">
                ${row.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}
            </div>
        `)
        .join('');

    container.innerHTML = `
        <div class="vertex-meta">
            <span class="vertex-pill">type ${vertex.type}</span>
            <span class="vertex-pill">diag = [${vertex.diagonal.join(', ')}]</span>
            <span class="vertex-pill">v(det) = ${vertex.determinantVal}</span>
        </div>
        <div class="matrix-display">${rows}</div>
        <p class="help-text"><strong>Orbit words:</strong> ${escapeHtml(words)}${escapeHtml(wordSuffix)}</p>
    `;
}

function updateWordUI() {
    if (!state.model) {
        return;
    }

    const wordEl = document.getElementById('currentWord');
    const metaEl = document.getElementById('wordMeta');
    const summaryEl = document.getElementById('currentVertexSummary');
    const vertex = currentVertex();

    if (wordEl) {
        wordEl.textContent = formatWordKey(state.currentWordKey);
    }

    if (metaEl && vertex) {
        metaEl.textContent = `type ${vertex.type}, diag [${vertex.diagonal.join(', ')}], v(det) ${vertex.determinantVal}`;
    }

    if (summaryEl && vertex) {
        summaryEl.textContent = `type ${vertex.type} with diag [${vertex.diagonal.join(', ')}]`;
    }

    updatePathHighlight();
    updateVertexDecorations();
    updateLabels();
    renderSelectedVertex();
}

function parseSequenceInput() {
    const raw = String(document.getElementById('sequenceInput')?.value || '').trim();
    if (!raw) {
        return [];
    }

    const tokens = raw.match(/g\d+(?:\^-1)?/g) || [];
    const stripped = raw.replace(/g\d+(?:\^-1)?/g, ' ').replace(/[\s,*]+/g, '');
    if (stripped) {
        throw new Error('Sequence must use tokens like g1 and g2^-1.');
    }

    const allowed = new Set(state.model ? state.model.letters.map((letter) => letter.id) : []);
    tokens.forEach((token) => {
        if (!allowed.has(token)) {
            throw new Error(`Unknown token "${token}".`);
        }
    });
    return tokens;
}

function buildPrefixKeys(key) {
    const tokens = keyToTokens(key);
    const prefixes = [''];
    for (let index = 0; index < tokens.length; index += 1) {
        prefixes.push(tokensToKey(tokens.slice(0, index + 1)));
    }
    return prefixes;
}

function pointForVertex(vertexId) {
    return state.layout?.nodeById?.get(vertexId) || null;
}

function updatePathHighlight() {
    if (!state.layout || !state.model) {
        return;
    }

    const keys = buildPrefixKeys(state.currentWordKey);
    const vertexIds = [];
    keys.forEach((key) => {
        const wordState = state.model.states.get(key);
        if (wordState) {
            const id = wordState.vertexId;
            if (vertexIds[vertexIds.length - 1] !== id) {
                vertexIds.push(id);
            }
        }
    });

    const points = vertexIds
        .map((vertexId) => pointForVertex(vertexId))
        .filter(Boolean)
        .map((node) => [node.x, node.y]);

    const pathGenerator = d3.line().curve(d3.curveCatmullRom.alpha(0.7));
    state.layout.pathSelection.attr('d', points.length > 1 ? pathGenerator(points) : null);

    const current = currentVertex();
    if (current) {
        state.layout.nodeSelection.classed('is-on-path', (node) => vertexIds.includes(node.id));
        if (!state.isAnimating) {
            state.layout.marker.attr('transform', `translate(${pointForVertex(current.id).x}, ${pointForVertex(current.id).y})`);
        }
    }
}

function updateLabels() {
    if (!state.layout || !state.model) {
        return;
    }

    const current = currentVertex();
    const labelIds = [state.model.baseVertexId];
    if (current && !labelIds.includes(current.id)) {
        labelIds.push(current.id);
    }
    if (state.selectedVertexId && !labelIds.includes(state.selectedVertexId)) {
        labelIds.push(state.selectedVertexId);
    }

    const labelData = labelIds
        .map((vertexId) => {
            const node = pointForVertex(vertexId);
            if (!node) {
                return null;
            }
            let label = 'base';
            if (vertexId === state.selectedVertexId) {
                label = 'selected';
            }
            if (current && vertexId === current.id) {
                label = formatWordKey(state.currentWordKey);
            }
            return { vertexId, x: node.x, y: node.y, label };
        })
        .filter(Boolean);

    const groups = state.layout.labelLayer
        .selectAll('g.vertex-label')
        .data(labelData, (entry) => entry.vertexId);

    const entered = groups.enter().append('g').attr('class', 'vertex-label');
    entered.append('rect')
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('fill', 'rgba(4, 13, 21, 0.82)')
        .attr('stroke', 'rgba(255, 255, 255, 0.14)');
    entered.append('text')
        .attr('fill', '#eaf4ff')
        .attr('font-size', 12)
        .attr('font-family', 'IBM Plex Mono, monospace')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle');

    const merged = entered.merge(groups);
    merged.attr('transform', (entry) => `translate(${entry.x}, ${entry.y - 18})`);
    merged.select('text').text((entry) => entry.label);
    merged.each(function updateBox(entry) {
        const text = d3.select(this).select('text');
        const width = Math.max(42, text.node().getComputedTextLength() + 18);
        d3.select(this).select('rect')
            .attr('x', -width / 2)
            .attr('y', -11)
            .attr('width', width)
            .attr('height', 22);
    });

    groups.exit().remove();
}

function updateVertexDecorations() {
    if (!state.layout || !state.model) {
        return;
    }

    const current = currentVertex();
    state.layout.nodeSelection.each(function decorate(node) {
        const group = d3.select(this);
        group.select('.selection-ring')
            .attr('opacity', node.id === state.selectedVertexId ? 0.95 : 0)
            .attr('r', vertexRadius(node) + 6);
        group.select('.orbit-ring')
            .attr('opacity', node.inOrbit ? 0.58 : 0)
            .attr('r', vertexRadius(node) + (node.inOrbit ? 2.5 : 0));
        group.select('.base-ring')
            .attr('opacity', node.id === state.model.baseVertexId ? 0.88 : 0)
            .attr('r', vertexRadius(node) + 4.5);
        group.select('.current-ring')
            .attr('opacity', current && node.id === current.id ? 0.92 : 0)
            .attr('r', vertexRadius(node) + 8);
    });
}

function viewOptions() {
    return {
        showNeighborhood: document.getElementById('toggleNeighborhood')?.checked ?? true,
        showChambers: document.getElementById('toggleChambers')?.checked ?? true,
    };
}

function updateVisibility() {
    if (!state.layout) {
        return;
    }

    const { showNeighborhood, showChambers } = viewOptions();

    state.layout.nodeSelection.attr('display', (node) => {
        if (showNeighborhood || node.inOrbit) {
            return null;
        }
        return 'none';
    });

    state.layout.edgeSelection.attr('display', (edge) => {
        const source = pointForVertex(edge.sourceId);
        const target = pointForVertex(edge.targetId);
        const keep = showNeighborhood || (source?.inOrbit && target?.inOrbit);
        return keep ? null : 'none';
    });

    state.layout.chamberSelection.attr('display', (chamber) => {
        if (!showChambers) {
            return 'none';
        }
        if (showNeighborhood) {
            return null;
        }
        const keep = chamber.vertices.every((vertexId) => pointForVertex(vertexId)?.inOrbit);
        return keep ? null : 'none';
    });
}

function seedPosition(node, width, height) {
    const cached = state.positionCache.get(node.id);
    if (cached) {
        return { x: cached.x, y: cached.y };
    }

    const hash = hashString(node.id);
    const angle = ((hash % 10000) / 10000) * Math.PI * 2;
    const ring = node.inOrbit
        ? 74 + Math.min(node.minLength, 4) * 70
        : 160 + (hash % 5) * 18 + node.type * 16;

    return {
        x: width / 2 + Math.cos(angle) * ring,
        y: height / 2 + Math.sin(angle) * ring,
    };
}

function computeLayout(width, height) {
    const nodes = state.model.nodes.map((node) => {
        const seed = seedPosition(node, width, height);
        return { ...node, x: seed.x, y: seed.y };
    });

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edges = state.model.edges.map((edge) => ({
        ...edge,
        sourceId: edge.source,
        targetId: edge.target,
        source: nodeById.get(edge.source),
        target: nodeById.get(edge.target),
    }));

    const base = nodeById.get(state.model.baseVertexId);
    if (base) {
        base.fx = width / 2;
        base.fy = height / 2;
    }

    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(edges).id((node) => node.id).distance((edge) => (
            edge.source.inOrbit && edge.target.inOrbit ? 70 : 52
        )).strength(0.9))
        .force('charge', d3.forceManyBody().strength((node) => (node.inOrbit ? -220 : -120)))
        .force('collide', d3.forceCollide().radius((node) => vertexRadius(node) + 12))
        .force('x', d3.forceX(width / 2).strength(0.016))
        .force('y', d3.forceY(height / 2).strength(0.016))
        .stop();

    for (let step = 0; step < 260; step += 1) {
        simulation.tick();
    }

    if (base) {
        const dx = width / 2 - base.x;
        const dy = height / 2 - base.y;
        nodes.forEach((node) => {
            node.x += dx;
            node.y += dy;
            state.positionCache.set(node.id, { x: node.x, y: node.y });
        });
    }

    return { nodes, nodeById, edges };
}

function drawVisualization() {
    if (!state.model) {
        return;
    }

    const stage = document.getElementById('visualStage');
    const svg = d3.select('#building-vis');
    const width = stage.clientWidth;
    const height = stage.clientHeight;

    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const { nodes, nodeById, edges } = computeLayout(width, height);
    const zoomLayer = svg.append('g').attr('class', 'zoom-layer');
    const chamberLayer = zoomLayer.append('g').attr('class', 'chamber-layer');
    const edgeLayer = zoomLayer.append('g').attr('class', 'edge-layer');
    const orbitLayer = zoomLayer.append('g').attr('class', 'orbit-layer');
    const nodeLayer = zoomLayer.append('g').attr('class', 'node-layer');
    const labelLayer = zoomLayer.append('g').attr('class', 'label-layer');
    const overlayLayer = zoomLayer.append('g').attr('class', 'overlay-layer');

    const chambers = chamberLayer
        .selectAll('path.building-chamber')
        .data(state.model.chambers)
        .enter()
        .append('path')
        .attr('class', 'building-chamber')
        .attr('fill', (chamber) => {
            const pivot = nodeById.get(chamber.vertices[0]);
            return TYPE_COLORS[pivot?.type ?? 0];
        })
        .attr('fill-opacity', 0.1)
        .attr('stroke', 'rgba(255, 255, 255, 0.06)')
        .attr('stroke-width', 1)
        .attr('d', (chamber) => {
            const points = chamber.vertices.map((vertexId) => nodeById.get(vertexId)).filter(Boolean);
            if (points.length !== 3) {
                return null;
            }
            return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}L${points[2].x},${points[2].y}Z`;
        });

    const edgeSelection = edgeLayer
        .selectAll('line.building-edge')
        .data(edges)
        .enter()
        .append('line')
        .attr('class', 'building-edge')
        .attr('x1', (edge) => edge.source.x)
        .attr('y1', (edge) => edge.source.y)
        .attr('x2', (edge) => edge.target.x)
        .attr('y2', (edge) => edge.target.y)
        .attr('stroke', (edge) => edge.source.inOrbit && edge.target.inOrbit
            ? 'rgba(116, 242, 206, 0.35)'
            : 'rgba(255, 255, 255, 0.16)')
        .attr('stroke-width', (edge) => edge.source.inOrbit && edge.target.inOrbit ? 1.9 : 1.2);

    const nodeSelection = nodeLayer
        .selectAll('g.building-node')
        .data(nodes, (node) => node.id)
        .enter()
        .append('g')
        .attr('class', 'building-node')
        .attr('transform', (node) => `translate(${node.x}, ${node.y})`)
        .style('cursor', 'pointer')
        .on('click', (_, node) => {
            state.selectedVertexId = node.id;
            renderSelectedVertex();
            updateVertexDecorations();
            updateLabels();
        });

    nodeSelection.append('circle')
        .attr('class', 'selection-ring')
        .attr('fill', 'none')
        .attr('stroke', '#ffcf6e')
        .attr('stroke-width', 2);

    nodeSelection.append('circle')
        .attr('class', 'orbit-ring')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(116, 242, 206, 0.6)')
        .attr('stroke-width', 1.5);

    nodeSelection.append('circle')
        .attr('class', 'base-ring')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(103, 214, 255, 0.8)')
        .attr('stroke-width', 1.8);

    nodeSelection.append('circle')
        .attr('class', 'current-ring')
        .attr('fill', 'none')
        .attr('stroke', 'rgba(255, 255, 255, 0.8)')
        .attr('stroke-width', 1.6);

    nodeSelection.append('circle')
        .attr('class', 'vertex-core')
        .attr('r', (node) => vertexRadius(node))
        .attr('fill', (node) => TYPE_COLORS[node.type])
        .attr('fill-opacity', (node) => (node.inOrbit ? 0.94 : 0.78))
        .attr('stroke', (node) => node.inOrbit ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.25)')
        .attr('stroke-width', (node) => (node.inOrbit ? 1.6 : 0.9));

    const pathSelection = orbitLayer.append('path')
        .attr('fill', 'none')
        .attr('stroke', '#74f2ce')
        .attr('stroke-width', 3)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('filter', 'drop-shadow(0 0 8px rgba(116, 242, 206, 0.65))');

    const marker = overlayLayer.append('g').attr('class', 'current-marker');
    marker.append('circle')
        .attr('r', 10.5)
        .attr('fill', 'rgba(255, 255, 255, 0.05)')
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 1.6);
    marker.append('circle')
        .attr('r', 4.4)
        .attr('fill', '#74f2ce');

    const zoomBehavior = d3.zoom()
        .scaleExtent([0.28, 4])
        .on('zoom', (event) => {
            zoomLayer.attr('transform', event.transform);
            state.zoomTransform = event.transform;
        });

    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, state.zoomTransform || d3.zoomIdentity);

    state.zoomBehavior = zoomBehavior;
    state.layout = {
        svg,
        zoomLayer,
        nodeSelection,
        edgeSelection,
        chamberSelection: chambers,
        labelLayer,
        marker,
        pathSelection,
        nodeById,
        width,
        height,
    };

    if (!state.selectedVertexId || !nodeById.has(state.selectedVertexId)) {
        state.selectedVertexId = state.model.baseVertexId;
    }

    updateVisibility();
    updateWordUI();
}

function renderError(message) {
    state.model = null;
    state.layout = null;
    renderWarnings([message]);
    const summary = document.getElementById('orbitSummary');
    const selected = document.getElementById('selectedVertex');
    const generators = document.getElementById('generatorControls');
    const summaryEl = document.getElementById('currentVertexSummary');
    if (summary) {
        summary.innerHTML = '';
    }
    if (selected) {
        selected.innerHTML = '<div class="help-text">No vertex data available.</div>';
    }
    if (generators) {
        generators.innerHTML = '<div class="help-text">Fix the inputs, then rebuild the orbit.</div>';
    }
    if (summaryEl) {
        summaryEl.textContent = 'No building computed';
    }
    d3.select('#building-vis').selectAll('*').remove();
}

function calculate({ preserveWord = true, bumpSequence = true } = {}) {
    if (bumpSequence) {
        state.sequenceToken += 1;
    }

    try {
        const primeText = String(document.getElementById('prime')?.value || '').trim();
        if (!/^\d+$/.test(primeText)) {
            throw new Error('Enter a prime p as a positive integer.');
        }
        const prime = BigInt(primeText);
        if (!isPrimeBigInt(prime)) {
            throw new Error(`${primeText} is not prime.`);
        }

        const rawWordLength = parseInt(document.getElementById('wordLength')?.value || '0', 10);
        const rawNeighborRadius = parseInt(document.getElementById('neighborRadius')?.value || '0', 10);
        const wordLength = Number.isFinite(rawWordLength) ? Math.max(0, Math.min(8, rawWordLength)) : 0;
        const neighborRadius = Number.isFinite(rawNeighborRadius) ? Math.max(0, Math.min(2, rawNeighborRadius)) : 0;
        document.getElementById('wordLength').value = String(wordLength);
        document.getElementById('neighborRadius').value = String(neighborRadius);
        const generators = getMatricesFromUI();
        const targetWordKey = preserveWord ? state.currentWordKey : '';

        const model = buildBuildingModel({
            prime,
            generators,
            wordLength,
            neighborRadius,
        });

        state.model = model;
        state.currentWordKey = model.states.has(targetWordKey) ? targetWordKey : '';
        if (!state.selectedVertexId || !model.vertexPool.has(state.selectedVertexId)) {
            state.selectedVertexId = model.baseVertexId;
        }

        renderWarnings(model.warnings);
        renderGeneratorControls();
        renderSummary();
        drawVisualization();
    } catch (error) {
        renderError(error.message || 'Unable to build the orbit.');
    }
}

async function animateMarkerTo(vertexId) {
    if (!state.layout) {
        return;
    }
    const target = pointForVertex(vertexId);
    if (!target) {
        return;
    }

    state.layout.marker.attr('transform', `translate(${target.x}, ${target.y})`);
}

async function transitionToWord(nextKey) {
    if (!state.model) {
        return;
    }

    const currentState = state.model.states.get(state.currentWordKey) || state.model.states.get('');
    const nextState = state.model.states.get(nextKey);
    if (!nextState) {
        throw new Error('The requested word is not present in the current orbit model.');
    }

    const fromNode = pointForVertex(currentState.vertexId);
    const toNode = pointForVertex(nextState.vertexId);

    state.isAnimating = Boolean(fromNode && toNode && fromNode.id !== toNode.id);
    state.currentWordKey = nextKey;
    updateWordUI();

    if (!fromNode || !toNode || !state.layout) {
        state.isAnimating = false;
        return;
    }

    if (fromNode.id === toNode.id) {
        state.isAnimating = false;
        await animateMarkerTo(toNode.id);
        return;
    }

    const startX = fromNode.x;
    const startY = fromNode.y;
    const deltaX = toNode.x - startX;
    const deltaY = toNode.y - startY;
    const duration = 650;

    await new Promise((resolve) => {
        const startedAt = performance.now();
        const frame = (timestamp) => {
            const elapsed = Math.min(1, (timestamp - startedAt) / duration);
            const eased = 1 - (1 - elapsed) ** 3;
            state.layout.marker.attr('transform', `translate(${startX + deltaX * eased}, ${startY + deltaY * eased})`);
            if (elapsed < 1) {
                requestAnimationFrame(frame);
            } else {
                resolve();
            }
        };
        requestAnimationFrame(frame);
    });

    state.isAnimating = false;
    await animateMarkerTo(nextState.vertexId);
}

async function applyLetter(letterId) {
    if (!state.model || state.isAnimating) {
        return;
    }

    const knownLetters = new Set(state.model.letters.map((letter) => letter.id));
    if (!knownLetters.has(letterId)) {
        renderWarnings([`Unknown generator token ${letterId}.`]);
        return;
    }

    const reduced = reduceWordWithLetter(keyToTokens(state.currentWordKey), letterId);
    const targetKey = tokensToKey(reduced);

    if (!state.model.states.has(targetKey)) {
        document.getElementById('wordLength').value = String(reduced.length);
        calculate({ bumpSequence: false });
    }

    if (!state.model || !state.model.states.has(targetKey)) {
        renderWarnings([`Word ${formatWordKey(targetKey)} fell outside the truncated orbit.`]);
        return;
    }

    await transitionToWord(targetKey);
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function animateSequence() {
    if (!state.model || state.isAnimating) {
        return;
    }

    try {
        const tokens = parseSequenceInput();
        const runToken = state.sequenceToken + 1;
        state.sequenceToken = runToken;
        for (const token of tokens) {
            if (runToken !== state.sequenceToken) {
                return;
            }
            await applyLetter(token);
            await sleep(120);
        }
    } catch (error) {
        renderWarnings([error.message || 'Unable to parse sequence.']);
    }
}

function resetWord() {
    state.sequenceToken += 1;
    if (!state.model) {
        return;
    }
    void transitionToWord('');
}

function resetZoom() {
    if (!state.layout || !state.zoomBehavior) {
        return;
    }

    state.layout.svg
        .transition()
        .duration(450)
        .call(state.zoomBehavior.transform, d3.zoomIdentity);
}

function recenterLayout() {
    state.positionCache.clear();
    state.zoomTransform = d3.zoomIdentity;
    if (state.model) {
        drawVisualization();
    }
}

function bindControls() {
    document.getElementById('addMatrixBtn')?.addEventListener('click', () => addMatrixBlock());
    document.getElementById('calculateBtn')?.addEventListener('click', () => calculate());
    document.getElementById('animateSequenceBtn')?.addEventListener('click', () => {
        void animateSequence();
    });
    document.getElementById('resetWordBtn')?.addEventListener('click', resetWord);
    document.getElementById('resetZoomBtn')?.addEventListener('click', resetZoom);
    document.getElementById('recenterBtn')?.addEventListener('click', recenterLayout);
    document.getElementById('toggleNeighborhood')?.addEventListener('change', updateVisibility);
    document.getElementById('toggleChambers')?.addEventListener('change', updateVisibility);
    window.addEventListener('resize', () => {
        if (state.model) {
            drawVisualization();
        }
    });
}

function bootstrapDefaultMatrices() {
    DEFAULT_MATRICES.forEach((values) => addMatrixBlock(values));
}

function init() {
    if (typeof d3 === 'undefined') {
        renderError('D3 failed to load.');
        return;
    }

    setupTabs();
    bindControls();
    bootstrapDefaultMatrices();
    calculate({ preserveWord: false });
}

document.addEventListener('DOMContentLoaded', init);
