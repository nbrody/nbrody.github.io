// Backward mode, step pass: advance the flow map by one step.
// iChannel0 holds map n-1; rg is the displacement D with G(uv) = uv + D(uv),
// where G_n is the point of the start frame that the smoke at uv came from
// after n steps. The flow pass computes color_n = color_{n-1}(uv + step), so
// G_n(uv) = G_{n-1}(uv + step) and D_n(uv) = step + D_{n-1}(uv + step).
//
// Outside MIDI mode the live flow also paints the wash into its border every
// step; that smoke came from no point of the start frame. b is the weight of
// such edge smoke and a is its wash phase (time + position), which the map
// carries along exactly like the displacement.
//
// Runs at the map's own (reduced) resolution; iResolution is the canvas's so
// the field (and its octave count) matches the live flow.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / uMapSize;
    vec2 move = ambientStep(uv);
    vec2 source = uv + move;
    bool edge = !uMidiMode && (fragCoord.x < 1.0 || fragCoord.x > uMapSize.x - 1.0
        || fragCoord.y < 1.0 || fragCoord.y > uMapSize.y - 1.0);
    if (edge) {
        fragColor = vec4(move, 1.0, iTime + (source.x + source.y) * 6.0);
        return;
    }
    vec4 previous = texture(iChannel0, source);
    fragColor = vec4(move + previous.xy, previous.zw);
}
