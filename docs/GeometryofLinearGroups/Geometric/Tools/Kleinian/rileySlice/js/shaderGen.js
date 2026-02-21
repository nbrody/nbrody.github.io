// ═══════════════════════════════════════════════════════
// GLSL Fragment Shader Generation
// ═══════════════════════════════════════════════════════
//
// Generates a WebGL2 fragment shader that evaluates Farey trace
// polynomials via the recurrence Φ_{med} = 8 − Φ_L·Φ_R − Φ_{diff}.
//
// Coloring modes:
//  1) Cusp-region coloring: the DEEPEST Farey word with |Φ| < 2
//     determines the hue (slope p/q). This gives the fine-grained
//     coloring seen in standard Riley slice images.
//  2) Pleating rays: Im(Φ_{p/q}) ≈ 0  AND  Re(Φ_{p/q}) ≥ 2.
//  3) Ray extensions: Im(Φ_{p/q}) ≈ 0  AND  Re(Φ_{p/q}) ≤ −2
//     (beyond boundary into non-discrete region).

import { buildFareyTree } from './fareyTree.js';

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
    }

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
        const hue = (Math.atan2(n.p, n.q) / Math.PI).toFixed(8);
        const denom = n.q.toFixed(1);

        accumulation += `
    {
        float tl = length(${v});
        float gl = length(d${v});

        // Non-discreteness: |Φ| < 2  →  last (highest-denom) write wins
        if (tl < 2.0) {
            inNonDiscrete = true;
            regionHue = ${hue};
            regionDenom = ${denom};
            regionDepth = 2.0 - tl;
        }

        // Boundary distance (for thin boundary curve)
        if (gl > 1e-8 && tl < 200.0) {
            minBoundaryDist = min(minBoundaryDist, abs(tl - 2.0) / gl);
        }

        // Pleating ray: Im(Φ) ≈ 0 and Re(Φ) ≥ 2
        if (gl > 1e-8) {
            float rayDist = abs(${v}.y) / gl;
            if (${v}.x >= 2.0 && rayDist < minRayDist) {
                minRayDist = rayDist;
                rayHue = ${hue};
            }
            // Ray extension: Im(Φ) ≈ 0 and Re(Φ) ≤ -2
            if (${v}.x <= -2.0 && rayDist < minExtDist) {
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

    float minBoundaryDist = 1e6;
    float minRayDist = 1e6;
    float minExtDist = 1e6;
    float rayHue = 0.0;
    float extHue = 0.0;
    bool inNonDiscrete = false;
    float regionHue = 0.0;
    float regionDenom = 1.0;
    float regionDepth = 0.0;

${traceComputation}
${accumulation}

    float px = 1.0 / (u_zoom * u_resolution.y);
    vec3 color;

    if (inNonDiscrete) {
        if (u_showRegions) {
            // Cusp-region coloring: deepest detecting word sets the hue
            float t = clamp(regionDepth * 2.5, 0.0, 1.0);
            float sat = 0.85 + 0.15 * t;
            float val = 0.55 + 0.4 * t;
            color = hsv2rgb(regionHue, sat, val);
        } else {
            color = vec3(0.92, 0.92, 0.95);
        }
    } else {
        // Riley slice (discrete & free region)
        color = vec3(0.04, 0.04, 0.06);
    }

    // Boundary curves (|Φ_{p/q}| = 2 loci)
    if (u_showBoundary) {
        float bLine = smoothstep(px * 2.0, 0.0, minBoundaryDist);
        color = mix(color, vec3(0.85, 0.85, 0.9), bLine * 0.65);
    }

    // Pleating rays
    if (u_showRays) {
        float rayLine = smoothstep(px * 2.5, px * 0.5, minRayDist);
        vec3 rayColor = hsv2rgb(rayHue, 0.6, 1.0);
        color = mix(color, rayColor, rayLine * 0.85);
    }

    // Ray extensions
    if (u_showExtensions && inNonDiscrete) {
        float extLine = smoothstep(px * 2.0, px * 0.3, minExtDist);
        vec3 extColor = hsv2rgb(extHue, 0.35, 0.8);
        color = mix(color, extColor, extLine * 0.55);
    }

    outColor = vec4(color, 1.0);
}`;
}
