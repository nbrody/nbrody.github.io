// Shared by the flow, map, and compose passes: the gyroid velocity field and
// the start states.
#define R iResolution.xy

float gyroid(vec3 p) {
    return dot(sin(p), cos(p.yzx));
}

float noise(vec3 p) {
    float result = 0.0;
    float amplitude = 0.5;
    int count = R.y < 500.0 ? 6 : 8;

    for (int i = 0; i < 8; ++i) {
        if (i >= count) break;
        p.z += iTime * 0.1;
        result += abs(gyroid(p / amplitude)) * amplitude;
        amplitude *= 0.5;
    }
    return result;
}

vec3 ink(float t) {
    return 0.55 + 0.45 * cos(6.2831853 * (t + vec3(0.0, 0.333, 0.667)) + uPalette);
}

// Soft duty-cycle band on a fract() coordinate; w is its antialias width.
float band(float f, float duty, float w) {
    return smoothstep(0.0, w, f) * (1.0 - smoothstep(duty - w, duty, f));
}

// Structured start states: rgb is pigment times coverage, a is coverage.
// Gaps are genuinely empty, so in MIDI mode notes can still fill them.
vec4 startState(vec2 fragCoord) {
    vec2 uv = fragCoord / R;
    vec2 p = (2.0 * fragCoord - R) / R.y;
    float px = 2.0 / R.y, r = length(p), a = atan(p.y, p.x);
    float t = 0.0, mask = 1.0;

    if (uStart == 1) {            // Rings: concentric bands for the radial pulse
        float s = r * 6.0;
        mask = band(fract(s), 0.62, 6.0 * px);
        t = floor(s) / 7.0;
    } else if (uStart == 2) {     // Stripes: vertical bands the curl will shear
        float s = uv.x * 10.0;
        mask = band(fract(s), 0.6, 10.0 / R.x);
        t = floor(s) / 10.0;
    } else if (uStart == 3) {     // Checker: alternate tiles, grout between
        vec2 c = floor(p * 3.0), f = fract(p * 3.0);
        float w = 3.0 * px;
        mask = mod(c.x + c.y, 2.0) * band(f.x, 0.94, w) * band(f.y, 0.94, w);
        t = fract((c.x - c.y) / 9.0);
    } else if (uStart == 4) {     // Spiral: five logarithmic arms
        float arms = 5.0, s = a / 6.2831853 * arms + log(max(r, 1e-4)) * 1.6;
        float w = px * length(vec2(arms / 6.2831853, 1.6)) / max(r, 1e-4);
        mask = band(fract(s), 0.5, min(w, 0.25)) * smoothstep(0.04, 0.08, r);
        t = mod(floor(s), arms) / arms;
    } else if (uStart == 5) {     // Color wheel: hue by angle in a ring
        mask = (1.0 - smoothstep(0.85 - px, 0.85 + px, r)) * smoothstep(0.15 - px, 0.15 + px, r);
        t = a / 6.2831853;
    } else if (uStart == 6) {     // Gyroid slice: two phases of the field itself
        float g = gyroid(vec3(p * 2.6 * uScale, 0.9));
        float w = max(fwidth(g), 1e-4);
        float hi = smoothstep(0.25 - w, 0.25 + w, g), lo = smoothstep(-0.25 + w, -0.25 - w, g);
        mask = hi + lo;
        t = hi * (0.05 + 0.2 * uv.x) + lo * (0.55 + 0.2 * uv.y);
    } else if (uStart == 7) {     // Yin-yang: two interlocking halves
        float k = 0.8, h = k * 0.5;
        float up = length(p - vec2(0.0, h)), dn = length(p + vec2(0.0, h));
        float side = p.x > 0.0 ? 1.0 : 0.0;
        if (up < h) side = 0.0; else if (dn < h) side = 1.0;
        if (up < k / 8.0 || dn < k / 8.0) side = 1.0 - side;
        mask = 1.0 - smoothstep(k - px, k + px, r);
        t = side * 0.5 + 0.08;
    } else {                      // Color wash: the supplied full-screen palette
        vec3 wash = 0.5 + 0.5 * cos(vec3(1.0, 2.0, 3.0) * 5.5 + iTime + (uv.x + uv.y) * 6.0 + uPalette);
        return vec4(wash, 1.0);
    }
    return vec4(ink(t) * mask, uMidiMode ? mask : 1.0);
}

// Ambient velocity at uv, in the shader's offset units: the curl of the
// layered gyroid plus a radial pulse, eased in by uFlowGain. It depends only
// on position and time, never on the smoke, which is what lets the backward
// mode rebuild the flow map deterministically.
vec2 ambientOffset(vec2 uv) {
    vec2 p = (2.0 * uv * R - R) / R.y * uScale;
    vec3 pos = vec3(p, length(p) * 0.5);

    // The perpendicular noise gradient gives a swirling velocity field.
    vec2 e = vec2(0.01, 0.0);
    float x = (noise(pos + e.yxy) - noise(pos - e.yxy)) / (2.0 * e.x);
    float y = (noise(pos + e.xyy) - noise(pos - e.xyy)) / (2.0 * e.x);
    vec2 offset = vec2(x, -y) * uCurl;

    // Avoid normalize(vec2(0)) at the center of odd-sized render targets.
    float radius = length(p);
    vec2 radialDirection = p / max(radius, 0.000001);
    offset -= radialDirection * sin(iTime * 2.0 - radius * 6.0) * uPulse;
    // Structured starts ease the ambient flow in, so their shapes visibly dissolve.
    return offset * uFlowGain;
}

// Where the ambient flow samples from, as a uv displacement.
vec2 ambientStep(vec2 uv) {
    return ambientOffset(uv) * 0.002 * vec2(R.y / R.x, 1.0);
}

// The frame-zero state: uStart < 0 is the mode default, an empty MIDI room
// or the wash.
vec4 initialState(vec2 fragCoord) {
    return uStart < 0 && uMidiMode ? vec4(0.0) : startState(fragCoord);
}
