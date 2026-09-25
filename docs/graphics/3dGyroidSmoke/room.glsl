#version 300 es
precision highp float;
precision highp sampler3D;

uniform vec2 uResolution;
uniform sampler3D uVolume;
uniform vec3 uEye;
uniform float uOpacity;
uniform float uBend;
uniform float uTime;
uniform int uSteps;
out vec4 fragColor;

const vec3 LO = vec3(-4.0, 0.0, -3.5);
const vec3 HI = vec3(4.0, 4.8, 3.5);
const vec3 SIZE = HI - LO;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float smokeDetail(vec3 p) {
    // Sub-voxel folds use the same layered absolute gyroid as the flow. The
    // persistent grid supplies the plume envelope; this only adds fine wisps.
    p = p * 3.4 - vec3(0.0, uTime * 0.25, 0.0);
    float a = abs(dot(sin(p), cos(p.yzx)));
    p = p * 2.03 + vec3(2.1, 5.7, 1.3);
    float b = abs(dot(sin(p), cos(p.yzx)));
    return smoothstep(0.15, 1.7, a * 0.7 + b * 0.35);
}

vec3 roomSurface(vec3 p) {
    vec3 toFace = min(abs(p - LO), abs(p - HI));
    bool floorFace = toFace.y < min(toFace.x, toFace.z);
    vec2 surface = floorFace ? p.xz : (toFace.x < toFace.z ? p.zy : p.xy);
    float grout = min(abs(fract(surface.x + 0.5) - 0.5), abs(fract(surface.y + 0.5) - 0.5));
    float tile = smoothstep(0.006, 0.006 + max(0.008, length(fwidth(surface)) * 0.6), grout);
    vec3 material = floorFace ? vec3(0.043, 0.055, 0.066) : vec3(0.028, 0.038, 0.052);
    material *= mix(0.72, 1.0, tile);
    float light = 0.48 + 0.55 * exp(-0.025 * dot(p - vec3(-1.5, 4.5, 0.0), p - vec3(-1.5, 4.5, 0.0)));
    float edge = floorFace ? min(min(p.x - LO.x, HI.x - p.x), min(p.z - LO.z, HI.z - p.z)) : min(p.y, HI.y - p.y);
    material *= light * mix(0.58, 1.0, smoothstep(0.0, 0.45, edge));
    // Recessed light along the floor perimeter and upper wall line defines the
    // architecture even after the room has accumulated a veil of smoke.
    float strip = (1.0 - smoothstep(0.014, 0.045, abs(edge - 0.09)));
    material += vec3(0.56, 0.78, 0.88) * strip * 1.2;
    return material;
}

void main() {
    vec2 screen = (2.0 * gl_FragCoord.xy - uResolution) / uResolution.y;
    vec3 target = vec3(0.0, 2.15, 0.0);
    vec3 forward = normalize(target - uEye);
    vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, forward);
    vec3 ray = normalize(forward * 2.3 + screen.x * right + screen.y * up);
    vec3 safeRay = mix(vec3(0.000001), ray, greaterThan(abs(ray), vec3(0.000001)));
    vec3 a = (LO - uEye) / safeRay, b = (HI - uEye) / safeRay;
    vec3 nearFace = min(a, b), farFace = max(a, b);
    float start = max(max(nearFace.x, nearFace.y), nearFace.z);
    float end = min(min(farFace.x, farFace.y), farFace.z);

    vec3 background = mix(vec3(0.004, 0.006, 0.009), vec3(0.012, 0.018, 0.027), exp(-0.35 * dot(screen, screen)));
    // A studio floor anchors the room without adding objects inside it.
    if (ray.y < -0.0001) {
        float groundT = (-0.055 - uEye.y) / ray.y;
        if (groundT > 0.0) {
            vec3 ground = uEye + ray * groundT;
            float shadow = exp(-0.028 * dot(ground.xz, ground.xz));
            background *= 1.0 - 0.58 * shadow;
        }
    }
    if (end <= max(start, 0.0)) {
        fragColor = vec4(pow(background, vec3(0.4545)), 1.0);
        return;
    }

    start = max(start, 0.0);
    vec3 wallPoint = clamp(uEye + ray * end, LO, HI);
    vec3 wall = roomSurface(wallPoint);
    // Smoke also occludes the room's overhead light. A plume is an absorbing
    // volume, not a colored point light painted over the walls.
    vec3 toLamp = vec3(-1.3, 4.65, 0.8) - wallPoint;
    float shadowDepth = 0.0;
    for (int s = 0; s < 16; s++) {
        vec3 q = clamp((wallPoint + toLamp * ((float(s) + 0.5) / 16.0) - LO) / SIZE, 0.0, 1.0);
        shadowDepth += texture(uVolume, q).a;
    }
    wall *= 0.58 + 0.42 * exp(-shadowDepth * length(toLamp) * uOpacity * 0.075);
    float stepLength = (end - start) / float(uSteps);
    float grain = hash(gl_FragCoord.xy);
    float t = start + (0.2 + grain * 0.6) * stepLength;
    float radius = 0.007 + pow(grain, 3.0) * 0.022;
    vec3 light = normalize(vec3(-0.5 + uBend * 0.3, 1.0, 0.4));
    vec3 sum = vec3(0.0);
    float transmission = 1.0;

    for (int i = 0; i < 128; ++i) {
        if (i >= uSteps || transmission < 0.015) break;
        vec3 p = uEye + ray * t;
        vec3 q = clamp((p - LO) / SIZE, 0.0, 1.0);
        vec4 smoke = texture(uVolume, q);
        float density = max(smoke.a, 0.0);
        if (density > 0.0005) {
            float detail = smokeDetail(p);
            // The original noise-spaced relief sampling becomes a 3D density
            // gradient. It lights the folds of an actual participating volume.
            vec3 e = vec3(radius, 0.0, 0.0);
            vec3 normal = vec3(
                texture(uVolume, q - e.xyy).a - texture(uVolume, q + e.xyy).a,
                texture(uVolume, q - e.yxy).a - texture(uVolume, q + e.yxy).a,
                texture(uVolume, q - e.yyx).a - texture(uVolume, q + e.yyx).a
            );
            float shading = 0.64;
            if (dot(normal, normal) > 0.000001) shading = 0.58 + 0.42 * dot(normalize(normal), light);
            float overhead = texture(uVolume, clamp(q + light * 0.08, 0.0, 1.0)).a;
            float shadow = 0.48 + 0.52 * exp(-overhead * 0.6);
            vec3 pigment = clamp(smoke.rgb / max(density, 0.00001), 0.0, 1.0);
            vec3 scattering = mix(pigment, vec3(0.9, 0.94, 1.0), 0.24) * shading * shadow * (0.8 + 0.2 * detail);
            // Very dilute tails contribute a veil rather than a glowing halo;
            // the dense core has a readable silhouette as the flow folds it.
            float opticalDensity = density * smoothstep(0.01, 0.10, density);
            float alpha = 1.0 - exp(-opticalDensity * mix(0.22, 2.15, detail) * stepLength * uOpacity * 3.0);
            sum += transmission * alpha * scattering;
            transmission *= 1.0 - alpha;
        }
        t += stepLength;
    }
    vec3 color = sum + transmission * wall;
    // A restrained vignette keeps the focus on the room, not the frame edges.
    color *= 1.0 - 0.12 * smoothstep(0.4, 2.0, length(screen));
    fragColor = vec4(pow(max(color, 0.0), vec3(0.4545)), 1.0);
}
