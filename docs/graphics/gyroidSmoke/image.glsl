// Display pass adapted from the supplied smoke relief shader.
// iChannel0 is the latest simulation; iChannel1 is a static 1024px noise tile.
float heightAt(vec2 uv) {
    vec4 smoke = texture(iChannel0, uv);
    return uMidiMode ? smoke.a : smoke.r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    vec3 blu = texture(iChannel1, fragCoord / 1024.0).rgb;
    vec3 color = texture(iChannel0, uv).rgb;

    // Random sampling distances create fine relief without changing the fluid.
    vec2 e = vec2(pow(blu.x, 3.0) * 0.084, 0.0);
    vec3 normal = vec3(
        heightAt(uv + e.xy) - heightAt(uv - e.xy),
        heightAt(uv - e.yx) - heightAt(uv + e.yx),
        heightAt(uv) * 0.1
    );
    if (abs(normal.x) + abs(normal.y) + abs(normal.z) > 0.001) {
        normal = normalize(normal);
    }

    vec3 light = normalize(vec3(sin(uLightAngle), cos(uLightAngle), 1.0));
    float shade = dot(normal, light) * 0.5 + 0.5;
    color *= mix(1.0, shade, clamp(uRelief, 0.0, 1.0));

    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luminance), color, uSaturation) * uExposure;
    fragColor = vec4(color, 1.0);
}
