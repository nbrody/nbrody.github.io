// ═══════════════════════════════════════════════════
//  Ice Wall — WebGL2 Renderer
//  Voronoi ice-block tessellation layered over
//  domain-warped fbm meltwater, with a vertical
//  waterfall band and optional LED tile grid.
//  Inspired by the LINQ Las Vegas LED entrance.
// ═══════════════════════════════════════════════════

// ─── Vertex Shader ───
const vertexShaderSource = `#version 300 es
in vec2 aPosition;
out vec2 vUV;
void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// ─── Fragment Shader ───
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;

// Flow
uniform float uFlowSpeed;
uniform float uWarp;
uniform float uPatternScale;

// Bricks
uniform float uBrickScale;
uniform float uRimSharpness;
uniform float uCellTint;
uniform float uBrickJitter;

// Waterfall
uniform bool  uWaterfallOn;
uniform float uWaterfallX;
uniform float uWaterfallWidth;
uniform float uWaterfallSpeed;

// Look
uniform float uSparkle;
uniform float uHue;        // radians
uniform bool  uLedGrid;
uniform float uLedDensity;

// ═════════════════════════════════════
//  Hash, value-noise, fBm
// ═════════════════════════════════════

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
    vec3 q = vec3(dot(p, vec2(127.1, 311.7)),
                  dot(p, vec2(269.5, 183.3)),
                  dot(p, vec2(419.2,  371.9)));
    return fract(sin(q.xy) * 43758.5453);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * vnoise(p);
        p = ROT * p * 2.03;
        a *= 0.5;
    }
    return v;
}

// ═════════════════════════════════════
//  Voronoi (Worley) — F1, F2-F1, cell id
//  Returns vec3(F1, F2-F1, cellHash)
// ═════════════════════════════════════
vec3 voronoi(vec2 p, float jitter) {
    vec2 n = floor(p);
    vec2 f = fract(p);
    float d1 = 8.0;
    float d2 = 8.0;
    vec2 closest = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash22(n + g);
            // animate seeds gently so bricks "breathe"
            o = 0.5 + jitter * (sin(uTime * 0.4 + 6.2831 * o) * 0.5);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < d1) {
                d2 = d1; d1 = d;
                closest = n + g;
            } else if (d < d2) {
                d2 = d;
            }
        }
    }
    return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), hash21(closest));
}

// ═════════════════════════════════════
//  Hue rotation (RGB ↔ YIQ trick)
// ═════════════════════════════════════
vec3 hueShift(vec3 col, float a) {
    const mat3 toYIQ = mat3(
        0.299, 0.587, 0.114,
        0.596,-0.274,-0.322,
        0.211,-0.523, 0.312
    );
    const mat3 toRGB = mat3(
        1.0,  0.956,  0.621,
        1.0, -0.272, -0.647,
        1.0, -1.106,  1.703
    );
    vec3 yiq = toYIQ * col;
    float c = cos(a);
    float s = sin(a);
    yiq.yz = mat2(c, -s, s, c) * yiq.yz;
    return toRGB * yiq;
}

void main() {
    vec2 uv = vUV;
    float aspect = uResolution.x / uResolution.y;

    // Use a unit-height coordinate space so brick density is independent of aspect
    vec2 p = vec2(uv.x * aspect, uv.y);
    float t = uTime * uFlowSpeed;

    // ─── Domain-warped fbm (the marbled meltwater) ───
    vec2 q = vec2(
        fbm(p * uPatternScale + vec2(0.0,  t * 0.20)),
        fbm(p * uPatternScale + vec2(5.2, -t * 0.30))
    );
    vec2 r = vec2(
        fbm(p * uPatternScale + uWarp * q + vec2(1.7, 9.2) + t * 0.15),
        fbm(p * uPatternScale + uWarp * q + vec2(8.3, 2.8) - t * 0.10)
    );
    float ice = fbm(p * uPatternScale + uWarp * r);

    // ─── Voronoi brick layer ───
    // Slight drift on the lattice itself so bricks slowly shift
    vec2 vp = p * uBrickScale + vec2(t * 0.04, t * 0.02);
    vec3 vor = voronoi(vp, uBrickJitter);

    // F2-F1 is small near a cell boundary → brighten there for the rim
    float rim = 1.0 - smoothstep(0.0, 0.08 / uRimSharpness, vor.y);
    // Subtle inner shading from F1 (distance from cell center)
    float core = smoothstep(0.0, 0.6, vor.x);

    // ─── Color palette (deep navy → ice blue → snow) ───
    vec3 deep   = vec3(0.025, 0.080, 0.220);
    vec3 mid    = vec3(0.180, 0.420, 0.820);
    vec3 bright = vec3(0.820, 0.940, 1.000);

    vec3 col = mix(deep, mid, smoothstep(0.20, 0.80, ice));
    col = mix(col, bright, pow(clamp(ice, 0.0, 1.0), 3.0));

    // Per-cell hue/value tint (different "blocks" of ice)
    float tint = vor.z - 0.5;
    col *= 1.0 + uCellTint * tint;
    // Slight darken toward cell center to suggest depth
    col *= mix(1.0, 0.85, core * 0.4);

    // Bright rims (the masonry highlight)
    col += rim * vec3(0.55, 0.78, 1.00) * 0.65;

    // ─── Waterfall band ───
    if (uWaterfallOn) {
        float band = 1.0 - smoothstep(0.0, uWaterfallWidth, abs(uv.x - uWaterfallX));
        // Vertical streaks scrolling downward
        vec2 wp = vec2(uv.x * aspect * 3.0, uv.y * 5.0 + t * uWaterfallSpeed);
        float water = fbm(wp + 1.5 * r);
        // Soft glow that dims toward the top of the screen
        float falloff = smoothstep(0.0, 0.35, uv.y) * 0.7 + 0.3;
        vec3 waterCol = mix(mid, bright, smoothstep(0.35, 0.85, water));
        col = mix(col, waterCol, band * falloff);
        // Bright leading edge in the middle of the band
        float core2 = smoothstep(uWaterfallWidth * 0.5, 0.0, abs(uv.x - uWaterfallX));
        col += core2 * smoothstep(0.55, 0.95, water) * vec3(0.6, 0.85, 1.0) * 0.5;
    }

    // ─── Sparkle / pseudo-caustics ───
    float sp = pow(abs(sin((p.x + p.y) * 36.0 + r.x * 8.0 + t * 1.6)), 28.0);
    col += sp * uSparkle * vec3(0.7, 0.9, 1.0);

    // ─── Hue shift for warmer/cooler tweaks ───
    if (abs(uHue) > 0.0001) {
        col = hueShift(col, uHue);
    }

    // ─── Optional LED tile grid (mimic the physical wall) ───
    if (uLedGrid) {
        vec2 g = fract(uv * vec2(uLedDensity * aspect, uLedDensity));
        float gd = max(
            smoothstep(0.0, 0.05, g.x) - smoothstep(0.95, 1.0, g.x),
            smoothstep(0.0, 0.05, g.y) - smoothstep(0.95, 1.0, g.y)
        );
        // multiply: dark hairlines between tiles
        col *= mix(0.78, 1.0, gd);
    }

    // Gentle vignette
    vec2 vc = uv - 0.5;
    float vg = 1.0 - 0.55 * dot(vc, vc);
    col *= vg;

    // Mild contrast lift
    col = pow(clamp(col, 0.0, 1.0), vec3(0.92));

    fragColor = vec4(col, 1.0);
}
`;


// ═══════════════════════════════════════════════════
//  WebGL2 Renderer
// ═══════════════════════════════════════════════════

class IceWallRenderer {
    constructor() {
        this.canvas = document.getElementById('glCanvas');
        this.gl = this.canvas.getContext('webgl2', {
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });

        if (!this.gl) {
            document.body.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:sans-serif"><h2>WebGL 2 is required</h2></div>';
            return;
        }

        // Time
        this.paused = false;
        this.timeAccum = 0;
        this.lastFrameTime = performance.now();

        // Parameters (mirror initial slider values)
        this.flowSpeed = 0.40;
        this.warp = 3.50;
        this.patternScale = 2.20;

        this.brickScale = 9.0;
        this.rimSharpness = 1.00;
        this.cellTint = 0.30;
        this.brickJitter = 0.30;

        this.waterfallOn = true;
        this.waterfallX = 0.50;
        this.waterfallWidth = 0.10;
        this.waterfallSpeed = 3.00;

        this.sparkle = 0.40;
        this.hue = 0.0;
        this.ledGrid = false;
        this.ledDensity = 100;

        // Performance
        this.frameCount = 0;
        this.fpsTime = performance.now();

        this.init();
        this.setupControls();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    init() {
        const gl = this.gl;

        const vs = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Link error:', gl.getProgramInfoLog(this.program));
            return;
        }
        gl.useProgram(this.program);

        // Full-screen quad
        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(this.program, 'aPosition');
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

        // Cache uniform locations
        this.uniforms = {};
        const names = [
            'uTime', 'uResolution',
            'uFlowSpeed', 'uWarp', 'uPatternScale',
            'uBrickScale', 'uRimSharpness', 'uCellTint', 'uBrickJitter',
            'uWaterfallOn', 'uWaterfallX', 'uWaterfallWidth', 'uWaterfallSpeed',
            'uSparkle', 'uHue', 'uLedGrid', 'uLedDensity'
        ];
        for (const name of names) {
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
            console.error('Source:\n' + source.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
        }
        return shader;
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        const el = document.getElementById('resolution');
        if (el) el.textContent = `${this.canvas.width}×${this.canvas.height}`;
    }

    setupControls() {
        // ─── Click canvas to set waterfall X ───
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            this.waterfallX = Math.max(0, Math.min(1, x));
            const slider = document.getElementById('waterfallXSlider');
            const badge = document.getElementById('waterfallXValue');
            if (slider) slider.value = this.waterfallX;
            if (badge) badge.textContent = this.waterfallX.toFixed(2);
        });

        // ─── Keyboard ───
        window.addEventListener('keydown', (e) => {
            if (e.key === 'h' || e.key === 'H') {
                document.getElementById('controls').classList.toggle('hidden');
            }
            if (e.key === ' ') {
                e.preventDefault();
                this.togglePause();
            }
        });

        // ─── Slider bindings ───
        const bindSlider = (id, prop, valueId, format, transform) => {
            const el = document.getElementById(id);
            const badge = document.getElementById(valueId);
            const fmt = format || (v => parseFloat(v).toFixed(2));
            const tx = transform || (v => parseFloat(v));
            el.addEventListener('input', () => {
                this[prop] = tx(el.value);
                badge.textContent = fmt(el.value);
            });
        };

        bindSlider('speedSlider',           'flowSpeed',       'speedValue');
        bindSlider('warpSlider',            'warp',            'warpValue');
        bindSlider('patternSlider',         'patternScale',    'patternValue');
        bindSlider('brickScaleSlider',      'brickScale',      'brickScaleValue', v => parseFloat(v).toFixed(1));
        bindSlider('rimSlider',             'rimSharpness',    'rimValue');
        bindSlider('cellTintSlider',        'cellTint',        'cellTintValue');
        bindSlider('brickJitterSlider',     'brickJitter',     'brickJitterValue');
        bindSlider('waterfallXSlider',      'waterfallX',      'waterfallXValue');
        bindSlider('waterfallWidthSlider',  'waterfallWidth',  'waterfallWidthValue');
        bindSlider('waterfallSpeedSlider',  'waterfallSpeed',  'waterfallSpeedValue');
        bindSlider('sparkleSlider',         'sparkle',         'sparkleValue');
        bindSlider('hueSlider',             'hue',             'hueValue',
            v => `${v}°`,
            v => parseFloat(v) * Math.PI / 180);
        bindSlider('ledDensitySlider',      'ledDensity',      'ledDensityValue', v => `${Math.round(v)}`);

        // ─── Toggles ───
        document.getElementById('waterfallToggle').addEventListener('change', (e) => {
            this.waterfallOn = e.target.checked;
        });

        const ledToggle = document.getElementById('ledGridToggle');
        const ledGroup  = document.getElementById('ledDensityGroup');
        const setLedGroupOpacity = () => {
            ledGroup.style.opacity = this.ledGrid ? '1' : '0.35';
            ledGroup.style.pointerEvents = this.ledGrid ? 'auto' : 'none';
        };
        setLedGroupOpacity();
        ledToggle.addEventListener('change', (e) => {
            this.ledGrid = e.target.checked;
            setLedGroupOpacity();
        });

        // ─── Pause ───
        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.togglePause();
        });

        // ─── Screenshot ───
        document.getElementById('screenshotBtn').addEventListener('click', () => {
            this.canvas.toBlob((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `ice_wall_${Date.now()}.png`;
                a.click();
                URL.revokeObjectURL(a.href);
            });
        });

        // Fade out instructions after 6s
        setTimeout(() => {
            const inst = document.getElementById('instructions');
            if (inst) inst.style.opacity = '0';
        }, 6000);
    }

    togglePause() {
        this.paused = !this.paused;
        const btn = document.getElementById('pauseBtn');
        if (this.paused) {
            btn.textContent = '▶ Play';
            btn.classList.add('paused');
        } else {
            btn.textContent = '⏸ Pause';
            btn.classList.remove('paused');
            this.lastFrameTime = performance.now();
        }
    }

    animate() {
        const now = performance.now();
        const gl = this.gl;

        if (!this.paused) {
            const dt = (now - this.lastFrameTime) * 0.001;
            this.timeAccum += dt;
        }
        this.lastFrameTime = now;

        // Set uniforms
        gl.uniform1f(this.uniforms.uTime, this.timeAccum);
        gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);

        gl.uniform1f(this.uniforms.uFlowSpeed, this.flowSpeed);
        gl.uniform1f(this.uniforms.uWarp, this.warp);
        gl.uniform1f(this.uniforms.uPatternScale, this.patternScale);

        gl.uniform1f(this.uniforms.uBrickScale, this.brickScale);
        gl.uniform1f(this.uniforms.uRimSharpness, this.rimSharpness);
        gl.uniform1f(this.uniforms.uCellTint, this.cellTint);
        gl.uniform1f(this.uniforms.uBrickJitter, this.brickJitter);

        gl.uniform1i(this.uniforms.uWaterfallOn, this.waterfallOn ? 1 : 0);
        gl.uniform1f(this.uniforms.uWaterfallX, this.waterfallX);
        gl.uniform1f(this.uniforms.uWaterfallWidth, this.waterfallWidth);
        gl.uniform1f(this.uniforms.uWaterfallSpeed, this.waterfallSpeed);

        gl.uniform1f(this.uniforms.uSparkle, this.sparkle);
        gl.uniform1f(this.uniforms.uHue, this.hue);
        gl.uniform1i(this.uniforms.uLedGrid, this.ledGrid ? 1 : 0);
        gl.uniform1f(this.uniforms.uLedDensity, this.ledDensity);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // FPS counter
        this.frameCount++;
        if (now - this.fpsTime > 500) {
            const fps = Math.round(this.frameCount / ((now - this.fpsTime) / 1000));
            const el = document.getElementById('fpsCounter');
            if (el) el.textContent = `${fps} fps`;
            this.frameCount = 0;
            this.fpsTime = now;
        }

        requestAnimationFrame(() => this.animate());
    }
}

new IceWallRenderer();
