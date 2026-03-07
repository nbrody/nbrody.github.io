export class WebGLCore {
    static async loadShaders() {
        const [common, bufferA, bufferB, image] = await Promise.all([
            fetch('shaders/core_math.glsl').then(r => r.text()),
            fetch('shaders/state_manager.glsl').then(r => r.text()),
            fetch('shaders/render_scene.glsl').then(r => r.text()),
            fetch('shaders/composite_gui.glsl').then(r => r.text())
        ]);

        const preambleAB = `#version 300 es
precision highp float;
precision highp int;

uniform vec3  iResolution;
uniform float iTime;
uniform int   iFrame;
uniform vec4  iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;

out vec4 outColor;
`;

        const preambleImage = `#version 300 es
precision highp float;
precision highp int;

uniform vec3  iResolution;
uniform float iTime;
uniform int   iFrame;
uniform vec4  iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;

out vec4 outColor;
`;

        const mainWrapper = `
void main() {
    vec4 fc;
    mainImage(fc, gl_FragCoord.xy);
    outColor = fc;
}
`;

        const vertSrc = `#version 300 es
in vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

        return {
            vertSrc,
            bufferAFull: preambleAB + common + '\n' + bufferA + mainWrapper,
            bufferBFull: preambleAB + common + '\n' + bufferB + mainWrapper,
            imageFull: preambleImage + common + '\n' + image + mainWrapper
        };
    }

    static createProgram(gl, vSrc, fSrc, label) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vSrc);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error(`[${label}] Vertex shader error:`, gl.getShaderInfoLog(vs));
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fSrc);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error(`[${label}] Fragment shader error:`, gl.getShaderInfoLog(fs));
            const lines = fSrc.split('\n');
            const log = gl.getShaderInfoLog(fs);
            console.error(log);
            const matches = log.matchAll(/ERROR:\s*\d+:(\d+)/g);
            for (const m of matches) {
                const lineNum = parseInt(m[1]);
                console.error(`  Line ${lineNum}: ${lines[lineNum - 1]}`);
            }
        }

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error(`[${label}] Link error:`, gl.getProgramInfoLog(prog));
        }

        const uniforms = {};
        const names = ['iResolution', 'iTime', 'iFrame', 'iMouse', 'iChannel0', 'iChannel1'];
        for (const name of names) {
            uniforms[name] = gl.getUniformLocation(prog, name);
        }

        return { program: prog, uniforms };
    }

    static createFBO(gl, w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('FBO incomplete');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fbo, w, h };
    }
}
