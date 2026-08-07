/**
 * tutorial.js — step-through tutorial mode for the MathFest talk.
 *
 * Loaded only with ?tutorial=true (see index.html). Drives the visualizer
 * through a fixed sequence of prepared states, each with a one-line caption,
 * advanced by the phone remote (postMessage {type:'tutorial', cmd}) or the
 * arrow keys. See TUTORIAL.md for the design.
 *
 * Steps are declarative and idempotent: applyStep(k) fully reconstructs the
 * state for step k, so prev/reset are trivial and free mouse exploration
 * can't wedge the sequence. `enter` effects (animations) play only when a
 * step is reached by moving forward.
 */

import * as THREE from 'three';
import { applyMatrixToBall } from './math.js';
import { exampleLibrary } from './groupLibrary.js';

const FIG8 = 'Figure eight knot group';
const LONGREID = 'Long-Reid Group';

const ACCENT = 0x7c8aff;
const AMBER = 0xfbbf24;
const ROSE = 0xf472b6;

// ---------------------------------------------------------------- steps ---

const STEPS = [
    {
        caption: 'Hyperbolic 3-space, packed into a ball — distances blow up near the boundary.',
        state: { group: FIG8, domain: false, autoRotate: 0.5 },
    },
    {
        caption: 'A group of isometries of this space, given by two matrices.',
        state: { group: FIG8, domain: false, autoRotate: 0.5, marker: true, card: true },
    },
    {
        caption: 'One element \\(g\\) moves the basepoint \\(x_0\\) to \\(g\\,x_0\\).',
        state: { group: FIG8, domain: false, marker: true, card: true, image: true, trail: true },
        enter: animateBasepointFlight,
    },
    {
        caption: 'Halfway in between: the wall of points equidistant from \\(x_0\\) and \\(g\\,x_0\\).',
        state: { group: FIG8, domain: false, marker: true, card: true, image: true, trail: true, bisector: true },
        enter: fadeInBisector,
    },
    {
        caption: 'Every group element contributes a wall…',
        state: { group: FIG8, domain: false, marker: true, card: true, walls: 0.7 },
        enter: fadeInWalls,
    },
    {
        caption: '…and the region inside them all is the <strong>Dirichlet domain</strong> — one tile of the tessellation.',
        state: { group: FIG8, domain: true },
        enter: fadeOutWallsIntoDomain,
    },
    {
        caption: 'Faces come in pairs — each pairing is a generator, recovered from pure geometry.',
        state: { group: FIG8, domain: true },
        enter: playFacePairings,
    },
    {
        caption: 'Turn the walls into <strong>mirrors</strong> — the reflections carry one tile to the whole tessellation.',
        state: { group: FIG8, domain: true, mirror: true, autoRotate: 0.4 },
    },
    {
        caption: 'The pattern of tiles <em>is</em> the group: its Cayley graph, drawn in hyperbolic space.',
        state: { group: FIG8, domain: true, cayley: 'S', tiling: true },
    },
    {
        caption: 'And this is the group we were hunting in Part I — the search and the geometry meet.',
        state: { group: LONGREID, domain: true, cayley: 'S', autoRotate: 0.5 },
    },
];

// ---------------------------------------------------------------- state ---

let api = null;                 // window.PoincareAPI
let step = -1;
let busy = false;               // a step application (incl. group load) in flight
let applySeq = 0;               // staleness token for enter-effect chains
let currentGroup = null;        // name of the group currently loaded
let overlay = null;             // THREE.Group for markers / trail / bisector
let bisectorMesh = null;

const ui = {};                  // caption / counter / matrices card elements

// ------------------------------------------------------------- boot -------

function whenReady(fn) {
    // main.js dispatches 'poincare:refreshed' after its initial refresh.
    if (window.PoincareAPI && window.PoincareAPI.state().domain) { fn(); return; }
    const onRef = () => { window.removeEventListener('poincare:refreshed', onRef); fn(); };
    window.addEventListener('poincare:refreshed', onRef);
    // Pre-hide the polyhedron as soon as the API exists so the workbench's
    // initial domain never flashes before step 0 applies.
    const hide = setInterval(() => {
        if (window.PoincareAPI) {
            window.PoincareAPI.setPolyhedronOpacity(0);
            clearInterval(hide);
        }
    }, 20);
}

whenReady(() => {
    api = window.PoincareAPI;
    currentGroup = FIG8;        // main.js loads the figure-eight group by default
    overlay = new THREE.Group();
    api.scene.add(overlay);
    buildUI();
    wireInput();
    goTo(0, false);
});

// ---------------------------------------------------------------- UI ------

function buildUI() {
    const cap = document.createElement('div');
    cap.id = 'tutorial-caption';
    cap.innerHTML = '<span id="tutorial-caption-text"></span><span id="tutorial-counter"></span>';
    document.body.appendChild(cap);
    ui.caption = cap;
    ui.captionText = cap.querySelector('#tutorial-caption-text');
    ui.counter = cap.querySelector('#tutorial-counter');

    const card = document.createElement('div');
    card.id = 'tutorial-matrices';
    document.body.appendChild(card);
    ui.card = card;
}

function typeset(el) {
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([el]).catch(() => { });
    }
}

function setCaption(html) {
    ui.captionText.innerHTML = html;
    ui.counter.textContent = `${step + 1} / ${STEPS.length}`;
    typeset(ui.caption);
}

function setMatricesCard(show, groupName) {
    if (!show) { ui.card.style.display = 'none'; return; }
    const ex = exampleLibrary.find(e => e.name === groupName);
    if (!ex) { ui.card.style.display = 'none'; return; }
    ui.card.innerHTML = ex.mats.map((m, i) =>
        `<div class="tut-mat">\\(g_{${i + 1}} = \\begin{pmatrix} ${m[0]} & ${m[1]} \\\\ ${m[2]} & ${m[3]} \\end{pmatrix}\\)</div>`
    ).join('');
    ui.card.style.display = 'block';
    typeset(ui.card);
}

// ------------------------------------------------------------ overlay -----

function basepoint() {
    const d = api.state().domain;
    const p = (d && (d.basepoint || d.conePoint)) || { x: 0, y: 0, z: 0 };
    return new THREE.Vector3(p.x, p.y, p.z);
}

function imagePoint() {
    const g = api.state().matrices[0];
    if (!g) return basepoint();
    const q = applyMatrixToBall(g, basepoint());
    return new THREE.Vector3(q.x, q.y, q.z);
}

function makeMarker(p, color, r = 0.035) {
    const m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 20, 14),
        new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.7,
            roughness: 0.3, metalness: 0.1, transparent: true, depthWrite: false
        }));
    m.position.copy(p);
    m.renderOrder = 5;
    return m;
}

function makeTrail(p1, p2, color) {
    const pts = api.geodesic(p1, p2, 48);
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.9, depthWrite: false
    }));
    line.renderOrder = 4;
    return line;
}

// A glassy stand-in for the ideal boundary, shown while the raymarched
// domain is hidden (the shader renders black with zero faces).
function makeBallShell() {
    const shell = new THREE.Group();
    const geom = new THREE.SphereGeometry(1, 64, 48);
    shell.add(new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
        color: 0x16204a, emissive: 0x0a1128, emissiveIntensity: 0.5,
        roughness: 0.35, metalness: 0.1,
        transparent: true, opacity: 0.16, depthWrite: false
    })));
    const grid = new THREE.Mesh(
        new THREE.SphereGeometry(0.999, 36, 24),
        new THREE.MeshBasicMaterial({
            color: 0x7c8aff, wireframe: true,
            transparent: true, opacity: 0.05, depthWrite: false
        }));
    shell.add(grid);
    return shell;
}

// Rebuild the overlay to match a step's flags (static version — enter
// effects animate on top of this).
function buildOverlay(s) {
    overlay.clear();
    bisectorMesh = null;
    if (!s.domain) overlay.add(makeBallShell());
    if (!s.marker) return;
    const q0 = basepoint();
    overlay.add(makeMarker(q0, AMBER));
    if (s.trail || s.image) {
        const q1 = imagePoint();
        if (s.trail) overlay.add(makeTrail(q0, q1, AMBER));
        if (s.image) overlay.add(makeMarker(q1, ROSE));
    }
    if (s.bisector) {
        bisectorMesh = api.buildBisectorMesh(q0, imagePoint(), ACCENT, 0.45);
        if (bisectorMesh) overlay.add(bisectorMesh);
    }
}

// ------------------------------------------------------- enter effects ----

// Tween helper bound to the current applySeq (a stale tween stops itself).
function tween(ms, onFrame, onDone) {
    const seq = applySeq;
    const t0 = performance.now();
    const tick = (now) => {
        if (seq !== applySeq) return;
        const t = Math.min((now - t0) / ms, 1);
        onFrame(t * t * (3 - 2 * t));
        if (t < 1) requestAnimationFrame(tick);
        else if (onDone) onDone();
    };
    requestAnimationFrame(tick);
}

function animateBasepointFlight() {
    // Rebuild without the end state, then fly a marker along the geodesic.
    overlay.clear();
    overlay.add(makeBallShell());
    const q0 = basepoint(), q1 = imagePoint();
    overlay.add(makeMarker(q0, AMBER));
    const flyer = makeMarker(q0.clone(), ROSE);
    overlay.add(flyer);
    const path = api.geodesic(q0, q1, 64);
    const trail = makeTrail(q0, q1, AMBER);
    trail.material.opacity = 0;
    overlay.add(trail);
    tween(1400, (e) => {
        const i = Math.min(path.length - 1, Math.floor(e * (path.length - 1)));
        flyer.position.copy(path[i]);
        trail.material.opacity = 0.9 * e;
    });
}

function fadeInBisector() {
    if (!bisectorMesh) return;
    const target = bisectorMesh.material.opacity;
    bisectorMesh.material.opacity = 0;
    tween(700, (e) => { bisectorMesh.material.opacity = target * e; });
}

function fadeInWalls() {
    tween(900, (e) => api.setWallsOpacity(0.7 * e));
}

function fadeOutWallsIntoDomain() {
    api.setWallsOpacity(0.7);
    tween(900, (e) => api.setWallsOpacity(0.7 * (1 - e)));
}

function playFacePairings() {
    // Roll the domain across a face and back, then across a second face.
    const seq = applySeq;
    const gens = api.state().stdGenerators.filter(g => !g.unpaired);
    if (gens.length === 0) return;
    const play = (i, rest) => {
        if (seq !== applySeq || i >= gens.length) return;
        api.animateMatrix(gens[i].matrix, [...gens[i].word], () => {
            if (seq !== applySeq || rest.length === 0) return;
            setTimeout(() => play(rest[0], rest.slice(1)), 500);
        });
    };
    play(0, gens.length > 1 ? [1] : []);
}

// ----------------------------------------------------------- stepping -----

function loadGroup(name) {
    return new Promise((resolve) => {
        if (currentGroup === name && !api.isViewDirty()) { resolve(); return; }
        if (currentGroup === name) {           // same group, drifted view: just reset
            api.refresh();
            currentGroup = name;
            resolve();
            return;
        }
        const idx = exampleLibrary.findIndex(e => e.name === name);
        if (idx < 0) { resolve(); return; }
        const onRef = () => {
            window.removeEventListener('poincare:refreshed', onRef);
            currentGroup = name;
            resolve();
        };
        window.addEventListener('poincare:refreshed', onRef);
        const sel = document.getElementById('matrix-example-select');
        sel.value = String(idx);
        sel.dispatchEvent(new Event('change'));   // setExample + deferred refresh
    });
}

const LOG = (window.__tutLog = []);

async function applyStep(k, animate) {
    LOG.push(`applyStep(${k}, ${animate}) from step=${step} t=${Math.round(performance.now())}`);
    busy = true;
    applySeq++;
    const { state: s, caption, enter } = STEPS[k];
    step = k;
    setCaption(caption);
    setMatricesCard(!!s.card, s.group);
    try {
        await loadGroup(s.group);
        // Visual flags — after the group load, since refresh resets some of them.
        // While the domain is hidden the overlay's ball shell stands in for the
        // ideal boundary (the raymarch shader renders black with zero faces).
        api.setPolyhedronOpacity(s.domain ? 1 : 0);
        api.setDomainVisible(!!s.domain);
        api.setWallsOpacity(animate && enter ? 0 : (s.walls || 0));
        api.setCayleyMode(s.cayley || 'off');
        api.setTiling(!!s.tiling);
        api.setMirror(!!s.mirror);
        api.setAutoRotate(!!s.autoRotate, s.autoRotate || 1);
        buildOverlay(s);
        if (animate && enter) enter();
    } finally {
        busy = false;
    }
}

function goTo(k, animate = true) {
    if (k < 0 || k >= STEPS.length || busy) return;
    applyStep(k, animate && k > step);
}

function next() {
    if (step >= STEPS.length - 1) { toDeck('next'); return; }
    goTo(step + 1);
}

function prev() {
    if (step <= 0) { toDeck('prev'); return; }
    goTo(step - 1);
}

function toDeck(direction) {
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'iframeNav', direction }, '*');
    }
}

// ------------------------------------------------------------- input ------

// A command that arrives mid-animation is queued (latest wins) and flushed
// as soon as the tool is free — a presenter's tap must never be swallowed.
let pending = null;

function runCmd(cmd) {
    if (cmd === 'next') next();
    else if (cmd === 'prev') prev();
    else if (cmd === 'reset') goTo(0, false);
}

function requestCmd(cmd) {
    LOG.push(`requestCmd(${cmd}) busy=${busy} anim=${api.isAnimating()} step=${step} t=${Math.round(performance.now())}`);
    if (busy || api.isAnimating()) { pending = cmd; return; }
    runCmd(cmd);
}

setInterval(() => {
    if (pending && api && !busy && !api.isAnimating()) {
        const cmd = pending;
        pending = null;
        runCmd(cmd);
    }
}, 150);

function wireInput() {
    window.addEventListener('message', (e) => {
        const d = e.data;
        if (!d || d.type !== 'tutorial') return;
        if (d.cmd === 'next' || d.cmd === 'prev' || d.cmd === 'reset') requestCmd(d.cmd);
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
            e.preventDefault(); e.stopPropagation(); requestCmd('next');
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault(); e.stopPropagation(); requestCmd('prev');
        } else if (e.key === 'Home') {
            e.preventDefault(); requestCmd('reset');
        }
    }, true);
}
