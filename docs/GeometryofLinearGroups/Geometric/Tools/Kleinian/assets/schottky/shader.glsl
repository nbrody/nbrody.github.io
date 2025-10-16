#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform vec4 u_spheres[4];

const int MAX_ITER = 12;
const int NUM_SPHERES = 4;
const float EPSILON = 0.001;
const float MAX_DIST = 100.0;
#define SHOW_FRACTAL 1
vec3 fractalColor(vec2 uv) {
    // scale uv to cover a nice region; tweak as desired
    vec3 p = vec3(uv * 2.0, 0.0);
    vec3 col = vec3(0.0);

    const int ITERS = 80;
    int lastIdx = -1;
    int j;
    int k;
    for (k = 0; k < ITERS; k++) {
        // choose sphere with maximum r^2 / |p-c|^2
        int idx = -1;
        float best = -1.0;
        for (j = 0; j < NUM_SPHERES; j++) {
            vec3 c;
            float r;
            if (j == 0) { c = u_spheres[0].xyz; r = u_spheres[0].w; }
            else if (j == 1) { c = u_spheres[1].xyz; r = u_spheres[1].w; }
            else if (j == 2) { c = u_spheres[2].xyz; r = u_spheres[2].w; }
            else { c = u_spheres[3].xyz; r = u_spheres[3].w; }
            vec3 v = p - c;
            float d2 = dot(v, v);
            if (d2 < 1e-6) break; // avoid singularity
            float r2 = r * r;
            float ratio = r2 / d2;
            if (ratio > best) { best = ratio; idx = j; }
        }
        if (idx < 0) break;

        // Get chosen sphere again without dynamic component indexing
        vec3 cc; float rr;
        if (idx == 0) { cc = u_spheres[0].xyz; rr = u_spheres[0].w; }
        else if (idx == 1) { cc = u_spheres[1].xyz; rr = u_spheres[1].w; }
        else if (idx == 2) { cc = u_spheres[2].xyz; rr = u_spheres[2].w; }
        else { cc = u_spheres[3].xyz; rr = u_spheres[3].w; }

        vec3 v = p - cc;
        float d2 = dot(v, v);
        float r2 = rr * rr;
        p = cc + v * (r2 / d2);
        lastIdx = idx;

        if (dot(p, p) > 64.0) break; // escaped
    }

    // color by last index and iteration count
    vec3 base;
    if (lastIdx == 0) base = vec3(0.90, 0.35, 0.30);
    else if (lastIdx == 1) base = vec3(0.30, 0.70, 0.95);
    else if (lastIdx == 2) base = vec3(0.40, 0.90, 0.50);
    else base = vec3(0.95, 0.85, 0.30);

    float t = float(k) / float(ITERS);
    // gentle bands
    float bands = 0.5 + 0.5 * sin(6.2831853 * (t * 6.0));
    col = base * mix(0.25, 1.0, bands * (1.0 - t));
    return col;
}

struct HitInfo {
    float dist;
    vec3 color;
    vec3 normal;
};

float intersectSphere(vec3 rayOrigin, vec3 rayDir, vec4 sphere) {
    vec3 oc = rayOrigin - sphere.xyz;
    float b = dot(oc, rayDir);
    float c = dot(oc, oc) - sphere.w * sphere.w;
    float h = b*b - c;
    if (h < 0.0) return -1.0;
    return -b - sqrt(h);
}

HitInfo map(vec3 ro, vec3 rd) {
    HitInfo result;
    result.dist = MAX_DIST;

    float scale = 1.0;
    int j;
    for (int i = 0; i < MAX_ITER; i++) {
        int closestSphereIndex = -1;
        float maxRadiusSqOverDistSq = 0.0;
        
        for (j = 0; j < NUM_SPHERES; j++) {
            float r2 = u_spheres[j].w * u_spheres[j].w;
            float d2 = dot(ro - u_spheres[j].xyz, ro - u_spheres[j].xyz);
            float ratio = r2 / d2;
            if (ratio > maxRadiusSqOverDistSq) {
                maxRadiusSqOverDistSq = ratio;
                closestSphereIndex = j;
            }
        }

        if (closestSphereIndex == -1) break;

        vec4 s;
        if (closestSphereIndex == 0) s = u_spheres[0];
        else if (closestSphereIndex == 1) s = u_spheres[1];
        else if (closestSphereIndex == 2) s = u_spheres[2];
        else if (closestSphereIndex == 3) s = u_spheres[3];
        
        vec3 v = ro - s.xyz;
        if (dot(v, v) < 1e-6) break; // avoid division by zero at the center
        float r2 = s.w * s.w;
        float d2 = dot(v, v);
        float newScale = r2 / d2;
        
        // Invert the ray's origin point
        ro = s.xyz + v * newScale;
        
        // --- FIX #2: FRACTAL MATH ---
        // The ray's direction vector must also be transformed.
        // The old reflection logic was incorrect. This correctly applies the
        // derivative of the inversion to the direction vector.
        // Inversion differential: (r^2/d2) * (I - 2 vv^T / d2) applied to rd
        rd = normalize((r2 / d2) * (rd - 2.0 * v * dot(v, rd) / d2));

        // Keep track of the change in scale
        scale *= newScale;
    }

    float min_dist = MAX_DIST;
    vec3 hit_color = vec3(0.0);
    int hit_sphere_idx = -1;

    for (j = 0; j < NUM_SPHERES; j++) {
        float d = intersectSphere(ro, rd, u_spheres[j]);
        if (d > EPSILON && d < min_dist) {
            min_dist = d;
            hit_sphere_idx = j;
        }
    }

    if (hit_sphere_idx > -1) {
        result.dist = min_dist * scale;
        
        if(hit_sphere_idx == 0) hit_color = vec3(0.9, 0.2, 0.2);
        else if(hit_sphere_idx == 1) hit_color = vec3(0.2, 0.9, 0.2);
        else if(hit_sphere_idx == 2) hit_color = vec3(0.2, 0.2, 0.9);
        else hit_color = vec3(0.9, 0.9, 0.2);
        result.color = hit_color;

        vec3 hit_pos_local = ro + rd * min_dist;
        vec3 normal_local;

        if (hit_sphere_idx == 0) normal_local = normalize(hit_pos_local - u_spheres[0].xyz);
        else if (hit_sphere_idx == 1) normal_local = normalize(hit_pos_local - u_spheres[1].xyz);
        else if (hit_sphere_idx == 2) normal_local = normalize(hit_pos_local - u_spheres[2].xyz);
        else normal_local = normalize(hit_pos_local - u_spheres[3].xyz);

        result.normal = normal_local;
    }

    return result;
}

mat3 setCamera(vec3 ro, vec3 ta, float cr) {
	vec3 cw = normalize(ta-ro);
	vec3 cp = vec3(sin(cr), cos(cr), 0.0);
	vec3 cu = normalize(cross(cw,cp));
	vec3 cv = normalize(cross(cu,cw));
    return mat3(cu, cv, cw);
}

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - u_resolution.xy) / u_resolution.y;

    // Seed background with fractal color
    vec3 col = fractalColor(uv);

    float camDist = 3.0;
    vec3 ro = vec3(camDist * cos(u_mouse.x) * sin(u_mouse.y), camDist * cos(u_mouse.y), camDist * sin(u_mouse.x) * sin(u_mouse.y));
    vec3 ta = vec3(0.0, 0.0, 0.0);

    mat3 cam = setCamera(ro, ta, 0.0);
    
    // --- FIX #1: CAMERA ZOOM ---
    // The 'z' component here controls the Field of View. 
    // Changed from 2.0 to 1.5 to "zoom out" and fill the screen.
    vec3 rd = cam * normalize(vec3(uv, 1.0)); 

    HitInfo hit = map(ro, rd);

    if (hit.dist < MAX_DIST) {
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        vec3 normal = normalize(hit.normal);
        
        float diffuse = max(0.0, dot(normal, lightDir));
        float spec = pow(max(0.0, dot(reflect(-lightDir, normal), -rd)), 16.0);
        col = hit.color * (0.18 + 0.72 * diffuse) + 0.10 * spec; // overwrite fractal bg on hit
    }

    fragColor = vec4(col, 1.0);
}