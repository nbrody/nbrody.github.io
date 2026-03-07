import { WebGLRenderer, Scene, OrthographicCamera, PlaneGeometry, RawShaderMaterial, Mesh, WebGLRenderTarget, FloatType, NearestFilter, RGBAFormat, TextureLoader, DataTexture, RedFormat, UnsignedByteType, Clock, Vector4, Vector3, Vector2, ClampToEdgeWrapping } from 'three';

const FRAG_PREFIX = `#version 300 es
precision highp float;
precision highp int;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform sampler2D iChannel0;
uniform sampler2D iChannel1;

out vec4 fragColor;
`;

const FRAG_SUFFIX = `
void main() {
    mainImage(fragColor, gl_FragCoord.xy);
}
`;

const VERT_PREFIX = `#version 300 es
precision highp float;
precision highp int;
in vec3 position;
void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

class App {
    constructor() {
        this.renderer = new WebGLRenderer({ antialias: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        document.body.appendChild(this.renderer.domElement);

        this.scene = new Scene();
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.clock = new Clock();
        this.frame = 0;

        this.mouse = new Vector4(0, 0, 0, 0);
        this.mousePos = new Vector2(0, 0);
        this.mouseDown = false;

        this.initInput();
        this.init().catch(console.error);
    }

    initInput() {
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('mousedown', e => {
            this.mouseDown = true;
            this.mousePos.set(e.clientX, window.innerHeight - e.clientY);
            this.mouse.set(this.mousePos.x, this.mousePos.y, this.mousePos.x, this.mousePos.y);
        });
        window.addEventListener('mousemove', e => {
            if (this.mouseDown) {
                this.mousePos.set(e.clientX, window.innerHeight - e.clientY);
                this.mouse.x = this.mousePos.x;
                this.mouse.y = this.mousePos.y;
            }
        });
        window.addEventListener('mouseup', () => {
            this.mouseDown = false;
            this.mouse.z = -Math.abs(this.mouse.z);
            this.mouse.w = -Math.abs(this.mouse.w);
        });
        window.addEventListener('mouseout', () => {
            this.mouseDown = false;
        });

        // Shadertoy keyboard texture: 256x3 texture
        // Row 0: toggled state (key down)
        // Row 1: key press event
        // Row 2: key release event
        this.keyboardData = new Uint8Array(256 * 3);
        this.keyboardTex = new DataTexture(this.keyboardData, 256, 3, RedFormat, UnsignedByteType);
        this.keyboardTex.magFilter = NearestFilter;
        this.keyboardTex.minFilter = NearestFilter;
        this.keyboardTex.wrapS = ClampToEdgeWrapping;
        this.keyboardTex.wrapT = ClampToEdgeWrapping;

        window.addEventListener('keydown', e => {
            const code = e.keyCode;
            if (code >= 0 && code < 256) {
                this.keyboardData[code] = 255;
                this.keyboardData[code + 256] = 255;
                this.keyboardTex.needsUpdate = true;
            }
        });
        window.addEventListener('keyup', e => {
            const code = e.keyCode;
            if (code >= 0 && code < 256) {
                this.keyboardData[code] = 0;
                this.keyboardData[code + 512] = 255;
                this.keyboardTex.needsUpdate = true;
            }
        });
    }

    async init() {
        const [common, bufferA, image] = await Promise.all([
            fetch('shaders/common.glsl').then(r => r.text()),
            fetch('shaders/bufferA.glsl').then(r => r.text()),
            fetch('shaders/image.glsl').then(r => r.text())
        ]);

        const loader = new TextureLoader();
        const fontTex = await new Promise((resolve, reject) => {
            loader.load('./font.png', resolve, undefined, reject);
        });
        // Shadertoy font textures need mipmapping for distance field anti-aliasing but in typical shadertoy it's linear/linear
        fontTex.minFilter = NearestFilter;
        fontTex.magFilter = NearestFilter;

        this.setupRenderTargets();

        const geo = new PlaneGeometry(2, 2);

        this.matA = new RawShaderMaterial({
            vertexShader: VERT_PREFIX,
            fragmentShader: FRAG_PREFIX + common + '\n' + bufferA + FRAG_SUFFIX,
            uniforms: {
                iResolution: { value: new Vector3(this.width, this.height, 1) },
                iTime: { value: 0 },
                iTimeDelta: { value: 0 },
                iFrame: { value: 0 },
                iMouse: { value: this.mouse },
                iChannel0: { value: this.rtA[0].texture },
                iChannel1: { value: this.keyboardTex }
            },
            depthWrite: false,
            depthTest: false
        });

        this.matImage = new RawShaderMaterial({
            vertexShader: VERT_PREFIX,
            fragmentShader: FRAG_PREFIX + common + '\n' + image + FRAG_SUFFIX,
            uniforms: {
                iResolution: { value: new Vector3(this.width, this.height, 1) },
                iTime: { value: 0 },
                iTimeDelta: { value: 0 },
                iFrame: { value: 0 },
                iMouse: { value: this.mouse },
                iChannel0: { value: this.rtA[0].texture },
                iChannel1: { value: fontTex }
            },
            depthWrite: false,
            depthTest: false
        });

        this.mesh = new Mesh(geo, this.matImage);
        this.scene.add(this.mesh);

        this.onResize();

        this.fpsTime = performance.now();
        this.fpsFrames = 0;
        this.fpsEl = document.getElementById('fpsCounter');

        this.renderer.setAnimationLoop(() => this.render());
    }

    setupRenderTargets() {
        this.width = Math.floor(window.innerWidth * this.renderer.getPixelRatio());
        this.height = Math.floor(window.innerHeight * this.renderer.getPixelRatio());

        const params = {
            format: RGBAFormat,
            type: FloatType,
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            wrapS: ClampToEdgeWrapping,
            wrapT: ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        };

        this.rtA = [
            new WebGLRenderTarget(this.width, this.height, params),
            new WebGLRenderTarget(this.width, this.height, params)
        ];
        this.currRtA = 0;
    }

    onResize() {
        const dpr = Math.min(window.devicePixelRatio, 2);
        this.width = Math.floor(window.innerWidth * dpr);
        this.height = Math.floor(window.innerHeight * dpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        if (this.rtA) {
            this.rtA[0].setSize(this.width, this.height);
            this.rtA[1].setSize(this.width, this.height);
        }

        if (this.matA) this.matA.uniforms.iResolution.value.set(this.width, this.height, 1);
        if (this.matImage) this.matImage.uniforms.iResolution.value.set(this.width, this.height, 1);
    }

    render() {
        const time = this.clock.getElapsedTime();
        const delta = this.clock.getDelta();

        // Pass 1: Buffer A
        this.mesh.material = this.matA;
        this.matA.uniforms.iTime.value = time;
        this.matA.uniforms.iTimeDelta.value = delta;
        this.matA.uniforms.iFrame.value = this.frame;
        this.matA.uniforms.iChannel0.value = this.rtA[this.currRtA].texture;

        const nextRtA = 1 - this.currRtA;
        this.renderer.setRenderTarget(this.rtA[nextRtA]);
        this.renderer.render(this.scene, this.camera);

        this.currRtA = nextRtA; // swap

        // Pass 2: Image
        this.mesh.material = this.matImage;
        this.matImage.uniforms.iTime.value = time;
        this.matImage.uniforms.iTimeDelta.value = delta;
        this.matImage.uniforms.iFrame.value = this.frame;
        this.matImage.uniforms.iChannel0.value = this.rtA[this.currRtA].texture;

        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, this.camera);

        // Reset hit keys
        for (let i = 0; i < 256; i++) {
            this.keyboardData[i + 256] = 0;
            this.keyboardData[i + 512] = 0;
        }
        this.keyboardTex.needsUpdate = true;

        this.frame++;
        this.fpsFrames++;
        const now = performance.now();
        if (now - this.fpsTime > 1000) {
            this.fpsEl.textContent = this.fpsFrames + ' fps';
            this.fpsFrames = 0;
            this.fpsTime = now;
        }
    }
}

new App();
