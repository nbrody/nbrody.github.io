/**
 * Raymarching shaders for poincare4.
 *
 * Walls arrive as normalized Minkowski covectors W = (w1,w2,w3,w0):
 *   |w0| > eps : Euclidean sphere, center W.xyz/w0, radius 1/|w0|;
 *                domain side is OUTSIDE when w0 > 0, INSIDE when w0 < 0.
 *   |w0| ≈ 0  : Euclidean plane through the origin, normal W.xyz;
 *                domain side is where dot(p, n) < 0.
 */
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
    uniform vec4 u_faces[256];
    uniform int u_faceCount;
    uniform float u_time;
    uniform float u_opacity;
    uniform int u_colorMode;
    uniform vec3 u_colorOffset;
    uniform float u_colorFreq;
    uniform bool u_showTiling;
    uniform bool u_uhs;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    const float MAX_DIST = 24.0;
    const int MAX_STEPS = 140;
    const float EPSILON = 0.001;
    const float PLANE_EPS = 1e-6;

    // Signed Euclidean distance to a wall; negative on the domain side.
    // Ball model: walls are spheres / planes-through-origin (covector W).
    // UHS model: z is height (domain z>0); the SAME covector reads as a
    // vertical plane when w3≈w0, else a hemisphere centred on z=0.
    float sdWall(vec3 p, vec4 W) {
        if (u_uhs) {
            // y is the height (domain y>0); boundary plane ℂ is the x–z floor.
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

    // Hyperbolic reflection through a wall (sphere inversion / mirror).
    vec3 reflectThroughWall(vec3 p, vec4 W) {
        if (u_uhs) {
            float d = W.z - W.w;
            if (abs(d) < 1e-4) {
                float nl = length(W.xy);
                vec2 n = W.xy / nl;
                float off = 0.5 * (W.z + W.w) / nl;
                float s = (p.x * n.x + p.z * n.y) - off;
                return vec3(p.x - 2.0 * s * n.x, p.y, p.z - 2.0 * s * n.y);
            }
            vec3 c = vec3(-W.x / d, 0.0, -W.y / d);
            float rr = dot(W.xy, W.xy) / (d * d) + (W.z + W.w) / d;
            vec3 dd = p - c;
            float l2 = dot(dd, dd);
            if (l2 < 1e-6) return p;
            return c + (rr / l2) * dd;
        }
        if (abs(W.w) < PLANE_EPS) {
            vec3 n = normalize(W.xyz);
            return p - 2.0 * dot(p, n) * n;
        }
        vec3 c = W.xyz / W.w;
        float r = 1.0 / abs(W.w);
        vec3 d = p - c;
        float dist2 = dot(d, d);
        if (dist2 < 0.0001) return p;
        return c + (r * r / dist2) * d;
    }

    vec3 foldToFundamental(vec3 p, out float totalFolds) {
        totalFolds = 0.0;
        for (int iter = 0; iter < 24; iter++) {
            bool folded = false;
            for (int i = 0; i < 256; i++) {
                if (i >= u_faceCount) break;
                if (sdWall(p, u_faces[i]) > 0.001) {
                    p = reflectThroughWall(p, u_faces[i]);
                    totalFolds += 1.0;
                    folded = true;
                }
            }
            if (!folded) break;
        }
        return p;
    }

    vec2 map(vec3 p) {
        // Ideal boundary: unit sphere (ball) or the floor y=0 (UHS, domain y>0).
        float d = u_uhs ? -p.y : length(p) - 1.0;
        int bestId = -1;
        for (int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;
            float df = sdWall(p, u_faces[i]);
            if (df > d) {
                d = df;
                bestId = i;
            }
        }
        return vec2(d, float(bestId));
    }

    vec3 getNormal(vec3 p) {
        vec2 e = vec2(0.001, 0.0);
        return normalize(vec3(
            map(p + e.xyy).x - map(p - e.xyy).x,
            map(p + e.yxy).x - map(p - e.yxy).x,
            map(p + e.yyx).x - map(p - e.yyx).x
        ));
    }

    vec3 getBaseColor(float faceId) {
        if (u_colorMode == 1) {
            return vec3(0.3 + 0.2 * sin(faceId * u_colorFreq));
        }
        return 0.5 + 0.5 * cos(faceId * u_colorFreq + u_colorOffset);
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;

        float t = 0.0;
        vec2 res;
        bool hit = false;

        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * t;
            if (u_showTiling) {
                float folds;
                p = foldToFundamental(p, folds);
            }
            res = map(p);
            if (abs(res.x) < EPSILON) {
                hit = true;
                break;
            }
            float stepSize = u_showTiling ? abs(res.x) * 0.5 : abs(res.x);
            t += stepSize;
            if (t > MAX_DIST) break;
        }

        if (hit) {
            vec3 p = ro + rd * t;
            vec3 n = getNormal(p);
            int faceIdx = int(res.y);

            // Stable coloring keyed on wall covector
            vec4 W = faceIdx >= 0 ? u_faces[faceIdx] : vec4(0.0);
            float colorId = dot(W, vec4(7.3, 11.7, 13.1, 5.9));
            vec3 baseCol = getBaseColor(colorId);
            if (faceIdx < 0) baseCol = vec3(0.05);

            vec3 lightDir = normalize(vec3(1, 1, 1));
            float diff = max(0.2, dot(n, lightDir));
            float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 5.0);

            float d2 = -1e10;
            for (int i = 0; i < 256; i++) {
                if (i >= u_faceCount) break;
                if (i == faceIdx) continue;
                d2 = max(d2, sdWall(p, u_faces[i]));
            }
            float edge = faceIdx >= 0 ? smoothstep(0.005, 0.0, abs(sdWall(p, u_faces[faceIdx]) - d2)) : 0.0;

            vec3 col = baseCol * diff + fresnel * 0.5;
            col += edge * 0.3;
            // Ball: fade toward the ideal sphere. UHS: gently fade toward the floor (y→0).
            float fog = u_uhs ? 0.7 * smoothstep(0.18, 0.0, p.y) : smoothstep(0.8, 1.0, length(p));
            col = mix(col, vec3(0.0), fog);

            vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            float ndcDepth = clipPos.z / clipPos.w;
            gl_FragDepth = (ndcDepth + 1.0) * 0.5;

            gl_FragColor = vec4(col, u_opacity);
        } else {
            discard;
        }
    }
`;
