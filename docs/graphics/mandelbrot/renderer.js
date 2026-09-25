/* ═══════════════════════════════════════════════════════
   Mandelbrot Explorer — GPU-Accelerated WebGL Renderer

   Shallow views iterate z → zⁿ + c directly on the GPU.
   Deep views (z² only) use perturbation theory: a reference
   orbit is computed on the CPU in arbitrary precision (BigInt
   fixed point), and every pixel iterates only its small offset
   from that orbit in float32. Zhuoran's rebasing keeps a single
   reference glitch-free, and a bilinear-approximation (BLA)
   table lets pixels skip long runs of iterations at once.
   Offsets are carried pre-multiplied by 2⁸⁰ so float32 never
   underflows, which takes zooms well past 10⁴⁰×.
   ═══════════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ─────────── Shader Source ───────────

    const PALETTE_GLSL = `
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

        // Iteration → palette coordinate (linear / square root / logarithmic)
        float mapIter(float s) {
            if (uColorMode == 1) return sqrt(max(s, 0.0));
            if (uColorMode == 2) return log(1.0 + max(s, 0.0));
            return s;
        }
    `;

    const VERTEX_SHADER = `
        attribute vec2 aPosition;
        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `;

    // Single-pass shader: Julia preview, and the main view on browsers without WebGL2.
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
        uniform int uColorMode;
        uniform bool uInterior;
        uniform bool uIsJulia;
        uniform vec2 uJuliaC;

        ${PALETTE_GLSL}

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

                float t = mapIter(smoothIter) * uColorScale + uColorOffset;
                color = getColor(t);

                // Boost brightness near boundary
                float closeness = smoothIter / uMaxIter;
                color *= 1.0 + 0.3 * (1.0 - closeness);
            }

            gl_FragColor = vec4(color, 1.0);
        }
    `;

    // ── WebGL2 main-view pipeline: iterate into a float texture, then colorize ──
    // Iteration textures hold the smooth iteration count, -1 for interior points,
    // or -(2 + period) for interior points whose period was detected.

    const VERTEX_300 = `#version 300 es
        in vec2 aPosition;
        void main() {
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `;

    const ITER_DIRECT_300 = `#version 300 es
        precision highp float;
        uniform vec2 uResolution;
        uniform vec2 uCenter;
        uniform float uZoom;
        uniform int uMaxIter;
        uniform float uBailout;
        uniform float uExponent;
        uniform bool uInterior;
        out vec4 outIter;

        vec2 cpow(vec2 z, float n) {
            float r = length(z);
            float theta = atan(z.y, z.x);
            float rn = pow(r, n);
            return vec2(rn * cos(n * theta), rn * sin(n * theta));
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            float aspect = uResolution.x / uResolution.y;
            vec2 c = (uv - 0.5) * vec2(aspect, 1.0) * uZoom + uCenter;
            vec2 z = vec2(0.0);
            float bailoutSq = uBailout * uBailout;
            float zLenSq = 0.0;
            vec2 zOld = vec2(0.0);
            float period = 0.0;
            int iter = 0;
            bool escaped = false;

            // The main cardioid and period-2 bulb are interior in closed form.
            if (uExponent == 2.0 && !uInterior) {
                vec2 k = c - vec2(0.25, 0.0);
                float q = dot(k, k);
                vec2 b = c + vec2(1.0, 0.0);
                if (q * (q + k.x) < 0.25 * c.y * c.y || dot(b, b) < 0.0625) {
                    outIter = vec4(-1.0, 0.0, 0.0, 1.0);
                    return;
                }
            }

            for (int i = 0; i < uMaxIter; i++) {
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
                if (zLenSq > bailoutSq) { escaped = true; break; }
                iter++;

                if (uInterior) {
                    if (abs(z.x - zOld.x) < 1e-6 && abs(z.y - zOld.y) < 1e-6) {
                        period = float(iter);
                        break;
                    }
                    if (i % 20 == 0) zOld = z;
                }
            }

            float v = period > 0.0 ? -(2.0 + period) : -1.0;
            if (escaped) {
                float nu = log(0.5 * log(zLenSq) / log(uBailout)) / log(uExponent);
                v = max(float(iter) + 1.0 - nu, 0.0);
            }
            outIter = vec4(v, 0.0, 0.0, 1.0);
        }
    `;

    // Perturbation: pixel c = C + δc, orbit z = Z + δz, and
    //   δz ← (2Z + δz)·δz + δc
    // Here w = δz·S and d = δc·S. When |Z + δz| < |δz| (or the reference runs
    // out) the pixel rebases onto the start of the reference: δz ← Z + δz.
    // BLA step: δz ← A·δz + B·δc, valid while |δz| < R. Level l of the table
    // merges 2^l single steps; entry k at level l starts at reference index
    // m = 1 + k·2^l. Radii are stored as R·S/√2 so a max-norm test suffices.
    // A dive's destination minibrot is known (nucleus c₀, complex size s), and
    // near it c ≈ c₀ + s·w maps it onto the whole set, so pixels whose w lies
    // well inside the main cardioid or period-2 disk are interior outright.
    const ITER_DEEP_300 = `#version 300 es
        precision highp float;
        precision highp int;
        precision highp sampler2D;

        uniform vec2 uResolution;
        uniform vec2 uOffsetS;     // (view center − reference)·S
        uniform float uZoomS;      // view height·S
        uniform float uS;
        uniform float uInvS;
        uniform int uMaxIter;
        uniform int uRefLen;
        uniform float uBailout;
        uniform sampler2D uRef;    // Z.re, Z.im, R₀·S/√2
        uniform sampler2D uBlaAB;  // A.re, A.im, B.re, B.im
        uniform sampler2D uBlaR;   // R·S/√2
        uniform int uLevels;
        uniform int uLevelOffset[24];
        uniform int uLevelCount[24];
        uniform bool uMiniOn;
        uniform vec2 uMiniOffS;    // (c₀ − reference)·S
        uniform vec2 uMiniInv;     // 1 / (s·S)
        out vec4 outIter;

        vec4 fetch(sampler2D t, int i) {
            return texelFetch(t, ivec2(i & 2047, i >> 11), 0);
        }

        vec2 cmul(vec2 a, vec2 b) {
            return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
        }

        vec2 csqrt(vec2 z) {
            float r = length(z);
            return vec2(sqrt(0.5 * (r + z.x)), (z.y < 0.0 ? -1.0 : 1.0) * sqrt(0.5 * max(r - z.x, 0.0)));
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution;
            float aspect = uResolution.x / uResolution.y;
            vec2 d = uOffsetS + (uv - 0.5) * vec2(aspect, 1.0) * uZoomS;
            if (uMiniOn) {
                vec2 lw = cmul(d - uMiniOffS, uMiniInv);
                vec2 lam = vec2(1.0, 0.0) - csqrt(vec2(1.0, 0.0) - 4.0 * lw);
                vec2 b2 = 4.0 * (lw + vec2(1.0, 0.0));
                if (dot(lam, lam) < 0.99 || dot(b2, b2) < 0.99) {
                    outIter = vec4(-1.0, 0.0, 0.0, 1.0);
                    return;
                }
            }

            vec2 w = vec2(0.0);
            vec4 ref = vec4(0.0);
            int m = 0;
            int n = 0;
            float bail2 = uBailout * uBailout;
            float mag2 = 0.0;
            bool escaped = false;

            while (n < uMaxIter) {
                float wn = max(abs(w.x), abs(w.y));
                if (m > 0 && wn < ref.z) {
                    // Linear regime: take the longest valid BLA skip
                    vec2 A = 2.0 * ref.xy;
                    vec2 B = vec2(1.0, 0.0);
                    int len = 1;
                    int j = m - 1;
                    for (int l = 1; l < uLevels; l++) {
                        int span = 1 << l;
                        if ((j & (span - 1)) != 0 || n + span > uMaxIter) break;
                        int k = j >> l;
                        if (k >= uLevelCount[l]) break;
                        int idx = uLevelOffset[l] + k;
                        if (wn >= fetch(uBlaR, idx).x) break;
                        vec4 ab = fetch(uBlaAB, idx);
                        A = ab.xy;
                        B = ab.zw;
                        len = span;
                    }
                    w = cmul(A, w) + cmul(B, d);
                    m += len;
                    n += len;
                } else {
                    w = cmul(2.0 * ref.xy + w * uInvS, w) + d;
                    m++;
                    n++;
                }

                ref = fetch(uRef, m);
                vec2 dz = w * uInvS;
                vec2 z = ref.xy + dz;
                mag2 = dot(z, z);
                if (mag2 > bail2) { escaped = true; break; }
                if (mag2 < dot(dz, dz) || m >= uRefLen - 1) {
                    w = z * uS;
                    m = 0;
                    ref = vec4(0.0);
                }
            }

            float v = -1.0;
            if (escaped) {
                float nu = log(0.5 * log(mag2) / log(uBailout)) / log(2.0);
                v = max(float(n) - nu, 0.0);
            }
            outIter = vec4(v, 0.0, 0.0, 1.0);
        }
    `;

    const COLOR_300 = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        uniform sampler2D uIter;
        uniform float uMaxIter;
        uniform float uColorOffset;
        uniform float uColorScale;
        uniform int uColorScheme;
        uniform int uColorMode;
        uniform bool uInterior;
        out vec4 fragColor;

        ${PALETTE_GLSL}

        void main() {
            float v = texelFetch(uIter, ivec2(gl_FragCoord.xy), 0).r;
            vec3 color = vec3(0.0);
            if (v < 0.0) {
                if (uInterior && v < -1.5) color = getColor(mod((-v - 2.0) * 0.05, 1.0)) * 0.3;
            } else {
                color = getColor(mapIter(v) * uColorScale + uColorOffset);
                color *= 1.0 + 0.3 * (1.0 - v / uMaxIter);
            }
            fragColor = vec4(color, 1.0);
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
        gl.bindAttribLocation(prog, 0, 'aPosition');
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Program error:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    function setupQuad(gl) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1
        ]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }

    function uniformsOf(glCtx, prog, names) {
        const u = {};
        for (const n of names) u[n] = glCtx.getUniformLocation(prog, n);
        return u;
    }

    // ─────────── State ───────────

    const HOME_CENTER = [-0.5, 0.0];
    const HOME_ZOOM = 3.5;

    const state = {
        center: [...HOME_CENTER],   // approximate (double) view center; see `view`
        zoom: HOME_ZOOM,            // height of the view in the complex plane
        maxIter: 256,
        autoIter: true,
        colorScheme: 0,
        colorMode: 0,
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
        mouseScreen: null,
        isDragging: false,
        lastMouse: [0, 0],
    };

    // ─────────── High-precision view center ───────────
    // The exact center is ref + off: `ref` is a BigInt fixed-point point with HP
    // fraction bits, `off` a double kept small relative to the zoom so it never
    // loses precision. state.center is the rounded sum, for everything else.

    const HP = 512;
    const HP_B = BigInt(HP);
    const view = { refRe: 0n, refIm: 0n, off: [...HOME_CENTER] };

    function doubleToFixed(x) {
        if (x === 0 || !Number.isFinite(x)) return 0n;
        const e = Math.floor(Math.log2(Math.abs(x)));
        const mant = BigInt(Math.round(x * 2 ** (52 - e)));
        const sh = HP - 52 + e;
        return sh >= 0 ? mant << BigInt(sh) : mant >> BigInt(-sh);
    }

    function fixedToDouble(v) {
        return Number(v) * 2 ** -HP;
    }

    function parseFixed(str) {
        str = String(str).trim();
        const neg = str[0] === '-';
        if (neg || str[0] === '+') str = str.slice(1);
        const [ip, fp = ''] = str.split('.');
        const v = (BigInt((ip || '0') + fp) << HP_B) / 10n ** BigInt(fp.length);
        return neg ? -v : v;
    }

    function fixedToString(v, digits) {
        const neg = v < 0n;
        if (neg) v = -v;
        v += (5n << HP_B) / 10n ** BigInt(digits + 1);   // round
        const ip = v >> HP_B;
        const frac = ((v - (ip << HP_B)) * 10n ** BigInt(digits)) >> HP_B;
        return (neg ? '-' : '') + ip + '.' + frac.toString().padStart(digits, '0');
    }

    function syncCenter() {
        state.center = [
            fixedToDouble(view.refRe) + view.off[0],
            fixedToDouble(view.refIm) + view.off[1],
        ];
    }

    // Fold the double offset into the fixed-point reference once it grows
    // large relative to the view (this forces a new reference orbit).
    function foldOffset() {
        const lim = 16 * state.zoom;
        if (Math.abs(view.off[0]) <= lim && Math.abs(view.off[1]) <= lim) return;
        view.refRe += doubleToFixed(view.off[0]);
        view.refIm += doubleToFixed(view.off[1]);
        view.off = [0, 0];
        syncCenter();
    }

    function setCenter(re, im) {
        view.refRe = typeof re === 'bigint' ? re : doubleToFixed(re);
        view.refIm = typeof im === 'bigint' ? im : doubleToFixed(im);
        view.off = [0, 0];
        syncCenter();
        markViewChanged();
    }

    function panBy(dRe, dIm) {
        view.off[0] += dRe;
        view.off[1] += dIm;
        foldOffset();
        syncCenter();
        markViewChanged();
    }

    function zoomAbout(screenX, screenY, factor) {
        const c = screenOffset(screenX, screenY);
        state.zoom = Math.max(MIN_ZOOM, Math.min(HOME_ZOOM * 4, state.zoom * factor));
        panBy(c[0] * (1 - factor), c[1] * (1 - factor));
        if (state.autoIter) applyAutoIter();
    }

    // ─────────── Deep-zoom constants ───────────

    const DEEP_THRESHOLD = 1e-3;     // perturbation below this view height
    const MIN_ZOOM = 1e-44;
    const DEEP_S = 2 ** 80;
    const BLA_EPS = 2 ** -24;
    const TEX_W = 2048;
    const MAX_LEVELS = 24;
    const REF_BAIL_SQ = 1n << 20n;   // reference orbit stops once |Z| > 1024

    // ─────────── Initialize WebGL contexts ───────────

    const mandelbrotCanvas = document.getElementById('mandelbrotCanvas');
    const juliaCanvas = document.getElementById('juliaCanvas');
    const orbitCanvas = document.getElementById('orbitCanvas');
    const minimapCanvas = document.getElementById('minimapCanvas');

    const ctxOpts = { preserveDrawingBuffer: true, antialias: false };
    let gl = mandelbrotCanvas.getContext('webgl2', ctxOpts);
    const isGL2 = !!gl;
    if (!gl) gl = mandelbrotCanvas.getContext('webgl', ctxOpts);
    const glJulia = juliaCanvas.getContext('webgl', { preserveDrawingBuffer: true });
    const ctxOrbit = orbitCanvas.getContext('2d');
    const ctxMinimap = minimapCanvas.getContext('2d');

    if (!gl || !glJulia) {
        document.body.innerHTML = '<div style="color:white;text-align:center;padding:40px">WebGL not supported</div>';
        return;
    }

    // Deep zoom needs WebGL2 with renderable float textures.
    const deepCapable = isGL2 && !!gl.getExtension('EXT_color_buffer_float');

    const juliaProg = createProgram(glJulia, VERTEX_SHADER, MANDELBROT_FRAGMENT);
    if (!juliaProg) return;
    setupQuad(glJulia);
    glJulia.useProgram(juliaProg);

    const SINGLE_PASS_UNIFORMS = ['uResolution', 'uCenter', 'uZoom', 'uMaxIter', 'uColorOffset', 'uColorScale',
        'uBailout', 'uExponent', 'uColorScheme', 'uColorMode', 'uInterior', 'uIsJulia', 'uJuliaC'];
    const uJulia = uniformsOf(glJulia, juliaProg, SINGLE_PASS_UNIFORMS);

    setupQuad(gl);

    let legacyProg = null, uLegacy = null;
    let directProg = null, deepProg = null, colorProg = null;
    let uDirect = null, uDeep = null, uColor = null;

    if (deepCapable) {
        directProg = createProgram(gl, VERTEX_300, ITER_DIRECT_300);
        deepProg = createProgram(gl, VERTEX_300, ITER_DEEP_300);
        colorProg = createProgram(gl, VERTEX_300, COLOR_300);
        if (!directProg || !deepProg || !colorProg) return;
        uDirect = uniformsOf(gl, directProg, ['uResolution', 'uCenter', 'uZoom', 'uMaxIter', 'uBailout',
            'uExponent', 'uInterior']);
        uDeep = uniformsOf(gl, deepProg, ['uResolution', 'uOffsetS', 'uZoomS', 'uS', 'uInvS', 'uMaxIter',
            'uRefLen', 'uBailout', 'uRef', 'uBlaAB', 'uBlaR', 'uLevels', 'uLevelOffset', 'uLevelCount',
            'uMiniOn', 'uMiniOffS', 'uMiniInv']);
        uColor = uniformsOf(gl, colorProg, ['uIter', 'uMaxIter', 'uColorOffset', 'uColorScale',
            'uColorScheme', 'uColorMode', 'uInterior']);
    } else {
        legacyProg = createProgram(gl, VERTEX_SHADER, MANDELBROT_FRAGMENT);
        if (!legacyProg) return;
        uLegacy = uniformsOf(gl, legacyProg, SINGLE_PASS_UNIFORMS);
    }

    // ─────────── Resize ───────────

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;

        mandelbrotCanvas.width = Math.round(w * dpr);
        mandelbrotCanvas.height = Math.round(h * dpr);
        mandelbrotCanvas.style.width = w + 'px';
        mandelbrotCanvas.style.height = h + 'px';

        orbitCanvas.width = w * dpr;
        orbitCanvas.height = h * dpr;
        orbitCanvas.style.width = w + 'px';
        orbitCanvas.style.height = h + 'px';

        // Julia canvas
        const juliaSize = 280;
        juliaCanvas.width = juliaSize * dpr;
        juliaCanvas.height = juliaSize * dpr;
        glJulia.viewport(0, 0, juliaCanvas.width, juliaCanvas.height);

        // Minimap canvas
        minimapCanvas.width = 180 * dpr;
        minimapCanvas.height = 140 * dpr;

        markViewChanged();
        juliaDirty = true;
    }

    // ─────────── Reference orbit & BLA table ───────────

    const deep = {
        valid: false,
        refRe: 0n, refIm: 0n,  // point the orbit was computed for
        P: 0,                  // fixed-point bits used
        N: 0,                  // stored length (Z_0 … Z_{N-1})
        escaped: false,
        Z: null,               // Float64Array, interleaved re/im
        levels: [],            // BLA levels ≥ 1: { count, Ar, Ai, Br, Bi, Am, Bm, R }
        R0: null,              // level-0 radii
        blaCmax: -1,           // |δc| bound the radii were computed for
        activeLevels: 1,
        gen: 0,                // bumped whenever the reference orbit changes
        uploads: 0,            // bumped on every texture upload
        want: { N: 0, zoom: 1 },  // sizing hints from an active dive
        tex: null,
    };

    function bitsFor(zoom) {
        return Math.min(HP, Math.max(64, Math.ceil(-Math.log2(zoom)) + 56));
    }

    function computeReference(N, P) {
        const shift = BigInt(HP - P);
        const cr = view.refRe >> shift, ci = view.refIm >> shift;
        const PB = BigInt(P), P1 = BigInt(P - 1);
        const lim = REF_BAIL_SQ << PB;
        const s = 2 ** -P;
        const Z = new Float64Array(2 * N);
        let x = 0n, y = 0n, n = 0, escaped = false;
        for (; n < N; n++) {
            Z[2 * n] = Number(x) * s;
            Z[2 * n + 1] = Number(y) * s;
            const x2 = (x * x) >> PB, y2 = (y * y) >> PB;
            if (x2 + y2 > lim) { n++; escaped = true; break; }
            const xy = (x * y) >> P1;
            x = x2 - y2 + cr;
            y = xy + ci;
        }
        Object.assign(deep, {
            valid: true, refRe: view.refRe, refIm: view.refIm, P, N: n, escaped, Z, gen: deep.gen + 1,
        });
        buildBLA();
        uploadReference();
        deep.blaCmax = -1;
    }

    // Merge single steps pairwise: A = A_y·A_x, B = A_y·B_x + B_y.
    function buildBLA() {
        const { Z, N } = deep;
        const count0 = Math.max(0, N - 2);   // step m → m+1 for m = 1 … N−2
        deep.R0 = new Float64Array(count0);
        const levels = [];
        let prev = null, prevCount = count0;
        while (prevCount >= 2 && levels.length < MAX_LEVELS - 1) {
            const count = prevCount >> 1;
            const Ar = new Float64Array(count), Ai = new Float64Array(count);
            const Br = new Float64Array(count), Bi = new Float64Array(count);
            const Am = new Float64Array(count), Bm = new Float64Array(count);
            for (let k = 0; k < count; k++) {
                const x = 2 * k, y = x + 1;
                let axr, axi, bxr, bxi, ayr, ayi, byr, byi;
                if (prev) {
                    axr = prev.Ar[x]; axi = prev.Ai[x]; bxr = prev.Br[x]; bxi = prev.Bi[x];
                    ayr = prev.Ar[y]; ayi = prev.Ai[y]; byr = prev.Br[y]; byi = prev.Bi[y];
                } else {
                    axr = 2 * Z[2 * x + 2]; axi = 2 * Z[2 * x + 3]; bxr = 1; bxi = 0;
                    ayr = 2 * Z[2 * y + 2]; ayi = 2 * Z[2 * y + 3]; byr = 1; byi = 0;
                }
                const ar = ayr * axr - ayi * axi, ai = ayr * axi + ayi * axr;
                const br = ayr * bxr - ayi * bxi + byr, bi = ayr * bxi + ayi * bxr + byi;
                Ar[k] = ar; Ai[k] = ai; Br[k] = br; Bi[k] = bi;
                Am[k] = Math.hypot(ar, ai); Bm[k] = Math.hypot(br, bi);
            }
            prev = { count, Ar, Ai, Br, Bi, Am, Bm, R: new Float64Array(count) };
            levels.push(prev);
            prevCount = count;
        }
        deep.levels = levels;
    }

    // Validity radii depend on the largest |δc| in view, so they are refreshed
    // as the view shrinks: R = min(R_x, max(0, (R_y − |B_x|·|δc|) / |A_x|)).
    function updateBLARadii(cmax) {
        const { Z, R0, levels } = deep;
        for (let j = 0; j < R0.length; j++) {
            R0[j] = BLA_EPS * Math.hypot(Z[2 * j + 2], Z[2 * j + 3]);
        }
        let prevR = R0, prevAm = null, prevBm = null;
        let active = 1;
        levels.forEach((L, li) => {
            let any = false;
            for (let k = 0; k < L.count; k++) {
                const x = 2 * k, y = x + 1;
                const axm = prevAm ? prevAm[x] : 2 * Math.hypot(Z[2 * x + 2], Z[2 * x + 3]);
                const bxm = prevBm ? prevBm[x] : 1;
                let r = Math.min(prevR[x], Math.max(0, (prevR[y] - bxm * cmax) / axm));
                if (!(r > 0) || !(L.Am[k] < 1e36) || !(L.Bm[k] < 1e36)) r = 0;
                L.R[k] = r;
                if (r > 0) any = true;
            }
            if (any) active = li + 2;
            prevR = L.R; prevAm = L.Am; prevBm = L.Bm;
        });
        deep.activeLevels = active;
        deep.blaCmax = cmax;
        uploadBLA();
    }

    function makeDataTexture(unit) {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
    }

    function uploadTexture(unit, tex, internalFormat, format, channels, data, count) {
        deep.uploads++;
        const rows = Math.max(1, Math.ceil(count / TEX_W));
        const buf = new Float32Array(TEX_W * rows * channels);
        data(buf);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, TEX_W, rows, 0, format, gl.FLOAT, buf);
    }

    function ensureDeepTextures() {
        if (deep.tex) return;
        deep.tex = { ref: makeDataTexture(0), ab: makeDataTexture(1), r: makeDataTexture(2) };
    }

    const R_SCALE = DEEP_S * Math.SQRT1_2;

    function uploadReference() {
        ensureDeepTextures();
        const { Z, N, R0 } = deep;
        const rs = R_SCALE * BLA_EPS;
        uploadTexture(0, deep.tex.ref, gl.RGBA32F, gl.RGBA, 4, (buf) => {
            for (let m = 0; m < N; m++) {
                const zr = Z[2 * m], zi = Z[2 * m + 1];
                buf[4 * m] = zr;
                buf[4 * m + 1] = zi;
                buf[4 * m + 2] = m > 0 && m <= R0.length ? rs * Math.hypot(zr, zi) : 0;
            }
        }, N);
        let offset = 0;
        deep.offsets = new Int32Array(MAX_LEVELS);
        deep.counts = new Int32Array(MAX_LEVELS);
        deep.levels.forEach((L, i) => {
            deep.offsets[i + 1] = offset;
            deep.counts[i + 1] = L.count;
            offset += L.count;
        });
        deep.blaTotal = offset;
        uploadTexture(1, deep.tex.ab, gl.RGBA32F, gl.RGBA, 4, (buf) => {
            let o = 0;
            for (const L of deep.levels) {
                for (let k = 0; k < L.count; k++, o++) {
                    buf[4 * o] = L.Ar[k]; buf[4 * o + 1] = L.Ai[k];
                    buf[4 * o + 2] = L.Br[k]; buf[4 * o + 3] = L.Bi[k];
                }
            }
        }, offset);
    }

    function uploadBLA() {
        uploadTexture(2, deep.tex.r, gl.R32F, gl.RED, 1, (buf) => {
            let o = 0;
            for (const L of deep.levels) {
                for (let k = 0; k < L.count; k++, o++) buf[o] = L.R[k] * R_SCALE;
            }
        }, deep.blaTotal);
    }

    function viewCmax() {
        const aspect = mandelbrotCanvas.width / mandelbrotCanvas.height;
        return Math.hypot(view.off[0], view.off[1]) + 0.5 * state.zoom * Math.hypot(aspect, 1);
    }

    function isDeep() {
        return deepCapable && state.exponent === 2 && state.zoom < DEEP_THRESHOLD;
    }

    // Make sure the reference orbit covers the current view, then refresh radii.
    function ensureReference() {
        const needN = state.maxIter + 2;
        const stale = !deep.valid ||
            deep.refRe !== view.refRe || deep.refIm !== view.refIm ||
            bitsFor(state.zoom) > deep.P ||
            (!deep.escaped && deep.N < needN);
        if (stale) {
            // Size generously so that zooming further rarely forces a recompute.
            const N = Math.max(needN, deep.want.N, Math.min(2 * needN, 1 << 20));
            computeReference(N, bitsFor(Math.min(state.zoom / 1e6, deep.want.zoom)));
        }
        const cmax = viewCmax();
        if (deep.blaCmax < cmax || deep.blaCmax > 4 * cmax) updateBLARadii(cmax * 1.25);
    }

    // ─────────── Render targets ───────────
    // Iteration passes render into `back` and swap into `front` when complete,
    // so the last finished image can always be recolored (e.g. color cycling).

    const targets = { front: null, back: null, color: null };

    function makeTarget(w, h, internalFormat, format, type) {
        const tex = makeDataTexture(5);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { w, h, tex, fbo };
    }

    function freeTarget(t) {
        if (!t) return;
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
    }

    function backTarget(w, h) {
        const b = targets.back;
        if (b && b.w === w && b.h === h) return b;
        freeTarget(b);
        targets.back = makeTarget(w, h, gl.R32F, gl.RED, gl.FLOAT);
        return targets.back;
    }

    // ─────────── Rendering ───────────

    // Iterate the rectangle [x0, x1) × [y0, y1) of a pass, using the view
    // parameters captured when the pass began.
    function renderIterations(p, x0, y0, x1, y1) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, p.target.fbo);
        gl.viewport(0, 0, p.w, p.h);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(x0, y0, x1 - x0, y1 - y0);

        if (p.deep) {
            gl.useProgram(deepProg);
            gl.uniform2f(uDeep.uResolution, p.w, p.h);
            gl.uniform2f(uDeep.uOffsetS, p.off[0] * DEEP_S, p.off[1] * DEEP_S);
            gl.uniform1f(uDeep.uZoomS, p.zoom * DEEP_S);
            gl.uniform1f(uDeep.uS, DEEP_S);
            gl.uniform1f(uDeep.uInvS, 1 / DEEP_S);
            gl.uniform1i(uDeep.uMaxIter, p.maxIter);
            gl.uniform1i(uDeep.uRefLen, deep.N);
            gl.uniform1f(uDeep.uBailout, p.bailout);
            gl.uniform1i(uDeep.uLevels, deep.activeLevels);
            gl.uniform1iv(uDeep.uLevelOffset, deep.offsets);
            gl.uniform1iv(uDeep.uLevelCount, deep.counts);
            gl.uniform1i(uDeep.uMiniOn, p.mini ? 1 : 0);
            if (p.mini) {
                gl.uniform2f(uDeep.uMiniOffS, p.mini.off[0] * DEEP_S, p.mini.off[1] * DEEP_S);
                gl.uniform2f(uDeep.uMiniInv, p.mini.inv[0] / DEEP_S, p.mini.inv[1] / DEEP_S);
            }
            gl.uniform1i(uDeep.uRef, 0);
            gl.uniform1i(uDeep.uBlaAB, 1);
            gl.uniform1i(uDeep.uBlaR, 2);
            for (const [unit, tex] of [[0, deep.tex.ref], [1, deep.tex.ab], [2, deep.tex.r]]) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, tex);
            }
        } else {
            gl.useProgram(directProg);
            gl.uniform2f(uDirect.uResolution, p.w, p.h);
            gl.uniform2f(uDirect.uCenter, p.center[0], p.center[1]);
            gl.uniform1f(uDirect.uZoom, p.zoom);
            gl.uniform1i(uDirect.uMaxIter, p.maxIter);
            gl.uniform1f(uDirect.uBailout, p.bailout);
            gl.uniform1f(uDirect.uExponent, p.exponent);
            gl.uniform1i(uDirect.uInterior, p.interior ? 1 : 0);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.disable(gl.SCISSOR_TEST);
    }

    // Colorize the last finished pass and present it, upscaling if needed.
    function presentColors() {
        const src = targets.front;
        if (!src) return;
        const W = mandelbrotCanvas.width, H = mandelbrotCanvas.height;
        const direct = src.w === W && src.h === H;
        if (!direct && (!targets.color || targets.color.w !== src.w || targets.color.h !== src.h)) {
            freeTarget(targets.color);
            targets.color = makeTarget(src.w, src.h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, direct ? null : targets.color.fbo);
        gl.viewport(0, 0, src.w, src.h);
        gl.useProgram(colorProg);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(uColor.uIter, 3);
        gl.uniform1f(uColor.uMaxIter, frame.presentedMaxIter);
        gl.uniform1f(uColor.uColorOffset, state.colorOffset);
        gl.uniform1f(uColor.uColorScale, state.colorScale);
        gl.uniform1i(uColor.uColorScheme, state.colorScheme);
        gl.uniform1i(uColor.uColorMode, state.colorMode);
        gl.uniform1i(uColor.uInterior, state.interiorShading ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (!direct) {
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets.color.fbo);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.blitFramebuffer(0, 0, src.w, src.h, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
    }

    function renderLegacy() {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, mandelbrotCanvas.width, mandelbrotCanvas.height);
        gl.useProgram(legacyProg);
        gl.uniform2f(uLegacy.uResolution, mandelbrotCanvas.width, mandelbrotCanvas.height);
        gl.uniform2f(uLegacy.uCenter, state.center[0], state.center[1]);
        gl.uniform1f(uLegacy.uZoom, state.zoom);
        gl.uniform1f(uLegacy.uMaxIter, state.maxIter);
        gl.uniform1f(uLegacy.uColorOffset, state.colorOffset);
        gl.uniform1f(uLegacy.uColorScale, state.colorScale);
        gl.uniform1f(uLegacy.uBailout, state.bailout);
        gl.uniform1f(uLegacy.uExponent, state.exponent);
        gl.uniform1i(uLegacy.uColorScheme, state.colorScheme);
        gl.uniform1i(uLegacy.uColorMode, state.colorMode);
        gl.uniform1i(uLegacy.uInterior, state.interiorShading ? 1 : 0);
        gl.uniform1i(uLegacy.uIsJulia, 0);
        gl.uniform2f(uLegacy.uJuliaC, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Rendering is scheduled in timed tiles. Each tile is synced and timed,
    // which keeps a running estimate of GPU cost per pixel; tiles are sized to
    // a per-frame budget so no single draw can trip a GPU watchdog. While the
    // view moves, passes run at a reduced resolution chosen from that estimate;
    // once it settles, a full-resolution pass replaces the preview.
    const MOVING_BUDGET = 24;   // ms of GPU work per animation frame
    const IDLE_BUDGET = 40;
    const MIN_SCALE = 0.2;

    const frame = {
        viewVersion: 0,
        renderedVersion: -1,
        full: false,
        colorDirty: true,
        lastChange: 0,
        pass: null,
        scale: 1 / Math.min(2, window.devicePixelRatio || 1),
        msPerPixel: 2e-5,     // average GPU cost of recent passes, for the preview resolution
        peakMsPerPixel: 2e-5, // cost of the most expensive recent tiles, for sizing tiles
        costIter: 256,
        presentedMaxIter: 256,
    };

    function markViewChanged() {
        frame.viewVersion++;
        frame.lastChange = performance.now();
    }

    function markColorsChanged() {
        frame.colorDirty = true;
        juliaDirty = true;
    }

    function isMoving(now) {
        return (dive.active && !dive.paused) || state.isDragging || now - frame.lastChange < 200;
    }

    function estMsPerPixel(maxIter, peak) {
        return (peak ? frame.peakMsPerPixel : frame.msPerPixel) * Math.max(1, maxIter / frame.costIter);
    }

    function movingScale() {
        const W = mandelbrotCanvas.width, H = mandelbrotCanvas.height;
        let s = Math.sqrt(MOVING_BUDGET / Math.max(1e-12, estMsPerPixel(state.maxIter) * W * H));
        s = Math.min(1, Math.max(MIN_SCALE, s));
        if (Math.abs(s - frame.scale) > 0.15 * frame.scale || (s === 1) !== (frame.scale === 1)) frame.scale = s;
        return frame.scale;
    }

    function newPass(scale, moving) {
        const W = mandelbrotCanvas.width, H = mandelbrotCanvas.height;
        const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
        const deepNow = isDeep();
        const uploads = deep.uploads;
        if (deepNow) ensureReference();
        let mini = null;
        if (deepNow && knownMinibrot) {
            const k = knownMinibrot;
            const off = [fixedToDouble(k.re - view.refRe), fixedToDouble(k.im - view.refIm)];
            const s2 = k.size[0] ** 2 + k.size[1] ** 2;
            // Only worth testing while the minibrot is in or near the view.
            if (Math.hypot(off[0] - view.off[0], off[1] - view.off[1]) < 4 * state.zoom + 3 * Math.sqrt(s2) &&
                Math.sqrt(s2) > state.zoom / 4000) {
                mini = { off, inv: [k.size[0] / s2, -k.size[1] / s2] };
            }
        }
        return {
            version: frame.viewVersion, scale: w === W && h === H ? 1 : scale, moving,
            w, h, x: 0, y: 0, deep: deepNow, gen: deep.gen,
            zoom: state.zoom, off: [...view.off], center: [...state.center], maxIter: state.maxIter,
            bailout: state.bailout, exponent: state.exponent, interior: state.interiorShading,
            mini, target: backTarget(w, h), gpuMs: 0,
            uploaded: deep.uploads !== uploads,   // its timing includes a texture transfer
        };
    }

    const syncPixel = new Float32Array(4);
    const SYNC_MS = 0.5;         // fixed cost of a tile (draw + readback)
    const MIN_TILE_PX = 4096;    // below this a tile no longer fills the GPU

    function iterateTile(p, x0, y0, x1, y1) {
        const t0 = performance.now();
        renderIterations(p, x0, y0, x1, y1);
        gl.readPixels(x0, y0, 1, 1, gl.RGBA, gl.FLOAT, syncPixel);   // wait for the GPU
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        const ms = performance.now() - t0;
        const work = Math.max(ms - SYNC_MS, 0.25 * ms);
        const sample = work / Math.max(MIN_TILE_PX, (x1 - x0) * (y1 - y0));
        frame.peakMsPerPixel = Math.max(sample, 0.9 * estMsPerPixel(p.maxIter, true));
        frame.msPerPixel = estMsPerPixel(p.maxIter);
        frame.costIter = p.maxIter;
        p.gpuMs += work;
    }

    // Render tiles of pass p until the time budget is spent; true when done.
    function advancePass(p, budget) {
        const t0 = performance.now();
        let tiles = 0;
        while (p.y < p.h) {
            const left = budget - (performance.now() - t0);
            if (tiles > 0 && left < budget * 0.2) break;
            const tileMs = Math.max(left, budget * 0.25) * (tiles === 0 ? 0.5 : 1);
            const est = estMsPerPixel(p.maxIter, true);
            const px = Math.max(MIN_TILE_PX, tileMs / est);
            const rows = Math.floor(px / p.w);
            if (p.x === 0 && rows >= 1) {
                const y1 = Math.min(p.h, p.y + rows);
                iterateTile(p, 0, p.y, p.w, y1);
                p.y = y1;
            } else {
                const x1 = Math.min(p.w, p.x + Math.floor(px));
                iterateTile(p, p.x, p.y, x1, p.y + 1);
                p.x = x1;
                if (p.x >= p.w) { p.x = 0; p.y++; }
            }
            tiles++;
        }
        return p.y >= p.h;
    }

    function renderMain(now) {
        if (!deepCapable) {
            renderLegacy();
            return true;
        }
        const moving = isMoving(now);
        let p = frame.pass;
        if (p && p.deep && p.gen !== deep.gen) p = null;              // reference changed underneath
        // A stale preview pass is finished (so motion keeps showing progress);
        // a stale full-resolution pass is dropped.
        if (p && p.version !== frame.viewVersion && (!moving || !p.moving)) p = null;
        if (!p) {
            if (frame.viewVersion !== frame.renderedVersion) p = moving ? newPass(movingScale(), true) : newPass(1, false);
            else if (!moving && !frame.full) p = newPass(1, false);
        }
        frame.pass = p;

        if (p && advancePass(p, moving ? MOVING_BUDGET : IDLE_BUDGET)) {
            // Cost varies across the image, so judge resolution by whole passes,
            // and damp outliers (e.g. a pass that waited on other GPU work).
            if (!p.uploaded) {
                const est = estMsPerPixel(p.maxIter);
                const sample = Math.min(2 * est, Math.max(0.5 * est, p.gpuMs / (p.w * p.h)));
                frame.msPerPixel = 0.5 * est + 0.5 * sample;
            }
            frame.pass = null;
            targets.back = targets.front;
            targets.front = p.target;
            frame.renderedVersion = p.version;
            frame.full = p.scale === 1;
            frame.presentedMaxIter = p.maxIter;
            frame.colorDirty = false;
            presentColors();
            return true;
        }

        if (frame.colorDirty || state.colorCycleSpeed > 0) {
            frame.colorDirty = false;
            presentColors();
            return true;
        }
        return false;
    }

    let juliaDirty = true;

    function renderJulia() {
        if (!state.showJulia || !juliaDirty) return;
        juliaDirty = false;
        glJulia.uniform2f(uJulia.uResolution, juliaCanvas.width, juliaCanvas.height);
        glJulia.uniform2f(uJulia.uCenter, 0, 0);
        glJulia.uniform1f(uJulia.uZoom, 3.5);
        glJulia.uniform1f(uJulia.uMaxIter, Math.min(state.maxIter, 512));
        glJulia.uniform1f(uJulia.uColorOffset, state.colorOffset);
        glJulia.uniform1f(uJulia.uColorScale, state.colorScale);
        glJulia.uniform1f(uJulia.uBailout, state.bailout);
        glJulia.uniform1f(uJulia.uExponent, state.exponent);
        glJulia.uniform1i(uJulia.uColorScheme, state.colorScheme);
        glJulia.uniform1i(uJulia.uColorMode, state.colorMode);
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

        ctxOrbit.clearRect(0, 0, w, h);
        if (!state.showCrosshair || !state.mouseScreen) return;

        ctxOrbit.save();
        ctxOrbit.scale(dpr, dpr);
        const [sx, sy] = state.mouseScreen;

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

    function renderMinimapOnce() {
        // Render a static Mandelbrot overview for the minimap
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

        if (right - left < 6) {
            // Too deep to draw a box: mark the location instead
            const x = toMX(state.center[0]), y = toMY(state.center[1]);
            vp.classList.add('dot');
            vp.style.display = x >= 0 && x <= pw && y >= 0 && y <= ph ? 'block' : 'none';
            vp.style.left = x - 4 + 'px';
            vp.style.top = y - 4 + 'px';
            vp.style.width = '8px';
            vp.style.height = '8px';
        } else if (vpWidth > pw || vpHeight > ph || vpWidth < 2 || vpHeight < 2) {
            vp.style.display = 'none';
        } else {
            vp.classList.remove('dot');
            vp.style.display = 'block';
            vp.style.left = vpLeft + 'px';
            vp.style.top = vpTop + 'px';
            vp.style.width = vpWidth + 'px';
            vp.style.height = vpHeight + 'px';
        }
    }

    // ─────────── Iterations ───────────

    const iterSlider = document.getElementById('iterSlider');

    // Iterations needed grow roughly with zoom depth; after a tour, its own
    // schedule is a better guide around that neighborhood.
    function autoIterFor(zoom) {
        const decades = Math.max(0, Math.log10(HOME_ZOOM / zoom));
        const guess = Math.round(256 * Math.pow(1 + decades, 1.25));
        const p = dive.lastPreset;
        return p ? Math.max(guess, Math.round(presetIters(p, Math.max(zoom, p.zoom)))) : guess;
    }

    function setMaxIter(n) {
        n = Math.max(16, Math.min(1 << 21, Math.round(n)));
        if (n === state.maxIter) return;
        state.maxIter = n;
        iterSlider.value = Math.log2(n).toFixed(2);
        document.getElementById('iterValue').textContent = n;
        markViewChanged();
        juliaDirty = true;
    }

    function applyAutoIter() {
        setMaxIter(autoIterFor(state.zoom));
    }

    // ─────────── Deep Dives ───────────

    const PRESETS = window.MANDELBROT_PRESETS || [];
    const diveSelect = document.getElementById('zoomTarget');
    const diveBtn = document.getElementById('autoZoomBtn');

    const dive = {
        active: false,
        paused: false,
        done: false,
        preset: null,
        x: 0,           // decades travelled
        D: 0,           // decades in total
        z0: HOME_ZOOM,
        off0: [0, 0],   // starting view center relative to the target
        aim: [0, 0],    // final view center relative to the target
        speed: 1,
        lastPreset: null,   // most recent tour, whose iteration schedule auto iterations reuse
    };

    const BASE_DECADES_PER_SEC = 0.55;

    // The minibrot a preset dive lands on: { re, im (fixed point), size: [re, im] }.
    let knownMinibrot = null;

    function superscript(n) {
        const map = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
        return String(n).split('').map(ch => map[ch] ?? ch).join('');
    }

    function magnification(zoom) {
        const mag = HOME_ZOOM / zoom;
        return mag < 1000 ? mag.toFixed(mag < 10 ? 1 : 0) + '×' : '10' + superscript(Math.floor(Math.log10(mag))) + '×';
    }

    function populatePresets() {
        diveSelect.innerHTML = '';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'Choose a destination…';
        diveSelect.appendChild(none);
        for (const p of PRESETS) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.name} · ${magnification(p.zoom)}`;
            diveSelect.appendChild(opt);
        }
        const here = document.createElement('option');
        here.value = 'custom';
        here.textContent = 'Current View · dive deeper';
        diveSelect.appendChild(here);
        updateBlurb();
    }

    function updateBlurb() {
        const p = PRESETS.find(p => p.id === diveSelect.value);
        document.getElementById('diveBlurb').textContent = p ? p.blurb :
            diveSelect.value === 'custom' ? 'Zooms straight into the center of the current view.' :
            'Each tour flies from the whole set to a hand-picked spot as deep as 10⁴⁰×, rendered live with perturbation theory.';
    }

    // Log-log interpolation of [zoom, iterations] keyframes.
    function presetIters(p, zoom) {
        const k = p.iters;
        if (zoom >= k[0][0]) return k[0][1];
        for (let i = 1; i < k.length; i++) {
            if (zoom >= k[i][0]) {
                const t = Math.log(zoom / k[i - 1][0]) / Math.log(k[i][0] / k[i - 1][0]);
                return Math.exp(Math.log(k[i - 1][1]) + t * Math.log(k[i][1] / k[i - 1][1]));
            }
        }
        return k[k.length - 1][1];
    }

    function setControl(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function applyPresetLook(p) {
        if (p.palette !== undefined) {
            state.colorScheme = p.palette;
            setControl('colorScheme', p.palette);
        }
        if (p.mapping !== undefined) {
            state.colorMode = p.mapping;
            setControl('colorMode', p.mapping);
        }
        if (p.density !== undefined) {
            state.colorScale = p.density;
            setControl('smoothSlider', Math.log10(p.density).toFixed(2));
            document.getElementById('smoothValue').textContent = formatDensity(p.density);
        }
        markColorsChanged();
    }

    function startDive() {
        if (!diveSelect.value) {
            diveSelect.value = PRESETS.length ? PRESETS[0].id : 'custom';
            updateBlurb();
        }
        if (!deepCapable) showToast('⚠️ Deep zoom needs WebGL2 — dive will stop early');
        const key = diveSelect.value;
        let p = PRESETS.find(p => p.id === key);

        state.exponent = 2;
        setControl('exponentSlider', 2);
        document.getElementById('exponentValue').textContent = '2.0';

        if (p) {
            applyPresetLook(p);
            view.refRe = parseFixed(p.re);
            view.refIm = parseFixed(p.im);
            dive.z0 = HOME_ZOOM;
            dive.off0 = [HOME_CENTER[0] - fixedToDouble(view.refRe), HOME_CENTER[1] - fixedToDouble(view.refIm)];
            dive.aim = p.aim ? [...p.aim] : [0, 0];
            knownMinibrot = p.size ? { re: view.refRe, im: view.refIm, size: p.size } : null;
            state.zoom = HOME_ZOOM;
        } else {
            // Dive into the center of the current view
            view.refRe += doubleToFixed(view.off[0]);
            view.refIm += doubleToFixed(view.off[1]);
            dive.z0 = state.zoom;
            dive.off0 = [0, 0];
            dive.aim = [0, 0];
            knownMinibrot = null;
            const zoom = Math.min(dive.z0 / 10, Math.max(1e-40, distanceToSet() / 3));
            p = { id: 'custom', name: 'Current View', zoom, iters: null };
        }
        view.off = [...dive.off0];
        syncCenter();

        dive.preset = p;
        dive.lastPreset = p.iters ? p : null;
        dive.D = Math.max(0.1, Math.log10(dive.z0 / (deepCapable ? p.zoom : Math.max(p.zoom, 2e-5))));
        dive.x = 0;
        dive.active = true;
        dive.paused = false;
        dive.done = false;
        deep.want = {
            N: p.iters ? Math.round(presetIters(p, p.zoom)) + 2 : 0,
            zoom: p.zoom,
        };
        state.autoIter = !p.iters;
        document.getElementById('autoIterToggle').checked = state.autoIter;
        setMaxIter(p.iters ? presetIters(p, dive.z0) : Math.max(state.maxIter, autoIterFor(dive.z0)));
        // Compute the whole dive's reference orbit up front so it never stalls mid-dive.
        if (deepCapable && p.iters) computeReference(deep.want.N, bitsFor(p.zoom));
        markViewChanged();
        updateDiveUI();
    }

    // Distance estimate from the view center to the set (0 if it doesn't escape
    // quickly). Past that depth the picture would just be flat color.
    function distanceToSet() {
        const P = bitsFor(1e-40), shift = BigInt(HP - P), PB = BigInt(P), P1 = BigInt(P - 1);
        const cr = view.refRe >> shift, ci = view.refIm >> shift;
        const lim = 1000000n << PB, s = 2 ** -P;
        let x = 0n, y = 0n, dx = 0, dy = 0;
        for (let n = 0; n < 50000; n++) {
            const zx = Number(x) * s, zy = Number(y) * s;
            const x2 = (x * x) >> PB, y2 = (y * y) >> PB;
            if (x2 + y2 > lim) {
                const r = Math.hypot(zx, zy);
                return r * Math.log(r) / Math.hypot(dx, dy);
            }
            [dx, dy] = [2 * (zx * dx - zy * dy) + 1, 2 * (zx * dy + zy * dx)];
            const xy = (x * y) >> P1;
            x = x2 - y2 + cr;
            y = xy + ci;
        }
        return 0;
    }

    function stopDive() {
        if (!dive.active) return;
        dive.active = false;
        dive.paused = false;
        updateDiveUI();
    }

    function toggleDive() {
        if (!dive.active) startDive();
        else {
            dive.paused = !dive.paused;
            markViewChanged();
            updateDiveUI();
        }
    }

    function updateDive(dt) {
        if (!dive.active || dive.paused) return;
        const { D } = dive;
        // Ease in over the first decade and out over the last two.
        const ease = Math.min(1, 0.2 + dive.x / 1.0, 0.1 + (D - dive.x) / 2.0);
        dive.x = Math.min(D, dive.x + BASE_DECADES_PER_SEC * dive.speed * ease * Math.min(dt, 0.1));

        // The start point drifts to the target faster than the view shrinks,
        // so the target slides smoothly to the middle of the screen.
        state.zoom = dive.z0 * Math.pow(10, -dive.x);
        const f = Math.pow(state.zoom / dive.z0, 1.5);
        view.off = [dive.off0[0] * f + dive.aim[0], dive.off0[1] * f + dive.aim[1]];
        syncCenter();
        if (dive.preset.iters) setMaxIter(presetIters(dive.preset, state.zoom));
        else setMaxIter(Math.max(state.maxIter, autoIterFor(state.zoom)));
        markViewChanged();

        if (dive.x >= D) {
            dive.active = false;
            dive.done = true;
            showToast(`🎯 ${dive.preset.name} — ${magnification(state.zoom)}`);
        }
        updateDiveUI();
    }

    function updateDiveUI() {
        const bar = document.getElementById('diveProgressBar');
        const status = document.getElementById('diveStatus');
        const frac = dive.D > 0 ? dive.x / dive.D : 0;
        bar.style.width = (dive.active || dive.done ? frac * 100 : 0).toFixed(1) + '%';
        if (dive.active) {
            diveBtn.textContent = dive.paused ? '▶ Resume' : '⏸ Pause';
            diveBtn.classList.toggle('active', !dive.paused);
            status.textContent = `${dive.paused ? 'Paused' : 'Diving'} · ${magnification(state.zoom)} of ${magnification(dive.preset.zoom)}`;
        } else {
            diveBtn.textContent = dive.done ? '↻ Replay' : '▶ Dive';
            diveBtn.classList.remove('active');
            status.textContent = dive.done ? `Arrived at ${magnification(state.zoom)}` :
                diveSelect.value ? 'Ready · press Dive or Space' : 'Pick a destination to begin';
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

        const dt = lastTime ? (time - lastTime) / 1000 : 0;
        lastTime = time;

        // Color cycling
        if (state.colorCycleSpeed > 0) {
            state.colorOffset += state.colorCycleSpeed * dt * 0.1;
            juliaDirty = true;
        }

        updateDive(dt);

        if (renderMain(time)) frameCount++;
        renderJulia();

        // FPS counter
        if (time - fpsTime > 500) {
            document.getElementById('fpsCounter').textContent = frameCount ?
                Math.round(frameCount / ((time - fpsTime) / 1000)) + ' fps' : 'idle';
            frameCount = 0;
            fpsTime = time;
        }

        // Zoom level display
        document.getElementById('zoomLevel').textContent =
            magnification(state.zoom) + (isDeep() ? ' · deep' : '');

        if (state.showOrbit) renderOrbit();
        else if (state.showCrosshair) renderCrosshair();

        updateMinimapViewport();
    }

    // ─────────── Mouse Interaction ───────────

    // Offset of a screen point from the view center, in the complex plane.
    function screenOffset(screenX, screenY) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        return [(screenX / w - 0.5) * state.zoom * aspect, (0.5 - screenY / h) * state.zoom];
    }

    function screenToComplex(screenX, screenY) {
        const d = screenOffset(screenX, screenY);
        return [state.center[0] + d[0], state.center[1] + d[1]];
    }

    // Coordinates with as many digits as the zoom level warrants.
    function formatPoint(screenX, screenY) {
        const pixel = state.zoom / window.innerHeight;
        const digits = Math.max(12, Math.min(140, Math.ceil(-Math.log10(pixel)) + 1));
        if (digits <= 15) {
            const c = screenToComplex(screenX, screenY);
            return `c = ${c[0].toFixed(digits)} ${c[1] >= 0 ? '+' : '−'} ${Math.abs(c[1]).toFixed(digits)}i`;
        }
        const d = screenOffset(screenX, screenY);
        const re = view.refRe + doubleToFixed(view.off[0] + d[0]);
        const im = view.refIm + doubleToFixed(view.off[1] + d[1]);
        const imStr = fixedToString(im, digits);
        return `c = ${fixedToString(re, digits)} ${imStr[0] === '-' ? '−' : '+'} ${imStr.replace('-', '')}i`;
    }

    // Manual navigation ends a tour and hands iterations back to the auto setting.
    function interrupted() {
        if (dive.active || dive.done) {
            state.autoIter = true;
            document.getElementById('autoIterToggle').checked = true;
        }
        stopDive();
        dive.done = false;
        updateDiveUI();
    }

    mandelbrotCanvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        state.isDragging = true;
        state.lastMouse = [e.clientX, e.clientY];
        document.body.classList.add('dragging');
        interrupted();
    });

    window.addEventListener('mousemove', (e) => {
        const c = screenToComplex(e.clientX, e.clientY);
        state.mouseComplex = c;
        state.mouseScreen = [e.clientX, e.clientY];
        state.juliaC = c;
        juliaDirty = true;

        // Update coordinate display
        document.getElementById('coordText').textContent = formatPoint(e.clientX, e.clientY);
        document.getElementById('juliaCoord').textContent =
            `c = ${c[0].toFixed(4)} ${c[1] >= 0 ? '+' : ''}${c[1].toFixed(4)}i`;

        if (state.isDragging) {
            const dx = e.clientX - state.lastMouse[0];
            const dy = e.clientY - state.lastMouse[1];
            const w = window.innerWidth;
            const h = window.innerHeight;
            const aspect = w / h;
            panBy(-dx / w * state.zoom * aspect, dy / h * state.zoom);
            state.lastMouse = [e.clientX, e.clientY];
        }
    });

    window.addEventListener('mouseup', () => {
        if (state.isDragging) markViewChanged();
        state.isDragging = false;
        document.body.classList.remove('dragging');
    });

    // Point-centric zoom
    mandelbrotCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        interrupted();
        zoomAbout(e.clientX, e.clientY, e.deltaY > 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });

    // Touch support
    let lastTouchDist = 0;

    mandelbrotCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        interrupted();
        if (e.touches.length === 1) {
            state.isDragging = true;
            state.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
        } else if (e.touches.length === 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            lastTouchDist = Math.hypot(dx, dy);
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
            panBy(-dx / w * state.zoom * aspect, dy / h * state.zoom);
            state.lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
        } else if (e.touches.length === 2 && lastTouchDist > 0) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const dist = Math.hypot(dx, dy);
            zoomAbout(
                (e.touches[0].clientX + e.touches[1].clientX) / 2,
                (e.touches[0].clientY + e.touches[1].clientY) / 2,
                lastTouchDist / dist);
            lastTouchDist = dist;
        }
    }, { passive: false });

    mandelbrotCanvas.addEventListener('touchend', (e) => {
        state.isDragging = false;
        markViewChanged();
        if (e.touches.length < 2) lastTouchDist = 0;
    });

    // ─────────── Keyboard ───────────

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'SELECT' && e.key !== ' ') return;
        if (e.key === 'h' || e.key === 'H') {
            document.getElementById('controls').classList.toggle('hidden');
        }
        if (e.key === 'j' || e.key === 'J') {
            state.showJulia = !state.showJulia;
            juliaDirty = true;
            document.getElementById('juliaToggle').checked = state.showJulia;
            document.getElementById('juliaPanel').classList.toggle('hidden', !state.showJulia);
        }
        if (e.key === ' ') {
            e.preventDefault();
            toggleDive();
        }
        if (e.key === 'r' || e.key === 'R') {
            resetView();
        }
    });

    // ─────────── UI Controls ───────────

    function formatDensity(v) {
        return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2);
    }

    function bindSlider(id, valueId, apply, format) {
        const slider = document.getElementById(id);
        const display = document.getElementById(valueId);
        slider.addEventListener('input', () => {
            const v = apply(parseFloat(slider.value));
            display.textContent = format ? format(v) : v;
        });
    }

    bindSlider('iterSlider', 'iterValue', v => {
        state.autoIter = false;
        document.getElementById('autoIterToggle').checked = false;
        setMaxIter(Math.pow(2, v));
        return state.maxIter;
    });
    bindSlider('colorCycleSlider', 'colorCycleValue', v => {
        state.colorCycleSpeed = v;
        markColorsChanged();
        return v;
    }, v => v.toFixed(1));
    bindSlider('smoothSlider', 'smoothValue', v => {
        state.colorScale = Math.pow(10, v);
        markColorsChanged();
        return state.colorScale;
    }, formatDensity);
    bindSlider('bailoutSlider', 'bailoutValue', v => {
        state.bailout = Math.round(v);
        markViewChanged();
        juliaDirty = true;
        return state.bailout;
    });
    bindSlider('exponentSlider', 'exponentValue', v => {
        state.exponent = v;
        markViewChanged();
        juliaDirty = true;
        return v;
    }, v => v.toFixed(1));
    bindSlider('diveSpeed', 'diveSpeedValue', v => {
        dive.speed = Math.pow(2, v);
        return dive.speed;
    }, v => (v < 1 ? v.toFixed(2) : v.toFixed(1)) + '×');

    document.getElementById('colorScheme').addEventListener('change', (e) => {
        state.colorScheme = parseInt(e.target.value);
        markColorsChanged();
    });

    document.getElementById('colorMode').addEventListener('change', (e) => {
        state.colorMode = parseInt(e.target.value);
        markColorsChanged();
    });

    document.getElementById('autoIterToggle').addEventListener('change', (e) => {
        state.autoIter = e.target.checked;
        if (state.autoIter) applyAutoIter();
    });

    document.getElementById('juliaToggle').addEventListener('change', (e) => {
        state.showJulia = e.target.checked;
        juliaDirty = true;
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
        if (!state.showCrosshair) ctxOrbit.clearRect(0, 0, orbitCanvas.width, orbitCanvas.height);
    });

    document.getElementById('interiorToggle').addEventListener('change', (e) => {
        state.interiorShading = e.target.checked;
        markViewChanged();
        markColorsChanged();
    });

    diveSelect.addEventListener('change', () => {
        updateBlurb();
        diveSelect.blur();
        if (diveSelect.value) startDive();
    });

    // Keep Space free for pause/resume after clicking a button.
    for (const b of document.querySelectorAll('#controls button')) {
        b.addEventListener('click', () => b.blur());
    }

    diveBtn.addEventListener('click', () => {
        if (dive.done) {
            dive.done = false;
            startDive();
        } else {
            toggleDive();
        }
    });

    function resetView() {
        stopDive();
        dive.done = false;
        diveSelect.value = '';
        updateBlurb();
        dive.lastPreset = null;
        deep.want = { N: 0, zoom: 1 };
        knownMinibrot = null;
        state.zoom = HOME_ZOOM;
        state.colorOffset = 0;
        setCenter(...HOME_CENTER);
        state.autoIter = true;
        document.getElementById('autoIterToggle').checked = true;
        state.maxIter = 0;
        setMaxIter(256);
        markColorsChanged();
        updateDiveUI();
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

    setCenter(...HOME_CENTER);
    resize();
    window.addEventListener('resize', resize);
    populatePresets();
    updateDiveUI();
    renderMinimapOnce();
    requestAnimationFrame(animate);

    // Fade out instructions after 5 seconds
    setTimeout(() => {
        const instr = document.getElementById('instructions');
        if (instr) instr.style.opacity = '0';
    }, 6000);

})();
