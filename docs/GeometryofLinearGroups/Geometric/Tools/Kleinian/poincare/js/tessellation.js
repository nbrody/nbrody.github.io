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
// Edges of the domain the honeycomb can hold (an index + 1 must fit in a byte).
export const TESS_MAX_EDGES = 254;

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
    // Texel (a, b): rgb = colour of the edge where walls a and b meet (its
    // edge cycle's), alpha = that edge's index + 1 (0: they meet in no edge).
    uniform sampler2D u_edgeTex;
    // Texels (0, e) and (1, e): the ends of edge e on the hyperboloid, unit
    // timelike at a finite vertex, lightlike at an ideal one.
    uniform sampler2D u_edgeEnds;
    uniform bool u_edgesKnown;     // false: no polyhedron, use the nearest two walls
    uniform float u_wallAlpha;     // opacity of each tile's walls (0 = hidden)
    uniform float u_faceFill;      // how far each face fills in from its edges, of its inradius (0 = none)
    uniform vec4 u_center;         // the domain's centre (scene frame)
    uniform float u_faceReach;     // faces are drawn on tiles whose centre is within acosh(this) of it
    uniform vec4 u_faceRadius[${TESS_MAX_WALLS / 4}];   // each face's inradius, four to a vec4

    vec4 edgeInfo(int a, int b) {
        return texture2D(u_edgeTex, (vec2(float(a), float(b)) + 0.5) / ${TESS_MAX_WALLS}.0);
    }

    // The edge where walls a and b meet (its index), or -1.
    int edgeAt(int a, int b) {
        return int(edgeInfo(a, b).a * 255.0 + 0.5) - 1;
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

    // Hyperbolic distance between points of the hyperboloid, from the chord:
    // <X - V, X - V> = 4 sinh²(d/2). (acosh(-<X, V>) loses the small
    // distances of a tube to cancellation, and the tube's shading speckles.)
    float pointDistance(vec4 X, vec4 V) {
        vec4 c = X - V;
        return 2.0 * asinh(0.5 * sqrt(max(0.0, mdot(c, c))));
    }

    // The unit tangent at the finite end V of an edge, along the edge toward
    // its other end E (finite or ideal).
    vec4 tangentAt(vec4 V, vec4 E) {
        float m = mdot(E, V);
        return (E + m * V) / sqrt(max(1e-12, mdot(E, E) + m * m));
    }

    // Hyperbolic distance from X to edge e (walls a, b): to its line between
    // the planes through its ends perpendicular to it, else to the nearer end.
    // The whole line would draw the edge on past its ends, and a short edge's
    // line can hug a neighbouring face, doubling the edge there.
    // (dl: the distance to the whole line, already known.)
    float edgeSegmentDistance(vec4 X, int e, float dl) {
        float y = (float(e) + 0.5) / ${TESS_MAX_EDGES}.0;
        vec4 V0 = texture2D(u_edgeEnds, vec2(0.25, y));
        vec4 V1 = texture2D(u_edgeEnds, vec2(0.75, y));
        if (mdot(V0, V0) < -0.5 && mdot(tangentAt(V0, V1), X) < 0.0) return pointDistance(X, V0);
        if (mdot(V1, V1) < -0.5 && mdot(tangentAt(V1, V0), X) < 0.0) return pointDistance(X, V1);
        return dl;
    }

    // The point of edge e (walls a, b) nearest X: an end, or the foot on its line.
    vec4 nearestOnEdge(vec4 X, int a, int b, int e) {
        float y = (float(e) + 0.5) / ${TESS_MAX_EDGES}.0;
        vec4 V0 = texture2D(u_edgeEnds, vec2(0.25, y));
        vec4 V1 = texture2D(u_edgeEnds, vec2(0.75, y));
        if (mdot(V0, V0) < -0.5 && mdot(tangentAt(V0, V1), X) < 0.0) return V0;
        if (mdot(V1, V1) < -0.5 && mdot(tangentAt(V1, V0), X) < 0.0) return V1;
        vec4 Wa = u_walls[a], Wb = u_walls[b];
        float c = mdot(Wa, Wb), x = mdot(Wa, X), z = mdot(Wb, X);
        float det = max(1e-9, 1.0 - c * c);
        vec4 L = X - ((x - c * z) / det) * Wa - ((z - c * x) / det) * Wb;
        return L / sqrt(max(1e-12, -mdot(L, L)));
    }

    // The tube's outward normal at scene point p, whose fold is X = A p: away
    // from the nearest edge point Q, carried back by A⁻¹ = J Aᵀ J and into the
    // ball. Exact, where differences of the folded distance pick up its small
    // jumps across walls at the vertices (and speckle).
    vec3 tubeNormal(vec3 p, vec4 X, mat4 A, vec4 Q) {
        vec4 G = -(Q + mdot(Q, X) * X);
        vec4 JG = vec4(G.xyz, -G.w);
        vec4 g = vec4(dot(A[0], JG), dot(A[1], JG), dot(A[2], JG), dot(A[3], JG));
        vec4 Gs = vec4(g.xyz, -g.w);
        vec4 Xs = toHyp(p);
        float q = 1.0 + Xs.w;
        return normalize(Gs.xyz / q - Xs.xyz * Gs.w / (q * q));
    }

    // Measure the edge of walls a, b (if any) unless it cannot beat best: it
    // is no nearer than either wall (lb) nor than its whole line.
    void tryEdge(vec4 X, int a, int b, float lb, inout float best, inout int wa, inout int wb) {
        if (lb >= best) return;
        int e = edgeAt(a, b);
        if (e < 0) return;
        float dl = lineDistance(X, a, b);
        if (dl >= best) return;
        float d = edgeSegmentDistance(X, e, dl);
        if (d < best) { best = d; wa = a; wb = b; }
    }

    // Distance (hyperbolic) from a folded point to the domain's edges, the two
    // walls of the nearest edge, and a bound for the rest. An edge lies in two
    // walls, so it is no nearer than either. Every edge between two of the
    // walls within 1.5 tube radii is measured exactly; any other
    // edge is at least as far as the nearest wall beyond that, and as the
    // second-nearest wall. So a hit is always on a measured edge, and the
    // bound only limits the march's steps.
    // Slot i of eight held in two ivec4s / vec4s: registers, where a local
    // array would spill (and cost a third of the frame).
    int slotOf(ivec4 a, ivec4 b, int i) {
        ivec4 v = i < 4 ? a : b;
        int m = i - 4 * (i / 4);
        return m == 0 ? v.x : m == 1 ? v.y : m == 2 ? v.z : v.w;
    }
    float slotOf(vec4 a, vec4 b, int i) {
        vec4 v = i < 4 ? a : b;
        int m = i - 4 * (i / 4);
        return m == 0 ? v.x : m == 1 ? v.y : m == 2 ? v.z : v.w;
    }

    float edgeDistance(vec4 X, out int wa, out int wb, out float bound) {
        float d1 = 1e9, d2 = 1e9, far = 1e9;
        int i1 = -1, i2 = -1, n = 0;
        ivec4 w0 = ivec4(-1), w1 = ivec4(-1);
        vec4 e0 = vec4(0.0), e1 = vec4(0.0);
        float reach = 1.5 * u_tube;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            float d = asinh(abs(mdot(u_walls[j], X)));
            if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = j; }
            else if (d < d2) { d2 = d; i2 = j; }
            if (d < reach && n < 8) {
                if (n == 0) { w0.x = j; e0.x = d; }
                else if (n == 1) { w0.y = j; e0.y = d; }
                else if (n == 2) { w0.z = j; e0.z = d; }
                else if (n == 3) { w0.w = j; e0.w = d; }
                else if (n == 4) { w1.x = j; e1.x = d; }
                else if (n == 5) { w1.y = j; e1.y = d; }
                else if (n == 6) { w1.z = j; e1.z = d; }
                else { w1.w = j; e1.w = d; }
                n++;
            } else far = min(far, d);
        }
        wa = i1; wb = i2;
        if (!u_edgesKnown) { bound = sqrt(d1 * d1 + d2 * d2); return bound; }
        bound = max(d2, far);
        float best = 1e9;
        // Dynamic bounds keep the compiler from unrolling 64 copies of tryEdge.
        for (int p = 0; p < n; p++) {
            for (int q = p + 1; q < n; q++) {
                tryEdge(X, slotOf(w0, w1, p), slotOf(w0, w1, q),
                        max(slotOf(e0, e1, p), slotOf(e0, e1, q)), best, wa, wb);
            }
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

    float faceRadius(int k) {
        vec4 r = u_faceRadius[k / 4];
        int m = k - 4 * (k / 4);
        return m == 0 ? r.x : m == 1 ? r.y : m == 2 ? r.z : r.w;
    }

    // Distance within face k from X, a point of wall k of the domain, to the
    // face's edges: the nearest of the lines where wall k meets another wall.
    float faceEdgeDistance(vec4 X, int k) {
        float best = 1e9;
        for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
            if (j >= u_wallCount) break;
            if (j == k) continue;
            float c = mdot(u_walls[j], u_walls[k]);
            float s = 1.0 - c * c;
            if (s < 1e-6) continue;              // the walls do not meet
            best = min(best, asinh(abs(mdot(u_walls[j], X)) / sqrt(s)));
        }
        return best;
    }

    // Is the tile folded by M (the tile M⁻¹ D) one whose faces are drawn: its
    // centre M⁻¹ c near the domain's centre c? <c, M⁻¹ c> = −cosh d, with
    // M⁻¹ = J Mᵀ J.
    bool tileShown(mat4 M) {
        vec4 Jc = vec4(u_center.xyz, -u_center.w);
        vec4 v = vec4(dot(M[0], Jc), dot(M[1], Jc), dot(M[2], Jc), dot(M[3], Jc));
        return -(dot(u_center.xyz, v.xyz) + u_center.w * v.w) <= u_faceReach;
    }

    // Face k of the tile folded by A (into the tile folded by A2), crossed at
    // tc, filled in from its edges out to u_faceFill of its inradius: an
    // opaque band lit like the tubes, its inner rim smoothed over a pixel.
    // Seen from outside the ball every ray meets the outer tiles first, so
    // only the cells around the domain get faces: whole cells, solid.
    float layFace(int k, mat4 A, mat4 A2, vec3 w, float w0, vec3 ro, vec3 rd, float tc, float pixAngle,
                  bool home, inout vec3 acc, inout float trans) {
        if (u_faceFill <= 0.0) return 0.0;
        if (!tileShown(A) && !tileShown(A2)) return 0.0;
        vec3 p = ro + rd * tc;
        vec3 n = normalize(w - w0 * p);
        float de = faceEdgeDistance(A * toHyp(p), k);
        float reach = u_faceFill * faceRadius(k);
        float r2 = dot(p, p);
        float fp = tc * pixAngle / max(0.15, abs(dot(n, rd))) * 2.0 / max(1e-3, 1.0 - r2);
        float cover = u_faceFill >= 0.999 ? 1.0 : clamp((reach - de) / fp + 0.5, 0.0, 1.0);
        if (cover <= 0.0) return 0.0;
        vec3 base = mix(vec3(0.6, 0.62, 0.66), u_wallColor[k], 0.3);
        if (home) base = mix(base, vec3(1.0, 0.92, 0.6), 0.35);
        base = mix(base, mix(base, vec3(1.0), 0.35), u_lightMode);
        vec3 V = -rd;
        if (dot(n, V) < 0.0) n = -n;
        float ndv = dot(n, V);
        vec3 key = normalize(vec3(0.5, 0.8, 0.6));
        float diff = 0.3 + 0.55 * ndv + 0.3 * max(0.0, dot(n, key));
        float spec = pow(max(0.0, dot(n, normalize(key + V))), 24.0);
        vec3 col = base * diff + (0.18 - 0.08 * u_lightMode) * spec;
        float fog = smoothstep(0.72, 1.0, sqrt(r2) / u_rmax);
        col = mix(col, u_bgColor, fog * 0.75);
        acc += trans * cover * col;
        trans *= 1.0 - cover;
        return cover;
    }

    float sdEdges(vec3 p, mat4 A) {
        vec4 X = A * toHyp(p);
        int wa, wb;
        float bound;
        mat4 A2 = A;
        fold(X, A2);
        return edgeDistance(X, wa, wb, bound);
    }

    void main() {
        vec3 rd = normalize(vWorldPosition - u_cameraPos);
        vec3 ro = u_cameraPos;
        // The angle one pixel spans (taken while every pixel is still running).
        float pixAngle = max(length(dFdx(rd)), length(dFdy(rd)));
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
        bool walls = u_wallAlpha > 0.0 || u_faceFill > 0.0;
        // With walls or faces the ray walks from tile to tile exactly: it
        // leaves the current tile at tx, through wall kx. (Inferring crossings
        // from the fold would follow the fold's path, not the ray's.)
        bool walking = false;
        float tx = 1e9;
        int kx = -1;
        vec3 acc = vec3(0.0);
        float trans = 1.0;
        int wa = -1, wb = -1;
        float tDepth = -1.0;             // where the ray became mostly covered
        vec4 Xhit = vec4(0.0, 0.0, 0.0, 1.0);
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
            float bound;
            float de = edgeDistance(X, wa, wb, bound);
            if (de - u_tube < 1e-3) { hit = true; Xhit = X; break; }
            // Hyperbolic → Euclidean step at p: ds_E = ds_H (1 − |p|²)/2.
            float ds = min(de, bound) - u_tube;
            float tn = t + max(0.8 * ds * (1.0 - r2) * 0.5, 2e-4);
            if (walking) {
                for (int c = 0; c < 24; c++) {
                    if (tx >= tn || tx > t1 || kx < 0 || trans < 0.03) break;
                    mat4 A2 = u_pair[kx] * A;
                    vec3 w; float w0;
                    sceneWall(kx, A, w, w0);
                    bool home = isHome(A) || isHome(A2);
                    float before = trans;
                    layFace(kx, A, A2, w, w0, ro, rd, tx, pixAngle, home, acc, trans);
                    if (u_wallAlpha > 0.0) film(w, w0, kx, ro, rd, tx, home, acc, trans);
                    if (before > 0.5 && trans <= 0.5) tDepth = tx;
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
            gl_FragDepth = tDepth > 0.0 ? depthOf(ro + rd * tDepth) : 0.999;
            gl_FragColor = vec4(acc / cover, cover * u_opacity);
            return;
        }

        vec3 p = ro + rd * t;
        vec3 n;
        if (u_edgesKnown) n = tubeNormal(p, Xhit, A, nearestOnEdge(Xhit, wa, wb, edgeAt(wa, wb)));
        else {
            // Normal by central differences of the edge distance (same fold).
            vec2 e = vec2(1.5e-3 * (1.0 - dot(p, p)), 0.0);
            n = normalize(vec3(
                sdEdges(p + e.xyy, A) - sdEdges(p - e.xyy, A),
                sdEdges(p + e.yxy, A) - sdEdges(p - e.yxy, A),
                sdEdges(p + e.yyx, A) - sdEdges(p - e.yyx, A)));
        }
        // One colour per edge cycle: every tile around the edge agrees.
        vec3 edgeCol = u_edgesKnown ? edgeInfo(wa, wb).rgb : 0.5 * (u_wallColor[wa] + u_wallColor[wb]);
        vec3 base = mix(edgeCol, vec3(1.0), 0.12);
        // The fundamental domain's own edges stand out: p lies on the tube of
        // one of them, unfolded. (Asking whether p is within a tube's width of
        // D flickered where that line crossed other tubes.)
        int ha, hb;
        float hbound;
        vec4 Xp = toHyp(p);
        bool inD = u_edgesKnown && edgeDistance(Xp, ha, hb, hbound) < u_tube + 2e-3;
        if (!u_edgesKnown) {
            inD = true;
            for (int j = 0; j < ${TESS_MAX_WALLS}; j++) {
                if (j >= u_wallCount) break;
                if (mdot(u_walls[j], Xp) > u_tube) { inD = false; break; }
            }
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
        gl_FragDepth = depthOf(tDepth > 0.0 ? ro + rd * tDepth : p);
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
 * The honeycomb's edges, from the home domain's polyhedron. Texel (a, b) of
 * u_edgeTex gets the colour of the edge where walls a and b meet (its edge
 * cycle's colour `colorOf(k)`, from the certificate's `cycles`, else the mean
 * of the two walls' `wallColors`) and its index + 1. Row e of u_edgeEnds holds
 * the edge's two ends, carried into the scene frame by `L` (the row-major
 * Lorentz matrix of the scene isometry, as lorentzMatrix returns it). Without
 * a polyhedron the shader falls back to the nearest walls.
 */
export function loadEdges(uniforms, home, cycles, colorOf, wallColors, L) {
    const tex = uniforms.u_edgeTex.value, endsTex = uniforms.u_edgeEnds.value;
    const edges = home && home.poly ? home.poly.edges : null;
    const ok = !!edges && edges.length <= TESS_MAX_EDGES && home.walls.length <= TESS_MAX_WALLS;
    uniforms.u_edgesKnown.value = ok;
    if (!ok) return;
    const memo = tex.userData;
    if (memo.home !== home || memo.cycles !== cycles || memo.colors !== wallColors) {
        Object.assign(memo, { home, cycles, colors: wallColors, ends: homeEdgeEnds(edges) });
        const N = TESS_MAX_WALLS, data = tex.image.data;
        data.fill(0);
        const cycleOf = new Map();
        (cycles || []).forEach((c, k) => (c.pairs || []).forEach(([a, b]) => cycleOf.set(Math.min(a, b) * N + Math.max(a, b), k)));
        edges.forEach((e, idx) => {
            const k = cycleOf.get(Math.min(e.i, e.j) * N + Math.max(e.i, e.j));
            const ca = wallColors[e.i] || [0.6, 0.6, 0.7], cb = wallColors[e.j] || [0.6, 0.6, 0.7];
            const c = k !== undefined ? colorOf(k) : ca.map((x, m) => 0.5 * (x + cb[m]));
            const texel = [...c.map(x => Math.round(255 * Math.min(1, Math.max(0, x)))), idx + 1];
            data.set(texel, 4 * (e.j * N + e.i));
            data.set(texel, 4 * (e.i * N + e.j));
        });
        tex.needsUpdate = true;
    }
    // Into the scene frame (every time the view moves).
    const src = memo.ends, out = endsTex.image.data;
    for (let q = 0; q < src.length; q += 4) {
        for (let r = 0; r < 4; r++) {
            out[q + r] = L[4 * r] * src[q] + L[4 * r + 1] * src[q + 1] + L[4 * r + 2] * src[q + 2] + L[4 * r + 3] * src[q + 3];
        }
    }
    endsTex.needsUpdate = true;
}

/** Ends of each edge on the hyperboloid (home frame): lightlike where the end is ideal. */
function homeEdgeEnds(edges) {
    const out = new Float32Array(8 * edges.length);
    edges.forEach((e, idx) => {
        [e.lo, e.hi].forEach((t, side) => {
            const k = e.p0.clone().addScaledVector(e.d, t);
            const r2 = k.lengthSq(), o = 8 * idx + 4 * side;
            if (r2 >= 1 - 1e-7) {
                const r = Math.sqrt(r2);
                out.set([k.x / r, k.y / r, k.z / r, 1], o);
            } else {
                const s = Math.sqrt(1 - r2);
                out.set([k.x / s, k.y / s, k.z / s, 1 / s], o);
            }
        });
    });
    return out;
}

/**
 * Each face's inradius (the farthest a point of the face gets from its
 * edges), capped at `cap` for faces that run out to the sphere at infinity.
 * The face is a convex polygon in its plane in the Klein model; a pattern
 * search from the centroid of its vertices climbs to the farthest point.
 */
export function faceInradii(home, cap = 2) {
    const W = home.walls.map(w => w.cov), poly = home.poly;
    const mdot = (a, X) => a.x * X[0] + a.y * X[1] + a.z * X[2] - a.w * X[3];
    return W.map((Wk, k) => {
        const face = poly.faces && poly.faces[k];
        const plane = poly.planes && poly.planes[k];
        if (!face || !plane || !face.vertices.length) return cap;
        const others = [];
        W.forEach((Wj, j) => {
            if (j === k) return;
            const c = Wj.x * Wk.x + Wj.y * Wk.y + Wj.z * Wk.z - Wj.w * Wk.w;
            if (1 - c * c > 1e-9) others.push({ W: Wj, s: 1 / Math.sqrt(1 - c * c) });
        });
        // Distance to the face's edges, or −1 off the face.
        const score = (q) => {
            const r2 = q.lengthSq();
            if (r2 >= 1) return -1;
            const s = 1 / Math.sqrt(1 - r2), X = [q.x * s, q.y * s, q.z * s, s];
            let m = Infinity;
            for (const o of others) {
                const v = mdot(o.W, X);
                if (v > 1e-9) return -1;
                m = Math.min(m, Math.asinh(-v * o.s));
            }
            return m;
        };
        const pts = face.vertices.map(v => poly.vertices[v].k.clone().multiplyScalar(poly.vertices[v].ideal ? 0.999 : 1));
        const q = pts.reduce((acc, x) => acc.add(x), new THREE.Vector3()).multiplyScalar(1 / pts.length);
        const n = plane.n.clone().normalize();
        q.addScaledVector(plane.n, (plane.c - plane.n.dot(q)) / plane.n.lengthSq());
        const u = new THREE.Vector3(1, 0, 0).cross(n);
        if (u.lengthSq() < 1e-6) u.set(0, 1, 0).cross(n);
        u.normalize();
        const v = new THREE.Vector3().crossVectors(n, u);
        const dirs = [];
        for (let a = 0; a < 8; a++) {
            const th = a * Math.PI / 4;
            dirs.push(u.clone().multiplyScalar(Math.cos(th)).addScaledVector(v, Math.sin(th)));
        }
        let best = score(q), step = 0.25 * Math.max(...pts.map(x => x.distanceTo(q)), 1e-3);
        for (let it = 0; it < 400 && step > 1e-6; it++) {
            let moved = false;
            for (const d of dirs) {
                const c = q.clone().addScaledVector(d, step), sc = score(c);
                if (sc > best) { best = sc; q.copy(c); moved = true; break; }
            }
            if (!moved) step *= 0.5;
            if (best >= cap) return cap;
        }
        return Math.min(cap, Math.max(best, 1e-3));
    });
}

/** Load each face's inradius (once per domain) for the partial faces. */
export function loadFaceRadii(uniforms, home) {
    const memo = uniforms.u_faceRadius;
    if (!home || !home.poly || memo.home === home) return;
    memo.home = home;
    const r = faceInradii(home);
    memo.value.forEach((v4, i) => v4.set(r[4 * i] || 1, r[4 * i + 1] || 1, r[4 * i + 2] || 1, r[4 * i + 3] || 1));
}

function makeEndsTexture() {
    const tex = new THREE.DataTexture(new Float32Array(4 * 2 * TESS_MAX_EDGES), 2, TESS_MAX_EDGES, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
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
        u_edgeEnds: { value: makeEndsTexture() },
        u_edgesKnown: { value: false },
        u_wallAlpha: { value: 0 },
        u_faceFill: { value: 0 },
        u_faceReach: { value: 1 },
        u_faceRadius: { value: Array.from({ length: TESS_MAX_WALLS / 4 }, () => new THREE.Vector4(1, 1, 1, 1)) },
    };
}
