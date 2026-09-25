// Feedback pass adapted from the supplied gyroid curl smoke shader.
// iChannel0 is the previous simulation frame; common.glsl is prepended.

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    if (iFrame < 1) {
        fragColor = initialState(fragCoord);
        return;
    }
    vec2 uv = fragCoord / R;
    vec2 offset = ambientOffset(uv);

    // Notes stir separate parts of the field, so a chord draws several plumes.
    for (int i = 0; i < 8; i++) {
        vec4 note = uMidiNotes[i];
        if (note.w <= 0.0) continue;
        vec2 d = (uv - note.xy) * vec2(R.x / R.y, 1.0);
        float influence = exp(-dot(d, d) * 32.0) * note.w;
        offset += vec2(-d.y, d.x) * influence * 16.0;
    }

    uv += offset * 0.002 * vec2(R.y / R.x, 1.0);
    vec4 frame = texture(iChannel0, uv);

    // The original non-MIDI flow feeds color at its edges.
    bool spawn = !uMidiMode && (fragCoord.x < 1.0 || fragCoord.x > R.x - 1.0
        || fragCoord.y < 1.0 || fragCoord.y > R.y - 1.0);
    vec3 color = spawn
        ? 0.5 + 0.5 * cos(vec3(1.0, 2.0, 3.0) * 5.5
            + iTime + (uv.x + uv.y) * 6.0 + uPalette)
        : max(vec3(0.0), frame.rgb);
    float coverage = uMidiMode ? clamp(frame.a, 0.0, 1.0) : 1.0;

    // Inject note-colored smoke into the unlit state. It then follows the same
    // advection as the original palette, leaving a trail after each note ends.
    for (int i = 0; i < 8; i++) {
        vec4 note = uMidiNotes[i];
        if (note.w <= 0.0) continue;
        vec2 d = (fragCoord / R - note.xy) * vec2(R.x / R.y, 1.0);
        // A bounded source leaves the rest of an empty room truly empty.
        float plume = exp(-dot(d, d) * 70.0)
            * (1.0 - smoothstep(0.16, 0.24, length(d))) * note.w;
        vec3 ink = 0.55 + 0.45 * cos(6.2831853 * (note.z + vec3(0.0, 0.333, 0.667)) + uPalette);
        float deposit = clamp(plume * 0.12, 0.0, 0.4) * (1.0 - coverage);
        // Store pigment times coverage. New notes fill the remaining space;
        // old pigment and coverage travel together and have no decay term.
        color += ink * deposit;
        coverage += deposit;
    }

    fragColor = vec4(color, coverage);
    if (uMidiMode) {
        // Round explicitly before RGBA16F storage; truncating tiny amounts on
        // every feedback step would otherwise slowly drain persistent smoke.
        fragColor = vec4(unpackHalf2x16(packHalf2x16(fragColor.rg)),
                         unpackHalf2x16(packHalf2x16(fragColor.ba)));
    }
}
