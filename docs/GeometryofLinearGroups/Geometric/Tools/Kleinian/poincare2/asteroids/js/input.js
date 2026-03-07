// input.js — Keyboard + pointer-lock mouse input

export class InputManager {
    constructor() {
        this.keys = {};
        this.mouseDown = false;
        this.pointerLocked = false;
        this.mouseDX = 0;
        this.mouseDY = 0;

        const gameKeys = new Set([
            'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
            'KeyF', 'KeyR', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'ShiftLeft'
        ]);

        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (gameKeys.has(e.code)) e.preventDefault();
        });
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            if (gameKeys.has(e.code)) e.preventDefault();
        });
        document.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouseDown = true;
        });
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseDown = false;
        });
        document.addEventListener('mousemove', (e) => {
            if (this.pointerLocked) {
                this.mouseDX += e.movementX;
                this.mouseDY += e.movementY;
            }
        });
    }

    isPressed(code) {
        return !!this.keys[code];
    }

    consumeMouseDelta() {
        const dx = this.mouseDX;
        const dy = this.mouseDY;
        this.mouseDX = 0;
        this.mouseDY = 0;
        return { dx, dy };
    }

    requestPointerLock(element) {
        element.addEventListener('click', () => {
            if (!this.pointerLocked) {
                element.requestPointerLock();
            }
        });
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === element;
        });
    }
}
