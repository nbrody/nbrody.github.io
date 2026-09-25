/**
 * Raymarching shader for the domain.
 *
 * Walls arrive as normalized Minkowski covectors W = (w1,w2,w3,w0):
 *   |w0| > eps : Euclidean sphere, center W.xyz/w0, radius 1/|w0|;
 *                domain side is OUTSIDE when w0 > 0, INSIDE when w0 < 0.
 *   |w0| ≈ 0  : Euclidean plane through the origin, normal W.xyz;
 *                domain side is where dot(p, n) < 0.
 * Colours come per face (u_faceColor), chosen on the CPU so that paired
 * faces share a hue.
 */
export const MAX_FACES = 256;

export const vertexShader = `
    varying vec3 vWorldPosition;
    varying vec4 vClipPos;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vClipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = vClipPos;
    }
`;

export const fragmentShader = `
    precision highp float;
    varying vec3 vWorldPosition;
    varying vec4 vClipPos;
    uniform vec3 u_cameraPos;
    uniform vec4 u_faces[${MAX_FACES}];
    uniform vec3 u_faceColor[${MAX_FACES}];
    uniform int u_faceCount;
    uniform float u_time;
    uniform float u_opacity;
    uniform bool u_uhs;
    // Upper half-space cutaway: everything above this height is removed, so a
    // camera above it looks straight down into the cusp (0 = off).
    uniform float u_ceiling;
    // Theme: u_lightMode is 0 (dark) or 1 (light); u_bgColor is what the
    // scene fades into at the ideal boundary, so the domain dissolves into
    // the page rather than into a black halo.
    uniform float u_lightMode;
    uniform vec3 u_bgColor;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    const float MAX_DIST = 30.0;
    const int MAX_STEPS = 160;
    const float EPSILON = 0.001;
    const float PLANE_EPS = 1e-6;

    // Signed Euclidean distance to a wall; negative on the domain side.
    // Ball model: walls are spheres / planes-through-origin (covector W).
    // UHS model: y is the height (domain y>0); the SAME covector reads as a
    // vertical plane when w3≈w0, else a hemisphere centred on the floor.
    float sdWall(vec3 p, vec4 W) {
        if (u_uhs) {
            float d = W.z - W.w;
            if (abs(d) < 1e-4) {
                float nl = length(W.xy);
                if (nl < 1e-9) return 1e9;
                return (W.x * p.x + W.y * p.z - 0.5 * (W.z + W.w)) / nl;
            }
            vec3 c = vec3(-W.x / d, 0.0, -W.y / d);
            float rr = dot(W.xy, W.xy) / (d * d) + (W.z + W.w) / d;
            if (rr <= 0.0) return 1e9;
            return sign(d) * (length(p - c) - sqrt(rr));
        }
        if (abs(W.w) < PLANE_EPS) {
            return dot(p, normalize(W.xyz));
        }
        vec3 c = W.xyz / W.w;
        float r = 1.0 / abs(W.w);
        float s = W.w > 0.0 ? -1.0 : 1.0;
        return s * (length(p - c) - r);
    }

    vec2 map(vec3 p) {
        // Ideal boundary: unit sphere (ball) or the floor y=0 (UHS, domain y>0).
        float d = u_uhs ? -p.y : length(p) - 1.0;
        int bestId = -1;
        for (int i = 0; i < ${MAX_FACES}; i++) {
            if (i >= u_faceCount) break;
            float df = sdWall(p, u_faces[i]);
            if (df > d) {
                d = df;
                bestId = i;
            }
        }
        return vec2(d, float(bestId));
    }

    // Away from an edge the active constraint has an analytic gradient.
    vec3 wallNormal(vec3 p, int faceIdx) {
        if (faceIdx < 0) return u_uhs ? vec3(0.0, -1.0, 0.0) : normalize(p);
        vec4 W = u_faces[faceIdx];
        if (u_uhs) {
            float d = W.z - W.w;
            if (abs(d) < 1e-4) return normalize(vec3(W.x, 0.0, W.y));
            vec3 c = vec3(-W.x / d, 0.0, -W.y / d);
            return sign(d) * normalize(p - c);
        }
        if (abs(W.w) < PLANE_EPS) return normalize(W.xyz);
        return -sign(W.w) * normalize(p - W.xyz / W.w);
    }

    vec3 faceColor(int idx) {
        vec3 c = idx >= 0 ? u_faceColor[idx] : vec3(0.6);
        // Light mode washes the hues toward pastel so they sit on paper.
        return mix(c, mix(c, vec3(1.0), 0.62), u_lightMode);
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;

        float t = 0.0;
        bool clip = u_uhs && u_ceiling > 0.0;
        bool inner = false;
        if (clip && ro.y > u_ceiling) {
            // Start on the cut: rays that enter the domain through it march
            // on inside and show the far walls and the floor.
            if (rd.y >= -1e-4) discard;
            t = (u_ceiling - ro.y) / rd.y + 1e-4;
            if (map(ro + rd * t).x < 0.0) inner = true;
        }

        vec2 res;
        bool hit = false;
        bool cap = false;
        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * t;
            res = map(p);
            float d = res.x;
            if (clip && !inner) {
                float dc = p.y - u_ceiling;
                if (dc > d) { d = dc; res.y = -2.0; }
            }
            if (abs(d) < EPSILON) {
                hit = true;
                cap = res.y < -1.5;
                break;
            }
            t += max(abs(d), EPSILON * 0.5);
            if (t > MAX_DIST) break;
        }

        if (!hit) discard;

        vec3 p = ro + rd * t;
        int faceIdx = int(res.y);
        vec3 n = cap ? vec3(0.0, 1.0, 0.0) : wallNormal(p, faceIdx);
        if (inner) n = -n;                       // seen from inside the domain

        vec3 baseCol = faceIdx >= 0 ? faceColor(faceIdx) : mix(vec3(0.05), u_bgColor * 0.92, u_lightMode);
        if (cap) baseCol = mix(vec3(0.55, 0.62, 0.8), vec3(0.8, 0.84, 0.95), u_lightMode);

        vec3 lightDir = normalize(vec3(1, 1, 1));
        // Lift the shadow floor on light backgrounds: unlit faces should
        // read as tinted paper, not as holes.
        float diff = max(mix(0.2, 0.62, u_lightMode), dot(n, lightDir));
        float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 5.0);

        float d2 = -1e10;
        for (int i = 0; i < ${MAX_FACES}; i++) {
            if (i >= u_faceCount) break;
            if (i == faceIdx) continue;
            d2 = max(d2, sdWall(p, u_faces[i]));
        }
        float edgeGap = faceIdx >= 0 ? abs(sdWall(p, u_faces[faceIdx]) - d2) : 1.0;
        // Pixel-scaled antialiasing keeps the edges legible while zooming.
        float edgeWidth = max(0.001, 1.25 * fwidth(edgeGap));
        float edge = faceIdx >= 0 ? 1.0 - smoothstep(0.0, edgeWidth, edgeGap) : 0.0;

        // Rim light reads as a white sheen on dark, but as grime on light,
        // so it softens; edges darken instead of glowing.
        vec3 col = baseCol * diff + fresnel * mix(0.5, 0.12, u_lightMode);
        col += edge * mix(0.3, -0.22, u_lightMode);
        // Ball: fade toward the ideal sphere. UHS: gently fade toward the floor (y→0).
        float fog = u_uhs ? 0.7 * (1.0 - smoothstep(0.0, 0.18, p.y)) : smoothstep(0.8, 1.0, length(p));
        col = mix(col, u_bgColor, fog);
        float alpha = cap ? u_opacity * 0.35 : u_opacity;

        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        float ndcDepth = clipPos.z / clipPos.w;
        gl_FragDepth = (ndcDepth + 1.0) * 0.5;

        gl_FragColor = vec4(col, alpha);
    }
`;
