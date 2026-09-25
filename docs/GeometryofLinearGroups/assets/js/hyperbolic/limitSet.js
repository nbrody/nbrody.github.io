/**
 * Limit set renderer.
 *
 * The limit set Λ(Γ) lives on the sphere at infinity, so there is no surface in
 * the ball to march to — the marching happens in the GROUP. Every pixel of the
 * ideal boundary runs Poincaré's reduction algorithm on its own:
 *
 *     while ξ lies outside some wall of the fundamental domain,
 *         replace ξ by g⁻¹ξ for that wall's face pairing.
 *
 * This is the algorithm of Indra's Pearls turned inside out. The book draws Λ
 * by walking the tree of words and plotting where they send a seed point — the
 * DFS of Chapter 9. Here each point instead asks which word carries IT back to
 * the fundamental domain, which is the same tree read from the leaf up. A point
 * of the ordinary set Ω reduces in finitely many steps; a point of Λ never
 * does. So iteration count IS the picture, and it costs one pixel's work
 * instead of an orbit of a million matrices.
 *
 * Two things make it cheap enough to do per pixel:
 *
 *   - THE WALL TEST IS A DOT PRODUCT. Walls are Minkowski covectors W with the
 *     domain on the side ⟨p,W⟩ < 0. An ideal point ξ lifts to the light-cone
 *     vector (ξ,1), so the test collapses to dot(ξ, W.xyz) − W.w > 0. No
 *     spheres, no square roots, and it is exact on the boundary.
 *
 *   - GROUP ELEMENTS ACT AS SPINORS. Representing ξ ∈ ℂP¹ by a spinor
 *     (v₁,v₂) ∈ ℂ², a Möbius map is just v ↦ Av — two complex multiplies, and
 *     8 floats of uniform per generator instead of a 4×4 Lorentz matrix. It has
 *     no pole at ∞ (the reason for using ℂP¹ rather than a coordinate on ℂ),
 *     and renormalising v each step keeps the numbers bounded no matter how
 *     deep the reduction goes.
 *
 * Colouring follows the book's plates: a point is tinted by the generator of
 * its FIRST reduction — the "colour by the first letter of the word" that makes
 * Indra's tiles legible — and shaded by the rest of the word, so neighbouring
 * tiles of the same letter still separate.
 */
// Relative (not the bare 'three' specifier) so the engine also loads in a Web
// Worker, where import maps do not apply. Same URL as the pages' import maps.
import * as THREE from '../../../Geometric/Tools/Kleinian/vendor/three/three.module.js';

// Walls the reduction may use. The library's largest domain is the Weeks
// manifold at 26 faces; past this we drop walls, which enlarges the region
// being reduced into and thins the limit set rather than corrupting it.
export const LIMIT_MAX_WALLS = 48;

const vertexShader = `
    varying vec3 vWorldPosition;
    void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    precision highp float;
    varying vec3 vWorldPosition;

    uniform vec4 u_limWall[${LIMIT_MAX_WALLS}];   // Minkowski covectors, scene frame
    uniform vec4 u_limAB[${LIMIT_MAX_WALLS}];     // pairing spinor matrix, top row (a, b)
    uniform vec4 u_limCD[${LIMIT_MAX_WALLS}];     // ... bottom row (c, d)
    uniform vec4 u_limMeta[${LIMIT_MAX_WALLS}];   // (orientation-reversing?, r, g, b)
    uniform int u_limCount;
    uniform int u_limIters;
    uniform float u_limOmega;      // how solid the ordinary set's tiles get
    uniform float u_limThick;      // stroke width for Λ, in pixels
    uniform float u_planeHalf;     // half-width of the half-space boundary quad
    uniform bool u_uhs;
    uniform float u_lightMode;

    const int LIM_MAX = ${LIMIT_MAX_WALLS};
    const int ITER_MAX = 128;
    const float WALL_EPS = 1e-7;
    const int WORD_SHADE = 3;      // letters of the word that shade its tile

    vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

    // ℂP¹ spinor (v1, v2) -> the point it names on the unit sphere. This is the
    // null vector v v* of the Hermitian form, read off in Minkowski coordinates
    // and divided through by its time part.
    vec3 sphereFromSpinor(vec4 v) {
        float n1 = dot(v.xy, v.xy), n2 = dot(v.zw, v.zw);
        vec2 c = vec2(v.x * v.z + v.y * v.w, v.y * v.z - v.x * v.w);   // v1 * conj(v2)
        return vec3(2.0 * c, n1 - n2) / (n1 + n2);
    }

    // Inverse. Solve from whichever hemisphere has the larger denominator, so
    // neither pole loses precision.
    vec4 spinorFromSphere(vec3 p) {
        if (p.z > 0.0) {
            float v1 = sqrt(0.5 * (1.0 + p.z));
            return vec4(v1, 0.0, p.x / (2.0 * v1), -p.y / (2.0 * v1));
        }
        float v2 = sqrt(0.5 * (1.0 - p.z));
        return vec4(p.x / (2.0 * v2), p.y / (2.0 * v2), v2, 0.0);
    }

    // v ↦ Av, preceded by v ↦ v̄ for an orientation-reversing element (the
    // z ↦ z̄ that turns a Möbius map into a reflection). Returned UNNORMALISED,
    // because its length is the thing we most need: for a unit spinor v, the
    // conformal distortion of A on the round sphere is exactly |Av|⁻². (Check:
    // A ∈ SU(2) gives |Av| = 1, and SU(2) acts by rotations.) The caller
    // renormalises, which is also what keeps the spinor bounded no matter how
    // far the derivative runs away.
    vec4 applyGen(vec4 v, vec4 ab, vec4 cd, float anti) {
        vec2 v1 = v.xy, v2 = v.zw;
        if (anti > 0.5) { v1.y = -v1.y; v2.y = -v2.y; }
        return vec4(cmul(ab.xy, v1) + cmul(ab.zw, v2),
                    cmul(cd.xy, v1) + cmul(cd.zw, v2));
    }

    void main() {
        // The ideal boundary, as a point of the unit sphere in ball coordinates.
        vec3 xi;
        float edge = 1.0;
        if (u_uhs) {
            // In half-space the boundary is the plane ℂ, drawn as a quad in the
            // world x–z plane. Stereographic projection carries it to the ball.
            vec2 w = vec2(vWorldPosition.x, vWorldPosition.z);
            float n = dot(w, w);
            xi = vec3(2.0 * w, n - 1.0) / (n + 1.0);
            // Fade the quad's rim so the plane ends in haze, not a straight cut.
            float r = max(abs(w.x), abs(w.y)) / u_planeHalf;
            edge = 1.0 - smoothstep(0.72, 1.0, r);
        } else {
            // Re-project onto the exact sphere: the mesh is only a proxy for
            // rasterising, so tessellation never shows up in the fractal.
            xi = normalize(vWorldPosition);
        }
        if (edge <= 0.0) discard;

        // Λ has measure zero, so "did this pixel land exactly in Λ" is a question
        // almost every pixel answers no to. Indra's Pearls settles it the
        // practical way: keep reducing until the TILE around the point is smaller
        // than a pixel, at which point tile and limit set are no longer
        // distinguishable on this screen. The reduction word w carries ξ back to
        // the fundamental domain, so its tile is D∞ shrunk by |w'(ξ)| — and that
        // derivative is exactly the running product of the |Av|⁻² above.
        //
        // The estimate is in units of the whole sphere, dropping the diameter of
        // D∞: a constant factor, the same for every pixel. Folding it into the
        // stroke width states the situation honestly — Λ has no thickness, so the
        // renderer has to choose one, and this is the knob that chooses it.
        float pix = max(length(fwidth(xi)), 1e-7) * u_limThick;
        float logPix = log(pix);

        vec4 v = spinorFromSphere(xi);
        vec3 p = xi;
        float logDeriv = 0.0;      // log |w'(ξ)| in the round metric
        int folds = 0;
        bool escaped = false;
        vec3 firstCol = vec3(0.55);
        float word = 0.0;          // hash of the opening of the reduction word

        for (int i = 0; i < ITER_MAX; i++) {
            if (i >= u_limIters) break;
            bool folded = false;
            for (int j = 0; j < LIM_MAX; j++) {
                if (j >= u_limCount) break;
                // ⟨(ξ,1), W⟩ > 0: ξ is on the far side of this wall.
                if (dot(p, u_limWall[j].xyz) - u_limWall[j].w > WALL_EPS) {
                    if (folds == 0) firstCol = u_limMeta[j].yzw;
                    // Only the opening letters shade the tile. Hashing the whole
                    // word would key the colour to something that changes between
                    // neighbouring pixels, which reads as noise rather than as
                    // structure — and for a finite-covolume group, where Λ is the
                    // entire sphere, noise is all you would see.
                    if (folds < WORD_SHADE) {
                        word = fract(word * 0.6180339887 + float(j) * 0.7548776662 + 0.1327);
                    }
                    vec4 u = applyGen(v, u_limAB[j], u_limCD[j], u_limMeta[j].x);
                    float len = max(length(u), 1e-30);
                    v = u / len;
                    logDeriv -= 2.0 * log(len);
                    p = sphereFromSpinor(v);
                    folds++;
                    folded = true;
                    break;
                }
            }
            if (!folded) { escaped = true; break; }
            // Tile size ≈ exp(−logDeriv). Once it is under a pixel there is
            // nothing left to resolve, and iterating further would only chase
            // digits the doubles no longer have.
            if (logDeriv + logPix > 0.0) break;
        }

        // The first letter sets the hue; the next couple shade it, so tiles that
        // share a first letter still read apart.
        vec3 col = firstCol * (0.58 + 0.42 * word);
        float a;
        if (escaped) {
            // The point reduced into the fundamental domain while its tile was
            // still bigger than a pixel: a resolvable tile of the ordinary set.
            // Draw it faintly — the tiling is the scaffolding Λ hangs on, and
            // the deeper tiles are the ones crowding it.
            a = u_limOmega * pow(clamp(float(folds) / 12.0, 0.0, 1.0), 1.4);
        } else {
            // Sub-pixel tile, or still folding when the budget ran out: at this
            // resolution the point IS the limit set.
            a = 1.0;
            col = mix(col, mix(vec3(1.0), vec3(0.02), u_lightMode), 0.30);
        }
        a *= edge;
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, a);
    }
`;

/**
 * Build the renderer. Returns a handle the app drives; it owns one mesh and
 * adds it to the scene itself.
 */
export function createLimitSet(scene) {
    const zero = () => new THREE.Vector4(0, 0, 0, 0);
    const fill = () => Array.from({ length: LIMIT_MAX_WALLS }, zero);

    const uniforms = {
        u_limWall: { value: fill() },
        u_limAB: { value: fill() },
        u_limCD: { value: fill() },
        u_limMeta: { value: fill() },
        u_limCount: { value: 0 },
        u_limIters: { value: 48 },
        u_limOmega: { value: 0.5 },
        u_limThick: { value: 3.0 },
        u_planeHalf: { value: 60 },
        u_uhs: { value: false },
        u_lightMode: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        // fwidth(): the pixel footprint is what makes the stopping criterion
        // resolution-correct, so the limit set stays one pixel thick at any zoom.
        extensions: { derivatives: true },
        // Depth-tested but not depth-writing: the domain's opaque surface hides
        // the far half of the sphere for us, and the near half draws over it,
        // with no compositing to hand-roll.
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
    });

    // The sphere is a rasterisation proxy only — the shader re-projects onto the
    // exact unit sphere — so it needs enough segments for a clean silhouette and
    // nothing more.
    const ballGeom = new THREE.SphereGeometry(1, 128, 80);
    const PLANE_HALF = 60;
    const uhsGeom = new THREE.PlaneGeometry(PLANE_HALF * 2, PLANE_HALF * 2, 1, 1);
    uhsGeom.rotateX(-Math.PI / 2);          // into the world x–z plane, the boundary ℂ
    uniforms.u_planeHalf.value = PLANE_HALF;

    const mesh = new THREE.Mesh(ballGeom, material);
    mesh.visible = false;
    mesh.renderOrder = 2;                    // after the domain, so blending sees it
    scene.add(mesh);

    let enabled = false;
    const scratch = new THREE.Color();      // update() runs per flight frame

    return {
        mesh,
        material,

        setEnabled(on) { enabled = on; mesh.visible = on && uniforms.u_limCount.value > 0; },
        isEnabled: () => enabled,
        setIterations(n) { uniforms.u_limIters.value = Math.max(1, Math.min(128, n | 0)); },
        iterations: () => uniforms.u_limIters.value,
        setOmega(a) { uniforms.u_limOmega.value = a; },
        setThickness(px) { uniforms.u_limThick.value = Math.max(0.25, px); },
        thickness: () => uniforms.u_limThick.value,
        setLightMode(on) { uniforms.u_lightMode.value = on ? 1 : 0; },

        setViewModel(model) {
            const uhs = model === 'uhs';
            uniforms.u_uhs.value = uhs;
            mesh.geometry = uhs ? uhsGeom : ballGeom;
        },

        /**
         * Re-read the domain. Walls arrive already in the scene frame (the
         * covectors the shader draws and the conjugated pairings), so this is
         * just a copy — cheap enough to run on every frame of a flight.
         *
         * @param domain  cachedDomain from canonical.js, or null
         * @param colorFor  (wall, index) => hex colour for its first-letter tint
         * @returns the number of walls the reduction can use
         */
        update(domain, colorFor) {
            const walls = domain?.walls ?? [];
            let n = 0;
            for (const w of walls) {
                if (n >= LIMIT_MAX_WALLS) break;
                // A wall with no verified pairing has no partner to reduce
                // through. Skipping it enlarges the region and thins Λ, which is
                // the safe direction to be wrong in.
                if (!w.pairing) continue;
                const g = w.pairing.matrix;
                uniforms.u_limWall.value[n].copy(w.cov);
                uniforms.u_limAB.value[n].set(g.a.re, g.a.im, g.b.re, g.b.im);
                uniforms.u_limCD.value[n].set(g.c.re, g.c.im, g.d.re, g.d.im);
                scratch.set(colorFor(w, n));
                uniforms.u_limMeta.value[n].set(g.anti ? 1 : 0, scratch.r, scratch.g, scratch.b);
                n++;
            }
            uniforms.u_limCount.value = n;
            mesh.visible = enabled && n > 0;
            return n;
        },

        /** How many paired walls the domain has, vs how many we can hold. */
        capacity: () => LIMIT_MAX_WALLS,
    };
}
