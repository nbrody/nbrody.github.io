import {
    buildBuildingModel,
    determinant3,
    formatWordKey,
    isInStandardApartment,
    isPrimeBigInt,
    parseRational,
} from './pgl3-building-core.js';

const TYPE_COLORS = ['#ffcf6e', '#67d6ff', '#ff8ca1'];
const LATTICE_SPACING = 52;
const SQRT3_2 = Math.sqrt(3) / 2;
const EDGE_REST_LENGTH = LATTICE_SPACING * 0.98;
const TYPE_LAYER_HEIGHT = 0;
const DEFAULT_MATRICES = [
    ['3', '0', '0', '0', '1', '0', '0', '0', '1'],
    ['1', '1', '0', '0', '3', '0', '0', '0', '1'],
];

const state = {
    model: null,
    currentWordKey: '',
    selectedVertexId: null,
    positionCache: new Map(),
    isAnimating: false,
    sequenceToken: 0,
    three: null,
    layout: null,
    patchRadius: 1,
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
    const out = tokens.slice();
    if (out.length > 0 && inverseToken(out[out.length - 1]) === nextToken) {
        out.pop();
    } else {
        out.push(nextToken);
    }
    return out;
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

function angleFromPlane(x, z) {
    return Math.atan2(z, x);
}

function shortestAngleDelta(current, target) {
    let delta = target - current;
    while (delta <= -Math.PI) {
        delta += Math.PI * 2;
    }
    while (delta > Math.PI) {
        delta -= Math.PI * 2;
    }
    return delta;
}

function averageAngles(angles) {
    if (!angles || angles.length === 0) {
        return null;
    }

    let sumCos = 0;
    let sumSin = 0;
    angles.forEach((angle) => {
        sumCos += Math.cos(angle);
        sumSin += Math.sin(angle);
    });

    if (Math.abs(sumCos) < 1e-9 && Math.abs(sumSin) < 1e-9) {
        return null;
    }

    return Math.atan2(sumSin, sumCos);
}

function apartmentSeedAngle(node) {
    const x = node.diagonal[0] + node.diagonal[1] * 0.5;
    const z = node.diagonal[1] * SQRT3_2;
    if (Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9) {
        return null;
    }
    return angleFromPlane(x, z);
}

function visibleDistanceLabel(vertexId) {
    const visibleNode = pointForVertex(vertexId);
    if (visibleNode) {
        return `d(base) = ${visibleNode.distance}`;
    }
    if (state.model?.patchTruncated) {
        return 'd(base): not shown';
    }
    return `d(base) > ${state.patchRadius}`;
}

function setupTabs() {
    const buttons = Array.from(document.querySelectorAll('.tab-button'));
    const panels = Array.from(document.querySelectorAll('.tab-panel'));

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.tab;
            buttons.forEach((entry) => entry.classList.toggle('active', entry === button));
            panels.forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${target}`));
        });
    });
}

function refreshMatrixLabels() {
    const blocks = Array.from(document.querySelectorAll('#matrixInputs .matrix-block'));
    blocks.forEach((block, index) => {
        const label = block.querySelector('.matrix-label');
        if (label) {
            label.textContent = `g${index + 1}`;
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
        if (determinant3(matrix).isZero()) {
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

    const items = [
        ['Orbit vertices', state.model.orbitMap.size],
        ['Reduced words', state.model.states.size],
        ['Visible vertices', state.model.nodes.length],
        ['Chambers', state.model.chambers.length],
    ];

    container.innerHTML = items.map(([label, value]) => `
        <div class="summary-card">
            <span class="summary-label">${escapeHtml(label)}</span>
            <span class="summary-value">${escapeHtml(value)}</span>
        </div>
    `).join('');
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
        container.innerHTML = '<div class="help-text">Select a vertex in the scene.</div>';
        return;
    }

    const orbitEntry = state.model.orbitMap.get(vertex.id);
    const words = orbitEntry ? orbitEntry.words.join(', ') : 'Not in the displayed orbit';
    const more = orbitEntry && orbitEntry.wordCount > orbitEntry.words.length
        ? ` (+${orbitEntry.wordCount - orbitEntry.words.length} more)`
        : '';

    const rows = vertex.rows.map((row) => `
        <div class="matrix-display-row">
            ${row.map((entry) => `<span>${escapeHtml(entry)}</span>`).join('')}
        </div>
    `).join('');

    const diagonalText = `diag v = (${vertex.diagonal.join(', ')})`;

    container.innerHTML = `
        <div class="vertex-meta">
            <span class="vertex-pill">type ${vertex.type}</span>
            <span class="vertex-pill">${escapeHtml(visibleDistanceLabel(vertex.id))}</span>
            <span class="vertex-pill">${escapeHtml(diagonalText)}</span>
            <span class="vertex-pill">v(det) = ${vertex.determinantVal}</span>
        </div>
        <div class="matrix-display">${rows}</div>
        <p class="help-text"><strong>Orbit words:</strong> ${escapeHtml(words)}${escapeHtml(more)}</p>
    `;
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

function viewOptions() {
    return {
        showNeighborhood: document.getElementById('toggleNeighborhood')?.checked ?? true,
        showChambers: document.getElementById('toggleChambers')?.checked ?? true,
        showApartment: document.getElementById('toggleApartment')?.checked ?? false,
    };
}

function sceneNodeRadius(node) {
    if (node.id === state.model.baseVertexId) {
        return 4.8;
    }
    return node.inOrbit ? 3.8 : 2.6;
}

function pointForVertex(vertexId) {
    return state.layout?.nodeById?.get(vertexId) || null;
}

function disposeMaterial(material) {
    if (!material) {
        return;
    }
    if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
        return;
    }
    if (typeof material.dispose === 'function') {
        material.dispose();
    }
}

function disposeObject3D(object) {
    object.traverse((child) => {
        if (child.geometry && typeof child.geometry.dispose === 'function') {
            child.geometry.dispose();
        }
        disposeMaterial(child.material);
    });
}

function clearGroup(group) {
    while (group.children.length > 0) {
        const child = group.children[group.children.length - 1];
        group.remove(child);
        disposeObject3D(child);
    }
}

function setRendererSize() {
    if (!state.three) {
        return;
    }
    const { container, renderer, camera } = state.three;
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
}

function resetCameraHome() {
    if (!state.three) {
        return;
    }
    const { camera, controls } = state.three;
    camera.position.set(0, 280, 140);
    controls.target.set(0, 0, 0);
    controls.update();
    controls.saveState();
}

function ensureThreeScene() {
    if (state.three) {
        setRendererSize();
        return;
    }

    const container = document.getElementById('building-vis');
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 2000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x08131d, 0.88);
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 65;
    controls.maxDistance = 520;

    const ambient = new THREE.AmbientLight(0xffffff, 0.62);
    const hemi = new THREE.HemisphereLight(0x8bd4ff, 0x07131f, 0.96);
    const sun = new THREE.DirectionalLight(0xffffff, 0.82);
    sun.position.set(120, 180, 90);
    const fill = new THREE.PointLight(0x74f2ce, 0.65, 560);
    fill.position.set(-120, 40, -40);

    scene.add(ambient, hemi, sun, fill);

    const world = new THREE.Group();
    scene.add(world);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    container.addEventListener('click', (event) => {
        if (!state.three || !state.layout) {
            return;
        }
        const rect = container.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(state.three.pickables, false);
        if (hits.length === 0) {
            return;
        }
        const hit = hits[0].object;
        const vertexId = hit.userData.vertexId;
        if (!vertexId) {
            return;
        }
        state.selectedVertexId = vertexId;
        renderSelectedVertex();
        updateVertexDecorations();
    });

    state.three = {
        container,
        scene,
        camera,
        renderer,
        controls,
        world,
        pickables: [],
        raycaster,
        pointer,
        localEdges: null,
        orbitEdges: null,
        localChambers: null,
        orbitChambers: null,
        apartmentEdges: null,
        apartmentChambers: null,
        pathMesh: null,
        marker: null,
        baseHalo: null,
        selectedHalo: null,
        currentHalo: null,
        nodeMeshes: new Map(),
    };

    resetCameraHome();
    setRendererSize();

    renderer.setAnimationLoop(() => {
        if (!state.three) {
            return;
        }
        const time = performance.now() * 0.0035;
        if (state.three.marker) {
            const pulse = 1 + 0.12 * Math.sin(time * 2.6);
            state.three.marker.children[0].scale.setScalar(pulse);
        }
        state.three.controls.update();
        state.three.renderer.render(state.three.scene, state.three.camera);
    });
}

function buildLineSegments(edges, color, opacity) {
    if (!edges || edges.length === 0) {
        return null;
    }

    const positions = [];
    edges.forEach((edge) => {
        positions.push(edge.source.scenePosition.x, edge.source.scenePosition.y, edge.source.scenePosition.z);
        positions.push(edge.target.scenePosition.x, edge.target.scenePosition.y, edge.target.scenePosition.z);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
    });
    return new THREE.LineSegments(geometry, material);
}

function buildChamberMesh(chambers, colorScale) {
    if (!chambers || chambers.length === 0) {
        return null;
    }

    const positions = [];
    const colors = [];

    chambers.forEach((chamber) => {
        chamber.vertices.forEach((vertexId) => {
            const node = pointForVertex(vertexId);
            if (!node) {
                return;
            }
            positions.push(node.scenePosition.x, node.scenePosition.y, node.scenePosition.z);
            const color = new THREE.Color(colorScale[node.type]);
            colors.push(color.r, color.g, color.b);
        });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        flatShading: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
    });

    return new THREE.Mesh(geometry, material);
}


function buildMarker() {
    const marker = new THREE.Group();
    const aura = new THREE.Mesh(
        new THREE.SphereGeometry(4.4, 20, 20),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.18,
        }),
    );
    const core = new THREE.Mesh(
        new THREE.SphereGeometry(2.05, 20, 20),
        new THREE.MeshStandardMaterial({
            color: 0x74f2ce,
            emissive: 0x74f2ce,
            emissiveIntensity: 1.4,
            roughness: 0.18,
            metalness: 0.05,
        }),
    );
    marker.add(aura, core);
    return marker;
}

function buildHalo(color) {
    return new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 18),
        new THREE.MeshBasicMaterial({
            color,
            wireframe: true,
            transparent: true,
            opacity: 0.82,
        }),
    );
}

function computeLayout() {
    const vertexPool = state.model.vertexPool;
    const nodes = state.model.nodes.map((node) => ({ ...node }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));

    state.model.edges.forEach((edge) => {
        if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) {
            return;
        }
        adjacency.get(edge.source).add(edge.target);
        adjacency.get(edge.target).add(edge.source);
    });

    const shells = new Map();
    nodes.forEach((node) => {
        const distance = Number.isFinite(node.distance) ? node.distance : 0;
        if (!shells.has(distance)) {
            shells.set(distance, []);
        }
        shells.get(distance).push(node);
    });

    const shellDistances = Array.from(shells.keys()).sort((left, right) => left - right);
    const positions = new Map();
    const anchorAngles = new Map();

    shellDistances.forEach((distance) => {
        const shellNodes = shells.get(distance) || [];
        const radius = distance * LATTICE_SPACING;

        shellNodes.forEach((node) => {
            if (distance === 0) {
                positions.set(node.id, { x: 0, z: 0 });
                anchorAngles.set(node.id, 0);
                return;
            }

            const hash = hashString(node.id);
            const cached = state.positionCache.get(node.id);
            let angle = null;

            if (cached) {
                const cachedLength = Math.hypot(cached.x, cached.z);
                if (cachedLength > 1e-6) {
                    angle = angleFromPlane(cached.x, cached.z);
                }
            }

            const vertex = vertexPool.get(node.id);
            const apartmentAngle = vertex && isInStandardApartment(vertex)
                ? apartmentSeedAngle(node)
                : null;

            const parentAngles = [];
            adjacency.get(node.id)?.forEach((neighborId) => {
                const neighbor = nodeById.get(neighborId);
                if (!neighbor || neighbor.distance >= distance) {
                    return;
                }
                const position = positions.get(neighborId);
                if (!position) {
                    return;
                }
                parentAngles.push(angleFromPlane(position.x, position.z));
            });

            const parentAngle = averageAngles(parentAngles);
            const fallbackAngle = ((hash % 8192) / 8192) * Math.PI * 2;
            if (angle === null) {
                angle = apartmentAngle ?? parentAngle ?? fallbackAngle;
            }

            const jitterScale = Math.min(0.38, (Math.PI * 1.5) / Math.max(shellNodes.length, 6));
            const jitter = ((((hash >>> 13) % 2001) / 1000) - 1) * jitterScale;
            angle += jitter;

            anchorAngles.set(node.id, apartmentAngle ?? parentAngle ?? angle);
            positions.set(node.id, {
                x: Math.cos(angle) * radius,
                z: Math.sin(angle) * radius,
            });
        });
    });

    const iterationCount = nodes.length > 360 ? 90 : 130;
    for (let iteration = 0; iteration < iterationCount; iteration += 1) {
        const forces = new Map(nodes.map((node) => [node.id, { x: 0, z: 0 }]));

        state.model.edges.forEach((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) {
                return;
            }

            const dx = target.x - source.x;
            const dz = target.z - source.z;
            const distance = Math.max(1e-6, Math.hypot(dx, dz));
            const spring = (distance - EDGE_REST_LENGTH) * 0.085;
            const fx = (dx / distance) * spring;
            const fz = (dz / distance) * spring;

            forces.get(edge.source).x += fx;
            forces.get(edge.source).z += fz;
            forces.get(edge.target).x -= fx;
            forces.get(edge.target).z -= fz;
        });

        shellDistances.forEach((distance) => {
            const shellNodes = shells.get(distance) || [];
            if (distance === 0) {
                return;
            }

            for (let leftIndex = 0; leftIndex < shellNodes.length; leftIndex += 1) {
                const leftId = shellNodes[leftIndex].id;
                const leftPos = positions.get(leftId);
                for (let rightIndex = leftIndex + 1; rightIndex < shellNodes.length; rightIndex += 1) {
                    const rightId = shellNodes[rightIndex].id;
                    const rightPos = positions.get(rightId);

                    let dx = rightPos.x - leftPos.x;
                    let dz = rightPos.z - leftPos.z;
                    let distSquared = dx * dx + dz * dz;
                    if (distSquared < 1e-6) {
                        const angle = ((hashString(`${leftId}|${rightId}`) % 8192) / 8192) * Math.PI * 2;
                        dx = Math.cos(angle) * 1e-3;
                        dz = Math.sin(angle) * 1e-3;
                        distSquared = dx * dx + dz * dz;
                    }

                    const pairDistance = Math.sqrt(distSquared);
                    const repulsion = (LATTICE_SPACING * LATTICE_SPACING * 0.72) / (distSquared + 24);
                    const fx = (dx / pairDistance) * repulsion;
                    const fz = (dz / pairDistance) * repulsion;

                    forces.get(leftId).x -= fx;
                    forces.get(leftId).z -= fz;
                    forces.get(rightId).x += fx;
                    forces.get(rightId).z += fz;
                }
            }

            shellNodes.forEach((node) => {
                const force = forces.get(node.id);
                const position = positions.get(node.id);
                const theta = angleFromPlane(position.x, position.z);
                const parentAngles = [];

                adjacency.get(node.id)?.forEach((neighborId) => {
                    const neighbor = nodeById.get(neighborId);
                    if (!neighbor || neighbor.distance >= distance) {
                        return;
                    }
                    const neighborPos = positions.get(neighborId);
                    if (!neighborPos) {
                        return;
                    }
                    parentAngles.push(angleFromPlane(neighborPos.x, neighborPos.z));
                });

                const parentAngle = averageAngles(parentAngles);
                const targetAngle = parentAngle ?? anchorAngles.get(node.id);
                if (targetAngle === null || targetAngle === undefined) {
                    return;
                }

                const tangentX = -Math.sin(theta);
                const tangentZ = Math.cos(theta);
                const alignment = shortestAngleDelta(theta, targetAngle);
                const strength = parentAngle === null ? 0.055 : 0.12;
                force.x += tangentX * alignment * LATTICE_SPACING * strength;
                force.z += tangentZ * alignment * LATTICE_SPACING * strength;
            });
        });

        shellDistances.forEach((distance) => {
            if (distance === 0) {
                return;
            }

            const radius = distance * LATTICE_SPACING;
            const stepSize = iteration < iterationCount * 0.55 ? 0.26 : 0.18;
            (shells.get(distance) || []).forEach((node) => {
                const force = forces.get(node.id);
                const position = positions.get(node.id);
                position.x += force.x * stepSize;
                position.z += force.z * stepSize;

                let length = Math.hypot(position.x, position.z);
                if (length < 1e-6) {
                    const angle = anchorAngles.get(node.id) ?? 0;
                    position.x = Math.cos(angle) * radius;
                    position.z = Math.sin(angle) * radius;
                    length = radius;
                }

                const scale = radius / length;
                position.x *= scale;
                position.z *= scale;
            });
        });
    }

    nodes.forEach((node) => {
        const position = positions.get(node.id) || { x: 0, z: 0 };
        node.scenePosition = new THREE.Vector3(
            position.x,
            (node.type - 1) * TYPE_LAYER_HEIGHT,
            position.z,
        );
        state.positionCache.set(node.id, { x: position.x, z: position.z });
    });

    const edges = state.model.edges
        .map((edge) => ({
            ...edge,
            sourceId: edge.source,
            targetId: edge.target,
            source: nodeById.get(edge.source),
            target: nodeById.get(edge.target),
        }))
        .filter((edge) => edge.source && edge.target);

    return { nodes, nodeById, edges };
}

function buildSceneGraph() {
    if (!state.model || !state.three || !state.layout) {
        return;
    }

    const three = state.three;
    clearGroup(three.world);
    three.pickables = [];
    three.nodeMeshes = new Map();

    const orbitOnlyEdges = [];
    const localEdges = [];
    const apartmentEdgeList = [];
    state.layout.edges.forEach((edge) => {
        const sv = state.model.vertexPool.get(edge.sourceId);
        const tv = state.model.vertexPool.get(edge.targetId);
        const inApt = sv && tv && isInStandardApartment(sv) && isInStandardApartment(tv);
        if (inApt) {
            apartmentEdgeList.push(edge);
        }
        if (edge.source.inOrbit && edge.target.inOrbit) {
            orbitOnlyEdges.push(edge);
        } else {
            localEdges.push(edge);
        }
    });

    const orbitOnlyChambers = [];
    const localChambers = [];
    const apartmentChamberList = [];
    state.model.chambers.forEach((chamber) => {
        const allOrbit = chamber.vertices.every((vertexId) => pointForVertex(vertexId)?.inOrbit);
        const allInApt = chamber.vertices.every((vertexId) => {
            const v = state.model.vertexPool.get(vertexId);
            return v && isInStandardApartment(v);
        });
        if (allInApt) {
            apartmentChamberList.push(chamber);
        }
        if (allOrbit) {
            orbitOnlyChambers.push(chamber);
        } else {
            localChambers.push(chamber);
        }
    });

    three.localEdges = buildLineSegments(localEdges, 0xffffff, 0.16);
    three.orbitEdges = buildLineSegments(orbitOnlyEdges, 0x74f2ce, 0.52);
    three.localChambers = buildChamberMesh(localChambers, TYPE_COLORS);
    three.orbitChambers = buildChamberMesh(orbitOnlyChambers, TYPE_COLORS);
    three.apartmentEdges = buildLineSegments(apartmentEdgeList, 0xffd700, 0.92);
    three.apartmentChambers = buildChamberMesh(apartmentChamberList, ['#ffd700', '#ffd700', '#ffd700']);

    if (three.localChambers) {
        three.localChambers.material.opacity = 0.12;
        three.world.add(three.localChambers);
    }
    if (three.orbitChambers) {
        three.orbitChambers.material.opacity = 0.22;
        three.world.add(three.orbitChambers);
    }
    if (three.apartmentChambers) {
        three.apartmentChambers.material.opacity = 0.35;
        three.world.add(three.apartmentChambers);
    }
    if (three.localEdges) {
        three.world.add(three.localEdges);
    }
    if (three.orbitEdges) {
        three.world.add(three.orbitEdges);
    }
    if (three.apartmentEdges) {
        three.world.add(three.apartmentEdges);
    }

    state.layout.nodes.forEach((node) => {
        const radius = sceneNodeRadius(node);
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 20, 20),
            new THREE.MeshStandardMaterial({
                color: TYPE_COLORS[node.type],
                emissive: TYPE_COLORS[node.type],
                emissiveIntensity: node.inOrbit ? 0.36 : 0.2,
                transparent: true,
                opacity: node.inOrbit ? 0.96 : 0.78,
                roughness: 0.28,
                metalness: 0.08,
            }),
        );
        mesh.position.copy(node.scenePosition);
        mesh.userData.vertexId = node.id;
        mesh.userData.inOrbit = node.inOrbit;
        mesh.userData.radius = radius;
        three.world.add(mesh);
        three.pickables.push(mesh);
        three.nodeMeshes.set(node.id, mesh);
    });

    three.marker = buildMarker();
    three.baseHalo = buildHalo(0x67d6ff);
    three.selectedHalo = buildHalo(0xffcf6e);
    three.currentHalo = buildHalo(0xffffff);

    three.world.add(three.marker, three.baseHalo, three.selectedHalo, three.currentHalo);
    updateVisibility();
    updatePathHighlight();
    updateVertexDecorations();
}

function updatePathHighlight() {
    if (!state.model || !state.three || !state.layout) {
        return;
    }

    const three = state.three;
    if (three.pathMesh) {
        three.world.remove(three.pathMesh);
        disposeObject3D(three.pathMesh);
        three.pathMesh = null;
    }

    const points = buildPrefixIds()
        .map((vertexId) => pointForVertex(vertexId))
        .filter(Boolean)
        .reduce((accumulator, node) => {
            const last = accumulator[accumulator.length - 1];
            if (!last || !last.equals(node.scenePosition)) {
                accumulator.push(node.scenePosition.clone());
            }
            return accumulator;
        }, []);

    if (points.length >= 2) {
        const curve = points.length === 2
            ? new THREE.LineCurve3(points[0], points[1])
            : new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.35);
        const geometry = new THREE.TubeGeometry(curve, Math.max(24, points.length * 20), 1.15, 10, false);
        const material = new THREE.MeshStandardMaterial({
            color: 0x74f2ce,
            emissive: 0x74f2ce,
            emissiveIntensity: 0.48,
            transparent: true,
            opacity: 0.9,
            roughness: 0.25,
            metalness: 0.05,
        });
        three.pathMesh = new THREE.Mesh(geometry, material);
        three.world.add(three.pathMesh);
    }

    const current = currentVertex();
    const node = current ? pointForVertex(current.id) : null;
    if (node) {
        three.marker.visible = true;
        if (!state.isAnimating) {
            three.marker.position.copy(node.scenePosition);
        }
    } else if (!state.isAnimating) {
        three.marker.visible = false;
    }
}

function buildPrefixIds() {
    if (!state.model) {
        return [];
    }

    const tokens = keyToTokens(state.currentWordKey);
    const ids = [];
    let key = '';
    const first = state.model.states.get('')?.vertexId;
    if (first) {
        ids.push(first);
    }
    tokens.forEach((token) => {
        key = key ? `${key},${token}` : token;
        const wordState = state.model.states.get(key);
        if (wordState) {
            ids.push(wordState.vertexId);
        }
    });
    return ids;
}

function applyHalo(halo, vertexId, colorVisible = true, padding = 1.8) {
    if (!state.three || !state.layout) {
        return;
    }
    const node = pointForVertex(vertexId);
    const mesh = state.three.nodeMeshes.get(vertexId);
    if (!node || !mesh || !mesh.visible || !colorVisible) {
        halo.visible = false;
        return;
    }
    halo.visible = true;
    halo.position.copy(node.scenePosition);
    const scale = mesh.userData.radius + padding;
    halo.scale.setScalar(scale);
}

function updateVertexDecorations() {
    if (!state.model || !state.three) {
        return;
    }

    applyHalo(state.three.baseHalo, state.model.baseVertexId, true, 1.5);
    applyHalo(state.three.selectedHalo, state.selectedVertexId || state.model.baseVertexId, true, 2.4);
    const current = currentVertex();
    applyHalo(state.three.currentHalo, current ? current.id : state.model.baseVertexId, true, 3.2);
}

function updateVisibility() {
    if (!state.three || !state.layout) {
        return;
    }

    const { showNeighborhood, showChambers, showApartment } = viewOptions();

    state.three.nodeMeshes.forEach((mesh, vertexId) => {
        const baseVisible = showNeighborhood || mesh.userData.inOrbit;
        if (showApartment && baseVisible) {
            const v = state.model?.vertexPool.get(vertexId);
            const inApt = v && isInStandardApartment(v);
            mesh.visible = true;
            mesh.material.opacity = inApt ? 1.0 : 0.12;
            mesh.material.emissiveIntensity = inApt ? 0.5 : 0.08;
        } else {
            mesh.visible = baseVisible;
            mesh.material.opacity = mesh.userData.inOrbit ? 0.96 : 0.78;
            mesh.material.emissiveIntensity = mesh.userData.inOrbit ? 0.36 : 0.2;
        }
    });

    if (state.three.localEdges) {
        state.three.localEdges.visible = showNeighborhood && !showApartment;
    }
    if (state.three.orbitEdges) {
        state.three.orbitEdges.visible = !showApartment;
    }
    if (state.three.localChambers) {
        state.three.localChambers.visible = showNeighborhood && showChambers && !showApartment;
    }
    if (state.three.orbitChambers) {
        state.three.orbitChambers.visible = showChambers && !showApartment;
    }
    if (state.three.apartmentEdges) {
        state.three.apartmentEdges.visible = showApartment;
    }
    if (state.three.apartmentChambers) {
        state.three.apartmentChambers.visible = showApartment && showChambers;
    }

    updateVertexDecorations();
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
        metaEl.textContent = `type ${vertex.type}, ${visibleDistanceLabel(vertex.id)}, diag v = (${vertex.diagonal.join(', ')}), v(det) = ${vertex.determinantVal}`;
    }
    if (summaryEl && vertex) {
        const visibleNode = pointForVertex(vertex.id);
        if (visibleNode) {
            summaryEl.textContent = `type ${vertex.type}, d(base) = ${visibleNode.distance}`;
        } else if (state.model.patchTruncated) {
            summaryEl.textContent = `type ${vertex.type}, not shown in current ball`;
        } else {
            summaryEl.textContent = `type ${vertex.type}, outside radius ${state.patchRadius}`;
        }
    }

    updatePathHighlight();
    updateVertexDecorations();
    renderSelectedVertex();
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
    if (state.three) {
        clearGroup(state.three.world);
        state.three.pickables = [];
    }
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
        const wordLength = Number.isFinite(rawWordLength) ? Math.max(0, Math.min(8, rawWordLength)) : 0;
        const neighborRadius = Math.max(0, Math.min(3, state.patchRadius));
        document.getElementById('wordLength').value = String(wordLength);

        const generators = getMatricesFromUI();
        const targetWordKey = preserveWord ? state.currentWordKey : '';
        state.model = buildBuildingModel({ prime, generators, wordLength, neighborRadius });
        state.currentWordKey = state.model.states.has(targetWordKey) ? targetWordKey : '';

        if (!state.selectedVertexId || !state.model.vertexPool.has(state.selectedVertexId)) {
            state.selectedVertexId = state.model.baseVertexId;
        }

        renderWarnings(state.model.warnings);
        renderGeneratorControls();
        renderSummary();
        drawVisualization();
    } catch (error) {
        renderError(error.message || 'Unable to build the orbit.');
    }
}

function drawVisualization() {
    if (!state.model) {
        return;
    }

    ensureThreeScene();
    setRendererSize();
    state.layout = computeLayout();
    buildSceneGraph();
    updateWordUI();
}

async function animateMarkerTo(vertexId) {
    if (!state.three || !state.layout) {
        return;
    }
    const node = pointForVertex(vertexId);
    if (!node) {
        state.three.marker.visible = false;
        return;
    }
    state.three.marker.visible = true;
    state.three.marker.position.copy(node.scenePosition);
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
    state.isAnimating = Boolean(fromNode && toNode && currentState.vertexId !== nextState.vertexId);
    state.currentWordKey = nextKey;
    updateWordUI();

    if (!fromNode || !toNode || !state.three) {
        state.isAnimating = false;
        updatePathHighlight();
        updateVertexDecorations();
        return;
    }

    if (currentState.vertexId === nextState.vertexId) {
        state.isAnimating = false;
        await animateMarkerTo(nextState.vertexId);
        return;
    }

    const start = fromNode.scenePosition.clone();
    const end = toNode.scenePosition.clone();
    const duration = 650;

    await new Promise((resolve) => {
        const startedAt = performance.now();
        const frame = (timestamp) => {
            const elapsed = Math.min(1, (timestamp - startedAt) / duration);
            const eased = 1 - (1 - elapsed) ** 3;
            state.three.marker.position.lerpVectors(start, end, eased);
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
            await sleep(130);
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
    if (!state.three) {
        return;
    }
    state.three.controls.reset();
}

function recenterLayout() {
    if (state.model) {
        drawVisualization();
        resetCameraHome();
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
    document.getElementById('toggleApartment')?.addEventListener('change', updateVisibility);

    const radiusContainer = document.getElementById('radiusButtons');
    if (radiusContainer) {
        Array.from(radiusContainer.querySelectorAll('[data-radius]')).forEach((button) => {
            button.addEventListener('click', () => {
                const r = parseInt(button.dataset.radius, 10);
                state.patchRadius = r;
                radiusContainer.querySelectorAll('[data-radius]').forEach((btn) => {
                    btn.classList.toggle('active', btn === button);
                });
                calculate();
            });
        });
    }

    window.addEventListener('resize', () => {
        if (state.model) {
            drawVisualization();
        } else if (state.three) {
            setRendererSize();
        }
    });
}

function setupPanelToggles() {
    const titleBar = document.getElementById('floatingTitle');
    const titleBtn = document.getElementById('toggleTitleBtn');
    if (titleBar && titleBtn) {
        titleBtn.addEventListener('click', () => {
            const collapsed = titleBar.classList.toggle('collapsed');
            titleBtn.textContent = collapsed ? '▸' : '▾';
        });

        setTimeout(() => {
            titleBar.classList.add('collapsed');
            titleBtn.textContent = '▸';
        }, 3000);
    }

    const controlsPanel = document.getElementById('floatingControls');
    const controlsBtn = document.getElementById('toggleControlsBtn');
    if (controlsPanel && controlsBtn) {
        controlsBtn.addEventListener('click', () => {
            const collapsed = controlsPanel.classList.toggle('collapsed');
            controlsBtn.textContent = collapsed ? '▸' : '◀';
        });
    }
}

function bootstrapDefaultMatrices() {
    DEFAULT_MATRICES.forEach((values) => addMatrixBlock(values));
}

function init() {
    if (typeof THREE === 'undefined') {
        renderError('Three.js failed to load.');
        return;
    }

    setupTabs();
    setupPanelToggles();
    bindControls();
    bootstrapDefaultMatrices();
    ensureThreeScene();
    calculate({ preserveWord: false });
}

document.addEventListener('DOMContentLoaded', init);
