// ═══════════════════════════════════════════════════════
// GLSL Fragment Shader Generation
// ═══════════════════════════════════════════════════════
//
// Generates a WebGL2 fragment shader that evaluates Farey trace
// polynomials via the recurrence Φ_{med} = 8 − Φ_L·Φ_R − Φ_{diff}
// with Φ_{0/1} = 2−ρ, Φ_{1/0} = 2, Φ_{1/1} = 2+ρ.
//
// Conventions (Keen–Series / Riley / Yamashita):
//  1) Gray region = certified complement of the Riley slice, rendered
//     via the EMS root-set picture ("Approximations of the Riley
//     slice", Fig. 9): the Farey polynomials Q_{p/q} = 2 − Φ_{p/q}
//     satisfy Q_{p/q}(ℛ) ⊂ ℛ, their root sets lie in — and are dense
//     in — the complement, so gray = within a Newton distance
//     |2 − Φ| / |Φ'| threshold of some root, union the Shimizu-excluded
//     disk |ρ| < 1 and the real segment (−4, 4). The fractal boundary
//     emerges as the Farey depth grows. (The naive test "some |Φ| < 2"
//     is NOT a non-discreteness criterion — a complex trace of modulus
//     < 2 is merely loxodromic — and renders a smooth union of a few
//     algebraic sets.)
//     Exterior: tiled Riley-style into regions of constant DOMINANT
//     slope — the Farey word W_{p/q} minimizing |Φ_{p/q}(ρ)|, a proxy
//     for the combinatorial type of the Ford/Dirichlet domain (as in
//     Riley's original computer plot, where each symbol marked the
//     combinatorics his Poincaré procedure found). The tiling is total:
//     coarse slopes own the deep exterior, bands of finer regions
//     accumulate on the boundary. Rays are drawn Yamashita-style: every
//     rational ray as a thin uniform ink curve laminating the exterior.
//  2) Pleating ray P_{p/q}:  Im(Φ_{p/q}) ≈ 0  AND  Re(Φ_{p/q}) ≤ −2
//     (e.g. the 0/1 ray is ρ ∈ [4,∞) where Φ_{0/1} = 2−ρ ≤ −2).
//     Rays live in the exterior (the Riley slice itself).
//  3) Elliptic ray extension:  Im(Φ_{p/q}) ≈ 0  AND  −2 < Re(Φ_{p/q}) < 2,
//     the continuation of the ray past its boundary cusp into the
//     non-discrete region, where W_{p/q} becomes elliptic.
//
// Branch selection: the real locus of a degree-q polynomial has q
// asymptotic directions, but the true ray is the single branch
// asymptotic to arg ρ = π·p/q (plus its complex conjugate). Spurious
// branches (e.g. Φ_{1/3} is also real ≤ −2 on the negative real axis,
// on top of the 1/1 ray) are culled by requiring |arg ρ| to lie within
// half the branch spacing (π/q) of the target angle. This is what keeps
// the rendered rays pairwise disjoint.

import { buildFareyTree, slopeHue } from './fareyTree.js';

export function generateFragmentShader(depth) {
    const nodes = buildFareyTree(depth);
    const N = nodes.length;

    // Variable declarations
    let traceComputation = '';
    for (let i = 0; i < N; i++) {
        const v = nodes[i].varName;
        traceComputation += `    vec2 ${v}; vec2 d${v};\n`;
    }
    traceComputation += '\n';

    // Base cases
    traceComputation += `    ${nodes[0].varName} = vec2(2.0, 0.0) - rho; d${nodes[0].varName} = -drho;\n`;
    traceComputation += `    ${nodes[1].varName} = vec2(2.0, 0.0); d${nodes[1].varName} = vec2(0.0);\n`;
    traceComputation += `    ${nodes[2].varName} = vec2(2.0, 0.0) + rho; d${nodes[2].varName} = drho;\n\n`;

    // Recurrence
    for (let i = 3; i < N; i++) {
        const n = nodes[i];
        if (n.leftParent < 0) continue;
        const lv = nodes[n.leftParent].varName;
        const rv = nodes[n.rightParent].varName;
        const dv = nodes[n.diffParent].varName;
        const v = n.varName;
        traceComputation += `    ${v} = vec2(8.0, 0.0) - cMul(${lv}, ${rv}) - ${dv};\n`;
        traceComputation += `    d${v} = -cMul(d${lv}, ${rv}) - cMul(${lv}, d${rv}) - d${dv};\n`;
        // Rescale huge values to avoid float32 overflow → NaN far from the
        // origin. Scaling Φ and dΦ by the same factor preserves the
        // ray/boundary distance estimates |Im Φ|/|dΦ| and ||Φ|−2|/|dΦ|.
        traceComputation += `    { float m = max(length(${v}), length(d${v})); if (m > 1e8) { float k = 1e8 / m; ${v} *= k; d${v} *= k; } }\n`;
    }

    // Newton-distance threshold for the complement root foam: more
    // Farey words → more roots → the threshold can shrink while keeping
    // the interior visually filled.
    const rootEps = (0.7 / Math.sqrt(2 ** depth)).toFixed(5);

    // Sort nodes by ascending denominator so coarse regions paint first,
    // fine (high-denom) regions paint on top — painter's algorithm.
    // Skip 1/0 (denom 0) since Φ_{1/0} = 2 identically (never < 2).
    const sortedIndices = [];
    for (let i = 0; i < N; i++) {
        if (i === 1) continue; // skip 1/0
        sortedIndices.push(i);
    }
    sortedIndices.sort((a, b) => nodes[a].q - nodes[b].q);

    let accumulation = '';
    for (const i of sortedIndices) {
        const n = nodes[i];
        const v = n.varName;
        const hue = slopeHue(n.p, n.q).toFixed(8);
        const targetAngle = (Math.PI * n.p / n.q).toFixed(8); // asymptotic ray direction
        const angleWindow = (Math.PI / n.q * 0.999).toFixed(8); // half the branch spacing 2π/q

        accumulation += `
    {
        float tl = length(${v});
        float gl = length(d${v});

        // Boundary distance: |Φ| = 2 level curves
        if (gl > 1e-8 && tl < 200.0) {
            minBoundaryDist = min(minBoundaryDist, abs(tl - 2.0) / gl);
        }

        // Complement root foam: Newton distance to roots of 2 − Φ
        if (gl > 1e-8) {
            minRootDist = min(minRootDist, length(vec2(2.0, 0.0) - ${v}) / gl);
        }

        // Riley-style region: track the two smallest |Φ| values. The
        // argmin slope owns the region (dominant word of the Dirichlet
        // domain); the runner-up gives the distance to the wall where
        // dominance swaps.
        if (tl < minT1) {
            minT2 = minT1; g2 = g1;
            minT1 = tl; g1 = gl;
            domHue = ${hue};
        } else if (tl < minT2) {
            minT2 = tl; g2 = gl;
        }

        // Ray / extension: real locus of Φ, restricted to the branch
        // asymptotic to arg ρ = ±π·p/q
        if (gl > 1e-8 && abs(absArg - ${targetAngle}) < ${angleWindow}) {
            float rayDist = abs(${v}.y) / gl;
            // Pleating ray: Φ real, ≤ -2
            if (${v}.x <= -2.0 && rayDist < minRayDist) {
                minRayDist = rayDist;
                rayHue = ${hue};
            }
            // Elliptic extension: Φ real, -2 < Φ < 2
            if (abs(${v}.x) < 2.0 && rayDist < minExtDist) {
                minExtDist = rayDist;
                extHue = ${hue};
            }
        }
    }
`;
    }

    return `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_resolution;
uniform int u_param;
uniform bool u_showRays;
uniform bool u_showExtensions;
uniform bool u_showRegions;
uniform bool u_showBoundary;

const float PI = 3.141592653589793;

vec2 cMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec3 hsv2rgb(float h, float s, float v) {
    h = fract(h);
    float c = v * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return rgb + m;
}


void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
    uv.x *= u_resolution.x / u_resolution.y;
    vec2 c = u_center + uv / u_zoom;

    vec2 rho;
    vec2 drho;
    if (u_param == 0) {
        rho = c;
        drho = vec2(1.0, 0.0);
    } else {
        rho = cMul(c, c);
        drho = 2.0 * c;
    }

    // |arg ρ| ∈ [0, π]: rays and their conjugate mirrors share this value
    float absArg = abs(atan(rho.y, rho.x));

    float minBoundaryDist = 1e6;
    float minRayDist = 1e6;
    float minExtDist = 1e6;
    float rayHue = 0.0;
    float extHue = 0.0;
    float minT1 = 1e30;
    float minT2 = 1e30;
    float g1 = 0.0;
    float g2 = 0.0;
    float domHue = 0.0;

    // Complement root foam: Newton distance to the nearest root of any
    // Q_{p/q} = 2 − Φ_{p/q}. Roots of Farey polynomials lie in (and are
    // dense in) the complement of the Riley slice (EMS), so points close
    // to a root are gray. Accumulated below alongside the other minima.
    float minRootDist = 1e6;

${traceComputation}
${accumulation}

    float px = 1.0 / (u_zoom * u_resolution.y);

    // ─── Gray = certified complement of the Riley slice ───
    //  (a) the Shimizu-excluded disk |ρ| < 1 (no discrete group there),
    //  (b) the real segment (−4, 4) (Fuchsian non-free locus),
    //  (c) within ROOT_EPS of a root of some Q_{p/q} = 2 − Φ_{p/q}
    //      (root sets lie in, and are dense in, the complement — EMS),
    //  (d) on an elliptic extension (Φ real in (−2,2) ⟹ W elliptic).
    const float ROOT_EPS = ${rootEps};
    bool grayHit = length(rho) < 1.0
        || (abs(rho.y) < 0.02 && abs(rho.x) < 4.0)
        || minRootDist < ROOT_EPS
        || minExtDist < ROOT_EPS * 0.4;

    vec3 color;

    if (grayHit) {
        // Certified complement: gray, darker where roots are dense
        float t = clamp(minRootDist / ROOT_EPS, 0.0, 1.0);
        color = vec3(mix(0.58, 0.76, t));
    } else if (u_showRegions) {
        // Riley-style tessellation: pastel region color per dominant
        // slope, brightest near the boundary (where |Φ| → 2)
        float t = clamp((minT1 - 2.0) / 8.0, 0.0, 1.0);
        float sat = mix(0.55, 0.35, t);
        float val = mix(0.96, 0.72, t);
        color = hsv2rgb(domHue, sat, val);

        // Walls where the dominant word swaps (minT1 = minT2)
        float wallDist = (minT2 - minT1) / max(g1 + g2, 1e-8);
        float wall = smoothstep(px * 1.5, 0.0, wallDist);
        color = mix(color, vec3(0.10, 0.09, 0.14), wall * 0.55);
    } else {
        color = vec3(0.04, 0.04, 0.06);
    }

    // Boundary curves: the |Φ| = 2 level curves of the Farey words
    if (u_showBoundary) {
        float bLine = smoothstep(px * 2.0, 0.0, minBoundaryDist);
        color = mix(color, vec3(0.10, 0.10, 0.14), bLine * 0.5);
    }

    // Pleating rays, Yamashita-style: every rational ray as a thin
    // uniform ink curve laminating the exterior, from its boundary cusp
    // out to infinity — dense fringe accumulating on the boundary.
    if (u_showRays && !grayHit) {
        float rayLine = smoothstep(px * 1.4, px * 0.3, minRayDist);
        // dark ink over the pastel regions, light ink over the dark bg
        vec3 inkColor = u_showRegions ? vec3(0.13, 0.10, 0.18) : hsv2rgb(rayHue, 0.7, 1.0);
        color = mix(color, inkColor, rayLine * 0.8);
    }

    // Elliptic ray extensions: Φ real in (−2,2) means W_{p/q} is
    // elliptic, which certifies ρ outside the slice wherever it occurs
    // (Riley's plot shows the Heckoid points on these curves) — so draw
    // them regardless of whether the gray test has caught up.
    if (u_showExtensions) {
        float extLine = smoothstep(px * 1.4, px * 0.3, minExtDist);
        color = mix(color, vec3(0.30, 0.28, 0.36), extLine * 0.55);
    }

    outColor = vec4(color, 1.0);
}`;
}
