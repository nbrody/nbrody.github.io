(() => {
    'use strict';

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');

    const state = {
        spokes: 24,
        rings: 22,
        thickness: 0.5,
        bgColor: '#2C6E91',
        fgColor: '#EC0B43',
        speed: 1.0,
        playing: true,
        // master timeline t in [0, 1]; phases split: 0-0.25 form, 0.25-0.5 pulse, 0.5-0.75 warp, 0.75-1 suction
        t: 0,
        loopSeconds: 22,
        donuts: [],
        width: 0,
        height: 0,
        cx: 0,
        cy: 0,
        unit: 0,
        dpr: 1,
    };

    const PHASE_NAMES = ['form-up', 'spiral pulse', 'warp', 'suction'];

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        state.width = w;
        state.height = h;
        state.cx = w / 2;
        state.cy = h / 2;
        state.unit = Math.min(w, h) * 0.45;
        state.dpr = dpr;
        buildDonuts();
    }

    // Build a polar grid of donuts using GEOMETRIC ring spacing so the donut-size /
    // ring-spacing ratio stays constant across rings (matches the reference tapestry).
    // Donut outer radius oR_i = c * ringR_i with c chosen so donuts never overlap —
    // either tangentially (within a ring) or radially (between rings).
    //
    // Pattern fills the screen: r0 is sub-pixel small (smallest layers cull naturally),
    // rMax extends to the screen corners with margin so donuts cover even the corners.
    function buildDonuts() {
        const donuts = [];
        const N = state.spokes;
        const R = state.rings;
        const U = state.unit;
        const r0 = 0.012;
        // Reach beyond the screen corners. Corner distance / U gives normalized ring units.
        const cornerR = Math.hypot(state.cx, state.cy) / U;
        const rMax = cornerR * 1.08;
        // Geometric ratio between successive ring radii.
        const q = R > 1 ? Math.pow(rMax / r0, 1 / (R - 1)) : 1;

        // Tangential limit: 2*oR < 2*ringR*sin(pi/N) → c < sin(pi/N)
        // Radial limit (consecutive rings tangent): oR_i + oR_{i+1} < ringR_{i+1} - ringR_i
        //   with oR_k = c*ringR_k and ringR_{i+1}=q*ringR_i: c < (q-1)/(q+1)
        const cTangential = Math.sin(Math.PI / N);
        const cRadial = (q - 1) / (q + 1);
        const cMax = Math.min(cTangential, cRadial);
        // 88% of the limit leaves a small visible gap (matches reference).
        const cSafe = 0.88 * cMax;
        // Donut thickness is also bounded so animated effects can't push donuts into each other:
        // wobble + breathe must stay inside the gap.
        state.cSafe = cSafe;
        state.cMax = cMax;

        for (let i = 0; i < R; i++) {
            const ringR = r0 * Math.pow(q, i);
            for (let j = 0; j < N; j++) {
                const theta = (j / N) * Math.PI * 2;
                donuts.push({
                    ring: i,
                    spoke: j,
                    ringR,
                    theta,
                    outerR: cSafe * ringR * U,
                    spiralPos: i + (j / N),
                    seed: Math.sin(i * 12.9898 + j * 78.233) * 43758.5453,
                });
            }
        }
        donuts.sort((a, b) => a.ring - b.ring);
        state.donuts = donuts;
    }

    // === easing ===
    const smoothstep = (a, b, x) => {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };
    const easeInCubic = (x) => x * x * x;
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    // Master timeline: t in [0,1]. Returns per-phase progress in [0,1] for each phase,
    // overlapping slightly so transitions blend.
    function phaseWeights(t) {
        // raw quarter buckets
        const p1 = smoothstep(0.0, 0.18, t) * (1 - smoothstep(0.20, 0.30, t));
        const p2 = smoothstep(0.20, 0.30, t) * (1 - smoothstep(0.45, 0.55, t));
        const p3 = smoothstep(0.45, 0.55, t) * (1 - smoothstep(0.70, 0.78, t));
        const p4 = smoothstep(0.70, 0.78, t);
        // local progress within each phase
        const lp1 = smoothstep(0.0, 0.22, t);
        const lp2 = smoothstep(0.22, 0.50, t);
        const lp3 = smoothstep(0.50, 0.75, t);
        const lp4 = smoothstep(0.75, 1.0, t);
        return { p1, p2, p3, p4, lp1, lp2, lp3, lp4 };
    }

    function dominantPhaseIndex(t) {
        if (t < 0.25) return 0;
        if (t < 0.5) return 1;
        if (t < 0.75) return 2;
        return 3;
    }

    // pseudo-random in [0,1] from a seed
    const rand = (s) => {
        const x = Math.sin(s) * 43758.5453;
        return x - Math.floor(x);
    };

    function draw(t) {
        const w = state.width;
        const h = state.height;

        // background
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, w, h);

        const { p2, lp1, lp3, lp4 } = phaseWeights(t);
        const cx = state.cx;
        const cy = state.cy;
        const U = state.unit;

        // global "suction" parameter — donuts pulled to center
        const suction = lp4; // 0..1

        // global swirl (rotation of whole field) builds slowly, peaks during suction
        const globalSwirl = lp3 * 0.35 + suction * 1.8;

        // pulse traveling along spiral; p2 peaks during phase 2 only and fades into phase 3
        const pulseTime = t * 6.0; // wave speed
        const pulseAmp = p2;

        // warp magnitude
        const warpAmp = lp3;

        ctx.fillStyle = state.fgColor;
        const fg = state.fgColor;

        // Suction: contract the whole field by a single shrink factor so geometry
        // stays self-similar — donuts cannot overlap during suction since their
        // size and spacing scale together.
        const suckEase = easeInCubic(suction);
        const fieldShrink = 1 - 0.97 * suckEase;

        // Warp displacement is bounded by a fraction of donut radius. Keep it small
        // enough that no donut moves into a neighbor (reference gap ≈ 12% of donut
        // radius, so we cap wobble at 8% to leave a margin).
        const wobbleFrac = 0.08;

        for (const d of state.donuts) {
            // Phase 1 fade-in: stagger by ring (outside-in, then inside-out feel)
            // Use spiralPos so donuts come in along the spiral.
            const totalSpiral = state.rings + 1;
            const fadeOrder = d.spiralPos / totalSpiral; // 0..1
            const formIn = smoothstep(fadeOrder * 0.7, fadeOrder * 0.7 + 0.35, lp1);

            // Phase 2 spiral pulse: opacity wave traveling along spiral
            const phase = d.spiralPos * 0.9 - pulseTime;
            const wave = 0.5 + 0.5 * Math.sin(phase * Math.PI);
            const pulseAlpha = 1 - pulseAmp * 0.85 * (1 - wave);

            // base position
            const ringR = d.ringR;
            // Per-ring rigid swirl: rotation depends only on ringR, so within-ring
            // donuts move together (no overlap) and across-ring radial layout is
            // preserved (no overlap).
            let theta = d.theta + globalSwirl * (0.2 + 0.8 * (1 - ringR));

            let r = ringR * U * fieldShrink;
            let oR = d.outerR * fieldShrink;

            // Phase 3 warp: bounded radial/tangential wobble. Magnitude expressed
            // as a fraction of the donut's own outer radius.
            if (warpAmp > 0) {
                const warpWaveR = Math.sin(t * 4.5 * Math.PI + d.ring * 0.7 + d.seed * 0.001);
                const warpWaveT = Math.sin(t * 3.0 * Math.PI + d.spoke * 0.31 + d.ring * 0.9);
                r += warpAmp * wobbleFrac * oR * warpWaveR;
                // tangential wobble in arc-length, converted to angular delta
                const tangShift = warpAmp * wobbleFrac * oR * warpWaveT;
                if (r > 0.001) theta += tangShift / r;
            }

            // small jitter during pulse — also bounded by oR
            if (pulseAmp > 0.05 && r > 0.001) {
                const jitter = pulseAmp * wobbleFrac * 0.5 * oR * Math.sin(pulseTime * 0.8 + d.spoke);
                theta += jitter / r;
            }

            const x = cx + Math.cos(theta) * r;
            const y = cy + Math.sin(theta) * r;

            // Donuts stay circular — any anisotropic scaling could break the
            // tangential / radial overlap guarantees. Self-similar shrink only.
            const sRadial = 1;
            const sTangent = 1;

            // Alpha: faded out completely by the very end of suction.
            const alpha = formIn * pulseAlpha * (1 - 0.9 * suckEase);
            if (alpha <= 0.001 || oR <= 0.5) continue;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.rotate(theta); // local x-axis points outward (radial), y-axis tangential
            ctx.scale(sRadial, sTangent);

            // donut: outer disk minus inner disk via even-odd fill
            const inner = oR * (1 - state.thickness);
            ctx.beginPath();
            ctx.arc(0, 0, oR, 0, Math.PI * 2, false);
            ctx.arc(0, 0, inner, 0, Math.PI * 2, true);
            ctx.fillStyle = fg;
            ctx.fill('evenodd');

            ctx.restore();
        }

        // During suction, draw a faint glow at the center where things vanish
        if (suction > 0.05) {
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.4);
            g.addColorStop(0, hexWithAlpha(fg, 0.55 * suction));
            g.addColorStop(0.4, hexWithAlpha(fg, 0.15 * suction));
            g.addColorStop(1, hexWithAlpha(fg, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, U * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function hexWithAlpha(hex, alpha) {
        // hex like "#rrggbb"
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // === main loop ===
    let lastFrame = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        if (state.playing) {
            state.t = (state.t + (dt * state.speed) / state.loopSeconds) % 1;
            updatePhaseLabel();
            phaseSlider.value = String(state.t);
        }
        draw(state.t);
        requestAnimationFrame(loop);
    }

    // === UI ===
    const phaseSlider = document.getElementById('phaseSlider');
    const phaseLabel = document.getElementById('phaseLabel');
    const playBtn = document.getElementById('playBtn');
    const restartBtn = document.getElementById('restartBtn');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const spokesSlider = document.getElementById('spokesSlider');
    const spokesValue = document.getElementById('spokesValue');
    const ringsSlider = document.getElementById('ringsSlider');
    const ringsValue = document.getElementById('ringsValue');
    const thickSlider = document.getElementById('thickSlider');
    const thickValue = document.getElementById('thickValue');
    const bgColor = document.getElementById('bgColor');
    const bgValue = document.getElementById('bgValue');
    const fgColor = document.getElementById('fgColor');
    const fgValue = document.getElementById('fgValue');

    function updatePhaseLabel() {
        const idx = dominantPhaseIndex(state.t);
        phaseLabel.textContent = PHASE_NAMES[idx];
        // highlight the active phase button
        document.querySelectorAll('[data-phase]').forEach((btn, i) => {
            btn.classList.toggle('active', i === idx);
        });
    }

    phaseSlider.addEventListener('input', (e) => {
        state.t = parseFloat(e.target.value);
        state.playing = false;
        playBtn.textContent = '▶ Play';
        playBtn.classList.remove('active');
        updatePhaseLabel();
    });

    document.querySelectorAll('[data-phase]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.t = parseFloat(btn.dataset.phase);
            phaseSlider.value = String(state.t);
            updatePhaseLabel();
        });
    });

    playBtn.addEventListener('click', () => {
        state.playing = !state.playing;
        playBtn.textContent = state.playing ? '⏸ Pause' : '▶ Play';
        playBtn.classList.toggle('active', state.playing);
    });

    restartBtn.addEventListener('click', () => {
        state.t = 0;
        phaseSlider.value = '0';
        updatePhaseLabel();
    });

    speedSlider.addEventListener('input', (e) => {
        state.speed = parseFloat(e.target.value);
        speedValue.textContent = state.speed.toFixed(2) + '×';
    });

    spokesSlider.addEventListener('input', (e) => {
        state.spokes = parseInt(e.target.value, 10);
        spokesValue.textContent = String(state.spokes);
        buildDonuts();
    });

    ringsSlider.addEventListener('input', (e) => {
        state.rings = parseInt(e.target.value, 10);
        ringsValue.textContent = String(state.rings);
        buildDonuts();
    });

    thickSlider.addEventListener('input', (e) => {
        state.thickness = parseFloat(e.target.value);
        thickValue.textContent = state.thickness.toFixed(2);
    });

    function setPalette(bg, fg) {
        state.bgColor = bg;
        state.fgColor = fg;
        bgColor.value = bg;
        fgColor.value = fg;
        bgValue.textContent = bg;
        fgValue.textContent = fg;
    }

    bgColor.addEventListener('input', (e) => {
        state.bgColor = e.target.value;
        bgValue.textContent = e.target.value;
        // free-form edit clears the active palette pill
        document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    });

    fgColor.addEventListener('input', (e) => {
        state.fgColor = e.target.value;
        fgValue.textContent = e.target.value;
        document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    });

    document.querySelectorAll('.palette-btn').forEach(btn => {
        btn.style.setProperty('--swatch-bg', btn.dataset.bg);
        btn.style.setProperty('--swatch-fg', btn.dataset.fg);
        btn.addEventListener('click', () => {
            setPalette(btn.dataset.bg, btn.dataset.fg);
            document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // honor the initial state values (in case they differ from inputs)
    setPalette(state.bgColor, state.fgColor);

    window.addEventListener('resize', resize);
    resize();
    updatePhaseLabel();
    requestAnimationFrame(loop);
})();
