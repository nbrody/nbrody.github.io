/**
 * unfold.js — the rational points of the circle unfold into a lattice.
 *
 * Every rational rotation is uniquely u·∏ r_p^{n_p} (see gauss.js), so
 * SO₂(ℚ) ≅ ℤ/4 × ⊕_{p ≡ 1 (4)} ℤ.  On the circle, a rotation sits at its
 * angle and the group structure is invisible; in the lattice it sits at its
 * exponent vector (n₅, n₁₃, n₁₇, …) and multiplying by r_p is a unit step.
 *
 * Steps:
 *   circle    every rational point with c ≤ 1300; spike height 1/c
 *   powers5   the powers of r₅ = (3 + 4i)/5 appear one by one, never repeating
 *   line      … and unwrap onto ℤ   (SO₂(ℤ[1/5]) ≅ ℤ/4 × ℤ)
 *   tangle    ⟨r₅, r₁₃⟩ on the circle, with its multiplication chords
 *   plane     … flies into ℤ²
 *   height    denominator 5^|a|·13^|b|: log c is a taxicab distance
 *   space     add r₁₇: ℤ³
 *   infinite  one direction for every prime p ≡ 1 (mod 4)
 */
(function () {
    'use strict';

    const { Tween, Fader, clamp, lerp, ease, clock } = VizKit;
    const G = Gauss;
    const TAU = 2 * Math.PI;

    const STEPS = [
        { id: 'circle', caption: 'The obvious geometry of \\(\\mathrm{SO}_2(\\mathbb Q)\\): the rational points \\(\\big(\\tfrac ac, \\tfrac bc\\big)\\) of the circle, each with a spike of height \\(\\tfrac1c\\). Dense &mdash; and the group structure is invisible.' },
        { id: 'powers5', caption: 'Denominator a power of 5? Then, up to a quarter turn, it is a power \\(r_5^{\\,n}\\) of <b>one</b> rotation \\(r_5\\) &mdash; the rotation by \\(\\arccos\\tfrac35\\) &mdash; wrapping around the circle forever.' },
        { id: 'line', caption: 'Unwrap them: \\(\\mathrm{SO}_2\\big(\\mathbb Z[\\tfrac15]\\big) \\cong \\mathbb Z/4 \\times \\mathbb Z\\) &mdash; a line.' },
        { id: 'tangle', caption: 'Add <span class="k-rose">\\(r_{13} = \\tfrac{5+12i}{13}\\)</span>. On the circle, the group \\(\\langle r_5, r_{13}\\rangle\\) is a tangle &hellip;' },
        { id: 'plane', caption: '&hellip; but really it is a plane: \\(\\;r_5^{\\,a}\\, r_{13}^{\\,b} \\longmapsto (a, b) \\in \\mathbb Z^2\\).' },
        { id: 'height', caption: 'The denominator of \\(r_5^{\\,a}\\, r_{13}^{\\,b}\\) is \\(5^{|a|}\\,13^{|b|}\\): its logarithm is a taxicab distance in the lattice.' },
        { id: 'space', caption: 'Add <span class="k-teal">\\(r_{17} = \\tfrac{15+8i}{17}\\)</span>: a third dimension &hellip;' },
        { id: 'infinite', caption: '&hellip; and one more for every prime \\(p \\equiv 1 \\pmod 4\\): \\(\\;\\mathrm{SO}_2(\\mathbb Q) \\,\\cong\\, \\mathbb Z/4 \\times \\bigoplus_{p \\equiv 1\\,(4)} \\mathbb Z\\).' },
    ];
    const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));

    // ── geometry constants ─────────────────────────────────────────
    const RW = 4.6;          // circle radius, in lattice units
    const N5 = 12;           // powers r₅ⁿ, |n| ≤ N5
    const N5_LABEL = 6;
    const N2 = 4;            // plane patch |a|, |b| ≤ N2
    const N3 = 2;            // extra layers |c| ≤ N3
    const EXTRA = [29, 37, 41, 53, 61, 73, 89, 97, 101, 109];
    const FAINT = G.splitPrimes(64).slice(3 + EXTRA.length);

    // ── colours ────────────────────────────────────────────────────
    function oklch(L, C, h) {
        const a = C * Math.cos(h), b = C * Math.sin(h);
        const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
        const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
        const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        const f = (x) => {
            x = clamp(x, 0, 1);
            return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
        };
        return [f(r), f(g), f(bb)];
    }
    /** Colour by lattice position: white at the origin, hue = direction. */
    function latColor(a, b) {
        const r = Math.hypot(a, b);
        if (!r) return [255, 255, 255];
        return oklch(0.81, 0.03 + 0.12 * Math.min(1, r / 3.2), Math.atan2(b, a) + 0.5);
    }
    const GEN_RGB = {
        5: [124, 138, 255], 13: [244, 114, 182], 17: [45, 212, 191],
    };
    const EXTRA_RGB = [[245, 158, 11], [125, 211, 252], [163, 230, 53], [192, 132, 252], [251, 146, 60],
                       [52, 211, 153], [249, 168, 212], [34, 211, 238], [250, 204, 21], [167, 139, 250]];
    EXTRA.forEach((p, i) => { GEN_RGB[p] = EXTRA_RGB[i % EXTRA_RGB.length]; });
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    /** Height ramp: gold (small denominator) → indigo → deep violet. */
    function heightColor(t) {
        const stops = [[251, 191, 36], [244, 114, 182], [124, 138, 255], [67, 56, 202]];
        t = clamp(t, 0, 1) * (stops.length - 1);
        const i = Math.min(stops.length - 2, Math.floor(t)), f = t - i;
        return stops[i].map((x, j) => Math.round(lerp(x, stops[i + 1][j], f)));
    }
    const crownRGB = (c) => {
        const t = clamp(Math.log(c) / Math.log(1300), 0, 1);
        return [Math.round(lerp(253, 110, t)), Math.round(lerp(224, 125, t)), Math.round(lerp(140, 210, t))];
    };

    // ── data ───────────────────────────────────────────────────────
    const crown = G.rationalPoints(1300).map((p) => ({
        a: p.a, b: p.b, c: p.c, x: RW * Math.cos(p.angle), y: RW * Math.sin(p.angle), rgb: crownRGB(p.c),
    }));
    crown.sort((p, q) => q.c - p.c);    // draw big denominators first

    function mkNode(exps, u, extra) {
        const ang = G.angleOf(exps, u);
        return Object.assign({ exps, u, ang, cx: RW * Math.cos(ang), cy: RW * Math.sin(ang) }, extra);
    }

    // powers of r₅ (four copies, one per unit)
    const orbit = [];
    for (let n = -N5; n <= N5; n++)
        for (let u = 0; u < 4; u++) orbit.push(mkNode([[5, n]], u, { n, rank: Math.abs(n) }));
    const orbitMain = orbit.filter((o) => o.u === 0);
    const orbitEdges = [];
    for (let n = -N5; n < N5; n++) orbitEdges.push([orbitMain[n + N5], orbitMain[n + N5 + 1]]);

    // ⟨r₅, r₁₃, r₁₇⟩: the plane patch (c = 0) and the extra layers
    const lat = new Map();
    const key = (a, b, c) => `${a},${b},${c}`;
    for (let c = -N3; c <= N3; c++)
        for (let a = -N2; a <= N2; a++)
            for (let b = -N2; b <= N2; b++) {
                const exps = [[5, a], [13, b], [17, c]];
                lat.set(key(a, b, c), mkNode(exps, 0, {
                    a, b, c, rank: Math.abs(a) + Math.abs(b), layer: Math.abs(c),
                    rgb: latColor(a, b),
                    logDen: Math.abs(a) * Math.log(5) + Math.abs(b) * Math.log(13) + Math.abs(c) * Math.log(17),
                }));
            }
    const latNodes = [...lat.values()];
    const plane = latNodes.filter((n) => n.c === 0);
    const MAXLOG = N2 * (Math.log(5) + Math.log(13));
    const latEdges = [];
    for (const n of latNodes) {
        const e5 = lat.get(key(n.a + 1, n.b, n.c)), e13 = lat.get(key(n.a, n.b + 1, n.c)), e17 = lat.get(key(n.a, n.b, n.c + 1));
        if (e5) latEdges.push([n, e5, 5]);
        if (e13) latEdges.push([n, e13, 13]);
        if (e17) latEdges.push([n, e17, 17]);
    }

    // extra primes: directions spread over the sphere, away from the three axes
    function spreadDirections(count, avoid, minSep) {
        const out = [], M = 400, golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < M && out.length < count; i++) {
            const y = 1 - (i + 0.5) / M * 2, r = Math.sqrt(1 - y * y), t = golden * i;
            const d = [Math.cos(t) * r, y, Math.sin(t) * r];
            const ok = avoid.concat(out).every((e) => Math.abs(d[0] * e[0] + d[1] * e[1] + d[2] * e[2]) < Math.cos(minSep));
            if (ok) out.push(d);
        }
        return out;
    }
    const AXES3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const DIRS = spreadDirections(EXTRA.length, AXES3, 26 * Math.PI / 180);
    const FDIRS = spreadDirections(FAINT.length, AXES3.concat(DIRS), 9 * Math.PI / 180);
    const axisNodes = [], axisEdges = [];
    EXTRA.forEach((p, j) => {
        let prev = null;
        for (let n = -3; n <= 3; n++) {
            const node = n === 0 ? null : mkNode([[p, n]], 0, { p, n, j, d: DIRS[j], rgb: GEN_RGB[p] });
            if (node) axisNodes.push(node);
            const cur = node || { origin: true };
            if (prev) axisEdges.push([prev, cur, p, j]);
            prev = cur;
        }
    });

    // ── state ──────────────────────────────────────────────────────
    const T = {
        orbReveal: new Tween(0), orbMorph: new Tween(0),
        latMorph: new Tween(0), grow3: new Tween(0), growAx: new Tween(0),
        yaw: new Tween(0), pitch: new Tween(0), kMul: new Tween(1),
    };
    const F = {
        crown: new Fader(1, 0.4), circle: new Fader(1, 0.4), orbit: new Fader(0, 0.35),
        orbitEchoes: new Fader(0, 0.4), lat: new Fader(0, 0.35), height: new Fader(0, 0.45),
        dim3: new Fader(1, 0.5), labels: new Fader(0, 0.4), intro: new Fader(0, 0.8),
    };
    let step = 'circle';
    let autoYaw = 0, autoSpin = false, paused = false;
    let drag = null, hover = null;
    let dirty = 3;

    function onStep(id, info) {
        const inst = info.instant;
        const prevIdx = info.prev ? STEP_INDEX[info.prev] : -1, idx = STEP_INDEX[id];
        step = id;
        const set = (t, v, o = {}) => T[t].set(v, Object.assign({ instant: inst }, o));
        const is3D = id === 'space' || id === 'infinite';
        const was3D = autoSpin;

        // ------- the circle and the powers of r₅
        F.crown.to(id === 'circle' ? 1 : id === 'powers5' ? 0.22 : 0);
        F.circle.to(idx <= STEP_INDEX.tangle ? (id === 'line' ? 0.35 : 1) : 0);
        F.orbit.to(id === 'powers5' || id === 'line' ? 1 : 0);
        F.orbitEchoes.to(id === 'powers5' ? 1 : 0);
        if (id === 'powers5') set('orbReveal', 1, { dur: prevIdx < idx ? 4.2 : 0.6, fn: ease.linear, delay: 0.3 });
        else if (id === 'line') set('orbReveal', 1, { dur: prevIdx < STEP_INDEX.powers5 ? 0.8 : 0.4 });
        else if (idx < STEP_INDEX.powers5) set('orbReveal', 0, { dur: 0.5 });
        set('orbMorph', id === 'line' ? 1 : 0, {
            dur: 2.6, delay: id === 'line' && prevIdx < STEP_INDEX.powers5 ? 0.9 : 0.15,
        });

        // ------- ⟨r₅, r₁₃, r₁₇⟩
        F.lat.to(idx >= STEP_INDEX.tangle ? 1 : 0);
        set('latMorph', idx >= STEP_INDEX.plane ? 1 : 0, { dur: 3.0, delay: 0.2 });
        F.height.to(id === 'height' ? 1 : 0);
        set('grow3', is3D ? 1 : 0, { dur: 2.4, delay: id === 'space' && !was3D ? 0.9 : 0 });
        set('growAx', id === 'infinite' ? 1 : 0, { dur: id === 'infinite' ? 4.0 : 1.2, fn: id === 'infinite' ? ease.linear : ease.inOut });
        F.dim3.to(id === 'infinite' ? 0.34 : 1);
        F.labels.to(idx >= STEP_INDEX.plane ? 1 : 0);

        // ------- camera
        if (is3D && !was3D) {
            autoSpin = true;
            set('yaw', 0.6, { dur: 2.4 });
            set('pitch', 0.42, { dur: 2.4 });
        } else if (!is3D && was3D) {
            // fold the accumulated spin back in, then unwind the shortest way
            autoSpin = false;
            const y = T.yaw.get() + autoYaw;
            autoYaw = 0;
            T.yaw.set(y, { instant: true });
            set('yaw', TAU * Math.round(y / TAU), { dur: 2.0 });
            set('pitch', 0, { dur: 2.0 });
        } else if (!is3D) {
            set('yaw', 0, { dur: 1.5 }); set('pitch', 0, { dur: 1.5 });
        }
        set('kMul', { circle: 0.94, powers5: 0.94, plane: 1.12, height: 1.12, space: 1.02, infinite: 0.92 }[id] || 1, { dur: 2.2 });
        document.body.classList.toggle('orbitable', is3D);
        if (inst) Object.values(F).forEach((f) => { if (f !== F.intro) f.snap(f.target); });
        dirty = 3;
    }

    // ── projection ─────────────────────────────────────────────────
    const cv = VizKit.makeCanvas(document.getElementById('stage'));
    const ctx = cv.ctx;
    let view = null;

    function makeView() {
        const W = cv.W, H = cv.H;
        const k = Math.min(W / 11.8, (H - 150) / 12.2) * T.kMul.get();
        const yaw = T.yaw.get() + autoYaw, pitch = T.pitch.get();
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const ox = W / 2, oy = H * 0.45, FOCAL = 26;
        return {
            W, H, k, ox, oy,
            proj(x, y, z) {
                const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
                const y2 = cp * y - sp * z1, z2 = sp * y + cp * z1;
                const f = FOCAL / (FOCAL - z2);
                return [ox + x1 * k * f, oy - y2 * k * f, z2, f];
            },
        };
    }

    // ── per-frame positions ────────────────────────────────────────
    const staggerT = (M, rank, maxRank, S = 0.55) => clamp(M * (1 + S) - S * rank / maxRank, 0, 1);

    function orbitPos(o, sp5) {
        const t = ease.inOut(staggerT(T.orbMorph.v, o.rank, N5, 0.5));
        return [lerp(o.cx, o.n * sp5, t), lerp(o.cy, 0, t), 0, t];
    }
    function latPos(n) {
        const t = ease.inOut(staggerT(T.latMorph.v, n.rank, 2 * N2, 0.6));
        const g = clamp(T.grow3.v * 1.6 - (n.layer - 1) * 0.6, 0, 1);
        const zc = n.c === 0 ? 0 : n.c * ease.inOut(g);
        return [lerp(n.cx, n.a, t), lerp(n.cy, n.b, t), zc, t, n.c === 0 ? 1 : g];
    }
    function axisGrow(j) { return clamp(T.growAx.v * (EXTRA.length + 3) / 4 - j * 0.25, 0, 1); }

    // ── drawing ────────────────────────────────────────────────────
    function draw() {
        cv.begin();
        view = makeView();
        const V = view, k = V.k;
        const intro = F.intro.v;
        const hits = [];   // hover candidates: [X, Y, info]

        // the circle itself
        const circA = F.circle.v * intro;
        if (circA > 0.01) {
            const [cx0, cy0] = V.proj(0, 0, 0);
            ctx.strokeStyle = `rgba(232,236,247,${0.16 * circA})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(cx0, cy0, RW * k, 0, TAU); ctx.stroke();
        }

        // the crown: every rational point, spike height 1/c
        const crA = F.crown.v * intro;
        if (crA > 0.01) {
            const sp = 0.3 * RW / 0.2;            // 1/5 ↦ 0.3·RW
            for (const q of crown) {
                const len = q.c === 1 ? 0.34 * RW : sp * (1 / q.c);
                const ux = q.x / RW, uy = q.y / RW;
                const [X0, Y0] = V.proj(q.x, q.y, 0), [X1, Y1] = V.proj(q.x + ux * len, q.y + uy * len, 0);
                ctx.strokeStyle = rgba(q.rgb, crA * (q.c <= 30 ? 0.95 : 0.6));
                ctx.lineWidth = q.c === 1 ? 2.4 : q.c <= 30 ? 1.8 : 1;
                ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
                if (q.c === 1) {   // the quarter turns send all of the grid to the grid: off the chart
                    const ex = X1 - X0, ey = Y1 - Y0, L = Math.hypot(ex, ey), nx = ex / L, ny = ey / L;
                    ctx.fillStyle = rgba(q.rgb, crA);
                    ctx.beginPath(); ctx.moveTo(X1 + nx * 9, Y1 + ny * 9);
                    ctx.lineTo(X1 - ny * 5, Y1 + nx * 5); ctx.lineTo(X1 + ny * 5, Y1 - nx * 5); ctx.closePath(); ctx.fill();
                }
            }
            for (const q of crown) {
                const [X, Y] = V.proj(q.x, q.y, 0);
                const r = 0.9 + 5.2 / Math.sqrt(q.c);
                ctx.fillStyle = rgba(q.rgb, crA);
                ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
                if (crA > 0.6) hits.push([X, Y, { crown: q }]);
            }
        }

        // the powers of r₅
        const orA = F.orbit.v * intro;
        if (orA > 0.01) {
            const sp5 = Math.min(1, (V.W / k) * 0.44 / N5);
            const rev = T.orbReveal.v * (N5 + 3);
            const shown = (n) => clamp((n >= 0 ? rev - n : rev - N5 * 0.35 - (-n) * 0.25), 0, 1);
            // walk chords r⁻ⁿ → … → rⁿ
            ctx.lineWidth = 1.6;
            for (const [p, q] of orbitEdges) {
                const a = Math.min(shown(p.n), shown(q.n));
                if (a <= 0) continue;
                const P = orbitPos(p, sp5), Q = orbitPos(q, sp5);
                const [X0, Y0] = V.proj(P[0], P[1], 0), [X1, Y1] = V.proj(Q[0], Q[1], 0);
                ctx.strokeStyle = rgba(GEN_RGB[5], 0.55 * a * orA);
                ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
            }
            for (const o of orbit) {
                const a = shown(o.n);
                if (a <= 0) continue;
                const P = orbitPos(o, sp5);
                let alpha = a * orA;
                if (o.u !== 0) alpha *= 0.4 * (1 - P[3]) * Math.max(F.orbitEchoes.v, 1 - P[3]);
                if (alpha < 0.01) continue;
                const [X, Y] = V.proj(P[0], P[1], 0);
                const main = o.u === 0;
                const r = main ? (o.n === 0 ? 6 : 4.6) : 3.2;
                ctx.fillStyle = main ? (o.n === 0 ? `rgba(255,255,255,${alpha})` : rgba([165, 175, 255], alpha)) : rgba([124, 138, 255], alpha);
                ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill();
                if (main && alpha > 0.5) hits.push([X, Y, { node: o }]);
                if (main && Math.abs(o.n) <= N5_LABEL && alpha > 0.05) {
                    // label: radially outside on the circle, below on the line
                    const t = P[3];
                    const lx = lerp(P[0] * (1 + 0.5 / RW), P[0], t), ly = lerp(P[1] * (1 + 0.5 / RW), P[1] - 0.55 * sp5 - 0.12, t);
                    const [LX, LY] = V.proj(lx, ly, 0);
                    ctx.font = `${o.n === 0 ? 600 : 500} 14px Inter, sans-serif`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = `rgba(232,236,247,${0.85 * alpha})`;
                    ctx.fillText(G.minus(o.n), LX, LY);
                }
            }
            if (T.orbMorph.v > 0.6) {
                const a = orA * clamp((T.orbMorph.v - 0.6) / 0.4, 0, 1);
                const [X, Y] = V.proj(N5 * sp5 + 0.9, 0.55, 0);
                subLabel('r', '5', '', X, Y, rgba(GEN_RGB[5], a), 22);
                const [X2, Y2] = V.proj(-N5 * sp5 - 0.4, 0, 0), [X3, Y3] = V.proj(N5 * sp5 + 0.4, 0, 0);
                ctx.fillStyle = `rgba(232,236,247,${0.6 * a})`;
                ctx.font = '20px Inter, sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('⋯', X2 - 12, Y2); ctx.fillText('⋯', X3 + 12, Y3);
            }
        }

        // the lattice ⟨r₅, r₁₃, r₁₇⟩ and the extra axes
        const laA = F.lat.v * intro;
        if (laA > 0.01) drawLattice(V, laA, hits);

        return hits;
    }

    function drawLattice(V, laA, hits) {
        const k = V.k;
        const hMix = F.height.v, dim = F.dim3.v;
        const g3 = ease.inOut(clamp(T.grow3.v, 0, 1));
        const rimFade = (n) => (Math.max(Math.abs(n.a), Math.abs(n.b)) === N2 ? 1 - g3 : 1);
        const edgeA = lerp(0.42, 0.66, clamp(T.latMorph.v, 0, 1));
        const items = [];
        const pos = new Map();
        for (const n of latNodes) {
            const P = latPos(n);
            if (n.c !== 0 && P[4] <= 0.001) continue;
            const S = V.proj(P[0], P[1], P[2]);
            pos.set(n, [S, P]);
        }
        // edges
        for (const [p, q, kind] of latEdges) {
            const A = pos.get(p), B = pos.get(q);
            if (!A || !B) continue;
            const grow = Math.min(A[1][4], B[1][4]) * Math.min(rimFade(p), rimFade(q));
            let a = edgeA * laA * grow * dim;
            if (kind === 17) a *= 0.9;
            if (p.c !== 0 || q.c !== 0) a *= 0.8;
            const z = (A[0][2] + B[0][2]) / 2;
            items.push({ z: z - 0.01, edge: true, X0: A[0][0], Y0: A[0][1], X1: B[0][0], Y1: B[0][1],
                         col: GEN_RGB[kind], a: a * depthFade(z), w: kind === 17 ? 1.4 : 1.6 });
        }
        // extra axes
        const axA = T.growAx.v > 0 ? laA : 0;
        if (axA > 0) {
            for (const [p, q, prime, j] of axisEdges) {
                const g = axisGrow(j);
                if (g <= 0) continue;
                const P0 = axisPoint(p, g), P1 = axisPoint(q, g);
                const A = V.proj(...P0), B = V.proj(...P1);
                const z = (A[2] + B[2]) / 2;
                items.push({ z, edge: true, X0: A[0], Y0: A[1], X1: B[0], Y1: B[1], col: GEN_RGB[prime], a: 0.75 * g * depthFade(z), w: 2 });
            }
            // faint spines: "and so on"
            const gF = clamp(T.growAx.v * 1.4 - 0.5, 0, 1);
            if (gF > 0) {
                FDIRS.forEach((d, i) => {
                    const L = (1.1 + 1.3 * ((i * 37) % 11) / 10) * gF;
                    const A = V.proj(-d[0] * L, -d[1] * L, -d[2] * L), B = V.proj(d[0] * L, d[1] * L, d[2] * L);
                    items.push({ z: 0, edge: true, X0: A[0], Y0: A[1], X1: B[0], Y1: B[1], col: [180, 190, 230], a: 0.16 * gF, w: 1 });
                });
            }
        }
        // nodes
        for (const [n, [S, P]] of pos) {
            const grow = P[4];
            let col = n.rgb;
            if (hMix > 0) col = mixRGB(col, heightColor(n.logDen / MAXLOG), hMix);
            const isO = n.a === 0 && n.b === 0 && n.c === 0;
            const r = (isO ? 7 : 5) * S[3] * (0.6 + 0.4 * grow);
            const a = laA * grow * rimFade(n) * (n.c === 0 ? dim : dim * 0.9) * depthFade(S[2]);
            items.push({ z: S[2], X: S[0], Y: S[1], r, col: isO ? [255, 255, 255] : col, a, node: n });
        }
        if (axA > 0) {
            for (const n of axisNodes) {
                const g = axisGrow(n.j);
                if (g <= 0) continue;
                const S = V.proj(...axisPoint(n, g));
                items.push({ z: S[2], X: S[0], Y: S[1], r: 4.2 * S[3], col: n.rgb, a: g * depthFade(S[2]), node: n });
            }
        }
        items.sort((p, q) => p.z - q.z);
        for (const it of items) {
            if (it.a < 0.01) continue;
            if (it.edge) {
                ctx.strokeStyle = rgba(it.col, it.a);
                ctx.lineWidth = it.w;
                ctx.beginPath(); ctx.moveTo(it.X0, it.Y0); ctx.lineTo(it.X1, it.Y1); ctx.stroke();
            } else {
                ctx.fillStyle = rgba(it.col, it.a);
                ctx.beginPath(); ctx.arc(it.X, it.Y, it.r, 0, TAU); ctx.fill();
                if (it.a > 0.35) hits.push([it.X, it.Y, { node: it.node }]);
            }
        }

        // taxicab level sets: denominator < 10², 10³, 10⁴
        if (hMix > 0.01) {
            ctx.setLineDash([6, 6]);
            ctx.lineWidth = 1.4;
            [[2, '10²'], [3, '10³'], [4, '10⁴']].forEach(([e, lab], i) => {
                ctx.setLineDash([6, 6]);
                ctx.lineWidth = 1.4;
                const L = e * Math.log(10), ra = L / Math.log(5), rb = L / Math.log(13);
                const pts = [[ra, 0], [0, rb], [-ra, 0], [0, -rb]].map(([x, y]) => V.proj(x, y, 0));
                const col = heightColor(0.25 + 0.3 * i);
                ctx.strokeStyle = rgba(col, 0.75 * hMix);
                ctx.beginPath();
                pts.forEach(([X, Y], j) => (j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)));
                ctx.closePath(); ctx.stroke();
                const [X, Y] = V.proj(0.18, rb + 0.28, 0);
                ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.setLineDash([]);
                ctx.lineWidth = 4; ctx.lineJoin = 'round';
                ctx.strokeStyle = `rgba(6,10,20,${0.85 * hMix})`;
                ctx.strokeText('denominator < ' + lab, X, Y);
                ctx.fillStyle = rgba(col, 0.95 * hMix);
                ctx.fillText('denominator < ' + lab, X, Y);
            });
            ctx.setLineDash([]);
        }

        // generator labels
        const la = F.labels.v * laA * clamp(T.latMorph.v * 1.5 - 0.5, 0, 1);
        if (la > 0.01) {
            const lab = (x, y, z, p, a) => {
                const [X, Y] = V.proj(x, y, z);
                subLabel('r', String(p), '', X, Y, rgba(GEN_RGB[p], a), 22);
            };
            const ext = lerp(N2, N2 - 1, g3Label());
            lab(ext + 0.75, 0, 0, 5, la);
            lab(0.05, ext + 0.7, 0, 13, la);
            const g3 = clamp(T.grow3.v * 1.5 - 0.5, 0, 1);
            if (g3 > 0) lab(0, 0, N3 + 0.8, 17, la * g3);
            EXTRA.forEach((p, j) => {
                const g = axisGrow(j);
                if (g > 0.4) lab(DIRS[j][0] * 3.75, DIRS[j][1] * 3.75, DIRS[j][2] * 3.75, p, (g - 0.4) / 0.6);
            });
        }
    }

    const g3Label = () => ease.inOut(clamp(T.grow3.v, 0, 1));

    function axisPoint(n, g) {
        if (n.origin) return [0, 0, 0];
        const t = n.n * ease.out(g);
        return [n.d[0] * t, n.d[1] * t, n.d[2] * t];
    }
    const depthFade = (z) => clamp(0.92 + 0.09 * z, 0.4, 1);
    const mixRGB = (a, b, t) => a.map((x, i) => Math.round(lerp(x, b[i], t)));

    function subLabel(base, sub, sup, X, Y, color, size) {
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = `italic ${size}px "Times New Roman", Times, serif`;
        const w = ctx.measureText(base).width;
        ctx.font = `${Math.round(size * 0.62)}px "Times New Roman", Times, serif`;
        const ws = ctx.measureText(sub).width;
        const x0 = X - (w + ws) / 2;
        ctx.font = `italic ${size}px "Times New Roman", Times, serif`;
        ctx.fillText(base, x0, Y);
        ctx.font = `${Math.round(size * 0.62)}px "Times New Roman", Times, serif`;
        ctx.fillText(sub, x0 + w + 1, Y + size * 0.3);
    }

    // ── hover tooltips ─────────────────────────────────────────────
    const tip = document.getElementById('tip');
    let hits = [], mouse = null;
    function describe(info) {
        if (info.crown) {
            const q = info.crown;
            const f = G.factorRotation(q.a, q.b, q.c);
            return tipHTML(G.wordHTML(f.u, f.exps), G.complexHTML(q.a, q.b, q.c), q.c, Math.atan2(q.b, q.a));
        }
        const n = info.node;
        const w = G.rotation(n.exps, n.u);
        return tipHTML(G.wordHTML(n.u, n.exps), G.complexHTML(w.re, w.im, w.den), w.den, n.ang);
    }
    function tipHTML(word, val, den, ang) {
        const d = BigInt(den);
        const fs = d === 1n ? [] : G.factor(d);
        const fac = fs.length > 1 || (fs[0] && fs[0][1] > 1) ? ' = ' + G.factorText(fs) : '';
        let deg = (ang * 180 / Math.PI) % 360; if (deg < 0) deg += 360;
        const shortVal = val.length > 90 ? val.slice(0, 86) + '…' : val;
        return `<div class="t-word">${word}</div><div class="t-val">${shortVal}</div>` +
            `<div class="t-dim">denominator ${d}${fac} &nbsp;·&nbsp; ${deg.toFixed(2)}°</div>`;
    }
    function updateHover() {
        if (!mouse || drag) { if (hover) { hover = null; tip.classList.remove('on'); } return; }
        let best = null, bd = 14 * 14;
        for (const h of hits) {
            const d = (h[0] - mouse.x) ** 2 + (h[1] - mouse.y) ** 2;
            if (d < bd) { bd = d; best = h; }
        }
        if (!best) { if (hover) { hover = null; tip.classList.remove('on'); } return; }
        const target = best[2].crown || best[2].node;
        if (!hover || hover.target !== target) {
            hover = { target };
            tip.innerHTML = describe(best[2]);
        }
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let x = best[0] + 16, y = best[1] - th - 12;
        if (x + tw > cv.W - 10) x = best[0] - tw - 16;
        if (y < 10) y = best[1] + 16;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
        tip.classList.add('on');
    }

    // ── pointer: hover everywhere, orbit in 3D ─────────────────────
    const stageEl = document.getElementById('stage');
    stageEl.addEventListener('pointermove', (e) => {
        mouse = { x: e.clientX, y: e.clientY };
        if (drag) {
            orbitCamera(e.clientX - drag.x, e.clientY - drag.y);
            drag.x = e.clientX; drag.y = e.clientY;
        }
        dirty = 2;
    });
    stageEl.addEventListener('pointerleave', () => { mouse = null; dirty = 2; });
    stageEl.addEventListener('pointerdown', (e) => {
        if (!autoSpin) return;
        drag = { x: e.clientX, y: e.clientY };
        stageEl.setPointerCapture(e.pointerId);
        document.body.classList.add('dragging');
    });
    const endDrag = () => { drag = null; document.body.classList.remove('dragging'); };
    stageEl.addEventListener('pointerup', endDrag);
    stageEl.addEventListener('pointercancel', endDrag);

    function orbitCamera(dx, dy) {
        if (!autoSpin) return;
        autoYaw += dx * 0.006;
        T.pitch.set(clamp(T.pitch.get() + dy * 0.005, -1.3, 1.3), { instant: true });
        dirty = 3;
    }

    function onCommand(cmd) {
        if (cmd === 'toggle' || cmd === 'play' || cmd === 'pause') paused = cmd === 'pause' ? true : cmd === 'play' ? false : !paused;
        else if (cmd === 'reset' && autoSpin) { autoYaw = 0; T.pitch.set(0.42, { dur: 1 }); }
        dirty = 3;
    }

    // ── loop ───────────────────────────────────────────────────────
    function frame(dt) {
        if (cv.resize()) dirty = 3;
        F.intro.to(1);
        let moving = false;
        for (const f of Object.values(F)) { f.step(dt); moving = moving || f.moving; }
        for (const t of Object.values(T)) { t.get(); moving = moving || t.moving; }
        if (autoSpin && !paused && !drag) { autoYaw += dt * 0.16; moving = true; }
        if (moving) dirty = 2;
        if (dirty > 0) {
            hits = draw();
            updateHover();
            dirty--;
        }
    }

    const loop = VizKit.startLoop(frame);
    const steps = VizKit.setup(STEPS, {
        onStep,
        onCommand,
        onOrbit: (dx, dy) => orbitCamera(dx * 0.8, dy * 0.8),
        onActive: (on) => { loop.setActive(on); dirty = 3; },
    });
    window.addEventListener('resize', () => { cv.resize(); dirty = 3; });
    document.fonts && document.fonts.ready.then(() => { dirty = 3; });

    window.viz = {
        steps, loop, advance: loop.advance,
        get state() { return { step, autoSpin, yaw: T.yaw.v + autoYaw, pitch: T.pitch.v, nodes: latNodes.length, crown: crown.length }; },
        hover(x, y) { mouse = { x, y }; dirty = 2; },
    };
})();
