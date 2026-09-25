// Torus stage: an annular fundamental domain of the spiral is rolled up into a torus.
//
// The spiral lattice is invariant under z ↦ q^k z, so the annulus rIn ≤ |z| < rOut = q^k·rIn
// (k layers) is a fundamental domain, and gluing its inner circle to its outer circle gives
// the quotient torus C*/⟨q^k⟩. Everything here is a surface of revolution about the view
// axis: the annulus's profile (a radial segment) curls into an arc of growing angle until
// its ends meet in a circle — the torus tube — while the angular coordinate is untouched.
//
// The annulus is a sheet of fabric (the background, cut out) with the donuts printed on
// it, so the whole piece of cloth folds up with its pattern.
//
// World units are CSS pixels and the top-down camera is fitted so the plane z = 0 lands
// pixel-for-pixel on the 2D canvas. Unlit, the cloth shows exactly its printed colours,
// so the hand-off between the 2D canvas and this one is seamless at both ends of the stage.
import * as THREE from 'three';

const canvas = document.getElementById('torusStage');
const FOV = 30;

// Cloth grid resolution: around the annulus × across it.
const CLOTH_U = 192;
const CLOTH_V = 72;
// Print resolution around the annulus (texels); the other side follows the aspect ratio.
const PRINT_W = 4096;

let renderer, scene, camera, group, lights = [], cloth, clothMat, lods = [], gridKey = '', warmed = false;

const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
const lerp = (a, b, k) => a + (b - a) * k;

// A small tileable plain-weave height map: alternating warp/weft thread "pillows".
function weaveTexture() {
    const S = 256, cells = 16, cs = S / cells;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#b4b4b4';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < cells; i++) {
        for (let j = 0; j < cells; j++) {
            const x = i * cs, y = j * cs;
            const horizontal = (i + j) % 2 === 0;
            const grad = horizontal
                ? g.createLinearGradient(x, y, x, y + cs)
                : g.createLinearGradient(x, y, x + cs, y);
            grad.addColorStop(0, '#c2c2c2');
            grad.addColorStop(0.5, '#ffffff');
            grad.addColorStop(1, '#c2c2c2');
            g.fillStyle = grad;
            g.fillRect(x + 0.6, y + 0.6, cs - 1.2, cs - 1.2);
        }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.channel = 1; // its own uv set, tiled independently of the print
    return tex;
}

// --- the print: the donut pattern of the annulus, in log-polar texture coordinates ---
// Texel (x, y) ↔ angle θ = 2πx/W, layer fraction σ = y/H. Log-polar keeps resolution even
// across the annulus (the tiny inner donuts get as many texels as the big outer ones — they
// grow to full size on the torus). Each texel is tested against the nearest lattice donuts
// in the actual plane, so the print is the exact 2D picture. The lattice is periodic in σ,
// so donuts straddling the cut edges are printed consistently across the glued seam.
// The coverage mask is computed in a worker (it's a few million texels) as soon as the
// parameters are known, so it's ready long before the stage starts; only recolouring for a
// palette change happens on the main thread.
function printWorkerMain() {
    self.onmessage = ({ data: p }) => {
        const { W, H, N, k, lq, cOut, cIn } = p;
        const span = k * lq;
        const out = new Uint8ClampedArray(W * H);
        const aa = (2 * Math.PI) / W; // one texel, in units of r
        // Lookup tables so the per-texel loop is plain arithmetic.
        const cosX = new Float64Array(W), sinX = new Float64Array(W);
        for (let x = 0; x < W; x++) {
            const th = ((x + 0.5) / W) * 2 * Math.PI;
            cosX[x] = Math.cos(th); sinX[x] = Math.sin(th);
        }
        const cosJ = new Float64Array(N + 2), sinJ = new Float64Array(N + 2); // j = −1 … N
        for (let j = -1; j <= N; j++) {
            cosJ[j + 1] = Math.cos((2 * Math.PI * j) / N); sinJ[j + 1] = Math.sin((2 * Math.PI * j) / N);
        }
        // donut radius by spiral index s = i·N + j, for s ∈ [−3N, (k + 3)N]
        const sOff = 3 * N, rTab = new Float64Array((k + 6) * N + 1);
        for (let t = 0; t < rTab.length; t++) rTab[t] = Math.exp(((t - sOff) / N) * lq);
        for (let y = 0; y < H; y++) {
            const u = ((y + 0.5) / H) * span; // log r, with rIn = 1
            const er = Math.exp(u);
            const row = y * W;
            for (let x = 0; x < W; x++) {
                const zx = er * cosX[x], zy = er * sinX[x];
                const jc = Math.round(((x + 0.5) / W) * N);
                let best = 0;
                for (let j = jc - 1; j <= jc + 1; j++) {
                    const ic = Math.round(u / lq - j / N);
                    const cj = cosJ[j + 1], sj = sinJ[j + 1];
                    for (let i = ic - 1; i <= ic + 1; i++) {
                        const rd = rTab[i * N + j + sOff];
                        const dx = zx - rd * cj, dy = zy - rd * sj;
                        const d = Math.sqrt(dx * dx + dy * dy) / rd;
                        if (d > cOut + aa) continue;
                        const cov = Math.min(1, Math.max(0, (cOut - d) / aa + 0.5))
                            * Math.min(1, Math.max(0, (d - cIn) / aa + 0.5));
                        if (cov > best) best = cov;
                    }
                }
                out[row + x] = best * 255;
            }
        }
        self.postMessage({ key: p.key, W, H, coverage: out }, [out.buffer]);
    };
}

let worker = null, inFlight = null, wantedJob = null;
let mask = null;                       // latest finished { key, W, H, coverage }
let texKey = '', colourKey = '', printTex = null, printCanvas = null;

const printKeyOf = (p) => [p.spokes, p.k, p.logq.toFixed(6), p.c.toFixed(6), p.thickness].join('|');

function postNext() {
    if (inFlight || !wantedJob || (mask && mask.key === wantedJob.key)) return;
    if (!worker) {
        const src = `(${printWorkerMain.toString()})()`;
        worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        worker.onmessage = ({ data }) => {
            if (data.key === wantedJob?.key) mask = data;
            inFlight = null;
            postNext(); // parameters may have changed while we were busy
        };
    }
    inFlight = wantedJob;
    worker.postMessage(wantedJob);
}

// Called every frame by the 2D side: kicks off the print for these parameters if needed,
// and says whether the torus stage can be shown yet.
function ready(p) {
    if (!(p.rIn > 0) || !(p.rOut > p.rIn) || !(p.k > 0) || !(p.spokes > 0)) return false;
    const key = printKeyOf(p);
    if (wantedJob?.key !== key) {
        const W = PRINT_W;
        const H = Math.max(64, Math.min(W, Math.round((W * p.k * p.logq) / (2 * Math.PI))));
        wantedJob = { key, W, H, N: p.spokes, k: p.k, lq: p.logq, cOut: p.c, cIn: p.c * (1 - p.thickness) };
        postNext();
    }
    if (mask?.key !== key) return false;
    ensurePrint(p); // (re)colour ahead of the stage too, so entering it never stalls
    if (!warmed) {
        // Draw one hidden frame with everything on (lights, grid, print) so shader
        // compilation and the texture upload happen now, not mid-animation.
        warmed = true;
        setTimeout(() => {
            if (canvas.style.visibility === 'visible') return; // already on stage
            render({ ...p, tau: 0.45 });
            hide();
        }, 0);
    }
    return true;
}

function ensurePrint(p) {
    if (texKey !== mask.key) {
        printCanvas = document.createElement('canvas');
        printCanvas.width = mask.W;
        printCanvas.height = mask.H;
        printTex?.dispose();
        printTex = new THREE.CanvasTexture(printCanvas);
        printTex.colorSpace = THREE.SRGBColorSpace;
        printTex.flipY = false;
        printTex.wrapS = THREE.RepeatWrapping;
        printTex.anisotropy = 16; // clamped to the device's maximum by three.js
        texKey = mask.key;
        colourKey = '';
    }
    const ck = p.fg + p.bg;
    if (ck !== colourKey) {
        const { W, H, coverage } = mask;
        const g = printCanvas.getContext('2d');
        const img = g.createImageData(W, H);
        const hex = (s) => [1, 3, 5].map((o) => parseInt(s.slice(o, o + 2), 16));
        const fg = hex(p.fg), bg = hex(p.bg);
        const px = img.data;
        for (let n = 0, o = 0; n < W * H; n++, o += 4) {
            const k = coverage[n] / 255;
            px[o] = bg[0] + (fg[0] - bg[0]) * k;
            px[o + 1] = bg[1] + (fg[1] - bg[1]) * k;
            px[o + 2] = bg[2] + (fg[2] - bg[2]) * k;
            px[o + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        printTex.needsUpdate = true;
        colourKey = ck;
    }
}

function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1e5);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x303048, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-0.6, 0.9, 1.2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(0.8, -0.4, -0.6);
    lights = [hemi, key, rim].map((light) => ({ light, base: light.intensity }));
    lights.forEach(({ light }) => scene.add(light));
    group = new THREE.Group();
    scene.add(group);

    clothMat = new THREE.MeshPhysicalMaterial({
        bumpMap: weaveTexture(),
        bumpScale: 4,
        roughness: 0.9,
        metalness: 0,
        sheen: 1,
        sheenRoughness: 0.45,
        side: THREE.DoubleSide,
        vertexColors: true,
    });
    cloth = new THREE.Mesh(clothGeometry(), clothMat);
    cloth.frustumCulled = false;
    group.add(cloth);

    // Fog in the background colour hides the rest of the lattice until the camera pulls back.
    scene.fog = new THREE.Fog(0x000000, 1e8, 2e8);
}

// Grid over (θ-fraction, σ); positions and normals are rewritten every frame.
function clothGeometry() {
    const nu = CLOTH_U + 1, nv = CLOTH_V + 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nu * nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nu * nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(nu * nv * 2);
    for (let j = 0, o = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) { uv[o++] = i / CLOTH_U; uv[o++] = j / CLOTH_V; }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); // the print
    geo.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(nu * nv * 2), 2)); // the weave
    // Hem: a darker band of stitching along both cut edges of the annulus.
    const col = new Float32Array(nu * nv * 3);
    for (let j = 0; j < nv; j++) {
        const e = Math.min(j, CLOTH_V - j) / CLOTH_V;
        const shade = e < 0.012 ? 0.55 : e < 0.022 ? 0.8 : 1;
        col.fill(shade, j * nu * 3, (j + 1) * nu * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = [];
    for (let j = 0; j < CLOTH_V; j++) {
        for (let i = 0; i < CLOTH_U; i++) {
            const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
            idx.push(a, b, c, b, d, c); // front face = the side facing the camera when flat
        }
    }
    geo.setIndex(idx);
    return geo;
}

// The folding surface at one frame. place(θ, σ, out) writes the point and outward normal
// for canvas angle θ and layer fraction σ ∈ [0, 1] of the annulus.
function makeSurface(p, roll, flutter, tau) {
    // Target torus: the flat annulus has log-width k·log q against angular width 2π, so a
    // tube of radius a = k·log q·λ/2π with major radius R = λ keeps the print locally
    // undistorted at the top of the tube. Scale so the whole torus spans ~unit.
    const λ = p.unit / (1 + (p.k * p.logq) / (2 * Math.PI));
    const a = (p.k * p.logq * λ) / (2 * Math.PI);
    const R = λ;

    // Profile curve in the (ρ, z) half-plane: an arc of fixed length L and angle 2π·roll
    // starting at (ρ0, 0) heading outward and curling away from the camera, so the face we
    // see ends up on the outside of the tube; it closes into the tube at roll = 1.
    const L0 = p.rOut - p.rIn;
    const L = lerp(L0, 2 * Math.PI * a, roll);
    const alpha = 2 * Math.PI * roll;
    const rho0 = lerp(p.rIn, R, roll);
    const lift = a * roll; // recentre the finished torus on z = 0
    const ratio = p.rOut / p.rIn;
    // Cloth-like ripples while it's being folded (zero when flat and when closed).
    const ripple = 0.035 * p.rOut * flutter;

    return function place(theta, sigma, out) {
        const r2d = p.rIn * Math.pow(ratio, sigma);
        // Arc-length parameter: log-spaced on the annulus, evenly spaced round the tube.
        const u = lerp((r2d - p.rIn) / L0, sigma, roll);
        const beta = alpha * u;
        let rho, z;
        if (alpha < 1e-4) { rho = rho0 + L * u; z = 0; }
        else { const rc = L / alpha; rho = rho0 + rc * Math.sin(beta); z = -rc * (1 - Math.cos(beta)); }
        // Canvas y points down, so the 3D angle is −θ.
        const cs = Math.cos(-theta), sn = Math.sin(-theta);
        const nx = Math.sin(beta) * cs, ny = Math.sin(beta) * sn, nz = Math.cos(beta);
        const bump = ripple === 0 ? 0
            : ripple * Math.sin(3 * theta + 2 * Math.PI * sigma * 1.5 - tau * 18)
                * Math.sin(Math.PI * sigma);
        out.x = rho * cs + nx * bump;
        out.y = rho * sn + ny * bump;
        out.z = z + lift + nz * bump;
        out.nx = nx; out.ny = ny; out.nz = nz;
        return out;
    };
}

const pt = {};

// The rest of the lattice: copies of the closed, printed torus, generated around the camera
// every frame so it runs on to the fog in every direction. Copies use static meshes of the
// same surface (same print, weave and hem mapping) at three levels of detail by distance.
const LOD_LEVELS = [
    { u: 96, v: 40, cap: 600 },   // near
    { u: 48, v: 18, cap: 4000 },  // mid
    { u: 20, v: 8, cap: 16000 },  // far
];

function torusMesh(place, U, V, p) {
    const nu = U + 1, nv = V + 1;
    const pos = new Float32Array(nu * nv * 3), nrm = new Float32Array(nu * nv * 3);
    const uv = new Float32Array(nu * nv * 2), uv1 = new Float32Array(nu * nv * 2);
    const col = new Float32Array(nu * nv * 3);
    const repV = (WEAVE_REP_U * p.k * p.logq) / (2 * Math.PI);
    for (let j = 0, v = 0, t = 0; j < nv; j++) {
        const sigma = j / V;
        const e = Math.min(j, V - j) / V;
        const shade = e < 0.012 ? 0.55 : e < 0.03 ? 0.8 : 1;
        for (let i = 0; i < nu; i++, v += 3, t += 2) {
            const f = i / U;
            place(2 * Math.PI * f, sigma, pt);
            pos[v] = pt.x; pos[v + 1] = pt.y; pos[v + 2] = pt.z;
            nrm[v] = pt.nx; nrm[v + 1] = pt.ny; nrm[v + 2] = pt.nz;
            col[v] = col[v + 1] = col[v + 2] = shade;
            uv[t] = f; uv[t + 1] = sigma;
            uv1[t] = f * WEAVE_REP_U; uv1[t + 1] = sigma * repV;
        }
    }
    const idx = [];
    for (let j = 0; j < V; j++) {
        for (let i = 0; i < U; i++) {
            const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1;
            idx.push(a, b, c, b, d, c);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
}

function ensureGrid(p) {
    const key = [p.unit.toFixed(2), p.k, p.logq.toFixed(6)].join('|');
    if (key === gridKey) return;
    const place = makeSurface(p, 1, 0, 0);
    lods.forEach((m) => { scene.remove(m); m.geometry.dispose(); m.dispose(); });
    lods = LOD_LEVELS.map(({ u, v, cap }) => {
        const m = new THREE.InstancedMesh(torusMesh(place, u, v, p), clothMat, cap);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        scene.add(m);
        return m;
    });
    gridKey = key;
}

const WEAVE_REP_U = 14;
const gridM = new THREE.Matrix4();
const gridQ = new THREE.Quaternion();
const gridP = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const frustum = new THREE.Frustum();
const frustumM = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const box = new THREE.Box3();
const corner = new THREE.Vector3();
const FRUSTUM_CORNERS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) FRUSTUM_CORNERS.push([x, y, z]);
const camFrom = new THREE.Vector3(), camTo = new THREE.Vector3();
const camA = new THREE.Vector3(), camB = new THREE.Vector3();

// p: { tau, width, height, dpr, unit, rIn, rOut, k, logq, spokes, c, thickness, fg, bg }
function render(p) {
    // Nothing to fold yet (zero-size frame, or the print is still being computed).
    if (!ready(p)) { hide(); return; }
    if (!renderer) init();
    canvas.style.visibility = 'visible';
    const w = p.width, h = p.height;
    if (canvas.width !== Math.floor(w * p.dpr) || canvas.height !== Math.floor(h * p.dpr)) {
        renderer.setPixelRatio(p.dpr);
        renderer.setSize(w, h, false);
    }
    if (clothMat.map !== printTex) {
        clothMat.map = printTex;
        clothMat.emissiveMap = printTex;
        clothMat.needsUpdate = true;
    }

    // Stage choreography (τ ∈ [0,1]): lift off and light up → roll into the torus → turn to
    // face it head-on → pull back through the fog to reveal the lattice of tori → fly back
    // in → unroll → settle flat and unlit, exactly as the 2D pattern.
    const tau = p.tau;
    const tilt = smoothstep(0.04, 0.12, tau) * (1 - smoothstep(0.90, 0.97, tau));
    const roll = smoothstep(0.10, 0.24, tau) * (1 - smoothstep(0.82, 0.90, tau));
    // head-on: camera swings onto the torus axis and stays there until the lattice is gone
    const face = smoothstep(0.24, 0.30, tau) * (1 - smoothstep(0.76, 0.82, tau));
    // the fog lifts while we're still close in, head-on…
    const reveal = smoothstep(0.30, 0.40, tau) * (1 - smoothstep(0.68, 0.76, tau));
    // …then the camera pulls back and drifts off to one side to take in the lattice
    const pull = smoothstep(0.40, 0.58, tau) * (1 - smoothstep(0.60, 0.70, tau));
    const flutter = Math.sin(Math.PI * roll);
    const lit = tilt;

    const place = makeSurface(p, roll, flutter, tau);
    const geo = cloth.geometry;
    const pos = geo.attributes.position.array;
    const nrm = geo.attributes.normal.array;
    const uv1 = geo.attributes.uv1.array;
    // Weave scale: square threads in the annulus's own (log-polar) coordinates.
    const repV = (WEAVE_REP_U * p.k * p.logq) / (2 * Math.PI);
    let vi = 0, ui = 0;
    for (let j = 0; j <= CLOTH_V; j++) {
        const sigma = j / CLOTH_V;
        for (let i = 0; i <= CLOTH_U; i++) {
            const f = i / CLOTH_U;
            place(2 * Math.PI * f, sigma, pt);
            pos[vi] = pt.x; pos[vi + 1] = pt.y; pos[vi + 2] = pt.z;
            nrm[vi] = pt.nx; nrm[vi + 1] = pt.ny; nrm[vi + 2] = pt.nz;
            vi += 3;
            uv1[ui++] = f * WEAVE_REP_U; uv1[ui++] = sigma * repV;
        }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.uv1.needsUpdate = true;
    // Ripples bend the normals; recompute them while they're present.
    if (flutter > 0.001) geo.computeVertexNormals();
    geo.computeBoundingSphere();

    // Unlit: pure emissive print (matching the 2D canvas). Lit: shaded like cloth, with some
    // self-glow kept so the print stays vivid. The lights fade too, or the sheen would show
    // on the flat hand-off frames.
    lights.forEach(({ light, base }) => { light.intensity = base * lit; });
    clothMat.color.setScalar(1);
    clothMat.sheenColor.set(p.bg).lerp(new THREE.Color(1, 1, 1), 0.5);
    clothMat.emissive.setScalar(1 - 0.6 * lit);

    // The hero torus turns once about its axis over the stage (back to rest by the hand-off).
    const spin = 2 * Math.PI * smoothstep(0.10, 0.90, tau);
    group.rotation.set(0, 0, spin);

    // Torus size (matches makeSurface) and lattice spacing: S side to side (so that, head-on,
    // the neighbours start just outside the frame), SZ front to back.
    const λ = p.unit / (1 + (p.k * p.logq) / (2 * Math.PI));
    const a = (p.k * p.logq * λ) / (2 * Math.PI);
    const outerR = λ + a;
    const S = 3 * outerR;
    const SZ = 2.2 * S;
    const FOG_END = 42 * S;

    // --- camera ---
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    const D = (h / 2) / tanHalf;
    // 1. hand-off view: top-down at D, tilting down to an oblique view as it lights up
    const elev = lerp(Math.PI / 2, 0.6, tilt);
    const dist = D * lerp(1, 1.12, tilt);
    camFrom.set(0, -dist * Math.cos(elev), dist * Math.sin(elev));
    // 2. head-on: straight down the torus axis, the torus filling the frame
    const dHead = outerR / (tanHalf * Math.min(1, w / h));
    camA.set(0, 0, dHead);
    camFrom.lerp(camA, face);
    camTo.set(0, 0, 0);
    // 3. pull back between the rows and drift sideways, looking off into the lattice
    const drift = 0.6 * (smoothstep(0.40, 0.70, tau) - 0.5);
    camA.set(2 * S + Math.sin(drift) * 3 * SZ, 1.5 * S, dHead + Math.cos(drift) * 3 * SZ);
    camB.set(0.5 * S, 0.3 * S, -3 * SZ);
    camFrom.lerp(camA, pull);
    camTo.lerp(camB, pull);

    camera.aspect = w / h;
    camera.near = D * 0.03;
    camera.far = D * 12 + FOG_END + 4 * SZ;
    camera.position.copy(camFrom);
    camera.up.set(0, 1, 0);
    camera.lookAt(camTo);
    camera.updateProjectionMatrix();

    // --- the lattice, emerging from fog in the background colour ---
    ensureGrid(p);
    scene.fog.color.set(p.bg);
    const counts = [0, 0, 0];
    if (reveal > 0) {
        // Fog starts just behind the hero torus (everything else hidden) and lifts to a
        // far horizon, so the lattice fades in around the torus while we're still head-on.
        const toHero = camera.position.length();
        scene.fog.near = lerp(toHero + 1.2 * a, 3 * S, reveal);
        scene.fog.far = lerp(scene.fog.near + 1, FOG_END, reveal * reveal);

        // Fill every lattice cell the camera can see, out to where the fog is total:
        // walk the bounding box of the view frustum (cut off at the fog) and keep the cells
        // whose bounding sphere touches it.
        camera.updateMatrixWorld();
        const saveFar = camera.far;
        camera.far = scene.fog.far + outerR;
        camera.updateProjectionMatrix();
        frustumM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(frustumM);
        box.makeEmpty();
        for (const [cx, cy, cz] of FRUSTUM_CORNERS) box.expandByPoint(corner.set(cx, cy, cz).unproject(camera));
        camera.far = saveFar;
        camera.updateProjectionMatrix();

        const x0 = Math.ceil((box.min.x - outerR) / S), x1 = Math.floor((box.max.x + outerR) / S);
        const y0 = Math.ceil((box.min.y - outerR) / S), y1 = Math.floor((box.max.y + outerR) / S);
        const z0 = Math.ceil((box.min.z - outerR) / SZ), z1 = Math.floor((box.max.z + outerR) / SZ);
        sphere.radius = outerR;
        const cam = camera.position;
        for (let iz = z0; iz <= z1; iz++) {
            for (let iy = y0; iy <= y1; iy++) {
                for (let ix = x0; ix <= x1; ix++) {
                    if (!ix && !iy && !iz) continue; // the hero torus itself
                    sphere.center.set(ix * S, iy * S, iz * SZ);
                    if (!frustum.intersectsSphere(sphere)) continue;
                    const d = sphere.center.distanceTo(cam);
                    if (d > scene.fog.far + outerR) continue;
                    const lvl = d < 6 * S ? 0 : d < 16 * S ? 1 : 2;
                    const mesh = lods[lvl];
                    if (counts[lvl] >= mesh.instanceMatrix.count) continue;
                    gridQ.setFromAxisAngle(Z_AXIS, spin + (((ix * 7 + iy * 13 + iz * 5) % 12 + 12) % 12) * (Math.PI / 6));
                    gridM.compose(sphere.center, gridQ, ONE);
                    mesh.setMatrixAt(counts[lvl]++, gridM);
                }
            }
        }
    } else {
        scene.fog.near = 1e8;
        scene.fog.far = 2e8;
    }
    lods.forEach((m, i) => {
        m.count = counts[i];
        m.visible = counts[i] > 0;
        m.instanceMatrix.needsUpdate = true;
    });

    renderer.render(scene, camera);
}

function hide() {
    canvas.style.visibility = 'hidden';
}

window.DonutTorus = { ready, render, hide };
