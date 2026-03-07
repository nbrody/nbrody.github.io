const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2', { antialias: false, depth: false });

if (!gl) {
    alert("WebGL 2 not supported by your browser!");
}

// Extensions for fluid solver
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float'); // Added for some browser fallbacks
gl.getExtension('OES_texture_float_linear');
gl.getExtension('OES_texture_half_float_linear'); // Crucial for HALF_FLOAT interpolation

// Get references to UI controls
const controls = {
    viscosity: document.getElementById('viscosity'),
    vorticity: document.getElementById('vorticity'),
    buoyancy: document.getElementById('buoyancy'),
    cooling: document.getElementById('cooling'),
    bloom: document.getElementById('bloom'),
    resetBtn: document.getElementById('reset-btn')
};

const TEX_RES_DIVISOR = 2; // e.g. 2 means half screen resolution for FBOs

let pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false, down: false };

function resizeCanvas() {
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        initFBOs();
    }
}
window.addEventListener('resize', resizeCanvas);

// Compiling shaders
function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

const baseVertex = compileShader(gl.VERTEX_SHADER, shaders.baseVertex);

function createProgram(fragmentSource) {
    const fShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, baseVertex);
    gl.attachShader(prog, fShader);
    gl.linkProgram(prog);
    return prog;
}

// Shader programs
const progs = {
    clear: createProgram(shaders.clear),
    splat: createProgram(shaders.splat),
    advection: createProgram(shaders.advection),
    divergence: createProgram(shaders.divergence),
    curl: createProgram(shaders.curl),
    vorticity: createProgram(shaders.vorticity),
    pressure: createProgram(shaders.pressure),
    gradSubtract: createProgram(shaders.gradientSubtract),
    buoyancy: createProgram(shaders.buoyancy),
    display: createProgram(shaders.display)
};

function getUniforms(prog) {
    const unifs = {};
    const count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(prog, i);
        unifs[info.name] = gl.getUniformLocation(prog, info.name);
    }
    return unifs;
}

const unifs = {
    clear: getUniforms(progs.clear),
    splat: getUniforms(progs.splat),
    advection: getUniforms(progs.advection),
    divergence: getUniforms(progs.divergence),
    curl: getUniforms(progs.curl),
    vorticity: getUniforms(progs.vorticity),
    pressure: getUniforms(progs.pressure),
    gradSubtract: getUniforms(progs.gradSubtract),
    buoyancy: getUniforms(progs.buoyancy),
    display: getUniforms(progs.display)
};

function createTexture() {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

function createFBO(w, h, internalFormat, format, type) {
    const tex = createTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { tex, fbo, w, h };
}

function createDoubleFBO(w, h, internalFormat, format, type) {
    return {
        read: createFBO(w, h, internalFormat, format, type),
        write: createFBO(w, h, internalFormat, format, type),
        swap: function () {
            const temp = this.read;
            this.read = this.write;
            this.write = temp;
        }
    };
}

let fboVelocity, fboDensity, fboPressure, fboDivergence, fboCurl;

function initFBOs() {
    const w = Math.floor(window.innerWidth / TEX_RES_DIVISOR);
    const h = Math.floor(window.innerHeight / TEX_RES_DIVISOR);

    // Format: RGBA16F
    const internalF = gl.RGBA16F;
    const format = gl.RGBA;
    const type = gl.HALF_FLOAT;

    // Only recreate if unallocated or size changed significantly
    if (!fboVelocity || fboVelocity.read.w !== w || fboVelocity.read.h !== h) {
        fboVelocity = createDoubleFBO(w, h, internalF, format, type);
        fboDensity = createDoubleFBO(w, h, internalF, format, type);
        fboPressure = createDoubleFBO(w, h, internalF, format, type);
        fboDivergence = createFBO(w, h, internalF, format, type);
        fboCurl = createFBO(w, h, internalF, format, type);
    }
}

// Fullscreen quad
const quadBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1
]), gl.STATIC_DRAW);

function bindQuad(prog) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posLoc = gl.getAttribLocation(prog, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
}

function blit(targetFBO) {
    if (targetFBO == null) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
        gl.viewport(0, 0, targetFBO.w, targetFBO.h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.fbo);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Core Loop Steps
function splat(target, x, y, dx, dy, color, radius) {
    bindQuad(progs.splat);
    gl.uniform1i(unifs.splat.uTarget, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.read.tex);

    gl.uniform1f(unifs.splat.uAspectRatio, canvas.width / canvas.height);
    gl.uniform2f(unifs.splat.uPoint, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3fv(unifs.splat.uColor, color);
    gl.uniform1f(unifs.splat.uRadius, radius / 100.0);

    blit(target.write);
    target.swap();
}

function advect(target, velocityInfo, dissipation) {
    bindQuad(progs.advection);
    gl.uniform1i(unifs.advection.uVelocity, 0);
    gl.uniform1i(unifs.advection.uSource, 1);
    gl.uniform2f(unifs.advection.texelSize, 1.0 / target.read.w, 1.0 / target.read.h);
    const dt = 0.016;
    gl.uniform1f(unifs.advection.dt, dt);
    gl.uniform1f(unifs.advection.dissipation, dissipation);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocityInfo.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, target.read.tex);

    blit(target.write);
    target.swap();
}

function applyBuoyancy() {
    bindQuad(progs.buoyancy);
    gl.uniform1i(unifs.buoyancy.uVelocity, 0);
    gl.uniform1i(unifs.buoyancy.uDensity, 1);
    gl.uniform1f(unifs.buoyancy.buoyancyAmount, parseFloat(controls.buoyancy.value));
    gl.uniform1f(unifs.buoyancy.dt, 0.016);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboVelocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboDensity.read.tex);

    blit(fboVelocity.write);
    fboVelocity.swap();
}

function computeCurl() {
    bindQuad(progs.curl);
    gl.uniform1i(unifs.curl.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboVelocity.read.tex);
    blit(fboCurl);
}

function computeVorticity() {
    bindQuad(progs.vorticity);
    gl.uniform1i(unifs.vorticity.uVelocity, 0);
    gl.uniform1i(unifs.vorticity.uCurl, 1);
    gl.uniform1f(unifs.vorticity.curlAmount, parseFloat(controls.vorticity.value));
    gl.uniform1f(unifs.vorticity.dt, 0.016);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboVelocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboCurl.tex);

    blit(fboVelocity.write);
    fboVelocity.swap();
}

function computeDivergence() {
    bindQuad(progs.divergence);
    gl.uniform1i(unifs.divergence.uVelocity, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboVelocity.read.tex);
    blit(fboDivergence);
}

function clearPressure() {
    bindQuad(progs.clear);
    gl.uniform1i(unifs.clear.uTexture, 0);
    gl.uniform1f(unifs.clear.uValue, 0.8);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboPressure.read.tex);
    blit(fboPressure.write);
    fboPressure.swap();
}

function solvePressure() {
    bindQuad(progs.pressure);
    gl.uniform1i(unifs.pressure.uPressure, 0);
    gl.uniform1i(unifs.pressure.uDivergence, 1);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboDivergence.tex);

    // Jacobi iterations
    for (let i = 0; i < 20; i++) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboPressure.read.tex);
        blit(fboPressure.write);
        fboPressure.swap();
    }
}

function subtractGradient() {
    bindQuad(progs.gradSubtract);
    gl.uniform1i(unifs.gradSubtract.uPressure, 0);
    gl.uniform1i(unifs.gradSubtract.uVelocity, 1);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboPressure.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboVelocity.read.tex);

    blit(fboVelocity.write);
    fboVelocity.swap();
}

function render() {
    bindQuad(progs.display);
    gl.uniform1i(unifs.display.uTexture, 0);
    gl.uniform1i(unifs.display.hasBloom, controls.bloom.checked ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboDensity.read.tex);

    blit(null); // Render to screen
}

// User Interaction
function interact() {
    if (!pointer.moved && !pointer.down && window.timeRunning > 60) return;

    let splatColor = [0.0, 0.0, 0.0];
    let vSplat = [0.0, 0.0, 0.0];

    // Mouse drag input
    if (pointer.down) {
        // High density/temp
        splatColor = [0.8, 1.0, 0.0];
        let pdx = pointer.dx * 5.0;
        let pdy = pointer.dy * 5.0;
        vSplat = [pdx, -pdy, 0.0]; // Y invert for WebGL
        splat(fboDensity, pointer.x, pointer.y, pointer.dx, pointer.dy, splatColor, 0.15); // larger area
        splat(fboVelocity, pointer.x, pointer.y, pointer.dx, pointer.dy, vSplat, 0.05); // tighter velocity
    }

    // Passive center source
    let sourceX = canvas.width / 2;
    let sourceY = canvas.height - 40;

    // Add pulsing base fire source
    splatColor = [0.5, 1.2 + Math.sin(Date.now() * 0.01) * 0.3, 0.0];
    vSplat = [(Math.random() - 0.5) * 2.0, 8.0 * (Math.random() + 0.5), 0.0]; // Always blowing up a bit

    splat(fboDensity, sourceX, sourceY, 0, 0, splatColor, 0.02);
    splat(fboVelocity, sourceX, sourceY, 0, 0, vSplat, 0.02);

    pointer.dx = 0;
    pointer.dy = 0;
    pointer.moved = false;
}

// Main Frame Loop
function step() {
    resizeCanvas(); // checks resize implicitly fast path
    interact();

    advect(fboVelocity, fboVelocity, 1.0 - parseFloat(controls.viscosity.value) * 0.01);
    advect(fboDensity, fboVelocity, parseFloat(controls.cooling.value));

    applyBuoyancy();
    computeCurl();
    computeVorticity();
    computeDivergence();
    clearPressure();
    solvePressure();
    subtractGradient();

    render();

    window.timeRunning++;
    requestAnimationFrame(step);
}

// Events
canvas.addEventListener('mousedown', e => {
    pointer.down = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
});
canvas.addEventListener('mousemove', e => {
    if (pointer.down) {
        pointer.dx = e.clientX - pointer.x;
        pointer.dy = e.clientY - pointer.y;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.moved = true;
    }
});
canvas.addEventListener('mouseup', () => pointer.down = false);
canvas.addEventListener('touchstart', e => {
    pointer.down = true;
    pointer.x = e.touches[0].clientX;
    pointer.y = e.touches[0].clientY;
});
canvas.addEventListener('touchmove', e => {
    if (pointer.down) {
        pointer.dx = e.touches[0].clientX - pointer.x;
        pointer.dy = e.touches[0].clientY - pointer.y;
        pointer.x = e.touches[0].clientX;
        pointer.y = e.touches[0].clientY;
        pointer.moved = true;
    }
});
canvas.addEventListener('touchend', () => pointer.down = false);

controls.resetBtn.addEventListener('click', () => {
    bindQuad(progs.clear);
    gl.uniform1i(unifs.clear.uTexture, 0);
    gl.uniform1f(unifs.clear.uValue, 0.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboDensity.read.tex);
    blit(fboDensity.write);
    fboDensity.swap();
    blit(fboDensity.write);
    fboDensity.swap();

    gl.bindTexture(gl.TEXTURE_2D, fboVelocity.read.tex);
    blit(fboVelocity.write);
    fboVelocity.swap();
    blit(fboVelocity.write);
    fboVelocity.swap();
});

// Run
window.timeRunning = 0;
initFBOs();
step();
