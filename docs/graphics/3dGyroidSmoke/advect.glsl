#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uPrevious;
uniform sampler3D uVelocity;
uniform int uPass;
uniform vec3 uDimensions;
uniform float uLayer;
uniform float uDt;
uniform float uTime;
uniform float uSpeed;
uniform float uCurl;
uniform float uPulse;
uniform float uDiffusion;
uniform float uInjection;
uniform int uSourceCount;
uniform vec4 uSourcePositionStrength[8];
uniform vec3 uSourceColor[8];
out vec4 nextVoxel;

// xyz is the analytic gradient; w is the same absolute gyroid octave noise
// used by the 2D smoke. Three shifted copies form a vector potential.
vec4 gyroidNoise(vec3 p) {
    vec4 result = vec4(0.0);
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; ++octave) {
        p.z += uTime * 0.1;
        vec3 s = sin(p / amplitude);
        vec3 c = cos(p / amplitude);
        float value = dot(s, c.yzx);
        vec3 gradient = vec3(
            c.x * c.y - s.z * s.x,
            c.y * c.z - s.x * s.y,
            c.z * c.x - s.y * s.z
        );
        result.xyz += sign(value) * gradient;
        result.w += abs(value) * amplitude;
        amplitude *= 0.5;
    }
    return result;
}

// The vector potential and its derivative vanish on every wall. Taking its
// curl produces a closed circulation instead of pushing smoke out of the box.
vec3 velocity(vec3 point) {
    vec3 p = (point - 0.5) * 3.0;
    vec4 ax = gyroidNoise(p + vec3(8.3, 2.8, 5.1));
    vec4 ay = gyroidNoise(p + vec3(1.7, 9.2, 3.6));
    vec4 az = gyroidNoise(p + vec3(4.5, 6.1, 11.3));
    vec3 potential = vec3(ax.w, ay.w, az.w) - 0.75;
    vec3 curl = 3.0 * vec3(az.y - ay.z, ax.z - az.x, ay.x - ax.y);

    const float wallWidth = 0.10;
    vec3 t = clamp(min(point, 1.0 - point) / wallWidth, 0.0, 1.0);
    vec3 wall = t * t * (3.0 - 2.0 * t);
    vec3 derivative = 6.0 * t * (1.0 - t) / wallWidth * sign(0.5 - point);
    float mask = wall.x * wall.y * wall.z;
    vec3 maskGradient = derivative * vec3(wall.y * wall.z, wall.x * wall.z, wall.x * wall.y);
    vec3 flow = 0.018 * uCurl * (mask * curl + cross(maskGradient, potential));

    // Closed upward circulation: smoke rises centrally and returns at the
    // sides. It cannot accumulate by flowing through the ceiling.
    vec3 risePotential = vec3(0.0, 0.0, -0.05 * (point.x - 0.5));
    flow += mask * vec3(0.0, 0.05, 0.0) + cross(maskGradient, risePotential);

    vec3 radial = point - 0.5;
    float radius = length(radial);
    flow -= mask * uPulse * 0.02 * radial / max(radius, 0.0001)
        * sin(uTime * 2.0 - radius * 6.0);
    return flow;
}

// Monotonized-central reconstruction is second order on smooth gradients and
// flattens at extrema, keeping sharp density fronts without ringing.
vec4 mcSlope(vec4 backward, vec4 forward) {
    vec4 a = 2.0 * backward;
    vec4 b = 0.5 * (backward + forward);
    vec4 c = 2.0 * forward;
    vec4 agree = step(vec4(2.5), abs(sign(a) + sign(b) + sign(c)));
    return agree * sign(a) * min(abs(a), min(abs(b), abs(c)));
}

vec4 faceFlux(float speed, float dtOverCell, vec4 left, vec4 right,
    vec4 leftSlope, vec4 rightSlope) {
    // Directional Hancock prediction evolves the face state by half a step.
    float correction = 0.5 * (1.0 - abs(speed) * dtOverCell);
    vec4 face = speed >= 0.0 ? left + correction * leftSlope : right - correction * rightSlope;
    return speed * clamp(face, min(left, right), max(left, right));
}

void main() {
    vec3 cell = 1.0 / uDimensions;
    vec3 point = vec3(gl_FragCoord.xy, uLayer + 0.5) * cell;
    if (uPass == 0) {
        // Six outward faces total at most CFL 0.36. MC reconstructed values
        // are bounded by twice their source cell, leaving a positivity margin.
        vec3 maximum = 0.06 * cell / max(uDt, 0.000001);
        nextVoxel = vec4(clamp(uSpeed * velocity(point), -maximum, maximum), 0.0);
        return;
    }

    ivec3 index = ivec3(gl_FragCoord.xy, uLayer);
    ivec3 last = ivec3(uDimensions) - 1;
    ivec3 xp = min(index + ivec3(1, 0, 0), last);
    ivec3 xm = max(index - ivec3(1, 0, 0), ivec3(0));
    ivec3 yp = min(index + ivec3(0, 1, 0), last);
    ivec3 ym = max(index - ivec3(0, 1, 0), ivec3(0));
    ivec3 zp = min(index + ivec3(0, 0, 1), last);
    ivec3 zm = max(index - ivec3(0, 0, 1), ivec3(0));
    vec4 center = texelFetch(uPrevious, index, 0);
    vec4 right = texelFetch(uPrevious, xp, 0);
    vec4 left = texelFetch(uPrevious, xm, 0);
    vec4 above = texelFetch(uPrevious, yp, 0);
    vec4 below = texelFetch(uPrevious, ym, 0);
    vec4 front = texelFetch(uPrevious, zp, 0);
    vec4 back = texelFetch(uPrevious, zm, 0);
    vec3 v = texelFetch(uVelocity, index, 0).xyz;
    vec3 positive = 0.5 * (v + vec3(texelFetch(uVelocity, xp, 0).x,
        texelFetch(uVelocity, yp, 0).y, texelFetch(uVelocity, zp, 0).z));
    vec3 negative = 0.5 * (v + vec3(texelFetch(uVelocity, xm, 0).x,
        texelFetch(uVelocity, ym, 0).y, texelFetch(uVelocity, zm, 0).z));
    if (index.x == last.x) positive.x = 0.0;
    if (index.y == last.y) positive.y = 0.0;
    if (index.z == last.z) positive.z = 0.0;
    if (index.x == 0) negative.x = 0.0;
    if (index.y == 0) negative.y = 0.0;
    if (index.z == 0) negative.z = 0.0;

    vec4 slopeX = mcSlope(center - left, right - center);
    vec4 slopeY = mcSlope(center - below, above - center);
    vec4 slopeZ = mcSlope(center - back, front - center);
    vec4 slopeRight = mcSlope(right - center, texelFetch(uPrevious, min(index + ivec3(2, 0, 0), last), 0) - right);
    vec4 slopeLeft = mcSlope(left - texelFetch(uPrevious, max(index - ivec3(2, 0, 0), ivec3(0)), 0), center - left);
    vec4 slopeAbove = mcSlope(above - center, texelFetch(uPrevious, min(index + ivec3(0, 2, 0), last), 0) - above);
    vec4 slopeBelow = mcSlope(below - texelFetch(uPrevious, max(index - ivec3(0, 2, 0), ivec3(0)), 0), center - below);
    vec4 slopeFront = mcSlope(front - center, texelFetch(uPrevious, min(index + ivec3(0, 0, 2), last), 0) - front);
    vec4 slopeBack = mcSlope(back - texelFetch(uPrevious, max(index - ivec3(0, 0, 2), ivec3(0)), 0), center - back);

    // Each shared face computes the same conservative flux on both sides, so
    // pigment and density leaving a voxel enter its neighbor, even under pulse.
    vec4 value = center;
    value -= uDt / cell.x * (faceFlux(positive.x, uDt / cell.x, center, right, slopeX, slopeRight)
        - faceFlux(negative.x, uDt / cell.x, left, center, slopeLeft, slopeX));
    value -= uDt / cell.y * (faceFlux(positive.y, uDt / cell.y, center, above, slopeY, slopeAbove)
        - faceFlux(negative.y, uDt / cell.y, below, center, slopeBelow, slopeY));
    value -= uDt / cell.z * (faceFlux(positive.z, uDt / cell.z, center, front, slopeZ, slopeFront)
        - faceFlux(negative.z, uDt / cell.z, back, center, slopeBack, slopeZ));
    value += clamp(uDiffusion * uDt * 0.4, 0.0, 0.15)
        * ((right + left + above + below + front + back) / 6.0 - center);

    for (int index = 0; index < 8; ++index) {
        if (index >= uSourceCount) break;
        vec3 delta = point - uSourcePositionStrength[index].xyz;
        float distanceSquared = dot(delta, delta);
        if (distanceSquared > 9.0 * 0.048 * 0.048) continue;
        float gyroid = dot(sin(delta * 90.0 + vec3(0.0, uTime * 0.9, 0.0)),
            cos(delta.yzx * 90.0 + uTime * 0.7));
        float structure = 0.8 + 0.2 * cos(gyroid * 3.0 + uTime * 0.4);
        float density = exp(-2.0 * distanceSquared / (0.048 * 0.048)) * structure
            * uSourcePositionStrength[index].w * uInjection * 25.0 * uDt;
        value += vec4(uSourceColor[index] * density, density);
    }

    // RGB is pigment multiplied by density, not an independently fading color.
    // Limiting both together keeps their ratio stable in a saturated emitter.
    value = max(value, vec4(0.0));
    if (value.a > 8.0) value *= 8.0 / value.a;
    // Round explicitly to representable half floats before framebuffer storage.
    // Some drivers otherwise truncate every write and slowly drain the room.
    nextVoxel = vec4(unpackHalf2x16(packHalf2x16(value.xy)),
        unpackHalf2x16(packHalf2x16(value.zw)));
}
