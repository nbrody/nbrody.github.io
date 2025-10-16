// Global variables
let gl;
let program;
let resolutionLocation;
let timeLocation;
let mouseLocation;
let sphereLocation;

// The spheres are defined by a vec4: (center.x, center.y, center.z, radius)
// These four spheres are arranged in a tetrahedral formation.
const spheres = [
    1.0, 1.0, 1.0, 0.8,
    -1.0, -1.0, 1.0, 0.8,
    -1.0, 1.0, -1.0, 0.8,
    1.0, -1.0, -1.0, 0.8
];

// Mouse control variables
let mouse = { x: 0.5, y: 0.5 };
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let rotationX = 1.5;
let rotationY = 0.5;

async function main() {
    const canvas = document.getElementById('glcanvas');
    gl = canvas.getContext('webgl');
    if (!gl) {
        alert('WebGL not supported!');
        return;
    }

    const vsSource = `
        attribute vec4 aVertexPosition;
        void main() {
            gl_Position = aVertexPosition;
        }
    `;

    // Fetch and compile the fragment shader
    const fsSource = await fetch('shader.glsl').then(res => res.text());

    const shaderProgram = initShaderProgram(vsSource, fsSource);
    program = shaderProgram;

    // Get uniform locations
    resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    timeLocation = gl.getUniformLocation(program, 'u_time');
    mouseLocation = gl.getUniformLocation(program, 'u_mouse');
    sphereLocation = gl.getUniformLocation(program, 'u_spheres');

    // Setup a simple quad to draw the shader on
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, 1, 1, 1, -1, -1, 1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    const positionAttributeLocation = gl.getAttribLocation(program, 'aVertexPosition');
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    // Add mouse event listeners
    canvas.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });
    document.addEventListener('mouseup', () => { isMouseDown = false; });
    document.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        rotationY += deltaX * 0.005;
        rotationX += deltaY * 0.005;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    // Start the render loop
    requestAnimationFrame(render);
}

function render(time) {
    time *= 0.001; // convert to seconds

    resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(timeLocation, time);
    gl.uniform2f(mouseLocation, rotationY, rotationX);

    // Pass the sphere data to the shader
    gl.uniform4fv(sphereLocation, spheres);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    requestAnimationFrame(render);
}


// --- WebGL Helper Functions ---

function initShaderProgram(vsSource, fsSource) {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}

function loadShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function resizeCanvasToDisplaySize(canvas) {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        return true;
    }
    return false;
}

main();