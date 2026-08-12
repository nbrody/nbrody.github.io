/**
 * Raymarching shaders for the space-groups tool.
 *
 * Walls arrive as plane covectors W = (n1, n2, n3, d) with |n| = 1:
 * the plane is n·x = d and the domain side is n·x - d < 0.
 * The scene is clipped to a bounding sphere of radius RBOUND (unbounded
 * domains — non-cocompact groups — get a dark spherical cap there).
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
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    const float RBOUND = 3.0;
    const float MAX_DIST = 24.0;
    const int MAX_STEPS = 140;
    const float EPSILON = 0.001;

    // Signed distance to a wall plane; negative on the domain side.
    float sdWall(vec3 p, vec4 W) {
        return dot(p, W.xyz) - W.w;
    }

    // Euclidean reflection through a wall plane.
    vec3 reflectThroughWall(vec3 p, vec4 W) {
        return p - 2.0 * (dot(p, W.xyz) - W.w) * W.xyz;
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
        // Bounding sphere (stands in for infinity when the domain is unbounded)
        float d = length(p) - RBOUND;
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
            // Fade toward the bounding sphere (reads as "off to infinity").
            float fog = smoothstep(0.72 * RBOUND, RBOUND, length(p));
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
