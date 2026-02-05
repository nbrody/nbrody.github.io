export const mirrorFragmentShader = `
    precision highp float;
    varying vec3 vWorldPosition;
    uniform vec3 u_cameraPos;
    uniform vec4 u_faces[256];
    uniform int u_faceCount;
    uniform float u_time;
    uniform float u_opacity;
    uniform int u_maxBounces;
    uniform float u_mirrorOpacity;
    uniform float u_transparency;
    uniform float u_edgeLightWidth;
    uniform float u_blackBorderWidth;
    uniform float u_lightIntensity;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    const float SURFACE_EPS = 0.001;

    struct HitInfo {
        bool valid;
        float t;
        int faceIdx;
        int neighborIdx;
        vec3 pos;
        vec3 normal;
        float edgeDist;
    };

    float faceSign(vec4 face) {
        return face.w >= 0.0 ? 1.0 : -1.0;
    }

    float faceRadius(vec4 face) {
        return abs(face.w);
    }

    // Signed distance where domain interior is <= 0.
    float sdFace(vec3 p, vec4 face) {
        vec3 c = face.xyz;
        float s = faceSign(face);
        return s * (length(p - c) - faceRadius(face));
    }

    vec3 edgeColor(int faceIdx, int neighborIdx) {
        int b = neighborIdx < 0 ? faceIdx : neighborIdx;
        int lo = min(faceIdx, b);
        int hi = max(faceIdx, b);
        float id = float(lo * 257 + hi);
        float phase = id * 0.73 + u_time * 0.12;
        return 0.5 + 0.5 * cos(vec3(0.0, 2.09, 4.18) + phase);
    }

    HitInfo traceRay(vec3 ro, vec3 rd) {
        HitInfo hit;
        hit.valid = false;
        hit.t = 1e10;
        hit.faceIdx = -1;
        hit.neighborIdx = -1;
        hit.edgeDist = 0.0;

        for (int i = 0; i < 256; i++) {
            if (i >= u_faceCount) break;

            vec4 face = u_faces[i];
            vec3 c = face.xyz;
            float r = faceRadius(face);
            vec3 oc = ro - c;
            float b = dot(oc, rd);
            float cc = dot(oc, oc) - r * r;
            float disc = b * b - cc;
            if (disc < 0.0) continue;

            float h = sqrt(disc);
            float tA = -b - h;
            float tB = -b + h;

            for (int k = 0; k < 2; k++) {
                float t = (k == 0) ? tA : tB;
                if (t <= SURFACE_EPS || t >= hit.t) continue;

                vec3 p = ro + rd * t;
                if (length(p) >= 1.0) continue;

                bool valid = true;
                float minMargin = 1e10;
                int closestJ = -1;

                for (int j = 0; j < 256; j++) {
                    if (j >= u_faceCount) break;
                    if (j == i) continue;

                    float margin = -sdFace(p, u_faces[j]);
                    if (margin < -SURFACE_EPS) {
                        valid = false;
                        break;
                    }
                    if (margin < minMargin) {
                        minMargin = margin;
                        closestJ = j;
                    }
                }

                if (!valid) continue;

                float s = faceSign(face);
                hit.valid = true;
                hit.t = t;
                hit.faceIdx = i;
                hit.neighborIdx = closestJ;
                hit.pos = p;
                hit.normal = s * normalize(p - c);
                hit.edgeDist = minMargin;
            }
        }

        return hit;
    }

    vec3 shadeMirror(HitInfo hit, vec3 rd, bool fromInside) {
        float frameEdge = u_edgeLightWidth + u_blackBorderWidth;
        float frameMask = 1.0 - step(frameEdge, hit.edgeDist);
        float glassMask = 1.0 - frameMask;

        float edgeGlow = 1.0 - smoothstep(0.0, max(0.0001, u_edgeLightWidth), hit.edgeDist);
        float fresnel = pow(1.0 - max(0.0, dot(-rd, hit.normal)), 4.0);

        vec3 ec = edgeColor(hit.faceIdx, hit.neighborIdx);
        vec3 baseGlass = mix(vec3(0.03, 0.04, 0.06), vec3(0.35, 0.40, 0.48), fresnel);
        vec3 baseFrame = mix(vec3(0.02, 0.02, 0.025), vec3(0.22, 0.24, 0.28), fresnel);

        vec3 glow = ec * edgeGlow * u_lightIntensity;
        vec3 glassCol = baseGlass + (fromInside ? glow : glow * 0.35);
        vec3 frameCol = baseFrame + glow * 0.2;

        return glassCol * glassMask + frameCol * frameMask;
    }

    vec3 traceScene(vec3 ro, vec3 rd, out bool hitAny, out vec3 firstPos) {
        vec3 color = vec3(0.0);
        float throughput = 1.0;
        vec3 curRo = ro;
        vec3 curRd = rd;

        hitAny = false;
        firstPos = vec3(0.0);

        for (int bounce = 0; bounce < 32; bounce++) {
            if (bounce >= u_maxBounces) break;
            if (throughput < 0.001) break;

            HitInfo hit = traceRay(curRo, curRd);
            if (!hit.valid) {
                float sky = max(0.0, curRd.y * 0.5 + 0.5);
                vec3 bg = mix(vec3(0.005, 0.008, 0.015), vec3(0.030, 0.050, 0.080), sky);
                color += throughput * bg;
                break;
            }

            if (!hitAny) {
                hitAny = true;
                firstPos = hit.pos;
            }

            float dotN = dot(curRd, hit.normal);
            bool fromInside = dotN > 0.0;
            color += throughput * shadeMirror(hit, curRd, fromInside);

            bool hitFrame = hit.edgeDist < (u_edgeLightWidth + u_blackBorderWidth);
            if (hitFrame) break;

            if (dotN < 0.0) {
                // Entering from outside: transmit.
                curRo = hit.pos + curRd * SURFACE_EPS;
                throughput *= u_transparency;
            } else {
                // Inside surface hit: reflect.
                curRd = reflect(curRd, hit.normal);
                curRo = hit.pos + curRd * SURFACE_EPS;
                throughput *= u_mirrorOpacity;
            }
        }

        return color;
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;

        bool hitAny;
        vec3 firstPos;
        vec3 col = traceScene(ro, rd, hitAny, firstPos);

        if (!hitAny) discard;

        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(firstPos, 1.0);
        float ndcDepth = clipPos.z / clipPos.w;
        gl_FragDepth = (ndcDepth + 1.0) * 0.5;

        gl_FragColor = vec4(col, u_opacity);
    }
`;

export const mirrorDefaults = {
    maxBounces: 12,
    mirrorOpacity: 0.94,
    transparency: 0.80,
    edgeLightWidth: 0.015,
    blackBorderWidth: 0.02,
    lightIntensity: 1.5
};
