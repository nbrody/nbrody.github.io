// Global State
let gl;
let program;
let canvas;
let circles = [];
let pan = { x: 0, y: 0 };
let zoom = 2.5;
let isDragging = false;
let interactionMode = 'none'; // 'move', 'resize', 'pan'
let draggedCircleIndex = -1;
let isPanning = false;
let lastMouse = { x: 0, y: 0 };
let colorScheme = 0; // Now represents Palette
let coloringMode = 0; // 0: Depth, 1: Generator, 2: Parity, 3: Electric
let isHighRes = false;
let isWandering = false;
let isAnimating = false;
let animSpeed = 0.5;
let wanderVectors = []; // Velocity vectors for wandering circles

// Uniform Locations
let u_resolution, u_time, u_pan, u_zoom, u_circles, u_circleCount, u_colorScheme, u_coloringMode;

// Presets
const PRESETS = {
    kissing: [
        { x: 1.0, y: 1.0, r: 1.0 },
        { x: -1.0, y: 1.0, r: 1.0 },
        { x: -1.0, y: -1.0, r: 1.0 },
        { x: 1.0, y: -1.0, r: 1.0 }
    ],
    classical: [
        { x: 1.5, y: 1.5, r: 0.8 },
        { x: -1.5, y: 1.5, r: 0.8 },
        { x: -1.5, y: -1.5, r: 0.8 },
        { x: 1.5, y: -1.5, r: 0.8 }
    ],
    spiral: [
        { x: 0.8, y: 0.0, r: 0.4 },
        { x: -0.8, y: 0.0, r: 0.4 },
        { x: 0.0, y: 1.2, r: 0.3 },
        { x: 0.0, y: -1.2, r: 0.3 },
        { x: 2.0, y: 0.0, r: 0.2 },
        { x: -2.0, y: 0.0, r: 0.2 }
    ],
    chain: [
        { x: 2.0, y: 0.0, r: 0.9 },
        { x: 1.0, y: 1.732, r: 0.9 },
        { x: -1.0, y: 1.732, r: 0.9 },
        { x: -2.0, y: 0.0, r: 0.9 },
        { x: -1.0, y: -1.732, r: 0.9 },
        { x: 1.0, y: -1.732, r: 0.9 }
    ],
    orthogonal: [ // Intersect at pi/2
        { x: 1.0, y: 0.0, r: 1.0 },
        { x: -1.0, y: 0.0, r: 1.0 },
        { x: 0.0, y: 1.0, r: 1.0 },
        { x: 0.0, y: -1.0, r: 1.0 }
    ],
    maskit: [ // Intersect at pi/3 (d = r*sqrt(3))
        { x: 0.866, y: 0.0, r: 1.0 },
        { x: -0.866, y: 0.0, r: 1.0 },
        { x: 0.0, y: 1.5, r: 0.5 }, // Disjoint pair
        { x: 0.0, y: -1.5, r: 0.5 }
    ],
    random: [] // Generated on load
};

function generateRandomCircles() {
    const arr = [];
    const count = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
        arr.push({
            x: (Math.random() - 0.5) * 4,
            y: (Math.random() - 0.5) * 4,
            r: 0.2 + Math.random() * 0.6
        });
    }
    return arr;
}

async function init() {
    canvas = document.getElementById('glcanvas');
    gl = canvas.getContext('webgl2');
    if (!gl) {
        alert('WebGL 2 not supported');
        return;
    }

    // Setup UI
    setupUI();

    // Load Shader
    const vsSource = `#version 300 es
        in vec4 aVertexPosition;
        void main() {
            gl_Position = aVertexPosition;
        }
    `;
    let fsSource;
    try {
        fsSource = await fetch('shader.glsl').then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.text();
        });
    } catch (e) {
        alert("Failed to load shader. If you are opening this file directly, please use a local web server (e.g., 'python3 -m http.server') due to CORS restrictions.");
        console.error(e);
        return;
    }

    program = createProgram(gl, vsSource, fsSource);
    if (!program) return;

    // Get Locations
    u_resolution = gl.getUniformLocation(program, 'u_resolution');
    u_time = gl.getUniformLocation(program, 'u_time');
    u_pan = gl.getUniformLocation(program, 'u_pan');
    u_zoom = gl.getUniformLocation(program, 'u_zoom');
    u_circles = gl.getUniformLocation(program, 'u_circles');
    u_circleCount = gl.getUniformLocation(program, 'u_circleCount');
    u_colorScheme = gl.getUniformLocation(program, 'u_colorScheme');
    u_coloringMode = gl.getUniformLocation(program, 'u_coloringMode');

    // Setup Quad
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'aVertexPosition');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Initial State
    loadPreset('kissing');

    // Events
    setupEvents();

    // Loop
    requestAnimationFrame(render);
}

function setupUI() {
    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    document.getElementById('preset-select').addEventListener('change', (e) => {
        if (e.target.value === 'random') {
            circles = generateRandomCircles();
        } else {
            loadPreset(e.target.value);
        }
        initWanderVectors();
    });

    // Custom Palette Dropdown
    const paletteSelect = document.getElementById('palette-custom-select');
    const selectedOption = paletteSelect.querySelector('.selected-option');
    const optionsList = paletteSelect.querySelector('.options-list');
    const options = paletteSelect.querySelectorAll('.option');

    selectedOption.addEventListener('click', () => {
        optionsList.classList.toggle('open');
    });

    options.forEach(option => {
        option.addEventListener('click', (e) => {
            const value = option.dataset.value;
            colorScheme = parseInt(value);

            // Update selected option display
            selectedOption.innerHTML = option.innerHTML;
            selectedOption.dataset.value = value;

            // Update selected state
            options.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');

            // Close dropdown
            optionsList.classList.remove('open');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!paletteSelect.contains(e.target)) {
            optionsList.classList.remove('open');
        }
    });

    document.getElementById('coloring-mode-select').addEventListener('change', (e) => {
        coloringMode = parseInt(e.target.value);
    });

    document.getElementById('wander-checkbox').addEventListener('change', (e) => {
        isWandering = e.target.checked;
        if (isWandering && wanderVectors.length !== circles.length) {
            initWanderVectors();
        }
    });

    document.getElementById('animate-checkbox').addEventListener('change', (e) => {
        isAnimating = e.target.checked;
    });

    document.getElementById('anim-speed-slider').addEventListener('input', (e) => {
        animSpeed = parseInt(e.target.value) / 100.0;
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        pan = { x: 0, y: 0 };
        zoom = 2.5;
    });

    document.getElementById('hires-checkbox').addEventListener('change', (e) => {
        isHighRes = e.target.checked;
    });

    document.getElementById('add-circle-btn').addEventListener('click', () => {
        if (circles.length >= 10) {
            alert("Maximum of 10 circles reached.");
            return;
        }
        circles.push({
            x: pan.x,
            y: pan.y,
            r: 0.5 * zoom / 2.5
        });
        initWanderVectors();
    });
}



function initWanderVectors() {
    wanderVectors = circles.map(() => ({
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002
    }));
}

function loadPreset(name) {
    // Deep copy to avoid modifying the preset
    circles = JSON.parse(JSON.stringify(PRESETS[name]));
    initWanderVectors();
}

function setupEvents() {
    canvas.addEventListener('mousedown', e => {
        const mouse = getMouseWorldPos(e);
        const pixelSize = zoom / canvas.height;
        const threshold = 15 * pixelSize; // 15px threshold

        // Check if clicked on a circle
        let clickedCircle = -1;
        let minDist = 1000;
        let mode = 'none';

        // Check in reverse order (topmost first)
        for (let i = 0; i < circles.length; i++) {
            const c = circles[i];
            const dx = mouse.x - c.x;
            const dy = mouse.y - c.y;
            const d = Math.sqrt(dx * dx + dy * dy);

            // Check edge first
            if (Math.abs(d - c.r) < threshold) {
                clickedCircle = i;
                mode = 'resize';
                break; // Edge priority
            }
            // Check interior
            else if (d < c.r) {
                if (d < minDist) {
                    minDist = d;
                    clickedCircle = i;
                    mode = 'move';
                }
            }
        }

        if (clickedCircle !== -1) {
            isDragging = true;
            draggedCircleIndex = clickedCircle;
            interactionMode = mode;
        } else {
            isPanning = true;
            interactionMode = 'pan';
        }

        lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', e => {
        const mouse = getMouseWorldPos(e);

        // Update cursor style
        if (!isDragging) {
            const pixelSize = zoom / canvas.height;
            const threshold = 15 * pixelSize;
            let cursor = 'default';

            for (let c of circles) {
                const dx = mouse.x - c.x;
                const dy = mouse.y - c.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (Math.abs(d - c.r) < threshold) {
                    cursor = 'nwse-resize';
                    break;
                } else if (d < c.r) {
                    cursor = 'move';
                }
            }
            canvas.style.cursor = cursor;
        }

        if (isDragging && draggedCircleIndex !== -1) {
            if (interactionMode === 'move') {
                circles[draggedCircleIndex].x = mouse.x;
                circles[draggedCircleIndex].y = mouse.y;
            } else if (interactionMode === 'resize') {
                const c = circles[draggedCircleIndex];
                const dx = mouse.x - c.x;
                const dy = mouse.y - c.y;
                c.r = Math.sqrt(dx * dx + dy * dy);
            }
        } else if (isPanning) {
            const dx = (e.clientX - lastMouse.x) / canvas.height * zoom;
            const dy = (e.clientY - lastMouse.y) / canvas.height * zoom;
            pan.x += dx;
            pan.y -= dy;
        }

        lastMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        isPanning = false;
        draggedCircleIndex = -1;
        interactionMode = 'none';
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        // Always zoom
        const factor = Math.exp(e.deltaY * 0.001);
        zoom *= factor;
    }, { passive: false });
}

function getMouseWorldPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1.0 - (e.clientY - rect.top) / rect.height; // Flip Y for GL

    // Convert to NDC [-1, 1]
    const ndcX = x * 2 - 1;
    const ndcY = y * 2 - 1;

    // Aspect ratio correction
    const aspect = canvas.width / canvas.height;

    // Map to world space: uv * zoom - pan
    // In shader: vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / u_resolution.y;
    // So uv.x goes from -aspect/2 to aspect/2

    const worldX = (ndcX * aspect * 0.5) * zoom - pan.x; // Wait, check shader logic
    const worldY = (ndcY * 0.5) * zoom - pan.y;

    // Shader: vec2 z = uv * u_zoom - u_pan;
    // uv = (coord - res/2) / res.y
    // coord.x in [0, w], coord.y in [0, h]
    // uv.x in [-w/2h, w/2h] = [-aspect/2, aspect/2]
    // uv.y in [-0.5, 0.5]

    // So my manual calc:
    const uvX = (e.clientX - rect.width / 2) / rect.height;
    const uvY = -(e.clientY - rect.height / 2) / rect.height; // Screen Y is down, world Y is up

    return {
        x: uvX * zoom - pan.x,
        y: uvY * zoom - pan.y
    };
}

function render(time) {
    time *= 0.001;

    // Update Wander
    if (isWandering && !isDragging) {
        for (let i = 0; i < circles.length; i++) {
            const c = circles[i];
            const v = wanderVectors[i];

            c.x += v.vx * animSpeed * 50.0; // Scale speed
            c.y += v.vy * animSpeed * 50.0;

            // Bounce off a virtual box to keep them in view
            if (c.x > 4 || c.x < -4) v.vx *= -1;
            if (c.y > 4 || c.y < -4) v.vy *= -1;
        }
    }

    // Animation Time
    // If animating, we pass real time. If not, we pass a fixed time or paused time.
    // But shader uses u_time for rainbow etc. Let's just pass time but modulate speed if needed.
    // Actually, the user wants an animation button.
    // Let's use a separate uniform for "animation phase" if we want to stop/start colors.
    // For now, we'll just let u_time run but maybe scale it?
    // The user asked for "Animation button... slider to adjust speed".
    // Let's assume this controls color cycling speed.

    const effectiveTime = isAnimating ? time * animSpeed * 5.0 : 0.0;

    // Resize
    const pixelRatio = isHighRes ? Math.max(2, window.devicePixelRatio * 1.5) : window.devicePixelRatio;
    const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    gl.useProgram(program);

    // Uniforms
    gl.uniform2f(u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u_time, effectiveTime);
    gl.uniform2f(u_pan, pan.x, pan.y);
    gl.uniform1f(u_zoom, zoom);
    gl.uniform1i(u_circleCount, circles.length);
    gl.uniform1i(u_colorScheme, colorScheme);
    gl.uniform1i(u_coloringMode, coloringMode);

    // Flatten circles array
    const circleData = [];
    for (let c of circles) {
        circleData.push(c.x, c.y, c.r);
    }
    // Pad if necessary (though uniform3fv handles it)
    gl.uniform3fv(u_circles, new Float32Array(circleData));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
}

function createProgram(gl, vs, fs) {
    const p = gl.createProgram();
    const v = createShader(gl, gl.VERTEX_SHADER, vs);
    const f = createShader(gl, gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function createShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
    }
    return s;
}

init();