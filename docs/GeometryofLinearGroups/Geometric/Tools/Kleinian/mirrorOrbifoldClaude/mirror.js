/**
 * Mirror Shader Module
 * 
 * Implements raymarching shaders for one-way mirror surfaces arranged
 * as pentagonal patches of spheres in a hyperbolic dodecahedron.
 * 
 * Features:
 * - Strict pentagonal clipping (mirrors are only the intersection regions)
 * - One-way mirror logic: Entry from outside, reflection from inside
 * - Edge-based light tube coloring with multiple palettes
 * - Metallic frames around each mirror
 * - Recursive reflections (infinity room effect)
 */

export const MirrorShader = {

    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        precision highp float;
        
        varying vec2 vUv;
        
        // Camera and projection
        uniform vec2 uResolution;
        uniform float uTime;
        uniform vec3 uCameraPos;
        uniform mat4 uInvProjection;
        uniform mat4 uInvView;
        
        // Polyhedron geometry
        const int MAX_FACES = 48;
        uniform int uNumFaces;
        uniform vec3 uFaceCenters[MAX_FACES];
        uniform float uFaceRadii[MAX_FACES];
        uniform vec3 uFaceNormals[MAX_FACES];
        
        // Rendering parameters
        uniform int uMaxBounces;
        uniform float uMirrorOpacity;
        uniform float uTransparency;
        uniform float uEdgeLightWidth;
        uniform float uBlackBorderWidth;
        uniform float uLightIntensity;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientColor;
        uniform int uPalette;
        uniform float uColorSpeed;
        
        // 5-color palettes for edge coloring
        vec3 getPaletteColor(int paletteIdx, int colorIdx) {
            int c = colorIdx - (colorIdx / 5) * 5;
            if (c < 0) c += 5;
            
            if (paletteIdx == 0) {
                // Cyan (original)
                if (c == 0) return vec3(0.0, 0.9, 1.0);
                if (c == 1) return vec3(0.0, 0.85, 0.95);
                if (c == 2) return vec3(0.1, 0.95, 1.0);
                if (c == 3) return vec3(0.0, 0.8, 0.9);
                return vec3(0.2, 1.0, 1.0);
            } else if (paletteIdx == 1) {
                // Ocean
                if (c == 0) return vec3(0.0, 0.2, 0.8);
                if (c == 1) return vec3(0.0, 0.5, 0.7);
                if (c == 2) return vec3(0.0, 0.7, 0.65);
                if (c == 3) return vec3(0.2, 0.85, 0.7);
                return vec3(0.4, 0.95, 0.8);
            } else if (paletteIdx == 2) {
                // Fire
                if (c == 0) return vec3(0.7, 0.0, 0.0);
                if (c == 1) return vec3(0.9, 0.2, 0.0);
                if (c == 2) return vec3(1.0, 0.4, 0.0);
                if (c == 3) return vec3(1.0, 0.65, 0.1);
                return vec3(1.0, 0.9, 0.3);
            } else if (paletteIdx == 3) {
                // Vaporwave
                if (c == 0) return vec3(1.0, 0.0, 0.5);
                if (c == 1) return vec3(0.0, 1.0, 1.0);
                if (c == 2) return vec3(0.6, 0.0, 1.0);
                if (c == 3) return vec3(1.0, 0.4, 0.7);
                return vec3(0.3, 0.8, 1.0);
            } else if (paletteIdx == 4) {
                // Skyspace Dawn
                if (c == 0) return vec3(0.812, 0.914, 1.0);    // Mist Blue
                if (c == 1) return vec3(0.749, 0.937, 0.910);  // Pale Aqua
                if (c == 2) return vec3(1.0, 0.890, 0.780);    // Warm Haze
                if (c == 3) return vec3(1.0, 0.714, 0.784);    // Blush Light
                return vec3(0.788, 0.718, 1.0);                // Lavender Air
            } else if (paletteIdx == 5) {
                // Twilight Aperture
                if (c == 0) return vec3(0.106, 0.165, 0.561);  // Deep Ultramarine
                if (c == 1) return vec3(0.176, 0.106, 0.353);  // Indigo Night
                if (c == 2) return vec3(0.486, 0.235, 1.0);    // Electric Violet
                if (c == 3) return vec3(1.0, 0.239, 0.682);    // Magenta Bloom
                return vec3(0.149, 0.902, 1.0);                // Cyan Edge
            } else if (paletteIdx == 6) {
                // Ganzfeld Pastel
                if (c == 0) return vec3(0.714, 0.969, 1.0);    // Powder Cyan
                if (c == 1) return vec3(0.788, 1.0, 0.910);    // Ice Mint
                if (c == 2) return vec3(1.0, 0.761, 0.867);    // Petal Pink
                if (c == 3) return vec3(0.851, 0.776, 1.0);    // Lilac Fog
                return vec3(1.0, 0.945, 0.839);                // Cream Glow
            } else if (paletteIdx == 7) {
                // Perceptual Neon
                if (c == 0) return vec3(0.0, 0.961, 1.0);      // Laser Cyan
                if (c == 1) return vec3(1.0, 0.169, 0.839);    // Hot Magenta
                if (c == 2) return vec3(0.478, 0.173, 1.0);    // UV Purple
                if (c == 3) return vec3(0.718, 1.0, 0.165);    // Acid Lime
                return vec3(1.0, 0.416, 0.165);                // Ember Orange
            } else {
                // Desert Light
                if (c == 0) return vec3(1.0, 0.953, 0.851);    // Sun Bleach
                if (c == 1) return vec3(1.0, 0.780, 0.651);    // Sand Peach
                if (c == 2) return vec3(0.910, 0.604, 0.647);  // Clay Rose
                if (c == 3) return vec3(0.608, 0.416, 0.682);  // Dusk Mauve
                return vec3(0.431, 0.659, 1.0);                // Far Sky
            }
        }
        
        // Get edge color based on the two face indices that share this edge
        // Colors slowly shift over time for a meditative effect
        vec3 getEdgeColor(int faceIdx, int neighborIdx) {
            int minF = min(faceIdx, neighborIdx);
            int maxF = max(faceIdx, neighborIdx);
            int edgeId = minF * 12 + maxF;
            
            // Slow time-based color cycling
            float timeOffset = uTime * uColorSpeed;
            float colorPhase = float(edgeId) + timeOffset;
            
            // Get two adjacent colors and interpolate smoothly
            int colorIdx1 = int(floor(colorPhase));
            int colorIdx2 = colorIdx1 + 1;
            float blend = fract(colorPhase);
            
            // Smooth easing for blend
            blend = blend * blend * (3.0 - 2.0 * blend);
            
            vec3 c1 = getPaletteColor(uPalette, colorIdx1);
            vec3 c2 = getPaletteColor(uPalette, colorIdx2);
            
            return mix(c1, c2, blend);
        }
        
        struct HitInfo {
            float t;
            int faceIndex;
            int closestNeighbor;
            vec3 position;
            vec3 normal;
            float edgeDist;
        };
        
        // ============================================================
        // SCENE INTERSECTION
        // ============================================================
        
        HitInfo traceRay(vec3 ro, vec3 rd) {
            HitInfo hit;
            hit.t = 1e10;
            hit.faceIndex = -1;
            hit.closestNeighbor = -1;
            
            for (int i = 0; i < NUM_FACES; i++) {
                vec3 ce = uFaceCenters[i];
                float ra = uFaceRadii[i];
                vec3 n_face = uFaceNormals[i];
                
                float t1 = -1.0, t2 = -1.0;
                int num_hits = 0;
                
                if (ra < 0.0) {
                    // PLANE intersection
                    float d = dot(n_face, ce);
                    float den = dot(n_face, rd);
                    if (abs(den) > 0.0001) {
                        t1 = (d - dot(n_face, ro)) / den;
                        num_hits = 1;
                    }
                } else {
                    // SPHERE intersection
                    vec3 oc = ro - ce;
                    float b = dot(oc, rd);
                    float c = dot(oc, oc) - ra * ra;
                    float h = b*b - c;
                    if (h >= 0.0) {
                        float s = sqrt(h);
                        t1 = -b - s;
                        t2 = -b + s;
                        num_hits = 2;
                    }
                }
                
                if (num_hits > 0) {
                    float ts[2]; ts[0] = t1; ts[1] = t2;
                    for (int k = 0; k < num_hits; k++) {
                        float t = ts[k];
                        if (t > 0.001 && t < hit.t) {
                            vec3 p = ro + rd * t;
                            
                            // Only clip to Poincaré Ball if using spherical mirrors
                            if (ra >= 0.0 && length(p) >= 1.0) continue;

                            float minOtherD = 1e10;
                            int closestJ = -1;
                            bool valid = true;
                            for (int j = 0; j < NUM_FACES; j++) {
                                if (i == j) continue;
                                float margin;
                                if (uFaceRadii[j] < 0.0) {
                                    // Euclidean Interior: We want dot(nj, p) <= dj
                                    // dj is distance to face j from origin along nj
                                    float dj = dot(uFaceNormals[j], uFaceCenters[j]);
                                    margin = dj - dot(uFaceNormals[j], p);
                                } else {
                                    // Hyperbolic Exterior: We want length(p - cj) >= raj
                                    float distToCenter = length(p - uFaceCenters[j]);
                                    margin = distToCenter - uFaceRadii[j];
                                }
                                
                                if (margin < -0.001) {
                                    valid = false;
                                    break;
                                }
                                if (margin < minOtherD) {
                                    minOtherD = margin;
                                    closestJ = j;
                                }
                            }
                            
                            if (valid) {
                                hit.t = t;
                                hit.faceIndex = i;
                                hit.closestNeighbor = closestJ;
                                hit.position = p;
                                
                                // NORMAL: Must always point OUTWARD from the polyhedron center
                                vec3 n;
                                if (ra < 0.0) {
                                    n = n_face; // Plane normal is already outward
                                } else {
                                    n = normalize(p - ce); // Sphere center to hit
                                }
                                
                                // Ensure standard 'outward' orientation relative to the origin
                                if (dot(n, p) < 0.0) n = -n;
                                hit.normal = n;
                                hit.edgeDist = minOtherD;
                            }
                        }
                    }
                }
            }
            return hit;
        }
        
        // ============================================================
        // SHADING
        // ============================================================
        
        vec3 shadeMirror(HitInfo hit, vec3 rd, float bounceAtten, bool fromInside) {
            vec3 color = vec3(0.0);
            
            // Use step-like transitions for sharper edges
            float edgeGlow = 1.0 - smoothstep(0.0, uEdgeLightWidth * 0.5, hit.edgeDist);
            float innerGlow = 1.0 - smoothstep(0.0, uEdgeLightWidth * 1.5, hit.edgeDist);
            
            // Sharp frame boundary (step-like, not gradual)
            float frameEdge = uEdgeLightWidth + uBlackBorderWidth;
            float frameFactor = 1.0 - step(frameEdge, hit.edgeDist);
            float blackFactor = step(frameEdge, hit.edgeDist);
            
            // Light Tubes - ONLY visible from inside, colored by edge (no pulsing)
            if (fromInside) {
                vec3 edgeColor = getEdgeColor(hit.faceIndex, hit.closestNeighbor);
                vec3 lightStrip = edgeColor * (edgeGlow * 10.0 + innerGlow * 2.0) * uLightIntensity;
                color += lightStrip;
            }
            
            // Metallic Frame Material - sharper definition
            if (frameFactor > 0.01) {
                vec3 metalBase = vec3(0.12, 0.13, 0.15);
                float fresnel = pow(1.0 - abs(dot(hit.normal, rd)), 3.0);
                vec3 reflectColor = mix(metalBase, vec3(0.7, 0.75, 0.8), fresnel);
                
                // Brushed metal texture
                float aniso = abs(sin(hit.edgeDist * 800.0)) * 0.15;
                reflectColor += aniso * vec3(0.25, 0.28, 0.32);
                
                // Sharp specular highlight
                vec3 viewReflect = reflect(rd, hit.normal);
                float spec = pow(max(0.0, dot(viewReflect, normalize(vec3(1.0, 2.0, 1.0)))), 64.0);
                reflectColor += spec * vec3(1.0, 0.98, 0.95) * 0.8;
                
                // Edge highlight for definition
                float edgeHighlight = 1.0 - smoothstep(frameEdge * 0.9, frameEdge, hit.edgeDist);
                reflectColor += vec3(0.3, 0.32, 0.35) * edgeHighlight * 0.5;
                
                if (fromInside) {
                    vec3 edgeColor = getEdgeColor(hit.faceIndex, hit.closestNeighbor);
                    float tubeReflect = innerGlow * 0.4;
                    reflectColor += edgeColor * tubeReflect * 0.6;
                }
                
                color += reflectColor * frameFactor;
            }
            
            // Interior ambient (subtle)
            float distToOrigin = length(hit.position);
            float coreGlow = 0.005 / (0.1 + distToOrigin * distToOrigin);
            color += uAmbientColor * coreGlow * blackFactor * 0.3;
            
            return color * bounceAtten;
        }
        
        // ============================================================
        // MAIN LOOP
        // ============================================================
        
        vec3 trace(vec3 ro, vec3 rd) {
            vec3 accumulatedColor = vec3(0.0);
            float throughput = 1.0;
            
            vec3 currentRo = ro;
            vec3 currentRd = rd;
            
            for (int bounce = 0; bounce < 32; bounce++) {
                if (bounce >= uMaxBounces) break;
                if (throughput < 0.001) break;
                
                HitInfo hit = traceRay(currentRo, currentRd);
                
                if (hit.faceIndex < 0) {
                    float sky = max(0.0, dot(currentRd, vec3(0.0, 1.0, 0.0)));
                    accumulatedColor += (vec3(0.01, 0.01, 0.03) + uAmbientColor * sky * 0.05) * throughput;
                    break;
                }
                
                float dotN = dot(currentRd, hit.normal);
                bool fromInside = dotN > 0.0;
                
                // Check if we hit the metal frame (sharp boundary)
                float frameEdge = uEdgeLightWidth + uBlackBorderWidth;
                bool hitFrame = hit.edgeDist < frameEdge;
                
                accumulatedColor += shadeMirror(hit, currentRd, throughput, fromInside);
                
                if (hitFrame) {
                    // Metal frame is OPAQUE - stop the ray completely
                    break;
                }
                
                // Only continue through mirror surface (not frame)
                if (dotN < 0.0) {
                    // Hitting mirror from outside - transmit through
                    currentRo = hit.position - hit.normal * 0.001;
                    throughput *= uTransparency;
                } else {
                    // Hitting mirror from inside - reflect
                    currentRo = hit.position + hit.normal * 0.001;
                    currentRd = reflect(currentRd, hit.normal);
                    throughput *= uMirrorOpacity;
                }
            }
            
            return accumulatedColor;
        }
        
        void main() {
            vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
            
            vec4 clipSpace = vec4(ndc, 1.0, 1.0);
            vec4 viewSpace = uInvProjection * clipSpace;
            viewSpace = vec4(viewSpace.xyz / viewSpace.w, 0.0);
            vec3 worldDir = normalize((uInvView * viewSpace).xyz);
            
            vec3 color = trace(uCameraPos, worldDir);
            
            color = color / (color + vec3(1.0));
            color = pow(color, vec3(1.0 / 2.2));
            
            vec2 v = gl_FragCoord.xy / uResolution - 0.5;
            color *= 1.0 - dot(v, v) * 0.8;
            
            gl_FragColor = vec4(color, 1.0);
        }
    `
};

export function createMirrorUniforms(THREE) {
    return {
        uResolution: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uInvProjection: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uFaceCenters: { value: [] },
        uFaceRadii: { value: [] },
        uFaceNormals: { value: [] },
        uMaxBounces: { value: 12 },
        uMirrorOpacity: { value: 0.94 },
        uTransparency: { value: 0.80 },
        uEdgeLightWidth: { value: 0.015 },
        uBlackBorderWidth: { value: 0.025 },
        uLightIntensity: { value: 2.0 },
        uLightColor: { value: new THREE.Vector3(0.0, 0.95, 1.0) },
        uAmbientColor: { value: new THREE.Vector3(0.6, 0.8, 1.0) },
        uPalette: { value: 0 },
        uColorSpeed: { value: 0.017 }
    };
}

export function updateGeometryUniforms(uniforms, faces, THREE) {
    uniforms.uFaceCenters.value = faces.map(f => new THREE.Vector3(...f.center));
    uniforms.uFaceRadii.value = faces.map(f => f.radius);
    uniforms.uFaceNormals.value = faces.map(f => new THREE.Vector3(...f.normal));
}

export default {
    MirrorShader,
    createMirrorUniforms,
    updateGeometryUniforms
};
