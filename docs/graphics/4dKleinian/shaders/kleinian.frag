/*
 * Limit sets and boundary tilings of Kleinian reflection groups acting on
 * hyperbolic 4-space, rendered by distance-estimated ray marching in
 * R^3 = boundary of H^4.
 *
 * Each generator is an inversion in a sphere (or a reflection in a plane).
 * A point is folded back towards the fundamental chamber, accumulating the
 * conformal derivative dr of the folding map.  If W is the trap object in
 * the chamber then dist(p, g^-1 W) is approximately dist(g p, W) / |g'(p)|,
 * so taking the minimum of localDistance / dr over every level of the fold
 * gives a distance estimate for the orbit of W.  The orbit accumulates
 * exactly on the limit set.
 */

precision highp float;

#define MAX_MIRRORS 24
#define FOLD_LIMIT 128
#define MARCH_LIMIT 512
#define SHADOW_LIMIT 48

uniform vec3  iResolution;
uniform vec2  uJitter;

uniform vec3  uEye;
uniform vec3  uTarget;
uniform vec3  uUp;
uniform float uFov;

uniform int   uNumMirrors;
uniform vec4  uMirror[MAX_MIRRORS];      // sphere: (centre, signed radius) | plane: (normal, offset)
uniform float uMirrorKind[MAX_MIRRORS];  // 0 = sphere, 1 = plane

uniform int   uMaxFold;
uniform int   uMaxSteps;
uniform float uStepScale;
uniform float uEpsScale;

uniform vec4  uClip;                     // bounding sphere of the interesting region
uniform int   uTrapMode;                 // 0 solids, 1 shells, 2 ball, 3 solids + ball
uniform vec3  uTrapCenter;
uniform float uTrapRadius;
uniform float uThickness;
uniform int   uSkipLevels;               // hide the outermost layers of the orbit
uniform float uHideOuter;                // 1 = do not draw mirrors whose chamber is their interior
uniform float uCutaway;                  // 1 = slice the scene with a half space
uniform vec4  uCutPlane;                 // (normal, offset)

uniform int   uPalette;
uniform int   uScheme;
uniform float uModulus;
uniform float uColorShift;
uniform float uColorSpan;

uniform float uAO;
uniform int   uShadowSteps;
uniform float uFog;
uniform vec3  uBgTop;
uniform vec3  uBgBottom;

varying vec2 vUv;

/* ---------------------------------------------------------------- */
/* orbit bookkeeping, filled in by sceneDE                            */
/* ---------------------------------------------------------------- */

float gDepth;
float gGenerator;
float gLogScale;
float gTrap;
float gBound;

/* ---------------------------------------------------------------- */

// PALETTE_SHADER_CODE_INJECTION_POINT_START
vec3 getPaletteColor(float t, int palette) {
    return vec3(t);
}
// PALETTE_SHADER_CODE_INJECTION_POINT_END

/**
 * `solid` is the signed distance to the union of the mirror half spaces that
 * are *not* the fundamental chamber, so it is a genuine signed field and the
 * finite-difference normal stays clean.  `surface` is the unsigned distance
 * to the mirror spheres themselves, used for the shell mode and as a safe
 * bound on the marching step.
 */
float trapDistance(vec3 p, float solid, float surface) {
    float ball = length(p - uTrapCenter) - uTrapRadius;
    if (uTrapMode == 1) return surface - uThickness;
    if (uTrapMode == 2) return ball;
    if (uTrapMode == 3) return min(solid, ball);
    return solid;
}

/**
 * Fold p towards the fundamental chamber, returning the distance estimate
 * for the orbit of the trap object and recording orbit data for shading.
 */
float sceneDE(vec3 p) {
    // The unsigned distance to the mirror surfaces is only needed for the
    // shell modes and as a step bound when outer levels are hidden; otherwise
    // we can stop scanning as soon as we find a mirror to fold through.
    bool needScan = (uTrapMode == 1 || uTrapMode == 3 || uSkipLevels > 0);

    float dr = 1.0;
    float best = 1e20;
    float bestDepth = 0.0;
    float bestGen = 0.0;
    float trap = 1e20;
    float depth = 0.0;
    float generator = 0.0;
    float stepBound = 1e20;

    for (int it = 0; it < FOLD_LIMIT; it++) {
        if (it > uMaxFold) break;

        float solid = 1e20;
        float surface = 1e20;
        float bound = 1e20;
        bool  found = false;
        vec4  pick = vec4(0.0);
        float pickKind = 0.0;
        float pickIndex = 0.0;

        for (int i = 0; i < MAX_MIRRORS; i++) {
            if (i >= uNumMirrors) break;
            vec4 m = uMirror[i];

            if (uMirrorKind[i] < 0.5) {
                vec3 diff = p - m.xyz;
                float dist = length(diff);
                float radius = abs(m.w);
                float outward = dist - radius;
                if (m.w > 0.0 || uHideOuter < 0.5) {
                    solid = min(solid, m.w > 0.0 ? outward : -outward);
                    surface = min(surface, abs(outward));
                }
                bound = min(bound, abs(outward));
                if (!found && (radius - dist) * m.w > 0.0) {
                    found = true;
                    pick = m;
                    pickKind = 0.0;
                    pickIndex = float(i);
                    if (!needScan) break;
                }
            } else {
                float side = dot(p, m.xyz) - m.w;
                solid = min(solid, -side);
                surface = min(surface, abs(side));
                bound = min(bound, abs(side));
                if (!found && side > 0.0) {
                    found = true;
                    pick = m;
                    pickKind = 1.0;
                    pickIndex = float(i);
                    if (!needScan) break;
                }
            }
        }

        if (needScan) stepBound = min(stepBound, bound / dr);

        float candidate = it >= uSkipLevels ? trapDistance(p, solid, surface) / dr : 1e20;
        if (candidate < best) {
            best = candidate;
            bestDepth = depth;
            bestGen = generator;
        }
        trap = min(trap, length(p - uTrapCenter));

        if (!found) break;

        if (pickKind < 0.5) {
            vec3 diff = p - pick.xyz;
            float d2 = max(dot(diff, diff), 1e-12);
            float scale = (pick.w * pick.w) / d2;
            p = pick.xyz + diff * scale;
            dr *= scale;
        } else {
            p -= 2.0 * (dot(p, pick.xyz) - pick.w) * pick.xyz;
        }

        depth += 1.0;
        generator = pickIndex;

        if (dr > 1e12) break;
    }

    gDepth = bestDepth;
    gGenerator = bestGen;
    gTrap = trap;
    gLogScale = log(1.0 + dr);
    gBound = stepBound;
    return best;
}

/* ---------------------------------------------------------------- */

float gStep;

float mapScene(vec3 p) {
    float d = sceneDE(p);
    float safe = min(d, gBound);
    if (uCutaway > 0.5) {
        // intersecting with a half space: outside it, the plane distance is
        // itself a valid lower bound, and it is usually much larger
        float plane = dot(p, uCutPlane.xyz) - uCutPlane.w;
        d = max(d, plane);
        safe = max(safe, plane);
    }
    gStep = safe;
    return d;
}

vec3 calcNormal(vec3 p, float h, vec3 fallback) {
    vec2 k = vec2(1.0, -1.0);
    vec3 gradient =
        k.xyy * mapScene(p + k.xyy * h) +
        k.yyx * mapScene(p + k.yyx * h) +
        k.yxy * mapScene(p + k.yxy * h) +
        k.xxx * mapScene(p + k.xxx * h);
    float magnitude = dot(gradient, gradient);
    return magnitude > 1e-20 ? gradient * inversesqrt(magnitude) : fallback;
}

float ambientOcclusion(vec3 p, vec3 n) {
    if (uAO <= 0.0) return 1.0;
    float occlusion = 0.0;
    float scale = 1.0;
    for (int i = 0; i < 5; i++) {
        float h = 0.004 + 0.055 * float(i);
        float d = mapScene(p + n * h);
        // A folded distance estimate can be very negative inside another
        // orbit ball. Limit each sample's contribution to full occlusion.
        occlusion += clamp(h - d, 0.0, h) * scale;
        scale *= 0.72;
    }
    return clamp(1.0 - 2.4 * uAO * occlusion, 0.0, 1.0);
}

float softShadow(vec3 origin, vec3 direction, float maxT) {
    if (uShadowSteps <= 0) return 1.0;
    float result = 1.0;
    float t = 0.02;
    for (int i = 0; i < SHADOW_LIMIT; i++) {
        if (i >= uShadowSteps) break;
        float h = mapScene(origin + direction * t);
        result = min(result, 14.0 * h / t);
        t += clamp(h * 0.8, 0.006, 0.24);
        if (result < 0.015 || t > maxT) break;
    }
    return clamp(result, 0.0, 1.0);
}

bool clipSphere(vec3 origin, vec3 direction, vec4 sphere, out float t0, out float t1) {
    vec3 oc = origin - sphere.xyz;
    float b = dot(oc, direction);
    float c = dot(oc, oc) - sphere.w * sphere.w;
    float disc = b * b - c;
    if (disc < 0.0) return false;
    float s = sqrt(disc);
    t0 = -b - s;
    t1 = -b + s;
    return t1 > 0.0;
}

vec3 environment(vec3 direction) {
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(uBgBottom, uBgTop, pow(height, 1.35));
    float glow = pow(max(0.0, dot(direction, normalize(vec3(0.45, 0.62, 0.65)))), 6.0);
    return base + glow * 0.14 * uBgTop;
}

vec3 shade(vec3 p, vec3 n, vec3 rayDirection, vec3 albedo) {
    vec3 view = -rayDirection;
    vec3 keyDirection = normalize(vec3(0.55, 0.72, 0.42));
    vec3 fillDirection = normalize(vec3(-0.62, 0.18, -0.55));
    vec3 rimDirection = normalize(vec3(-0.15, -0.72, 0.68));

    float key = max(dot(n, keyDirection), 0.0);
    float fill = max(dot(n, fillDirection), 0.0);
    float rim = max(dot(n, rimDirection), 0.0);

    float shadow = softShadow(p + n * 0.008, keyDirection, 3.2);
    float occlusion = ambientOcclusion(p, n);

    // a sky term that ignores shadowing keeps deep cavities readable
    float sky = 0.5 + 0.5 * n.y;
    vec3 color = albedo * (0.12 + mix(0.14, 0.30, sky) * occlusion);
    color += albedo * key * shadow * vec3(1.05, 0.98, 0.9) * 1.35;
    color += albedo * fill * vec3(0.34, 0.48, 0.8) * 0.7 * occlusion;
    color += albedo * rim * vec3(0.92, 0.58, 0.34) * 0.45 * occlusion;

    vec3 halfway = normalize(keyDirection + view);
    float specular = pow(max(dot(n, halfway), 0.0), 48.0);
    color += vec3(1.0, 0.97, 0.92) * specular * shadow * 0.45;

    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
    color += environment(reflect(rayDirection, n)) * fresnel * 0.9;

    return color;
}

vec3 rayDirectionFor(vec2 fragCoord) {
    vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
    vec3 forward = normalize(uTarget - uEye);
    vec3 right = normalize(cross(forward, uUp));
    vec3 up = cross(right, forward);
    float focal = 1.0 / tan(uFov * 0.5);
    return normalize(uv.x * right + uv.y * up + focal * forward);
}

void main() {
    vec2 fragCoord = vUv * iResolution.xy + uJitter;
    vec3 direction = rayDirectionFor(fragCoord);
    vec3 color = environment(direction);

    float t0;
    float t1;
    if (clipSphere(uEye, direction, uClip, t0, t1)) {
        float pixelAngle = 2.0 * tan(uFov * 0.5) / iResolution.y;
        float t = max(t0, 0.001);
        float far = t1;
        float d = 1e20;
        float eps = 0.0;
        bool hit = false;

        for (int step = 0; step < MARCH_LIMIT; step++) {
            if (step >= uMaxSteps || t > far) break;
            vec3 p = uEye + direction * t;
            d = mapScene(p);
            eps = max(t * pixelAngle * uEpsScale, 1e-6);
            if (d < eps) {
                hit = true;
                break;
            }
            t += max(gStep * uStepScale, eps * 0.6);
        }

        if (hit) {
            vec3 p = uEye + direction * t;
            vec3 n = calcNormal(p, max(eps, 1e-5) * 1.6, -direction);
            // Normal probes also call sceneDE and overwrite its globals.
            // Restore the hit's orbit data before selecting its colour.
            mapScene(p);
            float marchDepth = t;

            // COLOR_SCHEME_CODE_INJECTION_POINT_START
            float colorT = fract(gDepth * 0.11);
            // COLOR_SCHEME_CODE_INJECTION_POINT_END

            colorT = fract(colorT * uColorSpan + uColorShift);
            // palette ramps run down to near black, which reads as dead
            // geometry once the surface is lit, so lift them into a usable
            // reflectance range
            vec3 albedo = clamp(getPaletteColor(colorT, uPalette) * 0.86 + 0.12, 0.0, 1.0);
            vec3 lit = shade(p, n, direction, albedo);

            float fog = exp(-uFog * marchDepth * marchDepth);
            color = mix(environment(direction), lit, clamp(fog, 0.0, 1.0));
        }
    }

    gl_FragColor = vec4(color, 1.0);
}
