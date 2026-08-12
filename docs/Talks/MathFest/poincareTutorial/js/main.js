import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    Matrix2x2, Complex, formatWordMathJax, reduceWord, invertWord,
    getCayleyGraph, wallSD, covToGeom, bisectorCov, hypDistProxy, hypDist,
    wallF, ballToMinkowski, projectToWall, pslKey, applyMatrixToBall, ballToUHS, uhsToBall
} from './math.js';
import { computeCanonicalDomain } from './canonical.js';
import { certifyDomain, findEdges } from './certifier.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { setupMatrixInput, getMatricesFromUI, configureExact, getExactContext } from './matrixInput.js';
import { NumberField, parsePoly } from './exact.js';
import { setupControlPanel, updateToggleBtn, colorPalettes, getPaletteSettings } from './controlPanel.js';
import { mirrorFragmentShader, mirrorDefaults } from './mirror.js';
import { exportDomainAs3MF } from './export3mf.js';

// --- Three.js setup ---
const container = document.getElementById('viz-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
camera.position.set(2.5, 1.5, 2.5);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;
controls.addEventListener('start', () => {
    controls.autoRotate = false;
    updateToggleBtn(document.getElementById('auto-rotate'), false);
});

const geometry = new THREE.BoxGeometry(2.5, 2.5, 2.5);
let currentMaxFaces = 96;
let currentDepth = 8;
let viewMatrix = Matrix2x2.identity();
let animatingIsometry = false;

let currentMatrices = [];
let currentGenerators = [];   // interleaved [g, g^-1, ...]

const initialDomain = computeCanonicalDomain([], viewMatrix, currentMaxFaces);
const initialPalette = getPaletteSettings();

const material = new THREE.ShaderMaterial({
    uniforms: {
        u_cameraPos: { value: new THREE.Vector3() },
        u_faces: { value: initialDomain.facesBuffer },
        u_faceCount: { value: initialDomain.count },
        u_time: { value: 0 },
        u_opacity: { value: 1.0 },
        u_colorMode: { value: initialPalette.mode },
        u_colorOffset: { value: initialPalette.offset.clone() },
        u_colorFreq: { value: initialPalette.freq },
        u_showTiling: { value: false },
        u_uhs: { value: false },
        u_lightMode: { value: 0 },
        u_bgColor: { value: new THREE.Color(0x05070f) },
        u_maxBounces: { value: mirrorDefaults.maxBounces },
        u_edgeLightWidth: { value: mirrorDefaults.edgeLightWidth },
        u_lightIntensity: { value: mirrorDefaults.lightIntensity }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.BackSide
});

const mesh = new THREE.Mesh(geometry, material);
mesh.renderOrder = -1;
scene.add(mesh);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// --- Theme (dark / light) ---
// The page background is CSS (the renderer is alpha), so a theme switch is
// three things: the <html> class for the UI, the shader's fog/palette mood,
// and the colours of the scene decorations that were picked for a dark sky.
const THEMES = {
    dark: {
        bg: 0x05070f,
        dust: { color: 0xdce6ff, emissive: 0xb8c8ff, intensity: 0.6, opacity: 0.85 },
        cayleyVertex: { color: 0xffffff, emissive: 0xbcd4ff, intensity: 0.25 },
        generators: [0x38bdf8, 0xf472b6, 0xfbbf24, 0x22c55e,
                     0xa78bfa, 0xfb7185, 0x34d399, 0xf97316],
        cone: 0xffffff,
        isoFlow: 0x22d3ee,
        orbit: 0xc084fc,
    },
    light: {
        bg: 0xeef1f8,
        dust: { color: 0x5a6488, emissive: 0x3d4668, intensity: 0.15, opacity: 0.7 },
        cayleyVertex: { color: 0x3b4463, emissive: 0x4b5578, intensity: 0.1 },
        generators: [0x0284c7, 0xdb2777, 0xb45309, 0x15803d,
                     0x7c3aed, 0xe11d48, 0x0f766e, 0xc2410c],
        cone: 0x64748b,
        isoFlow: 0x0e7490,
        orbit: 0x7e22ce,
    },
};
let themeMode = 'dark';
const theme = () => THEMES[themeMode];

function setTheme(mode) {
    if (mode !== 'light' && mode !== 'dark') return;
    themeMode = mode;
    const T = theme();
    document.documentElement.classList.toggle('light', mode === 'light');
    material.uniforms.u_lightMode.value = mode === 'light' ? 1 : 0;
    // Assign the components raw: this ShaderMaterial writes gl_FragColor
    // without a colour-space conversion, so the fog target must carry the
    // literal sRGB values of the CSS background to blend into the page.
    const bg = material.uniforms.u_bgColor.value;
    bg.r = ((T.bg >> 16) & 255) / 255;
    bg.g = ((T.bg >> 8) & 255) / 255;
    bg.b = (T.bg & 255) / 255;
    // Same array, new contents — every consumer keeps its reference.
    T.generators.forEach((c, i) => { generatorColors[i] = c; });
    // Rebuild whatever is currently drawn with the old colours.
    if (cayleyMode !== 'off') updateCayley();
    if (dualMode !== 'off') updateDual();
    if (showTiling) updateTiling();
    if (wallsOpacity > 0) updateWalls();
    if (showDust) updateDust();
    if (orbitRun) {
        orbitRun.mesh.material.color.set(T.orbit);
        orbitRun.mesh.material.emissive.set(T.orbit);
    }
    document.getElementById('theme-dark')?.classList.toggle('active', mode === 'dark');
    document.getElementById('theme-light')?.classList.toggle('active', mode === 'light');
}

// generatorColors is read all over (Cayley edges, walls, tiling); keep the
// same array identity and rewrite its contents on a theme change.
const generatorColors = THEMES.dark.generators.slice();

// --- View model: Poincaré ball vs upper half-space ---
// All overlay geometry is built in BALL coordinates; in UHS mode the final
// positions are pushed through ballToUHS (so the height axis is world z).
let viewModel = 'ball';
const ballBox = geometry;                       // small box; camera orbits outside
const uhsBox = new THREE.BoxGeometry(14, 12, 14);
uhsBox.translate(0, 5, 0);                       // tall in y, covers y ∈ [-1, 11]

// UHS height is the world y-axis (Three.js up): the boundary ℂ is the x–z floor,
// and the cusp rises along +y. ballToUHS gives (x, y, t=height) → world (x, t, y).
function toWorld(p) {
    if (viewModel === 'ball') return p.clone();
    const u = ballToUHS(p);
    return new THREE.Vector3(u.x, u.t, u.y);
}

// Transform an overlay geometry's positions (built in ball coords) into the
// active world frame, in place; recompute normals/bounds. No-op for the ball.
function geomToWorld(g) {
    if (viewModel === 'ball') return g;
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
        const u = ballToUHS({ x: a[i], y: a[i + 1], z: a[i + 2] });
        a[i] = u.x; a[i + 1] = u.t; a[i + 2] = u.y;
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
}

function setViewModel(model) {
    if (model === viewModel) return;
    viewModel = model;
    const uhs = model === 'uhs';
    material.uniforms.u_uhs.value = uhs;
    mesh.geometry = uhs ? uhsBox : ballBox;
    if (uhs) {
        if (mirrorMode) setMirrorMode(false);
        camera.position.set(0.3, 4.8, 0.4);   // look down the cusp into the Ford domain
        controls.target.set(0, 0.45, 0);
        camera.far = 80;
    } else {
        camera.position.set(2.5, 1.5, 2.5);
        controls.target.set(0, 0, 0);
        camera.far = 100;
    }
    camera.updateProjectionMatrix();
    controls.update();
    clearFaceSelection();
    if (cayleyMode !== 'off') updateCayley();
    if (dualMode !== 'off') updateDual();
    if (showTiling) updateTiling();
    if (wallsOpacity > 0) updateWalls();
    if (showDust) updateDust();
    markOrbitDirty();
    updateToggleBtn(document.getElementById('view-uhs'), uhs);
    const mirrorBtn = document.getElementById('toggle-mirror');
    if (mirrorBtn) mirrorBtn.disabled = uhs;
}

const cayleyGroup = new THREE.Group();
cayleyGroup.visible = false;
scene.add(cayleyGroup);
let cayleyMode = 'off';

const wallsGroup = new THREE.Group();
wallsGroup.visible = false;
scene.add(wallsGroup);
let wallsOpacity = 0;

// Dual tiling: Dirichlet–Voronoi walls dual to the (S or T) Cayley graph.
const dualGroup = new THREE.Group();
dualGroup.visible = false;
scene.add(dualGroup);
let dualMode = 'off';
let dualOpacity = 0.3;

// Face inspection: highlight clicked faces (drawn over the polyhedron).
const highlightGroup = new THREE.Group();
scene.add(highlightGroup);
let selectedFace = -1;          // last plain-clicked wall index (angle reference)

// Polyhedral tiling: translucent copies g·D of the fundamental domain.
const tilingGroup = new THREE.Group();
tilingGroup.visible = false;
scene.add(tilingGroup);
let showTiling = false;

// Dust: a random scattering of points, uniform w.r.t. hyperbolic volume.
const dustGroup = new THREE.Group();
dustGroup.visible = false;
scene.add(dustGroup);
let showDust = false;
let dustPoints = null;          // cached ball-coordinate scatter (+ size jitter)
const DUST_COUNT = 15000;
const DUST_MAX_DIST = 9;        // hyperbolic radius of the dust cloud
const TILING_OPACITY = 0.14;
const TILING_MAX = 30;          // max neighbour tiles to draw
const TILING_DEPTH = 2;         // rings of neighbours (face-pairing word length)

// Edge/vertex focus: when set, the tiling shows only the cells meeting it.
let domainSkeleton = null;      // cached { edges, vertices } from findEdges
let focusKind = 'none';         // 'none' | 'edge' | 'vertex'
let focusPoint = null;          // point used to filter tiles (edge midpoint / vertex)
const VERTEX_PICK_PX = 16;      // screen radius for clicking a vertex
const FOCUS_TILE_TOL = 0.08;    // hyperbolic-distance slack on the "equidistant" cell test

let showTiedye = false;
let mirrorMode = false;

function setMirrorMode(enabled) {
    mirrorMode = enabled;
    material.fragmentShader = mirrorMode ? mirrorFragmentShader : fragmentShader;
    material.needsUpdate = true;
    updateToggleBtn(document.getElementById('toggle-mirror'), mirrorMode);
}

// --- Domain state ---
let cachedDomain = null;
let stdGenerators = [];       // [{matrix, word, kind, isParabolic, wallIndex}]
let cumulativeWord = [];
let certToken = 0;            // staleness token for deferred certification
let fullDirichlet = false;    // show full symmetric Dirichlet domain (uncut by stabilizer cone)

function updateDomain(opts = {}) {
    cachedDomain = computeCanonicalDomain(currentGenerators, viewMatrix, currentMaxFaces, {
        maxDepth: currentDepth,
        skipPairings: opts.fast === true,
        fullDirichlet
    });
    material.uniforms.u_faces.value = cachedDomain.facesBuffer;
    material.uniforms.u_faceCount.value = cachedDomain.count;
    window.__domain = cachedDomain;   // debug handle
    return cachedDomain;
}

// --- Status banner + certificate ---
let bannerCollapseTimer = null;

function setBanner(state, text) {
    const banner = document.getElementById('status-banner');
    if (!banner) return;
    if (bannerCollapseTimer) { clearTimeout(bannerCollapseTimer); bannerCollapseTimer = null; }
    banner.className = 'status-banner ' + state;   // 'verified' | 'warning' | 'failed' | 'pending'
    banner.removeAttribute('title');
    banner.innerHTML = '';
    if (text) {
        const span = document.createElement('span');
        span.className = 'status-banner-text';
        span.textContent = text;
        banner.appendChild(span);
        const close = document.createElement('button');
        close.className = 'status-banner-close';
        close.setAttribute('aria-label', 'Dismiss');
        close.textContent = '\u00d7';
        close.addEventListener('click', (e) => {
            e.stopPropagation();
            if (bannerCollapseTimer) { clearTimeout(bannerCollapseTimer); bannerCollapseTimer = null; }
            banner.style.display = 'none';
        });
        banner.appendChild(close);
        // Auto-collapse to the status dot after 5s; clicking the dot expands.
        bannerCollapseTimer = setTimeout(() => {
            banner.classList.add('collapsed');
            banner.title = text;
        }, 5000);
    }
    banner.style.display = text ? 'flex' : 'none';
}

// Expand a collapsed banner on click (a fresh setBanner restarts the cycle).
{
    const banner = document.getElementById('status-banner');
    if (banner) {
        banner.addEventListener('click', () => {
            if (!banner.classList.contains('collapsed')) return;
            banner.classList.remove('collapsed');
            banner.removeAttribute('title');
        });
    }
}

function setCertLog(lines) {
    const el = document.getElementById('cert-log');
    if (!el) return;
    el.textContent = lines.join('\n');
}

// Render the certified presentation as typeset LaTeX in the Domain tab.
function updatePresentationDisplay(pres, certified) {
    const grp = document.getElementById('presentation-group');
    const el = document.getElementById('presentation-display');
    if (!grp || !el) return;
    if (!pres || !pres.latex) {
        grp.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    grp.style.display = '';
    const L = pres.latex;
    let html = `<div class="pres-group-line">\\[ ${L.group} \\]</div>`;
    html += '<div class="pres-dict">';
    html += '<div class="pres-dict-title">where</div>';
    for (const g of L.generators) {
        html += `<div class="pres-gen"><span class="pres-gen-tex">\\(${g.tex}\\)</span>` +
            `<span class="pres-note">${g.note}</span></div>`;
    }
    html += '</div>';
    if (!certified) {
        html += '<div class="pres-caveat">not certified — see the discreteness certificate</div>';
    }
    el.innerHTML = html;
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]).catch(() => { });
    }
}

function runCertifier() {
    if (!cachedDomain || cachedDomain.count === 0) {
        setBanner('warning', currentGenerators.length ? 'No domain faces found.' : '');
        updatePresentationDisplay(null);
        return;
    }
    // Reflection groups run through the same certifier: the edge-cycle walk
    // bounces off self-paired mirror faces, so its 2π/m condition reduces to
    // the Coxeter π/m dihedral condition automatically. Cusp completeness for
    // reflection groups is the one remaining gap — the certifier reports
    // those checks as unresolved rather than skipping them silently.
    // The full Dirichlet domain at a symmetric basepoint is |H| copies of a
    // fundamental domain, so the Poincaré conditions don't apply — show an
    // informational note rather than a misleading failure.
    if (fullDirichlet && cachedDomain.stabilizer.order > 1) {
        const k = cachedDomain.stabilizer.order;
        setBanner('warning', `Full Dirichlet domain — ${k} copies of a fundamental domain (symmetric view; Poincaré check disabled).`);
        setCertLog([
            'Full Dirichlet domain at the basepoint.',
            `Basepoint stabilizer order |H| = ${k}.`,
            'This polyhedron is H-invariant — it is |H| copies of a fundamental',
            'domain — so the Poincaré fundamental-domain conditions do not apply.',
            'Turn off "Full Domain" to certify the canonical fundamental domain.'
        ]);
        updatePresentationDisplay(null);
        return;
    }
    const token = ++certToken;
    setBanner('pending', 'Verifying domain (Poincaré conditions)…');
    // Defer so the UI paints first
    setTimeout(() => {
        if (token !== certToken) return;
        try {
            const exactCtx = getExactContext();
            const report = certifyDomain(cachedDomain.walls, cachedDomain.basepoint, exactCtx);
            if (token !== certToken) return;
            setCertLog(report.log);
            updatePresentationDisplay(report.presentation, report.ok);
            const exactNote = report.exactUsed && exactCtx
                ? ` Relations exact over ${exactCtx.field.describe()}; geometry numerical.`
                : '';
            if (report.status === 'verified') {
                setBanner('verified', report.exactUsed
                    ? `✓ Discrete: all Poincaré conditions verified (${cachedDomain.count} faces).${exactNote}`
                    : `✓ Discrete: all Poincaré conditions verified numerically (${cachedDomain.count} faces).`);
            } else if (report.status === 'incomplete') {
                setBanner('warning', `✓ All resolvable Poincaré conditions pass (${cachedDomain.count} faces) — see certificate for unresolved checks.${exactNote}`);
            } else {
                setBanner('failed', '✗ Discreteness NOT verified — see certificate log. Try a larger word length, or the group may be non-discrete.');
            }
            if (cachedDomain.stabilizer.capped) {
                setBanner('failed', '✗ Basepoint stabilizer did not close into a finite group — the group is likely NOT discrete.');
            }
        } catch (e) {
            console.error('Certifier error:', e);
            setBanner('warning', 'Certifier error: ' + e.message);
            updatePresentationDisplay(null);
        }
    }, 30);
}

// --- Standard generators UI ---
function updateStdGeneratorsList() {
    clearFaceSelection();   // wall indices changed — drop any face highlight
    domainSkeleton = null;  // recompute edges/vertices lazily for the new domain
    const container = document.getElementById('std-generators-list');
    const stabInfo = document.getElementById('stabilizer-info');
    if (!container || !cachedDomain) return;

    // The standard geometric generators are the face-pairing transformations.
    // Keep one per {s, s^-1} pair.
    stdGenerators = [];
    const taken = new Set();
    cachedDomain.walls.forEach((w, i) => {
        if (taken.has(i)) return;
        const pairing = w.pairing;
        if (!pairing) {
            stdGenerators.push({ matrix: w.elem, word: w.word, kind: w.kind, isParabolic: w.isParabolic, wallIndex: i, unpaired: true });
            return;
        }
        taken.add(i);
        if (pairing.partner >= 0) taken.add(pairing.partner);
        stdGenerators.push({
            // pairing.alg is the pure word s = g^{-1} in the basepoint frame;
            // list the generator g whose wall is Bis(q, g·q).
            matrix: pairing.alg.inv().normalized(),
            sMatrix: pairing.alg,
            word: invertWord(pairing.word),
            kind: w.kind,
            isParabolic: w.isParabolic,
            wallIndex: i,
            partnerIndex: pairing.partner
        });
    });

    stdGenerators.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'cone' ? -1 : 1;
        if (a.word.length !== b.word.length) return a.word.length - b.word.length;
        for (let i = 0; i < a.word.length; i++) {
            if (a.word[i] !== b.word[i]) return a.word[i] - b.word[i];
        }
        return 0;
    });

    // Stabilizer summary
    if (stabInfo) {
        const H = cachedDomain.stabilizer;
        if (H.order <= 1) {
            stabInfo.innerHTML = '<span class="stab-trivial">Basepoint stabilizer: trivial</span>';
        } else {
            const capNote = H.capped ? ' <strong class="stab-warning">(did not close — likely non-discrete!)</strong>' : '';
            const note = fullDirichlet
                ? `Showing the full Dirichlet domain — ${H.order} copies of a fundamental domain (symmetric view).`
                : 'Domain = Dirichlet domain ∩ fundamental cone for the stabilizer.';
            stabInfo.innerHTML = `Basepoint stabilizer: order <strong>${H.order}</strong>${capNote}` +
                `<br><span class="stab-note">${note}</span>`;
        }
    }

    // The "Full Domain" toggle only does anything when the basepoint has a
    // symmetry; grey it out otherwise so its scope is self-evident.
    const fullBtn = document.getElementById('toggle-full-domain');
    if (fullBtn) fullBtn.disabled = cachedDomain.stabilizer.order <= 1;

    container.innerHTML = '';
    if (stdGenerators.length === 0) {
        container.innerHTML = '<p class="empty-message">No faces — click Refresh to compute.</p>';
        return;
    }

    stdGenerators.forEach((gen, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item'
            + (gen.kind === 'cone' ? ' stabilizer' : '')
            + (gen.isParabolic ? ' parabolic' : '')
            + (gen.unpaired ? ' unpaired' : '');

        const wordSpan = document.createElement('span');
        wordSpan.className = 'std-gen-word';
        wordSpan.innerHTML = `\\(${formatWordMathJax(gen.word)}\\)`;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'std-gen-type';
        const anti = gen.matrix && gen.matrix.anti;
        typeSpan.textContent = gen.unpaired ? 'unpaired!'
            : anti ? (gen.kind === 'cone' ? 'mirror' : 'reflection')
                : (gen.kind === 'cone' ? 'rotation' : (gen.isParabolic ? 'cusp' : 'face'));

        item.appendChild(wordSpan);
        item.appendChild(typeSpan);
        item.addEventListener('click', (e) => animateStdGenerator(idx, e));
        container.appendChild(item);
    });

    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([container]);
    }
    updateCurrentElementDisplay();
}

function updateCurrentElementDisplay() {
    const display = document.getElementById('current-element-display');
    const matBox = document.getElementById('current-element-matrix');
    // viewMatrix IS the product of everything applied so far, so it is the
    // matrix of the (freely reduced) current word.
    if (display) display.innerHTML = `\\(${formatWordMathJax(reduceWord(cumulativeWord))}\\)`;
    if (matBox) matBox.innerHTML = matrixLatex(viewMatrix);
    const targets = [display, matBox].filter(Boolean);
    if (targets.length && window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise(targets);
    }
}

// --- User-defined elements ---
// Words the user types are stored as signed generator indices (the same
// representation the rest of the app uses), so they survive a change of
// generators: the matrix is recomputed from the word on every render.
let userElements = [];

/**
 * Parse a word in the generators. Accepts lower case for a generator and
 * upper case for its inverse (`a b A B`), or explicit `g1`, `g2`, … , with
 * optional `'` and `^n` / `^{-n}` exponents. Separators are optional.
 */
function parseWord(str, nGens) {
    const s = String(str || '');
    const out = [];
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (/[\s*,.·]/.test(ch)) { i++; continue; }
        let idx, sign = 1;
        if (ch === 'g' || ch === 'G') {
            const m = /^[gG]_?\{?(\d+)\}?/.exec(s.slice(i));
            if (!m) throw new Error(`expected a generator number after “${ch}”`);
            idx = parseInt(m[1], 10);
            i += m[0].length;
        } else if (/[a-z]/.test(ch)) {
            idx = ch.charCodeAt(0) - 96;          // a → 1
            i++;
        } else if (/[A-Z]/.test(ch)) {
            idx = ch.charCodeAt(0) - 64;          // A → g₁⁻¹
            sign = -1;
            i++;
        } else {
            throw new Error(`unexpected character “${ch}”`);
        }
        if (!(idx >= 1 && idx <= nGens)) {
            throw new Error(`g${idx} is not a generator of this group (it has ${nGens})`);
        }
        while (s[i] === "'" || s[i] === '′') { sign = -sign; i++; }
        let exp = 1;
        if (s[i] === '^') {
            i++;
            const m = /^\s*\{?\s*(-?\d+)\s*\}?/.exec(s.slice(i));
            if (!m) throw new Error('expected an integer exponent after “^”');
            exp = parseInt(m[1], 10);
            i += m[0].length;
        }
        const total = sign * exp;
        for (let k = 0; k < Math.abs(total); k++) out.push(total >= 0 ? idx : -idx);
    }
    return out;
}

/** Matrix of a word in the current input generators. */
function wordToMatrix(word) {
    let M = Matrix2x2.identity();
    for (const w of word) {
        const g = currentMatrices[Math.abs(w) - 1];
        if (!g) throw new Error(`g${Math.abs(w)} is not defined`);
        M = M.mul(w > 0 ? g : g.inv().normalized());
    }
    return M.normalized();
}

function renderUserElements() {
    const list = document.getElementById('user-elements-list');
    if (!list) return;
    list.innerHTML = '';
    if (userElements.length === 0) {
        list.innerHTML = '<p class="empty-message">No stored elements yet.</p>';
        return;
    }
    userElements.forEach((el, idx) => {
        const item = document.createElement('div');
        item.className = 'std-gen-item user-elem';

        let M = null, err = null;
        try { M = wordToMatrix(el.word); } catch (e) { err = e.message; }

        const head = document.createElement('div');
        head.className = 'user-elem-head';
        const word = document.createElement('span');
        word.className = 'std-gen-word';
        word.innerHTML = `\\(w_{${idx + 1}} = ${formatWordMathJax(el.word)}\\)`;
        head.appendChild(word);

        const del = document.createElement('button');
        del.className = 'user-elem-del';
        del.textContent = '✕';
        del.title = 'Remove this element';
        del.addEventListener('click', (e) => {
            e.stopPropagation();
            userElements.splice(idx, 1);
            renderUserElements();
        });
        head.appendChild(del);
        item.appendChild(head);

        const mat = document.createElement('div');
        mat.className = 'element-matrix';
        mat.innerHTML = err ? `<span class="elem-error">${err}</span>` : matrixLatex(M);
        item.appendChild(mat);

        if (M) {
            item.title = 'Click to apply this element (⌘/Ctrl-click for its inverse)';
            item.addEventListener('click', (e) => {
                if (animatingIsometry) return;
                const inv = e.metaKey || e.ctrlKey;
                animateMatrix(inv ? M.inv().normalized() : M,
                    inv ? invertWord(el.word) : [...el.word]);
            });
        }
        list.appendChild(item);
    });
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([list]);
    }
}

// --- Cayley graph ---
function getHyperbolicGeodesic(p1, p2, segments = 16) {
    const cross = new THREE.Vector3().crossVectors(p1, p2);
    if (cross.length() < 1e-6) return [p1, p2];

    const v1 = p1.clone(), v2 = p2.clone(), v3 = cross;
    const d1 = (p1.lengthSq() + 1) / 2;
    const d2 = (p2.lengthSq() + 1) / 2;
    const d3 = 0;
    const detM = (v1.x * (v2.y * v3.z - v2.z * v3.y) -
        v1.y * (v2.x * v3.z - v2.z * v3.x) +
        v1.z * (v2.x * v3.y - v2.y * v3.x));
    if (Math.abs(detM) < 1e-9) return [p1, p2];

    const center = new THREE.Vector3(
        (d1 * (v2.y * v3.z - v2.z * v3.y) - v1.y * (d2 * v3.z - v2.z * d3) + v1.z * (d2 * v3.y - v2.y * d3)) / detM,
        (v1.x * (d2 * v3.z - v2.z * d3) - d1 * (v2.x * v3.z - v2.z * v3.x) + v1.z * (v2.x * d3 - d2 * v3.x)) / detM,
        (v1.x * (v2.y * d3 - d2 * v3.y) - v1.y * (v2.x * d3 - d2 * v3.x) + d1 * (v2.x * v3.y - v2.y * v3.x)) / detM
    );
    const radius = Math.sqrt(Math.max(0, center.lengthSq() - 1));
    const r1 = p1.clone().sub(center);
    const r2 = p2.clone().sub(center);
    const arcPoints = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        arcPoints.push(new THREE.Vector3().lerpVectors(r1, r2, t).normalize().multiplyScalar(radius).add(center));
    }
    return arcPoints;
}

function buildTGenerators() {
    const tGens = [];
    const seen = new Set();
    for (const gen of stdGenerators) {
        if (gen.unpaired) continue;
        const wordKey = gen.word.join(',');
        const invKey = invertWord(gen.word).join(',');
        if (seen.has(wordKey) || seen.has(invKey)) continue;
        seen.add(wordKey);
        tGens.push(gen);
    }
    const generators = [];
    for (const g of tGens) {
        generators.push(g.matrix);
        generators.push(g.matrix.inv().normalized());
    }
    return { generators, numTypes: tGens.length };
}

/**
 * Resolve the generating set for a given mode ('S' = input generators,
 * 'T' = standard geometric generators), shared by the Cayley graph and the
 * dual tiling. Returns null if no generators are available.
 * `generators` is the interleaved [g, g^-1, ...] list; `numTypes` counts the
 * {g, g^-1} pairs (used to color edges/walls); `depth` is a word-length cap.
 */
function getModeGenerators(mode) {
    let generators, numTypes;
    let depth = currentDepth;
    if (mode === 'T') {
        if (stdGenerators.length === 0) return null;
        const t = buildTGenerators();
        generators = t.generators;
        numTypes = t.numTypes;
        if (numTypes > 20) depth = Math.min(depth, 2);
        else if (numTypes > 10) depth = Math.min(depth, 3);
        else if (numTypes > 5) depth = Math.min(depth, 4);
    } else {
        if (currentGenerators.length === 0) return null;
        generators = currentGenerators;
        numTypes = currentMatrices.length;
    }
    if (generators.length === 0) return null;
    return { generators, numTypes, depth };
}

// Above this many edges, render flat lines instead of tubes (build cost guard).
const CAYLEY_TUBE_LIMIT = 9000;

function disposeGroup(group) {
    group.traverse(obj => {
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => m.dispose());
        }
    });
    group.clear();
}

// Distinct vertices as one instanced, lightly-lit sphere cloud, shrinking
// toward the ideal boundary — a single draw call regardless of vertex count.
function buildCayleyVertices(points) {
    const seen = new Set();
    const uniq = [];
    for (const p of points) {
        const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(p);
    }
    if (uniq.length === 0) return;
    const geom = new THREE.SphereGeometry(0.015, 10, 8);
    // Opaque + depth-written: vertices occlude correctly against the tubes and
    // each other, and the raymarched domain (drawn later, in the transparent
    // pass, with its own gl_FragDepth) composites over them by its opacity.
    const mat = new THREE.MeshStandardMaterial({
        color: theme().cayleyVertex.color, emissive: theme().cayleyVertex.emissive,
        emissiveIntensity: theme().cayleyVertex.intensity,
        roughness: 0.35, metalness: 0.1
    });
    const inst = new THREE.InstancedMesh(geom, mat, uniq.length);
    const dummy = new THREE.Object3D();
    uniq.forEach((p, i) => {
        const w = toWorld(p);
        let s;
        if (viewModel === 'uhs') {
            // Hyperbolic-size markers scale with height; hide ones off up the cusp.
            s = (w.y > 18 || Math.abs(w.x) > 18 || Math.abs(w.z) > 18) ? 0 : Math.min(8, Math.max(0.06, w.y * 0.85));
        } else {
            s = Math.max(0.1, (1 - p.length()) * 1.5);
        }
        dummy.position.copy(w);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    cayleyGroup.add(inst);
}

// Premium edges: tapered tubes swept along each hyperbolic geodesic (thinner
// toward the boundary, matching the vertex falloff), merged into one lit mesh
// per generator type. A rotation-minimizing frame keeps the cross-section from
// twisting between rings.
function buildCayleyTubes(typeEdges, points, color) {
    const R = 7, SEG = 8, BASE_R = 0.011;
    const positions = [], normals = [], indices = [];
    const perpAxis = (t) => Math.abs(t.x) > 0.9
        ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    for (const { u, v } of typeEdges) {
        if (points[u].distanceTo(points[v]) < 1e-5) continue;
        const path = getHyperbolicGeodesic(points[u], points[v], SEG);
        const m = path.length;
        const base = positions.length / 3;
        let prevN = null;
        for (let i = 0; i < m; i++) {
            const p = path[i];
            const tan = (i === 0 ? path[1].clone().sub(path[0])
                : i === m - 1 ? path[i].clone().sub(path[i - 1])
                    : path[i + 1].clone().sub(path[i - 1]));
            if (tan.lengthSq() < 1e-12) tan.set(0, 0, 1);
            tan.normalize();
            // Transport prevN into the plane ⊥ tan (rotation-minimizing frame).
            let n = prevN ? prevN.clone().addScaledVector(tan, -prevN.dot(tan)) : perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan));
            if (n.lengthSq() < 1e-12) n = perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan));
            n.normalize();
            prevN = n;
            const b = new THREE.Vector3().crossVectors(tan, n);
            const r = BASE_R * Math.max(0.07, 1 - p.length());
            for (let k = 0; k < R; k++) {
                const a = (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
                positions.push(p.x + nx * r, p.y + ny * r, p.z + nz * r);
                normals.push(nx, ny, nz);
            }
        }
        for (let i = 0; i < m - 1; i++) {
            for (let k = 0; k < R; k++) {
                const k2 = (k + 1) % R;
                const a = base + i * R + k, b2 = base + i * R + k2;
                const c = base + (i + 1) * R + k2, d = base + (i + 1) * R + k;
                indices.push(a, b2, c, a, c, d);
            }
        }
    }
    if (positions.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(indices);
    geomToWorld(g);
    // Opaque + depth-written (see buildCayleyVertices): crossing tubes and
    // strands behind other strands now occlude correctly, and a translucent
    // domain surface blends over the graph instead of hard-clipping it.
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.4,
        roughness: 0.3, metalness: 0.2
    });
    return new THREE.Mesh(g, mat);
}

// Cheap fallback: flat geodesic line segments (used during animation / huge graphs).
function buildCayleyLines(typeEdges, points, color) {
    const pts = [];
    for (const { u, v } of typeEdges) {
        if (points[u].distanceTo(points[v]) < 1e-5) continue;
        const geo = getHyperbolicGeodesic(points[u], points[v]);
        for (let i = 0; i < geo.length - 1; i++) pts.push(geo[i], geo[i + 1]);
    }
    if (pts.length === 0) return null;
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    // Depth cue: fade strands into the page background as they approach the
    // ideal boundary — matches the domain shader's fog and the tubes' taper,
    // so a dense graph reads as a ball with depth instead of a wall of noise.
    const cBase = new THREE.Color(color), cBg = new THREE.Color(theme().bg);
    const colors = new Float32Array(pts.length * 3);
    const tmp = new THREE.Color();
    pts.forEach((p, i) => {
        const f = THREE.MathUtils.smoothstep(p.length(), 0.72, 0.995);
        tmp.copy(cBase).lerp(cBg, f * 0.85);
        colors[3 * i] = tmp.r; colors[3 * i + 1] = tmp.g; colors[3 * i + 2] = tmp.b;
    });
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geomToWorld(geom);
    // depthWrite on: even the cheap lines self-occlude while animating.
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: true });
    const lines = new THREE.LineSegments(geom, mat);
    lines.renderOrder = 1;
    return lines;
}

function updateCayley(opts = {}) {
    disposeGroup(cayleyGroup);
    if (cayleyMode === 'off') return;

    const sel = getModeGenerators(cayleyMode);
    if (!sel) return;
    const { generators, numTypes, depth } = sel;

    const { points, edges } = getCayleyGraph(generators, depth, viewMatrix, 15000);

    buildCayleyVertices(points);

    // Tapered tubes when at rest and the graph is a manageable size; otherwise
    // (mid-animation, or a very large graph) the cheap line fallback.
    const useTubes = !opts.fast && edges.length <= CAYLEY_TUBE_LIMIT;
    for (let type = 0; type < numTypes; type++) {
        const typeEdges = edges.filter(e => e.type === type);
        if (typeEdges.length === 0) continue;
        const color = generatorColors[type % generatorColors.length];
        const obj = useTubes
            ? buildCayleyTubes(typeEdges, points, color)
            : buildCayleyLines(typeEdges, points, color);
        if (obj) cayleyGroup.add(obj);
    }
}

// --- Walls (translucent meshes of accepted domain walls) ---
function createWallMesh(wall, color) {
    const geom = wall.geom;
    let mesh = null;

    if (geom.type === 'plane') {
        // Disk: plane through origin ∩ unit ball = unit disk
        const g = new THREE.CircleGeometry(1, 64);
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: wallsOpacity * 0.4,
            side: THREE.DoubleSide, depthWrite: false
        });
        mesh = new THREE.Mesh(g, mat);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), geom.n);
    } else {
        const { c: center, r: radius } = geom;
        const centerDist = center.length();
        if (centerDist < 0.001 || radius > 100) return null;
        const cosTheta = Math.min(1, radius / centerDist);
        const thetaMax = Math.acos(Math.min(1, Math.max(-1, cosTheta)));

        const segments = 32, rings = 16;
        const g = new THREE.BufferGeometry();
        const vertices = [], indices = [];
        for (let i = 0; i <= rings; i++) {
            const phi = (i / rings) * thetaMax;
            const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
            for (let j = 0; j <= segments; j++) {
                const th = (j / segments) * Math.PI * 2;
                vertices.push(sinPhi * Math.cos(th) * radius, sinPhi * Math.sin(th) * radius, cosPhi * radius);
            }
        }
        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < segments; j++) {
                const a = i * (segments + 1) + j;
                const b = a + segments + 1;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: wallsOpacity * 0.4,
            side: THREE.DoubleSide, depthWrite: false
        });
        mesh = new THREE.Mesh(g, mat);
        mesh.position.copy(center);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), center.clone().negate().normalize());
    }
    return mesh;
}

function updateWalls() {
    disposeGroup(wallsGroup);
    if (!cachedDomain) return;
    cachedDomain.walls.forEach((w, i) => {
        const color = w.kind === 'cone' ? theme().cone : generatorColors[i % generatorColors.length];
        const m = createWallMesh(w, color);
        if (!m) return;
        if (viewModel === 'uhs') {
            // Bake the mesh transform into the geometry, then map ball → UHS.
            m.updateMatrix();
            m.geometry.applyMatrix4(m.matrix);
            m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
            geomToWorld(m.geometry);
        }
        wallsGroup.add(m);
    });
}

// --- Dual tiling (walls dual to the Cayley graph) ---
// Each Cayley edge (u, v) is dual to the perpendicular-bisector wall between the
// orbit points q_u, q_v. The actual Dirichlet tile face is the part of that
// bisector closer to q_u, q_v than to any other orbit point — a geodesically
// convex region. We render it cleanly: locate the face's pole (the hyperbolic
// midpoint of q_u, q_v, which is interior to the face iff the two tiles are
// adjacent), march outward along the wall in each direction to the face
// boundary (unit ball or a neighbour's bisector), and fan-tessellate the curved
// cap. This yields true spherical-cap sections instead of a clipped staircase.
const DUAL_NEIGHBORS = 64;       // # nearest orbit points whose bisectors bound a face
const FACE_TOL = 1e-4;

/**
 * Tessellate the convex face carved out of wall `geom` around the interior
 * pole `P`, bounded by the unit ball and the half-spaces `neighborCovs`
 * (covectors oriented domain-side F<0). Marches outward from P in each of
 * `dirs` directions to the face boundary, then fans `rings` radial bands —
 * giving a clean curved spherical-cap section. Appends triangles to `out`.
 */
function buildClippedFace(geom, P, neighborCovs, out, dirs, rings) {
    if (P.lengthSq() >= 1) return;
    // If the pole is outside any bounding half-space, there is no face here.
    for (const Wq of neighborCovs) if (wallF(P, Wq) > FACE_TOL) return;

    const isSphere = geom.type === 'sphere';
    const nrm = isSphere ? P.clone().sub(geom.c).multiplyScalar(1 / geom.r) : geom.n.clone();
    let e1 = Math.abs(nrm.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    e1.sub(nrm.clone().multiplyScalar(e1.dot(nrm))).normalize();
    const e2 = new THREE.Vector3().crossVectors(nrm, e1);

    // Point on the wall at arc-parameter t in tangent direction (ct, st).
    const at = (t, ct, st) => {
        const dx = e1.x * ct + e2.x * st, dy = e1.y * ct + e2.y * st, dz = e1.z * ct + e2.z * st;
        if (isSphere) {
            const cs = Math.cos(t) * geom.r, sn = Math.sin(t) * geom.r;
            return new THREE.Vector3(
                geom.c.x + nrm.x * cs + dx * sn,
                geom.c.y + nrm.y * cs + dy * sn,
                geom.c.z + nrm.z * cs + dz * sn);
        }
        return new THREE.Vector3(P.x + dx * t, P.y + dy * t, P.z + dz * t);
    };
    const inFace = (Q) => {
        if (Q.x * Q.x + Q.y * Q.y + Q.z * Q.z >= 1 - 1e-6) return false;
        for (const Wq of neighborCovs) if (wallF(Q, Wq) > FACE_TOL) return false;
        return true;
    };
    // Cap the march: a sphere face can't extend past where the wall meets the
    // unit ball (its rim), a plane face can't pass the unit disk radius.
    const tMax = isSphere
        ? Math.acos(Math.max(-1, Math.min(1, geom.r / geom.c.length())))
        : 2.0;

    // For each direction, binary-search the face boundary radius.
    const rim = [];
    for (let i = 0; i < dirs; i++) {
        const th = (i / dirs) * Math.PI * 2;
        const ct = Math.cos(th), st = Math.sin(th);
        let lo = 0, hi = tMax;
        if (inFace(at(hi, ct, st))) { rim.push({ ct, st, t: hi }); continue; }
        for (let it = 0; it < 20; it++) {
            const mid = 0.5 * (lo + hi);
            if (inFace(at(mid, ct, st))) lo = mid; else hi = mid;
        }
        rim.push({ ct, st, t: lo });
    }

    // Fan from the pole outward, `rings` radial bands, wrapping around.
    for (let i = 0; i < dirs; i++) {
        const a = rim[i], b = rim[(i + 1) % dirs];
        for (let k = 0; k < rings; k++) {
            const r0 = k / rings, r1 = (k + 1) / rings;
            const A = at(a.t * r0, a.ct, a.st), B = at(a.t * r1, a.ct, a.st);
            const C = at(b.t * r1, b.ct, b.st), D = at(b.t * r0, b.ct, b.st);
            if (k === 0) { out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z); }
            else {
                out.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z,
                    A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z);
            }
        }
    }
}

/**
 * Dual-tiling face on Bis(p1, p2): pole = hyperbolic midpoint of p1, p2 (in the
 * face interior iff the two tiles are adjacent), bounded by `neighborCovs`.
 */
function buildDualFacet(p1, p2, neighborCovs, out, dirs, rings) {
    const W = bisectorCov(p1, p2);
    if (!W) return;                       // coincident points (e.g. elliptic edge)
    const geom = covToGeom(W);
    // Lift p1, p2 to the hyperboloid, average, renormalize, drop back to the ball.
    const v1 = ballToMinkowski(p1), v2 = ballToMinkowski(p2);
    const sSp = v1.sp.clone().add(v2.sp), sT = v1.t + v2.t;
    const nm = Math.sqrt(Math.max(1e-12, sT * sT - sSp.lengthSq()));
    const poleT = sT / nm;
    let P = sSp.multiplyScalar(1 / nm).multiplyScalar(1 / (1 + poleT));
    P = projectToWall(P, geom);
    buildClippedFace(geom, P, neighborCovs, out, dirs, rings);
}

function updateDual(opts = {}) {
    dualGroup.clear();
    if (dualMode === 'off') return;
    const sel = getModeGenerators(dualMode);
    if (!sel) return;

    // The per-face boundary search is the costly part; cap depth/orbit size and
    // tessellation density, harder during animation (opts.fast) for smoothness.
    let depth = Math.min(sel.depth, 4);
    if (opts.fast) depth = Math.min(depth, 2);
    const maxNodes = opts.fast ? 400 : 1500;
    const dirs = opts.fast ? 20 : 48;
    const rings = opts.fast ? 2 : 5;

    const { points, edges } = getCayleyGraph(sel.generators, depth, viewMatrix, maxNodes);
    if (points.length < 2) return;

    // One triangle soup per generator type so each wall family shares its Cayley color.
    const byType = new Map();
    for (const e of edges) {
        const p1 = points[e.u], p2 = points[e.v];
        if (p1.distanceTo(p2) < 1e-5) continue;     // zero-length (e.g. elliptic) edge

        // The face is bounded by the nearest orbit points' bisectors against p1.
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        const ranked = [];
        for (let w = 0; w < points.length; w++) {
            if (w === e.u || w === e.v) continue;
            ranked.push([hypDistProxy(mid, points[w]), w]);
        }
        ranked.sort((a, b) => a[0] - b[0]);
        const neighborCovs = [];
        for (let n = 0; n < Math.min(DUAL_NEIGHBORS, ranked.length); n++) {
            const cov = bisectorCov(p1, points[ranked[n][1]]);
            if (cov) neighborCovs.push(cov);
        }

        let arr = byType.get(e.type);
        if (!arr) { arr = []; byType.set(e.type, arr); }
        buildDualFacet(p1, p2, neighborCovs, arr, dirs, rings);
    }

    for (const [type, arr] of byType) {
        if (arr.length === 0) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        geomToWorld(g);
        const mat = new THREE.MeshBasicMaterial({
            color: generatorColors[type % generatorColors.length],
            transparent: true, opacity: dualOpacity,
            side: THREE.DoubleSide, depthWrite: false
        });
        const m = new THREE.Mesh(g, mat);
        m.renderOrder = 1;
        dualGroup.add(m);
    }
}

// --- Polyhedral tiling (translucent copies of the fundamental domain) ---
// BFS over the face-pairing moves (each wall's element steps to the tile across
// that wall) to collect the nearest group elements, excluding the identity.
function nearbyTiles(walls, maxDepth, maxTiles) {
    const moves = walls.map(w => w.elem);
    const seen = new Set([pslKey(Matrix2x2.identity())]);
    const out = [];
    let frontier = [Matrix2x2.identity()];
    for (let d = 0; d < maxDepth && out.length < maxTiles; d++) {
        const next = [];
        for (const m of frontier) {
            for (const mv of moves) {
                const prod = m.mul(mv).normalized();
                const key = pslKey(prod);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(prod);
                next.push(prod);
                if (out.length >= maxTiles) break;
            }
            if (out.length >= maxTiles) break;
        }
        frontier = next;
    }
    return out;
}

function updateTiling(opts = {}) {
    disposeGroup(tilingGroup);
    if (!showTiling || !cachedDomain || cachedDomain.walls.length === 0) return;

    const walls = cachedDomain.walls;
    const vInv = viewMatrix.inv().normalized();
    const q0 = applyMatrixToBall(vInv, cachedDomain.conePoint);  // basepoint-frame center
    const dirs = opts.fast ? 16 : 34, rings = opts.fast ? 2 : 3;

    // When an edge/vertex is focused, show only the cells meeting it: a cell g·D
    // meets the focus iff the focus point is equidistant from g·q0 and the
    // central q0 (it lies on the shared boundary). Explore deeper to reach the
    // whole edge cycle / vertex star, then keep only the equidistant cells.
    const focused = !opts.fast && focusKind !== 'none' && focusPoint;
    const tiles = focused
        ? nearbyTiles(walls, 5, 400)
        : nearbyTiles(walls, opts.fast ? 1 : TILING_DEPTH, opts.fast ? 14 : TILING_MAX);
    const d0 = focused ? hypDist(focusPoint, cachedDomain.conePoint) : 0;

    // A copy of the fundamental domain at element h has walls
    //   Bis(h·q0, h·g_j·q0)   (g_j = walls[j].elem),
    // i.e. h applied to D's walls. Group faces by wall index so corresponding
    // faces across all tiles share a colour.
    const byWall = new Map();
    for (const h of tiles) {
        const Vh = viewMatrix.mul(h).normalized();
        const c_h = applyMatrixToBall(Vh, q0);
        if (c_h.lengthSq() >= 1) continue;
        if (focused && Math.abs(hypDist(focusPoint, c_h) - d0) > FOCUS_TILE_TOL) continue;
        const covs = [], geoms = [];
        for (const w of walls) {
            const cn = applyMatrixToBall(Vh.mul(w.elem).normalized(), q0);
            const cov = bisectorCov(c_h, cn);
            covs.push(cov);
            geoms.push(cov ? covToGeom(cov) : null);
        }
        for (let j = 0; j < walls.length; j++) {
            if (!geoms[j]) continue;
            const pole = projectToWall(c_h, geoms[j]);
            const others = [];
            for (let k = 0; k < covs.length; k++) if (k !== j && covs[k]) others.push(covs[k]);
            let arr = byWall.get(j);
            if (!arr) { arr = []; byWall.set(j, arr); }
            buildClippedFace(geoms[j], pole, others, arr, dirs, rings);
        }
    }

    for (const [j, arr] of byWall) {
        if (arr.length === 0) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        geomToWorld(g);
        const color = walls[j].kind === 'cone' ? theme().cone : generatorColors[j % generatorColors.length];
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: TILING_OPACITY,
            side: THREE.DoubleSide, depthWrite: false
        });
        const m = new THREE.Mesh(g, mat);
        m.renderOrder = 0;
        tilingGroup.add(m);
    }
}

// --- Dust (hyperbolically uniform random scatter) ---
// Direction uniform on the sphere; hyperbolic distance r drawn from the H^3
// volume density sinh^2(r) via inverse-CDF bisection on
// V(r) = ∫ sinh^2 = (sinh(2r) - 2r)/4; then ball radius tanh(r/2).
function randomHyperbolicPoint(maxDist) {
    const V = (r) => (Math.sinh(2 * r) - 2 * r) / 4;
    const target = Math.random() * V(maxDist);
    let lo = 0, hi = maxDist;
    for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi);
        if (V(mid) < target) lo = mid; else hi = mid;
    }
    const R = Math.tanh(0.25 * (lo + hi));
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return new THREE.Vector3(R * s * Math.cos(th), R * s * Math.sin(th), R * u);
}

// Re-place every mote: base scatter pushed through the current viewMatrix,
// so dust rides along with isometry animations exactly like the orbit does.
// Cheap enough to run per animation frame (matrix updates only, no rebuild).
function repositionDust() {
    const inst = dustGroup.children[0];
    if (!inst || !dustPoints) return;
    const dummy = new THREE.Object3D();
    dustPoints.forEach(({ p, jitter }, i) => {
        const q = applyMatrixToBall(viewMatrix, p);
        const qv = new THREE.Vector3(q.x, q.y, q.z);
        const w = toWorld(qv);
        let s;
        if (viewModel === 'uhs') {
            // Same convention as the Cayley vertices: hyperbolic-size markers
            // scale with height; hide ones far off up the cusp.
            s = (w.y > 18 || Math.abs(w.x) > 18 || Math.abs(w.z) > 18) ? 0 : Math.min(8, Math.max(0.06, w.y * 0.85));
        } else {
            // Constant hyperbolic size (∝ 1−|q|), but floored so the swarm
            // near the ideal boundary still reads as a visible starfield.
            s = Math.max(0.22, (1 - qv.length()) * 1.3);
        }
        dummy.position.copy(w);
        dummy.scale.setScalar(s * jitter);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
}

function updateDust() {
    disposeGroup(dustGroup);
    if (!showDust) return;
    // The scatter is cached in ball coordinates so switching the view model
    // (ball ↔ UHS) re-renders the SAME dust; toggling off/on resamples.
    if (!dustPoints) {
        dustPoints = [];
        for (let i = 0; i < DUST_COUNT; i++) {
            dustPoints.push({
                p: randomHyperbolicPoint(DUST_MAX_DIST),
                jitter: 0.55 + Math.random() * 0.9,   // per-mote size variety
            });
        }
    }
    const geom = new THREE.SphereGeometry(0.012, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
        color: theme().dust.color, emissive: theme().dust.emissive,
        emissiveIntensity: theme().dust.intensity,
        roughness: 0.5, metalness: 0.05, transparent: true,
        opacity: theme().dust.opacity, depthWrite: false
    });
    const inst = new THREE.InstancedMesh(geom, mat, dustPoints.length);
    inst.renderOrder = 1;
    dustGroup.add(inst);
    repositionDust();
}

// --- Orbit generation ---
// Breadth-first growth of the orbit of the basepoint: start at the identity
// and repeatedly multiply by the generators and their inverses, adding a
// small batch of new points on each tick so the orbit visibly spreads out
// toward the ideal boundary. Elements are stored in the identity frame and
// positioned through the live viewMatrix, so the orbit rides isometry
// animations exactly like the dust does.
const orbitGroup = new THREE.Group();
scene.add(orbitGroup);
let orbitRun = null;
const ORBIT_MAX = 2600;      // hard cap: growth is exponential
const ORBIT_BATCH = 16;      // new points per tick
const ORBIT_TICK = 70;       // ms between batches
const ORBIT_POP = 420;       // ms for a new point to scale in
const ORBIT_ORIGIN = new THREE.Vector3(0, 0, 0);

function stopOrbit() {
    if (orbitRun && orbitRun.timer) clearTimeout(orbitRun.timer);
    disposeGroup(orbitGroup);
    orbitRun = null;
}

function startOrbit() {
    stopOrbit();
    if (!currentGenerators || currentGenerators.length === 0) return;
    // Opaque + depth-written, like the Cayley geometry: orbit spheres occlude
    // each other correctly and show through a translucent domain.
    const mat = new THREE.MeshStandardMaterial({
        color: theme().orbit, emissive: theme().orbit, emissiveIntensity: 0.45,
        roughness: 0.35, metalness: 0.1
    });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 12, 8), mat, ORBIT_MAX);
    mesh.frustumCulled = false;      // instances are placed far from the origin
    mesh.count = 0;
    orbitGroup.add(mesh);

    const I = Matrix2x2.identity();
    orbitRun = {
        mesh,
        mats: [I],
        born: [performance.now()],
        seen: new Set([pslKey(I)]),
        gens: currentGenerators.slice(),
        head: 0,
        growing: true,
        dirty: true,
        timer: null,
    };
    mesh.count = 1;
    tickOrbit();
}

function tickOrbit() {
    if (!orbitRun) return;
    const R = orbitRun;
    R.timer = null;
    let added = 0;
    while (added < ORBIT_BATCH && R.head < R.mats.length && R.mats.length < ORBIT_MAX) {
        const m = R.mats[R.head++];
        for (const g of R.gens) {
            if (R.mats.length >= ORBIT_MAX) break;
            const prod = m.mul(g).normalized();
            const key = pslKey(prod);
            if (R.seen.has(key)) continue;
            R.seen.add(key);
            R.mats.push(prod);
            R.born.push(performance.now());
            added++;
        }
    }
    R.mesh.count = R.mats.length;
    R.dirty = true;
    if (R.mats.length >= ORBIT_MAX || R.head >= R.mats.length) {
        R.growing = false;                       // frontier exhausted or capped
    } else {
        R.timer = setTimeout(tickOrbit, ORBIT_TICK);
    }
}

/** Re-place every orbit point; returns true while further frames are needed. */
function updateOrbitInstances(now) {
    if (!orbitRun) return false;
    const R = orbitRun;
    const dummy = new THREE.Object3D();
    let popping = false;
    for (let i = 0; i < R.mats.length; i++) {
        const q = applyMatrixToBall(viewMatrix.mul(R.mats[i]).normalized(), ORBIT_ORIGIN);
        const qv = new THREE.Vector3(q.x, q.y, q.z);
        const w = toWorld(qv);
        let s;
        if (viewModel === 'uhs') {
            s = (w.y > 18 || Math.abs(w.x) > 18 || Math.abs(w.z) > 18)
                ? 0 : Math.min(8, Math.max(0.06, w.y * 0.85));
        } else {
            s = Math.max(0.12, (1 - qv.length()) * 1.5);
        }
        const age = (now - R.born[i]) / ORBIT_POP;
        let pop = 1;
        if (age < 1) { popping = true; const t = Math.max(0, age); pop = t * t * (3 - 2 * t); }
        dummy.position.copy(w);
        dummy.scale.setScalar(s * pop);
        dummy.updateMatrix();
        R.mesh.setMatrixAt(i, dummy.matrix);
    }
    R.mesh.instanceMatrix.needsUpdate = true;
    R.dirty = popping || R.growing;
    return R.dirty;
}

/** The view moved (or the model changed): orbit positions need a rebuild. */
function markOrbitDirty() {
    if (orbitRun) orbitRun.dirty = true;
}

// --- Isometry axis visualization ---
// While an isometry animates, show its geometry: the axis and boundary
// fixed points (hyperbolic/loxodromic, with a marker sliding along the
// axis), the rotation arc with an arrowhead (elliptic), or the single
// boundary fixed point with an orbit trail (parabolic).
const isoAxisGroup = new THREE.Group();
scene.add(isoAxisGroup);
let isoAxisTimer = null;

const ISO_AXIS_COLOR = 0xfbbf24;   // amber axis / fixed points
const ISO_MARK_COLOR = 0xf472b6;   // rose moving marker / rotation arc

function scaleMat(X, s) {
    return new Matrix2x2(X.a.mul(s), X.b.mul(s), X.c.mul(s), X.d.mul(s));
}

// Classify a det-1 Möbius map and return its boundary fixed points as
// Poincaré-ball boundary points. Loxodromic counts as 'hyperbolic';
// parabolic has p2 = null.
function classifyIsometry(G) {
    const eps = 1e-6;
    const tr = G.a.add(G.d);
    const disc = tr.mul(tr).sub(new Complex(4, 0));   // tr² − 4
    let type;
    if (Math.sqrt(disc.normSq()) < 1e-4) type = 'parabolic';
    else if (Math.abs(tr.im) < 1e-4 && Math.abs(tr.re) < 2) type = 'elliptic';
    else type = 'hyperbolic';

    const zToBall = (z) => uhsToBall({ x: z.re, y: z.im, t: 0 });
    let p1, p2;
    if (Math.sqrt(G.c.normSq()) < eps) {
        p1 = new THREE.Vector3(0, 0, 1);              // ∞ on the ball boundary
        const da = G.d.sub(G.a);
        p2 = Math.sqrt(da.normSq()) < eps ? null : zToBall(G.b.div(da));
    } else {
        const s = Complex.sqrt(disc);
        const amd = G.a.sub(G.d);
        const twoC = G.c.mul(2);
        p1 = zToBall(amd.add(s).div(twoC));
        p2 = zToBall(amd.sub(s).div(twoC));
    }
    if (type === 'parabolic') p2 = null;
    return { type, p1, p2 };
}

// --- Boundary flow lines on ∂H³ = S² ---
//
// The one-parameter flow W(s) = V₀·exp(sX)·V₀⁻¹ acts on the sphere at
// infinity; its orbits are the loxodromes spiralling between the two fixed
// points (hyperbolic/loxodromic), circles mutually tangent at the fixed
// point (parabolic), or circles around the axis endpoints (elliptic).
//
// Rather than deriving the curves analytically, we use the eigenbasis only
// to choose good seeds and an s-range, then trace the TRUE orbits by
// applying the flow itself. Boundary points are carried in homogeneous
// coordinates [z : w], so ∞ needs no special case.

function cplx(re, im) { return new Complex(re, im); }

/** Möbius action on a homogeneous boundary point. */
function projImage(M, num, den) {
    return [M.a.mul(num).add(M.b.mul(den)), M.c.mul(num).add(M.d.mul(den))];
}

/** Homogeneous boundary point → Poincaré-ball boundary point. */
function projToBall(num, den) {
    if (den.normSq() < 1e-22) return new THREE.Vector3(0, 0, 1);   // ∞
    const z = num.div(den);
    if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return new THREE.Vector3(0, 0, 1);
    return uhsToBall({ x: z.re, y: z.im, t: 0 });
}

/**
 * Eigenframe of G: P has the eigenvectors as columns, so P⁻¹GP is diagonal
 * (or upper-triangular when parabolic). Column 1 ↔ ∞, column 2 ↔ 0 in the
 * normalized coordinate.
 */
function eigenFrame(G) {
    const tr = G.a.add(G.d);
    const disc = tr.mul(tr).sub(cplx(4, 0));
    const parabolic = Math.sqrt(disc.normSq()) < 1e-9;
    const two = cplx(2, 0);
    const sq = Complex.sqrt(disc);
    const k1 = tr.add(sq).div(two);
    const k2 = tr.sub(sq).div(two);
    // Eigenvector for κ: either (b, κ−a) or (κ−d, c); take the better-conditioned one.
    const evec = (k) => {
        const u = [G.b, k.sub(G.a)], v = [k.sub(G.d), G.c];
        return (u[0].normSq() + u[1].normSq()) >= (v[0].normSq() + v[1].normSq()) ? u : v;
    };
    const v1 = evec(k1);
    let v2;
    if (parabolic) {
        // One eigendirection only: complete the basis with whichever axis is
        // most independent of v1.
        v2 = v1[1].normSq() >= v1[0].normSq() ? [cplx(1, 0), cplx(0, 0)] : [cplx(0, 0), cplx(1, 0)];
    } else {
        v2 = evec(k2);
    }
    const P = new Matrix2x2(v1[0], v2[0], v1[1], v2[1]);   // columns = v1, v2
    if (Math.sqrt(P.det ? P.det().normSq() : 1) < 1e-12) return null;
    let N;
    try { N = P.inv(); } catch (e) { return null; }
    const M = N.mul(G).mul(P);        // normal form
    return { P, M, parabolic };
}

function buildBoundaryFlowLines(G, flowAt) {
    const fr = eigenFrame(G);
    if (!fr) return;
    const { P, M, parabolic } = fr;

    // Read the normal form to size the flow.
    let sMin, sMax, seeds = [];
    if (parabolic) {
        const c = M.b.div(M.d);                     // translation per application
        const cAbs = Math.sqrt(c.normSq());
        if (!(cAbs > 1e-9)) return;
        const span = 26 / cAbs;
        sMin = -span; sMax = span;
        // Seed on a line perpendicular to the translation. Offsets grow
        // geometrically, so the nested tangent circles stay evenly spaced
        // once they are drawn on the sphere.
        const perp = cplx(-c.im, c.re).div(cplx(cAbs, 0));
        for (let k = 0; k < 13; k++) {
            const d = 0.35 * Math.pow(1.52, k);
            seeds.push(perp.mul(cplx(d, 0)));
            seeds.push(perp.mul(cplx(-d, 0)));
        }
    } else {
        const mu = M.a.div(M.d);                    // multiplier
        const ell = 0.5 * Math.log(Math.max(1e-30, mu.normSq()));   // ln|μ|
        const theta = Math.atan2(mu.im, mu.re);
        if (Math.abs(ell) < 1e-6) {
            // Elliptic: closed circles; one full turn, seeds at several radii.
            if (Math.abs(theta) < 1e-6) return;
            sMin = 0; sMax = 2 * Math.PI / Math.abs(theta);
            // Log-spaced radii → latitude circles spread evenly from one
            // fixed point to the other.
            const N = 20;
            for (let k = 0; k < N; k++) {
                seeds.push(cplx(0.08 * Math.pow(150, k / (N - 1)), 0));
            }
        } else {
            // Loxodromic: spirals from one fixed point to the other. Seed the
            // unit circle (the "equator" between them) and run until the
            // orbits have swept several decades of radius.
            const span = Math.log(600) / Math.abs(ell);
            sMin = -span; sMax = span;
            const n = 32;
            for (let i = 0; i < n; i++) {
                const ph = 2 * Math.PI * i / n;
                seeds.push(cplx(Math.cos(ph), Math.sin(ph)));
            }
        }
    }
    if (seeds.length === 0) return;

    // Precompute the flow matrices once, then push every seed through them.
    const STEPS = 220;
    const mats = [];
    for (let k = 0; k <= STEPS; k++) {
        mats.push(flowAt(sMin + (sMax - sMin) * k / STEPS));
    }

    // Most of the family is drawn as faint hairlines to give the texture of
    // the flow; roughly a quarter are solid tubes, so the eye has a few
    // curves it can actually follow from end to end.
    const color = theme().isoFlow;
    const ACCENT_EVERY = 4;
    const lineMat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false
    });
    const coneMat = (accent) => new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: accent ? 0.95 : 0.55,
        depthTest: false, depthWrite: false
    });

    // Trace every orbit first; the accents are chosen afterwards from the
    // geometry. Seeds equally spaced in the normalized coordinate land
    // bunched to one side of the sphere after the Möbius map, so picking
    // every fourth INDEX piles the arrows onto half the ball.
    const curves = [];
    seeds.forEach((z0) => {
        const s0 = projImage(P, z0, cplx(1, 0));       // seed in world coords
        const ball = [];
        for (const W of mats) {
            const [n1, d1] = projImage(W, s0[0], s0[1]);
            const b = projToBall(n1, d1);
            // Keep the polyline just off the sphere; drop numerical stragglers.
            if (Number.isFinite(b.x)) ball.push(b.multiplyScalar(1.002));
        }
        if (ball.length >= 2) curves.push({ ball, mid: ball[Math.floor(ball.length / 2)] });
    });
    if (curves.length === 0) return;

    // Farthest-point sampling on the midpoints (where the arrows sit)
    // spreads the accents evenly over the sphere for any isometry.
    const nAccents = Math.max(1, Math.round(curves.length / ACCENT_EVERY));
    const accentSet = new Set([0]);
    while (accentSet.size < nAccents) {
        let best = -1, bestD = -1;
        curves.forEach((c, i) => {
            if (accentSet.has(i)) return;
            let d = Infinity;
            for (const j of accentSet) d = Math.min(d, c.mid.distanceToSquared(curves[j].mid));
            if (d > bestD) { bestD = d; best = i; }
        });
        if (best < 0) break;
        accentSet.add(best);
    }

    curves.forEach(({ ball }, idx) => {
        const accent = accentSet.has(idx);

        if (accent) {
            // isoTube maps ball → world itself, so it gets the raw points.
            const tube = isoTube(ball, color, 0.0032);
            tube.material.opacity = 0.82;
            tube.renderOrder = 6;          // stays under the axis (7)
            isoAxisGroup.add(tube);
        } else {
            const geom = new THREE.BufferGeometry().setFromPoints(ball.map(toWorld));
            const line = new THREE.Line(geom, lineMat);
            line.renderOrder = 6;
            isoAxisGroup.add(line);
        }

        // Direction arrows ride the accent curves only, and sit at their
        // midpoint: orbit endpoints all pile onto the fixed points, so an
        // arrowhead there would be a heap rather than a hint.
        if (!accent) return;
        const m = Math.floor(ball.length / 2);
        const wMid = toWorld(ball[m]);
        const dir = toWorld(ball[Math.min(ball.length - 1, m + 1)]).sub(wMid);
        if (dir.lengthSq() > 1e-12) {
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(0.016, 0.048, 10), coneMat(true));
            cone.position.copy(wMid);
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
            cone.renderOrder = 6;
            isoAxisGroup.add(cone);
        }
    });
}

function isoTube(points, color, radius = 0.008) {
    const geom = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points), Math.max(32, points.length), radius, 8, false);
    geomToWorld(geom);
    const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.8,
        roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.95,
        depthTest: false, depthWrite: false
    }));
    mesh.renderOrder = 7;
    return mesh;
}

function isoMarker(p, color, r = 0.03) {
    const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.8,
            roughness: 0.3, metalness: 0.1, transparent: true,
            depthTest: false, depthWrite: false
        }));
    m.position.copy(toWorld(p));
    m.renderOrder = 7;
    return m;
}

/**
 * Build the axis visualization for animateMatrix. The world moves by the
 * conjugated flow W(t) = V0·exp(tX)·V0⁻¹, so its axis/fixed points are
 * STATIC for the whole animation — only the probe marker moves, tracked
 * per frame from the global viewMatrix (W(t) = viewMatrix·V0⁻¹).
 * Returns { onFrame, finish }.
 */
function showIsometryAxis(g, V0, X) {
    if (isoAxisTimer) { clearTimeout(isoAxisTimer); isoAxisTimer = null; }
    disposeGroup(isoAxisGroup);

    const noop = { onFrame() { }, finish() { } };
    // The axis, fixed points and boundary flow ride along with Dust: they are
    // the same "what is this isometry doing to space" story, and without the
    // dust to move against they clutter a clean domain view.
    if (!showDust) return noop;
    let G, V0i;
    try {
        V0i = V0.inv().normalized();
        G = V0.mul(g).mul(V0i).normalized();   // the motion in the world frame
    } catch (e) { return noop; }
    const { type, p1, p2 } = classifyIsometry(G);
    if (!p1) return noop;

    const flowAt = (s) => V0.mul(Matrix2x2.exp(scaleMat(X, s))).mul(V0i).normalized();

    try { buildBoundaryFlowLines(G, flowAt); } catch (e) { console.warn('flow lines:', e); }

    let marker = null;
    let probe = null;      // ball point whose W(t)-image the marker tracks

    if (p2) {
        // Axis geodesic between the two boundary fixed points. When the axis
        // is a diameter (antipodal fixed points) the geodesic helper returns
        // just the two BOUNDARY endpoints — densify with the straight segment
        // so the nearest-to-origin probe below lands at an interior point
        // (boundary points blow up in ballToUHS).
        let samples = getHyperbolicGeodesic(p1, p2, 96);
        if (samples.length === 2) {
            samples = [];
            for (let k = 0; k <= 96; k++) samples.push(new THREE.Vector3().lerpVectors(p1, p2, k / 96));
        }
        isoAxisGroup.add(isoTube(samples, ISO_AXIS_COLOR, type === 'elliptic' ? 0.006 : 0.009));
        isoAxisGroup.add(isoMarker(p1, ISO_AXIS_COLOR, 0.022));
        isoAxisGroup.add(isoMarker(p2, ISO_AXIS_COLOR, 0.022));

        // The axis point nearest the origin (and its direction there),
        // pulled slightly inward if the whole arc hugs the boundary.
        let A0 = samples[0], iA = 0;
        samples.forEach((s, i) => { if (s.lengthSq() < A0.lengthSq()) { A0 = s.clone(); iA = i; } });
        if (A0.length() > 0.985) A0.setLength(0.985);

        if (type === 'elliptic') {
            // Points ON the axis don't move — probe from just off the axis and
            // pre-draw the full rotation arc with an arrowhead at its end.
            const tan = samples[Math.min(iA + 1, samples.length - 1)].clone()
                .sub(samples[Math.max(iA - 1, 0)]).normalize();
            let n = Math.abs(tan.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            n.sub(tan.clone().multiplyScalar(n.dot(tan))).normalize();
            probe = A0.clone().addScaledVector(n, 0.12 + 0.35 * (1 - A0.length()));

            const N = 48, arc = [];
            for (let k = 0; k <= N; k++) arc.push(applyMatrixToBall(flowAt(k / N), probe));
            isoAxisGroup.add(isoTube(arc, ISO_MARK_COLOR, 0.007));

            const dir = arc[N].clone().sub(arc[N - 1]).normalize();
            const cone = new THREE.Mesh(
                new THREE.ConeGeometry(0.026, 0.07, 12),
                new THREE.MeshStandardMaterial({
                    color: ISO_MARK_COLOR, emissive: ISO_MARK_COLOR, emissiveIntensity: 0.8,
                    roughness: 0.3, metalness: 0.1, transparent: true,
                    depthTest: false, depthWrite: false
                }));
            cone.position.copy(toWorld(arc[N]));
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
            cone.renderOrder = 7;
            isoAxisGroup.add(cone);
        } else {
            // Hyperbolic/loxodromic: the probe slides along the axis itself.
            probe = A0.clone();
        }
    } else {
        // Parabolic: one boundary fixed point; trail the orbit of the
        // world point currently at the center of the view.
        isoAxisGroup.add(isoMarker(p1, ISO_AXIS_COLOR, 0.03));
        probe = new THREE.Vector3(0, 0, 0);
        const N = 48, arc = [];
        for (let k = 0; k <= N; k++) arc.push(applyMatrixToBall(flowAt(k / N), probe));
        isoAxisGroup.add(isoTube(arc, ISO_MARK_COLOR, 0.007));
    }

    marker = isoMarker(probe, ISO_MARK_COLOR, 0.034);
    isoAxisGroup.add(marker);

    return {
        onFrame() {
            const Wt = viewMatrix.mul(V0i).normalized();
            marker.position.copy(toWorld(applyMatrixToBall(Wt, probe)));
        },
        finish() {
            // Linger after the motion so the audience can read the axis.
            // (window.__isoLinger overrides the delay — handy when tuning.)
            isoAxisTimer = setTimeout(() => disposeGroup(isoAxisGroup), window.__isoLinger || 2500);
        }
    };
}

// --- Isometry animation ---
// Orientation-reversing isometries have no one-parameter flow (no log), so
// there is no continuous path to animate along — apply them in one step.
function applyMatrixInstant(g, wordToAppend, onDone) {
    viewMatrix = viewMatrix.mul(g).normalized();
    cumulativeWord = reduceWord([...cumulativeWord, ...wordToAppend]);
    updateDomain();
    updateStdGeneratorsList();
    if (wallsOpacity > 0) updateWalls();
    if (cayleyMode !== 'off') updateCayley();
    if (dualMode !== 'off') updateDual();
    if (showTiling) updateTiling();
    if (showDust) repositionDust();
    markOrbitDirty();
    runCertifier();
    if (onDone) onDone();
}

function animateMatrix(g, wordToAppend, onDone) {
    if (g.anti) {
        applyMatrixInstant(g, wordToAppend, onDone);
        return;
    }
    try {
        const X = g.log();
        const startView = viewMatrix;
        const axisViz = showIsometryAxis(g, startView, X);
        const duration = 1000;
        const startTime = performance.now();
        animatingIsometry = true;

        function step(now) {
            const t = Math.min((now - startTime) / duration, 1);
            const eased = t * t * (3 - 2 * t);
            const tX = new Matrix2x2(X.a.mul(eased), X.b.mul(eased), X.c.mul(eased), X.d.mul(eased));
            viewMatrix = startView.mul(Matrix2x2.exp(tX));
            axisViz.onFrame();

            updateDomain({ fast: true });
            if (cayleyMode !== 'off') updateCayley({ fast: true });   // cheap lines while moving
            if (dualMode !== 'off') updateDual({ fast: true });
            if (showTiling) updateTiling({ fast: true });
            if (wallsOpacity > 0) updateWalls();
            if (showDust) repositionDust();   // dust rides the isometry
            markOrbitDirty();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                animatingIsometry = false;
                cumulativeWord = reduceWord([...cumulativeWord, ...wordToAppend]);
                updateDomain();          // full recompute with pairings
                updateStdGeneratorsList();
                if (wallsOpacity > 0) updateWalls();
                if (cayleyMode !== 'off') updateCayley();   // rebuild premium tubes at rest
                if (dualMode !== 'off') updateDual();
                if (showTiling) updateTiling();
                if (showDust) repositionDust();
                markOrbitDirty();
                axisViz.finish();
                runCertifier();
                if (onDone) onDone();
            }
        }
        requestAnimationFrame(step);
    } catch (e) {
        console.error('Animation error:', e);
        animatingIsometry = false;
    }
}

function animateStdGenerator(idx, event) {
    if (animatingIsometry || idx >= stdGenerators.length) return;
    const gen = stdGenerators[idx];
    let g = gen.matrix;
    let word = [...gen.word];
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv().normalized();
        word = invertWord(gen.word);
    }
    animateMatrix(g, word);
}

function animateIsometry(genIndex, event) {
    if (animatingIsometry || genIndex >= currentMatrices.length) return;
    let g = currentMatrices[genIndex];
    let word = [genIndex + 1];
    if (event && (event.metaKey || event.ctrlKey)) {
        g = g.inv().normalized();
        word = [-(genIndex + 1)];
    }
    animateMatrix(g, word);
}

// --- Face picking (double-click) ---
// UHS wall SDF from the covector (must match the shader's sdWall UHS branch:
// y is the height, the x–z plane is the boundary floor).
function uhsWallSD(p, W) {
    const d = W.z - W.w;
    if (Math.abs(d) < 1e-4) {
        const nl = Math.hypot(W.x, W.y);
        if (nl < 1e-9) return 1e9;
        return (W.x * p.x + W.y * p.z - 0.5 * (W.z + W.w)) / nl;
    }
    const rr = (W.x * W.x + W.y * W.y) / (d * d) + (W.z + W.w) / d;
    if (rr <= 0) return 1e9;
    return Math.sign(d) * (Math.hypot(p.x + W.x / d, p.y, p.z + W.y / d) - Math.sqrt(rr));
}

function mapSDF(p) {
    const walls = cachedDomain ? cachedDomain.walls : [];
    const uhs = viewModel === 'uhs';
    let d = uhs ? -p.y : p.length() - 1.0;
    let bestId = -1;
    for (let i = 0; i < walls.length; i++) {
        const df = uhs ? uhsWallSD(p, walls[i].cov) : wallSD(p, walls[i].geom);
        if (df > d) { d = df; bestId = i; }
    }
    return { d, bestId };
}

function findClickedWall(ray) {
    if (!cachedDomain || cachedDomain.count === 0) return -1;
    const uhs = viewModel === 'uhs';
    const EPSILON = 0.002, MAX_DIST = uhs ? 26 : 10;
    let t = 0.01;
    for (let iter = 0; iter < 260; iter++) {
        const p = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
        const outside = uhs ? (p.y < -0.3 || p.y > 16 || Math.abs(p.x) > 16 || Math.abs(p.z) > 16) : p.length() > 2.0;
        if (outside) {
            t += 0.05;
            if (t > MAX_DIST) return -1;
            continue;
        }
        const { d, bestId } = mapSDF(p);
        if (Math.abs(d) < EPSILON && bestId >= 0) return bestId;
        t += Math.max(EPSILON, Math.abs(d) * 0.9);
        if (t > MAX_DIST) return -1;
    }
    return -1;
}

function handleDoubleClick(event) {
    if (animatingIsometry || !cachedDomain) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const wallIdx = findClickedWall(raycaster.ray);
    if (wallIdx < 0) return;
    const wall = cachedDomain.walls[wallIdx];
    if (!wall.pairing) return;
    // Roll the domain across THIS face. The wall is Bis(q, g·q) with g = wall.elem,
    // so applying g (= pairing.alg⁻¹) sends the basepoint to g·q and the domain to
    // the adjacent tile g·D, which shares exactly this face (its g⁻¹ wall = this one).
    // Applying pairing.alg = g⁻¹ instead would roll across the partner face.
    animateMatrix(wall.pairing.alg.inv().normalized(), invertWord(wall.pairing.word));
}
renderer.domElement.addEventListener('dblclick', handleDoubleClick);

// --- Face inspection (single-click: element / vertex; shift-click: edge) ---
function clearFaceSelection() {
    selectedFace = -1;
    focusKind = 'none';
    focusPoint = null;
    highlightGroup.clear();
    const info = document.getElementById('face-info');
    if (info) info.style.display = 'none';
}

// Translucent overlay of exactly face `idx` (clipped against the other walls).
function addFaceHighlight(idx, color) {
    if (!cachedDomain || idx < 0 || idx >= cachedDomain.walls.length) return;
    const geom = cachedDomain.walls[idx].geom;
    const pole = projectToWall(cachedDomain.conePoint, geom);
    const neighborCovs = [];
    cachedDomain.walls.forEach((w, j) => { if (j !== idx) neighborCovs.push(w.cov); });
    const out = [];
    buildClippedFace(geom, pole, neighborCovs, out, 56, 4);
    if (out.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    geomToWorld(g);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        depthWrite: false, depthTest: false
    }));
    m.renderOrder = 5;
    highlightGroup.add(m);
}

// Interior dihedral angle (degrees) between two walls, from their unit Minkowski
// covectors: cos θ = -<W1, W2>. Returns null if the walls don't meet.
function dihedralAngleDeg(c1, c2) {
    const ip = c1.x * c2.x + c1.y * c2.y + c1.z * c2.z - c1.w * c2.w;
    if (Math.abs(ip) > 1 + 1e-6) return null;     // ultraparallel — no shared edge
    return Math.acos(Math.max(-1, Math.min(1, -ip))) * 180 / Math.PI;
}

// --- Exact-arithmetic LaTeX for matrix entries (integers, rationals, √-surds). ---
function gcdInt(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }

// Closest low-denominator rational p/q to x, or null.
function asRational(x, maxDen = 64, tol = 1e-7) {
    for (let q = 1; q <= maxDen; q++) {
        const p = Math.round(x * q);
        if (Math.abs(x - p / q) < tol) {
            const g = gcdInt(p, q);
            return { p: p / g, q: q / g };
        }
    }
    return null;
}

// Pull square factors out of √n → { m, k } meaning m·√k.
function simplifySqrt(n) {
    let m = 1;
    for (let f = 2; f * f <= n; f++) {
        while (n % (f * f) === 0) { n /= f * f; m *= f; }
    }
    return { m, k: n };
}

// Exact LaTeX for a real number (integer / rational / √-surd) or null.
function exactReal(x) {
    if (Math.abs(x) < 1e-9) return '0';
    const rat = asRational(x);
    if (rat) return rat.q === 1 ? `${rat.p}` : `${rat.p < 0 ? '-' : ''}\\tfrac{${Math.abs(rat.p)}}{${rat.q}}`;
    const sq = asRational(x * x);                 // x = ±√(p·q)/q when x² is rational
    if (sq && sq.p > 0) {
        const { m, k } = simplifySqrt(sq.p * sq.q);
        if (k === 1) return null;                 // perfect square → would be rational
        const g = gcdInt(m, sq.q), num = m / g, den = sq.q / g;
        const sign = x < 0 ? '-' : '';
        const rad = num === 1 ? `\\sqrt{${k}}` : `${num}\\sqrt{${k}}`;
        return den === 1 ? `${sign}${rad}` : `${sign}\\tfrac{${rad}}{${den}}`;
    }
    return null;
}

const decReal = (x) => `${+x.toFixed(4)}`;

// LaTeX for a complex matrix entry, exact where recognizable, else decimal.
function exactComplex(z) {
    const re = exactReal(z.re) ?? decReal(z.re);
    if (Math.abs(z.im) < 1e-9) return re;
    const imMag = exactReal(Math.abs(z.im)) ?? decReal(Math.abs(z.im));
    const imTerm = (imMag === '1' ? '' : imMag) + 'i';
    if (Math.abs(z.re) < 1e-9) return (z.im < 0 ? '-' : '') + imTerm;
    return re + (z.im < 0 ? ' - ' : ' + ') + imTerm;
}

function matrixLatex(m) {
    // Orientation-reversing elements act as z ↦ z̄ first: mark them "∘ conj".
    const conj = m.anti ? ' \\circ \\overline{\\phantom{z}}' : '';
    return `\\(\\begin{pmatrix} ${exactComplex(m.a)} & ${exactComplex(m.b)} \\\\ ` +
        `${exactComplex(m.c)} & ${exactComplex(m.d)} \\end{pmatrix}${conj}\\)`;
}

function showFaceInfo(html) {
    const info = document.getElementById('face-info');
    if (!info) return;
    info.innerHTML = html;
    info.style.display = 'block';
    if (window.MathJax && window.MathJax.typesetPromise) window.MathJax.typesetPromise([info]);
}

// Domain edges + finite vertices, computed lazily and cached (invalidated when
// the domain changes). Vertices are the in-ball endpoints of the edge arcs.
function getSkeleton() {
    if (domainSkeleton) return domainSkeleton;
    if (!cachedDomain || cachedDomain.walls.length === 0) {
        domainSkeleton = { edges: [], vertices: [] };
        return domainSkeleton;
    }
    const edges = findEdges(cachedDomain.walls);
    const vertices = [];
    const addV = (p) => {
        if (!p || p.lengthSq() > 0.95) return;      // ideal (cusp) / near-boundary — skip
        // A genuine finite vertex has ≥3 faces meeting at it.
        let nW = 0;
        for (const w of cachedDomain.walls) if (Math.abs(wallSD(p, w.geom)) < 3e-3) nW++;
        if (nW < 3) return;
        for (const q of vertices) if (q.distanceToSquared(p) < 4e-4) return;
        vertices.push(p.clone());
    };
    for (const e of edges) {
        if (e.samples && e.samples.length) { addV(e.samples[0]); addV(e.samples[e.samples.length - 1]); }
    }
    domainSkeleton = { edges, vertices };
    return domainSkeleton;
}

// A glowing tube swept along a polyline (the edge arc), drawn over everything.
function highlightEdge(samples, color) {
    const R = 6, radius = 0.016, m = samples.length;
    if (m < 2) return;
    const positions = [], normals = [], indices = [];
    const perpAxis = (t) => Math.abs(t.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    let prevN = null;
    for (let i = 0; i < m; i++) {
        const p = samples[i];
        const tan = (i === 0 ? samples[1].clone().sub(samples[0])
            : i === m - 1 ? samples[i].clone().sub(samples[i - 1])
                : samples[i + 1].clone().sub(samples[i - 1]));
        if (tan.lengthSq() < 1e-12) tan.set(0, 0, 1);
        tan.normalize();
        let n = prevN ? prevN.clone().addScaledVector(tan, -prevN.dot(tan)) : perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan));
        if (n.lengthSq() < 1e-12) n = perpAxis(tan).addScaledVector(tan, -perpAxis(tan).dot(tan));
        n.normalize();
        prevN = n;
        const b = new THREE.Vector3().crossVectors(tan, n);
        for (let k = 0; k < R; k++) {
            const a = (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            const nx = n.x * ca + b.x * sa, ny = n.y * ca + b.y * sa, nz = n.z * ca + b.z * sa;
            positions.push(p.x + nx * radius, p.y + ny * radius, p.z + nz * radius);
            normals.push(nx, ny, nz);
        }
    }
    for (let i = 0; i < m - 1; i++) {
        for (let k = 0; k < R; k++) {
            const k2 = (k + 1) % R;
            indices.push(i * R + k, i * R + k2, (i + 1) * R + k2, i * R + k, (i + 1) * R + k2, (i + 1) * R + k);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(indices);
    geomToWorld(g);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
        transparent: true, depthTest: false, depthWrite: false
    }));
    mesh.renderOrder = 6;
    highlightGroup.add(mesh);
}

function highlightVertex(v, color) {
    const w = toWorld(v);
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(viewModel === 'uhs' ? 0.03 * Math.max(0.3, w.y) : 0.03, 16, 12),
        new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
            transparent: true, depthTest: false, depthWrite: false
        }));
    mesh.position.copy(w);
    mesh.renderOrder = 6;
    highlightGroup.add(mesh);
}

// Nearest domain vertex to a click, in screen space (front-most within range).
function pickVertex(clientX, clientY) {
    const skel = getSkeleton();
    if (!skel.vertices.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const cx = clientX - rect.left, cy = clientY - rect.top;
    let best = null, bestCam = Infinity;
    for (const v of skel.vertices) {
        const w = toWorld(v);
        const ndc = w.clone().project(camera);
        const px = (ndc.x * 0.5 + 0.5) * rect.width, py = (-ndc.y * 0.5 + 0.5) * rect.height;
        if ((px - cx) ** 2 + (py - cy) ** 2 > VERTEX_PICK_PX * VERTEX_PICK_PX) continue;
        const camDist = w.distanceToSquared(camera.position);
        if (camDist < bestCam) { bestCam = camDist; best = v; }
    }
    return best;
}

function selectVertex(v) {
    focusKind = 'vertex'; focusPoint = v.clone();
    selectedFace = -1;
    highlightGroup.clear();
    highlightVertex(v, 0xfbbf24);
    const nWalls = cachedDomain.walls.filter(w => Math.abs(wallSD(v, w.geom)) < 2e-3).length;
    showFaceInfo(
        `<div class="fi-row"><span class="fi-key">Vertex</span><span>${nWalls} faces meet here</span></div>` +
        `<div class="fi-hint">${showTiling ? 'showing the cells around this vertex' : 'enable Tiling to see the cells around it'}</div>`);
    if (showTiling) updateTiling();
}

function handleFaceClick(idx, shift) {
    const wall = cachedDomain.walls[idx];
    if (shift && selectedFace >= 0 && selectedFace !== idx) {
        // Highlight the EDGE shared by the two faces (and focus the tiling on it).
        const ref = cachedDomain.walls[selectedFace];
        const a = Math.min(selectedFace, idx), b = Math.max(selectedFace, idx);
        const matching = getSkeleton().edges.filter(ed =>
            Math.min(ed.i, ed.j) === a && Math.max(ed.i, ed.j) === b);
        const wA = `\\(${formatWordMathJax(ref.word)}\\)`, wB = `\\(${formatWordMathJax(wall.word)}\\)`;
        highlightGroup.clear();
        if (matching.length) {
            for (const ed of matching) highlightEdge(ed.samples, 0xfde047);
            focusKind = 'edge'; focusPoint = matching[0].mid.clone();
            const ang = matching[0].angle * 180 / Math.PI;
            showFaceInfo(
                `<div class="fi-row"><span class="fi-key">Edge</span><span>${wA} ∩ ${wB}</span></div>` +
                `<div class="fi-angle">∠ = ${ang.toFixed(1)}°<span class="fi-sub"> = ${(ang / 180).toFixed(3)}π</span></div>` +
                (showTiling ? '<div class="fi-hint">showing the cells around this edge</div>' : ''));
        } else {
            // Faces don't share an edge of the domain: report the plane angle only.
            focusKind = 'none'; focusPoint = null;
            addFaceHighlight(selectedFace, 0x38bdf8);
            addFaceHighlight(idx, 0xfbbf24);
            const ang = dihedralAngleDeg(ref.cov, wall.cov);
            const body = ang === null
                ? '<div class="fi-angle">ultraparallel — no shared edge</div>'
                : `<div class="fi-angle">∠ = ${ang.toFixed(1)}°<span class="fi-sub"> (planes, not adjacent)</span></div>`;
            showFaceInfo(`<div class="fi-row"><span class="fi-key">Faces</span><span>${wA} &amp; ${wB}</span></div>${body}`);
        }
        if (showTiling) updateTiling();
        return;
    }
    // Plain click: report the element this face comes from, make it the reference.
    focusKind = 'none'; focusPoint = null;
    selectedFace = idx;
    highlightGroup.clear();
    addFaceHighlight(idx, 0x38bdf8);
    const typeLabel = wall.kind === 'cone' ? 'rotation (stabilizer cone)'
        : (wall.isParabolic ? 'cusp (parabolic)' : 'face pairing');
    const word = `\\(${formatWordMathJax(wall.word)}\\)`;
    const e = wall.elem;
    showFaceInfo(
        `<div class="fi-row"><span class="fi-key">Element</span><span>${word}</span></div>` +
        `<div class="fi-type">${typeLabel}</div>` +
        `<div class="fi-matrix">${matrixLatex(e)}</div>` +
        `<div class="fi-hint">shift-click a neighbour for the edge; click a corner for a vertex</div>`);
    if (showTiling) updateTiling();
}

let pointerDownPos = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('click', (e) => {
    if (animatingIsometry || !cachedDomain) return;
    // Ignore camera drags: only treat near-stationary press/release as a click.
    if (pointerDownPos) {
        const dx = e.clientX - pointerDownPos.x, dy = e.clientY - pointerDownPos.y;
        if (dx * dx + dy * dy > 36) return;
    }
    // A plain click on (or very near) a domain vertex selects that vertex.
    if (!e.shiftKey) {
        const v = pickVertex(e.clientX, e.clientY);
        if (v) { selectVertex(v); return; }
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const idx = findClickedWall(raycaster.ray);
    if (idx < 0) { clearFaceSelection(); if (showTiling) updateTiling(); return; }
    handleFaceClick(idx, e.shiftKey);
});

// --- UI plumbing ---
let metaHeld = false;   // Cmd/Ctrl held → label generators as inverses (g_i^{-1})

function isoLabel(idx) {
    const anti = currentMatrices[idx] && currentMatrices[idx].anti;
    const base = anti
        ? `<span class="anti-gen">g<sub>${idx + 1}</sub></span>`   // overline: reflection
        : `g<sub>${idx + 1}</sub>`;
    return base + (metaHeld ? '<sup>−1</sup>' : '');
}

function updateIsometryButtons() {
    const c = document.getElementById('isometry-controls');
    if (!c) return;
    c.innerHTML = '';
    currentMatrices.forEach((_, idx) => {
        const btn = document.createElement('button');
        btn.className = 'isometry-btn';
        btn.dataset.gen = idx;
        btn.innerHTML = isoLabel(idx);
        btn.addEventListener('click', (e) => animateIsometry(idx, e));
        c.appendChild(btn);
    });
}

function refreshIsoLabels() {
    document.querySelectorAll('#isometry-controls .isometry-btn').forEach(btn => {
        btn.innerHTML = isoLabel(parseInt(btn.dataset.gen, 10));
    });
}

function setMetaHeld(v) {
    if (metaHeld === v) return;
    metaHeld = v;
    refreshIsoLabels();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMetaHeld(true); });
document.addEventListener('keyup', (e) => { if (e.key === 'Meta' || e.key === 'Control') setMetaHeld(false); });
window.addEventListener('blur', () => setMetaHeld(false));


function refreshFromUI() {
    const errorEl = document.getElementById('matrix-error-message');
    try {
        currentMatrices = getMatricesFromUI();
        currentGenerators = [];
        for (const m of currentMatrices) {
            currentGenerators.push(m);
            currentGenerators.push(m.inv().normalized());
        }
        const wordLengthInput = document.getElementById('wordLength');
        if (wordLengthInput) currentDepth = parseInt(wordLengthInput.value) || 8;

        if (errorEl) errorEl.textContent = '';
        viewMatrix = Matrix2x2.identity();
        cumulativeWord = [];

        updateDomain();
        updateIsometryButtons();
        updateStdGeneratorsList();
        if (cayleyMode !== 'off') updateCayley();
        if (dualMode !== 'off') updateDual();
        if (showTiling) updateTiling();
        if (wallsOpacity > 0) updateWalls();
        if (showDust) repositionDust();   // viewMatrix was reset to identity
        if (orbitRun) startOrbit();       // new generators → regrow the orbit
        renderUserElements();             // stored words: recompute their matrices
        runCertifier();
        window.dispatchEvent(new CustomEvent('poincare:refreshed'));
    } catch (e) {
        if (errorEl) errorEl.textContent = e.message;
        console.error('Error parsing matrices:', e);
    }
}

function initUI() {
    setupControlPanel({
        onOpacityChange: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onPolyhedronOpacity: (o) => { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
        onWallsOpacity: (o) => {
            wallsOpacity = o;
            wallsGroup.visible = o > 0;
            wallsGroup.children.forEach(ch => { if (ch.material) ch.material.opacity = o * 0.4; });
            if (o > 0 && wallsGroup.children.length === 0) updateWalls();
        },
        onCayleyModeChange: (mode) => {
            cayleyMode = mode;
            cayleyGroup.visible = mode !== 'off';
            if (mode !== 'off') updateCayley();
        },
        onDualModeChange: (mode) => {
            dualMode = mode;
            dualGroup.visible = mode !== 'off';
            const row = document.getElementById('dual-opacity-row');
            if (row) row.classList.toggle('disabled', mode === 'off');
            updateDual();   // clears when off, rebuilds otherwise
        },
        onDualOpacityChange: (o) => {
            dualOpacity = o;
            dualGroup.children.forEach(ch => { if (ch.material) ch.material.opacity = o; });
        },
        onTiedyeToggle: (btn) => {
            showTiedye = !showTiedye;
            material.uniforms.u_showTiling.value = showTiedye;
            updateToggleBtn(btn, showTiedye);
        },
        onAutoRotateToggle: (btn) => {
            controls.autoRotate = !controls.autoRotate;
            updateToggleBtn(btn, controls.autoRotate);
        },
        onResetCamera: (autoRotateBtn) => {
            if (viewModel === 'uhs') {
                camera.position.set(0.3, 4.8, 0.4);
                controls.target.set(0, 0.45, 0);
            } else {
                camera.position.set(2.5, 1.5, 2.5);
                controls.target.set(0, 0, 0);
            }
            controls.autoRotate = false;
            updateToggleBtn(autoRotateBtn, false);
        },
        onFaceCountChange: (count) => {
            currentMaxFaces = count;
            updateDomain();
            updateStdGeneratorsList();
            if (dualMode !== 'off') updateDual();
            if (showTiling) updateTiling();
            runCertifier();
        },
        onWordLengthChange: (depth) => {
            currentDepth = depth;
            updateDomain();
            updateStdGeneratorsList();
            if (cayleyMode !== 'off') updateCayley();
            if (dualMode !== 'off') updateDual();
            if (showTiling) updateTiling();
            if (wallsOpacity > 0) updateWalls();
            runCertifier();
        },
        onPaletteChange: (paletteKey) => {
            const p = colorPalettes[paletteKey];
            material.uniforms.u_colorMode.value = p.mode;
            material.uniforms.u_colorOffset.value.copy(p.offset);
            material.uniforms.u_colorFreq.value = p.freq;
        },
        controls, mesh, cayleyGroup, material
    });

    const mirrorBtn = document.getElementById('toggle-mirror');
    if (mirrorBtn) {
        mirrorBtn.addEventListener('click', () => { if (!mirrorBtn.disabled) setMirrorMode(!mirrorMode); });
    }

    const uhsBtn = document.getElementById('view-uhs');
    if (uhsBtn) {
        uhsBtn.disabled = false;
        uhsBtn.removeAttribute('title');
        uhsBtn.addEventListener('click', () => setViewModel(viewModel === 'uhs' ? 'ball' : 'uhs'));
    }

    const fullDomainBtn = document.getElementById('toggle-full-domain');
    if (fullDomainBtn) {
        fullDomainBtn.addEventListener('click', () => {
            fullDirichlet = !fullDirichlet;
            updateToggleBtn(fullDomainBtn, fullDirichlet);
            updateDomain();
            updateStdGeneratorsList();
            if (wallsOpacity > 0) updateWalls();
            if (dualMode !== 'off') updateDual();
            if (showTiling) updateTiling();
            runCertifier();
        });
    }

    const tilingBtn = document.getElementById('toggle-tiling');
    if (tilingBtn) {
        tilingBtn.addEventListener('click', () => {
            showTiling = !showTiling;
            updateToggleBtn(tilingBtn, showTiling);
            tilingGroup.visible = showTiling;
            updateTiling();
        });
    }

    // --- Exact arithmetic (Group tab) ---
    const exactBtn = document.getElementById('toggle-exact');
    const exactPanel = document.getElementById('exact-field-panel');
    const fieldErr = document.getElementById('field-error');
    const rootSel = document.getElementById('field-root');
    let exactOn = false;
    let currentField = null;
    // Optional σ(w) expression for complex conjugation (needed for exact mode
    // with orientation-reversing generators). Presets supply it via the
    // 'poincare:set-exact' event; real roots and degree-2 fields auto-detect.
    let pendingConjExpr = null;

    const fmtRoot = (gen, r) => {
        const re = r.re.toFixed(6), im = Math.abs(r.im).toFixed(6);
        if (r.im === 0) return `${gen} ≈ ${re}`;
        return `${gen} ≈ ${re} ${r.im > 0 ? '+' : '−'} ${im}i`;
    };

    // Try to configure conjugation on the field for the CURRENT root; failure
    // is silent here (only exact+z̄ parsing needs σ, and it reports clearly).
    function applyConj(field) {
        try {
            field.setConjugation(pendingConjExpr);
        } catch (e) {
            field.conjPowers = null;
            field.conjIsIdentity = false;
        }
    }

    function rebuildField() {
        if (!exactOn) {
            currentField = null;
            configureExact(null);
            refreshFromUI();
            return;
        }
        const gen = (document.getElementById('field-gen-name').value || 'w').trim();
        const mp = (document.getElementById('field-minpoly').value || gen).trim();
        try {
            const poly = parsePoly(mp, gen);
            const field = new NumberField(poly, gen);
            const prev = parseInt(rootSel.value || '0', 10) || 0;
            rootSel.innerHTML = '';
            field.roots.forEach((r, i) => {
                const o = document.createElement('option');
                o.value = String(i);
                o.textContent = fmtRoot(gen, r);
                rootSel.appendChild(o);
            });
            field.rootIndex = Math.min(prev, field.roots.length - 1);
            rootSel.value = String(field.rootIndex);
            if (fieldErr) fieldErr.textContent = '';
            applyConj(field);
            currentField = field;
            configureExact(field);
        } catch (e) {
            if (fieldErr) fieldErr.textContent = e.message;
            currentField = null;
            configureExact(null);
        }
        refreshFromUI();
    }

    if (exactBtn) {
        exactBtn.addEventListener('click', () => {
            exactOn = !exactOn;
            updateToggleBtn(exactBtn, exactOn);
            if (exactPanel) exactPanel.style.display = exactOn ? 'block' : 'none';
            rebuildField();
        });
        ['field-gen-name', 'field-minpoly'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', rebuildField);
        });
        if (rootSel) {
            rootSel.addEventListener('change', () => {
                if (!currentField) return;
                currentField.rootIndex = parseInt(rootSel.value, 10) || 0;
                applyConj(currentField);
                configureExact(currentField);
                refreshFromUI();   // embedding changed → all floats change
            });
        }
    }

    // Presets configure exact mode programmatically:
    //   detail = { gen?, minpoly, root: {re, im}?, conj? }  → enable with field
    //   detail = null                                       → disable
    window.addEventListener('poincare:set-exact', (ev) => {
        if (!exactBtn) return;
        const spec = ev.detail;
        if (!spec) {
            if (exactOn) {
                exactOn = false;
                updateToggleBtn(exactBtn, false);
                if (exactPanel) exactPanel.style.display = 'none';
                pendingConjExpr = null;
                rebuildField();
            }
            return;
        }
        const genEl = document.getElementById('field-gen-name');
        const mpEl = document.getElementById('field-minpoly');
        if (genEl) genEl.value = spec.gen || 'w';
        if (mpEl) mpEl.value = spec.minpoly;
        pendingConjExpr = spec.conj || null;
        exactOn = true;
        updateToggleBtn(exactBtn, true);
        if (exactPanel) exactPanel.style.display = 'block';
        rebuildField();
        // Choose the embedding nearest the preset's root hint.
        if (spec.root && currentField) {
            let best = 0, bd = Infinity;
            currentField.roots.forEach((r, i) => {
                const d = Math.hypot(r.re - spec.root.re, r.im - spec.root.im);
                if (d < bd) { bd = d; best = i; }
            });
            if (best !== currentField.rootIndex) {
                currentField.rootIndex = best;
                rootSel.value = String(best);
                applyConj(currentField);
                configureExact(currentField);
                refreshFromUI();
            }
        }
    });

    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.addEventListener('click', () => setTheme(btn.dataset.theme));
    });

    // --- Define / store elements (Domain tab) ---
    const wordInput = document.getElementById('word-input');
    const wordErr = document.getElementById('word-error');
    const setWordError = (msg) => { if (wordErr) wordErr.textContent = msg || ''; };
    const addElement = (word) => {
        userElements.push({ word });
        setWordError('');
        renderUserElements();
    };
    const storeTyped = () => {
        if (!wordInput) return;
        try {
            const w = parseWord(wordInput.value, currentMatrices.length);
            if (w.length === 0) throw new Error('type a word first, e.g. “a b A B”');
            addElement(w);
            wordInput.value = '';
        } catch (e) {
            setWordError(e.message);
        }
    };
    document.getElementById('word-store')?.addEventListener('click', storeTyped);
    wordInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); storeTyped(); }
    });
    wordInput?.addEventListener('input', () => setWordError(''));
    document.getElementById('word-from-current')?.addEventListener('click', () => {
        const w = reduceWord(cumulativeWord);
        if (w.length === 0) { setWordError('the current element is the identity'); return; }
        addElement([...w]);
    });
    renderUserElements();

    const orbitBtn = document.getElementById('toggle-orbit');
    if (orbitBtn) {
        orbitBtn.addEventListener('click', () => {
            const on = !orbitRun;
            updateToggleBtn(orbitBtn, on);
            if (on) startOrbit(); else stopOrbit();
        });
    }

    const dustBtn = document.getElementById('toggle-dust');
    if (dustBtn) {
        dustBtn.addEventListener('click', () => {
            showDust = !showDust;
            updateToggleBtn(dustBtn, showDust);
            dustGroup.visible = showDust;
            if (showDust) dustPoints = null;   // fresh scatter each time it's turned on
            updateDust();
        });
    }

    const exportBtn = document.getElementById('export-3mf');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (exportBtn.disabled) return;
            const label = exportBtn.textContent;
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting…';
            try {
                // Yield a frame so the button repaints before the mesh build
                await new Promise(r => setTimeout(r, 30));
                const { vertices, triangles } = await exportDomainAs3MF(cachedDomain);
                console.log(`3MF export: ${vertices} vertices, ${triangles} triangles`);
            } catch (e) {
                console.error('3MF export failed:', e);
                setBanner('warning', '3MF export failed: ' + e.message);
            } finally {
                exportBtn.disabled = false;
                exportBtn.textContent = label;
            }
        });
    }
}

function animate(time) {
    requestAnimationFrame(animate);
    controls.update();
    if (orbitRun && orbitRun.dirty) updateOrbitInstances(time);
    material.uniforms.u_cameraPos.value.copy(camera.position);
    material.uniforms.u_time.value = time * 0.001;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

// --- Tutorial / embed API (MathFest talk) ---
// A minimal programmatic surface for the step-through tutorial (tutorial.js):
// the same knobs the control panel drives, plus read access to current state.
// Everything geometric that tutorial.js needs beyond this it imports from
// math.js directly.
window.PoincareAPI = {
    THREE, scene, camera, controls,
    refresh: refreshFromUI,
    state: () => ({
        domain: cachedDomain,
        matrices: currentMatrices,
        stdGenerators,
        viewMatrix,
    }),
    isAnimating: () => animatingIsometry,
    isViewDirty: () => {
        const m = viewMatrix, tol = 1e-9;
        return Math.abs(m.a.re - 1) > tol || Math.abs(m.a.im) > tol ||
            Math.abs(m.b.re) > tol || Math.abs(m.b.im) > tol ||
            Math.abs(m.c.re) > tol || Math.abs(m.c.im) > tol ||
            Math.abs(m.d.re - 1) > tol || Math.abs(m.d.im) > tol;
    },
    setPolyhedronOpacity(o) { material.uniforms.u_opacity.value = o; mesh.visible = o > 0; },
    // Hide the carved domain while keeping the ambient ball: zero the face count.
    setDomainVisible(v) {
        material.uniforms.u_faceCount.value = (v && cachedDomain) ? cachedDomain.count : 0;
    },
    setWallsOpacity(o) {
        wallsOpacity = o;
        wallsGroup.visible = o > 0;
        if (o > 0 && wallsGroup.children.length === 0) updateWalls();
        wallsGroup.children.forEach(ch => { if (ch.material) ch.material.opacity = o * 0.4; });
    },
    setCayleyMode(mode) {
        cayleyMode = mode;
        cayleyGroup.visible = mode !== 'off';
        if (mode !== 'off') updateCayley(); else disposeGroup(cayleyGroup);
    },
    setTiling(on) { showTiling = on; tilingGroup.visible = on; updateTiling(); },
    setDual(mode) {
        dualMode = mode;
        dualGroup.visible = mode !== 'off';
        const row = document.getElementById('dual-opacity-row');
        if (row) row.classList.toggle('disabled', mode === 'off');
        updateDual();
    },
    setMirror(on) { if (on !== mirrorMode) setMirrorMode(on); },
    setTheme,
    getTheme: () => themeMode,
    setOrbit(on) {
        if (on) startOrbit(); else stopOrbit();
        updateToggleBtn(document.getElementById('toggle-orbit'), !!on);
    },
    orbitSize: () => (orbitRun ? orbitRun.mats.length : 0),
    setDust(on) {
        showDust = on;
        dustGroup.visible = on;
        if (on) dustPoints = null;
        updateDust();
        updateToggleBtn(document.getElementById('toggle-dust'), on);
    },
    setAutoRotate(on, speed = 1.0) { controls.autoRotate = on; controls.autoRotateSpeed = speed; },
    geodesic: getHyperbolicGeodesic,
    // Bisector wall Bis(p1, p2) as a mesh (caller owns it; not tied to wallsGroup).
    buildBisectorMesh(p1, p2, color, opacity) {
        const cov = bisectorCov(p1, p2);
        if (!cov) return null;
        const saved = wallsOpacity;
        wallsOpacity = opacity / 0.4;   // createWallMesh bakes opacity*0.4
        const m = createWallMesh({ geom: covToGeom(cov) }, color);
        wallsOpacity = saved;
        return m;
    },
    animateMatrix,                              // (g, word, onDone)
    animateGenerator: animateIsometry,          // (genIndex, event?)
    animateFacePairing: animateStdGenerator,    // (idx, event?)
};

// Remote joystick: the deck forwards {type:'orbit', dx, dy} from the phone;
// nudge the camera around the target in spherical coordinates.
window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'orbit') return;
    controls.autoRotate = false;
    const offset = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= (d.dx || 0) * 0.006;
    sph.phi = Math.max(0.05, Math.min(Math.PI - 0.05, sph.phi - (d.dy || 0) * 0.006));
    camera.position.setFromSpherical(sph).add(controls.target);
});

initUI();
setupMatrixInput(refreshFromUI);
setTimeout(refreshFromUI, 200);
animate(0);
