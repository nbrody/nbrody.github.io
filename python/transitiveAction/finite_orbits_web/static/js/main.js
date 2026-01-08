document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('run-btn');
    const loader = runBtn.querySelector('.loader');
    const btnText = runBtn.querySelector('span');
    const resultsSection = document.getElementById('results-section');

    // Inputs
    const generatorInput = document.getElementById('generator');
    const hInput = document.getElementById('H');
    const depthInput = document.getElementById('depth');
    const heightCapFactorInput = document.getElementById('height_cap_factor');
    const maxNodesInput = document.getElementById('max_nodes');

    // Outputs
    const repsCount = document.getElementById('reps-count');
    const hitCap = document.getElementById('hit-cap');
    const stopReason = document.getElementById('stop-reason');
    const repsList = document.getElementById('reps-list');
    const statusBadge = document.getElementById('status-badge');

    // Match Section
    const matchSection = document.getElementById('match-section');
    const rationalInput = document.getElementById('rational-input');
    const matchDepthInput = document.getElementById('match-depth');
    const matchHeightCapInput = document.getElementById('match-height-cap');
    const matchBeamWidthInput = document.getElementById('match-beam-width');
    const matchBtn = document.getElementById('match-btn');
    const matchResult = document.getElementById('match-result');
    const matchTarget = document.getElementById('match-target');
    const pathSteps = document.getElementById('path-steps');
    const canvas = document.getElementById('orbit-canvas');
    const ctx = canvas.getContext('2d');
    const stopBtn = document.getElementById('stop-btn');

    // ... (omitted parts) ...
    // Note: Since I can't easily skip lines in `replace_file_content` without context, I will just update the section separately or try to target specific blocks. 
    // I will target the variable declarations first.

    // Actually I'll just do the variable declaration now.


    // State
    let currentReps = [];
    let currentPath = null;
    let abortController = null;

    // Generator Logic
    const MQ = MathQuill.getInterface(2);
    const matrixContainer = document.getElementById('matrix-editor-container');
    const addGenBtn = document.getElementById('add-gen-btn');

    let activeGenerators = []; // { id, fields: {a,b,c,d}, el }
    let genCounter = 0;

    function addGeneratorBlock(matrix = null) {
        genCounter++;
        const genId = genCounter;
        const domId = `gen-${genId}`;

        const block = document.createElement('div');
        block.className = 'matrix-block';
        block.innerHTML = `
            <button class="remove-gen-btn" title="Remove Generator">×</button>
            <label>g<sub>${activeGenerators.length + 1}</sub></label>
            <div class="matrix-ui">
                <div class="matrix-bracket left-bracket"></div>
                <div class="matrix-inputs">
                    <div class="matrix-row">
                        <span id="${domId}-a" class="mq-field"></span>
                        <span id="${domId}-b" class="mq-field"></span>
                    </div>
                    <div class="matrix-row">
                        <span id="${domId}-c" class="mq-field"></span>
                        <span id="${domId}-d" class="mq-field"></span>
                    </div>
                </div>
                <div class="matrix-bracket right-bracket"></div>
            </div>
        `;

        matrixContainer.appendChild(block);

        // Init Fields
        const fields = {};
        ['a', 'b', 'c', 'd'].forEach(key => {
            const el = document.getElementById(`${domId}-${key}`);
            fields[key] = MQ.MathField(el, {
                handlers: {
                    edit: function () {
                        if (!settingValues && generatorInput.value !== 'Custom') {
                            generatorInput.value = 'Custom';
                        }
                    }
                }
            });
            if (matrix) {
                // matrix is [[a,b],[c,d]]
                const val = (key === 'a' ? matrix[0][0] :
                    key === 'b' ? matrix[0][1] :
                        key === 'c' ? matrix[1][0] : matrix[1][1]);
                fields[key].latex(val.toString());
            } else {
                // Default identity? or zeros
                fields[key].latex(key === 'a' || key === 'd' ? '1' : '0');
            }
        });

        const genObj = { id: genId, fields: fields, el: block };
        activeGenerators.push(genObj);

        // Remove Handler
        block.querySelector('button').addEventListener('click', () => {
            if (activeGenerators.length <= 1) {
                alert("At least one generator is required.");
                return;
            }
            matrixContainer.removeChild(block);
            activeGenerators = activeGenerators.filter(g => g.id !== genId);
            updateLabels();
            if (generatorInput.value !== 'Custom') {
                generatorInput.value = 'Custom';
            }
        });
    }

    function updateLabels() {
        activeGenerators.forEach((g, idx) => {
            g.el.querySelector('label').innerHTML = `g<sub>${idx + 1}</sub>`;
        });
    }

    let settingValues = false;
    function renderGenerators(matrices) {
        settingValues = true;
        matrixContainer.innerHTML = '';
        activeGenerators = [];
        genCounter = 0;

        matrices.forEach(mat => {
            addGeneratorBlock(mat);
        });
        settingValues = false;
    }

    addGenBtn.addEventListener('click', () => {
        addGeneratorBlock(); // Adds default Identity
        if (generatorInput.value !== 'Custom') {
            generatorInput.value = 'Custom';
        }
    });

    const presets = {
        'Z1/2': [
            [[4, -4], [0, 1]],
            [[3, 4], [2, 3]]
        ],
        'Modular': [
            [[0, -1], [1, 0]],
            [[1, 1], [0, 1]]
        ],
        'Triangle': [
            [[0, -1], [1, 0]],
            [[2, 0], [0, 1]],
            [[1, 2], [2, 5]]
        ]
    };

    // Initial Load
    renderGenerators(presets['Z1/2']);

    generatorInput.addEventListener('change', () => {
        const val = generatorInput.value;
        if (presets[val]) {
            renderGenerators(presets[val]);
        }
    });

    function getCustomGeneratorsData() {
        return activeGenerators.map((g, idx) => {
            try {
                return {
                    name: `g${idx + 1}`,
                    a: parseInt(g.fields['a'].text()),
                    b: parseInt(g.fields['b'].text()),
                    c: parseInt(g.fields['c'].text()),
                    d: parseInt(g.fields['d'].text())
                };
            } catch (e) {
                throw new Error("Invalid matrix values");
            }
        });
    }

    runBtn.addEventListener('click', async () => {
        // UI Loading State
        runBtn.disabled = true;
        stopBtn.classList.remove('hidden'); // Show stop button
        loader.classList.remove('hidden');
        btnText.textContent = 'Running...';
        resultsSection.classList.add('hidden');
        matchSection.classList.add('hidden');

        // Reset controller
        if (abortController) {
            abortController.abort();
        }
        abortController = new AbortController();

        try {
            const data = {
                generator: generatorInput.value,
                H: parseInt(hInput.value),
                depth: parseInt(depthInput.value),
                height_cap_factor: parseInt(heightCapFactorInput.value),
                max_nodes: parseInt(maxNodesInput.value)
            };

            if (generatorInput.value === 'Custom') {
                data.custom_generators = getCustomGeneratorsData();
            }

            const response = await fetch('/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data),
                signal: abortController.signal
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                updateResults(result);
            } else {
                alert('Error: ' + (result.message || 'Unknown error occurred'));
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Simulation stopped by user');
            } else {
                console.error('Error:', error);
                // alert('Failed to connect to the server.');
            }
        } finally {
            // Restore UI State
            runBtn.disabled = false;
            stopBtn.classList.add('hidden'); // Hide stop button
            loader.classList.add('hidden');
            btnText.textContent = 'Run Simulation';
            abortController = null;
        }
    });

    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
        }
    });

    function updateResults(result) {
        repsCount.textContent = result.reps.length;
        hitCap.textContent = result.hit_node_cap ? 'Yes' : 'No';
        stopReason.textContent = result.stopped_reason || 'Finished';

        // Update badge
        if (result.stopped_reason && result.stopped_reason !== 'max_reps') {
            // Maybe different badge for early stop
        }

        // Clear and populate reps list
        repsList.innerHTML = '';
        currentReps = result.reps; // Store reps
        result.reps.forEach(repStr => {
            const li = document.createElement('li');
            li.className = 'rep-item';
            li.textContent = repStr;
            li.style.cursor = 'pointer'; // Make it clickable
            li.onclick = () => {
                rationalInput.value = repStr;
                matchBtn.click();
            };
            repsList.appendChild(li);
        });

        resultsSection.classList.remove('hidden');
        matchSection.classList.remove('hidden'); // Show match section
        resultsSection.scrollIntoView({ behavior: 'smooth' });

        drawViz(); // Draw initial reps
    }

    matchBtn.addEventListener('click', async () => {
        const rational = rationalInput.value;
        if (!rational) return;

        matchBtn.disabled = true;
        matchBtn.textContent = 'Searching...';
        matchResult.classList.add('hidden');
        currentPath = null;

        try {
            const data = {
                rational: rational,
                reps: currentReps,
                generator: generatorInput.value,
                depth: parseInt(matchDepthInput.value),
                height_cap: parseInt(matchHeightCapInput.value),
                max_nodes: parseInt(maxNodesInput.value),
                beam_width: parseInt(matchBeamWidthInput.value)
            };

            if (generatorInput.value === 'Custom') {
                data.custom_generators = getCustomGeneratorsData();
            }

            const response = await fetch('/match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.status === 'success') {
                matchTarget.textContent = result.target;
                renderPath(result.path);
                currentPath = result.path;
                matchResult.classList.remove('hidden');

                // Check for redundancy
                if (result.path.length > 0) {
                    const startStr = result.path[0].start;
                    const endStr = result.path[result.path.length - 1].end;

                    // If we started at a rep and ended at a different (simpler) rep, mark start as redundant
                    if (startStr !== endStr) {
                        // Find in list
                        Array.from(repsList.children).forEach(el => {
                            if (el.textContent === startStr) {
                                el.classList.add('redundant-rep');
                            }
                        });
                    }
                }

            } else if (result.status === 'not_found') {
                alert('No path found to any representative within limits.');
            } else {
                alert('Error: ' + result.message);
            }
        } catch (e) {
            console.error(e);
            alert('Error connecting to server.');
        } finally {
            matchBtn.disabled = false;
            matchBtn.textContent = 'Match';
            drawViz();
        }
    });

    function renderPath(path) {
        pathSteps.innerHTML = '';
        if (path.length === 0) {
            pathSteps.textContent = 'Already a representative!';
            return;
        }

        path.forEach((step, index) => {
            const nodeSpan = document.createElement('span');
            nodeSpan.className = 'step-node';
            nodeSpan.textContent = step.start;

            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'step-arrow';
            arrowSpan.textContent = ` → ${step.move} → `;

            pathSteps.appendChild(nodeSpan);
            pathSteps.appendChild(arrowSpan);

            if (index === path.length - 1) {
                const finalSpan = document.createElement('span');
                finalSpan.className = 'step-node';
                finalSpan.textContent = step.end;
                pathSteps.appendChild(finalSpan);
            }
        });
    }

    // Visualization Logic
    function parseToFloat(s) {
        if (s === '∞' || s.toLowerCase() === 'inf' || s.toLowerCase() === 'infinity') return Infinity;
        if (s.includes('/')) {
            const [p, q] = s.split('/');
            return parseInt(p) / parseInt(q);
        }
        return parseFloat(s);
    }

    function mapX(val, width) {
        const padding = 40;
        const usefulWidth = width - 2 * padding;

        if (val === Infinity || val === -Infinity) {
            return width - padding + 15; // Put infinity slightly off-scale
        }

        // Map (-inf, inf) -> (-pi/2, pi/2) -> (0, usefulWidth)
        const rad = Math.atan(val);
        const norm = (rad + Math.PI / 2) / Math.PI; // 0 to 1
        return padding + norm * usefulWidth;
    }

    function drawViz() {
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;
        const centerY = h * 0.8;

        ctx.clearRect(0, 0, w, h);

        // Draw Line
        ctx.beginPath();
        ctx.strokeStyle = '#475569'; // slate-600
        ctx.lineWidth = 2;
        ctx.moveTo(20, centerY);
        ctx.lineTo(w - 20, centerY);
        ctx.stroke();

        // Draw Ticks for integers -2, -1, 0, 1, 2
        ctx.fillStyle = '#64748b';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        [-2, -1, 0, 1, 2].forEach(i => {
            const x = mapX(i, w);
            ctx.beginPath();
            ctx.moveTo(x, centerY - 5);
            ctx.lineTo(x, centerY + 5);
            ctx.stroke();
            ctx.fillText(i.toString(), x, centerY + 20);
        });
        // Infinity tick
        const infX = mapX(Infinity, w);
        ctx.fillText('∞', infX, centerY + 20);

        // Draw Reps
        currentReps.forEach(repStr => {
            const val = parseToFloat(repStr);
            const x = mapX(val, w);

            ctx.beginPath();
            ctx.fillStyle = '#10b981'; // Green (secondary color)
            ctx.arc(x, centerY, 5, 0, 2 * Math.PI);
            ctx.fill();
        });

        // Draw Path if exists
        if (currentPath && currentPath.length > 0) {
            let currX = mapX(parseToFloat(currentPath[0].start), w);

            // Draw Start Point
            ctx.beginPath();
            ctx.fillStyle = '#f472b6'; // Accent Pink
            ctx.arc(currX, centerY, 6, 0, 2 * Math.PI);
            ctx.fill();
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#f472b6';
            ctx.fillText('Start', currX, centerY + 25);

            ctx.lineWidth = 2;

            currentPath.forEach((step, i) => {
                const nextVal = parseToFloat(step.end);
                const nextX = mapX(nextVal, w);

                // Determine arc geometry
                const minX = Math.min(currX, nextX);
                const maxX = Math.max(currX, nextX);
                const midX = (minX + maxX) / 2;
                const radius = (maxX - minX) / 2;

                // Draw Semicircle (Geodesic)
                ctx.beginPath();
                ctx.strokeStyle = `hsla(${250 + i * 20}, 70%, 60%, 0.8)`;

                // Arc from minX to maxX (Upper half)
                // Angles: Math.PI to 0, counter-clockwise = true?
                // 0 is East, PI is West.
                // Counter-clockwise from 0 (East) to PI (West) goes UP.
                // context.arc(x, y, r, sAngle, eAngle, counterclockwise)
                ctx.arc(midX, centerY, radius, 0, Math.PI, true);
                ctx.stroke();

                // Draw Arrowhead at apex
                const apexX = midX;
                const apexY = centerY - radius;
                const arrowSize = 6;
                const movingRight = nextX > currX;

                ctx.beginPath();
                ctx.fillStyle = `hsla(${250 + i * 20}, 70%, 60%, 1)`;
                if (movingRight) {
                    // Arrow pointing right >
                    ctx.moveTo(apexX - arrowSize, apexY - arrowSize);
                    ctx.lineTo(apexX + arrowSize, apexY);
                    ctx.lineTo(apexX - arrowSize, apexY + arrowSize);
                } else {
                    // Arrow pointing left <
                    ctx.moveTo(apexX + arrowSize, apexY - arrowSize);
                    ctx.lineTo(apexX - arrowSize, apexY);
                    ctx.lineTo(apexX + arrowSize, apexY + arrowSize);
                }
                ctx.fill();

                // Draw Label above apex
                ctx.fillStyle = '#cbd5e1';
                ctx.textAlign = 'center';
                // Add some clearance for label
                ctx.fillText(step.move, apexX, apexY - 10);

                currX = nextX;
            });

            // Draw Target Point highlight
            ctx.beginPath();
            ctx.strokeStyle = '#f472b6';
            ctx.lineWidth = 3;
            ctx.arc(currX, centerY, 8, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }
});
