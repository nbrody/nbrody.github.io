/**
 * The look of a selection: glowing tubes along edges and beads at vertices,
 * lit by a small shader of their own. Each is drawn twice — solid where it is
 * in front of the domain, faint where the domain hides it — under a soft
 * additive halo. Pulses run along an edge tube in the direction the gluing
 * carries it (the coordinate comes from gluing.js, so they run in step across
 * an edge cycle), and the halos of a vertex class breathe together.
 */
import * as THREE from 'three';
import { tubeGeometry } from './overlays.js';
import { toWorld, view } from './scene.js';

const clock = { value: 0 };
function tick() { clock.value = performance.now() / 1000; }

const PULSE_SPACING = 0.55;    // hyperbolic length between pulses
const PULSE_SPEED = 0.6;       // pulses per second

const VS = `
varying vec3 vN;
varying vec3 vV;
#ifdef FLOW
attribute float a_s;
varying float vS;
#endif
void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
#ifdef FLOW
    vS = a_s;
#endif
    gl_Position = projectionMatrix * mv;
}`;

const CORE_FS = `
uniform vec3 u_color;
uniform vec3 u_hot;
uniform float u_opacity;
uniform float u_flow;
uniform float u_time;
varying vec3 vN;
varying vec3 vV;
#ifdef FLOW
varying float vS;
#endif
void main() {
    vec3 N = normalize(vN), V = normalize(vV);
    vec3 L = normalize(vec3(0.35, 0.6, 1.0));
    float ndl = max(dot(N, L), 0.0), ndv = max(dot(N, V), 0.0);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 42.0);
    float rim = pow(1.0 - ndv, 3.0);
    vec3 col = u_color * (0.4 + 0.6 * ndl) + u_hot * rim * 0.45 + vec3(0.55 * spec);
#ifdef FLOW
    // A comet every PULSE_SPACING: sharp head in the direction of travel,
    // soft tail; faded out where the pulses crowd below a pixel.
    float x = vS / ${PULSE_SPACING.toFixed(3)} - u_time * ${PULSE_SPEED.toFixed(3)};
    float ph = fract(x), w = fwidth(x);
    float comet = pow(ph, 3.0) * (1.0 - smoothstep(1.0 - 2.5 * w - 0.06, 1.0, ph));
    col = mix(col, u_hot, comet * u_flow * clamp(1.0 - (w - 0.2) / 0.3, 0.0, 1.0));
#endif
    gl_FragColor = vec4(col, u_opacity);
}`;

const HALO_FS = `
uniform vec3 u_color;
uniform float u_opacity;
uniform float u_breathe;
uniform float u_time;
varying vec3 vN;
varying vec3 vV;
void main() {
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float b = 1.0 - u_breathe * (0.5 + 0.5 * sin(u_time * 3.2));
    gl_FragColor = vec4(u_color, pow(ndv, 2.2) * u_opacity * b);
}`;

// Hex as written: these shaders output sRGB directly, like the domain's.
const raw = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

/**
 * Styles. `radius` is the ball-model radius at the centre (it shrinks with
 * the hyperbolic metric), `flow` the pulse strength, `halo` the glow opacity,
 * `breathe` how much it swells and fades, `hidden` the opacity behind the
 * domain, `order` the render order (the selection over its class).
 */
const STYLES = {
    dark: {
        edge: { color: 0xfacc15, hot: 0xfffbe6, glow: 0xfacc15, radius: 0.016, opacity: 1, hidden: 0.4, flow: 1, halo: 0.3, order: 9 },
        edgeGlued: { color: 0xa88a4a, hot: 0xe9cf8a, glow: 0xb7791f, radius: 0.0072, opacity: 0.5, hidden: 0.12, flow: 0.45, halo: 0, order: 7 },
        vertex: { color: 0xfbbf24, hot: 0xfff7d6, glow: 0xf59e0b, radius: 0.034, opacity: 1, hidden: 0.36, halo: 0.55, breathe: 0.35, order: 10 },
        vertexGlued: { color: 0xa88a4a, hot: 0xe9cf8a, glow: 0xb7791f, radius: 0.016, opacity: 0.6, hidden: 0.14, halo: 0.12, breathe: 0.35, order: 8 },
        cert: { color: 0xfde047, hot: 0xfffbe6, glow: 0xfacc15, radius: 0.016, opacity: 1, hidden: 0.34, flow: 0, halo: 0.25, order: 9 },
    },
    light: {
        edge: { color: 0xeab308, hot: 0xfff7cc, glow: 0xca8a04, radius: 0.016, opacity: 1, hidden: 0.45, flow: 1, halo: 0.25, order: 9 },
        edgeGlued: { color: 0xa98a3f, hot: 0xf5deb3, glow: 0x92400e, radius: 0.0072, opacity: 0.5, hidden: 0.14, flow: 0.45, halo: 0, order: 7 },
        vertex: { color: 0xf59e0b, hot: 0xfff1cc, glow: 0xd97706, radius: 0.034, opacity: 1, hidden: 0.42, halo: 0.4, breathe: 0.35, order: 10 },
        vertexGlued: { color: 0xa98a3f, hot: 0xf5deb3, glow: 0x92400e, radius: 0.016, opacity: 0.6, hidden: 0.16, halo: 0.1, breathe: 0.35, order: 8 },
        cert: { color: 0xeab308, hot: 0xfff7cc, glow: 0xca8a04, radius: 0.016, opacity: 1, hidden: 0.4, flow: 0, halo: 0.18, order: 9 },
    },
};

export function highlightStyle(name, overrides = null) {
    const s = STYLES[view.theme === 'light' ? 'light' : 'dark'][name];
    return overrides ? { ...s, ...overrides } : s;
}

function coreMaterial(st, hidden, flow) {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_color: { value: raw(st.color) }, u_hot: { value: raw(st.hot) },
            u_opacity: { value: hidden ? st.hidden : st.opacity },
            u_flow: { value: flow ? st.flow : 0 }, u_time: clock,
        },
        defines: flow ? { FLOW: 1 } : {},
        vertexShader: VS, fragmentShader: CORE_FS,
        transparent: true, depthWrite: false, depthTest: true,
        // The hidden pass draws only what lies behind the domain's surface.
        depthFunc: hidden ? THREE.GreaterDepth : THREE.LessEqualDepth,
    });
}

function haloMaterial(st) {
    const light = view.theme === 'light';
    return new THREE.ShaderMaterial({
        uniforms: {
            u_color: { value: raw(st.glow) }, u_opacity: { value: st.halo },
            u_breathe: { value: st.breathe || 0 }, u_time: clock,
        },
        vertexShader: VS, fragmentShader: HALO_FS,
        transparent: true, depthWrite: false, depthTest: false,
        blending: light ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
}

/** Solid + hidden passes of one geometry (the hidden pass shares it). */
function addCore(group, geom, st, flow) {
    for (const hidden of [true, false]) {
        const m = new THREE.Mesh(geom, coreMaterial(st, hidden, flow));
        m.renderOrder = st.order + (hidden ? 0 : 1);
        m.onBeforeRender = tick;
        group.add(m);
    }
}

/** Radius factor at ball point p: the metric's, gently, with a floor near the sphere at infinity. */
const metricScale = (p) => Math.max(0.12, Math.sqrt(Math.max(0, 1 - p.lengthSq())));

/** World radius of a bead of ball radius r at p (the UHS map is conformal: factor 2t/(1−|p|²)). */
function beadRadius(p, r) {
    const R = r * metricScale(p);
    if (view.model !== 'uhs') return R;
    const t = toWorld(p).y, d = 1 - p.lengthSq();
    return d > 1e-9 ? R * 2 * t / d : 0;
}

/**
 * A glowing tube along the ball polyline `pts`. `s` (one number per point, or
 * null) is the pulse coordinate; `ends` = [start, end] says which ends get a
 * round cap (the finite ones).
 */
export function glowEdge(group, pts, s, st, ends = [true, true]) {
    if (pts.length < 2) return;
    const flow = !!(s && st.flow);
    const core = tubeGeometry([pts], {
        radius: st.radius, sides: 16, profile: metricScale, along: flow ? [s] : null
    });
    if (!core) return;
    addCore(group, core, st, flow);
    if (st.halo > 0) {
        // Wider and fading out at the ends, so the glow has no hard rim.
        const halo = tubeGeometry([pts], {
            radius: st.radius * 3.2, sides: 16,
            profile: (p, i, m) => metricScale(p) * Math.sqrt(Math.min(1, 5 * Math.min(i, m - 1 - i) / (m - 1)))
        });
        if (halo) {
            const h = new THREE.Mesh(halo, haloMaterial(st));
            h.renderOrder = st.order - 1;
            group.add(h);
        }
    }
    ends.forEach((on, k) => { if (on) glowBead(group, pts[k ? pts.length - 1 : 0], { ...st, radius: st.radius * 1.15, halo: 0 }); });
}

/** A glowing bead at ball point p. */
export function glowBead(group, p, st) {
    const r = beadRadius(p, st.radius);
    if (!(r > 0)) return;
    const w = toWorld(p);
    const core = new THREE.SphereGeometry(r, 28, 18);
    core.translate(w.x, w.y, w.z);
    addCore(group, core, st, false);
    if (st.halo > 0) {
        const halo = new THREE.SphereGeometry(r * 2.8, 28, 18);
        halo.translate(w.x, w.y, w.z);
        const h = new THREE.Mesh(halo, haloMaterial(st));
        h.renderOrder = st.order - 1;
        group.add(h);
    }
}
