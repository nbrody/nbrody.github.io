// Tidal-marsh dendritic-channel simulator.
//
// Stream-power erosion on a 2-D elevation field h(x,y):
//
//   ∂h/∂t = -K · A^m · S^n   (flow-concentration erosion: drainage area A, slope S)
//          +  D · ∇²h         (hillslope diffusion / sediment slumping)
//          +  U               (uniform sediment supply: tidal deposition)
//
// The mechanism is the *channelization instability* (Howard 1971; for tidal
// networks Fagherazzi & Sun 2004): where ebb-tide flow happens to concentrate
// along an incipient creek, erosion deepens it, and on the next tide it
// captures even more flow. The fractal channel network is the steady-state of
// that positive feedback against a uniform sediment supply.
//
// Drainage area A is computed by D8 flow accumulation: each cell drains to its
// lowest neighbour, areas are summed in elevation order. The boundary is held
// at sea level so the network organizes around outlets.

export class MarshSim {
    constructor(W, H) {
        this.W = W;
        this.H = H;
        const N = W * H;

        this.h    = new Float32Array(N);   // elevation
        this.area = new Float32Array(N);   // drainage area
        this.flow = new Int32Array(N);     // flow target index, -1 = outlet
        this.dh   = new Float32Array(N);   // accumulated change per step
        this.order = new Int32Array(N);    // height-sorted indices (descending)

        this.params = {
            K: 0.18,            // erodibility
            m: 0.55,            // drainage area exponent
            n: 1.0,             // slope exponent
            D: 0.18,            // hillslope diffusion
            U: 0.0014,          // sediment supply ("uplift")
            seaLevel: 0.0,
            dt: 0.9,
            stepsPerFrame: 2,
        };

        this.steps = 0;
        this.palette = 'marsh';

        // Stride of D8 neighbour offsets, prefilled per call to step().
        this._dx = [-1, 0, 1, -1, 1, -1, 0, 1];
        this._dy = [-1, -1, -1, 0, 0, 1, 1, 1];
        this._dist = this._dx.map((_, k) =>
            Math.hypot(this._dx[k], this._dy[k]));

        this.initRandom();
    }

    setParam(name, value) { this.params[name] = value; }

    // ---------- Initial conditions ----------

    initRandom() {
        // Gentle dome with noise: high in the middle, sea on edges.
        const W = this.W, H = this.H;
        const cx = (W - 1) * 0.5, cy = (H - 1) * 0.5;
        const R = Math.min(cx, cy);
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const r = Math.hypot(i - cx, j - cy) / R;
                const dome = Math.max(0, 1.0 - r * 1.05);
                this.h[j * W + i] = dome * 0.9
                    + (Math.random() - 0.5) * 0.06;
            }
        }
        this._postInit();
    }

    initPlateau() {
        // Flat marsh platform with light noise — channels carve from scratch.
        const W = this.W, H = this.H, N = W * H;
        for (let i = 0; i < N; i++) {
            this.h[i] = 0.55 + (Math.random() - 0.5) * 0.04;
        }
        this._postInit();
    }

    initIslands() {
        // A few high spots — produces multi-basin networks.
        const W = this.W, H = this.H;
        const k = 5 + Math.floor(Math.random() * 3);
        const centres = [];
        for (let n = 0; n < k; n++) {
            centres.push([
                W * (0.2 + Math.random() * 0.6),
                H * (0.2 + Math.random() * 0.6),
                30 + Math.random() * 25,
            ]);
        }
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                let h = 0;
                for (const [cx, cy, s] of centres) {
                    const r = Math.hypot(i - cx, j - cy) / s;
                    h = Math.max(h, Math.exp(-r * r));
                }
                this.h[j * W + i] = h * 0.9
                    + (Math.random() - 0.5) * 0.04;
            }
        }
        this._postInit();
    }

    initRidge() {
        // Long ridge tilting toward one edge — long subparallel networks.
        const W = this.W, H = this.H;
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const t = j / (H - 1);
                this.h[j * W + i] = 0.95 * (1 - t)
                    + (Math.random() - 0.5) * 0.05;
            }
        }
        this._postInit();
    }

    _postInit() {
        this.steps = 0;
        this._clampSea();
    }

    _clampSea() {
        // Boundary is sea — fixed below sea level so flow drains out.
        const W = this.W, H = this.H;
        const sl = this.params.seaLevel - 0.08;
        for (let i = 0; i < W; i++) {
            this.h[i] = sl;
            this.h[(H - 1) * W + i] = sl;
        }
        for (let j = 0; j < H; j++) {
            this.h[j * W] = sl;
            this.h[j * W + (W - 1)] = sl;
        }
    }

    // ---------- Step ----------

    step() {
        const { K, m, n, D, U, dt } = this.params;
        const W = this.W, H = this.H, N = W * H;
        const h = this.h, flow = this.flow, area = this.area, dh = this.dh;

        this._computeFlow();
        this._computeDrainageArea();

        // Reset accumulator
        for (let i = 0; i < N; i++) dh[i] = 0;

        // Stream-power erosion (process upstream→downstream so the lowering
        // doesn't invert local slopes mid-step).
        for (let k = 0; k < N; k++) {
            const i = this.order[k];
            const t = flow[i];
            if (t < 0) continue;
            const xi = i % W, yi = (i - xi) / W;
            const xt = t % W, yt = (t - xt) / W;
            const dist = Math.hypot(xi - xt, yi - yt);
            const slope = Math.max(0, (h[i] - h[t]) / dist);
            if (slope === 0) continue;
            const a = area[i];
            // Pow with non-integer exponents is slow — guard with small-A skip.
            const erode = K * Math.pow(a, m) * Math.pow(slope, n);
            dh[i] -= erode;
        }

        // Hillslope diffusion (5-point Laplacian).
        for (let j = 1; j < H - 1; j++) {
            for (let i = 1; i < W - 1; i++) {
                const idx = j * W + i;
                const lap = h[idx - 1] + h[idx + 1]
                          + h[idx - W] + h[idx + W]
                          - 4 * h[idx];
                dh[idx] += D * lap;
            }
        }

        // Apply update + uniform sediment supply, with stability clamp so a
        // pathological dt × K can't send a cell to NaN/-∞.
        const FLOOR = this.params.seaLevel - 2.0;
        const CEIL  = this.params.seaLevel + 4.0;
        for (let i = 0; i < N; i++) {
            let v = h[i] + dt * (dh[i] + U);
            if (!(v === v)) v = this.params.seaLevel;          // NaN guard
            if (v < FLOOR) v = FLOOR;
            else if (v > CEIL) v = CEIL;
            h[i] = v;
        }

        this._clampSea();
        this.steps++;
    }

    // D8: each non-boundary cell flows to its steepest descent neighbour.
    // Boundary cells & cells already below sea level are outlets.
    _computeFlow() {
        const W = this.W, H = this.H;
        const h = this.h, flow = this.flow;
        const sea = this.params.seaLevel;
        const dx = this._dx, dy = this._dy, dd = this._dist;

        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const idx = j * W + i;
                if (i === 0 || j === 0 || i === W - 1 || j === H - 1
                    || h[idx] <= sea) {
                    flow[idx] = -1;
                    continue;
                }
                let best = 0, bestIdx = -1;
                const hi = h[idx];
                for (let k = 0; k < 8; k++) {
                    const ni = i + dx[k], nj = j + dy[k];
                    const nidx = nj * W + ni;
                    const s = (hi - h[nidx]) / dd[k];
                    if (s > best) { best = s; bestIdx = nidx; }
                }
                flow[idx] = bestIdx;
            }
        }
    }

    // Topological accumulation of drainage area:
    //   A[i] = 1 + Σ A[upstream of i]
    // Process cells in order of decreasing elevation so each cell pushes its
    // accumulated area to its outlet exactly once.
    _computeDrainageArea() {
        const N = this.W * this.H;
        const h = this.h, area = this.area, flow = this.flow;

        // Initialize and sort indices by descending elevation.
        // (One sort per step is the dominant cost. JS Array.sort on 65k items
        // is ~3 ms — fine for real-time at this resolution.)
        const ord = new Array(N);
        for (let i = 0; i < N; i++) { ord[i] = i; area[i] = 1.0; }
        ord.sort((a, b) => h[b] - h[a]);
        for (let i = 0; i < N; i++) this.order[i] = ord[i];

        for (let k = 0; k < N; k++) {
            const i = this.order[k];
            const t = flow[i];
            if (t >= 0) area[t] += area[i];
        }
    }

    // ---------- Render ----------

    render(ctx) {
        const W = this.W, H = this.H;
        const h = this.h, area = this.area;
        const sl = this.params.seaLevel;
        const img = ctx.createImageData(W, H);
        const data = img.data;

        const SHADE_GAIN = 8.0;
        const pal = PALETTES[this.palette] || PALETTES.marsh;
        const isMono = this.palette === 'mono';
        const isFlow = this.palette === 'flow';

        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const idx = j * W + i;
                const e = h[idx];
                const a = area[idx] || 1;

                // Hillshade from finite-difference slope (light from upper-left).
                const hL = i > 0 ? h[idx - 1] : e;
                const hU = j > 0 ? h[idx - W] : e;
                let sh = 0.55 + ((e - hL) + (e - hU)) * SHADE_GAIN;
                if (sh < 0.35) sh = 0.35;
                if (sh > 1.18) sh = 1.18;

                let r, g, b;

                if (isMono) {
                    const v = clamp255(((e - sl + 0.4) * 255) | 0);
                    r = g = b = v;
                } else if (isFlow) {
                    // Drainage-area heatmap (independent of elevation).
                    const t = Math.min(1, Math.log10(a + 1) / 3.5);
                    r = (16  + t * 235) | 0;
                    g = (8   + t * 170) | 0;
                    b = (44  + t * -28) | 0;
                } else {
                    const aT = Math.min(1, Math.log10(a + 1) / 3.5);
                    if (e <= sl) {
                        // Water: lerp shallow→deep, then darken with drainage.
                        const depth = Math.min(1, (sl - e) * 6);
                        const c = lerpStops(pal.water, 1 - depth);
                        const k = 1 - aT * 0.30 * pal.channelTint;
                        r = c[0] * k; g = c[1] * k; b = c[2] * k;
                    } else {
                        // Land: lerp wet→dry by dryness, then darken creek lines.
                        const dryness = Math.min(1, (e - sl) * 2.6);
                        const c = lerpStops(pal.land, dryness);
                        let k = 1;
                        if (a > 30) {
                            k = 1 - Math.min(0.4, Math.log10(a) / 10) * pal.channelTint;
                        }
                        r = c[0] * k * sh;
                        g = c[1] * k * sh;
                        b = c[2] * k * sh;
                    }
                }

                const di = idx * 4;
                data[di]     = clamp255(r);
                data[di + 1] = clamp255(g);
                data[di + 2] = clamp255(b);
                data[di + 3] = 255;
            }
        }

        ctx.putImageData(img, 0, 0);
    }
}

// ---------- Palette helpers ----------

function clamp255(v) {
    if (!(v === v)) return 0;          // NaN
    v = v | 0;
    return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Linear interpolation between colour stops [t, [r,g,b]].
function lerpStops(stops, t) {
    if (t <= stops[0][0]) return stops[0][1];
    const last = stops[stops.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 0; i < stops.length - 1; i++) {
        const [t0, c0] = stops[i];
        const [t1, c1] = stops[i + 1];
        if (t <= t1) {
            const u = (t - t0) / (t1 - t0);
            return [
                c0[0] + (c1[0] - c0[0]) * u,
                c0[1] + (c1[1] - c0[1]) * u,
                c0[2] + (c1[2] - c0[2]) * u,
            ];
        }
    }
    return last[1];
}

// Each palette: water stops (0=deep → 1=shallow), land stops (0=wet → 1=dry),
// channelTint = how strongly drainage area darkens the colour.
const PALETTES = {
    marsh: {
        water: [
            [0, [ 78, 100,  82]],
            [1, [120, 142, 110]],
        ],
        land: [
            [0,    [126, 148,  98]],
            [0.55, [170, 178, 118]],
            [1,    [206, 198, 142]],
        ],
        channelTint: 0.55,
    },
    emerald: {
        water: [
            [0, [ 10,  46,  56]],
            [1, [ 56, 156, 152]],
        ],
        land: [
            [0,    [ 60, 168, 132]],
            [0.5,  [168, 220, 110]],
            [1,    [248, 238, 156]],
        ],
        channelTint: 0.55,
    },
    sunset: {
        water: [
            [0, [ 36,  20,  78]],
            [1, [134,  62, 134]],
        ],
        land: [
            [0,    [206,  82, 122]],
            [0.45, [240, 142,  82]],
            [1,    [253, 244, 178]],
        ],
        channelTint: 0.45,
    },
    lagoon: {
        // Cool teal water, jade marsh, pale gold highs — painterly tropical feel.
        water: [
            [0, [ 14,  64,  90]],
            [1, [ 80, 178, 196]],
        ],
        land: [
            [0,    [ 82, 168, 138]],
            [0.5,  [188, 212, 132]],
            [1,    [240, 220, 158]],
        ],
        channelTint: 0.55,
    },
    topo: {
        // Hypsometric: deep blue → cyan → green → yellow → orange.
        water: [
            [0, [ 22,  46,  92]],
            [1, [ 92, 168, 208]],
        ],
        land: [
            [0,   [150, 196, 132]],
            [0.3, [214, 218, 132]],
            [0.6, [226, 176, 102]],
            [1,   [220, 130,  90]],
        ],
        channelTint: 0.45,
    },
    nocturne: {
        // Indigo channels, bone-white marsh — high contrast night map.
        water: [
            [0, [ 16,  20,  46]],
            [1, [ 60,  78, 138]],
        ],
        land: [
            [0,   [ 80,  92, 130]],
            [0.6, [180, 178, 188]],
            [1,   [240, 232, 218]],
        ],
        channelTint: 0.40,
    },
};
