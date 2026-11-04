(() => {
    const COLORS = {
        r: { name: 'red', css: '#f05b62', rgb: [240, 91, 98], hex: 0xf05b62 },
        g: { name: 'green', css: '#53c26b', rgb: [83, 194, 107], hex: 0x53c26b },
        b: { name: 'blue', css: '#4f8cff', rgb: [79, 140, 255], hex: 0x4f8cff }
    };
    const COLOR_ORDER = ['r', 'g', 'b'];
    const TUBE_SEGMENTS = 140;
    const STAGE_CONFIG = {
        full: {
            squares: '9',
            chi: '1',
            stageCopy: 'Before deleting anything, Θ × Θ has all nine squares. It is still a product complex, not yet the closed surface we want.',
            selectionCopy: 'All nine squares are present. The three diagonal cells rr, gg, and bb are exactly the ones that will be removed.',
            shellOpacity: 0.18,
            ribbonOpacity: 0.32,
            coreOpacity: 0.92,
            ghostOpacity: 0.78,
            autoSpin: 0.18
        },
        punctured: {
            squares: '6',
            chi: '-2',
            stageCopy: 'Removing rr, gg, and bb leaves six squares. The new count 4 - 12 + 6 = -2 is the Euler characteristic of a genus 2 surface.',
            selectionCopy: 'The diagonal is gone. The six off-diagonal squares now form a closed square complex of genus 2.',
            shellOpacity: 0.28,
            ribbonOpacity: 0.78,
            coreOpacity: 0.82,
            ghostOpacity: 0.08,
            autoSpin: 0.32
        },
        surface: {
            squares: '6',
            chi: '-2',
            stageCopy: 'This is the same six-square complex, now read as the boundary of a thickened theta graph. The two visible tunnels make the genus 2 structure immediate.',
            selectionCopy: 'The six remaining squares wrap around the boundary of a thickened theta graph, giving a closed orientable surface of genus 2.',
            shellOpacity: 0.42,
            ribbonOpacity: 0.92,
            coreOpacity: 0.5,
            ghostOpacity: 0.02,
            autoSpin: 0.65
        }
    };

    const dom = {};
    const ribbons = new Map();
    const ghosts = new Map();
    const coreCurves = new Map();
    const coreMeshes = new Map();
    const shellMaterials = [];
    const buttonMap = new Map();

    let scene;
    let camera;
    let renderer;
    let controls;
    let rootGroup;
    let clock;
    let currentStage = 'punctured';
    let activePair = null;
    let lockedPair = null;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        dom.canvas = document.getElementById('scene');
        dom.grid = document.getElementById('product-grid');
        dom.squareCount = document.getElementById('square-count');
        dom.chiValue = document.getElementById('chi-value');
        dom.stageCopy = document.getElementById('stage-copy');
        dom.selectionCopy = document.getElementById('selection-copy');
        dom.thetaA = document.getElementById('theta-factor-a');
        dom.thetaB = document.getElementById('theta-factor-b');
        dom.modeButtons = document.querySelectorAll('.mode-button');

        buildGrid();
        initScene();
        wireButtons();
        applyStage(currentStage);
        setActivePair(null);

        window.addEventListener('resize', onResize);
        onResize();
        animate();
    }

    function buildGrid() {
        const grid = dom.grid;
        grid.innerHTML = '';

        const corner = document.createElement('div');
        corner.className = 'grid-corner';
        corner.textContent = '×';
        grid.appendChild(corner);

        COLOR_ORDER.forEach((color) => {
            grid.appendChild(createAxisChip(color, 'col'));
        });

        COLOR_ORDER.forEach((rowColor) => {
            grid.appendChild(createAxisChip(rowColor, 'row'));

            COLOR_ORDER.forEach((colColor) => {
                const pair = `${rowColor}${colColor}`;
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'product-cell';
                cell.dataset.pair = pair;
                cell.dataset.diagonal = String(rowColor === colColor);
                cell.setAttribute('aria-label', `${COLORS[rowColor].name} by ${COLORS[colColor].name} square`);
                cell.style.background = createCellBackground(rowColor, colColor);

                cell.innerHTML = `
                    <div class="cell-markers">
                        <span class="cell-dot" style="background:${COLORS[rowColor].css}; color:${COLORS[rowColor].css};"></span>
                        <span>×</span>
                        <span class="cell-dot" style="background:${COLORS[colColor].css}; color:${COLORS[colColor].css};"></span>
                    </div>
                    <div class="cell-title">${rowColor} × ${colColor}</div>
                `;

                cell.addEventListener('mouseenter', () => {
                    if (!lockedPair) {
                        setActivePair(pair);
                    }
                });
                cell.addEventListener('focus', () => {
                    if (!lockedPair) {
                        setActivePair(pair);
                    }
                });
                cell.addEventListener('click', () => {
                    lockedPair = lockedPair === pair ? null : pair;
                    setActivePair(lockedPair);
                });

                grid.appendChild(cell);
            });
        });

        grid.addEventListener('mouseleave', () => {
            if (!lockedPair) {
                setActivePair(null);
            }
        });
    }

    function createAxisChip(color, axisClass) {
        const chip = document.createElement('div');
        chip.className = `grid-axis ${axisClass}`;
        chip.innerHTML = `
            <span class="axis-dot" style="background:${COLORS[color].css}; color:${COLORS[color].css};"></span>
            <span>${color}</span>
        `;
        return chip;
    }

    function createCellBackground(first, second) {
        const alphaA = first === second ? 0.78 : 0.7;
        const alphaB = first === second ? 0.52 : 0.82;
        return `linear-gradient(145deg, ${rgba(COLORS[first], alphaA)}, ${rgba(COLORS[second], alphaB)})`;
    }

    function wireButtons() {
        dom.modeButtons.forEach((button) => {
            buttonMap.set(button.dataset.stage, button);
            button.addEventListener('click', () => {
                applyStage(button.dataset.stage);
            });
        });
    }

    function initScene() {
        clock = new THREE.Clock();
        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 80);
        camera.position.set(0.8, 2.2, 11.8);

        renderer = new THREE.WebGLRenderer({
            canvas: dom.canvas,
            antialias: true,
            alpha: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;

        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = false;
        controls.minDistance = 7;
        controls.maxDistance = 18;
        controls.target.set(2.2, 0, 0);

        const hemi = new THREE.HemisphereLight(0xd9f2ff, 0x081118, 1.15);
        scene.add(hemi);

        const keyLight = new THREE.DirectionalLight(0xfff4de, 1.2);
        keyLight.position.set(6, 9, 10);
        scene.add(keyLight);

        const coolLight = new THREE.DirectionalLight(0x79a9ff, 0.8);
        coolLight.position.set(-7, -4, 6);
        scene.add(coolLight);

        const rimLight = new THREE.PointLight(0xe4c178, 1.6, 40, 2);
        rimLight.position.set(1, 2, 5.2);
        scene.add(rimLight);

        rootGroup = new THREE.Group();
        scene.add(rootGroup);

        addBackdrop();
        addSurfaceShell();
        addCoreGraph();
        addRibbons();
        addGhostSquares();
    }

    function addBackdrop() {
        const ringMaterial = new THREE.LineBasicMaterial({
            color: 0xe4c178,
            transparent: true,
            opacity: 0.12
        });

        [-1.8, 1.8].forEach((yOffset, index) => {
            const curve = new THREE.EllipseCurve(0, 0, 1.8, 1.15, 0, Math.PI * 2, false, index * 0.2);
            const points = curve.getPoints(120).map((point) => new THREE.Vector3(point.x + 2.1, point.y + yOffset, -2.4));
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.LineLoop(geometry, ringMaterial);
            rootGroup.add(line);
        });
    }

    function addSurfaceShell() {
        const hubGeometry = new THREE.SphereGeometry(1.12, 48, 48);
        const tubeMaterialTemplate = new THREE.MeshPhysicalMaterial({
            color: 0xf5eee2,
            transparent: true,
            opacity: 0.28,
            roughness: 0.28,
            metalness: 0.02,
            clearcoat: 0.95,
            clearcoatRoughness: 0.32,
            transmission: 0.02,
            side: THREE.DoubleSide
        });

        const leftHub = new THREE.Mesh(hubGeometry, tubeMaterialTemplate.clone());
        leftHub.position.set(-3.15, 0, 0);
        leftHub.scale.set(1.04, 0.98, 0.86);
        leftHub.renderOrder = 1;
        shellMaterials.push(leftHub.material);
        rootGroup.add(leftHub);

        const rightHub = new THREE.Mesh(hubGeometry, tubeMaterialTemplate.clone());
        rightHub.position.set(3.15, 0, 0);
        rightHub.scale.set(1.04, 0.98, 0.86);
        rightHub.renderOrder = 1;
        shellMaterials.push(rightHub.material);
        rootGroup.add(rightHub);

        const curveDefinitions = {
            r: [
                [-3.15, 0, 0],
                [-1.8, 1.42, 0.96],
                [0, 1.88, 0.18],
                [1.8, 1.42, -0.96],
                [3.15, 0, 0]
            ],
            g: [
                [-3.15, 0, 0],
                [-1.2, 0.28, 0.48],
                [0, 0, -0.16],
                [1.2, -0.28, -0.48],
                [3.15, 0, 0]
            ],
            b: [
                [-3.15, 0, 0],
                [-1.8, -1.42, -0.96],
                [0, -1.88, -0.18],
                [1.8, -1.42, 0.96],
                [3.15, 0, 0]
            ]
        };

        Object.entries(curveDefinitions).forEach(([color, points]) => {
            const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
            curve.curveType = 'centripetal';
            const frames = curve.computeFrenetFrames(TUBE_SEGMENTS, false);
            coreCurves.set(color, { curve, frames });

            const tubeGeometry = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, 0.54, 28, false);
            const tube = new THREE.Mesh(tubeGeometry, tubeMaterialTemplate.clone());
            tube.renderOrder = 1;
            shellMaterials.push(tube.material);
            rootGroup.add(tube);
        });
    }

    function addCoreGraph() {
        coreCurves.forEach(({ curve }, color) => {
            const geometry = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, 0.075, 18, false);
            const material = new THREE.MeshStandardMaterial({
                color: COLORS[color].hex,
                emissive: COLORS[color].hex,
                emissiveIntensity: 0.62,
                transparent: true,
                opacity: 0.92,
                roughness: 0.34,
                metalness: 0.1
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 2;
            rootGroup.add(mesh);
            coreMeshes.set(color, mesh);
        });

        const vertexMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5eee2,
            emissive: 0xe4c178,
            emissiveIntensity: 0.2,
            transparent: true,
            opacity: 0.92,
            roughness: 0.3,
            metalness: 0.05
        });
        const vertexGeometry = new THREE.SphereGeometry(0.18, 18, 18);

        [-3.15, 3.15].forEach((x) => {
            const vertex = new THREE.Mesh(vertexGeometry, vertexMaterial.clone());
            vertex.position.set(x, 0, 0);
            vertex.renderOrder = 2;
            rootGroup.add(vertex);
        });
    }

    function addRibbons() {
        const angleBands = {
            r: [
                { second: 'g', start: -2.45, end: -0.38 },
                { second: 'b', start: 0.38, end: 2.45 }
            ],
            g: [
                { second: 'r', start: -2.12, end: -0.15 },
                { second: 'b', start: 0.15, end: 2.12 }
            ],
            b: [
                { second: 'r', start: -2.45, end: -0.38 },
                { second: 'g', start: 0.38, end: 2.45 }
            ]
        };

        angleBands.r.forEach((band) => addRibbon('r', band.second, band.start, band.end));
        angleBands.g.forEach((band) => addRibbon('g', band.second, band.start, band.end));
        angleBands.b.forEach((band) => addRibbon('b', band.second, band.start, band.end));
    }

    function addRibbon(first, second, thetaStart, thetaEnd) {
        const pair = `${first}${second}`;
        const { curve, frames } = coreCurves.get(first);
        const geometry = createRibbonGeometry(curve, frames, 0.59, thetaStart, thetaEnd, 0.12, 0.88, 84);
        const material = new THREE.MeshPhysicalMaterial({
            color: COLORS[first].hex,
            emissive: COLORS[first].hex,
            emissiveIntensity: 0.12,
            transparent: true,
            opacity: STAGE_CONFIG[currentStage].ribbonOpacity,
            roughness: 0.42,
            metalness: 0.02,
            clearcoat: 0.76,
            clearcoatRoughness: 0.42,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 3;

        const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry, 35),
            new THREE.LineBasicMaterial({
                color: COLORS[second].hex,
                transparent: true,
                opacity: 0.95
            })
        );
        outline.renderOrder = 4;

        const sprite = createLabelSprite(`${first}×${second}`, COLORS[first].css, COLORS[second].css);
        sprite.position.copy(pointOnTube(curve, frames, 0.5, 0.84, (thetaStart + thetaEnd) * 0.5));
        sprite.scale.set(1.62, 0.62, 1);
        sprite.renderOrder = 5;

        rootGroup.add(mesh);
        rootGroup.add(outline);
        rootGroup.add(sprite);

        ribbons.set(pair, { first, second, mesh, outline, sprite });
    }

    function addGhostSquares() {
        const ghostPositions = {
            rr: new THREE.Vector3(-1.3, 2.65, 2.85),
            gg: new THREE.Vector3(0.25, 0.15, 3.45),
            bb: new THREE.Vector3(1.35, -2.65, 2.85)
        };

        ['r', 'g', 'b'].forEach((color) => {
            const pair = `${color}${color}`;
            const tileGroup = new THREE.Group();
            tileGroup.position.copy(ghostPositions[pair]);
            tileGroup.renderOrder = 6;

            const panel = new THREE.Mesh(
                new THREE.PlaneGeometry(1.18, 1.18),
                new THREE.MeshBasicMaterial({
                    color: COLORS[color].hex,
                    transparent: true,
                    opacity: STAGE_CONFIG[currentStage].ghostOpacity,
                    depthWrite: false,
                    side: THREE.DoubleSide
                })
            );
            tileGroup.add(panel);

            const outline = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.18, 1.18)),
                new THREE.LineBasicMaterial({
                    color: 0xf5eee2,
                    transparent: true,
                    opacity: STAGE_CONFIG[currentStage].ghostOpacity
                })
            );
            tileGroup.add(outline);

            const crossMaterial = new THREE.LineBasicMaterial({
                color: 0x071015,
                transparent: true,
                opacity: Math.max(0.18, STAGE_CONFIG[currentStage].ghostOpacity)
            });
            const crossGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-0.44, -0.44, 0.02),
                new THREE.Vector3(0.44, 0.44, 0.02),
                new THREE.Vector3(-0.44, 0.44, 0.02),
                new THREE.Vector3(0.44, -0.44, 0.02)
            ]);
            const cross = new THREE.LineSegments(crossGeometry, crossMaterial);
            tileGroup.add(cross);

            const label = createLabelSprite(`${color}×${color}`, COLORS[color].css, '#f5eee2');
            label.position.set(0, -0.94, 0);
            label.scale.set(1.45, 0.52, 1);
            tileGroup.add(label);

            const connectorTarget = coreCurves.get(color).curve.getPointAt(0.5);
            const connectorGeometry = new THREE.BufferGeometry().setFromPoints([
                tileGroup.position.clone(),
                connectorTarget
            ]);
            const connector = new THREE.Line(
                connectorGeometry,
                new THREE.LineDashedMaterial({
                    color: COLORS[color].hex,
                    dashSize: 0.18,
                    gapSize: 0.12,
                    transparent: true,
                    opacity: STAGE_CONFIG[currentStage].ghostOpacity
                })
            );
            connector.computeLineDistances();
            connector.renderOrder = 5;

            rootGroup.add(connector);
            rootGroup.add(tileGroup);
            ghosts.set(pair, { panel, outline, cross, label, connector, tileGroup, color });
        });
    }

    function createRibbonGeometry(curve, frames, radius, thetaStart, thetaEnd, startT, endT, segments) {
        const positions = [];
        const uvs = [];
        const indices = [];
        const range = endT - startT;

        for (let i = 0; i <= segments; i += 1) {
            const t = startT + (i / segments) * range;
            const point = curve.getPointAt(t);
            const frame = sampleFrame(frames, t);
            const edgeA = radialOffset(frame, radius, thetaStart).add(point);
            const edgeB = radialOffset(frame, radius, thetaEnd).add(point);

            positions.push(edgeA.x, edgeA.y, edgeA.z);
            positions.push(edgeB.x, edgeB.y, edgeB.z);
            uvs.push(i / segments, 0, i / segments, 1);
        }

        for (let i = 0; i < segments; i += 1) {
            const a = i * 2;
            const b = a + 1;
            const c = a + 2;
            const d = a + 3;
            indices.push(a, c, b, b, c, d);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    function sampleFrame(frames, t) {
        const index = Math.min(TUBE_SEGMENTS, Math.max(0, Math.round(t * TUBE_SEGMENTS)));
        return {
            normal: frames.normals[index].clone(),
            binormal: frames.binormals[index].clone(),
            tangent: frames.tangents[index].clone()
        };
    }

    function radialOffset(frame, radius, angle) {
        return frame.normal.clone().multiplyScalar(Math.cos(angle) * radius)
            .add(frame.binormal.clone().multiplyScalar(Math.sin(angle) * radius));
    }

    function pointOnTube(curve, frames, t, radius, angle) {
        const point = curve.getPointAt(t);
        return point.add(radialOffset(sampleFrame(frames, t), radius, angle));
    }

    function createLabelSprite(text, fillColor, borderColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 192;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawRoundedRect(ctx, 22, 24, 468, 120, 36);
        ctx.fillStyle = 'rgba(7, 16, 21, 0.86)';
        ctx.fill();
        ctx.lineWidth = 10;
        ctx.strokeStyle = borderColor;
        ctx.stroke();

        ctx.fillStyle = fillColor;
        ctx.font = '700 66px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, 86);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
        });

        return new THREE.Sprite(material);
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    function applyStage(stage) {
        currentStage = stage;
        lockedPair = null;

        dom.squareCount.textContent = STAGE_CONFIG[stage].squares;
        dom.chiValue.textContent = STAGE_CONFIG[stage].chi;
        dom.stageCopy.textContent = STAGE_CONFIG[stage].stageCopy;

        buttonMap.forEach((button, key) => {
            button.classList.toggle('active', key === stage);
        });

        shellMaterials.forEach((material) => {
            material.opacity = STAGE_CONFIG[stage].shellOpacity;
        });

        updateGridState();
        setActivePair(null);
    }

    function setActivePair(pair) {
        activePair = pair;
        updateGridState();
        updateThetaFactor(dom.thetaA, pair ? pair[0] : null);
        updateThetaFactor(dom.thetaB, pair ? pair[1] : null);
        updateRibbons();
        updateGhosts();
        updateCoreGraph();
        dom.selectionCopy.textContent = selectionText(pair);
    }

    function updateGridState() {
        const cells = dom.grid.querySelectorAll('.product-cell');
        cells.forEach((cell) => {
            const pair = cell.dataset.pair;
            const isDiagonal = pair[0] === pair[1];
            const diagonalRemoved = currentStage !== 'full' && isDiagonal;
            cell.classList.toggle('removed', diagonalRemoved);
            cell.classList.toggle('active', pair === activePair);
            cell.classList.toggle('soft', Boolean(activePair) && pair !== activePair);
        });
    }

    function updateThetaFactor(svg, activeEdge) {
        svg.querySelectorAll('.theta-edge').forEach((edge) => {
            const isActive = activeEdge && edge.dataset.edge === activeEdge;
            edge.classList.toggle('active', isActive);
            edge.classList.toggle('dim', Boolean(activeEdge) && !isActive);
        });
    }

    function updateRibbons() {
        ribbons.forEach((ribbon, pair) => {
            const selected = pair === activePair;
            const subdued = Boolean(activePair) && !selected;
            ribbon.mesh.material.opacity = selected ? 1 : subdued ? STAGE_CONFIG[currentStage].ribbonOpacity * 0.18 : STAGE_CONFIG[currentStage].ribbonOpacity;
            ribbon.mesh.material.emissiveIntensity = selected ? 0.56 : subdued ? 0.04 : 0.12;
            ribbon.outline.material.opacity = selected ? 1 : subdued ? 0.18 : 0.88;
            ribbon.sprite.material.opacity = selected ? 1 : subdued ? 0.18 : 0.82;
        });
    }

    function updateGhosts() {
        ghosts.forEach((ghost, pair) => {
            const selected = pair === activePair;
            const subdued = Boolean(activePair) && !selected;
            const baseOpacity = STAGE_CONFIG[currentStage].ghostOpacity;
            const opacity = selected ? 0.94 : subdued ? baseOpacity * 0.22 : baseOpacity;

            ghost.panel.material.opacity = opacity;
            ghost.outline.material.opacity = selected ? 0.95 : subdued ? baseOpacity * 0.18 : Math.max(0.03, baseOpacity);
            ghost.cross.material.opacity = selected ? 0.78 : subdued ? baseOpacity * 0.12 : baseOpacity * 0.85;
            ghost.connector.material.opacity = opacity;
            ghost.label.material.opacity = selected ? 1 : subdued ? baseOpacity * 0.18 : baseOpacity;
        });
    }

    function updateCoreGraph() {
        coreMeshes.forEach((mesh, color) => {
            const engaged = activePair ? activePair.includes(color) : false;
            const subdued = Boolean(activePair) && !engaged;
            mesh.material.opacity = engaged ? 1 : subdued ? 0.18 : STAGE_CONFIG[currentStage].coreOpacity;
            mesh.material.emissiveIntensity = engaged ? 1.1 : subdued ? 0.08 : 0.62;
        });
    }

    function selectionText(pair) {
        if (!pair) {
            return STAGE_CONFIG[currentStage].selectionCopy;
        }

        const first = COLORS[pair[0]].name;
        const second = COLORS[pair[1]].name;

        if (pair[0] === pair[1]) {
            return `${pair[0]} × ${pair[1]} is diagonal, so it is deleted. Removing rr, gg, and bb drops the face count from 9 to 6 and changes χ from 1 to -2.`;
        }

        return `${pair[0]} × ${pair[1]} survives. It uses the ${first} edge in the first theta graph and the ${second} edge in the second one, and becomes one of the six bands on the genus 2 surface.`;
    }

    function animate() {
        requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();

        rootGroup.rotation.y = 0.12 * Math.sin(elapsed * 0.18) + elapsed * 0.04 * STAGE_CONFIG[currentStage].autoSpin;
        rootGroup.rotation.x = 0.06 * Math.cos(elapsed * 0.22);

        const inverseRoot = rootGroup.quaternion.clone().conjugate();
        ghosts.forEach((ghost) => {
            ghost.tileGroup.quaternion.copy(inverseRoot).multiply(camera.quaternion);
        });

        controls.update();
        renderer.render(scene, camera);
    }

    function onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const mobile = width < 1100;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);

        if (mobile) {
            rootGroup.position.set(0, -1.2, 0);
            camera.position.set(0.2, 2.9, 12.8);
            controls.target.set(0, -0.45, 0);
        } else {
            rootGroup.position.set(2.2, 0, 0);
            camera.position.set(0.8, 2.2, 11.8);
            controls.target.set(2.2, 0, 0);
        }

        controls.update();
    }

    function rgba(color, alpha) {
        return `rgba(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]}, ${alpha})`;
    }
})();
