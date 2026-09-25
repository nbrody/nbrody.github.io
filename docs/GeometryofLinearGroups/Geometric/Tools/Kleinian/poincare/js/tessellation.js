/**
 * Shaders that see the whole tessellation of H³ by copies of the domain.
 *
 * Both work in the hyperboloid model, where a wall is a covector W and the
 * domain is {⟨W,X⟩ < 0}, and a face pairing is a 4×4 Lorentz matrix L acting
 * on points AND tangent vectors. A geodesic X(s) = cosh s·P + sinh s·V meets
 * a wall where a·cosh s + b·sinh s = 0 (a = ⟨W,P⟩, b = ⟨W,V⟩): closed form,
 * no marching.
 *
 *  - MANIFOLD view (inside view): a ray that leaves the domain through a face
 *    is carried by that face's pairing and re-enters through the partner
 *    face — exactly what an observer inside the quotient manifold sees: the
 *    tiling of H³ by translates of the domain, receding into fog. A bead at
 *    the centre of every tile marks the orbit of the basepoint.
 *
 *  - HONEYCOMB (outside view): each sample along a camera ray is folded back
 *    into the domain by the pairings (Poincaré's reduction), and the distance
 *    to the domain's edges measured there — the edges of every tile at once.
 *    The fold is carried along the ray incrementally, so each step costs one
 *    pass over the walls.
 */
import * as THREE from 'three';
import { lorentzMatrix } from './math.js';

export const TESS_MAX_WALLS = 64;

const common = `
    precision highp float;
    varying vec3 vWorldPosition;
    uniform vec3 u_cameraPos;
    uniform vec4 u_walls[${TESS_MAX_WALLS}];
    uniform mat4 u_pair[${TESS_MAX_WALLS}];
    uniform vec3 u_wallColor[${TESS_MAX_WALLS}];
    uniform int u_wallCount;
    uniform float u_lightMode;
    uniform vec3 u_bgColor;
    uniform float u_opacity;
    uniform mat4 projectionMatrix;
    uniform mat4 modelViewMatrix;

    float mdot(vec4 a, vec4 b) { return dot(a.xyz, b.xyz) - a.w * b.w; }
    vec4 toHyp(vec3 p) { float r2 = dot(p, p); return vec4(2.0 * p, 1.0 + r2) / (1.0 - r2); }
    vec3 toBall(vec4 X) { return X.xyz / (1.0 + X.w); }
    float depthOf(vec3 p) {
        vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        return (c.z / c.w + 1.0) * 0.5;
    }
`;

export const manifoldFragmentShader = common + `
    uniform vec4 u_center;         // domain centre on the hyperboloid (scene frame)
    uniform float u_faceAlpha;     // how much of each face is painted
    uniform float u_edgeWidth;     // hyperbolic half-width of the edge lines
    uniform float u_fogDist;       // e-folding distance of the fog
    uniform float u_beadRadius;    // hyperbolic radius of the orbit beads (0 = none)
    uniform int u_maxBounces;

    void main() {
        vec3 dir = normalize(vWorldPosition - u_cameraPos);
        // The eye is the ball origin (inside view keeps it there).
        vec4 P = vec4(0.0, 0.0, 0.0, 1.0);
        vec4 V = vec4(dir, 0.0);
        vec3 col = vec3(0.0);
        float trans = 1.0;
        float travelled = 0.0;
        vec3 first = vec3(0.0);
        bool haveFirst = false;
        vec3 sky = mix(u_bgColor, vec3(0.02, 0.025, 0.05), 0.5);

        for (int bnc = 0; bnc < 64; bnc++) {
            if (bnc >= u_maxBounces) break;
            // Nearest wall ahead.
            float sBest = 1e9; int kBest = -1;
            for (int k = 0; k < ${TESS_MAX_WALLS}; k++) {
                if (k >= u_wallCount) break;
                float a = mdot(u_walls[k], P), b = mdot(u_walls[k], V);
                if (b <= 1e-7) continue;               // not heading out through this wall
                float th = -a / b;
                if (th <= 1e-6 || th >= 1.0) continue;
                float s = atanh(th);
                if (s < sBest) { sBest = s; kBest = k; }
            }

            // A bead at the tile centre, if the segment passes close to it.
            if (u_beadRadius > 0.0) {
                float A = -mdot(P, u_center), Bv = -mdot(V, u_center);
                float sMax = kBest >= 0 ? sBest : 30.0;
                float sStar = abs(Bv) < A ? atanh(clamp(-Bv / A, -0.999999, 0.999999)) : -1.0;
                if (sStar > 0.0 && sStar < sMax) {
                    float cmin = sqrt(max(1.0, A * A - Bv * Bv));
                    float cr = cosh(u_beadRadius);
                    if (cmin < cr) {
                        float dist = travelled + sStar;
                        float fog = exp(-dist / u_fogDist);
                        float rim = acosh(cmin) / u_beadRadius;          // 0 centre → 1 rim
                        vec3 bead = mix(vec3(1.0, 0.85, 0.45), vec3(0.95, 0.55, 0.25), rim * rim);
                        bead *= 0.55 + 0.45 * sqrt(max(0.0, 1.0 - rim * rim));
                        col += trans * mix(sky, bead, fog);
                        trans = 0.0;
                        if (!haveFirst) { first = toBall(cosh(sStar) * P + sinh(sStar) * V); haveFirst = true; }
                        break;
                    }
                }
            }

            if (kBest < 0) {
                // Out to the sphere at infinity: a free face of the domain.
                col += trans * sky;
                trans = 0.0;
                break;
            }
            vec4 H = cosh(sBest) * P + sinh(sBest) * V;
            vec4 T = sinh(sBest) * P + cosh(sBest) * V;
            travelled += sBest;
            if (!haveFirst) { first = toBall(H); haveFirst = true; }

            // Distance along the face to its nearest edge: the other walls.
            float dEdge = 1e9;
            for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
                if (j >= u_wallCount) break;
                if (j == kBest) continue;
                dEdge = min(dEdge, asinh(max(0.0, -mdot(u_walls[j], H))));
            }
            float fog = exp(-travelled / u_fogDist);
            float edge = 1.0 - smoothstep(u_edgeWidth * 0.6, u_edgeWidth, dEdge);
            vec3 face = u_wallColor[kBest];
            face = mix(face, mix(face, vec3(1.0), 0.55), u_lightMode);
            vec3 lineCol = mix(vec3(0.92, 0.95, 1.0), vec3(0.08, 0.1, 0.16), u_lightMode);
            vec3 surf = mix(face, lineCol, edge);
            float alpha = mix(u_faceAlpha, 0.95, edge);
            col += trans * alpha * mix(sky, surf, fog);
            trans *= 1.0 - alpha;
            if (trans < 0.02) break;

            // Through the face: the pairing carries the ray into the partner face.
            mat4 L = u_pair[kBest];
            P = L * H;
            V = L * T;
            P /= sqrt(max(1e-12, -mdot(P, P)));
            V += mdot(V, P) * P;
            V /= sqrt(max(1e-12, mdot(V, V)));
        }
        col += trans * sky;
        gl_FragDepth = haveFirst ? depthOf(first) : 0.999;
        gl_FragColor = vec4(col, u_opacity);
    }
`;

export const honeycombFragmentShader = common + `
    uniform float u_tube;          // hyperbolic tube radius around the edges
    uniform float u_rmax;          // Euclidean radius of the rendered ball
    uniform int u_maxFolds;

    // Fold X into the domain through the pairings; A accumulates the moves.
    int fold(inout vec4 X, inout mat4 A) {
        int n = 0;
        for (int it = 0; it < 48; it++) {
            if (it >= u_maxFolds) break;
            float worst = 1e-6; int k = -1;
            for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
                if (j >= u_wallCount) break;
                float v = mdot(u_walls[j], X);
                if (v > worst) { worst = v; k = j; }
            }
            if (k < 0) break;
            X = u_pair[k] * X;
            A = u_pair[k] * A;
            n++;
        }
        return n;
    }

    // Distance (hyperbolic) from a folded point to the domain's edges, and the
    // two walls that meet there.
    float edgeDistance(vec4 X, out int wa, out int wb) {
        float d1 = 1e9, d2 = 1e9;
        wa = -1; wb = -1;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            float d = asinh(max(0.0, -mdot(u_walls[j], X)));
            if (d < d1) { d2 = d1; wb = wa; d1 = d; wa = j; }
            else if (d < d2) { d2 = d; wb = j; }
        }
        return sqrt(d1 * d1 + d2 * d2);
    }

    float sdEdges(vec3 p, mat4 A) {
        vec4 X = A * toHyp(p);
        int wa, wb;
        mat4 A2 = A;
        fold(X, A2);
        return edgeDistance(X, wa, wb);
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;
        // Clip the ray to the rendered ball.
        float b = dot(ro, rd), c = dot(ro, ro) - u_rmax * u_rmax;
        float disc = b * b - c;
        if (disc <= 0.0) discard;
        float t0 = max(0.0, -b - sqrt(disc)), t1 = -b + sqrt(disc);
        if (t1 <= 0.0) discard;

        mat4 A = mat4(1.0);
        float t = t0 + 1e-4;
        bool hit = false;
        int wa = -1, wb = -1;
        for (int i = 0; i < 140; i++) {
            vec3 p = ro + rd * t;
            float r2 = dot(p, p);
            if (t > t1 || r2 >= u_rmax * u_rmax) break;
            vec4 X = A * toHyp(p);
            fold(X, A);
            float d = edgeDistance(X, wa, wb) - u_tube;
            if (d < 1e-3) { hit = true; break; }
            // Hyperbolic → Euclidean step at p: ds_E = ds_H (1 − |p|²)/2.
            t += max(0.8 * d * (1.0 - r2) * 0.5, 2e-4);
        }
        if (!hit) discard;

        vec3 p = ro + rd * t;
        // Normal by central differences of the edge distance (same fold).
        vec2 e = vec2(1.5e-3 * (1.0 - dot(p, p)), 0.0);
        vec3 n = normalize(vec3(
            sdEdges(p + e.xyy, A) - sdEdges(p - e.xyy, A),
            sdEdges(p + e.yxy, A) - sdEdges(p - e.yxy, A),
            sdEdges(p + e.yyx, A) - sdEdges(p - e.yyx, A)));
        vec3 base = 0.5 * (u_wallColor[wa] + u_wallColor[wb]);
        // The fundamental domain's own edges stand out: p itself lies in D.
        vec4 Xp = toHyp(p);
        bool inD = true;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            if (mdot(u_walls[j], Xp) > u_tube) { inD = false; break; }
        }
        if (inD) base = mix(base, vec3(1.0, 0.92, 0.6), 0.65);
        base = mix(base, mix(base, vec3(1.0), 0.45), u_lightMode);
        vec3 L = normalize(vec3(1.0, 1.0, 1.0));
        float diff = max(0.25, dot(n, L));
        float spec = pow(max(0.0, dot(reflect(-L, n), -rd)), 24.0);
        vec3 col = base * diff + 0.35 * spec;
        float fog = smoothstep(0.55, 1.0, length(p) / u_rmax);
        col = mix(col, u_bgColor, fog * 0.9);
        gl_FragDepth = depthOf(p);
        gl_FragColor = vec4(col, u_opacity);
    }
`;

/**
 * Uniform arrays for a domain whose walls and pairings are in the scene frame.
 * Returns false when the domain has more walls than the shaders can hold or a
 * wall is unpaired (the view needs every face to continue through).
 */
export function loadTessellationUniforms(uniforms, domain, colors) {
    const walls = domain ? domain.walls : [];
    if (walls.length === 0 || walls.length > TESS_MAX_WALLS) return false;
    if (walls.some(w => !w.pairing)) return false;
    walls.forEach((w, i) => {
        uniforms.u_walls.value[i].copy(w.cov);
        const L = lorentzMatrix(w.pairing.matrix);
        uniforms.u_pair.value[i].set(...L);
        const c = colors[i] || [0.6, 0.6, 0.7];
        uniforms.u_wallColor.value[i].set(c[0], c[1], c[2]);
    });
    uniforms.u_wallCount.value = walls.length;
    return true;
}

export function makeTessellationUniforms() {
    return {
        u_walls: { value: Array.from({ length: TESS_MAX_WALLS }, () => new THREE.Vector4()) },
        u_pair: { value: Array.from({ length: TESS_MAX_WALLS }, () => new THREE.Matrix4()) },
        u_wallColor: { value: Array.from({ length: TESS_MAX_WALLS }, () => new THREE.Vector3()) },
        u_wallCount: { value: 0 },
        u_center: { value: new THREE.Vector4(0, 0, 0, 1) },
        u_faceAlpha: { value: 0.1 },
        u_edgeWidth: { value: 0.035 },
        u_fogDist: { value: 5.5 },
        u_beadRadius: { value: 0.07 },
        u_maxBounces: { value: 40 },
        u_tube: { value: 0.03 },
        u_rmax: { value: 0.94 },
        u_maxFolds: { value: 24 },
    };
}
