// ═══════════════════════════════════════════════════════
// WebGL Renderer for the Riley Slice
// ═══════════════════════════════════════════════════════

import { generateFragmentShader } from './shaderGen.js';

const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 v_uv;
void main() {
    v_uv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

export class RileyRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', { antialias: false });
        if (!this.gl) throw new Error('WebGL2 not available');

        this.program = null;
        this.needsRender = true;

        // Camera state
        this.centerX = 0.0;
        this.centerY = 0.0;
        this.zoom = 0.3;
        this.currentParam = 0;

        // Display toggles
        this.showRays = true;
        this.showExtensions = true;
        this.showRegions = true;
        this.showBoundary = true;

        this._initQuad();
    }

    _initQuad() {
        const gl = this.gl;
        const verts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    }

    _compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
            console.error(source.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    buildProgram(depth) {
        const gl = this.gl;
        const fsSource = generateFragmentShader(depth);

        const vs = this._compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Link error:', gl.getProgramInfoLog(prog));
            gl.deleteProgram(prog);
            return;
        }

        if (this.program) gl.deleteProgram(this.program);
        this.program = prog;
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        this.needsRender = true;
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            this.needsRender = true;
        }
    }

    render() {
        if (!this.program) return;
        this.resize();

        const gl = this.gl;
        gl.useProgram(this.program);

        const posLoc = gl.getAttribLocation(this.program, 'position');
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(gl.getUniformLocation(this.program, 'u_center'), this.centerX, this.centerY);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_zoom'), this.zoom);
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_param'), this.currentParam);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_showRays'), this.showRays ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_showExtensions'), this.showExtensions ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_showRegions'), this.showRegions ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_showBoundary'), this.showBoundary ? 1 : 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.needsRender = false;
    }

    cssToComplex(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const nx = (clientX - rect.left) / rect.width - 0.5;
        const ny = (rect.bottom - clientY) / rect.height - 0.5;
        const aspect = rect.width / rect.height;
        return {
            x: this.centerX + nx * aspect / this.zoom,
            y: this.centerY + ny / this.zoom
        };
    }

    pan(dxCSS, dyCSS) {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        const aspect = w / h;
        this.centerX -= (dxCSS / w) * aspect / this.zoom;
        this.centerY += (dyCSS / h) / this.zoom;
        this.needsRender = true;
    }

    zoomAt(clientX, clientY, factor) {
        const before = this.cssToComplex(clientX, clientY);
        this.zoom *= factor;
        this.zoom = Math.max(0.01, Math.min(this.zoom, 1e8));
        const after = this.cssToComplex(clientX, clientY);
        this.centerX += before.x - after.x;
        this.centerY += before.y - after.y;
        this.needsRender = true;
    }
}
