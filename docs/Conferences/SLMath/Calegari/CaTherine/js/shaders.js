export const vertexShader = `
    varying vec3 vWorldPosition;
    void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

export const fragmentShader = `
    precision highp float;
    varying vec3 vWorldPosition;
    uniform vec3 u_cameraPos;
    uniform vec4 u_faces[256];
    uniform int u_faceCount;
    uniform float u_time;

    const float MAX_DIST = 10.0;
    const int MAX_STEPS = 80;
    const float EPSILON = 0.001;

    // SDF for a half-space in Poincare Ball
    float sdFace(vec3 p, vec4 face) {
        vec3 c = face.xyz;
        float r = face.w;
        // Sign is stored in the radius. 
        // If s > 0, we want the interior (|p-c| < r) to be allowed (negative).
        // If s < 0, we want the exterior (|p-c| > r) to be allowed (negative).
        float s = r > 0.0 ? 1.0 : -1.0;
        return s * (length(p - c) - abs(r));
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

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;

        float t = 0.0;
        vec2 res;
        bool hit = false;

        for(int i = 0; i < MAX_STEPS; i++) {
            vec3 p = ro + rd * t;
            res = map(p);
            if (abs(res.x) < EPSILON) {
                hit = true;
                break;
            }
            t += abs(res.x);
            if (t > MAX_DIST) break;
        }

        if (hit) {
            vec3 p = ro + rd * t;
            vec3 n = getNormal(p);
            float faceId = res.y;
            vec3 baseCol = 0.5 + 0.5 * cos(faceId * 0.5 + vec3(0, 2, 4));
            if (faceId < -0.5) baseCol = vec3(0.05);

            vec3 lightDir = normalize(vec3(1, 1, 1));
            float diff = max(0.2, dot(n, lightDir));
            float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 5.0);
            
            float d2 = -1e10;
            for(int i = 0; i < 256; i++) {
                if (i >= u_faceCount) break;
                if (float(i) == faceId) continue;
                d2 = max(d2, sdFace(p, u_faces[i]));
            }
            float edge = smoothstep(0.005, 0.0, abs(sdFace(p, u_faces[int(faceId)]) - d2));

            vec3 col = baseCol * diff + fresnel * 0.5;
            col += edge * 0.3;
            float fog = smoothstep(0.8, 1.0, length(p));
            col = mix(col, vec3(0, 0, 0), fog);

            gl_FragColor = vec4(col, 1.0);
        } else {
            discard;
        }
    }
`;
