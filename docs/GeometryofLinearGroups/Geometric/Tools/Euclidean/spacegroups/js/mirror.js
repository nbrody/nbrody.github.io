/**
 * Mirror rendering for the space-groups tool: multi-bounce reflections along
 * STRAIGHT Euclidean rays — the domain rendered as an actual mirrored room.
 *
 * Each bounce is a Euclidean reflection of the ray direction at the wall
 * plane; brightness attenuates with path length. Rays that leave the bounding
 * sphere (unbounded domains) fade to a dark horizon.
 *
 * Walls arrive as plane covectors, as in shaders.js.
 */
export const mirrorFragmentShader = `
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
    uniform int u_maxBounces;
    uniform float u_edgeLightWidth;
    uniform float u_lightIntensity;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    const float RBOUND = 3.0;
    const float MAX_DIST = 24.0;
    const int MAX_STEPS = 96;
    const int MAX_IN_STEPS = 160;
    const float EPSILON = 0.0012;

    float sdWall(vec3 p, vec4 W) {
        return dot(p, W.xyz) - W.w;
    }

    // Distance to domain boundary including the bounding sphere
    vec2 map(vec3 p) {
        float d = length(p) - RBOUND;
        int bestId = -1;
        for (int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;
            float df = sdWall(p, u_faces[i]);
            if (df > d) { d = df; bestId = i; }
        }
        return vec2(d, float(bestId));
    }

    // Distance to the WALLS only (used inside the domain)
    vec2 mapWalls(vec3 p) {
        float d = -1e10;
        int bestId = -1;
        for (int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;
            float df = sdWall(p, u_faces[i]);
            if (df > d) { d = df; bestId = i; }
        }
        return vec2(d, float(bestId));
    }

    vec3 wallNormal(int idx) {
        return u_faces[idx].xyz;
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

    vec3 faceColor(int idx) {
        vec4 W = idx >= 0 ? u_faces[idx] : vec4(0.0);
        float colorId = dot(W, vec4(7.3, 11.7, 13.1, 5.9));
        return getBaseColor(colorId);
    }

    // Proximity of p to an edge of face idx: distance between the face SDF
    // and the runner-up SDF vanishes on edges.
    float edgeFactor(vec3 p, int idx) {
        if (idx < 0) return 0.0;
        float d2 = -1e10;
        for (int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;
            if (i == idx) continue;
            d2 = max(d2, sdWall(p, u_faces[i]));
        }
        return smoothstep(u_edgeLightWidth, 0.0, abs(sdWall(p, u_faces[idx]) - d2));
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;

        // ---- First hit: march from the camera ----
        float t = 0.0;
        vec2 res;
        bool hit = false;
        for (int i = 0; i < MAX_STEPS; i++) {
            res = map(ro + rd * t);
            if (abs(res.x) < EPSILON) { hit = true; break; }
            t += abs(res.x);
            if (t > MAX_DIST) break;
        }
        if (!hit) discard;

        vec3 p = ro + rd * t;
        int faceIdx = int(res.y);
        vec3 n = getNormal(p);

        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 5.0);

        // Surface shading of the entry face (dark glass + glowing edges)
        vec3 col = vec3(0.0);
        {
            vec3 base = faceIdx >= 0 ? faceColor(faceIdx) : vec3(0.02);
            float diff = max(0.15, dot(n, lightDir));
            float edge = edgeFactor(p, faceIdx);
            col += base * diff * 0.18;
            col += base * edge * u_lightIntensity;
            col += fresnel * 0.25;
        }

        // ---- Mirror bounces along straight Euclidean rays ----
        float throughput = 0.75;
        vec3 pos = p;
        vec3 dir = rd;
        int lastFace = faceIdx;
        float pathLen = 0.0;

        if (faceIdx >= 0) {
            for (int bounce = 0; bounce < 32; bounce++) {
                if (bounce >= u_maxBounces) break;

                // Reflect the direction at the wall and step off it
                vec3 wn = wallNormal(lastFace);
                dir = normalize(reflect(dir, wn));
                pos -= wn * (EPSILON * 2.0);

                // March inside the domain to the next wall
                bool hitWall = false;
                for (int s = 0; s < MAX_IN_STEPS; s++) {
                    if (dot(pos, pos) > RBOUND * RBOUND) break;   // escaped to infinity
                    vec2 m = mapWalls(pos);
                    if (m.x > -EPSILON) {
                        if (int(m.y) != -1) {
                            lastFace = int(m.y);
                            hitWall = true;
                        }
                        break;
                    }
                    float h = max(abs(m.x) * 0.9, 5e-4);
                    pos += dir * h;
                    pathLen += h;
                }

                if (!hitWall) {
                    // Escaped through the bounding sphere: fade to horizon
                    col += throughput * vec3(0.01, 0.012, 0.02);
                    break;
                }

                // Shade the mirrored face, attenuated by distance travelled
                float atten = exp(-0.35 * pathLen);
                vec3 base = faceColor(lastFace);
                float edge = edgeFactor(pos, lastFace);
                col += throughput * atten * (base * 0.10 + base * edge * u_lightIntensity);
                throughput *= 0.72;
                if (throughput < 0.01) break;
            }
        }

        // Depth write from the FIRST hit (mirror content is virtual)
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        float ndcDepth = clipPos.z / clipPos.w;
        gl_FragDepth = (ndcDepth + 1.0) * 0.5;

        gl_FragColor = vec4(col, u_opacity);
    }
`;

export const mirrorDefaults = {
    maxBounces: 8,
    edgeLightWidth: 0.012,
    lightIntensity: 1.6
};
