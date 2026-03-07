export class InputManager {
    constructor(canvas, gl) {
        this.canvas = canvas;
        this.gl = gl;

        this.mouse = { x: 0, y: 0, z: 0, w: 0 };
        this.mouseDown = false;

        this.initKeyboardTexture();
        this.setupEvents();
    }

    initKeyboardTexture() {
        const gl = this.gl;
        this.keyboardTex = gl.createTexture();
        this.keyboardData = new Uint8Array(256 * 3 * 4);

        gl.bindTexture(gl.TEXTURE_2D, this.keyboardTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 3, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, this.keyboardData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        this.keysPressed = new Set();
        this.keysToggled = new Set();

        window.addEventListener('keydown', (e) => {
            const code = e.keyCode;
            if (code < 256) {
                this.keysPressed.add(code);
                if (!this.keysToggled.has(code)) {
                    this.keysToggled.add(code);
                } else {
                    this.keysToggled.delete(code);
                }
                this.updateKeyboardTexture();
            }
        });

        window.addEventListener('keyup', (e) => {
            const code = e.keyCode;
            if (code < 256) {
                this.keysPressed.delete(code);
                this.updateKeyboardTexture();
            }
        });
    }

    updateKeyboardTexture() {
        const gl = this.gl;
        const data = this.keyboardData;
        data.fill(0);

        for (const code of this.keysPressed) {
            data[code * 4] = 255;
        }
        for (const code of this.keysToggled) {
            const offset = 256 * 4 * 2 + code * 4;
            data[offset] = 255;
        }

        gl.bindTexture(gl.TEXTURE_2D, this.keyboardTex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 3,
            gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    setupEvents() {
        const canvas = this.canvas;
        const getDPR = () => Math.min(window.devicePixelRatio || 1, 2);

        canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
            const rect = canvas.getBoundingClientRect();
            const dpr = getDPR();
            const x = (e.clientX - rect.left) * dpr;
            const y = canvas.height - (e.clientY - rect.top) * dpr;
            this.mouse.x = x;
            this.mouse.y = y;
            this.mouse.z = x;
            this.mouse.w = y;
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.mouseDown) return;
            const rect = canvas.getBoundingClientRect();
            const dpr = getDPR();
            const x = (e.clientX - rect.left) * dpr;
            const y = canvas.height - (e.clientY - rect.top) * dpr;
            this.mouse.x = x;
            this.mouse.y = y;
        });

        window.addEventListener('mouseup', () => {
            this.mouseDown = false;
            this.mouse.z = -Math.abs(this.mouse.z);
            this.mouse.w = -Math.abs(this.mouse.w);
        });

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const t = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const dpr = getDPR();
            const x = (t.clientX - rect.left) * dpr;
            const y = canvas.height - (t.clientY - rect.top) * dpr;
            this.mouseDown = true;
            this.mouse.x = x;
            this.mouse.y = y;
            this.mouse.z = x;
            this.mouse.w = y;
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.mouseDown) return;
            const t = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const dpr = getDPR();
            const x = (t.clientX - rect.left) * dpr;
            const y = canvas.height - (t.clientY - rect.top) * dpr;
            this.mouse.x = x;
            this.mouse.y = y;
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            this.mouseDown = false;
            this.mouse.z = -Math.abs(this.mouse.z);
            this.mouse.w = -Math.abs(this.mouse.w);
        });
    }

    getMouse() {
        return this.mouse;
    }

    getKeyboardTexture() {
        return this.keyboardTex;
    }
}
