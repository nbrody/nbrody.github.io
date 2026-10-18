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

    // Through the domain from t with the walls alone (the sphere at infinity
    // is no surface) to the wall the ray leaves by before tFar. A hit on
    // wall skip right at the start is the wall the ray came in by.
    bool marchThrough(vec3 ro, vec3 rd, inout float t, float tFar, int skip, out int id) {
        float t0 = t;
        id = -1;
        for (int i = 0; i < MAX_STEPS; i++) {
            vec3 q = ro + rd * t;
            float d = -1e9;
            int kb = -1;
            for (int k = 0; k < ${MAX_FACES}; k++) {
                if (k >= u_faceCount) break;
                float df = sdWall(q, u_faces[k]);
                if (df > d) { d = df; kb = k; }
            }
            if (abs(d) < EPSILON && !(kb == skip && t - t0 < 0.02)) { id = kb; return true; }
            t += max(abs(d), EPSILON * 0.5);
            if (t > tFar) return false;
        }
        return false;
    }

    // Distance along wall faceIdx from p to the nearest edge, counting the
    // wall's circle at infinity (where it meets a free face, or touches
    // another wall) as an edge too.
    float edgeGapAt(vec3 p, int faceIdx) {
        float d2 = u_uhs ? -p.y : length(p) - 1.0;
        for (int i = 0; i < ${MAX_FACES}; i++) {
            if (i >= u_faceCount) break;
            if (i == faceIdx) continue;
            d2 = max(d2, sdWall(p, u_faces[i]));
        }
        return abs(sdWall(p, u_faces[faceIdx]) - d2);
    }

    // The colour of a surface point: n faces the viewer, edge is how much of
    // an edge line lies here, behind marks a wall seen through a free face.
    vec3 shade(vec3 p, vec3 n, vec3 rd, vec3 baseCol, float edge, bool behind) {
        vec3 lightDir = normalize(vec3(1, 1, 1));
        // Lift the shadow floor on light backgrounds: unlit faces should
        // read as tinted paper, not as holes.
        float diff = max(mix(0.2, 0.62, u_lightMode), dot(n, lightDir));
        float fresnel = pow(1.0 - max(0.0, dot(n, -rd)), 5.0);
        // Rim light reads as a white sheen on dark, but as grime on light,
        // so it softens; edges darken instead of glowing.
        vec3 col = baseCol * diff + fresnel * mix(0.5, 0.12, u_lightMode);
        col += edge * mix(0.3, -0.22, u_lightMode);
        // Walls seen from behind, through a free face, recede a little.
        if (behind) col = mix(col, u_bgColor, 0.25);
        // Ball: fade toward the ideal sphere, but only partly, so a face keeps
        // its colour out to its circle at infinity and tangencies stay
        // visible. UHS: gently fade toward the floor (y→0). Edges fade less.
        float fog = u_uhs ? 0.7 * (1.0 - smoothstep(0.0, 0.18, p.y)) : 0.6 * smoothstep(0.8, 1.0, length(p));
        return mix(col, u_bgColor, fog * (1.0 - 0.6 * edge));
    }

    // A wall seen from inside the domain, premultiplied, with its edges
    // sized from the pixel footprint (no derivatives off the main path).
    vec4 shadeInside(vec3 ro, vec3 rd, float t, int id, float pixAngle) {
        vec3 p = ro + rd * t;
        vec3 n = -wallNormal(p, id);
        float fp = t * pixAngle / max(0.2, abs(dot(n, rd)));
        float edge = 1.0 - smoothstep(0.0, 1.25 * fp, edgeGapAt(p, id));
        return vec4(shade(p, n, rd, faceColor(id), edge, true), 1.0) * u_opacity;
    }

    float depthAt(vec3 p) {
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        return (clipPos.z / clipPos.w + 1.0) * 0.5;
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;
        // The angle one pixel spans, for footprints (taken while every pixel
        // of the quad is still running).
        float pixAngle = max(length(dFdx(rd)), length(dFdy(rd)));

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
            vec3 q = ro + rd * t;
            res = map(q);
            float d = res.x;
            if (clip && !inner) {
                float dc = q.y - u_ceiling;
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

        // Ball: the circles where walls meet the sphere at
        // infinity are silhouettes, smoothed by hand. A pixel there is part
        // wall, part view through the free face beside it.
        bool ideal = !u_uhs && !cap && !inner;
        float bq = dot(ro, rd);
        float tFar = -bq + sqrt(max(0.0, bq * bq - dot(ro, ro) + 1.0));

        // A free face (infinite volume) lies on the sphere at infinity and has
        // no surface: a ray entering the domain there carries on inside it to
        // the wall it leaves through, so walls are seen from behind too.
        if (ideal && res.y < -0.5 && dot(ro + rd * t, rd) < 0.0) {
            vec3 p0 = ro + rd * t;
            float t0 = t;
            vec4 back = vec4(0.0);
            float depth = 0.999;
            int id;
            if (marchThrough(ro, rd, t, tFar, -1, id)) {
                back = shadeInside(ro, rd, t, id, pixAngle);
                depth = depthAt(ro + rd * t);
            }
            // The nearest wall's circle at infinity may cross this pixel.
            float g = 1e9;
            int kn = -1;
            for (int k = 0; k < ${MAX_FACES}; k++) {
                if (k >= u_faceCount) break;
                float dk = -sdWall(p0, u_faces[k]);
                if (dk < g) { g = dk; kn = k; }
            }
            float fp0 = t0 * pixAngle / max(0.2, abs(dot(normalize(p0), rd)));
            float cover = kn >= 0 ? clamp(0.5 - g / fp0, 0.0, 1.0) : 0.0;
            vec4 col = back;
            if (cover > 0.0) {
                vec3 n0 = wallNormal(p0, kn);
                vec4 wall = vec4(shade(p0, n0, rd, faceColor(kn), 1.0, false), 1.0) * u_opacity;
                col = mix(back, wall, cover);
                depth = min(depth, depthAt(p0));
            }
            if (col.a < 0.002) discard;      // out through another free face
            gl_FragDepth = depth;
            gl_FragColor = vec4(col.rgb / col.a, col.a);
            return;
        }

        vec3 p = ro + rd * t;
        int faceIdx = int(res.y);
        vec3 n = cap ? vec3(0.0, 1.0, 0.0) : wallNormal(p, faceIdx);
        if (inner) n = -n;                       // seen from inside the domain

        vec3 baseCol = faceIdx >= 0 ? faceColor(faceIdx) : mix(vec3(0.05), u_bgColor * 0.92, u_lightMode);
        if (cap) baseCol = mix(vec3(0.55, 0.62, 0.8), vec3(0.8, 0.84, 0.95), u_lightMode);

        float edgeGap = faceIdx >= 0 ? edgeGapAt(p, faceIdx) : 1.0;
        // Pixel-scaled antialiasing keeps the edges legible while zooming.
        float edgeWidth = max(0.001, 1.25 * fwidth(edgeGap));
        float edge = faceIdx >= 0 ? 1.0 - smoothstep(0.0, edgeWidth, edgeGap) : 0.0;

        vec3 col = shade(p, n, rd, baseCol, edge, false);
        float alpha = cap ? u_opacity * 0.35 : u_opacity;
        gl_FragDepth = depthAt(p);

        // A wall within half a pixel of its circle at infinity: blend in the
        // view past it, into the domain through the free face beside it.
        if (ideal && faceIdx >= 0) {
            float fp = t * pixAngle / max(0.2, abs(dot(n, rd)));
            float cover = clamp(0.5 + (1.0 - length(p)) / fp, 0.0, 1.0);
            if (cover < 1.0) {
                vec4 back = vec4(0.0);
                float tb = t + 2.0 * EPSILON;
                int id;
                if (marchThrough(ro, rd, tb, tFar, faceIdx, id)) back = shadeInside(ro, rd, tb, id, pixAngle);
                vec4 mixed = mix(back, vec4(col, 1.0) * alpha, cover);
                if (mixed.a < 0.002) discard;
                gl_FragColor = vec4(mixed.rgb / mixed.a, mixed.a);
                return;
            }
        }

        gl_FragColor = vec4(col, alpha);
    }
`;
