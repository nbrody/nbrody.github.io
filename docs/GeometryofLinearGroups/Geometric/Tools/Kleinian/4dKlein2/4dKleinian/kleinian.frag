/*
Created by soma_arc - 2016
This work is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported.
*/
precision highp float;

uniform vec3 iResolution;
uniform float sphereRadius;
uniform float kleinSphereR;
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

varying vec2 vUv;

vec3 sphereInvert(vec3 pos, vec3 circlePos, float circleR){
    vec3 diff = pos - circlePos;
    float dist2 = dot(diff, diff); // More efficient than distance squared
    return (diff * circleR * circleR) / dist2 + circlePos;
}

float loopNum = 0.;

float distKlein(vec3 pos){
    loopNum = 0.;
    float dr = 1.;
    bool loopEnd = true;

    for(int i = 0 ; i < 200 ; i++){
        if(i >= maxIterations) break;

        loopEnd = true;

        // Loop through all active spheres
        for(int j = 0; j < 20; j++){
            if(j >= numSpheres) break;

            vec3 diff = pos - spherePositions[j];
            float dist2 = dot(diff, diff); // Cache distance squared
            float SPHERE_R = sphereRadii[j];
            float SPHERE_R2 = SPHERE_R * SPHERE_R;

            if(dist2 < SPHERE_R2){
                dr *= SPHERE_R2 / dist2;
                pos = (diff * SPHERE_R2) / dist2 + spherePositions[j];
                loopEnd = false;
                loopNum++;
                break; // Only invert once per iteration
            }
        }

        if(loopEnd == true) break;
    }

    // Compute distance to limit sets (use first few spheres if available)
    vec3 center1 = numSpheres >= 3 ? (spherePositions[0] + spherePositions[1] + spherePositions[2]) / 3.0 : vec3(0.0);
    vec3 center2 = numSpheres >= 6 ? (spherePositions[3] + spherePositions[4] + spherePositions[5]) / 3.0 : vec3(0.0);

    float f = (length(pos - center1) - 0.16667) / abs(dr) * scalingFactor;
    float f2 = (length(pos - center2) - 0.16667) / abs(dr) * scalingFactor;

    return min(f2, min(f, (length(pos) - kleinSphereR) / abs(dr) * scalingFactor));
}

vec3 calcRay (const vec3 eye, const vec3 target, const vec3 up, const float fov,
            const float width, const float height, const vec2 coord){
    float imagePlane = (height * .5) / tan(fov * .5);
    vec3 v = normalize(target - eye);
    vec3 xaxis = normalize(cross(v, up));
    vec3 yaxis =  normalize(cross(v, xaxis));
    vec3 center = v * imagePlane;
    vec3 origin = center - (xaxis * (width  *.5)) - (yaxis * (height * .5));
    return normalize(origin + (xaxis * coord.x) + (yaxis * (height - coord.y)));
}

const vec4 K = vec4(1.0, .666666, .333333, 3.0);
vec3 hsv2rgb(const vec3 c){
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// PALETTE_SHADER_CODE_INJECTION_POINT_START
// Stub function (will be replaced at runtime by generated code)
vec3 getPaletteColor(float t, int palette) {
    return vec3(t); // Fallback: grayscale
}
// PALETTE_SHADER_CODE_INJECTION_POINT_END

float distFunc(vec3 p){
    return distKlein(p);
}

const vec2 d = vec2(0.01, 0.);
vec3 getNormal(const vec3 p){
    return normalize(vec3(distFunc(p + d.xyy) - distFunc(p - d.xyy),
                        distFunc(p + d.yxy) - distFunc(p - d.yxy),
                        distFunc(p + d.yyx) - distFunc(p - d.yyx)));
}

const float PI_4 = 12.566368;
const vec3 LIGHTING_FACT = vec3(0.1);
vec3 diffuseLighting(const vec3 p, const vec3 n, const vec3 diffuseColor,
                    const vec3 lightPos, const vec3 lightPower){
    vec3 v = lightPos - p;
    float dot = dot(n, normalize(v));
    float r = length(v);
    return (dot > 0.) ?
        (lightPower * (dot / (PI_4 * r * r))) * diffuseColor
        : LIGHTING_FACT * diffuseColor;
}

const vec3 lightPos = vec3(1.33333, 0.0, 1.66667);
const vec3 lightPos2 = vec3(-1.0, -1.0, -1.0);
const vec3 lightPower = vec3(8.88889);
const vec3 lightPower2 = vec3(0.11111);

vec2 march(const vec3 origin, const  vec3 ray, const float threshold){
    vec3 rayPos = origin;
    float dist;
    float rayLength = 0.;
    const float maxDist = 2000.0; // Early exit for rays going nowhere
    for(int i = 0 ; i < 2000 ; i++){
        if(i >= maxMarchSteps) break;
        dist = distFunc(rayPos);

        // Early exit conditions
        if(dist < threshold) break;
        if(rayLength > maxDist) break;

        // Adaptive step size with slight overstep for faster convergence
        rayLength += dist * 0.9;
        rayPos = origin + ray * rayLength;
    }
    return vec2(dist, rayLength);
}

const vec3 BLACK = vec3(0);
vec3 calcColor(vec3 eye, vec3 ray){
    vec3 l = BLACK;
    float coeff = 1.;
    vec2 result = march(eye, ray, 0.01);
    vec3 intersection = eye + ray * result.y;
    vec3 matColor = vec3(0);
    vec3 normal = getNormal(intersection);

    if(result.x < 0.01){
        // COLOR_SCHEME_CODE_INJECTION_POINT_START
        // Stub variable (will be replaced at runtime by generated code)
        float colorT = mod(loopNum * 0.08, 1.0); // Fallback: iteration count
        // COLOR_SCHEME_CODE_INJECTION_POINT_END

        // Get color from selected palette
        matColor = getPaletteColor(colorT, colorPalette);

        // Add some subtle variation based on position for visual interest
        float posVariation = sin(intersection.x * 0.01) * 0.5 + 0.5;
        matColor = mix(matColor, matColor * 1.2, posVariation * 0.15);

        l += diffuseLighting(intersection, normal, matColor, lightPos, lightPower);
        l += diffuseLighting(intersection, normal, matColor, lightPos2, lightPower2);
    }
    return l;
}

const float DISPLAY_GAMMA_COEFF = 1. / 2.2;
vec3 gammaCorrect(vec3 rgb) {
    return vec3((min(pow(rgb.r, DISPLAY_GAMMA_COEFF), 1.)),
                (min(pow(rgb.g, DISPLAY_GAMMA_COEFF), 1.)),
                (min(pow(rgb.b, DISPLAY_GAMMA_COEFF), 1.)));
}

void main() {
    const vec2 coordOffset = vec2(0.5);
    vec2 fragCoord = vUv * iResolution.xy;
    vec3 ray = calcRay(eye, target, up, fovRadians,
                    iResolution.x, iResolution.y,
                    fragCoord + coordOffset);

    gl_FragColor = vec4(gammaCorrect(calcColor(eye, ray)), 1.);
}
