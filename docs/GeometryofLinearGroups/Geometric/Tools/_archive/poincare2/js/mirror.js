/**
 * Mirror rendering for poincare4: multi-bounce reflections that travel along
 * HYPERBOLIC GEODESICS of the Poincaré ball.
 *
 * The first ray (camera → domain surface) is Euclidean, since the camera
 * lives outside the model. After each mirror bounce the ray is propagated
 * inside the ball along the geodesic through the hit point: in the conformal
 * metric λ²δ with λ = 2/(1-|x|²), unit-Euclidean-speed geodesics satisfy
 *
 *      dt/ds = (2/(1-|x|²)) · (x - (x·t)t),
 *
 * i.e. circular arcs orthogonal to the unit sphere (diameters are straight).
 * Reflection of the direction at a wall is the EUCLIDEAN reflection about the
 * wall normal — the ball model is conformal, so this is also the hyperbolic
 * reflection of the tangent vector.
 *
 * Walls arrive as normalized Minkowski covectors, as in shaders.js.
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

    const float MAX_DIST = 10.0;
    const int MAX_STEPS = 96;
    const int MAX_GEO_STEPS = 220;
    const float EPSILON = 0.0012;
    const float PLANE_EPS = 1e-6;

    float sdWall(vec3 p, vec4 W) {
        if (abs(W.w) < PLANE_EPS) {
            return dot(p, normalize(W.xyz));
        }
        vec3 c = W.xyz / W.w;
        float r = 1.0 / abs(W.w);
        float s = W.w > 0.0 ? -1.0 : 1.0;
        return s * (length(p - c) - r);
    }

    // Distance to domain boundary including the sphere at infinity
    vec2 map(vec3 p) {
        float d = length(p) - 1.0;
        int bestId = -1;
        for (int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;
            float df = sdWall(p, u_faces[i]);
            if (df > d) { d = df; bestId = i; }
        }
        return vec2(d, float(bestId));
    }

    // Distance to the WALLS only (used inside the ball; the sphere at
    // infinity is unreachable along geodesics)
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

    vec3 wallNormal(vec3 p, int idx) {
        vec4 W = u_faces[idx];
        if (abs(W.w) < PLANE_EPS) return normalize(W.xyz);
        vec3 c = W.xyz / W.w;
        float s = W.w > 0.0 ? -1.0 : 1.0;
        return s * normalize(p - c);
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

        // ---- First hit: Euclidean march from the camera ----
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

        // ---- Mirror bounces along hyperbolic geodesics ----
        float throughput = 0.75;
        vec3 pos = p;
        vec3 dir = rd;
        int lastFace = faceIdx;
        float hypLen = 0.0;          // hyperbolic path length for fog

        if (faceIdx >= 0) {
            for (int bounce = 0; bounce < 32; bounce++) {
                if (bounce >= u_maxBounces) break;

                // Reflect the direction (conformal model: Euclidean reflection
                // of the tangent = hyperbolic reflection)
                vec3 wn = wallNormal(pos, lastFace);
                dir = normalize(reflect(dir, wn));
                // Step off the wall
                pos -= wn * (EPSILON * 2.0);

                // Geodesic march inside the domain
                bool hitWall = false;
                for (int s = 0; s < MAX_GEO_STEPS; s++) {
                    float r2 = dot(pos, pos);
                    float conf = 1.0 - r2;
                    if (conf < 5e-4) break;   // effectively at infinity

                    vec2 m = mapWalls(pos);
                    if (m.x > -EPSILON) {
                        // On (or past) a wall
                        if (m.x > -EPSILON && int(m.y) != -1) {
                            lastFace = int(m.y);
                            hitWall = true;
                        }
                        break;
                    }

                    // Step: limited by wall distance AND by geodesic curvature
                    float h = min(abs(m.x) * 0.8, conf * 0.12);
                    h = max(h, 5e-4);

                    // Geodesic ODE: dt/ds = (2/(1-r^2)) (x - (x·t) t)
                    vec3 acc = (2.0 / conf) * (pos - dot(pos, dir) * dir);
                    pos += dir * h + 0.5 * acc * h * h;
                    dir = normalize(dir + acc * h);
                    hypLen += 2.0 * h / conf;
                }

                if (!hitWall) {
                    // Escaped toward the sphere at infinity: fade to horizon
                    col += throughput * vec3(0.01, 0.012, 0.02);
                    break;
                }

                // Shade the mirrored face, attenuated by distance travelled
                float atten = exp(-0.22 * hypLen);
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
