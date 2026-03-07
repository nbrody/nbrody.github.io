// ═══════════════════════════════════════════════════
//  Spherical Triangles — WebGL2 Multi-Buffer Renderer
//
//  Pass 1: State Manager (state_manager.glsl)
//  Pass 2: Render Scene (render_scene.glsl)
//  Pass 3: Composite GUI (composite_gui.glsl)
// ═══════════════════════════════════════════════════

import { InputManager } from './InputManager.js';
import { WebGLCore } from './WebGLCore.js';

class SphericalTriangleRenderer {
    constructor() {
        this.canvas = document.getElementById('glCanvas');
        this.gl = this.canvas.getContext('webgl2', {
            antialias: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        });

        if (!this.gl) {
            document.body.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#fff;font-family:sans-serif"><h2>WebGL 2 required</h2></div>';
            return;
        }

        const gl = this.gl;
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');

        this.frame = 0;
        this.startTime = performance.now();
        this.frameCount = 0;
        this.fpsTime = performance.now();

        this.inputManager = new InputManager(this.canvas, gl);

        this.init();
    }

    async init() {
        const gl = this.gl;
        const shaders = await WebGLCore.loadShaders();

        this.progA = WebGLCore.createProgram(gl, shaders.vertSrc, shaders.bufferAFull, 'State Manager');
        this.progB = WebGLCore.createProgram(gl, shaders.vertSrc, shaders.bufferBFull, 'Render Scene');
        this.progImage = WebGLCore.createProgram(gl, shaders.vertSrc, shaders.imageFull, 'Composite GUI');

        this.initGeometry();
        this.resize();

        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    initGeometry() {
        const gl = this.gl;
        const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        this.vaoA = this.createVAO(this.progA.program);
        this.vaoB = this.createVAO(this.progB.program);
        this.vaoImage = this.createVAO(this.progImage.program);
    }

    createVAO(program) {
        const gl = this.gl;
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        const loc = gl.getAttribLocation(program, 'aPosition');
        if (loc >= 0) {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        }
        gl.bindVertexArray(null);
        return vao;
    }

    resize() {
        const gl = this.gl;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.width = Math.floor(w * dpr);
        this.canvas.height = Math.floor(h * dpr);

        const resEl = document.getElementById('resolution');
        if (resEl) resEl.textContent = `${this.canvas.width}×${this.canvas.height}`;

        if (this.fboA) {
            for (const fbo of [this.fboA[0], this.fboA[1]]) {
                gl.deleteTexture(fbo.tex);
                gl.deleteFramebuffer(fbo.fbo);
            }
        }
        if (this.fboB) {
            gl.deleteTexture(this.fboB.tex);
            gl.deleteFramebuffer(this.fboB.fbo);
        }

        this.fboA = [
            WebGLCore.createFBO(gl, this.canvas.width, this.canvas.height),
            WebGLCore.createFBO(gl, this.canvas.width, this.canvas.height)
        ];
        this.fboAIndex = 0;
        this.fboB = WebGLCore.createFBO(gl, this.canvas.width, this.canvas.height);
        this.frame = 0;
    }

    setUniforms(prog, time) {
        const gl = this.gl;
        const u = prog.uniforms;
        const mouse = this.inputManager.getMouse();

        gl.uniform3f(u.iResolution, this.canvas.width, this.canvas.height, 1.0);
        gl.uniform1f(u.iTime, time);
        gl.uniform1i(u.iFrame, this.frame);
        gl.uniform4f(u.iMouse, mouse.x, mouse.y, mouse.z, mouse.w);
    }

    animate() {
        const gl = this.gl;
        const time = (performance.now() - this.startTime) * 0.001;
        const w = this.canvas.width;
        const h = this.canvas.height;

        const keyboardTex = this.inputManager.getKeyboardTexture();

        // ═══ Pass 1: State Manager ═══
        const readA = this.fboA[this.fboAIndex];
        const writeA = this.fboA[1 - this.fboAIndex];

        gl.bindFramebuffer(gl.FRAMEBUFFER, writeA.fbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.progA.program);
        gl.bindVertexArray(this.vaoA);
        this.setUniforms(this.progA, time);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readA.tex);
        gl.uniform1i(this.progA.uniforms.iChannel0, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, keyboardTex);
        gl.uniform1i(this.progA.uniforms.iChannel1, 1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        this.fboAIndex = 1 - this.fboAIndex;

        // ═══ Pass 2: Render Scene ═══
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboB.fbo);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.progB.program);
        gl.bindVertexArray(this.vaoB);
        this.setUniforms(this.progB, time);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, writeA.tex);
        gl.uniform1i(this.progB.uniforms.iChannel0, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, keyboardTex);
        gl.uniform1i(this.progB.uniforms.iChannel1, 1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // ═══ Pass 3: Composite GUI ═══
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.progImage.program);
        gl.bindVertexArray(this.vaoImage);
        this.setUniforms(this.progImage, time);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, writeA.tex);
        gl.uniform1i(this.progImage.uniforms.iChannel0, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.fboB.tex);
        gl.uniform1i(this.progImage.uniforms.iChannel1, 1);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        this.frame++;

        this.frameCount++;
        const now = performance.now();
        if (now - this.fpsTime > 500) {
            const fps = Math.round(this.frameCount / ((now - this.fpsTime) / 1000));
            const el = document.getElementById('fpsCounter');
            if (el) el.textContent = `${fps} fps`;
            this.frameCount = 0;
            this.fpsTime = now;
        }

        requestAnimationFrame(() => this.animate());
    }
}

new SphericalTriangleRenderer();
