// ─────────────────────────────────────────────────
// Shared application state
// ─────────────────────────────────────────────────

export const PARAM_MIN = 0.01;
export const PARAM_MAX = 0.49;

export const PAIR_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];
export const PAIR_HEX = [0xff6b6b, 0xffd93d, 0x6bcb77, 0x4d96ff];
export const CREASE_HEX = 0xc084fc;

// Polygon parameters (distance from each edge midpoint inward)
export const params = { a: 0.1, b: 0.1, c: 0.1, d: 0.1 };

// Corner coordinates (V0, V1, V2, V3)
export const corners = [
    [0, 0], // V0
    [1, 0], // V1
    [1, 1], // V2
    [0, 1]  // V3
];

// Independent fold angles for the four flaps (radians, 0 = flat, π = fully folded)
export const foldAngles = [0, 0, 0, 0];

// Diagonal crease: 'none' | 'ac' | 'bd'
export let creaseType = 'none';
export function setCreaseType(t) { creaseType = t; }

// Crease fold angle (radians, can be negative)
export let creaseAngle = 0;
export function setCreaseAngle(a) { creaseAngle = a; }

// Observer pattern
const listeners = [];
export function onChange(fn) { listeners.push(fn); }
export function notify() { listeners.forEach(fn => fn()); }
