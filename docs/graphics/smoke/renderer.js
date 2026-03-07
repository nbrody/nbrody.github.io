// ═══════════════════════════════════════════════════
//  Domain Warping Smoke — WebGL2 Renderer
//  Based on Inigo Quilez's warp technique
//  https://iquilezles.org/articles/warp
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
// Adapted from Inigo Quilez's domain warping demo
// https://www.shadertoy.com/view/MdSXzz
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uPan;
uniform float uZoom;

// Noise / Warp
uniform float uPatternScale;
uniform float uWarpStrength;
uniform float uTurbulence;

// Lighting
uniform bool  uLighting;
uniform float uLightAngle;
uniform bool  uInvert;

// Palette
uniform int   uPalette;
uniform float uContrast;
uniform float uBrightness;

// ═════════════════════════════════════
//  IQ Noise & FBM
// ═════════════════════════════════════

const mat2 m = mat2( 0.80,  0.60, -0.60,  0.80 );

float noise( in vec2 p )
{
    return sin(p.x)*sin(p.y);
}

float fbm4( vec2 p )
{
    float f = 0.0;
    f += 0.5000*noise( p ); p = m*p*2.02;
    f += 0.2500*noise( p ); p = m*p*2.03;
    f += 0.1250*noise( p ); p = m*p*2.01;
    f += 0.0625*noise( p );
    return f/0.9375;
}

float fbm6( vec2 p )
{
    float f = 0.0;
    f += 0.500000*(0.5+0.5*noise( p )); p = m*p*2.02;
    f += 0.250000*(0.5+0.5*noise( p )); p = m*p*2.03;
    f += 0.125000*(0.5+0.5*noise( p )); p = m*p*2.01;
    f += 0.062500*(0.5+0.5*noise( p )); p = m*p*2.04;
    f += 0.031250*(0.5+0.5*noise( p )); p = m*p*2.01;
    f += 0.015625*(0.5+0.5*noise( p ));
    return f/0.96875;
}

vec2 fbm4_2( vec2 p )
{
    return vec2(fbm4(p), fbm4(p+vec2(7.8)));
}

vec2 fbm6_2( vec2 p )
{
    return vec2(fbm6(p+vec2(16.8)), fbm6(p+vec2(11.5)));
}

// ═════════════════════════════════════
//  Palette Functions (IQ Cosine Palettes)
// ═════════════════════════════════════

vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

vec3 paletteColor(float f, vec4 on) {
    vec3 col = vec3(0.0);

    if (uPalette == 0) {
        // Original IQ palette — smoky embers
        col = mix( vec3(0.2,0.1,0.4), vec3(0.3,0.05,0.05), f );
        col = mix( col, vec3(0.9,0.9,0.9), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.4,0.3,0.3), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.0,0.2,0.4), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }
    else if (uPalette == 1) {
        // Cobalt Deep
        col = mix( vec3(0.02,0.05,0.18), vec3(0.05,0.15,0.35), f );
        col = mix( col, vec3(0.6,0.75,0.95), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.15,0.25,0.45), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.0,0.35,0.55), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }
    else if (uPalette == 2) {
        // Jade Fire
        col = mix( vec3(0.04,0.15,0.08), vec3(0.15,0.35,0.05), f );
        col = mix( col, vec3(0.95,0.85,0.55), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.3,0.4,0.15), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.5,0.25,0.02), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }
    else if (uPalette == 3) {
        // Infrared
        col = mix( vec3(0.35,0.02,0.08), vec3(0.55,0.12,0.02), f );
        col = mix( col, vec3(1.0,0.7,0.3), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.5,0.15,0.1), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.9,0.45,0.05), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }
    else if (uPalette == 4) {
        // Void
        col = mix( vec3(0.06,0.04,0.12), vec3(0.18,0.08,0.25), f );
        col = mix( col, vec3(0.65,0.5,0.85), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.25,0.15,0.35), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.40,0.15,0.55), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }
    else if (uPalette == 5) {
        // Monochrome Silk
        float v = f;
        col = mix( vec3(0.08), vec3(0.35), v );
        col = mix( col, vec3(0.85), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.3), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.5), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }
    else {
        // Sunset Ocean
        col = mix( vec3(0.05,0.08,0.2), vec3(0.45,0.15,0.08), f );
        col = mix( col, vec3(0.95,0.6,0.3), dot(on.zw,on.zw) );
        col = mix( col, vec3(0.2,0.25,0.4), 0.2 + 0.5*on.y*on.y );
        col = mix( col, vec3(0.6,0.2,0.4), 0.5*smoothstep(1.2,1.3,abs(on.z)+abs(on.w)) );
    }

    return col;
}

// ═════════════════════════════════════
//  Main warp function
// ═════════════════════════════════════

float func( vec2 q, out vec4 ron )
{
    q += uTurbulence * sin( vec2(0.27,0.23)*uTime + length(q)*vec2(4.1,4.3));

    vec2 o = fbm4_2( uPatternScale * q );

    o += 0.04*sin( vec2(0.12,0.14)*uTime + length(o));

    vec2 n = fbm6_2( uWarpStrength * o );

    ron = vec4( o, n );

    float f = 0.5 + 0.5*fbm4( 1.8*q + 6.0*n );

    return mix( f, f*f*f*3.5, f*abs(n.x) );
}

// ═════════════════════════════════════
//  mainImage (adapted from IQ)
// ═════════════════════════════════════

void main()
{
    vec2 fragCoord = vUV * uResolution;
    vec2 p = (2.0*fragCoord - uResolution.xy) / uResolution.y;

    // Pan & zoom
    p = p / uZoom + uPan;

    float e = 2.0/uResolution.y;

    vec4 on = vec4(0.0);
    float f = func(p, on);

    vec3 col = paletteColor(f, on);

    col = clamp( col*f*uContrast, 0.0, 1.0 );

    if (uLighting) {
        // Manual derivatives for relief lighting
        vec4 kk;
        vec3 nor = normalize( vec3(
            func(p+vec2(e,0.0),kk)-f,
            2.0*e,
            func(p+vec2(0.0,e),kk)-f
        ));

        float la = uLightAngle;
        vec3 lig = normalize( vec3( cos(la)*0.9, 0.2, sin(la)*-0.4 ) );
        float dif = clamp( 0.3+0.7*dot( nor, lig ), 0.0, 1.0 );
        vec3 lin = vec3(0.70,0.90,0.95)*(nor.y*0.5+0.5) + vec3(0.15,0.10,0.05)*dif;
        col *= uBrightness * lin;
    } else {
        col *= uBrightness;
    }

    if (uInvert) {
        col = 1.0 - col;
        col = 1.1*col*col;
    }

    // Vignette
    vec2 uv = vUV;
    float vig = 1.0 - 0.25 * dot((uv-0.5)*1.5, (uv-0.5)*1.5);
    col *= vig;

    fragColor = vec4( col, 1.0 );
}
`;


// ═══════════════════════════════════════════════════
//  Palette Definitions for UI
// ═══════════════════════════════════════════════════

const PALETTES = [
    { name: 'Smoke Ember', colors: ['#331a66', '#4d0d0d', '#e6e6e6', '#664d4d', '#004d66'] },
    { name: 'Cobalt Deep', colors: ['#050d2e', '#0d2659', '#99bff2', '#263d73', '#005988'] },
    { name: 'Jade Fire', colors: ['#0a2614', '#26590d', '#f2d98c', '#4d661a', '#803305'] },
    { name: 'Infrared', colors: ['#590514', '#8c1f05', '#ffb34d', '#80261a', '#e6730d'] },
    { name: 'Void', colors: ['#0f0a1f', '#2e1440', '#a680d9', '#40264d', '#66268c'] },
    { name: 'Silk', colors: ['#141414', '#595959', '#d9d9d9', '#4d4d4d', '#808080'] },
    { name: 'Sunset Ocean', colors: ['#0d1433', '#732614', '#f2994d', '#334066', '#993366'] },
];


// ═══════════════════════════════════════════════════
//  WebGL2 Renderer
// ═══════════════════════════════════════════════════

class SmokeRenderer {
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

        // Pan & zoom state
        this.pan = [0, 0];
        this.zoom = 1.0;

        // Mouse interaction
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };

        // Time
        this.paused = false;
        this.timeAccum = 0;
        this.lastFrameTime = performance.now();

        // Parameters
        this.patternScale = 0.9;
        this.warpStrength = 3.0;
        this.speed = 1.0;
        this.turbulence = 0.03;
        this.lighting = true;
        this.lightAngle = 0.0;
        this.invert = true;
        this.palette = 0;
        this.contrast = 2.0;
        this.brightness = 1.1;

        // Performance
        this.frameCount = 0;
        this.fpsTime = performance.now();

        this.init();
        this.setupPaletteSwatches();
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
            'uTime', 'uResolution', 'uPan', 'uZoom',
            'uPatternScale', 'uWarpStrength', 'uTurbulence',
            'uLighting', 'uLightAngle', 'uInvert',
            'uPalette', 'uContrast', 'uBrightness'
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
            console.error('Source:', source.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
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

        document.getElementById('resolution').textContent =
            `${this.canvas.width}×${this.canvas.height}`;
    }

    setupPaletteSwatches() {
        const container = document.getElementById('paletteSwatches');
        PALETTES.forEach((pal, i) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
            swatch.title = pal.name;

            // Create a mini gradient from the palette colors
            const gradient = `linear-gradient(135deg, ${pal.colors[0]}, ${pal.colors[1]}, ${pal.colors[2]})`;
            swatch.style.background = gradient;

            swatch.addEventListener('click', () => {
                this.palette = i;
                container.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            });

            container.appendChild(swatch);
        });
    }

    setupControls() {
        const canvas = this.canvas;

        // ─── Mouse drag for pan ───
        canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            const aspect = this.canvas.width / this.canvas.height;
            this.pan[0] -= dx * 2.0 / (this.canvas.height * this.zoom) * (window.devicePixelRatio || 1);
            this.pan[1] += dy * 2.0 / (this.canvas.height * this.zoom) * (window.devicePixelRatio || 1);
            this.lastMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // ─── Touch support ───
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            this.isDragging = true;
            this.lastMouse = { x: t.clientX, y: t.clientY };
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.isDragging) return;
            const t = e.touches[0];
            const dx = t.clientX - this.lastMouse.x;
            const dy = t.clientY - this.lastMouse.y;
            this.pan[0] -= dx * 2.0 / (this.canvas.height * this.zoom) * (window.devicePixelRatio || 1);
            this.pan[1] += dy * 2.0 / (this.canvas.height * this.zoom) * (window.devicePixelRatio || 1);
            this.lastMouse = { x: t.clientX, y: t.clientY };
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            this.isDragging = false;
        });

        // ─── Scroll to zoom ───
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.92 : 1.087;
            this.zoom = Math.max(0.1, Math.min(20, this.zoom * factor));
        }, { passive: false });

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
        const bindSlider = (id, prop, valueId, format = v => v) => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                this[prop] = parseFloat(el.value);
                document.getElementById(valueId).textContent = format(el.value);
            });
        };

        bindSlider('scaleSlider', 'patternScale', 'scaleValue', v => parseFloat(v).toFixed(2));
        bindSlider('warpStrSlider', 'warpStrength', 'warpStrValue', v => parseFloat(v).toFixed(2));
        bindSlider('speedSlider', 'speed', 'speedValue', v => parseFloat(v).toFixed(2));
        bindSlider('turbSlider', 'turbulence', 'turbValue', v => parseFloat(v).toFixed(3));
        bindSlider('contrastSlider', 'contrast', 'contrastValue', v => parseFloat(v).toFixed(2));
        bindSlider('brightnessSlider', 'brightness', 'brightnessValue', v => parseFloat(v).toFixed(2));
        bindSlider('lightAngleSlider', 'lightAngle', 'lightAngleValue', v => `${v}°`);

        // Convert angle to radians internally
        const lightAngleEl = document.getElementById('lightAngleSlider');
        const origHandler = lightAngleEl.oninput;
        lightAngleEl.addEventListener('input', () => {
            this.lightAngle = parseFloat(lightAngleEl.value) * Math.PI / 180;
        });

        // ─── Toggle bindings ───
        document.getElementById('lightingToggle').addEventListener('change', (e) => {
            this.lighting = e.target.checked;
            document.getElementById('lightAngleGroup').style.opacity = e.target.checked ? '1' : '0.3';
            document.getElementById('lightAngleGroup').style.pointerEvents = e.target.checked ? 'auto' : 'none';
        });

        document.getElementById('invertToggle').addEventListener('change', (e) => {
            this.invert = e.target.checked;
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
                a.download = `smoke_warp_${Date.now()}.png`;
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

        // Accumulate time with speed factor
        if (!this.paused) {
            const dt = (now - this.lastFrameTime) * 0.001;
            this.timeAccum += dt * this.speed;
        }
        this.lastFrameTime = now;

        // Set uniforms
        gl.uniform1f(this.uniforms.uTime, this.timeAccum);
        gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.uniforms.uPan, this.pan[0], this.pan[1]);
        gl.uniform1f(this.uniforms.uZoom, this.zoom);

        gl.uniform1f(this.uniforms.uPatternScale, this.patternScale);
        gl.uniform1f(this.uniforms.uWarpStrength, this.warpStrength);
        gl.uniform1f(this.uniforms.uTurbulence, this.turbulence);

        gl.uniform1i(this.uniforms.uLighting, this.lighting ? 1 : 0);
        gl.uniform1f(this.uniforms.uLightAngle, this.lightAngle);
        gl.uniform1i(this.uniforms.uInvert, this.invert ? 1 : 0);

        gl.uniform1i(this.uniforms.uPalette, this.palette);
        gl.uniform1f(this.uniforms.uContrast, this.contrast);
        gl.uniform1f(this.uniforms.uBrightness, this.brightness);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // FPS counter
        this.frameCount++;
        if (now - this.fpsTime > 500) {
            const fps = Math.round(this.frameCount / ((now - this.fpsTime) / 1000));
            document.getElementById('fpsCounter').textContent = `${fps} fps`;
            this.frameCount = 0;
            this.fpsTime = now;
        }

        requestAnimationFrame(() => this.animate());
    }
}

// Initialize
new SmokeRenderer();
