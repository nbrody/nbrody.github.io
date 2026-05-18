// Orchestrator — wires DOM controls to the per-section three.js visualisations.
import { makeMobiusViz }   from './mobiusViz.js';
import { makeTwoGenViz }   from './twoGenViz.js';
import { makeRenormViz }   from './renormViz.js';
import { makeOrbitViz, makeOrbitPicker } from './orbitViz.js';
import { makeMandelViz }   from './mandelViz.js';
import { makeJuliaPicker, makeJulia3D } from './juliaViz.js';

const fmt = (x, n = 3) => {
    const s = (Math.abs(x) < 1e-12 ? 0 : x).toFixed(n);
    return s.replace('-', '−');
};

// ─── §1 ───
{
    const viz = makeMobiusViz(document.getElementById('viz-mobius'));
    const typeEl = document.getElementById('mobius-type');
    const lenEl  = document.getElementById('mobius-len');
    const rotEl  = document.getElementById('mobius-rot');
    const animEl = document.getElementById('mobius-anim');
    const lenV = document.getElementById('mobius-len-v');
    const rotV = document.getElementById('mobius-rot-v');
    const trace = document.getElementById('mobius-trace');

    function update() {
        const type = typeEl.value;
        const ell  = +lenEl.value;
        const th   = +rotEl.value;
        lenV.textContent = ell.toFixed(2);
        rotV.textContent = th.toFixed(2);
        // disable irrelevant controls
        lenEl.disabled = (type === 'elliptic' || type === 'parabolic');
        rotEl.disabled = (type === 'hyperbolic' || type === 'parabolic');
        viz.setParams(type, ell, th, animEl.checked);
        trace.textContent = viz.getTraceText();
    }
    [typeEl, lenEl, rotEl, animEl].forEach(el => el.addEventListener('input', update));
    update();
}

// ─── §2 ───
{
    const viz = makeTwoGenViz(document.getElementById('viz-twogen'));
    const reEl = document.getElementById('mu-re');
    const imEl = document.getElementById('mu-im');
    const dEl  = document.getElementById('word-depth');
    const hEl  = document.getElementById('show-hull');
    const reV = document.getElementById('mu-re-v');
    const imV = document.getElementById('mu-im-v');
    const dV  = document.getElementById('word-depth-v');

    function update() {
        const re = +reEl.value, im = +imEl.value, d = +dEl.value;
        reV.textContent = fmt(re);
        imV.textContent = fmt(im);
        dV.textContent  = d.toString();
        viz.setParams([re, im], d, hEl.checked);
    }
    [reEl, imEl, dEl, hEl].forEach(el => el.addEventListener('input', update));
    document.querySelectorAll('[data-preset-mu]').forEach(btn => {
        btn.addEventListener('click', () => {
            const [r, i] = btn.dataset.presetMu.split(',').map(Number);
            reEl.value = r; imEl.value = i;
            update();
        });
    });
    update();
}

// ─── §3 ───
{
    const viz = makeRenormViz(document.getElementById('viz-renorm'));
    const reEl = document.getElementById('renorm-cre');
    const imEl = document.getElementById('renorm-cim');
    const stEl = document.getElementById('renorm-step');
    const reV  = document.getElementById('renorm-cre-v');
    const imV  = document.getElementById('renorm-cim-v');
    const stV  = document.getElementById('renorm-step-v');
    function update() {
        const re = +reEl.value, im = +imEl.value, s = +stEl.value;
        reV.textContent = fmt(re);
        imV.textContent = fmt(im);
        stV.textContent = s.toString();
        viz.setParams([re, im], s);
    }
    [reEl, imEl, stEl].forEach(el => el.addEventListener('input', update));
    update();
}

// ─── §4 ───
{
    const viz = makeOrbitViz(document.getElementById('viz-orbit'));
    const cLabel = document.getElementById('orbit-c');
    const lenEl  = document.getElementById('orbit-len');
    const zEl    = document.getElementById('orbit-zscale');
    const lenV   = document.getElementById('orbit-len-v');
    const zV     = document.getElementById('orbit-zscale-v');

    let c = [-0.7269, 0.1889];
    function update() {
        const length = +lenEl.value, zScale = +zEl.value;
        lenV.textContent = length.toString();
        zV.textContent = zScale.toFixed(2);
        cLabel.textContent = `c = ${fmt(c[0], 4)} + ${fmt(c[1], 4)} i`;
        viz.setParams(c, length, zScale);
    }
    makeOrbitPicker(document.getElementById('orbit-cplane'), (newC) => {
        c = newC;
        update();
    });
    [lenEl, zEl].forEach(el => el.addEventListener('input', update));
    update();
}

// ─── §5 ───
let mandelViz = null;
{
    const iterEl = document.getElementById('mandel-iter');
    const hEl    = document.getElementById('mandel-height');
    const resEl  = document.getElementById('mandel-res');
    const palEl  = document.getElementById('mandel-palette');
    const iterV  = document.getElementById('mandel-iter-v');
    const hV     = document.getElementById('mandel-height-v');

    mandelViz = makeMandelViz(document.getElementById('viz-mandel'), {
        N: +resEl.value, maxIter: +iterEl.value, height: +hEl.value, palette: palEl.value
    });
    let rebuildTimer = null;
    function update() {
        iterV.textContent = iterEl.value;
        hV.textContent = (+hEl.value).toFixed(2);
        // debounce; computeField on 512x512 takes a moment
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            mandelViz.setParams({
                N: +resEl.value,
                maxIter: +iterEl.value,
                height: +hEl.value,
                palette: palEl.value,
            });
        }, 120);
    }
    [iterEl, hEl, resEl, palEl].forEach(el => el.addEventListener('input', update));
    update();
}

// ─── §6 ───
{
    const julia3D = makeJulia3D(document.getElementById('viz-julia'), {
        c: [-0.7269, 0.1889], N: 240, maxIter: 200, height: 0.5,
    });
    const cLabel = document.getElementById('julia-c');
    const iterEl = document.getElementById('julia-iter');
    const hEl    = document.getElementById('julia-height');
    const pinEl  = document.getElementById('julia-pin');
    const iterV  = document.getElementById('julia-iter-v');
    const hV     = document.getElementById('julia-height-v');

    let currentC = [-0.7269, 0.1889];
    let pinned = false;

    let rebuildTimer = null;
    function update() {
        iterV.textContent = iterEl.value;
        hV.textContent = (+hEl.value).toFixed(2);
        cLabel.textContent = `c = ${fmt(currentC[0], 4)} + ${fmt(currentC[1], 4)} i`;
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
            julia3D.setParams(currentC, +iterEl.value, +hEl.value);
        }, 80);
    }
    const picker = makeJuliaPicker(document.getElementById('julia-mandel'), (c, isPin) => {
        currentC = c;
        if (typeof isPin === 'boolean') pinned = isPin;
        pinEl.checked = pinned;
        update();
    });
    pinEl.addEventListener('change', () => {
        picker.setPin(pinEl.checked);
    });
    [iterEl, hEl].forEach(el => el.addEventListener('input', update));
    update();
}
