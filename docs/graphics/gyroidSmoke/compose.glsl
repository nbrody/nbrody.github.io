// Backward mode, compose pass: the smoke after n steps is the start frame
// seen through the flow map, so draw the start state at G_n(uv) directly.
// iChannel0 holds map n (see map.glsl). The pattern is procedural, so points carried in from
// beyond the edges keep their pattern instead of a clamped border color.
//
// The live flow diffuses slightly every step (bilinear resampling); a map
// has no such loss and would stay crisp. uBlur, a radius in start-frame
// pixels that grows with n, averages a disk of the pattern to match it.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / R;
    vec4 map = texture(iChannel0, uv);
    vec2 origin = (uv + map.xy) * R;
    vec4 wash = vec4(0.5 + 0.5 * cos(vec3(1.0, 2.0, 3.0) * 5.5 + map.w + uPalette), 1.0);
    float edge = clamp(map.z, 0.0, 1.0);
    if (uBlur < 0.5) {
        fragColor = mix(initialState(origin), wash, edge);
        return;
    }
    // Vogel disk, rotated per pixel by the noise tile to trade banding for grain.
    const int TAPS = 12;
    float spin = texture(iChannel1, fragCoord / 1024.0).r * 6.2831853;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < TAPS; i++) {
        float r = sqrt((float(i) + 0.5) / float(TAPS)) * uBlur;
        float a = float(i) * 2.3999632 + spin;
        sum += initialState(origin + r * vec2(cos(a), sin(a)));
    }
    fragColor = mix(sum / float(TAPS), wash, edge);
}
