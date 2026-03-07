// ═══════════════════════════════════════════════════
//  Fractal Raymarcher — IQ-Inspired Techniques
//  Signed Distance Functions, Orbit Traps, AO,
//  Soft Shadows, Volumetric Glow
// ═══════════════════════════════════════════════════

// ──────────── Vertex Shader ────────────
const vertexShaderSource = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUV;
void main() {
    vUV = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// ──────────── Fragment Shader ────────────
const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

// Uniforms
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform vec3 uCameraTarget;
uniform float uPower;         // Mandelbulb power
uniform int uIterations;
uniform float uAOIntensity;
uniform float uGlowIntensity;
uniform int uFractalType;     // 0=Mandelbulb, 1=Mandelbox, 2=KaleidoIFS, 3=Sierpinski
uniform int uColorScheme;
uniform bool uSoftShadows;
uniform bool uOrbitTrap;
uniform bool uDomainWarp;
uniform float uWarpAmount;

// ═══════════════════════════════════════
//  IQ Utility Functions
// ═══════════════════════════════════════

// IQ's palette function — procedural cosine palettes
// https://iquilezles.org/articles/palettes/
vec3 iqPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.28318 * (c * t + d));
}

// Color scheme palettes
vec3 getColor(float t, int scheme) {
    t = fract(t);
    if (scheme == 0) { // Magma
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 0.7, 0.4),
            vec3(0.0, 0.15, 0.20));
    } else if (scheme == 1) { // Ocean Deep
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 1.0),
            vec3(0.0, 0.10, 0.20));
    } else if (scheme == 2) { // Neon Circuit
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(2.0, 1.0, 0.0),
            vec3(0.5, 0.20, 0.25));
    } else if (scheme == 3) { // Sunrise
        return iqPalette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 1.0, 0.5),
            vec3(0.80, 0.90, 0.30));
    } else { // Monochrome
        float v = 0.5 + 0.5 * cos(6.28318 * t);
        return vec3(v * 0.95, v * 0.93, v * 1.0);
    }
}

// IQ's smooth minimum — polynomial smooth union
// https://iquilezles.org/articles/smin/
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Rotation matrix
mat2 rot2(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// ═══════════════════════════════════════
//  IQ Domain Warping — Value Noise + FBM
//  https://iquilezles.org/articles/warp/
// ═══════════════════════════════════════

// IQ's hash for 3D noise
vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// IQ's 3D value noise with quintic interpolation
float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    // Quintic Hermite for C2 continuity (IQ's preference over cubic)
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                       dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                       dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                       dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                       dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// FBM — 4 octaves of gradient noise
float fbm(vec3 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 4; i++) {
        val += amp * noise3(p * freq);
        freq *= 2.07; // slightly irrational to avoid tiling artifacts
        amp *= 0.5;
    }
    return val;
}

// IQ-style recursive domain warp: f(p + fbm(p + fbm(p)))
vec3 domainWarp(vec3 p) {
    float t = uTime * 0.08;
    // First warp layer
    vec3 q = vec3(
        fbm(p + vec3(0.0, 0.0, 0.0) + t * 0.3),
        fbm(p + vec3(5.2, 1.3, 2.8) + t * 0.2),
        fbm(p + vec3(1.7, 9.2, 4.1) + t * 0.25)
    );
    // Second warp layer — warp of the warp (IQ's key insight)
    vec3 r = vec3(
        fbm(p + 4.0 * q + vec3(1.7, 9.2, 0.0) + t * 0.15),
        fbm(p + 4.0 * q + vec3(8.3, 2.8, 4.3) + t * 0.12),
        fbm(p + 4.0 * q + vec3(2.1, 6.5, 3.2) + t * 0.18)
    );
    return p + uWarpAmount * r;
}

// ═══════════════════════════════════════
//  Fractal Distance Estimators
// ═══════════════════════════════════════

// Global orbit trap accumulator
vec4 orbitTrapValue;

// ─── Mandelbulb DE ───
// Based on IQ's power-N Mandelbulb
// https://iquilezles.org/articles/mandelbulb/
float mandelbulbDE(vec3 pos) {
    vec3 z = pos;
    float dr = 1.0;
    float r = 0.0;
    float power = uPower;
    orbitTrapValue = vec4(1e10);

    for (int i = 0; i < 24; i++) {
        if (i >= uIterations) break;
        r = length(z);
        if (r > 4.0) break;

        // Orbit trap — track minimum distances to geometric primitives
        orbitTrapValue.x = min(orbitTrapValue.x, abs(z.x));
        orbitTrapValue.y = min(orbitTrapValue.y, abs(z.y));
        orbitTrapValue.z = min(orbitTrapValue.z, abs(z.z));
        orbitTrapValue.w = min(orbitTrapValue.w, length(z.xz));

        // Convert to spherical coordinates
        float theta = acos(z.z / r);
        float phi = atan(z.y, z.x);

        // Scale the running derivative
        dr = pow(r, power - 1.0) * power * dr + 1.0;

        // Power formula
        float zr = pow(r, power);
        theta = theta * power;
        phi = phi * power;

        // Convert back to cartesian
        z = zr * vec3(sin(theta) * cos(phi),
                      sin(theta) * sin(phi),
                      cos(theta));
        z += pos;
    }
    return 0.5 * log(r) * r / dr;
}

// ─── Mandelbox DE ───
// The Mandelbox with IQ-style fold operations
float mandelboxDE(vec3 pos) {
    float scale = -2.8 + 0.3 * sin(uTime * 0.15);
    float fixedRadius2 = 1.0;
    float minRadius2 = 0.25;
    float foldLimit = 1.0;

    vec4 z = vec4(pos, 1.0);
    orbitTrapValue = vec4(1e10);

    for (int i = 0; i < 24; i++) {
        if (i >= uIterations) break;

        // Box fold: fold each component to [-1, 1]
        z.xyz = clamp(z.xyz, -foldLimit, foldLimit) * 2.0 - z.xyz;

        // Sphere fold: fold to minimum radius
        float r2 = dot(z.xyz, z.xyz);
        if (r2 < minRadius2) {
            float temp = fixedRadius2 / minRadius2;
            z *= temp;
        } else if (r2 < fixedRadius2) {
            float temp = fixedRadius2 / r2;
            z *= temp;
        }

        z = z * scale + vec4(pos, 1.0);

        // Orbit trap
        orbitTrapValue.x = min(orbitTrapValue.x, abs(z.x));
        orbitTrapValue.y = min(orbitTrapValue.y, abs(z.y));
        orbitTrapValue.z = min(orbitTrapValue.z, abs(z.z));
        orbitTrapValue.w = min(orbitTrapValue.w, dot(z.xyz, z.xyz));
    }
    return length(z.xyz) / z.w;
}

// ─── Kaleidoscopic IFS ───
// Combines reflections, rotations, and scaling like IQ's IFS fractals
float kaleidoIFS_DE(vec3 pos) {
    float scale = 2.0;
    vec3 offset = vec3(1.0, 1.0, 1.0);
    orbitTrapValue = vec4(1e10);

    float t = uTime * 0.1;
    mat2 rotXZ = rot2(0.4 + t * 0.2);
    mat2 rotYZ = rot2(0.7 + t * 0.15);

    for (int i = 0; i < 24; i++) {
        if (i >= uIterations) break;

        // Tetrahedral symmetry folds
        pos = abs(pos);
        if (pos.x - pos.y < 0.0) pos.xy = pos.yx;
        if (pos.x - pos.z < 0.0) pos.xz = pos.zx;
        if (pos.y - pos.z < 0.0) pos.yz = pos.zy;

        // Apply rotations between folds
        pos.xz = rotXZ * pos.xz;
        pos.yz = rotYZ * pos.yz;

        // Scale and translate
        pos = scale * pos - offset * (scale - 1.0);

        // Orbit trap
        orbitTrapValue.x = min(orbitTrapValue.x, abs(pos.x));
        orbitTrapValue.y = min(orbitTrapValue.y, abs(pos.y));
        orbitTrapValue.z = min(orbitTrapValue.z, abs(pos.z));
        orbitTrapValue.w = min(orbitTrapValue.w, length(pos));
    }
    return (length(pos) - 1.5) * pow(scale, -float(uIterations));
}

// ─── Sierpinski Tetrahedron ───
// IQ-style iterated tetrahedron DE
float sierpinskiDE(vec3 pos) {
    float scale = 2.0;
    orbitTrapValue = vec4(1e10);

    for (int i = 0; i < 24; i++) {
        if (i >= uIterations) break;

        // Fold space to generate tetrahedral symmetry
        if (pos.x + pos.y < 0.0) pos.xy = -pos.yx;
        if (pos.x + pos.z < 0.0) pos.xz = -pos.zx;
        if (pos.y + pos.z < 0.0) pos.yz = -pos.zy;

        pos = pos * scale - vec3(1.0) * (scale - 1.0);

        // Orbit trap
        orbitTrapValue.x = min(orbitTrapValue.x, abs(pos.x));
        orbitTrapValue.y = min(orbitTrapValue.y, abs(pos.y));
        orbitTrapValue.z = min(orbitTrapValue.z, abs(pos.z));
        orbitTrapValue.w = min(orbitTrapValue.w, length(pos));
    }
    return (length(pos) - 1.0) * pow(scale, -float(uIterations));
}

// ─── Raw fractal DE (no warp) ───
float fractalDE(vec3 p) {
    if (uFractalType == 0)      return mandelbulbDE(p);
    else if (uFractalType == 1) return mandelboxDE(p);
    else if (uFractalType == 2) return kaleidoIFS_DE(p);
    else                        return sierpinskiDE(p);
}

// ─── Unified scene DE with optional domain warp ───
float sceneSDF(vec3 p) {
    if (uDomainWarp) {
        vec3 wp = domainWarp(p);
        return fractalDE(wp);
    }
    return fractalDE(p);
}

// ═══════════════════════════════════════
//  IQ Rendering Techniques
// ═══════════════════════════════════════

// Normal estimation via tetrahedron technique (IQ)
// https://iquilezles.org/articles/normalsSDF/
vec3 calcNormal(vec3 p) {
    const vec2 e = vec2(0.0005, -0.0005);
    return normalize(
        e.xyy * sceneSDF(p + e.xyy) +
        e.yyx * sceneSDF(p + e.yyx) +
        e.yxy * sceneSDF(p + e.yxy) +
        e.xxx * sceneSDF(p + e.xxx)
    );
}

// Ambient occlusion (IQ technique)
// https://iquilezles.org/articles/rmshadows/
float calcAO(vec3 pos, vec3 nor) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.01 + 0.12 * float(i) / 4.0;
        float d = sceneSDF(pos + h * nor);
        occ += (h - d) * sca;
        sca *= 0.95;
        if (occ > 0.35) break;
    }
    return clamp(1.0 - 3.0 * occ * uAOIntensity, 0.0, 1.0);
}

// Soft shadows (IQ technique)
// https://iquilezles.org/articles/rmshadows/
float calcSoftShadow(vec3 ro, vec3 rd, float mint, float maxt) {
    if (!uSoftShadows) return 1.0;

    float res = 1.0;
    float t = mint;
    float ph = 1e20;

    for (int i = 0; i < 32; i++) {
        float h = sceneSDF(ro + rd * t);
        if (h < 0.0001) return 0.0;

        // IQ's improved soft shadow
        float y = h * h / (2.0 * ph);
        float d = sqrt(max(0.0, h * h - y * y));
        res = min(res, 10.0 * d / max(0.001, t - y));
        ph = h;

        t += clamp(h, 0.005, 0.5);
        if (t > maxt) break;
    }
    return clamp(res, 0.0, 1.0);
}

// ═══════════════════════════════════════
//  Camera & Raymarching
// ═══════════════════════════════════════

// IQ's camera matrix construction
mat3 setCamera(vec3 ro, vec3 ta, float cr) {
    vec3 cw = normalize(ta - ro);
    vec3 cp = vec3(sin(cr), cos(cr), 0.0);
    vec3 cu = normalize(cross(cw, cp));
    vec3 cv = normalize(cross(cu, cw));
    return mat3(cu, cv, cw);
}

// Raymarching with glow accumulation
struct MarchResult {
    float t;
    float glow;
    bool hit;
};

MarchResult rayMarch(vec3 ro, vec3 rd) {
    MarchResult res;
    res.t = 0.0;
    res.glow = 0.0;
    res.hit = false;

    float tmax = 20.0;

    for (int i = 0; i < 128; i++) {
        vec3 p = ro + rd * res.t;
        float d = sceneSDF(p);

        // Accumulate glow based on proximity (IQ volumetric trick)
        res.glow += exp(-d * 8.0) * 0.015;

        if (d < 0.0002 * res.t) {
            res.hit = true;
            break;
        }
        res.t += d;
        if (res.t > tmax) break;
    }
    return res;
}

// ═══════════════════════════════════════
//  Main Render
// ═══════════════════════════════════════

vec3 render(vec3 ro, vec3 rd) {
    // Background gradient (subtle)
    vec3 bg = mix(vec3(0.01, 0.01, 0.02), vec3(0.04, 0.02, 0.06), 
                  0.5 + 0.5 * rd.y);

    MarchResult mr = rayMarch(ro, rd);

    vec3 col = bg;

    if (mr.hit) {
        vec3 p = ro + rd * mr.t;
        vec3 n = calcNormal(p);

        // Recall orbit trap from the last DE call
        vec4 trap = orbitTrapValue;

        // ─── Material / Coloring ───
        vec3 baseColor;
        if (uOrbitTrap) {
            // Orbit trap coloring — map trap distances to palette
            float trapDist = min(min(trap.x, trap.y), min(trap.z, trap.w));
            baseColor = getColor(trapDist * 2.0 + 0.1, uColorScheme);

            // Modulate by trap components for variation
            baseColor *= 0.5 + 0.5 * vec3(
                1.0 - clamp(trap.x * 3.0, 0.0, 1.0),
                1.0 - clamp(trap.y * 3.0, 0.0, 1.0),
                1.0 - clamp(trap.z * 3.0, 0.0, 1.0)
            );
        } else {
            // Simple normal-based coloring
            baseColor = getColor(dot(n, vec3(0.5, 0.7, 0.3)) * 0.5 + 0.5, uColorScheme);
        }

        // ─── Lighting ───
        // Key light
        vec3 lightDir = normalize(vec3(0.6, 0.8, -0.5));
        float dif = clamp(dot(n, lightDir), 0.0, 1.0);

        // Soft shadow on key light
        float sha = calcSoftShadow(p + n * 0.002, lightDir, 0.01, 3.0);
        dif *= sha;

        // Fill light (cool tones)
        float fil = clamp(0.5 + 0.5 * dot(n, vec3(-0.6, 0.3, 0.5)), 0.0, 1.0);

        // Fresnel rim
        float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);

        // Ambient occlusion
        float ao = calcAO(p, n);

        // Combine lighting
        vec3 lin = vec3(0.0);
        lin += 2.5 * dif * vec3(1.0, 0.92, 0.85);         // Key light
        lin += 0.5 * fil * vec3(0.45, 0.55, 0.8) * ao;     // Fill light
        lin += 0.3 * fre * vec3(0.7, 0.6, 0.9) * ao;       // Rim
        lin += 0.15 * ao * vec3(0.3, 0.3, 0.4);             // Ambient

        col = baseColor * lin;

        // Specular highlights
        vec3 hal = normalize(lightDir - rd);
        float spe = pow(clamp(dot(n, hal), 0.0, 1.0), 32.0) * dif;
        col += 0.15 * spe * vec3(1.0, 0.95, 0.9);

        // Distance fog (IQ exponential fog)
        float fog = 1.0 - exp(-0.08 * mr.t * mr.t);
        col = mix(col, bg, fog);
    }

    // Volumetric glow
    vec3 glowColor = getColor(uTime * 0.05, uColorScheme) * 0.7 + 0.3;
    col += mr.glow * glowColor * uGlowIntensity;

    return col;
}

void main() {
    vec2 fragCoord = vUV * uResolution;
    vec2 p = (2.0 * fragCoord - uResolution) / uResolution.y;

    // Camera setup
    mat3 ca = setCamera(uCameraPos, uCameraTarget, 0.0);

    // IQ-standard: 2.0 focal length for moderate FOV
    vec3 rd = ca * normalize(vec3(p, 2.0));

    vec3 col = render(uCameraPos, rd);

    // Tone mapping (IQ's Reinhard)
    col = col / (1.0 + col);

    // Gamma correction
    col = pow(col, vec3(0.4545));

    // Vignette
    vec2 uv = vUV;
    float vig = 1.0 - 0.3 * dot((uv - 0.5) * 1.6, (uv - 0.5) * 1.6);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════
//  WebGL2 Renderer Engine
// ═══════════════════════════════════════════════════

class FractalRenderer {
    constructor() {
        this.canvas = document.getElementById('glCanvas');
        this.gl = this.canvas.getContext('webgl2', {
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });

        if (!this.gl) {
            document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:sans-serif"><h2>WebGL 2 is required</h2></div>';
            return;
        }

        // Camera state
        this.cameraTheta = 0.0;   // horizontal angle
        this.cameraPhi = 0.35;    // vertical angle
        this.cameraRadius = 3.5;
        this.cameraTarget = [0, 0, 0];
        this.autoRotate = true;
        this.autoRotateSpeed = 0.15;

        // Mouse interaction
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };

        // Parameters
        this.power = 8.0;
        this.iterations = 12;
        this.aoIntensity = 0.8;
        this.glowIntensity = 0.5;
        this.fractalType = 0;
        this.colorScheme = 0;
        this.softShadows = true;
        this.orbitTrap = true;
        this.domainWarp = false;
        this.warpAmount = 0.15;

        // Performance
        this.frameCount = 0;
        this.fpsTime = performance.now();
        this.renderScale = 1.0; // 1.0 = full res, < 1 = draft

        this.init();
        this.setupControls();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    init() {
        const gl = this.gl;

        // Compile shaders
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
            'uTime', 'uResolution', 'uCameraPos', 'uCameraTarget',
            'uPower', 'uIterations', 'uAOIntensity', 'uGlowIntensity',
            'uFractalType', 'uColorScheme', 'uSoftShadows', 'uOrbitTrap',
            'uDomainWarp', 'uWarpAmount'
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
        this.canvas.width = Math.floor(w * dpr * this.renderScale);
        this.canvas.height = Math.floor(h * dpr * this.renderScale);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        document.getElementById('resolution').textContent =
            `${this.canvas.width}×${this.canvas.height}`;
    }

    setupControls() {
        const canvas = this.canvas;

        // Mouse drag for orbital camera
        canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            document.body.classList.add('dragging');
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            this.cameraTheta -= dx * 0.005;
            this.cameraPhi = Math.max(-1.4, Math.min(1.4, this.cameraPhi + dy * 0.005));
            this.lastMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            document.body.classList.remove('dragging');
        });

        // Touch support
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
            this.cameraTheta -= dx * 0.005;
            this.cameraPhi = Math.max(-1.4, Math.min(1.4, this.cameraPhi + dy * 0.005));
            this.lastMouse = { x: t.clientX, y: t.clientY };
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            this.isDragging = false;
        });

        // Scroll to zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.cameraRadius = Math.max(0.5, Math.min(15, this.cameraRadius + e.deltaY * 0.003));
        }, { passive: false });

        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (e.key === 'h' || e.key === 'H') {
                document.getElementById('controls').classList.toggle('hidden');
            }
        });

        // UI controls
        const bind = (id, prop, transform = parseFloat) => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                this[prop] = transform(el.value);
                const valueEl = document.getElementById(prop.replace(/^/, '') + 'Value')
                    || document.getElementById(id.replace('Slider', 'Value'));
                if (valueEl) valueEl.textContent = el.value;
            });
        };

        bind('powerSlider', 'power');
        bind('iterSlider', 'iterations', parseInt);
        bind('aoSlider', 'aoIntensity');
        bind('glowSlider', 'glowIntensity');

        document.getElementById('fractalSelect').addEventListener('change', (e) => {
            this.fractalType = parseInt(e.target.value);
            // Adjust defaults per fractal
            if (this.fractalType === 1) this.cameraRadius = 6.0;
            else if (this.fractalType === 2) this.cameraRadius = 5.0;
            else if (this.fractalType === 3) this.cameraRadius = 5.0;
            else this.cameraRadius = 3.5;
        });

        document.getElementById('colorScheme').addEventListener('change', (e) => {
            this.colorScheme = parseInt(e.target.value);
        });

        document.getElementById('autoRotate').addEventListener('change', (e) => {
            this.autoRotate = e.target.checked;
        });

        document.getElementById('softShadows').addEventListener('change', (e) => {
            this.softShadows = e.target.checked;
        });

        document.getElementById('orbitTrap').addEventListener('change', (e) => {
            this.orbitTrap = e.target.checked;
        });

        document.getElementById('domainWarp').addEventListener('change', (e) => {
            this.domainWarp = e.target.checked;
            document.getElementById('warpAmountGroup').style.display =
                e.target.checked ? 'block' : 'none';
        });

        document.getElementById('warpSlider').addEventListener('input', (e) => {
            this.warpAmount = parseFloat(e.target.value);
            document.getElementById('warpValue').textContent = e.target.value;
        });

        // Screenshot
        document.getElementById('screenshotBtn').addEventListener('click', () => {
            this.canvas.toBlob((blob) => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `fractal_${Date.now()}.png`;
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

    animate() {
        const time = performance.now() * 0.001;
        const gl = this.gl;

        // Draft mode while dragging
        if (this.isDragging && this.renderScale === 1.0) {
            this.renderScale = 0.5;
            this.resize();
        } else if (!this.isDragging && this.renderScale < 1.0) {
            this.renderScale = 1.0;
            this.resize();
        }

        // Auto rotation
        if (this.autoRotate && !this.isDragging) {
            this.cameraTheta += this.autoRotateSpeed * 0.016;
        }

        // Camera position from spherical coordinates
        const camX = this.cameraRadius * Math.cos(this.cameraPhi) * Math.sin(this.cameraTheta);
        const camY = this.cameraRadius * Math.sin(this.cameraPhi);
        const camZ = this.cameraRadius * Math.cos(this.cameraPhi) * Math.cos(this.cameraTheta);

        // Set uniforms
        gl.uniform1f(this.uniforms.uTime, time);
        gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
        gl.uniform3f(this.uniforms.uCameraPos, camX, camY, camZ);
        gl.uniform3f(this.uniforms.uCameraTarget, ...this.cameraTarget);
        gl.uniform1f(this.uniforms.uPower, this.power);
        gl.uniform1i(this.uniforms.uIterations, this.iterations);
        gl.uniform1f(this.uniforms.uAOIntensity, this.aoIntensity);
        gl.uniform1f(this.uniforms.uGlowIntensity, this.glowIntensity);
        gl.uniform1i(this.uniforms.uFractalType, this.fractalType);
        gl.uniform1i(this.uniforms.uColorScheme, this.colorScheme);
        gl.uniform1i(this.uniforms.uSoftShadows, this.softShadows ? 1 : 0);
        gl.uniform1i(this.uniforms.uOrbitTrap, this.orbitTrap ? 1 : 0);
        gl.uniform1i(this.uniforms.uDomainWarp, this.domainWarp ? 1 : 0);
        gl.uniform1f(this.uniforms.uWarpAmount, this.warpAmount);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // FPS counter
        this.frameCount++;
        const now = performance.now();
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
new FractalRenderer();
