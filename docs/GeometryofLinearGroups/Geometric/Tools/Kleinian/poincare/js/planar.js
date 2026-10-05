/**
 * The plane picture of a Fuchsian group.
 *
 * When every generator lies in PGL₂(ℝ) (real up to a scalar, mirrors z ↦ M·z̄
 * included), the group preserves the hyperbolic plane P over the real line.
 * In the ball, P is the flat disk y = 0 (uhsToBall sends the half-plane over
 * ℝ there). In the upper half-space it is the vertical half-plane over the
 * real axis: world z = 0, with height up. The view isometries are group
 * elements, and the basepoint isometry is a translation inside P when the
 * basepoint lies on P. So P stays put in world coordinates, and the picture
 * is drawn on a fixed disk or half-plane.
 *
 * The fundamental polygon is the slice D ∩ P of the 3D canonical domain.
 * Because the group preserves P, γ(D) ∩ P = γ(D ∩ P), so the slices of the
 * translates tile P. This holds even for walls tilted by the stabilizer cone's
 * perturbation. Each wall meets P in a geodesic: its covector projected onto
 * P, (w₁, 0, w₃, w₀). The face pairings restrict to edge pairings.
 *
 * The shader folds every pixel into the polygon through the pairings
 * (Poincaré's reduction), so the whole tiling is drawn out to the circle at
 * infinity in one pass.
 */
import * as THREE from 'three';
import { lorentzMatrix } from './math.js';
import { vertexShader } from './shaders.js';

export const PLANAR_MAX_WALLS = 64;

/** Whether every matrix is real up to a scalar, i.e. the group lies in PGL₂(ℝ). */
export function isRealGroup(matrices) {
    if (!matrices || !matrices.length) return false;
    return matrices.every(m => {
        const es = [m.a, m.b, m.c, m.d];
        let big = es[0];
        for (const e of es) if (e.normSq() > big.normSq()) big = e;
        const r = Math.sqrt(big.normSq());
        if (!(r > 0)) return false;
        const ur = big.re / r, ui = big.im / r;            // e·conj(u) must be real for every entry
        return es.every(e => Math.abs(e.im * ur - e.re * ui) <= 1e-9 * r);
    });
}

/** A wall's covector restricted to P and normalized, or null when the wall misses P. */
function planeCovector(cov) {
    const n2 = cov.x * cov.x + cov.z * cov.z - cov.w * cov.w;
    if (!(n2 > 1e-10)) return null;
    const s = 1 / Math.sqrt(n2);
    return new THREE.Vector4(cov.x * s, 0, cov.z * s, cov.w * s);
}

const fragmentShader = `
    precision highp float;
    varying vec3 vWorldPosition;
    uniform vec4 u_walls[${PLANAR_MAX_WALLS}];      // covectors on P, unit
    uniform mat4 u_pair[${PLANAR_MAX_WALLS}];       // face pairings (Lorentz), preserving P
    uniform vec4 u_wallColor[${PLANAR_MAX_WALLS}];  // rgb; w = 1 if the pairing reverses P's orientation, −1 if unpaired
    uniform int u_wallCount;
    uniform bool u_uhs;
    uniform float u_lightMode;
    uniform vec3 u_bgColor;
    uniform int u_sel;
    uniform int u_selPartner;
    uniform float u_opacity;

    float mdot(vec4 a, vec4 b) { return dot(a.xyz, b.xyz) - a.w * b.w; }

    void main() {
        // The point of P under this fragment, in the ball's plane y = 0.
        vec2 q;
        float edgeCoord, edgeFw;                     // distance to the ideal boundary, for its line
        if (u_uhs) {
            float x = vWorldPosition.x, t = vWorldPosition.y;
            if (t <= 0.0) discard;
            float den = x * x + (t + 1.0) * (t + 1.0);
            q = vec2(2.0 * x, x * x + t * t - 1.0) / den;
            edgeCoord = t;
        } else {
            q = vWorldPosition.xz;
            edgeCoord = 1.0 - length(q);
        }
        edgeFw = fwidth(edgeCoord);
        float r2 = dot(q, q);
        if (r2 >= 1.0) discard;

        vec3 fill0 = mix(vec3(0.085, 0.10, 0.165), vec3(0.975, 0.98, 0.995), u_lightMode);
        vec3 fill1 = mix(vec3(0.055, 0.066, 0.115), vec3(0.905, 0.92, 0.955), u_lightMode);
        vec3 rim = mix(vec3(0.62, 0.68, 0.85), vec3(0.32, 0.36, 0.48), u_lightMode);
        vec3 col;

        if (r2 > 0.99995) {
            col = mix(fill0, fill1, 0.5);
        } else {
            // Fold into the polygon through the pairings.
            vec4 X = vec4(2.0 * q.x, 0.0, 2.0 * q.y, 1.0 + r2) / (1.0 - r2);
            int folds = 0;
            float parity = 0.0;
            bool resolved = false;
            for (int it = 0; it < 96; it++) {
                float worst = 1e-6; int k = -1;
                for (int j = 0; j < ${PLANAR_MAX_WALLS}; j++) {
                    if (j >= u_wallCount) break;
                    float v = mdot(u_walls[j], X);
                    if (v > worst) { worst = v; k = j; }
                }
                if (k < 0) { resolved = true; break; }
                if (u_wallColor[k].w < -0.5) break;          // unpaired wall: cannot continue
                X = u_pair[k] * X;
                X.y = 0.0;                                     // stay on P
                X /= sqrt(max(1e-12, -mdot(X, X)));
                parity += u_wallColor[k].w;
                folds++;
            }
            if (!resolved) {
                col = mix(fill0, fill1, 0.5);
            } else {
                // Distance (in P) to the nearest edge of the polygon.
                float d = 1e9; int k = -1;
                for (int j = 0; j < ${PLANAR_MAX_WALLS}; j++) {
                    if (j >= u_wallCount) break;
                    float dj = asinh(max(0.0, -mdot(u_walls[j], X)));
                    if (dj < d) { d = dj; k = j; }
                }
                bool home = folds == 0;
                vec3 wc = u_wallColor[k].rgb;
                // Hyperbolic sizes, capped in pixels: near ∞ in the half-plane a
                // hyperbolic unit is huge on screen.
                float fw = max(fwidth(d), 1e-6);
                // Tiles alternate with orientation (a true 2-colouring for mirror groups).
                vec3 fill = mod(parity, 2.0) > 0.5 ? fill1 : fill0;
                // Each tile is tinted by its edges' colours, strongest at the edges, so
                // paired edges read at a glance. The fundamental polygon is vivid.
                float glow = exp(-d / min(home ? 0.55 : 0.35, 70.0 * fw));
                fill = mix(fill, wc, (home ? 0.42 : 0.13) * glow);
                if (home) fill = mix(fill, mix(vec3(0.96, 0.86, 0.55), vec3(0.98, 0.88, 0.5), u_lightMode), 0.10);

                bool sel = home && (k == u_sel || k == u_selPartner);
                float w = sel ? min(0.06, 5.0 * fw) : (home ? min(0.034, 3.2 * fw) : min(0.02, 2.2 * fw));
                float line = 1.0 - smoothstep(w - fw, w + fw, d);
                line *= clamp(w / fw, 0.0, 1.0);              // lines finer than a pixel fade out
                vec3 lineCol = home ? mix(wc, vec3(1.0), 0.3 - 0.3 * u_lightMode)
                                    : mix(wc, fill, 0.25);
                if (sel) lineCol = mix(wc, vec3(1.0, 0.95, 0.75), 0.55 - 0.3 * u_lightMode);
                col = mix(fill, lineCol, line * (home ? 1.0 : 0.85));
            }
        }
        // The circle (or line) at infinity.
        float ring = 1.0 - smoothstep(0.0, 1.6 * edgeFw, edgeCoord);
        col = mix(col, rim, ring);
        gl_FragColor = vec4(mix(u_bgColor, col, u_opacity), 1.0);
    }
`;

/**
 * The plane mesh: a unit disk (ball model) or a large half-plane (upper
 * half-space model), drawn first and without depth writes, so that the
 * overlays lying on P (orbit, Cayley graph, axes, limit set) sit on top of it.
 */
export function createPlanarView(scene, shared) {
    const uniforms = {
        u_walls: { value: Array.from({ length: PLANAR_MAX_WALLS }, () => new THREE.Vector4()) },
        u_pair: { value: Array.from({ length: PLANAR_MAX_WALLS }, () => new THREE.Matrix4()) },
        u_wallColor: { value: Array.from({ length: PLANAR_MAX_WALLS }, () => new THREE.Vector4()) },
        u_wallCount: { value: 0 },
        u_uhs: { value: false },
        u_lightMode: shared.u_lightMode,
        u_bgColor: shared.u_bgColor,
        u_sel: { value: -1 },
        u_selPartner: { value: -1 },
        u_opacity: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
        uniforms, vertexShader, fragmentShader,
        side: THREE.DoubleSide, transparent: false, depthWrite: false, depthTest: true,
    });
    const disk = new THREE.CircleGeometry(1, 256).rotateX(Math.PI / 2);          // the plane y = 0
    const halfPlane = new THREE.PlaneGeometry(64, 32).translate(0, 16, 0);       // world z = 0, height ≥ 0
    const mesh = new THREE.Mesh(disk, material);
    mesh.renderOrder = -2;
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);

    // Wall i of the domain → slot in the uniform arrays (walls missing P are skipped).
    let slotOfWall = [];

    return {
        mesh,
        setModel(model) {
            const uhs = model === 'uhs';
            uniforms.u_uhs.value = uhs;
            mesh.geometry = uhs ? halfPlane : disk;
        },
        setVisible(on) { mesh.visible = on; },
        setOpacity(o) { uniforms.u_opacity.value = o; },
        /**
         * Load the scene-frame domain. Returns false when the polygon cannot be
         * drawn (too many walls meeting the plane).
         */
        update(domain, colors) {
            slotOfWall = [];
            if (!domain) { uniforms.u_wallCount.value = 0; return true; }
            let n = 0;
            for (let i = 0; i < domain.walls.length; i++) {
                const w = domain.walls[i];
                const W = planeCovector(w.cov);
                if (!W) continue;
                if (n >= PLANAR_MAX_WALLS) { uniforms.u_wallCount.value = 0; return false; }
                uniforms.u_walls.value[n].copy(W);
                const c = colors[i] || [0.6, 0.6, 0.7];
                let flag = -1;
                if (w.pairing) {
                    const L = lorentzMatrix(w.pairing.matrix);
                    uniforms.u_pair.value[n].set(...L);
                    // Orientation of P: det L = −1 for mirrors, and L swaps P's sides when L_yy = −1.
                    const det = w.pairing.matrix.anti ? -1 : 1;
                    flag = det * Math.sign(L[5] || 1) < 0 ? 1 : 0;
                } else {
                    uniforms.u_pair.value[n].identity();
                }
                uniforms.u_wallColor.value[n].set(c[0], c[1], c[2], flag);
                slotOfWall[i] = n;
                n++;
            }
            uniforms.u_wallCount.value = n;
            return true;
        },
        /** Highlight wall `i` (and its partner) of the domain, or none (−1). */
        setSelection(domain, i) {
            const slot = (j) => (j >= 0 && slotOfWall[j] !== undefined ? slotOfWall[j] : -1);
            uniforms.u_sel.value = slot(i);
            const p = domain && i >= 0 && domain.walls[i] && domain.walls[i].pairing ? domain.walls[i].pairing.partner : -1;
            uniforms.u_selPartner.value = slot(p);
        },
    };
}

/** Camera facing P: from below the disk (∞ at the top, 1 to the right), or square on to the half-plane. */
export function framePlanarCamera(camera, controls, model) {
    if (model === 'uhs') {
        camera.position.set(0, 1.6, 5.2);
        controls.target.set(0, 1.6, 0);
        camera.far = 80;
    } else {
        camera.position.set(0, -3.05, 0.0005);
        controls.target.set(0, 0, 0);
        camera.far = 100;
    }
    camera.updateProjectionMatrix();
    controls.update();
}

// ---------------- the polygon itself (labels, picking) ----------------

/** World point on P → ball point (x, 0, z), or null off the model. */
export function planarBallPoint(w, uhs) {
    if (uhs) {
        const x = w.x, t = w.y;
        if (!(t > 0)) return null;
        const den = x * x + (t + 1) * (t + 1);
        return new THREE.Vector3(2 * x / den, 0, (x * x + t * t - 1) / den);
    }
    const p = new THREE.Vector3(w.x, 0, w.z);
    return p.lengthSq() < 1 ? p : null;
}

const hyp = (p) => {
    const r2 = p.x * p.x + p.z * p.z, f = 1 / (1 - r2);
    return [2 * p.x * f, 2 * p.z * f, (1 + r2) * f];                // (x, z, w) on P's hyperboloid
};

/**
 * The wall picked by a click at the ray's crossing with P: the wall the
 * point lies beyond (its tile is across that edge), or, inside the polygon,
 * the edge within a few pixels. { index, point } or { index: −1 }.
 */
export function planarPick(ray, domain, uhs) {
    if (!domain) return { index: -1 };
    const n = uhs ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const den = ray.direction.dot(n);
    if (Math.abs(den) < 1e-9) return { index: -1 };
    const t = -ray.origin.dot(n) / den;
    if (t < 0) return { index: -1 };
    const w = ray.origin.clone().addScaledVector(ray.direction, t);
    const p = planarBallPoint(w, uhs);
    if (!p || p.lengthSq() > 0.9999) return { index: -1 };
    const [x, z, h] = hyp(p);
    let worst = 1e-9, kOut = -1, dMin = Infinity, kIn = -1;
    domain.walls.forEach((wall, i) => {
        const W = planeCovector(wall.cov);
        if (!W) return;
        const v = W.x * x + W.z * z - W.w * h;
        if (v > worst) { worst = v; kOut = i; }
        const d = Math.asinh(Math.abs(v));
        if (d < dMin) { dMin = d; kIn = i; }
    });
    if (kOut >= 0) return { index: kOut, point: w };
    // Inside: an edge counts when it is within ~0.03 world units.
    const scale = uhs ? Math.max(1e-6, w.y) : (1 - p.lengthSq()) / 2;
    return dMin * scale < 0.03 ? { index: kIn, point: w } : { index: -1 };
}

/**
 * Midpoint of each edge of the fundamental polygon (ball coordinates, on P),
 * indexed by wall; null for walls that bound no edge. Clips the Klein disk of
 * P by every wall's half-plane w₁u + w₃v ≤ w₀.
 */
export function planarEdgeMidpoints(domain) {
    const out = [];
    if (!domain) return out;
    const N = 96;
    let poly = [];
    for (let i = 0; i < N; i++) {
        const a = 2 * Math.PI * i / N;
        poly.push({ p: [Math.cos(a), Math.sin(a)], e: -1 });
    }
    domain.walls.forEach((wall, k) => {
        const W = planeCovector(wall.cov);
        if (!W || !poly.length) return;
        const a = W.x, b = W.z, c = W.w;
        const next = [];
        for (let i = 0; i < poly.length; i++) {
            const P = poly[i], Q = poly[(i + 1) % poly.length];
            const fp = a * P.p[0] + b * P.p[1] - c, fq = a * Q.p[0] + b * Q.p[1] - c;
            const pin = fp <= 0, qin = fq <= 0;
            if (pin) next.push(P);
            if (pin !== qin) {
                const s = fp / (fp - fq);
                const I = [P.p[0] + s * (Q.p[0] - P.p[0]), P.p[1] + s * (Q.p[1] - P.p[1])];
                next.push({ p: I, e: pin ? k : P.e });
            }
        }
        poly = next;
    });
    if (poly.length < 3) return out;
    const cu = poly.reduce((s, v) => s + v.p[0], 0) / poly.length, cv = poly.reduce((s, v) => s + v.p[1], 0) / poly.length;
    for (let i = 0; i < poly.length; i++) {
        const P = poly[i], Q = poly[(i + 1) % poly.length];
        if (P.e < 0) continue;
        // a little inside the polygon, so the label sits on its own tile
        const u = 0.9 * (P.p[0] + Q.p[0]) / 2 + 0.1 * cu, v = 0.9 * (P.p[1] + Q.p[1]) / 2 + 0.1 * cv;
        const s = 1 / (1 + Math.sqrt(Math.max(0, 1 - u * u - v * v)));   // Klein → Poincaré
        out[P.e] = new THREE.Vector3(u * s, 0, v * s);
    }
    return out;
}
