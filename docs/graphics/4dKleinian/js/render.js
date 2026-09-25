/**
 * Progressive renderer.
 *
 * The fractal shader writes linear HDR into an off-screen buffer at a
 * resolution that adapts to the measured frame time.  While the camera is
 * still, successive frames are jittered by a sub-pixel Halton offset and
 * averaged, which gives free supersampling and lets a single frame be cheap.
 * Tone mapping happens once in the present pass so the averaging stays
 * linear.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAX_MIRRORS } from './groups.js';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const ACCUMULATE_SHADER = `
precision highp float;
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform float uWeight;
varying vec2 vUv;
void main() {
    vec3 current = texture2D(tCurrent, vUv).rgb;
    // Never read stale history on reset: NaN * 0 is still NaN.
    if (uWeight >= 1.0) {
        gl_FragColor = vec4(current, 1.0);
    } else {
        vec3 history = texture2D(tHistory, vUv).rgb;
        gl_FragColor = vec4(mix(history, current, uWeight), 1.0);
    }
}
`;

const PRESENT_SHADER = `
precision highp float;
uniform sampler2D tFrame;
uniform float uExposure;
uniform float uVignette;
uniform float uSaturation;
varying vec2 vUv;

vec3 aces(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec3 color = texture2D(tFrame, vUv).rgb * uExposure;
    color = aces(color);
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, uSaturation);
    float r = length(vUv - 0.5) * 1.42;
    color *= mix(1.0, 1.0 - smoothstep(0.25, 1.05, r), uVignette);
    gl_FragColor = vec4(pow(max(color, 0.0), vec3(1.0 / 2.2)), 1.0);
}
`;

function halton(index, base) {
    let result = 0;
    let f = 1 / base;
    let i = index;
    while (i > 0) {
        result += f * (i % base);
        i = Math.floor(i / base);
        f /= base;
    }
    return result;
}

export class KleinianRenderer {
    constructor(container, fragmentShader, options = {}) {
        this.container = container;
        this.maxSamples = options.maxSamples ?? 96;
        this.targetFrameTime = options.targetFrameTime ?? 1000 / 55;

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true
        });
        this.renderer.autoClear = false;
        // The canvas itself runs at the display's pixel density so the
        // present pass is not upscaled a second time by the browser.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        container.appendChild(this.renderer.domElement);

        // full device pixel ratio plus accumulation is wasteful; 1.5 with
        // jittered supersampling already resolves more than the display shows
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        this.stillScale = options.stillScale ?? 1;
        this.motionScale = options.motionScale ?? 0.55;
        this.autoScale = true;
        this.currentScale = this.stillScale;

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
        this.camera.position.set(0, 0, 3);
        this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.uniforms = {
            iResolution: { value: new THREE.Vector3(1, 1, 1) },
            uJitter: { value: new THREE.Vector2() },
            uEye: { value: new THREE.Vector3() },
            uTarget: { value: new THREE.Vector3() },
            uUp: { value: new THREE.Vector3(0, 1, 0) },
            uFov: { value: THREE.MathUtils.degToRad(55) },
            uNumMirrors: { value: 0 },
            uMirror: { value: Array.from({ length: MAX_MIRRORS }, () => new THREE.Vector4(0, 0, 0, 1)) },
            uMirrorKind: { value: new Array(MAX_MIRRORS).fill(0) },
            uMaxFold: { value: 32 },
            uMaxSteps: { value: 220 },
            uStepScale: { value: 0.55 },
            uEpsScale: { value: 0.8 },
            uClip: { value: new THREE.Vector4(0, 0, 0, 1) },
            uTrapMode: { value: 0 },
            uTrapCenter: { value: new THREE.Vector3() },
            uTrapRadius: { value: 0.2 },
            uThickness: { value: 0 },
            uSkipLevels: { value: 0 },
            uHideOuter: { value: 1 },
            uCutaway: { value: 0 },
            uCutPlane: { value: new THREE.Vector4(0, 0, 1, 0) },
            uPalette: { value: 0 },
            uScheme: { value: 0 },
            uModulus: { value: 6 },
            uColorShift: { value: 0 },
            uColorSpan: { value: 1 },
            uAO: { value: 1 },
            uShadowSteps: { value: 24 },
            uFog: { value: 0.02 },
            uBgTop: { value: new THREE.Color(0.05, 0.07, 0.11) },
            uBgBottom: { value: new THREE.Color(0.01, 0.012, 0.02) }
        };

        this.sceneMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VERTEX_SHADER,
            fragmentShader,
            depthTest: false,
            depthWrite: false
        });

        this.accumulateMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tCurrent: { value: null },
                tHistory: { value: null },
                uWeight: { value: 1 }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: ACCUMULATE_SHADER,
            depthTest: false,
            depthWrite: false
        });

        this.presentMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tFrame: { value: null },
                uExposure: { value: 1.15 },
                uVignette: { value: 0.55 },
                uSaturation: { value: 1.04 }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: PRESENT_SHADER,
            depthTest: false,
            depthWrite: false
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        this.quad = new THREE.Mesh(geometry, this.sceneMaterial);
        this.quad.frustumCulled = false;
        this.scene = new THREE.Scene();
        this.scene.add(this.quad);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.85;
        this.controls.zoomSpeed = 0.9;
        this.controls.minDistance = 0.06;
        this.controls.maxDistance = 40;
        this.controls.autoRotateSpeed = 0.6;
        this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

        this.sample = 0;
        this.dirty = true;
        this.interacting = false;
        this.interactionTimer = null;
        this.frameTime = 16;
        this.lastRender = 0;
        this.lastLoop = performance.now();
        this.renderCount = 0;
        this.statsSince = performance.now();
        this.onStats = options.onStats || (() => {});
        // Called once per animation frame with the elapsed seconds; returning
        // true means the scene changed and should be redrawn as motion.
        this.onFrame = options.onFrame || (() => false);
        this.pendingCapture = null;
        this.exportJob = null;

        this.targets = { scene: null, accumA: null, accumB: null };
        this.width = 1;
        this.height = 1;

        this.controls.addEventListener('start', () => this.beginInteraction());
        this.controls.addEventListener('change', () => {
            this.beginInteraction();
            this.invalidate();
        });

        this.resize();
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => this.resize()).observe(container);
        } else {
            window.addEventListener('resize', () => this.resize());
        }
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    beginInteraction() {
        this.interacting = true;
        clearTimeout(this.interactionTimer);
        this.interactionTimer = window.setTimeout(() => {
            this.interacting = false;
            this.invalidate();
        }, 180);
    }

    invalidate() {
        this.dirty = true;
    }

    setAutoRotate(enabled, speed) {
        this.controls.autoRotate = Boolean(enabled);
        if (speed !== undefined) this.controls.autoRotateSpeed = speed;
        this.invalidate();
    }

    setQuality({ stillScale, motionScale, autoScale, maxSamples }) {
        if (stillScale !== undefined) this.stillScale = stillScale;
        if (motionScale !== undefined) this.motionScale = motionScale;
        if (autoScale !== undefined) this.autoScale = autoScale;
        if (maxSamples !== undefined) this.maxSamples = maxSamples;
        this.invalidate();
    }

    makeTargets(width, height) {
        const options = {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false
        };
        return {
            scene: new THREE.WebGLRenderTarget(width, height, options),
            accumA: new THREE.WebGLRenderTarget(width, height, options),
            accumB: new THREE.WebGLRenderTarget(width, height, options)
        };
    }

    allocate(width, height) {
        Object.values(this.targets).forEach((target) => target && target.dispose());
        this.targets = this.makeTargets(width, height);
        this.width = width;
        this.height = height;
        this.uniforms.iResolution.value.set(width, height, 1);
        this.dirty = true;
    }

    resize() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        if (width === this.viewWidth && height === this.viewHeight) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.viewWidth = width;
        this.viewHeight = height;
        this.applyScale(this.currentScale, true);
    }

    applyScale(scale, force = false) {
        const clamped = Math.max(0.2, Math.min(2, scale));
        const width = Math.max(2, Math.round(this.viewWidth * this.pixelRatio * clamped));
        const height = Math.max(2, Math.round(this.viewHeight * this.pixelRatio * clamped));
        if (!force && width === this.width && height === this.height) return;
        this.currentScale = clamped;
        this.allocate(width, height);
    }

    setCameraDistance(distance) {
        const direction = this.camera.position.clone().sub(this.controls.target);
        if (direction.lengthSq() < 1e-9) direction.set(0, 0, 1);
        direction.normalize().multiplyScalar(distance);
        this.camera.position.copy(this.controls.target).add(direction);
        this.controls.update();
        this.invalidate();
    }

    resetView(distance, center = [0, 0, 0]) {
        this.controls.target.set(center[0], center[1], center[2]);
        this.camera.position.set(center[0], center[1], center[2] + distance);
        this.camera.up.set(0, 1, 0);
        this.controls.update();
        this.invalidate();
    }

    setFov(degrees) {
        this.camera.fov = degrees;
        this.camera.updateProjectionMatrix();
        this.uniforms.uFov.value = THREE.MathUtils.degToRad(degrees);
        this.invalidate();
    }

    capture(callback) {
        this.pendingCapture = callback;
    }

    /** Largest export multiplier of the current view the GPU can hold. */
    maxExportScale() {
        const gl = this.renderer.getContext();
        const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        return limit / Math.max(this.viewWidth, this.viewHeight, 1);
    }

    /**
     * Render the current view off-screen at `scale` times the window size,
     * accumulating `samples` jittered frames, and resolve to a PNG blob.
     * One sample is drawn per animation frame so the page stays responsive
     * and a slow GPU never trips the driver watchdog.
     */
    exportImage({ scale = 2, samples = 128, onProgress } = {}) {
        if (this.exportJob) return Promise.reject(new Error('An export is already running.'));
        const fit = Math.min(scale, this.maxExportScale());
        const width = Math.max(2, Math.floor(this.viewWidth * fit));
        const height = Math.max(2, Math.floor(this.viewHeight * fit));
        return new Promise((resolve, reject) => {
            this.exportJob = {
                width,
                height,
                samples: Math.max(1, Math.round(samples)),
                sample: 0,
                targets: this.makeTargets(width, height),
                output: new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, stencilBuffer: false }),
                onProgress: onProgress || (() => {}),
                resolve,
                reject
            };
            this.controls.enabled = false;
        });
    }

    cancelExport() {
        if (this.exportJob) this.finishExport(new Error('Export cancelled.'));
    }

    finishExport(error, blob) {
        const job = this.exportJob;
        this.exportJob = null;
        Object.values(job.targets).forEach((target) => target.dispose());
        job.output.dispose();
        this.controls.enabled = true;
        this.uniforms.iResolution.value.set(this.width, this.height, 1);
        this.invalidate();
        if (error) job.reject(error);
        else job.resolve(blob);
    }

    stepExport() {
        const job = this.exportJob;
        this.uniforms.iResolution.value.set(job.width, job.height, 1);
        this.uniforms.uEye.value.copy(this.camera.position);
        this.uniforms.uTarget.value.copy(this.controls.target);
        this.uniforms.uUp.value.copy(this.camera.up);
        this.uniforms.uJitter.value.set(
            job.sample === 0 ? 0 : halton(job.sample + 1, 2) - 0.5,
            job.sample === 0 ? 0 : halton(job.sample + 1, 3) - 0.5
        );
        this.accumulateInto(job.targets, job.sample);
        job.sample += 1;
        job.onProgress(job.sample, job.samples);
        if (job.sample < job.samples) return;

        try {
            this.quad.material = this.presentMaterial;
            this.presentMaterial.uniforms.tFrame.value = job.targets.accumA.texture;
            this.renderer.setRenderTarget(job.output);
            this.renderer.render(this.scene, this.orthoCamera);
            const pixels = new Uint8Array(job.width * job.height * 4);
            this.renderer.readRenderTargetPixels(job.output, 0, 0, job.width, job.height, pixels);
            this.renderer.setRenderTarget(null);

            const canvas = document.createElement('canvas');
            canvas.width = job.width;
            canvas.height = job.height;
            const context = canvas.getContext('2d');
            const image = context.createImageData(job.width, job.height);
            const row = job.width * 4;
            // WebGL rows run bottom-up
            for (let y = 0; y < job.height; y++) {
                image.data.set(pixels.subarray((job.height - 1 - y) * row, (job.height - y) * row), y * row);
            }
            context.putImageData(image, 0, 0);
            canvas.toBlob((blob) => this.finishExport(blob ? null : new Error('PNG encoding failed.'), blob), 'image/png');
            // keep the job slot busy until the blob arrives
            this.exportJob = { ...job, sample: Infinity, pending: true };
        } catch (error) {
            this.finishExport(error);
        }
    }

    /** Draw one jittered scene sample and fold it into the running average. */
    accumulateInto(targets, sample) {
        this.quad.material = this.sceneMaterial;
        this.renderer.setRenderTarget(targets.scene);
        this.renderer.render(this.scene, this.orthoCamera);

        this.quad.material = this.accumulateMaterial;
        this.accumulateMaterial.uniforms.tCurrent.value = targets.scene.texture;
        this.accumulateMaterial.uniforms.tHistory.value = targets.accumA.texture;
        this.accumulateMaterial.uniforms.uWeight.value = sample === 0 ? 1 : 1 / (sample + 1);
        this.renderer.setRenderTarget(targets.accumB);
        this.renderer.render(this.scene, this.orthoCamera);

        const swap = targets.accumA;
        targets.accumA = targets.accumB;
        targets.accumB = swap;
    }

    loop() {
        requestAnimationFrame(this.loop);

        const now = performance.now();
        const dt = Math.min(0.1, (now - this.lastLoop) / 1000);
        this.lastLoop = now;

        if (this.exportJob) {
            if (!this.exportJob.pending) this.stepExport();
            this.reportStats(now);
            return;
        }

        if (this.onFrame(dt)) {
            this.beginInteraction();
            this.dirty = true;
        }
        const controlsChanged = this.controls.update(dt);
        if (controlsChanged) this.dirty = true;

        const wantScale = this.interacting ? this.motionScale : this.stillScale;
        if (Math.abs(wantScale - this.currentScale) > 0.01) {
            this.applyScale(wantScale);
            this.dirty = true;
        }

        if (this.dirty) {
            this.sample = 0;
            this.dirty = false;
        }

        const converged = this.sample >= this.maxSamples || (this.interacting && this.sample >= 1);

        if (!converged) {
            this.uniforms.uEye.value.copy(this.camera.position);
            this.uniforms.uTarget.value.copy(this.controls.target);
            this.uniforms.uUp.value.copy(this.camera.up);

            if (this.sample === 0) {
                this.uniforms.uJitter.value.set(0, 0);
            } else {
                this.uniforms.uJitter.value.set(
                    halton(this.sample + 1, 2) - 0.5,
                    halton(this.sample + 1, 3) - 0.5
                );
            }

            this.accumulateInto(this.targets, this.sample);
            this.sample += 1;

            this.quad.material = this.presentMaterial;
            this.presentMaterial.uniforms.tFrame.value = this.targets.accumA.texture;
            this.renderer.setRenderTarget(null);
            this.renderer.render(this.scene, this.orthoCamera);

            // GPU work is asynchronous, so time the gap between consecutive
            // renders rather than the cost of issuing the draw calls.
            if (now - this.lastRender < 250) {
                this.frameTime = this.frameTime * 0.85 + (now - this.lastRender) * 0.15;
            }
            this.lastRender = now;
            this.renderCount += 1;

            if (this.autoScale && this.interacting) {
                if (this.frameTime > this.targetFrameTime * 1.35) {
                    this.motionScale = Math.max(0.25, this.motionScale * 0.92);
                } else if (this.frameTime < this.targetFrameTime * 0.6) {
                    this.motionScale = Math.min(this.stillScale, this.motionScale * 1.04);
                }
            }
        }

        if (this.pendingCapture) {
            const callback = this.pendingCapture;
            this.pendingCapture = null;
            this.renderer.domElement.toBlob((blob) => callback(blob), 'image/png');
        }

        this.reportStats(now);
    }

    reportStats(now) {
        if (now - this.statsSince <= 500) return;
        const job = this.exportJob;
        this.onStats({
            fps: Math.round((this.renderCount * 1000) / (now - this.statsSince)),
            active: this.renderCount > 0,
            frameMs: this.frameTime,
            samples: this.sample,
            maxSamples: this.maxSamples,
            width: this.width,
            height: this.height,
            scale: this.currentScale,
            converged: this.sample >= this.maxSamples,
            export: job ? { sample: Math.min(job.sample, job.samples), samples: job.samples, width: job.width, height: job.height } : null
        });
        this.renderCount = 0;
        this.statsSince = now;
    }
}
