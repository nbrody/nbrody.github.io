#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec3 u_circles[10]; // x, y, radius
uniform int u_circleCount;
uniform int u_colorScheme;
uniform int u_coloringMode;

// Constants
const int MAX_ITER = 100;
const int MAX_CIRCLES = 10;

// HSV to RGB helper
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Inversion in a circle
vec2 invert(vec2 p, vec3 circle) {
    vec2 diff = p - circle.xy;
    float r2 = circle.z * circle.z;
    float d2 = dot(diff, diff);
    return circle.xy + diff * (r2 / d2);
}

void main() {
    // Map pixel to complex plane
    vec2 uv = (gl_FragCoord.xy - u_resolution.xy * 0.5) / u_resolution.y;
    vec2 z = uv * u_zoom - u_pan;

    int iter = 0;
    int lastIdx = -1;
    int secondLastIdx = -1;
    
    // Escape time / Orbit trap algorithm
    // We iterate inversions if the point is inside a circle.
    // If it's outside all circles, it's in the fundamental domain (escaped).
    
    bool trapped = false;

    for (int i = 0; i < MAX_ITER; i++) {
        int insideIdx = -1;
        
        // Find which circle we are inside
        for (int j = 0; j < MAX_CIRCLES; j++) {
            if (j >= u_circleCount) break;
            
            vec3 c = u_circles[j];
            float d2 = dot(z - c.xy, z - c.xy);
            if (d2 < c.z * c.z) {
                insideIdx = j;
                // Optimization: if circles are disjoint, we can break early.
                // But for overlapping (reflection groups), we might need to be careful about order.
                // Usually just picking the first one is fine for standard limit set rendering.
                break; 
            }
        }

        if (insideIdx == -1) {
            // Escaped to fundamental domain
            iter = i;
            break;
        }

        // Invert
        z = invert(z, u_circles[insideIdx]);
        
        secondLastIdx = lastIdx;
        lastIdx = insideIdx;
        iter = i;
        
        if (i == MAX_ITER - 1) {
            trapped = true;
        }
    }

    vec3 col = vec3(0.0);

    // --- Coloring Logic ---
    
    // 1. Determine the mapping value 't' based on Coloring Mode
    float t = 0.0;
    
    if (u_coloringMode == 0) { // Depth
        t = float(iter) / float(MAX_ITER);
    } 
    else if (u_coloringMode == 1) { // Generator ID
        if (lastIdx != -1) {
            t = float(lastIdx) / float(u_circleCount);
        } else {
            t = 0.0;
        }
    }
    else if (u_coloringMode == 2) { // Parity
        t = float(iter % 2);
    }
    else if (u_coloringMode == 3) { // Electric
        t = float(iter) / 20.0; // Exponential decay factor
    }

    // 2. Apply Palette based on 't'
    
    if (trapped) {
        // Trapped points (limit set approximation or deep recursion)
        col = vec3(0.0); 
    } else {
        // Palettes
        if (u_colorScheme == 0) { // Teal / Fuchsia
            vec3 teal = vec3(0.0, 0.8, 0.8);
            vec3 fuchsia = vec3(1.0, 0.0, 1.0);
            if (u_coloringMode == 2) { // Parity special case
                col = (t < 0.5) ? teal : fuchsia;
            } else {
                col = mix(teal, fuchsia, sqrt(clamp(t, 0.0, 1.0)));
            }
        }
        else if (u_colorScheme == 1) { // Sunset
            vec3 purple = vec3(0.2, 0.0, 0.4);
            vec3 orange = vec3(1.0, 0.6, 0.1);
            vec3 yellow = vec3(1.0, 0.9, 0.5);
            if (u_coloringMode == 2) {
                col = (t < 0.5) ? purple : orange;
            } else {
                float T = clamp(t * 1.5, 0.0, 1.5);
                col = mix(purple, orange, min(1.0, T));
                col = mix(col, yellow, max(0.0, T - 1.0));
            }
        }
        else if (u_colorScheme == 2) { // Matrix
            vec3 black = vec3(0.0);
            vec3 green = vec3(0.0, 1.0, 0.2);
            if (u_coloringMode == 2) {
                col = (t < 0.5) ? black : green;
            } else {
                col = green * exp(-t * 5.0); // Glow decay
                // Digital rain effect
                if (mod(gl_FragCoord.y * 0.1 - u_time * 5.0, 20.0) < 2.0) {
                    col += vec3(0.5, 1.0, 0.5);
                }
            }
        }
        else if (u_colorScheme == 3) { // Rainbow
            float hue = t + u_time * 0.1;
            col = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
        }
        else if (u_colorScheme == 4) { // Monochrome
            col = vec3(t);
        }
        else if (u_colorScheme == 5) { // Ice / Fire
            vec3 ice = vec3(0.0, 0.5, 1.0);
            vec3 fire = vec3(1.0, 0.2, 0.0);
            col = mix(ice, fire, t);
        }
        
        // Add generator ID variation if not in Generator Mode
        if (u_coloringMode != 1 && lastIdx != -1) {
            col += 0.05 * sin(float(lastIdx) * 2.0);
        }
    }

    // Gamma correction
    col = pow(col, vec3(0.4545));
    
    fragColor = vec4(col, 1.0);
}