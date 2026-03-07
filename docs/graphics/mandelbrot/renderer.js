/* ═══════════════════════════════════════════════════════
   Mandelbrot Explorer — GPU-Accelerated WebGL Renderer
   ═══════════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ─────────── Shader Source ───────────

    const VERTEX_SHADER = `
        attribute vec2 aPosition;
        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `;

    const MANDELBROT_FRAGMENT = `
        precision highp float;
        uniform vec2 uResolution;
        uniform vec2 uCenter;
        uniform float uZoom;
        uniform float uMaxIter;
        uniform float uColorOffset;
        uniform float uColorScale;
        uniform float uBailout;
        uniform float uExponent;
        uniform int uColorScheme;
        uniform bool uInterior;
        uniform bool uIsJulia;
        uniform vec2 uJuliaC;

        // ── Color palette functions ──
        vec3 palette_ultraviolet(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 1.0);
            vec3 d = vec3(0.263, 0.416, 0.557);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 palette_magma(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 0.7, 0.4);
            vec3 d = vec3(0.0, 0.15, 0.2);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 palette_ocean(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 0.5);
            vec3 d = vec3(0.80, 0.90, 0.30);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 palette_neon(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(2.0, 1.0, 0.0);
            vec3 d = vec3(0.5, 0.2, 0.25);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 palette_sunset(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(1.0, 1.0, 1.0);
            vec3 d = vec3(0.0, 0.33, 0.67);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 palette_mono(float t) {
            float v = 0.5 + 0.5 * cos(6.28318 * t);
            return vec3(v);
        }

        vec3 palette_psychedelic(float t) {
            vec3 a = vec3(0.5, 0.5, 0.5);
            vec3 b = vec3(0.5, 0.5, 0.5);
            vec3 c = vec3(5.0, 5.0, 5.0);
            vec3 d = vec3(0.0, 0.1, 0.2);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 palette_frozen(float t) {
            vec3 a = vec3(0.6, 0.7, 0.8);
            vec3 b = vec3(0.3, 0.25, 0.2);
            vec3 c = vec3(1.0, 1.0, 1.5);
            vec3 d = vec3(0.5, 0.6, 0.7);
            return a + b * cos(6.28318 * (c * t + d));
        }

        vec3 getColor(float t) {
            if (uColorScheme == 0) return palette_ultraviolet(t);
            if (uColorScheme == 1) return palette_magma(t);
            if (uColorScheme == 2) return palette_ocean(t);
            if (uColorScheme == 3) return palette_neon(t);
            if (uColorScheme == 4) return palette_sunset(t);
            if (uColorScheme == 5) return palette_mono(t);
            if (uColorScheme == 6) return palette_psychedelic(t);
            return palette_frozen(t);
        }

        // Complex power for arbitrary exponent
        vec2 cpow(vec2 z, float n) {
            float r = length(z);
            float theta = atan(z.y, z.x);
            float rn = pow(r, n);
            return vec2(rn * cos(n * theta), rn * sin(n * theta));
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            float aspect = uResolution.x / uResolution.y;

            // Map to complex plane
            vec2 c;
            vec2 z;
            if (uIsJulia) {
                z = (uv - 0.5) * vec2(aspect, 1.0) * uZoom + uCenter;
                c = uJuliaC;
            } else {
                c = (uv - 0.5) * vec2(aspect, 1.0) * uZoom + uCenter;
                z = vec2(0.0);
            }

            // Iteration
            float iter = 0.0;
            float bailoutSq = uBailout * uBailout;
            float zLenSq = 0.0;

            // For interior detection
            vec2 zOld = vec2(0.0);
            float period = 0.0;

            for (float i = 0.0; i < 8192.0; i++) {
                if (i >= uMaxIter) break;

                if (uExponent == 2.0) {
                    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
                } else if (uExponent == 3.0) {
                    float x2 = z.x * z.x;
                    float y2 = z.y * z.y;
                    z = vec2(z.x * x2 - 3.0 * z.x * y2, 3.0 * x2 * z.y - z.y * y2) + c;
                } else {
                    z = cpow(z, uExponent) + c;
                }

                zLenSq = dot(z, z);
                if (zLenSq > bailoutSq) break;

                iter += 1.0;

                // Period checking for interior
                if (uInterior) {
                    if (abs(z.x - zOld.x) < 1e-6 && abs(z.y - zOld.y) < 1e-6) {
                        period = iter;
                        iter = uMaxIter;
                        break;
                    }
                    if (mod(i, 20.0) == 0.0) {
                        zOld = z;
                    }
                }
            }

            vec3 color;
            if (iter >= uMaxIter) {
                // Interior
                if (uInterior && period > 0.0) {
                    float t = mod(period * 0.05, 1.0);
                    color = getColor(t) * 0.3;
                } else {
                    color = vec3(0.0);
                }
            } else {
                // Smooth coloring via renormalization
                float log_zn = log(zLenSq) * 0.5;
                float nu = log(log_zn / log(uBailout)) / log(uExponent);
                float smoothIter = iter + 1.0 - nu;

                float t = smoothIter * uColorScale + uColorOffset;
                color = getColor(t);

                // Boost brightness near boundary
                float closeness = smoothIter / uMaxIter;
                color *= 1.0 + 0.3 * (1.0 - closeness);
            }

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    // ─────────── WebGL Helpers ───────────

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(gl, vsSource, fsSource) {
        const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Program error:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    function setupQuad(gl, program) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    // ─────────── State ───────────

    const state = {
        center: [-0.5, 0.0],
        zoom: 3.5,
        maxIter: 256,
        colorScheme: 0,
        colorOffset: 0,
        colorCycleSpeed: 0,
        colorScale: 1.0,
        bailout: 4,
        exponent: 2,
        showJulia: true,
        showOrbit: false,
        showMinimap: true,
        showCrosshair: false,
        interiorShading: false,
        juliaC: [0, 0],
        mouseComplex: [0, 0],
        isDragging: false,
        lastMouse: [0, 0],
        autoZooming: false,
        autoZoomTarget: null,
        animTime: 0,
    };

    // Famous zoom targets
    const ZOOM_TARGETS = {
        seahorse: { center: [-0.747, 0.1], zoom: 0.005, name: 'Seahorse Valley' },
        elephant: { center: [0.281717921, 0.5771052], zoom: 0.0001, name: 'Elephant Valley' },
        spiral: { center: [-0.7463, 0.1102], zoom: 0.005, name: 'Spiral Galaxy' },
        lightning: { center: [-1.315180982097868, 0.073481649996795], zoom: 0.00001, name: 'Lightning Bolt' },
        minibrot: { center: [-1.768778833, -0.001738996], zoom: 0.0000004, name: 'Deep Minibrot' },
    };

    // ─────────── Initialize WebGL contexts ───────────

    const mandelbrotCanvas = document.getElementById('mandelbrotCanvas');
    const juliaCanvas = document.getElementById('juliaCanvas');
    const orbitCanvas = document.getElementById('orbitCanvas');
    const minimapCanvas = document.getElementById('minimapCanvas');

    const gl = mandelbrotCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    const glJulia = juliaCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    const ctxOrbit = orbitCanvas.getContext('2d');
    const ctxMinimap = minimapCanvas.getContext('2d');

    if (!gl || !glJulia) {
        document.body.innerHTML = '<div style="color:white;text-align:center;padding:40px">WebGL not supported</div>';
        return;
    }

    // Create programs
    const mandelbrotProg = createProgram(gl, VERTEX_SHADER, MANDELBROT_FRAGMENT);
    const juliaProg = createProgram(glJulia, VERTEX_SHADER, MANDELBROT_FRAGMENT);

    if (!mandelbrotProg || !juliaProg) return;

    setupQuad(gl, mandelbrotProg);
    gl.useProgram(mandelbrotProg);

    setupQuad(glJulia, juliaProg);
    glJulia.useProgram(juliaProg);

    // Get uniform locations
    function getUniforms(glCtx, prog) {
        return {
            uResolution: glCtx.getUniformLocation(prog, 'uResolution'),
            uCenter: glCtx.getUniformLocation(prog, 'uCenter'),
            uZoom: glCtx.getUniformLocation(prog, 'uZoom'),
            uMaxIter: glCtx.getUniformLocation(prog, 'uMaxIter'),
            uColorOffset: glCtx.getUniformLocation(prog, 'uColorOffset'),
            uColorScale: glCtx.getUniformLocation(prog, 'uColorScale'),
            uBailout: glCtx.getUniformLocation(prog, 'uBailout'),
            uExponent: glCtx.getUniformLocation(prog, 'uExponent'),
            uColorScheme: glCtx.getUniformLocation(prog, 'uColorScheme'),
            uInterior: glCtx.getUniformLocation(prog, 'uInterior'),
            uIsJulia: glCtx.getUniformLocation(prog, 'uIsJulia'),
            uJuliaC: glCtx.getUniformLocation(prog, 'uJuliaC'),
        };
    }

    const uMandelbrot = getUniforms(gl, mandelbrotProg);
    const uJulia = getUniforms(glJulia, juliaProg);

    // ─────────── Resize ───────────

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;

        mandelbrotCanvas.width = w * dpr;
        mandelbrotCanvas.height = h * dpr;
        mandelbrotCanvas.style.width = w + 'px';
        mandelbrotCanvas.style.height = h + 'px';

        orbitCanvas.width = w * dpr;
        orbitCanvas.height = h * dpr;
        orbitCanvas.style.width = w + 'px';
        orbitCanvas.style.height = h + 'px';

        gl.viewport(0, 0, mandelbrotCanvas.width, mandelbrotCanvas.height);

        // Julia canvas
        const juliaSize = 280;
        const juliaDpr = dpr;
        juliaCanvas.width = juliaSize * juliaDpr;
        juliaCanvas.height = juliaSize * juliaDpr;
        glJulia.viewport(0, 0, juliaCanvas.width, juliaCanvas.height);

        // Minimap canvas
        minimapCanvas.width = 180 * dpr;
        minimapCanvas.height = 140 * dpr;
    }

    resize();
    window.addEventListener('resize', resize);

    // ─────────── Rendering ───────────

    function renderMandelbrot() {
        gl.uniform2f(uMandelbrot.uResolution, mandelbrotCanvas.width, mandelbrotCanvas.height);
        gl.uniform2f(uMandelbrot.uCenter, state.center[0], state.center[1]);
        gl.uniform1f(uMandelbrot.uZoom, state.zoom);
        gl.uniform1f(uMandelbrot.uMaxIter, state.maxIter);
        gl.uniform1f(uMandelbrot.uColorOffset, state.colorOffset);
        gl.uniform1f(uMandelbrot.uColorScale, state.colorScale);
        gl.uniform1f(uMandelbrot.uBailout, state.bailout);
        gl.uniform1f(uMandelbrot.uExponent, state.exponent);
        gl.uniform1i(uMandelbrot.uColorScheme, state.colorScheme);
        gl.uniform1i(uMandelbrot.uInterior, state.interiorShading ? 1 : 0);
        gl.uniform1i(uMandelbrot.uIsJulia, 0);
        gl.uniform2f(uMandelbrot.uJuliaC, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function renderJulia() {
        if (!state.showJulia) return;
        glJulia.uniform2f(uJulia.uResolution, juliaCanvas.width, juliaCanvas.height);
        glJulia.uniform2f(uJulia.uCenter, 0, 0);
        glJulia.uniform1f(uJulia.uZoom, 3.5);
        glJulia.uniform1f(uJulia.uMaxIter, Math.min(state.maxIter, 512));
        glJulia.uniform1f(uJulia.uColorOffset, state.colorOffset);
        glJulia.uniform1f(uJulia.uColorScale, state.colorScale);
        glJulia.uniform1f(uJulia.uBailout, state.bailout);
        glJulia.uniform1f(uJulia.uExponent, state.exponent);
        glJulia.uniform1i(uJulia.uColorScheme, state.colorScheme);
        glJulia.uniform1i(uJulia.uInterior, state.interiorShading ? 1 : 0);
        glJulia.uniform1i(uJulia.uIsJulia, 1);
        glJulia.uniform2f(uJulia.uJuliaC, state.juliaC[0], state.juliaC[1]);
        glJulia.drawArrays(glJulia.TRIANGLES, 0, 6);
    }

    // ─────────── Orbit Rendering (CPU, 2D Canvas Overlay) ───────────

    function renderOrbit() {
        const dpr = window.devicePixelRatio || 1;
        const w = orbitCanvas.width;
        const h = orbitCanvas.height;
        ctxOrbit.clearRect(0, 0, w, h);

        if (!state.showOrbit) return;


        const cx = state.center[0];
        const cy = state.center[1];
        const zoom = state.zoom;

        // Convert complex to screen
        function toScreen(re, im) {
            const canvasAspect = w / h;
            const px = ((re - cx) / (zoom * canvasAspect) + 0.5) * w;
            const py = (0.5 - (im - cy) / zoom) * h;
            return [px / dpr, py / dpr];
        }

        // Compute orbit
        const c = state.mouseComplex;
        let z = [0, 0];
        const points = [[0, 0]];
        const bailoutSq = state.bailout * state.bailout;

        for (let i = 0; i < Math.min(state.maxIter, 500); i++) {
            const zx = z[0] * z[0] - z[1] * z[1] + c[0];
            const zy = 2 * z[0] * z[1] + c[1];
            z = [zx, zy];
            points.push([zx, zy]);
            if (zx * zx + zy * zy > bailoutSq) break;
        }

        // Draw orbit path
        ctxOrbit.save();
        ctxOrbit.scale(dpr, dpr);
        ctxOrbit.lineWidth = 1.5;
        ctxOrbit.strokeStyle = 'rgba(244, 114, 182, 0.6)';
        ctxOrbit.beginPath();
        for (let i = 0; i < points.length; i++) {
            const [sx, sy] = toScreen(points[i][0], points[i][1]);
            if (i === 0) ctxOrbit.moveTo(sx, sy);
            else ctxOrbit.lineTo(sx, sy);
        }
        ctxOrbit.stroke();

        // Draw orbit points
        for (let i = 0; i < points.length; i++) {
            const [sx, sy] = toScreen(points[i][0], points[i][1]);
            const alpha = 1 - i / points.length;
            ctxOrbit.fillStyle = `rgba(192, 132, 252, ${0.3 + 0.7 * alpha})`;
            ctxOrbit.beginPath();
            ctxOrbit.arc(sx, sy, 3, 0, Math.PI * 2);
            ctxOrbit.fill();
        }

        // Draw crosshair at c
        if (state.showCrosshair) {
            const [cx2, cy2] = toScreen(c[0], c[1]);
            ctxOrbit.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctxOrbit.lineWidth = 0.5;
            ctxOrbit.setLineDash([4, 4]);
            ctxOrbit.beginPath();
            ctxOrbit.moveTo(cx2, 0);
            ctxOrbit.lineTo(cx2, h / dpr);
            ctxOrbit.moveTo(0, cy2);
            ctxOrbit.lineTo(w / dpr, cy2);
            ctxOrbit.stroke();
            ctxOrbit.setLineDash([]);
        }

        ctxOrbit.restore();
    }

    // ─────────── Crosshair (without orbit) ───────────

    function renderCrosshair() {
        if (state.showOrbit) return; // orbit renderer handles it
        const dpr = window.devicePixelRatio || 1;
        const w = orbitCanvas.width;
        const h = orbitCanvas.height;

        if (!state.showCrosshair) {
            ctxOrbit.clearRect(0, 0, w, h);
            return;
        }

        ctxOrbit.clearRect(0, 0, w, h);
        ctxOrbit.save();
        ctxOrbit.scale(dpr, dpr);

        const aspect = w / h;
        const c = state.mouseComplex;
        const px = ((c[0] - state.center[0]) / (state.zoom * aspect) + 0.5) * w;
        const py = (0.5 - (c[1] - state.center[1]) / state.zoom) * h;
        const sx = px / dpr;
        const sy = py / dpr;

        ctxOrbit.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctxOrbit.lineWidth = 0.5;
        ctxOrbit.setLineDash([4, 4]);
        ctxOrbit.beginPath();
        ctxOrbit.moveTo(sx, 0);
        ctxOrbit.lineTo(sx, h / dpr);
        ctxOrbit.moveTo(0, sy);
        ctxOrbit.lineTo(w / dpr, sy);
        ctxOrbit.stroke();
        ctxOrbit.setLineDash([]);
        ctxOrbit.restore();
    }

    // ─────────── Minimap ───────────

    let minimapImageData = null;

    function renderMinimapOnce() {
        // Render a static Mandelbrot overview for the minimap
        const dpr = window.devicePixelRatio || 1;
        const w = minimapCanvas.width;
        const h = minimapCanvas.height;
        const imgData = ctxMinimap.createImageData(w, h);
        const data = imgData.data;
        const aspect = w / h;

        // Fixed view: center (-0.5, 0), zoom 3.5
        const cx = -0.5, cy = 0, zoom = 3.5;

        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const re = (px / w - 0.5) * zoom * aspect + cx;
                const im = (0.5 - py / h) * zoom + cy;

                let zr = 0, zi = 0;
                let iter = 0;
                const maxIter = 100;
                while (iter < maxIter && zr * zr + zi * zi < 4) {
                    const tmp = zr * zr - zi * zi + re;
                    zi = 2 * zr * zi + im;
                    zr = tmp;
                    iter++;
                }

                const idx = (py * w + px) * 4;
                if (iter === maxIter) {
                    data[idx] = 5;
                    data[idx + 1] = 5;
                    data[idx + 2] = 10;
                } else {
                    const t = iter / maxIter;
                    data[idx] = Math.floor(9 * (1 - t) * t * t * t * 255);
                    data[idx + 1] = Math.floor(15 * (1 - t) * (1 - t) * t * t * 255);
                    data[idx + 2] = Math.floor(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255);
                }
                data[idx + 3] = 255;
            }
        }
        ctxMinimap.putImageData(imgData, 0, 0);
    }

    function updateMinimapViewport() {
        if (!state.showMinimap) return;
        const panel = document.getElementById('minimapPanel');
        const vp = document.getElementById('minimapViewport');
        const pw = panel.clientWidth;
        const ph = panel.clientHeight;
        const aspect = pw / ph;

        // Map current view to minimap coordinates
        const mCx = -0.5, mCy = 0, mZoom = 3.5;
        const mAspect = pw / ph;

        // Current view bounds in complex plane
        const canvasAspect = window.innerWidth / window.innerHeight;
        const viewLeft = state.center[0] - state.zoom * canvasAspect * 0.5;
        const viewRight = state.center[0] + state.zoom * canvasAspect * 0.5;
        const viewTop = state.center[1] + state.zoom * 0.5;
        const viewBottom = state.center[1] - state.zoom * 0.5;

        // Map to minimap pixels
        const toMX = (re) => ((re - mCx) / (mZoom * mAspect) + 0.5) * pw;
        const toMY = (im) => (0.5 - (im - mCy) / mZoom) * ph;

        const left = toMX(viewLeft);
        const right = toMX(viewRight);
        const top = toMY(viewTop);
        const bottom = toMY(viewBottom);

        const vpLeft = Math.max(0, left);
        const vpTop = Math.max(0, top);
        const vpWidth = Math.min(pw, right) - vpLeft;
        const vpHeight = Math.min(ph, bottom) - vpTop;

        if (vpWidth < 2 || vpHeight < 2 || vpWidth > pw || vpHeight > ph) {
            vp.style.display = 'none';
        } else {
            vp.style.display = 'block';
            vp.style.left = vpLeft + 'px';
            vp.style.top = vpTop + 'px';
            vp.style.width = vpWidth + 'px';
            vp.style.height = vpHeight + 'px';
        }
    }

    // ─────────── Auto-Zoom ───────────

    function startAutoZoom() {
        const targetKey = document.getElementById('zoomTarget').value;
        const btn = document.getElementById('autoZoomBtn');

        if (state.autoZooming) {
            state.autoZooming = false;
            btn.textContent = '▶ Auto-Zoom';
            btn.classList.remove('active');
            return;
        }

        let target;
        if (targetKey === 'custom') {
            target = {
                center: [...state.center],
                zoom: state.zoom * 0.0001,
            };
        } else {
            target = ZOOM_TARGETS[targetKey];
        }

        state.autoZooming = true;
        state.autoZoomTarget = target;
        btn.textContent = '⏸ Stop';
        btn.classList.add('active');

        // Start from default view
        state.center = [-0.5, 0];
        state.zoom = 3.5;
    }

    function updateAutoZoom(dt) {
        if (!state.autoZooming || !state.autoZoomTarget) return;

        const target = state.autoZoomTarget;
        const zoomSpeed = 0.5; // exponential zoom speed

        // Exponential interpolation toward target
        const factor = 1 - Math.exp(-zoomSpeed * dt);
        state.center[0] += (target.center[0] - state.center[0]) * factor;
        state.center[1] += (target.center[1] - state.center[1]) * factor;
        state.zoom *= (1 - factor * 0.02);

        // Increase iterations as we zoom in
        const depth = Math.log(3.5 / state.zoom) / Math.log(10);
        state.maxIter = Math.max(256, Math.min(4096, Math.floor(256 + depth * 200)));
        document.getElementById('iterSlider').value = state.maxIter;
        document.getElementById('iterValue').textContent = state.maxIter;

        if (state.zoom < target.zoom * 0.5) {
            // Reached target, bounce back slowly
            state.autoZooming = false;
            document.getElementById('autoZoomBtn').textContent = '▶ Auto-Zoom';
            document.getElementById('autoZoomBtn').classList.remove('active');
            showToast('🎯 Reached destination!');
        }
    }

    // ─────────── Toast ───────────

    let toastEl = null;
    let toastTimeout = null;

    function showToast(msg) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2000);
    }

    // ─────────── Main Loop ───────────

    let lastTime = 0;
    let frameCount = 0;
    let fpsTime = 0;

    function animate(time) {
        requestAnimationFrame(animate);

        const dt = (time - lastTime) / 1000;
        lastTime = time;

        // FPS counter
        frameCount++;
        if (time - fpsTime > 500) {
            document.getElementById('fpsCounter').textContent =
                Math.round(frameCount / ((time - fpsTime) / 1000)) + ' fps';
            frameCount = 0;
            fpsTime = time;
        }

        // Color cycling
        if (state.colorCycleSpeed > 0) {
            state.colorOffset += state.colorCycleSpeed * dt * 0.1;
        }

        // Auto-zoom
        updateAutoZoom(dt);

        // Update zoom level display
        const zoomMag = 3.5 / state.zoom;
        document.getElementById('zoomLevel').textContent =
            zoomMag < 1000 ? zoomMag.toFixed(1) + '×' :
                zoomMag.toExponential(1) + '×';

        // Render
        renderMandelbrot();
        renderJulia();

        if (state.showOrbit) renderOrbit();
        else if (state.showCrosshair) renderCrosshair();

        updateMinimapViewport();
    }

    // ─────────── Mouse Interaction ───────────

    function screenToComplex(screenX, screenY) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        const re = (screenX / w - 0.5) * state.zoom * aspect + state.center[0];
        const im = (0.5 - screenY / h) * state.zoom + state.center[1];
        return [re, im];
    }

    mandelbrotCanvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        state.isDragging = true;
        state.lastMouse = [e.clientX, e.clientY];
        document.body.classList.add('dragging');
        // Stop auto-zoom on interaction
        if (state.autoZooming) {
            state.autoZooming = false;
            document.getElementById('autoZoomBtn').textContent = '▶ Auto-Zoom';
            document.getElementById('autoZoomBtn').classList.remove('active');
        }
    });

    window.addEventListener('mousemove', (e) => {
        const c = screenToComplex(e.clientX, e.clientY);
        state.mouseComplex = c;
        state.juliaC = c;

        // Update coordinate display
        const reStr = c[0].toFixed(12);
        const imStr = (c[1] >= 0 ? '+' : '') + c[1].toFixed(12);
        document.getElementById('coordText').textContent = `c = ${reStr} ${imStr}i`;
        document.getElementById('juliaCoord').textContent =
            `c = ${c[0].toFixed(4)} ${c[1] >= 0 ? '+' : ''}${c[1].toFixed(4)}i`;

        if (state.isDragging) {
            const dx = e.clientX - state.lastMouse[0];
            const dy = e.clientY - state.lastMouse[1];
            const w = window.innerWidth;
            const h = window.innerHeight;
            const aspect = w / h;
            state.center[0] -= dx / w * state.zoom * aspect;
            state.center[1] += dy / h * state.zoom;
            state.lastMouse = [e.clientX, e.clientY];
        }
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        document.body.classList.remove('dragging');
    });

    // Point-centric zoom
    mandelbrotCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
        const c = screenToComplex(e.clientX, e.clientY);

        // Zoom toward mouse position
        state.center[0] += (c[0] - state.center[0]) * (1 - zoomFactor);
        state.center[1] += (c[1] - state.center[1]) * (1 - zoomFactor);
        state.zoom *= zoomFactor;

        // Stop auto-zoom on interaction
        if (state.autoZooming) {
            state.autoZooming = false;
            document.getElementById('autoZoomBtn').textContent = '▶ Auto-Zoom';
            document.getElementById('autoZoomBtn').classList.remove('active');
        }
    }, { passive: false });

    // Touch support
    let lastTouchDist = 0;
    let lastTouchCenter = [0, 0];

    mandelbrotCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            state.isDragging = true;
            state.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
        } else if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            lastTouchDist = Math.hypot(dx, dy);
            lastTouchCenter = [
                (e.touches[0].clientX + e.touches[1].clientX) / 2,
                (e.touches[0].clientY + e.touches[1].clientY) / 2
            ];
        }
    }, { passive: false });

    mandelbrotCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && state.isDragging) {
            const dx = e.touches[0].clientX - state.lastMouse[0];
            const dy = e.touches[0].clientY - state.lastMouse[1];
            const w = window.innerWidth;
            const h = window.innerHeight;
            const aspect = w / h;
            state.center[0] -= dx / w * state.zoom * aspect;
            state.center[1] += dy / h * state.zoom;
            state.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
        } else if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.hypot(dx, dy);
            const zoomFactor = lastTouchDist / dist;
            const center = [
                (e.touches[0].clientX + e.touches[1].clientX) / 2,
                (e.touches[0].clientY + e.touches[1].clientY) / 2
            ];
            const c = screenToComplex(center[0], center[1]);

            state.center[0] += (c[0] - state.center[0]) * (1 - zoomFactor);
            state.center[1] += (c[1] - state.center[1]) * (1 - zoomFactor);
            state.zoom *= zoomFactor;

            lastTouchDist = dist;
            lastTouchCenter = center;
        }
    }, { passive: false });

    mandelbrotCanvas.addEventListener('touchend', (e) => {
        state.isDragging = false;
        if (e.touches.length < 2) lastTouchDist = 0;
    });

    // ─────────── Keyboard ───────────

    window.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            document.getElementById('controls').classList.toggle('hidden');
        }
        if (e.key === 'j' || e.key === 'J') {
            state.showJulia = !state.showJulia;
            document.getElementById('juliaToggle').checked = state.showJulia;
            document.getElementById('juliaPanel').classList.toggle('hidden', !state.showJulia);
        }
        if (e.key === ' ') {
            e.preventDefault();
            startAutoZoom();
        }
        if (e.key === 'r' || e.key === 'R') {
            resetView();
        }
    });

    // ─────────── UI Controls ───────────

    function bindSlider(id, valueId, prop, transform) {
        const slider = document.getElementById(id);
        const display = document.getElementById(valueId);
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            state[prop] = transform ? transform(val) : val;
            display.textContent = typeof state[prop] === 'number' ?
                (state[prop] >= 100 ? state[prop] : state[prop].toFixed(1)) : val;
        });
    }

    bindSlider('iterSlider', 'iterValue', 'maxIter', v => Math.round(v));
    bindSlider('colorCycleSlider', 'colorCycleValue', 'colorCycleSpeed');
    bindSlider('smoothSlider', 'smoothValue', 'colorScale');
    bindSlider('bailoutSlider', 'bailoutValue', 'bailout', v => Math.round(v));
    bindSlider('exponentSlider', 'exponentValue', 'exponent');

    document.getElementById('colorScheme').addEventListener('change', (e) => {
        state.colorScheme = parseInt(e.target.value);
    });

    document.getElementById('juliaToggle').addEventListener('change', (e) => {
        state.showJulia = e.target.checked;
        document.getElementById('juliaPanel').classList.toggle('hidden', !state.showJulia);
    });

    document.getElementById('orbitToggle').addEventListener('change', (e) => {
        state.showOrbit = e.target.checked;
        if (!state.showOrbit) ctxOrbit.clearRect(0, 0, orbitCanvas.width, orbitCanvas.height);
    });

    document.getElementById('minimapToggle').addEventListener('change', (e) => {
        state.showMinimap = e.target.checked;
        document.getElementById('minimapPanel').classList.toggle('hidden', !state.showMinimap);
    });

    document.getElementById('crosshairToggle').addEventListener('change', (e) => {
        state.showCrosshair = e.target.checked;
    });

    document.getElementById('interiorToggle').addEventListener('change', (e) => {
        state.interiorShading = e.target.checked;
    });

    document.getElementById('autoZoomBtn').addEventListener('click', startAutoZoom);

    function resetView() {
        state.center = [-0.5, 0];
        state.zoom = 3.5;
        state.maxIter = 256;
        state.colorOffset = 0;
        document.getElementById('iterSlider').value = 256;
        document.getElementById('iterValue').textContent = '256';
        if (state.autoZooming) {
            state.autoZooming = false;
            document.getElementById('autoZoomBtn').textContent = '▶ Auto-Zoom';
            document.getElementById('autoZoomBtn').classList.remove('active');
        }
        showToast('🔄 View reset');
    }

    document.getElementById('resetBtn').addEventListener('click', resetView);

    // Screenshot
    document.getElementById('screenshotBtn').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `mandelbrot_${Date.now()}.png`;
        link.href = mandelbrotCanvas.toDataURL('image/png');
        link.click();
        showToast('📸 Screenshot saved!');
    });

    // ─────────── Init ───────────

    renderMinimapOnce();
    requestAnimationFrame(animate);

    // Fade out instructions after 5 seconds
    setTimeout(() => {
        const instr = document.getElementById('instructions');
        if (instr) instr.style.opacity = '0';
    }, 6000);

})();
