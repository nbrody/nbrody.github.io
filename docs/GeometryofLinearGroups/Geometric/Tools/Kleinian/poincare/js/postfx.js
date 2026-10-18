/**
 * Cheap antialiasing for the raymarched views. A raymarcher decides hit or
 * miss once per pixel, so its silhouettes come out stair-stepped whatever the
 * canvas's MSAA does (that only smooths triangle edges). After each frame the
 * canvas is copied into a texture and drawn back through FXAA, which blends
 * along the edges it finds: one copy and one full-screen pass.
 *
 * The copy is of the finished, display-encoded frame, so every layer (shader
 * materials and lit meshes alike) is treated the same, and the premultiplied
 * alpha of the transparent canvas passes through untouched.
 */
import * as THREE from 'three';

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

// FXAA 3.11 (Timothy Lottes), quality form: find the edge through the pixel,
// walk along it both ways to its ends, and blend by where the pixel sits on
// the span. The walk is what smooths long, shallow stair steps.
const fragmentShader = `
    precision highp float;
    uniform sampler2D tFrame;
    uniform vec2 u_texel;
    uniform vec3 u_bg;
    varying vec2 vUv;

    const float EDGE_THRESHOLD = 0.125;
    const float EDGE_THRESHOLD_MIN = 0.0312;
    const float SUBPIX = 0.75;
    const int SEARCH_STEPS = 8;

    // Luma of what the viewer sees: the frame is premultiplied over the page.
    float luma(vec4 c) { return dot(c.rgb + (1.0 - c.a) * u_bg, vec3(0.299, 0.587, 0.114)); }
    float lumaAt(vec2 uv) { return luma(texture2D(tFrame, uv)); }
    float stepAt(int i) { return i < 1 ? 1.5 : i < 5 ? 2.0 : i < 6 ? 4.0 : 8.0; }

    void main() {
        vec2 uv = vUv, px = u_texel;
        vec4 rgbaM = texture2D(tFrame, uv);
        float lM = luma(rgbaM);
        float lN = lumaAt(uv + vec2(0.0, px.y)), lS = lumaAt(uv - vec2(0.0, px.y));
        float lE = lumaAt(uv + vec2(px.x, 0.0)), lW = lumaAt(uv - vec2(px.x, 0.0));
        float lMax = max(max(max(lN, lS), max(lE, lW)), lM);
        float lMin = min(min(min(lN, lS), min(lE, lW)), lM);
        float range = lMax - lMin;
        // Flat regions keep their pixels.
        if (range < max(EDGE_THRESHOLD_MIN, lMax * EDGE_THRESHOLD)) { gl_FragColor = rgbaM; return; }

        float lNW = lumaAt(uv + vec2(-px.x, px.y)), lNE = lumaAt(uv + px);
        float lSW = lumaAt(uv - px), lSE = lumaAt(uv + vec2(px.x, -px.y));
        float lNS = lN + lS, lWE = lW + lE;
        float lNWSW = lNW + lSW, lNESE = lNE + lSE, lNWNE = lNW + lNE, lSWSE = lSW + lSE;
        // Is the edge horizontal (luma changes up/down) or vertical?
        float edgeH = abs(-2.0 * lW + lNWSW) + 2.0 * abs(-2.0 * lM + lNS) + abs(-2.0 * lE + lNESE);
        float edgeV = abs(-2.0 * lS + lSWSE) + 2.0 * abs(-2.0 * lM + lWE) + abs(-2.0 * lN + lNWNE);
        bool horz = edgeH >= edgeV;
        float l1 = horz ? lS : lW, l2 = horz ? lN : lE;
        float g1 = l1 - lM, g2 = l2 - lM;
        bool steep1 = abs(g1) >= abs(g2);
        float gradScaled = 0.25 * max(abs(g1), abs(g2));
        float stepLen = horz ? px.y : px.x;
        float lLocal;
        if (steep1) { stepLen = -stepLen; lLocal = 0.5 * (l1 + lM); }
        else lLocal = 0.5 * (l2 + lM);
        // Halfway between this pixel and its steeper neighbour, so bilinear
        // reads average the two rows; then walk along the edge both ways.
        vec2 uvE = uv;
        if (horz) uvE.y += 0.5 * stepLen; else uvE.x += 0.5 * stepLen;
        vec2 off = horz ? vec2(px.x, 0.0) : vec2(0.0, px.y);
        vec2 uv1 = uvE - off, uv2 = uvE + off;
        float e1 = lumaAt(uv1) - lLocal, e2 = lumaAt(uv2) - lLocal;
        bool done1 = abs(e1) >= gradScaled, done2 = abs(e2) >= gradScaled;
        for (int i = 0; i < SEARCH_STEPS; i++) {
            if (done1 && done2) break;
            float st = stepAt(i);
            if (!done1) { uv1 -= off * st; e1 = lumaAt(uv1) - lLocal; done1 = abs(e1) >= gradScaled; }
            if (!done2) { uv2 += off * st; e2 = lumaAt(uv2) - lLocal; done2 = abs(e2) >= gradScaled; }
        }
        float d1 = horz ? uv.x - uv1.x : uv.y - uv1.y;
        float d2 = horz ? uv2.x - uv.x : uv2.y - uv.y;
        bool nearer1 = d1 < d2;
        float dst = min(d1, d2);
        // Blend only if the nearer end really closes this side of the edge.
        bool mBelow = lM < lLocal;
        bool good = ((nearer1 ? e1 : e2) < 0.0) != mBelow;
        float offset = good ? 0.5 - dst / (d1 + d2) : 0.0;
        // Sub-pixel features (thin lines, specks) blend by local contrast.
        float lAvg = (2.0 * (lNS + lWE) + lNWSW + lNESE) / 12.0;
        float sub = clamp(abs(lAvg - lM) / range, 0.0, 1.0);
        sub = (-2.0 * sub + 3.0) * sub * sub;
        offset = max(offset, sub * sub * SUBPIX);
        if (horz) uv.y += offset * stepLen; else uv.x += offset * stepLen;
        gl_FragColor = texture2D(tFrame, uv);
    }
`;

export function createPostFX(renderer) {
    const size = new THREE.Vector2();
    const origin = new THREE.Vector2(0, 0);
    let frame = null;
    let enabled = true;
    const material = new THREE.ShaderMaterial({
        uniforms: {
            tFrame: { value: null },
            u_texel: { value: new THREE.Vector2() },
            u_bg: { value: new THREE.Color() },
        },
        vertexShader, fragmentShader,
        depthTest: false, depthWrite: false, blending: THREE.NoBlending
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return {
        setEnabled(on) { enabled = !!on; },
        isEnabled: () => enabled,
        /** Render the scene, then smooth it in place. `bg` is the page colour behind the canvas. */
        render(scene, camera, bg) {
            renderer.render(scene, camera);
            if (!enabled) return;
            renderer.getDrawingBufferSize(size);
            if (!frame || frame.image.width !== size.x || frame.image.height !== size.y) {
                if (frame) frame.dispose();
                frame = new THREE.FramebufferTexture(size.x, size.y);
                frame.minFilter = frame.magFilter = THREE.LinearFilter;
                material.uniforms.tFrame.value = frame;
                material.uniforms.u_texel.value.set(1 / size.x, 1 / size.y);
            }
            renderer.copyFramebufferToTexture(origin, frame);
            if (bg) material.uniforms.u_bg.value.copy(bg);
            const autoClear = renderer.autoClear;
            renderer.autoClear = false;
            renderer.render(quadScene, quadCamera);
            renderer.autoClear = autoClear;
        }
    };
}
