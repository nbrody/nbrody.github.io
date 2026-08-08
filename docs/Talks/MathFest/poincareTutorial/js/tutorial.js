/**
 * tutorial.js — step-through tutorial mode for the MathFest talk.
 *
 * Loaded only with ?tutorial=true (see index.html). Drives the visualizer
 * through a fixed sequence of prepared states, each with a one-line caption,
 * advanced by the phone remote (postMessage {type:'tutorial', cmd}), the
 * arrow keys, or the ‹ › buttons in the caption bar. See TUTORIAL.md.
 *
 * The eleven steps tell one story on the figure-eight knot group:
 *   dust → exact matrices → isometries → orbit → Cayley graph →
 *   dual bisectors → the Dirichlet domain → face pairings →
 *   Poincaré Polyhedron Theorem → presentation + certificate → mirrors.
 *
 * Steps are declarative and idempotent: applyStep(k) fully reconstructs the
 * state for step k, so prev/reset are trivial and free mouse exploration
 * can't wedge the sequence. Expensive toggles (dust, orbit, Cayley, dual)
 * are only touched when their value actually changes, so stepping doesn't
 * needlessly regrow or rebuild. `enter` effects play only moving forward.
 */

import * as THREE from 'three';
import { exampleLibrary } from './groupLibrary.js';

const FIG8 = 'Figure eight knot group';

// ---------------------------------------------------------------- steps ---

const STEPS = [
    {   // (1) hyperbolic dust
        caption: 'Hyperbolic space, filled with dust.',
        state: { dust: true, autoRotate: 0.5 },
    },
    {   // (2) entering matrices, exact entries
        caption: 'We can choose some generating matrices, and consider the group they generate.' +
            'Here, we choose \\(w=\\frac{-1+\\sqrt{-3}}{2}\\), and the matrices are defined over in \\(\\mathbb{Q}(w)\\).',
        state: { dust: true, card: true, autoRotate: 0.35, exact: true },
    },
    {   // (3) the isometries they determine — interactive
        caption: 'Each matrix determines an isometry of hyperbolic space.',
        state: { dust: true, isoCard: true, exact: true },
    },
    {   // (4) growing the orbit
        caption: 'Grow the <strong>orbit</strong> of a basepoint: repeatedly apply the ' +
            'generators and their inverses.',
        state: { orbit: true, exact: true },
    },
    {   // (5) Cayley graph
        caption: 'Join each orbit point to its neighbours: the <strong>Cayley graph</strong> ' +
            'of the group, drawn in hyperbolic space.',
        state: { orbit: true, cayley: 'S', exact: true },
    },
    {   // (6) dual bisectors
        caption: 'Each pair of points determines a bisector plane',
        state: { cayley: 'S', dual: 'S', exact: true },
    },
    {   // (7) intersect → polyhedron
        caption: 'Intersect the half-spaces cut out by the bisectors to obtain the Dirichlet domain.',
        state: { domain: true, exact: true },
        enter: fadeInDomain,
    },
    {   // (8) face pairings
        caption: 'The domain comes with face-pairings, each of which is a word in the original generators.',
        state: { domain: true, exact: true },
        enter: playFacePairings,
    },
    {   // (9) Poincaré Polyhedron Theorem
        caption: 'The <strong>Poincaré Polyhedron Theorem</strong> determines whether this group is discrete.',
        state: { domain: true, theoremCard: true, autoRotate: 0.3, exact: true },
    },
    {   // (10) presentation + certificate
        caption: 'We obtain a <strong>presentation</strong> of the group, and a certificate of discreteness.',
        state: { domain: true, presCard: true, autoRotate: 0.3, exact: true },
    },
    {   // (11) mirrors, just for fun
        caption: 'And just for fun — we can make the walls one-way mirrors.',
        state: { domain: true, mirror: true, autoRotate: 0.4, exact: true },
    },
];

// ---------------------------------------------------------------- state ---

let api = null;                 // window.PoincareAPI
let step = -1;
let busy = false;               // a step application in flight
let applySeq = 0;               // staleness token for enter-effect chains
let overlay = null;             // THREE.Group for the ball shell

// Expensive toggles, applied only on change.
const cur = { dust: null, orbit: null, cayley: null, dual: null, tiling: null };

const ui = {};                  // caption / cards

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
    cap.innerHTML =
        '<button id="tut-prev" class="tut-arrow" aria-label="Previous step">&lsaquo;</button>' +
        '<span id="tutorial-caption-text"></span>' +
        '<span id="tutorial-counter"></span>' +
        '<button id="tut-next" class="tut-arrow" aria-label="Next step">&rsaquo;</button>';
    document.body.appendChild(cap);
    ui.caption = cap;
    ui.captionText = cap.querySelector('#tutorial-caption-text');
    ui.counter = cap.querySelector('#tutorial-counter');
    cap.querySelector('#tut-prev').addEventListener('click', () => requestCmd('prev'));
    cap.querySelector('#tut-next').addEventListener('click', () => requestCmd('next'));

    for (const id of ['tutorial-matrices', 'tutorial-iso', 'tutorial-theorem', 'tutorial-pres']) {
        const card = document.createElement('div');
        card.id = id;
        card.style.display = 'none';
        document.body.appendChild(card);
    }
    ui.card = document.getElementById('tutorial-matrices');
    ui.iso = document.getElementById('tutorial-iso');
    ui.theorem = document.getElementById('tutorial-theorem');
    ui.pres = document.getElementById('tutorial-pres');

    ui.iso.innerHTML =
        ISO_DEMOS.map((d, i) =>
            `<button class="tut-iso-chip" data-iso="${i}">` +
            `<span class="tut-iso-mat">\\(${d.latex}\\)</span>` +
            `<span class="tut-iso-type">${d.type}</span></button>`
        ).join('') +
        '<div class="tut-iso-hint">click to apply · ⌘-click for the inverse</div>';
    ui.iso.querySelectorAll('.tut-iso-chip').forEach((btn) => {
        btn.addEventListener('click', (e) => applyIsoDemo(ISO_DEMOS[+btn.dataset.iso], e));
    });
    typeset(ui.iso);

    ui.theorem.innerHTML =
        '<div class="tut-thm-title">Poincaré Polyhedron Theorem</div>' +
        '<p>Suppose a polyhedron \\(P\\) comes with isometries pairing its faces, and around ' +
        'every edge the dihedral angles sum to \\(2\\pi/m\\), with the cycle transformation ' +
        'of order \\(m\\).</p>' +
        '<p>Then the pairings generate a <strong>discrete</strong> group \\(\\Gamma\\) with ' +
        '\\(P\\) as fundamental polyhedron — and the pairings and edge cycles give a ' +
        '<strong>presentation</strong> of \\(\\Gamma\\).</p>';
    typeset(ui.theorem);
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

// The matrices card reads the LIVE inputs, so after the exact-mode rewrite
// it shows the entry as `w` rather than the preset's decimal-free surd.
function setMatricesCard(show) {
    if (!show) { ui.card.style.display = 'none'; return; }
    const blocks = document.querySelectorAll('#matrixInputs .matrix-block');
    const rows = [];
    blocks.forEach((block, i) => {
        const latex = [...block.querySelectorAll('.mq-matrix-input')].map(sp => {
            try { return sp.MathQuill ? sp.MathQuill().latex() || '0' : '0'; }
            catch (e) { return '0'; }
        });
        if (latex.length === 4) {
            rows.push(`<div class="tut-mat">\\(g_{${i + 1}} = \\begin{pmatrix} ` +
                `${latex[0]} & ${latex[1]} \\\\ ${latex[2]} & ${latex[3]} \\end{pmatrix}\\)</div>`);
        }
    });
    ui.card.innerHTML = rows.join('');
    ui.card.style.display = 'block';
    typeset(ui.card);
}

// Presentation + certificate card: lift the already-typeset presentation
// out of the (hidden) Domain panel, topped with the certificate verdict.
function setPresCard(show) {
    if (!show) { ui.pres.style.display = 'none'; return; }
    const src = document.getElementById('presentation-display');
    const banner = document.getElementById('status-banner');
    let head = '';
    if (banner && banner.textContent.trim()) {
        const tone = banner.className.includes('verified') ? 'ok'
            : banner.className.includes('failed') ? 'bad' : 'warn';
        head = `<div class="tut-cert tut-cert-${tone}">` +
            `${banner.textContent.replace(/×\s*$/, '').trim()}</div>`;
    }
    const body = (src && src.innerHTML.trim())
        ? src.innerHTML
        : '<p class="empty-message">certificate still running…</p>';
    ui.pres.innerHTML = head + body;
    ui.pres.style.display = 'block';
}

// ------------------------------------------------------------ overlay -----

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

function buildOverlay(s) {
    overlay.clear();
    if (!s.domain) overlay.add(makeBallShell());
}

// -------------------------------------------------------- exact set-up ----

// Enable exact arithmetic once, by driving the app's own Group-tab controls:
// field Q(w), w²+w+1 = 0, the figure-eight entry rewritten as w, and the
// embedding with positive imaginary part. Sticky for the rest of the talk;
// on any failure the tutorial simply continues numerically.
let exactStarted = false;

function ensureExact() {
    if (exactStarted) return Promise.resolve();
    exactStarted = true;
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            window.removeEventListener('poincare:refreshed', finish);
            resolve();
        };
        try {
            const btn = document.getElementById('toggle-exact');
            const mp = document.getElementById('field-minpoly');
            const rs = document.getElementById('field-root');
            if (!btn || !mp || !rs) { finish(); return; }
            mp.value = 'w^2+w+1';
            if (!btn.classList.contains('active')) btn.click();
            const spans = document.querySelectorAll('#matrixInputs .matrix-block')[0]
                ?.querySelectorAll('.mq-matrix-input');
            if (spans && spans[1] && spans[1].MathQuill) spans[1].MathQuill().latex('w');
            window.addEventListener('poincare:refreshed', finish);
            rs.value = '1';                       // the root with Im(w) > 0
            rs.dispatchEvent(new Event('change'));
            setTimeout(finish, 3000);             // never hang the tutorial on this
        } catch (e) {
            console.warn('exact set-up failed — continuing numerically:', e);
            finish();
        }
    });
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

// The step-3 demo set: one isometry of each type, all expressed in the
// figure-eight generators' entries so no extra matrix classes are needed.
// g₁ = (1 w; 0 1) is parabolic; g₁g₂ is loxodromic; (w 0; 0 1) — built by
// rearranging g₁'s own entries — is the order-3 elliptic rotation (not a
// group element, but this step is about matrices → isometries).
const ISO_DEMOS = [
    {
        latex: 'g_1=\\begin{pmatrix}1 & w\\\\ 0 & 1\\end{pmatrix}',
        type: 'parabolic',
        mat: (m) => m[0], word: [1],
    },
    {
        latex: 'r=\\begin{pmatrix}w & 0\\\\ 0 & 1\\end{pmatrix}',
        type: 'elliptic',
        mat: (m) => {
            const M2 = m[0].constructor;
            return new M2(m[0].b, m[0].c, m[0].c, m[0].a).normalized();
        },
        word: [],
    },
    {
        latex: 'g_1g_2=\\begin{pmatrix}1+w & w\\\\ 1 & 1\\end{pmatrix}',
        type: 'loxodromic',
        mat: (m) => m[0].mul(m[1]).normalized(), word: [1, 2],
    },
];

function applyIsoDemo(demo, ev) {
    if (!api || api.isAnimating() || busy) return;
    const mats = api.state().matrices;
    if (mats.length < 2) return;
    let g = demo.mat(mats);
    let word = demo.word;
    if (ev && (ev.metaKey || ev.ctrlKey)) {
        g = g.inv().normalized();
        word = word.slice().reverse().map(x => -x);
    }
    api.animateMatrix(g, word);
}

function fadeInDomain() {
    api.setDomainVisible(true);
    api.setPolyhedronOpacity(0);
    tween(1100, (e) => api.setPolyhedronOpacity(e));
}

function playFacePairings() {
    // Roll the domain across a face, then across a second face.
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

// The whole tutorial lives on the figure-eight group; a "load" here only
// resets the view when free exploration or an animation has moved it.
function settleView() {
    if (api.isViewDirty()) api.refresh();
    return Promise.resolve();
}

const LOG = (window.__tutLog = []);

async function applyStep(k, animate) {
    LOG.push(`applyStep(${k}, ${animate}) from step=${step} t=${Math.round(performance.now())}`);
    busy = true;
    applySeq++;
    const { state: s, caption, enter } = STEPS[k];
    step = k;
    setCaption(caption);
    try {
        if (s.exact) await ensureExact();
        await settleView();

        // Expensive toggles: only touch what changed.
        const want = {
            dust: !!s.dust, orbit: !!s.orbit,
            cayley: s.cayley || 'off', dual: s.dual || 'off', tiling: !!s.tiling,
        };
        if (cur.dust !== want.dust) { api.setDust(want.dust); cur.dust = want.dust; }
        if (cur.orbit !== want.orbit) { api.setOrbit(want.orbit); cur.orbit = want.orbit; }
        if (cur.cayley !== want.cayley) { api.setCayleyMode(want.cayley); cur.cayley = want.cayley; }
        if (cur.dual !== want.dual) { api.setDual(want.dual); cur.dual = want.dual; }
        if (cur.tiling !== want.tiling) { api.setTiling(want.tiling); cur.tiling = want.tiling; }

        // Cheap flags: apply unconditionally.
        // While the domain is hidden the overlay's ball shell stands in for
        // the ideal boundary (the raymarcher renders black with zero faces).
        api.setPolyhedronOpacity(s.domain ? 1 : 0);
        api.setDomainVisible(!!s.domain);
        api.setWallsOpacity(s.walls || 0);
        api.setMirror(!!s.mirror);
        api.setAutoRotate(!!s.autoRotate, s.autoRotate || 1);
        buildOverlay(s);
        setMatricesCard(!!s.card);
        ui.iso.style.display = s.isoCard ? 'flex' : 'none';
        ui.theorem.style.display = s.theoremCard ? 'block' : 'none';
        setPresCard(!!s.presCard);

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
