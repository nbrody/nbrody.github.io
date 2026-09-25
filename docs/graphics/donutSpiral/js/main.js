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
        // master timeline in [0, 1]; see splitTime for how it maps onto the pattern
        // timeline (form, pulse, warp, suction) with the torus stage spliced in.
        t: 0,
        torusLayers: 8,
        donuts: [],
        width: 0,
        height: 0,
        cx: 0,
        cy: 0,
        unit: 0,
        dpr: 1,
    };

    const PHASE_NAMES = ['form-up', 'spiral pulse', 'torus', 'warp', 'suction'];

    // The 2D pattern runs on its own timeline t ∈ [0,1] (0–0.25 form, 0.25–0.5 pulse,
    // 0.5–0.75 warp, 0.75–1 suction). The master loop plays it in segments: the pulse gets
    // extra time (it steps through several spiral families), and the torus stage is spliced
    // in at TORUS_AT, where the spiral is fully formed and nothing is moving.
    const PATTERN_SECONDS = 22;
    const TORUS_AT = 0.495;
    const SEGMENTS = [
        { from: 0, to: 0.25, secs: 0.25 * PATTERN_SECONDS },
        { from: 0.25, to: TORUS_AT, secs: 14 },
        { torus: true, secs: 18 },
        { from: TORUS_AT, to: 1, secs: (1 - TORUS_AT) * PATTERN_SECONDS },
    ];
    const LOOP_SECONDS = SEGMENTS.reduce((sum, seg) => sum + seg.secs, 0);

    // master time → { t: pattern time, tau: torus-stage progress or null }
    function splitTime(T) {
        let secs = T * LOOP_SECONDS;
        for (const [i, seg] of SEGMENTS.entries()) {
            if (secs < seg.secs || i === SEGMENTS.length - 1) {
                const k = Math.min(1, secs / seg.secs);
                if (seg.torus) return { t: TORUS_AT, tau: k };
                return { t: seg.from + (seg.to - seg.from) * k, tau: null };
            }
            secs -= seg.secs;
        }
    }
    // pattern time → master time (the torus stage's start for t = TORUS_AT)
    function patternToMaster(t) {
        let acc = 0;
        for (const seg of SEGMENTS) {
            if (!seg.torus && t < seg.to) return (acc + ((t - seg.from) / (seg.to - seg.from)) * seg.secs) / LOOP_SECONDS;
            if (seg.torus && t === TORUS_AT) return acc / LOOP_SECONDS;
            acc += seg.secs;
        }
        return 1;
    }
    const PHASE_STARTS = [0, patternToMaster(0.25), patternToMaster(TORUS_AT),
        patternToMaster(0.5), patternToMaster(0.75)];

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
        state.ringQ = q;
        state.pulseFamilies = spiralFamilies(N, Math.log(q));
        state.r0 = r0;

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

    // The visible spirals ("parastichies") of the staggered pattern. Donut number
    // s = ring·N + spoke sits at log-polar position s·(log q / N, 2π / N) (angle mod 2π), a
    // lattice. Stepping d donuts at a time, minus n = round(d/N) full turns, is a lattice
    // vector; the short primitive ones are the spiral families the eye picks out (d = N is
    // the spokes, d = 1 the generating spiral, d = N ± 1 the two diagonal spirals, ...).
    // Family d has d arms, the residues of s mod d, and arm s has position n·s/d (mod 1)
    // across the family, so cos(2π·m·n·s/d − ωt) lights the arms in turn.
    function spiralFamilies(N, logq) {
        const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
        const fams = [];
        for (let d = 1; d <= 3 * N; d++) {
            const n = Math.round(d / N);
            if (gcd(d, n) !== 1) continue; // a multiple of a shorter step: same direction
            const du = (d * logq) / N, dth = 2 * Math.PI * (d / N - n);
            fams.push({ d, n, len: Math.hypot(du, dth), angle: Math.atan2(dth, du) });
        }
        fams.sort((a, b) => a.len - b.len);
        // the four most visible, played in order of their direction so the pulse turns
        return fams.slice(0, 4).sort((a, b) => b.angle - a.angle);
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
        // pulse waits until the rings have staggered into a true spiral
        // and has died away by the torus stage.
        const p2 = smoothstep(0.27, 0.34, t) * (1 - smoothstep(0.43, 0.49, t));
        const p3 = smoothstep(0.45, 0.55, t) * (1 - smoothstep(0.70, 0.78, t));
        const p4 = smoothstep(0.70, 0.78, t);
        // local progress within each phase
        const lp1 = smoothstep(0.0, 0.22, t);
        const lp2 = smoothstep(0.22, 0.50, t);
        const lp3 = smoothstep(0.50, 0.75, t);
        const lp4 = smoothstep(0.75, 1.0, t);
        return { p1, p2, p3, p4, lp1, lp2, lp3, lp4 };
    }

    function dominantPhaseIndex(T) {
        const { t, tau } = splitTime(T);
        if (tau !== null) return 2;
        if (t < 0.25) return 0;
        if (t < TORUS_AT) return 1;
        if (t < 0.75) return 3;
        return 4;
    }

    // pseudo-random in [0,1] from a seed
    const rand = (s) => {
        const x = Math.sin(s) * 43758.5453;
        return x - Math.floor(x);
    };

    const clamp01 = (x) => Math.max(0, Math.min(1, x));

    // === colour helpers ===
    const parseHex = (hex) => [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
    const mixRgb = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
    const rgba = (c, alpha = 1) => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;

    // Donuts heat up as they fall toward the horizon: fg → near-white.
    // Quantized so we build a handful of colour strings per palette change.
    const HEAT_LEVELS = 24;
    const WHITE_HOT = [255, 246, 228];
    let heatCache = { fg: null, bg: null };
    function palette() {
        if (heatCache.fg === state.fgColor && heatCache.bg === state.bgColor) return heatCache;
        const fg = parseHex(state.fgColor);
        const bg = parseHex(state.bgColor);
        const hot = mixRgb(fg, WHITE_HOT, 0.85);
        const ramp = [];
        for (let k = 0; k <= HEAT_LEVELS; k++) ramp.push(rgba(mixRgb(fg, hot, k / HEAT_LEVELS)));
        heatCache = {
            fg: state.fgColor, bg: state.bgColor,
            fgRgb: fg, hot, ramp,
            void: mixRgb(bg, [0, 0, 0], 0.9),
            well: mixRgb(bg, [0, 0, 0], 0.6),
        };
        return heatCache;
    }

    // === suction (phase 4): a black hole at the centre ===
    // Each ring falls inward in log-radius: r_i(t) = ringR_i · e^{-Δ_i(t)}, and its
    // donuts shrink by the same factor. Inner rings start falling first, so
    // Δ_i ≥ Δ_{i+1} always — the ratio of consecutive ring radii only grows, so rings
    // can't collide radially. Spin is rigid per ring, so donuts within a ring can't
    // collide either. Spin angle ∝ e^{Δ} = ringR/r, i.e. angular speed blows up
    // like 1/r as a ring nears the horizon (a Keplerian-ish whirlpool).
    const SUCK_START = 0.74;
    const suckProgress = (t) => clamp01((t - SUCK_START) / (1 - SUCK_START));

    function ringInfall(ring, s) {
        const rho = state.rings > 1 ? ring / (state.rings - 1) : 0;
        const start = 0.02 + 0.55 * rho;
        const x = clamp01((s - start) / 0.33);
        const delta = 0.35 * Math.pow(s, 1.5) + 3.2 * Math.pow(x, 2.2);
        const spin = 0.22 * (Math.exp(Math.min(delta, 5)) - 1);
        return { delta, spin };
    }

    // Horizon radius (in units of U): fed as rings fall in, then collapses to a
    // point just before the loop wraps, and the pattern is reborn in form-up.
    function horizonRadius(s) {
        const grow = 0.05 * smoothstep(0.0, 0.3, s) + 0.04 * smoothstep(0.5, 0.88, s);
        return grow * (1 - easeInCubic(smoothstep(0.87, 0.93, s)));
    }

    // Which spiral family the pulse is on, how strongly, and how far its sweep has got.
    // The families play one after another through the pulse phase, each fading in and out.
    function pulseFamily(t) {
        const fams = state.pulseFamilies;
        const x = clamp01((t - 0.28) / (0.48 - 0.28)) * fams.length;
        const f = Math.min(fams.length - 1, Math.floor(x));
        const local = x - f;
        return {
            family: fams[f],
            familyAmp: smoothstep(0, 0.18, local) * (1 - smoothstep(0.82, 1, local)),
            sweep: local * 2.5, // cycles of the sweep while this family is up
        };
    }

    // Everything that depends only on t, computed once per (echo) frame.
    function frameParams(t) {
        const { p2, lp1, lp3 } = phaseWeights(t);
        const s = suckProgress(t);
        return {
            t, s, lp1,
            pulseTime: t * 6.0,
            pulseAmp: p2,
            ...pulseFamily(t),
            // concentric rings → one continuous log spiral, just before the pulse
            stagger: smoothstep(0.17, 0.27, t),
            warpAmp: lp3 * (1 - smoothstep(0, 0.35, s)),
            swirl: lp3 * 0.35,
            horizon: horizonRadius(s),
            infall: Array.from({ length: state.rings }, (_, i) => ringInfall(i, s)),
        };
    }

    // Warp displacement is bounded by a fraction of donut radius. Keep it small
    // enough that no donut moves into a neighbor (reference gap ≈ 12% of donut
    // radius, so we cap wobble at 8% to leave a margin).
    const WOBBLE_FRAC = 0.08;

    // Bright bands per sweep of a spiral family during the pulse.
    const PULSE_BANDS = 3;

    // Position, size, opacity and heat of one donut at the frame described by fp.
    function pose(d, fp) {
        const U = state.unit;

        // Phase 1 fade-in: donuts come in along the spiral.
        const fadeOrder = d.spiralPos / (state.rings + 1);
        const formIn = smoothstep(fadeOrder * 0.7, fadeOrder * 0.7 + 0.35, fp.lp1);

        // Phase 2 spiral pulse: opacity wave traveling along spiral
        // Phase 2 spiral pulse: light up the arms of the current spiral family in turn. The
        // generating spiral (d = 1) has just one arm, so there the light runs along it.
        const fam = fp.family;
        const sIdx = d.ring * state.spokes + d.spoke;
        const ph = fam.d === 1 ? (sIdx * 0.45) / state.spokes : (PULSE_BANDS * fam.n * sIdx) / fam.d;
        const wave = Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * (ph - fp.sweep)), 2);
        const pulseAlpha = 1 - fp.pulseAmp * fp.familyAmp * 0.85 * (1 - wave);

        const { delta, spin } = fp.infall[d.ring];
        // Spiral stagger: push spoke j of ring i out to radius r0·q^(i + j/N), so the
        // rings unroll into a single logarithmic spiral that runs through donuts in
        // spiralPos order — the path the pulse travels. Radius and size scale together,
        // and consecutive donuts along the spiral only move apart, so nothing overlaps.
        const stagger = Math.pow(state.ringQ, (d.spoke / state.spokes) * fp.stagger);
        const fall = Math.exp(-delta) * stagger;
        const rNorm = d.ringR * fall;

        // Per-ring rigid swirl: rotation depends only on the ring, so within-ring
        // donuts move together (no overlap).
        let theta = d.theta + fp.swirl * (0.2 + 0.8 * (1 - d.ringR)) + spin;
        let r = rNorm * U;
        const oR = d.outerR * fall;

        // Phase 3 warp: bounded radial/tangential wobble, as a fraction of oR.
        if (fp.warpAmp > 0) {
            const t = fp.t;
            const warpWaveR = Math.sin(t * 4.5 * Math.PI + d.ring * 0.7 + d.seed * 0.001);
            const warpWaveT = Math.sin(t * 3.0 * Math.PI + d.spoke * 0.31 + d.ring * 0.9);
            r += fp.warpAmp * WOBBLE_FRAC * oR * warpWaveR;
            if (r > 0.001) theta += (fp.warpAmp * WOBBLE_FRAC * oR * warpWaveT) / r;
        }

        // small jitter during pulse — also bounded by oR
        if (fp.pulseAmp > 0.05 && r > 0.001) {
            theta += (fp.pulseAmp * WOBBLE_FRAC * 0.5 * oR * Math.sin(fp.pulseTime * 0.8 + d.spoke)) / r;
        }

        // Swallowed at the horizon; heats up on the way down.
        const H = fp.horizon;
        const horizonFade = smoothstep(H, H * 1.8, rNorm) * (1 - smoothstep(0.88, 0.92, fp.s));
        const heat = fp.s > 0
            ? Math.pow(clamp01(1 - (rNorm - H) / 0.55), 1.6) * smoothstep(0, 0.12, fp.s)
            : 0;

        return {
            x: state.cx + Math.cos(theta) * r,
            y: state.cy + Math.sin(theta) * r,
            rNorm, oR, heat,
            alpha: formIn * pulseAlpha * horizonFade,
        };
    }

    // Donut: outer disk minus inner disk via even-odd fill.
    function fillDonut(x, y, oR) {
        const inner = oR * (1 - state.thickness);
        ctx.beginPath();
        ctx.arc(x, y, oR, 0, Math.PI * 2, false);
        ctx.moveTo(x + inner, y);
        ctx.arc(x, y, inner, 0, Math.PI * 2, true);
        ctx.fill('evenodd');
    }

    // Motion trails: ghost copies at slightly earlier times, computed analytically
    // so scrubbing the timeline shows the same streaks as playback.
    const ECHOES = 5;
    const ECHO_DT = 0.0032;

    // Fundamental annulus for the torus stage: k whole layers of the spiral (spiralPos in
    // [i0, i0 + k)), chosen so its outer edge sits just inside the unit circle.
    function torusDomain() {
        const k = Math.min(state.torusLayers, state.rings);
        const logq = Math.log(state.ringQ);
        const top = Math.round(Math.log(0.95 / state.r0) / logq);
        const i0 = Math.max(0, Math.min(state.rings - k, top - k));
        const U = state.unit;
        return {
            i0, k, logq,
            rIn: state.r0 * Math.pow(state.ringQ, i0) * U,
            rOut: state.r0 * Math.pow(state.ringQ, i0 + k) * U,
        };
    }

    function draw(t, tau = null) {
        const w = state.width;
        const h = state.height;
        const cx = state.cx;
        const cy = state.cy;
        const U = state.unit;
        const pal = palette();

        ctx.globalAlpha = 1;
        ctx.fillStyle = state.bgColor;
        ctx.fillRect(0, 0, w, h);

        const fp = frameParams(t);

        // Torus stage: the fundamental annulus is handed to the 3D canvas and the rest
        // of the pattern fades away while it's rolled up. The print for the cloth is
        // prepared in the background ahead of time; until it's ready the 2D pattern holds.
        const domain = torusDomain();
        const torusParams = {
            tau, width: w, height: h, dpr: state.dpr, unit: U,
            rIn: domain.rIn, rOut: domain.rOut, k: domain.k, logq: domain.logq, spokes: state.spokes,
            c: state.cSafe, thickness: state.thickness, fg: state.fgColor, bg: state.bgColor,
        };
        const torusReady = window.DonutTorus?.ready(torusParams) ?? false;
        const torus = tau !== null && torusReady ? domain : null;
        const outside = torus ? 1 - smoothstep(0, 0.07, tau) * (1 - smoothstep(0.95, 1, tau)) : 1;
        const s = fp.s;
        const H = fp.horizon;

        // Gravity well: the background darkens around the hole.
        const well = smoothstep(0, 0.5, s) * (1 - smoothstep(0.9, 0.96, s));
        if (well > 0.01) {
            const wr = U * (0.3 + 1.1 * well);
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, wr);
            g.addColorStop(0, rgba(pal.well, 0.85 * well));
            g.addColorStop(0.5, rgba(pal.well, 0.35 * well));
            g.addColorStop(1, rgba(pal.well, 0));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        }

        const echoFrames = [];
        if (s > 0) {
            for (let k = ECHOES; k >= 1; k--) echoFrames.push({ k, fp: frameParams(Math.max(0, t - k * ECHO_DT)) });
        }

        let inflow = 0; // how much material is currently at the lip of the horizon
        for (const d of state.donuts) {
            // printed on the cloth instead
            if (torus && d.ring >= torus.i0 && d.ring < torus.i0 + torus.k) continue;
            const p = pose(d, fp);
            p.alpha *= outside;
            if (p.alpha <= 0.001 || p.oR <= 0.5) continue;
            const color = pal.ramp[Math.round(p.heat * HEAT_LEVELS)];
            ctx.fillStyle = color;

            for (const e of echoFrames) {
                const q = pose(d, e.fp);
                if (q.oR <= 0.5) continue;
                const moved = Math.hypot(q.x - p.x, q.y - p.y) / p.oR;
                const weight = clamp01(moved * 0.6 - 0.15);
                const a = Math.min(p.alpha, q.alpha) * weight * 0.5 * (1 - e.k / (ECHOES + 1));
                if (a <= 0.004) continue;
                ctx.globalAlpha = a;
                fillDonut(q.x, q.y, q.oR);
            }

            ctx.globalAlpha = p.alpha;
            fillDonut(p.x, p.y, p.oR);

            if (H > 0 && p.rNorm < H * 2.5) inflow += p.alpha;
        }
        ctx.globalAlpha = 1;

        // The horizon: accretion glow, a black void, and a thin photon ring.
        const HR = H * U;
        if (HR > 0.5) {
            const glow = Math.min(1.5, 0.45 + inflow / state.spokes);
            const gR = HR * 5;
            const g = ctx.createRadialGradient(cx, cy, HR * 0.9, cx, cy, gR);
            g.addColorStop(0, rgba(pal.hot, 0.7 * glow));
            g.addColorStop(0.15, rgba(pal.hot, 0.35 * glow));
            g.addColorStop(0.45, rgba(pal.fgRgb, 0.12 * glow));
            g.addColorStop(1, rgba(pal.fgRgb, 0));
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, gR, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            ctx.fillStyle = rgba(pal.void);
            ctx.beginPath();
            ctx.arc(cx, cy, HR, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = rgba(WHITE_HOT, Math.min(1, 0.5 + 0.4 * glow));
            ctx.lineWidth = Math.max(1.5, HR * 0.08);
            ctx.beginPath();
            ctx.arc(cx, cy, HR * 1.03, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Collapse → singularity glint → flash and shockwave, fading out exactly
        // as the loop wraps into form-up.
        const glint = smoothstep(0.88, 0.93, s) * (1 - smoothstep(0.93, 0.95, s));
        if (glint > 0.01) {
            const gr = U * 0.08;
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
            g.addColorStop(0, rgba(WHITE_HOT, glint));
            g.addColorStop(1, rgba(pal.hot, 0));
            ctx.fillStyle = g;
            ctx.fillRect(cx - gr, cy - gr, gr * 2, gr * 2);
        }
        if (s > 0.93) {
            const f = (s - 0.93) / 0.07;
            const fade = Math.pow(1 - f, 1.6);
            const fr = U * (0.15 + 2.6 * easeOutCubic(f));
            const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
            g.addColorStop(0, rgba(WHITE_HOT, fade));
            g.addColorStop(0.35, rgba(pal.hot, 0.6 * fade));
            g.addColorStop(1, rgba(pal.fgRgb, 0));
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'source-over';

            ctx.strokeStyle = rgba(pal.hot, 0.9 * Math.pow(1 - f, 1.5));
            ctx.lineWidth = 1 + U * 0.022 * (1 - f);
            ctx.beginPath();
            ctx.arc(cx, cy, U * 3 * easeOutCubic(f), 0, Math.PI * 2);
            ctx.stroke();
        }

        if (torus) {
            window.DonutTorus.render(torusParams);
        } else {
            window.DonutTorus?.hide();
        }
    }

    // === main loop ===
    let lastFrame = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        if (state.playing) {
            state.t = (state.t + (dt * state.speed) / LOOP_SECONDS) % 1;
            updatePhaseLabel();
            phaseSlider.value = String(state.t);
        }
        const { t, tau } = splitTime(state.t);
        draw(t, tau);
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
    const layersSlider = document.getElementById('layersSlider');
    const layersValue = document.getElementById('layersValue');
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

    document.querySelectorAll('[data-phase]').forEach((btn, i) => {
        btn.dataset.phase = String(PHASE_STARTS[i]);
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

    layersSlider.addEventListener('input', (e) => {
        state.torusLayers = parseInt(e.target.value, 10);
        layersValue.textContent = String(state.torusLayers);
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
