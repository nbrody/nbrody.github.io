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
 *    pass over the walls. Edges are coloured by edge cycle, so all the tiles
 *    around an edge (which fold to different edges of its cycle) agree on
 *    its colour. With walls shown, the ray instead walks from tile to tile
 *    (its exit from each is a closed-form quadratic) and lays each wall it
 *    crosses down as a translucent film.
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
    // Texel (a, b): rgb = colour of the edge cycle through the edge where
    // walls a and b meet; alpha = 1 if they meet in an edge of the domain.
    uniform sampler2D u_edgeTex;
    uniform bool u_edgesKnown;     // false: no edge cycles, use the nearest two walls
    uniform float u_wallAlpha;     // opacity of each tile's walls (0 = hidden)

    vec4 edgeInfo(int a, int b) {
        return texture2D(u_edgeTex, (vec2(float(a), float(b)) + 0.5) / ${TESS_MAX_WALLS}.0);
    }

    // The wall X lies furthest outside of, or -1 when X is in the domain.
    int worstWall(vec4 X) {
        float worst = 1e-6; int k = -1;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            float v = mdot(u_walls[j], X);
            if (v > worst) { worst = v; k = j; }
        }
        return k;
    }

    // Fold X into the domain through the pairings; A accumulates the moves.
    int fold(inout vec4 X, inout mat4 A) {
        int n = 0;
        for (int it = 0; it < 48; it++) {
            if (it >= u_maxFolds) break;
            int k = worstWall(X);
            if (k < 0) break;
            X = u_pair[k] * X;
            A = u_pair[k] * A;
            n++;
        }
        return n;
    }

    // Hyperbolic distance from X to the geodesic where walls a and b meet:
    // the part of X in span(W_a, W_b) has Minkowski norm sinh(d).
    float lineDistance(vec4 X, int a, int b) {
        float c = mdot(u_walls[a], u_walls[b]);
        float det = 1.0 - c * c;
        if (det < 1e-6) return 1e9;                    // the walls do not meet
        float x = mdot(u_walls[a], X), y = mdot(u_walls[b], X);
        return asinh(sqrt(max(0.0, (x * x - 2.0 * c * x * y + y * y) / det)));
    }

    // Distance (hyperbolic) from a folded point to the domain's edges, and the
    // two walls of the nearest one. An edge lies in two walls, so it is no
    // nearer than the second-nearest wall: the edges among the three nearest
    // walls are measured exactly, and every other edge is at least as far as
    // the third. The exact distance keeps each tube round, so the tiles
    // around an edge draw one tube rather than slabs of different radii.
    float edgeDistance(vec4 X, out int wa, out int wb) {
        float d1 = 1e9, d2 = 1e9, d3 = 1e9;
        int i1 = -1, i2 = -1, i3 = -1;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            float d = asinh(max(0.0, -mdot(u_walls[j], X)));
            if (d < d1) { d3 = d2; i3 = i2; d2 = d1; i2 = i1; d1 = d; i1 = j; }
            else if (d < d2) { d3 = d2; i3 = i2; d2 = d; i2 = j; }
            else if (d < d3) { d3 = d; i3 = j; }
        }
        wa = i1; wb = i2;
        if (!u_edgesKnown || i3 < 0) return sqrt(d1 * d1 + d2 * d2);
        float best = d3;
        if (edgeInfo(i1, i2).a > 0.5) {
            float d = lineDistance(X, i1, i2);
            if (d < best) { best = d; wa = i1; wb = i2; }
        }
        if (edgeInfo(i1, i3).a > 0.5) {
            float d = lineDistance(X, i1, i3);
            if (d < best) { best = d; wa = i1; wb = i3; }
        }
        if (edgeInfo(i2, i3).a > 0.5) {
            float d = lineDistance(X, i2, i3);
            if (d < best) { best = d; wa = i2; wb = i3; }
        }
        return best;
    }

    // A fold that is (nearly) the identity: the tile is the domain itself.
    bool isHome(mat4 M) {
        return abs(M[0][0] - 1.0) + abs(M[1][1] - 1.0) + abs(M[2][2] - 1.0) + abs(M[3][3] - 1.0)
            + abs(M[3][0]) + abs(M[3][1]) + abs(M[3][2]) < 0.02;
    }

    // Wall k of the tile folded by A, in the scene frame:
    // <W, A X> = <J A^T J W, X> = w.X - w0 X_w.
    void sceneWall(int k, mat4 A, out vec3 w, out float w0) {
        vec4 JW = vec4(u_walls[k].xyz, -u_walls[k].w);
        w = vec3(dot(A[0], JW), dot(A[1], JW), dot(A[2], JW));
        w0 = -dot(A[3], JW);
    }

    // Where the ray p = ro + t rd leaves the tile folded by A, after t: the
    // first wall it goes out through (k), or 1e9. At p, <W, X(p)> has the
    // sign of g = 2 w.p - w0 (1 + |p|^2), a quadratic in t, and the ray
    // leaves through a root where g is increasing.
    float tileExit(mat4 A, vec3 ro, vec3 rd, float t, out int k) {
        float best = 1e9;
        k = -1;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            vec3 w; float w0;
            sceneWall(j, A, w, w0);
            float qa = -w0;
            float qb = 2.0 * (dot(w, rd) - w0 * dot(ro, rd));
            float qc = 2.0 * dot(w, ro) - w0 * (1.0 + dot(ro, ro));
            float r1 = 1e9, r2 = 1e9;
            if (abs(qa) <= 1e-7 * abs(qb)) r1 = -qc / qb;
            else {
                float disc = qb * qb - 4.0 * qa * qc;
                if (disc < 0.0) continue;
                float q = -0.5 * (qb + (qb >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
                r1 = q / qa;
                r2 = q != 0.0 ? qc / q : r1;
            }
            if (r1 > t && r1 < best && 2.0 * qa * r1 + qb > 0.0) { best = r1; k = j; }
            if (r2 > t && r2 < best && 2.0 * qa * r2 + qb > 0.0) { best = r2; k = j; }
        }
        return best;
    }

    // Lay wall (w, w0), a copy of the domain's wall k, down where the ray
    // crosses it: a translucent film, front to back, in the colour its
    // pairing class has on the domain.
    void film(vec3 w, float w0, int k, vec3 ro, vec3 rd, float tc, bool home,
              inout vec3 acc, inout float trans) {
        vec3 p = ro + rd * tc;
        vec3 n = normalize(w - w0 * p);
        float ndv = abs(dot(n, rd));
        vec3 c = u_wallColor[k];
        c = mix(c, mix(c, vec3(1.0), 0.45), u_lightMode);
        // A soap film: faint face-on, stronger where it is seen edge-on.
        float rim = pow(max(0.0, 1.0 - ndv), 3.0);
        vec3 col = c * (0.55 + 0.45 * ndv) + (0.3 - 0.3 * u_lightMode) * rim;
        // Tiles shrink toward the sphere at infinity and their walls crowd
        // in, so a wall's opacity follows the conformal factor 1 - r^2: the
        // films thin out there instead of frosting over the ball. The
        // domain's own walls stay strong out to their circles at infinity.
        float r = length(p) / u_rmax;
        float fade = home ? 1.0 - 0.6 * smoothstep(0.85, 1.0, r) : 1.0 - r * r;
        float a = u_wallAlpha * (0.45 + 0.9 * rim) * (home ? 2.0 : 1.0);
        a = min(0.85, a) * fade;
        acc += trans * a * col;
        trans *= 1.0 - a;
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

        // March from the ball's surface: small coordinates keep the wall
        // crossings precise.
        ro += rd * t0;
        t1 -= t0;
        mat4 A = mat4(1.0);
        float t = 1e-4;
        bool hit = false;
        bool walls = u_wallAlpha > 0.0;
        // With walls the ray walks from tile to tile exactly: it leaves the
        // current tile at tx, through wall kx. (Inferring crossings from the
        // fold would follow the fold's path, not the ray's.)
        bool walking = false;
        float tx = 1e9;
        int kx = -1;
        vec3 acc = vec3(0.0);
        float trans = 1.0;
        int wa = -1, wb = -1;
        for (int i = 0; i < 140; i++) {
            vec3 p = ro + rd * t;
            float r2 = dot(p, p);
            if (t > t1 || r2 >= u_rmax * u_rmax) break;
            vec4 X = A * toHyp(p);
            if (!walls) fold(X, A);
            else if (!walking || worstWall(X) >= 0) {
                // The first sample, or the walk lost its tile: fold back in.
                fold(X, A);
                walking = worstWall(X) < 0;
                tx = walking ? tileExit(A, ro, rd, t, kx) : 1e9;
            }
            float d = edgeDistance(X, wa, wb) - u_tube;
            if (d < 1e-3) { hit = true; break; }
            // Hyperbolic → Euclidean step at p: ds_E = ds_H (1 − |p|²)/2.
            float tn = t + max(0.8 * d * (1.0 - r2) * 0.5, 2e-4);
            if (walking) {
                for (int c = 0; c < 24; c++) {
                    if (tx >= tn || tx > t1 || kx < 0) break;
                    mat4 A2 = u_pair[kx] * A;
                    vec3 w; float w0;
                    sceneWall(kx, A, w, w0);
                    film(w, w0, kx, ro, rd, tx, isHome(A) || isHome(A2), acc, trans);
                    A = A2;
                    tx = tileExit(A, ro, rd, tx, kx);
                }
                if (trans < 0.03) break;
            }
            t = tn;
        }
        if (!hit) {
            // Only walls on this ray (or nothing).
            float cover = 1.0 - trans;
            if (cover < 0.004) discard;
            gl_FragDepth = 0.999;
            gl_FragColor = vec4(acc / cover, cover * u_opacity);
            return;
        }

        vec3 p = ro + rd * t;
        // Normal by central differences of the edge distance (same fold).
        vec2 e = vec2(1.5e-3 * (1.0 - dot(p, p)), 0.0);
        vec3 n = normalize(vec3(
            sdEdges(p + e.xyy, A) - sdEdges(p - e.xyy, A),
            sdEdges(p + e.yxy, A) - sdEdges(p - e.yxy, A),
            sdEdges(p + e.yyx, A) - sdEdges(p - e.yyx, A)));
        // One colour per edge cycle: every tile around the edge agrees.
        vec4 info = edgeInfo(wa, wb);
        vec3 edgeCol = (u_edgesKnown && info.a > 0.5) ? info.rgb : 0.5 * (u_wallColor[wa] + u_wallColor[wb]);
        vec3 base = mix(edgeCol, vec3(1.0), 0.12);
        // The fundamental domain's own edges stand out: p itself lies in D.
        vec4 Xp = toHyp(p);
        bool inD = true;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            if (mdot(u_walls[j], Xp) > u_tube) { inD = false; break; }
        }
        if (inD) base = mix(base, vec3(1.0, 0.92, 0.6), 0.65);
        base = mix(base, mix(base, vec3(1.0), 0.15), u_lightMode);
        // A headlight, so whatever faces the camera is lit however the ball is
        // turned, plus a key light for shape, a highlight, and a rim that
        // outlines each tube against the background: bright on the dark
        // theme, dark on the light one.
        vec3 V = -rd;
        float ndv = dot(n, V);
        if (ndv < 0.0) { n = -n; ndv = -ndv; }      // the fold can flip the gradient
        vec3 key = normalize(vec3(0.5, 0.8, 0.6));
        float diff = 0.3 + 0.55 * ndv + 0.3 * max(0.0, dot(n, key));
        float spec = pow(max(0.0, dot(n, normalize(key + V))), 32.0);
        float rim = pow(max(0.0, 1.0 - ndv), 3.0);
        vec3 rimCol = mix(mix(base, vec3(1.0), 0.6), base * 0.4, u_lightMode);
        vec3 col = mix(base * diff + (0.25 - 0.1 * u_lightMode) * spec, rimCol, 0.4 * rim);
        // Fog only near the sphere at infinity, where the tubes shrink below a pixel.
        float fog = smoothstep(0.72, 1.0, length(p) / u_rmax);
        col = mix(col, u_bgColor, fog * 0.75);
        gl_FragDepth = depthOf(p);
        gl_FragColor = vec4(acc + trans * col, u_opacity);
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

/**
 * The honeycomb's edge table from the certificate's edge cycles: texel (a, b)
 * gets the colour `colorOf(k)` of the cycle k through the edge where walls a
 * and b meet. `cycles` null (no certificate) falls back to the nearest walls.
 */
export function loadEdgeCycles(uniforms, cycles, colorOf) {
    const tex = uniforms.u_edgeTex.value;
    if (tex.userData.cycles === cycles) return;
    tex.userData.cycles = cycles;
    const N = TESS_MAX_WALLS, data = tex.image.data;
    data.fill(0);
    (cycles || []).forEach((c, k) => {
        const rgb = colorOf(k).map(x => Math.round(255 * Math.min(1, Math.max(0, x))));
        for (const [a, b] of c.pairs || []) {
            if (a >= N || b >= N) continue;
            data.set([...rgb, 255], 4 * (b * N + a));
            data.set([...rgb, 255], 4 * (a * N + b));
        }
    });
    uniforms.u_edgesKnown.value = Array.isArray(cycles);
    tex.needsUpdate = true;
}

function makeEdgeTexture() {
    const N = TESS_MAX_WALLS;
    const tex = new THREE.DataTexture(new Uint8Array(4 * N * N), N, N, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
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
        u_edgeTex: { value: makeEdgeTexture() },
        u_edgesKnown: { value: false },
        u_wallAlpha: { value: 0 },
    };
}
