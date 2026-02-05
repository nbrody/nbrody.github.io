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
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    const float MAX_DIST = 10.0;
    const int MAX_STEPS = 80;
    const float EPSILON = 0.001;

    uniform bool u_showTiling;

    // SDF for a half-space in Poincare Ball
    float sdFace(vec3 p, vec4 face) {
        vec3 c = face.xyz;
        float r = face.w;
        float s = r > 0.0 ? 1.0 : -1.0;
        return s * (length(p - c) - abs(r));
    }

    // Reflect point through a bisector sphere (hyperbolic reflection)
    vec3 reflectThroughFace(vec3 p, vec4 face) {
        vec3 c = face.xyz;
        float r = abs(face.w);
        vec3 d = p - c;
        float dist2 = dot(d, d);
        if (dist2 < 0.0001) return p;
        return c + (r * r / dist2) * d;
    }

    // Apply tiling: fold point into fundamental domain
    vec3 foldToFundamental(vec3 p, out float totalFolds) {
        totalFolds = 0.0;
        for(int iter = 0; iter < 20; iter++) {
            bool folded = false;
            for(int i = 0; i < 256; i++) {
                if (i >= u_faceCount) break;
                float d = sdFace(p, u_faces[i]);
                if (d > 0.001) {
                    p = reflectThroughFace(p, u_faces[i]);
                    totalFolds += 1.0;
                    folded = true;
                }
            }
            if (!folded) break;
        }
        return p;
    }

    vec2 map(vec3 p) {
        float d = -1e10;
        int bestId = -1;
        float distToUnit = length(p) - 1.0;
        d = distToUnit;

        for(int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;
            float df = sdFace(p, u_faces[i]);
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
        // Mode 0: Rainbow (default)
        // Mode 1: Monochrome
        if (u_colorMode == 1) {
            return vec3(0.3 + 0.2 * sin(faceId * u_colorFreq));
        }
        // All other modes use cosine palette with offset
        return 0.5 + 0.5 * cos(faceId * u_colorFreq + u_colorOffset);
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;

        float t = 0.0;
        vec2 res;
        bool hit = false;
        float foldCount = 0.0;

        for(int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * t;
            
            // If tiling is enabled, fold point into fundamental domain
            if (u_showTiling) {
                float folds;
                p = foldToFundamental(p, folds);
                foldCount = folds;
            }
            
            res = map(p);
            if (abs(res.x) < EPSILON) {
                hit = true;
                break;
            }
            // Use smaller steps when tiling to avoid missing thin tiles
            float stepSize = u_showTiling ? abs(res.x) * 0.5 : abs(res.x);
            t += stepSize;
            if (t > MAX_DIST) break;
        }

        if (hit) {
            vec3 p = ro + rd * t;
            vec3 n = getNormal(p);
            int faceIdx = int(res.y);
            
            // Use geometric position of face center for stable coloring
            // This prevents colors from jumping around during animation
            vec3 faceCenter = faceIdx >= 0 ? u_faces[faceIdx].xyz : vec3(0.0);
            float colorId = dot(faceCenter, vec3(7.3, 11.7, 13.1)); // Hash based on position
            
            vec3 baseCol = getBaseColor(colorId);
            if (faceIdx < 0) baseCol = vec3(0.05);

            vec3 lightDir = normalize(vec3(1, 1, 1));
            float diff = max(0.2, dot(n, lightDir));
            float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 5.0);
            
            float d2 = -1e10;
            for(int i = 0; i < 256; i++) {
                if (i >= u_faceCount) break;
                if (i == faceIdx) continue;
                d2 = max(d2, sdFace(p, u_faces[i]));
            }
            float edge = faceIdx >= 0 ? smoothstep(0.005, 0.0, abs(sdFace(p, u_faces[faceIdx]) - d2)) : 0.0;

            vec3 col = baseCol * diff + fresnel * 0.5;
            col += edge * 0.3;
            float fog = smoothstep(0.8, 1.0, length(p));
            col = mix(col, vec3(0, 0, 0), fog);

            // Write depth for proper occlusion
            vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            float ndcDepth = clipPos.z / clipPos.w;
            gl_FragDepth = (ndcDepth + 1.0) * 0.5;

            gl_FragColor = vec4(col, u_opacity);
        } else {
            discard;
        }
    }
`;
