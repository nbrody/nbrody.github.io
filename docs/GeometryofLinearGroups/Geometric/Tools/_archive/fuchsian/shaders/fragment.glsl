varying vec2 vUv;

// --- Uniforms
uniform vec2 u_resolution;
uniform mat4 u_inverseViewProjectionMatrix;
uniform vec3 u_cameraPosition;
uniform int u_palette_mode; // 0=colorful, 1=vaporwave, 2=uc
uniform int u_selected_face_id; // -1 for none
uniform float u_pop_strength;   // 0..1, animated pop
uniform float u_hover_offset;   // persistent offset distance for the selected face
uniform float u_edge_width;        // edge highlight width in SDF-difference space
uniform float u_edge_boost;        // extra brightness along edges for the selected face
uniform float u_edge_global;       // global edge strength for all faces
uniform float u_edge_select_boost; // multiplicative boost when the selected face participates in the edge
uniform ivec2 u_selected_edge_faces; // stores the two face IDs of the selected edge (-1, -1 if none)
uniform vec3 u_selected_vertex_pos; // position of selected vertex (inside ball)
uniform float u_selected_vertex_radius; // small radius for the highlight sphere

const int MAX_PLANES = 256;

// --- Spherical Boundaries (from vectors with w < 0)
uniform int u_num_sphere_planes;
uniform vec3 u_sphere_centers[MAX_PLANES];
uniform float u_sphere_radii[MAX_PLANES];

// --- Euclidean Planar Boundaries (from vectors with w = 0)
uniform int u_num_euclidean_planes;
uniform vec3 u_plane_normals[MAX_PLANES]; // Pre-oriented to point "inward"

// --- Ray Marching Settings
const int MAX_STEPS = 150;
const float MAX_DIST = 10.0;
const float HIT_THRESHOLD = 0.001;

// --- Utilities for per-face colors
vec3 hsv2rgb(vec3 c) {
    vec3 rgb = clamp( abs(mod(c.x*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0 );
    return c.z * mix(vec3(1.0), rgb, c.y);
}

vec3 faceColor(float id) {
    if (u_palette_mode == 0) {
        // colorful: golden-ratio hue stepping
        float h = fract(id * 0.61803398875);
        return hsv2rgb(vec3(h, 0.6, 0.9));
    } else if (u_palette_mode == 1) {
        // vaporwave palette (8 colors)
        int k = int(mod(id, 8.0));
        if (k == 0) return vec3(0.988, 0.741, 0.961); // pink-ish
        if (k == 1) return vec3(0.776, 0.706, 0.988); // lilac
        if (k == 2) return vec3(0.600, 0.800, 0.988); // light cyan
        if (k == 3) return vec3(0.525, 0.898, 0.839); // mint
        if (k == 4) return vec3(0.988, 0.843, 0.600); // peach
        if (k == 5) return vec3(0.949, 0.600, 0.741); // rose
        if (k == 6) return vec3(0.678, 0.678, 0.988); // periwinkle
        return vec3(0.514, 0.867, 0.988);             // sky
    } else if (u_palette_mode == 3) {
        // halloween palette (4 colors): pumpkin, deep purple, slime green, charcoal
        int k = int(mod(id, 4.0));
        if (k == 0) return vec3(1.000, 0.431, 0.000); // pumpkin orange (#FF6E00)
        if (k == 1) return vec3(0.361, 0.000, 0.616); // deep purple (#5C009D)
        if (k == 2) return vec3(0.561, 0.831, 0.000); // slime green (#8FD400)
        return vec3(0.102, 0.102, 0.122);             // charcoal (#1A1A1F)
    } else if (u_palette_mode == 4) {
        // tie-dye: sinusoidal hue/sat/val variations for a psychedelic effect
        float h = fract(0.5 + 0.5 * sin(id * 2.399));
        float s = clamp(0.70 + 0.30 * sin(id * 1.113 + 1.0), 0.55, 1.0);
        float v = clamp(0.90 + 0.10 * sin(id * 0.713 + 2.0), 0.75, 1.0);
        return hsv2rgb(vec3(h, s, v));
    } else if (u_palette_mode == 5) {
        // sunset palette (16 colors, id wraps mod 16) -- randomized
        int k = int(floor(fract(sin(id * 12.9898) * 43758.5453) * 16.0));
        if (k == 0)  return vec3(0.965, 0.843, 0.647);
        if (k == 1)  return vec3(0.933, 0.831, 0.671);
        if (k == 2)  return vec3(0.933, 0.686, 0.380);
        if (k == 3)  return vec3(0.941, 0.627, 0.431);
        if (k == 4)  return vec3(0.984, 0.565, 0.384);
        if (k == 5)  return vec3(0.980, 0.482, 0.369);
        if (k == 6)  return vec3(0.949, 0.416, 0.400);
        if (k == 7)  return vec3(0.933, 0.365, 0.424);
        if (k == 8)  return vec3(0.847, 0.329, 0.529);
        if (k == 9)  return vec3(0.808, 0.286, 0.576);
        if (k == 10) return vec3(0.714, 0.224, 0.663);
        if (k == 11) return vec3(0.561, 0.122, 0.643);
        if (k == 12) return vec3(0.416, 0.051, 0.514);
        if (k == 13) return vec3(0.310, 0.008, 0.439);
        if (k == 14) return vec3(0.227, 0.000, 0.357);
        return vec3(0.118, 0.000, 0.247);
    } else {
        // uc colors: alternate UC blue & gold
        int k = int(mod(id, 2.0));
        if (k == 0) return vec3(0.000, 0.200, 0.400); // UC Blue
        return vec3(1.000, 0.737,  0.000);             // UC Gold
    }
}

// Signed Distance Function with face ID reporting.
vec2 sceneSDFWithId(vec3 p) {
    float max_dist = -MAX_DIST;
    float face_id  = -1.0;

    // 1) Spherical boundaries (IDs 0 .. u_num_sphere_planes-1)
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= u_num_sphere_planes) break;
        float dist_to_sphere = length(p - u_sphere_centers[i]) - u_sphere_radii[i];
        float sdf = -dist_to_sphere; // inside = negative, we flip to match intersection convention used
        // For selected face, keep main geometry fixed — no SDF offset.
        if (u_selected_face_id >= 0 && i == u_selected_face_id) {
            // Keep main geometry fixed — no SDF offset.
        }
        if (sdf > max_dist) { max_dist = sdf; face_id = float(i); }
    }

    // 2) Euclidean planar boundaries (IDs offset after spheres)
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= u_num_euclidean_planes) break;
        float sdf = dot(p, u_plane_normals[i]);
        int fid_i = u_num_sphere_planes + i;
        // For selected face, keep main geometry fixed — no SDF offset.
        if (u_selected_face_id >= 0 && fid_i == u_selected_face_id) {
            // Keep main geometry fixed — no SDF offset.
        }
        if (sdf > max_dist) { max_dist = sdf; face_id = float(fid_i); }
    }

    // --- Optional vertex highlight sphere (rendered as a surface) ---
    if (u_selected_vertex_radius > 0.0) {
        float vSDF = -(length(p - u_selected_vertex_pos) - u_selected_vertex_radius);
        // Use a large special face id that won't collide with regular faces
        if (vSDF > max_dist) { max_dist = vSDF; face_id = 10000.0; }
    }

    return vec2(max_dist, face_id);
}

// Returns (bestVal, bestId, secondVal, secondId) packed in vec4
vec4 sceneSDFTop2(vec3 p) {
    float bestVal = -MAX_DIST;
    float bestId  = -1.0;
    float secondVal = -MAX_DIST;
    float secondId  = -1.0;
    // spheres
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= u_num_sphere_planes) break;
        float dist_to_sphere = length(p - u_sphere_centers[i]) - u_sphere_radii[i];
        float sdf = -dist_to_sphere;
        if (sdf > bestVal) {
            secondVal = bestVal; secondId = bestId;
            bestVal = sdf; bestId = float(i);
        } else if (sdf > secondVal) {
            secondVal = sdf; secondId = float(i);
        }
    }
    // planes (IDs offset by u_num_sphere_planes)
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= u_num_euclidean_planes) break;
        float sdf = dot(p, u_plane_normals[i]);
        float fid = float(u_num_sphere_planes + i);
        if (sdf > bestVal) {
            secondVal = bestVal; secondId = bestId;
            bestVal = sdf; bestId = fid;
        } else if (sdf > secondVal) {
            secondVal = sdf; secondId = fid;
        }
    }
    return vec4(bestVal, bestId, secondVal, secondId);
}

vec3 getNormal(vec3 p) {
    vec2 e = vec2(HIT_THRESHOLD, 0.0);
    float d = sceneSDFWithId(p).x;
    vec3 n = d - vec3(
        sceneSDFWithId(p - e.xyy).x,
        sceneSDFWithId(p - e.yxy).x,
        sceneSDFWithId(p - e.yyx).x
    );
    return normalize(n);
}

vec3 applyLighting(vec3 color, vec3 normal, vec3 p) {
    vec3 lightPos = u_cameraPosition + vec3(0.5, 0.5, 0.5);
    vec3 lightDir = normalize(lightPos - p);
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * color;
    vec3 ambient = 0.2 * color;
    return ambient + diffuse;
}

vec2 raySphereIntersect(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b*b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
}

void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    vec4 pNear = u_inverseViewProjectionMatrix * vec4(uv, -1.0, 1.0);
    vec4 pFar  = u_inverseViewProjectionMatrix * vec4(uv,  1.0, 1.0);
    vec3 ro = u_cameraPosition;
    vec3 rd = normalize(pFar.xyz / pFar.w - ro);

    vec2 t_ball = raySphereIntersect(ro, rd, 1.0);
    if (t_ball.x < 0.0 && t_ball.y < 0.0) discard;

    float t = max(0.0, t_ball.x);
    vec3 p = ro + rd * t;
    bool hit = false;

    for (int i = 0; i < MAX_STEPS; i++) {
        if ((t_ball.y > 0.0 && t > t_ball.y) || t > MAX_DIST) break;

        float dist = sceneSDFWithId(p).x;
        if (abs(dist) < HIT_THRESHOLD) {
            hit = true;
            break;
        }
        // Always move forward: outside region (dist<0) would step backwards; use abs() with a small floor.
        float step = max(abs(dist), 0.001);
        t += step;
        p = ro + rd * t;
    }

    if (hit) {
        float faceId = sceneSDFWithId(p).y;
        vec3 baseColor;
        if (faceId == 10000.0) {
            baseColor = vec3(1.0); // white for vertex sphere
        } else {
            baseColor = faceColor(faceId);
        }
        vec3 normal = getNormal(p);
        // Two-sided shading: ensure the normal faces the viewer
        if (dot(normal, -rd) < 0.0) normal = -normal;
        vec3 litColor = applyLighting(baseColor, normal, p);
        // --- Edge highlighting (global + edge-specific) ---
        // Compute proximity to an edge: small gap between the top-2 SDFs
        vec4 top2 = sceneSDFTop2(p);
        float bestVal = top2.x;
        float secondVal = top2.z;
        float gap = max(0.0, bestVal - secondVal);
        // Edge factor peaks when gap → 0, fades out by ~u_edge_width
        float edgeFactor = 1.0 - smoothstep(0.0, u_edge_width, gap);
        // Always draw a subtle global edge line
        litColor += edgeFactor * u_edge_global;

        // Highlight only the selected edge when set
        if (u_selected_edge_faces.x >= 0 && u_selected_edge_faces.y >= 0) {
            bool isSelectedEdge =
                ( (int(top2.y) == u_selected_edge_faces.x && int(top2.w) == u_selected_edge_faces.y) ||
                  (int(top2.y) == u_selected_edge_faces.y && int(top2.w) == u_selected_edge_faces.x) );
            if (isSelectedEdge) {
                float popK = (0.6 * clamp(u_pop_strength, 0.0, 1.0));
                litColor += edgeFactor * (u_edge_boost + u_edge_select_boost * (1.0 + popK));
            }
        } else if (u_selected_face_id >= 0) {
            // Fallback: highlight edges around the selected face if no edge is selected
            bool selectedInvolved = (int(top2.y) == u_selected_face_id) || (int(top2.w) == u_selected_face_id);
            if (selectedInvolved) {
                float popK = (0.6 * clamp(u_pop_strength, 0.0, 1.0));
                litColor += edgeFactor * (u_edge_boost + u_edge_select_boost * (1.0 + popK));
            }
        }
        // Additionally, brighten the selected face overall when hovered/popped
        if (int(faceId) == u_selected_face_id) {
            litColor *= (1.0 + 0.25 + 0.4 * clamp(u_pop_strength, 0.0, 1.0));
        }

        // --- Phantom hovering face overlay (safe additive version) ---
        if (u_selected_face_id >= 0) {
            float faceIdMain = sceneSDFWithId(p).y;
            if (int(faceIdMain) == u_selected_face_id) {
                // Compute normal and displaced point
                vec3 n = getNormal(p);
                vec3 pHover = p + n * (0.04 + 0.04 * clamp(u_pop_strength, 0.0, 1.0));
                // Only add phantom if still inside the ball and not occluded
                if (length(pHover) < 0.98) {
                    vec2 phantom = sceneSDFWithId(pHover);
                    if (int(phantom.y) == u_selected_face_id) {
                        vec3 phantomColor = faceColor(float(u_selected_face_id));
                        phantomColor = mix(phantomColor, vec3(1.0), 0.2);
                        float glow = 0.3 + 0.7 * clamp(u_pop_strength, 0.0, 1.0);
                        // Blend phantom softly above the real face
                        litColor = mix(litColor, litColor + phantomColor * glow * 0.5, 0.6);
                    }
                }
            }
        }
        gl_FragColor = vec4(litColor, 1.0);
    } else {
        discard;
    }
}
