/*
Created by soma_arc - 2016
Adapted for a preset-driven 4D Kleinian limit set explorer.
This work is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
*/
precision highp float;

uniform vec3 iResolution;
uniform float kleinSphereR;
uniform float seedRadius;
uniform int maxIterations;
uniform int maxMarchSteps;
uniform float scalingFactor;
uniform vec3 eye;
uniform vec3 target;
uniform vec3 up;
uniform float fovRadians;
uniform int colorPalette;
uniform int colorScheme;
uniform int modulus;
uniform int numSpheres;
uniform vec3 spherePositions[20];
uniform float sphereRadii[20];
uniform int numSeedCenters;
uniform vec3 seedCenters[8];

varying vec2 vUv;

float loopNum = 0.0;

vec3 sphereInvert(vec3 pos, vec3 sphereCenter, float sphereRadius) {
    vec3 diff = pos - sphereCenter;
    float dist2 = max(dot(diff, diff), 0.00001);
    return (diff * sphereRadius * sphereRadius) / dist2 + sphereCenter;
}

float distKlein(vec3 pos) {
    loopNum = 0.0;
    float dr = 1.0;

    for (int iteration = 0; iteration < 200; iteration++) {
        if (iteration >= maxIterations) {
            break;
        }

        bool loopEnded = true;

        for (int sphereIndex = 0; sphereIndex < 20; sphereIndex++) {
            if (sphereIndex >= numSpheres) {
                break;
            }

            vec3 diff = pos - spherePositions[sphereIndex];
            float sphereRadius = sphereRadii[sphereIndex];
            float radiusSquared = sphereRadius * sphereRadius;
            float dist2 = dot(diff, diff);

            if (dist2 < radiusSquared) {
                float scale = radiusSquared / max(dist2, 0.00001);
                dr *= scale;
                pos = sphereInvert(pos, spherePositions[sphereIndex], sphereRadius);
                loopNum += 1.0;
                loopEnded = false;
                break;
            }
        }

        if (loopEnded) {
            break;
        }
    }

    float seedDistance = 1000.0;
    for (int seedIndex = 0; seedIndex < 8; seedIndex++) {
        if (seedIndex >= numSeedCenters) {
            break;
        }

        seedDistance = min(seedDistance, length(pos - seedCenters[seedIndex]) - seedRadius);
    }

    float shellDistance = length(pos) - kleinSphereR;
    float baseDistance = min(seedDistance, shellDistance);
    return baseDistance / max(abs(dr), 0.0001) * scalingFactor;
}

vec3 calcRay(
    const vec3 rayEye,
    const vec3 rayTarget,
    const vec3 rayUp,
    const float fov,
    const float width,
    const float height,
    const vec2 coord
) {
    float imagePlane = (height * 0.5) / tan(fov * 0.5);
    vec3 forward = normalize(rayTarget - rayEye);
    vec3 xAxis = normalize(cross(forward, rayUp));
    vec3 yAxis = normalize(cross(forward, xAxis));
    vec3 center = forward * imagePlane;
    vec3 origin = center - (xAxis * (width * 0.5)) - (yAxis * (height * 0.5));
    return normalize(origin + (xAxis * coord.x) + (yAxis * (height - coord.y)));
}

const vec4 K = vec4(1.0, 0.666666, 0.333333, 3.0);
vec3 hsv2rgb(const vec3 c) {
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// PALETTE_SHADER_CODE_INJECTION_POINT_START
vec3 getPaletteColor(float t, int palette) {
    return vec3(t);
}
// PALETTE_SHADER_CODE_INJECTION_POINT_END

float distFunc(vec3 p) {
    return distKlein(p);
}

const vec2 normalStep = vec2(0.0025, 0.0);
vec3 getNormal(const vec3 p) {
    return normalize(vec3(
        distFunc(p + normalStep.xyy) - distFunc(p - normalStep.xyy),
        distFunc(p + normalStep.yxy) - distFunc(p - normalStep.yxy),
        distFunc(p + normalStep.yyx) - distFunc(p - normalStep.yyx)
    ));
}

vec3 backgroundColor(vec3 ray) {
    float horizon = clamp(ray.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 base = mix(vec3(0.014, 0.018, 0.028), vec3(0.032, 0.055, 0.082), pow(horizon, 1.4));
    float halo = pow(max(0.0, 1.0 - abs(ray.z)), 8.0) * 0.12;
    float floorGlow = pow(max(0.0, 1.0 - horizon), 2.3) * 0.045;
    return base + vec3(halo * 0.5, halo * 0.65, halo) + floorGlow;
}

vec3 lightContribution(vec3 p, vec3 n, vec3 viewDir, vec3 lightPos, vec3 lightColor, vec3 baseColor) {
    vec3 lightDir = normalize(lightPos - p);
    float diffuse = max(dot(n, lightDir), 0.0);
    vec3 halfwayDir = normalize(lightDir + viewDir);
    float specular = pow(max(dot(n, halfwayDir), 0.0), 32.0);
    return baseColor * lightColor * diffuse + lightColor * specular * 0.16;
}

vec2 march(const vec3 origin, const vec3 ray, const float threshold) {
    vec3 rayPos = origin;
    float rayLength = 0.0;
    float dist = 0.0;
    const float maxDist = 14.0;

    for (int step = 0; step < 2000; step++) {
        if (step >= maxMarchSteps) {
            break;
        }

        dist = distFunc(rayPos);

        if (dist < threshold || rayLength > maxDist) {
            break;
        }

        rayLength += dist * 0.92;
        rayPos = origin + ray * rayLength;
    }

    return vec2(dist, rayLength);
}

vec3 shadeSurface(vec3 p, vec3 n, vec3 ray, vec3 baseColor) {
    vec3 viewDir = normalize(eye - p);
    vec3 color = baseColor * 0.12;
    color += lightContribution(p, n, viewDir, vec3(2.8, 1.4, 3.6), vec3(1.0, 0.95, 0.9) * 1.45, baseColor);
    color += lightContribution(p, n, viewDir, vec3(-2.2, -1.5, -1.8), vec3(0.35, 0.5, 0.9) * 0.45, baseColor);
    color += lightContribution(p, n, viewDir, vec3(-0.4, 2.6, 0.6), vec3(1.0, 0.72, 0.4) * 0.35, baseColor);

    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    color += baseColor * fresnel * 0.25;

    return color;
}

vec3 calcColor(vec3 rayEye, vec3 ray) {
    vec3 bg = backgroundColor(ray);
    vec2 result = march(rayEye, ray, 0.0028);

    if (result.x < 0.003) {
        vec3 intersection = rayEye + ray * result.y;
        vec3 normal = getNormal(intersection);

        // COLOR_SCHEME_CODE_INJECTION_POINT_START
        float colorT = fract(loopNum * 0.11);
        // COLOR_SCHEME_CODE_INJECTION_POINT_END

        vec3 baseColor = getPaletteColor(colorT, colorPalette);
        float localVariation = 0.5 + 0.5 * sin(intersection.x * 2.3 + intersection.z * 1.7);
        baseColor = mix(baseColor, baseColor.bgr, localVariation * 0.08);

        vec3 lit = shadeSurface(intersection, normal, ray, baseColor);
        float fog = exp(-0.045 * result.y * result.y);
        return mix(bg, lit, clamp(fog, 0.0, 1.0));
    }

    return bg;
}

const float DISPLAY_GAMMA_COEFF = 1.0 / 2.2;
vec3 gammaCorrect(vec3 rgb) {
    return vec3(
        min(pow(max(rgb.r, 0.0), DISPLAY_GAMMA_COEFF), 1.0),
        min(pow(max(rgb.g, 0.0), DISPLAY_GAMMA_COEFF), 1.0),
        min(pow(max(rgb.b, 0.0), DISPLAY_GAMMA_COEFF), 1.0)
    );
}

void main() {
    vec2 fragCoord = vUv * iResolution.xy;
    vec3 ray = calcRay(
        eye,
        target,
        up,
        fovRadians,
        iResolution.x,
        iResolution.y,
        fragCoord + vec2(0.5)
    );

    vec3 color = calcColor(eye, ray);
    float vignette = smoothstep(1.28, 0.24, length(vUv - 0.5) * 1.22);
    color *= vignette + 0.18;

    gl_FragColor = vec4(gammaCorrect(color), 1.0);
}
